# The floor plan and movement overhaul

Status: **built** — all 6 phases plus both follow-ups, D1-D16 locked, 94 assertions in
`dev/verify/verify-plan.js`. Started and completed 2026-08-13/14.

Companions: `dev/mapper.html` (the authoring tool this plan's geometry came
out of — open it before editing any adjacency by hand).

Supersedes the floor-plan half of `complete/apartment-expansion-plan.md`,
whose Mirrored H concept survives; its *coordinates* do not.

> Living document. Phases are written before they are built and corrected
> after. Where a phase's writeup disagrees with the code, the code won.

---

## Handoff — read this first

The apartment's map is a collection of floating boxes joined by connector
lines. This plan makes it a real floor plan: rooms that share walls, doors
that sit in those walls, thresholds that mean something to the simulation,
and movement that costs a plausible number of seconds instead of nothing.

Three facts to have in your head before touching anything:

1. **The rooms do not currently touch.** Not "mostly don't" — *zero* of 17
   adjacency pairs share a wall. The connector lines exist to bridge gaps
   that should never have been there.
2. **The apartment is a tree.** 18 rooms, 17 edges, exactly one route
   between any two points. The new layout is not, and that is the point.
3. **`doMove` has never checked `getDoorState`.** The floor plan draws a
   padlock on a locked bedroom and the player walks straight through it.
   Phase 3 is the first time a lock stops anybody.

---

## The thesis

A map is not a diagram of a graph. It is the reason the graph is shaped the
way it is.

Right now the graph came first and the picture was drawn to match, badly —
which is why it reads as boxes. This plan inverts that: the hand-drawn plan
is authoritative, the rooms tile, and the adjacency graph is *derived from
walls that actually meet*. Once that is true, three things that are already
built finally have somewhere to happen:

- **The signal layer** (Plan 1) does per-channel attenuation through doors,
  and has never had a room without a door to demonstrate it. The new plan is
  a continuous open core with private rooms hanging off it — so smell and
  sound pour from the kitchen into the south hallway and stop dead at the
  bedroom doors, visibly.
- **NPC initiative** (Plan 5) can cross the apartment to reach the player,
  and the player has never been able to be *intercepted* on the way
  somewhere. Auto-pathing makes an overture in a room you pass through an
  interruption rather than a thing you walked past.
- **Renovation** marks a room under construction and nothing physical
  follows. On a looped plan, closing a room reroutes traffic — except where
  it severs it, which becomes a real decision.

### What this plan is *not*

- **Not a movement-cost rebalance.** Walking costs seconds, deliberately, so
  that distance is felt and nothing else changes. It is not a new resource.
- **Not a pathfinding engine.** `findPath` (BFS over `ROOM_ADJACENCY`)
  already exists and is kept. This adds *resolution* of a walk, not routing.
- **Not the room-contents renderer.** Furniture symbols are Phase 5 and
  depend on everything before them being true.

---

## Evidence

Measured against the code as it stands, before any of this:

| Claim | Measurement |
|---|---|
| Rooms don't touch | 0 of 17 adjacency pairs share a wall |
| The map is mostly empty | room area = 56.8% of the viewBox |
| The apartment is a tree | 18 rooms, 17 edges, connected ⇒ exactly one route between any two rooms |
| Locked doors are cosmetic | `getDoorState` has 4 readers (`interruption`, `overture`, `signals`, `render`) and **none** in `doMove` |
| Travel is free | `doMove`: *"Room travel is instant: no tick advances"* |
| The clock can already do seconds | `meta.clock.minutes` is a continuous float; `advanceAndResolveMinutes` takes fractional minutes and crosses 0 tick boundaries below a minute |

The new plan, from `dev/mapper.html`: **19 rooms, 21 connections (20
walkable), 2 circulation loops.**

---

## Locked decisions

### The plan itself
- **D1** — The hand-drawn plan is authoritative. 19 rooms: the existing 18
  plus `changing_room`, a wet-room between the Gym and the Game Room.
- **D2** — A room is a **list** of `[x,y,w,h]` rects, not one box. The Gym
  wraps around Bedroom 1 and the Living Room wraps under the Entry; both are
  genuinely L-shaped, and flattening them reintroduces the problem this plan
  exists to remove.
- **D3** — **Bedroom ids keep their meaning, not their position.**
  `bedroom_1` moves from the south wing to the north. Since `residency.room`
  stores the id, no save migration is needed — only the `wing` property
  changes.

### Thresholds
- **D4** — Every edge carries a type: `door` | `open` | `glass`.
  - `door` — a real door; attenuates per channel; can be locked
  - `open` — a zero-threshold transition. **No wall, no barrier.** The line
    between the Kitchen and the Dining Room is imaginary; the rooms are one
    space with two names
  - `glass` — passes **sight only**
- **D5** — **A `glass` edge is not in `ROOM_ADJACENCY`.** It appears only in
  `ROOM_THRESHOLDS`. A walkable window is not a thing, and an NPC pathing
  through one is the bug this decision prevents.
- **D6** — The **open core**: Entry, Living, Dining, Kitchen, Hallway A and
  Hallway B are joined entirely by `open` edges — one continuous space with
  every private room exactly one door off it. This is the model the whole
  layout expresses and every later phase leans on.
- **D7** — **The wing asymmetry is SENSORY, and only sensory.** Hallway A
  opens onto the Living Room; Hallway B opens onto the *Kitchen*, so
  Bedrooms 2 and 3 sit downstream of the kitchen with one door between.
  That is real, measurable (3.3× the cooking smell) and intentional.

  It does **not** touch rent. **Every bedroom in this apartment is equally
  desirable** — the rooms are large and the building has good bones, which
  is to say real insulation. What the south wing has is a *position*, and it
  cuts both ways: they are first to know when something has gone off in the
  bin, and first to smell a good dinner.

  > **Corrected 2026-08-14.** A `bedroomDesirability` function scaled rent
  > share by kitchen exposure for a day, built on reading "smell from the
  > kitchen is particularly strong in the South Wing" as an economic claim
  > rather than a sensory one. It was deleted, not merely unused, and
  > `verify-plan.js` asserts both halves: the rent difference is gone, and
  > the exposure difference remains.

### Movement
- **D8** — **Clicking any room auto-paths to it.** `findPath` already
  exists; travel resolution is new. Adjacency-gating the click was a
  restriction the free-and-instant cost never justified.
- **D9** — **Walking costs seconds, derived from the geometry.** Not
  authored per room: the walk's length in floor units × one constant. The
  apartment's size becomes mechanically real without anyone maintaining a
  table of numbers that can disagree with the map.
- **D10** — **Crossing a room is not arriving in it.** Per crossed room:
  blockage, interrupt and stealth checks. **Destination only:** `openScene`,
  the arrival narration, and the X-5 conversation-window close/open. Firing
  `openScene` per crossed room would mint a zero-tick scene per room and
  hand Plan X-5's Assessor a queue of empty windows to judge — it would not
  error, it would quietly corrupt relationship scoring.
- **D11** — `refuseOverturesInRoom` still fires only for the room the player
  *leaves*. Someone waiting in a room you pass through **interrupts** you;
  passing them is not the same as turning away from them.
- **D12** — Walk resolution is **pure and deterministic**: no RNG, no LLM.
  Same discipline as `resolveTick`. Every blocker and interrupt is a read of
  existing state.

### Upgrades
- **D13** — A **structural upgrade edits the graph**, not a quality number:
  it changes an edge's type, adds or removes an edge, or changes what a room
  *is*. This is what distinguishes it from the existing facility upgrades.
- **D14** — The pool's `glass` edge to the Living Room is an **upgrade**,
  not a starting condition, and never becomes a door. The Game Room stays
  the sole way into the east wing, because a chokepoint everyone passes
  through is where unforced encounters happen.

---

## Data model

### `ROOM_LAYOUT` (Phase 1) — geometry

```js
const ROOM_LAYOUT = {
  gym: [[232,120,208,70],[355,30,85,90]],   // L-shaped: wraps Bedroom 1
  ...
};
```

A list of `[x, y, w, h]` in a 500×660 schematic space.

### `ROOM_THRESHOLDS` (Phase 1) — barriers

```js
const ROOM_THRESHOLDS = {
  'dining|kitchen':        'open',
  'bedroom_1|hallway_a':   'door',
  'living_room|pool_room': 'glass',   // upgrade-gated, not walkable
};
```

Keys are the two room ids **sorted** and joined with `|`. One accessor,
`thresholdBetween(a, b)`, so the sort order is never a caller's problem.

### The walk result (Phase 3)

```js
resolveWalk(gs, from, to) → {
  route,       // rooms findPath proposed
  crossed,     // rooms actually entered, in order
  stoppedAt,   // where the player ends up
  reason,      // null | 'locked' | 'construction' | 'overture' | 'caught'
  blockedBy,   // room or npc id that stopped them
  seconds,     // derived from geometry
}
```

Pure. Mutates nothing. The caller applies it.

---

## Implementation phases

### Phase 1 — The layout lands
`ROOMS` (19, `changing_room` new), `ROOM_ADJACENCY`, `ROOM_THRESHOLDS`,
`ROOM_LAYOUT` from the mapper. The new room needs everything a room needs:
`APARTMENT_LAYOUT` objects, a facility + renovation entry, an `imagePhrase`,
a `wing`. `world` folder migration for the new room shell; object buckets
lazy-spawn already. **The phase with save-compatibility risk.**

### Phase 2 — Thresholds become real
Wire `ROOM_THRESHOLDS` into `signals.js`: `open` = zero attenuation, `door`
= the existing per-channel table, `glass` = sight only. The kitchen smell
reaching Bedrooms 2 and 3 but not Bedroom 1 becomes simulated rather than
asserted.

### Phase 3 — Walking
`resolveWalk` + `WALK` tuning. Auto-path on click, deterministic interrupts,
seconds-not-minutes, and **locked doors enforced against the player for the
first time**. D10's crossing/arriving split is the correctness core.

### Phase 4 — The floor plan renderer
Tiled rooms, walls as shared edges, doors as gaps in walls, connector
spaghetti deleted. Threshold types drawn distinctly. The visible payoff.

### Phase 5 — Furniture and avatars
~20 top-down SVG symbols keyed to `OBJECT_DEFS`, placed from
`APARTMENT_LAYOUT`, rendering real object state. NPC dots become portrait
circles via the existing `getCharacterImage` cache.

### Phase 6 — Structural upgrades
The kitchen door, Study → Bedroom 4, the ensuite conversion, the pool glass
wall, the reversible dining doors.

---

## Status

| Phase | Status |
|---|---|
| 1 — The layout lands | **built** |
| 2 — Thresholds become real | **built** |
| 3 — Walking | **built** |
| 4 — The floor plan renderer | **built** |
| 5 — Furniture and avatars | **built** |
| 6 — Structural upgrades | **built** |

All six verified by `dev/verify/verify-plan.js` — 77 assertions, in
`run-all.js` (1542 total, all passing).

### Phases 4–6

- **The renderer is a plan, not a diagram.** Fills, then walls with the
  doorways *cut out of them* (1D interval subtraction per rect edge), then
  furniture and people. `.fp-connector` is deleted — it only ever existed to
  bridge gaps between rooms that did not touch. Every doorway is derived from
  the same `sharedWallSegment` the walk cost uses, so **the door you see and
  the door you walk through cannot disagree.**
- **A locked door is drawn sealed.** The renderer cuts no gap for it; it
  draws a bar instead. That is the one place the plan shows a barrier that
  is not a wall, and it is the visual half of Phase 3's enforcement.
- **~40 top-down furniture symbols** keyed to `OBJECT_DEFS`, placed by
  walking the perimeter of each room's largest rect. Deliberately not
  authored per room: 19 rooms × a dozen objects is 200-odd coordinates that
  would go stale the moment a room moved in the mapper. **They render real
  object state** — a `crusty` stove and an `unmade` bed look different,
  reading data that has existed since P1 and that nothing had ever drawn.
- **Corridor labels rotate.** Hallway A is 32 units wide and 185 tall; a
  horizontal label at any readable size ran out of the room and across the
  bedroom next door.
- **Avatars never generate art.** The floor plan redraws on essentially every
  interaction, so a render pass that could kick off a portrait generation
  would spend real quota every time somebody walked into a room. Portraits
  are picked up from the cache once the surfaces that legitimately generate
  them have done so; initials show until then.
- **Structural upgrades edit the graph** (D13). `ROOM_ADJACENCY` and
  `ROOM_THRESHOLDS` are now DERIVED — base layout plus whichever upgrades a
  save has built — and rebuilt **in place** so all thirty-odd existing
  readers keep working untouched. Five ship: the kitchen door, the pool
  window, Study→Bedroom, the ensuite, and the reversible dining doors.
  **Two of the five ADD a barrier**, which is a lever most upgrade systems
  never offer.
- The pool's glass wall **left the base layout** and became
  `STRUCTURAL_UPGRADES.pool_window`, which is what D14 actually said.

### The two follow-ups (D15, D16)

- **D15 — Structural work is bookable in RenoFix**, through the *same*
  contractor pipeline as a facility job: Del's crew, real money, real days
  on site, the one-job-at-a-time cap. The job record carries `structuralId`
  where a facility job carries `facilityId`, and every downstream reader
  branches on which is present rather than on a `kind` field somebody would
  forget to set. Completing it sets the flag, rebuilds the graph, and
  recomputes rent. Each card states what it does to the layout in a line
  **derived from the same `edits` list the applier runs**, so the
  description cannot promise something the upgrade does not do.
- **D16 — D7 is NOT priced, and that is the decision.** A first pass
  scaled rent share by kitchen exposure; it was reverted the same day (see
  D7). The wing asymmetry lives entirely in the signal layer. Rent knows
  nothing about which bedroom anybody is in.

### Fixed in passing (again)

`.btn.disabled` was never styled. RenoFix marks a booking button
`class="btn ... disabled"` when the player cannot afford the job, and the
rule did not exist — so an unaffordable Book button looked identical to an
affordable one on **every facility card in the game**. The click was refused
correctly; it just gave no warning first. A missing style is invisible to
every other kind of test, so `verify-plan.js` now asserts the rule exists.

### What phases 1–3 actually produced

- **19 rooms, 20 walkable edges, 2 circulation loops** (both in the east
  wing). The apartment is no longer a tree.
- **D7 is real and measured**: kitchen smell reaches Bedroom 2 at `0.182`
  and Bedroom 1 at `0.055` — a **3.3×** difference, and the harness proves
  it is the open archway doing it by closing that one threshold and watching
  the gap collapse. The two bedroom wings are now genuinely unequal.
- **Locked doors stop the player**, for the first time since `getDoorState`
  was written. It had four readers; `doMove` was never one of them.
- **Walk costs, derived from geometry**: ~6.5s to the next room, ~37s to
  cross the whole flat corner to corner. Every walk stays under a game
  minute, which is what "seconds, not minutes" was asking for.
- **The glass pane earns its upgrade**: it carries sight from the Living
  Room to the Pool *better than the walk-around route does*, and carries
  neither sound nor smell at all.

### Fixed in passing

`roomPhrase(roomId)` (config.js). Eight narration sites hand-wrote
`` the ${ROOMS[id].name} `` and produced **"the Your Bedroom"** and **"the
Bedroom 2"**. It went unread for a long time because the log rarely named a
room; walking narrates routes constantly, so it became unmissable
immediately. One helper owns articles now, and `verify-plan.js` greps the
source tree so the pattern cannot come back.

### Three stale harness assertions, corrected

The layout move surfaced tests that had hardcoded room pairs. In each case
the code was right and the assertion was stale — and two of them were
failing *for the wrong reason*, which is the more interesting half:

- `verify-s1` / `verify-i1` named `bedroom_2 → hallway_a`, an edge that no
  longer exists. `__hear` across a non-edge returns null, so "a sigh does
  NOT carry through a door" kept **passing for the wrong reason** while its
  paired "a slam DOES carry" failed honestly. Both now derive the pair from
  `ROOM_ADJACENCY` and cannot go stale again.
- `verify-s1`'s "a doorless room is not penalised" probed by deleting a door
  OBJECT. That stopped meaning anything once `ROOM_THRESHOLDS` became the
  authority on whether a crossing is a door — removing the object now only
  means it cannot be *locked*. Re-pointed at the invariant it was actually
  protecting: an `open` crossing is not attenuated as if a door stood there.
- `verify-c2`'s pursuit-persistence check took the first sample from one
  NPC and asserted it survived a tick, conflating "the merge dropped it"
  with "the drive legitimately completed". Now measured over the population
  (survival must dominate), which is both robust and a stronger claim.

---

## Dependency order

1 → 2 → 3 are strictly sequential (2 needs the threshold data; 3 needs
locked doors to be reachable through a real graph). 4 needs 1. 5 needs 4.
6 needs 2 and 4 — an upgrade that retypes an edge is only legible once
edges are drawn.

---

## Open questions (parked, none blocking)

- **Does the Balcony's curved wall get drawn?** Phase 4 uses rects; the bay
  is a rounded corner in the drawing. Cosmetic, and a path is a later edit.
- **Should a walk cost energy as well as time?** D9 charges seconds only.
  Crossing the flat forty times a day is currently free of everything but
  clock, which may or may not want to be true.
- **Time-per-room tuning.** D9 set the mechanism and Phase 4 made distances
  visible; the constant (`WALK.unitsPerSecond`) has not had a playtest pass.

---

## Design invariants

1. **The map and the movement graph cannot disagree.** Every declared
   adjacency shares a real wall, asserted in the harness.
2. **`glass` never becomes walkable.**
3. **Crossing is not arriving** (D10). One `openScene` per player-initiated
   move, no matter how many rooms it crossed.
4. **Walk resolution is pure, deterministic, and model-free.**
5. **A room is a list of rects.** Anything that assumes one box is a bug.
