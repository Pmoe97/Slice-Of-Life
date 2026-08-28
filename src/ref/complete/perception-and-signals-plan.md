# Perception & Signals

Status: **complete** — all five phases implemented and verified, 2026-08-10.
171 assertions pass across `dev/verify/verify-s1..s5.js`; 322 across both
plans.
Last updated 2026-08-10.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 1 of six and the substrate Plans 2–5 all consume).
- `src/ref/complete/npc-correctness-fixes-plan.md` (Plan 0 — **complete**; this plan builds on a working relationship and memory layer).
- `src/ref/complete/apartment-expansion-plan.md` (owns `ROOM_ADJACENCY`, which the propagation model walks).
- `src/ref/complete/inventory-needs-menu-saves-plan.md` (owns spoilage and `room.odor`, which Phase 2 subsumes into the signal model).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** nothing — this plan is **complete**. The substrate every later
roadmap plan consumes is in place. Next up: roadmap **Plan 2 (scene reader)**
and **Plan 3 (NPC cognition)**, which both depend only on this plan and are
independent of each other.

**Phase 5 notes (2026-08-10):**
- `evaluateDrives` now calls `perceiveSignals(gameState, npcId, location)` once
  per NPC per tick and threads the result through every gate. A harness
  assertion counts `function perceiveSignals` definitions across the tree and
  fails if there is ever more than one — the moment there are two, NPCs start
  sensing a subtly different world than the player.
- Gates take `{ signal, op, threshold }` alongside `{ need, ... }`, and
  `signal` may be a list (strongest of the list wins), so "any visible mess" is
  one gate rather than three. An unperceived signal reads as **0**, not as a
  hard failure — a smell you cannot detect is, to you, no smell.
- `investigate_smell` is the proof: an NPC who can smell rot walks to the
  source room, and on the following tick clears the offending container. It
  needs a custom resolver (like peep/snoop/eat/gift) because acting on a smell
  requires the `sourceRoomId`/`sourceId` the perceived record carries, and the
  generic weight roll has neither. **Verified unprompted through two simulated
  days**: noticed at 17:30, tracked, binned at 19:00.
- It targets the offending container only, rather than reusing
  `cleanRoomObjects` — following your nose to a bad smell is not a deep clean.
  Asserted: dirty dishes in the same room are left alone.
- `clean_common` is gated on visibly perceiving mess and its weight rose
  0.08 → 0.35. Sight does not propagate, so it can only fire in the room whose
  mess the NPC is standing in — which is also the room it cleans. NPCs no
  longer tidy rooms that were already clean.
- `assembleContext` carries each active NPC's own perceived list (prose
  pre-resolved, same division as the scene line) and `buildNpcBlockV2` prints
  it as `[Senses]`. A roommate remarking on a smell the player walked past is
  the first moment this layer is visible in fiction rather than in mechanics.
- Cost: **0.21ms per tick** for a three-resident household with perception on
  every drive evaluation. No concern.

**Phase 4 notes (2026-08-10):**
- Notes work end to end: written by the player on any object flagged
  `surfaces: true` (fridge, both door types, dining table), seen only from
  inside the room, read as narration, binned once read.
- **The read-collapse needed no code.** `emits: { read: { unread: 0.9, read:
  0.3 } }` on the object def IS the whole mechanism, and a harness assertion
  greps `signals.js` to prove it contains no mention of notes at all. This is
  the standing-signal model (D1) paying off exactly as designed.
- **`readIntensity` had to rise from the planned 0.2 to 0.3.** Measured: 0.2
  against an average attention of 0.30 gives 0.06, under the 0.08 sight floor,
  so a read note vanished completely rather than becoming background. The
  intent is "stops shouting", not "ceases to exist".
- **`meta` is new on every object instance**, defaulting to `null` — the same
  additive shape `evidence` already uses. `spawnNote` is its only writer.
- **Found and fixed a latent id-collision bug.** Every runtime spawn path used
  `Object.keys(bucketMap).length` as the `genObjectId` slot, which repeats the
  moment anything is removed from a bucket and hands the new object an id that
  silently OVERWRITES an existing one. Harmless for the one-off hobby
  placements that path was written for; not harmless for notes, which churn.
  `uniqueObjectSlot` (WORLD) walks to the first free slot, and
  `applySpawnObject` now uses it too rather than leaving two behaviours.
- **`DESTROY_OBJECT` is new** — the counterpart to `SPAWN_OBJECT`, needed for
  binning. Trusted-only (`llm: false`) for the same reason: the narrator does
  not get to delete the furniture. Reach-checked regardless, asserted.
- Deviation: the plan said `self.take_note`. Shipped `self.bin_note` instead —
  taking a note into inventory needs an ITEM_DEFS counterpart and an
  object/item duality for no real gain, where binning is the verb the fiction
  actually wants. Binning is gated on having read it first, so a note can
  never be thrown away unseen.
- Writing is a UI-level chip + modal rather than an ACTION_DEFS entry, because
  it needs free text and the effects pipeline has nowhere to put a text box.
  Reading and binning ARE ordinary object-sourced actions.
- `NOTE_TEMPLATES` is authored and **has no writer yet** — the NPC side is
  roadmap Plan 5 (an NPC with an unresolved grievance leaves one instead of
  waiting to be clicked). Declared with that consumer named, which is the one
  R8 exception the roadmap permits. Same for `meta.addressedTo`, reserved for
  Plan 2's "is this note yours to read" question.

**Phase 3 notes (2026-08-10):**
- Eight transient signals ship, all with real emitters: `footsteps`, `voices`,
  `door_close`, `running_water`, `machine_running`, `cooking`, `smoke`,
  `breakage`. A def is transient iff it declares `decayPerTick`; the harness
  asserts every def is unambiguously one kind or the other.
- **`SIGNAL_TUNING.transientCap` did not exist.** The plan specified it and the
  Phase 1 config never included it, so `while (list.length >
  SIGNAL_TUNING.transientCap)` compared against `undefined` and the ring buffer
  silently never trimmed — 501 records survived a 500-emission loop. Added, and
  now asserted.
- **Footsteps needed to be louder than the plan assumed.** At the first value
  (0.5) someone striding past a closed bedroom door arrived at 0.034 against a
  0.04 sound floor — the headline case of the whole plan, failing by a hair.
  Raised to 0.7 transit / 0.45 arrive. The GAP between those two is load-
  bearing: someone passing through is heard through a closed door, someone
  merely arriving next door is not, which is what makes footsteps informative
  rather than constant background noise. Both are asserted.
- **Reads stay pure, writes prune.** `liveTransients` filters without touching
  state (so `perceiveSignals` remains byte-identical-safe, which Phase 1
  asserts); `pruneTransients` actually drops faded records and only runs from
  `emitTransient`. A week-old footstep is invisible to a read immediately and
  physically removed at the next write.
- Emission is declarative and shared: `emitsSignal: { signal, intensity }` on a
  DRIVE_DEFS *or* ACTION_DEFS entry. The shower drive and `self.shower` emit
  the identical signal at the identical intensity — asserted — so an NPC and
  the player doing the same thing sound the same. That equivalence is what
  Plan 3 needs to react to the player without a bespoke check per case.
- `EVENT_SIGNALS` maps off-screen event types onto signals, so `breakage` and
  `burnt_food` became things the household can hear and smell rather than log
  lines. Events with no entry are silent, which is most of them.
- **Observation for Plan 3, not a bug here:** a day heard from the living room
  is almost entirely footsteps, because `resolveRoomForActivity` re-rolls an
  NPC's activity and room EVERY tick, so they wander constantly. Phase 3 only
  made an existing problem audible. Committed multi-tick intents (Plan 3) are
  the fix; do not paper over it by muting the emitter.
- Harness scoping: `verify-s1`/`s2`'s "no orphaned signal" checks are now
  explicitly scoped to STANDING signals, and `verify-s3` owns the transient
  half. Each harness checks its own phase's contract rather than three copies
  of one enumeration.

**Phase 2 notes (2026-08-10):**
- All 24 `dirtyWhen`-carrying objects now emit; four new signals joined the
  four from Phase 1 (`bathroom_grime`, `unmade_bed`, `clutter`,
  `stagnant_water`). A harness assertion fails if a dirty object ever ships
  without an `emits` table.
- **`EMITS_ROT` is a shared constant, not fifteen copies.** Every food-holding
  container carries the identical `rotten_food: 'rotten'` state and it always
  means the same thing to the nose, so the intensity of rot lives in one
  place. 14 defs spread it.
- **`room.odor` is fully gone** — both writers, the reader in
  `resolveMoodTarget`, the room-shell field, and the scene-prompt line. A
  `world` 3->4 migration strips the key. The mood penalty now scales with the
  strongest smell the player can actually perceive, so a faint whiff and an
  unlivable stench no longer cost the same, and the smell follows you into the
  hallway instead of ceasing to exist at the doorway.
- **The scene prompt's sensory line is composed upstream.**
  `assembleContext` resolves each signal's prose (it has `gameState` in scope)
  and `buildSensoryLine` reads `rec.phrase` — the same reason `getRecentEvents`
  resolves event text there rather than handing `llm.js` a raw template. Prompt
  builders stay pure functions of their context.
- **A fresh apartment is NOT silent, and that is correct.** The swimming pool
  defaults to `clarity: 'green'`, so day one opens with a real smell coming off
  the neglected recreation wing. A Phase 1 assertion asserting global silence
  had to be corrected — it was written before the pool had an emitter.
- **`swimming_pool.water: 'filled'` is an unreachable state.** The def's own
  comment says it becomes `'filled'` once the pool systems facility is
  repaired; nothing in the codebase ever sets it. Same class of dead state as
  the shower's `power: 'on'` found in Phase 1. `stagnant_water` is therefore
  keyed on `clarity` alone, which is also the truthful reading — an abandoned
  pool is not bone dry.
- **`emits` cannot express a conjunction** of two state keys (`green` AND
  `filled`). It did not need to here, and a `when:` guard was deliberately NOT
  added — an unused mechanism is the same R8 sin as an unread field. Add it
  with its first real consumer.

**Phase 1 notes (2026-08-10):**
- Landed in full. `src/srcfiles/signals.js` is new and loads after `world.js`.
  All of Plan 0's 151 assertions still pass, so nothing regressed.
- **`running_water` moved out of Phase 1 into Phase 3, and it was right to.**
  It cannot be a standing signal: the `shower` object has a `power` state, but
  **nothing in the codebase ever sets it to `'on'`** — so a signal derived from
  it would have been unreachable, which is exactly the dead-emitter mistake RI1
  exists to catch. A running shower is a moment, not a persistent world fact,
  so it belongs with the transients. Phase 1 ships four standing signals with
  genuinely reachable emitters instead: `rot`, `stale_laundry`, `grease`,
  `dirty_dishes` (smell ×3, sight ×1).
- **Door multipliers are PER CHANNEL, not one number (deviation from D6).**
  Measured, not assumed: a flat 0.35 made a running shower inaudible from the
  hallway directly outside the bathroom — the example the plan's own thesis
  opens with — while simultaneously letting sight leak through a closed door.
  A door blocks sight outright, muffles sound, and barely troubles smell, which
  goes under it. `SIGNAL_TUNING.doorMultiplier` is now `{channel: {unlocked,
  locked}}`.
- **D6's `{open, closed, locked}` was aspirational.** Door objects only carry
  `lock: ['unlocked','locked']`; nothing models a door standing open. The
  tuning table is keyed to the two states that exist. When doors gain an open
  state, add the key *with* its reader.
- **`roomDoorFactor` must not reuse `getDoorState`.** That returns `'unlocked'`
  for a room with no door at all, which would have muffled every hallway hop as
  though a door were standing there. `signals.js` checks for the door object
  explicitly and returns 1 when there isn't one. Asserted.
- **Propagation is a relaxation to a fixed point, not a hop-count BFS.** Door
  factors mean the fewest-hops path is not always the strongest — a longer way
  round through open space can beat a short hop through a locked bedroom door —
  and a depth-first BFS would silently take the weaker one.
- **`getNpcPerception` damps raw curiosity by
  `NPC_PEEP_TUNING.perception.npcCuriosityWeight` (0.5).** Applied undamped,
  `npcCuriosity`'s [-0.3, +0.55] range clamped an incurious NPC to the 0.05
  floor — functionally blind to every signal in the game. The cast now spans
  ~0.15–0.58 against a player's 0.30–0.45.
- **The curiosity formula existed twice, inline and identically**, in
  `tryNpcPeep` and `trySnoopPhone`. Extracted to SIM's `npcCuriosity` and both
  now call it; a harness assertion fails if an inline copy reappears.
- Cost: ~75µs per `perceiveSignals` call, so a 5-NPC tick costs ~0.4ms. Phase 5
  can call it per NPC per tick without concern.
- Attention **gates** perception and does not scale it (D8), so the reported
  intensity is the world's truth and identical for every perceiver — a keen
  observer notices faint things a dull one misses, but both call a strong smell
  strong. Verified against the debug readout: two characters standing in the
  same room, one smelling the laundry two rooms away and one not.

**Design-session notes (2026-08-10 — superseded above where they disagree):**
- This plan deliberately ships **almost no player-visible change**. Phase 2's
  odor migration is the only thing a player would notice, and only barely.
  The payoff is Plan 2 (the scene reader) and Plan 3 (NPC cognition), both of
  which are pure consumers of what this builds. Resist the urge to bolt a UI
  onto Phase 1 — the debug readout is the intended surface.
- The existing pieces this generalises, all confirmed present at `e675ab0`:
  `ROOM_ADJACENCY` (`config.js`), `world.rooms[id].odor` (a boolean-ish flag
  set by `processSpoilageForDay`), `surfaceRoomEvidence` (`ui.js`),
  `getPlayerPerception` (`sim.js`), `getDoorState` (`interruption.js`), and
  the `dirtyWhen` convention on `OBJECT_DEFS`.
- ~~`getDoorState` is the attenuation hook in D6 — do not write a second one.~~
  **Wrong, and Phase 1 had to work around it:** `getDoorState` returns
  `'unlocked'` for a room that has no door at all, so using it directly muffles
  every doorless hop. `signals.js`'s `roomDoorFactor` checks for the door
  object explicitly.

**Blockers / flagged deviations:** Three Phase 1 deviations, all recorded in
the notes above: `running_water` deferred to Phase 3, per-channel door
multipliers replacing D6's single number, and the `npcCuriosityWeight` damping.
No blockers.

---

## The thesis

Nothing in this apartment can be sensed.

Rot in the fridge sets `world.rooms[kitchen].odor = 'smelly'`, a room-scoped
boolean read by exactly two things: a mood-target penalty and one line in the
scene prompt. It does not travel. Standing in the hallway outside the kitchen,
there is no smell. Nobody else in the apartment can smell it either — an NPC
has no mechanism for noticing anything about a room they are standing in.

Meanwhile the same absence shows up five more times. The shower running is not
audible from the next room. Someone walking past your door emits nothing. A
note left on the fridge has no representation at all — there is no object type
for it and no channel by which you would learn it exists. Peeping and
phone-snooping, the only two places an NPC notices anything, are each a
bespoke hand-written check reading state directly.

The fix is one model. A thing that happens or persists in a room emits a
**signal** on a sense channel. The signal has an intensity, a source room, and
a decay. It propagates outward along `ROOM_ADJACENCY`, attenuating per hop and
attenuating harder through a closed door. Anyone in range — the player or an
NPC, identically — may perceive it, gated by their own attention.

Everything the roadmap wants falls out of that:

- Rot gets stronger and reaches the hallway. Smell becomes a real gradient.
- The scene reader (Plan 2) composes prose from the perceived signal set
  instead of from a log of past events.
- NPCs (Plan 3) get an input channel: they can smell the mess and decide to
  clean it, hear you in the kitchen and come find you, see the note.
- Footsteps outside a door, the shower running, a keyhole being worked — all
  become one-line entries in a table rather than six bespoke features.
- Peep and snoop stop being special cases and become perception with a
  consequence attached.

This plan builds the substrate and one honest proof that it works. It does
not build the UI, and it does not build NPC decision-making.

### What this plan is *not*

- **Not the sensory UI.** No change to `renderNarrationLog`, no new panel, no
  moodles. Plan 2 owns all of it. This plan's only surface is a debug readout.
- **Not NPC behaviour.** Phase 5 proves an NPC can *perceive*. What they do
  about it is Plan 3. Exactly one proof-of-concept consumer ships here, and
  deliberately a small one.
- **Not a physics engine.** Attenuation is a per-hop multiplier over an
  adjacency graph of eighteen rooms. There is no volume, no diffusion rate,
  no air flow. If a tuning number cannot be justified by "does this feel
  right in play", it does not belong.
- **Not taste and touch.** Sight, sound and smell propagate through space and
  are the three ambient channels. Taste and touch are properties of items and
  acts, surfaced at the moment of contact — Plan 2's problem, in the item
  detail pane and in action narration.
- **Not a replacement for `world.events`.** Events remain the historical
  record of what happened. Signals are what is perceivable *now*. They
  overlap but are not the same thing, and merging them would lose the history.

---

## Locked decisions

### The model

- **D1 — Two kinds of signal, and only two.**
  **Standing** signals are *derived* every tick from world state — rot in a
  container, dishes in a sink, a note on a fridge, the shower running. They
  are never stored (RI3). **Transient** signals are emitted by an act at a
  moment — footsteps, a door closing, a dropped plate — and are stored with a
  birth tick and a decay. Anything derivable is standing. This is the single
  most important decision in the plan: it means the great majority of signals
  cannot desynchronise from the world, because they *are* the world.

- **D2 — Three ambient channels: `sight`, `sound`, `smell`.** Justified by
  propagation: each behaves differently through space and through a door.
  Taste and touch do not propagate and are out of scope (see non-goals).

- **D3 — Intensity is a 0–1 float, banded for prose.** Three bands —
  `faint` (0–0.33), `clear` (0.33–0.66), `strong` (0.66–1.0). Authored phrase
  tables are keyed by band, not by raw value, so a tuning change never
  requires rewriting prose.

- **D4 — Propagation is BFS over `ROOM_ADJACENCY` with a per-hop
  multiplier**, terminated when intensity falls below `SIGNAL_TUNING.floor`
  (0.05). The graph is eighteen rooms; a full walk is trivially cheap and
  runs per query, not per tick.

- **D5 — Each channel has its own attenuation.** Smell carries furthest,
  sound next, sight barely at all — sight effectively does not leave its room
  except through an open door into an adjacent one. This is what makes the
  channels feel different without any extra machinery.

- **D6 — Doors attenuate, and locked doors attenuate harder.** The multiplier
  applies on a hop *into or out of* a room that has a door object, read via
  the existing `getDoorState`. A closed bedroom door muffles; a locked one
  muffles more. This is what makes "you hear footsteps outside your door" and
  "they can't hear you from in there" both true and both derived from the same
  number.

- **D7 — Perception is one function for both the player and NPCs.**
  `perceiveSignals(gameState, perceiverId, roomId)` where `perceiverId` is
  `'player'` or an npcId. Any divergence lives in the *attention* term, not in
  two code paths. Peep and snoop become consumers of this in a later plan,
  not permanent exceptions to it.

- **D8 — Attention gates perception, it does not create it.** A perceiver's
  attention is a 0–1 multiplier applied to the arriving intensity; if the
  result is under the channel's `noticeFloor`, the signal is not perceived.
  The player's term comes from the existing `getPlayerPerception`. An NPC's
  comes from temperament — `openness` for noticing at all, low
  `conscientiousness` for missing things — reusing the exact formula
  `tryNpcPeep` already uses, rather than inventing a second curiosity model.

### Emission

- **D9 — Objects emit via a declarative `emits` table, keyed the same way
  `dirtyWhen` already is.** `OBJECT_DEFS[defId].emits = { stateKey: { value:
  { signal, intensity } } }`. This is a deliberate mirror of the existing
  cleanliness convention so there is one thing to learn, not two.

- **D10 — `world.rooms[id].odor` is retired into the signal model.** The
  boolean becomes a derived standing signal emitted by whatever container
  actually holds the rot. Its two current readers —
  `resolveMoodTarget`'s comfort term and the scene prompt's odor line —
  switch to querying perceived smell intensity, which makes the mood penalty
  correctly scale with how bad it is and correctly follow the player into the
  hallway.

- **D11 — Transient signals live in a capped ring buffer on `world`,
  not on rooms.** `world.signals` holds at most `SIGNAL_TUNING.transientCap`
  (64) entries, each `{ id, channel, roomId, intensity, bornTick, sourceId }`.
  Oldest-out. They are pruned on read as well as on write so a save that sat
  idle does not resurrect week-old footsteps.

- **D12 — Emission happens inside `resolveTick`, synchronously.** No signal
  emitter may be async, allocate unboundedly, or call the model (RI2, R2).
  Standing signals are not emitted at all — they are derived at query time,
  which is why they cost nothing per tick.

### Prose

- **D13 — Phrase selection is deterministic per `(signalId, band, roomId,
  day)`.** Seeded from the save seed so the same standing condition reads the
  same way within a day and varies across days. A rot smell that rewords
  itself every render would read as noise; one that never rewords reads as a
  bug.

- **D14 — Salience is a property of the signal def, scaled by intensity.**
  `salience = def.salience × perceivedIntensity`. Plan 2 uses it to decide
  what gets woven into prose versus surfaced as an attention cue. It is
  defined here because the signal author is the one who knows whether a thing
  is the kind of thing that grabs you.

---

## Data model

### `SIGNAL_DEFS` (Phase 1) — `config.js`

```js
const SIGNAL_DEFS = {
  rot: {
    channel: 'smell',
    salience: 0.75,
    phrases: {
      faint:  ['a faint sourness, somewhere', 'something just slightly off in the air'],
      clear:  ['something in here has gone over', 'a sour, turned smell'],
      strong: ['the smell of rot is unignorable', 'something has gone badly wrong in here'],
    },
  },
  running_water: {
    channel: 'sound',
    salience: 0.4,
    phrases: {
      faint:  ['water running, somewhere further off'],
      clear:  ['the sound of a shower running'],
      strong: ['the shower is going, loud through the wall'],
    },
  },
  footsteps: { channel: 'sound', salience: 0.55, phrases: { /* … */ } },
  note:      { channel: 'sight', salience: 0.85, phrases: { /* … */ } },
  // …
};
```

`phrases` is the R1 authored table. Bands are D3. A def with no entry for a
band simply produces nothing at that intensity.

### `SIGNAL_TUNING` (Phase 1) — `config.js`

```js
const SIGNAL_TUNING = {
  floor: 0.05,              // stop propagating below this
  transientCap: 64,         // D11 ring buffer size
  attenuation: {            // D5 — per adjacency hop, by channel
    smell: 0.55,
    sound: 0.40,
    sight: 0.10,
  },
  doorMultiplier: {         // D6 — applied on a hop through a door object
    open:   0.85,
    closed: 0.35,
    locked: 0.25,
  },
  noticeFloor: {            // D8 — below this, after attention, not perceived
    smell: 0.10,
    sound: 0.12,
    sight: 0.15,
  },
  bands: { faint: 0.33, clear: 0.66 },   // D3
};
```

### Perceived-signal record (Phase 1) — returned, never stored

```js
{ signalId, channel, intensity, band, sourceRoomId, distance, salience, sourceId }
```

### `OBJECT_DEFS[defId].emits` (Phase 2) — `defs.world.js`

```js
fridge: {
  // …existing def…
  dirtyWhen: { /* …existing… */ },
  emits: {
    rotten_food: {
      rotten: { signal: 'rot', intensity: 0.8 },
    },
  },
},
sink: {
  emits: { dishes: { some: { signal: 'dirty_dishes', intensity: 0.3 },
                     many: { signal: 'dirty_dishes', intensity: 0.6 } } },
},
```

Same shape as `dirtyWhen` (D9): state key → state value → payload.

### `world.signals[]` (Phase 3) — the transient ring buffer

```js
{ id: 'footsteps', channel: 'sound', roomId: 'hallway_a',
  intensity: 0.5, bornTick: 4821, decayPerTick: 0.25, sourceId: 'npc_a3f' }
```

`bornTick` is absolute (`day × 48 + tickIndex`) so decay survives a day
rollover without special-casing.

### `note` object (Phase 4) — `defs.world.js` + `ITEM_DEFS`

```js
{ id: 'note', label: 'Note', nouns: ['note', 'paper'],
  states: { read: ['unread', 'read'] },
  emits: { read: { unread: { signal: 'note', intensity: 0.9 },
                   read:   { signal: 'note', intensity: 0.2 } } },
  affords: ['self.read_note', 'self.take_note'],
  meta: { authorId, text, addressedTo, day },   // per-instance
}
```

An unread note shouts; a read one is just paper on a fridge (D14 salience
does the rest).

---

## Implementation phases

### Phase 1 — The signal substrate

**Goal:** signals can be defined, derived, propagated and perceived, and a
debug readout proves it. Nothing in the game consumes it yet. When this phase
is done, standing in the hallway with rot in the kitchen produces a perceived
smell signal at a reduced intensity, and standing two rooms further produces
nothing.

**Files:**
- `src/srcfiles/config.js`: `SIGNAL_DEFS` and `SIGNAL_TUNING` per the data model. Start with four defs — `rot`, `dirty_dishes`, `running_water`, `note` — enough to exercise all three channels and both intensity directions.
- `src/srcfiles/signals.js` **(new)**: the whole substrate. `deriveStandingSignals(gameState)` walks every object bucket and reads `emits` against live object state, returning `[{ signalId, roomId, intensity, sourceId }]` — pure, no storage (D1). `propagate(signals, channel)` runs the BFS from each source over `ROOM_ADJACENCY` with per-hop attenuation and the door multiplier via `getDoorState` (D4, D5, D6), returning a room→signals map. `perceiveSignals(gameState, perceiverId, roomId)` composes the two, applies the perceiver's attention term (D8), filters on `noticeFloor`, and returns perceived-signal records sorted by salience (D14). `signalPhrase(record, gameState)` picks the authored phrase deterministically per D13. Loads after `world.js` and before `drives.js` — it reads `ROOM_ADJACENCY`, `OBJECT_DEFS` and object buckets at call time only, so ordering is loose, but drives will call it from Phase 5.
- `src/srcfiles/sim.js`: `getNpcPerception(npc)` beside the existing `getPlayerPerception`, using `tryNpcPeep`'s curiosity formula (D8). Do not duplicate that formula — extract it so both call one function.
- `index.html`: add `signals.js` to the script list in load order, and bump **every** `?v=N` tag together.
- `src/srcfiles/ui.js`: a debug-panel section listing what the player currently perceives — signal id, channel, band, intensity, source room, distance. This is the phase's only surface and its verification tool.

**Verification:** via the iframe harness against a real generated house. Set
the kitchen fridge's `rotten_food` state to `rotten` and assert:
`perceiveSignals` from the kitchen returns `rot` in the `strong` band; from
`hallway_b` (one hop) returns it attenuated into `clear`; from `living_room`
(three hops via dining) returns it `faint` or absent; from `bedroom_3` with
its door **closed** returns strictly less than with the door open, and with
it **locked** less again. Assert a `sight` signal one hop away is not
perceived at all (attenuation 0.10 against a 0.15 notice floor). Assert
`deriveStandingSignals` writes nothing — snapshot `gameState` before and
after and deep-compare. Assert `signalPhrase` returns the same string twice
in one day and a different one on the next day.

---

### Phase 2 — Object emitters and the odor retirement

**Goal:** the apartment's existing mess is a real sensory gradient. Rot,
dishes, laundry and an unmade bed all emit; the `room.odor` boolean is gone
and its two readers query perceived intensity instead. Standing in a hallway
next to a bad kitchen now costs mood, correctly scaled.

**Files:**
- `src/srcfiles/defs.world.js`: `emits` tables on every object that already has a `dirtyWhen`, plus the containers that hold rot (D9). Expected coverage: `fridge`, `pantry`, `sink`, `stove`, `laundry_hamper`, `bed`, `toilet`, `shower`.
- `src/srcfiles/config.js`: signal defs for the new emitters — `dirty_dishes`, `stale_laundry`, `unmade`, `grease`.
- `src/srcfiles/sim.js`: `resolveMoodTarget`'s comfort term stops reading `room.odor === 'smelly'` and instead scales `MOOD_TARGET.comfort.odorPenalty` by the player's perceived smell intensity (D10). `processSpoilageForDay` stops writing `room.odor`; the rot state on the container is now the only thing it sets, and the signal is derived from that.
- `src/srcfiles/npc.js`: `assembleContext`'s `scene.odor` field is replaced by `scene.signals` — the perceived-signal records for the player's room, so the scene prompt can reference what is actually sensible.
- `src/srcfiles/llm.js`: `buildScenePrompt`'s hardcoded odor line becomes a composed sensory line built from `signalPhrase` over `scene.signals`.
- `src/srcfiles/computer.js`, `src/srcfiles/ui.js`: remove the two `world.rooms[roomId].odor = 'none'` writes (`doClearContainerMess`, the maid's cleaning path). Clearing the container state is now sufficient and the signal disappears on its own — which is the point of D1.
- `src/srcfiles/state.js`: `world` folder version bump stripping the dead `odor` key from stored room shells, following the same "only touch entries that structurally look like a room shell" pattern the P1 migration established.

**Verification:** spoil a stack in the fridge through the real
`processSpoilageForDay`, then assert the player's mood target degrades in the
kitchen, degrades *less* in `hallway_b`, and is unaffected in `bedroom_2`.
Assert `world.rooms.kitchen.odor` is `undefined` post-migration and that
nothing reads it (grep). Clear the mess via `doClearContainerMess` and assert
the perceived signal is gone on the next query with no explicit signal
cleanup having run. Assert the scene prompt contains a composed smell line
whose wording matches the band.

---

### Phase 3 — Transient signals

**Goal:** acts and movement leave audible traces that fade. Someone walking
past your closed bedroom door produces a `footsteps` signal you can perceive;
thirty minutes later it is gone. This is the phase that makes the apartment
feel occupied.

**Files:**
- `src/srcfiles/config.js`: `SIGNAL_TUNING.transientCap`; transient signal defs — `footsteps`, `door_close`, `door_handle`, `cooking`, `music`, `voices`, `breakage`.
- `src/srcfiles/signals.js`: `emitTransient(gameState, { id, roomId, intensity, sourceId })` pushing onto the `world.signals` ring buffer with an absolute `bornTick` (D11). `pruneTransients(gameState, nowTick)` dropping anything decayed below `floor`, called on both write and read (D11). `propagate` extended to fold live transients in alongside standing signals.
- `src/srcfiles/sim.js`: `resolveTick` emits `footsteps` for every NPC whose resolved `location` differs from their previous one, intensity scaled by whether they are in transit (a hallway pass-through is louder than settling into a room). Emission is synchronous and allocation-bounded (D12).
- `src/srcfiles/drives.js`: drives with an obvious audible signature emit one — `shower` → `running_water`, `eat` when it routes to the kitchen → `cooking`, `do_laundry` → `machine_running`, `chat_with_roommate` → `voices`.
- `src/srcfiles/actions.js`: `executeAction` emits from a new optional `def.emits` field on `ACTION_DEFS`, so the player is audible too. This matters for Plan 3: an NPC should be able to hear you cooking.
- `src/srcfiles/state.js`: `world.signals` persisted as a new key in the existing `world` folder with `[]` as its default — no migration needed, same precedent as `world.computer`.

**Verification:** put the player in `bedroom_player` with the door closed and
walk an NPC through `hallway_a`; assert a `footsteps` signal is perceived,
that it is stronger with the door open, and that it decays below the notice
floor within its configured lifetime. Assert the ring buffer never exceeds
`transientCap` across 500 simulated ticks with three NPCs moving. Assert a
save round-trip preserves live transients and that a save loaded after a
simulated week of absence has none left. Assert `resolveTick` remains
synchronous — the whole tick path is still callable with no `await`.

---

### Phase 4 — Notes

**Goal:** a note can be left, seen, and read. This is the plan's one
genuinely new player-facing object, and the concrete case the whole design
was argued from: an endearing or passive-aggressive note on the fridge that
draws your attention.

**Files:**
- `src/srcfiles/defs.world.js`: the `note` object def per the data model, with per-instance `meta` carrying `authorId`, `text`, `addressedTo` and `day`. Placeable on a surface-bearing object — fridge, door, table — via a new `surfaces: true` flag on those defs.
- `src/srcfiles/defs.actions.js`: `self.write_note` (sourced from any object with `surfaces`), `self.read_note`, `self.take_note`. `self.read_note` flips `state.read` to `'read'`, which collapses the signal intensity from 0.9 to 0.2 — the note stops shouting once you have seen it, with no extra machinery.
- `src/srcfiles/config.js`: `NOTE_TEMPLATES` — authored note text for NPC-written notes, keyed by the reason an NPC would leave one (a chore grievance, a thank-you, a reminder about rent, a message about food in the fridge). Plan 5 will let NPCs choose among them for a real reason; here they are placed by a debug action only.
- `src/srcfiles/render.js`: the read view for a note. Deliberately minimal — Plan 2 owns presentation.

**Verification:** write a note on the fridge as the player, move to the
dining room, and assert the `note` sight signal is **not** perceived (sight
does not propagate). Return to the kitchen and assert it is perceived at high
salience. Read it and assert salience collapses. Assert a note survives a
save round-trip with its `meta.text` intact. Assert an NPC standing in the
kitchen perceives the note through the same `perceiveSignals` call the player
uses.

---

### Phase 5 — NPC perception, with one consumer

**Goal:** an NPC perceives the same signal set the player does, through the
same function, gated by their own attention — and one drive proves it end to
end. The proof is deliberately small: full behavioural use is Plan 3.

**Files:**
- `src/srcfiles/drives.js`: `evaluateDrives` calls `perceiveSignals(gameState, npcId, resolved.location)` once per NPC per tick and threads the result into the drive loop as `perceived`. A new gate kind — `gates: [{ signal: 'rot', op: 'above', threshold: 0.3 }]` — sits alongside the existing need gates, so a drive can be conditioned on what the NPC can sense.
- `src/srcfiles/config.js`: `DRIVE_DEFS.clean_common` gains a signal gate on `dirty_dishes`, and a new `investigate_smell` drive gated on perceiving `rot` above a threshold routes the NPC to the source room and cleans it. This is the proof-of-concept consumer: an NPC who can smell the mess goes and deals with it, and one who cannot does not.
- `src/srcfiles/npc.js`: `assembleContext` includes each active NPC's own perceived signals so the scene prompt can have them reference what *they* can sense, not only what the player can. A roommate remarking on a smell the player has not mentioned is the first moment this system is visible in fiction.

**Verification:** place rot in the kitchen and an NPC with high `openness` in
the dining room; assert `investigate_smell` fires, the NPC routes to the
kitchen, and `cleanRoomObjects` runs. Assert an NPC with low `openness` and
high `conscientiousness` behind a **closed** bedroom door two hops away does
not fire it. Assert the same `perceiveSignals` call is used for both the
player and the NPC — one implementation, verified by there being no second
propagation function in the tree. Assert `resolveTick` with signal-gated
drives across three NPCs and 500 ticks adds no measurable async and no
unbounded allocation.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | `SIGNAL_DEFS`, standing derivation, propagation, perception query, debug readout. 37 assertions pass (`dev/verify/verify-s1.js`) |
| 2 | **Done** | Object `emits` tables on all 24 dirty objects; `room.odor` retired. 26 assertions pass (`dev/verify/verify-s2.js`) |
| 3 | **Done** | Transient signals from acts, movement and events; ring buffer with decay. 38 assertions pass (`dev/verify/verify-s3.js`) |
| 4 | **Done** | Notes — placeable, sightable, readable, binnable. 37 assertions pass (`dev/verify/verify-s4.js`) |
| 5 | **Done** | NPC perception through the same query; signal gates; `investigate_smell`. 32 assertions pass (`dev/verify/verify-s5.js`) |

---

## Dependency order

```
Phase 1 (substrate) ──► everything else
      ├─► Phase 2 (object emitters — needs derivation + propagation)
      ├─► Phase 3 (transients — needs the ring buffer alongside propagation)
      │        └─► Phase 4 (notes — cleaner once emission patterns are settled)
      └─► Phase 5 (NPC perception — needs 2 or 3 to have something to perceive)
```

Phases 2 and 3 are independent of each other and either may run first. Phase 4
technically only needs Phase 1, but running it after Phase 3 means the
emission conventions are already settled and the note def is written once.
Phase 5 needs at least one of 2 or 3 to have landed so there is a real signal
to gate on.

---

## Open questions (parked, none blocking)

- **Does the player emit signals NPCs can act on, or only ones they can
  perceive?** Phase 3 makes the player audible. Whether an NPC hearing you in
  the shower should *change their behaviour* is a Plan 3 question, and
  overlaps the existing peep system — decide there, not here.
- **Should peep and snoop be rewritten as perception consumers?** They should,
  eventually — they are the two bespoke checks this model exists to
  generalise. Deliberately not in this plan: rewriting working adult-content
  systems to prove an architectural point is exactly the scope creep the
  non-goals list is defending against. Revisit after Plan 3.
- **Sight through an open doorway.** Sight attenuates to almost nothing per
  hop (D5), which means you cannot see into an adjacent room even with the
  door open. Correct for a note on a fridge; possibly wrong for seeing someone
  standing in the hallway. May need a per-signal attenuation override rather
  than a per-channel one. Decide during Phase 2, when there are enough sight
  signals to judge.
- **Do signals need an `owner`/privacy concept?** A note addressed to one
  roommate is arguably not the player's to read. The `addressedTo` field is
  reserved in Phase 4's data model against this, with no reader yet — the one
  deliberate R8 exception in this plan, flagged here so it is not mistaken for
  an oversight.

---

## Design invariants

1. **Anything derivable from world state is derived, never stored.** Standing
   signals are recomputed per query. The `world.rooms[id].objects` array was
   initialised and never filled for an entire phase because it was stored
   rather than derived; room ownership was made derived precisely so a
   move-out could not leave a stale owner. Signals follow the same rule, and
   for the same reason: a stored signal and the object that emits it will
   eventually disagree, and nothing will report it.

2. **One propagation function, one perception function.** The moment there is
   a `perceiveSignalsForNpc` beside `perceiveSignals`, the two will drift and
   NPCs will start sensing a subtly different world than the player. Peep and
   snoop already demonstrate the cost of bespoke per-actor perception: two
   hand-written checks that cannot share a fix.

3. **No emitter may be async.** `resolveTick` is synchronous and model-free
   and the entire autonomy layer depends on it. `applyEffects` was built under
   this constraint and `evaluateDrives` inherits it; signal emission does too.

4. **A signal with no perceiver is dead code with a physics flavour.** Every
   entry in `SIGNAL_DEFS` must be perceivable by someone in some reachable
   game state, and every phase's verification must demonstrate it. The NPC
   audit found 34 fields written and never read; a signal table is a far
   easier place to make that mistake at scale, because emission is fun to
   write and consumption is not.

5. **Prose is authored and keyed by band, never by raw value.** A tuning
   change must never require rewriting phrase tables. The three bands are the
   contract between the simulation and the writing.
