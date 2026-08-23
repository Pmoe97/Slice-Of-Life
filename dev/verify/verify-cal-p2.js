// Seasonal Calendar & Sandbox Plan — Phase A2: bill cadence 30→35 with
// per-day parity.
//
// D5 moves every utility bill to cadenceDays 35 (one posting per season, two
// per tax period — which is what keeps the internet deduction exact). D7
// scales every per-cycle flat amount and base by 7/6 so dollars-per-day is
// unchanged; per-unit meter rates, the seasonal HVAC table, graceDays and
// reconnectionFee do NOT change. D6 keeps initBillState's first-due stagger
// exactly as it was. This harness drives processBillsForDay over days 1-140
// on real generated houses and measures what actually posts.
//
// Two consequences of keeping the D6 stagger as-is contradict the plan's
// literal verification prose, and are asserted here as facts instead:
//   * insurance's first due is day 37 (30 + delay), so within days 1-140 it
//     posts THREE times (37/72/107); its fourth lands on day 142. A
//     window-phase artifact — the per-day rate (29/35 vs old 25/30) is
//     unchanged. The literal "each bill posts exactly 4 times" and the
//     "within 2% of amount×140/30" bound both fail for insurance for this
//     reason, not because of the cadence.
//   * phone's first due is day 35 (28 + delay), so it posts exactly on the
//     season boundary (35/70/105/140). That is the preserved offset, not a
//     tidied stagger — the "no dueDay ≡ 0 (mod 35)" guard cannot apply to
//     phone.
//   * water's base 15→17.5→18 rounds UP a full dollar, a +2.9% per-day bump
//     on a $15 constant (72 vs the 70 anchor over 140 days, $0.014/day). 17
//     would be -2.9%; no whole dollar hits 17.5 within 2%. D7's table is
//     the lock; the harness records the rounding instead of pretending it
//     is not there.
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
console.log('\n0. The D7/D5 table — config matches the locked decisions');

// D7 (the lock): old per-cycle flat amounts + bases, gone from config — the
// plan says compute them inline rather than read them back. NEW is what
// config must say.
const OLD = {
  amounts: { electric: 260, water: 130, gas: 140, internet: 80, phone: 65, insurance: 25 },
  bases:   { electric: 25, water: 15, gas: 12 },
};
const NEW = {
  amounts: { electric: 303, water: 152, gas: 163, internet: 93, phone: 76, insurance: 29 },
  bases:   { electric: 29, water: 18, gas: 14 },
};
const FLAT_BILLS = ['electric', 'water', 'gas', 'internet', 'phone', 'insurance'];

const got = api(`
  (() => {
    const amt = {}; const cad = {}; const grace = {}; const recon = {};
    for (const id of ${JSON.stringify(FLAT_BILLS)}) {
      amt[id] = BILL_DEFS[id].amount; cad[id] = BILL_DEFS[id].cadenceDays;
      grace[id] = BILL_DEFS[id].graceDays; recon[id] = BILL_DEFS[id].reconnectionFee;
    }
    grace.rent = BILL_DEFS.rent.graceDays;
    return { amt, cad, grace, recon,
             base: { electric: UTILITY_BASE.electric, water: UTILITY_BASE.water, gas: UTILITY_BASE.gas },
             rent: BILL_DEFS.rent.cadenceDays,
             meter: UTILITY_METER, hvac: UTILITY_HVAC_SEASONAL,
             thermostat: UTILITY_THERMOSTAT };
  })()
`);

const amountMismatch = [];
for (const id of FLAT_BILLS) if (got.amt[id] !== NEW.amounts[id]) amountMismatch.push(`${id}: ${got.amt[id]} != ${NEW.amounts[id]}`);
check('flat bill amounts match the D7 table (303/152/163/93/76/29)', amountMismatch.length === 0, amountMismatch.join(', '));
const baseMismatch = [];
for (const id of ['electric', 'water', 'gas']) if (got.base[id] !== NEW.bases[id]) baseMismatch.push(`${id}: ${got.base[id]} != ${NEW.bases[id]}`);
check('UTILITY_BASE matches the D7 table (29/18/14)', baseMismatch.length === 0, baseMismatch.join(', '));
const cadMismatch = [];
for (const id of FLAT_BILLS) if (got.cad[id] !== 35) cadMismatch.push(`${id}: ${got.cad[id]}`);
check('all six utility bills are cadenceDays 35 (D5)', cadMismatch.length === 0, cadMismatch.join(', '));
check('rent stays cadenceDays 7', got.rent === 7);
// D7's do-not-touch list: graceDays, reconnectionFee, meter rates, HVAC
// table, thermostat. Hardcoded here on purpose — this is the guard that a
// future "the cycle is longer, bump the grace window too" edit trips.
const graceOk = ['rent', 'electric', 'water', 'gas', 'internet', 'phone', 'insurance']
  .every(id => got.grace[id] === ({ rent: 7, electric: 5, water: 5, gas: 5, internet: 3, phone: 10, insurance: 15 })[id]);
check('graceDays unchanged (rent 7, 5/5/5/3/10/15)', graceOk);
const reconOk = ['electric', 'water', 'gas', 'internet', 'phone', 'insurance']
  .every(id => got.recon[id] === ({ electric: 40, water: 35, gas: 35, internet: 25, phone: 0, insurance: 0 })[id]);
check('reconnectionFee unchanged (40/35/35/25/0/0)', reconOk);
const meterOk = JSON.stringify({
  hvac: { bill: 'electric', rate: 0, unit: 'day', seasonal: true },
  waterHeating: { bill: 'gas', rate: 0.45, unit: 'shower' },
  showers: { bill: 'water', rate: 0.20, unit: 'shower' },
  laundry: { bill: 'water', rate: 0.24, unit: 'load' },
  dishes: { bill: 'water', rate: 0.12, unit: 'session' },
  cooking: { bill: 'gas', rate: 0.36, unit: 'session' },
  devices: { bill: 'electric', rate: 0.04, unit: 'hour' },
}) === JSON.stringify(got.meter);
check('UTILITY_METER per-unit rates unchanged (D7 do-not-touch)', meterOk);
check('UTILITY_HVAC_SEASONAL unchanged [2.2, 6.8, 2.2, 8.5]',
      JSON.stringify(got.hvac) === '[2.2,6.8,2.2,8.5]');
check('UTILITY_THERMOSTAT unchanged at 1.0', got.thermostat === 1.0);

// ---------------------------------------------------------------- 1
console.log('\n1. The D6 schedule — stagger preserved, cadence 35, no collisions');

// Drive the REAL posting path over days 1-140 on a fresh solo house (solo
// keeps even-split amounts at the D7 constants — count = max(1, residents)).
// Also drive a 3-resident house to prove the schedule is resident-independent.
const drive = (seed, residents, days) => api(`
  (() => {
    const h = SIM_generateHouse(${JSON.stringify(seed)}, ${residents});
    const firstDue = {}; const totals = {}; const postingDays = {};
    for (const id of ${JSON.stringify(FLAT_BILLS)}) firstDue[id] = h.world.bills[id].dueDay;
    for (let day = 1; day <= ${days}; day++) {
      for (const r of processBillsForDay(h, day)) {
        if (r.posted == null) continue;
        totals[r.billId] = (totals[r.billId] || 0) + r.posted;
        (postingDays[r.billId] = postingDays[r.billId] || []).push(day);
      }
    }
    return { firstDue, totals, postingDays };
  })()
`);

const delay = api('ECONOMY.opening.firstBillDelay');
const EXPECTED_FIRST_DUE = { internet: 12 + delay, electric: 14 + delay, water: 18 + delay, gas: 22 + delay, phone: 28 + delay, insurance: 30 + delay };

const solo = drive('a2-solo', 0, 140);
const fdMismatch = [];
for (const id of FLAT_BILLS) if (solo.firstDue[id] !== EXPECTED_FIRST_DUE[id]) fdMismatch.push(`${id}: ${solo.firstDue[id]} != ${EXPECTED_FIRST_DUE[id]}`);
check(`first due days keep the D6 offsets exactly (internet ${12 + delay}, electric ${14 + delay}, water ${18 + delay}, gas ${22 + delay}, phone ${28 + delay}, insurance ${30 + delay})`,
      fdMismatch.length === 0, fdMismatch.join(', '));

// Expected posting days = firstDue + k×cadence, everything ≤ 140.
const expectedDays = {};
for (const id of FLAT_BILLS) {
  const d = [];
  for (let day = EXPECTED_FIRST_DUE[id]; day <= 140; day += 35) d.push(day);
  expectedDays[id] = d;
}
const daysMismatch = [];
for (const id of FLAT_BILLS) {
  if (JSON.stringify(solo.postingDays[id]) !== JSON.stringify(expectedDays[id])) {
    daysMismatch.push(`${id}: got [${solo.postingDays[id]}] want [${expectedDays[id]}]`);
  }
}
check('observed posting days match firstDue + k×35 exactly', daysMismatch.length === 0, daysMismatch.join('\n        '));

const countMismatch = [];
for (const id of FLAT_BILLS) {
  if (solo.postingDays[id].length !== expectedDays[id].length) countMismatch.push(`${id}: ${solo.postingDays[id].length} postings`);
}
check('each of the five non-insurance bills posts exactly 4 times in days 1-140 (electric 4, water 4, gas 4, internet 4, phone 4)',
      ['electric', 'water', 'gas', 'internet', 'phone'].every(id => solo.postingDays[id].length === 4),
      countMismatch.join(', '));
// D6's accepted consequence: insurance's fourth posting lands on day 142,
// outside the 140-day window. Assert that explicitly so it is a fact, not
// an oversight.
check('insurance posts 3 times in days 1-140 and its 4th lands on day 142 (the D6 phase, not a missed cadence)',
      solo.postingDays.insurance.join(',') === '37,72,107' &&
      expectedDays.insurance.join(',') === '37,72,107' &&
      EXPECTED_FIRST_DUE.insurance + 3 * 35 === 142);

// No two bills post on the same day — the stagger stays collision-free at
// 35 days (it was collision-free at 30 too; see D6).
const allDays = [].concat(...Object.values(solo.postingDays));
const collision = allDays.find((d, i) => allDays.indexOf(d) !== i);
check('never more than one bill posts on a single day', collision === undefined, collision ? `day ${collision} posted twice` : '');

const trio = drive('a2-trio', 3, 140);
check('posting schedule is resident-independent (3-resident house posts the same days)',
      JSON.stringify(trio.postingDays) === JSON.stringify(solo.postingDays));

// ---------------------------------------------------------------- 2
console.log('\n2. Parity — the point of the phase');

// Identity: what posted over 140 days is exactly (postings) × (per-cycle
// constant). On a solo house the metered bills post their base (meters are
// zero), internet/phone/insurance post their flat amount.
const perCycle = {};
for (const id of FLAT_BILLS) {
  perCycle[id] = ['electric', 'water', 'gas'].includes(id) ? NEW.bases[id] : NEW.amounts[id];
}
const idMismatch = [];
for (const id of FLAT_BILLS) {
  const expectedTotal = solo.postingDays[id].length * perCycle[id];
  if (solo.totals[id] !== expectedTotal) idMismatch.push(`${id}: $${solo.totals[id]} != ${solo.postingDays[id].length}×$${perCycle[id]}=$${expectedTotal}`);
}
check('posted dollars over days 1-140 equal postings × per-cycle constant for every bill',
      idMismatch.length === 0, idMismatch.join(', '));

// The plan's literal parity bound: total within 2% of (old per-cycle) ×
// 140/30. The old per-cycle value is the FLAT amount for the non-metered
// bills and the BASE for the metered ones (that is what a generated house
// posts). Four of six meet it; water (rounding: 17.5→18) and insurance
// (D6 phase) are the documented exceptions — the per-day rates are the
// invariant, checked next.
const anchor = (oldVal) => oldVal * 140 / 30;
const anchorReport = [];
for (const id of FLAT_BILLS) {
  const oldVal = ['electric', 'water', 'gas'].includes(id) ? OLD.bases[id] : OLD.amounts[id];
  const a = anchor(oldVal);
  const ratio = solo.totals[id] / a;
  anchorReport.push(`${id}: $${solo.totals[id]} vs $${a.toFixed(2)} (${(ratio * 100).toFixed(1)}%)`);
}
console.log('    recorded totals vs old-constant equivalent (the parity proof):');
for (const line of anchorReport) console.log('      ' + line);
const literalOk = ['electric', 'gas', 'internet', 'phone'].every(id => {
  const oldVal = ['electric', 'gas'].includes(id) ? OLD.bases[id] : OLD.amounts[id];
  return Math.abs(solo.totals[id] - anchor(oldVal)) <= 0.02 * anchor(oldVal);
});
check('electric, gas, internet, phone each meet the 2%-of-anchor bound over days 1-140',
      literalOk, 'electric 116/116.67, gas 56/56, internet 372/373.33, phone 304/303.33');

// Per-day steady-state rate parity — the D7 invariant, immune to window
// phase and the real definition of "not a difficulty change". Tolerance is
// the whole-dollar rounding of a constant (the water case), documented
// above; every non-rounded rate is well inside 1%.
const rateReport = [];
for (const id of FLAT_BILLS) {
  const oldVal = ['electric', 'water', 'gas'].includes(id) ? OLD.bases[id] : OLD.amounts[id];
  const rateOld = oldVal / 30;
  const rateNew = perCycle[id] / 35;
  const ratio = rateNew / rateOld;
  rateReport.push(`${id}: ${perCycle[id]}/35 = $${rateNew.toFixed(4)} vs ${oldVal}/30 = $${rateOld.toFixed(4)} (${(ratio * 100).toFixed(2)}%)`);
}
console.log('    per-day rates, new vs old (D7 parity):');
for (const line of rateReport) console.log('      ' + line);
check('five of six per-day rates are within 2% of their old value (water: 17.5→18 rounding, +2.9%, documented above)',
      FLAT_BILLS.every(id => {
        const oldVal = ['electric', 'water', 'gas'].includes(id) ? OLD.bases[id] : OLD.amounts[id];
        const ratio = (perCycle[id] / 35) / (oldVal / 30);
        return id === 'water' ? ratio < 1.03 : Math.abs(ratio - 1) <= 0.02;
      }));

// Insurance, measured across the D6 stagger's full cycle: four postings of
// $29 = $116 over days 1-142, against 25×142/30 = $118.33 → 98%.
const solo142 = drive('a2-solo-142', 0, 142);
check('insurance over days 1-142 (its full cycle per the D6 offsets): 4×$29 = $116, within 2% of $118.33',
      solo142.postingDays.insurance.length === 4 && solo142.totals.insurance === 116 &&
      Math.abs(116 - 25 * 142 / 30) <= 0.02 * 25 * 142 / 30);

// The D7 ratio itself: new constant is old × 7/6, rounded to the nearest
// whole dollar. (This is what pins the fallback amounts 303/152/163, which
// never post on a metered house but must still scale per D7.)
const ratioMismatch = [];
for (const id of FLAT_BILLS) {
  const expected = Math.round(OLD.amounts[id] * 7 / 6);
  if (NEW.amounts[id] !== expected) ratioMismatch.push(`${id}: ${NEW.amounts[id]} != round(${OLD.amounts[id]}×7/6)=${expected}`);
}
for (const id of ['electric', 'water', 'gas']) {
  const expected = Math.round(OLD.bases[id] * 7 / 6);
  if (NEW.bases[id] !== expected) ratioMismatch.push(`base ${id}: ${NEW.bases[id]} != round(${OLD.bases[id]}×7/6)=${expected}`);
}
check('every D7 constant equals round(old × 7/6) (the parity scaling, exactly as locked)',
      ratioMismatch.length === 0, ratioMismatch.join(', '));

// ---------------------------------------------------------------- 3
console.log('\n3. HVAC is untouched — per-day utility pressure did not move');

const hvac = api(`
  (() => {
    const h = SIM_generateHouse('a2-hvac', 0);
    for (let day = 1; day <= 140; day++) accrueHvacForDay(h, day);
    return { count: h.world.utilities.hvac.count, daysAccrued: h.world.utilities.hvac.daysAccrued,
             electric: computeBillAmount(BILL_DEFS.electric, h) };
  })()
`);
// 140 days = 35 each of spring(2.2) summer(6.8) autumn(2.2) winter(8.5).
const expectedHvac = 35 * (2.2 + 6.8 + 2.2 + 8.5);
check(`accrueHvacForDay over days 1-140 totals 35×(2.2+6.8+2.2+8.5) = ${expectedHvac}`, Math.abs(hvac.count - expectedHvac) < 1e-9, `got ${hvac.count}`);
check('hvac daysAccrued === 140', hvac.daysAccrued === 140);
check('electric on a fresh house posts its scaled base ($29) — the D7 base reaches the posting path',
      hvac.electric === 29, `got ${hvac.electric}`);

// ---------------------------------------------------------------- 4
console.log('\n4. The boundary guard — nobody tidied the stagger onto day 35');

// The literal "no dueDay ≡ 0 (mod 35)" guard cannot hold for phone: its
// preserved offset is 28+delay = 35. Assert the guard as it is meant —
// phone is the ONLY boundary poster, and only because the D6 offset puts
// it there; every other bill's postings avoid the season boundary.
const boundaryOffenders = FLAT_BILLS.filter(id => solo.postingDays[id].some(d => d % 35 === 0));
check('phone is the only bill posting on a season boundary (35/70/105/140 — its preserved offset, not a tidy)',
      JSON.stringify(boundaryOffenders) === '["phone"]' &&
      JSON.stringify(solo.postingDays.phone) === '[35,70,105,140]',
      boundaryOffenders.join(', '));
check('no first due was moved onto a season boundary except phone\'s preserved 35',
      FLAT_BILLS.every(id => id === 'phone' || EXPECTED_FIRST_DUE[id] % 35 !== 0));

// ---------------------------------------------------------------- 5
console.log('\n5. Source greps — no 30-day cadence or old constant survives');

const configSrc = srcOf('config.js');
check('no "cadenceDays: 30" remains in BILL_DEFS (config.js)',
      !/id: '(electric|water|gas|internet|phone|insurance)'[\s\S]{0,200}?cadenceDays: 30/.test(configSrc));
const oldValGrep = /amount: (260|130|140|80|65|25)|electric: 25|water: 15|gas: 12/;
const hits = [];
configSrc.split('\n').forEach((line, i) => {
  const stripped = line.replace(/\/\/.*$/, '').trim();
  if (oldValGrep.test(stripped)) hits.push(`config.js:${i + 1}`);
});
check('no old D7 amount/base literal survives outside comments in config.js', hits.length === 0, hits.join(', '));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
