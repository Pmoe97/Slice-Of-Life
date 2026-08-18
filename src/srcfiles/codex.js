// ===== SECTION: CODEX (Intimacy & Voyeurism Phase 15, D8) =====
// The per-character knowledge ledger's domain logic: the readers the codex
// UI (render.computer.js 'codex-*' renderers) draws from, and the three
// spendable verbs — Confront / Spread / Matchmake — that consume ledger
// entries (the `spent` flag). The ledger's WRITER is notePlayerLedgerEntry
// (actions.js: Phase 11's 'participated' half, Phase 14's infidelity pass)
// plus the 'witnessed' writes this phase adds at the peek flow (peek.js) and
// in-room event surfacing (ui.js's surfaceRoomEvidence).
//
// Everything here is DETERMINISTIC: same state in, same outcome out, no rng,
// no LLM. The willingness gate is READ (never relaxed — it modulates the
// confront reaction tier) and relationship state decides the reaction. A
// boundary act's narration comes from authored pools (D15: acts are decided
// by data, only narrated). None of the three verbs is an intimacy act — they
// move relPlayer axes, gossip facts and formation progress, never a consent
// gate, never an intimacy effect (invariant 1's converse: these doors go
// sideways, not in).

// --- Ledger writers --------------------------------------------------------
// The 'witnessed' half of the ledger — called by the peek flow and the
// in-room event surfacer when the player SEES an act (as opposed to the
// 'participated' writes notePlayerLedgerEntry makes directly). Same
// single-writer rule: only this wrapper and notePlayerLedgerEntry touch
// player.ledger. opts: { otherNpcId, outcome }.
function notePlayerWitnessedEntry(gameState, npcId, act, day, roomId, opts = {}) {
  notePlayerLedgerEntry(gameState, npcId, act, day, roomId, { ...opts, kind: 'witnessed' });
}

// --- Ledger readers --------------------------------------------------------
// The entries for one NPC, newest first (day desc, insertion order within a
// day). The UI renders these and passes the STORED index of the entry a verb
// spends — spendCodexEntry matches by that index, never by object identity.
function codexEntries(gameState, npcId) {
  const entries = gameState?.player?.ledger?.[npcId];
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => (b.day ?? 0) - (a.day ?? 0));
}

// The roster: every NPC the player holds at least one entry for, in ledger
// order (stable). The UI renders only NPCs that still exist in the world.
function codexKnownNpcIds(gameState) {
  return Object.keys(gameState?.player?.ledger || {});
}

// The STORED index of the most recent UNSPENT entry for an npc (the entry
// the next verb on the page consumes), or null when everything is spent.
function codexNextUnspentIndex(gameState, npcId) {
  const arr = gameState?.player?.ledger?.[npcId];
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] && !arr[i].spent) return i;
  }
  return null;
}

// Flip one entry's `spent` flag — the ONLY consumer of the flag. The entry
// stays in history (the plan's "spent entries flip spent and stay in
// history"); a second spend of the same entry is a no-op. Returns whether
// the spend happened.
function spendCodexEntry(gameState, npcId, index) {
  const arr = gameState?.player?.ledger?.[npcId];
  if (!Array.isArray(arr) || typeof index !== 'number') return false;
  const entry = arr[index];
  if (!entry || entry.spent) return false;
  gameState.player.ledger = {
    ...(gameState.player.ledger || {}),
    [npcId]: arr.map((e, i) => (i === index ? { ...e, spent: true } : e)),
  };
  return true;
}

// --- Vocabulary ------------------------------------------------------------
// The plan's ledger act vocabulary. A peek at a pair act lands 'saw_with_X'
// (otherNpcId set); a peek at a solo act lands 'peeked_masturbation'. The
// participated acts (sex/quickie/cuddle/shared_shower) come from Phase 11.
const CODEX_PAIRED_ACTS = ['sex', 'quickie', 'cuddle', 'shared_shower', 'saw_with_X'];
const CODEX_MASTURBATION_ACTIVITIES = ['masturbating', 'masturbating in bed'];

// Map a witnessed activity string to the ledger act. Returns null when
// nothing worth recording was seen (the peek view's gate keeps this aligned
// with what the player could actually perceive). PURE.
function codexActForActivity(activity) {
  const a = String(activity || '').toLowerCase();
  if (INTIMACY_ACTIVITIES.includes(a)) return { act: 'saw_with_X', paired: true };
  if (CODEX_MASTURBATION_ACTIVITIES.includes(a)) return { act: 'peeked_masturbation', paired: false };
  return null;
}

const CODEX_ACT_LABELS = {
  sex: 'slept together',
  quickie: 'had a quickie',
  cuddle: 'cuddled',
  shared_shower: 'shared a shower',
  // saw_with_X's label is deliberately just 'together' — the renderer appends
  // ' with <name>', so the full line reads "seen together with TstC" rather
  // than "seen together with someone with TstC".
  saw_with_X: 'together',
  peeked_masturbation: 'masturbating',
  // Intimacy & Voyeurism Phase 17 (D13/D14): the boundary acts. The
  // sleeping-room ledgerAct strings live in BOUNDARY_ACT_DEFS (boundary.js);
  // the three-way entries are the config name the ledger was written under
  // ('throuple' / 'cuck').
  boundary_sleep_with: 'climbed into bed with',
  boundary_watch_sleeper: 'watched while they slept',
  throuple: 'had a threesome with',
  cuck: 'had a threesome with',
};

// A human phrase for a ledger act — the codex's entry rows and the Confront
// verb's player line read it. PURE.
function codexActLabel(act) {
  return CODEX_ACT_LABELS[act] || 'an intimate encounter';
}

// The provenance badge: what KIND of knowledge an entry is.
function codexKindLabel(kind) {
  if (kind === 'witnessed') return 'seen';
  if (kind === 'told') return 'told';
  return 'involved';
}

// --- Confront --------------------------------------------------------------
// "I saw you with X." The player is direct with the NPC about what they know.
// Outcomes per dynamic tier (the plan's shame/tease/engage): stranger/cold →
// shame (tension spike, and for a cheating entry the news leaks to whoever is
// in earshot), familiar/close → tease (playful brush-off, reads as
// flirtation), intimate → engage (they own it, the charge is mutual). The
// willingness gate is an INPUT, not a door: a floored NPC shifts the tier
// DOWN (they don't want this conversation; a hostile or stranger reaction
// follows), a willing one shifts UP (they can own what happened).

// Which entries Confront can use: any unspent entry naming the page NPC
// directly. PURE.
function confrontEligible(entry) {
  return !!entry && !entry.spent;
}

// The reaction tier [0,3] from relationship dynamic (conversationPhase)
// modulated by willingness toward the player. PURE (reads, never writes).
function resolveConfrontTier(gameState, npcId, ctx) {
  const npc = gameState?.npcs?.[npcId];
  if (!npc) return 0;
  const phase = npc.relPlayer?.conversationPhase || 'early';
  const tier = Math.max(0, PHASE_ORDER.indexOf(phase));
  const gate = resolveWillingnessGate(gameState, npcId, 'player', CONFRONT.willingAct, ctx || {});
  if (gate.reason === 'floor') return Math.max(0, tier + CONFRONT.tierFloorShift);
  if (gate.allowed) return Math.min(3, tier + CONFRONT.tierWillingShift);
  return tier;
}

// Resolve a confrontation's outcome — deterministic from tier + the entry.
// Returns { key, tier, def, otherName, gossip }. PURE.
function resolveConfrontOutcome(gameState, npcId, entry, ctx) {
  const tier = resolveConfrontTier(gameState, npcId, ctx);
  const key = tier <= 0 ? 'shame' : tier <= 2 ? 'tease' : 'engage';
  const def = CONFRONT.outcomes[key];
  const other = entry.otherNpcId && gameState.npcs[entry.otherNpcId];
  return {
    key, tier, def,
    otherName: other ? (other.bible?.name || 'someone') : null,
    gossip: def.gossip === true && !!entry.otherNpcId,
  };
}

// The gossip fact a confrontation leaks (and Spread plants): the canonical
// infidelityCheatingFact when the page NPC holds a committed/seeing record
// with someone who is NOT the act's other — the SAME string Phase 14's
// writer uses, so transmission dedupe and maybeJealousUponFact recognize it.
// Otherwise a plain "caught together" romance fact. PURE.
function codexGossipFact(gameState, npcId, entry) {
  const npc = gameState.npcs[npcId];
  const otherId = entry.otherNpcId;
  if (!otherId || !npc) return null;
  const day = typeof entry.day === 'number' ? entry.day : (gameState.meta?.clock?.day ?? 1);
  const summary = relationshipSummaryForNpc(gameState, npcId);
  if (summary && summary.status !== 'single' && summary.partnerId !== otherId) {
    return infidelityCheatingFact(gameState, npcId, otherId, day);
  }
  const name = npc.bible?.name || 'Someone';
  const otherName = gameState.npcs[otherId]?.bible?.name || 'someone';
  return {
    text: `${name} and ${otherName} were caught together`,
    day,
    importance: MEMORY_IMPORTANCE.significant,
    category: 'romance',
    provenance: 'overheard',
    confidence: 1.0,
    salience: 1.0,
    emotionalTag: 'romance',
  };
}

// Inject a fact into the EXISTING transmission system: write it onto each
// hearer's memory via receiveTransmittedFact (the standard told_by/overheard
// receiver-write the npc_chat drive's factTransfers use), and when the hearer
// IS the wronged party of a cheating fact, land the jealousy immediately via
// maybeJealousUponFact (they just learned it to their face — the same hook
// the gossip path uses). Returns the ids that received the fact.
function injectCodexGossip(gameState, fact, receiverIds, opts = {}) {
  const out = [];
  for (const id of receiverIds || []) {
    const recv = gameState.npcs[id];
    if (!recv) continue;
    gameState.npcs[id] = receiveTransmittedFact(recv, fact, {
      kind: 'overheard',
      provenance: opts.provenance || 'overheard',
      sourceId: opts.sourceId || 'player',
      day: opts.day ?? (fact.day ?? null),
    });
    if (typeof maybeJealousUponFact === 'function') {
      const replaced = maybeJealousUponFact(gameState, id, fact);
      if (replaced) gameState.npcs[id] = replaced;
    }
    out.push(id);
  }
  return out;
}

// Apply a confrontation. MUTATES gameState (relPlayer/mood deltas on the
// confronted NPC, optional gossip writes, the entry's spent flag). Returns a
// plain summary the UI turns into narration:
//   { ok, outcome, tier, otherName, gossipIds, entry }
function applyConfrontNpc(gameState, npcId, entryIndex, ctx = {}) {
  const npc = gameState.npcs[npcId];
  const arr = gameState?.player?.ledger?.[npcId];
  const entry = Array.isArray(arr) ? arr[entryIndex] : null;
  if (!npc || !entry || entry.spent) return { ok: false };
  const outcome = resolveConfrontOutcome(gameState, npcId, entry, ctx);
  const def = outcome.def;
  const day = gameState.meta?.clock?.day ?? 1;

  let npcOut = npc;
  if (def.relDeltas) npcOut = applyRelDelta(npcOut, def.relDeltas, day);
  if (def.npcMood) npcOut = applyMoodDelta(npcOut, def.npcMood, 'confronted');
  // A shame outcome leaves the confronted NPC suspecting the player is a
  // snoop — the same boundary_violation subject the stealth systems write.
  if (def.suspicion) {
    const prev = (npcOut.suspicion && npcOut.suspicion.boundary_violation) || 0;
    npcOut = {
      ...npcOut,
      suspicion: { ...(npcOut.suspicion || {}), boundary_violation: clamp(prev + def.suspicion, 0, 1) },
    };
  }
  gameState.npcs[npcId] = npcOut;
  if (def.playerMood) {
    gameState.player = { ...gameState.player, mood: clampAxis((gameState.player.mood || 0) + def.playerMood) };
  }
  if (def.desireMark && typeof notePlayerDesireSource === 'function') {
    notePlayerDesireSource(gameState, def.desireMark);
  }

  const gossipIds = [];
  if (outcome.gossip) {
    const fact = codexGossipFact(gameState, npcId, entry);
    if (fact) {
      // Deterministic hearers: NPCs physically in the same room as the player
      // RIGHT NOW (D10 — same-room is knowable), minus the confronted NPC and
      // the act's other. Nobody present → nobody heard → no gossip yet.
      const loc = ctx.location || gameState.player?.location;
      const hearers = Object.keys(gameState.npcs).filter(id => {
        const n = gameState.npcs[id];
        return n && n.location === loc && id !== npcId && id !== entry.otherNpcId
          && n.residency?.status !== 'former';
      });
      if (hearers.length > 0) gossipIds.push(...injectCodexGossip(gameState, fact, hearers, { day }));
    }
  }

  spendCodexEntry(gameState, npcId, entryIndex);
  return { ok: true, outcome: outcome.key, tier: outcome.tier, otherName: outcome.otherName, gossipIds, entry };
}

// --- Spread ----------------------------------------------------------------
// The plan's "gossip injection — feeds the existing transmission". The player
// tells a chosen NPC a secret they know; the fact lands on that NPC's memory
// through receiveTransmittedFact and the ordinary npc_chat drive carries it
// onward ("spreads by next day" is the existing factTransfers path). A
// wronged-party receiver gets the jealousy immediately — they learned it to
// their face.

// Which entries Spread can carry: knowledge of a THIRD-PARTY involvement
// (entry.otherNpcId set). The player's own solo acts are theirs to keep;
// spreading those would be spreading yourself, not a secret. PURE.
function spreadEligible(entry) {
  return !!entry && !entry.spent && !!entry.otherNpcId;
}

// The fact Spread plants — same canonical builder the confrontation's gossip
// leg uses, so the transmission system can never hold two spellings of the
// same news. PURE.
function spreadFactForEntry(gameState, npcId, entry) {
  return codexGossipFact(gameState, npcId, entry);
}

// Apply a Spread to one receiver. The receiver HEARS the player say it
// first-hand (receiveTransmittedFact stores it as a witnessed-type record,
// confidence undiminished), and a wronged-party receiver gets the jealousy
// immediately via maybeJealousUponFact. MUTATES. Returns a plain summary.
function applySpreadSecret(gameState, npcId, entryIndex, receiverId) {
  const npc = gameState.npcs[npcId];
  const arr = gameState?.player?.ledger?.[npcId];
  const entry = Array.isArray(arr) ? arr[entryIndex] : null;
  const recv = receiverId ? gameState.npcs[receiverId] : null;
  if (!npc || !entry || entry.spent || !entry.otherNpcId || !recv) return { ok: false };
  const fact = spreadFactForEntry(gameState, npcId, entry);
  if (!fact) return { ok: false };
  const day = gameState.meta?.clock?.day ?? 1;
  gameState.npcs[receiverId] = receiveTransmittedFact(recv, fact, {
    kind: 'told',
    provenance: 'witnessed',
    sourceId: 'player',
    day,
  });
  if (typeof maybeJealousUponFact === 'function') {
    const replaced = maybeJealousUponFact(gameState, receiverId, fact);
    if (replaced) gameState.npcs[receiverId] = replaced;
  }
  spendCodexEntry(gameState, npcId, entryIndex);
  return { ok: true, fact, receiverId, receiverName: recv.bible?.name || 'them' };
}

// --- Matchmake -------------------------------------------------------------
// "You two would be good together." Requires knowledge (a ledger entry about
// BOTH people — you only set people up when you know them) + an existing
// relationship record (you only push an existing spark, never manufacture
// one). Injecting progress is exactly the Phase 12 formation pass's fuel, so
// a match ACCELERATES formation without bypassing it: the same thresholds,
// compatibility bar and cooldown still apply (tryAdvanceRelationshipStatus).

// Whether the player can matchmake `a` with `b` right now. PURE.
function matchmakeEligible(gameState, a, b) {
  if (!a || !b || a === b) return false;
  const na = gameState?.npcs?.[a];
  const nb = gameState?.npcs?.[b];
  if (!na || !nb) return false;
  if (na.residency?.status !== 'resident' || nb.residency?.status !== 'resident') return false;
  const ledger = gameState?.player?.ledger || {};
  if (!Array.isArray(ledger[a]) || ledger[a].length === 0) return false;
  if (!Array.isArray(ledger[b]) || ledger[b].length === 0) return false;
  const rec = getRelationship(gameState, a, b, false);
  if (!rec || rec.status === 'committed') return false;
  return true;
}

// The eligible match targets for the page NPC — every other resident who
// satisfies matchmakeEligible, each with its live compatibility temperature.
// PURE. The UI renders these as the picker rows.
function matchmakeCandidates(gameState, npcId) {
  const out = [];
  for (const [id, npc] of Object.entries(gameState?.npcs || {})) {
    if (id === npcId || npc.residency?.status !== 'resident') continue;
    if (!matchmakeEligible(gameState, npcId, id)) continue;
    out.push({ npcId: id, name: npc.bible?.name || id, compat: pairCompatibility(gameState, npcId, id) });
  }
  return out.sort((x, y) => y.compat - x.compat);
}

// Apply a Matchmake: inject progress into the pair's record, warm the castWeb
// pair both ways (pairCompatibility's live dynamic term reads the same axes,
// so the temperature rise is self-consistent), stamp a 'matched' history
// entry, and immediately re-check the pair's status transition (cooldown-
// respecting — the same single-pair core the daily pass uses). MUTATES.
// Returns { ok, compat, events, reason? }.
function applyMatchmakeNpc(gameState, a, b) {
  if (!matchmakeEligible(gameState, a, b)) return { ok: false, reason: 'ineligible' };
  const compat = pairCompatibility(gameState, a, b);
  if (compat < MATCHMAKE.minCompatibilityForMatch) return { ok: false, reason: 'incompatible', compat };
  const day = gameState.meta?.clock?.day ?? 1;
  const rec = getRelationship(gameState, a, b, false);
  rec.progress = clamp01((rec.progress || 0) + MATCHMAKE.progressBoost);
  gameState.world.castWeb = applyNpcToNpcDelta(gameState.world.castWeb || {}, a, b, MATCHMAKE.warmDeltas);
  gameState.world.castWeb = applyNpcToNpcDelta(gameState.world.castWeb || {}, b, a, MATCHMAKE.warmDeltas);
  addRelationshipHistory(gameState, a, b, 'matched', day);
  // The player's matchmaking reputation — both parties respect the matchmaker.
  for (const id of [a, b]) {
    gameState.npcs[id] = applyRelDelta(gameState.npcs[id], MATCHMAKE.playerRelDeltas, day);
  }
  const evt = tryAdvanceRelationshipStatus(gameState, a, b, rec, day);
  return { ok: true, compat, events: evt ? [evt] : [] };
}

// ===== /SECTION: CODEX =====
