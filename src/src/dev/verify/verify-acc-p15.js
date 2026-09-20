// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 15:
// Independence & the economy audit (D1, D50, D104–D105).
//
//   node src/src/dev/verify/verify-acc-p15.js
//
// Node coverage: ECONOMY.independence; the income ledger (applyEarnMoney
// writes { day, amount, reason } for every EARN_MONEY, capped); the solo
// cost (rent at ECONOMY.rent.total — never the roommate-offset playerShare,
// asserted against computeRent with zero and with three roommates — plus
// the even-split utilities at base, the personal bills, the groceries
// baseline); the window income filtered to the independent reasons (a
// loan, a debt collected and a rent surplus never count); the index's
// ratio and `qualifies`; the weekly count on the rent cadence (a
// qualifying window +1, a failing one → 0, idempotent between cadence
// days, the ledger pruned past ledgerDays); the three scripted 52-week
// runs — a focused WRITER (writing 10, writing rep 100: four clicks a day
// on the current book, two on writing gigs, one promotion; every finished
// book released), a focused CREATOR (music 8 with a recording kit, social
// 8: a daily craft post, tracks recorded and released, music gigs, the
// platform billing every cycle) and a DABBLER (writing 3, no reputation:
// seven clicks a day on whatever gigs the board offers) — the week each
// first qualifies is RECORDED (the writer and creator may or may not; the
// numbers are the deliverable), the dabbler must never; the independence
// milestones reading independenceWeeks; and the save round-trip of the
// ledger + the count. The rollover log lines are checked on the live page
// (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'image.js', 'chatter.js',
    'platform.js', 'aspirations.js', 'tracker.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');

api(`
  __mk = (seed, residents, day) => {
    const h = SIM_generateHouse(seed || 20260918, residents == null ? 3 : residents);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: { contentFlags: { mature: true } }, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    return g;
  };
  __earn = (g, amount, reason) => applyEffects(parseEffectDSL('EARN_MONEY ' + amount + ' ' + reason), buildEffectContext(g, [], [], {}, []));
  __level = (g, skill, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skill] = SKILLS.xpPerLevelBase * level * level; };
  __placeKit = (g) => { g.objects.room_bedroom_player = g.objects.room_bedroom_player || {}; g.objects.room_bedroom_player.kit_sim = { id: 'kit_sim', defId: 'recording_kit', bucket: 'room_bedroom_player', pos: { x: 1, y: 1, w: 2, h: 2, rot: 0 }, state: {}, condition: 100, contents: [], flags: {}, meta: {} }; };
  // One persona's day: the rollover pieces the real processDayRollover runs (gigs, works, platform, independence, burnout), then the clicks.
  __rollover = (g, day) => {
    g.meta.clock.day = day; g.player.energy = g.player.energyMax || NEEDS.energy.max; g.player.location = 'bedroom_player';
    generateGigsForDay(g, day); processGigDeadlinesForDay(g, day);
    processWorksForDay(g, day); processPlatformForDay(g, day);
    const r = processIndependenceForDay(g, day);
    const gigs = g.world.computer.apps.gigs; updateBurnout(g.player, day, gigs.workBlocksToday || 0); gigs.workBlocksToday = 0;
    return r;
  };
  __gigClicks = (g, n, categories) => {
    const gigs = g.world.computer.apps.gigs;
    // One gig at a time, and only one this persona can finish before its deadline at n clicks a day (2 blocks a click) — nobody sane accepts three and misses two.
    if (gigs.accepted.length === 0) {
      const day = g.meta.clock.day;
      const pick = gigs.board.filter(b => (!categories || categories.includes(b.category)) && b.blocks <= n * 2 * Math.max(1, b.deadlineDay - day)).sort((a, b) => b.payout / b.blocks - a.payout / a.blocks)[0];
      if (pick) acceptGig(g, pick.gigId);
    }
    let clicks = 0;
    for (const a of [...gigs.accepted]) {
      while (clicks < n && a.blocksDone < a.blocks) { workGigBlock(g, a.gigId); clicks++; }
      if (a.blocksDone >= a.blocks) deliverGig(g, a.gigId);
      if (clicks >= n) break;
    }
    return clicks;
  };
  __bookClicks = (g, n, kind) => {
    const player = ensurePlayerWorks(g.player);
    let wip = player.workInProgress[0];
    if (!wip) { const r = startWork(g, { kind, title: kind + ' ' + (player.works.length + 1) }); if (!r.ok) return 0; wip = r.wip; }
    for (let i = 0; i < n; i++) { const r = workBlock(g, wip.id); if (r.finished) { releaseWork(g, r.work.id); break; } }
    return n;
  };
  __promoteOne = (g) => { const w = ensurePlayerWorks(g.player).works.filter(x => x.releasedDay != null).sort((a, b) => a.reach - b.reach)[0]; if (w) promoteWork(g, w.id); };
  __run = (persona, weeks, seed) => {
    const g = __mk(seed || 11, 0, 1); const p = ensurePlayerWorks(g.player);
    setChatterHandle(g, 'runner'); g.player.rentDueDay = 8;
    if (persona === 'writer') { __level(g, 'writing', 10); g.world.computer.apps.gigs.reputation.writing = 100; }
    if (persona === 'creator') { __level(g, 'music', 8); __level(g, 'social', 8); g.world.computer.apps.gigs.reputation.music = 80; __placeKit(g); }
    if (persona === 'dabbler') { __level(g, 'writing', 3); }
    if (persona === 'stacked') { __level(g, 'writing', 10); __level(g, 'social', 6); g.world.computer.apps.gigs.reputation.writing = 100; }
    const weekly = []; let firstQualifies = null; let maxRatio = 0;
    for (let day = 1; day <= weeks * 7; day++) {
      const r = __rollover(g, day);
      if (r) { weekly.push({ day, ratio: r.index.ratio, weeks: r.weeks, income: r.index.income, cost: r.index.cost }); maxRatio = Math.max(maxRatio, r.index.ratio); if (r.index.qualifies && firstQualifies == null) firstQualifies = Math.ceil(day / 7); }
      if (persona === 'writer') { __bookClicks(g, 4, 'book'); __gigClicks(g, 2, ['writing']); __promoteOne(g); }
      if (persona === 'creator') { postChatterAsPlayer(g, 'studio day ' + day, day, { source: { kind: 'skill', skillId: 'music' } }); __bookClicks(g, 3, 'track'); __gigClicks(g, 3, ['music']); __promoteOne(g); }
      if (persona === 'dabbler') { __gigClicks(g, 7, null); }
      if (persona === 'stacked') { postChatterAsPlayer(g, 'pages ' + day, day, { source: { kind: 'skill', skillId: 'writing' } }); __bookClicks(g, 3, 'book'); __gigClicks(g, 3, ['writing']); __promoteOne(g); }
    }
    const last = weekly[weekly.length - 1] || {};
    return { persona, firstQualifies, maxRatio: Math.round(maxRatio * 100) / 100, last, works: p.works.length, released: p.works.filter(w => w.releasedDay != null).length, followers: Math.round(ensureChatterProfile(g).ghostFollowers), backers: ensureChatterProfile(g).backers.ghosts, money: Math.round(g.player.money), byReason: independenceIndex(g, weeks * 7).byReason, independenceWeeks: g.player.independenceWeeks, burnout: g.player.burnout && Math.round(g.player.burnout.burnoutLevel * 100) / 100 };
  };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. The dials and the ledger. ${loaded.length} engine files loaded.`);
const I = J('ECONOMY.independence');
check('ECONOMY.independence: a 4-week window, a groceries baseline, the independent reasons (gig/gig_partial/catalog/chatter/art_sale/kitchen), a ledger horizon and cap', I.windowWeeks === 4 && I.groceriesWeekly > 0 && ['gig', 'gig_partial', 'catalog', 'chatter', 'art_sale', 'kitchen'].every(r => I.incomeReasons.includes(r)) && !I.incomeReasons.includes('rent_surplus') && !I.incomeReasons.includes('loan') && I.ledgerDays >= 28 && I.ledgerCap > 0, JSON.stringify(I));
const fns = J(`['independenceCost','independenceIncome','independenceIndex','processIndependenceForDay'].filter(n => typeof globalThis[n] !== 'function')`);
check('every Phase 15 function exists', fns.length === 0, `missing: ${fns.join(', ')}`);
const ledger = J(`(() => {
  const g = __mk(1, 0, 5); const out = {};
  out.before = Array.isArray(g.player.incomeLog) ? g.player.incomeLog.length : null;
  __earn(g, 120, 'gig'); __earn(g, 15, 'catalog'); __earn(g, 300, 'loan from Sam'); __earn(g, 40, 'rent_surplus');
  out.log = g.player.incomeLog.slice(); out.money = g.player.money;
  for (let i = 0; i < ECONOMY.independence.ledgerCap + 50; i++) __earn(g, 1, 'gig');
  out.capped = g.player.incomeLog.length === ECONOMY.independence.ledgerCap;
  return out;
})()`);
check("applyEarnMoney writes the ledger { day, amount, reason } for every credit (a loan's reason is its first word), money still moves, the ring is capped", ledger.before === null && ledger.log.length === 4 && ledger.log[0].reason === 'gig' && ledger.log[0].amount === 120 && ledger.log[0].day === 5 && ledger.log[2].reason === 'loan' && ledger.log[3].reason === 'rent_surplus' && ledger.money === 3800 + 475 && ledger.capped === true, JSON.stringify({ ...ledger, log: ledger.log.slice(0, 4) }));

// ---------------------------------------------------------------- 1
console.log('\n1. Solo cost — no roommate offsets (D50)');
const cost = J(`(() => {
  const g0 = __mk(2, 0, 1); const g3 = __mk(2, 3, 1); const out = {};
  const days = ECONOMY.independence.windowWeeks * ECONOMY.payPeriodDays;
  out.c0 = independenceCost(g0, days); out.c3 = independenceCost(g3, days);
  out.rent0 = computeRent(g0.npcs, g0).playerShare; out.rent3 = computeRent(g3.npcs, g3).playerShare;
  out.weeks = ECONOMY.independence.windowWeeks; out.rentTotal = ECONOMY.rent.total;
  return out;
})()`);
check(`the solo cost is identical with zero and with three roommates (rent ${cost.c0.rent} = ${cost.weeks} × ${cost.rentTotal}) while computeRent's playerShare differs (${cost.rent0} vs ${cost.rent3}); bills + groceries added`, JSON.stringify(cost.c0) === JSON.stringify(cost.c3) && cost.c0.rent === cost.weeks * cost.rentTotal && cost.rent3 < cost.rent0 && cost.c0.bills > 0 && cost.c0.groceries === I.groceriesWeekly * cost.weeks && cost.c0.total === cost.c0.rent + cost.c0.bills + cost.c0.groceries, JSON.stringify(cost));

// ---------------------------------------------------------------- 2
console.log('\n2. The index and the weekly count (D50)');
const idx = J(`(() => {
  const g = __mk(3, 0, 1); const out = {}; g.player.rentDueDay = 8;
  const days = ECONOMY.independence.windowWeeks * ECONOMY.payPeriodDays;
  const cost = independenceCost(g, days).total;
  // a month of income: half from gigs, a quarter catalog, a quarter chatter; plus a loan and a surplus that must not count
  for (let d = 1; d <= days; d++) { g.meta.clock.day = d; __earn(g, Math.ceil(cost / days / 2), 'gig'); __earn(g, Math.ceil(cost / days / 4), 'catalog'); __earn(g, Math.ceil(cost / days / 4), 'chatter'); }
  g.meta.clock.day = days; __earn(g, 5000, 'loan from Sam'); __earn(g, 900, 'rent_surplus');
  const ix = independenceIndex(g, days); out.ratio = ix.ratio; out.qualifies = ix.qualifies; out.byReason = ix.byReason; out.income = ix.income; out.cost = ix.cost;
  out.outsideWindow = independenceIncome(g, days + 100, days).total;
  // the weekly count on the rent cadence
  const g2 = __mk(4, 0, 1); g2.player.rentDueDay = 8; const cost2 = independenceCost(g2, days).total;
  const seq = [];
  for (let d = 1; d <= 70; d++) {
    g2.meta.clock.day = d;
    const r = processIndependenceForDay(g2, d);
    if (r) seq.push({ d, w: r.weeks, q: r.index.qualifies, reset: r.reset });
    // income: enough for the first five weeks, nothing after
    if (d <= 35) __earn(g2, Math.ceil(cost2 / 28) + 1, 'gig');
  }
  out.seq = seq; out.between = processIndependenceForDay(g2, 70); out.weeks = g2.player.independenceWeeks; out.next = g2.player.independenceNextDay;
  out.pruned = g2.player.incomeLog.every(e => 71 - e.day <= ECONOMY.independence.ledgerDays + 1);
  return out;
})()`);
check('the index sums only the independent reasons over the window (a loan and a rent surplus excluded), ratio ≈ 1 and qualifies; income outside the window is zero', Math.abs(idx.ratio - 1) < 0.05 && idx.qualifies === true && idx.byReason.gig > 0 && idx.byReason.catalog > 0 && idx.byReason.chatter > 0 && !('loan' in idx.byReason) && !('rent_surplus' in idx.byReason) && idx.outsideWindow === 0, JSON.stringify(idx));
check('the count moves on the rent cadence only: the first cycles under-funded read 0, then qualifying weeks count up consecutively, a failing window resets to 0 (reset flagged once), nothing between cadence days, the ledger pruned', idx.seq.length === 9 && idx.seq.every((s, i) => i === 0 || s.d - idx.seq[i - 1].d === 7) && idx.seq.some(s => s.w >= 2) && idx.seq.some(s => s.reset === true) && idx.seq[idx.seq.length - 1].w === 0 && idx.between === null && idx.weeks === 0 && idx.pruned === true, JSON.stringify(idx.seq));

// ---------------------------------------------------------------- 3
console.log('\n3. The three scripted 52-week runs — recorded (D1/D50)');
const runs = J(`[__run('writer', 52, 11), __run('creator', 52, 12), __run('dabbler', 52, 13), __run('stacked', 52, 14)]`);
for (const r of runs) console.log(`        ${r.persona}: first qualifying week ${r.firstQualifies == null ? 'never' : r.firstQualifies}; max ratio ${r.maxRatio}; last window ${JSON.stringify(r.last)}; works ${r.works}/${r.released} released; followers ${r.followers}; backers ${r.backers}; money ${r.money}; byReason ${JSON.stringify(r.byReason)}; burnout ${r.burnout}`);
const writer = runs[0], creator = runs[1], dabbler = runs[2], stacked = runs[3];
check(`the dabbler (writing 3, gigs only, seven clicks a day, reputation climbing to Elite) never qualifies over 52 weeks (max ratio ${dabbler.maxRatio}) — gigs alone never cover a solo lease`, dabbler.firstQualifies == null && dabbler.maxRatio < 1, JSON.stringify(dabbler));
check(`the catalog-only writer (writing 10, rep 100, ${writer.released} books, two gig clicks a day) never qualifies either (max ratio ${writer.maxRatio}) — an independent stream alone is worse than the gig grind (D1's "early on")`, writer.firstQualifies == null && writer.maxRatio < 1 && writer.byReason.catalog > 0, JSON.stringify(writer));
check(`the full stack qualifies and holds: the creator (music 8 + rep 80 + tracks + a following fed daily) first qualifies at week ${creator.firstQualifies} and the stacked writer (writing 10 + rep 100 + books + a following) at week ${stacked.firstQualifies} — both through the platform on top of the catalog and gigs`, creator.firstQualifies != null && creator.firstQualifies >= 12 && stacked.firstQualifies != null && stacked.firstQualifies >= 12 && creator.byReason.chatter > 0 && creator.byReason.catalog > 0 && stacked.byReason.chatter > 0 && stacked.byReason.catalog > 0 && creator.independenceWeeks > 0, JSON.stringify([creator, stacked]));

// ---------------------------------------------------------------- 4
console.log('\n4. The milestones read the count; save round-trip');
const ms = J(`(() => {
  const g = __mk(5, 0, 3); chooseDirections(g, ['independence']);
  g.player.independenceWeeks = 4; const r = checkAspirations(g, 3);
  const payload = captureSavePayload(g); __earn(g, 10, 'gig'); const payload2 = JSON.parse(JSON.stringify(captureSavePayload(g)));
  return { completed: r.completed.map(c => c.id), weeks: payload2.player.player.independenceWeeks, log: payload2.player.player.incomeLog.length };
})()`);
check("independenceWeeks 4 completes 'Cover a week' and 'Four weeks running' (not eight); the count and the ledger ride the player record through captureSavePayload", ms.completed.includes('ind_week1') && ms.completed.includes('ind_week4') && !ms.completed.includes('ind_week8') && ms.weeks === 4 && ms.log === 1, JSON.stringify(ms));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
