// ===== SECTION: RUMINATION =====
// Knowledge-gossip-memory-plan Phase 3 (D7/D8/D9/D10). The deterministic half
// of rumination: D7's inference rules mint inferred facts from episode
// patterns, and the D9 open-question lifecycle creates, grows, ages and
// retires questions. Purely arithmetic over state — no DOM, no model, no
// async (R2) — so SIM's resolveTick runs it on a staggered per-NPC cadence
// and a harness can measure it. D8's LLM half does not exist in this file; it
// fires at Phase 4's D13 bridge, on the player's time budget, in a call that
// was going to happen anyway.
//
// Purity rule (the plan's invariant 2): `ruminate` and its helpers READ state
// and RETURN new records; writes happen through `addMemoryFact` only, and the
// caller (resolveTick) decides what to store. Nothing here ever reaches
// `root.generateText`.

// D9 — how interesting an NPC finds a fact: D4's category match against their
// OWN interests (factInterestRelevance), plus an openness bonus toward
// secondhand/novel facts — the things you can't verify are the things you
// chew on. Pure.
function factCuriosityAppeal(f, npc) {
  let appeal = factInterestRelevance(f, npc);
  const prov = (f && f.provenance) || '';
  if (prov === 'inferred' || prov.startsWith('told_by:') || prov === 'overheard') {
    appeal += Math.max(0, (npc?.bible?.temperament?.openness ?? 0)) * RUMINATION.opennessInterest;
  }
  return appeal;
}

// D9 — can this fact start an open question? Low confidence (the NPC can't
// verify it) × finds-it-interesting. A re-witnessed fact (confidence pushed
// back above the create threshold by D2's up-route) stops being a question.
function openQuestionEligible(f, npc) {
  if (!f || f.valid === false) return false;
  if ((f.confidence ?? 1) > RUMINATION.createThreshold) return false;
  return factCuriosityAppeal(f, npc) >= RUMINATION.createInterestFloor;
}

// D4 — do two facts share a category? Categories are free-form (the model
// writes them), so a match is equality or mutual inclusion, the same textual
// discipline factInterestRelevance uses for interest names. An uninformative
// category ('other' / empty) returns null, signalling "fall back to topic
// overlap". Pure.
function factCategoryOverlap(catA, catB) {
  const a = String(catA || '').toLowerCase().trim();
  const b = String(catB || '').toLowerCase().trim();
  if (!a || a === 'other' || !b || b === 'other') return null;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return false;
}

// D4 fallback — do two fact texts share a significant token? Used when a
// category is uninformative, so a topic match ("the new job" facts with
// 'other' categories) still links two NPCs who know about the same thing.
function textTokenOverlap(a, b) {
  const toks = (t) => new Set(String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const A = toks(a);
  const B = toks(b);
  for (const w of A) if (B.has(w)) return true;
  return false;
}

// D9 — who would this NPC ask about the fact? Other NPCs who hold a fact on
// the same category/topic (D4 matching), deterministically ordered by id and
// capped at RUMINATION.maxTargets. Pure — reads gameState, writes nothing.
// The caller's id is derived by identity (gameState.npcs keys are the ids;
// NPC records do not carry one on their own — cast NPCs have no `.id`).
// Phase 4: targets are stored as NAMES (resolveNpcName), matching the D9
// record sketch (`targets: ['allen']`) — the bridge line in buildNpcBlockV2
// is the first reader of `targets`, and the render site has no id→name
// resolver. The dedupe/ordering stays on ids; only the stored value is a
// name. Saves written before this change may hold id-shaped targets; the
// bridge filters those (`/^npc_/`) rather than rendering an internal id.
//
// Plan X-5 Phase 3: `selfId` may be passed in, and when it is, it wins. The
// identity derivation below only works while `npc` is still the object sitting
// in gameState.npcs — and by the time the lifecycle runs, it usually is not:
// ruminate hands each rule's OUTPUT to the next, so a pass that minted an
// inferred fact reaches here holding a rebuilt record, the `===` matches
// nothing, selfId comes back undefined, and the NPC is left in their own
// target list. The measured symptom was an open question on "Hana and the
// player spend time together" whose targets read ["Hana"] — someone to walk
// across the room and ask themselves. Unreachable before this phase because
// neither inference rule had ever fired (0 inferred facts, the plan's
// Evidence); reachable the moment the Chronicler started supplying
// participants and tags, which is why it is fixed here.
function findOpenQuestionTargets(fact, gameState, npc, selfIdHint) {
  const targets = [];
  const selfId = selfIdHint !== undefined
    ? selfIdHint
    : Object.keys(gameState?.npcs || {}).find(k => gameState.npcs[k] === npc);
  const ids = Object.keys(gameState?.npcs || {}).filter(id => id !== selfId).sort();
  for (const id of ids) {
    if (targets.length >= RUMINATION.maxTargets) break;
    const other = gameState.npcs[id];
    const holds = (other?.memory?.facts || []).some(of => {
      if (!of || of.valid === false) return false;
      const cat = factCategoryOverlap(fact.category, of.category);
      if (cat === true) return true;
      if (cat === null) return textTokenOverlap(fact.text, of.text);
      return false;
    });
    if (holds) targets.push(resolveNpcName(id, gameState));
  }
  return targets;
}

// Participants on an episode are npcIds or names as the model wrote them —
// resolve an id to the character's name for the rendered fact text.
//
// Plan X-5 Phase 3 (D26): the player is a participant on every episode the
// Chronicler extracts, and 'player' is a token, not a name — before this,
// co-occurrence minted the fact "Hana and player spend time together", which
// then went into a prompt verbatim. 'the player' is the register the rest of
// the NPC block already uses ("[Relationship with player]"). The bare literal
// matches npc.js's existing use of the same speaker token (validSpeakers,
// addRecentExchange) rather than reaching for x5.js's X5_PLAYER_PARTICIPANT:
// this file loads BEFORE x5.js, and a cross-file constant read from inside
// resolveTick is how a load-order slip becomes a ReferenceError that kills a
// whole harness silently.
function resolveNpcName(participant, gameState) {
  const npc = gameState?.npcs?.[participant];
  if (npc?.bible?.name) return npc.bible.name;
  if (participant === 'player') return 'the player';
  return String(participant);
}

// D7 rule 1 — co-occurrence: two or more shared episodes between the SAME
// participant pair within the inference window mint "X and Y spend time
// together" at inferredConfidence, category 'relationship'. Day-0 episodes
// (the seeded shared history) are deliberately excluded — that history is
// ambient, not evidence of an ongoing pattern (the plan's open question on
// day-0 transmission applies to inference the same way). Pairs are
// canonicalised by sorting, so ['carrie','allen'] and ['allen','carrie'] are
// the same pair. Deduplicated against the NPC's existing facts by exact text.
//
// Initiative plan Phase 2 (D24): EVERY PAIR on the episode counts, not only
// episodes with exactly two participants. The `!== 2` shortcut was written
// when the Chronicler was the only writer of `participants` and it always
// wrote [npc, 'player'] — correct then, and a silent skip the moment ambient
// episodes started carrying who was in the room. Three residents in the living
// room is the modal case in this flat, and under the old test it produced
// nothing at all. Pair count is bounded by the flat (three residents plus the
// player → six pairs), so a fact per pair is a bound, not a flood. Episodes
// with fewer than two participants are still skipped: one person is not a pair.
function applyCooccurrenceRule(npc, gameState, day) {
  // The key IS the canonical sorted pair, so nothing downstream needs the
  // episode it came from — the fact's text is derived from the two names.
  const counts = {};
  for (const ep of (npc.memory?.episodes || [])) {
    if (!ep || (ep.day ?? 0) <= 0) continue;
    if (day - (ep.day ?? 0) > RUMINATION.inferenceWindowDays) continue;
    const parts = [...new Set((ep.participants || []).map(p => String(p).trim()).filter(Boolean))].sort();
    if (parts.length < 2) continue;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const key = `${parts[i]}|${parts[j]}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  let out = npc;
  for (const key of Object.keys(counts)) {
    if (counts[key] < 2) continue;
    const parts = key.split('|');
    const text = `${resolveNpcName(parts[0], gameState)} and ${resolveNpcName(parts[1], gameState)} spend time together`;
    if ((out.memory?.facts || []).some(f => f.text === text)) continue;
    out = addMemoryFact(out, {
      text,
      day,
      importance: MEMORY_IMPORTANCE.conversational,
      category: 'relationship',
      provenance: 'inferred',
      confidence: RUMINATION.inferredConfidence,
      salience: BELIEF.salienceDefault,
      emotionalTag: 'warmth',
    });
  }
  return out;
}

// D7 rule 2 — repetition: two or more episodes sharing a non-empty
// emotionalTag within the window mint "This keeps happening — <topic>" at
// inferredConfidenceRepeat; the category is DERIVED from the shared tag (the
// theme), and the fact carries that tag too. The topic is rendered
// deterministically from the most recent tagged episode via factTopicPhrase
// (the same LLM-free renderer Phase 2 uses for scene lines).
//
// Initiative plan Phase 2 (D25): deduplicated by THEME, not by exact text.
// Exact-text dedupe was right while the Chronicler was the only writer of
// `emotionalTag` — tagged episodes were rare, so a second fact under the same
// tag really was a second observation. Once ambient episodes carry tags it is
// the wrong test in a way that only shows up over time: `latestByTag` moves to
// the newest tagged episode each day, so the SAME recurring theme mints a new
// permanent belief every time its exemplar changes. Measured over 7 days that
// was three separate "this keeps happening" facts about three different broken
// objects, all tagged `embarrassment`, and it grows without bound over a long
// game while the co-occurrence rule beside it is bounded by the flat's pair
// count. One theme is one belief; the exemplar is which episode happened to
// name it first.
function applyRepetitionRule(npc, day) {
  const counts = {};
  const latestByTag = {};
  for (const ep of (npc.memory?.episodes || [])) {
    if (!ep || (ep.day ?? 0) <= 0) continue;
    if (day - (ep.day ?? 0) > RUMINATION.inferenceWindowDays) continue;
    const tag = String(ep.emotionalTag || '').trim().toLowerCase();
    if (!tag) continue;
    counts[tag] = (counts[tag] || 0) + 1;
    const prev = latestByTag[tag];
    if (!prev || (ep.day ?? 0) > (prev.day ?? 0)) latestByTag[tag] = ep;
  }
  let out = npc;
  for (const tag of Object.keys(counts)) {
    if (counts[tag] < 2) continue;
    const ep = latestByTag[tag];
    const topic = factTopicPhrase(ep.text);
    const text = `${REPETITION_FACT_PREFIX}${topic}`;
    if ((out.memory?.facts || []).some(f => f
      && f.provenance === 'inferred'
      && f.emotionalTag === tag
      && typeof f.text === 'string'
      && f.text.startsWith(REPETITION_FACT_PREFIX))) continue;
    out = addMemoryFact(out, {
      text,
      day,
      importance: MEMORY_IMPORTANCE.conversational,
      category: tag,
      provenance: 'inferred',
      confidence: RUMINATION.inferredConfidenceRepeat,
      salience: BELIEF.salienceDefault,
      emotionalTag: tag,
    });
  }
  return out;
}

// D9 — the open-question lifecycle. This is the in-phase READER of
// `openQuestions` (R8): records are created, grown, aged and retired here;
// its purpose-reader — Phase 4's D13 bridge raising a question at
// raiseThreshold — is its declared consumer (the NOTE_TEMPLATES precedent).
//
// Each pass:
//  - create: eligible facts (openQuestionEligible) without an existing
//    question become records, best-appeal first, until openQuestionCap. The
//    record points at the held belief by its stable factId (D20 — this is the
//    first consumer that needs a specific fact reference), renders its topic
//    deterministically (factTopicPhrase), and computes targets from whoever
//    else holds a fact on the same category/topic (D4).
//  - grow: curiosity += emotionalWeight(fact) × max(0, openness) ×
//    curiosityPerRun — D10's second reader, scaled by the NPC's temperament.
//  - age: the record's age is refreshed from its creation day.
//  - retire: premise-dead (the fact was evicted, invalidated, or re-witnessed
//    past the create threshold — D2's up-route ends wondering) or too old
//    (age > expireAfterDays).
// Pure — returns a new npc, or the same npc when nothing changed.
function runOpenQuestionLifecycle(npc, gameState, day, selfIdHint) {
  const mem = npc.memory || {};
  const facts = mem.facts || [];
  // Snapshot BEFORE copying: the grow/age loop below mutates its working
  // copies, and a late stringify-comparison against those same objects would
  // always read as "unchanged" (the first implementation's bug — growth never
  // survived a pass). The snapshot is the pre-pass truth.
  const snapshot = JSON.stringify(mem.openQuestions || []);
  const questions = (mem.openQuestions || []).map(q => ({ ...q, targets: [...(q.targets || [])] }));
  const openness = Math.max(0, (npc.bible?.temperament?.openness ?? 0));

  // Grow / age / retire existing questions.
  const kept = [];
  for (const q of questions) {
    const f = facts.find(x => x.factId === q.factId);
    const premiseDead = !f
      || f.valid === false
      || (f.confidence ?? 1) > RUMINATION.createThreshold;
    if (premiseDead) continue;
    q.age = day - (q.born ?? day);
    if (q.age > RUMINATION.expireAfterDays) continue;
    q.curiosity = Math.min(RUMINATION.curiosityCap, q.curiosity + factEmotionalWeight(f) * openness * RUMINATION.curiosityPerRun);
    kept.push(q);
  }

  // Create new questions for eligible facts without one, best-appeal first,
  // bounded by the per-NPC cap.
  if (kept.length < RUMINATION.openQuestionCap) {
    const existingIds = new Set(kept.map(q => q.factId));
    const candidates = facts
      .filter(f => !existingIds.has(f.factId) && openQuestionEligible(f, npc))
      .sort((a, b) => factCuriosityAppeal(b, npc) - factCuriosityAppeal(a, npc) || ((a.factId ?? 0) - (b.factId ?? 0)));
    for (const f of candidates) {
      if (kept.length >= RUMINATION.openQuestionCap) break;
      kept.push({
        topic: factTopicPhrase(f.text),
        factId: f.factId,
        curiosity: RUMINATION.curiosityStart,
        age: 0,
        born: day,
        targets: findOpenQuestionTargets(f, gameState, npc, selfIdHint),
      });
    }
  }

  if (JSON.stringify(kept) === snapshot) return npc;
  return { ...npc, memory: { ...mem, openQuestions: kept } };
}

// D7/D8/D9 — one NPC's rumination pass. PURE: reads npc + gameState, writes
// nothing, returns a NEW npc or null (no-op). Called by SIM's resolveTick on
// a staggered cadence (RUMINATION.intervalTicks per NPC, offset by npcId
// hash). Synchronous and LLM-free (R2) — the plan's hard rule, asserted by
// the harness's generateText stub.
function ruminate(npc, gameState, day) {
  if (!npc || typeof npc !== 'object') return null;
  // Resolved HERE, while `npc` is still the record held in gameState.npcs.
  // Each rule below returns a rebuilt object, so by the time the lifecycle
  // runs there is nothing left to match by identity — see
  // findOpenQuestionTargets for what that cost before this line existed.
  const selfId = Object.keys(gameState?.npcs || {}).find(k => gameState.npcs[k] === npc);
  let updated = npc;
  updated = applyCooccurrenceRule(updated, gameState, day);
  updated = applyRepetitionRule(updated, day);
  updated = runOpenQuestionLifecycle(updated, gameState, day, selfId);
  return updated === npc ? null : updated;
}

// ===== /SECTION: RUMINATION =====
