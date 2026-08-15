// Continuous behavior engine, Phase 2 — event-driven decision scheduling.
//
//   node dev/verify/verify-c5.js
//
// D3 replaces the flat scan. Today resolveTick resolves every active NPC
// every 30-minute tick; under event-driven cadence an NPC's next decision
// is due at a single absolute minute — npc.commitment.completesAtAbs — and
// a committed NPC is not re-resolved until that time arrives, never on an
// unrelated NPC's boundary.
//
// The instrumentation is a call count on evaluateDrives — the decision
// entry point — traced per NPC per tick through the REAL resolveBatch.
// Under the flat scan every resident called it every tick; under
// event-driven scheduling a mid-hold NPC must not call it at all. That is
// the whole of the phase: the check is cheap, exact, and impossible to pass
// with the flat loop still in the code path.
//
// Section order:
//   1. the queue predicates (nextDecisionAbs / dueForDecision /
//      deriveHeldRecord) are pure and do what the Data model says;
//   2. the plan's own worked example — a SYNTHETIC house with forced,
//      staggered commitment lengths — resolves each NPC once per
//      completion and never on an unrelated NPC's boundary;
//   3. the same mid-hold-zero-calls property at population scale
//      (6 houses x 7 days), plus "commitments actually hold" so the
//      property is measuring something;
//   4. determinism (C6/D7): same seed, same commitment sequence, byte for
//      byte; and the tick stays model-free.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js', 'sim.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const HOUSES = 6, TICKS = 336, DAY = 48;

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __res = (block, location) => ({ block, location, activity: '', transit: null });

  // The commitment shape openCommitment builds, constructed directly so the
  // harness can force ARBITRARY staggered completions (openCommitment would
  // derive the length from the drive's authored holdMinutes). Mid-hold,
  // evaluateDrives is never called, so none of the fields a re-score would
  // read (score, shouted) are consulted; activity/anchor are what the
  // derived record replays.
  __forceCommit = (g, id, mins, anchorRoom) => {
    const nowAbs = clockToAbsolute(g.meta.clock);
    g.npcs[id].commitment = {
      id: 'do_laundry', kind: 'drive',
      startedAtAbs: nowAbs,
      completesAtAbs: nowAbs + mins,
      anchor: { roomId: anchorRoom || 'living_room', objId: null, point: null },
      arrived: true, activity: 'doing X', score: 0.5, shouted: [],
    };
  };

  // A clock minute whose schedule block is NOT sleep/work/commute for this
  // NPC. The deriveHeldRecord pins tests force a commitment and then read
  // the derived record; on a sleep or work block the record is BY DESIGN the
  // sleep/off-screen one (that is what lets ageCommitment release), so the
  // pins assertions need a neutral minute to be about pinning at all.
  __neutralMinute = (g, id) => {
    for (let m = 0; m < 1440; m += 30) {
      const b = resolveScheduleActivity(g.npcs[id], { day: 1, minutes: m, phase: '' }, g, id).block;
      if (b !== 'sleep' && b !== 'work' && b !== 'commute' && b !== 'commute_home') return m;
    }
    return -1;
  };
`);

// ---------------------------------------------------------------------------
console.log('\n(D3) the queue predicates');
check('nextDecisionAbs is the commitment\'s completion while held', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const nowAbs = clockToAbsolute(g.meta.clock);
    __forceCommit(g, id, 90, null);
    return nextDecisionAbs(g.npcs[id], g) === nowAbs + 90;
  })()
`));
check('and "now" when nothing is held (the Data model fallback)', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    return nextDecisionAbs(g.npcs[id], g) === clockToAbsolute(g.meta.clock);
  })()
`));
check('dueForDecision excludes a mid-hold NPC and includes a freed one', api(`
  (() => {
    const g = __mk();
    const ids = __ids(g);
    __forceCommit(g, ids[0], 120, null);
    const heldOut = !dueForDecision(g, ids).includes(ids[0]);
    g.npcs[ids[0]].commitment.completesAtAbs = clockToAbsolute(g.meta.clock);   // complete NOW
    const heldIn = dueForDecision(g, ids).includes(ids[0]);
    return heldOut && heldIn;
  })()
`));
check('deriveHeldRecord returns null for an NPC with no commitment', api(`
  (() => { const g = __mk(); return deriveHeldRecord(__ids(g)[0], g.npcs[__ids(g)[0]], g, false) === null; })()
`));
check('deriveHeldRecord pins location and activity to the commitment', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const m = __neutralMinute(g, id);
    if (m < 0) return false;
    g.meta.clock = { ...g.meta.clock, minutes: m };
    __forceCommit(g, id, 120, 'living_room');
    const r = deriveHeldRecord(id, g.npcs[id], g, false);
    return r.location === 'living_room' && r.activity === 'doing X' && r.transit === null;
  })()
`));
check('deriveHeldRecord falls back to the stored location when the anchor has no room', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const m = __neutralMinute(g, id);
    if (m < 0) return false;
    g.meta.clock = { ...g.meta.clock, minutes: m };
    g.npcs[id].location = 'kitchen';
    __forceCommit(g, id, 120, null);
    g.npcs[id].commitment.anchor.roomId = null;
    const r = deriveHeldRecord(id, g.npcs[id], g, false);
    return r.location === 'kitchen';
  })()
`));
check('deriveHeldRecord reads a sleep block as sleeping in bed, so ageCommitment releases it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    for (let m = 0; m < 1440; m += 30) {
      const probe = { day: 1, minutes: m, phase: '' };
      const b = resolveScheduleActivity(g.npcs[id], probe, g, id).block;
      if (b !== 'sleep') continue;
      g.meta.clock = { ...g.meta.clock, minutes: m };
      __forceCommit(g, id, 120, null);
      const r = deriveHeldRecord(id, g.npcs[id], g, false);
      const releases = r.block === 'sleep' && r.activity === 'sleeping' &&
                       r.location === g.npcs[id].residency.room &&
                       clockToAbsolute(g.meta.clock) < g.npcs[id].commitment.completesAtAbs &&
                       ageCommitment(g, id, r) === null;
      return releases;
    }
    return false;   // no sleep window found — the cast would have to be awake around the clock
  })()
`));
check('deriveHeldRecord reads a work block as off-screen, so ageCommitment releases it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    for (let m = 0; m < 1440; m += 30) {
      const probe = { day: 1, minutes: m, phase: '' };
      const b = resolveScheduleActivity(g.npcs[id], probe, g, id).block;
      if (b !== 'work') continue;
      g.meta.clock = { ...g.meta.clock, minutes: m };
      __forceCommit(g, id, 120, 'living_room');
      const r = deriveHeldRecord(id, g.npcs[id], g, false);
      const releases = r.location === null && ageCommitment(g, id, r) === null;
      return releases;
    }
    return false;   // no work block found — a template with no job
  })()
`));
check('the queue section writes nothing (no new npc.commitment writers)', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    __forceCommit(g, id, 120, 'living_room');
    const before = JSON.stringify(g);
    const ids = __ids(g);
    dueForDecision(g, ids);
    deriveHeldRecord(id, g.npcs[id], g, false);
    nextDecisionAbs(g.npcs[id], g);
    return JSON.stringify(g) === before;
  })()
`), 'the scorer\'s purity invariant is the whole file\'s; the queue inherits it');

// ---------------------------------------------------------------------------
console.log('\nthe plan\'s worked example: a synthetic house, staggered commitment lengths');
// The three forced commitments complete at +1, +3 and +5 ticks. The window
// is chosen so none of the three residents crosses a sleep/work/commute
// block for the whole run — those are the DESIGNED releases (ageCommitment
// drops a commitment for sleep or the off-screen work convention), and the
// test is about completion-driven decisions, not about those.
const window = JSON.parse(api(`
  (() => {
    for (let start = 0; start < 40; start++) {
      const g = __mk(555000 + start);
      const ids = __ids(g);
      let good = true;
      for (let t = start; t < start + 8; t++) {
        const probe = { day: 1, minutes: t * 30, phase: '' };
        for (const id of ids) {
          const b = resolveScheduleActivity(g.npcs[id], probe, g, id).block;
          if (b === 'sleep' || b === 'work' || b === 'commute' || b === 'commute_home') { good = false; break; }
        }
        if (!good) break;
      }
      if (good) return JSON.stringify({ start, seed: 555000 + start });
    }
    return JSON.stringify(null);
  })()
`));
check(`a clean 8-tick window exists for the whole cast (start tick ${window ? window.start : 'none'})`,
      !!window, 'without one, the synthetic test could not exist — every resident would be asleep or at work the whole time');
if (window) {
  const staggered = JSON.parse(api(`
    (() => {
      let g = __mk(${window.seed});
      const ids = __ids(g);
      const t0 = ${window.start};
      g.meta.clock = { day: 1, minutes: t0 * 30, phase: '' };
      const calls = [];
      const orig = evaluateDrives;
      evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
        calls.push({ npcId, currentTick });
        return orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
      };
      // X completes at +1 tick, Y at +3, Z at +5. The resolution ORDER is
      // the point: each NPC's completion must produce a decision for THEM
      // and touch nobody else.
      __forceCommit(g, ids[0], 30,  'living_room');   // X
      __forceCommit(g, ids[1], 90,  'living_room');   // Y
      __forceCommit(g, ids[2], 150, 'living_room');   // Z
      try {
        g = resolveBatch(g, 8).state;
      } finally { evaluateDrives = orig; }
      const callTicks = (id) => calls.filter(c => c.npcId === id).map(c => c.currentTick);
      return JSON.stringify({
        xCalls: callTicks(ids[0]),
        yCalls: callTicks(ids[1]),
        zCalls: callTicks(ids[2]),
        xResolved: calls.some(c => c.npcId === ids[0] && c.currentTick >= t0 + 1 && c.currentTick <= t0 + 4),
        yResolved: calls.some(c => c.npcId === ids[1] && c.currentTick >= t0 + 3 && c.currentTick <= t0 + 6),
        zResolved: calls.some(c => c.npcId === ids[2] && c.currentTick >= t0 + 5 && c.currentTick <= t0 + 8),
      });
    })()
  `));
  check(`X (completion at +1) is never re-decided before it, and is re-decided shortly after (first call tick ${staggered.xCalls[0] ?? 'none'})`,
        staggered.xCalls.length > 0 && staggered.xCalls.every(t => t >= window.start + 1) && staggered.xResolved,
        `X was re-decided on ticks ${JSON.stringify(staggered.xCalls)} (window starts ${window.start})`);
  check('Y (completion at +3) is untouched on X\'s completion — never on an unrelated NPC\'s boundary',
        staggered.yCalls.every(t => t >= window.start + 3),
        `Y was re-decided on ${JSON.stringify(staggered.yCalls)} — its first completion is at +3`);
  check('Z (completion at +5) is untouched through BOTH earlier completions',
        staggered.zCalls.every(t => t >= window.start + 5),
        `Z was re-decided on ${JSON.stringify(staggered.zCalls)} — its first completion is at +5`);
  check('each NPC is resolved at least once within 3 ticks of its own completion',
        staggered.xResolved && staggered.yResolved && staggered.zResolved,
        `xResolved=${staggered.xResolved} yResolved=${staggered.yResolved} zResolved=${staggered.zResolved} — ` +
        'the re-decision may defer a tick (a fresh schedule roll can walk a just-freed NPC), but not more');
}

// ---------------------------------------------------------------------------
console.log('\nthe mid-hold zero-call property, at population scale');
api(`
  // KEY ON THE ABSOLUTE MINUTE, NOT ON currentTick: the tick index
  // evaluateDrives receives is getTickIndex(clock.minutes) — a WITHIN-DAY
  // index that wraps at midnight. Matching calls to rows on it would match a
  // call made at within-day tick 19 on day 2 against a mid-hold row at
  // within-day tick 19 on day 1 and report phantom violations (a 27-false
  // positive measurement in the session that first wrote this). clockToAbsolute
  // does not wrap, and within one resolveTick the clock does not move, so a
  // call's clockAbs always equals its tick's row nowAbs. Per-house runs keep
  // the (per-house) npcIds from colliding across the two traces' houses.
  __traceHeld = (houses, ticks) => {
    const runs = [];
    const orig = evaluateDrives;
    const origTick = resolveTick;
    try {
      for (let i = 0; i < houses; i++) {
        const calls = [];
        const rows = [];   // per tick: { nowAbs, states: [{npcId, held}] } — START-of-tick commitment
        evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
          calls.push({ npcId, clockAbs: clockToAbsolute(gameState.meta.clock) });
          return orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
        };
        resolveTick = function (gameState) {
          const nowAbs = clockToAbsolute(gameState.meta.clock);
          const states = [];
          for (const [id, npc] of Object.entries(gameState.npcs)) {
            if (!npc || npc.residency.status !== 'resident') continue;
            // D6: a pending interrupt (a need past its snapshot-relative
            // urgency threshold, or a pending overture) is a DESIGNED
            // early-release trigger, not a flat-scan violation — read it
            // pre-tick, the same moment held is captured, so a re-decision
            // this tick can be told apart from an unexplained one.
            const interrupt = npc.commitment ? shouldInterruptCommitment(npc, npc.commitment) : null;
            states.push({ npcId: id, held: npc.commitment ? { ...npc.commitment } : null, interrupt });
          }
          rows.push({ nowAbs, states });
          return origTick(gameState);
        };
        let g = __mk(20260811 + i * 7919);
        g = resolveBatch(g, ticks).state;
        runs.push({ calls, rows });
      }
    } finally { evaluateDrives = orig; resolveTick = origTick; }
    return runs;
  };
`);
const runs = JSON.parse(api(`JSON.stringify(__traceHeld(${HOUSES}, ${TICKS}))`));
let residentTicks = 0, heldTicks = 0, midHoldTicks = 0, midHoldViolations = 0, interruptReleases = 0, completions = 0;
for (const run of runs) {
  const calledByAbs = {};
  for (const c of run.calls) (calledByAbs[c.clockAbs] = calledByAbs[c.clockAbs] || new Set()).add(c.npcId);
  for (const row of run.rows) {
    for (const s of row.states) {
      residentTicks++;
      if (!s.held) continue;
      heldTicks++;
      if (row.nowAbs >= s.held.completesAtAbs) { completions++; continue; }   // completion tick — re-decision is the point
      midHoldTicks++;
      const called = calledByAbs[row.nowAbs] && calledByAbs[row.nowAbs].has(s.npcId);
      if (!called) continue;
      if (s.interrupt) { interruptReleases++; continue; }   // D6 early release — re-decision is the point, same as a completion
      midHoldViolations++;
    }
  }
}
check(`commitments actually hold — ${heldTicks} of ${residentTicks} resident-ticks ` +
      `(${(heldTicks / Math.max(1, residentTicks) * 100).toFixed(1)}%), ${completions} completions`,
      heldTicks > 0 && midHoldTicks > 0 && completions > 0,
      'a week in which nobody held anything would make the zero-call property vacuous');
check(`a mid-hold commitment is re-resolved ${midHoldViolations} times in ${midHoldTicks - interruptReleases} ` +
      `unexplained mid-hold npc-ticks (${interruptReleases} more were D6 interrupt releases) — the flat scan is gone from this code path`,
      midHoldTicks > 0 && midHoldViolations === 0,
      `${midHoldViolations} violations — evaluateDrives ran for an NPC whose commitment had time left and no ` +
      'interrupt trigger fired; an unrelated NPC\'s boundary must not resolve anyone else');

// ---------------------------------------------------------------------------
console.log('\n(C6 / D7) determinism, and the tick stays model-free');
api(`
  __seq = (seed, ticks) => {
    let g = __mk(seed);
    const out = [];
    const origTick = resolveTick;
    resolveTick = function (gameState) {
      const row = {};
      for (const [id, npc] of Object.entries(gameState.npcs))
        if (npc && npc.residency.status === 'resident' && npc.commitment)
          row[id] = [npc.commitment.id, npc.commitment.startedAtAbs, npc.commitment.completesAtAbs];
      out.push(row);
      return origTick(gameState);
    };
    try { g = resolveBatch(g, ticks).state; } finally { resolveTick = origTick; }
    return out;
  };
`);
check('two identical-seed 48-tick runs produce byte-identical commitment sequences',
      api(`JSON.stringify(__seq(424242, 48)) === JSON.stringify(__seq(424242, 48))`));
check('two different seeds diverge',
      api(`JSON.stringify(__seq(424242, 48)) !== JSON.stringify(__seq(999999, 48))`));
check('the selection path stays synchronous and model-free (R2 / D11)', api(`
  (() => {
    const g = __mk();
    let called = 0;
    const orig = root.generateText;
    root.generateText = () => { called++; return Promise.resolve('{}'); };
    try {
      for (let t = 0; t < 20; t++) resolveBatch(g, 1);
    } finally { root.generateText = orig; }
    return called === 0;
  })()
`), 'every autonomy feature in this game rests on the tick being callable in a loop with no network');
// srcOf strips comments before matching — a prose comment saying "nothing
// here is async" (there is one, right at the top of cognition.js) would
// otherwise trip a raw-text /\basync\b/ check on its own explanation.
const srcOf = (f) => require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');
const SRCFILES = require('fs').readdirSync(require('path').join(__dirname, '..', '..', 'src', 'srcfiles')).filter(f => f.endsWith('.js'));
check('cognition.js is synchronous by construction',
      !/\basync\b|\bawait\b|generateText/.test(srcOf('cognition.js')));

// ---------------------------------------------------------------------------
console.log('\n(D13) the queue lives where the size rule put it');
check('nextDecisionAbs / dueForDecision / deriveHeldRecord are defined once, in cognition.js',
      ['nextDecisionAbs', 'dueForDecision', 'deriveHeldRecord'].every(fn =>
        SRCFILES.filter(f => new RegExp(`function ${fn}\\(`).test(srcOf(f))).length === 1 &&
        new RegExp(`function ${fn}\\(`).test(srcOf('cognition.js'))));
// Phase 5 grew the gate from a bare `continue;` into an else-branch one (the
// interrupt/aged-away fall-through, D6) — accept either shape, so a future
// refactor of the surrounding logic doesn't report as a regression here.
check('resolveTick drives the queue — the due set gates the decision pass',
      /dueForDecision\(/.test(srcOf('sim.js')) && /deriveHeldRecord\(/.test(srcOf('sim.js')) &&
      (/if \(!dueNpcIds\.has\(id\)\) continue;/.test(srcOf('sim.js')) ||
       /if \(!dueNpcIds\.has\(id\)\) \{[\s\S]{0,3000}?\bcontinue;/.test(srcOf('sim.js'))),
      'the pass-3 gate is the line the flat scan died on');
check('sim.js still never builds or deletes a commitment — it only carries it through the merge',
      !/\bcommitment\s*=\s*\{/.test(srcOf('sim.js')) &&
      !/delete\s+\w+\.commitment/.test(srcOf('sim.js')) &&
      /npcUpdates\[id\]\.commitment = postDrive\.commitment/.test(srcOf('sim.js')));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
