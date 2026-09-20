// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 16: Home —
// comfort, room opinions, overrides, hanging art (D51–D54).
//
//   node src/src/dev/verify/verify-acc-p16.js
//
// Node coverage: HOME_TUNING (defs.works.js, D56) and DESIGN_SHAPES.player_art
// with its `art` part styled in index.html; DESIGN_STYLE_TAGS covering every
// shape the Home catalog sells; the three design sources through ONE reader
// (defs.design.js's roomDesignBase / roomPlacedDecor / decorFor /
// roomDesigned): an auto-arranged room is not designed, an override makes
// it designed and wins over the authored pool room, a placed catalog piece
// makes it designed (and the packer no longer claims a wall for it —
// resolveAutoPlacements skips it, resolveObjectStandPoint anchors at its
// pos); world.roomDecorOverrides in SAVE_KEYS with its fallback; the
// comfort impulse (designedRoomComfort = designedRoomMood × density, exactly
// 0.02 at densityRef placements; applyDesignedRoomComfort pushes exactly
// ONE moodEvents entry for a designed room and none for an auto room; the
// `restful` flag on self.nap / self.relax); the room_design opinion — two
// NPCs identical but for occupation.styleLean, in the room, awake: both
// hold exactly one opinion fact of the plan's record shape, the one whose
// lean matches the room's dominant style forms the higher valence; a
// sleeping NPC holds none; re-entry is a no-op; a changed design (new
// version) supersedes the old opinion (valid: false); the authored pool
// room is designed but not a subject about the player; every band of
// OPINION_LINES.room_design phrases the room's name; hanging (works.js's
// hangWork): wallSlotsFor excludes the L-shaped living room's interior
// seam, the stack leaves the bag, a player_art object with meta.workId and
// the slot's pos appears in the room, the work stays in the catalog
// unreleased at reach 0, the Compass milestone `comf_hang_art` completes,
// a taken slot refuses a second piece, the piece's quality lifts
// roomDesignQuality, takeDownWork returns the stack with its meta and the
// piece then sells; ASP.roomsDesigned on the new definition; the override
// and the hung object ride captureSavePayload. The room view (the hung
// piece drawn at its slot), the Home app's Hang screen and the arrival
// line are checked on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
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
  // Place n catalog pieces in a room through the REAL placeDecorItem.
  __furnish = (g, roomId, defIds) => {
    const out = [];
    defIds.forEach((defId, i) => {
      __give(g, defId, 1);
      const shape = DESIGN_SHAPES[DECOR_CATALOG_DEFS[defId].shape];
      const [rx, ry] = ROOM_LAYOUT[roomId][0];
      const r = placeDecorItem(g, { defId, roomId, pos: { x: rx + 4 + i * 3, y: ry + 4 + i * 3, w: shape.w, h: shape.h, rot: 0 } });
      out.push(r);
    });
    return out;
  };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion' && f.subject && f.subject.kind === 'room_design');
  // A finished piece in the bag: the real startWork + finishWorkRecord path.
  __piece = (g, title, quality) => {
    g.player.skills = g.player.skills || {};
    const r = startWork(g, { kind: 'piece', title });
    const w = finishWorkRecord(g, r.wip);
    if (typeof quality === 'number') { w.quality = quality; const s = pieceItemStack(g.player, w.id); s.meta.quality = quality; }
    return w;
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. Tables and registration');
const t = J(`(() => {
  const catalogShapes = Object.values(DECOR_CATALOG_DEFS).map(d => d.shape);
  const art = DESIGN_SHAPES.player_art;
  return {
    tuning: HOME_TUNING, kinds: NOTICE_KINDS.includes('room_design'),
    artOk: !!art && art.parts.some(p => p.cls === 'art') && art.parts.some(p => p.cls === 'frame'),
    tagsCover: catalogShapes.every(s => Array.isArray(DESIGN_STYLE_TAGS[s]) && DESIGN_STYLE_TAGS[s].length > 0),
    tagsVocab: [...new Set(Object.values(DESIGN_STYLE_TAGS).flat())],
    lines: ['strong_pos', 'pos', 'neutral', 'neg', 'strong_neg'].every(b => Array.isArray(OPINION_LINES.room_design[b]) && OPINION_LINES.room_design[b].length > 0),
    saveKey: SAVE_KEYS.find(e => e.folder === 'world').keys.includes('roomDecorOverrides'),
    fallback: typeof WORLD_KEY_FALLBACKS.roomDecorOverrides === 'function' && JSON.stringify(WORLD_KEY_FALLBACKS.roomDecorOverrides()) === '{}',
    restful: ACTION_DEFS['self.nap'].restful === true && ACTION_DEFS['self.relax'].restful === true,
    screen: APP_DEFS.home.screens.hang && APP_DEFS.home.screens.hang.renderer,
    fns: ['roomDesignBase', 'roomPlacedDecor', 'decorFor', 'roomDesigned', 'roomPlayerDesignCount', 'roomDecorDensity', 'roomStyleWeights', 'roomDesignVersion', 'designedRoomComfort', 'wallSlotsFor', 'wallSlotOccupant', 'applyDesignedRoomComfort', 'roomDesignQuality', 'noticeRoomDesign', 'hangWork', 'takeDownWork', 'hungPieces'].filter(f => typeof globalThis[f] !== 'function'),
  };
})()`);
check('HOME_TUNING lives in defs.works.js (D56) with designedRoomMood 0.02 and densityRef 8; room_design is a NOTICE kind',
  t.tuning.designedRoomMood === 0.02 && t.tuning.densityRef === 8 && t.tuning.opinion && t.tuning.wallSlot && t.kinds
  && !/const HOME_TUNING/.test(fs.readFileSync(path.join(SRC, 'config.js'), 'utf8')), JSON.stringify(t.tuning));
check('DESIGN_SHAPES.player_art is a frame around an `art` part, styled in index.html and the dev designer, synced into designer.html',
  t.artOk && /\.fp-p-art\s*\{/.test(fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'))
  && /\.p-art\s*\{/.test(fs.readFileSync(path.join(SRC, '..', 'dev', 'designer.html'), 'utf8'))
  && /"player_art"\s*:/.test(fs.readFileSync(path.join(SRC, '..', 'dev', 'designer.html'), 'utf8')));
check('DESIGN_STYLE_TAGS covers every shape the Home catalog sells, in the styleLean vocabulary; every room_design band has lines',
  t.tagsCover && t.lines && t.tagsVocab.every(v => /^[a-z]+$/.test(v)), JSON.stringify(t.tagsVocab));
check('world.roomDecorOverrides is in SAVE_KEYS with a {} fallback; self.nap / self.relax are `restful`; the Home app has the hang screen',
  t.saveKey && t.fallback && t.restful && t.screen === 'home-hang');
check('every Phase 16 function exists', t.fns.length === 0, t.fns.join(', '));
const rc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
const rj = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
check('render.computer.js registers home-hang → renderHomeHang; render.js reads roomDesignBase, draws placed decor at its pos and takes the art fill from the placement',
  /'home-hang':\s*renderHomeHang/.test(rc) && /function renderHomeHang\(/.test(rc)
  && /roomDesignBase\(gs, roomId\)/.test(rj) && /function renderPlacedDecor\(/.test(rj) && /p\.cls === 'art' && place\.fill/.test(rj));
const uj = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
check('ui.js applies the comfort in doSleep and notices the room on doMove; the four hang actions dispatch',
  /applyDesignedRoomComfort\(currentGameState, currentGameState\.player\.location/.test(uj) && /noticeRoomDesign\(currentGameState, roomId\)/.test(uj)
  && ['home.hang-pick', 'home.hang-room', 'home.hang-slot', 'home.take-down'].every(a => uj.includes(`case '${a}':`)));

// ---------------------------------------------------------------- 2
console.log('\n2. What "designed" is (D53): override → authored → placed');
const d = J(`(() => {
  const g = __mk(1, 0, 3);
  const before = { lr: roomDesigned(g, 'living_room'), decor: decorFor(g, 'living_room').length, pool: roomDesigned(g, 'pool_room'), poolSrc: roomDesignBase(g, 'pool_room').source, poolPlayer: roomPlayerDesignCount(g, 'pool_room'), poolDensity: roomDecorDensity(g, 'pool_room') };
  g.world.roomDecorOverrides = { living_room: [ { shape: 'sofa', x: 170, y: 200, w: 32, h: 14, rot: 0 }, { shape: 'rug', x: 200, y: 250, w: 44, h: 30, rot: 0 } ],
                                 pool_room: [ { shape: 'bench', x: 340, y: 330, w: 22, h: 6, rot: 0 } ] };
  const after = { lr: roomDesigned(g, 'living_room'), src: roomDesignBase(g, 'living_room').source, n: decorFor(g, 'living_room').length, player: roomPlayerDesignCount(g, 'living_room'),
                  poolSrc: roomDesignBase(g, 'pool_room').source, poolN: decorFor(g, 'pool_room').length, version: roomDesignVersion(g, 'living_room') };
  return { before, after };
})()`);
check('an auto-arranged room is not designed (decorFor []); the authored pool room is designed (source authored, 6 of its 7 placements visible — one basin at a time — → density 0.75) but none of it is the player\'s',
  !d.before.lr && d.before.decor === 0 && d.before.pool && d.before.poolSrc === 'authored' && d.before.poolPlayer === 0 && d.before.poolDensity === 0.75, JSON.stringify(d.before));
check('an override makes the living room designed (source override, 2 placements, both the player\'s) and wins over the authored pool room',
  d.after.lr && d.after.src === 'override' && d.after.n === 2 && d.after.player === 2 && d.after.poolSrc === 'override' && d.after.poolN === 1 && typeof d.after.version === 'string', JSON.stringify(d.after));
const p = J(`(() => {
  const g = __mk(2, 0, 3);
  const packedBefore = (resolveAutoPlacements(g, 'bedroom_player') || []).length;
  const [r] = __furnish(g, 'bedroom_player', ['plant']);
  const obj = g.objects.room_bedroom_player[r.id];
  const packedAfter = resolveAutoPlacements(g, 'bedroom_player') || [];
  const sp = resolveObjectStandPoint(g, 'bedroom_player', obj);
  const placed = roomPlacedDecor(g, 'bedroom_player');
  return { ok: r.ok, designed: roomDesigned(g, 'bedroom_player'), base: roomDesignBase(g, 'bedroom_player'), density: roomDecorDensity(g, 'bedroom_player'),
           placed, packedBefore, packedAfter: packedAfter.length, packedHasIt: packedAfter.some(pl => pl.objId === r.id), sp, pos: obj.pos, player: roomPlayerDesignCount(g, 'bedroom_player') };
})()`);
check('a placed catalog piece (the real placeDecorItem) makes an auto room designed: base null, one placement at its pos, density 1/8, the player\'s',
  p.ok && p.designed && p.base === null && p.density === 0.125 && p.placed.length === 1 && p.placed[0].shape === 'plant' && p.placed[0].x === p.pos.x && p.player === 1, JSON.stringify(p));
check('the packer no longer claims a wall for it (invariant 2: drawn where walked-to) and the anchor resolver reads its pos',
  p.packedAfter === p.packedBefore && !p.packedHasIt && Math.abs(p.sp.x - (p.pos.x + p.pos.w / 2)) <= p.pos.w && Math.abs(p.sp.y - (p.pos.y + p.pos.h / 2)) <= p.pos.h + 4, JSON.stringify({ sp: p.sp, pos: p.pos, packedBefore: p.packedBefore, packedAfter: p.packedAfter }));

// ---------------------------------------------------------------- 3
console.log('\n3. Comfort (D51): one impulse, sized by density, nothing for an auto room');
const c = J(`(() => {
  const g = __mk(3, 0, 3);
  g.player.moodEvents = [];
  const auto = applyDesignedRoomComfort(g, 'kitchen', 3);
  const autoEvents = g.player.moodEvents.length;
  __furnish(g, 'bedroom_player', ['plant']);
  const one = designedRoomComfort(g, 'bedroom_player');
  const pushed = applyDesignedRoomComfort(g, 'bedroom_player', 3);
  const oneEvents = g.player.moodEvents.slice();
  __furnish(g, 'bedroom_player', ['floor_lamp', 'rug', 'armchair', 'nightstand', 'bookshelf', 'shelf', 'desk_chair', 'coffee_table']);
  const full = designedRoomComfort(g, 'bedroom_player');
  const density = roomDecorDensity(g, 'bedroom_player');
  g.player.moodEvents = [];
  applyDesignedRoomComfort(g, 'bedroom_player', 3);
  const term = advanceMoodEvents(g.player.moodEvents, 3).eventTerm;
  return { auto, autoEvents, one, pushed, oneEvents, full, density, n: decorFor(g, 'bedroom_player').length, term, authored: designedRoomComfort(g, 'pool_room') };
})()`);
check('an auto-arranged room grants nothing and pushes no event; one plant is designedRoomMood/8 = 0.0025, pushed as exactly one moodEvents entry',
  c.auto === 0 && c.autoEvents === 0 && c.one === 0.0025 && c.pushed === 0.0025 && c.oneEvents.length === 1 && c.oneEvents[0].delta === 0.0025 && c.oneEvents[0].day === 3, JSON.stringify(c));
check('nine placements cap density at 1: the full 0.02, and advanceMoodEvents reads it back as the event term; the authored pool room grants 0.02 × 6/8',
  c.n === 9 && c.density === 1 && c.full === 0.02 && Math.abs(c.term - 0.02) < 1e-9 && c.authored === 0.015, JSON.stringify(c));

// ---------------------------------------------------------------- 4
console.log('\n4. Room opinions (D52): perception, style match, supersession');
api(`
  __roomScene = (seed) => {
    const g = __mk(seed || 4, 3, 3);
    const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
    const [A, B, C] = ids;
    // A and B are the SAME person (bible cloned, genSeed shared → identical
    // jitter) but for their occupation's style lean; C sleeps in the room.
    g.npcs[B] = JSON.parse(JSON.stringify(g.npcs[A]));
    g.npcs[A].bible.occupation = { ...(g.npcs[A].bible.occupation || {}), styleLean: ['cozy', 'soft'] };
    g.npcs[B].bible.occupation = { ...(g.npcs[B].bible.occupation || {}), styleLean: ['sharp', 'sporty'] };
    g.player.location = 'living_room';
    for (const id of [A, B]) { g.npcs[id].location = 'living_room'; g.npcs[id].activity = 'idle'; g.npcs[id].needs.energy = 80; g.npcs[id].memory.facts = []; }
    g.npcs[C].location = 'living_room'; g.npcs[C].activity = 'sleeping'; g.npcs[C].memory.facts = [];
    // A cozy/soft room: rug, armchair, plant, lamp ×2 → dominant cozy/soft.
    __furnish(g, 'living_room', ['rug', 'armchair', 'plant', 'floor_lamp', 'floor_lamp', 'sofa_basic', 'coffee_table', 'tv_basic']);
    return { g, A, B, C };
  };
`);
const o = J(`(() => {
  const { g, A, B, C } = __roomScene(4);
  const weights = roomStyleWeights(g, 'living_room');
  const qA = roomDesignQuality(g, 'living_room', g.npcs[A]);
  const qB = roomDesignQuality(g, 'living_room', g.npcs[B]);
  const r1 = noticeRoomDesign(g, 'living_room', 3);
  const a = __opinions(g.npcs[A]), b = __opinions(g.npcs[B]), c = __opinions(g.npcs[C]);
  const r2 = noticeRoomDesign(g, 'living_room', 3);
  const key = r1.key;
  // The design changes: a bookshelf goes in → a new version, a new judgement that supersedes the old.
  __furnish(g, 'living_room', ['bookshelf']);
  const r3 = noticeRoomDesign(g, 'living_room', 4);
  const a2 = __opinions(g.npcs[A]);
  const sig = (g.world.signals && (g.world.signals.transient || g.world.signals.transients || [])) || [];
  return { weights, qA, qB, r1, a, b, c: c.length, r2: r2.perceivers.length, key, r3key: r3.key, r3n: r3.perceivers.length,
           a2: a2.map(f => ({ key: f.subject.key, valid: f.valid !== false, valence: f.valence })), density: roomDecorDensity(g, 'living_room') };
})()`);
check('the room\'s style is a weight map over DESIGN_STYLE_TAGS (cozy and soft dominate this one); the cozy/soft NPC reads a higher quality than the sharp/sporty one, at the same density',
  o.weights.cozy > 0.2 && o.weights.soft > 0.2 && (o.weights.sharp || 0) === 0 && o.qA > o.qB && o.qA <= 1 && o.qB >= 0.4, JSON.stringify({ weights: o.weights, qA: o.qA, qB: o.qB }));
check('walking in notices the room for the two awake NPCs and not the sleeping one: one opinion fact each, the plan\'s record shape, keyed room_design:<room>:<version>, category home',
  o.r1.perceivers.length === 2 && o.a.length === 1 && o.b.length === 1 && o.c === 0
  && o.a[0].kind === 'opinion' && o.a[0].subject.kind === 'room_design' && o.a[0].subject.ref === 'living_room' && /^room_design:living_room:[0-9a-z]+$/.test(o.a[0].subject.key)
  && o.a[0].category === 'home' && o.a[0].provenance === 'witnessed' && /living room/.test(o.a[0].text) && typeof o.a[0].valence === 'number', JSON.stringify({ r1: o.r1, a: o.a, b: o.b }));
check('the NPC whose styleLean matches the room forms the HIGHER valence (identical bible otherwise, shared jitter)',
  o.a[0].valence > o.b[0].valence, `A ${o.a[0].valence} (${o.a[0].text}) vs B ${o.b[0].valence} (${o.b[0].text})`);
check('re-entering the same design is a no-op; a changed design is a new version whose opinion supersedes the old one (the old fact valid:false, one live opinion per room)',
  o.r2 === 0 && o.r3key !== o.key && o.r3n === 2 && o.a2.length === 2 && o.a2.filter(f => f.valid).length === 1 && o.a2.find(f => f.valid).key === o.r3key, JSON.stringify(o.a2));
const pr = J(`(() => {
  const g = __mk(5, 2, 3);
  const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  for (const id of ids) { g.npcs[id].location = 'pool_room'; g.npcs[id].activity = 'idle'; g.npcs[id].needs.energy = 80; g.npcs[id].memory.facts = []; }
  g.player.location = 'pool_room';
  const r = noticeRoomDesign(g, 'pool_room', 3);
  const none = ids.every(id => __opinions(g.npcs[id]).length === 0);
  const un = noticeRoomDesign(g, 'kitchen', 3);
  return { key: r.key, n: r.perceivers.length, none, unKey: un.key, unN: un.perceivers.length, designed: roomDesigned(g, 'pool_room') };
})()`);
check('the authored pool room is designed but not the player\'s doing — no subject, no opinions; an undesigned room likewise',
  pr.designed && pr.key === null && pr.n === 0 && pr.none && pr.unKey === null && pr.unN === 0, JSON.stringify(pr));
const lines = J(`(() => {
  const g = __mk(6, 1, 3);
  const npc = Object.values(g.npcs).find(n => n.bible);
  const subject = { kind: 'room_design', ref: 'study', roomId: 'study', day: 3, category: 'home', meta: { version: 'abc', label: 'study' } };
  return [0.9, 0.3, 0, -0.3, -0.9].map(v => opinionLine(subject, v, g));
})()`);
check('every band phrases the room by name, claim-style (D65)', lines.length === 5 && lines.every(l => /study/.test(l) && /player/.test(l)) && new Set(lines).size >= 4, JSON.stringify(lines));

// ---------------------------------------------------------------- 5
console.log('\n5. Hanging a piece (D54)');
const h = J(`(() => {
  const g = __mk(7, 1, 3);
  g.player.money = 1000;
  g.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 };
  const npcId = Object.keys(g.npcs).find(id => id.startsWith('npc_'));
  g.npcs[npcId].location = 'living_room'; g.npcs[npcId].activity = 'idle'; g.npcs[npcId].needs.energy = 80; g.npcs[npcId].memory.facts = [];
  g.player.location = 'living_room';
  chooseDirections(g, ['comfort']);
  const w = __piece(g, 'Tidewater', 0.9);
  const slots = wallSlotsFor('living_room');
  const bath = wallSlotsFor('bathroom_a');
  const held = !!pieceItemStack(g.player, w.id);
  const qBefore = roomDesignQuality(g, 'living_room', g.npcs[npcId]);
  const vBefore = roomDesignVersion(g, 'living_room');
  const bad = hangWork(g, w.id, 'living_room', 'w');
  const r = hangWork(g, w.id, 'living_room', 'n');
  const obj = r.ok && JSON.parse(JSON.stringify(g.objects.room_living_room[r.id]));
  const bagAfter = !!pieceItemStack(g.player, w.id);
  const opinion = __opinions(g.npcs[npcId]).length;
  const again = __piece(g, 'Second', 0.5);
  const taken = hangWork(g, again.id, 'living_room', 'n');
  const qAfter = roomDesignQuality(g, 'living_room', g.npcs[npcId]);
  const vAfter = roomDesignVersion(g, 'living_room');
  const asp = checkAspirations(g, 3);
  const placedArt = roomPlacedDecor(g, 'living_room').filter(p => p.shape === 'player_art').length;
  const hung = hungPieces(g);
  const hungArt = ASP.hungArt(g);
  const work = JSON.parse(JSON.stringify(g.player.works.find(x => x.id === w.id)));
  const dn = takeDownWork(g, r.id);
  const back = pieceItemStack(g.player, w.id);
  const objGone = !g.objects.room_living_room[r.id];
  const hungAfter = hungPieces(g).length;
  // The sale needs the D19 gate (art 3 / art rep 20) — hanging never did.
  g.player.skills = { art: SKILLS.xpPerLevelBase * 4 * 4 }; Object.assign(g.world.computer.apps.gigs.reputation, { art: 25 });
  const sold = sellWork(g, w.id);
  return { slots: slots.map(s => s.id), bath: bath.map(s => s.id), held, bad: bad.reason, r: { ok: r.ok, slot: r.slot && r.slot.id, noticed: r.noticed.perceivers.length },
           obj: obj && { defId: obj.defId, pos: obj.pos, meta: obj.meta, bucket: obj.bucket }, slotRect: slots.find(s => s.id === 'n'),
           bagAfter, work, taken: taken.reason, hung, hungArt, completed: asp.completed.map(c => c.id), qBefore, qAfter, vBefore, vAfter, placedArt, opinion,
           dn, back: back && back.meta, hungAfter, sold: sold.ok, money: sold.price, objGone };
})()`);
check('the L-shaped living room offers north/east/south only (the west line is an interior seam); a bathroom offers all four',
  JSON.stringify(h.slots) === '["n","e","s"]' && JSON.stringify(h.bath) === '["n","e","s","w"]', JSON.stringify({ slots: h.slots, bath: h.bath }));
check('hangWork: a bad wall is refused; the north wall takes it — a player_art object with meta.workId and the slot\'s pos in the room bucket, the stack out of the bag, the NPC in the room notices',
  h.held && /wall/i.test(h.bad) && h.r.ok && h.r.slot === 'n' && h.obj && h.obj.defId === 'player_art' && h.obj.meta.workId === h.work.id && h.obj.meta.slot === 'n'
  && h.obj.pos.x === h.slotRect.x && h.obj.pos.y === h.slotRect.y && h.obj.pos.w === h.slotRect.w && h.obj.bucket === 'room_living_room' && !h.bagAfter && h.r.noticed === 1 && h.opinion === 1, JSON.stringify({ r: h.r, obj: h.obj, slot: h.slotRect, bad: h.bad }));
check('the work stays in the catalog unreleased at reach 0; a taken slot refuses a second piece; hungPieces / ASP.hungArt see it and `comf_hang_art` completes',
  h.work.releasedDay === null && h.work.reach === 0 && /already/.test(h.taken) && h.hung.length === 1 && h.hung[0].roomId === 'living_room' && h.hung[0].workId === h.work.id
  && h.hungArt === 1 && h.completed.includes('comf_hang_art'), JSON.stringify({ work: h.work, taken: h.taken, hung: h.hung, completed: h.completed }));
check('the hung piece is a placement (decorFor), a new design version, and its 0.9 quality lifts the room\'s reading',
  h.placedArt === 1 && h.vAfter !== h.vBefore && h.qAfter > h.qBefore, JSON.stringify({ qBefore: h.qBefore, qAfter: h.qAfter }));
check('takeDownWork returns the stack with its meta (workId, title, quality), removes the object, and the piece then sells for its price',
  h.dn.ok && h.dn.workId === h.work.id && h.back && h.back.workId === h.work.id && h.back.title === 'Tidewater' && h.back.quality === 0.9 && h.hungAfter === 0 && h.objGone && h.sold && h.money > 0, JSON.stringify({ dn: h.dn, back: h.back, sold: h.sold, money: h.money }));

// ---------------------------------------------------------------- 6
console.log('\n6. Compass and the save round-trip');
const s = J(`(() => {
  const g = __mk(8, 0, 3);
  const zero = ASP.roomsDesigned(g, 2);
  __furnish(g, 'study', ['desk', 'desk_chair']);
  const one = ASP.roomsDesigned(g, 2);
  g.world.roomDecorOverrides = { bedroom_2: [ { shape: 'bed', x: 170, y: 525, w: 26, h: 34, rot: 0 }, { shape: 'nightstand', x: 200, y: 525, w: 9, h: 9, rot: 0 } ] };
  const two = ASP.roomsDesigned(g, 2);
  const w = __piece(g, 'Hung', 0.7);
  const r = hangWork(g, w.id, 'study', 's');
  const payload = JSON.parse(JSON.stringify(captureSavePayload(g)));
  const fresh = __mk(9, 0, 3);
  const freshPayload = captureSavePayload(fresh);
  return { zero, one, two, overrides: payload.world.roomDecorOverrides, hung: Object.values(payload.objects.room_study || {}).filter(o => o.defId === 'player_art').length,
           freshFallback: JSON.stringify(freshPayload.world.roomDecorOverrides) };
})()`);
check('ASP.roomsDesigned counts rooms with ≥ 2 of the player\'s own placements — placed pieces or an override; the pool room never counts',
  s.zero === 0 && s.one === 1 && s.two === 2, JSON.stringify({ zero: s.zero, one: s.one, two: s.two }));
check('the override rides world.roomDecorOverrides through captureSavePayload; the hung piece rides the objects folder; a state without the key saves the {} fallback',
  s.overrides && Array.isArray(s.overrides.bedroom_2) && s.overrides.bedroom_2.length === 2 && s.hung === 1 && s.freshFallback === '{}', JSON.stringify({ overrides: s.overrides, hung: s.hung, fresh: s.freshFallback }));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
