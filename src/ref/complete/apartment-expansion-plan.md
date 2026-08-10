# Apartment Expansion — The Mirrored H Floor Plan

## Status (updated 2026-08-01)

**Built and verified.** All 17 rooms exist, `ROOM_ADJACENCY` is symmetric
and fully connected, movement is gated to adjacent rooms, the SVG floor
plan renders, and NPCs path room-by-room via `npc.transit`. Retained for
the layout and adjacency rationale; see `src/ref/structural/ARCHITECTURE.md` for the
as-built architecture.

One open thread: the opening plan (`src/ref/complete/game-opening-plan.md`) asks whether
parts of the apartment should be gated behind progression. The adjacency
graph and floor plan currently assume all 17 rooms exist from day one.

---

## Overview

Transform the apartment from a flat list of 8 nondimensional rooms into a
real, visible, navigable 2D floor plan with 17 rooms. Players can only move
to adjacent rooms, making the apartment feel like a physical space you
travel through rather than a teleport menu. The existing adjacency graph
(`ROOM_ADJACENCY` in drives.js, currently only used for peep checks) becomes
the authoritative spatial structure that gates movement, encounters, and
NPC pathfinding.

This is the tracking document. Update it as work lands. If a session is
interrupted, read the **Status** section to see exactly where to resume.

---

## The Layout

```
         BR1 ── HALL A ── BR3
                  │
              [Bath A]
                  │
   ENTRY ── LIVING ── GAME RM ── GYM
     │       │  │  │
     │    STUDY  │  BALCONY
               DINING
                  │
            KITCHEN ── LAUNDRY
                  │
              HALL B
            ╱   │   ╲
        [Bath B] │   BR4
               BR2
```

Design principles:
- **Dining is the heart.** Every north→south path passes through Living →
  Dining → Kitchen — three social spaces in a chain.
- **Two recreation zones.** Game Room + Gym = the loud wing. Study + Balcony
  = the quiet wing. Same parent (Living Room), opposite vibes.
- **Hallways are chokepoints.** Every bedroom-to-common trip passes through
  one. Encounters happen there naturally.
- **Dead-end rooms are destinations.** Gym, Laundry, Balcony, Entry, Baths,
  Bedrooms — you go there with intent. Encountering someone there is
  meaningful because neither of you is just passing through.
- **Living Room and Kitchen are the two gateways** into the common area
  (one per hallway wing). They're the "town square" spaces.

---

## Room Roster (17 rooms, up from 8)

### Existing rooms (kept, possibly reworked)

| ID | Name | Type | Wing | Notes |
|---|---|---|---|---|
| `bedroom_player` | Your Bedroom | bedroom | north | BR1 position. Dead-end off Hall A. |
| `bedroom_1` | Bedroom 1 | bedroom | south | BR2 position. Dead-end off Hall B. |
| `bedroom_2` | Bedroom 2 | bedroom | north | BR3 position. Dead-end off Hall A. |
| `bedroom_3` | Bedroom 3 | bedroom | south | BR4 position. Dead-end off Hall B. |
| `kitchen` | Kitchen | common | center-south | Connects to Dining, Laundry, Hall B. |
| `living_room` | Living Room | common | center-north | The social hub. 5 connections. |

### Existing rooms (split/reworked)

| ID | Name | Type | Wing | Notes |
|---|---|---|---|---|
| `hallway_a` | Hallway A | common | north | Split from single `hallway`. North wing. |
| `hallway_b` | Hallway B | common | south | Split from single `hallway`. South wing. |
| `bathroom_a` | Bathroom A | common | north | One full bath per wing. Dead-end off Hall A. |
| `bathroom_b` | Bathroom B | common | south | Dead-end off Hall B. |

### New rooms

| ID | Name | Type | Wing | Notes |
|---|---|---|---|---|
| `dining` | Dining Room | common | center | Gathering space for meals. Living↔Kitchen bridge. |
| `entry` | Entry / Foyer | common | north | Front door. Pass-through: Hall A↔Living. Deliveries land here. |
| `game_room` | Game Room | common | east | Pool table, console, board games. Living→Gym chain. |
| `gym` | Gym | common | east | Treadmill, weights, yoga mat. Dead-end off Game Room. |
| `study` | Study | common | west | Bookshelves, quiet desk. Dead-end off Living Room. |
| `balcony` | Balcony | common | south | Outdoor space. Dead-end off Living Room. |
| `laundry` | Laundry Room | common | west | Washer, dryer, hamper. Dead-end off Kitchen. |

### Rooms that cease to exist

| Old ID | Reason |
|---|---|
| `hallway` | Split into `hallway_a` and `hallway_b` |
| `bathroom` | Split into `bathroom_a` and `bathroom_b` |

---

## Adjacency Graph

This becomes a first-class CONFIG constant (`ROOM_ADJACENCY` in config.js),
promoted from its current home in drives.js where it's only used for peep
checks. Drives.js will import it from config.

```
hallway_a   → bedroom_player, bedroom_2, bathroom_a, entry
hallway_b   → bedroom_1, bedroom_3, bathroom_b, kitchen
entry       → hallway_a, living_room              (pass-through)
living_room → entry, dining, game_room, study, balcony
dining      → living_room, kitchen
kitchen     → dining, laundry, hallway_b
game_room   → living_room, gym
gym         → game_room                           (dead end)
study       → living_room                         (dead end)
balcony     → living_room                         (dead end)
laundry     → kitchen                             (dead end)
bathroom_a  → hallway_a                           (dead end)
bathroom_b  → hallway_b                           (dead end)
bedroom_*   → their hallway only                  (dead ends — private)
```

Key structural facts:
- Hallways connect to bedrooms, baths, and the common area gateway (Entry
  for A, Kitchen for B).
- Living Room has 5 connections — the most connected room. It's the true hub.
- Kitchen has 3 connections — the south gateway.
- Dining bridges Living and Kitchen — a transit corridor AND a gathering
  space.
- Entry is a pass-through (Hall A ↔ Living) — the only non-dead-end
  connector besides the main hub rooms.
- Every bedroom is a dead-end off its hallway. Privacy is physical.

---

## Economy: Luxury Penthouse Scaling

The apartment is a large, luxury space housing up to 8 people. Rent and
  income should feel proportional to "luxury penthouse" pricing. Full
  vocation/economy rework is a separate future task, but the numbers should
  be adjusted as part of this expansion so the new scale feels right:

- `ECONOMY.rent.total`: increase from $2,400 (was for 4BR) to reflect a
  luxury 4BR/2BA penthouse with amenities (gym, game room, balcony, study,
  dining room). Tentative: $6,000–8,000/month.
- `ECONOMY.startingMoney`: increase proportionally so the player isn't
  immediately drowning.
- NPC income bands (`OCCUPATION_POOL` incomeBand low/mid/high): the actual
  pay numbers in `JOB_DEFS` (defs.computer.js) should scale up so "high"
  income feels like it covers a $8k rent share among 4.
- These are placeholder adjustments — full economy rebalancing is deferred
  to the vocation/economy task. The goal here is "doesn't feel broken at
  first glance."

---

## Implementation Plan

### Phase 1: Config & Data — The Room Graph

**Goal:** Define all 17 rooms, their adjacency, and their object contents
in config. Nothing visual or mechanical changes yet — this is the data
foundation.

**Files:**
- `src/config.js` — expand `ROOMS` from 8→17 entries. Add `wing` field to
  each. Add `ROOM_ADJACENCY` as a first-class config constant (moved from
  drives.js). Add `COMMON_ROOMS`/`ALL_ROOMS` re-derivation (they already
  derive from `ROOMS`, so this is automatic — just verify). Add
  `APARTMENT_SCALE` config block for the luxury economy placeholders.
- `src/defs.world.js` — add new `OBJECT_DEFS` for new rooms (pool table,
  gaming console, weights/treadmill, washer/dryer, dining table, balcony
  railing, study desk, bookshelves for study). Move `laundry_hamper` from
  bathroom to laundry room. Move `doormat`/`coat_rack` from hallway to
  entry. Add `APARTMENT_LAYOUT` entries for all new rooms. Keep
  `bedroom_door` in bedrooms. Add `bathroom_door` to bathrooms (new —
  currently baths have no door object, needed for peeping/interruption
  logic with 2 baths).
- `src/drives.js` — remove the local `ROOM_ADJACENCY` / `isRoomAdjacent`
  definitions, import from config.js instead. `isRoomAdjacent` stays as a
  function but reads `ROOM_ADJACENCY` from the global scope.

**New object defs needed:**
- `pool_table` — game_room, affords inspect
- `game_console` — game_room, affords self.play_games (new action?)
- `dartboard` — game_room, affords inspect
- `treadmill` — gym, affords self.workout (new action)
- `weight_set` — gym, affords self.workout
- `yoga_mat` — gym, affords self.workout / self.relax
- `washer` — laundry, affords self.laundry (new action), container
- `dryer` — laundry, affords self.laundry, container
- `dining_table` — dining, affords self.eat (extension of existing)
- `balcony_railing` — balcony, affords inspect
- `study_desk` — study, affords inspect / self.work (extension)
- `bookshelf_study` — study, container (reuse bookshelf def? or separate)

**Save migration:**
- `world` folder version bump: `hallway` → `hallway_a`, `bathroom` →
  `bathroom_a` (or `bathroom_b` — need a heuristic). Actually, the rooms
  data in kv is keyed by room ID. Old saves have `world.rooms.hallway` and
  `world.rooms.bathroom`. The migration needs to: create `hallway_a`/
  `hallway_b` from the old `hallway` (split cleanliness, create both),
  create `bathroom_a`/`bathroom_b` from old `bathroom`, delete old keys.
  Object buckets similarly: `room_hallway` → `room_hallway_a` +
  `room_hallway_b`, `room_bathroom` → `room_bathroom_a` + `room_bathroom_b`.
  New rooms (`dining`, `entry`, `game_room`, `gym`, `study`, `balcony`,
  `laundry`) are lazily spawned by `ensureObjectsForBucket` on first load,
  so they don't need explicit migration — they just appear.
- `FOLDER_VERSIONS.world` bump 2→3. `FOLDER_VERSIONS.objects` bump 1→2.
- New migration functions in `MIGRATIONS.world` and `MIGRATIONS.objects`.

**Verification:**
- `ROOMS` has 17 entries. `ALL_ROOMS` length is 17. `COMMON_ROOMS`
  excludes the 4 bedrooms.
- `ROOM_ADJACENCY` is symmetric (if A lists B, B lists A) — add a
  self-check.
- `APARTMENT_LAYOUT` has an entry for every room ID.
- `OBJECT_DEFS` has every defId referenced by `APARTMENT_LAYOUT`.
- New game spawn (`spawnObjectsForNewGame`) creates buckets for all 17
  rooms + carry buckets.
- Old save loads without error; old hallway/bathroom data migrates; new
  rooms lazily spawn.

---

### Phase 2: Floor Plan Visual

**Goal:** Replace the flat sidebar room list with a 2D floor-plan map.
Show rooms as positioned boxes connected by doorways, with the player's
position highlighted, NPC presence dots, and door lock states. Clicking an
adjacent room moves there; non-adjacent rooms are visually dimmed and
non-interactive.

**Approach — SVG floor plan rendered in the left sidebar:**
- A `<svg>` element replaces `#room-list`. Each room is a `<rect>` with a
  `<text>` label, positioned according to a coordinate map (see below).
  Doorways are `<line>` or `<path>` connectors between adjacent rooms. The
  player's current room has a highlight border/fill. Adjacent rooms have a
  subtle highlight (clickable). Non-adjacent rooms are dimmed.
  NPC presence dots rendered as `<circle>` elements inside each room rect.
- The map is compact (fits in ~220px wide sidebar) but legible. It's a
  schematic, not to scale — rooms are roughly sized by importance (living
  room and kitchen are largest, hallway/bath smallest).
- On mobile, the map stays in the left sidebar drawer (already
  slide-out on mobile via existing `#sidebar-left[data-open]`).

**Room coordinates (schematic, in SVG viewBox units):**
```
            ┌────────┐  ┌────────┐  ┌────────┐
            │  BR1   │──│ Hall A │──│  BR3   │
            └────────┘  └───┬────┘  └────────┘
                            │
                        ┌───┴────┐
                        │ Bath A │
                        └───┬────┘
            ┌───────┐  ┌───┴────┐  ┌────────┐  ┌─────┐
            │ Entry │──│ Living │──│ Game Rm │──│ Gym │
            └───────┘  └───┬┴──┘  └────────┘  └─────┘
                     ┌────┘└──┐
                  ┌──┴──┐  ┌──┴──────┐
                  │Study│  │ Balcony │
                  └─────┘  └─────────┘
                        ┌───┴────┐
                        │ Dining │
                        └───┬────┘
                     ┌──────┴───┐  ┌────────┐
                     │ Kitchen │──│ Laundry│
                     └──────┬───┘  └────────┘
                            │
                        ┌───┴────┐
                        │ Hall B │
                        └──┬─┬──┘
                   ┌────┘  │  └────┐
              ┌────┴────┐ ┌┴────┐ ┌┴──────┐
              │ Bath B  │ │ BR2 │ │  BR4  │
              └────────┘ └─────┘ └───────┘
```

(Specific x/y/w/h values will be worked out during implementation — the
above is the conceptual arrangement. Each room gets a position in a
coordinate system sized to the sidebar.)

**Files:**
- `src/render.js` — new `renderFloorPlan(gs)` function replacing
  `renderRoomList(gs)`. Renders the SVG. Called from the main `render()`
  function where `renderRoomList` was called.
- `src/config.js` — `ROOM_LAYOUT` map: `{ roomId: { x, y, w, h } }`
  positions for the schematic. Or this could live in a new
  `src/render.floorplan.js` file — decide during implementation.
- `index.html` — CSS for the floor plan container (the SVG itself is
  JS-generated). Replace `#room-list` div with `#floor-plan` div. Keep
  the `<template id="tpl-room-item">` for potential fallback or remove it.
- The existing room-item click handler in `ui.js` (delegated click on
  `#room-list`) needs to be reworked to handle clicks on SVG room rects
  instead.

**Interaction:**
- Click an adjacent room → `doMove(roomId)` (existing function, will be
  gated in Phase 3).
- Click current room → no-op (or center the scene on it, already the case).
- Click non-adjacent room → brief "you can't get there from here"
  indication (dim pulse or tooltip).
- Hover any room → tooltip with room name + occupant count.

**Verification:**
- Floor plan renders with all 17 rooms visible.
- Player's current room is highlighted.
- Only adjacent rooms are clickable; non-adjacent rooms are visually
  distinct (dimmed).
- NPC presence dots show correctly (derived from `npc.location`).
- Moving to an adjacent room updates the highlight.
- Mobile: floor plan works in the slide-out drawer.

---

### Phase 3: Gated Movement & Transit Encounters

**Goal:** Enforce adjacency: the player can only move to rooms connected to
their current room. Multi-step journeys become real. Walking through a room
you're just passing through can trigger a transit encounter with an NPC.

**Changes to `doMove` (ui.js):**
- Check `isRoomAdjacent(currentRoom, targetRoom)`. If not adjacent, block
  the move with a narration: "You can't get there directly — you'd have to
  go through the [intermediate room]."
- For adjacent moves, the move proceeds as before: set `player.location`,
  run `resolveRoomEntryStealth`, `advanceAndResolve(1)`, recompute scene.
- **Transit encounter check:** after moving to a room that the player is
  just passing through (heuristic: the player made another move within a
  short time window, or the player moved to a room but took no action
  there before moving again — OR simpler: any move through a common room
  has a chance to surface an NPC who's present as a passing encounter).
  The encounter is lighter than a full scene entry: a brief narration line
  ("As you pass through the hallway, [NPC] is coming the other way.") rather
  than a full LLM scene. If the player stops and takes an action, the
  normal scene-entry flow takes over.

**Transit encounter design (not fully spec'd — needs playtesting):**
- When entering a room with present NPCs, instead of always firing the
  full LLM "you walk into the room" scene, there's a distinction:
  - **Stopping** (player takes an action in the room): full scene entry
    with LLM narration, as now.
  - **Passing through** (player moves again within ~1 tick without
    taking an action): light narration only, no LLM call. Just a
    deterministic line acknowledging the NPC's presence.
- This distinction may be as simple as: the first move into a room with
  NPCs gets the LLM scene (as now), but if the player immediately moves
  again, the next room entry is lighter. Or: transit rooms (hallways,
  dining, entry) always use light narration, destination rooms use full
  scenes. Decide during implementation based on what feels right.

**Time cost question (needs user input):**
- Currently every move costs 1 tick (30 min). With multi-step journeys,
  crossing the apartment could cost 3-4 ticks (1.5–2 hours).
- Option A: keep 1 tick per move. Crossing the full apartment is ~4 ticks
  (2 hours). This makes the apartment feel large and makes you think about
  where you go. But it might feel tedious for simple tasks.
- Option B: transit through a room you don't stop in costs 0 ticks (free
  pass-through), only the final destination costs 1 tick. This makes
  movement feel fluid but reduces the "apartment is big" feeling.
- Option C: differentiated cost — hallways/entry/dining are "transit" rooms
  (free or 0.5 tick), everything else is 1 tick. Hybrid approach.
- **Recommendation:** Start with Option A (1 tick per move, simple and
  consistent). Adjust if it feels tedious during playtesting. The time
  dilation system (continuous clock) already makes tick-costs feel less
  granular than the old 30-min jumps.

**Files:**
- `src/ui.js` — `doMove(roomId)`: add adjacency check, add transit
  encounter logic. The function currently lives around line 1138.
- `src/intent.js` — `classifyIntent`'s movement matching (`matchRoomIntent`)
  should only match adjacent rooms, or should indicate that a multi-step
  path is needed. For now: if the player types "go to the kitchen" from
  their bedroom, match it and let `doMove` handle the adjacency block with
  a helpful narration. Later: could auto-route (find shortest path and
  walk the player through each step automatically).
- `src/render.js` — floor plan click handling already ensures only
  adjacent rooms are clickable (Phase 2), so the adjacency gate is
  visually enforced. The intent path is a secondary input method that
  also needs the gate.

**Verification:**
- Cannot move to non-adjacent room via floor plan click (not clickable).
- Cannot move to non-adjacent room via free text (gets narration block).
- Moving to adjacent room works as before (stealth check, tick advance,
  scene entry).
- Transit encounters fire when passing through rooms with NPCs.

---

### Phase 4: NPC Pathfinding

**Goal:** NPCs move through the apartment following the adjacency graph
instead of teleporting. When an NPC's schedule says "go to the kitchen,"
they walk through their hallway → common area → kitchen, potentially
passing the player en route.

**Current NPC movement:**
- `resolveRoomForActivity` (sim.js:197) picks a target common room for the
  NPC's current activity block. The NPC's `location` is then set directly
  to that room — a teleport. There's no path, no intermediate rooms.
- `moveToRoom` (sim.js:507) sets `npc.location` directly. Used for
  residency changes (move-in), not tick-by-tick movement.
- NPC drives' `moveToCommon` flag (drives.js) signals "want to be in a
  common room" but the actual location is set during `resolveTick`.

**New pathfinding approach:**
- When `resolveRoomForActivity` picks a target room different from the
  NPC's current location, compute a path through the adjacency graph
  (BFS shortest path — the graph is tiny, 17 nodes, so this is trivial).
- The NPC moves one step along the path per tick (or per checkpoint).
  Their `location` updates to the intermediate room, not just the
  destination. This means the NPC is *physically in the hallway* during
  transit, and the player can encounter them there.
- NPC `activity` during transit could be "walking" or "heading to the
  kitchen" — a new transient activity state. Or simpler: the NPC's
  activity stays as their target-block activity, but their location is the
  intermediate room. The scene system already shows "present" NPCs
  regardless of activity, so the player would see them in the hallway.

**Pathfinding function:**
```js
function findPath(fromRoom, toRoom, adjacency) {
  // BFS — graph is tiny (17 nodes), no need for A*
  // Returns array of room IDs [fromRoom, ..., toRoom]
  // Returns null if no path (shouldn't happen — graph is connected)
}
```

**NPC transit behavior:**
- During transit, the NPC is "in" the intermediate room. If the player
  is also there, it's an encounter (handled by existing scene system).
- NPCs in transit don't perform their target activity (you can't cook
  while walking through the hallway). Their activity is transient.
- Transit takes 1 tick per step (matching player movement cost). An NPC
  going from BR2 to the Kitchen (BR2 → Hall B → Kitchen = 2 steps) takes
  2 ticks. During those ticks they're in Hall B, then Kitchen.
- This means NPC movement is no longer instant — it takes time, and
  during that time they're visible in intermediate rooms. This is the
  whole point: the apartment feels alive because you see people moving.

**Schedule/resolveTick changes:**
- `resolveRoomForActivity` currently returns a single target room. It
  needs to work with a per-NPC "current path" and "path progress" state.
- New NPC fields (on the mutable NPC object, not the bible):
  - `npc.transit = { path: [...], progress: 0, destination: roomId }`
  - When transit is in progress, `resolveTick` advances the NPC one step
    along the path instead of picking a new target.
  - When transit completes, the NPC arrives and starts their activity.
- `resolveRoomForActivity` returns the target room as before; a new
  wrapper function checks if the NPC is already there. If not, it starts
  transit. If yes, the NPC does their activity.

**Interaction with existing systems:**
- `getPresentNpcIds` (sim.js:170) already reads `npc.location` live —
  transit NPCs show up in intermediate rooms automatically.
- `getSceneParticipants` (sim.js:546) picks up transit NPCs in the
  player's room — they'd appear as present/active, which is correct (you
  see them walking through).
- Drives that fire based on location (e.g., `reactToPlayer`) would fire
  during transit if the player is in the same intermediate room. This is
  desirable — the NPC reacts to bumping into you.
- NPC-to-NPC social (drives.js `chat_with_roommate`) fires when two NPCs
  share a location. With pathfinding, NPCs pass each other in hallways,
  creating natural NPC-to-NPC encounters too.

**Files:**
- `src/sim.js` — `findPath()`, modify `resolveRoomForActivity` to return
  target only, new `resolveNpcTransit` or inline transit logic in
  `resolveTick`. New `npc.transit` field.
- `src/config.js` — `CHARACTER_SCHEMA.mutable` gains `transit` field
  (optional, nullable).
- `src/state.js` — save/load `npc.transit` (it's part of the npc object,
  so it saves/loads automatically — just verify).
- `src/render.js` — NPC activity display might show "walking to the
  kitchen" instead of the target activity when in transit.

**Verification:**
- NPC going from bedroom to kitchen passes through their hallway.
- Player in the hallway sees the NPC pass through.
- NPC arrives at destination after correct number of ticks.
- NPC in transit doesn't perform target-block activities.
- Path finding returns correct shortest paths.
- Existing drive behavior (react to player, NPC chat) fires during
  transit encounters.

---

### Phase 5: Room Content & Activities

**Goal:** Populate the new rooms with meaningful activities. NPCs use the
new rooms in their schedules. The new objects have actions. The apartment
feels fully lived-in across all 17 rooms.

**New actions (defs.actions.js):**
- `self.workout` — source: gym (treadmill, weight_set, yoga_mat). Effects:
  energy cost, mood boost, hygiene cost (sweat), fitness skill XP.
  Requires: in gym, has gym equipment.
- `self.play_games` — source: game_room (game_console, pool_table).
  Effects: mood boost, small energy cost, social skill XP if NPC present.
  Requires: in game_room.
- `self.laundry` — source: laundry (washer). Effects: empties hamper,
  fills washer, costs time. Requires: in laundry, hamper not empty.
- `self.study` — source: study (study_desk). Effects: focus skill XP,
  mood boost (if high openness), can work remotely (income). Requires:
  in study.
- `self.eat` extension — `dining` room becomes a valid `self.eat` source
  room (currently only kitchen/living room). Eating at the dining table
  with others present gives a social bonus.

**Activity tables (config.js):**
- `ACTIVITY_TABLES` needs entries that send NPCs to the new rooms:
  - `gaming` → game_room
  - `working out` → gym
  - `reading` → study (or living_room bookshelf)
  - `eating` → dining (during morning/evening blocks)
  - `doing laundry` → laundry
  - `stepping outside` → balcony (smoking, fresh air, phone calls)
- `resolveRoomForActivity` needs to be aware of room types — some
  activities should prefer specific rooms (working out → gym, not
  living room). This is currently a random pick among all common rooms
  with crowd avoidance. Needs to become activity-aware: map activity →
  preferred room, fall back to crowd-avoidance pick.

**NPC schedule updates:**
- `SCHEDULES` templates can stay as-is (they're time-block based, not
  room-based). But the activity tables that map blocks to activities
  should include the new activities, and `resolveRoomForActivity` should
  route NPCs to the right rooms for those activities.
- NPCs with fitness interest should prefer the gym during leisure.
- NPCs who cook should use the dining room for eating.
- Some NPCs should retreat to the study for quiet work/reading.
- The balcony is a mood-recovery space — low-weight but available during
  leisure/wind_down/evening blocks.

**Image prompts (image.js):**
- `buildImagePrompt` already takes `roomObjects` and builds a detail
  phrase. New rooms get their objects from `APARTMENT_LAYOUT` and the
  image prompt will naturally include them. No change to the image
  system itself — just ensure new rooms' `imagePhrase` properties on
  their objects are good.
- New rooms may need a `fallbackRoomPhrase` (the per-roomType string
  used when no objects are passed) — currently only the old 8 room
  types have these.

**Files:**
- `src/defs.actions.js` — new action defs (workout, play_games, laundry,
  study, eat-at-dining).
- `src/actions.js` — new requirement checkers if needed (in_gym,
  in_game_room, etc. — or reuse existing `roomIs` checker).
- `src/config.js` — update `ACTIVITY_TABLES` with new activities and
  room preferences. New `ACTION_TUNING` entries for the new actions.
- `src/sim.js` — `resolveRoomForActivity` becomes activity-aware
  (activity → preferred room, with crowd-avoidance fallback).
- `src/render.js` — action chips for new actions appear in the right
  rooms. `renderActionChips` already queries `resolveAvailableActions`
  which reads `ACTION_DEFS` source rooms.
- `src/image.js` — add `fallbackRoomPhrase` for new room types.

**Verification:**
- New action chips appear in the right rooms.
- Actions work mechanically (effects applied, time advanced).
- NPCs visit new rooms during their schedules (gym, game room, study,
  dining, balcony, laundry).
- NPC activities match their locations (no one "working out" in the
  kitchen).
- Scene images for new rooms show the right objects.

---

### Phase 6: Integration, Polish & Economy

**Goal:** Wire everything together, adjust the economy for the luxury
penthouse scale, and polish the experience.

**Economy adjustments:**
- `ECONOMY.rent.total` → luxury penthouse pricing (~$6,000–8,000).
- `ECONOMY.startingMoney` → proportional increase.
- `JOB_DEFS` pay rates → scale up so income bands feel right for the
  new rent level.
- `ECONOMY.rentLatePenaltyMood` / `rentLateTensionPerDay` → possibly
  scale with the new rent magnitude.
- These are placeholder adjustments — full economy rebalancing is a
  separate future task.

**Door system expansion:**
- Add `bathroom_door` objects to both bathrooms (currently only bedrooms
  have doors). This is needed for the peeping and interruption systems
  to work correctly with 2 bathrooms — you peep through a bathroom door,
  and locking a bathroom door reduces walk-in probability.
- `bedroom_door` already exists and works. `bathroom_door` is a new def
  with the same states (`lock: ['unlocked', 'locked']`).
- Lock/unlock actions (`self.lock_door`, `self.unlock_door`) should work
  for bathroom doors too (extend the requirement checker to check for
  any door object, not just `bedroom_door`).

**Balcony special handling:**
- The balcony is "outside" — it might have different time/lighting
  behavior. Consider: balcony scenes get a daytime/nighttime sky in the
  image prompt. NPCs on the balcony are "getting air" — a mood recovery
  activity. The balcony could be a prime location for intimate
  conversations (low NPC traffic, private feel).
- Smoking on the balcony: an NPC trait or activity. If an NPC smokes,
  they retreat to the balcony periodically. The player might find
  cigarette butts (evidence object) or smell smoke (narration detail).
  This is flavor, not a mechanical system — defer if scope is tight.

**Entry/foyer special handling:**
- Deliveries (Nile orders) land at the Entry, not the old hallway. The
  delivery system (`world.deliveries`) and the "pickup delivery" action
  need to point to the entry room. Update the delivery notification and
  pickup location.
- Guests arriving (if/when guest system exists) arrive through the entry.

**Polish:**
- Floor plan visual: door states shown on the map (locked = lock icon,
  open = open doorway). NPC dots colored by activity (sleeping = dim,
  active = bright). Current room clearly highlighted. Hover tooltips.
- Transit narration: varied lines for passing through rooms ("You cut
  through the dining room," "The hallway is quiet as you pass through").
- New room scene images: ensure the image generation prompts produce
  good results for all 17 rooms. Test with vision tool.
- Mobile: floor plan usable at phone widths. May need a simplified
  layout or scrollable map on very small screens.

**Files:**
- `src/config.js` — economy adjustments, any new tuning constants.
- `src/defs.world.js` — `bathroom_door` def. Add to both bathroom
  layouts.
- `src/defs.actions.js` — extend lock/unlock to work with bathroom doors.
- `src/ui.js` — delivery pickup location update.
- `src/render.js` — floor plan polish, door state visualization.
- `src/image.js` — balcony/entry special prompt handling.

**Verification:**
- Economy numbers feel proportional (rent, income, starting money).
- Bathroom doors work for lock/unlock and peeping.
- Deliveries land at the entry.
- Floor plan shows door states.
- All 17 rooms have good scene images.
- Full playtest: start a new game, navigate the apartment, visit every
  room, interact with every new action, observe NPC movement through
  the graph.

---

## Status

| Phase | Status | What it does | Notes |
|---|---|---|---|
| 1 | **Done** | Config & data — room graph, object defs, adjacency, save migration | 17 rooms, 46 object defs, economy scaled. All verified. |
| 2 | **Done** | Floor plan visual — SVG map replacing the flat room list | 17 rooms, 16 connectors, NPC dots, door lock icons, adjacency highlighting. |
| 3 | **Done** | Gated movement & transit encounters — adjacency enforcement | doMove blocks non-adjacent moves with path hint. Floor plan disables distant room clicks. Free-text moves also gated. |
| 4 | **Done** | NPC pathfinding — NPCs walk through the graph | BFS findPath, NPC transit state, one step per tick, visible in intermediate rooms. |
| 5 | **Done** | Room content & activities — new actions, NPC schedule routing | 4 new actions (workout, play_games, laundry, study), eat extended to dining, relax extended to study/balcony. ACTIVITY_ROOM_PREFERENCES routes NPCs by activity string. |
| 6 | **Done** | Integration, polish & economy — deliveries, economy, doors | Deliveries land at entry (was hallway). Economy scaled in Phase 1. Door system expanded in Phase 1. All 17 rooms have fallbackRoomPhrase. |

## Dependency order

```
Phase 1 (config/data) ──► Phase 2 (visual)
                     ──► Phase 3 (gated movement) ──► Phase 4 (NPC pathfinding)
                                                ──► Phase 5 (content/activities)
                                                                     ──► Phase 6 (polish)
```

Phase 2 can start as soon as Phase 1's `ROOMS`/`ROOM_ADJACENCY` are defined
(the visual just needs the data). Phase 3 needs Phase 1 (adjacency) but
not Phase 2 (can gate movement even with the old flat list). Phase 4 needs
Phase 1 + 3. Phase 5 needs Phase 1 (new rooms/objects) but is independent
of 2/3/4 mechanically. Phase 6 needs everything.

In practice: **1 → 2 → 3 → 4 → 5 → 6** is the natural build order.

---

## Key design decisions (resolved during planning)

1. **Dining is a separate room** between Living and Kitchen — a gathering
   space, not a kitchen annex. ✓ (user approved)
2. **Entry is a pass-through** (Hall A ↔ Living) — deliveries and arriving
   guests cross paths with anyone lounging. ✓ (user approved)
3. **Study is a dead-end** off the Living Room — walls of books, quiet desk. ✓ (user approved)
4. **No powder room** — two full baths (one per wing) is enough for 8 people. ✓ (user approved)
5. **Gym is a dead-end off the Game Room** — recreation wing feel. ✓ (user approved)
6. **2D schematic floor plan** (option A from discussion), not 3D or
   node-graph. The apartment is a large rectangle, mirrored H layout. ✓
7. **Hallways split into two** (north/south) with a bathroom each. ✓
8. **Luxury penthouse economy** — rent and income scale up proportionally.
   Full vocation/economy rework deferred to a separate task.

## Key design decisions (to resolve during implementation)

1. **Transit encounter mechanics** — how to distinguish "passing through"
   from "arriving" (Phase 3). Needs playtesting.
2. **Time cost per move** — start with 1 tick per move (Option A), adjust
   if tedious. The continuous clock makes this less granular than the old
   30-min tick system.
3. **NPC transit activity label** — what to show as the NPC's activity
   while walking ("walking to the kitchen" vs. target activity). Phase 4.
4. **Activity → room routing** — how `resolveRoomForActivity` maps
   activities to preferred rooms with crowd-avoidance fallback. Phase 5.
5. **Balcony as special space** — whether to give it unique
   lighting/time-of-day handling in image prompts. Phase 6.
6. **Bathroom door peeping** — whether the player can peep into bathrooms
   (the system is symmetric; just need to add bathroom doors as peepable).
   Phase 6, or defer to the adult-content task.

---

## Impact on existing systems (reference)

- **Peeping** (drives.js `tryNpcPeep`, config `PEEP_TUNING`): `isRoomAdjacent`
  already gates NPC→player peeping. Player→NPC peeping (currently only via
  the peep action when in the hallway outside a bedroom/bathroom) needs
  `bathroom_door` objects added to bathrooms. The adjacency graph expansion
  means more rooms are "adjacent to a bedroom" (both hallways, not just
  one) — peeping opportunities increase naturally.
- **Interruption** (interruption.js, config `INTERRUPTION`): door state
  multipliers already work. Two hallways mean more transit paths, more
  chances for someone to walk by. Bathroom doors add bathroom interruption
  scenarios.
- **Stealth** (stealth.js): `resolveRoomEntryStealth` fires on room entry.
  With gated movement, entering a bedroom still triggers the same check.
  The hallway as a chokepoint means more potential witnesses.
- **NPC autonomy** (drives.js): drives that check location (reactToPlayer,
  chat_with_roommate, clean_common) work automatically with new rooms
  since they read `npc.location` live. `moveToCommon` needs to route
  through the graph (Phase 4). `clean_common` should clean whichever room
  the NPC is in, including new common rooms.
- **Scene images** (image.js): `buildImagePrompt` takes roomObjects — new
  rooms get their objects from `APARTMENT_LAYOUT`. Needs
  `fallbackRoomPhrase` for new room types.
- **Intent classification** (intent.js): `matchRoomIntent` matches room
  names — new rooms are automatically matched since it iterates `ALL_ROOMS`.
  Needs adjacency gate (Phase 3).
- **Quest system** (config.js `QUEST_CHAINS`): "cook dinner for the house"
  → dining room is now the place this happens. "Watch TV together" →
  living room. Quest chains should be updated to reference the right rooms.
- **Save migration** (state.js): `world` and `objects` folder version
  bumps. Old `hallway`/`bathroom` rooms split into two. New rooms lazily
  spawned.
