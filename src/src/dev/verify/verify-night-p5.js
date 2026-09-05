// night-scene-sleeping-npc-plan.md — Phase 5: endings and the evidence handoff.
//
//   node src/src/dev/verify/verify-night-p5.js
//
// Phase 5 is the phase where the Night Scene stops being a closed toy and
// starts writing on the rest of the game, so this harness is built around the
// two ways that can go wrong.
//
// The first is a PARALLEL CHANNEL. Design invariant 6's rule about exogenous
// risk sources was extended by D25 to consequences: the leftover evidence must
// feed the machinery the game already has (LEAVE_EVIDENCE -> sim.js's per-tick
// discovery scan -> ui.js's ADJUST_SUSPICION), a willing wake must go through
// applyReciprocatedAct and a hostile one through applyShamingReactionLines +
// noteColdShoulder, and the banked XP must ride awardSkillXp's existing
// 'stealth' sink. So the assertions below check not only that the consequences
// land but that they land THERE — rollGhostSuspicion and its private
// BOUNDARY.nightScene.suspicion bucket are asserted GONE, the evidence record
// is asserted to have exactly the four fields sim.js's scan reads, and the
// evidence kind is asserted to be one OBJECT_DEFS actually declares (so this
// is a legal effect, not a trusted-producer cheat that validateEffects would
// reject if anything ever validated it).
//
// The second is DOUBLE PAYMENT. record.xp is accumulated action by action and
// paid out once; the exit is reachable from three places (the Leave button,
// the confirmation's "Leave anyway", and a forced wake inside nightFire), and
// nightCloseOverlay can follow any of them. applyNightSceneEnd is therefore
// asserted idempotent at the record level — a second call returns null and
// changes not one number.
//
// Plus the three rulings this phase had to make, each asserted so a later
// session finds them named rather than inferring them from behaviour:
//   1. Every real ending pays the bank (D23's "earned action by action, during
//      play"), and only 'abandon' forfeits it. That deliberately reads D23 over
//      the flat clean-branch-only convention D32 set for the one-roll stealth
//      verbs.
//   2. The evidence handoff belongs to the EXIT alone. A forced wake means she
//      is awake and certain; feeding a suspicion track from traces she would
//      have had to infer from is double-counting.
//   3. `bed` gained evidenceKinds, which makes it a pickEvidenceObject
//      candidate for STEALTH's room-entry sneak too. Chosen, not stumbled into
//      — section 6 asserts it on purpose.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'skills.js', 'npc.js', 'willingness.js', 'relationships.js',
             'effects.js', 'actions.js', 'codex.js', 'world.js', 'boundary.js', 'nightscene.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  var currentGameState = null;
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260905, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'bedroom_1';
    g.player.skills = { stealth: 0 };
    g.player.ledger = {};
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  __sleep = (g, id, roomId) => {
    g.npcs[id] = { ...g.npcs[id], location: roomId, activity: 'sleeping' };
    g.player.location = roomId;
  };
  // A record shaped exactly as openNightScene writes one, plus whatever the
  // caller wants to pretend a session's worth of play produced.
  __open = (g, id, over) => {
    const rec = { targetId: id, openedDay: g.meta.clock.day, openedMinute: Math.floor(g.meta.clock.minutes * 100),
      detection: 0, floor: 0, heat: 0, evidence: [], touches: [],
      pose: 'back', covers: 'off', climaxCount: 0, xp: 0, resolved: null };
    g.npcs[id] = { ...g.npcs[id], flags: { ...(g.npcs[id].flags||{}), _nightScene: { ...rec, ...(over||{}) } } };
    return g.npcs[id].flags._nightScene;
  };
  __bed = (g, roomId) => Object.values(g.objects['room_' + roomId] || {}).find(o => o.defId === 'bed') || null;
  __clone = (o) => JSON.parse(JSON.stringify(o));
  // A cold-tier sleeper: resolveShamingTier reads relPlayer, and an all-zero
  // relationship with no grievances is the "stranger" branch, which is the
  // only tier that carries a non-zero coldShoulderSeverity AND the biggest
  // deltas, so the hostile branch is observable rather than a rounding error.
  __cold = (g, id) => {
    g.npcs[id] = { ...g.npcs[id], relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0,
      desire: 0, comfort: 0, grievances: [], conversationPhase: 'stranger' } };
  };
  __sess = (id) => ({ targetId: id, sel: null, lastResult: null, narration: '', confirming: false,
    trayOpen: false, ended: false, endOutcome: null, endResult: null, climaxBeat: false,
    onClick: null, onKey: null,
    frames: new Map(), framesInFlight: new Set(), frameKey: null, frameAxes: null, prefetchSel: null });
  // generateImage never settles: Phase 4's request rides the tail of every
  // fire, and nothing in Phase 5 may wait on it either.
  root.generateImage = () => new Promise(() => {});
`);

// ---------------------------------------------------------------- 0
console.log('\n0. The decision: four branches, and the resolver decides all of it before anything is written');
const r0 = J(`(() => {
  const g = __mk(1); const id = __target(g); __sleep(g, id, 'bedroom_1');
  __open(g, id, { evidence: ['sheets', 'shirt'], touches: ['a', 'b'], xp: 4, heat: 130, climaxCount: 1 });
  const before = __clone(g.npcs[id]);
  const p = {};
  for (const o of ['exit', 'wake_willing', 'wake_hostile', 'abandon', 'nonsense']) {
    p[o] = resolveNightSceneConsequence(g, id, o);
  }
  const twice = resolveNightSceneConsequence(g, id, 'exit');
  return {
    branches: { exit: p.exit.branch, willing: p.wake_willing.branch,
                hostile: p.wake_hostile.branch, abandon: p.abandon.branch, nonsense: p.nonsense.branch },
    pure: JSON.stringify(before) === JSON.stringify(g.npcs[id]),
    stable: JSON.stringify(twice) === JSON.stringify(p.exit),
    tags: p.exit.tags, actions: p.exit.actions, acted: p.exit.acted,
    climaxCount: p.exit.climaxCount,
    shamingOnlyOnShame: !p.exit.shaming && !p.wake_willing.shaming && !!p.wake_hostile.shaming,
    missingTarget: resolveNightSceneConsequence(g, 'not_a_real_npc', 'exit'),
    noRecord: (() => { const g2 = __mk(2); return resolveNightSceneConsequence(g2, __target(g2), 'exit'); })(),
  };
})()`);
check("'exit' is the exit branch (D22: one voluntary exit, and it has no name of its own)",
  r0.branches.exit === 'exit');
check("'wake_willing' routes to the reciprocate branch (D6's earned retroactive consent)",
  r0.branches.willing === 'reciprocate');
check("'wake_hostile' routes to the shaming branch", r0.branches.hostile === 'shame');
check("'abandon' is NOT an ending — its branch writes nothing", r0.branches.abandon === 'none');
check('an unrecognised outcome falls to the same do-nothing branch, never to exit',
  r0.branches.nonsense === 'none');
check('the resolver is PURE — the npc folder is byte-identical after five calls', r0.pure);
check('...and deterministic: the same question twice gives the same answer', r0.stable);
check('the plan carries the outstanding evidence verbatim',
  JSON.stringify(r0.tags) === JSON.stringify(['sheets', 'shirt']));
check('...and how much of a session actually happened', r0.actions === 2 && r0.acted === true);
check('...and D38’s climax count, so the ending can report it', r0.climaxCount === 1);
check('the shaming read happens only on the branch that needs it', r0.shamingOnlyOnShame);
check('a missing target resolves to null rather than a half-plan', r0.missingTarget === null);
check('...and so does a target with no session open', r0.noRecord === null);

// ---------------------------------------------------------------- 1
console.log('\n1. D23: the bank is paid ONCE, at exitMult, and only an abandon forfeits it');
const r1 = J(`(() => {
  const bank = (outcome, xp) => {
    const g = __mk(11); const id = __target(g); __sleep(g, id, 'bedroom_1');
    __open(g, id, { touches: ['a'], xp: xp == null ? 6 : xp });
    const before = g.player.skills.stealth || 0;
    const res = applyNightSceneEnd(g, id, outcome);
    const after = g.player.skills.stealth || 0;
    const second = applyNightSceneEnd(g, id, outcome);
    const afterSecond = g.player.skills.stealth || 0;
    return { gained: after - before, planned: res ? res.xpAwarded : null,
             secondIsNull: second === null, noDoubleBank: afterSecond === after,
             resolved: g.npcs[id].flags._nightScene.resolved };
  };
  return {
    exit: bank('exit'), willing: bank('wake_willing'), hostile: bank('wake_hostile'),
    abandon: bank('abandon'), noPlay: bank('exit', 0),
    exitMult: BOUNDARY.nightScene.xp.exitMult,
    hasFourOutcomeBucket: BOUNDARY.nightScene.xp.ghostComplete !== undefined
      || BOUNDARY.nightScene.xp.bailClean !== undefined
      || BOUNDARY.nightScene.xp.wakeWilling !== undefined
      || BOUNDARY.nightScene.xp.caught !== undefined,
  };
})()`);
check('a clean exit banks the accumulated xp at exitMult',
  Math.abs(r1.exit.gained - 6 * r1.exitMult) < 1e-9, JSON.stringify(r1.exit));
check('a willing wake banks it too — the play happened either way',
  Math.abs(r1.willing.gained - 6 * r1.exitMult) < 1e-9, JSON.stringify(r1.willing));
check('...and so does a HOSTILE wake: its stake is the shaming, not the skill you showed',
  Math.abs(r1.hostile.gained - 6 * r1.exitMult) < 1e-9, JSON.stringify(r1.hostile));
check('an abandon banks nothing at all', r1.abandon.gained === 0 && r1.abandon.planned === 0);
check('a session where nothing was done banks nothing', r1.noPlay.gained === 0);
check('the second ending attempt returns null on every branch',
  r1.exit.secondIsNull && r1.willing.secondIsNull && r1.hostile.secondIsNull && r1.abandon.secondIsNull);
check('...and banks nothing a second time (the bank lands once, not once per Leave)',
  r1.exit.noDoubleBank && r1.willing.noDoubleBank && r1.hostile.noDoubleBank);
check('every branch stamps its resolution on the record',
  r1.exit.resolved === 'exit' && r1.willing.resolved === 'wake_willing'
  && r1.hostile.resolved === 'wake_hostile' && r1.abandon.resolved === 'abandon');
check("D23: the superseded four-outcome xp bucket is gone, not merely unread",
  r1.hasFourOutcomeBucket === false);

// ---------------------------------------------------------------- 2
console.log('\n2. D5/D25: the evidence goes to the SHARED machinery, weighted by what was left');
const r2 = J(`(() => {
  const run = (tags, outcome) => {
    const g = __mk(21); const id = __target(g); __sleep(g, id, 'bedroom_1');
    __open(g, id, { evidence: tags, touches: ['a'], xp: 1 });
    const bed = __bed(g, 'bedroom_1');
    const madeBefore = bed ? (bed.state || {}).made : null;
    const res = applyNightSceneEnd(g, id, outcome || 'exit');
    const after = __bed(g, 'bedroom_1');
    return {
      bedFound: !!bed,
      evidence: after ? (after.evidence || null) : null,
      madeBefore, madeAfter: after ? (after.state || {}).made : null,
      appliedTypes: (res.applied || []).map(e => e.type),
      planned: res.evidence,
    };
  };
  const cfg = BOUNDARY.nightScene.exit;
  return {
    clean: run([]),
    one: run(['shirt']),
    two: run(['shirt', 'panties']),
    all: run(['panties', 'bottoms', 'shirt', 'sheets', 'fluids']),
    sheetsOnly: run(['sheets']),
    noSheets: run(['shirt', 'panties', 'fluids']),
    hostile: run(['shirt', 'sheets'], 'wake_hostile'),
    willing: run(['shirt', 'sheets'], 'wake_willing'),
    cfg,
    curve: [0, 1, 2, 3, 4, 5, 12].map(n => nightEvidenceStrength(n)),
    cap: EFFECT_LIMITS.evidenceStrengthCap,
  };
})()`);
check('the room really does hold a bed to carry it', r2.one.bedFound);
check('a CLEAN exit writes no evidence at all — "rolls at or near zero" exactly',
  r2.clean.evidence === null && r2.clean.appliedTypes.length === 0, JSON.stringify(r2.clean));
check('a dirty exit stamps evidence through LEAVE_EVIDENCE and nothing else',
  JSON.stringify(r2.one.appliedTypes) === JSON.stringify(['LEAVE_EVIDENCE']),
  JSON.stringify(r2.one.appliedTypes));
check('...of the kind the config names', r2.one.evidence && r2.one.evidence.kind === r2.cfg.evidenceKind);
check('...undiscovered, and stamped with the day (the four fields sim.js’s scan reads)',
  r2.one.evidence && r2.one.evidence.discovered === false
  && typeof r2.one.evidence.day === 'number' && typeof r2.one.evidence.strength === 'number');
check('strength scales with the COUNT of tags left (D5: evidence-weighted, not depth-weighted)',
  r2.two.evidence.strength > r2.one.evidence.strength
  && r2.all.evidence.strength > r2.two.evidence.strength);
check('...at exactly perTag per tag until the cap',
  Math.abs(r2.curve[1] - r2.cfg.evidencePerTag) < 1e-9
  && Math.abs(r2.curve[2] - 2 * r2.cfg.evidencePerTag) < 1e-9);
check('...never below zero and never above the configured max',
  r2.curve[0] === 0 && r2.curve[6] === r2.cfg.evidenceStrengthMax);
check('...and the max is inside the effect system’s own strength cap',
  r2.cfg.evidenceStrengthMax > 0 && r2.cfg.evidenceStrengthMax <= r2.cap);
check('leaving the sheets mussed leaves the bed unmade (invariant 7’s trace, earned)',
  r2.sheetsOnly.madeAfter === 'unmade');
check('...and smoothing them back down is what keeps the bed made — the Cleanup trade is visible',
  r2.noSheets.madeAfter === r2.noSheets.madeBefore && r2.noSheets.madeAfter !== 'unmade',
  JSON.stringify(r2.noSheets));
check('a HOSTILE wake stamps no evidence: she is awake and certain, not inferring',
  r2.hostile.evidence === null && r2.hostile.planned === null);
check('...and neither does a willing one', r2.willing.evidence === null && r2.willing.planned === null);

// ---------------------------------------------------------------- 3
console.log('\n3. Invariant 5: a clean exit is a clean fiction — intimacy history, and NOTHING else');
const r3 = J(`(() => {
  const g = __mk(31); const id = __target(g); __sleep(g, id, 'bedroom_1');
  __open(g, id, { touches: ['a', 'b', 'c'], xp: 3, heat: 40 });
  const before = __clone(g.npcs[id]);
  const res = applyNightSceneEnd(g, id, 'exit');
  const after = __clone(g.npcs[id]);
  // Diff the npc folder key by key, the way D30's own verification did.
  const changed = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  const flagsChanged = [];
  for (const k of new Set([...Object.keys(before.flags || {}), ...Object.keys(after.flags || {})])) {
    if (JSON.stringify((before.flags||{})[k]) !== JSON.stringify((after.flags||{})[k])) flagsChanged.push(k);
  }
  // And the same for a session where the player did literally nothing.
  const g2 = __mk(32); const id2 = __target(g2); __sleep(g2, id2, 'bedroom_1');
  __open(g2, id2, {});
  applyNightSceneEnd(g2, id2, 'exit');
  const ledger = (g.player.ledger || {})[id] || [];
  return {
    changed: changed.sort(), flagsChanged: flagsChanged.sort(),
    intimacy: (after.flags || {})._intimacyHistory || null,
    untouchedWhenNothingHappened: !((g2.npcs[id2].flags || {})._intimacyHistory),
    ledgerLen: ledger.length, ledgerAct: ledger[0] ? ledger[0].act : null,
    ledgerOutcome: ledger[0] ? ledger[0].outcome : null,
    prose: res.prose, applied: res.applied.length,
  };
})()`);
check('the only key that moves on the npc folder is flags',
  JSON.stringify(r3.changed) === JSON.stringify(['flags']), JSON.stringify(r3.changed));
check('...and inside flags, only the session record and the intimacy history',
  JSON.stringify(r3.flagsChanged) === JSON.stringify(['_intimacyHistory', '_nightScene']),
  JSON.stringify(r3.flagsChanged));
check('the intimacy history names the player and the day', r3.intimacy && r3.intimacy.lastWith === 'player'
  && typeof r3.intimacy.lastIntimateDay === 'number');
check('an exit from a session where NOTHING was done writes no intimacy record',
  r3.untouchedWhenNothingHappened);
check('the exit writes exactly one ledger entry, under its own act name',
  r3.ledgerLen === 1 && r3.ledgerAct === 'night_scene');
check('...with no outcome — a clean exit is not a caught one', r3.ledgerOutcome === null);
check('a clean exit applies no effects at all', r3.applied === 0);

// ---------------------------------------------------------------- 4
console.log("\n4. D6: a willing wake hands off to applyReciprocatedAct — the sim's own completed-act surface");
const r4 = J(`(() => {
  const g = __mk(41); const id = __target(g); __sleep(g, id, 'bedroom_1');
  g.npcs[id] = { ...g.npcs[id], relPlayer: { ...(g.npcs[id].relPlayer||{}), comfort: 0.7, affection: 0.5 } };
  __open(g, id, { touches: ['a'], xp: 5, heat: 180, climaxCount: 1 });
  const relBefore = { ...(g.npcs[id].relPlayer || {}) };
  const res = applyNightSceneEnd(g, id, 'wake_willing');
  const npc = g.npcs[id];
  const ledger = (g.player.ledger || {})[id] || [];
  const bed = __bed(g, 'bedroom_1');
  return {
    activity: npc.activity, clothing: npc.clothing,
    intimacy: (npc.flags || {})._intimacyHistory || null,
    coldShoulder: (npc.flags || {})._coldShoulder || null,
    relMoved: JSON.stringify(relBefore) !== JSON.stringify(npc.relPlayer || {}),
    ledgerActs: ledger.map(e => e.act),
    bedUnmade: bed ? (bed.state || {}).made === 'unmade' : null,
    appliedTypes: [...new Set((res.applied || []).map(e => e.type))].sort(),
    hasProse: typeof res.prose === 'string' && res.prose.length > 10,
    stillHasEvidenceTags: res.tags.length === 0,
  };
})()`);
check('she is awake and in it — activity and clothing are the shared intimacy state',
  r4.activity === 'intimacy' && r4.clothing === 'undressed');
check('the intimacy history is written by the shared function, not a second one',
  !!r4.intimacy && r4.intimacy.lastWith === 'player');
check('the relationship moved (applyReciprocatedAct’s own deltas)', r4.relMoved);
check('no cold shoulder — this is the good ending', r4.coldShoulder === null);
check('the ledger carries exactly the shared act name, written once',
  JSON.stringify(r4.ledgerActs) === JSON.stringify(['boundary_sleep_with']),
  JSON.stringify(r4.ledgerActs));
check('the bed is unmade, as it is for every other completed paired act', r4.bedUnmade === true);
check('the applied rows are the shared act’s effects, reported not fabricated',
  r4.appliedTypes.length > 0 && r4.appliedTypes.every(t => typeof t === 'string'),
  JSON.stringify(r4.appliedTypes));
check('the reciprocate prose pool supplies the line', r4.hasProse);

// ---------------------------------------------------------------- 5
console.log('\n5. A hostile wake hands off to applyShamingReactionLines + noteColdShoulder, verbatim');
const r5 = J(`(() => {
  const g = __mk(51); const id = __target(g); __sleep(g, id, 'bedroom_1'); __cold(g, id);
  __open(g, id, { touches: ['a'], xp: 5, evidence: ['shirt'] });
  const relBefore = { ...(g.npcs[id].relPlayer || {}) };
  const suspBefore = { ...((g.npcs[id].suspicion) || {}) };
  const res = applyNightSceneEnd(g, id, 'wake_hostile');
  const npc = g.npcs[id];
  const ledger = (g.player.ledger || {})[id] || [];
  return {
    tier: res.shaming.tier,
    tensionRose: (npc.relPlayer.tension || 0) > (relBefore.tension || 0),
    suspicionRose: ((npc.suspicion || {}).boundary_violation || 0) > (suspBefore.boundary_violation || 0),
    coldShoulder: (npc.flags || {})._coldShoulder || null,
    noIntimacy: !((npc.flags || {})._intimacyHistory),
    ledgerActs: ledger.map(e => e.act), ledgerOutcome: ledger[0] ? ledger[0].outcome : null,
    hasProse: typeof res.prose === 'string' && res.prose.length > 10,
    // A warm sleeper carries coldShoulderSeverity 0 — the branch must not
    // invent a cold shoulder the tier definition does not ask for.
    warmNoColdShoulder: (() => {
      const g2 = __mk(52); const id2 = __target(g2); __sleep(g2, id2, 'bedroom_1');
      g2.npcs[id2] = { ...g2.npcs[id2], relPlayer: { ...(g2.npcs[id2].relPlayer||{}), comfort: 0.8 } };
      __open(g2, id2, { touches: ['a'], xp: 1 });
      const r = applyNightSceneEnd(g2, id2, 'wake_hostile');
      return { severity: r.shaming.coldShoulderSeverity, flag: (g2.npcs[id2].flags||{})._coldShoulder || null };
    })(),
  };
})()`);
check('an all-zero relationship reads as the cold tier', r5.tier === 'cold', r5.tier);
check('tension rose through the shared shaming lines', r5.tensionRose);
check('...and so did boundary_violation suspicion, on the shared axis', r5.suspicionRose);
check('the cold shoulder landed at the tier’s own severity',
  r5.coldShoulder && r5.coldShoulder.severity === 3 && r5.coldShoulder.reason === 'caught_boundary',
  JSON.stringify(r5.coldShoulder));
check('no intimacy history — she woke and it stopped', r5.noIntimacy);
check('the ledger records it as caught, once',
  JSON.stringify(r5.ledgerActs) === JSON.stringify(['night_scene']) && r5.ledgerOutcome === 'caught');
check('the shaming prose is what the ending reports', r5.hasProse);
check('a warm sleeper’s hostile wake gets NO cold shoulder (the tier decides, not this phase)',
  r5.warmNoColdShoulder.severity === 0 && r5.warmNoColdShoulder.flag === null,
  JSON.stringify(r5.warmNoColdShoulder));

// ---------------------------------------------------------------- 6
console.log('\n6. The handoff is legal in the shared system, not a trusted-producer cheat');
const r6 = J(`(() => {
  const kind = BOUNDARY.nightScene.exit.evidenceKind;
  const g = __mk(61); const id = __target(g); __sleep(g, id, 'bedroom_1');
  const bed = __bed(g, 'bedroom_1');
  const roomObjects = g.objects['room_bedroom_1'] || {};
  const ctx = buildEffectContext(g, [id], [id], roomObjects, []);
  // The exact validator the LLM boundary would run. A trusted producer skips
  // it, which is precisely why it is worth asserting here: the pair must be
  // one the system would have accepted anyway.
  const kindOk = validateEvidenceKind(bed.id, kind, ctx);
  const strengthOk = validateEvidenceStrength(BOUNDARY.nightScene.exit.evidenceStrengthMax);
  // The chosen side effect: bed is a private object, so it is now a candidate
  // STEALTH's own room-entry evidence pick.
  const rng = seededRng(g.meta.seed, 'p5_pick');
  const picked = pickEvidenceObject(roomObjects, rng);
  const bedIsCandidate = Object.values(roomObjects)
    .some(o => o.defId === 'bed' && OBJECT_DEFS[o.defId].private
      && (OBJECT_DEFS[o.defId].evidenceKinds || []).length > 0);
  return {
    declared: (OBJECT_DEFS.bed.evidenceKinds || []).indexOf(kind) >= 0,
    kindOk: kindOk === true, kindDetail: kindOk,
    strengthOk: strengthOk === true,
    hasText: typeof EVIDENCE_KIND_TEXT[kind] === 'string' && EVIDENCE_KIND_TEXT[kind].indexOf('{name}') >= 0,
    subjectShared: SUSPICION_SUBJECTS.indexOf('boundary_violation') >= 0,
    bedIsCandidate, pickedSomething: !!picked,
    discoveryReadsStrength: STEALTH_TUNING.evidenceStrengthDiscoveryFactor > 0,
  };
})()`);
check('OBJECT_DEFS.bed declares the kind the night scene stamps', r6.declared);
check('...so validateEvidenceKind would have accepted the pair', r6.kindOk, String(r6.kindDetail));
check('...and validateEvidenceStrength accepts the configured maximum', r6.strengthOk);
check('the kind has discovery text, with the {name} slot the event template fills', r6.hasText);
check('the suspicion the discovery writes is on the shared boundary_violation subject', r6.subjectShared);
check('the discovery scan weights its chance by strength — which is why strength carries D5’s curve',
  r6.discoveryReadsStrength);
check('CHOSEN SIDE EFFECT: the bed is now a room-entry-sneak evidence candidate too',
  r6.bedIsCandidate && r6.pickedSomething);

// ---------------------------------------------------------------- 7
console.log('\n7. Lifecycle: an ending can only ever happen once, and only on an open session');
const r7 = J(`(() => {
  const g = __mk(71); const id = __target(g); __sleep(g, id, 'bedroom_1');
  __open(g, id, { touches: ['a'], xp: 2, evidence: ['fluids'] });
  abandonNightScene(g, id);
  const afterAbandon = applyNightSceneEnd(g, id, 'exit');
  const bedAfterAbandon = __bed(g, 'bedroom_1');

  const g2 = __mk(72); const id2 = __target(g2); __sleep(g2, id2, 'bedroom_1');
  __open(g2, id2, { touches: ['a'], xp: 2, evidence: ['fluids', 'shirt'] });
  applyNightSceneEnd(g2, id2, 'exit');
  const bedOnce = __clone(__bed(g2, 'bedroom_1').evidence);
  const again = applyNightSceneEnd(g2, id2, 'exit');
  const bedTwice = __clone(__bed(g2, 'bedroom_1').evidence);
  const ledgerLen = ((g2.player.ledger || {})[id2] || []).length;

  const g3 = __mk(73);
  return {
    abandonBlocks: afterAbandon === null,
    abandonLeftNoEvidence: !bedAfterAbandon.evidence,
    secondEndIsNull: again === null,
    evidenceNotRestamped: JSON.stringify(bedOnce) === JSON.stringify(bedTwice),
    ledgerNotDoubled: ledgerLen === 1,
    noSession: applyNightSceneEnd(g3, __target(g3), 'exit') === null,
    noTarget: applyNightSceneEnd(g3, 'not_a_real_npc', 'exit') === null,
  };
})()`);
check('an already-abandoned session cannot then be "exited" for its consequences', r7.abandonBlocks);
check('...and the abandon itself left no evidence behind', r7.abandonLeftNoEvidence);
check('a second exit on a resolved session returns null', r7.secondEndIsNull);
check('...and does not re-stamp the evidence record', r7.evidenceNotRestamped);
check('...and does not write a second ledger entry', r7.ledgerNotDoubled);
check('an npc with no session at all cannot be ended', r7.noSession);
check('...and neither can one that does not exist', r7.noTarget);

// ---------------------------------------------------------------- 8
console.log('\n8. The controller: nightEndScene is the ONE call site, and it still never waits');
{
  // Comments are stripped first on both files: the painter's own header
  // explains the 14-theme hex rule by quoting a hex, and the controller's
  // explains invariant 3 by quoting `await`, so a raw grep would fail on the
  // documentation rather than on the code.
  const strip = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const stripped = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  const calls = (stripped.match(/applyNightSceneEnd\s*\(/g) || []).length;
  check('nightscene.js calls applyNightSceneEnd exactly once', calls === 1, String(calls));
  check('...and no longer calls resolveNightSceneEnd directly (the applier owns the stamp)',
    !/resolveNightSceneEnd\s*\(/.test(stripped));
  check('...and never reaches for the retired private roll', !/rollGhostSuspicion/.test(stripped));
  check('Phase 5 added no await and no async to the tap path (design invariant 3)',
    !/\bawait\b/.test(stripped) && !/\basync\b/.test(stripped));
  check('the consequence layer is not duplicated in the controller — no effect DSL in this file',
    !/parseEffectDSL|applyEffects|LEAVE_EVIDENCE|awardSkillXp/.test(stripped));
  const rsrc = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  check("the painter still has no hardcoded hex (14 themes, D15's token rule)",
    (rsrc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff').length === 0);
  check('...and the end block reads the summary rather than re-deriving a consequence',
    /vm\.end/.test(rsrc) && !/rollGhostSuspicion/.test(rsrc));
}

// ---------------------------------------------------------------- 9
console.log('\n9. nightEndSummary reports what LANDED, and only what landed');
const r9 = J(`(() => {
  const run = (over, outcome) => {
    const g = __mk(91); const id = __target(g); __sleep(g, id, 'bedroom_1'); __cold(g, id);
    __open(g, id, over);
    currentGameState = g;
    nightSession = __sess(id);
    nightEndScene(outcome);
    const s = nightSession;
    const sum = nightEndSummary(g, s);
    const vm = nightViewModel(g, s);
    return { sum, ended: s.ended, endOutcome: s.endOutcome, hasResult: !!s.endResult,
             vmEnd: vm ? vm.end : null, vmEnded: vm ? vm.ended : null };
  };
  const dirty = run({ touches: ['a'], xp: 4, evidence: ['shirt', 'sheets'], heat: 120, climaxCount: 1 }, 'exit');
  const clean = run({ touches: ['a'], xp: 4 }, 'exit');
  const hostile = run({ touches: ['a'], xp: 4 }, 'wake_hostile');
  const willing = run({ touches: ['a'], xp: 4, heat: 200, climaxCount: 2 }, 'wake_willing');
  const nothing = run({}, 'abandon');
  const keys = (r) => (r.sum.rows || []).map(x => x.key);
  const labels = (r) => (r.sum.rows || []).map(x => x.label);
  return {
    dirtyKeys: keys(dirty), dirtyLabels: labels(dirty), dirtyNote: dirty.sum.note,
    cleanKeys: keys(clean), cleanNote: clean.sum.note,
    hostileKeys: keys(hostile), hostileHeading: hostile.sum.heading,
    willingKeys: keys(willing), willingLabels: labels(willing),
    nothingKeys: keys(nothing), nothingHeading: nothing.sum.heading,
    resultCarried: dirty.hasResult, vmMirrors: JSON.stringify(dirty.vmEnd) === JSON.stringify(dirty.sum),
    vmEnded: dirty.vmEnded,
  };
})()`);
check('a dirty exit reports the evidence, the bank and the climax',
  JSON.stringify(r9.dirtyKeys) === JSON.stringify(['evidence', 'xp', 'climax']),
  JSON.stringify(r9.dirtyKeys));
check('...and names what was left behind in the same words the confirmation used',
  /shirt/.test(r9.dirtyNote) && /sheets/.test(r9.dirtyNote) && / and /.test(r9.dirtyNote), r9.dirtyNote);
check('a clean exit says so out loud rather than saying nothing',
  JSON.stringify(r9.cleanKeys) === JSON.stringify(['evidence', 'xp'])
  && /nothing/i.test(r9.cleanNote), r9.cleanNote);
check('a hostile wake reports being caught and the cold shoulder',
  JSON.stringify(r9.hostileKeys) === JSON.stringify(['wake', 'cold', 'xp']),
  JSON.stringify(r9.hostileKeys));
check('a willing wake reports the willing wake, and pluralises the climaxes',
  JSON.stringify(r9.willingKeys) === JSON.stringify(['wake', 'xp', 'climax'])
  && /2 times/.test(r9.willingLabels.join('|')), JSON.stringify(r9.willingLabels));
check('an abandon reports NOTHING — no xp chip, no evidence chip, no invented consequence',
  JSON.stringify(r9.nothingKeys) === JSON.stringify([]) && r9.nothingHeading === 'The moment passes');
check('the session carries the consequence layer’s own return value', r9.resultCarried);
check('...and the view model hands the painter exactly that summary', r9.vmMirrors && r9.vmEnded);

// ---------------------------------------------------------------- 10
console.log('\n10. D14/D38: the climax beat is positive, fires on the crossing, and never ends the session');
const r10 = J(`(() => {
  const g = __mk(101); const id = __target(g); __sleep(g, id, 'bedroom_1');
  currentGameState = g;
  // Just under the checkpoint: any real touch crosses it, whatever the palette
  // happens to offer at this pose.
  __open(g, id, { pose: 'back', covers: 'off', heat: 99.99, detection: 0, floor: 0 });
  nightSession = __sess(id);
  nightSyncSelection(g, nightSession);
  const motions = nightMotionRow(nightPalette(g, id), nightSession.sel);
  nightFire(motions[0]);
  const crossed = { beat: nightSession.climaxBeat, ended: nightSession.ended,
    count: g.npcs[id].flags._nightScene.climaxCount,
    resolved: g.npcs[id].flags._nightScene.resolved,
    vm: (() => { const v = nightViewModel(g, nightSession); return { climax: v.climax, count: v.climaxCount }; })() };
  // The very next action does not re-fire it (climaxCount is monotone), and
  // the badge clears.
  nightSyncSelection(g, nightSession);
  const m2 = nightMotionRow(nightPalette(g, id), nightSession.sel);
  nightFire(m2[0]);
  const after = { beat: nightSession.climaxBeat, ended: nightSession.ended,
    count: g.npcs[id].flags._nightScene.climaxCount };
  // And falling back below the checkpoint does not re-arm it (D38).
  const g2 = __mk(102); const id2 = __target(g2); __sleep(g2, id2, 'bedroom_1');
  __open(g2, id2, { pose: 'back', covers: 'off', heat: 40, climaxCount: 1 });
  const r = nightStepAction(g2, id2, 'nipple.both.fingers.roll.steady', 0);
  return { crossed, after, spentCheckpoint: r ? { climaxed: r.climaxed, count: r.climaxCount } : null };
})()`);
check('crossing a hundred fires the beat', r10.crossed.beat === true, JSON.stringify(r10.crossed));
check('...and banks the checkpoint', r10.crossed.count === 1);
check('...and does NOT end the session (D14: purely positive, never a wake trigger)',
  r10.crossed.ended === false && r10.crossed.resolved === null);
check('the view model carries it to the painter with the count', r10.crossed.vm.climax === true
  && r10.crossed.vm.count === 1);
check('the next action clears the badge rather than leaving it stuck',
  r10.after.beat === false && r10.after.ended === false);
check('...and does not fire a second beat for the same checkpoint', r10.after.count === 1);
check('climbing back through a SPENT checkpoint never re-fires it',
  r10.spentCheckpoint && r10.spentCheckpoint.climaxed === false && r10.spentCheckpoint.count === 1,
  JSON.stringify(r10.spentCheckpoint));

// ---------------------------------------------------------------- 11
console.log('\n11. The defect Phase 5 found: an ended session could not be dismissed');
// Found by hand in dev-harness.html while verifying this phase's own end block:
// nightEndScene stamps `ended`, which makes nightSceneActive() false BY DESIGN
// -- the scene really is over -- and nightHandle's first line was an
// active-only guard, so the end block's Continue button was inert. The overlay
// could not be closed at all: D24's time context stayed pushed at scale 1 and
// the session's frames were never released. The `kind !== 'close'` clause that
// sat below the guard proves the intent was always to let close through; it
// was simply unreachable. Pre-existing (Phase 3b), fixed here because every
// ending this phase wires ends at that button.
const r11 = J(`(() => {
  const g = __mk(111); const id = __target(g); __sleep(g, id, 'bedroom_1');
  __open(g, id, { touches: ['a'], xp: 2 });
  currentGameState = g;
  nightSession = __sess(id);
  nightEndScene('exit');
  const endedButLive = { active: nightSceneActive(), session: !!nightSession };
  nightHandle('close');
  const afterClose = { session: !!nightSession };
  // And an input that is NOT close must still be refused on a dead session.
  const g2 = __mk(112); const id2 = __target(g2); __sleep(g2, id2, 'bedroom_1');
  __open(g2, id2, { touches: ['a'], xp: 2 });
  currentGameState = g2;
  nightSession = __sess(id2);
  nightEndScene('exit');
  const touchesBefore = g2.npcs[id2].flags._nightScene.touches.length;
  nightHandle('motion', 'brush');
  nightHandle('leave');
  const refused = g2.npcs[id2].flags._nightScene.touches.length === touchesBefore;
  nightHandle('close');
  // No session at all: every input is a no-op rather than a throw.
  let threw = false;
  try { nightHandle('close'); nightHandle('motion', 'brush'); } catch (e) { threw = true; }
  return { endedButLive, afterClose, refused, threw };
})()`);
check('an ended session is correctly no longer "active"', r11.endedButLive.active === false
  && r11.endedButLive.session === true);
check('...but close still reaches nightCloseOverlay and tears the session down',
  r11.afterClose.session === false);
check('...while every other input on an ended session is still refused', r11.refused);
check('and with no session open at all, nothing throws', r11.threw === false);

// ---------------------------------------------------------------- 12
// The second defect the same hand pass found. The end block is painted into
// #night-panel, and the phone media query hides that panel unless the tray has
// been raised -- so on a phone a resolved session showed the frame, an empty
// compact bar (nightPaintCompact returns early once ended) and nothing else:
// no receipt, no Continue, no way out. The marker was already there and unused;
// this is the rule that reads it. Node cannot lay out CSS, so what is asserted
// is the CONTRACT between the painter and the stylesheet: the painter stamps
// data-ended, and index.html has a phone-scoped rule keyed on it that brings
// the panel back.
{
  const idx = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
  const rsrc = fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8');
  check('the painter stamps data-ended on the container when a session resolves',
    /setAttribute\('data-ended'/.test(rsrc));
  check('...and clears it when one has not', /removeAttribute\('data-ended'\)/.test(rsrc));
  const phone = idx.slice(idx.indexOf('/* --- phone (D15): the frame IS the screen'));
  check('the phone stylesheet brings the panel back for an ended session',
    /\.night-content\[data-ended\] \.night-panel/.test(phone));
  check('...and drops the scrim, so the closing line is not printed twice',
    /\.night-content\[data-ended\] \.night-scrim \{ display: none/.test(phone));
  check('the end block itself carries a Continue button bound to close',
    /'close'/.test(rsrc) && /Continue/.test(rsrc));
}

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
