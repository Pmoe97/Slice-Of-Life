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
