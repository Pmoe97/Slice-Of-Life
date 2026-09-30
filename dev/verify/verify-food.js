// Food decay verification — the continuous, five-stage freshness ladder.
//
// The bug this exists to keep fixed: freshness read `clock.day` alone, so
// elapsed time was quantised to whole days. Nothing aged inside a day and
// then everything aged a full day at once at rollover, which meant a 1-day
// takeout dish was Fresh right up to midnight and Rotten immediately after —
// it never passed through a single one of the rungs the UI was showing. The
// player-facing symptom was food "going bad" while they set the table,
// because the ladder had no resolution finer than the day it lived in.
//
// Everything below is derived from the def tables and ROT rather than
// restated, so re-tuning a shelf life or a threshold moves the assertions
// with it instead of breaking them.
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

// A stack of `defId` acquired at time 0, read at `hours` in `container`.
// `container` is an OBJECT_DEFS id, or null for the bag/counter baseline.
function freshAt(defId, hours, container) {
  return JSON.parse(api(`JSON.stringify(freshnessOf(
    { defId: '${defId}', qty: 1, meta: { cohort: 0 } },
    ${container ? `OBJECT_DEFS.${container}` : 'null'},
    ${hours} / 24) || null)`));
}

console.log('\nElapsed time is continuous, not quantised to the day');
check('the clock converts to fractional days',
      api(`gameDaysNow({ day: 5, minutes: 720 })`) === 5.5,
      `got ${api(`gameDaysNow({ day: 5, minutes: 720 })`)}`);
check('and midnight is a whole day exactly',
      api(`gameDaysNow({ day: 5, minutes: 0 })`) === 5);
check('a missing clock reads null rather than day 0',
      api(`gameDaysNow(undefined)`) === null && api(`gameDaysNow({ minutes: 60 })`) === null);
// The regression proper: within a single day the ladder must MOVE. Under the
// old model every one of these hours returned the identical key.
const withinDay = [1, 5, 10, 14, 20].map(h => freshAt('dish_bacon_burger', h, null).key);
check('a short-life dish walks the ladder inside one day',
      new Set(withinDay).size >= 3,
      `hours 1/5/10/14/20 gave ${JSON.stringify(withinDay)} — the day-resolution bug is back`);
check('and it is monotonic — food never gets fresher by waiting',
      api(`(() => {
        let prev = -1;
        for (let m = 0; m <= 60 * 24 * 30; m += 20) {
          const p = freshnessOf({ defId: 'meal_pasta', qty: 1, meta: { cohort: 0 } }, null, m / 1440).pct;
          if (p < prev) return false;
          prev = p;
        }
        return true;
      })()`));

console.log('\nThe ladder has five rungs and reaches all of them');
const RUNGS = ['fresh', 'good', 'stale', 'spoiled', 'rotten'];
check('ROT.labels names exactly the five rungs',
      JSON.stringify(Object.keys(api(`JSON.stringify(ROT.labels)`) ? JSON.parse(api(`JSON.stringify(ROT.labels)`)) : {})) === JSON.stringify(RUNGS),
      `got ${api(`JSON.stringify(Object.keys(ROT.labels))`)}`);
check('the "good" rung carries an EMPTY label on purpose',
      api(`ROT.labels.good`) === '',
      'food that is simply fine must get no tag, or the tags stop meaning anything');
check('every other rung has one',
      RUNGS.filter(k => k !== 'good').every(k => api(`ROT.labels['${k}']`).length > 0));
// Sweep a real dish at 15-minute resolution and collect the rungs it passes.
const walked = JSON.parse(api(`(() => {
  const seen = [];
  for (let m = 0; m <= 60 * 24 * 5; m += 15) {
    const k = freshnessOf({ defId: 'dish_bacon_burger', qty: 1, meta: { cohort: 0 } }, null, m / 1440).key;
    if (seen[seen.length - 1] !== k) seen.push(k);
  }
  return JSON.stringify(seen);
})()`));
check('a dish left out passes through all five in order',
      JSON.stringify(walked) === JSON.stringify(RUNGS),
      `walked ${JSON.stringify(walked)}`);

console.log('\nFresh is an absolute window, not a fraction of shelf life');
// A fraction alone would call month-keeping butter Fresh for days. The
// absolute cap is what makes "Fresh" mean "recently made" for everything.
check('butter is not Fresh for days just because it keeps for weeks',
      freshAt('butter', api(`ROT.freshHours`) + 1, null).key === 'good',
      `butter at ${api(`ROT.freshHours`)}h+1 read ${freshAt('butter', api(`ROT.freshHours`) + 1, null).key}`);
check('but it IS fresh inside the window',
      freshAt('butter', api(`ROT.freshHours`) - 1, null).key === 'fresh');
check('and a short-life item leaves Fresh EARLIER than the cap, on the fraction',
      api(`(() => {
        const shelfH = ITEM_DEFS.dish_milkshake.perishable.days * 24;
        return ROT.stages.good * shelfH < ROT.freshHours;
      })()`) === true
      && freshAt('dish_milkshake', api(`ROT.stages.good * ITEM_DEFS.dish_milkshake.perishable.days * 24`) + 0.1, null).key !== 'fresh',
      'a milkshake must stop being fresh on its own short clock, not the 4h cap');

console.log('\nThe player-reported scenario: takeout, then a couple of hours of setup');
// Order arrives 18:00 on day 5; the player collects it, sets the table and
// invites someone. That is the sequence that used to serve spoiled food.
for (const h of [0, 1, 2, 3]) {
  check(`${h}h after the handover the burger is still Fresh`,
        freshAt('dish_bacon_burger', h, null).key === 'fresh',
        `read ${freshAt('dish_bacon_burger', h, null).key} at pct ${freshAt('dish_bacon_burger', h, null).pct}`);
}
check('an order left on the doormat survives the night to breakfast',
      freshAt('dish_bacon_burger', 12, 'doormat').edible === true,
      'delivered food must not be refuse by morning');
check('groceries left on the doormat survive to a reasonable hour',
      freshAt('chicken_raw', 8, 'doormat').edible === true,
      'a Nile order must not rot before the player gets up');

console.log('\nContainers stretch the whole ladder, not just its end');
check('the fridge holds leftovers for days and the counter does not',
      freshAt('meal_pasta', 48, 'fridge').key === 'good'
      && freshAt('meal_pasta', 48, null).key === 'rotten');
check('preservation scales effective shelf life exactly',
      api(`effectiveShelfDays(ITEM_DEFS.meal_pasta, OBJECT_DEFS.fridge)
           === ITEM_DEFS.meal_pasta.perishable.days * preservationFor(OBJECT_DEFS.fridge)
           && preservationFor(OBJECT_DEFS.fridge) === ROT.preservation.fridge`));
check('a doormat is kinder than a floor — covered hallway vs. dropped on the ground',
      api(`preservationFor(OBJECT_DEFS.doormat) > preservationFor(OBJECT_DEFS.floor)`));
// Moving between containers must preserve the FRACTION consumed, not reset it.
check('moving food between containers keeps the fraction it has used up',
      api(`(() => {
        const s = { defId: 'meal_pasta', qty: 1, meta: { cohort: 0 } };
        const before = freshnessOf(s, OBJECT_DEFS.fridge, 2).pct;
        const moved = retimeStack(s, OBJECT_DEFS.fridge, null, 2);
        const after = freshnessOf(moved, null, 2).pct;
        return Math.abs(before - after) < 1e-9;
      })()`),
      'taking the pasta out of the fridge must not cost it a week');

console.log('\nRotten is refuse, not a bad meal');
check('freshnessOf marks it inedible',
      freshAt('meal_pasta', 24 * 10, null).edible === false
      && freshAt('meal_pasta', 1, null).edible === true);
check('ROT declares no restore multiplier for it',
      api(`ROT.rottenRestoreMultiplier === undefined && ROT.spoiledRestoreMultiplier !== undefined`),
      'a rotten multiplier would mean something still expects to eat it');
check('the penalties sit on Spoiled, the last rung you can actually eat',
      api(`ROT.spoiledMoodPenalty > 0 && ROT.spoiledEnergyPenalty > 0`));
check('and the ladder is ordered so Spoiled is reachable before Rotten',
      api(`ROT.stages.good < ROT.stages.stale && ROT.stages.stale < ROT.stages.spoiled && ROT.stages.spoiled < 1`));

console.log('\nStacks merge by age, and a merge never flatters the older one');
check('food bought minutes apart still merges into one stack',
      api(`(() => {
        let s = addStack([], 'milk', 1, null, {}, 5.0);
        s = addStack(s, 'milk', 1, null, {}, 5.0 + 1 / 24);
        return s.length === 1 && s[0].qty === 2;
      })()`),
      'continuous anchors must not split a shopping trip into a stack per minute');
check('but a week-old stack and a fresh one stay apart',
      api(`(() => {
        let s = addStack([], 'milk', 1, null, {}, 1);
        s = addStack(s, 'milk', 1, null, {}, 8);
        return s.length === 2;
      })()`));
check('and a merge keeps the OLDER anchor',
      api(`(() => {
        let s = addStack([], 'milk', 1, null, {}, 5.2);
        s = addStack(s, 'milk', 1, null, {}, 5.0);
        return s.length === 1 && s[0].meta.cohort === 5.0;
      })()`),
      'merging a fresh delivery in must never make the old stack read newer');
check('non-perishables merge freely, exactly as before',
      api(`addStack(addStack([], 'rice', 1, null, {}, 1), 'rice', 1, null, {}, 40).length === 1`));

console.log('\nShelf lives read as room-temperature time to INEDIBLE');
// The whole def table is authored against one sentence; these bound it
// rather than restating each number, so a re-tune stays free.
check('nothing perishable claims to outlast a month on the counter',
      api(`Object.values(ITEM_DEFS).filter(d => d.perishable?.days > 31).map(d => d.id).join(',')`) === '',
      api(`Object.values(ITEM_DEFS).filter(d => d.perishable?.days > 31).map(d => d.id).join(',')`));
check('raw meat is the shortest-lived thing you can buy',
      api(`(() => {
        const meat = Math.max(ITEM_DEFS.chicken_raw.perishable.days, ITEM_DEFS.ground_beef.perishable.days);
        return Object.values(ITEM_DEFS)
          .filter(d => d.category === 'ingredient' && d.perishable?.days)
          .every(d => d.perishable.days >= meat || d.id === 'chicken_raw' || d.id === 'ground_beef');
      })()`));
// Takeout beats home cooking on hunger and mood — that is what the markup
// buys — and pays for it on shelf life (DEFS.WORLD's delivered-dish block
// says so in prose; this is the same claim as an assertion). The one
// permitted exception is a deliberately shelf-stable item: fortune cookies
// are a packaged biscuit, not a meal in a foil tray.
check('no delivered dish keeps longer than home cooking, bar the packaged one',
      api(`(() => {
        const dishes = Object.values(ITEM_DEFS).filter(d => d.id.startsWith('dish_') && d.perishable?.days);
        const meals  = Object.values(ITEM_DEFS).filter(d => d.id.startsWith('meal_') && d.perishable?.days);
        const bestMeal = Math.max(...meals.map(d => d.perishable.days));
        const over = dishes.filter(d => d.perishable.days > bestMeal).map(d => d.id);
        return over.length === 1 && over[0] === 'dish_fortune_cookies';
      })()`),
      api(`(() => {
        const meals = Object.values(ITEM_DEFS).filter(d => d.id.startsWith('meal_') && d.perishable?.days);
        const bestMeal = Math.max(...meals.map(d => d.perishable.days));
        return 'outlasting the best home meal (' + bestMeal + 'd): ' + Object.values(ITEM_DEFS)
          .filter(d => d.id.startsWith('dish_') && d.perishable?.days > bestMeal).map(d => d.id).join(', ');
      })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
