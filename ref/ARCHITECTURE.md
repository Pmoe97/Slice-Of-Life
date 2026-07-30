# Architecture notes — the sandbox expansion

This file tracks the implementation of the sandbox-expansion plan (computer,
object model, items, skills, stealth, autonomy). The original design brief
lives in `ref/Original Prompt and Response Train.txt`; the full phased plan
this file follows lives in the plan history (chat-side), summarized per
phase below as each lands. This document — plus the section-header
comments in each `src/*.js` file and the git commit history — is the
design record. Keep it current as phases land; don't let it drift.

## Status

| Phase | Status | What it adds |
|---|---|---|
| P0 | **Done** | Effects engine, action registry, tone/content wiring |
| P1 | **Done** | World object model |
| P2 | **Done** | Items and inventory |
| P3 | Not started | Skills and progression |
| P4 | Not started | The computer |
| P5 | Not started | Free-action resolution pipeline |
| P6 | Not started | Stealth, evidence, suspicion |
| P7 | Not started | NPC autonomy |
| P8 | Not started | Content volume expansion |

## Load order

`main.html`'s `<script>` tags are the dependency graph. Current order:

```
config.js → defs.actions.js → state.js → sim.js → effects.js → actions.js
→ npc.js → prompt.js → llm.js → image.js → render.js → ui.js
```

Rule: if a new script's *top-level* code reads another script's `const`/
data at load time (e.g. `defs.actions.js` builds `ACTION_DEFS` entries by
reading `NEEDS`/`ACTION_TUNING` from `config.js`), the dependency must load
earlier. If a script only *calls* another script's function from inside a
function body, order doesn't matter — that call happens at runtime, after
every script has finished loading (classic `<script>` tags share one global
scope; function declarations are hoisted within their own file, and by the
time `boot()` runs, every file has already executed top to bottom).

## P0 — Effects engine, action registry, tone/content wiring

**New files:**
- `src/defs.actions.js` — `ACTION_DEFS` (data: the five ported verbs —
  `self.eat`, `self.cook`, `self.shower`, `self.watch_tv`, `self.relax`)
  and `ACTION_REQUIREMENT_CHECKERS` (a name→predicate registry, mirroring
  SIM's `CAST_REQUIREMENT_CHECKERS`).
- `src/effects.js` — `EFFECT_DEFS` (the typed effect vocabulary),
  `parseEffectDSL`/`normalizeProposal` (DSL → typed effects),
  `validateEffects` (the LLM-input boundary), `applyEffects` (pure,
  synchronous, in-memory mutation), `LLM_TELEMETRY` (parse-tier and
  effect-accept/reject counters, surfaced in the debug panel).
- `src/actions.js` — `resolveAvailableActions`, `executeAction` (the
  chokepoint for a registered verb), `runRegisteredAction` (the UI-facing
  wrapper matching the old `doX()` convention).
- `src/prompt.js` — `buildStyleSection`/`buildContentSection` (tone/content
  directives injected into every narrative prompt) and
  `buildEffectVocabSection` (tells the LLM which effect types it may use
  this turn, and their exact param shape).

**The three decisions this phase commits to (see the plan for full
rationale):**
1. **One effect engine, three producers.** Player actions, LLM proposals,
   and (from P7) NPC autonomy all emit the same typed effect list. The
   *validator* (`validateEffects`) is specifically the LLM-input boundary —
   trusted producers (an `ACTION_DEFS` entry's own `effects` list, later a
   `DRIVE_DEFS` entry's) are config-authored, not user input, so they call
   `applyEffects` directly and skip validation/caps entirely. See
   `effects.js`'s file header.
2. **Effects cross the LLM boundary as a flat line-oriented string DSL**
   (`ADJUST_NEED player hunger +20`), not nested JSON — recoverable by
   regex from a mangled response, which is exactly what the tier-3 fallback
   in `callLLM` (LLM section) now does.
3. **`applyEffects` must stay synchronous and in-memory-only.** This is a
   hard constraint, not a style choice: NPC autonomy (P7) will call it from
   inside `resolveTick`, which is a hard zero-LLM, zero-async invariant.
   Persistence happens later, at the next `saveAtBoundary` (already an
   unconditional per-NPC write loop) — same pattern SIM's
   `resolveTick`/`resolveBatch` already use.

**How `effects` relates to the legacy proposal keys.** `relationshipDeltas`/
`moodDeltas`/`memoryAdditions` keep their own dedicated, already-hardened
code paths in `validateProposal`/`applyProposal` (NPC section), completely
untouched — those rules are byte-identical to before this phase. `effects`
is a **new, additive** field: `normalizeProposal` desugars it (DSL strings
or already-typed objects) into a flat effect array, which
`validateProposal` validates via `validateEffects(..., 'llm')` (recording
telemetry) and `applyProposal` applies via `applyEffects`. Effect-touched
NPC ids are returned as `effectNpcIds`, kept separate from `updatedNpcIds`
(which specifically means "needs a kv resync" — effects mutate the same
`gameState` object UI's `currentGameState` already points to, so there's
nothing to resync).

**Implemented vs. declared-only effect types.** `EFFECT_DEFS` declares the
full vocabulary from the plan now, so the DSL shape is stable across
phases, but only these are `implemented:true` in P0: `ADJUST_NEED`,
`MOOD_DELTA`, `REL_DELTA`, `SPEND_MONEY`, `EARN_MONEY`, `SPEND_TIME` (parsed
but not yet consumed — wired up in P5), `MOVE_PLAYER`, `NPC_MOVE`,
`NPC_ACTIVITY`, `ADD_SKILL_XP`, `ADD_FLAG`, `CLEAR_FLAG`, `MEMORY_FACT`,
`MEMORY_EPISODE`. Object/item/evidence/suspicion/app/schedule/residency/arc
types are declared with `implemented:false` — validating against them
always fails (safe direction), and they're excluded from
`SCENE_EFFECT_VOCAB` in `prompt.js` so the LLM is never invited to use a
verb that can't do anything yet. As WORLD (P1)/ITEMS (P2)/STEALTH (P6) land,
flip `implemented:true`, add an `apply()`, and widen the relevant
`effectVocabulary` list.

**Action porting.** Only the five simplest verbs are ported onto
`ACTION_DEFS` in P0: eat/cook/shower/watch_tv/relax. `sleep`/`work`/`talk`/
`move`/`pay-rent`/`ask-to-leave` keep their hand-written `ui.js`
implementations — they involve multi-tick batching, LLM calls, or residency
mutation that fit more naturally once the object model (P1) and the
free-action pipeline (P5) exist. `handleAction` (UI) checks
`ACTION_DEFS[action]` before its switch and dispatches to
`runRegisteredAction` — a non-breaking bridge; unported verbs fall through
to the switch exactly as before. `renderActionChips` (RENDER) now queries
`resolveAvailableActions` for the room-sourced chips instead of a hardcoded
if-chain for those five specifically; Sleep/Work/Talk/Pay Rent chips are
still hardcoded above/below that block.

**Fixed in passing:** `saveAtBoundary` (STATE) was missing
`queueWrite('world', 'castWeb', ...)` — NPC-to-NPC relationship deltas from
`applyNpcToNpcDelta` silently never persisted past the in-memory session.
Found while wiring effects into the save path; now fixed.

**Known gap, deliberately deferred:** `saveAtBoundary` still writes every
NPC unconditionally on every boundary save (no dirty-tracking). The plan
bundles this fix with P1, since object buckets need the same dirty-set
mechanism — no sense building it twice.

**Verification performed for P0** (no test harness exists in this repo; see
the plan's Verification section for the longer-term `dev.selftest.js`
proposal). Since the game requires the real Perchance runtime (`root.kv`,
`root.generateText`) to fully boot, P0 was verified by loading `main.html`
in a browser and exercising the new pure functions directly via the
console against synthetic state:
- `parseEffectDSL` on a mixed valid/garbage multi-line string — correctly
  parsed 4 of 5 lines, correctly captured multi-word tail params (`reason`,
  `text`), correctly skipped the non-matching line.
- `validateEffects` against a mix of in-range/over-cap/unreachable
  effects — correctly accepted 2, rejected 3, with the expected reasons
  (need-delta cap, money cap, "not an active participant").
- `applyEffects` against a synthetic `gameState` — correctly mutated
  `player.hunger`/`player.money`/`npc.relPlayer.trust` in place,
  synchronously, with no kv calls.
- `resolveAvailableActions` on a synthetic kitchen-located player state —
  correctly returned exactly `['self.cook', 'self.eat']`, sorted by
  `chipPriority` (cook=40 before eat=30), and correctly excluded
  bathroom/living-room-sourced actions.
- `buildScenePrompt`/`validateProposal`/`applyProposal` against a synthetic
  context and an effects-only proposal — prompt built without error and
  included the new style/content/vocabulary sections; validation correctly
  passed the pre-existing checks unchanged while separately accepting 2 and
  rejecting 1 new-vocabulary effect; application correctly mutated a
  synthetic `gameState` (money 500→480, `skills.cooking`→8) with zero kv
  calls, confirming the effects-only path never touches `root.kv`.

Full live-loop verification (kv persistence, real LLM calls, NPC schedule
interaction with the new action chips) still needs the actual Perchance
generator environment and hasn't been done outside it — that's a
pre-existing constraint of this project, not something P0 introduced.

## P1 — World object model

**New files:**
- `src/defs.world.js` — `OBJECT_DEFS` (28 definitions across every room
  type: bedroom furniture instanced per-bedroom, kitchen, bathroom, living
  room, hallway, plus a few personal-effect items — diary/guitar/jewelry_box
  — for later stealth content) and `APARTMENT_LAYOUT` (declares initial
  per-room placement; `ownerFrom: 'roomResident'` resolves to whichever
  npc/player currently lives there at spawn time).
- `src/world.js` — seeded object ids (`genObjectId`), spawning
  (`spawnObjectsForNewGame`, `ensureObjectsForBucket`/
  `ensureAllObjectBuckets` for lazy-spawn on pre-P1 saves), derived room
  ownership/privacy (`roomOwnerId`/`roomPrivacy` — **not stored**, see
  below), and cleanliness derivation (`recomputeRoomCleanliness`,
  `refreshRoomCleanliness`).

**Where objects live.** A new kv folder `objects`, one key per placement
bucket (`room_<roomId>` | `carry_player` | `carry_<npcId>` — ~10-12 keys
for a typical household, not hundreds), added alongside accessor functions
in `state.js` (`getObjectBucket`/`setObjectBucket`/`updateObjectBucket`/
`getAllObjectBuckets`) — `world.js` never touches `root.kv` directly, per
the "state.js is the sole kv access point" invariant. `gameState.objects`
is a new top-level key (sibling to `world`, not nested under it).

**`world.rooms[id].objects` is abandoned, not filled in.** It was
initialized to `[]` and never read or written by anything (confirmed by
grep before starting this phase). `sim.js`'s `buildGameState` no longer
sets it. A `world` 1→2 migration strips it from existing saves — since the
`world` folder holds several differently-shaped keys under one migration
pass (rooms/castWeb/quests/events/deliveries/rent), the migration function
only touches entries that structurally look like a room-shell map (values
with a `capacity` property) and passes everything else through untouched.

**Ownership and privacy are derived, never stored** — `roomOwnerId(roomId,
npcs)` and `roomPrivacy(roomId)` are pure functions computed on demand,
mirroring `getPresentNpcIds`'s existing "presence is derived live from
`npc.location`, never mirrored" pattern (SIM). This means a move-in or
move-out can never leave a stale owner behind; there was nothing to keep in
sync in the first place. (This simplified the original plan, which called
for storing `ownerId`/`privacy` on `world.rooms[id]` — deriving them
instead sidesteps a real problem: the generic per-folder migration function
can't tell which `world` key it's being called for, so it has no reliable
way to compute ownership, which needs `npcs` data it doesn't have access
to.)

**Cleanliness is now derived, not a fixed value set once at spawn and never
touched again.** `OBJECT_DEFS[defId].dirtyWhen: { stateKey: { value:
griminess0to1 } }` is a data-driven lookup — `recomputeRoomCleanliness`
weights each object's griminess by `cleanlinessWeight` and averages. A room
with no cleanliness-relevant objects (weight 0 across the board, e.g. the
hallway with just a doormat and coat rack) falls back to
`CLEANLINESS.baseline` (50, matching the old fixed starting value).
`refreshRoomCleanliness(gameState, roomId)` is the hook later phases call
after an effect changes an object's dirty-relevant state (P2 cooking
dirtying a stove/sink, P6 cleaning it back up) — nothing calls it yet
since no action mutates object state in P1.

**Image prompts now reflect real room contents.** `image.js`'s
`buildImagePrompt` takes an optional `roomObjects` param and builds the
room-specific detail sentence from `OBJECT_DEFS[defId].imagePhrase` across
whatever's actually in that room, replacing the old fixed per-roomType
string (`image.js:41-49` — kept as `fallbackRoomPhrase` for callers that
don't pass objects). `render.js`'s `renderScene` now passes
`gs.objects[room_<roomId>]` through. Note: the scene image cache key
(`composeSceneKey`) doesn't yet factor in object state, so a room getting
dirtier won't by itself trigger new art — a deliberate deferral (bursting
the image cache on every state change would be expensive to regenerate),
not an oversight.

**Verification performed for P1**, again via console tests against the
loaded scripts (SIM_generateHouse is fully synchronous/pure, so it runs
directly without any kv or LLM dependency):
- Full house generation spawns object buckets for all 8 rooms + a carry
  bucket per player/npc; kitchen's 7 objects match `APARTMENT_LAYOUT`
  exactly; `bedroom_player`'s bed is owned by `'player'`, other furniture
  unowned; `bedroom_1`'s resident correctly owns their bed/guitar/diary via
  `ownerFrom: 'roomResident'`.
- Determinism: identical seed → identical object ids; different seed →
  different ids — confirms `genObjectId`'s seeding actually holds, the
  same invariant `genSeededNpcId` protects for characters.
- Fresh-object cleanliness derivation returns 100 for rooms with clean
  objects, correctly falls back to the 50 baseline for the hallway (no
  cleanliness-weighted objects yet); `world.rooms[id]` confirmed to no
  longer carry the dead `objects` field.
- **Full kv-dependent path**, exercised against an in-memory mock of the
  Perchance kv-plugin API (get/set/update/keys/delete) simulating a
  pre-WORLD save: wrote `world.rooms` with the legacy `objects: []` field
  and no `objects` folder data at all, then called the real
  `loadGameState()`. Confirmed: the dead field was stripped automatically
  (via `loadGameState`'s existing `initStorage()` call triggering the new
  migration), every object bucket was lazily spawned with the correct
  contents despite never having been written, and a subsequent explicit
  `checkAndMigrateFolder('world')` call was a correct no-op (already at
  target version). This is the scenario every existing save will actually
  hit on first load after this update, and it works end-to-end.

## P2 — Items and inventory

**New/changed files:**
- `defs.world.js` gains `ITEM_DEFS` (58 defs — foods/ingredients, prepared
  meals, snacks/drinks, cleaning supplies, toiletries, tools/decor/
  electronics/media/medication/gifts, plus `_unknown` as the legacy-data
  fallback), `RECIPES` (4 recipes: pasta, omelette, stir-fry, sandwich —
  each with `leaves` DSL lines that dirty the stove/sink on success), and
  `STARTER_GROCERIES`.
- `src/items.js` (new) — stack helpers (`addStack`/`removeStack`/
  `stackQty`), legacy-inventory-name resolution
  (`resolveItemDefIdByName`/`normalizeLegacyInventoryEntry`/
  `migrateInventory`), and recipe selection
  (`recipeAvailable`/`pickAvailableRecipe`). Loads between `world.js` and
  `effects.js`.
- **`effects.js`'s object/item effect types are now fully implemented**
  (`SET_OBJECT_STATE`, `ADJUST_OBJECT_CONDITION`, `MOVE_OBJECT`,
  `MOVE_ITEM`, `CONSUME_ITEM`, `DESTROY_ITEM`, `SPAWN_ITEM` — all flip from
  P0's `implemented:false` placeholder to real `validate`/`apply` pairs).
  `buildEffectContext`'s signature changed from a flat `reachableIds`
  array to `(gameState, activeNpcIds, presentNpcIds, roomObjects,
  carryItems)` — `roomObjects` is `{objId: instance}` for the producer's
  current room, `carryItems` is the player's inventory. `computeReachSet`
  now returns real object ids, deliberately scoped to the producer's
  current room only. All three call sites updated to match: `npc.js`'s
  `validateProposal` (via `context.roomObjects`/`context.carryItems`, both
  now assembled by `assembleContext`) and `applyProposal` (via live
  `gameState.objects`/`gameState.player.inventory`), and `actions.js`'s
  `executeAction`. `findObjectById(gameState, objId)` (EFFECTS) scans every
  object bucket — fine at the current object count (~40).
- **`actions.js` gained `source.kind === 'object'` support and a
  two-step execution model.** `actionSourceMatches` now resolves an
  object-sourced action by finding an instance of `source.objDef` in the
  current room (`findObjectInRoom`). `executeAction` gained an optional
  `def.prepare(ctx)` step whose result is threaded into both
  `def.buildEffects(ctx, prepared)` and a dynamic
  `def.narration.build(ctx, prepared)` — this is what lets `self.cook` pick
  a recipe *once* and have the same pick determine what actually happened
  and what gets said about it, rather than risking two independent picks
  disagreeing. Actions that don't need this (the four other P0 verbs) are
  untouched — they still use the static `effects`/`narration.templates`
  shape.
- **`self.cook` (DEFS.ACTIONS) is now object-sourced and recipe-driven.**
  Source changed from `{kind:'room', roomIds:['kitchen']}` to
  `{kind:'object', objDef:'stove'}`; gated by a new `hasRecipeIngredients`
  requirement checker (backed by `pickAvailableRecipe` against the
  kitchen's fridge+pantry contents — "Nothing to cook" is now a real,
  reachable state, not a fallback that never fires). `prepareCook` picks
  the recipe once; `buildCookEffects` emits `CONSUME_ITEM` lines split
  across fridge/pantry as needed (`ingredientConsumeLines`), `SPAWN_ITEM`s
  the full batch into inventory, immediately `CONSUME_ITEM`s one portion
  (so clicking Cook still satisfies hunger in one action, with leftovers
  staying in inventory when a recipe yields more than one), then applies
  the recipe's `leaves` lines with `{stove}`/`{sink}` resolved to this
  room's actual instance ids (`expandCookLeaveLine`). `cookNarration`
  reports the picked recipe by name.
- **`world.js`'s `spawnObjectsForNewGame` now seeds `STARTER_GROCERIES`**
  into the fridge/pantry instances' `.contents` (`seedStarterGroceries`)
  so a fresh house is cookable from day one.
- **`state.js`: `player` 1→2 migration** registered, calling
  `items.js`'s `migrateInventory` to normalize the legacy mixed-type
  inventory (bare strings, `{name,qty}` objects) into real stacks;
  unmatched names fall through to `ITEM_DEFS._unknown` with the original
  text preserved in `meta.origName`.
- **`render.js`'s `renderInventory` fixed to resolve stack display names
  from `ITEM_DEFS[defId].label`** instead of the old `item.name` (which
  the new stack shape doesn't have) — without this, every item in the
  inventory panel would have rendered as blank/undefined. Tolerates
  un-migrated legacy shapes too, for the window before a save's `player`
  folder has actually run its migration.

**A verification-tooling note worth keeping**: this browser preview pane
snapshots `main.html` and does not re-fetch `<script src>` tags on
navigate/reload, even across closing and reopening tabs — `fetch()` against
the same file confirms the *disk* content is current, but the loaded page
keeps serving whatever it first loaded. Live-testing further code changes
against this file requires injecting a fresh `<iframe src="main.html?...">`
and running test code inside `iframe.contentWindow` via `.eval(...)` (not
by reading its globals as `window` properties from the parent — top-level
`const`/`let` bindings in a classic script are lexical, not `window`
properties; only `var`/function declarations are). This is how P2's
post-cache-discovery verification below was actually run.

**Verification performed**, via the iframe technique above, against the
real (non-stale) code:
- Fresh house generation seeds the fridge with `eggs×6, milk×1, cheese×1,
  butter×1` and the pantry with `pasta_dry×2, tomato_sauce×2, rice×2,
  bread×1`, exactly matching `STARTER_GROCERIES`.
- `resolveAvailableActions` correctly lists `self.cook` as available once
  the object-sourced lookup finds the stove.
- A full `executeAction('self.cook', ...)` run (through the real
  `writeGeneratedGameState`/`loadGameState`/kv round-trip, mocked kv):
  picked the `pasta` recipe (first in declaration order whose ingredients
  were on hand), correctly narrated *"You cook pasta. It smells good —
  there's enough for leftovers,"* restored hunger from 80 to the 100 cap,
  left `meal_pasta×1` in inventory (produced 2, ate 1), decremented
  `pasta_dry`/`tomato_sauce` in the pantry by 1 each while leaving
  `rice`/`bread` and the entire fridge untouched, and correctly set the
  stove's `burner` to `crusty` and the sink's `dishes` to `many` per the
  recipe's `leaves` lines.
- `migrateInventory` on a synthetic legacy array (`['pizza', {name:'eggs',
  qty:3}, {name:'made up thing', qty:1}]`) correctly resolved to
  `frozen_pizza`, `eggs`, and `_unknown` (with `origName` preserved) — no
  data silently dropped.
- `render(currentGameState, ...)` ran with no error against this state, and
  the inventory panel's DOM text correctly read "Pasta" (resolved via
  `ITEM_DEFS.meal_pasta.label`) instead of the blank/`undefined` the old
  `item.name` lookup would have produced against the new stack shape.
