// NPC avatar liveliness — Phase 4: polish + full verification (pure half).
//
//   node src/src/dev/verify/verify-present-p4.js
//
// The plan's Phase 4 Verification, translated into checks that run without a
// DOM (the scenario matrix itself — idle snap-free walking, batch settle,
// reconcile teleport, player move, click-to-NPC catch-up, conversation
// departure, off-map work return, sleep fast-forward, reduced motion, and
// the two paused-clock scenarios — is verified LIVE on the page; the pure
// layer-2 math lives here). The four things this harness pins:
//
//   1. Save/load round-trip taken MID-WALK (D22): the walk record carries
//      startedAtAbs + speed through JSON, and settleWalks after restore
//      lands byte-identically to settling the pre-save original — a restored
//      game continues the proportional partial-advance, not a snap.
//   2. Pre-Phase-0 save compat: a walk record WITHOUT startedAtAbs keeps the
//      old behaviour exactly — untouched mid-span, snap at completion — and
//      JSON round-trip does not invent the field.
//   3. D23 paused-clock + mid-walk-save combo: with the clock frozen (the
//      action-outcome window / pause menu open), a restored mid-walk tracks
//      the sim exactly and deterministically (repeat frames, zero drift),
//      the presentation reads leave the sim byte-untouched (invariant 1),
//      and once the clock resumes the marker lands exactly at the walk's
//      final waypoint — never short, never past.
//   4. The D6 fade-teleport gate on a restored long-gap save: a clock that
//      jumped > teleportAfterGameMinutes since the marker's last frame
//      presents a blink at the sim position, never a walk replay, and the
//      blink clears after teleportMs.
//   5. Phase-4 finding (off-map fade-out): a sim.offMap NPC fades out ONCE —
//      opacity dips, then hidden, then STAYS hidden. The pre-fix code
//      cleared rec.fade at top-of-frame and re-created it at p=0 the same
//      frame, so rec.visible never reached false and the marker pulsed in
//      place forever (fade restarts = frame count). Regression-pinned here.
//      A third check pins the fade-IN half: the 'in' fade must clear once
//      p reaches 1 (no stale 'in' fade to corrupt the next transition), and
//      a return off-map after it must still fade out exactly once.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'sim.js', 'world.js',
             'movement.js', 'time.js', 'npc.js', 'movement.present.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260904, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __nowAbs = (g) => clockToAbsolute(g.meta.clock);
  // A committed cross-room walk, bedroom_1 → laundry, opened at 20:00
  // (day_shift's evening block — deriveHeldRecord cannot swallow it). The
  // walk carries startedAtAbs/speed/completesAtAbs exactly as a live one.
  __midwalk = (g, id) => {
    const n = g.npcs[id];
    g.meta.clock = absoluteToClock(20 * 60);
    n.bible = { ...n.bible, scheduleTemplate: 'day_shift' };
    n.location = 'bedroom_1';
    const [cx, cy] = roomCentre('bedroom_1');
    n.pos = { x: cx, y: cy };
    const [tx, ty] = roomCentre('laundry');
    const point = { x: tx, y: ty };
    n.commitment = { id: 'do_laundry', kind: 'drive', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 30, anchor: { roomId: 'laundry', objId: null, point },
      arrived: false, activity: 'doing laundry', score: 0.5, shouted: [] };
    n.walk = planWalk(g, n, 'bedroom_1', { roomId: 'laundry', point });
    return n;
  };
  __tierCtx = (npc, nowAbs) => ({
    isPlayer: false, npc, nowAbs, scale: 1, reduced: false, tier: 'npc',
    liveGap: PRESENT.liveGapGameSeconds, floorSec: PRESENT.floorSec,
    capSec: PRESENT.capSec, shortHopSec: PRESENT.shortHopSec,
    teleportAfterGameMinutes: PRESENT.teleportAfterGameMinutes,
    fadeMs: PRESENT.fadeMs, teleportMs: PRESENT.teleportMs,
  });
  __presentRec = (nowAbs, x, y) => {
    const rec = freshPresentRec(nowAbs);
    rec.x = x; rec.y = y; rec.visible = true;
    return rec;
  };
`);

console.log('\n1. D22 — a save taken MID-WALK round-trips losslessly');
check('walk carries startedAtAbs + speed + completesAtAbs through JSON.stringify → parse', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const w0 = g.npcs[id].walk;
    const saved = JSON.parse(JSON.stringify(g));
    const w1 = saved.npcs[id].walk;
    return typeof w0.startedAtAbs === 'number' && typeof w1.startedAtAbs === 'number'
      && w1.startedAtAbs === w0.startedAtAbs
      && typeof w1.speed === 'number' && w1.speed === w0.speed
      && typeof w1.completesAtAbs === 'number' && w1.completesAtAbs === w0.completesAtAbs
      && typeof w1.coveredUnits === 'number' && w1.coveredUnits === w0.coveredUnits;
  })()
`));
check('settleWalks after a mid-walk restore lands byte-identically to the original (proportional, not a snap)', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const w0 = g.npcs[id].walk;
    const restored = JSON.parse(JSON.stringify(g));
    const mid = w0.startedAtAbs + (w0.completesAtAbs - w0.startedAtAbs) / 2;
    g.meta.clock = absoluteToClock(mid);
    restored.meta.clock = absoluteToClock(mid);
    settleWalks(g); settleWalks(restored);
    const a = g.npcs[id], b = restored.npcs[id];
    return a.walk && b.walk
      && a.walk.coveredUnits === b.walk.coveredUnits
      && a.walk.coveredUnits > 0 && a.walk.coveredUnits < a.walk.totalUnits
      && a.pos.x === b.pos.x && a.pos.y === b.pos.y
      && a.commitment.arrived === false && b.commitment.arrived === false;
  })()
`));
check('settling to completion lands both at the exact final waypoint, arrived=true', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const w0 = g.npcs[id].walk;
    const restored = JSON.parse(JSON.stringify(g));
    const endAbs = w0.completesAtAbs + 1;
    g.meta.clock = absoluteToClock(endAbs);
    restored.meta.clock = absoluteToClock(endAbs);
    settleWalks(g); settleWalks(restored);
    const a = g.npcs[id], b = restored.npcs[id];
    const end = w0.path[w0.path.length - 1];
    return !a.walk && !b.walk
      && a.commitment.arrived === true && b.commitment.arrived === true
      && Math.hypot(a.pos.x - end.x, a.pos.y - end.y) < 0.01
      && a.pos.x === b.pos.x && a.pos.y === b.pos.y;
  })()
`));

console.log('\n2. Pre-Phase-0 save compat — a walk without startedAtAbs');
check('mid-span settle leaves the old walk untouched (frozen, at its start)', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    delete n.walk.startedAtAbs;                       // the pre-Phase-0 record
    const start = n.walk.path[0];
    g.meta.clock = absoluteToClock(n.walk.completesAtAbs - 1);   // inside the span
    settleWalks(g);
    return n.walk && n.walk.coveredUnits === 0
      && Math.hypot(n.pos.x - start.x, n.pos.y - start.y) < 0.01
      && n.commitment.arrived === false;
  })()
`));
check('past-completion settle snaps: walk null, arrived=true, pos at final waypoint', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    delete n.walk.startedAtAbs;
    const end = n.walk.path[n.walk.path.length - 1];
    g.meta.clock = absoluteToClock(n.walk.completesAtAbs + 1);
    settleWalks(g);
    return !n.walk && n.commitment.arrived === true
      && Math.hypot(n.pos.x - end.x, n.pos.y - end.y) < 0.01;
  })()
`));
check('JSON round-trip does not invent startedAtAbs for a pre-Phase-0 record', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    delete n.walk.startedAtAbs;
    const saved = JSON.parse(JSON.stringify(g));
    const w = saved.npcs[id].walk;
    return !('startedAtAbs' in w) && w.coveredUnits === 0 && w.speed === n.walk.speed;
  })()
`));

console.log('\n3. D23 — paused clock + a restored mid-walk save (action window / pause menu open)');
check('a restored mid-walk with a frozen clock tracks the sim exactly (marker == sim, zero drift across repeat frames)', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const restored = JSON.parse(JSON.stringify(g));   // the save we restored
    const n = restored.npcs[id];
    const nowAbs = __nowAbs(restored);
    const sim = { x: n.pos.x, y: n.pos.y, offMap: false };
    const rec = __presentRec(nowAbs, n.walk.path[0].x, n.walk.path[0].y);
    const d0 = presentStepAvatar(rec, sim, __tierCtx(n, nowAbs), 1000);
    const recBefore = JSON.stringify(rec);
    const d1 = presentStepAvatar(rec, sim, __tierCtx(n, nowAbs), 1000);  // identical frame
    return d0.x === sim.x && d0.y === sim.y && d0.hidden === false
      && d0.transit === true && d0.x === d1.x && d0.y === d1.y
      && JSON.stringify(rec) === recBefore;            // deterministic, no drift
  })()
`));
check('the presentation reads left the sim byte-untouched (invariant 1)', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const restored = JSON.parse(JSON.stringify(g));
    const n = restored.npcs[id];
    const nowAbs = __nowAbs(restored);
    const sim = { x: n.pos.x, y: n.pos.y, offMap: false };
    const rec = __presentRec(nowAbs, n.walk.path[0].x, n.walk.path[0].y);
    presentStepAvatar(rec, sim, __tierCtx(n, nowAbs), 1000);
    presentStepAvatar(rec, sim, __tierCtx(n, nowAbs), 1000);
    const fresh = JSON.parse(JSON.stringify(restored));
    return JSON.stringify(restored.npcs[id]) === JSON.stringify(fresh.npcs[id])
      && JSON.stringify(restored.meta) === JSON.stringify(fresh.meta)
      && n.walk.coveredUnits === fresh.npcs[id].walk.coveredUnits;
  })()
`));
check('once the clock resumes and the walk completes, the marker lands EXACTLY at the final waypoint', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const restored = JSON.parse(JSON.stringify(g));
    const n = restored.npcs[id];
    const w = n.walk;
    const end = w.path[w.path.length - 1];
    const nowAbs = __nowAbs(restored);
    const rec = __presentRec(nowAbs, w.path[0].x, w.path[0].y);
    // Clock resumes; the window's settle advances the walk to completion.
    restored.meta.clock = absoluteToClock(w.completesAtAbs + 1);
    settleWalks(restored);
    // The marker's next frame sees the landed sim — replay along the saved
    // path to its end (Issue-A catch), then land exactly on it.
    const sim = { x: n.pos.x, y: n.pos.y, offMap: false };
    const ctx = __tierCtx(n, __nowAbs(restored));
    let d = null, nowMs = 1000;
    for (let i = 0; i < 200; i++) {
      d = presentStepAvatar(rec, sim, ctx, nowMs);
      nowMs += 100;
      if (rec.catch === null && Math.hypot(rec.x - sim.x, rec.y - sim.y) < 0.01) break;
    }
    return d && Math.hypot(rec.x - sim.x, rec.y - sim.y) < 0.01
      && Math.hypot(rec.x - end.x, rec.y - end.y) < 0.01
      && !rec.catch;
  })()
`));

console.log('\n4. D6 — the fade-teleport gate on a restored LONG-GAP save (> teleportAfterGameMinutes)');
check('a >20-game-min gap after a mid-walk restore presents a teleport blink, never a walk replay', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const restored = JSON.parse(JSON.stringify(g));
    const n = restored.npcs[id];
    const nowAbs = __nowAbs(restored);
    const start = n.walk.path[0];
    const rec = __presentRec(nowAbs, start.x, start.y);
    // Off-map work / sleep: the clock jumps far past the walk's completion.
    restored.meta.clock = absoluteToClock(n.walk.completesAtAbs + 25);
    settleWalks(restored);
    const sim = { x: n.pos.x, y: n.pos.y, offMap: false };
    const ctx = __tierCtx(n, __nowAbs(restored));
    presentStepAvatar(rec, sim, ctx, 1000);           // starts the blink
    const d = presentStepAvatar(rec, sim, ctx, 1000 + ctx.teleportMs / 2);  // mid-window
    return d.x === sim.x && d.y === sim.y
      && rec.tele && rec.tele.t0 === 1000
      && d.inlineOpacity < 1 && d.transit === false
      && rec.catch === null && rec.pathState === 'off';
  })()
`));
check('the blink clears after teleportMs and the marker rests at the sim position', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const restored = JSON.parse(JSON.stringify(g));
    const n = restored.npcs[id];
    const nowAbs = __nowAbs(restored);
    const start = n.walk.path[0];
    const rec = __presentRec(nowAbs, start.x, start.y);
    restored.meta.clock = absoluteToClock(n.walk.completesAtAbs + 25);
    settleWalks(restored);
    const sim = { x: n.pos.x, y: n.pos.y, offMap: false };
    const ctx = __tierCtx(n, __nowAbs(restored));
    presentStepAvatar(rec, sim, ctx, 1000);           // starts the blink
    const d = presentStepAvatar(rec, sim, ctx, 1000 + ctx.teleportMs + 1);
    return rec.tele === null && d.inlineOpacity === 1
      && d.x === sim.x && d.y === sim.y && d.hidden === false;
  })()
`));

console.log('\n5. Phase-4 finding — an off-map NPC\'s fade-out COMPLETES (never restarts)');
check('off-map: the fade-out runs once, opacity dips, then the marker reaches hidden and STAYS hidden', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    const ctx = __tierCtx(n, __nowAbs(g));
    const rec = __presentRec(__nowAbs(g), 100, 100);
    const sim = { x: 100, y: 100, offMap: true };
    let everHidden = false, fadeRestarts = 0, opacityDipped = false, lastT0 = null;
    for (let i = 0; i < 16; i++) {
      const d = presentStepAvatar(rec, sim, ctx, i * 50);
      if (d.hidden) everHidden = true;
      if (d.inlineOpacity < 1) opacityDipped = true;
      if (rec.fade) {
        if (rec.fade.t0 !== lastT0) { fadeRestarts++; lastT0 = rec.fade.t0; }
      } else lastT0 = null;
    }
    const late = presentStepAvatar(rec, sim, ctx, 160 * 50);
    return everHidden && opacityDipped && fadeRestarts === 1
      && rec.visible === false && rec.fade === null && late.hidden === true && late.inlineOpacity === 0;
  })()
`));
check('off-map fade-out completes even with IRREGULAR frame timing (the expiry-frame restart bug)', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    const ctx = __tierCtx(n, __nowAbs(g));
    const rec = __presentRec(__nowAbs(g), 100, 100);
    const sim = { x: 100, y: 100, offMap: true };
    let everHidden = false;
    // Irregular gaps: 40ms x3, then a 700ms gap (a throttled frame), then 40ms x2.
    let t = 0;
    for (const gap of [40, 40, 40, 700, 40, 40]) {
      t += gap;
      const d = presentStepAvatar(rec, sim, ctx, t);
      if (d.hidden) everHidden = true;
    }
    return everHidden && rec.visible === false && rec.fade === null;
  })()
`));

check('on-map fade-in COMPLETES (no stale \'in\' fade left behind), then an off-map fade-out still runs cleanly once', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0]; __midwalk(g, id);
    const n = g.npcs[id];
    n.walk = null;                                     // keep the test on the fade path
    const ctx = __tierCtx(n, __nowAbs(g));
    const rec = __presentRec(__nowAbs(g), 100, 100);
    rec.visible = false;                               // start hidden, then return on-map
    const sim = { x: 100, y: 100, offMap: false };
    // Render 500ms of on-map frames: the 'in' fade must clear (top-of-frame
    // latch) — a stale 'in' fade is exactly what the pre-fix code left behind
    // (its self-clear only ran while !visible, so it never did).
    let t = 0, ramp = null;
    for (let i = 0; i < 10; i++) {
      t += 50;
      const d = presentStepAvatar(rec, sim, ctx, t);
      if (i === 3) ramp = d.inlineOpacity;   // mid-fade-in: the ramp must render, not flash
    }
    const staleIn = rec.fade;
    // Now go off-map: the stale fade (if any) must not suppress the fade-out.
    const off = { x: 100, y: 100, offMap: true };
    let everHidden = false, fadeRestarts = 0, lastT0 = null;
    for (let i = 0; i < 16; i++) {
      const d = presentStepAvatar(rec, off, ctx, t + i * 50);
      if (d.hidden) everHidden = true;
      if (rec.fade) {
        if (rec.fade.t0 !== lastT0) { fadeRestarts++; lastT0 = rec.fade.t0; }
      } else lastT0 = null;
    }
    const late = presentStepAvatar(rec, off, ctx, t + 160 * 50);
    return ramp !== null && ramp > 0 && ramp < 1 && staleIn === null && rec.visible === false && rec.fade === null
      && everHidden && fadeRestarts === 1 && late.hidden === true && late.inlineOpacity === 0;
  })()
`));
console.log('\n6. De-overlap (2026-08-29) — the presentation separates markers so avatars never overlap');
check('two coincident points separate to exactly minDist apart, deterministically (same input → same output)', api(`
  (() => {
    const a = presentSeparateAvatars([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }], 40, 20);
    const d = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
    const again = presentSeparateAvatars([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }], 40, 20);
    return Math.abs(d - 40) < 1e-6
      && again[0].x === a[0].x && again[0].y === a[0].y
      && again[1].x === a[1].x && again[1].y === a[1].y;
  })()
`));
check('a whole-room pile (18 markers on one centroid) relaxes to no overlap', api(`
  (() => {
    const pts = [];
    for (let i = 0; i < 18; i++) pts.push({ id: 'n' + i, x: 0, y: 0 });
    presentSeparateAvatars(pts, 40, 20);
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        min = Math.min(min, Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y));
    return min >= 40 - 1;
  })()
`));
check('already-separated points are left untouched (a no-op separation)', api(`
  (() => {
    const pts = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }];
    const before = JSON.stringify(pts);
    presentSeparateAvatars(pts, 40, 20);
    return JSON.stringify(pts) === before;
  })()
`));

console.log('\n==============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('==============================================');
if (fail > 0) process.exit(1);
