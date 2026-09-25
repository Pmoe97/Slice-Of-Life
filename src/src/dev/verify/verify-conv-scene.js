// Conversation scene visualizer — a generated panel actually reaches the chat
// (bug report, 2026-09-23: "I see it Generating, but the image never ships").
//
//   node src/src/dev/verify/verify-conv-scene.js
//
// The bug: ui.js's maybeShowConversationScene took the NPC RECORD and read
// `npc.id` — but an NPC record never carries its own id (the id is only the
// key into gameState.npcs), so it was always undefined. Generation ran, the
// generating bubble cleared, and then the "conversation closed/switched
// mid-generation?" guard compared the real convState.npcId against undefined
// and returned: every panel was thrown away, from F3's first commit on. The
// same undefined made image.js's cache key `convscene_undefined_<n>` for
// every NPC, so a second person's panel 1 would have reused the first
// person's pixels. Live-reproduced in dev-harness.html and re-verified after
// the fix (the id is now threaded through from doConvSend).
//
// Runs the REAL UI functions, lifted verbatim out of ui.js by name and
// evaluated in the engine vm against a minimal fake `document` (the same
// approach as verify-roomlist-inbox.js — the suite is otherwise blind to
// what lands in the DOM). Generation, caching and the prompt are the real
// image.js; only root.generateImage and root.kv are faked.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'settings.js', 'sim.js', 'llm.js', 'image.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

// Every declaration of `name` in `src`, brace-matched (see
// verify-roomlist-inbox.js for why exactly-one is asserted).
function bodies(src, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const re = new RegExp(`(?:async )?function ${name}\\(`, 'g');
    re.lastIndex = from;
    const m = re.exec(src);
    if (!m) break;
    let depth = 0, started = false, j = m.index;
    for (; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
    }
    out.push(src.slice(m.index, j));
    from = j;
  }
  return out;
}
const UI = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const LIFT = ['maybeShowConversationScene', 'convShowGeneratingImage', 'convAddImageBubble',
  'convPushImage', 'convRenderImages', 'convAddBeat', 'convScrollToBottom'];
const lifted = Object.fromEntries(LIFT.map((n) => [n, bodies(UI, n)]));

console.log('\n0. The lifted functions');
for (const [name, list] of Object.entries(lifted)) {
  check(`${name} is declared exactly once in ui.js`, list.length === 1, `found ${list.length}`);
}

api(`
  function __el(tag) {
    const attrs = new Map();
    return {
      tag, className: '', textContent: '', innerHTML: '', src: '', alt: '', children: [], parentNode: null,
      scrollTop: 0, scrollHeight: 0,
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      remove() {
        if (!this.parentNode) return;
        const sib = this.parentNode.children;
        sib.splice(sib.indexOf(this), 1);
        this.parentNode = null;
      },
      get isConnected() { return !!this.parentNode; },
    };
  }
  var __log = __el('div');
  document = { createElement: (t) => __el(t), getElementById: (id) => (id === 'conv-log' ? __log : null) };
  var btoa = () => 'placeholder';
  var currentGameState = null;
  var convState = null;
  var setImageMeta = () => {};
  var rerollChatImage = async () => ({});
  var saveAtBoundary = async () => {};

  // root.kv: just the two folders the image LRU reads and writes.
  function __folder() {
    const m = new Map();
    return {
      async get(k) { return m.get(k); },
      async set(k, v) { m.set(k, v); return v; },
      async update(k, fn) { const v = await fn(m.get(k)); m.set(k, v); return v; },
      async delete(k) { m.delete(k); },
      async keys() { return [...m.keys()]; },
    };
  }
  root.kv = { images: __folder(), meta: __folder() };
  var __gens = [];
  var __gate = null;   // when set, generation waits on it (the mid-generation close case)
  root.generateImage = async (prompt, opts) => {
    __gens.push({ prompt, seed: opts.seed, resolution: opts.resolution });
    if (__gate) await __gate.promise;
    return { canvas: { convertToBlob: async () => ({ fakeBlob: __gens.length }) } };
  };
  function __deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
  function __rows() {
    return __log.children.map((c) => ({
      cls: c.className, past: c.hasAttribute('data-past'), text: c.textContent,
      tag: (c.children.find((k) => k.className === 'conv-tag') || {}).textContent || null,
      img: (c.children.find((k) => k.tag === 'img') || {}).src || null,
    }));
  }
`);
for (const list of Object.values(lifted)) if (list[0]) api(list[0]);
// convPushImage's cap, lifted as the literal ui.js declares it.
const capDecl = /const CONV_IMAGE_CAP = \d+;/.exec(UI);
check('CONV_IMAGE_CAP is declared in ui.js', !!capDecl);
if (capDecl) api(capDecl[0].replace('const', 'var'));

async function main() {
  api(`
    const h = SIM_generateHouse(20260923, 3);
    __g = { meta: { seed: h.seed, clock: { ...h.clock, day: 3, minutes: 1170 }, contentConfig: null, sessionLog: [] },
            player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    __g.player.location = 'living_room';
    currentGameState = __g;
    __ids = Object.keys(__g.npcs).filter((k) => __g.npcs[k].residency && __g.npcs[k].residency.status === 'resident').sort();
    // SIM_generateHouse leaves bible.name empty (names arrive with the
    // character pass), which would make every "names them" check vacuous.
    __ids.forEach((k, i) => { __g.npcs[k].bible.name = ['Mira', 'Jonah', 'Tamsin'][i] || ('Roomie' + i); });
    for (const k of __ids) __g.npcs[k].flags = __g.npcs[k].flags || {};
    settingsCache.sceneVisualizerMode = 'everyMessage';
  `);
  const ids = J('__ids');
  const [a, b] = ids;

  // ------------------------------------------------------------------ 1
  console.log('\n1. The premise the old code got wrong');
  check('the house has at least two residents to talk to', ids.length >= 2, JSON.stringify(ids));
  check('no NPC record carries its own id — the id is only the key into gameState.npcs',
    J(`Object.values(__g.npcs).every((n) => !Object.prototype.hasOwnProperty.call(n, 'id'))`));
  check('doConvSend hands maybeShowConversationScene the conversation\'s id, not the record',
    /maybeShowConversationScene\(myNpcId\)/.test(UI) && !/maybeShowConversationScene\(sceneNpc\)/.test(UI));

  // ------------------------------------------------------------------ 2
  console.log('\n2. A due panel is generated AND painted into the chat');
  api(`convState = { npcId: ${JSON.stringify(a)}, sending: false, sceneVisCount: 0, sceneVisLastMood: null };`);
  await api(`maybeShowConversationScene(${JSON.stringify(a)})`);
  const rowsA = J('__rows()');
  check('exactly one generation ran', J('__gens.length') === 1, `gens: ${J('__gens.length')}`);
  check('the scene prompt names the person being talked to',
    J(`__gens[0].prompt.includes(__g.npcs[${JSON.stringify(a)}].bible.name) && / talking with /.test(__gens[0].prompt)`));
  check('the generating bubble is gone and a 🎨 Scene bubble holding the image took its place',
    rowsA.length === 1 && rowsA[0].cls === 'conv-bubble conv-bubble-photo' && rowsA[0].tag === '🎨 Scene'
      && /^blob:test\//.test(rowsA[0].img || ''),
    JSON.stringify(rowsA));
  const recA = J(`__g.npcs[${JSON.stringify(a)}].flags._convImages || null`);
  check('the panel is persisted on the NPC under their real id (so reopening repaints it)',
    Array.isArray(recA) && recA.length === 1 && recA[0].kind === 'scene' && recA[0].cacheKey === `${a}_1`,
    JSON.stringify(recA && recA.map((r) => r.cacheKey)));
  const cacheKeys = await api(`root.kv.images.keys()`);
  check('its pixels are cached under the NPC\'s own key, not convscene_undefined_1',
    cacheKeys.some((k) => k.startsWith(`convscene_${a}_1`)) && !cacheKeys.some((k) => k.includes('undefined')),
    JSON.stringify(cacheKeys));

  // ------------------------------------------------------------------ 3
  console.log('\n3. A second person\'s first panel is their own picture');
  api(`__log.children.length = 0; convState = { npcId: ${JSON.stringify(b)}, sending: false, sceneVisCount: 0, sceneVisLastMood: null };`);
  await api(`maybeShowConversationScene(${JSON.stringify(b)})`);
  check('a fresh generation ran for them (no cache hit on the first person\'s panel 1)',
    J('__gens.length') === 2 && J(`__gens[1].prompt.includes(__g.npcs[${JSON.stringify(b)}].bible.name)`));
  check('different seeds for the two panels', J('__gens[0].seed !== __gens[1].seed'));
  check('their bubble landed too', J('__rows()').filter((r) => r.tag === '🎨 Scene').length === 1);

  // ------------------------------------------------------------------ 4
  console.log('\n4. The mid-generation guard still does its job');
  api(`__log.children.length = 0; __gate = __deferred(); convState = { npcId: ${JSON.stringify(a)}, sending: false, sceneVisCount: 0, sceneVisLastMood: null };`);
  api(`__pending = maybeShowConversationScene(${JSON.stringify(a)});`);
  await api(`new Promise((r) => r())`);
  check('while generating, the chat shows the generating bubble', J('__rows()').some((r) => /conv-typing-image/.test(r.cls)));
  api(`convState = null; __log.children.length = 0; __gate.resolve(); __gate = null;`);
  await api('__pending');
  check('closing the conversation mid-generation paints nothing into the (closed) log',
    J('__rows()').length === 0, JSON.stringify(J('__rows()')));
  check('...and persists no half-delivered panel', J(`(__g.npcs[${JSON.stringify(a)}].flags._convImages || []).length`) === 1);

  // ------------------------------------------------------------------ 5
  console.log('\n5. Reopening repaints the delivered panel');
  api(`__log.children.length = 0; __drawn = convRenderImages(__g.npcs[${JSON.stringify(a)}]);`);
  await api(`new Promise((r) => r())`);
  await api(`new Promise((r) => r())`);
  const re = J('__rows()');
  check('convRenderImages draws the persisted scene as a past bubble',
    J('__drawn') === 1 && re.length === 1 && re[0].past && re[0].tag === '🎨 Scene', JSON.stringify(re));

  // ------------------------------------------------------------------ 6
  console.log('\n6. A failed generation still says so');
  api(`__log.children.length = 0; convState = { npcId: ${JSON.stringify(b)}, sending: false, sceneVisCount: 0, sceneVisLastMood: null };
       __realGen = root.generateImage; root.generateImage = async () => { throw new Error('boom'); };`);
  await api(`maybeShowConversationScene(${JSON.stringify(b)})`);
  api(`root.generateImage = __realGen;`);
  const failRows = J('__rows()');
  check('the generating bubble clears and the "didn\'t render" beat appears instead',
    failRows.length === 1 && failRows[0].cls === 'conv-beat' && /didn't render/.test(failRows[0].text),
    JSON.stringify(failRows));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
