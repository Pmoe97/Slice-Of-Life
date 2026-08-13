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

// A gate is either about an internal state — `{ need, op, threshold }` — or,
// since the perception plan's Phase 5, about something the NPC can actually
// SENSE from where they are standing: `{ signal, op, threshold }`, where
// `signal` may be one id or a list (the strongest of the list is compared, so
// "any visible mess" is one gate rather than three).
//
// An unperceived signal reads as 0 rather than failing outright, which is the
// meaningful answer: a smell you cannot detect is, to you, no smell.
function driveGateValue(gate, npc, perceived) {
  if (gate.signal) {
    const wanted = Array.isArray(gate.signal) ? gate.signal : [gate.signal];
    let best = 0;
    for (const rec of perceived || []) {
      if (wanted.includes(rec.signalId) && rec.intensity > best) best = rec.intensity;
    }
    return best;
  }
  return npc.needs[gate.need];
}

// `opts.skipNeeds` is the cognition plan's D6: a NEED gate becomes a score term
// rather than a boolean, so the drive loop no longer excludes on it — COGNITION's
// checkHardGates passes this and is the live caller. A SIGNAL gate stays a hard
// exclusion either way: you cannot tidy mess you cannot perceive. Kept as one
// function rather than two nearly-identical loops so the two can never disagree
// about what "the strongest of this list" means.
//
// No shipped drive still declares a need gate (D14 deleted the last of them),
// but the branch stays as the guard that re-adding one cannot quietly re-impose
// the unreachable-threshold bug this plan exists to remove.
function checkDriveGates(drive, npc, perceived, opts = {}) {
  for (const gate of drive.gates || []) {
    if (opts.skipNeeds && gate.need) continue;
    const val = driveGateValue(gate, npc, perceived);
    if (val === undefined) return false;
    if (gate.op === 'below' && !(val < gate.threshold)) return false;
    if (gate.op === 'above' && !(val > gate.threshold)) return false;
  }
  return true;
}

// The two tables COGNITION's one scorer ranks against each other (initiative
// plan Phase 3, D1). A drive is something an NPC does to the world; an overture
// is something they direct at a person; everything that reads "the def for this
// candidate id" reads it through here, so neither table can acquire its own
// cooldown arithmetic or its own idea of what `utility` means. Ids are unique
// across both — the harness asserts it, because a collision would silently make
// one of them unreachable.
function candidateDef(id) {
  return DRIVE_DEFS[id] || OVERTURE_DEFS[id];
}

function isOnCooldown(npc, driveId, currentTick) {
  const cooldowns = npc.flags?.[DRIVE_COOLDOWN_KEY] || {};
  const last = cooldowns[driveId];
  if (last === undefined) return false;
  const def = candidateDef(driveId);
  const cd = (def && def.cooldownTicks) || 0;
  // currentTick is a 0..47 per-day index and wraps at midnight. A raw
  // `currentTick - last` reads a drive that fired late in the previous day as
  // permanently on cooldown: the delta is huge and negative, so it is always
  // below `cd` — measured at 51.5% of all cooldown stamps landing in that fatal
  // zone, which suppressed the self-directed action rate to ~0.157 at home.
  // All cooldownTicks are well under ticksPerDay, so a wrapped delta is exact.
  const since = currentTick >= last ? currentTick - last : currentTick + CLOCK.ticksPerDay - last;
  return since < cd;
}

function setCooldown(npc, driveId, currentTick) {
  const cooldowns = { ...(npc.flags?.[DRIVE_COOLDOWN_KEY] || {}) };
  cooldowns[driveId] = currentTick;
  return { ...npc, flags: { ...npc.flags, [DRIVE_COOLDOWN_KEY]: cooldowns } };
}

// Evaluate the drives for a single NPC during a tick. Returns:
// { updatedNpc, events, imMessages, relDeltas, activityOverride, locationOverride,
//   clothingState, peepResults }
// opts.isVisitor (external-world plan Phase 1) marks a visitor — an external
// NPC resolving through an active visit — whose drives are restricted to
// VISITOR_DRIVE_ALLOWLIST.
//
// COGNITION PLAN PHASE 2 — this used to walk DRIVE_DEFS in declaration order
// and roll `rng() > drive.weight` for each drive that passed its gates: twelve
// independent coin flips, most of them weighted 0.04–0.35, nothing comparing
// two candidates and nothing carrying across a tick. Measured, that produced an
// NPC who had something to do and did nothing 82.6% of the time (the plan's
// Evidence).
//
// It is now score → choose → commit. COGNITION's `scoreCandidates` ranks
// everything this NPC could do; `choosePursuit` takes the best one above
// COGNITION.actionThreshold; the winner resolves exactly as it always did; and
// `openPursuit` commits the NPC to it for `utility.holdTicks`. On a held tick
// the pursuit is NOT re-resolved — it re-applies its activity and its room and
// returns, which is what makes behaviour read as one person doing one thing
// rather than as a queue of coincidences.
//
// Exactly one drive can resolve per npc-tick now, so the `activityOverride`
// clobber the roadmap describes is impossible by construction (D3) rather than
// prevented by convention.
function evaluateDrives(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts = {}) {
  const events = [];
  const imMessages = [];
  const relDeltas = [];
  const factTransfers = [];
  const peepResults = [];
  let activityOverride = null;
  let locationOverride = null;
  let clothingState = null;

  let updatedNpc = npc;

  const block = resolved.block;
  const location = resolved.location;

  // Perception plan Phase 5: what this NPC can sense from where they are
  // standing this tick, through the SAME query the player's perception uses
  // (SIGNALS' perceiveSignals) — the divergence between them is the attention
  // term, never a second code path. Computed once per NPC per tick and handed
  // to the scorer and every gate below; ~75µs, so a five-resident household
  // costs well under a millisecond a tick.
  //
  // This is the line that turns NPCs from things that act on internal state
  // alone into things that act on the world they are in.
  const perceived = location ? mergePerceived(perceiveSignals(gameState, npcId, location)) : [];
  const ctx = { perceived, block, currentTick };

  const result = () => ({ updatedNpc, events, imMessages, relDeltas, factTransfers, activityOverride,
                          locationOverride, clothingState, peepResults });

  // --- 1. Score everything this NPC could do -----------------------------
  // scoreCandidates is pure and applies the same hard exclusions this loop used
  // to apply inline (block filter, visitor allowlist, facility under
  // construction, signal gates, cooldown) plus D15's candidacy conditions. It
  // is deliberately the ONLY filter now: a second copy here is exactly how the
  // five custom resolvers grew their own bypass of the weight roll without
  // anyone deciding the model had changed.
  const candidates = scoreCandidates(updatedNpc, npcId, gameState, resolved, perceived, opts);

  // --- 2. Is this NPC already in the middle of something? ----------------
  // resolveTick has already aged the pursuit by one tick, so anything still
  // here has ticks left to run.
  const held = updatedNpc.pursuit;
  if (held) {
    const breakReason = shouldBreakPursuit(updatedNpc, candidates, ctx);
    if (!breakReason) {
      // Carry on. No effects, no event, no cooldown — the action happened on
      // the tick the pursuit opened; these ticks are it still going on.
      if (held.activity) activityOverride = held.activity;
      if (held.roomId && held.roomId !== location) locationOverride = held.roomId;
      return result();
    }
    releasePursuit(gameState, npcId);
  }

  // --- 3. Choose one thing -----------------------------------------------
  const choice = choosePursuit(candidates);
  if (!choice) return result();

  // Initiative plan Phase 3 (D1): the one thing may be an OVERTURE — something
  // aimed at the player rather than at the world. It came out of the same
  // ranked list and the same chooser as every drive, so this is a branch on
  // what won, never a second decision. Returning here is what makes design
  // invariant 2 true: openPursuit is below, and this tick cannot reach it.
  //
  // The act itself is the crossing. There is no resolver, no effects and no
  // event — an approach produces LANGUAGE, and language is generated at the
  // moment it surfaces, on the player's time budget (D18). What the tick owes
  // is that the NPC is now standing in front of the player with a record
  // saying why.
  //
  // Phase 4 gives this branch three more channels and no more decisions. What
  // the def declares, this applies:
  //   awaitsAnswer  — a record, the walk and the hold, or none of the three.
  //   sendsText     — the one delivery that is a THING rather than a presence.
  //   emitsSignal   — the same field a DRIVE_DEFS entry carries, aimed at the
  //                   player's room rather than the actor's, because that is
  //                   where the person an overture is for is standing.
  // Nothing here is async and nothing reaches the model; a text's WORDS come
  // from a table, not a generation (R2/D18).
  const overture = chooseOverture(choice);
  if (overture) {
    const odef = OVERTURE_DEFS[overture.overtureId];
    const playerRoom = gameState.player && gameState.player.location;
    updatedNpc = setCooldown(updatedNpc, overture.overtureId, currentTick);

    if (odef.awaitsAnswer) {
      // Opened BEFORE the delivery below, so anything that reads the record
      // (the text line, the arrival narration) sees the shape openOverture
      // built rather than the choice it was built from.
      openOverture(gameState, npcId, overture);
      // Only the channels that come to you move. `waitAt: 'here'` is the
      // knock — they are at the door, and walking them into the room would be
      // walking them through it.
      if (odef.waitAt === 'player' && playerRoom && playerRoom !== location) locationOverride = playerRoom;
      if (odef.activityOverride) activityOverride = odef.activityOverride;
    }

    // A text is delivered and over: no record, no hold, no waiting. An NPC
    // frozen for two ticks because they sent a message would be D27's hold
    // applied to a channel that is not asking for anything.
    if (odef.sendsText) {
      const line = overtureTextLine(overture, rng);
      if (line) imMessages.push({ npcId, text: line });
    }

    if (odef.emitsSignal && playerRoom) {
      emitTransient(gameState, {
        id: odef.emitsSignal.signal,
        roomId: playerRoom,
        intensity: odef.emitsSignal.intensity,
        sourceId: npcId,
      });
    }
    return result();
  }

  const driveId = choice.driveId;
  const drive = DRIVE_DEFS[driveId];
  const decayFacilities = MAINTENANCE.npcDecayActions[driveId];

  // --- 4. Resolve it ------------------------------------------------------
  // The five custom resolvers keep their resolution logic and have lost their
  // selection logic (D10): tryNpcPeep still runs the stealth contest, tryEatFood
  // still decides what is in the fridge, but none of them decides any more
  // whether its drive happens. Their chance rolls are gone with the weight roll.
  //
  // The cooldown is set on the chosen drive whether or not the resolver
  // produced anything. Under the weight roll a resolver that came back null had
  // cost one roll and the NPC carried on down the list, so leaving the cooldown
  // unset was right. Under selection it has consumed the whole tick, and
  // re-choosing the same dead end every tick is a livelock — an NPC frozen on a
  // rot record whose object has already been binned.
  let acted = false;

  if (drive.isPeepDrive) {
    // Detected peeps produce events that advanceAndResolve surfaces as a
    // caught-peeping bubble; silent ones are invisible to the player.
    const peepResult = tryNpcPeep(updatedNpc, npcId, resolved, gameState);
    if (peepResult) { peepResults.push(peepResult); acted = true; }
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

  } else if (drive.isSnoopDrive) {
    // Silent, unlike a peep — nobody "catches" someone reading a phone they
    // found lying around, because by construction the player isn't in the room.
    if (trySnoopPhone(updatedNpc, npcId, resolved, gameState)) acted = true;
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

  } else if (drive.isEatDrive) {
    // Phase 8 (NPC inventories): a hungry NPC really consumes what it finds
    // (own bag, then the kitchen fridge/pantry), falling back to the abstract
    // scrounge only when every reachable source is empty.
    const eatResult = tryEatFood(updatedNpc, npcId, resolved, gameState, rng, drive);
    if (eatResult) {
      if (eatResult.locationOverride) locationOverride = eatResult.locationOverride;
      if (eatResult.activityOverride) activityOverride = eatResult.activityOverride;
      events.push(...eatResult.events);
      acted = true;
    }
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

  } else if (drive.isInvestigateDrive) {
    // Acting on a smell needs to know WHERE it is coming from, which only the
    // perceived record carries.
    const investigateResult = tryInvestigateSmell(updatedNpc, npcId, resolved, gameState, perceived);
    if (investigateResult) {
      if (investigateResult.locationOverride) locationOverride = investigateResult.locationOverride;
      if (investigateResult.activityOverride) activityOverride = investigateResult.activityOverride;
      events.push(...(investigateResult.events || []));
      acted = true;
    }
    // Phase 4: a walk leg is progress, not a finished act — the resolver's
    // own contract is \"the drive fires again next tick now that they are in
    // the room\". Phase 2's blanket cooldown-set broke that (the clearing
    // step could never happen), which only cost the cast on pre-existing rot;
    // this phase makes NPCs CREATE rot, so the dead step became a per-meal
    // routine. Skipping the cooldown on the walk lets the drive re-fire once
    // the pursuit has steered the NPC to the source room and actually clear
    // the thing they followed their nose to. The cooldown stays for a real
    // clearing AND for a dead end (null: a perceived record that outlives the
    // object it names — the livelock guard Phase 2's unconditional set
    // existed for).
    if (!investigateResult?.stillWalking) updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

  } else if (drive.isGiftDrive) {
    const giftResult = tryGiveGift(updatedNpc, npcId, resolved, gameState);
    if (giftResult) {
      if (giftResult.activityOverride) activityOverride = giftResult.activityOverride;
      events.push(...giftResult.events);
      acted = true;
    }
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);

  } else {
    acted = resolveStandardDrive(driveId, drive, {
      npcId, npcs, gameState, rng, currentTick, location, decayFacilities,
      events, imMessages, relDeltas, factTransfers,
      setActivity: (a) => { activityOverride = a; },
      setLocation: (l) => { locationOverride = l; },
      setClothing: (c) => { clothingState = c; },
      npc: updatedNpc,
    });
    updatedNpc = setCooldown(updatedNpc, driveId, currentTick);
  }

  // --- 5. Commit to it ----------------------------------------------------
  // openPursuit is the ONE writer of npc.pursuit (D3). Nothing is committed to
  // when the resolver came back empty — there is no activity to hold.
  if (acted) {
    openPursuit(gameState, npcId, {
      driveId,
      score: choice.score,
      startedTick: currentTick,
      roomId: locationOverride || location || null,
      activity: activityOverride || null,
      perceived,
    });
  }

  return result();
}

// --- Leaves: a drive's standing trace (npc-cognition-plan.md Phase 4) ----
// The standing-signal counterpart of emitTransient: `drive.leaves` declares
// what an act dirties, and the signal comes out of the dirty state for free
// via SIGNALS' deriveStandingSignals. Applied in the room the act happened —
// for standard drives the NPC's current room (beside the emitsSignal
// handler), for eat the kitchen (beside the cooking smell, only when they
// actually cooked). Shape: { objDefId: { stateKey: steps } }, where `steps`
// advances that state along its def-declared ladder and saturates at the last
// value — repeated acts accumulate (clean → few → many) instead of resetting
// to a fixed value that would lie after the first meal.
//
// Only objects with the def in that room are touched; a def with no instance
// there (a nap on the living-room couch leaves no unmade bed) is skipped. The
// room's DERIVED cleanliness is refreshed afterwards — the same D7 hook
// ACTIONS applies after a player action dirties an object, so an NPC-dirtied
// room stops reading clean to the cleanliness/mood systems.
function applyDriveLeaves(gameState, leaves, roomId) {
  if (!leaves || !roomId || !ROOMS[roomId]) return 0;
  const bucket = gameState.objects?.[`room_${roomId}`];
  if (!bucket) return 0;
  let changed = 0;
  for (const [defId, byState] of Object.entries(leaves)) {
    const def = OBJECT_DEFS[defId];
    if (!def?.states) continue;
    for (const [stateKey, stepsRaw] of Object.entries(byState)) {
      const ladder = def.states[stateKey];
      if (!Array.isArray(ladder) || ladder.length < 2) continue;
      const steps = Math.max(1, stepsRaw || 1);
      for (const obj of Object.values(bucket)) {
        if (obj.defId !== defId) continue;
        const cur = obj.state?.[stateKey];
        const idx = ladder.indexOf(cur);
        if (idx < 0) continue;               // not one of the ladder values → untouched
        const next = Math.min(idx + steps, ladder.length - 1);
        if (next === idx) continue;          // already at the dirtiest rung
        obj.state = { ...obj.state, [stateKey]: ladder[next] };
        changed++;
      }
    }
  }
  if (changed > 0) refreshRoomCleanliness(gameState, roomId);
  return changed;
}

// --- Expressions: a drive's emotional trace (npc-initiative-plan.md Phase 1) ---
// The third member of the footprint family. `emitsSignal` is what the act
// sounds like and `leaves` is what it leaves behind; `expresses` is what the
// NPC's MOOD does to the room while the act is happening. All three are
// applied side by side, so a drive's whole footprint reads in one place.
//
// D3 — an expression RIDES ALONG. This function emits a transient and does
// nothing else: it never touches the npc, never sets a cooldown, never opens a
// pursuit and never produces an event. That is what keeps Plan 3's
// one-action-per-tick guarantee intact — an NPC can sigh while doing laundry
// and cannot walk over to you while doing laundry. Returns the signal id it
// emitted, or null, which is what makes it measurable without storing anything.
//
// The sources a `when` clause may read. Phase 1 ships ONE, because `mood` is
// the only motivation source measured alive on a generated cast (see the
// plan's Evidence — the other four read exactly zero); the phases that make
// the rest live are the phases that should add them here, beside their reader.
// An unknown key fails CLOSED rather than passing vacuously: a condition
// nobody can evaluate is a config lie, and a silent never-fires is much easier
// to find than a silent always-fires.
const EXPRESSION_SOURCES = {
  mood: (npc) => npc?.mood,
};

// Does this rule's condition hold for this NPC right now? Pure.
// `when` is required and must name at least one known source — see the
// `expresses` header in config.js.
function expressionApplies(npc, when) {
  if (!when || typeof when !== 'object') return false;
  const keys = Object.keys(when);
  if (keys.length === 0) return false;
  for (const key of keys) {
    const read = EXPRESSION_SOURCES[key];
    if (!read) return false;
    const v = read(npc);
    if (typeof v !== 'number') return false;
    const cond = when[key] || {};
    if (cond.below !== undefined && !(v < cond.below)) return false;
    if (cond.above !== undefined && !(v > cond.above)) return false;
    if (cond.below === undefined && cond.above === undefined) return false;
  }
  return true;
}

// One expression per act, at most. `expresses` may be a single rule or an
// array in priority order — the FIRST match fires, which is how `eat` says
// "slam if it has been a genuinely bad day, otherwise hum" without the two
// competing for the same moment.
function applyDriveExpression(gameState, expresses, roomId, npc, npcId) {
  if (!expresses || !roomId || !ROOMS[roomId]) return null;
  const rules = Array.isArray(expresses) ? expresses : [expresses];
  for (const rule of rules) {
    if (!rule || !SIGNAL_DEFS[rule.signal]) continue;
    if (!expressionApplies(npc, rule.when)) continue;
    emitTransient(gameState, {
      id: rule.signal,
      roomId,
      intensity: rule.intensity,
      sourceId: npcId || null,
    });
    return rule.signal;
  }
  return null;
}

// The non-custom half of drive resolution — everything the old loop body did
// after the weight roll, for the one drive that won the tick. Split out so
// evaluateDrives reads as score → choose → commit rather than as a hundred
// lines of `if (drive.someFlag)` with the decision buried in the middle.
//
// Returns whether the drive actually did something. Writes back through the
// three setters so the caller keeps sole ownership of the overrides — there is
// exactly one drive per tick now, so nothing can clobber anything, and this
// keeps it that way by construction rather than by ordering.
function resolveStandardDrive(driveId, drive, c) {
  const { npc, npcId, npcs, gameState, rng, currentTick, location, decayFacilities,
          events, imMessages, relDeltas, factTransfers } = c;
  let activityOverride = null;
  let locationOverride = null;

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

  // Perception plan Phase 3: a drive with an audible or smellable signature
  // says so declaratively — `emitsSignal: { signal, intensity }` on the
  // DRIVE_DEFS entry — rather than each one being special-cased here. This
  // is the same shape ACTION_DEFS uses, so the player and an NPC doing the
  // same thing are heard the same way.
  if (drive.emitsSignal && location) {
    emitTransient(gameState, {
      id: drive.emitsSignal.signal,
      roomId: location,
      intensity: drive.emitsSignal.intensity,
      sourceId: npcId,
    });
  }

  // Cognition plan Phase 4 (traces): the STANDING-signal counterpart of the
  // emission above — what the act leaves behind rather than what it sounds
  // like. `drive.leaves` dirties declared objects in this room and the
  // resulting mess is DERIVED from the dirty state by deriveStandingSignals,
  // so the two live side by side and a drive's full footprint reads in one
  // place.
  if (drive.leaves && location) {
    applyDriveLeaves(gameState, drive.leaves, location);
  }

  // Initiative plan Phase 1 (expressions): the third half of the same
  // footprint — what the act sounds like, what it leaves behind, and what the
  // person doing it is feeling while they do it. Rides along: no cooldown, no
  // event, no pursuit, no tick (D3).
  if (drive.expresses && location) {
    applyDriveExpression(gameState, drive.expresses, location, npc, npcId);
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
  // Correctness plan Phase 4: `restoresClothing` is gone. It set a flag that
  // resolveTick applied in the same tick as setsClothing, cancelling it.
  // Reversion is TRANSIENT_CLOTHING's job, on the following tick.
  if (drive.setsClothing) {
    c.setClothing(drive.setsClothing);
  }

  // Move to common area — actually relocate the NPC to a common room
  // rather than just relabeling their activity while they stay put.
  if (drive.moveToCommon && !location) {
    const rooms = COMMON_ROOMS.map(roomId => {
      const occCount = getPresentNpcIds(npcs, roomId).length;
      const capacity = ROOMS[roomId].capacity;
      const weight = occCount >= capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
      return { roomId, weight };
    });
    const picked = weightedPick(rng, rooms, r => r.weight);
    if (picked) locationOverride = picked.roomId;
    activityOverride = drive.activityOverride || 'hanging out';
  }

  // NPC Overhaul Phase 6 — move to a comfortable room for seek_comfort
  if (drive.moveToComfort) {
    // Prefer living room (entertainment) or own bedroom
    const ownRoom = npc.residency?.room;
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
  // current room.
  //
  // Cognition Phase 2: this used to `continue` when the hamper was already
  // empty, which suppressed the log line ONLY — the effects, the meter charge,
  // the machine_running signal and the activity label had all already been
  // applied above, so "skip this drive entirely" was never what it did. Nothing
  // in the game fills the hamper today (Phase 4 is where NPC actions start
  // leaving traces), so keeping the guard would have made do_laundry — the
  // second most eligible drive in the cast — unreachable the moment selection
  // moved. The chore now happens either way and reads consistently.
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
    // Chat partners: residents AND active visitors physically in the same
    // room. A dormant visitor has location null, so the location check
    // alone excludes everyone not currently onsite — this is what lets a
    // roommate sharing a room with Del (or a visiting friend, Phase 6)
    // strike up a conversation with them (external-world plan Phase 1).
    // hasChatPartner (D15) runs this same filter at candidacy time, so by the
    // time we are here there is someone to talk to.
    const otherIds = Object.keys(npcs).filter(id =>
      id !== npcId &&
      (npcs[id].residency.status === 'resident' || npcs[id].residency.status === 'visitor') &&
      npcs[id].location === location &&
      !isOnCooldown(npcs[id], driveId, currentTick)
    );
    if (otherIds.length === 0) return false;
    const otherId = otherIds[Math.floor(rng() * otherIds.length)];
    if (drive.relDelta) {
      relDeltas.push({ a: npcId, b: otherId, deltas: drive.relDelta });
    }
    // Knowledge-gossip Phase 2 (D5 leg 1): the speaker raises 1-2 facts they
    // have reason to raise (D6); the partner stores them as told_by:<speaker>
    // with confidence × hopAttenuation (D2). The event carries data.raised +
    // data.topic so the scene line can name what actually moved. The writes
    // themselves are queued as factTransfers and applied by SIM's resolveTick
    // AFTER the whole drive loop, so a receiver evaluated earlier in the same
    // tick cannot have the write clobbered by its pre-fact npcUpdates memory
    // snapshot (the phase's top-of-phase edge). All synchronous, zero LLM (R2).
    const partner = npcs[otherId];
    const chatDay = gameState.meta.clock.day;
    const raised = partner ? pickFactsToRaise(npc, partner, TRANSMISSION.factsPerChat, chatDay, rng) : [];
    for (const f of raised) {
      factTransfers.push({ receiverId: otherId, fact: f, opts: { kind: 'told', provenance: `told_by:${npcId}`, sourceId: npcId, day: chatDay } });
    }
    const topic = raised.length > 0 ? factTopicPhrase(raised[0].text) : '';
    events.push({
        day: gameState.meta.clock.day,
        tick: currentTick,
        roomId: location,
        npcId,
        type: 'npc_chat',
        moodDelta: drive.eventMood || 0,
        data: {
          other: otherId,
          raised: raised.map(f => ({ text: f.text, provenance: f.provenance || 'witnessed' })),
          topic,
        },
        template: raised.length > 0
          ? `{name} and {other} were chatting about ${topic}.`
          : `{name} and {other} were chatting in the ${ROOMS[location]?.name || 'room'}.`,
        seenByPlayer: false,
    });
  }

  // NPC-to-player IM — GONE in the initiative plan's Phase 4 (D8/R8). Its one
  // writer, `text_player`, is an OVERTURE now, and it is delivered in
  // evaluateDrives' overture branch beside the other three channels' surfaces
  // rather than here. A `drive.sendsIm` reader with no drive that declares it
  // is precisely the dead-content class this roadmap exists to remove, so it
  // went with it; `imMessages` itself stays, because the overture branch still
  // fills it and SIM still drains it into the same threads.
  //
  // What did NOT come across: the +10 social the drive applied on top. Texting
  // is not motivated by loneliness any more (D5 keeps `utility.need` off this
  // whole table), so relieving loneliness as a side effect would be an effect
  // with no reason behind it — and none of the other three channels has one.

  // React to player presence. canReactToPlayer (D15) has already established
  // the player is in this room — without it this drive was a candidate on
  // every tick and did nothing on almost all of them.
  if (drive.reactsToPlayer) {
    const mood = npc.mood;
    if (mood < (drive.moodThresholds?.low || -0.2)) {
      relDeltas.push({ a: npcId, b: 'player', deltas: drive.relDeltaLow || { tension: 0.01 } });
    } else if (mood > (drive.moodThresholds?.high || 0.3)) {
      relDeltas.push({ a: npcId, b: 'player', deltas: drive.relDeltaHigh || { affection: 0.01 } });
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

  if (activityOverride) c.setActivity(activityOverride);
  if (locationOverride) c.setLocation(locationOverride);
  return true;
}

// --- Candidacy conditions (cognition plan Phase 2, D15) -------------------
// Four drives used to keep their real precondition INSIDE their resolver, and
// their `weight` was 0 because the resolver rolled its own chance. Under twelve
// independent coin flips a failed precondition cost one wasted roll. Under
// utility selection it costs the whole tick: snoop_phone was a candidate on
// 100% of npc-ticks at a flat 0.45 and would have won 54% of them, starving
// every drive that was genuinely motivated (the plan's section 5).
//
// So the precondition half of each resolver is extracted here as a PURE named
// predicate that both the resolver and COGNITION's candidacy filter call. Not
// copied — called, so the two can never disagree about when the drive is
// possible. What remains inside the resolver is resolution (D10): the stealth
// contest, which phone, which item.
//
// These run inside `scoreCandidates`, which is pure by assertion, so nothing
// here may write.

// Peeping needs a curious-or-attracted NPC, a player who is actually
// vulnerable right now, and the NPC standing outside — adjacent to the
// player's room, not in it. The hallway is adjacent to everything; bedrooms
// and bathrooms only to the hallway, so you peep from outside the door.
function canPeepPlayer(npc, location, gameState) {
  const cfg = NPC_PEEP_TUNING;
  // The curiosity half is SIM's npcCuriosity — the same function
  // getNpcPerception uses, extracted from the two identical inline copies that
  // used to live here and in trySnoopPhone.
  const curiosity = npcCuriosity(npc);
  const attraction = (npc.relPlayer?.affection || 0) * cfg.chanceModifiers.affection;
  if (curiosity < 0.15 && attraction < 0.1) return false;
  if (!getPlayerVulnerableState(gameState)) return false;
  if (!location || location === gameState.player.location) return false;
  return isRoomAdjacent(location, gameState.player.location);
}

// Snooping needs a phone the NPC could actually pick up: in the room they are
// standing in, unlocked, not already read once (L9), and the player not there
// to catch them. Returns the phone rather than a boolean so trySnoopPhone does
// not have to find it a second time.
function findSnoopablePhone(npc, location, gameState) {
  const cfg = SNOOP_TUNING;
  // SNOOP_TUNING's openness/lowConscientiousness weights are deliberately the
  // same numbers as NPC_PEEP_TUNING's, so sharing npcCuriosity loses nothing
  // and stops the two from drifting. traits is a first-ever mechanical read of
  // personality.traits (previously prompt-flavour only) as a bonus, not a
  // second gate — a "curious"-tagged NPC with unremarkable temperament numbers
  // still has to clear minDrawn.
  const drawn = npcCuriosity(npc)
    + (npc.relPlayer?.affection || 0) * cfg.chanceModifiers.affection
    + ((npc.bible?.personality?.traits || []).includes('curious') ? cfg.chanceModifiers.curiousTrait : 0);
  if (drawn < cfg.minDrawn) return null;

  // The NPC must be alone with the phone — decision C's 'elsewhere' case (the
  // player is not in this room) is exactly the tension this exists for. No
  // "player catches them" contest like peeping has, because by construction
  // the player isn't there to catch anyone.
  if (!location || location === gameState.player.location) return null;

  const bucket = gameState.objects?.[`room_${location}`];
  const phone = bucket && Object.values(bucket).find(o => o.defId === 'phone');
  if (!phone) return null;
  if (phone.state?.lock === 'locked') return null;   // 9.1: locked mostly defeats this
  if (phone.evidence) return null;                    // L9: one record, not a growing pile
  return phone;
}

// A gift takes real fondness AND something to give. Returns the stack
// tryGiveGift will hand over, highest-priority category first.
function giftableStack(npc) {
  const cfg = NPC_GIFT_TUNING;
  if ((npc.relPlayer?.affection || 0) < cfg.affectionThreshold) return null;
  const pickable = (npc.inventory || [])
    .filter(s => (s?.qty || 0) > 0 && !(s.meta?.keyItem) && !ITEM_DEFS[s.defId]?.keyItem)
    .sort((a, b) => {
      const ia = cfg.categoryOrder.indexOf(ITEM_DEFS[a.defId]?.category ?? '');
      const ib = cfg.categoryOrder.indexOf(ITEM_DEFS[b.defId]?.category ?? '');
      return (ia < 0 ? cfg.categoryOrder.length : ia) - (ib < 0 ? cfg.categoryOrder.length : ib);
    });
  return pickable[0] || null;
}

// Is there anyone in this room to chat TO? Mirrors the partner filter in the
// npcToNpc block below exactly — residents and onsite visitors in the same
// room who are not themselves on this drive's cooldown. A dormant visitor has
// location null, so the location check alone excludes everyone not currently
// here.
//
// Not one of D15's original four, but the same defect: without it an NPC
// "chatting with a roommate" alone in a room still banked the social restore
// and still wore the activity label. That cost one wasted roll in 5237 ticks
// under the old model and would have won 148 ticks under selection.
function hasChatPartner(npc, npcId, location, gameState, driveId, currentTick) {
  if (!location) return false;
  const npcs = gameState.npcs || {};
  return Object.keys(npcs).some(id =>
    id !== npcId &&
    (npcs[id].residency?.status === 'resident' || npcs[id].residency?.status === 'visitor') &&
    npcs[id].location === location &&
    !isOnCooldown(npcs[id], driveId, currentTick)
  );
}

// --- Phase 6: NPC peep attempt ---
// Resolution only, as of the cognition plan's Phase 2 (D10): the personality
// gate, the vulnerable-state check and the adjacency check all moved to
// canPeepPlayer above, and the `rng() > chance` roll is gone entirely — that
// roll WAS the selection this drive no longer does for itself. resolveNpcPeep
// handles the stealth/perception contest; detected peeps produce events that
// advanceAndResolve surfaces as a caught-peeping bubble.
function tryNpcPeep(npc, npcId, resolved, gameState) {
  const playerState = getPlayerVulnerableState(gameState);
  if (!playerState) return null;
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
function trySnoopPhone(npc, npcId, resolved, gameState) {
  // Everything that decides WHETHER now lives in findSnoopablePhone, which the
  // candidacy filter calls too (D15); the `rng() > baseChance + drawn` roll is
  // gone with it (D10). What is left is which phone and what is on it.
  const phone = findSnoopablePhone(npc, resolved.location, gameState);
  if (!phone) return null;
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

// --- Phase 8: NPC eat drive ---
// A hungry NPC searches reachable food — its own bag first, then the
// kitchen's fridge/pantry — and REALLY consumes what it finds via
// `CONSUME_ITEM <defId> 1 <from> <npcId>` (the B1 `who` param; the
// groceries disappear from the player's view). Eats greedily
// most-satisfying-first until NPC_INVENTORY.eatUntilHunger or the food
// runs out. When every reachable source is genuinely empty it falls back
// to the abstract restore (the plan's explicit exception to invariant 3)
// so nobody starves because the player forgot to shop. Returns a result
// the drive loop folds in ({ activityOverride, locationOverride, events }),
// or null. Never eats already-Rotten food — that penalty beat is the
// player's to step in.
// Takes the whole DRIVE_DEFS entry rather than just its `leaves` (which is
// what it took until the initiative plan's Phase 1): this path returns before
// the generic footprint handlers in resolveStandardDrive, so it has to apply
// its own, and there are three of them now. Passing the def keeps the next one
// from being a fourth positional argument.
function tryEatFood(npc, npcId, resolved, gameState, rng, drive) {
  const day = gameState.meta.clock.day;
  const tick = getTickIndex(gameState.meta.clock.minutes);
  const sources = [];
  const addList = (list, from, containerDef) => {
    for (const stack of list || []) {
      const def = ITEM_DEFS[stack?.defId];
      if (!(stack?.qty > 0)) continue;
      // Anything that restores hunger counts — groceries and meals alike
      // (the point is the groceries disappear, not a nutrition lecture).
      if (!def?.consumable || !(def.consumable.hunger > 0)) continue;
      if (freshnessOf(stack, containerDef, day)?.key === 'rotten') continue;
      sources.push({ def, from, stack });
    }
  };
  addList(npc.inventory, npcId, null);
  const kitchenBucket = gameState.objects?.['room_kitchen'] || {};
  for (const obj of Object.values(kitchenBucket)) {
    if (obj.defId !== 'fridge' && obj.defId !== 'pantry') continue;
    addList(obj.contents, obj.id, OBJECT_DEFS[obj.defId]);
  }

  // Fallback scrounge — only when nothing at all is reachable.
  if (sources.length === 0) {
    const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
    applyEffects([{ type: 'ADJUST_NEED', params: { who: npcId, need: 'hunger', delta: 30 } }], effCtx);
    return {
      activityOverride: 'scrounging',
      events: [{
        day, tick, roomId: resolved.location, npcId,
        type: 'eat_fallback', moodDelta: 0.02,
        data: {},
        template: '{name} scrounged what was left in the cupboards.',
        seenByPlayer: false,
      }],
    };
  }

  // Greedy plan, most-satisfying first, one unit at a time, until the
  // hunger target or the food runs out. Planned against the LIVE stack
  // quantities (banked per source), so every emitted CONSUME_ITEM line
  // removes exactly the unit this plan counted.
  const bank = new Map(); // from -> [{ def, defId, qty }]
  for (const src of sources) {
    const arr = bank.get(src.from) || [];
    const existing = arr.find(e => e.defId === src.def.id);
    if (existing) existing.qty += src.stack.qty;
    else arr.push({ def: src.def, defId: src.def.id, qty: src.stack.qty });
    bank.set(src.from, arr);
  }
  const plan = [];
  let hunger = npc.needs.hunger || 0;
  const target = NPC_INVENTORY.eatUntilHunger;
  while (hunger < target) {
    let best = null, bestFrom = null;
    for (const [from, arr] of bank) {
      for (const e of arr) {
        if (e.qty <= 0) continue;
        if (!best || e.def.consumable.hunger > best.def.consumable.hunger) { best = e; bestFrom = from; }
      }
    }
    if (!best) break;
    best.qty -= 1;
    plan.push({ defId: best.defId, from: bestFrom });
    hunger += best.def.consumable.hunger;
  }
  if (plan.length === 0) return null;

  const lines = plan.map(u => `CONSUME_ITEM ${u.defId} 1 ${u.from} ${npcId}`);
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);

  const ateFromKitchen = plan.some(u => u.from !== npcId);
  // Perception plan Phase 3: the eat drive resolves through this custom path
  // and `continue`s before the generic `emitsSignal` handler in the drive
  // loop, so its emission lives here — and it is only a cooking smell when
  // they actually went to the kitchen. Someone eating crisps out of their own
  // bag in their bedroom does not fill the flat with the smell of dinner.
  if (ateFromKitchen) {
    emitTransient(gameState, {
      id: 'cooking', roomId: 'kitchen',
      intensity: SIGNALS_EMIT.cookingDrive, sourceId: npcId,
    });
    // Cognition plan Phase 4 (traces): the cooking smell and the kitchen mess
    // are the same act — dishes in the sink, grease on the stove, scraps in
    // the bin. The standing signal comes out of the dirty state for free, so
    // a kitchen meal leaves the kitchen perceivably used. A bag snack leaves
    // nothing, exactly like a bag snack emits no cooking smell.
    applyDriveLeaves(gameState, drive?.leaves, 'kitchen');
    // Initiative plan Phase 1: and the third half, on the same terms. The
    // kitchen is where a mood has something to bang; a snack in a bedroom
    // expresses nothing, for the same reason it emits and leaves nothing.
    applyDriveExpression(gameState, drive?.expresses, 'kitchen', npc, npcId);
  }
  const items = [...new Set(plan.map(u => ITEM_DEFS[u.defId]?.label || u.defId))].join(', ');
  const event = {
    day, tick, roomId: ateFromKitchen ? 'kitchen' : resolved.location, npcId,
    type: 'eat', moodDelta: 0.03,
    data: { items },
    template: ateFromKitchen
      ? '{name} helped themselves to {items} from the kitchen.'
      : '{name} snacked on {items} from their bag.',
    seenByPlayer: false,
  };
  return {
    activityOverride: ateFromKitchen ? 'cooking' : 'snacking',
    locationOverride: ateFromKitchen && resolved.location !== 'kitchen' ? 'kitchen' : null,
    events: [event],
  };
}

// --- Perception plan Phase 5: acting on what you can smell ---
// The proof that the perception layer reaches NPC behaviour. An NPC who can
// smell rot from where they are walks to wherever it is coming from and
// clears it; one who cannot smell it — because they are too far, behind a
// closed door, or simply less attentive — does not, and never knows.
//
// The perceived record is what makes this possible at all: it carries
// `sourceRoomId` and `sourceId`, so "go deal with it" resolves to a real room
// and a real container rather than a search. Nothing else in the drive loop
// has that information.
//
// Deliberately targets the offending container only, rather than reusing
// cleanRoomObjects — someone who follows their nose to a bad smell throws out
// what is rotting, they do not deep-clean the kitchen on the way past.
function tryInvestigateSmell(npc, npcId, resolved, gameState, perceived) {
  const rot = (perceived || [])
    .filter(r => r.signalId === 'rot')
    .sort((a, b) => b.intensity - a.intensity)[0];
  if (!rot) return null;

  const day = gameState.meta.clock.day;
  const tick = getTickIndex(gameState.meta.clock.minutes);

  // Not there yet — follow it. Arriving is a whole tick's work, and the drive
  // fires again next tick now that they are in the room — which is only true
  // because evaluateDrives skips the cooldown on a walk leg (stillWalking).
  // Phase 2's unconditional cooldown-set made the second step impossible.
  if (rot.sourceRoomId !== resolved.location) {
    return {
      locationOverride: rot.sourceRoomId,
      activityOverride: 'following a bad smell',
      stillWalking: true,
      events: [{
        day, tick, roomId: rot.sourceRoomId, npcId,
        type: 'investigate_smell', moodDelta: -0.02, data: {},
        template: '{name} went to find out what the smell was.',
        seenByPlayer: false,
      }],
    };
  }

  // Standing over it. Clear whatever state is actually producing the smell.
  // Phase 4 made rot come from TWO shapes of state: a food container's
  // `rotten_food` (the original EMITS_ROT case) and a bin's `fill`, which
  // emits rot at reduced intensity as it fills. The old check only handled
  // the first, so a full bin an NPC had followed their nose to read as
  // \"nothing to do\" forever. Reset every state key whose def-declared emits
  // table can produce a rot signal back to its cleanest ladder value — the
  // same \"cleanest value first\" convention cleanRoomObjects uses for what
  // clean looks like.
  const obj = findObjectById(gameState, rot.sourceId);
  const def = obj ? OBJECT_DEFS[obj.defId] : null;
  let cleared = false;
  if (obj && def?.emits && def?.states) {
    for (const [stateKey, byValue] of Object.entries(def.emits)) {
      const emitsRot = Object.values(byValue || {}).some(p => p?.signal === 'rot');
      if (!emitsRot) continue;
      const ladder = def.states[stateKey];
      if (!Array.isArray(ladder) || ladder.length < 2) continue;
      const cur = obj.state?.[stateKey];
      if (cur === undefined || cur === ladder[0]) continue;
      obj.state = { ...obj.state, [stateKey]: ladder[0] };
      cleared = true;
    }
  }
  if (!cleared) return null;
  refreshRoomCleanliness(gameState, resolved.location);

  return {
    activityOverride: 'throwing out something that had gone off',
    events: [{
      day, tick, roomId: resolved.location, npcId,
      type: 'investigate_smell', moodDelta: -0.04,
      data: { container: def?.label || 'container' },
      template: '{name} found what was rotting in the {container} and binned it.',
      seenByPlayer: false,
    }],
  };
}

// --- Phase 8: NPC gift drive ---
// A fond NPC hands the player something they own — MOVE_ITEM one unit
// from npc.inventory into the player's bag. The affection gate and the "do
// they own anything worth giving" search are giftableStack above, which the
// candidacy filter calls too (D15); the flat `rng() > baseChance` roll is gone
// (D10). What is left is the handover.
function tryGiveGift(npc, npcId, resolved, gameState) {
  const stack = giftableStack(npc);
  if (!stack) return null;
  const def = ITEM_DEFS[stack.defId];
  const day = gameState.meta.clock.day;
  const tick = getTickIndex(gameState.meta.clock.minutes);
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  applyEffects(parseEffectDSL(`MOVE_ITEM ${stack.defId} 1 ${npcId} player`), effCtx);
  const inRoom = resolved.location === gameState.player.location;
  const event = {
    day, tick, roomId: resolved.location, npcId,
    type: 'gift', moodDelta: 0.05,
    data: { item: def?.label || stack.defId },
    template: inRoom
      ? '{name} hands you their {item} — "I want you to have this."'
      : '{name} left their {item} out for you, wrapped in a napkin.',
    seenByPlayer: false,
  };
  return { activityOverride: null, events: [event] };
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
