// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 7: Art —
// finish, sell (D23, D79, D80).
//
//   node src/src/dev/verify/verify-acc-p7.js
//
// Node coverage for everything pure in this phase: the player_art item
// def (unpriced, non-stackable, a gift-category thing); finishing a piece
// through the real startWork/workBlock path minting a work AND an
// inventory stack with matching ids (stack.meta.workId === work.id, the
// title and quality snapshotted on the stack, the bag labelling it
// "Painting: <title>" through stackLabel/describeStack); sellWork — refused
// at the D19 gate (art 3 / rep 10), refused for a piece no longer in the
// bag, accepted at art 3 / rep 25 crediting exactly salePrice(q, rep)
// through EARN_MONEY (applied[] carries it, taxes agree), the stack
// removed, the record released at reach 0 with meta.soldDay/soldFor, a
// second sale refused; a sold piece contributing 0 to catalog income and
// untouched by decay; releaseWork/promoteWork refusing pieces; the sale
// noticing the NPC in the room (a work:<id> opinion, category art, naming
// the piece); an inventory round-trip through captureSavePayload carrying
// the stack's meta intact; and source checks on the sketchpad chips (start
// gated on art ≥ WORK_KINDS.piece.minSkill, D79), the modal row, the Sell
// button and its swatch (the Q5 seeded fallback, D80). Presentation is
// verified on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.money = 1000;
    g.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 };
    return g;
  };
  __setLevel = (g, skillId, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skillId] = SKILLS.xpPerLevelBase * level * level; };
  __setRep = (g, map) => { Object.assign(g.world.computer.apps.gigs.reputation, map); };
  __paint = (g, title) => {
    const s = startWork(g, { kind: 'piece', title });
    if (!s.ok) return { ok: false, reason: s.reason };
    let r, clicks = 0;
    do { g.player.energy = 90; r = workBlock(g, s.wip.id, 'computer'); clicks++; } while (r.ok && !r.finished && clicks < 500);
    return { ok: r.ok && r.finished, work: r.work, clicks, blocks: s.wip.blocks };
  };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion');
  __withWitness = (g) => { const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_')); const A = ids[0]; g.player.location = 'living_room'; g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'idle'; g.npcs[A].needs.energy = 80; for (const id of ids.slice(1)) { g.npcs[id].location = 'bedroom_1'; g.npcs[id].activity = 'idle'; } return A; };
  __artStacks = (p) => (p.inventory || []).filter(s => s.defId === 'player_art');
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — player_art, salePrice, the chips/modal/Sell wiring. ${loaded.length} engine files loaded.`);
const reg = J(`({
  def: ITEM_DEFS.player_art,
  inShop: SHOP_CATALOG_LIST.some(d => d.id === 'player_art'),
  sale: [WORK_KINDS.piece.salePrice(0.5, 0), WORK_KINDS.piece.salePrice(1, 0), WORK_KINDS.piece.salePrice(1, 100)],
  rate: WORK_KINDS.piece.ratePerReach,
})`);
check("ITEM_DEFS.player_art: label 'Painting', category gift, non-stackable, unpriced — and NOT in the shop catalog", reg.def && reg.def.label === 'Painting' && reg.def.category === 'gift' && reg.def.stackable === false && reg.def.maxStack === 1 && reg.def.price == null && reg.inShop === false, JSON.stringify(reg.def));
check('salePrice rises with quality and art rep (q 0.5/rep 0 → 160, q 1/rep 0 → 260, q 1/rep 100 → 520); a piece has ratePerReach 0', JSON.stringify(reg.sale) === JSON.stringify([160, 260, 520]) && reg.rate === 0, JSON.stringify(reg.sale));
const renderSrc = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const rcSrc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
check("render.js offers 'Paint a Piece' / 'Paint — \"<title>\"' only with a hobby_sketchpad in the room AND art ≥ WORK_KINDS.piece.minSkill (D79)", /o\.defId === 'hobby_sketchpad'/.test(renderSrc) && /skillLevel\(player, WORK_KINDS\.piece\.skill\) >= WORK_KINDS\.piece\.minSkill/.test(renderSrc) && /action: 'paint-piece', extra/.test(renderSrc) && /paint-piece-start/.test(renderSrc));
check("ui.js: paint-piece-start → openWorkStartModal('piece'), confirm-paint-piece → doStartWorkFromModal('piece'), paint-piece → doWorkBlock(offline), works.sell → doWorkSell (energy-exempt); WORK_START_COPY has a piece row", /case 'paint-piece-start':\r?\n\s*openWorkStartModal\('piece'\)/.test(uiSrc) && /case 'confirm-paint-piece':\r?\n\s*await doStartWorkFromModal\('piece'\)/.test(uiSrc) && /case 'paint-piece':\r?\n\s*await doWorkBlock\(extra\?\.rowId, 'computer', \{ offline: true \}\)/.test(uiSrc) && /case 'works\.sell':\r?\n\s*await doWorkSell\(extra\?\.rowId\)/.test(uiSrc) && /'works\.sell',/.test(uiSrc) && /piece: \{ heading: 'Paint a piece'/.test(uiSrc));
check("the Works tab gives a finished piece a seeded swatch (D80) and a 'Sell for <price>' button on works.sell, disabled at the gate or when the item is gone", /w\.kind === 'piece'\) \{\r?\n\s*card\.classList\.add\('ink-card'\);\r?\n\s*card\.appendChild\(bookCoverSwatch\(w\)\)/.test(rcSrc) && /data-action', 'works\.sell'/.test(rcSrc) && /if \(!gate\.ok \|\| !held\) sell\.disabled = true/.test(rcSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Finishing a piece mints a work AND an item with matching ids (D23); the bag names it by its title');
const fin = J(`(() => {
  const g = __mk(41, 1);
  __setLevel(g, 'art', 4);
  const bagBefore = __artStacks(g.player).length;
  const p = __paint(g, 'Harbour at Dusk');
  const stack = pieceItemStack(g.player, p.work.id);
  const bag = __artStacks(g.player);
  const desc = describeStack(stack, { day: 1 });
  const p2 = __paint(g, 'Second Study');
  return { bagBefore, ok: p.ok, blocks: p.blocks, quality: p.work.quality, expectedQuality: Math.round(SKILL_CURVES.craftQuality[4] * 100) / 100, workId: p.work.id, itemDefId: p.work.meta.itemDefId, stack: stack && { defId: stack.defId, qty: stack.qty, meta: stack.meta, ownerId: stack.ownerId }, bagCount: bag.length, label: stackLabel(stack), descLabel: desc.label, two: __artStacks(g.player).map(s => s.meta.workId), released: p.work.releasedDay, reach: p.work.reach };
})()`);
check('a piece rolls 4–10 blocks and finishes at craftQuality[4] = 0.68, unreleased at reach 0', fin.ok === true && fin.blocks >= 4 && fin.blocks <= 10 && fin.quality === fin.expectedQuality && fin.released === null && fin.reach === 0, JSON.stringify([fin.blocks, fin.quality, fin.released]));
check('one player_art stack appears in the bag with meta.workId === the work id, the title and quality snapshotted, owned by the player; the work records its itemDefId', fin.bagBefore === 0 && fin.bagCount === 1 && fin.stack && fin.stack.defId === 'player_art' && fin.stack.qty === 1 && fin.stack.meta.workId === fin.workId && fin.stack.meta.title === 'Harbour at Dusk' && fin.stack.meta.quality === fin.quality && fin.stack.ownerId === 'player' && fin.itemDefId === 'player_art', JSON.stringify(fin.stack));
check('stackLabel and describeStack read "Painting: Harbour at Dusk" (the titled-instance rule); a second piece is a second stack', fin.label === 'Painting: Harbour at Dusk' && fin.descLabel === 'Painting: Harbour at Dusk' && JSON.stringify(fin.two) === JSON.stringify(['work_1', 'work_2']), JSON.stringify([fin.label, fin.descLabel, fin.two]));

// ---------------------------------------------------------------- 2
console.log('\n2. Selling — the D19 gate, the price, the money path, the item gone, the record released at reach 0 (D23)');
const sell = J(`(() => {
  const g = __mk(42, 1);
  const A = __withWitness(g);
  __setLevel(g, 'art', 3); __setRep(g, { art: 10 });
  const p = __paint(g, 'Blue Hour');
  const gated = sellWork(g, p.work.id);
  const rel = releaseWork(g, p.work.id);
  const pro = promoteWork(g, p.work.id, 'computer');
  __setRep(g, { art: 25 });
  const expectedPrice = WORK_KINDS.piece.salePrice(p.work.quality, 25);
  const moneyBefore = g.player.money, grossBefore = g.world.taxes.quarterGross;
  const moodBefore = (g.player.moodEvents || []).length;
  const r = sellWork(g, p.work.id);
  const w = g.player.works.find(x => x.id === p.work.id);
  const again = sellWork(g, p.work.id);
  const ops = __opinions(g.npcs[A]).filter(f => f.subject.key === 'work:' + p.work.id).map(f => ({ text: f.text, cat: f.category }));
  // A sold piece earns nothing further and decay leaves it alone.
  g.meta.clock.day = 10;
  const inc = catalogIncomeForDay(g, 10);
  const moved = decayWorks(g, 10);
  // A piece that left the bag (given away / dropped) cannot be sold.
  const p2 = __paint(g, 'Gone');
  g.player.inventory = g.player.inventory.filter(s => !(s.defId === 'player_art' && s.meta.workId === p2.work.id));
  const gone = sellWork(g, p2.work.id);
  return { gated: [gated.ok, gated.reason], rel: [rel.ok, rel.reason], pro: [pro.ok, pro.reason], r: { ok: r.ok, price: r.price, applied: (r.applied || []).map(a => a.type), noticed: r.noticed.perceivers.length }, expectedPrice, moneyDelta: g.player.money - moneyBefore, grossDelta: g.world.taxes.quarterGross - grossBefore, moodMoved: (g.player.moodEvents || []).length > moodBefore, bag: __artStacks(g.player).map(s => s.meta.workId), w: { releasedDay: w.releasedDay, reach: w.reach, earned: w.earned, sold: w.meta.soldDay, soldFor: w.meta.soldFor }, again: [again.ok, again.reason], ops, incRows: inc.byWork.length, moved: moved.length, gone: [gone.ok, gone.reason] };
})()`);
check('at art 3 / rep 10 the sale is refused naming the reputation; releaseWork and promoteWork both refuse a piece', sell.gated[0] === false && /Art reputation 10\/20/.test(sell.gated[1]) && sell.rel[0] === false && /sold/.test(sell.rel[1]) && sell.pro[0] === false && /no audience|isn't out yet/.test(sell.pro[1]), JSON.stringify([sell.gated, sell.rel, sell.pro]));
check(`at art 3 / rep 25 the sale credits exactly salePrice(q, 25) = ${sell.expectedPrice} through EARN_MONEY (applied[] carries it); player.money and taxes.quarterGross move by it; a mood impulse lands`, sell.r.ok === true && sell.r.price === sell.expectedPrice && sell.moneyDelta === sell.expectedPrice && sell.grossDelta === sell.expectedPrice && sell.r.applied.includes('EARN_MONEY') && sell.moodMoved === true, JSON.stringify(sell.r));
check('the stack leaves the bag; the record is released at reach 0 with earned = price and meta.soldDay/soldFor; a second sale is refused', sell.bag.length === 0 && sell.w.releasedDay === 1 && sell.w.reach === 0 && sell.w.earned === sell.expectedPrice && sell.w.sold === 1 && sell.w.soldFor === sell.expectedPrice && sell.again[0] === false, JSON.stringify([sell.bag, sell.w, sell.again]));
check("the sale notices the NPC in the room: one work:<id> opinion, category 'art', naming piece \"Blue Hour\"", sell.r.noticed === 1 && sell.ops.length === 1 && sell.ops[0].cat === 'art' && /piece "Blue Hour"/.test(sell.ops[0].text), JSON.stringify(sell.ops));
check('a sold piece contributes 0 to catalog income (no row) and decayWorks leaves it alone', sell.incRows === 0 && sell.moved === 0, JSON.stringify([sell.incRows, sell.moved]));
check("a piece no longer in the bag cannot be sold ('you don't have it any more')", sell.gone[0] === false && /have it/.test(sell.gone[1]), JSON.stringify(sell.gone));

// ---------------------------------------------------------------- 3
console.log('\n3. Inventory round-trip — the player_art stack rides the player record with its meta intact; pieceItemStack finds it after a reload');
const persist = J(`(() => {
  const g = __mk(43, 1);
  __setLevel(g, 'art', 5);
  const p = __paint(g, 'Kept');
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const player = rt.player.player;
  const stack = pieceItemStack(player, p.work.id);
  return { same: JSON.stringify(__artStacks(player)) === JSON.stringify(__artStacks(g.player)), found: !!stack, meta: stack && stack.meta, workThere: player.works.some(w => w.id === p.work.id && w.meta.itemDefId === 'player_art') };
})()`);
check('captureSavePayload → JSON carries the stack byte-identical, pieceItemStack finds it on the loaded record, and the work is there with its itemDefId', persist.same === true && persist.found === true && persist.meta.workId === 'work_1' && persist.meta.title === 'Kept' && persist.workThere === true, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
