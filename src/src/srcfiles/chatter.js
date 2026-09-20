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
// Since the aspirations-and-creative-careers overhaul's Phase 9 (D27/D28),
// Chatter is a PLATFORM, not a house-only feed: authorship is the whole
// known cast (chatterCastIds, platform.js — residents plus every NPC whose
// contact is known), a post carries `visibility` ('public' | 'private') and
// optional `media` (a frozen image record or a poll), and platform.js owns
// the audience side — handles, followers, blocking, what each viewer can
// see. The earlier header's "residents-only" and "non-explicit by design"
// claims were implementation-time scope guesses, not decisions; what is
// true now: authorship is cast-wide, and NPC-authored TEXT is still never
// more explicit than the templates below. Explicit content, when Phase 11's
// Chatter Private exists, renders only through image.js's three-condition
// gate (D31/D41) — this file never adds a fourth condition and never
// bypasses the three.

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

// Residents — kept as the reactor pool's floor and for the pre-Phase-9
// callers. RoomList applicants, evicted former residents, and in-flight
// fetch-queue stubs never post or react.
function chatterResidentIds(gameState) {
  return Object.keys(gameState?.npcs || {})
    .filter((id) => gameState.npcs[id]?.residency?.status === 'resident')
    .sort();
}

// Phase 9 (D28): who authors and reacts — the whole known cast when
// platform.js is loaded (residents + contactKnown), residents otherwise.
function chatterAuthorIds(gameState) {
  return typeof chatterCastIds === 'function' ? chatterCastIds(gameState) : chatterResidentIds(gameState);
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
    // Phase 13 (D43): who is behind a handle travels by gossip, never by a
    // public post — an NPC outing someone on the platform is not this
    // plan's call.
    if (f.kind === 'identity_link') continue;
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
  const reactors = chatterAuthorIds(gameState);
  const blocked = (typeof ensureChatterProfile === 'function') ? ensureChatterProfile(gameState).blocked : [];
  for (const post of posts) {
    if (day - post.day > CHATTER_TUNING.reactionWindowDays) continue;
    for (const reactorId of reactors) {
      if (reactorId === post.author) continue;
      // Phase 9 (D35): a blocked NPC cannot see the player's posts, so
      // cannot react to them; a Private post is reactable only by its
      // subscribers (Phase 11 fills `subscribes`).
      if (post.author === 'player' && blocked.includes(reactorId)) continue;
      if (post.visibility === 'private' && gameState.npcs[reactorId]?.chatter?.subscribes !== 'private') continue;
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

// Phase 9 (D27): an image-worthy source — an event with a room — gets a
// frozen photo record the way the camera freezes one (image.js's
// buildPhotoPrompt shape: prompt + seed, never a blob), so the same
// getPhotoImage path draws it on both devices. Pure; seeded per post.
function chatterImageFor(gameState, npcId, candidate, postId) {
  if (candidate.kind !== 'event' || !candidate.evt?.roomId || !ROOMS[candidate.evt.roomId]) return null;
  if (typeof buildPhotoPrompt !== 'function') return null;
  const roomId = candidate.evt.roomId;
  const npc = gameState.npcs[npcId];
  const phase = typeof getPhase === 'function' ? getPhase(gameState.meta.clock?.minutes || 720) : 'midday';
  const prompt = buildPhotoPrompt(roomId, phase, npc ? [npc] : [], gameState.objects?.[`room_${roomId}`] || {}, { gameState })
    + ' Candid smartphone photo posted to a social feed, casual framing.';
  const id = `chatter_${postId}`;
  return { kind: 'image', photo: { id, day: candidate.sourceDay, roomId, subjectNpcIds: [npcId], caption: `${ROOMS[roomId]?.name || roomId}`, prompt, seed: hashStr(`${gameState.meta.seed}|chatter_photo|${postId}`), tags: ['chatter'] } };
}

// Phase 9 (D27): a poll — a house question with 2–4 options, tallied at
// generation by the rest of the cast (seeded), so the count is decided
// before anyone reads it. `votes` maps voterId → option index; the player's
// vote lands through voteChatterPoll.
function chatterPollFor(gameState, npcId, rng) {
  if (typeof CHATTER_POLL_TEMPLATES === 'undefined') return null;
  const tpl = CHATTER_POLL_TEMPLATES[Math.floor(rng() * CHATTER_POLL_TEMPLATES.length)];
  const votes = {};
  for (const voterId of chatterAuthorIds(gameState)) {
    if (voterId === npcId) continue;
    if (rng() < CHATTER_PLATFORM.pollVoteChance) votes[voterId] = Math.floor(rng() * tpl.options.length);
  }
  return { kind: 'poll', options: [...tpl.options], votes, text: tpl.text };
}

function generateChatterForSingleDay(gameState, day) {
  const feed = gameState.world.computer.apps.social_feed;
  const rng = seededRng(gameState.meta.seed, `chatter_post_${day}`);
  const drafts = [];
  for (const npcId of chatterAuthorIds(gameState)) {
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
    const id = 'post_' + (feed.nextPostId++);
    // Phase 9 (D27): kind by a seeded roll — a poll instead of the
    // candidate's text this often; else the text, with an image when the
    // source has a room this often. The DECISION (which kind, which
    // photo, who voted) is made here; templates only phrase it.
    const asPoll = typeof CHATTER_PLATFORM !== 'undefined' && rng() < CHATTER_PLATFORM.pollPostChance;
    const poll = asPoll ? chatterPollFor(gameState, npcId, rng) : null;
    // Phase 12 (D39): a creator's ordinary posts carry a photo more often.
    const creator = typeof npcCreator === 'function' ? npcCreator(gameState.npcs[npcId]) : null;
    const imgChance = typeof CHATTER_PLATFORM !== 'undefined' ? CHATTER_PLATFORM.imagePostChance * (creator && creator.active ? CHATTER_PLATFORM.creatorImageMult : 1) : 0;
    const media = poll || ((rng() < imgChance) ? chatterImageFor(gameState, npcId, candidate, id) : null);
    feed.posts.push({
      id, author: npcId,
      text: poll ? poll.text : chatterRenderText(gameState, candidate, rng),
      likes: [], comments: [], day,
      eventRef: poll ? null : { kind: candidate.kind, day: candidate.sourceDay },
      visibility: 'public',
      media,
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

// Phase 9 (D27/D30): a player post carries `visibility` ('public' by
// default; 'private' only once Phase 11's page is open — refused until
// then) and optional `media` (a frozen photo record from the camera roll
// by id, or a poll the player wrote). Posting needs a handle (D30). The
// profile's lastPostDay feeds Phase 10's cadence bonus.
function postChatterAsPlayer(gameState, text, day, opts = {}) {
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) return { ok: false, reason: 'Write something first.' };
  const feed = gameState.world.computer.apps.social_feed;
  const profile = typeof ensureChatterProfile === 'function' ? ensureChatterProfile(gameState) : null;
  if (profile && !profile.handle) return { ok: false, reason: 'Pick a handle first.' };
  const visibility = opts.visibility === 'private' ? 'private' : 'public';
  if (visibility === 'private' && !(profile && profile.private && profile.private.open)) return { ok: false, reason: `${CHATTER_LABELS.private} isn't open.` };
  let media = null;
  if (opts.media && opts.media.kind === 'image' && opts.media.photoId) {
    const photo = (gameState.world.phone?.camera?.roll || []).find(p => p.id === opts.media.photoId);
    if (!photo) return { ok: false, reason: 'That photo is no longer in your camera roll.' };
    // Phase 11 (D33/D41): featuring another person is an Ask — a cast
    // member in the frame must hold a consent_feature fact for THIS photo
    // (the $Feature leaf writes it), whatever the visibility.
    if (typeof photoSubjectsWithoutConsent === 'function') {
      const missing = photoSubjectsWithoutConsent(gameState, photo);
      if (missing.length > 0) {
        const names = missing.map(id => gameState.npcs[id]?.bible?.name || 'someone').join(' and ');
        return { ok: false, reason: `${names} hasn't agreed to be posted — ask first ($Feature).` };
      }
    }
    media = { kind: 'image', photo: { ...photo } };
  } else if (opts.media && opts.media.kind === 'poll') {
    const options = (opts.media.options || []).map(o => String(o || '').trim().slice(0, 40)).filter(Boolean).slice(0, 4);
    if (options.length < 2) return { ok: false, reason: 'A poll needs at least two options.' };
    media = { kind: 'poll', options, votes: {}, text: clean };
  }
  // Phase 10 (D29): what the post is ABOUT decides its appeal — a released
  // work of the player's, a craft skill, or nothing (lifestyle).
  const source = opts.source && opts.source.kind === 'work' && (gameState.player.works || []).some(w => w.id === opts.source.workId && w.releasedDay != null) ? { kind: 'work', workId: opts.source.workId }
    : opts.source && opts.source.kind === 'skill' && SKILL_IDS.includes(opts.source.skillId) ? { kind: 'skill', skillId: opts.source.skillId }
    : null;
  const post = { id: 'post_' + (feed.nextPostId++), author: 'player', text: clean, likes: [], comments: [], day, eventRef: null, visibility, media, meta: { source } };
  // Appeal is decided at post time and stamped (before lastPostDay moves,
  // so the cadence bonus reads the PREVIOUS post's day); growth follows.
  let growth = null;
  if (typeof postAppeal === 'function') {
    post.appeal = postAppeal(gameState, post);
    if (visibility === 'public') growth = applyGrowth(gameState, post);
  }
  feed.posts.push(post);
  if (profile) profile.lastPostDay = day;
  pushMoodImpulse(gameState.player, MOOD_PAYOUTS.chatterPost, day);
  // Q3 → D90: a ghost comment on a post that did well. No name is stored —
  // the handle is ghostHandle(seed) at render, from the comment's seed.
  if (typeof CHATTER_GHOST_COMMENTS !== 'undefined' && typeof post.appeal === 'number' && post.appeal >= CHATTER_PLATFORM.ghostCommentMinAppeal && visibility === 'public') {
    const grng = seededRng(gameState.meta.seed, `ghost_comment_${post.id}`);
    if (grng() < CHATTER_PLATFORM.ghostCommentChance) {
      post.comments.push({ author: null, ghost: true, seed: hashStr(`${gameState.meta.seed}|ghost|${post.id}`), text: CHATTER_GHOST_COMMENTS[Math.floor(grng() * CHATTER_GHOST_COMMENTS.length)] });
    }
  }
  applyChatterReactions(gameState, [post], day, seededRng(gameState.meta.seed, `chatter_react_player_${post.id}`));
  // Phase 9: a player poll gets its cast tally the same way an NPC's does —
  // decided now, seeded on the post.
  if (media && media.kind === 'poll') {
    const rng = seededRng(gameState.meta.seed, `chatter_poll_${post.id}`);
    const blocked = profile ? profile.blocked : [];
    for (const voterId of chatterAuthorIds(gameState)) {
      if (blocked.includes(voterId)) continue;
      if (rng() < CHATTER_PLATFORM.pollVoteChance) media.votes[voterId] = Math.floor(rng() * media.options.length);
    }
  }
  return { ok: true, post, growth };
}

// Phase 9 (D27): the player votes on a poll — one vote, changeable. NPC
// votes were decided at generation and never move.
function voteChatterPoll(gameState, postId, optionIndex) {
  const feed = gameState.world.computer.apps.social_feed;
  const post = feed.posts.find((p) => p.id === postId);
  if (!post || !post.media || post.media.kind !== 'poll') return { ok: false, reason: 'Not a poll.' };
  const idx = Number(optionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= post.media.options.length) return { ok: false, reason: 'No such option.' };
  post.media.votes.player = idx;
  return { ok: true, tally: chatterPollTally(post) };
}

// The decided tally: option index → count, in option order.
function chatterPollTally(post) {
  const counts = post.media.options.map(() => 0);
  for (const v of Object.values(post.media.votes || {})) if (Number.isInteger(v) && counts[v] !== undefined) counts[v]++;
  return counts;
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
