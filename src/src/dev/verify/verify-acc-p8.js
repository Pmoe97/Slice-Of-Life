// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 8: Food —
// the home kitchen on DoorDrop (D24, D25, D81–D84).
//
//   node src/src/dev/verify/verify-acc-p8.js
//
// Node coverage for everything pure in this phase: the runtime vendor
// (playerKitchenDef — null until the kitchen is open, then a
// RESTAURANT_DEFS-shaped entry with an EMPTY menu, appended by
// restaurantVendorsForDisplay and never present in RESTAURANT_DEFS_LIST /
// RESTAURANT_DISH_IDS) with the ≥2-open invariant holding at every
// half-hour with the listing present; opening the kitchen behind the D19
// `menu` gate under a free-text name; listing dishes (one `menu` work per
// recipe, released at the kind's releaseReach, duplicates refused, NO
// release notice — a dish is noticed by whoever eats it); orders/day at
// reach 50 vs 200 scaling linearly over 300 seeded days; a kitchen at
// cleanliness 0.3 receiving ~30% of a clean kitchen's orders; an
// unfulfilled day dropping reach by unfulfilledReachLoss per missed order;
// a real cook through the self.cook action's effect pipeline (ingredients
// destroyed from the fridge, the plate landing where the cook leaves it)
// followed by fulfilment drawing a serving from that plate, crediting the
// order's price through EARN_MONEY (money and taxes agree), rating the
// order at the plate's quality and growing regulars; a housemate's cast
// order (D84) noticed by THEM when it is filled (D83's perceiverIds — a
// work:<id> opinion, category food, via 'consumed') and by nobody else; the
// generator's idempotence; and a save round-trip of player.kitchen. The
// Works-tab Kitchen section and DoorDrop's greyed listing are verified on
// the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'cooking.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'state.js'],
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
  __ready = (g) => { __setLevel(g, 'cooking', 5); __setRep(g, { food: 25 }); };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion');
  __residents = (g) => Object.entries(g.npcs).filter(([id, n]) => id.startsWith('npc_') && n.residency && n.residency.status === 'resident').map(([id]) => id);
  // Force the kitchen's cleanliness score for the generator (a test double
  // over WORLD's refreshRoomCleanliness — the contract under test is the
  // multiplier, not the score's derivation, which the perception plan owns).
  __withCleanliness = (score, fn) => { const orig = refreshRoomCleanliness; refreshRoomCleanliness = () => score; try { return fn(); } finally { refreshRoomCleanliness = orig; } };
  // Run the day's orders on a kitchen with one dish at a given reach.
  __ordersOver = (seed, reach, days, score) => __withCleanliness(score, () => {
    const g = __mk(seed, 1); __ready(g);
    openKitchen(g, 'Test Kitchen'); const l = listDish(g, 'pasta');
    const dish = listedDishes(g.player)[0];
    let total = 0;
    for (let d = 2; d <= days + 1; d++) {
      dish.reach = reach; dish.lastDecayDay = d; ensurePlayerKitchen(g.player).orders = [];   // hold reach fixed; drop yesterday's queue
      g.meta.clock.day = d;
      const created = generateKitchenOrdersForDay(g, d).filter(o => !o.customerId);
      total += created.length;
    }
    return total / days;
  });
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — the runtime vendor, the tuning, the wiring. ${loaded.length} engine files loaded.`);
const reg = J(`(() => {
  const g = __mk(1, 1);
  const before = playerKitchenDef(g);
  __ready(g); openKitchen(g, 'Salt & Rent Kitchen');
  const def = playerKitchenDef(g);
  const vendors = restaurantVendorsForDisplay(g);
  let minOpen = 99; for (let m = 0; m < 1440; m += 30) minOpen = Math.min(minOpen, countRestaurantsOpenAt(m));
  let minOpenWithMine = 99; for (let m = 0; m < 1440; m += 30) minOpenWithMine = Math.min(minOpenWithMine, vendors.filter(v => isRestaurantOpen(v, m)).length);
  return { before, def, staticHasMine: RESTAURANT_DEFS_LIST.some(v => v.id === 'player_kitchen') || !!RESTAURANT_DEFS.player_kitchen, vendors: vendors.length, authored: RESTAURANT_DEFS_LIST.length, minOpen, minOpenWithMine, tuning: WORKS_TUNING.kitchen, price: [WORK_KINDS.menu.orderPrice(0.68, 25), WORK_KINDS.menu.orderPrice(1, 100)], noticeOnRelease: WORK_KINDS.menu.noticeOnRelease };
})()`);
check('playerKitchenDef is null before the kitchen opens and a RESTAURANT_DEFS-shaped entry after — id player_kitchen, the typed name, an EMPTY menu, all-day hours, player: true', reg.before === null && reg.def && reg.def.id === 'player_kitchen' && reg.def.label === 'Salt & Rent Kitchen' && reg.def.menu.length === 0 && reg.def.player === true && JSON.stringify(reg.def.hours) === '[0,1410]', JSON.stringify(reg.def));
check('the listing is appended at READ time only: restaurantVendorsForDisplay = the 12 authored + 1; RESTAURANT_DEFS/RESTAURANT_DEFS_LIST never contain it', reg.staticHasMine === false && reg.vendors === reg.authored + 1 && reg.authored === 12, JSON.stringify([reg.staticHasMine, reg.vendors, reg.authored]));
check('the ≥2-open-restaurants invariant holds at every half-hour, both on the authored roster and with the player listing present', reg.minOpen >= 2 && reg.minOpenWithMine >= 2, JSON.stringify([reg.minOpen, reg.minOpenWithMine]));
check('WORKS_TUNING.kitchen carries regularGain / unfulfilledReachLoss / residentOrderChance / minCleanliness; orderPrice(0.68, 25) = 19, (1, 100) = 28; menu skips the release notice', reg.tuning.regularGain > 0 && reg.tuning.unfulfilledReachLoss > 0 && reg.tuning.unfulfilledReachLoss < 1 && reg.tuning.residentOrderChance > 0 && reg.tuning.minCleanliness > 0 && JSON.stringify(reg.price) === '[19,28]' && reg.noticeOnRelease === false, JSON.stringify([reg.tuning, reg.price]));
const rcSrc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
check("DoorDrop's browse reads restaurantVendorsForDisplay and renders the player's row greyed with a \"That's you\" pill and no menu button; the Works tab renders renderKitchenSection", /restaurantVendorsForDisplay\(gs\)/.test(rcSrc) && /That\\'s you/.test(rcSrc) && /if \(def\.player\) \{/.test(rcSrc) && /renderKitchenSection\(body, gs\)/.test(rcSrc) && /function renderKitchenSection/.test(rcSrc));
check("ui.js dispatches kitchen-open-start → openKitchenModal, confirm-kitchen-open → doOpenKitchen, kitchen.list-dish → doListDish, kitchen.fulfill → doFulfillOrder; list/fulfil are energy-exempt clicks", /case 'kitchen-open-start':\r?\n\s*openKitchenModal\(\)/.test(uiSrc) && /case 'confirm-kitchen-open':\r?\n\s*await doOpenKitchen\(\)/.test(uiSrc) && /case 'kitchen\.list-dish':\r?\n\s*await doListDish\(extra\?\.rowId\)/.test(uiSrc) && /case 'kitchen\.fulfill':\r?\n\s*await doFulfillOrder\(extra\?\.rowId\)/.test(uiSrc) && /'kitchen\.list-dish', 'kitchen\.fulfill',/.test(uiSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Opening and listing — the D19 gate, a free-text name, one menu work per recipe, no release notice');
const open = J(`(() => {
  const g = __mk(2, 1);
  const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_')); const A = ids[0];
  g.player.location = 'living_room'; g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'idle'; g.npcs[A].needs.energy = 80;
  __setLevel(g, 'cooking', 5); __setRep(g, { food: 10 });
  const gated = openKitchen(g, 'Too Soon');
  __setRep(g, { food: 25 });
  const empty = openKitchen(g, '   ');
  const ok = openKitchen(g, "Ma's Table 🍲");
  const twice = openKitchen(g, 'Again');
  const bad = listDish(g, 'not_a_recipe');
  const l1 = listDish(g, 'pasta'); const l2 = listDish(g, 'omelette'); const dup = listDish(g, 'pasta');
  const dishes = listedDishes(g.player).map(d => ({ id: d.id, kind: d.kind, title: d.title, recipe: d.meta.recipeId, released: d.releasedDay, reach: d.reach, quality: d.quality }));
  const expectedReach = WORK_KINDS.menu.releaseReach(SKILL_CURVES.craftQuality[5], 25);
  return { gated: [gated.ok, gated.reason], empty: [empty.ok, empty.reason], ok: ok.ok, name: g.player.kitchen.name, listedDay: g.player.kitchen.listedDay, twice: twice.ok, bad: bad.ok, l1: [l1.ok, l1.reach], l2: l2.ok, dup: [dup.ok, dup.reason], dishes, expectedReach, witnessOpinions: __opinions(g.npcs[A]).length, wip: g.player.workInProgress.length };
})()`);
check('cooking 5 / food rep 10 → refused naming the reputation; an empty name refused; food rep 25 → open under the typed name (emoji and all); a second open refused', open.gated[0] === false && /Food reputation 10\/20/.test(open.gated[1]) && open.empty[0] === false && open.ok === true && open.name === "Ma's Table 🍲" && open.listedDay === 1 && open.twice === false, JSON.stringify([open.gated, open.empty, open.name, open.twice]));
check(`listing pasta and omelette makes two released menu works (recipeId on meta, reach = releaseReach(craftQuality[5], 25) = ${open.expectedReach}, no production step); an unknown recipe and a duplicate are refused`, open.l1[0] && open.l1[1] === open.expectedReach && open.l2 === true && open.bad === false && open.dup[0] === false && /already on the menu/.test(open.dup[1]) && open.dishes.length === 2 && open.dishes.every(d => d.kind === 'menu' && d.released === 1 && d.reach === open.expectedReach) && open.dishes[0].recipe === 'pasta' && open.wip === 0, JSON.stringify(open.dishes));
check('listing fires NO notice — the housemate in the room holds no opinion of an unfilled menu line', open.witnessOpinions === 0, String(open.witnessOpinions));

// ---------------------------------------------------------------- 2
console.log('\n2. Orders per day scale with reach (50 vs 200, ~4×) and with cleanliness (a 0.3 kitchen gets ~30% of a clean one), seeded and idempotent (D24/D25)');
const scale = J(`({
  r50: __ordersOver(3, 50, 300, 100), r200: __ordersOver(3, 200, 300, 100),
  clean: __ordersOver(4, 100, 300, 100), dirty: __ordersOver(4, 100, 300, 30),
  expected50: 50 * WORK_KINDS.menu.ordersPerReach, expected200: 200 * WORK_KINDS.menu.ordersPerReach,
})`);
check(`reach 50 → ${scale.r50.toFixed(2)} orders/day and reach 200 → ${scale.r200.toFixed(2)} over 300 days: each within ±15% of reach × ordersPerReach (${scale.expected50} / ${scale.expected200}), ratio ≈ 4`, Math.abs(scale.r50 - scale.expected50) <= 0.15 * scale.expected50 && Math.abs(scale.r200 - scale.expected200) <= 0.15 * scale.expected200 && scale.r200 / scale.r50 > 3.4 && scale.r200 / scale.r50 < 4.6, JSON.stringify(scale));
check(`a kitchen scoring 30 gets ~30% of a clean kitchen's orders (${scale.dirty.toFixed(2)} vs ${scale.clean.toFixed(2)})`, scale.dirty / scale.clean > 0.2 && scale.dirty / scale.clean < 0.4, JSON.stringify([scale.dirty, scale.clean]));
const idem = J(`(() => {
  const g = __mk(5, 1); __ready(g); openKitchen(g, 'K'); listDish(g, 'pasta');
  g.meta.clock.day = 2;
  const a = generateKitchenOrdersForDay(g, 2).length; const b = generateKitchenOrdersForDay(g, 2).length;
  const g2 = __mk(5, 1); __ready(g2); openKitchen(g2, 'K'); listDish(g2, 'pasta'); g2.meta.clock.day = 2;
  const c = generateKitchenOrdersForDay(g2, 2).map(o => o.id + ':' + o.recipeId + ':' + o.price);
  return { a, b, same: JSON.stringify(c) === JSON.stringify(ensurePlayerKitchen(g.player).orders.map(o => o.id + ':' + o.recipeId + ':' + o.price)), ids: c };
})()`);
check('the generator is idempotent within a day and deterministic across houses on the same seed; orders carry id/recipeId/price', idem.b === 0 && idem.same === true && idem.ids.every(s => /^ord_2_\d+:pasta:\d+$/.test(s)), JSON.stringify(idem));

// ---------------------------------------------------------------- 3
console.log('\n3. Cook → fulfil — a real self.cook through the effects pipeline, then the order draws a serving, pays through EARN_MONEY, rates, grows regulars; a missed day drops reach');
const cook = J(`(() => {
  const g = __mk(6, 1); __ready(g); openKitchen(g, 'K'); listDish(g, 'pasta');
  const dish = listedDishes(g.player)[0];
  const reach0 = dish.reach;
  // Stock the fridge with the recipe's ingredients, then cook through the
  // real action: prepare (bare, no picker) + buildEffects + applyEffects.
  const fridge = findObjectByDefIdLive(g, 'fridge');
  for (const ing of RECIPES.pasta.ingredients) fridge.contents = addStack(fridge.contents, ing.defId, ing.qty, null, {}, 1);
  const fridgeBefore = fridge.contents.map(s => s.defId + 'x' + s.qty);
  g.player.location = 'kitchen';
  const ctx = { gameState: g, roomId: 'kitchen', roomObjects: g.objects.room_kitchen || {}, presentNpcIds: [] };
  const def = ACTION_DEFS['self.cook'];
  const plan = planCook(RECIPES.pasta, g, { auto: true, seed: 11 });
  const outcome = resolveCookPlan(plan, g);
  const plate = buildPlate(g, RECIPES.pasta, RECIPES.pasta.ingredients, RECIPES.pasta.method, RECIPES.pasta.cookware, { plan, outcome, seed: 11 });
  const prepared = { recipe: RECIPES.pasta, plan, outcome, seed: 11, plate, seasoning: plan.seasoning };
  const lines = def.buildEffects(ctx, prepared);
  const res = applyEffects(parseEffectDSL(lines.join(String.fromCharCode(10))), buildEffectContext(g, [], [], {}, []));
  const fridgeAfter = fridge.contents.map(s => s.defId + 'x' + s.qty);
  const plateStack = (fridge.contents || []).concat(g.player.inventory).find(s => s.meta && s.meta.plate && s.meta.plate.recipeKey === 'pasta');
  // An order for it.
  g.meta.clock.day = 2;
  const p = processWorksForDay(g, 2);
  const orders = ensurePlayerKitchen(g.player).orders.filter(o => o.status === 'open');
  const order = orders[0] || (() => { const o = { id: 'ord_2_x', workId: dish.id, recipeId: 'pasta', dish: 'Pasta', price: WORK_KINDS.menu.orderPrice(dish.quality, 25), day: 2, status: 'open', customerId: null }; ensurePlayerKitchen(g.player).orders.push(o); return o; })();
  const found = plateForOrder(g.player, order, g);
  const servingsBefore = plateStack && plateStack.meta.plate.servings.left;
  const moneyBefore = g.player.money, grossBefore = g.world.taxes.quarterGross;
  const reachBeforeFill = dish.reach;
  const f = fulfillKitchenOrder(g, order.id);
  const reachAfterFill = dish.reach, lastPromotedAfterFill = dish.lastPromotedDay, ratingAfterFill = kitchenRating(g.player);
  const again = fulfillKitchenOrder(g, order.id);
  // A second order with nothing left to serve.
  const o2 = { id: 'ord_2_y', workId: dish.id, recipeId: 'omelette', dish: 'Omelette', price: 20, day: 2, status: 'open', customerId: null }; ensurePlayerKitchen(g.player).orders.push(o2);
  const noPlate = fulfillKitchenOrder(g, 'ord_2_y');
  // Miss it: roll to day 3.
  const reachBeforeMiss = dish.reach;
  const openBeforeMiss = ensurePlayerKitchen(g.player).orders.filter(o => o.status === 'open').length;
  g.meta.clock.day = 3; const p3 = processWorksForDay(g, 3);
  // Every order still open is missed — each costs unfulfilledReachLoss (compounding), then the day's fade.
  let expectedAfterMiss = reachBeforeMiss;
  for (let i = 0; i < openBeforeMiss; i++) expectedAfterMiss = Math.round(expectedAfterMiss * (1 - WORKS_TUNING.kitchen.unfulfilledReachLoss) * 100) / 100;
  expectedAfterMiss = Math.round(expectedAfterMiss * Math.pow(0.5, 1 / WORKS_TUNING.decayHalfLifeDays) * 100) / 100;
  return { fridgeBefore, fridgeAfter, ingredientsGone: !fridgeAfter.some(s => /^pasta_dry|^tomato_sauce/.test(s)), plateQuality: plate.quality, plateWhere: plateStack ? (fridge.contents.includes(plateStack) ? 'fridge' : 'bag') : 'none', servingsBefore, foundSource: found && found.source.id, f: { ok: f.ok, price: f.price, quality: f.quality, applied: (f.applied || []).map(a => a.type) }, orderPrice: order.price, moneyDelta: g.player.money - moneyBefore, grossDelta: g.world.taxes.quarterGross - grossBefore, servingsAfter: plateStack && plateStack.meta.plate.servings.left, reachGain: Math.round((reachAfterFill - reachBeforeFill) * 100) / 100, expectedGain: Math.round(WORKS_TUNING.kitchen.regularGain * plate.quality * 100) / 100, lastPromoted: lastPromotedAfterFill, rating: ratingAfterFill, openBeforeMiss, again: [again.ok, again.reason], noPlate: [noPlate.ok, noPlate.reason], missed: p3.missed.map(o => o.id), reachAfterMiss: dish.reach, expectedAfterMiss, status: ensurePlayerKitchen(g.player).orders.map(o => o.id + ':' + o.status) };
})()`);
check('the real self.cook pipeline destroyed the ingredients from the fridge and left a pasta plate with servings in the fridge (a serving eaten by the cook)', cook.ingredientsGone === true && cook.plateWhere === 'fridge' && cook.servingsBefore >= 1 && cook.plateQuality > 0, JSON.stringify([cook.fridgeBefore, cook.fridgeAfter, cook.plateWhere, cook.servingsBefore]));
check("fulfilment found the serving in the fridge (kitchenSources' draw order), credited exactly the order's price through EARN_MONEY, taxes agree, one serving left the plate", cook.foundSource && cook.foundSource !== 'player' && cook.f.ok && cook.f.price === cook.orderPrice && cook.moneyDelta === cook.orderPrice && cook.grossDelta === cook.orderPrice && cook.f.applied.includes('EARN_MONEY') && cook.servingsAfter === cook.servingsBefore - 1, JSON.stringify(cook.f));
check(`the order is rated at the plate's quality (${cook.plateQuality}), the kitchen rating reads it, and the dish gained regularGain × quality = ${cook.expectedGain} reach with its fade clock reset`, cook.f.quality === cook.plateQuality && cook.rating === cook.plateQuality && cook.reachGain === cook.expectedGain && cook.lastPromoted === 2, JSON.stringify([cook.f.quality, cook.rating, cook.reachGain, cook.lastPromoted]));
check('a filled order cannot be filled twice; an order with no serving to hand over is refused naming the dish', cook.again[0] === false && /already done/.test(cook.again[1]) && cook.noPlate[0] === false && /Cook Omelette first/.test(cook.noPlate[1]), JSON.stringify([cook.again, cook.noPlate]));
check(`the next rollover marks every still-open order missed (${cook.openBeforeMiss}) and the dish loses unfulfilledReachLoss per miss, then fades (${cook.expectedAfterMiss})`, cook.missed.includes('ord_2_y') && cook.missed.length === cook.openBeforeMiss && Math.abs(cook.reachAfterMiss - cook.expectedAfterMiss) < 0.03 && cook.status.some(s => s === 'ord_2_y:missed'), JSON.stringify([cook.missed, cook.reachAfterMiss, cook.expectedAfterMiss, cook.status]));

// ---------------------------------------------------------------- 4
console.log("\n4. A housemate's order (D84) — a cast order, noticed by them when it is filled (D83), by nobody else");
const cast = J(`(() => {
  const g = __mk(7, 1); __ready(g); openKitchen(g, 'K'); listDish(g, 'pasta');
  const dish = listedDishes(g.player)[0];
  const res = __residents(g);
  const A = res[0], B = res[1];
  for (const id of res) { g.npcs[id].location = 'bedroom_1'; g.npcs[id].activity = 'idle'; }
  g.player.location = 'kitchen';
  // Force a cast order from A (the roll is seeded; this is the record shape under test).
  const order = { id: 'ord_2_c', workId: dish.id, recipeId: 'pasta', dish: 'Pasta', price: 20, day: 2, status: 'open', customerId: A };
  ensurePlayerKitchen(g.player).orders.push(order);
  const plate = buildPlate(g, RECIPES.pasta, RECIPES.pasta.ingredients, RECIPES.pasta.method, RECIPES.pasta.cookware, { seed: 3 });
  g.player.inventory = addStack(g.player.inventory, 'cooked_meal', 1, 'player', { plate, acquiredDay: 2 }, 2);
  g.meta.clock.day = 2;
  const f = fulfillKitchenOrder(g, order.id);
  const opsA = __opinions(g.npcs[A]).map(x => ({ key: x.subject.key, cat: x.category, text: x.text, prov: x.provenance }));
  const opsB = __opinions(g.npcs[B]).length;
  // Over many seeded days, resident orders do arrive at roughly the configured rate.
  let castOrders = 0, days = 0;
  for (let d = 3; d <= 202; d++) { dish.reach = 30; ensurePlayerKitchen(g.player).orders = []; g.meta.clock.day = d; castOrders += generateKitchenOrdersForDay(g, d).filter(o => o.customerId).length; days++; }
  const expectedPerDay = res.length * WORKS_TUNING.kitchen.residentOrderChance * kitchenCleanlinessFactor(g, { refresh: true });
  return { ok: f.ok, via: f.noticed && f.noticed.perceivers.map(p => p.via), opsA, opsB, castRate: castOrders / days, expectedPerDay, residents: res.length };
})()`);
check("filling a housemate's order notices THEM via 'consumed': one work:<id> opinion, category 'food', naming the dish, provenance witnessed; the other resident (behind a door) holds none", cast.ok && JSON.stringify(cast.via) === '["consumed"]' && cast.opsA.length === 1 && cast.opsA[0].cat === 'food' && /cooking "Pasta"/.test(cast.opsA[0].text) && cast.opsA[0].prov === 'witnessed' && cast.opsB === 0, JSON.stringify([cast.via, cast.opsA, cast.opsB]));
check(`cast orders arrive at ~residents × residentOrderChance × cleanliness per dish-day (${cast.castRate.toFixed(2)} vs ${cast.expectedPerDay.toFixed(2)}, ±30%)`, Math.abs(cast.castRate - cast.expectedPerDay) <= 0.3 * cast.expectedPerDay, JSON.stringify([cast.castRate, cast.expectedPerDay, cast.residents]));

// ---------------------------------------------------------------- 5
console.log('\n5. Save round-trip — player.kitchen rides the player record; an old save reads as no kitchen');
const persist = J(`(() => {
  const g = __mk(8, 1); __ready(g); openKitchen(g, 'Kept Kitchen'); listDish(g, 'pasta');
  g.meta.clock.day = 2; processWorksForDay(g, 2);
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const p = rt.player.player;
  const same = JSON.stringify(p.kitchen) === JSON.stringify(g.player.kitchen);
  const old = { ...g.player }; delete old.kitchen;
  const k = ensurePlayerKitchen(old);
  return { same, name: p.kitchen.name, orders: p.kitchen.orders.length, oldOpen: kitchenIsOpen(old), oldShape: Object.keys(k).sort(), vendorOnOld: playerKitchenDef({ player: old }) };
})()`);
check('captureSavePayload → JSON carries player.kitchen (name, orders) byte-identical; a save without it lazily reads as a closed kitchen with the full shape and no vendor', persist.same === true && persist.name === 'Kept Kitchen' && persist.oldOpen === false && JSON.stringify(persist.oldShape) === JSON.stringify(['lastOrdersDay', 'listedDay', 'name', 'orders', 'ratingCount', 'ratingSum']) && persist.vendorOnOld === null, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
