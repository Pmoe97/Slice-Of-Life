// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 10: growth,
// Backers, and platform perception (D29, D32, D34, D36, D37, D42, D88–D90).
//
//   node src/src/dev/verify/verify-acc-p10.js
//
// Node coverage for everything pure in this phase: the tuning block
// (CHATTER_PLATFORM's growth/billing/slot dials all present and sane);
// postAppeal — pure and seeded (same post, same number), higher for a
// higher craft skill, the cadence bonus only inside cadenceDays, lifestyle
// content reading the social skill's edge; applyGrowth — 30 days of daily
// posting at craft skill 6 ends with more ghost followers than at skill 2,
// growth compounding on the following, the log capped; ghostDecay — 30
// quiet days lose the configured fraction, idempotent per day, no decay on
// a posting day; the viral roll firing at its rate over 10k seeded posts;
// npcSlots — the D42 table, a low/frugal NPC never above 1; the subscribe
// decision (must follow, must have a slot, blocked → 0) and
// deriveSubscribers (ghost Backers = floor(followers × conv), a lapse
// returning the slot); billSubscriptions — income = count × price through
// EARN_MONEY (money and taxes.quarterGross both move), idempotent per day,
// the rent cadence; setChatterPrice clamped to D32's bounds; perception by
// scrolling — an NPC with scroll_phone yesterday holds an opinion fact
// about yesterday's post, one without does not, a blocked or non-following
// NPC never, a post seen once is never noticed twice; the ghost comment
// (D90) stored as a seed, never a name; the tracker line; and a save
// round-trip of profile (growthLog, prices, billing day) + npc.chatter
// (seenPostIds, slotsUsed). The profile's Followers/Backers, the price
// setter, the notifications list and the composer's About select are
// verified on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'image.js', 'chatter.js', 'platform.js', 'tracker.js', 'state.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    setChatterHandle(g, 'tester');
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  __setLevel = (g, skillId, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skillId] = SKILLS.xpPerLevelBase * level * level; };
  __follow = (g, npcId) => { const c = ensureNpcChatter(g.npcs[npcId], g); c.followsPlayer = true; const p = ensureChatterProfile(g); if (!p.castFollowers.includes(npcId)) p.castFollowers.push(npcId); };
  __scroll = (g, npcId, day) => g.world.events.push({ day, tick: 5, roomId: 'living_room', npcId, type: 'scroll_phone', moodDelta: 0, data: {}, template: '{name} scrolled through their phone for a while.', seenByPlayer: false });
  __postKey = (post) => noticeSubjectKey({ kind: 'chatter_post', ref: post.id });
  // Thirty days of one public post a day about a craft skill; returns the ghost following at the end.
  __run30 = (seed, skillId, level) => {
    const g = __mk(seed, 3); __setLevel(g, skillId, level);
    for (let d = 3; d < 33; d++) { postChatterAsPlayer(g, 'day ' + d + ' practice', d, { source: { kind: 'skill', skillId } }); ghostDecay(g, d + 1); }
    return ensureChatterProfile(g).ghostFollowers;
  };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration and the tuning block. ${loaded.length} engine files loaded.`);
const T = J('CHATTER_PLATFORM');
check('CHATTER_PLATFORM carries the growth dials (appealBase per content kind, cadence, roll, growthK/Exp, viral, decay)', T.appealBase && T.appealBase.lifestyle < T.appealBase.craft && T.appealBase.craft < T.appealBase.work && T.cadenceDays > 0 && T.cadenceBonus > 1 && T.appealRoll[0] < 1 && T.appealRoll[1] > 1 && T.growthK > 0 && T.growthExp > 0 && T.growthExp < 1 && T.viralChance > 0 && T.viralChance < 0.05 && T.viralMult > 1 && T.ghostDecayPerDay > 0 && T.ghostDecayPerDay < 0.05, JSON.stringify(T));
check('… and the billing/slot dials (convBackers, price bounds, subscribe chance, lapse, slot table capped at 4)', T.convBackers > 0 && T.convBackers < 0.2 && T.backersPriceBounds[0] < T.backersPriceBounds[1] && T.privatePriceBounds[0] < T.privatePriceBounds[1] && T.subscribeBase > 0 && T.subscribeAffinity > 0 && T.lapseBelowAffinity < 0 && T.slotsByIncome.low === 0 && T.slotsByLean.frugal === 0 && T.slotsCap === 4);
check('CHATTER_GHOST_COMMENTS is a non-empty pool of strings (D90)', J('Array.isArray(CHATTER_GHOST_COMMENTS) && CHATTER_GHOST_COMMENTS.length >= 6 && CHATTER_GHOST_COMMENTS.every(s => typeof s === "string" && s.length > 0)'));
const fns = J(`['postContentKind','postAppeal','applyGrowth','ghostDecay','npcSlots','castSubscribeDecision','deriveSubscribers','billSubscriptions','setChatterPrice','ghostConversion','processPlatformBillingForDay','npcScrolledOn','platformPerceiversFor','applyPlatformPerceptionForDay','processPlatformForDay','trackerPlatform'].filter(n => typeof globalThis[n] !== 'function')`);
check('every Phase 10 function exists', fns.length === 0, `missing: ${fns.join(', ')}`);
const platSrc = fs.readFileSync(path.join(SRC, 'platform.js'), 'utf8');
check('platform.js stores no ghost name anywhere — growthLog lines and ghost comments carry seeds/ids only (invariant 9)', !/ghostName|ghostHandles\s*[:=]|handles\s*:\s*\[/.test(platSrc) && /growthLog\.unshift\(\{ day: post\.day, postId: post\.id, gained, viral \}\)/.test(platSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. postAppeal — pure, seeded, skill-aware, cadence-aware (D29)');
const ap = J(`(() => {
  const g = __mk(1); const out = {};
  const mkPost = (id, day, source) => ({ id, author: 'player', text: 'x', day, visibility: 'public', meta: { source } });
  out.same = postAppeal(g, mkPost('post_9', 3, { kind: 'skill', skillId: 'music' })) === postAppeal(g, mkPost('post_9', 3, { kind: 'skill', skillId: 'music' }));
  __setLevel(g, 'music', 2); out.lvl2 = postAppeal(g, mkPost('post_9', 3, { kind: 'skill', skillId: 'music' }));
  __setLevel(g, 'music', 6); out.lvl6 = postAppeal(g, mkPost('post_9', 3, { kind: 'skill', skillId: 'music' }));
  __setLevel(g, 'music', 10); out.lvl10 = postAppeal(g, mkPost('post_9', 3, { kind: 'skill', skillId: 'music' }));
  out.lifestyle = postAppeal(g, mkPost('post_9', 3, null));
  __setLevel(g, 'social', 8); out.lifestyleSocial = postAppeal(g, mkPost('post_9', 3, null));
  const p = ensureChatterProfile(g);
  p.lastPostDay = 2; out.cadenced = postAppeal(g, mkPost('post_9', 3, null));
  p.lastPostDay = 3 - CHATTER_PLATFORM.cadenceDays - 1; out.stale = postAppeal(g, mkPost('post_9', 3, null));
  out.kinds = [postContentKind(g, mkPost('a', 3, null)).kind, postContentKind(g, mkPost('a', 3, { kind: 'skill', skillId: 'art' })).kind, postContentKind(g, mkPost('a', 3, { kind: 'skill', skillId: 'nope' })).kind];
  return out;
})()`);
check('the same post appeals the same twice (seeded on the post id)', ap.same === true);
check('craft appeal rises with the craft skill: level 2 < 6 < 10', ap.lvl2 < ap.lvl6 && ap.lvl6 < ap.lvl10, JSON.stringify(ap));
check('lifestyle content reads the social skill (socialEdge): a social-8 player appeals more', ap.lifestyleSocial > ap.lifestyle, JSON.stringify(ap));
check(`a post within cadenceDays of the last earns the ${T.cadenceBonus}× bonus; one after the window does not`, Math.abs(ap.cadenced / ap.stale - T.cadenceBonus) < 0.02, JSON.stringify(ap));
check('postContentKind: no source → lifestyle, a real skill → craft, an unknown skill → lifestyle', ap.kinds.join(',') === 'lifestyle,craft,lifestyle', ap.kinds.join(','));

// ---------------------------------------------------------------- 2
console.log('\n2. applyGrowth and ghostDecay — 30 days at skill 6 vs 2, quiet-day decay (D29)');
const curves = J(`(() => {
  const out = { s2: [], s6: [] };
  for (const seed of [11, 12, 13]) { out.s2.push(__run30(seed, 'music', 2)); out.s6.push(__run30(seed, 'music', 6)); }
  return out;
})()`);
check(`30 days of daily posting at craft skill 6 ends with more ghost followers than at skill 2 (three seeds: ${curves.s6.map(Math.round).join('/')} vs ${curves.s2.map(Math.round).join('/')})`, curves.s6.every((v, i) => v > curves.s2[i]), JSON.stringify(curves));
const gr = J(`(() => {
  const g = __mk(2); const p = ensureChatterProfile(g); const out = {};
  const r1 = postChatterAsPlayer(g, 'one', 3, {}); out.g1 = r1.growth.gained; out.f1 = p.ghostFollowers;
  p.ghostFollowers = 400;
  const r2 = postChatterAsPlayer(g, 'two', 4, {}); out.g2 = r2.growth.gained;
  out.logLen = p.growthLog.length; out.logTop = p.growthLog[0];
  for (let i = 0; i < CHATTER_PLATFORM.growthLogCap + 5; i++) postChatterAsPlayer(g, 'n' + i, 5 + i, {});
  out.logCapped = p.growthLog.length === CHATTER_PLATFORM.growthLogCap;
  const rp = postChatterAsPlayer(g, 'private one', 40, { visibility: 'private' });
  out.privateRefused = rp.ok === false;
  return out;
})()`);
check('growth compounds on the following: the same kind of post gains far more at 400 followers than at 0', gr.g2 > gr.g1 * 5 && gr.f1 === gr.g1, JSON.stringify(gr));
check(`growthLog is a capped ring (newest first, ${T.growthLogCap} lines) of { day, postId, gained, viral }`, gr.logTop && gr.logTop.postId === 'post_2' && gr.logCapped === true && typeof gr.logTop.viral === 'boolean', JSON.stringify(gr));
const dec = J(`(() => {
  const g = __mk(3); const p = ensureChatterProfile(g); const out = {};
  p.ghostFollowers = 1000; p.lastPostDay = 3;
  out.postingDay = ghostDecay(g, 4);
  let total = 0; for (let d = 5; d < 35; d++) total += ghostDecay(g, d);
  out.after30 = p.ghostFollowers; out.total = total;
  out.again = ghostDecay(g, 34);
  out.expected = 1000 * Math.pow(1 - CHATTER_PLATFORM.ghostDecayPerDay, 30);
  return out;
})()`);
check(`30 quiet days decay the ghost following by the configured fraction ((1-${T.ghostDecayPerDay})^30 → ${dec.expected.toFixed(1)}; got ${dec.after30})`, Math.abs(dec.after30 - dec.expected) < 2, JSON.stringify(dec));
check('no decay on the day after a post; a day already decayed is not decayed twice', dec.postingDay === 0 && dec.again === 0, JSON.stringify(dec));
const viral = J(`(() => {
  const g = __mk(4); const p = ensureChatterProfile(g); let hits = 0;
  for (let i = 0; i < 10000; i++) { p.ghostFollowers = 0; const r = applyGrowth(g, { id: 'v_' + i, author: 'player', text: 'x', day: 3, visibility: 'public', meta: { source: null }, appeal: 1 }); if (r.viral) hits++; }
  return { hits, rate: hits / 10000 };
})()`);
check(`the viral roll fires at its rate over 10k seeded posts (${(viral.rate * 100).toFixed(2)}% vs ${T.viralChance * 100}%)`, Math.abs(viral.rate - T.viralChance) < T.viralChance * 0.4, JSON.stringify(viral));

// ---------------------------------------------------------------- 3
console.log('\n3. npcSlots and the subscribe decision (D36, D42)');
const slots = J(`(() => {
  const mk = (incomeBand, spendingLean) => ({ bible: { occupation: { incomeBand, spendingLean } } });
  const table = {};
  for (const inc of ['low', 'mid', 'high']) for (const lean of ['frugal', 'neutral', 'free_spender']) table[inc + '/' + lean] = npcSlots(mk(inc, lean));
  table['missing'] = npcSlots({ bible: {} });
  return table;
})()`);
check('a low/frugal NPC never exceeds 1 slot; mid/neutral 1–2; high/free_spender up to 4 (capped)', slots['low/frugal'] <= 1 && slots['mid/neutral'] >= 1 && slots['mid/neutral'] <= 2 && slots['high/free_spender'] === 4 && Object.values(slots).every(v => v >= 0 && v <= 4), JSON.stringify(slots));
check('an NPC with no occupation record gets the mid/neutral default', slots.missing === slots['mid/neutral'], JSON.stringify(slots));
const sub = J(`(() => {
  const g = __mk(5); const res = __residents(g); const out = {};
  out.noFollow = castSubscribeDecision(g, res[0], () => 0).chance;
  __follow(g, res[0]); out.follows = castSubscribeDecision(g, res[0], () => 0);
  const c = ensureNpcChatter(g.npcs[res[0]], g); c.slotsUsed = npcSlots(g.npcs[res[0]]); out.full = castSubscribeDecision(g, res[0], () => 0); c.slotsUsed = 0;
  __follow(g, res[1]); blockNpc(g, res[1]); out.blocked = castSubscribeDecision(g, res[1], () => 0).chance;
  out.unknown = castSubscribeDecision(g, 'npc_nobody', () => 0).chance;
  return out;
})()`);
check('the subscribe decision: chance 0 without following, without a free slot, when blocked, or unknown; a follower with a slot has a real chance', sub.noFollow === 0 && sub.follows.chance > 0 && sub.follows.subscribe === true && sub.full.chance === 0 && /no free slot/.test(sub.full.reasons[0]) && sub.blocked === 0 && sub.unknown === 0, JSON.stringify(sub));

// ---------------------------------------------------------------- 4
console.log('\n4. deriveSubscribers and billSubscriptions — Backers = floor(followers × conv), income = count × price (D32, D34)');
const bill = J(`(() => {
  const g = __mk(6); const res = __residents(g); const p = ensureChatterProfile(g); const out = {};
  p.ghostFollowers = 333; for (const id of res) __follow(g, id);
  const pools = deriveSubscribers(g, 10); out.ghosts = pools.ghosts; out.expectedGhosts = Math.floor(333 * CHATTER_PLATFORM.convBackers); out.castN = pools.cast.length;
  const m0 = g.player.money; const q0 = (g.world.taxes && g.world.taxes.quarterGross) || 0;
  const b = billSubscriptions(g, 10);
  out.credited = b.credited; out.expected = (pools.ghosts + pools.cast.length) * p.backersPrice; out.moneyDelta = g.player.money - m0; out.grossDelta = g.world.taxes.quarterGross - q0;
  out.rebill = billSubscriptions(g, 10).credited;
  // a lapse: force the first cast backer cold and re-derive
  if (pools.cast.length > 0) { const id = pools.cast[0]; const c = ensureNpcChatter(g.npcs[id], g); const used = c.slotsUsed; blockNpc(g, id); const again = deriveSubscribers(g, 25); out.lapsed = !again.cast.includes(id) && c.subscribes === null && c.slotsUsed === used - 1; }
  else out.lapsed = 'n/a';
  // the price setter and its bounds
  out.priceHigh = setChatterPrice(g, 'backers', 999); out.priceLow = setChatterPrice(g, 'backers', -4); out.priceBad = setChatterPrice(g, 'backers', 'abc').ok; out.priceTier = setChatterPrice(g, 'gold', 5).ok;
  out.privateSet = setChatterPrice(g, 'private', 12).price;
  // D91: conversion is price-sensitive — dearer converts fewer, nets more
  p.ghostFollowers = 2000; setChatterPrice(g, 'backers', CHATTER_PLATFORM.backersPriceDefault); out.convDefault = ghostConversion(g, 'backers'); const atDefault = deriveSubscribers(g, 30).ghosts;
  setChatterPrice(g, 'backers', CHATTER_PLATFORM.backersPriceBounds[1]); out.convDear = ghostConversion(g, 'backers'); const atDear = deriveSubscribers(g, 31).ghosts;
  out.elastic = { atDefault, atDear, incomeDefault: atDefault * CHATTER_PLATFORM.backersPriceDefault, incomeDear: atDear * CHATTER_PLATFORM.backersPriceBounds[1] };
  return out;
})()`);
check('D91: at the default price conversion is convBackers exactly; the dearest price converts fewer Backers but nets more money (elasticity below 1)', bill.convDefault === T.convBackers && bill.convDear < T.convBackers && bill.elastic.atDear < bill.elastic.atDefault && bill.elastic.incomeDear > bill.elastic.incomeDefault, JSON.stringify(bill.elastic));
check(`ghost Backers = floor(ghost followers × convBackers) (${bill.ghosts} of 333)`, bill.ghosts === bill.expectedGhosts, JSON.stringify(bill));
check('the cycle credits Backers × price through EARN_MONEY: money and taxes.quarterGross both move by exactly that; a second bill the same day credits nothing', bill.credited === bill.expected && bill.moneyDelta === bill.expected && bill.grossDelta === bill.expected && bill.rebill === 0, JSON.stringify(bill));
check('a cast backer who lapses (here: blocked) leaves the pool and gets the slot back', bill.lapsed === true || bill.lapsed === 'n/a', JSON.stringify(bill));
check(`setChatterPrice clamps to D32's bounds (${T.backersPriceBounds.join('–')} / ${T.privatePriceBounds.join('–')}) and refuses a non-number or unknown tier`, bill.priceHigh.price === T.backersPriceBounds[1] && bill.priceHigh.clamped === true && bill.priceLow.price === T.backersPriceBounds[0] && bill.priceBad === false && bill.priceTier === false && bill.privateSet === 12, JSON.stringify(bill));
const cadence = J(`(() => {
  const g = __mk(7); const p = ensureChatterProfile(g); p.ghostFollowers = 100; const out = {};
  g.player.rentDueDay = 15;
  out.early = processPlatformBillingForDay(g, 10); out.next0 = p.nextBillingDay;
  out.onDay = processPlatformBillingForDay(g, 15); out.next1 = p.nextBillingDay;
  out.after = processPlatformBillingForDay(g, 16);
  return out;
})()`);
check(`billing lands on the rent day and advances by ECONOMY.payPeriodDays (${J('ECONOMY.payPeriodDays')})`, cadence.early === null && cadence.next0 === 15 && cadence.onDay && cadence.onDay.credited > 0 && cadence.next1 === 15 + J('ECONOMY.payPeriodDays') && cadence.after === null, JSON.stringify(cadence));

// ---------------------------------------------------------------- 5
console.log("\n5. Perception by scrolling — an NPC who scrolled yesterday holds an opinion about yesterday's post (D37)");
const per = J(`(() => {
  const g = __mk(8); const res = __residents(g); const out = {};
  for (const id of res) __follow(g, id);
  const r = postChatterAsPlayer(g, 'made a thing today, pretty happy with it', 10, {});
  __scroll(g, res[0], 10);                 // scrolled yesterday (the day of the post)
  __scroll(g, res[2], 11);                 // scrolled today — too late for this rollover
  blockNpc(g, res[2]);
  const noticed = applyPlatformPerceptionForDay(g, 11);
  const key = __postKey(r.post);
  out.n0 = holdsOpinionOn(g.npcs[res[0]], key); out.n1 = holdsOpinionOn(g.npcs[res[1]], key); out.n2 = holdsOpinionOn(g.npcs[res[2]], key);
  out.via = noticed[0] && noticed[0].perceivers[0] && noticed[0].perceivers[0].via;
  const fact = (g.npcs[res[0]].memory.facts || []).find(f => f.kind === 'opinion' && f.subject && f.subject.key === key);
  out.factDay = fact && fact.day; out.factText = fact && fact.text; out.category = fact && fact.category;
  out.seen = ensureNpcChatter(g.npcs[res[0]], g).seenPostIds.includes(r.post.id);
  out.again = applyPlatformPerceptionForDay(g, 11).length;
  // res[1] scrolls the next day: the post is still inside the reaction window, so they notice it then
  __scroll(g, res[1], 11); out.later = applyPlatformPerceptionForDay(g, 12).length; out.n1later = holdsOpinionOn(g.npcs[res[1]], key);
  // a non-follower who scrolled never sees it
  const g2 = __mk(9); const res2 = __residents(g2); const r2 = postChatterAsPlayer(g2, 'quiet post', 10, {}); __scroll(g2, res2[0], 10);
  out.nonFollower = applyPlatformPerceptionForDay(g2, 11).length === 0 && !holdsOpinionOn(g2.npcs[res2[0]], __postKey(r2.post));
  out.scrolled = [npcScrolledOn(g, res[0], 10), npcScrolledOn(g, res[0], 9)];
  return out;
})()`);
check("an NPC with scroll_phone yesterday holds an opinion fact about yesterday's post (via platform, dated the day seen, category social); one who did not scroll does not; a blocked one never", per.n0 === true && per.n1 === false && per.n2 === false && per.via === 'platform' && per.factDay === 10 && per.category === 'social' && /post/.test(per.factText), JSON.stringify(per));
check('the post is marked seen and never noticed twice; a later scroll inside the reaction window catches it', per.seen === true && per.again === 0 && per.later === 1 && per.n1later === true, JSON.stringify(per));
check("a non-following scroller never sees the player's post; npcScrolledOn reads world.events by day", per.nonFollower === true && per.scrolled[0] === true && per.scrolled[1] === false, JSON.stringify(per));

// ---------------------------------------------------------------- 6
console.log('\n6. Ghost comments (D90), the rollover glue, the tracker line');
const gc = J(`(() => {
  const g = __mk(10); const p = ensureChatterProfile(g); const out = { ghost: 0, named: 0, n: 0 };
  __setLevel(g, 'art', 10); p.ghostFollowers = 50;
  for (let d = 3; d < 203; d++) { const r = postChatterAsPlayer(g, 'sketch ' + d, d, { source: { kind: 'skill', skillId: 'art' } }); if (r.post.appeal >= CHATTER_PLATFORM.ghostCommentMinAppeal) out.n++; for (const c of r.post.comments) { if (c.ghost) { out.ghost++; if (typeof c.seed !== 'number' || c.author !== null || typeof c.text !== 'string' || 'handle' in c || 'name' in c) out.named++; } } }
  out.rate = out.n ? out.ghost / out.n : 0;
  return out;
})()`);
check(`a post that did well sometimes draws a ghost comment stored as { author: null, ghost, seed, text } — never a name (${gc.ghost} of ${gc.n} eligible, ${(gc.rate * 100).toFixed(0)}% vs ${T.ghostCommentChance * 100}%)`, gc.ghost > 0 && gc.named === 0 && Math.abs(gc.rate - T.ghostCommentChance) < 0.15, JSON.stringify(gc));
const uiHook = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8').includes('processPlatformForDayUi(day)');
const glue = J(`(() => {
  const g = __mk(11); const res = __residents(g); const p = ensureChatterProfile(g); const out = {};
  p.ghostFollowers = 200; p.lastPostDay = 5; g.player.rentDueDay = 20; for (const id of res) __follow(g, id);
  const r = processPlatformForDay(g, 20);
  out.keys = Object.keys(r); out.decayed = r.decayed; out.billed = r.billing && r.billing.credited; out.next = p.nextBillingDay;
  const t = trackerPlatform(g); out.tracker = t && { kind: t.kind, title: t.title, dueDay: t.dueDay, screen: t.deepLink && t.deepLink.screenId };
  return out;
})()`);
check('processPlatformForDay runs decay → follows → perception → billing in one rollover call; ui.js calls it from processDayRollover', glue.keys.join(',') === 'decayed,followed,perceived,billing' && glue.decayed > 0 && glue.billed > 0 && glue.next === 20 + J('ECONOMY.payPeriodDays') && uiHook === true, JSON.stringify(glue));
check('trackerPlatform is a platform-kind line with the next billing day, deep-linking to the profile', glue.tracker && glue.tracker.kind === 'platform' && glue.tracker.dueDay === glue.next && glue.tracker.screen === 'profile', JSON.stringify(glue));

// ---------------------------------------------------------------- 7
console.log('\n7. Save round-trip — profile growth/billing fields and npc.chatter seen/slot fields');
const persist = J(`(() => {
  const g = __mk(12); const res = __residents(g); const p = ensureChatterProfile(g);
  __follow(g, res[0]); __scroll(g, res[0], 3);
  postChatterAsPlayer(g, 'kept', 3, {}); applyPlatformPerceptionForDay(g, 4); setChatterPrice(g, 'backers', 9); p.ghostFollowers = 77; deriveSubscribers(g, 4); billSubscriptions(g, 4); ghostDecay(g, 5);
  const c = ensureNpcChatter(g.npcs[res[0]], g); c.slotsUsed = 1;
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const computer = normalizeComputerState(rt.world.computer);
  const q = computer.apps.social_feed.profile;
  return { profileSame: JSON.stringify(q) === JSON.stringify(p), gf: q.ghostFollowers, price: q.backersPrice, log: q.growthLog.length, billed: q.lastBilledDay, decayed: q.lastDecayDay, backers: q.backers.ghosts,
           npcSame: JSON.stringify(rt.npcs[res[0]].chatter) === JSON.stringify(c), seen: rt.npcs[res[0]].chatter.seenPostIds, slots: rt.npcs[res[0]].chatter.slotsUsed, appeal: computer.apps.social_feed.posts[0].appeal };
})()`);
check('captureSavePayload → JSON → normalizeComputerState carries ghostFollowers, growthLog, prices, lastBilledDay/lastDecayDay, backers; npc.chatter carries seenPostIds and slotsUsed; the post keeps its stamped appeal', persist.profileSame === true && persist.gf === Math.round(77 * (1 - T.ghostDecayPerDay) * 100) / 100 && persist.price === 9 && persist.log === 1 && persist.billed === 4 && persist.decayed === 5 && persist.backers === Math.floor(77 * T.convBackers * Math.pow(T.backersPriceDefault / 9, T.priceElasticity)) && persist.npcSame === true && persist.seen.length === 1 && persist.slots === 1 && typeof persist.appeal === 'number', JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
