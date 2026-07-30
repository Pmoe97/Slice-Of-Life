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
| P3 | **Done** | Skills and progression |
| P4 | **Partial** — see below | The computer |
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

## P3 — Skills and progression

**New file:** `src/skills.js` — `SKILLS` (xp curve base, max level 10),
`skillLevel(player, skillId)` (`floor(sqrt(xp / xpPerLevelBase))`,
capped), `SKILL_CURVES` (11-entry arrays, one per level, for
`timeReduction`, `cookQuality`, `cleanEfficiency`, `stealthSuccess`,
`payMultiplier`, `socialEdge`), and `skillMod(player, skillId, curveId)` —
the one lookup function every skill-modified outcome goes through.

**No migration was needed** — `player.skills` was already `{}` on every
save (SIM's player init), and `skillLevel` treats a missing entry as 0 xp,
so every existing save is forward-compatible for free.

**Only `timeReduction` is actually consumed by gameplay yet** —
`cookQuality`, `cleanEfficiency`, `stealthSuccess`, `payMultiplier`, and
`socialEdge` are declared and curve-complete, waiting for the systems that
will read them (P4's jobs for `payMultiplier`, P6's stealth for
`stealthSuccess`, P7's chore drives for `cleanEfficiency`, cooking outcome
variance for `cookQuality`). This mirrors EFFECTS' P0 pattern of declaring
a full vocabulary before every consumer exists — better than leaving a gap
to retrofit later.

**`actions.js` gained two small, generic hooks** rather than one-off
cooking-specific code:
- `resolveTimeCost(def, gameState)` — an `ACTION_DEFS` entry's base
  `timeCost` is shrunk by `skillMod(...)` whenever it declares
  `timeCost.skill`/`timeCost.curve` (floored at `timeCost.min`, default 1).
  Any future action gets skill-scaled duration just by declaring these
  three fields — no per-action time-cost code needed.
- `executeAction` now appends `ADD_SKILL_XP <id> <xp>` automatically when
  `def.skill` is declared, after the action's own effects — so an action
  earns its skill XP unconditionally once `checkRequirements` has already
  confirmed it's actually happening, without `buildEffects` needing to
  remember to emit it itself.
- `self.cook` (DEFS.ACTIONS) now declares `timeCost: { base: 2,
  skill: 'cooking', curve: 'timeReduction', min: 1 }` and
  `skill: { id: 'cooking', xp: 12 }` — cooking gets measurably faster with
  practice, and is the first (and so far only) skill-earning action.

**Verification performed**, via the same fresh-iframe technique as P2
(this browser preview snapshots `main.html`, see the P2 note above — every
verification in this project now goes through that iframe pattern):
- Level math checked directly against the formula: 0 xp → level 0; 40 xp →
  level 1 (`sqrt(40/40)=1`); 360 xp → level 3 (`sqrt(360/40)=3`); 4000 xp →
  capped at level 10. `timeReduction` curve lookups at level 0 (`1.0`, no
  reduction) and level 3 (`0.85`) both correct.
- A 6-cook loop (restocking the pantry each round) correctly accrued 12 xp
  per cook (0→12→24→36→48→60→72) and crossed into skill level 1 exactly at
  48 xp, matching the formula. `ticksSpent` stayed at 2 through all 6 cooks
  in this run — expected, not a bug: `self.cook`'s base cost is only 2
  ticks, and `Math.round(2 × mod)` doesn't cross below 2 until `mod` drops
  under 0.75 (skill level 6, `timeReduction[6] = 0.70`), a consequence of
  integer tick rounding on a small base cost, not a flaw in `skillMod`
  itself — the curve values were independently verified correct above.

## P4 — The computer (proving ground): screen layer + WorkHub done

**Scope reminder**: the plan lists eight apps (work, shop, browser, classes,
services, classifieds, im, stream/adult). This pass builds the screen
layer, the generic-renderer framework everything else will reuse, and one
fully working app — Work — as the proving ground the plan asked for. It
exercises the object model (computer is an object), the app/screen
registry, session persistence, skill curves, and the deterministic
day-rollover hook, so the remaining apps are now "add an `APP_DEFS` entry
+ a data source" work rather than new infrastructure. Shop/browser/
classes/services/classifieds/im/stream/adult are **not started**.

**New files:**
- `src/defs.computer.js` — `APP_DEFS` (just `work` so far) and `JOB_DEFS`
  (3 jobs: café temp, remote data entry, freelance developer — the last
  gated on `tech` skill level 3 and reading `payMultiplier` through
  `qualitySkill`).
- `src/computer.js` — `defaultComputerState()`, view navigation
  (`openApp`/`switchScreen`/`closeComputer`), and the Work app's domain
  logic: `computeFocusMultiplier` (energy × mood, clamped, via new
  `WORK_TUNING` config), `generateDailyBacklog` (seeded off save
  seed+day, zero LLM — matches SIM's off-screen-event convention),
  `applyForJob`, `workOneBlock`, `checkWorkDeadline`.
- `src/render.computer.js` — `renderComputerScreen`/`renderComputerChrome`
  (clock + app tabs) and two generic renderers: `dashboard` (draws named
  panels from `DASHBOARD_PANELS`, currently `job.summary`/`job.backlog`/
  `job.earnings`) and `catalog` (a row list with a per-row action button —
  used for the job board, and shaped to be reused by the shop later).
  Six more renderers from the plan (list/grid/feed/article/form/chat/
  player) don't exist yet; each app past Work will need whichever of
  these it depends on.
- `src/ui.computer.js` — the UI-facing wrappers
  (`doComputerOpen`/`doComputerClose`/`doComputerOpenApp`/
  `doComputerOpenScreen`/`doWorkApply`/`doWorkBlock`), matching UI's own
  `doX()` convention (loading state, render, save-at-boundary).

**Screen layer, not the modal shell.** `#computer-screen` is a third
child of `#main-content` (`main.html`), shown/hidden purely via
`#main-content[data-mode="computer"]` CSS — header, sidebars, and footer
stay visible and functional the whole time. Opening the computer costs no
time and calls no `advanceAndResolve`; only in-app actions with a real
cost (`computer.work-block`) do. `render()` (RENDER) now calls
`renderComputerScreen` unconditionally on every render — harmless when
hidden, and it means every existing call site that already calls
`render()` keeps the computer screen in sync for free rather than needing
to remember a second call.

**`world.computer` is a new key in the existing `world` kv folder**, not a
version bump — `defaultComputerState()` is exactly what a save from
before the computer existed should read as, so `getWorld('computer') ||
defaultComputerState()` in `loadGameState` needed no migration function,
just a default. Persisted from `writeGeneratedGameState` (new game) and
`saveAtBoundary` (every boundary save) the same way every other `world`
sub-key already is.

**Work replaces the old flat `doWork()`** (`ui.js`, deleted): apply on the
job board (gated by `requiredSkills`), work through a seeded daily
backlog one block at a time, pay scaled by `payPerBlock × payMultiplier
(qualitySkill) × focus (energy/mood)`, reputation grows per block,
missing a deadline costs a strike via a new `processWorkDeadlineForDay`
hook in UI's `processDayRollover`, and enough strikes ends the job. The
"Work" chip in `bedroom_player` (`render.js`) is now "Use Computer"
(`computer.use`), a hand-written switch case in `handleAction` (like
`sleep`/`move`) rather than an `ACTION_DEFS` entry, since opening the
computer is a viewpoint change with no time cost or narration, not a
world-effecting action.

**Click delegation extended**: `attachEventHandlers`'s generic handler
(`ui.js`) now also reads `data-app`/`data-screen`/`data-row-id` off a
clicked element and passes them through `handleAction`'s `extra` param
(the same slot `data-room-id` → `{roomId}` already used for room clicks) —
this is what lets `render.computer.js`'s cloned buttons work through the
existing single click listener without a second one.

**A real bug found and fixed during verification**: `renderCatalog`
originally resolved `screen.source` (a string like `'JOB_DEFS'`) via
`window[screen.source]`, which always returned `undefined` — top-level
`const`/`let` bindings in a classic `<script>` are lexical, not `window`
properties (only `var`/function declarations are; this is the same
distinction the P2 entry's iframe-testing note above had to work around
from the *outside* of a script, and it turns out the *code itself* needs
to respect it too). Fixed with an explicit `CATALOG_SOURCES = { JOB_DEFS
}` registry in `render.computer.js` instead of a bare global-property
lookup — this is now the pattern any future `screen.source`-consuming
renderer should follow, not `window[...]`.

**Verification performed**, via the same fresh-iframe technique (values
snapshotted with `JSON.parse(JSON.stringify(...))` before further
mutation, after an initial test run's naive reference-capture made a
mutated end-state look like it belonged to an earlier point — a test-code
bug, not an implementation one, but worth remembering next time):
- Fresh game load: `world.computer` is a pristine default (unemployed, no
  backlog, zero reputation/strikes).
- Opening the computer sets `data-mode="computer"` and renders the
  WorkHub tab; the job board catalog correctly lists all three jobs with
  price and an Apply button (post-fix).
- Applying for a job correctly sets `jobId`/`employed`/a 4-task seeded
  backlog/`lastPayDay`.
- Working blocks: pay per block *decreased* each time (13→12→11→10) as
  energy dropped (92→84→76→68) — `computeFocusMultiplier` working as
  designed, not a bug. A 5th attempt after the 4-task backlog was already
  complete correctly failed with `$0`/no energy cost.
- The dashboard panels correctly reflected state after each change
  (reputation 20%, 4/4 tasks, $46 earned).
- **Full persistence round-trip**: after closing the computer, a fresh
  `loadGameState()` call (through the real kv-backed path, mocked kv)
  correctly returned the exact same work state — job, backlog, earnings,
  reputation all intact.
- **Firing escalation**: three consecutive missed deadlines correctly
  produced strike 1, strike 2, then `fired:true` with `employed` flipping
  to `false` and the job cleared, matching `JOB_DEFS.cafe_temp.
  firingStrikes: 3`.

### Nile — the shop app

An unsubtle Amazon knockoff (the name's the joke), added right after
WorkHub. `APP_DEFS.shop` has two screens: `browse` (the `catalog`
renderer over `SHOP_CATALOG_LIST`, new in `items.js` — every `ITEM_DEFS`
entry with a `price`, computed once at load since item content is
static) and `cart`.

**`cart` is the first screen to use a new generic renderer, `list`**
(`render.computer.js`), added alongside a `resolveScreenSource(gs,
screen)` helper that reads a screen's `source` two ways: a bare name
(`'JOB_DEFS'`, `'SHOP_CATALOG_LIST'`) looks up the existing
`CATALOG_SOURCES` registry; a `'state:apps.shop.cart'` path walks live
into `gs.world.computer` — this is how a screen shows the player's own
mutable session data instead of a fixed catalog, and it's now the pattern
IM's thread list and Browser's history will reuse rather than each
needing its own renderer. `list` also supports a `labelFn(row)` per-screen
formatter and an optional `footerAction` button (Checkout), neither of
which `catalog` needed.

**Cart entries are `{defId, units}`, not `{defId, qty}`** — one "unit" is
one click of Add to Cart, costing `ITEM_DEFS[defId].price` and expanding
to `ITEM_DEFS[defId].buyQty` actual items on checkout (`computer.js`'s
`cartSubtotal`/`checkoutCart`). This is what lets a $4 "unit" mean a dozen
eggs without the player ever typing a quantity — keeping "how many times
you clicked" and "how many items that yields" as two separate numbers is
the whole trick.

**Checkout doesn't touch inventory at all.** It charges
`cartSubtotal + ECONOMY.deliveryFee` and writes one `world.deliveries`
entry per cart line (`{defId, qty, status:'ordered', etaDay,
orderedDay}`). **`processDeliveriesForDay`** (`ui.js`) was rewritten to
match: instead of pushing a `{name, qty}` object straight into
`player.inventory` (the old free-text-order behavior), it finds the
hallway's `doormat` object and calls ITEMS' `addStack` on its `.contents`
— "you have to go get your package, and a roommate could get to it
first" is a direct consequence of routing delivery through a real object
instead of a shortcut into the player's pockets.

**The old free-text delivery flow is fully retired**: `showDeliveryModal`/
`placeDelivery`/the `order-delivery`/`confirm-delivery` actions and the
sidebar's "Order Something" button are all gone, replaced by a hint
pointing at Nile. `render.js`'s `renderDeliveries` updated to resolve a
delivery's display name from `ITEM_DEFS[d.defId]` instead of the deleted
free-text `d.item` field.

**Verification performed**, same fresh-iframe technique: the catalog
correctly listed all 53 purchasable items with price; adding eggs twice
correctly merged into one cart line at `units:2` (not two separate
lines); the cart screen correctly rendered `"Eggs × 2 — $8"` (2 × $4) via
`labelFn`; checkout charged exactly `$20` (`2×$4 eggs + 1×$4 dish soap +
$8 delivery`, matching a hand-computed expected total) and produced two
delivery records with `qty` correctly expanded through `buyQty` (2 units
× 12 eggs/unit = 24 eggs); advancing the clock past the ETA and running
`processDeliveriesForDay` correctly moved both stacks onto the doormat's
`.contents` and flipped delivery status to `delivered`.

### Browser

`APP_DEFS.browser` has two screens: `home` (`catalog` over the new
`SITE_DEFS_LIST`) and `site` (a new fourth generic renderer, `article`,
reading which page is open from live session state —
`apps.browser.openSiteId` — rather than `view.params`, matching the
`state:`-source convention Shop's cart already established). `SITE_DEFS`
(`defs.computer.js`) is five authored sites — a news site, three
skill-tutorial sites (cooking/fitness/tech, each carrying an
`ADD_SKILL_XP` effect), and one adult site, AfterHours, gated by
`requiresContentFlag: 'mature'`.

**Content is authored, not LLM-generated, in this pass.** The plan's
fuller design — pages generated at navigation and cached in a new
`kv.gen` folder via a `generateAndCache` helper, so a page is stable on
re-read and only paid for once — is real scope, deliberately deferred
rather than faked with a placeholder call. `SITE_DEFS[id].body` is a
static string for now; swapping specific sites over to generated content
later doesn't change anything about `visitSite`/`doBrowserVisit` or the
`article` renderer, only where `body` comes from.

**Content-flag gating is genuinely two-layered, not just a UI nicety.**
`render.computer.js`'s new `filterByContentFlags` hides any
`catalog`/`list` row whose `requiresContentFlag` isn't currently on
*before* it's ever drawn — so a gated site doesn't appear and then
refuse, it simply isn't there. `computer.js`'s `visitSite` independently
re-checks the same flag as the authoritative gate for anything that
reaches it another way (a future free-text path, an NPC-suggested link,
etc. — P5's classifyIntent will eventually route through here too). Both
fall back to `CONTENT_CONFIG.contentFlags` — the exact fallback P0's
prompt-side `buildContentSection` already uses, so "is mature content on"
means the same thing everywhere in the codebase now, not three slightly
different checks.

**Visiting a site applies its `effects` through the same trusted-producer
`applyEffects` path as any `ACTION_DEFS` entry** (`doBrowserVisit`,
`UI.COMPUTER`) — a tutorial site's `ADD_SKILL_XP` and AfterHours'
`ADJUST_NEED` lines are not a special case, just effects attached to
different content.

**Verification performed**: with default content flags (`mature: true`
out of the box, per `CONTENT_CONFIG` — "not gated by design"), the home
listing correctly showed all five sites including AfterHours. Visiting
Chef's Corner correctly awarded exactly 6 cooking XP and recorded a
`{day, tick, siteId, category:'tutorial', private:false}` history entry.
Visiting AfterHours correctly applied its need effects net of the one
tick of natural decay every visit costs — mood `+0.1` effect minus
`0.02`/tick decay landed at exactly `+0.08`; energy `-5` effect minus
`2`/tick decay landed at exactly `-7` — and recorded its history entry
with `category:'adult', private:true`. Flipping `contentFlags.mature` to
`false` correctly removed AfterHours from the listing *and* made a direct
`visitSite('afterhours')` call fail with "This content is disabled in
your settings" — both layers of the gate independently verified.

### Screen-nav fix (applies to every app, not new scope of its own)

Found while building Classes: there was no way back from a screen reached
only via a row action — Work's job board, once opened, had no path back
to the dashboard except closing the whole computer. Fixed generically
rather than per-app: `render.computer.js`'s new `renderScreenNav(gs, app)`
draws a small sub-nav (`#cs-screennav`, distinct from `#cs-tabs`, which
switches between *apps*) listing the current app's own screens, using a
new `label` field every screen definition now carries. A screen can opt
out with `hideFromNav: true` — Browser's `site` screen uses this (you
only ever reach it via a Visit click, and its own explicit "Back" button
already covers the return path); the nav renders nothing at all when an
app has fewer than two navigable screens, so Work/Shop/Browser/Classes
all got a working way back for free once this landed once.

### Classes (EduStream)

Paid, multi-lesson courses — distinct from Browser's free one-off
tutorial sites, and a real commitment: `COURSE_DEFS` (`defs.computer.js`,
4 courses across cooking/tech/fitness, one skill-gated at level 3) costs
money up front to enroll (skill-level-gated the same way `JOB_DEFS.
requiredSkills` gates job applications), then several timed lessons
(`computer.js`'s `attendLesson`) to actually finish. `catalog` (over the
new `COURSE_DEFS_LIST`) handles the enrollment screen; `list` (over
`state:apps.classes.enrolled`) handles progress and "Attend Lesson",
reusing both generic renderers from Shop/Browser with zero new render
code beyond a `.cost` fallback added to `catalog`'s price display (course
defs use `cost`, not `price`/`payPerBlock`).

**Verified**: screen-nav correctly listed both screens for all four apps
that have more than one, and correctly rendered empty for Browser's home
(since `site` is the only other screen and it's hidden). Enrolling
charged exactly the course's `cost` and auto-navigated to "My Courses".
Attending all 4 lessons of Knife Skills 101 correctly incremented
progress 1→2→3→4, moved the course from `enrolled` to `completed` on the
4th, and awarded exactly `60` cooking XP total (`4 × 15`). Re-enrolling in
a completed course and enrolling in a level-gated course the player
doesn't qualify for both correctly refused with the exact expected
reasons.

### Services (HomeCare)

Recurring hired help, not a one-off purchase. `SERVICE_DEFS`
(`defs.computer.js`) has two tiers: `standard_cleaning` (common areas
only) and `deep_cleaning` (`accessScope: 'all'` — bedrooms too). Hiring
(`hireService`, `computer.js`) charges the first visit immediately and
schedules `nextDay = day + cadenceDays`; **the visit itself happens
automatically at day rollover** (`processServiceVisitsForDay`, called
from a new `processServiceVisitsForDayUi` hook in `ui.js`'s
`processDayRollover`), not from a click — this is the first app content
whose payoff the player doesn't directly trigger.

**Cleaning is real, not narrated-only.** `cleanRoomObjects` resets every
`dirtyWhen`-tracked state on every object in scope back to
`def.states[key][0]` (the clean value, which is always listed first by
convention — no second "what does clean mean" table needed) and calls
WORLD's `refreshRoomCleanliness` afterward. `performCleaningVisit` scopes
this to `COMMON_ROOMS` or `ALL_ROOMS` depending on the service's
`accessScope` — this is the mechanic that gives `accessScope: 'all'`
actual teeth: a `deep_cleaning` hire really does enter every bedroom,
which is exactly the kind of housekeeper-caused boundary crossing STEALTH
(P6) will eventually attach a consequence to (narrated for now,
mechanically inert beyond the cleaning).

**A visit the player can't currently afford is postponed one full
cadence, not cancelled** — same "always playable, never a hard stop"
principle as rent, quests, and work deadlines.

**A real content gap found and fixed while testing this**: `bed`'s
`made`/`unmade` state (declared back in P1) had an empty `dirtyWhen`, so
it never affected derived cleanliness and cleaning services had nothing
to reset — the `deep_cleaning`-vs-`standard_cleaning` distinction would
have been *invisible* for any bedroom, since there was nothing there to
clean regardless of scope. Fixed in `defs.world.js`: `bed.dirtyWhen =
{made: {unmade: 0.15}}` (a light weight — an unmade bed is a minor
tidiness issue, not filth).

**Verified**: hiring correctly charged `costPerVisit` and scheduled the
next visit `cadenceDays` out. A `standard_cleaning` visit correctly reset
a filthy stove and a many-dishes sink to clean (kitchen cleanliness
50s→100) while leaving an unmade bed in the player's bedroom untouched
(common-only scope). Going broke before the next scheduled visit
correctly postponed it (`nextDay` pushed out again, no charge, object
states unchanged) instead of erroring or silently cancelling. Switching
to `deep_cleaning` correctly reached the bedroom and made the bed,
restoring cleanliness to 100 — confirming the scope distinction is now
mechanically real, post-fix.
