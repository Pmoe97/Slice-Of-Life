// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 17: Home —
// the in-game designer (D55, D110).
//
//   node src/src/dev/verify/verify-acc-p17.js
//
// Node coverage (invariant 7 — the interactive drag/undo/touch surface is
// DOM-only and verified on the live page instead, per the plan's own
// Phase 17 note): normalizePlacement/placementFitsRoom (defs.design.js) —
// snapping, the size floor, 15° rotation steps, and the reject-outside-
// the-room check against ROOM_LAYOUT; baseFurnitureShape/
// BASE_FURNITURE_SHAPES resolving a defId to a drawable shape (direct hit,
// aliased hit, unknown → null); roomAutoBaseCandidates snapshotting
// resolveAutoPlacements into ROOM_DECOR-shaped candidates, skipping
// footprint-bearing defIds with no shape (the pool_pump/sauna precedent —
// D106 already accepted this gap for the shipped pool room); the three
// override writers (startRoomArrange/removeRoomArrangePlacement/
// resetRoomArrange, computer.js); and placeDecorItem/moveDecorObject now
// refusing a placement outside the room's own rects instead of only
// floor-checking size.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.design.js', 'defs.placement.js', 'defs.works.js',
    'sim.js', 'world.js', 'signals.js', 'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js',
    'notice.js', 'aspirations.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');

api(`
  __mk = (seed, residents, day) => {
    const h = SIM_generateHouse(seed || 20260919, residents == null ? 3 : residents);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    return g;
  };
  __give = (g, defId, n) => { g.player.inventory = addStack(g.player.inventory, defId, n || 1, 'player', null, 0); };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. normalizePlacement / placementFitsRoom');
const n1 = J(`normalizePlacement({ x: 11, y: 22, w: 9, h: 9, rot: 8 })`);
check('snaps x/y/w/h to the grid (default 5) and rounds rot to the nearest 15°',
  n1.x === 10 && n1.y === 20 && n1.w === 10 && n1.h === 10 && n1.rot === 15, JSON.stringify(n1));
const n2 = J(`normalizePlacement({ x: 11, y: 22, w: 9, h: 9, rot: 0 }, { snap: false })`);
check('snap:false rounds to the nearest integer instead of the grid',
  n2.x === 11 && n2.y === 22 && n2.w === 9 && n2.h === 9, JSON.stringify(n2));
check('a size below the floor is lifted to it (default minSize 2)',
  J(`normalizePlacement({ x: 0, y: 0, w: 1, h: 1, rot: 0 }, { snap: false })`).w === 2);
check('rotation wraps into [0, 360) (the nearest 15° step to -10° is -15°, which wraps to 345°)',
  J(`normalizePlacement({ x: 0, y: 0, w: 5, h: 5, rot: -10 }, { snap: false })`).rot === 345);
check('non-finite input is rejected outright',
  J(`normalizePlacement({ x: NaN, y: 0, w: 5, h: 5 })`) === null
  && J(`normalizePlacement(null)`) === null);
const bedroomRect = J(`ROOM_LAYOUT['bedroom_player'][0]`);
check('a placement fully inside the room’s rect is accepted',
  J(`!!normalizePlacement({ x: ${bedroomRect[0] + 5}, y: ${bedroomRect[1] + 5}, w: 10, h: 10, rot: 0 }, { roomId: 'bedroom_player' })`));
check('a placement entirely outside every rect of the room is rejected',
  J(`normalizePlacement({ x: 9000, y: 9000, w: 10, h: 10, rot: 0 }, { roomId: 'bedroom_player' })`) === null);
check('a roomId with no ROOM_LAYOUT entry never rejects (nothing to check against)',
  J(`!!normalizePlacement({ x: 9000, y: 9000, w: 10, h: 10, rot: 0 }, { roomId: 'not_a_room' })`));
check('rotation is never bounds-checked (a rejected-if-checked position still normalizes when only rot changes and roomId is omitted)',
  J(`!!normalizePlacement({ x: 9000, y: 9000, w: 10, h: 10, rot: 40 }, { roomId: null })`));

// ---------------------------------------------------------------- 2
console.log('\n2. baseFurnitureShape / BASE_FURNITURE_SHAPES / roomAutoBaseCandidates');
check('a defId that is already a DESIGN_SHAPES id resolves to itself',
  api(`baseFurnitureShape('bed')`) === 'bed');
check('an aliased fixture defId resolves through BASE_FURNITURE_SHAPES',
  api(`baseFurnitureShape('sink_kitchen')`) === 'sink' && api(`baseFurnitureShape('coffee_table_lr')`) === 'coffee_table');
check('an unresolvable defId returns null',
  api(`baseFurnitureShape('thermostat')`) === null && api(`baseFurnitureShape('nope_not_real')`) === null);
check('every BASE_FURNITURE_SHAPES alias target is a real DESIGN_SHAPES entry',
  J(`Object.values(BASE_FURNITURE_SHAPES).every(s => !!DESIGN_SHAPES[s])`));

const cand = J(`(() => { const g = __mk(20260919, 3, 3); return {
  bedroom: roomAutoBaseCandidates(g, 'bedroom_player'),
  kitchen: roomAutoBaseCandidates(g, 'kitchen'),
  none: roomAutoBaseCandidates(g, 'not_a_room'),
}; })()`);
check('bedroom_player: every APARTMENT_LAYOUT fixture with a footprint resolves to a shape (bed/desk/wardrobe/nightstand/desktop_computer)',
  cand.bedroom.length === 5 && ['bed', 'desk', 'wardrobe', 'nightstand', 'desktop_computer'].every(s => cand.bedroom.some(c => c.shape === s)),
  JSON.stringify(cand.bedroom));
check('every candidate carries the defId it came from and a shape DESIGN_SHAPES knows',
  cand.bedroom.every(c => c.defId && c.shape));
check('kitchen: fixtures with no resolvable shape (freezer, pantry, coffee_maker, trash_kitchen, dishwasher, microwave) are left out, not crashed on',
  cand.kitchen.length > 0 && cand.kitchen.length < 9 && cand.kitchen.every(c => c.shape));
check('a room with no ROOM_LAYOUT entry yields no candidates',
  Array.isArray(cand.none) && cand.none.length === 0);

// ---------------------------------------------------------------- 3
console.log('\n3. startRoomArrange / removeRoomArrangePlacement / resetRoomArrange (computer.js)');
const arr = J(`(() => {
  const g = __mk(20260919, 3, 3);
  const before = g.world.roomDecorOverrides && g.world.roomDecorOverrides.bedroom_player;
  const r1 = startRoomArrange(g, 'bedroom_player');
  const afterStart = JSON.parse(JSON.stringify(g.world.roomDecorOverrides.bedroom_player));
  const r2 = startRoomArrange(g, 'bedroom_player'); // idempotent
  const stillSame = JSON.stringify(g.world.roomDecorOverrides.bedroom_player) === JSON.stringify(afterStart);
  const rm = removeRoomArrangePlacement(g, 'bedroom_player', 0);
  const afterRemove = JSON.parse(JSON.stringify(g.world.roomDecorOverrides.bedroom_player));
  const rmBad = removeRoomArrangePlacement(g, 'bedroom_player', 99);
  const reset = resetRoomArrange(g, 'bedroom_player');
  const afterReset = g.world.roomDecorOverrides.bedroom_player;
  const resetAgain = resetRoomArrange(g, 'bedroom_player');
  return { before, r1ok: r1.ok, r1already: r1.already, afterStart, r2already: r2.already, stillSame,
           rmOk: rm.ok, afterRemove, rmBadOk: rmBad.ok, resetOk: reset.ok, afterReset, resetAgainOk: resetAgain.ok };
})()`);
check('no override exists before arranging',
  arr.before === undefined);
check('startRoomArrange snapshots the auto layout (5 entries for bedroom_player) and is idempotent (already:true, unchanged, on a second call)',
  arr.r1ok && !arr.r1already && arr.afterStart.length === 5 && arr.r2already && arr.stillSame);
check('removeRoomArrangePlacement splices the entry; an out-of-range index is refused',
  arr.rmOk && arr.afterRemove.length === 4 && arr.rmBadOk === false);
check('resetRoomArrange deletes the override key outright (not []); resetting again is refused',
  arr.resetOk && arr.afterReset === undefined && arr.resetAgainOk === false);

// ---------------------------------------------------------------- 4
console.log('\n4. placeDecorItem / moveDecorObject reject an out-of-room placement');
const place = J(`(() => {
  const g = __mk(20260919, 3, 3);
  __give(g, 'bed_basic', 1);
  const rect = ROOM_LAYOUT['bedroom_player'][0];
  const outside = placeDecorItem(g, { defId: 'bed_basic', roomId: 'bedroom_player', pos: { x: 9000, y: 9000, w: 26, h: 34, rot: 0 } });
  const stillOwned = (g.player.inventory.find(s => s.defId === 'bed_basic') || {}).qty;
  const inside = placeDecorItem(g, { defId: 'bed_basic', roomId: 'bedroom_player', pos: { x: rect[0] + 4, y: rect[1] + 4, w: 26, h: 34, rot: 0 } });
  const objId = inside.id;
  const moveOutside = moveDecorObject(g, objId, { x: -9000, y: -9000, w: 26, h: 34, rot: 0 });
  const posAfterBadMove = findObjectById(g, objId).pos;
  const moveInside = moveDecorObject(g, objId, { x: rect[0] + 8, y: rect[1] + 8, w: 26, h: 34, rot: 0 });
  const posAfterGoodMove = findObjectById(g, objId).pos;
  return { outsideOk: outside.ok, stillOwned, insideOk: inside.ok, moveOutsideOk: moveOutside.ok, posAfterBadMove, moveInsideOk: moveInside.ok, posAfterGoodMove };
})()`);
check('placeDecorItem refuses a position outside the room and leaves the item in inventory',
  place.outsideOk === false && place.stillOwned === 1);
check('placeDecorItem accepts a position inside the room',
  place.insideOk === true);
check('moveDecorObject refuses a position outside the room, leaving the object where it was',
  place.moveOutsideOk === false && place.posAfterBadMove.x !== -9000);
check('moveDecorObject accepts a position inside the room, grid-snapped exactly like placeDecorItem',
  place.moveInsideOk === true && place.posAfterGoodMove.x === 100 && place.posAfterGoodMove.y === 15,
  JSON.stringify(place));

// ---------------------------------------------------------------- 5
console.log('\n5. An arranged room reads back through decorFor exactly like an authored one');
const read = J(`(() => {
  const g = __mk(20260919, 3, 3);
  const before = decorFor(g, 'bedroom_player').length;
  startRoomArrange(g, 'bedroom_player');
  const after = decorFor(g, 'bedroom_player').length;
  const base = roomDesignBase(g, 'bedroom_player');
  const designed = roomDesigned(g, 'bedroom_player');
  const playerCount = roomPlayerDesignCount(g, 'bedroom_player');
  return { before, after, source: base.source, designed, playerCount };
})()`);
check('an un-arranged bedroom is not "designed" (decorFor sees only the packer, which counts for nothing)',
  read.before === 0);
check('after arranging, decorFor/roomDesignBase/roomDesigned/roomPlayerDesignCount all agree the room is the player\'s own design',
  read.after === 5 && read.source === 'override' && read.designed === true && read.playerCount === 5, JSON.stringify(read));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
