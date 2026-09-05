// ===== SECTION: CHATTER =====
// Domain logic for Chatter (actions-and-activities-overhaul-plan.md Phase 15,
// D24): `social_feed` grows from a static flavor site (SITE_DEFS, pre-Phase
// 15) into a real in-house social feed. Pure state — post generation,
// NPC-authored reactions, player posting/liking/commenting — with zero DOM
// dependency, same discipline as money.js/mail.js/puzzles.js.
// render.computer.js draws it; ui.computer.js wires clicks/typing to the
// functions here.
//
// "Decide before you decorate" (design invariant 1): every post's SOURCE is
// a real house happening — a `world.events` entry the author lived through,
// or a fact already sitting in the author's own `memory.facts` (the
// knowledge-gossip-memory-plan's belief store, npc.js) — chosen and scored
// deterministically. The template text is decoration on top of a decided
// source, never the other way around; a live "polish this with the LLM"
// pass (root.generateText, asks.js's draftAskPhotoPrompt pattern) is a
// presentation-layer enhancement this file deliberately does not attempt —
// invariant 7 splits pure logic (here, Node-testable) from anything that
// needs a live root.generateText call (ui.computer.js, live-page-only).
//
// Nothing here spends a new gate: NSFW/consent stays exactly what it always
// was (CONTENT_CONFIG.mature, "no gating by design") because a post is never
// more explicit than the templates below — a scandal event still reads as
// "heard {text} 👀", never as an explicit description. If a future phase
// wants explicit Chatter content it needs the same three-condition gate
// image.js already uses, not a new one invented here.

const CHATTER_TUNING = {
  maxBackfillDays: 5,      // how many past days generateChatterForDay will catch up in one call
  maxPostsPerDay: 3,       // cap on new NPC-authored posts per in-game day
  feedRetentionDays: 21,   // posts older than this (relative to the day just generated) are pruned
  postScoreRef: 0.5,       // P(post) = talkativeness(author) * candidateScore / this, capped at 1 — same scale TRANSMISSION.raiseScoreRef uses for the sibling gossip-raise roll
  reactionWindowDays: 6,   // a post stops collecting new NPC reactions once older than this
  likeBaseChance: 0.12,    // floor chance any given housemate likes a post, before affinity
  likeAffinityWeight: 0.55,
  commentBaseChance: 0.05,
  commentAffinityWeight: 0.25,
};

// First-person wrapper pool for event-sourced posts (the author's own day),
// bucketed by the event's own moodDelta sign. Second-person/gossip wrapper
// pool for fact-sourced posts (something the author believes about the
// house, possibly about someone else entirely — "the tea" voice fits an
// arbitrary subject in a way a forced first-person rewrite would not).
const CHATTER_EVENT_TEMPLATES = {
  upbeat: ['{text} 🙂', 'good day honestly: {text}', 'not gonna lie, {text}', 'today was a good one — {text}'],
  salty: ['{text} 😩', 'need to vent — {text}', 'today just kept going: {text}', 'why is it always something — {text}'],
  neutral: ['{text}', 'today: {text}', 'apartment life: {text}', 'just putting this out there — {text}'],
};
const CHATTER_FACT_TEMPLATES = {
  upbeat: ['apparently {text} 👀', 'love this for them — {text}', 'the good kind of tea: {text}'],
  salty: ['apparently {text} 👀', 'yikes — {text}', 'the tea: {text}'],
  neutral: ['apparently {text}', 'heard {text}', 'the word around here: {text}'],
};
const CHATTER_COMMENT_TEMPLATES = {
  supportive: ['omg same', 'living for this', 'no because SAME', 'this is so real for me', 'I felt this', '💀💀💀'],
  neutral: ['huh, interesting', 'noted', 'lol ok', 'wild'],
};
const CHATTER_UPBEAT_TAGS = new Set(['success', 'warmth', 'romance']);
const CHATTER_SALTY_TAGS = new Set(['grievance', 'argument', 'embarrassment', 'failure']);

function chatterFactMoodBucket(tag) {
  if (CHATTER_UPBEAT_TAGS.has(tag)) return 'upbeat';
  if (CHATTER_SALTY_TAGS.has(tag)) return 'salty';
  return 'neutral';
}

// world.events carries no emotionalTag (that's a memory.facts/episode-only
// field) — moodDelta is the signal every event already has, so bucketing
// reads that directly instead of inventing a parallel tag table.
function chatterEventMoodBucket(evt) {
  const d = evt?.moodDelta || 0;
  if (d > 0.01) return 'upbeat';
  if (d < -0.01) return 'salty';
  return 'neutral';
}

// Every resident is a Chatter "friend" by construction — no separate follow
// graph. RoomList applicants, evicted former residents, and in-flight
// fetch-queue stubs never post or react.
function chatterResidentIds(gameState) {
  return Object.keys(gameState?.npcs || {})
    .filter((id) => gameState.npcs[id]?.residency?.status === 'resident')
    .sort();
}

// evt.template renders in THIRD person for the narration log (formatEventText,
// sim.js) by substituting the NPC's real name for {name}. English past tense
// doesn't conjugate by person, so substituting 'I' in its place instead
// produces grammatical first-person text ("I practiced guitar for an hour")
// without a real rewrite — a deliberate one-line divergence from
// formatEventText, not a duplicate of it.
function chatterEventFirstPerson(evt, npcs) {
  let text = evt?.template || '';
  text = text.replace('{name}', 'I');
  if (evt?.data) {
    for (const [k, v] of Object.entries(evt.data)) {
      if (typeof v !== 'string') continue;
      if (k === 'other' && npcs[v]) text = text.replace(`{${k}}`, npcs[v].bible?.name || 'someone');
      else text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

function chatterEventWeight(evt) {
  const band = EVENT_IMPORTANCE[evt?.type];
  return MEMORY_IMPORTANCE[band] ?? MEMORY_IMPORTANCE.ambient;
}

// The same recency x weight x personality-bias shape factRaiseScore (npc.js)
// uses for the sibling gossip-raise roll, minus factInterestRelevance —
// there's no single listener to be relevant TO when posting publicly.
// category:'social' is a deliberate approximation: every EVENT_IMPORTANCE-
// classified type (npc_chat, guest, date, argument, gift, ...) is a real
// social happening, and 'social' is literally one of TRANSMISSION's own
// socialCategories, so this correctly earns the warmth bias without a new
// event-type -> category table.
function chatterEventScore(evt, chooser, nowDay) {
  return factRecency({ day: evt.day }, nowDay)
    * chatterEventWeight(evt)
    * factPersonalityBias({ category: 'social', provenance: 'witnessed' }, chooser);
}

function chatterFactScore(f, chooser, nowDay) {
  return factRecency(f, nowDay) * factEmotionalWeight(f) * factPersonalityBias(f, chooser);
}

// The single highest-scoring thing npcId could post about today — one
// candidate per author per day (a person posts about their most notable
// recent thing, not a thread of everything that happened to them).
function chatterBestCandidateForDay(gameState, npc, npcId, day) {
  const lookbackFrom = day - CHATTER_TUNING.maxBackfillDays;
  let best = null;
  const events = Array.isArray(gameState.world?.events) ? gameState.world.events : [];
  for (const evt of events) {
    if (!evt || evt.npcId !== npcId || evt.day == null || evt.day > day || evt.day < lookbackFrom) continue;
    if (!EVENT_IMPORTANCE[evt.type]) continue; // ambient/unclassified events are never post-worthy
    const score = chatterEventScore(evt, npc, day);
    if (!best || score > best.score) best = { kind: 'event', score, evt, sourceDay: evt.day };
  }
  const facts = (npc?.memory && Array.isArray(npc.memory.facts)) ? npc.memory.facts : [];
  for (const f of facts) {
    if (!f || f.valid === false || (f.confidence ?? 1) <= BELIEF.confidenceFloor) continue;
    if (f.day == null || f.day > day || f.day < lookbackFrom) continue;
    const score = chatterFactScore(f, npc, day);
    if (!best || score > best.score) best = { kind: 'fact', score, fact: f, sourceDay: f.day };
  }
  return best;
}

function chatterRenderText(gameState, candidate, rng) {
  if (candidate.kind === 'event') {
    const raw = chatterEventFirstPerson(candidate.evt, gameState.npcs);
    const pool = CHATTER_EVENT_TEMPLATES[chatterEventMoodBucket(candidate.evt)];
    return weightedPick(rng, pool).replace('{text}', raw);
  }
  const raw = candidate.fact.text || '';
  const pool = CHATTER_FACT_TEMPLATES[chatterFactMoodBucket(candidate.fact.emotionalTag)];
  return weightedPick(rng, pool).replace('{text}', raw);
}

// NPC<->NPC affinity reads world.castWeb (the pairwise social axes every
// resident already has from cast generation, sim.js); NPC<->player reads
// npc.relPlayer (the SAME axes shape, kept on each NPC toward the player).
// Neither store is written here — this is a pure read composing an existing
// signal into one [-1,1] number, never a third relationship ledger.
function chatterAffinity(gameState, reactorId, authorId) {
  let axis = null;
  if (authorId === 'player') axis = gameState.npcs?.[reactorId]?.relPlayer || null;
  else if (reactorId === 'player') axis = gameState.npcs?.[authorId]?.relPlayer || null;
  else {
    const rec = gameState.world?.castWeb?.[pairKey(reactorId, authorId)];
    axis = rec?.axes?.[`${reactorId}→${authorId}`] || null;
  }
  if (!axis) return 0;
  return clamp((axis.affection || 0) * 0.6 + (axis.trust || 0) * 0.3 - (axis.tension || 0) * 0.4, -1, 1);
}

// Rolls every resident (other than the author) against every post still
// inside its reaction window. A "no" this pass isn't sticky — a post keeps
// getting re-rolled on every later generateChatterForDay call until it's
// liked or the window closes, so affinity/day drift can still bring a late
// like in. Idempotent per (post, reactor): already-liked/-commented pairs
// are skipped, never re-rolled or duplicated.
function applyChatterReactions(gameState, posts, day, rng) {
  const residents = chatterResidentIds(gameState);
  for (const post of posts) {
    if (day - post.day > CHATTER_TUNING.reactionWindowDays) continue;
    for (const reactorId of residents) {
      if (reactorId === post.author) continue;
      if (post.likes.includes(reactorId)) continue;
      const affinity = chatterAffinity(gameState, reactorId, post.author);
      const likeChance = clamp01(CHATTER_TUNING.likeBaseChance + affinity * CHATTER_TUNING.likeAffinityWeight);
      if (rng() >= likeChance) continue;
      post.likes.push(reactorId);
      if (post.comments.some((c) => c.author === reactorId)) continue;
      const commentChance = clamp01(CHATTER_TUNING.commentBaseChance + Math.max(0, affinity) * CHATTER_TUNING.commentAffinityWeight);
      if (rng() >= commentChance) continue;
      const bucket = affinity >= 0 ? 'supportive' : 'neutral';
      post.comments.push({ author: reactorId, text: weightedPick(rng, CHATTER_COMMENT_TEMPLATES[bucket]) });
    }
  }
}

function pruneChatterFeed(gameState, day) {
  const feed = gameState.world.computer.apps.social_feed;
  feed.posts = feed.posts.filter((p) => day - p.day <= CHATTER_TUNING.feedRetentionDays);
}

function generateChatterForSingleDay(gameState, day) {
  const feed = gameState.world.computer.apps.social_feed;
  const rng = seededRng(gameState.meta.seed, `chatter_post_${day}`);
  const drafts = [];
  for (const npcId of chatterResidentIds(gameState)) {
    const npc = gameState.npcs[npcId];
    const candidate = chatterBestCandidateForDay(gameState, npc, npcId, day);
    if (!candidate) continue;
    const p = Math.min(1, talkativeness(npc) * candidate.score / CHATTER_TUNING.postScoreRef);
    if (rng() >= p) continue;
    drafts.push({ npcId, candidate });
  }
  // Deterministic truncation to maxPostsPerDay: highest-scoring drafts win,
  // never iteration order (which would silently favor low-id npcs).
  drafts.sort((a, b) => b.candidate.score - a.candidate.score);
  for (const { npcId, candidate } of drafts.slice(0, CHATTER_TUNING.maxPostsPerDay)) {
    feed.posts.push({
      id: 'post_' + (feed.nextPostId++),
      author: npcId,
      text: chatterRenderText(gameState, candidate, rng),
      likes: [], comments: [], day,
      eventRef: { kind: candidate.kind, day: candidate.sourceDay },
    });
  }
}

// Seeded, idempotent, catch-up generation — same discipline as puzzles.js's
// generatePuzzleForDay: a day already generated is a no-op, and reopening
// the app twice in one day never re-rolls anything out from under a reader.
// Unlike a single-puzzle app, Chatter's state ACCUMULATES (a feed, not one
// current puzzle), so the guard is a watermark (lastGeneratedDay) rather
// than an equality check, and a save that hasn't opened Chatter in a long
// time backfills only the most recent maxBackfillDays — same silent-discard
// philosophy debugLog's own day-window pruning uses, so a 200-day-old save
// doesn't flood the feed with a full history on first open.
function generateChatterForDay(gameState, day) {
  const feed = gameState.world.computer.apps.social_feed;
  const startDay = Math.max(feed.lastGeneratedDay + 1, day - CHATTER_TUNING.maxBackfillDays + 1);
  for (let d = startDay; d <= day; d++) {
    generateChatterForSingleDay(gameState, d);
    applyChatterReactions(gameState, feed.posts, d, seededRng(gameState.meta.seed, `chatter_react_${d}`));
  }
  feed.lastGeneratedDay = Math.max(feed.lastGeneratedDay, day);
  pruneChatterFeed(gameState, day);
}

// --- Player-authored actions -------------------------------------------
// All three are out-of-band (can fire any time, not just at day generation),
// so each mints its own subseed rather than reusing the day's generation rng.

function postChatterAsPlayer(gameState, text, day) {
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) return { ok: false };
  const feed = gameState.world.computer.apps.social_feed;
  const post = { id: 'post_' + (feed.nextPostId++), author: 'player', text: clean, likes: [], comments: [], day, eventRef: null };
  feed.posts.push(post);
  pushMoodImpulse(gameState.player, MOOD_PAYOUTS.chatterPost, day);
  applyChatterReactions(gameState, [post], day, seededRng(gameState.meta.seed, `chatter_react_player_${post.id}`));
  return { ok: true, post };
}

function toggleChatterLike(gameState, postId) {
  const feed = gameState.world.computer.apps.social_feed;
  const post = feed.posts.find((p) => p.id === postId);
  if (!post) return { ok: false };
  const idx = post.likes.indexOf('player');
  if (idx >= 0) post.likes.splice(idx, 1); else post.likes.push('player');
  return { ok: true, liked: idx < 0 };
}

function addChatterComment(gameState, postId, text) {
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) return { ok: false };
  const feed = gameState.world.computer.apps.social_feed;
  const post = feed.posts.find((p) => p.id === postId);
  if (!post) return { ok: false };
  post.comments.push({ author: 'player', text: clean });
  return { ok: true };
}

// ===== /SECTION: CHATTER =====
