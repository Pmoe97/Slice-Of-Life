// ===== SECTION: DRIVES =====
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
  let clothingState = null;
  let clothingRestore = false;
  let updatedNpc = npc;

  const block = resolved.block;
  const location = resolved.location;

  for (const [driveId, drive] of Object.entries(DRIVE_DEFS)) {
    // Block filter
    if (drive.blockFilter && !drive.blockFilter.includes(block)) continue;

    // Gate check
    if (!checkDriveGates(drive, updatedNpc)) continue;

    // Cooldown check
    if (isOnCooldown(updatedNpc, driveId, currentTick)) continue;

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

    // Move to common area
    if (drive.moveToCommon && !location) {
      // Will be handled by caller — signal with a flag
      activityOverride = drive.activityOverride || 'hanging out';
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
    // existing in defs.world.js.
    if (drive.emptiesHamper) {
      for (const bucket of Object.values(gameState.objects || {})) {
        for (const obj of Object.values(bucket)) {
          if (obj.defId === 'laundry_hamper' && obj.state?.fill !== 'empty') {
            obj.state = { ...obj.state, fill: 'empty' };
          }
        }
      }
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

  return { updatedNpc, events, imMessages, relDeltas, activityOverride, clothingState, clothingRestore };
}

// Process queued IM messages — adds them to the computer IM threads
// without triggering LLM replies (NPC-initiated texts are one-way here;
// the player can reply via the IM app, which goes through sendImMessage).
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
        gameState.npcs[rd.a] = applyRelDelta(npc, rd.deltas);
      }
    } else {
      // NPC-to-NPC: update castWeb
      web = applyNpcToNpcDelta(web, rd.a, rd.b, rd.deltas);
    }
  }
  gameState.world.castWeb = web;
}

// ===== /SECTION: DRIVES =====
