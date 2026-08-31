// Character-cutout-scene-rendering-plan, Phase 2 — empty background plates.
// getScenePlate itself needs a real canvas (root.generateImage is stubbed
// here), so only the prompt/key composition — the actual point of D6 — is
// exercised in this harness. The closing section also pins Phase 3's
// deletions: the old character-baking scene path must be UNREACHABLE, not
// merely unused.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

console.log('\nD6 — the plate prompt structurally cannot carry a character');
check('buildBackgroundPrompt takes no npc/player argument at all — not filtered out, never accepted',
  api(`buildBackgroundPrompt.length`) === 3,
  `arity was ${api('buildBackgroundPrompt.length')}, expected 3 (roomId, phase, roomObjects)`);
// WORD-BOUNDARY matching, deliberately: a naive substring check passes
// here but reports a false leak on the dining room, whose fallback phrase
// contains "c-hair-s". Both rooms are checked so the boundary rule itself
// stays honest.
check('the plate prompt contains no visual-clause fragments a character would introduce',
  api(`(() => {
    const leak = /\\b(wearing|hair|eyes|skin|expression|man|woman|person)\\b/i;
    const rooms = ['kitchen', 'dining', 'living_room', 'bedroom_player'];
    return rooms.every(r => !leak.test(buildBackgroundPrompt(r, 'morning', {})));
  })()`));
check('...including a dining room laid for a meal, whose own furniture phrase contains the substring "hair"',
  api(`(() => {
    const table = { t1: { defId: 'dining_table', state: { clutter: 'cluttered' }, flags: { spread: ['dish_fries'] } } };
    const prompt = buildBackgroundPrompt('dining', 'evening', table);
    return /chairs/i.test(prompt) && !/\\bhair\\b/i.test(prompt);
  })()`),
  'guards the guard: proves the boundary rule is doing real work, not passing by luck');
check('the plate prompt still says "no people" so the model is told, not just left to guess',
  api(`buildBackgroundPrompt('kitchen', 'morning', {}).toLowerCase().includes('no people')`));
check('a laid table still shows up in the plate — that IS room state, not a character clause',
  api(`(() => {
    const table = { t1: { defId: 'dining_table', state: { clutter: 'cluttered' }, flags: { spread: ['dish_fries'] } } };
    return buildBackgroundPrompt('dining', 'evening', table).includes('table is set for a shared meal');
  })()`),
  'ITEM_DEFS.dish_fries must exist for this to render a label — if it fails, check the item id is still valid');

console.log('\nD6 — the people-ban negative');
check('backgroundNegPrompt bans the core people words persona-realm bans (Stage 5)',
  api(`(() => {
    const neg = backgroundNegPrompt().toLowerCase();
    return ['person', 'people', 'human', 'face', 'figure'].every(w => neg.includes(w));
  })()`));
check('backgroundNegPrompt still carries the surface\'s usual negative (blurry/distorted/etc.)',
  api(`backgroundNegPrompt().includes(IMAGE_NEGATIVE.scene)`));

console.log('\nD2 — plateKey carries no characters, ever');
check('plateKey has no npc/player parameter — cast cannot enter the key even by mistake',
  api(`plateKey.length`) === 4,
  `arity was ${api('plateKey.length')}, expected 4 (roomId, phase, detail, styleToken)`);
check('two calls with identical (room, phase, detail, style) are the SAME key regardless of who is imagined present',
  api(`plateKey('kitchen', 'morning', '', '') === plateKey('kitchen', 'morning', '', '')`),
  'trivially true by construction, but it is the point: nothing about cast can perturb this');
check('plateKey differs by room',
  api(`plateKey('kitchen', 'morning', '', '') !== plateKey('living_room', 'morning', '', '')`));
check('plateKey differs by phase',
  api(`plateKey('kitchen', 'morning', '', '') !== plateKey('kitchen', 'evening', '', '')`));
check('plateKey differs by detail (a laid table changes the plate)',
  api(`plateKey('kitchen', 'morning', '', '') !== plateKey('kitchen', 'morning', 'meal-dish_fries', '')`));
check('plateKey differs by style token',
  api(`plateKey('kitchen', 'morning', '', '') !== plateKey('kitchen', 'morning', '', 'st_noir')`));
check('composePlateSeed is deterministic for the same key',
  api(`composePlateSeed('plate_pv3_kitchen_morning_plain_landscape') === composePlateSeed('plate_pv3_kitchen_morning_plain_landscape')`));

console.log('\nD6 — the character-baking scene path is GONE, not merely unused (Phase 3)');
check('composeSceneKey no longer exists — a cast-keyed backdrop key cannot be composed at all',
  api(`typeof composeSceneKey === 'undefined'`),
  'design invariant 6: the multiplicative cost structure must be unreachable, not just unused');
check('composeSceneSeed no longer exists either',
  api(`typeof composeSceneSeed === 'undefined'`));
check('getSceneImage no longer exists — getScenePlate replaced it',
  api(`typeof getSceneImage === 'undefined'`));
check('buildImagePrompt survives ONLY as buildPhotoPrompt, scoped to the camera',
  api(`typeof buildImagePrompt === 'undefined' && typeof buildPhotoPrompt === 'function'`),
  'a photo is keyed per-photo-id and frozen at capture, so it has no cast-combination namespace to explode — see buildPhotoPrompt\'s own note');
check('...and the camera prompt still bakes its people in, which is the whole reason it was kept',
  api(`(() => {
    const npcs = [{ bible: { name: 'Del', age: 27, gender: 'female', physical: { hair: { color: 'black', length: 'long' }, eyes: {}, skin: {}, face: {}, body: {} } } }];
    const prompt = buildPhotoPrompt('kitchen', 'morning', npcs, {}, {});
    return prompt.includes('Del') && prompt.toLowerCase().includes('hair');
  })()`),
  'unlike buildBackgroundPrompt, a photo prompt must still name the people in the room');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
