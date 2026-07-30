// ===== SECTION: SIM =====
// Pure functions: clock, schedules, off-screen resolution, needs, rent, residency.
// No DOM, no kv, no LLM. All fns take state → return state or deltas.

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Hash a string to a 32-bit int for seeding
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Generate a random seed string
function genSeed() {
  return Math.random().toString(36).substring(2, 12);
}

// Generate a unique NPC ID for non-seeded contexts (mid-game additions like
// importCharacter, which have no seed/slot to derive from).
let _npcIdCounter = 0;
function genNpcId() {
  _npcIdCounter++;
  return `npc_${Date.now().toString(36)}_${_npcIdCounter}`;
}

// Deterministic NPC id for seeded cast generation: the same seed and cast
// slot index always produce the same id. This is what makes "paste a seed,
// get the same house" (brief §7.3) hold at the id level and not just the
// traits — ids are also the keys for both npcs and castWeb, so a
// non-deterministic id here broke seed reproducibility structurally.
function genSeededNpcId(seed, slotIndex) {
  return `npc_${hashStr(String(seed)).toString(36)}_${slotIndex}`;
}

// --- Seeded RNG factory: creates a PRNG from a base seed + sub-seed ---
function seededRng(baseSeed, subSeed) {
  return mulberry32(hashStr(baseSeed + '|' + subSeed));
}

// --- Weighted random pick ---
function weightedPick(rng, items, weightFn) {
  const weights = items.map((item, i) => ({ item, w: weightFn ? weightFn(item, i) : (item.weight || 1) }));
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const { item, w } of weights) {
    r -= w;
    if (r <= 0) return item;
  }
  return weights[weights.length - 1].item;
}

// Pick N unique items
function pickUnique(rng, pool, count, weightFn) {
  const available = [...pool];
  const result = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const picked = weightedPick(rng, available, weightFn);
    result.push(picked);
    available.splice(available.indexOf(picked), 1);
  }
  return result;
}

// --- Clock functions ---

function getWeekday(day) {
  return ((day - 1) % 7); // 0=Mon, 6=Sun
}

function isWeekend(day) {
  return getWeekday(day) >= 5;
}

function getPhase(minutes) {
  const t = CLOCK.phaseThresholds;
  if (minutes < t.early_morning) return 'early_morning';
  if (minutes < t.morning) return 'morning';
  if (minutes < t.midday) return 'midday';
  if (minutes < t.afternoon) return 'afternoon';
  if (minutes < t.evening) return 'evening';
  return 'night';
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDate(day) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `${weekdays[getWeekday(day)]} Day ${day}`;
}

function advanceClock(clock, ticks) {
  let { day, minutes } = clock;
  minutes += ticks * CLOCK.tickMinutes;
  while (minutes >= 1440) {
    minutes -= 1440;
    day++;
  }
  return { day, weekday: getWeekday(day), minutes, phase: getPhase(minutes) };
}

// Get the tick index within a day (0-47)
function getTickIndex(minutes) {
  return Math.floor(minutes / CLOCK.tickMinutes);
}

// --- Presence ---

// Ids of NPCs currently physically present in a room. npc.location is the
// single source of truth for live presence — world.rooms carries no
// occupants mirror, since one only ever got written at new-game and never
// updated again.
function getPresentNpcIds(npcs, roomId) {
  return Object.keys(npcs).filter(id => {
    const n = npcs[id];
    return n && n.location === roomId && n.residency.status !== 'former';
  });
}

// --- Schedule resolution ---

// Given an NPC's schedule template and current time, get their activity
function resolveScheduleActivity(npc, clock) {
  const template = SCHEDULES[npc.bible.scheduleTemplate] || SCHEDULES.standard;
  const dayType = isWeekend(clock.day) ? 'weekend' : 'weekday';
  const sched = template[dayType] || template.weekday;
  const tick = getTickIndex(clock.minutes);

  // Find which block this tick falls into
  for (const [blockName, ranges] of Object.entries(sched)) {
    for (const [start, end, weight] of ranges) {
      if (tick >= start && tick < end) {
        return { block: blockName, weight };
      }
    }
  }
  return { block: 'leisure', weight: 0.5 };
}

// Determine which room an NPC should be in for a given activity block
function resolveRoomForActivity(block, npcId, npcs, rng) {
  if (block === 'sleep') {
    // Go to their bedroom
    return null; // caller resolves from residency
  }
  if (block === 'work' || block === 'commute' || block === 'commute_home') {
    return null; // off-screen (at work / commuting)
  }
  // Common room selection with crowd avoidance, weighted against rooms
  // already at or above their soft comfort capacity.
  const candidates = COMMON_ROOMS.map(roomId => {
    const occCount = getPresentNpcIds(npcs, roomId).length;
    const capacity = ROOMS[roomId].capacity;
    const weight = occCount >= capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
    return { roomId, weight };
  });
  return weightedPick(rng, candidates, c => c.weight).roomId;
}

// --- Off-screen event resolution (deterministic, zero LLM) ---

function drawOffscreenEvent(rng, npcId, npc, otherNpcIds) {
  const evt = weightedPick(rng, OFFSCREEN_EVENTS);
  const data = {};
  if (evt.dataFields) {
    for (const field of evt.dataFields) {
      if (field === 'other' && otherNpcIds.length > 0) {
        data.other = weightedPick(rng, otherNpcIds.map(id => ({ id, weight: 1 }))).id;
      } else if (field === 'topic') {
        data.topic = weightedPick(rng, EVENT_FILL_DATA.topic.map(t => ({ val: t, weight: 1 }))).val;
      } else if (field === 'room') {
        data.room = weightedPick(rng, EVENT_FILL_DATA.room.map(t => ({ val: t, weight: 1 }))).val;
      } else {
        const pool = EVENT_FILL_DATA[field];
        if (pool) data[field] = weightedPick(rng, pool.map(t => ({ val: t, weight: 1 }))).val;
      }
    }
  }
  return {
    day: null, tick: null, roomId: null, // filled by caller
    npcId,
    type: evt.type,
    moodDelta: evt.moodDelta,
    data,
    template: evt.text,
    seenByPlayer: false,
  };
}

// Render a compact event record's template into readable text. Pure —
// shared by UI (narration log, room-entry evidence) and LLM (secondhand
// mentions in the scene prompt), which is why it lives here rather than in
// either of those sections.
function formatEventText(evt, npcs) {
  let text = evt.template || '';
  const npc = npcs[evt.npcId];
  const name = npc?.bible?.name || 'Someone';
  text = text.replace('{name}', name);
  if (evt.data) {
    for (const [k, v] of Object.entries(evt.data)) {
      if (typeof v === 'string') {
        if (k === 'other' && npcs[v]) {
          text = text.replace(`{${k}}`, npcs[v].bible?.name || 'someone');
        } else {
          text = text.replace(`{${k}}`, v);
        }
      }
    }
  }
  return text;
}

// Resolve all NPCs for a single tick (deterministic, zero LLM)
function resolveTick(gameState) {
  const { meta, npcs } = gameState;
  const rng = seededRng(meta.seed, `tick_${meta.clock.day}_${getTickIndex(meta.clock.minutes)}`);
  const newEvents = [];
  const npcUpdates = {};

  // Pass 1: resolve where everyone ends up THIS tick first, so pass 2's
  // social-need restoration can check who's actually sharing a room this
  // tick rather than where they were last tick.
  const resolved = {};
  for (const [id, npc] of Object.entries(npcs)) {
    if (npc.residency.status === 'former' || npc.residency.status === 'prospective') continue;

    const { block } = resolveScheduleActivity(npc, meta.clock);
    let location = null;
    let activity = block;

    if (block === 'sleep') {
      location = npc.residency.room;
      activity = 'sleeping';
    } else if (block === 'work' || block === 'commute' || block === 'commute_home') {
      location = null; // off-screen
      activity = ACTIVITY_TABLES[block] ? ACTIVITY_TABLES[block][0] : block;
    } else {
      location = resolveRoomForActivity(block, id, npcs, rng);
      const acts = ACTIVITY_TABLES[block] || ACTIVITY_TABLES.leisure;
      activity = acts[Math.floor(rng() * acts.length)];
    }

    resolved[id] = { block, location, activity };
  }

  // Pass 2: needs, events, mood — using this tick's resolved locations.
  for (const [id, npc] of Object.entries(npcs)) {
    if (!resolved[id]) continue;
    const { block, location, activity } = resolved[id];

    // Decay needs
    const needs = {
      hunger: Math.max(0, npc.needs.hunger - NEEDS.npcHungerDecay),
      hygiene: Math.max(0, npc.needs.hygiene - NEEDS.npcHygieneDecay),
      energy: Math.max(0, npc.needs.energy - NEEDS.npcEnergyDecay),
      social: Math.max(0, npc.needs.social - NEEDS.npcSocialDecay),
    };

    // Restore needs by schedule block — keyed to the block rather than the
    // (flavor-text) activity string, so needs actually trend back up
    // instead of only ever decaying toward zero.
    if (block === 'sleep') {
      needs.energy = Math.min(NEEDS.energy.max, needs.energy + NEEDS.npcSleepRestore);
    }
    if (block === 'morning' || block === 'evening') {
      needs.hunger = Math.min(NEEDS.hunger.max, needs.hunger + NEEDS.npcEatRestore);
    }
    if (block === 'morning' || block === 'wind_down') {
      needs.hygiene = Math.min(NEEDS.hygiene.max, needs.hygiene + NEEDS.npcHygieneRestore);
    }
    if (location) {
      const shareCount = Object.values(resolved).filter(r => r.location === location).length;
      if (shareCount > 1) needs.social = Math.min(NEEDS.npcSocialMax, needs.social + NEEDS.npcSocialRestore);
    }

    // Random event chance (weighted by stress + low needs)
    let moodDelta = 0;
    if (rng() < 0.15 && block !== 'sleep' && block !== 'work') {
      const otherIds = Object.keys(npcs).filter(oid => oid !== id && npcs[oid].residency.status === 'resident');
      const evt = drawOffscreenEvent(rng, id, npc, otherIds);
      evt.day = meta.clock.day;
      evt.tick = getTickIndex(meta.clock.minutes);
      evt.roomId = location; // null for off-screen (work/commute) events
      newEvents.push(evt);
      moodDelta = evt.moodDelta;
    }

    npcUpdates[id] = {
      location,
      activity,
      needs,
      mood: Math.max(-1, Math.min(1, npc.mood + moodDelta)),
    };
  }

  return { npcUpdates, newEvents };
}

// --- Batched time resolution (for sleep / long work blocks) ---
function resolveBatch(gameState, ticks) {
  const allEvents = [];
  let state = gameState;
  for (let i = 0; i < ticks; i++) {
    state = { ...state, meta: { ...state.meta, clock: advanceClock(state.meta.clock, 1) } };
    const result = resolveTick(state);
    allEvents.push(...result.newEvents);
    // Apply NPC updates
    const newNpcs = { ...state.npcs };
    for (const [id, update] of Object.entries(result.npcUpdates)) {
      newNpcs[id] = { ...newNpcs[id], ...update };
    }
    state = { ...state, npcs: newNpcs };
  }
  return { state, events: allEvents };
}

// --- Needs decay for player ---
// mood floors at -1, not 0 — it's the only need on a [-1, 1] scale (see
// NEEDS.mood config comment); the others are 0-100.
function decayPlayerNeeds(player, ticks) {
  return {
    ...player,
    energy: Math.max(0, player.energy - NEEDS.energy.decayPerTick * ticks),
    hunger: Math.max(0, player.hunger - NEEDS.hunger.decayPerTick * ticks),
    hygiene: Math.max(0, player.hygiene - NEEDS.hygiene.decayPerTick * ticks),
    mood: Math.max(-1, player.mood - NEEDS.mood.decayPerTick * ticks),
  };
}

// --- Rent computation ---
function computeRent(npcs) {
  const residents = Object.values(npcs).filter(n => n.residency.contributesRent && n.residency.status === 'resident');
  const count = Math.max(1, residents.length + 1); // +1 for player
  return {
    total: ECONOMY.rent.total,
    perResident: Math.ceil(ECONOMY.rent.total / count),
    contributorCount: count,
  };
}

// --- Residency transitions ---
// Move an NPC into a room, assigning residency.bed to the first free slot
// ('A' before 'B') among the room's current residents when no bed is
// specified. Bedroom occupancy is read from residency.room/bed across
// npcs — the previous version read ROOMS[roomId].occupants, a field that
// has never existed on the static CONFIG room definitions, so bed
// assignment always silently fell through to 'B'.
function moveToRoom(npcId, npc, roomId, npcs, bed) {
  const bedTaken = new Set(
    Object.entries(npcs || {})
      .filter(([id, n]) => id !== npcId && n.residency.room === roomId && n.residency.status !== 'former')
      .map(([, n]) => n.residency.bed)
  );
  const assignedBed = bed || (bedTaken.has('A') ? 'B' : 'A');
  return {
    ...npc,
    residency: { ...npc.residency, room: roomId, bed: assignedBed },
    location: roomId,
  };
}

function changeResidencyStatus(npc, status, opts) {
  const contributesRent = opts?.contributesRent ?? (status === 'resident');
  return {
    ...npc,
    residency: {
      ...npc.residency,
      status,
      since: opts?.since ?? npc.residency.since,
      partnerOf: opts?.partnerOf ?? npc.residency.partnerOf,
      contributesRent,
    },
  };
}

// --- Scene participation management ---

// Determine active vs ambient NPCs in player's room. Active always starts
// populated (up to SCENE.maxActiveNpcs) rather than empty — an always-empty
// active set here was a dead end: doPlayerAction/free-text with nobody
// active sends the LLM a prompt with zero valid speakers, so
// validateProposal rejects every dialogue line and conversation can never
// start without first clicking an explicit "Talk to" chip. Whoever the
// player has the best relationship with (least tense, most affection)
// engages first, a reasonable default for who'd naturally speak up.
function getSceneParticipants(player, npcs, world) {
  const roomId = player.location;
  const presentNpcIds = getPresentNpcIds(npcs, roomId);
  const sorted = [...presentNpcIds].sort((a, b) => {
    const scoreA = (npcs[a].relPlayer.affection || 0) - (npcs[a].relPlayer.tension || 0);
    const scoreB = (npcs[b].relPlayer.affection || 0) - (npcs[b].relPlayer.tension || 0);
    return scoreB - scoreA;
  });
  return {
    present: presentNpcIds,
    active: sorted.slice(0, SCENE.maxActiveNpcs),
    ambient: sorted.slice(SCENE.maxActiveNpcs),
    engagement: {},
  };
}

// ===== HOUSE GENERATION (deterministic) =====

// Full house generation: structured draws + constraint satisfaction.
// `partials` (optional) is an array, index-aligned with residents, of
// per-character partial-authoring objects (see rollCastSlot) — this is
// what lets "guided" and "manual" creation reuse the exact same generator
// as "full random" (partials = [] or omitted).
function SIM_generateHouse(seed, residentCount, partials) {
  const actualSeed = seed || genSeed();
  const clock = { day: 1, weekday: 0, minutes: CLOCK.startMinutes, phase: getPhase(CLOCK.startMinutes) };

  // Generate residents
  let bestCast = null;
  let bestScore = -1;
  let attempts = 0;
  const maxAttempts = CHAR_GEN.maxAttempts;
  let droppedConstraints = [];

  while (attempts < maxAttempts) {
    attempts++;
    const cast = generateCast(actualSeed, residentCount, attempts, partials);
    const score = scoreCast(cast, residentCount);
    if (score.quality > bestScore) {
      bestScore = score.quality;
      bestCast = cast;
      droppedConstraints = score.dropped || [];
    }
    if (score.quality >= getQualityThreshold(residentCount) && score.dropped.length === 0) break;
  }

  // Build game state from best cast
  return buildGameState(actualSeed, bestCast, clock, droppedConstraints);
}

function getQualityThreshold(residentCount) {
  if (residentCount <= 1) return CAST_CONSTRAINTS.tier1.qualityThreshold;
  if (residentCount <= 3) return CAST_CONSTRAINTS.tier2.qualityThreshold;
  return CAST_CONSTRAINTS.tier3.qualityThreshold;
}

// --- Single-slot roll, with optional partial authoring ---
// Rolls one character deterministically from `seed`/`slotIndex`/`attempt`,
// with a bounded number of reroll attempts (CHAR_GEN.maxAttempts) — an
// unbounded "i--; continue" here was a real infinite-loop risk if a pool
// ever produced a persistently-invalid draw.
//
// `partial` (optional) is any subset of: occupationCategory, temperament
// (per-axis), interests (array of names), values (array of 2 names),
// baggage, wound, want, blindSpot, boundary, name. Whatever is supplied is
// held fixed; everything else is rolled — this is the mechanism behind
// authorCharacter: "full random" is authorCharacter with partial={}, and
// "manual" is authorCharacter with everything filled. Same function either
// way, matching the brief's collapse of the four generation modes into one
// underlying path.
//
// Interest-tag pairwise overlap (brief §7.1: "no two share more than one
// interest tag") is a *preference* when interests are rolled, not a hard
// gate: with a ~22-entry pool where one tag ("indoor") appears on more than
// half the entries, requiring full compliance across a 6-8 person
// household is often unsatisfiable by chance within any reasonable retry
// budget. Per §7.4, "character creation must never hard-fail" — so a roll
// prefers a tag-compliant draw but falls back to the best schema-valid
// draw seen rather than asserting. A player's explicitly-authored
// interests are never second-guessed by this heuristic.
function rollCastSlot(seed, slotIndex, npcId, attempt, usedOccupationCats, priorTagSets, partial) {
  partial = partial || {};
  let fallbackNormalized = null;
  let fallbackOccCategory = null;

  for (let rollAttempt = 1; rollAttempt <= CHAR_GEN.maxAttempts; rollAttempt++) {
    const charRng = seededRng(seed, `char_${slotIndex}_${attempt}_${rollAttempt}`);

    // Occupation: forced to the authored category if given, else no
    // shared categories across the cast.
    let occ;
    if (partial.occupationCategory) {
      const forced = OCCUPATION_POOL.filter(o => o.category === partial.occupationCategory);
      occ = weightedPick(charRng, forced.length > 0 ? forced : OCCUPATION_POOL);
    } else {
      const availableOccs = OCCUPATION_POOL.filter(o => !usedOccupationCats.has(o.category));
      occ = weightedPick(charRng, availableOccs.length > 0 ? availableOccs : OCCUPATION_POOL);
    }

    // Temperament axes, per-axis override. Whether the resulting cast
    // spans a meaningful range is a cast-level property, checked in
    // scoreCast.
    const pt = partial.temperament || {};
    const temperament = {
      warmth:            pt.warmth            ?? rollAxis(charRng),
      volatility:        pt.volatility        ?? rollAxis(charRng),
      openness:          pt.openness          ?? rollAxis(charRng),
      conscientiousness: pt.conscientiousness ?? rollAxis(charRng),
      assertiveness:     pt.assertiveness     ?? rollAxis(charRng),
      selfAwareness:     pt.selfAwareness     ?? rollAxis(charRng),
    };

    // Interests (2-3): authored list if given, else prefer entries fully
    // disjoint from every already-committed castmate's tags — steering
    // toward compliance up front catches far more casts than blind
    // resampling alone would, given how concentrated the pool is.
    const authoredInterests = (partial.interests || [])
      .map(name => INTEREST_POOL.find(i => i.name === name))
      .filter(Boolean);
    let interests;
    if (authoredInterests.length > 0) {
      interests = authoredInterests;
    } else {
      const numInterests = 2 + Math.floor(charRng() * 2);
      const disjointPool = INTEREST_POOL.filter(intr => !intr.tags.some(t => priorTagSets.some(ps => ps.has(t))));
      const interestPool = disjointPool.length >= numInterests ? disjointPool : INTEREST_POOL;
      interests = pickUnique(charRng, interestPool, numInterests);
    }

    // Values (2, with opposition)
    const authoredValues = (partial.values || [])
      .map(name => VALUES_POOL.find(v => v.name === name))
      .filter(Boolean);
    const values = authoredValues.length === 2 ? authoredValues : pickUnique(charRng, VALUES_POOL, 2);

    // Baggage, wound, want, blindSpot, boundary — authored value if given
    const baggage = partial.baggage || weightedPick(charRng, BAGGAGE_POOL.map(x => ({ val: x, weight: 1 }))).val;
    const wound = partial.wound || weightedPick(charRng, WOUND_POOL.map(x => ({ val: x, weight: 1 }))).val;
    const want = partial.want || weightedPick(charRng, WANT_POOL.map(x => ({ val: x, weight: 1 }))).val;
    const blindSpot = partial.blindSpot || weightedPick(charRng, BLINDSPOT_POOL.map(x => ({ val: x, weight: 1 }))).val;
    const boundary = partial.boundary || weightedPick(charRng, BOUNDARY_POOL.map(x => ({ val: x, weight: 1 }))).val;

    // Speech profile — not author-overridable in the UI yet, always rolled
    const speech = {
      verbosity: charRng(),
      formality: charRng(),
      humorStyle: weightedPick(charRng, HUMOR_STYLES.map(x => ({ val: x, weight: 1 }))).val,
      profanityLevel: charRng(),
      verbalTics: pickUnique(charRng, VERBAL_TICS, 1 + Math.floor(charRng() * 2)),
      textingStyle: weightedPick(charRng, TEXTING_STYLES.map(x => ({ val: x, weight: 1 }))).val,
    };

    // Build structured character (name/visual/history/sketch/sampleLines
    // are prose, expanded later by LLM — except name, which the player may
    // author directly).
    const structured = {
      npcId,
      name: partial.name || '',
      visual: '',
      genSeed: Math.floor(charRng() * 1000000),
      history: '',
      temperament,
      occupation: occ,
      interests: interests.map(x => ({ name: x.name, tags: x.tags })),
      values: values.map(v => ({ name: v.name, opposition: v.opposition })),
      baggage,
      wound,
      want,
      blindSpot,
      boundary,
      speech,
      scheduleTemplate: occ.scheduleTemplate,
      sketch: '',
      sampleLines: [],
    };

    const result = validateCharacter({ bible: structured });
    if (!result.valid) {
      console.warn(`Character slot ${slotIndex} failed validation on roll ${rollAttempt} (cast attempt ${attempt})`, result.errors);
      continue;
    }

    // Schema-valid. Keep the first one as a fallback in case no
    // tag-compliant draw turns up within budget.
    if (!fallbackNormalized) {
      fallbackNormalized = result.normalized;
      fallbackOccCategory = occ.category;
    }

    // The tag-overlap preference only applies to rolled interests — an
    // authored list is the player's explicit choice and is never rerolled
    // out from under them.
    if (authoredInterests.length === 0) {
      const tagSet = new Set(interests.flatMap(x => x.tags));
      const violatesTagOverlap = priorTagSets.some(priorSet => {
        let overlap = 0;
        for (const t of tagSet) if (priorSet.has(t)) overlap++;
        return overlap > 1;
      });
      if (violatesTagOverlap) continue;
    }

    return { normalized: result.normalized, occCategory: occ.category };
  }

  if (fallbackNormalized) {
    console.warn(`Character slot ${slotIndex} could not satisfy interest-tag overlap within ${CHAR_GEN.maxAttempts} rolls; using best schema-valid draw instead`, { seed, attempt, slot: slotIndex });
    return { normalized: fallbackNormalized, occCategory: fallbackOccCategory };
  }

  // No schema-valid draw at all in the whole budget — unlike the tag
  // preference above, this indicates an actual generation bug (types/
  // ranges wrong by construction), worth surfacing loudly in dev.
  assert(false, `Character slot ${slotIndex} produced no schema-valid draw after ${CHAR_GEN.maxAttempts} rolls`, { seed, attempt, slot: slotIndex });
  return null;
}

// --- Cast generation ---
// Rolls `count` characters deterministically from `seed` via rollCastSlot.
// Occupation-category exclusion is only committed to the shared tracker
// once a slot's draw is accepted, so a rejected attempt for slot i never
// wrongly excludes a category from slot i's own retry or from later slots.
function generateCast(seed, count, attempt, partials) {
  const npcs = {};
  const usedOccupationCats = new Set();
  const npcIds = [];

  for (let i = 0; i < count; i++) {
    const npcId = genSeededNpcId(seed, i);
    const priorTagSets = npcIds.map(id => new Set(npcs[id].bible.interests.flatMap(x => x.tags)));
    const partial = (partials && partials[i]) || {};

    const rolled = rollCastSlot(seed, i, npcId, attempt, usedOccupationCats, priorTagSets, partial);
    if (!rolled) continue; // best-effort: this slot stays empty; scoreCast rates the cast accordingly

    usedOccupationCats.add(rolled.occCategory);
    npcs[npcId] = createNpcFromBible(rolled.normalized.bible, 'resident');
    npcIds.push(npcId);
  }

  // Relational pass
  const castWeb = generateCastWeb(seed, attempt, npcIds, npcs);

  // Assign rooms
  const bedrooms = ['bedroom_1', 'bedroom_2', 'bedroom_3'];
  let bedIdx = 0;
  for (const id of npcIds) {
    const room = bedrooms[bedIdx % bedrooms.length];
    npcs[id].residency.room = room;
    npcs[id].residency.bed = 'A';
    npcs[id].location = room;
    bedIdx++;
  }

  return { npcs, npcIds, castWeb };
}

// Reroll a single slot within an already-generated cast, respecting the
// OTHER members' occupation/interest constraints — everyone else stays
// fixed. Used by the character-creation preview's per-character reroll
// button. rerollAttempt should change on each successive reroll of the
// same slot so it doesn't return the identical draw.
function rerollCastSlot(seed, slotIndex, npcs, npcIds, rerollAttempt, partial) {
  const npcId = npcIds[slotIndex];
  const usedOccupationCats = new Set();
  const priorTagSets = [];
  npcIds.forEach((id, idx) => {
    if (idx === slotIndex) return;
    usedOccupationCats.add(npcs[id].bible.occupation.category);
    priorTagSets.push(new Set(npcs[id].bible.interests.flatMap(x => x.tags)));
  });
  return rollCastSlot(seed, slotIndex, npcId, `reroll${rerollAttempt}`, usedOccupationCats, priorTagSets, partial);
}

// Roll a temperament axis value, biased to span a range across the cast
// Roll a single temperament axis value, uniformly across [-1, 1]. Whether
// the resulting cast actually spans a meaningful range across all its
// members is a cast-level property, checked in scoreCast via the
// temperamentSpread requirement — a single axis roll can't guarantee it.
function rollAxis(rng) {
  return Math.max(-1, Math.min(1, rng() * 2 - 1));
}

// --- Cast web generation (relational pass) ---
function generateCastWeb(seed, attempt, npcIds, npcs) {
  const web = {};
  const webRng = seededRng(seed, `castweb_${attempt}`);

  for (let i = 0; i < npcIds.length; i++) {
    for (let j = i + 1; j < npcIds.length; j++) {
      const a = npcIds[i];
      const b = npcIds[j];
      const pairKey = [a, b].sort().join('|');

      // Prior relationship
      const met = weightedPick(webRng, HOW_THEY_MET_POOL.map(x => ({ val: x, weight: 1 }))).val;
      const whoFirst = webRng() < 0.5 ? a : b;
      const known = 1 + Math.floor(webRng() * 12); // months

      // Asymmetric axes
      const axesAtoB = {
        trust: webRng() * 2 - 1,
        affection: webRng() * 2 - 1,
        tension: webRng() * 2 - 1,
        respect: webRng() * 2 - 1,
      };
      const axesBtoA = {
        trust: webRng() * 2 - 1,
        affection: webRng() * 2 - 1,
        tension: webRng() * 2 - 1,
        respect: webRng() * 2 - 1,
      };

      // Shared beat (positive or negative)
      const beatPositive = webRng() < 0.5;
      const beatPool = beatPositive ? SHARED_BEAT_POSITIVE : SHARED_BEAT_NEGATIVE;
      const sharedBeat = weightedPick(webRng, beatPool.map(x => ({ val: x, weight: 1 }))).val;

      // Compatibility and friction
      const compat = computeCompatibility(npcs[a], npcs[b]);
      const friction = computeFriction(npcs[a], npcs[b]);

      web[pairKey] = {
        priorRel: { known, met, whoFirst },
        axes: { [`${a}→${b}`]: axesAtoB, [`${b}→${a}`]: axesBtoA },
        sharedBeat,
        beatPositive,
        compatibility: compat,
        friction,
      };
    }
  }

  return web;
}

function computeCompatibility(npcA, npcB) {
  // Shared interests
  const tagsA = new Set(npcA.bible.interests.flatMap(i => i.tags));
  const tagsB = new Set(npcB.bible.interests.flatMap(i => i.tags));
  const shared = [...tagsA].filter(t => tagsB.has(t)).length;
  // Temperament similarity (Euclidean distance, normalized)
  const tA = npcA.bible.temperament, tB = npcB.bible.temperament;
  const dist = Math.sqrt(
    Math.pow(tA.warmth - tB.warmth, 2) +
    Math.pow(tA.volatility - tB.volatility, 2) +
    Math.pow(tA.openness - tB.openness, 2)
  );
  const tempSim = Math.max(0, 1 - dist / 3.46); // 3.46 = sqrt(6*2)
  return Math.min(1, (shared * 0.2) + (tempSim * 0.6));
}

function computeFriction(npcA, npcB) {
  // Values opposition
  let valFriction = 0;
  for (const va of npcA.bible.values) {
    for (const vb of npcB.bible.values) {
      if (va.opposition === vb.name || vb.opposition === va.name) valFriction += 0.4;
    }
  }
  // Volatility distance
  const volDiff = Math.abs(npcA.bible.temperament.volatility - npcB.bible.temperament.volatility);
  return Math.min(1, valFriction + volDiff * 0.5);
}

// --- Cast-level requirement checkers ---
// One checker per requirement name referenced from CAST_CONSTRAINTS in
// CONFIG. scoreCast reads which requirements apply from there instead of
// hardcoding a per-tier if/else, so tuning which requirements gate which
// household size is a CONFIG change, not a code change.
const CAST_REQUIREMENT_CHECKERS = {
  strongWant: (cast) => cast.npcIds.every(id => cast.npcs[id].bible.want && cast.npcs[id].bible.want.length > 20),
  sharpWound: (cast) => cast.npcIds.every(id => cast.npcs[id].bible.wound && cast.npcs[id].bible.wound.length > 15),
  liveBlindSpot: (cast) => cast.npcIds.every(id => cast.npcs[id].bible.blindSpot && cast.npcs[id].bible.blindSpot.length > 15),

  frictionPair: (cast) => Object.values(cast.castWeb).some(pair => pair.friction > 0.3),
  asymmetricRelationship: (cast) => Object.entries(cast.castWeb).some(([pairKey, pair]) => {
    const [a, b] = pairKey.split('|');
    const ab = pair.axes[`${a}→${b}`], ba = pair.axes[`${b}→${a}`];
    return Math.abs(ab.trust - ba.trust) > 0.3 || Math.abs(ab.affection - ba.affection) > 0.3;
  }),

  // §7.1: temperament axes must span a range across the cast, and at least
  // one member must be clearly high-volatility and one clearly low.
  // Meaningless below 2 residents — vacuously true there.
  temperamentSpread: (cast) => {
    if (cast.npcIds.length < 2) return true;
    const axes = ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness'];
    const ranges = axes.map(axis => {
      const vals = cast.npcIds.map(id => cast.npcs[id].bible.temperament[axis]);
      return Math.max(...vals) - Math.min(...vals);
    });
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const volVals = cast.npcIds.map(id => cast.npcs[id].bible.temperament.volatility);
    const hasHighVol = Math.max(...volVals) >= CHAR_GEN.volatilityHighLowThreshold;
    const hasLowVol = Math.min(...volVals) <= -CHAR_GEN.volatilityHighLowThreshold;
    return avgRange >= CHAR_GEN.minTemperamentSpread && hasHighVol && hasLowVol;
  },

  unresolvedConflict: (cast) => Object.values(cast.castWeb).some(pair => pair.friction > 0.4 && !pair.beatPositive),
  alliance: (cast) => Object.values(cast.castWeb).some(pair => pair.compatibility > 0.5 && pair.beatPositive),
  secret: (cast) => cast.npcIds.some(id => cast.npcs[id].bible.baggage && cast.npcs[id].bible.baggage.length > 20),
  obstructingWant: (cast) => {
    const wants = cast.npcIds.map(id => cast.npcs[id].bible.want);
    for (let i = 0; i < wants.length; i++) {
      for (let j = i + 1; j < wants.length; j++) {
        if (wants[i] && wants[j] && (wants[i] === wants[j] || shareKeywords(wants[i], wants[j]))) return true;
      }
    }
    return false;
  },
};

// Weight a requirement by its position in CHAR_GEN.constraintRelaxOrder:
// later in that list = more important to keep = higher weight. A
// requirement not listed there (e.g. tier1's individual-quality checks, or
// temperamentSpread) gets a fixed mid weight.
function requirementWeight(req) {
  const idx = CHAR_GEN.constraintRelaxOrder.indexOf(req);
  return idx >= 0 ? idx + 1 : 2;
}

// --- Cast scoring and constraint evaluation ---
// Weighted fraction of applicable requirements satisfied. dropped[] is
// returned sorted least-important-first, so a caller giving up on
// requirements (SIM_generateHouse picks the best-scoring of maxAttempts)
// is implicitly relaxing in the priority order CHAR_GEN.constraintRelaxOrder
// defines, without needing a separate iterative-relaxation search.
function scoreCast(cast, residentCount) {
  const tierKey = residentCount <= 1 ? 'tier1' : residentCount <= 3 ? 'tier2' : 'tier3';
  const requirements = CAST_CONSTRAINTS[tierKey].requirements;
  const dropped = [];
  let earned = 0;
  let possible = 0;

  for (const req of requirements) {
    const checker = CAST_REQUIREMENT_CHECKERS[req];
    if (!checker) {
      console.warn(`No checker registered for cast requirement: ${req}`);
      continue;
    }
    const w = requirementWeight(req);
    possible += w;
    if (checker(cast)) earned += w;
    else dropped.push(req);
  }

  dropped.sort((a, b) => requirementWeight(a) - requirementWeight(b));
  const quality = possible > 0 ? earned / possible : 1;
  return { quality, dropped };
}

function shareKeywords(a, b) {
  const words = a.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const other = b.toLowerCase();
  return words.some(w => other.includes(w));
}

// --- Build full game state from cast ---
function buildGameState(seed, cast, clock, droppedConstraints) {
  const { npcs, npcIds, castWeb } = cast;

  // Room shell state (cleanliness/objects/lastEvent). Presence is never
  // stored here — it's derived live from npc.location via getPresentNpcIds.
  // NPCs' starting location was already set to their assigned bedroom in
  // generateCast; the player starts in bedroom_player (set below).
  const rooms = {};
  for (const roomId of ALL_ROOMS) {
    rooms[roomId] = { capacity: ROOMS[roomId].capacity, cleanliness: 50, objects: [], lastEvent: null };
  }

  // Seed episode logs with backdated shared-history beats
  for (const [pairKey, pair] of Object.entries(castWeb)) {
    const [a, b] = pairKey.split('|');
    const beatText = pair.sharedBeat;
    const beatType = pair.beatPositive ? 'positive' : 'negative';
    for (const npcId of [a, b]) {
      npcs[npcId].memory.episodes.push({
        day: 0, // backdated
        text: `With ${npcs[npcId === a ? b : a].bible.name || npcId}: ${beatText}`,
        decay: 1.0,
      });
    }
  }

  // Rent
  const rent = computeRent(npcs);

  // Player state
  const player = {
    money: ECONOMY.startingMoney,
    energy: 100,
    hunger: 80,
    hygiene: 100,
    mood: 0.2, // [-1, 1] scale — see NEEDS.mood config comment. 0.2 mirrors the old 60/100 starting mood at the same relative position.
    skills: {},
    inventory: [],
    location: 'bedroom_player',
    flags: {},
    // Nothing is owed until the first due date actually passes — see
    // UI's processRentForDay, which charges rent every ECONOMY.payPeriodDays
    // and applies escalating consequences while a balance stands.
    rentOwed: 0,
    rentDueDay: 1 + ECONOMY.payPeriodDays,
  };

  return {
    seed,
    clock,
    structuralHash: hashStr(seed + JSON.stringify(npcIds)),
    player,
    npcs,
    npcIds, // slot order, preserved explicitly rather than relied on via
            // Object.keys(npcs) iteration order — used by the character-
            // creation preview to render/reroll characters in roll order.
    world: {
      rooms,
      castWeb,
      quests: { active: [], completed: [] },
      events: [],
      deliveries: [],
      rent,
    },
    droppedConstraints,
  };
}

// --- Create NPC object from validated bible ---
function createNpcFromBible(bible, residencyStatus) {
  return {
    bible,
    bibleRevision: 0,
    bibleChanges: [],
    residency: {
      status: residencyStatus || 'resident',
      room: null,
      bed: null,
      partnerOf: null,
      since: 1,
      contributesRent: residencyStatus === 'resident' || residencyStatus === undefined,
    },
    location: null,
    activity: '',
    mood: 0,
    needs: { hunger: 50, hygiene: 50, energy: 50, social: 50 },
    relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0 },
    memory: { facts: [], episodes: [], summary: '' },
    arcs: [],
    flags: {},
  };
}

// ===== /SECTION: SIM =====
