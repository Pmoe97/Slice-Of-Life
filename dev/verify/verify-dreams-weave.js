// Dream Engine Phase 5 — the Dreamweaver.
// (src/ref/complete/dream-engine-plan.md)
//
// Phase 4 froze the skeleton; this phase fills panels[].text and nothing else.
// So the assertions below aim at four things:
//
//   THE LADDER      — a reply is READ, not trusted. Clean JSON, a fenced or
//                     prose-wrapped answer, a truncated one and a mangled one
//                     each land on a known tier; garbage lands on ok:false and
//                     the dream is templated rather than blank.
//   THE STRIP (D1)  — the writer returns panel prose and nothing else. A mood,
//                     a register, a title, a cast or a fourth panel volunteered
//                     in the reply is dropped HERE, not downstream, and the
//                     prompt never asks a structural question in the first
//                     place.
//   THE FALLBACK    — every form in DREAM_FORMS produces a legal, showable,
//                     fully-filled dream with no model at all, deterministically
//                     and without touching any RNG stream.
//   THE ONE WRITE   — applyDreamPanelText writes panels[].text and status and
//                     nothing else, refuses a partial, and the result survives
//                     a real save/load round trip inside world.dreams.queue.
//
// Like the other three dream harnesses this asserts INVARIANTS, never phrasing:
// "every beat has a fallback and it fills without leaving a placeholder", not
// "the fallback for `held` is exactly this sentence". Rewriting a template or
// retuning a bound leaves it green; breaking the contract does not.
const { loadEngine } = require('./loadgame.js');
// image.js is deliberately NOT in `required` — see the note in
// verify-dreams-compile.js. Nothing in Phase 5 borrows from it, but
// compileDream (used below for the integration assertions) does, so the
// symbols it needs are checked by name in section 1.
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'llm.js', 'x5.js', 'effects.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

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
  // A save with enough real material that compileDream has something to cast
  // from. Smaller than verify-dreams-compile.js' fixture on purpose: this
  // phase does not test selection, it tests what happens to the record after
  // selection, so all this needs to supply is two residents, some residue and
  // a motif history.
  function fixture(over) {
    const gs = {
      meta: { seed: 'weave-fixture', clock: { day: 10, minutes: 1380 }, sessionLog: [] },
      player: {
        energy: 60, location: 'bedroom_player', clothing: 'dressed',
        bible: {
          name: 'Wren', age: 27, gender: 'female', species: 'human',
          physical: {
            hair: { color: 'black', length: 'short', texture: 'straight', style: 'blunt' },
            eyes: { color: 'grey', shape: 'almond' }, skin: { tone: 'olive', texture: 'clear' },
            face: { shape: 'oval', nose: 'straight', lips: 'full' }, body: { shape: 'lean' },
          },
        },
        inventory: [{ defId: 'coffee_mug', qty: 1, ownerId: 'player', meta: {} }],
        ledger: {
          npc_alma: [{ kind: 'participated', act: 'sex', day: 9, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }],
        },
      },
      npcs: {
        npc_alma: {
          bible: { name: 'Alma', surname: 'Reyes', age: 30, gender: 'female', species: 'human' },
          residency: { room: 'bedroom_1', status: 'resident' },
          relPlayer: {
            desire: 0.7, tension: 0.5, affection: 0.5, trust: 0.6, comfort: 0.6, lastInteractionDay: 9,
            grievances: [{ text: 'You left the dishes in the sink again', severity: 0.6, day: 9, resolved: false }],
          },
          memory: { episodes: [] },
        },
        npc_bruno: {
          bible: { name: 'Bruno', surname: 'Vance', age: 34, gender: 'male', species: 'human' },
          residency: { room: 'bedroom_2', status: 'resident' },
          relPlayer: { desire: 0.1, tension: 0.2, affection: -0.4, trust: 0.1, comfort: 0.1, lastInteractionDay: 1, grievances: [] },
          memory: { episodes: [] },
        },
      },
      world: {
        events: [{ day: 9, tick: 20, roomId: 'living_room', npcId: 'npc_bruno', type: 'intimate', moodDelta: 0.05,
                   data: { other: 'npc_alma' }, template: '{name} and {other} were alone together for a while.', seenByPlayer: false }],
        debugLog: [], afterHours: { searchHistory: [{ query: 'how to sleep through a whole night', day: 9 }] },
        quests: { active: [], completed: [] },
        bills: { rent: { dueDay: 5, balance: 900, status: 'overdue', overdueDays: 5, cutoffActive: false, autopay: false } },
        dreams: defaultDreamState(),
      },
    };
    if (over) over(gs);
    return gs;
  }

  // A synthetic record for one named form, so the parse and fallback
  // assertions can cover EVERY form without hunting for a seed that rolls it.
  // Shaped exactly as compileDream returns, minus the image prompts nothing
  // here reads.
  function recordFor(formId, over) {
    const form = DREAM_FORMS[formId];
    const d = {
      id: 'dream_test_' + formId, seed: 12345, index: 1, kind: 'distorted',
      compiledDay: 10, compiledMinutes: 1380, forSleep: form.napOnly ? 'nap' : 'night',
      slots: {
        form: formId, perspective: 'second_person', tempo: 'languid', register: 'uncanny',
        lens: 'sodium_vapor', distortion: 'endless',
        setting: { settingId: 'home', sourceKind: 'apartment', roomId: 'kitchen' },
      },
      cast: [{ npcId: 'npc_alma', role: 'figure' }],
      motif: { motifId: 'payphone', text: DREAM_MOTIFS.payphone.text, carriedFrom: null },
      residue: [
        { kind: 'participated', weight: 0.9, text: 'a night with Alma that the kitchen still seems to be holding on to', npcId: 'npc_alma', roomId: 'kitchen', day: 9 },
        { kind: 'grievance', weight: 0.6, text: 'Alma has not put it down: you left the dishes in the sink again', npcId: 'npc_alma', day: 9 },
        { kind: 'possession', weight: 0.3, text: 'the coffee mug you have been carrying around', itemId: 'coffee_mug' },
      ],
      source: { eventIds: [], episodeKeys: [] },
      recurrenceOf: null,
      panels: form.beats.map((b, i) => ({ beat: b.id, prompt: 'frozen prompt ' + i, seed: 900 + i, text: '' })),
      wake: { moodDelta: -0.01, energyDelta: -1, band: 'unsettled' },
      status: 'compiled',
    };
    if (over) over(d);
    return d;
  }

  // A well-formed reply for a record, so the tier tests vary ONE thing each.
  function goodReplyFor(dream, words) {
    const body = Array(words || 50).fill('the still kitchen light holds').join(' ');
    return JSON.stringify({ panels: dream.panels.map(p => ({ beat: p.beat, text: body })) });
  }

  // A body of exactly n words, for the bound assertions.
  function wordsOf(n) {
    const pool = ['kitchen', 'light', 'water', 'door', 'hands', 'still', 'cold', 'hallway', 'glass', 'rain'];
    const out = [];
    for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
    return out.join(' ');
  }

  // Stub root.generateText with a scripted sequence of replies and count the
  // attempts, so the one-retry rule is measured rather than assumed.
  function stubWriter(replies) {
    const state = { calls: 0, prompts: [] };
    root.generateText = async (opts) => {
      state.prompts.push(opts && opts.instruction);
      const r = replies[Math.min(state.calls, replies.length - 1)];
      state.calls++;
      if (r instanceof Error) throw r;
      return r;
    };
    return state;
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

console.log('\n1. registration and the authored data Phase 5 added');

await check('every Phase 5 symbol resolves in both files',
  api(`(() => {
    for (const n of ['parseDreamweaverReply', 'assignDreamPanels', 'dreamPanelText', 'buildDreamFallback',
                     'applyDreamPanelText', 'dreamSettingProsePlace', 'dreamFallbackWho', 'dreamFallbackFill',
                     'dreamMotifDirective', 'unescapeJsonish']) {
      if (typeof eval(n) !== 'function') return n + ' is missing — dreams.js did not load, or Phase 5 did not land';
    }
    for (const n of ['buildDreamPrompt', 'callDreamweaver', 'buildDreamCastBlock', 'buildDreamResidueBlock', 'dreamCastStance']) {
      if (typeof eval(n) !== 'function') return n + ' is missing from llm.js';
    }
    // Borrowed, not owned. x5ParseJsonObject is the shared ladder (a second
    // copy would be a second set of bugs) and recordParseTier is the
    // telemetry every other model call already reports through.
    if (typeof x5ParseJsonObject !== 'function') return 'x5ParseJsonObject is missing — the parse ladder has no floor';
    if (typeof recordParseTier !== 'function') return 'recordParseTier is missing — the call cannot report its tier';
    // What compileDream borrows from image.js, checked by name because the
    // loader cannot mark image.js loaded.
    if (typeof IMAGE_PROMPT_VERSION !== 'string' || !IMAGE_PROMPT_VERSION) return 'IMAGE_PROMPT_VERSION is missing';
    return true;
  })()`));

await check('EVERY beat of EVERY form carries a fallback template (D6 — a new form must be showable without a code edit)',
  api(`(() => {
    for (const fid of Object.keys(DREAM_FORMS)) {
      const beats = DREAM_FORMS[fid].beats;
      if (!Array.isArray(beats) || beats.length === 0) return fid + ' has no beats';
      for (const b of beats) {
        if (typeof b.fallback !== 'string' || !b.fallback.trim()) return fid + '/' + b.id + ' has no fallback — a model failure would show it blank';
        if (typeof b.directive !== 'string' || !b.directive.trim()) return fid + '/' + b.id + ' has no directive';
      }
    }
    return true;
  })()`));

await check('every fallback placeholder is one buildDreamFallback actually fills',
  api(`(() => {
    const known = new Set(['who', 'where', 'motif', 'residue']);
    for (const fid of Object.keys(DREAM_FORMS)) {
      for (const b of DREAM_FORMS[fid].beats) {
        const hits = b.fallback.match(/\\{([a-z]+)\\}/g) || [];
        for (const h of hits) {
          const key = h.slice(1, -1);
          if (!known.has(key)) return fid + '/' + b.id + ' uses {' + key + '}, which nothing fills';
        }
      }
    }
    return true;
  })()`));

await check('every DREAM_SETTINGS entry carries a fallbackPlace, and the apartment one still names no room',
  api(`(() => {
    for (const id of Object.keys(DREAM_SETTINGS)) {
      const e = DREAM_SETTINGS[id];
      if (typeof e.fallbackPlace !== 'string' || !e.fallbackPlace.trim()) return id + ' has no fallbackPlace';
      if (e.sourceKind === 'apartment' && e.roomId) return id + ' hardcodes a roomId; ROOMS is the one home for those';
    }
    return true;
  })()`));

await check('the Phase 5 bounds exist, and the enforced ones are wider than the asked-for ones',
  api(`(() => {
    const T = DREAM_TUNING;
    for (const k of ['panelWordMin', 'panelWordMax', 'panelWordHardMin', 'panelWordHardMax']) {
      if (!Number.isFinite(T[k])) return k + ' is missing from DREAM_TUNING';
    }
    if (!(T.panelWordHardMin < T.panelWordMin)) return 'panelWordHardMin (' + T.panelWordHardMin + ') is not below panelWordMin (' + T.panelWordMin + ') — the parser would reject slightly-short replies the player would happily read';
    if (!(T.panelWordHardMax > T.panelWordMax)) return 'panelWordHardMax is not above panelWordMax';
    return true;
  })()`));

console.log('\n2. THE PARSE LADDER — a reply is read, never trusted');

await check('clean JSON lands on tier 1 and yields one string per panel',
  api(`(() => {
    const d = recordFor('descent');
    const r = parseDreamweaverReply(goodReplyFor(d), d);
    if (!r) return 'a clean reply did not parse at all';
    if (r.tier !== 1) return 'clean JSON reached tier ' + r.tier;
    if (r.panels.length !== 3) return 'got ' + r.panels.length + ' panels for a 3-beat form';
    if (r.panels.some(p => typeof p !== 'string' || !p.trim())) return 'a panel came back empty';
    return true;
  })()`));

await check('a fenced answer, a missing leading brace and a sentence of preamble all still parse',
  api(`(() => {
    const d = recordFor('loop');
    const clean = goodReplyFor(d);
    const cases = {
      fenced: '\\u0060\\u0060\\u0060json\\n' + clean + '\\n\\u0060\\u0060\\u0060',
      noLeadingBrace: clean.slice(1),
      preamble: 'Here is the dream you asked for.\\n' + clean,
    };
    for (const [name, text] of Object.entries(cases)) {
      const r = parseDreamweaverReply(text, d);
      if (!r) return name + ' did not parse';
      if (r.panels.length !== 2) return name + ' gave ' + r.panels.length + ' panels';
    }
    return true;
  })()`));

await check('a truncated reply with trailing commentary lands on tier 2',
  api(`(() => {
    const d = recordFor('loop');
    const r = parseDreamweaverReply(goodReplyFor(d) + ' I hope that captures the mood you wanted. {', d);
    if (!r) return 'a recoverable truncation did not parse';
    if (r.tier !== 2) return 'truncated-with-trailer reached tier ' + r.tier + ', expected the brace-matched tier';
    if (r.panels.length !== 2) return 'got ' + r.panels.length + ' panels';
    return true;
  })()`));

await check('a reply mangled past JSON.parse still recovers its panels by regex at tier 3',
  api(`(() => {
    const d = recordFor('loop');
    const body = wordsOf(50);
    // A doubled comma: no candidate repair in the ladder can fix it, so both
    // JSON tiers fail and the flat "text": "..." grammar is all that is left.
    const mangled = '{"panels": [{"beat": "first_pass", "text": "' + body + '"},, {"beat": "second_pass", "text": "' + body + '"}]}';
    if (x5ParseJsonObject(mangled) !== null) return 'the fixture is wrong — that reply is still valid JSON, so tier 3 was never exercised';
    const r = parseDreamweaverReply(mangled, d);
    if (!r) return 'the regex sweep recovered nothing';
    if (r.tier !== 3) return 'mangled reply reached tier ' + r.tier;
    if (r.panels.length !== 2) return 'got ' + r.panels.length + ' panels';
    return true;
  })()`));

await check('garbage, an empty reply and a reply short of panels all return null',
  api(`(() => {
    const d = recordFor('descent');
    const cases = {
      garbage: 'I am afraid I cannot help with that request.',
      empty: '',
      notAnObject: '[1, 2, 3]',
      wrongKey: JSON.stringify({ dream: [{ text: wordsOf(50) }] }),
      tooFewPanels: JSON.stringify({ panels: [{ beat: 'arrival', text: wordsOf(50) }] }),
      blankPanel: JSON.stringify({ panels: [{ beat: 'arrival', text: wordsOf(50) }, { beat: 'wrongness', text: '' }, { beat: 'submersion', text: wordsOf(50) }] }),
    };
    for (const [name, text] of Object.entries(cases)) {
      if (parseDreamweaverReply(text, d) !== null) return name + ' was accepted; it should be a definitive failure';
    }
    return true;
  })()`));

console.log('\n3. THE STRIP (D1) — prose in, prose only out');

await check('everything the model volunteers beyond panel text is dropped',
  api(`(() => {
    const d = recordFor('loop');
    const body = wordsOf(50);
    const reply = JSON.stringify({
      panels: [
        { beat: 'first_pass', text: body, mood: 'anxious', register: 'erotic', imagePrompt: 'a wolf', title: 'The Kitchen' },
        { beat: 'second_pass', text: body, cast: ['npc_bruno'] },
        { beat: 'invented_third', text: body },
      ],
      register: 'tender', mood: 'hopeful', panelCount: 3, form: 'descent',
      wake: { moodDelta: 0.9 }, title: 'A Dream About Dishes',
    });
    const r = parseDreamweaverReply(reply, d);
    if (!r) return 'the reply did not parse';
    if (r.panels.length !== 2) return 'the invented third panel survived — got ' + r.panels.length;
    if (r.panels.some(p => typeof p !== 'string')) return 'a panel came back as something other than a string';
    // The record is what everything downstream reads, so the real test is
    // that applying the reply leaves nothing but text and status changed.
    const before = JSON.parse(JSON.stringify(d));
    applyDreamPanelText(d, r.panels);
    if (d.slots.register !== before.slots.register) return 'the register moved';
    if (d.slots.form !== before.slots.form) return 'the form moved';
    if (JSON.stringify(d.cast) !== JSON.stringify(before.cast)) return 'the cast moved';
    if (JSON.stringify(d.wake) !== JSON.stringify(before.wake)) return 'the wake tint moved';
    if (d.panels.length !== before.panels.length) return 'the panel count moved';
    for (let i = 0; i < d.panels.length; i++) {
      if (d.panels[i].prompt !== before.panels[i].prompt) return 'panel ' + i + ' had its frozen prompt rewritten (D14)';
      if (d.panels[i].seed !== before.panels[i].seed) return 'panel ' + i + ' had its seed rewritten';
      if (d.panels[i].beat !== before.panels[i].beat) return 'panel ' + i + ' had its beat rewritten';
    }
    if (Object.keys(d).length !== Object.keys(before).length) return 'a new top-level key appeared on the record';
    return true;
  })()`));

await check('panels arriving out of order are realigned by beat id, not assigned by position',
  api(`(() => {
    const d = recordFor('descent');
    const mark = (w) => wordsOf(40) + ' ' + w + ' ' + wordsOf(9);
    const reply = JSON.stringify({ panels: [
      { beat: 'submersion', text: mark('SUB') },
      { beat: 'arrival', text: mark('ARR') },
      { beat: 'wrongness', text: mark('WRONG') },
    ] });
    const r = parseDreamweaverReply(reply, d);
    if (!r) return 'the reply did not parse';
    if (!r.panels[0].includes('ARR')) return 'panel 0 (beat arrival) got: ' + r.panels[0].slice(0, 40);
    if (!r.panels[1].includes('WRONG')) return 'panel 1 (beat wrongness) got the wrong text';
    if (!r.panels[2].includes('SUB')) return 'panel 2 (beat submersion) got the wrong text';
    return true;
  })()`));

await check('a reply with no beat ids at all still assigns positionally',
  api(`(() => {
    const d = recordFor('descent');
    const r = parseDreamweaverReply(JSON.stringify({ panels: [wordsOf(50), wordsOf(50), wordsOf(50)] }), d);
    return (r && r.panels.length === 3) || 'bare-string panels were rejected; a model that returned strings still did the job';
  })()`));

await check('word bounds: too short is rejected outright, too long is trimmed at a sentence boundary',
  api(`(() => {
    const T = DREAM_TUNING;
    if (dreamPanelText(wordsOf(T.panelWordHardMin - 1)) !== '') return 'a panel under panelWordHardMin was accepted';
    if (!dreamPanelText(wordsOf(T.panelWordHardMin))) return 'a panel exactly at panelWordHardMin was rejected';
    const long = (wordsOf(30) + '. ').repeat(20);
    const cut = dreamPanelText(long);
    const n = cut.split(' ').length;
    if (n > T.panelWordHardMax) return 'an over-length panel came back at ' + n + ' words';
    if (!/[.!?]$/.test(cut)) return 'the trim did not land on a sentence boundary: ...' + cut.slice(-40);
    // A run-on with no sentence break anywhere still has to come back bounded.
    const runOn = dreamPanelText(wordsOf(T.panelWordHardMax * 3));
    if (runOn.split(' ').length > T.panelWordHardMax) return 'a run-on with no punctuation was not bounded';
    return true;
  })()`));

await check('markdown, a stray panel label and collapsed whitespace are cleaned off',
  api(`(() => {
    const body = wordsOf(50);
    const cases = ['**Panel 1:** ' + body, '## ' + body, '> ' + body, 'PANEL 2 - ' + body, body.replace(/ /g, '\\n  ')];
    for (const c of cases) {
      const t = dreamPanelText(c);
      if (!t) return 'cleaning rejected a legal panel: ' + c.slice(0, 30);
      if (/[*_\\u0060#>]/.test(t)) return 'markdown survived: ' + t.slice(0, 40);
      if (/^(panel|beat)\\s*\\d/i.test(t)) return 'a panel label survived: ' + t.slice(0, 40);
      if (/\\s\\s/.test(t)) return 'doubled whitespace survived';
    }
    return true;
  })()`));

console.log('\n4. THE FALLBACK — a legal dream with no model at all');

await check('every form in DREAM_FORMS templates a complete dream, with nothing left unfilled',
  api(`(() => {
    for (const fid of Object.keys(DREAM_FORMS)) {
      const d = recordFor(fid);
      const gs = fixture();
      const out = buildDreamFallback(d, gs);
      if (out.length !== DREAM_FORMS[fid].beats.length) return fid + ' produced ' + out.length + ' panels for ' + DREAM_FORMS[fid].beats.length + ' beats';
      for (let i = 0; i < out.length; i++) {
        const t = out[i];
        if (typeof t !== 'string' || !t.trim()) return fid + ' panel ' + i + ' came back empty';
        if (/\\{[a-z]+\\}/.test(t)) return fid + ' panel ' + i + ' left a placeholder unfilled: ' + t.slice(0, 60);
        if (!/^[A-Z]/.test(t)) return fid + ' panel ' + i + ' does not start with a capital: ' + t.slice(0, 30);
        // It has to survive the same parser a written panel does, or the
        // fallback is a different shape from the thing it replaces.
        if (!dreamPanelText(t)) return fid + ' panel ' + i + ' would be rejected by dreamPanelText';
      }
    }
    return true;
  })()`));

await check('a templated panel is the same SIZE as a written one, for every form',
  api(`(() => {
    const lo = DREAM_TUNING.panelWordMin - 12, hi = DREAM_TUNING.panelWordMax + 18;
    const bad = [];
    for (const fid of Object.keys(DREAM_FORMS)) {
      const out = buildDreamFallback(recordFor(fid), fixture());
      out.forEach((t, i) => {
        const n = t.split(/\\s+/).length;
        if (n < lo || n > hi) bad.push(fid + '/' + i + '=' + n);
      });
    }
    return bad.length === 0 || 'outside ' + lo + '-' + hi + ' words: ' + bad.join(', ');
  })()`));

await check('a degenerate record — no cast, no residue, no motif, an unreachable setting — still templates',
  api(`(() => {
    for (const fid of Object.keys(DREAM_FORMS)) {
      const d = recordFor(fid, (r) => {
        r.cast = []; r.residue = []; r.motif = { motifId: null, text: '', carriedFrom: null };
        r.slots.setting = { settingId: 'nope_not_a_setting', sourceKind: 'apartment', roomId: null };
      });
      const out = buildDreamFallback(d, null);   // no gs either
      if (out.length !== DREAM_FORMS[fid].beats.length) return fid + ' lost a panel on a degenerate record';
      for (const t of out) {
        if (!t || /\\{[a-z]+\\}/.test(t)) return fid + ' left a placeholder unfilled on a degenerate record: ' + String(t).slice(0, 60);
      }
    }
    return true;
  })()`));

await check('every form draws on the real material of its record — the LOUDEST fragment, the motif, and no fragment twice',
  api(`(() => {
    // No form today puts {residue} in more than one beat, so the "no fragment
    // twice" half is a guard on a form somebody adds later rather than on one
    // that exists. The half that bites today is the FIRST one: fragments are
    // handed out in pool order to the beats that ask, so the loudest thing in
    // the dreamer's day reaches every form — indexing by panel number instead
    // silently skipped it for descent, undoing, loop and reunion, all of whose
    // residue slot is a later beat.
    for (const fid of Object.keys(DREAM_FORMS)) {
      const d = recordFor(fid);
      // Lowercased on both sides: dreamFallbackFill sentence-cases the panel,
      // so a template that OPENS on a placeholder capitalises the material it
      // was handed. That is the intended output, not a mismatch.
      const out = buildDreamFallback(d, fixture()).map(t => t.toLowerCase());
      const has = (needle) => out.some(t => t.includes(needle.toLowerCase()));
      const slots = DREAM_FORMS[fid].beats.filter(b => b.fallback.includes('{residue}')).length;
      if (slots > 0 && !has(d.residue[0].text)) {
        return fid + ' has a residue slot but the loudest fragment never reached it';
      }
      for (const f of d.residue) {
        const hits = out.filter(t => t.includes(f.text.toLowerCase())).length;
        if (hits > 1) return fid + ' used one fragment in ' + hits + ' panels';
      }
      if (DREAM_FORMS[fid].beats.some(b => b.fallback.includes('{motif}')) && !has(d.motif.text)) {
        return fid + ' has a motif slot the motif never reached';
      }
    }
    return true;
  })()`));

await check('a filled panel is sentence-cased throughout, not just at the front',
  api(`(() => {
    // Every value a slot receives is a lowercase clause by construction, and a
    // dozen templates open a sentence on one. This is the assertion that
    // caught "…the smell of somewhere lived in. music through a wall…".
    for (const fid of Object.keys(DREAM_FORMS)) {
      for (const t of buildDreamFallback(recordFor(fid), fixture())) {
        const bad = t.match(/[.!?]\\s+[a-z]/);
        if (bad) return fid + ' has a lowercase sentence: ...' + t.slice(Math.max(0, t.indexOf(bad[0]) - 30), t.indexOf(bad[0]) + 40);
        if (/^[a-z]/.test(t)) return fid + ' opens lowercase: ' + t.slice(0, 40);
      }
    }
    return true;
  })()`));

await check('every {where} slot sits in a position a bare noun phrase can actually fill',
  api(`(() => {
    // {where} receives a bare noun phrase — "the kitchen", "a night bus" — so
    // the PREPOSITION has to come from the template. This caught "The stairs
    // put you {where}", which filled as "put you the kitchen". Valid contexts
    // are: after a preposition, at the head of a sentence (subject), or after
    // a linking "is" (complement).
    const ok = /(\\b(?:in|into|inside|through|across|at|on|from|toward|towards|past)\\s+$)|((?:^|[.!?]\\s+)$)|(\\bis\\s+$)/i;
    for (const fid of Object.keys(DREAM_FORMS)) {
      for (const b of DREAM_FORMS[fid].beats) {
        let at = b.fallback.indexOf('{where}');
        while (at !== -1) {
          if (!ok.test(b.fallback.slice(0, at))) {
            return fid + '/' + b.id + ' puts {where} somewhere a bare noun phrase does not fit: "' + b.fallback.slice(Math.max(0, at - 34), at + 7) + '"';
          }
          at = b.fallback.indexOf('{where}', at + 1);
        }
      }
    }
    return true;
  })()`));

await check('every setting reads correctly in every {where} slot, not just the apartment one',
  api(`(() => {
    // The apartment case is the one that gets exercised by hand; an external
    // place phrase only ever reaches a player through a fallback nobody looks
    // at until it is wrong. So: every form, crossed with every setting.
    for (const fid of Object.keys(DREAM_FORMS)) {
      for (const sid of Object.keys(DREAM_SETTINGS)) {
        const e = DREAM_SETTINGS[sid];
        const d = recordFor(fid, (r) => {
          r.slots.setting = { settingId: sid, sourceKind: e.sourceKind, roomId: e.sourceKind === 'apartment' ? 'kitchen' : null };
        });
        for (const t of buildDreamFallback(d, fixture())) {
          if (!t || /\\{[a-z]+\\}/.test(t)) return fid + ' x ' + sid + ' left a placeholder: ' + String(t).slice(0, 60);
          if (/\\b(a|an|the)\\s+(a|an|the)\\b/i.test(t)) return fid + ' x ' + sid + ' doubled an article: ' + t.slice(0, 80);
          if (/[.!?]\\s+[a-z]/.test(t)) return fid + ' x ' + sid + ' has a lowercase sentence';
        }
      }
    }
    return true;
  })()`));

await check('an external and a nowhere setting both resolve a place phrase, and home resolves the real room',
  api(`(() => {
    const at = (settingId, roomId, kind) => dreamSettingProsePlace({ settingId, sourceKind: kind, roomId });
    const home = at('home', 'kitchen', 'apartment');
    if (!home || !/kitchen/i.test(home)) return 'the apartment setting did not resolve its room: ' + home;
    if (/^Your\\b/.test(home)) return 'the room phrase kept its capital, which reads wrong mid-sentence: ' + home;
    for (const id of Object.keys(DREAM_SETTINGS)) {
      const e = DREAM_SETTINGS[id];
      if (e.sourceKind === 'apartment') continue;
      const p = at(id, null, e.sourceKind);
      if (!p || p !== e.fallbackPlace) return id + ' resolved to ' + p;
    }
    // The one case that has no room to resolve.
    if (at('home', null, 'apartment') !== DREAM_SETTINGS.home.fallbackPlace) return 'a roomless apartment setting did not fall through to fallbackPlace';
    return true;
  })()`));

await check('the fallback is deterministic and takes NO rng draw, from any stream (design invariant 5)',
  api(`(() => {
    const d = recordFor('descent');
    const gs = fixture();
    const realRandom = Math.random;
    let touched = 0;
    Math.random = () => { touched++; return realRandom(); };
    const a = JSON.stringify(buildDreamFallback(d, gs));
    const b = JSON.stringify(buildDreamFallback(d, gs));
    Math.random = realRandom;
    if (touched !== 0) return 'buildDreamFallback reached Math.random ' + touched + ' times';
    if (a !== b) return 'two fallback builds off one record disagreed';
    // ...and again after a JSON round trip, which is what the diary does.
    const c = JSON.stringify(buildDreamFallback(JSON.parse(JSON.stringify(d)), gs));
    return a === c || 'the fallback changed across a JSON round trip of the record';
  })()`));

await check('the fallback names the cast member even when their role is absent',
  api(`(() => {
    const d = recordFor('reunion', (r) => { r.cast = [{ npcId: 'npc_alma', role: 'absent' }]; });
    const out = buildDreamFallback(d, fixture());
    return out.some(t => t.includes('Alma')) || 'an absent cast member left {who} nameless: ' + out[0].slice(0, 60);
  })()`));

console.log('\n5. THE ONE WRITE — applyDreamPanelText and nothing else');

await check('a complete set of texts writes through and flips status to written',
  api(`(() => {
    const d = recordFor('loop');
    const ok = applyDreamPanelText(d, [wordsOf(50), wordsOf(50)]);
    if (ok !== true) return 'a complete write returned ' + ok;
    if (d.status !== 'written') return 'status is ' + d.status;
    if (d.panels.some(p => !p.text)) return 'a panel is still empty';
    return true;
  })()`));

await check('a partial, an over-long or an empty set is REFUSED and leaves status at compiled',
  api(`(() => {
    const cases = {
      short: [wordsOf(50)],
      long: [wordsOf(50), wordsOf(50), wordsOf(50)],
      empty: [],
      blank: [wordsOf(50), '   '],
      notStrings: [wordsOf(50), 42],
      notAnArray: 'two panels please',
    };
    for (const [name, texts] of Object.entries(cases)) {
      const d = recordFor('loop');
      const r = applyDreamPanelText(d, texts);
      if (r !== false) return name + ' was accepted';
      if (d.status !== 'compiled') return name + ' moved status to ' + d.status;
      if (d.panels.some(p => p.text !== '')) return name + ' wrote prose anyway';
    }
    return true;
  })()`));

await check('nothing in Phase 5 writes to gameState — the save is byte-identical after a full weave',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 3 });
    const before = JSON.stringify(gs);
    stubWriter([goodReplyFor(d)]);
    const res = await callDreamweaver(gs, d);
    applyDreamPanelText(d, res.ok ? res.panels : buildDreamFallback(d, gs));
    buildDreamPrompt(gs, d);
    buildDreamFallback(d, gs);
    if (JSON.stringify(gs) !== before) return 'the save was mutated by the writer path (design invariant 2)';
    // ...including world.dreams' own bookkeeping, which only the CALLER owns.
    if (gs.world.dreams.nextIndex !== 1) return 'nextIndex moved to ' + gs.world.dreams.nextIndex;
    if (gs.world.dreams.queue.length !== 0) return 'something pushed to the queue';
    return true;
  })()`));

console.log('\n6. THE PROMPT — it asks for prose and never for a decision');

await check('the prompt states the exact panel count and lists one numbered beat per panel',
  api(`(() => {
    for (const fid of Object.keys(DREAM_FORMS)) {
      const d = recordFor(fid);
      const n = DREAM_FORMS[fid].beats.length;
      const p = buildDreamPrompt(fixture(), d);
      if (!p.includes('EXACTLY ' + n + ' PANEL')) return fid + ' did not state its panel count';
      const numbered = (p.match(/^PANEL \\d+ \\(beat id "/gm) || []).length;
      if (numbered !== n) return fid + ' listed ' + numbered + ' beats for ' + n + ' panels';
      for (const b of DREAM_FORMS[fid].beats) {
        if (!p.includes(b.directive)) return fid + '/' + b.id + ' directive did not reach the prompt';
        if (!p.includes('"beat": "' + b.id + '"')) return fid + '/' + b.id + ' is not in the response schema';
      }
    }
    return true;
  })()`));

await check('a napOnly form asks for exactly one panel (D16)',
  api(`(() => {
    const napForms = Object.keys(DREAM_FORMS).filter(id => DREAM_FORMS[id].napOnly === true);
    if (napForms.length === 0) return 'no napOnly forms exist any more';
    for (const fid of napForms) {
      const p = buildDreamPrompt(fixture(), recordFor(fid));
      if (!p.includes('EXACTLY 1 PANEL')) return fid + ' did not ask for exactly one panel';
      if (/^PANEL 2 /m.test(p)) return fid + ' asked for a second panel';
      if (p.includes('PANELS')) return fid + ' used the plural, which invites a second one';
    }
    // ...and a compiled nap dream really does reach a one-beat form.
    const nap = compileDream(fixture(), { index: 5, forSleep: 'nap' });
    if (nap.panels.length !== 1) return 'a compiled nap dream has ' + nap.panels.length + ' panels';
    return buildDreamPrompt(fixture(), nap).includes('EXACTLY 1 PANEL') || 'the compiled nap prompt asked for something else';
  })()`));

await check('every slot directive reaches the prompt, read off the tables by id (D6)',
  api(`(() => {
    const d = recordFor('descent');
    const p = buildDreamPrompt(fixture(), d);
    const need = [
      DREAM_FORMS[d.slots.form].directive,
      DREAM_PERSPECTIVES[d.slots.perspective].directive,
      DREAM_TEMPO[d.slots.tempo].directive,
      DREAM_REGISTERS[d.slots.register].directive,
      DREAM_LENSES[d.slots.lens].directive,
      DREAM_DISTORTIONS[d.slots.distortion].directive,
      DREAM_SETTINGS[d.slots.setting.settingId].directive,
      DREAM_MOTIFS[d.motif.motifId].directive,
    ];
    for (const line of need) if (!p.includes(line)) return 'a slot directive is missing: ' + line.slice(0, 50);
    if (!p.includes(d.motif.text)) return 'the motif text is missing';
    for (const f of d.residue) if (!p.includes(f.text)) return 'a residue fragment is missing: ' + f.text.slice(0, 40);
    return true;
  })()`));

await check('the response schema offers the model exactly two keys, and neither is a structural one (D1)',
  api(`(() => {
    const p = buildDreamPrompt(fixture(), recordFor('descent'));
    const line = (p.match(/^\\{ "panels": \\[.*\\] \\}$/m) || [])[0];
    if (!line) return 'the response schema line is not where the assertion can find it';
    const keys = new Set((line.match(/"([a-zA-Z]+)"\\s*:/g) || []).map(k => k.slice(1, k.indexOf('"', 1))));
    keys.delete('panels');
    const extra = [...keys].filter(k => k !== 'beat' && k !== 'text');
    if (extra.length) return 'the schema invites the model to return: ' + extra.join(', ');
    // The banned words are the ones that hand the model a choice about form.
    for (const bad of [/how many panels/i, /choose (a|the) (form|register|tone|mood)/i, /decide (how|what|the)/i, /if you (want|prefer)/i]) {
      if (bad.test(p)) return 'the prompt asks the model to decide something: ' + p.match(bad)[0];
    }
    return true;
  })()`));

await check('the residue is labelled unordered AND non-obligatory, in both places',
  api(`(() => {
    const p = buildDreamPrompt(fixture(), recordFor('descent'));
    if (!/in no order/i.test(p)) return 'the raw material is not labelled unordered — a ranked list reads as a brief';
    if (!/NOT a list of things to include/i.test(p)) return 'the raw material is not labelled non-obligatory';
    if (!/or none/i.test(p)) return 'the prompt does not permit ignoring the material entirely';
    return true;
  })()`));

await check('the hard rules block survives, including the ones that are the whole anti-slop lever',
  api(`(() => {
    const p = buildDreamPrompt(fixture(), recordFor('descent'));
    const need = ['Present tense', 'suddenly', 'NEVER end on waking', 'NEVER name the emotion', 'framing device',
                  String(DREAM_TUNING.panelWordMin), String(DREAM_TUNING.panelWordMax)];
    for (const n of need) if (!p.includes(n)) return 'the rules block lost: ' + n;
    return true;
  })()`));

await check('the cast block names only the compiled cast, states each role, and answers the empty case',
  api(`(() => {
    const gs = fixture();
    const p = buildDreamPrompt(gs, recordFor('descent'));
    if (!p.includes('Alma')) return 'the cast member is not named';
    if (p.includes('Bruno')) return 'somebody outside the cast reached the prompt';
    if (!/FIGURE/.test(p)) return 'the role is not stated';
    const absent = buildDreamPrompt(gs, recordFor('descent', (r) => { r.cast = [{ npcId: 'npc_alma', role: 'absent' }]; }));
    if (!/ABSENT/.test(absent)) return 'an absent cast member is not marked absent — the panel image was composed around the space they are missing from';
    const none = buildDreamPrompt(gs, recordFor('descent', (r) => { r.cast = []; }));
    if (!/nobody/i.test(none) || !/[Dd]o not invent one/.test(none)) return 'an empty cast does not forbid inventing a companion';
    return true;
  })()`));

await check('an apartment dream names the real room; an external one names no place at all',
  api(`(() => {
    const gs = fixture();
    const home = buildDreamPrompt(gs, recordFor('descent'));
    if (!/THE ROOM: /.test(home)) return 'an apartment dream did not name its room';
    if (!home.includes(roomPhrase('kitchen'))) return 'the room phrase did not come from ROOMS';
    const away = buildDreamPrompt(gs, recordFor('descent', (r) => {
      r.slots.setting = { settingId: 'transit', sourceKind: 'external', roomId: null };
    }));
    if (/THE ROOM: /.test(away)) return 'an external dream named a room anyway';
    if (!away.includes(DREAM_SETTINGS.transit.directive)) return 'the external setting directive is missing';
    return true;
  })()`));

console.log('\n7. THE CALL — one retry, then the fallback, never an exception');

await check('a good reply returns ok:true in one attempt, and reports its tier',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 2 });
    const before = LLM_TELEMETRY.parseTiers[1];
    const w = stubWriter([goodReplyFor(d)]);
    const res = await callDreamweaver(gs, d);
    if (res.ok !== true) return 'a clean reply gave ok:' + res.ok + ' (' + res.reason + ')';
    if (w.calls !== 1) return 'a clean reply took ' + w.calls + ' attempts';
    if (res.panels.length !== d.panels.length) return 'got ' + res.panels.length + ' panels for ' + d.panels.length;
    if (LLM_TELEMETRY.parseTiers[1] !== before + 1) return 'the tier was not reported to LLM_TELEMETRY';
    return true;
  })()`));

await check('an unparseable reply is retried exactly once, then gives ok:false',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 2 });
    const before = LLM_TELEMETRY.parseTiers[4];
    const w = stubWriter(['I would rather not.', 'Still no.']);
    const res = await callDreamweaver(gs, d);
    if (res.ok !== false) return 'garbage was accepted';
    if (res.reason !== 'unparseable') return 'reason was ' + res.reason;
    if (w.calls !== 2) return 'the retry rule took ' + w.calls + ' attempts, expected exactly 2';
    if (LLM_TELEMETRY.parseTiers[4] !== before + 1) return 'a total failure was not recorded as tier 4 — a silently-templating engine looks identical to a working one';
    return true;
  })()`));

await check('a retry that succeeds is used',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 2 });
    const w = stubWriter(['nope', goodReplyFor(d)]);
    const res = await callDreamweaver(gs, d);
    if (res.ok !== true) return 'the successful retry was discarded';
    if (w.calls !== 2) return 'took ' + w.calls + ' attempts';
    return true;
  })()`));

await check('a throwing generator never propagates — it returns ok:false',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 2 });
    stubWriter([new Error('network down')]);
    let res;
    try { res = await callDreamweaver(gs, d); }
    catch (e) { return 'callDreamweaver threw: ' + e.message + ' — a throw on the background path is a silently dreamless playthrough'; }
    return (res.ok === false && res.reason === 'network down') || 'got ' + JSON.stringify(res);
  })()`));

await check('a garbage reply plus buildDreamFallback still yields a complete, showable dream',
  api(`(async () => {
    const gs = fixture();
    const d = compileDream(gs, { index: 6 });
    stubWriter(['???', '???']);
    const res = await callDreamweaver(gs, d);
    if (res.ok !== false) return 'the fixture did not actually fail';
    const texts = buildDreamFallback(d, gs);
    if (texts.length !== d.panels.length) return 'the fallback produced ' + texts.length + ' panels for ' + d.panels.length + ' (D4: the form owns the count)';
    if (applyDreamPanelText(d, texts) !== true) return 'the templated dream was refused by its own applier';
    if (d.status !== 'written') return 'status is ' + d.status;
    if (d.panels.some(p => !p.text || /\\{[a-z]+\\}/.test(p.text))) return 'a templated panel is empty or unfilled';
    return true;
  })()`));

await check('a dream with no panels or an unknown form is refused before any model call',
  api(`(async () => {
    const gs = fixture();
    const w = stubWriter([goodReplyFor(recordFor('loop'))]);
    const a = await callDreamweaver(gs, recordFor('loop', (r) => { r.panels = []; }));
    const b = await callDreamweaver(gs, recordFor('loop', (r) => { r.slots.form = 'no_such_form'; }));
    if (a.ok !== false || b.ok !== false) return 'a broken record reached the model';
    if (w.calls !== 0) return 'a broken record cost ' + w.calls + ' model calls';
    return true;
  })()`));

console.log('\n8. the save/load round trip');

await check('a WRITTEN dream survives a real write/load cycle with its prose, prompts and seeds intact',
  api(`(async () => {
    // The standing per-phase obligation, in the Phase 5 shape: world.dreams
    // still round-trips, and the thing this phase adds to the record — panel
    // TEXT — comes back byte-identical alongside the frozen prompts and seeds
    // it must never have disturbed.
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-weave', clock: { day: 1, minutes: 0 } });
    const h = house('rt-weave', 2);
    const ids = Object.keys(h.npcs);
    h.player.ledger = { [ids[1]]: [{ kind: 'participated', act: 'sex', day: h.meta.clock.day, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }] };
    h.npcs[ids[0]].relPlayer.grievances = [{ text: 'You left the dishes in the sink again', severity: 0.6, day: h.meta.clock.day, resolved: false }];
    h.world.dreams.nextIndex = 4;

    const d = compileDream(h, { index: 4 });
    stubWriter([goodReplyFor(d)]);
    const res = await callDreamweaver(h, d);
    if (!res.ok) return 'the fixture reply did not parse';
    applyDreamPanelText(d, res.panels);
    const before = JSON.parse(JSON.stringify(d));
    h.world.dreams.queue = [d];

    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();

    const store = loaded.world.dreams;
    if (!store || store.nextIndex !== 4) return 'world.dreams did not survive the round trip';
    if (!store.queue.length) return 'the written dream did not survive the round trip';
    const back = store.queue[0];
    if (back.status !== 'written') return 'status came back as ' + back.status;
    if (JSON.stringify(back) !== JSON.stringify(before)) return 'the written record changed shape across a save/load';
    for (let i = 0; i < before.panels.length; i++) {
      if (back.panels[i].text !== before.panels[i].text) return 'panel ' + i + ' lost its prose';
      if (back.panels[i].prompt !== before.panels[i].prompt) return 'panel ' + i + ' lost its frozen prompt (D14)';
      if (back.panels[i].seed !== before.panels[i].seed) return 'panel ' + i + ' lost its seed';
    }
    // ...and the fallback rebuilt off the RELOADED record still matches, which
    // is what the Dream Diary will do years later.
    if (JSON.stringify(buildDreamFallback(back, loaded)) !== JSON.stringify(buildDreamFallback(before, loaded))) {
      return 'the fallback disagreed across a save/load of the record';
    }
    return true;
  })()`));

await check('the clock and the needs are untouched by anything Phase 5 does',
  api(`(async () => {
    // Phase 5 adds no sleep hook and no effect — the point of this assertion
    // is that it stays that way. Phase 7 is where a dream first touches a
    // need, and it does it through applyEffects.
    const gs = fixture();
    const d = compileDream(gs, { index: 8 });
    const clock = JSON.stringify(gs.meta.clock);
    const energy = gs.player.energy;
    stubWriter(['garbage']);
    await callDreamweaver(gs, d);
    applyDreamPanelText(d, buildDreamFallback(d, gs));
    if (JSON.stringify(gs.meta.clock) !== clock) return 'the clock moved';
    if (gs.player.energy !== energy) return 'player energy moved';
    if (d.wake.moodDelta === 0 && d.wake.energyDelta === 0 && d.wake.band === undefined) return 'the wake tint went missing from the record';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
