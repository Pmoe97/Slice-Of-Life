// continuous-cadence-closure-plan.md — Phase 7: Cut over to variable-length
// resolution (D16), plus the top-of-phase STEALTH_TUNING blocker closed.
//
//   node src/src/dev/verify/verify-ccc-p7.js
//
// Two things land here:
//
// 1. The STEALTH_TUNING split (carried from the Phase 5 handoff, re-flagged
//    in Phase 7's own Handoff as the one real blocker before cutting in).
//    baseEvidenceDiscoveryChance is gone; roomSearchEvidenceDiscoveryChance
//    (performCleaningVisit, computer.js — untouched, still a flat per-visit
//    roll) and evidenceDiscoveryChancePerTick (resolveTick Pass 2, sim.js —
//    now minute-converted at the call site, same shape as
//    thermostatSelfAdjustChance/D13) replace it. evidenceStrengthDiscoveryFactor
//    stays, unrenamed — sim.js's own single reader, D10's precedent.
//
// 2. resolveBatch's own internal loop (D16): no longer `ticks` identical
//    CLOCK.tickMinutes-sized calls. The discrete/advancing branch steps by
//    nextWakeAbs (sim.js, Phase 6) bounded by what's left in the batch, so a
//    commitment completing mid-batch is resolved at ITS OWN real minute, with
//    Pass 2's now-per-minute rates (Phase 5) correctly split across the
//    sub-span before completion and the sub-span after — never smeared
//    across whichever flat 30-minute lump it fell inside (Design Invariant
//    3). The frozen-clock/checkpoint branch (advanceClock:false,
//    TIME's runSimCheckpoint) collapses to ONE resolveTick call over the
//    TRUE accumulated span (opts.needsMinutes, now threaded through from
//    time.js even though suppressNeeds is true on that path) instead of N
//    calls that used to replay the identical rng seed since meta.clock never
//    moved between them.
//
// resolveTick(gameState, minutesThisTick = CLOCK.tickMinutes): the span is
// now a real parameter, not a hoisted constant — defaulting to
// CLOCK.tickMinutes keeps every OTHER existing single-argument call site
// (dozens, across unrelated verify harnesses) byte-identical (Design
// Invariant 2 — Pass 1/2/3's own contract never changes).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'commitments.js', 'world.js', 'movement.js',
    'cognition.js', 'dirt.js', 'temperature.js', 'signals.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // A seeded house, clock parked at day 5 / minute 600 — squarely inside
  // SCHEDULES.standard's 'midday' (weekday, [600,960)) or 'leisure' (weekend,
  // [540,1080)) block either way, so the committed NPC's schedule block
  // stays STABLE across the whole [600,660] test window regardless of which
  // day-type day 5 lands on — no block-transition noise to control for.
  // 'standard' also carries no work/commute blocks at all, so there is no
  // risk of npcIsOffsite's missing-location release firing unexpectedly.
  __mk = () => {
    const h = SIM_generateHouse(20260902, 2);
    h.meta = { seed: h.seed, clock: { day: 5, minutes: 600 }, contentConfig: null, sessionLog: [] };
    for (const npc of Object.values(h.npcs)) {
      delete npc.commitment;
      delete npc.follow;
      npc.walk = null;
      npc.transit = null;
      npc.bible = npc.bible || {};
      npc.bible.scheduleTemplate = 'standard';
      npc.needs = { hunger: 50, energy: 50, hygiene: 50, social: 50, comfort: 50, stimulation: 50, desire: 50 };
    }
    h.world.commitments = [];
    h.world.visits = [];
    h.world.deliveries = [];
    h.world.renovationJobs = [];
    return h;
  };
  __residentIds = (h) => Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  __nowAbs = (h) => h.meta.clock.day * 1440 + h.meta.clock.minutes;
`);

// ---------------------------------------------------------------- 0
console.log('0. Registration + fixture sanity');
const fixture = J(`(() => {
  const h = __mk();
  return {
    hasResolveTick: typeof resolveTick === 'function',
    hasResolveBatch: typeof resolveBatch === 'function',
    hasAdvanceClockByMinutes: typeof advanceClockByMinutes === 'function',
    hasNextWakeAbs: typeof nextWakeAbs === 'function',
    residentCount: __residentIds(h).length,
    tickMinutes: CLOCK.tickMinutes,
  };
})()`);
check('resolveTick/resolveBatch/advanceClockByMinutes/nextWakeAbs are all real functions', fixture.hasResolveTick && fixture.hasResolveBatch && fixture.hasAdvanceClockByMinutes && fixture.hasNextWakeAbs, JSON.stringify(fixture));
check('fixture house has at least 2 residents', fixture.residentCount >= 2, JSON.stringify(fixture));
check('CLOCK.tickMinutes is 30 (this harness assumes it)', fixture.tickMinutes === 30, JSON.stringify(fixture));

// ---------------------------------------------------------------- 1
console.log('\n1. resolveTick(gs) [1-arg] is byte-identical to resolveTick(gs, CLOCK.tickMinutes) [2-arg] — the default preserves every pre-Phase-7 single-argument caller (Design Invariant 2)');
const defaultParam = J(`(() => {
  const h1 = __mk(); const h2 = __mk();
  const r1 = resolveTick(h1);
  const r2 = resolveTick(h2, CLOCK.tickMinutes);
  return {
    sameEventCount: r1.newEvents.length === r2.newEvents.length,
    sameUpdateKeys: JSON.stringify(Object.keys(r1.npcUpdates).sort()) === JSON.stringify(Object.keys(r2.npcUpdates).sort()),
    sameEvents: JSON.stringify(r1.newEvents) === JSON.stringify(r2.newEvents),
    sameUpdates: JSON.stringify(r1.npcUpdates) === JSON.stringify(r2.npcUpdates),
  };
})()`);
check('identical event count/keys/content between the 1-arg and 2-arg call', defaultParam.sameEventCount && defaultParam.sameUpdateKeys && defaultParam.sameEvents && defaultParam.sameUpdates, JSON.stringify(defaultParam));

// ---------------------------------------------------------------- 2
console.log('\n2. STEALTH_TUNING split (top-of-phase blocker) — new fields exist, old shared name is gone, values preserved');
const stealthSplit = J(`({
  roomSearch: STEALTH_TUNING.roomSearchEvidenceDiscoveryChance,
  perTick: STEALTH_TUNING.evidenceDiscoveryChancePerTick,
  factor: STEALTH_TUNING.evidenceStrengthDiscoveryFactor,
  oldGone: !('baseEvidenceDiscoveryChance' in STEALTH_TUNING),
})`);
check('roomSearchEvidenceDiscoveryChance === 0.15 (performCleaningVisit\'s unchanged value)', stealthSplit.roomSearch === 0.15, JSON.stringify(stealthSplit));
check('evidenceDiscoveryChancePerTick === 0.15 (resolveTick Pass 2\'s copy, same raw number, now minute-converted at its call site)', stealthSplit.perTick === 0.15, JSON.stringify(stealthSplit));
check('evidenceStrengthDiscoveryFactor === 0.5, unrenamed (D10 precedent — sim.js\'s own single reader)', stealthSplit.factor === 0.5, JSON.stringify(stealthSplit));
check('the old shared baseEvidenceDiscoveryChance name is gone (no dual definition left behind)', stealthSplit.oldGone, JSON.stringify(stealthSplit));

const fs = require('fs');
const path = require('path');
const computerSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'srcfiles', 'computer.js'), 'utf8');
const simSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'srcfiles', 'sim.js'), 'utf8');
const timeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'srcfiles', 'time.js'), 'utf8');
check('computer.js\'s performCleaningVisit reads roomSearchEvidenceDiscoveryChance, not the old shared name', computerSrc.includes('STEALTH_TUNING.roomSearchEvidenceDiscoveryChance') && !computerSrc.includes('STEALTH_TUNING.baseEvidenceDiscoveryChance'));
check('sim.js\'s Pass 2 reads evidenceDiscoveryChancePerTick, wrapped in chanceOverMinutes at the call site (same shape as thermostatSelfAdjustChance)', simSrc.includes('STEALTH_TUNING.evidenceDiscoveryChancePerTick') && /chanceOverMinutes\(1 - Math\.pow\(1 - evidenceTickChance/.test(simSrc));

// ---------------------------------------------------------------- 3
console.log('\n3. resolveBatch (discrete/advancing path) — a commitment completing at a non-tick-boundary minute is resolved at ITS OWN exact minute, not smeared to the next 30-minute grid line');
const exactLanding = J(`(() => {
  const h = __mk();
  const [id] = __residentIds(h);
  const nowAbs = __nowAbs(h);
  const completesAtAbs = nowAbs + 47; // deliberately not a multiple of 5 (heartbeat) or 30 (old tick grid)
  h.npcs[id].commitment = { kind: 'activity', arrived: true, anchor: { roomId: 'living_room' }, activity: 'reading', completesAtAbs };

  // Instrument resolveTick to record exactly which absolute minute and span
  // each internal call resolves — the direct, unambiguous proof of D16's
  // stepping (rather than inferring it from side effects).
  __origResolveTick = resolveTick;
  __steps = [];
  resolveTick = function(gs, m) {
    __steps.push({ endAbs: gs.meta.clock.day * 1440 + gs.meta.clock.minutes, minutesThisTick: m });
    return __origResolveTick(gs, m);
  };
  const { state } = resolveBatch(h, 2, {}); // ticks=2 => exactly 60 minutes total, spanning the +47 completion
  resolveTick = __origResolveTick; // restore before any other check runs

  return {
    nowAbs, completesAtAbs,
    steps: __steps,
    stepSum: __steps.reduce((s, x) => s + x.minutesThisTick, 0),
    landedExactly: __steps.some(s => s.endAbs === completesAtAbs),
    // The ORIGINAL commitment (identified by its own completesAtAbs) must be
    // gone by :47 — not "npc.commitment is now falsy": a freed NPC's Pass 3
    // immediately re-scores drives in that SAME resolveTick call and can
    // open a brand-new commitment on the spot (observed: this fixture's NPC
    // reopens a fresh 'read_book' drive commitment, coincidentally the same
    // activity text but a genuinely different object/anchor/completesAtAbs)
    // — released means THIS object is gone, not that the field is empty.
    originalCommitmentReleased: !state.npcs[id].commitment || state.npcs[id].commitment.completesAtAbs !== completesAtAbs,
    finalClockAbs: state.meta.clock.day * 1440 + state.meta.clock.minutes,
  };
})()`);
check('the batch totals exactly 60 minutes across its internal steps (ticks*CLOCK.tickMinutes preserved, only the internal grain changed)', exactLanding.stepSum === 60, JSON.stringify(exactLanding));
check('some internal step ends EXACTLY at nowAbs+47 (the commitment\'s own completion minute), not rounded to :30/:60', exactLanding.landedExactly, JSON.stringify(exactLanding));
check('more than one internal step ran (proof this is not just one 60-minute lump)', exactLanding.steps.length > 1, JSON.stringify(exactLanding));
check('every step is bounded by the OLD flat CLOCK.tickMinutes=30 cadence UNLESS the real +47 completion falls inside that window, in which case it lands exactly there instead (D17 — never heartbeat-sized; that would re-decide every uncommitted NPC every ~5 minutes instead of every 30)',
  (() => {
    let abs = exactLanding.nowAbs;
    for (const s of exactLanding.steps) {
      const span = s.endAbs - abs;
      const isFlatCadence = span <= 30;
      const isCommitmentLanding = s.endAbs === exactLanding.completesAtAbs;
      if (!isFlatCadence && !isCommitmentLanding) return false;
      abs = s.endAbs;
    }
    return true;
  })(), JSON.stringify(exactLanding.steps));
check('exactly 3 steps for this scenario: flat-30 to +30, real-landing to +47, remainder to +60 (proves the fallback is the flat cadence, not the heartbeat)',
  exactLanding.steps.length === 3
  && exactLanding.steps[0].endAbs === exactLanding.nowAbs + 30
  && exactLanding.steps[1].endAbs === exactLanding.completesAtAbs
  && exactLanding.steps[2].endAbs === exactLanding.nowAbs + 60,
  JSON.stringify(exactLanding.steps));
check('the ORIGINAL commitment (completesAtAbs=nowAbs+47) is gone by the end of the batch — released at its own minute, not carried past it', exactLanding.originalCommitmentReleased, JSON.stringify(exactLanding));
check('the final clock lands at exactly nowAbs+60 (the full requested batch, unaffected by internal step count)', exactLanding.finalClockAbs === exactLanding.nowAbs + 60, JSON.stringify(exactLanding));

// ---------------------------------------------------------------- 4
console.log('\n4. resolveBatch (discrete path) needs decay: the sum across variable-sized steps still matches opts.needsMinutes exactly (generalizes needs-and-heartbeat Phase 3/D11\'s "equal division" to proportional division)');
const needsSum = J(`(() => {
  const h = __mk();
  const [id] = __residentIds(h);
  const nowAbs = __nowAbs(h);
  h.npcs[id].commitment = { kind: 'activity', arrived: true, anchor: { roomId: 'living_room' }, activity: 'reading', completesAtAbs: nowAbs + 13 };
  const before = h.npcs[id].needs.hunger;
  const { state } = resolveBatch(h, 3, { needsMinutes: 77 }); // a true span that does NOT equal ticks*CLOCK.tickMinutes (90)
  const after = state.npcs[id].needs.hunger;
  // Closed form: hunger's own net rate over exactly 77 minutes, computed
  // independently via applyNeedsHeartbeat on a fresh, otherwise-identical
  // state (same block/location throughout — no restore-keying complication
  // since this NPC never enters a restoring room), to cross-check the SUM
  // resolveBatch's own variable-length steps actually applied.
  const h2 = __mk();
  h2.npcs[id].needs.hunger = before;
  const direct = applyNeedsHeartbeat(h2, 77, { player: false });
  return { before, after, directAfter: direct.npcs[id].needs.hunger };
})()`);
check('resolveBatch\'s variable-step needs sum matches the true 77-minute span exactly (within float tolerance), not the tick-derived 90',
  Math.abs(needsSum.after - needsSum.directAfter) < 1e-6 && needsSum.after !== needsSum.before, JSON.stringify(needsSum));

// ---------------------------------------------------------------- 5
console.log('\n5. resolveBatch (frozen-clock / checkpoint path, advanceClock:false) — ONE resolveTick call over the TRUE opts.needsMinutes span, clock untouched');
const frozenBranch = J(`(() => {
  const h = __mk();
  const startClock = { ...h.meta.clock };
  __origResolveTick = resolveTick;
  __calls = [];
  resolveTick = function(gs, m) { __calls.push(m); return __origResolveTick(gs, m); };
  // ticks intentionally mismatched against needsMinutes (mirrors
  // runSimCheckpoint's own now-vestigial Math.round(minutes/30) ticks arg)
  // to prove needsMinutes, not ticks*CLOCK.tickMinutes, drives the span.
  const { state } = resolveBatch(h, 2, { advanceClock: false, suppressNeeds: true, needsMinutes: 17 });
  resolveTick = __origResolveTick;
  return {
    callCount: __calls.length,
    calls: __calls,
    clockUnchanged: state.meta.clock.day === startClock.day && state.meta.clock.minutes === startClock.minutes,
  };
})()`);
check('exactly one resolveTick call', frozenBranch.callCount === 1, JSON.stringify(frozenBranch));
check('that one call resolved the TRUE 17-minute span, not ticks*CLOCK.tickMinutes (60)', frozenBranch.calls[0] === 17, JSON.stringify(frozenBranch));
check('meta.clock is untouched (the checkpoint path never advances it — clockFrame already did)', frozenBranch.clockUnchanged, JSON.stringify(frozenBranch));

// ---------------------------------------------------------------- 6
console.log('\n6. Zero-span guards — both branches are true no-ops for a zero-tick / zero-span batch');
const zeroSpan = J(`(() => {
  const h1 = __mk();
  __origResolveTick = resolveTick;
  __calls = 0;
  resolveTick = function(gs, m) { __calls++; return __origResolveTick(gs, m); };
  const r1 = resolveBatch(h1, 0, {});
  const callsAdvancing = __calls;
  __calls = 0;
  const h2 = __mk();
  const r2 = resolveBatch(h2, 0, { advanceClock: false, suppressNeeds: true, needsMinutes: 0 });
  const callsFrozen = __calls;
  resolveTick = __origResolveTick;
  return { callsAdvancing, callsFrozen, eventsAdvancing: r1.events.length, eventsFrozen: r2.events.length };
})()`);
check('advancing branch, ticks=0: zero resolveTick calls, zero events', zeroSpan.callsAdvancing === 0 && zeroSpan.eventsAdvancing === 0, JSON.stringify(zeroSpan));
check('frozen branch, needsMinutes=0: zero resolveTick calls, zero events', zeroSpan.callsFrozen === 0 && zeroSpan.eventsFrozen === 0, JSON.stringify(zeroSpan));

// ---------------------------------------------------------------- 6b
console.log('\n6b. nextWakeAbs\'s new D17 option: includeHeartbeat:false returns +Infinity when nothing real is scheduled, and is otherwise identical to the default');
const includeHeartbeatOpt = J(`(() => {
  const h1 = __mk();
  const noneScheduled = nextWakeAbs(h1, { includeHeartbeat: false });
  // A commitment sooner than the 5-minute heartbeat: includeHeartbeat:false
  // and the untouched default must agree here (the real candidate wins either
  // way), proving false doesn't change anything BUT the fallback term.
  const h2 = __mk();
  const [id2] = __residentIds(h2);
  const nowAbs2 = __nowAbs(h2);
  h2.npcs[id2].commitment = { kind: 'activity', arrived: true, anchor: { roomId: 'living_room' }, activity: 'reading', completesAtAbs: nowAbs2 + 2 };
  const soonerThanHeartbeat = { withFlag: nextWakeAbs(h2, { includeHeartbeat: false }), withDefault: nextWakeAbs(h2), expected: nowAbs2 + 2 };
  // A commitment FARTHER than the heartbeat: this is where they must diverge
  // — the default falls back to the heartbeat boundary (D7's own behavior,
  // untouched), includeHeartbeat:false skips straight to the real candidate.
  const h3 = __mk();
  const [id3] = __residentIds(h3);
  const nowAbs3 = __nowAbs(h3);
  h3.npcs[id3].commitment = { kind: 'activity', arrived: true, anchor: { roomId: 'living_room' }, activity: 'reading', completesAtAbs: nowAbs3 + 12 };
  const fartherThanHeartbeat = { withFlag: nextWakeAbs(h3, { includeHeartbeat: false }), withDefault: nextWakeAbs(h3), expectedFlag: nowAbs3 + 12, expectedDefault: nowAbs3 + 5 };
  return { noneScheduled, isInfinite: noneScheduled === Infinity, soonerThanHeartbeat, fartherThanHeartbeat };
})()`);
check('includeHeartbeat:false with nothing real scheduled returns +Infinity (never a stale/fabricated minute)', includeHeartbeatOpt.isInfinite, JSON.stringify(includeHeartbeatOpt));
check('a real candidate sooner than the heartbeat: includeHeartbeat:false and the untouched default agree (both pick the real candidate)',
  includeHeartbeatOpt.soonerThanHeartbeat.withFlag === includeHeartbeatOpt.soonerThanHeartbeat.expected
  && includeHeartbeatOpt.soonerThanHeartbeat.withDefault === includeHeartbeatOpt.soonerThanHeartbeat.expected,
  JSON.stringify(includeHeartbeatOpt.soonerThanHeartbeat));
check('a real candidate FARTHER than the heartbeat: includeHeartbeat:false skips straight to it, while the untouched default still falls back to the heartbeat boundary (D7\'s own behavior, unchanged)',
  includeHeartbeatOpt.fartherThanHeartbeat.withFlag === includeHeartbeatOpt.fartherThanHeartbeat.expectedFlag
  && includeHeartbeatOpt.fartherThanHeartbeat.withDefault === includeHeartbeatOpt.fartherThanHeartbeat.expectedDefault,
  JSON.stringify(includeHeartbeatOpt.fartherThanHeartbeat));

// ---------------------------------------------------------------- 7
console.log('\n7. Design Invariant 2 / C1 — resolveTick\'s Pass 1/2/3 contract and CLOCK.tickMinutes/getTickIndex are untouched; only the resolution TRIGGER changed');
check('CLOCK.tickMinutes still exists (C1 — kept for bookkeeping, not removed)', J('CLOCK.tickMinutes') === 30);
check('getTickIndex still exists (C1)', J('typeof getTickIndex') === 'function');
check('resolveBatch\'s advancing branch actually calls nextWakeAbs, with includeHeartbeat:false (D16/D17 wiring — Phase 6\'s primitive is no longer unused)', /nextWakeAbs\(state, \{ includeHeartbeat: false \}\)/.test(simSrc));
check('nextWakeAbs itself gained the includeHeartbeat option (D17), defaulting true so every pre-Phase-7 caller (including verify-ccc-p6.js\'s 31 checks) is untouched', /function nextWakeAbs\(gameState, opts = \{\}\)/.test(simSrc) && /opts\.includeHeartbeat !== false/.test(simSrc));
check('time.js\'s runSimCheckpoint threads the true minutes through as needsMinutes (no longer lossily rounds to a tick count before resolveTick sees it)', /needsMinutes:\s*minutes/.test(timeSrc));
check('time.js\'s clockFrame checkpoint gate now reads nextWakeAbs with includeHeartbeat:false, min()\'d against the old flat simCheckpointMinutes cadence (not the flat poll alone, and not the raw heartbeat-bound default either)',
  /nextWakeAbs\(currentGameState, \{ includeHeartbeat: false \}\)/.test(timeSrc) && /nowAbsAtCompute \+ TIME_DILATION\.simCheckpointMinutes/.test(timeSrc));

// ----------------------------------------------------------------
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
