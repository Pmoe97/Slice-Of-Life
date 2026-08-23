// Vocation & Lifestyle Expansion — Phase 2: work modes, pool expansion,
// personality↔occupation coupling.
//
// The assertions that matter are statistical, because the claim is
// statistical: adult work must be UNREACHABLE below the disinhibition floor
// (a hard guarantee, D9), while every other affinity only shifts odds (a
// distributional one, D7). So this file generates a large sample of casts and
// asserts on the population, not on one lucky draw.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------- 1
console.log('\n1. The pool');

const pool = api('OCCUPATION_POOL');
const cats = [...new Set(pool.map(o => o.category))];
const modes = {};
for (const o of pool) modes[o.workMode || 'on_site'] = (modes[o.workMode || 'on_site'] || 0) + 1;

check(`pool has ${pool.length} entries (target ~55)`, pool.length >= 50, `${pool.length}`);
check(`${cats.length} categories`, cats.length >= 14, cats.join(', '));
console.log(`        modes: ${JSON.stringify(modes)}`);
for (const m of ['on_site', 'hybrid', 'remote', 'self_employed', 'none']) {
  check(`mode '${m}' is represented`, (modes[m] || 0) > 0, `count ${modes[m] || 0}`);
}
check('every entry has a title and a category', pool.every(o => o.title && o.category));
check('every entry names a real SCHEDULES template',
  api(`OCCUPATION_POOL.every(o => !!SCHEDULES[o.scheduleTemplate])`),
  api(`JSON.stringify(OCCUPATION_POOL.filter(o => !SCHEDULES[o.scheduleTemplate]).map(o => o.title))`));
check('every incomeBand is low|mid|high',
  pool.every(o => ['low', 'mid', 'high'].includes(o.incomeBand)));
check('every incomeSource is wage|self|means|none',
  pool.every(o => ['wage', 'self', 'means', 'none'].includes(o.incomeSource || 'wage')));

// D10 — adult must be exactly ONE category, or the cast's uniqueness rule
// starts starving and one draw can lock out the others.
const adultCats = [...new Set(pool.filter(o => /adult|cam|escort|dancer/i.test(o.title)).map(o => o.category))];
check('adult work occupies exactly one category (D10)',
  adultCats.length === 1 && adultCats[0] === 'adult', adultCats.join(', '));

// D21 — every no-job entry rides `standard`, which has no work block.
const noneEntries = pool.filter(o => o.workMode === 'none');
check('every workMode:none entry uses SCHEDULES.standard (D21)',
  noneEntries.every(o => o.scheduleTemplate === 'standard'),
  noneEntries.filter(o => o.scheduleTemplate !== 'standard').map(o => o.title).join(', '));
check('SCHEDULES.standard genuinely has no work block',
  api(`!SCHEDULES.standard.weekday.work && !SCHEDULES.standard.weekend.work`));

// D23 — no field without a reader.
check('no pool entry carries a field with no reader',
  pool.every(o => Object.keys(o).every(k => [
    'category', 'title', 'scheduleTemplate', 'incomeBand', 'hours',
    'workMode', 'incomeSource', 'workRoom', 'workActivities', 'affinity', 'traitAffinity',
    // Phase 5 added this one, with its reader in the same change (COGNITION's
    // content-drive candidacy) — which is the only condition D23 imposes.
    'contentWork',
    // Phase 7 added these five; each field's reader:
    //   idlePastimes → idlePastimePreferred (cognition.js)
    //   styleLean    → composeOutfit's styleTagBonus term (items.js)
    //   foodLean     → deriveNpcTaste (taste.js)
    //   sleepRhythm  → resolveScheduleActivity's Dimension 3 branch (sim.js)
    //   spendingLean → occupationLivingClause (llm.js)
    'idlePastimes', 'styleLean', 'foodLean', 'sleepRhythm', 'spendingLean',
  ].includes(k))),
  JSON.stringify([...new Set(pool.flatMap(o => Object.keys(o)))]));

// ---------------------------------------------------------------- 2
console.log('\n2. occupationAffinity (D7/D9)');

check('an entry with no affinity block scores exactly 1.0',
  api(`occupationAffinity({ title: 'x' }, { openness: 0.9 })`) === 1.0);
check('a temperament weight raises the score at the top of the axis',
  api(`occupationAffinity({ affinity: { temperament: { openness: 0.5 } } }, { openness: 1 })`) === 1.5);
check('...and lowers it at the bottom',
  api(`occupationAffinity({ affinity: { temperament: { openness: 0.5 } } }, { openness: -1 })`) === 0.5);
check('the soft floor is never 0 (D9 — soft weights shift odds, never forbid)',
  api(`occupationAffinity({ affinity: { temperament: { openness: 0.99, warmth: 0.99, assertiveness: 0.99 } } }, { openness: -1, warmth: -1, assertiveness: -1 })`)
    === api('VOCATION_TUNING.affinityFloor'));
check('the ceiling clamps',
  api(`occupationAffinity({ affinity: { temperament: { openness: 3, warmth: 3 } } }, { openness: 1, warmth: 1 })`)
    === api('VOCATION_TUNING.affinityCeiling'));
check('below disinhibitionFloor the score is exactly 0 (the one hard gate)',
  api(`occupationAffinity({ affinity: { disinhibitionFloor: 0.62 } }, { volatility: -1, openness: -1, assertiveness: -1 })`) === 0);
check('above it, scoring resumes normally',
  api(`occupationAffinity({ affinity: { disinhibitionFloor: 0.62 } }, { volatility: 1, openness: 1, assertiveness: 1 })`) > 0);

// ---------------------------------------------------------------- 3
console.log('\n3. The hard guarantee — 400 casts, no exceptions');

const sample = api(`
  (() => {
    const out = [];
    for (let i = 0; i < 400; i++) {
      const r = generateCast('voc-p2-' + i, 4, 1, null);
      for (const id of r.npcIds) {
        const b = r.npcs[id].bible;
        out.push({
          cat: b.occupation.category,
          title: b.occupation.title,
          mode: b.occupation.workMode,
          src: b.occupation.incomeSource,
          days: b.occupation.officeDays || [],
          dis: npcDisinhibition(r.npcs[id]),
          temp: b.temperament,
          traits: b.personality.traits,
        });
      }
    }
    return out;
  })()
`);

console.log(`        sampled ${sample.length} characters across 400 casts`);

const floors = api(`
  (() => {
    const m = {};
    for (const o of OCCUPATION_POOL) {
      if (o.affinity && o.affinity.disinhibitionFloor != null) m[o.title] = o.affinity.disinhibitionFloor;
    }
    return m;
  })()
`);

const violations = sample.filter(s => floors[s.title] != null && s.dis < floors[s.title]);
check('NO character below an occupation\'s disinhibitionFloor holds it (D9)',
  violations.length === 0,
  violations.slice(0, 5).map(v => `${v.title} floor=${floors[v.title]} dis=${v.dis.toFixed(3)}`).join('; '));

const adults = sample.filter(s => s.cat === 'adult');
const nonAdults = sample.filter(s => s.cat !== 'adult');
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const adultMean = mean(adults.map(s => s.dis));
const popMean = mean(sample.map(s => s.dis));
check(`adult-work holders skew high on disinhibition (${adultMean.toFixed(3)} vs population ${popMean.toFixed(3)})`,
  adults.length > 0 && adultMean > popMean + 0.08,
  `n=${adults.length}`);
check('adult work does occur (the floor is a gate, not a ban)', adults.length > 0, `n=${adults.length}`);
check('non-adult characters still span the full disinhibition range',
  Math.min(...nonAdults.map(s => s.dis)) < 0.3 && Math.max(...nonAdults.map(s => s.dis)) > 0.7);

// ---------------------------------------------------------------- 4
console.log('\n4. The soft coupling actually leans (D7)');

// Testing one occupation's axis mean is UNDERPOWERED and was the first
// version of this file: a single title draws n~25 out of 1600, an authored
// weight w shifts the axis mean by only w/3, and for the deliberately weak
// leans (w = -0.2 → a shift of -0.07) the standard error is larger than the
// effect. That test failed on noise while the mechanism worked perfectly,
// which is worse than no test.
//
// So the assertion is made across EVERY authored (occupation, axis) pair at
// once. If affinity works, the observed mean of an axis should track the
// authored weight on it — positive weights pulling the mean up, negative
// pulling it down. That is one high-n assertion about the mechanism instead
// of twelve low-n ones about individual jobs.
const weighted = [];
for (const o of pool) {
  const t = o.affinity && o.affinity.temperament;
  if (!t) continue;
  for (const axis in t) {
    const rows = sample.filter(s => s.title === o.title).map(s => s.temp[axis]);
    if (rows.length >= 10) weighted.push({ title: o.title, axis, w: t[axis], observed: mean(rows), n: rows.length });
  }
}

check(`${weighted.length} authored (occupation, axis) pairs have enough sample to score`,
  weighted.length >= 20, `${weighted.length}`);

// Directional agreement: the sign of the observed shift should match the sign
// of the authored weight far more often than chance.
const agree = weighted.filter(x => (x.w > 0 ? x.observed > 0 : x.observed < 0)).length;
const agreeRate = agree / (weighted.length || 1);
check(`observed shift agrees in sign with the authored weight ${agree}/${weighted.length} (${(agreeRate * 100).toFixed(0)}%)`,
  agreeRate >= 0.75);

// Correlation: stronger authored weights should produce larger observed
// shifts. This is the mechanism's signature, not any one job's flavour.
const mw = mean(weighted.map(x => x.w));
const mo = mean(weighted.map(x => x.observed));
const cov = mean(weighted.map(x => (x.w - mw) * (x.observed - mo)));
const sdW = Math.sqrt(mean(weighted.map(x => (x.w - mw) ** 2)));
const sdO = Math.sqrt(mean(weighted.map(x => (x.observed - mo) ** 2)));
const corr = cov / ((sdW * sdO) || 1);
check(`authored weight correlates with observed axis mean (r = ${corr.toFixed(3)})`, corr > 0.6);

// Pooled directional strength. Testing each strongly-weighted pair on its
// own is STILL underpowered even at 1600 characters: an authored weight w
// shifts an axis mean by only w/3, one title draws n~30, and the standard
// error of a [-1,1] axis at that n is ~0.105 — so a 0.5 weight is a 1.5-sigma
// effect per pair and a quarter of them land the wrong side of zero on noise
// alone. There is also a real dilution: many occupations weight
// conscientiousness up, so a conscientious character is spread across all of
// them and no single title absorbs the whole lean.
//
// Pooling the positively- and negatively-weighted pairs recovers the power
// and asks the question that actually matters: do jobs that want an axis high
// get people who are higher on it than jobs that want it low.
const posPairs = weighted.filter(x => x.w >= 0.3);
const negPairs = weighted.filter(x => x.w <= -0.2);
const posMean = mean(posPairs.map(x => x.observed));
const negMean = mean(negPairs.map(x => x.observed));
check(`positively-weighted axes mean ${posMean >= 0 ? '+' : ''}${posMean.toFixed(3)} (n=${posPairs.length} pairs)`,
  posPairs.length >= 10 && posMean > 0.05);
check(`negatively-weighted axes mean ${negMean >= 0 ? '+' : ''}${negMean.toFixed(3)} (n=${negPairs.length} pairs)`,
  negPairs.length >= 5 && negMean < -0.02);
check(`and the two groups are properly separated (gap ${(posMean - negMean).toFixed(3)})`,
  posMean - negMean > 0.12);

// --- The trait lean, the other direction of the coupling -----------------
// Pooled across every occupation for the same power reason: "does a boosted
// trait show up more often on the jobs that boost it" over the whole sample,
// rather than one job's odds of one trait.
const allTraits = sample.flatMap(s => s.traits);
const baseFreq = {};
for (const t of allTraits) baseFreq[t] = (baseFreq[t] || 0) + 1;
const totalSlots = allTraits.length;

let boostedObserved = 0, boostedExpected = 0, dampedObserved = 0, dampedExpected = 0;
for (const o of pool) {
  if (!o.traitAffinity) continue;
  const rows = sample.filter(s => s.title === o.title);
  if (rows.length === 0) continue;
  const slots = rows.flatMap(s => s.traits);
  for (const trait in o.traitAffinity) {
    const mult = o.traitAffinity[trait];
    const seen = slots.filter(t => t === trait).length;
    const expected = slots.length * ((baseFreq[trait] || 0) / totalSlots);
    if (mult > 1.2) { boostedObserved += seen; boostedExpected += expected; }
    else if (mult < 0.8) { dampedObserved += seen; dampedExpected += expected; }
  }
}

check(`boosted traits appear more than baseline (${boostedObserved} seen vs ${boostedExpected.toFixed(1)} expected)`,
  boostedObserved > boostedExpected * 1.3, `ratio ${(boostedObserved / (boostedExpected || 1)).toFixed(2)}x`);
check(`damped traits appear less than baseline (${dampedObserved} seen vs ${dampedExpected.toFixed(1)} expected)`,
  dampedObserved < dampedExpected, `ratio ${(dampedObserved / (dampedExpected || 1)).toFixed(2)}x`);

// And the concrete one worth eyeballing: adult work should read as adult work.
const adultTraitSlots = sample.filter(s => s.cat === 'adult').flatMap(s => s.traits);
const ADULT_CLUSTER = ['sensual', 'brazen', 'teasing', 'forward', 'magnetic', 'daring', 'flirtatious', 'confident'];
const adultClusterRate = adultTraitSlots.filter(t => ADULT_CLUSTER.includes(t)).length / (adultTraitSlots.length || 1);
const popClusterRate = allTraits.filter(t => ADULT_CLUSTER.includes(t)).length / (totalSlots || 1);
// 1.5x is the honest bar, and it is deliberately not higher. The draw is
// WITHOUT replacement from a 68-trait pool, so a title that boosts six
// cluster traits at ~2.6x lands the cluster near 20% against an 11.8%
// baseline and no realistic multiplier moves it far past that — reaching 2x
// would need weights around 4-5x, at which point every adult NPC draws the
// same four traits and the cast turns into a caricature. The GUARANTEE that
// a prudish character never holds this work is the disinhibition floor
// asserted in section 3 (zero violations in 1600 draws); this is flavour on
// top of it, and flavour should lean, not dictate.
check(`adult-work characters draw the sex-positive cluster ${(adultClusterRate * 100).toFixed(1)}% vs population ${(popClusterRate * 100).toFixed(1)}% (${(adultClusterRate / popClusterRate).toFixed(2)}x)`,
  adultClusterRate > popClusterRate * 1.5, `n=${adultTraitSlots.length} slots`);

// ---------------------------------------------------------------- 5
console.log('\n5. Structural invariants that must survive the reorder');

check('category uniqueness still holds within a cast', api(`
  (() => {
    for (let i = 0; i < 60; i++) {
      const r = generateCast('voc-uniq-' + i, 4, 1, null);
      const cats = r.npcIds.map(id => r.npcs[id].bible.occupation.category);
      if (new Set(cats).size !== cats.length) return false;
    }
    return true;
  })()
`));

check('determinism within the version — same seed, same cast, twice', api(`
  (() => {
    const sig = (r) => r.npcIds.map(id => r.npcs[id].bible.occupation.title + '/' + r.npcs[id].bible.temperament.openness).join('|');
    for (const s of ['det-a', 'det-b', 'det-c']) {
      if (sig(generateCast(s, 4, 1, null)) !== sig(generateCast(s, 4, 1, null))) return false;
    }
    return true;
  })()
`));

check('no cast hard-fails (every slot filled)', api(`
  (() => {
    for (let i = 0; i < 60; i++) {
      const r = generateCast('voc-fill-' + i, 4, 1, null);
      if (r.npcIds.length !== 4) return false;
      for (const id of r.npcIds) if (!r.npcs[id].bible.occupation.title) return false;
    }
    return true;
  })()
`));

// D11 — the fallback. Force a pool where every candidate scores 0 for this
// temperament and confirm a pick still happens.
check('D11: an all-zero candidate pool still returns a pick, not a crash', api(`
  (() => {
    const cold = { volatility: -1, openness: -1, assertiveness: -1, warmth: 0, conscientiousness: 0, selfAwareness: 0 };
    const adultOnly = OCCUPATION_POOL.filter(o => o.category === 'adult');
    if (adultOnly.every(o => occupationAffinity(o, cold) === 0)) {
      const rng = seededRng('d11', 'x');
      const anyViable = adultOnly.some(o => occupationAffinity(o, cold) > 0);
      const picked = weightedPick(rng, adultOnly, anyViable ? (o => occupationAffinity(o, cold)) : null);
      return !!(picked && picked.title);
    }
    return false;  // the premise did not hold — the floors are too low to test
  })()
`));

// ---------------------------------------------------------------- 6
console.log('\n6. The bible record is clean and complete');

const rec = api(`
  (() => {
    const r = generateCast('voc-rec', 4, 1, null);
    return r.npcIds.map(id => r.npcs[id].bible.occupation);
  })()
`);
check('every record carries workMode and incomeSource',
  rec.every(o => o.workMode && o.incomeSource), JSON.stringify(rec[0]));
check('roll-time tuning is NOT persisted onto the bible (D23)',
  rec.every(o => o.affinity === undefined && o.traitAffinity === undefined),
  JSON.stringify(rec.map(o => Object.keys(o))));

const hybrids = sample.filter(s => s.mode === 'hybrid');
check('every hybrid NPC has a rolled officeDays set (D4)',
  hybrids.length > 0 && hybrids.every(s => s.days.length >= 2 && s.days.length <= 3),
  `n=${hybrids.length}`);
check('officeDays are all weekday indices 0-4',
  hybrids.every(s => s.days.every(d => d >= 0 && d <= 4)));
check('no non-hybrid NPC carries officeDays',
  sample.filter(s => s.mode !== 'hybrid').every(s => s.days.length === 0));

const noneNpcs = sample.filter(s => s.mode === 'none');
check('workMode:none NPCs occur and carry means|none income (D20)',
  noneNpcs.length > 0 && noneNpcs.every(s => s.src === 'means' || s.src === 'none'),
  `n=${noneNpcs.length}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
