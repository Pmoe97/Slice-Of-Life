// NPC avatar liveliness — Phase 2: shared furniture placement + interaction
// anchors (D8/D9/D10/D17).
//
//   node src/src/dev/verify/verify-present-p2.js
//
// The plan's Phase 2 Verification, translated into checks against the real
// engine (config/defs.world/defs.actions/defs.design/defs.placement +
// sim/world/actions). The invariant the phase exists for: the footprint the
// floor plan DRAWS and the stand-point an NPC WALKS TO are the same
// coordinates (invariant 2). resolveAutoPlacements is the pure packer moved
// verbatim out of renderAutoFurniture; resolveObjectStandPoint is the anchor
// resolver actions.js's resolveActionAnchor delegates to. The render half
// (render.js consuming the footprints) is live-verified on the page — this
// file cannot load render.js (deliberately absent from loadgame ORDER).
//
//   1. Every auto room: every drawn placement's stand-point == the D10 offset
//      of that EXACT rect (edge, or centre for lie-on/sit-in surfaces), and
//      != the room centroid — the picture and the walk cannot disagree.
//   2. Authored room (pool_room): the swimming_pool object resolves against
//      the ROOM_DECOR placement (edge, inset 6), NOT against an auto
//      placement (nothing the packer produces is drawn in an authored room)
//      and not the centroid. A decoration with no defId (pool_pump) falls to
//      the room centroid.
//   3. D17 table wired: bed/sofa/armchair are 'center'; the curated
//      standInset values land; DEFAULT_STAND_INSET is 4.
//   4. Determinism: resolveAutoPlacements twice == identical.
//   5. D9 tier 1: a PLACED object (obj.pos) wins over the packer — the
//      stand-point is the offset of the placed rect.
//   6. End-to-end through the action resolver: self.cook from the kitchen
//      anchors at the stove's drawn edge (inset 4), not the kitchen centroid.
//   7. fpFootprint follows the decor alias chain (sofa_basic→sofa,
//      bed_basic→bed) and returns null for undrawn defIds (floor).
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.design.js',
             'defs.placement.js', 'sim.js', 'world.js', 'actions.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260829, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __npc = (g) => g.npcs[__ids(g)[0]];
  __centre = (r) => { const [cx, cy] = roomCentre(r); return { x: cx, y: cy }; };
  __authored = (r) => typeof ROOM_DECOR !== 'undefined' && !!ROOM_DECOR[r] && ROOM_DECOR[r].length > 0;
  __expected = (p, rcx, rcy, obj) => {
    const def = obj && OBJECT_DEFS[obj.defId];
    if (def && def.anchorMode === 'center') return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    const inset = (def && typeof def.standInset === 'number') ? def.standInset : DEFAULT_STAND_INSET;
    return objectStandPoint(p, rcx, rcy, inset);
  };

  __autoRooms = () => {
    const g = __mk();
    const out = { rooms: 0, placements: 0, allMatch: true, allOffCentre: true, failures: [] };
    for (const roomId of Object.keys(ROOM_LAYOUT)) {
      if (__authored(roomId)) continue;
      const [rcx, rcy] = roomCentre(roomId);
      const placements = resolveAutoPlacements(g, roomId) || [];
      if (placements.length > 0) out.rooms++;
      out.placements += placements.length;
      const bucket = (g.objects && g.objects['room_' + roomId]) || {};
      for (const p of placements) {
        const obj = bucket[p.objId];
        const sp = resolveObjectStandPoint(g, roomId, obj);
        const exp = __expected(p, rcx, rcy, obj);
        const c = __centre(roomId);
        if (Math.hypot(sp.x - exp.x, sp.y - exp.y) >= 1e-9) {
          out.allMatch = false;
          out.failures.push(roomId + '/' + p.defId +
            ' sp=(' + sp.x.toFixed(1) + ',' + sp.y.toFixed(1) + ')' +
            ' exp=(' + exp.x.toFixed(1) + ',' + exp.y.toFixed(1) + ')');
        }
        if (Math.hypot(sp.x - c.x, sp.y - c.y) <= 1) out.allOffCentre = false;
      }
    }
    return out;
  };

  __poolRoom = () => {
    const g = __mk();
    const [rcx, rcy] = roomCentre('pool_room');
    const bucket = g.objects['room_pool_room'] || {};
    const pool = Object.values(bucket).find(o => o.defId === 'swimming_pool');
    const c = __centre('pool_room');
    const exp = objectStandPoint({ x: 372, y: 352, w: 96, h: 92 }, rcx, rcy,
                                 OBJECT_DEFS.swimming_pool.standInset);
    const sp = resolveObjectStandPoint(g, 'pool_room', pool);
    const auto = (resolveAutoPlacements(g, 'pool_room') || []).find(pl => pl.objId === pool.id);
    const autoCx = auto ? auto.x + auto.w / 2 : NaN, autoCy = auto ? auto.y + auto.h / 2 : NaN;
    const pump = Object.values(bucket).find(o => o.defId === 'pool_pump');
    const pumpSp = resolveObjectStandPoint(g, 'pool_room', pump);
    return {
      poolFound: !!pool,
      onEdge: Math.hypot(sp.x - exp.x, sp.y - exp.y) < 1e-9,
      offCentre: Math.hypot(sp.x - c.x, sp.y - c.y) > 1,
      notAuto: !auto || Math.hypot(sp.x - autoCx, sp.y - autoCy) > 1,
      pumpAtCentre: Math.hypot(pumpSp.x - c.x, pumpSp.y - c.y) < 1e-9,
      sp, exp, auto: auto ? { x: autoCx, y: autoCy } : null, c,
    };
  };

  __table = () => ({
    bed: OBJECT_DEFS.bed && OBJECT_DEFS.bed.anchorMode,
    sofa: OBJECT_DEFS.sofa && OBJECT_DEFS.sofa.anchorMode,
    armchair: OBJECT_DEFS.armchair && OBJECT_DEFS.armchair.anchorMode,
    pool: OBJECT_DEFS.swimming_pool && OBJECT_DEFS.swimming_pool.standInset,
    stove: OBJECT_DEFS.stove && OBJECT_DEFS.stove.standInset,
    dining: OBJECT_DEFS.dining_table && OBJECT_DEFS.dining_table.standInset,
    kitchenTable: OBJECT_DEFS.kitchen_table && OBJECT_DEFS.kitchen_table.standInset,
    desk: OBJECT_DEFS.desk && OBJECT_DEFS.desk.standInset,
    tv: OBJECT_DEFS.tv && OBJECT_DEFS.tv.standInset,
    def: DEFAULT_STAND_INSET,
  });

  __deterministic = () => {
    const g = __mk();
    const a = JSON.stringify(resolveAutoPlacements(g, 'kitchen'));
    const b = JSON.stringify(resolveAutoPlacements(g, 'kitchen'));
    return a === b;
  };

  __placedWins = () => {
    const g = __mk();
    const bucket = g.objects['room_kitchen'] || {};
    const stove = Object.values(bucket).find(o => o.defId === 'stove');
    const [rcx, rcy] = roomCentre('kitchen');
    const pos = { x: 620, y: 90, w: 14, h: 12 };   // far corner, nowhere near the packer
    const placed = Object.assign({}, stove, { pos });
    const sp = resolveObjectStandPoint(g, 'kitchen', placed);
    const exp = objectStandPoint(pos, rcx, rcy, OBJECT_DEFS.stove.standInset);
    const packerSp = resolveObjectStandPoint(g, 'kitchen', stove);   // the unplaced base
    return {
      atPos: Math.hypot(sp.x - exp.x, sp.y - exp.y) < 1e-9,
      differsFromPacker: Math.hypot(sp.x - packerSp.x, sp.y - packerSp.y) > 1,
      sp, packerSp,
    };
  };

  __cookAnchor = () => {
    const g = __mk();
    const npcId = __ids(g)[0];
    g.npcs[npcId].location = 'kitchen';
    const anchor = resolveActionAnchor(g, 'self.cook', npcId);
    const bucket = g.objects['room_kitchen'] || {};
    const stove = Object.values(bucket).find(o => o.defId === 'stove');
    const exp = resolveObjectStandPoint(g, 'kitchen', stove);
    const c = __centre('kitchen');
    return {
      anchored: !!anchor,
      roomIsKitchen: !!anchor && anchor.roomId === 'kitchen',
      atStove: !!anchor && anchor.objId === stove.id
        && Math.hypot(anchor.point.x - exp.x, anchor.point.y - exp.y) < 1e-9,
      offCentre: !!anchor && Math.hypot(anchor.point.x - c.x, anchor.point.y - c.y) > 1,
      point: anchor && anchor.point, exp,
    };
  };

  __aliases = () => {
    const a = fpFootprint('sofa_basic'), b = fpFootprint('bed_basic');
    const d = fpFootprint('stove');
    return {
      sofaAlias: !!a && a.w === FP_FOOTPRINTS.sofa.w && a.h === FP_FOOTPRINTS.sofa.h,
      bedAlias: !!b && b.w === FP_FOOTPRINTS.bed.w && b.h === FP_FOOTPRINTS.bed.h,
      noFloor: fpFootprint('floor') === null,
      stoveOk: !!d && d.w === FP_FOOTPRINTS.stove.w && d.h === FP_FOOTPRINTS.stove.h,
    };
  };
`);

console.log('\n1. Every auto room — drawn footprint and anchor stand-point agree (invariant 2)');
const ar = api('__autoRooms()');
check(`stand-point == D10 offset of the drawn rect in all ${ar.placements} placements across ${ar.rooms} rooms`,
      ar.placements > 0 && ar.allMatch, ar.failures.slice(0, 5).join(' | '));
check('...and none of them is the room centroid (NPCs stand AT the object)', ar.allOffCentre);

console.log('\n2. Authored room (pool_room) — resolves against ROOM_DECOR, never the auto packer');
const pr = api('__poolRoom()');
check('the swimming_pool object resolves to the authored pool edge (inset 6)',
      pr.poolFound && pr.onEdge, `sp=(${pr.sp.x.toFixed(1)},${pr.sp.y.toFixed(1)}) exp=(${pr.exp.x.toFixed(1)},${pr.exp.y.toFixed(1)})`);
check('...off the room centroid', pr.offCentre, `centroid=(${pr.c.x.toFixed(1)},${pr.c.y.toFixed(1)})`);
check('...and NOT the auto-pack placement (nothing the packer makes is drawn here)',
      pr.notAuto, `auto centre=(${pr.auto ? pr.auto.x.toFixed(1) : '?'},${pr.auto ? pr.auto.y.toFixed(1) : '?'})`);
check('a decoration with no defId (pool_pump) falls to the room centroid', pr.pumpAtCentre);

console.log('\n3. D17 — the curated anchor table is wired');
const tb = api('__table()');
check('bed/sofa/armchair are anchorMode center (lie-on/sit-in surfaces)',
      tb.bed === 'center' && tb.sofa === 'center' && tb.armchair === 'center',
      `bed=${tb.bed} sofa=${tb.sofa} armchair=${tb.armchair}`);
check('curated standInset values land (pool 6, dining 6, kitchen table 6, stove 4, desk 4, tv 5)',
      tb.pool === 6 && tb.dining === 6 && tb.kitchenTable === 6 && tb.stove === 4 && tb.desk === 4 && tb.tv === 5,
      `pool=${tb.pool} dining=${tb.dining} kt=${tb.kitchenTable} stove=${tb.stove} desk=${tb.desk} tv=${tb.tv}`);
check(`DEFAULT_STAND_INSET is 4`, tb.def === 4, `got ${tb.def}`);

console.log('\n4. Determinism — the packer is a pure function of (gs, roomId)');
check('resolveAutoPlacements twice returns byte-identical JSON', api('__deterministic()'));

console.log('\n5. D9 tier 1 — a PLACED object wins over the packer');
const pw = api('__placedWins()');
check('the stand-point is the offset of the placed rect, not the packer\'s',
      pw.atPos && pw.differsFromPacker,
      `sp=(${pw.sp.x.toFixed(1)},${pw.sp.y.toFixed(1)}) packer=(${pw.packerSp.x.toFixed(1)},${pw.packerSp.y.toFixed(1)})`);

console.log('\n6. End-to-end — self.cook anchors at the stove\'s drawn edge');
const ca = api('__cookAnchor()');
check('anchor resolves to the kitchen stove object at its drawn-edge stand-point',
      ca.anchored && ca.roomIsKitchen && ca.atStove,
      `room=${ca.roomIsKitchen} point=(${ca.point ? ca.point.x.toFixed(1) : '?'},${ca.point ? ca.point.y.toFixed(1) : '?'}) exp=(${ca.exp.x.toFixed(1)},${ca.exp.y.toFixed(1)})`);
check('...off the kitchen centroid', ca.offCentre);

console.log('\n7. fpFootprint — the decor alias chain resolves, undrawn defIds are null');
const al = api('__aliases()');
check('sofa_basic → sofa, bed_basic → bed', al.sofaAlias && al.bedAlias);
check('floor is undrawn (null); stove resolves to its own footprint', al.noFloor && al.stoveOk);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
