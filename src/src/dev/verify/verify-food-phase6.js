// Food Overhaul Phase 6 — equipment tiers modulate the engine, and
// grade-gated auto-cook unlocks (D12/D13/D14/D15).
//
// What this keeps fixed (assertions read EQUIPMENT_DEFS/AUTO_COOK_TUNING/
// GRADES rather than restating numbers, so a re-tune moves the assertions
// with it):
//   - EQUIPMENT_DEFS is the single owning table: each equipment names its
//     FACILITY_DEFS and carries per-tier rows; equipmentState composes the
//     rows the CURRENT world.upgrades tier picks. Tier-1 (functional, the
//     day-one baseline) must reproduce Phase 5's numbers exactly — a fresh
//     house is the phase-5 engine plus nothing.
//   - D12 gates: mixing verbs (knead/whip/blend) are mixer-unlocked — a
//     broken kitchen_appliances loses them, functional restores them, and
//     the plan's mix-step minutes scale with the mixer's processTimeMult.
//     The dishwasher and microwave re-key through EQUIPMENT_DEFS without
//     changing their read shapes (Phase 4's numbers hold).
//   - D13: the same recipe on a tier-3 stove rolls a better grade
//     distribution and burns less than on the tier-1 burner — and the
//     engine stays deterministic per (state, seed) at every tier. The oven
//     only exists on the upgraded Proper Range (D37); bake/roast without
//     one reads as a heat miss (improvising), never a door.
//   - D14: autocookThreshold is base AUTO_COOK_TUNING.baseGrade walked down
//     the GRADES ladder by the stove's autocookSteps; a cook that clears it
//     records a mastery proof (AUTO_COOK_UNLOCK, world.autoCookCleared) and
//     instant cook unlocks forever; the auto plate is floored at the
//     threshold's quality. A better stove lowers the bar (the B-grade
//     worked example). The narrator cannot grant proofs.
//   - D15: the auto-cook path consumes real ingredients, yields a real
//     plate with a real grade, and still dirties the cookware.
//   - the auto-cook proof + a fresh plate survive the real write/load
//     round trip.
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
  // Point a facility's tier at any level ('broken'/'functional'/'upgraded').
  function setTier(h, facilityId, tier) {
    h.world.upgrades[facilityId].tier = tier;
    return h;
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
  // Stock a recipe's ingredients by storage class, plus the starter pantry
  // reagents so seasoning choices have something to draw.
  function stockRecipe(h, recipe) {
    const byClass = { pantry: objIn(h, 'pantry'), fridge: objIn(h, 'fridge'), freezer: objIn(h, 'freezer') };
    for (const ing of recipe.ingredients || []) {
      const def = ITEM_DEFS[ing.defId];
      const cls = (def.storageClass || 'pantry');
      const target = byClass[cls] || byClass.pantry;
      const list = target.contents || (target.contents = []);
      const existing = list.find(s => s.defId === ing.defId);
      if (existing) existing.qty += ing.qty; else list.push({ defId: ing.defId, qty: ing.qty, ownerId: null, meta: { acquiredDay: 1 } });
    }
    for (const r of ['oil', 'salt', 'spices']) {
      const list = byClass.pantry.contents || (byClass.pantry.contents = []);
      if (!list.find(s => s.defId === r)) list.push({ defId: r, qty: 2, ownerId: null, meta: { acquiredDay: 1 } });
    }
    return h;
  }
  function plateStack(h, objId) {
    const obj = findObjectById(h, objId);
    const list = obj ? obj.contents : h.player.inventory;
    return (list || []).find(s => s?.meta?.plate) || null;
  }
  function gradeMin(grade) {
    return GRADES.find(g => g.grade === grade)?.min ?? 0;
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

console.log('\\n1. EQUIPMENT_DEFS — the single owning table, tier-1 reproduces Phase 5');

await check('every equipment names its FACILITY_DEFS and the facility actually exists',
  api(`(() => {
    for (const [id, def] of Object.entries(EQUIPMENT_DEFS)) {
      if (!def.facility || !FACILITY_DEFS[def.facility]) return id + ' has no facility';
      if (!def.tiers || def.tiers.length !== 3) return id + ' needs broken/functional/upgraded rows';
    }
    return true;
  })()`));

await check('a fresh house (functional everywhere) reads the Phase-5 baseline exactly',
  api(`(() => {
    const h = house('p6-base', 1);
    const eq = equipmentState(h);
    return eq.burnRiskMult === 1.0 && eq.processTimeMult === 1.0 && eq.tempPrecision === 0
      && eq.burners === 1 && eq.ovenPresent === false && eq.autocookSteps === 0
      && ['whisk', 'knead', 'blend'].every(v => eq.mixingVerbs.includes(v));
  })()`));

await check('an upgraded stove changes what equipmentState reports — burners, precision, oven, autocookSteps',
  api(`(() => {
    const h = setTier(house('p6-up', 1), 'kitchen_stove', 'upgraded');
    const eq = equipmentState(h);
    return eq.burnRiskMult === EQUIPMENT_DEFS.stove.tiers[2].burnRiskMult
      && eq.burners === 4 && eq.tempPrecision === 1 && eq.ovenPresent === true
      && eq.autocookSteps === EQUIPMENT_DEFS.stove.tiers[2].autocookSteps;
  })()`));

await check('equipmentState falls back to the starting tier when upgrades are absent (old saves)',
  api(`(() => {
    const bare = { meta: { clock: { day: 1, minutes: 0 } } };
    const eq = equipmentState(bare);
    return eq.burnRiskMult === 1.0 && eq.mixingVerbs.length === 3 && eq.ovenPresent === false;
  })()`));

console.log('\\n2. D12 — the mixer gates mixing verbs and the dishwasher/microwave re-key');

await check('functional kitchen_appliances has the hand mixer (all mixing verbs); broken has none',
  api(`(() => {
    const a = house('p6-mx', 1);
    const b = setTier(house('p6-mx', 1), 'kitchen_appliances', 'broken');
    return canPerformVerb('knead', a, null) && canPerformVerb('whisk', a, null) && canPerformVerb('blend', a, null)
      && !canPerformVerb('knead', b, null) && !canPerformVerb('whisk', b, null) && !canPerformVerb('blend', b, null)
      && canPerformVerb('chop', b, null);
  })()`));

await check('a better mixer speeds the mixing steps — the plan minutes scale with processTimeMult',
  api(`(() => {
    const base = COOK_TUNING.mixMinutes;
    const a = stockRecipe(house('p6-mx2', 1), RECIPES.omelette);
    const up = stockRecipe(setTier(house('p6-mx2', 1), 'kitchen_appliances', 'upgraded'), RECIPES.omelette);
    const broke = stockRecipe(setTier(house('p6-mx2', 1), 'kitchen_appliances', 'broken'), RECIPES.omelette);
    const mixMin = (h) => planCook(RECIPES.omelette, h, { seed: 7 }).steps.find(s => s.type === 'mix')?.minutes;
    return mixMin(a) === base && mixMin(up) === Math.max(1, Math.round(base * 0.8))
      && mixMin(broke) === Math.max(1, Math.round(base * 1.2))
      && mixMin(up) < mixMin(a) && mixMin(broke) > mixMin(a);
  })()`));

await check('the dishwasher re-keys through EQUIPMENT_DEFS with Phase-4 numbers intact (8/45 → 12/40)',
  api(`(() => {
    const f = house('p6-dw', 1);
    const u = setTier(house('p6-dw', 1), 'kitchen_appliances', 'upgraded');
    return dishwasherCapacityUnits(f) === EQUIPMENT_DEFS.dishwasher.tiers[1].capacityUnits
      && dishwasherCycleMinutes(f) === EQUIPMENT_DEFS.dishwasher.tiers[1].cycleMinutes
      && dishwasherCapacityUnits(u) === EQUIPMENT_DEFS.dishwasher.tiers[2].capacityUnits
      && dishwasherCycleMinutes(u) === EQUIPMENT_DEFS.dishwasher.tiers[2].cycleMinutes
      && EQUIPMENT_DEFS.dishwasher.tiers[1].capacityUnits === 8 && EQUIPMENT_DEFS.dishwasher.tiers[2].capacityUnits === 12;
  })()`));

await check('the microwave reads reheatMinutes by tier and beats the stove reheat every time',
  api(`(() => {
    const f = house('p6-mw', 1);
    const u = setTier(house('p6-mw', 1), 'kitchen_appliances', 'upgraded');
    const fm = microwaveReheatMinutes(f), um = microwaveReheatMinutes(u);
    return fm > 0 && um > 0 && um < fm && fm < ACTION_TUNING.reheatMinutes
      && fm === EQUIPMENT_DEFS.microwave.tiers[1].reheatMinutes
      && um === EQUIPMENT_DEFS.microwave.tiers[2].reheatMinutes;
  })()`));

await check('the self.microwave action resolves its time from the machine, faster than self.reheat',
  api(`(() => {
    const h = house('p6-mwt', 1);
    const def = ACTION_DEFS['self.microwave'];
    const stove = ACTION_DEFS['self.reheat'];
    const mwMin = resolveTimeCost(def, h, { minutes: microwaveReheatMinutes(h), option: { stack: {}, def: {}, from: 'fridge' } }, 'player');
    const stoveMin = resolveTimeCost(stove, h, {}, 'player');
    return mwMin === microwaveReheatMinutes(h) && mwMin < stoveMin
      && def.requires.includes('powerNotCutoff') && def.requires.includes('facilityFunctional:kitchen_appliances')
      && def.source.objDef === 'microwave';
  })()`));

console.log('\\n3. D13 — a tier-3 stove rolls better and burns less, determinism at every tier');

await check('the same recipe over the same seeds: upgraded stove mean quality > tier-1, and fewer burnt batches',
  api(`(() => {
    const choices = { seasoning: ['salt'], fat: 'oil' };
    const a = stockRecipe(house('p6-dist', 1), RECIPES.stirfry);
    const b = stockRecipe(setTier(house('p6-dist', 1), 'kitchen_stove', 'upgraded'), RECIPES.stirfry);
    let q1 = 0, q3 = 0, burnt1 = 0, burnt3 = 0, n = 300;
    for (let s = 0; s < n; s++) {
      const o1 = resolveCookPlan(planCook(RECIPES.stirfry, a, { seed: s, choices }), a);
      const o3 = resolveCookPlan(planCook(RECIPES.stirfry, b, { seed: s, choices }), b);
      q1 += o1.quality; q3 += o3.quality;
      if (o1.flaws.includes('burnt')) burnt1++;
      if (o3.flaws.includes('burnt')) burnt3++;
    }
    q1 /= n; q3 /= n;
    return q3 > q1 + 0.005 && burnt3 < burnt1;
  })()`, 'tier-1 and tier-3 must differ, or the equipment does nothing'));

await check('determinism survives the equipment term: identical (state, seed) is byte-identical at a tier',
  api(`(() => {
    const h = setTier(stockRecipe(house('p6-det', 1), RECIPES.stirfry), 'kitchen_stove', 'upgraded');
    const plan = planCook(RECIPES.stirfry, h, { seed: 424242, choices: { seasoning: ['salt', 'spices'], fat: 'oil', timing: 'bold' } });
    return JSON.stringify(resolveCookPlan(plan, h)) === JSON.stringify(resolveCookPlan(plan, h));
  })()`));

await check('an oven-absent bake/roast reads as a heat miss — the upgraded range bakes better',
  api(`(() => {
    const choices = { seasoning: ['salt'] };
    const a = stockRecipe(house('p6-oven', 1), RECIPES.loaded_potato);
    const b = stockRecipe(setTier(house('p6-oven', 1), 'kitchen_stove', 'upgraded'), RECIPES.loaded_potato);
    let q1 = 0, q3 = 0, n = 200;
    for (let s = 0; s < n; s++) {
      q1 += resolveCookPlan(planCook(RECIPES.loaded_potato, a, { seed: s, choices }), a).quality;
      q3 += resolveCookPlan(planCook(RECIPES.loaded_potato, b, { seed: s, choices }), b).quality;
    }
    q1 /= n; q3 /= n;
    return q3 > q1 + 0.02;
  })()`, 'the oven exists only on the Proper Range (D37); without it baking is improvisation'));

console.log('\\n4. D14 — the auto-cook threshold, the ladder math, and the B-grade worked example');

await check('autocookThreshold is baseGrade at tier-1 and drops down the ladder with the stove',
  api(`(() => {
    const a = house('p6-thr', 1);
    const u = setTier(house('p6-thr', 1), 'kitchen_stove', 'upgraded');
    const base = AUTO_COOK_TUNING.baseGrade;
    const baseIdx = GRADES.findIndex(g => g.grade === base);
    const upIdx = baseIdx + EQUIPMENT_DEFS.stove.tiers[2].autocookSteps;
    return autocookThreshold(RECIPES.pasta, a) === base
      && autocookThreshold(RECIPES.pasta, u) === GRADES[upIdx].grade
      && gradeAtOrAbove('A', 'A-') && gradeAtOrAbove('A-', 'A-') && gradeAtOrAbove('S+', 'S+')
      && !gradeAtOrAbove('B', 'A-') && !gradeAtOrAbove('F', 'B') && !gradeAtOrAbove('bogus', 'A-');
  })()`));

await check("no proof → no auto-cook; a proof at/above the bar unlocks it (A- at tier-1)",
  api(`(() => {
    const h = house('p6-un', 1);
    if (autoCookUnlocked(RECIPES.pasta, h)) return 'unlocked with no proof';
    h.world.autoCookCleared = { pasta: 'A-' };
    return autoCookUnlocked(RECIPES.pasta, h);
  })()`));

await check("D14's worked example: a B-grade cook unlocks under the better stove, not at tier-1",
  api(`(() => {
    const a = house('p6-b', 1);
    a.world.autoCookCleared = { pasta: 'B' };
    const atTier1 = autoCookUnlocked(RECIPES.pasta, a);
    const upgraded = autoCookUnlocked(RECIPES.pasta, setTier(a, 'kitchen_stove', 'upgraded'));
    return atTier1 === false && upgraded === true;
  })()`));

console.log('\\n5. AUTO_COOK_UNLOCK — the mastery proof rides the trusted pipeline');

await check('the narrator cannot grant a proof; a trusted producer can; bad payloads are refused',
  api(`(() => {
    const h = house('p6-eff', 1);
    const ctx = { gameState: h, roomObjects: h.objects.room_kitchen, carryItems: h.player.inventory, presentNpcIds: [], activeNpcIds: [] };
    const asLlm = validateEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'A' } }], ctx, 'llm');
    if (asLlm.rejected.length !== 1) return 'narrator could grant a proof';
    const ok = validateEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'A' } }], ctx, 'trusted');
    if (ok.rejected.length) return 'trusted rejected: ' + ok.rejected[0].reason;
    const badRecipe = validateEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'nope', grade: 'A' } }], ctx, 'trusted');
    const badGrade = validateEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'X-' } }], ctx, 'trusted');
    return badRecipe.rejected.length === 1 && badGrade.rejected.length === 1;
  })()`));

await check('applyAutoCookUnlock records the proof, keeps the BEST grade, and never regresses',
  api(`(() => {
    const h = house('p6-app', 1);
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'A-' } }], ctx);
    if (h.world.autoCookCleared.pasta !== 'A-') return 'proof not recorded';
    applyEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'C' } }], ctx);
    if (h.world.autoCookCleared.pasta !== 'A-') return 'a worse cook regressed the proof';
    applyEffects([{ type: 'AUTO_COOK_UNLOCK', params: { recipeId: 'pasta', grade: 'S' } }], ctx);
    return h.world.autoCookCleared.pasta === 'S';
  })()`));

console.log('\\n6. D15 — the auto-cook path: floor, determinism, real consumption');

await check('autoCookPlate is floored at the threshold quality and grades from the ladder',
  api(`(() => {
    const h = stockRecipe(house('p6-ap', 1), RECIPES.pasta);
    const plate = autoCookPlate(h, RECIPES.pasta, 12345);
    const floor = gradeMin(autocookThreshold(RECIPES.pasta, h));
    return plate.quality >= floor && plate.grade === computeGrade(plate.quality)
      && gradeAtOrAbove(plate.grade, autocookThreshold(RECIPES.pasta, h));
  })()`));

await check('a botched roll still cannot sink a mastered recipe — the floor holds when quality would crater',
  api(`(() => {
    const h = stockRecipe(house('p6-fl', 1), RECIPES.pasta);
    const blandPlan = planCook(RECIPES.pasta, h, { seed: 5, choices: { verbs: {}, seasoning: [], fat: null } });
    const blandOutcome = resolveCookPlan(blandPlan, h);
    if (!blandOutcome.flaws.includes('bland')) return 'bland seed not found';
    const plate = autoCookPlate(h, RECIPES.pasta, 5, blandPlan, blandOutcome);
    return plate.quality === gradeMin('A-') && plate.grade === 'A-' && plate.flaws.includes('bland');
  })()`));

await check('autoCookPlate is deterministic per (state, seed)',
  api(`(() => {
    const h = stockRecipe(house('p6-ad', 1), RECIPES.stirfry);
    return JSON.stringify(autoCookPlate(h, RECIPES.stirfry, 99)) === JSON.stringify(autoCookPlate(h, RECIPES.stirfry, 99));
  })()`));

await check('the full auto path via buildCookEffects: ingredients eaten, plate in the fridge, proof recorded',
  api(`(() => {
    const h = stockRecipe(house('p6-full', 1), RECIPES.stirfry);
    const seed = 7;
    const plan = planCook(RECIPES.stirfry, h, { auto: true, seed });
    const outcome = resolveCookPlan(plan, h);
    const plate = autoCookPlate(h, RECIPES.stirfry, seed, plan, outcome);
    const prepared = { recipe: RECIPES.stirfry, plate, seasoning: plan.seasoning, minutes: plan.minutes, auto: true };
    const lines = buildCookEffects(cookCtx(h), prepared);
    const unlockLine = lines.filter(l => l.startsWith('AUTO_COOK_UNLOCK '));
    if (unlockLine.length !== 1) return 'no unlock line despite a floored plate: ' + lines.join(' | ');
    applyLines(h, lines);
    const landed = plateStack(h, objIn(h, 'fridge').id);
    return !!landed && landed.meta.plate.recipeKey === 'stirfry' && stackServingsLeft(landed) === 2
      && h.world.autoCookCleared.stirfry === plate.grade
      && stackQty(objIn(h, 'pantry').contents, 'oil') === 2 && stackQty(objIn(h, 'pantry').contents, 'salt') === 1;
  })()`));

await check('the auto path still dirties the cookware like any cook (D9 footprint)',
  api(`(() => {
    const h = stockRecipe(house('p6-dish', 1), RECIPES.pasta);
    const seed = 3;
    const plan = planCook(RECIPES.pasta, h, { auto: true, seed });
    const outcome = resolveCookPlan(plan, h);
    const plate = autoCookPlate(h, RECIPES.pasta, seed, plan, outcome);
    applyLines(h, buildCookEffects(cookCtx(h), { recipe: RECIPES.pasta, plate, seasoning: plan.seasoning, minutes: plan.minutes, auto: true }));
    return objIn(h, 'sink_kitchen').dishUnits === 7;
  })()`));

console.log('\\n7. REHEAT via the microwave path still sets wasReheated (shared effect)');

await check('a REHEAT_ITEM (the microwave action\'s effect) marks a plate reheated and keeps the batch',
  api(`(() => {
    const h = house('p6-rh', 1);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    const plan = planCook(RECIPES.pasta, h, { seed: 2, choices: { seasoning: ['salt'] } });
    const plate = buildPlate(h, RECIPES.pasta, RECIPES.pasta.ingredients, 'boil', 'pot', { plan, outcome: resolveCookPlan(plan, h), seed: 2 });
    const metaJson = JSON.stringify({ plate, cohort: gameDaysNow(h.meta.clock), acquiredDay: gameDaysNow(h.meta.clock) });
    applyLines(h, ['COOK_STEP cooked_meal 1 ' + fridge.id + ' ' + metaJson]);
    applyLines(h, ['REHEAT_ITEM cooked_meal ' + fridge.id]);
    const stack = (fridge.contents || []).find(s => s.defId === 'cooked_meal');
    return !!stack && stack.meta.plate.wasReheated === true && stackServingsLeft(stack) === 3;
  })()`));

console.log('\\n8. The save/load round trip');

await check('the mastery proof survives the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p6', clock: { day: 1, minutes: 0 } });
    const h = SIM_generateHouse('throwaway-p6-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    h.world.autoCookCleared = { pasta: 'A-', stirfry: 'S' };
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    return loaded.world.autoCookCleared.pasta === 'A-' && loaded.world.autoCookCleared.stirfry === 'S';
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
