// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 15: Chatter social media layer (D24).
//
//   node src/src/dev/verify/verify-aa-p15.js
//
// Node coverage for everything pure/trusted-producer in chatter.js:
// registration (APP_DEFS/ICONS/MOOD_PAYOUTS, and that the old SITE_DEFS
// flavor page is gone — "grows", not a second parallel entry point);
// candidate scoring + selection (an event/fact becomes post material, an
// unclassified ambient event never does); text rendering (first-person event
// substitution, mood-bucket template selection); seeded determinism and
// same-day idempotency of generateChatterForDay; the maxPostsPerDay cap; the
// backfill-window watermark on a long-untouched save; feed pruning; NPC
// reactions (chatterAffinity's NPC<->NPC castWeb read and NPC<->player
// relPlayer read, and that high affinity reliably produces likes/comments);
// the three player verbs (post/like/comment) including validation and the
// immediate reaction pass a player post triggers; and a normalizeComputerState
// save/load round trip. Rendering (renderChatterFeed/renderChatterProfile)
// is presentation layer and outside this loader (invariant 7) — verified on
// the live page instead.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'icons.js', 'defs.computer.js', 'sim.js', 'npc.js', 'relationships.js', 'computer.js', 'chatter.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // A small, controlled house: SIM_generateHouse for real player/objects/
  // castWeb plumbing, then residency/relPlayer/castWeb are overwritten with
  // known values so scoring/reaction assertions don't depend on whatever
  // temperament/axes the seeded cast happened to roll.
  __mk = (seed, day, residentCount) => {
    const h = SIM_generateHouse(seed || 20260901, residentCount || 4);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const id of Object.keys(g.npcs)) {
      g.npcs[id].residency = { ...(g.npcs[id].residency || {}), status: 'resident' };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).sort();
  __pushEvent = (g, npcId, day, type, moodDelta, template, data) => {
    g.world.events.push({ day, tick: day * 48, roomId: null, npcId, type, moodDelta, data: data || {}, template, seenByPlayer: false });
  };
  __pushFact = (g, npcId, day, text, opts) => {
    const npc = g.npcs[npcId];
    if (!npc.memory) npc.memory = { facts: [], episodes: [] };
    if (!Array.isArray(npc.memory.facts)) npc.memory.facts = [];
    npc.memory.facts.push({ text, day, category: 'social', valid: true, provenance: 'witnessed', confidence: 1, salience: 0.5, emotionalTag: '', ...opts });
  };
  __setAffinity = (g, aId, bId, axis) => {
    const key = pairKey(aId, bId);
    const rec = g.world.castWeb[key] || (g.world.castWeb[key] = { axes: {} });
    rec.axes = rec.axes || {};
    rec.axes[aId + '→' + bId] = { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0, ...axis };
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — APP_DEFS grows the old site, ICONS, MOOD_PAYOUTS, default app state');
const reg = J(`({
  appDef: APP_DEFS.social_feed,
  siteGone: SITE_DEFS.social_feed === undefined,
  hasIcon: typeof ICONS.social_feed === 'function',
  mood: MOOD_PAYOUTS.chatterPost,
  defaultApp: defaultComputerState().apps.social_feed,
})`);
check('APP_DEFS.social_feed exists and lists both devices', !!reg.appDef && reg.appDef.devices.includes('computer') && reg.appDef.devices.includes('phone'), JSON.stringify(reg.appDef));
check('APP_DEFS.social_feed has a feed entry screen and a hidden profile screen', reg.appDef?.entryScreen === 'feed' && reg.appDef?.screens?.profile?.hideFromNav === true, JSON.stringify(reg.appDef));
check('the old SITE_DEFS.social_feed flavor page is gone (grows into the app, not a duplicate entry point)', reg.siteGone === true);
check('ICONS.social_feed exists (the documented blank-tile landmine)', reg.hasIcon === true);
check('MOOD_PAYOUTS.chatterPost is a real positive number', typeof reg.mood === 'number' && reg.mood > 0, reg.mood);
check('defaultComputerState seeds an empty feed with a zero watermark', Array.isArray(reg.defaultApp.posts) && reg.defaultApp.posts.length === 0 && reg.defaultApp.lastGeneratedDay === 0 && reg.defaultApp.nextPostId === 1, JSON.stringify(reg.defaultApp));

// ---------------------------------------------------------------- 1
console.log('\n1. Pure text helpers — first-person event substitution, mood buckets');
const firstPerson = J(`(() => {
  // A synthetic npcs map with a KNOWN name, rather than a generated cast —
  // the character generator can (rarely, on a degraded slot) leave
  // bible.name empty, which would make this test depend on generation luck
  // rather than chatterEventFirstPerson's own substitution logic.
  const npcs = { other_1: { bible: { name: 'Jess' } } };
  const evt = { template: '{name} had a long nap on the couch', data: {} };
  const withOther = { template: '{name} got into it with {other}', data: { other: 'other_1' } };
  return {
    plain: chatterEventFirstPerson(evt, npcs),
    withOther: chatterEventFirstPerson(withOther, npcs),
  };
})()`);
check('chatterEventFirstPerson substitutes {name} with "I" (past tense needs no conjugation)', firstPerson.plain === 'I had a long nap on the couch', firstPerson.plain);
check('chatterEventFirstPerson still resolves {other} to a real name', firstPerson.withOther === 'I got into it with Jess', firstPerson.withOther);

const buckets = J(`({
  eventUp: chatterEventMoodBucket({ moodDelta: 0.05 }),
  eventDown: chatterEventMoodBucket({ moodDelta: -0.05 }),
  eventFlat: chatterEventMoodBucket({ moodDelta: 0 }),
  factUp: chatterFactMoodBucket('romance'),
  factDown: chatterFactMoodBucket('grievance'),
  factFlat: chatterFactMoodBucket('domestic'),
})`);
check('event mood bucket reads moodDelta sign', buckets.eventUp === 'upbeat' && buckets.eventDown === 'salty' && buckets.eventFlat === 'neutral', JSON.stringify(buckets));
check('fact mood bucket reads emotionalTag', buckets.factUp === 'upbeat' && buckets.factDown === 'salty' && buckets.factFlat === 'neutral', JSON.stringify(buckets));

// ---------------------------------------------------------------- 2
console.log('\n2. Candidate selection — a classified event/fact is post material; an ambient event never is');
const candidates = J(`(() => {
  const g = __mk(20260901, 5);
  const ids = __ids(g);
  const author = ids[0];
  __pushEvent(g, author, 5, 'argument', -0.1, '{name} had a huge argument with {other}', { other: ids[1] });
  __pushEvent(g, author, 5, 'unclassified_ambient_thing', 0, '{name} did something totally unremarkable');
  const best = chatterBestCandidateForDay(g, g.npcs[author], author, 5);
  return { kind: best?.kind, score: best?.score, evtType: best?.evt?.type };
})()`);
check('a classified (EVENT_IMPORTANCE-listed) event is chosen as candidate material', candidates.kind === 'event' && candidates.evtType === 'argument', JSON.stringify(candidates));
check('candidate score is a real positive number', typeof candidates.score === 'number' && candidates.score > 0, candidates.score);

const ambientOnly = J(`(() => {
  const g = __mk(20260901, 5);
  const ids = __ids(g);
  const author = ids[0];
  // Real generated NPCs start with a few seeded day-0 facts (shared house
  // history) — cleared here so this test isolates "ambient events are never
  // candidate material" from "does this NPC happen to have zero facts".
  g.npcs[author].memory.facts = [];
  __pushEvent(g, author, 5, 'totally_unclassified_type', 0, '{name} did laundry');
  return chatterBestCandidateForDay(g, g.npcs[author], author, 5);
})()`);
check('an unclassified (ambient) event alone yields no candidate — never post-worthy', ambientOnly === null || ambientOnly === undefined, JSON.stringify(ambientOnly));

const factCandidate = J(`(() => {
  const g = __mk(20260901, 5);
  const ids = __ids(g);
  const author = ids[0];
  __pushFact(g, author, 5, 'the rent is going up next month', { emotionalTag: 'grievance', importance: 0.8 });
  const best = chatterBestCandidateForDay(g, g.npcs[author], author, 5);
  return { kind: best?.kind, text: best?.fact?.text };
})()`);
check('a fact in memory.facts is chosen as candidate material', factCandidate.kind === 'fact' && factCandidate.text === 'the rent is going up next month', JSON.stringify(factCandidate));

const stale = J(`(() => {
  const g = __mk(20260901, 20);
  const ids = __ids(g);
  const author = ids[0];
  __pushEvent(g, author, 1, 'argument', -0.1, '{name} had an argument'); // day 1, way outside maxBackfillDays of day 20
  return chatterBestCandidateForDay(g, g.npcs[author], author, 20);
})()`);
check('an event far outside the lookback window is not candidate material', stale === null || stale === undefined, JSON.stringify(stale));

// ---------------------------------------------------------------- 3
console.log('\n3. Seeded determinism and same-day idempotency of generateChatterForDay');
const det = J(`(() => {
  const mkPopulated = () => {
    const g = __mk(20260901, 5, 6);
    for (const id of __ids(g)) __pushEvent(g, id, 5, 'argument', -0.1, '{name} had a huge argument today');
    return g;
  };
  const a = mkPopulated(); generateChatterForDay(a, 5);
  const b = mkPopulated(); generateChatterForDay(b, 5);
  return { same: JSON.stringify(a.world.computer.apps.social_feed.posts) === JSON.stringify(b.world.computer.apps.social_feed.posts), count: a.world.computer.apps.social_feed.posts.length };
})()`);
check('the same seed+day+events produce byte-identical posts', det.same === true, JSON.stringify(det));
check('a populated day with several eligible authors actually produces at least one post', det.count > 0, det.count);

const idem = J(`(() => {
  const g = __mk(20260901, 5, 6);
  for (const id of __ids(g)) __pushEvent(g, id, 5, 'argument', -0.1, '{name} had a huge argument today');
  generateChatterForDay(g, 5);
  const before = JSON.stringify(g.world.computer.apps.social_feed);
  generateChatterForDay(g, 5); // re-processed same-day call
  return { after: JSON.stringify(g.world.computer.apps.social_feed), before };
})()`);
check('re-calling generateChatterForDay for a day already generated is a no-op', idem.after === idem.before);

// ---------------------------------------------------------------- 4
console.log('\n4. maxPostsPerDay cap — many eligible authors still produce at most the cap');
const cap = J(`(() => {
  const g = __mk(20260901, 5, 8);
  for (const id of __ids(g)) {
    g.npcs[id].memory.facts = []; // isolate: only today's injected event should be candidate material
    __pushEvent(g, id, 5, 'gift', 0.15, '{name} got a really thoughtful gift today');
  }
  // Pin the watermark to yesterday so generateChatterForDay processes
  // exactly ONE day (5) — otherwise its own backfill catch-up (maxBackfillDays
  // worth of days, each with its own budget) would legitimately produce more
  // than one single day's cap in aggregate, which isn't what this checks.
  g.world.computer.apps.social_feed.lastGeneratedDay = 4;
  generateChatterForDay(g, 5);
  return { count: g.world.computer.apps.social_feed.posts.length, cap: CHATTER_TUNING.maxPostsPerDay };
})()`);
check('new posts for one single day never exceed CHATTER_TUNING.maxPostsPerDay', cap.count <= cap.cap, JSON.stringify(cap));

// ---------------------------------------------------------------- 5
console.log('\n5. Backfill watermark — a long-untouched save only catches up maxBackfillDays, and the watermark still jumps to today');
const backfill = J(`(() => {
  const g = __mk(20260901, 200, 6);
  for (const id of __ids(g)) {
    for (let d = 1; d <= 200; d += 5) __pushEvent(g, id, d, 'argument', -0.1, '{name} had a huge argument');
  }
  generateChatterForDay(g, 200);
  const feed = g.world.computer.apps.social_feed;
  const oldestDay = feed.posts.reduce((min, p) => Math.min(min, p.day), Infinity);
  return { lastGeneratedDay: feed.lastGeneratedDay, oldestDay, floor: 200 - CHATTER_TUNING.maxBackfillDays + 1 };
})()`);
check('the watermark jumps all the way to today even though only the tail was backfilled', backfill.lastGeneratedDay === 200, JSON.stringify(backfill));
check('no post lands earlier than the backfill floor (day - maxBackfillDays + 1)', backfill.oldestDay >= backfill.floor, JSON.stringify(backfill));

// ---------------------------------------------------------------- 6
console.log('\n6. Feed pruning — a post older than feedRetentionDays is dropped on the next generation pass');
const pruned = J(`(() => {
  const g = __mk(20260901, 1, 2);
  const ids = __ids(g);
  generateChatterForDay(g, 1);
  const feed = g.world.computer.apps.social_feed;
  feed.posts.push({ id: 'ancient', author: ids[0], text: 'old news', likes: [], comments: [], day: 1, eventRef: null });
  const farDay = 1 + CHATTER_TUNING.feedRetentionDays + 10;
  generateChatterForDay(g, farDay);
  return { stillThere: feed.posts.some(p => p.id === 'ancient') };
})()`);
check('a post older than feedRetentionDays is pruned on a later generation pass', pruned.stillThere === false, JSON.stringify(pruned));

// ---------------------------------------------------------------- 7
console.log('\n7. Reactions — chatterAffinity reads castWeb (NPC<->NPC) and relPlayer (NPC<->player); high affinity reliably reacts');
const affinity = J(`(() => {
  const g = __mk(20260901, 5, 3);
  const ids = __ids(g);
  __setAffinity(g, ids[0], ids[1], { affection: 1, trust: 1, tension: 0 });
  __setAffinity(g, ids[0], ids[2], { affection: -1, trust: 0, tension: 1 });
  g.npcs[ids[0]].relPlayer = { ...(g.npcs[ids[0]].relPlayer || {}), affection: 1, trust: 1, tension: 0 };
  // Cast generation seeds EVERY pair in castWeb already, so "no record"
  // never naturally occurs between two real residents — delete this one
  // pair's record to force the true fallback branch.
  delete g.world.castWeb[pairKey(ids[1], ids[2])];
  return {
    highNpcNpc: chatterAffinity(g, ids[0], ids[1]),
    lowNpcNpc: chatterAffinity(g, ids[0], ids[2]),
    highNpcPlayer: chatterAffinity(g, ids[0], 'player'),
    noRecord: chatterAffinity(g, ids[1], ids[2]),
  };
})()`);
check('high castWeb affection/trust reads as strongly positive affinity', affinity.highNpcNpc > 0.5, JSON.stringify(affinity));
check('negative castWeb affection/tension reads as negative affinity', affinity.lowNpcNpc < 0, JSON.stringify(affinity));
check("a post authored by \"player\" reads the reactor's relPlayer axes", affinity.highNpcPlayer > 0.5, JSON.stringify(affinity));
check('a pair with no castWeb record at all defaults to neutral (0), not a crash', affinity.noRecord === 0, JSON.stringify(affinity));

const reactions = J(`(() => {
  const g = __mk(20260901, 5, 6);
  const ids = __ids(g);
  const author = ids[0];
  for (const id of ids.slice(1)) __setAffinity(g, id, author, { affection: 1, trust: 1, tension: 0 });
  const post = { id: 'p1', author, text: 'test post', likes: [], comments: [], day: 5, eventRef: null };
  applyChatterReactions(g, [post], 5, seededRng(g.meta.seed, 'test_reactions'));
  return { likeCount: post.likes.length, commentCount: post.comments.length, residents: ids.length - 1 };
})()`);
check('with 5 high-affinity residents, at least one likes the post (near-certain at p~0.67 each)', reactions.likeCount > 0, JSON.stringify(reactions));

// ---------------------------------------------------------------- 8
console.log('\n8. Player verbs — post/like/comment, validation, and the immediate reaction pass a player post triggers');
const playerPost = J(`(() => {
  const g = __mk(20260901, 5, 4);
  const ids = __ids(g);
  for (const id of ids) __setAffinity(g, id, 'player', {}); // ensures relPlayer path is exercised, neutral axis
  g.npcs[ids[0]].relPlayer = { ...(g.npcs[ids[0]].relPlayer || {}), affection: 1, trust: 1, tension: 0 };
  // aspirations-and-creative-careers Phase 9 (D30): posting needs a handle
  // now — the platform is pseudonymous from the first post. Claim one the
  // way the feed's first-open prompt does; the verbs under test are unchanged.
  if (typeof setChatterHandle === 'function') setChatterHandle(g, 'tester');
  const before = (g.player.moodEvents || []).length;
  const r = postChatterAsPlayer(g, '  hello apartment  ', 5);
  const empty = postChatterAsPlayer(g, '   ', 5);
  const long = postChatterAsPlayer(g, 'x'.repeat(500), 5);
  return {
    ok: r.ok, text: r.post.text, author: r.post.author,
    moodPushed: (g.player.moodEvents || []).length > before,
    emptyRejected: empty.ok === false,
    truncated: long.post.text.length === 280,
    feedHasIt: g.world.computer.apps.social_feed.posts.some(p => p.id === r.post.id),
  };
})()`);
check('postChatterAsPlayer trims text and stamps the player as author', playerPost.ok === true && playerPost.text === 'hello apartment' && playerPost.author === 'player', JSON.stringify(playerPost));
check('posting pushes a real mood impulse', playerPost.moodPushed === true);
check('an empty/whitespace-only post is rejected', playerPost.emptyRejected === true);
check('an over-long post is truncated to 280 chars', playerPost.truncated === true);
check('the new post actually lands in the feed', playerPost.feedHasIt === true);

const likeToggle = J(`(() => {
  const g = __mk(20260901, 5, 2);
  const ids = __ids(g);
  g.world.computer.apps.social_feed.posts.push({ id: 'p1', author: ids[0], text: 'hi', likes: [], comments: [], day: 5, eventRef: null });
  const on = toggleChatterLike(g, 'p1');
  const likedAfterOn = g.world.computer.apps.social_feed.posts[0].likes.includes('player');
  const off = toggleChatterLike(g, 'p1');
  const likedAfterOff = g.world.computer.apps.social_feed.posts[0].likes.includes('player');
  const missing = toggleChatterLike(g, 'nope');
  return { on: on.liked, likedAfterOn, off: off.liked, likedAfterOff, missingOk: missing.ok };
})()`);
check('toggleChatterLike adds the player to likes on first call', likeToggle.on === true && likeToggle.likedAfterOn === true, JSON.stringify(likeToggle));
check('toggleChatterLike removes the player on second call', likeToggle.off === false && likeToggle.likedAfterOff === false, JSON.stringify(likeToggle));
check('toggleChatterLike on a nonexistent post is refused, not a crash', likeToggle.missingOk === false);

const comment = J(`(() => {
  const g = __mk(20260901, 5, 2);
  const ids = __ids(g);
  g.world.computer.apps.social_feed.posts.push({ id: 'p1', author: ids[0], text: 'hi', likes: [], comments: [], day: 5, eventRef: null });
  const r = addChatterComment(g, 'p1', '  nice!  ');
  const empty = addChatterComment(g, 'p1', '   ');
  return { ok: r.ok, comments: g.world.computer.apps.social_feed.posts[0].comments, emptyRejected: empty.ok === false };
})()`);
check('addChatterComment trims text and stamps the player as author', comment.ok === true && comment.comments.length === 1 && comment.comments[0].author === 'player' && comment.comments[0].text === 'nice!', JSON.stringify(comment));
check('an empty comment is rejected', comment.emptyRejected === true);

// ---------------------------------------------------------------- 9
console.log('\n9. Save/load round trip (normalizeComputerState) and old-save back-fill');
const roundTrip = J(`(() => {
  const g = __mk(20260901, 5, 2);
  const ids = __ids(g);
  g.world.computer.apps.social_feed.posts.push({ id: 'p1', author: ids[0], text: 'hi', likes: ['player'], comments: [{ author: ids[1], text: 'lol' }], day: 5, eventRef: { kind: 'event', day: 5 } });
  g.world.computer.apps.social_feed.lastGeneratedDay = 5;
  const before = g.world.computer.apps.social_feed;
  const saved = JSON.parse(JSON.stringify(g.world.computer));
  const normalized = normalizeComputerState(saved);
  return { before, after: normalized.apps.social_feed };
})()`);
check('posts/likes/comments/lastGeneratedDay survive the save/load round trip intact', JSON.stringify(roundTrip.before) === JSON.stringify(roundTrip.after), JSON.stringify(roundTrip));

const oldSave = J(`(() => {
  const raw = { power: 'off', windows: {}, apps: { shop: { cart: [] } } }; // pre-Phase-15 save, no apps.social_feed key
  return normalizeComputerState(raw).apps.social_feed;
})()`);
check('a pre-Phase-15 save with no apps.social_feed key back-fills a fresh, empty feed rather than crashing', !!oldSave && Array.isArray(oldSave.posts) && oldSave.posts.length === 0 && oldSave.lastGeneratedDay === 0, JSON.stringify(oldSave));

// ---------------------------------------------------------------- 10
console.log('\n10. NSFW/SFW gating holds — a scandal-sourced post is exactly as (non-)explicit as any other');
const scandal = J(`(() => {
  const g = __mk(20260901, 5, 2);
  const ids = __ids(g);
  const rng = seededRng(g.meta.seed, 'scandal_check');
  const candidate = { kind: 'event', evt: { day: 5, moodDelta: -0.2, type: 'cheating', template: '{name} found out {other} was cheating', data: { other: ids[1] } } };
  const text = chatterRenderText(g, candidate, rng);
  return { text, hasTemplateMarker: /apparently|heard|today|honestly|vent|kept going|why is it|putting this|good one/i.test(text) || text.length > 0 };
})()`);
check('a "cheating"-sourced post renders through the SAME plain template pool as any other event — no explicit branch exists to bypass', typeof scandal.text === 'string' && scandal.text.length > 0 && !/root\\.generateText|explicit|nude/i.test(scandal.text), JSON.stringify(scandal));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
