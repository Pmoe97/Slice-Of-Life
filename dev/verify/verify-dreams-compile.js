// Dream Engine Phase 4 — the compiler.
// (src/ref/complete/dream-engine-plan.md)
//
// compileDream is the load-bearing half of the anti-slop thesis (D1): form,
// perspective, tempo, register, lens, distortion, setting, cast, motif and
// panel count are ALL decided here, by a seeded roll over defs.dreams.js,
// before the model has been shown anything at all. So the assertions below
// aim at four things and nothing else:
//
//   DETERMINISM  — same seed + same state in, deep-equal record out, across
//                  repeats, across two independently built copies of one
//                  save, and across a real save/load round trip (D5).
//   ISOLATION    — the compiler's RNG is its own. Rolling the global cast
//                  generator before and after a thousand compiles must give
//                  byte-identical output, or every existing seed's house has
//                  just moved (design invariant 5).
//   PURITY       — it reads omnisciently and writes nothing, including to
//                  world.dreams (design invariant 2).
//   THE CONTRACT — every slot is a real table id, panels.length is the form's
//                  beat count for every form in the table, a nap only ever
//                  draws a one-panel napOnly form, and sfwMode removes the
//                  erotic register outright rather than softening it.
//
// Like verify-dreams-residue.js this harness asserts INVARIANTS, never
// phrasing: "the panel prompt names the lens's fragment", not "the prompt is
// exactly this string". Retuning a weight or rewriting a directive leaves it
// green; breaking the contract does not.
const { loadEngine } = require('./loadgame.js');
// image.js is deliberately NOT in `required`: its very last statement is a
// window.addEventListener the vm's window shim has no method for, so the
// loader records it as failed even though every function declaration in it is
// hoisted and every const above that line has already run. The registration
// check below asserts the four symbols this phase actually needs by name,
// which is a stricter test than the loader's all-or-nothing one.
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

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
  // A save with enough real material in it that the compiler has something to
  // cast from: two resident NPCs, one former resident (the D22 filter's
  // negative control), a ledger, a grievance, an absence, an unseen event and
  // an owned item. Hand-built rather than generated so the expectations are
  // exact.
  function fixture(over) {
    const gs = {
      meta: { seed: 'compile-fixture', clock: { day: 10, minutes: 1380 }, sessionLog: [] },
      player: {
        energy: 60,
        location: 'bedroom_player',
        clothing: 'dressed',
        bible: {
          name: 'Wren', age: 27, gender: 'female', species: 'human',
          physical: {
            hair: { color: 'black', length: 'short', texture: 'straight', style: 'blunt' },
            eyes: { color: 'grey', shape: 'almond' },
            skin: { tone: 'olive', texture: 'clear' },
            face: { shape: 'oval', nose: 'straight', lips: 'full' },
            body: { shape: 'lean' },
          },
        },
        inventory: [{ defId: 'coffee_mug', qty: 1, ownerId: 'player', meta: {} }],
        ledger: {
          npc_alma: [
            { kind: 'participated', act: 'sex', day: 9, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null },
          ],
          npc_bruno: [
            { kind: 'witnessed', act: 'saw_with_X', day: 9, roomId: 'kitchen', otherNpcId: 'npc_alma', spent: false, outcome: 'caught' },
          ],
        },
      },
      npcs: {
        npc_alma: {
          bible: {
            name: 'Alma', surname: 'Reyes', age: 30, gender: 'female', species: 'human',
            physical: {
              hair: { color: 'auburn', length: 'long', texture: 'wavy', style: 'loose' },
              eyes: { color: 'brown', shape: 'round' },
              skin: { tone: 'brown', texture: 'freckled' },
              face: { shape: 'heart', nose: 'small', lips: 'thin' },
              body: { shape: 'curvy' },
            },
          },
          residency: { room: 'bedroom_1', status: 'resident' },
          relPlayer: {
            desire: 0.7, tension: 0.5, lastInteractionDay: 9,
            grievances: [{ text: 'You left the dishes in the sink again', severity: 0.6, day: 9, resolved: false }],
          },
          memory: { episodes: [] },
        },
        npc_bruno: {
          bible: {
            name: 'Bruno', surname: 'Vance', age: 34, gender: 'male', species: 'human',
            physical: {
              hair: { color: 'dark brown', length: 'cropped', texture: 'straight', style: 'neat' },
              eyes: { color: 'hazel', shape: 'deep-set' },
              skin: { tone: 'pale', texture: 'weathered' },
              face: { shape: 'square', nose: 'broad', lips: 'thin' },
              body: { shape: 'broad' },
            },
          },
          residency: { room: 'bedroom_2', status: 'resident' },
          relPlayer: { desire: 0.1, tension: 0.2, lastInteractionDay: 1, grievances: [] },
          memory: { episodes: [] },
        },
        // The only material this one produces is an absence — no ledger, no
        // grievance, desire and tension both under threshold, and a
        // lastInteractionDay nine days back. Every other NPC in the fixture is
        // louder somewhere else, so this is the one whose LOUDEST fragment is
        // an absence, which is what the 'absent' role branch keys off.
        npc_dara: {
          bible: {
            name: 'Dara', surname: 'Whitlock', age: 26, gender: 'nonbinary', species: 'human',
            physical: {
              hair: { color: 'bleached', length: 'buzzed', texture: 'fine', style: 'grown out' },
              eyes: { color: 'green', shape: 'wide' },
              skin: { tone: 'fair', texture: 'smooth' },
              face: { shape: 'round', nose: 'upturned', lips: 'full' },
              body: { shape: 'slight' },
            },
          },
          residency: { room: 'bedroom_3', status: 'resident' },
          relPlayer: { desire: 0.1, tension: 0.1, lastInteractionDay: 1, grievances: [] },
          memory: { episodes: [] },
        },
        // The D22 negative control: loud in the residue, gone from the house.
        npc_gone: {
          bible: { name: 'Ines', surname: 'Okafor', age: 29, gender: 'female', species: 'human' },
          residency: { room: 'bedroom_1', status: 'former' },
          relPlayer: { desire: 0.9, tension: 0.9, lastInteractionDay: 1, grievances: [
            { text: 'You never told them you were seeing someone', severity: 1, day: 9, resolved: false },
          ] },
          memory: { episodes: [] },
        },
      },
      world: {
        events: [
          { day: 9, tick: 20, roomId: 'living_room', npcId: 'npc_bruno', type: 'intimate', moodDelta: 0.05,
            data: { other: 'npc_alma' }, template: '{name} and {other} were alone together for a while.', seenByPlayer: false },
        ],
        debugLog: [],
        afterHours: { searchHistory: [{ query: 'how to sleep through a whole night', day: 9 }] },
        quests: { active: [], completed: [] },
        bills: { rent: { dueDay: 5, balance: 900, status: 'overdue', overdueDays: 5, cutoffActive: false, autopay: false } },
        dreams: defaultDreamState(),
      },
    };
    if (over) over(gs);
    return gs;
  }

  // Every slot table, by the key the record stores it under, so the "is this
  // a real id" assertions can loop instead of enumerating.
  function slotTables() {
    return {
      form: DREAM_FORMS, perspective: DREAM_PERSPECTIVES, tempo: DREAM_TEMPO,
      register: DREAM_REGISTERS, lens: DREAM_LENSES, distortion: DREAM_DISTORTIONS,
    };
  }

  // Compile n dreams off one save by varying only the index, which is what
  // the queue actually does.
  function compileMany(n, opts, over) {
    const gs = fixture(over);
    const out = [];
    for (let i = 1; i <= n; i++) out.push(compileDream(gs, Object.assign({ index: i }, opts || {})));
    return out;
  }

  function setSetting(field, value) {
    settingsCache[field] = value;
  }

  // The in-memory kv the food harnesses established, so writeGeneratedGameState
  // and loadGameState run for real rather than against the loader's {} stub.
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
// alongside the `require()` above — one async main instead.
async function main() {

console.log('\n1. registration and the new table');

await check('compileDream, composeDreamPanelPrompt and composeDreamPanelKey all resolve',
  api(`(() => {
    for (const n of ['compileDream', 'composeDreamPanelPrompt', 'composeDreamPanelKey', 'selectDreamCast', 'selectDreamMotif', 'selectDreamResidue', 'selectDreamSetting', 'rollDreamKind']) {
      if (typeof eval(n) !== 'function') return n + ' is missing — dreams.js did not load, or Phase 4 did not land';
    }
    if (typeof DREAM_SETTINGS !== 'object' || !DREAM_SETTINGS) return 'DREAM_SETTINGS is missing from defs.dreams.js';
    // What the compiler borrows from image.js. Named individually because the
    // loader cannot mark image.js loaded (see the note at the top of this file).
    if (typeof buildVisualCharacterClause !== 'function') return 'buildVisualCharacterClause is missing — image.js did not reach the compiler';
    if (typeof applyImageStyle !== 'function') return 'applyImageStyle is missing';
    if (typeof imageStyleToken !== 'function') return 'imageStyleToken is missing';
    if (typeof IMAGE_PROMPT_VERSION !== 'string' || !IMAGE_PROMPT_VERSION) return 'IMAGE_PROMPT_VERSION is missing — the panel cache key cannot be composed';
    return true;
  })()`));

await check('DREAM_SETTINGS is well formed and covers all three sourceKinds',
  api(`(() => {
    const kinds = new Set();
    for (const id of Object.keys(DREAM_SETTINGS)) {
      const e = DREAM_SETTINGS[id];
      if (e.id !== id) return id + ' does not restate its own id';
      // weightedPick's default reads 0 as 1 (the defs.dreams.js trap).
      if (!(e.weight > 0)) return id + ' has weight ' + e.weight;
      if (!DREAM_ABSTRACTION_BANDS.includes(e.abstraction)) return id + ' has band ' + e.abstraction;
      if (!['apartment', 'external', 'nowhere'].includes(e.sourceKind)) return id + ' has sourceKind ' + e.sourceKind;
      if (!e.directive || !e.imageFragment) return id + ' is missing a directive or an imageFragment (D6)';
      // The apartment entry must NOT restate a room — ROOMS is read live.
      if (e.sourceKind === 'apartment' && e.roomId) return id + ' hardcodes a roomId; ROOMS is the one home for those';
      kinds.add(e.sourceKind);
    }
    if (kinds.size !== 3) return 'only these sourceKinds are reachable: ' + [...kinds].sort().join(',');
    return true;
  })()`));

await check('every perspective declares dreamerInFrame, and at least one of each way',
  api(`(() => {
    const vals = new Set();
    for (const id of Object.keys(DREAM_PERSPECTIVES)) {
      const v = DREAM_PERSPECTIVES[id].dreamerInFrame;
      if (typeof v !== 'boolean') return id + ' has dreamerInFrame ' + v + ' — the panel composer branches on it';
      vals.add(v);
    }
    return vals.size === 2 || 'every perspective agrees on dreamerInFrame, so the flag does nothing';
  })()`));

await check('the compiler tuning numbers all exist and are sane',
  api(`(() => {
    const T = DREAM_TUNING;
    const need = ['castTwoChance', 'castAffinityBoost', 'castStrangerDamp', 'roomFallbackWeight',
                  'castMax', 'residuePickMin', 'residuePickMax', 'motifCarryChance'];
    for (const k of need) if (!Number.isFinite(T[k])) return k + ' is missing from DREAM_TUNING';
    if (!(T.residuePickMin >= 1 && T.residuePickMax >= T.residuePickMin)) return 'residuePick bounds are inverted';
    if (!(T.castStrangerDamp > 0)) return 'castStrangerDamp is ' + T.castStrangerDamp + ' — a computed 0 reads back as 1';
    return true;
  })()`));

console.log('\n2. DETERMINISM — the whole point of a seeded compiler (D5)');

await check('compiling twice off one save with one index gives a deep-equal record',
  api(`(() => {
    const gs = fixture();
    const a = JSON.stringify(compileDream(gs, { index: 7 }));
    const b = JSON.stringify(compileDream(gs, { index: 7 }));
    return a === b || 'two compiles of one save disagreed:\\n  ' + a + '\\n  ' + b;
  })()`));

await check('two independently built copies of the same save compile identically',
  api(`(() => {
    // Stronger: fails if anything memoises onto the state object, or if any
    // selector depends on object identity or property insertion order.
    const a = JSON.stringify(compileDream(fixture(), { index: 7 }));
    const b = JSON.stringify(compileDream(fixture(), { index: 7 }));
    return a === b || 'two identical saves compiled differently';
  })()`));

await check('changing ONLY the index changes the slots',
  api(`(() => {
    const dreams = compileMany(24);
    const sig = dreams.map(d => JSON.stringify(d.slots));
    if (new Set(sig).size < 6) return 'only ' + new Set(sig).size + ' distinct slot sets across 24 indices — the seed is not reaching the rolls';
    if (new Set(dreams.map(d => d.id)).size !== dreams.length) return 'two indices produced the same dream id';
    if (new Set(dreams.map(d => d.seed)).size !== dreams.length) return 'two indices produced the same seed';
    return true;
  })()`));

await check('changing ONLY the save seed changes the slots',
  api(`(() => {
    const a = compileDream(fixture(g => { g.meta.seed = 'seed-A'; }), { index: 3 });
    const b = compileDream(fixture(g => { g.meta.seed = 'seed-B'; }), { index: 3 });
    if (a.id === b.id) return 'two save seeds produced the same dream id';
    // Not every slot must differ on one sample, but the whole record must.
    return JSON.stringify(a.slots) !== JSON.stringify(b.slots) || 'two save seeds produced identical slots';
  })()`));

console.log('\n3. ISOLATION — the compiler never touches the global stream (design invariant 5)');

await check('a thousand compiles leave the global cast generator byte-identical',
  api(`(() => {
    // The standing determinism invariant, tested the way the plan words it:
    // roll the cast generator before and after and confirm identical output.
    const before = JSON.stringify(SIM_generateHouse('rng-isolation', 3, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    const gs = fixture();
    for (let i = 1; i <= 1000; i++) compileDream(gs, { index: i });
    const after = JSON.stringify(SIM_generateHouse('rng-isolation', 3, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    return before === after || 'the generated house changed after 1000 compiles — the compiler drew from a shared stream';
  })()`));

await check('no selector reaches Math.random',
  api(`(() => {
    // The direct version of the same tripwire: break Math.random outright and
    // confirm the compiler never notices.
    const real = Math.random;
    Math.random = () => { throw new Error('the compiler drew from Math.random'); };
    try {
      const gs = fixture();
      for (let i = 1; i <= 50; i++) compileDream(gs, { index: i, forSleep: i % 2 ? 'night' : 'nap' });
      return true;
    } catch (e) {
      return e.message;
    } finally {
      Math.random = real;
    }
  })()`));

console.log('\n4. PURITY — reads everything, writes nothing (design invariant 2)');

await check('compiling does not mutate the save by a single byte',
  api(`(() => {
    const gs = fixture();
    const before = JSON.stringify(gs);
    for (let i = 1; i <= 40; i++) compileDream(gs, { index: i, forSleep: i % 3 ? 'night' : 'nap' });
    return JSON.stringify(gs) === before || 'compileDream mutated the save';
  })()`));

await check('compiling does not advance world.dreams.nextIndex or touch the ring',
  api(`(() => {
    // The caller owns the bookkeeping. A compiler that incremented nextIndex
    // itself would double-advance the moment Phase 6 does it properly.
    const gs = fixture();
    gs.world.dreams.nextIndex = 5;
    gs.world.dreams.consumedEventIds = ['evt:already-spent'];
    const d = compileDream(gs);
    if (d.index !== 5) return 'compileDream read the wrong nextIndex: ' + d.index;
    if (gs.world.dreams.nextIndex !== 5) return 'compileDream advanced nextIndex to ' + gs.world.dreams.nextIndex;
    if (gs.world.dreams.consumedEventIds.length !== 1) return 'compileDream wrote to consumedEventIds';
    if (gs.world.dreams.queue.length || gs.world.dreams.diary.length) return 'compileDream queued or filed its own dream';
    return true;
  })()`));

await check('a picked residue fragment is a COPY-SAFE record, not a live handle into the pool',
  api(`(() => {
    // Editing the compiled record must not reach back into anything the rest
    // of the save shares. harvestResidue already returns fresh objects, so
    // this is really a guard against a future "optimisation" that stops it.
    const gs = fixture();
    const d = compileDream(gs, { index: 2 });
    if (!d.residue.length) return 'the fixture produced no residue, so this proved nothing';
    const before = JSON.stringify(gs);
    d.residue[0].text = 'MUTATED';
    d.cast.push({ npcId: 'npc_alma', role: 'figure' });
    return JSON.stringify(gs) === before || 'editing the compiled record changed the save';
  })()`));

await check('every degenerate save returns null or a legal record, and never throws',
  api(`(() => {
    const bad = [undefined, null, 'a string', 42, {}, { meta: {} }, { meta: { seed: 's' }, world: {} },
                 { meta: { seed: 's', clock: {} }, npcs: null, player: null, world: { dreams: null } }];
    for (const gs of bad) {
      let d;
      try { d = compileDream(gs, { index: 1 }); }
      catch (e) { return 'compileDream threw on ' + JSON.stringify(gs) + ': ' + e.message; }
      if (d === null) continue;
      if (!d.id || !Array.isArray(d.panels) || d.panels.length < 1) {
        return 'a degenerate save produced an illegal record: ' + JSON.stringify(d && d.panels);
      }
    }
    return true;
  })()`));

console.log('\n5. THE SLOT CONTRACT — every slot is a real table id (D6)');

await check('every slot on 200 compiled dreams is an id that exists in its table',
  api(`(() => {
    const tables = slotTables();
    for (const d of compileMany(200)) {
      for (const key of Object.keys(tables)) {
        if (!tables[key][d.slots[key]]) return 'slots.' + key + ' = ' + d.slots[key] + ' is not in its table';
      }
      const st = d.slots.setting;
      if (!st || !DREAM_SETTINGS[st.settingId]) return 'slots.setting.settingId = ' + (st && st.settingId) + ' is not in DREAM_SETTINGS';
      if (DREAM_SETTINGS[st.settingId].sourceKind !== st.sourceKind) return 'the setting record disagrees with its own table entry';
      if (st.sourceKind === 'apartment' ? !ROOMS[st.roomId] : st.roomId !== null) {
        return 'setting ' + st.settingId + ' (' + st.sourceKind + ') has roomId ' + st.roomId;
      }
    }
    return true;
  })()`));

await check('the record carries every field the data model names',
  api(`(() => {
    const d = compileDream(fixture(), { index: 1 });
    const need = ['id', 'seed', 'index', 'kind', 'compiledDay', 'compiledMinutes', 'forSleep',
                  'slots', 'cast', 'motif', 'residue', 'source', 'recurrenceOf', 'shiftedBeat', 'panels', 'wake', 'status'];
    for (const k of need) if (!(k in d)) return 'the record is missing ' + k;
    if (d.status !== 'compiled') return 'status is ' + d.status + ' — Phase 4 stops at compiled';
    // Phase 9: any of the three kinds is legal, and each kind makes its own
    // promises about the source fields.
    if (!['distorted', 'true', 'recurring'].includes(d.kind)) return 'illegal kind ' + d.kind;
    if (d.kind === 'true') {
      if (d.recurrenceOf !== null) return 'a true dream claims a recurrence';
      if (d.shiftedBeat !== null) return 'a true dream claims a shifted beat';
      if (d.slots.distortion !== 'none') return 'a true dream distorted its place: ' + d.slots.distortion;
    } else if (d.kind === 'recurring') {
      if (!d.recurrenceOf) return 'a recurring dream lost its origin id';
      if (typeof d.shiftedBeat !== 'string' || !d.shiftedBeat) return 'a recurring dream lost its shifted beat';
    } else {
      if (d.recurrenceOf !== null) return 'recurrenceOf is set on a distorted dream';
      if (d.shiftedBeat !== null) return 'shiftedBeat is set on a distorted dream';
    }
    if (!Array.isArray(d.source.eventIds) || !Array.isArray(d.source.episodeKeys)) return 'source is malformed';
    if (!DREAM_WAKE_BANDS.includes(d.wake.band)) return 'wake.band is ' + d.wake.band;
    if (d.wake.moodDelta !== DREAM_REGISTERS[d.slots.register].moodDelta) return 'the wake tint does not match its register (D12)';
    return true;
  })()`));

await check('rollDreamKind consumes exactly two draws and returns one of the three kinds',
  api(`(() => {
    // Not a style point: if the class branch ever inserts its draws at the
    // head of the stream instead of consuming these, every dream in every
    // existing save re-casts. Two draws in, one kind out, nothing else.
    const rng = seededRng('kind-probe', 1);
    const a = rng(), b = rng(), c = rng();
    const rng2 = seededRng('kind-probe', 1);
    const kind = rollDreamKind(rng2);
    if (!['distorted', 'true', 'recurring'].includes(kind)) return 'rollDreamKind returned ' + kind;
    const next = rng2();
    if (next !== c) return 'rollDreamKind consumed ' + (next === b ? 1 : 'some other number of') + ' draws, not 2';
    return true;
  })()`));

console.log('\n6. PANELS — the form owns the panel count (D4, D16)');

await check('panels.length === beats.length for EVERY form in the table',
  api(`(() => {
    // Loop the table rather than sampling: a new form whose beats and panels
    // disagree must fail here, not in a player's diary.
    const gs = fixture();
    const seen = new Set();
    for (let i = 1; i <= 600 && seen.size < Object.keys(DREAM_FORMS).length; i++) {
      for (const forSleep of ['night', 'nap']) {
        const d = compileDream(gs, { index: i, forSleep });
        const form = DREAM_FORMS[d.slots.form];
        if (d.panels.length !== form.beats.length) {
          return form.id + ': ' + d.panels.length + ' panels for ' + form.beats.length + ' beats';
        }
        for (let p = 0; p < d.panels.length; p++) {
          if (d.panels[p].beat !== form.beats[p].id) return form.id + ' panel ' + p + ' carries beat ' + d.panels[p].beat;
        }
        seen.add(form.id);
      }
    }
    const missed = Object.keys(DREAM_FORMS).filter(f => !seen.has(f));
    return missed.length === 0 || 'never reached these forms, so they were not checked: ' + missed.join(',');
  })()`));

await check("forSleep:'nap' only ever draws a napOnly form, and it always has one panel",
  api(`(() => {
    for (const d of compileMany(300, { forSleep: 'nap' })) {
      const form = DREAM_FORMS[d.slots.form];
      if (!form.napOnly) return 'a nap drew the night form ' + form.id + ' (D16)';
      if (d.panels.length !== 1) return 'the nap form ' + form.id + ' produced ' + d.panels.length + ' panels';
      if (d.forSleep !== 'nap') return 'the record says forSleep ' + d.forSleep;
    }
    return true;
  })()`));

await check('a night dream NEVER draws a napOnly fragment form',
  api(`(() => {
    for (const d of compileMany(300, { forSleep: 'night' })) {
      if (DREAM_FORMS[d.slots.form].napOnly) return 'a night dream drew the nap fragment ' + d.slots.form;
      if (d.panels.length < 1 || d.panels.length > 3) return 'a night dream has ' + d.panels.length + ' panels (D4 says 1-3)';
    }
    return true;
  })()`));

await check('every panel carries a frozen prompt and a stable seed, and no blob (D14)',
  api(`(() => {
    for (const d of compileMany(60)) {
      for (let i = 0; i < d.panels.length; i++) {
        const p = d.panels[i];
        if (typeof p.prompt !== 'string' || p.prompt.length < 40) return 'panel ' + i + ' prompt is ' + JSON.stringify(p.prompt);
        if (!Number.isFinite(p.seed)) return 'panel ' + i + ' seed is ' + p.seed;
        if (p.text !== '') return 'panel ' + i + ' has prose before Phase 5 has run';
        if ('url' in p || 'blob' in p || 'image' in p) return 'a panel record stores pixels (D14 / landmine L10)';
        if (p.seed !== hashStr(composeDreamPanelKey(d, i))) return 'panel ' + i + ' seed does not match its own cache key';
      }
      // Two panels of one dream must not collide, or the second overwrites
      // the first in the shared LRU.
      const keys = d.panels.map((p, i) => composeDreamPanelKey(d, i));
      if (new Set(keys).size !== keys.length) return 'two panels of one dream share a cache key';
      if (new Set(d.panels.map(p => p.seed)).size !== d.panels.length) return 'two panels of one dream share a seed';
    }
    return true;
  })()`));

await check('the panel cache key folds IMAGE_PROMPT_VERSION and no style token',
  api(`(() => {
    const d = compileDream(fixture(), { index: 1 });
    const key = composeDreamPanelKey(d, 0);
    if (!key.includes(IMAGE_PROMPT_VERSION)) return 'the key does not fold IMAGE_PROMPT_VERSION: ' + key;
    if (!key.includes(d.id)) return 'the key does not name its dream: ' + key;
    // The style token is Phase 6's to append at the cache boundary, exactly
    // as getPhotoImage does over a frozen record prompt.
    const styled = typeof imageStyleToken === 'function' ? imageStyleToken() : '';
    if (styled && key.includes(styled)) return 'the compiled key baked in the active style';
    return true;
  })()`));

console.log('\n7. THE PANEL PROMPT — every table reaches the picture (D6)');

await check("each panel's prompt names its own beat phrase and its dream's lens and distortion",
  api(`(() => {
    for (const d of compileMany(40)) {
      const form = DREAM_FORMS[d.slots.form];
      const lens = DREAM_LENSES[d.slots.lens];
      const dist = DREAM_DISTORTIONS[d.slots.distortion];
      const reg = DREAM_REGISTERS[d.slots.register];
      for (let i = 0; i < d.panels.length; i++) {
        const p = d.panels[i].prompt;
        if (!p.includes(form.beats[i].phrase)) return 'panel ' + i + ' is missing its beat phrase';
        if (!p.includes(lens.imageFragment)) return 'a panel is missing the lens fragment (' + lens.id + ')';
        if (!p.includes(dist.imageFragment)) return 'a panel is missing the distortion fragment (' + dist.id + ')';
        if (!p.includes(reg.imageFragment)) return 'a panel is missing the register fragment (' + reg.id + ')';
      }
    }
    return true;
  })()`));

await check('a cast figure is described through buildVisualCharacterClause, and an absent one is not',
  api(`(() => {
    let sawFigure = false, sawAbsent = false;
    for (const d of compileMany(120)) {
      for (const m of d.cast) {
        const name = fixture().npcs[m.npcId].bible.name;
        const named = d.panels.every(p => p.prompt.includes(name));
        if (m.role === 'absent') {
          sawAbsent = true;
          if (named) return 'an absent cast member is drawn into the frame anyway';
          if (!d.panels.every(p => p.prompt.includes(DREAM_ABSENT_PHRASE))) return 'an absent cast member left no empty space in the prompt';
        } else {
          sawFigure = true;
          if (!named) return 'a ' + m.role + ' cast member is not described in the panel prompt';
        }
      }
    }
    if (!sawFigure) return 'no dream in 120 cast a visible figure, so this proved nothing';
    if (!sawAbsent) return 'no dream in 120 cast an absent figure, so half of this proved nothing';
    return true;
  })()`));

await check('the dreamer is drawn only when the perspective says they are in frame',
  api(`(() => {
    let inFrame = 0, out = 0;
    for (const d of compileMany(150)) {
      const shows = DREAM_PERSPECTIVES[d.slots.perspective].dreamerInFrame;
      const named = d.panels[0].prompt.includes('Wren');
      if (shows) { inFrame++; if (!named) return 'a dreamerInFrame perspective did not describe the dreamer'; }
      else { out++; if (named) return 'the perspective ' + d.slots.perspective + ' says no visible observer, but the dreamer is described'; }
    }
    return (inFrame > 0 && out > 0) || 'only one branch was reached (' + inFrame + ' in / ' + out + ' out)';
  })()`));

await check('a prompt never leaks an npcId, a roomId or a raw designator room name',
  api(`(() => {
    const gs = fixture();
    for (let i = 1; i <= 120; i++) {
      const d = compileDream(gs, { index: i, forSleep: i % 2 ? 'night' : 'nap' });
      for (const p of d.panels) {
        for (const id of Object.keys(gs.npcs)) if (p.prompt.includes(id)) return 'an npcId leaked into a prompt: ' + id;
        // Only the snake_case ids are testable: seven roomIds ('kitchen',
        // 'study', 'gym', 'entry', 'dining', 'laundry', 'balcony') are also
        // the ordinary English nouns dreamRoomImageNoun is SUPPOSED to emit,
        // so a match on those cannot distinguish a leak from correct prose.
        // Every id that could only have come from an id has an underscore.
        for (const id of Object.keys(ROOMS)) {
          if (id.includes('_') && p.prompt.includes(id)) return 'a roomId leaked into a prompt: ' + id;
        }
        // "Bedroom 2" / "Your Bedroom" are prose forms; a diffusion model
        // renders the designator as literal text on the wall.
        if (/\\bYour\\s/i.test(p.prompt)) return 'a possessive room name reached a prompt';
        if (/\\b(bedroom|hallway|bathroom)\\s+[0-9A-Z]\\b/.test(p.prompt)) return 'a room designator reached a prompt';
      }
    }
    return true;
  })()`));

await check('the panel prompt is composed BEFORE applyImageStyle and carries no orientation',
  api(`(() => {
    // Both are Phase 6's business at the cache boundary — the record is
    // frozen and must not claim a viewport or a style it cannot know about.
    const d = compileDream(fixture(), { index: 1 });
    const p = d.panels[0].prompt;
    if (/wide composition|tall vertical composition/.test(p)) return 'the frozen prompt baked in a viewport orientation';
    const styled = applyImageStyle(p);
    if (styled !== p && p.endsWith(styled.slice(p.length))) return 'the prompt was already styled at compile time';
    return true;
  })()`));

console.log('\n8. THE SFW GATE — a hard filter, not a softener (D17)');

await check('with sfwMode on, 500 compiles never select the erotic register',
  api(`(() => {
    const was = settingsCache.sfwMode;
    try {
      setSetting('sfwMode', true);
      if (!isSfwMode()) return 'the harness could not turn sfwMode on';
      for (const d of compileMany(500)) {
        if (d.slots.register === 'erotic') return 'an erotic register survived sfwMode';
        if (d.panels.some(p => p.prompt.includes(DREAM_REGISTERS.erotic.imageFragment))) return "the erotic register's image fragment reached a prompt under sfwMode";
      }
      return true;
    } finally { setSetting('sfwMode', was); }
  })()`));

await check('with sfwMode off, erotic is reachable — so the gate above proved something',
  api(`(() => {
    const wasSfw = settingsCache.sfwMode, wasReg = settingsCache.dreamRegister;
    try {
      setSetting('sfwMode', false);
      setSetting('dreamRegister', 'charged');
      const hit = compileMany(500).some(d => d.slots.register === 'erotic');
      return hit || 'erotic never came up in 500 charged compiles, so the sfw assertion is vacuous';
    } finally { setSetting('sfwMode', wasSfw); setSetting('dreamRegister', wasReg); }
  })()`));

console.log('\n9. THE PLAYER DIALS actually bend the pools (D17)');

await check('dreamRegister moves the register distribution the way the tuning table says',
  api(`(() => {
    const was = settingsCache.dreamRegister;
    const share = (mode, id) => {
      setSetting('dreamRegister', mode);
      const ds = compileMany(400);
      return ds.filter(d => d.slots.register === id).length / ds.length;
    };
    try {
      const gentleAnxious = share('gentle', 'anxious');
      const chargedAnxious = share('charged', 'anxious');
      if (!(chargedAnxious > gentleAnxious)) return 'anxious: gentle ' + gentleAnxious + ' vs charged ' + chargedAnxious;
      const gentleTender = share('gentle', 'tender');
      const chargedTender = share('charged', 'tender');
      if (!(gentleTender > chargedTender)) return 'tender: gentle ' + gentleTender + ' vs charged ' + chargedTender;
      // Reweighting, never gating: gentle still reaches the dark registers.
      if (!(gentleAnxious > 0)) return 'gentle removed anxious outright — the dial is a filter, not a weight';
      return true;
    } finally { setSetting('dreamRegister', was); }
  })()`));

await check('dreamAbstraction moves the form, lens, distortion AND setting pools together',
  api(`(() => {
    const was = settingsCache.dreamAbstraction;
    const unrealShare = (mode) => {
      setSetting('dreamAbstraction', mode);
      const ds = compileMany(400);
      const n = ds.length;
      return {
        form: ds.filter(d => DREAM_FORMS[d.slots.form].abstraction === 'unreal').length / n,
        lens: ds.filter(d => DREAM_LENSES[d.slots.lens].abstraction === 'unreal').length / n,
        dist: ds.filter(d => DREAM_DISTORTIONS[d.slots.distortion].abstraction === 'unreal').length / n,
        set:  ds.filter(d => DREAM_SETTINGS[d.slots.setting.settingId].abstraction === 'unreal').length / n,
      };
    };
    try {
      const g = unrealShare('grounded'), s = unrealShare('surreal');
      for (const k of ['form', 'lens', 'dist', 'set']) {
        if (!(s[k] > g[k])) return k + ': grounded ' + g[k] + ' vs surreal ' + s[k] + ' — the band multiplier is not reaching it';
      }
      return true;
    } finally { setSetting('dreamAbstraction', was); }
  })()`));

console.log('\n10. CAST and MOTIF');

await check('the cast is 0-2, drawn only from residents the residue actually names',
  api(`(() => {
    const gs = fixture();
    for (let i = 1; i <= 200; i++) {
      const d = compileDream(gs, { index: i });
      if (d.cast.length > DREAM_TUNING.castMax) return 'a dream cast ' + d.cast.length + ' people';
      const ids = d.cast.map(c => c.npcId);
      if (new Set(ids).size !== ids.length) return 'the same NPC was cast twice';
      for (const m of d.cast) {
        if (!gs.npcs[m.npcId]) return 'the cast names an NPC that does not exist: ' + m.npcId;
        if (!['figure', 'witness', 'absent'].includes(m.role)) return 'illegal role ' + m.role;
      }
    }
    return true;
  })()`));

await check('an NPC who has MOVED OUT is never cast, however loud they are in the residue (D22)',
  api(`(() => {
    // npc_gone carries the loudest grievance in the fixture and is a former
    // resident. A dream about somebody who moved out is invalid the moment
    // it is compiled, so it must never be compiled.
    const gs = fixture();
    const pool = harvestResidue(gs, { limit: 9999 });
    if (!pool.some(f => f.npcId === 'npc_gone')) return 'the fixture stopped producing residue for the former resident, so this proved nothing';
    for (let i = 1; i <= 300; i++) {
      if (compileDream(gs, { index: i }).cast.some(c => c.npcId === 'npc_gone')) return 'a former resident was cast';
    }
    return true;
  })()`));

await check('the picked residue prefers the cast, and never exceeds residuePickMax',
  api(`(() => {
    const gs = fixture();
    let aligned = 0, total = 0;
    for (let i = 1; i <= 200; i++) {
      const d = compileDream(gs, { index: i });
      if (d.residue.length > DREAM_TUNING.residuePickMax) return 'picked ' + d.residue.length + ' fragments';
      // Phase 9: a true dream's residue IS the event (one fragment), and a
      // recurring dream keeps its origin's residue — both legitimately below
      // residuePickMin, which only the distorted cast promises.
      if (d.kind === 'distorted' && d.residue.length < Math.min(DREAM_TUNING.residuePickMin, harvestResidue(gs).length)) return 'picked only ' + d.residue.length;
      const ids = new Set(d.cast.map(c => c.npcId));
      for (const f of d.residue) {
        if (!f.npcId) continue;
        total++;
        if (ids.has(f.npcId)) aligned++;
      }
    }
    if (!total) return 'no picked fragment named anybody, so this proved nothing';
    const ratio = aligned / total;
    return ratio > 0.6 || 'only ' + Math.round(ratio * 100) + '% of person-fragments named a cast member — castAffinityBoost is not working';
  })()`));

await check('source.eventIds carries exactly the sourceKeys of the picked unseen_event fragments (D26)',
  api(`(() => {
    const gs = fixture();
    let sawOne = false;
    for (let i = 1; i <= 200; i++) {
      const d = compileDream(gs, { index: i });
      const expect = d.residue.map(f => f.sourceKey).filter(Boolean);
      if (JSON.stringify(d.source.eventIds) !== JSON.stringify(expect)) {
        return 'source.eventIds ' + JSON.stringify(d.source.eventIds) + ' vs picked ' + JSON.stringify(expect);
      }
      if (expect.length) {
        sawOne = true;
        for (const k of expect) if (!String(k).startsWith('evt:')) return 'a non-event key reached source.eventIds: ' + k;
      }
    }
    return sawOne || 'no compile in 200 picked an unseen_event fragment, so this proved nothing';
  })()`));

await check('the motif is always a real anchor, and carries from motifHistory when there is one (D10)',
  api(`(() => {
    const plain = compileMany(60);
    for (const d of plain) {
      if (!d.motif || !d.motif.motifId || !d.motif.text) return 'a dream compiled without a motif';
      if (d.motif.carriedFrom !== null) return 'a motif claimed a carry with an empty history';
      const known = DREAM_MOTIFS[d.motif.motifId] || d.motif.motifId.startsWith('item:');
      if (!known) return 'unknown motif id ' + d.motif.motifId;
    }
    const carried = compileMany(200, {}, (g) => {
      g.world.dreams.motifHistory = [{ motifId: 'payphone', text: DREAM_MOTIFS.payphone.text, dreamId: 'dream_earlier', day: 8 }];
    });
    const hits = carried.filter(d => d.motif.carriedFrom === 'dream_earlier');
    if (!hits.length) return 'nothing carried in 200 compiles against a one-entry history';
    if (hits.some(d => d.motif.motifId !== 'payphone')) return 'a carry kept the wrong motif id';
    const rate = hits.length / carried.length;
    if (!(rate > 0.15 && rate < 0.6)) return 'carry rate ' + rate.toFixed(2) + ' is nowhere near motifCarryChance ' + DREAM_TUNING.motifCarryChance;
    return true;
  })()`));

await check("an owned item can become the motif, and its imageFragment survives losing the item",
  api(`(() => {
    // harvestItemMotifs feeds the same weighted draw with no special case,
    // and a carried item motif must still resolve after the item is gone —
    // motifHistory persists the text for exactly this.
    const withItem = compileMany(400).some(d => d.motif.motifId === 'item:coffee_mug');
    if (!withItem) return 'an owned item never became the motif in 400 compiles';
    const gone = fixture(g => { g.player.inventory = []; });
    const frag = dreamMotifImageFragment(gone, { motifId: 'item:coffee_mug', text: 'the coffee mug, in the same place as always' });
    if (!frag) return 'a carried item motif resolved to no image fragment once the item was gone';
    return true;
  })()`));

console.log('\n11. against a REAL generated house');

await check('a played-in generated house compiles a legal dream and stays untouched',
  api(`(() => {
    const h = house('compile-real', 3);
    for (let i = 0; i < 12; i++) resolveTick(h);
    const before = JSON.stringify(h);
    const d = compileDream(h, { index: 1 });
    if (JSON.stringify(h) !== before) return 'compiling from a played house mutated it';
    if (!d || !d.panels.length) return 'a real house produced no dream';
    if (d.panels.length !== DREAM_FORMS[d.slots.form].beats.length) return 'panel count disagreed with the form on a real house';
    for (const p of d.panels) {
      for (const id of Object.keys(h.npcs)) if (p.prompt.includes(id)) return 'an npcId leaked on a real house';
    }
    return true;
  })()`));

console.log('\n12. inertness — Phase 4 changes no clock or needs accounting');

await check('compiling between ticks moves neither the clock nor a point of energy',
  api(`(() => {
    // Phase 4 adds no sleep hook: a save the compiler has run over must
    // resolve exactly like one it has not.
    const compiled = house('compile-inert', 2);
    const control = house('compile-inert', 2);
    for (let i = 0; i < 12; i++) {
      compileDream(compiled, { index: i + 1 });
      compileDream(compiled, { index: i + 1, forSleep: 'nap' });
      resolveTick(compiled);
      resolveTick(control);
    }
    if (compiled.meta.clock.day !== control.meta.clock.day || compiled.meta.clock.minutes !== control.meta.clock.minutes) {
      return 'the clock diverged: ' + JSON.stringify(compiled.meta.clock) + ' vs ' + JSON.stringify(control.meta.clock);
    }
    if (compiled.player.energy !== control.player.energy) {
      return 'player energy diverged: ' + compiled.player.energy + ' vs ' + control.player.energy;
    }
    if (JSON.stringify(compiled.world.dreams) !== JSON.stringify(control.world.dreams)) {
      return 'world.dreams diverged — the compiler wrote to its own subtree';
    }
    return true;
  })()`));

console.log('\n13. the save/load round trip');

await check('a dream compiled after a real write/load cycle is IDENTICAL to one compiled before it',
  api(`(async () => {
    // Both halves of the standing per-phase obligation in one assertion: the
    // world.dreams round trip still holds with a compiled dream parked in the
    // queue, and — because a reload rebuilds every object from JSON with
    // fresh key ordering — nothing in the compiler can be depending on
    // property insertion order.
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-compile', clock: { day: 1, minutes: 0 } });
    const h = house('rt-compile', 2);
    const ids = Object.keys(h.npcs);
    h.player.ledger = { [ids[1]]: [{ kind: 'participated', act: 'sex', day: h.meta.clock.day, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }] };
    h.npcs[ids[0]].relPlayer.grievances = [{ text: 'You left the dishes in the sink again', severity: 0.6, day: h.meta.clock.day, resolved: false }];
    h.world.events.push({ day: h.meta.clock.day, tick: 3, roomId: 'kitchen', npcId: ids[0], type: 'chore', moodDelta: 0, data: {}, template: '{name} was in the kitchen for a long time.', seenByPlayer: false });
    h.world.dreams.motifHistory.push({ motifId: 'payphone', text: DREAM_MOTIFS.payphone.text, dreamId: 'dream_earlier', day: 1 });
    h.world.dreams.nextIndex = 4;

    const before = compileDream(h, { index: 4 });
    // Park it in the queue so the round trip carries a real compiled record,
    // not just the counters.
    h.world.dreams.queue = [before];

    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();

    const d = loaded.world.dreams;
    if (!d || d.nextIndex !== 4) return 'world.dreams did not survive the round trip: ' + JSON.stringify(d && d.nextIndex);
    if (!d.queue.length) return 'the queued dream did not survive the round trip';
    if (JSON.stringify(d.queue[0]) !== JSON.stringify(before)) {
      return 'the queued record changed shape across a save/load';
    }
    if (JSON.stringify(d.motifHistory) !== JSON.stringify(h.world.dreams.motifHistory)) return 'motifHistory did not round trip';

    const after = compileDream(loaded, { index: 4 });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return 'the compiled dream changed across a save/load:\\n  before ' + JSON.stringify(before.slots) + '\\n  after  ' + JSON.stringify(after.slots);
    }
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
