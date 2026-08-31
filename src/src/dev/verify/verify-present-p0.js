// NPC avatar liveliness — Phase 0: walk-time tiers (D15/D19/D22).
//
//   node src/src/dev/verify/verify-present-p0.js
//
// The plan's Verification list, translated into checks against the real
// engine (config.js/movement.js/world.js/time.js/sim.js):
//
//   1. planWalk (NPC tier) returns the same seconds as walkSeconds(route,
//      'npc') for every authored room pair: 10s per transition + a
//      distance-derived in-room remainder (D15). walkSeconds(route,
//      'player') is the same remainder on a 3s/hop tier (D19).
//   2. A same-room walk across the living room's ~322-unit interior
//      diagonal takes ~28 game-sec = distance / WALK.unitsPerSecond — the
//      D15 regression guard: an in-room walk must NOT collapse to
//      minSeconds.
//   3. advanceFrameWalks at 1×: half the span covers exactly half the units
//      at exactly the half-way point on the path, and a full span (+1e-6
//      minutes) completes the walk at the anchor — no drift.
//   4. D22: a walk settled by a batch that does NOT reach completesAtAbs is
//      advanced proportionally (coveredUnits ≈ totalUnits × (nowAbs −
//      startedAtAbs)/span, pos on the path, not at either end, arrived
//      still false); continuing past completesAtAbs still lands it.
//   5. A pre-Phase-0 save (no startedAtAbs) keeps today's snap-only
//      behaviour, and a JSON save/load round-trip preserves startedAtAbs so
//      the proportional advance survives a reload.
//   6. C6: two identical-seed 96-tick settled runs are byte-identical.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'movement.js', 'time.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260814, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __centre = (r) => { const [cx, cy] = roomCentre(r); return { x: cx, y: cy }; };
  __wsecs = (w) => (w.completesAtAbs - w.startedAtAbs) * 60;

  __pairStats = () => {
    const g = __mk();
    const id = __ids(g)[0];
    let agree = 0; const bad = [], playerBad = [];
    for (const a of ALL_ROOMS) {
      for (const b of ALL_ROOMS) {
        if (a === b) continue;
        const route = findPath(a, b);
        if (!route || route.length < 2) continue;
        const transitions = route.length - 1;
        const npc = g.npcs[id];
        npc.pos = null; npc.location = a;
        const w = planWalk(g, npc, a, { roomId: b, point: __centre(b) });
        if (!w) { bad.push(a + '~' + b + ':null'); continue; }
        const wS = __wsecs(w);
        const ws = walkSeconds(route, 'npc');
        const wp = walkSeconds(route, 'player');
        if (Math.abs(wS - ws) > 1e-6 * Math.max(1, ws)) bad.push(a + '~' + b + ':' + wS.toFixed(3) + 'vs' + ws.toFixed(3));
        if (Math.abs(wp - (ws - 7 * transitions)) > 1e-6 * Math.max(1, ws)) playerBad.push(a + '~' + b);
        agree++;
      }
    }
    return { agree, bad: bad.slice(0, 5), playerBad: playerBad.slice(0, 5) };
  };

  __livingDiagonal = () => {
    const rects = ROOM_LAYOUT.living_room;
    const pts = [];
    for (const [x, y, w, h] of rects) {
      for (let gx = x + 2; gx <= x + w - 2; gx += 4) {
        for (let gy = y + 2; gy <= y + h - 2; gy += 4) {
          const p = { x: gx, y: gy };
          if (roomsContainingPoint(p).includes('living_room')) pts.push(p);
        }
      }
    }
    let best = 0, ba = null, bb = null;
    for (const a of pts) for (const b of pts) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > best) { best = d; ba = a; bb = b; }
    }
    const g = __mk();
    const npc = g.npcs[__ids(g)[0]];
    npc.pos = { x: ba.x, y: ba.y }; npc.location = 'living_room';
    const w = planWalk(g, npc, 'living_room', { roomId: 'living_room', point: { x: bb.x, y: bb.y } });
    return { dist: best, seconds: w ? __wsecs(w) : -1, min: WALK.minSeconds };
  };

  __frameIntegration = () => {
    const g = __mk();
    const npc = g.npcs[__ids(g)[0]];
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    const span = w.completesAtAbs - w.startedAtAbs;
    advanceFrameWalks(g, span * 0.5);
    const halfCovered = npc.walk ? npc.walk.coveredUnits : -1;
    const halfPos = npc.walk ? { x: npc.pos.x, y: npc.pos.y } : null;
    advanceFrameWalks(g, span * 0.5 + 1e-6);
    const done = npc.walk === null;
    const end = w.path[w.path.length - 1];
    const atEnd = done && Math.hypot(npc.pos.x - end.x, npc.pos.y - end.y) < 0.01;
    const ppHalf = pointAlongPath(w.path, w.totalUnits / 2);
    const onPathHalf = halfPos && Math.hypot(halfPos.x - ppHalf.x, halfPos.y - ppHalf.y) < 1e-6;
    return { halfCovered, totalUnits: w.totalUnits, done, atEnd, onPathHalf };
  };

  __d22Partial = () => {
    const g = __mk();
    const npc = g.npcs[__ids(g)[0]];
    npc.pos = null; npc.location = 'bedroom_1';
    const anchor = { roomId: 'laundry', point: __centre('laundry') };
    npc.commitment = { kind: 'activity', arrived: false, anchor };
    const w = planWalk(g, npc, 'bedroom_1', anchor);
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    const span = w.completesAtAbs - w.startedAtAbs;
    const mid = w.startedAtAbs + 0.4 * span;
    g.meta.clock = absoluteToClock(mid);
    settleWalks(g);
    const out = {
      walkStill: !!npc.walk,
      arrivedFalse: npc.commitment.arrived === false,
      covered: npc.walk ? npc.walk.coveredUnits : -1,
      total: w.totalUnits,
      pos: npc.pos ? { x: npc.pos.x, y: npc.pos.y } : null,
      path0: { x: w.path[0].x, y: w.path[0].y },
      pathN: { x: w.path[w.path.length - 1].x, y: w.path[w.path.length - 1].y },
    };
    g.meta.clock = absoluteToClock(mid + 0.4 * span + 0.3 * span);
    settleWalks(g);
    out.completedLate = npc.walk === null && npc.commitment.arrived === true;
    return out;
  };

  __legacyAndRoundTrip = () => {
    const g = __mk();
    const npc = g.npcs[__ids(g)[0]];
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    const span = w.completesAtAbs - w.startedAtAbs;
    const wl = JSON.parse(JSON.stringify(w));
    delete wl.startedAtAbs;
    npc.walk = wl; npc.pos = { x: wl.path[0].x, y: wl.path[0].y };
    g.meta.clock = absoluteToClock(wl.completesAtAbs - 0.3 * span);
    settleWalks(g);
    const legacyUntouched = !!npc.walk && npc.walk.coveredUnits === 0 &&
                            Math.hypot(npc.pos.x - wl.path[0].x, npc.pos.y - wl.path[0].y) < 1e-6;
    g.meta.clock = absoluteToClock(wl.completesAtAbs + 1);
    settleWalks(g);
    const legacySnapped = npc.walk === null;

    const g2 = __mk();
    const npc2 = g2.npcs[__ids(g2)[0]];
    npc2.pos = null; npc2.location = 'bedroom_1';
    const w2 = planWalk(g2, npc2, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    npc2.walk = w2; npc2.pos = { x: w2.path[0].x, y: w2.path[0].y };
    g2.meta.clock = absoluteToClock(w2.startedAtAbs + 0.25 * (w2.completesAtAbs - w2.startedAtAbs));
    const clone = JSON.parse(JSON.stringify(g2));
    settleWalks(clone);
    const rt = clone.npcs[__ids(clone)[0]];
    const rtOk = !!rt.walk && rt.walk.startedAtAbs === w2.startedAtAbs &&
                 Math.abs(rt.walk.coveredUnits - 0.25 * w2.totalUnits) < 1e-6 * w2.totalUnits;
    return { legacyUntouched, legacySnapped, rtOk };
  };

  __c6 = () => {
    const run = () => {
      let g = __mk(777001);
      const seq = [];
      for (let t = 0; t < 96; t++) {
        g = resolveBatch(g, 1).state;
        for (const [id, npc] of Object.entries(g.npcs)) {
          if (npc.commitment) {
            seq.push([id, npc.commitment.id, npc.commitment.startedAtAbs, npc.commitment.completesAtAbs,
                      npc.commitment.arrived, npc.commitment.anchor.roomId, npc.walk === null,
                      npc.pos && [Math.round(npc.pos.x * 100) / 100, Math.round(npc.pos.y * 100) / 100]]);
          }
        }
      }
      return JSON.stringify(seq);
    };
    const a = run(), b = run();
    return a === b;
  };
`);

console.log('\n1. planWalk and walkSeconds agree per tier (D15/D19)');
const pair = api('__pairStats()');
check('planWalk (NPC tier) seconds === walkSeconds(route,\'npc\') for every room pair',
      pair.bad.length === 0 && pair.agree === 342, `${pair.agree} pairs; ${pair.bad.join(', ')}`);
check('walkSeconds player tier = npc tier - 7s/hop, same remainder',
      pair.playerBad.length === 0, pair.playerBad.join(', '));

console.log('\n2. the in-room walk is distance-derived, not minSeconds (D15)');
const diag = api('__livingDiagonal()');
check('living-room interior diagonal ~322 units', Math.abs(diag.dist - 322) < 20, `${diag.dist.toFixed(1)} units`);
check('same-room walk across it takes ~28 game-sec = distance/11.5',
      diag.seconds > 20 && Math.abs(diag.seconds - diag.dist / 11.5) < 1e-6 * diag.dist,
      `seconds=${diag.seconds.toFixed(2)}, dist=${diag.dist.toFixed(1)}, minSeconds=${diag.min}`);

console.log('\n3. the live integrator lands without drift (D9, per-walk speed)');
const fi = api('__frameIntegration()');
check('half-span advance covers exactly half the units',
      Math.abs(fi.halfCovered - fi.totalUnits / 2) < 1e-6 * fi.totalUnits,
      `covered=${fi.halfCovered} total=${fi.totalUnits}`);
check('...with pos exactly at the half-way point on the path', fi.onPathHalf);
check('a full span (+1e-6 min) completes at the anchor', fi.done && fi.atEnd);

console.log('\n4. D22 — the batch regime advances incomplete walks proportionally');
const d22 = api('__d22Partial()');
check('a mid-span batch keeps the walk and arrived false',
      d22.walkStill && d22.arrivedFalse);
check('coveredUnits ≈ 40% of total at 40% through the span',
      Math.abs(d22.covered - 0.4 * d22.total) < 1e-6 * d22.total,
      `covered=${d22.covered.toFixed(2)} of ${d22.total.toFixed(2)}`);
const notAtEnds = d22.pos &&
  Math.hypot(d22.pos.x - d22.path0.x, d22.pos.y - d22.path0.y) > 1 &&
  Math.hypot(d22.pos.x - d22.pathN.x, d22.pos.y - d22.pathN.y) > 1;
check('...pos sits on the path, not at either end', notAtEnds,
      d22.pos ? JSON.stringify(d22.pos) : 'no pos');
check('...and continuing past completesAtAbs still lands it', d22.completedLate);

console.log('\n5. legacy saves and save/load round-trips');
const lr = api('__legacyAndRoundTrip()');
check('a pre-Phase-0 record (no startedAtAbs) is untouched mid-span, then snaps', lr.legacyUntouched && lr.legacySnapped);
check('JSON save/load round-trip preserves startedAtAbs + proportional advance', lr.rtOk);

console.log('\n6. C6 — the walk does not cost determinism');
check('two identical-seed 96-tick settled runs are byte-identical', api('__c6()'));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
