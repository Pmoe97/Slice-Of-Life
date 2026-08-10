# Architecture notes — the sandbox expansion

This file tracks the implementation of the sandbox-expansion plan (computer,
object model, items, skills, stealth, autonomy) and the Apartment Expansion
that followed it. This document — plus the section-header comments in each
`src/*.js` file and the git commit history — is the design record for what
has **already been built**. Keep it current as work lands; don't let it
drift.

Designs live in their own plan docs rather than here, so they survive across
sessions. **`src/ref/README.md` is the index of record** — it lists every
document, its folder, and its lifecycle. The table below is a summary of the
overhaul plans only; when the two disagree, the README wins.

Docs are sorted into `structural/` (always-current reference), `patterns/`
(the reusable Plan and Handoff-Prompt architectures), `wip/`, `complete/`,
and `archive/`. A plan and its `*-handoff-prompt.md` are a pair and move
between folders together.

| Plan doc | Covers |
|---|---|
| `src/ref/complete/economy-and-rent-plan.md` | Rent, cost stack, metered utilities, quarterly taxes, investing |
| `src/ref/complete/apartment-upgrades-plan.md` | Disrepair start, facility repair, quality → rent leverage |
| `src/ref/complete/game-opening-plan.md` | The Stardew-like intro and how the player acquires the apartment |
| `src/ref/complete/apartment-expansion-plan.md` | The Mirrored H layout (built — kept for the adjacency/room rationale) |
| `src/ref/complete/npc-overhaul-plan.md` | NPC bible/personality/memory system (built — kept for design rationale; no summary row below) |
| `src/ref/complete/renovation-occupancy-overhaul-plan.md` | Timed staged renovation jobs, per-bedroom facilities (**built** — all 4 phases) |
| `src/ref/complete/contractor-tutorial-overhaul-plan.md` | Del Connors, job pricing, the tutorial he anchors (**built** — all 4 phases) |
| `src/ref/complete/external-world-npcs-overhaul-plan.md` | External world: visit spine, contacts, maid, food delivery, friends-of-roommates, escorts, move-in advocacy (**built** — all 8 phases) |
| `src/ref/complete/restaurant-network-expansion-plan.md` | 12-restaurant roster, full menus, wrap-aware hours, cross-midnight deliveries (**built** — all 4 phases) |
| `src/ref/complete/afterhours-redesign-plan.md` | AfterHours site expansion: PH+EP blended feed, routed mini-site, player page + related rail, parody ads, watch persistence, Hot Singles NPCs (**built** — all 8 phases + audit) |
| `src/ref/complete/inventory-needs-menu-saves-plan.md` | Inventory, containers, eating, spoilage, needs rebalance, Set Meal, NPC inventories, save system v2, main menu (**built** — all 10 phases) |
| `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` | **Umbrella for six linked overhauls** turning the apartment sensory and the NPCs autonomous. Holds the cross-cutting decisions `R1`–`R8` and the theses for Plans 2–5. Read before any NPC or presentation work. |
| `src/ref/wip/npc-correctness-fixes-plan.md` | Roadmap Plan 0 — the five defects the 2026-08-10 NPC audit found: reversed conversation buffer, unreachable `early` relationship phase, FIFO memory eviction, pinned need economy, dead-field triage (**written, not started**) |
| `src/ref/wip/perception-and-signals-plan.md` | Roadmap Plan 1 — the signal substrate: emission, propagation over `ROOM_ADJACENCY`, decay, and one perception query shared by the player and NPCs (**written, not started**) |
| `src/ref/wip/prompt-generator-v2.md` | Decision-vector prompt architecture for the menu slideshow (**engine + 4 passes shipped**; optional pool expansion outstanding) |
| `src/ref/patterns/perchance-agent-handoff-prompt.md` | The original generic one-phase-per-session protocol (each overhaul now has its own; this is the ancestor) |

> An earlier revision of this file cited `src/ref/Original Prompt and Response
> Train.txt`, `src/ref/Perchance Helper AI - Next Steps.md` and `src/ref/Perchance
> Helper AI - P0 - P6 Audit + Plan.txt`. Those files were deleted; their
> still-relevant content is either in the phase sections below or in the
> plan docs above. The design brief now lives in this file and those docs,
> not in a chat transcript.
>
> A later cleanup (2026-08-04) deleted `src/ref/HANDOFF.md`,
> `src/ref/vocation-and-gigs-plan.md`, `src/ref/sleep-and-alarm-plan.md`,
> `src/ref/adult-content-overhaul-plan.md`, and `src/ref/BrineOS-The-Phone-plan.md` —
> each was fully built with a corresponding row already in the Status table
> below (Economy 2, Sleep & alarm, AfterHours redesign, and the nine BrineOS
> Phase rows respectively), so the plan docs had become pure duplication.
> `src/ref/HANDOFF.md`'s operational notes (iframe testing technique, load
> order, hard invariants) are folded into this file already.
>
> **The per-phase writeups below still cite those deleted docs on their
> `**Plan:**` lines.** Those citations are historical — they record which
> design doc a phase was built from, not a file you can open. The phase
> writeup itself is now the record. Don't go looking for the file, and
> don't treat a dangling citation as a missing document.

## Status

| Phase | Status | What it adds |
|---|---|---|
| P0 | **Done** | Effects engine, action registry, tone/content wiring |
| P1 | **Done** | World object model |
| P2 | **Done** | Items and inventory |
| P3 | **Done** | Skills and progression |
| P4 | **Done** | The computer (all 8 apps: Work, Nile, Browser, Classes, Services, Classifieds, IM, Stream) |
| P5 | **Done** | Free-action resolution pipeline |
| P6 | **Done** | Stealth, evidence, suspicion |
| P7 | **Done** | NPC autonomy — drives, chores, NPC-to-NPC social, IM texts |
| P8 | **Done** | Content volume expansion (sites, shows, items, events) |
| Apartment Expansion v2 | **Done** | 17-room Mirrored H, adjacency graph, floor plan, gated movement, NPC pathfinding |
| Time dilation | **Done** | Continuous rAF clock, context time scales, sim checkpoints |
| Adult content v2 | **Done** | Live-API AfterHours, masturbation, interruption + NPC peeping |
| Economy 1 | **Done** | Calendar: 360-day year, seasons, quarters |
| Economy 2 | **Done** | Gig board replacing JOB_DEFS (vocation-and-gigs-plan) |
| Economy 3 | **Done** | Flat cost stack: bills, cadences, splitting, cutoff consequences |
| Economy 4 | **Done** | Apartment upgrades: facilities, disrepair, quality → rent leverage |
| Economy 5 | **Done** | Usage-metered utilities (NPC actions meter too) |
| Economy 6 | **Done** | Quarterly taxes, deductions, auto-reserve toggle |
| Opening | **Done** | Solo start, inheritance framing, rent grace, first-day gig board |
| Sleep & alarm | **Done** | Alarm system, burnout, energy as a levelled stat |
| Upgrades deepening | **Done** | Facility decay/maintenance, appeal profiles, condition repair |
| AfterHours redesign | **Done** | Search bar, pagination, embed-refusal fallback |
| Investing | **Done** | Index funds (3 tiers), buy/sell, daily growth, tax integration |
| BrineOS Phase 0 | **Done** | Pre-flight refactors: time-context stack, device-parameterised nav, unknown-appId prune, `unique`-def backfill guard |
| BrineOS Phase 1 | **Done** | Banking merge (`bills`+`invest` → `bank` with Overview) + electric-bill softlock fix (world `pay-bills` chip) + truthful partial-payment reporting |
| BrineOS Phase 2 | **Done** | The phone as a world object: def, spawn, pickup/drop/plug (trusted-producer), battery/charging, derived presence. Both in-play verifications (overnight charge, sleep drain) done in a real kv save 2026-08-04 — see write-up |
| BrineOS Phase 3 | **Done** | The BrineOS shell: always-on FAB + phone overlay, home grid, shared-app render reuse, back/home nav on `world.phone.navStack`, battery/charging status bar, Settings (one DND boolean), death gate. Verified live over game and computer 2026-08-04 — see write-up |
| BrineOS Phase 4 | **Done** | The Tracker: `tracker.js`'s pure `buildTrackerEntries(gs)` deriving every obligation (rent, bills ×7, taxes, gigs, quests, deliveries, services, IM unread, courses, facility decay, high-tension), urgency ladder + `TRACKER` config, deterministic keys, dismiss/snooze intents on `world.phone`, Notifications/Agenda phone app with deep links, FAB badge gated by DND + presence. Verified live 2026-08-04 — see write-up |
| BrineOS Phase 5 | **Done** | App parity + connectivity: `devices:['computer','phone']` on all 10 `APP_DEFS` (home grid derived from the registry → 12 tiles), RenoFix wrench icon, `appBlockedReason` wiring `BILL_CUTOFF_EFFECTS` up for real (phone rides cellular — online apps need wifi+cellular both down), real phone-bill cutoff, work-from-phone penalty (`WORK_TUNING.phoneFocusMultiplier`), and the L11 fix: `afterHoursSession { device, startedTick }` replacing the sticky boolean with a fully derived `isAfterHoursSessionActive`. Verified live 2026-08-04 — see write-up |
| BrineOS Phase 6 | **Done** | Clock app (phone-only shell app, same pattern as Settings/Tracker) as a UI on the pre-existing alarm mechanic (`player.alarm`/`doSetAlarm`/`resolveSleepHoursWithAlarm` all predated BrineOS — no computer-side surface actually existed to remove); `doSleep` now depends on a live, charged phone to fire the alarm. Home grid → 13 tiles. Verified with exact energy/hour values — see write-up |
| BrineOS Phase 7 | **Done** | Autopay: opt-in per bill (rent excluded), processed after `processBillsForDayUi` in day rollover, one-shot-per-cycle gate, insufficient funds bounces a flat fee onto the balance instead of just sitting unpaid. Verified with exact dollar values — see write-up |
| BrineOS Phase 8 | **Done** | Camera app: photo records freeze a prompt+seed (never the cache blob — L10), regenerate identically after cache eviction, roll capped at 30. RenoFix "Snap Photo" for before/after shots; share a photo into an IM thread via the existing send/reply pipeline. Verified with a real mocked `root.generateImage` tracking call counts — see write-up |
| BrineOS Phase 9 | **Done** | Privacy/snooping: passcode setting auto-locks the phone on close; `snoop_phone` drive (isSnoopDrive, mirrors isPeepDrive) — new room-agnostic discovery pass, reused curiosity formula + first mechanical use of `personality.traits`; phone gets `evidenceKinds` at last; memory episode + suspicion (`general`, deliberately inert today) on discovery. Verified end-to-end against the plan's literal acceptance scenario — see write-up |

## Load order

`main.html`'s `<script>` tags are the dependency graph. Current order (all
tagged `?v=N` for cache-busting — bump **every** tag together, since a
partial bump is how you get a client running half-old code):

```
config.js → icons.js → defs.world.js → defs.actions.js → defs.computer.js
→ state.js → sim.js → world.js → items.js → effects.js → drives.js
→ actions.js → intent.js → skills.js → stealth.js → time.js → computer.js
→ tracker.js → phone.js → npc.js → prompt.js → llm.js → interruption.js
→ image.js → render.js → render.computer.js → render.desktop.js
→ render.phone.js → ui.js → ui.computer.js → ui.windowmanager.js
→ ui.phone.js
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
  the recipe once; `buildCookEffects` emits `DESTROY_ITEM` lines split
  across fridge/pantry as needed (`ingredientDestroyLines`), `SPAWN_ITEM`s
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
day-rollover hook, so the remaining apps became "add an `APP_DEFS` entry
+ a data source" work rather than new infrastructure — confirmed true in
practice: all eight apps (Work, Nile, Browser, Classes, Services,
Classifieds, IM, Stream — see their own sections below) shipped in this
same pass, in the end, needing only two more generic renderers (`list`,
`article`) plus two genuinely one-off ones (`applicant`, `chat`) beyond
`dashboard`/`catalog`.

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

### Classifieds (RoomList)

Roommate-wanted ads that produce **real move-ins**, not a scripted event.
`postRoommateAd` requires an empty bedroom and sets `apps.classifieds.
posted = {active, postedDay}`; a new `generateApplicantsForDay`
(`computer.js`), called from a `processClassifiedsForDay` hook in `ui.js`'s
`processDayRollover`, rolls a candidate roughly every other day (a seeded
coin-flip gate, capped at 3 pending applicants) using **the exact same
generator the initial cast uses** — SIM's `rollCastSlot` — biased away
from current residents' occupation categories and interest tags the same
way the original cast-generation pass already prefers variety.

**Applicants are real NPCs from the moment they're rolled**, not a
lightweight preview record promoted later: `createNpcFromBible(...,
'prospective')` writes them straight into `gameState.npcs` with
`residency.status: 'prospective'` — an enum value the character schema
has declared since P0 and `resolveTick` has always explicitly skipped,
but which nothing had ever actually produced until this. Verified
directly: a rolled applicant is invisible to `resolveTick` (absent from
its `npcUpdates`), exactly as designed.

**Zero LLM at day rollover, on purpose.** An applicant's name/visual/
history/sketch come from `llm.js`'s `fallback*` generators — the same
deterministic, seeded, templated functions a character-creation prose
expansion already falls back to on failure — not a live `generateText`
call. Day rollover runs unattended; the brief's "LLM only at player-
contact points" rule argues against firing a network call the player
didn't trigger, so this reuses the fallback path as the primary path
here rather than as an edge case.

**Interviewing is direct profile review for now, not an IM conversation.**
The plan's fuller design routes interviews through the IM app; since IM
doesn't exist yet, `classifieds.view-applicant` opens a `detail` screen
(new `applicant` renderer, a fifth generic-ish renderer — really a
one-off, since a bible profile view isn't a shape `catalog`/`list`/
`dashboard`/`article` naturally fit) showing the same fields the
character-creation preview already shows (occupation, want, wound, blind
spot), with Accept/Reject. Wiring this through IM once it exists is a
follow-up, not a redesign — `acceptApplicant`/`rejectApplicant` don't
care how the player decided.

**Accepting does the full move-in in one place**: `moveToRoom` (dead code
since it was written, now finally has a caller) assigns the room/bed,
`changeResidencyStatus` flips them to `resident`, `computeRent`
recomputes what everyone owes, a `castWeb` pair is created against every
current resident (via the existing `createBlankPair`) so relationship
tracking works immediately, and `claimRoomPersonalItems` transfers
ownership of *everything* unowned in their new room — not just the
explicitly-personal items (guitar/diary/jewelry box), but the desk/
wardrobe/nightstand too, since it's genuinely their room's furniture now
and P6's boundary checks will eventually want to know whose it is.
Rejecting simply deletes the prospective NPC record — nothing was ever
committed for them to leave behind.

**Verified**, via the fresh-iframe technique: posting required (and
correctly enforced) an empty bedroom, and a second post while one was
already active correctly refused. Forcing the day-rollover gate across
enough days produced a real applicant with `residency.status:
'prospective'`, confirmed invisible to `resolveTick`. Viewing and
rejecting an applicant correctly deleted their NPC record entirely.
Viewing and accepting a second applicant correctly: flipped them to
`resident`, assigned an empty bedroom, recomputed rent from `$1200` to
`$800`/person (2 residents + player, `2400/3`), created a `castWeb` pair
against the original resident, deactivated the listing, and claimed every
previously-unowned object in their new bedroom under their id.

### IM (Messages)

Real conversations with residents, through **the exact same LLM proposal
contract `doTalk`/`doPlayerAction` already use** — a text reply can move
`relPlayer`, land a memory fact, everything a scene conversation can do,
because it goes through the same `validateProposal`/`applyProposal`
(`npc.js`), just against a one-npc, no-room context.

**New context/prompt/call trio, parallel to the scene path rather than
reusing it directly** (the scene path is hardwired to room/phase/
cleanliness framing that doesn't fit a text thread): `npc.js`'s
`assembleImContext(gameState, npcId)` builds the same shape
`assembleContext` does (so `validateProposal`/`applyProposal` don't need
to know which path called them) but for exactly one npc, with
`roomObjects`/`carryItems` deliberately empty — nothing is physically
reachable over text, so any object/item effect a reply tried to sneak in
fails EFFECTS' reach-set check the same way an out-of-room reference
would. `llm.js`'s `buildImPrompt` reuses `buildNpcBlock` verbatim and
adds the npc's `textingStyle`; `callImLLM` is a deliberately *simpler*
parse ladder than `callLLM`'s (`JSON.parse`, then one regex dialogue
fallback, no brace-matching tier) since IM's contract is narrower —
dialogue and tiny deltas only, no narration field, no effects.

**Threads are session state** (`apps.im.threads: {npcId: {msgs, unread}}`),
sent via `computer.js`'s `sendImMessage` — player-initiated (called from
a click, not a tick), so the async LLM call inside it doesn't touch the
zero-LLM-in-ticks invariant. A failed/unparseable reply appends a system
line ("hasn't replied yet") to the thread rather than losing the
player's message or throwing.

**`chat` is a genuinely one-off renderer, not reused elsewhere yet** — it
draws message history plus an inline `<input>` + Send button scoped
entirely inside `#cs-body`, deliberately *not* reusing the footer's
`#input-bar` (which drives free-text scene actions): the two pipelines
don't need to know about each other. The input's value is read
synchronously by `UI.COMPUTER`'s `doImSend` before anything re-renders,
so losing the DOM node on the next `renderComputerScreen` call (which
always rebuilds `cs-body`) never loses what was typed.

**Two small, reusable extensions to existing machinery**, both needed for
the thread list specifically:
- `render.computer.js`'s `resolveScreenSource` gained a third source
  kind, the literal string `'residents'`, pulling current resident
  npcIds straight from `gs.npcs` — IM's contact list is npcs, not
  app-session data, so it doesn't fit the existing bare-name or
  `'state:'` forms.
- `list`'s rows can now be bare id strings (not just objects) — Classifieds'
  applicant list already needed this (see that section above); IM's
  thread list is the second consumer, confirming it as a real pattern
  rather than a one-off.

**NPC-initiated texts are not wired.** The plan's fuller design has an
autonomy drive set a `pendingIntent` on a thread during a tick (pure,
no LLM), with the LLM only writing the actual message once the player
opens the thread — but autonomy (P7) doesn't exist yet. Threads are
player-initiated only for now; `pendingIntent`/unread-from-the-house-side
is a P7 follow-up, not a redesign of anything built here.

**Verified**, via the fresh-iframe technique with a mock `generateText`
that parses the npc name/id out of its own prompt template and returns a
realistic reply: opening a thread and sending a message correctly
appended both the player's line and the parsed reply to `msgs`; the
mocked relationship/mood deltas (`trust +0.05`, `mood +0.03`) applied
exactly through the real `applyProposal`. A full kv round-trip
(`loadGameState` after close) confirmed both the thread history and the
npc's `relPlayer`/`mood` changes persisted correctly. Switching the mock
to return unparseable garbage correctly produced the "hasn't replied yet"
fallback instead of a crash or a lost message. Manually setting a
thread's `unread` count and opening it correctly cleared it. (One
false-alarm along the way: a synthetic test house built via
`SIM_generateHouse` alone — bypassing the normal
`approveCastAndStartGame` prose-expansion step — legitimately has a blank
`bible.name`, by design; patching in a name confirmed the actual display
logic was correct all along. Worth remembering for any future test setup
that needs a *named* NPC, not just a game state.)

### Stream (Streamly)

The simplest of the eight — one screen, reusing `catalog` with **zero
new render code**, not even the `.cost`/`.price` fallback chain (shows
are free; the price column just renders empty). `STREAM_DEFS`
(`defs.computer.js`, three shows) plus `watchEpisode` (`computer.js`,
tracking `resumePoints`/`watchHistory` per show) round out P4.

**Verified**: watching applied the show's `moodGain` net of the
episode's own tick decay to the exact expected value (`+0.1` effect −
`0.02/tick × 2 ticks` = `+0.06`); watching the same show twice correctly
incremented the episode number both times (confirmed via the
`watchHistory` log, since a naive before/after snapshot of
`resumePoints` without cloning hit the same live-reference aliasing
pitfall noted in earlier sections — a reminder for next time, not a
product bug). A final full regression sweep opened all eight apps in one
session and confirmed every one rendered without error, with all eight
labels present in the app tab bar (WorkHub, Nile, Browser, EduStream,
HomeCare, RoomList, Messages, Streamly).

## P5 — Free-action resolution pipeline

**New file:** `src/intent.js` (loaded after `actions.js`, before `skills.js`
— needs `ACTION_DEFS`/`resolveAvailableActions` from ACTIONS, needs to load
before UI calls it). `classifyIntent(text, gameState)` is the single entry
point: normalizes the input (lowercase, strip punctuation, collapse
whitespace), then tries three deterministic match tiers in order —
registered actions, room movement, a small fixed set of "quick" verbs —
and returns `null` if none hit, which is the existing LLM narrative path's
unchanged cue to run.

**Why free text used to always cost an LLM call.** `UI`'s `doPlayerAction`
called `callLLM` unconditionally for every free-text input, even "eat" —
there was no attempt to check whether the game already had a deterministic
answer. `ACTION_DEFS` entries had carried a `verbs` array (free-text
synonyms) since P0, unused by anything; this is the pass that finally reads
them.

**Match strategy: longest whole-phrase substring wins, no fuzziness beyond
that.** `matchVerbPhrase` checks each candidate phrase as a `\b`-bounded
substring of the normalized input and keeps the longest one that hits —
"grab a bite" (a `self.eat` synonym) beats a bare "eat" if both happen to
appear, so more specific phrasing wins over generic. Deliberately no
scoring model, no LLM-based classification: this has to stay in the same
zero-latency, zero-cost tier as the rest of the deterministic action
system, and plain substring matching is easy to reason about and to add
new verbs to later.

**Three match tiers, in order:**
1. **Registered actions** — for every action `resolveAvailableActions`
   currently reports as `ok:true` (so out-of-context/ungated actions never
   match), tries `matchVerbPhrase` against that action's `verbs` plus its
   `label`. A hit routes through the existing `runRegisteredAction` —
   `intent.js` never touches `applyEffects`/`executeAction` itself, it only
   decides which registered action id, if any, the text means.
2. **Movement** — `matchRoomIntent` checks the input against each room's
   display name, or (for a resident's bedroom specifically) that resident's
   name adjacent to "room"/"bedroom" — "go to marcus's room" and "marcus
   room" both resolve without the player needing to know room-id
   vocabulary. This is the tier P6 depends on: free-text room entry and a
   room-map click now converge on the exact same `doMove` call, so P6 only
   needs one stealth hook, not two.
3. **Quick verbs** — a small fixed table (`QUICK_INTENTS`, in `intent.js`
   itself, not `config.js`: this is structural glue naming which hand-
   written UI.js functions are free-text-reachable, not a tunable number)
   covering `sleep` and `pay-rent`. Both are already deterministic,
   argument-free, side-effect-safe functions (`doSleep`/`doPayRent`) — no
   reason to force them through `ACTION_DEFS`'s trusted-effects-list shape
   just to make them free-text-reachable.

**Scope decision: `talk`/`work`/`ask-to-leave` stay out of `classifyIntent`
for this pass.** `talk` in particular doesn't fit `ACTION_DEFS`'s shape
without a real change to `executeAction`'s contract — it would need a new
`source.kind:'npc'` and a `requiresLLM` flag, since its entire point is an
LLM-generated conversation opener, not a deterministic effects list.
`work`/`ask-to-leave` are already button/chip-only (multi-step computer app
state; residency mutation with an NPC target) with no product reason to
build free-text target-matching for them now. Free-text "talk to X"
continues to fall through to the unchanged LLM path.

**`UI`'s `doPlayerAction` change**: `classifyIntent` runs first, before
`showLoading`/the LLM call. Each matched branch (`runRegisteredAction`/
`doMove`/`doSleep`/`doPayRent`) is called and returned from directly — they
each already manage their own loading state, persistence, and render, so
this is purely a routing shortcut, not a second implementation of any of
them. A `null` classification falls through to the existing LLM-call code,
completely unchanged.

**Verified**, via the fresh-iframe technique (a genuine `navigate()` reload
was confirmed stale against an edited `ui.js` mid-session — same gotcha
HANDOFF.md documents — so the iframe fix was necessary, not optional, this
time) with a real house from `SIM_generateHouse`/`writeGeneratedGameState`/
`loadGameState` and a mocked `root.generateText` that counts calls:
- `classifyIntent('eat something', gameState)` in the kitchen → `{kind:
  'registered', actionId:'self.eat'}`; `classifyIntent('take a shower', …)`
  in the bathroom, `'put on a show'`/`'unwind'` in the living room → the
  correct `self.shower`/`self.watch_tv`/`self.relax` matches. An
  out-of-context probe (kitchen actions while in the bathroom) correctly
  fell through to `null`.
- End-to-end through `doPlayerAction`: `"eat something"` raised
  `player.hunger` (80→100, capped) with **zero** `generateText` calls;
  `"go to the kitchen"` from the living room moved `player.location` to
  `'kitchen'` with zero calls; `"sleep"` restored energy to 100 with zero
  calls; `"pay the rent"` zeroed `rentOwed` and deducted the exact amount
  from `player.money` with zero calls. An out-of-vocabulary probe ("I
  stare out the window and think about my life") correctly fell through
  and made exactly one `generateText` call — confirming P5 is additive:
  every existing LLM-narrative behavior is unchanged for anything
  `classifyIntent` doesn't recognize.

## P6 — Stealth, evidence, suspicion

Landed on top of stubs P0/P1/P2 had already left waiting: `WITNESS`/
`ADJUST_SUSPICION`/`LEAVE_EVIDENCE` were declared in `EFFECT_DEFS` with
`implemented:false` since P0; `OBJECT_DEFS.evidenceKinds` and every spawned
object's `evidence: null` field since P1; `SERVICE_DEFS.accessScope` since
P4; `SKILL_CURVES.stealthSuccess` since P3; `FLAG_PATTERNS` already had
`intruded_.+`/`suspects_.+` reserved. This phase is almost entirely
*consuming* prior phases' foresight, not inventing new surface area.

**Data model.** `npc.suspicion: {subject: 0..1}` (`SUSPICION_SUBJECTS`:
`boundary_violation`, `general` — only the former is written this pass, the
latter reserved for a future non-boundary source like theft) is a new
sibling of `relPlayer`/`flags`/`memory`, added to `createNpcFromBible`
(sim.js) the same way `player.skills` landed in P3 — additive default, no
`FOLDER_VERSIONS` bump, every read/write guards with `|| {}`. Never touches
`npc.bible`, which stays frozen exactly as the hard invariant requires;
`bible.boundary` is read-only here.

**`BOUNDARY_POOL` gained a `category` field** (`config.js`): each of the 12
pool entries is now `{text, category}` instead of a bare string, with only
`'their bedroom is sacred space...'` tagged `room_access` (the other 11 are
`'other'`, reserved for future food/topic/schedule boundary mechanics this
pass doesn't build). `sim.js`'s one consumption site changed from
`weightedPick(...).val` to `.val.text` — `bible.boundary` is still drawn
and stored as plain prose, byte-identical to before; this is a parallel
lookup table, not a bible schema change. `stealth.js`'s
`findBoundaryCategory(boundaryText)` reverse-looks-up an NPC's frozen
boundary string against the pool to decide whether their authored boundary
is specifically room-related (sharper reaction, `matchedBoundaryMultiplier`)
or not (still real, generic).

**`EFFECT_DEFS` implementations** (`effects.js`): `WITNESS` writes a memory
episode (`WITNESS_MEMORY_TEMPLATES`, 2nd-person since `subjectRef` is
validated player-only this pass — NPC-witnesses-NPC is P7 territory) plus a
`noticed_boundary_*`/`suspects_*` flag (already-reserved `FLAG_PATTERNS`).
`ADJUST_SUSPICION` clamps `npc.suspicion[subject]` to `[0,1]`, capped per-
call by a new `EFFECT_LIMITS.suspicionDeltaCap` (0.4). `LEAVE_EVIDENCE`
validates the object actually declares that evidence kind
(`OBJECT_DEFS.evidenceKinds`) and writes `{kind, strength, day,
discovered:false}` onto the object instance, capped by a new
`evidenceStrengthCap`. All three added to `prompt.js`'s
`SCENE_EFFECT_VOCAB`, so the LLM narrator can now also emit them mid-scene.
`SET_ROOM_STATE` deliberately stays `implemented:false` — still a general
"arbitrary room key/value" primitive with no stealth-specific consumer;
forcing a use for it now would be exactly the sprawling-unfinished-system
trap the phase was scoped to avoid.

**New file `src/stealth.js`** (loaded after `skills.js`, before
`computer.js`): `resolveRoomEntryStealth(gameState, roomId)` is the one
entry point, called from `UI`'s `doMove` right after `player.location` is
set (so "who's home" reflects who was actually there when the player
walked in, not next-tick positions). A **trusted producer** — same trust
tier as `ACTIONS`' `executeAction` — it builds `WITNESS`/`ADJUST_SUSPICION`/
`REL_DELTA` (direct witness) or, when the room's owner is out,
`ADJUST_SUSPICION`/`ADD_FLAG intruded_<room>`/`LEAVE_EVIDENCE` (sneak,
gated by a `skillMod(player, 'stealth', 'stealthSuccess')` roll against a
tick/room-scoped seeded rng) as effect-DSL lines, then calls `applyEffects`
directly — never `validateEffects`, per `EFFECTS`' own trust-boundary rule.
A successful sneak (roll beats the stealth curve) leaves zero state change
at all, narration-only. `pickEvidenceObject` weight-picks among the room's
`private`+`evidenceKinds` objects (today: diary, desktop computer).

**`UI.doTalk` gained a deterministic pre-LLM confrontation check**: if
`npc.suspicion.boundary_violation` is at/above `STEALTH_TUNING.
confrontThreshold` (0.5), a templated `BOUNDARY_CONFRONT_TEMPLATES` line
logs before the LLM ever runs (guaranteed reaction, not left to the
narrator's discretion), and suspicion is multiplied down by
`confrontDecayFactor` (0.5) so the same conversation doesn't refire it —
a fresh incident can still push it back over threshold later. Falls back
to `'Your roommate'` (matching this function's existing LLM-prompt-line
fallback) rather than a bare pronoun, avoiding a subject-verb-agreement
trap described below.

**Evidence discovery** extends `SIM`'s existing `resolveTick` pass 2
(sim.js) rather than a new subsystem: a resident resolved into their own
room this tick rolls against any undiscovered evidence there
(`baseEvidenceDiscoveryChance` + `strength × evidenceStrengthDiscoveryFactor`),
flips `.discovered` in place, and pushes an `evidence_discovered` event —
`resolveTick` only *decides and records*, staying synchronous/LLM-free.
`UI`'s `advanceAndResolve` (which already turns every event into a memory
episode) adds one branch: on `evidence_discovered`, apply an
`ADJUST_SUSPICION` bump the same trusted-producer way `doMove` does.

**Housekeeper consequence** closes a loop P4's own code comments already
flagged: `computer.js`'s `performCleaningVisit`, when the hired service's
`accessScope` is `'all'` (deep cleaning), now rolls per bedroom-with-an-
owner for a chance to leave a `MEMORY_EPISODE` + small `ADJUST_SUSPICION`
(`housekeeperSuspicionDelta`, deliberately smaller than a direct sneak).
Runs from `processServiceVisitsForDay`, called from `processDayRollover` —
templated text, no live `generateText` call, same reasoning as
Classifieds' `fallback*` prose generators.

**A real pre-existing bug, found and fixed while wiring `doMove`**:
`UI`'s `advanceAndResolve` used `updateNpc` (a kv *read*-modify-write) to
apply the per-tick memory-episode-addition and decay passes. Since
`updateNpc` reads from kv rather than from the live `currentGameState`, any
in-memory-only NPC mutation made earlier in the same handler — exactly what
`resolveRoomEntryStealth` (and `doTalk`'s new confrontation check) does —
was silently clobbered the moment `advanceAndResolve` ran afterward and
touched that same NPC, which it almost always does once an NPC has any
memory episodes at all (true for nearly every NPC past turn one). Direct
witness testing caught this immediately: suspicion and the fresh memory
episode both reverted to their pre-move values. Fixed by having both loops
operate on and write back to `currentGameState.npcs` directly (`add
MemoryEpisode`/`decayMemory` are already pure functions — `EFFECTS`'
`applyMemoryEpisodeEffect` calls `addMemoryEpisode` the exact same way)
instead of round-tripping through kv; persistence still happens correctly
at the next `saveAtBoundary`, same as every other in-memory-only mutation
in the codebase already relies on. This was latent in `doTalk`'s existing
`applyProposal` effects block too (mutate-then-`advanceAndResolve`, same
shape), not something P6 introduced — P6 just exercised the path for the
first time in `doMove`, which previously never mutated NPCs before
advancing.

**A grammar bug caught by testing, not by inspection**: an early draft of
`doMove`'s witness narration used `${npc.bible.name || 'They'} looks up...`
— correct for a real name, wrong subject-verb agreement for the pronoun
fallback ("They looks up"). Fixed to two full alternative sentences
(`'<Name> looks up...'` / `'Someone looks up...'`) rather than a
single template with a pronoun substituted into a name-shaped slot —
avoids the general singular-they/proper-name conjugation clash rather than
papering over this one instance of it.

**Verified**, via the fresh-iframe technique against real houses from
`SIM_generateHouse`/`writeGeneratedGameState`/`loadGameState`:
- **Config-only groundwork**: `BOUNDARY_POOL` reshape confirmed
  byte-identical `bible.boundary` prose (still a plain string, matches a
  pool entry's `.text` exactly) and every fresh NPC got `suspicion: {}`.
- **Effect implementations** (direct `validateEffects`/`applyEffects`
  calls): valid `WITNESS`/`ADJUST_SUSPICION`/`LEAVE_EVIDENCE` all applied
  correctly (memory episode + flag; suspicion delta; `.evidence` written
  with the right kind/strength). Rejections confirmed exactly as designed:
  suspicion delta over `±0.4` → `"suspicion delta too large"`; an unknown
  subject (`theft`) → `"Unknown suspicion subject"`; a mismatched evidence
  kind → `"Computer can't carry evidence of kind..."`.
- **Direct witness** (owner home): `suspicion.boundary_violation` → exactly
  `0.35`, `relPlayer.tension` → `+0.1`, a fresh memory episode, and the
  `noticed_boundary_player` flag — all from a single `doMove` call, with
  the narration log correctly showing `"<Name> looks up as you come in."`.
- **Sneak, forced caught** (`skillMod` overridden to force the roll):
  `player.flags.intruded_<room>` set, suspicion bumped by exactly `0.15`
  (the smaller, indirect delta), and — in a room actually containing a
  diary — `.evidence` populated with `{kind:'personal_item', strength:0.4,
  discovered:false}`. **Sneak, forced clean**: zero state change of any
  kind, confirming a successful sneak is genuinely narration-only.
- **Confrontation**: seeding `suspicion.boundary_violation = 0.6` and
  calling `doTalk` produced the deterministic confrontation line and
  dropped suspicion to exactly `0.3` (`0.6 × 0.5`); an immediate second
  `doTalk` correctly did not refire (stayed below `confrontThreshold`).
- **Evidence discovery**: with undiscovered evidence planted and the clock
  forced into the owner's sleep block (guaranteeing `resolveTick` resolves
  their location to their own room) and the roll forced to succeed, a
  single `advanceAndResolve` flipped `.evidence.discovered` to `true`,
  produced an `evidence_discovered` event, added the matching memory
  episode, and bumped suspicion by exactly `0.15`.
- **Housekeeper**: hiring `deep_cleaning` and forcing 60 daily
  `processServiceVisitsForDay` calls produced memory episodes mentioning
  "cleaning service" and suspicion accumulating (clamped at `1.0`, as
  designed) on the affected resident, with **zero** `generateText` calls
  across the entire run — confirming day-rollover stays LLM-free.
- **Trust boundary**: confirmed via the same `validateEffects` calls above
  that the three new types are LLM-legal (`llm:true`, now `implemented:
  true`) and enforce their caps exactly like every other LLM-tier effect.

## P7 — NPC autonomy (drives)

**New file:** `src/drives.js`.

`DRIVE_DEFS` (CONFIG) is the data half: each entry declares `gates` (need
thresholds), a `weight` (roll chance), `cooldownTicks`, a `blockFilter`
(which schedule blocks it may fire in), and `effects` in the same DSL every
other producer uses. `evaluateDrives(npc, npcId, npcs, resolved, gameState,
rng, currentTick)` runs as `resolveTick`'s pass 3, after locations and needs
are settled, so a drive sees the tick it is actually acting in.

Drives are deterministic and LLM-free by construction — that is the whole
point of the phase. An apartment that only moves when the player talks to it
reads as a diorama; drives are what make it a household.

**Behaviours:** `self_care` (shower/eat against low needs), `seek_company`
(relocate to a common room), `clean_common`, `do_laundry`,
`chat_with_roommate` (applies a `castWeb` delta between two NPCs),
`text_player` (queues an IM), and `peep_player` (see Adult content v2).

**Things that bit us here, recorded so they don't recur:**

- Cooldowns live on `driveResult.updatedNpc.flags`. `resolveTick` has to
  merge that back into `npcUpdates[id]` or every `cooldownTicks` in the file
  is decorative.
- More generally: effect appliers are split between ones that **mutate** the
  npc in place (`REL_DELTA`, `ADJUST_SUSPICION`) and ones that **replace**
  `gameState.npcs[id]` wholesale (`MEMORY_EPISODE`, via `addMemoryEpisode`'s
  pure return). `npcUpdates[id]` is built from the *pre-drive* snapshot, so
  anything the replacing kind wrote is lost unless explicitly pulled back.
  `resolveTick` now re-reads `needs`, `memory`, `relPlayer` and `suspicion`
  from `gameState.npcs[id]` after the drive loop. **Any new field an effect
  can touch has to be added there too.**
- `clean_common` and `do_laundry` originally had no mechanical effect at all
  — they narrated a chore and changed nothing. A drive that doesn't move
  state is a lie told to the player.
- `moveToCommon` used to only relabel the NPC's activity; it now actually
  relocates them, weighted against rooms already at capacity.

## P8 — Content volume

No new systems — `SITE_DEFS`, `STREAM_DEFS`, `ITEM_DEFS`, `OFFSCREEN_EVENTS`
and the activity tables were widened. The point of the phase was that all of
it is *data*: nothing in P8 required touching a renderer or a resolver,
which is the standing test of whether the earlier phases actually earned
their abstractions.

## Apartment Expansion v2 — the Mirrored H

8 rooms → 17. See `src/ref/complete/apartment-expansion-plan.md` for the layout
rationale; the architectural facts:

- **`ROOM_ADJACENCY` (CONFIG) is the authoritative spatial graph.** It must
  stay symmetric and fully connected — `findPath` (SIM, BFS) and the floor
  plan both assume it. Promoted out of `drives.js`, where it had been a
  private detail of the peep check.
- **`ROOM_LAYOUT` (CONFIG)** gives each room `{x,y,w,h}` in SVG viewBox
  units. `renderFloorPlan` (RENDER) draws rects, dashed adjacency connectors
  and NPC dots, replacing the flat room list.
- **Movement is gated.** `doMove` refuses non-adjacent rooms and names the
  next room along the path instead. Distant rooms render `pointer-events:
  none`, so the floor plan can't offer a move the rules will reject.
- **NPCs path rather than teleport.** `npc.transit = {path, progress,
  destination}` carries a journey across ticks, one room per tick. NPCs in
  transit are skipped by the drive loop — otherwise a drive's
  `activityOverride` would have them cooking in a hallway.
- **`ACTIVITY_ROOM_PREFERENCES` (CONFIG)** routes an activity to a room, so
  "exercising" happens in the gym rather than wherever the crowd-avoidance
  roll landed. A `null` entry means "stay put"; callers must fall back to
  the NPC's own room, not to `null`, or an NPC coming home from work never
  materialises.

## Time dilation — the continuous clock

**New file:** `src/time.js`. Replaces "one player action = one tick".

A rAF loop adds game-minutes to `meta.clock` at the current context's
`TIME_DILATION.scales` rate (idle 20, browsing 10, conversation 1,
masturbating 3, working 25 game-minutes per real second). The NPC sim runs
at checkpoints every `simCheckpointMinutes` of accumulated game-time.

**The invariant this file exists to hold: exactly one owner advances
`meta.clock` per path.**

- *Continuous path* — `clockFrame` advances the clock; the checkpoint it
  fires calls `advanceAndResolve(ticks, { advanceClock: false })`. When both
  advanced, the game ran at literally double speed.
- *Discrete path* — sleep, work blocks, cum, every `ACTION_DEFS` verb —
  calls `advanceAndResolveMinutes(minutes)`, which pauses the loop, lets
  `resolveBatch` step the clock one tick at a time (so each tick's schedule
  resolution sees the right time of day), then settles on the exact target
  minute.

`advanceAndResolveMinutes` computes ticks as *30-minute boundaries crossed*,
not `round(minutes/30)`. A 15-minute action at 10:20 crosses 10:30 and costs
a tick; the same action at 10:00 crosses nothing and costs none. The clock
is its own carry, so short actions are cheap on average without a separate
accumulator — and, critically, `timeCost` values in `defs.actions.js` mean
what they say instead of all rounding up to one tick.

Two failure modes worth remembering:

- **rAF chains multiply.** Pausing the loop from inside a callback that then
  re-schedules itself leaves an orphan chain alive; resuming starts a second
  one beside it. `clockGeneration` is bumped by every pause/stop/start, and
  a callback whose generation is stale returns without re-scheduling.
- **Day rollover has two possible triggers.** `resolveBatch`'s clock advance
  used to be what made `advanceAndResolve` notice midnight; once checkpoints
  stopped advancing the clock, the continuous path needed its own detection.
  Both funnel through `markDayRolledOver`/`hasDayRolledOver` so
  rent/deliveries/quests fire exactly once per day.

## Sleep and rent (current numbers)

Both are pressure systems and both were re-tuned after the expansion; the
designs they are heading toward live in `src/ref/sleep-and-alarm-plan.md` and
`src/ref/complete/economy-and-rent-plan.md`.

- **Sleep** is 6–8 hours scaled by energy at bedtime (drained → long night),
  and energy recovered is proportional to hours *actually* slept. That
  proportionality is what will give the planned alarm system teeth. Passing
  out from exhaustion recovers at `restEfficiency` of the normal rate, so
  collapsing can never be a shortcut past going to bed — it was, briefly,
  and the need system spent that time arguing against itself.
- **Rent is not an even split.** The player holds the lease and owes the
  whole amount; each roommate offsets at most
  `ECONOMY.rent.maxRoommateShare` (20%) of the total via
  `residency.rentShare`. Solo is deliberately not payable. Recruiting is the
  relief valve, and one roommate is never enough to solve it.

## Adult content v2 — AfterHours, interruption, peeping

**New files:** `src/interruption.js`, plus the bubble sections in
`ui.computer.js`.

- **AfterHours is live.** Categories map to search queries against the host's
  webmaster API, fetched through `superFetch` and embedded as iframe
  players; `SITE_DEFS.afterhours.adultContent.entries` no longer exists.
  Some clips return an embed refusal — a redesign to behave more like the
  host's own site is planned (`src/ref/adult-content-overhaul-plan.md`).
  Everything on a clip is third-party text: build those nodes with
  `textContent`, never an `innerHTML` template.
- **Browsing is free; cumming is the action.** Watching costs nothing.
  `doAfterHoursMasturbate` enters a state (3x time scale) and starts
  background pre-generation of the likeliest interrupter's line;
  `doAfterHoursCum` is the discrete cost (`MASTURBATION.timeCostMinutes`)
  and rolls the interruption check. The warmup gate is derived from
  `afterHoursWarmupUntilMs` in state — a `setTimeout` scheduled from inside
  the render pass re-armed on every re-render and never elapsed.
- **`INTERRUPTION` (CONFIG)** weights the walk-in roll by door state,
  time-of-day phase, NPC personality, schedule block and relationship.
  `getDoorState` (WORLD) reads the room's door object; locking a door is a
  cheap action with a real mechanical payoff.
- **NPC peeping is the mirror** of the player's `resolvePeep`. Most attempts
  are silent — the player never learns of them, and the NPC banks a memory.
  If the player's perception beats the NPC's stealth, a bubble appears with
  a three-response choice.
- **Vulnerability is an explicit, transient flag**, not an inference.
  `ACTION_DEFS.vulnerableState` (currently `self.shower`) and `doSleep` set
  `player.flags._vulnerableState` for exactly the ticks the action resolves,
  via `withVulnerableState`. The first version inferred it from location and
  phase — merely standing in a bathroom counted as showering — which had
  NPCs peeping at a fully-dressed player walking through.

**Both bubbles are DOM-injected, outside the render cycle**, because
`renderWindows` does `innerHTML = ''` on every window body. They append to
`#computer-screen`, which survives re-renders. Their `dismiss` is
single-shot and removes its own `keydown` listener — a listener that
outlives its bubble means the next Escape applies the consequences again.

## The opening — solo start (Phase 7)

**Plan:** `src/ref/complete/game-opening-plan.md`.

The game no longer generates a full household at new-game. Instead the
player inherits a luxury apartment alone — empty bedrooms, everything in
disrepair, and 14 days before the first rent bill. This is the Stardew-like
opening the plan called for: the empty bedrooms are the visible statement
of the problem, and the first objective (repair a bedroom → post a
Classifieds listing → accept a roommate) writes itself.

**What changed:**

- `ECONOMY.opening` (config.js) — new config block: `soloStart`,
  `rentGraceDays: 14`, `firstBillDelay: 7`.
- `ECONOMY.startingMoney` — $3,500 → $3,800 (≈2 weeks of solo rent at
  $1,900/wk; buys time, not safety).
- `SIM_generateHouse` (sim.js) — when `soloStart` and `residentCount === 0`,
  skips cast generation entirely and calls `buildGameState` with an empty
  cast. The existing classifieds/recruitment machinery (applicant
  generation, move-in, habitability gate) handles all later roommates.
- `buildGameState` (sim.js) — `rentDueDay` now uses `rentGraceDays`; rent
  is recomputed after `world.upgrades` exists so the starting split
  reflects disrepair. Fixed a pre-existing bug where `computeRent` was
  called with a `gameState` reference that didn't exist yet during
  `buildGameState` — it only worked before because the old new-game
  path always had residents.
- `initBillState` (sim.js) — utility first-due days shifted by
  `firstBillDelay` so the opening isn't a wall of bills on day one. Rent
  in the bill table aligns with `rentDueDay`.
- `generateGigsForDay` (computer.js) — day 1 always generates (skips the
  30% dry-spell roll) so the solo-start player has immediate income.
- `startSoloGame` (ui.js) — new function: generates a solo game, writes
  to kv, populates the day-1 gig board, and shows the opening message.
  Replaces the old character-creation modal as the primary new-game path.
- `showMenuModal` (ui.js) — "New Household" with Random/Guided/Manual/Seed
  replaced with a single "Start New Game" button that calls
  `startSoloGame`. The old cast-creation modal and its actions
  (`new-game-random` etc.) remain in the code for the legacy path but
  are no longer reachable from the menu.

**Verified:**

- Solo start produces 0 NPCs, $3,800, apartment quality 0.02 (all
  facilities broken except kitchen_appliances), rent $1,900/wk with player
  carrying the full amount.
- Rent due day 15 (14-day grace). Utility bills start at day 19+ (7-day
  delay). Phone/insurance at day 35/37.
- Gig board populated on day 1 (3 entries) despite the seed's RNG rolling
  a dry-spell value (0.82 > 0.7) — the day-1 override works.
- Classifieds recruitment path is intact: `generateApplicantsForDay`
  handles 0 existing residents gracefully (empty `usedCats`/`priorTags`).

## Sleep, alarm, burnout, energy levelling (Phase 8)

**Plan:** `src/ref/sleep-and-alarm-plan.md`.

The sleep duration model (6–8 hours scaled by energy at bedtime) was
already built. This phase adds the three systems the plan called for:
the alarm, burnout, and energy as a levelled stat.

**The alarm system** — the player can set an alarm that caps the night.
It can only shorten sleep, never extend it. If the natural night would
end before the alarm, nothing happens. If the alarm would fire
mid-night, the player is woken early and recovers only
`hoursActuallySlept × restorePerHour`. The bad case this creates: very
drained + went to bed late + early alarm → you needed 8 hours, got 5,
start the day at 67 energy and it compounds.

- `SLEEP.alarmMinHour` / `alarmMaxHour` (config.js) — alarm can be set
  between 04:00 and 12:00.
- `player.alarm` (sim.js) — null = no alarm, 0–23 = the alarm hour.
- `resolveSleepHoursWithAlarm` (sim.js) — wraps `resolveSleepHours` to
  cap the night at the alarm. Returns `{ hours, alarmFired }`.
- `doSetAlarm` (ui.js) — sets or clears the alarm.
- `matchAlarmIntent` (intent.js) — free-text intent: "set alarm for 6am"
  → hour 6, "clear alarm" → null. Validates against `alarmMinHour`/`Max`.
- `doSleep` (ui.js) — uses `resolveSleepHoursWithAlarm` instead of
  `resolveSleepHours`; appends "The alarm dragged you out of bed." when
  the alarm fires.

**Burnout** — working near the energy ceiling day after day must hurt.
`consecutiveWorkDays` tracks days above `BURNOUT.workBlockThreshold` (6
blocks); each raises `burnoutLevel` by 0.12. Rest days reduce it by 0.20.
`burnoutLevel` scales a mood penalty (`getBurnoutMoodPenalty`, 0.4 at
full) and a work-pay multiplier (`getBurnoutWorkPayMult`, 0.5 at full).
The death-spiral is the feature: burnout makes grinding progressively
less profitable, not just unpleasant.

- `BURNOUT` (config.js) — all tuning knobs.
- `player.burnout` (sim.js) — `{ consecutiveWorkDays, burnoutLevel,
  lastWorkDay }`.
- `updateBurnout` (sim.js) — called at day rollover from
  `processDayRollover` with `gigs.workBlocksToday`.
- `gigs.workBlocksToday` (computer.js) — incremented by `workGigBlock`,
  reset at day rollover.
- `computeFocusMultiplier` (computer.js) — subtracts `getBurnoutMoodPenalty`
  from effective mood before computing the focus factor.
- `workGigBlock` (computer.js) — multiplies progress by
  `getBurnoutWorkPayMult`, so burnout makes each block less productive.

**Energy as a levelled stat** — starting energy is 70 (not 100) and grows
via sleep consistency and exercise. A lower ceiling means fewer work
blocks per day, making early rent harder and the pressure to recruit
sharper. `energyMax` rises by 0.5 per good sleep (near natural bedtime,
no alarm) and 1.0 per workout, capped at `ENERGY.absoluteMax` (100).

- `ENERGY` (config.js) — `startingMax: 70`, `absoluteMax: 100`,
  `growthPerGoodSleep: 0.5`, `growthPerWorkout: 1.0`,
  `goodSleepWindowHours: 2`.
- `player.energyMax` (sim.js) — the per-player ceiling.
- `resolveSleepHours` / `resolveSleepHoursWithAlarm` (sim.js) — accept
  an optional `energyMax` parameter so the "drained" calculation uses
  the per-player ceiling, not the absolute cap.
- `doSleep` (ui.js) — caps energy at `energyMax`; grows it when bedtime
  is within `goodSleepWindowHours` of `naturalBedtimeHour` and the alarm
  didn't fire.
- `runRegisteredAction` (actions.js) — grows `energyMax` by
  `growthPerWorkout` after `self.workout`.
- Collapse recovery (ui.js) — capped at `energyMax` instead of
  `NEEDS.energy.max`.

**Render:** the sidebar stats panel shows the alarm time (when set) and
burnout percentage (when > 0). Energy displays as `energy/energyMax` —
the player sees both the current level and the ceiling.

**Verified:**

- Alarm set via `doSetAlarm(5)` and via free text "set alarm for 6am".
- Bad case: energy 5, bedtime 01:00, alarm 06:00 → 5 hours sleep, 67.5
  energy (vs 100 natural). Alarm fires correctly.
- Good sleep at 22:00 with no alarm → energyMax grows 70 → 70.5.
- Burnout: 5 high-work days → level 0.60, mood penalty 0.24, work pay
  mult 0.70. 2 rest days → level 0.20, recovering.
- Starting energy/energyMax: 70/70 (down from 100/100).

## Apartment upgrades deepening — maintenance, appeal (Phase 9)

**Plan:** `src/ref/complete/apartment-upgrades-plan.md`.

The facility system (facilities, tiers, disrepair, quality→rent
leverage) was built in Economy 4. This phase adds the three missing
pieces the plan called for: maintenance/decay, appeal profiles, and
condition repair.

**Facility decay with use** — facilities degrade as they're used, not
merely with time. Each gated action (player or NPC) decrements the
facility's `condition` (0–100) by `MAINTENANCE.decayPerUse` (1.5). At 0,
the facility drops a tier (upgraded→functional→broken). A full house
degrades faster because NPC drives meter decay too — the roommate-
friction beat: someone who uses the gym daily is wearing out equipment
everyone paid for.

- `MAINTENANCE` (config.js) — `decayPerUse: 1.5`, `repairCostPerPoint: 2`,
  `startingCondition: 100`, `npcDecayActions` mapping drive IDs to
  facility IDs.
- `FACILITY_DEFS[*].appeal` (config.js) — added to every facility: an
  object mapping interest names to weight, with `'*'` as the default.
  Fitness-minded NPCs value the gym; homebodies value the living room;
  studious ones value the study.
- `upgrade.condition` (sim.js) — 0–100, starts at 100 for functional+,
  0 for broken. Old saves without the field are guarded (defaults to
  100 on first access).
- `decayFacilityCondition` (computer.js) — decrements condition, drops
  tier at 0, recomputes rent on tier drop. Called from `executeAction`
  (player gated actions) and `evaluateDrives` (NPC `npcDecayActions`).
- `repairFacilityCondition` (computer.js) — restores condition to 100
  for `repairCostPerPoint × pointsNeeded` dollars. Cheaper than a tier
  upgrade — the maintenance path that keeps the sink open.
- `computeApartmentAppeal` (computer.js) — weighted sum of facility
  appeal values for an NPC's interests, scaled by tier qualityValue.
  Intended for the Classifieds applicant evaluation.

**Render:** the upgrades dashboard shows a condition bar (green/yellow/
red) for each functional+ facility, with a "Repair — $N" button when
condition is below 100. The bar uses `.upg-condition-bar.good/.worn/
.critical` CSS classes.

**Verified:**

- Conditions initialized: broken=0, functional=100.
- Decay: kitchen_appliances 100→98.5 after one use.
- Repair: worn to 83.5, repaired to 100 for $33 (16.5 pts × $2).
- Tier drop: stove upgraded to functional, decayed 67 uses → dropped
  to broken, condition reset to 100.
- Appeal: fitness NPC values gym (0.15→1.25 when gym goes functional);
  gamer NPC values game room (0.25→1.4 when game room added).
- UI: 3 condition bars render for functional facilities; repair button
  appears for worn facilities and works on click.

## AfterHours redesign (Phase 10)

**Plan:** `src/ref/adult-content-overhaul-plan.md` ("Still open" section).

The AfterHours porn-browser app was functional but lacked search and
graceful embed-refusal handling. This phase adds:

- **Search bar** — free-text search via Pornhub's webmaster API,
  overriding the category search. Enter key triggers search; clear
  button removes the query.
- **Pagination** — explicit prev/next page navigation with a page
  indicator. The refresh button now loads the next page rather than
  refreshing the current one.
- **Embed refusal fallback** — when an iframe fails to load (some
  clips refuse to embed with "you can only watch this on Pornhub"),
  a "Video not loading? Watch on site →" button opens the clip in a
  new tab. All URLs go through element properties, never innerHTML
  (they're third-party API output).

**State additions** (`computer.js`): `afterHoursSearchQuery`,
`afterHoursTotalPages`. Clip objects now carry `watchUrl` for the
fallback link.

**Render** (`render.computer.js`): search bar, pagination bar, embed
fallback bar. `showEmbedFallback` helper builds the refusal message.

**Verified:** search sets query correctly; page navigation works
(prev/next); embed fallback button renders; all new state fields
present.

## Investing — the money accelerator (Phase 11)

**Plan:** `src/ref/complete/economy-and-rent-plan.md` (investing as accelerator).

The economy plan says "idle reserve money should be working" and
"investing becomes the accelerator for [apartment upgrades] rather
than a parallel score." This phase adds a simple index-fund investing
app ("Portfolia") to the computer.

**The model** is deliberately simple — no stock picking, no day
trading, no watching the ticker. Three funds with different
risk/return profiles:

| Fund | Return | Volatility | Min |
|---|---|---|---|
| T-Bill Fund | 4%/yr | ±0.2%/day | $100 |
| Index 500 | 9%/yr | ±1.2%/day | $500 |
| Growth Tech | 14%/yr | ±2.5%/day | $1000 |

Daily returns are `annualReturn/360 + noise`, where noise is a seeded
normal distribution (Box-Muller) so it's deterministic per-save — no
cheating by reloading. Growth is processed at day-rollover by
adjusting share values directly.

- `INVESTING` (config.js) — fund definitions, `dailyReturn`
  function (seeded PRNG + Box-Muller), 0.5% transaction fee.
- `investBuy`/`investSell` (computer.js) — buy/sell with fee,
  tracks cost basis and realized gains.
- `getPortfolioValue`/`getPortfolioCostBasis` (computer.js) —
  current value and P&L.
- `processInvestmentGrowth` (computer.js) — day-rollover growth.
  Called from `processDayRollover` in `ui.js`.
- **Tax integration** — realized gains added to `quarterGross` in
  `computeTaxOwed`, reset at quarter end.

**Render** (`render.computer.js`): portfolio summary (value, P&L,
realized gains), fund cards with buy/sell buttons, risk disclaimer.

**Verified:**
- Buy $2000 Index 500 → shares=2000, fee=$10, money=$7990.
- Sell $1000 → shares=1000, fee=$5, gain=$0 (same-day sell).
- Day rollover growth: 1000→1018 (+1.8% — a good day).
- Sell all at 1018 → realized gain=$18, money increased.
- Tax: $500 realized gains + $10k gross - $120 deductions = $10,380
  taxable, $2,803 owed at 27%.
- UI: 3 fund cards render, buy/sell buttons work.

## BrineOS Phase 0 — pre-flight refactors

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. These land first so the phone
(Phase 3+) can't silently break a live game later. No visible change.

- **Time-context stack** (`time.js`). The old `setTimeContext` was a
  last-writer-wins scalar with 15 call sites and hand-rolled
  `prevContext` save/restore pairs — opening a surface mid-conversation
  stomped the conversation's scale (1×) back to idle (20×). Now the
  stack **base is derived** (`computeTimeContext(gs)`: masturbating >
  browsing > idle, from durable state) and transient surfaces push/pop:
  `pushTimeContext`/`popTimeContext`/`getTimeContext`/
  `resetTimeContext(gs)` (the latter replaces the two boot-site special
  cases). Conversation, sleep, work-block, and AfterHours sessions all
  push/pop; phone overlays will too. All 15 call sites removed.
- **Device-parameterised nav** (`computer.js` `switchScreen`,
  `ui.computer.js` `doComputerOpenScreen`, `render.desktop.js`
  `buildWindowShell`, `ui.js` dispatch). `switchScreen` takes
  `device='computer'`; a phone device routes to `world.phone.navStack`
  (no-op until Phase 3). Computer window shells emit `data-device`, the
  dispatcher reads `closest('[data-device]')`, and the single
  `computer.open-screen` handler branches on it. No module-level
  `activeDevice` global — both shells live simultaneously.
- **Unknown-appId prune** (`computer.js` `normalizeComputerState`).
  Windows are kept only if `APP_DEFS[appId]` exists (a `bills`→`bank`
  rename would otherwise strand an invisible, uncloseable window), and
  `focusedAppId` is re-guarded against pointing at a pruned window.
- **`unique`-def backfill guard** (`world.js`). A layout bump can't
  spawn a second instance of a `unique` object (the phone) when the
  first is carried or left in another room. `ensureAllObjectBuckets`
  back-fills in a second pass after every bucket is loaded, and skips a
  `unique` def found in any bucket (`objectDefIdExistsAnywhere`).

**Verified:** context-stack nesting restores the right scale at every
combination; `switchScreen('phone')` never touches computer windows;
unknown-appId windows are pruned with the focus pointer guarded; the
unique guard spawns-when-absent, skips-when-present, and skips-when-carried
(exactly one instance each).

## BrineOS Phase 1 — banking merge + the electric-bill softlock fix

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. Done on the computer only, while
exactly one device reads `APP_DEFS`.

- **One `bank` app** (`defs.computer.js`). `bills` + `invest` removed from
  `APP_DEFS`; a single `bank` ("Brine Bank", category `finance`) has
  screens `overview`/`bills`/`invest`, reusing `bills-dashboard` and
  `invest-dashboard` unchanged. Data stayed where it always lived
  (`world.bills`, `computer.apps.invest`), so the reused renderers and
  `do*` handlers work unmodified (decision A). Old saves with open
  `bills`/`invest` windows are healed by Phase 0's unknown-appId prune.
- **Overview screen** (`render.computer.js` `renderBankOverview`,
  registered as `bank-overview`). Four real balances, no new account
  types (decision A): Checking (`player.money`), Tax Reserve
  (`world.taxes.reserve`), Portfolio (`getPortfolioValue`), Outstanding
  (sum of `world.bills[*].balance`). Net Worth hero + balance cards +
  outstanding list with cutoff pills; navigation to Bills/Portfolia is
  the shell's screen tabs.
- **`ICONS.bank`** (`icons.js`) — bank/wallet line-art, same 24×24
  stroke contract.
- **Softlock fix** (`render.js`, `ui.js`, `ui.computer.js`). A world chip
  "Pay Bills (service cut off)" appears (mirroring the Pay Rent chip at
  `render.js:499`) whenever any bill has `cutoffActive`, so the electric
  bill stays payable even with power cut and the computer dead. Shared
  `doPayBillsFromWorld(boundaryId)` (ui.js) wraps `payAllBills` +
  logging + scene render + save; the computer's Bills → Pay All button
  now delegates to it. `'pay-bills'` added to `ENERGY_GATE_EXEMPT` so
  the chip works at 0 energy.

**Verified:** `APP_DEFS` has `bank` and no `bills`/`invest`; the desktop
shows Brine Bank and all three tabs render (Overview/Bills/Portfolia);
old-save windows are pruned and `focusedAppId` re-guarded; a simulated
cutoff surfaces the chip, and clicking pays balance + `reconnectionFee`
and restores service.

- **1.5 addendum — truthful payment reporting.** Found in review after 1.4
  landed: `payAllBills` returned the identical `'Nothing to pay right now.'`
  for "nothing owed" and "owed but unaffordable" — and because the 1.4 chip
  only appears when a bill is `cutoffActive`, the unaffordable branch is
  guaranteed reachable (a broke player with the power cut is told there's
  nothing to pay). `doPayBillsFromWorld` also claimed "you pay off **all**
  your bills" when some were skipped. Fixed: `payAllBills` (`computer.js`)
  tracks `owedCount` and the cheapest unaffordable bill, returning
  `unpaidCount`/`cheapestUnpaid`, and distinguishes "Nothing to pay right
  now." from "You can't cover any of it. Cheapest is X at $N, and you have
  $M."; `doPayBillsFromWorld` (`ui.js`) reports partial payment honestly.
  **Verified with exact values:** nothing-owed → correct message;
  cut-off-and-broke ($50 vs Electric $260+$40) → names the $300 shortfall,
  money untouched; partial ($150) → pays Internet $80, Electric stays cut
  off, money 150→70; affluent ($5000) → pays $300 incl. reconnection,
  money 5000→4700.

**Phase 1 status: complete**, all five items (1.1–1.5) verified against
running code.

## BrineOS Phase 2 — the phone as a world object

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. No shell yet — this phase gives
the phone a physical existence: an object with identity, location, and
battery, spawned once and never duplicated.

- **`OBJECT_DEFS.phone`** (`defs.world.js:71`), placed in
  `APARTMENT_LAYOUT.bedroom_player` (`:467`), `APARTMENT_LAYOUT_VERSION`
  bumped 2→3 (`:457`). Deliberately no `dirtyWhen`/`cleanlinessWeight` (a
  housekeeper visit must not silently reset `lock` to its "clean" enum
  value) and no `evidenceKinds` yet (withheld until Phase 9, so the phone
  isn't a `LEAVE_EVIDENCE` target for the player's own sneaking before
  snooping exists).
- **Pickup / set-down / plug-in / unplug** (`defs.actions.js:182-203`) are
  trusted-producer actions — they call `applyEffects` directly rather than
  going through the LLM-facing `MOVE_OBJECT` validator, because that
  validator's reach set is room-scoped by design (the anti-hallucination
  wall) and would never include `carry_player`. `effects.js` needed zero
  changes.
- **Battery** is numeric `flags.battery` (0–100), not a `state` enum
  (`obj.state` values must stay string enums — `cleanRoomObjects` depends on
  it). `advancePhoneBattery`/`isPhoneCharging` (`world.js`) hook into
  `advanceAndResolve`, the single chokepoint both the continuous checkpoint
  clock and every discrete action (sleep, work blocks, gigs) flow through —
  so an 8-hour sleep still drains the phone rather than a checkpoint-only
  hook silently costing nothing. Charging meters the existing `devices`
  utility meter, so it shows up on the electric bill.
- **`phonePresence(gs)`** → `'carried' | 'here' | 'elsewhere'`, derived from
  the object's bucket vs `player.location`. **Not** stored on `world.phone`
  — two sources of truth for the same fact was the exact bug below.
- **Bug found and fixed during this phase:** the first implementation had
  `findPhoneObject` discard the bucket *key* and return only the object, so
  `phonePresence`/`isPhoneCharging` branched on the object's own denormalized
  `obj.bucket` **field**. A stale field (left by any code path that touched
  the object map without going through the mover) reported the phone
  `elsewhere` while it physically sat in the room, and separately blocked
  charging. A load-time canonicalization pass was added first, but that only
  made the invariant true *at load* — the field was still what runtime logic
  trusted between loads, and its own comment claimed the opposite of what it
  did. **Fixed properly:** `findPhoneObject` now returns `{ obj, bucket }`
  from the `Object.entries` key, and every consumer branches on that
  structural key; `obj.bucket` is now a denormalized copy that cannot affect
  behaviour even if it goes stale.
- **`world.phone`** (shell nav state only — `{ navStack, openAppId }` at the
  time; the object carries battery/plugged/lock) added to all three
  `state.js` sites: `saveAtBoundary` (:434-436), `loadGameState` (:705),
  `writeGeneratedGameState` (:777-778). **Phase 3 extended the shape** to
  `{ power, openAppId, navStack, settings: { dnd } }` with
  `normalizePhoneState` (`world.js`) back-filling `power`/`settings` on
  pre-Phase-3 saves — `loadGameState` now routes through it.

**Verified:** with a deliberately corrupted `obj.bucket` field, presence and
charging both now follow the structural bucket, not the field (three cases
checked, including "structure says pocket, field says a room" and the
reverse). Charge/drain deltas match `PHONE` config exactly (+6/−2 per tick),
the `devices` meter accrues while charging, and a pocketed-but-plugged phone
correctly refuses to charge.

**Not yet verified — needs a real save, not a static server:** an overnight
charge and an 8-hour sleep run confirmed end-to-end in actual play. The unit
-level checks above exercise the same functions but not the full
`advanceAndResolveMinutes` path with a live `root.kv`, which a plain static
file server can't provide (`root` is undefined there). Flagged in the plan
doc; do this first thing in Phase 3 if it hasn't happened yet.

**In-play verification (2026-08-04) — done, in a real kv-plugin save (day 5,
solo, no NPCs).** Snapshot/restore technique: the entire kv DB (`meta`,
`player`, `world`, `npcs`, `images`, `snapshots`, `objects` — 119 entries)
was snapshotted via `entries()`, the tests ran, then every folder was
`deleteMany`+`setMany`'d back and the page reloaded; the post-restore state
matched the pre-test state (phone back in `room_hallway_a`, day 5, meters 0).

- **Overnight charge.** Real actions (`phone.pickup` from the hallway →
  `phone.drop` → `phone.plug` in the bedroom), then `doSleep` from an
  exhausted player (energy 0.01 → natural 8h → **16 ticks** via the
  discrete path; clock 02:01→10:01). Battery 20→**100** (capped, 16×+6
  =+96) and `utilities.devices.count` rose by **exactly 8.0** (16×0.5).
  `saveAtBoundary('sleep')` then a direct `root.kv.objects` read showed the
  persisted phone object at `battery:100, plugged:'plugged'` in
  `room_bedroom_player`.
- **8-hour sleep drain.** `phone.unplug`, then another full 8h sleep (16
  ticks). Battery 100→**68** (exactly 16×−2=32), `devices` delta 0 while
  unplugged, persisted object showed `battery:68, plugged:'unplugged'`.
  This is the discrete-path confirmation decision C asked for — the drain
  really does ride `advanceAndResolve`, so a sleep costs battery.

**Phase 2 status: complete.** Both in-play verifications done; no code
changed for them.

## BrineOS Phase 3 — the BrineOS shell

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. The phone's first *shell*: an
always-on-screen button (FAB) plus a phone-shaped overlay that opens over the
game or over the computer. No new apps — the home grid reuses the computer's
`COMPUTER_RENDERERS` unchanged, which is exactly what Phase 0.2's
device-parameterised nav was built for.

New files (load order in `index.html`):
- **`phone.js`** (after `computer.js`) — domain: `PHONE_HOME_APPS` (fixed
  roster; Phase 5 replaces with a `devices`-filter), `PHONE_SETTINGS_APP_ID`
  (a phone-only shell app, deliberately NOT in `APP_DEFS` — adding it there
  would surface Settings on the computer desktop/taskbar too, since both
  iterate `APP_DEFS`), `getPhoneBattery`/`getPhoneBatteryBucket`,
  `isPhoneScreenOn`, `getPhoneUnreadCount` (Phase 4 seam → 0),
  `openPhone`/`closePhone` (close preserves the nav stack — reopening
  returns to the app you were in), `phoneOpenApp` (funnels real apps through
  `switchScreen`'s phone branch; Settings is a special case),
  `phoneGoBack`/`phoneGoHome`/`phoneSetDnd`.
- **`render.phone.js`** (after `render.computer.js`) — `renderPhoneScreen(gs)`:
  FAB every pass (presence via `data-presence`, icon/badge injected once with
  a `childElementCount` guard like the taskbar's Start button), overlay only
  when `world.phone.power === 'on'`. Statusbar (clock, battery
  `data-battery` bucket → pre-authored CSS widths, charging bolt from the
  derived `isPhoneCharging`), app sub-nav (mirrors `renderWindowScreenNav`
  but reads `world.phone.navStack`), content dispatch home / settings /
  shared-app renderer. `#phone-screen` carries `data-device="phone"` so
  sub-nav clicks route to the phone stack, never computer windows.
- **`ui.phone.js`** (after `ui.computer.js`) — `doPhoneOpen` (refuses if
  presence `elsewhere`, or if battery is 0 and not charging — the Phase 3
  reading of decision F), `doPhoneClose`, `doPhoneOpenApp`, `doPhoneGoBack`,
  `doPhoneGoHome`, `doPhoneSettingsDnd`. All save at boundary.
  `handleAction` cases `phone.*` dispatch these; energy-gate exemption came
  free from the existing `action.startsWith('phone.')` clause (plan 3.6).

DOM/CSS: `#phone-fab` + `#phone-screen` are direct children of `#app`,
siblings of `#computer-screen` (decision E — not nested, so the phone
survives computer power state). Tiers `--z-phone-fab: 165` (above taskbar
150/startmenu 160, below the phone) and `--z-phone: 170` (below modal/loading
overlay 200). Both anchor bottom-right, `bottom` offset swaps from
`--footer-h` to `--taskbar-h` in computer mode. No inline styles — battery
and DND use `data-*` buckets with pre-authored CSS.

**Verified live (2026-08-04, real kv save, snapshot/restore like Phase 2):**
- Phone in another room → `phone.open` refused with "Your phone is in
  another room — go get it first."; FAB shows `data-presence="elsewhere"`.
- Full flow: open → home grid (9 tiles = 8 apps + Settings) → bank app
  renders the computer's renderer with its real screennav
  (Overview/Bills/Portfolia), nav clicks update `world.phone.navStack` and
  leave computer windows at 0 — landmine L1 holds.
- Back → home; Settings → DND toggle flips `world.phone.settings.dnd` and the
  toggle's `data-on`; Home clears the stack; close sets `power:'off'`.
- Over the computer: `#app[data-mode="computer"]`, both shells visible
  simultaneously, computed z 165/170/150 (FAB/phone/taskbar), FAB bottom
  64px = `--taskbar-h + 16`.
- Death gate: battery 0, unplugged → open refused ("Your phone is dead…");
  battery 5 + plugged → opens, `data-charging` set, bolt shown, 5% bucketed
  to `data-battery="5"`. Badge hidden at unread 0.
- Whole screen derives from `world.phone` + the phone object — nothing in
  the DOM beyond the static shell.

**Phase 3 status: complete.** Phase 2's `world.phone` shape was extended
(see above) with `normalizePhoneState` migration; no other Phase 2 code
changed.

## BrineOS Phase 4 — the Tracker and notifications

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. One pure derived pass turns game
state into a flat list of obligations (decision D): nothing about an
obligation is ever stored — only the player's dismiss/snooze intents live on
`world.phone`. No LLM, no randomness, no persistence: the same save always
yields the same entries, so the FAB badge is just
`getTrackerNotifications(gs).length`.

New files (load order in `index.html`):
- **`tracker.js`** (between `computer.js` and `phone.js`) —
  `buildTrackerEntries(gs)`: one read-adapter per source (rent, bills ×7,
  quarterly taxes via `computeTaxOwed`/the synthesized quarter-end day, gigs
  with fractional `blocksDone`, quests by expiry, in-flight deliveries,
  service visits, IM unread, courses, functional-facility decay,
  high-tension move-out), flattened in fixed order. Entry shape
  `{ key, kind, urgency, title, detail, dueDay, daysUntil, deepLink }`.
  `getTrackerNotifications(gs)` = urgent (`>= TRACKER.notifyThreshold`) minus
  dismissed/snoozed intents, sorted urgency-desc / daysUntil-asc.
  `sortTrackerEntries` shared by the agenda renderer.
- **`phone.js`** additions: `PHONE_TRACKER_APP_ID` + `PHONE_TRACKER_SCREENS`
  (a phone-only shell app like Settings — NOT in `APP_DEFS`, so it never
  appears on the computer desktop), `getPhoneUnreadCount` now real (gated by
  presence `elsewhere` and DND — decision C), `phoneTrackerDismiss` /
  `phoneTrackerSnooze` (mutate `world.phone.dismissed`/`.snoozed` only),
  `phoneOpenApp` tracker branch.
- **`render.phone.js`** additions: Tracker sub-nav tabs (Notifications /
  Agenda), `renderPhoneTracker` / `renderPhoneNotifications` /
  `renderPhoneAgenda` (state→DOM only), Tracker tile on the home grid (10
  tiles). **Also fixed a pre-existing Phase 3 bug:** the shared-app path now
  clears `#phone-content` before invoking a `COMPUTER_RENDERERS` renderer
  (computer window bodies are cleared by `renderWindows`; the persistent
  phone content node wasn't, so shared-app content accumulated).
- **`ui.phone.js`** additions: `doPhoneTrackerScreen` / `doPhoneTrackerDismiss`
  / `doPhoneTrackerSnooze`, all save-at-boundary; new `phone.tracker-*`
  `handleAction` cases + `data-key`/`data-days` in the click dispatcher
  (ui.js).

Config: `TRACKER` block in `config.js` — the urgency ladder,
`notifyThreshold`, per-source urgencies/caps, `snoozeOptionsDays`. No magic
numbers in tracker.js. `world.js`: `dismissed:{}`/`snoozed:{}` added to
`defaultPhoneState` + `normalizePhoneState` (backfilled for old saves); the
existing `world.phone` write sites in `state.js` persist them unchanged.
CSS: `.phone-tracker-*` styles in index.html (notification cards, action
buttons, agenda rows, empty states).

**Design notes (recorded in the plan doc 4.5):**
- The plan's "lock-screen preview list" is fulfilled by the Tracker app's
  Notifications screen (no lock screen until Phase 9).
- DND and presence silence the **Notifications screen and badge** but never
  the **Agenda** — silencing blinds, never shields.
- Deterministic keys embed the obligation's identity (posting day, gig id,
  quarter-end day), so dismiss/snooze can't leak onto a future instance;
  paying a bill removes the entry *and* its intent with no clear call.
- Facility decay tracks functional+ tiers only — broken facilities are the
  apartment's known opening state (RenoFix's job), not a phone notification.
- Paid-up future charges (bills, service visits) are capped below
  `notifyThreshold` so they're agenda items, never nags.

**Verified live (2026-08-04, real kv save, snapshot/restore):** every
adapter exercised against a synthetic state with exact expected values
(rent overdue → 100, cutoff/good-grace bill detail lines, taxes unpaid +
estimate, late + active gigs, expired + active quests, delivery day+1,
capped service, IM unread scaling, course progress, facility warn/critical +
broken-skip, tension countdown). Then in the real save: injected a rent debt
+ in-flight delivery → badge 2 → open Tracker → Notifications screen with
both cards (bell icons, Dismiss/Snooze 1d/3d, deep-link titles) → dismiss
rent → badge 1 → snooze delivery → badge 0 → reload → both intents persisted
→ DND on → badge 0 + silenced screen, Agenda still full (8 rows) → deep-link
rows navigate the phone to bank/bills and Back returns to the Tracker →
phone elsewhere → badge 0 (decision C) → pay the debt → entry + notification
gone with no clear call. Layout: 360×608 phone, all items fit, no overflow,
10-tile 4-column home grid. Save restored byte-for-byte (day 5, phone back
in `room_hallway_a`, battery 0, `world.phone` pristine, test delivery
removed).

**Phase 4 status: complete.** No Phase 3 code changed except the shared-app
body-clear fix above; Phase 5 (app parity) now only needs the
`devices:['computer','phone']` filter + porting work.

## BrineOS Phase 5 — app parity and connectivity

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. Two halves: make every shared app
reachable from the phone (the registry is the single source of truth), and
give phone + computer the asymmetric connectivity decision F specifies.
No new files — all changes landed in existing ones (load order unchanged).

**App parity (5.1–5.2).** Every `APP_DEFS` entry now carries
`devices: ['computer','phone']`. `renderPhoneHome` and `phoneOpenApp`
filter on it, so the fixed `PHONE_HOME_APPS` roster in `phone.js` is gone
and the home grid is derived (now 12 tiles: the 10 apps + Tracker +
Settings). The phone reuses the shared `COMPUTER_RENDERERS` unchanged —
Phase 0.2's `data-device` routing plus Phase 4's `#phone-content` body-clear
already make that work. `icons.js` grew a Lucide wrench for the `upgrades`
app, which had been rendering a blank desktop/taskbar tile since Phase 4
(it was always reachable on the computer, just iconless).

**Connectivity (5.3).** `BILL_CUTOFF_EFFECTS`'s app-gating fields are now
LIVE through one function: `appBlockedReason(gameState, appId, device)`
(computer.js). Computer: a power cutoff kills the machine
(`blocksComputer`); an internet cutoff blocks the online apps
(`blocksApps: ['work','stream','browser']`). Phone: it rides cellular, so
an online app is blocked only when **both** internet AND phone cutoffs are
active (decision F); power cutoffs never touch it, and bank/upgrades/etc
are never gated — bill payment stays reachable (Phase 1 softlock rule).
The phone bill is a real cutoff now (`BILL_DEFS.phone.cutoff = 'phone'`),
posted by the existing rollover path. Dead config fields
(`power.blocksApps`, `power.spoilsFridge`, `internet.blocksGigWork`,
`water.blocksActions`, `gas.blocksActions`, `rent.isEvictionLadder`) were
deleted; action-level water/gas gating lives in
`ACTION_REQUIREMENT_CHECKERS`, untouched.

**Work-from-phone (5.4).** `computeFocusMultiplier(gameState, device)`
applies `WORK_TUNING.phoneFocusMultiplier` (0.6) for the phone device;
`workGigBlock`/`doGigWorkBlock` carry `device` through. Same gig, same
energy/mood, 40% less progress per block on the phone.

**L11 / AfterHours derivation (5.5).** The sticky
`afterHoursMasturbating` boolean is replaced by a session record
`apps.browser.afterHoursSession = { device, startedTick }`, and
`isAfterHoursSessionActive(gs)` derives "still in use" from the owning
device: computer → `computer.power === 'on'`; phone → `world.phone.power
=== 'on'` AND presence `'here'` (a pocketed phone — presence `'carried'` —
is NOT in use, the exact L11 bug) AND object not locked AND not
battery-dead. `getPlayerVulnerableState`, the interruption pre-generation
guard, and the AfterHours render all read it; `time.js` gained
`reconcileTimeContext` so the `'masturbating'` time frame (3×) self-heals
on a derived exit. Explicit terminators (Stop / Cum / Close-player) are the
only clear sites; `closeComputer` clears nothing. Old saves with a stale
flag and no session read inactive — no migration. `appBlockedReason` +
`isAfterHoursSessionActive` both live next to `isCutoffActive` in
computer.js.

**Verified live (2026-08-04, real kv save, snapshot/restore):** home grid =
12 tiles incl. classifieds + upgrades; upgrades opens on the phone with its
icon; `appBlockedReason` matrix — computer (power→all blocked, internet→
work/browser/stream blocked, bank/classes up), phone (single cutoff→null,
both→work/browser/stream blocked, bank/shop/upgrades up); phone-bill cutoff
activates via `processBillsForDay`; phone work progress = computer × 0.6;
the full L11 acceptance — session active in-room (`getPlayerVulnerableState`
= `'masturbating'`, Cum/Stop render on the phone, session timer ticking),
pocket it → `null`, back in the room → active again, Close-player →
record cleared; power-off / lock / battery-death all read inactive; stale
legacy bool with no session reads inactive; time context = 'masturbating'
(3×) during a session and self-heals to browsing on power-off with no
terminator.

**Phase 5 status: complete.**

## BrineOS Phase 6 — Alarm and Clock

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. Premise correction made at the
start of this phase: the alarm mechanic was **not** unbuilt, and there was
no computer-side surface to remove. `player.alarm`, `doSetAlarm` (ui.js),
`resolveSleepHoursWithAlarm` (sim.js), and the free-text intent
`matchAlarmIntent` ("set alarm for 7", intent.js) already existed and
worked, reachable only by typing a command — `src/ref/sleep-and-alarm-plan.md`'s
"Not built" header was stale. Grepping `computer.js`/`render.computer.js`
for `alarm` found nothing real (a character-quirk string, an unrelated CSS
comment). Real scope: a phone UI for the existing mechanic, plus the one
piece that genuinely didn't exist — dependence on a live phone.

**Clock app** (`phone.js`, `render.phone.js`). `PHONE_CLOCK_APP_ID`, the
same phone-only shell-app pattern as Settings/Tracker (not in `APP_DEFS`).
`renderPhoneClock` shows live time/date, current alarm status, and an
hour-grid (`SLEEP.alarmMinHour..alarmMaxHour`, no hardcoded bounds) plus a
clear button; both dispatch straight to the existing `doSetAlarm(hour)`
(`phone.set-alarm`/`phone.clear-alarm` cases, ui.js) — no new domain logic,
the phone is a face on `player.alarm`. `render()`'s existing sibling call to
`renderPhoneScreen` means `doSetAlarm`'s own render/save already keeps the
phone in sync; no wrapper needed. Home grid grew to 13 tiles.

**Dead-phone dependency (6.4).** `doSleep` (ui.js) previously read
`player.alarm` with zero dependency on the phone object. Added a
battery-dead check using the same gate `doPhoneOpen` already uses
(`getPhoneBattery(gs) <= 0 && !isPhoneCharging(...)`) — if the phone is dead
and not charging at the moment the player falls asleep, that night's
effective alarm hour is `null`; `player.alarm` itself is untouched, so
charging the phone the next day restores it with no player action needed. A
distinct narration line covers the case so the failure is legible rather
than a silent no-op.

**Consolidation.** The 12-hour formatting formula existed inline in both
`doSetAlarm` and the HUD's alarm line; the Clock face would have been a
third copy. Pulled into one `formatHour12(hour)` in `sim.js` (next to
`formatTime`/`formatDate`), and the two existing call sites were switched
over rather than left duplicated.

**Verified (exact values, real function calls):** `resolveSleepHoursWithAlarm`
against the sleep plan's stated bad case (energy 5 at bedtime, bedtime
01:00, alarm 6am) — natural night `7.9h` uncapped, alarm caps it to exactly
`5h` (`alarmFired: true`), energy recovered `62.5`, landing at `67.5` against
`100` if the alarm hadn't fired — a real 32.5-point shortfall, matching the
sleep plan's own "~62 energy" framing. (A first attempt at energy 15/bedtime
23:30 only produced a 3.75-point shortfall because a near-full natural night
also clamps at 100 — not a useful demonstration, so the inputs were
corrected.) Phone-dead detection: dead+unplugged → gate fires (`alarmHour`
resolves `null`); dead+**charging** → gate does not fire (booting off the
cord is fine, matching Phase 3's decision-F reading). DOM-level render
check: 9 hour buttons with correct 12-hour labels, correct button
highlighted for the active alarm, clear button correctly (un)highlighted in
both states, Clock tile present in the home grid with correct label and
icon, home grid now 13 tiles.

**Phase 6 status: complete.**

## BrineOS Phase 7 — Autopay

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. Deliberately its own phase,
separate from Phase 1's bill-pay UI rewrite, so a regression in either is
attributable to the right one.

**Opt-in, per bill.** `world.bills[id].autopay` (default `false`,
`initBillState` in sim.js; old saves read it defensively — no migration).
`toggleBillAutopay` (computer.js) rejects rent (`split:'lease'` has its own
cap/eviction path). The toggle in `renderBillsDashboard` renders regardless
of current balance — it's a standing preference, not a payment action — so
both devices get it for free via the shared renderer.

**Ordering (decided and documented at the call site):**
`processAutopayForDayUi(day)` runs immediately **after**
`processBillsForDayUi(day)` in `processDayRollover` (ui.js), so it acts on
the day's freshly posted charges and freshly evaluated cutoffs rather than
stale pre-posting state. Kept as its own function, not folded into
`processBillsForDay`.

**The trap.** `processAutopayForDay` (computer.js) calls `payBill` — the
same path a manual click uses, so it correctly clears an existing cutoff and
pays the reconnection fee too. On failure, `AUTOPAY.bounceFee` ($30,
config.js — flat, anchored to the existing $25–$40 `reconnectionFee` range)
is added straight onto the balance, immediately compounding the debt in a
way a manual miss never does. A one-shot gate (`bill.autopayAttempted`,
reset only when a fresh charge posts) stops it from re-bouncing — and
re-charging the fee — every day of the grace window; it waits for the next
cycle, like a real bank draft. A bounce is a real log event, the same
standard cutoff activations are already held to.

**Verified (exact values, real function calls):** rent rejected; successful
autopay $1000 bal → pays $260, money $1000→$740; bounce with $50 vs. $260
owed → money untouched, balance $260→$290 exactly; re-running the same
day's pass again produces zero results (no double-bounce); a new cycle
(flag reset + fresh $100 charge on the still-bounced $290) attempts again
and bounces again → $420 exactly; cutoff payoff ($5000 bal, $260 owed +
cutoff) pays $300 (`260+40`), money→$4700, cutoff cleared — matching Phase
1's own verified combo. DOM-level render check: Rent has no autopay button;
a bill with `balance: 0` still shows its toggle with no Pay button; 6
autopay buttons render for the 6 eligible bills (7 `BILL_DEFS` minus rent).

**Phase 7 status: complete.**

## BrineOS Phase 8 — Camera and Gallery

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. A photo record deliberately does
**not** store the rendered image — landmine L10 — because `IMAGE_CACHE` is a
shared LRU across every scene/character image in the whole game, not just
photos, and can evict a "memory" the player is holding onto at any time
regardless of how few photos they've taken.

**Photo record and capture.** `takePhoto(gameState, tags)` (image.js)
freezes a prompt (built once, from the room/NPCs/objects at the moment of
capture, via the same `buildImagePrompt` `getSceneImage` uses, plus a
"candid smartphone photo" framing phrase) and a seed (`hashStr`, never
`Date.now()`) into the record — the photo keeps looking like the room did
when taken even after the room changes later. `getPhotoImage(photo)`
regenerates on a cache miss using that frozen prompt+seed, the same
determinism contract `getCharacterImage` relies on for NPC portraits
(`getSceneImage` deliberately does not use this contract — scene art is
allowed to drift; a photo cannot be). Keyed by the photo's own `id`, not a
room/phase/npc composite, so two photos of the same room stay individually
addressable.

**Roll.** `world.phone.camera.roll` (added to `defaultPhoneState`/
`normalizePhoneState`, world.js — old saves back-fill an empty roll).
`CAMERA.rollCap = 30` (config.js); `takePhoto` unshifts newest-first and
truncates the tail past the cap.

**Camera app** (phone.js/render.phone.js/ui.phone.js). Same phone-only
shell-app pattern as Clock — `PHONE_CAMERA_APP_ID`, not in `APP_DEFS`. Two
screens: Gallery (grid + Take Photo button) and Detail (full image, caption,
a Send-to row for every resident/prospective NPC), Detail reached by
drill-down rather than a tab pair, so it's absent from the sub-nav bar by
the existing fallback for an appId with no special case. Both async image
loads use `renderScene`'s established placeholder-then-swap pattern
(render.js), simplified: this grid is rebuilt from scratch on every render
pass like every other phone screen, so a stale-node guard isn't needed — a
resolved promise writing to a since-removed `<img>` is a harmless no-op.

**Before/after (8.4).** A "Snap Photo" button on every facility card in
`renderUpgradesDashboard`, tagging and captioning the photo with the
facility+tier. RenoFix is a shared-device app whose renderer signature
carries no `device` param, so this appears on both computer and phone
rather than threading a device flag through all 23 shared renderers for one
button — the fiction (you have your phone on you regardless of which screen
you're looking at) already matches decision C's loose presence model.

**Share into IM (8.5).** `sharePhotoToImThread` (computer.js) reuses
`appendPlayerImMessage`/`resolveImReply` unmodified — the photo is
described to the LLM as text (its caption; no vision capability needed for
a plausible in-fiction reaction) — and tags the resulting bubble with
`photoId` so `renderMessages` attaches a thumbnail. A photo that ages out of
the roll after being shared degrades its bubble to explanatory text rather
than a broken image.

**Verified (real mocked `root.kv`/`root.generateImage`, tracking actual
call counts):** first load → cache miss, 1 generate call; second load on
the same photo → cache hit, still 1 call; simulated LRU eviction → cache
miss, 2nd generate call, **seed and prompt byte-identical to the first
call** — the exact L10 acceptance criterion. Roll-cap: `rollCap+5` photos
taken → final length exactly 30, newest present, oldest evicted. DOM-level:
gallery/detail/share-row/missing-photo/empty-state all correct; IM bubble
renders one thumbnail for a shared photo, falls back to text once evicted;
RenoFix snap buttons render one per actually-displayed facility card.

**Bug found during verification, out of BrineOS scope, flagged separately,**
**fixed after Phase 8**: `FACILITY_DEFS.bedroom_habitability.room` was
`'bedroom'`, which matches no real `ROOMS` key (the real ids are
`bedroom_player`, `bedroom_1/2/3`) — `renderUpgradesDashboard`'s
room-grouping silently dropped it, so 12 facilities were defined but only 11
ever rendered or were reachable to repair/upgrade. Design decision: the
facility is shared by all four bedrooms (one upgrade state), so it belongs
to the `bedroom` room *type*; `renderUpgradesDashboard` now renders
type-wide facilities once under a "Bedrooms" section prepended before the
concrete room sections. All 12 facilities render and are repairable.

**Phase 8 status: complete.**

## BrineOS Phase 9 — Privacy and snooping

**Plan:** `src/ref/BrineOS-The-Phone-plan.md`. The final BrineOS phase — makes
the phone's physicality (Phase 2) carry real stakes: an unlocked phone left
somewhere is discoverable, and the discovery has consequences.

**Lock and passcode (9.1).** `world.phone.settings.passcode` (default off,
same discipline as the DND boolean). `setPhoneLock(gameState, locked)`
(world.js) is a direct setter: `doPhoneOpen` always force-unlocks (it's the
owner's own phone), `doPhoneClose` force-locks only when the passcode
setting is on. `phone.state.lock` existed since Phase 2 with no consumer
until now.

**The snoop drive (9.2/9.3).** `DRIVE_DEFS.snoop_phone` (`isSnoopDrive:
true`) dispatches through `evaluateDrives` exactly like `isPeepDrive` does.
`trySnoopPhone` (drives.js) reuses `tryNpcPeep`'s curiosity formula
verbatim, plus a bounded `curiousTrait` modifier — the first mechanical
read of `personality.traits`, previously prompt-flavour only. Deliberately
NOT a reuse of the `sim.js:617-638` evidence-discovery pass (landmine L8) —
that one only scans a room's *owner* in their *own* room, which structurally
can't find a phone in the *player's* bedroom. `trySnoopPhone` checks
whatever room the NPC actually occupies, no ownership requirement, gated on
the player not being present, the phone unlocked, and no existing evidence.

**Evidence and consequences (9.4/9.5).** `evidenceKinds: ['phone_contents']`
added to `OBJECT_DEFS.phone` at last (deferred since Phase 2 — L7 — so the
phone wasn't a sneaking target before snooping existed to read it) plus a
matching `EVIDENCE_KIND_TEXT` entry. One evidence record per phone
(`obj.evidence` is a single slot, L9), gated so a second attempt on an
already-flagged phone no-ops. Strength scales with what's actually on the
phone — photo roll + open IM thread count, normalized and capped
(`SNOOP_TUNING`, config.js). Writes a memory episode and
`ADJUST_SUSPICION <npcId> general +delta` — recorded design call: this
raises the *snooping NPC's own* `general` suspicion (there's no symmetric
"player suspects this NPC" field anywhere), verified inert against today's
confrontation trigger (`ui.js` hardcodes `boundary_violation`, not a generic
subject read) — exactly matching `general`'s documented purpose as an
allocated-but-unused catch-all for a future system.

**A real bug hunted and cleared during verification.** Testing
`trySnoopPhone` in isolation and checking a held NPC variable afterward
showed zero memory episodes — looked broken. Traced to the aliasing gotcha
`src/ref/HANDOFF.md` warns about: `applyMemoryEpisodeEffect` *replaces*
`gameState.npcs[id]` rather than mutating in place, so a held reference
goes stale. `sim.js` (lines 704-721) already documents and fixes this exact
class of bug generically for every drive — it was written because it first
broke `resolveNpcPeep`'s silent-success memory — and it covers
`snoop_phone` for free. Reading `gameState.npcs[id]` fresh confirmed the
episode was written correctly; nothing needed fixing.

**Verified end-to-end (exact values, matching the plan's acceptance
scenario literally):** unlocked phone, 3 photos + 2 IM threads, curious NPC
alone with it while the player is elsewhere → discovery fires, evidence
strength exactly `0.7167` (matching the richness formula), a memory episode
lands (read fresh, not stale), suspicion.general → exactly `0.15`. Same
setup with the phone locked (via the identical `setPhoneLock` call
`doPhoneClose` makes) → discovery blocked, evidence stays `null`. Also
individually verified: dull-personality NPC gated out even with a forced
-pass rng; player-present blocks; already-evidenced phone blocks
re-discovery; a borderline NPC crosses the threshold only with the
`curious` trait bonus; lock force-set both directions; phone-state
defaults/normalization correctly carry `settings.passcode`; Settings
renders both toggle rows correctly wired.

**Phase 9 status: complete. BrineOS is complete — all nine phases done.**
