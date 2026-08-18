// Food Overhaul Phase 3 — plates as instances: the D25 Servings bar,
// leftovers, reheating (D26/D27/D29), cook-from-storage (D20).
//
// What this keeps fixed (assertions read the def tables, RECIPES, ROT and
// PLATE_TUNING rather than restating numbers, so a re-tune moves the
// assertions with it):
//   - D20: a recipe cooks from bag+fridge+pantry+freezer; the gate reads
//     the same pool the action cooks from; the bag is drawn from first
//     (bag food spoils faster, so it's the stack to burn);
//   - D5: makePlate derives kcal as Σ ingredient kcal + the food-group
//     variety bonus, servings from the recipe, quality/grade from the
//     shared readers — all snapshotted at cook time (invariant 1);
//   - D25: the serving ledger lives on the instance — EAT_ITEM drains
//     servings.left and drops the stack at 0, DESTROY_ITEM bins servings,
//     and the Servings-bar frac is batch-size-independent (7/8 of an
//     8-serving batch ≡ 1.75/2 of a 2-serving portion);
//   - cooked plates rot on the normal ladder (carrier perishable × the
//     container's preservation): edible next day, stale and then rotten at
//     the ROT-derived days;
//   - D26/D27: REHEAT_ITEM sets wasReheated, resolves a frozen thaw in one
//     step and restores a stale plate's quality; a betterHot plate eaten
//     cold forfeits its whole mood bonus, reheated it keeps it;
//   - D28: eating an ordinary plate straight from the freezer costs mood,
//     a frozenFood plate does not;
//   - invariant 3: an NPC's plate serving converts kcal→hunger and never
//     touches the player ledger;
//   - set_meal's plate spread scores by the instance's quality and feeds
//     attendees from plateMoodPerServing, not the carrier def;
//   - the plate meta survives the real write/load round trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts. The failure paths below
  // return MESSAGES (truthy strings) — under the old `if (c)` a failing
  // assertion silently "passed". A truthy string is a FAILURE whose message
  // becomes the detail.
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
    h.player.meta = {};
    return h;
  }
  function objIn(h, defId) {
    for (const bucket of Object.values(h.objects || {})) {
      const o = Object.values(bucket).find(o => o.defId === defId);
      if (o) return o;
    }
    return null;
  }
  function cookCtx(h) {
    return { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen || {}, presentNpcIds: [] };
  }
  // Run buildCookEffects-style effect lines against the house (the same
  // trusted-producer applyEffects path executeAction uses).
  function applyLines(h, lines) {
    const effCtx = buildEffectContext(h, [], [], h.objects.room_kitchen || {}, h.player.inventory);
    const effects = [];
    for (const line of lines) {
      for (const eff of parseEffectDSL(line)) if (eff) effects.push(eff);
    }
    applyEffects(effects, effCtx);
    return h;
  }
  function plateStack(h, objId) {
    const obj = findObjectById(h, objId);
    const list = obj ? obj.contents : h.player.inventory;
    return (list || []).find(s => s?.meta?.plate) || null;
  }
  function moodSum(h) {
    return (h.player.moodEvents || []).reduce((sum, e) => sum + (e.delta || 0), 0);
  }
  function plateIn(h, objId, plate, { left, cohort, frozen } = {}) {
    const obj = findObjectById(h, objId);
    const p = Object.assign({}, plate, left != null ? { servings: { total: plate.servings.total, left } } : {});
    const meta = { plate: p, cohort: cohort != null ? cohort : gameDaysNow(h.meta.clock), acquiredDay: cohort != null ? cohort : gameDaysNow(h.meta.clock) };
    if (frozen) meta.frozen = frozen;
    const stack = { defId: 'cooked_meal', qty: 1, meta };
    obj.contents = (obj.contents || []).concat([stack]);
    return stack;
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

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. Cook-from-storage (D20)');

await check('a pantry-only pasta cooks with an empty bag; the plate lands in the fridge, one serving auto-eaten',
  api(`(() => {
    const h = house('p3-d20', 1);
    const pantry = objIn(h, 'pantry');
    const fridge = objIn(h, 'fridge');
    pantry.contents = [{ defId: 'pasta_dry', qty: 2 }, { defId: 'tomato_sauce', qty: 2 }];
    fridge.contents = [];
    h.player.inventory = [];
    const ctx = cookCtx(h);
    const recipes = availableRecipes(kitchenIngredientPool(h, ctx));
    const pasta = recipes.find(r => r.id === 'pasta');
    if (!pasta) return 'pasta not available from pantry-only stock';
    const lines = buildCookEffects(ctx, { recipe: pasta });
    applyLines(h, lines);
    const stack = plateStack(h, fridge.id);
    const plate = stack?.meta?.plate;
    const pantryLeft = stackQty(pantry.contents, 'pasta_dry') + stackQty(pantry.contents, 'tomato_sauce');
    return !!plate && plate.recipeKey === 'pasta'
      && plate.servings.total === 3 && plate.servings.left === 2
      && plate.wasReheated === false
      && stackServingsLeft(stack) === 2
      && pantryLeft === 2
      && stackQty(h.player.inventory, 'pasta_dry') === 0;
  })()`));

await check('ingredients split across bag and fridge draw the bag first (bag food spoils fastest)',
  api(`(() => {
    const h = house('p3-bagfirst', 1);
    const fridge = objIn(h, 'fridge');
    const pantry = objIn(h, 'pantry');
    pantry.contents = [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }];
    fridge.contents = [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }];
    h.player.inventory = [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }];
    const ctx = cookCtx(h);
    const pasta = availableRecipes(kitchenIngredientPool(h, ctx)).find(r => r.id === 'pasta');
    if (!pasta) return 'pasta not available';
    const lines = buildCookEffects(ctx, { recipe: pasta });
    // Bag must be drained before fridge: one DESTROY_ITEM from player per ingredient.
    const playerDestroy = lines.filter(l => l.startsWith('DESTROY_ITEM ') && / player$/.test(l));
    applyLines(h, lines);
    return playerDestroy.length === 2
      && stackQty(h.player.inventory, 'pasta_dry') === 0
      && stackQty(fridge.contents, 'pasta_dry') === 1;
  })()`));

console.log('\n2. The D5 sum-of-parts plate builder (makePlate)');

await check('pasta kcal = Σ ingredients (270) + one variety bonus (100) over 3 servings = 123 per serving',
  api(`(() => {
    const h = house('p3-kcal', 1);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    const sum = RECIPES.pasta.ingredients.reduce((s, ing) => s + kcalOf(ITEM_DEFS[ing.defId]) * (ing.qty || 1), 0);
    const expected = Math.round((sum + PLATE_TUNING.groupBonusKcal * 1) / RECIPES.pasta.servings);
    return plate.kcalPerServing === 123 && plate.kcalPerServing === expected
      && plate.recipeKey === 'pasta'
      && plate.servings.total === 3 && plate.servings.left === 3
      && plate.preparedAbs != null && plate.wasReheated === false;
  })()`));

await check('quality/grade come from the shared readers + the variety bonus (pasta is a B)',
  api(`(() => {
    const h = house('p3-qual', 1);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    const qs = RECIPES.pasta.ingredients.map(ing => foodQuality(ITEM_DEFS[ing.defId]));
    const avg = qs.reduce((a, b) => a + b, 0) / qs.length;
    const expected = Math.min(PLATE_TUNING.qualityCap,
      PLATE_TUNING.baseQuality + PLATE_TUNING.qualityFromFood * avg + PLATE_TUNING.qualityFromVariety * 1);
    return Math.abs(plate.quality - Math.round(expected * 100) / 100) < 1e-9
      && plate.grade === gradeFromQuality(plate.quality)
      && plate.grade === 'B';
  })()`));

await check('a single-group recipe earns no variety bonus (soup: ingredients-only)',
  api(`(() => {
    const h = house('p3-soup', 1);
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    const sum = RECIPES.soup.ingredients.reduce((s, ing) => s + kcalOf(ITEM_DEFS[ing.defId]) * (ing.qty || 1), 0);
    return plate.kcalPerServing === Math.round(sum / RECIPES.soup.servings);
  })()`));

console.log('\n3. The D25 serving ledger');

await check('a 4-serving soup eaten twice leaves 2 of 4 (bar at 50%) and keeps its snapshot',
  api(`(() => {
    const h = house('p3-ledger', 1);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    plateIn(h, fridge.id, plate);
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    const stack = fridge.contents[0];
    const bar = plateServingsLeft(stack);
    return !!bar && bar.left === 2 && bar.total === 4 && Math.abs(bar.frac - 0.5) < 1e-9
      && stackServingsLeft(stack) === 2 && stackServingsTotal(stack) === 4
      && stack.meta.plate.kcalPerServing === plate.kcalPerServing
      && stack.meta.plate.quality === plate.quality;
  })()`));

await check('eating the last serving drops the plate stack entirely',
  api(`(() => {
    const h = house('p3-last', 1);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    const plate = makePlate(h, RECIPES.burger, RECIPES.burger.ingredients, 'fry', 'pan');
    plateIn(h, fridge.id, plate, { left: 1 });
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    return fridge.contents.length === 0;
  })()`));

await check('DESTROY_ITEM bins servings off the ledger, not whole stacks',
  api(`(() => {
    const h = house('p3-destroy', 1);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    plateIn(h, fridge.id, plate, { left: 4 });
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('DESTROY_ITEM cooked_meal 1 ' + fridge.id), ctx);
    return stackServingsLeft(fridge.contents[0]) === 3 && fridge.contents.length === 1;
  })()`));

await check('the Servings-bar fraction is batch-size independent (7/8 of 8 ≡ 1.75/2 of 2 → 0.875)',
  api(`(() => {
    const a = plateServingsLeft({ meta: { plate: { servings: { total: 8, left: 7 } } } });
    const b = plateServingsLeft({ meta: { plate: { servings: { total: 2, left: 1.75 } } } });
    return a && b && a.frac === 0.875 && b.frac === 0.875 && Math.abs(a.frac - b.frac) < 1e-9
      && stackServingsTotal({ meta: { plate: { servings: { total: 8, left: 7 } } } }) === 8;
  })()`));

await check('a plate labels and describes itself (stackLabel + buildItemDescription)',
  api(`(() => {
    const h = house('p3-label', 1);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    const stack = { defId: 'cooked_meal', qty: 1, meta: { plate, cohort: 1, acquiredDay: 1 } };
    const d = describeStack(stack, { day: 1 });
    const desc = d.description;
    return d.label === 'Pasta'
      && desc.includes('3 of 3 servings')
      && desc.includes('grade')
      && desc.includes('123 kcal per serving')
      && desc.includes('Better eaten reheated');
  })()`));

console.log('\n4. Plates rot on the normal ladder');

await check('a pantry-stored plate is edible next day, stale at day 5, rotten at day 9',
  api(`(() => {
    const h = house('p3-rot', 1);
    const pantry = objIn(h, 'pantry');
    const now = gameDaysNow(h.meta.clock);
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    const stack = plateIn(h, pantry.id, plate);
    const d1 = freshnessOf(stack, OBJECT_DEFS.pantry, now + 1);
    const d5 = freshnessOf(stack, OBJECT_DEFS.pantry, now + 5);
    const d9 = freshnessOf(stack, OBJECT_DEFS.pantry, now + 9);
    return d1.edible && d5.key === 'stale' && d9.key === 'rotten';
  })()`));

console.log('\n5. Reheat (D26/D27): stale restore + thaw resolve');

await check('a stale betterHot plate eaten cold forfeits its WHOLE mood bonus (D27)',
  api(`(() => {
    const h = house('p3-d27cold', 1);
    const fridge = objIn(h, 'fridge');
    const now = gameDaysNow(h.meta.clock);
    const shelf = ITEM_DEFS.cooked_meal.perishable.days * preservationFor(OBJECT_DEFS.fridge);
    const staleDay = Math.ceil(ROT.stages.stale * shelf);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    fridge.contents = [];
    plateIn(h, fridge.id, plate, { cohort: now });
    h.meta.clock = { day: now + staleDay, minutes: 0 };
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    // 0 mood events: the stale plate's positive would have been
    // qualityMoodScale × quality × 0.9 — forfeited whole.
    return moodSum(h) === 0;
  })()`));

await check('REHEAT_ITEM on the stale plate sets wasReheated, resets the anchor, and the next serving keeps its bonus',
  api(`(() => {
    const h = house('p3-d27hot', 1);
    const fridge = objIn(h, 'fridge');
    const now = gameDaysNow(h.meta.clock);
    const shelf = ITEM_DEFS.cooked_meal.perishable.days * preservationFor(OBJECT_DEFS.fridge);
    const staleDay = Math.ceil(ROT.stages.stale * shelf);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    fridge.contents = [];
    plateIn(h, fridge.id, plate, { cohort: now });
    h.meta.clock = { day: now + staleDay, minutes: 0 };
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('REHEAT_ITEM cooked_meal ' + fridge.id), ctx);
    const after = fridge.contents[0];
    const freshAfter = freshnessOf(after, OBJECT_DEFS.fridge, h.meta.clock.day);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    const mood = moodSum(h);
    return after.meta.plate.wasReheated === true
      && after.meta.cohort === h.meta.clock.day
      && freshAfter.key === 'fresh'
      && Math.abs(mood - PLATE_TUNING.qualityMoodScale * plate.quality) < 1e-9;
  })()`));

await check('REHEAT_ITEM resolves a frozen batch\'s thaw in one step (D26) and never touches a fresh plate\'s anchor',
  api(`(() => {
    const h = house('p3-thaw', 1);
    const freezer = objIn(h, 'freezer');
    const now = gameDaysNow(h.meta.clock);
    const plate = makePlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok');
    freezer.contents = [];
    const stack = plateIn(h, freezer.id, plate, { frozen: { frozenAtAbs: now, thawStartAbs: null, agedFraction: 0 } });
    const before = freshnessOf(stack, OBJECT_DEFS.freezer, now);
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('REHEAT_ITEM cooked_meal ' + freezer.id), ctx);
    const after = freezer.contents[0];
    // Fresh (not stale) plate: reheat resolves the thaw but keeps the anchor.
    return before.frozenState === 'frozen'
      && after.meta.plate.wasReheated === true
      && after.meta.frozen === undefined
      && after.meta.cohort === now;
  })()`));

console.log('\n6. D28: frozen-eaten plates');

await check('an ordinary plate straight from the freezer costs mood; a frozenFood plate does not',
  api(`(() => {
    const h = house('p3-frozen', 1);
    const freezer = objIn(h, 'freezer');
    const now = gameDaysNow(h.meta.clock);
    RECIPES.test_frozen_dessert = { id: 'test_frozen_dessert', label: 'Frozen Dessert', servings: 2, betterHot: false, frozenFood: true, ingredients: [{ defId: 'milk', qty: 1 }] };
    const salad = makePlate(h, RECIPES.salad, RECIPES.salad.ingredients, 'none', null);
    const dessert = makePlate(h, RECIPES.test_frozen_dessert, RECIPES.test_frozen_dessert.ingredients, 'none', null);
    freezer.contents = [];
    plateIn(h, freezer.id, salad, { frozen: { frozenAtAbs: now, thawStartAbs: null, agedFraction: 0 } });
    plateIn(h, freezer.id, dessert, { frozen: { frozenAtAbs: now, thawStartAbs: null, agedFraction: 0 } });
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + freezer.id), ctx);
    const afterOrdinary = moodSum(h);
    // Both plates are in one freezer; EAT drains the FIRST matching stack,
    // so bin the ordinary plate to leave the frozenFood one for the second bite.
    freezer.contents = freezer.contents.filter(s => !(s.meta?.plate && s.meta.plate.recipeKey === 'salad'));
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + freezer.id), ctx);
    const afterDessert = moodSum(h);
    delete RECIPES.test_frozen_dessert;
    const ordinaryMood = PLATE_TUNING.qualityMoodScale * salad.quality;
    const dessertMood = PLATE_TUNING.qualityMoodScale * dessert.quality;
    return Math.abs(afterOrdinary - (ordinaryMood - PLATE_TUNING.frozenEatenPenalty)) < 1e-9
      && Math.abs(afterDessert - (afterOrdinary + dessertMood)) < 1e-9;
  })()`));

console.log('\n7. Invariant 3: NPC plate eating');

await check('an NPC\'s plate serving converts kcal→hunger and never touches the player ledger',
  api(`(() => {
    const h = house('p3-npc', 2);
    const fridge = objIn(h, 'fridge');
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    fridge.contents = [];
    plateIn(h, fridge.id, plate);
    const npcId = Object.keys(h.npcs)[0];
    h.npcs[npcId].needs.hunger = 10;
    // The generated player already carries a fullness window (state.js) —
    // clear it so the assertions below can prove the NPC's meal never
    // touches the player's ledger (invariant 3).
    h.player.fullnessRemainingHours = undefined;
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id + ' ' + npcId), ctx);
    const expectHunger = 10 + plateHungerPerServing(fridge.contents[0]);
    return h.npcs[npcId].needs.hunger === expectHunger
      && stackServingsLeft(fridge.contents[0]) === 2
      && h.player.meta.kcalToday === undefined
      && h.player.fullnessRemainingHours === undefined
      && (h.player.moodEvents || []).length === 0;
  })()`));

console.log('\n8. set_meal plate-aware spread');

await check('a plate spread scores by the instance quality and feeds plate mood per attendee',
  api(`(() => {
    const h = house('p3-meal', 2);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    const option = { stack: { defId: 'cooked_meal', qty: 1, meta: { plate } }, def: ITEM_DEFS.cooked_meal, from: 'player' };
    const npcId = Object.keys(h.npcs)[0];
    // Food-overhaul Phase 7 (D23): set_meal deltas scale by the eater's
    // taste band — this Phase-3 test predates D23 and asserts the UNSCALED
    // mood, so the eater gets an explicit neutral taste (neutral is the
    // 1.0-multiplier floor) rather than letting the derived profile
    // introduce a love/hate multiplier.
    h.npcs[npcId].taste = { likes: [], dislikes: [] };
    const ctx = { gameState: h, roomId: 'dining', roomObjects: h.objects.room_dining || {}, presentNpcIds: [npcId] };
    const prepared = {
      spread: [option],
      attendees: [{ npcId, npc: h.npcs[npcId] }],
      servings: [{ who: npcId, defId: 'cooked_meal', from: 'player', def: ITEM_DEFS.cooked_meal, stack: option.stack }],
      fedNpcIds: [npcId],
      affection: 0, hasCommitment: false, diningTable: null,
    };
    const lines = buildSetMealEffects(ctx, prepared);
    const expectedMood = COMMITMENT_TUNING.attendeeMoodBonus + PLATE_TUNING.qualityMoodScale * plate.quality;
    const moodLine = lines.find(l => l.startsWith('MOOD_DELTA ' + npcId));
    const actualMood = moodLine ? parseFloat(moodLine.split(' ')[2]) : NaN;
    return spreadQuality([option]) === plate.quality
      && !!moodLine && actualMood === Math.round(expectedMood * 100) / 100;
  })()`));

console.log('\n9. Requirement gates read the same pools');

await check('hasRecipeIngredients lights up for kitchen stock and goes dark when it is gone',
  api(`(() => {
    const h = house('p3-gate', 1);
    const pantry = objIn(h, 'pantry');
    const fridge = objIn(h, 'fridge');
    const freezer = objIn(h, 'freezer');
    h.player.inventory = []; fridge.contents = []; freezer.contents = [];
    const ctx = cookCtx(h);
    pantry.contents = [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }];
    const before = ACTION_REQUIREMENT_CHECKERS.hasRecipeIngredients(ctx);
    pantry.contents = [];
    const after = ACTION_REQUIREMENT_CHECKERS.hasRecipeIngredients(ctx);
    return before === true && after !== true;
  })()`));

await check('hasReheatableFood sees plates with servings left, not def-driven food or empty stacks',
  api(`(() => {
    const h = house('p3-reheat-gate', 1);
    const ctx = cookCtx(h);
    const fridge = objIn(h, 'fridge');
    const pantry = objIn(h, 'pantry');
    fridge.contents = []; pantry.contents = []; h.player.inventory = [];
    const none = ACTION_REQUIREMENT_CHECKERS.hasReheatableFood(ctx);
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    plateIn(h, fridge.id, plate);
    const some = ACTION_REQUIREMENT_CHECKERS.hasReheatableFood(ctx);
    fridge.contents = [{ defId: 'dish_pepperoni_pizza', qty: 1 }];
    const defOnly = ACTION_REQUIREMENT_CHECKERS.hasReheatableFood(ctx);
    fridge.contents = [{ defId: 'cooked_meal', qty: 1, meta: { plate: Object.assign({}, plate, { servings: { total: 3, left: 0 } }), cohort: 1, acquiredDay: 1 } }];
    const emptyPlate = ACTION_REQUIREMENT_CHECKERS.hasReheatableFood(ctx);
    return none !== true && some === true && defOnly !== true && emptyPlate !== true;
  })()`));

console.log('\n10. Save/load round trip');

await check('a plate\'s snapshot survives the real write/load path',
  api(`
    (async () => {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p3', clock: { day: 1, minutes: 0 } });
      const h = SIM_generateHouse('throwaway-p3-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
      h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
      h.player.inventory = h.player.inventory || [];
      const fridge = objIn(h, 'fridge');
      const plate = makePlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok');
      fridge.contents = [];
      plateIn(h, fridge.id, plate, { left: 2, frozen: { frozenAtAbs: 1, thawStartAbs: 1.1, agedFraction: 0 } });
      await writeGeneratedGameState(h);
      await forceFlush();
      const loaded = await loadGameState();
      const obj = findObjectById(loaded, fridge.id);
      const stack = obj?.contents?.[0];
      const p = stack?.meta?.plate;
      return !!p && p.recipeKey === 'stirfry' && p.servings.total === 3 && p.servings.left === 2
        && p.kcalPerServing === plate.kcalPerServing && p.wasReheated === false
        && stack.meta.frozen?.agedFraction === 0 && stack.meta.frozen?.thawStartAbs === 1.1;
    })()
  `));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
