# Game Clock & Time System — Reference

Comprehensive map of how game time works in this generator: the clock data
model, the two time paths (continuous dilation loop + discrete action
advances), every rate and every discrete cost, and — critically — every
place still hard-coded to the 30-minute tick. Written as the baseline for
any future plan to make time feel more granular ("anything can happen at
any time").

All file:line references are as of this writing; line numbers drift.

---

## 1. The clock data model

- `meta.clock = { day, weekday, minutes, phase }` (SIM `buildGameState`).
- `minutes` is a **continuous float** 0–1440 from midnight; the display
  floors it to whole minutes (`formatTime`, SIM). The clock itself is
  already sub-minute precise.
- Day 0 starts at **08:00** (`CLOCK.startMinutes: 8*60`).
- `phase` is derived from minute thresholds
  (`CLOCK.phaseThresholds`: early_morning 05:00, morning 07:00, midday
  12:00, afternoon 15:00, evening 18:00, night 22:00).
- Time arithmetic is done in an absolute space `day*1440 + minutes`
  (`clockToAbsolute` / `absoluteToClock`, TIME) so discrete actions land
  on exact minutes, not rounded ticks.
- The 30-minute granularity is a **separate coupling**, not part of the
  clock: `CLOCK.tickMinutes: 30`, `CLOCK.ticksPerDay: 48`, and
  `getTickIndex(minutes) = floor(minutes/30)` used across the sim.

## 1a. The calendar (seasonal-calendar-and-sandbox-plan)

The calendar is **derived from the day counter** — nothing about it is
persisted, so old saves load and start printing a different date string with
no migration. `CALENDAR` (CONFIG) defines the four 35-day seasons, five
7-day weeks each, **140 days to the year** (`daysPerSeason: 35`,
`daysPerYear: 140`, `daysPerTaxPeriod: 70`, `seasons`,
`seasonNames`). The season period (35) and the tax period (70 — two
seasons, billing at the end of Summer and end of Winter) are deliberately
separate constants. Months no longer exist; the old month fields were
deleted and `formatDate` was their only reader.

Weekday base (SIM, D2): `getWeekday(day) = (day + 5) % 7`, so
**day 1 is a Sunday** and, because 35 % 7 === 0, every season and every
year begins on a Sunday forever. `WEEKDAY_NAMES` stays Monday-first and
is not reordered — reordering would silently move every persisted maid
contract's `schedule[].weekday` (a raw 0-6 index) by one day.

Date rendering (SIM): `formatDate(day)` → `"Sunday, 1st of Spring,
Year 1"` (weekday, `dom` with `ordinalSuffix`, `of Season`, `Year N`);
`formatDateShort(day)` → `"Sun 12 Autumn"`, used only by the two
space-constrained surfaces — the HUD `hdr-day` readout (RENDER and TIME
both write it) and the phone lock screen (RENDER.PHONE). The calendar
helpers are pure functions of `day`: `getWeekday`, `isWeekend`,
`getSeasonIndex`/`isSeasonEnd`, `getSeason`, `getYear`,
`getTaxPeriod`/`getTaxPeriodDay`/`isTaxPeriodEnd`.

Tax cadence: taxes bill at the end of each 70-day tax period (days 70 and
140 in year 1) via `processQuarterlyTaxes` / `processTaxesForDayUi`. The
tax panel (RENDER.COMPUTER `renderTaxPanel`) labels the period by the
season it ends in — "Summer period" / "Winter period" — and its progress
bar reads `CALENDAR.daysPerTaxPeriod`. The tracker's `trackerTaxes`
detail strings and the ui.js tax log lines say "period", not "quarter".



## 2. The two time paths

Everything that advances time funnels through exactly one of these. Both
funnel day rollovers through `markDayRolledOver`/`hasDayRolledOver`
(TIME) so midnight is never processed twice.

### A. Continuous dilation loop (TIME `clockFrame`)
- A rAF loop adds `gameMinutes = (realDeltaMs/1000) * (scale/60)` per
  frame. So the scale is a **multiplier over real time** (20 = 20
  game-seconds per real-second), converted to game-minutes by the `/60`.
- The scale comes from a context **stack** (`getTimeContext`): the base is
  derived from durable state (`computeTimeContext` — `browsing` if the
  computer is powered on, else `idle`), and transient surfaces
  push/pop on top (conversation, working, sleeping, masturbating).
  An overlay opened mid-conversation restores the conversation scale, not
  last-writer-wins.
- Freezes entirely while the tab is hidden (`freezeWhenHidden`).
- Caps accumulation at 60s of real time per frame (a lagged rAF can't
  cause huge time jumps).
- Every **30 accumulated game-minutes** (`simCheckpointMinutes`) it fires a
  **sim checkpoint**: runs the NPC simulation for `round(minutes/30)`
  ticks with `advanceClock: false` (the loop already moved the clock) and
  decays the player's needs by `minutes/30` ticks. So the clock display
  flows continuously, but **NPCs are simulated in 30-minute quanta**.
- Day rollover on this path is detected by the loop itself (clock.day
  changing) and routed through `fireDayRollover`.

### B. Discrete action path (TIME `advanceAndResolveMinutes`)
- Pauses the continuous loop, advances by an **exact** number of
  game-minutes, runs `resolveBatch` for each 30-minute boundary the span
  crosses (ticks = `floor(target/30) - floor(start/30)` — a 15-min action
  from 10:20 crosses 10:30 → 1 tick; from 10:00 → 0), then settles the
  clock on the exact target and decays player needs by `minutes/30` ticks.
- So the clock is minute-exact, but the sim still resolves per 30-minute
  boundary crossed.

### The tick engine (SIM `resolveBatch` → `resolveTick`)
`resolveBatch` (SIM) loops ticks; per tick it advances the clock 30 min
(via `advanceClock`), runs `resolveTick` (NPC location/activity/schedule-
block routing, need decay/restore, autonomy drives, peep checks), and
applies NPC updates. Then `advanceAndResolve` (UI) layers on: phone
battery advance, memory decay, food-order handover check
(`processFoodOrdersNow`), need consequences, and day-rollover processing.

## 3. Dilation rates — verified empirically (live measurement)

`gameMinutesPerRealSecond = scale / 60`. The live page was measured at
idle: 3.006 real seconds → 1.000 game-minute (0.3326 gm/sec ≈ 20
game-sec/sec).

| Context | Config value | Game-sec / real-sec | 1 game-min per | Full game day in |
|---|---|---|---|---|
| `idle` (standing around, menus, **phone use**) | 20 | 20 | 3 real-sec | 72 real-min |
| `browsing` (computer open, AfterHours grid) | 10 | 10 | 6 real-sec | 2.4 real-hr |
| `masturbating` (AfterHours session) | 3 | 3 | 20 real-sec | 8 real-hr |
| `working` (gig work block) | 25 | 25 | 2.4 real-sec | ~58 real-min |
| `conversation` (in-person talk) | 1/60 | 1 | 60 real-sec | 24 real-hr |
| `sleeping` | 0 | — | — | discrete skip, not continuous |

Notes:
- `sleeping` is a special context (0) — sleep is a discrete jump, never a
  continuous flow.
- The phone pushes **no** time context → phone use runs at `idle` (20x).
  Texting (IM) also runs under idle scale with no discrete cost.
- Where contexts are pushed/popped: `browsing` (UI.COMPUTER
  `doComputerOpen/Close`), `working` (UI.COMPUTER `doGigWorkBlock`),
  `masturbating` (UI.COMPUTER AfterHours start/stop + TIME reconcile
  safety net), `conversation` (UI `doTalk`/`doStepAway`/close),
  `sleeping` (UI `doSleep`).
- The config comment on `scales` was previously a lie ("Game-minutes per
  real-second"); corrected to "multiplier over real time".

## 4. Discrete time costs — every action that jumps time

| Action | Game time | Source |
|---|---|---|
| Room travel | **0** (instant since the 2026-08-05 change) | UI `doMove` |
| Wait | **60 min** (2 ticks, `advanceAndResolve(2)`) | UI `doWait` |
| Sleep | **6–8 h** = 12–16 ticks (`round(hours×60/30)`), scaled by energy at bedtime, capped by alarm | UI `doSleep`, SIM `resolveSleepHoursWithAlarm` |
| Eat | 15 min | DEFS.ACTIONS `self.eat` |
| Cook | 30 + 3/ingredient, max 50, min 15 (cooking skill shrinks it) | `self.cook` |
| Shower | 15 min | `self.shower` |
| Wash dishes | 10 + 8 per dirty-dish level, max 30, min 5 | `self.dishes` |
| Lock / unlock door | 1 min | `self.lock_door` / `self.unlock_door` |
| Phone pickup / drop / plug / unplug | 1 min | `phone.pickup` etc. |
| Swim | 30 min | `self.swim` |
| Laundry | 20 min | `self.laundry` |
| Gig work block | 30 min (`CLOCK.tickMinutes`; loop paused under `working` 25x) | UI.COMPUTER `doGigWorkBlock` |
| AfterHours "Cum" | 15 min (`MASTURBATION.timeCostMinutes`) | UI.COMPUTER `doAfterHoursCum` |

Zero/no-cost actions: look around, app/screen navigation, opening/closing
the computer or phone, shopping, messaging, and the (broken) instant
actions in §6.

Time costs are resolved by `resolveTimeCost` (ACTIONS): flat minutes,
`skill`/`curve` reductions, `perIngredient`, `perDirtyDish`, `min`/`max`
clamps. `advanceAndResolveMinutes` returns the integer tick count; the
clock lands on the exact minute regardless.

## 5. Needs decay (per 30-min tick)

Player (`NEEDS.*.decayPerTick`, applied via `decayPlayerNeeds`):
energy 2, hunger 3, hygiene 1, mood 0.02 (mood is on [-1, 1]).

NPC (`NEEDS.npc*Decay`, applied per tick in `resolveTick`):
energy 2, hunger 3, hygiene 1, social 2, comfort 0.5, stimulation 1;
restores: sleep +6 energy, morning/evening +hunger, morning/wind_down/
evening +hygiene, shared-room +social, comfort facility +comfort.

## 6. ⚠️ Latent bug: four actions crash mid-execution

`self.watch_tv`, `self.workout`, `self.play_games`, `self.study` have
**no `timeCost`** field. `resolveTimeCost` does `tc.base` on `undefined` →
TypeError. Worse, `executeAction` applies effects *before* the crash, so
clicking "Work Out" mutates mood/energy but never advances time, narrates,
or saves. Verified live: `resolveTimeCost(ACTION_DEFS['self.watch_tv'])`
throws. If these are meant to be instant actions, the fix is
`timeCost: { base: 0 }` (or a 0-guard in `resolveTimeCost`).

## 7. Everything still hard-coded to 30-minute ticks

The granularity work target — what snaps to 30-min or is quantized:

- **NPC schedules** (`SCHEDULES` in CONFIG): every resident's day is
  blocks in **0–47 half-hour ticks** (sleep/morning/commute/work/evening/
  wind_down/leisure). `resolveScheduleActivity` (SIM) looks up the current
  tick per NPC, each tick.
- **NPC transit** (SIM `resolveTick`): walking between rooms advances one
  path node **per tick** (30 game-min per hop).
- **NPC drive effects / need restore**: all per-tick rates (§5) are "per
  30 min" dressed as "per tick".
- **Player needs decay**: `decayPerTick` (§5).
- **Visit spine** (SIM `scheduleVisit`/`getActiveVisits`): every external
  presence (contractors, maid, food drivers, friends, escorts) is
  `[startTick, endTick)` in 30-min ticks. Food driver window is
  `driverWindowTicks: 1` = 30 game-min.
- **Restaurant hours** (`RESTAURANT_DEFS.hours`): `[openTick, closeTick]`
  in 0–47 half-hour ticks, possibly as windows.
- **DoorDrop ETAs & delivery slots** (COMPUTER): arrivals land on tick
  boundaries (`arrivalTick*30`), schedule options step in 30-min
  increments (`maxScheduleAheadTicks: 12` = 6 h).
- **Gig deadlines**: tracked in days; each work block = 30 min.
- **Sleep**: computed in hours, rounded to ticks → wake time snaps to
  :00/:30.
- **Phone battery** (CONFIG `PHONE`): drains/charges **per sim
  checkpoint** (2% per 30 game-min unplugged, +6% plugged in) — not per
  minute.

## 8. Day rollover — the once-per-day batch

`processDayRollover` (UI) runs once per calendar day crossed, on either
path, in this order:
rent (due/overdue) → bills → autopay → taxes → Nile delivery arrivals →
renovation job arrivals/wrap-ups → visit retirement + contractor backstop
→ maid (charge/perform/schedule) → friend visits → escort bookings →
contractor quality milestone → quests → gigs (deadline auto-delivery) →
burnout update → services → classifieds → investment growth →
relationship consequences.

Food-order handovers are the exception: `processFoodOrdersNow` runs on
**every** clock advance (mid-day), not at rollover.

## 9. The real tension for a more granular game

The clock *tells* minute time but the sim *breathes* in 30-min breaths:
NPC schedules, transit, visits, needs decay, phone battery, and day
rollover are all tick-quantized, and the continuous loop only simulates
NPCs every 30 accumulated game-minutes.

The path toward "anything can happen at any time":
- Lower `CLOCK.tickMinutes` (→ 10 / 5 / 1). Everything in §7 scales off
  that constant: visit windows, schedule blocks, drive cooldowns
  (`DRIVE_DEFS.cooldownTicks`), decay rates, restaurant hours, delivery
  slots, phone battery, sleep rounding.
- The one structural spot: `SCHEDULES`' half-hour block syntax and the
  sim-checkpoint quantization (TIME `simCheckpointMinutes`), which is the
  heartbeat everything else snaps to.
- Mostly a config-densification job (change one constant + retune rates),
  not a rewrite.

## Appendix: key constants file map

- `CLOCK` (CONFIG): `tickMinutes: 30`, `ticksPerDay: 48`, `startMinutes`,
  `phaseThresholds`.
- `TIME_DILATION` (CONFIG): `scales`, `simCheckpointMinutes: 30`,
  `freezeWhenHidden`.
- `SLEEP` (CONFIG): `minHours: 6`, `maxHours: 8`, `restorePerHour: 12.5`,
  `alarmMinHour: 4`.
- `NEEDS` (CONFIG): player + NPC decay/restore rates.
- `PHONE` (CONFIG): battery drain/charge per checkpoint.
- `WORK_TUNING` (CONFIG): focus multipliers, `phoneFocusMultiplier: 0.6`.
- `MASTURBATION` (CONFIG): `timeCostMinutes: 15`, `warmupSeconds: 3`.
- `FOOD_TUNING` (CONFIG): `travelMinutesBase/Variance: 20/20`,
  `driverWindowTicks: 1`, `maxScheduleAheadTicks: 12`, tip settings.
- `SCHEDULES` (CONFIG): 0–47 tick day templates for NPCs.
- `TIME` (TIME file): the clock loop, context stack, advance functions.
- `SIM` (SIM file): `resolveTick`, `resolveBatch`, `getTickIndex`,
  `decayPlayerNeeds`, `resolveSleepHours*`, visit spine.
