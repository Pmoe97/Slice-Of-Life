// Dream Engine Phase 1 — state, settings, and registration.
// (src/ref/complete/dream-engine-plan.md)
//
// Phase 1 ships no dream logic at all: it lands the persisted subtree, the
// three player-facing sliders, and the two new files in BOTH registration
// lists. So this harness checks the wiring, which is exactly the part that
// fails silently:
//
//   - `required: ['dreams.js', 'defs.dreams.js']` makes loadEngine THROW if
//     either file is missing from ORDER. That single line is the rumination.js
//     scar's tripwire — that file shipped registered in index.html only, and
//     took five harnesses and 175 assertions down without a word.
//   - The REAL write/load round trip through writeGeneratedGameState ->
//     loadGameState, against an in-memory kv (the makeMemKv pattern the food
//     harnesses established). This is the one assertion that catches the
//     castWeb scar: `dreams` must be in state.js's SAVE_KEYS *and* read back
//     in loadGameState's world literal. With only the first, everything
//     writes fine all session and reads back empty forever, and no amount of
//     reading the code makes that visible.
//   - world.dreams is INERT under the sim (design invariant 2: a dream reads
//     everything and writes nothing). Phase 1 adds no sleep hook, so the
//     honest clock/needs assertion is that resolveTick neither touches the
//     subtree nor resolves time or energy any differently for its presence.
//   - The three settings fields round-trip through normalizeSettings, and
//     every dream cycle row's options table actually contains that field's
//     default — a cycle row whose options can't resolve the stored value
//     renders a blank tile forever (the guard imageStyle/theme already carry).
//
// Assertions read the live tables (SAVE_KEYS, SETTINGS_DEFAULTS, SETTINGS_TABS)
// rather than restating their contents, so a later phase's edits move them.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'state.js', 'sim.js', 'defs.settings.js', 'settings.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts — a truthy failure-message
  // string must never read as a pass (the 2026-08-18 food Phase 7 fix).
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
      h.npcs[id].needs = h.npcs[id].needs || {};
    }
    h.player.flags = {};
    h.player.inventory = h.player.inventory || [];
    h.player.moodEvents = [];
    h.player.meta = h.player.meta || {};
    return h;
  }
  // The in-memory kv the food harnesses use, so writeGeneratedGameState and
  // loadGameState run for real rather than against the loader's {} stub.
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      m.entries = async () => Object.entries(stores[name] || {}).map(([k, v]) => [k, structuredClone(v)]);
      m.values = async () => Object.values(stores[name] || {}).map(v => structuredClone(v));
      m.getMany = async (ks) => Promise.all(ks.map(k => m.get(k)));
      m.setMany = async (pairs) => { for (const [k, v] of pairs) await m.set(k, v); };
      m.deleteMany = async (ks) => { for (const k of ks) await m.delete(k); };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex', 'menu', 'pendingOp', 'kv']) kv[f] = wrap(f);
    return kv;
  }
  function worldKeys() {
    return (SAVE_KEYS.find(e => e.folder === 'world') || {}).keys || [];
  }
  // Every row in every settings tab, flattened.
  function allSettingsRows() {
    const out = [];
    for (const tab of SETTINGS_TABS) {
      for (const sec of (tab.sections || [])) {
        for (const row of (sec.rows || [])) out.push(row);
      }
    }
    return out;
  }
`);

// Everything below needs `await`, which cannot sit at this file's top level
// alongside the `require()` above (Node treats that combination as ambiguous
// module syntax and refuses to guess CJS vs ESM) — one async main instead.
async function main() {

console.log('\n1. registration — both files load, in both lists');

await check('defs.dreams.js and dreams.js are in loadgame.js ORDER and loaded cleanly',
  api(`(() => {
    if (typeof defaultDreamState !== 'function') return 'dreams.js did not load (defaultDreamState missing)';
    if (typeof normalizeDreamState !== 'function') return 'dreams.js loaded without normalizeDreamState';
    if (typeof DREAM_TUNING === 'undefined') return 'defs.dreams.js did not load (DREAM_TUNING missing)';
    return true;
  })()`));

console.log('\n2. defaultDreamState — the D-model shape');

await check('the subtree has exactly the six documented fields, empty and at index 1',
  api(`(() => {
    const d = defaultDreamState();
    const keys = Object.keys(d).sort().join(',');
    const want = ['queue','diary','motifHistory','consumedEventIds','lastDreamDay','nextIndex'].sort().join(',');
    if (keys !== want) return 'field set drifted: got ' + keys;
    for (const k of ['queue','diary','motifHistory','consumedEventIds']) {
      if (!Array.isArray(d[k])) return k + ' is not an array';
      if (d[k].length !== 0) return k + ' does not start empty';
    }
    if (d.lastDreamDay !== null) return 'lastDreamDay should start null, got ' + d.lastDreamDay;
    // nextIndex feeds the per-dream seed (D5) and must never start at 0 —
    // hashStr('dream|0') would be a real, reusable seed for "no dream yet".
    if (d.nextIndex !== 1) return 'nextIndex should start at 1, got ' + d.nextIndex;
    return true;
  })()`));

await check('two calls return independent objects (no shared array across saves)',
  api(`(() => {
    const a = defaultDreamState(), b = defaultDreamState();
    a.diary.push({ id: 'x' });
    if (b.diary.length !== 0) return 'the diary array is shared between calls';
    return true;
  })()`));

console.log('\n3. normalizeDreamState — a malformed subtree degrades, never throws');

await check('garbage of every shape returns the default rather than throwing',
  api(`(() => {
    for (const bad of [null, undefined, 0, '', 'nope', true]) {
      let got;
      try { got = normalizeDreamState(bad); }
      catch (e) { return 'threw on ' + JSON.stringify(bad) + ': ' + e.message; }
      if (JSON.stringify(got) !== JSON.stringify(defaultDreamState())) {
        return 'did not default on ' + JSON.stringify(bad) + ': ' + JSON.stringify(got);
      }
    }
    return true;
  })()`));

await check('real data survives untouched, and non-array containers become arrays',
  api(`(() => {
    const rec = { id: 'd1' };
    const good = normalizeDreamState({
      queue: [rec], diary: [rec, rec], motifHistory: [{ motifId: 'payphone' }],
      consumedEventIds: ['e1'], lastDreamDay: 7, nextIndex: 12,
    });
    if (good.queue.length !== 1 || good.diary.length !== 2) return 'array contents lost';
    if (good.motifHistory[0].motifId !== 'payphone') return 'motif record mangled';
    if (good.lastDreamDay !== 7) return 'lastDreamDay lost';
    if (good.nextIndex !== 12) return 'nextIndex lost';
    const bent = normalizeDreamState({ queue: 'nope', diary: {}, motifHistory: 3, consumedEventIds: null, lastDreamDay: 'soon', nextIndex: -4 });
    for (const k of ['queue','diary','motifHistory','consumedEventIds']) {
      if (!Array.isArray(bent[k]) || bent[k].length !== 0) return k + ' did not degrade to []';
    }
    if (bent.lastDreamDay !== null) return 'a non-numeric lastDreamDay should degrade to null';
    // A zero or negative nextIndex would collide with a seed already spent.
    if (bent.nextIndex !== 1) return 'a negative nextIndex should degrade to 1, got ' + bent.nextIndex;
    return true;
  })()`));

console.log('\n4. persistence wiring — both halves, or it reads back empty forever');

await check('world.dreams is listed in state.js SAVE_KEYS (the WRITE half)',
  api(`(() => worldKeys().includes('dreams') || 'SAVE_KEYS world folder: ' + worldKeys().join(','))()`));

await check('WORLD_KEY_FALLBACKS.dreams returns the default shape (old saves, no migration)',
  api(`(() => {
    if (typeof WORLD_KEY_FALLBACKS.dreams !== 'function') return 'no fallback registered';
    const got = JSON.stringify(WORLD_KEY_FALLBACKS.dreams());
    const want = JSON.stringify(defaultDreamState());
    return got === want || 'fallback drifted from defaultDreamState: ' + got;
  })()`));

await check('buildGameState stamps world.dreams on a brand-new game',
  api(`(() => {
    const h = house('dreams-p1-new', 2);
    if (!h.world.dreams) return 'a new house has no world.dreams';
    return JSON.stringify(h.world.dreams) === JSON.stringify(defaultDreamState())
      || 'new-game shape drifted: ' + JSON.stringify(h.world.dreams);
  })()`));

await check('THE CASTWEB CHECK — a populated world.dreams survives the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-dreams', clock: { day: 1, minutes: 0 } });
    const h = house('rt-dreams', 1);
    // Put something in every field, so a half-wired read-back cannot pass by
    // coincidentally matching the empty default.
    h.world.dreams.queue.push({ id: 'q1', seed: 42, status: 'rendered' });
    h.world.dreams.diary.push({ id: 'd1', panels: [{ prompt: 'a payphone in the hall', seed: 7 }] });
    h.world.dreams.motifHistory.push({ motifId: 'payphone', text: 'a payphone', dreamId: 'd1', day: 3 });
    h.world.dreams.consumedEventIds.push('evt_9');
    h.world.dreams.lastDreamDay = 3;
    h.world.dreams.nextIndex = 5;
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const d = loaded.world.dreams;
    if (!d) return 'world.dreams is missing after load — SAVE_KEYS has it but loadGameState never reads it back';
    if (!d.queue || d.queue.length !== 1 || d.queue[0].id !== 'q1') return 'queue lost: ' + JSON.stringify(d.queue);
    if (!d.diary || d.diary.length !== 1) return 'diary lost: ' + JSON.stringify(d.diary);
    // D14: a panel record persists prompt+seed and never a blob.
    if (d.diary[0].panels[0].prompt !== 'a payphone in the hall') return 'panel prompt lost';
    if (d.diary[0].panels[0].seed !== 7) return 'panel seed lost';
    if (d.motifHistory.length !== 1 || d.motifHistory[0].motifId !== 'payphone') return 'motifHistory lost';
    if (d.consumedEventIds[0] !== 'evt_9') return 'consumedEventIds lost';
    if (d.lastDreamDay !== 3) return 'lastDreamDay lost: ' + d.lastDreamDay;
    if (d.nextIndex !== 5) return 'nextIndex lost: ' + d.nextIndex;
    return true;
  })()`));

await check('a save written before this existed (no dreams key at all) loads with the default',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-dreams-old', clock: { day: 1, minutes: 0 } });
    const h = house('rt-dreams-old', 1);
    await writeGeneratedGameState(h);
    await forceFlush();
    // Simulate the pre-Phase-1 save: drop the key entirely, as an older
    // build's SAVE_KEYS loop would have left it.
    await root.kv.world.delete('dreams');
    const loaded = await loadGameState();
    return JSON.stringify(loaded.world.dreams) === JSON.stringify(defaultDreamState())
      || 'an old save did not backfill the default: ' + JSON.stringify(loaded.world.dreams);
  })()`));

console.log('\n5. inertness — Phase 1 changes no clock or needs accounting');

await check('resolveTick neither reads nor writes world.dreams, and time/energy resolve unchanged',
  api(`(() => {
    const withDreams = house('inert-a', 2);
    const without = house('inert-a', 2);
    delete without.world.dreams;
    const before = JSON.stringify(withDreams.world.dreams);
    for (let i = 0; i < 12; i++) { resolveTick(withDreams); resolveTick(without); }
    if (JSON.stringify(withDreams.world.dreams) !== before) {
      return 'the sim mutated world.dreams — design invariant 2 (reads everything, writes nothing)';
    }
    // Same seed, same ticks: the subtree's presence must not perturb the sim
    // by one minute or one point of energy. Anything else means Phase 1 leaked.
    if (withDreams.meta.clock.day !== without.meta.clock.day ||
        withDreams.meta.clock.minutes !== without.meta.clock.minutes) {
      return 'the clock diverged: ' + JSON.stringify(withDreams.meta.clock) + ' vs ' + JSON.stringify(without.meta.clock);
    }
    if (withDreams.player.energy !== without.player.energy) {
      return 'player energy diverged: ' + withDreams.player.energy + ' vs ' + without.player.energy;
    }
    return true;
  })()`));

console.log('\n6. the three settings fields (D17)');

await check('all three fields exist in SETTINGS_DEFAULTS and default to a real option id',
  api(`(() => {
    const pairs = [
      ['dreamFrequency', DREAM_FREQUENCIES],
      ['dreamRegister', DREAM_REGISTER_MODES],
      ['dreamAbstraction', DREAM_ABSTRACTION_MODES],
    ];
    for (const [field, table] of pairs) {
      const def = SETTINGS_DEFAULTS[field];
      if (def === undefined) return field + ' is missing from SETTINGS_DEFAULTS';
      if (!table.some(o => o.id === def)) return field + " default '" + def + "' is not an id in its own option table";
      const ids = table.map(o => o.id);
      if (new Set(ids).size !== ids.length) return field + " option table has duplicate ids";
    }
    return true;
  })()`));

await check('the fields are FLAT, as doSettingsCycle requires (D17)',
  api(`(() => {
    for (const f of ['dreamFrequency', 'dreamRegister', 'dreamAbstraction']) {
      if (typeof SETTINGS_DEFAULTS[f] !== 'string') return f + ' is not a flat string field';
    }
    return true;
  })()`));

await check("'off' is a real dreamFrequency option and is the only zero-chance one",
  api(`(() => {
    const off = DREAM_FREQUENCIES.find(f => f.id === 'off');
    if (!off) return "no 'off' option — the player cannot turn dreams off";
    if (off.chance !== 0) return "'off' has a non-zero chance: " + off.chance;
    const zeros = DREAM_FREQUENCIES.filter(f => !f.chance);
    if (zeros.length !== 1) return 'more than one zero-chance frequency: ' + zeros.map(z => z.id).join(',');
    // Frequencies must be strictly increasing, or the labels lie.
    const ch = DREAM_FREQUENCIES.map(f => f.chance);
    for (let i = 1; i < ch.length; i++) if (!(ch[i] > ch[i-1])) return 'chances are not strictly increasing: ' + ch.join(',');
    return true;
  })()`));

await check('normalizeSettings rejects a bogus stored id and keeps a valid one',
  api(`(() => {
    const bogus = normalizeSettings({ ...SETTINGS_DEFAULTS, dreamFrequency: 'wildly', dreamRegister: 42, dreamAbstraction: null });
    if (bogus.dreamFrequency !== SETTINGS_DEFAULTS.dreamFrequency) return 'bogus dreamFrequency survived: ' + bogus.dreamFrequency;
    if (bogus.dreamRegister !== SETTINGS_DEFAULTS.dreamRegister) return 'bogus dreamRegister survived: ' + bogus.dreamRegister;
    if (bogus.dreamAbstraction !== SETTINGS_DEFAULTS.dreamAbstraction) return 'bogus dreamAbstraction survived: ' + bogus.dreamAbstraction;
    const kept = normalizeSettings({ ...SETTINGS_DEFAULTS, dreamFrequency: 'often', dreamRegister: 'charged', dreamAbstraction: 'surreal' });
    if (kept.dreamFrequency !== 'often' || kept.dreamRegister !== 'charged' || kept.dreamAbstraction !== 'surreal') {
      return 'a valid stored value was clobbered: ' + JSON.stringify(kept);
    }
    return true;
  })()`));

await check('mergeSettings round-trips a changed slider (the menu close/open path)',
  api(`(() => {
    // What setSettings -> load does: stored object merged over the defaults.
    const stored = { dreamFrequency: 'rare', dreamAbstraction: 'grounded' };
    const out = mergeSettings(stored, null);
    if (out.dreamFrequency !== 'rare') return 'dreamFrequency did not survive the merge';
    if (out.dreamAbstraction !== 'grounded') return 'dreamAbstraction did not survive the merge';
    if (out.dreamRegister !== SETTINGS_DEFAULTS.dreamRegister) return 'an untouched field lost its default';
    return true;
  })()`));

console.log('\n7. the settings rows resolve (a cycle row whose options miss its value is a blank tile)');

await check('each dream row is a cycle row on a real field with a resolvable options table',
  api(`(() => {
    const rows = allSettingsRows().filter(r => ['dreamFrequency','dreamRegister','dreamAbstraction'].includes(r.field));
    if (rows.length !== 3) return 'expected 3 dream rows in SETTINGS_TABS, found ' + rows.length;
    for (const row of rows) {
      if (row.kind !== 'cycle') return row.field + ' row is kind ' + row.kind + ', not cycle';
      // doSettingsCycle dispatches on this id, and design invariant 1 says
      // every row action must be one MENU_ACTIONS already knows.
      if (row.action !== 'settings.cycle') return row.field + " row action is '" + row.action + "'";
      if (!Array.isArray(row.options) || !row.options.length) return row.field + ' row has no options';
      if (!row.options.some(o => o.id === SETTINGS_DEFAULTS[row.field])) {
        return row.field + " row options do not contain its own default — it would render a blank tile";
      }
      if (!row.id || !row.label || !row.desc) return row.field + ' row is missing id/label/desc';
    }
    return true;
  })()`));

await check('the dream rows have unique ids across the whole settings config',
  api(`(() => {
    const ids = allSettingsRows().map(r => r.id).filter(Boolean);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    return dupes.length === 0 || 'duplicate settings row ids: ' + [...new Set(dupes)].join(',');
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
