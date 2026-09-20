// ===== SECTION: ASPIRATIONS =====
// aspirations-and-creative-careers-overhaul-plan.md Phase 14 (D46–D49):
// the player's throughline. Up to two DIRECTIONS chosen (at the intro, or
// any time in the Compass app); each direction's MILESTONES are pure
// predicates over game state (defs.works.js's ASPIRATION_DIRECTIONS —
// `pre` says "worth showing yet", `done` says "true now"); the rollover
// pass completes whatever has become true, pays out mood (D48) and makes
// a Notice subject so the room can react — and nothing is ever gated
// behind any of it (D48). No fail states, no expiry, no tracker line (D49).
//
// Reads skills.js (skillLevel), works.js (player.works), platform.js (the
// profile, whoKnowsPlayerHandle), sim.js (getApartmentQuality), notice.js
// (noticeSubject) — all at call time, inside the predicates and the
// rollover, never at load. Every predicate is READ-ONLY: none of them calls
// an ensure* backfill (those write), so `pre`/`done` can be called twice
// against the same state and leave it byte-identical (the harness asserts
// exactly that).
//
// player.aspirations (lazy, the additive-default precedent, D58):
//   { directions: [dirId], completed: { [milestoneId]: day },
//     directionsDone: { [dirId]: day }, lastCheckedDay }

function ensurePlayerAspirations(player) {
  if (!player.aspirations || typeof player.aspirations !== 'object') player.aspirations = { directions: [], completed: {}, directionsDone: {}, lastCheckedDay: 0 };
  const a = player.aspirations;
  if (!Array.isArray(a.directions)) a.directions = [];
  if (!a.completed || typeof a.completed !== 'object') a.completed = {};
  if (!a.directionsDone || typeof a.directionsDone !== 'object') a.directionsDone = {};
  if (typeof a.lastCheckedDay !== 'number') a.lastCheckedDay = 0;
  return a;
}

// Read-only view for the predicates (never backfills).
function aspirationsView(player) {
  const a = player && player.aspirations;
  return { directions: (a && Array.isArray(a.directions)) ? a.directions : [], completed: (a && a.completed) || {}, directionsDone: (a && a.directionsDone) || {} };
}

// D46/D47 — choose up to ASPIRATION_TUNING.maxDirections directions. An
// unknown id is refused; the order given is kept; completed milestones are
// untouched (they are facts about state, not about the choice).
function chooseDirections(gameState, ids) {
  const a = ensurePlayerAspirations(gameState.player);
  const clean = [];
  for (const id of (Array.isArray(ids) ? ids : [])) {
    if (!ASPIRATION_DIRECTIONS[id]) return { ok: false, reason: `No such direction: ${id}.` };
    if (!clean.includes(id)) clean.push(id);
  }
  if (clean.length > ASPIRATION_TUNING.maxDirections) return { ok: false, reason: `Pick at most ${ASPIRATION_TUNING.maxDirections}.` };
  a.directions = clean;
  return { ok: true, directions: [...clean] };
}

// Toggle one direction on/off (the Compass chips): refuses a third.
function toggleDirection(gameState, id) {
  const a = ensurePlayerAspirations(gameState.player);
  if (!ASPIRATION_DIRECTIONS[id]) return { ok: false, reason: 'No such direction.' };
  if (a.directions.includes(id)) { a.directions = a.directions.filter(d => d !== id); return { ok: true, on: false }; }
  if (a.directions.length >= ASPIRATION_TUNING.maxDirections) return { ok: false, reason: `You can follow ${ASPIRATION_TUNING.maxDirections} directions at a time — let one go first.` };
  a.directions.push(id);
  return { ok: true, on: true };
}

// The milestone templates of one direction, in authored order. PURE.
function directionMilestones(dirId) {
  const dir = ASPIRATION_DIRECTIONS[dirId];
  return dir ? dir.milestones : [];
}

// D46/D49 — the live milestones of a direction: not yet completed, `pre`
// met, in authored order, at most livePerDirection. PURE (read-only).
function liveMilestonesFor(gameState, dirId) {
  const view = aspirationsView(gameState.player);
  const out = [];
  for (const m of directionMilestones(dirId)) {
    if (view.completed[m.id]) continue;
    let pre = false;
    try { pre = !!m.pre(gameState); } catch (e) { pre = false; }
    if (!pre) continue;
    out.push({ dirId, id: m.id, label: m.label, hint: m.hint || '' });
    if (out.length >= ASPIRATION_TUNING.livePerDirection) break;
  }
  return out;
}

// Every chosen direction's live milestones, keyed by direction. PURE.
function liveMilestones(gameState) {
  const view = aspirationsView(gameState.player);
  const out = {};
  for (const dirId of view.directions) out[dirId] = liveMilestonesFor(gameState, dirId);
  return out;
}

// Progress of a direction: completed / total. PURE.
function directionProgress(gameState, dirId) {
  const view = aspirationsView(gameState.player);
  const all = directionMilestones(dirId);
  const done = all.filter(m => view.completed[m.id]).length;
  return { done, total: all.length, exhausted: all.length > 0 && done === all.length };
}

// D48 — the rollover pass: for each CHOSEN direction, every uncompleted
// milestone whose `done` is true completes exactly once (recorded by day),
// pushes MOOD_PAYOUTS.aspirationMilestone and makes an `aspiration`
// Notice subject in the player's room; a direction whose pool is
// exhausted pays aspirationDirection once. Idempotent per day. Returns
// { completed: [{ dirId, id, label, noticed }], directionsDone: [dirId] }.
function checkAspirations(gameState, day) {
  const a = ensurePlayerAspirations(gameState.player);
  const result = { completed: [], directionsDone: [] };
  if (a.lastCheckedDay === day) return result;
  a.lastCheckedDay = day;
  for (const dirId of a.directions) {
    for (const m of directionMilestones(dirId)) {
      if (a.completed[m.id]) continue;
      let done = false;
      try { done = !!m.done(gameState); } catch (e) { done = false; }
      if (!done) continue;
      a.completed[m.id] = day;
      if (typeof pushMoodImpulse === 'function') pushMoodImpulse(gameState.player, MOOD_PAYOUTS.aspirationMilestone, day);
      let noticed = null;
      if (typeof noticeSubject === 'function') {
        noticed = noticeSubject(gameState, { kind: 'aspiration', ref: m.id, roomId: gameState.player.location, day, quality: 0.7, category: 'social', meta: { label: 'milestone', title: m.label, direction: dirId } });
      }
      result.completed.push({ dirId, id: m.id, label: m.label, noticed });
    }
    const p = directionProgress(gameState, dirId);
    if (p.exhausted && !a.directionsDone[dirId]) {
      a.directionsDone[dirId] = day;
      if (typeof pushMoodImpulse === 'function') pushMoodImpulse(gameState.player, MOOD_PAYOUTS.aspirationDirection, day);
      result.directionsDone.push(dirId);
    }
  }
  return result;
}

// --- Independence (Phase 15, D50 — the mechanical form of D1) ------------------

// The solo cost of `days` days: rent at ECONOMY.rent.total (the lease, no
// roommate offsets — never computeRent's playerShare), the even-split
// utilities at their base as if one resident, the personal bills, and the
// groceries baseline. PURE.
function independenceCost(gameState, days) {
  const I = ECONOMY.independence;
  const weeks = days / ECONOMY.payPeriodDays;
  const rent = ECONOMY.rent.total * weeks;
  let bills = 0;
  for (const def of Object.values(BILL_DEFS)) {
    if (def.split === 'lease') continue;
    const perCycle = def.split === 'personal' ? def.amount : (typeof UTILITY_BASE !== 'undefined' && UTILITY_BASE[def.id] != null ? UTILITY_BASE[def.id] : def.amount);
    bills += perCycle * (days / def.cadenceDays);
  }
  const groceries = I.groceriesWeekly * weeks;
  return { rent: Math.round(rent), bills: Math.round(bills), groceries: Math.round(groceries), total: Math.round(rent + bills + groceries) };
}

// Independent income in the `days` ending at `day` (inclusive): the
// ledger entries whose reason is one of ECONOMY.independence.incomeReasons.
// PURE (a missing ledger is zero income).
function independenceIncome(gameState, day, days) {
  const I = ECONOMY.independence;
  const log = Array.isArray(gameState.player?.incomeLog) ? gameState.player.incomeLog : [];
  const from = day - days + 1;
  const byReason = {};
  let total = 0;
  for (const e of log) {
    if (!e || e.day < from || e.day > day || !I.incomeReasons.includes(e.reason)) continue;
    total += e.amount; byReason[e.reason] = (byReason[e.reason] || 0) + e.amount;
  }
  return { total: Math.round(total), byReason };
}

// D50 — the index: over the rolling window, income ÷ solo cost. Qualifies
// at ≥ 1. PURE.
function independenceIndex(gameState, day) {
  const I = ECONOMY.independence;
  const days = I.windowWeeks * ECONOMY.payPeriodDays;
  const d = day ?? gameState.meta?.clock?.day ?? 0;
  const income = independenceIncome(gameState, d, days);
  const cost = independenceCost(gameState, days);
  const ratio = cost.total > 0 ? income.total / cost.total : 0;
  return { day: d, windowDays: days, income: income.total, byReason: income.byReason, cost: cost.total, costBreakdown: cost, ratio: Math.round(ratio * 1000) / 1000, qualifies: income.total >= cost.total };
}

// The weekly count: at rollover on the rent cadence (player.independenceNextDay,
// lazily from rentDueDay), a qualifying window adds a week, a failing one
// resets to zero (D50: consecutive). Prunes the ledger past ledgerDays.
// Returns null between cadence days, else { index, weeks, reset }.
function processIndependenceForDay(gameState, day) {
  const player = gameState.player;
  const I = ECONOMY.independence;
  if (Array.isArray(player.incomeLog)) player.incomeLog = player.incomeLog.filter(e => e && day - e.day <= I.ledgerDays);
  if (typeof player.independenceWeeks !== 'number') player.independenceWeeks = 0;
  if (player.independenceNextDay == null) player.independenceNextDay = player.rentDueDay || (day + ECONOMY.payPeriodDays);
  if (day < player.independenceNextDay) return null;
  player.independenceNextDay += ECONOMY.payPeriodDays;
  const index = independenceIndex(gameState, day - 1);
  const before = player.independenceWeeks;
  if (index.qualifies) player.independenceWeeks = before + 1;
  else player.independenceWeeks = 0;
  return { index, weeks: player.independenceWeeks, reset: before > 0 && !index.qualifies };
}

// ===== /SECTION: ASPIRATIONS =====
