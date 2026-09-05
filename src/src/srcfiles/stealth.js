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
    } else {
      // Clean sneak — no suspicion/evidence state change, but D32's real fix:
      // this is the branch that used to award nothing at all, forever pinning
      // stealthSuccess at level 0 no matter how many clean sneaks a player
      // pulled off.
      awardSkillXp(gameState.player, 'stealth', STEALTH_TUNING.xpCleanSneak, gameState.meta.clock.day);
    }
  }

  if (lines.length === 0) return { crossed: true, witnessed: false, applied: [] };
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  const result = applyEffects(effects, effCtx);
  const witnessed = presentIds.includes(ownerId);
  // Phase 7 (D12) — a DIRECT witness is a certain transgression, worth a
  // grievance ask_apologize can later target (asks.js). The sneak-caught
  // branch above is deliberately excluded: it's evidence/suspicion, not a
  // certain belief, and D12's apology is belief-gated on things the NPC
  // actually knows happened. REL_DELTA above already mutated gameState.npcs
  // in place, so this reads it fresh, not the pre-effects `owner` capture.
  if (witnessed) {
    gameState.npcs[ownerId] = addGrievance(
      gameState.npcs[ownerId], STEALTH_TUNING.witnessedGrievanceText,
      STEALTH_TUNING.witnessedGrievanceSeverity, gameState.meta.clock.day,
    );
  }
  return { crossed: true, witnessed, result };
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
  // Phase 7 (D12) — a direct catch is a certain transgression, worth a
  // grievance ask_apologize can later target; the "suspected" near-miss below
  // fires no effects and stays unbelieved, so it's deliberately excluded.
  // REL_DELTA above already mutated gameState.npcs in place, so this reads
  // it fresh, not the pre-effects `owner` capture.
  if (detected) {
    gameState.npcs[ownerId] = addGrievance(
      gameState.npcs[ownerId], PEEP_TUNING.grievanceText,
      PEEP_TUNING.grievanceSeverity, gameState.meta.clock.day,
    );
  }

  // Build narration
  let narration = desc;
  let caught = false;
  let suspected = false;

  if (detected) {
    caught = true;
    const caughtTemplate = PEEP_CAUGHT_TEMPLATES[Math.floor(rng() * PEEP_CAUGHT_TEMPLATES.length)];
    narration += ' ' + caughtTemplate.replace('{name}', owner.bible.name || 'They');
  } else {
    // D32: the clean (undetected) branch — this mechanic's own dead XP path.
    // "Suspected" is still undetected in the moment (no consequence effects
    // above fired), so it still counts as clean for skill purposes.
    awardSkillXp(gameState.player, 'stealth', PEEP_TUNING.xpClean, gameState.meta.clock.day);
    if (rng() < PEEP_TUNING.suspectedChance) {
      suspected = true;
      const suspectTemplate = PEEP_SUSPECTED_TEMPLATES[Math.floor(rng() * PEEP_SUSPECTED_TEMPLATES.length)];
      narration += ' ' + suspectTemplate.replace('{name}', owner.bible.name || 'They');
    }
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

// --- Pickpocketing (P1B, D33) ----------------------------------------------
// A covert take directly off an NPC's PERSON while they are present and
// awake — the one stealth mechanic here where the target is aware, unlike
// room-entry/peep/phone-snoop above (which only fire when the owner is
// absent or an object is unattended). Same shape as those three: a seeded
// roll scoped to this exact attempt, a skillMod-gated chance, and a
// clean/suspected/caught branch. Called from UI's doPickpocket.
function resolvePickpocket(gameState, targetId) {
  const npc = gameState.npcs[targetId];
  if (!npc || npc.residency?.status !== 'resident') {
    return { ok: false, reason: 'There is no one there to pickpocket.' };
  }
  const roomId = gameState.player.location;
  if (npc.location !== roomId) {
    return { ok: false, reason: `${npc.bible?.name || 'They'} isn't here.` };
  }

  const takeable = (npc.inventory || []).filter(s =>
    (s?.qty || 0) > 0 && !(s.meta?.keyItem || ITEM_DEFS[s.defId]?.keyItem));
  if (takeable.length === 0) {
    return { ok: false, reason: `${npc.bible?.name || 'They'} aren't carrying anything you could lift.` };
  }

  const rng = seededRng(gameState.meta.seed, `pickpocket_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${targetId}`);
  const pick = weightedPick(rng, takeable.map(s => ({ val: s, weight: 1 }))).val;

  // Aware-target detection: starts high (lifting something off someone next
  // to you is inherently riskier than sneaking through an empty room),
  // reduced by stealth skill and — D34's connective tissue — further
  // reduced while the player is Sneaking.
  const stealthMod = skillMod(gameState.player, 'stealth', 'stealthSuccess');
  let detectionChance = PICKPOCKET_TUNING.baseDetectionChance * (1 - PICKPOCKET_TUNING.stealthSkillFactor * stealthMod);
  if (gameState.player.sneaking) detectionChance *= PICKPOCKET_TUNING.sneakingDetectionMultiplier;
  const caught = rng() < detectionChance;

  const presentIds = getPresentNpcIds(gameState.npcs, roomId);
  const roomObjects = gameState.objects[`room_${roomId}`] || {};
  const effCtx = buildEffectContext(gameState, [targetId], presentIds, roomObjects, gameState.player.inventory || []);
  const lines = [];
  let suspected = false;

  if (caught) {
    lines.push(`ADJUST_SUSPICION ${targetId} boundary_violation +${PICKPOCKET_TUNING.caughtSuspicionDelta}`);
    lines.push(`REL_DELTA ${targetId} tension +${PICKPOCKET_TUNING.caughtTensionDelta}`);
  } else {
    lines.push(`MOVE_ITEM ${pick.defId} 1 ${targetId} player`);
    if (rng() < PICKPOCKET_TUNING.suspectedChance) {
      suspected = true;
      lines.push(`ADJUST_SUSPICION ${targetId} boundary_violation +${PICKPOCKET_TUNING.suspectedSuspicionDelta}`);
    }
  }
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  const result = applyEffects(effects, effCtx);

  if (!caught) {
    awardSkillXp(gameState.player, 'stealth', PICKPOCKET_TUNING.xpClean, gameState.meta.clock.day);
    // D36: a "suspected" take opens the cover-tracks window instead of
    // hardening straight into a locked-in belief — the same
    // noticed-but-unconfirmed state a search or D30's sleeping-NPC branch
    // will read too, once those exist.
    if (suspected) openSuspicionWindow(gameState, npc, 'pickpocket');
  } else {
    // Phase 7 (D12) — a direct catch is a certain transgression, worth a
    // grievance ask_apologize can later target; "suspected" above is
    // deliberately excluded (unconfirmed, D36's own window). REL_DELTA above
    // already mutated gameState.npcs in place, so this reads it fresh.
    gameState.npcs[targetId] = addGrievance(
      gameState.npcs[targetId], PICKPOCKET_TUNING.caughtGrievanceText,
      PICKPOCKET_TUNING.caughtGrievanceSeverity, gameState.meta.clock.day,
    );
  }

  return {
    ok: true, caught, suspected, targetId,
    itemDefId: caught ? null : pick.defId,
    applied: (result && result.applied) || [],
  };
}

// --- Cover your tracks (P1B, D36) ------------------------------------------
// A per-incident countdown a stealth-gated act's "suspected" outcome opens
// on the NPC — the noticed-but-unconfirmed window a contextual cover-tracks
// action can shrink before it hardens. "Hardens" is not a new system: it is
// the EXISTING STEALTH_TUNING.confrontThreshold check (UI's doTalk) — once
// accumulated suspicion crosses it, the next conversation deterministically
// confronts the player. Cover-tracks just buys the suspicion back down
// before that happens. Stored on the NPC (what THIS npc half-noticed), one
// window at a time — a second incident before the first clears simply
// replaces it, same as the mechanics above never stack two roll outcomes.
function openSuspicionWindow(gameState, npc, kind) {
  npc.flags = npc.flags || {};
  npc.flags._suspicionWindow = {
    kind,
    subject: 'boundary_violation',
    expiresAtTick: absoluteTick(gameState.meta.clock) + PICKPOCKET_TUNING.coverTracksWindowTicks,
  };
}

// PURE — a read, not a mutation; an expired window is simply not returned
// (pruning happens lazily, the next time something writes npc.flags).
function activeSuspicionWindow(gameState, npc) {
  const w = npc?.flags?._suspicionWindow;
  if (!w) return null;
  if (absoluteTick(gameState.meta.clock) > w.expiresAtTick) return null;
  return w;
}

// Deterministic partial relief (D1 — decide before you decorate; a skill
// roll here would make "was it worth trying" a second layer of luck on top
// of the original act's own roll, which nothing else in this file does for
// its recovery beats). Clears the window either way: once played, the
// moment to exploit it has passed, win or not.
function resolveCoverTracks(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  const window = npc ? activeSuspicionWindow(gameState, npc) : null;
  if (!window) return { ok: false, reason: 'Nothing to cover up right now.' };

  const current = (npc.suspicion || {})[window.subject] || 0;
  const relief = Math.min(current, PICKPOCKET_TUNING.suspectedSuspicionDelta * PICKPOCKET_TUNING.coverTracksRelief);
  const roomId = gameState.player.location;
  const presentIds = getPresentNpcIds(gameState.npcs, roomId);
  const roomObjects = gameState.objects[`room_${roomId}`] || {};
  const effCtx = buildEffectContext(gameState, [npcId], presentIds, roomObjects, gameState.player.inventory || []);
  const effects = parseEffectDSL(`ADJUST_SUSPICION ${npcId} ${window.subject} -${relief.toFixed(2)}`);
  const result = applyEffects(effects, effCtx);

  npc.flags = { ...npc.flags };
  delete npc.flags._suspicionWindow;

  return { ok: true, relieved: relief, applied: (result && result.applied) || [] };
}

// --- Laundry snoop (P11, D20) ------------------------------------------
// Reading a resident's dirty/washing/drying/folded laundry for gossip
// potential — its own instance of the P1B stealth pattern, distinct from
// the already-shipped phone/room snoop (those fire on a bedroom's owner;
// this one fires on the shared hamper/washer/dryer, which has no single
// owner). The garment picked also names WHOSE laundry it is (stack.ownerId,
// stamped by ITEMS' dirtyWornOutfitForResident) — that resident is who can
// witness or later half-notice the search, same "witnessed vs unwitnessed"
// split as every other mechanic here. Called from UI's doSnoopLaundry.
function resolveLaundrySnoop(gameState) {
  const roomId = gameState.player.location;
  const roomObjects = gameState.objects[`room_${roomId}`] || {};
  const pool = [];
  for (const obj of Object.values(roomObjects)) {
    if (!['laundry_hamper', 'washer', 'dryer'].includes(obj.defId)) continue;
    for (const s of (obj.contents || [])) {
      if (isClothingStack(s) && s.ownerId && s.ownerId !== 'player') pool.push(s);
    }
  }
  if (pool.length === 0) return { ok: false, reason: "There's no one else's laundry here to go through." };

  const rng = seededRng(gameState.meta.seed, `laundry_snoop_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${roomId}`);
  const pick = weightedPick(rng, pool.map(s => ({ val: s, weight: 1 }))).val;
  const ownerId = pick.ownerId;
  const owner = gameState.npcs[ownerId];
  if (!owner) return { ok: false, reason: "There's no one else's laundry here to go through." };

  const clothingDef = CLOTHING_DEFS[pick.defId];
  const descKey = (clothingDef?.traits || []).find(t => LAUNDRY_SNOOP_DESC[t]) || 'default';
  const desc = LAUNDRY_SNOOP_DESC[descKey].replace('{name}', owner.bible.name || 'Someone');

  const presentIds = getPresentNpcIds(gameState.npcs, roomId);
  const witnessed = presentIds.includes(ownerId);
  const effCtx = buildEffectContext(gameState, [ownerId], presentIds, roomObjects, gameState.player.inventory || []);
  const lines = [`ADJUST_NEED player mood +${LAUNDRY_SNOOP_TUNING.moodGain}`];

  let narration = desc;
  let caught = false;
  let suspected = false;

  if (witnessed) {
    caught = true;
    lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${LAUNDRY_SNOOP_TUNING.witnessedSuspicionDelta}`);
    lines.push(`REL_DELTA ${ownerId} tension +${LAUNDRY_SNOOP_TUNING.witnessedTensionDelta}`);
    const caughtTemplate = LAUNDRY_SNOOP_CAUGHT_TEMPLATES[Math.floor(rng() * LAUNDRY_SNOOP_CAUGHT_TEMPLATES.length)];
    narration += ' ' + caughtTemplate.replace('{name}', owner.bible.name || 'They');
  } else if (rng() < LAUNDRY_SNOOP_TUNING.suspectedChance) {
    suspected = true;
    lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${LAUNDRY_SNOOP_TUNING.suspectedSuspicionDelta}`);
    const suspectTemplate = LAUNDRY_SNOOP_SUSPECTED_TEMPLATES[Math.floor(rng() * LAUNDRY_SNOOP_SUSPECTED_TEMPLATES.length)];
    narration += ' ' + suspectTemplate.replace('{name}', owner.bible.name || 'They');
  }

  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  const result = applyEffects(effects, effCtx);

  if (!caught) {
    // D32's convention, generalized to this phase's new mechanic: the
    // clean/unwitnessed branch is the one that awards stealth XP.
    awardSkillXp(gameState.player, 'stealth', LAUNDRY_SNOOP_TUNING.xpClean, gameState.meta.clock.day);
  } else {
    gameState.npcs[ownerId] = addGrievance(
      gameState.npcs[ownerId], LAUNDRY_SNOOP_TUNING.witnessedGrievanceText,
      LAUNDRY_SNOOP_TUNING.witnessedGrievanceSeverity, gameState.meta.clock.day,
    );
  }

  return {
    ok: true, narration, caught, suspected, ownerId,
    applied: (result && result.applied) || [],
  };
}
