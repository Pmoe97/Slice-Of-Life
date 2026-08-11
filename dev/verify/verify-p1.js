// Phase 1 verification — conversation memory correctness (D4-D7).
// npc.js's memory functions are pure and need no Perchance runtime, so they
// load into a bare vm context alongside config.js and are called directly.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const ctx = vm.createContext({ console, Math, JSON, Object, Array, String, Number, RegExp, Set, Map, Date });

// Minimal stubs for things config.js/npc.js touch at load time.
vm.runInContext(`
  var root = {};
  var DEV = false;
  function assert() {}
  function mulberry32(seed){ let a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
`, ctx);

for (const f of ['config.js', 'npc.js']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log(`LOAD FAIL ${f}: ${e.message}`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const api = (expr) => vm.runInContext(expr, ctx);
ctx.__t = {};
ctx.freshNpcOuter = () => freshNpc('n1');

function freshNpc(id) {
  return {
    bible: { name: id === 'n1' ? 'Hana' : 'Marcus', speech: {}, temperament: {} },
    relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
                 conversationPhase: 'early', intimacyLevel: 0, grievances: [] },
    memory: { facts: [], episodes: [], summary: '', recent: [], styleCounters: {} },
    mood: 0, needs: {}, flags: {},
  };
}

// ---------------------------------------------------------------
console.log('\nD4 — player line recorded BEFORE the NPC reply it provoked');
// ---------------------------------------------------------------
ctx.__t.gs = {
  meta: { clock: { day: 3, minutes: 600 } },
  npcs: { n1: freshNpc('n1') },
  player: { location: 'kitchen', inventory: [], money: 100 },
  objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
};
ctx.__t.sceneCtx = {
  channel: 'scene',
  activeNpcs: [{ id: 'n1', name: 'Hana' }],
  ambientNpcs: [], player: { money: 100 },
  roomObjects: {}, carryItems: [],
};

const script = `
(async () => {
  const turns = [
    ['Hey, how was your day?',        "I'm fine, just tired."],
    ['Long shift?',                    'Double. My feet are killing me.'],
    ['Want me to make you something?', "God, yes. Anything."],
    ['Pasta okay?',                    'Perfect.'],
    ['Give me ten minutes.',           "You're a lifesaver."],
  ];
  for (const [playerLine, npcLine] of turns) {
    await applyProposal(
      { dialogue: [{ speaker: 'Hana', text: npcLine }] },
      __t.sceneCtx, __t.gs, playerLine
    );
  }
  return __t.gs.npcs.n1.memory.recent;
})()
`;

api(script).then(recent => {
  const speakers = recent.map(e => e.speaker);
  const alternates = speakers.every((s, i) => (i % 2 === 0 ? s === 'player' : s === 'Hana'));
  check('transcript alternates player -> npc -> player -> npc', alternates, `got: ${speakers.join(' , ')}`);
  check('first entry is the player, not the reply', recent[0].speaker === 'player' && recent[0].text === 'Hey, how was your day?',
        `got: ${recent[0].speaker}: "${recent[0].text}"`);
  check('the answer follows its own question', recent[1].text === "I'm fine, just tired." && recent[0].text === 'Hey, how was your day?');
  check('every entry tagged channel=scene', recent.every(e => e.channel === 'scene'));

  // -------------------------------------------------------------
  console.log('\nD5 — buffer depth 40, prompt slice 16');
  // -------------------------------------------------------------
  ctx.__t.deep = freshNpc('n1');
  api(`
    for (let i = 0; i < 60; i++) {
      __t.deep = addRecentExchange(__t.deep, i % 2 ? 'Hana' : 'player', 'line ' + i, 'dialogue', 1, 0, 'scene');
    }
  `);
  const deepLen = api(`__t.deep.memory.recent.length`);
  check('buffer caps at MEMORY_BUDGET.maxRecent (40)', deepLen === 40, `got ${deepLen}`);
  check('cap keeps the NEWEST, drops the oldest', api(`__t.deep.memory.recent[39].text`) === 'line 59');
  const sliceLen = api(`getRecentExchanges(__t.deep, undefined, 'scene').split(' | ').length`);
  check('prompt slice returns 16 entries by default', sliceLen === 16, `got ${sliceLen}`);

  // -------------------------------------------------------------
  console.log('\nD6 — scene and IM transcripts do not interleave');
  // -------------------------------------------------------------
  ctx.__t.mixed = freshNpc('n1');
  api(`
    __t.mixed = addRecentExchange(__t.mixed, 'player', 'SPOKEN-1', 'player_input', 1, 0, 'scene');
    __t.mixed = addRecentExchange(__t.mixed, 'Hana',   'SPOKEN-2', 'dialogue',     1, 0, 'scene');
    __t.mixed = addRecentExchange(__t.mixed, 'player', 'TEXTED-1', 'player_input', 1, 0, 'im');
    __t.mixed = addRecentExchange(__t.mixed, 'Hana',   'TEXTED-2', 'dialogue',     1, 0, 'im');
  `);
  const sceneOnly = api(`getRecentExchanges(__t.mixed, 10, 'scene')`);
  const imOnly    = api(`getRecentExchanges(__t.mixed, 10, 'im')`);
  check('scene view excludes text messages', sceneOnly.includes('SPOKEN-1') && !sceneOnly.includes('TEXTED'), `got: ${sceneOnly}`);
  check('IM view excludes spoken dialogue', imOnly.includes('TEXTED-1') && !imOnly.includes('SPOKEN'), `got: ${imOnly}`);

  // legacy entries (no channel field) must not vanish from the scene view
  ctx.__t.legacy = freshNpc('n1');
  api(`__t.legacy.memory.recent = [{ speaker: 'player', text: 'OLD-SAVE-LINE', type: 'player_input', day: 1, tick: 0 }];`);
  check('pre-migration entries with no channel read as scene',
        api(`getRecentExchanges(__t.legacy, 10, 'scene')`).includes('OLD-SAVE-LINE'));

  // -------------------------------------------------------------
  console.log('\nD7 — assembleImContext carries the real thread');
  // -------------------------------------------------------------
  api(`
    __t.gs.world.computer.apps.im.threads.n1 = { msgs: [], unread: 0 };
    for (let i = 0; i < 30; i++) {
      __t.gs.world.computer.apps.im.threads.n1.msgs.push({ from: i % 2 ? 'npc' : 'player', text: 'msg' + i, day: 1, tick: 0 });
    }
    __t.imCtx = assembleImContext(__t.gs, 'n1');
  `);
  const tail = api(`__t.imCtx.imThread`);
  check('imThread present on the IM context', Array.isArray(tail));
  check('trimmed to IM_PROMPT.threadDepth (12)', tail.length === 12, `got ${tail && tail.length}`);
  check('it is the TAIL, i.e. the most recent messages', tail[tail.length - 1].text === 'msg29', `got ${tail[tail.length-1].text}`);
  check('IM context is tagged channel=im', api(`__t.imCtx.channel`) === 'im');
  check('empty thread degrades to []', (() => {
    api(`__t.imCtx2 = assembleImContext(__t.gs, 'n1');`);
    api(`delete __t.gs.world.computer.apps.im.threads.n1;`);
    api(`__t.imCtx3 = assembleImContext(__t.gs, 'n1');`);
    return api(`__t.imCtx3.imThread.length`) === 0;
  })());

  // -------------------------------------------------------------
  console.log('\nGrievance matching — the clause that never fired');
  // -------------------------------------------------------------
  ctx.__t.g = freshNpc('n1');
  api(`
    __t.g = addGrievance(__t.g, 'washed dishes', 0.3, 1);
    __t.g = addGrievance(__t.g, 'left dishes in the sink', 0.4, 1);
    __t.g = addGrievance(__t.g, 'never takes the bins out', 0.3, 1);
  `);
  api(`__t.gA = resolveGrievance(__t.g, 'dishes');`);
  const afterBare = api(`__t.gA.relPlayer.grievances.map(x => x.resolved)`);
  check('bare "dishes" no longer resolves "washed dishes"', afterBare[0] === false,
        `"washed dishes".resolved = ${afterBare[0]}`);
  check('bare "dishes" no longer resolves "left dishes in the sink"', afterBare[1] === false);

  api(`__t.gB = resolveGrievance(__t.g, 'left dishes in the sink');`);
  check('the full phrase still resolves its grievance', api(`__t.gB.relPlayer.grievances[1].resolved`) === true);
  check('and does not touch the others',
        api(`__t.gB.relPlayer.grievances[0].resolved`) === false && api(`__t.gB.relPlayer.grievances[2].resolved`) === false);

  // A one-word query covers too little of the grievance to be the same
  // grievance — this is the over-matching the coverage rule exists to stop.
  api(`__t.gC = resolveGrievance(__t.g, 'bins');`);
  check('a lone word does not clear a long grievance', api(`__t.gC.relPlayer.grievances[2].resolved`) === false);

  // The realistic case: the model echoes most of the grievance back.
  api(`
    __t.gEcho = freshNpcOuter();
    __t.gEcho = addGrievance(__t.gEcho, 'left dirty dishes in the sink', 0.4, 1);
    __t.gEcho = resolveGrievance(__t.gEcho, 'dirty dishes in the sink');
  `);
  check('a partial echo covering most of the text resolves it',
        api(`__t.gEcho.relPlayer.grievances[0].resolved`) === true);

  api(`__t.gD = resolveGrievance(__t.g, 'ish');`);
  check('a short substring matches nothing', api(`__t.gD.relPlayer.grievances.every(x => !x.resolved)`) === true);

  api(`__t.gE = resolveGrievance(__t.g, 1);`);
  check('index-based resolution still works', api(`__t.gE.relPlayer.grievances[1].resolved`) === true);

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
