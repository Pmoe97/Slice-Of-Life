// Balance probe: run the real resolveTick and report where each need lives,
// against the gate of the drive that services it. Not an assertion harness —
// this is the instrument used to tune the numbers.
const { loadEngine } = require('./loadgame.js');

const GATES = { hunger: 35, hygiene: 30, energy: 20, social: 25, comfort: 25, stimulation: 25 };

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
      const r = resolveTick(__gs);
      for (const e of r.newEvents) __fired[e.type] = (__fired[e.type] || 0) + 1;
      for (const [id, u] of Object.entries(r.npcUpdates)) {
        if (!__log[id]) continue;
        __gs.npcs[id] = { ...__gs.npcs[id], ...u };
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
  console.log('  need          min  max  avg   gate  drive can fire?');
  for (const need of Object.keys(GATES)) {
    const lo = Math.min(...res.map(id => s[id][need].min));
    const hi = Math.max(...res.map(id => s[id][need].max));
    const av = Math.round(res.map(id => s[id][need].avg).reduce((a, b) => a + b, 0) / res.length);
    const ok = lo < GATES[need];
    console.log(`  ${need.padEnd(13)}${String(lo).padStart(3)}${String(hi).padStart(5)}${String(av).padStart(5)}${String(GATES[need]).padStart(7)}   ${ok ? 'yes' : 'NO — unreachable'}`);
  }
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
      const r = resolveTick(__gs);
      for (const e of r.newEvents) __fired[e.type] = (__fired[e.type] || 0) + 1;
      for (const [id, u] of Object.entries(r.npcUpdates)) {
        if (!__log[id]) continue;
        __gs.npcs[id] = { ...__gs.npcs[id], ...u };
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
  console.log('  need          min  max  avg   gate  drive can fire?');
  for (const need of Object.keys(GATES)) {
    const lo = Math.min(...res.map(id => s[id][need].min));
    const hi = Math.max(...res.map(id => s[id][need].max));
    const av = Math.round(res.map(id => s[id][need].avg).reduce((a, b) => a + b, 0) / res.length);
    const ok = lo < GATES[need];
    console.log(`  ${need.padEnd(13)}${String(lo).padStart(3)}${String(hi).padStart(5)}${String(av).padStart(5)}${String(GATES[need]).padStart(7)}   ${ok ? 'yes' : 'NO — unreachable'}`);
  }
  console.log(`  events: ${Object.entries(fired).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
}

run('OPENING DISREPAIR (facilities broken)', { repaired: false });
runRepaired('REPAIRED APARTMENT (all facilities functional)');
