// Seasonal Calendar & Sandbox Plan — Phase A3: taxes on a two-season period.
//
// D3 bills taxes on days 70 and 140 and every 70 days thereafter — end of
// Summer and end of Winter ("the summer bill and the winter bill"). D4
// scales TAX_CONFIG.interestRate 0.02 → 0.015 (0.02 × 70/90 = 0.0156,
// rounded to three decimals) because interest compounds on a carried
// balance that does NOT shrink with the period, while underpaymentPenalty
// stays 0.08 because it is a fraction of a shortfall that DOES. D5's
// 35-day internet cadence makes the tax deduction exact: ceil(70/35) = 2 =
// the real posting count, where the old ceil(70/30) = 3 would read 3
// against 2.33 actual — and per-season, ceil(35/30) = 2 against 1.17, a
// 71% over-deduction every period.
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

// ---------------------------------------------------------------- 0
console.log('\n0. D3/D4 constants — config matches the locked decisions');

const cfg = api(`
  (() => {
    const b = {};
    for (const id of ['electric', 'water', 'gas', 'internet', 'phone', 'insurance']) {
      b[id] = BILL_DEFS[id].cadenceDays;
    }
    return {
      rate: TAX_CONFIG.rate,
      interest: TAX_CONFIG.interestRate,
      penalty: TAX_CONFIG.underpaymentPenalty,
      internetFraction: TAX_CONFIG.internetDeductibleFraction,
      daysPerTaxPeriod: CALENDAR.daysPerTaxPeriod,
      internetCadence: BILL_DEFS.internet.cadenceDays,
      bills: b,
      initLast: (SIM_generateHouse('a3-cfg', 0).world.taxes.lastQuarterBilled),
    };
  })()
`);
check('interestRate is 0.015 (D4: 0.02 × 70/90 = 0.0156, rounded to 3 decimals)', cfg.interest === 0.015, `got ${cfg.interest}`);
check('underpaymentPenalty stays 0.08 (D4: self-normalising — do not scale)', cfg.penalty === 0.08, `got ${cfg.penalty}`);
check('rate and internetDeductibleFraction untouched (0.27 / 0.5)', cfg.rate === 0.27 && cfg.internetFraction === 0.5);
check('daysPerTaxPeriod === 70 and internet cadence === 35 (D3 + D5, the exactness precondition)', cfg.daysPerTaxPeriod === 70 && cfg.internetCadence === 35);
const badCadence = Object.keys(cfg.bills).filter(id => cfg.bills[id] !== 35);
check('all six utility bills are cadenceDays 35 (D5 — every utility posts twice per tax period)', badCadence.length === 0, badCadence.join(', '));
check('a fresh house starts lastQuarterBilled at -1 (nothing billed yet, 0-1 semantics)', cfg.initLast === -1, `got ${cfg.initLast}`);

// ---------------------------------------------------------------- 1
console.log('\n1. The tax-period calendar — days 70 and 140 bill, and only they do');

const tp = api(`
  (() => {
    const ends = [];
    for (let day = 1; day <= 300; day++) if (isTaxPeriodEnd(day)) ends.push(day);
    return {
      ends,
      seasons: { d1: getSeason(1), d70: getSeason(70), d71: getSeason(71), d140: getSeason(140), d141: getSeason(141) },
      periods: { d1: getTaxPeriod(1), d70: getTaxPeriod(70), d71: getTaxPeriod(71), d140: getTaxPeriod(140), d141: getTaxPeriod(141), d210: getTaxPeriod(210) },
      periodDays: { d70: getTaxPeriodDay(70), d71: getTaxPeriodDay(71), d140: getTaxPeriodDay(140) },
    };
  })()
`);
check('isTaxPeriodEnd is true for exactly {70, 140, 210, 280} in days 1-300', JSON.stringify(tp.ends) === '[70,140,210,280]', `got [${tp.ends}]`);
check("getSeason(70) === 'summer' and getSeason(140) === 'winter' (D3's user-facing promise)", tp.seasons.d70 === 'summer' && tp.seasons.d140 === 'winter', `got ${tp.seasons.d70}/${tp.seasons.d140}`);
check('getTaxPeriod cycles 0-1-0: day 1→0, 70→0, 71→1, 140→1, 141→0, 210→0',
      tp.periods.d1 === 0 && tp.periods.d70 === 0 && tp.periods.d71 === 1 && tp.periods.d140 === 1 && tp.periods.d141 === 0 && tp.periods.d210 === 0,
      JSON.stringify(tp.periods));
check('getTaxPeriodDay runs 1-70 within a period (day 70 → 70, day 71 → 1, day 140 → 70)',
      tp.periodDays.d70 === 70 && tp.periodDays.d71 === 1 && tp.periodDays.d140 === 70,
      JSON.stringify(tp.periodDays));

// ---------------------------------------------------------------- 2
console.log('\n2. The lastQuarterBilled guard — one bill per period, no double bill');

// The guard is `lastQuarterBilled === taxPeriod && quarterGross === 0 &&
// unpaid === 0` — so the double-bill test must end the first call with the
// period fully settled (reserve covering the tax). A carried unpaid
// balance deliberately re-accrues interest on a same-period re-call; that
// is the pre-existing design (the rollover fires the function on exactly
// one day per period) and is asserted separately below.
const guard = api(`
  (() => {
    const h = SIM_generateHouse('a3-guard', 0);
    const t = h.world.taxes;
    t.quarterGross = 1000;   // income this period
    t.reserve = 1000;        // auto-reserve covers it → no shortfall, no penalty
    const first = processQuarterlyTaxes(h, 70);
    const afterFirst = JSON.stringify({ last: t.lastQuarterBilled, gross: t.quarterGross, unpaid: t.unpaid, reserve: t.reserve });
    const again = processQuarterlyTaxes(h, 70);
    const afterSecond = JSON.stringify({ last: t.lastQuarterBilled, gross: t.quarterGross, unpaid: t.unpaid, reserve: t.reserve });
    return { first, again, afterFirst, afterSecond };
  })()
`);
check('the first call bills period 0: taxPeriod 0, owed 245 (1000 gross − 93 internet deduction → 907 × 0.27 = 244.89 → 245)',
      guard.first && guard.first.taxPeriod === 0 && guard.first.owed === 245,
      guard.first ? `owed ${guard.first.owed}` : 'null');
check('the reserve covers it: fromReserve 245, no shortfall, no penalty, unpaid 0', guard.first && guard.first.fromReserve === 245 && guard.first.shortfall === 0 && guard.first.penalty === 0);
check('state after billing: lastQuarterBilled 0, gross 0, unpaid 0, reserve 755', guard.afterFirst === '{"last":0,"gross":0,"unpaid":0,"reserve":755}', guard.afterFirst);
check('a second call in the same period returns null (the guard prevents the double bill)', guard.again === null);
check('the second call changes nothing', guard.afterSecond === guard.afterFirst);

// Document the guard's real scope: a carried unpaid balance re-accrues
// interest on a same-period re-call. The rollover only calls this on
// isTaxPeriodEnd days (one per period), so this never fires in flow.
const guardScope = api(`
  (() => {
    const h = SIM_generateHouse('a3-guard-scope', 0);
    const t = h.world.taxes;
    t.quarterGross = 1000; t.reserve = 0;   // unpaid shortfall → carried forward
    const first = processQuarterlyTaxes(h, 70);
    const unpaidAfterFirst = t.unpaid;
    const again = processQuarterlyTaxes(h, 70);
    return { first, unpaidAfterFirst, again: again ? { interestCharge: again.interestCharge, unpaid: t.unpaid } : null };
  })()
`);
check('a carried unpaid balance keeps the guard from firing on a same-period re-call (pre-existing design, unchanged)',
      guardScope.unpaidAfterFirst === 265 && guardScope.again && guardScope.again.interestCharge > 0,
      `unpaid after first ${guardScope.unpaidAfterFirst}, re-call ${JSON.stringify(guardScope.again)}`);

// ---------------------------------------------------------------- 3
console.log('\n3. The internet deduction is exact — ceil(70/35) = 2 = real postings');

const ded = api(`
  (() => {
    const h = SIM_generateHouse('a3-internet', 0);
    const postings = [];
    for (let day = 1; day <= 140; day++) {
      for (const r of processBillsForDay(h, day)) {
        if (r.billId === 'internet' && r.posted != null) postings.push(day);
      }
    }
    const perPeriod = [postings.filter(d => d <= 70).length, postings.filter(d => d > 70 && d <= 140).length];
    const formula = Math.ceil(CALENDAR.daysPerTaxPeriod / BILL_DEFS.internet.cadenceDays);
    const internetPerCycle = computeBillAmount(BILL_DEFS.internet, h);
    h.world.taxes.quarterGross = 1000;
    const owed = computeTaxOwed(h);
    return { postings, perPeriod, formula, internetPerCycle, deductions: owed.deductions, taxableGross: owed.taxableGross, owed: owed.owed };
  })()
`);
check('internet posts exactly 2 times per 70-day tax period (days 19,54 | 89,124)', JSON.stringify(ded.postings) === '[19,54,89,124]', `got [${ded.postings}]`);
check('per-period posting counts are [2, 2]', JSON.stringify(ded.perPeriod) === '[2,2]', `got [${ded.perPeriod}]`);
check('the ceil formula equals the real posting count: ceil(70/35) = 2', ded.formula === 2 && ded.perPeriod[0] === 2, `formula ${ded.formula}`);
check('the old cadence would over-count: ceil(70/30) = 3 vs 2.33 real, and per-season ceil(35/30) = 2 vs 1.17 (a 71% over-deduction — the bug this phase exists to not ship)',
      Math.ceil(70 / 30) === 3 && Math.ceil(35 / 30) === 2 && Math.ceil(35 / 30) / (35 / 30) > 1.7);
check('computeTaxOwed applies round(93 × 2 × 0.5) = 93 of internet deduction on a solo house', ded.deductions === 93 && ded.internetPerCycle === 93, `deductions ${ded.deductions}, perCycle ${ded.internetPerCycle}`);
check('taxable gross after the deduction: 1000 − 93 = 907', ded.taxableGross === 907, `got ${ded.taxableGross}`);

// ---------------------------------------------------------------- 4
console.log('\n4. D4 interest parity — compounded across three periods vs the old rate over the same days');

// A carried-forward $1000 debt, no income, no reserve: each period adds
// exactly one round(0.015 × balance) charge and no underpayment penalty
// (owed is 0). Three periods = 210 days. Old rate over the same 210 days:
// 1000 × 1.02^(210/90) = $1047.29.
const interest = api(`
  (() => {
    const h = SIM_generateHouse('a3-interest', 0);
    const t = h.world.taxes;
    t.unpaid = 1000; t.reserve = 0;
    const charges = [];
    const billed = [];
    for (const day of [70, 140, 210]) {
      const r = processQuarterlyTaxes(h, day);
      charges.push(r ? r.interestCharge : null);
      billed.push(r ? { period: r.taxPeriod, owed: r.owed, penalty: r.penalty, last: t.lastQuarterBilled } : null);
    }
    return { charges, billed, finalUnpaid: t.unpaid };
  })()
`);
check('interest is charged exactly once per period: 15, 15, 15 (round(1000/1015/1030 × 0.015))', JSON.stringify(interest.charges) === '[15,15,15]', `got [${interest.charges}]`);
check('no underpayment penalty on a debt-only period (the shortfall penalty requires owed > 0)', interest.billed.every(b => b.owed === 0 && b.penalty === 0));
check('lastQuarterBilled walks 0, 1, 0 across the three periods', JSON.stringify(interest.billed.map(b => b.last)) === '[0,1,0]', JSON.stringify(interest.billed.map(b => b.last)));
check('unpaid compounds 1000 → 1015 → 1030 → 1045', interest.finalUnpaid === 1045, `got ${interest.finalUnpaid}`);

const oldCompounded = 1000 * Math.pow(1.02, 210 / 90);
const ratio = interest.finalUnpaid / oldCompounded;
console.log('    recorded: $1045 at 0.015 over 210 days vs $' + oldCompounded.toFixed(2) + ' at 0.02 over 210 days (' + (ratio * 100).toFixed(2) + '%)');
check('compounded total over three periods within 2% of the old rate over the same 210 days (D4 parity)', Math.abs(ratio - 1) <= 0.02, `ratio ${(ratio * 100).toFixed(2)}%`);

// ---------------------------------------------------------------- 5
console.log('\n5. Source greps — no 90-day period or stale deduction math survives');

const stalePhrases = /every 90 days|every 90-days|posts every 30 days|postingsPerQuarter|postingsPerTaxPeriod|last fully-billed quarter/;
const staleHits = [];
for (const f of ['config.js', 'computer.js', 'ui.js', 'sim.js']) {
  srcOf(f).split('\n').forEach((line, i) => {
    if (stalePhrases.test(line.replace(/\/\/.*$/, '').trim())) staleHits.push(`${f}:${i + 1}`);
  });
}
check('no 90-day tax period or old internet-cadence wording survives outside comments', staleHits.length === 0, staleHits.join(', '));

const computerSrc = srcOf('computer.js');
check('the postingsPerPeriod local exists in computeTaxOwed',
      /const postingsPerPeriod = Math\.ceil\(CALENDAR\.daysPerTaxPeriod \/ internetDef\.cadenceDays\)/.test(computerSrc));
check('the persisted key stays lastQuarterBilled (commented as the 0-1 tax-period index, not renamed)',
      /lastQuarterBilled/.test(srcOf('computer.js')) && !/lastTaxPeriodBilled/.test(computerSrc + srcOf('sim.js')));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
