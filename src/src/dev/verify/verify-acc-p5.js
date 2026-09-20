// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 5: Writing —
// draft, publish, royalties (D21, D74).
//
//   node src/src/dev/verify/verify-acc-p5.js
//
// Node coverage for everything pure in this phase: the storefront's one
// name (INKWELL_LABEL, D74) and its WorkHub screen; OPINION_LINES.work
// (every band, the {what} placeholder); the plan's run — a full draft →
// publish → 30-day royalty run at two quality levels (writing 4 → 0.68,
// writing 8 → 0.92) on the same seed, the higher-quality book out-earning
// the lower on EVERY day; a second published book raising total daily
// income; noticeSubject('work') firing exactly once per release for the
// NPC in the room (a `work:<id>` opinion fact at the work's quality,
// category 'writing'), a second release a second key, a repeated release
// refused and writing nothing; free-text titles accepted verbatim (quotes,
// unicode, emoji — free text is always valid) and only an empty one
// refused; and source checks on the manuscript chip/modal wiring in
// render.js/ui.js and the Works tab's book deep link. The chips, the modal,
// the Inkwell screen and "a draft progressing across two in-game days" are
// presentation, verified on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.money = 1000;
    g.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 };
    return g;
  };
  __setLevel = (g, skillId, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skillId] = SKILLS.xpPerLevelBase * level * level; };
  __setRep = (g, map) => { Object.assign(g.world.computer.apps.gigs.reputation, map); };
  // Draft a book to completion at full rest: the real startWork/workBlock
  // path, energy topped up between clicks so focus stays constant.
  __draft = (g, title) => {
    const s = startWork(g, { kind: 'book', title });
    if (!s.ok) return { ok: false, reason: s.reason };
    let r, clicks = 0;
    do { g.player.energy = 90; r = workBlock(g, s.wip.id, 'computer'); clicks++; } while (r.ok && !r.finished && clicks < 500);
    return { ok: r.ok && r.finished, work: r.work, clicks, blocks: s.wip.blocks };
  };
  // Roll N days through the real rollover call, returning per-day totals.
  __royalties = (g, days) => { const out = []; for (let i = 0; i < days; i++) { g.meta.clock.day += 1; const r = processWorksForDay(g, g.meta.clock.day); out.push({ day: g.meta.clock.day, total: r.income.total, credited: r.income.credited }); } return out; };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion');
  __withWitness = (g) => { const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_')); const A = ids[0]; g.player.location = 'living_room'; g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'idle'; g.npcs[A].needs.energy = 80; for (const id of ids.slice(1)) { g.npcs[id].location = 'bedroom_1'; g.npcs[id].activity = 'idle'; } return A; };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — INKWELL_LABEL (D74), the inkwell screen, OPINION_LINES.work, the chip/modal/deep-link wiring. ${loaded.length} engine files loaded.`);
const reg = J(`({
  label: INKWELL_LABEL,
  screen: APP_DEFS.work.screens.inkwell,
  workBands: Object.keys(OPINION_LINES.work || {}),
  workRowsOk: Object.values(OPINION_LINES.work || {}).every(p => Array.isArray(p) && p.length > 0 && p.every(l => /\\{what\\}/.test(l))),
  brands: ['WorkHub', 'Nile', 'Streamly', 'DoorDrop', 'ChefBook', 'AfterHours', 'Chatter'].map(b => b.toLowerCase()),
})`);
check("INKWELL_LABEL is 'Inkwell' — one string, no collision with an existing brand (D74)", reg.label === 'Inkwell' && !reg.brands.includes(reg.label.toLowerCase()), JSON.stringify(reg.label));
check("the work app has an 'inkwell' screen on the 'inkwell' renderer", reg.screen && reg.screen.renderer === 'inkwell', JSON.stringify(reg.screen));
check('OPINION_LINES.work has all five bands, every line carrying {what}', JSON.stringify(reg.workBands) === JSON.stringify(['strong_pos', 'pos', 'neutral', 'neg', 'strong_neg']) && reg.workRowsOk === true, JSON.stringify(reg.workBands));
const renderSrc = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const rcSrc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
check("render.js offers 'Start a Manuscript' / 'Write — \"<title>\"' chips in the devices bucket when a desk or desktop_computer is in the room", /write-manuscript-start/.test(renderSrc) && /action: 'write-manuscript', bucket: 'devices'/.test(renderSrc) && /o\.defId === 'desk' \|\| o\.defId === 'desktop_computer'/.test(renderSrc));
check("ui.js dispatches write-manuscript-start → openManuscriptModal, confirm-write-manuscript → doStartManuscript (the kind-generic start modal: startWork + first block), write-manuscript → doWorkBlock(offline)", /case \x27write-manuscript-start\x27:\r?\n\s*openManuscriptModal\(\)/.test(uiSrc) && /case \x27confirm-write-manuscript\x27:\r?\n\s*await doStartManuscript\(\)/.test(uiSrc) && /case \x27write-manuscript\x27:\r?\n\s*await doWorkBlock\(extra\?\.rowId, \x27computer\x27, \{ offline: true \}\)/.test(uiSrc) && /function doStartManuscript\(\) \{ await doStartWorkFromModal\(\x27book\x27\); \}/.test(uiSrc) && /function doStartWorkFromModal\(kind\)[\s\S]{0,900}startWork\(currentGameState, \{ kind, title: text \}\)[\s\S]{0,700}doWorkBlock\(result\.wip\.id, \x27computer\x27, \{ offline: true \}\)/.test(uiSrc) && /book: \{ heading: \x27Start a manuscript\x27/.test(uiSrc));
check("the Works tab's finished-book button deep-links to the inkwell screen instead of a second release path; Inkwell's Publish is works.release", /w\.kind === 'book'[\s\S]{0,300}data-screen', 'inkwell'/.test(rcSrc) && /function renderInkwell[\s\S]{0,4000}data-action', 'works\.release'/.test(rcSrc) && /inkwell: renderInkwell/.test(rcSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Draft → publish → 30 days at two quality levels on the same seed — the better book out-earns the other every day (D17/D18)');
const run = J(`(() => {
  const out = {};
  for (const [tag, level] of [['lo', 4], ['hi', 8]]) {
    const g = __mk(21, 1);
    __setLevel(g, 'writing', level); __setRep(g, { writing: 45 });
    const d = __draft(g, 'The Same Book');
    const rel = releaseWork(g, d.work.id);
    const days = __royalties(g, 30);
    out[tag] = { quality: d.work.quality, expectedQuality: Math.round(SKILL_CURVES.craftQuality[level] * 100) / 100, blocks: d.blocks, clicks: d.clicks, reach: rel.reach, days, sum: days.reduce((s, x) => s + x.total, 0), money: g.player.money, earned: d.work.earned };
  }
  return out;
})()`);
check(`writing 4 finishes at quality ${run.lo.expectedQuality}, writing 8 at ${run.hi.expectedQuality} (craftQuality, fixed at finish)`, run.lo.quality === run.lo.expectedQuality && run.hi.quality === run.hi.expectedQuality, JSON.stringify([run.lo.quality, run.hi.quality]));
check('both drafts rolled the same block count (seeded on the id) and the better writer took no fewer clicks — quality is skill, not speed', run.lo.blocks === run.hi.blocks && run.lo.clicks === run.hi.clicks, JSON.stringify([run.lo.blocks, run.hi.blocks, run.lo.clicks, run.hi.clicks]));
check('the higher-quality book launches to more readers (releaseReach rises with quality)', run.hi.reach > run.lo.reach, JSON.stringify([run.lo.reach, run.hi.reach]));
check('the higher-quality book out-earns the lower on EVERY one of the 30 days (same seed, same spike days)', run.hi.days.every((d, i) => d.total > run.lo.days[i].total), JSON.stringify(run.hi.days.slice(0, 3).map((d, i) => [d.day, run.lo.days[i].total, d.total])));
check('30-day royalties: the better book earned more in total, and player.money moved by the whole-dollar credits', run.hi.sum > run.lo.sum && run.hi.money - 1000 === run.hi.days.reduce((s, x) => s + x.credited, 0) && run.lo.money - 1000 === run.lo.days.reduce((s, x) => s + x.credited, 0), JSON.stringify({ lo: [run.lo.sum, run.lo.money], hi: [run.hi.sum, run.hi.money] }));
console.log(`        measured: writing 4 (q ${run.lo.quality}, reach ${run.lo.reach}) → ${Math.round(run.lo.sum * 100) / 100} over 30 days (${run.lo.money - 1000} credited); writing 8 (q ${run.hi.quality}, reach ${run.hi.reach}) → ${Math.round(run.hi.sum * 100) / 100} (${run.hi.money - 1000} credited)`);

// ---------------------------------------------------------------- 2
console.log('\n2. A second book adds — total daily income rises; both fade independently');
const second = J(`(() => {
  const g = __mk(22, 1);
  __setLevel(g, 'writing', 6); __setRep(g, { writing: 50 });
  const a = __draft(g, 'First');
  releaseWork(g, a.work.id);
  const before = __royalties(g, 5);
  const b = __draft(g, 'Second');
  releaseWork(g, b.work.id);
  const dayOfSecond = g.meta.clock.day;
  const after = __royalties(g, 5);
  const works = g.player.works.map(w => ({ id: w.id, reach: w.reach, released: w.releasedDay }));
  return { before: before.map(d => d.total), after: after.map(d => d.total), dayOfSecond, works, ids: [a.work.id, b.work.id] };
})()`);
check('after publishing the second book every following day earns more than the single-book days did', Math.min(...second.after) > Math.max(...second.before), JSON.stringify([second.before, second.after]));
check('two catalog entries with sequential ids, each fading from its own release day', second.ids[0] === 'work_1' && second.ids[1] === 'work_2' && second.works.length === 2 && second.works[1].released === second.dayOfSecond && second.works[0].reach < second.works[1].reach, JSON.stringify(second.works));

// ---------------------------------------------------------------- 3
console.log("\n3. noticeSubject('work') fires once per release for the NPC in the room (D9/D10) — a work:<id> opinion at the book's quality, category writing");
const notice = J(`(() => {
  const g = __mk(23, 1);
  const A = __withWitness(g);
  __setLevel(g, 'writing', 5); __setRep(g, { writing: 45 });
  const a = __draft(g, 'Tidewater');
  const before = __opinions(g.npcs[A]).length;
  const rel = releaseWork(g, a.work.id);
  const ops1 = __opinions(g.npcs[A]);
  const f = ops1.find(x => x.subject.key === 'work:' + a.work.id);
  const expectedV = f && Math.round(opinionValence(g.npcs[A], { kind: 'work', ref: a.work.id, day: g.meta.clock.day, quality: a.work.quality, meta: { title: 'Tidewater', label: 'book' } }, g) * 100) / 100;
  const again = releaseWork(g, a.work.id);
  const ops2 = __opinions(g.npcs[A]).length;
  const b = __draft(g, 'Second Wind');
  const rel2 = releaseWork(g, b.work.id);
  const ops3 = __opinions(g.npcs[A]);
  const others = Object.keys(g.npcs).filter(id => id.startsWith('npc_') && id !== A).map(id => __opinions(g.npcs[id]).length);
  return { before, noticed: rel.noticed, fact: f && { key: f.subject.key, kind: f.subject.kind, ref: f.subject.ref, valence: f.valence, text: f.text, category: f.category, provenance: f.provenance }, expectedV, again: again.ok, ops2, keys: ops3.map(x => x.subject.key), others, noticed2: rel2.noticed.perceivers.length };
})()`);
check("releasing fires the work subject: the in-room NPC holds exactly one opinion keyed work:<id>, provenance witnessed, category 'writing', text naming the book", notice.before === 0 && notice.noticed.key === 'work:work_1' && notice.noticed.perceivers.length === 1 && notice.fact && notice.fact.kind === 'work' && notice.fact.ref === 'work_1' && notice.fact.category === 'writing' && notice.fact.provenance === 'witnessed' && /book "Tidewater"/.test(notice.fact.text), JSON.stringify(notice.fact));
check("the opinion's valence is opinionValence at the book's quality (the record is the decision)", notice.fact && notice.fact.valence === notice.expectedV, JSON.stringify([notice.fact && notice.fact.valence, notice.expectedV]));
check('a repeated release is refused and writes nothing; a second book is a second key; NPCs elsewhere hold none', notice.again === false && notice.ops2 === 1 && JSON.stringify(notice.keys) === JSON.stringify(['work:work_1', 'work:work_2']) && notice.noticed2 === 1 && notice.others.every(n => n === 0), JSON.stringify([notice.again, notice.ops2, notice.keys, notice.others]));

// ---------------------------------------------------------------- 4
console.log('\n4. Titles are free text — anything non-empty is valid verbatim (trimmed)');
const titles = J(`(() => {
  const g = __mk(24, 1);
  const tries = ['  Tidewater  ', 'She said "no", twice', 'Ångström & the ünïcode fox', '🌊 waves 🌊', "O'Brien's Last Stand", '<b>not html</b>', ''];
  return tries.map(t => { const r = startWork(g, { kind: 'book', title: t }); return { in: t, ok: r.ok, title: r.ok ? r.wip.title : r.reason }; });
})()`);
check('quotes, apostrophes, unicode, emoji and angle brackets are all accepted verbatim (trimmed); only the empty title is refused', titles.slice(0, 6).every(t => t.ok && t.title === t.in.trim()) && titles[6].ok === false && /title/.test(titles[6].title), JSON.stringify(titles));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
