// ===== SECTION: NOTICE =====
// The Notice & Opinion layer (aspirations-and-creative-careers-overhaul-plan
// Phase 3, D8–D13). The ONE way a player-made thing becomes something an
// NPC can perceive, judge, remember and repeat:
//
//   noticeSubject(gameState, { kind, ref, roomId, day, quality, meta })
//
// A subject is a thing that happened or exists — a skill level crossed, a
// finished work, a designed room, a post. Phases add subject KINDS to
// NOTICE_KINDS; none adds a second mechanism (D9).
//
// Perception before opinion (D10, invariant 3): an in-room subject is
// emitted as a TRANSIENT signal (`craft_moment`, SIGNAL_DEFS) and every
// NPC is asked, through the one perception query the whole game shares
// (SIGNALS' perceiveSignals — attention, doors, distance, sleep), whether
// they actually noticed it. Platform subjects go through platformPerceivers,
// which is a FUNCTION returning [] until Phase 10's Chatter platform fills
// it — a function, not a stored field (invariant 6). An NPC who did not
// perceive holds nothing.
//
// Opinions are facts (D11, invariant 4): a perceived subject lands in the
// NPC's memory through NPC's addMemoryFact as { kind: 'opinion', subject,
// valence, text, ... } — provenance 'witnessed', confidence 1, the same
// record shape every other belief has. So it is already transmissible
// (receiveTransmittedFact carries kind/subject/valence through), already
// weighed for raising (NPC's factEmotionalWeight reads opinionRaiseWeight
// below), already rendered in the persona prompt's [Memories — facts] line
// (the text IS the phrased line — see OPINION_LINES), already part of the
// player model (derivePlayerModel's "the player" match). No parallel store.
//
// Decide before you decorate (D12/D13, invariant 1): opinionValence is a
// pure, seeded function of subject quality × personality sensitivity ×
// relationship bias. The LLM only ever sees the resulting line; it is never
// asked whether the NPC liked anything.
//
// Pure logic, no DOM, no model (invariant 7) — exercisable by run-all.js.

// The subject kinds the layer knows (D9). A kind not in this list is a
// producer bug: noticeSubject warns and does nothing rather than writing
// a fact no later phase's readers understand.
// 'hobby_skill' (2026-09-21, character-creation field-impact session, locked
// decision C): the ONLY subject kind this layer forms about someone OTHER
// than the player — a resident's interests[].skill, dead since it was rolled
// (credited to the npc-initiative plan's "shared activities", which shipped
// without ever consulting it; see npc-correctness-fixes-plan.md's Phase 5
// correction). Producer is actions.js's resolveSharedActivity: when the
// player does a shared hobby with a skilled roommate, whoever ELSE is in the
// room can notice, via the explicit-perceiverIds path (D83) rather than a
// signal — being there for it IS the perception.
const NOTICE_KINDS = ['skill_levelup', 'work', 'room_design', 'chatter_post', 'chatter_private', 'subscription', 'aspiration', 'hobby_skill'];

// Personality sensitivity — the ONE table that decides how a temperament
// and its trait tags move an opinion's valence (D12). Phases 10 (platform
// appeal), 13 (recognition) and 16 (room opinions) read THIS table; none
// invents a second. Axes are bible.temperament keys in [-1, 1]; traits are
// the PERSONALITY_TRAITS_POOL tags on bible.personality.traits plus the
// coreTrait (the hiddenTrait is not read — it is hidden).
//
//   bias.<axis>        — added to valence, scaled by the axis value: a warm
//                        NPC rounds up, an open one appreciates the new.
//   sensitivity.<axis> — multiplies the quality-derived core, scaled by the
//                        axis: a conscientious NPC is more discriminating in
//                        BOTH directions (a good thing reads better, a poor
//                        one worse); a volatile one feels it bigger.
//   traits.hard        — each present tag subtracts traitStep (harder to
//                        impress); traits.soft adds it (rounds up);
//                        traits.craft adds craftStep on craft subjects
//                        (someone creative appreciates the work itself).
//   relationship       — (affection − tension) × affinity + respect ×
//                        respectWeight, from npc.relPlayer: liking you
//                        colours the judgement, never replaces it.
//   jitter             — a seeded ± band so two NPCs with identical numbers
//                        do not hold identical opinions; deterministic per
//                        (seed, npc, subject key).
const OPINION_PERSONALITY = {
  bias: { warmth: 0.25, openness: 0.10 },
  sensitivity: { conscientiousness: 0.30, volatility: 0.20 },
  traits: {
    hard: ['cynical', 'blunt', 'perfectionist', 'competitive', 'sarcastic', 'cold', 'critical'],
    soft: ['warm', 'nurturing', 'generous', 'easygoing', 'idealistic', 'supportive'],
    craft: ['creative', 'curious'],
  },
  traitStep: 0.15,
  traitCap: 0.30,
  craftStep: 0.10,
  relationship: { affinity: 0.20, respectWeight: 0.10 },
  jitter: 0.08,
};

// Which subject kinds are about a craft (the traits.craft bonus applies).
const NOTICE_CRAFT_KINDS = ['skill_levelup', 'work', 'hobby_skill'];

// How a skill reads as a craft in prose, and which fact `category` its
// opinions carry (NPC's factInterestRelevance matches category against a
// listener's interest names/tags — 'music' reaches a music lover). Every
// SKILL_IDS entry has a row so a level-up in any skill phrases; stealth is
// here for completeness only — its award sites are unwitnessed by design
// and do not call noticeSubject.
const SKILL_CRAFT_NOUNS = {
  cooking:  { noun: 'cooking',          category: 'cooking' },
  cleaning: { noun: 'housekeeping',     category: 'home' },
  stealth:  { noun: 'light-footedness', category: 'other' },
  tech:     { noun: 'computer work',    category: 'technology' },
  fitness:  { noun: 'workouts',         category: 'fitness' },
  social:   { noun: 'way with people',  category: 'social' },
  art:      { noun: 'drawing',          category: 'art' },
  writing:  { noun: 'writing',          category: 'writing' },
  focus:    { noun: 'concentration',    category: 'other' },
  music:    { noun: 'guitar playing',   category: 'music' },
};

// Valence bands (D13's "keyed by subject kind and valence band"). The line
// tables below are keyed by these names; retuning a threshold never means
// rewriting the writing.
const OPINION_BANDS = [
  { name: 'strong_pos', min: 0.5 },
  { name: 'pos',        min: 0.15 },
  { name: 'neutral',    min: -0.15 },
  { name: 'neg',        min: -0.5 },
  { name: 'strong_neg', min: -Infinity },
];
function opinionBand(valence) {
  for (const b of OPINION_BANDS) if (valence >= b.min) return b.name;
  return 'strong_neg';
}

// The wording table (D13): the fact's text, phrased at write time, keyed
// by subject kind and band. Claim-style ("the player's X ...") like every
// other fact in the store, so the [Memories — facts] line, the chronicler's
// known-block, factTopicPhrase and derivePlayerModel all read it unchanged.
// `{craft}` is SKILL_CRAFT_NOUNS[ref].noun. Later kinds add their own rows.
const OPINION_LINES = {
  skill_levelup: {
    strong_pos: [
      "the player's {craft} has gotten genuinely good",
      "the player's {craft} is genuinely impressive now",
    ],
    pos: [
      "the player's {craft} is coming along",
      "the player's {craft} has clearly improved",
    ],
    neutral: [
      "the player has been working at their {craft}",
      "the player's {craft} is a little better than it was",
    ],
    neg: [
      "the player's {craft} still has a long way to go",
      "the player's {craft} isn't much to write home about yet",
    ],
    strong_neg: [
      "the player's {craft} is honestly still pretty rough",
      "the player's {craft} was hard to sit through",
    ],
  },
  // Phase 5 (D21): a released work. `{what}` is the kind noun and the title
  // — 'book "Tidewater"' — from subject.meta (label, title). Later tracks'
  // releases read the same rows; a track/piece/dish is still "the player's
  // track "X"" here.
  // Phase 10 (D37): a public post seen while scrolling. `{what}` is
  // 'post "…"' — the first words of the text, from subject.meta.
  chatter_post: {
    strong_pos: [
      "the player's {what} was genuinely good — worth the follow",
      "the player's {what} is the kind of thing worth sharing",
    ],
    pos: [
      "the player's {what} was a good one",
      "liked the player's {what}",
    ],
    neutral: [
      "saw the player's {what} while scrolling",
      "the player's {what} went by in the feed",
    ],
    neg: [
      "the player's {what} was a bit much",
      "scrolled past the player's {what} without much interest",
    ],
    strong_neg: [
      "the player's {what} was embarrassing to see",
      "the player's {what} is the kind of thing people mute",
    ],
  },
  // Phase 11 (D37): a private post, seen because they pay for it. `{what}`
  // is 'private post "…"'.
  chatter_private: {
    strong_pos: [
      "the player's {what} was worth every penny",
      "the player's {what} is exactly why they subscribed",
    ],
    pos: [
      "the player's {what} was a good one",
      "liked the player's {what} — glad they pay for it",
    ],
    neutral: [
      "saw the player's {what}",
      "the player's {what} came through",
    ],
    neg: [
      "the player's {what} wasn't really worth paying for",
      "the player's {what} left them a little cold",
    ],
    strong_neg: [
      "the player's {what} made them wonder why they pay for this",
      "the player's {what} was a step too far",
    ],
  },
  // Phase 13 (D44): someone learned the player pays for {what} — a
  // creator's own page, seen through their subscriber list once they know
  // the handle is the player (platform.js). `{what}` is "<handle>'s
  // Chatter Private page".
  subscription: {
    strong_pos: [
      "the player paying for {what} is flattering, honestly",
      "glad the player is one of the people paying for {what}",
    ],
    pos: [
      "the player pays for {what} — nice to know",
      "noticed the player among the people paying for {what}",
    ],
    neutral: [
      "the player pays for {what}",
      "saw the player's handle on {what}",
    ],
    neg: [
      "the player paying for {what} is a little strange",
      "not sure how to feel about the player paying for {what}",
    ],
    strong_neg: [
      "the player paying for {what} is something they'd rather not know",
      "the player paying for {what} sits badly with them",
    ],
  },
  // Phase 14 (D48): a milestone the player reached, seen in the room.
  // `{what}` is 'milestone "…"'.
  aspiration: {
    strong_pos: [
      "the player reaching their {what} is genuinely something",
      "proud of the player for their {what}",
    ],
    pos: [
      "the player's {what} is a real step",
      "glad to see the player hit their {what}",
    ],
    neutral: [
      "saw the player reach their {what}",
      "the player's {what} came up",
    ],
    neg: [
      "the player making a thing of their {what} is a bit much",
      "not sure the player's {what} is worth the fuss",
    ],
    strong_neg: [
      "the player's {what} is not the achievement they think it is",
      "rolled their eyes at the player's {what}",
    ],
  },
  // Phase 16 (D52): a room the player has designed, seen on walking into
  // it. `{what}` is the room's name, lower-cased ('living room'). The
  // lines are about what the player DID to the room — a shared flat's
  // living room is nobody's, but the arranging was theirs.
  room_design: {
    strong_pos: [
      "the way the player has done up the {what} makes it somewhere people actually want to be",
      "the player's {what} is genuinely lovely now",
    ],
    pos: [
      "the player has made the {what} feel like a real place",
      "the {what} looks good since the player got at it",
    ],
    neutral: [
      "the player has been arranging the {what}",
      "noticed what the player has done with the {what}",
    ],
    neg: [
      "the player's {what} is a bit bare for all the fuss",
      "what the player has done with the {what} isn't really to their taste",
    ],
    strong_neg: [
      "the player's idea of decorating the {what} is not working",
      "the {what} looked better before the player got at it",
    ],
  },
  work: {
    strong_pos: [
      "the player's {what} is genuinely good",
      "the player's {what} is the real thing",
    ],
    pos: [
      "the player's {what} is better than expected",
      "the player's {what} has something to it",
    ],
    neutral: [
      "the player put out a {what}",
      "the player's {what} is fine, nothing more",
    ],
    neg: [
      "the player's {what} isn't there yet",
      "the player's {what} is a bit thin",
    ],
    strong_neg: [
      "the player's {what} is honestly not good",
      "the player's {what} should have stayed in the drawer",
    ],
  },
  // 2026-09-21 (interests[].skill wiring): the one table here that is NOT
  // about the player. `{name}` is the skilled resident's own bible.name
  // (subject.meta.name); `{craft}` is their interest's name, passed as
  // meta.label since SKILL_CRAFT_NOUNS is keyed by SKILL_IDS and several
  // matched interestTags (gaming, yoga) aren't skills at all.
  hobby_skill: {
    strong_pos: [
      "{name} is genuinely good at {craft}",
      "{name}'s {craft} is honestly impressive",
    ],
    pos: [
      "{name} is pretty good at {craft}",
      "{name} clearly knows what they're doing with {craft}",
    ],
    neutral: [
      "{name} is into {craft}",
      "{name} spends a fair amount of time on {craft}",
    ],
    neg: [
      "{name}'s {craft} still needs some work",
      "{name} is still finding their footing with {craft}",
    ],
    strong_neg: [
      "{name}'s {craft} is rough, honestly",
      "{name} really isn't very good at {craft}",
    ],
  },
};

// The in-room signal each kind emits (SIGNAL_DEFS id + intensity). Sight,
// strong in the room, essentially absent one hop away — a level-up is a
// moment you had to be there for. Kinds without an entry (platform
// subjects) have no in-room perceivers.
const NOTICE_SIGNALS = {
  skill_levelup: { id: 'craft_moment', intensity: 0.9 },
  work:          { id: 'craft_moment', intensity: 0.9 },
  room_design:   { id: 'craft_moment', intensity: 0.9 },
  // Phase 14 (D48): a Compass milestone lands where the player stands — a
  // quieter moment than a level crossed, the same signal.
  aspiration:    { id: 'craft_moment', intensity: 0.6 },
};

// A stable key for "this exact subject" — the dedupe handle (an NPC forms
// one opinion per subject, not one per query) and the jitter seed. A
// versioned subject (a level crossed, a work's edition) folds its version
// in so the next level-up is a new subject.
function noticeSubjectKey(subject) {
  const version = subject?.meta?.to ?? subject?.meta?.version ?? subject?.version;
  return `${subject.kind}:${subject.ref}${version != null ? `:${version}` : ''}`;
}

// Subject quality in [0, 1] — what is being judged, before anyone's
// personality touches it. A level-up's quality rises with the level
// reached: crossing 1 is a beginner getting somewhere (0.37), crossing 5
// is real competence (0.65), 10 is mastery (1.0). Other kinds pass an
// explicit `quality` (a work's craftQuality, Phase 4) and default to 0.5.
// Phase 16 (D52): a room's quality is the one kind that depends on WHO is
// looking — the style match is against the NPC's own lean — so this takes
// the npc and the state, which every other kind ignores.
function subjectQuality(subject, npc, gameState) {
  if (typeof subject?.quality === 'number' && Number.isFinite(subject.quality)) return clamp(subject.quality, 0, 1);
  if (subject?.kind === 'skill_levelup') {
    const to = Number(subject?.meta?.to ?? 1);
    return clamp(0.3 + 0.07 * to, 0, 1);
  }
  if (subject?.kind === 'room_design') return roomDesignQuality(gameState, subject.ref, npc);
  return 0.5;
}

// D52/D54 — how a designed room reads to THIS NPC, in [0, 1], before
// personality (opinionValence adds that on top like any other kind):
//   base + density × densityWeight + density × styleMatch × styleWeight
//        + (mean hung-piece quality − 0.5) × art
// density is defs.design.js's roomDecorDensity (placements over
// HOME_TUNING.densityRef); styleMatch is how much of the room's style
// (roomStyleWeights, the DESIGN_STYLE_TAGS vocabulary) lands on the NPC's
// own occupation.styleLean — 1 when the whole room is in their taste, 0
// when none of it is, 0.5 when they have no lean or the room says
// nothing. Hung art (D54) moves it by the pieces' quality. Decided from
// state, never asked of the model (invariant 1). With HOME_TUNING.opinion
// as shipped: a bare room with no match ≈ 0.44 (neutral band for most),
// a full room with no match 0.7, a full room in their style 1.0.
function roomDesignQuality(gameState, roomId, npc) {
  const T = (typeof HOME_TUNING !== 'undefined' && HOME_TUNING.opinion) || { base: 0.4, densityWeight: 0.3, styleWeight: 0.3, art: 0.3 };
  if (typeof roomDecorDensity !== 'function') return 0.5;
  const density = roomDecorDensity(gameState, roomId);
  const weights = roomStyleWeights(gameState, roomId);
  const lean = (npc?.bible?.occupation?.styleLean || []).map(t => String(t).toLowerCase());
  let styleMatch = 0.5;
  if (lean.length > 0 && Object.keys(weights).length > 0) {
    styleMatch = clamp(lean.reduce((s, t) => s + (weights[t] || 0), 0), 0, 1);
  }
  const hung = decorFor(gameState, roomId).filter(p => p.shape === 'player_art' && p.meta && typeof p.meta.quality === 'number');
  const art = hung.length > 0 ? (hung.reduce((s, p) => s + p.meta.quality, 0) / hung.length - 0.5) * T.art : 0;
  return clamp(T.base + density * T.densityWeight + density * styleMatch * T.styleWeight + art, 0, 1);
}

// The trait tags an opinion reads: bible.personality.traits plus coreTrait,
// lower-cased and deduplicated. hiddenTrait is deliberately excluded.
function npcTraitTags(npc) {
  const p = npc?.bible?.personality || {};
  const tags = (Array.isArray(p.traits) ? p.traits : []).concat(p.coreTrait ? [p.coreTrait] : []);
  return [...new Set(tags.map(x => String(x).toLowerCase()))];
}

// D12 — PURE, seeded. The valence in [-1, 1] this NPC forms about this
// subject. Quality sets the core (0.5 is neutral, mapped to [-1, 1]);
// personality decides the sensitivity and sign bias; the relationship adds
// a bias; a seeded jitter keeps identical temperaments from agreeing to the
// decimal. Same seed + same state → same number, every time.
//
// `perceiverId` (2026-09-21, interests[].skill wiring): every subject before
// 'hobby_skill' was about the player, so the relationship bias always read
// `npc.relPlayer` — the perceiver's OWN fondness for the player they're
// judging. A `subject.aboutNpcId` (someone other than the player) needs the
// perceiver's relationship with THAT resident instead, which lives in
// castWeb, not relPlayer, and castWeb is keyed by a pair of ids — hence the
// new, optional parameter. Every existing call site omits both
// `aboutNpcId` and `perceiverId`, so this branch is dead for them and
// behavior is unchanged (verified in verify-acc-p3/p5, unmodified).
function opinionValence(npc, subject, gameState, perceiverId) {
  const P = OPINION_PERSONALITY;
  const t = npc?.bible?.temperament || {};
  const traits = npcTraitTags(npc);
  let rel = npc?.relPlayer || {};
  if (subject?.aboutNpcId && perceiverId) {
    const pairKey = [perceiverId, subject.aboutNpcId].sort().join('|');
    const dir = gameState?.world?.castWeb?.[pairKey]?.axes?.[`${perceiverId}→${subject.aboutNpcId}`];
    rel = dir || {};
  }
  const axis = (k) => (typeof t[k] === 'number' && Number.isFinite(t[k]) ? clamp(t[k], -1, 1) : 0);

  let core = (subjectQuality(subject, npc, gameState) - 0.5) * 2;
  let sens = 1;
  for (const [k, w] of Object.entries(P.sensitivity)) sens += w * axis(k);
  core *= Math.max(0.25, sens);

  let bias = 0;
  for (const [k, w] of Object.entries(P.bias)) bias += w * axis(k);
  let traitShift = 0;
  for (const tag of traits) {
    if (P.traits.hard.includes(tag)) traitShift -= P.traitStep;
    if (P.traits.soft.includes(tag)) traitShift += P.traitStep;
  }
  traitShift = clamp(traitShift, -P.traitCap, P.traitCap);
  if (NOTICE_CRAFT_KINDS.includes(subject?.kind) && traits.some(tag => P.traits.craft.includes(tag))) traitShift += P.craftStep;

  const relBias = ((rel.affection || 0) - (rel.tension || 0)) * P.relationship.affinity
    + (rel.respect || 0) * P.relationship.respectWeight;

  // NPC records carry no id of their own; genSeed is the stable per-character
  // number every other seeded derivation (inventory, intimate backfill) uses.
  const npcKey = npc?.bible?.genSeed ?? npc?.bible?.name ?? 'npc';
  const rng = seededRng(gameState?.meta?.seed ?? 0, `opinion_${npcKey}_${noticeSubjectKey(subject)}`);
  const jitter = (rng() * 2 - 1) * P.jitter;

  return clamp(core + bias + traitShift + relBias + jitter, -1, 1);
}

// D13 — the phrased line for an opinion, from the wording table. Seeded on
// the subject key so the same opinion always reads the same way; a kind
// with no table falls back to a plain statement of the band.
function opinionLine(subject, valence, gameState) {
  const band = opinionBand(valence);
  const table = OPINION_LINES[subject?.kind];
  const pool = table && table[band];
  const craft = (SKILL_CRAFT_NOUNS[subject?.ref] && SKILL_CRAFT_NOUNS[subject.ref].noun)
    || (subject?.meta && subject.meta.label) || String(subject?.ref || 'work');
  const meta = subject?.meta || {};
  const snippet = meta.text ? `"${String(meta.text).split(/\s+/).slice(0, 6).join(' ')}${String(meta.text).split(/\s+/).length > 6 ? '…' : ''}"` : '';
  const what = meta.title ? `${meta.label || 'work'} "${meta.title}"` : (snippet ? `${meta.label || 'post'} ${snippet}` : (meta.label || craft));
  // hobby_skill (2026-09-21): the one kind whose subject is a resident, not
  // the player — `{name}` from meta.name, same optional-placeholder shape
  // `{craft}`/`{what}` already use (a template with no `{name}` is unchanged).
  const name = meta.name || 'they';
  if (!pool || pool.length === 0) {
    const owner = subject?.aboutNpcId ? `${name}'s` : "the player's";
    return `${owner} ${what}: ${band.replace('_', ' ')}`;
  }
  const rng = seededRng(gameState?.meta?.seed ?? 0, `opinion_line_${noticeSubjectKey(subject)}`);
  return pool[Math.floor(rng() * pool.length)].replace(/\{craft\}/g, craft).replace(/\{what\}/g, what).replace(/\{name\}/g, name);
}

// The raise weight of an opinion fact for NPC's factRaiseScore — "a weight
// from |valence|" (the plan's Phase 3): a strong opinion is worth repeating
// like a grievance, a lukewarm one like a domestic detail. Read by
// factEmotionalWeight (npc.js) for kind === 'opinion'. Pure.
function opinionRaiseWeight(fact) {
  const v = Math.abs(Number(fact?.valence) || 0);
  const lo = EMOTIONAL_WEIGHTS.default;
  const hi = EMOTIONAL_WEIGHTS.grievance;
  return lo + (hi - lo) * clamp(v, 0, 1);
}

// The fact record an opinion becomes (D11). importance rises with |valence|
// from MEMORY_IMPORTANCE.social toward .conversational — never significant,
// so an opinion is evictable and never pinned; it earns its place by being
// raised, not by rank. category comes from the craft table so gossip
// relevance (interest matching) works on it.
function buildOpinionFact(npc, subject, valence, gameState) {
  const craft = SKILL_CRAFT_NOUNS[subject?.ref];
  const category = (subject?.category) || (craft && craft.category) || 'other';
  const lo = MEMORY_IMPORTANCE.social, hi = MEMORY_IMPORTANCE.conversational;
  return {
    kind: 'opinion',
    subject: { kind: subject.kind, ref: subject.ref, key: noticeSubjectKey(subject) },
    valence: Math.round(valence * 100) / 100,
    text: opinionLine(subject, valence, gameState),
    day: subject.day ?? gameState?.meta?.clock?.day ?? 0,
    importance: lo + (hi - lo) * Math.abs(valence),
    category,
    valid: true,
    provenance: 'witnessed',
    confidence: 1.0,
    emotionalTag: '',
  };
}

// Does this NPC already hold an opinion on exactly this subject? (One
// opinion per subject per NPC; re-noticing is a no-op, and a told_by copy
// counts — you do not form a first-hand opinion of a thing you already hold
// a second-hand one on. That mirrors receiveTransmittedFact's same-text
// up-route rather than fighting it.)
function holdsOpinionOn(npc, key) {
  return (npc?.memory?.facts || []).some(f => f && f.kind === 'opinion' && f.subject && f.subject.key === key && f.valid !== false);
}

// D10 — the in-room perceivers. Emits the kind's transient signal into the
// subject's room and asks perceiveSignals, per awake NPC standing somewhere,
// whether THAT signal from THAT source reached them. Attention, doors, the
// sight channel's hop attenuation and sleep are all the perception query's
// business, not this file's — the point of D10 is that there is no second
// rule for who noticed. Returns [{ npcId, band, intensity }].
function inRoomPerceivers(gameState, subject) {
  const sig = NOTICE_SIGNALS[subject?.kind];
  const roomId = subject?.roomId;
  if (!sig || !roomId || !ROOMS[roomId]) return [];
  const sourceId = `notice:${noticeSubjectKey(subject)}`;
  emitTransient(gameState, { id: sig.id, roomId, intensity: sig.intensity, sourceId });
  const out = [];
  for (const [npcId, npc] of Object.entries(gameState.npcs || {})) {
    if (!npc || !npc.location || !ROOMS[npc.location]) continue;
    if (typeof npcIsAsleep === 'function' && npcIsAsleep(npc)) continue;
    const hit = perceiveSignals(gameState, npcId, npc.location)
      .find(r => r.signalId === sig.id && r.sourceId === sourceId);
    if (hit) out.push({ npcId, band: hit.band, intensity: hit.intensity });
  }
  return out;
}

// D10/D37 — the platform perceivers: NPCs who encounter a subject through
// their own Chatter usage (following, subscribing, scrolling). Phase 10
// filled it (platform.js's platformPerceiversFor: a following, unblocked
// NPC who scrolled today and can see the post); it stays a FUNCTION —
// never a stored list (invariant 6). Same return shape as inRoomPerceivers.
function platformPerceivers(gameState, subject) {
  // Phase 10 (D37): filled — platform.js resolves who scrolled past a
  // player post today. Still a function, never a stored list.
  return typeof platformPerceiversFor === 'function' ? platformPerceiversFor(gameState, subject) : [];
}

// D9 — the one entry point. Resolves perceivers, forms each one's opinion,
// stores it as a fact. Mutates gameState.npcs[id] (addMemoryFact is pure
// and returns the new record; this is the write site) and the transient
// signal buffer (through emitTransient). Returns what happened, so a caller
// (or a harness) can see who noticed and how it landed:
//   { key, perceivers: [{ npcId, valence, band, text, via }] }
// `via` is 'room' | 'platform' | 'consumed' (an explicit perceiverIds
// entry, D83). A subject with NO roomId and no perceiverIds notices nobody.
function noticeSubject(gameState, subject) {
  if (!gameState || !subject || !NOTICE_KINDS.includes(subject.kind)) {
    console.warn('noticeSubject: unknown or malformed subject', subject && subject.kind);
    return { key: null, perceivers: [] };
  }
  const key = noticeSubjectKey(subject);
  const day = subject.day ?? gameState.meta?.clock?.day ?? 0;
  const seen = new Set();
  // Phase 8 (D83): a subject CONSUMED by a named perceiver — a housemate
  // who ordered a listed dish and ate it — is perceived by the eating,
  // not by being in a room. The producer names them; the in-room and
  // platform paths still run alongside. Never a way around D10: the only
  // producers are ones where the perception is the act itself.
  const explicit = (Array.isArray(subject.perceiverIds) ? subject.perceiverIds : [])
    .filter(id => gameState.npcs && gameState.npcs[id])
    .map(npcId => ({ npcId, band: 'strong', intensity: 1, via: 'consumed' }));
  const candidates = explicit
    .concat(inRoomPerceivers(gameState, subject).map(p => ({ ...p, via: 'room' })))
    .concat(platformPerceivers(gameState, subject).map(p => ({ ...p, via: 'platform' })));
  const perceivers = [];
  for (const p of candidates) {
    if (seen.has(p.npcId)) continue;
    seen.add(p.npcId);
    const npc = gameState.npcs[p.npcId];
    if (!npc || holdsOpinionOn(npc, key)) continue;
    const valence = opinionValence(npc, { ...subject, day }, gameState, p.npcId);
    const fact = buildOpinionFact(npc, { ...subject, day }, valence, gameState);
    gameState.npcs[p.npcId] = addMemoryFact(npc, fact);
    perceivers.push({ npcId: p.npcId, valence: fact.valence, band: opinionBand(valence), text: fact.text, via: p.via });
  }
  return { key, perceivers };
}

// Phase 16 (D52/D54) — the room_design producer. Called when the player
// walks into a room (UI's doMove) and when a piece is hung or taken down
// (works.js): if the room carries the PLAYER's design (defs.design.js's
// roomPlayerDesignCount — the authored pool room is designed but not by
// them, and is not a subject about them), the design becomes a subject
// keyed on its version stamp (roomDesignVersion: the shapes and the pieces,
// not the coordinates), so an NPC judges a room once per design and again
// when it materially changes. Perception is the ordinary in-room path
// through noticeSubject (D10); nothing here decides who saw it. A new
// opinion on a room SUPERSEDES that NPC's older one on the same room —
// the old fact is marked invalid (evicted first, out of the prompt) rather
// than left to contradict the new one; the memory store already reads
// `valid`. The transient is emitted only when some awake NPC standing in
// the room has not judged this design yet, so walking in and out of your
// own bedroom is not a signal every time. Returns noticeSubject's shape.
function noticeRoomDesign(gameState, roomId, day) {
  if (!gameState || !roomId || !ROOMS[roomId]) return { key: null, perceivers: [] };
  if (typeof roomPlayerDesignCount !== 'function' || roomPlayerDesignCount(gameState, roomId) === 0) return { key: null, perceivers: [] };
  const version = roomDesignVersion(gameState, roomId);
  if (!version) return { key: null, perceivers: [] };
  const subject = {
    kind: 'room_design', ref: roomId, roomId, day: day ?? gameState.meta?.clock?.day ?? 0,
    category: 'home', meta: { version, label: String(ROOMS[roomId].name || roomId).toLowerCase() },
  };
  const key = noticeSubjectKey(subject);
  const anyoneNew = Object.values(gameState.npcs || {}).some(npc => npc && npc.location === roomId
    && !(typeof npcIsAsleep === 'function' && npcIsAsleep(npc)) && !holdsOpinionOn(npc, key));
  if (!anyoneNew) return { key, perceivers: [] };
  const result = noticeSubject(gameState, subject);
  for (const p of result.perceivers) {
    const npc = gameState.npcs[p.npcId];
    for (const f of (npc?.memory?.facts || [])) {
      if (f && f.kind === 'opinion' && f.subject && f.subject.kind === 'room_design' && f.subject.ref === roomId && f.subject.key !== key) f.valid = false;
    }
  }
  return result;
}

// ===== /SECTION: NOTICE =====
