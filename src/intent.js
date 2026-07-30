// ===== SECTION: INTENT =====
// Free-text intent classification (P5). The free-text box (UI's
// handleFreeText/doPlayerAction) used to route every input straight to the
// LLM, even for things the game already knows how to do deterministically
// ("eat", "sleep", "go to the kitchen"). classifyIntent tries to match the
// text against what's already available/registered before falling back to
// the LLM narrative path — it never REPLACES that path, it just short-
// circuits the common, unambiguous cases so they're instant and free.
//
// Deliberately no fuzzy/LLM-based matching here: this has to stay in the
// same zero-latency, zero-cost tier as the rest of the deterministic action
// system. Matching is plain substring-on-normalized-text, longest-phrase-
// wins — good enough for "eat"/"grab a bite" and cheap to reason about.
//
// Scope of this pass: matches ACTION_DEFS' already-registered verbs
// (eat/cook/shower/watch_tv/relax), room movement, and two of the
// hand-written UI.js verbs (sleep, pay-rent) that are already deterministic
// single-purpose functions and don't need to go through ACTION_DEFS to be
// free-text-reachable. talk/work/ask-to-leave stay LLM/chip-only — see
// ACTIONS' file header for why those verbs aren't in ACTION_DEFS yet, and
// HANDOFF/ARCHITECTURE for why this pass doesn't force them in either.

function normalizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeIntentRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest whole-phrase match wins, so a more specific synonym ("grab a
// bite") beats a shorter generic one ("eat") when both happen to appear.
function matchVerbPhrase(norm, phrases) {
  let best = null;
  for (const raw of phrases || []) {
    const phrase = normalizeIntentText(raw);
    if (!phrase) continue;
    const re = new RegExp(`\\b${escapeIntentRegExp(phrase)}\\b`);
    if (re.test(norm) && (!best || phrase.length > best.length)) best = phrase;
  }
  return best;
}

// Room name, or (for a resident's bedroom) their name adjacent to
// "room"/"bedroom" — "go to marcus's room" and "marcus room" both resolve
// without needing exact room-id vocabulary from the player.
function matchRoomIntent(norm, gameState) {
  for (const roomId of ALL_ROOMS) {
    if (roomId === gameState.player.location) continue;
    const room = ROOMS[roomId];
    if (!room) continue;
    const roomName = normalizeIntentText(room.name);
    if (roomName && norm.includes(roomName)) return roomId;
    if (room.type === 'bedroom') {
      const ownerId = roomOwnerId(roomId, gameState.npcs);
      if (!ownerId || ownerId === 'player') continue;
      const npcName = normalizeIntentText(gameState.npcs[ownerId]?.bible?.name || '');
      if (npcName && norm.includes(npcName) && /\b(room|bedroom)\b/.test(norm)) return roomId;
    }
  }
  return null;
}

// Structural glue, not a tunable number — these are the fixed set of
// hand-written UI.js verbs this pass makes free-text-reachable. Not
// config.js material any more than ACTION_DEFS' own `verbs` arrays are.
const QUICK_INTENTS = {
  sleep: { verbs: ['sleep', 'go to sleep', 'go to bed', 'take a nap'] },
  'pay-rent': { verbs: ['pay rent', 'pay the rent'] },
};

function classifyIntent(text, gameState) {
  if (!gameState) return null;
  const norm = normalizeIntentText(text);
  if (!norm) return null;

  // 1. Registered actions available right now (ACTION_DEFS, via ACTIONS'
  // own availability/requirement checks — never re-implemented here).
  let bestMatch = null;
  for (const entry of resolveAvailableActions(gameState)) {
    if (!entry.ok) continue;
    const def = ACTION_DEFS[entry.actionId];
    if (!def) continue;
    const phrase = matchVerbPhrase(norm, [...(def.verbs || []), def.label]);
    if (!phrase) continue;
    const better = !bestMatch
      || phrase.length > bestMatch.phrase.length
      || (phrase.length === bestMatch.phrase.length && (entry.chipPriority || 0) > bestMatch.chipPriority);
    if (better) bestMatch = { actionId: entry.actionId, phrase, chipPriority: entry.chipPriority || 0 };
  }
  if (bestMatch) return { kind: 'registered', actionId: bestMatch.actionId };

  // 2. Movement.
  const roomId = matchRoomIntent(norm, gameState);
  if (roomId) return { kind: 'move', roomId };

  // 3. Quick verbs.
  for (const [quickId, spec] of Object.entries(QUICK_INTENTS)) {
    if (matchVerbPhrase(norm, spec.verbs)) return { kind: 'quick', quickId };
  }

  return null;
}
