// ===== SECTION: RELATIONSHIPS =====
// Intimacy & Voyeurism Phase 12 (D12/D14): the relationship store and the
// couple-formation pass.
//
// `world.relationships[pairKey]` records emergent NPC↔NPC couples. Formation
// is a SLOW CADENCE pass (updateRelationshipsForDay, once per day at the UI
// rollover): each day consumes the pair's accumulated co-location ticks
// (resolveTick's proximity accumulator — SIM's resolveTick calls
// notePairCoLocation once per co-located tick, bedroom-weighted) through the
// compatibility temperature (pairCompatibility, pure — castWeb axes +
// shared interests + aligned values + temperament distance) into `progress`;
// crossing seeingThreshold / committedThreshold with a cooldown elapsed
// advances status. Nothing here is scripted and nothing is random: a couple
// is what proximity and temperament say it is (D12 — "no scripted couples").
//
// Committed couples consolidate onto ONE UPGRADED bedroom (residentCapacity
// 2 — the seam renovation-occupancy reserved for this plan; the config
// comment at FACILITY_DEFS names it) and set residency.partnerOf on both
// sides, feeding the couples-share-a-room rules that already exist
// (acceptApplicant / renderRoomListAssign). Until a bedroom is upgraded the
// couple stays in separate rooms and the pass retries every rollover — the
// player upgrading a bedroom is what lets them move in together.
//
// The store is state, not the codex: `history`/`lastIntimateDay` are the
// record Phase 13's pair acts and Phase 14's infidelity write through
// addRelationshipHistory; `trying` is Phase 18's read. The per-character
// player ledger is a different surface (Phase 15) and lives on the player.

// Deterministic pair key — the same canonical form castWeb uses, so the two
// stores can never disagree about which key names a pair.
function pairKey(a, b) {
  return [a, b].sort().join('|');
}

// A fresh record. `progress`/`coLocTicks`/`lastTransitionDay` are the
// formation machinery; everything else is the plan's data-model shape.
function blankRelationshipRecord() {
  return {
    status: 'single',         // single | seeing | committed
    public: false,            // who knows — gossip-derived, not authored (D14)
    history: [],              // [{ kind, day, other? }] — first_kiss, first_sex, ...
    lastIntimateDay: null,    // read by Phase 18 (trying) and the consent-history surface
    trying: false,            // pregnancy flag (D16) — read by Phase 18
    progress: 0,              // accumulated formation temperature, 0..1
    coLocTicks: 0,            // weighted co-located 30-min ticks since last rollover
    lastTransitionDay: null,  // cooldown bookkeeping
  };
}

// Read-or-create access to a pair's record. `create` defaults to false:
// callers that only want to observe a pair (rendering, gossip) never mint a
// record, so a fresh save stays empty until proximity actually happens.
function getRelationship(gameState, a, b, create) {
  const store = gameState.world.relationships || (gameState.world.relationships = {});
  const key = pairKey(a, b);
  if (store[key]) return store[key];
  if (!create) return null;
  return (store[key] = blankRelationshipRecord());
}

// How many residents a bedroom's FACILITY currently permits. The operative
// field is residentCapacity on the bedroom facility's CURRENT tier — the
// seam renovation-occupancy-plan.md reserved and this phase consumes: a
// 'functional' bedroom hosts 1, an 'upgraded' one hosts 2, a 'broken' one
// hosts nobody NEW (the resident squatting in it keeps their room; the
// player simply cannot recruit a second person into it). Rooms without a
// facility entry fall back to their static ROOMS.capacity.
function bedroomResidentCapacity(gameState, roomId) {
  const def = ROOMS[roomId];
  if (!def || def.type !== 'bedroom') return 0;
  const facilityIds = ROOM_FACILITIES[roomId] || [];
  if (facilityIds.length === 0) return def.capacity || 0;
  let cap = 0;
  for (const fid of facilityIds) {
    const fdef = FACILITY_DEFS[fid];
    const tier = gameState.world.upgrades?.[fid]?.tier || FACILITY_STARTING_TIERS[fid] || 'broken';
    const t = (fdef && fdef.tiers || []).find(x => x.tier === tier);
    cap = Math.max(cap, t && t.residentCapacity || 0);
  }
  return cap;
}

// The pair-formation temperature (D12) — pure, deterministic, no rng, no LLM.
//   f(castWeb axes, bible.interests ∩, values ∩, personality distance)
// The castWeb `dynamic` term is what makes formation EMERGENT rather than a
// rerun of cast generation: it reads the pair's live mutual axes (Phase 13
// will move them with every pair act), so a couple's temperature rises as
// they actually warm to each other. Everything else is static temperament.
function pairCompatibility(gameState, a, b) {
  const npcA = gameState.npcs[a];
  const npcB = gameState.npcs[b];
  if (!npcA || !npcB) return 0;
  const w = RELATIONSHIP.pairCompatibility;

  // Shared interests — tag overlap, the same vocabulary computeCompatibility
  // uses for cast generation.
  const tagsA = new Set((npcA.bible.interests || []).flatMap(i => i.tags || []));
  const tagsB = new Set((npcB.bible.interests || []).flatMap(i => i.tags || []));
  let shared = 0;
  for (const t of tagsA) if (tagsB.has(t)) shared++;
  const interestTerm = Math.min(1, shared * w.sharedInterestPerTag);

  // Values — the share of value pairs that agree outright or at least are
  // not opposition-coded against each other (computeFriction's vocabulary).
  const valuesA = npcA.bible.values || [];
  const valuesB = npcB.bible.values || [];
  let aligned = 0, pairs = 0;
  for (const va of valuesA) {
    for (const vb of valuesB) {
      pairs++;
      if (va.name === vb.name || (va.opposition !== vb.name && vb.opposition !== va.name)) aligned++;
    }
  }
  const valuesTerm = pairs > 0 ? aligned / pairs : 0.5;

  // Personality — temperament Euclidean distance, the exact normalisation
  // computeCompatibility uses (so the two numbers read the same scale).
  const tA = npcA.bible.temperament || {};
  const tB = npcB.bible.temperament || {};
  const dist = Math.sqrt(
    Math.pow((tA.warmth || 0) - (tB.warmth || 0), 2) +
    Math.pow((tA.volatility || 0) - (tB.volatility || 0), 2) +
    Math.pow((tA.openness || 0) - (tB.openness || 0), 2)
  );
  const personalityTerm = Math.max(0, 1 - dist / 3.46);

  // Emergent dynamic — the pair's live castWeb axes, mutual. Affection and
  // desire pull a pair together; tension pushes them apart.
  const pair = gameState.world.castWeb?.[pairKey(a, b)] || null;
  const axA = pair?.axes?.[`${a}→${b}`] || {};
  const axB = pair?.axes?.[`${b}→${a}`] || {};
  const avg = (k) => (((axA[k] || 0) + (axB[k] || 0)) / 2);
  const dynamic = clamp01(
    avg('affection') * 0.5 + avg('desire') * 0.3 + avg('comfort') * 0.2
    - avg('tension') * w.dynamicTension
  );

  return clamp01(
    w.base
    + interestTerm * w.sharedInterests
    + valuesTerm * w.valuesAligned
    + personalityTerm * w.personality
    + dynamic * w.dynamic
  );
}

// The per-tick proximity accumulator — the resolveTick hook. Called once per
// co-located resident pair per tick with the room they shared. Bedrooms weigh
// extra (sharing a room is a stronger signal than sharing a kitchen). In-place
// write on world.relationships, exactly like resolveTick's signal buffer: the
// world object survives resolveBatch's npc rebuild untouched.
function notePairCoLocation(gameState, a, b, opts) {
  getRelationship(gameState, a, b, true).coLocTicks += (opts && opts.weight) || 1;
}

// The store's history writer — the seam Phase 13 (pair acts) and Phase 14
// (infidelity) write through. `other` names a third party for kinds that
// involve one (cheating). Sets lastIntimateDay on kinds that are intimate.
function addRelationshipHistory(gameState, a, b, kind, day, other) {
  const rec = getRelationship(gameState, a, b, true);
  rec.history.push({ kind, day, ...(other !== undefined ? { other } : {}) });
  if (kind === 'sex' || kind === 'first_sex') rec.lastIntimateDay = day;
  return rec;
}

// Consolidate a committed couple onto ONE upgraded bedroom. Pure-ish: returns
// null when there is nothing to do (same room, no upgraded bedroom, no spare
// bed), otherwise moves the mover into the keeper's room (bed B — the keeper
// holds bed A) and returns the change for rent/narration.
function coupleMoveInTogether(gameState, a, b) {
  const npcs = gameState.npcs;
  const ra = npcs[a]?.residency?.room;
  const rb = npcs[b]?.residency?.room;
  if (!ra || !rb || ra === rb) return null;
  if (ra === 'bedroom_player' || rb === 'bedroom_player') return null;
  const capA = bedroomResidentCapacity(gameState, ra);
  const capB = bedroomResidentCapacity(gameState, rb);
  // Keep the room that can host two; tie → deterministic (npcId order).
  const keepId = capA > capB ? a : (capB > capA ? b : (a < b ? a : b));
  const moverId = keepId === a ? b : a;
  const targetRoom = npcs[keepId].residency.room;
  if (bedroomResidentCapacity(gameState, targetRoom) < 2) return null; // not upgraded — retry next rollover
  const occupants = Object.keys(npcs).filter(id =>
    id !== moverId && npcs[id].residency.room === targetRoom && npcs[id].residency.status === 'resident');
  if (occupants.length >= (ROOMS[targetRoom].capacity || 2)) return null;
  npcs[moverId] = moveToRoom(moverId, npcs[moverId], targetRoom, npcs, undefined);
  return { keeperId: keepId, moverId, targetRoom };
}

// Render/read surface: the single strongest relationship a given NPC holds,
// for the Present cards ("seeing Alex" / "with Alex"). Returns null for a
// single NPC or an absent partner — no record, no relationship to report.
function relationshipSummaryForNpc(gameState, npcId) {
  const store = gameState.world.relationships || {};
  for (const [key, rec] of Object.entries(store)) {
    // Exact-split membership: `npc_10|outside_npc_1` must not read as
    // belonging to `npc_1` (the old substring test did, and Phase 14's
    // `outside_<residentId>` ids make that collision reachable).
    const ids = key.split('|');
    if (!ids.includes(npcId)) continue;
    if (rec.status === 'single') continue;
    const otherId = ids.find(id => id !== npcId);
    if (!otherId || !gameState.npcs[otherId]) continue;
    return { status: rec.status, partnerId: otherId, partnerName: gameState.npcs[otherId].bible?.name || otherId };
  }
  return null;
}

// The slow-cadence formation pass — once per game day, at the UI rollover.
// Consumes each pair's accumulated co-location through the compatibility
// temperature into progress, applies decay to pairs below 'seeing' (drift
// needs a pull-back or every roommate pairing eventually couples), and
// advances status on threshold + cooldown (the single-pair transition is
// tryAdvanceRelationshipStatus, below — shared with Phase 15's matchmake
// verb so both paths use exactly one implementation). Deterministic: no rng
// anywhere — given the same state it produces the same result, byte for byte.
//
// Returns narration events for the caller to log:
//   { kind: 'seeing', a, b } | { kind: 'committed', a, b, moved, moverId, targetRoom }
function updateRelationshipsForDay(gameState, day) {
  const rel = RELATIONSHIP;
  const npcs = gameState.npcs;
  const events = [];
  const store = gameState.world.relationships || (gameState.world.relationships = {});
  const residentIds = Object.keys(npcs).filter(id => npcs[id].residency?.status === 'resident');

  for (let i = 0; i < residentIds.length; i++) {
    for (let j = i + 1; j < residentIds.length; j++) {
      const a = residentIds[i], b = residentIds[j];
      const rec = getRelationship(gameState, a, b, true);
      const compat = pairCompatibility(gameState, a, b);
      // Household baseline applies ONLY on a day the pair actually shared a
      // room at least once (the tick grid misses hallway pass-bys, so zero
      // co-located ticks is not quite "never together" — but it must not
      // lift a pair that genuinely never interacts). Pairs that spent the
      // day apart decay toward zero while single, which is the pull-back
      // that keeps formation selective.
      const baseline = rec.coLocTicks > 0 ? rel.basePerDay : 0;
      if (rec.status === 'single') rec.progress = Math.max(0, rec.progress - rel.decayPerDay);
      rec.progress = clamp01(rec.progress + baseline + rec.coLocTicks * rel.proximityPerTick * compat);
      rec.coLocTicks = 0;
      const evt = tryAdvanceRelationshipStatus(gameState, a, b, rec, day);
      if (evt) events.push(evt);
    }
  }

  // Committed couples consolidate whenever an upgraded bedroom becomes
  // available (a room the player upgraded since the pair committed), and
  // partnerOf is re-asserted idempotently so the two stores can't drift.
  for (const [key, rec] of Object.entries(store)) {
    if (rec.status !== 'committed') continue;
    const [a, b] = key.split('|');
    if (!npcs[a] || !npcs[b]) continue;
    if (npcs[a].residency?.status !== 'resident' || npcs[b].residency?.status !== 'resident') continue;
    npcs[a] = changeResidencyStatus(npcs[a], 'resident', { partnerOf: b });
    npcs[b] = changeResidencyStatus(npcs[b], 'resident', { partnerOf: a });
    if (npcs[a].residency.room === npcs[b].residency.room) continue;
    const move = coupleMoveInTogether(gameState, a, b);
    if (move) {
      gameState.world.rent = computeRent(npcs, gameState);
      events.push({ kind: 'moved_in', a, b, moved: true, moverId: move.moverId, targetRoom: move.targetRoom });
    }
  }

  return events;
}

// The single-pair status transition — the shared core the daily pass and
// Phase 15's matchmake verb both call, so a warmed pair advances with exactly
// the same thresholds and cooldown whether it got there by co-location or by
// the player's nudge. The daily pass has already accumulated progress into
// `rec`; the matchmake verb has already injected it. Returns the transition
// event (see updateRelationshipsForDay) or null when nothing crosses.
// Deterministic, no rng.
function tryAdvanceRelationshipStatus(gameState, a, b, rec, day) {
  const rel = RELATIONSHIP;
  const npcs = gameState.npcs;
  const cooldownElapsed = day - (rec.lastTransitionDay ?? day - rel.progressionCooldownDays);
  if (cooldownElapsed < rel.progressionCooldownDays) return null;
  const compat = pairCompatibility(gameState, a, b);
  if (rec.status === 'single' && compat >= rel.minCompatibilityForStart && rec.progress >= rel.seeingThreshold) {
    rec.status = 'seeing';
    rec.lastTransitionDay = day;
    rec.public = true;
    addRelationshipHistory(gameState, a, b, 'became_seeing', day);
    return { kind: 'seeing', a, b };
  }
  if (rec.status === 'seeing' && rec.progress >= rel.committedThreshold) {
    rec.status = 'committed';
    rec.lastTransitionDay = day;
    rec.public = true;
    addRelationshipHistory(gameState, a, b, 'became_committed', day);
    npcs[a] = changeResidencyStatus(npcs[a], 'resident', { partnerOf: b });
    npcs[b] = changeResidencyStatus(npcs[b], 'resident', { partnerOf: a });
    const move = coupleMoveInTogether(gameState, a, b);
    if (move) gameState.world.rent = computeRent(npcs, gameState);
    return { kind: 'committed', a, b, moved: !!move, moverId: move ? move.moverId : null, targetRoom: move ? move.targetRoom : null };
  }
  return null;
}

// ===== SECTION: INFIDELITY (Intimacy & Voyeurism Phase 14, D14) =====
// An intimacy act that contradicts a relationship record. Deterministic
// authority (D15): the act itself went through the willingness gate exactly
// like any other — this is the CONSEQUENCE pass that runs after a COMPLETED
// act and decides what the wronged party experiences. It (1) writes a
// gossip-transmissible `cheating` fact to the cheater's own memory (they
// know what they did — provenance 'witnessed', category INFIDELITY
// .factCategory, carrying the structured `cheating` metadata the
// transmission hook reads), (2) stamps the wronged↔cheater record with a
// `cheat` history entry (Phase 16's breakup ladder reads it), and (3) when
// the wronged party LEARNS — caught mid-act (same room or a perceived moan,
// the same perceiveSignals query everything else uses, D10's honesty) or
// reached later by the gossip fact (maybeJealousUponFact) — applies the
// jealousy: castWeb wronged→cheater deltas, a mood drop, the wronged's own
// copy of the fact, and, when the player was the "other", relPlayer deltas
// + a grievance toward the player.
//
// applyInfidelityFootprint is the ONE writer, called by BOTH the NPC pair
// act (tryIntimatePair, drives.js) and the player's paired act
// (resolvePairedAct, actions.js) — symmetric initiation means symmetric
// consequences (D3). It returns { events, wrongedNpcs }: `wrongedNpcs` maps
// id → the replaced wronged npc object, so the TICK caller can merge it
// post-loop (resolveBatch would clobber a third NPC's mid-loop write with a
// pre-tick snapshot — the exact clobber the factTransfers dual-write
// pattern exists for). The player-path caller applies the same objects
// directly; both callers then push the events through the normal event
// pipeline.

// Which pairs, if any, an act between `a` and `b` betrays. Returns
// { wrongedId, cheaterId, otherId } records — one per (cheater, wronged)
// pair. PURE. The wronged party is the NPC whose committed/seeing record
// with a participant is contradicted by the act (the participant's partner
// who is NOT the other participant of this act). `player` is never a wronged
// party — player-NPC relationships live in relPlayer, outside this store.
function infidelityWrongedActs(gameState, a, b) {
  const out = [];
  const store = gameState.world?.relationships;
  if (!store) return out;
  const participants = [a, b].filter(x => x && x !== 'player');
  for (const cheater of participants) {
    const other = cheater === a ? b : a;
    for (const [key, rec] of Object.entries(store)) {
      if (rec.status !== 'committed' && rec.status !== 'seeing') continue;
      const ids = key.split('|');
      if (!ids.includes(cheater)) continue;
      const w = ids.find(id => id !== cheater);
      if (!w || w === other || w === 'player') continue;
      if (!gameState.npcs[w]) continue;
      if (out.some(x => x.cheaterId === cheater && x.wrongedId === w)) continue;
      out.push({ wrongedId: w, cheaterId: cheater, otherId: other });
    }
  }
  return out;
}

// The gossip-transmissible fact. Canonical third-person text so the cheater
// and every downstream receiver hold the SAME string (receiveTransmittedFact
// dedupes on exact text). `cheating` metadata rides the record so the
// gossip-receipt hook can identify the wronged party. PURE.
function infidelityCheatingFact(gameState, cheaterId, otherId, day) {
  const cheaterName = gameState.npcs[cheaterId]?.bible?.name || 'Someone';
  const otherName = otherId === 'player' ? 'the player' : (gameState.npcs[otherId]?.bible?.name || 'someone');
  return {
    text: `${cheaterName} slept with ${otherName}`,
    day,
    importance: INFIDELITY.factImportance,
    category: INFIDELITY.factCategory,
    provenance: 'witnessed',
    confidence: 1.0,
    salience: 1.0,
    emotionalTag: INFIDELITY.factEmotionalTag,
    cheating: { cheaterId, otherId, day },
  };
}

// Does the wronged party know about the act right now? Same room, or the
// moan reaches them through the SAME perceiveSignals query the player and
// every NPC read (D10 — nobody is omniscient; an act behind a shut door at
// the other end of the hall is genuinely unseen). PURE.
function infidelityWrongedPerceives(gameState, wrongedId, actRoomId) {
  const wronged = gameState.npcs[wrongedId];
  if (!wronged) return false;
  if (actRoomId && wronged.location === actRoomId) return true;
  const loc = wronged.location;
  if (!loc || !ROOMS[loc]) return false;
  return perceiveSignals(gameState, wrongedId, loc).some(r => r.signalId === 'moaning');
}

// The jealousy reaction — what the wronged party experiences on LEARNING.
// Idempotent per (cheater, other, day): a repeat delivery of the same fact
// (re-witnessed, told twice) does not stack. `fact` is the record to store
// on the wronged party — passed by the caught path (they witnessed it, so
// they hold a 'witnessed' copy) and omitted by the gossip path (the fact
// just landed via receiveTransmittedFact, no second copy). Returns the
// replaced wronged npc, or null.
function applyInfidelityJealousy(gameState, wrongedId, cheaterId, otherId, day, fact) {
  let wronged = gameState.npcs[wrongedId];
  if (!wronged) return null;
  const key = `${cheaterId}|${otherId}|${day}`;
  if (wronged.flags?._jealousy?.[key]) return wronged;
  wronged = {
    ...wronged,
    flags: { ...(wronged.flags || {}), _jealousy: { ...(wronged.flags?._jealousy || {}), [key]: true } },
  };
  wronged = applyMoodDelta(wronged, INFIDELITY.wrongedMoodDelta, 'jealous');
  if (fact) wronged = addMemoryFact(wronged, fact);
  if (otherId === 'player') {
    wronged = applyRelDelta(wronged, INFIDELITY.wrongedPlayerDeltas, day);
    wronged = addGrievance(wronged, INFIDELITY.grievanceText, INFIDELITY.grievanceSeverity, day);
    // Intimacy & Voyeurism Phase 16 (D2/D14): the "public infidelity
    // fallout". When the wronged party learns the player was the OTHER, they
    // go cold-shoulder toward the player (COLD_SHOULDER.causeSeverity) — no
    // talk, no overtures, no intimacy, and at max severity the day pass may
    // push them toward moving out. This lands ON TOP of the jealousy deltas +
    // grievance above, never instead of them. Only when the player was the
    // other: the flag is player-facing by construction, and an NPC↔NPC
    // betrayal's fallout stays in the castWeb where it belongs.
    noteColdShoulder(wronged, COLD_SHOULDER.causeSeverity.public_infidelity, day, 'public_infidelity');
  }
  gameState.world.castWeb = applyNpcToNpcDelta(gameState.world.castWeb || {}, wrongedId, cheaterId, INFIDELITY.wrongedDeltas);
  gameState.npcs[wrongedId] = wronged;
  return wronged;
}

// The one infidelity writer (see the section header). `act` is informational
// (the ledger/Phase-17 surface); `opts.location` is the act's room, needed
// for the caught-in-the-act perception check. Returns
// { events, wrongedNpcs } for the caller to merge + push.
function applyInfidelityFootprint(gameState, a, b, act, opts = {}) {
  const events = [];
  const wrongedNpcs = {};
  const acts = infidelityWrongedActs(gameState, a, b);
  if (acts.length === 0) return { events, wrongedNpcs };
  const day = gameState.meta?.clock?.day ?? 1;
  const location = opts.location || null;
  const nowMinutes = gameState.meta?.clock?.minutes ?? 0;
  for (const w of acts) {
    const fact = infidelityCheatingFact(gameState, w.cheaterId, w.otherId, day);
    // 1. The cheater's own memory — they know what they did. A fresh copy
    // per write (facts are immutable once stored; the store dedupes on
    // nothing, so a second act on another day is a second fact).
    const cheater = gameState.npcs[w.cheaterId];
    if (cheater) gameState.npcs[w.cheaterId] = addMemoryFact(cheater, { ...fact });
    // 2. The record between cheater and wronged gains the betrayal — the
    // Phase 16 breakup/jealousy ladder reads `history` for kind 'cheat'.
    addRelationshipHistory(gameState, w.cheaterId, w.wrongedId, 'cheat', day, w.otherId);
    // 3. Caught in the act: the wronged party perceives the act as it
    //    happens → jealousy lands immediately, plus the witnessed fact and
    //    a 'cheating' world event (which becomes their memory episode).
    if (infidelityWrongedPerceives(gameState, w.wrongedId, location)) {
      const wronged = applyInfidelityJealousy(gameState, w.wrongedId, w.cheaterId, w.otherId, day, { ...fact });
      if (wronged) wrongedNpcs[w.wrongedId] = wronged;
      events.push({
        day,
        tick: getTickIndex(nowMinutes),
        roomId: location,
        npcId: w.wrongedId,
        type: 'cheating',
        moodDelta: INFIDELITY.wrongedMoodDelta,
        data: { other: w.cheaterId },
        template: '{name} found out what {other} did and is furious.',
        seenByPlayer: false,
      });
    }
  }
  return { events, wrongedNpcs };
}

// The gossip-receipt hook: a `cheating` fact reaching the WRONGED party
// through the transmission system (told_by/overheard — the fact's own
// `cheating` metadata names them) is learning, and learning is when jealousy
// lands — the same applyInfidelityJealousy the caught path uses, minus the
// fact write (receiveTransmittedFact just delivered it). Called by SIM after
// a factTransfer and by NPC's overhearing leg. Returns the replaced wronged
// npc (for the caller's merge) or null.
function maybeJealousUponFact(gameState, receiverId, fact) {
  if (!fact || fact.category !== INFIDELITY.factCategory) return null;
  const meta = fact.cheating;
  if (!meta || typeof meta.cheaterId !== 'string' || !meta.otherId) return null;
  if (receiverId === meta.cheaterId || receiverId === meta.otherId) return null;
  const rec = getRelationship(gameState, receiverId, meta.cheaterId, false);
  if (!rec || (rec.status !== 'committed' && rec.status !== 'seeing')) return null;
  const day = typeof meta.day === 'number' ? meta.day : (gameState.meta?.clock?.day ?? 1);
  return applyInfidelityJealousy(gameState, receiverId, meta.cheaterId, meta.otherId, day, null);
}
