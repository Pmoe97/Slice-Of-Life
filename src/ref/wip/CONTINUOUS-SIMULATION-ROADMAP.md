# Continuous Simulation Roadmap

Status: **the umbrella for five linked plans, none built.** Design session
2026-08-14, all five plan documents written the same session — see each for
its own Handoff. This file stays in `wip/` as the umbrella once phases
begin landing, the way `SENSORY-AND-SOCIAL-ROADMAP.md` did for the six
plans before it.
Last updated 2026-08-14.

Companions:
- [`continuous-simulation-handoff-prompt.md`](continuous-simulation-handoff-prompt.md)
  — the reusable one-phase-per-session prompt for this whole roadmap.
  Reused verbatim across all five plans below: it reads their Status
  tables to find the next phase, in a fixed dependency-safe order it
  states explicitly, and is calibrated to the actual tool surface the
  agent working this roadmap has (no Node/shell — `browser_eval` against
  the live generator page, not `dev/verify/*.js` directly). **Hand this
  prompt over, not this document**, when starting an implementation
  session; this document is what the prompt tells that session to read.

This is an **index and an argument**, not a plan. It holds the vision that
spans five overhaul plans so no single plan has to carry it, and it
records the cross-cutting decisions all five inherit. Individual plans
follow `src/ref/patterns/PLAN-ARCHITECTURE.md`; this document does not.

**Verification note, inherited from precedent.** Every plan below is
directly testable the way `SENSORY-AND-SOCIAL-ROADMAP.md`'s six were:
`dev/verify/loadgame.js` brings the whole engine up in a bare Node `vm`
with no browser and no Perchance runtime, so `resolveTick`-equivalent
logic is callable and assertable headlessly. Nothing about removing the
tick grid changes that — the replacement decision step (Phase 2 of
`continuous-behavior-engine-plan.md`) stays synchronous and model-free by
the same invariant (C6) `resolveTick` has always had.

---

## The thesis

Every plan this project has landed so far — the signal substrate, NPC
cognition, knowledge and gossip, initiative, the floor plan retile, the
Home Design Studio — was built *inside* a simulation that decides
everything on a fixed 30-minute grid. `resolveTick` runs once per tick,
looks up a schedule block, and NPCs teleport between the states that
block implies. That grid was never load-bearing for any of those plans'
own ideas — it was just the clock they happened to be built against.

It stops being invisible the moment you actually watch it. Adam does not
finish getting dressed and then walk to the door; he is in the `morning`
state until the clock crosses tick 19, and then he is in the `commute`
state, instantly, wherever he happened to be standing. `cognition.js`
already fixed the worse half of this — an NPC holds one committed choice
instead of re-rolling twelve independent drives every tick — but the hold
itself is still counted in ticks, and the schedule beneath it is still a
lookup table with hard edges.

This roadmap removes the grid as the unit decisions happen in. An NPC's
day becomes a chain of commitments, each with a real duration, each
ending when it actually finishes or is actually interrupted, immediately
followed by the next decision — evaluated by (almost exactly) the same
scorer that already exists. Movement, needs, the outside world's
schedules, and NPC-initiated overtures all currently express "when" as a
tick count for the same historical reason; each gets its own plan to
retime, because each touches different files and different owners, but
all five share one clock: `clockToAbsolute` (`time.js`), which has been
sitting in this codebase, underused, since the discrete action path was
built.

```
                    continuous-behavior-engine-plan.md
                         (the core: commitments, not blocks)
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
  needs-and-heartbeat-plan.md   external-world-      npc-initiative-
  (decay/restore off the        retiming-plan.md      retiming-plan.md
   tick, onto a fine            (visits, restaurants,  (overture cooldowns
   heartbeat)                    delivery, gigs)        off ticks, D34 gone
                                                          by construction)

                    decor-economy-plan.md
        (furniture purchase + placement — populates the
         anchors the behavior engine's commitments route to)
```

### What this roadmap is *not*

- **Not a rewrite.** `cognition.js`'s scorer, `DRIVE_DEFS`'s social
  content, the signal substrate, the floor plan renderer, the visit
  spine's purpose logic — all extended, none replaced. What's replaced is
  narrower than it sounds: the tick-indexed *timing* underneath each of
  these, one plan at a time.
- **Not a graphics project**, though it has visible consequences (NPCs
  walking, standing at real anchors). The mechanism is decision-timing;
  the animation is what that mechanism makes possible, not the point of
  it — same relationship the sensory roadmap had to "sensory" not meaning
  "visual."
- **Not geometric perception, yet.** `signals.js`'s room-graph propagation
  is untouched by every plan in this set. C8 below carries that forward
  as a *later* thesis, deliberately not written as a sixth plan — its
  real shape isn't knowable until continuous position (this roadmap's
  Plan 1) has actually shipped, matching the discipline
  `SENSORY-AND-SOCIAL-ROADMAP.md` itself states outright: "do not write
  plan N+1's phases before plan N lands."
- **Not a save-migration project.** Explicitly waived by the person who
  owns this decision — the game hasn't shipped. Every plan in this set is
  free to reshape data however the design wants, with no additive-
  migration burden.
- **Not implemented.** Every document this roadmap indexes is
  documentation only, as of this roadmap's own last-updated date. That is
  this session's entire deliverable.

---

## Cross-cutting locked decisions

Numbered independently of any single plan's own `D`-numbers — these are
referenced by name (`C1`, `C2`, ...) from every plan below, the same
pattern `SENSORY-AND-SOCIAL-ROADMAP.md`'s `R1`–`R8` established.

- **C1 — Ticks are retired as a decision unit, not deleted as a concept.**
  `CLOCK.tickMinutes`/`getTickIndex` may keep existing for bookkeeping
  explicitly out of scope for this roadmap (day-boundary math, save
  versioning). Nothing in the behavior, needs, visit, or initiative layer
  may branch on a tick index again once its plan lands.
- **C2 — The action/drive boundary.** Physical, object-anchored,
  real-duration activities (cook, shower, sleep, clean, watch TV, work
  out) move onto `ACTION_DEFS`, executed by a generalized, actor-agnostic
  `executeAction` — the same registered-verb pipeline the player already
  uses, now open to NPCs. Social/judgment drives with no physical
  duration of their own (chat, peep, snoop, gift-giving, every overture
  channel) **keep `DRIVE_DEFS`** as a layer above actions. A drive that
  *does* have a physical component wraps an `ACTION_DEFS` entry for its
  duration and anchor rather than inventing its own — owned by
  `continuous-behavior-engine-plan.md`.
- **C3 — Anchors serve three masters.** Where to stand for an activity
  (the Home Design Studio's composite-shape work), where a signal emits
  from (C8, later), and — via C2 — where an `ACTION_DEFS` entry's
  `source` resolves to for whichever actor is executing it. Measured
  directly this session: most `ACTION_DEFS` entries are room-sourced
  today (`source:{kind:'room',roomIds:[...]}`), not object-sourced — only
  a few (`self.cook` → the stove) resolve to one placed object. Anchors
  are what extends every action toward a real stand-point, not something
  unification alone produces. Owned by `continuous-behavior-engine-plan.md`
  (resolution) and `decor-economy-plan.md` (population).
- **C4 — Movement is the physical manifestation of a commitment, not a
  tick-triggered event.** Position/walk/the floor plan's static-vs-live
  render split are the behavior engine's own output: committing to an
  anchored action plans a walk there, and the action's effects don't
  begin until arrival. Owned by `continuous-behavior-engine-plan.md`'s
  Phase 4, which absorbs (not duplicates) `floorplan-and-movement-plan.md`'s
  prior draft.
- **C5 — Decor is anchor-bearing, and an empty room is genuinely inert.**
  A piece of furniture placed through the new Home app is a normal object
  instance with a normal position — the behavior engine reads it exactly
  like any other anchor. A room with no couch has nowhere for "watch TV"
  to anchor to; it degrades to generic room-center idle. Furnishing a
  room is a mechanical prerequisite for it hosting real activity, stated
  once here so no constituent plan treats it as an oversight to patch.
  Owned by `decor-economy-plan.md`.
- **C6 — Determinism is non-negotiable and carries forward unchanged.**
  The decision step stays synchronous, pure, model-free — exactly today's
  invariant on `resolveTick`/`evaluateDrives`. Seeding moves from
  `` seededRng(seed, `tick_${day}_${tick}`) `` to
  `` seededRng(seed, `npc_${npcId}_decision_${absoluteMinute}`) `` — still
  fully reproducible from seed + absolute time. Nothing about determinism
  loosens because the grid disappeared.
- **C7 — Fast-forward always resolves analytically, never by looping a
  fine heartbeat.** An 8-hour sleep jump computes decay as
  `elapsed_minutes × decayPerMinute`, closed-form — never hundreds of
  synchronous heartbeat iterations. The same shape `decayPlayerNeeds`'s
  existing `ticks` multiplier already has, generalized. Owned by
  `needs-and-heartbeat-plan.md`, inherited by every plan whose own
  fast-forward path touches decay or cooldowns.
- **C8 — Geometric perception is carried forward as a thesis, not built
  here.** `signals.js`'s room-graph propagation is untouched by this
  roadmap. Once continuous position (Plan 1, below) exists, vision could
  become real line-of-sight raycasting against the floor plan's own wall
  segments (already computed exactly, with doorway gaps, by
  `sharedWallSegment` — floorplan-and-movement-plan.md) and hearing could
  become real distance-falloff with per-wall dampening, reusing this
  roadmap's anchors (C3) as emission points. `perceiveSignals`'s and
  `reachMultipliers`'s external call shapes would not change — every
  consumer (`drives.js`, `cognition.js`, `overture.js`, gossip,
  rumination, `interruption.js`, `tracker.js`) keeps calling the same
  functions with the same return shape; only what computes the numbers
  underneath would. Not scheduled. Written here because its shape is
  knowable now and a future session shouldn't have to re-derive it.

---

## The five plans

### Plan 1 — Continuous Behavior Engine *(planned — see [`continuous-behavior-engine-plan.md`](continuous-behavior-engine-plan.md))*

**The core.** Retires `SCHEDULES` and `resolveScheduleActivity`'s tick-
range lookup. `npc.commitment` replaces `npc.pursuit` — same role (an
NPC holds one scored choice instead of re-rolling), different unit
(absolute-minute completion time instead of a tick countdown). Decision
cadence becomes event-driven: each NPC carries its own next-decision
time; the loop resolves only who's due, not everyone on a fixed interval.
Routine survives as a time-of-day scoring weight, not a hard block
boundary — a day-shift worker still clearly reads as a day-shift worker,
just without a wall-clock second where they're forced to stop being one.
Absorbs the floor plan's position/walk/render-split work as its own
physical-output layer (C4). Work/commute becomes one long commitment
rather than a block sequence. 6 phases planned.

### Plan 2 — Needs and the Heartbeat *(planned — see [`needs-and-heartbeat-plan.md`](needs-and-heartbeat-plan.md))*

Needs decay/restoration, phone battery, and memory decay move off
`resolveTick`'s per-30-minute pass onto their own fine periodic heartbeat
(proposed 1 simulated minute), because they have to keep moving even
during a long uninterrupted commitment with no decision points. Every
`decayPerTick` rate converts to `decayPerMinute` mechanically — this plan
is explicit that it is not a rebalance of any of the correctness plan's
hard-won tuning. Closed-form fast-forward (C7) is this plan's own
invariant to defend. 4 phases planned.

### Plan 3 — External-World Retiming *(planned — see [`external-world-retiming-plan.md`](external-world-retiming-plan.md))*

The visit spine, restaurant hours, food-delivery ETAs/slots, and gig work
blocks all convert from `[startTick,endTick)` (0–47 space) to
`clockToAbsolute`-space windows. Restaurant hours get special treatment
(D2 of that plan) — they're a *recurring* daily rule, not a one-shot
window, and the conversion has to preserve that distinction rather than
flatten every tick-indexed thing into the same shape. Explicitly confirms
what does *not* change: day rollover, rent, bills — all already
day-indexed and out of scope. 4 phases planned, independent of each other.

### Plan 4 — NPC Initiative Retiming *(planned — see [`npc-initiative-retiming-plan.md`](npc-initiative-retiming-plan.md))*

Overture cooldowns (`textCooldownTicks`, `knockCooldownTicks`,
`proposeCooldownTicks`) and the shared `isOnCooldown`/`setCooldown`
mechanism every `DRIVE_DEFS` cooldown runs through convert to absolute
minutes. Directly resolves the representational hazard behind **D34** (a
documented Plan 5 finding: a wrapped-tick cooldown at or above
`CLOCK.ticksPerDay` never elapses) — not by retuning again, but by
removing the wraparound arithmetic that made the bug class possible at
any value. Proximity channels (`adjacent`/`outside`) stay room-graph-based;
literal-proximity channels are explicitly deferred to C8. 3 phases
planned, narrow scope, mechanical by design.

### Plan 5 — The Decor Economy *(planned — see [`decor-economy-plan.md`](decor-economy-plan.md))*

A new "Home" computer app sells furniture through a catalog, checkout
reuses Nile's exact delivery mechanism (`world.deliveries` →
`processDeliveriesForDay` → the doormat — no new pipeline), and a
delivered piece is placed via an in-game surfacing of the Home Design
Studio's already-built composite-shape editor. The one real divergence
from the Studio's current dev-tool behavior: placement writes a live
object instance into `gameState.objects`, not a `ROOM_DECOR` config
entry — because Plan 1's anchor resolution needs something it can find
the same way it already finds a stove. Structural changes (walls, doors,
room type) stay `STRUCTURAL_UPGRADES`/RenoFix, deliberately a different
catalog — furniture cannot change what a room *is*. 3 phases planned.

---

## Dependency order

```
Plan 1 (continuous behavior engine) ──► everything else's timing target
        │
        ├─► Plan 2 (needs/heartbeat)         — independent after Plan 1 Phase 1
        ├─► Plan 3 (external-world retiming) — independent after Plan 1 Phase 1
        └─► Plan 4 (initiative retiming)     — independent after Plan 1 Phase 1

Plan 5 (decor economy) — independent of all four; only its own Phase 3
        (the anchor-availability proof) needs Plan 1's Phase 3 to exist
        to integrate against.
```

Plans 2, 3, and 4 do not depend on each other or on Plan 1's *later*
phases — each only needs `clockToAbsolute`-space to be the project's
established shared time address, which Plan 1's Phase 1 establishes by
existing, not by anything those three plans call into directly. They may
be worked in any order, or in parallel across sessions, once Plan 1's
first phase lands. Plan 5 may start immediately and entirely in parallel
with all four — it has no dependency on the tick-removal at all until its
own final integration phase.

---

## Design invariants

1. **A conversion plan (2, 3, 4) is behavior-invisible by construction.**
   If any verification step produces a different wall-clock outcome than
   the tick-indexed version would have, the conversion is wrong — these
   three plans exist to change representation, not behavior.
2. **One shared clock address, `clockToAbsolute`, for everything "when"
   means across all five plans.** Not five different absolute-time
   conventions that happen to agree today.
3. **Decision cadence is per-entity and event-driven everywhere it
   appears in this roadmap** — Plan 1's NPCs, and by the same principle
   anything Plan 2–5 add. A flat poll of everyone on a fixed interval is
   the exact pattern this whole roadmap exists to remove; reintroducing
   it in a "simpler" corner of any plan defeats the point.
4. **Determinism is inherited, not re-argued, by every plan.** C6 is
   stated once, here; no constituent plan's document re-derives why it
   matters.
5. **Nothing is planned further ahead than what's knowable.** C8
   (geometric perception) stays a thesis until Plan 1 has actually
   shipped — matching the discipline this project's prior roadmap
   already proved out, not a new rule invented for this one.
