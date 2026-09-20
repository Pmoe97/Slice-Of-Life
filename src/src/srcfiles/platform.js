// ===== SECTION: PLATFORM =====
// Chatter as a public platform (aspirations-and-creative-careers-overhaul-
// plan Phases 9–13, D26–D45). chatter.js keeps the FEED — event-sourced NPC
// posts, reactions, the player's post/like/comment verbs. This file owns
// the AUDIENCE: who is on the platform, under what handle, who follows or
// blocks whom, what a given viewer can see. Phase 9 lands the model —
// profile + handle, the three audience layers (cast / ghosts /
// subscribers), cast-wide authorship, manual blocking, visibility —
// with NO money; Phase 10 adds growth, Backers and platform perception,
// Phase 11 Chatter Private, Phase 12 NPC creators, Phase 13 recognition.
//
// The three layers (D28):
//   Cast    — every NPC who is a resident or whose contact is known
//             (chatterCastIds). Real people: they post, react, follow,
//             block, subscribe — as DECISIONS (D36/D42), never rolls alone.
//   Ghosts  — profile.ghostFollowers, a NUMBER. ghostHandle(seed) is
//             regenerated for a notification line and never stored
//             (invariant 9): a ghost with a saved name would be a cast
//             member and the model would have collapsed into simulating
//             the internet.
//   Subscribers — cast or ghosts on `backers` or `private`, tracked
//             separately because they cost money (Phases 10–11).
//
// Pseudonymous by default (D30): the player picks a handle on first open
// (setChatterHandle); every cast NPC gets one derived from their bible
// (npcChatterHandle, seeded on genSeed). A handle is never a name.
//
// Blocking is manual and per-NPC (D35): profile.blocked. Mutual by
// construction — a blocked NPC neither sees the player's posts nor is seen
// (visiblePostsFor), cannot follow, and drops out of the follower list.
// No safety net: nothing suggests who to block.
//
// Every string a player reads for a layer's NAME comes from CHATTER_LABELS
// (defs.works.js, invariant 11). Pure logic, no DOM (invariant 7).

// --- Profile and per-NPC state ---------------------------------------------

// The player's platform record on world.computer.apps.social_feed.profile
// (D58). Lazy default (the additive-default precedent; the app's fresh
// state in defaultComputerState carries the same shape so a new game and
// an old save agree). subscriptions is the player's OWN subscriptions to
// NPC creators (Phase 12).
function defaultChatterProfile() {
  return {
    handle: '', ghostFollowers: 0, castFollowers: [],
    backers: { ghosts: 0, cast: [] },
    private: { open: false, ghosts: 0, cast: [] },
    backersPrice: CHATTER_PLATFORM.backersPriceDefault, privatePrice: CHATTER_PLATFORM.privatePriceDefault,
    blocked: [], lastPostDay: 0, subscriptions: [],
  };
}
function ensureChatterProfile(gameState) {
  const feed = gameState.world.computer.apps.social_feed;
  if (!feed.profile || typeof feed.profile !== 'object') feed.profile = defaultChatterProfile();
  const p = feed.profile;
  const d = defaultChatterProfile();
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  if (!Array.isArray(p.castFollowers)) p.castFollowers = [];
  if (!Array.isArray(p.blocked)) p.blocked = [];
  if (!p.backers || typeof p.backers !== 'object') p.backers = d.backers;
  if (!p.private || typeof p.private !== 'object') p.private = d.private;
  return p;
}

// npc.chatter (D58): the NPC's own platform state. Lazy — first read
// mints the handle from the bible.
function ensureNpcChatter(npc, gameState) {
  if (!npc) return null;
  if (!npc.chatter || typeof npc.chatter !== 'object') {
    npc.chatter = { handle: npcChatterHandle(npc, gameState), followsPlayer: false, subscribes: null, slotsUsed: 0, seenPostIds: [] };
  }
  if (!npc.chatter.handle) npc.chatter.handle = npcChatterHandle(npc, gameState);
  if (!Array.isArray(npc.chatter.seenPostIds)) npc.chatter.seenPostIds = [];
  // Phase 12 (D39/D95): a creator's own numbers — their ghost following,
  // seeded to a head start the first time it is read. Runtime, so it lives
  // here beside seenPostIds, never on the bible.
  const creator = npcCreator(npc);
  if (creator && creator.active && typeof npc.chatter.ghostFollowers !== 'number') {
    const T = CHATTER_PLATFORM;
    const rng = seededRng(npc.bible?.genSeed || 0, 'creator_start');
    const appeal = npcCreatorAppeal(npc);
    npc.chatter.ghostFollowers = Math.round(T.creatorStartFollowers[0] + (T.creatorStartFollowers[1] - T.creatorStartFollowers[0]) * rng() * appeal);
    npc.chatter.lastCreatorTickDay = null;
  }
  return npc.chatter;
}

// --- NPC creators (Phase 12, D38–D41) -----------------------------------------

// The bible's creator block, derived lazily for a save from before Phase 12
// (sim.js's ensureCreator — seeded on genSeed, so it reads the same as it
// would have at generation). Roster stubs and hand-authored NPCs get one
// the same way.
function npcCreator(npc) {
  if (!npc || !npc.bible) return null;
  if (!npc.bible.creator || typeof npc.bible.creator.active !== 'boolean') {
    if (typeof ensureCreator !== 'function') return null;
    npc.bible = ensureCreator(npc.bible);
  }
  return npc.bible.creator;
}

// Every cast member who runs an account. Sorted for determinism.
function creatorIds(gameState) {
  return chatterCastIds(gameState).filter(id => { const c = npcCreator(gameState.npcs[id]); return c && c.active; });
}

// D39 — the per-NPC appeal their following grows from: a base plus the
// disinhibition read. PURE.
function npcCreatorAppeal(npc) {
  const T = CHATTER_PLATFORM;
  const dis = typeof npcDisinhibition === 'function' ? npcDisinhibition(npc) : 0.5;
  return Math.round((T.creatorAppealBase + T.creatorAppealDisinhibition * dis) * 100) / 100;
}

// D39 — one billing cycle of offscreen growth for a creator: applyGrowth's
// formula (no viral roll) creatorPostsPerCycle times, then — for a Private
// page — one described-not-rendered private post this often. Seeded per
// (npc, day); idempotent through chatter.lastCreatorTickDay. Returns what
// happened.
function npcCreatorTick(gameState, npcId, day) {
  const T = CHATTER_PLATFORM;
  const npc = gameState.npcs?.[npcId];
  const creator = npcCreator(npc);
  if (!npc || !creator || !creator.active) return null;
  const c = ensureNpcChatter(npc, gameState);
  if (c.lastCreatorTickDay === day) return null;
  c.lastCreatorTickDay = day;
  const appeal = npcCreatorAppeal(npc);
  let gained = 0;
  for (let i = 0; i < T.creatorPostsPerCycle; i++) {
    const g = appeal * Math.pow((c.ghostFollowers || 0) + 1, T.growthExp) * T.growthK;
    c.ghostFollowers = Math.round(((c.ghostFollowers || 0) + g) * 100) / 100;
    gained += g;
  }
  let privatePost = null;
  if (creator.privateOpen) {
    const rng = seededRng(gameState.meta.seed, `creator_private_${npcId}_${day}`);
    if (rng() < T.creatorPrivatePostChance) {
      const feed = gameState.world.computer.apps.social_feed;
      const id = 'post_' + (feed.nextPostId++);
      const text = CHATTER_CREATOR_PRIVATE_LINES[Math.floor(rng() * CHATTER_CREATOR_PRIVATE_LINES.length)];
      const photo = typeof buildNpcSelfShotRecord === 'function' ? buildNpcSelfShotRecord(gameState, npc, npcId, `chatter_${id}`, day) : null;
      privatePost = { id, author: npcId, text, likes: [], comments: [], day, eventRef: null, visibility: 'private', media: photo ? { kind: 'image', photo } : null };
      feed.posts.push(privatePost);
    }
  }
  return { gained: Math.round(gained * 100) / 100, followers: c.ghostFollowers, privatePost };
}

// D40 — the block-the-player decision is made at page creation
// (deriveCreator); this is its reader.
function npcBlocksPlayer(npc) {
  const c = npcCreator(npc);
  return !!(c && c.active && c.blocksPlayer);
}

// --- The player as subscriber (D40) --------------------------------------------

function playerSubscriptionTo(gameState, npcId) {
  const profile = ensureChatterProfile(gameState);
  return (profile.subscriptions || []).find(s => s && s.npcId === npcId) || null;
}
function playerSubscribedTo(gameState, npcId) {
  const s = playerSubscriptionTo(gameState, npcId);
  return s ? s.tier : null;
}

// Subscribe to an NPC creator's Backers or Private tier at THEIR price,
// billed on the rent cadence (billPlayerSubscriptions). Refused when they
// are not a creator, have no Private page, have blocked the player, are
// blocked BY the player (a block is mutual, D87), or — for Private — the
// mature flag is off (D31 applies to reading as much as to running).
function subscribeToNpc(gameState, npcId, tier, day) {
  const npc = gameState.npcs?.[npcId];
  const creator = npcCreator(npc);
  if (!npc || !creator || !creator.active) return { ok: false, reason: "They don't run an account." };
  if (tier !== 'backers' && tier !== 'private') return { ok: false, reason: 'No such tier.' };
  if (npcBlocksPlayer(npc)) return { ok: false, reason: "They've blocked you." };
  if (isChatterBlocked(gameState, npcId)) return { ok: false, reason: "You've blocked them." };
  if (tier === 'private' && !creator.privateOpen) return { ok: false, reason: `They don't run a ${CHATTER_LABELS.private} page.` };
  if (tier === 'private' && !(typeof intimateAllowed === 'function' && intimateAllowed(gameState))) return { ok: false, reason: 'Not available.' };
  const profile = ensureChatterProfile(gameState);
  if (!Array.isArray(profile.subscriptions)) profile.subscriptions = [];
  const price = tier === 'private' ? creator.privatePrice : creator.backersPrice;
  const existing = playerSubscriptionTo(gameState, npcId);
  if (existing && existing.tier === tier) return { ok: false, reason: 'Already subscribed.' };
  const when = day ?? gameState.meta?.clock?.day ?? 0;
  let changed = false;
  if (existing) { existing.tier = tier; existing.since = when; changed = true; }
  else profile.subscriptions.push({ npcId, tier, since: when });
  // Phase 13 (D44/D45): who subscribes to whom is a NOTICE subject — the
  // creator perceives it if they know the handle (platformPerceiversFor);
  // and a Private subscription is the player's act against any boundary an
  // NPC drew (flags.js's checkPlayerBoundary — the drawer learns of it
  // through the same perception, or later by gossip).
  let noticed = null;
  if (typeof noticeSubject === 'function') {
    noticed = noticeSubject(gameState, { kind: 'subscription', ref: `${npcId}:${tier}`, day: when, quality: 0.5, category: 'social', meta: { label: `@${chatterHandleFor(gameState, npcId)}'s ${tier === 'private' ? CHATTER_LABELS.private : CHATTER_LABELS.backers} page`, creatorId: npcId, tier } });
    if (tier === 'private' && typeof checkPlayerBoundary === 'function') {
      for (const p of noticed.perceivers) checkPlayerBoundary(gameState, p.npcId, { act: 'subscribe_private', creatorId: npcId, subjectKey: `subscription:${npcId}:${tier}` });
    }
  }
  return { ok: true, price, changed, noticed };
}

function unsubscribeFromNpc(gameState, npcId) {
  const profile = ensureChatterProfile(gameState);
  const before = (profile.subscriptions || []).length;
  profile.subscriptions = (profile.subscriptions || []).filter(s => !(s && s.npcId === npcId));
  return { ok: profile.subscriptions.length < before };
}

// What the player's subscriptions cost per cycle, and each line.
function playerSubscriptionLines(gameState) {
  const profile = ensureChatterProfile(gameState);
  const out = [];
  for (const s of (profile.subscriptions || [])) {
    const npc = gameState.npcs?.[s.npcId];
    const creator = npcCreator(npc);
    if (!npc || !creator) continue;
    out.push({ npcId: s.npcId, tier: s.tier, since: s.since, price: s.tier === 'private' ? creator.privatePrice : creator.backersPrice, handle: chatterHandleFor(gameState, s.npcId) });
  }
  return out;
}
function playerSubscriptionTotal(gameState) {
  return playerSubscriptionLines(gameState).reduce((sum, l) => sum + l.price, 0);
}

// D40 — the player-side charge on the rent cadence: each subscription is
// paid from player.money; one that cannot be paid LAPSES (the services
// app postpones a visit, but a subscription you can't pay is cancelled —
// the platform doesn't wait). Idempotent per day (profile.lastChargedDay).
// Returns { charged, paid: [lines], lapsed: [lines] }.
function billPlayerSubscriptions(gameState, day) {
  const profile = ensureChatterProfile(gameState);
  if (profile.lastChargedDay === day) return { charged: 0, paid: [], lapsed: [] };
  profile.lastChargedDay = day;
  const paid = [], lapsed = [];
  let charged = 0;
  for (const line of playerSubscriptionLines(gameState)) {
    // A creator who blocked the player since (or was blocked) is dropped, unpaid.
    const npc = gameState.npcs[line.npcId];
    if (npcBlocksPlayer(npc) || isChatterBlocked(gameState, line.npcId) || gameState.player.money < line.price) {
      unsubscribeFromNpc(gameState, line.npcId);
      lapsed.push(line);
      continue;
    }
    gameState.player.money -= line.price;
    charged += line.price;
    paid.push(line);
  }
  return { charged, paid, lapsed };
}

// D39/D41 — how an NPC's private post reads to the player: rendered (the
// gate-governed image) when subscribed to their Private tier, else
// described — the caption alone, no image, and the price to see it.
function chatterPrivatePostView(gameState, post) {
  if (!post || post.visibility !== 'private' || post.author === 'player') return { rendered: true };
  if (playerSubscribedTo(gameState, post.author) === 'private') return { rendered: true };
  const creator = npcCreator(gameState.npcs?.[post.author]);
  return { rendered: false, price: creator ? creator.privatePrice : null, blocked: npcBlocksPlayer(gameState.npcs?.[post.author]) };
}

// --- Recognition (Phase 13, D43/D44) ----------------------------------------------

// Does this NPC hold a link from `handle` to a person (first-hand or by
// gossip — receiveTransmittedFact carries the structure)?
function holdsIdentityLink(npc, handle) {
  return (npc?.memory?.facts || []).some(f => f && f.kind === 'identity_link' && f.handle === handle && f.valid !== false);
}
function identityLinkFor(npc, handle) {
  return (npc?.memory?.facts || []).find(f => f && f.kind === 'identity_link' && f.handle === handle && f.valid !== false) || null;
}

// D43 — the TELLS a post carries for this perceiver. PURE. A tell is
// something they could actually know: a room they have stood in
// (npc.flags._roomsSeen — sim.js writes it on every change of room), the
// player's own room, the player's face in a selfie (anyone who knows them
// in person), an explicit self-shot seen by someone at the intimate phase,
// and — certainty — being in the photo themselves.
function recognitionTells(gameState, npcId, post) {
  const T = CHATTER_PLATFORM;
  const npc = gameState.npcs?.[npcId];
  const photo = post?.media && post.media.kind === 'image' ? post.media.photo : null;
  const tells = [];
  if (!npc || !photo) return tells;
  if ((photo.subjectNpcIds || []).includes(npcId)) tells.push({ tell: 'featured', strength: T.recogFeatured });
  const seen = (npc.flags && Array.isArray(npc.flags._roomsSeen)) ? npc.flags._roomsSeen : [];
  if (photo.roomId && seen.includes(photo.roomId)) tells.push({ tell: 'room', strength: photo.roomId === 'bedroom_player' ? T.recogBedroom : T.recogRoom });
  if ((photo.tags || []).includes('selfie')) tells.push({ tell: 'face', strength: T.recogSelfShot });
  if (photo.level === 'intimate' && (photo.tags || []).includes('selfie') && (npc.relPlayer?.intimacyLevel || 0) >= PHASE_THRESHOLDS.intimate) tells.push({ tell: 'body', strength: T.recogIntimateBody });
  return tells;
}

// D43 — the chance per exposure: the tells OR'd together, scaled by prior
// knowledge of the player (affinity), capped. PURE.
function recognitionChance(gameState, npcId, post) {
  const T = CHATTER_PLATFORM;
  const tells = recognitionTells(gameState, npcId, post);
  if (tells.length === 0) return { chance: 0, tells };
  const combined = 1 - tells.reduce((p, t) => p * (1 - t.strength), 1);
  const affinity = chatterAffinity(gameState, npcId, 'player');
  const knowledge = T.recogKnowledgeBase + T.recogKnowledgeAffinity * Math.max(0, affinity);
  return { chance: Math.min(T.recogCap, combined * knowledge), tells };
}

const RECOGNITION_TELL_PHRASES = {
  featured: "I'm in that photo",
  room: "I've been in that room",
  face: "that's their face",
  body: 'I know that body',
};

// D43 — the roll, seeded per (npc, post): on success an `identity_link`
// fact lands (handle → 'player'), transmissible like any fact. Someone
// who already holds the link never rolls again. Returns what happened.
function recognitionRoll(gameState, npcId, post) {
  const npc = gameState.npcs?.[npcId];
  const profile = ensureChatterProfile(gameState);
  if (!npc || !post || post.author !== 'player' || !profile.handle) return { linked: false, chance: 0, tells: [] };
  if (holdsIdentityLink(npc, profile.handle)) return { linked: true, already: true, chance: 0, tells: [] };
  const { chance, tells } = recognitionChance(gameState, npcId, post);
  if (chance <= 0) return { linked: false, chance, tells };
  const rng = seededRng(gameState.meta.seed, `recog_${npcId}_${post.id}`);
  if (rng() >= chance) return { linked: false, chance, tells };
  const day = gameState.meta?.clock?.day ?? 0;
  const strongest = tells.reduce((a, b) => (b.strength > a.strength ? b : a));
  const name = gameState.player?.name || 'the player';
  gameState.npcs[npcId] = addMemoryFact(npc, {
    kind: 'identity_link', handle: profile.handle, who: 'player', source: post.id,
    text: `I'm pretty sure @${profile.handle} on Chatter is ${name} — ${RECOGNITION_TELL_PHRASES[strongest.tell] || 'it adds up'}.`,
    day, importance: MEMORY_IMPORTANCE.significant, category: 'social', valid: true, provenance: 'witnessed', confidence: 1.0, emotionalTag: 'recognition',
  });
  return { linked: true, already: false, chance, tells, tell: strongest.tell };
}

// The cast members who currently know who the player's handle is.
function whoKnowsPlayerHandle(gameState) {
  const profile = ensureChatterProfile(gameState);
  if (!profile.handle) return [];
  return chatterCastIds(gameState).filter(id => holdsIdentityLink(gameState.npcs[id], profile.handle));
}

// --- Handles ----------------------------------------------------------------

// A ghost's handle for a notification line — REGENERATED from a seed every
// time, never persisted (invariant 9). Two word pools and a numeric tail,
// styled unlike a cast handle (cast handles have no numeric tail longer
// than two digits and no xX wrapper), and `taken` (the cast's handles)
// re-salts on the rare collision so a ghost can never impersonate a person.
function ghostHandle(seed, taken) {
  const P = CHATTER_HANDLE_POOLS;
  const avoid = taken instanceof Set ? taken : new Set(taken || []);
  for (let salt = 0; salt < 8; salt++) {
    const rng = mulberry32(hashStr(`ghost|${seed}|${salt}`));
    const a = P.ghostFirst[Math.floor(rng() * P.ghostFirst.length)];
    const b = P.ghostSecond[Math.floor(rng() * P.ghostSecond.length)];
    const n = 100 + Math.floor(rng() * 9900);
    const wrap = rng() < 0.2;
    const h = wrap ? `xX${a}${b}Xx` : `${a}${b}${n}`;
    if (!avoid.has(h.toLowerCase())) return h;
  }
  return `ghost${Math.abs(hashStr(String(seed))) % 100000}`;
}

// A cast NPC's handle: an interest or trait word plus a fragment of their
// name and a two-digit tail — recognisably a person's, never their name.
// Seeded on bible.genSeed so a save and a fresh generation agree.
function npcChatterHandle(npc, gameState) {
  const P = CHATTER_HANDLE_POOLS;
  const b = npc?.bible || {};
  const rng = mulberry32(hashStr(`handle|${b.genSeed ?? b.name ?? 'npc'}`));
  const interest = (Array.isArray(b.interests) && b.interests.length > 0) ? String(b.interests[Math.floor(rng() * b.interests.length)]?.name || '') : '';
  const trait = (Array.isArray(b.personality?.traits) && b.personality.traits.length > 0) ? String(b.personality.traits[Math.floor(rng() * b.personality.traits.length)]) : '';
  const word = (rng() < 0.5 && interest ? interest : trait || interest || P.castFallback[Math.floor(rng() * P.castFallback.length)]).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nameBit = String(b.name || 'x').toLowerCase().replace(/[^a-z]/g, '').slice(0, 3);
  const tail = Math.floor(rng() * 90) + 10;
  return `${word || 'someone'}_${nameBit}${tail}`;
}

// Every cast handle currently in use (lower-cased) — the collision set for
// ghostHandle and setChatterHandle.
function castHandles(gameState) {
  const out = new Set();
  for (const id of chatterCastIds(gameState)) {
    const c = ensureNpcChatter(gameState.npcs[id], gameState);
    if (c && c.handle) out.add(c.handle.toLowerCase());
  }
  return out;
}

// The player's handle: free text, normalised to a handle (leading @ and
// whitespace stripped, inner runs of whitespace → _, 24 chars), refused only
// when empty or when it is exactly a cast member's handle (D30 — you cannot
// BE someone else's account).
function setChatterHandle(gameState, raw) {
  const profile = ensureChatterProfile(gameState);
  let h = String(raw || '').trim().replace(/^@+/, '').replace(/\s+/g, '_').slice(0, 24);
  if (!h) return { ok: false, reason: 'Pick a handle first.' };
  if (castHandles(gameState).has(h.toLowerCase())) return { ok: false, reason: `@${h} is taken.` };
  profile.handle = h;
  return { ok: true, handle: h };
}

// The handle to show for any author id: the player's, an NPC's, or a
// placeholder before the player has picked one.
function chatterHandleFor(gameState, authorId) {
  if (authorId === 'player') return ensureChatterProfile(gameState).handle || '';
  const npc = gameState.npcs?.[authorId];
  return npc ? (ensureNpcChatter(npc, gameState).handle || '') : '';
}

// --- The cast ---------------------------------------------------------------

// D28: everyone on the platform — residents plus every NPC whose contact
// the player knows (exes, coworkers, friends who visit — the external-world
// roster). Roster stubs the player has never met (escorts, hot singles
// before contact) are not on it. Sorted for determinism.
function chatterCastIds(gameState) {
  return Object.keys(gameState?.npcs || {})
    .filter((id) => { const n = gameState.npcs[id]; return n && (n.residency?.status === 'resident' || n.contactKnown === true); })
    .sort();
}

// --- Blocking (D35) --------------------------------------------------------

function isChatterBlocked(gameState, npcId) {
  return ensureChatterProfile(gameState).blocked.includes(npcId);
}

// Block: mutual and immediate. The NPC drops out of the follower and
// subscriber lists (they can no longer see the page), their own state
// forgets the follow, and nothing suggested it. Pure over the records.
function blockNpc(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc) return { ok: false, reason: 'No such person.' };
  const profile = ensureChatterProfile(gameState);
  if (profile.blocked.includes(npcId)) return { ok: false, reason: 'Already blocked.' };
  profile.blocked.push(npcId);
  profile.castFollowers = profile.castFollowers.filter(id => id !== npcId);
  profile.backers.cast = profile.backers.cast.filter(id => id !== npcId);
  profile.private.cast = profile.private.cast.filter(id => id !== npcId);
  const c = ensureNpcChatter(npc, gameState);
  c.followsPlayer = false;
  // Phase 11: a blocked subscriber's slot (D42) comes back to them — the
  // subscription is gone, so the money it stood for is free again.
  if (c.subscribes) c.slotsUsed = Math.max(0, (c.slotsUsed || 0) - 1);
  c.subscribes = null;
  return { ok: true };
}

function unblockNpc(gameState, npcId) {
  const profile = ensureChatterProfile(gameState);
  if (!profile.blocked.includes(npcId)) return { ok: false, reason: 'Not blocked.' };
  profile.blocked = profile.blocked.filter(id => id !== npcId);
  return { ok: true };
}

// --- Visibility ------------------------------------------------------------

// What `viewerId` can see of the feed (D35/D37). The player sees every
// public post except a blocked author's; an NPC sees every public post
// except the player's when blocked, and a Private post only when
// subscribed to it (Phase 11 fills `subscribes`; until then Private posts
// are invisible to every NPC). A blocked NPC therefore perceives nothing
// of the player's on the platform — but may still HEAR about it through
// gossip, which is the realistic gap.
function visiblePostsFor(gameState, viewerId) {
  const feed = gameState.world.computer.apps.social_feed;
  const profile = ensureChatterProfile(gameState);
  const posts = feed.posts || [];
  if (viewerId === 'player') return posts.filter(p => !profile.blocked.includes(p.author));
  const npc = gameState.npcs?.[viewerId];
  if (!npc) return [];
  const blocked = profile.blocked.includes(viewerId);
  const c = ensureNpcChatter(npc, gameState);
  return posts.filter(p => {
    if (p.author === 'player') {
      if (blocked) return false;
      if (p.visibility === 'private') return c.subscribes === 'private';
      return true;
    }
    return p.visibility !== 'private';
  });
}

// --- Following (D36) --------------------------------------------------------

// The pure decision: does this cast member follow the player now? Affinity
// (chatterAffinity — relPlayer composed, never a third ledger) plus an
// interest match with what the player has been posting (a craft the NPC
// is interested in), against a seeded roll. A blocked NPC never follows.
// Returns { follow: boolean, chance, reasons } — decide()-shaped.
function castFollowDecision(gameState, npcId, rng) {
  const npc = gameState.npcs?.[npcId];
  if (!npc) return { follow: false, chance: 0, reasons: ['unknown'] };
  if (isChatterBlocked(gameState, npcId)) return { follow: false, chance: 0, reasons: ['blocked'] };
  const T = CHATTER_PLATFORM;
  const affinity = chatterAffinity(gameState, npcId, 'player');
  const feed = gameState.world.computer.apps.social_feed;
  const playerPosts = (feed.posts || []).filter(p => p.author === 'player');
  const interests = (npc.bible?.interests || []).map(i => String(i?.name || '').toLowerCase());
  const interestHit = playerPosts.some(p => {
    const text = String(p.text || '').toLowerCase();
    return interests.some(name => name && text.includes(name));
  });
  let chance = T.followBase + Math.max(0, affinity) * T.followAffinity + (interestHit ? T.followInterest : 0);
  if (playerPosts.length === 0) chance *= T.followNoPostsMult;
  chance = clamp01(chance);
  const roll = (rng || Math.random)();
  return { follow: roll < chance, chance, reasons: [affinity >= 0.3 ? 'likes you' : affinity <= -0.3 ? 'cool on you' : 'neutral', interestHit ? 'shares an interest' : 'no shared interest', playerPosts.length === 0 ? 'nothing posted yet' : `${playerPosts.length} posts`] };
}

// One pass per day, seeded, idempotent through profile.lastFollowDay: every
// cast member not yet following rolls castFollowDecision; a new follower is
// recorded on both sides. (Unfollowing is Phase 10's churn.)
function applyCastFollowsForDay(gameState, day) {
  const profile = ensureChatterProfile(gameState);
  if (profile.lastFollowDay === day) return [];
  profile.lastFollowDay = day;
  const rng = seededRng(gameState.meta.seed, `chatter_follow_${day}`);
  const newly = [];
  for (const npcId of chatterCastIds(gameState)) {
    const npc = gameState.npcs[npcId];
    const c = ensureNpcChatter(npc, gameState);
    if (c.followsPlayer || isChatterBlocked(gameState, npcId)) continue;
    const d = castFollowDecision(gameState, npcId, rng);
    if (!d.follow) continue;
    c.followsPlayer = true;
    if (!profile.castFollowers.includes(npcId)) profile.castFollowers.push(npcId);
    newly.push(npcId);
  }
  return newly;
}

// --- Counts by label (the profile screen's numbers) -----------------------

// Followers = cast followers + ghosts; Friends = the cast on the platform
// (everyone who could see a public post); Backers / Private = the two
// subscriber pools (Phases 10–11 fill them). Labels come from CHATTER_LABELS.
function chatterAudienceCounts(gameState) {
  const profile = ensureChatterProfile(gameState);
  return {
    friends: chatterCastIds(gameState).filter(id => !profile.blocked.includes(id)).length,
    followers: profile.castFollowers.length + Math.round(profile.ghostFollowers || 0),
    backers: profile.backers.cast.length + Math.round(profile.backers.ghosts || 0),
    private: profile.private.cast.length + Math.round(profile.private.ghosts || 0),
  };
}

// --- Appeal and growth (Phase 10, D29) ---------------------------------------

// A post's content kind from its source (chatter.js stamps meta.source on
// player posts): a released work → 'work' (the craft is the work kind's
// skill); a named skill → 'craft'; nothing → 'lifestyle'.
function postContentKind(gameState, post) {
  const src = post?.meta?.source;
  if (src && src.kind === 'work') {
    const w = (gameState.player.works || []).find(x => x.id === src.workId);
    if (w && WORK_KINDS[w.kind]) return { kind: 'work', skill: WORK_KINDS[w.kind].skill, work: w };
  }
  if (src && src.kind === 'skill' && SKILL_IDS.includes(src.skillId)) return { kind: 'craft', skill: src.skillId };
  return { kind: 'lifestyle', skill: null };
}

// D29 — PURE, seeded: appeal = base(kind) × craft multiplier × cadence ×
// roll. Craft content reads skills.js's craftQuality for the named skill;
// lifestyle content reads the social skill's socialEdge (its first reader,
// D7). The decision is made once at post time and stamped on the post.
function postAppeal(gameState, post) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  const ck = postContentKind(gameState, post);
  let appeal = T.appealBase[ck.kind] || T.appealBase.lifestyle;
  if (ck.kind === 'lifestyle') appeal *= 1 + skillMod(gameState.player, 'social', 'socialEdge');
  else appeal *= skillMod(gameState.player, ck.skill, 'craftQuality') / SKILL_CURVES.craftQuality[SKILL_CURVES.craftQuality.length - 1];
  const last = post.day - (profile.lastPostDay || -999);
  if (profile.lastPostDay > 0 && last > 0 && last <= T.cadenceDays) appeal *= T.cadenceBonus;
  const rng = seededRng(gameState.meta.seed, `appeal_${post.id}`);
  appeal *= T.appealRoll[0] + rng() * (T.appealRoll[1] - T.appealRoll[0]);
  return Math.round(appeal * 100) / 100;
}

// D29 — growth from one post: ghosts gained = appeal × (followers + 1)^exp
// × k, × viralMult on the seeded viral roll. Recorded on profile.growthLog
// (a capped ring — the notifications panel reads it and regenerates ghost
// handles per line). Returns { gained, viral }.
function applyGrowth(gameState, post) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  const appeal = typeof post.appeal === 'number' ? post.appeal : postAppeal(gameState, post);
  const followers = profile.ghostFollowers + profile.castFollowers.length;
  const rng = seededRng(gameState.meta.seed, `growth_${post.id}`);
  const viral = rng() < T.viralChance;
  let gained = appeal * Math.pow(followers + 1, T.growthExp) * T.growthK * (viral ? T.viralMult : 1);
  gained = Math.round(gained * 100) / 100;
  profile.ghostFollowers = Math.round((profile.ghostFollowers + gained) * 100) / 100;
  if (!Array.isArray(profile.growthLog)) profile.growthLog = [];
  profile.growthLog.unshift({ day: post.day, postId: post.id, gained, viral });
  if (profile.growthLog.length > T.growthLogCap) profile.growthLog.length = T.growthLogCap;
  return { gained, viral };
}

// D29 — a day with no post loses ghostDecayPerDay of the ghost following.
// Called at rollover for the day just ended; idempotent through
// profile.lastDecayDay.
function ghostDecay(gameState, day) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  if (profile.lastDecayDay === day) return 0;
  profile.lastDecayDay = day;
  if (profile.lastPostDay === day - 1 || profile.lastPostDay === day) return 0;
  const before = profile.ghostFollowers;
  profile.ghostFollowers = Math.round(before * (1 - T.ghostDecayPerDay) * 100) / 100;
  return Math.round((before - profile.ghostFollowers) * 100) / 100;
}

// --- Subscribers and billing (Phase 10, D32/D34/D42) --------------------------

// D42 — an NPC's discretionary subscription capacity, derived from the
// occupation record's incomeBand and spendingLean (NPCs have no wallet and
// this plan adds none). low/frugal → 0, mid/neutral → 2, high/free_spender
// → 4 (capped).
function npcSlots(npc) {
  const T = CHATTER_PLATFORM;
  const occ = npc?.bible?.occupation || {};
  const a = T.slotsByIncome[occ.incomeBand] ?? T.slotsByIncome.mid;
  const b = T.slotsByLean[occ.spendingLean] ?? T.slotsByLean.neutral;
  return Math.min(T.slotsCap, a + b);
}

// D36 — the cast subscribe (Backers) decision: must already follow, must
// have a free slot, then affinity against a seeded roll. A warm partner is
// very likely; a cool acquaintance almost never. decide()-shaped.
function castSubscribeDecision(gameState, npcId, rng) {
  const T = CHATTER_PLATFORM;
  const npc = gameState.npcs?.[npcId];
  if (!npc) return { subscribe: false, chance: 0, reasons: ['unknown'] };
  const c = ensureNpcChatter(npc, gameState);
  if (isChatterBlocked(gameState, npcId)) return { subscribe: false, chance: 0, reasons: ['blocked'] };
  if (!c.followsPlayer) return { subscribe: false, chance: 0, reasons: ['does not follow'] };
  if (c.subscribes) return { subscribe: false, chance: 0, reasons: ['already subscribed'] };
  const slots = npcSlots(npc);
  if (c.slotsUsed >= slots) return { subscribe: false, chance: 0, reasons: [`no free slot (${c.slotsUsed}/${slots})`] };
  const affinity = chatterAffinity(gameState, npcId, 'player');
  const chance = clamp01(T.subscribeBase + Math.max(0, affinity) * T.subscribeAffinity);
  const roll = (rng || Math.random)();
  return { subscribe: roll < chance, chance, reasons: [affinity >= 0.5 ? 'close to you' : affinity >= 0 ? 'friendly' : 'cool on you', `${slots - c.slotsUsed} slot(s) free`] };
}

// D32 (D91) — the ghost conversion for a tier at the player's current
// price: convBackers × (default / price)^priceElasticity. At the default
// price it is convBackers exactly; dearer converts fewer, cheaper more,
// and with elasticity below 1 a higher price still nets more money — the
// trade-off is Backers (a count later phases read) against income.
function ghostConversion(gameState, tier) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  if (tier === 'private') {
    // Phase 11 (D32): convPrivate(cadence) — a Private page earns its
    // conversion by being posted to; nothing on it converts nobody.
    if (!profile.private.open) return 0;
    const price = Math.max(1, profile.privatePrice || T.privatePriceDefault);
    return T.convPrivate * privateCadenceFactor(gameState) * Math.pow(T.privatePriceDefault / price, T.priceElasticity);
  }
  if (tier !== 'backers') return 0;
  const price = Math.max(1, profile.backersPrice || T.backersPriceDefault);
  return T.convBackers * Math.pow(T.backersPriceDefault / price, T.priceElasticity);
}

// --- Chatter Private (Phase 11, D31/D32/D33/D37) -------------------------------

// D31 — the page is offered only behind the mature flag (npc.js's
// intimateAllowed reads activeContentFlags — the same read every other
// gate makes), and needs a handle like everything else on the platform.
function canOpenPrivatePage(gameState) {
  const profile = ensureChatterProfile(gameState);
  if (typeof intimateAllowed !== 'function' || !intimateAllowed(gameState)) return { ok: false, reason: 'Not available.' };
  if (!profile.handle) return { ok: false, reason: 'Pick a handle first.' };
  if (profile.private.open) return { ok: false, reason: `${CHATTER_LABELS.private} is already open.` };
  return { ok: true, reason: null };
}

// D31 — the explicit in-fiction opt-in. The confirmation screen is the
// renderer's; this is the write. Nothing is auto-blocked (D35).
function openPrivatePage(gameState, day) {
  const can = canOpenPrivatePage(gameState);
  if (!can.ok) return can;
  const profile = ensureChatterProfile(gameState);
  profile.private.open = true;
  profile.private.openedDay = day ?? gameState.meta?.clock?.day ?? 0;
  return { ok: true, reason: null };
}

// The player's private posts, newest last (feed order).
function privatePosts(gameState) {
  const feed = gameState.world.computer.apps.social_feed;
  return (feed.posts || []).filter(p => p.author === 'player' && p.visibility === 'private');
}

// D32's cadence term: min(1, posts in the window / target); the floor when
// the page has older posts but nothing recent; 0 with nothing at all.
function privateCadenceFactor(gameState, day) {
  const T = CHATTER_PLATFORM;
  const now = day ?? gameState.meta?.clock?.day ?? 0;
  const posts = privatePosts(gameState);
  if (posts.length === 0) return 0;
  const recent = posts.filter(p => now - p.day <= T.privateCadenceWindowDays).length;
  return recent > 0 ? Math.min(1, recent / T.privateCadenceTarget) : T.privateCadenceFloor;
}

// D36 — the cast Private decision. Must follow, must not be blocked, the
// page must be open; a free slot, or an upgrade from Backers on the slot
// already spent; then affinity above a floor, scaled by disinhibition
// (sim.js's npcDisinhibition — the derived exhibitionism read, the one
// every other "would they" question uses). decide()-shaped.
function castPrivateDecision(gameState, npcId, rng) {
  const T = CHATTER_PLATFORM;
  const npc = gameState.npcs?.[npcId];
  const profile = ensureChatterProfile(gameState);
  if (!npc) return { subscribe: false, chance: 0, reasons: ['unknown'] };
  if (!profile.private.open) return { subscribe: false, chance: 0, reasons: ['no private page'] };
  const c = ensureNpcChatter(npc, gameState);
  if (isChatterBlocked(gameState, npcId)) return { subscribe: false, chance: 0, reasons: ['blocked'] };
  if (!c.followsPlayer) return { subscribe: false, chance: 0, reasons: ['does not follow'] };
  if (c.subscribes === 'private') return { subscribe: false, chance: 0, reasons: ['already subscribed'] };
  const upgrade = c.subscribes === 'backers';
  const slots = npcSlots(npc);
  if (!upgrade && c.slotsUsed >= slots) return { subscribe: false, chance: 0, reasons: [`no free slot (${c.slotsUsed}/${slots})`] };
  const affinity = chatterAffinity(gameState, npcId, 'player');
  const dis = typeof npcDisinhibition === 'function' ? npcDisinhibition(npc) : 0.5;
  const raw = T.privateBase + Math.max(0, affinity - T.privateAffinityFloor) * T.privateAffinity;
  const chance = clamp01(raw * Math.max(0, 1 + (dis - 0.5) * T.privateDisinhibition));
  const roll = (rng || Math.random)();
  return { subscribe: roll < chance, chance, upgrade, reasons: [affinity >= 0.5 ? 'close to you' : affinity >= T.privateAffinityFloor ? 'warm enough' : 'not close enough', dis >= 0.6 ? 'uninhibited' : dis <= 0.4 ? 'reserved' : 'middling'] };
}

// Phase 11 — the private pools' half of the cycle (called from
// deriveSubscribers). Ghost Private = floor(ghosts × convPrivate(cadence));
// cast: lapse on cold affinity / a block / the page closing (the slot
// returns), join by decision — an upgrade moves the NPC out of Backers on
// the slot they already hold.
function derivePrivateSubscribers(gameState, day, rng) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  if (!profile.private.open) {
    for (const npcId of profile.private.cast) {
      const c = gameState.npcs[npcId] && ensureNpcChatter(gameState.npcs[npcId], gameState);
      if (c) { c.subscribes = null; c.slotsUsed = Math.max(0, c.slotsUsed - 1); }
    }
    profile.private.cast = [];
    profile.private.ghosts = 0;
    return { ghosts: 0, cast: [] };
  }
  profile.private.ghosts = Math.floor(profile.ghostFollowers * ghostConversion(gameState, 'private'));
  const kept = [];
  for (const npcId of profile.private.cast) {
    const npc = gameState.npcs[npcId];
    const c = npc && ensureNpcChatter(npc, gameState);
    const affinity = npc ? chatterAffinity(gameState, npcId, 'player') : -1;
    if (!npc || isChatterBlocked(gameState, npcId) || affinity < T.lapseBelowAffinity) {
      if (c) { c.subscribes = null; c.slotsUsed = Math.max(0, c.slotsUsed - 1); }
      continue;
    }
    kept.push(npcId);
  }
  profile.private.cast = kept;
  for (const npcId of chatterCastIds(gameState)) {
    if (profile.private.cast.includes(npcId)) continue;
    const d = castPrivateDecision(gameState, npcId, rng);
    if (!d.subscribe) continue;
    const c = ensureNpcChatter(gameState.npcs[npcId], gameState);
    if (d.upgrade) profile.backers.cast = profile.backers.cast.filter(id => id !== npcId);
    else c.slotsUsed += 1;
    c.subscribes = 'private';
    profile.private.cast.push(npcId);
  }
  return { ghosts: profile.private.ghosts, cast: [...profile.private.cast] };
}

// D33/D41 — the consent record: an NPC's `consent_feature` fact for one
// photo (ref = the camera-roll photo id). `granted` false is a refusal,
// final for that content. Read by featureConsentFor / hasFeatureConsent;
// written by the $Feature leaf's postEffects (asks.js).
function featureConsentFor(npc, photoId) {
  return (npc?.memory?.facts || []).find(f => f && f.kind === 'consent_feature' && f.ref === photoId && f.valid !== false) || null;
}
function hasFeatureConsent(npc, photoId) {
  const f = featureConsentFor(npc, photoId);
  return !!(f && f.granted === true);
}
function buildFeatureConsentFact(photo, granted, level, day) {
  return {
    kind: 'consent_feature', ref: photo.id, granted: !!granted, level: level || 'lifestyle',
    text: granted
      ? `agreed to be in the player's ${level === 'intimate' ? 'private ' : ''}photo "${photo.caption}" when it's posted`
      : `refused to have the player's ${level === 'intimate' ? 'private ' : ''}photo "${photo.caption}" posted with them in it`,
    day, importance: MEMORY_IMPORTANCE.social, category: 'social', valid: true, provenance: 'witnessed', confidence: 1.0, emotionalTag: '',
  };
}
// The cast members in a photo who have NOT agreed to it being posted —
// empty means it may go up. A stranger/ghost in a photo is never a
// subject (subjectNpcIds only ever holds cast).
function photoSubjectsWithoutConsent(gameState, photo) {
  return (photo?.subjectNpcIds || []).filter(id => gameState.npcs?.[id] && !hasFeatureConsent(gameState.npcs[id], photo.id));
}
// A photo's content level for the $Feature tier (D33): stamped at capture
// since Phase 11; an older record with the 'moment' tag was an intimate
// act by construction, anything else older reads as lifestyle.
function photoContentLevel(photo) {
  if (photo && (photo.level === 'intimate' || photo.level === 'lifestyle')) return photo.level;
  return (photo?.tags || []).includes('moment') ? 'intimate' : 'lifestyle';
}

// D31 — a private self-shot: image.js's takePhoto with the player as the
// subject, opted into the intimate layer — the three-condition gate (mature
// flag + a naked state) decides how explicit the prompt is, exactly as peek
// does. Nobody else is in it (D41). Returns the camera-roll record.
function takePrivateSelfShot(gameState) {
  if (typeof takePhoto !== 'function') return null;
  return takePhoto(gameState, ['private', 'selfie'], { selfShot: true, intimate: true });
}

// The one-call flow the Private page's chip uses: shoot, then post it
// private with the caption. Refuses when the page is closed.
function postPrivateSelfShot(gameState, text, day) {
  const profile = ensureChatterProfile(gameState);
  if (!profile.private.open) return { ok: false, reason: `${CHATTER_LABELS.private} isn't open.` };
  const photo = takePrivateSelfShot(gameState);
  if (!photo) return { ok: false, reason: 'No camera.' };
  const r = postChatterAsPlayer(gameState, text, day, { visibility: 'private', media: { kind: 'image', photoId: photo.id } });
  return r.ok ? { ...r, photo } : r;
}

// D32/D34 — re-derive the pools at a billing cycle: ghost Backers =
// floor(ghost followers × ghostConversion) (a quiet creator's fallen
// following means fewer payers); cast Backers: new subscribers by
// decision, lapses when affinity has gone cold (the slot is returned).
// The Private pools follow (derivePrivateSubscribers, Phase 11). Returns
// the pools after.
function deriveSubscribers(gameState, day) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  profile.backers.ghosts = Math.floor(profile.ghostFollowers * ghostConversion(gameState, 'backers'));
  const rng = seededRng(gameState.meta.seed, `subscribe_${day}`);
  const kept = [];
  for (const npcId of profile.backers.cast) {
    const npc = gameState.npcs[npcId];
    const c = npc && ensureNpcChatter(npc, gameState);
    const affinity = npc ? chatterAffinity(gameState, npcId, 'player') : -1;
    if (!npc || isChatterBlocked(gameState, npcId) || affinity < T.lapseBelowAffinity) {
      if (c) { c.subscribes = null; c.slotsUsed = Math.max(0, c.slotsUsed - 1); }
      continue;
    }
    kept.push(npcId);
  }
  profile.backers.cast = kept;
  for (const npcId of chatterCastIds(gameState)) {
    if (profile.backers.cast.includes(npcId)) continue;
    const d = castSubscribeDecision(gameState, npcId, rng);
    if (!d.subscribe) continue;
    const c = ensureNpcChatter(gameState.npcs[npcId], gameState);
    c.subscribes = 'backers';
    c.slotsUsed += 1;
    profile.backers.cast.push(npcId);
  }
  // Phase 11: the Private pools ride the same cycle and the same rng.
  const priv = derivePrivateSubscribers(gameState, day, rng);
  return { ghosts: profile.backers.ghosts, cast: [...profile.backers.cast], private: priv };
}

// D34/D3 — the cycle's income: Backers × backersPrice (+ Private × its
// price once Phase 11 exists), credited through EARN_MONEY like a gig
// payout; taxes see it. Idempotent per day (profile.lastBilledDay).
function billSubscriptions(gameState, day) {
  const profile = ensureChatterProfile(gameState);
  if (profile.lastBilledDay === day) return { credited: 0, breakdown: null };
  profile.lastBilledDay = day;
  const backers = profile.backers.ghosts + profile.backers.cast.length;
  const priv = (profile.private.ghosts || 0) + profile.private.cast.length;
  const amount = backers * profile.backersPrice + priv * profile.privatePrice;
  if (amount > 0) {
    const effCtx = buildEffectContext(gameState, [], [], {}, []);
    applyEffects(parseEffectDSL(`EARN_MONEY ${amount} chatter`), effCtx);
    const taxes = gameState.world.taxes || (gameState.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 });
    taxes.quarterGross = (taxes.quarterGross || 0) + amount;
    if (taxes.autoReserve) taxes.reserve = (taxes.reserve || 0) + Math.round(amount * 0.27);
  }
  return { credited: amount, breakdown: { backers, backersPrice: profile.backersPrice, private: priv, privatePrice: profile.privatePrice } };
}

// The player sets a price within D32's bounds.
function setChatterPrice(gameState, tier, value) {
  const T = CHATTER_PLATFORM;
  const profile = ensureChatterProfile(gameState);
  const bounds = tier === 'private' ? T.privatePriceBounds : tier === 'backers' ? T.backersPriceBounds : null;
  if (!bounds) return { ok: false, reason: 'No such tier.' };
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return { ok: false, reason: 'Enter a number.' };
  const price = Math.max(bounds[0], Math.min(bounds[1], n));
  if (tier === 'private') profile.privatePrice = price; else profile.backersPrice = price;
  return { ok: true, price, clamped: price !== n };
}

// The rent cadence (D34): billing lands on the same days rent does.
// nextBillingDay is initialised from player.rentDueDay the first time and
// advanced by ECONOMY.payPeriodDays each cycle.
function processPlatformBillingForDay(gameState, day) {
  const profile = ensureChatterProfile(gameState);
  if (profile.nextBillingDay == null) profile.nextBillingDay = gameState.player.rentDueDay || (day + ECONOMY.payPeriodDays);
  if (day < profile.nextBillingDay) return null;
  profile.nextBillingDay += ECONOMY.payPeriodDays;
  const pools = deriveSubscribers(gameState, day);
  const bill = billSubscriptions(gameState, day);
  // Phase 12 (D39/D40): every creator grows a cycle's worth offscreen, then
  // the player's own subscriptions are charged.
  const creators = creatorIds(gameState).map(id => ({ npcId: id, ...(npcCreatorTick(gameState, id, day) || {}) }));
  const charges = billPlayerSubscriptions(gameState, day);
  return { pools, ...bill, creators, charges };
}

// --- Perception by scrolling (Phase 10, D37) ------------------------------------

// Did this NPC scroll their phone on `day`? The scroll_phone idle pastime
// writes a world.events entry of that type — the existing hook, no new
// flag. (Events are pruned over time; a day-old event is always there.)
function npcScrolledOn(gameState, npcId, day) {
  return (gameState.world.events || []).some(e => e && e.npcId === npcId && e.type === 'scroll_phone' && e.day === day);
}

// The perceivers of a platform subject: for a `chatter_post` (ref = the
// post id), every following, unblocked NPC who scrolled on the subject's
// day, can see the post (visiblePostsFor), and has not seen it before;
// for a `chatter_private` (Phase 11, D37) the same, but only a Private
// subscriber — visiblePostsFor already refuses everyone else. Marks it
// seen. Everything else (a work, a level-up) has no platform perceivers
// yet — later phases (an NPC reading a book, a listener) add theirs here.
function platformPerceiversFor(gameState, subject) {
  // Phase 13 (D44): a `subscription` subject (ref "<creatorId>:<tier>") is
  // perceived by the creator themselves — they see a handle on their
  // subscriber list — but only if they already know whose handle it is.
  if (subject && subject.kind === 'subscription') {
    const creatorId = String(subject.ref || '').split(':')[0];
    const npc = gameState.npcs?.[creatorId];
    const profile = ensureChatterProfile(gameState);
    if (!npc || !profile.handle || !holdsIdentityLink(npc, profile.handle) || isChatterBlocked(gameState, creatorId)) return [];
    return [{ npcId: creatorId, band: 'clear', intensity: 1 }];
  }
  if (!subject || (subject.kind !== 'chatter_post' && subject.kind !== 'chatter_private')) return [];
  const feed = gameState.world.computer.apps.social_feed;
  const post = (feed.posts || []).find(p => p.id === subject.ref);
  if (!post || post.author !== 'player') return [];
  if ((post.visibility === 'private') !== (subject.kind === 'chatter_private')) return [];
  const out = [];
  for (const npcId of chatterCastIds(gameState)) {
    const npc = gameState.npcs[npcId];
    const c = ensureNpcChatter(npc, gameState);
    if (!c.followsPlayer || isChatterBlocked(gameState, npcId)) continue;
    if (subject.kind === 'chatter_private' && c.subscribes !== 'private') continue;
    if (!npcScrolledOn(gameState, npcId, subject.day)) continue;
    if (c.seenPostIds.includes(post.id)) continue;
    if (!visiblePostsFor(gameState, npcId).some(p => p.id === post.id)) continue;
    c.seenPostIds.push(post.id);
    if (c.seenPostIds.length > 200) c.seenPostIds.splice(0, c.seenPostIds.length - 200);
    out.push({ npcId, band: 'clear', intensity: 1 });
  }
  return out;
}

// The rollover pass into `day`: every public player post from the last few
// days is a chatter_post subject for whoever scrolled YESTERDAY (the day
// that just ended — today's scrolling has not happened yet). Opinions land
// through NOTICE (one per NPC per post — holdsOpinionOn dedupes; a post
// already seen is skipped above), dated the day it was seen. Returns the
// noticed results.
function applyPlatformPerceptionForDay(gameState, day) {
  if (typeof noticeSubject !== 'function') return [];
  const feed = gameState.world.computer.apps.social_feed;
  const seenDay = day - 1;
  const out = [];
  for (const post of (feed.posts || [])) {
    if (post.author !== 'player') continue;
    if (post.day > seenDay || seenDay - post.day > CHATTER_TUNING.reactionWindowDays) continue;
    const appeal = typeof post.appeal === 'number' ? post.appeal : 0.5;
    // Phase 11 (D37): a private post is a chatter_private subject — only a
    // subscriber can perceive it (platformPerceiversFor), and the opinion
    // line names it as private.
    const priv = post.visibility === 'private';
    const r = noticeSubject(gameState, { kind: priv ? 'chatter_private' : 'chatter_post', ref: post.id, day: seenDay, quality: clamp(appeal / 1.5, 0, 1), category: 'social', meta: { text: post.text, label: priv ? 'private post' : 'post' } });
    // Phase 13 (D43): every fresh exposure is one recognition roll — the
    // tells are the post's, the knowledge the perceiver's.
    for (const p of r.perceivers) {
      const rr = recognitionRoll(gameState, p.npcId, post);
      if (rr.linked && !rr.already) p.recognized = rr.tell;
    }
    if (r.perceivers.length > 0) out.push(r);
  }
  return out;
}

// The one rollover call for the platform (UI's processDayRollover): decay
// for a quiet day, cast follows, perception by scrolling, and billing on
// the rent cadence.
function processPlatformForDay(gameState, day) {
  const decayed = ghostDecay(gameState, day);
  const followed = applyCastFollowsForDay(gameState, day);
  const perceived = applyPlatformPerceptionForDay(gameState, day);
  const billing = processPlatformBillingForDay(gameState, day);
  return { decayed, followed, perceived, billing };
}

// ===== /SECTION: PLATFORM =====
