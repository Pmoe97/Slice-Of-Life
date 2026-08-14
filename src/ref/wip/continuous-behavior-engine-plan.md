# The continuous behavior engine

Status: **planned — not started**. Design session complete 2026-08-14; all
decisions locked. Documentation only — no code written.
Last updated 2026-08-14.

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
- `decor-economy-plan.md` (the anchor table this plan reads for object-
  sourced actions is populated by that plan's catalog).
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

**Resume at:** Phase 1. Nothing has been built. This document exists to be
read and reviewed before any of it is.

**Last session's notes (design session, 2026-08-14 — no code written):**
- Two AskUserQuestion rounds this session locked the shape: (1) true
  continuous position, eventual real-geometry perception, auto-derived
  anchors, player unified with NPCs; (2) full action-vocabulary
  unification, a fine periodic needs heartbeat, a new delivery-then-place
  decor economy, and this six-document set.
- Grep-verified against the live tree while writing, not recalled: exact
  shapes of `SCHEDULES` (config.js:3633), `resolveScheduleActivity`
  (sim.js:780), `cognition.js`'s pursuit/cooldown fields
  (`holdTicks`/`ticksLeft`/`cooldownTicks`), `ACTION_DEFS`'s `source`/
  `timeCost`/`prepare`/`buildEffects` shape (defs.actions.js:29 on), and
  `DRIVE_DEFS`'s `blockFilter`/`utility` shape (config.js, `chat_with_
  roommate` read in full as the worked example).
- One correction to the plan's own working assumption, made while
  grep-verifying rather than after: **most `ACTION_DEFS` entries are
  room-sourced (`source:{kind:'room',roomIds:[...]}`), not object-sourced.**
  Only a few (`self.cook` → the stove) resolve to a specific placed object
  today. Unifying NPCs onto `ACTION_DEFS` does not, by itself, give every
  action a stand-point — that still has to come from the anchor system
  (`decor-economy-plan.md` / the Home Design Studio work), layered on top.
  This plan's Phase 2 states that boundary explicitly rather than
  overclaiming what unification alone buys.

**Blockers / flagged deviations:** None.

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

---

## Data model

### `npc.commitment` / `player.commitment` (Phase 1)

```js
commitment: null | {
  id,                          // actionId or driveId
  kind: 'action' | 'drive',    // D2
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
| 1 | Not started | `npc.commitment` replaces `npc.pursuit` |
| 2 | Not started | Event-driven decision scheduling replaces the per-tick scan |
| 3 | Not started | Real durations + anchors for actions; time-of-day weight for drives |
| 4 | Not started | Physical walk/render layer (absorbs the movement plan) |
| 5 | Not started | Work/commute, interrupts, fast-forward catch-up |
| 6 | Not started | Live tuning pass |

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
- **Does `actions.js`'s player-assumption run deeper than expected?**
  Phase 3's first task is the audit that answers this; if it's extensive,
  Phase 3 may need to split.
- **How aggressively should D4's time-of-day weight curve be shaped** (a
  sharp bell vs. a soft plateau) — a tuning question, decided by watching
  Phase 6, not by argument now.

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
