// ===== SECTION: OVERTURE =====
// NPC initiative — the acts an NPC directs at a PERSON
// (src/ref/complete/npc-initiative-plan.md, Phases 3 and 4).
//
// FOUR CHANNELS (D8), and they are four rows of OVERTURE_DEFS rather than four
// code paths: approach (Phase 3), text, propose and knock (Phase 4). The
// scorer, the motive readers, the record and the four named writers below are
// shared by all of them. What a channel owns is its candidacy (`proximity`,
// `requires`) and its surface (`sendsText`, `emitsSignal`, `respond`) — see the
// field-by-field note above OVERTURE_DEFS in config.js.
//
// Every language beat in this game except two adult-content interruptions is
// initiated by the player. This file is where an NPC crosses the room because
// they want something. `overture` is the word, because `commitment` is
// commitments.js, `npc.commitment` is Plan 3's held activity (now the
// continuous-behavior-engine's commitment substrate) and `intent` is the
// player's classifier (D2).
//
// WHAT IS HERE AND WHAT IS NOT. Selection is not here. An overture is ranked by
// COGNITION's `scoreCandidates` in the same list as every drive and picked by
// the same `choosePursuit` (D1) — there is exactly one ranked list per npc-tick
// and exactly one winner, which is what makes "one committed intent per NPC"
// (design invariant 2) a property of the loop rather than a rule. What IS here:
//
//   scoreOvertures / overtureAllowed / motive readers — PURE. They read state
//     and return numbers and reasons. None of them writes.
//   openOverture / resolveOverture / lapseOverture / ageOverture — the named
//     writers (D19). `npc.overture` is built or deleted in this file and
//     nowhere else, and verify-i3 source-scans that it stays that way.
//
// This is the SCENE composeScene/openScene split and Plan 3's own
// scorer/writer split, for the third time; it is deliberately not a fourth
// shape.
//
// Nothing here is async or reaches the model (R2 / D18). The DECISION to make
// an overture is in-tick arithmetic; the LINE is generated at the moment it
// surfaces, on the player's time budget, through the conversation the player
// opens. verify-i3 stubs `generateText` to explode and runs a week of ticks.

// Local clamp, for the same reason cognition.js has one: npc.js's clamp01
// loads after this file, and a second global of the same name is the kind of
// thing that works until it doesn't.
function ovClamp01(v) { return Math.max(0, Math.min(1, v)); }

// --- D9: the do-not-disturb set -------------------------------------------
// Firing only when the player is idle means NPCs never open at the moments
// that carry weight; firing always is harassment at any meaningful rate. So
// the gate is a SET of states the player is in, and the def names which ones
// apply to it.
//
// Every source is resolved through this registry and an unknown key FAILS
// CLOSED — a `doNotDisturb` entry nobody can evaluate blocks the overture
// rather than passing vacuously. Same direction as D23's `when` clauses, for
// the same reason: a silent never-fires is findable, a silent always-fires is
// a layer nobody authored going off in the player's face.
//
// The first three read SIM's getPlayerVulnerableState — the same derived
// answer the peep and interruption systems use, so "is the player in the
// middle of something" means one thing across the game.
const OVERTURE_DND_SOURCES = {
  sleeping:        (gs) => getPlayerVulnerableState(gs) === 'sleeping',
  showering:       (gs) => getPlayerVulnerableState(gs) === 'showering',
  masturbating:    (gs) => getPlayerVulnerableState(gs) === 'masturbating',
  // UI's doTalk sets this for the life of the conversation overlay and
  // closeConversationOverlay clears it. It has to be on gameState rather than
  // in TIME's context stack, because the stack is module state the tick cannot
  // see — and this decision is made inside the tick.
  in_conversation: (gs) => !!(gs.player && gs.player.flags && gs.player.flags._inConversation),
  // A locked door is the player saying so in the game's own vocabulary. Same
  // WORLD helper the interruption roll consults.
  locked_door:     (gs) => getDoorState(gs, gs.player && gs.player.location) === 'locked',
};

// --- D29: where the NPC has to be standing --------------------------------
// Phase 3 asked this with a `requiresAdjacent` boolean, which was enough for
// one channel and is not enough for four: an approach needs to be able to
// reach you, a knock needs to be on the OTHER side of a door from you, and a
// text needs neither — it reaches a player who is not in the flat at all,
// which is the one thing the in-person channels can never do.
//
// So it is a named predicate from a registry, like the do-not-disturb set
// above and D23's `when` sources, and it fails closed for the same reason: a
// channel whose proximity nobody can evaluate should never fire, and a silent
// never-fires is findable in a way a silent always-fires is not.
//
// `needsPlayerRoom` is part of the same answer rather than a second field.
// "Where does the NPC have to be relative to the player" and "does the player
// have to be anywhere at all" are one question, and splitting them is how a
// remote channel ends up blocked by a presence check nobody remembered.
const OVERTURE_PROXIMITY = {
  // Same room, or one step. isRoomAdjacent is true for the same room too, so
  // one predicate covers both and the walk is one tick (D26).
  adjacent: { needsPlayerRoom: true, test: (npcRoom, playerRoom) => isRoomAdjacent(npcRoom, playerRoom) },
  // One step away and NOT already inside: you cannot knock on a door you are
  // standing behind.
  outside:  { needsPlayerRoom: true, test: (npcRoom, playerRoom) => npcRoom !== playerRoom && isRoomAdjacent(npcRoom, playerRoom) },
  // A phone does not care where either of you is.
  remote:   { needsPlayerRoom: false, test: () => true },
};

// Returns { allowed, reason } — the reason is the DND key that blocked it, the
// `requires` key that was not met, or 'player_away' / 'unknown_source' /
// 'unknown_proximity'. Pure. Phase 6's instrument counts these, which is the
// point of returning a reason rather than a boolean: "how often did the gate
// suppress one, and which entry did it" is a tuning question.
//
// Two lists, one registry. `doNotDisturb` names states that must be FALSE and
// `requires` names states that must be TRUE — a knock exists BECAUSE the door
// is shut, so the entry that blocks an approach is the entry that enables it,
// and reading both off the same table is what stops the two from acquiring
// different ideas of what a closed door is.
function overtureAllowed(gameState, overtureId) {
  const def = OVERTURE_DEFS[overtureId];
  if (!def) return { allowed: false, reason: 'no_def' };
  const prox = OVERTURE_PROXIMITY[def.proximity];
  if (!prox) return { allowed: false, reason: 'unknown_proximity' };
  // Nobody can open anything at a player who is not in the flat — unless the
  // channel does not need them to be (a text).
  if (prox.needsPlayerRoom && !(gameState && gameState.player && gameState.player.location)) {
    return { allowed: false, reason: 'player_away' };
  }
  if (!gameState || !gameState.player) return { allowed: false, reason: 'player_away' };
  for (const key of def.doNotDisturb || []) {
    const read = OVERTURE_DND_SOURCES[key];
    if (!read) return { allowed: false, reason: 'unknown_source' };
    if (read(gameState)) return { allowed: false, reason: key };
  }
  for (const key of def.requires || []) {
    const read = OVERTURE_DND_SOURCES[key];
    if (!read) return { allowed: false, reason: 'unknown_source' };
    if (!read(gameState)) return { allowed: false, reason: `not_${key}` };
  }
  return { allowed: true, reason: null };
}

// --- Per-def candidacy (vocation-and-lifestyle plan D18) -------------------
// The overture equivalent of COGNITION's DRIVE_CANDIDACY, and added for the
// same reason that table exists: a channel whose conditions live nowhere the
// scorer can see them is a channel that scores, wins the tick, and opens a
// record the player should never have been offered.
//
// Every gate the four original channels needed was expressible in the existing
// registries — proximity, do-not-disturb, motives, cooldown. The collab ask is
// the first entry that needs to ask something about the NPC THEMSELF (what
// they do for a living, and how close you actually are), so it gets a named
// predicate rather than a special case inside scoreOvertures.
//
// Absent means "no extra conditions", so the four original channels are
// untouched. Pure: reads state, returns a boolean, writes nothing.
const OVERTURE_CANDIDACY = {
  // D18. Someone whose work is filmed asks you to help with it. Three
  // conditions, and the relationship ones are the point:
  //
  //   - it is their actual job (contentWork), not a whim;
  //   - real affection, well above the threshold the other channels use. This
  //     beat is worth something BECAUSE it is a person asking you specifically,
  //     and it is worth nothing — worse than nothing — if it fires at
  //     acquaintance. CONTENT_WORK_TUNING.collabAskAffection is set high on
  //     purpose and is the dial if it ever feels too eager;
  //   - and low tension. Fondness is not the same as comfort, and someone who
  //     is fond of you but currently at odds with you does not ask this.
  collab_ask: (npc, npcId, gameState) => {
    if (!npc?.bible?.occupation?.contentWork) return false;
    const rel = npc.relPlayer || {};
    if ((rel.affection || 0) < CONTENT_WORK_TUNING.collabAskAffection) return false;
    if ((rel.tension || 0) > CONTENT_WORK_TUNING.collabAskMaxTension) return false;
    return true;
  },
};

// --- D10, the other half: the NPC learns to stop asking --------------------
// A refusal moves the relationship AND is remembered, and both halves have to
// self-limit or a long game turns a few brush-offs into a permanent grudge.
// This is the limiter, and it is deliberately ONE function with TWO readers:
// UI's refusal path scales the relationship delta by it, and the motive
// strengths below scale by it too. So the second refusal costs half what the
// first did AND the third overture is half as motivated as the second — the
// NPC learns to stop asking rather than learning to hate you, and the two
// cannot drift apart into different curves.
//
// Refusals outside `refusalWindowDays` do not count: the record is kept, the
// window is what is read. Pure.
function overtureRefusalScale(npc, day) {
  const rec = npc && npc.flags && npc.flags._overtureRefusals;
  if (!rec || typeof rec.count !== 'number' || rec.count <= 0) return 1;
  const since = (typeof day === 'number' ? day : 0) - (rec.lastDay || 0);
  if (since < 0 || since > OVERTURE.refusalWindowDays) return 1;
  return Math.pow(OVERTURE.refusalDiminish, rec.count);
}

// Count a refusal into the window. Called by UI's refusal path, beside the
// delta and the fact, so all three consequences of a refusal read in one place.
// The counter RESETS rather than accumulating when the window has lapsed —
// otherwise "three refusals in a fortnight" and "three in an evening" would
// suppress an NPC identically, and only one of those is someone taking a hint.
function noteOvertureRefused(gameState, npcId, day) {
  const npc = gameState && gameState.npcs && gameState.npcs[npcId];
  if (!npc) return null;
  const prev = (npc.flags && npc.flags._overtureRefusals) || null;
  const since = prev ? (day - (prev.lastDay || 0)) : Infinity;
  const count = (prev && since >= 0 && since <= OVERTURE.refusalWindowDays)
    ? (prev.count || 0) + 1 : 1;
  npc.flags = { ...(npc.flags || {}), _overtureRefusals: { count, lastDay: day } };
  return npc.flags._overtureRefusals;
}

// --- D4's motive sources ---------------------------------------------------
// Five sources were named; this table holds the four `approach_player` lists.
// Mood is the fifth and is deliberately absent: Phase 1 gave mood its own
// channel (the expression layer, D7) precisely because it is state leaking out
// of what someone is already doing, not a reason to walk over.
//
// Each reader is pure and returns { strength, ref } — a [0,1] strength and
// what it is SPECIFICALLY about — or null when the source is silent for this
// NPC right now. `ref` is what the record's `motiveRef` carries, and it is why
// the strongest motive has to be resolved out here rather than inside
// scoreDrive: the same answer that scores the candidate names it.
//
// Two of these four still read exactly zero on a generated cast (the plan's
// Evidence, re-measured after Phase 2): nothing writes `relPlayer.grievances`
// outside the conversation path, and every relationship axis generates at 0
// and moves only through conversation rel-deltas. They are wired because the
// alternative is a four-source plan wearing a five-source label; they will
// come alive the moment their writers do, and verify-i3 exercises them
// directly rather than waiting for a population run to reach them.
const OVERTURE_MOTIVES = {
  // Plan 4's open-question lifecycle, through its own D13 bridge. topOpenQuestion
  // already applies RUMINATION.raiseThreshold and re-checks the question's
  // premise against the same rule the lifecycle's retire step uses, so this
  // cannot raise a question about a belief that has been evicted or
  // re-witnessed. Reusing it is also what keeps the bar in one place.
  curiosity: (npc) => {
    const q = topOpenQuestion(npc);
    if (!q) return null;
    return { strength: ovClamp01(q.curiosity ?? 0), ref: { factId: q.factId, topic: q.topic || '' } };
  },

  // The worst unresolved thing they are still carrying. Severity is already
  // [0,1] and already what the rest of the game weighs a grievance by.
  grievance: (npc) => {
    const list = (npc && npc.relPlayer && npc.relPlayer.grievances) || [];
    let best = null, bestIdx = -1;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (!g || g.resolved) continue;
      const sev = typeof g.severity === 'number' ? g.severity : 0;
      if (sev < OVERTURE.grievanceFloor) continue;
      if (!best || sev > best.severity) { best = { ...g, severity: sev }; bestIdx = i; }
    }
    if (!best) return null;
    return { strength: ovClamp01(best.severity), ref: { grievanceIndex: bestIdx, topic: best.text || '' } };
  },

  // REL_CONSEQUENCES.affectionGiftThreshold is the game's existing "real
  // fondness" bar — the one gating gift_to_player — rather than a second
  // number meaning the same thing. Rescaled so the floor is strength 0 and a
  // maxed axis is strength 1, or every fond NPC would start at 0.3.
  //
  // Intimacy & Voyeurism Phase 7 (D11): the ATTRACTION TERM — how the player
  // is dressed biases the response. The floor stays the relationship's; the
  // outfit only modulates the strength ONCE there is real fondness (a hot
  // outfit does not manufacture fondness out of nothing). Reads the same
  // shared clothingResponseToWearer the Phase 9 willingness function reads,
  // so "how attractive her outfit makes you find her" means one thing across
  // every consumer. A player in an ordinary fit contributes ~0 and this is
  // byte-identical to Phase 6.
  affection: (npc, gameState) => {
    const floor = REL_CONSEQUENCES.affectionGiftThreshold;
    const a = (npc && npc.relPlayer && npc.relPlayer.affection) || 0;
    if (a < floor) return null;
    const outfit = clothingResponseToWearer(npc, gameState && gameState.player);
    const total = Math.min(1, a + outfit.attraction);
    return { strength: ovClamp01((total - floor) / (1 - floor)), ref: {} };
  },

  // D12/D14, whole. The gate is SIM's npcInitiativeGate — personality-scaled,
  // content-gated, and the declared consumer of `mayInitiate` that D20 has been
  // waiting for since Phase 2. `tone` comes back with it, which is the only
  // place a 'charged' overture can come from.
  //
  // Intimacy & Voyeurism Phase 7 (D11): the DESIRE SOURCE — seeing the player
  // dressed invitingly adds to the desire motive strength. Phase 8 spends the
  // same shared number as real desire gain. Observer-gated by deviancy, so a
  // prude reads nothing from the same outfit a deviant finds enticing.
  desire: (npc, gameState) => {
    const gate = npcInitiativeGate(npc, activeContentFlags(gameState));
    if (!gate.mayInitiate) return null;
    const d = (npc.relPlayer && npc.relPlayer.desire) || 0;
    const outfit = clothingResponseToWearer(npc, gameState && gameState.player);
    return { strength: ovClamp01(d + outfit.desire), ref: {}, tone: gate.tone };
  },
};

// The strongest live motive for one def, or null. Ties break on the order the
// def declares its `motives`, which is stable across runs — the scorer must be
// deterministic for the same state and an rng tie-break would quietly make it
// not (Plan 3's scoreCandidates, same reasoning).
//
// D12's tone: 'charged' is reachable ONLY through the desire gate, because
// that is the only path disinhibition opens. Everything else is warm. A third
// value would be a tone with no narration and no fact behind it.
function bestMotive(def, npc, npcId, gameState, day) {
  const scale = overtureRefusalScale(npc, day);
  let best = null;
  for (const name of def.motives || []) {
    const read = OVERTURE_MOTIVES[name];
    if (!read) continue;                         // fails closed, like D23
    const hit = read(npc, gameState, npcId);
    if (!hit || !(hit.strength > 0)) continue;
    const strength = hit.strength * scale;
    if (!best || strength > best.strength) {
      best = { motive: name, motiveRef: hit.ref || {}, strength, tone: hit.tone || 'warm' };
    }
  }
  return best;
}

// --- Scoring (pure) --------------------------------------------------------
// Returns { [overtureId]: { motive, motiveRef, strength, tone, channel } } for
// every overture this NPC could open right now — the map COGNITION's
// scoreCandidates hands to scoreDrive as `ctx.motives` and then rides on the
// winning candidate. An empty map is the common and correct case.
//
// The candidacy conditions live here rather than in COGNITION's DRIVE_CANDIDACY
// table because they are about a person rather than about the world, but they
// mirror it exactly in kind: block filter, cooldown, and the conditions the
// resolver would otherwise have enforced from the inside. In particular an
// overture with NO live motive is not a candidate at all — without that, an
// unmotivated NPC would score at bare baseAppeal and could still win a tick,
// which is the `snoop_phone` defect (a candidate on 100% of npc-ticks whose
// resolver did nothing) reintroduced in a new table.
function scoreOvertures(npc, npcId, gameState, ctx) {
  const out = {};
  if (!npc || !gameState) return out;
  const day = gameState.meta && gameState.meta.clock ? gameState.meta.clock.day : 0;
  const playerRoom = gameState.player && gameState.player.location;

  // Intimacy & Voyeurism Phase 16 (D2/D14): the cold-shoulder. A cold-
  // shouldering NPC initiates NOTHING at the player — no approach, no text,
  // no proposal, no knock. Same read cognition.js's drive filter uses, so
  // the two gates can never disagree about what "cold" means.
  if (coldShoulderSuppressesOvertures(npc)) return out;

  for (const [overtureId, def] of Object.entries(OVERTURE_DEFS)) {
    // One committed intent: an NPC already holding an overture is not shopping
    // for a second one.
    if (npc.overture) continue;
    if (def.blockFilter && !def.blockFilter.includes(ctx.block)) continue;
    // A visitor's sim is dormant between visits and their drives are already
    // restricted to VISITOR_DRIVE_ALLOWLIST; an overture table they are not on
    // is the same answer.
    if (ctx.isVisitor) continue;
    if (isOnCooldown(npc, overtureId, ctx.nowAbs)) continue;
    if (!overtureAllowed(gameState, overtureId).allowed) continue;
    // D18 — the per-def door, checked here for the same reason DRIVE_CANDIDACY
    // is checked in scoreDrive: conditions the scorer cannot see are conditions
    // that open records the player should never have been offered.
    const can = OVERTURE_CANDIDACY[overtureId];
    if (can && !can(npc, npcId, gameState, ctx)) continue;
    // D29 — where this channel needs the NPC to be standing, as a named
    // predicate. An unknown name has already blocked in overtureAllowed above,
    // so by here the lookup cannot miss.
    const prox = OVERTURE_PROXIMITY[def.proximity];
    if (prox.needsPlayerRoom && !(ctx.location && playerRoom)) continue;
    if (!prox.test(ctx.location, playerRoom)) continue;

    const motive = bestMotive(def, npc, npcId, gameState, day);
    if (!motive) continue;
    // A channel that books something has to be able to name what: a proposal
    // with no free slot in range is not a candidate, for the same reason an
    // overture with no live motive is not one. Otherwise it would score, win
    // the tick, and open a record the player cannot say yes to.
    let proposal = null;
    if (def.proposes) {
      proposal = proposeTerms(npc, def, gameState);
      if (!proposal) continue;
    }
    out[overtureId] = { ...motive, channel: def.channel, overtureId, ...(proposal ? { proposal } : {}) };
  }
  return out;
}

// --- The text channel's line (Phase 4, pure) -------------------------------
// What `text_player` stopped pretending. The old drive picked one of seven
// strings at random with no relationship to anything the NPC knew or wanted;
// this picks from the list for the MOTIVE that won and fills in the topic the
// same motiveRef the approach's opening line reads.
//
// Entries carrying {topic} are dropped when there is no topic — affection and
// desire never have one, and a curiosity whose question has no phrase would
// otherwise text the literal word. Every list carries at least one entry
// without one (verify-i4 asserts it), so the pool is never empty.
//
// Takes an rng rather than reaching for one: this runs inside the tick, where
// the seeded generator is the caller's (R2).
function overtureTextLine(record, rng) {
  const key = record.tone === 'charged' ? 'charged' : record.motive;
  const list = OVERTURE_TEXT_TEMPLATES[key] || OVERTURE_TEXT_TEMPLATES[record.motive];
  if (!Array.isArray(list) || list.length === 0) return null;
  const topic = (record.motiveRef && record.motiveRef.topic) || '';
  const pool = list.filter(s => topic || !s.includes('{topic}'));
  if (pool.length === 0) return null;
  const pick = pool[Math.floor((typeof rng === 'function' ? rng() : 0) * pool.length)] || pool[0];
  return pick.replace('{topic}', topic);
}

// --- Choosing (pure) -------------------------------------------------------
// The overture half of an already-ranked list, if one won it. This is NOT a
// second chooser: `candidates` has been through choosePursuit, and this only
// answers "was the winner an overture, and which one" so evaluateDrives can
// branch. Returning null means the tick's winner was an ordinary drive, which
// is the common case.
function chooseOverture(choice) {
  if (!choice || !choice.overture) return null;
  return choice.overture;
}

// ===========================================================================
// THE WRITERS (D19)
//
// `npc.overture` is built or deleted here and nowhere else. Plan 3's D3
// restated, because the same failure is available: convention already failed
// once in this codebase when five drives grew their own bypass of the weight
// roll without anyone deciding the model had changed. SIM forwards the value
// through npcUpdates so the tick's NPC merge cannot drop it — that is a carry,
// not a second opinion about what the NPC is doing.
// ===========================================================================

// --- The proposal's terms (Phase 4, pure) ----------------------------------
// A proposal has to name a day, a window and a room, or it is a mood rather
// than a plan. Picked in the tick because that is where the decision is made,
// and pure because everything in the tick is (R2): the earliest slot that has
// not started yet, today or inside the kind's `maxAheadDays`, that the
// proposer's own schedule leaves free.
//
// The busy test is COMMITMENT_TUNING.busyBlocks read through the SAME
// resolveScheduleActivity probe respondToCommitment uses, deliberately without
// a gameState so the probe reads the template rather than any commitment. An
// NPC who proposed a slot they would be at work for would be answered yes and
// then not turn up, which is worse than not asking.
//
// Returns { kind, startAbs, endAbs, roomId } or null — and null means
// no candidacy at all, so an NPC with nothing to offer never opens the record.
//
// npc-initiative-retiming-plan's own conversion never reached this function
// (it was scoped to overture cooldowns, not proposals) — clockToAbsolute
// space here matches every other "when" in the continuous-simulation roadmap.
function proposeTerms(npc, def, gameState) {
  const spec = def && def.proposes;
  const kindDef = spec && COMMITMENT_KINDS[spec.kind];
  if (!kindDef || !Array.isArray(kindDef.slots)) return null;
  const clock = gameState.meta && gameState.meta.clock;
  if (!clock) return null;
  const nowAbs = clockToAbsolute(clock);
  for (let offset = 0; offset < (kindDef.maxAheadDays || 1); offset++) {
    const day = clock.day + offset;
    for (const slot of kindDef.slots) {
      const startAbs = day * 1440 + slot.startMinute;
      const endAbs = day * 1440 + slot.endMinute;
      if (startAbs <= nowAbs) continue;
      const { block } = resolveScheduleActivity(npc, absoluteToClock(startAbs));
      if (COMMITMENT_TUNING.busyBlocks.includes(block)) continue;
      // D18: `roomId: 'own_bedroom'` resolves to the PROPOSER's room. The
      // four original kinds name a fixed common room, which is right for a
      // dinner or a hangout and wrong for anything that has to happen
      // somewhere private — a shoot in the living room is not the beat. A
      // sentinel keeps COMMITMENT_KINDS declarative rather than making every
      // reader of `.roomId` learn about bedrooms.
      const roomId = kindDef.roomId === 'own_bedroom'
        ? (npc.residency && npc.residency.room) || null
        : kindDef.roomId;
      // Reject only a FAILED sentinel (a proposer with no assigned room),
      // never a kind that legitimately names no room at all — meal has none,
      // and a blanket !roomId check would silently refuse every kind like it.
      if (kindDef.roomId === "own_bedroom" && !roomId) continue;
      return { kind: spec.kind, startAbs, endAbs, roomId };
    }
  }
  return null;
}

// The record the plan's data model describes, with one substitution: `ticksLeft`
// and `openedDay` in place of the sketched `openedTick` (D26). A tick index is
// 0..47 and wraps at midnight, so it cannot measure an age — which is exactly
// why Plan 3's pursuit carries a countdown rather than comparing indices, and
// the bug that taught it (51.5% of cooldown stamps read as permanent) is on the
// record in isOnCooldown.
//
// `proposal` is the one field Phase 4 adds and it is present only on the one
// channel that has one — an optional field beats a null on every other record,
// because "absent means none" is already how this record says everything else
// (see resolveOverture's delete). A propose choice that reached here without
// terms would open a record nobody can accept, so it is refused outright.
function openOverture(gameState, npcId, choice) {
  const npc = gameState.npcs && gameState.npcs[npcId];
  if (!npc || !choice || !choice.overtureId) return null;
  const def = OVERTURE_DEFS[choice.overtureId];
  if (!def) return null;
  if (def.proposes && !choice.proposal) return null;
  npc.overture = {
    overtureId: choice.overtureId,
    channel: def.channel,
    motive: choice.motive,
    motiveRef: choice.motiveRef || {},
    targetId: 'player',
    openedDay: gameState.meta.clock.day,
    ticksLeft: def.utility.holdTicks || 1,
    status: 'pending',
    tone: choice.tone || 'warm',
    ...(choice.proposal ? { proposal: choice.proposal } : {}),
  };
  return npc.overture;
}

// --- D27's hold, as a pure question ----------------------------------------
// Where does an NPC waiting on an answer stand, and what are they doing while
// they wait? SIM's resolveTick asks; the answer is channel-specific and so it
// lives here with the rest of what a channel means.
//
// The two answers are not interchangeable. 'player' is the approach and the
// proposal — they came to you and are standing in front of you, so they follow
// the player's room, which is also why ageOverture must NOT lapse on the NPC's
// own room (Pass 1 re-rolls a room preference every tick; the hold is what
// pins them). 'here' is the knock: pulling a knocker into the player's room
// would walk them through the door they are knocking on.
//
// Returns { roomId, activity }. Both are answers, not defaults: 'here' returns
// the NPC's OWN room rather than null, because null would leave whatever Pass 1
// resolved in place and Pass 1 re-rolls a room preference every tick — a
// knocker would drift off to the kitchen while still holding a record that says
// they are at your door. This is Plan 3's scar in its second form; the first
// cost 233 of 485 pursuits. Pure; the caller does the writing.
function overtureWaitRoom(gameState, npc) {
  const rec = npc && npc.overture;
  const def = rec && OVERTURE_DEFS[rec.overtureId];
  if (!def) return { roomId: null, activity: null };
  const activity = def.activityOverride || null;
  if (def.waitAt === 'player') {
    return { roomId: (gameState.player && gameState.player.location) || null, activity };
  }
  return { roomId: npc.location || null, activity };
}

// Absent means no overture, never an empty object — so this deletes rather than
// nulls, and a save written mid-overture round-trips to genuinely absent (the
// releaseCommitment convention, for the same save-shape reason).
//
// Returns the record it removed, STAMPED with the outcome. That stamp is what
// gives `status` its readers on both sides: 'pending' is the only value ever
// stored and is what isOverturePending asks about, while 'engaged'/'refused'/
// 'lapsed' exist on the returned record for the caller that has to act on it —
// UI branches on it to decide whether D10's economy applies.
function resolveOverture(gameState, npcId, outcome) {
  const npc = gameState.npcs && gameState.npcs[npcId];
  if (!npc || !npc.overture) return null;
  const record = { ...npc.overture, status: outcome };
  delete npc.overture;
  return record;
}

// The no-cost ending: the player neither engaged nor turned away, and the
// moment passed. Deliberately its own named writer rather than a flag on
// resolveOverture — a lapse costs nothing and a refusal costs D10's economy,
// and the two call sites should not be one call site with a boolean.
function lapseOverture(gameState, npcId) {
  return resolveOverture(gameState, npcId, 'lapsed');
}

function isOverturePending(npc) {
  return !!(npc && npc.overture && npc.overture.status === 'pending');
}

// --- Phase 4: who is standing there waiting on a yes or a no ---------------
// The pure half of the response surface. RENDER turns each of these into two
// chips and UI's doOvertureRespond acts on them; the decision about WHICH
// records the player can answer from where they are standing is here, with the
// rest of what a channel means.
//
// The gate is the def declaring `respond`, not the record existing: an approach
// is answered by talking and refused by walking out (D8), and giving it chips
// too would be two ways to do one thing that could disagree. And a knocker is
// in ANOTHER room by construction, so this cannot filter on the player's room —
// it asks the same proximity question the overture was opened under.
//
// Returns [{ npcId, npc, record, respond }]. Pure.
function overtureRespondTargets(gameState) {
  const out = [];
  const playerRoom = gameState && gameState.player && gameState.player.location;
  if (!playerRoom) return out;
  for (const [npcId, npc] of Object.entries((gameState && gameState.npcs) || {})) {
    if (!isOverturePending(npc)) continue;
    const def = OVERTURE_DEFS[npc.overture.overtureId];
    if (!def || !def.respond) continue;
    const near = def.waitAt === 'here'
      ? (npc.location && npc.location !== playerRoom && isRoomAdjacent(npc.location, playerRoom))
      : npc.location === playerRoom;
    if (!near) continue;
    out.push({ npcId, npc, record: npc.overture, respond: def.respond });
  }
  return out;
}

// Called once per active NPC at the top of the drive pass, beside the pursuit's
// own ager and for the same reason: a record that only aged on ticks where
// drives happened to be evaluated would outlive its reason. An overture ends
// when its budget runs out, when the NPC stops being in a position to make it
// (asleep, or gone from the flat), or when the player stops being there to make
// it TO. Leaving one pending past any of those holds the NPC's next overture
// hostage to a moment that is over.
//
// The NPC's own room is deliberately NOT on that list, and this is Plan 3's
// scar. Pass 1 re-rolls a room preference every tick from
// ACTIVITY_ROOM_PREFERENCES, so ageing out on "they are not standing where the
// player is" would kill most records on the tick after the one that walked the
// NPC over — measured, the same mistake cancelled 233 of 485 pursuits before
// ageCommitment stopped releasing on transit. SIM pins the waiting NPC in
// place instead; see the hold branch there.
//
// Returns the surviving record, or null.
function ageOverture(gameState, npcId, resolved) {
  const npc = gameState.npcs && gameState.npcs[npcId];
  const o = npc && npc.overture;
  if (!o) return null;
  const playerRoom = gameState.player && gameState.player.location;
  if (!resolved || resolved.block === 'sleep' || !resolved.location || !playerRoom) {
    lapseOverture(gameState, npcId);
    return null;
  }
  const ticksLeft = (o.ticksLeft || 0) - 1;
  if (ticksLeft <= 0) {
    lapseOverture(gameState, npcId);
    return null;
  }
  npc.overture = { ...o, ticksLeft };
  return npc.overture;
}

// --- Meal joining (action-outcome-window-plan Phase 3, D12/D22/D23) --------
// "Can I join you?" is an overture in everything but name: an NPC decides,
// off their own motives, to direct something at the player and wait on an
// answer. So it lives here with the rest of what that means, and it reuses
// this file's limiter (overtureRefusalScale) rather than growing a second
// curve — turning someone down at the table is the same kind of no as turning
// down an approach, and an NPC who has been refused twice this week should ask
// less often for BOTH reasons at once.
//
// What it deliberately does NOT reuse: `npc.overture` itself. A join ask is
// answered inside the `sit` window, in the same breath it is made — it never
// outlives the moment, so it never needs a pending record, an age-out, or a
// hold. Writing one would mean inventing a lapse path for a question that
// cannot go unanswered.
//
// EVERYTHING HERE IS PURE. It reads state and returns numbers; `sit` does the
// rolling and the writing. That split is what lets the window show the ask
// without the window deciding anything (Design invariant 1).

// Is this NPC in a position to walk in at all? Not about wanting to — about
// being able to. Mirrors the bars an overture clears, minus the ones that are
// meaningless here (proximity is scored rather than gated, because "how far
// away are they" is exactly what the signal term is measuring).
function mealJoinEligible(gameState, npcId, roomId) {
  const npc = gameState && gameState.npcs && gameState.npcs[npcId];
  if (!npc) return { eligible: false, reason: 'no_npc' };
  // A resident of the flat, present in it. A guest or an offsite NPC is not
  // wandering into your kitchen.
  if (!npc.location) return { eligible: false, reason: 'offsite' };
  // The same suppression an overture respects: someone giving you the cold
  // shoulder does not ask to share your dinner.
  if (typeof coldShoulderSuppressesOvertures === 'function' && coldShoulderSuppressesOvertures(npc)) {
    return { eligible: false, reason: 'cold_shoulder' };
  }
  // Asleep, at work, or commuting — probed through resolveScheduleActivity
  // against the CURRENT clock, exactly the way respondToCommitment probes the
  // proposed slot, and refused on the same `busyBlocks` list. (`npc.activity`
  // is a display string like 'at work', not a block id, so it is the wrong
  // thing to test — the block is what the schedule actually says.)
  if (typeof resolveScheduleActivity === 'function' && gameState.meta && gameState.meta.clock) {
    const { block } = resolveScheduleActivity(npc, gameState.meta.clock);
    if (COMMITMENT_TUNING.busyBlocks.includes(block)) return { eligible: false, reason: block };
  }
  return { eligible: true, reason: null };
}

// How strongly does the meal reach this NPC, 0..1? The signal substrate is
// the primary answer (D12): perceiveSignals already models smell drifting
// further than sound and sight barely leaving its room, and it already knows
// about closed doors and headphones. Presence and adjacency are added on top
// because you do not need to SMELL a dinner that is happening in front of you.
//
// Returns { reach, perceived, present, adjacent } — the parts as well as the
// total, because `sit`'s narration wants to say HOW they noticed.
function mealJoinReach(gameState, npcId, roomId) {
  const npc = gameState.npcs[npcId];
  const npcRoom = npc && npc.location;
  if (!npcRoom) return { reach: 0, perceived: 0, present: false, adjacent: false };

  const present = npcRoom === roomId;
  const adjacent = !present && typeof isRoomAdjacent === 'function' && isRoomAdjacent(npcRoom, roomId);

  // What they actually perceive of the FOOD, from where they are standing.
  // Scoped to signals originating in the meal's room so an unrelated pot on a
  // different stove cannot pull someone to this table.
  let perceived = 0;
  if (typeof perceiveSignals === 'function') {
    for (const rec of perceiveSignals(gameState, npcId, npcRoom) || []) {
      if (rec.sourceRoomId !== roomId) continue;
      if (rec.signalId !== 'cooking') continue;
      perceived = Math.max(perceived, rec.intensity);
    }
  }

  const reach = clamp(
    perceived * SIT_TUNING.signalWeight
      + (present ? SIT_TUNING.presentBonus : 0)
      + (adjacent ? SIT_TUNING.adjacentBonus : 0),
    0, 1);
  return { reach, perceived, present, adjacent };
}

// Would they want to? Affection and hunger, scaled by the reach above and
// damped by a scheduled meal — a planned dinner reads as a private thing, but
// never a closed one (D12: lowers, never zeroes).
//
// Returns { chance, reach, terms } with everything the caller needs to explain
// the number, because a chance nobody can account for is a chance nobody can
// tune.
function mealJoinChance(gameState, npcId, roomId, opts = {}) {
  const npc = gameState.npcs[npcId];
  const { reach, perceived, present, adjacent } = mealJoinReach(gameState, npcId, roomId);
  if (reach <= 0) return { chance: 0, reach, terms: { blocked: 'no_reach' } };

  const rel = (npc && npc.relPlayer) || {};
  const affection = Math.max(0, rel.affection || 0);
  const hunger = (npc && npc.needs && typeof npc.needs.hunger === 'number') ? npc.needs.hunger : 100;
  // Ramps 0 → 1 as satiation falls from hungerFull to empty.
  const hungerTerm = hunger >= SIT_TUNING.hungerFull
    ? 0 : (SIT_TUNING.hungerFull - hunger) / SIT_TUNING.hungerFull;

  const motive = affection * SIT_TUNING.affectionWeight + hungerTerm * SIT_TUNING.hungerWeight;
  const day = gameState.meta && gameState.meta.clock ? gameState.meta.clock.day : 0;
  const limiter = overtureRefusalScale(npc, day);
  const damping = opts.scheduled ? SIT_TUNING.scheduledDamping : 1;

  const chance = clamp(motive * reach * limiter * damping, SIT_TUNING.minChance, SIT_TUNING.maxChance);
  return {
    chance, reach,
    terms: { affection, hunger, hungerTerm, motive, limiter, damping, perceived, present, adjacent },
  };
}

// Everyone who is NOT already a confirmed guest, with their chance of asking.
// Pure and UNROLLED — `sit` rolls, because a function that both computes a
// chance and consumes randomness cannot be re-read to explain what it did.
// Sorted strongest-first so a seat-capped table gives its remaining chairs to
// the people most likely to want them.
function mealJoinCandidates(gameState, roomId, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const out = [];
  for (const npcId of Object.keys((gameState && gameState.npcs) || {})) {
    if (exclude.has(npcId)) continue;
    const elig = mealJoinEligible(gameState, npcId, roomId);
    if (!elig.eligible) continue;
    const scored = mealJoinChance(gameState, npcId, roomId, opts);
    if (scored.chance <= 0) continue;
    out.push({ npcId, npc: gameState.npcs[npcId], ...scored });
  }
  out.sort((a, b) => b.chance - a.chance);
  return out;
}

// ===== /SECTION: OVERTURE =====
