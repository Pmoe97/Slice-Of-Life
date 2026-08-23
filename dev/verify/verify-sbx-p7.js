// Seasonal Calendar & Sandbox Plan — Phase B7 (final): tutorial suppression +
// the day-1 audit (D19's assert-don't-rebase guard).
//
// Two halves:
//  * D20 — a suppressTutorial sandbox pre-fires every one-shot contractor flag
//    so the tutorial beats cannot trip on day 1 (a restored house starts above
//    the quality threshold). The ids are derived from CONTRACTOR_TUTORIAL_MILESTONES
//    keys — the one table that owns them — not an enumerated list here.
//  * D19 — applySandboxPreset must leave every day-shaped field byte-identical to
//    a fresh SIM_generateHouse: meta.clock.day (=== 1), player.rentDueDay,
//    each world.bills[id].dueDay, world.taxes.lastQuarterBilled and
//    gigs.lastRefreshDay. The in-function guard throws if any moved; this harness
//    diffs a heaviest sandbox against a plain solo start and asserts nothing
//    day-shaped differs, and exercises the guard directly.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  makeMemKv = function() {
    // A genuine kv-plugin-shaped root: every folder name resolves to a handle over
    // the SAME underlying store whether reached as root.kv[folder] (the form
    // state.js's writeGeneratedGameState/loadGameState use) — set/get/update/
    // keys/delete all present, backed by one shared objects map.
    const stores = {};
    const handle = (store) => ({
      get: async (k) => (k in store ? JSON.parse(JSON.stringify(store[k])) : null),
      set: async (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
      setMany: async (e) => { for (const [k, v] of e) store[k] = JSON.parse(JSON.stringify(v)); },
      getMany: async (ks) => ks.map(k => (k in store ? JSON.parse(JSON.stringify(store[k])) : null)),
      update: async (k, fn) => { store[k] = fn(k in store ? JSON.parse(JSON.stringify(store[k])) : undefined); },
      keys: async () => Object.keys(store),
      delete: async (k) => { delete store[k]; },
    });
    return new Proxy({}, {
      get: (t, name) => (name === 'then' ? undefined : (stores[name] = stores[name] || {}) && handle(stores[name])),
    });
  };
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
`);

// The day-shaped fields D19 says must never move. Same derivation
// snapshotSandboxDayFields uses, so this list can't drift from the guard.
function dayFields(gs) {
  const out = { day: gs.meta.clock.day, rentDueDay: gs.player.rentDueDay,
               taxBilled: gs.world.taxes.lastQuarterBilled,
               gigRefresh: gs.world.computer.apps.gigs.lastRefreshDay, bills: {} };
  for (const id of Object.keys(gs.world.bills)) out.bills[id] = gs.world.bills[id].dueDay;
  return out;
}
function strip(a, b) {
  const d = {};
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d[k] = [b[k], a[k]];
  return d;
}

// ---------------------------------------------------------------- 1
console.log('\n1. D20 — tutorial/milestone flags pre-fired by a suppressTutorial sandbox');

{
  const ids = api('Object.keys(CONTRACTOR_TUTORIAL_MILESTONES)');
  const expect = ['renofixOpened', 'tutorialJobBooked', 'tutorialJobComplete',
                'firstPaidJobBooked', 'firstUpgradeJobBooked', 'firstRoommateMovedIn',
                'qualityThreshold'];
  const missing = expect.filter(x => !ids.includes(x));
  const extra = ids.filter(x => !expect.includes(x));
  check('CONTRACTOR_TUTORIAL_MILESTONES has exactly the 7 milestone ids (grep-derived set)',
        missing.length === 0 && extra.length === 0,
        `missing=${missing} extra=${extra}`);

  // suppressTutorial default-on (flags: { suppressTutorial: true }).
  const on = api(`applySandboxPreset(house(20260822, 0), { house: { preset: 'restored' }, flags: { suppressTutorial: true } })`);
  const flagsOn = Object.keys(on.world.flags).filter(k => k.startsWith('tutorial_'));
  const missingOn = ids.filter(id => on.world.flags['tutorial_' + id] !== true);
  check('suppressTutorial: every milestone flag is set (incl. tutorial_qualityThreshold the ui.js guard reads)',
        missingOn.length === 0 && flagsOn.length === ids.length,
        `flags=[${flagsOn}] missing=${missingOn}`);

  // suppressTutorial OFF — flags untouched.
  const off = api(`applySandboxPreset(house(20260822, 0), { house: { preset: 'restored' }, flags: { suppressTutorial: false } })`);
  const flagsOff = Object.keys(off.world.flags || {}).filter(k => k.startsWith('tutorial_'));
  check('suppressTutorial false: no tutorial flag pre-set (the beat still fires)',
        flagsOff.length === 0, `flags=[${flagsOff}]`);
}

// ---------------------------------------------------------------- 2
console.log('\n2. D19 — heaviest sandbox vs a plain solo start: nothing day-shaped differs');

{
  const seed = 202608227;
  const solo = api(`house(${seed}, 0)`);
  const heavy = api(`applySandboxPreset(house(${seed}, 7), {
    house: { preset: 'restored', structural: { kitchen_hall_door: true, pool_window: true, study_to_bedroom: true, ensuite: true, dining_doors: true } },
    roommates: [
      { residency: { room: 'bedroom_1', bed: null } }, { residency: { room: 'bedroom_2', bed: null } },
      { residency: { room: 'bedroom_3', bed: null } }, { residency: { room: 'study', bed: null } },
      { residency: { room: 'bedroom_1', bed: null } }, { residency: { room: 'bedroom_2', bed: null } },
      { residency: { room: 'bedroom_3', bed: null } },
    ],
    economy: { money: 99999, taxReserve: 5000 },
    flags: { suppressTutorial: true },
  })`);
  const d = strip(dayFields(heavy), dayFields(solo));
  const dayKeys = Object.keys(d);
  check('sandbox day is 1, solo day is 1', dayFields(heavy).day === 1 && dayFields(solo).day === 1,
        JSON.stringify(dayFields(heavy)));
  check('zero day-shaped differences across the full heaviest sandbox vs plain solo (D19)',
        dayKeys.length === 0, JSON.stringify(d));
  check('all seven bills present with a dueDay each', Object.keys(dayFields(heavy).bills).length === 7,
        JSON.stringify(dayFields(heavy).bills));
}

// ---------------------------------------------------------------- 3
console.log('\n3. D19 guard fires (assert, don\'t rebase)');

{
  // The heaviest sandbox path itself must NOT throw (the normal case).
  let threw = null;
  try { api(`applySandboxPreset(house(20260822, 2), { house: { preset: 'restored' }, flags: { suppressTutorial: true } })`); }
  catch (e) { threw = e.message; }
  check('a valid heaviest sandbox passes the guard (no throw)', threw === null, threw || '');

  // Rebasing day to 5 must throw with a D19 message.
  let threw5 = null, msg5 = '';
  try { api(`g = house(20260822, 1); g.clock.day = 5; try { applySandboxPreset(g, { house: { preset: 'restored' } }); 'no-throw'; } catch (e) { e.message; }`) }
  catch (e) { threw5 = e.message; }
  check('day !== 1 throws (D19)', threw5 && /D19/.test(threw5), threw5 || 'no throw');
}

// ---------------------------------------------------------------- 4
console.log('\n4. Round-trip: tutorial flags + day fields survive write → load');

(async () => {
  const r = await api(`(async () => {
    root.kv = makeMemKv();
    const gs = house(20260822, 1);
    applySandboxPreset(gs, { house: { preset: 'restored' }, flags: { suppressTutorial: true } });
    await writeGeneratedGameState(gs);
    await forceFlush();
    const loaded = await loadGameState();
    const tuts = Object.keys(loaded.world.flags || {}).filter(k => k.startsWith('tutorial_')).sort();
    return {
      tuts,
      day: loaded.meta.clock.day,
      rentDueDay: loaded.player.rentDueDay,
      taxBilled: loaded.world.taxes.lastQuarterBilled,
      gigRefresh: loaded.world.computer.apps.gigs.lastRefreshDay,
      bills: Object.keys(loaded.world.bills).map(id => loaded.world.bills[id].dueDay).sort((a,b)=>a-b),
    };
  })()`);
  const ids = api('Object.keys(CONTRACTOR_TUTORIAL_MILESTONES).length');
  check('all tutorial flags survived the save/load round-trip', r && r.tuts && r.tuts.length === ids,
        r ? JSON.stringify(r.tuts) : 'null');
  check('day, rentDueDay, taxBilled and gigRefresh all still day-1-shaped after round-trip',
        r && r.day === 1 && r.rentDueDay && r.day < r.rentDueDay && r.taxBilled === -1 && r.gigRefresh === 0,
        r ? JSON.stringify(r) : 'null');
  check('bills all still carry a dueDay (none rebased to 1)', r && r.bills && r.bills.length === 7 && r.bills.every(b => b >= 8),
        r ? JSON.stringify(r.bills) : 'null');

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})();
