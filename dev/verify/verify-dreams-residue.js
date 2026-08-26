// Dream Engine Phase 3 — the residue harvester.
// (src/ref/complete/dream-engine-plan.md)
//
// harvestResidue is the one function in this engine with no excuses available
// to it: pure, deterministic, no RNG, no I/O, no model, and — design
// invariant 2 — no writes of any kind, against a save it is allowed to read
// omnisciently (D7). Every assertion below is aimed at one of those four
// words, plus the redaction contract that makes the fragments safe to hand
// Phase 5 without the prompt builder having to think.
//
// What this harness deliberately does NOT do is assert phrasing. Clause
// wording is authored text and will be retuned; the assertions are shaped as
// invariants — "a grievance fragment exists and names them", not "the text is
// exactly this" — so a rewrite of RESIDUE_ACT_CLAUSES leaves it green.
//
// The two standing per-phase obligations are here too:
//   - save/load round trip: the pool harvested from a state is IDENTICAL to
//     the pool harvested from that same state after writeGeneratedGameState →
//     loadGameState. That is both the round-trip check and the strongest
//     available proof that nothing here depends on property insertion order.
//   - clock and needs: Phase 3 adds no sleep hook and must not perturb the
//     sim by a minute or a point of energy.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'state.js', 'sim.js', 'items.js', 'npc.js', 'debuglog.js'] });

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
  // A hand-built save that lights up all nine sources at once, plus one
  // NEGATIVE control per source that has a meaningful one (a seen event, a
  // resolved grievance, a bill that is neither due nor overdue, a captured
  // prompt). Hand-built rather than generated because the point is to know
  // exactly what should and should not come out.
  //
  // Today is day 10, so with DREAM_TUNING.residueDays at 3 the window is
  // days 7..10 inclusive.
  function fixture() {
    return {
      meta: { seed: 'residue-fixture', clock: { day: 10, minutes: 480 }, sessionLog: [] },
      player: {
        energy: 60,
        inventory: [
          { defId: 'coffee_mug', qty: 1, ownerId: 'player', meta: {} },
          { defId: 'egg', qty: 6, ownerId: 'player', meta: {} },
          { defId: '_unknown', qty: 1, ownerId: 'player', meta: { origName: 'a thing' } },
        ],
        ledger: {
          // Deliberately NOT in alphabetical order in the literal, so the
          // scorer's Object.keys(...).sort() is doing real work.
          npc_bruno: [
            { kind: 'participated', act: 'sex', day: 9, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null },
            { kind: 'participated', act: 'cuddle', day: 2, roomId: 'living_room', otherNpcId: null, spent: false, outcome: null },
          ],
          npc_alma: [
            { kind: 'witnessed', act: 'saw_with_X', day: 8, roomId: 'kitchen', otherNpcId: 'npc_bruno', spent: false, outcome: 'caught' },
          ],
        },
      },
      npcs: {
        npc_bruno: {
          bible: { name: 'Bruno', surname: 'Vance' },
          relPlayer: {
            desire: 0.05, tension: 0.6, lastInteractionDay: 2,
            grievances: [{ text: 'You told everyone about the interview', severity: 0.9, day: 9, resolved: true }],
          },
          memory: { episodes: [] },
        },
        npc_alma: {
          bible: { name: 'Alma', surname: 'Reyes' },
          relPlayer: {
            desire: 0.7, tension: 0.1, lastInteractionDay: 9,
            grievances: [{ text: 'You left the dishes in the sink again', severity: 0.6, day: 9, resolved: false }],
          },
          memory: {
            episodes: [
              { day: 9, text: 'They stood in the kitchen and neither of them said the thing', decay: 1, importance: 0.8, emotionalTag: 'romance', participants: ['npc_alma', 'player'] },
              { day: 9, text: 'Someone put the recycling out', decay: 1, importance: 0.3, emotionalTag: '', participants: ['npc_alma'] },
              { day: 9, text: 'A memory already nearly gone', decay: 0.1, importance: 0.8, emotionalTag: 'romance', participants: ['npc_alma'] },
            ],
          },
        },
      },
      world: {
        events: [
          { day: 9, tick: 20, roomId: 'kitchen', npcId: 'npc_alma', type: 'intimate', moodDelta: 0.05,
            data: { other: 'npc_bruno' }, template: '{name} and {other} were alone together for a while.', seenByPlayer: false },
          { day: 9, tick: 21, roomId: 'living_room', npcId: 'npc_bruno', type: 'chore', moodDelta: 0,
            data: {}, template: '{name} did the washing up.', seenByPlayer: true },
        ],
        debugLog: [
          { category: 'conversation_ambient', day: 9, minutes: 600, tick: 20, npcIds: ['npc_alma', 'npc_bruno'],
            detail: { npcId: 'npc_alma', data: { other: 'npc_bruno' }, template: '{name} and {other} talked in the hall.' } },
          { category: 'conversation', day: 9, minutes: 700, tick: 23, npcIds: ['npc_alma'],
            detail: { speaker: 'npc_alma', channel: 'scene', text: 'You never say what you actually mean.' } },
          { category: 'conversation', day: 9, minutes: 705, tick: 23, npcIds: [],
            detail: { speaker: 'player', channel: 'scene', text: 'Forget I said anything.' } },
          // The negative control that matters most: a captured prompt is
          // several KB of model instructions and must never reach the pool.
          { category: 'prompt', day: 9, minutes: 700, tick: 23, npcIds: [],
            detail: { channel: 'scene', prompt: 'ZZPROMPTLEAK' + 'x'.repeat(3000) } },
          { category: 'movement', day: 9, minutes: 300, tick: 10, npcIds: ['npc_bruno'],
            detail: { from: 'kitchen', to: 'living_room', branch: 'drive' } },
        ],
        afterHours: { searchHistory: [{ query: 'how to sleep through a whole night', day: 9 }, { query: 'stale', day: 1 }] },
        quests: {
          active: [
            { id: 'q1', title: 'Ask Alma about the band', npcId: 'npc_alma', expiresDay: 11, status: 'active' },
            { id: 'q2', title: 'A goal with weeks left on it', npcId: 'npc_bruno', expiresDay: 40, status: 'active' },
          ],
          completed: [],
        },
        bills: {
          rent:  { dueDay: 5,  balance: 900, status: 'overdue', overdueDays: 5, cutoffActive: false, autopay: false },
          water: { dueDay: 40, balance: 120, status: 'current', overdueDays: 0, cutoffActive: false, autopay: false },
          gas:   { dueDay: 12, balance: 0,   status: 'current', overdueDays: 0, cutoffActive: false, autopay: false },
        },
        dreams: defaultDreamState(),
      },
    };
  }

  function kindsIn(pool) { return pool.map(f => f.kind); }
  function hasKind(pool, k) { return pool.some(f => f.kind === k); }
  function textsIn(pool) { return pool.map(f => f.text).join(' || '); }
  function ofKind(pool, k) { return pool.filter(f => f.kind === k); }

  // The full pool, cap lifted, so a source-level assertion is not silently
  // testing poolCap instead of the source.
  function fullPool(gs, opts) {
    return harvestResidue(gs, Object.assign({ limit: 9999 }, opts || {}));
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

console.log('\n1. registration and the closed list');

await check('harvestResidue, harvestItemMotifs and DREAM_RESIDUE_KINDS all resolve',
  api(`(() => {
    if (typeof harvestResidue !== 'function') return 'harvestResidue is missing — dreams.js did not load, or Phase 3 did not land';
    if (typeof harvestItemMotifs !== 'function') return 'harvestItemMotifs is missing';
    if (!Array.isArray(DREAM_RESIDUE_KINDS)) return 'DREAM_RESIDUE_KINDS is missing from defs.dreams.js';
    if (!DREAM_TUNING.residue) return 'DREAM_TUNING.residue is missing';
    return true;
  })()`));

await check('DREAM_RESIDUE_KINDS and DREAM_TUNING.residue.kindWeights agree in BOTH directions',
  api(`(() => {
    // The registerWeights tripwire, applied to the harvester: a source added
    // without a weight would silently score at the 0.1 fallback and never be
    // noticed, and a weight left behind by a deleted source would rot.
    const kinds = [...DREAM_RESIDUE_KINDS].sort().join(',');
    const weights = Object.keys(DREAM_TUNING.residue.kindWeights).sort().join(',');
    if (kinds !== weights) return 'kinds [' + kinds + '] vs kindWeights [' + weights + ']';
    for (const k of DREAM_RESIDUE_KINDS) {
      const w = DREAM_TUNING.residue.kindWeights[k];
      if (!Number.isFinite(w) || w <= 0 || w > 1) return k + ' weighs ' + w + ' — base weights live in (0, 1]';
    }
    return true;
  })()`));

await check('DREAM_RESIDUE_KINDS has no duplicates',
  api(`(() => {
    const dupes = DREAM_RESIDUE_KINDS.filter((k, i) => DREAM_RESIDUE_KINDS.indexOf(k) !== i);
    return dupes.length === 0 || 'duplicate kinds: ' + dupes.join(',');
  })()`));

console.log('\n2. PURITY — the whole contract of this phase');

await check('harvesting the same save twice returns an identical array',
  api(`(() => {
    const gs = fixture();
    const a = JSON.stringify(harvestResidue(gs));
    const b = JSON.stringify(harvestResidue(gs));
    return a === b || 'two harvests of one save disagreed:\\n' + a + '\\n' + b;
  })()`));

await check('two independently built copies of the same save harvest identically',
  api(`(() => {
    // Stronger than the above: this one fails if anything memoises onto the
    // state object, or if any scorer depends on object identity.
    const a = JSON.stringify(harvestResidue(fixture()));
    const b = JSON.stringify(harvestResidue(fixture()));
    return a === b || 'two identical saves harvested differently';
  })()`));

await check('harvesting MUTATES NOTHING — the save is deep-identical afterwards',
  api(`(() => {
    const gs = fixture();
    const before = JSON.stringify(gs);
    harvestResidue(gs);
    harvestItemMotifs(gs);
    const after = JSON.stringify(gs);
    if (before === after) return true;
    // Design invariant 2 in one assertion. Find the first divergence so the
    // failure names the field rather than dumping two saves.
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      if (before[i] !== after[i]) return 'the save changed near: ' + before.slice(Math.max(0, i - 90), i + 90);
    }
    return 'the save changed length: ' + before.length + ' -> ' + after.length;
  })()`));

await check('NO RNG — the global stream is untouched and the pool does not depend on it',
  api(`(() => {
    // Design invariant 5's harvester half. If any scorer reached for a random
    // draw, advancing the shared stream between two harvests would change the
    // second pool, and the stream's own position after a harvest would move.
    const gs = fixture();
    const rng = seededRng(gs.meta.seed, 1234);
    const first = JSON.stringify(harvestResidue(gs));
    const drawBefore = rng();
    harvestResidue(gs);
    harvestItemMotifs(gs);
    const drawAfter = rng();
    const rngFresh = seededRng(gs.meta.seed, 1234);
    rngFresh(); // consume the equivalent of drawBefore
    if (drawAfter !== rngFresh()) return 'a harvest drew from an RNG stream — the sequence shifted';
    if (JSON.stringify(harvestResidue(gs)) !== first) return 'the pool changed between harvests';
    return true;
  })()`));

await check('an empty world returns [] rather than throwing, and so do the degenerate inputs',
  api(`(() => {
    const cases = [
      ['undefined', undefined],
      ['null', null],
      ['a bare object', {}],
      ['no world', { meta: { clock: { day: 4 } }, player: {}, npcs: {} }],
      ['empty subtrees', { meta: { clock: { day: 4 } }, player: { inventory: [], ledger: {} }, npcs: {}, world: { events: [], debugLog: [], quests: { active: [] }, bills: {}, afterHours: { searchHistory: [] }, dreams: defaultDreamState() } }],
      ['garbage in every slot', { meta: 7, player: { inventory: 'no', ledger: 'no' }, npcs: 'no', world: { events: 'no', debugLog: 'no', quests: 'no', bills: 'no', afterHours: 'no' } }],
    ];
    for (const [label, gs] of cases) {
      const out = harvestResidue(gs);
      if (!Array.isArray(out)) return label + ' did not return an array';
      if (out.length !== 0) return label + ' produced ' + out.length + ' fragments: ' + textsIn(out);
      if (!Array.isArray(harvestItemMotifs(gs))) return label + ' broke harvestItemMotifs';
    }
    return true;
  })()`));

console.log('\n3. the fragment contract');

await check('every fragment matches the documented shape and carries a real kind',
  api(`(() => {
    const allowed = new Set(['kind', 'weight', 'text', 'npcId', 'itemId', 'roomId', 'day', 'sourceKey']);
    for (const f of fullPool(fixture())) {
      if (!DREAM_RESIDUE_KINDS.includes(f.kind)) return 'unknown kind: ' + f.kind;
      if (!Number.isFinite(f.weight) || f.weight <= 0 || f.weight > 1) return f.kind + ' scored ' + f.weight + ' — salience is (0, 1]';
      if (typeof f.text !== 'string' || !f.text.trim()) return f.kind + ' has no text';
      for (const k of Object.keys(f)) if (!allowed.has(k)) return f.kind + ' grew an undocumented field: ' + k;
      if (f.npcId != null && typeof f.npcId !== 'string') return 'npcId is not a string on ' + f.kind;
      if (f.day != null && !Number.isFinite(f.day)) return 'day is not a number on ' + f.kind;
    }
    return true;
  })()`));

await check('REDACTION — no npcId, no room id, no template placeholder survives into any text',
  api(`(() => {
    // The whole point of doing redaction in the scorers: whatever Phase 5
    // hands the model, it never contains an identifier. A leak here is the
    // model being shown 'npc_alma' and cheerfully using it as a name.
    const gs = fixture();
    const pool = fullPool(gs);
    // Only ID-SHAPED ids are testable by substring. Several room ids are a
    // single lowercase word that is also the room's own name ('kitchen',
    // 'entry', 'dining'), so "the kitchen" — the correct, redacted output of
    // roomPhrase — would read as a leak. Underscored ids cannot occur in
    // prose, which makes them the honest tripwire.
    const ids = [...Object.keys(gs.npcs), ...Object.keys(ROOMS), 'player'].filter(id => id.includes('_'));
    for (const f of pool) {
      for (const id of ids) {
        if (f.text.includes(id)) return f.kind + ' leaked the id "' + id + '": ' + f.text;
      }
      if (/\\{(name|other|room)\\}/.test(f.text)) return f.kind + ' left a template placeholder unfilled: ' + f.text;
      if (f.text.includes('undefined') || f.text.includes('[object')) return f.kind + ' leaked a JS value: ' + f.text;
      if (f.text.length > DREAM_TUNING.residue.clauseMaxChars + 40) return f.kind + ' is not a fragment, it is a paragraph: ' + f.text.length + ' chars';
    }
    return true;
  })()`));

await check('the pool is sorted loudest-first and deduped on kind+text',
  api(`(() => {
    const pool = fullPool(fixture());
    for (let i = 1; i < pool.length; i++) {
      if (pool[i].weight > pool[i - 1].weight) return 'out of order at ' + i + ': ' + pool[i - 1].weight + ' then ' + pool[i].weight;
    }
    const keys = pool.map(f => f.kind + '|' + f.text);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    return dupes.length === 0 || 'duplicate fragments: ' + dupes.join(' ; ');
  })()`));

await check('poolCap and the per-source cap both bind, and opts.limit overrides',
  api(`(() => {
    const R = DREAM_TUNING.residue;
    const gs = fixture();
    // Flood one source well past both caps.
    for (let i = 0; i < 60; i++) {
      gs.world.events.push({ day: 9, tick: 30 + i, roomId: 'kitchen', npcId: 'npc_alma', type: 'chore', moodDelta: 0,
        data: {}, template: 'Something number ' + i + ' happened to {name}.', seenByPlayer: false });
    }
    const capped = harvestResidue(gs);
    if (capped.length > R.poolCap) return 'poolCap ignored: ' + capped.length + ' > ' + R.poolCap;
    const full = fullPool(gs);
    if (ofKind(full, 'unseen_event').length > R.perSourceCap * 2) {
      // Two sources emit unseen_event (world.events and NPC episodes), so the
      // honest bound is two per-source caps, not one.
      return 'perSourceCap ignored: ' + ofKind(full, 'unseen_event').length + ' unseen_event fragments';
    }
    if (harvestResidue(gs, { limit: 3 }).length !== 3) return 'opts.limit did not bind';
    return true;
  })()`));

console.log('\n4. the nine sources, each with its negative control');

await check('player.ledger — participated and witnessed both land, and the window excludes the old one',
  api(`(() => {
    const pool = fullPool(fixture());
    const p = ofKind(pool, 'participated');
    const w = ofKind(pool, 'witnessed');
    if (p.length !== 1) return 'expected exactly the day-9 participated entry, got ' + p.length + ': ' + textsIn(p);
    if (p[0].npcId !== 'npc_bruno') return 'participated fragment is not attributed to Bruno';
    if (!p[0].text.includes('Bruno')) return 'participated fragment does not name Bruno: ' + p[0].text;
    if (w.length !== 1) return 'expected one witnessed fragment, got ' + w.length;
    if (!w[0].text.includes('Alma') || !w[0].text.includes('Bruno')) return 'the witnessed fragment names neither party: ' + w[0].text;
    // The day-2 cuddle is outside the 3-day window and must not appear.
    if (textsIn(pool).includes('lying against')) return 'a ledger entry older than residueDays leaked in';
    return true;
  })()`));

await check('an unrecognised ledger act still produces a fragment (the fallback clause)',
  api(`(() => {
    const gs = fixture();
    gs.player.ledger.npc_alma.push({ kind: 'participated', act: 'some_act_authored_next_year', day: 9, roomId: 'kitchen', otherNpcId: null, spent: false, outcome: null });
    const pool = fullPool(gs);
    const p = ofKind(pool, 'participated');
    if (p.length !== 2) return 'an unknown act was dropped instead of falling back: ' + textsIn(p);
    if (textsIn(p).includes('some_act_authored_next_year')) return 'the raw act id leaked into the clause';
    return true;
  })()`));

await check('queryDebugLog — ambient chatter and dialogue land as overheard; a captured PROMPT never does',
  api(`(() => {
    const pool = fullPool(fixture());
    const o = ofKind(pool, 'overheard');
    if (o.length !== 3) return 'expected 3 overheard fragments (ambient + npc line + player line), got ' + o.length + ': ' + textsIn(o);
    if (!textsIn(o).includes('talked in the hall')) return 'the ambient chatter fragment is missing';
    if (!textsIn(o).includes('You never say what you actually mean')) return 'the spoken line is missing';
    if (textsIn(pool).includes('ZZPROMPTLEAK')) return 'A CAPTURED MODEL PROMPT REACHED THE RESIDUE POOL';
    if (textsIn(pool).includes('branch')) return 'a movement log entry reached the pool';
    return true;
  })()`));

await check('D7 — an UNSEEN world event produces an unseen_event fragment and a SEEN one does not',
  api(`(() => {
    const pool = fullPool(fixture());
    const u = ofKind(pool, 'unseen_event');
    const texts = textsIn(u);
    if (!texts.includes('Alma and Bruno were alone together')) return 'the unseen event did not produce a fragment: ' + texts;
    if (texts.includes('did the washing up')) return 'a seenByPlayer event leaked into the pool — D7 is about what the player did NOT see';
    const frag = u.find(f => f.text.includes('alone together'));
    if (frag.npcId !== 'npc_alma') return 'the fragment is not attributed to the event npc';
    if (frag.roomId !== 'kitchen') return 'the fragment lost its roomId';
    if (!frag.sourceKey || !frag.sourceKey.startsWith('evt:')) return 'no sourceKey minted — D9 has nothing to dedupe on';
    return true;
  })()`));

await check('D2 — harvesting does NOT flip seenByPlayer on the event it read',
  api(`(() => {
    const gs = fixture();
    harvestResidue(gs);
    return gs.world.events[0].seenByPlayer === false
      || 'harvestResidue flipped seenByPlayer — that is a state write, and it would eat the "While you were asleep" batch';
  })()`));

await check("D9 — an event whose key is already in consumedEventIds is skipped",
  api(`(() => {
    const gs = fixture();
    const key = fullPool(gs).find(f => f.sourceKey).sourceKey;
    gs.world.dreams.consumedEventIds.push(key);
    const after = fullPool(gs);
    if (after.some(f => f.sourceKey === key)) return 'a consumed event was harvested again — the same night gets dreamt twice';
    // The key must be stable across harvests, or the ring never matches.
    const gs2 = fixture();
    if (fullPool(gs2).find(f => f.sourceKey).sourceKey !== key) return 'the event key is not stable between saves';
    return true;
  })()`));

await check('npc.memory.episodes — a TAGGED live episode lands; untagged and decayed ones do not',
  api(`(() => {
    const pool = fullPool(fixture());
    const texts = textsIn(pool);
    if (!texts.includes('neither of them said the thing')) return 'the tagged episode did not produce a fragment';
    if (texts.includes('put the recycling out')) return 'an UNTAGGED episode leaked in — the plan filters on emotionalTag';
    if (texts.includes('nearly gone')) return 'an episode below the decay floor leaked in';
    const frag = pool.find(f => f.text.includes('said the thing'));
    if (frag.kind !== 'unseen_event') return 'an episode came back as ' + frag.kind + ' — the SIDE is what the player never saw';
    if (!frag.text.includes('Alma')) return 'the episode fragment does not say whose side it is';
    return true;
  })()`));

await check('relPlayer — a fresh grievance produces a grievance fragment NAMING them; a resolved one does not',
  api(`(() => {
    const pool = fullPool(fixture());
    const g = ofKind(pool, 'grievance');
    const named = g.find(f => f.npcId === 'npc_alma' && f.text.includes('Alma') && f.text.includes('dishes'));
    if (!named) return "Alma's unresolved grievance is missing from: " + textsIn(g);
    if (textsIn(pool).includes('about the interview')) return "Bruno's RESOLVED grievance leaked in";
    return true;
  })()`));

await check('relPlayer — desire above the threshold is appetite, tension above it is grievance, and neither fires below',
  api(`(() => {
    const R = DREAM_TUNING.residue;
    const pool = fullPool(fixture());
    const appetite = ofKind(pool, 'appetite');
    if (!appetite.some(f => f.npcId === 'npc_alma')) return 'Alma at desire 0.7 produced no appetite fragment';
    if (appetite.some(f => f.npcId === 'npc_bruno')) return 'Bruno at desire 0.05 produced one anyway';
    const tension = ofKind(pool, 'grievance').filter(f => f.npcId === 'npc_bruno');
    if (!tension.length) return 'Bruno at tension 0.6 produced no tension fragment';
    if (ofKind(pool, 'grievance').some(f => f.npcId === 'npc_alma' && f.text.includes('quietly bad'))) {
      return 'Alma at tension 0.1 produced one anyway';
    }
    // Negative desire is aversion, not attraction, and must read differently.
    const gs = fixture();
    gs.npcs.npc_alma.relPlayer.desire = -0.9;
    const flipped = fullPool(gs).find(f => f.kind === 'appetite' && f.npcId === 'npc_alma');
    if (!flipped) return 'a strongly negative desire produced nothing';
    if (flipped.text === appetite.find(f => f.npcId === 'npc_alma').text) return 'aversion reads identically to attraction';
    return true;
  })()`));

await check('afterHours.searchHistory — an in-window search lands, an old one does not',
  api(`(() => {
    const pool = fullPool(fixture());
    if (!textsIn(pool).includes('sleep through a whole night')) return 'the late-night search produced no fragment';
    if (textsIn(pool).includes('"stale"')) return 'a day-1 search leaked past the residueDays window';
    return true;
  })()`));

await check('obligations — a near-expiry quest and an overdue bill land; a distant quest and a paid bill do not',
  api(`(() => {
    const pool = fullPool(fixture());
    const o = ofKind(pool, 'obligation');
    const texts = textsIn(o);
    if (!texts.includes('Ask Alma about the band')) return 'the quest expiring tomorrow produced nothing: ' + texts;
    if (texts.includes('weeks left on it')) return 'a quest with weeks left registered as an obligation';
    if (!texts.includes('rent')) return 'the overdue rent produced nothing: ' + texts;
    if (texts.includes('water')) return 'a bill neither due nor overdue registered anyway';
    if (texts.includes('gas')) return 'a bill with a zero balance registered anyway';
    // Overdue outranks merely-approaching, which is the whole point of the
    // rent pressure this game is built on.
    const gs = fixture();
    gs.world.bills.water.dueDay = 11;
    const both = fullPool(gs).filter(f => f.kind === 'obligation');
    const rent = both.find(f => f.text.includes('rent'));
    const water = both.find(f => f.text.includes('water'));
    if (!water) return 'a bill due tomorrow still produced nothing';
    if (!(rent.weight > water.weight)) return 'overdue rent (' + rent.weight + ') does not outweigh a bill due tomorrow (' + water.weight + ')';
    return true;
  })()`));

await check('possessions — owned stacks land singular-first, and _unknown never does',
  api(`(() => {
    const pool = fullPool(fixture());
    const p = ofKind(pool, 'possession');
    if (!p.length) return 'no possession fragments at all';
    if (textsIn(p).includes('_unknown') || textsIn(p).includes('a thing')) return 'an _unknown stack leaked in';
    for (const f of p) if (!f.itemId) return 'a possession fragment carries no itemId';
    return true;
  })()`));

await check('absence — a long silence registers and a recent conversation does not',
  api(`(() => {
    const pool = fullPool(fixture());
    const a = ofKind(pool, 'absence');
    if (a.length !== 1) return 'expected exactly Bruno, got ' + a.length + ': ' + textsIn(a);
    if (a[0].npcId !== 'npc_bruno') return 'the wrong NPC registered as absent';
    if (!a[0].text.includes('Bruno')) return 'the absence fragment does not name them';
    // It should grow with the gap and then stop growing.
    const far = fixture(); far.npcs.npc_bruno.relPlayer.lastInteractionDay = -60;
    const near = fixture(); near.npcs.npc_bruno.relPlayer.lastInteractionDay = 2;
    const fw = fullPool(far).find(f => f.kind === 'absence').weight;
    const nw = fullPool(near).find(f => f.kind === 'absence').weight;
    if (!(fw >= nw)) return 'a longer silence scored lower';
    if (fw > DREAM_TUNING.residue.kindWeights.absence) return 'the absence term ran past its own base weight';
    return true;
  })()`));

console.log('\n5. the window and the option overrides');

// The four kinds that are purely EVENTS. The other five are standing state
// (a grievance, a desire, a tension, an absence, a possession) and are
// deliberately not windowed — see the `day` comment on makeResidueFragment.
api(`function eventKinds() { return ['participated', 'witnessed', 'overheard', 'unseen_event']; }`);

await check('opts.day and opts.residueDays both move the window',
  api(`(() => {
    const gs = fixture();
    // Every EVENT in this fixture is dated day 8-9. Harvest at day 40 and all
    // four event kinds must fall out; the standing-state kinds stay, because
    // an unresolved grievance is still unresolved a month later.
    const far = harvestResidue(gs, { day: 40, limit: 9999 });
    for (const f of far) {
      if (eventKinds().includes(f.kind)) return 'a ' + f.kind + ' fragment survived a day-40 harvest: ' + f.text;
    }
    if (!far.length) return 'a day-40 harvest returned nothing — the standing sources were windowed out too';
    // A one-day window keeps day 9 and 10 and drops day 8.
    const tight = harvestResidue(gs, { residueDays: 1, limit: 9999 });
    if (tight.some(f => eventKinds().includes(f.kind) && f.day === 8)) return 'residueDays: 1 still admitted a day-8 event';
    if (!tight.some(f => eventKinds().includes(f.kind) && f.day === 9)) return 'residueDays: 1 dropped day 9 as well';
    // ...and a wide one brings the day-2 cuddle back, proving the window is
    // the only thing that was excluding it.
    const wide = harvestResidue(gs, { residueDays: 30, limit: 9999 });
    if (!textsIn(wide).includes('lying against')) return 'a wide window did not recover the old ledger entry';
    return true;
  })()`));

await check('a save with no clock harvests at day 1 instead of throwing',
  api(`(() => {
    const gs = fixture();
    delete gs.meta.clock;
    const out = harvestResidue(gs);
    if (!Array.isArray(out)) return 'no clock threw or returned a non-array';
    // Every event is dated day 8-9, in the future of the day-1 fallback, so
    // no event may survive. Standing state has no window and still does.
    for (const f of out) {
      if (eventKinds().includes(f.kind)) return 'a future-dated ' + f.kind + ' survived: ' + f.text;
    }
    return true;
  })()`));

console.log('\n6. harvestItemMotifs — DREAM_MOTIFS shape, built at harvest time');

await check('item motifs carry the same fields the authored motifs do',
  api(`(() => {
    const motifs = harvestItemMotifs(fixture());
    if (!motifs.length) return 'a save with inventory produced no item motifs';
    const authored = Object.values(DREAM_MOTIFS)[0];
    const need = ['id', 'label', 'weight', 'text', 'directive', 'imageFragment'];
    for (const f of need) if (authored[f] === undefined) return 'the authored motif shape changed: no ' + f;
    for (const m of motifs) {
      for (const f of need) {
        if (typeof m[f] === 'string' ? !m[f].trim() : !Number.isFinite(m[f])) return 'item motif ' + m.id + ' has no usable ' + f;
      }
      if (!m.id.startsWith('item:')) return 'item motif id is not namespaced: ' + m.id;
      if (DREAM_MOTIFS[m.id]) return 'an item motif collides with an authored one: ' + m.id;
      // weightedPick reads 0 as 1 (the defs.dreams.js trap).
      if (m.weight <= 0) return 'item motif ' + m.id + ' has weight ' + m.weight;
    }
    if (motifs.some(m => m.id === 'item:_unknown')) return 'an _unknown stack became a motif';
    if (motifs.length > DREAM_TUNING.residue.itemMotifCap) return 'itemMotifCap ignored';
    // Deterministic, and stable across duplicate stacks of one defId.
    const gs = fixture();
    gs.player.inventory.push({ defId: 'coffee_mug', qty: 2, ownerId: 'player', meta: {} });
    const twice = harvestItemMotifs(gs);
    if (twice.filter(m => m.id === 'item:coffee_mug').length !== 1) return 'two stacks of one item became two motifs';
    if (JSON.stringify(harvestItemMotifs(fixture())) !== JSON.stringify(motifs)) return 'harvestItemMotifs is not deterministic';
    return true;
  })()`));

console.log('\n7. against a REAL generated house');

await check('a freshly generated house harvests without throwing and produces a legal pool',
  api(`(() => {
    const h = house('residue-real', 3);
    const pool = harvestResidue(h);
    if (!Array.isArray(pool)) return 'a real house did not return an array';
    for (const f of pool) {
      if (!DREAM_RESIDUE_KINDS.includes(f.kind)) return 'unknown kind from a real house: ' + f.kind;
      if (!(f.weight > 0 && f.weight <= 1)) return 'illegal weight from a real house: ' + f.weight;
      for (const id of Object.keys(h.npcs)) if (f.text.includes(id)) return 'a real npcId leaked: ' + f.text;
    }
    return true;
  })()`));

await check('a played-in house — twelve ticks of sim — still harvests cleanly and stays pure',
  api(`(() => {
    const h = house('residue-played', 3);
    for (let i = 0; i < 12; i++) resolveTick(h);
    const before = JSON.stringify(h);
    const pool = harvestResidue(h);
    if (JSON.stringify(h) !== before) return 'harvesting a played house mutated it';
    if (!Array.isArray(pool)) return 'a played house did not return an array';
    if (pool.length > DREAM_TUNING.residue.poolCap) return 'poolCap ignored on a real save';
    return true;
  })()`));

console.log('\n8. inertness — Phase 3 changes no clock or needs accounting');

await check('harvesting between ticks moves neither the clock nor a single point of energy',
  api(`(() => {
    // Phase 3 adds no sleep hook, so the honest assertion is that a save the
    // harvester has run over resolves exactly like one it has not.
    const harvested = house('residue-inert', 2);
    const control = house('residue-inert', 2);
    for (let i = 0; i < 12; i++) {
      harvestResidue(harvested);
      harvestItemMotifs(harvested);
      resolveTick(harvested);
      resolveTick(control);
    }
    if (harvested.meta.clock.day !== control.meta.clock.day || harvested.meta.clock.minutes !== control.meta.clock.minutes) {
      return 'the clock diverged: ' + JSON.stringify(harvested.meta.clock) + ' vs ' + JSON.stringify(control.meta.clock);
    }
    if (harvested.player.energy !== control.player.energy) {
      return 'player energy diverged: ' + harvested.player.energy + ' vs ' + control.player.energy;
    }
    if (JSON.stringify(harvested.world.dreams) !== JSON.stringify(control.world.dreams)) {
      return 'world.dreams diverged — the harvester wrote to its own subtree';
    }
    return true;
  })()`));

console.log('\n9. the save/load round trip');

await check('the pool harvested after a real write/load cycle is IDENTICAL to the one before it',
  api(`(async () => {
    // Both halves of the standing per-phase obligation in one assertion: the
    // world.dreams round trip still holds, and — because a reload rebuilds
    // every object from JSON with fresh key ordering — the pool cannot be
    // depending on property insertion order anywhere.
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-residue', clock: { day: 1, minutes: 0 } });
    const h = house('rt-residue', 2);
    const ids = Object.keys(h.npcs);
    h.player.ledger = { [ids[1]]: [{ kind: 'participated', act: 'sex', day: h.meta.clock.day, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }] };
    h.npcs[ids[0]].relPlayer.grievances = [{ text: 'You left the dishes in the sink again', severity: 0.6, day: h.meta.clock.day, resolved: false }];
    h.world.events.push({ day: h.meta.clock.day, tick: 3, roomId: 'kitchen', npcId: ids[0], type: 'chore', moodDelta: 0, data: {}, template: '{name} was in the kitchen for a long time.', seenByPlayer: false });
    h.world.dreams.consumedEventIds.push('evt:already-spent');
    h.world.dreams.nextIndex = 4;

    const before = harvestResidue(h);
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();

    const d = loaded.world.dreams;
    if (!d || d.nextIndex !== 4 || d.consumedEventIds[0] !== 'evt:already-spent') {
      return 'world.dreams did not survive the round trip: ' + JSON.stringify(d);
    }
    const after = harvestResidue(loaded);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return 'the pool changed across a save/load:\\n  before ' + JSON.stringify(before) + '\\n  after  ' + JSON.stringify(after);
    }
    if (!before.length) return 'the fixture produced no fragments, so this proved nothing';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
