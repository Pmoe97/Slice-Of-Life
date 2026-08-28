// Dream Engine Phase 7 — presentation, and the sleep/nap hooks.
// (src/ref/complete/dream-engine-plan.md)
//
// Phase 6 filled the queue in the background. This phase spends it: the player
// sleeps, watches one to three panels turn over, wakes with the register's
// tint on the morning, and the dream is filed into the diary. The assertions
// below aim at six things:
//
//   NO GENERATION      — design invariant 3, at the exact moment it matters.
//   (invariant 3)        Consuming a dream must not compile, must not call the
//                        model and must not generate an image. An empty queue
//                        is no dream, silently — never a wait, never a spinner.
//   THE ROLL           — shouldDream is a seeded draw from its OWN stream
//   (D24/D16/D5)         (invariant 5), damped for naps by napChanceMult, hard
//                        zero on `off`, and capped at one dream per day by
//                        lastDreamDay. Stable across a reload, so clicking
//                        Sleep twice cannot fish a dream into existence.
//   THE SLOT (D36)     — the queue is one night dream and one nap dream, so
//                        consumption looks for the matching forSleep, never
//                        for queue[0]. A record that no longer validates is
//                        dropped rather than left holding its slot forever.
//   THE TINT (D12)     — the ONLY sim write a dream makes, through applyEffects
//                        so it produces honest `applied` rows, with the
//                        REGISTER'S own numbers and no others. Nothing else in
//                        the save moves: not the clock, not an NPC, not a
//                        relationship, not a fact (invariant 2).
//   THE FILING         — the whole record into the diary (Phase 8 repaints it
//   (D9/D10/D14)         from frozen prompt+seed, Phase 9 recurs it from the
//                        slots), the motif into the carryover pool, the sources
//                        into the dedupe ring, every one of them capped oldest-
//                        out. A dream the window could not show is NOT filed.
//   THE WINDOW (D15)   — one session, an internal cursor. A tap advances while
//                        panels remain and closes only on the last, which is
//                        what makes it one window rather than N.
//
// Like the other five dream harnesses this asserts INVARIANTS, never phrasing:
// "the tint equals the register's own number", not "the tint is 0.03".
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
// image.js is deliberately NOT in `required`, for the reason
// verify-dreams-compile.js records: its very last statement is a
// window.addEventListener the vm's window shim has no method for, so the
// loader marks it failed even though every declaration in it has already run.
const { api } = loadEngine({ required: ['dreams.js', 'defs.dreams.js', 'actionwindow.js', 'effects.js', 'llm.js', 'x5.js', 'defs.settings.js', 'settings.js', 'state.js', 'sim.js', 'config.js'] });

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
  var URL = { createObjectURL: () => 'blob:dream-' + (URL._n = (URL._n || 0) + 1), revokeObjectURL: () => {} };

  // ui.js is not in this harness's load order, so liveDreamGameState's typeof
  // guard falls through to the caller's reference — which is what every
  // assertion wants except the one that deliberately simulates a different
  // save being live.
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
    for (let i = 0; i < (n || 3); i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n || 3, partials);
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
    h.world.phone = h.world.phone || defaultPhoneState();
    h.world.afterHours = h.world.afterHours || defaultAfterHoursState();
    h.world.dreams = h.world.dreams || defaultDreamState();
    const ids = Object.keys(h.npcs);
    h.player.ledger = { [ids[Math.min(1, ids.length - 1)]]: [{ kind: 'participated', act: 'sex', day: h.meta.clock.day, roomId: 'bedroom_player', otherNpcId: null, spent: false, outcome: null }] };
    h.npcs[ids[0]].relPlayer.grievances = [{ text: 'You left the dishes in the sink again', severity: 0.6, day: h.meta.clock.day, resolved: false }];
    return h;
  }

  // The real presentDream, captured before any assertion swaps a stub in.
  // Without this the section that asserts the REAL one refuses without a DOM
  // would be asserting against whatever stub ran last, and would pass or fail
  // for a reason that has nothing to do with the guard.
  var realPresentDream = presentDream;

  function bench(seed, n) {
    root.kv = makeMemKv();
    currentGameState = null;
    actionWindowSession = null;
    presentDream = realPresentDream;
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    innerWidth = 1280; innerHeight = 800;
    return house(seed || 'p7', n || 3);
  }

  // A written, rendered dream, built WITHOUT the queue so an assertion can own
  // its own record. Templated prose (D34) rather than a stubbed model — the
  // prose is not this phase's subject and the fallback is deterministic.
  function readyDream(gs, index, forSleep) {
    const d = compileDream(gs, { index: index || 1, forSleep: forSleep || 'night' });
    applyDreamPanelText(d, buildDreamFallback(d, gs));
    d.status = 'rendered';
    return d;
  }

  // Park one straight into the queue, the way a top-up would have.
  function queueDream(gs, index, forSleep) {
    const d = readyDream(gs, index, forSleep);
    gs.world.dreams.queue.push(d);
    return d;
  }

  // Count every model and image call made while fn runs. Both plugins are
  // rigged to THROW, because on this phase's paths the correct number of calls
  // is zero and a throw makes a stray one impossible to miss.
  async function withNoGeneration(fn) {
    const state = { text: 0, image: 0 };
    root.generateText = async () => { state.text++; throw new Error('the sleep path called the model'); };
    root.generateImage = async () => { state.image++; throw new Error('the sleep path generated an image'); };
    await fn();
    return state;
  }

  // presentDream, stubbed. The real one needs a DOM; section 7 asserts that it
  // refuses without one, and everywhere else the question is what the CALLER
  // does with the answer.
  function stubPresent(reason) {
    const state = { calls: 0, dreams: [] };
    presentDream = async (gs, dream) => { state.calls++; state.dreams.push(dream); return reason; };
    return state;
  }

  // Find an index whose dream lands on a register with a non-zero tint, so the
  // tint assertions are not at the mercy of whichever register the seed rolled.
  function indexWithTint(gs, forSleep) {
    for (let i = 1; i < 200; i++) {
      const d = compileDream(gs, { index: i, forSleep: forSleep || 'night' });
      const reg = DREAM_REGISTERS[d.slots.register];
      if (reg && (reg.moodDelta || reg.energyDelta)) return i;
    }
    return null;
  }

  // Everything a dream is forbidden to touch (invariant 2), as one string.
  function saveSnapshot(gs) {
    return JSON.stringify({
      npcs: gs.npcs, objects: gs.objects,
      clock: gs.meta.clock, sessionLog: gs.meta.sessionLog,
      world: Object.fromEntries(Object.entries(gs.world).filter(([k]) => k !== 'dreams')),
      // The player MINUS the two fields D12 is allowed to move.
      player: Object.fromEntries(Object.entries(gs.player).filter(([k]) => k !== 'energy' && k !== 'moodEvents')),
    });
  }
`);

async function main() {

console.log('\n1. the surface exists, and the wake lines cover every band');

await check('every Phase 7 identifier resolves, in the file the plan assigned it to',
  api(`(() => {
    for (const n of ['shouldDream', 'pickQueuedDream', 'dreamWakeLine', 'applyDreamWake', 'fileDreamToDiary', 'playQueuedDream']) {
      if (typeof eval(n) !== 'function') return n + ' is missing (dreams.js)';
    }
    for (const n of ['presentDream', 'loadDreamPanels', 'actionWindowAdvancesDream', 'advanceDreamPanel', 'awWireContinue']) {
      if (typeof eval(n) !== 'function') return n + ' is missing (actionwindow.js)';
    }
    if (typeof DREAM_WAKE_LINES !== 'object' || !DREAM_WAKE_LINES) return 'DREAM_WAKE_LINES is missing (defs.dreams.js)';
    return true;
  })()`));

await check('every wake band has lines, and every line belongs to a band (both directions)',
  api(`(() => {
    for (const band of DREAM_WAKE_BANDS) {
      const lines = DREAM_WAKE_LINES[band];
      if (!Array.isArray(lines) || lines.length === 0) return 'band ' + band + ' has no wake line';
      for (const l of lines) if (typeof l !== 'string' || l.trim().length < 20) return 'band ' + band + ' carries an empty or stub line';
    }
    for (const k of Object.keys(DREAM_WAKE_LINES)) {
      if (!DREAM_WAKE_BANDS.includes(k)) return 'DREAM_WAKE_LINES carries ' + k + ', which is not a band';
    }
    // Every register must name a band that exists, or a dream compiled from it
    // would wake the player with an empty line.
    for (const reg of Object.values(DREAM_REGISTERS)) {
      if (!DREAM_WAKE_LINES[reg.band]) return 'register ' + reg.id + ' names band ' + reg.band + ', which has no lines';
    }
    return true;
  })()`));

await check('dreams.js draws from no stream but its own — no Math.random anywhere in it',
  (() => {
    // Invariant 5. A Math.random on the consumption path would also make the
    // roll re-rollable by reloading, which is the savescum half of the same
    // rule (the roll is seeded on the day and the kind for exactly that).
    const src = fs.readFileSync(path.join(SRC, 'dreams.js'), 'utf8');
    const hits = src.split(/\r?\n/).map((l, i) => [i + 1, l])
      .filter(([, l]) => /Math\.random/.test(l) && !/^\s*\/\//.test(l));
    if (hits.length) return 'dreams.js reaches for Math.random at line ' + hits[0][0];
    return true;
  })());

console.log('\n2. the roll (D24 / D16 / D5)');

await check('`off` is a hard zero, and a hard STOP rather than a roll that always loses',
  api(`(() => {
    const gs = bench('roll-off');
    settingsCache.dreamFrequency = 'off';
    // The answer, first. This half passes with or without the short-circuit,
    // because rng() < 0 is false anyway — which is exactly why it is not the
    // whole assertion. A guard only ever exercised through another guard is a
    // guard nobody would notice removing (the Phase 6 lesson, in the same
    // shape).
    for (let day = 1; day <= 60; day++) {
      gs.meta.clock.day = day;
      if (shouldDream(gs, 'night')) return 'a night dreamt on day ' + day + ' with the dial off';
      if (shouldDream(gs, 'nap')) return 'a nap dreamt on day ' + day + ' with the dial off';
    }
    // ...and the COST. DREAM_FREQUENCIES.off promises "no compile, no
    // background render, no image quota spent", and a dial that opened a
    // stream per sleep to lose on it is not that promise kept.
    const realSeeded = seededRng;
    let draws = 0;
    try {
      seededRng = (a, b) => { draws++; return realSeeded(a, b); };
      for (let day = 1; day <= 20; day++) {
        gs.meta.clock.day = day;
        shouldDream(gs, 'night');
        shouldDream(gs, 'nap');
      }
    } finally { seededRng = realSeeded; }
    if (draws !== 0) return 'the off dial opened ' + draws + ' RNG stream(s) — it rolls and loses rather than stopping';
    return true;
  })()`));

await check('the roll is stable — the same day, the same save and the same kind always agree',
  api(`(() => {
    const gs = bench('roll-stable');
    settingsCache.dreamFrequency = 'sometimes';
    for (let day = 1; day <= 30; day++) {
      gs.meta.clock.day = day;
      const first = shouldDream(gs, 'night');
      for (let n = 0; n < 5; n++) {
        if (shouldDream(gs, 'night') !== first) return 'day ' + day + ' re-rolled on a repeat ask';
      }
    }
    return true;
  })()`));

await check('a higher dial dreams strictly more often, and naps strictly less than nights',
  api(`(() => {
    const gs = bench('roll-rate');
    const count = (dial, kind) => {
      settingsCache.dreamFrequency = dial;
      let n = 0;
      for (let day = 1; day <= 400; day++) { gs.meta.clock.day = day; if (shouldDream(gs, kind)) n++; }
      return n;
    };
    const rare = count('rare', 'night'), sometimes = count('sometimes', 'night'), often = count('often', 'night');
    if (!(rare < sometimes && sometimes < often)) return 'the dial does not order: ' + [rare, sometimes, often].join('/');
    // D16 through D24: napChanceMult multiplies whatever chance is in force.
    const nightOften = often, napOften = count('often', 'nap');
    if (!(napOften < nightOften)) return 'naps dream as often as nights (' + napOften + ' vs ' + nightOften + ')';
    return true;
  })()`));

await check('lastDreamDay caps it at one dream a day, across BOTH kinds',
  api(`(() => {
    const gs = bench('roll-cap');
    settingsCache.dreamFrequency = 'often';
    // Find a day this save would dream on at all, then close it.
    let day = 0;
    for (let d = 1; d <= 200; d++) { gs.meta.clock.day = d; if (shouldDream(gs, 'night')) { day = d; break; } }
    if (!day) return 'no day in 200 rolled a dream at the highest setting';
    gs.world.dreams.lastDreamDay = day;
    if (shouldDream(gs, 'night')) return 'a second night dream rolled on a day that already had one';
    if (shouldDream(gs, 'nap')) return 'a nap dreamt on a day that already had a dream';
    gs.world.dreams.lastDreamDay = day - 1;
    if (!shouldDream(gs, 'night')) return 'yesterday\\'s dream blocked today\\'s';
    return true;
  })()`));

console.log('\n3. the slot, and the prune (D36 / D39)');

await check('consumption matches on forSleep, never on queue[0]',
  api(`(() => {
    const gs = bench('slot-1');
    // Night first, as nextDreamSlot fills them — so a nap that read queue[0]
    // would show the night dream, three panels and all.
    const night = queueDream(gs, 1, 'night');
    const nap = queueDream(gs, 2, 'nap');
    const gotNap = pickQueuedDream(gs, 'nap');
    if (!gotNap || gotNap.id !== nap.id) return 'the nap slot returned the wrong record';
    const gotNight = pickQueuedDream(gs, 'night');
    if (!gotNight || gotNight.id !== night.id) return 'the night slot returned the wrong record';
    if (gs.world.dreams.queue.length !== 2) return 'picking a dream removed it from the queue before it was shown';
    return true;
  })()`));

await check('an empty queue is null, and never an error',
  api(`(() => {
    const gs = bench('slot-2');
    if (pickQueuedDream(gs, 'night') !== null) return 'an empty queue produced a dream';
    delete gs.world.dreams;
    if (pickQueuedDream(gs, 'night') !== null) return 'a save with no dream subtree threw or produced a dream';
    return true;
  })()`));

await check('a record that no longer validates is DROPPED, both kinds, not left holding its slot',
  api(`(() => {
    const gs = bench('slot-3');
    const night = queueDream(gs, 1, 'night');
    const nap = queueDream(gs, 2, 'nap');
    // The D22 case: the night dream's cast moved out.
    for (const member of night.cast) gs.npcs[member.npcId].residency.status = 'former';
    if (night.cast.length === 0) return 'fixture: the night dream cast nobody, so this proves nothing';
    // The D39(c) case: the nap dream never got its prose.
    nap.status = 'compiled';
    const got = pickQueuedDream(gs, 'night');
    if (got) return 'a dream about somebody who moved out was still offered';
    if (gs.world.dreams.queue.length !== 0) return 'the invalid records stayed in the queue and hold their slots forever';
    if (nextDreamSlot(gs) !== 'night') return 'the pruned queue does not report its free slot to the background pass';
    return true;
  })()`));

console.log('\n4. the wake tint — the only sim write there is (D12)');

await check('the tint is the register table own numbers, through applyEffects, as real applied rows',
  api(`(() => {
    const gs = bench('tint-1');
    const i = indexWithTint(gs);
    if (!i) return 'fixture: no index in 200 produced a register with a tint';
    const d = readyDream(gs, i);
    const reg = DREAM_REGISTERS[d.slots.register];
    const applied = applyDreamWake(gs, d);
    if (!Array.isArray(applied) || applied.length === 0) return 'the tint applied nothing';
    for (const eff of applied) {
      if (eff.type !== 'ADJUST_NEED') return 'the tint applied a ' + eff.type + ', which is not a need';
      if (eff.params.who !== 'player') return 'the tint reached somebody other than the player';
      if (!eff.params || eff.params.delta === undefined) return 'an applied row carries no delta — it did not come from applyEffects';
    }
    const mood = applied.find(e => e.params.need === 'mood');
    const energy = applied.find(e => e.params.need === 'energy');
    if (!!reg.moodDelta !== !!mood) return 'the mood row and the register disagree about whether there is one';
    if (mood && Number(mood.params.delta) !== reg.moodDelta) return 'the mood delta is not the register\\'s (' + mood.params.delta + ' vs ' + reg.moodDelta + ')';
    if (!!reg.energyDelta !== !!energy) return 'the energy row and the register disagree about whether there is one';
    if (energy && Number(energy.params.delta) !== reg.energyDelta) return 'the energy delta is not the register\\'s';
    return true;
  })()`));

await check('the tint lands on the player as a mood IMPULSE and an energy move, not a raw bar write',
  api(`(() => {
    const gs = bench('tint-2');
    const i = indexWithTint(gs);
    const d = readyDream(gs, i);
    const reg = DREAM_REGISTERS[d.slots.register];
    const beforeEnergy = gs.player.energy;
    const beforeEvents = (gs.player.moodEvents || []).length;
    applyDreamWake(gs, d);
    if (reg.moodDelta && (gs.player.moodEvents || []).length !== beforeEvents + 1) {
      return 'the mood tint did not arrive as a decaying impulse (effects.js owns that translation)';
    }
    if (reg.energyDelta && gs.player.energy === beforeEnergy) return 'the energy tint moved nothing';
    if (!reg.energyDelta && gs.player.energy !== beforeEnergy) return 'a register with no energy delta still moved energy';
    return true;
  })()`));

await check('a dream with no tint applies nothing at all — no empty effect, no zero row',
  api(`(() => {
    const gs = bench('tint-3');
    const d = readyDream(gs, 1);
    d.wake = { moodDelta: 0, energyDelta: 0, band: 'warm' };
    const before = gs.player.energy;
    const applied = applyDreamWake(gs, d);
    if (applied.length !== 0) return 'a zero tint still applied ' + applied.length + ' effect(s)';
    if (gs.player.energy !== before) return 'a zero tint moved energy';
    return true;
  })()`));

await check('the tint and the filing touch NOTHING else in the save (invariant 2)',
  api(`(() => {
    const gs = bench('tint-4');
    const i = indexWithTint(gs);
    const d = queueDream(gs, i, 'night');
    const before = saveSnapshot(gs);
    applyDreamWake(gs, d);
    fileDreamToDiary(gs, d);
    if (saveSnapshot(gs) !== before) return 'a shown dream mutated the save outside world.dreams and the two tint fields';
    if (gs.world.dreams.diary.length !== 1) return 'the dream was not actually filed, so this proves nothing';
    return true;
  })()`));

console.log('\n5. the filing (D9 / D10 / D14)');

await check('filing moves the record out of the queue and into the diary, newest first, marked shown',
  api(`(() => {
    const gs = bench('file-1');
    gs.meta.clock.day = 9;
    const a = queueDream(gs, 1, 'night');
    const b = queueDream(gs, 2, 'nap');
    fileDreamToDiary(gs, a);
    const st = gs.world.dreams;
    if (st.queue.length !== 1 || st.queue[0].id !== b.id) return 'filing did not take the right record out of the queue';
    if (st.diary.length !== 1 || st.diary[0].id !== a.id) return 'the dream did not reach the diary';
    if (st.diary[0].status !== 'shown') return 'a filed dream is not marked shown';
    if (st.diary[0].shownDay !== 9) return 'the filed record does not carry the day it was shown';
    if (st.lastDreamDay !== 9) return 'lastDreamDay was not stamped, so the day gate would let a second dream through';
    fileDreamToDiary(gs, b);
    if (st.diary[0].id !== b.id) return 'the diary is not newest-first';
    return true;
  })()`));

await check('the WHOLE record is filed — Phase 8 repaints from it and Phase 9 recurs from it',
  api(`(() => {
    const gs = bench('file-2');
    const d = queueDream(gs, 3, 'night');
    const panels = JSON.stringify(d.panels);
    const slots = JSON.stringify(d.slots);
    fileDreamToDiary(gs, d);
    const filed = gs.world.dreams.diary[0];
    // D14: prompt and seed per panel, never a blob (that is what makes a diary
    // entry repaintable after the LRU has evicted its pixels).
    if (JSON.stringify(filed.panels) !== panels) return 'the filed panels are not the record\\'s';
    for (const p of filed.panels) {
      if (!p.prompt || p.seed === undefined) return 'a filed panel lost its frozen prompt or seed';
      if (p.url || p.blob) return 'a filed panel stored PIXELS — D14 forbids exactly this';
    }
    // D11: recurrence needs the compiled slots, the cast and the motif.
    if (JSON.stringify(filed.slots) !== slots) return 'the filed record lost its slots, and with them Phase 9';
    if (!filed.motif || !('cast' in filed)) return 'the filed record lost its motif or its cast';
    return true;
  })()`));

await check('the diary caps at diaryCap and drops the OLDEST, never the newest',
  api(`(() => {
    const gs = bench('file-3');
    const cap = DREAM_TUNING.diaryCap;
    let first = null, last = null;
    for (let i = 1; i <= cap + 5; i++) {
      gs.meta.clock.day = i;
      const d = queueDream(gs, i, 'night');
      if (i === 1) first = d.id;
      last = d.id;
      fileDreamToDiary(gs, d);
    }
    const diary = gs.world.dreams.diary;
    if (diary.length !== cap) return 'the diary holds ' + diary.length + ', cap is ' + cap;
    if (diary[0].id !== last) return 'the newest entry is not at the front';
    if (diary.some(e => e.id === first)) return 'the cap dropped a newer entry and kept the oldest';
    return true;
  })()`));

await check('the motif goes into the carryover pool in the shape the compiler reads back (D10)',
  api(`(() => {
    const gs = bench('file-4');
    gs.meta.clock.day = 4;
    const d = queueDream(gs, 1, 'night');
    fileDreamToDiary(gs, d);
    const h = gs.world.dreams.motifHistory[0];
    if (!h) return 'nothing was recorded in the motif history';
    // selectDreamMotif filters on motifId && text and reads dreamId — a record
    // missing any of the three is a record that can never be carried.
    if (h.motifId !== d.motif.motifId) return 'the wrong motif id was recorded';
    if (!h.text) return 'the recorded motif carries no text, so selectDreamMotif would filter it out';
    if (h.dreamId !== d.id) return 'the motif does not name the dream it came from';
    if (h.day !== 4) return 'the motif carries no day';
    while (gs.world.dreams.motifHistory.length < DREAM_TUNING.motifHistoryCap + 4) {
      gs.world.dreams.motifHistory.push({ motifId: 'filler', text: 'x', dreamId: 'x', day: 1 });
    }
    const d2 = queueDream(gs, 2, 'night');
    fileDreamToDiary(gs, d2);
    if (gs.world.dreams.motifHistory.length !== DREAM_TUNING.motifHistoryCap) return 'the motif history is over its cap';
    if (gs.world.dreams.motifHistory[0].dreamId !== d2.id) return 'the motif cap dropped the newest instead of the oldest';
    return true;
  })()`));

await check('a shown dream hands its sources to the dedupe ring, deduped and capped (D9)',
  api(`(() => {
    const gs = bench('file-5');
    const d = queueDream(gs, 1, 'night');
    d.source = { eventIds: ['evt:aaa', 'evt:bbb', 'evt:aaa'], episodeKeys: [] };
    fileDreamToDiary(gs, d);
    const ring = gs.world.dreams.consumedEventIds;
    if (ring.length !== 2) return 'the ring took ' + ring.length + ' ids for two distinct sources';
    const d2 = queueDream(gs, 2, 'night');
    d2.source = { eventIds: ['evt:aaa'], episodeKeys: [] };
    fileDreamToDiary(gs, d2);
    if (gs.world.dreams.consumedEventIds.length !== 2) return 'an id already in the ring was added twice';
    for (let i = 0; i < DREAM_TUNING.consumedEventCap + 5; i++) gs.world.dreams.consumedEventIds.push('evt:filler' + i);
    const d3 = queueDream(gs, 3, 'night');
    d3.source = { eventIds: ['evt:newest'], episodeKeys: [] };
    fileDreamToDiary(gs, d3);
    const r2 = gs.world.dreams.consumedEventIds;
    if (r2.length !== DREAM_TUNING.consumedEventCap) return 'the ring is over its cap at ' + r2.length;
    if (r2[r2.length - 1] !== 'evt:newest') return 'the ring dropped the newest id instead of the oldest';
    return true;
  })()`));

await check('the wake line is a pure function of the record — the same dream wakes the same way forever',
  api(`(() => {
    const gs = bench('file-6');
    const d = readyDream(gs, 5);
    const first = dreamWakeLine(d);
    if (!first) return 'a compiled dream produced no wake line';
    for (let n = 0; n < 20; n++) if (dreamWakeLine(d) !== first) return 'the wake line moved between reads';
    // A round trip through JSON is what the Dream Diary will actually hold.
    if (dreamWakeLine(JSON.parse(JSON.stringify(d))) !== first) return 'the wake line did not survive a save/load round trip';
    if (!DREAM_WAKE_LINES[d.wake.band].includes(first)) return 'the wake line did not come from the record\\'s own band';
    return true;
  })()`));

console.log('\n6. the sleep path itself: no generation, and nothing spent that was not seen');

await check('consuming a dream calls neither the model nor the image plugin (invariant 3)',
  api(`(async () => {
    const gs = bench('play-1');
    settingsCache.dreamFrequency = 'often';
    const d = queueDream(gs, 1, 'night');
    const p = stubPresent('tap');
    let played = null;
    const calls = await withNoGeneration(async () => {
      for (let day = 1; day <= 40 && !played; day++) {
        gs.meta.clock.day = day;
        gs.world.dreams.lastDreamDay = null;
        played = await playQueuedDream(gs, 'night');
      }
    });
    if (!played) return 'no day in 40 consumed the queued dream at the highest setting';
    if (calls.text !== 0) return 'the sleep path called the model ' + calls.text + ' time(s)';
    if (calls.image !== 0) return 'the sleep path generated ' + calls.image + ' image(s)';
    if (p.calls !== 1) return 'the window was opened ' + p.calls + ' times for one dream';
    if (played.dream.id !== d.id) return 'a different dream was shown';
    if (!played.line) return 'the played dream carried no wake line for the caller to log';
    return true;
  })()`));

await check('an empty queue is no dream, silently — no window, no throw, no state written',
  api(`(async () => {
    const gs = bench('play-2');
    settingsCache.dreamFrequency = 'often';
    const p = stubPresent('tap');
    const before = JSON.stringify(gs.world.dreams);
    const calls = await withNoGeneration(async () => {
      for (let day = 1; day <= 20; day++) {
        gs.meta.clock.day = day;
        if (await playQueuedDream(gs, 'night') !== null) throw new Error('an empty queue produced a dream');
      }
    });
    if (p.calls !== 0) return 'an empty queue still opened a window';
    if (calls.text || calls.image) return 'an empty queue generated something';
    if (JSON.stringify(gs.world.dreams) !== before) return 'an empty queue still wrote to world.dreams';
    return true;
  })()`));

await check('a dream the window could not show is NOT spent',
  api(`(async () => {
    const gs = bench('play-3');
    settingsCache.dreamFrequency = 'often';
    gs.meta.clock.day = 3;
    const d = queueDream(gs, 1, 'night');
    // The two ways presentDream resolves null: no DOM, and a window already up.
    stubPresent(null);
    const before = JSON.stringify(gs.world.dreams);
    const out = await playQueuedDream(gs, 'night');
    if (out !== null) return 'a dream nobody saw was reported as played';
    if (JSON.stringify(gs.world.dreams) !== before) return 'a dream nobody saw still moved world.dreams';
    if (gs.world.dreams.queue.length !== 1) return 'the unseen dream left the queue';
    if (gs.world.dreams.lastDreamDay !== null) return 'the unseen dream still closed the day';
    // ...and it is still there to be shown the next time.
    stubPresent('tap');
    const second = await playQueuedDream(gs, 'night');
    if (!second || second.dream.id !== d.id) return 'the unspent dream was not offered again';
    return true;
  })()`));

await check('a dream watched into a save that was replaced mid-window is dropped, not filed (D20)',
  api(`(async () => {
    const gs = bench('play-4');
    settingsCache.dreamFrequency = 'often';
    gs.meta.clock.day = 2;
    queueDream(gs, 1, 'night');
    // A DIFFERENT save loads while the player is tapping through panels. Only
    // the seed differs, so the live-state check is the only thing in the way.
    const other = JSON.parse(JSON.stringify(gs));
    other.meta.seed = gs.meta.seed + '-other';
    presentDream = async () => { currentGameState = other; return 'tap'; };
    const out = await playQueuedDream(gs, 'night');
    currentGameState = null;
    if (out !== null) return 'a dream was filed into a world that is no longer on screen';
    if (other.world.dreams.diary.length !== 0) return 'the other save received the dream';
    return true;
  })()`));

await check('the whole sleep path leaves the clock and every need but the tint exactly where it found them',
  api(`(async () => {
    const gs = bench('play-5');
    settingsCache.dreamFrequency = 'often';
    gs.meta.clock.day = 6;
    const i = indexWithTint(gs);
    const d = queueDream(gs, i, 'night');
    const reg = DREAM_REGISTERS[d.slots.register];
    stubPresent('tap');
    const before = saveSnapshot(gs);
    const clock = JSON.stringify(gs.meta.clock);
    const energy = gs.player.energy;
    const played = await playQueuedDream(gs, 'night');
    if (!played) return 'the dream did not play, so this proves nothing';
    if (JSON.stringify(gs.meta.clock) !== clock) return 'watching a dream moved the clock';
    if (saveSnapshot(gs) !== before) return 'watching a dream moved something it is not allowed to move';
    if (gs.player.energy !== energy + (reg.energyDelta || 0)) return 'energy moved by something other than the register\\'s own delta';
    return true;
  })()`));

console.log('\n7. the window contract (D3 / D13 / D15)');

await check('presentDream refuses without a DOM rather than pretending it showed something',
  api(`(async () => {
    const gs = bench('win-1');
    const d = readyDream(gs, 1);
    // The real one, not the stub — this is the guard dreams.js relies on to
    // decide a dream was not shown.
    if (await presentDream(gs, d) !== null) return 'presentDream resolved a reason with no document';
    if (await presentDream(gs, null) !== null) return 'presentDream accepted a null dream';
    if (await presentDream(gs, { panels: [] }) !== null) return 'presentDream accepted a dream with no panels';
    return true;
  })()`));

await check('a tap ADVANCES while panels remain and CLOSES only on the last (D15: one session)',
  api(`(async () => {
    const gs = bench('win-2');
    // A three-panel dream, so there are two advances before the close.
    let d = null;
    for (let i = 1; i < 200 && !d; i++) {
      const c = readyDream(gs, i, 'night');
      if (c.panels.length === 3) d = c;
    }
    if (!d) return 'fixture: no index in 200 produced a three-panel dream';
    let resolved = 'not yet';
    actionWindowSession = {
      spec: { body: 'dream', dream: d, tier: 'C', heading: 'A dream' },
      resolve: (r) => { resolved = r; },
      wasRunning: false, panelIndex: 0, dreamPanels: [], generating: false,
      onClick: null, onKey: null,
    };
    dismissActionWindow('tap');
    if (!actionWindowSession) return 'the first tap closed the window instead of turning the panel';
    if (actionWindowSession.panelIndex !== 1) return 'the first tap did not advance the cursor';
    if (resolved !== 'not yet') return 'the first tap resolved the promise';
    dismissActionWindow('tap');
    if (!actionWindowSession || actionWindowSession.panelIndex !== 2) return 'the second tap did not advance to the last panel';
    dismissActionWindow('tap');
    if (actionWindowSession) return 'the last tap did not close the window';
    if (resolved !== 'tap') return 'the last tap resolved with ' + resolved;
    return true;
  })()`));

await check('Escape skips the rest of the dream rather than turning a panel',
  api(`(() => {
    const gs = bench('win-3');
    let d = null;
    for (let i = 1; i < 200 && !d; i++) {
      const c = readyDream(gs, i, 'night');
      if (c.panels.length >= 2) d = c;
    }
    let resolved = null;
    actionWindowSession = {
      spec: { body: 'dream', dream: d },
      resolve: (r) => { resolved = r; },
      wasRunning: false, panelIndex: 0, dreamPanels: [], generating: false,
      onClick: null, onKey: null,
    };
    dismissActionWindow('escape');
    if (actionWindowSession) return 'Escape advanced a panel instead of leaving the dream';
    if (resolved !== 'escape') return 'Escape resolved with ' + resolved;
    return true;
  })()`));

await check('the advance rule reaches dreams and nothing else',
  api(`(() => {
    const gs = bench('win-4');
    const d = readyDream(gs, 1);
    const s = (body, idx) => ({ spec: { body, dream: d }, panelIndex: idx || 0 });
    // An outcome window carrying a dream field (there is no such thing, but the
    // guard must key on the BODY) must still close on the first tap, or every
    // window in the game becomes un-closable the day somebody adds a field.
    if (actionWindowAdvancesDream(s('', 0), 'tap') !== false) return 'a non-dream body advanced';
    if (actionWindowAdvancesDream(s('picker', 0), 'tap') !== false) return 'the picker advanced';
    if (actionWindowAdvancesDream(null, 'tap') !== false) return 'a null session advanced';
    const last = d.panels.length - 1;
    if (actionWindowAdvancesDream(s('dream', last), 'tap') !== false) return 'the last panel advanced instead of closing';
    if (d.panels.length > 1 && actionWindowAdvancesDream(s('dream', 0), 'tap') !== true) return 'the first panel of a multi-panel dream did not advance';
    return true;
  })()`));

await check('the dream body shows no delta strip and no choices (D13), and hides its dots for everything else',
  (() => {
    // Asserted against the SOURCE: the renderer needs a DOM, and what is being
    // asserted is that a branch does NOT paint two specific things — which is
    // exactly the kind of omission a behavioural test cannot see.
    const src = fs.readFileSync(path.join(SRC, 'actionwindow.js'), 'utf8');
    const start = src.indexOf("if (spec.body === 'dream') {");
    if (start < 0) return 'renderActionWindow has no dream body branch';
    const end = src.indexOf('\n  }', src.indexOf('return;', start));
    const branch = src.slice(start, end);
    if (!/awHide\('aw-deltas'\)/.test(branch)) return 'the dream branch does not hide the delta strip (D13)';
    if (!/awHide\('aw-choices'\)/.test(branch)) return 'the dream branch does not hide the choice row — a dream is watched, not played (D3)';
    if (/aw-deltas'\)\.appendChild|actionWindowChip/.test(branch)) return 'the dream branch paints a chip';
    // The dots are hidden in the SHARED path, above the picker's early return,
    // or a picker opened after a dream inherits them.
    const shared = src.slice(src.indexOf('function renderActionWindow'), start);
    if (!/awHide\('aw-dream-dots'\)/.test(shared)) return 'the dots are not hidden before the first early return';
    return true;
  })());

await check('index.html carries the dots element the branch paints into',
  (() => {
    const html = fs.readFileSync(path.join(SRC, '..', '..', 'index.html'), 'utf8');
    if (!/id="aw-dream-dots"/.test(html)) return 'index.html has no #aw-dream-dots';
    if (!/\.aw-dream-dot\b/.test(html)) return 'index.html has no styling for the dots';
    if (!/aw-overlay\[data-body="dream"\]/.test(html)) return 'index.html has no dream-body styling';
    return true;
  })());

console.log('\n8. the hooks, and the round trip');

await check('doSleep presents the dream AFTER its own save and BEFORE the background top-up',
  (() => {
    // ui.js is not in the vm's load order, so the two hook sites are
    // unreachable behaviourally. Order is the whole assertion: presenting
    // before the save would make dismissing a commit rather than a close, and
    // topping up before consuming would find the slot still full.
    const src = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
    const sleep = src.indexOf('async function doSleep()');
    if (sleep < 0) return 'ui.js has no doSleep';
    const body = src.slice(sleep, src.indexOf('\n}', sleep));
    const save = body.indexOf("saveAtBoundary('sleep'");
    const present = body.indexOf("presentDreamForSleep('night')");
    const topUp = body.indexOf('topUpDreamQueue(');
    if (present < 0) return 'doSleep never presents a dream';
    if (!(save < present)) return 'doSleep presents the dream before saving the night';
    if (!(present < topUp)) return 'doSleep tops the queue up before consuming from it';
    if (!/await presentDreamForSleep/.test(body)) return 'doSleep does not await the dream, so the morning would render behind it';
    return true;
  })());

await check('the nap fills its hook through onDismiss, and never through an outcome-window image (D41)',
  (() => {
    const src = fs.readFileSync(path.join(SRC, 'defs.actions.js'), 'utf8');
    const nap = src.indexOf("'self.nap': {");
    if (nap < 0) return 'defs.actions.js has no self.nap';
    const def = src.slice(nap, src.indexOf('\n  },', nap));
    if (!/onDismiss:\s*napWindowDismiss/.test(def)) return 'self.nap does not run the dream hook on dismissal';
    // getActionWindowImage composes its OWN prompt under its own key, so a
    // dream panel routed through `image.phrase` would be a NEW generation on
    // the nap click (invariant 3) drawn from a prompt the record never carried.
    if (/\bimage:\s*\{/.test(def)) return 'self.nap declares an outcome-window image — D41 says a dream panel cannot be one';
    const fn = src.slice(src.indexOf('async function napWindowDismiss'), src.indexOf('async function napWindowDismiss') + 400);
    if (!/presentDreamForSleep\('nap'\)/.test(fn)) return 'napWindowDismiss does not ask for a NAP dream';
    return true;
  })());

await check('a filed diary survives a real save/load round trip with its panels intact',
  api(`(async () => {
    root.kv = makeMemKv();
    currentGameState = null;
    actionWindowSession = null;
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p7', clock: { day: 1, minutes: 0 } });
    const h = house('rt-p7', 3);
    h.meta.clock.day = 7;
    const shown = queueDream(h, 1, 'night');
    const kept = queueDream(h, 2, 'nap');
    stubPresent('tap');
    settingsCache.dreamFrequency = 'often';
    h.world.dreams.lastDreamDay = null;
    // Force the roll: this assertion is about persistence, not probability.
    const realShould = shouldDream;
    shouldDream = () => true;
    const played = await playQueuedDream(h, 'night');
    shouldDream = realShould;
    if (!played) return 'the dream did not play';
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const st = loaded.world.dreams;
    if (st.diary.length !== 1) return 'the diary came back with ' + st.diary.length + ' entries';
    if (st.diary[0].id !== shown.id) return 'the diary came back with a different dream';
    if (JSON.stringify(st.diary[0].panels) !== JSON.stringify(shown.panels)) return 'the panels did not survive the round trip';
    if (st.queue.length !== 1 || st.queue[0].id !== kept.id) return 'the untouched nap dream did not survive';
    if (st.lastDreamDay !== 7) return 'lastDreamDay did not survive, so the day gate resets on every reload';
    if (st.motifHistory.length !== 1) return 'the motif history did not survive';
    // ...and the reloaded record still knows how it woke the player.
    if (dreamWakeLine(st.diary[0]) !== played.line) return 'the reloaded record produces a different wake line';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
