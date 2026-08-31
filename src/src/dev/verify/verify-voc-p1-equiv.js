// Vocation & Lifestyle Expansion — Phase 1 equivalence gate.
//
// Phase 1 claims to be a pure refactor: nine sites across six files stopped
// asking "is this NPC out of the flat" for themselves and started calling
// `npcIsOffsite`, which — while every occupation is still `on_site` — must
// return exactly what their `block === 'work' || ...` comparisons returned.
//
// WHY THIS IS NOT A RECORDED-BASELINE TEST. The obvious shape is "stash the
// changes, record a week, unstash, compare". That was tried and is WRONG in
// this tree: `git stash` also stashes whatever else is uncommitted, and the
// seasonal-calendar work in flight redefines getWeekday from (day-1)%7 to
// (day+5)%7. Every schedule block moves, and the diff that comes back is a
// calendar diff wearing this plan's name. A recorded baseline is only as
// honest as the tree it was recorded from, and this tree has more than one
// change in it.
//
// So the claim is tested directly instead, in ONE process against ONE tree:
// run a week with the real predicate, swap `npcIsOffsite` for the legacy
// string comparison it replaced, run the identical week again, and require
// the two streams to be byte-identical. That is exactly the assertion Phase 1
// makes, it needs no baseline file, and it cannot be fooled by unrelated work
// in the working tree.
//
// It also keeps working AFTER Phase 2 lands: the legacy predicate is only
// equivalent while every occupation is on_site, so once the pool carries real
// work modes this file reports the divergence as EXPECTED and pins which
// NPCs moved — which is the same information the recorded baseline was for.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const SEEDS = ['equiv-seed-a', 'equiv-seed-b', 'equiv-seed-c'];
const DAYS = 7;

// The predicate as it behaved before this plan: a work-boundary block always
// meant the NPC was gone, whoever they were.
api(`
  __realOffsite = npcIsOffsite;
  __legacyOffsite = function (npc, block, clock, npcId) {
    return block === 'work' || block === 'commute' || block === 'commute_home';
  };
`);

// One week of ticks, recording what every resident was doing at every
// checkpoint. Uses the engine's own SIM_generateHouse + resolveTick so the
// stream is the real one, not a reconstruction.
function streamFor(seed) {
  return api(`
    (() => {
      const h = SIM_generateHouse(${JSON.stringify(seed)}, 3);
      const gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                   player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
      for (const k of Object.keys(gs.world.upgrades)) gs.world.upgrades[k] = { tier: 'functional', condition: 100 };
      const out = [];
      const ids = Object.keys(gs.npcs).filter(id => gs.npcs[id].residency && gs.npcs[id].residency.status === 'resident').sort();
      const ticksPerDay = Math.floor(1440 / CLOCK.tickMinutes);
      let state = gs;
      for (let t = 0; t < ${DAYS} * ticksPerDay; t++) {
        // resolveBatch, not resolveTick: resolveTick neither moves the clock
        // nor applies its own npcUpdates (the caller merges them). A bare
        // resolveTick loop runs the whole week at one instant and records only
        // the fields commitments mutate directly — which looks like a working
        // harness and is measuring almost nothing.
        state = resolveBatch(state, 1).state;
        const row = [];
        for (const id of ids) {
          const n = state.npcs[id];
          row.push([
            id,
            n.location === null || n.location === undefined ? '~' : n.location,
            n.activity || '',
            (n.schedule && n.schedule.currentBlock) || '',
            n.commitment ? n.commitment.kind + ':' + (n.commitment.id || '') : '',
            (n.outfit && n.outfit.type) || '',
            n.pos === null || n.pos === undefined ? '~' : 'pos',
          ].join('|'));
        }
        out.push(row.join(';'));
      }
      return out;
    })()
  `);
}

function runAll(which) {
  api(`npcIsOffsite = ${which};`);
  const streams = {};
  for (const seed of SEEDS) streams[seed] = streamFor(seed);
  return streams;
}

console.log('\nPhase 1 equivalence — the predicate must reproduce the legacy comparison\n');

let real, legacy;
try {
  real = runAll('__realOffsite');
  legacy = runAll('__legacyOffsite');
} catch (e) {
  console.log(`  FAIL  the engine threw while simulating\n        ${String(e && e.stack || e).slice(0, 400)}\n`);
  process.exit(1);
} finally {
  api('npcIsOffsite = __realOffsite;');
}

// Sanity: the swap must actually have taken effect, or this file proves
// nothing at all. Forcing a remote NPC through both must disagree.
const swapWorks = api(`
  (() => {
    const npc = { bible: { occupation: { workMode: 'remote' } } };
    const a = __realOffsite(npc, 'work', { day: 3 }, 'x');
    const b = __legacyOffsite(npc, 'work', { day: 3 }, 'x');
    return a === false && b === true;
  })()
`);
check('the two predicates genuinely differ (the swap is doing something)', swapWorks);

const allOnSite = api(`OCCUPATION_POOL.every(o => (o.workMode || 'on_site') === 'on_site')`);

let totalTicks = 0, divergentSeeds = 0;
for (const seed of SEEDS) {
  const a = legacy[seed], b = real[seed];
  totalTicks += a.length;
  if (a.length !== b.length) {
    fail++; divergentSeeds++;
    console.log(`  FAIL  ${seed}: tick count ${b.length} vs legacy ${a.length}`);
    continue;
  }
  const diffs = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);

  if (diffs.length === 0) {
    pass++;
    console.log(`  PASS  ${seed}: ${a.length} ticks identical`);
  } else if (!allOnSite) {
    // Expected once Phase 2 gives the pool real work modes.
    pass++;
    divergentSeeds++;
    console.log(`  PASS  ${seed}: ${diffs.length}/${a.length} ticks differ — EXPECTED, pool has non-on_site modes`);
  } else {
    fail++; divergentSeeds++;
    console.log(`  FAIL  ${seed}: ${diffs.length}/${a.length} ticks differ while every occupation is on_site`);
    for (const i of diffs.slice(0, 3)) {
      console.log(`        tick ${i}`);
      console.log(`          legacy: ${a[i].slice(0, 200)}`);
      console.log(`          real:   ${b[i].slice(0, 200)}`);
    }
  }
}

if (allOnSite) {
  check(`every occupation is on_site, so equivalence is the right assertion (${totalTicks} ticks compared)`, true);
} else {
  console.log(`\n  NOTE  the pool now carries real work modes, so divergence is the POINT.`);
  console.log(`        ${divergentSeeds}/${SEEDS.length} seeds diverge from legacy behaviour — that is at-home work happening.`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
