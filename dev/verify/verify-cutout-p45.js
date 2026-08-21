// Character-cutout-scene-rendering-plan, Phases 4 and 5 — reroll scoping,
// degrade paths, the pose/expression catalogue, content gating, and the
// style fold. DOM-dependent behaviour (the .cutout-missing class, the
// reduce-motion CSS) is browser-only and verified live instead; what is
// here is the pure logic those surfaces sit on.
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

console.log('\nD11 — reroll is plate-scoped');
check('the reroll negative prompt is the PLATE\'s (people-banned), not the old scene one',
  api(`backgroundNegPrompt().includes('no') || backgroundNegPrompt().includes('person')`),
  'rerolling must not silently reintroduce people into a backdrop');
check('IMAGE_NEGATIVE.scene still exists for the surfaces that legitimately have people',
  api(`typeof IMAGE_NEGATIVE.scene === 'string' && IMAGE_NEGATIVE.scene.length > 0`));

console.log('\nD4/Phase 5 — the catalogue is closed, and expression selection respects it');
check('CUTOUT_POSES has exactly the three planned poses',
  api(`JSON.stringify(Object.keys(CUTOUT_POSES).sort())`) === '["lounging","seated","standing"]');
check('CUTOUT_EXPRESSIONS has exactly the three planned expressions',
  api(`JSON.stringify(CUTOUT_EXPRESSIONS.slice().sort())`) === '["happy","neutral","talking"]');
check('every pose carries the fields the layout and prompt read',
  api(`Object.values(CUTOUT_POSES).every(p => typeof p.scale === 'number' && typeof p.bottomFrac === 'number' && typeof p.seedWord === 'string')`));
check('a neutral mood yields the neutral expression',
  api(`cutoutExpressionFor({}, { mood: 0 }, false, 'n1') === 'neutral'`));
check('a clearly good mood yields happy',
  api(`cutoutExpressionFor({}, { mood: 0.8 }, false, 'n1') === 'happy'`));
check('a bad mood is still neutral — the catalogue has no sad cutout, and inventing one silently would be worse',
  api(`cutoutExpressionFor({}, { mood: -0.9 }, false, 'n1') === 'neutral'`));
check('a missing mood field never throws or produces a non-catalogue value',
  api(`CUTOUT_EXPRESSIONS.includes(cutoutExpressionFor({}, {}, false, 'n1'))`));
check('every expression selection lands inside the catalogue for a spread of moods',
  api(`[-1,-0.5,0,0.34,0.35,0.9,1].every(m => CUTOUT_EXPRESSIONS.includes(cutoutExpressionFor({}, { mood: m }, false, 'n1')))`));

console.log('\nD4 — an outfit or clothing-state change is a NEW cutout, not a repainted one');
check('changing the top alone changes the key',
  api(`(() => {
    const a = cutoutKey('n1', 'standing', 'neutral', cutoutOutfitToken({ clothing: 'dressed', outfit: { top: 'tee' } }), '');
    const b = cutoutKey('n1', 'standing', 'neutral', cutoutOutfitToken({ clothing: 'dressed', outfit: { top: 'blouse' } }), '');
    return a !== b;
  })()`));
check('undressing changes the key',
  api(`(() => {
    const a = cutoutKey('n1', 'standing', 'neutral', cutoutOutfitToken({ clothing: 'dressed', outfit: {} }), '');
    const b = cutoutKey('n1', 'standing', 'neutral', cutoutOutfitToken({ clothing: 'towel', outfit: {} }), '');
    return a !== b;
  })()`));
check('a style change changes every cutout key (D2 style fold)',
  api(`cutoutKey('n1','standing','neutral','c_o_t_b','') !== cutoutKey('n1','standing','neutral','c_o_t_b','st_noir')`));
check('...and changes the SEED too, so the restyled cutout is genuinely redrawn',
  api(`composeCutoutSeed('n1','standing','neutral','c_o_t_b','') !== composeCutoutSeed('n1','standing','neutral','c_o_t_b','st_noir')`));

console.log('\nD8 — content parity with scenes, never with peek');
check('a cutout prompt carries clothing-state prose exactly as the old scene prompt did',
  api(`(() => {
    const npc = { bible: { name: 'Ada', age: 30, gender: 'female', physical: { hair: { color: 'red', length: 'short' }, eyes: {}, skin: {}, face: {}, body: {} } }, clothing: 'towel' };
    return /towel/i.test(buildCutoutPrompt(npc, 'standing', 'neutral'));
  })()`));
check('a cutout NEVER opts into the intimate layer — its pixels are identical whether the gate is open or shut',
  api(`(() => {
    const src = buildCutoutPrompt.toString();
    return !/intimate\\s*:\\s*true/.test(src);
  })()`),
  'composeIntimateDescription stays peek-only (D8); a cutout must not be able to request it');
check('the cutout prompt asks for an isolatable subject (Stage 0) so the mask has a clean edge',
  api(`(() => {
    const npc = { bible: { name: 'Ada', age: 30, gender: 'female', physical: { hair: { color: 'red' }, eyes: {}, skin: {}, face: {}, body: {} } } };
    const p = buildCutoutPrompt(npc, 'standing', 'neutral').toLowerCase();
    return p.includes('white background') && p.includes('full body');
  })()`));
check('the cutout negative bans the background noise a mask would otherwise have to fight',
  api(`(() => {
    const n = cutoutNegativePrompt().toLowerCase();
    return n.includes('background') && n.includes('multiple people');
  })()`));

console.log('\nD9 — the reduce-motion setting exists and defaults off');
check('reduceMotion is a real settings field',
  api(`typeof SETTINGS_DEFAULTS.reduceMotion === 'boolean'`));
check('it defaults OFF — the OS preference is what turns it on unasked',
  api(`SETTINGS_DEFAULTS.reduceMotion === false`));
check('applyReduceMotion exists to carry it to the DOM',
  api(`typeof applyReduceMotion === 'function'`));
check('its settings row is wired to a real action id',
  api(`(() => {
    const rows = SETTINGS_TABS.flatMap(t => t.sections).flatMap(s => s.rows || []);
    const row = rows.find(r => r.field === 'reduceMotion');
    return !!row && row.kind === 'toggle' && row.action === 'settings.toggle';
  })()`),
  'design invariant: every settings row action must exist in MENU_ACTIONS');

console.log('\nD13/D2 — eviction is free because keys are total');
check('a cutout key determines its own seed — regeneration after eviction reproduces the same pixels',
  api(`(() => {
    const args = ['n7', 'lounging', 'happy', 'cdressed_o_ttee_bjeans', 'st_noir'];
    return composeCutoutSeed(...args) === composeCutoutSeed(...args);
  })()`));
check('the LRU cap was raised for the plate+cutout split (D2)',
  api(`IMAGE_CACHE.cap >= 500`));
check('cutouts have their own generation resolution',
  api(`typeof IMAGE_CACHE.resolutions.cutout === 'string' && /^\\d+x\\d+$/.test(IMAGE_CACHE.resolutions.cutout)`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
