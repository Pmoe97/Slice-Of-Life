// continuous-cadence-closure-plan.md — Phase 2: SCHEDULES fallback:
// continuous-minute reindex (D3).
//
//   node src/src/dev/verify/verify-ccc-p2.js
//
// Behavior-invisible by construction (design invariant 1): resolveScheduleActivity's
// no-commitment fallback used to collapse clock.minutes through getTickIndex
// before comparing it against SCHEDULES' tick-index ranges; it now compares
// clock.minutes directly against SCHEDULES' own minute-of-day ranges (config.js).
// Every boundary in every template is still a multiple of CLOCK.tickMinutes,
// so the OLD getTickIndex-keyed lookup and the NEW minute-keyed lookup must
// pick the identical block at every minute of the day — this harness proves
// that by re-deriving the old lookup independently (its own local copy of the
// pre-Phase-2 algorithm, not a call into the live code) and diffing it against
// resolveScheduleActivity's real, live answer across every template, both day
// types, and all 1440 minutes of a day. Also covers nextScheduleBoundary and
// workBlockEndAbs (cognition.js) — the plan's own two undocumented mirrors of
// the same SCHEDULES lookup, found by reading the live code (not the plan's
// Files list, which only named sim.js/config.js) and brought along in the same
// phase since leaving them tick-keyed while SCHEDULES itself moved to minutes
// would have silently broken them, not just left them unconverted.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'cognition.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // The pre-Phase-2 algorithm, reimplemented locally (not a call into the
  // live resolveScheduleActivity) so this harness has an independent oracle
  // to diff the live, converted code against. Deliberately ignores
  // commitments/sleepRhythm/partner-visit binding — those branches are
  // untouched by this phase (they never read SCHEDULES ranges) and are
  // exercised by their own harnesses elsewhere (verify-c5.js, verify-voc-p9.js).
  __oldTickLookup = (templateName, dayType, minutes) => {
    const template = SCHEDULES[templateName] || SCHEDULES.standard;
    const sched = template[dayType] || template.weekday;
    const tick = Math.floor(minutes / CLOCK.tickMinutes);
    let block = 'leisure';
    for (const [blockName, ranges] of Object.entries(sched)) {
      for (const [start, end] of ranges) {
        // ranges are minute-of-day post-Phase-2; the pre-Phase-2 oracle
        // reconstructs the tick-index bounds it would have checked by
        // dividing back out — exact, since every boundary here is already
        // a multiple of CLOCK.tickMinutes.
        const tStart = start / CLOCK.tickMinutes, tEnd = end / CLOCK.tickMinutes;
        if (tick >= tStart && tick < tEnd) { block = blockName; break; }
      }
    }
    return block;
  };
  __newLookup = (templateName, dayType, minutes) => {
    const npc = { bible: { scheduleTemplate: templateName } };
    // getWeekday(day) = (day+5)%7, isWeekend = getWeekday>=5 — day 1 is a
    // weekend day, day 2 a weekday (matches the convention verify-present-p3
    // and others already document: "day 3 is a Tuesday").
    const clock = { day: dayType === 'weekend' ? 1 : 2, minutes };
    return resolveScheduleActivity(npc, clock, null, null).block;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration');
const reg = J(`({
  resolveScheduleActivity: typeof resolveScheduleActivity === 'function',
  nextScheduleBoundary: typeof nextScheduleBoundary === 'function',
  workBlockEndAbs: typeof workBlockEndAbs === 'function',
  templates: Object.keys(SCHEDULES),
})`);
check('all three schedule readers are real functions', reg.resolveScheduleActivity && reg.nextScheduleBoundary && reg.workBlockEndAbs, JSON.stringify(reg));

// ---------------------------------------------------------------- 1
console.log('\n1. Every template × day type × every minute of the day resolves the IDENTICAL block, old lookup vs. new (D3, invariant 1)');
for (const templateName of reg.templates) {
  for (const dayType of ['weekday', 'weekend']) {
    const mismatches = J(`(() => {
      const bad = [];
      for (let m = 0; m < 1440; m++) {
        const oldB = __oldTickLookup('${templateName}', '${dayType}', m);
        const newB = __newLookup('${templateName}', '${dayType}', m);
        if (oldB !== newB) bad.push({ m, oldB, newB });
      }
      return bad;
    })()`);
    check(`${templateName}.${dayType}: 1440/1440 minutes match`, mismatches.length === 0,
      `first mismatch(es): ${JSON.stringify(mismatches.slice(0, 3))}`);
  }
}

// ---------------------------------------------------------------- 2
console.log('\n2. nextScheduleBoundary — boundaryAbs lands on the real next range start, in real minutes (not *CLOCK.tickMinutes double-scaled)');
const nb = J(`(() => {
  // standard.weekday: sleep [0,450) morning [480,600) ... — probe from
  // inside sleep, expect the boundary to be morning's start, 480, same day.
  const r = nextScheduleBoundary({ bible: { scheduleTemplate: 'standard' } }, { day: 2, minutes: 100 });
  return { block: r.block, boundaryAbs: r.boundaryAbs, expectedAbs: 2 * 1440 + 480 };
})()`);
check('the next boundary after 01:40 in standard.weekday is morning at 08:00, absolute-minute correct', nb.block === 'morning' && nb.boundaryAbs === nb.expectedAbs, JSON.stringify(nb));

const nbWrap = J(`(() => {
  // Deep in wind_down with nothing left today ([1260,1410) is the last
  // range) must wrap to tomorrow's sleep, not return a same-day nonsense
  // boundary.
  const r = nextScheduleBoundary({ bible: { scheduleTemplate: 'standard' } }, { day: 2, minutes: 1400 });
  return { block: r.block, boundaryAbs: r.boundaryAbs, expectedAbs: 3 * 1440 };
})()`);
check('past the last range of the day, nextScheduleBoundary wraps to tomorrow\'s sleep', nbWrap.block === 'sleep' && nbWrap.boundaryAbs === nbWrap.expectedAbs, JSON.stringify(nbWrap));

// ---------------------------------------------------------------- 3
console.log('\n3. workBlockEndAbs — absolute minute the work block ends, no double-scaling, midnight-end sentinel intact');
const we = J(`(() => {
  // day_shift.weekday: work [600,1020) — ends 17:00.
  const r = workBlockEndAbs({ bible: { scheduleTemplate: 'day_shift' } }, { day: 4, minutes: 0 });
  return { got: r, expected: 4 * 1440 + 1020 };
})()`);
check('day_shift work block end resolves to the real absolute minute (17:00 day 4)', we.got === we.expected, JSON.stringify(we));

const weMidnight = J(`(() => {
  // night_shift.weekday: work [0,420) — a work block that GENUINELY ends at
  // minute-of-day 0 is impossible here (420 !== 0), but the found-flag
  // sentinel fix is about a template with NO work block at all returning
  // null, not 0 — standard has no work block (D21).
  const none = workBlockEndAbs({ bible: { scheduleTemplate: 'standard' } }, { day: 1, minutes: 0 });
  return { none };
})()`);
check('a template with no work block returns null, not a falsy-zero absolute minute', weMidnight.none === null, JSON.stringify(weMidnight));

// ---------------------------------------------------------------- 4
console.log('\n4. getTickIndex is no longer on resolveScheduleActivity\'s / nextScheduleBoundary\'s hot path (source-level check)');
const fs = require('fs');
const simSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'sim.js'), 'utf8');
const cogSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'cognition.js'), 'utf8');
function bodyOf(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`);
  if (start < 0) return null;
  let depth = 0, i = src.indexOf('{', start), end = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(start, end + 1);
}
const rsaBody = bodyOf(simSrc, 'resolveScheduleActivity');
const nsbBody = bodyOf(cogSrc, 'nextScheduleBoundary');
// getTickIndex( (a real call, open-paren) not the bare word — both functions'
// own explanatory comments about the reindex legitimately mention the name.
check('resolveScheduleActivity no longer calls getTickIndex', !!rsaBody && !rsaBody.includes('getTickIndex('), rsaBody ? 'still present' : 'function not found');
check('nextScheduleBoundary no longer calls getTickIndex', !!nsbBody && !nsbBody.includes('getTickIndex('), nsbBody ? 'still present' : 'function not found');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
