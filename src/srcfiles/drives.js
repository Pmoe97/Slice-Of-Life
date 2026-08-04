// ===== SECTION: DRIVES =====
// NPC autonomy drives (Apartment Expansion v2 — Mirrored H).
// NPC Autonomy (P7). Evaluates DRIVE_DEFS during resolveTick to produce
// deterministic, zero-LLM NPC behaviors: self-care, chores, NPC-to-NPC
// social interaction, NPC-to-player IM texts, and reactions to player
// presence. All effects route through the same applyEffects pipeline as
// player actions and LLM proposals — drives are trusted producers, so
// they skip validateEffects (see effects.js header).
//
// Drives fire inside resolveTick, which must stay synchronous and pure.
// IM messages are queued (not sent) — the actual LLM reply happens later
// in advanceAndResolve's event processing, outside the tick.

function checkDriveGates(drive, npc) {
  for (const gate of drive.gates || []) {
    const val = npc.needs[gate.need];
    if (val === undefined) return false;
    if (gate.op === 'below' && !(val < gate.threshold)) return false;
    if (gate.op === 'above' && !(val > gate.threshold)) return false;
  }
  return true;
}

function isOnCooldown(npc, driveId, currentTick) {
  const cooldowns = npc.flags?.[DRIVE_COOLDOWN_KEY] || {};
  const last = cooldowns[driveId];
  if (last === undefined) return false;
  const def = DRIVE_DEFS[driveId];
  const cd = def.cooldownTicks || 0;
  return currentTick - last < cd;
}

function setCooldown(npc, driveId, currentTick) {
  const cooldowns = { ...(npc.flags?.[DRIVE_COOLDOWN_KEY] || {}) };
  cooldowns[driveId] = currentTick;
  return { ...npc, flags: { ...npc.flags, [DRIVE_COOLDOWN_KEY]: cooldowns } };
}

// Evaluate all drives for a single NPC during a tick. Returns:
// { npcUpdates, events, imMessages, relDeltas, activityOverride, clothingState }
function evaluateDrives(npc, npcId, npcs, resolved, gameState, rng, currentTick) {
  const events = [];
  const imMessages = [];
  const relDeltas = [];
  let activityOverride = null;
  let locationOverride = null;
  let clothingState = null;
  let clothingRestore = false;
  let updatedNpc = npc;

  const block = resolved.block;
  const location = resolved.location;
  const peepResults = [];

  for (const [driveId, drive] of Object.entries(DRIVE_DEFS)) {
    // Block filter
    if (drive.blockFilter && !drive.blockFilter.includes(block)) continue;

    // Renovation overhaul (Phase 2): a drive that targets a facility under
    // construction (active renovation job) can't fire — the crew is in the
    // room, so the NPC can't use it, mirroring the player's action gate.
    // Reuses MAINTENANCE.npcDecayActions as the drive→facility table (the
    // same ids decayFacilityCondition below decays). A drive with no entry
    // here has no facility association, so nothing to block (v1 scope).
    const decayFacilities = MAINTENANCE.npcDecayActions[driveId];
    if (decayFacilities && decayFacilities.some(fid => !isFacilityFunctional(gameState, fid))) continue;

    // Gate check
    if (!checkDriveGates(drive, updatedNpc)) continue;

    // Cooldown check
    if (isOnCooldown(updatedNpc, driveId, currentTick)) continue;

    // Phase 6: NPC peep drive — custom resolution path. The standard
    // weight roll is replaced by a personality-gated condition check +
    // computed chance roll. On success, resolveNpcPeep handles the
    // stealth/perception contest. Detected peeps produce events that
    // advanceAndResolve surfaces as a caught-peeping bubble.
    if (drive.isPeepDrive) {
      const peepResult = tryNpcPeep(updatedNpc, npcId, resolved, gameState, rng, currentTick);
      if (peepResult) {
        peepResults.push(peepResult);
        updatedNpc = setCooldown(updatedNpc, driveId, currentTick);
      }
      continue;
    }

    // BrineOS Phase 9: phone snooping. Same dispatch shape as isPeepDrive —
    // custom resolution replaces the weight roll, and a successful attempt
    // (silent, unlike a peep — nobody "catches" someone reading a phone
    // they found lying around, there's no player present to catch it) sets
    // the cooldown itself. Unsuccessful attempts (gated out, or the roll
    // failed) do NOT set a cooldown, matching tryNpcPeep's own behaviour —
    // the NPC didn't do anything, so nothing to rate-limit yet.
    if (drive.isSnoopDrive) {
      const snoopResult = trySnoopPhone(updatedNpc, npcId, resolved, gameState, rng, currentTick);
      if (snoopResult) {
        updatedNpc = setCooldown(updatedNpc, driveId, currentTick);
      }
      continue;
    }

    // Random roll against weight
    if (rng() > drive.weight) continue;

    // Set cooldown
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

    // Apply effects via applyEffects (trusted producer — no validation)
    if (drive.effects && drive.effects.length > 0) {
      const effCtx = buildEffectContext(
        gameState,
        [npcId],
        [npcId],
        {},
        []
      );
      // Remap 'self' to this npcId for ADJUST_NEED effects
      const effects = drive.effects.map(eff => {
        if (eff.params && eff.params.who === 'self') {
          return { ...eff, params: { ...eff.params, who: npcId } };
        }
        return eff;
      });
      applyEffects(effects, effCtx);
    }

    // Phase 5: meter utility usage for drives that consume utilities —
    // NPC behaviour must show up on the bills (the whole point of
    // metering). `meters` on a DRIVE_DEFS entry is the same shape as on
    // ACTION_DEFS: [[meterKey, amount], ...]. A roommate who takes long
    // showers or does laundry shows up in your bank account.
    if (drive.meters) {
      for (const [key, amt] of drive.meters) {
        recordUtilityUsage(gameState, key, amt);
      }
    }

    // Phase 9: NPC actions decay facility condition too. A full house
    // degrades facilities faster — the roommate-friction beat. A daily
    // gym user is wearing out equipment everyone paid for.
    if (decayFacilities) {
      for (const facilityId of decayFacilities) {
        decayFacilityCondition(gameState, facilityId);
      }
    }

    // Activity override
    if (drive.activityOverride) {
      activityOverride = drive.activityOverride;
    }

    // Clothing state
    if (drive.setsClothing) {
      clothingState = drive.setsClothing;
    }
    if (drive.restoresClothing) {
      clothingRestore = true;
    }

    // Move to common area — actually relocate the NPC to a common room
    // rather than just relabeling their activity while they stay put.
    if (drive.moveToCommon && !location) {
      const candidates = COMMON_ROOMS.map(roomId => {
        const occCount = getPresentNpcIds(npcs, roomId).length;
        const capacity = ROOMS[roomId].capacity;
        const weight = occCount >= capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
        return { roomId, weight };
      });
      const picked = weightedPick(rng, candidates, c => c.weight);
      if (picked) locationOverride = picked.roomId;
      activityOverride = drive.activityOverride || 'hanging out';
    }

    // NPC Overhaul Phase 6 — move to a comfortable room for seek_comfort
    if (drive.moveToComfort) {
      // Prefer living room (entertainment) or own bedroom
      const ownRoom = updatedNpc.residency?.room;
      const comfortRooms = ['living_room', ownRoom].filter(r => r && r !== location);
      if (comfortRooms.length > 0) {
        const picked = comfortRooms[Math.floor(rng() * comfortRooms.length)];
        if (picked && picked !== location) locationOverride = picked;
      }
      // NPC Overhaul Phase 6 — move to a comfortable room for seek_comfort
      // Audit Fix: removed dead `if (!activityOverride)` guard —
      // seek_comfort already sets activityOverride='relaxing' above.
      activityOverride = drive.activityOverride || 'relaxing';
    }

    // Clean room — reuses COMPUTER's cleanRoomObjects (same function the
    // hired housekeeper uses) instead of reimplementing the dirty-state
    // convention here. The version this replaced checked obj.dirtyWhen
    // (that lives on OBJECT_DEFS[obj.defId], not the instance) and
    // obj.state === 'dirty' (obj.state is a keyed object, e.g. {made:
    // 'unmade'}, never that bare string) — the condition could never be
    // true, so this drive did nothing mechanical the whole time it
    // existed. cleanRoomObjects also refreshes room cleanliness, which
    // the old version never did either.
    if (drive.cleansRoom && location) {
      cleanRoomObjects(gameState, location);
    }

    // Empty the shared laundry hamper, wherever it is — do_laundry has no
    // location requirement of its own (an NPC can decide to do laundry
    // from any room), so this searches every bucket rather than just the
    // current room. Previously do_laundry had zero mechanical effect
    // despite a real, resettable target object (laundry_hamper.state.fill)
    // existing in defs.world.js. Skip if the hamper is already empty —
    // no point "doing laundry" with nothing to wash.
    if (drive.emptiesHamper) {
      let found = false;
      for (const bucket of Object.values(gameState.objects || {})) {
        for (const obj of Object.values(bucket)) {
          if (obj.defId === 'laundry_hamper' && obj.state?.fill !== 'empty') {
            obj.state = { ...obj.state, fill: 'empty' };
            found = true;
          }
        }
      }
      if (!found) continue; // nothing to wash — skip this drive entirely
    }

    // NPC-to-NPC social interaction
    if (drive.npcToNpc) {
      const otherIds = Object.keys(npcs).filter(id =>
        id !== npcId &&
        npcs[id].residency.status === 'resident' &&
        npcs[id].location === location &&
        !isOnCooldown(npcs[id], driveId, currentTick)
      );
      if (otherIds.length > 0) {
        const otherId = otherIds[Math.floor(rng() * otherIds.length)];
        if (drive.relDelta) {
          relDeltas.push({ a: npcId, b: otherId, deltas: drive.relDelta });
        }
        events.push({
            day: gameState.meta.clock.day,
            tick: currentTick,
            roomId: location,
            npcId,
            type: 'npc_chat',
            moodDelta: drive.eventMood || 0,
            data: { other: otherId },
            template: `{name} and {other} were chatting in the ${ROOMS[location]?.name || 'room'}.`,
            seenByPlayer: false,
        });
      }
    }

    // NPC-to-player IM
    if (drive.sendsIm) {
      const template = drive.imTemplates[Math.floor(rng() * drive.imTemplates.length)];
      imMessages.push({ npcId, text: template });
      // Also satisfies some social need
      const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
      applyEffects([{ type: 'ADJUST_NEED', params: { who: npcId, need: 'social', delta: 10 } }], effCtx);
    }

    // React to player presence
    if (drive.reactsToPlayer) {
      const playerRoom = gameState.player.location;
      if (playerRoom === location) {
        const mood = updatedNpc.mood;
        if (mood < (drive.moodThresholds?.low || -0.2)) {
          relDeltas.push({ a: npcId, b: 'player', deltas: drive.relDeltaLow || { tension: 0.01 } });
        } else if (mood > (drive.moodThresholds?.high || 0.3)) {
          relDeltas.push({ a: npcId, b: 'player', deltas: drive.relDeltaHigh || { affection: 0.01 } });
        }
      }
    }

    // Generic event for drives with eventTemplate
    if (drive.eventTemplate && !drive.npcToNpc) {
      const evt = {
        day: gameState.meta.clock.day,
        tick: currentTick,
        roomId: location,
        npcId,
        type: driveId,
        moodDelta: drive.eventMood || 0,
        data: {},
        template: drive.eventTemplate,
        seenByPlayer: false,
      };
      if (drive.cleansRoom && location) {
        evt.data.room = ROOMS[location]?.name || 'room';
      }
      events.push(evt);
    }
  }

  return { updatedNpc, events, imMessages, relDeltas, activityOverride, locationOverride, clothingState, clothingRestore, peepResults };
}

// --- Phase 6: NPC peep attempt ---
// Checks personality eligibility + player vulnerable state, then rolls
// against a computed chance. On success, calls resolveNpcPeep. Returns
// the peep result for the caller to surface (detected → bubble, silent →
// nothing visible to player). Returns null if the attempt doesn't fire.
function tryNpcPeep(npc, npcId, resolved, gameState, rng, currentTick) {
  const t = npc.bible.temperament;
  const cfg = NPC_PEEP_TUNING;

  // Personality gate: curious (high openness + low conscientiousness)
  // OR attracted (high affection toward player)
  const curiosity = t.openness * cfg.chanceModifiers.openness + (1 - (t.conscientiousness + 1) / 2) * cfg.chanceModifiers.lowConscientiousness;
  const attraction = (npc.relPlayer?.affection || 0) * cfg.chanceModifiers.affection;

  if (curiosity < 0.15 && attraction < 0.1) return null;

  // Player must be in a vulnerable state
  const playerState = getPlayerVulnerableState(gameState);
  if (!playerState) return null;

  // NPC must not be in the same room as the player (they're peeping FROM
  // outside the door, not already inside)
  if (resolved.location === gameState.player.location) return null;

  // NPC must be in a room adjacent to the player's room — peeping from
  // the kitchen while the player is in the bedroom makes no sense.
  // The hallway is adjacent to all rooms; bedrooms/bathroom are only
  // adjacent to the hallway (you peep from outside the door).
  const playerRoom = gameState.player.location;
  const npcRoom = resolved.location;
  if (!isRoomAdjacent(npcRoom, playerRoom)) return null;

  // Compute chance: base + personality modifiers
  let chance = cfg.baseChance + curiosity + attraction;

  // Roll
  if (rng() > chance) return null;

  // Attempt the peep — resolveNpcPeep handles the stealth/perception contest
  return resolveNpcPeep(gameState, npcId, playerState);
}

// BrineOS Phase 9 (plan 9.2/9.3): can this NPC find and go through the
// player's phone right now? Reuses tryNpcPeep's curiosity formula
// (openness/low-conscientiousness/affection) plus a first-ever mechanical
// read of personality.traits (previously prompt-flavour only) as a bonus,
// not a second gate — a "curious"-tagged NPC with unremarkable temperament
// numbers still has to clear minDrawn.
//
// Deliberately NOT the sim.js evidence-discovery pass (landmine L8) — that
// one only scans a room's OWNER in their OWN room, so a phone left in the
// player's own bedroom would never be found. This checks whatever room the
// NPC actually occupies this tick, no ownership requirement — a nosy
// roommate wandering into your room and finding it there is exactly the
// scenario the plan wants.
function trySnoopPhone(npc, npcId, resolved, gameState, rng, currentTick) {
  const t = npc.bible.temperament;
  const cfg = SNOOP_TUNING;

  const curiosity = t.openness * cfg.chanceModifiers.openness + (1 - (t.conscientiousness + 1) / 2) * cfg.chanceModifiers.lowConscientiousness;
  const attraction = (npc.relPlayer?.affection || 0) * cfg.chanceModifiers.affection;
  const traitBonus = (npc.bible.personality?.traits || []).includes('curious') ? cfg.chanceModifiers.curiousTrait : 0;
  const drawn = curiosity + attraction + traitBonus;
  if (drawn < cfg.minDrawn) return null;

  // The NPC must be alone with the phone — decision C's 'elsewhere' case
  // (the player is not in this room) is exactly the tension this exists
  // for. No "player catches them" contest like peeping has, because by
  // construction the player isn't there to catch anyone.
  const location = resolved.location;
  if (!location || location === gameState.player.location) return null;

  const bucket = gameState.objects?.[`room_${location}`];
  const phone = bucket && Object.values(bucket).find(o => o.defId === 'phone');
  if (!phone) return null;
  if (phone.state?.lock === 'locked') return null; // 9.1: locked mostly defeats this
  if (phone.evidence) return null;                  // L9: one record, not a growing pile

  if (rng() > cfg.baseChance + drawn) return null;

  return resolveSnoopPhone(gameState, npcId, phone);
}

// Writes the found-phone evidence record (a single slot — L9, not a
// per-photo list) and the snooping NPC's own consequences. Strength scales
// with what's actually on the phone (9.5) — a roll of photos and open IM
// threads is a bigger find than an empty one, the same "what you actually
// did shows up" instinct the utility-metering system applies to bills.
function resolveSnoopPhone(gameState, npcId, phone) {
  const day = gameState.meta.clock.day;
  const cfg = SNOOP_TUNING;

  const rollCount = gameState.world.phone?.camera?.roll?.length || 0;
  const threadCount = Object.keys(gameState.world.computer?.apps?.im?.threads || {}).length;
  const richness = Math.min(1, (rollCount + threadCount) / cfg.richnessNormalizer);
  const strength = clamp(cfg.baseStrength + richness * cfg.richnessStrengthBonus, 0, EFFECT_LIMITS.evidenceStrengthCap);

  phone.evidence = { kind: 'phone_contents', strength, day, discovered: false };

  // 'general' (SUSPICION_SUBJECTS) is currently read by nothing — the
  // confrontation trigger (ui.js) hardcodes 'boundary_violation' — so this
  // is a deliberately inert signal for now: the snooping NPC carries
  // private knowledge/guilt they didn't have before, available for a
  // future system, not wired to today's confrontation flow (see
  // SNOOP_TUNING's comment).
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  const lines = [
    `MEMORY_EPISODE ${npcId} Went through the phone left lying around — saw more than they should have.`,
    `ADJUST_SUSPICION ${npcId} general +${cfg.suspicionDelta}`,
  ];
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  applyEffects(effects, effCtx);

  return { npcId, strength };
}

// Room adjacency: ROOM_ADJACENCY is now a first-class CONFIG constant
// (config.js). isRoomAdjacent is used by the peep system (tryNpcPeep) and
// the floor plan visual (render.js). Self-adjacency (same room) returns
// true as a convenience for callers that check "are these the same or
// adjacent".
function isRoomAdjacent(roomA, roomB) {
  if (roomA === roomB) return true;
  const adj = ROOM_ADJACENCY[roomA] || [];
  return adj.includes(roomB);
}

// Process queued IM messages — adds them to the computer IM threads
// without triggering LLM replies (NPC-initiated texts are one-way here;
// the player can reply via the IM app, which goes through resolveImReply).
function processNpcImMessages(gameState, messages) {
  for (const msg of messages) {
    const thread = ensureImThread(gameState, msg.npcId);
    thread.msgs.push({
      from: 'npc',
      text: msg.text,
      day: gameState.meta.clock.day,
      tick: getTickIndex(gameState.meta.clock.minutes),
    });
    thread.unread = (thread.unread || 0) + 1;
  }
}

// Apply NPC-to-NPC relationship deltas to the cast web
function processNpcRelDeltas(gameState, relDeltas) {
  let web = gameState.world.castWeb;
  for (const rd of relDeltas) {
    if (rd.b === 'player') {
      // NPC-to-player: update relPlayer on the NPC
      const npc = gameState.npcs[rd.a];
      if (npc) {
        gameState.npcs[rd.a] = applyRelDelta(npc, rd.deltas, gameState.meta.clock.day);
      }
    } else {
      // NPC-to-NPC: update castWeb
      web = applyNpcToNpcDelta(web, rd.a, rd.b, rd.deltas);
    }
  }
  gameState.world.castWeb = web;
}

// ===== /SECTION: DRIVES =====
