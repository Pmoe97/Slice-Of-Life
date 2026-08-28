// ===== SECTION: X5 =====
// Plan X-5 — conversation consequences
// (src/ref/complete/plan-x5-conversation-consequences.md), Phase 1: "the wire",
// plus Phase 2's pure half (the D10 label bucketer, the proposal context both
// passes ingest through, and the D5 strip that stops the writer grading
// itself even when it volunteers).
//
// Everything this plan needs that is NOT a model call: reading a judge's
// reply, clamping what it said, deciding which exchanges each pass is looking
// at, and turning the result into the proposal shape applyProposal already
// ingests (D4). No second ingestion path — a second one would be a second set
// of bugs, and the axis allowlist, the applyRelDelta re-derivation of
// intimacyLevel/conversationPhase and the memory writers are all already
// tested where they live.
//
// PURITY RULE, and it is the phase boundary itself: nothing in this file is
// `async` and nothing here reaches `root.generateText`. Parsing, clamping,
// windowing and ingestion are arithmetic over strings and state. The two
// calls live in LLM (Phase 2/3) and are fired from UI on player-contact and
// rollover paths only (D6/D16). If this file grows an `await`, the boundary
// has been crossed and the testable surface has started shrinking again,
// which is the entire reason Phase 1 comes first.
//
// TWO CURSORS, ONE BUFFER. Both passes read the same per-NPC transcript
// (`memory.recent`) on different cadences — the Assessor over a SCENE (D2),
// the Chronicler over a DAY (D3) — so entries carry two independent flags,
// `assessed` and `processed`. One shared flag could not serve both: the
// windows close at different moments, and whichever pass ran first would
// blind the other to everything it had just consumed.

// The relationship axes a judge is allowed to move. This list is the
// allowlist, and it is deliberately the same six `applyRelDelta` writes and
// `validateProposal` range-checks — anything else a model invents is dropped
// here rather than travelling as a key nobody reads. verify-x1 asserts the
// equivalence behaviourally (every name here moves state, and a name not here
// moves nothing) rather than by comparing two hardcoded lists.
const X5_AXES = ['trust', 'affection', 'tension', 'respect', 'comfort', 'desire'];

// The participant string standing for the player on an extracted episode.
// Matches what applyProposal already writes as a `memory.recent` speaker and
// what validateProposal already accepts as a dialogue speaker, so rumination's
// co-occurrence rule sees one consistent identity for "the person they were
// talking to".
const X5_PLAYER_PARTICIPANT = 'player';

// --- The parse-recovery ladder ------------------------------------------
// callLLM's ladder, generalised: clean JSON.parse, then a brace-matched
// substring, then (per-parser) regex extraction. The differences from
// callLLM's are the cases a JUDGE produces that a WRITER does not — a
// markdown fence around the answer, and a sentence of reasoning before it.
// A judging prompt invites commentary in a way "write this character's next
// line" does not.
//
// Returns { obj, tier } or null. tier 1 = clean parse, 2 = brace-matched.
//
// Boxed-String coercion (bug report 2026-08-26): the ai-text-plugin resolves
// `await root.generateText(...)` with a boxed `new String(...)` object, not a
// primitive — `doOnFinishStuff` builds `finishData = new String(chunks.join(""))`
// and resolves with it. Every judge that fed that object straight to
// `JSON.parse` was silently rejected by a `typeof !== 'string'` guard, so the
// Assessor, Chronicler and Dreamweaver all failed to parse 100% of replies
// ("Assessor reply unparseable" every window) while callLLM kept working only
// because it calls `.trim()` first, which coerces. Coerce here, once, so every
// x5-parser and its tier-3 regexes see a primitive.
function x5CoerceString(v) {
  if (typeof v === 'string') return v;
  if (v instanceof String) return v.valueOf();
  if (v === null || v === undefined) return '';
  return String(v);
}

function x5ParseJsonObject(text) {
  text = x5CoerceString(text);
  let s = text.trim();
  if (!s) return null;
  // A fenced answer. `startWith: '{'` makes this rare, not impossible.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!s) return null;

  // Bug report (2026-08-26): the Assessor/Chronicler run on a small local
  // quantized model (transformers.js, wasm, q8 — see the dev console: this
  // is not the same model class the narrator's callLLM path targets), which
  // is far more prone to two specific JSON slips a bigger model rarely
  // makes: "smart" typographic quotes swapped in for straight ones, and a
  // trailing comma before a closing brace/bracket. Both are silent
  // JSON.parse killers that no amount of brace-matching below can repair —
  // normalize them here, unconditionally, since neither transform can turn
  // already-valid JSON invalid.
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/,(\s*[}\]])/g, '$1');

  // Candidate repairs, cheapest first. `startWith: '{'` means the leading
  // brace is usually present but occasionally swallowed, and stopSequences
  // are not used here, so the trailing one is the likelier casualty.
  const candidates = [];
  const push = (v) => { if (v && !candidates.includes(v)) candidates.push(v); };
  push(s);
  if (!s.startsWith('{')) push('{' + s);
  const first = s.indexOf('{');
  if (first > 0) push(s.slice(first));           // prose before the answer
  for (const c of [...candidates]) if (!c.endsWith('}')) push(c + '}');

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return { obj, tier: 1 };
    } catch (e) { /* next candidate */ }
  }
  // Truncated: take the first balanced object and discard the rest.
  for (const c of candidates) {
    let depth = 0, end = -1;
    for (let i = 0; i < c.length; i++) {
      if (c[i] === '{') depth++;
      else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end <= 0) continue;
    try {
      const obj = JSON.parse(c.slice(0, end + 1));
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return { obj, tier: 2 };
    } catch (e) { /* next candidate */ }
  }
  return null;
}

// D7 — the wire is integers. A fractional answer has its fraction DISCARDED
// rather than rounded, which is the safe direction and the one that makes the
// old scale harmless: a model still answering on the previous +-0.3 float
// scale contributes exactly nothing instead of a confidently wrong amount.
// Out of range clamps to +-X5.deltaClamp at both ends.
function x5ClampDeltaInt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const n = Math.trunc(v);
  return Math.max(-X5.deltaClamp, Math.min(X5.deltaClamp, n));
}

function x5ClampNumber(v, lo, hi, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

function x5CleanText(v, maxLen) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

// An emotionalTag is only worth carrying if something downstream weighs it.
// EMOTIONAL_WEIGHTS is that table (Plan 4 D10) and rumination's repetition
// rule groups on the tag string, so an invented tag would group real episodes
// under noise. Unknown tags therefore become '' — the episode still carries
// `participants` and still feeds the co-occurrence rule; it simply does not
// pretend to a theme it does not have. Phase 3's prompt is what makes the
// model supply a real one.
function x5NormalizeEmotionalTag(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t || t === 'default') return '';
  return Object.prototype.hasOwnProperty.call(EMOTIONAL_WEIGHTS, t) ? t : '';
}

// --- The Assessor's reply -----------------------------------------------
// { "npc_maya": { "trust": 2, "affection": 1, "tension": 0, ... } }
//
// Returns a map of npcId -> clamped integer axes, {} when the reply parsed
// but said nothing (the modal answer, D8), or null when nothing was
// recoverable. The distinction matters: {} is a judgement of "nothing
// changed" and null is a failed pass (D14). Both apply nothing; only one of
// them is a fault.
//
// `opts.soleNpcId` keys a flat axis object ({ "trust": 2 }) to the one NPC in
// the window — the shape a single-participant window invites, and cheap to
// recover when there is exactly one candidate.
function parseAssessorReply(text, opts = {}) {
  const parsed = x5ParseJsonObject(text);
  const raw = parsed ? parsed.obj : null;
  const out = {};

  if (raw) {
    // Flat: the model dropped the npc key entirely. Recoverable only when
    // there is exactly one candidate — an unattributable set of deltas in a
    // two-person window is a failed pass (null), not a judgement of zero.
    const looksFlat = X5_AXES.some(a => typeof raw[a] === 'number');
    if (looksFlat) {
      if (!opts.soleNpcId) return null;
      const axes = x5AxesFrom(raw);
      if (Object.keys(axes).length > 0) out[opts.soleNpcId] = axes;
      return out;
    }
    for (const [npcId, axesRaw] of Object.entries(raw)) {
      if (!npcId || !axesRaw || typeof axesRaw !== 'object' || Array.isArray(axesRaw)) continue;
      const axes = x5AxesFrom(axesRaw);
      if (Object.keys(axes).length > 0) out[npcId] = axes;
    }
    return out;
  }

  // Tier 3 — regex extraction over the raw text. A mangled reply can still
  // carry recoverable "npc_x": { ... "trust": 2 ... } runs, and the axis
  // grammar is flat enough to sweep for directly. An all-zero mangled reply
  // recovers as {}, which is correct: it parsed as far as "nothing changed".
  if (typeof text !== 'string') text = x5CoerceString(text); // boxed String from the plugin — see x5ParseJsonObject
  if (!text.trim()) return null;
  const blockRe = /"([A-Za-z0-9_]+)"\s*:\s*\{([^{}]*)\}/g;
  let m, recovered = false;
  while ((m = blockRe.exec(text)) !== null) {
    const npcId = m[1];
    if (X5_AXES.includes(npcId)) continue;   // an axis name is not an npc id
    const body = m[2];
    const axes = {};
    for (const axis of X5_AXES) {
      const hit = new RegExp(`"${axis}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(body);
      if (!hit) continue;
      recovered = true;                      // an axis was read, zero or not
      const n = x5ClampDeltaInt(parseFloat(hit[1]));
      if (n !== 0) axes[axis] = n;
    }
    if (Object.keys(axes).length > 0) out[npcId] = axes;
  }
  return recovered ? out : null;
}

// Axis allowlist + clamp, applied to one NPC's axis object. Unknown keys are
// dropped rather than applied; zeros are dropped because a zero delta and an
// absent one are the same thing to applyRelDelta, and dropping keeps the
// modal answer (D8) an empty object all the way down.
function x5AxesFrom(obj) {
  const axes = {};
  for (const axis of X5_AXES) {
    const n = x5ClampDeltaInt(obj[axis]);
    if (n !== 0) axes[axis] = n;
  }
  return axes;
}

// D7 — divide on ingestion, and D4 — hand applyProposal the shape it already
// takes. `allowedIds` is the roster the window was built from: a delta for
// anyone else is dropped HERE, because validateProposal treats an unknown
// npcId as an error and one error fails the whole proposal. Filtering after
// the fact would cost the deltas for everyone who WAS in the room.
//
// The clamp runs again on the way through. parseAssessorReply already
// clamped, but this function is also the entry point a stubbed pass and the
// Phase 4 instrument use directly, and a divisor applied to an unclamped
// integer is exactly the 10x error D7 exists to prevent.
function toProposalDeltas(parsed, allowedIds) {
  const out = {};
  if (!parsed || typeof parsed !== 'object') return out;
  const allow = Array.isArray(allowedIds) ? new Set(allowedIds) : null;
  for (const [npcId, axesRaw] of Object.entries(parsed)) {
    if (allow && !allow.has(npcId)) continue;
    if (!axesRaw || typeof axesRaw !== 'object') continue;
    const deltas = {};
    for (const axis of X5_AXES) {
      const n = x5ClampDeltaInt(axesRaw[axis]);
      if (n === 0) continue;
      deltas[axis] = n / X5.deltaDivisor;
    }
    if (Object.keys(deltas).length > 0) out[npcId] = deltas;
  }
  return out;
}

// --- The Chronicler's reply ---------------------------------------------
// { facts: [...], episodes: [...], grievances: [...], resolveGrievances: [...] }
//
// Returns a normalised fragment, or null when nothing was recoverable (D14).
// Everything that comes out of here already satisfies Plan 4's belief
// contract except `provenance` and `day`, which toProposalMemory sets because
// only ingestion may (D11) and only ingestion knows what day it is.
//
// Note what is NOT here: no retry, no partial-application bookkeeping, no
// second-guessing. A reply that survives this is applied; one that does not
// is a no-op and its window is marked judged anyway.
function parseChroniclerReply(text) {
  const parsed = x5ParseJsonObject(text);
  if (!parsed) return null;
  const raw = parsed.obj;

  const facts = [];
  for (const fRaw of (Array.isArray(raw.facts) ? raw.facts : [])) {
    if (facts.length >= X5.maxFactsPerWindow) break;
    const f = typeof fRaw === 'string' ? { text: fRaw } : fRaw;
    if (!f || typeof f !== 'object') continue;
    const factText = x5CleanText(f.text, X5.maxTextLen);
    if (!factText) continue;
    facts.push({
      text: factText,
      category: x5CleanText(f.category, X5.maxCategoryLen).toLowerCase() || 'other',
      // D11 — a claim, not a truth. Capped below certainty so no single
      // conversation can mint something the gossip layer will pass on as
      // established fact; defaulted to X5.factConfidenceDefault, which sits
      // at RUMINATION.createThreshold so an unverified claim is
      // open-question eligible the moment it lands.
      confidence: x5ClampNumber(f.confidence, 0.05, X5.factConfidenceMax, X5.factConfidenceDefault),
      // D12 — may declare that it matters, may never reach the bar that
      // makes it permanent (MEMORY_IMPORTANCE.significant grants `pinned`,
      // and pinned facts never evict).
      importance: x5ClampNumber(f.importance, 0, X5.factImportanceCeiling, MEMORY_IMPORTANCE.conversational),
      emotionalTag: x5NormalizeEmotionalTag(f.emotionalTag),
      valid: true,
    });
  }

  const episodes = [];
  for (const eRaw of (Array.isArray(raw.episodes) ? raw.episodes : [])) {
    if (episodes.length >= X5.maxEpisodesPerWindow) break;
    const e = typeof eRaw === 'string' ? { text: eRaw } : eRaw;
    if (!e || typeof e !== 'object') continue;
    const epText = x5CleanText(e.text, X5.maxTextLen);
    if (!epText) continue;
    const seen = [];
    for (const p of (Array.isArray(e.participants) ? e.participants : [])) {
      const id = x5CleanText(p, X5.maxCategoryLen);
      if (id && !seen.includes(id) && seen.length < X5.maxParticipants) seen.push(id);
    }
    episodes.push({
      text: epText,
      participants: seen,
      emotionalTag: x5NormalizeEmotionalTag(e.emotionalTag),
      importance: x5ClampNumber(e.importance, 0, X5.factImportanceCeiling, MEMORY_IMPORTANCE.conversational),
    });
  }

  const grievances = [];
  for (const gRaw of (Array.isArray(raw.grievances) ? raw.grievances : [])) {
    if (grievances.length >= X5.maxGrievancesPerWindow) break;
    const g = typeof gRaw === 'string' ? { text: gRaw } : gRaw;
    if (!g || typeof g !== 'object') continue;
    const gText = x5CleanText(g.text, X5.maxTextLen);
    if (!gText) continue;
    grievances.push({ text: gText, severity: x5ClampNumber(g.severity, 0, 1, 0.3) });
  }

  const resolveGrievances = [];
  for (const rRaw of (Array.isArray(raw.resolveGrievances) ? raw.resolveGrievances : [])) {
    if (resolveGrievances.length >= X5.maxGrievancesPerWindow) break;
    const t = x5CleanText(typeof rRaw === 'string' ? rRaw : rRaw?.text, X5.maxTextLen);
    if (t) resolveGrievances.push(t);
  }

  return { facts, episodes, grievances, resolveGrievances };
}

// Comparison key for "does this NPC already hold this?" — case and
// punctuation folded away, so "They grew up in Leeds." and "they grew up in
// leeds" are one belief rather than two.
function x5TextKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// D4/D11/D13 — the Chronicler's fragment as a `memoryAdditions` proposal,
// keyed to the NPC whose window it was.
//
// `provenance` is set HERE and nowhere else. An extractor that can name its
// own provenance can claim to have witnessed anything, and Plan 4's gossip
// layer will then propagate it — so whatever the model wrote is discarded and
// replaced with 'witnessed', which is the truthful answer: the NPC did
// witness the claim being made, whatever the claim's own truth value.
//
// `day` is set here too. Nothing downstream defaults it — backfillFactRecordV2
// leaves it undefined, and factSalienceNow then reads `f.day || 0` and ages
// the fact by the entire game, flooring its salience the moment it is written.
//
// D13 — every episode leaves here with `participants` and `emotionalTag`.
// The participants fallback is [npcId, player]: exactly two, because
// rumination's co-occurrence rule only counts pairs, and this pair is the
// literal truth of a conversation window. This is the cold-start fix; the
// ambient writer supplying neither field is what produced 1,080 episodes and
// 0 inferred facts.
//
// D25 — `opts.npc` is what the NPC already believes, and anything they
// already hold is dropped HERE. The Chronicler's prompt shows them that list
// so the extractor can spend its four slots on what is new; a model that
// echoes the list back regardless is filtered rather than trusted, which is
// D22's shape applied to knowledge. It matters because `addMemoryFact` does
// not dedupe: a re-recorded belief becomes a second record with its own
// factId, and the pair then out-votes everything else in retrieval while
// filling BELIEF.maxFacts twice as fast. Omit `npc` and nothing is filtered.
function toProposalMemory(parsed, npcId, opts = {}) {
  if (!parsed || !npcId) return {};
  const day = opts.day ?? 0;
  const fallbackParticipants = [npcId, X5_PLAYER_PARTICIPANT];

  const held = new Set();
  const seenEpisodes = new Set();
  for (const f of (opts.npc?.memory?.facts || [])) {
    const k = x5TextKey(f?.text);
    if (k) held.add(k);
  }
  for (const e of (opts.npc?.memory?.episodes || [])) {
    const k = x5TextKey(e?.text);
    if (k) seenEpisodes.add(k);
  }

  const facts = (parsed.facts || []).filter(f => !held.has(x5TextKey(f.text))).map(f => ({
    ...f,
    day,
    provenance: 'witnessed',
    salience: BELIEF.salienceDefault,
  }));

  const episodes = (parsed.episodes || []).filter(e => !seenEpisodes.has(x5TextKey(e.text))).map(e => ({
    ...e,
    participants: (e.participants && e.participants.length > 0)
      ? e.participants
      : [...fallbackParticipants],
    emotionalTag: e.emotionalTag || '',
  }));

  const additions = {};
  if (facts.length) additions.facts = facts;
  if (episodes.length) additions.episodes = episodes;
  if ((parsed.grievances || []).length) additions.grievances = parsed.grievances;
  if ((parsed.resolveGrievances || []).length) additions.resolveGrievances = parsed.resolveGrievances;
  if (Object.keys(additions).length === 0) return {};
  return { [npcId]: additions };
}

// --- Windows -------------------------------------------------------------

// An exchange is a PLAYER TURN and whatever it provoked, not a line. One turn
// writes a player line plus up to three dialogue lines into the same buffer,
// so counting entries would make X5.assessorMaxExchanges fire four times too
// early and read as "a long conversation" after two sentences.
function x5CountExchanges(entries) {
  let n = 0;
  for (const e of entries || []) {
    if (e && (e.type === 'player_input' || e.speaker === 'player' || e.speaker === 'You')) n++;
  }
  return n;
}

// D2 — what the Assessor is judging: every unassessed exchange carrying the
// window's scene id, per NPC who has one. Defaults to the OPEN scene, which
// is what the early-flush trigger wants; the scene-close trigger passes the
// id of the scene it is about to close, before openScene increments it.
//
// `full` is the early-flush condition: a scene that accumulates
// X5.assessorMaxExchanges without the player leaving is judged now and starts
// a fresh window, so a whole evening in one room is not scored as a single
// undifferentiated block at the end of it.
//
// Pure — reads gameState, writes nothing, returns plain data.
function assessorWindow(gameState, opts = {}) {
  const sceneId = opts.sceneId !== undefined && opts.sceneId !== null
    ? opts.sceneId
    : (gameState?.meta?.scene?.id ?? 0);
  const byNpc = {};
  const npcIds = [];
  let exchangeCount = 0;
  for (const [npcId, npc] of Object.entries(gameState?.npcs || {})) {
    const entries = (npc?.memory?.recent || [])
      .filter(e => e && !e.assessed && (e.sceneId ?? 0) === sceneId);
    if (entries.length === 0) continue;
    const count = x5CountExchanges(entries);
    npcIds.push(npcId);
    byNpc[npcId] = { entries, exchangeCount: count };
    if (count > exchangeCount) exchangeCount = count;
  }
  return {
    sceneId,
    npcIds,
    byNpc,
    exchangeCount,
    full: exchangeCount >= X5.assessorMaxExchanges,
  };
}

// D3 — what the Chronicler is judging: everything in this NPC's transcript it
// has not read yet, on either channel. Larger than the Assessor's window on
// purpose: facts extract more accurately from more context, and a wider
// window dedupes for free, since a thing raised three times in one
// conversation is one fact rather than three.
//
// The window is bounded from above by MEMORY_BUDGET.maxRecent — the buffer
// shifts its oldest entry out at 40, so an exchange can be evicted before
// this pass ever reads it. That is the accepted cost of not opening a second
// buffer (the plan's data model); X5.chroniclerMaxExchanges is set below that
// ceiling so the early flush actually fires before the loss starts.
function chroniclerWindow(npc) {
  const entries = (npc?.memory?.recent || []).filter(e => e && !e.processed);
  const exchangeCount = x5CountExchanges(entries);
  return {
    entries,
    exchangeCount,
    full: exchangeCount >= X5.chroniclerMaxExchanges,
  };
}

// --- Marking a window judged ---------------------------------------------
// Both marks run whether the pass succeeded or failed (D14): a window that
// produced nothing is still a window that has been looked at, and re-judging
// it later is how a relationship moves twice for one conversation.
//
// The two marks take different arguments because their windows are different
// shapes, not by oversight. The Chronicler's window is a prefix of the
// buffer, so a count is the natural cursor. The Assessor's is scene-scoped,
// so a scene id is — and marking `<=` deliberately sweeps up unassessed
// entries from OLDER scenes, which can only be exchanges whose own window
// closed without being judged. They will never be judged now; leaving them
// unflagged would let them ride along in some future scene's transcript.

// PURE — returns a new npc, or the same one when nothing changed.
function x5MarkExchanges(npc, flag, predicate) {
  const recent = npc?.memory?.recent;
  if (!Array.isArray(recent) || recent.length === 0) return npc;
  let changed = false;
  const out = recent.map((e, i) => {
    if (!e || e[flag] || !predicate(e, i)) return e;
    changed = true;
    return { ...e, [flag]: true };
  });
  if (!changed) return npc;
  return { ...npc, memory: { ...npc.memory, recent: out } };
}

// The Chronicler's cursor. `upTo` is how many of the oldest UNPROCESSED
// entries to mark; omitted means all of them, which is what a caller that
// judged `chroniclerWindow(npc).entries` wants.
function markProcessed(npc, upTo) {
  let left = (upTo === undefined || upTo === null) ? Infinity : Math.max(0, upTo);
  return x5MarkExchanges(npc, 'processed', () => {
    if (left <= 0) return false;
    left--;
    return true;
  });
}

// The Assessor's cursor.
function markAssessed(npc, sceneId) {
  const upTo = sceneId ?? 0;
  return x5MarkExchanges(npc, 'assessed', e => (e.sceneId ?? 0) <= upTo);
}

// --- The transcript both prompts render ----------------------------------
// One line per entry, oldest first, bounded. Deliberately NOT
// getRecentExchanges' pipe-joined single line: that shape exists to be cheap
// inside a much larger character block, and a judge reading an ARC across a
// window needs the turns visibly separated. Pure string work, so Phase 2 and
// Phase 3's prompt builders stay thin enough to be worth reading.
//
// A text message is marked as one. Both surfaces write into the same buffer
// (Plan 0's D6) and IM is a judged surface (D17), so a window can hold both —
// and "I miss you" typed at midnight is not the same act as "I miss you" said
// across a kitchen. Unmarked, the judge cannot tell them apart.
function formatWindowTranscript(entries, opts = {}) {
  const rows = (entries || []).filter(e => e && e.text);
  if (rows.length === 0) return '';
  const label = opts.npcName || null;
  return rows
    .slice(-(opts.maxLines || X5.transcriptMaxLines))
    .map(e => {
      // Bug report (2026-08-27): applyProposal now writes the writer's
      // narration/action/internal beats into memory.recent, so the judge's
      // transcript can contain them too. Render each type as it read when it
      // happened — the same mapping recallRow/promptRecentRow use — rather
      // than flattening a narration beat into "Elsa: <scene prose>" or an
      // action into a speaker line. The judge reads ARCS; stripping the
      // actions would hide exactly the reaction-beat repetition this judging
      // pass exists to grade.
      const type = e.type || (e.speaker === 'player' || e.speaker === 'You' ? 'player_input' : 'dialogue');
      if (type === 'action') return `*${cleanActionText(e.text)}*`;
      if (type === 'internal') return e.speaker ? `(${e.speaker} thinks: ${e.text})` : `(${e.text})`;
      if (type === 'narration') return e.text;
      const isPlayer = e.speaker === 'player' || e.speaker === 'You';
      const who = isPlayer ? 'Player' : (label || e.speaker);
      return `${who}${e.channel === 'im' ? ' (text)' : ''}: ${e.text}`;
    })
    .join('\n');
}

// --- D10: where the relationship currently sits, as words ----------------
// Bucketed from X5_AXIS_LABELS (CONFIG), which owns the bands. The Assessor
// is shown this and never the raw axis numbers: it answers on a
// +-X5.deltaClamp integer scale, and a prompt that also displays a -1..1 (or
// a 0..100) scale is a prompt that invites an answer on the wrong one.
//
// Out-of-band and missing values both resolve to a real label rather than
// undefined — a save with a legacy axis absent must still render a sentence.
function x5AxisLabel(axis, value) {
  const band = X5_AXIS_LABELS[axis];
  if (!band) return '';
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  let i = 0;
  while (i < band.cuts.length && v >= band.cuts[i]) i++;
  return band.labels[i];
}

// The whole relationship as one prose line, in X5_AXES order so the six axes
// always read in the same sequence the answer format lists them.
function x5RelationshipLabels(rel) {
  const r = rel || {};
  return X5_AXES.map(a => `${a}: ${x5AxisLabel(a, r[a])}`).join(', ');
}

// --- The context both passes hand to validateProposal / applyProposal ----
// D4 — no second ingestion path. Those two functions take the context
// assembleContext builds for a live scene, but a judged window is judged
// AFTER the moment it describes: the player has usually walked out of the
// room, so there is no live scene to assemble and the NPCs are no longer
// "active" in any sceneState sense. This is the minimum shape both functions
// actually read — the roster they range-check ids against, and the money shim
// validateProposal builds its effect context from.
//
// No roomObjects and no carryItems: a judging pass emits deltas and memory,
// never effects, so an empty reach set is the truthful one. Anything a judge
// smuggled in as an effect would be rejected against it, which is correct.
function x5ProposalContext(gameState, npcIds) {
  const ids = (npcIds || []).filter(id => gameState?.npcs?.[id]);
  return {
    channel: 'scene',
    activeNpcs: ids.map(id => ({ id, name: gameState.npcs[id]?.bible?.name || id })),
    ambientNpcs: [],
    player: { money: gameState?.player?.money ?? 0 },
    roomObjects: {},
    carryItems: [],
  };
}

// --- D5: the writer does not grade itself -------------------------------
// The writing prompt no longer asks for relationshipDeltas, but a model that
// has seen ten thousand JSON contracts will volunteer them anyway, and
// applyProposal would apply them — silently restoring the exact
// actor-grades-their-own-performance loop this plan exists to break, in the
// one case nobody would think to test.
//
// So the removal is enforced on the way in, not requested in the prompt.
// Returns a copy; the original is left alone so a caller can still log what
// the model tried to claim.
//
// Phase 3 added `memoryAdditions` alongside it, in the same session the
// Chronicler shipped — D5's "the removal lands in the same phase as its
// replacement". Between Phase 2 and Phase 3 the writer went on writing memory
// because taking it away earlier would have left the game with no knowledge
// extraction at all.
//
// The writer loses nothing it was actually using. `memoryAdditions.facts` was
// its only route into the belief tier, and the Chronicler is that route now;
// `recentExchanges` inside it has been dead since the NPC Overhaul audit fix
// (applyProposal fills `memory.recent` from the dialogue itself, and the
// prompt was never told to produce the field).
const X5_WRITER_STRIPPED = ['relationshipDeltas', 'memoryAdditions'];

function stripWriterJudgement(proposal) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  if (!X5_WRITER_STRIPPED.some(k => proposal[k] !== undefined)) return proposal;
  const out = { ...proposal };
  for (const k of X5_WRITER_STRIPPED) delete out[k];
  return out;
}

// ===== /SECTION: X5 =====
