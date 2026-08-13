// ===== SECTION: NPC =====
// Memory, relationships, mood, context assembly.
// Validates + applies LLM proposals to state (via STATE adapter).
// No DOM. No direct LLM calls.

// --- Memory management ---
const MEMORY_BUDGET = {
  maxEpisodes: 30,    // NPC Overhaul Phase 4.3 — increased from 15 for tiered system
  maxSummaryLen: 500,
  episodeDecayPerTick: 0.002,
  // Correctness plan Phase 1 (D5). A single conversational turn writes one
  // player line plus up to three NPC dialogue lines, so the old cap of 10
  // held roughly two and a half exchanges — an NPC's working memory of a
  // conversation reset every couple of messages, which is exactly the "why
  // does she keep re-introducing herself" feeling. 40 is ~10 real exchanges;
  // the prompt shows the trailing 16 (~4 exchanges) of the matching channel.
  maxRecent: 40,
  promptRecentCount: 16,
  // Facts budget moved to BELIEF.maxFacts (knowledge-gossip Phase 1, D15):
  // the facts tier gained confidence/salience/pinned, and its eviction,
  // retrieval and prompt window all read the new numbers from there.
};

// --- NPC Overhaul migration: backfill all new fields for existing saves ---
// Every new field is additive with a default, so existing consumers that
// don't know about them keep working. This formalizes the additive-default
// pattern (same precedent as suspicion/clothing) via a proper folder
// version migration rather than scattered `|| {}` guards.
function migrateNpcToV2(npc) {
  if (!npc || typeof npc !== 'object') return npc;
  const b = npc.bible || {};

  // bible.physical — default empty object; will be derived from visual
  // by Phase 1's getPhysicalDescriptionForPrompt fallback
  if (!b.physical || typeof b.physical !== 'object') b.physical = {};

  // Phase 0: bible.age + bible.gender — first-class fields for RoomList
  // filters and stub generation. Backfill deterministically from genSeed
  // so existing saves get a stable value rather than an empty default.
  if (b.age === undefined || b.age === null) {
    const aRng = mulberry32((b.genSeed || 0) + 7777);
    const [min, max] = CHAR_GEN.ageRange || [22, 34];
    const bias = (aRng() + aRng()) / 2;
    b.age = Math.round(min + bias * (max - min));
  }
  if (!b.gender) {
    const gRng = mulberry32((b.genSeed || 0) + 8888);
    const weights = CHAR_GEN.genderWeights || { female: 0.4, male: 0.4, futanari: 0.08, trans_male: 0.06, trans_female: 0.06 };
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = gRng() * total;
    b.gender = 'female';
    for (const [g, w] of entries) { r -= w; if (r <= 0) { b.gender = g; break; } }
  }

  // bible.personality — default empty structure
  if (!b.personality || typeof b.personality !== 'object') {
    b.personality = { traits: [], coreTrait: '', hiddenTrait: '', quirks: [], likes: [], dislikes: [] };
  } else {
    b.personality.traits = b.personality.traits || [];
    b.personality.coreTrait = b.personality.coreTrait || '';
    b.personality.hiddenTrait = b.personality.hiddenTrait || '';
    b.personality.quirks = b.personality.quirks || [];
    b.personality.likes = b.personality.likes || [];
    b.personality.dislikes = b.personality.dislikes || [];
  }

  // bible.interests[].skill — default 0
  if (Array.isArray(b.interests)) {
    for (const intr of b.interests) {
      if (intr && typeof intr === 'object' && intr.skill === undefined) intr.skill = 0;
    }
  }

  // bible.speech — vocabularyLevel + catchphrases. Both are read by
  // buildNpcBlockV2's [Speech] line as of the correctness plan's Phase 5.
  if (b.speech && typeof b.speech === 'object') {
    if (b.speech.vocabularyLevel === undefined) b.speech.vocabularyLevel = 0.5;
    if (!Array.isArray(b.speech.catchphrases)) b.speech.catchphrases = [];
  }

  // relPlayer — add comfort, desire, intimacyLevel, conversationPhase, grievances, firstMetDay, lastInteractionDay
  const rel = npc.relPlayer || {};
  if (rel.comfort === undefined) rel.comfort = 0;
  if (rel.desire === undefined) rel.desire = 0;
  if (rel.intimacyLevel === undefined) rel.intimacyLevel = 0;
  if (!rel.conversationPhase) rel.conversationPhase = 'early';
  if (!Array.isArray(rel.grievances)) rel.grievances = [];
  if (rel.firstMetDay === undefined) rel.firstMetDay = 1;
  if (rel.lastInteractionDay === undefined) rel.lastInteractionDay = 1;
  npc.relPlayer = rel;

  // needs — add comfort + stimulation
  const needs = npc.needs || {};
  if (needs.comfort === undefined) needs.comfort = 50;
  if (needs.stimulation === undefined) needs.stimulation = 50;
  npc.needs = needs;

  // memory — tiered structure
  const mem = npc.memory || {};
  if (!Array.isArray(mem.recent)) mem.recent = [];
  if (mem.summaryRevision === undefined) mem.summaryRevision = 0;
  // facts: backfill category + valid + the belief record (provenance/
  // confidence/salience/pinned/emotionalTag — knowledge-gossip Phase 1,
  // D1/D2/D3) on existing bare-string or partial-object facts. The
  // backfill is the single normalizer every legacy fact shape passes
  // through (migrateNpcToV2 for v1 saves, migrateFactRecordV2 for v4,
  // and sim.js's contractor-seed copy).
  if (Array.isArray(mem.facts)) {
    mem.facts = mem.facts.map(backfillFactRecordV2);
  } else {
    mem.facts = [];
  }
  // episodes: backfill emotionalTag + participants
  if (Array.isArray(mem.episodes)) {
    mem.episodes = mem.episodes.map(e => ({
      ...e,
      emotionalTag: e.emotionalTag || '',
      participants: Array.isArray(e.participants) ? e.participants : [],
    }));
  } else {
    mem.episodes = [];
  }
  // styleCounters. lastJobMention/lastHobbyMention were backfilled here and
  // are pruned (correctness plan Phase 5) — never written after init, never
  // read. recentTopics covers the same ground and is read by getStyleDirective.
  if (!mem.styleCounters || typeof mem.styleCounters !== 'object') {
    mem.styleCounters = { total: 0, sincePersonal: 0, recentTopics: [] };
  } else {
    mem.styleCounters.total = mem.styleCounters.total || 0;
    mem.styleCounters.sincePersonal = mem.styleCounters.sincePersonal || 0;
    mem.styleCounters.recentTopics = Array.isArray(mem.styleCounters.recentTopics) ? mem.styleCounters.recentTopics : [];
  }
  npc.memory = mem;

  // moodReason + schedule
  if (npc.moodReason === undefined) npc.moodReason = '';
  if (!npc.schedule || typeof npc.schedule !== 'object') {
    npc.schedule = { currentBlock: '', nextBlock: '', willReturnAt: null };
  }

  npc.bible = b;
  // Phase 3 (D9): openQuestions default + stable factIds on any legacy facts.
  return backfillOpenQuestionsV2(npc);
}

// --- Belief record (knowledge-gossip-memory-plan Phase 1) ---
// The single normalizer for fact-shape → full record: every legacy shape
// (bare string, partial object, complete object) passes through here, and
// the result always carries provenance + confidence + salience + pinned +
// emotionalTag (the Phase 1 invariant: "every fact carries provenance and
// confidence, always").
//
// D1 — provenance is written once, at storage time, and never rewritten.
// Defaults to 'witnessed' (direct experience, including hearing the player
// say it first-hand); a caller that KNOWS otherwise passes 'told_by:<id>'
// / 'overheard' / 'inferred'. Confidence default 1.0; D2's three routes
// (transmission down, inference down, re-witnessing up) are Phase 2/3.
//
// D3 — pinned protects what defines a relationship. Granted at write time
// when importance >= significant (0.8) or when the caller declares the fact
// references a participant the NPC is at close/intimate phase with
// (fact.pinned — the relationship context only the WRITER has, e.g. the
// Phase 2 receiver-write; facts carry no participant field, D14). Pinned
// facts never evict.
function backfillFactRecordV2(f) {
  if (typeof f === 'string') {
    return { text: f, day: 0, importance: 1, category: 'other', valid: true,
      provenance: 'witnessed', confidence: 1.0, salience: BELIEF.salienceDefault,
      pinned: 1 >= MEMORY_IMPORTANCE.significant, emotionalTag: '' };
  }
  const importance = f.importance !== undefined ? f.importance : 1;
  let pinned = !!f.pinned;
  if (importance >= MEMORY_IMPORTANCE.significant) pinned = true;
  return {
    ...f,
    category: f.category || 'other',
    valid: f.valid !== undefined ? f.valid : true,
    provenance: f.provenance || 'witnessed',
    confidence: f.confidence !== undefined ? f.confidence : 1.0,
    salience: f.salience !== undefined ? f.salience : BELIEF.salienceDefault,
    pinned,
    emotionalTag: f.emotionalTag || '',
  };
}

// npcs 4->5 migration fn (STATE's MIGRATIONS): backfill the belief record on
// a saved NPC's facts. Runs over every saved NPC once per save.
function migrateFactRecordV2(npc) {
  if (!npc || typeof npc !== 'object') return npc;
  const mem = npc.memory || {};
  if (Array.isArray(mem.facts)) mem.facts = mem.facts.map(backfillFactRecordV2);
  else mem.facts = [];
  npc.memory = mem;
  return npc;
}

// D2 — read-time salience: how much the NPC cares about a fact RIGHT NOW.
// Time drops salience; the stored value is the salience at write time, and
// retrieval discounts it by the days since the fact was written
// (BELIEF.salienceDecayPerDay), floored. Pure — nothing is rewritten; a
// week-old witnessed fact is still believed (confidence 1.0) but barely
// worth raising (salience ~0.15 after 7 days). nowDay null/absent → the
// stored value unchanged.
function factSalienceNow(f, nowDay) {
  const base = (f && f.salience !== undefined ? f.salience : BELIEF.salienceDefault);
  if (nowDay == null) return base;
  const age = Math.max(0, nowDay - (f.day || 0));
  return Math.max(BELIEF.salienceFloor, base - BELIEF.salienceDecayPerDay * age);
}

// D2 — the retrieval/eviction product: how much a fact counts right now.
// importance (what kind of thing it is) × confidence (how sure it's true) ×
// salience (how much they care at this moment).
function factBeliefScore(f, nowDay) {
  return (f.importance !== undefined ? f.importance : 1) *
         (f.confidence !== undefined ? f.confidence : 1) *
         factSalienceNow(f, nowDay);
}

// --- NPC inventories (inventory overhaul Phase 8, D8) ---
// NPCs own things. Seeded at creation (SIM's createNpcFromBible) and
// backfilled for existing saves (STATE's npcs 2→3 migration) from a
// lifestyle template derived from the character bible — job, income tier,
// interests (CONFIG's NPC_INVENTORY). Deterministic: the rng is seeded
// from bible.genSeed, so the same NPC always gets the same inventory —
// a fresh save and a migration can't disagree. Pure (returns a NEW npc);
// a save that already carries an inventory passes through untouched.
// `day` stamps meta.acquiredDay (defaults to 1, the game-start day; the
// migration passes residency.since so a mid-game backfill ages their
// snacks from move-in, not day one).
function seedNpcInventory(npc, day) {
  if (!npc || typeof npc !== 'object') return npc;
  if (Array.isArray(npc.inventory) && npc.inventory.length > 0) return npc;
  const cfg = NPC_INVENTORY;
  const b = npc.bible || {};
  const rng = mulberry32((b.genSeed || 0) + 99991);
  // Built through ITEMS' addStack so same-def stacks merge (the book from
  // an occupation and the book from an interest land as one stack, not
  // two — same uniform stack shape + cohort rules as everywhere else).
  let stacks = [];
  const push = (defId, qty = 1) => {
    if (!ITEM_DEFS[defId]) return;
    const keyItem = !!(ITEM_DEFS[defId]?.keyItem);
    stacks = addStack(stacks, defId, qty, null, keyItem ? { keyItem: true } : {}, day ?? 1);
  };
  for (const defId of cfg.baseKit) push(defId);
  const occ = b.occupation || {};
  for (const defId of cfg.byOccupation[occ.category] || []) push(defId);
  for (const defId of cfg.byIncome[occ.incomeBand] || []) push(defId);
  const seen = new Set();
  for (const intr of b.interests || []) {
    for (const defId of cfg.byInterest[intr?.name] || []) {
      if (seen.has(defId)) continue;
      seen.add(defId);
      push(defId);
      break;
    }
  }
  const snackPool = cfg.snackPool || [];
  const picked = [];
  for (let i = 0; i < (cfg.snackCount || 2) && snackPool.length > 0; i++) {
    const id = snackPool[Math.floor(rng() * snackPool.length)];
    if (!picked.includes(id)) picked.push(id);
  }
  for (const id of picked) push(id, 1 + Math.floor(rng() * 3));
  return { ...npc, inventory: stacks };
}

// Add a fact to an NPC's memory. Fact can be a bare string (legacy) or an
// object { text, day, importance, category }. NPC Overhaul: added category +
// valid. Knowledge-gossip Phase 1 (D1/D2/D3/D10): the record is normalized
// through backfillFactRecordV2, so every written fact carries provenance +
// confidence + salience + pinned + emotionalTag. provenance defaults to
// 'witnessed' and is written ONCE here — a fact that changes hands becomes a
// NEW record in the receiver's memory (Phase 2), never an edit of this one.
function addMemoryFact(npc, fact) {
  const facts = [...(npc.memory.facts || [])];
  // Phase 3 (D9/D20): every fact gets a stable factId from the per-NPC
  // counter the moment it is stored — the open-question lifecycle's factId
  // reference points at it, and eviction may shift array positions, so the
  // reference must be an id, never an index. Bare-string facts (the legacy
  // shape addMemoryFact still accepts) get one the same way.
  const nextId = npc.memory.nextFactId || 1;
  const withId = typeof fact === 'string'
    ? { text: fact, factId: nextId }
    : (fact.factId != null ? fact : { ...fact, factId: nextId });
  facts.push(backfillFactRecordV2(withId));
  // Correctness plan Phase 3 (D9): evict by importance rather than FIFO. Also
  // fixes an off-by-one — the old `if (length >= max) shift()` ran BEFORE the
  // push, so the tier actually settled at maxFacts, dropping one entry early
  // on every add once full. Knowledge-gossip Phase 1 (D2/D3): the score is
  // now importance × confidence, and pinned facts never evict (D3). Facts
  // don't decay, so confidence is the living part of the score. Invalidated
  // facts (valid:false) are the cheapest thing to lose and sort to the
  // bottom on their own. An all-pinned overflow is allowed to exceed the
  // budget — the existing day-0 precedent.
  const kept = evictLowestScored(
    facts,
    BELIEF.maxFacts,
    f => (f.valid === false ? -1 : (f.importance ?? 1) * (f.confidence ?? 1)),
    f => f.pinned === true,
  );
  return { ...npc, memory: { ...npc.memory, facts: kept, nextFactId: nextId + 1 } };
}

// Phase 3 (D9/D20) — backfill the open-question fields on a saved NPC:
// default `memory.openQuestions` to [] and assign a stable `factId` to every
// held fact that lacks one (pre-Phase-3 saves, the contractor seed, any other
// legacy path that wrote facts outside addMemoryFact). Pure; a no-op for an
// NPC already carrying both. Runs from migrateNpcToV2 and the npcs 5->6
// migration so a pre-Phase-3 save gets ids without any fact being rewritten —
// provenance is written once and never edited (invariant 3), and assigning an
// id is not a rewrite of provenance or confidence.
function backfillOpenQuestionsV2(npc) {
  if (!npc || typeof npc !== 'object') return npc;
  const mem = npc.memory || {};
  let next = mem.nextFactId || 1;
  let changed = !Array.isArray(mem.openQuestions);
  const facts = (mem.facts || []).map(f => {
    if (f && typeof f === 'object' && f.factId != null) return f;
    changed = true;
    return { ...f, factId: next++ };
  });
  if (!changed) return npc;
  return {
    ...npc,
    memory: {
      ...mem,
      facts,
      openQuestions: Array.isArray(mem.openQuestions) ? mem.openQuestions : [],
      nextFactId: next,
    },
  };
}

// Correctness plan Phase 3 (D9) — evict the LEAST valuable entry, not the
// oldest. `score` is the same `importance × decay` product
// retrieveRelevantMemories already ranks by, so the tier is now surfaced and
// forgotten by one consistent theory of what matters. Facts have no decay, so
// their score is importance alone.
//
// Day-0 episodes are shared history seeded at cast generation — the beats
// that define who these people were to each other before play started. They
// are exempt, exactly as decayMemory already exempts them from decay.
// If every entry is exempt, the budget is allowed to overflow rather than
// dropping something that was declared permanent.
function evictLowestScored(list, budget, scoreFn, isExempt) {
  const out = [...list];
  while (out.length > budget) {
    let worstIdx = -1;
    let worstScore = Infinity;
    for (let i = 0; i < out.length; i++) {
      if (isExempt && isExempt(out[i])) continue;
      const s = scoreFn(out[i]);
      if (s < worstScore) { worstScore = s; worstIdx = i; }
    }
    if (worstIdx < 0) break; // everything left is exempt — keep it all
    out.splice(worstIdx, 1);
  }
  return out;
}

// Add an episode to an NPC's memory. NPC Overhaul: added emotionalTag + participants.
// Correctness plan Phase 3: `importance` now comes from the caller's source
// band (MEMORY_IMPORTANCE) rather than everything landing at 0.5, and
// eviction drops the lowest importance × decay instead of the oldest.
function addMemoryEpisode(npc, day, text, importance, emotionalTag, participants) {
  const episodes = [...(npc.memory.episodes || [])];
  episodes.push({
    day, text, decay: 1.0,
    importance: importance !== undefined && importance !== null ? importance : MEMORY_IMPORTANCE.conversational,
    emotionalTag: emotionalTag || '',
    participants: Array.isArray(participants) ? participants : [],
  });
  const kept = evictLowestScored(
    episodes,
    MEMORY_BUDGET.maxEpisodes,
    e => (e.importance ?? MEMORY_IMPORTANCE.conversational) * (e.decay ?? 1),
    e => e.day === 0,
  );
  return { ...npc, memory: { ...npc.memory, episodes: kept } };
}

// NPC Overhaul — Add a grievance to an NPC's relationship with the player
function addGrievance(npc, text, severity, day) {
  const grievances = [...(npc.relPlayer?.grievances || [])];
  grievances.push({ text, severity: severity || 0.3, day: day || 1, resolved: false });
  return { ...npc, relPlayer: { ...npc.relPlayer, grievances } };
}

// NPC Overhaul Phase 3 — Resolve a grievance by index or text match.
//
// Correctness plan Phase 1. The previous "audit fix" claimed to stop "dishes"
// from matching "washed dishes", and did not: its three clauses were
// `gText === query`, `query.length >= 4 && gText.includes(query)`, and
// `gText.includes(query) && query.length > 8`. The third is fully subsumed by
// the second (anything over 8 chars is also at least 4), so it could never
// change the outcome — and the second is a bare substring test, which is
// exactly what the comment said had been removed. "washed dishes".includes
// ("dishes") is true at 6 chars, so the documented case still matched.
//
// Two conditions now, because word boundaries alone are NOT enough — that
// was the first attempt here and it failed its own test case. `\bdishes\b`
// still matches "washed dishes", since "dishes" genuinely IS a whole word
// there. Whole-word matching answers "does this phrase occur", and the
// question we actually need answered is "is this the same grievance".
//
// So: the query must occur on word boundaries AND cover at least
// GRIEVANCE_MIN_COVERAGE of the grievance text. A model echoing a grievance
// back in order to resolve it reproduces most of it ("left dirty dishes in
// the sink" → "dirty dishes in the sink", 83%); a vague one-word query that
// would otherwise clear half the list does not ("dishes" vs "washed dishes",
// 46%). Exact equality always wins regardless of length.
const GRIEVANCE_MIN_QUERY_LEN = 4;
const GRIEVANCE_MIN_COVERAGE = 0.5;
function grievanceTextMatches(grievanceText, query) {
  if (grievanceText === query) return true;
  if (query.length < GRIEVANCE_MIN_QUERY_LEN) return false;
  if (query.length / grievanceText.length < GRIEVANCE_MIN_COVERAGE) return false;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(grievanceText);
}

function resolveGrievance(npc, indexOrText) {
  const grievances = [...(npc.relPlayer?.grievances || [])];
  if (typeof indexOrText === 'number') {
    if (grievances[indexOrText]) grievances[indexOrText] = { ...grievances[indexOrText], resolved: true };
  } else {
    const query = String(indexOrText).toLowerCase().trim();
    for (let i = 0; i < grievances.length; i++) {
      if (grievances[i].resolved) continue;
      if (grievanceTextMatches(grievances[i].text.toLowerCase(), query)) {
        grievances[i] = { ...grievances[i], resolved: true };
      }
    }
  }
  return { ...npc, relPlayer: { ...npc.relPlayer, grievances } };
}

// NPC Overhaul Phase 3 — Get unresolved grievances
function getUnresolvedGrievances(npc) {
  return (npc.relPlayer?.grievances || []).filter(g => !g.resolved);
}

// NPC Overhaul — Add a recent exchange to the conversation buffer.
// Correctness plan Phase 1 (D5/D6): the cap moved to MEMORY_BUDGET.maxRecent,
// and every entry now records which `channel` it belongs to — 'scene' for an
// in-person exchange, 'im' for a text. Both surfaces share one buffer, so
// without the tag, texting someone and then talking to them in person fed the
// model a single transcript with two unrelated conversations interleaved.
// Defaults to 'scene' so any caller that predates the parameter is unchanged.
//
// Plan X-5 Phase 1: entries also carry the `sceneId` they happened in. The
// Assessor windows on the scene (D2) and needs to know which exchanges belong
// to the one that just closed; `meta.scene.id` is the window and it is already
// persisted, so this stamps the existing id onto the existing buffer rather
// than opening a second one. Additive — an entry written before this reads as
// scene 0, exactly as a pre-Plan-2 sessionLog entry does. The two judgement
// cursors (`assessed`, `processed`) are absent until a pass sets them, which
// is what "not yet judged" means.
function addRecentExchange(npc, speaker, text, type, day, tick, channel, sceneId) {
  const recent = [...(npc.memory?.recent || [])];
  recent.push({
    speaker, text,
    type: type || 'dialogue',
    day: day || 0,
    tick: tick || 0,
    channel: channel || 'scene',
    sceneId: sceneId || 0,
  });
  while (recent.length > MEMORY_BUDGET.maxRecent) recent.shift();
  return { ...npc, memory: { ...npc.memory, recent } };
}

// NPC Overhaul — Update style counters for anti-repetition
function updateStyleCounters(npc, topic, isPersonal) {
  const sc = { ...(npc.memory?.styleCounters || {}) };
  sc.total = (sc.total || 0) + 1;
  if (isPersonal) sc.sincePersonal = 0;
  else sc.sincePersonal = (sc.sincePersonal || 0) + 1;
  sc.recentTopics = [...(sc.recentTopics || [])];
  if (topic) {
    sc.recentTopics.push(topic);
    while (sc.recentTopics.length > 10) sc.recentTopics.shift();
  }
  return { ...npc, memory: { ...npc.memory, styleCounters: sc } };
}

// NPC Overhaul Phase 4 — Determine if a topic is "personal" (relationships, feelings, past, vulnerability)
const PERSONAL_TOPIC_KEYWORDS = ['feelings', 'relationship', 'past', 'family', 'childhood', 'vulnerab', 'intimate', 'personal', 'emotional', 'fear', 'dream', 'hope', 'regret', 'secret', 'love', 'trust', 'breakup', 'trauma'];
function isPersonalTopic(topic) {
  if (!topic) return false;
  const lower = topic.toLowerCase();
  return PERSONAL_TOPIC_KEYWORDS.some(kw => lower.includes(kw));
}

// NPC Overhaul Phase 4 — Get style directive (anti-repetition, exposed for buildNpcBlockV2)
function getStyleDirective(npc) {
  const sc = npc.memory?.styleCounters;
  if (!sc) return '';
  const parts = [];
  if (Array.isArray(sc.recentTopics) && sc.recentTopics.length > 0) {
    parts.push(`You've recently discussed: ${sc.recentTopics.slice(-5).join(', ')}. Vary your topics.`);
  }
  if (sc.sincePersonal > 5) {
    parts.push(`It's been ${sc.sincePersonal} exchanges since you talked about something personal.`);
  }
  return parts.join(' ');
}

// NPC Overhaul Phase 4 — Get recent exchanges as formatted text.
// Correctness plan Phase 1 (D6): filters to one channel before slicing, so
// the scene prompt never shows text messages and the IM prompt never shows
// in-person dialogue. Entries written before the channel field existed have
// no `channel` and are treated as 'scene' — the only surface that could
// produce them in bulk, since the IM path was comparatively new.
function getRecentExchanges(npc, count, channel) {
  const recent = npc.memory?.recent;
  if (!Array.isArray(recent) || recent.length === 0) return '';
  const want = channel || 'scene';
  const inChannel = recent.filter(e => (e.channel || 'scene') === want);
  if (inChannel.length === 0) return '';
  return inChannel
    .slice(-(count || MEMORY_BUDGET.promptRecentCount))
    .map(e => `${e.speaker}: ${e.text}`)
    .join(' | ');
}

// Scene reader plan Phase 5 (D13/D14) — the PLAYER's view of the same buffer
// `getRecentExchanges` above hands to the prompt. Pure: reads `memory.recent`,
// writes nothing, returns display-ready rows so the conversation pane's DOM
// half stays a projection with no logic of its own (design invariant 1).
//
// A row is exactly one of:
//   { kind: 'time',   label }        — emitted only when the timestamp changes
//   { kind: 'bubble', from, text }   — from: 'player' | 'npc' | 'action'
//   { kind: 'beat',   text }
//
// No second cap: the buffer is already bounded at MEMORY_BUDGET.maxRecent (40,
// tuned in Plan 0 Phase 1 with a documented rationale), and the pane opens
// scrolled to the live end. A second number here would be one nobody tuned.
//
// NAMING WART, do not "fix" without checking every writer: an entry's `tick`
// holds `clock.minutes`, not a tick index — `applyProposal` passes
// `gameState.meta.clock.minutes` into `addRecentExchange`'s `tick` parameter.
// `formatTime(entry.tick)` is therefore right and `getTickIndex` is not.
function recallSceneExchanges(npc, nowDay) {
  const recent = npc?.memory?.recent;
  if (!Array.isArray(recent) || recent.length === 0) return [];
  // D6 (Plan 0): an IM must never surface in the in-person pane. Entries
  // written before the channel field existed are 'scene', same as the prompt
  // side assumes — the IM path was the newer of the two surfaces.
  const inChannel = recent.filter(e => (e.channel || 'scene') === 'scene' && e.text);
  const rows = [];
  let lastDay = null, lastTick = null;
  for (const e of inChannel) {
    const day = e.day || 0, tick = e.tick || 0;
    if (day !== lastDay || tick !== lastTick) {
      rows.push({ kind: 'time', label: recallTimeLabel(day, tick, nowDay) });
      lastDay = day; lastTick = tick;
    }
    rows.push(recallRow(e));
  }
  return rows;
}

// Scene reader plan Phase 5 — mirrors doConvSend's live mapping exactly, so a
// line reads the same recalled as it did when it happened. Anything unknown
// (memoryAdditions.recentExchanges is LLM-supplied and only validated as an
// array) degrades to a beat rather than guessing at a speaker.
function recallRow(e) {
  const type = e.type || (e.speaker === 'player' ? 'player_input' : 'dialogue');
  if (type === 'player_input') return { kind: 'bubble', from: 'player', text: e.text };
  if (type === 'dialogue') return { kind: 'bubble', from: 'npc', text: e.text };
  if (type === 'action') return { kind: 'bubble', from: 'action', text: `*${e.text}*` };
  if (type === 'internal') return { kind: 'beat', text: `(${e.text})` };
  return { kind: 'beat', text: e.text };
}

// Scene reader plan Phase 5 — how long ago, in the fewest words that stay
// unambiguous. Entries from before Plan 0 stamped these fields carry day 0;
// they read as 'Earlier', the same word sceneHistory uses for a closed scene
// whose time was never recorded. Inventing a time for them would be worse.
function recallTimeLabel(day, tick, nowDay) {
  if (!day) return 'Earlier';
  const t = formatTime(tick);
  if (nowDay != null) {
    if (day === nowDay) return t;
    if (day === nowDay - 1) return `Yesterday ${t}`;
  }
  return `${formatDate(day)} · ${t}`;
}

// NPC Overhaul Phase 4 — Keyword-scored memory retrieval
// Tokenizes a query and scores facts/episodes by keyword overlap.
// Returns top N relevant items from ALL tiers, not just recent.
// Knowledge-gossip Phase 1 (D2): facts rank by keyword score × the belief
// product (importance × confidence × salience-now), so a highly relevant but
// barely-believed fact loses to a relevant one the NPC is sure of. `nowDay`
// (optional) feeds the read-time salience decay — absent, stored salience is
// used unchanged. Episodes keep their importance × decay ranking (D14: they
// are the decaying event tier, not beliefs).
function retrieveRelevantMemories(npc, query, limit, nowDay) {
  limit = limit || 5;
  if (!query) return { facts: [], episodes: [] };

  // Tokenize: lowercase, split on non-alphanumeric, filter short tokens
  const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'it', 'this', 'that', 'i', 'you', 'he', 'she', 'they', 'we', 'do', 'did', 'does', 'have', 'has', 'had', 'what', 'who', 'where', 'when', 'why', 'how', 'about', 'with', 'for']);
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !stopwords.has(t));
  if (tokens.length === 0) return { facts: [], episodes: [] };

  // Score a text by counting token occurrences
  function score(text) {
    const lower = (text || '').toLowerCase();
    let s = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) s += 1;
    }
    return s;
  }

  // Score facts — keyword relevance × the D2 belief product
  const validFacts = ((npc.memory?.facts) || []).filter(f => f.valid !== false);
  const scoredFacts = validFacts
    .map(f => ({ fact: f, score: score(typeof f === 'string' ? f : f.text) * factBeliefScore(f, nowDay) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Score episodes (weighted by importance × decay × relevance)
  const liveEpisodes = ((npc.memory?.episodes) || []).filter(e => e.decay > 0.2);
  const scoredEpisodes = liveEpisodes
    .map(e => ({ ep: e, score: score(e.text) * (e.importance || 0.5) * e.decay }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    facts: scoredFacts.map(x => typeof x.fact === 'string' ? x.fact : x.fact.text),
    episodes: scoredEpisodes.map(x => x.ep.text),
  };
}

// NPC Overhaul Phase 4 — Full tiered memory slice for V2 prompts.
// Correctness plan Phase 1: `channel` selects which conversation surface's
// history is shown (D6), and the slice depth comes from MEMORY_BUDGET rather
// than a literal 5 (D5).
// Knowledge-gossip Phase 1 (D15): `facts` no longer joins EVERY valid fact —
// it renders the FACT_DISPLAY window (pinned + significant always, then the
// top keyword matches, then the most recent, capped at maxTotal), so the
// raised budget (BELIEF.maxFacts 60) does not grow context per conversation.
// `nowDay` (optional) feeds read-time salience decay in the retrieved rank.
function buildMemorySliceV2(npc, query, channel, nowDay) {
  const retrieved = query ? retrieveRelevantMemories(npc, query, FACT_DISPLAY.retrieved, nowDay) : { facts: [], episodes: [] };
  const mem = npc.memory || {};
  return {
    recent: getRecentExchanges(npc, MEMORY_BUDGET.promptRecentCount, channel),
    facts: buildFactDisplayWindow(mem.facts || [], retrieved.facts),
    retrievedFacts: retrieved.facts,
    episodes: (mem.episodes || []).filter(e => e.decay > 0.2).map(e => e.text),
    retrievedEpisodes: retrieved.episodes,
    summary: mem.summary || '',
    styleDirective: getStyleDirective(npc),
  };
}

// D15 — the prompt's [Memories — facts] window. Composition order:
//   1. always: pinned or importance >= significant (FACT_DISPLAY.always)
//   2. retrieved-top: the top keyword matches retrieval just produced
//   3. most-recent: remaining valid facts, newest day first
// Deduplicated by text (retrieval returns strings) and capped at
// FACT_DISPLAY.maxTotal. Pinned+significant facts survive until the absolute
// cap — that is the closest "always shown" can come to literal under a bound.
function buildFactDisplayWindow(facts, retrievedTexts) {
  const significant = MEMORY_IMPORTANCE.significant;
  const valid = facts.filter(f => f.valid !== false);
  const window = [];
  const seen = new Set();
  const push = (text) => {
    if (text == null || seen.has(text)) return;
    if (window.length >= FACT_DISPLAY.maxTotal) return;
    seen.add(text);
    window.push(text);
  };

  if (FACT_DISPLAY.always) {
    for (const f of valid) {
      if (f.pinned || (f.importance ?? 1) >= significant) push(f.text);
    }
  }
  for (const t of retrievedTexts || []) push(t);
  const recent = valid
    .filter(f => !seen.has(f.text))
    .sort((a, b) => (b.day ?? 0) - (a.day ?? 0))
    .slice(0, FACT_DISPLAY.recent);
  for (const f of recent) push(f.text);
  return window;
}

// D11 (knowledge-gossip-memory-plan Phase 3) — the player model, DERIVED and
// never stored (R7: what an NPC knows about the player was earned in play —
// there is no second writer to drift from the belief store). A pure query
// over the NPC's beliefs and episodes that reference the player:
//   { observes: [...], shared: [...], derivesFrom: [...], honesty }
// observes   — facts the NPC witnessed first-hand that reference the player
// derivesFrom — player-relevant facts learned secondhand (told_by / overheard
//              / inferred) — what they've been told about you
// shared     — episodes whose participants include the player (shared activity)
// honesty    — mean confidence across the facts feeding the player model
//              (falls back to all facts when nothing references the player)
// Named consumers: Phase 5's studio Memory tab renders this; nothing else
// reads it yet (the NOTE_TEMPLATES precedent — the consumer is named, not
// smuggled).
function derivePlayerModel(npc) {
  const facts = (npc?.memory?.facts || []).filter(f => f.valid !== false);
  const playerRef = (text) => /(the player|player'?s|\byou\b|\byour\b)/i.test(text || '');
  const observes = [];
  const derivesFrom = [];
  for (const f of facts) {
    if (!playerRef(f.text)) continue;
    const prov = f.provenance || 'witnessed';
    const rec = { text: f.text, confidence: f.confidence ?? 1, provenance: prov };
    if (prov === 'witnessed') observes.push(rec);
    else derivesFrom.push(rec);
  }
  const shared = (npc?.memory?.episodes || [])
    .filter(e => (e.participants || []).some(p => {
      const s = String(p).toLowerCase();
      return s === 'player' || s === 'you' || s === 'the player';
    }))
    .map(e => ({ text: e.text, day: e.day || 0, tag: e.emotionalTag || '' }));
  const pool = [...observes, ...derivesFrom];
  const mean = (arr) => arr.length > 0 ? arr.reduce((s, r) => s + r.confidence, 0) / arr.length : null;
  const honesty = mean(pool) ?? mean(facts) ?? 1;
  return { observes, shared, derivesFrom, honesty };
}

// D13 (knowledge-gossip-memory-plan Phase 4) — the bridge. PURE: reads the
// NPC's open questions, writes nothing, returns the highest-curiosity record
// at/above RUMINATION.raiseThreshold, or null. This is the phase's reader for
// `openQuestions` and `curiosity` (R8/RI6) — the declared consumer the Phase 3
// lifecycle named. It re-checks the question's premise against the SAME rule
// the lifecycle's retire step uses, so the bridge and the lifecycle can never
// disagree about whether a question is alive:
//   - the referenced fact must still exist and be valid (a fact evicted since
//     the last rumination pass would otherwise be raised as a stale belief),
//   - it must still be low-confidence (re-witnessed past createThreshold ends
//     wondering — D2's up-route — even between passes).
// Ties break on factId so the function is deterministic for a given NPC.
function topOpenQuestion(npc) {
  const qs = npc?.memory?.openQuestions;
  if (!Array.isArray(qs) || qs.length === 0) return null;
  const facts = npc.memory.facts || [];
  let best = null;
  for (const q of qs) {
    if ((q.curiosity ?? 0) < RUMINATION.raiseThreshold) continue;
    const f = facts.find(x => x && x.factId === q.factId);
    if (!f || f.valid === false) continue;
    if ((f.confidence ?? 1) > RUMINATION.createThreshold) continue;
    if (!best || q.curiosity > best.curiosity || (q.curiosity === best.curiosity && (q.factId ?? 0) < (best.factId ?? 0))) {
      best = q;
    }
  }
  return best;
}

// D17 (knowledge-gossip-memory-plan Phase 5) — the studio's grouped memory
// view. PURE: reads the extended record and returns a display-ready
// structure, writes nothing. This is the R8/RI6 reader for every field of
// the extended fact record (provenance / confidence / salience / pinned /
// emotionalTag / factId / day / importance / category / valid), the episode
// record, recent exchanges, the summary, and the open-question records —
// nothing the studio's Memory tab shows is a field nobody reads. The D13
// bridge (topOpenQuestion) and the D11 player model are included because the
// Memory tab renders them too — the same consumers the lifecycle named.
//
//   {
//     facts:        [ { ...all fact fields } ],
//     episodes:     [ { day, text, decay, importance, emotionalTag, participants } ],
//     recent:       [ { speaker, text, day, tick, type, channel } ],
//     summary, summaryRevision,
//     openQuestions:[ { topic, factId, curiosity, age, born, targets } ],
//     nextFactId,
//     playerModel:  derivePlayerModel(npc),
//     openQuestion: topOpenQuestion(npc),
//   }
function buildMemoryProfileView(npc) {
  const mem = npc?.memory || {};
  return {
    facts: (mem.facts || []).map(f => ({
      text: f.text, day: f.day ?? 0, importance: f.importance ?? 0.5,
      category: f.category || 'other', valid: f.valid !== false,
      provenance: f.provenance || 'witnessed',
      confidence: f.confidence ?? 1, salience: f.salience ?? BELIEF.salienceDefault,
      pinned: f.pinned === true, emotionalTag: f.emotionalTag || '',
      factId: f.factId,
    })),
    episodes: (mem.episodes || []).map(e => ({
      day: e.day ?? 0, text: e.text, decay: e.decay ?? 1,
      importance: e.importance ?? MEMORY_IMPORTANCE.conversational,
      emotionalTag: e.emotionalTag || '',
      participants: Array.isArray(e.participants) ? [...e.participants] : [],
    })),
    recent: (mem.recent || []).map(e => ({
      speaker: e.speaker || '', text: e.text || '',
      day: e.day ?? 0, tick: e.tick ?? 0, type: e.type || '', channel: e.channel || 'scene',
    })),
    summary: mem.summary || '',
    summaryRevision: mem.summaryRevision ?? 0,
    openQuestions: (mem.openQuestions || []).map(q => ({
      topic: q.topic || '', factId: q.factId, curiosity: q.curiosity ?? 0.2,
      age: q.age ?? 0, born: q.born ?? 1, targets: Array.isArray(q.targets) ? [...q.targets] : [],
    })),
    nextFactId: mem.nextFactId ?? 1,
    playerModel: derivePlayerModel(npc),
    openQuestion: topOpenQuestion(npc),
  };
}

// --- Transmission (knowledge-gossip-memory-plan Phase 2, D5/D6/D18) ---
// Facts travel only through actual conversation events (R6). The deterministic
// leg (the npc_chat drive) calls pickFactsToRaise for its speaker; the
// model-assisted leg (applyProposal's overhearing) does the same over the
// facts the model just wrote. All of it is arithmetic over state — nothing
// here is async and nothing reaches the LLM (R2), which is what makes it
// measurable.

// D2 — how a fact's worth-raising decays with age. recency = 0.5^(age/halfLife).
function factRecency(f, nowDay) {
  const age = Math.max(0, (nowDay ?? f.day ?? 0) - (f.day ?? 0));
  return Math.pow(0.5, age / TRANSMISSION.recencyHalfLifeDays);
}

// D10 — emotional weight is a config lookup keyed by the fact's tag. No
// free-floating weight written by the model; unknown tags read the default.
function factEmotionalWeight(f) {
  const tag = (f && f.emotionalTag) || '';
  return EMOTIONAL_WEIGHTS[tag] ?? EMOTIONAL_WEIGHTS.default;
}

// D4 — does this fact's category give the listener a reason to care?
// Categories are free-form (the model writes them, the seeds say 'history'),
// so the match is textual against the listener's interest names AND their
// tags: a strong match is the category naming the interest, a match is it
// touching one of the interest's tags. No match still pays a small floor —
// people do tell each other things outside their hobbies.
function factInterestRelevance(f, listener) {
  const cat = ((f && f.category) || '').toLowerCase();
  if (!cat || cat === 'other' || !Array.isArray(listener?.bible?.interests) || listener.bible.interests.length === 0) {
    return TRANSMISSION.relevanceNoMatch;
  }
  for (const int of listener.bible.interests) {
    const name = String((int && int.name) || '').toLowerCase();
    if (name && (cat === name || cat.includes(name) || name.includes(cat))) return TRANSMISSION.relevanceStrong;
    for (const tag of (int && int.tags) || []) {
      const t = String(tag).toLowerCase();
      if (t && (cat === t || cat.includes(t) || t.includes(cat))) return TRANSMISSION.relevanceMatch;
    }
  }
  return TRANSMISSION.relevanceNoMatch;
}

// D6 — personality biases which facts qualify. The chooser's own temperament:
// high openness toward novel/secondhand facts (inferred / told_by provenance),
// high warmth toward social/relationship facts, high conscientiousness toward
// practical facts. A second-hand fact is fully eligible — it is just never
// raised as if witnessed (its provenance travels with it, and the receiver's
// record is told_by:<last hop>, never 'witnessed').
function factPersonalityBias(f, chooser) {
  const t = chooser?.bible?.temperament || {};
  let mult = 1;
  const prov = (f && f.provenance) || '';
  if (prov === 'inferred' || prov.startsWith('told_by:')) mult += Math.max(0, t.openness ?? 0) * TRANSMISSION.biasNovel;
  const cat = ((f && f.category) || '').toLowerCase();
  if (TRANSMISSION.socialCategories.includes(cat)) mult += Math.max(0, t.warmth ?? 0) * TRANSMISSION.biasSocial;
  if (TRANSMISSION.practicalCategories.includes(cat)) mult += Math.max(0, t.conscientiousness ?? 0) * TRANSMISSION.biasPractical;
  return mult;
}

// D6 — the overall-frequency knob. Floors at talkativenessBase and scales up
// with how verbose + assertive the chooser is (the two things that make a
// person bring things up).
function talkativeness(npc) {
  const t = npc?.bible?.temperament || {};
  const verbosity = npc?.bible?.speech?.verbosity ?? 0.5;
  return Math.max(TRANSMISSION.talkativenessBase, Math.min(0.9,
    TRANSMISSION.talkativenessBase
    + (verbosity - 0.5) * TRANSMISSION.talkativenessVerbosity
    + (t.assertiveness ?? 0) * TRANSMISSION.talkativenessAssertiveness));
}

// D6 — the eligibility product: recency × emotionalWeight × relevanceToListener,
// with the chooser's personality bias on top.
function factRaiseScore(f, chooser, listener, nowDay) {
  return factRecency(f, nowDay)
    * factEmotionalWeight(f)
    * factInterestRelevance(f, listener)
    * factPersonalityBias(f, chooser);
}

// D5/D6 — PURE: which of the chooser's facts they'd actually raise to this
// listener. `chooser` is whoever decides to speak (or, on the overhearing
// leg, whoever decides to retain); `listener` is the target whose interests
// gate relevance (the chooser themselves on the overhearing leg). Candidates
// default to the chooser's own valid facts. Facts at or below the confidence
// floor are never raised (D2: still stored, but not worth repeating).
//
// Scored descending, each candidate accepted with P = talkativeness ×
// score ÷ raiseScoreRef (capped at 1) — the probability scales with the
// ABSOLUTE score, not the top score, so a lone ancient/irrelevant fact is
// still near-never raised (D6's negative case), and talkativeness sets the
// overall frequency. Returns the fact RECORDS (not stripped payloads) so the
// receiver-write can carry category / emotionalTag / importance across, not
// just text. Pure given its rng: reads state, writes nothing.
function pickFactsToRaise(chooser, listener, count, nowDay, rng, candidates) {
  count = count || TRANSMISSION.factsPerChat;
  const pool = (candidates || chooser?.memory?.facts || [])
    .filter(f => f && f.valid !== false && (f.confidence ?? 1) > BELIEF.confidenceFloor);
  const scored = pool
    .map(f => ({ f, score: factRaiseScore(f, chooser, listener, nowDay) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const r = rng || Math.random;
  const talk = talkativeness(chooser);
  const out = [];
  for (const { f, score } of scored) {
    if (out.length >= count) break;
    const p = Math.min(1, (talk * score) / TRANSMISSION.raiseScoreRef);
    if (r() >= p) continue;
    out.push(f);
  }
  return out;
}

// D2/D18 — the receiver-side write. PURE: takes the receiver and a raised fact
// record, returns a NEW receiver. Two paths:
//  - The receiver already holds the same text: that is re-witnessing, D2's one
//    up-route — confidence boosts toward 1, day/salience refresh, provenance
//    is NOT touched (invariant 3: provenance is written once and never
//    rewritten). No duplicate record is created.
//  - Otherwise a NEW record lands with `told_by:<sourceId>` (deterministic
//    leg) or 'overheard' (model leg), confidence × hopAttenuation /
//    × overheardAttenuation, floored at confidenceFloor — a fact at the floor
//    is stored but can never be raised, so the floor is where decay stops.
function receiveTransmittedFact(receiver, raised, opts) {
  if (!receiver || !raised) return receiver;
  const facts = receiver.memory?.facts || [];
  const existing = facts.find(f => f.text === raised.text);
  if (existing) {
    const boosted = Math.min(1, (existing.confidence ?? 1) + TRANSMISSION.reWitnessBoost);
    const refreshed = facts.map(f => (f === existing ? {
      ...f,
      confidence: boosted,
      day: opts?.day ?? f.day,
      salience: Math.max(f.salience ?? BELIEF.salienceDefault, BELIEF.salienceDefault),
    } : f));
    return { ...receiver, memory: { ...receiver.memory, facts: refreshed } };
  }
  const attenuation = opts?.kind === 'overheard' ? BELIEF.overheardAttenuation : BELIEF.hopAttenuation;
  const confidence = Math.max(BELIEF.confidenceFloor, (raised.confidence ?? 1) * attenuation);
  const provenance = opts?.provenance || (opts?.sourceId ? `told_by:${opts.sourceId}` : 'overheard');
  const record = backfillFactRecordV2({
    text: raised.text,
    day: opts?.day ?? (raised.day ?? 0),
    importance: raised.importance ?? MEMORY_IMPORTANCE.conversational,
    category: raised.category || 'other',
    valid: true,
    provenance,
    confidence,
    emotionalTag: raised.emotionalTag || '',
  });
  return addMemoryFact(receiver, record);
}

// D5 — the scene line's topic: a short noun phrase derived deterministically
// from the raised fact's text (the tick has no LLM). Attribution prefixes are
// stripped ("X said", "The player's", "I noticed") and the result is cut to a
// readable clause. R1-compatible: never a raw category slug or an internal
// field.
function factTopicPhrase(text) {
  if (!text) return 'something';
  let t = String(text).trim().replace(/^["“']|["”']$/g, '');
  t = t.replace(/^(the player's?|my|their|his|her)\s+/i, '');
  t = t.replace(/^(he|she|they|i|we)\s+(said|mentioned|told me|thinks?|believes?|heard|noticed|knows?|knew|reckons?|claims?|says?)\s+(that|about|how)?\s*/i, '');
  t = t.replace(/^[A-Z][a-z]+(\s|'s\s)+(said|mentioned|told me|thinks?|believes?|heard|noticed|knows?|knew|reckons?|claims?|says?)\s+(that|about|how)?\s*/i, '');
  t = t.replace(/^(about|that)\s+/i, '');
  t = t.replace(/^(he's|she's|they're|he is|she is|they are|i'm|i am)\s+/i, '');
  t = t.split(/\s+[-–—]\s+/)[0];
  const words = t.split(/\s+/).filter(Boolean).slice(0, 6).join(' ').replace(/[.,!?;:]+$/, '');
  if (!words) return 'something';
  return words.charAt(0).toLowerCase() + words.slice(1);
}

// Decay all episodes for an NPC
function decayMemory(npc, ticks) {
  const episodes = (npc.memory.episodes || []).map(e => ({
    ...e,
    decay: Math.max(0, e.decay - MEMORY_BUDGET.episodeDecayPerTick * ticks),
  }));
  // Remove fully decayed episodes (but keep those from day 0 = shared history)
  const filtered = episodes.filter(e => e.decay > 0 || e.day === 0);
  return { ...npc, memory: { ...npc.memory, episodes: filtered } };
}

// --- Relationship axis management ---

function clampAxis(v) { return Math.max(-1, Math.min(1, v)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// NPC Overhaul — derive intimacyLevel and conversationPhase from relationship
// axes. Correctness plan Phase 2 (D1/D2) rebased the formula; see
// PHASE_THRESHOLDS in CONFIG for what was wrong with the old one.
//
//   raw   = trust + affection + (2 × comfort) − tension     // range [−3, 4]
//   level = clamp(raw / 4, 0, 1) × 100
//
// A stranger (all axes 0) now scores 0 and reads `early`, which is the whole
// point. Fully positive scores 100. `familiar` now costs a real
// trust + affection + 2·comfort − tension ≥ 0.8.
//
// D2: tension SUBTRACTS. Someone who is furious with you is not `intimate`
// however much they also trust you — the old formula ignored tension
// entirely, so a relationship could be simultaneously at maximum hostility
// and reading as "deeply connected, physical and emotional closeness colors
// everything" in the prompt.
function deriveConversationPhase(rel) {
  const raw = (rel.trust || 0) + (rel.affection || 0)
            + (2 * (rel.comfort || 0)) - (rel.tension || 0);
  const intimacyLevel = Math.round(Math.max(0, Math.min(1, raw / 4)) * 100);
  let phase = 'early';
  if (intimacyLevel >= PHASE_THRESHOLDS.intimate) phase = 'intimate';
  else if (intimacyLevel >= PHASE_THRESHOLDS.close) phase = 'close';
  else if (intimacyLevel >= PHASE_THRESHOLDS.familiar) phase = 'familiar';
  return { intimacyLevel, conversationPhase: phase };
}

function applyRelDelta(npc, deltas, currentDay) {
  const rel = npc.relPlayer;
  const updated = {
    ...npc,
    relPlayer: {
      ...rel,
      trust: clampAxis(rel.trust + (deltas.trust || 0)),
      affection: clampAxis(rel.affection + (deltas.affection || 0)),
      tension: clampAxis(rel.tension + (deltas.tension || 0)),
      respect: clampAxis(rel.respect + (deltas.respect || 0)),
      comfort: clamp01((rel.comfort || 0) + (deltas.comfort || 0)),       // NPC Overhaul
      desire: clampAxis((rel.desire || 0) + (deltas.desire || 0)),        // NPC Overhaul
      lastInteractionDay: currentDay !== undefined ? currentDay : (rel.lastInteractionDay || 1), // NPC Overhaul Phase 3
    },
  };
  // NPC Overhaul — rederive intimacyLevel + conversationPhase after deltas
  const { intimacyLevel, conversationPhase } = deriveConversationPhase(updated.relPlayer);
  updated.relPlayer.intimacyLevel = intimacyLevel;
  updated.relPlayer.conversationPhase = conversationPhase;
  return updated;
}

function applyNpcToNpcDelta(castWeb, npcA, npcB, deltas) {
  const key = [npcA, npcB].sort().join('|');
  const pair = castWeb[key] || createBlankPair(npcA, npcB);
  const dirKey = `${npcA}→${npcB}`;
  const axes = { ...pair.axes };
  const prev = axes[dirKey] || { trust: 0, affection: 0, tension: 0, respect: 0 };
  axes[dirKey] = {
    trust: clampAxis(prev.trust + (deltas.trust || 0)),
    affection: clampAxis(prev.affection + (deltas.affection || 0)),
    tension: clampAxis(prev.tension + (deltas.tension || 0)),
    respect: clampAxis(prev.respect + (deltas.respect || 0)),
    comfort: clamp01((prev.comfort || 0) + (deltas.comfort || 0)),         // NPC Overhaul
    desire: clampAxis((prev.desire || 0) + (deltas.desire || 0)),          // NPC Overhaul
  };
  return { ...castWeb, [key]: { ...pair, axes } };
}

function createBlankPair(a, b) {
  return {
    priorRel: { known: 0, met: 'met recently', whoFirst: a },
    axes: {
      [`${a}→${b}`]: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 }, // NPC Overhaul: +comfort, +desire
      [`${b}→${a}`]: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 }, // NPC Overhaul: +comfort, +desire
    },
    sharedBeat: '',
    beatPositive: true,
    compatibility: 0.5,
    friction: 0.3,
  };
}

// --- Mood management ---
// NPC Overhaul Phase 7 — accept optional reason for mood change
function applyMoodDelta(npc, delta, reason) {
  const updated = { ...npc, mood: clampAxis(npc.mood + delta) };
  if (reason) updated.moodReason = reason;
  return updated;
}

// --- Scene participation: active vs ambient ---
// sceneState.engagement[npcId] tracks turns-since-addressed-or-spoke for
// each currently active NPC (see advanceEngagement below) — this is what
// "least-engaged" means for demotion, not simply "added first," which the
// previous active.shift() implementation actually did despite the name.

// Promote an ambient (or already-active) NPC to active. If already active,
// this just re-engages them (resets their turn counter) — no demotion.
// Otherwise, promoting past the cap demotes whoever has gone the longest
// without being addressed or speaking. Returns { sceneState, demotedId }
// (demotedId is null if nobody was demoted) so the caller can narrate the
// demotion as an in-fiction beat — per the brief, never a silent swap.
function promoteToActive(sceneState, npcId) {
  const engagement = { ...(sceneState.engagement || {}) };

  if (sceneState.active.includes(npcId)) {
    engagement[npcId] = 0;
    return { sceneState: { ...sceneState, engagement }, demotedId: null };
  }

  const ambIdx = sceneState.ambient.indexOf(npcId);
  if (ambIdx < 0) return { sceneState, demotedId: null }; // not present in the scene

  const ambient = [...sceneState.ambient];
  ambient.splice(ambIdx, 1);
  let active = [...sceneState.active, npcId];
  engagement[npcId] = 0;

  let demotedId = null;
  if (active.length > SCENE.maxActiveNpcs) {
    let worstId = null;
    let worstScore = -1;
    for (const id of active) {
      if (id === npcId) continue; // never demote the person just promoted
      const score = engagement[id] || 0;
      if (score >= worstScore) { worstScore = score; worstId = id; }
    }
    demotedId = worstId;
    active = active.filter(id => id !== demotedId);
    delete engagement[demotedId];
    ambient.push(demotedId);
  }

  return { sceneState: { ...sceneState, active, ambient, engagement }, demotedId };
}

function demoteToAmbient(sceneState, npcId) {
  const active = sceneState.active.filter(id => id !== npcId);
  const ambient = [...sceneState.ambient];
  if (!ambient.includes(npcId)) ambient.push(npcId);
  const engagement = { ...(sceneState.engagement || {}) };
  delete engagement[npcId];
  return { ...sceneState, active, ambient, engagement };
}

// Advance engagement tracking after a scene turn: everyone active drifts
// one turn further from being engaged, except whoever actually spoke this
// turn (from the LLM's dialogue), who resets to freshly engaged.
function advanceEngagement(sceneState, speakerIds) {
  const engagement = { ...(sceneState.engagement || {}) };
  for (const id of sceneState.active) {
    engagement[id] = (speakerIds || []).includes(id) ? 0 : (engagement[id] || 0) + 1;
  }
  return { ...sceneState, engagement };
}

// Resolve LLM dialogue speakers (which may be an npc id OR name — both are
// valid per validateProposal) back to npc ids, for engagement tracking.
function resolveSpeakerIds(dialogue, activeNpcsContext) {
  const ids = [];
  for (const d of dialogue || []) {
    const match = (activeNpcsContext || []).find(n => n.id === d.speaker || n.name === d.speaker);
    if (match) ids.push(match.id);
  }
  return ids;
}

// --- Context assembly for LLM ---
// Builds the context object that LLM uses to construct prompts.
// Only loads bibles for active NPCs (max 2). Ambient NPCs get one-line sketch.

function assembleContext(gameState, sceneState) {
  const { player, npcs, world, meta } = gameState;
  const roomId = player.location;
  const room = world.rooms[roomId] || {};
  const phase = meta.clock.phase;
  const time = formatTime(meta.clock.minutes);
  const day = meta.clock.day;

  // Escorts (external-world plan Phase 7): map any active escort visit to its
  // booking so the scene prompt can inject the purchased set as that
  // character's in-fiction boundaries. Computed once for the whole scene
  // (getActiveVisits is the same call the tick loop already makes).
  const activeEscortBookings = {};
  for (const v of getActiveVisits(gameState)) {
    if (v.purpose !== 'escort') continue;
    const b = (world.escortBookings || []).find(bk => bk.id === v.sourceId && bk.status === 'active');
    if (b) activeEscortBookings[v.npcId] = b;
  }

  // Active NPCs: full bible + relationship + memory
  const activeContext = sceneState.active.map(id => {
    const npc = npcs[id];
    if (!npc) return null;
    const escortBooking = activeEscortBookings[id] || null;
    return {
      id,
      name: npc.bible.name || 'Unknown',
      bible: npc.bible,
      mood: npc.mood,
      activity: npc.activity,
      needs: npc.needs,
      relPlayer: npc.relPlayer,
      memory: npc.memory || { facts: [], episodes: [], summary: '', recent: [], styleCounters: {} },
      memoryV2: null, // NPC Overhaul Audit: removed — was redundant with memory, both built with null query
      castWebSlice: buildCastWebSlice(id, npcs, world.castWeb),
      clothing: npc.clothing,                   // NPC Overhaul — for clothingLabel
      moodReason: npc.moodReason || '',         // NPC Overhaul
      schedule: npc.schedule || null,           // NPC Overhaul Phase 7.2
      // Perception plan Phase 5: what THIS character can sense, which is not
      // necessarily what the player can — same room, different attention, and
      // a keener roommate notices the smell from the laundry two doors down
      // that you walked straight past. A roommate remarking on something the
      // player hasn't mentioned is the first moment the perception layer is
      // visible in fiction rather than in mechanics.
      perceived: mergePerceived(perceiveSignals(gameState, id, npc.location || roomId))
        .slice(0, 3)
        .map(rec => ({ ...rec, phrase: signalPhrase(rec, gameState) })),
      // Escorts (external-world plan Phase 7): the live booking, if this NPC
      // is mid-appointment. buildNpcBlockV2 reads boundaryText; the services
      // array is also what the scene chips are built from.
      escortSession: escortBooking ? {
        services: escortBooking.services || [],
        labels: (escortBooking.services || []).map(sid => ESCORT_SERVICE_DEFS[sid]?.label || sid),
        boundaryText: buildEscortBoundaryText(escortBooking),
      } : null,
    };
  }).filter(Boolean);

  // Ambient NPCs: one-line sketch + current activity
  const ambientContext = sceneState.ambient.map(id => {
    const npc = npcs[id];
    if (!npc) return null;
    return {
      id,
      name: npc.bible.name || 'Unknown',
      sketch: npc.bible.sketch || `${npc.bible.name || 'Someone'} is ${npc.activity || 'here'}.`,
      activity: npc.activity,
    };
  }).filter(Boolean);

  return {
    contentConfig: meta.contentConfig || null,
    // Correctness plan Phase 1 (D6): which conversation surface this context
    // belongs to. applyProposal reads it to tag memory.recent entries, and the
    // prompt builders read it to filter that buffer back down to one channel.
    channel: 'scene',
    scene: {
      room: ROOMS[roomId]?.name || roomId,
      roomId,
      phase,
      time,
      day,
      cleanliness: room.cleanliness,
      // Perception plan Phase 2 (D10): replaces the old `odor: 'none'|'smelly'`
      // boolean. What the PLAYER can actually sense standing here, merged to
      // one record per signal and already sorted by salience — so the prompt
      // can describe a smell drifting in from the next room, which the room-
      // scoped flag could not represent at all.
      signals: mergePerceived(perceiveSignals(gameState, 'player', roomId))
        .map(rec => ({ ...rec, phrase: signalPhrase(rec, gameState) })),
    },
    player: {
      name: 'You',
      location: roomId,
      mood: player.mood,
      energy: player.energy,
      hunger: player.hunger,
      money: player.money,
      flags: player.flags,
    },
    activeNpcs: activeContext,
    ambientNpcs: ambientContext,
    worldEvents: getRecentEvents(world.events, 3, npcs),
    // WORLD/ITEMS reach data for the effects boundary (EFFECTS' reach-set)
    // — the LLM proposal path validates object/item effects against
    // exactly this room's objects and the player's own inventory, never
    // the whole apartment.
    roomObjects: (gameState.objects && gameState.objects[`room_${roomId}`]) || {},
    carryItems: player.inventory || [],
  };
}

// Context for a single IM exchange (COMPUTER's im app) — same shape
// assembleContext produces (validateProposal/applyProposal read the same
// fields either way), but for exactly one npc and with no room framing:
// you're texting them, not standing in front of them. roomObjects/
// carryItems are empty on purpose — nothing physically reachable over
// text, so any object/item effect a reply tried to sneak in fails EFFECTS'
// reach-set check the same way a genuinely out-of-room reference would.
function assembleImContext(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  if (!npc) return null;
  // Correctness plan Phase 1 (D7): the real persisted thread, trailing
  // IM_PROMPT.threadDepth messages. buildImPrompt renders it as the actual
  // conversation history — previously an IM reply saw only the shared
  // memory.recent buffer, which held five entries of MIXED scene and IM
  // dialogue. Assembled here rather than reached for inside the prompt
  // builder so the builder stays a pure function of its context.
  const thread = gameState.world.computer?.apps?.im?.threads?.[npcId];
  const threadTail = (thread?.msgs || []).slice(-IM_PROMPT.threadDepth);
  return {
    contentConfig: gameState.meta.contentConfig || null,
    channel: 'im',
    imThread: threadTail,
    // Knowledge-gossip Phase 1 (D2): the current in-game day, so the IM
    // prompt's memory retrieval can apply read-time salience decay.
    day: gameState.meta.clock.day,
    player: {
      name: 'You', mood: gameState.player.mood, money: gameState.player.money, flags: gameState.player.flags,
    },
    activeNpcs: [{
      id: npcId, name: npc.bible.name || 'Unknown', bible: npc.bible, mood: npc.mood, activity: npc.activity,
      needs: npc.needs, relPlayer: npc.relPlayer,
      memory: npc.memory || { facts: [], episodes: [], summary: '', recent: [], styleCounters: {} },
      memoryV2: null,
      castWebSlice: buildCastWebSlice(npcId, gameState.npcs, gameState.world.castWeb),
      clothing: npc.clothing,                   // NPC Overhaul
      moodReason: npc.moodReason || '',         // NPC Overhaul
      schedule: npc.schedule || null,           // NPC Overhaul Phase 7.2
    }],
    ambientNpcs: [],
    worldEvents: [],
    roomObjects: {}, carryItems: [],
  };
}

function buildCastWebSlice(npcId, npcs, castWeb) {
  const slice = [];
  for (const [pairKey, pair] of Object.entries(castWeb || {})) {
    if (!pairKey.includes(npcId)) continue;
    const otherId = pairKey.split('|').find(id => id !== npcId);
    const other = npcs[otherId];
    if (!other) continue;
    const dirKey = `${npcId}→${otherId}`;
    const axes = pair.axes?.[dirKey] || {};
    slice.push({
      name: other.bible.name || otherId,
      status: other.residency?.status || 'resident',
      relationship: {
        trust: axes.trust || 0,
        affection: axes.affection || 0,
        tension: axes.tension || 0,
        respect: axes.respect || 0,
        comfort: axes.comfort || 0,   // NPC Overhaul Phase 3.9
        desire: axes.desire || 0,      // NPC Overhaul Phase 3.9
      },
      sharedHistory: pair.sharedBeat || '',
      known: pair.priorRel?.known || 0,
    });
  }
  return slice;
}

// Resolve the N most recent events into readable text using formatEventText
// (SIM), so LLM can drop them into a prompt without needing its own copy of
// the npcs map. Text is resolved here — assembleContext already has npcs in
// scope — rather than passed as a raw template downstream.
function getRecentEvents(events, count, npcs) {
  return (events || []).slice(-count).map(e => ({
    type: e.type,
    npcId: e.npcId,
    roomId: e.roomId,
    text: formatEventText(e, npcs || {}),
  }));
}

// --- Move-in advocacy (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 8) ---
// The proposal contract gains an optional `advocateFor` field: a resident (or
// the player) organically suggests someone should move in, and the player then
// runs the existing offer flow against that external NPC. Everything for the
// suggestion side lives here so the scene and IM paths behave identically;
// the ACCEPT side (COMPUTER's acceptApplicant) re-checks eligibility
// independently — recording an offer never bypasses it.

const PHASE_ORDER = ['early', 'familiar', 'close', 'intimate'];
function phaseAtLeast(phase, min) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(min);
}

// The player's relationship with an NPC as a phase comparison — the same
// ladder deriveConversationPhase produces from trust/affection/comfort.
function hasPlayerPhaseAtLeast(npc, min) {
  return !!npc?.relPlayer && phaseAtLeast(npc.relPlayer.conversationPhase || 'early', min);
}

// Resident→external bond as scored on castWeb, in the direction where the
// resident is the subject — "close enough that THIS resident would vouch for
// them." CastWeb entries exist only between NPCs who have actually met (the
// social drives write them), so a missing pair is simply not close.
function hasStrongNpcRelationship(gameState, residentId, targetId) {
  const pairKey = [residentId, targetId].sort().join('|');
  const pair = gameState.world.castWeb?.[pairKey];
  if (!pair?.axes) return false;
  const dirKey = `${residentId}→${targetId}`;
  const axes = pair.axes[dirKey] || {};
  return (axes.affection || 0) >= MOVE_IN_TUNING.residentAffectionMin
    && (axes.trust || 0) >= MOVE_IN_TUNING.residentTrustMin;
}

// Move-in eligibility (locked decision 15): the player is close to them, OR
// any current resident is. This is the acceptance gate the offer flow
// (acceptApplicant) enforces — a Classifieds applicant ('prospective') is
// already eligible by virtue of being interviewed through the posted ad.
function isMoveInEligible(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc) return false;
  if (npc.residency?.status === 'prospective') return true;
  if (hasPlayerPhaseAtLeast(npc, MOVE_IN_TUNING.playerPhaseMin)) return true;
  for (const [rid, rnpc] of Object.entries(gameState.npcs || {})) {
    if (rid === npcId || rnpc?.residency?.status !== 'resident') continue;
    if (hasStrongNpcRelationship(gameState, rid, npcId)) return true;
  }
  return false;
}

// Resolve the LLM's `advocateFor` value to a real external NPC id. The value
// is almost always a NAME — the model only ever sees the target's name in the
// advocate's [Relationships with others] block, never their id — so name
// resolution is the common path, with a direct id match as the shortcut.
// Returns null when unresolvable, already a resident, or a 'prospective'
// applicant (they already have the RoomList flow; no offer needed).
function resolveAdvocateTargetId(gameState, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const npcs = gameState.npcs || {};
  if (npcs[value]) {
    return (npcs[value].residency?.status === 'resident') ? null : value;
  }
  const name = value.trim();
  for (const [id, npc] of Object.entries(npcs)) {
    if ((npc.bible?.name || '').toLowerCase() === name.toLowerCase()) {
      const status = npc.residency?.status;
      if (status === 'resident' || status === 'prospective') return null;
      return id;
    }
  }
  return null;
}

// Which NPC raised the advocacy — the first dialogue line spoken by a scene
// NPC, falling back to 'player' (e.g. an IM reply with the player as the
// only obvious party, or an advocateFor emitted without dialogue).
function resolveAdvocacySpeaker(proposal, context) {
  for (const d of proposal.dialogue || []) {
    const match = (context.activeNpcs || []).find(n => n.id === d.speaker || n.name === d.speaker);
    if (match) return match.id;
  }
  return 'player';
}

// Record a pending move-in offer so the external surfaces in RoomList's
// Offers screen. Idempotent per target — a second resident vouching for the
// same person updates the advocate rather than duplicating the row.
function recordMoveInOffer(gameState, npcId, advocatedBy) {
  const offers = gameState.world.moveInOffers || (gameState.world.moveInOffers = []);
  const existing = offers.find(o => o.npcId === npcId);
  if (existing) { existing.advocatedBy = advocatedBy; return existing; }
  const offer = {
    npcId,
    advocatedBy,                 // 'player' or a resident npcId — who vouched
    day: gameState.meta?.clock?.day ?? gameState.clock?.day ?? 1,
  };
  offers.push(offer);
  return offer;
}

// --- LLM Proposal validation and application ---
// LLM returns a proposal; NPC validates and applies via STATE adapter.
// LLM never writes to state directly.

function validateProposal(proposal, context) {
  const errors = [];
  if (!proposal || typeof proposal !== 'object') return { valid: false, errors: ['Proposal is not an object'] };

  // Validate dialogue entries. LLM output is untrusted input, not an
  // internal invariant — malformed shape here is an error to report and
  // fall back from (see callLLM), never an assert() throw. DEV is true in
  // the Perchance editor, so throwing here would take down every scene
  // whose model response doesn't parse cleanly.
  if (proposal.dialogue) {
    if (!Array.isArray(proposal.dialogue)) {
      errors.push('Proposal dialogue must be array');
    } else {
      const validSpeakers = [...context.activeNpcs.map(n => n.id), ...context.activeNpcs.map(n => n.name), 'player', 'You'];
      for (const entry of proposal.dialogue) {
        if (!entry.speaker || !entry.text) {
          errors.push('Dialogue entry missing speaker or text');
          continue;
        }
        if (!validSpeakers.includes(entry.speaker)) {
          errors.push(`Unknown speaker: ${entry.speaker}`);
        }
      }
    }
  }

  // Validate relationship deltas — only for active NPCs
  if (proposal.relationshipDeltas) {
    for (const [npcId, deltas] of Object.entries(proposal.relationshipDeltas)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Relationship delta for non-active NPC: ${npcId}`);
      }
      for (const axis of ['trust', 'affection', 'tension', 'respect', 'comfort', 'desire']) {  // NPC Overhaul: +comfort, +desire
        if (deltas[axis] !== undefined) {
          if (typeof deltas[axis] !== 'number' || Math.abs(deltas[axis]) > 0.3) {
            errors.push(`Relationship delta ${axis} for ${npcId} out of range (max ±0.3 per call): ${deltas[axis]}`);
          }
        }
      }
    }
  }

  // Validate mood deltas
  if (proposal.moodDeltas) {
    for (const [npcId, delta] of Object.entries(proposal.moodDeltas)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Mood delta for non-active NPC: ${npcId}`);
      }
      if (typeof delta !== 'number' || Math.abs(delta) > 0.2) {
        errors.push(`Mood delta for ${npcId} out of range (max ±0.2): ${delta}`);
      }
    }
  }

  // Validate memory additions
  if (proposal.memoryAdditions) {
    for (const [npcId, additions] of Object.entries(proposal.memoryAdditions)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Memory addition for non-active NPC: ${npcId}`);
      }
      if (additions.facts && !Array.isArray(additions.facts)) errors.push(`Memory facts for ${npcId} must be an array`);
      if (additions.episodes && !Array.isArray(additions.episodes)) errors.push(`Memory episodes for ${npcId} must be an array`);
      if (additions.grievances && !Array.isArray(additions.grievances)) errors.push(`Memory grievances for ${npcId} must be an array`); // NPC Overhaul
      if (additions.resolveGrievances && !Array.isArray(additions.resolveGrievances)) errors.push(`Memory resolveGrievances for ${npcId} must be an array`); // NPC Overhaul Phase 3.5
      if (additions.recentExchanges && !Array.isArray(additions.recentExchanges)) errors.push(`Memory recentExchanges for ${npcId} must be an array`); // NPC Overhaul Phase 4
    }
  }

  // NPC Overhaul — validate actions (physical actions in asterisks)
  if (proposal.actions) {
    if (!Array.isArray(proposal.actions)) {
      errors.push('Proposal actions must be array');
    } else {
      for (const a of proposal.actions) {
        if (typeof a !== 'string' || a.length > 120) {
          errors.push('Action must be a string (max 120 chars)');
          break;
        }
      }
    }
  }

  // NPC Overhaul — validate internal (brief thought, optional)
  if (proposal.internal !== undefined && proposal.internal !== null) {
    if (typeof proposal.internal !== 'string' || proposal.internal.length > 300) {
      errors.push('Internal must be a string (max 300 chars)');
    }
  }

  // NPC Overhaul — validate topic (optional, for style tracking)
  if (proposal.topic !== undefined && proposal.topic !== null) {
    if (typeof proposal.topic !== 'string' || proposal.topic.length > 60) {
      errors.push('Topic must be a string (max 60 chars)');
    }
  }

  // Move-in advocacy (external-world plan Phase 8): optional `advocateFor`
  // carrying the NAME (or id) of someone the speaker suggests should move
  // in. Untrusted input, so the shape is checked here; the name→NPC
  // resolution and the relationship gate happen in applyProposal where the
  // full gameState is in scope — a name nobody can resolve is dropped
  // there, not rejected here (the dialogue can still narrate the idea).
  if (proposal.advocateFor !== undefined && proposal.advocateFor !== null) {
    if (typeof proposal.advocateFor !== 'string' || proposal.advocateFor.trim().length === 0) {
      errors.push('advocateFor must be a non-empty name');
    } else if (proposal.advocateFor.length > 80) {
      errors.push('advocateFor name too long (max 80 chars)');
    }
  }

  // New, additive effect vocabulary (EFFECTS section) — validated
  // separately from the checks above so the existing rules stay
  // byte-identical. Effect rejections do NOT fail the whole proposal:
  // partial acceptance means one bad effect line costs only that line, not
  // the narration/dialogue/legacy deltas around it (see applyProposal).
  // The minimal `{ player: { money } }` shim below is enough for every
  // money-checking validator without threading the full game state through
  // this function's signature; context.roomObjects/carryItems (assembled
  // by assembleContext) are the real WORLD/ITEMS reach data.
  const activeIds = context.activeNpcs.map(n => n.id);
  const presentIds = [...activeIds, ...(context.ambientNpcs || []).map(n => n.id)];
  const effCtx = buildEffectContext({ player: { money: context.player.money } }, activeIds, presentIds, context.roomObjects, context.carryItems);
  const effResult = validateEffects(normalizeProposal(proposal).effects, effCtx, 'llm');
  recordEffectOutcome(effResult);

  return { valid: errors.length === 0, errors, effects: effResult };
}

// Apply a validated proposal to state via STATE adapter. Returns the NPC
// ids it touched (so UI can pull just those back from kv instead of a full
// reload) and the narration/dialogue as log entries — it does not write the
// session log itself. Time/clock cost is the caller's concern (advanced via
// SIM's resolveBatch before or after the LLM call), not this function's;
// clock advancement lived here previously but its return value was never
// read by any caller, so it never actually cost the player anything.
async function applyProposal(proposal, context, gameState, playerAction, opts = {}) {
  const events = [];
  const updatedNpcIds = new Set();
  const logEntries = [];
  // Correctness plan Phase 1 (D6): which conversation surface this proposal
  // came from, stamped onto every memory.recent entry written below.
  const channel = context.channel || 'scene';

  // Apply relationship deltas — in-memory on gameState (the same object
  // reference as UI's currentGameState), not via kv round-trip. The clock
  // loop fires checkpoints during the LLM call that mutate
  // gameState.npcs in-memory; a kv read-modify-write here would read
  // stale kv data (pre-checkpoint) and write it back over them.
  // Persistence happens at the next saveAtBoundary, same as the effects
  // path below. updatedNpcIds is still returned, but now only as "these
  // are the ids this proposal touched" (compaction reads it) — there is no
  // resync step for the caller to run any more.
  if (proposal.relationshipDeltas) {
    for (const [npcId, deltas] of Object.entries(proposal.relationshipDeltas)) {
      const npc = gameState.npcs[npcId];
      if (npc) gameState.npcs[npcId] = applyRelDelta(npc, deltas, gameState.meta.clock.day);
      updatedNpcIds.add(npcId);
      events.push({ type: 'relDelta', npcId, deltas });
    }
  }

  // Apply mood deltas — in-memory, same rationale as relationship deltas.
  if (proposal.moodDeltas) {
    for (const [npcId, delta] of Object.entries(proposal.moodDeltas)) {
      const npc = gameState.npcs[npcId];
      // NPC Overhaul Phase 7 — pass mood reason from proposal or derive from narration
      const moodReason = proposal.moodReasons?.[npcId] || (delta > 0 ? 'feeling better' : delta < 0 ? 'feeling worse' : '');
      if (npc) gameState.npcs[npcId] = applyMoodDelta(npc, delta, moodReason);
      updatedNpcIds.add(npcId);
      events.push({ type: 'moodDelta', npcId, delta });
    }
  }

  // Apply memory additions — in-memory, same rationale.
  if (proposal.memoryAdditions) {
    for (const [npcId, additions] of Object.entries(proposal.memoryAdditions)) {
      let updated = gameState.npcs[npcId];
      if (!updated) continue;
      if (additions.facts) {
        const writtenFacts = [];
        for (const fRaw of additions.facts) {
          const f = typeof fRaw === 'string' ? { text: fRaw } : fRaw;
          // D18 (Phase 2) — conversation-sourced facts are conversational-tier
          // unless declared, the exact mirror of the episode clamp below.
          // Phase 1 shipped this path defaulting to importance 1.0, which
          // pinned nearly every model-written fact (D3); the Phase 1 Handoff
          // flagged the pinned cohort's unbounded growth for this phase to
          // decide. A proposal is untrusted input — it must not be able to
          // mint a permanently unevictable belief by omission.
          const declared = typeof f.importance === 'number'
            ? Math.max(0, Math.min(MEMORY_IMPORTANCE.significant, f.importance))
            : MEMORY_IMPORTANCE.conversational;
          const record = backfillFactRecordV2({ ...f, importance: declared });
          writtenFacts.push(record);
          updated = addMemoryFact(updated, record);
        }
        // D18 — the overhearing leg: the same applyProposal call that wrote
        // the speaker's facts also writes what was said to the OTHER active
        // NPCs present. The same D6 bar decides what each listener retains
        // (chooser === listener: their own temperament and interests drive
        // whether they pay attention), and the write lands as provenance
        // 'overheard' with confidence × overheardAttenuation. Ambient NPCs
        // do not hear — activeNpcs is the whole room for this phase, and the
        // no-osmosis assertion guards the rest.
        const day = gameState.meta.clock.day;
        const minutes = gameState.meta.clock.minutes;
        // Overhear rolls draw from a state-derived rng so the same
        // conversation state reproduces the same outcome; `opts.overhearRng`
        // is the harness's injection point for deterministic assertions (the
        // default is the live behaviour — production callers never pass it).
        const overhearRng = opts.overhearRng || seededRng(gameState.seed, `overhear_${npcId}_${day}_${minutes}`);
        for (const listenerCtx of context.activeNpcs) {
          if (listenerCtx.id === npcId) continue;
          const listener = gameState.npcs[listenerCtx.id];
          if (!listener) continue;
          const overheard = pickFactsToRaise(
            listener, listener, TRANSMISSION.factsPerChat, day,
            overhearRng,
            writtenFacts,
          );
          for (const f of overheard) {
            gameState.npcs[listenerCtx.id] = receiveTransmittedFact(gameState.npcs[listenerCtx.id], f, { kind: 'overheard', provenance: 'overheard', day });
          }
        }
      }
      if (additions.episodes) {
        // Correctness plan Phase 3 (D8): an episode the model proposed during
        // a player-facing exchange is conversation-tier unless it declares
        // otherwise. Clamped — a proposal is untrusted input and must not be
        // able to mint a permanently unevictable memory.
        for (const e of additions.episodes) {
          const declared = typeof e.importance === 'number'
            ? Math.max(0, Math.min(MEMORY_IMPORTANCE.significant, e.importance))
            : MEMORY_IMPORTANCE.conversational;
          const text = e.text || e;
          updated = addMemoryEpisode(updated, gameState.meta.clock.day, text, declared, e.emotionalTag || '', e.participants || []);
          // D5 co-memory (roadmap inheritance): a shared episode is written
          // to every participant who is present and not the addressed NPC —
          // the same event lives in everyone who was there. Deduped by text
          // so a participant who already holds it isn't handed a duplicate.
          for (const p of e.participants || []) {
            const pCtx = context.activeNpcs.find(n => n.id === p || n.name === p);
            if (!pCtx || pCtx.id === npcId) continue;
            const pNpc = gameState.npcs[pCtx.id];
            if (!pNpc) continue;
            if ((pNpc.memory?.episodes || []).some(ep => ep.text === text)) continue;
            gameState.npcs[pCtx.id] = addMemoryEpisode(pNpc, gameState.meta.clock.day, text, declared, e.emotionalTag || '', e.participants || []);
          }
        }
      }
      if (additions.grievances) {                                      // NPC Overhaul
        for (const g of additions.grievances) {
          if (g.resolved) updated = resolveGrievance(updated, g.text);  // NPC Overhaul Phase 3.5 — LLM can resolve
          else updated = addGrievance(updated, g.text, g.severity || 0.3, gameState.meta.clock.day);
        }
      }
      if (additions.resolveGrievances) {                               // NPC Overhaul Phase 3.5 — explicit resolution list
        for (const text of additions.resolveGrievances) updated = resolveGrievance(updated, text);
      }
      // NPC Overhaul Phase 4 — wire recent exchanges (style counters moved
      // outside the memoryAdditions loop in Audit Fix so all active NPCs
      // get them, not just ones with memoryAdditions)
      if (additions.recentExchanges) {
        for (const ex of additions.recentExchanges) updated = addRecentExchange(updated, ex.speaker, ex.text, ex.type, gameState.meta.clock.day, gameState.meta.clock.minutes, channel, gameState.meta?.scene?.id ?? 0);
      }
      gameState.npcs[npcId] = updated;
      updatedNpcIds.add(npcId);
    }
  }

  // NPC Overhaul Audit Fix: update style counters for ALL active NPCs,
  // not just those with memoryAdditions. proposal.topic is per-exchange.
  if (proposal.topic) {
    for (const npcCtx of context.activeNpcs) {
      const npc = gameState.npcs[npcCtx.id];
      if (npc) gameState.npcs[npcCtx.id] = updateStyleCounters(npc, proposal.topic, isPersonalTopic(proposal.topic));
    }
  }

  // New effect vocabulary (EFFECTS section) — synchronous, in-memory
  // mutation of gameState (the same object reference as UI's
  // currentGameState), so no kv round-trip or resync is needed for ids
  // only touched here; the next saveAtBoundary flush (already an
  // unconditional per-NPC write loop) persists them. Effect-touched ids
  // are returned separately as effectNpcIds rather than folded into
  // updatedNpcIds — that set specifically means "needs a kv resync", which
  // these don't.
  let effectNpcIds = [];
  if (proposal.effects) {
    const activeIds = context.activeNpcs.map(n => n.id);
    const presentIds = [...activeIds, ...(context.ambientNpcs || []).map(n => n.id)];
    const roomObjects = (gameState.objects && gameState.objects[`room_${gameState.player.location}`]) || {};
    const effCtx = buildEffectContext(gameState, activeIds, presentIds, roomObjects, gameState.player.inventory || []);
    // This validateEffects call is the gate, not a duplicate of
    // validateProposal's. validateProposal only *reports* — it computes an
    // effResult for telemetry and rejection samples and returns it
    // alongside `errors`, but it never filters proposal.effects, and effect
    // rejections deliberately don't fail the proposal (see its comment). So
    // dropping this call didn't remove redundant work, it removed the only
    // thing standing between untrusted model output and applyEffects.
    //
    // The two calls also validate against different contexts and aren't
    // interchangeable: validateProposal builds a minimal `{player:{money}}`
    // shim, while effCtx here is backed by the real gameState and the
    // player's actual room objects — this is the stronger check of the two,
    // and the one whose reach set matches what applyEffects will touch.
    // validateEffects is pure (no telemetry side effect), so running it
    // here costs nothing beyond the traversal.
    const { valid } = validateEffects(normalizeProposal(proposal).effects, effCtx, 'llm');
    effectNpcIds = applyEffects(valid, effCtx).touchedNpcIds;
  }

  // Move-in advocacy (external-world plan Phase 8): a resident (or the
  // player) suggests someone move in, carried as the optional `advocateFor`
  // field (name or npcId). Resolve it to an external NPC and, when the bond
  // is real — the advocate is the player, or a resident with a strong
  // relationship to the target who is at least familiar with the player —
  // record a pending move-in offer; RoomList's Offers screen then surfaces
  // it for the player to act on. An unresolvable or unearned advocacy is
  // dropped silently: the suggestion may still exist as narration/dialogue,
  // it just never becomes an offer (and the acceptance gate in
  // acceptApplicant re-checks eligibility anyway).
  if (proposal.advocateFor) {
    const targetId = resolveAdvocateTargetId(gameState, proposal.advocateFor);
    if (targetId) {
      const speaker = resolveAdvocacySpeaker(proposal, context);
      let earned = speaker === 'player';
      if (!earned) {
        const sp = gameState.npcs[speaker];
        earned = !!sp && sp.residency.status === 'resident'
          && hasPlayerPhaseAtLeast(sp, MOVE_IN_TUNING.advocatePlayerPhaseMin)
          && hasStrongNpcRelationship(gameState, speaker, targetId);
      }
      if (earned) {
        const offer = recordMoveInOffer(gameState, targetId, speaker);
        const targetName = gameState.npcs[targetId]?.bible?.name || 'Someone';
        const speakerName = speaker === 'player' ? 'You' : (gameState.npcs[speaker]?.bible?.name || 'They');
        logEntries.push({ type: 'system', text: `${speakerName} vouched for ${targetName} moving in — an offer is waiting in RoomList.` });
        events.push({ type: 'moveInOffer', npcId: targetId, advocatedBy: speaker, offer });
      }
    }
  }

  // Narration/dialogue: handed back as data. UI's addLogEntry is the single
  // writer for the session log (both persists and renders it) — this
  // function must not write it directly, or the two paths drift.
  if (proposal.narration) logEntries.push({ type: 'narration', text: proposal.narration });
  if (proposal.actions) {                                             // NPC Overhaul
    for (const a of proposal.actions) logEntries.push({ type: 'action', text: a });
  }
  if (proposal.internal) {                                            // NPC Overhaul
    logEntries.push({ type: 'internal', text: proposal.internal });
  }
  if (proposal.dialogue) {
    for (const d of proposal.dialogue) {
      logEntries.push({ type: 'dialogue', speaker: d.speaker, text: d.text });
    }
  }

  // NPC Overhaul Audit Fix: auto-populate memory.recent from dialogue so
  // the conversation buffer fills without relying on the LLM to produce
  // recentExchanges in memoryAdditions (which it was never told to do).
  //
  // Correctness plan Phase 1 (D4) — ORDER IS LOAD-BEARING. The player's line
  // is recorded FIRST, then the NPC dialogue it provoked. These two blocks
  // used to run the other way round, and since both append to the same
  // buffer, every turn stored the answer above the question: the next prompt
  // read back `Hana: I'm fine, just tired. | player: Hey, how was your day?`.
  // The model was being shown its own reply as the thing it had to respond
  // to. Do not reorder these blocks. Both tag entries with the context's
  // channel (D6) so the scene and IM transcripts stay separable.
  const recentDay = gameState.meta.clock.day;
  const recentTick = gameState.meta.clock.minutes;
  // Plan X-5 Phase 1 — the Assessor's window (D2). Read straight off meta
  // rather than through SCENE's currentScene so this file keeps its "no
  // cross-section calls from the apply path" shape; the fallback is the same
  // synthetic scene 0 currentScene returns for a save written before Plan 2.
  const recentScene = gameState.meta?.scene?.id ?? 0;

  if (playerAction) {
    for (const npcCtx of context.activeNpcs) {
      const npc = gameState.npcs[npcCtx.id];
      if (npc) gameState.npcs[npcCtx.id] = addRecentExchange(npc, 'player', playerAction, 'player_input', recentDay, recentTick, channel, recentScene);
    }
  }

  if (proposal.dialogue) {
    for (const d of proposal.dialogue) {
      const npcMatch = context.activeNpcs.find(n => n.id === d.speaker || n.name === d.speaker);
      if (npcMatch) {
        const npc = gameState.npcs[npcMatch.id];
        if (npc) gameState.npcs[npcMatch.id] = addRecentExchange(npc, d.speaker, d.text, 'dialogue', recentDay, recentTick, channel, recentScene);
      }
    }
  }

  return { events, updatedNpcIds: [...updatedNpcIds], effectNpcIds, logEntries };
}

// NPC Overhaul — recursive nested-object validator for schema sub-objects
// like physical.hair, physical.eyes, etc. Applies defaults for missing
// fields, never errors on missing optional sub-fields (all new fields are
// additive — existing saves simply get defaults).
function validateNestedObject(prefix, obj, fields, errors, normalized) {
  for (const [key, spec] of Object.entries(fields)) {
    const v = obj[key];
    if (v === undefined || v === null) {
      obj[key] = spec.default;
      continue;
    }
    if (spec.type === 'object' && spec.fields) {
      if (typeof v !== 'object' || Array.isArray(v)) {
        obj[key] = spec.default;
        continue;
      }
      validateNestedObject(`${prefix}.${key}`, v, spec.fields, errors, normalized);
    }
    if (spec.type === 'array' && !Array.isArray(v)) {
      obj[key] = spec.default;
    }
    if (spec.type === 'string' && typeof v !== 'string') {
      obj[key] = spec.default;
    }
    if (spec.type === 'number' && typeof v === 'number' && spec.range && (v < spec.range[0] || v > spec.range[1])) {
      errors.push(`${prefix}.${key} out of range: ${v}`);
    }
  }
}

// NPC Overhaul Phase 1: Compose physical object into a descriptive paragraph
// for LLM prompts and image generation. Reads npc.bible.physical and
// composes a natural-language description. Falls back to bible.visual
// (legacy flat string) if physical is absent or empty.
function getPhysicalDescriptionForPrompt(npc) {
  const b = npc?.bible;
  const p = b?.physical;
  if (!p || !p.hair || !p.hair.color) {
    return b?.visual || 'a young adult';
  }

  const parts = [];

  // Phase 0: lead with age + gender for prompt and image consistency
  if (typeof b?.age === 'number') parts.push(`${b.age}-year-old`);
  if (b?.gender && b.gender !== 'female') parts.push(b.gender.replace('_', ' '));

  // Height + build
  if (p.heightBuild) parts.push(p.heightBuild);
  else if (p.height && p.build) parts.push(`${p.height} and ${p.build}`);

  // Hair
  const hairBits = [p.hair.length, p.hair.texture, p.hair.color, p.hair.style].filter(Boolean);
  if (hairBits.length > 0) parts.push(`with ${hairBits.join(' ')} hair`);

  // Eyes
  const eyeBits = [p.eyes.color, p.eyes.shape].filter(Boolean);
  if (eyeBits.length > 0) parts.push(`${eyeBits.join(' ')} eyes`);

  // Skin. Correctness plan Phase 5 wired `ethnicity` in — it was generated on
  // every NPC and read by nothing.
  const skinBits = [p.skin.tone, p.skin.texture].filter(Boolean);
  if (skinBits.length > 0) parts.push(`${skinBits.join(' ')} skin`);
  if (p.skin.ethnicity) parts.push(p.skin.ethnicity);

  // Face. Phase 5 wired in cheekbones/jawline/ears — all three were rolled
  // from their own pools at generation and never reached a prompt.
  const faceBits = [
    p.face.shape && `${p.face.shape} face`,
    p.face.nose && `a ${p.face.nose} nose`,
    p.face.lips && `${p.face.lips} lips`,
    p.face.cheekbones && `${p.face.cheekbones} cheekbones`,
    p.face.jawline && `a ${p.face.jawline} jawline`,
    p.face.ears && `${p.face.ears} ears`,
  ].filter(Boolean);
  if (faceBits.length > 0) parts.push(faceBits.join(', '));

  // Body. Phase 5 wired in buttSize/posture, same story.
  const bodyBits = [
    p.body.shape && `${p.body.shape} build`,
    p.body.chestSize && `${p.body.chestSize} chest`,
    p.body.buttSize && `${p.body.buttSize} hips`,
    p.body.legs && `${p.body.legs} legs`,
    p.body.posture && `${p.body.posture} posture`,
  ].filter(Boolean);
  if (bodyBits.length > 0) parts.push(bodyBits.join(', '));

  // Distinguishing features
  if (Array.isArray(p.distinguishingFeatures) && p.distinguishingFeatures.length > 0) {
    parts.push(p.distinguishingFeatures.join(', '));
  }

  // Piercings
  if (Array.isArray(p.piercings) && p.piercings.length > 0) {
    parts.push(p.piercings.map(pi => `a ${pi.type} on the ${pi.location}`).join(', '));
  }

  // Tattoos
  if (Array.isArray(p.tattoos) && p.tattoos.length > 0) {
    parts.push(p.tattoos.map(t => `a ${t.style} tattoo on the ${t.location}`).join(', '));
  }

  // Fashion. Phase 5 wired in `accessories` — the prose expansion has been
  // generating real content for it ("jewelry, watches, bags…") since the NPC
  // overhaul, and nothing has ever read it back out.
  if (p.fashion) parts.push(`typically wears ${p.fashion}`);
  if (p.accessories) parts.push(`accessorises with ${p.accessories}`);

  // Voice
  const voiceBits = [p.voice?.pitch, p.voice?.texture, p.voice?.accent && `${p.voice.accent} accent`].filter(Boolean);
  if (voiceBits.length > 0) parts.push(`speaks in a ${voiceBits.join(' ')} voice`);

  // Gait
  if (p.gait) parts.push(`moves with ${p.gait}`);

  // Scent
  if (p.scent) parts.push(`smells of ${p.scent}`);

  // Clothing state (appended if not normal)
  const clothing = npc?.clothing;
  if (clothing && clothing !== 'dressed') {
    if (clothing === 'sleepwear') parts.push('currently in sleepwear');
    else if (clothing === 'towel') parts.push('wrapped in a towel');
    else if (clothing === 'undressed') parts.push('currently undressed');
  }

  return parts.join('. ') + '.';
}

// --- Character validation ---
// Single gate: validateCharacter(obj) → { valid, errors, normalized }
// Every construction path returns through it.

function validateCharacter(obj) {
  const errors = [];
  const normalized = { bible: {}, mutable: {} };

  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'], normalized: null };

  const bible = obj.bible || obj;
  const schema = CHARACTER_SCHEMA.bible;

  // Validate bible fields
  for (const [field, spec] of Object.entries(schema)) {
    const val = bible[field];
    if (spec.required && (val === undefined || val === null || val === '')) {
      // Allow empty for prose fields that will be filled by LLM later
      if (field === 'name' || field === 'visual' || field === 'history' || field === 'sketch' || field === 'sampleLines') {
        normalized.bible[field] = spec.default;
        continue;
      }
      errors.push(`Missing required field: bible.${field}`);
      continue;
    }
    if (val === undefined || val === null) {
      normalized.bible[field] = spec.default;
      continue;
    }

    // Type check
    if (spec.type === 'string' && typeof val !== 'string') {
      errors.push(`bible.${field} must be string, got ${typeof val}`);
      continue;
    }
    if (spec.type === 'number' && typeof val !== 'number') {
      errors.push(`bible.${field} must be number, got ${typeof val}`);
      continue;
    }
    if (spec.type === 'array' && !Array.isArray(val)) {
      errors.push(`bible.${field} must be array`);
      continue;
    }
    if (spec.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
      errors.push(`bible.${field} must be object`);
      continue;
    }

    // Range check
    if (spec.range && typeof val === 'number') {
      if (val < spec.range[0] || val > spec.range[1]) {
        errors.push(`bible.${field} out of range [${spec.range[0]}, ${spec.range[1]}]: ${val}`);
        continue;
      }
    }

    // Max length
    if (spec.maxLength && typeof val === 'string' && val.length > spec.maxLength) {
      normalized.bible[field] = val.substring(0, spec.maxLength);
      continue;
    }

    // Enum check
    if (spec.enum && !spec.enum.includes(val)) {
      errors.push(`bible.${field} must be one of ${spec.enum.join(', ')}, got ${val}`);
      continue;
    }

    normalized.bible[field] = val;
  }

  // Validate temperament sub-fields
  if (normalized.bible.temperament && schema.temperament.fields) {
    for (const [axis, aspec] of Object.entries(schema.temperament.fields)) {
      const v = normalized.bible.temperament[axis];
      if (v === undefined || v === null) {
        normalized.bible.temperament[axis] = 0;
      } else if (typeof v === 'number' && (v < aspec.range[0] || v > aspec.range[1])) {
        errors.push(`temperament.${axis} out of range: ${v}`);
      }
    }
  }

  // NPC Overhaul — validate physical sub-fields (recursively for nested objects)
  if (normalized.bible.physical && schema.physical?.fields) {
    validateNestedObject('physical', normalized.bible.physical, schema.physical.fields, errors, normalized);
  }

  // NPC Overhaul — validate personality sub-fields
  if (normalized.bible.personality && schema.personality?.fields) {
    for (const [key, pspec] of Object.entries(schema.personality.fields)) {
      const v = normalized.bible.personality[key];
      if (v === undefined || v === null) {
        normalized.bible.personality[key] = pspec.default;
      } else if (pspec.type === 'array' && !Array.isArray(v)) {
        normalized.bible.personality[key] = pspec.default;
      } else if (pspec.type === 'string' && typeof v !== 'string') {
        normalized.bible.personality[key] = pspec.default;
      }
    }
  }

  // Validate mutable fields if present
  if (obj.bibleRevision !== undefined) normalized.mutable.bibleRevision = obj.bibleRevision;
  if (obj.bibleChanges !== undefined) normalized.mutable.bibleChanges = obj.bibleChanges;

  return { valid: errors.length === 0, errors, normalized: { bible: normalized.bible, bibleRevision: normalized.mutable.bibleRevision || 0, bibleChanges: normalized.mutable.bibleChanges || [] } };
}

// --- Memory summary compaction (piggyback on player-contact LLM calls) ---
// NPC Overhaul Phase 4.12 — updated trigger for tiered structure
function shouldCompactMemory(npc) {
  const episodes = npc.memory.episodes || [];
  const recent = npc.memory.recent || [];
  return episodes.length >= MEMORY_BUDGET.maxEpisodes ||
         (recent.length >= 10 && episodes.length > 5);
}

// ===== /SECTION: NPC =====
