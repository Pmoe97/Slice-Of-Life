// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 12: NPC
// creators & the player as subscriber (D38–D41, D95–D97).
//
//   node src/src/dev/verify/verify-acc-p12.js
//
// Node coverage for everything pure in this phase: the tuning block and
// the bible schema entry; deriveCreator — seeded on genSeed (deterministic,
// idempotent through ensureCreator), the D38 rates over 510 generated NPCs
// (creator ≈ 15 %, Private ≈ 5 %, ±3), the leans (low income / self-
// employed / disinhibition raise it), prices inside the player's bounds,
// kinds from the occupation's gig category; the D40 block decision — a
// private personality (low disinhibition) with a Private page blocks the
// player, an exhibitionist never; npcCreator backfilling a pre-Phase-12
// bible lazily; the creator's seeded head start on npc.chatter (D95) and
// npcCreatorTick — growth per cycle, idempotent per day, a described-not-
// rendered private post with a gate-governed record (intimate bits only
// with the mature flag on; the NPC alone in it, D41); the player's
// subscriptions — refused for a non-creator, a blocking creator, a blocked
// creator, a missing Private page, or Private without the mature flag;
// tier switches; the charge on the cycle (money down by the price, once per
// day, stops after unsubscribe, lapses when broke); chatterPrivatePostView
// ({ rendered: false, price } for a non-subscriber, rendered for a Private
// subscriber, blocked for a blocking creator); processPlatformBillingForDay
// carrying creators + charges; and a save round-trip of bible.creator +
// profile.subscriptions + the creator's chatter numbers. The NPC profile's
// Creator panel, the locked private card, and the bank's Subscriptions
// panel are verified on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'willingness.js', 'image.js',
    'chatter.js', 'platform.js', 'asks.js', 'tracker.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');

api(`
  __mk = (seed, day, mature) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: { contentFlags: { mature: mature !== false } }, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    setChatterHandle(g, 'tester');
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  __creator = (g, npcId, over) => { g.npcs[npcId].bible.creator = { active: true, kinds: ['lifestyle'], privateOpen: true, backersPrice: 4, privatePrice: 12, blocksPlayer: false, ...(over || {}) }; delete g.npcs[npcId].chatter; return g.npcs[npcId].bible.creator; };
  __bible = (genSeed, over) => ({ genSeed, temperament: { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 }, occupation: { category: 'service', incomeBand: 'mid', workMode: 'on_site' }, ...(over || {}) });
  __intimateRx = /areolae|labia|penis|testicles|nipples/;
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration, the tuning block, the schema. ${loaded.length} engine files loaded.`);
const T = J('CHATTER_PLATFORM');
check('CHATTER_PLATFORM carries the creator dials (rates, leans, block thresholds, head start, appeal, cadence, nude threshold)', T.creatorBase > 0 && T.creatorDisinhibition > 0 && T.creatorLowIncome > 0 && T.creatorSelfEmployed > 0 && T.creatorPrivateBase > 0 && T.creatorBlockBelowDis < T.creatorBlockAboveDis && T.creatorStartFollowers[0] < T.creatorStartFollowers[1] && T.creatorAppealBase > 0 && T.creatorPostsPerCycle >= 1 && T.creatorPrivatePostChance > 0 && T.creatorImageMult > 1 && T.creatorNudeDis > 0 && T.creatorNudeDis < 1, JSON.stringify(T));
check('CHATTER_CREATOR_PRIVATE_LINES is a non-empty template pool', J('Array.isArray(CHATTER_CREATOR_PRIVATE_LINES) && CHATTER_CREATOR_PRIVATE_LINES.length >= 4'));
const fns = J(`['deriveCreator','ensureCreator','npcCreator','creatorIds','npcCreatorAppeal','npcCreatorTick','npcBlocksPlayer','playerSubscriptionTo','playerSubscribedTo','subscribeToNpc','unsubscribeFromNpc','playerSubscriptionLines','playerSubscriptionTotal','billPlayerSubscriptions','chatterPrivatePostView','buildNpcSelfShotRecord'].filter(n => typeof globalThis[n] !== 'function')`);
check('every Phase 12 function exists', fns.length === 0, `missing: ${fns.join(', ')}`);
const schema = J(`(() => { const r = resolveNpcFieldSpec('bible.creator.active'); const k = resolveNpcFieldSpec('bible.creator.kinds'); return { active: r && r.spec && r.spec.type, kinds: k && k.spec && k.spec.type, err: r && r.error }; })()`);
check('bible.creator is a schema entry (validateNpcField resolves bible.creator.active as a boolean, .kinds as an array)', schema.active === 'boolean' && schema.kinds === 'array' && !schema.err, JSON.stringify(schema));
const simSrc = fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8');
check('createNpcFromBible runs ensureCreator beside ensureIntimate (every generated NPC carries the block)', /bible: ensureCreator\(ensureIntimate\(bible\)\)/.test(simSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. deriveCreator — seeded, idempotent, the D38 rates and leans, the D40 block decision');
const det = J(`(() => {
  const a = deriveCreator(__bible(123)); const b = deriveCreator(__bible(123));
  const e1 = ensureCreator(__bible(123)); const e2 = ensureCreator(e1);
  const closed = ensureCreator({ ...__bible(9), creator: { active: true, kinds: ['x'], privateOpen: false, backersPrice: 7, privatePrice: 11, blocksPlayer: false } });
  return { same: JSON.stringify(a) === JSON.stringify(b), keys: Object.keys(a), idem: e2 === e1 && JSON.stringify(e1.creator) === JSON.stringify(a), kept: closed.creator.backersPrice === 7 && closed.creator.kinds[0] === 'x' };
})()`);
check('deriveCreator is deterministic on genSeed; ensureCreator is idempotent and never overwrites an authored block; the shape is { active, kinds, privateOpen, backersPrice, privatePrice, blocksPlayer }', det.same === true && det.idem === true && det.kept === true && det.keys.join(',') === 'active,kinds,privateOpen,backersPrice,privatePrice,blocksPlayer', JSON.stringify(det));
const rates = J(`(() => {
  let n = 0, active = 0, priv = 0, priced = 0, kindsOk = 0; const t0 = Date.now();
  for (let seed = 1; seed <= 170; seed++) {
    const h = SIM_generateHouse(seed, 3);
    for (const id of Object.keys(h.npcs)) {
      if (!id.startsWith('npc_')) continue;
      const c = h.npcs[id].bible.creator; n++;
      if (!c) continue;
      if (c.active) { active++; if (c.backersPrice >= CHATTER_PLATFORM.backersPriceBounds[0] && c.backersPrice <= CHATTER_PLATFORM.backersPriceBounds[1]) priced++; if (c.kinds[0] === 'lifestyle') kindsOk++; }
      if (c.privateOpen) priv++;
    }
  }
  return { n, active: active / n, priv: priv / n, priced, activeN: active, kindsOk, ms: Date.now() - t0 };
})()`);
check(`over ${rates.n} generated NPCs the creator rate is ≈ 15 % (${(rates.active * 100).toFixed(1)} %) and the Private rate ≈ 5 % (${(rates.priv * 100).toFixed(1)} %), both within ±3`, rates.n >= 500 && Math.abs(rates.active - 0.15) <= 0.03 && Math.abs(rates.priv - 0.05) <= 0.03, JSON.stringify(rates));
check("every creator's Backers price sits inside the player's bounds and their kinds start with 'lifestyle'", rates.priced === rates.activeN && rates.kindsOk === rates.activeN, JSON.stringify(rates));
const leans = J(`(() => {
  const N = 400; const count = (over) => { let a = 0; for (let s = 1; s <= N; s++) if (deriveCreator(__bible(s, over)).active) a++; return a / N; };
  return { base: count({}), broke: count({ occupation: { category: 'food', incomeBand: 'low', workMode: 'on_site' } }), self: count({ occupation: { category: 'art', incomeBand: 'mid', workMode: 'self_employed' } }), wild: count({ deviantLevel: 0.95 }), prim: count({ deviantLevel: 0.05 }),
           kindsArt: (() => { for (let s = 1; s < 200; s++) { const c = deriveCreator(__bible(s, { occupation: { category: 'art', incomeBand: 'low', workMode: 'self_employed' }, deviantLevel: 0.99 })); if (c.active) return c.kinds; } return []; })() };
})()`);
check('the leans raise the rate: a broke NPC, a self-employed one and an exhibitionist all run accounts more often than the baseline; a prim one less; an art-category creator lists craft:art', leans.broke > leans.base && leans.self > leans.base && leans.wild > leans.base && leans.prim < leans.wild && leans.kindsArt.includes('craft:art'), JSON.stringify(leans));
const block = J(`(() => {
  const N = 600; let privLow = 0, blockLow = 0, privHigh = 0, blockHigh = 0, privNone = 0, blockNone = 0;
  for (let s = 1; s <= N; s++) {
    const lo = deriveCreator(__bible(s, { deviantLevel: 0.1 })); if (lo.privateOpen) { privLow++; if (lo.blocksPlayer) blockLow++; }
    const hi = deriveCreator(__bible(s, { deviantLevel: 0.9 })); if (hi.privateOpen) { privHigh++; if (hi.blocksPlayer) blockHigh++; }
    if (!hi.privateOpen && hi.blocksPlayer) blockNone++; if (!hi.privateOpen) privNone++;
  }
  return { privLow, blockLow, privHigh, blockHigh, privNone, blockNone };
})()`);
check("D40: a 'private' personality (disinhibition 0.1) with a Private page blocks the player every time; an exhibitionist (0.9) never; no Private page → no block", block.privLow > 0 && block.blockLow === block.privLow && block.privHigh > 0 && block.blockHigh === 0 && block.blockNone === 0, JSON.stringify(block));

// ---------------------------------------------------------------- 2
console.log('\n2. npcCreator (lazy backfill), the head start, npcCreatorTick (D39, D41, D95)');
const tick = J(`(() => {
  const out = {};
  const g = __mk(2, 3, true); const res = __residents(g);
  // a pre-Phase-12 record: no creator block on the bible
  delete g.npcs[res[0]].bible.creator;
  const c0 = npcCreator(g.npcs[res[0]]); out.backfilled = c0 && typeof c0.active === 'boolean' && g.npcs[res[0]].bible.creator === c0;
  const id = res[1]; __creator(g, id, {});
  const c = ensureNpcChatter(g.npcs[id], g);
  out.start = c.ghostFollowers; out.startRange = c.ghostFollowers >= CHATTER_PLATFORM.creatorStartFollowers[0] * 0.3 && c.ghostFollowers <= CHATTER_PLATFORM.creatorStartFollowers[1];
  delete g.npcs[id].chatter; out.startAgain = ensureNpcChatter(g.npcs[id], g).ghostFollowers;
  out.appeal = npcCreatorAppeal(g.npcs[id]);
  out.ids = creatorIds(g); out.forcedId = id;
  const t1 = npcCreatorTick(g, id, 10); const again = npcCreatorTick(g, id, 10);
  out.gained = t1.gained; out.followers = t1.followers; out.again = again;
  out.expectedGain = (() => { let f = out.start, s = 0; for (let i = 0; i < CHATTER_PLATFORM.creatorPostsPerCycle; i++) { const gg = out.appeal * Math.pow(f + 1, CHATTER_PLATFORM.growthExp) * CHATTER_PLATFORM.growthK; f = Math.round((f + gg) * 100) / 100; s += gg; } return Math.round(s * 100) / 100; })();
  let pp = t1.privatePost; let d = 17; while (!pp && d < 400) { pp = (npcCreatorTick(g, id, d) || {}).privatePost; d += 7; }
  out.post = pp && { author: pp.author, vis: pp.visibility, media: pp.media.kind, subjects: pp.media.photo.subjectNpcIds, level: pp.media.photo.level, bits: __intimateRx.test(pp.media.photo.prompt), inFeed: g.world.computer.apps.social_feed.posts.some(x => x.id === pp.id), caption: typeof pp.text === 'string' && pp.text.length > 0, selfie: /self-shot/.test(pp.media.photo.prompt) };
  g.npcs[res[2]].bible.creator = { active: false, kinds: [], privateOpen: false, backersPrice: 5, privatePrice: 10, blocksPlayer: false };
  out.nonCreator = npcCreatorTick(g, res[2], 10);
  // the gate closed: the record has no intimate bits and reads lifestyle
  g.meta.contentConfig.contentFlags.mature = false;
  const rec = buildNpcSelfShotRecord(g, g.npcs[id], id, 'rec', 3); out.closed = { level: rec.level, bits: __intimateRx.test(rec.prompt), naked: /naked|undressed/.test(rec.prompt) };
  return out;
})()`);
check("npcCreator backfills a pre-Phase-12 bible lazily (seeded, written once); a creator's head start lands on npc.chatter (D95), seeded — the same on a re-read", tick.backfilled === true && tick.startRange === true && tick.startAgain === tick.start, JSON.stringify(tick));
check(`npcCreatorTick grows the following by applyGrowth's formula ${T.creatorPostsPerCycle}× (expected +${tick.expectedGain}, got +${tick.gained}), once per day; a non-creator ticks to null`, Math.abs(tick.gained - tick.expectedGain) < 0.05 && tick.again === null && tick.nonCreator === null && tick.ids.length >= 1 && tick.ids.includes(tick.forcedId), JSON.stringify(tick));
check('a Private page adds a private post to the feed: the NPC alone in it (D41), a self-shot record with the intimate bits (gate open), level intimate, a caption; with the gate closed the record has no intimate bits and reads lifestyle', tick.post && tick.post.vis === 'private' && tick.post.media === 'image' && tick.post.subjects.length === 1 && tick.post.level === 'intimate' && tick.post.bits === true && tick.post.inFeed === true && tick.post.caption === true && tick.post.selfie === true && tick.closed.level === 'lifestyle' && tick.closed.bits === false, JSON.stringify(tick));

// ---------------------------------------------------------------- 3
console.log('\n3. The player as subscriber — refusals, tiers, the charge on the cycle (D40)');
const sub = J(`(() => {
  const out = {};
  const g = __mk(3, 3, true); const res = __residents(g); const p = ensureChatterProfile(g);
  const id = res[0]; __creator(g, id, {}); __creator(g, res[1], { blocksPlayer: true }); __creator(g, res[2], { privateOpen: false });
  out.nonCreator = subscribeToNpc(g, 'contractor', 'backers', 3);
  out.blocking = subscribeToNpc(g, res[1], 'backers', 3);
  out.noPrivate = subscribeToNpc(g, res[2], 'private', 3);
  out.badTier = subscribeToNpc(g, id, 'gold', 3).ok;
  blockNpc(g, res[2]); out.iBlocked = subscribeToNpc(g, res[2], 'backers', 3); unblockNpc(g, res[2]);
  out.backers = subscribeToNpc(g, id, 'backers', 3); out.tier1 = playerSubscribedTo(g, id);
  out.switched = subscribeToNpc(g, id, 'private', 4); out.tier2 = playerSubscribedTo(g, id); out.again = subscribeToNpc(g, id, 'private', 4);
  out.lines = playerSubscriptionLines(g); out.total = playerSubscriptionTotal(g);
  const m0 = g.player.money; const b = billPlayerSubscriptions(g, 100); const b2 = billPlayerSubscriptions(g, 100);
  out.charge = { charged: b.charged, paid: b.paid.length, delta: g.player.money - m0, again: b2.charged };
  out.unsub = unsubscribeFromNpc(g, id); out.tier3 = playerSubscribedTo(g, id);
  const m1 = g.player.money; const b3 = billPlayerSubscriptions(g, 107); out.afterUnsub = { charged: b3.charged, delta: g.player.money - m1 };
  subscribeToNpc(g, id, 'private', 5); g.player.money = 3; const b4 = billPlayerSubscriptions(g, 114);
  out.broke = { charged: b4.charged, lapsed: b4.lapsed.map(l => l.npcId), subs: p.subscriptions.length, money: g.player.money };
  // a creator who blocks the player after the fact: the next cycle drops them unpaid
  g.player.money = 500; subscribeToNpc(g, id, 'backers', 6); g.npcs[id].bible.creator.blocksPlayer = true; const b5 = billPlayerSubscriptions(g, 121);
  out.blockedLater = { charged: b5.charged, lapsed: b5.lapsed.length, subs: p.subscriptions.length };
  g.meta.contentConfig.contentFlags.mature = false; g.npcs[id].bible.creator.blocksPlayer = false;
  out.matureOff = subscribeToNpc(g, id, 'private', 7); out.matureOffBackers = subscribeToNpc(g, id, 'backers', 7).ok;
  return out;
})()`);
check("subscribeToNpc refuses a non-creator, a creator who blocks you, one you've blocked, a missing Private page, a bad tier, and Private without the mature flag (Backers still fine)", sub.nonCreator.ok === false && sub.blocking.ok === false && /blocked you/.test(sub.blocking.reason) && sub.noPrivate.ok === false && sub.badTier === false && sub.iBlocked.ok === false && sub.matureOff.ok === false && sub.matureOffBackers === true, JSON.stringify(sub));
check("Backers at their price, a switch to Private (one line, the new tier), 'Already subscribed' on a repeat; the lines carry handle/tier/price", sub.backers.ok === true && sub.backers.price === 4 && sub.tier1 === 'backers' && sub.switched.ok === true && sub.switched.changed === true && sub.tier2 === 'private' && sub.again.ok === false && sub.lines.length === 1 && sub.lines[0].price === 12 && /\w/.test(sub.lines[0].handle) && sub.total === 12, JSON.stringify(sub));
check('the cycle charges the price from player.money once per day; nothing after unsubscribe; a subscription you cannot pay lapses (dropped, unpaid); a creator who blocks you later is dropped unpaid', sub.charge.charged === 12 && sub.charge.delta === -12 && sub.charge.again === 0 && sub.unsub.ok === true && sub.tier3 === null && sub.afterUnsub.charged === 0 && sub.afterUnsub.delta === 0 && sub.broke.charged === 0 && sub.broke.lapsed.length === 1 && sub.broke.subs === 0 && sub.broke.money === 3 && sub.blockedLater.charged === 0 && sub.blockedLater.lapsed === 1 && sub.blockedLater.subs === 0, JSON.stringify(sub));

// ---------------------------------------------------------------- 4
console.log('\n4. chatterPrivatePostView and the cycle glue (D39, D41)');
const view = J(`(() => {
  const out = {};
  const g = __mk(4, 3, true); const res = __residents(g); const id = res[0]; __creator(g, id, {}); __creator(g, res[1], { blocksPlayer: true });
  let pp = null; for (let d = 10; !pp && d < 400; d += 7) pp = (npcCreatorTick(g, id, d) || {}).privatePost;
  let bp = null; for (let d = 10; !bp && d < 400; d += 7) bp = (npcCreatorTick(g, res[1], d) || {}).privatePost;
  out.unsub = chatterPrivatePostView(g, pp);
  subscribeToNpc(g, id, 'backers', 3); out.backersOnly = chatterPrivatePostView(g, pp).rendered;
  subscribeToNpc(g, id, 'private', 3); out.subbed = chatterPrivatePostView(g, pp);
  out.blocked = chatterPrivatePostView(g, bp);
  out.ownPrivate = chatterPrivatePostView(g, { author: 'player', visibility: 'private' }).rendered;
  out.publicPost = chatterPrivatePostView(g, { author: id, visibility: 'public' }).rendered;
  out.listed = visiblePostsFor(g, 'player').some(x => x.id === pp.id);
  // the cycle: creators tick and the player's charge lands beside the payout
  const p = ensureChatterProfile(g); p.nextBillingDay = 500; g.player.money = 300; const m0 = g.player.money;
  const r = processPlatformBillingForDay(g, 500);
  out.cycle = { creators: r.creators.length, ticked: r.creators.every(c => typeof c.followers === 'number'), charged: r.charges.charged, delta: g.player.money - m0 - (r.credited || 0) };
  return out;
})()`);
check("an NPC's private post is { rendered: false, price } for a non-subscriber and for a Backer, rendered for a Private subscriber, { blocked: true } from a blocking creator; the player's own and public posts always render; the post is still LISTED in the player's feed", view.unsub.rendered === false && view.unsub.price === 12 && view.backersOnly === false && view.subbed.rendered === true && view.blocked.rendered === false && view.blocked.blocked === true && view.ownPrivate === true && view.publicPost === true && view.listed === true, JSON.stringify(view));
check('processPlatformBillingForDay ticks every creator and charges the player in the same cycle', view.cycle.creators === 2 && view.cycle.ticked === true && view.cycle.charged === 12 && view.cycle.delta === -12, JSON.stringify(view));

// ---------------------------------------------------------------- 5
console.log('\n5. Save round-trip — bible.creator, profile.subscriptions, the creator\'s chatter numbers');
const persist = J(`(() => {
  const g = __mk(5, 3, true); const res = __residents(g); const id = res[0]; const cr = __creator(g, id, { kinds: ['lifestyle', 'craft:music'] });
  subscribeToNpc(g, id, 'private', 3); npcCreatorTick(g, id, 10);
  const c = g.npcs[id].chatter; const p = ensureChatterProfile(g);
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const computer = normalizeComputerState(rt.world.computer);
  const q = computer.apps.social_feed.profile;
  return { creatorSame: JSON.stringify(rt.npcs[id].bible.creator) === JSON.stringify(cr), kinds: rt.npcs[id].bible.creator.kinds, subs: q.subscriptions, subsSame: JSON.stringify(q.subscriptions) === JSON.stringify(p.subscriptions),
           followers: rt.npcs[id].chatter.ghostFollowers, tickDay: rt.npcs[id].chatter.lastCreatorTickDay, chatterSame: JSON.stringify(rt.npcs[id].chatter) === JSON.stringify(c),
           valid: validateNpcField('bible.creator.privateOpen', true).ok };
})()`);
check('captureSavePayload → JSON → normalizeComputerState keeps bible.creator (kinds intact), profile.subscriptions, and the creator\'s ghostFollowers/lastCreatorTickDay on npc.chatter; the schema validates the field', persist.creatorSame === true && persist.kinds.length === 2 && persist.subsSame === true && persist.subs.length === 1 && persist.subs[0].tier === 'private' && typeof persist.followers === 'number' && persist.tickDay === 10 && persist.chatterSame === true && persist.valid === true, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
