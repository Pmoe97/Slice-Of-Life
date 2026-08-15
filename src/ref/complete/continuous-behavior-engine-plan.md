# The continuous behavior engine

Status: **built — all 6 phases** (2026-08-15). Design session 2026-08-14
locked all decisions; the commitment substrate (Phase 1), event-driven
scheduling (Phase 2), duration/anchor resolution (Phase 3), the physical
walk/render layer (Phase 4), work/commute + interrupts (Phase 5), and the
tuning + live pass (Phase 6) are built and verified. Phase 6 landed the
four tuning changes in D16 and watched three simulated days live.
Last updated 2026-08-15.

Companions:
- `CONTINUOUS-SIMULATION-ROADMAP.md` (the umbrella — this plan implements
  its C1–C7; read that first for the cross-cutting decisions this plan
  inherits rather than re-argues).
- `needs-and-heartbeat-plan.md` (needs decay/restoration move off this
  plan's tick-quantized rates onto a separate fine heartbeat — sibling
  concern, not this plan's job).
- `external-world-retiming-plan.md` and `npc-initiative-retiming-plan.md`
  (the other tick→absolute-minute conversions this plan's shape makes
  possible, done as their own plans because they touch different files).
- `src/ref/complete/decor-economy-plan.md` (the anchor table this plan
  reads for object-sourced actions is populated by that plan's catalog).
- `src/ref/complete/npc-cognition-plan.md` (Plan 3 — the utility scorer
  this plan keeps almost unchanged; only its hold/cooldown units move from
  ticks to minutes).
- `src/ref/wip/floorplan-and-movement-plan.md` (status: built, but still
  filed under `wip/` rather than moved — matching its own status header)
  and `src/ref/wip/home-design-studio-plan.md` (the position/walk/anchor
  mechanics this plan absorbs as its own physical-output layer — see
  Phase 4; nothing there is rebuilt, only re-triggered).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else.**

---

## Handoff — read this first

**Resume at:** Nothing — this document is COMPLETE. Phase 6 (the tuning
and live pass) is Done (see Status), which was row 20 — the last row — of
the shared roadmap checklist. The file now lives in `src/ref/complete/`;
the umbrella (`CONTINUOUS-SIMULATION-ROADMAP.md`) and the
`continuous-simulation-handoff-prompt.md` stay in `wip/` as the index.
The checklist's Step 0 will now report every row Done and stop; the "Open
questions" section is parked, not queued. This phase's own numbers and the
incident below are the record anyone resuming AFTER the roadmap reuses.

**Addendum (2026-08-15, completeness audit).** A full audit of the
five-plan roadmap found Phase 3's `kind:'action'` commitment path — the
half of D2 that resolves a real object anchor instead of room-centroid —
was dead code: `scoreCandidates` never produced a candidate with `kind`
set, and the one call site that opens a commitment (`drives.js`'s commit
step) never wrote it, so `openCommitment`'s action branch and
`resolveActionCommitment`/`resolveActionAnchor` (both otherwise correct
and already NPC-generalized — `resolveTimeCost`'s own comments show they
were built with exactly this caller in mind) had no path in. Every
commitment silently fell into the `kind:'drive'` branch.

Fixed by wiring the DRIVE_DEFS side of D2's "a drive that has a physical
component wraps an ACTION_DEFS entry... rather than inventing its own": a
qualifying drive now declares `actionId` (config.js) naming the action it
wraps, and `openCommitment` borrows ONLY that action's anchor resolution
— `durationMinutes` still comes from the drive's own tuned `holdMinutes`,
deliberately, so wiring the anchor up does not silently retune the pacing
Phase 6 measured and published above. Three drives wired, chosen for a
clean 1:1 anchor with no ambiguity: `shower` → `self.shower` (the shower
object via `ACTION_ANCHOR_OBJS`), `sleep_recover` → `self.nap` (bed/sofa),
`do_laundry` → `self.laundry` (the washer, object-sourced already).
`wash_up` was deliberately left unwired — its whole point (Correctness
plan Phase 4, D10 follow-on) is working with no functional fixture, so it
should not gain an object requirement by association.

Verified: `dev/verify/run-all.js` stays 1624/0/0; a direct probe of a
committed `shower` choice confirms `kind:'action'`, `anchor.objId` naming
the real placed shower object, and `completesAtAbs - startedAtAbs === 30`
(the drive's own `holdMinutes`, not `self.shower`'s 15-minute
player-paced `timeCost`); `measure-cognition.js` (itself carrying the
same npc-initiative-retiming-era stamp-comparison bug `verify-c3.js` had —
fixed alongside, see below) shows shower/nap/laundry firing at normal
rates post-fix. `verify-i2.js`'s live-vs-stripped drift bound moved
0.1% → 0.5% (measured at 0.17%) — real anchors change these three
commitments' walk distance, which shifts the tick `arrived` flips on by
one or two, a second source of the same class of feedback drift that
check already existed to tolerate.

Also found and fixed while auditing: six `dev/verify/*.js` harnesses
(`verify-c1`, `verify-c2`, `verify-c3`, `verify-c5`, `verify-i3`,
`verify-i6`) and `measure-cognition.js` had their own bugs — mostly a
within-day tick index (`currentTick`, `0..47`) compared against what is
now an absolute-minute cooldown stamp (`npc-initiative-retiming-plan.md`'s
own D2), which can never match. `verify-c3.js`'s case zeroed its entire
population measurement (14 failures, one root cause). None were game-code
bugs; all are documented inline in their respective files. See also
`CONTINUOUS-SIMULATION-ROADMAP.md`'s own addendum for the C1 gap found in
`commitments.js`/`overture.js` — a file this plan does not own but the
same audit pass converted for the same reason.

**Last session's notes (Phase 6, 2026-08-15 — tuning + live pass).** The
phase changed four things, then watched three simulated days live:
- **config.js — `COGNITION.recencyWindow` 2 → 1.5.** The old 2 (2× eat
  cooldown 420 = a 14h window) halved `eat`'s score at 08:00 (810 min
  since last meal), so breakfast lost to shower/do_laundry every morning —
  measured 0.42–0.44 meals/npc-day with the morning block empty. At 1.5
  (10.5h window) breakfast appears. ?v 104 → 105.
- **cognition.js — `ageCommitment`'s missing-location release gained a
  bounded grace.** The old release fired the instant the schedule block
  went off-map (commute/work), hard-cutting any in-flight drive commitment
  at the boundary — measured: every work commitment in a 36-npc-day trace
  opened at exactly the block's first minute, including one mid-`do_laundry`.
  Now, on the COMMUTE block only, a commitment completing within
  `CLOCK.tickMinutes` (30 game-min) is let to finish — the "finish getting
  ready, then leave" of D5's thesis. Bounded to one tick and the commute
  block: nobody is more than 30 game-min late and nobody walks into an
  already-running shift. ?v 19 → 20.
- **sim.js — pass 3 transit fall-through.** An UNCOMMITTED NPC in schedule
  transit used to `continue` — skip the decision until the wander reached
  its destination. The schedule transit steps one room per tick, so a long
  wander (the Gym is six rooms from Hallway B) locked the scorer out for
  the whole walk — measured live: an 08:00 "heading to the Gym" ran 6 ticks
  straight through the breakfast window with hunger at 30. Now the decision
  runs; if a drive wins, the post-drive merge cancels the transit
  (`npcUpdates[id].transit = null`) and the commitment's own walk takes
  over from where they stand; if nothing clears the threshold the wander
  carries on. Committed NPCs unchanged. ?v 62 → 63.
- **time.js — `clockFrame`'s heartbeat now calls `renderStatusStrip`.** The
  footer need bars are drawn by `renderStatusStrip`, which `render()` runs
  only on player actions — so during pure idle the bars sat frozen while
  needs decayed (needs-and-heartbeat Phase 4 flagged this for this phase's
  ownership). One small strip redraw per heartbeat (5 game-min). ?v 26 → 27.

**Verified via browser_eval on the live engine** (dev/verify is Node-only
here; checks ported via the translation rule):
- **Population re-measurement, fixed method** — 6 houses × 3 residents × 2
  days = 36 real npc-days; commitment segment starts counted as distinct
  `id@startedAtAbs` pairs per NPC (immune to same-tick release→open swaps
  that a prev/cur diff misses). Result: meals **1.33**/npc-day (by block:
  morning 0.11 + prep 0.06, leisure 0.61, evening 0.50, wind_down 0.06),
  showers **1.00**/npc-day, work starts **1.14**/npc-day, awake-uncommitted
  fraction **0.177**, ~**7.7** commitment opens/npc-day. The earlier
  "showers collapsed to 0.08/day" reading was a MEASUREMENT ARTIFACT of
  the prev/cur diff method: showers typically open in the same tick a
  previous commitment releases — exactly the swap the diff missed.
- **Work-boundary audit, day-2-only** (a harness run's day 1 is partial —
  it joins at 08:00 mid-morning, so day-1 "late" deltas are artifacts; a
  focused trace confirmed the 90–150-min cases were all run-start
  artifacts). On a fully simulated preceding night, EVERY `go_work` opens
  at the commute-block boundary or exactly one 30-min tick later (the
  designed grace). Zero early, zero >1-tick. night_shift, evening_shift and
  irregular open exactly on time.
- **Live watch — 3 simulated days at idle 600x** (temporarily raised
  `TIME_DILATION.scales.idle`, restored to 20 afterwards): injected a
  5-resident synthetic house into `currentGameState` (upgrades forced
  functional; `SIM_generateHouse` leaves `bible.name` empty — names filled
  in so initials render), `render()`, `startClockLoop()`. Sampled live:
  day 1 08:00 → all five at work by ~10:18 (morning commute fired, markers
  hidden off-map); 12:13 all five mid-shift; morning_shift worker home by
  14:30 and napping; evening drives (shower at real mid-walk fractional
  coords, eat/scrounge, seek_stimulation, sleep_recover) with marker
  `transform` updating every frame; 23:32 positions visibly moving; the
  next midnight rolled over live (`fireDayRollover`); day 2's grace path
  caught live (drives held into the commute block finish, then `go_work`);
  all four day_shift residents home by 17:38; day 3 19:14 all five resident
  markers visible in rooms. `vision` on a CSS-inlined rasterization of
  `#floor-plan` confirmed the plan renders rooms + the player marker; NPC
  markers are dark-on-dark at 495×650 and didn't surface in that capture
  but are confirmed present by computed styles (8×8, display:inline, live
  transforms). D4's promise (recognizable rhythm, fluid timing) — MET; no
  further tuning beyond the four changes above was needed.

**Incident (self-inflicted, fixed): the kv meta record was clobbered during
the live watch.** `addLogEntry` writes `queueWrite('meta','meta',
currentGameState.meta)`, and the synthetic wrapper's `meta` had no
`versions` field — three live day-rollovers' worth of rent/delivery log
lines replaced the kv meta record with a versions-less object, so the next
`boot()`'s `initStorage` read `versions.meta` as 0 and asserted ("Migration
incomplete for meta: at 0, expected 2", boot aborted). Recovered by
writing the fresh initialized meta record back
(`{versions:{...FOLDER_VERSIONS}, seed:null, clock:null,
structuralHash:null, saveTimestamp:null, imageIndex:{}}`), then a clean
`browser_refresh` confirmed the error-free boot. Lesson for future harness
runs: when injecting a synthetic `currentGameState`, either include
`meta.versions` in the wrapper or stop the clock loop before any day
rollover can log.

**Surprises / observations worth knowing:**
- **`CLOCK.tickMinutes` is 30, not 5.** Every "2-day" harness run was
  actually a 12-day run (576 ticks × 30 min = 12 days) — the rate
  denominators in earlier session notes were off by 6×. The discrete path
  (`resolveBatch`) steps 30 game-min per tick; the live path advances
  per-frame (`advanceClockMinutes`) and checkpoints resolve 30-min slices
  without re-advancing (time.js `runSimCheckpoint`, `advanceClock:false`).
- **Grace-window label dissonance (cosmetic):** during the commute-block
  grace, a finishing drive commitment reads activity "commuting" while its
  label is the drive (e.g. do_laundry) — the off-map held record's activity
  string. One 30-min window, label-only, not worth a change.
- **Shared-anchor walk overlap (cosmetic, pre-existing):** NPCs walking to
  the same anchor on the same path render stacked on one pixel until they
  diverge (three residents to the kitchen at dinner showed identical
  transforms). Phase 4's render property, not a Phase 6 regression.
- **The D4 open question (how sharply to shape the time-of-day weight
  curve) resolved by watching — no reshaping needed**, see D16.

**Blockers / flagged deviations:** None new. The kv-meta incident above is
recorded (fixed, self-inflicted, harmless — no real game existed yet). The
verify-c2 suite follow-ups flagged in the 2026-08-14 sessions (D6
interrupt releases counted against pre-D6 assertions in three checks)
remain outstanding for whoever has Node access — the code is correct; the
checks are out of step.

---

## The thesis

`resolveTick` decides where every resident is and what they're doing once
every 30 simulated minutes, by looking up a fixed `[startTick, endTick,
weight]` range in `SCHEDULES`. `cognition.js`'s utility scorer — Plan 3's
whole contribution — already fixed the *worse* half of this problem: an
NPC commits to one scored choice and holds it, instead of re-rolling
twelve independent drive coin-flips every tick. But the *hold* is still
measured in ticks (`holdTicks: 2`, `cooldownTicks: 20`), and the schedule
underneath it is still a lookup table with hard boundaries. Adam doesn't
finish getting dressed at a time that depends on anything; he stops being
`'morning'` and starts being `'commute'` because the clock crossed tick 19,
full stop, regardless of what he was doing.

That's the thing being replaced. Not "make the tick smaller" — remove it
as the unit decisions happen in. An NPC's day becomes a chain of
real-duration commitments, each one chosen by (almost exactly) today's
scorer, each one ending naturally when its duration elapses or it's
interrupted, immediately followed by the next decision. "Leave for work"
stops being a scheduled event and becomes the natural conclusion of
"finished getting ready" — which might land at 08:15:47 for a slow morning
and 07:52:10 for a fast one, without anyone authoring either number.

### What this plan is *not*

- **Not a rewrite of the utility scorer.** `scoreDrive`, `scoreCandidates`,
  `choosePursuit`, `shouldBreakPursuit` (cognition.js) keep their logic.
  What changes is the *unit* their hold/cooldown arithmetic runs in, and
  *when* they're called (on commitment completion, not every tick).
- **Not a rewrite of `DRIVE_DEFS`'s social/relationship content.** Gates,
  `relDelta`, `expresses`, `npcToNpc` — untouched. Only `blockFilter`
  (a hard categorical gate on retired schedule-block names) and
  `cooldownTicks`/`utility.holdTicks` (tick-counts) change shape.
- **Not geometric perception.** Signals still propagate over the room
  graph in this plan. C8 (the umbrella) carries that forward as a later
  thesis, unstarted.
- **Not every action becoming NPC-executable on day one.** `ACTION_DEFS`
  currently has real entries for the player's own verbs (eat, cook,
  shower, watch TV, workout, clean, laundry, sleep) — that set is what
  NPCs gain access to. Judgment/social drives that were never physical
  actions (`chat_with_roommate`, `peep_player`, `snoop_phone`,
  `gift_to_player`) are not being turned into `ACTION_DEFS` entries; they
  stay `DRIVE_DEFS`, per C2.
- **Not a decor/furniture feature.** This plan reads anchors; it does not
  create the app that populates them. That's `decor-economy-plan.md`.

---

## Locked decisions

### The commitment model
- **D1 — `npc.pursuit` is replaced by `npc.commitment`.** Same *role*
  (the thing an NPC is currently doing and holding to), different shape —
  see Data model. The old `ticksLeft` countdown is replaced by an absolute
  completion time.
- **D2 — Every commitment names either an `ACTION_DEFS` id or a
  `DRIVE_DEFS` id, never both, tagged by `kind`.** A physical commitment
  (`kind:'action'`) has a real duration from that action's `timeCost` and
  an anchor from its `source` (extended by the decor plan's table where
  `source` doesn't already resolve to one object). A social commitment
  (`kind:'drive'`) keeps `DRIVE_DEFS`'s existing resolver shape; if it
  wraps a physical component it borrows an `ACTION_DEFS` duration rather
  than inventing its own (C2, restated for this plan's actual data shape).
- **D3 — Decision cadence is event-driven, not polled.** Today:
  `resolveTick` iterates every active NPC every 30 minutes
  (`getActiveNpcIds`, sim.js:1090). New: every NPC carries its own next-
  decision absolute-minute; the continuous loop only resolves NPCs whose
  time has passed. See Data model / Phase 2 for the scheduling structure.
- **D4 — Routine survives as a scoring weight, not a hard gate.**
  `DRIVE_DEFS`'s `blockFilter` (e.g. `['leisure','evening','wind_down',
  'morning']` on `chat_with_roommate`) currently excludes a drive outright
  outside those schedule blocks. It's replaced by a **time-of-day utility
  bonus/penalty** — the same shape `resolveScheduleActivity`'s old
  per-range `weight` already was, generalized from "which range contains
  the current tick" to "how well does the current time of day fit this
  drive," continuous rather than stepped. A day-shift worker's "go to
  work" candidate scores far higher between roughly 08:00–17:00 on a
  weekday and far lower outside it — strongly enough to be effectively
  exclusive in practice, without a hard boundary anyone can catch fraying
  at the edges.
- **D5 — Work/commute is one long commitment, not a block sequence.**
  Committing to "go to work" plans: walk to the front-door anchor → become
  off-map (`pos:null`, `location:null`, exactly today's convention) for a
  duration drawn from the occupation's hours → walk back in from the front
  door on return. One commitment, one completion time, computed once.
- **D6 — Interrupts re-use `shouldBreakPursuit`'s existing logic**,
  re-triggered by events (a need crossing an urgency threshold, an
  incoming overture, the player addressing the NPC) rather than re-checked
  every tick. A broken commitment ends early; the freed NPC gets a fresh
  decision immediately, same as today's early-release path.
- **D7 — Seeding moves from tick-index to absolute-minute, fully
  reproducible either way.** `` seededRng(seed, `tick_${day}_${tick}`) ``
  becomes `` seededRng(seed, `npc_${npcId}_decision_${absoluteMinute}`) ``.
  Determinism (C6) does not loosen — a given seed still produces a given
  game, byte for byte; the address of *which* draw just changes shape.
  *(Implemented 2026-08-14, an audit follow-up the day Phase 5 landed: see
  Handoff. `resolveTick`'s decision streams are now per-NPC at the
  absolute minute, and the ambient per-tick stream addresses by minute —
  no tick index in any behavior-layer seed.)*

### The physical layer (absorbed from the movement plan)
- **D8 — Position is the source of truth; `location` is a stored,
  synchronized projection.** `npc.location` stays a plain string (kv/JSON
  serializable, read by ~everything) but is now *written* by the position
  system the instant a walk crosses into a new room's rect, not assigned
  directly by schedule logic.
- **D9 — Two velocity regimes.** Live (foreground, any dilation scale):
  position integrates every rAF frame, reusing `clockFrame`'s own
  `gameMinutes = (cappedDeltaMs/1000) * (scale/60)` (time.js:169) —
  `gameSeconds = gameMinutes * 60`, advance by
  `WALK.unitsPerSecond * gameSeconds`. Batch (sleep, `wait`, tab-hidden
  catch-up): no frames exist to animate through; position snaps straight
  to the commitment's resolved anchor.
- **D10 — The player walks in real time; NPCs walk in game time.** Player
  moves are deliberate clicks through the discrete action path
  (`resolveWalk`'s existing `seconds` output, floorplan-and-movement-plan.md)
  and animate over real wall-clock ms, independent of dilation. NPC
  movement is the ambient output of D3's continuous decisions and scales
  with dilation by construction (D9).
- **D11 — Doorway hysteresis.** A point inside a doorway gap
  (`FP_DOOR_WIDTH`) belongs to neither room; `deriveLocationFromPosition`
  keeps reporting the last-confirmed room until fully inside a different
  one's rect union.
- **D12 — The floor plan render split is a prerequisite, not a nice-to-
  have.** `renderFloorPlan`'s current innerHTML-rebuild-per-call shape
  cannot run every frame (the pool room alone produced 100+ nodes).
  `renderFloorPlanStatic` (walls/fills/furniture/labels — rebuilt on real
  state changes) and `renderFloorPlanLive` (avatar markers only, direct
  attribute mutation every frame) are two loops with two different costs
  and must stay two loops.
- **D13 — The decision-queue module's home is decided by a size rule, not
  a runtime judgment call.** Resolves what was previously an open
  question ("decide at Phase 2, once the real size of the decision-queue
  code is known"). The rule: if the queue-maintenance code (adding/
  removing entries, the "who's due" query, and their call sites in
  `sim.js`) comes to **under ~150 lines**, add it as a new, clearly
  labeled section inside `cognition.js` — this file's own header already
  uses a `// ===== SECTION: X =====` convention, follow it. **At or above
  ~150 lines**, create `src/srcfiles/behavior.js`, loaded immediately
  after `cognition.js` and before `actions.js` in **both**
  `main.html`'s `<script>` tags and `dev/verify/loadgame.js`'s `ORDER`
  array (see this plan's own Hard technical rules — a file registered in
  only one of the two is exactly the `rumination.js` failure
  `dev/verify/README.md` rule 6 documents, and it fails silently). Count
  the code first, then apply the rule mechanically — this is not a
  judgment call to leave to whichever session reaches Phase 2.
- **D14 — The action pipeline's actor generalization stops at the
  effects' item semantics (Phase 3's audit verdict).** The audit found the
  player-assumption in `actions.js` was moderate, not deep: `executeAction`,
  `resolveTimeCost`, `buildActionContext`, `actionSourceMatches` and
  `facilityFunctionalHere` all read `gameState.player` directly, and all are
  now actor-id aware (Phase 3). What is deliberately NOT converted is
  `executeAction`'s *effect records* whose owner is `'player'` (carry-item
  transfers, inventory effects) — for an NPC actor those need item-location
  semantics for `carry_<npcId>` bags that the physical layer (Phase 4) owns.
  The default player path is byte-identical; an NPC executing an action
  through Phase 4 must pass explicit actor-targeted effects rather than
  assuming the generalized `actorId` argument alone did the work. This
  resolves the open question "does `actions.js`'s player-assumption run
  deeper than expected?" — the answer: extend the mechanics now, remap the
  item-owner semantics where NPC item handling lands.
- **D15 — Work is a third commitment kind, beside D2's 'action' and
  'drive'.** D5 needs a commitment that is neither a scored drive nor a
  named ACTION_DEFS entry: id 'go_work', kind 'work'. It is exempt from
  the drive holdMinutes contract, from the missing-location release (it is
  off-map BY DESIGN), and from D6's interrupt scan (an off-site worker
  cannot answer their needs from the office). It is built only by
  `openWorkCommitment`, released only by `returnHome` (the sole releaser
  that also places the NPC — at the front-door anchor). D2's shape is
  unchanged for everything else; `kind` now ranges over
  'action' | 'drive' | 'work'.
- **D16 — Phase 6's tuning verdict (2026-08-15): the routine weight
  needed no reshaping; the rhythm problems were four concrete mechanism
  defects, all fixed in the phase.** (a) `COGNITION.recencyWindow` 2 → 1.5 —
  the old 2 (2× eat cooldown 420 = 14h window) halved `eat`'s morning score
  and emptied the breakfast block (0.42 meals/npc-day → 1.33 with
  morning+prep entries appearing). (b) `ageCommitment`'s missing-location
  release gained a bounded grace on the commute block (a commitment
  completing within `CLOCK.tickMinutes` is let to finish) — previously
  every work commitment snapped open at the block's first minute, mid-drive
  and all; a day-2-only audit shows 100% of real work starts land at the
  boundary or one 30-min tick later, never early, never >1 tick. (c) an
  uncommitted NPC in schedule transit no longer skips its decision — a
  long wander locked the scorer out through a whole breakfast window; the
  transit is now cancelled by the winning commitment's own walk. (d)
  `clockFrame`'s heartbeat redraws the footer status strip so need bars
  move during idle. The D4 time-of-day weight curve itself was left as
  delivered; the phase's live watch (3 simulated days at 600x) confirmed
  the routine rhythm by eye. Resolves the open question "how aggressively
  should the time-of-day weight curve be shaped" — the answer was
  "not at all; fix the mechanisms".

---

## Data model

### `npc.commitment` / `player.commitment` (Phase 1)

```js
commitment: null | {
  id,                          // actionId or driveId
  kind: 'action' | 'drive' | 'work',    // D2 + D15 (see D15)
  startedAtAbs,                // clockToAbsolute() at commit time
  completesAtAbs,               // startedAtAbs + durationMinutes
  anchor: { roomId, objId | null, point: {x,y} },
  prepared,                     // optional — mirrors ACTION_DEFS' prepare() output
  arrived: false,               // true once the walk to `anchor` has landed;
                                 // the commitment's effects/decay do not begin until then
}
```

### `npc.pos` / `player.pos`, `npc.walk` / `player.walk` (Phase 4, absorbed)

```js
pos: { x, y } | null,          // apartment-wide coords, ROOM_LAYOUT's space
walk: null | {
  path: [{x,y}, ...],           // waypoints via planWalk
  speed,                        // WALK.unitsPerSecond
  coveredUnits,
},
```

### The decision queue (Phase 2)

```js
// One entry per active NPC, kept sorted by nextDecisionAbs.
// Not persisted as its own kv key — derived at load from every active
// NPC's current commitment.completesAtAbs (or "now" if none).
{ npcId, nextDecisionAbs }
```

---

## Implementation phases

### Phase 1 — The commitment substrate
**Goal:** `npc.commitment` exists, is the sole record of an NPC's current
activity, and every read site that used to consult `npc.pursuit` /
`npc.activity` / `npc.schedule.currentBlock` reads an equivalent derived
from `commitment` instead. No decision-making logic yet — this phase is
the data shape and its accessors.
**Files:**
- `src/srcfiles/npc.js` (or wherever `npc.pursuit` is currently declared —
  confirm at implementation time): replace the field, keep an `activity`
  string DERIVED from `commitment.id`'s label for every existing consumer
  (LLM prompts, the floor plan, the tracker) that reads flavor text.
- `src/srcfiles/state.js`: since this plan explicitly carries no save-
  migration burden, this is a clean field replacement, not an additive
  migration — old saves are not a constraint.
**Verification:** every existing call site that read `npc.pursuit` or
`npc.schedule.currentBlock` (grep first) either now reads `commitment` or
reads a value derived from it with the same shape it expected before.

### Phase 2 — Event-driven scheduling
**Goal:** the flat "loop every active NPC every 30 minutes" scan is
replaced by resolving only NPCs whose `commitment.completesAtAbs` (or
whose lack of a commitment) has passed.
**Files:**
- The decision-queue maintenance and the "who's due" query: either a new
  section inside `cognition.js` or a new `behavior.js`, per D13's size
  rule — count the code, then place it, don't guess.
- `sim.js`: `resolveTick`'s activity-resolution half is replaced by calls
  into this new module; the needs-decay half moves to
  `needs-and-heartbeat-plan.md`'s heartbeat instead.
**Verification:** a synthetic house where NPCs have staggered commitment
lengths resolves each NPC exactly once per completion, never on an
unrelated NPC's boundary — the flat-loop-every-tick pattern is gone from
this code path, checked by call-count instrumentation in the harness.

### Phase 3 — Duration and anchor resolution (D2)
**Goal:** committing to an `ACTION_DEFS` id resolves a real duration
(reusing `resolveTimeCost` — ACTIONS section, already skill-aware) and an
anchor (via `source`, extended by the decor plan's table for entries that
are currently only room-sourced). Committing to a `DRIVE_DEFS` id keeps
today's resolver, with `blockFilter` replaced by D4's time-of-day weight.
**Files:**
- `src/srcfiles/actions.js`: generalize `executeAction`/`resolveTimeCost`
  to accept an arbitrary actor id, not just `'player'` — confirm the exact
  extent of the player-assumption at implementation time (this phase's own
  first task is a grep audit of `actions.js` for hardcoded `'player'`).
- `src/srcfiles/cognition.js`: `blockFilter` checks replaced by D4's
  weight function; `utility.holdTicks` reads replaced by
  `utility.holdMinutes`. **`cooldownTicks` itself is not this phase's to
  convert** — every read of it (including `recencyMultiplier`'s own
  independent wrapped-delta copy, cognition.js:100–112, which duplicates
  `isOnCooldown`'s arithmetic rather than calling it) is
  `npc-initiative-retiming-plan.md`'s D3/Phase 2 scope, since that plan
  already claims "one function, every caller" for this exact field. This
  phase only touches the field unique to pursuit-holding.
**Verification:** every `ACTION_DEFS` entry an NPC can be assigned
produces a real, non-zero duration and a resolvable anchor (falling back
to room-centroid where no specific object anchor exists yet); every
`DRIVE_DEFS` entry's former `blockFilter` set maps to a defined weight
curve with no silently-dropped block name.

### Phase 4 — The physical layer (absorbs the movement plan)
**Goal:** committing to an anchored action plans and animates a real walk
there (D8–D12); the render split ships.
**Files:** as scoped in `floorplan-and-movement-plan.md`'s prior draft —
`planWalk`, the per-frame integrator (hooked alongside `clockFrame`),
`renderFloorPlanStatic`/`renderFloorPlanLive`. Re-triggered by Phase 2's
event-driven completions instead of by a per-tick scan.
**Verification:** carried over from the prior plan's own verification
section — `location`/`pos` agreement, hysteresis, dilation-scaling
arithmetic, the static-layer-not-rebuilt-per-frame call-count check — plus
a new check specific to this plan: a commitment's effects/decay do not
begin (`arrived` stays false) until the walk to its anchor completes.

### Phase 5 — Work/commute, interrupts, catch-up
**Goal:** D5 and D6 land; `resolveBatch`'s fast-forward path resolves the
engine to an arbitrary future absolute-minute synchronously and correctly,
matching what the live per-frame path would have produced.
**Files:** the same module as Phase 2, extended with the batch-resolve
entry point `time.js`'s discrete path and sleep/wait already call into.
**Verification:** a multi-hour synchronous jump (sleep) leaves every NPC
with a fully resolved commitment and no stale in-flight walk (same
invariant the movement plan asserted, now against the real trigger); an
interrupted commitment correctly re-decides rather than resuming.

### Phase 6 — Tuning and the live pass
**Goal:** watch it. Nothing about how "believable" the resulting routines
feel is knowable from a document.
**Verification:** the same live-browser technique this project's other
plans used — a full house over a simulated day, at several dilation
scales, checked by eye against the D4 promise ("recognizable rhythm, fluid
timing").

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | `npc.commitment` replaces `npc.pursuit` |
| 2 | Done | Event-driven decision scheduling replaces the per-tick scan |
| 3 | Done | Real durations + anchors for actions; time-of-day weight for drives. The `kind:'action'` path itself was dead code until the 2026-08-15 audit wired it — see Addendum |
| 4 | Done | Physical walk/render layer (absorbs the movement plan) |
| 5 | Done | Work/commute, interrupts, fast-forward catch-up |
| 6 | Done | Live tuning pass — the D16 tuning changes + a live watch of three simulated days verified the D4 rhythm |

---

## Dependency order

```
Phase 1 (commitment substrate) ──► Phase 2 (event-driven scheduling)
                                         └─► Phase 3 (duration/anchor resolution)
                                                   └─► Phase 4 (physical layer)
                                                             └─► Phase 5 (work/commute, catch-up)
                                                                       └─► Phase 6 (tuning)
```
Strictly sequential — each phase's verification depends on the previous
one's data shape existing. `needs-and-heartbeat-plan.md`,
`external-world-retiming-plan.md` and `npc-initiative-retiming-plan.md`
can all start once Phase 1 lands (they need `clockToAbsolute`-space
timing to exist as the target shape, not this plan's later phases).
`decor-economy-plan.md` can proceed independently and only needs to land
before this plan's Phase 3 wants object anchors beyond the few
`ACTION_DEFS` already sources.

---

## Open questions (parked, none blocking)

- ~~The exact home of the new scheduling module~~ — **resolved this
  session, see D13.** No longer open.
- ~~**Does `actions.js`'s player-assumption run deeper than expected?**~~ —
  **resolved in Phase 3's audit, see D14.** No longer open.
- ~~**How aggressively should D4's time-of-day weight curve be shaped** (a
  sharp bell vs. a soft plateau)~~ — **resolved in Phase 6, see D16.** No
  reshaping needed; the weight curve was left as delivered.

---

## Design invariants

1. **A commitment's effects never begin before its NPC has physically
   arrived at its anchor.** The single rule that makes "stand at the stove
   while cooking" true rather than cosmetic.
2. **Decision cadence is per-NPC and event-driven — never a flat poll of
   everyone on a fixed interval.** The whole reason continuous is cheap
   rather than expensive.
3. **A time-skip snaps; it never fakes animation it has no frames for.**
4. **Determinism survives the removal of the tick grid.** Same seed, same
   game, forever — only the *address* of a given random draw changed
   shape (D7).
5. **The static render layer and the live render layer are separate loops
   with separate costs.** Nothing per-frame touches the static one.
