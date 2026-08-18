// Food Overhaul Phase 2 — the calorie layer and metabolism (D1–D4).
//
// What this keeps fixed (assertions read the def tables and METABOLISM
// rather than restating numbers, so a re-tune moves the assertions with it):
//   - every edible def carries kcal (consumable.kcal, or def.kcal for the
//     four raw inedible ingredients), and kcal never flows through
//     CONSUME_ITEM — only EAT_ITEM feeds the player's ledger (invariant 3);
//   - the D3 fullness curve: ~1h per kcalPerFullnessHour kcal, diminishing
//     returns past the taper, hard-capped, with a floor so a real bite
//     feeds you (fullnessHoursFromKcal);
//   - meal size sets the window: a 300-kcal snack and a 900-kcal dinner at
//     the same clock differ, and a snack under minKcalForMeal feeds you
//     without counting as a meal (D4);
//   - decayPlayerNeeds drains the window at the D2 living rate (activity
//     meter + yesterday's energy balance) and accumulates the D4 ledger;
//     sleep halves the hunger span and idling quarters it (audit B3 + D6);
//   - EAT_ITEM is the only kcal writer for the player, per-serving and
//     freshness-scaled; an NPC's EAT_ITEM feeds their ONE hunger number and
//     never touches the player's meta (invariant 3);
//   - rollEnergyLedger turns yesterday's burn vs intake into today's
//     deficit/surplus/balanced mode and resets the ledger;
//   - resolveMoodTarget carries the deficit/surplus mood term, and its
//     4-arg legacy call still maps the old hour-keyed ladder;
//   - the player 6->7 migration preserves the DISPLAYED satiety while
//     materialising the D3 window fields;
//   - the new fields survive the real writeGeneratedGameState/loadGameState
//     round trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js'] });

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
    return h;
  }
`);

api(`
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

// Reset a house player to a clean metabolic baseline for the assertions.
api(`
  function resetMetabolism(h, { remaining = 0, window = 0 } = {}) {
    h.player.fullnessRemainingHours = remaining;
    h.player.fullnessWindowHours = window;
    h.player.hoursSinceLastMeal = 0;
    h.player.mealsToday = 0;
    h.player.meta = {};
  }
`);

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. Kcal on everything (D1 data pass)');

await check('every edible def carries kcal (consumable.kcal, or def.kcal for the raw inedibles)',
  api(`Object.values(ITEM_DEFS).filter(d => edibleDef(d)).every(d => kcalOf(d) > 0)`),
  api(`Object.values(ITEM_DEFS).filter(d => edibleDef(d) && !(kcalOf(d) > 0)).map(d => d.id).join(',')`));

await check('the four raw inedible ingredients keep top-level kcal but stay OUT of the eat picker',
  api(`!edibleDef(ITEM_DEFS.butter) && !edibleDef(ITEM_DEFS.garlic) && !edibleDef(ITEM_DEFS.flour) && !edibleDef(ITEM_DEFS.sugar)
       && kcalOf(ITEM_DEFS.butter) === 102 && kcalOf(ITEM_DEFS.garlic) === 4
       && kcalOf(ITEM_DEFS.flour) === 228 && kcalOf(ITEM_DEFS.sugar) === 48`));

await check('kcal is never negative and never infinite',
  api(`Object.values(ITEM_DEFS).every(d => kcalOf(d) >= 0 && Number.isFinite(kcalOf(d)))`));

await check('spot-check USDA values across a spread of defs',
  api(`kcalOf(ITEM_DEFS.eggs) === 72 && kcalOf(ITEM_DEFS.milk) === 120 && kcalOf(ITEM_DEFS.rice) === 205
       && kcalOf(ITEM_DEFS.cheese) === 110 && kcalOf(ITEM_DEFS.bacon) === 86 && kcalOf(ITEM_DEFS.pasta_dry) === 200
       && kcalOf(ITEM_DEFS.ground_beef) === 243 && kcalOf(ITEM_DEFS.beer) === 150 && kcalOf(ITEM_DEFS.wine) === 125
       && kcalOf(ITEM_DEFS.granola_bar) === 190 && kcalOf(ITEM_DEFS.instant_noodles) === 290 && kcalOf(ITEM_DEFS.chips) === 260
       && kcalOf(ITEM_DEFS.orange_juice) === 110 && kcalOf(ITEM_DEFS.meal_pasta) === 450`));

await check('per-serving kcal divides the whole by servings (a slice is a quarter pizza)',
  api(`perServingKcal(ITEM_DEFS.dish_pepperoni_pizza) === 650
       && perServingKcal(ITEM_DEFS.frozen_pizza) === 340
       && perServingKcal(ITEM_DEFS.meal_pasta) === 450`));

await check('water stays calorie-free (hydration parked, not silently re-valued)',
  api(`kcalOf(ITEM_DEFS.bottled_water) === 0 && !edibleDef(ITEM_DEFS.bottled_water)`));

console.log('\n2. The D3 fullness curve (fullnessHoursFromKcal)');

await check('zero kcal feeds nothing; the floor saves the smallest real bite',
  api(`fullnessHoursFromKcal(0) === 0 && fullnessHoursFromKcal(100) === METABOLISM.fullnessFloorWindow`));

await check('linear ~1h per kcalPerFullnessHour kcal through the taper point',
  api(`fullnessHoursFromKcal(200) === 1 && fullnessHoursFromKcal(450) === 2.25
       && fullnessHoursFromKcal(600) === 3 && fullnessHoursFromKcal(900) === 4.5
       && fullnessHoursFromKcal(1200) === 6`));

await check('diminishing returns past the taper, hard-capped',
  api(`fullnessHoursFromKcal(1300) === 6 + 0.5 * METABOLISM.fullnessTaperRate
       && fullnessHoursFromKcal(3000) === 10.5
       && fullnessHoursFromKcal(4000) === METABOLISM.fullnessCapHours
       && fullnessHoursFromKcal(20000) === METABOLISM.fullnessCapHours`));

await check('the curve is monotonic and bounded',
  api(`(() => {
    let prev = -1;
    for (let k = 0; k <= 20000; k += 50) {
      const v = fullnessHoursFromKcal(k);
      if (v < prev || v > METABOLISM.fullnessCapHours) return false;
      prev = v;
    }
    return true;
  })()`));

console.log('\n3. Meal size sets the window (D3)');

await check('a 300-kcal snack and a 900-kcal dinner at the same clock differ (1.5h vs 4.5h)',
  api(`fullnessHoursFromKcal(300) === 1.5 && fullnessHoursFromKcal(900) === 4.5
       && fullnessHoursFromKcal(900) > fullnessHoursFromKcal(300) * 2`));

await check('applyPlayerMeal grants the window, feeds the ledger, and counts a real meal',
  api(`(() => {
    const h = house('p2-meal', 1);
    resetMetabolism(h);
    applyPlayerMeal(h, 450);
    return h.player.fullnessWindowHours === 2.25
      && h.player.fullnessRemainingHours === 2.25
      && h.player.mealsToday === 1
      && h.player.meta.kcalToday === 450
      && h.player.hunger === 90;
  })()`));

await check('a meal on a full stomach wastes its size (cap + carryover preserved)',
  api(`(() => {
    const h = house('p2-full', 1);
    resetMetabolism(h, { remaining: 10, window: 5 });
    applyPlayerMeal(h, 1000);
    return h.player.fullnessRemainingHours === 12
      && h.player.fullnessWindowHours === 5;
  })()`));

console.log('\n4. Satiety and the hunger band ladder');

await check('satiety is the fraction of the window remaining (90 = full, 0 = empty)',
  api(`satietyFrom(4, 4) === 90 && satietyFrom(2, 4) === 45 && satietyFrom(0, 4) === 0
       && satietyFrom(16, 18) === 80`));

await check('the legacy one-arg form still maps the old 90 - 5h clock',
  api(`satietyFrom(2) === 80 && satietyFrom(0) === 90 && satietyFrom(18) === 0`));

await check('bands are fraction-of-window, not hours on an 18h clock',
  api(`hungerBand(2, 4).key === 'satisfied' && hungerBand(1, 4).key === 'peckish'
       && hungerBand(0.5, 4).key === 'hungry' && hungerBand(0.05, 4).key === 'very_hungry'
       && hungerBand(0, 4).key === 'starving'`));

await check('the legacy hour-keyed ladder still resolves the same keys',
  api(`hungerBand(10).key === 'hungry' && hungerBand(16).key === 'very_hungry' && hungerBand(19).key === 'starving'`));

console.log('\n5. decayPlayerNeeds drains the window at the living rate');

await check('a 30-min span drains 0.5h of window at rate 1.0 and accrues basal burn',
  api(`(() => {
    const h = house('p2-decay', 1);
    resetMetabolism(h, { remaining: 5, window: 5 });
    const d = decayPlayerNeeds(h.player, 30, h);
    return Math.abs(d.fullnessRemainingHours - 4.5) < 1e-9
      && Math.abs(d.hunger - 81) < 1e-9
      && Math.abs(d.meta.kcalBurnedToday - METABOLISM.basalKcalPerHour * 0.5) < 1e-9
      && Math.abs(d.hoursSinceLastMeal - 0.5) < 1e-9
      && d.fullnessWindowHours === 5
      && d.mealsToday === 0;
  })()`));

await check('sleep halves the hunger span; the ledger burns at the slowed span (audit B3 preserved)',
  api(`(() => {
    const h = house('p2-sleep', 1);
    resetMetabolism(h, { remaining: 5, window: 5 });
    const d = decayPlayerNeeds(h.player, 30, h, { sleeping: true });
    return Math.abs(d.fullnessRemainingHours - 4.75) < 1e-9
      && Math.abs(d.meta.kcalBurnedToday - METABOLISM.basalKcalPerHour * 0.25) < 1e-9;
  })()`));

await check('idling quarters the span (idleDecayMultiplier)',
  api(`(() => {
    const h = house('p2-idle', 1);
    resetMetabolism(h, { remaining: 5, window: 5 });
    const d = decayPlayerNeeds(h.player, 30, h, { idle: true });
    return Math.abs(d.fullnessRemainingHours - 4.875) < 1e-9
      && Math.abs(d.meta.kcalBurnedToday - METABOLISM.basalKcalPerHour * 0.125) < 1e-9;
  })()`));

await check('a pre-migration player (no fullness fields) reads as the legacy 18h window',
  api(`(() => {
    const h = house('p2-legacy', 1);
    delete h.player.fullnessRemainingHours;
    delete h.player.fullnessWindowHours;
    h.player.hoursSinceLastMeal = 3;
    h.player.meta = {};
    const d = decayPlayerNeeds(h.player, 30, h);
    return Math.abs(d.fullnessRemainingHours - 14.5) < 1e-9
      && d.fullnessWindowHours === HUNGER_RHYTHM.starveHours
      && Math.abs(d.hunger - 72.5) < 1e-9;
  })()`));

console.log('\n6. The activity meter and the living rate (D2/D4)');

await check('an idle balanced player runs at baseRate 1.0',
  api(`(() => {
    const h = house('p2-rate0', 1);
    resetMetabolism(h);
    return metabolicRate(h.player, h) === METABOLISM.baseRate;
  })()`));

await check('a workout impulse raises the rate and credits its kcal immediately',
  api(`(() => {
    const h = house('p2-rate1', 1);
    resetMetabolism(h);
    notePlayerActivity(h, METABOLISM.activities.workout.impulse, METABOLISM.activities.workout.kcal, h.meta.clock.day);
    return metabolicRate(h.player, h) === METABOLISM.baseRate + METABOLISM.activities.workout.impulse
      && h.player.meta.kcalBurnedToday === METABOLISM.activities.workout.kcal;
  })()`));

await check('the impulse decays with the half-life (largely gone by tomorrow)',
  api(`(() => {
    const h = house('p2-rate2', 1);
    resetMetabolism(h);
    notePlayerActivity(h, 0.5, 300, h.meta.clock.day);
    const { activityTerm } = advanceActivityEvents(h.player.meta.activityEvents, h.meta.clock.day + 1);
    return Math.abs(activityTerm - 0.5 * Math.pow(0.5, 1 / METABOLISM.activityHalfLifeDays)) < 1e-9;
  })()`));

await check('stacked exercise is capped (activityMaxTerm)',
  api(`(() => {
    const h = house('p2-rate3', 1);
    resetMetabolism(h);
    notePlayerActivity(h, 0.5, 300, h.meta.clock.day);
    notePlayerActivity(h, 0.5, 300, h.meta.clock.day);
    return metabolicRate(h.player, h) === METABOLISM.baseRate + METABOLISM.activityMaxTerm;
  })()`));

await check('yesterday\'s energy balance re-tunes the rate (deficit hot, surplus cool)',
  api(`(() => {
    const h = house('p2-rate4', 1);
    resetMetabolism(h);
    h.player.meta.energyBalance = 'deficit';
    const hot = metabolicRate(h.player, h);
    h.player.meta.energyBalance = 'surplus';
    const cool = metabolicRate(h.player, h);
    h.player.meta.energyBalance = 'balanced';
    const base = metabolicRate(h.player, h);
    return hot === base + METABOLISM.deficitRateAdjust
      && cool === base + METABOLISM.surplusRateAdjust;
  })()`));

console.log('\n7. EAT_ITEM feeds the kcal meal path (real effect pipeline)');

await check('eating a 450-kcal meal grants its window, feeds the ledger, counts a meal, and consumes the item',
  api(`(() => {
    const h = house('p2-eat', 1);
    resetMetabolism(h);
    h.player.inventory = [{ defId: 'meal_pasta', qty: 1 }];
    const ctx = buildEffectContext(h, [], [], {}, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM meal_pasta 1 player'), ctx);
    return h.player.inventory.length === 0
      && h.player.fullnessWindowHours === 2.25
      && h.player.fullnessRemainingHours === 2.25
      && h.player.mealsToday === 1
      && h.player.meta.kcalToday === 450
      && h.player.hunger === 90;
  })()`));

await check('one slice of a 4-serving pizza is a quarter-pizza meal and leaves the rest',
  api(`(() => {
    const h = house('p2-eat2', 1);
    resetMetabolism(h);
    h.player.inventory = [{ defId: 'dish_pepperoni_pizza', qty: 1 }];
    const ctx = buildEffectContext(h, [], [], {}, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM dish_pepperoni_pizza 1 player'), ctx);
    const left = h.player.inventory[0];
    return !!left && left.qty === 1 && left.meta.servingsLeft === 3
      && stackServingsLeft(left) === 3
      && h.player.fullnessWindowHours === 650 / METABOLISM.kcalPerFullnessHour
      && h.player.meta.kcalToday === 650;
  })()`));

await check('a snack under minKcalForMeal feeds you but does NOT count as a meal (D4)',
  api(`(() => {
    const h = house('p2-eat3', 1);
    resetMetabolism(h);
    h.player.inventory = [{ defId: 'granola_bar', qty: 1 }];
    const ctx = buildEffectContext(h, [], [], {}, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM granola_bar 1 player'), ctx);
    return h.player.fullnessWindowHours === 190 / METABOLISM.kcalPerFullnessHour
      && h.player.mealsToday === 0
      && h.player.meta.kcalToday === 190;
  })()`));

console.log('\n8. NPC eating keeps one hunger number (invariant 3)');

await check('an NPC\'s EAT_ITEM restores their hunger and never touches the player ledger',
  api(`(() => {
    const h = house('p2-npc', 2);
    resetMetabolism(h);
    const fridge = Object.values(h.objects.room_kitchen || {}).find(o => o.defId === 'fridge');
    if (!fridge) return false;
    fridge.contents = [{ defId: 'meal_pasta', qty: 1 }];
    const npcId = Object.keys(h.npcs)[0];
    h.npcs[npcId].needs.hunger = 10;
    const ctx = buildEffectContext(h, [], [], h.objects.room_kitchen, h.player.inventory);
    applyEffects(parseEffectDSL('EAT_ITEM meal_pasta 1 ' + fridge.id + ' ' + npcId), ctx);
    return h.npcs[npcId].needs.hunger === 50
      && fridge.contents.length === 0
      && !(h.player.meta.kcalToday > 0)
      && h.player.fullnessRemainingHours === 0
      && h.player.mealsToday === 0;
  })()`));

console.log('\n9. The D4 ledger rolls at day rollover');

await check('a day of real burn becomes a deficit day and the ledger resets',
  api(`(() => {
    const p = { meta: { kcalBurnedToday: 1000, kcalToday: 500 } };
    rollEnergyLedger(p);
    return p.meta.energyBalance === 'deficit'
      && p.meta.kcalToday === 0 && p.meta.kcalBurnedToday === 0;
  })()`));

await check('eating well beyond the burn becomes a surplus day',
  api(`(() => {
    const p = { meta: { kcalBurnedToday: 200, kcalToday: 800 } };
    rollEnergyLedger(p);
    return p.meta.energyBalance === 'surplus';
  })()`));

await check('close days stay balanced',
  api(`(() => {
    const p = { meta: { kcalBurnedToday: 500, kcalToday: 600 } };
    rollEnergyLedger(p);
    return p.meta.energyBalance === 'balanced';
  })()`));

console.log('\n10. The mood target carries the ledger\'s day-mode term');

await check('deficit drags the target, surplus gives a hair back',
  api(`(() => {
    const h = house('p2-mood', 1);
    resetMetabolism(h, { remaining: 4, window: 4 });
    h.player.energy = 100; h.player.hygiene = 100;
    const base = resolveMoodTarget(h.player, h, 0, 4, 4);
    h.player.meta.energyBalance = 'deficit';
    const hot = resolveMoodTarget(h.player, h, 0, 4, 4);
    h.player.meta.energyBalance = 'surplus';
    const cool = resolveMoodTarget(h.player, h, 0, 4, 4);
    return Math.abs(hot - (base + MOOD_TARGET.needsTerm.deficitMoodPenalty)) < 1e-9
      && Math.abs(cool - (base + MOOD_TARGET.needsTerm.surplusMoodBonus)) < 1e-9;
  })()`));

await check('the 4-arg legacy call still maps the old hour-keyed ladder',
  api(`(() => {
    const h = house('p2-mood2', 1);
    resetMetabolism(h, { remaining: 4, window: 4 });
    h.player.energy = 100; h.player.hygiene = 100;
    // Relative comparison: every non-hunger term (social/comfort/energy)
    // cancels, so the ONLY difference between the two calls is the legacy
    // hour-keyed band (h=4 peckish 0, h=10 hungry -0.02).
    const peckish = resolveMoodTarget(h.player, h, 0, 4);
    const hungry = resolveMoodTarget(h.player, h, 0, 10);
    return Math.abs((peckish - hungry) - (hungerBand(4, undefined).moodPenalty - hungerBand(10, undefined).moodPenalty)) < 1e-9;
  })()`));

console.log('\n11. Fullness prose');

await check('the status text reads the band and warns on a deficit day',
  api(`(() => {
    const h = house('p2-text', 1);
    resetMetabolism(h, { remaining: 4, window: 4 });
    const s = fullnessStatusText(h.player, h);
    h.player.meta.energyBalance = 'deficit';
    const d = fullnessStatusText(h.player, h);
    return s.includes('Satisfied') && s.includes('meal is still holding')
      && d.includes('low fuel');
  })()`));

await check('empty reads starving with the eat-now line',
  api(`(() => {
    const h = house('p2-text2', 1);
    resetMetabolism(h, { remaining: 0, window: 4 });
    const s = fullnessStatusText(h.player, h);
    return s.includes('Starving') && s.includes('eat something');
  })()`));

console.log('\n12. The player 6->7 migration preserves the displayed satiety');

await check('hunger 80 -> window 18 / 16h left -> still satiety 80',
  api(`(() => {
    const m = migrateFolder('player', { hunger: 80 }, 6, 7);
    return m.fullnessWindowHours === 18
      && m.fullnessRemainingHours === 16
      && satietyFrom(m.fullnessRemainingHours, m.fullnessWindowHours) === 80
      && m.meta.kcalToday === 0 && m.meta.kcalBurnedToday === 0
      && m.meta.energyBalance === 'balanced' && Array.isArray(m.meta.activityEvents);
  })()`));

await check('hoursSinceLastMeal wins over the hunger-point derivation when present',
  api(`(() => {
    const m = migrateFolder('player', { hunger: 20, hoursSinceLastMeal: 8 }, 6, 7);
    return m.fullnessRemainingHours === 10;
  })()`));

console.log('\n13. Save/load round trip: the new fields survive');

await check('fullness + ledger + activity events survive the real write/load path',
  api(`
    (async () => {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p2', clock: { day: 1, minutes: 0 } });
      const h = SIM_generateHouse('throwaway-p2-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
      h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
      h.player.fullnessRemainingHours = 7;
      h.player.fullnessWindowHours = 5;
      h.player.meta = { kcalToday: 500, kcalBurnedToday: 900, energyBalance: 'deficit', activityEvents: [{ day: 1, amount: 0.5 }] };
      await writeGeneratedGameState(h);
      await forceFlush();
      const loaded = await loadGameState();
      return loaded.player.fullnessRemainingHours === 7
        && loaded.player.fullnessWindowHours === 5
        && loaded.player.meta.kcalToday === 500
        && loaded.player.meta.kcalBurnedToday === 900
        && loaded.player.meta.energyBalance === 'deficit'
        && loaded.player.meta.activityEvents.length === 1
        && loaded.player.meta.activityEvents[0].amount === 0.5;
    })()
  `));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
