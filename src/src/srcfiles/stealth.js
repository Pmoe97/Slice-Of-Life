// ===== SECTION: STEALTH =====
// Boundary crossing, witnessing, and evidence (P6). resolveRoomEntryStealth
// is the one entry point UI calls (from doMove) — it decides, deterministically
// and in-memory, what happens when the player enters a resident's bedroom:
// caught in the act (owner present), sneaking (owner absent, a stealth roll
// decides), or nothing at all (not a bedroom, or it's the player's own).
//
// This is a TRUSTED PRODUCER, same trust tier as ACTIONS' executeAction —
// it calls applyEffects directly and deliberately skips validateEffects
// (see EFFECTS' file header: validateEffects is the LLM-input boundary,
// not a second-guess of numbers the game itself already vetted via
// STEALTH_TUNING/config.js). Never touches npc.bible — bible.boundary is
// read-only here, matched against BOUNDARY_POOL's parallel category field.

// Matches an NPC's frozen bible.boundary prose against BOUNDARY_POOL's
// category tag (added in P6 — see config.js). String-equality lookup is
// safe because bible.boundary is always drawn verbatim from a pool entry's
// .text at character creation (sim.js) and never edited after.
function findBoundaryCategory(boundaryText) {
  return (BOUNDARY_POOL.find(b => b.text === boundaryText) || {}).category || 'other';
}

// Weighted pick among a room's private, evidence-bearing objects (diary,
// desktop computer, etc — OBJECT_DEFS' private + evidenceKinds fields).
// Returns null if the room has nothing that could carry evidence.
function pickEvidenceObject(roomObjects, rng) {
  const candidates = Object.values(roomObjects || {})
    .filter(o => OBJECT_DEFS[o.defId]?.private && (OBJECT_DEFS[o.defId].evidenceKinds || []).length > 0);
  if (candidates.length === 0) return null;
  const pick = weightedPick(rng, candidates.map(o => ({ val: o, weight: 1 }))).val;
  return { id: pick.id, kinds: OBJECT_DEFS[pick.defId].evidenceKinds };
}

// Called from UI's doMove right after player.location is set, before the
// tick advances — presence reflects who was actually home when the player
// walked in, not who the next tick happens to move.
function resolveRoomEntryStealth(gameState, roomId) {
  const ownerId = roomOwnerId(roomId, gameState.npcs);
  if (!ownerId || ownerId === 'player') return { crossed: false };
  const owner = gameState.npcs[ownerId];
  if (!owner || owner.residency.status === 'former') return { crossed: false };

  const category = findBoundaryCategory(owner.bible.boundary);
  const mult = category === 'room_access' ? STEALTH_TUNING.matchedBoundaryMultiplier : 1;
  const presentIds = getPresentNpcIds(gameState.npcs, roomId);
  const roomObjects = gameState.objects[`room_${roomId}`] || {};
  const effCtx = buildEffectContext(gameState, [], presentIds, roomObjects, gameState.player.inventory || []);
  const lines = [];

  if (presentIds.includes(ownerId)) {
    // Direct witness — owner is home right now, no roll needed.
    lines.push(`WITNESS ${ownerId} player certain`);
    lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${(STEALTH_TUNING.witnessedSuspicionDelta * mult).toFixed(2)}`);
    lines.push(`REL_DELTA ${ownerId} tension +${STEALTH_TUNING.witnessedTensionDelta}`);
  } else {
    // Sneaking — stealth skill rolls against a seeded rng scoped to this
    // exact entry (day/tick/room), so replaying the same tick is stable.
    const rng = seededRng(gameState.meta.seed, `room_entry_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${roomId}`);
    const successChance = skillMod(gameState.player, 'stealth', 'stealthSuccess');
    if (rng() >= successChance) {
      lines.push(`ADD_FLAG player intruded_${roomId} true`);
      lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${(STEALTH_TUNING.sneakCaughtSuspicionDelta * mult).toFixed(2)}`);
      const evidenceObj = pickEvidenceObject(roomObjects, rng);
      if (evidenceObj) {
        const kind = weightedPick(rng, evidenceObj.kinds.map(k => ({ val: k, weight: 1 }))).val;
        lines.push(`LEAVE_EVIDENCE ${evidenceObj.id} ${kind} ${STEALTH_TUNING.sneakEvidenceStrength}`);
      }
    } // else: clean sneak — no state change at all, narration-only outcome
  }

  if (lines.length === 0) return { crossed: true, witnessed: false, applied: [] };
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  const result = applyEffects(effects, effCtx);
  return { crossed: true, witnessed: presentIds.includes(ownerId), result };
}

// --- Peeping (P7): observe an NPC in a private state from outside their
// room. Called from UI's doPeep. Deterministic, in-memory, zero LLM —
// the narration is built from templates, not generated. Returns a
// description of what the player sees and whether they were caught.
function resolvePeep(gameState, roomId) {
  // Find the NPC in the target room — for bedrooms this is the owner,
  // for common rooms (bathroom) it's whoever is present.
  let ownerId = roomOwnerId(roomId, gameState.npcs);
  if (!ownerId) {
    // Common room: check who's present
    const present = getPresentNpcIds(gameState.npcs, roomId);
    if (present.length > 0) ownerId = present[0];
  }
  if (!ownerId) return { ok: false, reason: 'No one is in there right now.' };

  const owner = gameState.npcs[ownerId];
  if (!owner || owner.residency.status !== 'resident') return { ok: false, reason: 'No one is in there right now.' };

  // The NPC must be in the room being peeped at
  if (owner.location !== roomId) return { ok: false, reason: 'No one is in there right now.' };

  const clothing = owner.clothing || 'dressed';
  const activity = owner.activity || '';
  const effCtx = buildEffectContext(gameState, [ownerId], [ownerId], {}, []);
  const rng = seededRng(gameState.meta.seed, `peep_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${roomId}`);

  // Determine what the player sees based on clothing/activity
  let descKey = clothing;
  if (activity === 'showering') descKey = 'showering';
  else if (activity === 'sleeping' || activity === 'napping') descKey = 'sleeping';

  const descTemplate = PEEP_CLOTHING_DESC[descKey] || PEEP_CLOTHING_DESC.dressed;
  const desc = descTemplate.replace('{name}', owner.bible.name || 'They');

  // Detection roll: is the NPC awake and aware?
  const isAsleep = activity === 'sleeping' || activity === 'napping';
  const isShowering = activity === 'showering';
  let detectionChance = isAsleep ? PEEP_TUNING.detectionNpcAsleep : PEEP_TUNING.detectionNpcAwake;
  // Showering makes detection harder (water noise, can't see the door)
  if (isShowering) detectionChance *= 0.5;
  // Stealth skill reduces detection
  const stealthMod = skillMod(gameState.player, 'stealth', 'stealthSuccess');
  detectionChance *= (1 - PEEP_TUNING.stealthSkillFactor * stealthMod);

  const detected = rng() < detectionChance;

  // Apply effects
  const lines = [];
  lines.push(`ADJUST_NEED player mood +${PEEP_TUNING.moodGain}`);

  if (detected) {
    lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${PEEP_TUNING.suspicionDelta}`);
    lines.push(`REL_DELTA ${ownerId} tension +${PEEP_TUNING.tensionDelta}`);
    lines.push(`REL_DELTA ${ownerId} affection ${PEEP_TUNING.affectionCostIfCaught}`);
  }

  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  // action-outcome-window-plan audit finding (2026-08-26 follow-up): capture
  // applyEffects' own return so the caller's outcome window can read a real
  // result (Design Invariant 1) — the one-off peep resolved with no window
  // at all until this fix.
  const peepEffResult = applyEffects(effects, effCtx);

  // Build narration
  let narration = desc;
  let caught = false;
  let suspected = false;

  if (detected) {
    caught = true;
    const caughtTemplate = PEEP_CAUGHT_TEMPLATES[Math.floor(rng() * PEEP_CAUGHT_TEMPLATES.length)];
    narration += ' ' + caughtTemplate.replace('{name}', owner.bible.name || 'They');
  } else if (rng() < PEEP_TUNING.suspectedChance) {
    suspected = true;
    const suspectTemplate = PEEP_SUSPECTED_TEMPLATES[Math.floor(rng() * PEEP_SUSPECTED_TEMPLATES.length)];
    narration += ' ' + suspectTemplate.replace('{name}', owner.bible.name || 'They');
  }

  return {
    ok: true, narration, caught, suspected, ownerId, clothing: descKey,
    applied: (peepEffResult && peepEffResult.applied) || [],
  };
}

// --- NPC peeping on the player (Phase 6): the mirror of resolvePeep.
// Called from evaluateDrives when the peep_player drive fires. The NPC
// attempts to spy on the player during a vulnerable state (masturbating,
// showering, sleeping). Success = the NPC observes silently and gains a
// memory episode + small relationship delta. Failure = the player catches
// them, triggering a DOM-injected bubble (reusing the Phase 5 system)
// with AI-generated NPC reaction and player response options.
//
// Returns { detected, npcId, playerState } or { detected: false, npcId,
// playerState, memory, relDelta } (silent success — caller applies the
// memory/rel delta and surfaces nothing to the player). The caught-bubble
// UI is shown asynchronously from the tick (the tick stays synchronous);
// evaluateDrives collects peep results and the caller (advanceAndResolve)
// processes them after the tick completes.
function resolveNpcPeep(gameState, npcId, playerState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return null;

  const t = npc.bible.temperament;
  const rng = seededRng(gameState.meta.seed, `npc_peep_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${npcId}`);

  // NPC stealth — derived from conscientiousness (methodical = sneaky)
  // plus randomness. Range: ~0.0 to ~0.7.
  const npcStealth = (t.conscientiousness + 1) * 0.3 + rng() * 0.4;

  // Player perception — derived from energy and mood
  const playerPerception = getPlayerPerception(gameState.player);

  // Detection: if NPC stealth < player perception, the player notices
  const detected = npcStealth < playerPerception;

  if (detected) {
    // Player catches the NPC — return for async bubble processing
    return { detected: true, npcId, playerState, npcStealth, playerPerception };
  }

  // Silent success — NPC peeps without being noticed.
  // Apply memory episode and relationship delta in-memory.
  const cfg = NPC_PEEP_TUNING;
  const warmth = t.warmth;
  const relDelta = {};
  if (warmth > 0) {
    relDelta.affection = cfg.silentRelDelta.positiveAffection;
  } else {
    relDelta.tension = cfg.silentRelDelta.negativeTension;
  }

  // Build a memory episode text based on what the NPC saw
  const stateDesc = {
    masturbating: 'masturbating at their computer',
    showering: 'in the shower',
    sleeping: 'asleep in bed',
    undressed: 'getting changed',
    // Intimacy & Voyeurism Phase 11 (D3/D13): the paired acts hold this
    // vulnerable state for their whole duration. Vague on purpose — the NPC
    // remembers seeing the player with someone, not a boundary inventory.
    intimacy: 'with someone',
  }[playerState] || 'in a private moment';

  const memoryText = `Saw you ${stateDesc}.`;

  // Apply memory + rel delta directly (trusted producer)
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  const lines = [
    `MEMORY_EPISODE ${npcId} ${memoryText}`,
  ];
  if (relDelta.affection) lines.push(`REL_DELTA ${npcId} affection +${relDelta.affection}`);
  if (relDelta.tension) lines.push(`REL_DELTA ${npcId} tension +${relDelta.tension}`);
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  applyEffects(effects, effCtx);

  return { detected: false, npcId, playerState, memory: memoryText, relDelta };
}
