// Food Overhaul Phase 8 — the recipe website: cards published from the
// cooking engine (D16), unlock-on-taste (D21), Add All Ingredients to
// Cart, and the meal planner's dedupe-and-fill flow (D22).
//
// What this checks:
//   - isRecipeCardId names only RECIPES keys and RESTAURANT_DISH_IDS — a
//     raw ingredient or a freeform plate is never card-eligible.
//   - recipeCardFor/recipeCardsFromEngine: a RECIPES card carries real
//     ingredients/steps/kcal/grade off the live engine (COOKING); a
//     restaurant dish's card has no ingredients/steps (it's delivered
//     whole, never cooked from a list) and reads its kcal straight off
//     ITEM_DEFS.
//   - maybeUnlockRecipeCard, wired into EFFECTS' applyEatItem: eating a
//     cooked plate unlocks its recipeKey, eating a restaurant dish unlocks
//     its own defId, eating a raw ingredient unlocks nothing, and
//     unlocking is idempotent (no duplicate entries).
//   - addRecipeIngredientsToCart / addPlannerIngredientsToCart diff
//     against the WHOLE kitchen (bag + fridge + pantry + freezer) AND
//     whatever's already queued in the cart, so re-clicking never doubles
//     an order; shoppingListForPlanner dedupes/sums shared ingredients
//     across different planned days.
//   - the planner's add/remove and the whole apps.recipes bucket survive
//     the real write/load round trip, and normalizeComputerState backs a
//     pre-Phase-8 save (no `recipes` key at all) into the fresh default.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'cooking.js', 'computer.js', 'defs.computer.js', 'sim.js', 'state.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts (the 2026-08-18 Phase 7
  // fix — a truthy failure-message string must never read as a pass).
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
      h.npcs[id].needs = h.npcs[id].needs || {};
    }
    h.player.flags = {};
    h.player.inventory = h.player.inventory || [];
    h.player.moodEvents = [];
    h.player.meta = h.player.meta || {};
    // ChefBook (Phase 8) lives on world.computer, which SIM_generateHouse
    // never sets up (that's COMPUTER's job at real new-game time) — every
    // check below reads/writes apps.recipes, so the harness's house needs
    // the real default shape, not an ad hoc stub.
    h.world.computer = defaultComputerState();
    return h;
  }
  function objIn(h, defId) {
    for (const bucket of Object.values(h.objects || {})) {
      const o = Object.values(bucket).find(o => o.defId === defId);
      if (o) return o;
    }
    return null;
  }
  function applyLines(h, lines) {
    const effCtx = buildEffectContext(h, [], [], h.objects.room_kitchen || {}, h.player.inventory);
    const effects = [];
    for (const line of lines) {
      for (const eff of parseEffectDSL(line)) if (eff) effects.push(eff);
    }
    applyEffects(effects, effCtx);
    return h;
  }
  function clearStorage(h) {
    for (const defId of ['fridge', 'pantry', 'freezer']) {
      const o = objIn(h, defId);
      if (o) o.contents = [];
    }
    return h;
  }
  function stock(h, container, defId, qty) {
    const o = objIn(h, container);
    const list = o.contents || (o.contents = []);
    const existing = list.find(s => s.defId === defId);
    if (existing) existing.qty += qty;
    else list.push({ defId, qty, ownerId: null, meta: { acquiredDay: gameDaysNow(h.meta.clock) } });
    return h;
  }
  function plateStackFor(h, recipeId) {
    const recipe = RECIPES[recipeId];
    const plate = makePlate(h, recipe, recipe.ingredients, recipe.method, recipe.cookware);
    const now = gameDaysNow(h.meta.clock);
    return { defId: 'cooked_meal', qty: 1, meta: { plate, cohort: now, acquiredDay: now } };
  }
  function cartLines(h) {
    return h.world.computer.apps.shop.cart;
  }
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      m.entries = async () => Object.entries(stores[name] || {}).map(([k, v]) => [k, structuredClone(v)]);
      m.values = async () => Object.values(stores[name] || {}).map(v => structuredClone(v));
      m.getMany = async (ks) => Promise.all(ks.map(k => m.get(k)));
      m.setMany = async (pairs) => { for (const [k, v] of pairs) await m.set(k, v); };
      m.deleteMany = async (ks) => { for (const k of ks) await m.delete(k); };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex', 'menu', 'pendingOp', 'kv']) kv[f] = wrap(f);
    return kv;
  }
`);

// Everything below needs \`await\`, which can't sit at this file's top level
// alongside the \`require()\` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. isRecipeCardId — only RECIPES keys and restaurant dishes are card-eligible');

await check('a RECIPES key, a real restaurant dish, a raw ingredient, and freeform sort correctly',
  api(`(() => {
    const dishId = [...RESTAURANT_DISH_IDS][0];
    if (!isRecipeCardId('pasta')) return 'pasta should be card-eligible';
    if (!isRecipeCardId(dishId)) return dishId + ' should be card-eligible';
    if (isRecipeCardId('eggs')) return 'a raw ingredient should not be card-eligible';
    if (isRecipeCardId('freeform')) return 'freeform should not be card-eligible';
    if (isRecipeCardId(null) || isRecipeCardId(undefined)) return 'null/undefined should not throw or pass';
    return true;
  })()`));

console.log('\n2. recipeCardFor / recipeCardsFromEngine');

await check('a RECIPES card carries real ingredients, engine-derived steps, kcal and a valid grade',
  api(`(() => {
    const h = house('p8-card', 1);
    const card = recipeCardFor(h, 'pasta');
    if (!card) return 'no card';
    if (JSON.stringify(card.ingredients) !== JSON.stringify(RECIPES.pasta.ingredients.map(i => ({ defId: i.defId, qty: i.qty || 1 })))) return 'ingredients mismatch';
    if (card.steps.length !== RECIPES.pasta.ingredients.length + 1) return 'wrong step count: ' + card.steps.length;
    if (!(card.kcalPerServing > 0)) return 'kcalPerServing not positive: ' + card.kcalPerServing;
    if (!GRADES.some(g => g.grade === card.grade)) return 'not a real grade: ' + card.grade;
    return true;
  })()`));

await check("a restaurant dish's card has no ingredients/steps and reads kcal off ITEM_DEFS",
  api(`(() => {
    const h = house('p8-dish', 1);
    const dishId = [...RESTAURANT_DISH_IDS][0];
    const card = recipeCardFor(h, dishId);
    if (!card) return 'no card';
    if (card.ingredients.length !== 0 || card.steps.length !== 0) return 'dish card should have no ingredients/steps';
    if (card.grade !== null) return 'dish card should have no grade';
    if (card.kcalPerServing !== Math.round(perServingKcal(ITEM_DEFS[dishId]))) return 'kcal mismatch';
    return true;
  })()`));

await check('recipeCardsFromEngine builds exactly the ids it is given, no more',
  api(`(() => {
    const h = house('p8-cards', 1);
    const cards = recipeCardsFromEngine(h, ['pasta']);
    return Object.keys(cards).length === 1 && !!cards.pasta;
  })()`));

console.log('\n3. maybeUnlockRecipeCard — the EAT_ITEM unlock-on-taste hook');

await check('eating a cooked plate unlocks its recipeKey',
  api(`(() => {
    const h = clearStorage(house('p8-unlock-plate', 1));
    h.player.inventory = [plateStackFor(h, 'pasta')];
    applyLines(h, ['EAT_ITEM cooked_meal 1 player']);
    return h.world.computer.apps.recipes.unlockedIds.includes('pasta')
      || 'not unlocked: ' + JSON.stringify(h.world.computer.apps.recipes.unlockedIds);
  })()`));

await check('eating a restaurant dish unlocks its own defId',
  api(`(() => {
    const h = clearStorage(house('p8-unlock-dish', 1));
    const dishId = [...RESTAURANT_DISH_IDS][0];
    h.player.inventory = [{ defId: dishId, qty: 1, meta: { acquiredDay: gameDaysNow(h.meta.clock) } }];
    applyLines(h, ['EAT_ITEM ' + dishId + ' 1 player']);
    return h.world.computer.apps.recipes.unlockedIds.includes(dishId)
      || 'not unlocked: ' + JSON.stringify(h.world.computer.apps.recipes.unlockedIds);
  })()`));

await check('eating a raw ingredient unlocks nothing',
  api(`(() => {
    const h = clearStorage(house('p8-unlock-raw', 1));
    h.player.inventory = [{ defId: 'eggs', qty: 2, meta: { acquiredDay: gameDaysNow(h.meta.clock) } }];
    applyLines(h, ['EAT_ITEM eggs 1 player']);
    return h.world.computer.apps.recipes.unlockedIds.length === 0
      || 'unlocked something from a raw ingredient: ' + JSON.stringify(h.world.computer.apps.recipes.unlockedIds);
  })()`));

await check('unlocking is idempotent — the same id never appears twice',
  api(`(() => {
    const h = house('p8-unlock-idem', 1);
    maybeUnlockRecipeCard(h, 'pasta');
    maybeUnlockRecipeCard(h, 'pasta');
    const ids = h.world.computer.apps.recipes.unlockedIds;
    return ids.filter(id => id === 'pasta').length === 1 || 'duplicated: ' + JSON.stringify(ids);
  })()`));

console.log('\n4. addRecipeIngredientsToCart — diffs against the whole kitchen and the cart');

await check('only the missing ingredient gets a cart line, sized by buyQty clicks',
  api(`(() => {
    const h = clearStorage(house('p8-cart-diff', 1));
    stock(h, 'pantry', 'tomato_sauce', 1); // pasta needs exactly 1 — fully covered
    const result = addRecipeIngredientsToCart(h, 'pasta');
    if (!result.ok) return 'not ok: ' + result.reason;
    const cart = cartLines(h);
    if (cart.length !== 1) return 'wrong cart line count: ' + JSON.stringify(cart);
    if (cart[0].defId !== 'pasta_dry') return 'wrong line: ' + JSON.stringify(cart);
    const buyQty = ITEM_DEFS.pasta_dry.buyQty || 1;
    if (cart[0].units !== Math.ceil(1 / buyQty)) return 'wrong click count: ' + cart[0].units;
    return true;
  })()`));

await check('clicking Add All Ingredients twice never doubles the cart (queued qty counts as covered)',
  api(`(() => {
    const h = clearStorage(house('p8-cart-repeat', 1));
    addRecipeIngredientsToCart(h, 'pasta');
    const before = JSON.stringify(cartLines(h));
    addRecipeIngredientsToCart(h, 'pasta');
    const after = JSON.stringify(cartLines(h));
    return before === after || 'cart grew on a repeat click: ' + before + ' -> ' + after;
  })()`));

await check('a fully-stocked kitchen adds nothing to the cart',
  api(`(() => {
    const h = clearStorage(house('p8-cart-none', 1));
    for (const ing of RECIPES.pasta.ingredients) stock(h, 'pantry', ing.defId, ing.qty);
    const result = addRecipeIngredientsToCart(h, 'pasta');
    return (result.ok && result.added === 0 && cartLines(h).length === 0) || 'expected no cart lines: ' + JSON.stringify(cartLines(h));
  })()`));

console.log('\n5. the meal planner — dedupe, remove, and fill-cart');

await check('shoppingListForPlanner sums a shared ingredient across two different planned days',
  api(`(() => {
    const h = house('p8-planner-sum', 1);
    addToPlanner(h, 'pasta', h.meta.clock.day);      // tomato_sauce x1
    addToPlanner(h, 'soup', h.meta.clock.day + 1);   // tomato_sauce x1, onion x1, garlic x1
    const need = shoppingListForPlanner(h);
    if (need.tomato_sauce !== 2) return 'tomato_sauce not summed: ' + need.tomato_sauce;
    if (need.pasta_dry !== 1 || need.onion !== 1 || need.garlic !== 1) return 'wrong totals: ' + JSON.stringify(need);
    return true;
  })()`));

await check('removeFromPlanner drops exactly the entry at that index',
  api(`(() => {
    const h = house('p8-planner-remove', 1);
    addToPlanner(h, 'pasta', 1);
    addToPlanner(h, 'soup', 2);
    removeFromPlanner(h, 0);
    const planner = h.world.computer.apps.recipes.planner;
    return (planner.length === 1 && planner[0].recipeId === 'soup') || 'wrong remainder: ' + JSON.stringify(planner);
  })()`));

await check('addPlannerIngredientsToCart fills exactly the missing quantities for the whole plan',
  api(`(() => {
    const h = clearStorage(house('p8-planner-fill', 1));
    addToPlanner(h, 'pasta', h.meta.clock.day);
    addToPlanner(h, 'soup', h.meta.clock.day + 1);
    stock(h, 'pantry', 'tomato_sauce', 2); // covers BOTH recipes' combined need
    const result = addPlannerIngredientsToCart(h);
    if (!result.ok) return 'not ok: ' + result.reason;
    const cart = cartLines(h);
    if (cart.some(c => c.defId === 'tomato_sauce')) return 'tomato_sauce should be fully covered: ' + JSON.stringify(cart);
    const need = ['pasta_dry', 'onion', 'garlic'];
    if (!need.every(d => cart.some(c => c.defId === d))) return 'missing expected lines: ' + JSON.stringify(cart);
    return true;
  })()`));

console.log('\n6. the save/load round trip and pre-Phase-8 migration');

await check('unlockedIds and the planner survive the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p8', clock: { day: 1, minutes: 0 } });
    const h = clearStorage(house('rt-p8', 1));
    maybeUnlockRecipeCard(h, 'pasta');
    addToPlanner(h, 'pasta', 3);
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const app = loaded.world.computer.apps.recipes;
    if (!app.unlockedIds.includes('pasta')) return 'unlockedIds lost';
    if (app.planner.length !== 1 || app.planner[0].recipeId !== 'pasta' || app.planner[0].day !== 3) return 'planner lost: ' + JSON.stringify(app.planner);
    return true;
  })()`));

await check('a pre-Phase-8 save (no recipes key at all) loads with the fresh default backfilled',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p8-old', clock: { day: 1, minutes: 0 } });
    const h = clearStorage(house('rt-p8-old', 1));
    delete h.world.computer.apps.recipes; // simulate a save written before this app existed
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const app = loaded.world.computer.apps.recipes;
    if (!app) return 'apps.recipes missing after load';
    if (!Array.isArray(app.unlockedIds) || app.unlockedIds.length !== 0) return 'unlockedIds not defaulted: ' + JSON.stringify(app.unlockedIds);
    if (!Array.isArray(app.planner) || app.planner.length !== 0) return 'planner not defaulted: ' + JSON.stringify(app.planner);
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
