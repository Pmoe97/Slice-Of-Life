// Seasonal Calendar & Sandbox Plan — Phase A1: calendar constants and
// helpers.
//
// The calendar resizes from a 360-day year (4×90-day seasons, aligned 1:1
// with tax quarters) to 140 days: four 35-day seasons of five 7-day weeks,
// with a SEPARATE 70-day tax period (D3). Day 1 becomes a Sunday via a
// getWeekday base shift, NOT a WEEKDAY_NAMES reorder (D2). The old names
// getQuarter / isQuarterEnd / getQuarterDay / daysPerQuarter / monthsPerYear
// / daysPerMonth / monthNames are gone, and formatDate is a Phase-A5 stub.
//
// This phase is pure arithmetic — nothing that displays a date or posts a
// bill has changed yet. The worked-values table below is the acceptance
// test; every row must pass.
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

// ---------------------------------------------------------------- 1
console.log('\n1. The worked-values table (day → weekday, season, season-day, tax period, year)');

// [day, weekday, season, season-day, taxPeriod, year]
const ROWS = [
  [1,  'Sunday',   'spring', 1,  0, 1],
  [2,  'Monday',   'spring', 2,  0, 1],
  [7,  'Saturday', 'spring', 7,  0, 1],
  [8,  'Sunday',   'spring', 8,  0, 1],
  [35, 'Saturday', 'spring', 35, 0, 1],
  [36, 'Sunday',   'summer', 1,  0, 1],
  [70, 'Saturday', 'summer', 35, 0, 1],
  [71, 'Sunday',   'autumn', 1,  1, 1],
  [105,'Saturday', 'autumn', 35, 1, 1],
  [106,'Sunday',   'winter', 1,  1, 1],
  [140,'Saturday', 'winter', 35, 1, 1],
  [141,'Sunday',   'spring', 1,  0, 2],
];

const failures = [];
for (const [day, weekday, season, sday, tp, year] of ROWS) {
  const got = api(`
    (() => {
      const sday = ((${day} - 1) % CALENDAR.daysPerSeason) + 1;
      return { wd: WEEKDAY_NAMES[getWeekday(${day})], season: getSeason(${day}),
               sday, tp: getTaxPeriod(${day}), year: getYear(${day}) };
    })()
  `);
  if (got.wd !== weekday || got.season !== season || got.sday !== sday || got.tp !== tp || got.year !== year) {
    failures.push(`day ${day}: got ${JSON.stringify(got)}, want ${weekday}/${season}/sd${sday}/tp${tp}/y${year}`);
  }
}
check('every row of the worked-values table', failures.length === 0, failures.join('\n        '));

// ---------------------------------------------------------------- 2
console.log('\n2. The Sunday property — why 35 was chosen');

// 35 % 7 === 0, so every season AND every year begins on the same weekday.
const sunDays = [1, 8, 36, 71, 106, 141];
check('seasons and years always start on a Sunday (index 6)',
      sunDays.every(d => api(`getWeekday(${d})`) === 6),
      sunDays.map(d => `day ${d} → ${api(`getWeekday(${d})`)}`).join(', '));
check('getWeekday cycles 7',
      api(`Array.from({length: 7}, (_, i) => getWeekday(i + 1)).join(',')`) === '6,0,1,2,3,4,5');
check('isWeekend is true for exactly 2 of every 7 consecutive days across days 1-300', api(`
  (() => {
    for (let start = 1; start <= 294; start += 7) {
      let c = 0;
      for (let i = 0; i < 7; i++) if (isWeekend(start + i)) c++;
      if (c !== 2) return start;
    }
    return true;
  })()
`) === true);
check('isWeekend(1) is true (day 1 is now a Sunday — the accepted consequence of D2)',
      api('isWeekend(1)') === true);
check('addWorkingDays(1, 5) = 9 (5 working days from a Sunday land on the next Monday)',
      api('addWorkingDays(1, 5)') === 9);
check('addWorkingDays(5, 3) = 10 (a Fri/Sat/Sun span skips the weekend)',
      api('addWorkingDays(5, 3)') === 10);
check('workingDaysBetween(1, 11) = 7 (Sun..Tue spans one full weekend)',
      api('workingDaysBetween(1, 11)') === 7);
check('workingDaysBetween crosses the year boundary (135→145)',
      api('workingDaysBetween(135, 145)') === 8);

// ---------------------------------------------------------------- 3
console.log('\n3. Calendar shape');

check('daysPerYear % daysPerSeason === 0', api('CALENDAR.daysPerYear % CALENDAR.daysPerSeason') === 0);
check('daysPerYear % 7 === 0', api('CALENDAR.daysPerYear % 7') === 0);
check('daysPerTaxPeriod % daysPerSeason === 0', api('CALENDAR.daysPerTaxPeriod % CALENDAR.daysPerSeason') === 0);
check('daysPerTaxPeriod is DELIBERATELY not daysPerSeason (D3)', api('CALENDAR.daysPerTaxPeriod !== CALENDAR.daysPerSeason'));
check('isSeasonEnd fires on 35, 70, 105, 140 and nowhere else in days 1-300', api(`
  (() => {
    for (let d = 1; d <= 300; d++) {
      const want = d % 35 === 0;
      if (isSeasonEnd(d) !== want) return d;
    }
    return true;
  })()
`) === true);
check('isTaxPeriodEnd fires on 70, 140, 210, 280 and nowhere else in days 1-300', api(`
  (() => {
    for (let d = 1; d <= 300; d++) {
      const want = d % 70 === 0;
      if (isTaxPeriodEnd(d) !== want) return d;
    }
    return true;
  })()
`) === true);
check('getSeason(70) === "summer" and getSeason(140) === "winter" (D3\'s user-facing promise)',
      api('getSeason(70)') === 'summer' && api('getSeason(140)') === 'winter');
check('getTaxPeriod returns 0..1, not 0..3', api(`
  (() => { for (let d = 1; d <= 300; d++) { const t = getTaxPeriod(d); if (t !== 0 && t !== 1) return false; } return true; })()
`) === true);

// ---------------------------------------------------------------- 4
console.log('\\n4. formatDate / formatDateShort / ordinalSuffix (Phase A5 real implementation)');

// The A1 harness left these as stub assertions ("Sunday day 1") because A1's
// formatDate was a temporary stub; Phase A5 wrote the real implementation
// and these now pin the real output (D9).
check('day 1 renders "Sunday, 1st of Spring, Year 1"', api('formatDate(1)') === 'Sunday, 1st of Spring, Year 1', api('formatDate(1)'));
check('day 35 renders "Saturday, 35th of Spring, Year 1" (season end)', api('formatDate(35)') === 'Saturday, 35th of Spring, Year 1', api('formatDate(35)'));
check('day 36 renders "Sunday, 1st of Summer, Year 1" (summer begins on a Sunday)', api('formatDate(36)') === 'Sunday, 1st of Summer, Year 1', api('formatDate(36)'));
check('day 70 renders "Saturday, 35th of Summer, Year 1" (tax period end)', api('formatDate(70)') === 'Saturday, 35th of Summer, Year 1', api('formatDate(70)'));
check('day 140 renders "Saturday, 35th of Winter, Year 1"', api('formatDate(140)') === 'Saturday, 35th of Winter, Year 1', api('formatDate(140)'));
check('day 141 renders "Sunday, 1st of Spring, Year 2" (year rollover)', api('formatDate(141)') === 'Sunday, 1st of Spring, Year 2', api('formatDate(141)'));
check('a mid-season day renders with its ordinal: day 120 = "Sunday, 15th of Winter, Year 1"', api('formatDate(120)') === 'Sunday, 15th of Winter, Year 1', api('formatDate(120)'));
check('ordinalSuffix follows the English rules (st/nd/rd/th, 11-13 exception)', api(`[1,2,3,4,11,12,13,21,22,23,31,35].map(n => n + ordinalSuffix(n)).join(',')`) === '1st,2nd,3rd,4th,11th,12th,13th,21st,22nd,23rd,31st,35th');
check('formatDateShort is the compact form: "Sun 1 Spring" / "Sun 15 Winter"', api('formatDateShort(1)') === 'Sun 1 Spring' && api('formatDateShort(120)') === 'Sun 15 Winter', api('formatDateShort(1)') + ' / ' + api('formatDateShort(120)'));

// ---------------------------------------------------------------- 5
console.log('\n5. The old names are gone (grep across src/srcfiles, comments excepted)');

const files = fs.readdirSync(SRCFILES).filter(f => f.endsWith('.js'));
const OLD = /daysPerQuarter|getQuarter|isQuarterEnd|monthNames|daysPerMonth/;
const commentStripped = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '\n');
const hits = [];
for (const f of files) {
  const code = commentStripped(srcOf(f));
  for (const [i, line] of code.split('\n').entries()) {
    if (OLD.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
  }
}
check('zero non-comment hits for daysPerQuarter|getQuarter|isQuarterEnd|monthNames|daysPerMonth',
      hits.length === 0, hits.join('\n        '));
// The deleted CALENDAR fields must not be referenced by CODE anywhere either.
const delHits = [];
for (const f of files) {
  const code = commentStripped(srcOf(f));
  for (const [i, line] of code.split('\n').entries()) {
    if (/CALENDAR\.(monthsPerYear|daysPerMonth|monthNames|daysPerQuarter)/.test(line)) delHits.push(`${f}:${i + 1}`);
  }
}
check('no code references CALENDAR.monthsPerYear|daysPerMonth|monthNames|daysPerQuarter',
      delHits.length === 0, delHits.join(', '));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
