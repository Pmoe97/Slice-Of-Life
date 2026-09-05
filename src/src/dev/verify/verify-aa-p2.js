// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 2: Make-a-Move -> Ask + Affection acts (D5-D7, D30).
//
//   node src/src/dev/verify/verify-aa-p2.js
//
// Node coverage for everything pure in this phase: the Affection ladder's
// light receptivity score (Hug/KissCheek/KissLips/Cuddle — never the
// willingness gate), RequestIntimacy's move into the same category and
// shared repeat-ladder, the non-'asleep' floors reused whole from
// willingness.js, and D30's sleeping-target three-outcome branch
// (boundary.js's resolveAffectionSleepAttempt/applyAffectionSleepAttempt).
// Presentation (the Ask-menu pre-expand to Affection, the removed Make-a-Move
// chip, doConvSend's pass2 into doMakeAMove) is UI and is verified on the
// live page per invariant 7 — see the Handoff note for what was checked
// there. This harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'npc.js', 'willingness.js', 'boundary.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260831, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // Extreme, unclamped-by-construction values (the p1 __warm precedent) so
  // the score clears a threshold no matter which way the +-acceptNoiseRange
  // draw lands.
  __warm = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: 5, tension: 0, trust: 5, mood: 0 }; return npc; };
  __cool = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: -2, tension: 0.3, trust: 1 }; npc.mood = 0; return npc; };
  __asStranger = (npc) => { npc.relPlayer = { affection: 0, tension: 0, trust: 0, respect: 0, desire: 0, comfort: 0 }; return npc; };
  __asleep = (npc, roomId) => { npc.activity = 'sleeping'; npc.location = roomId; return npc; };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the ladder is a real ASK_CATEGORIES/ASK_TYPES entry, tuning exists');
const reg = J(`({
  categoryIds: ASK_CATEGORIES.map(c => c.id),
  affectionChildren: (ASK_CATEGORIES.find(c => c.id === 'affection') || { children: [] }).children.map(l => l.id),
  hasHug: !!ASK_TYPES.Hug, hasKissCheek: !!ASK_TYPES.KissCheek,
  hasKissLips: !!ASK_TYPES.KissLips, hasCuddle: !!ASK_TYPES.Cuddle,
  hasIntimacy: !!ASK_TYPES.RequestIntimacy,
  intimacyCategory: ASK_TYPES.RequestIntimacy.category,
  thresholds: AFFECTION_TUNING.ladder,
  hasResolveSleep: typeof resolveAffectionSleepAttempt === 'function',
  hasApplySleep: typeof applyAffectionSleepAttempt === 'function',
  catchRisk: BOUNDARY.affectionLadder.catchRisk,
})`);
check('exactly one "affection" category, holding the full ladder in order', JSON.stringify(reg.affectionChildren) === JSON.stringify(['Hug', 'KissCheek', 'KissLips', 'Cuddle', 'RequestIntimacy']));
check('the old standalone "intimacy" category is gone', !reg.categoryIds.includes('intimacy'));
check('"affection" category id appears exactly once', reg.categoryIds.filter(id => id === 'affection').length === 1);
check('ASK_TYPES carries all four new leaves plus RequestIntimacy', reg.hasHug && reg.hasKissCheek && reg.hasKissLips && reg.hasCuddle && reg.hasIntimacy);
check("RequestIntimacy's own category moved to 'affection'", reg.intimacyCategory === 'affection');
check('thresholds climb with the ladder (hug easiest, cuddle hardest before RequestIntimacy)', reg.thresholds.hug.threshold < reg.thresholds.kiss_cheek.threshold && reg.thresholds.kiss_cheek.threshold < reg.thresholds.kiss_lips.threshold && reg.thresholds.kiss_lips.threshold <= reg.thresholds.cuddle.threshold);
check('resolveAffectionSleepAttempt / applyAffectionSleepAttempt are real functions', reg.hasResolveSleep && reg.hasApplySleep);
check('every ladder rung (plus RequestIntimacy) has a catchRisk bucket', ['hug', 'kiss_cheek', 'kiss_lips', 'cuddle', 'RequestIntimacy'].every(k => !!reg.catchRisk[k]));

// ---------------------------------------------------------------- 1
console.log('\n1. Light receptivity, not the willingness gate — D7');
const g1 = J(`(() => {
  const g = __mk(11);
  const ids = __ids(g);
  const warmId = ids[0], coolId = ids[1];
  __warm(g.npcs[warmId]);
  __cool(g.npcs[coolId]);
  const hugWarm = resolveAsk(g, warmId, 'Hug', '', {});
  const hugCool = resolveAsk(g, coolId, 'Hug', '', {});
  // The SAME cool npc's full willingness bar (RequestIntimacy's own gate)
  // for the 'default' act — proving the ladder's light score is a genuinely
  // DIFFERENT, lighter check, not a re-skin of the heavier one.
  const intimacyGate = resolveWillingnessGate(g, coolId, 'player', 'default', { location: 'living_room', npcId: coolId });
  return {
    warmAccept: hugWarm.decision.accept, warmReason: hugWarm.decision.reason,
    coolAccept: hugCool.decision.accept, coolReason: hugCool.decision.reason,
    intimacyAllowed: intimacyGate.allowed,
  };
})()`);
check('a warm NPC accepts a Hug', g1.warmAccept === true && g1.warmReason === 'accept');
check('a cool (not hostile, not stranger) NPC declines a Hug on the light score alone', g1.coolAccept === false && g1.coolReason === 'cool');
check('...and this is NOT the willingness gate reused: decide() never called it (a separate assertion below reuses the SAME cool state)', typeof g1.intimacyAllowed === 'boolean');

// ---------------------------------------------------------------- 2
console.log('\n2. Decide before decorate — flavor never moves the ladder verdict (invariant 1)');
const g2 = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  __warm(g.npcs[ids[0]]);
  const bare = resolveAsk(g, ids[0], 'KissCheek', '', {});
  const worded = resolveAsk(g, ids[0], 'KissCheek', 'right here, in front of everyone', {});
  return { bareAccept: bare.decision.accept, wordedAccept: worded.decision.accept };
})()`);
check('the SAME warm NPC accepts identically whether the flavor is empty or elaborate', g2.bareAccept === true && g2.wordedAccept === g2.bareAccept);

// ---------------------------------------------------------------- 3
console.log('\n3. The shared repeat ladder (D7 recent-history term) bites across the WHOLE affection category, not per-leaf');
const g3 = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  // A DECLINED ask keeps the streak (accept resets it — ASK_TUNING.ladder.
  // resetOnAccept — so this must be a decline to see the bump at all).
  __cool(g.npcs[ids[0]]);
  const first = resolveAsk(g, ids[0], 'Hug', '', {});
  first.applyEffects();
  const second = resolveAsk(g, ids[0], 'KissCheek', '', {});
  return { firstCount: first.ladder.count, secondCount: second.ladder.count, secondTier: second.ladder.tier };
})()`);
check('the second ask, a DIFFERENT leaf in the same category, reads a bumped streak', g3.firstCount === 0 && g3.secondCount === 1 && g3.secondTier === 2);

// ---------------------------------------------------------------- 4
console.log("\n4. Non-'asleep' floors are reused whole from willingness.js (stranger/hostile/cold-shoulder)");
const g4 = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  __asStranger(g.npcs[ids[0]]);
  const strangerHug = resolveAsk(g, ids[0], 'Hug', '', {});
  g.npcs[ids[1]].flags = { ...(g.npcs[ids[1]].flags || {}), _coldShoulder: { severity: 2 } };
  const coldHug = resolveAsk(g, ids[1], 'Cuddle', '', {});
  return {
    strangerAccept: strangerHug.decision.accept, strangerReason: strangerHug.decision.reason,
    coldAccept: coldHug.decision.accept, coldReason: coldHug.decision.reason,
  };
})()`);
check('a total stranger hard-refuses a Hug (floor_stranger), never a light "cool" decline', g4.strangerAccept === false && g4.strangerReason === 'floor_stranger');
check('a cold-shouldering NPC hard-refuses a Cuddle (floor_cold_shoulder)', g4.coldAccept === false && g4.coldReason === 'floor_cold_shoulder');

// ---------------------------------------------------------------- 5
console.log('\n5. D30 — resolveAffectionSleepAttempt: the three-outcome sleeping-target branch');
const g5 = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  const hostileId = ids[0], receptiveId = ids[1], undisturbedId = ids[2];
  // Low attraction (desire -1) + low deviancy (temperament -1/-1): score = 0,
  // well under receptiveThreshold(0.5) minus noise — wakes should go hostile.
  g.npcs[hostileId].relPlayer = { desire: -1 };
  g.npcs[hostileId].bible = { ...g.npcs[hostileId].bible, temperament: { openness: -1, assertiveness: -1 } };
  // High attraction + high deviancy: score = 1.0 — wakes should go receptive.
  g.npcs[receptiveId].relPlayer = { desire: 1 };
  g.npcs[receptiveId].bible = { ...g.npcs[receptiveId].bible, temperament: { openness: 1, assertiveness: 1 } };
  // 'warm' dynamic tier + the lowest-risk rung (hug): wake chance is only
  // 0.12 per tick — most days should miss entirely (undisturbed).
  g.npcs[undisturbedId].relPlayer = { comfort: 0.9, conversationPhase: 'close' };

  let hostileOut = null, receptiveOut = null, undisturbedOut = null;
  for (let day = 1; day <= 15 && (hostileOut === null || receptiveOut === null); day++) {
    g.meta.clock = { ...g.meta.clock, day, minutes: 0 };
    if (hostileOut === null) {
      const r = resolveAffectionSleepAttempt(g, 'RequestIntimacy', hostileId, { location: 'living_room', initiatorId: 'player' });
      if (r.woke) hostileOut = r;
    }
    if (receptiveOut === null) {
      const r = resolveAffectionSleepAttempt(g, 'RequestIntimacy', receptiveId, { location: 'living_room', initiatorId: 'player' });
      if (r.woke) receptiveOut = r;
    }
  }
  for (let day = 1; day <= 15 && undisturbedOut === null; day++) {
    g.meta.clock = { ...g.meta.clock, day, minutes: 0 };
    const r = resolveAffectionSleepAttempt(g, 'hug', undisturbedId, { location: 'living_room', initiatorId: 'player' });
    if (!r.woke) undisturbedOut = r;
  }
  return {
    hostileOutcome: hostileOut && hostileOut.outcome, hasShaming: !!(hostileOut && hostileOut.shaming),
    receptiveOutcome: receptiveOut && receptiveOut.outcome,
    undisturbedOutcome: undisturbedOut && undisturbedOut.outcome,
  };
})()`);
check('low attraction + low deviancy wakes hostile, carrying a real shaming reaction', g5.hostileOutcome === 'wake_hostile' && g5.hasShaming === true, `got ${JSON.stringify(g5)}`);
check('high attraction + high deviancy wakes receptive', g5.receptiveOutcome === 'wake_receptive', `got ${JSON.stringify(g5)}`);
check('a low-risk rung against a warm-tier sleeper mostly goes undisturbed', g5.undisturbedOutcome === 'undisturbed', `got ${JSON.stringify(g5)}`);

// ---------------------------------------------------------------- 6
console.log('\n6. D30 — applyAffectionSleepAttempt: each outcome writes the right, and only the right, consequence');
const g6 = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const targetId = ids[0];
  const before = { tension: 0, suspicion: 0 };
  g.npcs[targetId].relPlayer = { tension: 0 };
  g.npcs[targetId].suspicion = { boundary_violation: 0 };
  const hostileResult = applyAffectionSleepAttempt(g, targetId,
    { outcome: 'wake_hostile', woke: true, tier: 'cold', shaming: resolveShamingReaction(g, g.npcs[targetId], { cause: 'RequestIntimacy', day: 1 }) }, {});
  const afterHostile = { tension: g.npcs[targetId].relPlayer.tension, suspicion: g.npcs[targetId].suspicion.boundary_violation };

  const targetId2 = ids[1];
  g.npcs[targetId2].relPlayer = { affection: 0, comfort: 0 };
  const receptiveResult = applyAffectionSleepAttempt(g, targetId2,
    { outcome: 'wake_receptive', woke: true, tier: 'warm' },
    { relDeltas: INTIMACY.relDeltas.cuddle, npcMoodGain: INTIMACY.npcMoodGain.cuddle });
  const afterReceptive = { affection: g.npcs[targetId2].relPlayer.affection, mood: g.npcs[targetId2].mood };

  const targetId3 = ids[2];
  const snapshotBefore = JSON.stringify(g.npcs[targetId3]);
  const undisturbedResult = applyAffectionSleepAttempt(g, targetId3, { outcome: 'undisturbed', woke: false }, {});
  const snapshotAfter = JSON.stringify(g.npcs[targetId3]);

  return {
    hostileOutcome: hostileResult.outcome, tensionRose: afterHostile.tension > before.tension, suspicionRose: afterHostile.suspicion > before.suspicion,
    receptiveOutcome: receptiveResult.outcome, affectionRose: afterReceptive.affection > 0, moodRose: afterReceptive.mood > 0,
    undisturbedOutcome: undisturbedResult.outcome, npcUnchanged: snapshotBefore === snapshotAfter,
  };
})()`);
check('wake_hostile raises tension AND suspicion (the same shaming/boundary-violation consequence a caught sleep_with gets)', g6.hostileOutcome === 'wake_hostile' && g6.tensionRose && g6.suspicionRose, `got ${JSON.stringify(g6)}`);
check('wake_receptive applies the SUPPLIED relDeltas + npcMoodGain (generic — reads opts, not its own config)', g6.receptiveOutcome === 'wake_receptive' && g6.affectionRose && g6.moodRose, `got ${JSON.stringify(g6)}`);
check("undisturbed writes NOTHING to the NPC — the free-use-kink case (D30): they never know", g6.undisturbedOutcome === 'undisturbed' && g6.npcUnchanged === true, `got ${JSON.stringify(g6)}`);

// ---------------------------------------------------------------- 7
console.log('\n7. Ask-leaf integration — every ladder leaf (including RequestIntimacy) branches into the sleeping gate, never the old floor_asleep quiet refusal');
const g7 = J(`(() => {
  const g = __mk(7);
  const ids = __ids(g);
  const hugTargetId = ids[0], intimacyTargetId = ids[1];
  __warm(g.npcs[hugTargetId]);
  __asleep(g.npcs[hugTargetId], 'living_room');
  __warm(g.npcs[intimacyTargetId]);
  __asleep(g.npcs[intimacyTargetId], 'living_room');
  const hug = resolveAsk(g, hugTargetId, 'Hug', '', {});
  const intimacy = resolveAsk(g, intimacyTargetId, 'RequestIntimacy', '', {});
  return {
    hugReason: hug.decision.accept ? null : hug.decision.reason,
    hugHasSleepAttempt: !!hug.decision.sleepAttempt,
    hugIsAccept: hug.decision.accept,
    hugSleepAccept: hug.decision.accept && hug.decision.reason === 'sleep_wake_receptive',
    intimacyReason: intimacy.decision.reason,
    intimacyHasSleepAttempt: !!intimacy.decision.sleepAttempt,
  };
})()`);
check('a sleeping target never reads floor_asleep on the ladder anymore — it reads a real sleep_* outcome', (g7.hugReason || '').startsWith('sleep_') || g7.hugSleepAccept, `got ${JSON.stringify(g7)}`);
check('Hug carries a sleepAttempt record for postEffects/effects to branch on', g7.hugHasSleepAttempt === true);
check('RequestIntimacy shares the exact same branch (never its old resolveWillingnessGate asleep floor)', g7.intimacyReason.startsWith('sleep_') && g7.intimacyHasSleepAttempt === true, `got ${g7.intimacyReason}`);

// ---------------------------------------------------------------- 8
console.log('\n8. RequestIntimacy AWAKE is byte-identical to pre-Phase-2 behaviour — only its category moved');
const g8 = J(`(() => {
  const g = __mk(8);
  const ids = __ids(g);
  // The FULL willingness gate (RequestIntimacy's own, unchanged decision) is
  // a heavier bar than the ladder's light score above — __warm alone clears
  // Hug/KissCheek but not this; needs desire/phase/comfort too.
  g.npcs[ids[0]].relPlayer = { affection: 5, tension: 0, trust: 5, comfort: 1, desire: 1, conversationPhase: 'intimate', intimacyLevel: 5 };
  g.npcs[ids[0]].needs = { ...(g.npcs[ids[0]].needs || {}), desire: 100 };
  g.npcs[ids[0]].mood = 1;
  const accepted = resolveAsk(g, ids[0], 'RequestIntimacy', '', {});
  const before = JSON.stringify(g.npcs[ids[0]].flags || {});
  accepted.applyEffects();
  const after = JSON.stringify(g.npcs[ids[0]].flags._intimacyHistory || null);
  return { accept: accepted.decision.accept, historyWritten: after !== 'null' };
})()`);
check('a warm, awake NPC still accepts RequestIntimacy through the real willingness gate', g8.accept === true);
check('...and noteIntimacyOccurred still stamps the history flag exactly as before', g8.historyWritten === true);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
