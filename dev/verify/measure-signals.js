// Tuning instrument for the signal layer — the sibling of measure.js.
// Prints how far each channel actually reaches from a source, so the
// attenuation and noticeFloor numbers are set by looking rather than by
// arithmetic. Phase 4 taught this lesson expensively.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

api(`
  __h = SIM_generateHouse(20260810, 3);
  __gs = { meta: { seed: __h.seed, clock: __h.clock }, player: __h.player,
           npcs: __h.npcs, world: __h.world, objects: __h.objects };
  __setState = (roomId, defId, key, val) => {
    for (const o of Object.values(__gs.objects['room_' + roomId] || {})) {
      if (o.defId === defId) o.state = { ...o.state, [key]: val };
    }
  };
  __setDoor = (roomId, lock) => {
    for (const o of Object.values(__gs.objects['room_' + roomId] || {})) {
      if (o.defId === 'bedroom_door' || o.defId === 'bathroom_door') o.state = { ...o.state, lock };
    }
  };
`);

const ROOMS = api('Object.keys(ROOMS)');
const hops = (from, to) => api(`
  (() => {
    const seen = { '${from}': 0 }; const q = ['${from}'];
    while (q.length) { const r = q.shift();
      for (const n of (ROOM_ADJACENCY[r] || [])) if (seen[n] === undefined) { seen[n] = seen[r] + 1; q.push(n); } }
    return seen['${to}'];
  })()
`);

console.log('=== SMELL: rot in the kitchen fridge (source intensity 0.8) ===\n');
api(`__setState('kitchen', 'fridge', 'rotten_food', 'rotten');`);
console.log('  room                 hops   arrived   band     player senses?');
for (const r of ROOMS) {
  const recs = api(`perceiveSignals(__gs, 'player', '${r}').filter(x => x.signalId === 'rot')`);
  const reach = api(`reachMultipliers(__gs, '${r}', 'smell')['kitchen'] || 0`);
  const arrived = reach * 0.8;
  if (arrived < 0.01 && recs.length === 0) continue;
  console.log(`  ${r.padEnd(20)}${String(hops('kitchen', r)).padStart(4)}   ${arrived.toFixed(3).padStart(6)}   ${(recs[0]?.band || '—').padEnd(8)} ${recs.length ? 'yes' : 'no'}`);
}

// The earlier version of this test put the source four rooms away, where the
// signal was already dead — so both door states read 0 and it proved nothing.
// A door only matters on a hop it actually sits on.
console.log('\n=== Door attenuation: source in hallway_a, player in bedroom_2 (one hop) ===');
console.log('  channel  no door   unlocked   locked');
for (const ch of ['smell', 'sound', 'sight']) {
  const row = [];
  for (const state of ['none', 'unlocked', 'locked']) {
    if (state === 'none') {
      const m = api(`(() => { const save = __gs.objects['room_bedroom_2']; __gs.objects['room_bedroom_2'] = {};
        const v = reachMultipliers(__gs, 'bedroom_2', '${ch}')['hallway_a'] || 0;
        __gs.objects['room_bedroom_2'] = save; return v; })()`);
      row.push(m);
    } else {
      api(`__setDoor('bedroom_2', '${state}');`);
      row.push(api(`reachMultipliers(__gs, 'bedroom_2', '${ch}')['hallway_a'] || 0`));
    }
  }
  console.log(`  ${ch.padEnd(9)}${row.map(v => v.toFixed(3).padStart(7)).join('   ')}`);
}
api(`__setDoor('bedroom_2', 'unlocked');`);

console.log('\n=== The thesis case: a shower running, heard from outside ===');
console.log('  (source 0.85 in bathroom_a — Phase 3 will emit this for real)');
for (const [r, who] of [['bathroom_a', 'player'], ['hallway_a', 'player'], ['bedroom_player', 'player'], ['living_room', 'player']]) {
  const mult = api(`reachMultipliers(__gs, '${r}', 'sound')['bathroom_a'] || 0`);
  const arrived = mult * 0.85;
  const att = api(`getPlayerPerception(__gs.player)`);
  const floor = api(`SIGNAL_TUNING.noticeFloor.sound`);
  const keen = api(`Math.max(...Object.values(__gs.npcs).map(n => getNpcPerception(n)))`);
  console.log(`  ${r.padEnd(16)} arrives ${arrived.toFixed(3)}  player(${att.toFixed(2)}): ${arrived * att >= floor ? 'HEARD' : 'no'}   keenest npc(${keen.toFixed(2)}): ${arrived * keen >= floor ? 'HEARD' : 'no'}`);
}

console.log('\n=== SIGHT: dishes in the kitchen sink (should barely leave the room) ===');
api(`__setState('kitchen', 'sink_kitchen', 'dishes', 'many');`);
for (const r of ['kitchen', 'dining', 'hallway_b', 'living_room']) {
  const recs = api(`perceiveSignals(__gs, 'player', '${r}').filter(x => x.signalId === 'dirty_dishes')`);
  const reach = api(`reachMultipliers(__gs, '${r}', 'sight')['kitchen'] || 0`);
  console.log(`  ${r.padEnd(14)} hops ${hops('kitchen', r)}  arrived ${(reach * 0.65).toFixed(4)}  ${recs.length ? recs[0].band : 'not seen'}`);
}

console.log('\n=== SOUND: propagation math (no shipped emitter until Phase 3) ===');
for (const r of ['bathroom_a', 'hallway_a', 'bedroom_player', 'living_room', 'kitchen']) {
  const reach = api(`reachMultipliers(__gs, '${r}', 'sound')['bathroom_a'] || 0`);
  console.log(`  from bathroom_a -> ${r.padEnd(16)} hops ${hops('bathroom_a', r)}  mult ${reach.toFixed(4)}  (a 0.85 source arrives ${(reach * 0.85).toFixed(3)})`);
}

// The emotional channel (npc-initiative-plan.md Phase 1). These are the only
// signals in the game emitted by a MOOD rather than by an act, and the brief
// they were placed against was "noticeable in the room, not through a closed
// door" — with the slam as the deliberate exception, because an expression
// that reaches you somewhere else is what makes it a slam. Intensities are
// read from the DRIVE_DEFS rules that emit them, so retuning the table
// retunes this table.
console.log('\n=== EXPRESSIONS: how far a mood carries (initiative plan Phase 1) ===');
const EXPR = JSON.parse(api(`
  (() => {
    const out = {};
    for (const d of Object.values(DRIVE_DEFS)) {
      if (!d.expresses) continue;
      for (const r of (Array.isArray(d.expresses) ? d.expresses : [d.expresses])) out[r.signal] = r.intensity;
    }
    return JSON.stringify(out);
  })()
`));
api(`__setDoor('bedroom_2', 'unlocked');`);
const att = api(`getPlayerPerception(__gs.player)`);
const floorSound = api(`SIGNAL_TUNING.noticeFloor.sound`);
console.log(`  (player attention ${att.toFixed(2)}, sound notice floor ${floorSound})`);
// The four cases the intensities were placed against. `dining` is one open hop
// from the kitchen and `living_room` is two — hops are asked of the adjacency
// graph rather than assumed, because the first draft of this section labelled a
// two-hop path as one and read as a sigh that carried half as far as it does.
const hop1 = api(`reachMultipliers(__gs, 'dining', 'sound')['kitchen'] || 0`);
const hop2 = api(`reachMultipliers(__gs, 'living_room', 'sound')['kitchen'] || 0`);
const doorHop = api(`reachMultipliers(__gs, 'bedroom_2', 'sound')['hallway_a'] || 0`);
api(`__setDoor('bedroom_2', 'locked');`);
const lockHop = api(`reachMultipliers(__gs, 'bedroom_2', 'sound')['hallway_a'] || 0`);
api(`__setDoor('bedroom_2', 'unlocked');`);
console.log(`  (hops: dining is ${hops('kitchen', 'dining')} from the kitchen, living_room is ${hops('kitchen', 'living_room')})`);
console.log('  signal          source   same room     1 open hop    2 open hops   closed door   locked door');
for (const [sig, intensity] of Object.entries(EXPR)) {
  const verdict = (m) => {
    const arrived = intensity * m;
    return `${arrived.toFixed(3)} ${arrived * att >= floorSound ? 'HEARD' : 'no   '}`;
  };
  console.log(`  ${sig.padEnd(15)} ${intensity.toFixed(2)}    ` +
    [1, hop1, hop2, doorHop, lockHop].map(m => verdict(m).padEnd(14)).join(''));
}
console.log('  decay: ' + Object.keys(EXPR).map(s =>
  `${s} lasts ~${Math.ceil(EXPR[s] / api(`SIGNAL_DEFS['${s}'].decayPerTick`))} tick(s)`).join(', '));

console.log('\n=== Attention spread across the cast ===');
console.log(`  player               ${api(`getPlayerPerception(__gs.player)`).toFixed(2)}`);
for (const [id, name, att] of api(`
  Object.entries(__gs.npcs).filter(([,n]) => n.residency.status === 'resident')
    .map(([id, n]) => [id, n.bible.name, getNpcPerception(n)])
`)) console.log(`  ${String(name).padEnd(20)} ${att.toFixed(2)}`);

console.log('\n=== Cost: perceiveSignals calls per second ===');
const t0 = Date.now();
api(`for (let i = 0; i < 2000; i++) perceiveSignals(__gs, 'player', 'living_room');`);
const ms = Date.now() - t0;
console.log(`  2000 calls in ${ms}ms  (${(2000 / (ms / 1000)).toFixed(0)}/s)`);
console.log(`  a 5-npc tick would cost ~${(ms / 2000 * 5).toFixed(2)}ms`);
