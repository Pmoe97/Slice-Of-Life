// Food Overhaul Phase 4 — real dishes, cookware sizes/capabilities, and
// capacity-modeled washing (D9/D10/D11).
//
// What this keeps fixed (assertions read the def tables, DISH_TUNING,
// DISHWASH_TUNING and OBJECT_DEFS rather than restating numbers, so a
// re-tune moves the assertions with it):
//   - D10: DISH_DEFS is the single cookware-capability table — every pot/
//     pan/wok/tray carries a unit weight plus size/capabilities that Phase 5
//     gates its methods on; every table-service dish is 1 unit;
//   - D9: the recipe `leaves` no longer write the old abstract sink
//     state.dishes ladder — cooking/eating produce REAL dish maps via the
//     ADD_DISHES effect. Pasta dirties pot+pan+knife+cutting_board (7
//     units) in the sink and a crusty stove burner; a no-cook sandwich
//     dirties only the prep tools; solo eating leaves a plate+fork on the
//     table; a set meal leaves per-eater plate/cup/fork on the table it
//     happened at plus the existing clutter/spread;
//   - D11: the dirty_dishes signal and room cleanliness derive from the
//     dish MAPS (dishLevelOf), never a stored ladder — same
//     derive-don't-mirror rule as rot;
//   - washing is a capacity model: handWashUnitsFor scales 4→10 with
//     cleaning skill, self.dishes' time cost scales perDishUnit, CLEAN_DISHES
//     drains big items first and the sink before the tables; the dishwasher
//     takes DISHWASH_TUNING.tiers[kitchen_appliances tier] capacityUnits per
//     cycle and is busy cycleMinutes, lazily resolved against the continuous
//     clock (same anchor pattern as the freezer);
//   - the maid/cleaning-service path (cleanRoomObjects) routes loads ≥
//     dishwasherMinLoadUnits through a functional idle machine and hand-washes
//     smaller ones;
//   - the sink hard-block decision is PRESSURE-ONLY (D33): no
//     hasFreeSinkCapacity gate exists anywhere;
//   - the objects 2→3 migration translates a pre-overhaul abstract sink
//     (state.dishes few/many) into a real dish map and stamps the additive
//     dish defaults on every instance;
//   - NPC eat-drive leaves write dish MAPS through applyDriveLeaves, not
//     the ladder;
//   - dish maps + the dishwasher load/cycle record survive the real
//     write/load round trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'sim.js', 'computer.js', 'state.js'] });

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

console.log('\n1. DISH_DEFS — the single cookware-capability table (D10)');

await check('pots/pans/woks/trays carry unit weights plus the size/capabilities Phase 5 gates methods on; service dishes are 1 unit',
  api(`(() => {
    const pot = DISH_DEFS.pot, pan = DISH_DEFS.pan, wok = DISH_DEFS.wok, tray = DISH_DEFS.baking_tray;
    const service = ['plate', 'bowl', 'cup', 'glass', 'fork', 'knife', 'cutting_board'];
    return !!pot && pot.unit === 3 && pot.sizeL === 5
      && ['boil', 'simmer', 'steam'].every(c => pot.capabilities.includes(c))
      && pan.unit === 2 && ['fry', 'saute', 'sear'].every(c => pan.capabilities.includes(c))
      && wok.unit === 2 && wok.capabilities.includes('stir_fry')
      && tray.unit === 2 && ['bake', 'roast'].every(c => tray.capabilities.includes(c))
      && service.every(t => DISH_DEFS[t] && DISH_DEFS[t].unit === 1);
  })()`));

await check('the sink is PRESSURE-ONLY (D33): no hasFreeSinkCapacity gate exists anywhere',
  api(`(() => {
    const free = (typeof ACTION_REQUIREMENT_CHECKERS !== 'undefined' && 'hasFreeSinkCapacity' in ACTION_REQUIREMENT_CHECKERS);
    const inDefs = !!ACTION_DEFS['self.cook']?.requires?.some(r => /SinkCapacity/.test(r));
    return !free && !inDefs;
  })()`));

console.log('\n2. Recipes stop writing the abstract sink ladder (D9)');

await check('no recipe leaf carries a sink/dishes SET_OBJECT_STATE write any more',
  api(`(() => {
    for (const r of Object.values(RECIPES)) {
      for (const l of r.leaves || []) {
        if (/sink_kitchen|dishes/.test(l)) return false;
      }
    }
    return true;
  })()`));

await check('cooking pasta ADD_DISHES pot+pan+knife+cutting_board (7 units) to the sink and keeps the stove burner line',
  api(`(() => {
    const h = house('p4-pasta', 1);
    const pantry = objIn(h, 'pantry');
    const sink = objIn(h, 'sink_kitchen');
    const stove = objIn(h, 'stove');
    pantry.contents = [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }];
    const lines = buildCookEffects(cookCtx(h), { recipe: RECIPES.pasta });
    const dishLines = lines.filter(l => l.startsWith('ADD_DISHES '));
    applyLines(h, lines);
    return dishLines.length === 4
      && sink.dishes.pot === 1 && sink.dishes.pan === 1
      && sink.dishes.knife === 1 && sink.dishes.cutting_board === 1
      && sink.dishUnits === 7
      && lines.some(l => l.startsWith('SET_OBJECT_STATE ') && l.includes('burner'))
      && stove.state.burner === 'crusty'
      && !lines.some(l => l.startsWith('SET_OBJECT_STATE ') && l.includes('dishes'));
  })()`));

await check('a no-cook sandwich dirties only the prep tools (2 units)',
  api(`(() => {
    const h = house('p4-sandwich', 1);
    const pantry = objIn(h, 'pantry');
    const sink = objIn(h, 'sink_kitchen');
    pantry.contents = [{ defId: 'bread', qty: 2 }, { defId: 'cheese', qty: 1 }];
    const lines = buildCookEffects(cookCtx(h), { recipe: RECIPES.sandwich });
    applyLines(h, lines);
    return sink.dishes.knife === 1 && sink.dishes.cutting_board === 1
      && sink.dishUnits === 2
      && !sink.dishes.pot && !sink.dishes.pan && !sink.dishes.plate;
  })()`));

console.log('\n3. Eating dirties the table (D9)');

await check('solo eating leaves a plate + fork (2 units) on the table in the room you ate in',
  api(`(() => {
    const h = house('p4-eat', 1);
    const table = objIn(h, 'kitchen_table');
    const option = { stack: { defId: 'cheese', qty: 1 }, def: ITEM_DEFS.cheese, from: 'player' };
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen };
    const lines = buildEatEffects(ctx, { option, affection: 0 });
    applyLines(h, lines);
    return lines.some(l => l.startsWith('EAT_ITEM '))
      && table.dishes.plate === 1 && table.dishes.fork === 1 && table.dishUnits === 2;
  })()`));

await check('a sit-down meal for the player + 2 roommates leaves 3× plate/cup/fork (9 units) on the table plus clutter/spread',
  api(`(() => {
    const h = house('p4-meal', 2);
    const table = objIn(h, 'kitchen_table');
    const fridge = objIn(h, 'fridge');
    h.player.location = 'kitchen';
    fridge.contents = [];
    const plate = makePlate(h, RECIPES.soup, RECIPES.soup.ingredients, 'simmer', 'pot');
    plateIn(h, fridge.id, plate, { left: 4 });
    const npcIds = Object.keys(h.npcs);
    const option = { stack: fridge.contents[0], def: ITEM_DEFS.cooked_meal, from: fridge.id };
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, presentNpcIds: npcIds };
    const serving = (who) => ({ who, defId: 'cooked_meal', from: fridge.id, def: ITEM_DEFS.cooked_meal, stack: option.stack });
    const prepared = {
      spread: [option],
      attendees: npcIds.map(npcId => ({ npcId, npc: h.npcs[npcId] })),
      servings: [serving('player'), serving(npcIds[0]), serving(npcIds[1])],
      fedNpcIds: npcIds, affection: 0, hasCommitment: false,
    };
    const lines = buildSitEffects(ctx, prepared);
    applyLines(h, lines);
    return table.dishes.plate === 3 && table.dishes.cup === 3 && table.dishes.fork === 3
      && table.dishUnits === 9
      && table.state.clutter === 'cluttered'
      && lines.some(l => l.startsWith('SET_TABLE_SPREAD '));
  })()`));

console.log('\n4. Derived dish state — signals and room grime read the maps');

await check('the dirty_dishes standing signal derives from dish units at the few/many thresholds',
  api(`(() => {
    const h = house('p4-signal', 1);
    const sink = objIn(h, 'sink_kitchen');
    addDishUnits(sink, { plate: 1 });
    const cleanSigs = deriveStandingSignals(h).filter(s => s.signalId === 'dirty_dishes');
    addDishUnits(sink, { plate: 1 }); // 2 units → few
    const fewSigs = deriveStandingSignals(h).filter(s => s.signalId === 'dirty_dishes');
    addDishUnits(sink, { pot: 1 }); // 5 units
    addDishUnits(sink, { pot: 1 }); // 8 units → many
    const manySigs = deriveStandingSignals(h).filter(s => s.signalId === 'dirty_dishes');
    return cleanSigs.length === 0
      && fewSigs.length === 1 && Math.abs(fewSigs[0].intensity - 0.3) < 1e-9
      && manySigs.length === 1 && Math.abs(manySigs[0].intensity - 0.65) < 1e-9;
  })()`));

await check('computeObjectGriminess reads dishLevelOf for the sink dirtyWhen dishes key',
  api(`(() => {
    const h = house('p4-grime', 1);
    const sink = objIn(h, 'sink_kitchen');
    const def = OBJECT_DEFS.sink_kitchen;
    addDishUnits(sink, { plate: 1 }); // 1 unit → clean → no grime
    const g1 = computeObjectGriminess(def, sink);
    addDishUnits(sink, { bowl: 2 }); // 3 units → few → 0.4
    const g2 = computeObjectGriminess(def, sink);
    return g1 === 0 && Math.abs(g2 - 0.4) < 1e-9;
  })()`));

console.log('\n5. Hand-wash is a capacity model (D11)');

await check('handWashUnitsFor scales 4 → 10 with cleaning skill',
  api(`(() => {
    const base = handWashUnitsFor({});
    const max = handWashUnitsFor({ skills: { cleaning: SKILLS.maxLevel * SKILLS.maxLevel * SKILLS.xpPerLevelBase } });
    return base === DISHWASH_TUNING.handWashBaseUnits
      && max === DISHWASH_TUNING.handWashMaxUnits
      && base === 4 && max === 10;
  })()`));

await check('prepareDishes measures the wash scope and caps at capacity; buildDishesEffects clears the sink first, big items first',
  api(`(() => {
    const h = house('p4-wash', 1);
    const sink = objIn(h, 'sink_kitchen');
    const table = objIn(h, 'kitchen_table');
    addDishUnits(sink, { pot: 1, pan: 1, knife: 1, cutting_board: 1 }); // 7 units
    addDishUnits(table, { plate: 2, fork: 2 });                          // 4 units
    const prepared = prepareDishes(cookCtx(h));
    const lines = buildDishesEffects(cookCtx(h), prepared);
    applyLines(h, lines);
    // 4-unit capacity: pot (3) + knife (1) cleared from the SINK, big-first;
    // pan + board remain in the sink, the table is untouched.
    return prepared.capacity === 4 && prepared.units === 4 && prepared.scopeUnits === 11
      && prepared.dirty === 2
      && lines[0].startsWith('CLEAN_DISHES ' + sink.id)
      && sink.dishes.pan === 1 && sink.dishes.cutting_board === 1
      && !('pot' in sink.dishes) && !('knife' in sink.dishes)
      && sink.dishUnits === 3
      && table.dishUnits === 4;
  })()`));

await check('self.dishes time cost scales perDishUnit and stays in the min/max band',
  api(`(() => {
    const h = house('p4-time', 1);
    const tc = ACTION_DEFS['self.dishes'].timeCost;
    const minutes = resolveTimeCost(ACTION_DEFS['self.dishes'], h, { units: 4 }, 'player');
    return tc.perDishUnit === 2 && tc.base === 5 && tc.min === 5 && tc.max === 40
      && minutes >= tc.min && minutes <= 5 + 4 * tc.perDishUnit;
  })()`));

console.log('\n6. The dishwasher (D11)');

await check('LOAD_DISHWASHER drains the sink into the load; RUN_DISHWASHER anchors a cycle that resolves lazily',
  api(`(() => {
    const h = house('p4-dw', 1);
    const dw = objIn(h, 'dishwasher');
    const sink = objIn(h, 'sink_kitchen');
    addDishUnits(sink, { pot: 1, pan: 1, plate: 2 }); // 3+2+2 = 7 units
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('LOAD_DISHWASHER ' + dw.id + ' 7'), ctx);
    applyEffects(parseEffectDSL('RUN_DISHWASHER ' + dw.id), ctx);
    const now = gameDaysNow(h.meta.clock);
    const cycleDays = dishwasherCycleMinutes(h) / (CLOCK.ticksPerDay * 30);
    const progress = dishwasherCycleProgress(dw, now);
    const doneProgress = dishwasherCycleProgress(dw, now + cycleDays + 0.0001);
    // Capture the post-RUN values BEFORE resolve (the resolver empties the
    // clean load and flips the derived cycle state back to idle).
    const runningState = dw.state && dw.state.cycle;
    const anchor = dw.dishwasher.cycleActiveUntilAbs;
    const load = dishwasherLoadUnits(dw);
    const loadPot = dw.dishwasher.load.pot, loadPan = dw.dishwasher.load.pan, loadPlate = dw.dishwasher.load.plate;
    const sinkUnits = sink.dishUnits;
    resolveDishwasherCycle(dw, now + cycleDays + 0.0001);
    return progress === 'running'
      && runningState === 'running'
      && anchor > now
      && doneProgress === 'done'
      && load === 7
      && loadPot === 1 && loadPan === 1 && loadPlate === 2
      && sinkUnits === 0
      && dishwasherLoadUnits(dw) === 0
      && (dw.state && dw.state.cycle) === 'idle'
      && dishwasherCycleProgress(dw, now + cycleDays + 0.0001) === 'idle';
  })()`));

await check('dishwasher capacity/cycle length key off the kitchen_appliances facility tier',
  api(`(() => {
    const gs = (tier) => ({ world: { upgrades: { kitchen_appliances: { tier } } } });
    return dishwasherCapacityUnits(gs('broken')) === 0 && dishwasherCycleMinutes(gs('broken')) === 0
      && dishwasherCapacityUnits(gs('functional')) === 8 && dishwasherCycleMinutes(gs('functional')) === 45
      && dishwasherCapacityUnits(gs('upgraded')) === 12 && dishwasherCycleMinutes(gs('upgraded')) === 40;
  })()`));

await check('cleanRoomObjects routes loads ≥ minLoadUnits through a functional idle machine and hand-washes smaller ones',
  api(`(() => {
    // ≥ dishwasherMinLoadUnits → machine, cycle starts, sink empties.
    const h = house('p4-clean-dw', 1);
    const dw = objIn(h, 'dishwasher');
    const sink = objIn(h, 'sink_kitchen');
    addDishUnits(sink, { plate: 4, bowl: 1, fork: 2 }); // 7 units
    const now = gameDaysNow(h.meta.clock);
    const cleaned = cleanRoomObjects(h, 'kitchen');
    const viaMachine = dishwasherCycleProgress(dw, now) === 'running'
      && dishwasherLoadUnits(dw) === 7 && sink.dishUnits === 0;
    // < minLoadUnits → hand-washed, machine never started.
    const h2 = house('p4-clean-hand', 1);
    const dw2 = objIn(h2, 'dishwasher');
    const sink2 = objIn(h2, 'sink_kitchen');
    addDishUnits(sink2, { plate: 1, fork: 1 }); // 2 units
    const now2 = gameDaysNow(h2.meta.clock);
    const cleaned2 = cleanRoomObjects(h2, 'kitchen');
    const byHand = dishwasherCycleProgress(dw2, now2) === 'idle'
      && dishwasherLoadUnits(dw2) === 0 && sink2.dishUnits === 0;
    return cleaned > 0 && cleaned2 > 0 && viaMachine && byHand;
  })()`));

console.log('\n7. Migration and NPC plumbing');

await check('the objects 2→3 migration turns an abstract sink ladder into a real dish map and stamps the additive defaults',
  api(`(() => {
    const oldSink = { id: 'sink1', defId: 'sink_kitchen', state: { dishes: 'many' } };
    const oldClean = { id: 'sink2', defId: 'sink_kitchen', state: {} };
    const oldDw = { id: 'dw1', defId: 'dishwasher', state: { cycle: 'idle' } };
    const out = migrateFolder('objects', { sink1: oldSink, sink2: oldClean, dw1: oldDw }, 2, 3);
    const mSink = out.sink1, mClean = out.sink2, mDw = out.dw1;
    return mSink.dishes.plate === 4 && mSink.dishes.bowl === 2 && mSink.dishes.pot === 1
      && mSink.dishUnits === 9
      && mSink.state.dishes === 'clean'
      && mClean.dishes && mClean.dishUnits === 0
      && mDw.dishwasher && mDw.dishwasher.load && mDw.dishwasher.cycleActiveUntilAbs === 0
      && mDw.dishes && mDw.dishUnits === 0;
  })()`));

await check('the NPC eat drive writes dish MAPS through applyDriveLeaves',
  api(`(() => {
    const h = house('p4-drive', 1);
    const sink = objIn(h, 'sink_kitchen');
    applyDriveLeaves(h, { sink_kitchen: { dishes: { plate: 1, fork: 1 } } }, 'kitchen');
    return sink.dishes.plate === 1 && sink.dishes.fork === 1 && sink.dishUnits === 2;
  })()`));

await check('the dishwasher chip only lights for a machine that is not mid-cycle (dishwasherReady)',
  api(`(() => {
    const h = house('p4-gate', 1);
    const ctx = cookCtx(h);
    const dw = objIn(h, 'dishwasher');
    const ready = ACTION_REQUIREMENT_CHECKERS.dishwasherReady(ctx);
    const now = gameDaysNow(h.meta.clock);
    dw.dishwasher = { load: { plate: 2 }, cycleActiveUntilAbs: now + 0.1 };
    dw.state = { ...dw.state, cycle: 'running' };
    const midCycle = ACTION_REQUIREMENT_CHECKERS.dishwasherReady(ctx);
    return ready === true && midCycle !== true;
  })()`));

console.log('\n8. Save/load round trip');

await check('sink dish maps and a dishwasher load survive the real write/load path',
  api(`
    (async () => {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p4', clock: { day: 1, minutes: 0 } });
      const h = SIM_generateHouse('throwaway-p4-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
      h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
      h.player.inventory = h.player.inventory || [];
      const sink = objIn(h, 'sink_kitchen');
      const dw = objIn(h, 'dishwasher');
      addDishUnits(sink, { pot: 1, plate: 2 }); // 3+2 = 5 units
      const { moved } = moveDishUnitsToLoad(dw, sink, 3); // pot (3) loads, plate stays
      await writeGeneratedGameState(h);
      await forceFlush();
      const loaded = await loadGameState();
      const lSink = objIn(loaded, 'sink_kitchen');
      const lDw = objIn(loaded, 'dishwasher');
      return moved === 3
        && lSink.dishes.plate === 2 && lSink.dishUnits === 2
        && lDw.dishwasher.load.pot === 1 && dishwasherLoadUnits(lDw) === 3;
    })()
  `));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
