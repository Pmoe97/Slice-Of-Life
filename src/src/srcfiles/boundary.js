// ===== SECTION: BOUNDARY ACTS (Intimacy & Voyeurism Phase 17, D13/D14) =====
// The boundary-pushing layer as risk systems — the ONE place Phase 9's plan
// text said boundary acts route, \"through a separate narrow gate with its own
// devastating-consequence binding — never through a relaxed willingness.\"
//
//   sleeping-room acts (sleep_with / sleep_watch): the target is ASLEEP. The
//   willingness function's own asleep floor returns exactly -1 for them —
//   which is expected and RECORDED, never relaxed. The narrow gate opens only
//   when the target is genuinely asleep (targetState), and the act is always
//   an ATTEMPT: either the target never stirs (uncaught — you settle in beside
//   them / watch from the edge of the bed) or they wake, and a wake-up resolves
//   consequences deterministically. A cold/neutral/hostile wake routes through
//   Phase 16's shaming resolver (resolveShamingReaction — the SAME per-dynamic
//   reaction pools the caught peek uses, including the cold-shoulder onset and
//   the move-out clock that goes with it); a WARM wake never shames — the
//   target may accept, reciprocate, or playfully refuse (D13: \"some NPCs are
//   into it\"), and the reciprocate branch RE-READS the real willingness gate
//   now that they are awake: a completed act only ever happens with an awake,
//   willing partner. Nothing here produces a completed intimacy act with a
//   sleeping participant.
//
//   three-way acts (throuple / cuck): NO exception at all. All three parties
//   must clear the same resolveWillingnessGate the player's Make-a-Move and
//   the Phase 13 pair drives read, and one unwilling party refuses the whole
//   act with that party's own voice (noteIntimacyRefusal lands for a soft no —
//   a no means no for a while). `cuck_dynamic` is the SAME all-willing act
//   named by configuration: when two of the three hold a committed/seeing
//   record, the couple's partner is the \"cuck\" configuration (consenting, so
//   the record is not betrayed by the third) and the narration/history differ;
//   the GATE is identical.
//
//   The NPC equivalent (symmetric initiation, D3/D13 — \"some NPCs attempt them
//   back\"): a deviant, aroused NPC sneaks into the sleeping player's room via
//   the sneak_into_bed drive. Same shape as the player's sleep_with — a risk
//   attempt, never assumed participation; the player's locked door makes it
//   impossible; a caught attempt lands relPlayer consequences + an event.
//
// Everything here is DETERMINISTIC (seeded rng only, no LLM call decides any
// boundary outcome — D15). All prose is authored in BOUNDARY_PROSE / the
// SHAMING pools. Config tuning lives in BOUNDARY (config.js).

// --- Act definitions -------------------------------------------------------
// The plan's BOUNDARY_ACT_DEFS. `threeWay` acts are gated through the
// willingness function for every party (resolveBoundaryThroupleGate);
// sleeping-room acts carry a targetState + catchRisk for the narrow gate.
const BOUNDARY_ACT_DEFS = {
  sleep_with: {
    label: 'Slide Into Bed With {name}',
    verbs: ['climb into bed with {name}', 'get into bed with {name}', 'slip into bed beside {name}'],
    targetState: 'sleeping',
    catchRisk: 'high',
    ledgerAct: 'boundary_sleep_with',
  },
  sleep_watch: {
    label: 'Watch {name} Sleep',
    verbs: ['watch {name} sleep', 'sit and watch {name}', 'stand over {name} while they sleep'],
    targetState: 'sleeping',
    catchRisk: 'med',
    ledgerAct: 'boundary_watch_sleeper',
  },
  throuple: { threeWay: true, ledgerAct: 'throuple', label: 'a threesome' },
  cuck:     { threeWay: true, ledgerAct: 'cuck', label: 'a threesome' },
};

// --- Prose pools -----------------------------------------------------------
// Authored, varied (D4 — never one repeated string), seeded per (key, room,
// day). {name} is the NPC. The caught cold/neutral/hostile prose lives in
// SHAMING.prose (the SAME pools the caught peek reads — one reaction, one
// voice); the pools here cover the open beats, the uncaught completions, the
// warm refusal, the reciprocated act, and the three-way.
const BOUNDARY_PROSE = {
  sleepWithOpen: [
    'You ease under the sheets beside {name}, holding your breath.',
    'You slip into the bed next to {name}, moving slow and careful.',
    'Quiet as you can, you climb in beside {name} and lie still.',
    'You slide under the covers next to {name}, barely daring to breathe.',
  ],
  sleepWatchOpen: [
    'You sit on the edge of the bed and watch {name} sleep.',
    'You stand over the bed, watching {name} breathe in the dark.',
    'You crouch by the bed, watching {name}\'s face settle and ease.',
    'You lean over {name} and just watch, for a long moment.',
  ],
  sleepWithUncaught: [
    '{name} never stirs. You settle in beside them and let sleep take you.',
    'The bed dips, the sheets shift — and {name} sleeps on. You close your eyes too.',
    'Nothing wakes. You lie curled at their side until your own eyes grow heavy.',
    'They sleep through it. In the morning the bed is unmade, and neither of you says anything.',
  ],
  sleepWatchUncaught: [
    'They never wake. You watch until you feel the weight of it, then slip back out.',
    'Not a twitch. You take the sight of them with you and leave the room as quiet as you found it.',
    'They sleep soundly through it. You pull yourself away while you still can.',
    'You leave before they stir. They will never know you were there.',
  ],
  warmRefuse: [
    '{name} stirs and blinks at you. \"Are you… in my bed?\" It is not anger — it is almost fond. \"Out. You.\" But they are smiling about it.',
    '\"What are you doing?\" {name} asks, still half asleep. They shove you gently. \"Go on, out. Weirdo.\" The word is warm.',
    '{name} wakes, takes in the situation, and laughs quietly. \"Absolutely not,\" they say, and pushes you toward the edge. \"But nice try.\"',
  ],
  reciprocate: [
    '{name} wakes to find you there — and instead of pushing you away, pulls you closer. The dark room goes warm and wordless.',
    '{name} half-wakes, finds you, and wraps around you without a word. There is a long, quiet while before either of you says anything.',
    'They wake slowly, and when they see it is you, their hand finds yours. It is a while before either of you sleeps.',
  ],
  throupleOpen: [
    'You catch both their eyes and raise the question. The room goes very still, then very warm.',
    '\"What if it were the three of us?\" you ask. The silence is short and the answer is longer.',
  ],
  cuckOpen: [
    'You put it to them together — {a} looks at {b}, {b} looks at {a}, and somehow they are both already saying yes.',
    '\"Ask him,\" {a} says, watching {b}. \"He says yes, I say yes.\"',
  ],
  throupleDone: [
    'It is warm and tangled and over far too soon. The three of you lie in a heap, catching your breath.',
    'Nobody gets much sleep after that. The bed is a wreck by morning, and nobody minds.',
    'It takes a while, and it is worth every minute. The room smells like three people who do not regret a thing.',
  ],
  cuckDone: [
    'It is a strange, generous triangle of a thing — and it ends with {a} holding {b}\'s gaze over your shoulder, both of them smiling.',
    'The three of you find a rhythm fast. {a} and {b} trade a look across you that says everything, and the room gets very warm.',
  ],
};

// --- Pure derivations ------------------------------------------------------

// The resident who is asleep in a room right now — the target the sleeping-
// room verbs offer. Prefers the room's owner when they are the sleeper, else
// the first asleep resident present. PURE.
function sleepingOccupantInRoom(gs, roomId) {
  if (!gs || !roomId || !ROOMS[roomId]) return null;
  const asleep = (n) => {
    const a = ((n && n.activity) || '').toLowerCase();
    return a === 'sleeping' || a === 'napping';
  };
  const ownerId = roomOwnerId(roomId, gs.npcs);
  if (ownerId && ownerId !== 'player') {
    const owner = gs.npcs[ownerId];
    if (owner && owner.residency?.status === 'resident' && owner.location === roomId && asleep(owner)) return ownerId;
  }
  for (const id of getPresentNpcIds(gs.npcs || {}, roomId)) {
    const n = gs.npcs[id];
    if (n && n.residency?.status === 'resident' && asleep(n)) return id;
  }
  return null;
}

// The dynamic tier a boundary target reads through — the SAME read the
// caught-peek tables and Phase 16's shaming resolver use, so a sleeping-room
// wake-up and a caught peek cannot disagree about what this person is. PURE.
function boundaryTierFor(gs, npc) {
  return resolveShamingTier(gs, npc);
}

// A completed three-way's configuration: 'cuck' when the two NPCs hold a
// committed/seeing record (the couple + the player as the invited third),
// 'throuple' otherwise. Pure — the GATE for both is identical.
function boundaryThreeWayConfig(gs, partnerA, partnerB) {
  const rec = getRelationship(gs, partnerA, partnerB, false);
  if (rec && (rec.status === 'committed' || rec.status === 'seeing')) return 'cuck';
  return 'throuple';
}

// The per-tick wake probability for a sleeping-room attempt: the per-act ×
// per-dynamic base table, minus the player's stealthSuccess skill, plus the
// sleeper's own perception. \"At low dynamic a wake-up is near-certain\" is
// the cold/hostile column; a close dynamic wakes seldom. PURE.
function boundaryWakeChance(gs, actId, targetId) {
  const def = BOUNDARY_ACT_DEFS[actId];
  const target = gs?.npcs?.[targetId];
  if (!target || !def) return 1;
  const tier = boundaryTierFor(gs, target);
  const table = def.catchRisk === 'high'
    ? BOUNDARY.sleepRoom.wakeChanceByDynamic
    : BOUNDARY.sleepRoom.watchWakeChance;
  const base = table[tier] ?? table.neutral;
  const stealth = skillMod(gs.player, 'stealth', 'stealthSuccess');
  const perception = getNpcPerception(target);
  return clamp01(base - stealth * BOUNDARY.sleepRoom.stealthFactor + perception * BOUNDARY.sleepRoom.perceptionWeight);
}

// Seeded prose pick per (pool, room, day) — the pickPeekProse pattern (D4).
// PURE.
function pickBoundaryProse(gs, key, npcId, roomId, day) {
  const pool = BOUNDARY_PROSE[key];
  if (!pool || !gs) return '';
  const npc = npcId && gs.npcs ? gs.npcs[npcId] : null;
  const name = (npc && npc.bible && npc.bible.name) || 'They';
  const seed = hashStr(`${key}|${roomId || ''}|${day || 0}`) + (gs.meta?.seed || 0);
  const rng = mulberry32(seed);
  return pool[Math.floor(rng() * pool.length)].replace('{name}', name);
}

// --- The narrow context gate -----------------------------------------------
// The sleeping-room half. The willingness function is ALWAYS consulted and
// ALWAYS returned (targetGate): a sleeping target's gate is the asleep floor
// — reason 'floor', reasons ['asleep'], willingness -1 — which is EXPECTED and
// is exactly why this act is an ATTEMPT, never a completed intimacy act. The
// gate closes on: a missing/absent/awake/non-resident target, or a cold-
// shouldering target (Phase 16's floor closes even the attempt — nobody who
// will not look at you has any boundary door left to open toward you). PURE.
function resolveBoundaryGate(gs, actId, targetNpcId, ctx = {}) {
  const def = BOUNDARY_ACT_DEFS[actId];
  if (!def || def.threeWay) return { allowed: false, reason: 'no_such_act' };
  const initiator = ctx.initiatorId || 'player';
  const roomId = ctx.location || (gs && gs.player && gs.player.location);
  const target = gs && gs.npcs ? gs.npcs[targetNpcId] : null;
  if (!target) return { allowed: false, reason: 'no_target' };
  if (!roomId || target.location !== roomId) return { allowed: false, reason: 'not_here' };
  if (target.residency?.status !== 'resident') return { allowed: false, reason: 'not_resident' };
  const actv = (target.activity || '').toLowerCase();
  if (actv !== 'sleeping' && actv !== 'napping') return { allowed: false, reason: 'not_asleep' };
  const targetGate = resolveWillingnessGate(gs, targetNpcId, initiator, 'sex', {
    ...ctx, npcId: targetNpcId, location: roomId,
  });
  if (coldShoulderActive(target)) return { allowed: false, reason: 'cold_shoulder', targetGate };
  return {
    allowed: true, reason: null, actId, targetId: targetNpcId,
    targetGate, tier: boundaryTierFor(gs, target), catchRisk: def.catchRisk,
  };
}

// The three-way half — NO exception to the willingness function. Both
// partners must be in the player's room, hold real desire (the plan's
// \"requires: two willing partners + desire\"), and clear the SAME
// resolveWillingnessGate the Make-a-Move flow reads for the same act. Returns
// { allowed, reason, partner? (the first unwilling one), gate }. PURE.
function resolveBoundaryThroupleGate(gs, partnerA, partnerB, ctx = {}) {
  const roomId = ctx.location || (gs && gs.player && gs.player.location);
  for (const [key, id] of [['a', partnerA], ['b', partnerB]]) {
    const n = gs && gs.npcs ? gs.npcs[id] : null;
    if (!n) return { allowed: false, reason: 'no_target', partner: key };
    if (n.location !== roomId) return { allowed: false, reason: 'not_here', partner: key };
    if ((n.needs?.desire || 0) < BOUNDARY.throuple.desireFloor) {
      return { allowed: false, reason: 'not_into_it', partner: key };
    }
  }
  for (const [key, id] of [['a', partnerA], ['b', partnerB]]) {
    const gate = resolveWillingnessGate(gs, id, 'player', 'sex', {
      ...ctx, npcId: id, location: roomId,
    });
    if (!gate.allowed) {
      return {
        allowed: false,
        reason: gate.reason === 'floor' ? 'floor' : 'below_threshold',
        partner: key, gate,
      };
    }
  }
  return { allowed: true, reason: null };
}

// --- Deterministic wake/catch resolution -----------------------------------
// The warm-dynamic re-gate: the target JUST WOKE UP, so the asleep floor that
// justified the attempt (recorded in resolveBoundaryGate — reason 'floor',
// reasons ['asleep'], willingness -1, EXPECTED) no longer applies. A shallow
// proxy re-reads the willingness function against the awake person they now
// are — the willingness function itself is untouched (invariant 1: the floor
// still fires for every genuinely-asleep read; ONLY this call uses the
// proxy, and only after a wake). A completed act therefore only ever happens
// with an awake, willing partner. PURE.
function resolveBoundaryAwakeGate(gs, targetId, ctx) {
  if (!gs?.npcs?.[targetId]) return { allowed: false, willingness: -1, threshold: 0, reason: 'no_target' };
  const awakeGs = { ...gs, npcs: { ...gs.npcs, [targetId]: { ...gs.npcs[targetId], activity: 'idle' } } };
  return resolveWillingnessGate(awakeGs, targetId, 'player', 'sex', {
    ...(ctx || {}), npcId: targetId, location: ctx?.location || gs.player?.location || null,
  });
}

// The wake-up resolution for a sleeping-room attempt. Seeded roll against
// boundaryWakeChance; a warm dynamic that wakes routes to the REAL willingness
// gate (the target is awake now): allowed → 'reciprocate' (a completed act,
// decided by data — D15), refused → 'warm_refuse'. Every other dynamic wakes
// into Phase 16's shaming reaction. PURE — the caller applies the deltas.
function resolveBoundaryCatch(gs, actId, targetId, ctx = {}) {
  const npc = gs?.npcs?.[targetId];
  if (!npc) return { woke: false, tier: 'neutral', reaction: 'uncaught' };
  const tier = boundaryTierFor(gs, npc);
  const chance = boundaryWakeChance(gs, actId, targetId);
  const rng = seededRng(gs.meta.seed,
    `boundary_${actId}_${gs.meta.clock.day}_${Math.floor(gs.meta.clock.minutes * 100)}_${targetId}`);
  if (!(rng() < chance)) return { woke: false, tier, reaction: 'uncaught' };
  if (tier === 'warm') {
    const gate = resolveBoundaryAwakeGate(gs, targetId, ctx);
    return { woke: true, tier, reaction: gate.allowed ? 'reciprocate' : 'warm_refuse', gate };
  }
  const shaming = resolveShamingReaction(gs, npc, {
    cause: actId, roomId: ctx.location || null, day: gs.meta.clock.day,
  });
  return { woke: true, tier, reaction: 'shame', shaming };
}

// --- Effect application helpers --------------------------------------------
// Phase 16's shaming reaction through the same trusted-producer DSL path the
// caught peek uses (REL_DELTA/MOOD_DELTA/ADJUST_SUSPICION/player mood), plus
// the small \"you woke me by getting in my bed\" tension spike. Signed DSL
// values are formatted without a stray '+' so Number() never sees '+-0.15'.
function applyShamingReactionLines(gs, npcId, shaming, extraTension) {
  const def = shaming.def;
  const lines = [];
  for (const [axis, v] of Object.entries(def.relDeltas || {})) {
    lines.push(`REL_DELTA ${npcId} ${axis} ${v < 0 ? '' : '+'}${v}`);
  }
  if (extraTension) lines.push(`REL_DELTA ${npcId} tension +${extraTension}`);
  if (def.npcMood) lines.push(`MOOD_DELTA ${npcId} ${def.npcMood < 0 ? '' : '+'}${def.npcMood}`);
  if (def.suspicion) lines.push(`ADJUST_SUSPICION ${npcId} boundary_violation +${def.suspicion}`);
  if (def.playerMood) lines.push(`ADJUST_NEED player mood ${def.playerMood < 0 ? '' : '+'}${def.playerMood}`);
  const effCtx = buildEffectContext(gs, [npcId], [npcId], {}, []);
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
}

// Invariant 7's bed trace — the shared unmake (mirrors resolvePairedAct's).
function unmakeBed(gs, roomId) {
  const roomObjects = gs?.objects?.[`room_${roomId}`] || {};
  const bed = Object.values(roomObjects).find(o => o.defId === 'bed');
  if (bed) {
    bed.state = { ...(bed.state || {}), made: 'unmade' };
    refreshRoomCleanliness(gs, roomId);
  }
}

// --- The player's sleeping-room verbs --------------------------------------
// Applies a resolved sleeping-room attempt to the LIVE state (the caller has
// already advanced the clock and re-derived currentGameState). MUTATES.
// Returns { ok, outcome, prose, actId } — outcome ∈ 'uncaught' | 'caught' |
// 'warm_refuse' | 'reciprocated' | 'gone'.
function applyBoundarySleepRoom(gs, actId, targetId, ctx = {}) {
  const def = BOUNDARY_ACT_DEFS[actId];
  const target = gs && gs.npcs ? gs.npcs[targetId] : null;
  if (!target || !def || def.threeWay) return { ok: false, reason: 'gone' };
  const roomId = ctx.location || gs.player.location;
  const day = gs.meta.clock.day;
  const actv = (target.activity || '').toLowerCase();
  const stillAsleep = actv === 'sleeping' || actv === 'napping';

  let catchRes;
  if (stillAsleep) {
    catchRes = resolveBoundaryCatch(gs, actId, targetId, { ...ctx, location: roomId });
  } else {
    // The clock advance woke them (or they left): the premise is gone and the
    // person is standing there looking at you. A warm dynamic routes through
    // the SAME awake re-gate as a warm wake (reciprocate or playful refusal);
    // every other dynamic is the full Phase 16 shaming path.
    const tier = boundaryTierFor(gs, target);
    if (tier === 'warm') {
      const gate = resolveBoundaryAwakeGate(gs, targetId, { ...ctx, location: roomId });
      catchRes = { woke: true, tier, reaction: gate.allowed ? 'reciprocate' : 'warm_refuse', gate };
    } else {
      catchRes = {
        woke: true, tier, reaction: 'shame',
        shaming: resolveShamingReaction(gs, target, { cause: actId, roomId, day }),
      };
    }
  }

  if (catchRes.reaction === 'uncaught') {
    if (actId === 'sleep_with') {
      gs.player = {
        ...gs.player,
        mood: clampAxis((gs.player.mood || 0) + BOUNDARY.sleepRoom.sleepWith.playerMood),
        energy: Math.min(100, (gs.player.energy || 0) + BOUNDARY.sleepRoom.sleepWith.playerEnergy),
      };
      unmakeBed(gs, roomId);
    } else {
      gs.player = { ...gs.player, mood: clampAxis((gs.player.mood || 0) + BOUNDARY.sleepRoom.watch.playerMood) };
    }
    notePlayerLedgerEntry(gs, targetId, def.ledgerAct, day, roomId, { outcome: null });
    return {
      ok: true, outcome: 'uncaught', actId,
      prose: pickBoundaryProse(gs, actId === 'sleep_with' ? 'sleepWithUncaught' : 'sleepWatchUncaught',
        targetId, roomId, day),
    };
  }

  if (catchRes.reaction === 'warm_refuse') {
    gs.npcs[targetId] = applyRelDelta(gs.npcs[targetId],
      BOUNDARY.sleepRoom.warmRefuseDeltas, day);
    notePlayerLedgerEntry(gs, targetId, def.ledgerAct, day, roomId, { outcome: 'caught' });
    return {
      ok: true, outcome: 'warm_refuse', actId,
      prose: pickBoundaryProse(gs, 'warmRefuse', targetId, roomId, day),
    };
  }

  if (catchRes.reaction === 'reciprocate') {
    const applied = applyReciprocatedAct(gs, targetId, { ...ctx, location: roomId });
    return {
      ok: true, outcome: 'reciprocated', actId, applied,
      prose: pickBoundaryProse(gs, 'reciprocate', targetId, roomId, day),
    };
  }

  // shame (cold/neutral/hostile wake) — the devastating-consequence binding.
  applyShamingReactionLines(gs, targetId, catchRes.shaming, BOUNDARY.sleepRoom.caughtTensionSpike);
  if (catchRes.shaming.coldShoulderSeverity > 0) {
    noteColdShoulder(gs.npcs[targetId], catchRes.shaming.coldShoulderSeverity, day, 'caught_boundary');
  }
  notePlayerLedgerEntry(gs, targetId, def.ledgerAct, day, roomId, { outcome: 'caught' });
  return {
    ok: true, outcome: 'caught', actId,
    prose: catchRes.shaming.prose,
  };
}

// The reciprocated wake — a COMPLETED paired act with an awake, willing
// target (the gate re-checked in resolveBoundaryCatch). Mirrors
// resolvePairedAct's footprint (partner effects, rel deltas, intimacy
// history, bed, moan, ledger) and Phase 14's infidelity pass — symmetric
// with every other completed paired act (D3). MUTATES.
// action-outcome-window-plan audit finding #12: this function's two
// applyEffects calls plus the reciprocateDeltas rel write were previously
// silent to any caller — the outcome window's delta strip had no way to know
// what a reciprocated boundary act actually did, and fell through to an
// empty strip on the single richest outcome of the four. Returns the applied
// effect list (Design Invariant 1's required source), a hand-built REL_DELTA
// row set for the one direct mutation below (reciprocateDeltas is a known
// config constant, not something recomputed), never a fabricated number.
function applyReciprocatedAct(gs, targetId, ctx = {}) {
  const roomId = ctx.location || gs.player.location;
  const day = gs.meta.clock.day;
  const roomObjects = gs.objects?.[`room_${roomId}`] || {};

  const effCtx = buildEffectContext(gs, [targetId], [targetId], roomObjects, []);
  const npcLines = BOUNDARY.throuple.npcEffects.map(l => l.replace('{target}', targetId));
  const npcResult = applyEffects(npcLines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  const playerResult = applyEffects(BOUNDARY.throuple.playerEffects.map(l => parseEffectDSL(l)[0]).filter(Boolean),
    buildEffectContext(gs, [], [], roomObjects, []));
  const applied = [
    ...((npcResult && npcResult.applied) || []),
    ...((playerResult && playerResult.applied) || []),
  ];

  let npc = gs.npcs[targetId];
  npc = applyRelDelta(npc, BOUNDARY.sleepRoom.sleepWith.reciprocateDeltas, day);
  for (const [axis, delta] of Object.entries(BOUNDARY.sleepRoom.sleepWith.reciprocateDeltas || {})) {
    applied.push({ type: 'REL_DELTA', params: { npcId: targetId, axis, delta } });
  }
  // The target is awake and IN it now — the scene must not keep showing them
  // asleep for the rest of the current state (the next tick re-derives
  // activity from the schedule, which may rightly put a groggy woken-up
  // person back to bed). 'intimacy' is the shared vulnerable state the pair
  // acts use, so the moan and the render read coherently.
  npc = { ...npc, clothing: 'undressed', activity: 'intimacy' };
  gs.npcs[targetId] = npc;
  noteIntimacyOccurred(npc, day, 'player');
  notePlayerLedgerEntry(gs, targetId, 'boundary_sleep_with', day, roomId, { outcome: 'reciprocated' });

  // Intimacy & Voyeurism Phase 18 (D14/D16): a reciprocated boundary act is a
  // completed paired act — it conceives exactly like any other completed sex
  // act (player.flags._tryingWith vs the base unprotected chance). Silent.
  if (typeof maybeConceive === 'function') {
    maybeConceive(gs, 'player', targetId, 'sex', { location: roomId });
  }

  unmakeBed(gs, roomId);
  emitTransient(gs, { id: 'moaning', roomId, intensity: SIGNALS_EMIT.moaningHigh, sourceId: 'player' });

  if (typeof applyInfidelityFootprint === 'function') {
    const infidelity = applyInfidelityFootprint(gs, 'player', targetId, 'sex', { location: roomId });
    if (infidelity.events.length > 0 && typeof addLogEntry === 'function') {
      for (const evt of infidelity.events) {
        const wronged = gs.npcs[evt.npcId];
        addLogEntry('narration', `${wronged?.bible?.name || 'Someone'} found out what happened and is furious.`);
      }
    }
  }
  return applied;
}

// --- The three-way acts (throuple / cuck) ----------------------------------
// Applies a completed three-way to the LIVE state. Both partners are already
// gated willing (resolveBoundaryThroupleGate). MUTATES. Returns
// { ok, config ('throuple'|'cuck'), events, applied }.
//
// action-outcome-window-plan audit finding #12: `applied` is new — the two
// applyEffects calls plus the relDeltas rel write were previously silent to
// any caller, so the outcome window's strip could only show what the CALLER
// separately re-derived (just the rel deltas, missing every need/mood row
// the act actually applied). This captures the real applyEffects returns
// (Design Invariant 1's required source) and hand-builds REL_DELTA rows only
// for the one direct mutation below, from the same config constant it uses.
function applyBoundaryThrouple(gs, partnerA, partnerB, ctx = {}) {
  const config = boundaryThreeWayConfig(gs, partnerA, partnerB);
  const roomId = ctx.location || gs.player.location;
  const day = gs.meta.clock.day;
  const roomObjects = gs.objects?.[`room_${roomId}`] || {};
  const cfg = BOUNDARY.throuple;
  const applied = [];

  const effCtx = buildEffectContext(gs, [partnerA, partnerB], [partnerA, partnerB], roomObjects, []);
  for (const id of [partnerA, partnerB]) {
    const lines = cfg.npcEffects.map(l => l.replace('{target}', id));
    const res = applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
    applied.push(...((res && res.applied) || []));
  }
  const playerRes = applyEffects(cfg.playerEffects.map(l => parseEffectDSL(l)[0]).filter(Boolean),
    buildEffectContext(gs, [], [], roomObjects, []));
  applied.push(...((playerRes && playerRes.applied) || []));

  for (const id of [partnerA, partnerB]) {
    gs.npcs[id] = applyRelDelta(gs.npcs[id], cfg.relDeltas, day);
    for (const [axis, delta] of Object.entries(cfg.relDeltas || {})) {
      applied.push({ type: 'REL_DELTA', params: { npcId: id, axis, delta } });
    }
  }
  gs.world.castWeb = applyNpcToNpcDelta(gs.world.castWeb || {}, partnerA, partnerB, cfg.pairDeltas);
  gs.world.castWeb = applyNpcToNpcDelta(gs.world.castWeb || {}, partnerB, partnerA, cfg.pairDeltas);

  for (const id of [partnerA, partnerB]) {
    const n = { ...gs.npcs[id], clothing: 'undressed' };
    gs.npcs[id] = n;
    noteIntimacyOccurred(n, day, id === partnerA ? partnerB : partnerA);
    notePlayerLedgerEntry(gs, id, config, day, roomId, { otherNpcId: id === partnerA ? partnerB : partnerA });
  }

  const rec = getRelationship(gs, partnerA, partnerB, false);
  if (rec) addRelationshipHistory(gs, partnerA, partnerB, 'throuple', day);

  unmakeBed(gs, roomId);
  emitTransient(gs, { id: 'moaning', roomId, intensity: SIGNALS_EMIT.moaningHigh, sourceId: 'player' });

  const infidelity = applyThreeWayInfidelity(gs, ['player', partnerA, partnerB]);
  return { ok: true, config, events: infidelity.events, applied };
}

// The three-way infidelity pass: for each NPC participant, any committed/
// seeing record whose other member is OUTSIDE the participant set is a
// wronged party — the cheater's own memory gains the fact, the record gains
// the 'cheat' entry, and a wronged party who perceives the act (in the room
// or the moan reaches them) gets the jealousy immediately. The fact names all
// the act's other participants; the cheating metadata points at the player
// when the player is among them (so the wronged party's learning path is the
// SAME as a paired act — including the public-infidelity cold-shoulder). The
// participant-loop generalizes infidelityWrongedActs' pair shape; the ONE
// writers (addMemoryFact / addRelationshipHistory / applyInfidelityJealousy)
// stay the ones the paired footprint uses. MUTATES. Returns { events }.
function applyThreeWayInfidelity(gs, participants) {
  const events = [];
  const store = gs?.world?.relationships;
  if (!store) return { events };
  const day = gs.meta.clock.day;
  const location = gs.player.location;
  const nowMinutes = gs.meta.clock.minutes;
  const handled = new Set();
  for (const cheater of participants) {
    if (cheater === 'player') continue;
    const others = participants.filter(id => id !== cheater);
    for (const [key, rec] of Object.entries(store)) {
      if (rec.status !== 'committed' && rec.status !== 'seeing') continue;
      const ids = key.split('|');
      if (!ids.includes(cheater)) continue;
      const w = ids.find(id => id !== cheater);
      if (!w || w === 'player' || others.includes(w)) continue;
      if (!gs.npcs[w]) continue;
      const dedupeKey = `${cheater}|${w}|${day}`;
      if (handled.has(dedupeKey)) continue;
      handled.add(dedupeKey);
      const otherId = others.includes('player') ? 'player' : others[0];
      const fact = boundaryThreeWayFact(gs, cheater, others, day);
      const cheaterNpc = gs.npcs[cheater];
      if (cheaterNpc) gs.npcs[cheater] = addMemoryFact(cheaterNpc, { ...fact });
      addRelationshipHistory(gs, cheater, w, 'cheat', day, otherId);
      if (infidelityWrongedPerceives(gs, w, location)) {
        const wronged = applyInfidelityJealousy(gs, w, cheater, otherId, day, { ...fact });
        if (wronged) gs.npcs[w] = wronged;
        events.push({
          day, tick: getTickIndex(nowMinutes), roomId: location, npcId: w,
          type: 'cheating', moodDelta: INFIDELITY.wrongedMoodDelta,
          data: { other: cheater },
          template: '{name} found out what {other} did and is furious.',
          seenByPlayer: false,
        });
      }
    }
  }
  return { events };
}

// The canonical gossip fact for a three-way — the same shape Phase 14's
// writer uses (transmission dedupe + maybeJealousUponFact recognize it), with
// a text naming every other participant. PURE.
function boundaryThreeWayFact(gs, cheaterId, others, day) {
  const cheaterName = gs.npcs[cheaterId]?.bible?.name || 'Someone';
  const otherNames = others.map(id => id === 'player' ? 'the player' : (gs.npcs[id]?.bible?.name || 'someone')).join(' and ');
  const otherId = others.includes('player') ? 'player' : others[0];
  return {
    text: `${cheaterName} slept with ${otherNames}`,
    day,
    importance: INFIDELITY.factImportance,
    category: INFIDELITY.factCategory,
    provenance: 'witnessed',
    confidence: 1.0,
    salience: 1.0,
    emotionalTag: INFIDELITY.factEmotionalTag,
    cheating: { cheaterId, otherId, day },
  };
}

// --- The NPC-equivalent drive (symmetric, D3/D13) --------------------------
// Candidacy for the sneak_into_bed drive — the mirror of the player's own
// sleep_with: a deviant, aroused NPC with a sleeping player behind an
// unlocked door in an adjacent room. The willingness gate is NOT consulted
// for the player here for the same reason it is not consulted in the player's
// own sleep_with: the player is ASLEEP (the gate's asleep floor returns -1 —
// expected), the act is a risk attempt with consequences, never a completed
// intimacy act with a participating target, and a locked door makes it
// impossible. Cold-shouldering NPCs are excluded by COLD_SHOULDER
// .suppressedDrives (isDriveCandidate). PURE.
function boundarySneakCandidacy(npc, npcId, gameState, ctx) {
  const cfg = BOUNDARY.npcSneak;
  if (npcDeviancy(npc) < cfg.deviancyFloor) return false;
  if ((npc.needs?.desire || 0) < cfg.desireFloor) return false;
  if (getPlayerVulnerableState(gameState) !== 'sleeping') return false;
  const pRoom = gameState.player?.location;
  if (!pRoom || !ctx?.location || pRoom === ctx.location) return false;
  if (getDoorState(gameState, pRoom) === 'locked') return false;
  return isRoomAdjacent(ctx.location, pRoom);
}

// The resolver: a stealth/perception contest. Silence is the usual outcome —
// the NPC slips in, gets in bed, leaves an unmade bed behind; being caught is
// the real minority outcome and lands the NPC's own relPlayer consequences +
// an event the player sees. Returns the drives.js-facing result (activity /
// location override, updated npc, optional event) or null when the door
// locked or the player woke since candidacy.
function trySneakIntoBed(npc, npcId, resolved, gameState) {
  const cfg = BOUNDARY.npcSneak;
  const pRoom = gameState.player?.location;
  if (!pRoom || !resolved?.location || pRoom === resolved.location) return null;
  if (getPlayerVulnerableState(gameState) !== 'sleeping') return null;
  if (getDoorState(gameState, pRoom) === 'locked') return null;

  const rng = seededRng(gameState.meta.seed,
    `npc_sneak_${gameState.meta.clock.day}_${getTickIndex(gameState.meta.clock.minutes)}_${npcId}`);
  const conscientiousness = npc?.bible?.temperament?.conscientiousness ?? 0;
  const stealth = (conscientiousness + 1) / 2 * cfg.stealthBase + rng() * cfg.stealthJitter;
  const playerPerception = getPlayerPerception(gameState.player) * cfg.asleepPerceptionFactor;
  const catchChance = clamp01(cfg.baseCatchChance + (playerPerception - stealth) * cfg.perceptionGapWeight);
  const caught = rng() < catchChance;

  const day = gameState.meta.clock.day;
  if (caught) {
    gameState.npcs[npcId] = applyRelDelta(gameState.npcs[npcId], cfg.caughtRelDeltas, day);
    const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
    const lines = [
      `MEMORY_EPISODE ${npcId} Got caught slipping into the player's room while they slept.`,
      `ADJUST_SUSPICION ${npcId} boundary_violation +${cfg.caughtSuspicion}`,
    ];
    applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
    return {
      npc, npcOut: gameState.npcs[npcId],
      activityOverride: 'sneaking back out', locationOverride: pRoom, caught: true,
      event: {
        day, tick: getTickIndex(gameState.meta.clock.minutes), roomId: pRoom, npcId,
        type: 'boundary', template: cfg.eventTemplateCaught, seenByPlayer: true,
      },
    };
  }

  // Silent success — the player will find an unmade bed and a memory they
  // were never part of. The NPC's own relPlayer warms a little (they wanted
  // this) and their desire is sated.
  gameState.npcs[npcId] = applyRelDelta(gameState.npcs[npcId], cfg.relDeltas, day);
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  const lines = [
    `ADJUST_NEED ${npcId} desire ${cfg.desireRelease}`,
    `MOOD_DELTA ${npcId} +${cfg.moodGain}`,
    `MEMORY_EPISODE ${npcId} Slipped into the player's bed while they slept. Nobody saw.`,
  ];
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  unmakeBed(gameState, pRoom);
  return {
    npc, npcOut: gameState.npcs[npcId],
    activityOverride: 'lying beside you', locationOverride: pRoom, caught: false, event: null,
  };
}

// ===== /SECTION: BOUNDARY ACTS =====
