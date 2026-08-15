// Balance probe: run the real resolveTick and report where each need lives,
// against the gate of the drive that services it. Not an assertion harness —
// this is the instrument used to tune the numbers.
const { loadEngine } = require('./loadgame.js');

// The threshold column is DERIVED from DRIVE_DEFS, not typed in. It used to be
// a hardcoded literal and it had drifted: it read `comfort: 25` while the def
// said 40, so the instrument printed "reachable" for a drive that was
// mathematically unable to fire. An instrument that can disagree with the table
// it is measuring is worse than no instrument.
//
// The cognition plan's D14 deleted the last `{ need, op, threshold }` gate from
// DRIVE_DEFS: a need is now a SCORE TERM (`utility.need.below`), not a boolean.
// Per need this reports the WIDEST window any drive declares for it — the first
// point at which something that services this need starts to become appealing —
// and which drive that is.
const { api: cfgApi } = loadEngine({ required: ['config.js'] });
const GATE_TABLE = JSON.parse(cfgApi(`
  (() => {
    const t = {};
    for (const [id, d] of Object.entries(DRIVE_DEFS)) {
      const u = d.utility && d.utility.need;
      if (!u) continue;
      if (!t[u.need] || u.below > t[u.need].below) t[u.need] = { below: u.below, drive: id };
    }
    return JSON.stringify(t);
  })()
`));

// `below` is where the scorer's need curve starts; the contribution rises from
// 0 there to COGNITION.needWeight at a fully depleted need. A need whose
// observed floor sits at or above `below` contributes nothing, ever — which is
// what `energy` and `comfort` were under the old boolean gates, and is the
// defect class the whole conversion exists to make impossible.
function printNeeds(s, res) {
  console.log('  need          min  max  avg  below  motivates?   (drive)');
  for (const need of Object.keys(GATE_TABLE)) {
    const lo = Math.min(...res.map(id => s[id][need].min));
    const hi = Math.max(...res.map(id => s[id][need].max));
    const av = Math.round(res.map(id => s[id][need].avg).reduce((a, b) => a + b, 0) / res.length);
    const t = GATE_TABLE[need];
    const ok = lo < t.below;
    console.log(`  ${need.padEnd(13)}${String(lo).padStart(3)}${String(hi).padStart(5)}${String(av).padStart(5)}` +
                `${String(t.below).padStart(7)}   ` +
                `${(ok ? 'yes' : 'NO — dead term').padEnd(15)}${t.drive}`);
  }
}

function run(label, { repaired, days = 5, seed = 20260810 }) {
  const { api } = loadEngine();
  api(`
    __h = SIM_generateHouse(${seed}, 3);
    __gs = { meta: { seed: __h.seed, clock: __h.clock, contentConfig: null, sessionLog: [] },
             player: __h.player, npcs: __h.npcs, world: __h.world, objects: __h.objects };
    __restock = () => {
      for (const o of Object.values(__gs.objects['room_kitchen'] || {})) {
        if (o.defId === 'fridge' || o.defId === 'pantry') {
          o.contents = addStack(o.contents || [], 'eggs', 12, null, {}, __gs.meta.clock.day);
        }
      }
    };
    __restock();
    __res = Object.entries(__gs.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
    __log = {}; __fired = {};
    for (const id of __res) __log[id] = { hunger: [], hygiene: [], energy: [], social: [], comfort: [], stimulation: [] };
    for (let t = 0; t < 48 * ${days}; t++) {
      __gs.meta.clock = advanceClock(__gs.meta.clock, 1);
      if (__gs.meta.clock.minutes < 30) __restock();
      // needs-and-heartbeat Phase 3: needs moved OUT of resolveTick into the
      // discrete funnel's per-tick applyNeedsHeartbeat (resolveBatch) — a
      // bare resolveTick call would freeze every need and this probe would
      // report flat lines.
      const rb = resolveBatch(__gs, 1, { advanceClock: false });
      __gs = rb.state;
      for (const e of rb.events) __fired[e.type] = (__fired[e.type] || 0) + 1;
      for (const id of __res) {
        const n = __gs.npcs[id].needs;
        for (const k of Object.keys(__log[id])) __log[id][k].push(n[k]);
      }
    }
    __s = {};
    for (const id of __res) {
      __s[id] = {};
      for (const [k, a] of Object.entries(__log[id])) {
        __s[id][k] = { min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)),
                       avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length) };
      }
    }
  `);
  if (repaired) {
    // Re-run with every facility functional. Done as a second pass so the
    // disrepair and repaired numbers come from identical cast/seed.
    api(`for (const k of Object.keys(__gs.world.upgrades)) __gs.world.upgrades[k] = { tier: 'functional', condition: 100 };`);
  }
  const s = api('__s'), res = api('__res'), fired = api('__fired');
  console.log(`\n${label}`);
  printNeeds(s, res);
  console.log(`  events: ${Object.entries(fired).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
}

// Repaired: pass the flag INTO the sim run, not after it.
function runRepaired(label, days = 5) {
  const { api } = loadEngine();
  api(`
    __h = SIM_generateHouse(20260810, 3);
    __gs = { meta: { seed: __h.seed, clock: __h.clock, contentConfig: null, sessionLog: [] },
             player: __h.player, npcs: __h.npcs, world: __h.world, objects: __h.objects };
    for (const k of Object.keys(__gs.world.upgrades)) __gs.world.upgrades[k] = { tier: 'functional', condition: 100 };
    __restock = () => {
      for (const o of Object.values(__gs.objects['room_kitchen'] || {})) {
        if (o.defId === 'fridge' || o.defId === 'pantry') {
          o.contents = addStack(o.contents || [], 'eggs', 12, null, {}, __gs.meta.clock.day);
        }
      }
    };
    __restock();
    __res = Object.entries(__gs.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
    __log = {}; __fired = {};
    for (const id of __res) __log[id] = { hunger: [], hygiene: [], energy: [], social: [], comfort: [], stimulation: [] };
    for (let t = 0; t < 48 * ${days}; t++) {
      __gs.meta.clock = advanceClock(__gs.meta.clock, 1);
      if (__gs.meta.clock.minutes < 30) __restock();
      // needs-and-heartbeat Phase 3: needs moved OUT of resolveTick into the
      // discrete funnel's per-tick applyNeedsHeartbeat (resolveBatch) — a
      // bare resolveTick call would freeze every need and this probe would
      // report flat lines.
      const rb = resolveBatch(__gs, 1, { advanceClock: false });
      __gs = rb.state;
      for (const e of rb.events) __fired[e.type] = (__fired[e.type] || 0) + 1;
      for (const id of __res) {
        const n = __gs.npcs[id].needs;
        for (const k of Object.keys(__log[id])) __log[id][k].push(n[k]);
      }
    }
    __s = {};
    for (const id of __res) {
      __s[id] = {};
      for (const [k, a] of Object.entries(__log[id])) {
        __s[id][k] = { min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)),
                       avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length) };
      }
    }
  `);
  const s = api('__s'), res = api('__res'), fired = api('__fired');
  console.log(`\n${label}`);
  printNeeds(s, res);
  console.log(`  events: ${Object.entries(fired).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
}

run('OPENING DISREPAIR (facilities broken)', { repaired: false });
runRepaired('REPAIRED APARTMENT (all facilities functional)');
