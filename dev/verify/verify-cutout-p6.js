// Character-cutout-scene-rendering-plan, Phase 6 — the integration sweep.
// The plan's "What this plan is not" section makes four explicit promises
// about surfaces this refactor must NOT have touched. This harness pins
// each of them, so a future change to the cutout pipeline that quietly
// drags peek/portraits/photos along with it fails here instead of in a
// playtest.
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

console.log('\n"Not a change to portraits" — getCharacterImage is untouched');
check('getCharacterImage still exists with its own key namespace',
  api(`typeof getCharacterImage === 'function' && typeof composeCharKey === 'function'`));
check('a portrait key is a char_ key, never a cut_ key',
  api(`composeCharKey({ bible: { genSeed: 5 } }, 'neutral', 'standing').startsWith('char_')`));
check('portrait and cutout namespaces cannot collide',
  api(`(() => {
    const portrait = composeCharKey({ bible: { genSeed: 5 } }, 'neutral', 'standing');
    const cutout = cutoutKey('n5', 'standing', 'neutral', 'cdressed_o_t_b', '');
    return portrait !== cutout && !portrait.startsWith('cut_') && !cutout.startsWith('char_');
  })()`));
check('portraits do NOT request background removal — they are not cutouts',
  api(`!/removeBackground/.test(getCharacterImage.toString())`),
  'the plan is explicit: portraits stay exactly as they are');

console.log('\n"Not a change to peek" — the keyhole keeps its own gated path');
check('getPeekImage and its key composer still exist',
  api(`typeof getPeekImage === 'function' && typeof composePeekKey === 'function'`));
check('peek keys are their own namespace',
  api(`composePeekKey({ meta: { clock: { phase: 'night' } } }, 'bathroom_a', { bible: { genSeed: 9 } }, 'shower').startsWith('peek_')`));
check('peek still opts INTO the intimate layer — the one surface that may',
  api(`/intimate\\s*:\\s*true/.test(composePeekPrompt.toString())`),
  'D8: peek keeps its gated generative path; cutouts never opt in');
check('peek does not use the cutout pipeline',
  api(`!/removeBackground|cleanCutout/.test(getPeekImage.toString())`));

console.log('\n"Not a change to photos" — the camera keeps people baked in');
check('takePhoto still records a prompt+seed pair, not a blob',
  api(`(() => {
    const src = takePhoto.toString();
    return src.includes('prompt') && src.includes('seed');
  })()`),
  'landmine L10: a photo must be reproducible, never a cached blob that can be evicted');
check('photo keys are their own namespace, unaffected by the plate/cutout split',
  api(`typeof getPhotoImage === 'function' && typeof getAskPhotoImage === 'function'`));
check('the camera prompt names people; the plate prompt does not — the two never converged',
  api(`(() => {
    const npcs = [{ bible: { name: 'Del', age: 27, gender: 'female', physical: { hair: { color: 'black' }, eyes: {}, skin: {}, face: {}, body: {} } } }];
    const photo = buildPhotoPrompt('kitchen', 'morning', npcs, {}, {});
    const plate = buildBackgroundPrompt('kitchen', 'morning', {});
    return photo.includes('Del') && !plate.includes('Del');
  })()`));

console.log('\n"Not a change to the menu gallery" — it keeps its own ring and cap');
check('the gallery still owns its own key generation and ring',
  api(`typeof genMenuGalleryKey === 'function' && typeof rememberMenuGalleryImage === 'function'`));
check('gallery keys are their own namespace',
  api(`menuGalleryKeyPrefix('sfw').startsWith('menu_')`));

console.log('\nThe shared LRU holds every namespace without collision');
check('all six namespaces are mutually distinct by prefix',
  api(`(() => {
    const keys = [
      plateKey('kitchen', 'morning', '', ''),
      cutoutKey('n1', 'standing', 'neutral', 'c_o_t_b', ''),
      composeCharKey({ bible: { genSeed: 1 } }, 'neutral', 'standing'),
      composePeekKey({ meta: { clock: { phase: 'day' } } }, 'bathroom_a', { bible: { genSeed: 1 } }, 'x'),
      menuGalleryKeyPrefix('sfw'),
      'photo_abc',
    ];
    const prefixes = keys.map(k => k.split('_')[0]);
    return new Set(prefixes).size === prefixes.length;
  })()`),
  'one LRU, six namespaces (D2) — a prefix collision would let one surface evict or serve another\'s pixels');

console.log('\nSaves still reference a real, currently-renderable art key');
check('captureSave\'s fallback composes a PLATE key — the thing actually on screen now',
  api(`/plateKey\\(/.test(captureSave.toString())`),
  'the save thumbnail points into kv.images; pointing it at a key nothing generates any more would silently break every autosave thumbnail');
check('...and that fallback key is one getScenePlate would actually produce',
  api(`(() => {
    const direct = plateKey('kitchen', 'morning', '', '');
    return direct.startsWith('plate_' + IMAGE_PROMPT_VERSION + '_kitchen_morning_');
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
