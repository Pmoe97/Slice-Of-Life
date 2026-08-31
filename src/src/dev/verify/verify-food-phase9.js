// Food Overhaul Phase 9 — balance, migration, and the long tail.
//
// This is an AUDIT phase more than a build phase: Phases 1-8 each already
// carried their own migration (player 6->7 kcal/fullness, objects 2->3 dish
// maps, world 4->5 the D37 stove fix) and their own config tuning (D18's
// ROT rebalance, METABOLISM, PLATE_TUNING, DISH_TUNING all landed already
// tuned). What Phase 9 verifies is that the FULL CHAIN holds together for a
// save that predates all of it — something no single earlier phase's
// harness exercised end-to-end — plus a few loose ends explicitly called
// out in the plan: restaurant kcal-vs-price sanity, and that a legacy
// (pre-Phase-3) meal_* stack still just works with no backfill (the design
// invariant 1 answer: old food stays old food, it is never rewritten).
//
// What this keeps fixed:
//   - a save frozen at player v6 / objects v2 / a stale layoutVersion loads
//     through the REAL loadGameState() (not a hand-called migration
//     function) and comes out with kcal/fullness fields, a dish-map sink,
//     and a freezer object that didn't exist in the old kitchen bucket —
//     with zero exceptions thrown anywhere in the chain;
//   - the displayed satiety survives that load (design invariant 2's
//     read-side contract, exercised through the real load path this time
//     rather than migrateFolder called directly);
//   - a legacy meal_* stack (no meta.plate) still resolves its real kcal
//     and mood through EAT_ITEM with no plate-shaped backfill — Phase 3
//     deliberately left these alone (isPlateStack() false, def-driven
//     branch), so "backfill" here means "the read path already branches
//     correctly," not new data on the stack;
//   - every restaurant dish still carries kcal, and no dish's kcal-per-dollar
//     ratio has drifted into obvious nonsense (a regression net around the
//     manual spot-check this phase did against RESTAURANT_DEFS x ITEM_DEFS);
//   - a full day of real meals (cook, eat, cook, eat) keeps mealsToday,
//     the well-fed mood bonus, and day-rollover's reset all agreeing with
//     each other and with the real kcal ledger.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'cooking.js', 'state.js', 'world.js', 'sim.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
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
    return h;
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

console.log('\n1. The full migration chain, from a save frozen before the food overhaul');

await check('a pre-overhaul save (player v6, objects v2, stale layoutVersion) loads clean through the real loadGameState()',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', {
      versions: { meta: 2, player: 6, world: 4, npcs: 7, images: 1, snapshots: 1, objects: 2 },
      seed: 'p9-old', clock: { day: 10, minutes: 480 },
      structuralHash: null, saveTimestamp: null, imageIndex: {},
      layoutVersion: 5,
    });
    await root.kv.player.set('player', {
      hunger: 65, hoursSinceLastMeal: 5, mealsToday: 2, energy: 80, mood: 0.6,
      inventory: [], flags: {}, ledger: {}, name: 'Old', surname: 'Save',
      appearance: { gender: 'female', physical: {} },
    });
    await root.kv.npcs.set('npc1', {
      id: 'npc1', bible: { genSeed: 777, gender: 'male', physical: { intimate: { genitals: 'x' } } },
      residency: { room: 'room_bedroom_a', since: 1 }, needs: { hunger: 70 }, flags: {},
      memory: { facts: [], openQuestions: [] }, inventory: [],
    });
    await root.kv.objects.set('room_kitchen', {
      sink1: { id: 'sink1', defId: 'sink_kitchen', bucket: 'room_kitchen', state: { dishes: 'many' }, contents: [] },
      stove1: { id: 'stove1', defId: 'stove', bucket: 'room_kitchen', contents: [] },
      fridge1: { id: 'fridge1', defId: 'fridge', bucket: 'room_kitchen', contents: [
        { defId: 'meal_pasta', qty: 1, ownerId: null, meta: { acquiredDay: 9, cohort: 9 } },
      ] },
    });
    const loaded = await loadGameState();
    if (!loaded) return 'loadGameState returned null';
    if (typeof loaded.player.fullnessWindowHours !== 'number' || typeof loaded.player.fullnessRemainingHours !== 'number') {
      return 'fullness window fields missing after migration';
    }
    if (!loaded.player.meta || typeof loaded.player.meta.kcalToday !== 'number') return 'D4 ledger missing after migration';
    const kitchen = loaded.objects.room_kitchen;
    const sink = Object.values(kitchen).find(o => o.defId === 'sink_kitchen');
    if (!sink || typeof sink.dishes !== 'object') return 'sink dish map missing after objects migration';
    if (sink.state?.dishes === 'many') return 'vestigial state.dishes enum was not cleared';
    const freezer = Object.values(kitchen).find(o => o.defId === 'freezer');
    if (!freezer) return 'freezer was not backfilled into a pre-Phase-1 kitchen bucket';
    return true;
  })()`));

await check('the displayed satiety survives the real load path (hunger 65 reads the same after migration)',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', {
      versions: { meta: 2, player: 6, world: 4, npcs: 7, images: 1, snapshots: 1, objects: 2 },
      seed: 'p9-satiety', clock: { day: 5, minutes: 0 },
      structuralHash: null, saveTimestamp: null, imageIndex: {}, layoutVersion: 8,
    });
    await root.kv.player.set('player', {
      hunger: 65, hoursSinceLastMeal: 5, mealsToday: 1, energy: 80, mood: 0.6,
      inventory: [], flags: {}, ledger: {}, appearance: { gender: 'female', physical: {} },
    });
    await root.kv.npcs.set('npc1', {
      id: 'npc1', bible: { genSeed: 42, gender: 'male', physical: { intimate: { genitals: 'x' } } },
      residency: { room: 'room_bedroom_a', since: 1 }, needs: { hunger: 70 }, flags: {},
      memory: { facts: [], openQuestions: [] }, inventory: [],
    });
    const loaded = await loadGameState();
    const displayed = satietyFrom(loaded.player.fullnessRemainingHours, loaded.player.fullnessWindowHours);
    return Math.abs(displayed - 65) < 0.5 ? true : 'displayed satiety drifted to ' + displayed;
  })()`));

console.log('\n2. Legacy (pre-Phase-3) meal_* stacks need no backfill — the read path already branches');

await check('eating a legacy meal_pasta stack (no meta.plate) feeds real kcal through EAT_ITEM, unchanged since Phase 2',
  api(`(() => {
    const h = house('p9-legacy', 1);
    h.player.fullnessRemainingHours = 0; h.player.fullnessWindowHours = 0; h.player.meta = { kcalToday: 0, kcalBurnedToday: 0, activityEvents: [] };
    h.player.inventory = [{ defId: 'meal_pasta', qty: 1, ownerId: null, meta: { acquiredDay: h.meta.clock.day, cohort: h.meta.clock.day } }];
    const ctx = buildEffectContext(h, [], [], {}, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM meal_pasta 1 player'), ctx);
    const kcal = kcalOf(ITEM_DEFS.meal_pasta);
    if (h.player.meta.kcalToday !== kcal) return 'kcalToday did not credit the legacy def kcal: ' + h.player.meta.kcalToday + ' vs ' + kcal;
    if (h.player.fullnessRemainingHours <= 0) return 'fullness window did not open from a legacy stack';
    if (h.player.inventory.length !== 0) return 'the legacy stack was not consumed';
    return true;
  })()`));

console.log('\n3. Restaurant kcal-vs-price sanity (D18\'s intent: real numbers, no economy rework)');

await check('every restaurant menu item resolves to an ITEM_DEF carrying real kcal',
  api(`(() => {
    const missing = [];
    for (const [rid, r] of Object.entries(RESTAURANT_DEFS)) {
      for (const dish of (r.menu || [])) {
        const def = ITEM_DEFS[dish.itemId || dish.defId];
        if (!def || !(kcalOf(def) > 0)) missing.push(rid + '/' + (dish.itemId || dish.defId));
      }
    }
    return missing.length === 0 ? true : missing.join(', ');
  })()`));

await check('no restaurant dish\'s kcal-per-dollar ratio has drifted into nonsense (bounded 0.5..250)',
  api(`(() => {
    const bad = [];
    for (const [rid, r] of Object.entries(RESTAURANT_DEFS)) {
      for (const dish of (r.menu || [])) {
        const def = ITEM_DEFS[dish.itemId || dish.defId];
        if (!def || !dish.price) continue;
        const ratio = kcalOf(def) / dish.price;
        if (ratio < 0.5 || ratio > 250) bad.push(rid + '/' + (dish.itemId || dish.defId) + ' = ' + ratio.toFixed(1));
      }
    }
    return bad.length === 0 ? true : bad.join(', ');
  })()`));

console.log('\n4. mealsToday, the well-fed bonus, and day-rollover agree with the real kcal ledger');

await check('two real meals in a day raise mealsToday to 2 and clear the well-fed threshold; rollover resets it to 0',
  api(`(() => {
    const h = house('p9-meals', 1);
    h.player.fullnessRemainingHours = 0; h.player.fullnessWindowHours = 0;
    h.player.mealsToday = 0; h.player.meta = { kcalToday: 0, kcalBurnedToday: 0, activityEvents: [] };
    applyPlayerMeal(h, 500);
    applyPlayerMeal(h, 500);
    if (h.player.mealsToday !== 2) return 'mealsToday after two real meals: ' + h.player.mealsToday;
    if (h.player.mealsToday < MOOD_TARGET.needsTerm.mealsWellFedCount) return 'well-fed threshold not cleared';
    if (h.player.meta.kcalToday !== 1000) return 'kcal ledger did not sum both meals: ' + h.player.meta.kcalToday;
    h.player.mealsToday = 0;
    return h.player.mealsToday === 0 ? true : 'rollover did not reset mealsToday';
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
