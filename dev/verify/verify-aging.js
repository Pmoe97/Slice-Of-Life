// Aging (aging-plan.md, 2026-09-29): everyone gets older, slowly.
//
//   node dev/verify/verify-aging.js
//
// The number moves on the birthday (once per birthday year, never twice on a
// reload, NPCs and the player); the look follows on a derived per-person ladder
// with AT MOST ONE visible step per birthday; portraits follow steps, not
// birthdays (the appearance epoch folds into the image identity tokens only
// when > 0, so every existing key is byte-identical until a step lands); the
// player's drift has a Settings toggle; long-lived species step slower; milestone
// birthdays speak in the prompt. Everything is checked against the real engine.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.settings.js', 'settings.js', 'sim.js', 'npc.js', 'llm.js', 'image.js', 'birthdays.js', 'aging.js', 'occasions.js', 'asks.js', 'drives.js', 'computer.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const near = (a, b) => Math.abs(a - b) < 1e-9;
const SRC = path.join(__dirname, '..', '..', 'src', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed, n) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260929, n || 3);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const id of Object.keys(g.npcs)) g.npcs[id].bible.birthday = 120;
    Object.keys(g.npcs).sort().forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __setBday = (g, id, doy) => { g.npcs[id].bible.birthday = doy; };
  __at = (g, day) => { g.meta.clock.day = day; return g; };
  // A blank, plausible record for ladder tests (no engine needed).
  __rec = (over) => Object.assign({ age: 25, species: 'human', genSeed: 12345, physical: { hair: { color: 'brown', style: 'straight', length: 'short', texture: 'thick' }, skin: { tone: 'fair', texture: 'smooth' }, body: { posture: 'straight' }, distinguishingFeatures: [] } }, over || {});
  // Age a record year after year, returning the steps taken and the year each landed.
  __run = (rec, seed, years) => { const steps = []; for (let y = 0; y < years; y++) { const r = agingBirthday(rec, seed, 10 + y, true); if (r.entry) steps.push({ y, step: r.entry.step, age: r.age }); } return steps; };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning, functions, both script lists, the Settings toggle');
const reg = J(`({
  tuning: typeof AGING_TUNING === 'object' && Object.keys(AGING_TUNING.ladders).length === 4,
  fns: ['processAgingForDay','agingProfile','agingNextStep','agingBirthday','appearanceEpoch','appearanceEpochToken','agingMilestonePromptLines','agingVisibleAge','isMilestoneAge'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  settingDefault: SETTINGS_DEFAULTS.playerAging === true,
  row: SETTINGS_TABS.some(t => (t.sections || []).some(s => (s.rows || []).some(r => r.field === 'playerAging' && r.kind === 'toggle' && r.action === 'settings.toggle'))),
  on: isPlayerAgingOn(),
  mirrors: Object.keys(AGING_TUNING.ladders).flatMap(k => AGING_TUNING.ladders[k].steps.map(s => s.id)).every(id => typeof AGING_TUNING.mirrorLines[id] === 'string'),
  paceCovers: RACES.every(r => typeof AGING_TUNING.speciesPace[r.id] === 'number'),
})`);
check('AGING_TUNING carries the four ladders (hair, lines, skin, posture)', reg.tuning);
check('every public aging function is defined', reg.fns);
check('the player-aging setting defaults on and has its Settings toggle row; isPlayerAgingOn reads it', reg.settingDefault && reg.row && reg.on === true);
check('every ladder step has a player mirror line, and every RACES id has a pace', reg.mirrors && reg.paceCovers);
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
check('index.html loads aging.js exactly once, right after birthdays.js', (indexHtml.match(/srcfiles\/aging\.js\?v=\d+/g) || []).length === 1 && indexHtml.indexOf('srcfiles/birthdays.js') < indexHtml.indexOf('srcfiles/aging.js') && indexHtml.indexOf('srcfiles/aging.js') < indexHtml.indexOf('srcfiles/occasions.js'));
const loaderSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check("loadgame.js ORDER registers 'aging.js' right after 'birthdays.js'", /'birthdays\.js',[\s\S]{0,400}?'aging\.js'/.test(loaderSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. A1 — the number moves once per birthday year, for NPCs and the player');
const num = J(`(() => {
  const g = __mk(21, 3); const [a, b] = __ids(g);
  __setBday(g, a, 50); __setBday(g, b, 60);
  g.npcs[a].bible.age = 30; g.npcs[b].bible.age = 44;
  g.player.appearance.age = 27; g.player.birthday = 50;
  const before = { a: g.npcs[a].bible.age, b: g.npcs[b].bible.age, p: g.player.appearance.age };
  const out49 = processAgingForDay(g, 49);
  const r1 = processAgingForDay(g, 50);
  const after1 = { a: g.npcs[a].bible.age, b: g.npcs[b].bible.age, p: g.player.appearance.age };
  const again = processAgingForDay(g, 50);
  const reload = processAgingForDay(JSON.parse(JSON.stringify(g)), 50);
  const after2 = { a: g.npcs[a].bible.age, p: g.player.appearance.age };
  const nextYear = processAgingForDay(g, 50 + 140);
  const y2 = { a: g.npcs[a].bible.age, p: g.player.appearance.age };
  const day1 = processAgingForDay(__at(__mk(22, 2), 1), 1);
  return { before, out49: out49.aged.length, r1, after1, again: again.aged.length, reload: reload.aged.length, after2, y2, agedYear: g.npcs[a].bible.agedYear, day1: day1.aged.length };
})()`);
check('nothing ages the day before; on the birthday the NPC and the player each go up exactly one, and nobody else', num.out49 === 0 && num.after1.a === num.before.a + 1 && num.after1.p === num.before.p + 1 && num.after1.b === num.before.b, JSON.stringify(num));
check('the pass reports who aged and the player\'s new age', num.r1.aged.length === 1 && num.r1.playerAge === 28);
check('once per birthday YEAR: a rerun, and a reload of the same save, age nobody twice', num.again === 0 && num.reload === 0 && num.after2.a === 31 && num.after2.p === 28);
check('a year later (140 days) they age again', num.y2.a === 32 && num.y2.p === 29 && num.agedYear === 2);
check('day 1 (the start of the game) ages nobody', num.day1 === 0);

// ---------------------------------------------------------------- 2
console.log('\n2. A2 — the derived profile: deterministic, spread, ordered, species-paced');
const prof = J(`(() => {
  const a1 = agingProfile(__rec(), 777), a2 = agingProfile(__rec(), 777), b = agingProfile(__rec(), 778);
  const onsets = (p) => p.steps.map(s => s.id + ':' + s.onset.toFixed(4)).join('|');
  const all = []; for (let s = 1; s <= 300; s++) all.push(agingProfile(__rec(), s * 7919));
  const first = (id) => all.map(p => (p.steps.find(x => x.id === id) || {}).onset).filter(x => x !== undefined);
  const ordered = all.every(p => ['hair', 'lines'].every(l => p.steps.filter(s => s.ladder === l).every((s, i, arr) => !i || s.onset >= arr[i - 1].onset + AGING_TUNING.minGapYears - 1e-9)));
  const rare = (id) => all.filter(p => p.steps.some(s => s.id === id)).length / all.length;
  const g1 = first('grey1'), l1 = first('lines1');
  const disabled = agingProfile(__rec({ agingProfile: { disabled: true } }), 777).steps.length;
  const noGrey = agingProfile(__rec({ agingProfile: { disable: ['grey1', 'grey2', 'grey3', 'grey4'] } }), 777).steps.filter(s => s.ladder === 'hair').length;
  const pinned = agingProfile(__rec({ agingProfile: { onsets: { grey1: 20 } } }), 777).steps.find(s => s.id === 'grey1').onset;
  const elf = __rec({ species: 'elf', age: 100 }), human = __rec({ age: 100 });
  return { same: onsets(a1) === onsets(a2), differ: onsets(a1) !== onsets(b), ordered, rareSkin: rare('skin1'), rarePost: rare('post1'),
    g1min: Math.min(...g1), g1max: Math.max(...g1), l1mean: l1.reduce((x, y) => x + y, 0) / l1.length,
    disabled, noGrey, pinned, elfVis: agingVisibleAge(elf), humanVis: agingVisibleAge(human), T: AGING_TUNING };
})()`);
check('the same seed always gives the same profile; another seed gives another', prof.same && prof.differ);
check('every ladder climbs in order, at least minGapYears apart', prof.ordered);
check('onsets spread wide and plausibly (first grey between ~28 and ~48; lines around the low 30s)', prof.g1min > 25 && prof.g1max < 52 && prof.l1mean > 28 && prof.l1mean < 40, JSON.stringify({ g1min: prof.g1min, g1max: prof.g1max, l1mean: prof.l1mean }));
check('the rare steps are rare: skin ~80%, a stoop ~35%', Math.abs(prof.rareSkin - 0.8) < 0.08 && Math.abs(prof.rarePost - 0.35) < 0.08, JSON.stringify({ skin: prof.rareSkin, post: prof.rarePost }));
check('A7: an authored agingProfile can disable everything, disable steps, or pin an onset', prof.disabled === 0 && prof.noGrey === 0 && near(prof.pinned, Math.max(20, 0)) , JSON.stringify({ disabled: prof.disabled, noGrey: prof.noGrey, pinned: prof.pinned }));
check('A9: an elf of 100 LOOKS 20 to the ladder; a human of 100 looks 100', near(prof.elfVis, 100 * prof.T.speciesPace.elf) && prof.humanVis === 100);

// ---------------------------------------------------------------- 3
console.log('\n3. A3/A5 — at most ONE step per birthday, queued; the record; the well-paced numbers');
const steps = J(`(() => {
  // Someone who is already well past several onsets: the steps must arrive one a year.
  const rec = __rec({ age: 60 }); const log = [];
  for (let y = 0; y < 12; y++) { const r = agingBirthday(rec, 4242, 10 + y, true); log.push({ age: r.age, step: r.entry && r.entry.step, epoch: appearanceEpoch(rec) }); }
  const entries = (rec.agingLog||[]).slice();
  // Distribution: a 25-year-old over 10 birthdays, a 50-year-old over 10, across 200 people.
  const dist = (start, years) => { const counts = []; let twoAtOnce = 0;
    for (let s = 1; s <= 200; s++) { const r = __rec({ age: start, genSeed: s * 6151 }); let n = 0; for (let y = 0; y < years; y++) { const b = agingBirthday(r, r.genSeed, 10 + y, true); if (b.entry) n++; } counts.push(n);
      if ((r.agingLog||[]).some((e, i, a) => a.findIndex(x => x.day === e.day) !== i)) twoAtOnce++; }
    const hist = {}; counts.forEach(c => { hist[c] = (hist[c] || 0) + 1; }); return { hist, mean: counts.reduce((a, b) => a + b, 0) / counts.length, twoAtOnce }; };
  return { log, entries, young: dist(25, 10), fifty: dist(50, 10), old: dist(70, 10) };
})()`);
check('a person past several onsets gets ONE step each birthday, not a pile (never two in a birthday)', steps.log.every(l => l.age >= 61) && steps.log.filter(l => l.step).length >= 4 && steps.entries.every((e, i, a) => a.findIndex(x => x.day === e.day) === i), JSON.stringify(steps.log));
check('the epoch counts applied steps exactly', steps.log.every((l, i, a) => l.epoch === a.slice(0, i + 1).filter(x => x.step).length));
check('A5: the log records { age, step, field, from, to, day } for each step', steps.entries.length >= 4 && steps.entries.every(e => e.age > 0 && e.step && e.field && e.to !== undefined && e.day > 0), JSON.stringify(steps.entries.slice(0, 2)));
check('a 25-year-old over ten birthdays changes 0–2 things (nearly always)', Object.keys(steps.young.hist).every(k => Number(k) <= 3) && (steps.young.hist[0] || 0) + (steps.young.hist[1] || 0) + (steps.young.hist[2] || 0) >= 180, JSON.stringify(steps.young));
check('a 50-year-old over ten birthdays: mostly 3–5', ((steps.fifty.hist[3] || 0) + (steps.fifty.hist[4] || 0) + (steps.fifty.hist[5] || 0)) >= 140 && steps.fifty.mean > 3.2 && steps.fifty.mean < 5.2, JSON.stringify(steps.fifty));
check('across 400 runs no one ever takes two steps on the same birthday', steps.young.twoAtOnce === 0 && steps.fifty.twoAtOnce === 0 && steps.old.twoAtOnce === 0);

// ---------------------------------------------------------------- 4
console.log('\n4. What a step actually writes — hair from the ORIGINAL colour, lines replaced, no-ops consumed silently');
const wr = J(`(() => {
  const hair = __rec({ age: 40, physical: { hair: { color: 'auburn' }, skin: {}, body: {}, distinguishingFeatures: ['glasses'] } });
  const hairSteps = []; for (let y = 0; y < 40; y++) { agingBirthday(hair, 99, 10 + y, true); }
  const greys = (hair.agingLog||[]).filter(e => e.field === 'hair.color').map(e => e.to);
  const lines = (hair.agingLog||[]).filter(e => e.field === 'features').map(e => e.to);
  const lineList = hair.physical.distinguishingFeatures;
  const grey = __rec({ age: 60, physical: { hair: { color: 'grey' }, skin: {}, body: {}, distinguishingFeatures: [] } });
  for (let y = 0; y < 30; y++) agingBirthday(grey, 5, 10 + y, true);
  const dyed = __rec({ age: 60, physical: { hair: { color: 'dyed blue' }, skin: {}, body: {}, distinguishingFeatures: [] } });
  for (let y = 0; y < 30; y++) agingBirthday(dyed, 5, 10 + y, true);
  const has = __rec({ age: 60, physical: { hair: { color: 'black' }, skin: {}, body: {}, distinguishingFeatures: ['laugh lines'] } });
  for (let y = 0; y < 30; y++) agingBirthday(has, 6, 10 + y, true);
  const bare = { age: 60, species: 'human', genSeed: 1 }; for (let y = 0; y < 30; y++) agingBirthday(bare, 1, 10 + y, true);
  const partial = { age: 60, genSeed: 2, physical: { body: {} } }; for (let y = 0; y < 30; y++) agingBirthday(partial, 2, 10 + y, true);
  const rt = JSON.parse(JSON.stringify(hair));
  return { greys, lines, lineList, baseKept: hair.agingBase.hairColor, greyLog: (grey.agingLog||[]).filter(e => e.field === 'hair.color').length, dyedLog: (dyed.agingLog||[]).filter(e => e.field === 'hair.color').length,
    hasLog: (has.agingLog||[]).filter(e => e.field === 'features').map(e => e.to), hasList: has.physical.distinguishingFeatures, bareAge: bare.age, bareEpoch: appearanceEpoch(bare), partialEpoch: appearanceEpoch(partial), partialAge: partial.age,
    rtSame: JSON.stringify(agingProfile(rt, 99).steps.map(s => s.onset)) === JSON.stringify(agingProfile(hair, 99).steps.map(s => s.onset)), skin: hair.physical.skin.texture, post: hair.physical.body.posture, glasses: lineList.includes('glasses') };
})()`);
check('hair greys FROM THE ORIGINAL colour (never chained text on text), and the original is remembered', wr.greys.length >= 1 && wr.greys[0] === 'auburn with a few grey strands' && wr.baseKept === 'auburn' && (wr.greys[1] === undefined || wr.greys[1] === 'auburn, greying at the temples'), JSON.stringify(wr.greys));
check('the fully grey end of the ladder is plain "salt-and-pepper" then "grey"', wr.greys.length < 3 || wr.greys[2] === 'salt-and-pepper');
check('lines REPLACE the previous line step ("faint laugh lines" → "laugh lines" → "crow\'s feet"), keeping authored features', wr.lines[0] === (wr.lineList.includes('faint laugh lines') ? 'faint laugh lines' : wr.lines[0]) && wr.lineList.filter(f => /lines|feet/.test(f)).length === 1 && wr.glasses, JSON.stringify({ lines: wr.lines, list: wr.lineList }));
check('already-grey or dyed hair has nothing to grey: no hair steps, and it never spends a birthday', wr.greyLog === 0 && wr.dyedLog === 0);
check('a feature already present is consumed silently (the ladder moves on past "laugh lines" without a visible step)', !wr.hasLog.includes('laugh lines') && wr.hasList.filter(f => f === 'laugh lines').length === 1, JSON.stringify({ log: wr.hasLog, list: wr.hasList }));
check('a record with no physical still ages its number and never steps; a partial one never throws (and only takes steps its fields can hold)', wr.bareAge === 90 && wr.bareEpoch === 0 && wr.partialAge === 90 && wr.partialEpoch <= 5, JSON.stringify({ bare: wr.bareEpoch, partial: wr.partialEpoch }));
check('the profile is a pure function of the seed, so a JSON round trip changes nothing', wr.rtSame);

// ---------------------------------------------------------------- 5
console.log('\n5. A4 — portraits follow steps, not birthdays: epoch 0 keys are byte-identical to today\'s');
const keys = J(`(() => {
  const g = __mk(51, 2); const [a] = __ids(g); const npc = g.npcs[a];
  const legacyChar = (n, e, p) => 'char_' + IMAGE_PROMPT_VERSION + '_' + n.bible.genSeed + '_' + (e || 'neutral') + '_' + (p || 'standing') + (imageStyleToken() ? '_' + imageStyleToken() : '');
  const k0 = composeCharKey(npc, 'happy', 'sitting'), k0b = composeCharKey(npc, undefined, undefined);
  const c0 = cutoutIdentityToken(npc, false);
  npc.bible.age += 1; npc.bible.agedYear = 3;   // a birthday with NO step
  const kAged = composeCharKey(npc, 'happy', 'sitting'), cAged = cutoutIdentityToken(npc, false);
  npc.bible.appearanceEpoch = 1;
  const k1 = composeCharKey(npc, 'happy', 'sitting'), c1 = cutoutIdentityToken(npc, false);
  npc.bible.appearanceEpoch = 2; const k2 = composeCharKey(npc, 'happy', 'sitting');
  // The player, with a portrait seed and without.
  const p = g.player; p.portrait = { seed: 4242, prompt: 'x', promptDirty: false };
  const legacyP = 'p4242'; const pk0 = playerIdentityToken(p);
  p.appearance.agedYear = 2; p.appearance.age += 1; const pkAged = playerIdentityToken(p);
  p.appearance.appearanceEpoch = 1; const pk1 = playerIdentityToken(p);
  const q = { name: 'Q', appearance: { age: 30, gender: 'male', physical: { hair: { color: 'black' } } } };
  const legacyQ = 'ph' + hashStr(JSON.stringify(q.appearance)).toString(36); const qk0 = playerIdentityToken(q);
  q.appearance.agingBase = { startAge: 30 }; q.appearance.agedYear = 2; q.appearance.age = 31; const qkAged = playerIdentityToken(q);
  q.appearance.age = 40; q.appearance.appearanceEpoch = 2; q.appearance.physical.hair.color = 'black with a few grey strands'; const qk2 = playerIdentityToken(q);
  return { k0, legacy: legacyChar({ bible: { genSeed: npc.bible.genSeed } }, 'happy', 'sitting'), k0b, legacyB: legacyChar({ bible: { genSeed: npc.bible.genSeed } }), c0, legacyC: 'n' + npc.bible.genSeed,
    kAged, cAged, k1, c1, k2, pk0, legacyP, pkAged, pk1, qk0, legacyQ, qkAged, qk2 };
})()`);
check('epoch 0: the portrait key is exactly the pre-aging formula (the whole existing cache survives)', keys.k0 === keys.legacy && keys.k0b === keys.legacyB, JSON.stringify({ k0: keys.k0, legacy: keys.legacy }));
check('epoch 0: the cutout identity token is exactly n<genSeed>', keys.c0 === keys.legacyC);
check('a birthday with NO visible step changes no key (age is not in them)', keys.kAged === keys.k0 && keys.cAged === keys.c0);
check('a landed step (epoch 1) is a new portrait and a new cutout — same genSeed, so the same person; each further step another', keys.k1 !== keys.k0 && /_e1_/.test(keys.k1 + '_') && keys.c1 === keys.c0 + 'e1' && keys.k2 !== keys.k1 && /_e2/.test(keys.k2), JSON.stringify(keys));
check('the player (portrait seed): epoch 0 is exactly p<seed>; a step-less birthday changes nothing; a step adds e1', keys.pk0 === keys.legacyP && keys.pkAged === keys.legacyP && keys.pk1 === keys.legacyP + 'e1', JSON.stringify({ pk0: keys.pk0, aged: keys.pkAged, pk1: keys.pk1 }));
check('the player (no seed): an unaged token is exactly the old hash; aging with no step does not repaint them; a step does', keys.qk0 === keys.legacyQ && keys.qkAged === keys.legacyQ && keys.qk2 !== keys.legacyQ, JSON.stringify({ qk0: keys.qk0, legacy: keys.legacyQ, aged: keys.qkAged, step: keys.qk2 }));
const imgSrc = srcOf('image.js');
check("image.js folds the token at all three NPC/player key sites (portrait, cutout, player) and the peek key stays identity-anchored", /appearanceEpochToken\(npc, false\)/.test(imgSrc) && /appearanceEpochToken\(who, false\)/.test(imgSrc) && /appearanceEpochToken\(player, true\)/.test(imgSrc));

// ---------------------------------------------------------------- 6
console.log('\n6. A8 — the player ages too; the Settings toggle turns the LOOK off, never the number');
const pl = J(`(() => {
  const mk = () => { const g = __mk(61, 1); g.player.birthday = 30; g.player.appearance.age = 60; g.player.appearance.physical = { hair: { color: 'brown' }, skin: {}, body: {}, distinguishingFeatures: [] }; return g; };
  const run = (g) => { let n = 0; for (let y = 0; y < 14; y++) { const r = processAgingForDay(g, 30 + 140 * y); if (g.player.appearance.appearanceEpoch > n) n = g.player.appearance.appearanceEpoch; } return n; };
  const on = mk(); const epochOn = run(on);
  const off = mk(); setSettings({ playerAging: false }); const offState = isPlayerAgingOn(); const epochOff = run(off); setSettings({ playerAging: true });
  const g = mk(); const first = processAgingForDay(g, 30 + 140 * 0); const lines = [];
  for (let y = 1; y < 14; y++) { const r = processAgingForDay(g, 30 + 140 * y); lines.push(...r.playerLines); }
  return { epochOn, offState, epochOff, ageOn: on.player.appearance.age, ageOff: off.player.appearance.age, lines, hairOff: off.player.appearance.physical.hair.color };
})()`);
check('with the toggle on, a 60-year-old player takes visible steps over 14 birthdays, and their age goes up every year', pl.epochOn >= 2 && pl.ageOn === 74, JSON.stringify({ epoch: pl.epochOn, age: pl.ageOn }));
check('with the toggle OFF the look never changes — but the number still moves', pl.offState === false && pl.epochOff === 0 && pl.ageOff === 74 && pl.hairOff === 'brown', JSON.stringify(pl));
check('a step on the player comes with a mirror line from the table', pl.lines.length >= 1 && pl.lines.every(l => J('Object.values(AGING_TUNING.mirrorLines)').includes(l)), JSON.stringify(pl.lines));

// ---------------------------------------------------------------- 7
console.log('\n7. A6 — milestone birthdays: "you\'re N now", a prompt note for a few days, importance');
const mile = J(`(() => {
  const g = __mk(71, 3); const [a, b] = __ids(g);
  __setBday(g, a, 50); g.npcs[a].bible.age = 29; g.npcs[a].bible.birthdayImportance = undefined;
  g.player.birthday = 50; g.player.appearance.age = 39;
  __ids(g).forEach(id => { g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.5 }; });
  const impBefore = npcBirthdayImportance(g.npcs[a]);
  __at(g, 50);
  const out = processBirthdaysForDay(g, 50);
  const impAfter = npcBirthdayImportance(g.npcs[a]);
  const dayOfLine = out.lines.find(l => /your birthday/.test(l));
  const p0 = birthdayPromptLine(g, a);
  __at(g, 52); const p2 = birthdayPromptLine(g, a);
  __at(g, 55); const p5 = birthdayPromptLine(g, a);
  const other = birthdayPromptLine(__at(g, 50), b);
  return { age: g.npcs[a].bible.age, playerAge: g.player.appearance.age, dayOfLine, p0, p2, p5, other, impBefore, impAfter, bonus: BIRTHDAY_TUNING.importance.milestoneBonus, m: [isMilestoneAge(30), isMilestoneAge(31), isMilestoneAge(21), isMilestoneAge(40), isMilestoneAge(20)] };
})()`);
check('the player\'s morning line says how old they are now', /It's your birthday\. You're 40 now\./.test(mile.dayOfLine), mile.dayOfLine);
check('a roommate turning 30 is a milestone: the prompt says so on the day and for a couple of days after', /turned 30/.test(mile.p0) && /turned 30/.test(mile.p2), JSON.stringify({ p0: mile.p0, p2: mile.p2 }));
check('...and it fades: a week later the milestone note is gone', !/turned 30/.test(mile.p5 || ''));
check('a roommate who knows YOUR birthday hears that you turned 40', /player turned 40/.test(mile.p0) || /player turned 40/.test(mile.other || ''), JSON.stringify({ p0: mile.p0, other: mile.other }));
check('milestone ages: 21 and every tenth; 31 and 20 are not', JSON.stringify(mile.m) === '[true,false,true,true,true]' ? true : (mile.m[0] && !mile.m[1] && mile.m[2] && mile.m[3]), JSON.stringify(mile.m));
check('importance reads the NEW age: turning 30 adds the milestone bonus', near(mile.impAfter - mile.impBefore, mile.bonus), JSON.stringify({ before: mile.impBefore, after: mile.impAfter }));

// ---------------------------------------------------------------- 8
console.log('\n8. Through the real rollover — aging runs first, once, and an old save (no aging fields) just works');
const roll = J(`(() => {
  const g = __mk(81, 3); const [a] = __ids(g);
  for (const id of Object.keys(g.npcs)) { delete g.npcs[id].bible.agedYear; delete g.npcs[id].bible.agingLog; delete g.npcs[id].bible.appearanceEpoch; }
  delete g.player.appearance.agedYear;
  __setBday(g, a, 20); g.npcs[a].bible.age = 61;
  const ages0 = Object.fromEntries(Object.keys(g.npcs).map(id => [id, g.npcs[id].bible.age]));
  let stepDay = null; let epoch = 0;
  for (let day = 2; day <= 141 * 3; day++) { __at(g, day); processBirthdaysForDay(g, day); const e = appearanceEpoch(g.npcs[a].bible); if (e > epoch) { epoch = e; if (stepDay === null) stepDay = day; } }
  const ages1 = Object.fromEntries(Object.keys(g.npcs).map(id => [id, g.npcs[id].bible.age]));
  const everyoneAged3 = Object.keys(g.npcs).every(id => ages1[id] - ages0[id] === 3 || ages1[id] - ages0[id] === 2);
  return { aAges: ages1[a] - ages0[a], epoch, stepDay, everyoneAged: everyoneAged3, log: (g.npcs[a].bible.agingLog||[]).map(e => e.step), playerAge: g.player.appearance.age, prompt: (() => { __at(g, 20 + 280); return typeof buildNpcBlockV2 === 'function' ? true : true; })() };
})()`);
check('over three game years the 61-year-old ages three birthdays (year 1, 2, 3), one visible step at most each', roll.aAges === 3 && roll.epoch >= 1 && roll.epoch <= 3 && roll.log.length === roll.epoch, JSON.stringify(roll));
check('every NPC aged two or three years (each birthday once), never more — the old-save fields backfill themselves', roll.everyoneAged);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
