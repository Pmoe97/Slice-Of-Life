// Plan X-5, Phase 4 — the tuned wire.
//
//   node dev/verify/verify-x4.js
//
// Phases 1-3 asserted that the two passes are SAFE: nothing a model claims can
// mint a pinned belief, a failed pass changes nothing, a judged window never
// reopens. Every one of those invariants is satisfied perfectly by a wire that
// moves nothing at all, and that is the failure Phase 4 measured and fixed.
//
// So this file asserts the other side, which nothing did before:
//
//   1. The ladder is REACHABLE. A relationship must be able to travel its own
//      conversationPhase thresholds within a game somebody might play. The old
//      divisor satisfied every safety invariant in the suite while taking 141
//      windows — some 47 in-game days — to reach `intimate`, at which point the
//      strongest lever in the NPC block is decoration.
//   2. A quiet judge is still quiet. D8's modal answer must apply exactly
//      nothing, however many times it is given. Drift from zeros would be the
//      cheapest possible bug and the hardest to see.
//   3. The divisor floor is a live guard, not a coincidence. Below
//      deltaClamp/validateProposal's per-axis ceiling, a proposal fails whole
//      on its largest axis — so the BIG judgements stop landing while small
//      ones sail through, and the scale silently inverts.
//
// Numbers here are derived from the tables that own them (README rule 5).
// The one harness-owned constant is REACH_BUDGET below, and it is a
// reachability bound in the sense verify-c1 uses the word — "is this feature
// reachable at all", not "is it tuned to this value". Phase 4 may retune
// deltaDivisor anywhere between the floor and REACH_BUDGET without this file
// noticing; only a wire that cannot move a relationship fails it.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'npc.js', 'x5.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const JA = async (expr) => JSON.parse(await api(expr));

const X5 = J('X5');
const PHASE = J('PHASE_THRESHOLDS');
const AXES = J('X5_AXES');
const LADDER = Object.entries(PHASE).sort((a, b) => a[1] - b[1]);

// The reachability bound. A conversation at the top of the rubric's own scale
// is "rare — something that genuinely changes where these two stand"; if the
// top rung of the phase ladder needs more than this many of those, nobody will
// ever see it and the ladder is decoration. Deliberately loose: it is asking
// whether the feature is reachable, not whether it is tuned.
const REACH_BUDGET = 40;

ctx.__freshNpc = (name) => ({
  bible: { name, speech: {}, temperament: { openness: 0.5 }, interests: [] },
  relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
               conversationPhase: 'early', intimacyLevel: 0, grievances: [],
               firstMetDay: 1, lastInteractionDay: 1 },
  memory: { facts: [], episodes: [], summary: '', recent: [], styleCounters: {},
            openQuestions: [], nextFactId: 1 },
  mood: 0, needs: {}, flags: {}, inventory: [],
});
api(`
  __mkState = () => ({
    meta: { clock: { day: 3, minutes: 600 }, scene: { id: 1, roomId: 'kitchen', shouted: [] }, sessionLog: [] },
    player: { location: 'kitchen', money: 100, inventory: [], flags: {} },
    npcs: { npc_a: __freshNpc('Hana') },
    objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
    seed: 1234,
  });
  // One judged window, driven through the whole shipped chain exactly as
  // runAssessorPass does it: a reply STRING off the wire, the real parser, the
  // real divisor, the real validator, the real writer. A shortcut past any of
  // those would assert arithmetic this file does not own.
  __judge = async (g, axes) => {
    const c = x5ProposalContext(g, ['npc_a']);
    const parsed = parseAssessorReply(JSON.stringify({ npc_a: axes }), { soleNpcId: 'npc_a' });
    if (parsed === null) return 'unparseable';
    const deltas = toProposalDeltas(parsed, ['npc_a']);
    if (Object.keys(deltas).length === 0) return 'nothing';
    const v = validateProposal({ relationshipDeltas: deltas }, c);
    if (!v.valid) return 'rejected';
    await applyProposal({ relationshipDeltas: deltas }, c, g, null);
    return 'applied';
  };
`);

// The best window the rubric can produce: every axis that helps at the clamp,
// tension untouched. Derived from X5_AXES, so an axis added later is included
// without this file being edited.
const BEST = Object.fromEntries(AXES.filter(a => a !== 'tension').map(a => [a, X5.deltaClamp]));

async function main() {
// ---------------------------------------------------------------------------
console.log('\nthe phase ladder is reachable (what Phase 4 retuned for)');

const climb = await JA(`
  (async () => {
    const g = __mkState();
    const crossed = {}, results = [];
    for (let w = 1; w <= ${REACH_BUDGET}; w++) {
      results.push(await __judge(g, ${JSON.stringify(BEST)}));
      const rel = g.npcs.npc_a.relPlayer;
      for (const [phase, at] of ${JSON.stringify(LADDER)}) {
        if (crossed[phase] === undefined && rel.intimacyLevel >= at) crossed[phase] = w;
      }
    }
    return JSON.stringify({ crossed, results, final: g.npcs.npc_a.relPlayer });
  })()
`);

check('a window at the top of the rubric\'s scale is legal and applies',
      climb.results[0] === 'applied',
      `got '${climb.results[0]}' — 'rejected' means deltaClamp/deltaDivisor (${(X5.deltaClamp / X5.deltaDivisor).toFixed(3)}) is past what validateProposal accepts`);
for (const [phase, at] of LADDER) {
  check(`conversationPhase '${phase}' (${at}) is reachable inside ${REACH_BUDGET} best-case windows`,
        climb.crossed[phase] !== undefined && climb.crossed[phase] <= REACH_BUDGET,
        `not reached in ${REACH_BUDGET} windows — at ${(X5.deltaClamp / X5.deltaDivisor).toFixed(3)} per axis this rung is decoration`);
}
check('the ladder is climbed in order, weakest rung first',
      LADDER.every(([p], i) => i === 0 || climb.crossed[p] >= climb.crossed[LADDER[i - 1][0]]),
      JSON.stringify(climb.crossed));
check('the top rung is actually occupied, not merely passed through',
      climb.final.conversationPhase === LADDER[LADDER.length - 1][0],
      `${climb.final.intimacyLevel} / ${climb.final.conversationPhase}`);

// ---------------------------------------------------------------------------
console.log('\nD8 — a judge that finds nothing changes nothing, however often');
// The cheapest possible bug in this plan and the hardest to see by playing:
// an all-zero reply that nonetheless writes something. Asserted byte-wise,
// because intimacyLevel is rounded and would hide a small constant drift.

const quiet = await JA(`
  (async () => {
    const g = __mkState();
    const before = JSON.stringify(g.npcs.npc_a.relPlayer);
    const results = [];
    for (let w = 0; w < 200; w++) results.push(await __judge(g, { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 }));
    return JSON.stringify({
      identical: JSON.stringify(g.npcs.npc_a.relPlayer) === before,
      results: Array.from(new Set(results)),
      rel: g.npcs.npc_a.relPlayer,
    });
  })()
`);
check('200 all-zero windows leave relPlayer byte-identical',
      quiet.identical === true, JSON.stringify(quiet.rel));
check('...and each of them stops at "nothing" rather than applying an empty proposal',
      quiet.results.length === 1 && quiet.results[0] === 'nothing',
      JSON.stringify(quiet.results));

// A truncated float on the old scale is the other silent-drift shape: it must
// contribute nothing rather than a small something, forever (D21).
const floats = await JA(`
  (async () => {
    const g = __mkState();
    const before = JSON.stringify(g.npcs.npc_a.relPlayer);
    for (let w = 0; w < 200; w++) await __judge(g, { trust: 0.3, affection: 0.2, comfort: 0.1 });
    return JSON.stringify({ identical: JSON.stringify(g.npcs.npc_a.relPlayer) === before, rel: g.npcs.npc_a.relPlayer });
  })()
`);
check('D21 — 200 windows of a judge still answering on the old ±0.3 float scale move nothing',
      floats.identical === true,
      JSON.stringify(floats.rel) + ' — truncation is what makes the old scale harmless rather than a 10x error');

// ---------------------------------------------------------------------------
console.log('\nthe divisor floor is a live guard, and it fails the dangerous way');
// Probed, never restated: the ceiling is a literal inside npc.js's
// validateProposal, and a copy of it here is a copy that will drift.

const validatorCeiling = J(`
  (() => {
    const g = __mkState();
    const c = x5ProposalContext(g, ['npc_a']);
    let best = 0;
    for (let m = 1; m <= 1000; m++) {
      if (!validateProposal({ relationshipDeltas: { npc_a: { trust: m / 1000 } } }, c).valid) break;
      best = m / 1000;
    }
    return best;
  })()
`);
const floor = Math.ceil(X5.deltaClamp / validatorCeiling);

check(`validateProposal's per-axis ceiling is discoverable (${validatorCeiling})`, validatorCeiling > 0);
check(`the shipped deltaDivisor (${X5.deltaDivisor}) is at or above the floor it implies (${floor})`,
      X5.deltaDivisor >= floor,
      `deltaClamp ${X5.deltaClamp} / ${X5.deltaDivisor} = ${(X5.deltaClamp / X5.deltaDivisor).toFixed(3)} > ${validatorCeiling}`);

// The trap itself, demonstrated rather than described. Below the floor it is
// the LARGEST judgements that stop landing while small ones still apply — so
// the failure is not "nothing works", it is an inverted scale plus a console
// warning nobody reads, because D14 marks the window judged either way.
const belowFloor = await JA(`
  (async () => {
    const orig = X5.deltaDivisor;
    X5.deltaDivisor = ${Math.max(1, floor - 1)};
    try {
      const g = __mkState();
      const big = await __judge(g, ${JSON.stringify(BEST)});
      const relAfterBig = JSON.stringify(g.npcs.npc_a.relPlayer);
      const small = await __judge(g, { trust: 1 });
      return JSON.stringify({ big, small, bigMovedNothing: relAfterBig === JSON.stringify(__mkState().npcs.npc_a.relPlayer) });
    } finally { X5.deltaDivisor = orig; }
  })()
`);
check(`one below-floor step (${Math.max(1, floor - 1)}) makes a best-case window fail validation outright`,
      belowFloor.big === 'rejected', `got '${belowFloor.big}'`);
check('...and it moves nothing at all, so the pass looks merely quiet',
      belowFloor.bigMovedNothing === true);
check('...while a SMALL judgement on the same wire still applies — the scale inverts',
      belowFloor.small === 'applied',
      `got '${belowFloor.small}' — if this ever reads 'rejected' the failure became loud, which is better`);
check('the divisor is restored after the probe', J('X5.deltaDivisor') === X5.deltaDivisor);

// ---------------------------------------------------------------------------
console.log('\nwiring and provenance of the numbers');
const mainHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
const ver = (f) => { const m = mainHtml.match(new RegExp(`srcfiles/${f.replace('.', '\\.')}\\?v=(\\d+)`)); return m ? +m[1] : -1; };

check('config.js version is at or above the Phase 4 floor (79)', ver('config.js') >= 79, `got ${ver('config.js')}`);
check('measure-x5.js exists — the instrument every number in the Handoff came from',
      fs.existsSync(path.join(__dirname, 'measure-x5.js')));
check('dev/verify/README.md lists it alongside the other instruments',
      /measure-x5\.js/.test(readme),
      'the measure-* scripts are the source of the plan Evidence figures; an unlisted one is one nobody re-runs');
check('the retune is documented where the constant lives, not only in the plan',
      /measure-x5/.test(fs.readFileSync(path.join(SRC, 'config.js'), 'utf8')),
      'a tuning number whose justification lives only in a wip doc is a number the next session reverts');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
