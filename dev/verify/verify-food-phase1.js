// Food Overhaul Phase 1 — storage, pickup, freezer, thawing.
//
// What this keeps fixed (in the same spirit as verify-food.js — assertions
// read the def tables and ROT rather than restating numbers, so a re-tune
// moves the assertions with it):
//   - the preservation multipliers all live in ONE table (ROT.preservation)
//     and containers reference a row by storageClass (D18 / invariant 5);
//   - every food def carries an explicit storageClass hint and the D19
//     sorter (storageClassOf + sortIntoStorage) routes a doormat delivery
//     to the right container by it;
//   - a stack in a freezer does not age AT ALL (D17): its freshness clock
//     is pinned at the moment of freezing, no rot, no mess;
//   - thawing is duration-based (D29): leaving cold storage starts a
//     THAW_TUNING.roomTempThawHours timer, and once fully thawed the
//     freshness clock resumes exactly where it was frozen — the frozen
//     span is never charged;
//   - transfers are where the freezer lifecycle happens (retimeStack), and
//     a fully-thawed stack normalizes back onto the normal clock;
//   - frozen and never-frozen stacks of the same item never merge.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts — a truthy failure MESSAGE
  // must not count as a pass (it becomes the printed detail instead).
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

console.log('\nPreservation is consolidated into one owning table (D18)');
check('containers reference preservation by storageClass, not a scattered number',
      api(`preservationFor(OBJECT_DEFS.fridge) === ROT.preservation.fridge
           && preservationFor(OBJECT_DEFS.pantry) === ROT.preservation.pantry
           && preservationFor(OBJECT_DEFS.doormat) === ROT.preservation.doormat
           && preservationFor(OBJECT_DEFS.floor) === ROT.preservation.floor
           && preservationFor(OBJECT_DEFS.freezer) === ROT.preservation.freezer`));
check('a def with no storageClass resolves to the bag baseline',
      api(`preservationFor(null) === ROT.bagPreservation
           && preservationFor(OBJECT_DEFS.wardrobe) === ROT.bagPreservation`));
check('the legacy numeric field still works for pre-consolidation defs',
      api(`preservationFor({ container: { preservation: 3.0 } }) === 3.0`));
check('the ladder is gentler than the pre-overhaul tuning (D18)',
      api(`ROT.preservation.fridge > 4 && ROT.graceDays > 2 && ROT.freshHours > 4
           && ROT.stages.good > 0.15 && ROT.stages.stale > 0.45 && ROT.stages.spoiled > 0.75`));
check('the freezer exists as a kitchen container',
      api(`!!OBJECT_DEFS.freezer
           && OBJECT_DEFS.freezer.container.storageClass === 'freezer'
           && APARTMENT_LAYOUT.kitchen.some(p => p.defId === 'freezer')
           && FACILITY_STARTING_TIERS.kitchen_freezer === 'functional'`));
check('starter groceries seed a freezer bucket',
      api(`!!STARTER_GROCERIES.freezer && STARTER_GROCERIES.freezer.some(g => g.defId === 'frozen_pizza')`));
check('starter freezer food is stamped frozen at seed (D17)',
      api(`(() => {
        const objects = { room_kitchen: { fz: { defId: 'freezer', contents: [] } } };
        seedStarterGroceries(objects);
        const s = objects.room_kitchen.fz.contents[0];
        return !!s && s.meta.frozen && s.meta.frozen.thawStartAbs === null
          && s.meta.frozen.agedFraction === 0 && thawProgress(s, 5) === 'frozen';
      })()`));

console.log('\nEvery food def carries a storage class and the sorter reads it (D19)');
check('perishables and drinks sort to the fridge, dry goods to the pantry',
      api(`storageClassOf(ITEM_DEFS.milk) === 'fridge'
           && storageClassOf(ITEM_DEFS.dish_pepperoni_pizza) === 'fridge'
           && storageClassOf(ITEM_DEFS.meal_soup) === 'fridge'
           && storageClassOf(ITEM_DEFS.bottled_water) === 'fridge'`));
check('frozen foods sort to the freezer',
      api(`storageClassOf(ITEM_DEFS.frozen_pizza) === 'freezer'
           && storageClassOf(ITEM_DEFS.comfort_ice_cream) === 'freezer'`));
check('long-shelf staples sort to the pantry',
      api(`storageClassOf(ITEM_DEFS.pasta_dry) === 'pantry'
           && storageClassOf(ITEM_DEFS.rice) === 'pantry'
           && storageClassOf(ITEM_DEFS.flour) === 'pantry'`));
check('non-food items have no storage class and are never auto-sorted',
      api(`storageClassOf(ITEM_DEFS.dish_soap) === null && storageClassOf(ITEM_DEFS.toothpaste) === null`));
check('every perishable def carries an explicit hint',
      api(`Object.values(ITEM_DEFS)
            .filter(d => d.perishable?.days && d.id !== '_unknown')
            .every(d => ['fridge', 'freezer'].includes(d.storageClass))`),
      api(`Object.values(ITEM_DEFS).filter(d => d.perishable?.days && !d.storageClass).map(d => d.id).join(',')`));
check('the sorter plans a mixed delivery against the real kitchen containers',
      api(`(() => {
        const gs = { objects: { room_kitchen: {} } };
        gs.objects.room_kitchen.f1 = { id: 'o1', defId: 'fridge', contents: [] };
        gs.objects.room_kitchen.f2 = { id: 'o2', defId: 'freezer', contents: [] };
        gs.objects.room_kitchen.p1 = { id: 'o3', defId: 'pantry', contents: [] };
        const delivery = [
          { defId: 'milk', qty: 1 }, { defId: 'frozen_pizza', qty: 1 },
          { defId: 'pasta_dry', qty: 2 }, { defId: 'dish_soap', qty: 1 },
        ];
        const plan = sortIntoStorage(gs, delivery);
        const by = Object.fromEntries(plan.placed.map(p => [p.defId, p.objId]));
        return by.milk === 'o1' && by.frozen_pizza === 'o2' && by.pasta_dry === 'o3'
          && plan.unplaced.length === 1 && plan.unplaced[0].defId === 'dish_soap';
      })()`));
check('a kitchen missing the freezer leaves freezer items unplaced, not invented',
      api(`(() => {
        const gs = { objects: { room_kitchen: { f1: { id: 'o1', defId: 'fridge', contents: [] } } } };
        const plan = sortIntoStorage(gs, [{ defId: 'frozen_pizza', qty: 1 }]);
        return plan.placed.length === 0 && plan.unplaced.length === 1;
      })()`));

console.log('\nFreezing pins the freshness clock (D17)');
check('freezeStack stamps the frozen block and snapshots the age',
      api(`(() => {
        const s = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2 } };
        const f = freezeStack(s, OBJECT_DEFS.fridge, 5);
        return !!f.meta.frozen && f.meta.frozen.thawStartAbs === null
          && Math.abs(f.meta.frozen.agedFraction - (5 - 2) / (1.5 * preservationFor(OBJECT_DEFS.fridge))) < 1e-9;
      })()`));
check('thawProgress walks frozen → thawing → thawed',
      api(`(() => {
        const base = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2 } };
        const storedFrozen = freezeStack(base, OBJECT_DEFS.freezer, 3);   // thawStartAbs null
        const left = { ...storedFrozen, meta: { ...storedFrozen.meta, frozen: { ...storedFrozen.meta.frozen, thawStartAbs: 5 } } };
        return thawProgress(storedFrozen, 4.5) === 'frozen'
          && thawProgress(left, 5.1) === 'thawing'
          && thawProgress(left, 5.5) === 'thawed';
      })()`));
check('a frozen stack does not age across N days while its fridge twin does',
      api(`(() => {
        const frozen = { defId: 'milk', qty: 1, meta: { cohort: 0, frozen: { frozenAtAbs: 1, thawStartAbs: null, agedFraction: 1 / (3 * preservationFor(OBJECT_DEFS.fridge)) } } };
        const twin   = { defId: 'milk', qty: 1, meta: { cohort: 1 } };
        const fPct = freshnessOf(frozen, OBJECT_DEFS.freezer, 10).pct;
        const tPct = freshnessOf(twin, OBJECT_DEFS.fridge, 10).pct;
        return Math.abs(fPct - 1 / (3 * preservationFor(OBJECT_DEFS.fridge))) < 1e-9 && tPct > fPct * 5;
      })()`));
check('a frozen stack never rots and never becomes a mess',
      api(`(() => {
        const fr = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: null, agedFraction: 0.9 } } };
        return freshnessOf(fr, OBJECT_DEFS.freezer, 500).key !== 'rotten';
      })()`));

console.log('\nThawing resumes the clock exactly where it froze (D29)');
check('a stack thawed in the pantry resumes aging from frozenAtAbs, no frozen time charged',
      api(`(() => {
        // Frozen at day 3 with 40% consumed; sits frozen 20 days; moved to
        // the pantry at day 23 (thaw starts). Nothing ages during the 8h
        // thaw window (D29); aging resumes at its end.
        const fr = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: 23, agedFraction: 0.4 } } };
        const thawing = freshnessOf(fr, OBJECT_DEFS.pantry, 23.2);   // 4.8h in — still thawing
        if (thawing.frozenState !== 'thawing' || Math.abs(thawing.pct - 0.4) > 1e-9) return false;
        const shelf = 1.5 * preservationFor(OBJECT_DEFS.pantry);
        const day = 23 + THAW_TUNING.roomTempThawHours / 24 + 0.5;   // thawed, then 0.5 day out
        const thawed = freshnessOf(fr, OBJECT_DEFS.pantry, day);
        const expect = 0.4 + 0.5 / shelf;
        return thawed.frozenState === 'thawed' && Math.abs(thawed.pct - expect) < 1e-9;
      })()`));
check('retimeStack starts the thaw timer when a frozen stack leaves for room temperature',
      api(`(() => {
        const fr = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: null, agedFraction: 0.2 } } };
        const out = retimeStack(fr, OBJECT_DEFS.freezer, OBJECT_DEFS.pantry, 5);
        return out.meta.frozen.thawStartAbs === 5 && thawProgress(out, 5.1) === 'thawing';
      })()`));
check('leaving the freezer for the fridge does NOT start the thaw timer (D29: refrigeration is not room temperature)',
      api(`(() => {
        const fr = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: null, agedFraction: 0.2 } } };
        const out = retimeStack(fr, OBJECT_DEFS.freezer, OBJECT_DEFS.fridge, 5);
        return out.meta.frozen.thawStartAbs === null;
      })()`));
check('a fully-thawed transfer normalizes the stack back onto the normal clock',
      api(`(() => {
        const fr = { defId: 'milk', qty: 1, meta: { cohort: 0, frozen: { frozenAtAbs: 1, thawStartAbs: 3, agedFraction: 0.1 } } };
        const day = 3 + THAW_TUNING.roomTempThawHours / 24 + 0.5;   // thawed, then 0.5 day in the bag
        const out = retimeStack(fr, OBJECT_DEFS.fridge, null, day);
        const expect = 0.1 + 0.5 / (3 * preservationFor(null));
        return out.meta.frozen === undefined
          && Math.abs((day - out.meta.cohort) / (3 * preservationFor(null)) - expect) < 1e-9;
      })()`));
check('entering a freezer from normal storage is a NEW freeze, and re-freezing resets the timer',
      api(`(() => {
        const s = { defId: 'chicken_raw', qty: 1, meta: { cohort: 2 } };
        const f = retimeStack(s, OBJECT_DEFS.pantry, OBJECT_DEFS.freezer, 5);
        if (!f.meta.frozen || f.meta.frozen.thawStartAbs !== null) return false;
        const thawing = { ...f, meta: { ...f.meta, frozen: { ...f.meta.frozen, thawStartAbs: 6 } } };
        const rf = retimeStack(thawing, OBJECT_DEFS.pantry, OBJECT_DEFS.freezer, 7);
        return rf.meta.frozen.thawStartAbs === null && rf.meta.frozen.frozenAtAbs === 7;
      })()`));
check('frozen and never-frozen stacks of the same item never merge',
      api(`(() => {
        const frozen = { defId: 'milk', qty: 1, ownerId: null, meta: { cohort: 5, frozen: { frozenAtAbs: 5, thawStartAbs: null, agedFraction: 0.1 } } };
        let list = addStack([frozen], 'milk', 1, null, { cohort: 5.1 }, 5.1);
        if (list.length !== 2 || list[0].qty !== 1) return false;
        // A second FROZEN stack of the same age merges into the first.
        let again = addStack(list, 'milk', 1, null, { cohort: 5.2, frozen: { frozenAtAbs: 5.2, thawStartAbs: null, agedFraction: 0.1 } }, 5.2);
        return again.length === 2 && again[0].qty === 2 && again[0].meta.frozen != null;
      })()`));

console.log('\nThe spoilage sweep leaves frozen food alone and normalizes thawed stacks');
check('a frozen stack survives the sweep while its fridge twin converts to a mess',
      api(`(() => {
        const gs = { objects: { room_kitchen: { freezer: { defId: 'freezer', state: { rotten_food: 'none' }, contents: [ { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: null, agedFraction: 0.5 } } } ] } } } };
        processSpoilageForDay(gs, 200);
        const frz = gs.objects.room_kitchen.freezer;
        return frz.contents.length === 1 && frz.state.rotten_food === 'none';
      })()`));
check('a thawed, expired stack still converts (nothing gets a free ride post-thaw)',
      api(`(() => {
        const gs = { world: { rooms: { kitchen: {} } }, objects: { room_kitchen: { pantry: { defId: 'pantry', state: { rotten_food: 'none' }, contents: [ { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: 4, agedFraction: 0.99 } } } ] } } } };
        processSpoilageForDay(gs, 4 + THAW_TUNING.roomTempThawHours / 24 + 5);
        const pan = gs.objects.room_kitchen.pantry;
        return pan.contents.length === 0 && pan.state.rotten_food === 'rotten';
      })()`));
check('a thawed-but-still-good stack is normalized (frozen block dropped) by the sweep',
      api(`(() => {
        const gs = { objects: { room_kitchen: { pantry: { defId: 'pantry', state: { rotten_food: 'none' }, contents: [ { defId: 'chicken_raw', qty: 1, meta: { cohort: 2, frozen: { frozenAtAbs: 3, thawStartAbs: 4, agedFraction: 0.2 } } } ] } } } };
        processSpoilageForDay(gs, 4 + THAW_TUNING.roomTempThawHours / 24 + 1);
        const s = gs.objects.room_kitchen.pantry.contents[0];
        return s && s.meta.frozen === undefined && typeof s.meta.cohort === 'number';
      })()`));

console.log('\nSave/load round-trip: the frozen block survives serialization');
check('a frozen stack round-trips through JSON',
      api(`(() => {
        const s = { defId: 'milk', qty: 1, meta: { cohort: 0, frozen: { frozenAtAbs: 1, thawStartAbs: 5, agedFraction: 0.2 } } };
        const back = JSON.parse(JSON.stringify(s));
        return back.meta.frozen.thawStartAbs === 5 && thawProgress(back, 5.1) === 'thawing';
      })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
