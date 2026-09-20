// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 9: the
// Chatter audience model (D26–D30, D35–D37 as far as they are data, D85–D87).
//
//   node src/src/dev/verify/verify-acc-p9.js
//
// Node coverage for everything pure in this phase: platform.js registered
// in both load lists (D56) after chatter.js; CHATTER_LABELS as the ONE
// place the tier names appear as strings (invariant 11 — a source sweep);
// the player profile's lazy default (fresh state, an old save through
// normalizeComputerState, a partial record backfilled); handles — cast
// handles derived from the bible (deterministic on genSeed, never the
// name), ghost handles deterministic per seed and structurally disjoint
// from cast handles (5,000 seeds, zero collisions), the player's handle
// normalised and refused only when empty or exactly a cast member's;
// cast-wide authorship (a known non-resident authors, an unknown roster
// stub never does); post shape (visibility/media) on NPC and player posts,
// image posts carrying a frozen photo record, polls tallied
// deterministically by the cast at generation and the player's vote
// changeable; private posts refused until Phase 11 opens the page;
// blocking — mutual invisibility through visiblePostsFor, no reactions
// from a blocked NPC on the player's posts, follower/subscriber lists
// pruned, unblock restoring; the D36 follow decision and its daily pass
// (seeded, idempotent, never a blocked NPC); counts by label; and a save
// round-trip of profile + npc.chatter. The handle prompt, profile screen,
// composer and media rendering are verified on the live page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'npc.js', 'notice.js', 'image.js', 'chatter.js', 'platform.js', 'state.js'],
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
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  // Give an NPC a post-worthy event today (a guest visit in the living room) and a loud mouth.
  __eventFor = (g, npcId, day) => { g.world.events.push({ day, tick: 20, roomId: 'living_room', npcId, type: 'guest', moodDelta: 0.1, template: '{name} dropped by for a coffee.', data: {}, seenByPlayer: false }); g.npcs[npcId].bible.speech = { ...(g.npcs[npcId].bible.speech || {}), verbosity: 1 }; g.npcs[npcId].bible.temperament = { ...(g.npcs[npcId].bible.temperament || {}), assertiveness: 1 }; };
  __feed = (g) => g.world.computer.apps.social_feed;
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — platform.js in both lists, CHATTER_LABELS the only home of the tier names, the tables. ${loaded.length} engine files loaded.`);
check("platform.js loaded through loadgame.js's ORDER, after chatter.js", loaded.includes('platform.js') && loaded.indexOf('platform.js') > loaded.indexOf('chatter.js'));
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
const at = (f) => indexHtml.indexOf(`srcfiles/${f}?`);
check('index.html loads platform.js directly after chatter.js', at('platform.js') > at('chatter.js') && at('platform.js') < at('asks.js'), JSON.stringify({ chatter: at('chatter.js'), platform: at('platform.js'), asks: at('asks.js') }));
const reg = J(`({ labels: CHATTER_LABELS, tuning: Object.keys(CHATTER_PLATFORM), pools: Object.keys(CHATTER_HANDLE_POOLS), polls: CHATTER_POLL_TEMPLATES.length, pollsOk: CHATTER_POLL_TEMPLATES.every(t => t.text && t.options.length >= 2 && t.options.length <= 4) })`);
check("CHATTER_LABELS = { friends: 'Friends', followers: 'Followers', backers: 'Backers', private: 'Chatter Private' } (D26)", JSON.stringify(reg.labels) === JSON.stringify({ friends: 'Friends', followers: 'Followers', backers: 'Backers', private: 'Chatter Private' }), JSON.stringify(reg.labels));
const srcFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const leaks = [];
for (const f of srcFiles) {
  if (f === 'defs.works.js') continue;
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  src.split('\n').forEach((line, i) => { if (/'Backers'|"Backers"|'Chatter Private'|"Chatter Private"/.test(line)) leaks.push(`${f}:${i + 1}`); });
}
check(`the strings "Backers" / "Chatter Private" appear in no source file but defs.works.js (invariant 11) — ${srcFiles.length} files swept`, leaks.length === 0, leaks.join(', '));
check('CHATTER_PLATFORM / CHATTER_HANDLE_POOLS / CHATTER_POLL_TEMPLATES exist with sane shapes', reg.tuning.includes('followBase') && reg.tuning.includes('imagePostChance') && reg.tuning.includes('pollVoteChance') && reg.pools.includes('ghostFirst') && reg.polls >= 4 && reg.pollsOk, JSON.stringify(reg));
const chatterSrc = fs.readFileSync(path.join(SRC, 'chatter.js'), 'utf8');
check("chatter.js's header no longer asserts residents-only / non-explicit \"by design\"; it describes the platform (D27)", !/no gating by design/.test(chatterSrc) && /implementation-time scope guesses, not decisions/.test(chatterSrc) && /authorship is cast-wide/.test(chatterSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. The profile (D58) — fresh default, lazy backfill on an old save, partial records completed');
const prof = J(`(() => {
  const fresh = defaultComputerState().apps.social_feed.profile;
  const old = normalizeComputerState({ power: 'off', apps: { social_feed: { posts: [{ id: 'post_1', author: 'npc_x', text: 'hi', likes: [], comments: [], day: 1, eventRef: null }], lastGeneratedDay: 1, nextPostId: 2 } } });
  const g = __mk(1); __feed(g).profile = { handle: 'kept' };
  const p = ensureChatterProfile(g);
  return { fresh, oldHasProfile: !!old.apps.social_feed.profile, oldPosts: old.apps.social_feed.posts.length, backfilled: { handle: p.handle, keys: Object.keys(p).sort(), blocked: p.blocked, backers: p.backers, priv: p.private } };
})()`);
const PROFILE_KEYS = ['backers', 'backersPrice', 'blocked', 'castFollowers', 'ghostFollowers', 'handle', 'lastPostDay', 'private', 'privatePrice', 'subscriptions'];
check('a fresh computer state carries the profile with every field at its default (empty handle, 0 ghosts, no followers/blocks, private closed, prices 5/10)', prof.fresh && prof.fresh.handle === '' && prof.fresh.ghostFollowers === 0 && prof.fresh.castFollowers.length === 0 && prof.fresh.blocked.length === 0 && prof.fresh.private.open === false && prof.fresh.backersPrice === 5 && prof.fresh.privatePrice === 10 && JSON.stringify(Object.keys(prof.fresh).sort()) === JSON.stringify(PROFILE_KEYS), JSON.stringify(prof.fresh));
check('an old save without a profile gets one through normalizeComputerState (posts kept); a partial record is backfilled without losing its handle', prof.oldHasProfile === true && prof.oldPosts === 1 && prof.backfilled.handle === 'kept' && JSON.stringify(prof.backfilled.keys) === JSON.stringify(PROFILE_KEYS) && Array.isArray(prof.backfilled.blocked) && prof.backfilled.backers.ghosts === 0 && prof.backfilled.priv.open === false, JSON.stringify(prof.backfilled));

// ---------------------------------------------------------------- 2
console.log("\n2. Handles (D30) — cast handles from the bible, ghost handles disjoint and deterministic, the player's normalised");
const hs = J(`(() => {
  const g = __mk(2);
  const cast = chatterCastIds(g);
  const handles = cast.map(id => ({ id, handle: ensureNpcChatter(g.npcs[id], g).handle, name: g.npcs[id].bible.name }));
  const g2 = __mk(2);
  const same = cast.every(id => ensureNpcChatter(g2.npcs[id], g2).handle === ensureNpcChatter(g.npcs[id], g).handle);
  const taken = castHandles(g);
  let collisions = 0, sameSeed = ghostHandle(777, taken) === ghostHandle(777, taken), shapeOk = true, distinct = new Set();
  for (let s = 0; s < 5000; s++) { const h = ghostHandle(s, taken); distinct.add(h); if (taken.has(h.toLowerCase())) collisions++; if (!/^(xX[a-z]+Xx|[a-z]+\\d{3,4})$/.test(h)) shapeOk = false; }
  const castShapeOk = handles.every(h => /^[a-z0-9]+_[a-z]*\\d{2}$/.test(h.handle));
  const reSalt = ghostHandle(5, new Set([ghostHandle(5).toLowerCase()]));
  const tries = ['   ', '@Salt Rent 22', 'plain', handles[0].handle, handles[0].handle.toUpperCase(), 'a'.repeat(40)].map(t => { const r = setChatterHandle(g, t); return [t.slice(0, 12), r.ok, r.ok ? r.handle : r.reason]; });
  return { handles, same, collisions, sameSeed, shapeOk, castShapeOk, distinctCount: distinct.size, reSaltDiffers: reSalt !== ghostHandle(5), tries, final: ensureChatterProfile(g).handle };
})()`);
check("every cast NPC has a handle of the form word_nam## derived from their bible — never their name — and the same house on the same seed derives the same handles", hs.handles.length >= 4 && hs.castShapeOk && hs.handles.every(h => h.handle.toLowerCase() !== String(h.name).toLowerCase()) && hs.same === true, JSON.stringify(hs.handles));
check(`ghost handles: deterministic per seed, ${hs.distinctCount} distinct over 5,000 seeds, ${hs.collisions} collisions with the cast, all of the ghost shape (word+word+digits or xX…Xx); a taken handle re-salts`, hs.sameSeed === true && hs.collisions === 0 && hs.shapeOk === true && hs.distinctCount > 3000 && hs.reSaltDiffers === true, JSON.stringify([hs.sameSeed, hs.collisions, hs.shapeOk, hs.distinctCount, hs.reSaltDiffers]));
check("setChatterHandle: empty refused; '@Salt Rent 22' → 'Salt_Rent_22'; a cast member's handle refused in any case; 40 chars capped to 24", hs.tries[0][1] === false && hs.tries[1][1] === true && hs.tries[1][2] === 'Salt_Rent_22' && hs.tries[2][1] === true && hs.tries[3][1] === false && /taken/.test(hs.tries[3][2]) && hs.tries[4][1] === false && hs.tries[5][1] === true && hs.tries[5][2].length === 24 && hs.final === 'a'.repeat(24), JSON.stringify(hs.tries));

// ---------------------------------------------------------------- 3
console.log('\n3. Cast-wide authorship (D28) and the post shape (D27) — a known non-resident authors, an unknown stub never does; media on NPC posts');
const auth = J(`(() => {
  const g = __mk(3);
  const res = __residents(g);
  // The contractor: contactKnown, not a resident. A stranger: neither.
  g.npcs.contractor.contactKnown = true;
  g.npcs.stranger = JSON.parse(JSON.stringify(g.npcs.contractor)); g.npcs.stranger.contactKnown = false; g.npcs.stranger.residency = { status: 'guest' };
  const cast = chatterCastIds(g);
  for (const id of ['contractor', 'stranger']) __eventFor(g, id, 3);
  // Silence the residents so the cap is not hit by them.
  for (const id of res) g.npcs[id].bible.speech = { verbosity: 0 };
  generateChatterForDay(g, 3);
  const posts = __feed(g).posts;
  const byAuthor = posts.map(p => p.author);
  const shape = posts.every(p => p.visibility === 'public' && ('media' in p) && Array.isArray(p.likes));
  // Media over many days: with a roomed event every day, image posts appear at about imagePostChance × (1 − pollPostChance) and polls at pollPostChance.
  let images = 0, polls = 0, total = 0, imageShapeOk = true, pollShapeOk = true;
  for (let d = 4; d <= 203; d++) {
    __eventFor(g, 'contractor', d);
    g.meta.clock.day = d;
    generateChatterForDay(g, d);
    for (const p of __feed(g).posts.filter(p => p.day === d && p.author === 'contractor')) {
      total++;
      if (p.media && p.media.kind === 'image') { images++; if (!(p.media.photo && p.media.photo.prompt && typeof p.media.photo.seed === 'number' && p.media.photo.roomId === 'living_room' && p.media.photo.id === 'chatter_' + p.id)) imageShapeOk = false; }
      if (p.media && p.media.kind === 'poll') { polls++; if (!(p.media.options.length >= 2 && p.media.votes && typeof p.media.votes === 'object' && p.text === p.media.text && p.eventRef === null)) pollShapeOk = false; }
    }
  }
  return { castHasContractor: cast.includes('contractor'), castHasStranger: cast.includes('stranger'), byAuthor, contractorPosted: byAuthor.includes('contractor'), strangerPosted: byAuthor.includes('stranger'), shape, total, images, polls, imageShapeOk, pollShapeOk, imageRate: images / total, pollRate: polls / total, expectImage: CHATTER_PLATFORM.imagePostChance * (1 - CHATTER_PLATFORM.pollPostChance), expectPoll: CHATTER_PLATFORM.pollPostChance };
})()`);
check('the cast is residents + contactKnown: the contractor is on it, an unknown stub is not; the contractor authored a post, the stub did not', auth.castHasContractor && !auth.castHasStranger && auth.contractorPosted && !auth.strangerPosted, JSON.stringify([auth.byAuthor, auth.castHasContractor, auth.castHasStranger]));
check("every NPC post carries visibility 'public' and a media field", auth.shape === true);
check(`over 200 days of roomed events: ${auth.images}/${auth.total} image posts (${auth.imageRate.toFixed(2)} vs ${auth.expectImage.toFixed(2)} expected) and ${auth.polls} polls (${auth.pollRate.toFixed(2)} vs ${auth.expectPoll}), each with the right record shape (a frozen prompt+seed photo keyed chatter_<postId>; options + decided votes)`, auth.total > 60 && auth.images > 0 && auth.polls > 0 && Math.abs(auth.imageRate - auth.expectImage) < 0.08 && Math.abs(auth.pollRate - auth.expectPoll) < 0.07 && auth.imageShapeOk && auth.pollShapeOk, JSON.stringify([auth.total, auth.images, auth.polls, auth.imageShapeOk, auth.pollShapeOk]));

// ---------------------------------------------------------------- 4
console.log('\n4. Polls tally deterministically; the player votes (changeable); private posts refused until the page opens; posting needs a handle');
const poll = J(`(() => {
  const g = __mk(4); const g2 = __mk(4);
  const noHandle = postChatterAsPlayer(g, 'hello', 3);
  setChatterHandle(g, 'me'); setChatterHandle(g2, 'me');
  const a = postChatterAsPlayer(g, 'pizza or tacos', 3, { media: { kind: 'poll', options: ['pizza', 'tacos'] } });
  const b = postChatterAsPlayer(g2, 'pizza or tacos', 3, { media: { kind: 'poll', options: ['pizza', 'tacos'] } });
  const sameVotes = JSON.stringify(a.post.media.votes) === JSON.stringify(b.post.media.votes);
  const before = chatterPollTally(a.post);
  const v1 = voteChatterPoll(g, a.post.id, 1); const v2 = voteChatterPoll(g, a.post.id, 0); const bad = voteChatterPoll(g, a.post.id, 9);
  const one = postChatterAsPlayer(g, 'x', 3, { media: { kind: 'poll', options: ['only'] } });
  const priv = postChatterAsPlayer(g, 'secret', 3, { visibility: 'private' });
  ensureChatterProfile(g).private.open = true;
  const priv2 = postChatterAsPlayer(g, 'secret', 3, { visibility: 'private' });
  const npcVotersOnly = Object.keys(a.post.media.votes).every(k => k === 'player' || k.startsWith('npc_') || k === 'contractor');
  return { noHandle: [noHandle.ok, noHandle.reason], sameVotes, before, after1: v1.tally, after2: v2.tally, bad: bad.ok, one: [one.ok, one.reason], priv: [priv.ok, priv.reason], priv2: [priv2.ok, priv2.post && priv2.post.visibility], npcVotersOnly, lastPostDay: ensureChatterProfile(g).lastPostDay };
})()`);
check("posting without a handle is refused ('Pick a handle first.'); after claiming one, lastPostDay records the day", poll.noHandle[0] === false && /handle/.test(poll.noHandle[1]) && poll.lastPostDay === 3, JSON.stringify(poll.noHandle));
check('a player poll is tallied by the cast identically on two houses with the same seed (decided, seeded); voters are cast ids only', poll.sameVotes === true && poll.npcVotersOnly === true, JSON.stringify(poll.before));
check('the player votes once and can change it (the tally moves by exactly one between options); an out-of-range option and a one-option poll are refused', poll.after1[1] === poll.before[1] + 1 && poll.after2[0] === poll.before[0] + 1 && poll.after2[1] === poll.before[1] && poll.bad === false && poll.one[0] === false && /two options/.test(poll.one[1]), JSON.stringify([poll.before, poll.after1, poll.after2, poll.one]));
check("a private post is refused while the page is closed (naming the tier through CHATTER_LABELS) and accepted once profile.private.open (Phase 11's flag)", poll.priv[0] === false && /Chatter Private isn't open/.test(poll.priv[1]) && poll.priv2[0] === true && poll.priv2[1] === 'private', JSON.stringify([poll.priv, poll.priv2]));

// ---------------------------------------------------------------- 5
console.log('\n5. Blocking (D35) — mutual invisibility, no reactions from a blocked NPC, lists pruned, unblock restores');
const blk = J(`(() => {
  const g = __mk(5);
  const res = __residents(g); const A = res[0], B = res[1];
  setChatterHandle(g, 'me');
  __eventFor(g, A, 3); generateChatterForDay(g, 3);
  const aPost = __feed(g).posts.find(p => p.author === A);
  // A follows and likes the player a lot.
  g.npcs[A].relPlayer.affection = 1; g.npcs[A].relPlayer.trust = 1;
  ensureNpcChatter(g.npcs[A], g).followsPlayer = true; ensureChatterProfile(g).castFollowers.push(A); ensureChatterProfile(g).backers.cast.push(A);
  const p1 = postChatterAsPlayer(g, 'before the block', 3);
  const likedBefore = p1.post.likes.includes(A);
  const b = blockNpc(g, A); const again = blockNpc(g, A);
  const p2 = postChatterAsPlayer(g, 'after the block', 3);
  const prof = ensureChatterProfile(g);
  const lists = { followers: [...prof.castFollowers], backers: [...prof.backers.cast], blocked: [...prof.blocked] };
  const castN = chatterCastIds(g).length;
  const vis = { playerSeesA: visiblePostsFor(g, 'player').some(p => p.author === A), aSeesPlayer: visiblePostsFor(g, A).filter(p => p.author === 'player').length, bSeesPlayer: visiblePostsFor(g, B).filter(p => p.author === 'player').length, bSeesA: visiblePostsFor(g, B).some(p => p.author === A) };
  const fd = castFollowDecision(g, A, () => 0);
  const daily = applyCastFollowsForDay(g, 4);
  const counts = chatterAudienceCounts(g);
  const un = unblockNpc(g, A); const unAgain = unblockNpc(g, A);
  const visAfter = { playerSeesA: visiblePostsFor(g, 'player').some(p => p.author === A), aSeesPlayer: visiblePostsFor(g, A).filter(p => p.author === 'player').length };
  return { aPosted: !!aPost, likedBefore, b: b.ok, again: [again.ok, again.reason], likedAfter: p2.post.likes.includes(A), followsAfter: g.npcs[A].chatter.followsPlayer, lists, castN, vis, fd, dailyIncludesA: daily.includes(A), counts, un: un.ok, unAgain: unAgain.ok, visAfter };
})()`);
check('blocking: the blocked NPC leaves the follower and backer lists and its followsPlayer flips off; a second block is refused', blk.b === true && blk.again[0] === false && blk.followsAfter === false && !blk.lists.followers.includes(blk.lists.blocked[0]) && blk.lists.backers.length === 0 && blk.lists.blocked.length === 1, JSON.stringify(blk.lists));
check("mutual invisibility: the player no longer sees A's post, A sees none of the player's posts, B still sees both; A liked the player's post before the block and cannot after", blk.aPosted && blk.likedBefore === true && blk.vis.playerSeesA === false && blk.vis.aSeesPlayer === 0 && blk.vis.bSeesPlayer === 2 && blk.vis.bSeesA === true && blk.likedAfter === false, JSON.stringify([blk.likedBefore, blk.vis, blk.likedAfter]));
check("a blocked NPC never follows (castFollowDecision → 'blocked' at chance 0; the daily pass skips them) and the Friends count excludes them", blk.fd.follow === false && blk.fd.chance === 0 && blk.fd.reasons.includes('blocked') && blk.dailyIncludesA === false && blk.counts.friends === blk.castN - 1, JSON.stringify([blk.fd, blk.dailyIncludesA, blk.counts, blk.castN]));
check('unblocking restores visibility both ways; unblocking twice is refused', blk.un === true && blk.unAgain === false && blk.visAfter.playerSeesA === true && blk.visAfter.aSeesPlayer === 2, JSON.stringify([blk.un, blk.unAgain, blk.visAfter]));

// ---------------------------------------------------------------- 6
console.log('\n6. The follow decision (D36) and its daily pass — affinity-driven, seeded, idempotent; counts by label');
const fol = J(`(() => {
  const g = __mk(6);
  const res = __residents(g);
  setChatterHandle(g, 'me');
  for (const id of res) { g.npcs[id].relPlayer.affection = 0; g.npcs[id].relPlayer.tension = 0; g.npcs[id].relPlayer.trust = 0; }
  const cold = castFollowDecision(g, res[0], () => 0.99);
  g.npcs[res[0]].relPlayer.affection = 1; g.npcs[res[0]].relPlayer.trust = 1;
  const warm = castFollowDecision(g, res[0], () => 0.99);
  const warmChance = warm.chance;
  postChatterAsPlayer(g, 'hello world', 3);
  const warmPosted = castFollowDecision(g, res[0], () => 0.99).chance;
  // Interest match: post about the NPC's first interest.
  const interest = (g.npcs[res[1]].bible.interests[0] || {}).name || 'hiking';
  postChatterAsPlayer(g, 'obsessed with ' + interest + ' lately', 3);
  const matched = castFollowDecision(g, res[1], () => 0.99);
  // The daily pass: with everyone warm, most follow within a few days; idempotent per day.
  for (const id of res) { g.npcs[id].relPlayer.affection = 1; g.npcs[id].relPlayer.trust = 1; }
  let newly = 0; for (let d = 4; d <= 30; d++) newly += applyCastFollowsForDay(g, d).length;
  const again = applyCastFollowsForDay(g, 30).length;
  const prof = ensureChatterProfile(g);
  const counts = chatterAudienceCounts(g);
  const expectedCold = CHATTER_PLATFORM.followBase * CHATTER_PLATFORM.followNoPostsMult;
  const castN = chatterCastIds(g).length;
  return { cold: cold.chance, expectedCold, warmChance, warmPosted, expectedWarmPosted: CHATTER_PLATFORM.followBase + CHATTER_PLATFORM.followAffinity * chatterAffinity(g, res[0], 'player'), matched, newly, again, followers: prof.castFollowers.length, castN, ghosts: Math.round(prof.ghostFollowers || 0), flags: res.map(id => g.npcs[id].chatter.followsPlayer), counts };
})()`);
check(`a cold stranger with nothing posted has chance followBase × noPostsMult = ${fol.expectedCold.toFixed(3)}; a warm NPC after a post has followBase + affinity × followAffinity`, Math.abs(fol.cold - fol.expectedCold) < 1e-9 && fol.warmChance > fol.cold && Math.abs(fol.warmPosted - fol.expectedWarmPosted) < 1e-9, JSON.stringify([fol.cold, fol.warmChance, fol.warmPosted, fol.expectedWarmPosted]));
check("a post that names one of the NPC's interests adds followInterest ('shares an interest')", fol.matched.reasons.includes('shares an interest') && fol.matched.chance >= CHATTER_PLATFORM_FOLLOW_INTEREST_MIN() - 1e-9, JSON.stringify(fol.matched));
// Phase 10: the two posts above grow a ghost following too, so the followers count is cast + rounded ghosts.
check('the daily pass, with everyone warm, has every cast member (residents + the known contractor) following within 27 days; re-running the same day adds nothing; counts reflect it', fol.newly === fol.castN && fol.again === 0 && fol.followers === fol.castN && fol.flags.every(f => f === true) && fol.counts.followers === fol.castN + fol.ghosts && fol.counts.friends === fol.castN, JSON.stringify([fol.newly, fol.again, fol.followers, fol.castN, fol.ghosts, fol.flags, fol.counts]));
function CHATTER_PLATFORM_FOLLOW_INTEREST_MIN() { return J('CHATTER_PLATFORM.followBase + CHATTER_PLATFORM.followInterest'); }

// ---------------------------------------------------------------- 7
console.log('\n7. Save round-trip — profile (computer world key) and npc.chatter (npcs folder) byte-identical');
const persist = J(`(() => {
  const g = __mk(7); const res = __residents(g);
  setChatterHandle(g, 'kept_handle'); blockNpc(g, res[2]); ensureNpcChatter(g.npcs[res[0]], g).followsPlayer = true; ensureChatterProfile(g).castFollowers.push(res[0]);
  postChatterAsPlayer(g, 'a poll', 3, { media: { kind: 'poll', options: ['a', 'b'] } });
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const computer = normalizeComputerState(rt.world.computer);
  return { profileSame: JSON.stringify(computer.apps.social_feed.profile) === JSON.stringify(ensureChatterProfile(g)), handle: computer.apps.social_feed.profile.handle, blocked: computer.apps.social_feed.profile.blocked, npcSame: JSON.stringify(rt.npcs[res[0]].chatter) === JSON.stringify(g.npcs[res[0]].chatter), npcHandle: rt.npcs[res[0]].chatter.handle, postMedia: computer.apps.social_feed.posts[0].media.kind };
})()`);
check('captureSavePayload → JSON → normalizeComputerState carries the profile (handle, blocked) and the poll post; npc.chatter rides the npc record', persist.profileSame === true && persist.handle === 'kept_handle' && persist.blocked.length === 1 && persist.npcSame === true && /_/.test(persist.npcHandle) && persist.postMedia === 'poll', JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
