// Dream Engine Phase 6 — rendering and the queue.
// (src/ref/complete/dream-engine-plan.md)
//
// Phase 5 left a record with prose and empty pixels. This phase renders it and
// parks it, so that by the time the player clicks Sleep there is nothing left
// to do but look. The assertions below aim at five things:
//
//   THE KEY (D30)     — composeDreamPanelKey froze the facts about the DREAM
//                       and is hashed into panel.seed, so it can never move.
//                       The facts about the DEVICE — viewport orientation and
//                       the active image style — are appended at the cache
//                       boundary and only there. Rotating a phone must produce
//                       a new cache KEY and the same SEED, because a diary
//                       entry is a memory of one specific picture.
//   THE FROZEN PROMPT — panel.prompt is read off the record and never rebuilt
//                       from current state (D14, the takePhoto discipline).
//                       Renaming an NPC after the compile must not change one
//                       character of what gets generated.
//   THE QUEUE (D19)   — two deep, one night dream and one nap dream, filled in
//                       the background and never on a click. All-or-nothing:
//                       a dream that could not be written, or could not render
//                       every panel, does not reach the queue at all, because
//                       a queued half-rendered dream IS a generation on the
//                       sleep click (design invariant 3).
//   THE GUARDS (D20/  — single flight; the index is spent on failure so two
//   D21/D22)            compiles can never share a cache key; panels render
//                       sequentially, never in parallel; the write re-validates
//                       against the LIVE currentGameState and drops the dream
//                       when the world moved under it.
//   WRITES NOTHING    — invariant 2. A full top-up touches world.dreams and
//                       the save-boundary's own playtime stamp, and nothing
//                       else: not the clock, not energy, not an NPC, not a
//                       relationship.
//
// Like the other four dream harnesses this asserts INVARIANTS, never phrasing
// or values: "the seed does not move when the orientation does", not "the key
// is exactly this string".
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
// image.js is deliberately NOT in `required`, for the reason
// verify-dreams-compile.js records: its very last statement is a
// window.addEventListener the vm's window shim has no method for, so the
// loader marks it failed even though every function declaration in it is
// hoisted and every const above that line — IMAGE_NEGATIVE included — has
// already run. This phase's subject matter lives half in that file, so
// section 1 asserts the three symbols by name instead, which is stricter than
// the loader's all-or-nothing check.
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'llm.js', 'x5.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

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
  // The browser globals image.js reaches for at CALL time and the bare vm has
  // no reason to carry. URL is the object-URL factory createObjectUrl uses;
  // without it every getter here returns url:null and half these assertions
  // would pass for the wrong reason.
  var URL = { createObjectURL: () => 'blob:dream-' + (URL._n = (URL._n || 0) + 1), revokeObjectURL: () => {} };

  // ui.js is not in this harness's load order, so liveDreamGameState's
  // typeof guard falls through to the caller's reference — which is what we
  // want for every assertion except the two that deliberately simulate a
  // different save being live. Declared here so the guard sees a DEFINED but
  // falsy binding in the default case rather than a ReferenceError, exactly
  // as it would in a browser before newGame().
  var currentGameState = null;

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

  // A real SIM_generateHouse save with enough material that compileDream has
  // somebody to cast and something to cast them in.
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
    // saveAtBoundary lazily creates world.phone and world.afterHours for EVERY
    // caller — its documented lazy-init guarantee, nothing to do with dreams.
    // A real buildGameState save already has both, and this fixture must too,
    // or the "writes nothing outside world.dreams" assertion below would have
    // to carry an exclusion list that quietly grows.
    h.world.phone = h.world.phone || defaultPhoneState();
    h.world.afterHours = h.world.afterHours || defaultAfterHoursState();
    const ids = Object.keys(h.npcs);
    h.player.ledger = { [ids[Math.min(1, ids.length - 1)]]: [{ kind: 'participated', act: 'sex', day: h.meta.clock.day, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }] };
    h.npcs[ids[0]].relPlayer.grievances = [{ text: 'You left the dishes in the sink again', severity: 0.6, day: h.meta.clock.day, resolved: false }];
    return h;
  }

  // A fresh world + a fresh kv + default settings, so no assertion inherits
  // another's cache, style or frequency dial.
  function bench(seed, n) {
    root.kv = makeMemKv();
    currentGameState = null;
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    innerWidth = 1280; innerHeight = 800;
    return house(seed || 'p6', n || 3);
  }

  // The model, stubbed. The DEFAULT mode succeeds: it reads the beat ids back
  // out of the prompt buildDreamPrompt just wrote (which states each one
  // verbatim, so the reply can carry it) and answers keyed BY BEAT, which is
  // the shape D32 requires. That means the queue assertions below run against
  // the WRITER'S path rather than only the fallback — the realistic case.
  // 'garbage' and 'throw' force the degraded paths where one is the subject.
  //
  // Note for anybody counting calls: a garbage reply costs TWO generateText
  // calls, not one, because callDreamweaver retries once on a definitive parse
  // failure (D33). A good reply costs one.
  function stubWriter(mode) {
    const state = { calls: 0, prompts: [] };
    root.generateText = async (opts) => {
      state.calls++;
      const instruction = opts && opts.instruction;
      state.prompts.push(instruction);
      if (mode === 'throw') throw new Error('model offline');
      if (mode === 'garbage') return 'no json here at all';
      const beats = [];
      const re = /beat id "([^"]+)"/g;
      let m;
      while ((m = re.exec(String(instruction)))) beats.push(m[1]);
      if (!beats.length) return 'the prompt no longer states its beat ids';
      // ~55 words with real sentence boundaries: inside panelWordHardMin/Max
      // so dreamPanelText keeps it whole rather than trimming or rejecting.
      const body = Array(11).fill('The kitchen light holds still.').join(' ');
      return JSON.stringify({ panels: beats.map(b => ({ beat: b, text: body })) });
    };
    return state;
  }

  // The image plugin, stubbed. Records every call and, crucially, the maximum
  // number of generations in flight at once — D21 says one, always.
  function stubImager(opts) {
    opts = opts || {};
    const state = { calls: 0, prompts: [], seeds: [], negatives: [], resolutions: [], inFlight: 0, maxInFlight: 0 };
    root.generateImage = async (prompt, o) => {
      state.calls++;
      state.prompts.push(prompt);
      state.seeds.push(o && o.seed);
      state.negatives.push(o && o.negativePrompt);
      state.resolutions.push(o && o.resolution);
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        // Two microtask yields: a parallel caller would overlap HERE, and
        // maxInFlight would read 2. A sequential one never can.
        await Promise.resolve();
        await Promise.resolve();
        if (opts.hook) await opts.hook(state);
        if (opts.fail) throw new Error('image plugin offline');
        if (opts.failAfter !== undefined && state.calls > opts.failAfter) throw new Error('image plugin offline');
        return { canvas: { toBlob: (cb) => cb({ png: state.calls }) } };
      } finally {
        state.inFlight--;
      }
    };
    return state;
  }

  // Wire the writer stub's reply to a specific dream's beats.
  function beatsOf(writer, dream) { writer.beats = dream.panels.map(p => p.beat); return writer; }

  // Compile-and-write a dream by hand, for the assertions that need a record
  // without going through the queue.
  async function readyDream(gs, index, forSleep) {
    const d = compileDream(gs, { index: index || 1, forSleep: forSleep || 'night' });
    applyDreamPanelText(d, buildDreamFallback(d, gs));
    return d;
  }

  // Find an index whose night dream has n panels, so the sequential-render
  // assertion is not at the mercy of whichever form the default seed rolled.
  function indexWithPanels(gs, n) {
    for (let i = 1; i < 200; i++) {
      const d = compileDream(gs, { index: i, forSleep: 'night' });
      if (d && d.panels.length === n) return i;
    }
    return null;
  }
`);

// Everything below needs `await`, which cannot sit at this file's top level
// alongside the `require()` above — one async main instead.
async function main() {

console.log('\n1. the surface exists and is where the plan put it');

await check('every Phase 6 identifier resolves, in the file the plan assigned it to',
  api(`(() => {
    for (const n of ['getDreamPanelImage', 'dreamPanelCacheKey', 'dreamPanelViewportClause']) {
      if (typeof eval(n) !== 'function') return n + ' is missing (image.js)';
    }
    for (const n of ['topUpDreamQueue', 'dreamStillValid', 'nextDreamSlot', 'renderDreamPanels', 'dreamFrequencyChance']) {
      if (typeof eval(n) !== 'function') return n + ' is missing (dreams.js)';
    }
    if (typeof dreamGenInFlight !== 'boolean') return 'the D20 single-flight guard is not a module-level boolean';
    return true;
  })()`));

await check('dreams.js never calls root.generateImage itself — every panel goes through image.js',
  (() => {
    // Asserted against the SOURCE rather than by behaviour, because the failure
    // this guards is a NEW call site added by a later phase, which no existing
    // behavioural assertion would ever reach. Going direct bypasses both the
    // shared LRU and applyImageStyle's style funnel.
    const src = fs.readFileSync(path.join(SRC, 'dreams.js'), 'utf8');
    const hits = src.split(/\r?\n/)
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /generateImage/.test(l) && !/^\s*\/\//.test(l));
    if (hits.length) return 'dreams.js calls generateImage directly at line ' + hits[0][0];
    return true;
  })());

await check('ui.js fires the top-up from two sites and AWAITS neither',
  (() => {
    // ui.js is not in the vm's load order (it needs a DOM), so the two call
    // sites this phase adds are unreachable behaviourally. They are also the
    // single most dangerous line in the phase: `await topUpDreamQueue(...)` on
    // the sleep path is an LLM call and three image generations between the
    // player's click and the morning — design invariant 3, in the one form
    // that would look like a working feature to whoever wrote it. Scanned in
    // the source instead, which is the honest way to assert it from here.
    const src = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
    const lines = src.split(/\r?\n/)
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /topUpDreamQueue\s*\(/.test(l) && !/^\s*\/\//.test(l));
    if (lines.length < 2) return 'ui.js has ' + lines.length + ' top-up site(s); the plan asks for two (wake, day rollover)';
    for (const [n, l] of lines) {
      if (/\bawait\s+topUpDreamQueue/.test(l)) return 'ui.js:' + n + ' AWAITS the background top-up';
      if (!/\.catch\s*\(/.test(l)) return 'ui.js:' + n + ' fires the top-up with no .catch — a failed pass would surface as an unhandled rejection';
    }
    return true;
  })());

await check('IMAGE_NEGATIVE.dream exists and deliberately omits the two words that would cancel the tables',
  api(`(() => {
    const neg = IMAGE_NEGATIVE.dream;
    if (typeof neg !== 'string' || !neg.trim()) return 'IMAGE_NEGATIVE.dream is missing or empty';
    // DREAM_DISTORTIONS and DREAM_LENSES put distortion and softness in the
    // POSITIVE prompt on purpose; negating them here would quietly cancel the
    // two tables the abstraction slider drives.
    if (/\\bdistorted\\b/.test(neg)) return 'the dream negative fights DREAM_DISTORTIONS';
    if (/\\bblurry\\b/.test(neg)) return 'the dream negative fights DREAM_LENSES';
    // ...but anatomical failure is still failure, and a dream PANEL is one
    // frame — the sequence is the form's job (D4), not the picture's.
    if (!/extra limbs/.test(neg)) return 'the dream negative dropped its anatomy guard';
    if (!/collage/.test(neg)) return 'the dream negative dropped its multi-frame guard';
    return true;
  })()`));

console.log('\n2. the key: the dream half is frozen, the device half is appended (D30)');

await check('the cache key extends composeDreamPanelKey rather than replacing it',
  api(`(async () => {
    const gs = bench('key-1');
    const d = await readyDream(gs, 3);
    for (let i = 0; i < d.panels.length; i++) {
      const base = composeDreamPanelKey(d, i);
      const key = dreamPanelCacheKey(d, i);
      if (!key.startsWith(base)) return 'panel ' + i + ' key does not start with its frozen base';
      if (key === base) return 'panel ' + i + ' key folded in nothing about the device';
    }
    return true;
  })()`));

await check('rotating the viewport changes the KEY and the resolution but never the SEED',
  api(`(async () => {
    const gs = bench('key-2');
    const d = await readyDream(gs, 4);
    innerWidth = 1280; innerHeight = 800;
    const landKey = dreamPanelCacheKey(d, 0);
    let img = stubImager();
    let r = await getDreamPanelImage(d, 0);
    const landSeed = img.seeds[0], landRes = img.resolutions[0];
    innerWidth = 500; innerHeight = 900;
    const portKey = dreamPanelCacheKey(d, 0);
    img = stubImager();
    r = await getDreamPanelImage(d, 0);
    const portSeed = img.seeds[0], portRes = img.resolutions[0];
    innerWidth = 1280; innerHeight = 800;
    if (landKey === portKey) return 'landscape and portrait share a cache entry — one of them will crop badly';
    if (landRes === portRes) return 'the resolution did not follow the viewport';
    if (landSeed !== portSeed) return 'the seed moved with the device: ' + landSeed + ' vs ' + portSeed;
    if (landSeed !== d.panels[0].seed) return 'the generation seed is not the record\\'s own frozen seed';
    return true;
  })()`));

await check('the active image style folds into the key and onto the prompt, and still not into the seed',
  api(`(async () => {
    const gs = bench('key-3');
    const d = await readyDream(gs, 5);
    const plainKey = dreamPanelCacheKey(d, 0);
    let img = stubImager();
    await getDreamPanelImage(d, 0);
    const plainPrompt = img.prompts[0], plainSeed = img.seeds[0];

    const style = IMAGE_STYLES.find(s => s.id !== 'none' && s.suffix);
    settingsCache.imageStyle = style.id;
    const styledKey = dreamPanelCacheKey(d, 0);
    img = stubImager();
    await getDreamPanelImage(d, 0);
    const styledPrompt = img.prompts[0], styledSeed = img.seeds[0];
    settingsCache.imageStyle = SETTINGS_DEFAULTS.imageStyle;

    if (plainKey === styledKey) return 'a style change would serve pixels drawn in the old style';
    if (!styledPrompt.endsWith(style.suffix)) return 'applyImageStyle was not applied at the cache boundary';
    if (plainPrompt === styledPrompt) return 'the style never reached the prompt';
    if (plainSeed !== styledSeed) return 'the seed moved with the style';
    // The default-style key must stay byte-identical to the unstyled base +
    // orientation, so an existing cache survives the feature (the empty-token
    // rule imageStyleToken already carries).
    if (plainKey !== composeDreamPanelKey(d, 0) + '_' + sceneOrientation()) return 'the no-style key is not the bare base';
    return true;
  })()`));

console.log('\n3. the frozen prompt is read, never rebuilt (D14)');

await check('the generated prompt is the record\'s prompt plus a viewport clause, and nothing else',
  api(`(async () => {
    const gs = bench('froz-1');
    const d = await readyDream(gs, 6);
    const img = stubImager();
    await getDreamPanelImage(d, 0);
    const sent = img.prompts[0];
    if (!sent.startsWith(d.panels[0].prompt)) return 'the frozen prompt was not the head of what was generated';
    if (sent === d.panels[0].prompt) return 'the viewport clause was never appended (D30)';
    return true;
  })()`));

await check('mutating the world after the compile changes nothing about what is generated',
  api(`(async () => {
    const gs = bench('froz-2');
    const d = await readyDream(gs, 7);
    let img = stubImager();
    await getDreamPanelImage(d, 0);
    const before = img.prompts[0];

    // Everything the compiler read, moved: the cast's names, the player's
    // room, the clock. A photo of a room still looks like the room did when it
    // was taken, and so does a dream.
    for (const id of Object.keys(gs.npcs)) gs.npcs[id].bible.name = 'Renamed';
    gs.player.location = 'kitchen';
    gs.meta.clock.day += 30;
    root.kv = makeMemKv();
    img = stubImager();
    await getDreamPanelImage(d, 0);
    if (img.prompts[0] !== before) return 'the prompt was rebuilt from current state';
    return true;
  })()`));

await check('a second call is a cache hit: the plugin is asked once, the pixels come back twice',
  api(`(async () => {
    const gs = bench('froz-3');
    const d = await readyDream(gs, 8);
    const img = stubImager();
    const a = await getDreamPanelImage(d, 0);
    const b = await getDreamPanelImage(d, 0);
    if (img.calls !== 1) return 'the plugin was called ' + img.calls + ' times for one panel';
    if (a.cached !== false || b.cached !== true) return 'the cached flag does not report the truth';
    if (!a.url || !b.url) return 'a cache hit produced no url';
    if (a.key !== b.key) return 'the same panel resolved to two keys';
    return true;
  })()`));

console.log('\n4. the queue: two deep, one night and one nap (D19/D16)');

await check('a top-up fills the queue to queueCap and then stops asking',
  api(`(async () => {
    const gs = bench('queue-1');
    const w = stubWriter(); const img = stubImager();
    let n = 0;
    while (await topUpDreamQueue(gs)) n++;
    const q = gs.world.dreams.queue;
    if (q.length !== DREAM_TUNING.queueCap) return 'the queue settled at ' + q.length + ', not ' + DREAM_TUNING.queueCap;
    if (n !== DREAM_TUNING.queueCap) return 'topUpDreamQueue reported ' + n + ' successes for ' + q.length + ' dreams';
    // A full queue must cost NOTHING — not a compile, not a call, not a frame.
    const settled = { w: w.calls, i: img.calls };
    for (let k = 0; k < 3; k++) if (await topUpDreamQueue(gs) !== false) return 'a full queue reported a top-up';
    if (w.calls !== settled.w) return 'a full queue still cost ' + (w.calls - settled.w) + ' model calls';
    if (img.calls !== settled.i) return 'a full queue still cost ' + (img.calls - settled.i) + ' image generations';
    return true;
  })()`));

await check('the two slots are one night dream and one nap dream, night first',
  api(`(async () => {
    const gs = bench('queue-2');
    stubWriter(); stubImager();
    while (await topUpDreamQueue(gs)) {}
    const q = gs.world.dreams.queue;
    if (q[0].forSleep !== 'night') return 'the first slot went to a ' + q[0].forSleep + ' dream';
    if (q[1].forSleep !== 'nap') return 'the second slot went to a ' + q[1].forSleep + ' dream';
    // D16: a nap dream is a single-panel napOnly fragment form, or naps get
    // a three-panel descent in twenty minutes of game time.
    if (q[1].panels.length !== 1) return 'the nap dream has ' + q[1].panels.length + ' panels';
    if (DREAM_FORMS[q[1].slots.form].napOnly !== true) return 'the nap dream drew a night form';
    if (DREAM_FORMS[q[0].slots.form].napOnly === true) return 'the night dream drew a nap-only form';
    return true;
  })()`));

await check('every queued dream is rendered, fully written, and carries its frozen prompts and seeds',
  api(`(async () => {
    const gs = bench('queue-3');
    stubWriter(); stubImager();
    while (await topUpDreamQueue(gs)) {}
    for (const d of gs.world.dreams.queue) {
      if (d.status !== 'rendered') return 'a queued dream is at status ' + d.status;
      if (d.panels.length !== DREAM_FORMS[d.slots.form].beats.length) return 'panel count drifted from the form (D4)';
      for (let i = 0; i < d.panels.length; i++) {
        const p = d.panels[i];
        if (!p.text || !p.text.trim()) return 'panel ' + i + ' reached the queue with no prose';
        if (!p.prompt || !p.prompt.trim()) return 'panel ' + i + ' reached the queue with no frozen prompt';
        if (!Number.isFinite(p.seed)) return 'panel ' + i + ' reached the queue with no seed';
        if (p.seed !== hashStr(composeDreamPanelKey(d, i))) return 'panel ' + i + ' seed no longer matches its own key';
      }
    }
    return true;
  })()`));

await check('every queued dream\'s panels are actually in the image cache — the warm-cache promise (D19)',
  api(`(async () => {
    const gs = bench('queue-4');
    stubWriter(); const img = stubImager();
    while (await topUpDreamQueue(gs)) {}
    const generated = img.calls;
    // Re-asking for every panel must cost nothing: this is the whole point of
    // pre-generation, and the assertion Phase 7 depends on.
    for (const d of gs.world.dreams.queue) {
      for (let i = 0; i < d.panels.length; i++) {
        const r = await getDreamPanelImage(d, i);
        if (r.cached !== true) return 'a queued panel was not warm in the cache';
      }
    }
    if (img.calls !== generated) return 'repainting the queue cost ' + (img.calls - generated) + ' fresh generations';
    return true;
  })()`));

await check('nextIndex advances exactly once per queued dream, and no two dreams share an id',
  api(`(async () => {
    const gs = bench('queue-5');
    gs.world.dreams.nextIndex = 1;
    stubWriter(); stubImager();
    while (await topUpDreamQueue(gs)) {}
    const q = gs.world.dreams.queue;
    if (gs.world.dreams.nextIndex !== q.length + 1) return 'nextIndex is ' + gs.world.dreams.nextIndex + ' after ' + q.length + ' dreams';
    if (q[0].index === q[1].index) return 'two dreams share an index';
    if (q[0].id === q[1].id) return 'two dreams share an id — and therefore every panel cache key';
    return true;
  })()`));

console.log('\n5. all-or-nothing: nothing half-made reaches the queue (invariant 3)');

await check('an image plugin that is down leaves the queue EMPTY rather than short-rendered',
  api(`(async () => {
    const gs = bench('fail-1');
    stubWriter(); stubImager({ fail: true });
    const ok = await topUpDreamQueue(gs);
    if (ok !== false) return 'a dream with no pixels reported success';
    if (gs.world.dreams.queue.length !== 0) return 'a dream with no pixels reached the queue';
    return true;
  })()`));

await check('a plugin that dies PART WAY through a multi-panel dream still queues nothing',
  api(`(async () => {
    const gs = bench('fail-2', 3);
    const idx = indexWithPanels(gs, 3);
    if (idx === null) return 'no three-panel night form was reachable from this fixture';
    gs.world.dreams.nextIndex = idx;
    stubWriter();
    const img = stubImager({ failAfter: 1 });   // panel 0 renders, panel 1 dies
    const ok = await topUpDreamQueue(gs);
    if (ok !== false) return 'a partly-rendered dream reported success';
    if (gs.world.dreams.queue.length !== 0) return 'a partly-rendered dream reached the queue';
    if (img.calls < 2) return 'the render gave up before it reached the failing panel';
    return true;
  })()`));

await check('a failed attempt SPENDS its index, so no two compiles can share a cache key',
  api(`(async () => {
    const gs = bench('fail-3');
    gs.world.dreams.nextIndex = 1;
    stubWriter(); stubImager({ fail: true });
    await topUpDreamQueue(gs);
    if (gs.world.dreams.nextIndex === 1) return 'the failed attempt handed its index back';
    stubImager();
    await topUpDreamQueue(gs);
    const d = gs.world.dreams.queue[0];
    if (!d) return 'the retry queued nothing';
    if (d.index === 1) return 'the retry reused the failed attempt\\'s index, and with it its dream id and every panel key';
    return true;
  })()`));

await check('a model that throws still yields a queued dream — the templated fallback is the path that works',
  api(`(async () => {
    const gs = bench('fail-4');
    const w = stubWriter('throw'); stubImager();
    const ok = await topUpDreamQueue(gs);
    if (ok !== true) return 'a model failure took the dream down with it';
    const d = gs.world.dreams.queue[0];
    if (!d || d.status !== 'rendered') return 'the templated dream did not reach the queue';
    for (const p of d.panels) if (!p.text.trim()) return 'a templated panel came back blank';
    if (w.calls < 1) return 'the model was never asked in the first place';
    return true;
  })()`));

await check('dreamFrequency: off is a hard stop — no compile, no model call, no image quota',
  api(`(async () => {
    const gs = bench('off-1');
    settingsCache.dreamFrequency = 'off';
    const w = stubWriter(); const img = stubImager();
    const ok = await topUpDreamQueue(gs);
    settingsCache.dreamFrequency = SETTINGS_DEFAULTS.dreamFrequency;
    if (ok !== false) return 'a dream was queued with the dial off';
    if (gs.world.dreams.queue.length !== 0) return 'the queue grew with the dial off';
    if (w.calls !== 0) return 'the dial being off still cost ' + w.calls + ' model calls';
    if (img.calls !== 0) return 'the dial being off still cost ' + img.calls + ' image generations';
    if (gs.world.dreams.nextIndex !== 1) return 'the dial being off still spent an index';
    if (dreamFrequencyChance() <= 0) return 'the chance stayed at zero after the dial was restored';
    return true;
  })()`));

console.log('\n6. the guards: single flight, sequential, re-validated (D20/D21/D22)');

await check('two overlapping top-ups produce one dream and one model call (D20)',
  api(`(async () => {
    const gs = bench('guard-1');
    const w = stubWriter(); stubImager();
    const [a, b] = await Promise.all([topUpDreamQueue(gs), topUpDreamQueue(gs)]);
    if (a === b) return 'both overlapping calls reported ' + a;
    if (gs.world.dreams.queue.length !== 1) return 'two overlapping calls queued ' + gs.world.dreams.queue.length + ' dreams';
    if (w.calls !== 1) return 'two overlapping calls cost ' + w.calls + ' model calls (a good reply costs one)';
    if (dreamGenInFlight !== false) return 'the single-flight guard was not released';
    return true;
  })()`));

await check('the guard is released even when the whole pass fails',
  api(`(async () => {
    const gs = bench('guard-2');
    stubWriter(); stubImager({ fail: true });
    await topUpDreamQueue(gs);
    if (dreamGenInFlight !== false) return 'a failed pass left the engine permanently in flight';
    // ...and the next pass can therefore still run.
    stubImager();
    if (await topUpDreamQueue(gs) !== true) return 'the engine never recovered from a failed pass';
    return true;
  })()`));

await check('panel images generate strictly one at a time (D21)',
  api(`(async () => {
    const gs = bench('guard-3', 3);
    const idx = indexWithPanels(gs, 3);
    if (idx === null) return 'no three-panel night form was reachable from this fixture';
    gs.world.dreams.nextIndex = idx;
    stubWriter();
    const img = stubImager();
    await topUpDreamQueue(gs);
    if (img.calls < 3) return 'only ' + img.calls + ' panels were rendered';
    if (img.maxInFlight !== 1) return img.maxInFlight + ' panel generations overlapped — they would contend with the scene the player is looking at';
    return true;
  })()`));

await check('a dream generated for a DIFFERENT save is dropped rather than handed to the live one',
  api(`(async () => {
    const gs = bench('guard-4');
    stubWriter(); stubImager();
    // The player loads another save while the background pass is in flight.
    // liveDreamGameState reads currentGameState at WRITE time, not the
    // reference captured before the first await (D20).
    currentGameState = bench('guard-4-other');
    const other = currentGameState;
    const ok = await topUpDreamQueue(gs);
    const otherQ = other.world.dreams.queue.length;
    currentGameState = null;
    if (ok !== false) return 'a dream cast from a dead world reported success';
    if (otherQ !== 0) return 'the dream was pushed into the newly loaded save';
    return true;
  })()`));

await check('...and it is the SAVE IDENTITY that drops it, not the cast check standing in front',
  api(`(async () => {
    // The assertion above passes for two independent reasons — a fresh house
    // has different npc ids, so dreamStillValid rejects the cast before the
    // seed check is ever reached — and a guard that is only ever exercised
    // through another guard is a guard nobody would notice removing. This
    // isolates it: the live save is a CLONE, same npcs and same empty queue,
    // differing in one field. A dream with no cast at all (which the compiler
    // returns whenever the residue names nobody) would sail straight past
    // dreamStillValid into the wrong save without it.
    const gs = bench('guard-4b');
    stubWriter(); stubImager();
    const clone = structuredClone(gs);
    clone.meta.seed = gs.meta.seed + '-other';
    currentGameState = clone;
    const ok = await topUpDreamQueue(gs);
    const cloneQ = clone.world.dreams.queue.length;
    currentGameState = null;
    if (ok !== false) return 'a dream was handed to a save it was not compiled for';
    if (cloneQ !== 0) return 'the dream landed in the other save even though every npc in it validated';
    return true;
  })()`));

await check('a slot filled while the pass was in flight drops the dream rather than overflowing the cap',
  api(`(async () => {
    const gs = bench('guard-5');
    stubWriter();
    let planted = false;
    stubImager({ hook: async () => {
      if (planted) return;
      planted = true;
      // Something else queued a night dream while this one was rendering.
      const other = await readyDream(gs, 99, 'night');
      other.status = 'rendered';
      gs.world.dreams.queue.push(other);
    } });
    const ok = await topUpDreamQueue(gs);
    if (ok !== false) return 'the dream was pushed into a slot that had already been taken';
    if (gs.world.dreams.queue.length !== 1) return 'the queue holds ' + gs.world.dreams.queue.length + ' dreams';
    if (gs.world.dreams.queue[0].index !== 99) return 'the wrong dream survived';
    return true;
  })()`));

console.log('\n7. dreamStillValid: the four ways a queued record goes bad (D22)');

await check('a freshly queued dream is valid',
  api(`(async () => {
    const gs = bench('valid-1');
    stubWriter(); stubImager();
    await topUpDreamQueue(gs);
    const d = gs.world.dreams.queue[0];
    if (dreamStillValid(gs, d) !== true) return 'a dream this engine just built does not pass its own check';
    return true;
  })()`));

await check('a cast member who moved out, or vanished entirely, invalidates the dream',
  api(`(async () => {
    const gs = bench('valid-2');
    stubWriter(); stubImager();
    await topUpDreamQueue(gs);
    const d = gs.world.dreams.queue[0];
    if (!d.cast.length) return 'the fixture compiled a dream with nobody in it — nothing to test';
    const id = d.cast[0].npcId;

    const kept = gs.npcs[id].residency.status;
    gs.npcs[id].residency.status = 'former';
    const moved = dreamStillValid(gs, d);
    gs.npcs[id].residency.status = kept;
    if (moved !== false) return 'a dream about somebody who moved out is still being offered';

    const npc = gs.npcs[id];
    delete gs.npcs[id];
    const gone = dreamStillValid(gs, d);
    gs.npcs[id] = npc;
    if (gone !== false) return 'a dream about somebody who is not in the save is still being offered';

    if (dreamStillValid(gs, d) !== true) return 'the restore did not restore';
    return true;
  })()`));

await check('sfwMode flipping ON after the compile invalidates a queued erotic dream and nothing else',
  api(`(async () => {
    // The gate is hard and independent of every weight (D17), so it has to
    // hold at the queue's EXIT as well as at selection: a dream compiled
    // before the switch was thrown must not be shown after it.
    const gs = bench('valid-3');
    const d = await readyDream(gs, 11);
    d.status = 'rendered';
    const gated = Object.values(DREAM_REGISTERS).find(r => r.sfwGated);
    if (!gated) return 'no register is sfw-gated — the D17 gate has gone missing';

    d.slots.register = gated.id;
    settingsCache.sfwMode = true;
    const blocked = dreamStillValid(gs, d);
    const clean = Object.values(DREAM_REGISTERS).find(r => !r.sfwGated);
    d.slots.register = clean.id;
    const allowed = dreamStillValid(gs, d);
    settingsCache.sfwMode = false;
    d.slots.register = gated.id;
    const unblocked = dreamStillValid(gs, d);

    if (blocked !== false) return 'an erotic dream survived sfwMode being switched on';
    if (allowed !== true) return 'sfwMode invalidated a register it does not gate';
    if (unblocked !== true) return 'the gate did not lift when sfwMode went back off';
    return true;
  })()`));

await check('a dream that never got its prose is not valid, however complete it looks (D33)',
  api(`(async () => {
    const gs = bench('valid-4');
    const d = compileDream(gs, { index: 12 });   // compiled, never written
    if (d.status !== 'compiled') return 'the fixture is not at the status this asserts about';
    if (dreamStillValid(gs, d) !== false) return 'a dream with no prose passed as showable';
    applyDreamPanelText(d, buildDreamFallback(d, gs));
    if (dreamStillValid(gs, d) !== true) return 'writing the prose did not make it showable';
    return true;
  })()`));

await check('a form deleted from the tables between sessions invalidates its queued dreams',
  api(`(async () => {
    const gs = bench('valid-5');
    const d = await readyDream(gs, 13);
    d.slots.form = 'a_form_that_was_removed';
    if (dreamStillValid(gs, d) !== false) return 'a dream whose form no longer exists is still being offered';
    return true;
  })()`));

console.log('\n8. reads everything, writes nothing (invariant 2)');

await check('a full top-up touches world.dreams and the boundary stamp, and nothing else',
  api(`(async () => {
    const gs = bench('write-1');
    stubWriter(); stubImager();
    // saveAtBoundary stamps meta.playtimeMs/saveTimestamp on EVERY caller —
    // it is a running accumulator, so closing the interval early leaves the
    // total identical. Everything else in the save is compared verbatim.
    const snap = () => JSON.stringify({
      player: gs.player, npcs: gs.npcs, objects: gs.objects,
      clock: gs.meta.clock, sessionLog: gs.meta.sessionLog,
      world: Object.fromEntries(Object.entries(gs.world).filter(([k]) => k !== 'dreams')),
    });
    const before = snap();
    await topUpDreamQueue(gs);
    if (snap() !== before) return 'the top-up mutated the save outside world.dreams';
    if (gs.world.dreams.queue.length !== 1) return 'the top-up did not actually run';
    return true;
  })()`));

await check('the clock and the player\'s needs resolve identically across a top-up',
  api(`(async () => {
    // The standing per-phase obligation. Phase 6 adds two un-awaited call
    // sites to ui.js (the wake hook and the day rollover) and no time or
    // energy arithmetic at all; this is the assertion that keeps it that way.
    // Phase 7 is where a dream first touches a need, and it does it through
    // applyEffects.
    const gs = bench('write-2');
    stubWriter(); stubImager();
    const clock = JSON.stringify(gs.meta.clock);
    const needs = JSON.stringify({ e: gs.player.energy, m: gs.player.mood, h: gs.player.hygiene, f: gs.player.fullnessRemainingHours });
    await topUpDreamQueue(gs);
    if (JSON.stringify(gs.meta.clock) !== clock) return 'the clock moved';
    if (JSON.stringify({ e: gs.player.energy, m: gs.player.mood, h: gs.player.hygiene, f: gs.player.fullnessRemainingHours }) !== needs) return 'a player need moved';
    return true;
  })()`));

await check('the wake tint is carried on the record and is NOT applied by this phase (D12)',
  api(`(async () => {
    const gs = bench('write-3');
    stubWriter(); stubImager();
    const mood = gs.player.mood;
    await topUpDreamQueue(gs);
    const d = gs.world.dreams.queue[0];
    if (!d.wake || typeof d.wake.moodDelta !== 'number') return 'the queued record lost its wake tint';
    if (gs.player.mood !== mood) return 'the queue applied a wake tint that only Phase 7 may apply';
    return true;
  })()`));

console.log('\n9. the save/load round trip');

await check('a RENDERED dream survives a real write/load cycle, and its warm cache is still addressable',
  api(`(async () => {
    // The castWeb assertion, in the Phase 6 shape: world.dreams still
    // round-trips, and — the part that is new — dreamPanelCacheKey computed
    // off the RELOADED record must name the same entries the background pass
    // warmed, or every queued dream repaints from scratch on the sleep click,
    // which is design invariant 3 through the back door.
    const kv = makeMemKv();
    root.kv = kv;
    currentGameState = null;
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    innerWidth = 1280; innerHeight = 800;
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p6', clock: { day: 1, minutes: 0 } });
    const h = house('rt-p6', 3);
    stubWriter(); const img = stubImager();
    while (await topUpDreamQueue(h)) {}
    const before = JSON.parse(JSON.stringify(h.world.dreams));
    if (before.queue.length !== DREAM_TUNING.queueCap) return 'the fixture did not fill the queue';

    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();

    const store = loaded.world.dreams;
    if (!store || !Array.isArray(store.queue)) return 'world.dreams did not survive the round trip';
    if (JSON.stringify(store) !== JSON.stringify(before)) return 'world.dreams changed shape across a save/load';

    const generated = img.calls;
    for (const d of store.queue) {
      for (let i = 0; i < d.panels.length; i++) {
        if (dreamPanelCacheKey(d, i) !== dreamPanelCacheKey(before.queue.find(x => x.id === d.id), i)) return 'a reloaded panel resolves to a different cache key';
        const r = await getDreamPanelImage(d, i);
        if (r.cached !== true) return 'a reloaded panel could not find its warmed pixels';
      }
    }
    if (img.calls !== generated) return 'reloading cost ' + (img.calls - generated) + ' fresh generations';
    return true;
  })()`));

await check('the reloaded queue is still valid, and a top-up against it correctly does nothing',
  api(`(async () => {
    root.kv = makeMemKv();
    currentGameState = null;
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p6b', clock: { day: 1, minutes: 0 } });
    const h = house('rt-p6b', 3);
    stubWriter(); stubImager();
    while (await topUpDreamQueue(h)) {}
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    for (const d of loaded.world.dreams.queue) {
      if (dreamStillValid(loaded, d) !== true) return 'a reloaded dream no longer validates';
    }
    if (nextDreamSlot(loaded) !== null) return 'a full reloaded queue still reports a free slot';
    const w = stubWriter(); const img = stubImager();
    if (await topUpDreamQueue(loaded) !== false) return 'a full reloaded queue was topped up again';
    if (w.calls !== 0 || img.calls !== 0) return 'a full reloaded queue still spent quota';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
