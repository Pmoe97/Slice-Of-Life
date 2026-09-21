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

// --- The Affection ladder's sleeping-target branch (Phase 2, D30) ---------
// asks.js's Hug/KissCheek/KissLips/Cuddle/RequestIntimacy leaves all call
// this the moment their decide() finds the target asleep — never the normal
// receptivity/willingness check. Wake chance reuses the sleepRoom shape
// (dynamic-tier table, minus stealth, plus perception), bucketed by
// BOUNDARY.affectionLadder.catchRisk per rung. Whether a wake goes receptive
// or hostile deliberately does NOT reuse resolveBoundaryAwakeGate's full
// willingness read (that pulls in relationship phase, which D30 explicitly
// excludes) — it is willingnessAttraction × npcDeviancy only, so a stranger
// can theoretically wake receptive and a beloved partner can wake furious.
// PURE — the caller (asks.js's postEffects) applies the deltas.
function resolveAffectionSleepAttempt(gs, actId, targetId, ctx = {}) {
  const target = gs?.npcs?.[targetId];
  if (!target) return { outcome: 'undisturbed', woke: false, tier: 'neutral' };
  const A = BOUNDARY.affectionLadder;
  const risk = A.catchRisk[actId] || 'med';
  const table = A.wakeChanceByRisk[risk];
  const tier = boundaryTierFor(gs, target);
  const base = table[tier] ?? table.neutral;
  const stealth = skillMod(gs.player, 'stealth', 'stealthSuccess');
  const perception = getNpcPerception(target);
  const chance = clamp01(base - stealth * BOUNDARY.sleepRoom.stealthFactor + perception * BOUNDARY.sleepRoom.perceptionWeight);
  const day = gs.meta.clock.day;
  const minute = Math.floor(gs.meta.clock.minutes * 100);
  const wakeRng = seededRng(gs.meta.seed, `affection_wake_${actId}_${day}_${minute}_${targetId}`);
  if (!(wakeRng() < chance)) return { outcome: 'undisturbed', woke: false, tier };
  const attraction = willingnessAttraction(gs, target, 'player', ctx);
  const deviancy = npcDeviancy(target);
  const score = attraction * A.attractionWeight + deviancy * A.deviancyWeight;
  const recRng = seededRng(gs.meta.seed, `affection_receptive_${actId}_${day}_${minute}_${targetId}`);
  const noise = (recRng() - 0.5) * 2 * A.receptiveNoiseRange;
  if (score + noise >= A.receptiveThreshold) return { outcome: 'wake_receptive', woke: true, tier };
  const shaming = resolveShamingReaction(gs, target, { cause: actId, roomId: ctx.location || null, day });
  return { outcome: 'wake_hostile', woke: true, tier, shaming };
}

// Applies a resolved attempt (above) to the LIVE state. `opts` carries the
// caller's own act-specific deltas — this stays generic across the whole
// ladder rather than reading AFFECTION_TUNING/INTIMACY itself, the same
// division of labour resolvePairedAct/asks.js's effects() already keep (the
// def/config owns the numbers; the resolver owns the mechanism). MUTATES.
// Returns { outcome } — the caller narrates from it.
function applyAffectionSleepAttempt(gs, targetId, attempt, opts = {}) {
  const target = gs?.npcs?.[targetId];
  if (!target) return { outcome: attempt.outcome };
  const day = gs.meta.clock.day;
  if (attempt.outcome === 'wake_hostile') {
    applyShamingReactionLines(gs, targetId, attempt.shaming, BOUNDARY.sleepRoom.caughtTensionSpike);
    if (attempt.shaming.coldShoulderSeverity > 0) {
      noteColdShoulder(gs.npcs[targetId], attempt.shaming.coldShoulderSeverity, day, 'caught_boundary');
    }
    return { outcome: 'wake_hostile', prose: attempt.shaming.prose };
  }
  if (attempt.outcome === 'wake_receptive') {
    if (opts.relDeltas) gs.npcs[targetId] = applyRelDelta(gs.npcs[targetId], opts.relDeltas, day);
    if (opts.npcMoodGain) gs.npcs[targetId] = applyMoodDelta(gs.npcs[targetId], opts.npcMoodGain);
    return { outcome: 'wake_receptive' };
  }
  // undisturbed — nothing lands on the NPC; the free-use-kink case (D30).
  return { outcome: 'undisturbed' };
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
    // actions-and-activities-overhaul-plan.md Phase 5 (D31): this used to
    // resolve caughtRelDeltas/caughtSuspicion right here, unconditionally —
    // the roll deciding not just whether the player woke but how they FELT
    // about it, with no say in either. The roll still decides only the wake;
    // npc.flags._sleepAdvance stamps a pending record (mirrors D36's
    // _suspicionWindow shape) and ui.js's deferred gate asks the player for
    // the real choice once the screen is free — resolveSleepAdvanceChoice
    // below applies whichever of the three outcomes they actually picked.
    gameState.npcs[npcId] = {
      ...gameState.npcs[npcId],
      flags: {
        ...(gameState.npcs[npcId].flags || {}),
        _sleepAdvance: { status: 'pending', openedDay: day, openedTick: getTickIndex(gameState.meta.clock.minutes) },
      },
    };
    return {
      npc, npcOut: gameState.npcs[npcId],
      activityOverride: 'waking you', locationOverride: pRoom, caught: true, event: null,
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
  ];
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  // Written directly rather than through a MEMORY_EPISODE DSL line so the
  // episode carries a real emotionalTag (EVENT_EMOTION.boundary via the
  // same eventEmotionalTag() reader the ambient pipeline uses) — the DSL
  // path has no tag parameter at all, which left this whole beat invisible
  // to rumination's theme grouping (see verify-i2.js).
  gameState.npcs[npcId] = addMemoryEpisode(
    gameState.npcs[npcId], day, "Slipped into the player's bed while they slept. Nobody saw.",
    MEMORY_IMPORTANCE.conversational, eventEmotionalTag({ type: 'boundary' }),
  );
  unmakeBed(gameState, pRoom);
  return {
    npc, npcOut: gameState.npcs[npcId],
    activityOverride: 'lying beside you', locationOverride: pRoom, caught: false, event: null,
  };
}

// --- D31's real choice, applied (actions-and-activities-overhaul-plan.md
// Phase 5) --------------------------------------------------------------
// PURE predicate + the MUTATING resolver ui.js's deferred gate calls once the
// player actually answers. `hasPendingSleepAdvance` is read by both sides —
// the gate's own re-check before presenting (the record may have gone stale
// some other way between queuing and presenting) and this resolver's guard.
function hasPendingSleepAdvance(npc) {
  return !!(npc && npc.flags && npc.flags._sleepAdvance && npc.flags._sleepAdvance.status === 'pending');
}

// choice is 'into_it' | 'decline' | 'angry' — real player input, never a
// second roll (D31). Returns { outcome } or null when there was nothing
// pending to resolve. MUTATES.
function resolveSleepAdvanceChoice(gameState, npcId, choice) {
  const npc = gameState.npcs && gameState.npcs[npcId];
  if (!npc || !hasPendingSleepAdvance(npc)) return null;
  const cfg = BOUNDARY.npcSneak;
  const day = gameState.meta.clock.day;
  const roomId = gameState.player.location;
  const flags = { ...npc.flags };
  delete flags._sleepAdvance;
  gameState.npcs[npcId] = { ...npc, flags };

  if (choice === 'into_it') {
    // A real completed act with a real, awake, consenting player — costed
    // exactly like any other completed sex act (BOUNDARY.throuple's own
    // needs/mood effects, reused rather than duplicated; INTIMACY.relDeltas.sex
    // for the warmth, the same figure applyReciprocatedAct's own reciprocate
    // branch already reads for the player-initiated mirror of this act).
    const roomObjects = gameState.objects?.[`room_${roomId}`] || {};
    const effCtx = buildEffectContext(gameState, [npcId], [npcId], roomObjects, []);
    const npcLines = BOUNDARY.throuple.npcEffects.map(l => l.replace('{target}', npcId));
    applyEffects(npcLines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
    applyEffects(BOUNDARY.throuple.playerEffects.map(l => parseEffectDSL(l)[0]).filter(Boolean),
      buildEffectContext(gameState, [], [], roomObjects, []));
    let updated = applyRelDelta(gameState.npcs[npcId], INTIMACY.relDeltas.sex, day);
    updated = { ...updated, clothing: 'undressed', activity: 'intimacy' };
    gameState.npcs[npcId] = updated;
    noteIntimacyOccurred(updated, day, 'player');
    notePlayerLedgerEntry(gameState, npcId, 'boundary_sleep_with', day, roomId, { outcome: 'reciprocated' });
    if (typeof maybeConceive === 'function') maybeConceive(gameState, 'player', npcId, 'sex', { location: roomId });
    unmakeBed(gameState, roomId);
    emitTransient(gameState, { id: 'moaning', roomId, intensity: SIGNALS_EMIT.moaningHigh, sourceId: 'player' });
    if (typeof applyInfidelityFootprint === 'function') {
      applyInfidelityFootprint(gameState, 'player', npcId, 'sex', { location: roomId });
    }
    return { outcome: 'into_it' };
  }

  if (choice === 'decline') {
    // The one genuinely new outcome — a real no, gently taken. Costs far
    // less than being caught out (below): declining a wanted advance is not
    // the same event as being caught doing something wrong.
    gameState.npcs[npcId] = applyRelDelta(gameState.npcs[npcId], cfg.declineRelDeltas, day);
    // See the silent-success branch above for why this bypasses the
    // MEMORY_EPISODE DSL — it needs a real emotionalTag (EVENT_EMOTION.boundary).
    gameState.npcs[npcId] = addMemoryEpisode(
      gameState.npcs[npcId], day,
      "Woke the player trying to get into bed with them. They said no, gently — no hard feelings.",
      MEMORY_IMPORTANCE.conversational, eventEmotionalTag({ type: 'boundary' }),
    );
    return { outcome: 'decline' };
  }

  // angry — what 'caught' used to resolve unconditionally, now gated behind
  // the player's own real reaction.
  gameState.npcs[npcId] = applyRelDelta(gameState.npcs[npcId], cfg.caughtRelDeltas, day);
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  applyEffects(
    [`ADJUST_SUSPICION ${npcId} boundary_violation +${cfg.caughtSuspicion}`]
      .map(l => parseEffectDSL(l)[0]).filter(Boolean),
    effCtx,
  );
  // See the silent-success branch above for why this bypasses the
  // MEMORY_EPISODE DSL — it needs a real emotionalTag (EVENT_EMOTION.boundary).
  gameState.npcs[npcId] = addMemoryEpisode(
    gameState.npcs[npcId], day,
    "Got caught sneaking into the player's bed, and they were furious about it.",
    MEMORY_IMPORTANCE.conversational, eventEmotionalTag({ type: 'boundary' }),
  );
  return { outcome: 'angry' };
}

// ===== SECTION: NIGHT SCENE (night-scene-sleeping-npc-plan.md) =============
// The sleeping-NPC free-play minigame that replaces affectionLadder's
// RequestIntimacy branch for the in-room case (D13/Phase 6 wires the entry
// chip; this file only owns the mechanism). Routes through the SAME narrow
// gate as the rest of this file — the willingness function's asleep floor
// is consulted and expected to return -1 (invariant 1); nothing here opens
// a second, lighter door. Every roll is seeded off gs.meta.seed plus an
// action-qualified sub-seed, so a whole session replays deterministically
// from (seed, ordered action list) — invariant 2, held here too.
//
// REVISED 2026-09-04 (Phase 3a) by the UI + design passes. The shape the
// first build shipped is gone:
//   - a flat `zoneId` is now a COMPOSED action id (D16),
//     `part.side.instrument.motion.pace`, resolved by one function.
//   - nightStepQuell is DELETED (D17). Soothing is emergent: a
//     soothing-capable part × a calming motion × gentle pace.
//   - 'ghost'/'bail' are gone (D22). One voluntary exit; what it costs is
//     decided by the evidence left behind.
//   - Heat is a real resource — Intensity Acceleration Resistance (D27),
//     per-NPC derived preferences (D28) and a per-NPC willing threshold
//     (D29) replace the old monotone counter and its flat `heatWillingMin`.
//   - Heat is UNBOUNDED and every 100 is another climax (D38).
//   - Position is real, tracked state and it gates the palette (D34/D36).
//   - Narration is AUTHORED and composed here (D30/D32) — the LLM is not in
//     the loop at all for an action, which goes further than invariant 2.
//
// The two couplings a future session must not "tidy into symmetry":
//   - wakefulness/stirring NEVER influence heat. One direction, always.
//   - heat influences wakefulness in exactly TWO blessed places, both about
//     the player's JUDGEMENT rather than about pursuing heat (that was D7,
//     and D7 is deleted): D27's overshoot multiplier, and D36's move
//     discount — which only ever makes the player SAFER. Never mirror the
//     move discount into a penalty.

// --- Phase 3a: the action grammar (pure table reads) ------------------------

// Which motions this part accepts from this instrument (D31 — validity is
// DATA, never assumed). Expands the '@family' shorthand in the part's `acc`
// table, and returns them in ascending intensity because D33 makes the row
// ORDER information: the leftmost verb on any part is the safe approach and
// the rightmost has to be earned. PURE.
function nightMotionsFor(partId, instrumentBase) {
  const cfg = BOUNDARY.nightScene;
  const part = cfg.parts[partId];
  const decl = part && part.acc ? part.acc[instrumentBase] : null;
  if (!Array.isArray(decl)) return [];
  const out = [];
  for (const token of decl) {
    if (typeof token !== 'string') continue;
    if (token.charAt(0) === '@') {
      const fam = token.slice(1);
      for (const id of Object.keys(cfg.motions)) {
        if (cfg.motions[id].family === fam && out.indexOf(id) < 0) out.push(id);
      }
    } else if (cfg.motions[token] && out.indexOf(token) < 0) out.push(token);
  }
  return out.sort((a, b) => (cfg.motions[a].intensityOffset - cfg.motions[b].intensityOffset)
    || (a < b ? -1 : a > b ? 1 : 0));
}

// The instrument row: the five base contact footprints plus one per entry in
// the PLAYER's genitals array (D35 — derived from the ARRAY, never from
// `gender`). Two entries of the same type get disambiguated ids and labels so
// the tray never renders two identical chips, while both share one `base` and
// therefore one validity row. PURE.
function nightInstruments(gs) {
  const cfg = BOUNDARY.nightScene;
  const out = Object.keys(cfg.instruments).map(id => ({ ...cfg.instruments[id], id, base: id, index: 0 }));
  const gens = gs?.player?.appearance?.physical?.intimate?.genitals || [];
  const seen = {};
  for (const g of gens) {
    const tpl = cfg.genitalInstruments[g?.type];
    if (!tpl) continue;
    const n = (seen[g.type] = (seen[g.type] || 0) + 1);
    out.push({ ...tpl, id: n > 1 ? `${tpl.base}${n}` : tpl.base, index: n - 1,
      label: n > 1 ? `${tpl.label} #${n}` : tpl.label });
  }
  return out;
}

// Phase 6: the ambient fallback is what makes the shadow layer a legal
// composed id rather than a special case in the resolver. `world` is not in
// `instruments`, so it never reaches the tray's instrument row, but it
// resolves here exactly like a fingertip does.
function nightInstrumentDef(gs, instrumentId) {
  const found = nightInstruments(gs).find(i => i.id === instrumentId);
  if (found) return found;
  const amb = BOUNDARY.nightScene.ambientInstruments[instrumentId];
  return amb ? { ...amb, id: instrumentId, base: instrumentId, index: 0 } : null;
}

// D33's breasted/flat split, read from the bible rather than from `gender` —
// `intimate.breasts.size` first (always rolled), `body.chestSize` as the
// fallback for a hand-authored character that only filled the body group.
// Nipples are universal and are never swapped. PURE.
function nightChestVariant(npc) {
  const cfg = BOUNDARY.nightScene;
  const size = String(npc?.bible?.physical?.intimate?.breasts?.size || '').toLowerCase();
  if (size) return cfg.flatBreastSizes.indexOf(size) >= 0 ? 'flat' : 'breasted';
  const chest = String(npc?.bible?.physical?.body?.chestSize || '').toLowerCase();
  return cfg.flatChestSizes.indexOf(chest) >= 0 ? 'flat' : 'breasted';
}

// How exposed she currently is: the LOWER of what the pose allows and what
// the covers allow (D34). A part's `minExposure` is checked against this, so
// working an opening — turning the sheet back, rolling her over — is what
// unlocks the palette rather than a stage counter.  PURE.
function nightExposure(record) {
  const cfg = BOUNDARY.nightScene;
  const p = cfg.poses[record?.pose]?.exposure ?? 0;
  const c = cfg.covers[record?.covers]?.exposure ?? 0;
  return Math.min(p, c);
}

// --- Phase 7: D34's third axis, CLOTHING ------------------------------------
// Pose and covers are a single 0-2 ladder and meet in nightExposure's `min`.
// Clothing deliberately does NOT join that scalar, which is a considered
// deviation from the phase brief: a garment is in the way of a ZONE, not of
// the body as a whole, and collapsing "her shirt is up" and "her bottoms are
// down" into one number would make either one unlock the other. It is a
// separate predicate, checked alongside the ladder in nightPartReachable.

// The garment ids this session is actually playing with. A nude target has
// none and every clothing check below short-circuits to "nothing in the way".
// PURE.
function nightGarmentIds(record) {
  return Object.keys((record && record.clothing) || {});
}

// 'on' | 'displaced' | null (not in this session's set at all). PURE.
function nightGarmentState(record, garmentId) {
  const c = (record && record.clothing) || {};
  return Object.prototype.hasOwnProperty.call(c, garmentId) ? c[garmentId] : null;
}

// Which zones a part is covered on — derived from the garments its OWN
// `evidence` list names, which is why this axis needed no per-part churn: the
// tag a part leaves behind was already the record of what was in its way.
// A part naming no garment (hair, feet, the sheet) has no zone and is never
// clothing-blocked. PURE.
function nightPartZones(part) {
  const cfg = BOUNDARY.nightScene;
  const out = [];
  for (const tag of (part?.evidence || [])) {
    const g = cfg.garments[tag];
    if (!g) continue;
    for (const z of g.zones) if (out.indexOf(z) < 0) out.push(z);
  }
  return out;
}

// Every garment still ON that covers a zone this part needs. Note it asks
// about ZONES rather than about the tag the part names, which is what makes a
// towel work: `breast` names `shirt`, there is no shirt in a towel session,
// and the towel covers 'top' — so it is the towel that is in the way, and
// opening it is what clears the part. PURE.
function nightGarmentsBlocking(record, part) {
  const cfg = BOUNDARY.nightScene;
  const zones = nightPartZones(part);
  if (!zones.length) return [];
  return nightGarmentIds(record).filter((id) => {
    if (nightGarmentState(record, id) !== 'on') return false;
    const g = cfg.garments[id];
    return !!g && g.zones.some(z => zones.indexOf(z) >= 0);
  });
}

// Can this garment be displaced RIGHT NOW? It must be in the set, still on,
// and nothing it is UNDER may still be in the way — panties are layer 1 in the
// 'bottom' zone and bottoms are layer 0, so the bottoms come down first. The
// tray teaches the order by only ever offering the next one. PURE.
function nightGarmentAvailable(record, garmentId) {
  const cfg = BOUNDARY.nightScene;
  const g = cfg.garments[garmentId];
  if (!g || nightGarmentState(record, garmentId) !== 'on') return false;
  return !nightGarmentIds(record).some((other) => {
    if (other === garmentId) return false;
    const o = cfg.garments[other];
    if (!o || o.layer >= g.layer) return false;
    if (!o.zones.some(z => g.zones.indexOf(z) >= 0)) return false;
    return nightGarmentState(record, other) === 'on';
  });
}

// The clothing half of D18's image key, and the clause the prompt stages her
// with. One function so the picture and the prose can never disagree about
// what she is wearing. PURE.
function nightClothingToken(clothing) {
  const ids = Object.keys(clothing || {}).sort();
  if (!ids.length) return 'bare';
  const on = ids.filter(id => clothing[id] === 'on');
  return on.length ? `on-${on.join('-')}` : 'open';
}

function nightClothingClause(clothing) {
  const cfg = BOUNDARY.nightScene;
  const ids = Object.keys(clothing || {}).sort();
  if (!ids.length) return cfg.garmentStaging.none;
  const moved = ids.filter(id => clothing[id] === 'displaced')
    .map(id => (cfg.garments[id] || {}).displaced).filter(Boolean);
  return moved.length ? moved.join(', ') : cfg.garmentStaging.intact;
}

// D34's pose gate, now with D34's clothing gate beside it. A part carries its
// own `reach` when it differs from its region's; `reach: null` on either means
// "reachable in every pose". PURE.
function nightPartReachable(record, partId) {
  const cfg = BOUNDARY.nightScene;
  const part = cfg.parts[partId];
  if (!part) return false;
  // A garment ROW in the Move region answers to the layering rule instead of
  // to any of the body gates — it is the thing that opens them.
  if (part.garment) return nightGarmentAvailable(record, part.garment);
  const region = cfg.regions[part.region] || {};
  const reach = Object.prototype.hasOwnProperty.call(part, 'reach') ? part.reach : region.reach;
  if (Array.isArray(reach) && reach.indexOf(record?.pose) < 0) return false;
  if ((part.minExposure || 0) > nightExposure(record)) return false;
  return nightGarmentsBlocking(record, part).length === 0;
}

// Why a part is not reachable, for the tray's blocked-region hint. Returns
// null when it IS reachable. Order matters: the pose is the coarsest thing in
// the way and the garment the finest, so name them in the order the player has
// to solve them. PURE.
function nightPartBlocker(record, partId) {
  const cfg = BOUNDARY.nightScene;
  const part = cfg.parts[partId];
  if (!part) return { kind: 'no_part' };
  if (part.garment) {
    return nightGarmentAvailable(record, part.garment) ? null : { kind: 'garment_layer', garment: part.garment };
  }
  const region = cfg.regions[part.region] || {};
  const reach = Object.prototype.hasOwnProperty.call(part, 'reach') ? part.reach : region.reach;
  if (Array.isArray(reach) && reach.indexOf(record?.pose) < 0) return { kind: 'pose', needs: reach };
  if ((part.minExposure || 0) > nightExposure(record)) {
    const poseEx = cfg.poses[record?.pose]?.exposure ?? 0;
    return (poseEx < (part.minExposure || 0))
      ? { kind: 'pose', needs: reach }
      : { kind: 'covers' };
  }
  const blocking = nightGarmentsBlocking(record, part);
  if (blocking.length) return { kind: 'garment', garment: blocking[0] };
  return null;
}

// The genital regions she actually has (D35): one region instance per entry
// in HER genitals array, disambiguated by a side token when she carries two
// of a type. A character with an empty array carries neither and nothing
// breaks. PURE.
function nightGenitalRegions(npc) {
  const cfg = BOUNDARY.nightScene;
  const out = [];
  const seen = {};
  for (const g of (npc?.bible?.physical?.intimate?.genitals || [])) {
    const regionId = Object.keys(cfg.regions).find(r => cfg.regions[r].genital === g?.type);
    if (!regionId) continue;
    const n = (seen[g.type] = (seen[g.type] || 0) + 1);
    out.push({ regionId, index: n - 1, sideToken: `g${n}`, entry: g,
      label: n > 1 ? `${cfg.regions[regionId].label} #${n}` : cfg.regions[regionId].label });
  }
  return out;
}

// The whole tray, already filtered — D31's rule ("the tray renders only what
// is valid, so an impossible action is unreachable rather than rejected")
// applied to every axis at once: sex from data (D35, never a hardcoded UI
// check), pose and covers from D34, evidence outstanding for Cleanup, and an
// available graph edge for Move (D36). PURE — 3b's renderer paints this and
// decides nothing.
function nightPalette(gs, targetId) {
  const cfg = BOUNDARY.nightScene;
  const target = gs?.npcs?.[targetId];
  const record = target?.flags?._nightScene;
  if (!target || !record) return { regions: [], instruments: [] };
  const instruments = nightInstruments(gs);
  const variant = nightChestVariant(target);
  const genitalRegions = nightGenitalRegions(target);
  const evidence = record.evidence || [];

  // Phase 6 (D28): what the PLAYER has already worked out about this
  // character. Read once for the whole palette, never re-derived per part.
  const known = nightKnownFor(gs, targetId);

  const buildPart = (partId, sideToken) => {
    const part = cfg.parts[partId];
    if (part.variant && part.variant !== variant) return null;
    if (!nightPartReachable(record, partId)) return null;
    if (part.clears && evidence.indexOf(part.clears) < 0) return null;
    const rows = [];
    for (const inst of instruments) {
      let motions = nightMotionsFor(partId, inst.base);
      motions = motions.filter(m => nightMoveEdgeOpen(record, cfg.motions[m]));
      if (motions.length) rows.push({ instrumentId: inst.id, motions });
    }
    if (!rows.length) return null;
    const sides = part.paired ? ['left', 'right', 'both'] : [sideToken || '-'];
    return {
      partId,
      label: nightRegister(part.label, target),
      standalone: nightRegister(part.standalone, target),
      sides, instruments: rows,
      // null until learned, and null forever for a neutral part — D28's
      // "unlearned ones show nothing at all", which is what keeps an unmarked
      // chip ambiguous rather than a confirmed-nothing tell.
      known: known.parts[partId] || null,
    };
  };

  // Phase 7: a region whose parts all exist but are all blocked is reported
  // separately rather than silently dropped (see prose.blocked for why). It
  // never enters `regions`, so nothing that walks the tray — the selection
  // repair, the prefetch, the resolver — can land on an empty one.
  const blockedRegions = [];
  const SEVERITY = { garment: 1, garment_layer: 1, covers: 2, pose: 3 };
  const noteBlocked = (regionId, label, instance, kind, partIds) => {
    let best = null;
    for (const pid of partIds) {
      // A part the target simply does not have (D33's breasted/flat split) is
      // absent, not blocked — asking why it is unreachable would report a
      // solvable-looking reason for something no action can ever open.
      const pd = cfg.parts[pid];
      if (pd && pd.variant && pd.variant !== variant) continue;
      const b = nightPartBlocker(record, pid);
      if (!b || !SEVERITY[b.kind]) continue;
      if (!best || SEVERITY[b.kind] < SEVERITY[best.kind]) best = b;
    }
    if (!best) return;
    const template = (cfg.prose.blocked || {})[best.kind] || '';
    const g = best.garment ? cfg.garments[best.garment] : null;
    blockedRegions.push({
      regionId, label, instance, kind,
      reason: best.kind,
      garment: best.garment || null,
      text: template.replace(/\{garment\}/g, g ? g.label : ''),
    });
  };

  const regions = [];
  for (const regionId of Object.keys(cfg.regions).sort((a, b) => cfg.regions[a].order - cfg.regions[b].order)) {
    const region = cfg.regions[regionId];
    // Phase 6: the shadow layer's region is never a tab. It exists so an
    // exogenous cue pays the same clamps a touch does, and the player does
    // not get to pick it any more than they get to pick who walks past.
    if (region.kind === 'ambient') continue;
    const partIds = Object.keys(cfg.parts).filter(p => cfg.parts[p].region === regionId);
    if (region.genital) {
      for (const g of genitalRegions.filter(x => x.regionId === regionId)) {
        const parts = partIds.map(p => buildPart(p, g.sideToken)).filter(Boolean);
        if (parts.length) regions.push({ regionId, label: nightRegister(g.label, target), instance: g.index, kind: region.kind || 'touch', parts });
        else noteBlocked(regionId, nightRegister(g.label, target), g.index, region.kind || 'touch', partIds);
      }
      continue;
    }
    const label = (regionId === 'chest' && variant === 'flat' && region.flatLabel) ? region.flatLabel : region.label;
    const parts = partIds.map(p => buildPart(p, '-')).filter(Boolean);
    if (parts.length) regions.push({ regionId, label: nightRegister(label, target), instance: 0, kind: region.kind || 'touch', parts });
    else if ((region.kind || 'touch') === 'touch') {
      noteBlocked(regionId, nightRegister(label, target), 0, region.kind || 'touch', partIds);
    }
  }
  return { regions, blockedRegions, instruments };
}

// Is this move's graph edge available from where she is right now (D36)?
// Non-move motions are always "open" — the pose graph only gates its own
// edges. PURE.
function nightMoveEdgeOpen(record, motion) {
  if (!motion || motion.family !== 'move') return true;
  if (motion.pose && motion.pose.from.indexOf(record?.pose) < 0) return false;
  if (motion.covers && motion.covers.from.indexOf(record?.covers) < 0) return false;
  // Phase 7: the clothing axis is walked by the same family, so its edges are
  // checked the same way. A garment that is not in this session's set has no
  // state at all and its edge is closed — which is how a nude target ends up
  // with no garment rows rather than with rows that refuse.
  if (motion.garment && motion.garment.from.indexOf(nightGarmentState(record, motion.garment.id)) < 0) return false;
  return true;
}

// `part.side.instrument.motion.pace` (D16). The SIDE slot answers "which
// one": left/right/both for a paired part, and gN for the Nth genital of a
// type when she carries two (D35), '-' when the question doesn't arise.
// PURE.
function parseNightActionId(actionId) {
  if (typeof actionId !== 'string') return null;
  const bits = actionId.split('.');
  if (bits.length !== 5) return null;
  const [partId, side, instrumentId, motionId, paceId] = bits;
  if (!partId || !side || !instrumentId || !motionId || !paceId) return null;
  return { partId, side, instrumentId, motionId, paceId };
}

function composeNightActionId(partId, side, instrumentId, motionId, paceId) {
  return `${partId}.${side || '-'}.${instrumentId}.${motionId}.${paceId}`;
}

// The one gatekeeper. D31: the resolver REFUSES an id the tables cannot
// compose rather than resolving it to something. It also refuses an id the
// current STATE forbids — an out-of-reach part, a covered one, a Cleanup for
// evidence that isn't outstanding, a Move edge that doesn't exist from here.
// Returns { ok, reason } plus the resolved defs so the caller doesn't look
// them up twice. PURE.
function nightActionValid(gs, targetId, actionId) {
  const cfg = BOUNDARY.nightScene;
  const target = gs?.npcs?.[targetId];
  const record = target?.flags?._nightScene;
  if (!target || !record) return { ok: false, reason: 'no_session' };
  const parsed = parseNightActionId(actionId);
  if (!parsed) return { ok: false, reason: 'bad_id' };

  const part = cfg.parts[parsed.partId];
  if (!part) return { ok: false, reason: 'no_part' };
  const pace = cfg.pace[parsed.paceId];
  if (!pace) return { ok: false, reason: 'no_pace' };
  const instrument = nightInstrumentDef(gs, parsed.instrumentId);
  if (!instrument) return { ok: false, reason: 'no_instrument' };
  const motion = cfg.motions[parsed.motionId];
  if (!motion) return { ok: false, reason: 'no_motion' };
  if (nightMotionsFor(parsed.partId, instrument.base).indexOf(parsed.motionId) < 0) {
    return { ok: false, reason: 'invalid_combination' };
  }

  // Side: paired parts must name one, genital-region parts name which of her
  // genitals, everything else takes '-'.
  const region = cfg.regions[part.region] || {};
  if (part.paired) {
    if (['left', 'right', 'both'].indexOf(parsed.side) < 0) return { ok: false, reason: 'bad_side' };
  } else if (region.genital) {
    const owned = nightGenitalRegions(target).filter(g => g.regionId === part.region);
    if (!owned.length) return { ok: false, reason: 'no_genital' };
    const token = parsed.side === '-' ? 'g1' : parsed.side;
    if (!owned.some(g => g.sideToken === token)) return { ok: false, reason: 'bad_side' };
  } else if (parsed.side !== '-') {
    return { ok: false, reason: 'bad_side' };
  }

  if (part.variant && part.variant !== nightChestVariant(target)) return { ok: false, reason: 'wrong_variant' };
  if (!nightPartReachable(record, parsed.partId)) return { ok: false, reason: 'unreachable' };
  if (part.clears && (record.evidence || []).indexOf(part.clears) < 0) return { ok: false, reason: 'no_evidence' };
  if (!nightMoveEdgeOpen(record, motion)) return { ok: false, reason: 'no_edge' };

  return { ok: true, reason: null, parsed, part, motion, pace, instrument, region };
}

// D27's axis. Pace does double duty here: `gentle` is how you APPROACH a part
// whose full intensity she is not ready for. PURE.
function nightActionIntensity(part, motion, pace) {
  return (part.intensity || 0) + (motion.intensityOffset || 0) + (pace.intensityOffset || 0);
}

// --- Phase 3a: D28's derived touch preferences ------------------------------

// Every NPC has touch preferences and they are DERIVED, never stored — a pure
// function of the character's genSeed on its own seed stream, exactly the
// TASTE_TUNING / taste.js model (npcTaste/deriveNpcTaste is the precedent),
// so old saves need no migration and the same save always reproduces the same
// preferences. Discovery is the game: nothing here is shown up front.
//
// D35's ordering rule is load-bearing: an authored `sensitivity` on a genital
// entry or on `breasts` is READ FIRST and wins for the parts it covers, so
// the night scene can never silently contradict a character's own bible. A
// sensitivity that reads as neither loved nor disliked ('average', etc.) still
// consumes those parts — the bible said average, and the roll does not get to
// overrule it. `bible.physical.intimate.preferences` is the authored override
// for hand-written characters, the way `authoredFields` protects hand-written
// bible values elsewhere. PURE.
function nightPreferences(npc) {
  const cfg = BOUNDARY.nightScene;
  const P = cfg.prefs;
  const parts = {};
  const motions = {};
  const intimate = npc?.bible?.physical?.intimate || {};

  const bandOf = (s) => {
    const v = String(s || '').toLowerCase();
    if (!v) return null;
    if (P.sensitivityLoved.indexOf(v) >= 0) return 'loved';
    if (P.sensitivityDisliked.indexOf(v) >= 0) return 'disliked';
    return 'neutral';
  };
  const partsInRegion = (regionId) => Object.keys(cfg.parts).filter(p => cfg.parts[p].region === regionId);

  const chestBand = bandOf(intimate.breasts?.sensitivity);
  if (chestBand) for (const id of partsInRegion('chest')) parts[id] = chestBand;
  for (const g of (intimate.genitals || [])) {
    const regionId = Object.keys(cfg.regions).find(r => cfg.regions[r].genital === g?.type);
    const band = bandOf(g?.sensitivity);
    if (regionId && band) for (const id of partsInRegion(regionId)) parts[id] = band;
  }
  // The authored override outranks even the sensitivity read.
  const authored = intimate.preferences || {};
  for (const id of (authored.loved || [])) if (cfg.parts[id]) parts[id] = 'loved';
  for (const id of (authored.disliked || [])) if (cfg.parts[id]) parts[id] = 'disliked';
  for (const id of (authored.lovedMotions || [])) if (cfg.motions[id]) motions[id] = 'loved';
  for (const id of (authored.dislikedMotions || [])) if (cfg.motions[id]) motions[id] = 'disliked';

  const raw = npc?.bible?.genSeed ?? npc?.genSeed ?? null;
  const seedBase = (typeof raw === 'number' && isFinite(raw)) ? raw : hashStr(String(raw ?? npc?.id ?? 'npc'));
  const rng = mulberry32(((seedBase >>> 0) + P.seedSalt) >>> 0);
  // Phase 6: 'ambient' joins move/cleanup in the exclusion. Nobody has a
  // preference about a door closing down the hall, and leaving the shadow
  // layer's parts in the pool would ALSO have silently re-rolled every
  // existing character's preferences by changing what pickUnique draws from.
  const touchable = Object.keys(cfg.parts).filter((p) => {
    const kind = (cfg.regions[cfg.parts[p].region] || {}).kind;
    return kind !== 'move' && kind !== 'cleanup' && kind !== 'ambient';
  });
  const touchMotions = Object.keys(cfg.motions).filter(m =>
    cfg.motions[m].family !== 'move' && cfg.motions[m].family !== 'cleanup'
    && cfg.motions[m].family !== 'ambient');

  const draw = (pool, count, band, into) => {
    const free = pool.filter(id => !Object.prototype.hasOwnProperty.call(into, id));
    for (const id of pickUnique(rng, free, count)) into[id] = band;
  };
  draw(touchable, P.lovedParts, 'loved', parts);
  draw(touchable, P.dislikedParts, 'disliked', parts);
  draw(touchMotions, P.lovedMotions, 'loved', motions);
  draw(touchMotions, P.dislikedMotions, 'disliked', motions);

  // 'neutral' was only a placeholder holding a bible-authored part out of the
  // draw; callers should only ever see real preferences.
  for (const k of Object.keys(parts)) if (parts[k] === 'neutral') delete parts[k];
  return { parts, motions };
}

// The three multipliers a preference contributes. A loved part raises heat
// gain, WIDENS the D27 window (she will let you move faster somewhere she
// loves) and slightly lowers wakefulness; a disliked one does the opposite,
// because an unwelcome touch rouses. PURE.
function nightPreferenceMults(prefs, partId, motionId) {
  const P = BOUNDARY.nightScene.prefs;
  let heat = 1, window = 1, wake = 1;
  for (const band of [prefs.parts[partId], prefs.motions[motionId]]) {
    if (!band || !P[band]) continue;
    heat *= P[band].heatMult; window *= P[band].windowMult; wake *= P[band].wakeMult;
  }
  return { heat, window, wake };
}

// D29: how much Heat it takes to wake WILLING rather than hostile is a
// per-NPC moving target driven by her relationship with the player and her
// own deviancy — a warm, adventurous partner needs very little; a cold,
// conservative near-stranger needs almost all of it. Deterministic: a read,
// not a roll, so D6's "earned, never rolled for free" is unchanged. Reads
// ABSOLUTE heat, not D38's cycle position. PURE.
function nightWillingThreshold(gs, npc) {
  const W = BOUNDARY.nightScene.willing;
  const rel = npc?.relPlayer || {};
  const unit = (v) => (Math.max(-1, Math.min(1, typeof v === 'number' ? v : 0)) + 1) / 2;
  const relScore = Math.max(0, Math.min(1,
    unit(rel.affection) * W.affectionWeight
    + unit(rel.desire) * W.desireWeight
    + Math.max(0, Math.min(1, (rel.intimacyLevel || 0) / 100)) * W.intimacyWeight));
  const dev = Math.max(0, Math.min(1, npcDeviancy(npc)));
  return Math.max(W.min, Math.min(W.max, W.base - relScore * W.relWeight - dev * W.deviancyWeight));
}

// D36: a warm NPC moves WITH you semi-consciously, so heat scales a move's
// cost DOWN. This is the second thing Heat is for, and it is a benefit
// coupling only — never mirror it into a penalty (that would be D7). Cost is
// deliberately NOT scaled by current wakefulness: that reads as the more
// physical model but it is a positive feedback loop and would spiral a
// session into an unrecoverable state through no decision the player made.
// PURE.
function nightMoveDiscount(record) {
  const M = BOUNDARY.nightScene.move;
  const pliancy = Math.max(0, Math.min(1, (record?.heat || 0) / M.heatPliancyFull));
  return 1 - pliancy * M.heatDiscountMax;
}

// --- Phase 3a: D27's Intensity Acceleration Resistance ----------------------

// The gain factor and the verdict for a gap, with the whole window scaled by
// the NPC's preference for this part/motion. This is the piece that makes
// Heat a resource rather than a counter: step up INSIDE the window and you
// gain, overshoot and you LOSE heat and rouse her, regress far below her
// level and you gain almost nothing. The regression tail decays toward zero
// and never goes negative — going back to a thigh after full sex is not
// unpleasant, it is merely ineffective. PURE.
function nightHeatFactor(gap, windowMult) {
  const I = BOUNDARY.nightScene.iar;
  const ideal = I.idealPeak * windowMult;
  const tooFast = I.tooFastAt * windowMult;
  const stale = I.staleAt * windowMult;
  if (gap > tooFast) return { verdict: 'overshoot', factor: 0, over: gap - tooFast };
  if (gap >= ideal) {
    const t = (gap - ideal) / Math.max(1e-9, tooFast - ideal);
    return { verdict: 'step', factor: 1 + t * (I.edgeFactor - 1), over: 0 };
  }
  if (gap >= 0) {
    const t = gap / Math.max(1e-9, ideal);
    return { verdict: 'level', factor: I.atLevelFactor + t * (1 - I.atLevelFactor), over: 0 };
  }
  if (gap >= stale) {
    const t = (gap - stale) / Math.max(1e-9, 0 - stale);
    return { verdict: 'maintain', factor: I.maintainFloor + t * (I.atLevelFactor - I.maintainFloor), over: 0 };
  }
  return { verdict: 'regression', factor: I.maintainFloor * (stale / gap), over: 0 };
}

// One action's heat half, and the wake multiplier the D27 verdict imposes.
// D38's load-bearing fix lives here: the gap reads the WITHIN-CYCLE position
// (heat mod iar.cycle), NOT absolute heat, because intensity tops out around
// 100 and at heat 250 every action would otherwise read as a deep regression
// and heat could never reach 300. The side effect is the better model — after
// a climax the escalation curve restarts and you have to warm her back up.
// The overshoot PENALTY is deliberately not scaled by preference: the window
// widening already carries "she will let you move faster there", and scaling
// the punishment too would let a loved part absorb a genuine misjudgement.
// PURE.
function nightHeatStep(record, part, motion, pace, instrument, isSoothe, prefs) {
  const cfg = BOUNDARY.nightScene;
  const I = cfg.iar;
  const intensity = nightActionIntensity(part, motion, pace);
  if (motion.family === 'move' || motion.family === 'cleanup' || motion.family === 'ambient') {
    return { verdict: 'neutral', intensity, gap: 0, factor: 0, heatDelta: 0, wakeMult: 1 };
  }
  if (isSoothe) {
    return { verdict: 'soothe', intensity, gap: 0, factor: 0, heatDelta: cfg.soothe.heat, wakeMult: 1 };
  }
  const cycleHeat = ((record.heat || 0) % I.cycle + I.cycle) % I.cycle;
  const gap = intensity - cycleHeat;
  const f = nightHeatFactor(gap, prefs.window);
  if (f.verdict === 'overshoot') {
    const ramp = Math.min(1, f.over / Math.max(1e-9, I.overshootWakeRamp));
    return {
      verdict: 'overshoot', intensity, gap, factor: 0,
      heatDelta: -f.over * I.overshootHeatLoss,
      wakeMult: 1 + ramp * (I.overshootWakeMax - 1),
    };
  }
  const base = (part.heat || 0) * (motion.heatMult ?? 1) * (pace.heatMult ?? 1) * (instrument.heatMult ?? 1);
  return { verdict: f.verdict, intensity, gap, factor: f.factor, heatDelta: base * f.factor * prefs.heat, wakeMult: 1 };
}

// --- Phase 3a: the one resolver --------------------------------------------

// One action — a touch, a soothe, a Cleanup or a Move, all through the same
// door (D16/D17). Wakefulness/Stirring gain = the part's seeded base range ×
// the motion, pace and instrument multipliers × the sleeper's dynamic-tier
// multiplier (boundaryTierFor) × the player's stealth-scaled skillMult ×
// D28's preference multiplier; Stirring is that SAME magnitude scaled a
// SECOND, independently-shrinking time by stirringRate (D2) — the doubled
// skill benefit that makes a maxed-stealth session feel like "free play".
//
// A soothe (D17) is not a separate action: it is a soothing-capable part × a
// calming motion × gentle pace, and it DRAINS the magnitude it would have
// added. Stirring still rises on it — that is the anti-spam rule, so
// soothe-forever is not a strategy.
//
// Wakefulness is clamped to [stirring, detectionWake]; hitting the cap is an
// instant forced wake, and the ONLY place Heat and Wakefulness meet on the
// resolution side is right there, as D29's per-NPC tiebreak read at that
// instant (D6/D14) — never a running feedback loop.
//
// PURE — returns deltas and the new totals; applyNightStep (below) or the
// harness writes them onto the live record.
function nightStepAction(gs, targetId, actionId, seedCtx) {
  const cfg = BOUNDARY.nightScene;
  const target = gs?.npcs?.[targetId];
  const record = target?.flags?._nightScene;
  if (!target || !record || record.resolved != null) return null;
  const v = nightActionValid(gs, targetId, actionId);
  if (!v.ok) return null;
  const { parsed, part, motion, pace, instrument } = v;

  const tier = boundaryTierFor(gs, target);
  const tierMult = cfg.tierRiskMult[tier] ?? 1;
  const level = skillLevel(gs.player, 'stealth');
  const skillMult = cfg.skillMult[level];
  const stirringRate = cfg.stirringRate[level];

  const rng = seededRng(gs.meta.seed, `night_act_${targetId}_${actionId}_${seedCtx}`);
  const [lo, hi] = part.wakeDelta;
  const rolled = lo + rng() * (hi - lo);

  const prefTable = nightPreferences(target);
  const prefs = nightPreferenceMults(prefTable, parsed.partId, parsed.motionId);

  const isSoothe = !!(part.soothing && motion.calming && parsed.paceId === 'gentle');
  const heat = nightHeatStep(record, part, motion, pace, instrument, isSoothe, prefs);

  // The base magnitude reads NOTHING from heat or wakefulness. The only heat
  // terms in the whole wake side are heat.wakeMult (D27's overshoot) and
  // nightMoveDiscount (D36's pliancy) — both deliberate, both documented.
  let magnitude = rolled * (motion.wakeMult ?? 1) * (pace.wakeMult ?? 1) * (instrument.wakeMult ?? 1)
    * tierMult * skillMult * prefs.wake;
  if (motion.family === 'move') magnitude *= (motion.magnitude ?? 1) * nightMoveDiscount(record);
  magnitude *= heat.wakeMult;

  const rawWakeDelta = isSoothe ? -(magnitude * cfg.soothe.drainMult) : magnitude;
  const stirGain = Math.abs(magnitude) * stirringRate * (isSoothe ? cfg.soothe.stirMult : 1);

  const newFloor = record.floor + stirGain;
  const newDetection = Math.min(cfg.thresholds.detectionWake,
    Math.max(newFloor, record.detection + rawWakeDelta));
  // D38: heat is UNBOUNDED above. The Math.min(100, ...) that used to sit
  // here is exactly the line D38 deletes. It still cannot go below zero.
  const newHeat = Math.max(0, record.heat + heat.heatDelta);
  const prevClimax = record.climaxCount || 0;
  const newClimax = Math.max(prevClimax, Math.floor(newHeat / cfg.thresholds.climaxEvery));

  // Phase 7: a GARMENT tag can only be left by a session that has that garment.
  // Without this a nude target still accumulated "panties" and "shirt" from the
  // parts that name them, and Cleanup then offered to straighten underwear she
  // was never wearing — the bug in the mirror of the missing undress action.
  const garmentIds = nightGarmentIds(record);
  const evidenceAdded = [...new Set([...(part.evidence || []), ...(motion.evidence || [])])]
    .filter(tag => (record.evidence || []).indexOf(tag) < 0)
    .filter(tag => !cfg.garments[tag] || garmentIds.indexOf(tag) >= 0);
  const evidenceCleared = part.clears || null;

  const pose = motion.pose ? motion.pose.to : record.pose;
  const covers = motion.covers ? motion.covers.to : record.covers;
  // The clothing delta, as a whole next-state map so applyNightStep commits it
  // the same way it commits pose and covers: the resolver decides, the mutator
  // only writes. `restores` is Cleanup's half — putting a garment back ON.
  const clothing = { ...(record.clothing || {}) };
  if (motion.garment && Object.prototype.hasOwnProperty.call(clothing, motion.garment.id)) {
    clothing[motion.garment.id] = motion.garment.to;
  }
  if (part.restores && Object.prototype.hasOwnProperty.call(clothing, part.restores)) {
    clothing[part.restores] = 'on';
  }
  const clothingChanged = JSON.stringify(clothing) !== JSON.stringify(record.clothing || {});
  const woke = newDetection >= cfg.thresholds.detectionWake;
  // Phase 6: the shadow layer pays the same costs but earns nothing. XP is
  // D23's reward for an action COMPLETED, and surviving a noise you did not
  // make is not a demonstration of anything.
  const isAmbient = motion.family === 'ambient';
  const xp = isAmbient ? 0 : (cfg.xp.perAction + Math.max(0, heat.intensity) * cfg.xp.perIntensity);

  return {
    actionId, ambient: isAmbient,
    partId: parsed.partId, side: parsed.side, instrumentId: parsed.instrumentId,
    motionId: parsed.motionId, paceId: parsed.paceId,
    wakeDelta: newDetection - record.detection,
    stirDelta: newFloor - record.floor,
    heatDelta: newHeat - record.heat,
    detection: newDetection, floor: newFloor, heat: newHeat,
    intensity: heat.intensity, gap: heat.gap, verdict: heat.verdict, soothe: isSoothe,
    evidenceAdded, evidenceCleared,
    pose, covers, poseChanged: pose !== record.pose, coversChanged: covers !== record.covers,
    clothing, clothingChanged,
    garmentId: (motion.garment && garmentIds.indexOf(motion.garment.id) >= 0) ? motion.garment.id : (part.restores || null),
    garmentTo: motion.garment ? motion.garment.to : (part.restores ? 'on' : null),
    climaxCount: newClimax, climaxed: newClimax > prevClimax,
    xp, woke,
    outcome: woke
      ? (newHeat >= nightWillingThreshold(gs, target) ? 'wake_willing' : 'wake_hostile')
      : null,
  };
}

// --- Phase 6: the shadow layer ----------------------------------------------

// Who else is moving around out there, and how close. The scene runs LIVE
// (D24) and the sim keeps running under it, so the flat's other residents are
// real, moving, and entirely outside the player's control — the one pressure
// in this game that is not a consequence of the player's own judgement.
//
// Anyone asleep makes no noise, the target makes no noise about themselves,
// and the player is already accounted for by every action they take. Returns
// the CLOSEST proximity found, or null for an empty (or sleeping) flat, which
// is why a 3am session with everyone in bed is genuinely quiet. PURE.
function nightAmbientProximity(gs, targetId) {
  const target = gs?.npcs?.[targetId];
  const roomId = target?.location;
  if (!roomId) return null;
  const adjacent = (typeof ROOM_ADJACENCY !== 'undefined' && ROOM_ADJACENCY[roomId]) || [];
  let best = null;
  for (const [id, npc] of Object.entries(gs.npcs || {})) {
    if (id === targetId || !npc || !npc.location) continue;
    const actv = String(npc.activity || '').toLowerCase();
    if (actv === 'sleeping' || actv === 'napping') continue;
    if (npc.location === roomId) return { proximity: 'here', npcId: id };
    if (adjacent.indexOf(npc.location) >= 0) { best = { proximity: 'near', npcId: id }; continue; }
    if (!best) best = { proximity: 'far', npcId: id };
  }
  return best;
}

// One cue, or null. `slot` is the elapsed-minutes bucket the caller is asking
// about — it is what makes the roll stable across repaints and reproducible
// from the save, exactly as `touches.length` does for a player action.
//
// The return is a COMPOSED ACTION ID, not a delta: the whole point of the
// shadow layer is that an exogenous risk resolves through nightStepAction
// like everything else, paying the same tier multiplier, the same skill
// scaling, the same [Stirring, 100] clamp and the same monotonic Stirring
// (invariant 6 — no parallel channel, for risk or for consequence). PURE.
function nightAmbientCue(gs, targetId, slot) {
  const cfg = BOUNDARY.nightScene;
  const A = cfg.ambient;
  const target = gs?.npcs?.[targetId];
  const record = target?.flags?._nightScene;
  if (!target || !record || record.resolved != null) return null;
  const near = nightAmbientProximity(gs, targetId);
  if (!near) return null;
  const rng = seededRng(gs.meta.seed, `night_ambient_${targetId}_${slot}`);
  if (rng() >= A.chance) return null;
  const partId = A.parts[near.proximity];
  if (!partId) return null;
  return {
    ...near, slot,
    actionId: composeNightActionId(partId, '-', A.instrument || 'world', 'cue', 'steady'),
  };
}

// --- Phase 6: D28's learned preferences (the WRITER) ------------------------

// What the player has learned about this character, ever. Player-side
// knowledge, not NPC state: `player.nightKnown[npcId] = { parts: {...},
// motions: {...} }`, each value the band that was learned. Deliberately NOT
// `player.ledger[npcId]`, which D28 gestured at — that is an ARRAY of
// day-stamped ACTS with a spent flag, read by the codex's confront/spread
// verbs, and a preference is not an act. Same folder, so it saves and loads
// with the player for free. PURE.
function nightKnownFor(gs, targetId) {
  const known = (gs && gs.player && gs.player.nightKnown) || {};
  const rec = known[targetId] || {};
  return { parts: rec.parts || {}, motions: rec.motions || {} };
}

// How many times this session has already worked a given part / used a given
// motion. Derived from `record.touches`, which is the ordered action-id
// history — so learning needs no counter of its own and a reload replays it
// exactly. PURE.
function nightActionCounts(record) {
  const parts = {}; const motions = {};
  for (const id of (record?.touches || [])) {
    const p = parseNightActionId(id);
    if (!p) continue;
    parts[p.partId] = (parts[p.partId] || 0) + 1;
    motions[p.motionId] = (motions[p.motionId] || 0) + 1;
  }
  return { parts, motions };
}

// D28: discovery is the game. A preference becomes KNOWN once the player has
// worked that part (or used that motion) `prefs.learnAfter` times in one
// session — enough repeats that "she likes this" is a read off her rather
// than a guess. A NEUTRAL part never becomes known however many times it is
// worked, so an unmarked chip stays ambiguous instead of becoming a
// confirmed-nothing tell. Returns what SHOULD now be known; the caller
// commits it. PURE.
function resolveNightLearning(gs, targetId) {
  const target = gs?.npcs?.[targetId];
  const record = target?.flags?._nightScene;
  if (!target || !record) return null;
  const need = BOUNDARY.nightScene.prefs.learnAfter;
  const prefs = nightPreferences(target);
  const counts = nightActionCounts(record);
  const known = nightKnownFor(gs, targetId);
  const parts = {}; const motions = {};
  let changed = false;
  for (const [id, band] of Object.entries(prefs.parts)) {
    if ((counts.parts[id] || 0) < need) continue;
    parts[id] = band;
    if (known.parts[id] !== band) changed = true;
  }
  for (const [id, band] of Object.entries(prefs.motions)) {
    if ((counts.motions[id] || 0) < need) continue;
    motions[id] = band;
    if (known.motions[id] !== band) changed = true;
  }
  return { changed, parts: { ...known.parts, ...parts }, motions: { ...known.motions, ...motions } };
}

// The writer. MUTATES gs.player.nightKnown, and only when something actually
// became known — so a session that teaches nothing writes nothing. Returns
// true when it wrote.
function applyNightLearning(gs, targetId) {
  const next = resolveNightLearning(gs, targetId);
  if (!next || !next.changed) return false;
  gs.player = {
    ...gs.player,
    nightKnown: { ...(gs.player.nightKnown || {}), [targetId]: { parts: next.parts, motions: next.motions } },
  };
  return true;
}

// rollGhostSuspicion is GONE (Phase 5, D25). It was a private
// evidence-weighted chance rolled by this file and stamped by nobody; the
// replacement is resolveNightSceneConsequence + applyNightSceneEnd below,
// which hand the leftover evidence to the SHARED stealth machinery
// (LEAVE_EVIDENCE -> sim.js's per-tick discovery scan -> ui.js's
// ADJUST_SUSPICION) so the NPC's later inference runs down the same channel
// as every other stealth consequence in the game. `BOUNDARY.nightScene.
// suspicion` went with it. Do not reintroduce either: invariant 6's rule
// about parallel channels applies to consequences as much as to risk.

// --- Phase 3a: D30/D32's authored narration ---------------------------------
// The LLM is not in the loop AT ALL for an action. Every line is composed
// here from fragment pools under a seeded pick — composePeekViewLine is the
// working precedent — so it appears instantly and varies between repeats.
// D32's contract: two halves. Half one is what you DID; half two is what she
// did back, and half two is keyed on STATE rather than on the action, which
// is what makes a repeated touch read as a scene progressing rather than a
// button being pressed. A phrasing failure degrades to the fallback line
// while the mechanics stand.

function nightHeatBand(heat) {
  const cycle = ((heat || 0) % BOUNDARY.nightScene.iar.cycle + BOUNDARY.nightScene.iar.cycle)
    % BOUNDARY.nightScene.iar.cycle;
  if (cycle < 25) return 'cold';
  if (cycle < 50) return 'warm';
  if (cycle < 80) return 'hot';
  return 'burning';
}

function nightWakeBand(detection) {
  if (detection < 30) return 'still';
  if (detection < 60) return 'shifting';
  if (detection < 85) return 'surfacing';
  return 'brink';
}

// --- Phase 6: the register --------------------------------------------------
// Every authored string in BOUNDARY.nightScene is written in the FEMININE
// (see the header on `prose`), and this is the single choke point where it
// becomes the target's own register. Two-way by construction: this codebase's
// `gender` enum has no non-binary value, so there is no verb-agreement
// problem to solve and the whole thing is a word swap. The masculine grouping
// is the one the rest of the engine already uses (sim.js's name pools,
// config.js's breastPoolForGender): male and trans_male.
function nightMasculine(npc) {
  const g = String(npc?.bible?.gender || '').toLowerCase();
  return g === 'male' || g === 'trans_male';
}

// The swap. `{o}` is the OBJECT case, which is the one thing the authored
// strings have to mark by hand because English spells the feminine object and
// the feminine possessive the same way and the masculine does not ("touching
// her" -> "touching him", but "her hair" -> "his hair"). Everything else is
// read straight off the word.
//
// IDEMPOTENT on purpose: nothing it emits ('his', 'he', 'him', 'himself', or
// the feminine forms it leaves alone) matches any pattern it looks for, so it
// is safe to apply at every text exit point without tracking which strings
// have already been through it. That is what lets the view model register a
// whole label set without the painter having to know the rule exists. PURE.
function nightRegister(text, npc) {
  const masc = nightMasculine(npc);
  return String(text == null ? '' : text).replace(
    /\{o\}|\{O\}|\bher\b|\bHer\b|\bshe\b|\bShe\b|\bhers\b|\bherself\b/g,
    (m) => {
      switch (m) {
        case '{o}': return masc ? 'him' : 'her';
        case '{O}': return masc ? 'Him' : 'Her';
        case 'her': return masc ? 'his' : 'her';
        case 'Her': return masc ? 'His' : 'Her';
        case 'she': return masc ? 'he' : 'she';
        case 'She': return masc ? 'He' : 'She';
        case 'hers': return masc ? 'his' : 'hers';
        case 'herself': return masc ? 'himself' : 'herself';
        default: return m;
      }
    });
}

// D33's two-label rule in action: prose always uses the STANDALONE label,
// because prose has not established the region the way the tray has. The side
// slot splices in ("her nipple" -> "her left nipple"); 'both' takes the
// authored plural, and falls back to prose.side.both when a paired part has
// none — which is the only thing that key is for, and why it is no longer the
// dead config Phase 3b/4/5 kept flagging. Still authored in the feminine:
// nightRegister runs downstream of this. PURE.
function nightTargetPhrase(part, side) {
  const S = BOUNDARY.nightScene.prose.side;
  const base = part.standalone || part.label || '';
  if (side === 'both') return part.plural || base.replace(/^her /i, S.both);
  if (!S[side]) return base;
  return base.replace(/^her /i, S[side]).replace(/^his /i, S[side].replace(/^her /, 'his '));
}

function composeNightLine(gs, targetId, result, seedCtx) {
  const cfg = BOUNDARY.nightScene;
  const PR = cfg.prose;
  if (!result) return null;
  const target = gs && gs.npcs ? gs.npcs[targetId] : null;
  const part = cfg.parts[result.partId];
  const motion = cfg.motions[result.motionId];
  const pace = cfg.pace[result.paceId];
  const instrument = nightInstrumentDef(gs, result.instrumentId);
  if (!part || !motion || !pace) {
    const fb = nightRegister(PR.fallback, target);
    return { act: fb, response: '', text: fb };
  }

  const rng = mulberry32((hashStr(`night_line|${targetId}|${result.actionId}|${seedCtx}`)
    + ((gs?.meta?.seed || 0) >>> 0)) >>> 0);
  const pick = (pool) => (Array.isArray(pool) && pool.length) ? pool[Math.floor(rng() * pool.length)] : '';

  const targetPhrase = nightTargetPhrase(part, result.side);
  const manner = pick(PR.manner[result.paceId] || []);
  let act;
  if (motion.family === 'ambient') {
    // Phase 6: the act half of a cue is not something YOU did, so it never
    // touches actFrames. Everything BELOW is composed exactly as it is for a
    // touch, which is the point — the player reads the cost of the world's
    // noise in the same vocabulary they read the cost of their own hand.
    act = pick((PR.ambient || {})[result.partId] || []);
  } else if (motion.phrase) {
    act = `You ${motion.phrase}${manner}.`;
  } else {
    const frame = pick(PR.actFrames);
    act = frame
      .replace(/\{gerund\}/g, motion.gerund)
      .replace(/\{verb\}/g, motion.verb)
      .replace(/\{target\}/g, targetPhrase)
      .replace(/\{instrument\}/g, instrument ? instrument.standalone : 'your hand')
      .replace(/\{manner\}/g, manner)
      .replace(/\{Manner\}/g, (manner || '').trim().replace(/^./, c => c.toUpperCase()));
  }
  act = act.replace(/\s{2,}/g, ' ').replace(/ \./g, '.').trim();

  // Half two, keyed on STATE. The wakefulness band takes precedence once she
  // is genuinely close to surfacing — that is the thing the player most needs
  // to read off the prose (D32: the log is the primary feedback channel and
  // the bars are secondary).
  const bits = [];
  const verdictLine = pick(PR.verdict[result.verdict] || PR.verdict.neutral);
  if (verdictLine) bits.push(verdictLine);
  const wakeBand = nightWakeBand(result.detection);
  const stateLine = (wakeBand === 'surfacing' || wakeBand === 'brink')
    ? pick(PR.wakeBand[wakeBand]) : pick(PR.heatBand[nightHeatBand(result.heat)]);
  if (stateLine) bits.push(stateLine);
  if (result.poseChanged) {
    const poseLine = PR.poseLines[result.pose];
    if (poseLine) bits.push(pick(PR.poseChange).replace(/\{poseLine\}/g, poseLine));
  }
  if (result.coversChanged && PR.coverLines[result.covers]) bits.push(PR.coverLines[result.covers]);
  // Phase 7: the clothing axis's state half. The act half is already the
  // motion's own authored phrase ("You pull her panties aside").
  if (result.clothingChanged && result.garmentId) {
    const pool = result.garmentTo === 'on' ? PR.garmentRestored : PR.garmentLines;
    if (pool && pool[result.garmentId]) bits.push(pool[result.garmentId]);
  }
  if (result.climaxed) bits.push(pick(PR.climax));
  if (result.woke) bits.push(pick(PR.woke));

  // Phase 6: the ONE place the authored feminine register becomes the
  // target's own (see nightRegister). Everything above composes in the
  // feminine and this converts once, at the end, so a new pool never has to
  // remember the rule.
  const reg = (t) => nightRegister(t, target);
  act = reg(act);
  const response = reg(bits.filter(Boolean).join(' '));
  const text = [act, response].filter(Boolean).join(' ') || reg(PR.fallback);
  return { act, response, text };
}

// --- Phase 2: session state + lifecycle -------------------------------------

// True while a session is open and unresolved — the re-entry guard AND the
// load-time sweep below both read this one definition.
function hasActiveNightScene(npc) {
  const rec = npc && npc.flags && npc.flags._nightScene;
  return !!(rec && rec.resolved == null);
}

// The entry guard: resident, asleep, in the player's own room, no active
// cold-shoulder, not already mid-session. The willingness function is still
// consulted and returned (targetGate) even though it's expected to return
// the asleep floor (-1) — the same invariant-1 audit trail resolveBoundaryGate
// keeps: this is why the whole feature is an ATTEMPT, never a completed act
// with a sleeping participant. PURE.
function resolveNightSceneGate(gs, targetId, ctx = {}) {
  const roomId = ctx.location || (gs && gs.player && gs.player.location);
  const target = gs && gs.npcs ? gs.npcs[targetId] : null;
  if (!target) return { allowed: false, reason: 'no_target' };
  if (!roomId || target.location !== roomId) return { allowed: false, reason: 'not_here' };
  if (target.residency?.status !== 'resident') return { allowed: false, reason: 'not_resident' };
  const actv = (target.activity || '').toLowerCase();
  if (actv !== 'sleeping' && actv !== 'napping') return { allowed: false, reason: 'not_asleep' };
  const targetGate = resolveWillingnessGate(gs, targetId, 'player', 'sex', {
    ...ctx, npcId: targetId, location: roomId,
  });
  if (coldShoulderActive(target)) return { allowed: false, reason: 'cold_shoulder', targetGate };
  if (hasActiveNightScene(target)) return { allowed: false, reason: 'already_active', targetGate };
  return { allowed: true, reason: null, targetId, roomId, targetGate };
}

// The garments a session starts with, from the sim's own `npc.clothing`
// (BOUNDARY.nightScene.garmentSets). Every entry starts 'on'. PURE.
function nightOpeningGarments(npc) {
  const cfg = BOUNDARY.nightScene;
  const state = String(npc?.clothing || '').toLowerCase();
  const set = cfg.garmentSets[state] || cfg.garmentSets.default;
  const out = {};
  for (const id of set) if (cfg.garments[id]) out[id] = 'on';
  return out;
}

// The pose she is found in. Seeded and deterministic like everything else, and
// it matters immediately: D34's gate means where she happens to be lying
// decides what the tray can offer on the first turn, and Move (D36) is the
// player's lever on that. PURE apart from its caller writing the result.
function rollNightOpeningPose(gs, targetId, day, minute) {
  const poses = Object.keys(BOUNDARY.nightScene.poses);
  const rng = seededRng(gs.meta.seed, `night_pose_${targetId}_${day}_${minute}`);
  return poses[Math.floor(rng() * poses.length)];
}

// Opens a session. MUTATES. Returns the new record, or null if the gate
// refuses (the action chip that will call this in Phase 6 is expected to
// have already checked resolveNightSceneGate for its own visibility, so a
// null here is a genuine race, not the common path).
//
// Phase 3a changed the record: `sheetStage` (initialised to 'covered' and
// read by nothing) is generalised into D34's `pose` + `covers`, `climaxCount`
// carries D38's monotone checkpoint, `xp` accumulates D23's per-action award,
// and `bailPending` is gone with D22's collapse to a single exit.
function openNightScene(gs, targetId, ctx = {}) {
  const gate = resolveNightSceneGate(gs, targetId, ctx);
  if (!gate.allowed) return null;
  const day = gs.meta.clock.day;
  const minute = Math.floor(gs.meta.clock.minutes * 100);
  const record = {
    targetId, openedDay: day, openedMinute: minute,
    detection: 0, floor: 0, heat: 0,
    evidence: [], touches: [],
    pose: rollNightOpeningPose(gs, targetId, day, minute), covers: 'covered',
    // Phase 7 (D34's third axis): what she is wearing, read from the sim ONCE
    // and frozen here. The scene must never re-read npc.clothing — changing it
    // is the scene's own job, and the sim would overwrite it on the next tick
    // (it pins a sleeper to 'sleepwear'). A nude target gets an empty map and
    // is exposed from the first turn, with no garment rows in Move and, since
    // a Cleanup row is only offered while its tag is outstanding, none there
    // either.
    clothing: nightOpeningGarments(gs.npcs[targetId]),
    climaxCount: 0, xp: 0,
    resolved: null,
  };
  gs.npcs[targetId] = {
    ...gs.npcs[targetId],
    flags: { ...(gs.npcs[targetId].flags || {}), _nightScene: record },
  };
  return record;
}

// The one place a resolved step is WRITTEN onto the live record — the pure
// resolver above decides everything, this only commits it. MUTATES. Returns
// the updated record, or null if there was nothing open to write onto.
function applyNightStep(gs, targetId, result) {
  const npc = gs && gs.npcs ? gs.npcs[targetId] : null;
  const rec = npc && npc.flags && npc.flags._nightScene;
  if (!rec || rec.resolved != null || !result) return null;
  const evidence = [...new Set([...rec.evidence, ...(result.evidenceAdded || [])])]
    .filter(tag => tag !== result.evidenceCleared);
  const next = {
    ...rec,
    detection: result.detection, floor: result.floor, heat: result.heat,
    evidence,
    pose: result.pose, covers: result.covers,
    clothing: result.clothing || rec.clothing || {},
    climaxCount: result.climaxCount,
    xp: (rec.xp || 0) + (result.xp || 0),
    touches: [...rec.touches, result.actionId],
  };
  gs.npcs[targetId] = { ...npc, flags: { ...npc.flags, _nightScene: next } };
  // Phase 6 (D28): the learning writer rides the one mutator, AFTER the
  // touch is on the record, because what is learned is a function of the
  // repeat count in `touches`. It writes to the PLAYER, never to her — an
  // NPC does not know what you have worked out about her (invariant 5's rule
  // about what an exit is allowed to land on holds for every step too).
  applyNightLearning(gs, targetId);
  return next;
}

// Abandoned mid-session — the player left the room, or the world otherwise
// moved on, without a real ending. Distinct from a deliberate exit:
// abandonment writes no evidence consequence and no XP, it just closes the
// record so it can't orphan a reload. MUTATES.
function abandonNightScene(gs, targetId) {
  const npc = gs && gs.npcs ? gs.npcs[targetId] : null;
  const rec = npc && npc.flags && npc.flags._nightScene;
  if (!rec || rec.resolved != null) return null;
  const flags = { ...npc.flags, _nightScene: { ...rec, resolved: 'abandon' } };
  gs.npcs[targetId] = { ...npc, flags };
  return flags._nightScene;
}

// D22: "Ghost" is a description, not a game state. There is no Ghost ending
// and no Bail ending — every exit from a session is a valid exit, and the
// only question a session answers on the way out is what evidence was left
// behind, which the world (Phase 5, via D25's shared stealth machinery)
// handles. So there is ONE voluntary exit and it has no name of its own; the
// caller reads record.evidence to decide whether to confirm first ("you'll
// leave two things behind"). A forced wake is still a distinct resolution,
// because she is awake at the end of it — that one is decided by the step
// function's own `outcome`. PURE.
function resolveNightSceneOutcome(gs, record, exitChoice) {
  if (!record || exitChoice !== 'leave') return null;
  return 'exit';
}

// Writes a final outcome onto the live record. The pure resolvers above
// (a step's own forced-wake `outcome`, or resolveNightSceneOutcome for a
// voluntary exit) decide WHAT happened; this is the one place that WRITES
// it. MUTATES. Returns the resolved record, or null if there was nothing
// open to resolve.
function resolveNightSceneEnd(gs, targetId, outcome) {
  const npc = gs && gs.npcs ? gs.npcs[targetId] : null;
  const rec = npc && npc.flags && npc.flags._nightScene;
  if (!rec || rec.resolved != null) return null;
  const flags = { ...npc.flags, _nightScene: { ...rec, resolved: outcome } };
  gs.npcs[targetId] = { ...npc, flags };
  return flags._nightScene;
}

// --- Phase 5: endings and the evidence handoff (D5/D22/D23/D25) ------------
// The rule this block exists to keep: EVERY consequence of a Night Scene lands
// on a surface the rest of the game already owns. Nothing below invents a
// suspicion roll, a relationship axis, an evidence store or an XP sink of its
// own. A voluntary exit hands its leftover evidence to LEAVE_EVIDENCE and lets
// sim.js's own discovery scan decide whether she ever puts it together; a
// willing wake hands off to applyReciprocatedAct, the same completed-paired-act
// footprint every other reciprocated boundary act writes; a hostile wake to
// applyShamingReactionLines + noteColdShoulder, verbatim; and the banked XP to
// awardSkillXp's existing 'stealth' sink. That is D25's ruling generalised:
// invariant 6's rule about parallel channels applies to consequences as much
// as to risk.

// Strength for the LEAVE_EVIDENCE stamp. D5's locked shape is
// evidence-WEIGHTED (how much was left uncleaned), never depth-weighted (how
// far the session went) — and strength is the right place to express it,
// because strength is exactly the term sim.js's per-tick discovery scan
// weights its chance by (STEALTH_TUNING.evidenceStrengthDiscoveryFactor).
// A clean exit passes 0 and no evidence is written at all, which is "an empty
// evidence array rolls at or near zero" exactly. PURE.
function nightEvidenceStrength(count) {
  const e = BOUNDARY.nightScene.exit;
  return Math.min(e.evidenceStrengthMax, Math.max(0, count || 0) * e.evidencePerTag);
}

// What an ending COSTS, decided in full before a single byte is written —
// the decide-then-apply split every resolver in this file keeps. The shaming
// read for a hostile wake is resolved here too, exactly as
// resolveAffectionSleepAttempt resolves it before applyAffectionSleepAttempt
// applies it. PURE.
//
// `branch` is the whole decision, and there are four:
//   'exit'        — D22's one voluntary exit. The evidence is the only
//                   variable; nothing else lands on her.
//   'reciprocate' — D6's earned retroactive consent. nightStepAction already
//                   decided this against D29's per-NPC threshold at the
//                   instant of the wake; there is no second roll here.
//   'shame'       — the forced wake she is not willing for.
//   'none'        — 'abandon'. Not an ending (Phase 2): it writes nothing,
//                   not even the XP the session banked.
function resolveNightSceneConsequence(gs, targetId, outcome) {
  const cfg = BOUNDARY.nightScene;
  const target = gs && gs.npcs ? gs.npcs[targetId] : null;
  const record = target && target.flags ? target.flags._nightScene : null;
  if (!target || !record) return null;
  const roomId = (target.location || (gs.player && gs.player.location)) || null;
  const day = gs.meta.clock.day;
  const tags = [...(record.evidence || [])];
  const actions = (record.touches || []).length;

  const branch = outcome === 'exit' ? 'exit'
    : outcome === 'wake_willing' ? 'reciprocate'
    : outcome === 'wake_hostile' ? 'shame'
    : 'none';

  // D23 over D32. The bank was earned action by action DURING play, so every
  // real ending pays it out at cfg.xp.exitMult — including a hostile wake,
  // whose stake is the shaming and the cold shoulder, not the skill the player
  // demonstrated getting there. Only 'abandon' forfeits it, which is the same
  // "no ending, no consequence" rule abandonNightScene already keeps.
  const xp = branch === 'none' ? 0 : (record.xp || 0) * cfg.xp.exitMult;

  // The evidence handoff is the EXIT's alone. If she woke, she is awake and
  // looking at you — a suspicion track fed by traces she would have had to
  // infer from is double-counting a thing she already knows for certain, and
  // the shame branch's own consequences are the honest cost there.
  let evidence = null;
  if (branch === 'exit' && tags.length) {
    const bucket = (gs.objects && gs.objects[`room_${roomId}`]) || {};
    // Every one of the five tags is physically ON the bed — sheets mussed, her
    // clothes pulled out of place, the mess — so the bed is the carrier, and
    // OBJECT_DEFS.bed declares the kind. A room with no bed in it leaves objId
    // null and the handoff becomes a no-op rather than a throw; that is not
    // reachable from the gate today (she is asleep, and asleep happens in a
    // bed) but the resolver must not assume it.
    const bed = Object.values(bucket).find(o => o.defId === 'bed');
    evidence = {
      objId: bed ? bed.id : null,
      kind: cfg.exit.evidenceKind,
      strength: nightEvidenceStrength(tags.length),
      // Invariant 7's bed trace, earned rather than assumed: the bed is left
      // unmade only if the player did NOT smooth the sheets back down. That
      // makes the Cleanup region's cheapest action have a visible, physical
      // consequence in the world instead of only a number.
      unmakeBed: tags.indexOf('sheets') >= 0,
    };
  }

  return {
    ok: true, outcome, targetId, roomId, day, branch,
    actions, acted: actions > 0,
    tags, evidence, xp,
    heat: record.heat, detection: record.detection, floor: record.floor,
    climaxCount: record.climaxCount || 0,
    shaming: branch === 'shame'
      ? resolveShamingReaction(gs, target, { cause: 'night_scene', roomId, day })
      : null,
  };
}

// Hands one plan's evidence to the shared stealth machinery. MUTATES.
// Returns the applied-effect rows (the outcome surfaces' required source),
// never a fabricated one.
function applyNightEvidenceHandoff(gs, targetId, plan) {
  const ev = plan && plan.evidence;
  if (!ev || !ev.objId || !(ev.strength > 0)) return [];
  const bucket = (gs.objects && gs.objects[`room_${plan.roomId}`]) || {};
  const effCtx = buildEffectContext(gs, [targetId], [targetId], bucket, (gs.player && gs.player.inventory) || []);
  const line = `LEAVE_EVIDENCE ${ev.objId} ${ev.kind} ${ev.strength.toFixed(2)}`;
  const result = applyEffects(parseEffectDSL(line).filter(Boolean), effCtx);
  if (ev.unmakeBed) unmakeBed(gs, plan.roomId);
  return (result && result.applied) || [];
}

// THE ONE CALL SITE for everything an ending does. nightscene.js's
// nightEndScene calls exactly this, and a second call for the same session is
// a no-op — resolveNightSceneEnd refuses an already-resolved record, which is
// what makes the banked XP land ONCE rather than once per attempt to leave.
// MUTATES. Returns the plan the resolver decided, plus what actually landed.
function applyNightSceneEnd(gs, targetId, outcome, ctx = {}) {
  const npc = gs && gs.npcs ? gs.npcs[targetId] : null;
  const rec = npc && npc.flags && npc.flags._nightScene;
  if (!rec || rec.resolved != null) return null;
  const plan = resolveNightSceneConsequence(gs, targetId, outcome);
  if (!plan) return null;
  // Stamped FIRST, so every branch below is already unrepeatable by the time
  // it writes anything, and so every read below sees the resolved record.
  if (!resolveNightSceneEnd(gs, targetId, outcome)) return null;
  const day = plan.day;
  const roomId = plan.roomId;

  if (plan.branch === 'none') return { ...plan, applied: [], prose: '', xpAwarded: 0 };

  if (plan.xp > 0) awardSkillXp(gs.player, 'stealth', plan.xp, day);

  let applied = [];
  let prose = '';
  if (plan.branch === 'reciprocate') {
    // The full completed-paired-act footprint (partner effects, rel deltas,
    // intimacy history, conception, the bed, the moan, infidelity, and its OWN
    // ledger entry — do not write a second one here). D6's earned retroactive
    // consent is a wake into a real act, not a lighter version of one, and
    // applyReciprocatedAct is the surface the sim already uses for exactly
    // this on the sleep_with path.
    applied = applyReciprocatedAct(gs, targetId, { ...ctx, location: roomId }) || [];
    prose = pickBoundaryProse(gs, 'reciprocate', targetId, roomId, day);
  } else if (plan.branch === 'shame') {
    applyShamingReactionLines(gs, targetId, plan.shaming, BOUNDARY.sleepRoom.caughtTensionSpike);
    if (plan.shaming.coldShoulderSeverity > 0) {
      // Re-read: applyShamingReactionLines' REL_DELTA already replaced the npc
      // folder in gs.npcs, so the pre-effects capture is stale.
      noteColdShoulder(gs.npcs[targetId], plan.shaming.coldShoulderSeverity, day, 'caught_boundary');
    }
    prose = plan.shaming.prose;
    notePlayerLedgerEntry(gs, targetId, 'night_scene', day, roomId, { outcome: 'caught' });
  } else {
    // exit. Invariant 5's clean fiction: this writes the intimacy-history
    // record and hands the evidence over, and NOTHING else — no relationship
    // damage, no guaranteed suspicion, no mood hit. "She never knew" stays true
    // unless sim.js's own discovery scan says otherwise.
    if (plan.acted) noteIntimacyOccurred(gs.npcs[targetId], day, 'player');
    applied = applyNightEvidenceHandoff(gs, targetId, plan);
    notePlayerLedgerEntry(gs, targetId, 'night_scene', day, roomId, { outcome: null });
  }
  return { ...plan, applied, prose, xpAwarded: plan.xp };
}

// Load-time self-heal, called once from state.js's loadGameState. A
// _nightScene left with resolved===null survived only because the JS
// context running it is gone — there is no overlay to resume into (a reload
// always exits any modal). Unlike _sleepAdvance (a real pending QUESTION that
// legitimately waits across a session boundary for the player to answer),
// an open Night Scene is a paused SCENE — nobody is waiting on an answer,
// so the honest fix is to close it out, not resurrect it. This is also why
// D37 can keep the scene's frames session-local: a session cannot be saved
// mid-way and resumed. MUTATES `npcs`.
function sweepStaleNightScenes(npcs) {
  for (const id of Object.keys(npcs || {})) {
    const npc = npcs[id];
    const rec = npc && npc.flags && npc.flags._nightScene;
    if (rec && rec.resolved == null) {
      npcs[id] = { ...npc, flags: { ...npc.flags, _nightScene: { ...rec, resolved: 'abandon' } } };
    }
  }
}
// ===== /SECTION: NIGHT SCENE =====

// ===== /SECTION: BOUNDARY ACTS =====
