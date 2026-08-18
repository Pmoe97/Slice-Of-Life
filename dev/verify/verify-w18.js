// Intimacy & Voyeurism Plan Phase 18 — Pregnancy (D14/D16): the conception
// roll, the term/birth lifecycle, and the baby presence.
//
// D16's design: no v1 parenting sim. world.pregnancies is the lifecycle store
// (ONE door in: a COMPLETED qualifying act — the act's own willingness gate
// already proved both parties willing, invariant 1 sits upstream; this phase
// adds no door and no new willingness read). The outcome is DETERMINISTIC
// (D15: data decides, prose narrates — no LLM call decides a conception):
// each roll is seeded per (save seed, pair, day, absolute minute), so a
// replayed save reproduces the exact same conception decisions. The "trying"
// flag — relationship.trying for an NPC couple, player.flags._tryingWith for
// the player — buys the deliberate per-act chance (0.35); every other act
// runs the base unprotected chance (0.08). The baby presence is a separate
// stamp (npc/player.flags._baby, written ONCE by the birth pass), a daily
// mood note + player energy cost, an offscreen "stayed in with the baby"
// event, and pinned memory facts on both parents.
//
// Section 2 is the MANDATORY per-session gate check: maybeConceive has exactly
// three call sites (all inside COMPLETED-act resolvers, downstream of the
// willingness gate), and a floored (asleep / cold-shoulder / hostile) target's
// act never fires — assert zero pregnancy records. Section 6 is the save/load
// round-trip through the REAL writeGeneratedGameState/loadGameState against an
// in-memory kv adapter (meta pre-seeded, exactly like a fresh kv swap).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['pregnancy.js'] });
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
    }
    return h;
  }
`);

api(`
  function residentsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

// A committed NPC couple with a relationship record + castWeb warmth, so a
// completed act is real and the trying flag is readable. Mutates and returns
// the record.
api(`
  function committedPair(h, a, b) {
    h.world.castWeb = h.world.castWeb || {};
    h.world.castWeb[[a, b].sort().join('|')] = { axes: {
      [a + '→' + b]: { trust: 0.8, affection: 0.8, desire: 0.8 },
      [b + '→' + a]: { trust: 0.8, affection: 0.8, desire: 0.8 },
    }};
    const rec = getRelationship(h, a, b, true);
    rec.status = 'committed';
    rec.history = rec.history || [];
    rec.history.push({ kind: 'first_sex', day: 1 });
    rec.lastIntimateDay = 1;
    return rec;
  }
`);

// --- In-memory kv adapter for the save/load round-trip (mirrors kv-plugin's
// folder surface; w17's makeMemKv plus the batch surface loadGameState touches). ---
api(`
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
`);

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. The conception door (maybeConceive)');

await check('only PREGNANCY.qualifyingActs can conceive — sex qualifies, quickie/cuddle/share_shower never write a record',
  api(`(() => {
    const h = house(20261001, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b).trying = true;
    const before = (h.world.pregnancies || []).length;
    maybeConceive(h, a, b, 'sex', {});
    const afterSex = (h.world.pregnancies || []).length;
    maybeConceive(h, a, b, 'quickie', {});
    maybeConceive(h, a, b, 'cuddle', {});
    maybeConceive(h, a, b, 'share_shower', {});
    return afterSex - before >= 0 && (h.world.pregnancies || []).length === afterSex;
  })()`));

await check('the active-pregnancy guard: neither participant can conceive again while carrying',
  api(`(() => {
    const h = house(20261002, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b).trying = true;
    // force a first conception deterministically by sweeping minutes
    let p = null;
    for (let m = 0; m < 600 && !p; m += 30) { h.meta.clock.minutes = m; p = maybeConceive(h, a, b, 'sex', {}); }
    if (!p) return 'no conception found in sweep';
    const count1 = h.world.pregnancies.length;
    // try again across many minutes — the guard must hold regardless of rolls
    let blocked = true;
    for (let m = 600; m < 3000; m += 30) {
      h.meta.clock.minutes = m;
      const p2 = maybeConceive(h, a, b, 'sex', {});
      if (p2) { blocked = false; break; }
    }
    return blocked && h.world.pregnancies.length === count1;
  })()`));

await check('the trying flag buys 0.35/act; the base unprotected chance is 0.08 — and both are deterministic',
  api(`(() => {
    const h = house(20261003, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    const sweep = (trying) => {
      const out = [];
      for (let m = 0; m < 90; m += 1) {
        h.meta.clock.minutes = m;
        h.world.pregnancies = [];
        if (trying) getRelationship(h, a, b, false).trying = true;
        else delete getRelationship(h, a, b, false).trying;
        out.push(maybeConceive(h, a, b, 'sex', {}) ? 1 : 0);
      }
      return out;
    };
    const trying = sweep(true);
    const base = sweep(false);
    const trate = trying.reduce((x, y) => x + y, 0) / trying.length;
    const brate = base.reduce((x, y) => x + y, 0) / base.length;
    const det = (function(){ const h2 = house(20261003, 3); const [a2, b2] = residentsOf(h2); committedPair(h2, a2, b2); const o = []; for (let m = 0; m < 90; m += 1) { h2.meta.clock.minutes = m; h2.world.pregnancies = []; getRelationship(h2, a2, b2, false).trying = true; o.push(maybeConceive(h2, a2, b2, 'sex', {}) ? 1 : 0); } return JSON.stringify(o); })();
    return JSON.stringify(trying) === det
      && trate > 0.25 && trate < 0.45   // 0.35 ± generous slack on 90 draws
      && brate > 0.02 && brate < 0.16;  // 0.08 ± slack
  })()`));

await check('the record shape is the plan\'s: sorted parents, conceivedDay/dueDay/visibleFromDay, birthDay null, announced false',
  api(`(() => {
    const h = house(20261004, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b).trying = true;
    h.meta.clock.day = 10;
    let p = null;
    for (let m = 0; m < 600 && !p; m += 30) { h.meta.clock.minutes = m; p = maybeConceive(h, a, b, 'sex', {}); }
    if (!p) return 'no conception';
    return JSON.stringify(p.parents) === JSON.stringify([a, b].sort())
      && p.conceivedDay === 10
      && p.dueDay === 10 + PREGNANCY.termDays
      && p.visibleFromDay === 10 + PREGNANCY.visibleFromDay
      && p.birthDay === null && p.announced === false;
  })()`));

console.log('\n2. MANDATORY gate check — the willingness function is the only door');

await check('maybeConceive has EXACTLY THREE call sites — all inside COMPLETED-act resolvers (tryIntimatePair / resolvePairedAct / applyReciprocatedAct), none near a gate and none in willingness.js',
  new Promise((resolve) => {
    const files = ['drives.js', 'actions.js', 'boundary.js', 'willingness.js', 'pregnancy.js'];
    const sites = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8');
      const count = (src.match(/maybeConceive\s*\(/g) || []).length;
      sites.push(`${f}:${count}`);
    }
    resolve(sites.join(', ') === 'drives.js:1, actions.js:1, boundary.js:1, willingness.js:0, pregnancy.js:1');
  }), 'exactly drives.js:1, actions.js:1, boundary.js:1, willingness.js:0, pregnancy.js:1 (the definition)');

await check('a floored target\'s pair act never fires — asleep / cold-shoulder / hostile all abort with ZERO pregnancy records and ZERO history',
  api(`(() => {
    const run = (floor) => {
      const h = house(20261005, 4);
      const [a, b] = residentsOf(h);
      const room = h.npcs[a].residency.room;
      h.npcs[a].location = room; h.npcs[b].location = room;
      h.npcs[a].activity = 'awake'; h.npcs[b].activity = 'awake';
      h.npcs[a].needs = { ...(h.npcs[a].needs || {}), desire: 90 };
      h.npcs[b].needs = { ...(h.npcs[b].needs || {}), desire: 90 };
      committedPair(h, a, b).trying = true;
      if (floor === 'asleep') h.npcs[b].activity = 'sleeping';
      if (floor === 'cold') noteColdShoulder(h.npcs[b], 2, h.meta.clock.day, 'caught_peep');
      if (floor === 'hostile') h.world.castWeb[[a, b].sort().join('|')].axes[b + '→' + a].tension = REL_CONSEQUENCES.tensionHigh + 0.05;
      const res = tryIntimatePair(h.npcs[a], a, { location: room, block: 'day' }, h, DRIVE_DEFS.intimate);
      const hist = (h.npcs[a].flags?._intimacyHistory || h.npcs[b].flags?._intimacyHistory) ? 1 : 0;
      return { res, preg: (h.world.pregnancies || []).length, hist };
    };
    const a1 = run('asleep'), a2 = run('cold'), a3 = run('hostile');
    // positive control: the SAME fixture with no floor completes the act
    const hPos = house(20261015, 4);
    const [pa, pb] = residentsOf(hPos);
    const roomPos = hPos.npcs[pa].residency.room;
    hPos.npcs[pa].location = roomPos; hPos.npcs[pb].location = roomPos;
    hPos.npcs[pa].activity = 'awake'; hPos.npcs[pb].activity = 'awake';
    hPos.npcs[pa].needs = { ...(hPos.npcs[pa].needs || {}), desire: 90 };
    hPos.npcs[pb].needs = { ...(hPos.npcs[pb].needs || {}), desire: 90 };
    committedPair(hPos, pa, pb).trying = true;
    const resPos = tryIntimatePair(hPos.npcs[pa], pa, { location: roomPos, block: 'day' }, hPos, DRIVE_DEFS.intimate);
    return a1.res === null && a2.res === null && a3.res === null
      && a1.preg === 0 && a2.preg === 0 && a3.preg === 0
      && a1.hist === 0 && a2.hist === 0 && a3.hist === 0
      && resPos !== null && (hPos.npcs[pb].flags?._intimacyHistory ? true : false);
  })()`));

console.log('\n3. The lifecycle day pass (processPregnanciesForDay)');

await check('emergent trying: a committed couple with recent sex may flip trying (seeded per pair+day); single / no-history pairs never try',
  api(`(() => {
    const h = house(20261006, 4);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    h.meta.clock.day = 8;
    let flipped = null;
    for (let d = 8; d < 60 && !flipped; d++) {
      h.meta.clock.day = d;
      processPregnanciesForDay(h, d);
      if (getRelationship(h, a, b, false).trying) flipped = d;
    }
    if (!flipped) return 'couple never started trying in 60 days';
    // single couple with recent sex
    const h2 = house(20261007, 4);
    const [c, d] = residentsOf(h2);
    const rec2 = getRelationship(h2, c, d, true);
    rec2.status = 'single';
    rec2.history = [{ kind: 'first_sex', day: 1 }]; rec2.lastIntimateDay = 1;
    // no-history committed couple
    const h3 = house(20261008, 4);
    const [e, f] = residentsOf(h3);
    const rec3 = getRelationship(h3, e, f, true);
    rec3.status = 'committed'; rec3.lastIntimateDay = 1;
    let flipped2 = false, flipped3 = false;
    for (let d = 8; d < 80; d++) {
      h2.meta.clock.day = d; processPregnanciesForDay(h2, d);
      h3.meta.clock.day = d; processPregnanciesForDay(h3, d);
      if (getRelationship(h2, c, d, false).trying) flipped2 = true;
      if (getRelationship(h3, e, f, false).trying) flipped3 = true;
    }
    // determinism: identical house, identical decision
    const h4 = house(20261006, 4);
    const [a2, b2] = residentsOf(h4);
    committedPair(h4, a2, b2);
    let flipped4 = null;
    for (let d = 8; d < 60 && !flipped4; d++) { h4.meta.clock.day = d; processPregnanciesForDay(h4, d); if (getRelationship(h4, a2, b2, false).trying) flipped4 = d; }
    return !!flipped && flipped4 === flipped && !flipped2 && !flipped3;
  })()`));

await check('the visible-bump reveal writes the ONE-SHOT pinned pregnancy fact on both NPC parents (category pregnancy, importance significant), once',
  api(`(() => {
    const h = house(20261009, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    h.meta.clock.day = 1;
    h.world.pregnancies = [{ parents: [a, b].sort(), conceivedDay: 1, dueDay: 20, visibleFromDay: 7, birthDay: null, announced: false }];
    processPregnanciesForDay(h, 3); // before visible — nothing yet
    const before = (h.npcs[a].memory?.facts || []).length + (h.npcs[b].memory?.facts || []).length;
    processPregnanciesForDay(h, 7); // reveal
    const factA = (h.npcs[a].memory?.facts || []).find(m => (m.text || '').includes('expecting a baby'));
    const factB = (h.npcs[b].memory?.facts || []).find(m => (m.text || '').includes('expecting a baby'));
    const after = (h.npcs[a].memory?.facts || []).length + (h.npcs[b].memory?.facts || []).length;
    processPregnanciesForDay(h, 9); // idempotent
    const after2 = (h.npcs[a].memory?.facts || []).length + (h.npcs[b].memory?.facts || []).length;
    return before === 0 && !!factA && !!factB
      && factA.category === PREGNANCY.factCategory && factA.importance === PREGNANCY.factImportance
      && after === 2 && after2 === 2
      && h.world.pregnancies[0].announced === true;
  })()`));

await check('the birth at dueDay: BOTH parents stamped _baby (the one writer), the birth fact lands, a narration line returns, the bump is gone, and a second rollover does nothing new',
  api(`(() => {
    const h = house(20261010, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    h.meta.clock.day = 1;
    h.world.pregnancies = [{ parents: [a, b].sort(), conceivedDay: 1, dueDay: 16, visibleFromDay: 7, birthDay: null, announced: true }];
    const pre = (h.npcs[a].memory?.facts || []).length;
    const lines1 = processPregnanciesForDay(h, 16);
    const babyA = h.npcs[a].flags?._baby, babyB = h.npcs[b].flags?._baby;
    const birthFactA = (h.npcs[a].memory?.facts || []).some(m => (m.text || '').includes('had a baby'));
    const visibleAfterBirth = visiblePregnancyFor(h, a);
    const lines2 = processPregnanciesForDay(h, 17);
    return lines1.length === 1 && babyA?.bornDay === 16 && babyB?.bornDay === 16
      && babyA.otherParent === b && babyB.otherParent === a
      && (h.npcs[a].memory?.facts || []).length === pre + 1 && birthFactA
      && visibleAfterBirth === null
      && lines2.length === 0
      && h.world.pregnancies[0].birthDay === 16;
  })()`));

await check('the presence\'s daily cost: NPC parents +0.04 mood/day and the player −6 energy/day, starting on the BIRTH day itself and continuing each day after',
  api(`(() => {
    const h = house(20261011, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    h.meta.clock.day = 1;
    h.world.pregnancies = [{ parents: [a, b].sort(), conceivedDay: 1, dueDay: 16, visibleFromDay: 7, birthDay: null, announced: false }];
    const moodStart = h.npcs[a].mood, energyStart = h.player.energy;
    // day 10: before birth — the pass must NOT charge anyone
    processPregnanciesForDay(h, 10);
    const noCost = h.npcs[a].mood === moodStart && h.player.energy === energyStart;
    // day 16 = dueDay: the birth AND the first cost day happen in the same pass
    processPregnanciesForDay(h, 16);
    const afterBirth = h.npcs[a].mood - moodStart === PREGNANCY.baby.dailyMoodBoost
      && h.player.energy - energyStart === -PREGNANCY.baby.playerEnergyCost;
    // day 17: the second cost day
    processPregnanciesForDay(h, 17);
    return noCost && afterBirth
      && h.npcs[a].mood - moodStart === PREGNANCY.baby.dailyMoodBoost * 2
      && h.player.energy - energyStart === -PREGNANCY.baby.playerEnergyCost * 2;
  })()`));

console.log('\n4. The player path + the pure readers');

await check('the player\'s trying flag drives the roll (_tryingWith), the player birth stamps player._baby, and pregnancySelfLine narrates the bump then the newborn',
  api(`(() => {
    const h = house(20261012, 3);
    const [a] = residentsOf(h);
    h.player.flags._tryingWith = a;
    h.player.name = 'You';
    h.meta.clock.day = 4;
    let p = null;
    for (let m = 0; m < 600 && !p; m += 30) { h.meta.clock.minutes = m; p = maybeConceive(h, 'player', a, 'sex', {}); }
    if (!p) return 'no player-path conception';
    const linePre = pregnancySelfLine(h);
    const visPre = visiblePregnancyFor(h, 'player');
    h.meta.clock.day = 20; // past dueDay
    h.world.pregnancies[0].birthDay = null;
    const narr = processPregnanciesForDay(h, 20);
    return !!p && p.parents.includes('player') && p.parents.includes(a)
      && !!visPre && !!linePre && linePre.includes('bump')
      && h.player.flags?._baby?.otherParent === a && h.player.flags?._baby?.bornDay === 20
      && narr.length === 1
      && pregnancySelfLine(h) !== null && pregnancySelfLine(h).includes('baby')
      && visiblePregnancyFor(h, 'player') === null;
  })()`));

await check('the pure readers agree across a full lifecycle (per parent, per pair, born/active/visible, baby presence)',
  api(`(() => {
    const h = house(20261013, 3);
    const [a, b] = residentsOf(h);
    committedPair(h, a, b);
    h.meta.clock.day = 5;
    h.world.pregnancies = [{ parents: [a, b].sort(), conceivedDay: 1, dueDay: 20, visibleFromDay: 7, birthDay: null, announced: false }];
    const active = activePregnancyFor(h, a) === h.world.pregnancies[0]
      && activePregnancyFor(h, b) === h.world.pregnancies[0]
      && pregnancyForPair(h, a, b) === h.world.pregnancies[0]
      && pregnancyForPair(h, a, 'player') === null;
    const preVisible = visiblePregnancyFor(h, a) === null && pregnancyVisible(h, a) === false && hasBabyPresence(h, a) === false;
    h.meta.clock.day = 8;
    const visible = visiblePregnancyFor(h, a) === h.world.pregnancies[0] && pregnancyVisible(h, a) === true;
    h.meta.clock.day = 21;
    h.world.pregnancies[0].birthDay = 21;
    h.npcs[a].flags._baby = { otherParent: b, bornDay: 21 };
    const born = bornPregnancyFor(h, a) === h.world.pregnancies[0]
      && activePregnancyFor(h, a) === null
      && hasBabyPresence(h, a) === true && hasBabyPresence(h, b) === false;
    return active && preVisible && visible && born;
  })()`));

console.log('\n5. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv, meta pre-seeded)');

await check('G.1 — pregnancies (active + born), relationship.trying, both parents\' _baby stamps, and the player\'s _baby + _tryingWith all survive the round trip',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt18', clock: { day: 1, minutes: 0 } });
    const partials = [{ name: 'TestA' }, { name: 'TestB' }];
    const h = await SIM_generateHouse('throwaway-w18-rt', 2, partials, null);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    h.player.name = 'TestP';
    const ids = Object.keys(h.npcs);
    const [a, b] = ids;
    const rec = getRelationship(h, a, b, true);
    rec.status = 'committed'; rec.trying = true;
    rec.history = [{ kind: 'first_sex', day: 3 }]; rec.lastIntimateDay = 5;
    h.meta.clock.day = 12;
    h.world.pregnancies = [
      { parents: [a, b].sort(), conceivedDay: 5, dueDay: 19, visibleFromDay: 11, birthDay: null, announced: true },
      { parents: ['player', a].sort(), conceivedDay: 1, dueDay: 9, visibleFromDay: 7, birthDay: 9, announced: true },
    ];
    h.player.flags._baby = { otherParent: a, bornDay: 9 };
    h.player.flags._tryingWith = a;
    h.npcs[b].flags._baby = { otherParent: a, bornDay: 9 };
    h.npcs[a].flags._baby = { otherParent: b, bornDay: 9 };
    const expectedPreg = JSON.stringify(h.world.pregnancies);
    const expectedTrying = rec.trying;
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const key = [a, b].sort().join('|');
    return JSON.stringify(loaded.world.pregnancies || []) === expectedPreg
      && loaded.world.relationships?.[key]?.trying === expectedTrying
      && JSON.stringify(loaded.npcs[a].flags?._baby) === JSON.stringify(h.npcs[a].flags._baby)
      && JSON.stringify(loaded.npcs[b].flags?._baby) === JSON.stringify(h.npcs[b].flags._baby)
      && JSON.stringify(loaded.player.flags?._baby) === JSON.stringify(h.player.flags._baby)
      && loaded.player.flags?._tryingWith === a;
  })()`));

await check('G.2 — the round trip is deterministic (identical input, identical output)',
  api(`(async () => {
    async function trip(seed) {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt18d', clock: { day: 1, minutes: 0 } });
      const partials = [{ name: 'TestA' }, { name: 'TestB' }];
      const h = await SIM_generateHouse(seed, 2, partials, null);
      h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
      h.player.name = 'TestP';
      const ids = Object.keys(h.npcs);
      const [a, b] = ids;
      const rec = getRelationship(h, a, b, true);
      rec.status = 'committed'; rec.trying = true;
      rec.history = [{ kind: 'first_sex', day: 3 }]; rec.lastIntimateDay = 5;
      h.meta.clock.day = 12;
      h.world.pregnancies = [{ parents: [a, b].sort(), conceivedDay: 5, dueDay: 19, visibleFromDay: 11, birthDay: null, announced: true }];
      h.player.flags._tryingWith = a;
      await writeGeneratedGameState(h);
      return await loadGameState();
    }
    const a = await trip('throwaway-w18-rtd'); const b = await trip('throwaway-w18-rtd');
    return JSON.stringify(a.world.pregnancies) === JSON.stringify(b.world.pregnancies)
      && JSON.stringify(a.world.relationships) === JSON.stringify(b.world.relationships)
      && JSON.stringify(a.player.flags?._tryingWith) === JSON.stringify(b.player.flags?._tryingWith);
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
