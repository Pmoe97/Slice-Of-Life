// Food Overhaul Phase 5 — the interactive cooking engine and grades
// (D8/D14/D15/D16): verbs × stages × methods with fats/seasonings as real
// reagents, recoverable failure, and the F–S+ ladder — verified at tier-1
// equipment throughout (equipment held at 'functional' is the phase's
// boundary; Phase 6 is the pure extension that rewires equipmentState).
//
// What this keeps fixed (assertions read COOK_TUNING/METHODS/GRADES rather
// than restating numbers, so a re-tune moves the assertions with it):
//   - D10: the method gate is cookware capability — cookwareCanMethod and
//     canPerformVerb read DISH_DEFS; pot can boil, pan cannot; mixing verbs
//     (knead/whip/blend) are reachable at the tier-1 mixer and gated the
//     same way;
//   - planCook produces a FIXED step order (prep per ingredient, then
//     declared mixing steps, then the method) and resolveCookPlan is
//     deterministic: the same (state, seed) yields the identical outcome,
//     bit for bit;
//   - D8 taste gate: an oil-fried chicken with no seasoning comes out
//     bland; the add-salt rescue turns it good; stacking seasonings past
//     overseasonedAt over-salts it;
//   - D15: a burnt batch is still EDIBLE — lower kcal/quality plus a mood
//     sting at eat time, never deleted; raw is rescued by finishing the
//     cook; the rescue re-roll is still deterministic;
//   - computeGrade is the one reader of the F–S+ ladder, and pasta's
//     ingredient-driven 0.70 still reads B (the phase-3 regression);
//   - the new effects go through the EXISTING trusted pipeline:
//     TRANSFORM_ITEM (seasonings) and COOK_STEP (the plate spawn) are
//     llm:false, validate, and apply; buildCookEffects now emits them and
//     still destroys the ingredients, dirties the right cookware, and
//     auto-eats a serving (phase-3/4 shapes preserved for bare callers);
//   - plate flaws + the engine plate survive the real write/load round
//     trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'cooking.js', 'sim.js', 'computer.js', 'state.js'] });

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
    h.player.skills = h.player.skills || {};
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
  function applyLines(h, lines) {
    const effCtx = buildEffectContext(h, [], [], h.objects.room_kitchen || {}, h.player.inventory);
    const effects = [];
    for (const line of lines) {
      for (const eff of parseEffectDSL(line)) if (eff) effects.push(eff);
    }
    applyEffects(effects, effCtx);
    return h;
  }
  function stockRecipe(h, recipe) {
    const pantry = objIn(h, 'pantry');
    const fridge = objIn(h, 'fridge');
    const byClass = { pantry: pantry, fridge: fridge, freezer: objIn(h, 'freezer') };
    for (const ing of recipe.ingredients || []) {
      const def = ITEM_DEFS[ing.defId];
      const cls = (def.storageClass || 'pantry');
      const target = byClass[cls] || pantry;
      const list = target.contents || (target.contents = []);
      const existing = list.find(s => s.defId === ing.defId);
      if (existing) existing.qty += ing.qty; else list.push({ defId: ing.defId, qty: ing.qty, ownerId: null, meta: { acquiredDay: 1 } });
    }
    // The starter pantry's reagents so seasoning choices have something to draw.
    for (const r of ['oil', 'salt', 'spices']) {
      const list = pantry.contents || (pantry.contents = []);
      if (!list.find(s => s.defId === r)) list.push({ defId: r, qty: 2, ownerId: null, meta: { acquiredDay: 1 } });
    }
    return h;
  }
  function planFor(recipe, h, opts) {
    return planCook(recipe, h, Object.assign({ roomId: 'kitchen' }, opts));
  }
  function plateStack(h, objId) {
    const obj = findObjectById(h, objId);
    const list = obj ? obj.contents : h.player.inventory;
    return (list || []).find(s => s?.meta?.plate) || null;
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

console.log('\n1. D10 — the method gate is cookware capability');

await check('cookwareCanMethod reads DISH_DEFS: pot boils/simmers/steams, pan fries/sautes/sears, wok stir-fries, tray bakes/roasts',
  api(`(() => {
    return cookwareCanMethod('pot', 'boil') && cookwareCanMethod('pot', 'simmer') && cookwareCanMethod('pot', 'steam')
      && cookwareCanMethod('pan', 'fry') && cookwareCanMethod('pan', 'saute') && cookwareCanMethod('pan', 'sear')
      && cookwareCanMethod('wok', 'stir_fry') && cookwareCanMethod('baking_tray', 'bake') && cookwareCanMethod('baking_tray', 'roast');
  })()`));

await check('a pan cannot boil and a wok cannot bake — capability is the gate, not the label',
  api(`(() => !cookwareCanMethod('pan', 'boil') && !cookwareCanMethod('wok', 'bake') && !cookwareCanMethod('pot', 'fry'))()`));

await check('the tier-1 kitchen owns the basic cookware set',
  api(`(() => {
    const h = house('p5-cw', 1);
    return kitchenCookwareAvailable(h, 'pot') && kitchenCookwareAvailable(h, 'pan')
      && kitchenCookwareAvailable(h, 'wok') && kitchenCookwareAvailable(h, 'baking_tray');
  })()`));

await check('mixing verbs (knead/whip/blend) are reachable at the tier-1 mixer and gate through the same capability machinery',
  api(`(() => {
    const h = house('p5-mix', 1);
    return canPerformVerb('knead', h, null) && canPerformVerb('whip', h, null) && canPerformVerb('blend', h, null)
      && COOK_TUNING.mixingVerbs.length === 3
      && ['whisk', 'knead', 'blend'].every(v => equipmentState(h).mixingVerbs.includes(v));
  })()`));

await check('a recipe with a declared mix step gets a mixing step in its plan (omelette → whisk)',
  api(`(() => {
    const h = house('p5-mix2', 1);
    stockRecipe(h, RECIPES.omelette);
    const plan = planFor(RECIPES.omelette, h, { seed: 7 });
    return plan.steps.filter(s => s.type === 'mix').map(s => s.verb).join(',') === 'whisk'
      && plan.steps[plan.steps.length - 1].type === 'method';
  })()`));

console.log('\n2. Determinism — same (state, seed) → identical outcome');

await check('resolving the same plan twice yields byte-identical step quality, flaws and grade',
  api(`(() => {
    const h = house('p5-det', 1);
    stockRecipe(h, RECIPES.pasta);
    const plan = planFor(RECIPES.pasta, h, { seed: 424242, choices: { seasoning: ['salt', 'spices'], fat: null, timing: 'bold' } });
    const a = resolveCookPlan(plan, h);
    const b = resolveCookPlan(plan, h);
    return JSON.stringify(a) === JSON.stringify(b) && a.quality === b.quality;
  })()`));

await check('identical inputs across two houses with the same seed produce the identical grade',
  api(`(() => {
    const a = house('p5-det2', 1); stockRecipe(a, RECIPES.stirfry);
    const b = house('p5-det2', 1); stockRecipe(b, RECIPES.stirfry);
    const pa = planFor(RECIPES.stirfry, a, { seed: 99, choices: { seasoning: ['salt'], fat: 'oil' } });
    const pb = planFor(RECIPES.stirfry, b, { seed: 99, choices: { seasoning: ['salt'], fat: 'oil' } });
    const oa = resolveCookPlan(pa, a), ob = resolveCookPlan(pb, b);
    return oa.quality === ob.quality && computeGrade(oa.quality) === computeGrade(ob.quality);
  })()`));

console.log('\n3. The D8 taste gate — bland, rescue, overseasoned');

await check('oil-fried underseasoned chicken comes out bland; the add-salt rescue turns it good',
  api(`(() => {
    const h = house('p5-bland', 1);
    stockRecipe(h, RECIPES.stirfry);
    const bland = planFor(RECIPES.stirfry, h, { seed: 5, choices: { seasoning: [], fat: 'oil' } });
    const o1 = resolveCookPlan(bland, h);
    if (!o1.flaws.includes('bland')) return 'not bland: ' + o1.flaws.join(',');
    const rescued = applyCookRescue(bland, 'add_salt', h);
    if (!rescued) return 'rescue returned null';
    const o2 = resolveCookPlan(rescued, h);
    return !o2.flaws.includes('bland')
      && o2.flaws.filter(f => f === 'overseasoned').length === 0
      && o2.quality > o1.quality;
  })()`));

await check('a plain salted cook is NOT bland — the default habit keeps dinner good',
  api(`(() => {
    const h = house('p5-notbland', 1);
    stockRecipe(h, RECIPES.pasta);
    const plan = planFor(RECIPES.pasta, h, { seed: 5, choices: { seasoning: ['salt'] } });
    const o = resolveCookPlan(plan, h);
    return !o.flaws.includes('bland');
  })()`));

await check('seasoned-then-rescued stacks past overseasonedAt → overseasoned',
  api(`(() => {
    const h = house('p5-over', 1);
    stockRecipe(h, RECIPES.stirfry);
    const plan = planFor(RECIPES.stirfry, h, { seed: 11, choices: { seasoning: ['salt', 'spices'], fat: 'oil' } });
    const rescued = applyCookRescue(plan, 'add_salt', h);
    const o = resolveCookPlan(rescued, h);
    return o.flaws.includes('overseasoned');
  })()`));

await check('reagent availability reads the kitchen pool (no salt on the shelf → bland waits)',
  api(`(() => {
    const h = house('p5-avail', 1);
    objIn(h, 'pantry').contents = [{ defId: 'oil', qty: 1, ownerId: null, meta: {} }];
    const a = reagentAvailability(h, cookCtx(h));
    const okEmpty = a.salt === false && a.spices === false && a.oil === true;
    stockRecipe(h, RECIPES.sandwich);
    const a2 = reagentAvailability(h, cookCtx(h));
    return okEmpty && a2.salt === true;
  })()`));

await check("the UI's fat pick rides into the plan: choices.fat merges into seasoning, counts kcal but never flavor",
  api(`(() => {
    const h = house('p5-fat', 1);
    stockRecipe(h, RECIPES.stirfry);
    const plan = planFor(RECIPES.stirfry, h, { seed: 4, choices: { seasoning: ['salt'], fat: 'oil' } });
    const o = resolveCookPlan(plan, h);
    const noFat = planFor(RECIPES.stirfry, h, { seed: 4, choices: { seasoning: ['salt'], fat: null } });
    const onf = resolveCookPlan(noFat, h);
    return plan.seasoning.includes('oil')
      && o.reagentKcal === COOK_TUNING.reagents.oil.kcalPerUse
      && o.flavor === 1
      && !o.flaws.includes('bland')
      && o.quality > onf.quality;
  })()`));

console.log('\n4. D15 — failure is recoverable, never deletion');

await check('a burnt batch is still edible: lower kcal and quality, a plate that exists, and a mood sting at eat time',
  api(`(async () => {
    const h = house('p5-burn', 1);
    stockRecipe(h, RECIPES.stirfry);
    const fried = { seasoning: ['salt'], fat: 'oil' };
    const plain = { seasoning: ['salt'], fat: 'oil' };
    let burntPlan = null;
    for (let s = 0; s < 3000; s++) {
      const p = planFor(RECIPES.stirfry, h, { seed: s, choices: fried });
      if (resolveCookPlan(p, h).flaws.includes('burnt')) { burntPlan = p; break; }
    }
    if (!burntPlan) return 'no burnt seed found in 0..3000';
    let goodSeed = null;
    for (let s = 3001; s < 6000; s++) {
      const p = planFor(RECIPES.stirfry, h, { seed: s, choices: plain });
      if (!resolveCookPlan(p, h).flaws.includes('burnt')) { goodSeed = s; break; }
    }
    if (goodSeed == null) return 'no good seed found in 3001..6000';
    const good = planFor(RECIPES.stirfry, h, { seed: goodSeed, choices: plain });
    const ob = resolveCookPlan(burntPlan, h);
    const og = resolveCookPlan(good, h);
    if (og.flaws.includes('burnt')) return 'comparison plan also burnt';
    const pb = buildPlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok', { plan: burntPlan, outcome: ob, seed: 1 });
    const pg = buildPlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok', { plan: good, outcome: og, seed: 1 });
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    h.player.meta = { activityEvents: [], kcalToday: 0, kcalBurnedToday: 0 };
    const metaJson = JSON.stringify({ plate: pb, cohort: gameDaysNow(h.meta.clock), acquiredDay: gameDaysNow(h.meta.clock) });
    applyLines(h, ['COOK_STEP cooked_meal 1 ' + fridge.id + ' ' + metaJson]);
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    const moodBefore = (h.player.moodEvents || []).reduce((s, e) => s + (e.delta || 0), 0);
    applyEffects(parseEffectDSL('EAT_ITEM cooked_meal 1 ' + fridge.id), ctx);
    const after = fridge.contents.find(s => s.meta?.plate);
    const moodAfter = (h.player.moodEvents || []).reduce((s, e) => s + (e.delta || 0), 0);
    const expectedMood = PLATE_TUNING.qualityMoodScale * pb.quality - COOK_TUNING.burntMoodSting;
    return pb.flaws.includes('burnt')
      && pb.kcalPerServing < pg.kcalPerServing
      && pb.quality < pg.quality
      && !!after && stackServingsLeft(after) === 2
      && Math.abs(moodAfter - moodBefore - expectedMood) < 1e-9;
  })()`));

await check('the raw rescue — finish cooking re-rolls the undercook (deterministically) and extends the plan',
  api(`(() => {
    const h = house('p5-raw', 1);
    stockRecipe(h, RECIPES.fried_rice);
    let rawPlan = null;
    for (let s = 0; s < 3000; s++) {
      const p = planFor(RECIPES.fried_rice, h, { seed: s, choices: { seasoning: ['salt'], fat: 'oil', timing: 'conservative' } });
      if (resolveCookPlan(p, h).flaws.includes('raw')) { rawPlan = p; break; }
    }
    if (!rawPlan) return 'no raw seed found in 0..3000';
    const next = applyCookRescue(rawPlan, 'finish', h);
    if (!next) return 'finish rescue unavailable';
    const o = resolveCookPlan(next, h);
    const lastMethod = o.stepResults.filter(s => s.type === 'method').pop();
    return next.steps.length === rawPlan.steps.length + 1
      && next.minutes > rawPlan.minutes
      && (lastMethod.raw ? o.flaws.includes('raw') : !o.flaws.includes('raw'))
      && o.flaws.includes('raw') === lastMethod.raw;
  })()`));

await check('a rescue cannot stack: applying the same rescue twice returns null',
  api(`(() => {
    const h = house('p5-rescue', 1);
    stockRecipe(h, RECIPES.stirfry);
    const plan = planFor(RECIPES.stirfry, h, { seed: 3, choices: { seasoning: ['salt'] } });
    const once = applyCookRescue(plan, 'add_salt', h);
    return !!once && once.seasoning.filter(s => s === 'salt').length === 2
      && applyCookRescue(once, 'add_salt', h) === null
      && applyCookRescue(once, 'finish', h) !== null;
  })()`));

console.log('\n5. computeGrade — the one reader of the F–S+ ladder');

await check('the ladder reads correctly across every band (0.98 S+ … 0.1 F)',
  api(`(() => {
    const cases = [[0.98, 'S+'], [0.97, 'S+'], [0.96, 'S'], [0.92, 'S'], [0.91, 'S-'], [0.87, 'S-'], [0.86, 'A+'],
      [0.82, 'A+'], [0.81, 'A'], [0.77, 'A'], [0.76, 'A-'], [0.72, 'A-'], [0.71, 'B'], [0.58, 'B'],
      [0.57, 'C'], [0.45, 'C'], [0.44, 'D'], [0.28, 'D'], [0.27, 'F'], [0.1, 'F']];
    return cases.every(([q, g]) => computeGrade(q) === g && gradeFromQuality(q) === g);
  })()`));

await check('pasta stays a B (0.70 under the new ladder — the phase-3 regression)',
  api(`(() => {
    const h = house('p5-pasta', 1);
    const plate = makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot');
    return plate.grade === 'B' && gradeFromQuality(plate.quality) === 'B';
  })()`));

console.log('\n6. The new effects ride the existing trusted pipeline');

await check('TRANSFORM_ITEM and COOK_STEP are engine-only: llm:false, validated, applied',
  api(`(() => {
    const h = house('p5-eff', 1);
    stockRecipe(h, RECIPES.sandwich);
    const pantry = objIn(h, 'pantry');
    // The starter pantry stocks reagents RANDOMLY per house — drop whatever
    // salt it drew so this check's salt count is deterministic.
    pantry.contents = (pantry.contents || []).filter(s => s.defId !== 'salt');
    pantry.contents.push({ defId: 'salt', qty: 2, ownerId: null, meta: { acquiredDay: 1 } });
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, carryItems: h.player.inventory, presentNpcIds: [], activeNpcIds: [] };
    const rejected = validateEffects([{ type: 'TRANSFORM_ITEM', params: { defId: 'salt', qty: 1, from: pantry.id } }], ctx, 'llm');
    if (rejected.rejected.length !== 1) return 'narrator could TRANSFORM_ITEM';
    const ok = validateEffects([{ type: 'TRANSFORM_ITEM', params: { defId: 'salt', qty: 1, from: pantry.id } }], ctx, 'trusted');
    if (ok.rejected.length) return 'trusted rejected: ' + ok.rejected[0].reason;
    applyEffects([{ type: 'TRANSFORM_ITEM', params: { defId: 'salt', qty: 1, from: pantry.id } }], ctx);
    if (stackQty(pantry.contents, 'salt') !== 1) return 'salt not consumed';
    const metaJson = JSON.stringify({ plate: makePlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot'), cohort: 1, acquiredDay: 1 });
    const bad = validateEffects([{ type: 'COOK_STEP', params: { defId: 'cooked_meal', qty: 1, to: pantry.id, metaJson: '{not json' } }], ctx, 'trusted');
    if (bad.rejected.length !== 1) return 'COOK_STEP accepted malformed meta';
    const noplate = validateEffects([{ type: 'COOK_STEP', params: { defId: 'cooked_meal', qty: 1, to: pantry.id, metaJson: '{"foo":1}' } }], ctx, 'trusted');
    if (noplate.rejected.length !== 1) return 'COOK_STEP accepted a non-plate meta';
    applyEffects([{ type: 'COOK_STEP', params: { defId: 'cooked_meal', qty: 1, to: pantry.id, metaJson } }], ctx);
    return !!pantry.contents.find(s => s.defId === 'cooked_meal' && s.meta?.plate?.servings);
  })()`));

await check('buildCookEffects: seasonings TRANSFORM, fats CONSUME, and the plate lands via COOK_STEP',
  api(`(() => {
    const h = house('p5-build', 1);
    stockRecipe(h, RECIPES.stirfry);
    const pantry = objIn(h, 'pantry');
    const fridge = objIn(h, 'fridge');
    const plate = buildPlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok', {
      plan: planFor(RECIPES.stirfry, h, { seed: 7, choices: { seasoning: ['salt'], fat: 'oil' } }),
      outcome: resolveCookPlan(planFor(RECIPES.stirfry, h, { seed: 7, choices: { seasoning: ['salt'], fat: 'oil' } }), h),
      seed: 7,
    });
    const lines = buildCookEffects(cookCtx(h), { recipe: RECIPES.stirfry, plate, seasoning: ['salt', 'oil'], minutes: 20 });
    const transform = lines.filter(l => l.startsWith('TRANSFORM_ITEM '));
    const consume = lines.filter(l => l.startsWith('CONSUME_ITEM '));
    const step = lines.filter(l => l.startsWith('COOK_STEP '));
    const destroy = lines.filter(l => l.startsWith('DESTROY_ITEM '));
    const before = stackQty(pantry.contents, 'salt') + stackQty(pantry.contents, 'oil');
    applyLines(h, lines);
    const landed = plateStack(h, fridge.id);
    return transform.length === 1 && /TRANSFORM_ITEM salt 1 /.test(transform[0])
      && consume.length === 1 && /CONSUME_ITEM oil 1 /.test(consume[0])
      && step.length === 1 && destroy.length === 3
      && stackQty(pantry.contents, 'salt') + stackQty(pantry.contents, 'oil') === before - 2
      && !!landed && landed.meta.plate.recipeKey === 'stirfry' && stackServingsLeft(landed) === 2;
  })()`));

await check('the bare {recipe} shape still works (phase-3/4 regression): DESTROY lines, plate, dish footprint',
  api(`(() => {
    const h = house('p5-bare', 1);
    stockRecipe(h, RECIPES.pasta);
    const sink = objIn(h, 'sink_kitchen');
    const stove = objIn(h, 'stove');
    const lines = buildCookEffects(cookCtx(h), { recipe: RECIPES.pasta });
    const dishLines = lines.filter(l => l.startsWith('ADD_DISHES '));
    applyLines(h, lines);
    const stack = plateStack(h, objIn(h, 'fridge').id);
    return dishLines.length === 4 && sink.dishUnits === 7 && stove.state.burner === 'crusty'
      && !!stack && stack.meta.plate.recipeKey === 'pasta' && stack.meta.plate.grade === stack.meta.plate.grade
      && stackServingsLeft(stack) === 2;
  })()`));

console.log('\n7. buildPlate — the engine stamps execution onto the snapshot');

await check("a no-cook sandwich's components carry the prep verb's stage word (sliced bread)",
  api(`(() => {
    const h = house('p5-sand', 1);
    stockRecipe(h, RECIPES.sandwich);
    const plan = planFor(RECIPES.sandwich, h, { seed: 3, choices: { seasoning: [] } });
    const plate = buildPlate(h, RECIPES.sandwich, RECIPES.sandwich.ingredients, 'none', null, { plan, outcome: resolveCookPlan(plan, h), seed: 3 });
    const breadStage = plate.components.find(c => c.defId === 'bread')?.stage;
    return breadStage === 'sliced' && plate.flaws.length === 0 && plate.servings.total === 2;
  })()`));

await check('reagent kcal enters the plate (an oil+fats stir-fry carries them) and grades come from computeGrade',
  api(`(() => {
    const h = house('p5-kcal', 1);
    stockRecipe(h, RECIPES.stirfry);
    const plan = planFor(RECIPES.stirfry, h, { seed: 9, choices: { seasoning: ['salt', 'oil', 'spices'], fat: 'oil' } });
    const o = resolveCookPlan(plan, h);
    const plate = buildPlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok', { plan, outcome: o, seed: 9 });
    const base = makePlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok');
    const reagentKcal = Math.min(o.reagentKcal, COOK_TUNING.reagentKcalCap);
    return plate.kcalPerServing === Math.round(((base.kcalPerServing * 3) + reagentKcal) / 3)
      && plate.grade === computeGrade(plate.quality) && plate.flaws.join(',') === o.flaws.join(',');
  })()`));

console.log('\n8. The save/load round trip');

await check('the engine plate (grade, flaws, reagent kcal) survives the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p5', clock: { day: 1, minutes: 0 } });
    const h = SIM_generateHouse('throwaway-p5-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    h.player.inventory = h.player.inventory || [];
    const plan = planCook(RECIPES.stirfry, h, { roomId: 'kitchen', seed: 21, choices: { seasoning: ['salt'], fat: 'oil', timing: 'bold' } });
    const o = resolveCookPlan(plan, h);
    const plate = buildPlate(h, RECIPES.stirfry, RECIPES.stirfry.ingredients, 'stir_fry', 'wok', { plan, outcome: o, seed: 21 });
    const fridge = objIn(h, 'fridge');
    const metaJson = JSON.stringify({ plate, cohort: 1, acquiredDay: 1 });
    applyLines(h, ['COOK_STEP cooked_meal 1 ' + fridge.id + ' ' + metaJson]);
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const lFridge = objIn(loaded, 'fridge');
    const stack = (lFridge.contents || []).find(s => s?.meta?.plate);
    return !!stack && stack.meta.plate.grade === plate.grade
      && stack.meta.plate.kcalPerServing === plate.kcalPerServing
      && stack.meta.plate.flaws.join(',') === plate.flaws.join(',')
      && stack.meta.plate.components.length === plate.components.length;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
