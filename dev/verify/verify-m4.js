// Continuous behavior engine, Phase 4 — the physical layer.
//
//   node dev/verify/verify-m4.js
//
// Phases 1-3 moved decisions to absolute minutes and gave commitments
// anchors; this phase makes the anchor a place you physically WALK to
// (movement.js). These are the plan's Verification list, translated:
//
//   1. planWalk is pure, deterministic and model-free, and the waypoints it
//      emits actually resolve to the stand-point through the map's doorways.
//   2. A commitment does not begin at commit time: `arrived` stays false,
//      the walk record exists on the NPC, and deriveHeldRecord reads as a
//      WALK ("heading to X") rather than the activity until it lands.
//   3. Doorway hysteresis (D11): a point inside a doorway gap / off the plan
//      belongs to no room and keeps reporting the last-confirmed room.
//   4. The live integrator (D9) advances coveredUnits at exactly
//      WALK.unitsPerSecond × gameSeconds and lands the walk at the anchor.
//   5. location/pos agreement (D8): a tick that teleports an NPC
//      reconciles their position; a walking NPC's position is never touched.
//   6. The batch settle (D9) lands every walk deterministically — the path
//      resolveBatch relies on, and why check 2's second half works without
//      frames.
//   7. D12's render split, asserted from source: the per-frame clock path
//      calls the live layer and never the static rebuild.
//   8. Determinism survives the walk (C6): two identical-seed runs land
//      byte-identical settled commitment sequences.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'sim.js', 'world.js', 'movement.js', 'cognition.js', 'drives.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const fs = require('fs');
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260814, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // Park a resident in bedroom_1 at 20:00 with a day_shift template — 20:00
  // is an evening block for every day type of that template, so
  // deriveHeldRecord's sleep/work mirrors cannot swallow the walking record.
  // do_laundry anchors at the laundry room's centroid: a genuinely cross-room
  // walk, with the commitment opening arrived:false and a real npc.walk.
  __walkCommit = (g, id) => {
    if (!id) id = __ids(g)[0];
    g.npcs[id].bible = { ...g.npcs[id].bible, scheduleTemplate: 'day_shift' };
    g.meta.clock = absoluteToClock(20 * 60);
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = null;
    openCommitment(g, id, { driveId: 'do_laundry', score: 0.5, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    return g.npcs[id];
  };
`);

console.log('\nplanWalk — pure, geometric, deterministically routed');
check('planWalk is declared (movement.js loads)', api(`typeof planWalk === 'function'`));
check('planWalk is pure and rng-free (no seededRng / Math.random in movement.js)',
  !/seededRng|Math\.random/.test(srcOf('movement.js')));
check('a cross-room walk starts at the start point and ends exactly at the anchor point', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = null;
    const [cx, cy] = roomCentre('laundry');
    const w = planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'laundry', point: { x: cx, y: cy } });
    if (!w) return false;
    const [sx, sy] = roomCentre('bedroom_1');
    const end = w.path[w.path.length - 1];
    return Math.hypot(w.path[0].x - sx, w.path[0].y - sy) < 0.01 &&
           Math.hypot(end.x - cx, end.y - cy) < 0.01 &&
           w.totalUnits > 0 && w.coveredUnits === 0 && w.speed === WALK.unitsPerSecond;
  })()
`));
check('a cross-room walk crosses every doorway the room route names', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = null;
    const [cx, cy] = roomCentre('laundry');
    const w = planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'laundry', point: { x: cx, y: cy } });
    const route = findPath('bedroom_1', 'laundry');
    if (!w || !route) return false;
    for (let i = 0; i < route.length - 1; i++) {
      const seg = sharedWallSegment(route[i], route[i + 1]);
      if (!seg) return false;
      const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
      if (!w.path.some(p => Math.hypot(p.x - mid.x, p.y - mid.y) < 0.01)) return false;
    }
    return true;
  })()
`));
check('no walk when the stand-point is where the NPC already stands', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const [cx, cy] = roomCentre('bedroom_1');
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = { x: cx, y: cy };
    return planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'bedroom_1', point: { x: cx, y: cy } }) === null;
  })()
`));
check('no walk from off-map (no start room) — the commitment just resolves', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.npcs[id].location = null;
    g.npcs[id].pos = null;
    return planWalk(g, g.npcs[id], null, { roomId: 'kitchen', point: { x: 10, y: 10 } }) === null;
  })()
`));
check('planWalk is deterministic — identical calls, identical paths', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = null;
    const [cx, cy] = roomCentre('laundry');
    const a = planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'laundry', point: { x: cx, y: cy } });
    const b = planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'laundry', point: { x: cx, y: cy } });
    return a && b && JSON.stringify(a) === JSON.stringify(b);
  })()
`));

console.log('\nthe commitment does not begin until its walk lands (arrived gate)');
check('a cross-room drive commitment opens with arrived === false and a real walk', api(`
  (() => {
    const g = __mk();
    const npc = __walkCommit(g);
    return npc.commitment && npc.commitment.arrived === false &&
           !!npc.walk && npc.walk.path.length >= 2 &&
           npc.pos && npc.pos.x === npc.walk.path[0].x && npc.pos.y === npc.walk.path[0].y &&
           npc.commitment.anchor.point !== null;
  })()
`));
check('while walking, deriveHeldRecord reads as a WALK, not the activity', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __walkCommit(g, id);
    const rec = deriveHeldRecord(id, npc, g, false);
    return rec && rec.activity.indexOf('heading to') === 0 && rec.location === npc.location && rec.transit === null;
  })()
`));
check('the batch settle lands the walk: arrived true, location = anchor room', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __walkCommit(g, id);
    g.meta.clock = absoluteToClock(npc.walk.completesAtAbs + 1);
    settleWalks(g);
    return npc.walk === null && npc.commitment.arrived === true &&
           npc.commitment.anchor.roomId === npc.location &&
           roomsContainingPoint(npc.pos).indexOf(npc.commitment.anchor.roomId) !== -1;
  })()
`));
check('a tick past the walk\'s completion settles it before any decision reads it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    __walkCommit(g, id);
    g.meta.clock = absoluteToClock(clockToAbsolute(g.meta.clock) + 1);
    const before = g.npcs[id].commitment.completesAtAbs;
    resolveTick(g);
    const npc = g.npcs[id];
    return npc.walk === null && npc.commitment.arrived === true && npc.commitment.completesAtAbs === before;
  })()
`));
check('releaseCommitment clears the in-flight walk', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __walkCommit(g, id);
    if (!npc.walk) return false;
    releaseCommitment(g, id);
    return npc.commitment === undefined && npc.walk === null;
  })()
`));

console.log('\nD11 — doorway hysteresis');
check('a point in no room keeps the last-confirmed location', api(`
  (() => {
    // 3 units past the plan\\'s far edge is in no room rect.
    const off = { x: 520, y: 500 };
    return roomsContainingPoint(off).length === 0 &&
           deriveLocationFromPosition({ location: 'kitchen' }, off) === 'kitchen';
  })()
`));
check('a point fully inside another room switches', api(`
  (() => {
    const g = __mk();
    const [cx, cy] = roomCentre('laundry');
    return deriveLocationFromPosition({ location: 'bedroom_1' }, { x: cx, y: cy }) === 'laundry';
  })()
`));
check('a point inside the last-confirmed room stays there', api(`
  (() => {
    const g = __mk();
    const [cx, cy] = roomCentre('living_room');
    return deriveLocationFromPosition({ location: 'living_room' }, { x: cx, y: cy }) === 'living_room';
  })()
`));

console.log('\nD9 — the live integrator: game-time at WALK.unitsPerSecond');
check('coveredUnits advances by exactly WALK.unitsPerSecond × gameSeconds', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.npcs[id].location = 'bedroom_1';
    g.npcs[id].pos = null;
    const [cx, cy] = roomCentre('laundry');
    const w = planWalk(g, g.npcs[id], 'bedroom_1', { roomId: 'laundry', point: { x: cx, y: cy } });
    g.npcs[id].walk = w;
    g.npcs[id].pos = { ...w.path[0] };
    // Half the walk\\'s needed game-minutes — cannot complete it.
    const halfMinutes = (w.totalUnits / WALK.unitsPerSecond / 60) * 0.5;
    advanceFrameWalks(g, halfMinutes);
    return g.npcs[id].walk &&
           Math.abs(g.npcs[id].walk.coveredUnits - WALK.unitsPerSecond * halfMinutes * 60) < 1e-9;
  })()
`));
check('a walk completes when its units are covered — at the anchor, arrived flips', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __walkCommit(g, id);
    if (!npc.walk) return false;
    const end = npc.commitment.anchor.point;
    const needed = npc.walk.totalUnits / WALK.unitsPerSecond / 60;
    advanceFrameWalks(g, needed + 1e-6);
    return npc.walk === null && npc.commitment.arrived === true &&
           Math.hypot(npc.pos.x - end.x, npc.pos.y - end.y) < 0.01 &&
           npc.location === npc.commitment.anchor.roomId;
  })()
`));

console.log('\nD8 — location/pos agreement');
check('a tick that teleports an NPC reconciles pos to the new room', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = g.npcs[id];
    npc.pos = { x: 5, y: 5 };
    npc.location = 'bedroom_1';
    reconcileNpcPos(npc);
    const [cx, cy] = roomCentre('bedroom_1');
    return Math.hypot(npc.pos.x - cx, npc.pos.y - cy) < 0.01;
  })()
`));
check('a walking NPC\'s pos is never reconciled', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __walkCommit(g, id);
    if (!npc.walk) return false;
    const before = { x: npc.pos.x, y: npc.pos.y };
    reconcileNpcPos(npc);
    return npc.pos.x === before.x && npc.pos.y === before.y && npc.walk !== null;
  })()
`));

console.log('\nD12 — the render split, asserted from source');
const timeSrc = srcOf('time.js');
const renderSrc = srcOf('render.js');
check('clockFrame calls the LIVE layer, never the static rebuild', api(`
  !/clockFrame[\\s\\S]*renderFloorPlanStatic/.test(${JSON.stringify(timeSrc)}) &&
  /renderFloorPlanLive\\(/.test(${JSON.stringify(timeSrc)})
`));
check('renderFloorPlanStatic is only called from the static entry (renderFloorPlan)', api(`
  (${JSON.stringify(renderSrc)}.match(/renderFloorPlanStatic\\(/g) || []).length === 2
`), 'one definition + one call site — nothing else may rebuild the static layer');

console.log('\nC6 — the walk does not cost determinism');
check('two identical-seed settled runs produce byte-identical commitment sequences', api(`
  (() => {
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
    return run() === run();
  })()
`), 'same seed, same game — the physical layer must never touch the decision rng');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
