// Seasonal Calendar & Sandbox Plan — Phase A4: decouple investing from the
// game year.
//
// D8 introduces INVESTING.daysPerFinancialYear = 360 — DELIBERATELY not
// CALENDAR.daysPerYear (140), because tying daily return to the game year
// would silently triple fund earnings (a $10k Index position would earn
// ~$6.43/day instead of ~$2.50/day) — a 2.57x buff to the
// upgrade-accelerator system. The financial year stays 360 so per-day
// returns are byte-identical to the pre-calendar-change game and the
// real-world return anchors (S&P, T-bills) stay legible. The display must
// stop claiming a "%/yr" the game cannot reach: the fund card headline is
// now the per-season figure, labelled /season.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRCFILES, f), 'utf8');

// The pre-plan daily return, reconstructed inline — the old constant is
// gone from config and must not be read from it. `daysPerFinancialYear`
// existing at all means a naive future change could silently re-tune the
// game's economy; this replica is what "byte-identical to before" is judged
// against.
function oldDailyReturn(annualReturn, volatility, day, fundId) {
  let seed = 2166136261;
  const s = fundId + '_' + day;
  for (let i = 0; i < s.length; i++) {
    seed = Math.imul(seed ^ s.charCodeAt(i), 16777619);
  }
  seed = seed >>> 0;
  const rng = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return (annualReturn / 360) + z * volatility;
}

// ---------------------------------------------------------------- 0
console.log('\n0. D8 constants — the financial year is 360 and the funds did not move');

const cfg = api(`
  (() => {
    return {
      dpfy: INVESTING.daysPerFinancialYear,
      dpfyInBody: /annualReturn \\/ INVESTING\\.daysPerFinancialYear/.test(INVESTING.dailyReturn.toString()),
      funds: INVESTING.funds.map(f => ({ id: f.id, expectedReturn: f.expectedReturn, volatility: f.volatility })),
      fee: INVESTING.fee,
      daysPerYear: CALENDAR.daysPerYear,
      daysPerSeason: CALENDAR.daysPerSeason,
    };
  })()
`);
check('INVESTING.daysPerFinancialYear === 360 (the pin — per-day parity lives or dies here)', cfg.dpfy === 360, `got ${cfg.dpfy}`);
check('dailyReturn divides by INVESTING.daysPerFinancialYear (not a hardcoded 360)', cfg.dpfyInBody === true);
check('funds are untouched: tbill 0.04, index 0.09, growth 0.14 with their volatilities',
      JSON.stringify(cfg.funds) === JSON.stringify([
        { id: 'tbill', expectedReturn: 0.04, volatility: 0.002 },
        { id: 'index', expectedReturn: 0.09, volatility: 0.012 },
        { id: 'growth', expectedReturn: 0.14, volatility: 0.025 },
      ]), JSON.stringify(cfg.funds));
check('fee stays 0.005', cfg.fee === 0.005, `got ${cfg.fee}`);
check('the game year is 140 with 35-day seasons (the decoupling is real, not a rename)', cfg.daysPerYear === 140 && cfg.daysPerSeason === 35);

const configSrc = srcOf('config.js');
const stale360 = [];
configSrc.split('\n').forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, '').trim();
  if (/(expectedReturn|annualReturn)\s*\/\s*360/.test(code)) stale360.push(`config.js:${i + 1}`);
});
check('no investing formula divides by a bare 360 outside comments', stale360.length === 0, stale360.join(', '));

// ---------------------------------------------------------------- 1
console.log('\n1. Per-day parity — the new dailyReturn is byte-identical to the old');

const funds = api(`INVESTING.funds.map(f => ({ id: f.id, er: f.expectedReturn, vol: f.volatility }))`);
let mismatches = 0, exactCount = 0;
for (const f of funds) {
  for (let day = 1; day <= 500; day++) {
    const now = api(`INVESTING.dailyReturn(${f.er}, ${f.vol}, ${day}, '${f.id}')`);
    const before = oldDailyReturn(f.er, f.vol, day, f.id);
    if (now !== before) mismatches++;
    else exactCount++;
  }
}
check(`new dailyReturn === old (annual/360 ± noise) for every fund on every day 1-500 (${exactCount}/${funds.length * 500} exact)`, mismatches === 0, `${mismatches} mismatches`);

// The seeded noise path is untouched: same fund+day → same value across runs.
const noiseA = api(`INVESTING.dailyReturn(0.09, 0.012, 123, 'index')`);
const noiseB = api(`INVESTING.dailyReturn(0.09, 0.012, 123, 'index')`);
const noiseC = api(`INVESTING.dailyReturn(0.09, 0.012, 124, 'index')`);
check('noise is deterministic: same fund+day twice returns the identical value', noiseA === noiseB, `${noiseA} vs ${noiseB}`);
check('noise is per-day: a different day gives a different draw', noiseA !== noiseC);

// ---------------------------------------------------------------- 2
console.log('\n2. The guard-rail — financial year must never collapse onto the game year');

if (api(`INVESTING.daysPerFinancialYear`) === api(`CALENDAR.daysPerYear`)) {
  check('INVESTING.daysPerFinancialYear !== CALENDAR.daysPerYear — read D8 before changing this.', false);
} else {
  check('INVESTING.daysPerFinancialYear !== CALENDAR.daysPerYear — read D8 before changing this.', true);
}

// ---------------------------------------------------------------- 3
console.log('\n3. $10,000 in index over 140 days — the real game path, vs the pre-plan figure');

const compound = api(`
  (() => {
    const h = SIM_generateHouse('a4-compound', 0);
    h.world.computer.apps.invest.holdings.index = { shares: 10000, costBasis: 10000 };
    for (let day = 1; day <= 140; day++) processInvestmentGrowth(h, day);
    return h.world.computer.apps.invest.holdings.index.shares;
  })()
`);
let oldCompound = 10000;
for (let day = 1; day <= 140; day++) {
  oldCompound *= (1 + oldDailyReturn(0.09, 0.012, day, 'index'));
}
const ratio = compound / oldCompound;
console.log('    recorded: $' + compound.toFixed(2) + ' via processInvestmentGrowth over 140 days vs $' + oldCompound.toFixed(2) + ' at the pre-plan rate (' + (ratio * 100).toFixed(2) + '%)');
check('the game-path compound is within 1% of the pre-plan figure', Math.abs(ratio - 1) <= 0.01, `ratio ${(ratio * 100).toFixed(2)}%`);

// Sanity that processInvestmentGrowth actually routes through dailyReturn
// (so section 1's parity is the same code the game runs).
const computerSrc = srcOf('computer.js');
check('processInvestmentGrowth calls INVESTING.dailyReturn',
      /INVESTING\.dailyReturn\(fund\.expectedReturn, fund\.volatility, day, fundId\)/.test(computerSrc));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
