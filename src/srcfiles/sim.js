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

// Generate a random seed string. Drawn from the live star (ORBITAL) rather
// than Math.random — the one place we genuinely want unpredictability, since
// this is the number a whole playthrough is reproduced from.
function genSeed() {
  return orbitalRandom().toString(36).substring(2, 12);
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
// The contract is unchanged and load-bearing: a pure deterministic function of
// (baseSeed, subSeed), so the same save reproduces the same world forever
// (design invariant 6, brief §7.3's "paste a seed, get the same house").
//
// What produces the numbers, however, is now S4714 — a real star orbiting the
// black hole at the centre of the galaxy at up to 8% of lightspeed. The seed
// pair chooses where on its ~12-year orbit to start; each draw advances it a
// golden-ratio fraction of a period and hashes the resulting eccentric
// anomaly, orbital radius and instantaneous speed. See ORBITAL for why that is
// a real PRNG and not just decoration. It is, to be completely clear, an
// absurd way to decide what an NPC has for breakfast.
function seededRng(baseSeed, subSeed) {
  return s4714Rng(baseSeed, subSeed);
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

// Working-day arithmetic (external-world plan Phase 4). Del's crew works
// weekdays only, so a renovation job's durationDays are WORKING days: this
// returns the calendar day on which `workingDays` of actual work have been
// completed, starting from (and including) `startDay` if it's a weekday.
// A 3-day job booked on a Friday finishes the following Wednesday.
function addWorkingDays(startDay, workingDays) {
  let day = startDay;
  let remaining = workingDays;
  while (remaining > 0) {
    if (!isWeekend(day)) remaining--;
    day++;
  }
  // Skip any trailing weekend so the completion day is a day work happened.
  while (isWeekend(day)) day++;
  return day;
}

// How many working days have elapsed between two days (excludes `to`).
// Drives staged progress so "day 2 of 5" counts work done, not calendar
// days sat through — a job idle over a weekend doesn't advance its stage.
function workingDaysBetween(from, to) {
  let count = 0;
  for (let d = from; d < to; d++) if (!isWeekend(d)) count++;
  return count;
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
  // Abbreviated from the shared WEEKDAY_NAMES (config) so the maid's
  // schedule grid and this date line can never disagree about day order.
  const weekdays = WEEKDAY_NAMES.map(n => n.slice(0, 3));
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

// How inclined an NPC is to notice things — high openness (curious) and low
// conscientiousness (unbothered about where attention belongs).
//
// This formula was written twice, inline and identically, in DRIVES'
// tryNpcPeep and trySnoopPhone. Extracted here so the perception layer reuses
// the one the game already had rather than inventing a second model of
// curiosity that could drift from it.
function npcCuriosity(npc) {
  const t = npc?.bible?.temperament || {};
  const mods = NPC_PEEP_TUNING.chanceModifiers;
  const openness = t.openness || 0;
  const consc = t.conscientiousness || 0;
  return openness * mods.openness
       + (1 - (consc + 1) / 2) * mods.lowConscientiousness;
}

// The NPC counterpart of getPlayerPerception (perception plan Phase 1, D8) —
// same tuning block, same clamp, so "how much attention does this character
// have" means one thing across the game. Temperament replaces the player's
// mood term; tiredness dulls both.
function getNpcPerception(npc) {
  const cfg = NPC_PEEP_TUNING.perception;
  let p = cfg.base + npcCuriosity(npc) * cfg.npcCuriosityWeight;
  const energy = npc?.needs?.energy;
  if (typeof energy === 'number') {
    if (energy > 70) p += cfg.energyHighBonus;
    if (energy < 20) p -= cfg.energyLowPenalty;
  }
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

// --- Visits (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 1) ---
// world.visits[] is the single source of truth for "who is onsite and why".
// A visit is the presence window of an external NPC: their location and
// activity are purpose-driven, they don't decay needs, and outside their
// window they are fully dormant. getActiveVisits is the ONLY door
// consumers use — the tick loop, scene layer, and floor plan all ask this
// one question rather than scanning individual sources (renovation jobs,
// and later contracts/orders/bookings/invites).
function getActiveVisits(gameState) {
  const visits = gameState.world?.visits;
  if (!visits || visits.length === 0) return [];
  const { day, minutes } = gameState.meta.clock;
  const tick = getTickIndex(minutes);
  return visits.filter(v =>
    v.day === day &&
    v.status !== 'done' && v.status !== 'deferred' &&
    tick >= v.startTick && tick < v.endTick
  );
}

// Active-NPC index (external-world plan Phase 1): residents + NPCs with an
// active visit. Required by the "everyone persists forever" decision — with
// unbounded externals, the per-tick resolution loops must not scan the
// whole npcs map. resolveTick iterates THIS; castWeb stays pairwise (never
// eagerly built across the roster, see Performance in the plan).
function getActiveNpcIds(gameState, activeVisits) {
  const npcs = gameState.npcs;
  const ids = [];
  for (const [id, npc] of Object.entries(npcs)) {
    if (npc && npc.residency.status === 'resident') ids.push(id);
  }
  for (const v of activeVisits) {
    const npcId = v.npcId;
    if (npcId && npcs[npcId] && !ids.includes(npcId)) ids.push(npcId);
  }
  return ids;
}

// Create (or keep) a visit record. Idempotent per source+day: sources call
// this every rollover for their recurring shapes (a renovation job's crew
// visits on every working day), so an existing record for the same
// source+day must not be duplicated. Record shape matches the plan's Data
// model; status is 'scheduled' on creation and flips to 'done' by
// processVisitsForDay once the day passes.
function scheduleVisit(gameState, sourceId, day, visit) {
  const visits = gameState.world.visits || (gameState.world.visits = []);
  const existing = visits.find(v => v.sourceId === sourceId && v.day === day);
  if (existing) return existing;
  const record = {
    id: `visit_${day}_${visits.length}`,
    npcId: visit.npcId,
    purpose: visit.purpose,
    sourceId,
    day,
    startTick: visit.startTick,
    endTick: visit.endTick,
    roomId: visit.roomId,
    status: 'scheduled',
    hostNpcId: visit.hostNpcId || null,
    // AfterHours Phase 8 (Hot Singles): an invited guest who is here for
    // the PLAYER (not a resident host) follows them through the shared
    // space — resolveVisitPresence's social+followPlayer branch.
    followPlayer: !!visit.followPlayer,
  };
  visits.push(record);
  return record;
}

// Contractor visits (external-world plan Phase 1): the crew is onsite in
// the job's room during VISIT_TUNING.contractor's window (09:00-16:30) on
// every WORKING day of an active renovation job — from the booking day
// through the day before etaDay (the job completes at etaDay's rollover),
// weekends off. Called at booking (bookRenovationJob schedules the whole
// run) and as a day-rollover backstop (processVisitsForDay) so saves with
// in-flight jobs — booked before visits existed — get their crew onsite
// for the remaining days without a migration.
function scheduleContractorVisitsForJob(gameState, job) {
  const win = VISIT_TUNING.contractor;
  for (let d = job.startDay; d < job.etaDay; d++) {
    // Weekends off — unless the rush premium was paid (Phase 4), which is
    // exactly what that money buys: the crew on site seven days a week.
    if (!job.rush && isWeekend(d)) continue;
    scheduleVisit(gameState, job.id, d, {
      npcId: job.contractorId || CONTRACTOR_ID,
      purpose: 'contractor',
      startTick: win.startTick,
      endTick: win.endTick,
      roomId: job.roomId,
    });
  }
}

// --- Friends of roommates (external-world plan Phase 6) ---
// Each resident gets a deterministic circle of 2-4 friend stubs the first time
// anything asks. Called at day rollover rather than wired into every NPC
// creation path, so a roommate who moves in through Classifieds on day 40
// grows a circle exactly like the founding cast did — and saves written before
// this phase pick one up without a migration.
function ensureSocialCircles(gameState) {
  for (const [npcId, npc] of Object.entries(gameState.npcs)) {
    if (!npc || npc.residency?.status !== 'resident') continue;
    if (npc.socialCircle && npc.socialCircle.length > 0) continue;
    // Same raw-vs-wrapped tolerance as generateFriendStub: this also runs on
    // the freshly generated state at new-game write time.
    const rng = seededRng(gameState.meta?.seed ?? gameState.seed, `circle_${npcId}`);
    const size = FRIEND_TUNING.circleMin
      + Math.floor(rng() * (FRIEND_TUNING.circleMax - FRIEND_TUNING.circleMin + 1));
    const circle = [];
    for (let i = 0; i < size; i++) {
      circle.push(generateFriendStub(gameState, npcId, i).stubId);
    }
    npc.socialCircle = circle;
  }
}

// --- Escorts (external-world plan Phase 7) ---
// Pre-generate the persistent roster: a fixed set of full NPCs (via
// createExternalNpc — the exact generator drivers and the maid use, so they
// are full NPCs, never vendor bots, design invariant 6), each with a
// deterministic base rate, bio, and advertised service menu (the rotation
// guarantees two escorts genuinely differ, decision 14). Idempotent like
// ensureSocialCircles: called at new-game write, at day rollover, and on
// first browse — so a save written before this phase picks the roster up
// without a migration. NPC ids are the fixed slots 'escort_1'..'escort_n',
// so the same seed always produces the same people, rates, and menus.
const ESCORT_BIO_POOL = [
  'Discreet, punctual, and unnervingly good with people.',
  'Keeps their own hours and a strict policy about boundaries.',
  'Friends first; everything else is on the table once it\u2019s agreed.',
  'Easy to talk to, considerably harder to read.',
  'Charges by the service, not by the hour, and sticks to the menu.',
  'All business at first. Give it an evening and that changes.',
];

function ensureEscortRoster(gameState) {
  const roster = gameState.world.escortRoster || (gameState.world.escortRoster = []);
  if (roster.length > 0) return roster;
  // Same raw-vs-wrapped tolerance as generateFriendStub: this also runs on
  // the freshly generated state at new-game write time.
  const seed = gameState.meta?.seed ?? gameState.seed;
  for (let i = 0; i < ESCORT_TUNING.rosterSize; i++) {
    const npcId = `escort_${i + 1}`;
    createExternalNpc(gameState, npcId, npcId, 'Escort');
    const rng = seededRng(seed, `escortroster_${i}`);
    roster.push({
      npcId,
      bio: ESCORT_BIO_POOL[Math.floor(rng() * ESCORT_BIO_POOL.length)],
      rate: ESCORT_TUNING.baseRateMin + Math.floor(rng() * (ESCORT_TUNING.baseRateMax - ESCORT_TUNING.baseRateMin + 1)),
      offeredServices: [...(ESCORT_OFFERED_ROTATION[i % ESCORT_OFFERED_ROTATION.length] || [])],
    });
  }
  return roster;
}

// --- Hot Singles (AfterHours Site Expansion Phase 7) ---
// The "Hot Singles in your area" section's roster: the same persistent,
// deterministic pre-generation pattern as ensureEscortRoster — a fixed set
// of FULL NPCs (via createHotSingleNpc → createExternalNpc with the deviant
// skew, so they are never vendor bots), ids fixed to 'hot_single_1'..'n' so
// the same seed always yields the same people. They are NOT a paid service
// (that's escorts); meeting them is free and afterwards they are ordinary
// NPCs on every existing external-world path. Idempotent like the escort
// roster: called at new-game write, at day rollover, and on first browse —
// so a save written before this phase picks the roster up without a
// migration. The roster entries are deliberately lean ({npcId, slot}); the
// site-side profile copy (headline/bio/distance/interests) is derived
// deterministically per npcId by the AfterHours renderer (authored chrome,
// never API output).
function ensureHotSinglesRoster(gameState) {
  const roster = gameState.world.hotSinglesRoster || (gameState.world.hotSinglesRoster = []);
  if (roster.length > 0) return roster;
  for (let i = 0; i < AH_HOT_SINGLES_TUNING.rosterSize; i++) {
    const npcId = `hot_single_${i + 1}`;
    createHotSingleNpc(gameState, npcId, npcId);
    roster.push({ npcId, slot: i + 1 });
  }
  return roster;
}

// How likely this resident is to have someone over today. Warmth and openness
// are the whole model (locked decision 13) — a household's social life is a
// property of who lives in it, not a global rate.
function friendHostChance(npc) {
  const t = npc.bible?.temperament || {};
  const raw = FRIEND_TUNING.baseHostChance
    + FRIEND_TUNING.warmthWeight * (t.warmth || 0)
    + FRIEND_TUNING.opennessWeight * (t.openness || 0);
  return Math.max(FRIEND_TUNING.minHostChance, Math.min(FRIEND_TUNING.maxHostChance, raw));
}

// How many separate people are already booked to be here today. Used for the
// soft cap: organic visits stand down when the place is already busy, paid and
// scheduled ones never do (locked decision 6).
function countVisitorsForDay(gameState, day) {
  const ids = new Set();
  for (const v of gameState.world.visits || []) {
    if (v.day !== day) continue;
    if (v.status === 'done' || v.status === 'deferred') continue;
    ids.add(v.npcId);
  }
  return ids.size;
}

// Plan today's organic visits: one roll per resident, and a hit promotes the
// chosen friend to a full NPC BEFORE scheduling the visit, so generation is
// never in the way of an arrival. Pure planning — returns what happened and
// leaves narration to the caller (UI), the same split resolveTick/events uses.
function planFriendVisitsForDay(gameState, day) {
  const results = [];
  ensureSocialCircles(gameState);
  const residentIds = Object.keys(gameState.npcs)
    .filter(id => gameState.npcs[id]?.residency?.status === 'resident');

  for (const hostId of residentIds) {
    const host = gameState.npcs[hostId];
    const rng = seededRng(gameState.meta.seed, `hosting_${hostId}_${day}`);
    if (rng() >= friendHostChance(host)) continue;

    // Pick from the friends who aren't inside their own cooldown.
    const candidates = (host.socialCircle || [])
      .map(sid => gameState.world.externalStubs?.[sid])
      .filter(s => s && (s.lastVisitDay == null || day - s.lastVisitDay >= FRIEND_TUNING.perFriendCooldownDays));
    if (candidates.length === 0) continue;
    const stub = candidates[Math.floor(rng() * candidates.length)];

    const startTick = FRIEND_TUNING.startTickMin
      + Math.floor(rng() * (FRIEND_TUNING.startTickMax - FRIEND_TUNING.startTickMin + 1));
    const duration = FRIEND_TUNING.durationTicksMin
      + Math.floor(rng() * (FRIEND_TUNING.durationTicksMax - FRIEND_TUNING.durationTicksMin + 1));

    // Soft cap: check BEFORE promoting, so a deferred visit costs nothing.
    const deferred = countVisitorsForDay(gameState, day) >= VISIT_TUNING.softCap;
    const promoted = deferred ? null : promoteFriendStub(gameState, stub.stubId);
    if (!deferred && !promoted?.ok) continue;

    const visit = scheduleVisit(gameState, `friend_${stub.stubId}_${day}`, day, {
      npcId: deferred ? null : promoted.npcId,
      purpose: 'social',
      startTick,
      endTick: Math.min(48, startTick + duration),
      roomId: 'living_room',
      hostNpcId: hostId,
    });
    if (deferred) {
      // A real record with the plan's own 'deferred' status rather than a
      // silent skip — getActiveVisits ignores it, and it leaves a trace of a
      // night the house was too busy for one more guest.
      visit.status = 'deferred';
      results.push({ deferred: true, hostId, stubId: stub.stubId, day });
      continue;
    }
    stub.lastVisitDay = day;
    results.push({
      deferred: false, hostId, stubId: stub.stubId, day,
      npcId: promoted.npcId,
      guestName: gameState.npcs[promoted.npcId]?.bible?.name || stub.name,
      hostName: host.bible?.name || 'Someone',
      startTick,
    });
  }
  return results;
}

// Purpose-driven presence for a visitor inside their active visit window.
// location comes from the visit (the contractor sits in his job's room; a
// future maid will rotate her cleaning scope, a social guest will use
// ACTIVITY_ROOM_PREFERENCES — see the plan's Phase 3/6 sections); activity
// is drawn from a purpose-specific pool.
function resolveVisitPresence(npcId, gameState, activeVisits, rng, resolved) {
  const visit = activeVisits.find(v => v.npcId === npcId);
  const pool = (visit && VISIT_TUNING.activities[visit.purpose]) || VISIT_TUNING.activities.default;
  const activity = pool[Math.floor(rng() * pool.length)];
  // A roommate's friend (Phase 6) is here to see their HOST, so they follow
  // them around the common areas rather than sitting in one room all evening.
  // `resolved` is this tick's in-progress resolution map — residents come
  // first in the active index, so the host's location for THIS tick is
  // already in there; npc.location would be a tick stale. If the host is
  // off-screen (at work) or shut in a bedroom, the guest waits in the room
  // the visit was booked into.
  if (visit && visit.purpose === 'social' && visit.hostNpcId) {
    const hostLoc = resolved?.[visit.hostNpcId]?.location ?? gameState.npcs[visit.hostNpcId]?.location;
    const followable = hostLoc && ROOMS[hostLoc]?.type === 'common';
    return {
      block: 'leisure',
      location: followable ? hostLoc : visit.roomId,
      activity,
      transit: null,
    };
  }
  // An invited Hot Single (AfterHours Phase 8) is here for the PLAYER, so
  // they follow the player through the shared space the way a guest follows
  // their host — but common rooms only, unlike an escort: a date waits
  // where they were invited until the player comes out, and another
  // resident's bedroom is still off-limits. If the player is in a private
  // room (or off-screen), the guest waits in the room the invite booked.
  if (visit && visit.purpose === 'social' && visit.followPlayer) {
    const pLoc = gameState.player.location;
    const followable = pLoc && ROOMS[pLoc]?.type === 'common';
    return {
      block: 'leisure',
      location: followable ? pLoc : visit.roomId,
      activity,
      transit: null,
    };
  }
  // The maid (Phase 3) works her way through the apartment rather than
  // standing in one room all day: her location walks her cleaning scope,
  // one room per tick elapsed. Scope matches what the contract pays for —
  // common rooms, or everywhere with the bedrooms add-on.
  if (visit && visit.purpose === 'maid') {
    const contract = gameState.world.computer?.apps?.services?.hired
      ?.find(h => h.serviceId === MAID_SERVICE_ID);
    const scope = (contract?.addons || []).includes('bedrooms') ? ALL_ROOMS : COMMON_ROOMS;
    const elapsed = Math.max(0, getTickIndex(gameState.meta.clock.minutes) - visit.startTick);
    return {
      block: 'leisure',
      location: scope[elapsed % scope.length],
      activity,
      transit: null,
    };
  }
  // An escort (Phase 7) is here for the PLAYER, so they follow the player
  // around the shared space the way a guest follows their host — and, unlike
  // a social guest, into the player's own bedroom (that's the point of the
  // appointment). Other residents' private rooms are off-limits: a booked
  // session respects closed doors until it's actually underway, so if the
  // player is in someone else's room the escort waits where the booking put
  // them (the player's location at book time).
  if (visit && visit.purpose === 'escort') {
    const pLoc = gameState.player.location;
    const followable = (pLoc && (ROOMS[pLoc]?.type === 'common' || pLoc === 'bedroom_player'));
    return {
      block: 'leisure',
      location: followable ? pLoc : visit.roomId,
      activity,
      transit: null,
    };
  }
  return {
    // 'leisure' rather than a dedicated 'visit' block so the allowlisted
    // social drives (react_to_player/seek_company/chat_with_roommate, whose
    // blockFilters all include leisure) are genuinely reachable; every
    // other drive stays blocked by VISITOR_DRIVE_ALLOWLIST in DRIVES.
    block: 'leisure',
    location: visit ? visit.roomId : null,
    activity,
    transit: null,
  };
}

// --- Schedule resolution ---

// Given an NPC's schedule template and current time, get their activity.
// Phase 7 (D7): a resident with an ACTIVE accepted meal commitment is
// relocated to the commitment's room for its window — the invitation binds,
// it doesn't hope. The commitment check is the FIRST question asked, so a
// committed dinner beats whatever the work template says (a day_shift
// roommate would otherwise be mid-evening leisure somewhere random). The
// extra args are optional: callers without a gameState (interruption.js's
// schedule reads) keep the old pure-template behavior. Returns the block
// 'meal' with commitmentRoomId set when an override is active.
function resolveScheduleActivity(npc, clock, gameState, npcId) {
  if (gameState && npcId) {
    const commitment = activeCommitmentFor(npcId, gameState);
    if (commitment) {
      return { block: 'meal', weight: 1.0, commitmentRoomId: commitment.roomId };
    }
  }
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

  // Visit spine (external-world plan Phase 1): the active-NPC index is the
  // union of residents and NPCs with an active visit. The tick loop
  // iterates THIS, not the whole npcs map — externals persist forever
  // ("everyone persists forever" decision), so scanning every npc every
  // tick would grow without limit as the cast accumulates visitors.
  const activeVisits = getActiveVisits(gameState);
  const activeNpcIds = getActiveNpcIds(gameState, activeVisits);
  // Who is here on a visit right now. Presence follows the VISIT, not the
  // residency status: an invited applicant ('prospective', external-world
  // plan Phase 2) turns up exactly like a 'visitor' friend does. Residents
  // are never visitors — they have their own schedule-driven resolution.
  const visitingIds = new Set(
    activeVisits.map(v => v.npcId).filter(id => npcs[id] && npcs[id].residency.status !== 'resident')
  );

  // Pass 1: resolve where everyone ends up THIS tick first, so pass 2's
  // social-need restoration can check who's actually sharing a room this
  // tick rather than where they were last tick.
  const resolved = {};
  for (const id of activeNpcIds) {
    const npc = npcs[id];
    if (!npc) continue;
    // Visitor: resolve from their active visit — purpose-driven
    // location/activity, no schedule lookup. This is the windowed version
    // of the old unconditional 'visitor' skip: an external WITH an active
    // visit resolves; one without is simply absent from the active index.
    if (visitingIds.has(id)) {
      resolved[id] = resolveVisitPresence(id, gameState, activeVisits, rng, resolved);
      continue;
    }
    if (npc.residency.status !== 'resident') continue;

    const scheduleResult = resolveScheduleActivity(npc, meta.clock, gameState, id);
    const { block } = scheduleResult;
    let location = null;
    let activity = block;
    let transit = npc.transit || null;

    if (block === 'meal') {
      // Phase 7 (D7): a committed dinner binds — the attendee is at the
      // table for the whole window, not wherever the template would put
      // them. The location comes straight from the commitment (the dining
      // room); a commitment never routes through resolveRoomForActivity.
      location = scheduleResult.commitmentRoomId || npc.residency.room;
      activity = 'sitting down to dinner';
      transit = null;
    } else if (block === 'sleep') {
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
  for (const id of activeNpcIds) {
    if (!resolved[id]) continue;
    const npc = npcs[id];
    const { block, location, activity } = resolved[id];

    // Visitors (external-world plan Phase 1): no needs decay, no random
    // events, no evidence discovery, no clothing transitions — they're
    // here for a purpose, and their sim is fully dormant outside the
    // visit. Only location/activity/mood are carried into the update so
    // they resolve as present for the scene layer and floor plan.
    if (visitingIds.has(id)) {
      npcUpdates[id] = {
        location,
        activity,
        mood: npc.mood,
        // Schedule label is 'visit' (distinct from the drive-routing block
        // 'leisure' in the resolved record) so the LLM's scene context reads
        // sensibly — Del mid-visit is "in 'visit'", not "in leisure".
        schedule: { currentBlock: 'visit', nextBlock: '', willReturnAt: null },
        transit: null,
        clothing: npc.clothing || 'dressed',
      };
      continue;
    }

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
    // Correctness plan Phase 4 (D10/D11): the passive hunger and hygiene
    // restores that used to live here are GONE. Both needs are drive-serviced
    // now — the `eat` drive really consumes food from the fridge and pantry,
    // and the `shower` drive is what makes an NPC clean.
    //
    // The hygiene restore was the worse of the two: +8/tick across
    // morning/wind_down/evening is +112/day against 48/day of decay, so
    // hygiene never left 100 and the `shower` drive (gate: below 30) could
    // not fire in any reachable game state. That silently killed the towel
    // clothing state, NPC-sourced water/shower utility metering, and one of
    // the peep system's target conditions — three features dead because of
    // one restore rate.
    //
    // Phase 7 (D7)'s committed-dinner exception survives: a 'meal' block is
    // an NPC actually sitting down to eat, which is a real act, not passive
    // background topping-up.
    if (block === 'meal') {
      needs.hunger = Math.min(NEEDS.hunger.max, needs.hunger + NEEDS.npcMealRestore);
    }
    if (location) {
      const shareCount = Object.values(resolved).filter(r => r.location === location).length;
      if (shareCount > 1) needs.social = Math.min(NEEDS.npcSocialMax, needs.social + NEEDS.npcSocialRestore);
    }
    // NPC Overhaul Phase 6 — restore comfort in comfortable rooms. A room
    // must carry a comfort facility: the living room is comfortable when its
    // entertainment setup is at least functional; a bedroom only when its bed
    // is UPGRADED (a habitable-but-plain room isn't comfortable). Post-overhaul
    // each bedroom resolves its own habitability facility — the old shared
    // single id is gone.
    // Correctness plan Phase 4 (D14): a comfortable room now pays a small
    // unconditional baseline, with the facility bonus stacking on top rather
    // than being the only source. Previously comfort could ONLY rise in an
    // upgraded room, so in a starting apartment it fell monotonically to zero
    // and every NPC read as permanently uncomfortable. The upgrade incentive
    // survives intact — the facility path is 3/tick against a baseline of 1.
    // An NPC's own bedroom counts even unupgraded; someone else's does not.
    const ownBedroom = ROOMS[location]?.type === 'bedroom' && npc.residency?.room === location;
    if (location === 'living_room' || ownBedroom) {
      const hasComfortFacility = location === 'living_room'
        ? isFacilityFunctional(gameState, 'living_room_entertainment')
        : (ROOM_FACILITIES[location] || []).some(fid => gameState.world.upgrades?.[fid]?.tier === 'upgraded');
      const restore = hasComfortFacility ? NEEDS.npcComfortRestore : NEEDS.npcComfortBaselineRestore;
      needs.comfort = Math.min(100, needs.comfort + restore);
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
    // NPC Overhaul Phase 6 — restore stimulation during leisure.
    // Correctness plan Phase 4 (D13): 'evening' and 'wind_down' count too.
    // Gating on 'leisure' alone made this unreachable for most of the cast —
    // NO weekday shift template (day_shift, morning_shift, evening_shift,
    // night_shift) defines a leisure block at all, so anyone on a normal job
    // could only ever restore stimulation at the weekend, and it sat pinned
    // at zero the rest of the time.
    if (block === 'leisure' || block === 'evening' || block === 'wind_down') {
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
    // Correctness plan Phase 4: generalised from a 'sleepwear'-only check to
    // every TRANSIENT_CLOTHING state, so a towel reverts the tick after the
    // shower that produced it. Pass 3 runs after this and may set a fresh
    // transient state for THIS tick; next tick's pass 2 clears it.
    let clothing = npc.clothing || 'dressed';
    if (block === 'sleep') {
      clothing = 'sleepwear';
    } else if (TRANSIENT_CLOTHING.includes(clothing)) {
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
  for (const id of activeNpcIds) {
    if (!resolved[id]) continue;
    const npc = npcs[id];
    const isVisitor = visitingIds.has(id);
    if (!isVisitor && npc.residency.status !== 'resident') continue;
    // Skip sleeping NPCs — they can't act on drives
    if (resolved[id].block === 'sleep') continue;
    // Skip NPCs in transit — they're walking, not doing activities.
    // Drives that set activityOverride would clash with the transit
    // activity ("heading to the Kitchen") and could make the NPC
    // appear to cook in a hallway.
    if (resolved[id].transit) continue;

    // Visitors (external-world plan Phase 1) pass their status through so
    // DRIVES' evaluateDrives can enforce VISITOR_DRIVE_ALLOWLIST — only
    // react_to_player + the social drives may fire for them.
    const driveResult = evaluateDrives(
      npc, id, npcs, resolved[id], gameState, rng, currentTick, { isVisitor }
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
      // Phase 8 (NPC inventories): the eat/gift drives mutate the NPC's
      // inventory through applyEffects (CONSUME_ITEM/MOVE_ITEM replace the
      // array on gameState.npcs[id]) — without this merge the stale
      // pre-drive copy in npcUpdates would win and the eaten groceries /
      // gifted item would snap back every tick, exactly like the memory
      // replacement bug this block was written to fix.
      if (postDrive.inventory) npcUpdates[id].inventory = postDrive.inventory;
    }
    // Cooldowns (and any other flags set by setCooldown during drive
    // evaluation) live on driveResult.updatedNpc.flags — without this
    // merge they were discarded each tick, making every drive's
    // cooldownTicks ineffective. Merged over any flags the effects wrote
    // rather than replacing, so ADD_FLAG and setCooldown can coexist.
    if (driveResult.updatedNpc.flags) {
      npcUpdates[id].flags = { ...(postDrive?.flags || {}), ...driveResult.updatedNpc.flags };
    }

    // Clothing state from drives (e.g., showering → towel). Correctness plan
    // Phase 4: the `clothingRestore` branch that used to follow this one is
    // gone. It set clothing back to 'dressed' in the SAME tick that set it to
    // 'towel' — both flags came off the same driveResult — so the towel state
    // was written and immediately destroyed, and nothing ever saw it. Its
    // comment said "on the next non-showering tick", which is now genuinely
    // what happens: pass 2 reverts TRANSIENT_CLOTHING next tick.
    if (driveResult.clothingState) {
      npcUpdates[id].clothing = driveResult.clothingState;
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

  // Visitor dormancy (external-world plan Phase 1): a visitor resolves only
  // during an active visit. When their window closes (or the day passes),
  // a lingering location would keep them "present" on the floor plan and in
  // scenes after they left. This is a maintenance sweep over externals
  // only — it is deliberately separate from the resolution loops above,
  // which run strictly on the active index. The `npc.location !== null`
  // guard keeps it a no-op for the near-universal case (no visitor has
  // ever been onsite, or none are onsite right now).
  const activeVisitNpcIds = new Set(activeVisits.map(v => v.npcId));
  for (const [id, npc] of Object.entries(npcs)) {
    const st = npc?.residency.status;
    // Externals only — anyone who lives here (resident, or a resident's
    // partner) keeps their location from the normal resolution above.
    if ((st !== 'visitor' && st !== 'prospective') || npc.location === null) continue;
    if (activeVisitNpcIds.has(id)) continue;
    npcUpdates[id] = { location: null, activity: '', transit: null };
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

// --- Player needs: the Phase 5 model (D1, D12) ---
// mood floors at -1, not 0 — it's the only need on a [-1, 1] scale (see
// NEEDS.mood config comment); the others are 0-100.
// Phase 5 re-based two of the four:
//  - hunger: the real state is hoursSinceLastMeal / mealsToday; the 0-100
//    player.hunger below is a DERIVED display value (satietyFrom),
//    recomputed here and on every meal, so every existing reader
//    (NEED_CONSEQUENCES, the LLM's Hunger line, the header bars, NPC
//    reactions) keeps working with no migration. It bottoms out at 0 exactly
//    at HUNGER_RHYTHM.starveHours, which is what fires the existing
//    NEED_CONSEQUENCES.hunger path.
//  - mood: nothing writes player.mood except this function, which EASES it
//    toward resolveMoodTarget(). Mood sources are either decaying impulses
//    (player.moodEvents — pushed by effects.js's ADJUST_NEED/MOOD_DELTA and
//    by UI's starvation/filthy beats) or persistent target terms (needs/
//    social/comfort/stress). Phase 4's standing-in-odor per-tick subtraction
//    (ROT.odorMoodPenaltyPerTick) moved into the comfort term as a steady
//    drag, so it no longer fights the easing.
// options.idle (D12): true when the decay comes from the continuous clock's
// sim checkpoint (real time passing while the player does nothing) — such
// minutes count at NEEDS.idleDecayMultiplier. Every action path (the other
// 12 call sites) leaves it false.
function decayPlayerNeeds(player, ticks, gameState, options = {}) {
  const mult = options.idle ? NEEDS.idleDecayMultiplier : 1;
  const minutes = ticks * CLOCK.tickMinutes * mult;

  const hoursSinceLastMeal = (player.hoursSinceLastMeal ?? 0) + minutes / 60;

  const day = gameState?.meta?.clock?.day ?? 0;
  const { moodEvents, eventTerm } = advanceMoodEvents(player.moodEvents, day);
  const moodTarget = resolveMoodTarget(player, gameState, eventTerm, hoursSinceLastMeal);
  const mood = clamp(player.mood + (moodTarget - player.mood) * MOOD_TARGET.easingPerTick * ticks * mult, -1, 1);

  return {
    ...player,
    hoursSinceLastMeal,
    mealsToday: player.mealsToday ?? 0,
    moodEvents,
    energy: Math.max(0, player.energy - NEEDS.energy.decayPerTick * ticks * mult),
    hygiene: Math.max(0, player.hygiene - NEEDS.hygiene.decayPerTick * ticks * mult),
    hunger: satietyFrom(hoursSinceLastMeal),
    mood,
  };
}

// Push a mood impulse. Every ADJUST_NEED player mood line (effects.js) and
// the UI's starvation/filthy beats land here — the bar itself is only moved
// by the easing in decayPlayerNeeds.
function pushMoodImpulse(player, delta, day) {
  if (!delta) return;
  if (!Array.isArray(player.moodEvents)) player.moodEvents = [];
  player.moodEvents.push({ day, delta: Number(delta) });
}

// Decay the impulse pool to a single eventTerm as of `day`, pruning entries
// whose contribution has decayed under MOOD_TARGET.eventPruneBelow (bounded:
// an impulse halves every eventHalfLifeDays, so it's pruned after ~10
// half-lives no matter how many were pushed). eventTerm is capped to the
// mood axis so a stack of one-turn spikes can't blow past the bar.
function advanceMoodEvents(moodEvents, day) {
  const events = Array.isArray(moodEvents) ? moodEvents : [];
  if (events.length === 0) return { moodEvents: events, eventTerm: 0 };
  const factor = Math.pow(0.5, 1 / MOOD_TARGET.eventHalfLifeDays);
  const kept = [];
  let eventTerm = 0;
  for (const e of events) {
    const age = Math.max(0, (day ?? 0) - (e.day ?? day ?? 0));
    const contrib = (e.delta || 0) * Math.pow(factor, age);
    if (Math.abs(contrib) >= MOOD_TARGET.eventPruneBelow) { kept.push(e); eventTerm += contrib; }
  }
  return { moodEvents: kept, eventTerm: clamp(eventTerm, -1, 1) };
}

// The hunger band for a given hours-since-last-meal (HUNGER_RHYTHM.bands).
function hungerBand(hoursSinceLastMeal) {
  for (const b of HUNGER_RHYTHM.bands) {
    if (hoursSinceLastMeal < b.maxHours) return b;
  }
  return HUNGER_RHYTHM.bands[HUNGER_RHYTHM.bands.length - 1];
}

// Derived 0-100 hunger display. Purely a function of hoursSinceLastMeal (a
// meal of any size resets the clock — food-size flavour lives in the mood
// impulse and the consumable values, not the bar). Reaches 0 exactly at
// HUNGER_RHYTHM.starveHours.
function satietyFrom(hoursSinceLastMeal) {
  return Math.max(0, HUNGER_RHYTHM.satietyStart - hoursSinceLastMeal * HUNGER_RHYTHM.satietyPerHour);
}

// The steady-state mood target: base + needs + social + comfort + stress +
// eventTerm. See the MOOD_TARGET block in CONFIG for the terms and their
// shapes. player.mood eases toward this in decayPlayerNeeds.
function resolveMoodTarget(player, gameState, eventTerm, hoursSinceLastMeal) {
  const cfg = MOOD_TARGET;
  const h = hoursSinceLastMeal ?? player.hoursSinceLastMeal ?? 0;
  const mealsToday = player.mealsToday ?? 0;
  let target = cfg.base;

  // needsTerm — hunger band + energy + hygiene + meal regularity.
  target += hungerBand(h).moodPenalty;
  const energyMax = player.energyMax || NEEDS.energy.max;
  if (player.energy <= 0) target += cfg.needsTerm.energyEmptyPenalty;
  else if (player.energy <= energyMax * cfg.needsTerm.energyWarnFrac) target += cfg.needsTerm.energyWarnPenalty;
  if (player.hygiene <= 0) target += cfg.needsTerm.hygieneEmptyPenalty;
  else if (player.hygiene < NEEDS.hygiene.warnBelow) target += cfg.needsTerm.hygieneWarnPenalty;
  if (mealsToday >= cfg.needsTerm.mealsWellFedCount) target += cfg.needsTerm.mealsWellFedBonus;
  else if (mealsToday === 0 && ((gameState?.meta?.clock?.minutes ?? 0) / 60) % 24 >= cfg.needsTerm.mealsSkippedFromHour) {
    target += cfg.needsTerm.mealsSkippedPenalty;
  }

  // socialTerm — average resident affection toward the player. The
  // interaction-based part of this term arrives as impulses (Phase 6's
  // watch-tv/eat-together bonuses in DEFS.ACTIONS); the affection baseline
  // is what exists today (talk to your roommates). Phase 6 adds the
  // presence bonus: a liked resident physically in the same room is worth
  // more than one three rooms away, and a hostile one contributes nothing
  // (clamped at 0) — "sitting with a liked roommate raises mood, with a
  // hostile one does not."
  if (gameState?.npcs) {
    const residents = Object.values(gameState.npcs).filter(n => n.residency?.status === 'resident');
    if (residents.length > 0) {
      let sum = 0;
      for (const n of residents) sum += n.relPlayer?.affection ?? 0;
      target += clamp(sum / residents.length, 0, 1) * cfg.social.affectionScale;
      let presentSum = 0;
      for (const n of residents) {
        if (n.location !== player.location) continue;
        presentSum += Math.max(0, n.relPlayer?.affection ?? 0);
      }
      if (presentSum > 0) target += clamp(presentSum * cfg.social.presencePerPerson, 0, cfg.social.presenceCap);
    }
  }

  // comfortTerm — the player's current room: cleanliness + what it smells of.
  const room = gameState?.world?.rooms?.[player.location];
  if (room) {
    target += ((room.cleanliness ?? cfg.comfort.cleanlinessMid) - cfg.comfort.cleanlinessMid) * cfg.comfort.cleanlinessScale;
  }
  // Perception plan Phase 2 (D10). This used to read a room-scoped boolean,
  // `room.odor === 'smelly'`, and apply the penalty flat. Two things were
  // wrong with that: a faint whiff and an unlivable stench cost exactly the
  // same, and the moment you stepped into the hallway the smell ceased to
  // exist. It now scales with the strongest smell the player can ACTUALLY
  // perceive from where they are standing, which follows them down the
  // corridor and fades with distance because propagation says it should.
  // typeof-guarded because resolveMoodTarget is called from paths that build a
  // partial gameState (no objects bucket) — those simply get no smell term.
  if (typeof perceiveSignals === 'function' && gameState?.objects) {
    let worstSmell = 0;
    for (const rec of perceiveSignals(gameState, 'player', player.location)) {
      if (rec.channel === 'smell' && rec.intensity > worstSmell) worstSmell = rec.intensity;
    }
    if (worstSmell > 0) target += cfg.comfort.odorPenalty * worstSmell;
  }

  // stressTerm — rent, burnout, unpaid bills.
  if ((player.rentOwed || 0) > 0) target += cfg.stress.rentPenalty;
  // getBurnoutMoodPenalty returns a POSITIVE magnitude — subtract it.
  if ((player.burnout?.burnoutLevel || 0) > 0) target += -getBurnoutMoodPenalty(player) * cfg.stress.burnoutScale;
  let unpaidBills = 0;
  const bills = gameState?.world?.bills;
  if (bills) for (const b of Object.values(bills)) if ((b.balance || 0) > 0) unpaidBills++;
  if (unpaidBills > 0) target += Math.max(cfg.stress.billsMaxPenalty, unpaidBills * cfg.stress.billsPenaltyPerUnpaid);

  // eventTerm — the decaying impulse pool (meals, AfterHours, chores, ...).
  target += eventTerm;

  return clamp(target, -1, 1);
}

// --- Spoilage pass (inventory overhaul Phase 4) ---
// Runs once per calendar day in the day-rollover path (UI's
// processDayRollover). Freshness itself is DERIVED at read time
// (freshnessOf — never a stored countdown), so this pass only handles the
// one irreversible event: a stack left past its shelf life PLUS
// ROT.graceDays converts to a MESS — it's removed from its container, the
// container's `rotten_food` state flips to 'rotten' (feeding the EXISTING
// cleanliness machinery via the def's dirtyWhen/cleanlinessWeight), and
// the container's own state carries it. A Rotten-but-within-grace stack stays
// put (still eatable, with the Rotten eating penalties in applyEatItem),
// so "throwing it out" during the Rotten window prevents the mess. The
// maid (cleanRoomObjects) and the player's throw-out button clear both the
// container state alone. Synchronous by design — it's a
// rollover hook like the others.
function processSpoilageForDay(gameState, day) {
  if (!gameState?.objects) return;
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    for (const obj of Object.values(objs || {})) {
      const odef = OBJECT_DEFS[obj.defId];
      // Only containers that declare the state can rot; anything else is
      // skipped so cleanRoomObjects' dirtyWhen-driven reset stays sound.
      if (!odef?.states?.rotten_food || !Array.isArray(obj.contents)) continue;
      const shelfMult = odef.container?.preservation ?? ROT.bagPreservation;
      let anyMess = false;
      const kept = [];
      for (const stack of obj.contents) {
        const def = ITEM_DEFS[stack.defId];
        if (!def?.perishable?.days) { kept.push(stack); continue; }
        const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
        if (anchor == null) { kept.push(stack); continue; } // age unknown — never instant rot
        const shelfDays = def.perishable.days * shelfMult;
        if (day > anchor + shelfDays + ROT.graceDays) { anyMess = true; continue; } // converts to a mess
        kept.push(stack);
      }
      if (kept.length !== obj.contents.length) obj.contents = kept;
      if (anyMess) {
        // Perception plan Phase 2 (D10): setting the container's state is now
        // the WHOLE job. The room-level `odor = 'smelly'` write that used to
        // sit here is gone — the smell is derived from this state by SIGNALS'
        // deriveStandingSignals, so a second mirrored flag could only ever
        // drift from it. Nothing has to remember to clear it either.
        obj.state = { ...obj.state, rotten_food: 'rotten' };
        refreshRoomCleanliness(gameState, bucket.replace(/^room_/, ''));
      }
    }
  }
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
// investment in income. See src/ref/complete/apartment-upgrades-plan.md.
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
      // Empty for a generated NPC — no pool exists to roll from yet. Authored
      // characters (Del) carry real ones, and buildNpcBlockV2 prints the line
      // only when the array is non-empty, so this costs a generated NPC
      // nothing. Filling it for rolled characters is roadmap Plan 4's job.
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
      // Filled by the prose expansion (LLM's expandCharacterProse merges its
      // `accessories` field in here) and read by
      // getPhysicalDescriptionForPrompt — which feeds both the conversation
      // prompt and image.js's character prompts.
      accessories: '',
      voice: {
        pitch: pickPhys(PHYS_POOL_VOICE_PITCH),
        texture: pickPhys(PHYS_POOL_VOICE_TEXTURE),
        accent: pickPhys(PHYS_POOL_VOICE_ACCENT),
      },
      gait: pickPhys(PHYS_POOL_GAIT),
      scent: pickPhys(PHYS_POOL_SCENT),
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
    // `odor` was a field here until perception plan Phase 2 (D10) — now derived.
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
    // Phase 5: hunger is a derived rhythm value (see satietyFrom). Starting
    // hoursSinceLastMeal 2 keeps the familiar 80 display (satiety 90−2×5) —
    // you had something on the way in — and mealsToday/moodEvents seed the
    // new real state.
    hoursSinceLastMeal: 2,
    mealsToday: 0,
    moodEvents: [],
    hunger: 80,
    hygiene: 100,
    mood: 0.2, // [-1, 1] scale — see NEEDS.mood config comment. 0.2 mirrors the old 60/100 starting mood at the same relative position.
    skills: {},
    // Inventory overhaul Phase 1: the player starts with their personal
    // effects — keys, wallet, ID — as `keyItem` stacks that the inventory
    // panel protects from drop/trash/give. acquiredDay is 1 (the game
    // starts on day 1) so the freshness model never treats them as stale.
    inventory: [
      { defId: 'apartment_keys', qty: 1, ownerId: 'player', meta: { acquiredDay: 1 } },
      { defId: 'wallet', qty: 1, ownerId: 'player', meta: { acquiredDay: 1 } },
      { defId: 'id_card', qty: 1, ownerId: 'player', meta: { acquiredDay: 1 } },
    ],
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
    // Recovery happens on rest days. See src/ref/sleep-and-alarm-plan.md.
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
      // Renovation overhaul: active/completed contracted jobs, one entry
      // per job booked through bookRenovationJob (see
      // src/ref/complete/renovation-occupancy-overhaul-plan.md).
      renovationJobs: [],
      // Visit spine (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 1):
      // the single queue of "who is onsite and why" — every external-NPC
      // presence window (contractor jobs today; maid contracts, food
      // orders, roommates' friends, player invitations in later phases)
      // lands here and nothing else. getActiveVisits (SIM) is the only
      // reader; statuses are scheduled → done (see processVisitsForDay).
      visits: [],
      // Meal commitments (inventory overhaul Phase 7, D7): the resident-side
      // sibling of visits — a schedule OVERRIDE (an accepted dinner relocates
      // the NPC to the dining room for its window; see resolveScheduleActivity
      // and COMMITMENTS). Empty by default, like visits, so old saves get it
      // from the loadGameState fallback with no migration.
      commitments: [],
      // Food delivery (external-world plan Phase 5): placed DoorDrop orders,
      // one record per order, resolved intra-day by processFoodOrdersNow (UI)
      // when the driver's visit window opens. World state rather than app
      // state because the driver and the handover outlive the app session.
      foodOrders: [],
      // Friends of roommates (external-world plan Phase 6): cheap
      // deterministic stubs for every resident's social circle, keyed by
      // stubId. A stub becomes a real NPC only when a visit is planned
      // (promoteFriendStub) — new-game generation never pays for the whole
      // extended cast. See ensureSocialCircles.
      externalStubs: {},
      // Escorts (external-world plan Phase 7): the persistent pre-generated
      // roster and every booking. The roster is deterministic (see
      // ensureEscortRoster) so it survives reloads and rebooking the same
      // person works; a booking record is { id, escortNpcId, services,
      // day, startTick, endTick, price, bookedDay, status } and schedules
      // a purpose:'escort' visit (bookEscort). Both live here, world-level,
      // because the visit and the person outlive the app session.
      escortRoster: [],
      escortBookings: [],
      // Hot Singles (AfterHours Site Expansion Phase 7): the deterministic
      // roster behind the site's "Hot Singles in your area" section. Each
      // entry is { npcId, slot } — the actual NPCs live in `npcs` (same
      // pre-generation as ensureEscortRoster) and the site-side profile
      // copy is derived deterministically per npcId at render time.
      hotSinglesRoster: [],
      // Move-in offers (external-world plan Phase 8): pending vouches for an
      // external NPC to move in, recorded when a resident (or the player)
      // advocates for them in conversation (applyProposal). Each record is
      // { npcId, advocatedBy: 'player' | residentNpcId, day }. The offer is
      // the admission ticket into RoomList's Offers screen and the assign
      // flow; it's cleared when the person moves in (acceptApplicant).
      moveInOffers: [],
      // Contractor tutorial (contractor doc Phase 3): one-shot tutorial /
      // milestone flags (tutorialRenoUsed, tutorial_<milestoneId>) — see
      // src/ref/complete/contractor-tutorial-overhaul-plan.md.
      flags: {},
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
      // The apartment starts in disrepair — see src/ref/complete/game-opening-plan.md.
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

  // Contractor Friend (src/ref/complete/contractor-tutorial-overhaul-plan.md, Phase 1):
  // a permanent, simulation-light NPC added at new-game setup so EVERY start
  // path (solo + cast) gets them. 'visitor' status + the resolveTick skip
  // keep them out of the sim entirely — never a room, never present,
  // contributes no rent. Their IM thread is pre-seeded here (the computer
  // state is part of world from day one) with a welcome message, which is
  // the tutorial's entry point. computeRent below is unaffected: visitors
  // don't contribute.
  state.world.computer = defaultComputerState();
  state.npcs[CONTRACTOR_ID] = createNpcFromBible(CONTRACTOR_BIBLE, 'visitor');
  // Contractor Friend (contractor doc Phase 4): pre-seed the Contractor's
  // memory with grounded facts — what they knew about the grandfather and
  // their opinions on the apartment — so IM replies have real material to
  // draw from (same memory.facts mechanism as any other NPC; the seeds live
  // in CONTRACTOR_INITIAL_FACTS, config.js).
  state.npcs[CONTRACTOR_ID].memory.facts = CONTRACTOR_INITIAL_FACTS.map(f => ({ ...f }));
  // Contacts (external-world plan Phase 2): Del is the ONE day-one contact —
  // he was your grandfather's contractor and reached out first, so his
  // thread exists before you've ever met him. Every other external NPC
  // must be asked for their number (see doAskContact, UI).
  state.npcs[CONTRACTOR_ID].contactKnown = true;
  const contractorThread = ensureImThread(state, CONTRACTOR_ID);
  contractorThread.msgs.push({ from: 'npc', text: CONTRACTOR_WELCOME_MESSAGE, day: clock.day, tick: getTickIndex(clock.minutes) });
  contractorThread.unread = 1;

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


// Renovation overhaul — migrate a persisted `world.upgrades` object to the
// post-split schema. Old saves carry the dead shared `bedroom_habitability`
// key: it was type-wide (one state for all four bedrooms), so its tier and
// condition map onto each of the four per-bedroom facilities (the player's
// own room floored at 'functional' — it's always habitable), then the dead
// key is pruned. Facilities the save predates entirely (the four bedroom
// facilities on a 12-facility save, plus the entry/dining/hallway additions)
// backfill from FACILITY_STARTING_TIERS so the RenoFix dashboard renders every
// facility instead of a partial list. Also backfills the Phase 9 `condition`
// field for saves that predate maintenance/decay (broken → 0, functional+ →
// startingCondition). Mirrors initUpgradesState's per-facility shape so the
// result is indistinguishable from a fresh game.
function normalizeUpgrades(rawUpgrades) {
  if (!rawUpgrades) return initUpgradesState();
  const fixed = {};
  for (const [id, upg] of Object.entries(rawUpgrades)) {
    if (id === 'bedroom_habitability') continue; // dead key — pruned
    fixed[id] = {
      ...upg,
      condition: upg.condition !== undefined ? upg.condition
        : (upg.tier === 'broken' ? 0 : MAINTENANCE.startingCondition),
    };
  }
  const shared = rawUpgrades['bedroom_habitability'];
  for (const def of FACILITY_LIST) {
    if (fixed[def.id]) continue;
    if (shared && def.id.startsWith('bedroom_habitability_')) {
      const isPlayer = def.id === 'bedroom_habitability_player';
      // The player's own room is ALWAYS habitable (locked decision #3 and
      // the isBedroomHabitable player exemption) — the old shared facility
      // only ever described the auxiliary bedrooms for the recruitment gate.
      // So the player room floors at 'functional' (keeping an 'upgraded'
      // the save actually had); the aux rooms inherit the shared tier as-is.
      const tier = isPlayer
        ? (shared.tier === 'broken' ? 'functional' : shared.tier || 'functional')
        : (shared.tier || 'broken');
      fixed[def.id] = {
        tier,
        condition: shared.condition !== undefined ? shared.condition
          : (tier === 'broken' ? 0 : MAINTENANCE.startingCondition),
      };
    } else {
      const tier = FACILITY_STARTING_TIERS[def.id] || 'broken';
      fixed[def.id] = { tier, condition: tier === 'broken' ? 0 : MAINTENANCE.startingCondition };
    }
  }
  return fixed;
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
  const npc = {
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
      recent: [],                                      // NPC Overhaul — the conversation buffer (MEMORY_BUDGET.maxRecent)
      styleCounters: { total: 0, sincePersonal: 0, recentTopics: [] }, // NPC Overhaul
    },
    flags: {},
    // Contacts (external-world plan Phase 2): do you have their number?
    // Explicit here rather than relying on the schema default, so a fresh
    // NPC round-trips through validateCharacter with the field present.
    // Del is flipped true at new-game setup; everyone else earns it.
    contactKnown: false,
    // Friends of roommates (external-world plan Phase 6): stubIds of this
    // character's own circle, filled by ensureSocialCircles once they're a
    // resident. Externals keep an empty circle — a delivery driver's friends
    // are not the household's business.
    socialCircle: [],
    // P6: suspicion[subject] (0..1). Additive default, same precedent as
    // player.skills (SKILLS) — every read/write guards with `|| {}`, so no
    // FOLDER_VERSIONS migration is needed for existing saves.
    suspicion: {},
    // P7: clothing state — dressed|sleepwear|towel|undressed. Drives
    // (e.g., showering) set this; schedule block 'sleep' sets 'sleepwear'.
    // Same additive-default pattern as suspicion/skills.
    clothing: 'dressed',
  };
  // Phase 8 (D8): NPCs own things. Seeded here — at THE single creation
  // point every path (cast generation, studio imports, applicants,
  // externals) funnels through — from the lifestyle template derived from
  // the bible (seedNpcInventory, NPC.js); deterministic per genSeed, so a
  // reload or a migration of the same NPC produces the same inventory.
  return seedNpcInventory(npc, 1);
}

// ===== /SECTION: SIM =====
