// Character-cutout-scene-rendering-plan, Phase 2 — empty background plates.
// buildBackgroundPrompt/getScenePlate exist ALONGSIDE the old baked-in path
// (buildImagePrompt/getSceneImage are untouched); nothing is switched yet.
// getScenePlate itself needs a real canvas (root.generateImage is stubbed
// here), so only the prompt/key composition — the actual point of D6 — is
// exercised in this harness.
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
check('the plate prompt contains no visual-clause fragments a character would introduce',
  api(`(() => {
    const prompt = buildBackgroundPrompt('kitchen', 'morning', {});
    const leaks = ['wearing', 'hair', 'eyes', 'skin', 'expression'];
    return !leaks.some(w => prompt.toLowerCase().includes(w));
  })()`));
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

console.log('\nContrast with the (still-live, untouched) old path — proves the cost fix, not just the API shape');
check('composeSceneKey — the OLD, still-active key — DOES vary by cast, unlike plateKey',
  api(`(() => {
    const castA = composeSceneKey('kitchen', 'morning', 'normal', ['npc_a'], '', null);
    const castB = composeSceneKey('kitchen', 'morning', 'normal', ['npc_a', 'npc_b'], '', null);
    return castA !== castB;
  })()`),
  'this is the multiplicative cost the plan exists to kill — plateKey (above) proves the replacement does not have it');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
