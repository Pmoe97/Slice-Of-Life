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
//
// Settings & Pause Overhaul Phase 6 (D14): the Population tab's genderDist
// is the single source — the default 40/40/8/6/6 is exactly the ratio
// CHAR_GEN.genderWeights carried, so a default-settings seed reproduces the
// same identities as before. CHAR_GEN.genderWeights remains the fallback
// (only reachable on a corrupt store — normalizeSettings already guarantees
// a shape). This makes rollGender a settings read for EVERY caller at once:
// the apartment cast, applicants, studio builds, stubs, Hot Singles and all
// external presence.
function rollGender(rng) {
  const weights = (typeof settingsCache !== 'undefined' && settingsCache && settingsCache.genderDist)
    ? settingsCache.genderDist
    : CHAR_GEN.genderWeights;
  const entries = Object.entries(weights).filter(([, w]) => Number(w) > 0);
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let r = rng() * total;
  for (const [g, w] of entries) {
    r -= Number(w);
    if (r <= 0) return g;
  }
  return entries[entries.length - 1][0];
}

// Settings & Pause Overhaul Phase 6 (D13): deterministic species roll from
// the settings raceDist (default {human:100}). The draw is APPENDED at the
// very end of a character's sequence — never inserted mid-stream — so with
// the default human-100% distribution every existing seed's cast is
// byte-identical to pre-overhaul (design invariant 4). raceDist keys are
// RACES ids (defs.settings.js); unknown or empty weights fall back to human.
function rollSpecies(rng) {
  const weights = (typeof settingsCache !== 'undefined' && settingsCache && settingsCache.raceDist)
    ? settingsCache.raceDist
    : { human: 100 };
  const entries = Object.entries(weights).filter(([, w]) => Number(w) > 0);
  if (!entries.length) return 'human';
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let r = rng() * total;
  for (const [g, w] of entries) {
    r -= Number(w);
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

// Weekday index for a calendar day: 0=Mon .. 6=Sun. Day 1 is a Sunday
// (index 6), and stays one forever — see the D2 note below.
//
// D2 (seasonal-calendar-and-sandbox-plan): the base shift is (day + 5) % 7,
// NOT a reorder of WEEKDAY_NAMES. Reordering the array would silently move
// every persisted maid contract's schedule[].weekday (a raw 0-6 index) by
// one day, with no error and no migration hook. The shift changes which
// CALENDAR day a given weekday falls on — the intended change — while index
// 2 keeps meaning Wednesday.
function getWeekday(day) {
  return ((day + 5) % 7);
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
// Layered on top of getWeekday — day-of-week and the season/year cycles are
// all pure functions of `day`, so callers never need to hold a separate
// calendar object. The season period (35 days) and the tax period (70 days)
// are deliberately separate constants (design invariant 7) — they were the
// same number for the life of the economy plan, and every formula that read
// `daysPerQuarter` meant one of the two without saying which.

// Tax period index 0-1 for a given day. Days are 1-indexed, so day 1 is in
// tax period 0; day 70 is the last day of tax period 0 (end of Summer);
// day 71 starts tax period 1 (end of Winter is day 140). Taxes bill here.
function getTaxPeriod(day) {
  return Math.floor((day - 1) / CALENDAR.daysPerTaxPeriod) % 2;
}

// True on the last day of each tax period (days 70, 140, 210, ...).
function isTaxPeriodEnd(day) {
  return ((day % CALENDAR.daysPerTaxPeriod) === 0);
}

// Day index within the current tax period, 1-70.
function getTaxPeriodDay(day) {
  return ((day - 1) % CALENDAR.daysPerTaxPeriod) + 1;
}

// Season index 0-3 for a given day. Days are 1-indexed, so day 1 is in
// season 0 (spring); day 35 is the last day of spring; day 36 starts summer.
function getSeasonIndex(day) {
  return Math.floor((day - 1) / CALENDAR.daysPerSeason) % 4;
}

// True on the last day of each season (days 35, 70, 105, 140, ...).
function isSeasonEnd(day) {
  return ((day % CALENDAR.daysPerSeason) === 0);
}

// Season for a given day: spring/summer/autumn/winter.
function getSeason(day) {
  return CALENDAR.seasons[getSeasonIndex(day)];
}

// Year number since the start of the game — day 1 is year 1. Mostly so
// tax and seasonal utilities carry a long-run count.
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

function ordinalSuffix(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

// "Sunday, 1st of Spring, Year 1". The long form — every call site takes
// this except the two space-constrained ones below, which use
// formatDateShort (the HUD `hdr-day` readout and the phone lock screen).
function formatDate(day) {
  const weekday = WEEKDAY_NAMES[getWeekday(day)];
  const dom = ((day - 1) % CALENDAR.daysPerSeason) + 1;
  const season = CALENDAR.seasonNames[getSeason(day)];
  return `${weekday}, ${dom}${ordinalSuffix(dom)} of ${season}, Year ${getYear(day)}`;
}

// "Sun 12 Autumn" — the HUD day readout and the phone lock screen. The long
// form is ~30 chars against the old ~18 and overflows both.
function formatDateShort(day) {
  const weekday = WEEKDAY_NAMES[getWeekday(day)].slice(0, 3);
  const dom = ((day - 1) % CALENDAR.daysPerSeason) + 1;
  return `${weekday} ${dom} ${CALENDAR.seasonNames[getSeason(day)]}`;
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

// --- Disinhibition (npc-initiative-plan.md D11) ---------------------------
// How forward a character is: how readily they act on wanting something,
// rather than waiting to be sure it is welcome. The sibling of npcCuriosity
// above, written the same way and for the same reason — the initiative plan
// needs it in more than one place, and two inline copies of a personality
// formula drift.
//
// `bible.deviantLevel` was the obvious candidate and cannot be used on its
// own: it is baked ONLY by COMPUTER's Hot Singles generator and measured null
// for all 36 members of the roommate cast, so anything gated on it is dead for
// everybody the player actually lives with. So the WEIGHTING is what is
// shared (AH_HOT_SINGLES_TUNING.deviantWeights, which createExternalNpc bakes
// with), the derivation runs for anyone with a temperament, and a baked value
// still wins where one exists — Hot Singles keep their authored level and the
// two populations stay comparable on one scale.
//
// [0,1], where 0.5 is a perfectly average temperament.
function disinhibitionFromTemperament(temperament) {
  const t = temperament || {};
  const w = AH_HOT_SINGLES_TUNING.deviantWeights;
  const raw = 0.5 + 0.5 * (
      w.volatility    * (t.volatility    || 0)
    + w.openness      * (t.openness      || 0)
    + w.assertiveness * (t.assertiveness || 0)
  );
  return Math.max(0, Math.min(1, raw));
}

function npcDisinhibition(npc) {
  const baked = npc?.bible?.deviantLevel;
  if (typeof baked === 'number') return Math.max(0, Math.min(1, baked));
  return disinhibitionFromTemperament(npc?.bible?.temperament);
}

// --- Occupation affinity (vocation-and-lifestyle plan D7/D9) ---------------
// How well an occupation fits a temperament, as a WEIGHT for weightedPick.
//
// There is no `baseWeight` to multiply: OCCUPATION_POOL entries have never
// carried a `weight` field, so weightedPick has always fallen through to
// `item.weight || 1` and every job was equally likely. Affinity IS the weight,
// and an entry with no `affinity` block scores exactly 1.0 — which is what
// lets the pool grow one annotated row at a time instead of in a flag day.
//
// TWO KINDS OF NUMBER, deliberately (D9):
//
//   disinhibitionFloor — a HARD gate, and the only one in the system. Below
//     it the occupation scores ZERO and cannot be drawn. It exists for the
//     adult-industry entries: a reserved, rule-bound character being handed
//     that work by an unlucky roll is the exact failure this coupling was
//     built to prevent. Reuses npcDisinhibition's model (D8) rather than
//     inventing a modesty axis — the signal already exists, is already shared
//     between the roommate cast and Hot Singles, and is already tuned.
//
//   temperament weights — SOFT. Each multiplies by `1 + w * axis` over an
//     axis in [-1,1], and the product is clamped into
//     [affinityFloor, affinityCeiling] with a floor that is deliberately NOT
//     zero. A shy accountant and a gregarious accountant are both real
//     people; a system that forbids one of them is a caricature generator.
//
// Pure. Returns a non-negative number.
function occupationAffinity(occ, temperament) {
  const a = occ && occ.affinity;
  if (!a) return 1.0;
  if (a.disinhibitionFloor != null
      && disinhibitionFromTemperament(temperament) < a.disinhibitionFloor) {
    return 0;
  }
  let w = 1.0;
  for (const axis in (a.temperament || {})) {
    w *= 1 + a.temperament[axis] * (temperament?.[axis] || 0);
  }
  return Math.max(VOCATION_TUNING.affinityFloor,
         Math.min(VOCATION_TUNING.affinityCeiling, w));
}

// The other direction of the same coupling (D7). Occupation is drawn FROM
// temperament above; personality traits are then drawn with a lean toward the
// occupation's own — so a Cam Model tends to come out brazen and a Bookkeeper
// meticulous, without either being required.
//
// It has to work this way round because traits are rolled late in
// rollCastSlot, long after the occupation; gating the occupation on traits
// would mean hoisting the trait draw too, for a coupling that reads better as
// a lean than as a gate. An absent multiplier is 1.0, so an un-annotated
// occupation draws traits exactly as before.
function traitAffinityFor(occ, trait) {
  const t = occ && occ.traitAffinity;
  if (!t) return 1;
  return t[trait] != null ? t[trait] : 1;
}

// --- The offsite predicate (vocation-and-lifestyle plan D12) ---------------
// The ONE answer to "is this NPC out of the flat right now."
//
// Before this plan, nine sites across six files each asked it for themselves
// with a bare `block === 'work' || block === 'commute' || ...` string
// comparison — sim.js's two location branches and the resolveTick decision
// loop, cognition.js's held-record mirror and its work-commitment branch,
// interruption.js's eligibility gate, npc.js's outfit selection (via
// WORK_BLOCKS), and the partner-visit bind. That was correct exactly as long
// as work ALWAYS meant offscreen. The moment one occupation works from home
// it stops being correct in nine places at once, and two of those nine carry
// consequences nobody would have looked for: a remote worker becomes newly
// eligible for interruption.js's roll (D13), and would otherwise wear the
// office outfit at home all day (D14).
//
// So the question gets one asker. `block` is still the trigger — a non-work
// block is never offsite — but the ANSWER now depends on the occupation's
// workMode. Design invariant 2: a tenth caller that tests the block name
// inline is the bug this exists to prevent.
//
// `npcId` is optional and used only to seed the self-employed gig-day roll;
// callers that have it should pass it, and the fallback to the bible name
// keeps the predicate callable from the few sites that only hold the record.
//
// Pure: reads the bible and the clock, writes nothing.
function npcIsOffsite(npc, block, clock, npcId) {
  if (block !== 'work' && block !== 'commute' && block !== 'commute_home') return false;
  const mode = npc?.bible?.occupation?.workMode || 'on_site';
  switch (mode) {
    // D3/D21: no job at all. `SCHEDULES.standard` has no work block, so this
    // is defensive — an unemployed NPC should never reach here with a work
    // block — but a mis-templated NPC stays home rather than vanishing.
    case 'none':          return false;
    case 'remote':        return false;
    case 'self_employed': return isGigDay(npc, clock, npcId);
    case 'hybrid':        return isOfficeDay(npc, clock);
    default:              return true;   // on_site — the pre-plan behavior
  }
}

// D4: which days a hybrid worker is in the office. The set is rolled once per
// NPC in rollCastSlot and stored on the occupation, because SCHEDULES only
// distinguishes weekday from weekend and day-of-week variance cannot live
// there without inventing seven-day templates.
//
// `officeDays` holds getWeekday indices (0=Mon .. 6=Sun), so the pool is
// 0-4. An empty set means the roll has not happened (a pre-plan save, or a
// hand-authored NPC): treat them as fully on-site, which is what they were.
function isOfficeDay(npc, clock) {
  const days = npc?.bible?.occupation?.officeDays;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(getWeekday(clock?.day ?? 1));
}

// D2: a self-employed NPC mostly works at home, but some days the work is
// somewhere else — a shoot, a client, a venue. Seeded per NPC per day so a
// given save reproduces a given week (C6), and deliberately NOT stored: it is
// a pure function of identity and date, so it needs no field and no migration.
function isGigDay(npc, clock, npcId) {
  if (isWeekend(clock?.day ?? 1)) return false;
  const rate = VOCATION_TUNING.selfEmployedGigDayChance;
  if (!(rate > 0)) return false;
  const who = npcId || npc?.bible?.name || 'anon';
  return seededRng(`gigday_${who}`, `d${clock?.day ?? 1}`)() < rate;
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

// --- Name uniqueness (Discord feedback, 2026-08-24) ---
// Every UI surface shows only bible.name, never the internal npcs-dict key —
// two genuinely distinct NPCs sharing a first name read to the player as one
// person split across rooms (reported: the same name "in the bathroom AND
// the living room", sharing a conversation, offered twice in a threesome
// picker — three symptoms that all fall out of nothing ever disambiguating
// two same-named-but-different npcIds). The name pools are small (26 entries
// per gender bucket, config.js CHAR_GEN.namePools) and shared by every
// generator in the game — cast, Classifieds applicants, friend stubs,
// escorts, hot singles, outside partners — so collisions are close to
// guaranteed over a real playthrough. Occupation and interests already get
// an explicit no-repeat guard in rollCastSlot (usedOccupationCats/
// priorTagSets); names never did. usedNpcNames/rollUniqueName close that gap
// for every deterministic name roll; dedupeCastNames (below) covers the one
// case those two can't see — parallel LLM prose calls in the same batch,
// which can't know what name a sibling call is about to invent mid-flight.
function usedNpcNames(gameState) {
  const names = new Set();
  for (const npc of Object.values(gameState.npcs || {})) {
    if (npc?.bible?.name) names.add(npc.bible.name.toLowerCase());
  }
  for (const stub of Object.values(gameState.world?.externalStubs || {})) {
    if (stub?.name) names.add(stub.name.toLowerCase());
  }
  if (gameState.player?.name) names.add(gameState.player.name.toLowerCase());
  return names;
}

// Picks a first name from the gender-appropriate pool (the same 20%-neutral
// split every caller already rolled inline), rerolling against `usedNames`.
// Bounded and never hard-fails (character creation's standing rule — see
// rollCastSlot's occupation-fallback comment): the last draw wins if every
// reachable pool name is somehow already taken. Omitting `usedNames`
// reproduces the old unguarded single draw exactly, byte-for-byte.
function rollUniqueName(rng, gender, usedNames) {
  const maxAttempts = CHAR_GEN.maxAttempts || 20;
  let name;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const useNeutral = rng() < 0.2;
    const pool = useNeutral ? CHAR_GEN.namePools.first_n
      : (gender === 'male' || gender === 'trans_male') ? CHAR_GEN.namePools.first_m
      : CHAR_GEN.namePools.first_f;
    name = pool[Math.floor(rng() * pool.length)];
    if (!usedNames || !usedNames.has(name.toLowerCase())) break;
  }
  return name;
}

// Post-generation safety net for the one collision source rollUniqueName
// can't see: approveCastAndStartGame/applySandboxRoommateProse expand every
// npc's prose (name included) via PARALLEL LLM calls (Promise.all) — none of
// them can see a sibling call's freshly-invented name until every promise
// has settled. Run once after that batch resolves: first claim (generation
// order) wins, any later duplicate gets a fresh deterministic name via
// fallbackName rather than overwriting whichever bible got there first.
// First + last, for identity-listing contexts (a roster, a picker, an
// applicant browse card) where two people might share a first name and the
// player needs to tell them apart — casual in-scene text (chat bubbles,
// action chips, floor-plan labels, narration) stays first-name-only, same
// as every real person is addressed day to day. Graceful on an old save's
// or a legacy bible's missing surname: reads as first-name-only, exactly
// like before this field existed.
function fullName(bible) {
  if (!bible) return '';
  return bible.surname ? `${bible.name} ${bible.surname}` : (bible.name || '');
}

function dedupeCastNames(npcs, extraUsedName) {
  const seen = new Set();
  if (extraUsedName) seen.add(extraUsedName.toLowerCase());
  // A hand-authored name (the contractor, or a player-authored roommate)
  // always keeps its slot — process those first so a same-named rolled
  // sibling is the one that gets renamed, never the authored one.
  const all = Object.values(npcs);
  const authored = all.filter(npc => pathIsAuthored(npc?.bible?.authoredFields, 'name'));
  const rest = all.filter(npc => !pathIsAuthored(npc?.bible?.authoredFields, 'name'));
  for (const npc of [...authored, ...rest]) {
    const name = npc?.bible?.name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const fresh = fallbackName(npc.bible, seen);
      npc.bible = { ...npc.bible, name: fresh };
      seen.add(fresh.toLowerCase());
    } else {
      seen.add(key);
    }
  }
}

// --- Visits (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 1) ---
// world.visits[] is the single source of truth for "who is onsite and why".
// A visit is the presence window of an external NPC: their location and
// activity are purpose-driven, they don't decay needs, and outside their
// window they are fully dormant. getActiveVisits is the ONLY door
// consumers use — the tick loop, scene layer, and floor plan all ask this
// one question rather than scanning individual sources (renovation jobs,
// and later contracts/orders/bookings/invites).
//
// External-world retiming Phase 1 (D1/D6): windows are absolute-minute
// pairs [startAbs, endAbs), computed once at schedule time (scheduleVisit)
// from whatever unit the source thinks in — clockToAbsolute's day*1440+
// minutes formula kept inline because time.js loads after sim.js. Reads
// compare the clock's absolute minute against them directly; no day+tick
// re-derivation, and the old day-scoping check falls out of the monotonic
// comparison (a window scheduled for another day can't contain now).
function visitDay(v) {
  return v.startAbs != null ? Math.floor(v.startAbs / 1440) : v.day;
}

function getActiveVisits(gameState) {
  const visits = gameState.world?.visits;
  if (!visits || visits.length === 0) return [];
  const { day, minutes } = gameState.meta.clock;
  const abs = day * 1440 + minutes;
  return visits.filter(v =>
    v.status !== 'done' && v.status !== 'deferred' &&
    Number.isFinite(v.startAbs) && Number.isFinite(v.endAbs) &&
    abs >= v.startAbs && abs < v.endAbs
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
// model (external-world retiming D1): the window is stored as an
// absolute-minute pair [startAbs, endAbs), converted ONCE here at schedule
// time from whatever unit the source passes — the record never re-derives
// it, and day-scoping for idempotency/retirement goes through visitDay.
// status is 'scheduled' on creation and flips to 'done' by
// processVisitsForDay once the day passes.
function scheduleVisit(gameState, sourceId, day, visit) {
  const visits = gameState.world.visits || (gameState.world.visits = []);
  const existing = visits.find(v => v.sourceId === sourceId && visitDay(v) === day);
  if (existing) return existing;
  const record = {
    id: `visit_${day}_${visits.length}`,
    npcId: visit.npcId,
    purpose: visit.purpose,
    sourceId,
    startAbs: visit.startAbs,
    endAbs: visit.endAbs,
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
      startAbs: d * 1440 + win.startMinute,
      endAbs: d * 1440 + win.endMinute,
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

// --- Outside partners (Intimacy & Voyeurism Phase 14, D14) -----------------
// The boyfriend/girlfriend who comes over and disappears to her room. Some
// residents start in a committed/seeing relationship with someone who does
// NOT live here: a full external NPC (the exact createExternalNpc path the
// escorts and hot singles use, so they are full NPCs on every existing
// external-world path — IM contacts once contactKnown, peekable, talkable,
// move-in eligible) with a warm castWeb pair and a relationship record
// seeded from OUTSIDE_PARTNER_TUNING.warmAxes. Idempotent like
// ensureSocialCircles: called at new-game write and at day rollover, so a
// roommate who moves in on day 40 grows a partner (or not) the same
// deterministic way the founding cast did, and a save written before this
// phase picks partners up without a migration.
//
// The `world.outsidePartners` map (residentId → { npcId, sinceDay,
// lastVisitDay }) is the direct index the visit planner, the sext drive and
// the infidelity writer read — the relationship store is the source of truth
// (a record that contradicts a partner, e.g. an in-house couple forming,
// still reads as a committed couple through getRelationship), this is just
// the cheap lookup.
function ensureOutsidePartners(gameState) {
  const partners = gameState.world.outsidePartners || (gameState.world.outsidePartners = {});
  const day = gameState.meta?.clock?.day ?? 1;
  for (const [npcId, npc] of Object.entries(gameState.npcs)) {
    if (!npc || npc.residency?.status !== 'resident') continue;
    if (partners[npcId]) continue;
    // A resident who already holds a seeing/committed record (an in-house
    // couple forming on a later day, or another partner) never gains a second
    // — one relationship record is the whole gate, exactly as the plan's
    // "seeded from world.relationships" reads. Exact-split membership: a key
    // `npc_10|outside_npc_1` must not read as containing `npc_1`.
    const store = gameState.world.relationships || {};
    let hasRel = false;
    for (const [key, rec] of Object.entries(store)) {
      if (rec.status !== 'committed' && rec.status !== 'seeing') continue;
      if (key.split('|').includes(npcId)) { hasRel = true; break; }
    }
    if (hasRel) continue;
    const rng = seededRng(gameState.meta?.seed ?? gameState.seed, `outside_${npcId}`);
    if (rng() >= OUTSIDE_PARTNER_TUNING.partnerChance) continue;

    const partnerId = `outside_${npcId}`;
    const partner = createExternalNpc(gameState, partnerId, partnerId, 'Partner');
    partner.contactKnown = true;
    partner.needs = { ...(partner.needs || {}), desire: OUTSIDE_PARTNER_TUNING.desireSeed };
    // Warm castWeb both ways — the willingness gate's attraction/phase terms
    // read these, and the pair act's deltas move them on every act.
    const axes = { ...OUTSIDE_PARTNER_TUNING.warmAxes };
    const web = gameState.world.castWeb || (gameState.world.castWeb = {});
    const key = pairKey(npcId, partnerId);
    web[key] = web[key] || createBlankPair(npcId, partnerId);
    web[key].axes[`${npcId}→${partnerId}`] = { ...axes };
    web[key].axes[`${partnerId}→${npcId}`] = { ...axes };
    // The relationship record — status committed, no history yet: their first
    // act IN THE GAME writes first_sex. The player can read the couple on the
    // Present cards immediately.
    const rec = getRelationship(gameState, npcId, partnerId, true);
    rec.status = 'committed';
    rec.lastTransitionDay = day;
    partners[npcId] = { npcId: partnerId, sinceDay: day, lastVisitDay: null };
  }
  return partners;
}

// The direct lookup the sext drive and visit planner use: the resident's
// outside partner's id, or null. PURE.
function outsidePartnerIdOf(gameState, npcId) {
  return gameState?.world?.outsidePartners?.[npcId]?.npcId || null;
}

// Plan today's outside-partner visits: one deterministic roll per resident
// who has a partner, gated by the visit cooldown, deferred by the soft cap
// exactly like friend visits (organic visits stand down when the house is
// busy — locked decision 6). The window is the evening
// (OUTSIDE_PARTNER_TUNING.windowStart/EndMinute) and the visit lands in the
// resident's BEDROOM: a partner who comes over heads for their person's
// room, which is what makes the Phase 13 pair act reachable the moment both
// are home ("they disappear to her room"). Pure planning — returns what
// happened, narration is the UI's job, the same split planFriendVisitsForDay
// uses.
function planOutsidePartnerVisitsForDay(gameState, day) {
  ensureOutsidePartners(gameState);
  const partners = gameState.world.outsidePartners || {};
  const results = [];
  for (const [residentId, entry] of Object.entries(partners)) {
    const resident = gameState.npcs[residentId];
    const partner = gameState.npcs[entry.npcId];
    if (!resident || !partner) continue;
    if (entry.lastVisitDay != null && day - entry.lastVisitDay < OUTSIDE_PARTNER_TUNING.visitCooldownDays) continue;
    const rng = seededRng(gameState.meta.seed, `partnervisit_${residentId}_${day}`);
    if (rng() >= OUTSIDE_PARTNER_TUNING.visitChancePerDay) continue;

    const startMinute = OUTSIDE_PARTNER_TUNING.windowStartMinute
      + Math.floor(rng() * (OUTSIDE_PARTNER_TUNING.windowEndMinute - OUTSIDE_PARTNER_TUNING.windowStartMinute + 1));
    const duration = OUTSIDE_PARTNER_TUNING.visitDurationMin
      + Math.floor(rng() * (OUTSIDE_PARTNER_TUNING.visitDurationMax - OUTSIDE_PARTNER_TUNING.visitDurationMin + 1));

    const deferred = countVisitorsForDay(gameState, day) >= VISIT_TUNING.softCap;
    const roomId = resident.residency?.room || 'living_room';
    const visit = scheduleVisit(gameState, `partner_${entry.npcId}_${day}`, day, {
      npcId: deferred ? null : entry.npcId,
      purpose: 'partner',
      startAbs: day * 1440 + startMinute,
      endAbs: day * 1440 + Math.min(1440, startMinute + duration),
      roomId,
      hostNpcId: residentId,
    });
    if (deferred) {
      visit.status = 'deferred';
      results.push({ deferred: true, residentId, day });
      continue;
    }
    entry.lastVisitDay = day;
    results.push({
      deferred: false, residentId, day,
      npcId: entry.npcId,
      partnerName: partner.bible?.name || 'Someone',
      residentName: resident.bible?.name || 'Someone',
      startMinute,
    });
  }
  return results;
}

// The active visit whose SOURCE is an outside-partner visit for a given
// visitor — the same join getActiveEscortVisit does for escorts (the visit
// was scheduled with sourceId === `partner_<npcId>_<day>`), so consumers ask
// one question instead of scanning. Returns the visit record or null.
function getActivePartnerVisit(gameState, npcId) {
  return getActiveVisits(gameState).find(v => v.purpose === 'partner' && v.npcId === npcId) || null;
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
    if (visitDay(v) !== day) continue;
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

    const startMinute = FRIEND_TUNING.startMinuteMin
      + Math.floor(rng() * (FRIEND_TUNING.startMinuteMax - FRIEND_TUNING.startMinuteMin + 1));
    const duration = FRIEND_TUNING.durationMinutesMin
      + Math.floor(rng() * (FRIEND_TUNING.durationMinutesMax - FRIEND_TUNING.durationMinutesMin + 1));

    // Soft cap: check BEFORE promoting, so a deferred visit costs nothing.
    const deferred = countVisitorsForDay(gameState, day) >= VISIT_TUNING.softCap;
    const promoted = deferred ? null : promoteFriendStub(gameState, stub.stubId);
    if (!deferred && !promoted?.ok) continue;

    const visit = scheduleVisit(gameState, `friend_${stub.stubId}_${day}`, day, {
      npcId: deferred ? null : promoted.npcId,
      purpose: 'social',
      startAbs: day * 1440 + startMinute,
      // The old endTick clamp (min 48) reproduced exactly as the minute
      // clamp: a window that would cross midnight ends at it — inactive the
      // instant the next day starts.
      endAbs: day * 1440 + Math.min(1440, startMinute + duration),
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
      startMinute,
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
    const clock = gameState.meta.clock;
    const elapsed = Math.max(0, Math.floor((clock.day * 1440 + clock.minutes - visit.startAbs) / 30));
    return {
      block: 'leisure',
      location: scope[elapsed % scope.length],
      activity,
      transit: null,
    };
  }
  // An outside partner (Intimacy & Voyeurism Phase 14, D14) is here for
  // their RESIDENT, so they follow them through the shared space like any
  // social guest — and, unlike a guest, into the resident's OWN private
  // bedroom: a boyfriend who comes over disappears to her room, which is
  // what makes the Phase 13 pair act reachable the moment they co-locate.
  // Other residents' private rooms stay off-limits (the same line the escort
  // branch draws), and if the host is off-screen (at work) the partner waits
  // in the room the visit was booked into — their person's bedroom, which
  // they have a key to.
  if (visit && visit.purpose === 'partner' && visit.hostNpcId) {
    const hostLoc = resolved?.[visit.hostNpcId]?.location ?? gameState.npcs[visit.hostNpcId]?.location;
    const hostRoom = gameState.npcs[visit.hostNpcId]?.residency?.room;
    const followable = hostLoc && (ROOMS[hostLoc]?.type === 'common' || hostLoc === hostRoom);
    return {
      block: 'leisure',
      location: followable ? hostLoc : visit.roomId,
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
// Phase 7 (D7): a resident with an ACTIVE accepted commitment is relocated to
// the commitment's room for its window — the invitation binds, it doesn't
// hope. The commitment check is the FIRST question asked, so a committed
// dinner beats whatever the work template says (a day_shift roommate would
// otherwise be mid-evening leisure somewhere random). The extra args are
// optional: callers without a gameState (interruption.js's schedule reads)
// keep the old pure-template behavior.
//
// Initiative plan Phase 4: the block comes from COMMITMENT_KINDS rather than
// being the literal 'meal' this returned when a meal was the only kind. A
// hangout resolves as ordinary 'leisure' IN THE COMMITMENT'S ROOM — the
// binding is `commitmentRoomId`, which is why resolveTick keys its relocation
// on that field now and not on the block name. Returns the kind alongside it
// so the caller can name the activity without a second lookup.
function resolveScheduleActivity(npc, clock, gameState, npcId) {
  if (gameState && npcId) {
    const commitment = activeCommitmentFor(npcId, gameState);
    if (commitment) {
      return {
        block: COMMITMENT_KINDS[commitment.kind].block,
        weight: 1.0,
        commitmentRoomId: commitment.roomId,
        commitmentKind: commitment.kind,
      };
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

  // Phase 7 Dimension 3 (sleepRhythm) — the greenfield reader. A schedule
  // template fixes a single `sleep` span for every holder; this is the per-NPC
  // variation over it, derived (rolled per day, stored nowhere — D4/D21's
  // shape). Nothing leaves the closed block vocabulary (D1): the block is still
  // `sleep`; the NPC just occupies it for a different SPAN, and the player sees
  // it as who is up in `morning` and who is still going in `wind_down`. The
  // leading `sleep` block is truncated (early) / extended (late) / jittered
  // (erratic) at its END — the boundary the schedule itself puts on the wake —
  // leaving every other block to its own template range. `regular` (the default,
  // and every legacy NPC) is the identity: the template's own span, byte-for-
  // byte the pre-phase block. Player sleep is off-limits (SLEEP / the alarm
  // system is the player's; this touches only the template sleep block).
  const sleepRhythm = npc?.bible?.occupation?.sleepRhythm;
  const sleepEntry = sched.sleep && sched.sleep[0];
  let effectiveSleepEnd = null;
  if (sleepRhythm && sleepRhythm !== 'regular' && sleepEntry) {
    const [sleepStart, sleepBaseEnd] = sleepEntry;
    if (sleepRhythm === 'early') {
      effectiveSleepEnd = Math.max(sleepStart, sleepBaseEnd - SLEEP_RHYTHM.earlyTicks);
    } else if (sleepRhythm === 'late') {
      effectiveSleepEnd = sleepBaseEnd + SLEEP_RHYTHM.lateTicks;
    } else if (sleepRhythm === 'erratic') {
      // per-day jitter of the wake boundary, derived (rolled per day, stored
      // nowhere). rounded to a whole tick, seeded by (npc id + day) so it is
      // stable for the whole day and differs across days and people.
      const jitterSeed = String(npc.id ?? 'npc') + '|' + (clock?.day ?? 0);
      const j = (hashStr(jitterSeed) % (SLEEP_RHYTHM.erraticTicks * 2 + 1)) - SLEEP_RHYTHM.erraticTicks;
      effectiveSleepEnd = Math.max(sleepStart, sleepBaseEnd + j);
    }
  }
  // For every rhythm the sleep span is just [sleepStart, effectiveSleepEnd): an early
  // riser wakes early (the tail of the span falls to whatever block the template put
  // there), a late riser keeps sleeping past the template end, an erratic jitter
  // clips or extends it. When a tick is outside that span the template loop already
  // assigned the right block above, so only the in-span case is overridden. The
  // `regular`/absent case leaves effectiveSleepEnd null and is the template,
  // byte-for-byte.
  if (effectiveSleepEnd !== null) {
    const sleepStart = sleepEntry[0];
    const sleepBaseEnd = sleepEntry[1];
    if (tick >= sleepStart && tick < effectiveSleepEnd) {
      currentBlock = 'sleep';
      currentWeight = sleepEntry[2] ?? currentWeight;
    } else if (effectiveSleepEnd < sleepBaseEnd && tick >= effectiveSleepEnd && tick < sleepBaseEnd) {
      // early riser (or a negative erratic jitter): woke BEFORE the template
      // wake — they are UP, in the block that follows sleep (their morning),
      // not still asleep.
      const follow = Object.entries(sched)
        .filter(e => e[0] !== 'sleep' && e[1][0][0] >= sleepBaseEnd)
        .sort((a, b) => a[1][0][0] - b[1][0][0])[0];
      if (follow) {
        currentBlock = follow[0];
        currentWeight = follow[1][0][2] ?? 0.5;
      }
    }
  }

  // Intimacy & Voyeurism Phase 14 (D14): a resident whose outside partner is
  // over is bound to their OWN bedroom for the visit window — the boyfriend
  // comes over and disappears to her room. Same shape as the commitment bind
  // above: the invitation binds, it doesn't hope. This is the half of the
  // co-location that the schedule controls: resolveVisitPresence already makes
  // the PARTNER follow the host into the host's own bedroom, but the host
  // alone wanders the common rooms all evening (wind_down routes to common
  // rooms, and 'reading in bed' is a stay-put activity that never gets you
  // there), so the pair never lands in a private room and the Phase 13
  // intimate drive — which requires isPrivateRoom — never becomes candid.
  // Binding the HOST here is what co-locates the couple. Work/commute blocks
  // are exempt (a host mid-shift is not pulled home; the partner waits in the
  // booked room, their person's bedroom), and a real commitment still wins
  // because it returns before this check runs.
  // D12: the exemption is "the host is OUT", not "the host's block is called
  // work". A remote host mid-shift is standing in the flat, so the partner
  // visit binds them exactly as any other at-home block would.
  if (gameState && npcId && !npcIsOffsite(npc, currentBlock, clock, npcId)) {
    const partnerVisit = getActiveVisits(gameState).find(v => v.purpose === 'partner' && v.hostNpcId === npcId);
    if (partnerVisit) {
      return {
        block: 'leisure',
        weight: 1.0,
        commitmentRoomId: npc.residency?.room || 'living_room',
        commitmentKind: 'partner_visit',
      };
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
// --- Where an at-home workday happens (vocation plan D5) -------------------
// The occupation names its workspace as an ORDERED preference list
// (`workRoom`, e.g. ['study', 'bedroom']); 'bedroom' resolves to the NPC's
// own assigned room. Resolution walks the list and takes the first room that
// is not already at capacity, then falls back to the NPC's bedroom, and only
// then to the ordinary common-room wander.
//
// The capacity walk is the point, not a nicety. `study` holds 2. With three
// remote workers in the flat, one of them is displaced into their bedroom
// every day — which is exactly the contention worth having: the study
// becomes a thing roommates share badly, and where somebody works stops
// being a constant.
//
// The activity string comes from the occupation's own table so a developer
// is "on a video call" and a designer is "sketching" — ACTIVITY_TABLES.work
// holds the single string 'at work', which is right for someone who is GONE
// and useless for someone at a desk in the next room.
function resolveHomeWorkPlacement(npc, npcId, npcs, rng, gameState) {
  const occ = npc?.bible?.occupation || {};
  const activity = pickHomeWorkActivity(occ, rng);

  const prefs = Array.isArray(occ.workRoom) && occ.workRoom.length
    ? occ.workRoom
    : ['study', 'bedroom'];
  const own = npc?.residency?.room || null;

  for (const raw of prefs) {
    const roomId = raw === 'bedroom' ? own : raw;
    if (!roomId || !ROOMS[roomId]) continue;
    if (roomId === 'bedroom_player') continue;
    // Somebody else's bedroom is never a workspace.
    if (ROOMS[roomId].type === 'bedroom' && roomId !== own) continue;
    const occupants = getPresentNpcIds(npcs, roomId).filter(id => id !== npcId).length;
    if (occupants >= (ROOMS[roomId].capacity || 1)) continue;
    return { location: roomId, activity };
  }

  if (own && ROOMS[own]) return { location: own, activity };

  const candidates = COMMON_ROOMS.map(roomId => {
    const occCount = getPresentNpcIds(npcs, roomId).length;
    const weight = occCount >= ROOMS[roomId].capacity ? 1 / SCENE.crowdAvoidanceWeight : 1;
    return { roomId, weight };
  });
  return { location: weightedPick(rng, candidates, c => c.weight).roomId, activity };
}

// The at-home work activity string. Per-occupation `workActivities` wins;
// otherwise the category's table; otherwise a neutral default. Kept beside
// the placement so the room and the phrase are chosen in one place and
// cannot disagree — the same reason resolveRoomForActivity picks its
// activity before routing.
function pickHomeWorkActivity(occ, rng) {
  const pool = (Array.isArray(occ.workActivities) && occ.workActivities.length)
    ? occ.workActivities
    : (HOME_WORK_ACTIVITIES[occ.category] || HOME_WORK_ACTIVITIES._default);
  return pool[Math.floor(rng() * pool.length)];
}

// room preference and activity string can't disagree.
function resolveRoomForActivity(block, npcId, npcs, rng, clock, gameState) {
  if (block === 'sleep') {
    return { location: null, activity: 'sleeping' };
  }
  // D12: work no longer means offscreen by definition. An on-site worker
  // still leaves; a remote/hybrid-home/self-employed one stays and gets a
  // real room and a real activity (D5 / Phase 3).
  if (block === 'work' || block === 'commute' || block === 'commute_home') {
    const npc = npcs?.[npcId];
    if (npcIsOffsite(npc, block, clock, npcId)) {
      return { location: null, activity: ACTIVITY_TABLES[block] ? ACTIVITY_TABLES[block][0] : block };
    }
    return resolveHomeWorkPlacement(npc, npcId, npcs, rng, gameState);
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
  // Intimacy & Voyeurism Phase 18 (D16): a parent with a baby presence
  // gets the "stayed in with the baby" event appended to their own draw
  // pool — the schedule effect: they stay home instead of living their
  // old evening. Reads the ONE birth-pass writer (npc.flags._baby).
  const pool = npc?.flags?._baby
    ? [...OFFSCREEN_EVENTS, { type: 'baby', weight: PREGNANCY.baby.offscreenEventWeight, text: '{name} stayed in with the baby all evening — tiny socks everywhere, half-eaten meals, zero complaints.', moodDelta: 0.08, dataFields: [] }]
    : OFFSCREEN_EVENTS;
  const evt = weightedPick(rng, pool);
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

// --- The episode fields a tick event carries (initiative plan Phase 2, D15) ---
//
// Rumination's two D7 inference rules key on episode `participants`
// (co-occurrence) and `emotionalTag` (repetition). The ambient episode writer
// supplied neither, so thirty background episodes a week per resident produced
// nothing — 0 inferred facts and 0 open questions against a SATURATED episode
// tier (the plan's Evidence). Both fields exist on the record and are written
// only by the LLM path. This is the ambient half.
//
// PARTICIPANTS ARE STAMPED IN THE TICK, not at the write site, and that is not
// a style choice: co-presence is tick-local. UI's advanceAndResolve runs after
// the whole batch, so an 8-hour sleep resolved in one call would compute "who
// was present" for a 3am event from everyone's 11am positions. resolveTick's
// `resolved` map is the only place that knows where people actually were.
//
// stampEventParticipants is the ONE writer, run over newEvents at the end of
// the tick rather than at the three places events are pushed — a footprint
// added at each emit site is a footprint the fourth emitter forgets.
function eventParticipants(evt, resolvedLocations, playerLocation) {
  const parts = [];
  if (evt && evt.npcId) parts.push(evt.npcId);
  // The explicit second party (argument's {other}, npc_chat's data.other).
  // Always a participant even if they have already moved on this tick.
  const other = evt && evt.data && evt.data.other;
  if (typeof other === 'string' && other && !parts.includes(other)) parts.push(other);
  // Everyone else in the room it happened in. roomId is null for off-screen
  // events (work, commute), which correctly leaves those solo.
  const room = evt && evt.roomId;
  if (room) {
    const co = Object.keys(resolvedLocations || {})
      .filter(id => id !== evt.npcId && resolvedLocations[id] && resolvedLocations[id].location === room)
      .sort();
    for (const id of co) if (!parts.includes(id)) parts.push(id);
    // The player is a participant in their own right — 'player' is the same
    // token RUMINATION's resolveNpcName renders as 'the player' and npc.js
    // uses for the speaker.
    if (playerLocation === room && !parts.includes('player')) parts.push('player');
  }
  return parts;
}

// EVENT_EMOTION is the whole source: no per-event override, because an
// override needs a normalizer (an invented tag files real episodes under a
// theme nothing weighs) and nothing emits one yet. A phase that needs one adds
// it with its reader. Unlisted → '' — an untagged episode still carries
// participants and still feeds co-occurrence.
function eventEmotionalTag(evt) {
  return EVENT_EMOTION[evt && evt.type] || '';
}

function stampEventParticipants(events, resolvedLocations, playerLocation) {
  for (const evt of events || []) {
    if (!evt || evt.participants) continue;
    evt.participants = eventParticipants(evt, resolvedLocations, playerLocation);
  }
}

// --- The initiative gate (initiative plan Phase 2, D12/D13/D14) ------------
// Pure. UI's checkRelConsequences is the caller; it lives here because
// npcDisinhibition does (D11 named Phase 2 as its first consumer) and because
// ui.js needs a DOM and so cannot be reached by the Node harness at all — a
// gate nobody can measure is how the flag it replaces stayed dead.
//
// `contentFlags` is a PARAMETER rather than a read of gameState.meta: D14 puts
// the player's content settings above this system, and sim.js loads before
// COMPUTER's activeContentFlags. One definition, the caller supplies policy.
// Absent → CONTENT_CONFIG's defaults, the same fallback PROMPT uses.
//
// Returns, and every field has a reader in the phase that added it:
//   mayInitiate  — the gate. Phase 3's overture scorer is its declared
//                  consumer; today it is reported and measured, not acted on.
//   tone         — 'warm' | 'charged' | null (D12's two paths).
//   highDesire   — the flag that has never caused anything to happen (D20).
//                  Its reader is tensionOverride, immediately below.
//   tensionOverride — D13. checkRelConsequences returns canTalk:false at
//                  tensionHigh, which today blocks EVERY approach. Someone
//                  disinhibited and wanting does not walk away; the friction
//                  is the point, and it gets its own narration or it reads as
//                  the tension model being broken.
//   disinhibition — what scaled the floors, so a caller can narrate or measure
//                  why this NPC's gate sat where it did.
function npcInitiativeGate(npc, contentFlags) {
  const rel = (npc && npc.relPlayer) || {};
  const desire = rel.desire || 0;
  const comfort = rel.comfort || 0;
  const affection = rel.affection || 0;
  const flags = contentFlags || CONTENT_CONFIG.contentFlags;
  const disinhibition = npcDisinhibition(npc);

  // The floors run from the authored value at disinhibition 0 to zero at 1.
  const relief = Math.max(0, 1 - disinhibition * INITIATIVE_GATE.disinhibitionRelief);
  const comfortFloor = REL_CONSEQUENCES.comfortHigh * relief;
  const affectionFloor = REL_CONSEQUENCES.affectionHigh * relief;

  const highDesire = desire >= REL_CONSEQUENCES.desireHigh;
  // Desire is never scaled — it is what the gate is ABOUT.
  const passes = desire >= REL_CONSEQUENCES.desireHighComfortHigh
    && comfort >= comfortFloor
    && affection >= affectionFloor;
  // 'warm' means they would have cleared the authored bars regardless of
  // temperament; 'charged' means disinhibition is what let them through.
  const rawTone = !passes ? null
    : (affection >= REL_CONSEQUENCES.affectionHigh && comfort >= REL_CONSEQUENCES.comfortHigh)
      ? 'warm' : 'charged';
  // D14 — romance gates the affectionate path, mature the explicit one.
  const allowed = rawTone === 'warm' ? flags.romance !== false
    : rawTone === 'charged' ? flags.mature !== false
    : false;

  return {
    mayInitiate: passes && allowed,
    tone: passes && allowed ? rawTone : null,
    highDesire,
    tensionOverride: highDesire
      && disinhibition >= INITIATIVE_GATE.tensionOverrideDisinhibition
      && flags.mature !== false,
    disinhibition,
  };
}

// Resolve all NPCs for a single tick (deterministic, zero LLM)
function resolveTick(gameState) {
  const { meta, npcs } = gameState;
  // Continuous-behavior Phase 5 (D7): seeding moves from tick-index to
  // absolute-minute. The ambient per-tick rolls below (room preferences,
  // random events, evidence discovery) keep a per-tick stream but address
  // it by the absolute minute of day — no tick index in any behavior-layer
  // seed (C1). The actual DECISION streams are per-NPC at the decision's
  // absolute minute — see the evaluateDrives call in pass 3.
  const rng = seededRng(meta.seed, `tick_${meta.clock.day}_${meta.clock.minutes}`);
  // Phase 4 (physical layer, D9 batch regime): snap any walk whose
  // scheduled completion has passed BEFORE anything reads the NPCs, so the
  // held records below see landed arrivals. In the live regime walks land
  // per-frame; this is the deterministic path resolveBatch (sleep, `wait`)
  // relies on — and it must stay synchronous, pure and rng-free (C6).
  settleWalks(gameState);
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

  // Continuous-behavior-engine Phase 2 (D3): event-driven cadence. Only NPCs
  // whose commitment has completed (or who hold none) are re-resolved this
  // tick; a committed NPC is not re-decided until its own completion. The due
  // set is derived from live commitment state each tick (cognition.js's
  // DECISION QUEUE section), never stored — a stored copy would go stale the
  // instant any writer released a commitment outside the queue.
  const dueNpcIds = new Set(dueForDecision(gameState, activeNpcIds));

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
    // A visitor holding a commitment (a social drive opened one) is pinned
    // to it like any committed NPC until their own completion.
    if (visitingIds.has(id)) {
      if (dueNpcIds.has(id)) {
        resolved[id] = resolveVisitPresence(id, gameState, activeVisits, rng, resolved);
      } else {
        resolved[id] = deriveHeldRecord(id, npc, gameState, true);
      }
      continue;
    }
    if (npc.residency.status !== 'resident') continue;

    // Not due: a held commitment with time left to run. The record is
    // derived from the commitment (cognition.js), never re-rolled from the
    // schedule — a re-roll is exactly how the flat scan walked committed
    // NPCs away from what they were doing (233 of 485 cancelled, measured).
    if (!dueNpcIds.has(id)) {
      resolved[id] = deriveHeldRecord(id, npc, gameState, false);
      continue;
    }

    // Phase 5 (D5): a due resident holding a WORK commitment has just
    // finished their shift — the commitment's single completion time has
    // passed, so they are back at the front door, physically present again.
    // Released here, ahead of the schedule branch, so the rest of the tick
    // sees them as the person they now are rather than the worker they were.
    if (npc.commitment && npc.commitment.kind === 'work') {
      const scheduleResult = resolveScheduleActivity(npc, meta.clock, gameState, id);
      returnHome(gameState, id);
      resolved[id] = {
        ...scheduleResult,
        location: 'entry',
        activity: 'home from work',
        transit: null,
      };
      continue;
    }

    const scheduleResult = resolveScheduleActivity(npc, meta.clock, gameState, id);
    const { block } = scheduleResult;
    let location = null;
    let activity = block;
    let transit = npc.transit || null;

    if (scheduleResult.commitmentRoomId) {
      // Phase 7 (D7): a committed dinner binds — the attendee is at the
      // table for the whole window, not wherever the template would put
      // them. The location comes straight from the commitment (the dining
      // room); a commitment never routes through resolveRoomForActivity.
      //
      // Initiative plan Phase 4: keyed on the ROOM rather than on
      // `block === 'meal'`, because a hangout resolves as ordinary leisure and
      // would otherwise have fallen through to the wandering branch below —
      // binding its schedule in name and not in fact. The activity string is
      // the kind's, so "exactly as a meal does" is one code path rather than
      // two that agree today.
      location = scheduleResult.commitmentRoomId || npc.residency.room;
      activity = COMMITMENT_KINDS[scheduleResult.commitmentKind]?.boundActivity || activity;
      transit = null;
    } else if (block === 'sleep') {
      location = npc.residency.room;
      activity = 'sleeping';
      transit = null;
    } else if (block === 'work' || block === 'commute' || block === 'commute_home') {
      // D12: the work block no longer implies off-screen. `npcIsOffsite` is
      // the only thing that decides it, so an at-home worker falls through to
      // the ordinary placement path with a real room and a real activity.
      if (npcIsOffsite(npc, block, meta.clock, id)) {
        location = null; // off-screen
        activity = ACTIVITY_TABLES[block] ? ACTIVITY_TABLES[block][0] : block;
        transit = null;
      } else {
        const home = resolveHomeWorkPlacement(npc, id, npcs, rng, gameState);
        location = home.location;
        activity = home.activity;
        transit = null;
      }
    } else {
      // If already in transit, keep heading to the same destination rather
      // than picking a new random activity/room each tick (which would make
      // the NPC forever restart their journey and never arrive).
      const { location: target, activity: pickedActivity } = resolveRoomForActivity(block, id, npcs, rng, meta.clock, gameState);
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
            activity = `heading to ${roomPhrase(existingTarget)}`;
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
            activity = `heading to ${roomPhrase(target)}`;
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
        // Intimacy & Voyeurism Phase 6 (D11): carry the visitor's outfit
        // through so readers never hit an undefined value (visitors keep
        // whatever they arrived in; their sim is dormant outside the visit).
        outfit: npc.outfit || {},
      };
      continue;
    }

    // Perception plan Phase 3: someone moving between rooms is audible.
    // Emitted here because this is the one place that holds BOTH the previous
    // location (npc.location — npcUpdates aren't applied until resolveBatch)
    // and where they end up this tick. Someone passing THROUGH a room on the
    // way somewhere is louder than someone settling into it, which is what
    // makes "footsteps outside your door" different from "someone is in the
    // next room".
    if (location && npc.location && location !== npc.location) {
      emitTransient(gameState, {
        id: 'footsteps',
        roomId: location,
        intensity: resolved[id].transit ? SIGNALS_EMIT.footstepsTransit : SIGNALS_EMIT.footstepsArrive,
        sourceId: id,
      });
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
      // Perception plan Phase 3: an event that makes a noise or a smell
      // becomes something the household can actually sense, not just a line
      // in the log. EVENT_SIGNALS is the table; an event with no entry is
      // silent, which is most of them.
      const sig = EVENT_SIGNALS[evt.type];
      if (sig && location) {
        emitTransient(gameState, { id: sig.signal, roomId: location, intensity: sig.intensity, sourceId: id });
      }
    }

    // Intimacy & Voyeurism Phase 19 (sound): the apartment's music. A
    // resident who can actually HEAR a music signal (perceiveSignals already
    // applies attenuation, doors and - for a wearer - the headphones filter)
    // gets a small mood lift scaled by how loud it arrives; very loud music
    // occasionally provokes a 'keep it down' beat, a real event the player
    // can read (music_too_loud: authored lines, seeded roll on the tick
    // stream like the ambient event above). A sleeping NPC is skipped -
    // asleep is not listening.
    if (block !== 'sleep' && location && ROOMS[location]) {
      let loudestMusic = 0;
      for (const rec of perceiveSignals(gameState, id, location)) {
        if (rec.signalId === 'music' && rec.intensity > loudestMusic) loudestMusic = rec.intensity;
      }
      if (loudestMusic > 0) {
        moodDelta += Math.min(SOUND_DEVICE_DEFS.music.npcMoodCap, loudestMusic * SOUND_DEVICE_DEFS.music.npcMoodPerIntensity);
        const kd = SOUND_DEVICE_DEFS.music.keepItDown;
        if (loudestMusic >= kd.threshold && rng() < kd.chancePerTick) {
          newEvents.push({
            day: meta.clock.day, tick: getTickIndex(meta.clock.minutes), roomId: location, npcId: id,
            type: 'music_too_loud', moodDelta: kd.npcMood,
            template: kd.lines[Math.floor(rng() * kd.lines.length)],
            data: {}, seenByPlayer: false,
          });
        }
      }
      // The wearer's own headphones/mp3 player are a small mood lift (their
      // music, and none of the apartment's noise) - the NPC mirror of the
      // player's wornMusicTerm. wearsSoundBlocking is a BOOLEAN predicate;
      // the per-device gain is keyed by the accessory NAME (re-read from the
      // outfit rather than trusting the predicate's return).
      if (wearsSoundBlocking(gameState, id)) {
        const acc = (gameState.npcs?.[id]?.outfit?.accessory) || '';
        const gain = SOUND_DEVICE_DEFS[acc]?.npcMoodGainPerTick;
        if (gain) moodDelta += gain;
      }
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
    //
    // Intimacy & Voyeurism Phase 6 (D11): the rest of the clothing STATE
    // machine and the outfit derivation now live in NPC's pure rules, applied
    // here. `changing` settles to 'dressed' the tick after the change_clothes
    // drive set it (TRANSIENT above); a towel the same. Activity-driven nudity
    // keeps an NPC 'nude' for exactly as long as the nude activity lasts —
    // ungated in the private shower, deviancy-gated at the pool (the gate is
    // decided once per swim session via the already-nude guard, on a stream
    // addressed per NPC+minute so it never perturbs the shared tick roll).
    // The outfit is derived deterministically each tick, so it can never
    // disagree with what the NPC is doing — the change_clothes drive is the
    // visible 'changing' beat, this derivation is the state behind it.
    const clothing = npcClothingForContext(
      npc, block, activity, npc.clothing || 'dressed',
      seededRng(meta.seed, `nude_${id}_${meta.clock.day * 1440 + Math.floor(meta.clock.minutes)}`)
    );
    const outfit = npcOutfitForContext(npc, gameState, block, activity, id);

    npcUpdates[id] = {
      location,
      activity,
      mood: Math.max(-1, Math.min(1, npc.mood + moodDelta)),
      clothing,
      outfit,
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
  const allFactTransfers = [];
  const allPeepResults = [];
  for (const id of activeNpcIds) {
    if (!resolved[id]) continue;
    const npc = npcs[id];
    const isVisitor = visitingIds.has(id);
    if (!isVisitor && npc.residency.status !== 'resident') continue;

    // Cognition plan Phase 2 (D4): age the held commitment by one tick BEFORE
    // anything is scored, so anything evaluateDrives still sees is one with
    // time left to run. This runs ahead of the sleep skip below on purpose —
    // an NPC who falls asleep or leaves the flat mid-chore has stopped doing
    // it, and ageCommitment releases it. A commitment that only aged on ticks
    // where drives happened to be evaluated would outlive its reason.
    const hadCommitment = !!npc.commitment;
    const commitment = ageCommitment(gameState, id, resolved[id]);

    // Initiative plan Phase 3 (D19): the same one-tick ageing for the other
    // record an NPC can be holding, beside its sibling and ahead of the sleep
    // skip below for the same reason — someone who has fallen asleep, left the
    // flat or wandered out of the player's room is no longer waiting on an
    // answer, and a record that only aged on ticks where drives were evaluated
    // would outlive the moment it belongs to. OVERTURE's ageOverture is one of
    // its four named writers; nothing here builds or deletes the record.
    ageOverture(gameState, id, resolved[id]);

    // Skip sleeping NPCs — they can't act on drives
    if (resolved[id].block === 'sleep') continue;

    // Initiative plan Phase 3 (design invariant 2): someone waiting on an
    // answer is not also doing the laundry. Without this branch an NPC who
    // crossed the room on the previous tick was free to win an ordinary drive
    // on this one — measured over 12 households x 7 days, 95 npc-ticks where
    // the same NPC held a commitment and an overture at once, and 147 where a
    // pending record belonged to someone who had already walked out of the
    // room. Selection guarantees only that ONE thing is chosen per tick; the
    // record spans ticks, so the hold has to as well, exactly as a
    // commitment's does. They stay put, they keep the activity the def
    // declares, and the record ages out (or the player answers) within
    // utility.holdTicks.
    // Phase 4: WHERE they wait is the channel's business, not this loop's —
    // OVERTURE's overtureWaitRoom answers it. A knocker stays on their side of
    // the door; an approach follows the player's room. A null roomId means
    // "leave them where they are", which is the whole difference.
    // An off-site worker cannot be waiting on an answer in the flat — the
    // guard keeps the wait-room branch from overriding a work commitment's
    // off-map record. (The open paths cannot produce this state today; this
    // is the same defensive line commitmentInterruptTriggers draws.)
    if (isOverturePending(npcs[id]) && !(npc.commitment && npc.commitment.kind === 'work')) {
      const { roomId: waitRoom, activity: waitActivity } = overtureWaitRoom(gameState, npcs[id]);
      npcUpdates[id].transit = null;
      if (waitRoom) npcUpdates[id].location = waitRoom;
      if (waitActivity) npcUpdates[id].activity = waitActivity;
      continue;
    }

    // Continuous-behavior-engine Phase 2 (D3): not due — holding a
    // commitment with time left to run. The flat scan ends here: no
    // re-scoring, no shouldBreakPursuit re-check, no re-roll until
    // completesAtAbs arrives (or the age pass above released the commitment
    // on sleep / missing location).
    if (!dueNpcIds.has(id)) {
      // Phase 5 (D6): interrupts by EVENT, not by per-tick re-scoring. A cheap
      // trigger scan (a need crossing its urgency threshold since the
      // commitment opened, a pending overture) runs for held NPCs; on a hit
      // the commitment is released and the NPC falls through to re-decide
      // THIS tick — the "fresh decision immediately" of the early-release
      // path. Work commitments are exempt: an off-site worker cannot answer
      // their needs from the office, exactly as the schedule keeps them at
      // work regardless.
      //
      // Phase 5 (D6): the aged-away case. ageCommitment above released the
      // commitment at its completion time THIS tick — a drive that ran into
      // the commute window is the shape: at top of tick it was still held,
      // so this NPC was not in dueNpcIds and pass 1 derived a held record,
      // yet it no longer holds anything. hadCommitment && !commitment
      // detects exactly that, and the NPC falls through to re-decide here
      // instead of carrying a stale record (off-map, no work commitment)
      // into the next tick. The fall-through lands on the work/commute
      // branch below for a work-boundary block, so the same tick that
      // swallows the old commitment opens the work one.
      const interrupt = commitment && commitment.kind !== 'work' ? shouldInterruptCommitment(npc, commitment) : null;
      const agedAway = hadCommitment && !commitment;
      if (interrupt || agedAway) {
        if (interrupt) releaseCommitment(gameState, id);
      } else {
        continue;
      }
    }

    // NPCs in transit are walking, not doing activities: a drive's
    // activityOverride would clash with "heading to the Kitchen" and could make
    // the NPC appear to cook in a hallway.
    //
    // UNLESS they are in the middle of something (cognition plan Phase 2). Pass
    // 1 re-rolls a room preference EVERY tick from ACTIVITY_ROOM_PREFERENCES,
    // so an NPC who is not walking somewhere is usually about to be — measured,
    // that cancelled 233 of 485 commitments, nearly half, and almost always on
    // the tick after one had moved the NPC to the room it needed. D2 says a
    // commitment OVERRIDES the schedule; this is where that has to be true, or
    // a commitment that relocates anyone can never survive its own first tick.
    // The transit is cancelled outright rather than paused: it was never a
    // journey the NPC chose, it was the schedule wandering, and they are busy.
    //
    // Phase 6 (tuning pass): an UNCOMMITTED NPC in transit used to `continue`
    // here — skip the decision until the wander reached its destination. The
    // schedule transit steps one room per tick, so a long wander (the Gym is
    // six rooms from Hallway B) locked the scorer out for the whole walk, and
    // needs could not pull the NPC out of it: measured live, an 08:00
    // "heading to the Gym" ran 6 ticks straight through the breakfast window
    // with hunger at 30, and the household ate ~0.42 meals/day. The wander is
    // the schedule's, not a commitment's — nothing should hold the scorer
    // hostage to it. Fall through and let the decision run; if a drive wins,
    // the merge below cancels the transit and the commitment's own walk takes
    // over from where they stand, and if nothing clears the threshold the
    // pass-2 transit record stands and the wander carries on.
    if (resolved[id].transit) {
      if (commitment) {
        const stay = (commitment.anchor && commitment.anchor.roomId) || resolved[id].location;
        resolved[id] = { ...resolved[id], transit: null, location: stay };
        npcUpdates[id].transit = null;
        npcUpdates[id].location = stay;
      }
    }

    // Phase 5 (D5): work/commute is one long commitment, not the schedule's
    // block sequence. A due resident whose block is a work-boundary block
    // commits to the work commitment instead of scoring drives — the walk to
    // the front door, the off-map shift, and the return placement are all one
    // record with one completion time. Block 'commute_home' is deliberately
    // not here: that window only arrives while a work commitment already
    // holds, and a resident reading it without one is already home.
    //
    // D15: gated on npcIsOffsite, not on the block name. An at-home worker
    // must NOT open this commitment — openWorkCommitment plans a walk to the
    // front door and movement.js lands it by setting pos/location to null,
    // which would strand a remote worker off-map for the whole shift with no
    // return path. They fall through to the ordinary scorer instead, which is
    // what makes an at-home workday a real, drive-driven day.
    if ((resolved[id].block === 'work' || resolved[id].block === 'commute')
        && npcIsOffsite(gameState.npcs[id], resolved[id].block, gameState.meta.clock, id)) {
      const workCommitted = openWorkCommitment(gameState, id);
      if (workCommitted) {
        const post = gameState.npcs[id];
        if (post) {
          npcUpdates[id].commitment = post.commitment;
          npcUpdates[id].pos = post.pos;
          npcUpdates[id].walk = post.walk;
        }
        npcUpdates[id].location = null;
        npcUpdates[id].transit = null;
        npcUpdates[id].activity = workCommitted.arrived ? 'at work' : 'heading to work';
      }
      continue;
    }

    // The at-home shift (D5/D16). Its own commitment, because the first cut
    // of this simply let an at-home worker fall through to the drive scorer
    // — and a week of remote workers then spent their shifts in the laundry
    // room, never once at a desk. Working from home has to be something they
    // are DOING, held the way any other pursuit is held, or "remote" just
    // means "unemployed with extra steps".
    //
    // Only the 'work' block binds. A remote worker has no commute, so the
    // template's commute windows are ordinary free time for them — which is
    // truthful and gives them a natural gap at each end of the day.
    if (resolved[id].block === 'work') {
      // Code-review fix (efficiency, partial): `resolved[id]` was already
      // computed a few dozen lines up (the block === 'work' branch above,
      // when the NPC isn't offsite), and since the offsite case already
      // `continue`d out at the openWorkCommitment branch just above this one,
      // reaching here guarantees resolved[id] is that real at-home placement.
      // openHomeWorkCommitment now reuses it for its yield-to-content-work
      // candidacy check (scoring against the room the NPC is actually in this
      // tick, not last tick's stale npc.location).
      //
      // It deliberately does NOT reuse it for the actual room COMMIT, though
      // an earlier draft of this fix did. resolveHomeWorkPlacement's capacity
      // check reads live npc.location via getPresentNpcIds, and this loop
      // commits NPCs one at a time, writing npc.location as each one lands —
      // so NPC B's commit correctly sees NPC A already seated when it
      // recomputes fresh, sequentially, right here. Pass 1's precomputed
      // placements were each checked against the tick's PRE-loop snapshot
      // instead, with no visibility into each other, so reusing one for the
      // commit let multiple home workers all independently "win" the same
      // under-capacity room in the same tick (measured: 0 over-capacity study
      // ticks before that reuse, 14 after). openHomeWorkCommitment still
      // recomputes the placement fresh for the actual commit.
      const homeWork = openHomeWorkCommitment(gameState, id, resolved[id]);
      if (homeWork) {
        const post = gameState.npcs[id];
        if (post) {
          npcUpdates[id].commitment = post.commitment;
          npcUpdates[id].pos = post.pos;
          npcUpdates[id].walk = post.walk;
        }
        npcUpdates[id].location = homeWork.anchor?.roomId || post?.location || null;
        npcUpdates[id].transit = null;
        npcUpdates[id].activity = homeWork.activity;
        continue;
      }
      // No shift could be opened (no work window today, or it has already
      // ended) — fall through to the ordinary scorer rather than stranding
      // them in a block with nothing in it.
    }

    // Visitors (external-world plan Phase 1) pass their status through so
    // DRIVES' evaluateDrives can enforce VISITOR_DRIVE_ALLOWLIST — only
    // react_to_player + the social drives may fire for them.
    //
    // Phase 5 (D7): the decision's randomness is addressed by WHO decided
    // and WHEN — `npc_${npcId}_decision_${absoluteMinute}` — not by which
    // tick-grid cell the decision happened to fall in. Each deciding NPC
    // draws from its own stream, so a decision's outcome is a pure function
    // of (npc, absolute minute) and no longer depends on the draw order of
    // the other NPCs sharing this tick (C6). `day * 1440 + minutes` is
    // clockToAbsolute's formula, kept inline because time.js loads after
    // this file in both main.html and loadgame.js's ORDER.
    const driveResult = evaluateDrives(
      npc, id, npcs, resolved[id], gameState,
      seededRng(meta.seed, `npc_${id}_decision_${meta.clock.day * 1440 + meta.clock.minutes}`),
      currentTick, { isVisitor }
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
      // Cognition plan Phase 2 (D12), renamed in continuous-behavior-engine
      // Phase 1: npc.commitment is written by COGNITION's
      // openCommitment/releaseCommitment/ageCommitment directly on
      // gameState.npcs[id], and applyEffects can REPLACE that object mid-drive
      // — the same hazard this whole block exists for. Carried explicitly and
      // unconditionally: a released commitment must come back as undefined, or
      // resolveBatch's `{ ...state.npcs[id], ...update }` merge would resurrect
      // the one the NPC just finished. Absent means no commitment, so
      // undefined is the right value and JSON drops the key on save.
      npcUpdates[id].commitment = postDrive.commitment;
      // Phase 6 (tuning pass): an uncommitted NPC in schedule transit who
      // just opened a commitment cancels the wander — the commitment's own
      // planned walk takes over from where they stand, and a "heading to the
      // Kitchen" label must not coexist with "cooking" (the clash the transit
      // block above exists to prevent). See that block for the measured case.
      if (postDrive.commitment && npcUpdates[id].transit) {
        npcUpdates[id].transit = null;
      }
      // Initiative plan Phase 3 (D19): the same carry for `npc.overture`, and
      // unconditional for the same reason — a record that lapsed or was opened
      // this tick must survive resolveBatch's `{ ...state.npcs[id], ...update }`
      // rebuild in whichever direction it moved. Absent means none, so
      // undefined is the right value and JSON drops the key on save.
      npcUpdates[id].overture = postDrive.overture;
    }
    // Cooldowns (and any other flags set by setCooldown during drive
    // evaluation) live on driveResult.updatedNpc.flags — without this
    // merge they were discarded each tick, making every drive's
    // cooldownMinutes ineffective. Merged over any flags the effects wrote
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

    // Intimacy & Voyeurism Phase 13 (D3/D13): the intimate pair drive's
    // PARTNER. The resolver wrote the partner's whole footprint directly on
    // gameState.npcs[partnerId] (effects mutated it in place, setCooldown
    // replaced it, openCommitment pinned it) — but if the partner was
    // evaluated EARLIER this tick, its own merge block already ran against
    // the pre-act snapshot, and resolveBatch's `{ ...state.npcs[id], ...u }`
    // rebuild would throw every one of those writes away. This is the same
    // post-drive carry the block above does for the ACTING npc, done for the
    // partner: pull the replaced-object fields back so the merge is
    // order-independent. `activity`/'having sex' also pins the partner's
    // visible state on the tick the act opens, even when the partner was
    // evaluated before the initiator and never saw its own held branch.
    if (driveResult.pairState) {
      const ps = driveResult.pairState;
      const pn = ps.npc;
      if (pn) {
        const u = npcUpdates[ps.partnerId] || (npcUpdates[ps.partnerId] = {});
        if (ps.clothing) u.clothing = ps.clothing;
        if (ps.activity) u.activity = ps.activity;
        u.transit = null;
        u.needs = pn.needs;
        if (typeof pn.mood === 'number') u.mood = pn.mood;
        u.flags = { ...(u.flags || {}), ...(pn.flags || {}) };
        u.commitment = pn.commitment;
        if (pn.pos) u.pos = pn.pos;
        if (pn.walk) u.walk = pn.walk;
        if (pn.relPlayer) u.relPlayer = pn.relPlayer;
        if (pn.memory) u.memory = pn.memory;
        if (pn.suspicion) u.suspicion = pn.suspicion;
        if (pn.inventory) u.inventory = pn.inventory;
        if (pn.overture) u.overture = pn.overture;
      }
    }

    // Merge events, IM messages, and rel deltas
    newEvents.push(...driveResult.events);
    allImMessages.push(...driveResult.imMessages);
    allRelDeltas.push(...driveResult.relDeltas);
    if (driveResult.factTransfers) allFactTransfers.push(...driveResult.factTransfers);
    // Intimacy & Voyeurism Phase 14: third-party npc writes from the
    // infidelity footprint (the wronged party's memory/mood/flags/relPlayer).
    // Collected here and merged AFTER the loop — resolveBatch rebuilds npcs
    // from `{ ...npc, ...update }`, so a mid-loop write to an npc who is
    // neither participant would be clobbered by its pre-tick snapshot.
    if (driveResult.wrongedNpcs) {
      for (const [wid, wnpc] of Object.entries(driveResult.wrongedNpcs)) {
        const u = npcUpdates[wid] || (npcUpdates[wid] = {});
        u.memory = wnpc.memory;
        u.mood = wnpc.mood;
        u.flags = wnpc.flags;
        if (wnpc.relPlayer) u.relPlayer = wnpc.relPlayer;
      }
    }

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

  // Knowledge-gossip Phase 2 (D5 leg 1): the npc_chat drive's fact transfers.
  // Each write lands in BOTH gameState.npcs (the live record) and the
  // receiver's npcUpdates entry — a receiver evaluated earlier in the same
  // tick otherwise carries a pre-fact memory snapshot that would clobber the
  // write when resolveBatch rebuilds npcs from `{ ...npc, ...update }`.
  if (allFactTransfers.length > 0) {
    for (const ft of allFactTransfers) {
      const recv = gameState.npcs[ft.receiverId];
      if (!recv) continue;
      gameState.npcs[ft.receiverId] = receiveTransmittedFact(recv, ft.fact, ft.opts);
      // Intimacy & Voyeurism Phase 14: a `cheating` fact reaching the
      // WRONGED party through gossip is learning — jealousy lands exactly as
      // a caught act does (maybeJealousUponFact dedupes per act). The write
      // is merged into npcUpdates below the same way the fact itself is, or
      // resolveBatch's rebuild would clobber it.
      const jealous = maybeJealousUponFact(gameState, ft.receiverId, ft.fact);
      const mem = gameState.npcs[ft.receiverId].memory;
      const extra = {};
      if (jealous) {
        extra.mood = jealous.mood;
        extra.flags = jealous.flags;
        if (jealous.relPlayer) extra.relPlayer = jealous.relPlayer;
      }
      npcUpdates[ft.receiverId] = npcUpdates[ft.receiverId]
        ? { ...npcUpdates[ft.receiverId], memory: mem, ...extra }
        : { memory: mem, ...extra };
    }
  }

  // Knowledge-gossip Phase 3 (D7/D9): the rumination pass. Runs AFTER the
  // factTransfers application so a fact that arrived earlier in this tick is
  // already visible to the pass, and staggered per NPC by id hash — each
  // resident ruminates once per RUMINATION.intervalTicks ticks (6 in-game
  // hours at 48 ticks/day) rather than all at once. PURE and LLM-free (R2):
  // the deterministic inference rules and the open-question lifecycle are
  // arithmetic over state; D8's LLM half belongs to Phase 4's D13 bridge.
  // Visitors are skipped (their sim is dormant — external-world plan Phase 1)
  // and sleeping residents are NOT: rumination is cognition, not an action.
  // Same merge-carry pattern as factTransfers — the write lands in BOTH the
  // live gameState.npcs and npcUpdates[id].memory, or resolveBatch's rebuild
  // would clobber it with the pre-pass memory snapshot.
  if (RUMINATION.intervalTicks > 0) {
    const rumTick = getTickIndex(meta.clock.minutes);
    for (const id of activeNpcIds) {
      if (visitingIds.has(id)) continue;
      const npc = gameState.npcs[id];
      if (!npc || npc.residency.status !== 'resident') continue;
      const stagger = hashStr(id) % RUMINATION.intervalTicks;
      if ((rumTick + stagger) % RUMINATION.intervalTicks !== 0) continue;
      const updated = ruminate(npc, gameState, meta.clock.day);
      if (!updated || updated === npc) continue;
      gameState.npcs[id] = updated;
      npcUpdates[id] = npcUpdates[id]
        ? { ...npcUpdates[id], memory: updated.memory }
        : { memory: updated.memory };
    }
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

  // Intimacy & Voyeurism Phase 12 (D12): the proximity co-occurrence
  // accumulator — who spent this tick in the same room, the raw material
  // pair formation consumes each day. Reads the FINAL locations (post-drive
  // npcUpdates, so a drive that pulled two residents together this tick
  // counts) and skips off-map residents. One cheap pass, residents only;
  // the write is a small in-place counter on world.relationships, exactly
  // like the signal buffer, and survives resolveBatch's npc rebuild because
  // resolveBatch never clones world.
  const proximityByRoom = {};
  for (const id of activeNpcIds) {
    const u = npcUpdates[id];
    if (!u || !u.location) continue;
    const npc = npcs[id];
    if (!npc || npc.residency.status !== 'resident') continue;
    (proximityByRoom[u.location] = proximityByRoom[u.location] || []).push(id);
  }
  for (const [roomId, ids] of Object.entries(proximityByRoom)) {
    if (ids.length < 2) continue;
    const bedroomWeight = ROOMS[roomId] && ROOMS[roomId].type === 'bedroom' ? RELATIONSHIP.bedroomProximityBonus : 1;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        notePairCoLocation(gameState, ids[i], ids[j], { weight: bedroomWeight });
      }
    }
  }

  // Initiative plan Phase 2 (D15): stamp who was present onto every event this
  // tick produced, while `resolved` still holds this tick's real locations.
  // One writer, after every emitter has run — see eventParticipants for why
  // this cannot wait for UI's advanceAndResolve.
  stampEventParticipants(newEvents, resolved, gameState.player && gameState.player.location);

  return { npcUpdates, newEvents, peepResults: allPeepResults };
}

// --- Batched time resolution (for sleep / long work blocks) ---
// opts.advanceClock (default true) — when false, simulate `ticks` worth of
// NPC activity without moving meta.clock. The continuous clock loop (TIME)
// passes false because it has already walked the clock through this span
// itself; advancing here too ran the whole game at double speed.
function resolveBatch(gameState, ticks, opts = {}) {
  const shouldAdvanceClock = opts.advanceClock !== false;
  // needs-and-heartbeat Phase 3 (D4/D7): the DISCRETE path's needs move via
  // the heartbeat's closed form (applyNeedsHeartbeat), applied once per tick
  // AFTER that tick's updates are merged — so restore keys on the block and
  // location the tick actually resolved to. An end-of-batch single call
  // would key on only the FINAL block, which loses sleep restore entirely
  // (an 8h sleep ending at 08:00 reads a 'morning' final block and restores
  // nothing). The per-tick net-rate form is the closed form of per-minute
  // interleaving (D7), exact against the old per-tick block in steady state.
  // The CONTINUOUS path (suppressNeeds, threaded from TIME's runSimCheckpoint)
  // skips this — clockFrame's heartbeat accumulator owns every one of those
  // minutes at per-minute cadence already.
  const shouldApplyNeeds = opts.suppressNeeds !== true;
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
      const merged = { ...newNpcs[id], ...update };
      // Phase 4 (physical layer, D8): keep pos in step with the location the
      // tick just applied — an NPC who teleported (schedule wander, off-map
      // return, visitor) must stand in the room the record says they are in.
      // A walk owns pos and is never touched here.
      reconcileNpcPos(merged);
      newNpcs[id] = merged;
    }
    state = { ...state, npcs: newNpcs };
    // Player needs are deliberately NOT moved here — every discrete action's
    // own decayPlayerNeeds call site (ui.js/ui.computer.js/ui.phone.js) owns
    // the player on the discrete path, so this pass is NPCs only.
    if (shouldApplyNeeds) state = applyNeedsHeartbeat(state, CLOCK.tickMinutes, { player: false });
  }
  return { state, events: allEvents, peepResults: allPeepResults };
}

// ===== SECTION: NEEDS HEARTBEAT (needs-and-heartbeat-plan.md, Phase 2) =====
// The continuous clock's needs heartbeat. TIME's clockFrame accumulates
// game-minutes and, every HEARTBEAT_MINUTES crossed, calls this ONCE with the
// crossed minutes — closed form, never one call per minute (a 20-minute burst
// frame is one multiplication per need, not twenty; C7). It owns ALL need
// movement on the continuous path: per-minute decay + restore for every
// active resident NPC and the player, at NEEDS's per-minute rates (Phase 1's
// conversion). The player's minutes carry the idle multiplier (options.idle,
// D6) — the clock loop only runs while the player is not mid-action, so every
// heartbeat is an idle heartbeat. Since Phase 3, resolveTick has NO per-tick
// needs pass of its own — the discrete funnels (resolveBatch, gated by the
// same suppressNeeds flag threaded from runSimCheckpoint) call THIS function
// once per resolved tick, so one closed-form shape moves needs on every path
// and the two can never both move the same need.
// Pure + synchronous (C6): plain arithmetic over state — no rng, no kv, no
// model calls. Returns a NEW state (npcs/player replaced) like resolveBatch;
// callers assign the result. Clock-driven in time.js, defined here because
// sim.js loads before time.js in main.html and loadgame.js's ORDER.
function applyNeedsHeartbeat(gameState, minutes, options = {}) {
  if (!gameState || minutes <= 0 || !gameState.npcs) return gameState;

  const npcs = gameState.npcs;
  const activeVisits = getActiveVisits(gameState);
  const activeNpcIds = getActiveNpcIds(gameState, activeVisits);
  const visitingIds = new Set(
    activeVisits.map(v => v.npcId).filter(id => npcs[id] && npcs[id].residency.status !== 'resident')
  );

  const npcUpdates = {};
  for (const id of activeNpcIds) {
    const npc = npcs[id];
    // Visitors are dormant outside their visit (external-world plan Phase 1):
    // no decay, no restore — the same skip resolveTick's pass 2 applies.
    if (!npc || npc.residency.status !== 'resident' || visitingIds.has(id)) continue;

    // The block is the last resolved one (npc.schedule.currentBlock,
    // rewritten at every sim checkpoint); between checkpoints it is stable,
    // so restore is at most simCheckpointMinutes stale on the continuous
    // path — the population-level equivalence Phase 2's verification asks
    // for, not byte-for-byte timing.
    const block = npc.schedule?.currentBlock;
    const location = npc.location;

    // Net per-minute rate per need (D3/D4/D5): decay always applies; restore
    // only in the blocks/rooms that restore. The net is applied ONCE for the
    // whole span — value + netRate*minutes, clamped to [0, max] — which is
    // the closed form of per-minute interleaving, not a decay-then-restore
    // shortcut (decaying the whole span first, then restoring on the clamped
    // zero, overcounts restore for any need that dips to its floor mid-span:
    // a need at 25 with +1 net would land at 96 instead of 73).
    let hunger = -NEEDS.npcHungerDecayPerMinute;
    let energy = -NEEDS.npcEnergyDecayPerMinute;
    let social = -NEEDS.npcSocialDecayPerMinute;
    let comfort = -NEEDS.npcComfortDecayPerMinute;
    let stimulation = -NEEDS.npcStimulationDecayPerMinute;

    if (block === 'meal') hunger += NEEDS.npcMealRestorePerMinute;
    if (block === 'sleep') energy += NEEDS.npcSleepRestorePerMinute;
    if (location) {
      const shareCount = activeNpcIds.filter(oid => npcs[oid] && npcs[oid].location === location).length;
      if (shareCount > 1) social += NEEDS.npcSocialRestorePerMinute;
    }
    // Comfort restore mirrors the per-tick pass: living room with a
    // functional entertainment setup, or an upgraded bedroom (an NPC's own
    // bedroom counts even unupgraded); the D14 baseline floor otherwise.
    const ownBedroom = ROOMS[location]?.type === 'bedroom' && npc.residency?.room === location;
    if (location === 'living_room' || ownBedroom) {
      const hasComfortFacility = location === 'living_room'
        ? isFacilityFunctional(gameState, 'living_room_entertainment')
        : (ROOM_FACILITIES[location] || []).some(fid => gameState.world.upgrades?.[fid]?.tier === 'upgraded');
      comfort += hasComfortFacility ? NEEDS.npcComfortRestorePerMinute : NEEDS.npcComfortBaselineRestorePerMinute;
    }
    // Extra comfort from a trusted NPC sharing the room (castWeb pair).
    if (location) {
      for (const oid of activeNpcIds) {
        if (oid === id || !npcs[oid] || npcs[oid].location !== location) continue;
        const pair = gameState.world?.castWeb?.[[id, oid].sort().join('|')];
        if (pair && (pair.axes?.[`${id}→${oid}`]?.comfort || 0) > 0.5) {
          comfort += NEEDS.npcComfortProximityBonusPerMinute;
          break;
        }
      }
    }
    if (block === 'leisure' || block === 'evening' || block === 'wind_down') {
      stimulation += NEEDS.npcStimulationRestorePerMinute;
    }

    // Intimacy & Voyeurism Phase 8 (D9/D12): the NPC desire stat. Decay is a
    // continuous per-minute rate like every other need; the STRONGEST live
    // source (DESIRE.sources — signals perceived from where they stand, plus
    // anyone in the same room dressed invitingly) is converted from per-tick
    // to per-minute and added to the net rate, applied once for the whole
    // span in the same closed form. On the discrete path the span is one
    // tick, so this is exactly "strongest wins per tick" (D12); on the
    // continuous path it is the heartbeat's per-span recompute — no per-tick
    // loop anywhere, so the closed-form fast-forward rules hold.
    let desire = -DESIRE.npc.decayPerMinute;
    if (location) desire += desireSourceForSpan(gameState, id, location, minutes / CLOCK.tickMinutes) / minutes;

    const clampNeed = (value, ratePerMinute, max) =>
      Math.min(max, Math.max(0, value + ratePerMinute * minutes));
    const needs = {
      hunger: clampNeed(npc.needs.hunger, hunger, NEEDS.hunger.max),
      // D10/D11: hygiene has NO passive restore — drive-serviced, exactly as
      // the per-tick pass's comment explains.
      hygiene: clampNeed(npc.needs.hygiene, -NEEDS.npcHygieneDecayPerMinute, NEEDS.hygiene.max),
      energy: clampNeed(npc.needs.energy, energy, NEEDS.energy.max),
      social: clampNeed(npc.needs.social, social, NEEDS.npcSocialMax),
      comfort: clampNeed(npc.needs.comfort ?? 50, comfort, 100),
      stimulation: clampNeed(npc.needs.stimulation ?? 50, stimulation, 100),
      desire: clampNeed(npc.needs.desire ?? DESIRE.npc.start, desire, DESIRE.npc.max),
    };

    npcUpdates[id] = { needs };
  }

  if (Object.keys(npcUpdates).length > 0) {
    const newNpcs = { ...npcs };
    for (const [id, update] of Object.entries(npcUpdates)) {
      newNpcs[id] = { ...newNpcs[id], ...update };
    }
    gameState = { ...gameState, npcs: newNpcs };
  }

  if (gameState.player && options.player !== false) {
    // Player needs ride the same heartbeat. Phase 3 (D4) made
    // decayPlayerNeeds take GAME-MINUTES directly, so the span passes
    // through un-converted. options.player=false lets the DISCRETE funnel's
    // per-tick calls move NPC needs while the per-action decayPlayerNeeds
    // call sites keep owning the player there.
    gameState = {
      ...gameState,
      player: decayPlayerNeeds(gameState.player, minutes, gameState, { idle: !!options.idle }),
    };
  }
  return gameState;
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
function decayPlayerNeeds(player, minutes, gameState, options = {}) {
  // F1 (Discord feedback, 2026-08-23): the New Game/Sandbox need-decay
  // slider. Folded into the SAME mult the idle multiplier already scales
  // effectiveMinutes by, so every downstream bar (energy, hygiene, hunger's
  // fullness window, mood's easing, desire) respects it for free — one
  // choke point, no per-bar changes. Missing world.gameplayOptions (a save
  // from before this existed, or a bare test harness object) reads as
  // scale 1 / disabled false, i.e. today's behavior exactly.
  const gpo = gameState?.world?.gameplayOptions;
  const decayScale = gpo?.needDecayDisabled ? 0 : (typeof gpo?.needDecayScale === 'number' ? gpo.needDecayScale : 1);
  const mult = (options.idle ? NEEDS.idleDecayMultiplier : 1) * decayScale;
  // Phase 3 (D4): `minutes` is GAME-minutes now, not ticks — the closed
  // form's elapsed_minutes x rate multiplier, generalized from the old ticks
  // param (every caller used to pass minutes/30 anyway). The idle multiplier
  // applies to the span itself (D6/D12). Rates stay per-tick internally
  // (decayPerTick x minutes/30), byte-exact with the old path for every
  // whole-30-min span and free of per-minute float drift in saves.
  const effectiveMinutes = minutes * mult;
  const ticks = effectiveMinutes / CLOCK.tickMinutes;

  // 2026-08-17 audit (B3): while asleep (options.sleeping — set only by
  // doSleep), the hunger clock runs at SLEEP.hungerMultiplier: sleep
  // metabolism slows, so an 8-hour night costs ~4 hours of waking hunger.
  // Only the hunger span is scaled — energy/hygiene/mood/desire decay at
  // their normal rates overnight.
  const hungerSpanHours = (effectiveMinutes / 60) * (options.sleeping ? SLEEP.hungerMultiplier : 1);

  // food-overhaul Phase 2 (D2/D3): the D3 fullness window is the canonical
  // hunger state, drained at the living D2 metabolic rate (activity +
  // yesterday's energy balance). Pre-migration players (no fullness fields)
  // read as a legacy 18h window started from hoursSinceLastMeal, which is
  // byte-identical to the Phase 5 clock.
  const rate = metabolicRate(player, gameState);
  const hasFullness = typeof player.fullnessRemainingHours === 'number';
  const prevWindow = typeof player.fullnessWindowHours === 'number' ? player.fullnessWindowHours : HUNGER_RHYTHM.starveHours;
  const prevRemaining = hasFullness
    ? Math.max(0, player.fullnessRemainingHours)
    : Math.max(0, HUNGER_RHYTHM.starveHours - (player.hoursSinceLastMeal ?? 0));
  const fullnessRemainingHours = Math.max(0, prevRemaining - hungerSpanHours * rate);
  const hoursSinceLastMeal = (player.hoursSinceLastMeal ?? 0) + hungerSpanHours;

  const day = gameState?.meta?.clock?.day ?? 0;
  const { moodEvents, eventTerm } = advanceMoodEvents(player.moodEvents, day);

  // food-overhaul Phase 2 (D4): the daily expenditure accumulator. Basal
  // burn over the effective span, lifted by the same decaying activity term
  // that raises the rate; the explicit per-action kcal were already credited
  // by notePlayerActivity at the action site. Idle minutes count at the idle
  // multiplier (the span above is already idle-scaled), so standing around
  // is cheap on the ledger too.
  const { activityEvents, activityTerm } = advanceActivityEvents(player.meta?.activityEvents, day);
  const meta = {
    ...(player.meta || {}),
    activityEvents,
    kcalBurnedToday: (player.meta?.kcalBurnedToday || 0)
      + METABOLISM.basalKcalPerHour * hungerSpanHours * (1 + activityTerm),
  };

  const moodTarget = resolveMoodTarget(player, gameState, eventTerm, fullnessRemainingHours, prevWindow);
  const mood = clamp(player.mood + (moodTarget - player.mood) * MOOD_TARGET.easingPerTick * ticks, -1, 1);

  // Intimacy & Voyeurism Phase 8 (D9/D12): the player's desire need, moved
  // in the same closed form as every other bar. Decay is a continuous
  // per-minute rate; sources are PER-TICK exposure amounts scaled by the
  // fractional ticks in the span (strongest wins per tick — DESIRE.sources).
  // A pending one-shot kind source ('flirted' set by a desire-motive
  // overture landing, 'peeked_at_sex' by Phase 10) is consumed here once and
  // cleared, because this function is the ONLY writer of player needs. The
  // idle multiplier applies to source ticks too: passively idling next to a
  // shower stirs you at a quarter of the rate actively standing there does.
  const desireSource = desireSourceForSpan(gameState, 'player', player.location, effectiveMinutes / CLOCK.tickMinutes);
  let desire = (typeof player.desire === 'number' ? player.desire : DESIRE.player.start)
    - DESIRE.player.decayPerMinute * effectiveMinutes
    + desireSource;
  const pendingDesireKind = (player.flags && player.flags._desireSource) || null;
  if (pendingDesireKind) desire += desireSourceAmount(pendingDesireKind);

  // Intimacy & Voyeurism Phase 5 (D11): the player's clothing rides the same
  // TRANSIENT_CLOTHING revert path an NPC's does (resolveTick's pass 2) — a
  // transient state (towel after a shower, sleepwear in bed) reverts to
  // 'dressed' on the next span that ticks the player. This is the player's
  // equivalent of the NPC per-tick revert, and the single choke point that
  // makes the state machine's \\\"one tick of towel\\\" contract hold for both.
  const clothing = TRANSIENT_CLOTHING.includes(player.clothing) ? 'dressed' : (player.clothing || 'dressed');

  const { _desireSource: _consumed, ...flags } = player.flags || {};
  return {
    ...player,
    hoursSinceLastMeal,
    fullnessRemainingHours,
    fullnessWindowHours: prevWindow,
    mealsToday: player.mealsToday ?? 0,
    moodEvents,
    meta,
    energy: Math.max(0, player.energy - NEEDS.energy.decayPerTick * ticks),
    hygiene: Math.max(0, player.hygiene - NEEDS.hygiene.decayPerTick * ticks),
    hunger: satietyFrom(fullnessRemainingHours, prevWindow),
    mood,
    clothing,
    desire: Math.max(0, Math.min(DESIRE.player.max, desire)),
    flags,
  };
}

// ===== SECTION: DESIRE SOURCES (Intimacy & Voyeurism Phase 8, D9/D12) =====
// The exposure half of the desire need. Everything here is PURE: same state
// in, same number out, no rng, no writes (RI2/RI3) — the writers (decay /
// notePlayerDesireSource) live beside their consumers. Sources are the
// DESIRE.sources table; the helpers below are the two readers every consumer
// shares so "strongest wins per tick" means one thing everywhere.

// The amount a one-shot kind source is worth. Unknown kinds return 0 (fails
// closed — a source nobody can price never fires). Pure.
function desireSourceAmount(kind) {
  const src = DESIRE.sources.find(s => s.kind === kind);
  return src && typeof src.amount === 'number' ? src.amount : 0;
}

// The strongest live source a perceiver is exposed to right now, as
// { amount, lifeTicks }: the per-tick (30 game-minute) delta of the single
// strongest source, and how many more ticks it is good for. `observerId` is
// 'player' or an npcId; `roomId` is where they are standing.
//
//   signal sources  — perceived through the SAME perceiveSignals query the
//                     scene reader and the drive loop use, so attenuation,
//                     doors and the observer's own attention are already
//                     applied: you gain desire from exactly what you can
//                     actually sense, no more. A TRANSIENT source's lifeTicks
//                     is its remaining life at the perceiver's intensity
//                     (arrived intensity → SIGNAL_TUNING.floor at its own
//                     decayPerTick), so a long closed-form span never credits
//                     a short-lived signal for the whole span — the closed
//                     form stays exact, exactly like the needs heartbeat's.
//                     Standing sources have no decay and are credited for any
//                     span (their life IS the world state that produces them).
//   clothing source — seeing someone in the SAME ROOM dressed invitingly,
//                     read through the shared clothingResponseToWearer(...)
//                     .desire number (npc.js, Phase 7) — the "desire gain from
//                     seeing someone dressed invitingly" deliverable. Observer
//                     deviancy already gates how much of a reveal reads as
//                     invitation; a prude gains nothing from the same crop top
//                     a deviant finds enticing. Standing: lifeTicks Infinity.
// Strongest wins: only the single largest amount contributes, so stacked
// exposure (five showering roommates, a crowd in crop tops) never compounds
// into an instant maxed bar.
function desireSource(gameState, observerId, roomId) {
  if (!gameState || !roomId || !ROOMS[roomId]) return { amount: 0, lifeTicks: 0 };
  let best = { amount: 0, lifeTicks: 0 };

  for (const rec of perceiveSignals(gameState, observerId, roomId)) {
    // Your own shower running is not exposure to someone else — the desire
    // source is what ANOTHER person's signals do to you, so a showering
    // roommate stirs you but your own shower (sourceId === observerId, the
    // actor id for drives/actions) only relaxes you. Null sources (world
    // conditions) pass through unchanged.
    if (rec.sourceId === observerId) continue;
    for (const s of DESIRE.sources) {
      if (s.signal !== rec.signalId || !(s.amount > best.amount)) continue;
      const def = SIGNAL_DEFS[rec.signalId];
      const decay = def && def.decayPerTick;
      const lifeTicks = decay
        ? Math.max(0, (rec.intensity - SIGNAL_TUNING.floor) / decay)
        : Infinity;
      best = { amount: s.amount, lifeTicks };
    }
  }

  const observer = observerId === 'player' ? gameState.player : gameState.npcs?.[observerId];
  if (observer) {
    const scale = DESIRE.clothingScale;
    for (const [id, npc] of Object.entries(gameState.npcs || {})) {
      if (id === observerId || npc.location !== roomId) continue;
      const want = clothingResponseToWearer(observer, npc).desire * scale;
      if (want > best.amount) best = { amount: want, lifeTicks: Infinity };
    }
    if (observerId !== 'player' && gameState.player && gameState.player.location === roomId) {
      const want = clothingResponseToWearer(observer, gameState.player).desire * scale;
      if (want > best.amount) best = { amount: want, lifeTicks: Infinity };
    }
  }
  return best;
}

// The span contribution of a desire source — the shared closed form both
// consumers use: per-tick amount × min(spanTicks, lifeTicks). Bounded by the
// source's remaining life so a long span (a sleep, a workday) never credits a
// short-lived signal for hours it did not sound. Pure.
function desireSourceForSpan(gameState, observerId, roomId, spanTicks) {
  const src = desireSource(gameState, observerId, roomId);
  if (!(src.amount > 0) || !(spanTicks > 0)) return 0;
  const life = Number.isFinite(src.lifeTicks) ? src.lifeTicks : spanTicks;
  return src.amount * Math.min(spanTicks, life);
}

// The one-shot writer. A desire-motive overture landing ('flirted', Phase 8)
// or a peek catching sex ('peeked_at_sex', Phase 10) marks the player's
// flags; decayPlayerNeeds consumes and clears the mark on its next span, so
// the strongest of any pending kinds wins (DESIRE's "strongest wins" rule)
// and no separate cleanup path can be forgotten. Only the player has a
// decayPlayerNeeds to consume from; NPC one-shots ride their own write paths
// in the phases that produce them.
function notePlayerDesireSource(gameState, kind) {
  if (!gameState || !gameState.player) return;
  const amount = desireSourceAmount(kind);
  if (!(amount > 0)) return;
  const prev = (gameState.player.flags && gameState.player.flags._desireSource) || null;
  if (prev && desireSourceAmount(prev) >= amount) return;
  gameState.player.flags = { ...(gameState.player.flags || {}), _desireSource: kind };
}

// Intimacy & Voyeurism Phase 5 (D11): persist what the player is wearing —
// the OUTFIT shape ({ slot: itemId }, missing slot = nothing worn there)
// from the wardrobe panel's draft. A pure player-state write: putting clothes
// on has no need/suspicion/relationship math, so it doesn't belong in the
// effects vocabulary. Getting dressed always lands the state machine on
// 'dressed' — you walked out of the wardrobe wearing the outfit, not a towel.
function applyPlayerOutfit(player, outfit) {
  if (!player) return;
  player.outfit = { ...(outfit || {}) };
  player.clothing = 'dressed';
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

// ===== SECTION: METABOLISM (food-overhaul Phase 2, D2/D3/D4) =====
// The living hunger clock. The persisted state is the D3 fullness window
// (player.fullnessRemainingHours / fullnessWindowHours, baseline game-hours)
// plus the D4 ledger (player.meta.kcalToday / kcalBurnedToday) and the
// activity meter (player.meta.activityEvents, moodEvents-shaped decaying
// impulses). Everything here is PURE except notePlayerActivity (the writer,
// same pattern as notePlayerDesireSource): same state in, same numbers out.

// D3 — the fullness window a meal of `kcal` grants, in baseline game-hours.
// Linear at ~1h per METABOLISM.kcalPerFullnessHour kcal, then diminishing
// returns past fullnessTaperAt, hard-capped at fullnessCapHours. Zero kcal
// feeds nothing (a 0-kcal drink is hydration, not a meal); every real bite
// grants at least fullnessFloorWindow so a sip of milk isn't instant
// starvation.
function fullnessHoursFromKcal(kcal) {
  const k = Math.max(0, Number(kcal) || 0);
  if (k <= 0) return 0;
  const linear = k / METABOLISM.kcalPerFullnessHour;
  let hours = linear <= METABOLISM.fullnessTaperAt
    ? linear
    : METABOLISM.fullnessTaperAt + (linear - METABOLISM.fullnessTaperAt) * METABOLISM.fullnessTaperRate;
  return Math.min(METABOLISM.fullnessCapHours, Math.max(METABOLISM.fullnessFloorWindow, hours));
}

// The window's current remainder in baseline game-hours. Pre-overhaul
// players (no fullness fields) read as a legacy 18h window started from
// hoursSinceLastMeal — byte-identical to the Phase 5 clock, and exactly what
// the player 6->7 migration materialises into the real fields.
function fullnessRemaining(player) {
  if (typeof player?.fullnessRemainingHours === 'number') return Math.max(0, player.fullnessRemainingHours);
  const h = player?.hoursSinceLastMeal ?? 0;
  return Math.max(0, HUNGER_RHYTHM.starveHours - h);
}

// D2 — the ebbing multiplier on the hunger clock. Base 1.0, lifted by the
// decaying activity term (exercise/gig impulses) and by yesterday's energy
// balance (deficit runs hot — hungrier sooner; surplus runs a hair cool).
// Pure: reads persisted inputs, never writes.
function metabolicRate(player, gameState) {
  const meta = player?.meta || {};
  const day = gameState?.meta?.clock?.day ?? 0;
  const { activityTerm } = advanceActivityEvents(meta.activityEvents, day);
  const balance = meta.energyBalance;
  const balanceAdjust = balance === 'deficit' ? METABOLISM.deficitRateAdjust
    : balance === 'surplus' ? METABOLISM.surplusRateAdjust : 0;
  return clamp(METABOLISM.baseRate + activityTerm + balanceAdjust, METABOLISM.minRate, METABOLISM.maxRate);
}

// The activity meter's decay — mirror of advanceMoodEvents, half-life
// activityHalfLifeDays (a workout's boost is largely gone by tomorrow). The
// term is capped at activityMaxTerm so stacked exercise can't multiply the
// clock absurdly.
function advanceActivityEvents(activityEvents, day) {
  const events = Array.isArray(activityEvents) ? activityEvents : [];
  if (events.length === 0) return { activityEvents: events, activityTerm: 0 };
  const factor = Math.pow(0.5, 1 / METABOLISM.activityHalfLifeDays);
  const kept = [];
  let term = 0;
  for (const e of events) {
    const age = Math.max(0, (day ?? 0) - (e.day ?? day ?? 0));
    const contrib = (e.amount || 0) * Math.pow(factor, age);
    if (Math.abs(contrib) >= METABOLISM.activityPruneBelow) { kept.push(e); term += contrib; }
  }
  return { activityEvents: kept, activityTerm: clamp(term, 0, METABOLISM.activityMaxTerm) };
}

// The one-shot writer (actions.js/computer.js call sites): a real physical
// act pushes a rate-elevating impulse into the meter AND credits its explicit
// kcal to the ledger immediately (a workout is real burn, not just a rate
// nudge for the next few hours). Mirrors notePlayerDesireSource's in-place
// write pattern.
function notePlayerActivity(gameState, amount, kcal, day) {
  if (!gameState?.player) return;
  const player = gameState.player;
  const meta = player.meta || (player.meta = {});
  if (!Array.isArray(meta.activityEvents)) meta.activityEvents = [];
  meta.activityEvents.push({ day, amount });
  meta.kcalBurnedToday = (meta.kcalBurnedToday || 0) + (Number(kcal) || 0);
}

// D4 — day rollover (called from UI's processDayRollover): the completed
// day's ledger becomes a day-mode for the day ahead, then the ledger resets.
// burn − intake ≥ deficitThresholdKcal → deficit; the mirror → surplus.
function rollEnergyLedger(player) {
  const meta = player.meta || (player.meta = {});
  const delta = (meta.kcalBurnedToday || 0) - (meta.kcalToday || 0);
  meta.energyBalance = delta >= METABOLISM.deficitThresholdKcal ? 'deficit'
    : delta <= -METABOLISM.surplusThresholdKcal ? 'surplus'
    : 'balanced';
  meta.kcalToday = 0;
  meta.kcalBurnedToday = 0;
}

// The hunger band for the current fullness position. Two-arg form (Phase 2):
// a fraction of the meal's window remaining (HUNGER_RHYTHM.bands, minFrac).
// One-arg form is the LEGACY hour-keyed ladder (HUNGER_RHYTHM.bandsHours)
// for pre-overhaul readers, kept so old call shapes still mean the same
// thing.
function hungerBand(fullnessRemainingHours, fullnessWindowHours) {
  if (fullnessWindowHours === undefined) {
    const h = fullnessRemainingHours ?? 0;
    for (const b of HUNGER_RHYTHM.bandsHours) {
      if (h < b.maxHours) return b;
    }
    return HUNGER_RHYTHM.bandsHours[HUNGER_RHYTHM.bandsHours.length - 1];
  }
  const frac = Math.max(0, (fullnessRemainingHours ?? 0)) / Math.max(1, fullnessWindowHours);
  for (const b of HUNGER_RHYTHM.bands) {
    if (frac >= b.minFrac) return b;
  }
  return HUNGER_RHYTHM.bands[HUNGER_RHYTHM.bands.length - 1];
}

// Derived 0-100 hunger display. Purely a function of the fullness window: 90
// with a full window, linear to 0 exactly when the window is exhausted
// (which fires the existing NEED_CONSEQUENCES.hunger path). The old clock is
// the special case window=starveHours: 90×(remaining/18) ≡ 90 − 5×h. One-arg
// form keeps the legacy hours-since-meal mapping (satiety 90 − 5h) for
// pre-overhaul callers.
function satietyFrom(fullnessRemainingHours, fullnessWindowHours) {
  if (fullnessWindowHours === undefined) {
    return Math.max(0, HUNGER_RHYTHM.satietyStart - (fullnessRemainingHours ?? 0) * HUNGER_RHYTHM.satietyPerHour);
  }
  const rem = Math.max(0, fullnessRemainingHours ?? 0);
  const win = Math.max(1, fullnessWindowHours);
  return HUNGER_RHYTHM.satietyStart * Math.min(1, rem / win);
}

// Player-facing fullness prose: the band label plus the D4 energy-bridge
// hint (a deficit day means sleep restores less energy).
function fullnessStatusText(player, gameState) {
  const band = hungerBand(player?.fullnessRemainingHours ?? 0, player?.fullnessWindowHours ?? HUNGER_RHYTHM.starveHours);
  const phrase = {
    satisfied: 'that meal is still holding',
    peckish: 'a snack would do',
    hungry: 'time for a real meal',
    very_hungry: 'you have gone too long without eating',
    starving: 'eat something, now',
  }[band.key] || band.label;
  let text = `${band.label} — ${phrase}`;
  if (player?.meta?.energyBalance === 'deficit') text += ' · low fuel: sleep restores less energy today';
  else if (player?.meta?.energyBalance === 'surplus') text += ' · well fueled';
  return text;
}

// The steady-state mood target: base + needs + social + comfort + stress +
// eventTerm. See the MOOD_TARGET block in CONFIG for the terms and their
// shapes. player.mood eases toward this in decayPlayerNeeds.
// Phase 2: the hunger term reads the fullness window (remaining/window); a
// call with only four args is the LEGACY hours-since-meal shape (migration
// and old harnesses) and maps to the old hour-keyed ladder.
function resolveMoodTarget(player, gameState, eventTerm, fullnessRemainingHours, fullnessWindowHours) {
  const cfg = MOOD_TARGET;
  const isLegacy = fullnessWindowHours === undefined;
  const h = isLegacy ? (fullnessRemainingHours ?? player.hoursSinceLastMeal ?? 0) : 0;
  const mealsToday = player.mealsToday ?? 0;
  let target = cfg.base;

  // needsTerm — hunger band + energy + hygiene + meal regularity + the
  // ledger's day-mode term (D4).
  target += isLegacy
    ? hungerBand(h, undefined).moodPenalty
    : hungerBand(fullnessRemainingHours, fullnessWindowHours).moodPenalty;
  const energyMax = player.energyMax || NEEDS.energy.max;
  if (player.energy <= 0) target += cfg.needsTerm.energyEmptyPenalty;
  else if (player.energy <= energyMax * cfg.needsTerm.energyWarnFrac) target += cfg.needsTerm.energyWarnPenalty;
  if (player.hygiene <= 0) target += cfg.needsTerm.hygieneEmptyPenalty;
  else if (player.hygiene < NEEDS.hygiene.warnBelow) target += cfg.needsTerm.hygieneWarnPenalty;
  if (mealsToday >= cfg.needsTerm.mealsWellFedCount) target += cfg.needsTerm.mealsWellFedBonus;
  else if (mealsToday === 0 && ((gameState?.meta?.clock?.minutes ?? 0) / 60) % 24 >= cfg.needsTerm.mealsSkippedFromHour) {
    target += cfg.needsTerm.mealsSkippedPenalty;
  }
  const balance = player.meta?.energyBalance;
  if (balance === 'deficit') target += cfg.needsTerm.deficitMoodPenalty;
  else if (balance === 'surplus') target += cfg.needsTerm.surplusMoodBonus;

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
    let bestMusic = 0;
    for (const rec of perceiveSignals(gameState, 'player', player.location)) {
      if (rec.channel === 'smell' && rec.intensity > worstSmell) worstSmell = rec.intensity;
      if (rec.signalId === 'music' && rec.intensity > bestMusic) bestMusic = rec.intensity;
    }
    if (worstSmell > 0) target += cfg.comfort.odorPenalty * worstSmell;
    // Intimacy & Voyeurism Phase 19: music the player can actually hear is
    // a small comfort term - scaled by arrived intensity, capped. Headphones
    // silence the read (a wearer perceives none of the apartment's music),
    // and instead the wearer's own music gives the flat term below.
    if (bestMusic > 0) target += Math.min(cfg.comfort.musicCap, bestMusic * cfg.comfort.musicScale);
    const worn = wearsSoundBlocking(gameState, 'player');
    if (worn) target += cfg.comfort.wornMusicTerm;
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
// rollover hook like the others. Food-overhaul Phase 1 (D17): frozen and
// thawing stacks are exempt entirely — they never age, so they can never
// cross into Rotten-and-grace here.
function processSpoilageForDay(gameState, day) {
  if (!gameState?.objects) return;
  // Food-overhaul Phase 4 (D11): resolve any finished dishwasher cycles on
  // the write path (the same hygiene as the thawed-stack normalization
  // below) — a completed cycle empties the clean load and frees the machine.
  // Compared against the CONTINUOUS clock (gameDaysNow scale) — the caller's
  // whole-day `day` would miss a cycle that finished earlier this day. Null
  // clock (a minimal-state caller like a dev harness, or mid-migration) →
  // nothing resolves, which is safe.
  const now = gameState?.meta?.clock ? gameDaysNow(gameState.meta.clock) : null;
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    for (const obj of Object.values(objs || {})) {
      if (obj.defId === 'dishwasher' && obj.dishwasher?.cycleActiveUntilAbs > 0) {
        resolveDishwasherCycle(obj, now);
      }
    }
  }
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    for (const obj of Object.values(objs || {})) {
      const odef = OBJECT_DEFS[obj.defId];
      // Only containers that declare the state can rot; anything else is
      // skipped so cleanRoomObjects' dirtyWhen-driven reset stays sound.
      if (!odef?.states?.rotten_food || !Array.isArray(obj.contents)) continue;
      // Food-overhaul Phase 1 (D18): the multiplier resolves through the
      // single owning table by the container's storageClass (preservationFor).
      const shelfMult = preservationFor(odef);
      let anyMess = false;
      const kept = [];
      for (let stack of obj.contents) {
        const def = ITEM_DEFS[stack.defId];
        if (!def?.perishable?.days) { kept.push(stack); continue; }
        // Food-overhaul Phase 1 (D17/D29): frozen and thawing stacks never
        // age — no rot, no mess, nothing to sweep. They skip even the
        // anchor check below, which would over-charge a frozen stack whose
        // cohort still points at its pre-freeze life.
        const prog = thawProgress(stack, day);
        if (prog === 'frozen' || prog === 'thawing') { kept.push(stack); continue; }
        let rotten;
        if (prog === 'thawed') {
          // Fully thawed but still carrying its frozen block (no transfer
          // normalized it yet). Resolve through the frozen-aware
          // freshnessOf so the frozen span is never charged, then normalize
          // the anchor onto the normal clock so it reads like an ordinary
          // stack from here on.
          const fresh = freshnessOf(stack, odef, day);
          if (fresh == null) { kept.push(stack); continue; }
          rotten = fresh.pct > 1 + ROT.graceDays / fresh.shelfDays;
          const meta = { ...stack.meta };
          delete meta.frozen;
          meta.cohort = day - fresh.pct * fresh.shelfDays;
          stack = { ...stack, meta };
        } else {
          const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
          if (anchor == null) { kept.push(stack); continue; } // age unknown — never instant rot
          const shelfDays = def.perishable.days * shelfMult;
          if (day > anchor + shelfDays + ROT.graceDays) { rotten = true; } // converts to a mess
        }
        if (rotten) { anyMess = true; continue; }
        kept.push(stack);
      }
      if (anyMess) {
        // Perception plan Phase 2 (D10): setting the container's state is now
        // the WHOLE job. The room-level `odor = 'smelly'` write that used to
        // sit here is gone — the smell is derived from this state by SIGNALS'
        // deriveStandingSignals, so a second mirrored flag could only ever
        // drift from it. Nothing has to remember to clear it either.
        obj.state = { ...obj.state, rotten_food: 'rotten' };
        refreshRoomCleanliness(gameState, bucket.replace(/^room_/, ''));
      }
      // Always assign: `kept` may contain NORMALIZED stacks (a thawed stack
      // whose frozen block was dropped and anchor rewritten above) even when
      // nothing was removed — the length-only guard would silently discard
      // that normalization and leave the stack stuck on the frozen-aware math
      // until some future transfer happened to retime it.
      obj.contents = kept;
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
// What fraction of the rent a roommate carries before any negotiated agreement,
// derived from income (vocation plan Phase 8). incomeBand says HOW MUCH,
// incomeSource says from WHERE — the two together pick a cell in
// ECONOMY.rent.incomeShare (config.js). 'none' contributes nothing (money is
// running out), 'self' sits a touch under the wage curve (variable income),
// 'means' covers a wage earner's share of the same band. Pure and null-safe: an
// NPC without a readable occupation falls back to defaultRoommateShare, exactly what
// every resident paid before this phase.
function incomeRentShare(npc) {
  const occ = npc?.bible?.occupation || npc?.occupation || {};
  const source = occ.incomeSource || 'wage';
  const band = occ.incomeBand || 'mid';
  const v = ECONOMY.rent.incomeShare?.[source]?.[band];
  return typeof v === 'number' ? v : ECONOMY.rent.defaultRoommateShare;
}

// The fraction computeRent actually uses. residency.rentShare is the future
// agreement system's seam and is NOT set at move-in anymore (it used to be
// pre-populated with the flat 0.15, which is why every resident paid the same).
// The stored-default test matters: an old save's stored 0.15 was the uniform
// default, not a deliberate negotiation — so it is ignored and the share derives
// from income, which is how old saves pick up income-driven rent too. Only a
// value that actually differs from that default (something a real negotiation would
// set) is honored. A value equal to the default is indistinguishable from legacy
// and simply derives — a corner only an agreement system is ever close to, and when
// one lands it will want its own precedent anyway.
// Code-review note (not fixed, deliberately — see below): 0.15 is not just
// the legacy sentinel, it is ALSO the live derived value for
// ECONOMY.rent.incomeShare.wage.mid and .means.mid (config.js), so a real
// future negotiation landing on exactly 0.15 would be silently treated as
// "never negotiated" and re-derived, discarding the agreement. No fix ships
// here because there is currently no writer that can ever produce that
// collision — both places that set residency.rentShare (sim.js) write `null`
// unconditionally, and null already always derives, bypassing this check
// entirely. The only way to close this cleanly is a marker distinct from the
// value itself (e.g. a `residency.rentNegotiatedDay` stamp only a real
// negotiation system would ever write) — inventing that field now, with no
// writer or reader, would be the exact `stressProfile` mistake D23 exists to
// prevent. Whoever builds the negotiation system should read this comment
// before reusing the value-equality check below for anything real.
function negotiatedOrDerived(npc) {
  const stored = npc?.residency?.rentShare;
  if (typeof stored === 'number' && stored !== ECONOMY.rent.defaultRoommateShare) return stored;
  return incomeRentShare(npc);
}

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
    let share = clamp(negotiatedOrDerived(npc), 0, ceiling);
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

// `bedroomDesirability` lived here and is DELETED (2026-08-14). It scaled a
// roommate's rent share by how exposed their bedroom was to the kitchen, on
// the reading that the south wing was "the cheap seats". That was an
// over-reading: the design intent is that every bedroom in this apartment is
// equally desirable — the rooms are large and the building has good bones,
// which is to say real insulation. What the south wing gets is not a worse
// room, it is a different SENSORY position: they know first when something
// has gone off in the kitchen, and they also get the smell of a good dinner
// before anyone else. Both directions, and neither is a price.
//
// The exposure asymmetry is real, measurable and kept — it lives entirely in
// the signal layer, where it belongs. See D7 in
// src/ref/wip/floorplan-and-movement-plan.md.

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
      // Someone moving in without a negotiated agreement contributes what their
      // income says (Phase 8). rentShare: null means "derive from income" —
      // computeRent's negotiatedOrDerived. opts.rentShare is the seam the
      // future agreement system writes through when a move-in is the result of an
      // actual negotiation rather than a bare status change.
      rentShare: (opts?.rentShare != null) ? opts.rentShare : null,
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

// NPC Overhaul Phase 1's physical block, lifted out of generateCast so the
// PLAYER can have one too. It used to be forty lines inline in the cast
// loop, which is why the player — generated on a different path entirely —
// had no appearance at all: `player` was a stats bag with no `bible`, so
// IMAGE's buildImagePrompt could only ever composite NPCs into a scene and
// the person the scene is actually about was never in it.
//
// One implementation, two callers. `rng` is the caller's seeded generator
// (an NPC's charRng, or the player's own seeded stream), so both stay
// deterministic and neither can drift from the other's pools.
// --- Intimate detail (player creation + intro plan, Phase 1) ---
// Everything below is drawn from GENITAL_TYPE_FIELDS rather than a
// hand-written per-type branch, so a new genital type is a config row and
// nothing here changes.

// One entry of the `genitals` array, with exactly the keys its type applies.
function rollGenitalEntry(rng, type) {
  const fields = GENITAL_TYPE_FIELDS[type];
  if (!fields) return null;
  const entry = { type };
  for (const [key, spec] of Object.entries(fields)) {
    // A pool-less field (`description`) is authored, never rolled — leaving
    // it empty is the honest default, not a missing draw.
    if (!spec.pool) { entry[key] = ''; continue; }
    const pool = spec.pool();
    entry[key] = pool[Math.floor(rng() * pool.length)];
  }
  return entry;
}

// The default set for a gender. Unknown genders fall back to female's set
// rather than producing an empty array — a character with no genitals at all
// is a data hole, and failing to a body is safer than failing to nothing.
function rollGenitals(rng, gender) {
  const types = GENDER_DEFAULT_GENITALS[gender] || GENDER_DEFAULT_GENITALS.female;
  return types.map(t => rollGenitalEntry(rng, t)).filter(Boolean);
}

// Strip keys that do not apply to an entry's `type`, and drop entries whose
// type has no table row. The schema validates against the UNION of every
// type's keys (it must — see CHARACTER_SCHEMA's comment), so a round-trip
// through validateNpcItemObject default-fills `girth: ''` onto a vagina.
// This is what puts that back. Pure; safe to call on already-clean data.
function normalizeGenitals(genitals) {
  if (!Array.isArray(genitals)) return [];
  const out = [];
  for (const raw of genitals) {
    const fields = GENITAL_TYPE_FIELDS[raw?.type];
    if (!fields) continue;
    const entry = { type: raw.type };
    for (const key of Object.keys(fields)) {
      entry[key] = typeof raw[key] === 'string' ? raw[key] : '';
    }
    out.push(entry);
  }
  return out;
}

function generateIntimate(rng, gender) {
  const pickPhys = (pool) => pool[Math.floor(rng() * pool.length)];
  const breastPool = breastPoolForGender(gender);
  return {
    breasts: {
      size: pickPhys(breastPool.size),
      shape: pickPhys(breastPool.shape),
      areola: pickPhys(PHYS_POOL_BREAST_AREOLA),
      nipples: pickPhys(PHYS_POOL_BREAST_NIPPLES),
      sensitivity: pickPhys(PHYS_POOL_SENSITIVITY),
    },
    genitals: rollGenitals(rng, gender),
    bodyHair: pickPhys(PHYS_POOL_BODY_HAIR),
  };
}

// NOTE: the intimate group is NOT rolled here, and that is deliberate. It is
// derived from `gender`, which both callers roll AFTER this function returns
// (rollCastSlot's `structured.gender`, generatePlayerAppearance's `a.gender`).
// Folding it in would mean hoisting the gender draw above this one, and draw
// ORDER is what makes a seed reproduce a cast — every existing seed would
// produce a different household. So `generateIntimate` stays a separate call
// each caller makes once it knows the gender, appending new draws at the end
// where they disturb nothing.
function generatePhysical(rng) {
  const pickPhys = (pool) => pool[Math.floor(rng() * pool.length)];
  const height = pickPhys(PHYS_POOL_HEIGHT);
  const build = pickPhys(PHYS_POOL_BUILD);
  return {
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
    distinguishingFeatures: pickUnique(rng, PHYS_POOL_FEATURES, 1 + Math.floor(rng() * 2)),
    piercings: rng() < 0.4 ? [{ location: pickPhys(PHYS_POOL_PIERCING_LOC), type: pickPhys(PHYS_POOL_PIERCING_TYPE), description: '' }] : [],
    tattoos: rng() < 0.35 ? [{ location: pickPhys(PHYS_POOL_TATTOO_LOC), description: '', style: pickPhys(PHYS_POOL_TATTOO_STYLE) }] : [],
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
}

// Facial hair (2026-08-19). Deliberately drawn AFTER generateIntimate by the
// two callers, NOT inside generatePhysical: inserting a draw mid-sequence
// would shift every existing seed's stream and silently re-roll the cast for
// a pasted seed (design invariant 6 — same seed, same house). `rng() < 0.4`
// is the same gate idiom piercings/tattoos use — most people are
// clean-shaven, and the gate (not a pool stuffed with 'clean-shaven') is what
// makes that true.
function appendFacialHairDraw(physical, rng) {
  const pickPhys = (pool) => pool[Math.floor(rng() * pool.length)];
  physical.facialHair = rng() < 0.4 ? pickPhys(PHYS_POOL_FACIAL_HAIR) : 'clean-shaven';
  return physical;
}

// The player's own appearance, in the SAME shape an NPC's bible carries —
// `bible.physical` plus the `age`/`gender` fields getPhysicalDescriptionForPrompt
// leads with. Giving it that shape rather than a bespoke one is the whole
// point: NPC.getPhysicalDescriptionForPrompt then serves the player with no
// second code path, so the player is described to the image generator by
// exactly the machinery that describes everyone else.
//
// `authored` carries anything the player chose at character creation; every
// field they left blank is rolled from the same pools the cast uses.
function generatePlayerAppearance(seed, authored) {
  const rng = seededRng(seed, 'player_appearance');
  const physical = generatePhysical(rng);
  const a = authored || {};
  // Age and gender are resolved BEFORE the merge below (which draws no
  // randomness, so their relative RNG position is unchanged) because the
  // intimate roll needs the gender — same derivation as the cast's.
  const age = a.age ?? (22 + Math.floor(rng() * 10));
  // Same weighted enum the cast rolls from (rollGender), not a coin flip —
  // the player is drawn from the same table as everyone they live with.
  const gender = a.gender || rollGender(rng);
  physical.intimate = generateIntimate(rng, gender);
  appendFacialHairDraw(physical, rng);

  // Merge any authored subset over the rolled base. This is the shared merge
  // (D14) — rollCastSlot uses the SAME function for partial.physical, so the
  // two appearance-authoring paths are one implementation, not two.
  applyAuthoredPhysical(physical, a);
  return { age, gender, physical };
}

// The merge half of appearance authoring, extracted from generatePlayerAppearance
// (D14): a player-authored physical subset is merged over a rolled base.
//
// This draws NO randomness — it is safely applied after every roll in the
// sequence (design invariant 4), so a seed's cast is byte-identical whether
// or not a `physical` partial was supplied.
//
// Three bug-fixes the earlier inline form recorded, preserved here:
//  * A shallow per-group merge, not a wholesale replace: creation may author
//    only hair colour, and the rest must stay rolled rather than vanish.
//  * `intimate` is the one group with a level BELOW the per-group merge, so
//    the generic pass above would flatten it: authoring only `breasts.size`
//    would replace the whole breasts object and drop the rolled shape, areola
//    and nipples. Merge its object half a level deeper, and REPLACE its array
//    half — a genitals list the player built is the complete list, and
//    unioning it with a rolled one would hand them parts they removed.
//  * `heightBuild` is a DERIVED field that generatePhysical composes at roll
//    time, and getPhysicalDescriptionForPrompt prefers it over the height/build
//    pair. Recompose it after the merge or an authored build lands in the data
//    and never reaches the prose.
function applyAuthoredPhysical(rolledPhysical, authored) {
  const a = authored || {};
  if (!a.physical) return rolledPhysical;
  for (const [group, val] of Object.entries(a.physical)) {
    if (group === 'intimate') continue;   // handled below — it nests deeper
    rolledPhysical[group] = (val && typeof val === 'object' && !Array.isArray(val))
      ? { ...rolledPhysical[group], ...val }
      : val;
  }
  const ai = a.physical.intimate;
  if (ai) {
    if (ai.breasts) rolledPhysical.intimate.breasts = { ...rolledPhysical.intimate.breasts, ...ai.breasts };
    if (Array.isArray(ai.genitals)) rolledPhysical.intimate.genitals = normalizeGenitals(ai.genitals);
    if (typeof ai.bodyHair === 'string') rolledPhysical.intimate.bodyHair = ai.bodyHair;
  }
  rolledPhysical.heightBuild = `${rolledPhysical.height} and ${rolledPhysical.build}`;
  return rolledPhysical;
}

// A blank name rolls, exactly like a blank appearance field does — the
// studio's standing "Roll it" promise applies to identity too. First names
// come from CHAR_GEN.namePools matched to gender, the same table the cast
// draws from, so the player is named from the same world as everyone else.
function rollPlayerName(seed, gender, authored) {
  const a = authored || {};
  const rng = seededRng(seed, 'player_name');
  const pick = (pool) => pool[Math.floor(rng() * pool.length)];
  const pools = CHAR_GEN.namePools;
  // trans_male/trans_female draw from the pool matching their gender, not
  // their assigned sex — the same rule CHAR_GEN's own comment states for the
  // cast. futanari leans female, also per that comment.
  const firstPool =
    gender === 'male' || gender === 'trans_male' ? pools.first_m :
    gender === 'female' || gender === 'trans_female' || gender === 'futanari' ? pools.first_f :
    pools.first_n;
  return {
    name: (a.name || '').trim() || pick(firstPool),
    surname: (a.surname || '').trim() || pick(SURNAME_POOL),
  };
}

// Full house generation: structured draws + constraint satisfaction.
// `partials` (optional) is an array, index-aligned with residents, of
// per-character partial-authoring objects (see rollCastSlot) — this is
// what lets "guided" and "manual" creation reuse the exact same generator
// as "full random" (partials = [] or omitted).
//
// `playerDraft` (optional) is the SAME idea for the player themselves:
// whatever the Player Design studio authored, with every unauthored field
// rolled from the cast's pools. Omitted = fully random, exactly like a
// partials-free cast.
//
// It WIDENED from the old `playerAppearance` ({ age, gender, physical }) to
// carry identity and portrait too ({ name, surname, age, gender, physical,
// portrait }) when the studio landed. The extra keys pass straight through
// generatePlayerAppearance untouched — it reads only what it knows — and are
// picked off separately by buildGameState. Callers passing the old narrower
// shape still work and simply author no name.
// `economyCfg` (Sandbox Pre-Game Editor Overhaul audit, 2026-08-23) is the
// sandbox's cfg.economy, or undefined for every non-sandbox path (solo /
// random / guided), which then gets ECONOMY's own tuned defaults exactly as
// before. It exists so a sandbox's authored rentGraceDays/billsStartDay are
// BORN into the opening's day fields here, rather than written over them
// afterwards in applySandboxPreset — D19's guard (see
// snapshotSandboxDayFields) forbids rebasing an already-stamped day field,
// and rightly so: the failure it catches is a game opening on a wall of
// retroactively-overdue bills. Generating a different opening is not
// rebasing one, so this seam satisfies D19 by construction and leaves the
// guard fully armed rather than amending it.
function SIM_generateHouse(seed, residentCount, partials, playerDraft, economyCfg) {
  const actualSeed = seed || genSeed();
  const clock = { day: 1, weekday: 0, minutes: CLOCK.startMinutes, phase: getPhase(CLOCK.startMinutes) };

  // Phase 7: solo start. When opening.soloStart is true and residentCount
  // is 0, skip cast generation entirely — the player starts alone in an
  // empty apartment. Roommates are recruited later via the Classifieds app.
  if (ECONOMY.opening?.soloStart && residentCount === 0) {
    const emptyCast = { npcs: {}, npcIds: [], castWeb: {}, playerDraft };
    return buildGameState(actualSeed, emptyCast, clock, [], economyCfg);
  }

  // Generate residents
  let bestCast = null;
  let bestScore = -1;
  let attempts = 0;
  const maxAttempts = CHAR_GEN.maxAttempts;
  let droppedConstraints = [];

  // F1 (Discord feedback, 2026-08-23): read alongside the existing economy
  // knobs rather than adding a new parameter — economyCfg is already the
  // "options this opening was configured with" bag threaded from both
  // startSoloGame and startSandboxGame.
  const dispositionSkew = Number.isFinite(economyCfg?.dispositionSkew) ? economyCfg.dispositionSkew : 0;

  while (attempts < maxAttempts) {
    attempts++;
    const cast = generateCast(actualSeed, residentCount, attempts, partials, dispositionSkew);
    const score = scoreCast(cast, residentCount);
    if (score.quality > bestScore) {
      bestScore = score.quality;
      bestCast = cast;
      droppedConstraints = score.dropped || [];
    }
    if (score.quality >= getQualityThreshold(residentCount) && score.dropped.length === 0) break;
  }

  // Build game state from best cast
  return buildGameState(actualSeed, { ...bestCast, playerDraft }, clock, droppedConstraints, economyCfg);
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
// baggage, wound, want, blindSpot, boundary, name, physical (D15 — an
// authored appearance subset, merged by applyAuthoredPhysical AFTER the roll so
// the RNG order is untouched). Whatever is supplied is
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
// dispositionSkew (default 0): F1's "friendlier/harsher cast" slider,
// [-1,1]. Applied to warmth only — the single most legible axis for that
// framing — and only when the axis isn't already authored (pt.warmth ??
// ...), so a hand-set roommate temperament is never second-guessed by it.
function rollCastSlot(seed, slotIndex, npcId, attempt, usedOccupationCats, priorTagSets, partial, dispositionSkew = 0) {
  partial = partial || {};
  let fallbackNormalized = null;
  let fallbackOccCategory = null;

  for (let rollAttempt = 1; rollAttempt <= CHAR_GEN.maxAttempts; rollAttempt++) {
    const charRng = seededRng(seed, `char_${slotIndex}_${attempt}_${rollAttempt}`);

    // Temperament axes, per-axis override. Whether the resulting cast
    // spans a meaningful range is a cast-level property, checked in
    // scoreCast.
    //
    // D6 — THIS MOVED ABOVE THE OCCUPATION ROLL. Occupation used to be drawn
    // first, before a temperament existed, which made personality coupling
    // not merely absent but structurally impossible: nothing about the person
    // could inform the job because the person had not been rolled yet.
    //
    // The cost is that the charRng stream is consumed in a different order,
    // so a given seed produces a different cast than it did before this plan.
    // That is NOT save-breaking — generateCast runs at new-game only and the
    // result is persisted in gameState.npcs — and it matters only if
    // cross-version seed reproducibility were promised, which it is not.
    // Determinism WITHIN a version is untouched and still asserted.
    const pt = partial.temperament || {};
    const temperament = {
      warmth:            pt.warmth            ?? rollAxis(charRng, dispositionSkew),
      volatility:        pt.volatility        ?? rollAxis(charRng),
      openness:          pt.openness          ?? rollAxis(charRng),
      conscientiousness: pt.conscientiousness ?? rollAxis(charRng),
      assertiveness:     pt.assertiveness     ?? rollAxis(charRng),
      selfAwareness:     pt.selfAwareness     ?? rollAxis(charRng),
    };

    // Occupation: forced to the authored category if given, else no shared
    // categories across the cast — both now weighted BY the temperament
    // above (D7), through weightedPick's existing optional weightFn.
    //
    // D11 — the fallback. occupationAffinity's disinhibitionFloor is the
    // first thing in cast generation capable of scoring a candidate at
    // literally zero, which makes it the first thing capable of emptying a
    // pool: a low-disinhibition character offered only adult work has no
    // legal draw at all. rollCastSlot's contract is that character creation
    // NEVER hard-fails, so when every candidate scores zero the affinity
    // weighting is dropped for that draw and the pick is uniform. A cast with
    // no adult worker in it is a correct outcome, not a retry condition.
    const affinityOf = (o) => occupationAffinity(o, temperament);
    const pickOcc = (pool) => {
      const anyViable = pool.some(o => affinityOf(o) > 0);
      return weightedPick(charRng, pool, anyViable ? affinityOf : null);
    };
    let occ;
    if (partial.occupationCategory) {
      const forced = OCCUPATION_POOL.filter(o => o.category === partial.occupationCategory);
      occ = pickOcc(forced.length > 0 ? forced : OCCUPATION_POOL);
    } else {
      const availableOccs = OCCUPATION_POOL.filter(o => !usedOccupationCats.has(o.category));
      occ = pickOcc(availableOccs.length > 0 ? availableOccs : OCCUPATION_POOL);
    }

    // D4 — which days a hybrid worker is in the office. Rolled here, once,
    // and stored on the occupation record: SCHEDULES only knows weekday from
    // weekend, so day-of-week variance cannot live in a template without
    // inventing seven-day ones. Indices are getWeekday's (0=Mon .. 6=Sun).
    let officeDays = [];
    if (occ.workMode === 'hybrid') {
      const [lo, hi] = VOCATION_TUNING.hybridOfficeDayCount;
      const count = lo + Math.floor(charRng() * (hi - lo + 1));
      officeDays = pickUnique(charRng, VOCATION_TUNING.hybridOfficeDayPool, count).sort((a, b) => a - b);
    }

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
    const physical = generatePhysical(charRng);

    // Build structured character (name/visual/history/sketch/sampleLines
    // are prose, expanded later by LLM — except name, which the player may
    // author directly).
    // NPC Overhaul Phase 5: Personality generation — seeded from charRng, weighted by temperament
    const numTraits = 3 + Math.floor(charRng() * 3); // 3-5 traits
    // D7, the second half of the coupling: the occupation was drawn FROM the
    // temperament above, and now leans the trait draw back toward itself, so
    // a Cam Model tends to come out brazen and a Bookkeeper meticulous. A
    // LEAN, not a gate — the multipliers shift odds and forbid nothing, and
    // an occupation with no traitAffinity draws exactly as it did before.
    const traits = pickUnique(charRng, PERSONALITY_TRAITS_POOL, numTraits, t => traitAffinityFor(occ, t));
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
      surname: partial.surname || '',
      visual: '',
      genSeed: Math.floor(charRng() * 1000000),
      age: partial.age ?? rollAge(charRng),           // Phase 0: first-class age, authorable via partial
      gender: partial.gender || rollGender(charRng),  // Phase 0: first-class gender, authorable via partial
      physical,                                           // NPC Overhaul Phase 1 (+ .intimate attached below)
      history: '',
      temperament,
      personality,                                           // NPC Overhaul Phase 5
      // The bible carries the occupation's RUNTIME fields, not the pool entry
      // wholesale. `affinity` and `traitAffinity` are roll-time tuning: they
      // are consumed above and have no reader after generation, so persisting
      // them onto every NPC — and into every save — would be six copies of a
      // tuning table with nothing to read them. That is the `stressProfile`
      // mistake with extra steps (D23).
      //
      // Code-review fix: this used to be a hand-maintained ALLOWLIST of which
      // fields to copy, and it silently fell behind — styleLean, foodLean,
      // sleepRhythm and spendingLean were all authored on every one of the 59
      // OCCUPATION_POOL entries, all had real readers shipped alongside them,
      // and NONE of them ever reached a real NPC's bible, because nobody
      // remembered to add four more lines here when they were added. That is
      // a bigger version of the exact mistake D23 exists to prevent — a
      // one-line reader-registration step is exactly the kind of thing that
      // gets forgotten under time pressure, the same as the doc comment right
      // above this one already knew about `stressProfile`.
      //
      // A DENYLIST can't have that failure mode the same way: it copies
      // every field on the pool entry through by default and only excludes
      // the two known roll-time-only keys by name, so a fifth/sixth/seventh
      // lifestyle dimension added later reaches the bible automatically —
      // the reader still has to be written (D23 isn't optional), but the
      // wiring between "authored in the pool" and "present on the NPC" can no
      // longer silently drop a field.
      occupation: (() => {
        const { affinity, traitAffinity, ...runtime } = occ;
        return {
          ...runtime,
          workMode: occ.workMode || 'on_site',
          incomeSource: occ.incomeSource || 'wage',
          ...(officeDays.length ? { officeDays } : {}),
        };
      })(),
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

    // The undressed layer, attached once `gender` above has actually been
    // decided — the genital set is derived from it. Appended after every
    // pre-existing draw so no seed's household changes (see generatePhysical).
    structured.physical.intimate = generateIntimate(charRng, structured.gender);
    appendFacialHairDraw(structured.physical, charRng);

    // Sandbox (D15): partial.physical is the authored appearance subset,
    // merged over the rolled base by the SAME applyAuthoredPhysical the player
    // studio calls, applied AFTER generateIntimate and appendFacialHairDraw
    // so the RNG draw order is untouched (design invariant 4). The merge
    // draws no randomness, so one seed's household is byte-identical whether
    // or not a physical partial was supplied.
    applyAuthoredPhysical(structured.physical, partial);

    // Settings & Pause Overhaul Phase 6 (D13): species, drawn AFTER every
    // pre-existing draw in the sequence — the append-at-end rule that keeps
    // a default human-100% distribution byte-identical to pre-overhaul for
    // the same seed (design invariant 4). partial.species pins an authored
    // species and skips the roll (Del and the stub-pin paths both rely on
    // this); the schema enum guards against an invalid pin failing validation.
    structured.species = partial.species || rollSpecies(charRng);

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
function generateCast(seed, count, attempt, partials, dispositionSkew = 0) {
  const npcs = {};
  const usedOccupationCats = new Set();
  const npcIds = [];

  for (let i = 0; i < count; i++) {
    const npcId = genSeededNpcId(seed, i);
    const priorTagSets = npcIds.map(id => new Set(npcs[id].bible.interests.flatMap(x => x.tags)));
    const partial = (partials && partials[i]) || {};

    const rolled = rollCastSlot(seed, i, npcId, attempt, usedOccupationCats, priorTagSets, partial, dispositionSkew);
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
// skew (default 0, backward-compatible with every existing caller) shifts
// the roll before clamping — same affine-pull shape as skewAxisTowardHigh
// elsewhere in the file, just linear rather than multiplicative since this
// needs to be able to push toward EITHER end (F1's disposition slider),
// not just skew high.
function rollAxis(rng, skew = 0) {
  return Math.max(-1, Math.min(1, rng() * 2 - 1 + skew));
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
function buildGameState(seed, cast, clock, droppedConstraints, economyCfg) {
  const { npcs, npcIds, castWeb } = cast;
  // The opening's two day-shaped economy knobs, resolved once here. Undefined
  // economyCfg (every non-sandbox path) falls back to ECONOMY's own numbers,
  // so a solo/random/guided start is byte-identical to before this param
  // existed. Both are floored so a sandbox can never author an opening that
  // is already overdue on day 1 — grace 0 would put rent due ON day 1, which
  // is the exact "wall of bills" state D19 exists to prevent.
  const openingGraceDays = Math.max(1, Number.isFinite(economyCfg?.rentGraceDays)
    ? economyCfg.rentGraceDays
    : (ECONOMY.opening?.rentGraceDays || ECONOMY.payPeriodDays));
  // billsStartDay is authored as a DAY (day 8 = today's default); initBillState
  // and ECONOMY.opening speak in DELAY (7). The -1 is that one conversion, kept
  // here beside its sibling rather than repeated at each use.
  const openingBillDelay = Math.max(0, Number.isFinite(economyCfg?.billsStartDay)
    ? economyCfg.billsStartDay - 1
    : (ECONOMY.opening?.firstBillDelay || 0));

  // Room shell state (cleanliness/lastEvent). Presence is never stored here
  // — it's derived live from npc.location via getPresentNpcIds, and (as of
  // WORLD) ownership/privacy are derived the same way via roomOwnerId/
  // roomPrivacy rather than stored, so a move-in/move-out can never leave a
  // stale value behind. NPCs' starting location was already set to their
  // assigned bedroom in generateCast; the player starts in bedroom_player
  // (set below).
  //
  // Player appearance and name are resolved BEFORE the objects spawn (not
  // after, as they historically were): the wardrobe seeder needs the player's
  // resolved Everyday style to stock the bedroom wardrobe, and the name roll
  // depends on the resolved gender. Both are seeded streams independent of
  // object spawning, so hoisting them changes no RNG sequence.
  const playerAppearance = generatePlayerAppearance(seed, cast.playerDraft);
  const playerName = rollPlayerName(seed, playerAppearance.gender, cast.playerDraft);

  // Objects are spawned first (WORLD's spawnObjectsForNewGame) so
  // cleanliness can be derived from them immediately rather than starting
  // at a fixed placeholder that then never moves until something touches
  // it — see recomputeRoomCleanliness.
  const objects = spawnObjectsForNewGame(seed, npcs, playerAppearance.physical.fashion);
  const rooms = {};
  for (const roomId of ALL_ROOMS) {
    const bucket = objects[`room_${roomId}`];
    // `odor` was a field here until perception plan Phase 2 (D10) — now derived.
    rooms[roomId] = { capacity: ROOMS[roomId].capacity, cleanliness: recomputeRoomCleanliness(bucket), lastEvent: null };
  }

  // Intimacy & Voyeurism Phase 6 (D11): NPCs start dressed in their daily
  // outfit, derived from their bedroom wardrobe the same way resolveTick will
  // keep deriving it — so the first render (before any tick) already shows a
  // real outfit, and a reload of an old save (no outfit fields) is covered by
  // the same additive-default shape resolveTick writes.
  for (const id of npcIds) {
    const npc = npcs[id];
    const block = npc.schedule?.currentBlock || 'morning';
    npc.outfit = npcOutfitForContext(npc, { objects }, block, null, id);
    if (!npc.clothing) npc.clothing = 'dressed';
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

  // Player state. The appearance/name were already resolved above (before
  // the object spawn, which the wardrobe seeder needs the resolved fashion
  // for); the rest of the player is built here.
  // Intimacy & Voyeurism Phase 5 (D11): the player starts DRESSED. The daily
  // outfit is composed deterministically from their starter wardrobe (the
  // same composeOutfit Phase 6's NPCs use), so the wardrobe panel opens on a
  // real current outfit and the scene prompt has something to say. A missing
  // wardrobe (unusual layout) leaves an empty outfit — 'dressed' reads fine
  // either way, and the additive-default pattern means an OLD SAVE (no
  // outfit/clothing fields) loads as dressed-with-no-outfit, no migration.
  const playerWardrobe = Object.values(objects.room_bedroom_player || {}).find(o => o.defId === 'wardrobe');
  const playerOutfit = playerWardrobe
    ? composeOutfit('daily', (playerWardrobe.contents || []).map(s => s.defId))
    : {};

  const player = {
    // What the player LOOKS like, in the same shape an NPC's bible carries
    // (age/gender/physical) so NPC's getPhysicalDescriptionForPrompt reads it
    // with no second code path. Before this the player had no appearance at
    // all, which is why every scene image in the game drew the roommates and
    // left out the person the scene is about. Authored fields come from the
    // Player Design studio; the rest are rolled from the cast's own pools.
    appearance: playerAppearance,
    // Who the player IS, as opposed to what they look like. Before the Player
    // Design studio the player had no name at all — `gs.player?.name || 'You'`
    // on the save card was the only reference in the codebase, and it always
    // took the fallback. `surname` is separate because the intro's will names
    // the grandfather `Julius <surname>`: his identity is derived from the
    // player's rather than authored on its own.
    name: playerName.name,
    surname: playerName.surname,
    // Intimacy & Voyeurism Phase 5 (D11): what the player is wearing right
    // now — the OUTFIT shape ({ slot: itemId }, missing slot = nothing worn
    // there) persisted on the player, and the clothing STATE MACHINE value
    // (dressed|changing|nude|towel|sleepwear|undressed, same enum as NPCs).
    // outfit is the data, clothing is the state; the describer and the scene
    // read both. Old saves lack both fields and read as dressed, no outfit.
    outfit: playerOutfit,
    clothing: 'dressed',
    // The portrait the studio generated, stored the way takePhoto stores a
    // photo — the PROMPT and SEED that reproduce it, never the blob, because
    // the image cache is a shared LRU that can evict the pixels at any time.
    // `promptDirty` records that the player hand-edited the prompt, which
    // freezes it against any further rebuild from the appearance fields.
    portrait: (cast.playerDraft && cast.playerDraft.portrait)
      || { prompt: '', seed: 0, promptDirty: false },
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
    // new real state. Food-overhaul Phase 2 (D3/D4): the fullness window
    // becomes the real state (18h legacy window, 16h remaining = the same 80
    // display), and the D4 ledger/meter start empty and balanced.
    hoursSinceLastMeal: 2,
    fullnessWindowHours: HUNGER_RHYTHM.starveHours,
    fullnessRemainingHours: HUNGER_RHYTHM.starveHours - 2,
    mealsToday: 0,
    moodEvents: [],
    hunger: 80,
    meta: {
      kcalToday: 0,
      kcalBurnedToday: 0,
      energyBalance: 'balanced',
      activityEvents: [],
    },
    hygiene: 100,
    mood: 0.2, // [-1, 1] scale — see NEEDS.mood config comment. 0.2 mirrors the old 60/100 starting mood at the same relative position.
    // Intimacy & Voyeurism Phase 8 (D9/D12): desire as a real need. Decayed
    // and sourced in decayPlayerNeeds like every other bar; old saves lack
    // the field and read as DESIRE.player.start there, so no migration.
    desire: DESIRE.player.start,
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
    rentDueDay: 1 + openingGraceDays,
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
      // F1 (Discord feedback, 2026-08-23): stamped from economyCfg exactly
      // like the two day-shaped economy fields above — undefined/malformed
      // input falls back to the same no-op defaults WORLD_KEY_FALLBACKS
      // gives an old save, so a non-sandbox/non-configured opening is
      // byte-identical to before this existed.
      gameplayOptions: {
        needDecayScale: Number.isFinite(economyCfg?.needDecayScale) ? economyCfg.needDecayScale : 1,
        needDecayDisabled: !!economyCfg?.needDecayDisabled,
        willingnessBaseline: Number.isFinite(economyCfg?.willingnessBaseline) ? economyCfg.willingnessBaseline : 0,
        // F5 (Discord feedback, 2026-08-24): same treatment as the two
        // fields above — an ongoing effect (read every advancePhoneBattery
        // call), not a generation-time-only skew like dispositionSkew, so it
        // belongs in the persisted bag.
        phoneBatteryScale: Number.isFinite(economyCfg?.phoneBatteryScale) ? economyCfg.phoneBatteryScale : 1,
        phoneBatteryAlwaysCharged: !!economyCfg?.phoneBatteryAlwaysCharged,
      },
      // Intimacy & Voyeurism Phase 12 (D12): the NPC↔NPC relationship store
      // (see relationships.js). One record per pair, keyed by pairKey(a,b) —
      // the same canonical form castWeb uses. Lazy: stays empty until a pair
      // actually co-locates, and old saves read the WORLD_KEY_FALLBACKS
      // default with no migration.
      relationships: {},
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
      // Grocery delivery (QuickCart): placed orders, same shape/reasoning
      // as foodOrders — the shopper and the handover outlive the app
      // session.
      groceryOrders: [],
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
      // Intimacy & Voyeurism Phase 14 (D14): the outside-partner index —
      // residentId → { npcId, sinceDay, lastVisitDay }. The partner NPCs
      // themselves live in `npcs` (visitor status) and the relationship
      // record in `relationships`; this is just the cheap lookup the visit
      // planner, the sext drive and the infidelity writer read. See
      // ensureOutsidePartners.
      outsidePartners: {},
      // Perception plan Phase 3: the transient-signal ring buffer. Records are
      // { id, roomId, intensity, bornTick, sourceId } and fade at their def's
      // decayPerTick; SIGNALS' emitTransient prunes and caps it on every
      // write. Standing signals are NOT here — those are derived from object
      // state on demand and never stored.
      signals: [],
      // Contractor tutorial (contractor doc Phase 3): one-shot tutorial /
      // milestone flags (tutorialRenoUsed, tutorial_<milestoneId>) — see
      // src/ref/complete/contractor-tutorial-overhaul-plan.md.
      flags: {},
      rent,
      // Phase 6 taxes: estimated tax on a 70-day period (calendar plan D3 —
      // end of Summer and end of Winter). quarterGross accumulates each
      // period's gross gig income; the bill lands at the period's end.
      // lastQuarterBilled is the last fully-billed tax-period index (0-1),
      // so a save reloaded mid-period doesn't rebill; the key keeps its
      // quarter-era name by plan (renaming it would need a save migration).
      // unpaid carries penalties forward (compounding). autoReserve is the
      // opt-in skim toggle. quarterDeductions accumulates deductible
      // spending this period (Nile tech, internet share, classes).
      // lastQuarterOwed/lastQuarterPaid record the most recent bill for
      // display. reserve is the auto-reserve balance the player can draw on
      // to pay the tax bill.
      taxes: { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0, quarterDeductions: 0, lastQuarterOwed: 0, lastQuarterPaid: 0 },
      // Phase 3 bills: one entry per BILL_DEFS. `dueDay` is the next day a
      // charge posts; `balance` is the currently-owed amount (0 when paid);
      // `status` is 'current' (paid up / not yet due), 'due' (posted, in
      // grace), 'overdue' (past grace, cutoff active), 'paid' (settled this
      // cycle); `overdueDays` counts days past grace for escalation text.
      // First due days are staggered so the player isn't hit with every
      // bill on day 8 — rent first (day 8), then utilities spread across
      // the first month. Initialized by initBillState below.
      bills: initBillState(openingGraceDays, openingBillDelay),
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
  state.npcs[CONTRACTOR_ID].memory.facts = CONTRACTOR_INITIAL_FACTS.map(f => backfillFactRecordV2(f));
  // Phase 3 (D9): the seed facts bypass addMemoryFact, so they need stable
  // factIds + the openQuestions default like every other record (the
  // contractor is a visitor and never ruminates, but a future reader must
  // not see factId-less facts).
  state.npcs[CONTRACTOR_ID] = backfillOpenQuestionsV2(state.npcs[CONTRACTOR_ID]);
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
// utilities stagger across the first ~month so the opening isn't a wall
// of bills, phone/insurance land at the end of the first month. Stagger
// offsets are relative to day 1.
// Both params are optional and default to ECONOMY's own numbers, so every
// existing caller (the WORLD_KEY_FALLBACKS factory and the pre-bills save
// fallback, both in state.js) is unchanged. buildGameState passes a
// sandbox's authored values through when it has them — see the economyCfg
// note on SIM_generateHouse. The per-utility stagger below is NOT rescaled
// by either: it is shifted wholesale by `delay`, exactly as before, so the
// deliberate spread the calendar plan's D6 insists on ("do not tidy these
// onto day 35") survives whatever opening the player authors.
function initBillState(graceDays, billDelay) {
  // Phase 7: utility bills start after ECONOMY.opening.firstBillDelay
  // so the opening isn't a wall of bills on day one. Rent is deferred
  // separately via rentDueDay in the player state.
  const delay = Number.isFinite(billDelay) ? billDelay : (ECONOMY.opening?.firstBillDelay || 0);
  const grace = Number.isFinite(graceDays) ? graceDays : (ECONOMY.opening?.rentGraceDays || ECONOMY.payPeriodDays);
  // D6: the first-due stagger is DELIBERATELY unchanged by the 30→35-day
  // cadence change. "Once per season" is a statement about the period, not
  // the phase — collapsing all six bills onto the season boundary would
  // build a ~$600 wall on day 35 (with taxes beside it on every second
  // one). Keep these offsets exactly as they are; do not "tidy" them onto
  // day 35. (Two consequences follow from keeping them, both accepted: the
  // phone bill lands on day 35 / the season boundary, because its offset
  // is 28 + 7 = 35; and insurance's first four postings are 37/72/107/142,
  // so within any 140-day window the phase can cost or grant it a posting.
  // See verify-cal-p2.js.)
  const firstDue = {
    rent: 1 + grace,
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

// A completed renovation writes the object states its facility OWNS
// (FACILITY_DEFS' `completionStates`, keyed by OBJECT_DEFS id and applied to
// every instance in the facility's room). The pool is the case that needed
// it: `swimming_pool.water` was a state the def described, the tier-0 copy
// promised ("It holds no water") and nothing ever wrote — so a dry basin
// with a torn liner emitted the smell of stagnant green water for the whole
// game. Declared on the facility rather than branched on here, so the next
// renovation that owns a state adds a line of data, not a special case.
// Lives here (sim.js) rather than ui.js so the sandbox preset can call it —
// see the Seasonal Calendar & Sandbox plan B3 residency note (the loadgame
// harness ORDER stops before the ui/js layer).
function applyFacilityCompletionStates(gameState, facilityId) {
  const def = FACILITY_DEFS[facilityId];
  if (!def?.completionStates) return;
  const bucket = gameState.objects?.[`room_${def.room}`];
  if (!bucket) return;
  for (const obj of Object.values(bucket)) {
    const states = def.completionStates[obj.defId];
    if (states) obj.state = { ...obj.state, ...states };
  }
  refreshRoomCleanliness(gameState, def.room);
}

// Sandbox mode preset application (Seasonal Calendar & Sandbox plan, B3/D16-D19).
// A pure-ish patch applied BETWEEN SIM_generateHouse and writeGeneratedGameState:
// mutates `gameState` in place, returns it. The ordered steps are load-bearing
// (D18) — structural flags must be written and the live graph rebuilt BEFORE
// residency is assigned (converting the study adds a fourth bedroom to the picker),
// and applyFacilityCompletionStates must run after each facility tier lands (the
// pool's completionStates are what stop a "restored" house from still smelling of
// stagnant water). meta.clock is never touched and NO absolute day field is ever
// rewritten (D19) — sandbox is always day 1; the advanced thing is the house.
// B5 (D21): the auto-assign target for roomless sandbox roommates — the
// first bedroom with a free bed, over the same room set the sandbox config
// screen offers (bedroom_1/2/3, plus 'study' when the study→bedroom
// structural flag is set; bedroom_player is never an NPC room — D16).
// Capacity is the room's habitability facility's residentCapacity at its
// current tier, defaulting to 1 when the facility declares none — the same
// arithmetic sandboxRoomCapacity (menu.js) previews and verify-sbx-p3
// asserts against a started state. moveToRoom resolves the bed to the first
// free A/B slot, so this stays consistent with the explicit moves in
// applySandboxPreset step 5.
function firstFreeBedroom(gameState) {
  const upgrades = gameState.world?.upgrades || {};
  const flags = gameState.world?.flags || {};
  const roomIds = Object.keys(ROOMS).filter(id => ROOMS[id].type === 'bedroom' && id !== 'bedroom_player');
  if (flags.structural_study_to_bedroom && !roomIds.includes('study')) roomIds.push('study');
  const occupants = {};
  for (const npc of Object.values(gameState.npcs || {})) {
    const r = npc.residency;
    if (r && r.room && r.status !== 'former') occupants[r.room] = (occupants[r.room] || 0) + 1;
  }
  for (const roomId of roomIds) {
    const defId = (ROOM_FACILITIES[roomId] || [])[0];
    const def = defId && FACILITY_DEFS[defId];
    const tier = upgrades[defId]?.tier;
    const t = def && def.tiers && tier && def.tiers.find(x => x.tier === tier);
    const capacity = (t && t.residentCapacity) || 1;
    if ((occupants[roomId] || 0) < capacity) return roomId;
  }
  return null;
}

function snapshotSandboxDayFields(gameState) {
// D19 (Seasonal Calendar & Sandbox plan): the day-shaped fields that must be
// byte-identical to a fresh SIM_generateHouse. Sandbox is always day 1 — the
// advanced thing is the house, never the calendar, and no absolute day field is
// ever rebased. Returns a map of path → value so applySandboxPreset's guard can
// diff the state before against the state after. The set of these paths is OPEN by
// design (any future system that stamps a day joins it silently), which is exactly
// why the guard records whatever these fields hold at entry rather than only checking a
// hand-written list — see the D19 block in applySandboxPreset.
  const gs = gameState;
  const snap = {};
  if (gs && gs.player && gs.player.rentDueDay != null) snap['player.rentDueDay'] = gs.player.rentDueDay;
  if (gs && gs.world && gs.world.bills) {
    for (const id of Object.keys(gs.world.bills)) {
      const b = gs.world.bills[id];
      if (b && b.dueDay != null) snap['world.bills.' + id + '.dueDay'] = b.dueDay;
    }
  }
  if (gs && gs.world && gs.world.taxes && gs.world.taxes.lastQuarterBilled != null) snap['world.taxes.lastQuarterBilled'] = gs.world.taxes.lastQuarterBilled;
  if (gs && gs.world && gs.world.computer && gs.world.computer.apps && gs.world.computer.apps.gigs && gs.world.computer.apps.gigs.lastRefreshDay != null) snap['gigs.lastRefreshDay'] = gs.world.computer.apps.gigs.lastRefreshDay;
  return snap;
}

function applySandboxPreset(gameState, cfg) {
  cfg = cfg || {};
  const house = cfg.house || {};
  const upgrades = gameState.world.upgrades || (gameState.world.upgrades = initUpgradesState());

  // D19 (assert, don't rebase): capture the day-shaped fields exactly as
  // SIM_generateHouse produced them, before any sandbox side-effect runs.
  // applySandboxPreset runs immediately after generation, so these ARE the fresh
  // factory values. The guard at the end throws if any has moved.
  const dayGuard = snapshotSandboxDayFields(gameState);

  // 1. house.structural → world.flags.structural_<id>
  const structural = house.structural || {};
  gameState.world.flags = gameState.world.flags || {};
  for (const [id, on] of Object.entries(structural)) {
    if (STRUCTURAL_UPGRADES[id] && on) gameState.world.flags[`structural_${id}`] = 1;
    else delete gameState.world.flags[`structural_${id}`];
  }

  // 2. rebuild the live graph (D18) — MUST precede the residency step.
  applyStructuralUpgrades(gameState);

  // 3. house.preset/facilities → world.upgrades[id] = { tier, condition }
  const preset = SANDBOX_HOUSE_PRESETS[house.preset];
  const customFacilities = house.facilities || {};
  for (const def of FACILITY_LIST) {
    if (preset && !preset.useStartingTiers) {
      const s = preset.condition !== undefined ? { tier: preset.tier, condition: preset.condition } : { tier: preset.tier };
      upgrades[def.id] = { ...upgrades[def.id], ...s };
    }
    if (customFacilities[def.id]) upgrades[def.id] = { ...upgrades[def.id], ...customFacilities[def.id] };
  }

  // 4. applyFacilityCompletionStates for every facility (D18) — the pool's
  // completionStates (water filled/clear) are what separate a renovated pool from
  // one that merely has the tier labels stamped on.
  for (const def of FACILITY_LIST) applyFacilityCompletionStates(gameState, def.id);

  // 5. roommate residency → the shared moveToRoom pass (D16). cfg.roommates is
  // index-aligned with the cast slots (SIM_generateHouse's partials array), so
  // gameState.npcIds[i] is the i-th roommate. moveToRoom assigns bed from the
  // live occupancy of the target room, so the generated cast's starting
  // room/bed claims must be cleared first — otherwise not-yet-moved roommates
  // still count as occupants and the 'A'/'B' slot logic collides.
  const roommates = cfg.roommates || [];
  for (const id of gameState.npcIds || []) {
    const n = gameState.npcs && gameState.npcs[id];
    if (n && n.residency) { n.residency = { ...n.residency, room: null, bed: null }; n.location = null; }
  }
  for (let i = 0; i < roommates.length; i++) {
    const r = roommates[i];
    if (!r?.residency || !r.residency.room) continue;
    const npcId = gameState.npcIds?.[i];
    const npc = npcId ? gameState.npcs?.[npcId] : null;
    if (!npc) continue;
    gameState.npcs[npcId] = moveToRoom(npcId, npc, r.residency.room, gameState.npcs, r.residency.bed ?? null);
  }
  // 5b. roomless roommates → first free bed. The B5 config screen lets a
  // roommate be added with no room at all; without this such a roommate
  // would stay homeless (empty residency.room/location) for the whole run.
  // firstFreeBedroom walks the same bedroom set the config screen offers,
  // skipping any room already at its tier's residentCapacity.
  for (let i = 0; i < roommates.length; i++) {
    const r = roommates[i];
    if (!r?.residency || r.residency.room) continue;
    const npcId = gameState.npcIds?.[i];
    const npc = npcId ? gameState.npcs?.[npcId] : null;
    if (!npc) continue;
    const room = firstFreeBedroom(gameState);
    if (room) gameState.npcs[npcId] = moveToRoom(npcId, npc, room, gameState.npcs, null);
  }

  // 6. economy.money / taxReserve → player.money, world.taxes.reserve
  const economy = cfg.economy || {};
  if (economy.money !== undefined) gameState.player.money = economy.money;
  if (gameState.world.taxes && economy.taxReserve !== undefined) gameState.world.taxes.reserve = economy.taxReserve;

  // 7. flags.suppressTutorial → world.flags.tutorial_* + contractor milestones (D20).
  // A suppressTutorial sandbox (default on) starts at apartment quality >= the
  // milestone threshold, so without pre-firing the one-shot flags the tutorial
  // beats would fire the moment quality is checked on day 1 — a tutorial that
  // makes no sense for a house the player just restored. Del himself still exists
  // as an NPC; only the tutorial *beats* are suppressed. Milestone ids are
  // derived from the ONE table that owns them (CONTRACTOR_TUTORIAL_MILESTONES
  // keys — the same table fireContractorMilestone reads), not an enumerated list
  // here, so a future milestone is covered automatically; the one non-milestone
  // one-shot guard read (world.flags.tutorial_qualityThreshold, in ui.js's
  // maybeFireContractorQualityMilestone) is itself a milestone id and is covered.
  if (cfg.flags && cfg.flags.suppressTutorial) {
    for (const id of Object.keys(CONTRACTOR_TUTORIAL_MILESTONES)) {
      gameState.world.flags['tutorial_' + id] = true;
    }
  }

  // D19 guard — assert, don't rebase. Sandbox is always day 1; no absolute
  // day field may ever be rewritten (player.rentDueDay, world.bills[id].dueDay,
  // world.taxes.lastQuarterBilled, gigs.lastRefreshDay). If a day-shaped field
  // has moved off the fresh-factory values captured at the top, a sandbox
  // convenience rebased a day stamp and the game would open on a wall of overdue
  // bills — throw loudly rather than let the erosion be silent. There is NO step 8.
  // SIM_generateHouse returns the clock at top-level gameState.clock (it only
  // becomes meta.clock at write/load — see writeGeneratedGameState), so read it
  // there, with meta as a fallback. The value is the same; only its home moves.
  const startDay = (gameState && gameState.clock && gameState.clock.day != null) ? gameState.clock.day : (gameState && gameState.meta && gameState.meta.clock ? gameState.meta.clock.day : undefined);
  if (startDay !== 1) {
    throw new Error('D19: sandbox must start on day 1 (day=' + startDay + '). No absolute day field may be rebased — see the Seasonal Calendar & Sandbox plan D19.');
  }
  for (const [path, v] of Object.entries(snapshotSandboxDayFields(gameState))) {
    if (v !== dayGuard[path]) {
      throw new Error('D19: applySandboxPreset rebased ' + path + ' (' + dayGuard[path] + ' → ' + v + ') — no absolute day field may be written. See the Seasonal Calendar & Sandbox plan D19.');
    }
  }
  return gameState;
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
// The intimate group, guaranteed. rollCastSlot attaches it to every bible it
// generates, but a generated cast is not the only way an NPC gets made:
// CONTRACTOR_BIBLE is hand-authored in config, createExternalNpc builds one
// from a stub, escorts come from a roster, and importCharacter takes one from
// a file. Every one of those paths funnels through createNpcFromBible, so
// this is where "every character has a body" becomes true rather than at four
// call sites that each have to remember.
//
// Seeded from the bible's OWN genSeed, so the same character always gets the
// same body — and idempotent, so a bible that already carries one (the
// generated case, and any save already migrated) passes through untouched.
function ensureIntimate(bible) {
  if (!bible || typeof bible !== 'object') return bible;
  const physical = bible.physical;
  if (!physical || typeof physical !== 'object') return bible;
  if (physical.intimate && Array.isArray(physical.intimate.genitals)) return bible;
  const rng = seededRng(bible.genSeed || 0, 'intimate_ensure');
  return { ...bible, physical: { ...physical, intimate: generateIntimate(rng, bible.gender) } };
}

function createNpcFromBible(bible, residencyStatus) {
  const npc = {
    bible: ensureIntimate(bible),
    bibleRevision: 0,
    bibleChanges: [],
    residency: {
      status: residencyStatus || 'resident',
      room: null,
      bed: null,
      partnerOf: null,
      since: 1,
      contributesRent: residencyStatus === 'resident' || residencyStatus === undefined,
      // Phase 8 (vocation plan): not pre-populated with the flat default anymore.
      // null = "derive from income" in computeRent's negotiatedOrDerived. A
      // negotiated value (the future agreement system) is written here explicitly.
      rentShare: null,
    },
    location: null,
    activity: '',
    mood: 0,
    moodReason: '',                                   // NPC Overhaul
    schedule: { currentBlock: '', nextBlock: '', willReturnAt: null }, // NPC Overhaul
    needs: { hunger: 50, hygiene: 50, energy: 50, social: 50, comfort: 50, stimulation: 50, desire: DESIRE.npc.start }, // NPC Overhaul: +comfort, +stimulation; Intimacy & Voyeurism Phase 8: +desire
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
      openQuestions: [],                               // knowledge-gossip Phase 3 (D9)
      nextFactId: 1,                                   // knowledge-gossip Phase 3 (D9) — stable factId counter
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
