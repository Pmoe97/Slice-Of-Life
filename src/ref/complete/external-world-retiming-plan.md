# External-world retiming: visits, restaurants, delivery, gigs

Status: **built** — all 4 phases (visit spine, restaurant hours, delivery
ETAs/slots, gig work blocks) complete and verified. Design session complete
2026-08-14; all decisions locked. Last updated 2026-08-14.

Companions:
- `CONTINUOUS-SIMULATION-ROADMAP.md` (the umbrella — implements C1).
- `continuous-behavior-engine-plan.md` (the plan this one's timing
  ultimately has to interoperate with — a scheduled contractor visit needs
  to compete for the same room an NPC's continuous behavior might want,
  but that reconciliation is that plan's concern, not this one's; this
  plan only changes what unit a window is expressed in).
- `src/ref/complete/external-world-npcs-overhaul-plan.md` (built the visit
  spine this plan retimes — read for the *why* of `world.visits`, which
  this plan does not re-argue).
- `src/ref/complete/restaurant-network-expansion-plan.md` (built the
  wrap-aware `hours` this plan retimes).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else.**

---

## Handoff — read this first

**Resume at:** nothing — this document is complete (all 4 phases built,
verified, shipped). Next row of the shared checklist is row 17:
`npc-initiative-retiming-plan.md` Phase 1 (config field conversion).

**Last session's notes (2026-08-14 — Phase 4 built and verified):**
- Phase 4 (D5) — gig work blocks' one time-cost literal: `doGigWorkBlock`
  (ui.computer.js:122) now calls
  `await advanceAndResolveMinutes(GIG_TUNING.workBlockMinutes)` instead of
  `CLOCK.tickMinutes`. The new constant is `const GIG_TUNING = {
  workBlockMinutes: 30 }` in `src/srcfiles/defs.computer.js`, next to
  `GIG_ENERGY_PER_BLOCK` — the plan's Files entry said `config.js`, but the
  plan's own implementation-time fallback ("confirm by grep for `GIG_REP_`")
  lands in defs.computer.js, where every `GIG_*` constant already lives.
  `CLOCK.tickMinutes` stays 30 (config.js:2143), so the swap is provably
  behavior-neutral; the point is that a gig block's cost no longer reads
  the tick grid as if it carried scheduling meaning (C1/D5).
- Verification (translation rule — the Node `dev/verify` suite is
  unavailable here; no `dev/verify/*.js` harness references
  doGigWorkBlock/GIG_TUNING, grep-verified): all `browser_eval` against the
  live engine, final `browser_refresh` clean (no syntaxErrors /
  perchanceErrors / console errors).
  - Live probe after reload: `GIG_TUNING.workBlockMinutes === 30 ===
    CLOCK.tickMinutes` (strict equality).
  - Full behavioral run on a fresh deterministic house
    (`SIM_generateHouse('gigtest_phase4b', 3, [])` with `meta` synthesized
    as `{ clock: cast.clock, seed: cast.seed }` — see gotcha below), board
    generated, one gig accepted, then the REAL `doGigWorkBlock(gigId,
    'computer')` with `window.addLogEntry` wrapped to capture the narration
    and `window.saveAtBoundary` no-op'd (both are `function` declarations
    → window properties, so a wrap shadows them for the whole call chain).
    Result: `deltaAbs === 30` (clock 08:00 → 08:30, day 1 unchanged),
    `blocksDone` 0 → 0.6, narration byte-identical to the pre-change
    format — `You work on "Data Entry Batch". Progress: 9% (0.60/7
    blocks).` with `Math.round((blocksDone/blocks)*100)` (asserted
    `narrationMatches: true` against the expected string).
- **Surprises / gotchas:**
  - First behavioral run read the clock off the passed-in state object and
    saw delta 0: `advanceAndResolve` (ui.js:44) reassigns the global
    `currentGameState` to the fresh `resolveBatch` copy, so any reference
    captured before the call goes stale. The game reads the global; so must
    a test. Re-measured via `currentGameState` → exact 30. This is the
    game's normal copy-on-write, not a defect from the swap.
  - `SIM_generateHouse` returns `clock` at top level, not `meta.clock` (the
    real game's `meta` is written by `writeGeneratedGameState` and reloaded
    by `loadGameState`); synthesize `meta` before calling anything that
    reads `meta.clock` — the same gotcha decor-economy Phase 3 recorded.

**Blockers / flagged deviations:** None.

---

## The thesis

Four systems currently express "when" as a tick index in 0–47 space,
independent of the behavior-engine's own retiming, because they don't
describe an NPC's activity at all — they describe the outside world's
schedule (a contractor's onsite hours, a restaurant's open window, a food
courier's arrival slot, a gig's deadline). None of them need to become
"continuous" in the behavior-engine sense — a restaurant doesn't make
moment-to-moment decisions, it's open or it isn't. What they need is to
stop being expressed in a unit (`0..47`) that only means something next to
a `CLOCK.tickMinutes` constant this project's other plans are retiring as
a decision boundary. `clockToAbsolute` (time.js:126) already gives every
one of them a strictly better address space — continuous, comparable
across days without special-casing midnight, and already used by the
discrete action path. This plan is that conversion, system by system.

### What this plan is *not*

- **Not a behavior change.** A contractor who was onsite 09:00–16:30 stays
  onsite 09:00–16:30. Nothing about *when* anything happens changes —
  only the representation.
- **Not a rewrite of the visit spine's purpose-derived activity strings**,
  the food-order tip/travel-time model, or gig deadline *consequences*
  (strikes, firing). Untouched.
- **Not touching day rollover, rent, or bill cadences.** Confirmed
  day-indexed, not tick-indexed, and explicitly out of scope — see
  Evidence.

## Evidence

Grep-verified tick-indexed fields, this session:

| System | Field(s) | File:line |
|---|---|---|
| Visit spine | `startTick`, `endTick` | sim.js:421 (`getActiveVisits`), sim.js:457 (`scheduleVisit`), sim.js:467–468 |
| Friend visits | `startTick`/`endTick` roll | sim.js:638–652 (`FRIEND_TUNING.startTickMin/Max`) |
| Restaurant hours | `hours: [open, close]` (wrap-aware) | defs.computer.js:489 (e.g. `sunrise_cafe`), computer.js:2541 (`isRestaurantOpen`) |
| Food delivery | `arrivalTick`, `driverWindowTicks`, `maxScheduleAheadTicks` | config.js:1279/1282 (`FOOD_TUNING`), computer.js:2711–2764 |
| Gig work blocks | flat `CLOCK.tickMinutes` time-cost only — **not** a scheduling window (see D5) | `doGigWorkBlock` → `advanceAndResolveMinutes(CLOCK.tickMinutes)` (ui.computer.js:130); `deadlineDay`/`generateGigsForDay` are already `day`-indexed, never tick-indexed (computer.js:450–490, 520, 549, 602) |

Confirmed **out of scope**, not touched by this plan: day rollover
(`clockFrame` detects `clock.day` changing directly, time.js — no tick
dependency at all); rent (`ECONOMY.payPeriodDays`, day-indexed); bills
(cadence-in-days); the tracker (obligations keyed to `day`, not `tick`).

---

## Locked decisions

- **D1 — Every window becomes an absolute-minute pair,
  `[startAbs, endAbs)`**, computed once via `clockToAbsolute` at the
  moment the window is scheduled (booking a job, rolling a friend visit,
  placing a food order) rather than re-derived from `day`+`tick` on every
  read.
- **D2 — Restaurant hours convert to a *recurring* absolute-minute rule,
  not a one-shot window.** Unlike a visit (happens once, on one day), a
  restaurant's hours repeat every day. `isRestaurantOpen`'s check becomes
  "does `clock.minutes` (the intra-day component, day-independent) fall
  in this window," preserving exactly today's semantics — `hours` stays a
  `[openMinute, closeMinute)` pair in minutes-from-midnight (equivalent to
  today's tick pair × 30), wrap-aware exactly as today, just expressed in
  minutes instead of ticks. This is *not* the same conversion as D1 — a
  restaurant's hours are not day-scoped and must not become one.
- **D3 — Delivery/gig timing converts to absolute minutes the same way
  D1's one-shot windows do** — an order placed now has a real arrival
  absolute-minute, not a tick-of-day plus an implicit "today or tomorrow"
  inference.
- **D4 — `CLOCK.ticksPerDay`/`getTickIndex` stay defined** (C1, the
  umbrella) for exactly the day-scoping arithmetic D1 still needs
  (`clockToAbsolute` itself is built from `day*1440+minutes`, not from
  ticks — but wherever this plan's own code still needs "which day is
  this," it uses `clock.day` directly, never a tick count standing in for
  it).
- **D5 — Gig work blocks are not a scheduling window and D1–D3 don't
  apply to them.** This session's Phase-4 confirmation pass (the one the
  original Handoff flagged as needed) found `generateGigsForDay`/
  `processGigDeadlinesForDay`/`deliverGig` are already entirely
  `day`-indexed (`deadlineDay: day + effDeadline`, compared against
  `gameState.meta.clock.day` directly — computer.js:450–490, 520, 549,
  602) — no tick-range field exists anywhere in the gig system. The only
  tick-shaped thing is `doGigWorkBlock`'s `advanceAndResolveMinutes(
  CLOCK.tickMinutes)` (ui.computer.js:130), which is a flat **time-cost**
  for one click of work — structurally identical to `self.cook`'s
  `timeCost: {base: 2, ...}`, not a `[startAbs,endAbs)` window. Phase 4 is
  narrowed accordingly: it converts that one literal multiplier, nothing
  else, and does not need D1/D2/D3's window machinery at all.
- **D6 — Visit records collapse `day`+`tick` into one absolute-minute
  window; day-scoping is derived, never stored.** This resolves the
  Handoff's first decision (and the Open questions entry below), confirmed
  against `getActiveVisits`'s actual call sites. Every consumer either
  asks the active-window question — which the monotonic abs comparison
  subsumes, because a window scheduled for another day cannot contain
  `clockToAbsolute(now)`, so the old `v.day === day` check is redundant —
  or needs the visit's DAY for bookkeeping (scheduleVisit idempotency per
  source+day, `countVisitorsForDay`'s soft cap, `processVisitsForDay`
  retirement/retention, `doInviteOver`/AfterHours "already coming that
  day" checks), which is derived once via `visitDay(v)` =
  `Math.floor(v.startAbs / 1440)`. No consumer needs a stored day. Old
  saves store `day`; `visitDay` falls back to it so those records still
  retire/sweep on the same cadence (migration waived per the roadmap) —
  and stay inactive in `getActiveVisits` (accepted degradation, see
  Handoff).

---

## Data model

```js
// Visit spine (sim.js), converted
{ npcId, startAbs, endAbs, purpose, ... }   // was { day, startTick, endTick, ... }
```

```js
// Restaurant hours (defs.computer.js), converted — a RECURRING daily rule
hours: [420, 840]   // was [14, 28] in ticks; wrap-aware exactly as today
                     // (openMinute > closeMinute ⇒ crosses midnight)
```

```js
// Food delivery (computer.js), converted
{ arrivalAbs, driverWindowMinutes, maxScheduleAheadMinutes, ... }
```

---

## Implementation phases

### Phase 1 — Visit spine
**Goal:** `world.visits` records carry `startAbs`/`endAbs`; `getActiveVisits`
compares `clockToAbsolute(clock)` against them directly, no `day`+`tick`
pair.
**Files:** `src/srcfiles/sim.js` (`getActiveVisits`, `scheduleVisit`, the
friend-visit roll).
**Verification:** every existing scenario the visit spine's own original
plan verified (contractor windows, friend visits, food-order handovers)
re-run against the harness with identical wall-clock outcomes — the
conversion must be behavior-invisible.

### Phase 2 — Restaurant hours (D2's recurring-rule distinction)
**Goal:** `isRestaurantOpen` and `formatRestaurantHours` operate on
minute-pairs; the wrap case (`open > close`) is preserved exactly.
**Files:** `src/srcfiles/defs.computer.js` (`RESTAURANT_DEFS.hours` for
all twelve restaurants), `src/srcfiles/computer.js` (`isRestaurantOpen`,
`formatRestaurantHours`, `countRestaurantsOpenAt`).
**Verification:** `countRestaurantsOpenAt`'s existing dev-only coverage
check (computer.js:2564, "≥2 open across all ticks") re-run across all
1440 minutes of a day instead of 48 ticks, same invariant, finer grain.

### Phase 3 — Delivery ETAs and scheduling slots
**Goal:** `FOOD_TUNING`'s tick-based fields convert; order placement,
arrival, and the schedule-ahead bound all operate in absolute minutes.
**Files:** `src/srcfiles/config.js` (`FOOD_TUNING`), `src/srcfiles/computer.js`
(the order-placement and arrival-computation functions cited in Evidence),
`src/srcfiles/render.computer.js` (display formatting).
**Verification:** an order placed at an arbitrary minute (not just a tick
boundary) produces a correctly bounded, correctly formatted arrival — the
finer grain is the actual point of this phase, so the verification
deliberately tests off-tick-boundary placement times.

### Phase 4 — Gig work blocks
**Goal:** per D5, this is now a small, fully-scoped phase, not an open
one. `doGigWorkBlock`'s `advanceAndResolveMinutes(CLOCK.tickMinutes)`
stops reading `CLOCK.tickMinutes` as if it carried scheduling meaning —
replace it with an explicit literal (`GIG_TUNING.workBlockMinutes: 30`,
new config field, same effective value) so a future change to
`CLOCK.tickMinutes` (or its retirement entirely once the tick grid is
gone per C1) can't silently change how long a gig work session takes.
No window/absolute-minute conversion applies here — `deadlineDay` stays
exactly as it is today (D5), correctly out of this phase's scope.
**Files:** `src/srcfiles/config.js` (new `GIG_TUNING.workBlockMinutes`,
or fold into an existing gig tuning block if one exists — confirm by
grep for `GIG_REP_` at implementation time, since that's this file's
existing gig-tuning neighborhood); `src/srcfiles/ui.computer.js`
(`doGigWorkBlock`'s call site, ui.computer.js:130).
**Verification:** working one gig block still advances the clock by
exactly 30 minutes and reports the same progress-percentage narration as
before (`Math.round((blocksDone/blocks)*100)`) — a byte-identical
before/after comparison, since this phase is a pure literal-vs-constant
swap with zero intended behavior change.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | Visit spine → absolute-minute windows (`[startAbs, endAbs)`, `visitDay` day-scoping, all six schedulers + tuning converted; verified behavior-invisible live) |
| 2 | Done | Restaurant hours → recurring minute-pairs (D2; all twelve `RESTAURANT_DEFS.hours` ×30, wrap preserved, verified across all 1440 minutes) |
| 3 | Done | Delivery ETAs/slots → absolute minutes (`arrivalAbs` on orders, no tick-ceiling, old-shape fallback via `foodOrderArrivalAbs`) |
| 4 | Done | Gig work blocks' one time-cost literal detached from `CLOCK.tickMinutes` (`GIG_TUNING.workBlockMinutes: 30` in defs.computer.js, D5) |

---

## Dependency order

```
Phase 1 (visits) ─┐
Phase 2 (restaurants) ─┤  independent of each other — different files, different data
Phase 3 (delivery) ─┤
Phase 4 (gigs) ─────┘
```
All four are independent of each other and may proceed in any order, or
in parallel across sessions. All four only require
`continuous-behavior-engine-plan.md`'s Phase 1 to have landed (so
`clockToAbsolute`-space is established as the project's shared time
address, not because this plan's code calls into that plan's).

---

## Open questions (parked, none blocking)

- ~~**Does `getActiveVisits` collapse `day`+`tick` into one absolute number,
  or keep day-scoping with only the intra-day pair converted?**~~ —
  **resolved in Phase 1, see D6.** No longer open.
- ~~Gig work blocks' exact current mechanism~~ — **resolved this session,
  see D5.** No longer open.

---

## Design invariants

1. **A conversion in this plan is behavior-invisible.** If any verification
   step produces a different wall-clock outcome than before, the
   conversion is wrong, not the old behavior.
2. **Recurring rules (restaurant hours) and one-shot windows (visits,
   deliveries) are different shapes and must not be unified into one.**
   D2 exists because that distinction is easy to lose in a mechanical
   pass.
3. **Day rollover, rent, and bills are not this plan's to touch.** Already
   day-indexed, already correct, already out of scope — restated here so
   a future session doesn't "helpfully" convert them too.
