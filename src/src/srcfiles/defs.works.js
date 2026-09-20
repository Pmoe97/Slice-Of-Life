// ===== SECTION: DEFS.WORKS =====
// Data for the independent tracks (aspirations-and-creative-careers-overhaul-
// plan Phase 4, D17–D25): what a WORK is per kind, and the tuning that
// governs how a catalog earns and fades. Pure data — no functions that read
// state; the arithmetic lives in works.js. Later phases of the same plan add
// their tables here rather than in config.js (D56): CHATTER_LABELS and the
// CHATTER_TUNING additions (Phases 9–13), ASPIRATION_DIRECTIONS (Phase 14),
// HOME_TUNING (Phase 16). Loads with the other defs, before works.js.
//
// A work is a thing the player MADE and now owns: a book, a track, a piece,
// a listed dish. One record shape, four kinds (D17). The kind decides which
// craft skill sets its quality (through skills.js's craftQuality curve — one
// curve, one lookup), which gig-board reputation category gates going
// independent in it (D19 — the board is the bootstrap, independence the
// graduation), how many production blocks it takes (D20), and how its
// audience number ("reach") turns into money (D18).
//
//   skill / category  — the craft and the reputation lane (Phase 2's
//                       GIG_CATEGORIES ids); both must be met to release.
//   minSkill / minRep — the D19 release gate. Reputation only comes from
//                       delivered gigs, so a player cannot grind past it.
//   blocksRange       — production length rolled per work (D20), worked
//                       block-by-block at gig focus/energy. Kinds without
//                       one (menu) are listed, not produced.
//   ratePerReach      — daily dollars per unit of reach at quality 1 (D18).
//                       0 for kinds that do not earn a trickle: a piece
//                       sells once (Phase 7), a dish earns per order
//                       (Phase 8).
//   releaseReach      — the audience a release starts with, from quality
//                       and the category's rep at release time. A known
//                       name launches bigger; a better work launches
//                       bigger. Roughly 40–300 across the whole range.
//   usesComputer      — a production block meters device electricity
//                       (COMPUTER's recordUtilityUsage) like a gig block.
//   requires          — a placed decor object the kind needs (D22's
//                       recording kit); checked by works.js's
//                       workRequirementMet at start and release.
//   salePrice         — (Phase 7) a piece's one-off sale price from quality
//                       and art rep; declared here so the gate and the
//                       price live in one row.
//   ordersPerReach    — (Phase 8) daily DoorDrop orders per unit of reach.
//
// The numbers: at the very top (quality 1, rep 100) one book launches at
// reach 300 and earns $12/day, halving every two weeks unless promoted.
// That is deliberate — D1 makes solo living a STACK (many works, several
// kinds, a following, gigs on the side), never one hit. Phase 15 measures
// the stack and retunes; these are the first-pass defaults the plan named.
const WORK_KINDS = {
  book: {
    id: 'book', label: 'Book', plural: 'Books', verb: 'Draft',
    skill: 'writing', category: 'writing', minSkill: 4, minRep: 40,
    blocksRange: [24, 40], ratePerReach: 0.04, usesComputer: true,
    releaseReach: (q, rep) => Math.round((40 + 160 * q) * (0.5 + rep / 100)),
  },
  track: {
    id: 'track', label: 'Track', plural: 'Tracks', verb: 'Record',
    skill: 'music', category: 'music', minSkill: 4, minRep: 40,
    blocksRange: [8, 16], ratePerReach: 0.02, usesComputer: true, requires: 'recording_kit',
    // Tracks launch to a wider but cheaper audience than books: streaming
    // reach is easy to get and pays per listen, so the same craft lands
    // ~1.5× the reach at half the rate — roughly the same dollars, a
    // different shape (more spikes, faster fade once promotion stops).
    releaseReach: (q, rep) => Math.round((60 + 240 * q) * (0.5 + rep / 100)),
  },
  piece: {
    id: 'piece', label: 'Piece', plural: 'Pieces', verb: 'Paint',
    skill: 'art', category: 'art', minSkill: 3, minRep: 20,
    blocksRange: [4, 10], ratePerReach: 0, usesComputer: false,
    releaseReach: () => 0,
    // One-off: a finished piece sells for this, once (Phase 7). Rep 0 →
    // 60–260 by quality; rep 100 → 120–520.
    salePrice: (q, rep) => Math.round((60 + 200 * q) * (1 + rep / 100)),
  },
  menu: {
    id: 'menu', label: 'Dish', plural: 'Dishes', verb: 'List',
    skill: 'cooking', category: 'food', minSkill: 4, minRep: 20,
    ratePerReach: 0, usesComputer: false, ordersPerReach: 0.08,
    // Listing a dish is not a moment anyone perceives — the dish is
    // noticed by whoever EATS it (fulfillKitchenOrder, D83), never on
    // release (D75's in-room notice is skipped for this kind).
    noticeOnRelease: false,
    // A listed dish starts with a small regular crowd sized by the kitchen's
    // food rep; Phase 8 turns reach into orders (reach × ordersPerReach ×
    // the kitchen's cleanliness, per day, seeded — lumpy by construction).
    releaseReach: (q, rep) => Math.round((5 + 20 * q) * (0.5 + rep / 100)),
    // (Phase 8, D81) what one order pays: the dish's OWN quality (the
    // listing's craftQuality at the time it was listed) and the kitchen's
    // food rep. A q 0.68 dish at rep 25 is $19; q 1 / rep 100 is $28.
    orderPrice: (q, rep) => Math.round(8 + 14 * q + rep * 0.06),
  },
};
const WORK_KIND_IDS = Object.keys(WORK_KINDS);

// The self-publishing storefront's in-fiction name (Phase 5, D21; Q1's
// default, recorded as D74). One string, one table — a rename is a
// one-line change. Must not collide with an existing brand (WorkHub, Nile,
// Streamly, DoorDrop, ChefBook, AfterHours, Chatter, Brine*).
const INKWELL_LABEL = 'Inkwell';

// D18 — how a catalog earns and fades. Named WORKS_TUNING (plural, after
// works.js) because config.js already owns a WORK_TUNING — the focus
// floors and the phone multiplier every work block reads (D71).
//   decayHalfLifeDays   — reach halves every this-many days without a
//                         promotion; the fade is applied at day rollover.
//   promoteBlockMinutes — a promotion is one 30-minute block (D4: same
//                         energy as a gig block, counts toward burnout).
//   promoteBump         — a promotion adds this fraction of the kind's
//                         releaseReach (at current quality and rep) to the
//                         live reach and resets the fade clock.
//   spikeChance / Mult  — per work per day, seeded: a good day (×10) for a
//                         back-catalog title, so income stays lumpy (D2,
//                         invariant 10) even from a mature catalog.
//   stereoPlayChance    — (Phase 6, D78) when the player puts on records
//                         and has a released track, the chance THAT track
//                         comes up in the stack — the moment anyone in the
//                         room hears it (NOTICE's work subject, in-room).
//   kitchen             — (Phase 8, D24/D25/D81) the home kitchen's dials:
//                         orders arrive per listed dish per day as reach ×
//                         ordersPerReach × the kitchen's cleanliness score
//                         (0..1), rounded by a seeded fractional roll;
//                         regularGain is the reach a fulfilled order adds
//                         (× the plate's quality — regulars come back for
//                         good food), unfulfilledReachLoss the fraction of
//                         a dish's reach each missed order costs at end of
//                         day; residentOrderChance is the per-resident,
//                         per-dish, per-day chance a housemate orders (a
//                         cast order — D84/Q4), fulfilled the same way and
//                         noticed by them when they eat it.
const WORKS_TUNING = {
  decayHalfLifeDays: 14,
  promoteBlockMinutes: 30,
  promoteBump: 0.25,
  spikeChance: 0.02,
  spikeMult: 10,
  stereoPlayChance: 0.35,
  kitchen: { regularGain: 1.5, unfulfilledReachLoss: 0.15, residentOrderChance: 0.12, minCleanliness: 0.1 },
};

// --- Chatter as a platform (Phases 9–13, D26–D45) -------------------------

// D26 — the ONE label table (invariant 11). Every string a player reads
// for an audience layer's name comes from here; "Backers" and "Chatter
// Private" appear as strings nowhere else. Renaming is a one-line change.
// "Afterhours" is unavailable (an existing in-fiction brand).
const CHATTER_LABELS = {
  friends: 'Friends',            // the authored cast on the platform
  followers: 'Followers',        // ghosts + cast who follow
  backers: 'Backers',            // the SFW support tier
  private: 'Chatter Private',    // the NSFW tier (behind the mature gate, D31)
};

// The audience model's dials (Phase 9; Phase 10 adds growth's).
//   followBase / followAffinity / followInterest — D36's follow decision:
//     chance = base + max(0, affinity) × followAffinity (+ followInterest
//     when the player's posts touch one of the NPC's interests), × the
//     no-posts multiplier when the player has posted nothing.
//   backersPriceDefault / privatePriceDefault — D32's defaults (bounds land
//     with Phase 10's pricing screen).
//   imagePostChance — an event-sourced NPC post whose source has a room
//     carries a frozen photo record (image.js's buildPhotoPrompt shape) this
//     often; pollPostChance — an NPC post is a poll this often instead.
//   pollVoteChance — each other cast member votes on a poll this often at
//     generation (seeded), so a poll always has a decided tally.
//   Phase 10 (D29/D32/D34/D36/D42):
//   appealBase — a post's base appeal by content kind: lifestyle (nothing
//     named), craft (a skill named), work (a released work named); × the
//     craft's craftQuality or (1 + socialEdge) for lifestyle, × cadenceBonus
//     when posted within cadenceDays of the last post, × a seeded roll in
//     appealRoll. growthK / growthExp: ghost followers gained per post =
//     appeal × (followers + 1)^growthExp × growthK; viralChance × viralMult
//     the spike; ghostDecayPerDay the fraction lost on a day with no post.
//   convBackers — the funnel: Backers (ghost) = floor(followers × this ×
//     (default price / price)^priceElasticity) — D32's convBackers(tier)
//     read as price-sensitive (D91): a dearer tier converts fewer, so the
//     price is a lever with a trade-off (elasticity < 1 → more money,
//     fewer Backers), not a free multiplier. Re-derived every billing cycle
//     (a quiet creator loses payers); backersPriceBounds /
//     privatePriceBounds the player-set price ranges.
//   subscribeBase / subscribeAffinity — D36's cast subscribe decision
//     (follows first, then affinity and a free slot); slotsByIncome ×
//     slotsByLean → D42's discretionary slots.
//   Phase 11 (D31/D32/D36/D37 — Chatter Private):
//   convPrivate — D32's convPrivate(cadence): Private (ghost) = floor(
//     followers × convPrivate × cadence × the D91 price term), where cadence
//     is min(1, private posts in the last privateCadenceWindowDays /
//     privateCadenceTarget), privateCadenceFloor when the page has posts but
//     none that recent, and 0 for a page with nothing on it yet.
//   privateBase / privateAffinityFloor / privateAffinity / privateDisinhibition
//     — the cast Private decision: follows first, a free slot (or an upgrade
//     from Backers on the same slot), then privateBase + max(0, affinity −
//     privateAffinityFloor) × privateAffinity, scaled by 1 + (npcDisinhibition
//     − 0.5) × privateDisinhibition (a judgmental relative almost never; an
//     exhibitionist partner readily).
//   featureDisinhibition — the $Feature ask's personality delta (D33): the
//     same (npcDisinhibition − 0.5) read, × this, added to the tier's score;
//     a floor is never bypassed.
//   Phase 12 (D38–D41 — NPC creators):
//   creatorBase + creatorDisinhibition × dis + creatorLowIncome (incomeBand
//     low) + creatorSelfEmployed (workMode self_employed) + creatorAssertive
//     × max(0, assertiveness) — the seeded chance a cast member runs an
//     account at all (D38: ~15 %); creatorPrivateBase + creatorPrivate-
//     Disinhibition × dis — that a creator also runs a Private page (~5 %
//     of everyone). creatorBlockBelowDis / creatorBlockAboveDis /
//     creatorBlockChance — D40's block-the-player decision at page
//     creation: a private person (dis below) blocks housemates outright,
//     an exhibitionist (dis above) never, in between a seeded coin.
//   creatorStartFollowers — a creator has been at it before day 1: a
//     seeded start in this range, scaled by appeal; creatorAppealBase +
//     creatorAppealDisinhibition × dis — the per-NPC appeal D39 grows from
//     (no per-post simulation); creatorPostsPerCycle — how many growth
//     steps a cycle applies (applyGrowth's formula, growthK, no viral);
//     creatorPrivatePostChance — a Private page adds one described-not-
//     rendered post per cycle this often; creatorImageMult — a creator's
//     ordinary feed posts carry a photo this many times as often.
//   creatorNudeDis — D41: an NPC's private self-shot is in the naked state
//     their own disinhibition permits: 'nude' at or above this, else
//     'undressed'. The three-condition gate still decides what the prompt
//     may say.
//   Phase 13 (D43 — recognition): a tell's strength — recogRoom (a room in
//     the photo they have been in), recogBedroom (the player's own room),
//     recogSelfShot (the player's face, a selfie), recogIntimateBody (an
//     explicit self-shot seen by someone at the intimate relationship
//     phase), recogFeatured (they are IN the photo — certainty). Tells
//     combine as an OR (1 − Π(1 − s)); × prior knowledge (recogKnowledgeBase
//     + recogKnowledgeAffinity × affinity), capped at recogCap; one seeded
//     roll per exposure.
//   subscriptionTalk* — D45's stance: openness + disinhibition say yes,
//     conscientiousness and an intimate relationship say no; a seeded noise
//     band; at or above 0 they are fine with it.
//   ghostCommentChance / ghostCommentMinAppeal — Q3 (D90): on a post above
//     the appeal floor, a ghost comment lands this often per post; the
//     handle is regenerated at render (never stored).
const CHATTER_PLATFORM = {
  followBase: 0.04, followAffinity: 0.22, followInterest: 0.10, followNoPostsMult: 0.35,
  backersPriceDefault: 5, privatePriceDefault: 10,
  imagePostChance: 0.30, pollPostChance: 0.15, pollVoteChance: 0.6,
  appealBase: { lifestyle: 0.5, craft: 0.7, work: 0.9 },
  cadenceDays: 3, cadenceBonus: 1.25, appealRoll: [0.7, 1.3],
  growthK: 0.5, growthExp: 0.6, viralChance: 0.01, viralMult: 20, ghostDecayPerDay: 0.005,
  convBackers: 0.03, priceElasticity: 0.5, backersPriceBounds: [2, 15], privatePriceBounds: [5, 30],
  subscribeBase: 0.02, subscribeAffinity: 0.25, lapseBelowAffinity: -0.2,
  convPrivate: 0.02, privateCadenceWindowDays: 7, privateCadenceTarget: 2, privateCadenceFloor: 0.25,
  privateBase: 0.005, privateAffinityFloor: 0.3, privateAffinity: 0.15, privateDisinhibition: 1.0, featureDisinhibition: 0.3,
  creatorBase: 0.09, creatorDisinhibition: 0.14, creatorLowIncome: 0.06, creatorSelfEmployed: 0.10, creatorAssertive: 0.05,
  creatorPrivateBase: 0.08, creatorPrivateDisinhibition: 0.45,
  creatorBlockBelowDis: 0.35, creatorBlockAboveDis: 0.7, creatorBlockChance: 0.5,
  creatorStartFollowers: [20, 400], creatorAppealBase: 0.4, creatorAppealDisinhibition: 0.4, creatorPostsPerCycle: 3,
  creatorPrivatePostChance: 0.6, creatorImageMult: 2, creatorNudeDis: 0.6,
  recogRoom: 0.35, recogBedroom: 0.6, recogSelfShot: 0.3, recogIntimateBody: 0.5, recogFeatured: 1.0,
  recogKnowledgeBase: 0.4, recogKnowledgeAffinity: 0.6, recogCap: 0.9,
  subscriptionTalkOpenness: 0.4, subscriptionTalkDisinhibition: 0.4, subscriptionTalkConscientiousness: 0.3, subscriptionTalkIntimate: 0.35, subscriptionTalkNoise: 0.2,
  slotsByIncome: { low: 0, mid: 1, high: 2 }, slotsByLean: { frugal: 0, neutral: 1, free_spender: 2 }, slotsCap: 4,
  ghostCommentChance: 0.35, ghostCommentMinAppeal: 0.8, growthLogCap: 20,
};

// Q3 → D90: ghost comments are a template pool with no facts and no memory
// — a number's worth of texture on a post that did well. The handle on each
// is ghostHandle(seed) at render time.
const CHATTER_GHOST_COMMENTS = ['this is so real', 'no because same', 'ok this one got me', 'saving this', 'the way I gasped', 'needed to see this today', 'who ARE you', 'more of this please'];

// ===== Aspirations (Phase 14, D46–D49) ==========================================
// Q2 → D101: the aspirations app is "Compass". The ONE place the name is a
// string (invariant 11's discipline, like CHATTER_LABELS).
const COMPASS_LABEL = 'Compass';

const ASPIRATION_TUNING = { maxDirections: 2, livePerDirection: 2 };

// --- Home (Phase 16, D51–D54; D56 places it here) ---
// A designed room means something, a little. Read by defs.design.js's
// designedRoomComfort (the rest/sleep impulse — world.js applies it from
// UI's doSleep and ACTIONS' `restful` verbs) and notice.js's
// roomDesignQuality (the room_design opinion's subject quality).
//   designedRoomMood — the mood impulse a FULLY designed room grants when
//                      the player rests or sleeps in it; scaled by density,
//                      so one plant in a bare room is a sliver of it (D51:
//                      placement matters a little, never as a target —
//                      compare goodSleep 0.05, napMoodGain 0.03).
//   densityRef       — the placement count at which a room reads as fully
//                      designed (density = min(1, count / densityRef)).
//   opinion          — roomDesignQuality's shape, in [0, 1] before anyone's
//                      personality touches it: base + density × densityWeight
//                      + density × styleMatch × styleWeight + (hung art's
//                      mean quality − 0.5) × art. A bare designed room with
//                      no taste match sits just under neutral; a full one
//                      in the NPC's own style reads 1.0.
//   wallSlot         — the framed-piece footprint hung on a wall (D54), and
//                      how far inside the wall line it sits.
const HOME_TUNING = {
  designedRoomMood: 0.02,
  densityRef: 8,
  opinion: { base: 0.4, densityWeight: 0.3, styleWeight: 0.3, art: 0.3 },
  wallSlot: { w: 12, h: 8, inset: 1.5 },
};

// Read-only helpers the predicates share. None of these backfills anything
// (the harness deep-equals state before/after every predicate).
const ASP = {
  skill: (gs, id) => (typeof skillLevel === 'function' ? skillLevel(gs.player, id) : 0),
  works: (gs) => (Array.isArray(gs.player?.works) ? gs.player.works : []),
  released: (gs, kind) => ASP.works(gs).filter(w => w && w.releasedDay != null && (!kind || w.kind === kind)),
  profile: (gs) => (gs.world?.computer?.apps?.social_feed?.profile) || {},
  followers: (gs) => { const p = ASP.profile(gs); return Math.round(p.ghostFollowers || 0) + ((p.castFollowers && p.castFollowers.length) || 0); },
  backers: (gs) => { const p = ASP.profile(gs); return (p.backers ? (p.backers.ghosts || 0) + (p.backers.cast || []).length : 0); },
  cast: (gs) => Object.keys(gs.npcs || {}).filter(id => { const n = gs.npcs[id]; return n && (n.residency?.status === 'resident' || n.contactKnown === true); }),
  residents: (gs) => Object.values(gs.npcs || {}).filter(n => n && n.residency?.status === 'resident'),
  phaseRank: { early: 0, familiar: 1, close: 2, intimate: 3 },
  bestPhase: (gs) => Math.max(0, ...ASP.cast(gs).map(id => ASP.phaseRank[gs.npcs[id].relPlayer?.conversationPhase] ?? 0)),
  placedDecor: (gs) => { const out = []; for (const [bucket, objs] of Object.entries(gs.objects || {})) { if (!bucket.startsWith('room_')) continue; for (const o of Object.values(objs || {})) if (o && o.pos && typeof DECOR_CATALOG_DEFS !== 'undefined' && DECOR_CATALOG_DEFS[o.defId]) out.push({ roomId: bucket.slice(5), defId: o.defId }); } return out; },
  // Phase 16 (D53): "designed" is defs.design.js's definition — rooms where
  // the PLAYER's design (an override, placed decor, hung pieces) reaches
  // minItems; the authored pool room counts for nothing. Until Phase 16
  // this counted placed catalog pieces only.
  roomsDesigned: (gs, minItems) => (typeof roomPlayerDesignCount === 'function' ? ALL_ROOMS.filter(r => roomPlayerDesignCount(gs, r) >= (minItems || 2)).length : 0),
  quality: (gs) => (typeof getApartmentQuality === 'function' ? getApartmentQuality(gs) : 0),
  // A piece of the player's own art hung in a room — works.js's hangWork
  // (Phase 16, D54) writes these objects; nothing else has a workId.
  hungArt: (gs) => { let n = 0; for (const [bucket, objs] of Object.entries(gs.objects || {})) { if (!bucket.startsWith('room_')) continue; for (const o of Object.values(objs || {})) if (o && (o.defId === 'player_art' || (o.meta && o.meta.workId))) n++; } return n; },
  // Read-only: never whoKnowsPlayerHandle (it backfills the profile).
  knowers: (gs) => { const h = ASP.profile(gs).handle; if (!h || typeof holdsIdentityLink !== 'function') return 0; return ASP.cast(gs).filter(id => holdsIdentityLink(gs.npcs[id], h)).length; },
  independenceWeeks: (gs) => (typeof gs.player?.independenceWeeks === 'number' ? gs.player.independenceWeeks : 0),
  gigsDelivered: (gs) => (gs.world?.computer?.apps?.gigs?.delivered || 0),
  earnedFromWorks: (gs) => ASP.works(gs).reduce((s, w) => s + (w.earned || 0), 0),
};

// D46 — the five directions and their milestone pools. Each milestone is
// { id, label, hint, pre(gs), done(gs) } — both PURE. `pre` is "worth
// showing yet" (the live list surfaces the next one or two whose pre is
// met), `done` is "true now". A direction's final milestone may read state a
// later phase provides (independenceWeeks — Phase 15; hung art — Phase 16);
// until then it is simply false, which is fine (D49: a milestone sits
// until true). Every `done` is a fact that could only have become true by
// doing the thing — never a state a fresh game already satisfies by
// default (a "no cutoffs" milestone would complete on day 1).
const CRAFT_SKILLS = [['art', 'art'], ['writing', 'writing'], ['music', 'music'], ['cooking', 'cooking']];
const ASPIRATION_DIRECTIONS = {
  craft: {
    id: 'craft', label: 'Craft', blurb: 'Get good at something, and put it into the world.',
    milestones: [
      { id: 'craft_any3', label: 'Reach level 3 in any craft', hint: 'art, writing, music or cooking', pre: () => true, done: (gs) => CRAFT_SKILLS.some(([s]) => ASP.skill(gs, s) >= 3) },
      ...CRAFT_SKILLS.map(([s, label]) => ({ id: `craft_${s}5`, label: `Reach ${label} 5`, hint: `${label} is at least 2`, pre: (gs) => ASP.skill(gs, s) >= 2, done: (gs) => ASP.skill(gs, s) >= 5 })),
      { id: 'craft_release_book', label: 'Self-publish a book', hint: 'writing 3 or better', pre: (gs) => ASP.skill(gs, 'writing') >= 3, done: (gs) => ASP.released(gs, 'book').length > 0 },
      { id: 'craft_release_track', label: 'Release a track on Streamly', hint: 'music 3 or better', pre: (gs) => ASP.skill(gs, 'music') >= 3, done: (gs) => ASP.released(gs, 'track').length > 0 },
      { id: 'craft_finish_piece', label: 'Finish a piece', hint: 'art 3 or better', pre: (gs) => ASP.skill(gs, 'art') >= 3, done: (gs) => ASP.works(gs).some(w => w.kind === 'piece') },
      { id: 'craft_sell_piece', label: 'Sell a piece', hint: 'a finished piece', pre: (gs) => ASP.works(gs).some(w => w.kind === 'piece'), done: (gs) => ASP.works(gs).some(w => w.kind === 'piece' && w.meta && w.meta.soldDay != null) },
      { id: 'craft_open_kitchen', label: 'Open your kitchen on DoorDrop', hint: 'cooking 3 or better', pre: (gs) => ASP.skill(gs, 'cooking') >= 3, done: (gs) => !!(gs.player?.kitchen && gs.player.kitchen.listedDay != null) },
      { id: 'craft_earn100', label: 'Earn 100 from your own work', hint: 'anything released', pre: (gs) => ASP.released(gs).length > 0, done: (gs) => ASP.earnedFromWorks(gs) >= 100 },
      ...CRAFT_SKILLS.map(([s, label]) => ({ id: `craft_${s}8`, label: `Reach ${label} 8`, hint: `${label} is at least 5`, pre: (gs) => ASP.skill(gs, s) >= 5, done: (gs) => ASP.skill(gs, s) >= 8 })),
      { id: 'craft_three_works', label: 'Release three things', hint: 'two out already', pre: (gs) => ASP.released(gs).length >= 2, done: (gs) => ASP.released(gs).length >= 3 },
    ],
  },
  connection: {
    id: 'connection', label: 'Connection', blurb: 'Know people, and be known.',
    milestones: [
      { id: 'conn_familiar', label: 'Get to know someone', hint: 'a familiar face', pre: () => true, done: (gs) => ASP.bestPhase(gs) >= 1 },
      { id: 'conn_housemate', label: 'Live with someone', hint: 'a housemate moves in', pre: () => true, done: (gs) => ASP.residents(gs).length >= 1 },
      { id: 'conn_contacts3', label: 'Know three people outside the house', hint: 'numbers saved', pre: (gs) => ASP.cast(gs).length >= 1, done: (gs) => Object.values(gs.npcs || {}).filter(n => n && n.contactKnown === true && n.residency?.status !== 'resident').length >= 3 },
      { id: 'conn_close', label: 'Have a close friend', hint: 'someone who is familiar with you', pre: (gs) => ASP.bestPhase(gs) >= 1, done: (gs) => ASP.bestPhase(gs) >= 2 },
      { id: 'conn_two_close', label: 'Two close friends', hint: 'one already', pre: (gs) => ASP.bestPhase(gs) >= 2, done: (gs) => ASP.cast(gs).filter(id => (ASP.phaseRank[gs.npcs[id].relPlayer?.conversationPhase] ?? 0) >= 2).length >= 2 },
      { id: 'conn_partner', label: 'Have a partner', hint: 'someone close', pre: (gs) => ASP.bestPhase(gs) >= 2, done: (gs) => ASP.bestPhase(gs) >= 3 },
      { id: 'conn_full_house', label: 'A full house', hint: 'two housemates', pre: (gs) => ASP.residents(gs).length >= 2, done: (gs) => ASP.residents(gs).length >= 3 },
      { id: 'conn_mend', label: 'Mend a rift', hint: 'a grievance on the books', pre: (gs) => ASP.cast(gs).some(id => (gs.npcs[id].relPlayer?.grievances || []).length > 0), done: (gs) => ASP.cast(gs).some(id => (gs.npcs[id].relPlayer?.grievances || []).some(g => g.resolved)) },
    ],
  },
  comfort: {
    id: 'comfort', label: 'Comfort', blurb: 'Make the place yours.',
    milestones: [
      { id: 'comf_place1', label: 'Place your first piece of furniture', hint: 'anything from the Home app', pre: () => true, done: (gs) => ASP.placedDecor(gs).length >= 1 },
      { id: 'comf_place5', label: 'Furnish with five things', hint: 'one placed', pre: (gs) => ASP.placedDecor(gs).length >= 1, done: (gs) => ASP.placedDecor(gs).length >= 5 },
      { id: 'comf_room1', label: 'Design a room', hint: 'two pieces of your own in one room', pre: (gs) => ASP.placedDecor(gs).length >= 1, done: (gs) => ASP.roomsDesigned(gs, 2) >= 1 },
      { id: 'comf_rooms3', label: 'Design three rooms', hint: 'one designed', pre: (gs) => ASP.roomsDesigned(gs, 2) >= 1, done: (gs) => ASP.roomsDesigned(gs, 2) >= 3 },
      { id: 'comf_quality50', label: 'Bring the apartment to half', hint: 'RenoFix', pre: () => true, done: (gs) => ASP.quality(gs) >= 0.5 },
      { id: 'comf_hang_art', label: 'Hang a piece of your own', hint: 'a finished piece', pre: (gs) => ASP.works(gs).some(w => w.kind === 'piece'), done: (gs) => ASP.hungArt(gs) >= 1 },
      { id: 'comf_quality80', label: 'Bring the apartment to 80 %', hint: 'past half', pre: (gs) => ASP.quality(gs) >= 0.5, done: (gs) => ASP.quality(gs) >= 0.8 },
      { id: 'comf_place15', label: 'Fifteen pieces placed', hint: 'five placed', pre: (gs) => ASP.placedDecor(gs).length >= 5, done: (gs) => ASP.placedDecor(gs).length >= 15 },
    ],
  },
  independence: {
    id: 'independence', label: 'Independence', blurb: 'Cover the place on your own terms.',
    milestones: [
      { id: 'ind_gig1', label: 'Deliver a gig', hint: 'WorkHub', pre: () => true, done: (gs) => ASP.gigsDelivered(gs) >= 1 },
      { id: 'ind_gig10', label: 'Deliver ten gigs', hint: 'one delivered', pre: (gs) => ASP.gigsDelivered(gs) >= 1, done: (gs) => ASP.gigsDelivered(gs) >= 10 },
      { id: 'ind_release', label: 'Have something out earning', hint: 'a work released', pre: () => true, done: (gs) => ASP.released(gs).length > 0 },
      { id: 'ind_backers5', label: 'Five Backers', hint: 'a Chatter handle', pre: (gs) => !!ASP.profile(gs).handle, done: (gs) => ASP.backers(gs) >= 5 },
      { id: 'ind_two_sources', label: 'Two kinds of income', hint: 'gigs and a catalog, or Backers', pre: (gs) => ASP.gigsDelivered(gs) >= 1 || ASP.released(gs).length > 0, done: (gs) => [ASP.gigsDelivered(gs) >= 1, ASP.released(gs).length > 0, ASP.backers(gs) >= 1].filter(Boolean).length >= 2 },
      { id: 'ind_week1', label: 'Cover a week on your own', hint: 'measured, not declared', pre: () => true, done: (gs) => ASP.independenceWeeks(gs) >= 1 },
      { id: 'ind_week4', label: 'Four weeks running', hint: 'one week covered', pre: (gs) => ASP.independenceWeeks(gs) >= 1, done: (gs) => ASP.independenceWeeks(gs) >= 4 },
      { id: 'ind_week8', label: 'Eight weeks running', hint: 'four weeks covered', pre: (gs) => ASP.independenceWeeks(gs) >= 4, done: (gs) => ASP.independenceWeeks(gs) >= 8 },
    ],
  },
  notoriety: {
    id: 'notoriety', label: 'Notoriety', blurb: 'Be someone people follow.',
    milestones: [
      { id: 'noto_handle', label: 'Claim a handle on Chatter', hint: '', pre: () => true, done: (gs) => !!ASP.profile(gs).handle },
      { id: 'noto_f10', label: 'Ten followers', hint: 'a handle', pre: (gs) => !!ASP.profile(gs).handle, done: (gs) => ASP.followers(gs) >= 10 },
      { id: 'noto_housemate_follows', label: 'A housemate follows you', hint: 'a handle', pre: (gs) => !!ASP.profile(gs).handle, done: (gs) => (ASP.profile(gs).castFollowers || []).length >= 1 },
      { id: 'noto_f100', label: 'A hundred followers', hint: 'ten', pre: (gs) => ASP.followers(gs) >= 10, done: (gs) => ASP.followers(gs) >= 100 },
      { id: 'noto_backer1', label: 'Your first Backer', hint: 'ten followers', pre: (gs) => ASP.followers(gs) >= 10, done: (gs) => ASP.backers(gs) >= 1 },
      { id: 'noto_f1000', label: 'A thousand followers', hint: 'a hundred', pre: (gs) => ASP.followers(gs) >= 100, done: (gs) => ASP.followers(gs) >= 1000 },
      { id: 'noto_known', label: 'Someone works out who you are', hint: 'a hundred followers', pre: (gs) => ASP.followers(gs) >= 100, done: (gs) => ASP.knowers(gs) >= 1 },
      { id: 'noto_f10000', label: 'Ten thousand followers', hint: 'a thousand', pre: (gs) => ASP.followers(gs) >= 1000, done: (gs) => ASP.followers(gs) >= 10000 },
    ],
  },
};
const ASPIRATION_DIRECTION_IDS = Object.keys(ASPIRATION_DIRECTIONS);

// Phase 12 (D39): the captions an NPC creator's Private post carries —
// the post is DESCRIBED to a non-subscriber (this line, no image) and
// rendered through the gate for a subscriber. Templates only phrase a
// decided post.
const CHATTER_CREATOR_PRIVATE_LINES = [
  'new set for the people who pay — thank you, honestly',
  'this one is subscribers only. you know why',
  'felt cute, kept it behind the paywall',
  'a little something for the private crowd tonight',
  'not for the main feed. you get it',
  'late one. subscribers, this is yours',
];

// Handle generation pools (D30). Ghost handles are word+word+number (or an
// xX…Xx wrap) — the internet's texture; cast handles are word_nam##. The
// two shapes never coincide, which is what "a ghost never collides with a
// cast handle" rests on (ghostHandle also re-salts against the cast set).
const CHATTER_HANDLE_POOLS = {
  ghostFirst: ['foxy', 'moon', 'neon', 'salt', 'velvet', 'pixel', 'lucky', 'sleepy', 'cosmic', 'static', 'honey', 'rusty', 'glass', 'midnight', 'paper', 'sour', 'tidal', 'mossy', 'quiet', 'loud'],
  ghostSecond: ['moon', 'cat', 'wolf', 'bean', 'ghost', 'river', 'fern', 'noodle', 'crow', 'radio', 'lemon', 'echo', 'drift', 'spark', 'coin', 'orbit', 'thread', 'lantern', 'harbor', 'signal'],
  castFallback: ['just', 'daily', 'real', 'not', 'the', 'plain'],
};

// Poll templates for NPC-authored polls (D27's `poll` kind): house things,
// answered by the cast at generation. `{name}` is the author's first name.
const CHATTER_POLL_TEMPLATES = [
  { text: 'pizza night or tacos night?', options: ['pizza', 'tacos'] },
  { text: 'is it too early for the heating on', options: ['yes', 'no', 'it is never too early'] },
  { text: 'movie tonight — comfort rewatch or something new?', options: ['rewatch', 'something new'] },
  { text: 'honest question: dishes right after, or "later"', options: ['right after', 'later, obviously'] },
  { text: 'best room in the flat, be serious', options: ['kitchen', 'living room', 'the balcony', 'my own room'] },
  { text: 'coffee or tea people, sound off', options: ['coffee', 'tea', 'both', 'neither, chaos'] },
];

// ===== /SECTION: DEFS.WORKS =====
