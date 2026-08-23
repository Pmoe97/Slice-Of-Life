// Seasonal Calendar & Sandbox Plan — Phase B3: applySandboxPreset and the
// config shape.
//
// applySandboxPreset(gameState, cfg) is a pure-ish patch applied between
// SIM_generateHouse and writeGeneratedGameState: it writes structural flags, rebuilds
// the live room/tier tables, stamps facility tiers + their completionStates,
// assigns roommate residencies through the shared moveToRoom pass, and sets the
// day-1 economy (money / tax reserve). The step ORDER is load-bearing (D18):
// the structural table rebuild must precede residency assignment, and
// applyFacilityCompletionStates must follow each tier write. meta.clock is never
// touched and no absolute day field is ever rebased (D19).
//
// Residency of record: applySandboxPreset lives in sim.js. applyFacilityCompletionStates
// was moved down out of ui.js so the loadgame harness (whose ORDER stops before
// the UI layer) can drive it directly — see the plan's parked "where does it
// live" question, resolved here.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// In-memory kv adapter (the intimacy-voyeurism / B1 round-trip pattern) and a
// house builder, injected into the shared engine scope.
api(`
  makeMemKv = function() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex']) kv[f] = wrap(f);
    return kv;
  };
`);
api(`
  house = function(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
    }
    return h;
  };
  roomCapacity = function(gs, roomId) {
    const defId = (ROOM_FACILITIES[roomId] || [])[0];
    const tier = gs.world.upgrades[defId] && gs.world.upgrades[defId].tier;
    const def = FACILITY_DEFS[defId];
    const t = def && (def.tiers || []).find(x => x.tier === tier);
    return (t && t.residentCapacity) || 1;
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. restored preset + study_to_bedroom + ensuite: graph, room type, tiers');

{
  const cfg = api(`applySandboxPreset(house(20260822, 0), {
    house: {
      preset: 'restored',
      structural: { study_to_bedroom: true, ensuite: true },
    },
  })`);

  const adj = api('ROOM_ADJACENCY');
  check('bathroom_a gained the bedroom_player edge', (adj.bathroom_a || []).includes('bedroom_player'),
        JSON.stringify(adj.bathroom_a));
  check('bedroom_player gained the bathroom_a edge (both directions)', (adj.bedroom_player || []).includes('bathroom_a'));
  check('bathroom_a no longer connects to hallway_a', !((adj.bathroom_a || []).includes('hallway_a')),
        JSON.stringify(adj.bathroom_a));
  check('ROOMS.study.type === "bedroom" (study_to_bedroom)', api('ROOMS.study.type') === 'bedroom',
        JSON.stringify(api('ROOMS.study.type')));

  const upgrades = cfg.world.upgrades;
  let allUpgraded = true, detail = '';
  for (const id of Object.keys(upgrades)) if (upgrades[id].tier !== 'upgraded') { allUpgraded = false; detail = `${id}=${upgrades[id].tier}`; }
  check('restored: every world.upgrades[id].tier === "upgraded"', allUpgraded, detail);
  check('restored: every upgraded facility condition === 100',
        Object.values(upgrades).every(u => u.condition === 100));
  check('structural flag written to world.flags', cfg.world.flags.structural_study_to_bedroom === 1
        && cfg.world.flags.structural_ensuite === 1);
}

// ---------------------------------------------------------------- 2
console.log('\n2. The pool assertion (D18): a restored pool no longer smells');

{
  const cfg = api(`applySandboxPreset(house(20260822, 0), { house: { preset: 'restored' } })`);
  const poolBucket = cfg.objects && cfg.objects['room_pool_room'];
  const pool = poolBucket && Object.values(poolBucket).find(o => o.defId === 'swimming_pool');
  check('the swimming_pool object exists in room_pool_room', !!pool);
  check('its state carries FACILITY_DEFS.pool_systems.completionStates (water filled, clarity clear)',
        !!pool && pool.state && pool.state.water === 'filled' && pool.state.clarity === 'clear',
        pool && pool.state ? JSON.stringify(pool.state) : 'no pool state');
}

// ---------------------------------------------------------------- 3
console.log('\n3. The ordering assertion: the order is load-bearing, not incidental');

{
  // Step 1 alone (flags written) but NOT step 2 (rebuild) — the tables must
  // still hold the base layout. This is what a mis-ordered preset looks like.
  api(`gs3 = house(20260822, 0); gs3.world.flags.structural_study_to_bedroom = 1; gs3.world.flags.structural_ensuite = 1; 0`);
  const before = api(`({
    studyType: ROOMS.study.type,
    adj: ROOM_ADJACENCY.bathroom_a.slice(),
  })`);
  check('flags alone do NOT convert the study (type still default)', before.studyType === 'common',
        `type=${JSON.stringify(before.studyType)}`);
  check('flags alone do NOT rewire the ensuite (hallway_a still connected, no bedroom_player)',
        before.adj.includes('hallway_a') && !before.adj.includes('bedroom_player'),
        JSON.stringify(before.adj));

  // Now the missing step 2 — and the tables update.
  api(`applyStructuralUpgrades(gs3); 0`);
  const after = api(`({
    studyType: ROOMS.study.type,
    adj: ROOM_ADJACENCY.bathroom_a.slice(),
  })`);
  check('after applyStructuralUpgrades the study converts', after.studyType === 'bedroom',
        `type=${JSON.stringify(after.studyType)}`);
  check('after applyStructuralUpgrades the ensuite rewires', !after.adj.includes('hallway_a') && after.adj.includes('bedroom_player'),
        JSON.stringify(after.adj));
}

// ---------------------------------------------------------------- 4
console.log('\n4. Residency: 7 roommates across 4 bedrooms, distinct + within capacity');

{
  // restored: bedrooms 1/2/3 upgraded (capacity 2 each) + study (fallback 1)
  // = 7 places; ensuite converts the bathroom so study keeps its room id.
  const cfg = api(`applySandboxPreset(house(20260822, 7), {
    house: { preset: 'restored', structural: { study_to_bedroom: true } },
    roommates: [
      { residency: { room: 'bedroom_1', bed: null } },
      { residency: { room: 'bedroom_1', bed: null } },
      { residency: { room: 'bedroom_2', bed: null } },
      { residency: { room: 'bedroom_2', bed: null } },
      { residency: { room: 'bedroom_3', bed: null } },
      { residency: { room: 'bedroom_3', bed: null } },
      { residency: { room: 'study', bed: null } },
    ],
  })`);

  const rooms = {};
  for (let i = 0; i < cfg.npcIds.length; i++) {
    const id = cfg.npcIds[i];
    const res = cfg.npcs[id].residency;
    const key = res.room + '|' + res.bed;
    rooms[key] = (rooms[key] || 0) + 1;
  }
  let over = [], count = 0;
  const FACDEFS = api('FACILITY_DEFS');
  const ROOMFAC = api('ROOM_FACILITIES');
  for (const id of cfg.npcIds) {
    const room = cfg.npcs[id].residency.room;
    count++;
    const defId = (ROOMFAC[room] || [])[0];
    const tier = cfg.world.upgrades[defId] && cfg.world.upgrades[defId].tier;
    const t = FACDEFS[defId] && (FACDEFS[defId].tiers || []).find(x => x.tier === tier);
    const cap = (t && t.residentCapacity) || 1;
    const occ = cfg.npcIds.filter(i => cfg.npcs[i].residency.room === room).length;
    if (occ > cap) over.push(`${room} ${occ}/${cap}`);
  }
  const keys = Object.keys(rooms);
  const distinctBeds = keys.length === 7;
  const noDup = keys.every(k => rooms[k] === 1);
  const capacityRespected = over.length === 0;
  check('7 roommates placed, all (room,bed) distinct', distinctBeds && noDup, `keys: ${keys.join(', ')}`);
  check('no room exceeds its tier residentCapacity', capacityRespected, over.join('; '));
  check('count matches', count === 7);
}

// ---------------------------------------------------------------- 5
console.log('\n5. economy: money and tax reserve land on the day-1 state');

{
  const cfg = api(`applySandboxPreset(house(20260822, 0), {
    house: { preset: 'wreck' },
    economy: { money: 12345, taxReserve: 999 },
  })`);
  check('player.money set', cfg.player.money === 12345, `got ${cfg.player.money}`);
  check('world.taxes.reserve set', cfg.world.taxes.reserve === 999, `got ${cfg.world.taxes.reserve}`);
  check('wreck (useStartingTiers) leaves facilities at FACILITY_STARTING_TIERS',
        cfg.world.upgrades.pool_systems.tier === 'broken' && cfg.world.upgrades.kitchen_stove.tier === 'functional');
  check('meta.clock is untouched — day is still 1 (D19)', cfg.meta.clock.day === 1, `got ${cfg.meta.clock.day}`);
}

// ---------------------------------------------------------------- 6
console.log('\n6. Source shape');

const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRCFILES, f), 'utf8');

const simSrc = srcOf('sim.js');
check('applySandboxPreset is a function in sim.js (residency of record)', /function applySandboxPreset\(gameState, cfg\)/.test(simSrc));
check('applyFacilityCompletionStates moved to sim.js', /function applyFacilityCompletionStates\(gameState, facilityId\)/.test(simSrc));
check('applyFacilityCompletionStates is gone from ui.js',
      !/function applyFacilityCompletionStates/.test(srcOf('ui.js')));
check('applySandboxPreset calls applyStructuralUpgrades (step 2, D18)', /applyStructuralUpgrades\(gameState\);/.test(simSrc));
check('applySandboxPreset routes residency through moveToRoom (D16)', /moveToRoom\(npcId, npc, r\.residency\.room, gameState\.npcs/.test(simSrc));
check('there is NO step 8 — the "no rebase" marker is present (D19)', /There is no step 8 \(D19\)/.test(simSrc));

const cfgSrc = srcOf('config.js');
check('SANDBOX_HOUSE_PRESETS has the three presets as data (D17)',
      /const SANDBOX_HOUSE_PRESETS = \{[\s\S]*wreck: \{ useStartingTiers: true \}[\s\S]*lived_in: \{ tier: 'functional', condition: 70 \}[\s\S]*restored: \{ tier: 'upgraded', condition: 100 \}[\s\S]*\};/.test(cfgSrc));
check("wreck is expressed as 'use starting tiers', not a literal copy of FACILITY_STARTING_TIERS",
      !(/wreck: \{[\s\S]{0,120}broken:/.test(cfgSrc)));

// ---------------------------------------------------------------- 7
console.log('\n7. Round-trip: applySandboxPreset → writeGeneratedGameState → loadGameState');

(async () => {
  const trip = api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'sbxp3', clock: { day: 1, minutes: 0 } });
    const gs = house(20260822, 2);
    applySandboxPreset(gs, {
      house: { preset: 'restored', structural: { study_to_bedroom: true, ensuite: true } },
      roommates: [
        { residency: { room: 'bedroom_1', bed: null } },
        { residency: { room: 'bedroom_2', bed: 'B' } },
      ],
      economy: { money: 7777, taxReserve: 333 },
    });
    await writeGeneratedGameState(gs);
    await forceFlush();
    const loaded = await loadGameState();
    return {
      money: loaded.player.money,
      taxReserve: loaded.world.taxes.reserve,
      poolUpgraded: loaded.world.upgrades.pool_systems.tier === 'upgraded',
      studyFlag: loaded.world.flags.structural_study_to_bedroom === 1,
      ensuiteFlag: loaded.world.flags.structural_ensuite === 1,
      room1: loaded.npcs[loaded.npcIds[0]].residency.room,
      room2: loaded.npcs[loaded.npcIds[1]].residency.room,
      bed2: loaded.npcs[loaded.npcIds[1]].residency.bed,
      day: loaded.meta.clock.day,
    };
  })()`);
  const r = await trip;
  check('player.money survived the round-trip', r.money === 7777, JSON.stringify(r));
  check('world.taxes.reserve survived the round-trip', r.taxReserve === 333);
  check('restored facility tier survived (pool upgraded)', r.poolUpgraded === true);
  check('structural flags survived (study + ensuite)', r.studyFlag === true && r.ensuiteFlag === true);
  check('roommate residencies survived (room + a non-default bed)', r.room1 === 'bedroom_1' && r.room2 === 'bedroom_2' && r.bed2 === 'B', JSON.stringify(r));
  check('day is still 1 after the full save/load round-trip (D19)', r.day === 1, `day=${r.day}`);

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})();
