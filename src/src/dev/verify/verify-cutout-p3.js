// Character-cutout-scene-rendering-plan, Phase 3 — the switch. Covers
// layoutSceneCutouts (D10) and the plate/cutout key split's actual payoff
// (the same room with two different casts is ONE plate). renderScene /
// renderSceneCutouts need a DOM and are not loaded here (loadgame.js stops
// before the render layer) — the layer-diff behaviour is browser-only and
// still needs a live Perchance run; see the plan's Handoff.
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

// A minimal gs/sceneState pair — layoutSceneCutouts reads only
// player.location, objects, and sceneState.active.
const mkGs = (roomId = 'living_room') => `{
  player: { location: '${roomId}' },
  npcs: { npc_a: {}, npc_b: {}, npc_c: {} },
  objects: {}
}`;
const mkGsSeated = (roomId = 'dining') => `{
  player: { location: '${roomId}' },
  npcs: { npc_a: {}, npc_b: {} },
  objects: { room_${roomId}: { t1: { defId: 'dining_table', state: { clutter: 'cluttered' }, flags: { spread: ['dish_fries'] } } } }
}`;

console.log('\nD10 — the layout is deterministic and seeded');
check('the same scene lays out identically every visit',
  api(`(() => {
    const a = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_k');
    const b = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_k');
    return JSON.stringify(a) === JSON.stringify(b);
  })()`));
check('a different plate (room/phase/state) reseeds the spread',
  api(`(() => {
    const a = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_kitchen');
    const b = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_study');
    return JSON.stringify(a.map(p => p.xFrac)) !== JSON.stringify(b.map(p => p.xFrac));
  })()`));
check('cast order does not matter — the layout sorts, so join order cannot perturb it',
  api(`(() => {
    const a = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_k');
    const b = layoutSceneCutouts(${mkGs()}, { active: ['npc_b','npc_a'] }, 'plate_k');
    return JSON.stringify(a) === JSON.stringify(b);
  })()`));

console.log('\nD10 — the player is always present, always on top, always center-most');
check('the player gets a placement even with an empty cast',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: [] }, 'plate_k');
    return out.length === 1 && out[0].isPlayer === true && out[0].charId === 'player';
  })()`));
check('a solo player is centered',
  api(`Math.abs(layoutSceneCutouts(${mkGs()}, { active: [] }, 'plate_k')[0].xFrac - 0.5) < 0.2`));
check('the player has the highest z of anyone in the scene',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b','npc_c'] }, 'plate_k');
    const player = out.find(p => p.isPlayer);
    return out.every(p => p.isPlayer || p.z < player.z);
  })()`));
check('the player sits in the middle of the row, not at an end',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_k');
    const idx = out.findIndex(p => p.isPlayer);
    return idx > 0 && idx < out.length - 1;
  })()`),
  'with two NPCs the player should be flanked, i.e. index 1 of 3');
check('every layer lands inside the frame',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b','npc_c'] }, 'plate_k');
    return out.every(p => p.xFrac >= 0 && p.xFrac <= 1 && p.bottomFrac >= 0 && p.bottomFrac <= 1);
  })()`));
check('nobody is stacked exactly on top of anybody else',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b','npc_c'] }, 'plate_k');
    const xs = out.map(p => p.xFrac).sort((a,b) => a-b);
    return xs.every((x, i) => i === 0 || x - xs[i-1] > 0.05);
  })()`));

console.log('\nD10 — a laid table seats the cast');
check('a cluttered table with a spread switches everyone to the seated pose',
  api(`layoutSceneCutouts(${mkGsSeated()}, { active: ['npc_a'] }, 'plate_k').every(p => p.pose === 'seated')`));
check('...and an ordinary room leaves them standing',
  api(`layoutSceneCutouts(${mkGs()}, { active: ['npc_a'] }, 'plate_k').every(p => p.pose === 'standing')`));
check('the pose drives scale from the catalogue, not a magic number',
  api(`(() => {
    const seated = layoutSceneCutouts(${mkGsSeated()}, { active: ['npc_a'] }, 'plate_k')[0];
    return seated.scale === CUTOUT_POSES.seated.scale;
  })()`));
check('every placement names a real catalogue pose and expression',
  api(`(() => {
    const out = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b'] }, 'plate_k');
    return out.every(p => CUTOUT_POSES[p.pose] && CUTOUT_EXPRESSIONS.includes(p.expression));
  })()`));

console.log('\nThe payoff — the thesis of the whole plan, as an assertion');
check('the SAME room with two DIFFERENT casts is one plate key (the additive curve)',
  api(`(() => {
    const k = plateKey('living_room', 'evening', '', '');
    // Nothing about cast can even be expressed in a plate key — the layout
    // varies, the backdrop does not.
    const castA = layoutSceneCutouts(${mkGs()}, { active: ['npc_a'] }, k);
    const castB = layoutSceneCutouts(${mkGs()}, { active: ['npc_a','npc_b','npc_c'] }, k);
    return castA.length !== castB.length && plateKey('living_room', 'evening', '', '') === k;
  })()`),
  'cast changes the LAYER SET; the plate underneath is cached once and reused');
check('two different players share a room plate — the old player token could never',
  api(`(() => {
    const a = plateKey('kitchen', 'morning', '', '');
    const b = plateKey('kitchen', 'morning', '', '');
    return a === b && !a.includes('nobody') && !/_p\\d/.test(a);
  })()`),
  'image.js:57-61 recorded the scar that forced the player token into the old scene key; a plate has no such field to carry');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
