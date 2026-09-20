// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 4: the works
// engine (D17–D20), verified on a synthetic work before any real track
// exists.
//
//   node src/src/dev/verify/verify-acc-p4.js
//
// Node coverage for everything pure in this phase: defs.works.js and
// works.js registered in both load lists (D56), WORK_KINDS' four rows and
// WORKS_TUNING (renamed from the plan's WORK_TUNING — config.js already owns
// that name for the focus floors, D71); the plan's synthetic book at quality
// 0.8 / reach 100 — day-0 income = 100 × 0.8 × ratePerReach, reach ≈ 50
// after 14 unpromoted rollovers, a promotion resets the clock and bumps by
// promoteBump × releaseReach, two works earn the sum (catalog-additive), the
// spike roll fires at spikeChance over 5,000 seeded days (±20%); the D19
// gate refused at writing 3 / rep 60 and at writing 5 / rep 30, accepted at
// 5 / 45, with every unmet reason named; the track kind's placed-object
// requirement; production through workBlock mirroring workGigBlock exactly
// (same progress formula, energy through the need-decay scale, the
// gigs.workBlocksToday burnout counter, the device meter) with quality
// FIXED at finish from skills.js's craftQuality; the menu kind skipping
// production; the rollover crediting whole dollars through the real
// EARN_MONEY path with player.money moved by exactly the credited amount,
// taxes.quarterGross agreeing, and money + catalogCarry summing to the
// fractional total; decay idempotent on a re-processed rollover; the
// tracker's Catalog line derived (not stored) from the same seeded call;
// and a save round-trip carrying player.works / workInProgress /
// catalogCarry / nextWorkSeq byte-identical with no new SAVE_KEYS entry.
// The Works tab itself is presentation and is verified on the live page
// (invariant 7). The measured day-0 / 14 / 28 income of the synthetic work
// is printed for the plan's tuning baseline (the Phase 4 obligation).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'tracker.js', 'state.js'],
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
  // The plan's synthetic work, placed directly in the catalog: released,
  // quality q, reach r, today.
  __synthetic = (g, id, kind, q, r) => {
    ensurePlayerWorks(g.player);
    const day = g.meta.clock.day;
    const w = { id, kind, title: 'Synthetic ' + id, quality: q, createdDay: day, releasedDay: day, reach: r, lastPromotedDay: day, lastDecayDay: day, earned: 0, meta: {} };
    g.player.works.push(w);
    return w;
  };
  __roll = (g, days) => { const out = []; for (let i = 0; i < days; i++) { g.meta.clock.day += 1; out.push(processWorksForDay(g, g.meta.clock.day)); } return out; };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — defs.works.js + works.js in both load lists (D56), WORK_KINDS, WORKS_TUNING (D71), the Works screen, MOOD_PAYOUTS readers. ${loaded.length} engine files loaded.`);
check('defs.works.js and works.js loaded through loadgame.js\'s ORDER, works.js after computer.js and before tracker.js', loaded.includes('defs.works.js') && loaded.includes('works.js') && loaded.indexOf('works.js') > loaded.indexOf('computer.js') && loaded.indexOf('works.js') < loaded.indexOf('tracker.js'), JSON.stringify([loaded.indexOf('computer.js'), loaded.indexOf('works.js'), loaded.indexOf('tracker.js')]));
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
const at = (f) => indexHtml.indexOf(`srcfiles/${f}?`);
check('index.html loads defs.works.js with the defs (before state.js) and works.js after skills.js/computer.js, before tracker.js', at('defs.works.js') > 0 && at('defs.works.js') < at('state.js') && at('works.js') > at('computer.js') && at('works.js') > at('skills.js') && at('works.js') < at('tracker.js'), JSON.stringify({ defs: at('defs.works.js'), state: at('state.js'), works: at('works.js'), computer: at('computer.js'), tracker: at('tracker.js') }));
const reg = J(`({
  kinds: WORK_KIND_IDS,
  rows: Object.fromEntries(WORK_KIND_IDS.map(k => [k, { skill: WORK_KINDS[k].skill, category: WORK_KINDS[k].category, minSkill: WORK_KINDS[k].minSkill, minRep: WORK_KINDS[k].minRep, blocks: WORK_KINDS[k].blocksRange || null, rate: WORK_KINDS[k].ratePerReach, requires: WORK_KINDS[k].requires || null, hasRelease: typeof WORK_KINDS[k].releaseReach === 'function' }])),
  tuning: WORKS_TUNING,
  oldNameIsFocus: typeof WORK_TUNING === 'object' && typeof WORK_TUNING.minEnergyFocus === 'number',
  screen: APP_DEFS.work.screens.works,
  payouts: [MOOD_PAYOUTS.workFinish, MOOD_PAYOUTS.workRelease],
  trackerUrg: TRACKER.catalogUrgency,
  categoriesReal: WORK_KIND_IDS.every(k => GIG_CATEGORY_BY_ID[WORK_KINDS[k].category] && GIG_CATEGORY_BY_ID[WORK_KINDS[k].category].skill === WORK_KINDS[k].skill),
  skillsReal: WORK_KIND_IDS.every(k => SKILL_IDS.includes(WORK_KINDS[k].skill)),
})`);
check('WORK_KINDS is book/track/piece/menu with the plan\'s skill/category/minSkill/minRep/blocksRange/ratePerReach rows', JSON.stringify(reg.kinds) === JSON.stringify(['book', 'track', 'piece', 'menu'])
  && reg.rows.book.skill === 'writing' && reg.rows.book.minSkill === 4 && reg.rows.book.minRep === 40 && JSON.stringify(reg.rows.book.blocks) === '[24,40]' && reg.rows.book.rate === 0.04
  && reg.rows.track.skill === 'music' && reg.rows.track.minSkill === 4 && reg.rows.track.minRep === 40 && JSON.stringify(reg.rows.track.blocks) === '[8,16]' && reg.rows.track.rate === 0.02 && reg.rows.track.requires === 'recording_kit'
  && reg.rows.piece.skill === 'art' && reg.rows.piece.minSkill === 3 && reg.rows.piece.minRep === 20 && JSON.stringify(reg.rows.piece.blocks) === '[4,10]' && reg.rows.piece.rate === 0
  && reg.rows.menu.skill === 'cooking' && reg.rows.menu.minSkill === 4 && reg.rows.menu.minRep === 20 && reg.rows.menu.blocks === null && reg.rows.menu.rate === 0, JSON.stringify(reg.rows));
check("every kind's category is a real GIG_CATEGORIES id whose craft skill is the kind's skill, and every skill is in SKILL_IDS (D19 reads Phase 2's map)", reg.categoriesReal === true && reg.skillsReal === true);
check('WORKS_TUNING carries the plan\'s defaults (14 / 30 / 0.25 / 0.02 / 10) and config.js\'s WORK_TUNING is still the focus table (D71 — no collision)', reg.tuning.decayHalfLifeDays === 14 && reg.tuning.promoteBlockMinutes === 30 && reg.tuning.promoteBump === 0.25 && reg.tuning.spikeChance === 0.02 && reg.tuning.spikeMult === 10 && reg.oldNameIsFocus === true, JSON.stringify([reg.tuning, reg.oldNameIsFocus]));
check("the work app has a 'works' screen on the 'gigworks' renderer; MOOD_PAYOUTS.workFinish/workRelease and TRACKER.catalogUrgency exist (readers: works.js, tracker.js)", reg.screen && reg.screen.renderer === 'gigworks' && reg.payouts[0] > 0 && reg.payouts[1] > reg.payouts[0] && reg.trackerUrg === 10, JSON.stringify([reg.screen, reg.payouts, reg.trackerUrg]));

// ---------------------------------------------------------------- 1
console.log('\n1. The synthetic book (q 0.8, reach 100) — day-0 income, 14-day fade, promotion, catalog-additive (D18)');
const syn = J(`(() => {
  const g = __mk(11, 1);
  const w = __synthetic(g, 'syn_book', 'book', 0.8, 100);
  const d0 = catalogIncomeForDay(g, 1);
  const rate = WORK_KINDS.book.ratePerReach;
  // Fade: 14 unpromoted rollovers.
  const rolls = __roll(g, 14);
  const reach14 = w.reach;
  const inc14 = catalogIncomeForDay(g, g.meta.clock.day);
  // Re-processing the same day must not decay again (idempotent).
  const again = processWorksForDay(g, g.meta.clock.day);
  const reachAgain = w.reach;
  // 14 more.
  __roll(g, 14);
  const reach28 = w.reach;
  const inc28 = catalogIncomeForDay(g, g.meta.clock.day);
  // Promote: resets the clock, bumps by promoteBump × releaseReach(q, rep).
  __setRep(g, { writing: 45 });
  const energyBefore = g.player.energy; g.player.energy = 80;
  const blocksBefore = g.world.computer.apps.gigs.workBlocksToday || 0;
  const pr = promoteWork(g, 'syn_book', 'computer');
  const expectedBump = Math.round(WORKS_TUNING.promoteBump * WORK_KINDS.book.releaseReach(0.8, 45) * 100) / 100;
  const promoted = { ok: pr.ok, bump: pr.bump, expectedBump, reach: w.reach, lastPromotedDay: w.lastPromotedDay, day: g.meta.clock.day, energy: g.player.energy, blocksDelta: (g.world.computer.apps.gigs.workBlocksToday || 0) - blocksBefore };
  // Additive: a second work earns on top, the day's total is the sum.
  const w2 = __synthetic(g, 'syn_track', 'track', 0.6, 200);
  const both = catalogIncomeForDay(g, g.meta.clock.day);
  const expectedBoth = both.byWork.reduce((s, r) => s + r.amount, 0);
  return { d0: d0.total, d0Spike: d0.byWork[0].spike, expected0: 100 * 0.8 * rate, reach14, inc14: inc14.total, reachAgain, againCredited: again.income.credited, againDecayed: again.decayed.length, reach28, inc28: inc28.total, promoted, both: both.total, expectedBoth: Math.round(expectedBoth * 100) / 100, bothRows: both.byWork.map(r => [r.id, Math.round(r.amount * 100) / 100, r.spike]) };
})()`);
check(`day-0 income equals 100 × 0.8 × ratePerReach = ${syn.expected0} (no spike that day)`, syn.d0Spike === false && Math.abs(syn.d0 - syn.expected0) < 1e-9, JSON.stringify([syn.d0, syn.expected0, syn.d0Spike]));
check('after 14 unpromoted rollovers reach ≈ 50 (within 0.5)', Math.abs(syn.reach14 - 50) < 0.5, String(syn.reach14));
check('re-processing the same day decays nothing more (idempotent rollover) and credits nothing twice', syn.reachAgain === syn.reach14 && syn.againDecayed === 0 && syn.againCredited === 0, JSON.stringify([syn.reach14, syn.reachAgain, syn.againDecayed, syn.againCredited]));
check('after 28 days reach ≈ 25', Math.abs(syn.reach28 - 25) < 0.5, String(syn.reach28));
check(`a promotion bumps reach by exactly promoteBump × releaseReach(0.8, rep 45) = ${syn.promoted.expectedBump}, sets lastPromotedDay to today, spends a block of energy and counts a burnout block`, syn.promoted.ok && syn.promoted.bump === syn.promoted.expectedBump && Math.abs(syn.promoted.reach - (syn.reach28 + syn.promoted.expectedBump)) < 0.011 && syn.promoted.lastPromotedDay === syn.promoted.day && syn.promoted.energy < 80 && syn.promoted.blocksDelta === 1, JSON.stringify(syn.promoted));
check('two released works earn the SUM of both (catalog-additive; nothing caps it)', syn.bothRows.length === 2 && Math.abs(syn.both - syn.expectedBoth) < 1e-6, JSON.stringify([syn.both, syn.expectedBoth, syn.bothRows]));
console.log(`        baseline (Phase 4 obligation): synthetic book q 0.8 / reach 100 → day 0: ${syn.d0.toFixed(2)}/day (reach 100) · day 14: ${syn.inc14.toFixed(2)}/day (reach ${syn.reach14}) · day 28: ${syn.inc28.toFixed(2)}/day (reach ${syn.reach28})`);

// ---------------------------------------------------------------- 2
console.log('\n2. The spike roll — fires at spikeChance over 5,000 seeded days (±20%), ×spikeMult, deterministic per (seed, day, work)');
const spike = J(`(() => {
  const g = __mk(12, 1);
  const w = __synthetic(g, 'spk', 'book', 0.8, 100);
  let spikes = 0, base = 0, mult = 0;
  for (let d = 1; d <= 5000; d++) {
    const inc = catalogIncomeForDay(g, d);
    const row = inc.byWork[0];
    if (row.spike) { spikes++; mult = row.amount / (100 * 0.8 * WORK_KINDS.book.ratePerReach); } else base++;
  }
  const a = catalogIncomeForDay(g, 777).byWork[0].amount, b = catalogIncomeForDay(g, 777).byWork[0].amount;
  return { spikes, base, rate: spikes / 5000, mult, same: a === b };
})()`);
check(`spikes on ${spike.spikes}/5000 days — within ±20% of spikeChance 0.02`, spike.rate >= 0.016 && spike.rate <= 0.024, JSON.stringify(spike));
check('a spike day pays exactly ×spikeMult, and the roll is deterministic for a given day', Math.abs(spike.mult - 10) < 1e-9 && spike.same === true, JSON.stringify([spike.mult, spike.same]));

// ---------------------------------------------------------------- 3
console.log('\n3. The D19 gate — refused at writing 3 / rep 60 and at writing 5 / rep 30, accepted at 5 / 45; reasons named; the track kind needs its kit');
const gate = J(`(() => {
  const g = __mk(13, 1);
  const out = {};
  __setLevel(g, 'writing', 3); __setRep(g, { writing: 60 }); out.a = canRelease(g, 'book');
  __setLevel(g, 'writing', 5); __setRep(g, { writing: 30 }); out.b = canRelease(g, 'book');
  __setRep(g, { writing: 45 }); out.c = canRelease(g, 'book');
  __setLevel(g, 'music', 5); __setRep(g, { music: 50 }); out.trackNoKit = canRelease(g, 'track');
  // Place a recording kit anywhere: the requirement is met.
  const bucket = Object.keys(g.objects)[0];
  g.objects[bucket]['obj_kit_test'] = { id: 'obj_kit_test', defId: 'recording_kit', bucket, ownerId: 'player', state: {}, condition: 100, contents: [], evidence: null, discovered: {}, flags: {}, spawnedDay: 1, meta: null };
  out.trackWithKit = canRelease(g, 'track');
  out.unknown = canRelease(g, 'poem');
  // releaseWork enforces it: a finished book refused at the gate is untouched.
  __setLevel(g, 'writing', 5); __setRep(g, { writing: 30 });
  ensurePlayerWorks(g.player);
  g.player.works.push({ id: 'b1', kind: 'book', title: 'Gated', quality: 0.7, createdDay: 1, releasedDay: null, reach: 0, lastPromotedDay: null, lastDecayDay: 1, earned: 0, meta: {} });
  const refused = releaseWork(g, 'b1');
  __setRep(g, { writing: 45 });
  const moodBefore = (g.player.moodEvents || []).length;
  const accepted = releaseWork(g, 'b1');
  const w = g.player.works.find(x => x.id === 'b1');
  const twice = releaseWork(g, 'b1');
  return { ...out, refused: { ok: refused.ok, reason: refused.reason, releasedDay: g.player.works.find(x => x.id === 'b1').releasedDay === null || w.releasedDay }, accepted: { ok: accepted.ok, reach: accepted.reach, expected: WORK_KINDS.book.releaseReach(0.7, 45), releasedDay: w.releasedDay, lastPromotedDay: w.lastPromotedDay, moodMoved: (g.player.moodEvents || []).length > moodBefore }, twice: twice.ok };
})()`);
check('writing 3 / rep 60 → refused, naming the skill', gate.a.ok === false && gate.a.reasons.length === 1 && /writing skill 3\/4/.test(gate.a.reasons[0]), JSON.stringify(gate.a));
check('writing 5 / rep 30 → refused, naming the reputation', gate.b.ok === false && gate.b.reasons.length === 1 && /Writing reputation 30\/40/.test(gate.b.reasons[0]), JSON.stringify(gate.b));
check('writing 5 / rep 45 → accepted', gate.c.ok === true && gate.c.reasons.length === 0, JSON.stringify(gate.c));
check("a track at music 5 / rep 50 is refused without a placed recording_kit and accepted with one (D22's requires); an unknown kind is refused", gate.trackNoKit.ok === false && /recording kit/.test(gate.trackNoKit.reasons[0]) && gate.trackWithKit.ok === true && gate.unknown.ok === false, JSON.stringify([gate.trackNoKit, gate.trackWithKit, gate.unknown]));
check('releaseWork refuses at the gate with the reason and leaves the work unreleased; accepts at 5/45 with reach = releaseReach(q, rep), releasedDay = lastPromotedDay = today, a mood impulse; a second release is refused', gate.refused.ok === false && /Not yet/.test(gate.refused.reason) && gate.accepted.ok === true && gate.accepted.reach === gate.accepted.expected && gate.accepted.releasedDay === 1 && gate.accepted.lastPromotedDay === 1 && gate.accepted.moodMoved === true && gate.twice === false, JSON.stringify([gate.refused, gate.accepted, gate.twice]));

// ---------------------------------------------------------------- 4
console.log('\n4. Production — startWork/workBlock mirror a gig (D20/D4): progress formula, energy, burnout counter, device meter; quality fixed at finish; menu skips production');
const prod = J(`(() => {
  const g = __mk(14, 1);
  __setLevel(g, 'writing', 5);
  const bad = startWork(g, { kind: 'book', title: '   ' });
  const s = startWork(g, { kind: 'book', title: 'Tidewater' });
  const wip = s.wip;
  const gigs = g.world.computer.apps.gigs;
  g.player.energy = 90; g.player.mood = 0.5;
  const energyBefore = g.player.energy, blocksBefore = gigs.workBlocksToday || 0, devBefore = JSON.stringify(g.world.utilities);
  const focus = computeFocusMultiplier(g, 'computer');
  const expectedProgress = Math.round(focus * getBurnoutWorkPayMult(g.player) * GIG_TUNING.progressPerClick * 100) / 100;
  const r1 = workBlock(g, wip.id, 'computer');
  const step = { ok: r1.ok, progress: r1.progress, expectedProgress, done: wip.done, energyDelta: g.player.energy - energyBefore, expectedEnergy: -GIG_ENERGY_PER_BLOCK * needDecayScaleFor(g), blocksDelta: (gigs.workBlocksToday || 0) - blocksBefore, deviceMetered: JSON.stringify(g.world.utilities) !== devBefore, finished: r1.finished };
  // Phone is slower.
  const g2 = __mk(14, 1); __setLevel(g2, 'writing', 5); g2.player.energy = 90; g2.player.mood = 0.5;
  const s2 = startWork(g2, { kind: 'book', title: 'Phone draft' });
  const r2 = workBlock(g2, s2.wip.id, 'phone');
  // Finish it, then level the skill: quality must stay what it was at finish.
  let clicks = 1, last = r1;
  while (!last.finished) { g.player.energy = 90; last = workBlock(g, wip.id, 'computer'); clicks++; if (clicks > 200) break; }
  const work = last.work;
  const qualityAtFinish = work.quality, expectedQuality = Math.round(SKILL_CURVES.craftQuality[5] * 100) / 100;
  __setLevel(g, 'writing', 9);
  const qualityAfterLevel = g.player.works.find(w => w.id === work.id).quality;
  const again = workBlock(g, wip.id, 'computer');
  // menu: no blocksRange → straight into the catalog, unreleased.
  __setLevel(g, 'cooking', 5);
  const m = startWork(g, { kind: 'menu', title: 'Grandma\\'s stew' });
  // Seeded blocks: the same id on the same seed rolls the same count.
  const g3 = __mk(14, 1); __setLevel(g3, 'writing', 5); const s3 = startWork(g3, { kind: 'book', title: 'Other title' });
  return { bad: bad.ok, badReason: bad.reason, blocks: wip.blocks, inRange: wip.blocks >= 24 && wip.blocks <= 40, sameBlocks: s3.wip.blocks === wip.blocks, step, phoneSlower: r2.ok && r2.progress < r1.progress, clicks, finished: last.finished, qualityAtFinish, expectedQuality, qualityAfterLevel, wipLeft: g.player.workInProgress.length, inCatalog: g.player.works.filter(w => w.id === work.id).length, unreleased: work.releasedDay === null && work.reach === 0, again: again.ok, menu: m.ok && m.work && m.work.kind === 'menu' && m.work.releasedDay === null && g.player.workInProgress.every(w => w.kind !== 'menu'), ids: [work.id, m.work && m.work.id] };
})()`);
check('an empty title is refused; a book rolls 24–40 blocks, seeded on its id (same seed → same count)', prod.bad === false && /title/.test(prod.badReason) && prod.inRange && prod.sameBlocks, JSON.stringify([prod.bad, prod.badReason, prod.blocks, prod.sameBlocks]));
check('one workBlock click advances by focus × burnout × progressPerClick (workGigBlock\'s formula), spends GIG_ENERGY_PER_BLOCK × needDecayScale, adds the progress to gigs.workBlocksToday, and meters the device', prod.step.ok && prod.step.progress === prod.step.expectedProgress && Math.abs(prod.step.energyDelta - prod.step.expectedEnergy) < 1e-9 && Math.abs(prod.step.blocksDelta - prod.step.progress) < 1e-9 && prod.step.deviceMetered === true && prod.step.finished === false, JSON.stringify(prod.step));
check('working from the phone is slower (WORK_TUNING.phoneFocusMultiplier rides through computeFocusMultiplier)', prod.phoneSlower === true);
check(`finishing moves it from workInProgress to works, unreleased at reach 0, with quality FIXED at craftQuality[5] = ${prod.expectedQuality} — levelling writing to 9 afterward does not move it (D17)`, prod.finished === true && prod.qualityAtFinish === prod.expectedQuality && prod.qualityAfterLevel === prod.expectedQuality && prod.wipLeft === 0 && prod.inCatalog === 1 && prod.unreleased === true && prod.again === false, JSON.stringify({ clicks: prod.clicks, q: prod.qualityAtFinish, after: prod.qualityAfterLevel, wipLeft: prod.wipLeft, again: prod.again }));
check('a menu (no blocksRange) skips production and lands straight in the catalog unreleased; ids are sequential work_<n>', prod.menu === true && JSON.stringify(prod.ids) === JSON.stringify(['work_1', 'work_2']), JSON.stringify([prod.menu, prod.ids]));

// ---------------------------------------------------------------- 5
console.log('\n5. Money — the rollover credits whole dollars through EARN_MONEY; player.money moves by exactly the credited amount; taxes agree; the carry holds the fraction (D3, invariant 5)');
const money = J(`(() => {
  const g = __mk(15, 1);
  const w = __synthetic(g, 'm1', 'book', 0.8, 100);
  const moneyBefore = g.player.money;
  let credited = 0, total = 0, days = 0, log = [];
  for (let i = 0; i < 30; i++) {
    g.meta.clock.day += 1;
    const r = processWorksForDay(g, g.meta.clock.day);
    credited += r.income.credited; total += r.income.total; days++;
    if (log.length < 3) log.push([g.meta.clock.day, r.income.total, r.income.credited, g.player.catalogCarry]);
  }
  return { moneyDelta: g.player.money - moneyBefore, credited, gross: g.world.taxes.quarterGross, carry: g.player.catalogCarry, total: Math.round(total * 100) / 100, earned: w.earned, sumOk: Math.abs((credited + g.player.catalogCarry) - total) < 0.01, log };
})()`);
check(`over 30 days player.money moved by exactly the credited total (${money.credited}) and taxes.quarterGross agrees`, money.moneyDelta === money.credited && money.gross === money.credited && money.credited > 0, JSON.stringify(money));
check('credited + catalogCarry equals the fractional total to the cent; the carry stays in [0, 1); work.earned tracks the fractional amount', money.sumOk === true && money.carry >= 0 && money.carry < 1 && Math.abs(money.earned - money.total) < 0.02, JSON.stringify([money.credited, money.carry, money.total, money.earned]));
const earnPath = J(`(() => {
  const g = __mk(16, 1);
  __synthetic(g, 'm2', 'book', 1, 1000);   // $40/day — an integer credit every day
  const applied = [];
  const orig = applyEffects;
  applyEffects = (effects, ctx) => { applied.push(effects.map(e => e.type + ':' + JSON.stringify(e.params))); return orig(effects, ctx); };
  g.meta.clock.day = 2; const r = processWorksForDay(g, 2);
  applyEffects = orig;
  return { credited: r.income.credited, applied };
})()`);
check('the credit is an EARN_MONEY effect through applyEffects (the gig path), tagged catalog', earnPath.credited > 0 && earnPath.applied.length === 1 && /^EARN_MONEY:/.test(earnPath.applied[0][0]) && /catalog/.test(earnPath.applied[0][0]), JSON.stringify(earnPath));

// ---------------------------------------------------------------- 6
console.log('\n6. The tracker\'s Catalog line — derived from the same seeded call, absent when nothing is out');
const trk = J(`(() => {
  const g = __mk(17, 1);
  const none = trackerCatalog(g);
  __synthetic(g, 't1', 'book', 0.8, 100);
  g.meta.clock.day = 5;
  const entry = trackerCatalog(g);
  const inc = catalogIncomeForDay(g, 5);
  const inAll = buildTrackerEntries(g).some(e => e.kind === 'catalog');
  const notified = getTrackerNotifications(g).some(e => e.kind === 'catalog');
  return { none, entry, incTotal: inc.total, inAll, notified };
})()`);
check('no released work → no Catalog entry', trk.none === null);
check("with a released work: kind 'catalog', key 'catalog:<day>', urgency 10 (never a notification), detail naming today's rounded income and the title count, deep link to work/works", trk.entry && trk.entry.kind === 'catalog' && trk.entry.key === 'catalog:5' && trk.entry.urgency === 10 && trk.entry.detail.startsWith(`${Math.round(trk.incTotal)} today from 1 title`) && trk.entry.deepLink.screenId === 'works' && trk.inAll === true && trk.notified === false, JSON.stringify(trk));

// ---------------------------------------------------------------- 7
console.log('\n7. Save round-trip — player.works / workInProgress / catalogCarry / nextWorkSeq ride the player record byte-identical; lazy defaults on an old save; no new SAVE_KEYS entry');
const persist = J(`(() => {
  const g = __mk(18, 1);
  __setLevel(g, 'writing', 5);
  startWork(g, { kind: 'book', title: 'Half done' });
  workBlock(g, 'work_1', 'computer');
  __synthetic(g, 'syn', 'book', 0.8, 100);
  g.meta.clock.day = 2; processWorksForDay(g, 2);
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const p = rt.player && rt.player.player;
  const same = ['works', 'workInProgress', 'catalogCarry', 'catalogPaidDay', 'nextWorkSeq'].every(k => JSON.stringify(p[k]) === JSON.stringify(g.player[k]));
  // An old save: strip the fields and read through the engine.
  const old = { ...g.player }; delete old.works; delete old.workInProgress; delete old.catalogCarry; delete old.nextWorkSeq;
  const gOld = { ...g, player: old };
  const inc = catalogIncomeForDay(gOld, 3);
  const lazy = { works: Array.isArray(old.works) && old.works.length === 0, wip: Array.isArray(old.workInProgress), carry: old.catalogCarry === 0, incTotal: inc.total };
  const started = startWork(gOld, { kind: 'book', title: 'First on an old save' });
  return { same, savedWorks: p.works.length, savedWip: p.workInProgress.length, lazy, oldId: started.ok && started.wip.id, playerKeys: SAVE_KEYS.find(e => e.folder === 'player').keys };
})()`);
check('captureSavePayload → JSON carries works (1 released), workInProgress (1 half-done), catalogCarry and nextWorkSeq exactly as the live player', persist.same === true && persist.savedWorks === 1 && persist.savedWip === 1, JSON.stringify(persist));
check("a save without the fields reads as an empty catalog through ensurePlayerWorks (lazy defaults, no migration) and can start its first work as work_1", persist.lazy.works && persist.lazy.wip && persist.lazy.carry && persist.lazy.incTotal === 0 && persist.oldId === 'work_1', JSON.stringify(persist.lazy));
check("the player folder is still the single 'player' key — no parallel persisted field", JSON.stringify(persist.playerKeys) === JSON.stringify(['player']));

// ---------------------------------------------------------------- 8
console.log('\n8. Edges — promote refused on unreleased / piece / unknown; decayWorks leaves unreleased works alone; ui.js wires the rollover and the three verbs');
const edge = J(`(() => {
  const g = __mk(19, 1);
  ensurePlayerWorks(g.player);
  g.player.works.push({ id: 'u1', kind: 'book', title: 'Unreleased', quality: 0.7, createdDay: 1, releasedDay: null, reach: 0, lastPromotedDay: null, lastDecayDay: 1, earned: 0, meta: {} });
  __synthetic(g, 'p1', 'piece', 0.9, 0);
  const a = promoteWork(g, 'u1'), b = promoteWork(g, 'p1'), c = promoteWork(g, 'nope');
  g.meta.clock.day = 10; const moved = decayWorks(g, 10);
  const inc = catalogIncomeForDay(g, 10);
  return { a: a.ok, b: b.ok, bReason: b.reason, c: c.ok, moved: moved.length, unreleasedReach: g.player.works[0].reach, incRows: inc.byWork.length };
})()`);
check('promoteWork refuses an unreleased work, a piece (no audience to grow), and an unknown id', edge.a === false && edge.b === false && /no audience/.test(edge.bReason) && edge.c === false, JSON.stringify(edge));
check('decayWorks moves nothing for an unreleased work or a reach-0 piece, and neither earns', edge.moved === 0 && edge.unreleasedReach === 0 && edge.incRows === 0, JSON.stringify(edge));
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
check("ui.js's processDayRollover calls processWorksForDayUi beside processGigsForDay, dispatches works.block/release/promote, and exempts only works.release from the energy gate", /processGigsForDay\(day\);\r?\n[\s\S]{0,400}processWorksForDayUi\(day\);/.test(uiSrc) && /case 'works\.block':/.test(uiSrc) && /case 'works\.release':/.test(uiSrc) && /case 'works\.promote':/.test(uiSrc) && /'works\.release',/.test(uiSrc) && !/'works\.block',/.test(uiSrc) && !/'works\.promote',/.test(uiSrc));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
