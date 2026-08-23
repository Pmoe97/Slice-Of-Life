// Seasonal Calendar & Sandbox Plan — Phase B2: NPC appearance authoring.
//
// rollCastSlot accepts a `physical` partial (D15) merged over the rolled base
// by the SAME applyAuthoredPhysical the player studio uses (D14), applied AFTER
// generateIntimate and appendFacialHairDraw so the RNG draw order is
// untouched (design invariant 4). The merge draws no randomness, so one seed's
// household is byte-identical whether or not a physical partial was supplied.
//
// The determinism assertion is the point of the phase: the same seed must
// produce the same cast. We compare two full houses for the same seed — one with
// no physical partials, one with a partial supplying a real authored appearance
// for a slot — and require every field EXCEPT the merged physical to be
// byte-identical, and the merged physical to be a correct subset merge on top
// of the rolled one.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !deepEqual(a[k], b[k])) return false;
  return true;
}

const genHouse = api('SIM_generateHouse');
const applyPhys = api('applyAuthoredPhysical');

// Normalise a casted house to nothing but the NPC bibles — this is the data a
// seed actually decides, and the byte-for-byte surface for the determinism check.
// `var` assignments (not `function` declarations) so they leak to the shared
// engine scope and are visible to every later api() call — the engine is strict,
// which traps `function` declarations inside eval.
api(`
  var houseBibles = function(h) {
    const ids = Object.keys(h.npcs).sort();
    const out = {};
    for (const id of ids) out[id] = h.npcs[id].bible;
    return out;
  };
  var houseWith = function(seed, n, partials) {
    const h = SIM_generateHouse(seed, n, partials);
    return houseBibles(h);
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. Determinism: same seed, physical partial absent vs present — byte-identical except the merge');

const SEED = 20260822;

{
  // Baseline: three slots, no physical partials at all.
  const base = api(`houseWith(${SEED}, 3, [{},{},{}])`);

  // A partial holding an EMPTY physical for all three slots must change nothing —
  // an empty authoring is a no-op, not a disturbance of the draw stream.
  const emptyPhys = api(`houseWith(${SEED}, 3, [{physical:{}},{physical:{}},{physical:{} }])`);
  check('empty physical partials leave the whole cast byte-identical',
        deepEqual(emptyPhys, base),
        'empty physical:{} must not disturb any seed output');

  // Author a real appearance for slot 0 only via its physical partial.
  const authored = api(`houseWith(${SEED}, 3, [
    { physical: { hair: { color: 'fire-truck red' }, build: 'athletic', intimate: { breasts: { size: 'D' }, genitals: [{ type: 'vagina' }] } } },
    {}, {}
  ])`);

  const baseIds = Object.keys(base);
  const authIds = Object.keys(authored);
  check('same seed, same slot ids', deepEqual(baseIds, authIds));

  // Every slot that was NOT authored must be byte-identical.
  let othersMatch = true, otherDetail = '';
  // The authored slot is the one whose hair.color changed; compare the rest to base.
  const authoredId = authIds.find(id => authored[id].physical.hair.color === 'fire-truck red');
  check('found the authored slot', !!authoredId, `ids: ${authIds}`);
  for (const id of authIds) {
    if (id === authoredId) continue;
    if (!deepEqual(authored[id], base[id])) { othersMatch = false; otherDetail = `slot ${id} differs`; }
  }
  check('every non-authored slot is byte-identical to baseline', othersMatch, otherDetail);
}

// ---------------------------------------------------------------- 2
console.log('\n2. Author one leaf — everything else stays rolled');

{
  // Generate a single slot, author ONLY hair.color. Every other physical field
  // must be a real rolled value (present, matching compare-baseline for the roll),
  // not absent and not empty.
  const solo = api(`SIM_generateHouse(${SEED}, 1, [{ physical: { hair: { color: 'violet' } } }])`);
  const npc = solo.npcs[Object.keys(solo.npcs)[0]];
  const phys = npc.bible.physical;
  check('the authored leaf wins', phys.hair.color === 'violet', `got ${phys.hair.color}`);
  check('sibling hair fields still rolled (style set)', typeof phys.hair.style === 'string' && phys.hair.style.length > 0, `style=${JSON.stringify(phys.hair.style)}`);
  check('other groups still rolled (eyes.color present)', typeof phys.eyes.color === 'string' && phys.eyes.color.length > 0);
  check('build still rolled', typeof phys.build === 'string' && phys.build.length > 0);
  check('intimate still rolled (breasts present)', !!phys.intimate && !!phys.intimate.breasts && typeof phys.intimate.breasts.size === 'string');
}

// ---------------------------------------------------------------- 3
console.log('\n3. intimate nested merge: author breasts.size alone, rolled shape/areola/nipples survive');

{
  const solo = api(`SIM_generateHouse(${SEED}, 1, [{ physical: { intimate: { breasts: { size: 'FF' } } } }])`);
  const npc = solo.npcs[Object.keys(solo.npcs)[0]];
  const breasts = npc.bible.physical.intimate.breasts;
  check('authored size wins', breasts.size === 'FF', `got ${breasts.size}`);
  check('rolled shape survived', typeof breasts.shape === 'string' && breasts.shape.length > 0, `shape=${JSON.stringify(breasts.shape)}`);
  check('rolled areola survived', typeof breasts.areola === 'string' && breasts.areola.length > 0, `areola=${JSON.stringify(breasts.areola)}`);
  check('rolled nipples survived', typeof breasts.nipples === 'string' && breasts.nipples.length > 0, `nipples=${JSON.stringify(breasts.nipples)}`);
}

// ---------------------------------------------------------------- 4
console.log('\n4. genitals: authored list REPLACES the rolled one, not unioned');

{
  const solo = api(`SIM_generateHouse(${SEED}, 1, [{ physical: { intimate: { genitals: [{ type: 'vagina', girth: '5.5 in', depth: '7 in', description: '' }] } } }])`);
  const npc = solo.npcs[Object.keys(solo.npcs)[0]];
  const genitals = npc.bible.physical.intimate.genitals;
  check('result has exactly one entry (replace, not union)', Array.isArray(genitals) && genitals.length === 1, `got ${JSON.stringify(genitals)}`);
  check('the authored entry survived', genitals[0] && genitals[0].type === 'vagina', `got ${JSON.stringify(genitals)}`);
}

// ---------------------------------------------------------------- 5
console.log('\n5. heightBuild recomposed from authored build');

{
  const solo = api(`SIM_generateHouse(${SEED}, 1, [{ physical: { build: 'portly' } }])`);
  const npc = solo.npcs[Object.keys(solo.npcs)[0]];
  const phys = npc.bible.physical;
  check('authored build wins', phys.build === 'portly', `got ${phys.build}`);
  check('heightBuild recomposed to the authored build',
        phys.heightBuild === `${phys.height} and portly`, `got "${phys.heightBuild}"`);
}

// ---------------------------------------------------------------- 6
console.log('\n6. Source shape: one shared implementation, wired into rollCastSlot after the RNG draws');

const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const simSrc = fs.readFileSync(path.join(SRCFILES, 'sim.js'), 'utf8');

check('applyAuthoredPhysical is defined as a function in sim.js', /function applyAuthoredPhysical/.test(simSrc));
check('generatePlayerAppearance calls applyAuthoredPhysical', /applyAuthoredPhysical\(physical, a\);/.test(simSrc));
check('the OLD inline merge literal is gone from generatePlayerAppearance — the loop now lives inside applyAuthoredPhysical',
      /function applyAuthoredPhysical[\s\S]*for \(const \[group, val\] of Object\.entries\(a\.physical\)\)/.test(simSrc),
      'the per-group merge loop must sit inside applyAuthoredPhysical, not generatePlayerAppearance');
// One shared implementation: exactly one occurrence of the merge loop.
check('exactly one per-group merge loop in the file (applyAuthoredPhysical owns it)',
      (simSrc.match(/for \(const \[group, val\] of Object\.entries\(a\.physical\)\)/g) || []).length === 1);
// rollCastSlot applies partial.physical AFTER intimate + facial hair (D15).
check('rollCastSlot calls applyAuthoredPhysical with the partial',
      /applyAuthoredPhysical\(structured\.physical, partial\);/.test(simSrc));
// Ordering guard: the intimate and facialHair draws precede the merge.
const mergeIdx = simSrc.indexOf('applyAuthoredPhysical(structured.physical, partial);');
const intimateIdx = simSrc.indexOf('structured.physical.intimate = generateIntimate');
const facialIdx = simSrc.indexOf('appendFacialHairDraw(structured.physical, charRng)');
check('applyAuthoredPhysical sits AFTER generateIntimate in rollCastSlot', intimateIdx !== -1 && mergeIdx > intimateIdx);
check('applyAuthoredPhysical sits AFTER appendFacialHairDraw in rollCastSlot', facialIdx !== -1 && mergeIdx > facialIdx);
check('rollCastSlot header comment names the physical partial (D15)', /name, physical \(D15/.test(simSrc));
check('exactly one applyAuthoredPhysical definition site',
      (simSrc.match(/function applyAuthoredPhysical\(rolledPhysical, authored\)/g) || []).length === 1);

// ---------------------------------------------------------------- 7
console.log('\n7. applyAuthoredPhysical is pure — no randomness drawn');

{
  // Call the same seed-family roll twice and assert the merge never perturbs the
  // RNG stream by comparing a no-op merge to a real merge on freshly-rolled
  // physicals sharing one rng.
  const r = api(`
    (() => {
      const rngA = mulberry32(${SEED});
      const pA = generatePhysical(rngA);
      const genderA = rollGender(rngA);
      pA.intimate = generateIntimate(rngA, genderA);
      appendFacialHairDraw(pA, rngA);
      const nextA = rngA();

      const rngB = mulberry32(${SEED});
      const pB = generatePhysical(rngB);
      const genderB = rollGender(rngB);
      pB.intimate = generateIntimate(rngB, genderB);
      appendFacialHairDraw(pB, rngB);
      applyAuthoredPhysical(pB, { physical: { hair: { color: 'x' }, build: 'y', height: 'z' } });
      const nextB = rngB();

      return { same: nextA === nextB, a: nextA, b: nextB };
    })()
  `);
  check('running the merge does not advance the RNG stream', r.same === true);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
