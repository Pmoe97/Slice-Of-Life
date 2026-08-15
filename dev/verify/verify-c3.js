// NPC cognition plan, Phase 3 — personality differentiation.
//
//   node dev/verify/verify-c3.js
//
// Phase 1 made scoring computable and Phase 2 made it a decision. Neither made
// anyone a *person*: every NPC in the flat scored every drive identically given
// the same needs, because exactly one entry in DRIVE_DEFS declared
// `temperamentWeights`. This phase authors them across the table, and the thing
// worth pinning is not the arithmetic — verify-c1 already pins `1 + Σ(axis ×
// weight)` — but the EFFECT: two casts differing in one temperament axis and in
// nothing else must visibly do different things.
//
// The measurement is PAIRED. Both arms run the same seeds, so the same houses,
// the same jobs, the same needs — one axis is forced to +0.8 on one arm and
// -0.8 on the other, and every difference downstream is caused by that. This
// matters: measured across DIFFERENT seeds, two casts with identical
// temperament settings differ by as much as the warmth effect itself (social
// actions 75 vs 66 over 8 households), so an unpaired comparison at this
// population size would prove nothing at all.
//
// The margin the plan asks for — "larger than the run-to-run spread" — is
// therefore asserted as a CROSS-CONTROL rather than as a variance estimate: the
// axis that should move a group of drives moves it, and the axis that should
// not, does not, on the same houses in the same harness.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js', 'sim.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// 14 households x 7 in-game days, per arm. Was 8 until the initiative plan's
// Phase 4: `text_player` moved out of DRIVE_DEFS and into OVERTURE_DEFS, and an
// overture cannot fire in THIS harness at all — it drives resolveBatch directly
// and so never writes episodes (the cognition plan's measurement trap), which
// leaves curiosity at zero, and every relationship axis generates at 0. So
// warmth's observable group went from three drives to two and the per-household
// direction stopped being unanimous at eight houses. More houses is the honest
// answer to a smaller group: it buys the measurement back its power rather than
// asking less of it. 7s → 13s.
const HOUSES = 14, TICKS = 336;
const EXTREME = 0.8;                // how far each arm pushes its axis

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __ctx = (block, extra) => Object.assign({ perceived: [], block: block, nowAbs: 0,
    // D4 (continuous-behavior-engine Phase 3): the routine term is a function
    // of the current MINUTE of day, so a ctx names a representative minute
    // from the block's first window (midpoint) when the block maps to one.
    minutesOfDay: BLOCK_TIME_OF_DAY[block] ? (BLOCK_TIME_OF_DAY[block][0][0] + BLOCK_TIME_OF_DAY[block][0][1]) / 2 : 720,
  }, extra || {});

  // An NPC with one axis pinned and everything else left alone. Used both for
  // scoring one drive and for running a whole cast.
  __withAxis = (npc, axis, v) => ({ ...npc,
    bible: { ...npc.bible, temperament: { ...npc.bible.temperament, [axis]: v } } });
  __flat = (npc, v) => ({ ...npc, bible: { ...npc.bible, temperament: Object.fromEntries(
    Object.keys(CHARACTER_SCHEMA.bible.temperament.fields).map(a => [a, v])) } });

  // One arm: the same HOUSES seeds, every resident's chosen axis forced to v.
  // Returns per-household fired counts, so a group's direction can be read both
  // in aggregate and household by household.
  __arm = (houses, ticks, axis, v) => {
    const per = [];
    const orig = evaluateDrives;
    let rows = [];
    evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
      const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
      const res = orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
      const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
      // npc-initiative-retiming Phase 2 (D2) moved cooldown stamps from a
      // within-day tick index to an absolute minute (clockToAbsolute space).
      // This harness predates that and was still comparing against
      // currentTick — a 0..47 index a stamp in the thousands can never equal
      // — so the filter matched nothing, every arm read 0 actions across 0
      // drives, and every downstream personality comparison read 0 vs 0.
      const nowAbs = clockToAbsolute(gameState.meta.clock);
      rows.push(Object.keys(after).filter(d => after[d] === nowAbs && before[d] !== nowAbs));
      return res;
    };
    try {
      for (let i = 0; i < houses; i++) {
        rows = [];
        const g = __mk(20260811 + i * 7919);
        for (const n of Object.values(g.npcs)) {
          if (n.bible && n.bible.temperament) n.bible.temperament = { ...n.bible.temperament, [axis]: v };
        }
        resolveBatch(g, ticks);                       // returns new state; we only want the trace
        const by = {}; let total = 0;
        for (const fired of rows) for (const d of fired) { by[d] = (by[d] || 0) + 1; total++; }
        per.push({ by, total, samples: rows.length });
      }
    } finally { evaluateDrives = orig; }
    return per;
  };
`);

const AXES = JSON.parse(api(`JSON.stringify(Object.keys(CHARACTER_SCHEMA.bible.temperament.fields))`));
const WEIGHTS = JSON.parse(api(`
  JSON.stringify(Object.fromEntries(Object.entries(DRIVE_DEFS)
    .filter(([, d]) => d.utility.temperamentWeights)
    .map(([id, d]) => [id, d.utility.temperamentWeights])))
`));
const ALL = JSON.parse(api(`JSON.stringify(Object.keys(DRIVE_DEFS))`));
const THRESHOLD = api(`COGNITION.actionThreshold`);

// Since the initiative plan's Phase 4 there are TWO tables of things one scorer
// ranks, and both author temperamentWeights — `text_player` moved from
// DRIVE_DEFS to OVERTURE_DEFS wholesale, taking warmth's third member with it.
// The arm trace counts an overture win like any other (the overture branch sets
// a cooldown on the same key), so the only thing that had to change is where
// the GROUP is derived from: an axis's footprint is everything that declares
// it, in whichever table it lives.
//
// It contributes ZERO here, and that is this harness's own limit rather than a
// dead entry — see the note on HOUSES. verify-i4 is where the text channel is
// exercised. Deriving the group from both tables anyway is the point: the day
// an overture does fire in an arm, warmth's measurement already counts it.
const CANDIDATE_WEIGHTS = { ...WEIGHTS, ...JSON.parse(api(`
  JSON.stringify(Object.fromEntries(Object.entries(OVERTURE_DEFS)
    .filter(([, d]) => d.utility.temperamentWeights)
    .map(([id, d]) => [id, d.utility.temperamentWeights])))
`)) };

// ---------------------------------------------------------------------------
console.log('\nthe authored table is well formed');
check(`${Object.keys(WEIGHTS).length} of ${ALL.length} drives declare temperamentWeights`,
      Object.keys(WEIGHTS).length >= 12,
      'Phase 3 authors the table; one entry (Phase 1\'s clean_common proof) is not a personality system');
check('every axis named is one the character schema actually rolls',
      Object.values(WEIGHTS).every(w => Object.keys(w).every(a => AXES.includes(a))),
      JSON.stringify(Object.entries(WEIGHTS).flatMap(([id, w]) =>
        Object.keys(w).filter(a => !AXES.includes(a)).map(a => `${id}.${a}`))) +
      ' — a misspelled axis reads as authored intent and contributes exactly nothing');
check('no weight is zero — an authored 0 is a claim that does nothing',
      Object.values(WEIGHTS).every(w => Object.values(w).every(v => typeof v === 'number' && v !== 0)));
// R8, applied to personality rather than to fields. Six axes are rolled for
// every character, schema-validated and rendered in the character studio; an
// axis with no behavioural consequence is the exact defect class the audit that
// started this roadmap found 34 of. `selfAwareness` was one until this phase.
for (const axis of AXES) {
  const users = Object.entries(WEIGHTS).filter(([, w]) => w[axis] !== undefined).map(([id]) => id);
  check(`${axis} has at least one drive that reads it`, users.length > 0,
        'the generator rolls this axis for every character — an axis nothing acts on is a rendered number');
}
const totalBy = {};
for (const w of Object.values(WEIGHTS)) for (const [a, v] of Object.entries(w)) totalBy[a] = (totalBy[a] || 0) + Math.abs(v);
const totalAll = Object.values(totalBy).reduce((s, v) => s + v, 0);
check('no single axis carries more than half of the authored weight',
      Math.max(...Object.values(totalBy)) / totalAll < 0.5,
      JSON.stringify(Object.fromEntries(Object.entries(totalBy).map(([a, v]) => [a, +(v / totalAll).toFixed(2)]))) +
      ' — a cast that differentiates on one dial has one personality with a volume knob');
check('the personality multiplier never reaches COGNITION.temperamentFloor', api(`
  Object.values(DRIVE_DEFS).every(d => {
    const w = d.utility.temperamentWeights;
    if (!w) return true;
    const worst = 1 - Object.values(w).reduce((s, v) => s + Math.abs(v), 0);
    return worst > COGNITION.temperamentFloor + 0.1;
  })
`), api(`
  JSON.stringify(Object.fromEntries(Object.entries(DRIVE_DEFS).filter(([, d]) => d.utility.temperamentWeights)
    .map(([id, d]) => [id, +(1 - Object.values(d.utility.temperamentWeights).reduce((s, v) => s + Math.abs(v), 0)).toFixed(2)])))
`) + ' — the floor is a safety net for future authoring, not a number any drive should sit on');
// README rule 5: never hardcode a value another file owns. These four numbers
// ARE NPC_PEEP_TUNING's, written as the signed weights this idiom takes; they
// cannot be referenced directly because that table is declared after DRIVE_DEFS.
for (const [drive, cfg] of [['peep_player', 'NPC_PEEP_TUNING'], ['snoop_phone', 'SNOOP_TUNING']]) {
  check(`${drive}'s weights are still ${cfg}.chanceModifiers' own numbers`, api(`
    DRIVE_DEFS.${drive}.utility.temperamentWeights.openness === ${cfg}.chanceModifiers.openness &&
    DRIVE_DEFS.${drive}.utility.temperamentWeights.conscientiousness === -${cfg}.chanceModifiers.lowConscientiousness
  `), api(`JSON.stringify([DRIVE_DEFS.${drive}.utility.temperamentWeights, ${cfg}.chanceModifiers])`));
}

// ---------------------------------------------------------------------------
console.log('\nand there is still exactly one thing that consumes it (D7)');
const fs = require('fs');
const SRCFILES = fs.readdirSync(path.join(__dirname, '..', '..', 'src', 'srcfiles')).filter(f => f.endsWith('.js'));
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');
const readers = SRCFILES.filter(f => f !== 'config.js' && /temperamentWeights/.test(srcOf(f)));
check('temperamentWeights is read in cognition.js and nowhere else',
      readers.length === 1 && readers[0] === 'cognition.js', JSON.stringify(readers));
check('and it is the third use of the INTERRUPTION idiom, not a third shape',
      /1 \+ sum|1 \+ Σ|sum \+= v \* /.test(srcOf('cognition.js')) &&
      /personalityWeights/.test(srcOf('interruption.js')),
      'INTERRUPTION.personalityWeights and SNOOP_TUNING.chanceModifiers are the first two');

// ---------------------------------------------------------------------------
console.log('\nevery authored weight moves the score in the direction it claims');
// Not the whole file's point (the plan asks for the effect, not the
// arithmetic), but a sign typo or an axis that quietly contributes nothing
// would otherwise only show up as a behavioural difference that failed to
// appear, three phases from here.
for (const [driveId, w] of Object.entries(WEIGHTS)) {
  const wrong = JSON.parse(api(`
    (() => {
      const g = __mk(20260811);
      const npc = { ...g.npcs[__ids(g)[0]], flags: {} };
      const w = DRIVE_DEFS['${driveId}'].utility.temperamentWeights;
      const ctx = __ctx('leisure', { perceived: [{ signalId: 'rot', intensity: 0.6, salience: 0.6 },
                                                  { signalId: 'clutter', intensity: 0.6, salience: 0.6 }] });
      const bad = [];
      for (const axis of Object.keys(w)) {
        const hi = scoreDrive('${driveId}', __withAxis(__flat(npc, 0), axis,  1), ctx).score;
        const lo = scoreDrive('${driveId}', __withAxis(__flat(npc, 0), axis, -1), ctx).score;
        if (w[axis] > 0 ? !(hi > lo) : !(hi < lo)) bad.push(axis);
      }
      return JSON.stringify(bad);
    })()
  `));
  check(`${driveId}: ${Object.entries(w).map(([a, v]) => `${a} ${v > 0 ? '+' : '-'}`).join(', ')}`,
        wrong.length === 0, `wrong direction on ${JSON.stringify(wrong)}`);
}
check('the Σ idiom holds for a MULTI-axis drive, not just the single-axis one verify-c1 pins', api(`
  (() => {
    const g = __mk(20260811);
    const base = __flat({ ...g.npcs[__ids(g)[0]], flags: {} }, 0);
    const npc = { ...base, bible: { ...base.bible, temperament: { ...base.bible.temperament,
      warmth: 0.5, assertiveness: -0.25 } } };
    const w = DRIVE_DEFS.seek_company.utility.temperamentWeights;
    const s = scoreDrive('seek_company', npc, __ctx('leisure'));
    const appeal = s.terms.base + s.terms.need + s.terms.signal;
    const expected = appeal * (1 + 0.5 * w.warmth + -0.25 * w.assertiveness) * s.terms.block * s.terms.recency;
    return Math.abs(s.score - expected) < 1e-9;
  })()
`), 'two axes have to SUM, not compose — the difference is invisible until a drive declares two');

// ---------------------------------------------------------------------------
console.log('\npersonality is a preference, not a gate: needs stay load-bearing');
// verify-c1 asserts "a rested NPC still does not want a nap" at a neutral
// temperament. A weight big enough to clear actionThreshold on base alone would
// re-open that hole for one end of an axis — the drive would fire with its need
// fully satisfied, which is a gate stuck open wearing a curve's clothes.
for (const driveId of ALL) {
  const has = api(`!!(DRIVE_DEFS['${driveId}'].utility.need && DRIVE_DEFS['${driveId}'].utility.temperamentWeights)`);
  if (!has) continue;
  const worst = JSON.parse(api(`
    (() => {
      const g = __mk(20260811);
      const npc0 = { ...g.npcs[__ids(g)[0]], flags: {} };
      const d = DRIVE_DEFS['${driveId}'];
      // The temperament that likes this drive most: +1 on every positive axis,
      // -1 on every negative one. Then satisfy its need completely.
      const t = {};
      for (const [a, v] of Object.entries(d.utility.temperamentWeights)) t[a] = v > 0 ? 1 : -1;
      const npc = { ...npc0, needs: { ...npc0.needs, [d.utility.need.need]: 100 },
                    bible: { ...npc0.bible, temperament: { ...__flat(npc0, 0).bible.temperament, ...t } } };
      let top = 0, at = null;
      for (const block of (d.timeOfDay || ['leisure'])) {
        const s = scoreDrive('${driveId}', npc, __ctx(block));
        if (s.score > top) { top = s.score; at = block; }
      }
      return JSON.stringify({ top: +top.toFixed(4), at });
    })()
  `));
  check(`${driveId} scores ${worst.top} with its need满 satisfied — under the bar`.replace('满 ', ' '),
        worst.top < THRESHOLD,
        `best block '${worst.at}': the most enthusiastic possible NPC would do this with nothing to do it about`);
}

// ---------------------------------------------------------------------------
console.log(`\nthe effect: ${HOUSES} households x ${TICKS / 48} in-game days per arm, paired by seed`);
const arms = {};
for (const [axis, v] of [['conscientiousness', EXTREME], ['conscientiousness', -EXTREME],
                         ['warmth', EXTREME], ['warmth', -EXTREME]]) {
  arms[`${axis}${v > 0 ? '+' : '-'}`] = JSON.parse(api(`JSON.stringify(__arm(${HOUSES}, ${TICKS}, '${axis}', ${v}))`));
}
// The groups are DERIVED from the table, never restated: "the drives a
// conscientious person is authored to prefer" is exactly the set with a
// positive conscientiousness weight. Restating them here would be a second copy
// of the authoring that could disagree with it.
const groupFor = (axis, sign) => Object.entries(CANDIDATE_WEIGHTS)
  .filter(([, w]) => (w[axis] || 0) * sign > 0).map(([id]) => id);
const tally = (arm, keys) => arm.reduce((s, h) => s + keys.reduce((a, k) => a + (h.by[k] || 0), 0), 0);
const houseSigns = (hi, lo, keys) => {
  let up = 0, tie = 0, down = 0;
  for (let i = 0; i < hi.length; i++) {
    const a = keys.reduce((s, k) => s + (hi[i].by[k] || 0), 0);
    const b = keys.reduce((s, k) => s + (lo[i].by[k] || 0), 0);
    if (a > b) up++; else if (a === b) tie++; else down++;
  }
  return { up, tie, down };
};

const cases = [
  { axis: 'conscientiousness', sign: +1, other: 'warmth',
    label: 'the conscientious cast keeps house more (shower, wash up, laundry, tidy)' },
  { axis: 'conscientiousness', sign: -1, other: 'warmth',
    label: 'and stops to nap and to sit down LESS' },
  { axis: 'warmth', sign: +1, other: 'conscientiousness',
    label: 'the warm cast seeks people out more (company, chat, texts)' },
];
for (const c of cases) {
  const keys = groupFor(c.axis, c.sign);
  const hi = arms[`${c.axis}+`], lo = arms[`${c.axis}-`];
  const a = tally(hi, keys), b = tally(lo, keys);
  const signs = houseSigns(hi, lo, keys);
  const wanted = c.sign > 0 ? a > b : a < b;
  const margin = Math.abs(a - b) / Math.max(a, b, 1);
  // The bar is a real effect, not a specific effect SIZE. This asserted
  // `margin > 0.15`, a number picked by eye from an exploratory run made BEFORE
  // Plan 3's Phase 5 retuned the social baseAppeals; the retune moved warmth's
  // group to 13% and the assertion failed on a deliberate tuning change while
  // the effect it exists to prove was still plainly there (7 of 8 households
  // up, none down, 3.25x the cross-control). An absolute percentage is a
  // property of today's constants; "bigger than the same measurement with the
  // wrong axis" is the property that has to stay true, and it is asserted
  // against the control just below.
  check(`${c.label} — ${a} vs ${b} (${(margin * 100).toFixed(0)}% apart)`,
        wanted && margin > 0.05,
        `${JSON.stringify(keys)}: high ${a}, low ${b}, per-household ${JSON.stringify(signs)}`);
  // THE CROSS-CONTROL, and the plan's "margin larger than the run-to-run
  // spread". The same houses, the same group of drives, an axis those drives do
  // not declare: the group must barely move.
  const chi = arms[`${c.other}+`], clo = arms[`${c.other}-`];
  const ca = tally(chi, keys), cb = tally(clo, keys);
  const controlMargin = Math.abs(ca - cb) / Math.max(ca, cb, 1);
  const controlSigns = houseSigns(chi, clo, keys);
  // Per household, not only in the total — and measured the same way the margin
  // above is, against the wrong axis on the same houses.
  //
  // This asked for `down === 0` until the initiative plan's Phase 4, and that
  // was a property of warmth's group having THREE members: `text_player` became
  // an overture, and an overture needs a relationship axis to have moved before
  // it fires at all, so on an untouched cast warmth's observable footprint is
  // two drives instead of three and one household in eight now ties or flips on
  // noise. The aggregate effect did not move (13% apart, cross-control 4%). The
  // same thing happened to the aggregate margin one plan earlier, when it was a
  // hardcoded 15% and Phase 5's retune walked under it; the fix then was to stop
  // asserting a number the constants own and start asserting the comparison, and
  // this is that fix applied to the second half of the same measurement. It
  // still fails outright if the axis stops mattering — a group that moved by
  // coincidence has no more net direction than the control does.
  const net = (s) => (c.sign > 0 ? s.up - s.down : s.down - s.up);
  check(`  ...and the direction holds house by house (${signs.up} up, ${signs.tie} tied, ${signs.down} down; wrong axis nets ${net(controlSigns)})`,
        net(signs) >= HOUSES / 2 && net(signs) > Math.abs(net(controlSigns)),
        `${JSON.stringify(signs)} against control ${JSON.stringify(controlSigns)}`);
  check(`  ...while ${c.other} moves the same drives by only ${(controlMargin * 100).toFixed(0)}%`,
        controlMargin < margin / 2,
        `control ${ca} vs ${cb} — if this is comparable, the effect above is chaos, not personality`);
}

// ---------------------------------------------------------------------------
console.log('\nan extreme is a personality, not a monomania');
for (const arm of Object.keys(arms)) {
  const per = arms[arm];
  const by = {};
  let total = 0;
  for (const h of per) for (const [d, n] of Object.entries(h.by)) { by[d] = (by[d] || 0) + n; total += n; }
  const distinct = Object.keys(by).length;
  const top = Math.max(...Object.values(by));
  check(`${arm}: ${total} actions across ${distinct} different drives, biggest share ${((top / total) * 100).toFixed(0)}%`,
        distinct >= 8 && top / total < 0.35,
        JSON.stringify(by) + ' — a conscientious NPC who only cleans is a bug, not a personality');
}
const rates = Object.entries(arms).map(([k, per]) => [k, per.reduce((s, h) => s + h.total, 0) / per.reduce((s, h) => s + h.samples, 0)]);
const rMin = Math.min(...rates.map(r => r[1])), rMax = Math.max(...rates.map(r => r[1]));
check(`personality redistributes rather than suppresses — ${rates.map(([k, r]) => `${k} ${r.toFixed(3)}`).join(', ')}`,
      (rMax - rMin) / rMax < 0.2,
      'if one extreme acts far less than the other, the weights are a rate lever wearing a personality label');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
