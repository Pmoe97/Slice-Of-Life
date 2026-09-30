// Conversation overhaul Phase 1 (D1) — chat images stay where they happened.
//
//   node dev/verify/verify-conv-images.js
//
// The bug (user report, 2026-09-27): "When you close and open a conversation,
// all of the scene visualizations get pushed to the bottom of the
// conversation creating a long line of images." openConversationOverlay drew
// every recalled text row and THEN every persisted image, so the pictures
// were never placed by time at all. Worse, the two could not even be
// compared: image records stamped `tick` as a tick INDEX (0..47) while the
// recent buffer stamps `tick` as clock MINUTES.
//
// Now every image record carries an `anchor` (the line it followed, taken at
// REQUEST time) and `minutes`; convPlaceImages puts each picture right after
// its anchor row, falling back to time order for an evicted anchor or a
// legacy record; and a live panel replaces its own "generating" bubble
// instead of appending below replies that landed while it rendered.
//
// Runs the REAL ui.js functions, lifted by name into the engine vm with a
// minimal fake document (the verify-conv-scene.js / verify-roomlist-inbox.js
// approach — the suite is otherwise blind to what lands in the DOM).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'npc.js', 'asks.js', 'image.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

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
const LIFT = ['convPlaceImages', 'convRenderHistory', 'convRecalledRowEl', 'convPastImageEl',
  'convImageAnchor', 'askBubbleDisplay', 'maybeShowConversationScene', 'convShowGeneratingImage',
  'convAddImageBubble', 'convPushImage', 'convAddBeat', 'convAddBubble', 'convScrollToBottom'];
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
      insertBefore(c, ref) {
        const i = this.children.indexOf(ref);
        c.parentNode = this;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
      },
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
  var getChatImageUrl = async () => ({ url: null });
  function __folder() {
    const m = new Map();
    return {
      async get(k) { return m.get(k); }, async set(k, v) { m.set(k, v); return v; },
      async update(k, fn) { const v = await fn(m.get(k)); m.set(k, v); return v; },
      async delete(k) { m.delete(k); }, async keys() { return [...m.keys()]; },
    };
  }
  root.kv = { images: __folder(), meta: __folder() };
  root.generateText = undefined;   // Phase 1 is about placement, not the director
  var __gate = null;
  root.generateImage = async () => {
    if (__gate) await __gate.promise;
    return { canvas: { convertToBlob: async () => ({ fakeBlob: 1 }) } };
  };
  function __deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
  // What the pane shows, as a compact sequence: T=time label, P=player,
  // N=npc, B=beat, I:<tag>=image, G=generating placeholder.
  function __seq() {
    return __log.children.map((c) => {
      if (/conv-typing-image/.test(c.className)) return 'G';
      if (/conv-bubble-photo/.test(c.className)) {
        const t = (c.children.find((k) => k.className === 'conv-tag') || {}).textContent || '';
        return 'I:' + t;
      }
      if (c.className === 'conv-time') return 'T';
      if (c.className === 'conv-beat') return 'B:' + c.textContent;
      if (c.className === 'conv-bubble') return (c.getAttribute('data-from') === 'player' ? 'P:' : 'N:') + c.textContent;
      return '?' + c.className;
    });
  }
  function __ex(speaker, text, type, day, tick) { return { speaker, text, type, day, tick, channel: 'scene', sceneId: 1 }; }
`);
for (const list of Object.values(lifted)) if (list[0]) api(list[0]);
const capDecl = /const CONV_IMAGE_CAP = \d+;/.exec(UI);
if (capDecl) api(capDecl[0].replace('const', 'var'));

async function main() {
  api(`
    const h = SIM_generateHouse(20260927, 2);
    __g = { meta: { seed: h.seed, clock: { ...h.clock, day: 4, minutes: 1200 }, contentConfig: null, sessionLog: [] },
            player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    __g.player.location = 'living_room';
    currentGameState = __g;
    __id = Object.keys(__g.npcs).filter((k) => __g.npcs[k].residency && __g.npcs[k].residency.status === 'resident').sort()[0];
    __n = __g.npcs[__id];
    __n.bible.name = 'Mira';
    __n.location = 'living_room';
    __n.flags = __n.flags || {};
    settingsCache.sceneVisualizerMode = 'everyMessage';
  `);

  // ------------------------------------------------------------------ 1
  console.log('\n1. Recalled rows say where they came from');
  api(`
    __n.memory = { ...__n.memory, recent: [
      __ex('player', 'hey', 'player_input', 4, 1100),
      __ex('Mira', 'oh hi', 'dialogue', 4, 1100),
      __ex('player', 'want tea?', 'player_input', 4, 1130),
      __ex('Mira', 'yes please', 'dialogue', 4, 1130),
      __ex('player', 'milk?', 'player_input', 4, 1160),
      __ex('Mira', 'a splash', 'dialogue', 4, 1160),
    ] };
    __rows = recallSceneExchanges(__n, 4);
  `);
  const rows = J('__rows');
  check('bubble rows carry day, tick (minutes) and the raw entry text',
    rows.filter((r) => r.kind === 'bubble').every((r) => r.day === 4 && typeof r.tick === 'number' && typeof r.rawText === 'string'),
    JSON.stringify(rows.slice(0, 3)));
  check('the rendered text is unchanged (rawText is additive)',
    rows.filter((r) => r.kind === 'bubble').map((r) => r.text).join('|') === 'hey|oh hi|want tea?|yes please|milk?|a splash');

  // ------------------------------------------------------------------ 2
  console.log('\n2. convImageAnchor names the newest spoken line');
  const anc = J('convImageAnchor(__n)');
  check('anchor = the last scene-channel entry, tick in minutes', anc && anc.text === 'a splash' && anc.tick === 1160 && anc.day === 4, JSON.stringify(anc));
  check('an IM entry never becomes an anchor',
    J(`convImageAnchor({ memory: { recent: [__ex('Mira','in person','dialogue',4,10), { ...__ex('Mira','texted','dialogue',4,20), channel: 'im' }] } })`).text === 'in person');
  check('no history → no anchor', J('convImageAnchor({ memory: { recent: [] } })') === null);

  // ------------------------------------------------------------------ 3
  console.log('\n3. Reopening puts every image back where it happened');
  api(`
    __n.flags._convImages = [
      { kind: 'scene', from: 'npc', tag: 'S1', anchor: { day: 4, tick: 1100, text: 'oh hi' }, minutes: 1101, day: 4, prompt: 'p', seed: 1 },
      { kind: 'scene', from: 'npc', tag: 'S2', anchor: { day: 4, tick: 1130, text: 'yes please' }, minutes: 1131, day: 4, prompt: 'p', seed: 2 },
      { kind: 'scene', from: 'npc', tag: 'S3', anchor: { day: 4, tick: 1160, text: 'a splash' }, minutes: 1161, day: 4, prompt: 'p', seed: 3 },
    ];
    __log.children.length = 0;
    __drawn = convRenderHistory(__n);
  `);
  const seq1 = J('__seq()');
  check('each panel directly follows the line it illustrated (not all at the bottom)',
    seq1.join(',') === 'T,P:hey,N:oh hi,I:S1,T,P:want tea?,N:yes please,I:S2,T,P:milk?,N:a splash,I:S3',
    seq1.join(','));
  check('everything drawn is marked as past', J('__log.children.every((c) => c.hasAttribute("data-past"))'));
  check('the drawn count covers rows and images (so the Now separator shows)', J('__drawn') === seq1.length);

  // ------------------------------------------------------------------ 4
  console.log('\n4. Fallbacks: an evicted anchor, a legacy record, an image older than the buffer');
  api(`
    __n.flags._convImages = [
      // anchor text no longer in the buffer (evicted) → time order: 11:40 sits between want tea? and milk?
      { kind: 'scene', from: 'npc', tag: 'EVICTED', anchor: { day: 4, tick: 999, text: 'long gone' }, minutes: 1140, day: 4, prompt: 'p', seed: 4 },
      // legacy: no anchor, no minutes, tick is a tick INDEX (38 → 19:00 = 1140)
      { kind: 'scene', from: 'npc', tag: 'LEGACY', day: 4, tick: 38, prompt: 'p', seed: 5 },
      // from day 2 — before every row → drawn first
      { kind: 'scene', from: 'npc', tag: 'OLD', day: 2, tick: 10, prompt: 'p', seed: 6 },
    ];
    __log.children.length = 0;
    convRenderHistory(__n);
  `);
  const seq2 = J('__seq()');
  check('an image older than the whole buffer is drawn at the top',
    seq2[0] === 'I:OLD', seq2.join(','));
  check('an evicted anchor falls back to time order, not the bottom',
    seq2.indexOf('I:EVICTED') > seq2.indexOf('N:yes please') && seq2.indexOf('I:EVICTED') < seq2.indexOf('P:milk?'), seq2.join(','));
  check('a legacy record (tick INDEX, no minutes) is read as index × 30 minutes',
    seq2.indexOf('I:LEGACY') > seq2.indexOf('N:yes please') && seq2.indexOf('I:LEGACY') < seq2.indexOf('P:milk?'), seq2.join(','));
  check('two images placed at the same row keep the order they were taken',
    seq2.indexOf('I:EVICTED') < seq2.indexOf('I:LEGACY'));

  // ------------------------------------------------------------------ 5
  console.log('\n5. A shared photo replaces its own "[shared a photo: …]" line');
  api(`
    __n.memory = { ...__n.memory, recent: [
      __ex('player', 'look at this', 'player_input', 4, 1100),
      __ex('player', '[shared a photo: Kitchen, Day 4]', 'player_input', 4, 1110),
      __ex('Mira', 'aw, cute', 'dialogue', 4, 1110),
    ] };
    __n.flags._convImages = [
      { kind: 'shared', from: 'player', tag: 'Shared Photo', caption: 'Kitchen, Day 4', photoId: 'x',
        anchor: { day: 4, tick: 1110, text: '[shared a photo: Kitchen, Day 4]' }, minutes: 1110, day: 4, prompt: 'p', seed: 7 },
    ];
    __log.children.length = 0;
    convRenderHistory(__n);
  `);
  const seq3 = J('__seq()');
  check('the photo stands in for the bracketed text line, before the reaction',
    !seq3.some((s) => s.includes('[shared a photo')) && seq3.indexOf('I:Shared Photo') < seq3.indexOf('N:aw, cute')
      && seq3.indexOf('I:Shared Photo') > seq3.indexOf('P:look at this'),
    seq3.join(','));

  // ------------------------------------------------------------------ 6
  console.log('\n6. Live: a reply that lands mid-generation stays BELOW the panel');
  api(`
    __n.memory = { ...__n.memory, recent: [
      __ex('player', 'so anyway', 'player_input', 4, 1200),
      __ex('Mira', 'go on', 'dialogue', 4, 1200),
    ] };
    __n.flags._convImages = [];
    __log.children.length = 0;
    convAddBubble('player', 'so anyway');
    convAddBubble('npc', 'go on');
    convState = { npcId: __id, sending: false, sceneVisCount: 0, sceneVisLastMood: null };
    __gate = __deferred();
    __pending = maybeShowConversationScene(__id);
  `);
  // loadgame.js stubs setTimeout as a no-op, so flush microtasks instead —
  // enough turns for the cache miss to reach the gated generateImage await.
  for (let i = 0; i < 10; i++) await api('Promise.resolve()');
  check('the generating bubble sits right after the line that was just said', J('__seq()').join(',') === 'P:so anyway,N:go on,G', J('__seq()').join(','));
  // The player keeps talking while the image renders.
  api(`
    convAddBubble('player', 'and then');
    convAddBubble('npc', 'no way');
    __n.memory = { ...__n.memory, recent: [...__n.memory.recent,
      __ex('player', 'and then', 'player_input', 4, 1201), __ex('Mira', 'no way', 'dialogue', 4, 1201)] };
    __gate.resolve(); __gate = null;
  `);
  await api('__pending');
  const seq4 = J('__seq()');
  check('the finished panel took the placeholder\'s spot, above the later exchange',
    seq4.join(',') === 'P:so anyway,N:go on,I:🎨 Scene,P:and then,N:no way', seq4.join(','));
  const rec = J('__n.flags._convImages[0]');
  check('its record anchors to the line at REQUEST time, not delivery time',
    rec && rec.anchor && rec.anchor.text === 'go on' && rec.minutes === 1200, JSON.stringify(rec && { anchor: rec.anchor, minutes: rec.minutes }));
  api(`__log.children.length = 0; convRenderHistory(__n);`);
  const seq5 = J('__seq()');
  check('...so reopening draws it in the same place',
    seq5.indexOf('I:🎨 Scene') > seq5.indexOf('N:go on') && seq5.indexOf('I:🎨 Scene') < seq5.indexOf('P:and then'), seq5.join(','));

  // ------------------------------------------------------------------ 7
  console.log('\n7. Source wiring');
  const openFn = UI.slice(UI.indexOf('function openConversationOverlay'), UI.indexOf('function closeConversationOverlay'));
  check('openConversationOverlay draws the merged history', /convRenderHistory\(npc\)/.test(openFn) && !/convRenderImages\(npc\)/.test(openFn));
  check('ask photos and shared photos are anchored too',
    /kind: 'askphoto'[\s\S]{0,400}anchor: convImageAnchor\(npc\)/.test(UI) && /kind: 'shared'[\s\S]{0,300}anchor: convImageAnchor/.test(UI));
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
