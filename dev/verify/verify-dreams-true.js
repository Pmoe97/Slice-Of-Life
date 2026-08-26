// Dream Engine Phase 9 — true dreams (D9) and recurring dreams (D11).
// (src/ref/complete/dream-engine-plan.md)
//
// The last phase. Two new dream classes, both compiled deterministically off
// the save like Phase 4's distorted class:
//
//   TRUE      — replays, faithfully and from the outside, something real the
//               player never witnessed: an off-screen world event or an NPC
//               episode. The place is pinned to distortion 'none' (D9), the
//               residue is exactly the one event, and the source key goes
//               into the D9 ring when the dream is shown.
//   RECURRING — re-runs an already-shown diary dream: same form, setting,
//               cast and motif, with one beat shifted and the lens/tempo/
//               register/perspective re-rolled (D11, D28(c)).
//
// The assertions below aim at the same four things every compiler harness
// aims at, plus the class-specific promises:
//   DETERMINISM — same save + same index in, deep-equal record out; and the
//                 fallback from a 'true'/'recurring' roll that finds no
//                 material is BYTE-IDENTICAL to a direct distorted roll
//                 (design invariant 5 — the class branch never shifts the
//                 stream).
//   ISOLATION   — the new branches draw from the dream's own RNG only.
//   PURITY      — true/recurring read the knowledge/relationship/NPC-memory
//                 systems and write nothing, including to world.dreams
//                 (design invariant 2); a recurring record never aliases its
//                 diary origin.
//   THE CONTRACT— every beat still has a replayDirective for the true branch,
//                 the true dream's residue IS its event, the recurring dream
//                 preserves what D11/D28(c) say to preserve, and both kinds
//                 file their source keys (evt: and epi:) through the D9 ring.
const { loadEngine } = require('./loadgame.js');
// image.js is deliberately NOT in `required` (see verify-dreams-compile.js:
// its last statement needs a window shim the vm does not have). llm.js loads
// fine and is needed for buildDreamPrompt's class-specific wording.
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'llm.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
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
  // A save with exactly one true-dream source: an off-screen world event a
  // day before the current night. Same skeleton the Phase 4 fixture uses, so
  // both classes compile against the same roster. over lets a check build
  // the event-only / episode-only / diary-only variants it needs.
  function fixture(over) {
    const gs = {
      meta: { seed: 'p9-fixture', clock: { day: 10, minutes: 1380 }, sessionLog: [] },
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
        ledger: {},
      },
      npcs: {
        npc_alma: {
          bible: { name: 'Alma', surname: 'Reyes', age: 30, gender: 'female', species: 'human',
            physical: {
              hair: { color: 'auburn', length: 'long', texture: 'wavy', style: 'loose' },
              eyes: { color: 'brown', shape: 'round' },
              skin: { tone: 'brown', texture: 'freckled' },
              face: { shape: 'heart', nose: 'small', lips: 'thin' },
              body: { shape: 'curvy' },
            } },
          residency: { room: 'bedroom_1', status: 'resident' },
          relPlayer: { desire: 0.1, tension: 0.1, lastInteractionDay: 1, grievances: [] },
          memory: { episodes: [] },
        },
        npc_bruno: {
          bible: { name: 'Bruno', surname: 'Vance', age: 34, gender: 'male', species: 'human',
            physical: {
              hair: { color: 'dark brown', length: 'cropped', texture: 'straight', style: 'neat' },
              eyes: { color: 'hazel', shape: 'deep-set' },
              skin: { color: 'pale', texture: 'weathered' },
              face: { shape: 'square', nose: 'broad', lips: 'thin' },
              body: { shape: 'broad' },
            } },
          residency: { room: 'bedroom_2', status: 'resident' },
          relPlayer: { desire: 0.1, tension: 0.1, lastInteractionDay: 1, grievances: [] },
          memory: { episodes: [] },
        },
      },
      world: {
        events: [
          { day: 9, tick: 20, roomId: 'living_room', npcId: 'npc_bruno', type: 'intimate', moodDelta: 0.05,
            data: { other: 'npc_alma' }, template: '{name} and {other} were alone together for a while.', seenByPlayer: false },
        ],
        debugLog: [],
        afterHours: { searchHistory: [] },
        quests: { active: [], completed: [] },
        bills: { rent: { dueDay: 5, balance: 900, status: 'overdue', overdueDays: 5, cutoffActive: false, autopay: false } },
        dreams: defaultDreamState(),
      },
    };
    if (over) over(gs);
    return gs;
  }

  function compileMany(n, opts, over) {
    const gs = fixture(over);
    const out = [];
    for (let i = 1; i <= n; i++) out.push(compileDream(gs, Object.assign({ index: i }, opts || {})));
    return out;
  }

  // The first compile (across indexes) that came out as kind, or null.
  function findKind(gs, kind, from, to, opts) {
    for (let i = from; i <= to; i++) {
      const d = compileDream(gs, Object.assign({ index: i }, opts || {}));
      if (d && d.kind === kind) return d;
    }
    return null;
  }

  // A tagged, fresh, high-weight episode for the episode-sourcing checks.
  function sampleEpisode() {
    return { day: 8, text: 'Alma asked me to keep something from her', emotionalTag: 'grievance', importance: 1, decay: 1 };
  }

  // The in-memory kv (the food-harness convention) so writeGeneratedGameState
  // and loadGameState run for real.
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

async function main() {

console.log('\n1. registration — Phase 9 landed in all three files');

await check('the new compiler symbols resolve',
  api(`(() => {
    for (const n of ['selectTrueDreamSource', 'compileTrueDream', 'compileRecurringDream', 'selectRecurringSource', 'finishDreamRecord', 'dreamEpisodeKey', 'rollDreamKind']) {
      if (typeof eval(n) !== 'function') return n + ' is missing — dreams.js did not load, or Phase 9 did not land';
    }
    if (typeof buildDreamReplayBlock !== 'function') return 'buildDreamReplayBlock is missing from llm.js';
    return true;
  })()`));

await check('every beat in every form carries a replayDirective (D6 — the true branch reads it by id)',
  api(`(() => {
    let beats = 0;
    for (const fid of Object.keys(DREAM_FORMS)) {
      for (const b of DREAM_FORMS[fid].beats) {
        beats++;
        if (typeof b.replayDirective !== 'string' || b.replayDirective.length < 20) return fid + '.' + b.id + ' has no usable replayDirective';
      }
    }
    return beats === 21 || 'expected 21 beats across all forms, found ' + beats;
  })()`));

await check('the class dials exist and are sane, and live in DREAM_TUNING',
  api(`(() => {
    const T = DREAM_TUNING;
    if (!(T.trueDreamChance > 0 && T.trueDreamChance < 1)) return 'trueDreamChance is ' + T.trueDreamChance;
    if (!(T.recurrenceChance > 0 && T.recurrenceChance < 1)) return 'recurrenceChance is ' + T.recurrenceChance;
    if (T.trueDreamChance + T.recurrenceChance > 0.9) return 'the two class chances crowd out the distorted class entirely';
    return true;
  })()`));

console.log('\n2. TRUE DREAMS — off-screen world events (D9)');

await check("a save with one unseen day-9 event compiles 'true' dreams sourcing exactly it",
  api(`(() => {
    const gs = fixture();
    const key = dreamEventKey(gs.world.events[0]);
    const d = findKind(gs, 'true', 1, 400);
    if (!d) return 'no true dream in 400 indexes against a live source';
    if (d.kind !== 'true') return 'kind is ' + d.kind;
    if (d.recurrenceOf !== null) return 'a true dream claims a recurrence';
    if (d.shiftedBeat !== null) return 'a true dream claims a shifted beat';
    if (d.slots.distortion !== 'none') return 'a true dream did not pin the place to undistorted: ' + d.slots.distortion;
    if (d.residue.length !== 1) return 'a true dream carries ' + d.residue.length + ' residue fragments, expected exactly the event';
    if (d.residue[0].sourceKey !== key) return 'the true dream residue is not the event';
    if (JSON.stringify(d.source.eventIds) !== JSON.stringify([key])) return 'source.eventIds is ' + JSON.stringify(d.source.eventIds);
    if (d.source.episodeKeys.length !== 0) return 'a world-event true dream spent episode keys: ' + JSON.stringify(d.source.episodeKeys);
    const form = DREAM_FORMS[d.slots.form];
    if (d.panels.length !== form.beats.length) return 'panel count disagreed with the form';
    for (let i = 0; i < d.panels.length; i++) {
      if (d.panels[i].beat !== form.beats[i].id) return 'panel ' + i + ' carries the wrong beat';
      if (d.panels[i].seed !== hashStr(composeDreamPanelKey(d, i))) return 'panel ' + i + ' seed does not match its cache key';
      if (d.panels[i].text !== '') return 'panel ' + i + ' has prose before the writer has run';
    }
    // The cast is the event's participant, not a stranger drawn from nowhere.
    if (d.cast.some((c) => c.npcId !== 'npc_bruno')) return 'a true dream cast somebody the event did not name';
    if (d.cast.some((c) => c.role === 'absent')) return 'the event\\'s own participant was cast as absent';
    return true;
  })()`));

await check('a true dream is deterministic — two copies of the save, same index, deep-equal',
  api(`(() => {
    const a = fixture(), b = fixture();
    const da = findKind(a, 'true', 1, 400);
    if (!da) return 'no true dream found to compare';
    const idx = da.index;
    const db = compileDream(b, { index: idx });
    if (db.kind !== 'true') return 'index ' + idx + ' compiled as ' + db.kind + ' on the second copy';
    return JSON.stringify(da) === JSON.stringify(db) || 'two identical saves compiled different true dreams';
  })()`));

await check('the D9 fallback is byte-identical to a direct distorted roll (design invariant 5)',
  api(`(() => {
    // Consume the event, and compare against a save that never had it. If the
    // true branch left the rng anywhere other than where a distorted cast
    // expects it, the two saves would diverge at the first 'true' index.
    const consumed = fixture(g => { g.world.dreams.consumedEventIds = [dreamEventKey(g.world.events[0])]; });
    const none = fixture(g => { g.world.events = []; });
    for (let i = 1; i <= 200; i++) {
      const a = compileDream(consumed, { index: i });
      const b = compileDream(none, { index: i });
      if (a.kind !== 'distorted') return 'a save with nothing left to dream compiled a ' + a.kind;
      if (JSON.stringify(a) !== JSON.stringify(b)) return 'index ' + i + ' diverged between the consumed save and the eventless save — the class branch shifted the stream';
    }
    return true;
  })()`));

await check('a class branch that finds no material draws NOTHING before falling back (invariant 5)',
  api(`(() => {
    // The byte-identical check below compares two saves that BOTH fall back,
    // so it cannot see a draw added on the true/recurring path — both copies
    // would take it and stay equal. This pins rollDreamKind to 'distorted'
    // (still spending its two reserved draws, D31) and asserts the records are
    // unchanged against the real roll on a save with nothing to source. If a
    // branch drew even once before discovering it had no material, every
    // dream after that roll would re-cast, in every existing save.
    const gs = fixture(g => { g.world.events = []; });
    const real = rollDreamKind;
    const withBranches = [];
    for (let i = 1; i <= 120; i++) withBranches.push(JSON.stringify(compileDream(gs, { index: i })));
    try {
      rollDreamKind = (rng) => { rng(); rng(); return 'distorted'; };
      for (let i = 1; i <= 120; i++) {
        const pinned = JSON.stringify(compileDream(gs, { index: i }));
        if (pinned !== withBranches[i - 1]) return 'index ' + i + ' re-cast when the class roll was pinned — a branch moved the stream before falling back';
      }
    } finally { rollDreamKind = real; }
    return true;
  })()`));

await check("a spent event is never dreamt twice, and 'true' can no longer fire (D9 ring)",
  api(`(() => {
    const gs = fixture(g => { g.world.dreams.consumedEventIds = [dreamEventKey(g.world.events[0])]; });
    for (let i = 1; i <= 300; i++) {
      const d = compileDream(gs, { index: i });
      if (d.kind === 'true') return 'a true dream fired from a fully spent source ring';
      if (d.kind !== 'distorted') return 'a non-distorted kind appeared with nothing to source it: ' + d.kind;
    }
    return true;
  })()`));

await check("a current-night event (day == nightDay, still unseen) is never dreamt",
  api(`(() => {
    const gs = fixture(g => {
      g.world.events.push({ day: 10, tick: 25, roomId: 'kitchen', npcId: 'npc_bruno', type: 'chore', moodDelta: 0,
        data: {}, template: '{name} stayed up later than usual in the kitchen.', seenByPlayer: false });
    });
    const todayKey = dreamEventKey(gs.world.events[1]);
    const d = findKind(gs, 'true', 1, 400);
    if (!d) return 'no true dream against the day-9 source, so this proved nothing';
    if (d.source.eventIds.includes(todayKey)) return 'a true dream sourced tonight\\'s event';
    if (JSON.stringify(d.source.eventIds) !== JSON.stringify([dreamEventKey(gs.world.events[0])])) return 'the true dream did not source the day-9 event';
    return true;
  })()`));

await check("an event the player already WITNESSED is never dreamt as true (the other half of D9)",
  api(`(() => {
    // D9 has two mechanisms and the day rule is only one of them. The other is
    // seenByPlayer, and it is the one that covers the pre-midnight half of a
    // night: doSleep narrates the last two batch events as "While you were
    // asleep: ..." and flips seenByPlayer on exactly those, so the dream must
    // not then replay what the morning already told the player. Without a
    // fixture whose event is SEEN, that guard is untestable and its removal
    // would be silent - which is how it was missing from this harness.
    const seenOnly = fixture(g => { g.world.events[0].seenByPlayer = true; });
    for (let i = 1; i <= 300; i++) {
      const d = compileDream(seenOnly, { index: i });
      if (d.kind === 'true') return 'a true dream replayed an event the player had already been told about';
    }
    // ...and the same save with the flag cleared still dreams, so the check
    // above is the flag doing the work rather than the fixture being barren.
    const unseen = fixture();
    if (!findKind(unseen, 'true', 1, 300)) return 'the unseen twin produced no true dream, so this proved nothing';
    return true;
  })()`));

await check("a save with ONLY a current-night event compiles no true dreams at all (D9 day rule)",
  api(`(() => {
    const gs = fixture(g => {
      g.world.events = [{ day: 10, tick: 25, roomId: 'kitchen', npcId: 'npc_bruno', type: 'chore', moodDelta: 0,
        data: {}, template: '{name} stayed up later than usual in the kitchen.', seenByPlayer: false }];
    });
    for (let i = 1; i <= 300; i++) {
      const d = compileDream(gs, { index: i });
      if (d.kind === 'true') return 'a current-night event was dreamt as true';
      if (d.kind !== 'distorted') return 'unexpected kind ' + d.kind + ' with no diary and no eligible event';
    }
    return true;
  })()`));

console.log('\n3. TRUE DREAMS — NPC episodes (D7, D9)');

await check("a tagged, in-window episode can be the whole source of a true dream",
  api(`(() => {
    const ep = sampleEpisode();
    const gs = fixture(g => { g.world.events = []; g.npcs.npc_bruno.memory.episodes = [ep]; });
    const d = findKind(gs, 'true', 1, 400);
    if (!d) return 'no true dream in 400 indexes against a live episode';
    const epKey = dreamEpisodeKey('npc_bruno', ep);
    if (JSON.stringify(d.source.episodeKeys) !== JSON.stringify([epKey])) return 'episodeKeys is ' + JSON.stringify(d.source.episodeKeys);
    if (d.source.eventIds.length !== 0) return 'an episode true dream also spent event ids';
    if (d.residue.length !== 1) return 'an episode true dream should carry exactly the episode';
    return true;
  })()`));

await check("untagged, out-of-window and decayed episodes never source a true dream",
  api(`(() => {
    const gs = fixture(g => {
      g.world.events = [];
      g.npcs.npc_bruno.memory.episodes = [
        { day: 8, text: 'untagged filler', emotionalTag: '', importance: 1, decay: 1 },
        { day: 8, text: 'decayed thing', emotionalTag: 'grievance', importance: 1, decay: 0.1 },
        { day: 3, text: 'too old to dream', emotionalTag: 'grievance', importance: 1, decay: 1 },
      ];
    });
    for (let i = 1; i <= 300; i++) {
      const d = compileDream(gs, { index: i });
      if (d.kind === 'true') return 'a true dream fired from an ineligible episode';
      if (d.kind !== 'distorted') return 'unexpected kind ' + d.kind;
    }
    return true;
  })()`));

await check("a spent episode key retires its episode the same way a spent event does",
  api(`(() => {
    const ep = sampleEpisode();
    const gs = fixture(g => {
      g.world.events = [];
      g.npcs.npc_bruno.memory.episodes = [ep];
      g.world.dreams.consumedEventIds = [dreamEpisodeKey('npc_bruno', ep)];
    });
    for (let i = 1; i <= 300; i++) {
      const d = compileDream(gs, { index: i });
      if (d.kind === 'true') return 'a spent episode was dreamt again';
    }
    return true;
  })()`));

console.log('\n4. RECURRING DREAMS (D11, D28(c))');

await check("a shown diary dream re-runs with form, setting, cast and motif preserved",
  api(`(() => {
    // Build the origin from an eventless save so it is guaranteed distorted,
    // then park it in the diary the way fileDreamToDiary would (newest first).
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    if (origin.kind !== 'distorted') return 'setup broke: the origin should be distorted';
    origin.status = 'shown';
    origin.panels.forEach((p, i) => { p.text = 'The first time, panel ' + i + ' read like this.'; });
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });

    const d = findKind(gs, 'recurring', 1, 400);
    if (!d) return 'no recurring dream in 400 indexes against a shown diary entry';
    if (d.recurrenceOf !== origin.id) return 'recurrenceOf is ' + d.recurrenceOf + ', expected ' + origin.id;
    if (d.slots.form !== origin.slots.form) return 'the recurring dream changed its form';
    if (JSON.stringify(d.slots.setting) !== JSON.stringify(origin.slots.setting)) return 'the recurring dream changed its place (D28(c))';
    if (JSON.stringify(d.cast) !== JSON.stringify(origin.cast)) return 'the recurring dream changed its cast';
    if (JSON.stringify(d.motif) !== JSON.stringify(origin.motif)) return 'the recurring dream changed its motif';
    if (JSON.stringify(d.source.eventIds) !== JSON.stringify(origin.source.eventIds)) return 'the recurring dream changed its spent event ids';
    if (JSON.stringify(d.source.episodeKeys) !== JSON.stringify(origin.source.episodeKeys)) return 'the recurring dream changed its spent episode keys';
    const form = DREAM_FORMS[d.slots.form];
    if (!form.beats.some((b) => b.id === d.shiftedBeat)) return 'shiftedBeat ' + d.shiftedBeat + ' is not a beat of ' + form.id;
    if (d.panels.length !== form.beats.length) return 'panel count disagreed with the form';
    for (let i = 0; i < d.panels.length; i++) if (d.panels[i].beat !== form.beats[i].id) return 'panel ' + i + ' carries the wrong beat';
    if (d.slots.distortion === 'none') return 'a recurring dream pinned its place to undistorted — the distortion was re-rolled';
    return true;
  })()`));

await check("the re-telling actually varies — lens and tempo re-roll against the origin",
  api(`(() => {
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'shown';
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });
    let lensChanged = 0, tempoChanged = 0, seen = 0;
    for (let i = 1; i <= 400; i++) {
      const d = compileDream(gs, { index: i });
      if (d.kind !== 'recurring') continue;
      seen++;
      if (d.slots.lens !== origin.slots.lens) lensChanged++;
      if (d.slots.tempo !== origin.slots.tempo) tempoChanged++;
    }
    if (seen < 5) return 'only ' + seen + ' recurring dreams in 400, so this proved nothing';
    if (lensChanged === 0) return 'no recurring dream re-rolled its lens';
    if (tempoChanged === 0) return 'no recurring dream re-rolled its tempo';
    return true;
  })()`));

await check("a diary entry that was never SHOWN is not re-run",
  api(`(() => {
    // A compiled-but-unshown dream was never experienced, so repeating it
    // would be the first time. fileDreamToDiary is the only writer and it
    // always stamps 'shown', so this guard is purely defensive today — and a
    // defensive guard with no assertion is a guard nobody would notice
    // removing, which is exactly why it gets one.
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'rendered';
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });
    for (let i = 1; i <= 300; i++) {
      if (compileDream(gs, { index: i }).kind === 'recurring') return 'a dream the player never saw was re-run as a recurrence';
    }
    // The same diary marked shown DOES re-run, so the check above is the
    // status doing the work rather than the pool being empty.
    origin.status = 'shown';
    if (!findKind(gs, 'recurring', 1, 300)) return 'the shown twin produced no recurrence, so this proved nothing';
    return true;
  })()`));

await check("a nap never re-runs a night origin (D16)",
  api(`(() => {
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'shown';
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });
    for (let i = 1; i <= 200; i++) {
      const d = compileDream(gs, { index: i, forSleep: 'nap' });
      if (d.kind === 'recurring') return 'a nap re-ran a night dream';
    }
    return true;
  })()`));

await check("a recurring record never aliases its diary origin",
  api(`(() => {
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'shown';
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });
    const d = findKind(gs, 'recurring', 1, 400);
    if (!d) return 'no recurring dream found to test against';
    const diaryBefore = JSON.stringify(gs.world.dreams.diary[0]);
    // Every PRESERVED slot, not just the two that were copied first time
    // round: setting and motif are handed over from the origin as well, and a
    // reference passed instead of a copy makes the new dream and the memory it
    // re-runs the same object. Found by the Phase 9 tripwire pass — the
    // original assertion mutated only residue and cast, so the two uncopied
    // slots sat aliased and nothing said so.
    d.residue[0].text = 'MUTATED';
    d.cast.push({ npcId: 'npc_alma', role: 'figure' });
    d.slots.setting.roomId = 'MUTATED';
    d.motif.text = 'MUTATED';
    return JSON.stringify(gs.world.dreams.diary[0]) === diaryBefore || 'editing a recurring record changed its origin in the diary';
  })()`));

console.log('\n5. THE D9 RING — a shown true dream spends both key namespaces');

await check("filing a true dream pushes its episode keys into consumedEventIds",
  api(`(() => {
    const ep = sampleEpisode();
    const gs = fixture(g => { g.world.events = []; g.npcs.npc_bruno.memory.episodes = [ep]; });
    const d = findKind(gs, 'true', 1, 400);
    if (!d) return 'no true dream found to file';
    if (d.source.episodeKeys.length !== 1) return 'setup broke: the true dream did not spend an episode';
    gs.world.dreams.consumedEventIds = [];
    fileDreamToDiary(gs, d);
    const epKey = dreamEpisodeKey('npc_bruno', ep);
    if (!gs.world.dreams.consumedEventIds.includes(epKey)) return 'the episode key was not spent on filing';
    if (gs.world.dreams.consumedEventIds.some((k) => !String(k).startsWith('epi:'))) return 'a non-episode key leaked into the ring';
    return true;
  })()`));

console.log('\n6. THE WRITER — buildDreamPrompt tells the class apart (D1, D9, D11)');

await check("a true dream's prompt is a faithful replay, with the place labelled exactly right",
  api(`(() => {
    const gs = fixture();
    const d = findKind(gs, 'true', 1, 400);
    if (!d) return 'no true dream found to prompt';
    const p = buildDreamPrompt(gs, d);
    if (!p.includes('THE EVENT TO REPLAY')) return 'the true prompt has no replay block';
    if (!p.includes('THE PLACE:')) return 'the true prompt does not label the place';
    if (p.includes('WHAT IS WRONG WITH THE PLACE')) return 'the true prompt still asks what is wrong with the place';
    if (!p.includes('Everything you describe is real')) return 'the true prompt lost its witness rule';
    if (p.includes('State the impossible thing flatly')) return 'the true prompt kept the distorted-class rule';
    const form = DREAM_FORMS[d.slots.form];
    const used = form.beats.some((b) => p.includes(b.replayDirective));
    if (!used) return 'no replayDirective reached the true prompt';
    return true;
  })()`));

await check("a recurring dream's prompt quotes the last time and flags the shift; a distorted one does neither",
  api(`(() => {
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'shown';
    origin.panels.forEach((p, i) => { p.text = 'The first time, panel ' + i + ' read like this.'; });
    const gs = fixture(g => { g.world.events = []; g.world.dreams.diary = [origin]; });
    const rec = findKind(gs, 'recurring', 1, 400);
    if (!rec) return 'no recurring dream found to prompt';
    const pi = DREAM_FORMS[rec.slots.form].beats.findIndex((b) => b.id === rec.shiftedBeat);
    if (pi < 0) return 'shiftedBeat points nowhere';
    const pr = buildDreamPrompt(gs, rec);
    if (!pr.includes('the last time this dream happened')) return 'the recurring prompt does not flag the shift';
    if (!pr.includes(origin.panels[pi].text)) return 'the recurring prompt does not quote the origin panel';
    if (pr.includes('THE EVENT TO REPLAY')) return 'a recurring dream used the true-dream replay block';
    if (pr.includes('Everything you describe is real')) return 'a recurring dream took the witness rule';

    const dist = compileDream(fixture(g => { g.world.events = []; }), { index: 7 });
    const pd = buildDreamPrompt(fixture(g => { g.world.events = []; }), dist);
    if (!pd.includes('WHAT IS WRONG WITH THE PLACE')) return 'a distorted dream lost its wrongness label';
    if (pd.includes('THE EVENT TO REPLAY')) return 'a distorted dream used the replay block';
    if (pd.includes('the last time this dream happened')) return 'a distorted dream claims a recurrence';
    return true;
  })()`));

console.log('\n7. ISOLATION — the new branches still never touch the global stream');

await check('true and recurring compiles leave the global cast generator byte-identical',
  api(`(() => {
    const before = JSON.stringify(SIM_generateHouse('p9-rng', 3, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    const ep = sampleEpisode();
    const gs = fixture(g => { g.world.events = []; g.npcs.npc_bruno.memory.episodes = [ep]; });
    const origin = compileDream(fixture(g => { g.world.events = []; }), { index: 1 });
    origin.status = 'shown';
    for (let i = 1; i <= 300; i++) {
      compileDream(gs, { index: i });
      compileDream(gs, { index: i, forSleep: 'nap' });
    }
    const after = JSON.stringify(SIM_generateHouse('p9-rng', 3, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    return before === after || 'the generated house changed after true/recurring compiles — a shared stream was touched';
  })()`));

await check('true and recurring compiles are pure — the save is not mutated, and Math.random is never reached',
  api(`(() => {
    const real = Math.random;
    Math.random = () => { throw new Error('a true/recurring compile drew from Math.random'); };
    try {
      const ep = sampleEpisode();
      const gs = fixture(g => { g.world.events = []; g.npcs.npc_bruno.memory.episodes = [ep]; });
      const before = JSON.stringify(gs);
      let touched = false;
      for (let i = 1; i <= 120; i++) {
        const d = compileDream(gs, { index: i });
        if (d.kind === 'true' || d.kind === 'recurring') touched = true;
      }
      if (!touched) return 'no true or recurring dream compiled, so this proved nothing';
      return JSON.stringify(gs) === before || 'a true/recurring compile mutated the save';
    } catch (e) {
      return e.message;
    } finally {
      Math.random = real;
    }
  })()`));

console.log('\n8. the save/load round trip — both new classes survive a real write/load');

await check('a true and a recurring dream park in the queue and come back identical',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'p9-rt', clock: { day: 10, minutes: 1380 } });
    const h = house('p9-rt', 2);
    h.meta.seed = 'p9-rt';
    h.meta.clock.day = 10;
    h.meta.clock.minutes = 1380;
    const ids = Object.keys(h.npcs);
    h.world.events.push({ day: 9, tick: 5, roomId: 'living_room', npcId: ids[0], type: 'intimate', moodDelta: 0,
      data: {}, template: '{name} was alone in the living room for a long time.', seenByPlayer: false });

    const trueD = findKind(h, 'true', 1, 400);
    if (!trueD) return 'no true dream compiled off the round-trip house';

    const origin = compileDream(h, { index: 401 });
    origin.status = 'shown';
    h.world.dreams.diary = [origin];
    const recD = findKind(h, 'recurring', 1, 400);
    if (!recD) return 'no recurring dream compiled off the round-trip house';

    const trueBefore = JSON.stringify(trueD);
    const recBefore = JSON.stringify(recD);
    h.world.dreams.queue = [trueD, recD];
    h.world.dreams.nextIndex = 500;

    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const st = loaded.world.dreams;
    if (!st || st.nextIndex !== 500) return 'world.dreams did not survive the round trip';
    if (!st.queue || st.queue.length !== 2) return 'the parked dreams did not survive';
    if (JSON.stringify(st.queue[0]) !== trueBefore) return 'the true record changed shape across a save/load';
    if (JSON.stringify(st.queue[1]) !== recBefore) return 'the recurring record changed shape across a save/load';
    if (st.queue[0].kind !== 'true' || st.queue[1].kind !== 'recurring') return 'the kinds did not survive the round trip';
    return true;
  })()`));

console.log('\n9. inertness — Phase 9 changes no clock or needs accounting');

await check('compiling true and recurring dreams between ticks moves neither the clock nor a point of energy',
  api(`(() => {
    const ep = sampleEpisode();
    const compiled = house('p9-inert', 2);
    const control = house('p9-inert', 2);
    compiled.world.events.push({ day: 1, tick: 3, roomId: 'living_room', npcId: Object.keys(compiled.npcs)[0], type: 'chore', moodDelta: 0, data: {}, template: '{name} was in the living room for a long time.', seenByPlayer: false });
    for (let i = 0; i < 12; i++) {
      compileDream(compiled, { index: i + 1 });
      compileDream(compiled, { index: i + 1, forSleep: 'nap' });
      resolveTick(compiled);
      resolveTick(control);
    }
    if (compiled.meta.clock.day !== control.meta.clock.day || compiled.meta.clock.minutes !== control.meta.clock.minutes) {
      return 'the clock diverged: ' + JSON.stringify(compiled.meta.clock) + ' vs ' + JSON.stringify(control.meta.clock);
    }
    if (compiled.player.energy !== control.player.energy) return 'player energy diverged';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
