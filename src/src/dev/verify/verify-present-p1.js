// NPC avatar liveliness — Phase 1: presentation-position layer (D1–D8, D18).
//
//   node src/src/dev/verify/verify-present-p1.js
//
// The plan's Phase 1 Verification, translated into checks against the real
// engine (config.js/movement.js/world.js/time.js + movement.present.js's pure
// core — presentStepAvatar / beginPresentCatch / replanPresentPath / the
// path+catch helpers). The DOM half of the phase (presentFrame's attribute
// writes, the D18 overlay, the D23 rAF loop) cannot run in the bare vm — it
// is live-verified on the page instead (browser_eval): the "marker never
// jumps / sim state untouched" assertions, the paused-clock catch-up, the
// frame-rate-invariance samples and the dotted-path vision check.
//
//   1. D4 TRACK: a live walk record with a small game-time gap tracks the sim
//      directly (rec.x = sim.x, no catch), and classification is by CAUSE +
//      time-gap — never by per-frame distance: a huge sim jump inside one
//      small-gap frame is still a track, not a catch-up restart.
//   2. D22 catch-along-path: the same walk record with a batch-sized gap
//      catches up ALONG the walk's OWN path (invariant 8 — the dotted line
//      stays the literal walked path), moving through intermediate positions
//      on the path, completing exactly at the sim position.
//   3. D23 regression: a catch-up in flight while the clock is PAUSED (the
//      action-outcome window) keeps interpolating to its destination — the
//      mid-catch branch sits ABOVE the TRACK branch so a paused-clock gap of
//      0 (indistinguishable from a live rAF) can never abort it and snap.
//   4. Issue A replay: a walk we were tracking that a settleWalks batch
//      completed replays along the SAVED path to its end.
//   5. Generic catch-up re-plans through the door midpoints the sim itself
//      uses (findPath / sharedWallSegment), and its duration is floored /
//      capped (D5): shortHopSec for a no-door hop, floorSec for a fast-
//      dilation snap, capSec for a slow-dilation walk.
//   6. D6: a catch-up whose game-time gap exceeds teleportAfterGameMinutes
//      fade-teleports (no animated catch) and clears its blink afterwards.
//   7. D7: reduced motion teleports every catch — the generic one and a live
//      walk alike.
//   8. D18: the player's own catch draws NO route path (rec.path stays null).
//   9. Invariant 1: presentStepAvatar never writes npc.pos / npc.location /
//      npc.walk / commitment.arrived — a full state-machine walk across
//      regimes leaves the sim byte-identical.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'movement.js', 'time.js', 'movement.present.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260828, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __centre = (r) => { const [cx, cy] = roomCentre(r); return { x: cx, y: cy }; };
  __npc = (g) => g.npcs[__ids(g)[0]];
  __ctx = (npc, o) => Object.assign({
    isPlayer: false, npc, nowAbs: 0, scale: 20, reduced: false, tier: 'npc',
    liveGap: PRESENT.liveGapGameSeconds, floorSec: PRESENT.floorSec,
    capSec: PRESENT.capSec, shortHopSec: PRESENT.shortHopSec,
    teleportAfterGameMinutes: PRESENT.teleportAfterGameMinutes,
    fadeMs: PRESENT.fadeMs, teleportMs: PRESENT.teleportMs,
  }, o || {});

  __trackTest = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    w.coveredUnits = 0.4 * w.totalUnits;               // mid-walk, in progress
    const nowAbs = clockToAbsolute(g.meta.clock) + 0.1;
    const simPt = pointAlongPath(w.path, w.coveredUnits);
    const sim = { x: simPt.x, y: simPt.y, offMap: false };
    const rec = freshPresentRec(nowAbs - 0.3 / 60);    // 0.3 game-sec gap (idle 20x @ 60fps)
    rec.visible = true; rec.x = w.path[0].x; rec.y = w.path[0].y; rec.lastSimAbs = nowAbs - 0.3 / 60;
    const ctx = __ctx(npc, { nowAbs, scale: 20 });
    const d = presentStepAvatar(rec, sim, ctx, 1000);
    const tracked = Math.abs(rec.x - sim.x) < 1e-9 && Math.abs(rec.y - sim.y) < 1e-9;
    const noCatch = rec.catch === null;
    const transit = d.transit === true;
    const active = rec.pathState === 'active';
    // frame-rate invariance: a 300+ unit sim delta inside ONE small-gap frame
    // is still a track — classification is cause + time-gap, never distance.
    const farSim = { x: sim.x + 300, y: sim.y + 300, offMap: false };
    const d2 = presentStepAvatar(rec, farSim, __ctx(npc, { nowAbs, scale: 20 }), 1016);
    const stillTrack = rec.catch === null && Math.abs(rec.x - farSim.x) < 1e-9;
    return { tracked, noCatch, transit, active, stillTrack };
  };

  __d22Catch = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'gym', point: __centre('gym') });
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    w.coveredUnits = 0.2 * w.totalUnits;
    const nowAbs = clockToAbsolute(g.meta.clock) + 0.1;
    const targetCovered = 0.6 * w.totalUnits;          // batch (settleWalks D22) jumped it to 60%
    const simPt = pointAlongPath(w.path, targetCovered);
    const sim = { x: simPt.x, y: simPt.y, offMap: false };
    const rec = freshPresentRec(nowAbs - 5 / 60);      // 5 game-sec gap → batch, not live
    rec.visible = true; rec.x = w.path[0].x; rec.y = w.path[0].y; rec.lastSimAbs = nowAbs - 5 / 60;
    const ctx = __ctx(npc, { nowAbs, scale: 20 });
    const d0 = presentStepAvatar(rec, sim, ctx, 0);
    const startedCatch = !!rec.catch;
    const samePath = !!rec.catch && rec.catch.path === w.path;   // invariant 8
    const pathActive = rec.pathState === 'active';
    const c0 = rec.catch;
    const d1 = presentStepAvatar(rec, sim, ctx, c0.dur * 500);   // halfway through the catch
    const mid = { x: rec.x, y: rec.y };
    const expCovered = c0.coveredStart + (c0.coveredEnd - c0.coveredStart) * 0.5;
    const expPt = pointAlongPath(c0.path, expCovered);
    const onPath = Math.hypot(mid.x - expPt.x, mid.y - expPt.y) < 0.5;
    const notAtStart = Math.hypot(mid.x - w.path[0].x, mid.y - w.path[0].y) > 1;
    const notAtEnd = Math.hypot(mid.x - sim.x, mid.y - sim.y) > 1;
    const d2 = presentStepAvatar(rec, sim, ctx, c0.dur * 1000 + 1);
    const completed = !rec.catch && Math.abs(rec.x - sim.x) < 1e-9;
    return { startedCatch, samePath, pathActive, onPath, notAtStart, notAtEnd, completed };
  };

  __d23Pause = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'gym', point: __centre('gym') });
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    w.coveredUnits = 0.2 * w.totalUnits;
    const nowAbs = clockToAbsolute(g.meta.clock) + 0.1;
    const simPt = pointAlongPath(w.path, 0.6 * w.totalUnits);
    const sim = { x: simPt.x, y: simPt.y, offMap: false };
    const rec = freshPresentRec(nowAbs - 5 / 60);
    rec.visible = true; rec.x = w.path[0].x; rec.y = w.path[0].y; rec.lastSimAbs = nowAbs - 5 / 60;
    const ctx = __ctx(npc, { nowAbs, scale: 20 });
    presentStepAvatar(rec, sim, ctx, 0);               // catch starts (batch gap)
    const c = rec.catch;
    // Clock PAUSED (action-outcome window open): nowAbs frozen, so every
    // subsequent frame reads a game-time gap of 0 — exactly like a live rAF.
    // The mid-catch branch must win over TRACK or the marker snaps to sim.
    let minDistToSim = Infinity, frames = 0;
    for (let f = 1; f <= 12; f++) {
      const nowMs = c.dur * 1000 * (f / 12);
      presentStepAvatar(rec, sim, ctx, nowMs);
      if (!rec.catch) break;
      frames++;
      minDistToSim = Math.min(minDistToSim, Math.hypot(rec.x - sim.x, rec.y - sim.y));
    }
    const keptMoving = frames >= 6 && minDistToSim > 0.5;   // never snapped to sim
    presentStepAvatar(rec, sim, ctx, c.dur * 1000 + 1);
    const finishedByEnd = !rec.catch && Math.abs(rec.x - sim.x) < 1e-9;
    return { keptMoving, finishedByEnd, frames };
  };

  __snapReplay = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    const nowAbs = clockToAbsolute(g.meta.clock) + 0.1;
    const end = w.path[w.path.length - 1];
    const rec = freshPresentRec(nowAbs);
    rec.visible = true;
    const half = pointAlongPath(w.path, 0.5 * w.totalUnits);
    rec.x = half.x; rec.y = half.y; rec.lastSimAbs = nowAbs;
    rec.wasTracking = true; rec.lastWalkPath = w.path;
    rec.lastWalkSeconds = (w.completesAtAbs - w.startedAtAbs) * 60;
    const sim = { x: end.x, y: end.y, offMap: false }; // settleWalks landed it at the end
    const ctx = __ctx(npc, { nowAbs, scale: 20 });
    const d0 = presentStepAvatar(rec, sim, ctx, 0);
    const replayed = !!rec.catch && rec.catch.path === w.path;
    const toEnd = !!rec.catch && Math.abs(rec.catch.coveredEnd - totalPathUnits(w.path)) < 1e-6;
    const c = rec.catch;
    presentStepAvatar(rec, sim, ctx, c.dur * 500);
    const mid = { x: rec.x, y: rec.y };
    const exp = pointAlongPath(c.path, c.coveredStart + (c.coveredEnd - c.coveredStart) * 0.5);
    const onPath = Math.hypot(mid.x - exp.x, mid.y - exp.y) < 0.5;
    const between = Math.hypot(mid.x - w.path[0].x, mid.y - w.path[0].y) > 1 &&
                    Math.hypot(mid.x - sim.x, mid.y - sim.y) > 1;
    return { replayed, toEnd, onPath, between };
  };

  __genericCatch = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'kitchen';
    const from = __centre('bedroom_1');
    const to = __centre('gym');
    const rec = freshPresentRec(0);
    rec.visible = true; rec.x = from.x; rec.y = from.y; rec.lastSimAbs = 0;
    const sim = { x: to.x, y: to.y, offMap: false };
    const ctx = __ctx(npc, { nowAbs: 0.05, scale: 20 });   // 3 game-sec gap
    const d = presentStepAvatar(rec, sim, ctx, 0);
    const startedCatch = !!rec.catch;
    const route = findPath('bedroom_1', 'gym');
    let hasDoors = !!rec.catch && route && route.length >= 2;
    if (rec.catch && route) {
      for (let i = 0; i < route.length - 1; i++) {
        const seg = sharedWallSegment(route[i], route[i + 1]);
        const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
        if (!rec.catch.path.some(p => Math.hypot(p.x - mid.x, p.y - mid.y) < 1)) hasDoors = false;
      }
    }
    const dur = rec.catch ? rec.catch.dur : -1;
    const durInRange = dur >= ctx.floorSec - 1e-9 && dur <= ctx.capSec + 1e-9;
    return { startedCatch, hasDoors, dur, durInRange };
  };

  __teleportGate = () => {
    const g = __mk();
    const npc = __npc(g);
    const rec = freshPresentRec(0);
    rec.visible = true; rec.x = 0; rec.y = 0; rec.lastSimAbs = 0;
    const sim = { x: 500, y: 400, offMap: false };
    const ctx = __ctx(npc, { nowAbs: 30, scale: 20 });     // 30 game-min gap > 20 gate
    const start = presentStepAvatar(rec, sim, ctx, 0);
    const teleported = rec.tele !== null && rec.catch === null;
    const atSim = Math.abs(rec.x - sim.x) < 1e-9 && Math.abs(rec.y - sim.y) < 1e-9;
    const mid = presentStepAvatar(rec, sim, ctx, PRESENT.teleportMs * 0.5);
    const dimmed = mid.inlineOpacity != null && mid.inlineOpacity < 0.6;
    presentStepAvatar(rec, sim, ctx, PRESENT.teleportMs + 1);
    const cleared = rec.tele === null;
    return { teleported, atSim, dimmed, cleared };
  };

  __reduced = () => {
    const g = __mk();
    const npc = __npc(g);
    const rec = freshPresentRec(0);
    rec.visible = true; rec.x = 0; rec.y = 0; rec.lastSimAbs = 0;
    const sim = { x: 300, y: 200, offMap: false };
    const ctx = __ctx(npc, { nowAbs: 0.05, scale: 20, reduced: true });
    presentStepAvatar(rec, sim, ctx, 0);
    const generic = rec.tele !== null && rec.catch === null && Math.abs(rec.x - sim.x) < 1e-9;
    // a live walk under reduced motion → teleport too, no dotted path
    const npc2 = __npc(g);
    npc2.pos = null; npc2.location = 'bedroom_1';
    const w = planWalk(g, npc2, 'bedroom_1', { roomId: 'laundry', point: __centre('laundry') });
    npc2.walk = w; npc2.pos = { x: w.path[0].x, y: w.path[0].y };
    w.coveredUnits = 0.5 * w.totalUnits;
    const rec2 = freshPresentRec(0);
    rec2.visible = true; rec2.x = w.path[0].x; rec2.y = w.path[0].y; rec2.lastSimAbs = 0;
    const sim2 = pointAlongPath(w.path, w.coveredUnits);
    presentStepAvatar(rec2, { x: sim2.x, y: sim2.y, offMap: false },
      __ctx(npc2, { nowAbs: 0.05, scale: 20, reduced: true }), 0);
    const liveWalk = rec2.tele !== null && rec2.catch === null && rec2.path === null;
    return { generic, liveWalk };
  };

  __playerNoLine = () => {
    const g = __mk();
    const rec = freshPresentRec(0);
    const from = __centre('bedroom_1');
    rec.visible = true; rec.x = from.x; rec.y = from.y; rec.lastSimAbs = 0;
    const to = __centre('gym');
    const ctx = __ctx(null, { isPlayer: true, nowAbs: 0.05, scale: 20, tier: 'player' });
    const d = presentStepAvatar(rec, { x: to.x, y: to.y, offMap: false }, ctx, 0);
    return { caught: !!rec.catch, noLine: rec.path === null && rec.pathState === 'off' };
  };

  __noWrite = () => {
    const g = __mk();
    const npc = __npc(g);
    npc.pos = null; npc.location = 'bedroom_1';
    const w = planWalk(g, npc, 'bedroom_1', { roomId: 'gym', point: __centre('gym') });
    npc.walk = w; npc.pos = { x: w.path[0].x, y: w.path[0].y };
    w.coveredUnits = 0.3 * w.totalUnits;
    // Snapshot AFTER the harness's own setup (npc.walk/npc.pos are the test's
    // doing, not the presentation layer's): the invariant is that
    // presentStepAvatar never WRITES these — with the walk mid-flight,
    // before and after must be byte-identical.
    const before = JSON.stringify({ pos: npc.pos, location: npc.location, walk: npc.walk,
                                   arrived: npc.commitment && npc.commitment.arrived });
    const nowAbs = clockToAbsolute(g.meta.clock) + 0.1;
    const simPt = pointAlongPath(w.path, 0.7 * w.totalUnits);
    const sim = { x: simPt.x, y: simPt.y, offMap: false };
    const rec = freshPresentRec(nowAbs - 5 / 60);
    rec.visible = true; rec.x = w.path[0].x; rec.y = w.path[0].y; rec.lastSimAbs = nowAbs - 5 / 60;
    const ctx = __ctx(npc, { nowAbs, scale: 20 });
    for (const nowMs of [0, 300, 700, 1200, 2000, 3500]) presentStepAvatar(rec, sim, ctx, nowMs);
    const after = JSON.stringify({ pos: npc.pos, location: npc.location, walk: npc.walk,
                                   arrived: npc.commitment && npc.commitment.arrived });
    return { unchanged: before === after };
  };

  __durations = () => {
    const base = { tier: 'npc', floorSec: PRESENT.floorSec, capSec: PRESENT.capSec, shortHopSec: PRESENT.shortHopSec };
    const r1 = freshPresentRec(0);
    const p1 = [{ x: 0, y: 0 }, { x: 30, y: 0 }];          // no door crossing
    beginPresentCatch(r1, { x: 30, y: 0 }, p1, 30, 0, Object.assign({}, base, { scale: 20 }), 0);
    const sameRoom = r1.catch.dur;
    const r2 = freshPresentRec(0);
    const p2 = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }];  // 1 transition
    beginPresentCatch(r2, { x: 80, y: 0 }, p2, 80, 10, Object.assign({}, base, { scale: 20 }), 0);
    const fast = r2.catch.dur;                             // 10s hop at idle 20x
    const r3 = freshPresentRec(0);
    beginPresentCatch(r3, { x: 80, y: 0 }, p2, 80, 10, Object.assign({}, base, { scale: 1 }), 0);
    const slow = r3.catch.dur;                             // 10s hop at conversation 1x
    return { sameRoom, fast, slow, shortHop: PRESENT.shortHopSec, floor: PRESENT.floorSec, cap: PRESENT.capSec };
  };

  __replanDoors = () => {
    const route = findPath('bedroom_1', 'gym');
    const from = __centre('bedroom_1');
    const to = __centre('gym');
    const path = replanPresentPath(from, to);
    let ok = route && path.length >= route.length;
    if (route) {
      for (let i = 0; i < route.length - 1 && ok; i++) {
        const seg = sharedWallSegment(route[i], route[i + 1]);
        const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
        if (!path.some(p => Math.hypot(p.x - mid.x, p.y - mid.y) < 0.5)) ok = false;
      }
    }
    const startOk = Math.hypot(path[0].x - from.x, path[0].y - from.y) < 0.5;
    const endOk = Math.hypot(path[path.length - 1].x - to.x, path[path.length - 1].y - to.y) < 0.5;
    return { ok, startOk, endOk };
  };
`);

console.log('\n1. D4 — a live walk tracks the sim directly, by cause not distance');
const tr = api('__trackTest()');
check('live walk + small gap: marker follows the sim exactly, no catch', tr.tracked && tr.noCatch);
check('...reads as in transit, dotted line active', tr.transit && tr.active);
check('a 300-unit sim delta in one small-gap frame is still a track (frame-rate invariant)',
      tr.stillTrack, `catch=${tr.noCatch ? 'none' : 'started'}`);

console.log('\n2. D22 — a batch advance catches up ALONG the walk\'s own path');
const d22 = api('__d22Catch()');
check('walk record + batch gap starts a catch along the SAME path array (invariant 8)',
      d22.startedCatch && d22.samePath);
check('...path state is active', d22.pathActive);
check('half-way, the marker sits on the path between start and end', d22.onPath && d22.notAtStart && d22.notAtEnd);
check('...and completes exactly at the sim position', d22.completed);

console.log('\n3. D23 — a paused clock never aborts an in-flight catch-up');
const d23 = api('__d23Pause()');
check('mid-catch with a frozen clock keeps interpolating (no snap to sim)', d23.keptMoving,
      `frames=${d23.frames}`);
check('...and lands at the destination', d23.finishedByEnd);

console.log('\n4. Issue A — a settleWalks-completed walk replays along its saved path');
const rep = api('__snapReplay()');
check('tracked-then-landed walk replays along the SAVED path to its end', rep.replayed && rep.toEnd);
check('...through intermediate positions, between start and end', rep.onPath && rep.between);

console.log('\n5. Generic catch-up re-plans through door midpoints, floored/capped');
const gen = api('__genericCatch()');
check('a no-walk position change starts a catch', gen.startedCatch);
check('...through every door midpoint of the findPath route (bedroom_1→gym, 7 hops)', gen.hasDoors);
check(`...duration within [floor, cap] (got ${gen.dur.toFixed(2)}s)`, gen.durInRange);
const dur = api('__durations()');
check(`no-door hop uses shortHopSec (${dur.shortHop}s)`, Math.abs(dur.sameRoom - dur.shortHop) < 1e-9,
      `${dur.sameRoom.toFixed(3)}`);
check(`fast-dilation snap lifts to floorSec (${dur.floor}s)`, Math.abs(dur.fast - dur.floor) < 1e-9,
      `${dur.fast.toFixed(3)}`);
check(`slow-dilation walk caps at capSec (${dur.cap}s)`, Math.abs(dur.slow - dur.cap) < 1e-9,
      `${dur.slow.toFixed(3)}`);

console.log('\n6. D6 — a >20-game-min gap fade-teleports');
const tel = api('__teleportGate()');
check('30-game-min gap → teleport (no animated catch), marker at sim', tel.teleported && tel.atSim);
check('...mid-blink opacity dips, then the blink clears', tel.dimmed && tel.cleared);

console.log('\n7. D7 — reduced motion teleports every catch');
const red = api('__reduced()');
check('generic catch teleports', red.generic);
check('a live walk also teleports, and draws no dotted path', red.liveWalk);

console.log('\n8. D18 — the player\'s own catch draws no route path');
const pl = api('__playerNoLine()');
check('player catch animates but rec.path stays null', pl.caught && pl.noLine);

console.log('\n9. Invariant 1 — the presentation layer never writes sim state');
const nw = api('__noWrite()');
check('npc.pos/location/walk/commitment.arrived byte-identical after a state-machine walk', nw.unchanged);

console.log('\n10. The re-planner is the literal walked path (invariant 8)');
const rp = api('__replanDoors()');
check('replanPresentPath passes through every door midpoint, start→end', rp.ok && rp.startOk && rp.endOk);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
