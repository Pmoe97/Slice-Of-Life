// continuous-cadence-closure-plan.md — Phase 4: Continuous wander movement
// (D5).
//
//   node src/src/dev/verify/verify-ccc-p4.js
//
// Pass 1's wander branch (no active commitment) used to step the NPC one
// ROOM per TICK via npc.transit — a flat 30 minutes per hop regardless of
// actual distance, so a 3-room wander took a flat 90 minutes and a same-
// room wander took a flat 30. This phase replaces that stepping with the
// same npc.walk/planWalk continuous system committed movement already uses:
// a wander plans a real distance-based walk to the target room's centroid,
// and settleWalks (movement.js, already called at the top of every
// resolveTick) lands or proportionally advances it exactly like a committed
// walk. npc.transit is retired for this case, not generalized (D5).
//
// Every check below stubs out evaluateDrives (pass 3) to a neutral no-op.
// Pass 3's evaluateDrives independently opens SOME commitment for almost
// every due, uncommitted npc-tick (empirically: every seed/resident tried
// while drafting this harness) — that is real, correct, pre-existing
// behaviour (D2: a commitment legitimately overrides the schedule), not
// something this phase touches or should suppress in the real game. But it
// means a "pure wander that nothing else touches this same tick" is not a
// naturally occurring state to sample for — the only way to isolate pass
// 1's own movement mechanism (this phase's actual subject) is to neutralize
// pass 3 for the duration of these checks.
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
  // A seeded house on the 'standard' schedule template, clock parked at
  // 10:00 (600) on a weekday. standard.weekday.midday is [600,960) and
  // 'standard' has no work/commute blocks at all, so every resident falls
  // straight through pass 1's wander (else) branch with nothing to
  // interrupt it: no commitment, no follow, no world-commitment room.
  __house = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    h.meta = { seed: h.seed, clock: { day: 2, minutes: 600 }, contentConfig: null, sessionLog: [] };
    for (const npc of Object.values(h.npcs)) {
      npc.bible = npc.bible || {};
      npc.bible.scheduleTemplate = 'standard';
      delete npc.commitment;
      delete npc.follow;
      npc.walk = null;
      npc.transit = null;
    }
    return h;
  };
  __ids = (h) => Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  // Isolates pass 1's own movement mechanism from pass 3's independent
  // (and, per the header above, near-certain) drive-commitment decisions —
  // see the file header for why this is necessary rather than incidental.
  __realEvaluateDrives = evaluateDrives;
  __neutralDriveResult = () => ({
    activityOverride: null, locationOverride: null, updatedNpc: {},
    clothingState: null, pairState: null, events: [], imMessages: [],
    relDeltas: [], factTransfers: [], wrongedNpcs: null, peepResults: [],
  });
  __withNoDrives = (fn) => {
    evaluateDrives = () => __neutralDriveResult();
    try { return fn(); } finally { evaluateDrives = __realEvaluateDrives; }
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration + fixture sanity');
const fixture = J(`(() => {
  const h = __house(20260902);
  return {
    hasResolveTick: typeof resolveTick === 'function',
    hasPlanWalk: typeof planWalk === 'function',
    hasWalkDestRoom: typeof walkDestRoom === 'function',
    residentCount: __ids(h).length,
    tickMinutes: CLOCK.tickMinutes,
  };
})()`);
check('resolveTick is a real function', fixture.hasResolveTick);
check('planWalk is a real function (movement.js loaded)', fixture.hasPlanWalk);
check('walkDestRoom is a real function (cognition.js loaded)', fixture.hasWalkDestRoom);
check('fixture house has residents', fixture.residentCount > 0, JSON.stringify(fixture));
check('CLOCK.tickMinutes is 30 (this harness assumes it)', fixture.tickMinutes === 30, JSON.stringify(fixture));

// ---------------------------------------------------------------- 1
console.log('\n1. A genuine wander plants npc.walk (continuous, distance-based) — never npc.transit');
const wander = J(`__withNoDrives(() => {
  for (const seed of [20260902, 20260903, 20260904, 20260905, 20260906]) {
    const h = __house(seed);
    const ids = __ids(h);
    const startSnapshot = {};
    for (const id of ids) startSnapshot[id] = { location: h.npcs[id].location, pos: h.npcs[id].pos ?? null };
    const r = resolveBatch(h, 1, {});
    const state = r.state;
    for (const id of ids) {
      const npc = state.npcs[id];
      if (npc.walk) {
        return {
          found: true,
          id, seed,
          start: startSnapshot[id],
          walk: npc.walk,
          transit: npc.transit,
          location: npc.location,
          activity: npc.activity,
          destRoomId: walkDestRoom(npc),
          tickMinutes: CLOCK.tickMinutes,
        };
      }
    }
  }
  return { found: false };
})`);
check('at least one resident planted a wander walk within one tick', wander.found, JSON.stringify(wander));
if (wander.found) {
  check('npc.transit stays null — the old one-room-per-tick stepping is retired',
    wander.transit == null, JSON.stringify(wander));
  check('npc.walk carries the real record shape (path/totalUnits/speed/startedAtAbs/completesAtAbs)',
    !!wander.walk && Array.isArray(wander.walk.path) && typeof wander.walk.totalUnits === 'number'
      && typeof wander.walk.speed === 'number' && typeof wander.walk.startedAtAbs === 'number'
      && typeof wander.walk.completesAtAbs === 'number',
    JSON.stringify(wander.walk));
  const durationMinutes = wander.walk.completesAtAbs - wander.walk.startedAtAbs;
  check('walk duration is strictly less than one flat tick (30 min) — not the old one-room-per-tick jump',
    durationMinutes < wander.tickMinutes, `duration=${durationMinutes}min`);
  check('walk duration is positive (a real walk was planned, not a no-op)',
    durationMinutes > 0, `duration=${durationMinutes}min`);
  check('the destination differs from the start room (this really is a cross-room wander)',
    wander.destRoomId && wander.destRoomId !== wander.start.location, JSON.stringify(wander));
  check(`activity label reads "heading to ..." while still mid-walk`,
    typeof wander.activity === 'string' && wander.activity.indexOf('heading to') === 0, JSON.stringify(wander));
}

// ---------------------------------------------------------------- 2
console.log('\n2. The duration matches planWalk\'s own formula exactly (real distance math, not a guess)');
if (wander.found) {
  const recompute = J(`(() => {
    const h = __house(${wander.seed});
    const npc = h.npcs['${wander.id}'];
    npc.location = ${JSON.stringify(wander.start.location)};
    npc.pos = ${JSON.stringify(wander.start.pos)};
    const [cx, cy] = roomCentre('${wander.destRoomId}');
    const planned = planWalk(h, npc, npc.location, { roomId: '${wander.destRoomId}', point: { x: cx, y: cy } });
    return planned ? { seconds: planned.completesAtAbs * 60 - planned.startedAtAbs * 60, totalUnits: planned.totalUnits } : null;
  })()`);
  check('planWalk, replayed with the same start/destination, is plannable',
    !!recompute, JSON.stringify({ wander, recompute }));
  if (recompute) {
    const actualSeconds = (wander.walk.completesAtAbs - wander.walk.startedAtAbs) * 60;
    check('the actual walk duration equals planWalk\'s formula for this exact start/destination pair (within float epsilon)',
      Math.abs(actualSeconds - recompute.seconds) < 1e-6,
      `actual=${actualSeconds}s recomputed=${recompute.seconds}s`);
  }
}

// ---------------------------------------------------------------- 3
console.log('\n3. An in-flight walk is NOT re-rolled every tick — it keeps heading to the same destination');
const midflight = J(`__withNoDrives(() => {
  const h = __house(20260902);
  const ids = __ids(h);
  const id = ids[0];
  const npc = h.npcs[id];
  const startRoom = npc.location;
  // Manually plant a walk whose completion is well past one tick away (60
  // minutes), so settleWalks (top of the next resolveTick) does NOT land it
  // — this isolates pass 1's "npc.walk truthy -> keep heading there, don't
  // re-plan" branch from the far more common "already landed" case section
  // 1 above exercises.
  const otherRoom = Object.keys(ROOMS).find(r => r !== startRoom && ROOMS[r].type === 'common');
  const [cx, cy] = roomCentre(otherRoom);
  const planned = planWalk(h, npc, startRoom, { roomId: otherRoom, point: { x: cx, y: cy } });
  const nowAbs = clockToAbsolute(h.meta.clock);
  planned.startedAtAbs = nowAbs;
  planned.completesAtAbs = nowAbs + 60;
  planned.coveredUnits = 0;
  npc.walk = planned;
  npc.pos = { ...planned.path[0] };
  const pathBefore = JSON.stringify(planned.path);
  const totalUnitsBefore = planned.totalUnits;
  const r = resolveBatch(h, 1, {});
  const after = r.state.npcs[id];
  return {
    otherRoom,
    stillWalking: !!after.walk,
    pathUnchanged: after.walk ? JSON.stringify(after.walk.path) === pathBefore : false,
    totalUnitsUnchanged: after.walk ? after.walk.totalUnits === totalUnitsBefore : false,
    destRoomId: after.walk ? walkDestRoom(after) : null,
    activity: after.activity,
    transit: after.transit,
  };
})`);
check('the walk is still in flight after one tick (it was deliberately planned to outlast it)', midflight.stillWalking, JSON.stringify(midflight));
check('the SAME path survives — pass 1 did not re-plan a fresh route this tick', midflight.pathUnchanged, JSON.stringify(midflight));
check('totalUnits is unchanged — confirms no re-plan, not just a coincidentally-similar one', midflight.totalUnitsUnchanged, JSON.stringify(midflight));
check('the destination room is still the one originally planted', midflight.destRoomId === midflight.otherRoom, JSON.stringify(midflight));
check('activity keeps reading "heading to ..." for the SAME destination', midflight.activity && midflight.activity.indexOf('heading to') === 0, JSON.stringify(midflight));
check('npc.transit never gets set as a side effect of any of this', midflight.transit == null, JSON.stringify(midflight));

// ---------------------------------------------------------------- 4
console.log('\n4. Round-trip correctness: two ticks land the NPC at the walk\'s own destination room (Design Invariant 1 — same eventual outcome)');
if (wander.found) {
  const roundTrip = J(`__withNoDrives(() => {
    const h = __house(${wander.seed});
    const r1 = resolveBatch(h, 1, {});
    const npc1 = r1.state.npcs['${wander.id}'];
    const dest = walkDestRoom(npc1);
    const r2 = resolveBatch(r1.state, 1, {});
    const npc2 = r2.state.npcs['${wander.id}'];
    return { dest, finalLocation: npc2.location, walkLanded: npc2.walk === null || npc2.walk === undefined };
  })`);
  check('the walk fully lands (npc.walk clears) well within the second tick — any wander is far shorter than 30 minutes on this floor plan',
    roundTrip.walkLanded, JSON.stringify(roundTrip));
  check('the NPC ends up exactly in the room the walk was heading to',
    roundTrip.finalLocation === roundTrip.dest, JSON.stringify(roundTrip));
}

// ---------------------------------------------------------------- 5
console.log('\n5. openCommitment clears a stray in-flight wander walk when it plans no walk of its own (D5 blast radius: npc.walk is no longer commitment-exclusive)');
// Before this phase, npc.walk was written ONLY by commitment-opening code,
// so a fresh commitment finding nothing of its own to walk (already at the
// anchor) safely found npc.walk already null. Now pass 1's wander can leave
// npc.walk set for an UNCOMMITTED npc — so openCommitment (cognition.js)
// must clear any such leftover itself when it does not plan a fresh walk,
// or an "arrived: true" commitment would carry a walk toward the old wander
// target right behind it. Exercises openCommitment directly (not through
// evaluateDrives) for a deterministic, seed-independent case.
const staleWalkCleared = J(`(() => {
  const h = __house(20260902);
  const ids = __ids(h);
  const id = ids[0];
  const npc = h.npcs[id];
  const startRoom = npc.location;
  const wanderTarget = Object.keys(ROOMS).find(r => r !== startRoom && ROOMS[r].type === 'common');
  const [wx, wy] = roomCentre(wanderTarget);
  const wanderWalk = planWalk(h, npc, startRoom, { roomId: wanderTarget, point: { x: wx, y: wy } });
  npc.walk = wanderWalk;
  npc.pos = { ...wanderWalk.path[0] };
  // Now open a commitment anchored exactly where the NPC already stands, so
  // planWalk (inside openCommitment) returns null (dist < arriveEpsilon) —
  // this commitment plans no walk of its own.
  const [cx, cy] = roomCentre(startRoom);
  npc.pos = { x: cx, y: cy };
  const commitment = openCommitment(h, id, { driveId: 'verify_p4_stub', roomId: startRoom });
  return { committed: !!commitment, arrived: commitment ? commitment.arrived : null, walkAfter: npc.walk };
})()`);
check('openCommitment actually opened (fixture sanity)', staleWalkCleared.committed, JSON.stringify(staleWalkCleared));
check('the commitment is marked arrived (no walk of its own — already at the anchor)',
  staleWalkCleared.arrived === true, JSON.stringify(staleWalkCleared));
check('the stray wander walk is cleared, not left dangling behind an "arrived" commitment',
  staleWalkCleared.walkAfter === null || staleWalkCleared.walkAfter === undefined, JSON.stringify(staleWalkCleared));

// ---------------------------------------------------------------- 6
console.log('\n6. Wiring: the old npc.transit.progress stepping is gone from sim.js\'s source, planWalk is really called from pass 1');
const fs = require('fs');
const simSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'sim.js'), 'utf8');
check('sim.js no longer references npc.transit.progress (the retired per-tick stepper)',
  !simSrc.includes('npc.transit.progress'));
check('sim.js\'s pass 1 calls planWalk directly (the D5 wiring)',
  /planWalk\(gameState, npc, npc\.location/.test(simSrc));
check('sim.js\'s pass 1 reads walkDestRoom for the "heading to" label',
  /walkDestRoom\(npc\)/.test(simSrc));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
