// Shared-meal verification — set_meal as a SPREAD, the player's appearance,
// and the two of them reaching the scene art.
//
// The bug this exists to keep fixed: set_meal served ONE dish and capped the
// eaters at `stackServingsLeft(dish) - 1`. A 1-serving steak with three
// roommates at the table fed the player and left three people sitting there
// collecting an attendance bonus for watching — silently, with no way for the
// player to have catered differently. The fix is a spread whose servings pool
// across dishes, so catering is a decision and under-catering is a stated cost.
//
// The second thing kept fixed here: the player had no appearance at all, so
// IMAGE's buildImagePrompt drew every roommate in a scene and left out the
// person the scene is about.
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

// A spread option in the shape prepareSetMeal builds: { stack, def, from }.
const mkSpread = (entries) => `[${entries.map(([id, qty]) =>
  `{ stack: { defId: '${id}', qty: ${qty ?? 1}, meta: {} }, def: ITEM_DEFS['${id}'], from: 'player' }`).join(', ')}]`;

console.log('\nServings pool across the spread, and everyone takes one');
check('a 1-serving dish still feeds exactly one person',
      api(`allocateSpread(${mkSpread([['dish_bacon_burger', 1]])}, ['player', 'n1', 'n2', 'n3']).length`) === 1);
// The regression, stated as the scenario that motivated the change.
check('but four dishes feed four people — the old cap fed one',
      api(`allocateSpread(${mkSpread([['dish_bacon_burger', 1], ['dish_fries', 1], ['dish_caesar_wedge', 1], ['dish_onion_rings', 1]])}, ['player', 'n1', 'n2', 'n3']).length`) === 4);
check('a multi-serving dish still spends its servings',
      api(`allocateSpread(${mkSpread([['dish_cheese_pizza', 1]])}, ['player', 'n1', 'n2', 'n3']).length`) === 4,
      'a 4-serving pizza should feed four');
check('nobody is served twice while somebody has nothing',
      api(`(() => {
        const served = allocateSpread(${mkSpread([['dish_cheese_pizza', 1], ['dish_fries', 1]])}, ['player', 'n1', 'n2']);
        return new Set(served.map(s => s.who)).size === served.length;
      })()`));
check('and the unfed simply do not appear — that IS the shortfall signal',
      api(`(() => {
        const served = allocateSpread(${mkSpread([['dish_fries', 1]])}, ['player', 'n1', 'n2']);
        return served.length === 1 && served[0].who === 'player';
      })()`),
      'the host serves themselves first, then the table');

console.log('\nAllocation is round-robin, not drain-in-order');
// Draining the first dish would feed a table of four entirely from the pizza
// and leave the fries and salad untouched, which makes laying out a spread
// pointless. This is the assertion that keeps that from regressing.
const rr = JSON.parse(api(`JSON.stringify(allocateSpread(${mkSpread([['dish_cheese_pizza', 1], ['dish_fries', 1], ['dish_caesar_wedge', 1]])}, ['player', 'n1', 'n2', 'n3']).map(s => s.defId))`));
check('a table of four eats some of each dish, not four of the first',
      new Set(rr).size === 3,
      `served ${JSON.stringify(rr)}`);
check('and the big dish is the one with leftovers',
      rr.filter(d => d === 'dish_cheese_pizza').length === 2 && rr[0] === 'dish_cheese_pizza',
      `served ${JSON.stringify(rr)}`);
check('an exhausted dish is skipped rather than serving from nothing',
      api(`(() => {
        const served = allocateSpread(${mkSpread([['dish_fries', 1], ['dish_cheese_pizza', 1]])}, ['player', 'n1', 'n2', 'n3']);
        const fries = served.filter(s => s.defId === 'dish_fries').length;
        return served.length === 4 && fries === 1;
      })()`),
      'the 1-serving fries must be served once, with the pizza covering the rest');
check('the allocator terminates when the whole spread runs out',
      api(`allocateSpread(${mkSpread([['dish_fries', 1]])}, ['player','a','b','c','d','e','f','g']).length`) === 1);

console.log('\nA spread is a better dinner than a single dish');
check('variety raises quality above the mean of the same dishes alone',
      api(`(() => {
        const one  = spreadQuality(${mkSpread([['dish_cheese_pizza', 1]])});
        const many = spreadQuality(${mkSpread([['dish_cheese_pizza', 1], ['dish_fries', 1], ['dish_caesar_wedge', 1]])});
        return many > one;
      })()`));
check('and quality stays clamped — a banquet cannot run away',
      api(`spreadQuality(${mkSpread([['dish_cheese_pizza', 1], ['dish_fries', 1], ['dish_caesar_wedge', 1], ['dish_onion_rings', 1], ['dish_bacon_burger', 1], ['dish_apple_pie', 1]])}) <= 1`));
check('an empty spread is quality 0 rather than NaN',
      api(`spreadQuality([]) === 0 && spreadQuality(null) === 0`));
check('being fed is worth more than merely attending',
      api(`(() => {
        const npc = { relPlayer: { affection: 0.2 } };
        return mealRelDelta(0.5, npc, true) > mealRelDelta(0.5, npc, false);
      })()`),
      'COMMITMENT_TUNING.attendanceMultPresent is the price of under-catering');
check('and the per-meal cap still binds',
      api(`mealRelDelta(1, { relPlayer: { affection: 1 } }, true) <= COMMITMENT_TUNING.relationshipCap`));

console.log('\nThe player exists, and is described like everyone else');
check('a generated player has an appearance',
      api(`!!SIM_generateHouse(20260810, 3).player.appearance?.physical?.hair?.color`));
check('described by the SAME function that describes the cast',
      api(`getPhysicalDescriptionForPrompt(SIM_generateHouse(20260810, 3).player).length`) > 40,
      'one composer, no parallel player-only path');
check('deterministic for a seed',
      api(`getPhysicalDescriptionForPrompt(SIM_generateHouse(20260810, 3).player)
           === getPhysicalDescriptionForPrompt(SIM_generateHouse(20260810, 3).player)`));
check('and different people for different seeds',
      api(`getPhysicalDescriptionForPrompt(SIM_generateHouse(1, 3).player)
           !== getPhysicalDescriptionForPrompt(SIM_generateHouse(999, 3).player)`));
check('authored fields are honoured and unauthored ones still roll',
      api(`(() => {
        const p = SIM_generateHouse(20260810, 2, [], { gender: 'trans_female', age: 27, physical: { hair: { color: 'dyed purple' } } }).player.appearance;
        return p.gender === 'trans_female' && p.age === 27
          && p.physical.hair.color === 'dyed purple' && !!p.physical.eyes.color;
      })()`));
// heightBuild is a DERIVED field composed at roll time and preferred by the
// describer, so an authored build that doesn't recompose it lands in the data
// and never reaches a prompt.
check('an authored build actually reaches the prose',
      api(`getPhysicalDescriptionForPrompt(SIM_generateHouse(20260810, 2, [], { physical: { build: 'athletic' } }).player)`).includes('athletic'),
      'derived heightBuild must be recomposed after the authored merge');
check('the creation form can only offer values the generator rolls',
      api(`(() => {
        const pools = { PHYS_POOL_HEIGHT, PHYS_POOL_BUILD, PHYS_POOL_HAIR_COLOR, PHYS_POOL_HAIR_LENGTH,
                        PHYS_POOL_EYE_COLOR, PHYS_POOL_SKIN_TONE, PHYS_POOL_FASHION };
        return Object.values(pools).every(p => Array.isArray(p) && p.length > 0);
      })()`));

console.log('\nA laid table reaches the art, and clearing it un-lays it');
const mkRoom = (clutter, spread) => `{ t: { defId: 'dining_table', state: { clutter: '${clutter}' }, flags: ${spread ? `{ spread: ${JSON.stringify(spread)} }` : '{}'} } }`;
// Ported from composeSceneKey to plateKey by the character-cutout refactor
// (Phase 3): the backdrop is people-free now, so the function that owns
// "the cache key of the art this room is currently showing" is plateKey.
// The concern is unchanged and still worth guarding.
check('a cluttered table with a spread changes the backdrop key',
      api(`plateKey('dining','evening', sceneDetailSignature(${mkRoom('cluttered', ['dish_cheese_pizza', 'dish_fries'])}), '')`)
      !== api(`plateKey('dining','evening', sceneDetailSignature(${mkRoom('tidy', null)}), '')`),
      'otherwise the dining room serves its cached empty-table art through dinner');
// The spread has no expiry of its own — clearing the table is what ends it.
check('clearing the table reverts to the PLAIN cached key, byte for byte',
      api(`plateKey('dining','evening', sceneDetailSignature(${mkRoom('tidy', ['dish_cheese_pizza'])}), '')`)
      === api(`plateKey('dining','evening', '', '')`),
      'a tidied table must reuse the art that was already cached, not mint a new key');
check('and a plain key is stable',
      api(`plateKey('kitchen','morning','','')`) === 'plate_pv4_kitchen_morning_plain_landscape',
      'the literal is the whole point — a silent key-shape change orphans every cached plate');
check('the signature is order-independent',
      api(`sceneDetailSignature(${mkRoom('cluttered', ['dish_fries', 'dish_cheese_pizza'])})
           === sceneDetailSignature(${mkRoom('cluttered', ['dish_cheese_pizza', 'dish_fries'])})`),
      'the same table laid in a different pick order is the same picture');
check('the plate prompt names the dishes on the table',
      api(`buildBackgroundPrompt('dining','evening',${mkRoom('cluttered', ['dish_cheese_pizza', 'dish_fries'])})`).includes('cheese pizza')
      && api(`buildBackgroundPrompt('dining','evening',${mkRoom('cluttered', ['dish_cheese_pizza', 'dish_fries'])})`).includes('basket of fries'),
      'a key that changes without the prompt changing just repaints the same picture');
// Post-refactor the SEATING is no longer a phrase in the backdrop prompt —
// the backdrop has nobody in it to seat. It is now expressed by the layout
// choosing the seated pose for every cutout standing on that plate.
check('a laid table seats the cast via the cutout layout, not via prompt prose',
      api(`(() => {
        const gs = SIM_generateHouse(20260810, 3);
        gs.player.location = 'dining';
        gs.objects.room_dining = ${mkRoom('cluttered', ['dish_cheese_pizza'])};
        const out = layoutSceneCutouts(gs, { active: [] }, 'plate_k');
        return out.length > 0 && out.every(p => p.pose === 'seated');
      })()`));
check('the player is IN their own scene — now as a cutout layer, always present',
      api(`(() => {
        const gs = SIM_generateHouse(20260810, 3);
        gs.player.location = 'dining';
        const out = layoutSceneCutouts(gs, { active: [] }, 'plate_k');
        return out.some(p => p.isPlayer === true);
      })()`),
      'every scene image used to draw the roommates and omit the player');
check('an unknown dish id cannot reach the prompt',
      api(`(() => {
        const gs = SIM_generateHouse(20260810, 3);
        const table = Object.values(gs.objects.room_dining).find(o => o.defId === 'dining_table');
        const ctx = buildEffectContext(gs, [], [], gs.objects.room_dining, []);
        applyEffects(parseEffectDSL('SET_TABLE_SPREAD ' + table.id + ' dish_cheese_pizza not_a_real_item'), ctx);
        return JSON.stringify(table.flags.spread) === JSON.stringify(['dish_cheese_pizza']);
      })()`),
      'applySetTableSpread must drop ids that are not in ITEM_DEFS');
check('and the spread is capped',
      api(`(() => {
        const gs = SIM_generateHouse(20260810, 3);
        const table = Object.values(gs.objects.room_dining).find(o => o.defId === 'dining_table');
        const ctx = buildEffectContext(gs, [], [], gs.objects.room_dining, []);
        const many = Array(20).fill('dish_fries').join(' ');
        applyEffects(parseEffectDSL('SET_TABLE_SPREAD ' + table.id + ' ' + many), ctx);
        return table.flags.spread.length === COMMITMENT_TUNING.maxSpreadDishes;
      })()`));
check('SET_TABLE_SPREAD is trusted-only — the narrator cannot lay a table',
      api(`EFFECT_DEFS.SET_TABLE_SPREAD.llm === false`),
      'what is on the table is a consequence of dishes actually being consumed');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
