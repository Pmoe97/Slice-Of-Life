// Dream Engine Phase 2 — the component tables.
// (src/ref/complete/dream-engine-plan.md)
//
// Phase 2 ships pure data and no logic at all, so this harness asserts
// INVARIANTS, never values (harness rule 2). Retuning a weight, rewriting a
// directive or adding a lens must leave every assertion below green; breaking
// the contract the compiler will select against must turn one red.
//
// The five things actually worth catching here, all of which fail silently or
// three phases later if they are not caught now:
//
//   - **The weightedPick trap.** SIM's weightedPick defaults to
//     `item.weight || 1`, so an entry authored `weight: 0` reads as weight 1 —
//     "never pick this" becomes "pick this as often as a normal entry". Every
//     weight in this file must therefore be strictly positive, and exclusion
//     must be a filter (napOnly, sfwGated), never a zero.
//   - **beats.length IS the panel count (D4).** Phase 4 builds one panel per
//     beat and Phase 6 generates one image per panel, so a form with four
//     beats quietly quadruples an image bill nobody authorised. Bounds are
//     asserted here, at the table, rather than at the compiler that trusts it.
//   - **The sfw gate (D17).** `erotic` must be the ONE entry in the whole file
//     carrying `sfwGated`, and it must be a filter flag rather than a low
//     weight — a low weight still fires eventually.
//   - **Weight-map completeness both ways.** Every register named in
//     DREAM_TUNING.registerWeights must exist, AND every register must be
//     named in every mode. One direction alone lets a new register default to
//     an unwritten 1.0 in all three settings and look deliberate.
//   - **D24 — the per-sleep chance has exactly one home.** It lives on
//     DREAM_FREQUENCIES in defs.settings.js. If a later session copies those
//     numbers into DREAM_TUNING "for tidiness", the two drift the first time
//     somebody edits one, so the duplicate is asserted against directly.
//
// Every assertion reads the live tables rather than restating their contents,
// so a later phase's authoring edits move them.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['defs.dreams.js', 'defs.settings.js', 'config.js', 'dreams.js', 'sim.js', 'state.js'] });

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
  // Every component table, by name, so the universal-contract assertions walk
  // the real set rather than a list this harness would have to keep in sync.
  // DREAM_TUNING is deliberately NOT here: it is the numbers table and does
  // not carry id/label/directive entries.
  function componentTables() {
    return [
      ['DREAM_FORMS', DREAM_FORMS],
      ['DREAM_PERSPECTIVES', DREAM_PERSPECTIVES],
      ['DREAM_TEMPO', DREAM_TEMPO],
      ['DREAM_REGISTERS', DREAM_REGISTERS],
      ['DREAM_LENSES', DREAM_LENSES],
      ['DREAM_DISTORTIONS', DREAM_DISTORTIONS],
      ['DREAM_MOTIFS', DREAM_MOTIFS],
    ];
  }
  // Flattened [tableName, key, entry] over every component table.
  function allEntries() {
    const out = [];
    for (const [name, table] of componentTables()) {
      for (const key of Object.keys(table)) out.push([name, key, table[key]]);
    }
    return out;
  }
  function idsOf(arr) { return arr.map(e => e.id).sort().join(','); }
  function keysOf(obj) { return Object.keys(obj || {}).sort().join(','); }
  function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
  // Deep walk looking for anything callable. D6's "pure data" is only true
  // while this returns nothing.
  function findFunctions(node, path, out) {
    if (typeof node === 'function') { out.push(path); return out; }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) findFunctions(node[k], path + '.' + k, out);
    }
    return out;
  }
  // Every object nested anywhere inside a value, for the D24 duplicate hunt.
  function everyObject(node, out) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      out.push(node);
      for (const k of Object.keys(node)) everyObject(node[k], out);
    }
    return out;
  }
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
`);

// Everything below needs `await`, which cannot sit at this file's top level
// alongside the `require()` above (Node treats that combination as ambiguous
// module syntax and refuses to guess CJS vs ESM) — one async main instead.
async function main() {

console.log('\n1. the tables exist and are keyed objects');

await check('all seven component tables plus DREAM_TUNING loaded from defs.dreams.js',
  api(`(() => {
    for (const [name, table] of componentTables()) {
      if (!table || typeof table !== 'object' || Array.isArray(table)) {
        return name + ' is not a keyed object (ACTION_DEFS shape, not a settings-style array)';
      }
      if (!Object.keys(table).length) return name + ' is empty';
    }
    if (typeof DREAM_TUNING !== 'object' || !DREAM_TUNING) return 'DREAM_TUNING is missing';
    if (!Object.keys(DREAM_TUNING).length) return 'DREAM_TUNING is still the Phase 1 empty stub';
    return true;
  })()`));

await check('the two band lists exist and are non-empty closed lists',
  api(`(() => {
    if (!Array.isArray(DREAM_ABSTRACTION_BANDS) || !DREAM_ABSTRACTION_BANDS.length) return 'DREAM_ABSTRACTION_BANDS missing';
    if (!Array.isArray(DREAM_WAKE_BANDS) || !DREAM_WAKE_BANDS.length) return 'DREAM_WAKE_BANDS missing';
    const dupA = DREAM_ABSTRACTION_BANDS.filter((b, i) => DREAM_ABSTRACTION_BANDS.indexOf(b) !== i);
    const dupW = DREAM_WAKE_BANDS.filter((b, i) => DREAM_WAKE_BANDS.indexOf(b) !== i);
    if (dupA.length || dupW.length) return 'duplicate band ids: ' + dupA.concat(dupW).join(',');
    return true;
  })()`));

console.log('\n2. the universal entry contract (D6)');

await check('every entry carries a non-empty id, label, directive and imageFragment',
  api(`(() => {
    for (const [name, key, e] of allEntries()) {
      const where = name + '.' + key;
      if (!e || typeof e !== 'object') return where + ' is not an object';
      for (const field of ['id', 'label', 'directive', 'imageFragment']) {
        if (!isNonEmptyString(e[field])) return where + ' has no ' + field;
      }
    }
    return true;
  })()`));

await check("every entry's id matches the key it is filed under",
  api(`(() => {
    for (const [name, key, e] of allEntries()) {
      if (e.id !== key) return name + '.' + key + " restates its id as '" + e.id + "'";
    }
    return true;
  })()`));

await check('THE WEIGHTEDPICK TRAP — every weight is a finite number strictly above zero',
  api(`(() => {
    // weightedPick(rng, items, fn) falls back to \`item.weight || 1\`, so a
    // zero weight is silently promoted to a normal one. "Never pick this"
    // must be expressed as a filter, never as a number.
    for (const [name, key, e] of allEntries()) {
      if (!Number.isFinite(e.weight)) return name + '.' + key + ' has a non-numeric weight: ' + e.weight;
      if (e.weight <= 0) return name + '.' + key + ' has weight ' + e.weight + ' — weightedPick reads 0 as 1';
    }
    return true;
  })()`));

await check('D6 PURITY — there is not a single function anywhere in the data',
  api(`(() => {
    const found = [];
    for (const [name, table] of componentTables()) findFunctions(table, name, found);
    findFunctions(DREAM_TUNING, 'DREAM_TUNING', found);
    return found.length === 0 || 'defs.dreams.js grew logic at: ' + found.join(', ');
  })()`));

console.log('\n3. DREAM_FORMS — beats ARE the panel count (D4)');

await check('every form has a beats array of 1 to 3 entries',
  api(`(() => {
    for (const key of Object.keys(DREAM_FORMS)) {
      const f = DREAM_FORMS[key];
      if (!Array.isArray(f.beats)) return key + ' has no beats array';
      if (f.beats.length < 1 || f.beats.length > 3) {
        // Each beat becomes one panel and one generated image (D4, D21).
        return key + ' declares ' + f.beats.length + ' beats — D4 caps a dream at 3 panels';
      }
    }
    return true;
  })()`));

await check('every beat has a unique id within its form, plus a directive and an image phrase',
  api(`(() => {
    for (const key of Object.keys(DREAM_FORMS)) {
      const f = DREAM_FORMS[key];
      const seen = [];
      for (const b of f.beats) {
        if (!isNonEmptyString(b.id)) return key + ' has a beat with no id';
        if (seen.includes(b.id)) return key + ' repeats beat id ' + b.id + ' — panels[].beat would be ambiguous';
        seen.push(b.id);
        // The beat directive is the ONLY per-panel instruction the writer
        // gets (Phase 5); the phrase is the per-panel half of the image
        // prompt (Phase 4's composeDreamPanelPrompt). Neither may be blank.
        if (!isNonEmptyString(b.directive)) return key + '.' + b.id + ' has no directive';
        if (!isNonEmptyString(b.phrase)) return key + '.' + b.id + ' has no image phrase';
      }
    }
    return true;
  })()`));

await check('every napOnly form is exactly one beat, and both sleep pools are non-empty (D16)',
  api(`(() => {
    const nap = Object.values(DREAM_FORMS).filter(f => f.napOnly === true);
    const night = Object.values(DREAM_FORMS).filter(f => !f.napOnly);
    if (!nap.length) return 'no napOnly forms — the nap path would have an empty pool';
    if (!night.length) return 'no night forms — every dream would be a nap fragment';
    for (const f of nap) {
      if (f.beats.length !== 1) return 'napOnly form ' + f.id + ' has ' + f.beats.length + ' beats; a nap is one panel (D16)';
    }
    // napOnly must be a boolean flag, not a truthy string, because Phase 4
    // filters on it and a stray '' would silently move a form to the night pool.
    for (const f of Object.values(DREAM_FORMS)) {
      if ('napOnly' in f && f.napOnly !== true) return f.id + ' has a non-true napOnly: ' + JSON.stringify(f.napOnly);
    }
    return true;
  })()`));

console.log('\n4. abstraction bands — tags and maps agree (D17)');

await check('every form, lens and distortion is tagged with a real abstraction band',
  api(`(() => {
    for (const [name, table] of [['DREAM_FORMS', DREAM_FORMS], ['DREAM_LENSES', DREAM_LENSES], ['DREAM_DISTORTIONS', DREAM_DISTORTIONS]]) {
      for (const key of Object.keys(table)) {
        const band = table[key].abstraction;
        if (!DREAM_ABSTRACTION_BANDS.includes(band)) {
          return name + '.' + key + " is tagged '" + band + "', which is not a DREAM_ABSTRACTION_BANDS entry";
        }
      }
    }
    return true;
  })()`));

await check('every band is actually reachable in each banded table, and in the nap-only pool',
  api(`(() => {
    // A band with no entries makes its multiplier dead weight, and a nap pool
    // that is all one band makes dreamAbstraction meaningless on naps.
    const pools = [
      ['DREAM_FORMS', Object.values(DREAM_FORMS)],
      ['DREAM_LENSES', Object.values(DREAM_LENSES)],
      ['DREAM_DISTORTIONS', Object.values(DREAM_DISTORTIONS)],
      ['DREAM_FORMS(napOnly)', Object.values(DREAM_FORMS).filter(f => f.napOnly === true)],
      ['DREAM_FORMS(night)', Object.values(DREAM_FORMS).filter(f => !f.napOnly)],
    ];
    for (const [name, pool] of pools) {
      for (const band of DREAM_ABSTRACTION_BANDS) {
        if (!pool.some(e => e.abstraction === band)) return name + " has no '" + band + "' entry";
      }
    }
    return true;
  })()`));

await check('abstractionWeights covers every mode and every band, in both directions',
  api(`(() => {
    const maps = DREAM_TUNING.abstractionWeights;
    if (!maps) return 'DREAM_TUNING.abstractionWeights is missing';
    if (keysOf(maps) !== idsOf(DREAM_ABSTRACTION_MODES)) {
      return 'modes disagree: DREAM_TUNING has [' + keysOf(maps) + '], DREAM_ABSTRACTION_MODES has [' + idsOf(DREAM_ABSTRACTION_MODES) + ']';
    }
    const wantBands = DREAM_ABSTRACTION_BANDS.slice().sort().join(',');
    for (const mode of Object.keys(maps)) {
      if (keysOf(maps[mode]) !== wantBands) {
        return "mode '" + mode + "' maps [" + keysOf(maps[mode]) + '] but the bands are [' + wantBands + ']';
      }
      for (const band of Object.keys(maps[mode])) {
        const w = maps[mode][band];
        if (!Number.isFinite(w) || w <= 0) return mode + '.' + band + ' is ' + w + ' — a multiplier must be finite and above zero';
      }
    }
    return true;
  })()`));

console.log('\n5. DREAM_REGISTERS — the wake tint (D12) and the sfw gate (D17)');

await check('every register names a real wake band and carries a finite mood and energy delta',
  api(`(() => {
    for (const key of Object.keys(DREAM_REGISTERS)) {
      const r = DREAM_REGISTERS[key];
      if (!DREAM_WAKE_BANDS.includes(r.band)) return key + " has band '" + r.band + "', which Phase 7 has no line for";
      if (!Number.isFinite(r.moodDelta)) return key + ' has a non-numeric moodDelta';
      if (!Number.isFinite(r.energyDelta)) return key + ' has a non-numeric energyDelta';
    }
    return true;
  })()`));

await check('D12 MAGNITUDES — no tint reaches a nap, let alone a good night',
  api(`(() => {
    // Read the real comparators out of config.js rather than restating them:
    // a dream colours a morning, it does not decide one. If dreaming ever
    // out-earns sleeping, the player starts optimising against this table and
    // D2's "a dream is deniable by construction" is gone.
    const napMood = ACTION_TUNING.napMoodGain;
    const napEnergy = ACTION_TUNING.napEnergyGain;
    const goodSleep = MOOD_PAYOUTS.goodSleep;
    for (const key of Object.keys(DREAM_REGISTERS)) {
      const r = DREAM_REGISTERS[key];
      if (Math.abs(r.moodDelta) > napMood) return key + ' moves mood by ' + r.moodDelta + ', more than a nap (' + napMood + ')';
      if (Math.abs(r.moodDelta) >= goodSleep) return key + ' moves mood by ' + r.moodDelta + ', at or past a good night (' + goodSleep + ')';
      if (Math.abs(r.energyDelta) >= napEnergy) return key + ' moves energy by ' + r.energyDelta + ', at or past a nap (' + napEnergy + ')';
    }
    return true;
  })()`));

await check('the tint runs both ways — at least one register lifts a morning and one sours it',
  api(`(() => {
    const vals = Object.values(DREAM_REGISTERS).map(r => r.moodDelta);
    if (!vals.some(v => v > 0)) return 'no register improves a morning';
    if (!vals.some(v => v < 0)) return 'no register costs anything — every dream would be a reward';
    return true;
  })()`));

await check('erotic exists, is flagged sfwGated, and is the ONLY gated entry in the file',
  api(`(() => {
    const gated = allEntries().filter(([, , e]) => e.sfwGated).map(([name, key]) => name + '.' + key);
    if (!DREAM_REGISTERS.erotic) return 'DREAM_REGISTERS.erotic is missing';
    if (DREAM_REGISTERS.erotic.sfwGated !== true) return 'erotic is not flagged sfwGated — a low weight still fires eventually';
    if (gated.length !== 1) return 'expected exactly one sfw-gated entry, found: ' + gated.join(', ');
    if (gated[0] !== 'DREAM_REGISTERS.erotic') return 'the gated entry is ' + gated[0];
    // The gate is a FILTER, so the entry must still carry a normal weight —
    // a gated entry with a suppressed weight would be quietly rare even with
    // sfwMode off, which is not what the setting says it does.
    if (DREAM_REGISTERS.erotic.weight <= 0) return 'erotic carries a non-positive weight';
    return true;
  })()`));

await check('registerWeights covers every mode and every register, in both directions',
  api(`(() => {
    const maps = DREAM_TUNING.registerWeights;
    if (!maps) return 'DREAM_TUNING.registerWeights is missing';
    if (keysOf(maps) !== idsOf(DREAM_REGISTER_MODES)) {
      return 'modes disagree: DREAM_TUNING has [' + keysOf(maps) + '], DREAM_REGISTER_MODES has [' + idsOf(DREAM_REGISTER_MODES) + ']';
    }
    const wantRegisters = keysOf(DREAM_REGISTERS);
    for (const mode of Object.keys(maps)) {
      // Both directions: an unknown id here is a typo that weights nothing,
      // and a MISSING id is a new register silently defaulting to 1.0 in all
      // three modes and looking deliberate.
      if (keysOf(maps[mode]) !== wantRegisters) {
        return "mode '" + mode + "' maps [" + keysOf(maps[mode]) + '] but DREAM_REGISTERS has [' + wantRegisters + ']';
      }
      for (const id of Object.keys(maps[mode])) {
        const w = maps[mode][id];
        if (!Number.isFinite(w) || w <= 0) return mode + '.' + id + ' is ' + w + ' — a multiplier must be finite and above zero';
      }
    }
    return true;
  })()`));

await check("the 'balanced' mode is neutral in both weight maps",
  api(`(() => {
    // Structural, not a tuning value: 'balanced' is the default and means
    // "do not bend the authored weights". If it ever carries a multiplier,
    // the base weights in the tables stop describing what actually happens.
    for (const [name, maps] of [['registerWeights', DREAM_TUNING.registerWeights], ['abstractionWeights', DREAM_TUNING.abstractionWeights]]) {
      const b = maps.balanced;
      if (!b) return name + ' has no balanced mode';
      for (const k of Object.keys(b)) {
        if (b[k] !== 1) return name + '.balanced.' + k + ' is ' + b[k] + ', not 1 — balanced must not bend the table';
      }
    }
    return true;
  })()`));

await check('every dream settings default resolves to a real key in its weight map',
  api(`(() => {
    // The runtime-throw check: Phase 4 indexes these maps by the live setting.
    if (!DREAM_TUNING.registerWeights[SETTINGS_DEFAULTS.dreamRegister]) {
      return "SETTINGS_DEFAULTS.dreamRegister is '" + SETTINGS_DEFAULTS.dreamRegister + "' with no registerWeights entry";
    }
    if (!DREAM_TUNING.abstractionWeights[SETTINGS_DEFAULTS.dreamAbstraction]) {
      return "SETTINGS_DEFAULTS.dreamAbstraction is '" + SETTINGS_DEFAULTS.dreamAbstraction + "' with no abstractionWeights entry";
    }
    return true;
  })()`));

console.log('\n6. DREAM_TUNING — the numbers');

await check('every cap is a positive integer, and the diary is larger than the queue',
  api(`(() => {
    for (const k of ['queueCap', 'diaryCap', 'motifHistoryCap', 'consumedEventCap']) {
      const v = DREAM_TUNING[k];
      if (!Number.isInteger(v) || v < 1) return k + ' is ' + v + ' — caps are positive integers';
    }
    if (DREAM_TUNING.diaryCap <= DREAM_TUNING.queueCap) {
      return 'diaryCap (' + DREAM_TUNING.diaryCap + ') is not larger than queueCap (' + DREAM_TUNING.queueCap + ')';
    }
    return true;
  })()`));

await check('every probability sits in (0, 1]',
  api(`(() => {
    for (const k of ['napChanceMult', 'motifCarryChance', 'trueDreamChance', 'recurrenceChance']) {
      const v = DREAM_TUNING[k];
      if (!Number.isFinite(v) || v <= 0 || v > 1) return k + ' is ' + v + ' — probabilities live in (0, 1]';
    }
    return true;
  })()`));

await check('the paired bounds are the right way round',
  api(`(() => {
    if (!(DREAM_TUNING.residuePickMin <= DREAM_TUNING.residuePickMax)) {
      return 'residuePickMin ' + DREAM_TUNING.residuePickMin + ' > residuePickMax ' + DREAM_TUNING.residuePickMax;
    }
    if (!(DREAM_TUNING.panelWordMin < DREAM_TUNING.panelWordMax)) {
      return 'panelWordMin ' + DREAM_TUNING.panelWordMin + ' is not below panelWordMax ' + DREAM_TUNING.panelWordMax;
    }
    for (const k of ['residueDays', 'residuePickMin', 'residuePickMax', 'castMax', 'panelWordMin', 'panelWordMax']) {
      if (!Number.isInteger(DREAM_TUNING[k]) || DREAM_TUNING[k] < 1) return k + ' is ' + DREAM_TUNING[k];
    }
    return true;
  })()`));

console.log('\n7. D24 — the per-sleep chance has exactly one home');

await check('DREAM_FREQUENCIES still owns the real chances, with off as a hard zero',
  api(`(() => {
    for (const f of DREAM_FREQUENCIES) {
      if (!Number.isFinite(f.chance) || f.chance < 0 || f.chance > 1) return f.id + ' has chance ' + f.chance;
    }
    const off = DREAM_FREQUENCIES.find(f => f.id === 'off');
    if (!off) return "there is no 'off' frequency";
    if (off.chance !== 0) return "'off' has chance " + off.chance + ' — it must be a hard stop';
    return true;
  })()`));

await check('DREAM_TUNING does NOT restate them (the duplicate-number tripwire)',
  api(`(() => {
    // If a later session copies the frequency chances into DREAM_TUNING, the
    // copy shows up as an object keyed by exactly the DREAM_FREQUENCIES ids.
    // The two would then have to be kept in agreement by hand, which is the
    // failure this plan names in three separate places.
    const freqIds = idsOf(DREAM_FREQUENCIES);
    for (const obj of everyObject(DREAM_TUNING, [])) {
      if (keysOf(obj) === freqIds) return 'DREAM_TUNING now carries a copy of the DREAM_FREQUENCIES chances — D24 says one home, not two';
    }
    return true;
  })()`));

console.log('\n8. DREAM_MOTIFS — the carryover anchor (D10)');

await check('every motif carries the distinct `text` clause that persists into motifHistory',
  api(`(() => {
    const seen = [];
    for (const key of Object.keys(DREAM_MOTIFS)) {
      const m = DREAM_MOTIFS[key];
      // motifHistory stores { motifId, text, dreamId, day } — a motif with no
      // text carries into a later dream as an empty anchor and reads as a bug
      // in the writer rather than in this table.
      if (!isNonEmptyString(m.text)) return key + ' has no text clause';
      if (seen.includes(m.text)) return 'two motifs share the same text: ' + m.text;
      seen.push(m.text);
    }
    return Object.keys(DREAM_MOTIFS).length >= 2 || 'a carryover pool needs more than one motif';
  })()`));

console.log('\n9. inertness — a data-only phase changes no clock, needs or save shape');

await check('resolveTick still leaves world.dreams untouched and time/energy unchanged',
  api(`(() => {
    const withDreams = house('tables-inert', 2);
    const without = house('tables-inert', 2);
    delete without.world.dreams;
    const before = JSON.stringify(withDreams.world.dreams);
    for (let i = 0; i < 12; i++) { resolveTick(withDreams); resolveTick(without); }
    if (JSON.stringify(withDreams.world.dreams) !== before) {
      return 'the sim mutated world.dreams — design invariant 2 (reads everything, writes nothing)';
    }
    if (withDreams.meta.clock.day !== without.meta.clock.day || withDreams.meta.clock.minutes !== without.meta.clock.minutes) {
      return 'the clock diverged: ' + JSON.stringify(withDreams.meta.clock) + ' vs ' + JSON.stringify(without.meta.clock);
    }
    if (withDreams.player.energy !== without.player.energy) {
      return 'player energy diverged: ' + withDreams.player.energy + ' vs ' + without.player.energy;
    }
    return true;
  })()`));

await check('nothing in the tables leaked into the persisted save shape',
  api(`(() => {
    // Phase 2 is authored data. If a table id ever ends up in defaultDreamState,
    // the tables have become state and retuning them would break old saves.
    const d = defaultDreamState();
    const keys = Object.keys(d).sort().join(',');
    const want = ['queue','diary','motifHistory','consumedEventIds','lastDreamDay','nextIndex'].sort().join(',');
    return keys === want || 'defaultDreamState drifted in a data-only phase: ' + keys;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
