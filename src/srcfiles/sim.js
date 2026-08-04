// ===== SECTION: SIM =====
// Pure functions: clock, schedules, off-screen resolution, needs, rent, residency.
// No DOM, no kv, no LLM. All fns take state → return state or deltas.
// (Apartment Expansion v2 — Mirrored H)

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

// Phase 0: deterministic gender assignment from the weighted enum, used
// by rollCastSlot and stub generation. Overrides via partial.gender
// (character studio) skip the roll entirely.
function rollGender(rng) {
  const weights = CHAR_GEN.genderWeights;
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [g, w] of entries) {
    r -= w;
    if (r <= 0) return g;
  }
  return entries[entries.length - 1][0];
}

// Phase 0: deterministic age roll within CHAR_GEN.ageRange, with a small
// bias toward the middle of the range for a more natural distribution.
function rollAge(rng) {
  const [min, max] = CHAR_GEN.ageRange;
  const span = max - min;
  const bias = (rng() + rng()) / 2;
  return Math.round(min + bias * span);
}

// --- Clock functions ---

function getWeekday(day) {
  return ((day - 1) % 7); // 0=Mon, 6=Sun
}

function isWeekend(day) {
  return getWeekday(day) >= 5;
}

// --- Calendar helpers (Phase 1) ---
// Layered on top of getWeekday — day-of-week is unchanged; the year is a
// 360-day cycle of 4 quarters/seasons. All are pure functions of `day`,
// so callers never need to hold a separate calendar object.

// Quarter index 0-3 for a given day. Days are 1-indexed, so day 1 is in
// quarter 0; day 90 is the last day of quarter 0; day 91 starts quarter 1.
function getQuarter(day) {
  return Math.floor((day - 1) / CALENDAR.daysPerQuarter) % 4;
}

// True on the last day of each quarter (days 90, 180, 270, 360/0 mod year).
// Taxes bill here.
function isQuarterEnd(day) {
  return ((day % CALENDAR.daysPerQuarter) === 0);
}

// Day index within the current quarter, 1-90.
function getQuarterDay(day) {
  return ((day - 1) % CALENDAR.daysPerQuarter) + 1;
}

// Season aligned 1:1 with quarters: spring/summer/autumn/winter.
function getSeason(day) {
  return CALENDAR.seasons[getQuarter(day)];
}

// Year number since the start of the game — day 1 is year 1. Mostly so
// quarterly taxes and seasonal utilities carry a long-run count.
function getYear(day) {
  return Math.floor((day - 1) / CALENDAR.daysPerYear) + 1;
}

// --- Recurring obligation helper (Phase 1) ---
// The "due on day N, then reschedule" shape was duplicated across
// hireService/processServiceVisitsForDay (cleaning visits), rent
// (player.rentDueDay) and work deadlines. The bill system (Phase 3) and
// the gig board (Phase 2) reuse the same pattern, so it lives here as a
// small helper rather than being reimplemented each time.
//
// Given a `dueDay` and a `cadenceDays`, returns the next due day at or
// after `day` if today is a due day, else null. Callers keep their own
// state (the `nextDay`/`dueDay` field) and use this to decide whether to
// fire; rescheduling is just `dueDay + cadenceDays`.
function isDueToday(dueDay, day) {
  return day >= dueDay;
}
function rescheduleDue(dueDay, cadenceDays) {
  return dueDay + cadenceDays;
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
  const total = Math.floor(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 24h hour (0-23) -> "6:00 am" / "12:00 pm". Shared by the alarm HUD status
// (RENDER), doSetAlarm's confirmation line (UI), and the Clock app
// (RENDER.PHONE) so all three agree — was drifting toward three separate
// copies of the same formula.
function formatHour12(hour) {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'am' : 'pm';
  return `${h12}:00 ${ampm}`;
}

function formatDate(day) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Render a real in-fiction date: weekday + month + day-of-month +
  // year. The month/day cycle is cosmetic (30-day months), so this is
  // "Wed Mar 24, Year 1" instead of "Wed Day 84". Keeps the weekday
  // prefix (schedules read it) while giving the year a shape.
  const doy = ((day - 1) % CALENDAR.daysPerYear);          // 0-359
  const monthIdx = Math.floor(doy / CALENDAR.daysPerMonth);
  const dom = (doy % CALENDAR.daysPerMonth) + 1;
  const year = getYear(day);
  return `${weekdays[getWeekday(day)]} ${CALENDAR.monthNames[monthIdx]} ${dom}, Year ${year}`;
}

function advanceClock(clock, ticks) {
  let { day, minutes } = clock;
  minutes = Math.floor(minutes) + ticks * CLOCK.tickMinutes;
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

// --- Player vulnerable state (Phase 6): determines what an NPC can peep
// at. Returns a state key from the player's current activity + context, or
// null if the player isn't in a vulnerable state. The AfterHours session's
// DERIVED active-ness (isAfterHoursSessionActive — device in use or not,
// Phase 5.5) is the masturbating signal; player.location + schedule/
// clothing covers the rest. ---
function getPlayerVulnerableState(gameState) {
  // Masturbating (AfterHours session) — a real, explicit state the player
  // enters and leaves deliberately. Derived, not a stored flag: pocketing
  // the phone, locking it, battery death or a power loss all make
  // isAfterHoursSessionActive return false with no force-clear call to
  // forget (landmine L11).
  if (isAfterHoursSessionActive(gameState)) return 'masturbating';

  // Everything else reads an explicit, transient flag set for the duration
  // of the action that causes it: ACTIONS' executeAction sets it from the
  // action's `vulnerableState` (self.shower → 'showering') and clears it
  // when the action resolves; doSleep does the same around its batch.
  //
  // This deliberately replaces the old location-and-phase inference, which
  // was far too eager: *standing* anywhere in a bathroom counted as
  // showering and standing in your own bedroom after dark counted as
  // sleeping, so NPCs peeped on a fully-dressed player walking through.
  // Being somewhere is not the same as being vulnerable there.
  const flagged = gameState.player.flags?._vulnerableState;
  if (flagged) return flagged;

  return null;
}

// --- Player perception (Phase 6): how likely the player is to notice an
// NPC peeping. Derived from energy and mood, not a learnable skill. ---
function getPlayerPerception(player) {
  const cfg = NPC_PEEP_TUNING.perception;
  let p = cfg.base;
  if (player.energy > 70) p += cfg.energyHighBonus;
  if (player.energy < 20) p -= cfg.energyLowPenalty;
  if (player.mood < -0.5) p -= cfg.moodLowPenalty;
  return Math.max(cfg.min, Math.min(cfg.max, p));
}

// --- Pathfinding (Phase 4) ---

// BFS shortest path on the room adjacency graph. The graph is tiny (17
// nodes) so this is trivial and always fast. Returns an array of room IDs
// [fromRoom, ..., toRoom], or null if no path (shouldn't happen — the
// graph is connected). The path includes both endpoints.
function findPath(fromRoom, toRoom) {
  if (fromRoom === toRoom) return [fromRoom];
  const adj = ROOM_ADJACENCY;
  const queue = [fromRoom];
  const visited = new Set([fromRoom]);
  const parent = new Map();
  while (queue.length > 0) {
    const room = queue.shift();
    const neighbors = adj[room] || [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, room);
      if (n === toRoom) {
        const path = [n];
        let cur = room;
        while (cur !== fromRoom) {
          path.unshift(cur);
          cur = parent.get(cur);
        }
        path.unshift(fromRoom);
        return path;
      }
      queue.push(n);
    }
  }
  return null;
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
  let currentBlock = 'leisure';
  let currentWeight = 0.5;
  for (const [blockName, ranges] of Object.entries(sched)) {
    for (const [start, end, weight] of ranges) {
      if (tick >= start && tick < end) {
        currentBlock = blockName;
        currentWeight = weight;
        break;
      }
    }
  }

  // NPC Overhaul Phase 7.2 — find the NEXT block + estimated return time
  let nextBlock = '';
  let willReturnAt = null;
  const sortedBlocks = [];
  for (const [blockName, ranges] of Object.entries(sched)) {
    for (const [start, end] of ranges) {
      sortedBlocks.push({ blockName, start, end });
    }
  }
  sortedBlocks.sort((a, b) => a.start - b.start);
  const currentEntry = sortedBlocks.find(e => e.blockName === currentBlock);
  if (currentEntry) {
    // Find the next different block after current ends
    const nextEntry = sortedBlocks.find(e => e.blockName !== currentBlock && e.start >= currentEntry.end);
    if (nextEntry) {
      nextBlock = nextEntry.blockName;
      // If current or next is work/commute, compute return time
      // NPC Overhaul Audit Fix: willReturnAt should be when the NPC
      // arrives HOME (end of commute_home block), not when work ends.
      if (currentBlock === 'work' || currentBlock === 'commute_home' || nextBlock === 'work') {
        const commuteHomeBlock = sortedBlocks.find(e => e.blockName === 'commute_home');
        if (commuteHomeBlock) {
          willReturnAt = commuteHomeBlock.end * 30; // when they arrive home
        } else {
          const workBlock = sortedBlocks.find(e => e.blockName === 'work');
          if (workBlock) willReturnAt = workBlock.end * 30; // fallback: end of work
        }
      }
    }
  }

  return { block: currentBlock, weight: currentWeight, nextBlock, willReturnAt };
}

// Determine which room an NPC should be in for a given activity block.
// Phase 5: activity-aware routing. Picks an activity string, then routes
// the NPC to the preferred room for that activity. Falls back to
// crowd-avoidance random pick among all common rooms.
// Returns { location, activity } — the activity is picked here so the
// room preference and activity string can't disagree.
function resolveRoomForActivity(block, npcId, npcs, rng) {
  if (block === 'sleep') {
    return { location: null, activity: 'sleeping' };
  }
  if (block === 'work' || block === 'commute' || block === 'commute_home') {
    return { location: null, activity: ACTIVITY_TABLES[block] ? ACTIVITY_TABLES[block][0] : block };
  }

  // Pick the activity string first so we can route by it
  const acts = ACTIVITY_TABLES[block] || ACTIVITY_TABLES.leisure;
  const activity = acts[Math.floor(rng() * acts.length)];

  // Check if this activity has a room preference
  const pref = ACTIVITY_ROOM_PREFERENCES[activity];
  if (pref === null) {
    return { location: null, activity }; // stay in current room
  }
  let targetRoom = null;
  if (pref) {
    const candidates = Array.isArray(pref) ? pref : [pref];
    const valid = candidates.filter(r => {
      if (!ROOMS[r]) return false;
      if (r === 'bedroom_player') return false;
      if (ROOMS[r].type === 'bedroom') {
        const npc = npcs[npcId];
        if (npc?.residency?.room !== r) return false;
      }
      return true;
    });
    if (valid.length > 0) {
      const weighted = valid.map(roomId => {
        const occCount = getPresentNpcIds(npcs, roomId).length;
        const capacity = ROOMS[roomId].capacity;
        const weight = occCount >= capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
        return { roomId, weight };
      });
      targetRoom = weightedPick(rng, weighted, c => c.weight).roomId;
    }
  }

  // Fallback: crowd-avoidance random pick among all common rooms
  if (!targetRoom) {
    const candidates = COMMON_ROOMS.map(roomId => {
      const occCount = getPresentNpcIds(npcs, roomId).length;
      const capacity = ROOMS[roomId].capacity;
      const weight = occCount >= capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
      return { roomId, weight };
    });
    targetRoom = weightedPick(rng, candidates, c => c.weight).roomId;
  }

  return { location: targetRoom, activity };
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
    let transit = npc.transit || null;

    if (block === 'sleep') {
      location = npc.residency.room;
      activity = 'sleeping';
      transit = null;
    } else if (block === 'work' || block === 'commute' || block === 'commute_home') {
      location = null; // off-screen
      activity = ACTIVITY_TABLES[block] ? ACTIVITY_TABLES[block][0] : block;
      transit = null;
    } else {
      // If already in transit, keep heading to the same destination rather
      // than picking a new random activity/room each tick (which would make
      // the NPC forever restart their journey and never arrive).
      const { location: target, activity: pickedActivity } = resolveRoomForActivity(block, id, npcs, rng);
      if (npc.transit) {
        // Continue toward the existing destination
        const existingTarget = npc.transit.destination;
        activity = pickedActivity;
        let path = npc.transit.path;
        let step = npc.transit.progress || 0;
        if (path && existingTarget) {
          const nextStep = Math.min(step + 1, path.length - 1);
          location = path[nextStep];
          if (nextStep < path.length - 1) {
            activity = `heading to the ${ROOMS[existingTarget]?.name || existingTarget}`;
          }
          transit = { path, progress: nextStep, destination: existingTarget };
          if (nextStep >= path.length - 1) transit = null;
        } else {
          location = existingTarget || npc.location;
          transit = null;
        }
      } else if (target && target !== npc.location) {
        // Start new transit
        activity = pickedActivity;
        let path = findPath(npc.location, target);
        if (path && path.length > 1) {
          const nextStep = 1;
          location = path[nextStep];
          if (nextStep < path.length - 1) {
            activity = `heading to the ${ROOMS[target]?.name || target}`;
          }
          transit = { path, progress: nextStep, destination: target };
          if (nextStep >= path.length - 1) transit = null;
        } else {
          location = target;
        }
      } else {
        // `target` is null when the activity has no room preference (an
        // ACTIVITY_ROOM_PREFERENCES entry of null, e.g. 'reading in bed'
        // — "wherever you already are"). Falling through to npc.location
        // alone stranded anyone whose location was *also* null, which is
        // exactly the state an NPC is in on the tick they get home from
        // work: they'd stay off-screen until a roll happened to pick an
        // activity that does name a room. Their own bedroom is the right
        // "wherever you already are" for someone who isn't anywhere yet.
        location = target || npc.location || npc.residency.room;
      }
    }

    resolved[id] = { block, location, activity, transit };
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
      comfort: Math.max(0, (npc.needs.comfort || 50) - NEEDS.npcComfortDecay),               // NPC Overhaul Phase 6
      stimulation: Math.max(0, (npc.needs.stimulation || 50) - NEEDS.npcStimulationDecay),   // NPC Overhaul Phase 6
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
    if (block === 'morning' || block === 'wind_down' || block === 'evening') {
      needs.hygiene = Math.min(NEEDS.hygiene.max, needs.hygiene + NEEDS.npcHygieneRestore);
    }
    if (location) {
      const shareCount = Object.values(resolved).filter(r => r.location === location).length;
      if (shareCount > 1) needs.social = Math.min(NEEDS.npcSocialMax, needs.social + NEEDS.npcSocialRestore);
    }
    // NPC Overhaul Phase 6 — restore comfort in comfortable rooms
    if (location === 'living_room' || location === 'bedroom') {
      const facilityTiers = gameState.upgrades || {};
      const hasComfortFacility = location === 'living_room'
        ? (facilityTiers.living_room_entertainment?.tier || 'broken') !== 'broken'
        : (facilityTiers.bedroom_habitability?.tier || 'broken') !== 'broken';
      if (hasComfortFacility) {
        needs.comfort = Math.min(100, needs.comfort + NEEDS.npcComfortRestore);
      }
    }
    // NPC Overhaul Phase 6 — extra comfort from trusted NPC proximity
    if (location) {
      const others = Object.entries(resolved).filter(([oid]) => oid !== id && resolved[oid].location === location);
      for (const [oid] of others) {
        const pair = gameState.world?.castWeb?.[[id, oid].sort().join('|')];
        if (pair) {
          const dirKey = `${id}→${oid}`;
          const pairComfort = pair.axes?.[dirKey]?.comfort || 0;
          if (pairComfort > 0.5) {
            needs.comfort = Math.min(100, needs.comfort + NEEDS.npcComfortProximityBonus);
            break;
          }
        }
      }
    }
    // NPC Overhaul Phase 6 — restore stimulation during leisure
    if (block === 'leisure') {
      needs.stimulation = Math.min(100, needs.stimulation + NEEDS.npcStimulationRestore);
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

    // Evidence discovery (STEALTH, P6): a resident who ends up back in
    // their own room has a chance to notice undiscovered evidence left by
    // an earlier sneak or a housekeeper's boundary-crossing visit. Decides
    // and records discovery only, in-memory (mutating gameState.objects in
    // place is already how object state works across a tick — resolveBatch
    // never clones `objects`, only `npcs`, so this is the same live
    // reference the caller holds). The suspicion write itself happens in
    // UI's advanceAndResolve event loop alongside the memory-episode write
    // every other event type already gets there — resolveTick stays
    // synchronous/LLM-free either way.
    if (location && roomOwnerId(location, npcs) === id) {
      const bucket = gameState.objects?.[`room_${location}`] || {};
      const undiscovered = Object.values(bucket).find(o => o.evidence && !o.evidence.discovered);
      if (undiscovered && rng() < (STEALTH_TUNING.baseEvidenceDiscoveryChance + undiscovered.evidence.strength * STEALTH_TUNING.evidenceStrengthDiscoveryFactor)) {
        undiscovered.evidence.discovered = true;
        newEvents.push({
          day: meta.clock.day, tick: getTickIndex(meta.clock.minutes), roomId: location, npcId: id,
          type: 'evidence_discovered', moodDelta: 0, data: { kind: undiscovered.evidence.kind },
          template: EVIDENCE_KIND_TEXT[undiscovered.evidence.kind], seenByPlayer: false,
        });
      }
    }

    // Clothing state based on schedule block: sleeping → sleepwear,
    // everything else → dressed (unless a drive overrides it, e.g. shower
    // → towel). This runs before drives so drive overrides win.
    let clothing = npc.clothing || 'dressed';
    if (block === 'sleep') {
      clothing = 'sleepwear';
    } else if (clothing === 'sleepwear') {
      clothing = 'dressed';
    }

    npcUpdates[id] = {
      location,
      activity,
      needs,
      mood: Math.max(-1, Math.min(1, npc.mood + moodDelta)),
      clothing,
      schedule: { currentBlock: block, nextBlock: resolved[id].nextBlock || '', willReturnAt: resolved[id].willReturnAt || null }, // NPC Overhaul Phase 7.2
      transit: resolved[id].transit || null,
    };
  }

  // Pass 3: NPC autonomy drives (P7). Evaluates DRIVE_DEFS for each
  // resident, producing self-care, chores, NPC-to-NPC social, IM texts,
  // and player reactions — all deterministic, zero LLM. Effects route
  // through the same applyEffects pipeline as player actions.
  const currentTick = getTickIndex(meta.clock.minutes);
  const allImMessages = [];
  const allRelDeltas = [];
  const allPeepResults = [];
  for (const [id, npc] of Object.entries(npcs)) {
    if (!resolved[id]) continue;
    if (npc.residency.status !== 'resident') continue;
    // Skip sleeping NPCs — they can't act on drives
    if (resolved[id].block === 'sleep') continue;
    // Skip NPCs in transit — they're walking, not doing activities.
    // Drives that set activityOverride would clash with the transit
    // activity ("heading to the Kitchen") and could make the NPC
    // appear to cook in a hallway.
    if (resolved[id].transit) continue;

    const driveResult = evaluateDrives(
      npc, id, npcs, resolved[id], gameState, rng, currentTick
    );

    // Merge drive effects into npcUpdates
    if (driveResult.activityOverride) {
      npcUpdates[id].activity = driveResult.activityOverride;
    }
    if (driveResult.locationOverride) {
      npcUpdates[id].location = driveResult.locationOverride;
    }
    // Drive effects ran through applyEffects against gameState.npcs[id].
    // Pull every field they can touch back, not just needs: applyEffects'
    // appliers are split between ones that mutate the npc in place
    // (REL_DELTA, ADJUST_SUSPICION) and ones that *replace*
    // gameState.npcs[id] wholesale (MEMORY_EPISODE/MEMORY_FACT, via
    // addMemoryEpisode's pure return). npcUpdates[id] was built earlier in
    // this tick from the pre-drive `npc` snapshot, so resolveBatch's
    // `{ ...state.npcs[id], ...update }` merge let that stale copy win and
    // silently threw the replacements away — which is why resolveNpcPeep's
    // silent-peep memory (the entire point of the silent branch) never
    // survived a tick.
    const postDrive = gameState.npcs[id];
    if (postDrive) {
      npcUpdates[id].needs = postDrive.needs;
      npcUpdates[id].memory = postDrive.memory;
      npcUpdates[id].relPlayer = postDrive.relPlayer;
      if (postDrive.suspicion) npcUpdates[id].suspicion = postDrive.suspicion;
    }
    // Cooldowns (and any other flags set by setCooldown during drive
    // evaluation) live on driveResult.updatedNpc.flags — without this
    // merge they were discarded each tick, making every drive's
    // cooldownTicks ineffective. Merged over any flags the effects wrote
    // rather than replacing, so ADD_FLAG and setCooldown can coexist.
    if (driveResult.updatedNpc.flags) {
      npcUpdates[id].flags = { ...(postDrive?.flags || {}), ...driveResult.updatedNpc.flags };
    }

    // Clothing state from drives (e.g., showering → towel)
    if (driveResult.clothingState) {
      npcUpdates[id].clothing = driveResult.clothingState;
    }
    if (driveResult.clothingRestore) {
      // Restore clothing after the drive activity ends — we set it
      // back to 'dressed' on the next non-showering tick
      npcUpdates[id].clothing = 'dressed';
    }

    // Merge events, IM messages, and rel deltas
    newEvents.push(...driveResult.events);
    allImMessages.push(...driveResult.imMessages);
    allRelDeltas.push(...driveResult.relDeltas);

    // Phase 6: collect peep results for async surfacing
    if (driveResult.peepResults) {
      allPeepResults.push(...driveResult.peepResults);
    }
  }

  // Process queued IM messages into computer state
  if (allImMessages.length > 0) {
    processNpcImMessages(gameState, allImMessages);
  }

  // Process NPC-to-NPC and NPC-to-player relationship deltas
  if (allRelDeltas.length > 0) {
    processNpcRelDeltas(gameState, allRelDeltas);
  }

  return { npcUpdates, newEvents, peepResults: allPeepResults };
}

// --- Batched time resolution (for sleep / long work blocks) ---
// opts.advanceClock (default true) — when false, simulate `ticks` worth of
// NPC activity without moving meta.clock. The continuous clock loop (TIME)
// passes false because it has already walked the clock through this span
// itself; advancing here too ran the whole game at double speed.
function resolveBatch(gameState, ticks, opts = {}) {
  const shouldAdvanceClock = opts.advanceClock !== false;
  const allEvents = [];
  const allPeepResults = [];
  let state = gameState;
  for (let i = 0; i < ticks; i++) {
    if (shouldAdvanceClock) {
      state = { ...state, meta: { ...state.meta, clock: advanceClock(state.meta.clock, 1) } };
    }
    const result = resolveTick(state);
    allEvents.push(...result.newEvents);
    if (result.peepResults) allPeepResults.push(...result.peepResults);
    // Apply NPC updates
    const newNpcs = { ...state.npcs };
    for (const [id, update] of Object.entries(result.npcUpdates)) {
      newNpcs[id] = { ...newNpcs[id], ...update };
    }
    state = { ...state, npcs: newNpcs };
  }
  return { state, events: allEvents, peepResults: allPeepResults };
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

// --- Sleep ---
// Hours slept, from energy at bedtime. Drained → the long end of the
// SLEEP range, rested → the short end. Linear between the two; the shape
// matters less than the direction, and a curve here would be false
// precision on a number the player only ever experiences as "I woke up
// around six".
function resolveSleepHours(energyAtBedtime, energyMax) {
  const span = SLEEP.maxHours - SLEEP.minHours;
  const max = energyMax || NEEDS.energy.max;
  const drained = 1 - clamp(energyAtBedtime / max, 0, 1);
  return SLEEP.minHours + span * drained;
}

// Phase 8: alarm-capped sleep. The alarm is a ceiling — it can only
// shorten the night, never extend it. Returns the actual hours slept and
// whether the alarm fired. If the natural night ends before the alarm,
// nothing happens. If the alarm would fire mid-night, the player is woken
// early and recovers only hoursActuallySlept × restorePerHour — that
// shortfall is the whole point of the alarm system.
//
// bedtimeMinutes is the current clock time in minutes (from clock.minutes,
// 0-1439). alarmHour is the player's set alarm (0-23) or null.
function resolveSleepHoursWithAlarm(energyAtBedtime, bedtimeMinutes, alarmHour, energyMax) {
  const naturalHours = resolveSleepHours(energyAtBedtime, energyMax);
  if (alarmHour === null || alarmHour === undefined) {
    return { hours: naturalHours, alarmFired: false };
  }
  // Calculate when the natural night would end (in minutes from midnight).
  const naturalWakeMinutes = (bedtimeMinutes + naturalHours * 60) % (24 * 60);
  const alarmMinutes = alarmHour * 60;
  // How many minutes from bedtime until the alarm fires (wrapping midnight).
  let minutesUntilAlarm = (alarmMinutes - bedtimeMinutes % (24 * 60) + 24 * 60) % (24 * 60);
  const naturalMinutes = naturalHours * 60;
  if (minutesUntilAlarm >= naturalMinutes) {
    // The alarm fires after the natural night ends — nothing happens.
    return { hours: naturalHours, alarmFired: false };
  }
  // The alarm fires before the natural night would end — cap the night.
  return { hours: minutesUntilAlarm / 60, alarmFired: true };
}

// Phase 8: burnout tracking. Called at day rollover to update the
// player's burnout state based on yesterday's work load. If the player
// worked above BURNOUT.workBlockThreshold blocks, consecutiveWorkDays
// increments and burnoutLevel rises; otherwise the player is recovering
// and burnoutLevel falls. The mood and work-pay penalties are applied
// at read time (getBurnoutMoodPenalty/getBurnoutWorkPayMult) rather than
// baked in, so they track the current level exactly.
function updateBurnout(player, day, workBlocksYesterday) {
  if (!player.burnout) player.burnout = { consecutiveWorkDays: 0, burnoutLevel: 0, lastWorkDay: 0 };
  const b = player.burnout;
  if (workBlocksYesterday >= BURNOUT.workBlockThreshold) {
    b.consecutiveWorkDays++;
    b.burnoutLevel = Math.min(BURNOUT.maxBurnoutLevel, b.burnoutLevel + BURNOUT.burnoutPerWorkDay);
  } else {
    b.consecutiveWorkDays = 0;
    b.burnoutLevel = Math.max(0, b.burnoutLevel - BURNOUT.burnoutRecoveryPerRestDay);
  }
  b.lastWorkDay = day;
}

// Mood penalty from burnout (subtracted from mood). Scales linearly with
// burnoutLevel — at full burnout, subtracts BURNOUT.moodPenaltyPerLevel.
function getBurnoutMoodPenalty(player) {
  const level = player.burnout?.burnoutLevel || 0;
  return level * BURNOUT.moodPenaltyPerLevel;
}

// Work pay multiplier from burnout. At 0 burnout → 1.0 (full pay). At
// full burnout → (1 - BURNOUT.workPayPenaltyPerLevel). This is what makes
// grinding progressively less profitable — the death-spiral is the feature.
function getBurnoutWorkPayMult(player) {
  const level = player.burnout?.burnoutLevel || 0;
  return 1 - level * BURNOUT.workPayPenaltyPerLevel;
}

// Narration for waking up. Reads the two things the player can act on:
// how long they were out, and whether it was enough.
function describeSleep(hours, energyOnWaking) {
  const h = Math.round(hours * 10) / 10;
  if (energyOnWaking >= NEEDS.energy.max) return `You sleep ${h} hours and wake up genuinely rested.`;
  if (energyOnWaking >= 70) return `You sleep ${h} hours. Not perfect, but you'll take it.`;
  if (energyOnWaking >= 40) return `You sleep ${h} hours and wake up still tired.`;
  return `You sleep ${h} hours. It barely touches how tired you are.`;
}

// --- Rent computation ---
// The player holds the lease and owes the full rent. Roommates offset it,
// each by at most ECONOMY.rent.maxRoommateShare of the total — never by an
// even split, which is what this used to do (perResident = total/count).
// An even split made one roommate halve the player's burden and made the
// whole problem go away at three; capping each contribution means the
// player is always carrying the largest share and recruiting is a partial
// relief rather than a solution.
//
// residency.rentShare is the negotiated fraction. Nothing negotiates it
// yet — new residents get ECONOMY.rent.defaultRoommateShare — but the
// field is where the future agreement system writes, so callers already
// read per-roommate values rather than a constant.
//
// playerShare can go NEGATIVE, and that is a feature, not an overflow: a
// fully restored apartment at 30% a head breaks even around four roommates
// and turns a profit by seven. Callers must handle a negative share as
// income rather than clamping it to zero.
function computeRent(npcs, gameState) {
  const quality = gameState ? getApartmentQuality(gameState) : undefined;
  const ceiling = roommateShareCeiling(quality);
  const contributors = Object.entries(npcs || {})
    .filter(([, n]) => n.residency.contributesRent && n.residency.status === 'resident');

  // Who is sharing a bedroom? Counted across ALL residents including the
  // player, who occupies a bed in their own room — so a roommate taking
  // the spare bed in there reads as sharing, same as any other double-up.
  const playerRoom = ALL_ROOMS.find(r => ROOMS[r].isPlayer);
  const occupancy = {};
  for (const [, n] of contributors) {
    if (n.residency.room) occupancy[n.residency.room] = (occupancy[n.residency.room] || 0) + 1;
  }
  if (playerRoom) occupancy[playerRoom] = (occupancy[playerRoom] || 0) + 1;

  let covered = 0;
  const shares = {};
  for (const [id, npc] of contributors) {
    let share = clamp(npc.residency.rentShare ?? ECONOMY.rent.defaultRoommateShare, 0, ceiling);
    // Sharing a bedroom is worth less than a private one. Without this a
    // full house all pays the private rate, which is the difference
    // between the apartment clearing ~$5.6k/mo and ~$9k/mo.
    if ((occupancy[npc.residency.room] || 0) > 1) {
      share *= ECONOMY.rent.sharedRoomShareMultiplier;
    }
    shares[id] = Math.floor(ECONOMY.rent.total * share);
    covered += shares[id];
  }

  return {
    total: ECONOMY.rent.total,
    playerShare: ECONOMY.rent.total - covered,
    roommateShares: shares,
    coveredByRoommates: covered,
    contributorCount: contributors.length,
    shareCeiling: ceiling,
  };
}

// How much of the rent any one roommate can be asked to carry, given the
// state of the apartment. Nobody pays penthouse rates for a wreck.
function roommateShareCeiling(quality) {
  const r = ECONOMY.rent;
  const q = clamp(quality ?? getApartmentQuality(), 0, 1);
  return r.minRoommateShare + (r.maxRoommateShare - r.minRoommateShare) * q;
}

// Apartment quality on [0, 1]. Derived from the current tier of every
// facility in world.upgrades — a weighted average of each facility's
// qualityValue at its current tier, normalized by total qualityWeight.
// A wreck (everything broken) is 0; a fully restored apartment is 1.
// This is what makes the upgrade system pay back: it raises the rent
// ceiling via roommateShareCeiling, so investing in the building is an
// investment in income. See ref/apartment-upgrades-plan.md.
//
// Falls back to 1 (full quality) when world.upgrades is absent (a save
// from before Phase 4) so old saves stay playable — the clean-break
// migration will discard them entirely when it lands.
function getApartmentQuality(gameState) {
  const upgrades = gameState?.world?.upgrades;
  if (!upgrades) return 1;
  let weighted = 0, totalWeight = 0;
  for (const def of FACILITY_LIST) {
    const tier = upgrades[def.id]?.tier || FACILITY_STARTING_TIERS[def.id] || 'broken';
    const tierIdx = def.tiers.findIndex(t => t.tier === tier);
    const qualityValue = tierIdx >= 0 ? def.tiers[tierIdx].qualityValue : 0;
    weighted += def.qualityWeight * qualityValue;
    totalWeight += def.qualityWeight;
  }
  if (totalWeight === 0) return 1;
  return clamp(weighted / totalWeight, 0, 1);
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
      // Someone moving in without a negotiated agreement contributes the
      // default. opts.rentShare is the seam the future agreement system
      // writes through when a move-in is the result of an actual
      // negotiation rather than a bare status change.
      rentShare: opts?.rentShare ?? npc.residency.rentShare ?? ECONOMY.rent.defaultRoommateShare,
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

  // Phase 7: solo start. When opening.soloStart is true and residentCount
  // is 0, skip cast generation entirely — the player starts alone in an
  // empty apartment. Roommates are recruited later via the Classifieds app.
  if (ECONOMY.opening?.soloStart && residentCount === 0) {
    const emptyCast = { npcs: {}, npcIds: [], castWeb: {} };
    return buildGameState(actualSeed, emptyCast, clock, []);
  }

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
    const boundary = partial.boundary || weightedPick(charRng, BOUNDARY_POOL.map(x => ({ val: x, weight: 1 }))).val.text;

    // Speech profile — not author-overridable in the UI yet, always rolled
    const speech = {
      verbosity: charRng(),
      formality: charRng(),
      humorStyle: weightedPick(charRng, HUMOR_STYLES.map(x => ({ val: x, weight: 1 }))).val,
      profanityLevel: charRng(),
      verbalTics: pickUnique(charRng, VERBAL_TICS, 1 + Math.floor(charRng() * 2)),
      textingStyle: weightedPick(charRng, TEXTING_STYLES.map(x => ({ val: x, weight: 1 }))).val,
      vocabularyLevel: charRng(),
      catchphrases: [],
    };

    // NPC Overhaul Phase 1: Physical description — seeded from charRng
    const pickPhys = (pool) => pool[Math.floor(charRng() * pool.length)];
    const height = pickPhys(PHYS_POOL_HEIGHT);
    const build = pickPhys(PHYS_POOL_BUILD);
    const physical = {
      height,
      build,
      heightBuild: `${height} and ${build}`,
      hair: {
        color: pickPhys(PHYS_POOL_HAIR_COLOR),
        style: pickPhys(PHYS_POOL_HAIR_STYLE),
        length: pickPhys(PHYS_POOL_HAIR_LENGTH),
        texture: pickPhys(PHYS_POOL_HAIR_TEXTURE),
      },
      eyes: {
        color: pickPhys(PHYS_POOL_EYE_COLOR),
        shape: pickPhys(PHYS_POOL_EYE_SHAPE),
      },
      skin: {
        tone: pickPhys(PHYS_POOL_SKIN_TONE),
        texture: pickPhys(PHYS_POOL_SKIN_TEXTURE),
        ethnicity: pickPhys(PHYS_POOL_SKIN_ETHNICITY),
      },
      face: {
        shape: pickPhys(PHYS_POOL_FACE_SHAPE),
        nose: pickPhys(PHYS_POOL_NOSE),
        lips: pickPhys(PHYS_POOL_LIPS),
        cheekbones: pickPhys(PHYS_POOL_CHEEKBONES),
        jawline: pickPhys(PHYS_POOL_JAWLINE),
        ears: pickPhys(PHYS_POOL_EARS),
      },
      body: {
        shape: pickPhys(PHYS_POOL_BODY_SHAPE),
        chestSize: pickPhys(PHYS_POOL_CHEST_SIZE),
        buttSize: pickPhys(PHYS_POOL_BUTT_SIZE),
        legs: pickPhys(PHYS_POOL_LEGS),
        posture: pickPhys(PHYS_POOL_POSTURE),
      },
      distinguishingFeatures: pickUnique(charRng, PHYS_POOL_FEATURES, 1 + Math.floor(charRng() * 2)),
      piercings: charRng() < 0.4 ? [{ location: pickPhys(PHYS_POOL_PIERCING_LOC), type: pickPhys(PHYS_POOL_PIERCING_TYPE), description: '' }] : [],
      tattoos: charRng() < 0.35 ? [{ location: pickPhys(PHYS_POOL_TATTOO_LOC), description: '', style: pickPhys(PHYS_POOL_TATTOO_STYLE) }] : [],
      fashion: pickPhys(PHYS_POOL_FASHION),
      accessories: '',
      typicalAttire: { casual: '', work: '', sleep: '', formal: '' },
      voice: {
        pitch: pickPhys(PHYS_POOL_VOICE_PITCH),
        texture: pickPhys(PHYS_POOL_VOICE_TEXTURE),
        accent: pickPhys(PHYS_POOL_VOICE_ACCENT),
      },
      gait: pickPhys(PHYS_POOL_GAIT),
      scent: pickPhys(PHYS_POOL_SCENT),
      genitals: '',
    };

    // Build structured character (name/visual/history/sketch/sampleLines
    // are prose, expanded later by LLM — except name, which the player may
    // author directly).
    // NPC Overhaul Phase 5: Personality generation — seeded from charRng, weighted by temperament
    const numTraits = 3 + Math.floor(charRng() * 3); // 3-5 traits
    const traits = pickUnique(charRng, PERSONALITY_TRAITS_POOL, numTraits);
    const coreTrait = traits[Math.floor(charRng() * traits.length)];
    // hiddenTrait: something NOT in traits — they suppress or don't show it
    const hiddenPool = PERSONALITY_TRAITS_POOL.filter(t => !traits.includes(t));
    const hiddenTrait = hiddenPool[Math.floor(charRng() * hiddenPool.length)] || 'sentimental';
    const numQuirks = 2 + Math.floor(charRng() * 3); // 2-4 quirks
    const quirks = pickUnique(charRng, QUIRKS_POOL, numQuirks);
    const numLikes = 3 + Math.floor(charRng() * 3); // 3-5 likes
    const likes = pickUnique(charRng, LIKES_POOL, numLikes);
    const numDislikes = 3 + Math.floor(charRng() * 3); // 3-5 dislikes
    const dislikes = pickUnique(charRng, DISLIKES_POOL, numDislikes);
    const personality = { traits, coreTrait, hiddenTrait, quirks, likes, dislikes }; // NPC Overhaul Phase 5

    const structured = {
      npcId,
      name: partial.name || '',
      visual: '',
      genSeed: Math.floor(charRng() * 1000000),
      age: partial.age ?? rollAge(charRng),           // Phase 0: first-class age, authorable via partial
      gender: partial.gender || rollGender(charRng),  // Phase 0: first-class gender, authorable via partial
      physical,                                           // NPC Overhaul Phase 1
      history: '',
      temperament,
      personality,                                           // NPC Overhaul Phase 5
      occupation: occ,
      interests: interests.map(x => ({ name: x.name, tags: x.tags, skill: Math.floor(charRng() * 40) })), // NPC Overhaul: +skill
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
        comfort: 0,   // NPC Overhaul Phase 3.9 — starts neutral, grows over time
        desire: 0,    // NPC Overhaul Phase 3.9 — starts neutral
      };
      const axesBtoA = {
        trust: webRng() * 2 - 1,
        affection: webRng() * 2 - 1,
        tension: webRng() * 2 - 1,
        respect: webRng() * 2 - 1,
        comfort: 0,   // NPC Overhaul Phase 3.9
        desire: 0,    // NPC Overhaul Phase 3.9
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
  const tempSim = Math.max(0, 1 - dist / 3.46); // 3.46 ≈ sqrt(3*2²): max distance across 3 axes each spanning [-1,1]
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

  // Room shell state (cleanliness/lastEvent). Presence is never stored here
  // — it's derived live from npc.location via getPresentNpcIds, and (as of
  // WORLD) ownership/privacy are derived the same way via roomOwnerId/
  // roomPrivacy rather than stored, so a move-in/move-out can never leave a
  // stale value behind. NPCs' starting location was already set to their
  // assigned bedroom in generateCast; the player starts in bedroom_player
  // (set below).
  //
  // Objects are spawned first (WORLD's spawnObjectsForNewGame) so
  // cleanliness can be derived from them immediately rather than starting
  // at a fixed placeholder that then never moves until something touches
  // it — see recomputeRoomCleanliness.
  const objects = spawnObjectsForNewGame(seed, npcs);
  const rooms = {};
  for (const roomId of ALL_ROOMS) {
    const bucket = objects[`room_${roomId}`];
    rooms[roomId] = { capacity: ROOMS[roomId].capacity, cleanliness: recomputeRoomCleanliness(bucket), lastEvent: null };
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

  // Rent — deferred until after world.upgrades is built (below), since
  // computeRent reads apartment quality from upgrades. For now just
  // initialize with a placeholder; the real value is set after the
  // world object is assembled.
  let rent = { total: ECONOMY.rent.total, playerShare: ECONOMY.rent.total, roommateShares: {}, coveredByRoommates: 0, contributorCount: 0, shareCeiling: 0 };

  // Player state
  const player = {
    money: ECONOMY.startingMoney,
    // Phase 8: energy as a levelled stat. The player starts with a lower
    // energy ceiling (ENERGY.startingMax) that grows over the game via
    // sleep consistency and exercise. NEEDS.energy.max is the absolute cap;
    // player.energyMax is the per-player ceiling that rises toward it.
    // A lower starting ceiling means fewer work blocks per day, making
    // early rent harder and the pressure to recruit roommates sharper.
    energy: 70,
    energyMax: 70,
    hunger: 80,
    hygiene: 100,
    mood: 0.2, // [-1, 1] scale — see NEEDS.mood config comment. 0.2 mirrors the old 60/100 starting mood at the same relative position.
    skills: {},
    inventory: [],
    location: 'bedroom_player',
    flags: {},
    // Phase 8: alarm system. The player can set an alarm that caps the
    // night — it can only shorten sleep, never extend it. null = no alarm.
    // The hour is 0-23 (e.g. 6 = 06:00). doSleep checks this against the
    // natural wake time and wakes the player early if the alarm fires
    // before the full night would complete.
    alarm: null,
    // Phase 8: burnout tracking. consecutiveWorkDays counts days where
    // the player worked above the burnout threshold; burnoutLevel is the
    // accumulated penalty (0-1) that scales mood loss and work pay down.
    // Recovery happens on rest days. See ref/sleep-and-alarm-plan.md.
    burnout: { consecutiveWorkDays: 0, burnoutLevel: 0, lastWorkDay: 0 },
    // Nothing is owed until the first due date actually passes — see
    // UI's processRentForDay, which charges rent every ECONOMY.payPeriodDays
    // and applies escalating consequences while a balance stands.
    // Phase 7: the opening defers the first rent bill by
    // ECONOMY.opening.rentGraceDays so the player has time to orient
    // and start earning before the first charge lands.
    rentOwed: 0,
    rentDueDay: 1 + (ECONOMY.opening?.rentGraceDays || ECONOMY.payPeriodDays),
  };

  const state = {
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
      // Phase 6 taxes: quarterly estimated tax. quarterGross accumulates
      // each quarter's gross gig income; the bill lands at quarter end.
      // lastQuarterBilled is the last fully-billed quarter index, so a
      // save reloaded mid-quarter doesn't rebill. unpaid carries penalties
      // forward (compounding). autoReserve is the opt-in skim toggle.
      // quarterDeductions accumulates deductible spending this quarter
      // (Nile tech, internet share, classes). lastQuarterOwed/lastQuarterPaid
      // record the most recent bill for display. reserve is the auto-reserve
      // balance the player can draw on to pay the tax bill.
      taxes: { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0, quarterDeductions: 0, lastQuarterOwed: 0, lastQuarterPaid: 0 },
      // Phase 3 bills: one entry per BILL_DEFS. `dueDay` is the next day a
      // charge posts; `balance` is the currently-owed amount (0 when paid);
      // `status` is 'current' (paid up / not yet due), 'due' (posted, in
      // grace), 'overdue' (past grace, cutoff active), 'paid' (settled this
      // cycle); `overdueDays` counts days past grace for escalation text.
      // First due days are staggered so the player isn't hit with every
      // bill on day 8 — rent first (day 8), then utilities spread across
      // the first month. Initialized by initBillState below.
      bills: initBillState(),
      // Phase 4 upgrades: one entry per FACILITY_DEFS. `tier` is the
      // facility's current condition ('broken'/'functional'/'upgraded').
      // The apartment starts in disrepair — see ref/game-opening-plan.md.
      // Initialized by initUpgradesState below.
      upgrades: initUpgradesState(),
      // Phase 5 utility metering: one entry per UTILITY_METER key. Each
      // counter accumulates between billings and resets to zero when the
      // bill posts. `hvac` also tracks `daysAccrued` since it accrues one
      // day-unit per day rather than per-action. See computer.js's
      // recordUtilityUsage / computeBillAmount.
      utilities: initUtilitiesState(),
    },
    objects,
    droppedConstraints,
  };

  // Phase 7: recompute rent now that world.upgrades exists, so the
  // apartment quality (disrepair) is reflected in the starting rent split.
  // For solo start this means the player carries the full $1,900/wk at the
  // 8% disrepair ceiling — nobody to split with.
  state.world.rent = computeRent(npcs, state);
  return state;
}

// Initialize per-bill state for a new game. Rent is due first (day 8),
// utilities stagger across the first 30 days so the opening isn't a wall
// of bills, phone/insurance land at the end of the first month. Stagger
// offsets are relative to day 1.
function initBillState() {
  // Phase 7: utility bills start after ECONOMY.opening.firstBillDelay
  // so the opening isn't a wall of bills on day one. Rent is deferred
  // separately via rentDueDay in the player state.
  const delay = ECONOMY.opening?.firstBillDelay || 0;
  const firstDue = {
    rent: 1 + (ECONOMY.opening?.rentGraceDays || ECONOMY.payPeriodDays),
    electric: 14 + delay, water: 18 + delay, gas: 22 + delay,
    internet: 12 + delay, phone: 28 + delay, insurance: 30 + delay,
  };
  const bills = {};
  for (const def of Object.values(BILL_DEFS)) {
    bills[def.id] = {
      dueDay: firstDue[def.id] || (8 + def.cadenceDays),
      balance: 0,
      status: 'current',
      overdueDays: 0,
      cutoffActive: false,
      // BrineOS Phase 7: opt-in, default off. Rent (split:'lease') never
      // reads this — it has its own cap/eviction path — but the field is
      // set uniformly rather than special-cased out of this loop.
      autopay: false,
      autopayAttempted: false,
    };
  }
  return bills;
}

// Initialize per-facility state for a new game. Each facility starts at
// its FACILITY_STARTING_TIERS tier — the apartment is in disrepair.
// `room` is stamped from the facility def so the upgrade UI can group
// facilities by room without a lookup.
function initUpgradesState() {
  const upgrades = {};
  for (const def of FACILITY_LIST) {
    upgrades[def.id] = {
      tier: FACILITY_STARTING_TIERS[def.id] || 'broken',
      // Phase 9: condition (0-100) tracks wear. Starts at 100 for
      // functional+ facilities; broken facilities start at 0 since
      // there's nothing to wear down. Degrades with use; at 0 the
      // facility drops a tier.
      condition: (FACILITY_STARTING_TIERS[def.id] || 'broken') === 'broken' ? 0 : MAINTENANCE.startingCondition,
    };
  }
  return upgrades;
}

// Phase 5: initialize per-meter utility counters. Each meter starts at
// zero; `hvac` also carries `daysAccrued` since it accrues one unit per
// day at day rollover rather than per-action. Meters reset when the bill
// posts (resetUtilityMeters in computer.js).
function initUtilitiesState() {
  const utils = {};
  for (const key of Object.keys(UTILITY_METER)) {
    utils[key] = { count: 0 };
  }
  utils.hvac.daysAccrued = 0;
  return utils;
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
      rentShare: ECONOMY.rent.defaultRoommateShare,
    },
    location: null,
    activity: '',
    mood: 0,
    moodReason: '',                                   // NPC Overhaul
    schedule: { currentBlock: '', nextBlock: '', willReturnAt: null }, // NPC Overhaul
    needs: { hunger: 50, hygiene: 50, energy: 50, social: 50, comfort: 50, stimulation: 50 }, // NPC Overhaul: +comfort, +stimulation
    relPlayer: {
      trust: 0, affection: 0, tension: 0, respect: 0,
      comfort: 0, desire: 0,                          // NPC Overhaul
      intimacyLevel: 0, conversationPhase: 'early',   // NPC Overhaul — derived
      grievances: [],                                 // NPC Overhaul
      firstMetDay: 1, lastInteractionDay: 1,          // NPC Overhaul
    },
    memory: {
      facts: [], episodes: [], summary: '',
      summaryRevision: 0,                              // NPC Overhaul
      recent: [],                                      // NPC Overhaul — last ~10 exchanges
      styleCounters: { total: 0, sincePersonal: 0, recentTopics: [], lastJobMention: -1, lastHobbyMention: -1 }, // NPC Overhaul
    },
    arcs: [],
    flags: {},
    // P6: suspicion[subject] (0..1). Additive default, same precedent as
    // player.skills (SKILLS) — every read/write guards with `|| {}`, so no
    // FOLDER_VERSIONS migration is needed for existing saves.
    suspicion: {},
    // P7: clothing state — dressed|sleepwear|towel|undressed. Drives
    // (e.g., showering) set this; schedule block 'sleep' sets 'sleepwear'.
    // Same additive-default pattern as suspicion/skills.
    clothing: 'dressed',
  };
}

// ===== /SECTION: SIM =====
