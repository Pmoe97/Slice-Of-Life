// Vocation & Lifestyle Expansion — Phase 1: the offsite predicate.
//
// Phase 1 is a PURE REFACTOR. Nine sites across six files each asked "is this
// NPC out of the flat" with their own `block === 'work' || ...` string
// comparison; they now all call `npcIsOffsite`. Because every occupation is
// still `on_site` at this phase, the predicate must return exactly what those
// comparisons returned, and the game must behave identically.
//
// The acceptance test is therefore an EQUIVALENCE test, not a feature test:
// simulate a week against a fixed seed and assert the per-tick
// {location, activity, block} stream is unchanged. This file pins the
// predicate's truth table and the source-level invariant; the byte-identical
// stream check lives in verify-voc-p1-equiv.js, which needs a baseline.
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
console.log('\n1. npcIsOffsite exists and is the predicate');

check('npcIsOffsite is defined', api('typeof npcIsOffsite') === 'function');
check('isOfficeDay is defined', api('typeof isOfficeDay') === 'function');
check('isGigDay is defined', api('typeof isGigDay') === 'function');
check('VOCATION_TUNING is defined', api('typeof VOCATION_TUNING') === 'object');
check('resolveHomeWorkPlacement is defined', api('typeof resolveHomeWorkPlacement') === 'function');
check('HOME_WORK_ACTIVITIES is defined', api('typeof HOME_WORK_ACTIVITIES') === 'object');

// ---------------------------------------------------------------- 2
console.log('\n2. The truth table');

// [workMode, block, expected]  — clock day 3 is a Wednesday (getWeekday=2).
const ROWS = [
  // Non-work blocks are NEVER offsite, whatever the mode.
  ['on_site',       'leisure',      false],
  ['on_site',       'sleep',        false],
  ['remote',        'evening',      false],
  ['none',          'midday',       false],
  // on_site is the pre-plan behavior: every work-boundary block is offsite.
  ['on_site',       'work',         true],
  ['on_site',       'commute',      true],
  ['on_site',       'commute_home', true],
  // An absent workMode must behave as on_site — this is what makes the
  // refactor a no-op and what keeps un-migrated saves correct.
  [undefined,       'work',         true],
  [undefined,       'commute',      true],
  // remote / none never leave.
  ['remote',        'work',         false],
  ['remote',        'commute',      false],
  ['none',          'work',         false],
];

for (const [mode, block, expected] of ROWS) {
  const got = api(`
    (() => {
      const npc = { bible: { occupation: ${mode === undefined ? '{}' : `{ workMode: '${mode}' }`} } };
      return npcIsOffsite(npc, '${block}', { day: 3, minutes: 600 }, 'npc_x');
    })()
  `);
  check(`workMode=${mode ?? '(absent)'} block=${block} → ${expected}`, got === expected, `got ${got}`);
}

// ---------------------------------------------------------------- 3
console.log('\n3. Hybrid reads officeDays (D4); an empty set means fully on-site');

// getWeekday(day) = (day + 5) % 7, 0=Mon..6=Sun. day 3 → 1 (Tuesday).
check('getWeekday(3) === 1 (Tuesday)', api('getWeekday(3)') === 1);

const hybrid = (days, day) => api(`
  (() => {
    const npc = { bible: { occupation: { workMode: 'hybrid', officeDays: ${JSON.stringify(days)} } } };
    return npcIsOffsite(npc, 'work', { day: ${day}, minutes: 600 }, 'npc_x');
  })()
`);
check('hybrid, officeDays [1,3], Tuesday(1) → offsite', hybrid([1, 3], 3) === true);
check('hybrid, officeDays [0,2], Tuesday(1) → home',    hybrid([0, 2], 3) === false);
check('hybrid, officeDays [] → on-site (un-rolled/legacy)', hybrid([], 3) === true);

// ---------------------------------------------------------------- 4
console.log('\n4. Gig days are deterministic and weekday-only (D2)');

const gig = (who, day) => api(`
  (() => {
    const npc = { bible: { occupation: { workMode: 'self_employed' } } };
    return npcIsOffsite(npc, 'work', { day: ${day}, minutes: 600 }, '${who}');
  })()
`);
check('same npc + same day → same answer twice', gig('npc_a', 4) === gig('npc_a', 4));
// day 1 is a Sunday (getWeekday(1) === 6), day 7 is a Saturday (index 5).
check('weekend day is never a gig day (Sun)', gig('npc_a', 1) === false);
check('weekend day is never a gig day (Sat)', gig('npc_a', 7) === false);

// Rate sanity: over many weekday draws the gig rate should sit near the tuned
// chance. Not a tight assertion — a smoke test that it is neither 0 nor 1.
let gigs = 0, tries = 0;
for (let d = 2; d < 400; d++) {
  const wd = api(`getWeekday(${d})`);
  if (wd >= 5) continue;
  tries++;
  if (gig('npc_rate', d)) gigs++;
}
const rate = gigs / tries;
const tuned = api('VOCATION_TUNING.selfEmployedGigDayChance');
check(`gig rate ${rate.toFixed(3)} is in a sane band around tuned ${tuned}`,
  rate > tuned * 0.5 && rate < tuned * 1.6, `${gigs}/${tries}`);

// ---------------------------------------------------------------- 5
console.log('\n5. Design invariant 2 — no site tests the work block name inline');

// The whole point of Phase 1: `npcIsOffsite` is the only place the question is
// answered. A tenth caller that re-derives it with a string comparison is the
// bug this scan prevents. Scans for the specific shape the nine sites used.
// Counts LINES of real code (comments stripped — this plan's own comments
// quote the old shape when explaining why it went away, and a `||` chain
// produces several matches on one line).
const OFFSITE_PATTERN = /block\s*===\s*'(work|commute|commute_home)'/;
const FILES = ['sim.js', 'cognition.js', 'interruption.js', 'movement.js', 'npc.js'];

// The survivors are all legitimate, and each is pinned so that a NEW one
// shows up as a diff rather than as silence:
//  - sim.js x3, cognition.js x1 (deriveHeldRecord), interruption.js x1: the
//    cheap block-name TRIGGER before asking the predicate. A non-work block
//    is never offsite, so testing it first is correct and the predicate
//    re-checks it anyway.
//  - sim.js x1 more (Phase 3): the at-home shift's opener triggers on the
//    work block alone, because openHomeWorkCommitment asks the predicate
//    itself and returns null for anyone who is actually out.
//  - cognition.js x1: resolved.block === 'commute' in the finishing-soon
//    check, which is a genuine question about the block name and not about
//    whether the NPC is out of the flat.
//
// Code-review fix (deriveHeldRecord): the SECOND cognition.js hit — the
// `if (sched.block === 'work' || sched.block === 'commute' || ...)` branch
// that used to re-derive a fresh home-work placement for ANY held commitment
// during a work block — is gone. It was wrong the moment content_session/
// content_collab could hold a commitment during that block: their real
// anchor/activity got discarded every non-decision tick in favour of a
// randomly re-rolled one. The generic fallback a few lines below (which
// reads the commitment's own anchor/activity) already handled this
// correctly and now simply isn't intercepted before it's reached.
const EXPECTED_INLINE = { 'sim.js': 4, 'cognition.js': 1, 'interruption.js': 1, 'movement.js': 0, 'npc.js': 0 };

// The `\r` strip is load-bearing on this repo: the files are CRLF, and JS's
// `.` does not match `\r`, so `^\s*\/\/.*$` silently fails to match a
// comment line and every explanatory comment counts as a call site.
const stripComments = (src) => src
  .split('\n')
  .map(l => l.replace(/\r$/, ''))
  .map(l => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

for (const f of FILES) {
  const lines = stripComments(srcOf(f)).split('\n');
  const hits = lines.filter(l => OFFSITE_PATTERN.test(l)).length;
  check(`${f}: ${hits} inline block-name tests (expected ${EXPECTED_INLINE[f]})`,
    hits === EXPECTED_INLINE[f],
    `if this changed, a site was added or removed — confirm it calls npcIsOffsite`);
}

// Every file that answers the question must reference the predicate.
for (const f of ['sim.js', 'cognition.js', 'interruption.js', 'npc.js']) {
  check(`${f} calls npcIsOffsite`, srcOf(f).includes('npcIsOffsite('));
}

// ---------------------------------------------------------------- 6
console.log('\n6. openWorkCommitment carries the D15 guard');

const cog = srcOf('cognition.js');
const openIdx = cog.indexOf('function openWorkCommitment');
const guardIdx = cog.indexOf('npcIsOffsite', openIdx);
const walkIdx = cog.indexOf('planWalk', openIdx);
check('the guard is inside openWorkCommitment', openIdx > 0 && guardIdx > openIdx);
check('the guard precedes planWalk (top-of-function, before the walk exists)',
  guardIdx > 0 && walkIdx > 0 && guardIdx < walkIdx,
  `guard@${guardIdx} walk@${walkIdx}`);

// ---------------------------------------------------------------- 7
console.log('\n7. D13 — the interruption path has BOTH gates handled');

const intr = srcOf('interruption.js');
check('eligibility uses npcIsOffsite', intr.includes('if (npcIsOffsite(npc, block'));
check('scheduleMultiplier.work is still 0 (unchanged for real absence)',
  api('INTERRUPTION.scheduleMultiplier.work') === 0);
check('workingFromHomeMultiplier exists and is > 0',
  api('typeof INTERRUPTION.workingFromHomeMultiplier') === 'number'
  && api('INTERRUPTION.workingFromHomeMultiplier') > 0);
check('the probability path substitutes it for at-home workers',
  intr.includes('atHomeWorking') && intr.includes('workingFromHomeMultiplier'));

// ---------------------------------------------------------------- 8
console.log('\n8. Phase 1 leaves every occupation on_site (the equivalence premise)');

// Phase 1 shipped with every occupation still `on_site`, which is what made
// the refactor provably a no-op. Phase 2 then gave the pool real work modes —
// so this is a PHASE MARKER, not a regression check. It reports which phase
// the tree is at and asserts the right thing for that phase, because a file
// that starts failing the moment the next phase lands teaches people to
// ignore it.
const modes = api(`OCCUPATION_POOL.map(o => o.workMode || 'on_site')`);
const present = [...new Set(modes)].sort();
const nonOnSite = modes.filter(m => m !== 'on_site');

if (nonOnSite.length === 0) {
  check(`Phase 1 tree: all ${modes.length} pool entries are on_site (equivalence is exact)`, true);
} else {
  check(`Phase 2+ tree: pool carries real work modes [${present.join(', ')}] — equivalence is no longer expected`,
    true);
  // What Phase 1 built must still hold, whatever the pool says.
  check('every workMode in the pool is one the predicate handles',
    present.every(m => ['on_site', 'hybrid', 'remote', 'self_employed', 'none'].includes(m)),
    present.join(', '));
  check('an on_site NPC is still offsite during work (the pre-plan path is intact)',
    api(`npcIsOffsite({ bible: { occupation: { workMode: 'on_site' } } }, 'work', { day: 3 }, 'x')`) === true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
