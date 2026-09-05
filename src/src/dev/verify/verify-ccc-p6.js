// continuous-cadence-closure-plan.md — Phase 6: The next-wake-time
// primitive (D7, D14).
//
//   node src/src/dev/verify/verify-ccc-p6.js
//
// nextWakeAbs(gameState) — sim.js, right after chanceOverMinutes — is pure
// and proven correct here against constructed scenarios. NOTHING calls it
// yet; wiring resolveBatch/advanceAndResolveMinutes to actually resolve up
// to its answer is Phase 7's job (Design Invariant 3: never cut that in
// before this primitive is independently verified, on top of Phase 5).
//
// D14 (new this session) — two corrections to D7's literal wording, found
// reading the live code rather than guessed, both exercised below:
//   1. Broadened "every active RESIDENT's commitment" to every ACTIVE npc's
//      commitment (residents AND active visitors) — resolveTick's own Pass
//      1 already treats a visitor's npc.commitment exactly like a
//      resident's (nextDecisionAbs/dueForDecision, cognition.js, read both
//      uniformly). Section 3 below constructs a VISITING npc whose own
//      commitment is the soonest event in the whole scenario and confirms
//      it wins — the case D7's literal "resident-only" wording would have
//      missed.
//   2. Narrowed D7's "world.{commitments,visits,deliveries}" list to just
//      commitments and visits. world.deliveries[]/world.renovationJobs[]
//      are DAY-granular (etaDay/startDay) — no startAbs/endAbs field exists
//      to read — and midnight is already detected independently every
//      frame by clockFrame's own day-crossing check (time.js), a mechanism
//      Phase 7 does not touch. Section 6 below confirms their presence in
//      gameState.world is simply inert to nextWakeAbs's answer.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'commitments.js', 'world.js', 'movement.js', 'cognition.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // A minimal, fully-controlled gameState: one resident with no
  // commitment/walk/follow, clock parked at an exact multiple of
  // TIME_DILATION.HEARTBEAT_MINUTES so the heartbeat-boundary math is easy
  // to hand-verify. world.commitments/world.visits/world.deliveries/
  // world.renovationJobs all start empty.
  __mk = (minutes) => {
    const h = SIM_generateHouse(20260902, 1);
    h.meta = { seed: h.seed, clock: { day: 5, minutes }, contentConfig: null, sessionLog: [] };
    for (const npc of Object.values(h.npcs)) {
      delete npc.commitment;
      delete npc.follow;
      npc.walk = null;
      npc.transit = null;
    }
    h.world.commitments = [];
    h.world.visits = [];
    h.world.deliveries = [];
    h.world.renovationJobs = [];
    return h;
  };
  __residentId = (h) => Object.keys(h.npcs).find(id => h.npcs[id].residency.status === 'resident');
  __nowAbs = (h) => h.meta.clock.day * 1440 + h.meta.clock.minutes;
`);

// ---------------------------------------------------------------- 0
console.log('0. Registration + fixture sanity');
const fixture = J(`(() => {
  const h = __mk(600); // 600 % 5 === 0 — parked exactly on a heartbeat boundary
  return {
    hasFn: typeof nextWakeAbs === 'function',
    hasGetActiveVisits: typeof getActiveVisits === 'function',
    hasGetActiveNpcIds: typeof getActiveNpcIds === 'function',
    heartbeatMinutes: TIME_DILATION.HEARTBEAT_MINUTES,
    residentCount: Object.values(h.npcs).filter(n => n.residency.status === 'resident').length,
  };
})()`);
check('nextWakeAbs is a real function', fixture.hasFn);
check('getActiveVisits/getActiveNpcIds are real (reused, not reimplemented — Invariant 4)', fixture.hasGetActiveVisits && fixture.hasGetActiveNpcIds);
check('TIME_DILATION.HEARTBEAT_MINUTES is 5 (this harness assumes it)', fixture.heartbeatMinutes === 5, JSON.stringify(fixture));
check('fixture house has exactly one resident', fixture.residentCount === 1, JSON.stringify(fixture));

// ---------------------------------------------------------------- 1
console.log('\n1. No-one-has-anything-scheduled fallback — always returns the next heartbeat boundary, never null/undefined');
const fallback = J(`(() => {
  return [600, 601, 602, 603, 604, 599].map(minutes => {
    const h = __mk(minutes);
    const nowAbs = __nowAbs(h);
    const answer = nextWakeAbs(h);
    return { minutes, nowAbs, answer };
  });
})()`);
for (const { minutes, nowAbs, answer } of fallback) {
  const wanted = nowAbs % 5 === 0 ? nowAbs + 5 : nowAbs + (5 - (nowAbs % 5));
  check(`minutes=${minutes}: nextWakeAbs is a finite number strictly greater than now`, Number.isFinite(answer) && answer > nowAbs, `answer=${answer} nowAbs=${nowAbs}`);
  check(`minutes=${minutes}: nextWakeAbs === the next 5-minute boundary (${wanted}), including the on-the-boundary case never returning 0 minutes ahead`,
    answer === wanted, `answer=${answer} wanted=${wanted}`);
}

// ---------------------------------------------------------------- 2
console.log('\n2. A resident\'s own commitment.completesAtAbs wins when sooner than the heartbeat boundary');
const residentWin = J(`(() => {
  const h = __mk(600); // next heartbeat boundary would be 605 (day*1440+605)
  const id = __residentId(h);
  const nowAbs = __nowAbs(h);
  h.npcs[id].commitment = { completesAtAbs: nowAbs + 2 }; // sooner than the heartbeat
  return { nowAbs, answer: nextWakeAbs(h), expected: nowAbs + 2 };
})()`);
check('a resident commitment ending in 2 minutes beats the 5-minute heartbeat boundary', residentWin.answer === residentWin.expected, JSON.stringify(residentWin));

// ---------------------------------------------------------------- 3
console.log('\n3. D14 — a VISITING npc\'s own commitment also contributes (not just residents\' — the literal-D7 case this would have missed)');
const visitorWin = J(`(() => {
  const h = __mk(600);
  const nowAbs = __nowAbs(h);
  const residentId = __residentId(h);
  h.npcs[residentId].commitment = { completesAtAbs: nowAbs + 100 }; // far away, not the winner
  const visitorId = 'npc_visitor_test';
  h.npcs[visitorId] = { residency: { status: 'visitor' }, commitment: { completesAtAbs: nowAbs + 1 } };
  h.world.visits.push({ npcId: visitorId, status: 'scheduled', startAbs: nowAbs - 10, endAbs: nowAbs + 500 });
  return { nowAbs, answer: nextWakeAbs(h), expected: nowAbs + 1 };
})()`);
check('the visiting npc is picked up as active (getActiveNpcIds) and its own commitment (ending in 1 minute) wins over everything else',
  visitorWin.answer === visitorWin.expected, JSON.stringify(visitorWin));

// ---------------------------------------------------------------- 4
console.log('\n4. world.commitments[] — both startAbs and endAbs contribute; only \'scheduled\' status counts; a held/missed record is ignored even with a nominally-future window');
const worldCommitments = J(`(() => {
  const h = __mk(600);
  const nowAbs = __nowAbs(h);
  const results = {};
  // 4a: window not yet open — startAbs (the sooner of the two) wins.
  {
    const h1 = __mk(600);
    h1.world.commitments.push({ id: 'c1', kind: 'meal', status: 'scheduled', startAbs: nowAbs + 3, endAbs: nowAbs + 40, roomId: 'kitchen' });
    results.notYetOpen = { answer: nextWakeAbs(h1), expected: nowAbs + 3 };
  }
  // 4b: window already open (startAbs <= now) — startAbs is filtered out
  // (not strictly future), so endAbs is the only real candidate.
  {
    const h2 = __mk(600);
    h2.world.commitments.push({ id: 'c2', kind: 'meal', status: 'scheduled', startAbs: nowAbs - 5, endAbs: nowAbs + 4, roomId: 'kitchen' });
    results.alreadyOpen = { answer: nextWakeAbs(h2), expected: nowAbs + 4 };
  }
  // 4c: a 'held' record with a nominally-future window must be ignored —
  // resolved history, not a live wake trigger.
  {
    const h3 = __mk(600);
    h3.world.commitments.push({ id: 'c3', kind: 'meal', status: 'held', startAbs: nowAbs + 1, endAbs: nowAbs + 2, roomId: 'kitchen' });
    results.heldIgnored = { answer: nextWakeAbs(h3), expected: nowAbs + 5 }; // falls through to the heartbeat boundary
  }
  return results;
})()`);
check('4a not-yet-open window: startAbs (sooner) wins over endAbs', worldCommitments.notYetOpen.answer === worldCommitments.notYetOpen.expected, JSON.stringify(worldCommitments.notYetOpen));
check('4b already-open window: startAbs is in the past so endAbs is the real candidate', worldCommitments.alreadyOpen.answer === worldCommitments.alreadyOpen.expected, JSON.stringify(worldCommitments.alreadyOpen));
check('4c a held commitment record is ignored entirely, even with future-looking startAbs/endAbs', worldCommitments.heldIgnored.answer === worldCommitments.heldIgnored.expected, JSON.stringify(worldCommitments.heldIgnored));

// ---------------------------------------------------------------- 5
console.log('\n5. world.visits[] — same shape: both bounds contribute, \'done\'/\'deferred\' are ignored');
const worldVisits = J(`(() => {
  const results = {};
  {
    const h = __mk(600);
    const nowAbs = __nowAbs(h);
    h.world.visits.push({ npcId: 'ext1', status: 'scheduled', startAbs: nowAbs + 2, endAbs: nowAbs + 90 });
    results.notYetStarted = { answer: nextWakeAbs(h), expected: nowAbs + 2 };
  }
  {
    const h = __mk(600);
    const nowAbs = __nowAbs(h);
    h.world.visits.push({ npcId: 'ext2', status: 'scheduled', startAbs: nowAbs - 20, endAbs: nowAbs + 3 });
    results.alreadyActive = { answer: nextWakeAbs(h), expected: nowAbs + 3 };
  }
  {
    const h = __mk(600);
    const nowAbs = __nowAbs(h);
    h.world.visits.push({ npcId: 'ext3', status: 'done', startAbs: nowAbs + 1, endAbs: nowAbs + 2 });
    h.world.visits.push({ npcId: 'ext4', status: 'deferred', startAbs: nowAbs + 1, endAbs: nowAbs + 2 });
    results.doneDeferredIgnored = { answer: nextWakeAbs(h), expected: nowAbs + 5 };
  }
  return results;
})()`);
check('5a a visit that has not started yet: startAbs wins', worldVisits.notYetStarted.answer === worldVisits.notYetStarted.expected, JSON.stringify(worldVisits.notYetStarted));
check('5b a visit already underway: endAbs (its close) wins', worldVisits.alreadyActive.answer === worldVisits.alreadyActive.expected, JSON.stringify(worldVisits.alreadyActive));
check('5c \'done\'/\'deferred\' visits are ignored entirely', worldVisits.doneDeferredIgnored.answer === worldVisits.doneDeferredIgnored.expected, JSON.stringify(worldVisits.doneDeferredIgnored));

// ---------------------------------------------------------------- 6
console.log('\n6. Ties, and deliveries/renovationJobs being genuinely inert (D14\'s narrowing)');
const tiesAndInert = J(`(() => {
  const h = __mk(600);
  const nowAbs = __nowAbs(h);
  const residentId = __residentId(h);
  const tieAbs = nowAbs + 3; // sooner than the +5 heartbeat boundary, so it's a genuine tie between these three, not a coincidence of the fallback
  h.npcs[residentId].commitment = { completesAtAbs: tieAbs };
  h.world.commitments.push({ id: 'tie1', kind: 'meal', status: 'scheduled', startAbs: nowAbs - 1, endAbs: tieAbs, roomId: 'kitchen' });
  h.world.visits.push({ npcId: 'ext5', status: 'scheduled', startAbs: tieAbs, endAbs: nowAbs + 200 });
  const answerBefore = nextWakeAbs(h);
  // Now add day-granular records with no startAbs/endAbs at all — these
  // must not throw and must not change the answer (D14: not read at all).
  h.world.deliveries.push({ id: 'del1', defId: 'x', qty: 1, status: 'ordered', etaDay: h.meta.clock.day + 1, orderedDay: h.meta.clock.day });
  h.world.renovationJobs.push({ id: 'job1', status: 'active', startDay: h.meta.clock.day, etaDay: h.meta.clock.day + 3 });
  const answerAfter = nextWakeAbs(h);
  return { nowAbs, tieAbs, answerBefore, answerAfter };
})()`);
check('three independent sources landing on the exact same minute still resolve to that one minute (a real tie, not a coincidence of the heartbeat term)',
  tiesAndInert.answerBefore === tiesAndInert.tieAbs, JSON.stringify(tiesAndInert));
check('adding day-granular world.deliveries[]/world.renovationJobs[] records (no startAbs/endAbs field at all) neither throws nor changes the answer',
  tiesAndInert.answerAfter === tiesAndInert.answerBefore, JSON.stringify(tiesAndInert));

// ---------------------------------------------------------------- 7
console.log('\n7. An already-overdue commitment/window does not pull the answer into the past — nextWakeAbs is always >= now');
const overdue = J(`(() => {
  const h = __mk(600);
  const nowAbs = __nowAbs(h);
  const residentId = __residentId(h);
  h.npcs[residentId].commitment = { completesAtAbs: nowAbs - 50 }; // already due — dueForDecision's domain
  h.world.commitments.push({ id: 'stale', kind: 'meal', status: 'scheduled', startAbs: nowAbs - 100, endAbs: nowAbs - 1, roomId: 'kitchen' });
  return { nowAbs, answer: nextWakeAbs(h), expected: nowAbs + 5 };
})()`);
check('every candidate being in the past falls all the way through to the heartbeat boundary, never returning a stale/past minute',
  overdue.answer === overdue.expected && overdue.answer > overdue.nowAbs, JSON.stringify(overdue));

// ---------------------------------------------------------------- 8
console.log('\n8. Wiring/scope: nextWakeAbs exists in sim.js, reuses getActiveVisits/getActiveNpcIds; wired into resolveBatch by Phase 7 (was "nothing calls it yet" at Phase 6 time)');
const fs = require('fs');
const simSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'sim.js'), 'utf8');
// continuous-cadence-closure Phase 7 (D17) added an optional second
// parameter (opts, default {}) — the signature this regex looks for updated
// to match; every check below still holds against the same function body.
const defMatch = simSrc.match(/function nextWakeAbs\(gameState, opts = \{\}\) \{[\s\S]*?\n\}/);
check('nextWakeAbs is defined in sim.js', !!defMatch);
if (defMatch) {
  const body = defMatch[0];
  check('the definition calls getActiveVisits/getActiveNpcIds rather than re-deriving "who\'s active" (Invariant 4)',
    body.includes('getActiveVisits(gameState)') && body.includes('getActiveNpcIds(gameState'));
  check('the definition never calls clockToAbsolute (sim.js loads before time.js; inlines the arithmetic like visitDay/getActiveVisits do)',
    !body.includes('clockToAbsolute('));
}
// continuous-cadence-closure Phase 7 wired this in (resolveBatch's own
// advancing-branch loop, D16) — see verify-ccc-p7.js for the full proof this
// is used correctly, not just present. Was "exactly one occurrence... no
// caller wired in yet" at Phase 6 time; two is now the expected, intended
// count (the definition plus its one real call site).
const callSites = (simSrc.match(/\bnextWakeAbs\(/g) || []).length;
check('nextWakeAbs has exactly two occurrences in sim.js — its own definition, plus the one real call site Phase 7 wired in (resolveBatch)', callSites === 2, `occurrences=${callSites}`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
