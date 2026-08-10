# Renovation & Occupancy Overhaul

Status: **ALL PHASES DONE (1-4)** — data model & job lifecycle, player + NPC
construction gating, presentation (floor plan / RenoFix job board / tracker /
narration), and integration polish + old-save migration all built & verified.
Last updated 2026-08-04.

Companions: `src/ref/complete/apartment-upgrades-plan.md` (the facility model this extends —
tier structure, cost bands, quality formula, and design invariants 1-3 carry
over unchanged), `src/ref/complete/economy-and-rent-plan.md` (rent math), `src/ref/complete/contractor-tutorial-overhaul-plan.md`
(who performs and prices these jobs, and the tutorial that teaches them),
`src/ref/complete/external-world-npcs-overhaul-plan.md` (future off-site substitutes for
comfort-tier rooms; future room-sharing assignment logic that consumes the
`residentCapacity` field reserved here).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table at the bottom, as the very last thing you do each session — see
`src/ref/patterns/perchance-agent-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**Resume at:** Done — no phase remains. Phase 4 (integration polish + full playtest)
shipped and verified live this session; the renovation & occupancy overhaul is
COMPLETE. Next session: move on to `contractor-tutorial-overhaul-plan.md` (Phase 1).
Contractor Phase 2 still expects to hook its pricing into `bookRenovationJob`
(computer.js:~2020) and populate `contractorId` — jobs price at materials only and
store `contractorId: null` per locked decision #9.

**Last session's notes (Phase 4):** (1) **Old-save migration** — new
`normalizeUpgrades(rawUpgrades)` (sim.js, next to `initUpgradesState`) replaces the
inline upgrades fixer in `loadGameState` (state.js). Prunes the dead
`bedroom_habitability` key; maps its tier+condition onto the four per-bedroom
facilities — aux rooms inherit the shared tier verbatim, the PLAYER room floors at
`functional` (locked decision #3 + the player-exemption invariant: the old shared
facility only ever governed aux bedrooms for the recruitment gate; an `upgraded` the
save had is preserved on the player room too); backfills facilities a save predates
from `FACILITY_STARTING_TIERS` (fixes the "RenoFix only renders fully on a fresh game"
gap — `renderUpgradesDashboard` skips `!upgrade` rows); backfills the Phase 9
`condition` field. Verified on synthetic old saves in all shared-tier states
(broken/functional/upgraded, with and without condition). The user's real save was
old-format (12 facilities, single `bedroom_habitability` broken, day 3 / $3800) and
is now migrated: 19 facilities, dead key gone, tiers/conditions preserved, player
bedroom functional/100. (2) **sim.js dead-code sweep** — the comfort block's bedroom
branch referenced the dead id AND never fired (`location === 'bedroom'` matched no
room id; locations are `bedroom_1` etc.). Now: bedroom rooms
(`ROOMS[location].type === 'bedroom'`) restore comfort only on an `upgraded` bed
(per the `NEEDS.npcComfortRestore` comment); living room uses `isFacilityFunctional`
so a mid-job entertainment setup doesn't count. (3) **Old-model reference sweep** —
computer.js `findEmptyBed` comment rewritten without naming the dead id; the only
remaining mentions are intentional (the migration code + historical docstrings at
computer.js:1996/2021, config.js:550, render.computer.js:2362).
`src/ref/structural/ARCHITECTURE.md:2209` left untouched — it's a past-tense historical bug-fix
record, not a dangling reference. (4) **Construction-aware blocked messages** —
`facilityFunctional`/`facilityFunctionalHere` (defs.actions.js) now report "{label} is
under construction — the crew wraps up by day {eta}." for a mid-job facility; the
broken message is unchanged. (5) **Appeal delta** — investigated, no action needed:
`computeApartmentAppeal` has NO runtime callers (only its definition reads
`def.appeal`), so the ~0.5 delta is inert. If a future system wires it in, the
four-per-bedroom multiplication will need normalization — noted for that future session.

**Verification (all live, all passing):** (a) Full playtest on synthetic fresh-format
state (stubbed `queueWrite`/`addLogEntry`/`saveAtBoundary`): new game = player
bedroom `functional` + `kitchen_appliances` `functional` (deliberate — working
fridge), everything else `broken`; booked + completed a job for ALL 19 facilities —
exact cost deduction, `activeJobId` set/cleared, tier advances only at etaDay,
condition resets to 100, wrong-type/duplicate/maxed/unknown-facility bookings
rejected, concurrency cap (second facility rejected while one active), tracker entry
appears (dueDay = etaDay) and disappears on completion, `getActiveJobForRoom`
correct, rent recomputed with `shareCeiling` rising monotonically (0.0988 → 0.2007
across the sweep), back-to-back repair→upgrade on `bedroom_habitability_1`. 310
checks, 0 failures. (b) UI end-to-end: `doUpgradePurchase` modal (cost / duration /
`formatDate` ETA / gated actions "Unavailable while working" / quality+rent-ceiling
projections computed on a scratch copy) → real confirm-button click → `doUpgradeBook`
→ job created + narration logged + modal closed. (c) Floor plan: migrated save renders
18 rooms with 0 construction markers; a synthetic active kitchen job stamps
`data-construction` on the kitchen rect + "Under construction" label. (d) RenoFix
dashboard renders all 19 cards across 18 room sections on the migrated save; player
bedroom shows "Habitable" + "Book Upgrade — 4000". (e) Final hard reload clean — no
syntax/perchance/load errors. The two unhandled rejections seen mid-session were
synthetic-state artifacts (`renderComputerScreen` needs `world.computer.power`;
`phoneCarried` needs `world.objects`) — real games always have both via
`normalizeComputerState`/`ensureAllObjectBuckets`; neither fired on real-save renders.

**Blockers / flagged deviations:**
- None. Phase 4 implemented as planned; all verification targets met. Two notes:
  (1) the Phase 4 block's "16 facilities (12 existing + 4 new)" is stale — the actual
  post-split count is 19 (12 − 1 shared bedroom + 4 per-bedroom + 4
  entry/dining/hallway); verification ran against 19 (`FACILITY_LIST`). (2) the
  migration's player-room flooring is a small extrapolation the plan didn't spell out
  (the plan only specifies new-game starts); it follows locked decision #3 and the
  player-exemption invariant, documented above.
- Mixed line endings still hold for sim.js/state.js (CRLF regions): use execute_js
  with raw-byte strings for multi-line edits there (the edit tool still can't match
  multi-line LF oldStrings against CRLF regions).

Deferred dependency (unchanged, still not built): labor markup
(`CONTRACTOR_LABOR_MARKUP`/`getContractorJobPrice`) and `contractorId` are the
contractor doc's Phase 2 — jobs price at materials only and store `contractorId: null`,
per locked decision #9. The contractor doc's Phase 3 free-tutorial-job override will
hook into `bookRenovationJob` later.
---

## The thesis

Renovation today (`purchaseUpgrade`, `computer.js:1981`) is a single click:
pay, tier flips instantly, rent recomputes. That collapses everything the
brainstorm wanted — visible duration, staged work, a room you can't use while
it's being fixed, a bedroom that's *its own* project instead of one shared
switch for all four.

This overhaul makes renovations **timed, staged, contracted jobs** — booked
through the Contractor Friend (see companion doc), running for real days,
visibly "under construction" while active — without ever making the game
unplayable. The apartment must stay survivable in *any* combination of
construction state, from day one wreck to fully restored.

**What carries over unchanged from `apartment-upgrades-plan.md`:** the facility
model (`FACILITY_DEFS`, tiers `broken → functional → upgraded`), the quality
formula (`apartmentQuality = Σ(qualityWeight × tierValue) / Σ(qualityWeight)`),
the rent-ceiling formula (`achievableShare = 0.08 + 0.22 × quality`), the cost
bands, and design invariants 1-3. **What this doc supersedes:** instant
purchase → timed job; one shared `bedroom_habitability` facility → four
independent per-bedroom facilities; decay that can walk a facility back to
`broken` → decay floors at `functional`. One open question from that doc is
already resolved in code and can be struck: **the pool room exists** —
`pool_room` is a real room (`config.js:45`) with a real `pool_systems`
facility (`config.js:587-599`, functional $12,000 / upgraded $34,000).

---

## Locked decisions

Settled in chat; do not re-litigate without checking with the user first.

1. **The tier structure doesn't change.** "Repair" = the existing
   `broken → functional` purchase. "Upgrade" = the existing
   `functional → upgraded` purchase. Only the *timing* changes: both become
   contracted jobs with a real duration instead of an instant click.
2. **Bedrooms split into four independent facilities**: `bedroom_habitability_player`,
   `bedroom_habitability_1`, `bedroom_habitability_2`, `bedroom_habitability_3`,
   replacing the single shared `bedroom_habitability`. Each gets its own tier
   and condition in `world.upgrades`. This is the smallest change that fits
   the existing per-facility-id data model (`world.upgrades` is keyed by
   facility id, not room id — see Data model below).
3. **The player's bedroom starts at `functional`, not `broken`.** Habitable
   day one, but not upgraded — the player crashes in a livable-but-plain room
   while the rest of the apartment is a wreck.
4. **Bedroom "Upgrade" is never "add a bed."** It's a luxury tier that
   *happens* to support a second occupant. It does not, by itself, put a
   second resident in the room — see Occupancy capacity below.
5. **Decay never forces a re-reno.** Condition decay bottoms out at
   `functional` — it can no longer drop a facility to `broken`. Recovery from
   low condition is always the existing instant-money `repairFacilityCondition`
   maintenance path, never a timed job. Timed jobs only move tiers *upward*.
6. **Concurrency: one job at a time, always, for this plan.** A future
   purchasable/unlock may raise the cap — that system is not designed here.
   The `world.renovationJobs` array is shaped to hold more than one active
   job so that future system doesn't require a data-model change, but v1
   hard-caps active jobs at 1 (`MAX_CONCURRENT_JOBS = 1`).
7. **Jobs are priced and timed per facility + tier**, following the existing
   per-tier `cost` field pattern. Luxury (Upgrade) jobs cost more and take
   longer than Repair jobs, matching the existing cost table's shape.
8. **Hallways get ordinary facility defs** feeding the same global
   `apartmentQuality` average as everything else. A *localized* mood/rent
   bonus to specific bedrooms off a given hallway is a new mechanic this plan
   does not build — parked as an open question below.
9. **The Contractor performs and prices every job** (see companion doc). This
   plan defines job *cost* as materials (the existing per-tier `cost` value);
   the Contractor's labor markup is added on top by that doc, not here.
10. **Survivability is structurally already guaranteed for the things that
    matter — verified, not assumed:**
    - **Hunger:** `self.eat` (`defs.actions.js:24-32`) has `requires: []` — no
      facility gate at all, works in `kitchen` or `dining` regardless of
      `kitchen_stove` state. A construction-blocked stove blocks *cooking*
      (`self.cook`), never eating. No new fallback needed.
    - **Hygiene:** two independent bathroom facilities
      (`bathroom_a_plumbing`, `bathroom_b_plumbing`) plus the single-job
      concurrency cap (#6) mean only one shower can ever be mid-job at a
      time. No new fallback needed.
    - **Sleep:** the player's bedroom is exempted from the habitability
      gate entirely (`isBedroomHabitable`, `computer.js:2165-2170`, returns
      `true` unconditionally for `bedroom_player`). Confirm no action ties
      sleep to a facility requirement before shipping (quick grep, not a
      new system).
    - Everything else (laundry, gym, pool, game room, study, balcony, living
      room, TV, entry, dining, hallways) is a **comfort/convenience** tier:
      genuinely unavailable for the duration of its job, with no built-in
      substitute in this plan. That's the intended teeth — "couldn't do
      laundry before scheduling maintenance" is supposed to sting. Paid
      off-site substitutes are `external-world-npcs-overhaul-plan.md`'s
      territory, not required for this plan to ship.

---

## Data model

### Facility defs (`config.js` `FACILITY_DEFS`)

Replace the single `bedroom_habitability` entry (`config.js:497-509`) with
four entries, `room` set to the concrete bedroom id (not the type `'bedroom'`
— that type-wide grouping trick, called out in the comment at `config.js:493-496`
and `config.js:674-677`, goes away with this change):

```js
bedroom_habitability_player: {
  id: 'bedroom_habitability_player', label: 'Your Bedroom', room: 'bedroom_player',
  qualityWeight: 3, gatesRecruitment: false, // player's own room never gates recruitment
  appeal: { '*': 1.0 },
  tiers: [
    { tier: 'broken', ... },   // unused at runtime — player starts at 'functional', kept for schema symmetry
    { tier: 'functional', label: 'Habitable', qualityValue: 0.5, cost: 0, durationDays: 0, residentCapacity: 1, ... },
    { tier: 'upgraded', label: 'Comfortable', qualityValue: 1.0, cost: 4000, durationDays: 4, residentCapacity: 2, ... },
  ],
},
bedroom_habitability_1: { ...room: 'bedroom_1', gatesRecruitment: true, tiers: [broken(cost:0), functional(cost:800, durationDays:3, residentCapacity:1), upgraded(cost:4000, durationDays:4, residentCapacity:2)] },
bedroom_habitability_2: { ...room: 'bedroom_2', ... },
bedroom_habitability_3: { ...room: 'bedroom_3', ... },
```

- **`durationDays`**: new field on every tier of every facility (not just
  bedrooms) — how long the contracted job takes. Populate for all 12
  existing facilities plus the 4 new room facilities (see New facilities
  below). Starting values (tune later): bedroom repair 3d / upgrade 4d,
  kitchen stove 5d / 6d, bathroom plumbing 4d / 5d, living room 3d / 4d,
  gym 4d / 6d, pool 8d / 12d (flagship, matches the existing $12k/$34k cost
  gap), laundry 3d / 4d, game room 3d / 5d, study 2d / 4d, balcony 1d / 3d,
  kitchen appliances 2d / 3d.
- **`residentCapacity`**: new field, **bedroom facilities' `functional` and
  `upgraded` tiers only**. Values 1 and 2. **Reserved, not consumed** — no
  assignment logic reads this yet. It exists so the future room-sharing plan
  (`external-world-npcs-overhaul-plan.md` / a future occupancy plan) doesn't
  require touching these facility defs again. **Do not confuse this with
  `ROOMS[id].capacity`** (`config.js:22-49`) — that field is an unrelated
  scene-crowding cap (max people physically present in the room at once for
  presence/encounter purposes), already used by `computer.js:846`,
  `computer.js:1353`, `drives.js:158`, `sim.js:401/413`,
  `render.computer.js:1121/1188/1800`. `residentCapacity` is about who *lives*
  there; `ROOMS.capacity` is about who's standing in it right now. Both a
  `functional` bedroom (capacity 1) and an `upgraded` one (capacity 2)
  currently still report `ROOMS.bedroom_1.capacity: 2` for scene purposes —
  leave that alone.

### `ROOM_FACILITIES` (`config.js:678-693`)

```js
bedroom_player: ['bedroom_habitability_player'],
bedroom_1: ['bedroom_habitability_1'],
bedroom_2: ['bedroom_habitability_2'],
bedroom_3: ['bedroom_habitability_3'],
// entry, dining, hallway_a, hallway_b: see New facilities below.
```

### `FACILITY_STARTING_TIERS` (`config.js:700-713`)

`bedroom_habitability_player: 'functional'` (locked decision #3); the other
three bedroom facilities and every new entry/dining/hallway facility start
`'broken'`, matching the existing wreck-opening pattern
(`src/ref/complete/game-opening-plan.md`).

### New facilities (entry, dining, hallway_a, hallway_b)

These four rooms currently have zero `ROOM_FACILITIES` entries — no facility,
no quality contribution, no reno hook. Add one facility each, low
`qualityWeight` (1), no `gatesActions` (cosmetic/valuation only, consistent
with the balcony/kitchen_appliances pattern already in `FACILITY_DEFS`):
`entry_condition`, `dining_setup`, `hallway_a_upkeep`, `hallway_b_upkeep`.
Cost/duration bands: cheap and fast (repair $200-600 / 1-2d, upgrade
$1,000-2,500 / 2-3d) — these are cosmetic-tier rooms, not load-bearing.

### `world.renovationJobs[]` (new)

Mirrors the existing delivery pattern (`world.deliveries[]`,
`computer.js` checkout / `ui.js:496-510` `processDeliveriesForDay`) — the
closest existing analog for "thing with an ETA that resolves at day
rollover." Canonical array of job records:

```js
{
  id: 'job_<n>',
  facilityId: 'bedroom_habitability_1',
  roomId: 'bedroom_1',            // ROOM_FACILITIES reverse-lookup, cached for convenience
  jobType: 'repair' | 'upgrade',  // which tier transition this job performs
  fromTier: 'broken', toTier: 'functional',
  startDay: 12,
  durationDays: 3,
  etaDay: 15,                     // completion day, same shape as delivery.etaDay — see note below
  rush: false,                    // weekend-rush premium paid? (added by the external-world plan, Phase 4)
  cost: 800,                      // materials cost — see companion doc for labor markup
  status: 'active' | 'complete',
  contractorId: '<contractor npc id>', // see contractor-tutorial-overhaul-plan.md
}
```

> **`durationDays` are WORKING days, not calendar days** — superseded by
> `src/ref/complete/external-world-npcs-overhaul-plan.md` Phase 4, which shipped after
> this document was completed. Del's crew works weekdays only, so `etaDay`
> is computed with `addWorkingDays(startDay, durationDays)` (SIM): a 3-day
> job booked on a Friday finishes the following Wednesday. Paying the
> weekend-rush premium (`RENOVATION_RUSH_MULTIPLIER`) sets `rush: true`,
> which puts the crew on site every day and makes `etaDay` plain
> `startDay + durationDays` again. Staged progress counts working days too
> (`workingDaysBetween`), so a job parked over a weekend holds its stage.

Also store a pointer on the facility's live state for O(1) lookup:
`world.upgrades[facilityId].activeJobId = 'job_<n>'` (cleared on completion).
The array stays the source of truth (enumerable for the tracker and for a
future concurrency count); the pointer is a cache.

**Stages are derived, not stored.** Following the same "pure derived" pattern
`tracker.js` already uses for the agenda, do not persist per-job stage state.
Add a small config table, e.g.:

```js
const RENOVATION_STAGE_TEMPLATES = {
  repair:  ['Strip-out', 'Rebuild', 'Finish'],
  upgrade: ['Demo', 'Install', 'Detail work', 'Finish'],
};
function getRenovationJobStage(job, day) {
  const stages = RENOVATION_STAGE_TEMPLATES[job.jobType];
  const elapsed = Math.max(0, day - job.startDay);
  const idx = Math.min(stages.length - 1, Math.floor(elapsed / job.durationDays * stages.length));
  return { label: stages[idx], index: idx, total: stages.length };
}
```

---

## Core functions

### `bookRenovationJob(gameState, facilityId, jobType)` — replaces `purchaseUpgrade` as the player-facing entry point

Validation order, mirroring `purchaseUpgrade`'s existing shape
(`computer.js:1981-1998`):

1. Facility exists (`FACILITY_DEFS[facilityId]`).
2. No job already active on this facility (`world.upgrades[facilityId].activeJobId`).
3. Concurrency cap not exceeded: `world.renovationJobs.filter(j => j.status === 'active').length < MAX_CONCURRENT_JOBS` (currently 1).
4. `jobType` matches a valid tier transition for the facility's current tier
   (`getNextFacilityTier`-equivalent — `repair` only valid from `broken`,
   `upgrade` only valid from `functional`).
5. Player can afford the total cost (materials + Contractor markup — total
   comes from the companion doc's pricing function, not computed here).
6. Deduct money **upfront, no refund on cancel** (locked decision, matches
   a real contractor deposit — see Open questions for the one thing still
   parked here: cancellation).

On success: push a new record to `world.renovationJobs`, set
`world.upgrades[facilityId].activeJobId`, **do not change tier or condition
yet** — those only advance on completion. Return a result record for the UI,
same shape convention as `purchaseUpgrade`'s `{ ok, facilityId, ... }`.

### `processRenovationJobsForDay(day)` — new, added to `processDayRollover`

Add to the pipeline in `ui.js:133-156`, right after `processDeliveriesForDay(day)`
(materials conceptually "arrive" before work starts; grouping renovations
next to deliveries keeps day-rollover's narrative order sensible):

```js
processDeliveriesForDay(day);
processRenovationJobsForDay(day);   // NEW
processQuestsForDay(day);
```

Body follows `processDeliveriesForDay`'s exact shape (`ui.js:496-510`):

```js
function processRenovationJobsForDay(day) {
  const jobs = currentGameState.world.renovationJobs || [];
  for (const job of jobs) {
    if (job.status !== 'active' || day < job.etaDay) continue;
    job.status = 'complete';
    const upgrade = currentGameState.world.upgrades[job.facilityId];
    upgrade.tier = job.toTier;
    upgrade.condition = MAINTENANCE.startingCondition;
    upgrade.activeJobId = null;
    currentGameState.world.rent = computeRent(currentGameState.npcs, currentGameState);
    const def = FACILITY_DEFS[job.facilityId];
    addLogEntry('narration', `The crew wrapped up on ${def.label} — ${job.toTier === 'upgraded' ? 'upgraded' : 'repaired'} and ready.`);
  }
}
```

### `isFacilityFunctional` gets the construction check (`computer.js:1973-1977`) — single choke point, zero other diffs

```js
function isFacilityFunctional(gameState, facilityId) {
  const upgrade = gameState.world.upgrades?.[facilityId];
  if (!upgrade) return true;
  if (upgrade.activeJobId) return false;   // NEW — under construction reads as unavailable
  return upgrade.tier === 'functional' || upgrade.tier === 'upgraded';
}
```

This is the highest-leverage single change in the whole plan: every existing
action that already gates on `requires: ['facilityFunctional:<id>']` or
`facilityFunctionalHere:<action>` (`defs.actions.js` — `self.cook`,
`self.shower`, `self.watch_tv`, `self.workout`, `self.swim`, `self.laundry`,
`self.study`, per the grep at `defs.actions.js:37,50,63,114,127,144,156,167`)
automatically respects construction with **no changes to `defs.actions.js`
at all**. A `functional` gym mid-Upgrade job correctly blocks `self.workout`
the moment its job starts, exactly like a `broken` one always has.

### NPC drive gating — genuinely new code, not an extension

Confirmed by direct inspection: `evaluateDrives` (`drives.js:41-95`) has **no**
facility-availability check today — only `checkDriveGates` (need thresholds)
and `isOnCooldown`. Do not assume this is "extending an existing gate"; it
isn't. Reuse `MAINTENANCE.npcDecayActions` (`config.js:477-488`) as the
existing drive→facility linkage table (it already maps `shower`,
`do_laundry`, `cook`, `seek_company` to facility ids) to add a cheap skip
inside the per-drive loop in `evaluateDrives`, right after the block-filter
check (`drives.js:57`):

```js
const decayFacilities = MAINTENANCE.npcDecayActions[driveId];
if (decayFacilities && decayFacilities.some(fid => !isFacilityFunctional(gameState, fid))) continue;
```

This covers exactly the drives that already have a facility association and
no others — acceptable v1 coverage; a drive with no `npcDecayActions` entry
today has no room-gating in v1 either (matches the "not a new declarative
system" scope target).

---

## Presentation

- **Floor plan**: a room with any facility whose `activeJobId` is set renders
  with hazard/construction styling and an "Under construction" label
  (`render.computer.js` floor-plan renderer — cross-reference via
  `ROOM_FACILITIES[roomId]`).
- **Scene/narration**: entering a room with an active job gets a deterministic
  template narration line keyed by `job.jobType` and `getRenovationJobStage`
  (mirrors the existing `narration: { mode: 'template', templates: [...] }`
  pattern used by `self.watch_tv`, `self.study`, etc. — no LLM call, matching
  the zero-LLM-in-ticks invariant). E.g. "Two guys in paint-spattered
  coveralls are arguing about the trim. You step around the drop cloths."
- **Job-progress narration** (stage-complete, delay) posts via
  `addLogEntry('narration', ...)` — the existing lightweight pattern used
  throughout `processDayRollover`'s sub-processors — **not** IM. IM-based
  contractor texts are the companion doc's territory; this plan only needs
  the log-entry hook, which the contractor doc can later intercept/replace.

## RenoFix becomes a job board

Rework `renderUpgradesDashboard` (`render.computer.js:2338-2463`) and its
handlers (`doUpgradePurchase`, `ui.computer.js:1150-1192`):

- **Idle facility**: current tier, `[Book Repair]` / `[Book Upgrade]` button
  (whichever is the valid next transition), showing cost, duration, and
  projected completion day (`day + durationDays`) *before* confirming.
- **Booking confirmation**: cost, duration, completion day, what becomes
  unavailable during the job (the gated actions from `gatesActions`, or
  "cosmetic only" if none), and the projected `apartmentQuality`/rent-ceiling
  change on completion — compute by running `computeRent`/`getApartmentQuality`
  against a scratch copy of `world.upgrades` with the target tier substituted
  in, without mutating live state.
- **Active job**: stage label (`getRenovationJobStage`), "day N of M", ETA,
  no purchase controls.
- Since `bedroom_habitability` is no longer a type-wide facility, the
  dashboard's special-case "render bedroom facility once under 'Bedrooms'"
  grouping (`render.computer.js:2360-2384`, per the comment at
  `config.js:493-496`) goes away — the four bedroom facilities render as
  four independent rows like every other facility.

## Tracker

Add `trackerRenovationJobs(gs)` to the adapters array in `buildTrackerEntries`
(`tracker.js:365-369`), shaped exactly like `trackerDeliveries`
(`tracker.js:209-225`): one entry per active job, `dueDay: job.etaDay`,
`title: "<Facility label> — day N of M"`, urgency from days-until via the
existing `trackerUrgencyFromDaysUntil` helper.

---

## Implementation phases

### Phase 1 — Data model & core job lifecycle

**Goal:** Jobs can be booked, run, and complete; tiers advance on schedule;
no UI polish yet.

**Files:** `config.js` (facility def split, `durationDays`/`residentCapacity`
fields, new entry/dining/hallway facilities, `RENOVATION_STAGE_TEMPLATES`,
`MAX_CONCURRENT_JOBS`), `computer.js` (`bookRenovationJob`, remove/retire
`purchaseUpgrade` in favor of it, `isFacilityFunctional` construction check,
`getRenovationJobStage`), `ui.js` (`processRenovationJobsForDay`, wire into
`processDayRollover`).

**Verification:** Booking a repair deducts money, creates a job, does not
change tier immediately. Advancing the clock to `etaDay` flips the tier,
resets condition, recomputes rent, clears `activeJobId`. A second booking
attempt while one is active is rejected (concurrency cap). Decay never drops
a facility below `functional` (test by decaying a `functional` facility to 0
repeatedly — tier must not drop to `broken`; adjust `decayFacilityCondition`,
`computer.js:2027-2048`, to floor at `functional` per locked decision #5).

### Phase 2 — Player-side and NPC-side gating

**Goal:** A room mid-job is genuinely unusable for its gated actions, for
both the player and NPCs, with survivability intact.

**Files:** `computer.js` (`isFacilityFunctional` change, already listed in
Phase 1 — verify it alone is sufficient), `drives.js` (`evaluateDrives`
construction skip).

**Verification:** `self.cook` blocked while `kitchen_stove` has an active
job; `self.eat` still works (survivability). `self.shower` blocked in
whichever bathroom is mid-job; the other bathroom unaffected. An NPC whose
`shower`/`do_laundry`/`cook`/`seek_company` drive targets a facility with an
active job does not fire that drive. Player's own bedroom sleep is
unaffected by any bedroom facility's job state.

### Phase 3 — Presentation

**Goal:** The player can *see* construction — floor plan, scene narration,
RenoFix as a job board, tracker entries.

**Files:** `render.computer.js` (floor plan hazard styling, `renderUpgradesDashboard`
rework), `ui.computer.js` (`doUpgradePurchase` → booking flow), `tracker.js`
(`trackerRenovationJobs`), narration template additions for construction
scenes.

**Verification:** Floor plan shows "Under construction" on any room with an
active job. RenoFix shows live stage/day/ETA for active jobs and
cost/duration/completion-day preview for bookable ones. Tracker/agenda shows
an entry per active job that updates day-to-day and disappears on completion.
Entering a construction room shows the deterministic narration variant.

### Phase 4 — Integration polish

**Goal:** Everything ties together; no dangling references to the old
shared-bedroom or instant-purchase model.

**Files:** Sweep for any remaining references to `bedroom_habitability` (old
singular id) or `purchaseUpgrade` outside this plan's replacements.

**Verification:** New game starts with the player's bedroom `functional`,
the other three bedrooms and every other facility `broken`. Booking and
completing a job for each of the 16 facilities (12 existing + 4 new) works
end to end. Full playtest: book two jobs back-to-back (concurrency cap
respected), let one complete, verify rent recomputes, verify the tracker and
floor plan reflect state changes correctly throughout.

---

## Status

**All phases complete — the renovation & occupancy overhaul has shipped.**

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | Data model, `bookRenovationJob`, `processRenovationJobsForDay`, decay floor fix |
| 2 | **Done** | Player + NPC construction gating |
| 3 | **Done** | Floor plan, RenoFix job board, tracker, narration |
| 4 | **Done** | Integration sweep, full playtest |

## Dependency order

```
Phase 1 (data + lifecycle) ──► Phase 2 (gating) ──► Phase 3 (presentation) ──► Phase 4 (polish)
```
Phase 1 must land first — everything else reads `world.renovationJobs` and
`activeJobId`. Phase 2 and 3 can proceed in parallel once Phase 1 is stable,
but ship Phase 2 first if only one can go first — invisible-but-correct
gating beats visible-but-exploitable.

---

## Open questions (explicitly parked)

- **Cancellation/refund.** Locked default: pay upfront, no refund on cancel
  (matches a real contractor deposit, and matches doc 2's "he's here to make
  money off you" framing). Revisit only if playtesting makes booking feel
  too punishing to experiment with.
- **Surprise delays** ("asbestos behind the drywall" — a job randomly runs a
  day long). Flavor, not required for v1. Skip unless the Contractor doc
  wants it as a banter hook.
- **Roommate co-funding** of a renovation. Still parked from the original
  upgrades plan — competes conceptually with the rent-share mechanic. Not
  addressed here.
- **Hallway localized bonus** ("boosts the mood/valuation of bedrooms off
  that hall specifically" rather than feeding the global quality average).
  Parked per locked decision #8 — ship hallways as ordinary global-quality
  facilities first; revisit if it's wanted later.
- **`residency.status` enum interaction**: confirm `changeResidencyStatus`
  and any code that reads `residency.room` correctly resolves against the
  new per-bedroom facility ids rather than assuming a single shared
  `bedroom_habitability` state (grep for `bedroom_habitability` beyond
  `FACILITY_DEFS`/`ROOM_FACILITIES` before starting Phase 1).

## Design invariants

1. **The tier structure and quality/rent formulas are unchanged** — this plan
   only adds *time* to an existing purchase, plus per-bedroom independence.
2. **Decay never forces a timed re-reno.** It floors at `functional`;
   recovery is always the instant-money maintenance path.
3. **Survival needs (food, hygiene, sleep) are never fully blockable by
   construction state**, and this is achieved by reusing existing structural
   guarantees (no-gate eating, duplicate bathrooms, exempted player bedroom)
   — not by adding new fallback systems.
4. **Comfort/convenience rooms have real teeth.** Genuinely unavailable
   during their job, no built-in substitute. That's intentional friction, not
   a bug to patch here.
5. **One job at a time**, hard-capped, until a future system explicitly
   raises it.
6. **`residentCapacity` is reserved, not wired.** No code may read it to
   change actual room assignment until the occupancy/room-sharing system
   that consumes it is separately designed and approved.
