# Food Overhaul — Metabolism, Cooking, Kitchen, Food Culture

Status: **COMPLETE — all 9 phases done** (freezer/storage/thaw; kcal +
metabolism; plates as instances; dishes/cookware/dishwasher; cooking engine +
grades; equipment tiers + grade-gated auto-cook; NPC food culture; ChefBook
the recipe website; Phase 9's balance/migration/long-tail audit). Design
session 2026-08-18 (D1–D24) + refinement pass same day (D25–D29, Phase 5
split into 5/6); D1–D41 locked. Last updated 2026-08-18.

Companions:
- `src/ref/complete/inventory-needs-menu-saves-plan.md` (the inventory/container/eat/spoilage substrate this plan rebuilds — its EAT_ITEM, `ROT`, `HUNGER_RHYTHM`, Set Meal, and NPC inventories are the current system being replaced piece by piece)
- `src/ref/complete/restaurant-network-expansion-plan.md` (the 12-restaurant DoorDrop roster — mechanically unchanged here, but gains kcal data and stays on the old pipeline; read it before Phase 2 menu edits)
- `src/ref/wip/bug-fix-audit-2026-08-17.md` (Pass 2 locked the current hunger model: real meal-size restores, sleep-slowed overnight hunger, edible Day-1 starters — the floor this plan builds on)
- `src/ref/complete/renovation-occupancy-overhaul-plan.md` (FACILITY_DEFS tiering + RenoFix — the upgrade pipeline equipment tiers reuse in Phase 6)
- `src/ref/complete/external-world-npcs-overhaul-plan.md` (Nile delivery, doormat landing, `world.deliveries` — Phase 1's auto-transfer hooks into its handover)
- `src/ref/complete/npc-cognition-plan.md` + `continuous-behavior-engine-plan.md` (the eat drive and commitment scheduling that Phase 7 rewires)
- Paired session prompt `src/ref/complete/food-overhaul-handoff-prompt.md` —
  the one-phase-per-session protocol. Its Step 0 already handles the
  all-phases-complete case (stop and report), so a session that opens it now
  will correctly find nothing left to do.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/<folder>/<name>-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**This plan is COMPLETE.** All 9 phases built and verified; nothing left to
resume. This document now lives at
`src/ref/complete/food-overhaul-plan.md`. Kept below for the historical
session record (Session 11 = Phase 9 is the newest; Session 10 = Phase 8;
Session 9 = Phase 7; Session 8 = Phase 6; Session 7 = Phase 5; Session 6 =
Phase 4; Sessions 4–5 = Phases 2–3).

**Session 11 notes (Phase 9 — balance, migration, the long tail; D41 —
BUILT):**
- **This phase turned out to be almost entirely an AUDIT, not a build.**
  Every earlier phase already carried its own migration and its own tuning
  pass as part of that phase's own Files list (player 6→7 for kcal/fullness,
  objects 2→3 for dish maps, world 4→5 for the D37 stove fix; `ROT`/
  `METABOLISM`/`PLATE_TUNING`/`DISH_TUNING` all landed already tuned by the
  phases that introduced them). Phase 9's job was to verify the WHOLE thing
  holds together end-to-end, close the one real gap (nobody had ever tested
  the full migration chain from a save that predates the entire overhaul),
  and clear a piece of tooling debt Session 10 explicitly flagged as
  Phase 9's to inherit. Concretely, almost nothing needed new production
  code — everything below except the new harness and the ONE-line format fix
  in `verify-w4.js` is either a verification pass or a `dev/verify/` fix.
- **config.js constant pass — no changes needed.** Read `METABOLISM`, `ROT`
  (with `THAW_TUNING`/`FROZEN_PRESERVATION`), `PLATE_TUNING`, `DISH_TUNING`,
  and `FOOD_TUNING` in full: all five are already correctly tuned by the
  phases that own them (`FOOD_TUNING` turned out to be DoorDrop's delivery
  logistics — fees/tips/driver pool — not a food-calorie table at all,
  despite the name; nothing to rebalance there under this plan's "not an
  economy rework" thesis). **Restaurant kcal-vs-price sanity, measured**: all
  128 `RESTAURANT_DEFS` menu items resolve to an `ITEM_DEFS` entry with real
  kcal (zero missing); kcal-per-dollar ranges from **0.8** (espresso — you're
  paying for the drink, not the calories) to **150** (a whole cheese pizza,
  `servings: 4` — a batch item, realistically priced per slice). Both ends
  are defensible, not data-entry errors. Codified as a permanent regression
  assertion (bounded 0.5–250) in the new Phase 9 harness rather than left as
  a one-off manual check.
- **ui.js/render.js polish — already done by earlier phases, verified not
  built.** All three Phase 9 file-list items turned out to already exist:
  `fullnessStatusText` (sim.js) already derives starving/hungry/satisfied
  prose from the real fullness window and is wired into `render.js:833` and
  `:951` (from Phase 2). Every food picker already shows kcal-derived info:
  `buildPickRowContent` (render.js, Phase 3) shows "fed ~Xh" on eat/spread/
  reheat rows; the DoorDrop menu (render.computer.js:1326) shows kcal per
  item; ChefBook cards (Phase 8) show `kcalPerServing`. The doormat "auto-
  transfer" is a one-click button (`doAutoTransferFromDoormat`, ui.js) that
  auto-shows whenever the doormat holds anything (Phase 1) — the plan's
  original "toggle default on" phrasing predates Phase 1's actual
  button-based implementation and is superseded by it; a toggle would be
  strictly worse UX than a self-showing button, so this was NOT retrofitted.
- **mealsToday/mealsWellFed/hunger readers — already consistent, verified not
  reconciled.** Traced every writer/reader: `applyPlayerMeal` (effects.js)
  is the only `mealsToday` writer, gated on `kcal >= METABOLISM.minKcalForMeal`
  (D4); `resolveMoodTarget` (sim.js) reads `mealsWellFedCount`/
  `mealsWellFedBonus`/`mealsSkippedFromHour` off it; day rollover
  (`ui.js:196`) is the only place it resets to 0. No stray writer, no drift.
- **state.js migrations — confirmed NO new migration code was needed (new
  D41).** Investigated all three things the plan's Phase 9 file bullet named:
  - *"Kcal derivation for pre-kcal items"*: kcal lives in `ITEM_DEFS`/
    `RECIPES` — code, not save data — so there is nothing on disk to derive.
    A legacy pre-Phase-3 `meal_*` stack (no `meta.plate`) already resolves
    real kcal correctly through `EAT_ITEM`'s existing def-driven branch
    (`isPlateStack()` false → reads `kcalOf(def)` directly) — proven live in
    the new harness below, not just asserted.
  - *"Plate-metadata backfill"*: deliberately NOT built. Design invariant 1
    (a cooked plate is a snapshot) plus the `cooked_meal` carrier def's own
    header comment ("the legacy `meal_*` defs above stay for saves cooked
    before this phase") already settled this during Phase 3: old food stays
    old food, forever, on purpose. There is no plate-shaped hole to backfill
    because a pre-Phase-3 save never had plates to begin with — it only ever
    had `meal_*` stacks, which still work unmodified.
  - *"Freezer bucket addition"*: already handled by the EXISTING
    `ensureAllObjectBuckets`/`ensureObjectsForBucket` self-healing pipeline
    (world.js), keyed on `gameState.meta.layoutVersion` vs
    `APARTMENT_LAYOUT_VERSION` — Phase 1 already added the freezer to
    `APARTMENT_LAYOUT.kitchen`, so any save with a stale `layoutVersion`
    picks it up automatically on next load, no bespoke migration required.
    Proven live in the new harness (a mocked pre-Phase-1 kitchen bucket with
    no freezer object gets one after a real `loadGameState()` call).
  - All three were verified via a NEW integration harness (below) that
    exercises the REAL `loadGameState()`/`checkAndMigrateFolder` chain
    against a mocked save frozen at player v6 / objects v2 / a stale
    `layoutVersion` — not just the individual per-key migration functions in
    isolation, which is what every earlier phase's harness tested instead.
- **dev/verify/verify-food-phase9.js (NEW), 6/6 passing.** Four sections: (1)
  the full pre-overhaul→current migration chain through the real
  `loadGameState()`, including the displayed-satiety-survives-the-real-load-
  path check; (2) a legacy `meal_pasta` stack eaten through the real
  `EAT_ITEM` effect, proving no backfill is needed; (3) the restaurant
  kcal-vs-price sanity regression bounds described above; (4) an integration
  check tying `mealsToday`/the well-fed bonus/the D4 kcal ledger together
  across two real meals in a day. Iterated once on a wrong `EAT_ITEM` effect-
  DSL call shape (`who=x defId=y` key=value syntax doesn't exist — the real
  shape is positional: `EAT_ITEM defId qty from who?`) before landing.
- **Live browser week-long simulation, `dev-harness.html` (real browser, real
  page, zero mocking of `applyEffects`/`cooking.js`/`sim.js` — only kv
  writes were neutralized).** Used the documented SAFE pattern: stubbed
  `saveAtBoundary`/`queueWrite` to no-ops (never swapped `root.kv` — the
  documented-unreliable kv-swap protocol was NOT used) for the duration,
  built a fresh 2-roommate house via `SIM_generateHouse` and assigned it
  directly to `currentGameState`, then drove a real week: cooked pasta
  through the actual `cooking.js` engine (`planCook`/`resolveCookPlan`/
  `buildPlate`) and ate it; ate a "delivered" dish; froze the day-3 leftover
  batch mid-week (`freezeStack`); on day 5 pulled it out, reheated it
  (`REHEAT_ITEM`), and ate it; fed a roommate NPC a shared serving. Hunger
  stayed in sensible bands throughout — correctly bottomed at 0 after a full
  day with nothing eaten (day 4), correctly recovered to 67.5 after the day-5
  reheat-and-eat. `frozeSomething`/`reheatedOk` both confirmed true; the fed
  NPC's hunger rose 36→61 (invariant 3 — calories convert to their one
  number). **Zero console errors** across the whole run, before or after
  reload. Page was reloaded afterward to discard the in-memory test state
  and the stubs (no kv was ever actually written to).
- **Harness tooling debt fully cleared — Session 10's flagged "18 DID NOT
  REPORT" is now 0.** This is the one place Phase 9 genuinely reached
  outside its own file list, because Session 10 explicitly named it as
  Phase 9's inheritance ("Phase 9 ... should not skip this") and the
  standing session rule requires `run-all.js` to report zero "DID NOT
  REPORT" lines before a session ends:
  - **6 fixed directly** (`verify-food-phase2.js` through
    `verify-food-phase7.js`): the exact proven-safe wrap from Session 10's
    phase8 fix (`async function main() { ... } main();` around everything
    after the last top-level `api(...)` helper block).
  - **12 unrelated-plan harnesses** (`w4/w5/w6/w7/w8/w11/w13/w15/w16/w17/w18/
    w19.js`) — delegated to a background agent with exact per-file
    diagnostics already gathered. It got through the mechanical top-level-
    await wrap (`w15`–`w19`) and the missing-`house()`-helper fix (`w5`,
    `w8`) before hitting a session spend limit; the remaining 4 were finished
    directly:
    - `w7`/`w13`: a literal `\\'` (double-escaped backslash-quote) instead of
      `\'` inside label strings — broke string parsing outright.
      `w13` had one more bug underneath once that was fixed: a dead
      `e('self', 'mood') === 0 || true` clause that still THREW before the
      `|| true` could mask it, because `DRIVE_DEFS.intimate.effects` has no
      `need:'mood'` entry (mood rides a separate `MOOD_DELTA` effect) — the
      comment on that exact line already said mood is checked by the next
      assertion instead, so the dead clause was simply deleted.
    - `w6`: `simulate()`'s function body was missing its closing `}` entirely
      — a `return {...}` object literal's own closing brace was standing in
      for the function's, and nothing was left to close the function itself.
      One more bug underneath: `CLOTHING_STATES` was referenced directly in
      the outer Node scope where only the sandboxed vm has it (this file's
      later sections pull real values OUT of the vm via `simulate()`'s
      return object and check them with plain `.every()`, unlike the
      `api(...)`-string style most other harnesses use) — fixed by binding
      `const CLOTHING_STATES = api('CLOTHING_STATES');` once near the top.
    - `w11`: `\n`/`\d` written literally inside an OUTER template literal
      destined to become vm source got escape-processed by the OUTER parser
      before the vm ever saw them — `'\n'` became a raw unescaped newline
      mid-string (breaking the vm's own parse of it) and `\d` silently lost
      its backslash (a silent correctness bug, not a crash: the regex would
      have matched literal `d` instead of a digit). Needed an extra
      backslash (`\\n`/`\\d`) so the two-character escape sequences survive
      to reach the vm's parser. Also had three bare calls to
      `ACTION_REQUIREMENT_CHECKERS.privacy`/`.afterSexOrClose` written as if
      they were free functions — they're keyed entries on that table, not
      top-level names.
    - `verify-w4.js` never actually "broke" in the crash sense: it was
      silently missing the two-space indent (`  N passed, M failed`)
      `run-all.js`'s regex requires on its own summary line, so it always
      reported "DID NOT REPORT" under `run-all.js` despite passing cleanly
      (27/0) every single time it was run directly — a one-line format fix.
      (This one cost real time to diagnose: it looked identical to a
      genuinely flaky test until the raw captured bytes were compared
      byte-for-byte against a passing harness's summary line.)
  - **Final state:** `node dev/verify/run-all.js` → **2254 passed, 57
    failed, 0 harness(es) errored.** The 57 failures are pre-existing, REAL
    (not broken) assertion failures in other plans' harnesses
    (`c1/c2/c4/i2/i3/i5/p4/r1/r34/s1/s2/s5/w12/w13/w15/w16/w17/w18` —
    Intimacy & Voyeurism and various roadmap plans), unrelated to food work
    and not investigated, matching Session 10's precedent for genuinely
    out-of-scope failures. Several of these (`w13`/`w15`–`w18`) were
    invisible before this session because their harnesses crashed before
    reaching any assertion at all — they are newly VISIBLE now, not newly
    broken, and are flagged here for whichever plan owns them.
- **Blockers / flagged deviations:** None. Every Phase 9 Verification bullet
  was actually run (the new harness, the live week-long browser pass, the
  full `run-all.js` suite) and passed.

**Session 10 notes (Phase 8 — ChefBook, the recipe website: cards from the
engine, unlock-on-taste, Add All Ingredients to Cart, meal planner; D21/D22,
new D40 — BUILT):**
- **This session had a real Node.js (v22.18.0) and a real browser (Claude
  Browser MCP) available — a materially different environment from Session
  9's, which had neither.** The prior "Node-less harness runner" note below
  this paragraph described a custom execute_js-worker rebuild that is **no
  longer accurate for this environment** and has been deleted from this
  section — `node dev/verify/verify-<name>.js` and `node dev/verify/run-all.js`
  just work directly. Live DOM/UI verification used
  `dev-harness.html` (already in the repo root) served via
  `python -m http.server 8734` (the `slice-of-life` config in
  `.claude/launch.json`) and driven with a real browser tool — no bespoke
  kv-swap or execute_js shim needed. **Do not assume either tool is present
  without checking first** — a future session may again land somewhere
  Node-less; verify before trusting this note.
- **defs.computer.js.** `RESTAURANT_DISH_IDS` (new, derived once next to
  `RESTAURANT_DEFS_LIST`) — every itemId any restaurant sells, as a `Set`.
  `APP_DEFS.recipes` ("ChefBook"): `browse`/`detail` (hidden from nav,
  `viewingRecipeId`-driven like Classifieds' applicant profile)/`planner`
  screens, `devices: ['computer', 'phone']` (full parity, zero phone-specific
  code — the shared `COMPUTER_RENDERERS` path just works, confirmed live).
- **computer.js.** `defaultComputerState().apps.recipes = { unlockedIds: [],
  planner: [], viewingRecipeId: null }` — this is the ENTIRE migration story;
  `normalizeComputerState`'s existing per-app deep-merge backfills it on any
  older save with no code change (verified: a save with `apps.recipes`
  deleted entirely loads with the fresh default). New functions: `isRecipeCardId`,
  `maybeUnlockRecipeCard` (the D21 hook — player-only, idempotent),
  `chefNotesFor`, `recipeCardFromEngine` (runs `RECIPES` entries through the
  REAL `cooking.js` engine — `planCook`/`resolveCookPlan`/`buildPlate` — at a
  fixed `hashStr(recipe.id)` seed, so the card is deterministic per
  invariant 4 while still reflecting current skill/equipment),
  `recipeCardFromDish` (a restaurant dish's flat ITEM_DEFS-only card, no
  ingredients/steps/grade), `recipeCardFor`/`recipeCardsFromEngine`,
  `allFoodStorageStacks`/`kitchenShoppingPool` (whole-apartment fridge/
  pantry/freezer scan — NOT `defs.actions.js`'s `kitchenContainers`, which is
  deliberately scoped to `ctx.roomId` and wrong for a computer-side shopping
  list), `addRecipeIngredientsToCart`/`addPlannerIngredientsToCart` (diff
  against the whole kitchen AND whatever's already queued in the Nile cart —
  a repeat click is a no-op, verified both in the harness and live),
  `addToPlanner`/`removeFromPlanner`/`shoppingListForPlanner` (sums/dedupes
  ingredient need across every planned day).
- **effects.js.** ONE line added inside `applyEatItem`'s per-stack loop:
  `if (who === 'player') maybeUnlockRecipeCard(ctx.gameState, plate ?
  plate.recipeKey : s.defId)`. Every player bite — cooked plate or ready-made
  dish — reaches this; `maybeUnlockRecipeCard` no-ops on anything not
  card-eligible (D40), so it's safe unconditionally.
- **render.computer.js.** Three bespoke renderers (`renderRecipesBrowse`/
  `Detail`/`Planner`, registered in `COMPUTER_RENDERERS` as `'recipes-browse'`
  etc.) — bespoke rather than the generic `catalog`/`list` because a card
  detail drill-down and a shopping-list action fit neither, same reasoning
  DoorDrop's four renderers already established. Detail shows kcal/grade/
  chefNotes/steps/ingredients and the cart button only when `ingredients.length`
  (a restaurant dish's card has none). Planner has its own add-row (`#planner-
  recipe` select + `#planner-day` number input, read at submit time — same
  transient-DOM-state pattern as DoorDrop's `#food-time` and the maid's grid)
  restricted to unlocked `RECIPES` entries only (a restaurant dish can't be
  planned — no ingredients to shop for).
- **ui.computer.js / ui.js.** `doRecipesOpenDetail`/`doRecipesAddToCart`/
  `doRecipesPlannerAdd`/`doRecipesPlannerRemove`/`doRecipesPlannerFillCart`
  in ui.computer.js (mirroring `doHomeAddToCart`'s device-aware nav shape,
  `doFoodOpenRestaurant`'s device parameter); five `recipes.*` cases added to
  `handleAction`'s switch in ui.js (where `food.*`'s cases already live —
  the dispatch switch is centralized there regardless of which file defines
  the handler).
- **icons.js.** Added a `recipes` icon (open book, distinct from Codex's
  closed notebook) — this file's own header documents a REAL prior landmine
  (`upgrades` shipped with no icon and silently rendered a blank desktop
  tile for a whole phase); every new `APP_DEFS` entry should get one in the
  same pass rather than relying on `svgIcon`'s silent `''` fallback.
- **index.html.** `?v=` bumped on all 7 touched files: `icons.js` 27,
  `defs.computer.js` 30, `effects.js` 36, `computer.js` 58,
  `render.computer.js` 46, `ui.js` 104, `ui.computer.js` 46.
- **dev/verify/verify-food-phase8.js (NEW), 16/16 passing.** Covers card
  eligibility/shape (RECIPES vs restaurant-dish vs raw-ingredient vs
  freeform), the unlock hook (cooked plate / restaurant dish / raw
  ingredient / idempotency), cart-diff correctness AND repeat-click
  idempotency, planner dedupe/remove/fill-cart, and the real write/load
  round trip INCLUDING a simulated pre-Phase-8 save (`apps.recipes` deleted
  before writing) to prove the migration story. **Had to wrap the whole
  check sequence in `async function main() { ... } main();`** — Node
  v22.18.0 refuses to run a file that mixes top-level `require()` with
  top-level `await` (`ERR_AMBIGUOUS_MODULE_SYNTAX`), which the established
  `verify-food-phase*.js` shape does. Live DOM pass (`dev-harness.html`,
  real browser, real click/form_input): browse screen lists only unlocked
  ids with correct kcal/grade (no grade shown for a restaurant dish);
  detail shows steps/ingredients/chefNotes and the cart button; "Add All
  Ingredients to Cart" on a starter-stocked recipe (Pasta) correctly added
  NOTHING and logged "already has everything" (the starter pantry genuinely
  covers it — not a bug); the same button on Stir-fry (needs `chicken_raw`,
  which the starter fridge does NOT stock) added exactly one cart line;
  planner add/remove/fill-cart all worked, including "Fill Nile Cart"
  correctly seeing the item already queued from the prior test and adding
  nothing twice; phone parity confirmed (same cards, same detail screen, via
  the identical shared renderer path — zero phone-specific code needed); no
  new console errors at any point.
- **Real pre-existing breakage found, NOT fixed (out of phase scope) — flag
  for whoever picks this up:** `node dev/verify/run-all.js` on this Node
  version currently reports **18 harnesses as "DID NOT REPORT"**:
  `verify-food-phase2.js` through `verify-food-phase7.js` (6 files) plus
  `verify-w4/w5/w6/w7/w8/w11/w13/w15/w16/w17/w18/w19.js` (12 files, unrelated
  plans) — ALL for the exact same reason my new phase8 harness hit before I
  fixed it: `require()` + top-level `await` is ambiguous module syntax on
  Node 22.18.0. This means **the claimed "242 passed, 0 failed" Phase 1–7
  status (Session 9) is currently unverifiable via plain `node <file>.js` in
  this environment** — Phase 1 (28/28) and the non-phase-numbered
  `verify-food.js`/`verify-meal.js` (33/0, 31/0) DO still run and pass
  cleanly (they don't use top-level `await`), so this is specifically a
  phase2–7 harness-shape problem, not a Phase 1–7 LOGIC regression. Fix is
  mechanical and proven safe (applied to phase8 this session): wrap
  everything after the `api(...)` helper-injection block in
  `async function main() { ... }` then call `main()` at the end, with
  `process.exit(...)` staying as the last line inside it. Left unfixed
  because touching 18 files outside this plan's Phase 8 scope violates the
  one-phase-per-session rule — but Phase 9 (or a dedicated tooling pass)
  should not skip this: right now `run-all.js`'s "zero DID NOT REPORT" gate
  cannot be met at all for this repo until it's done. Separately, the
  46 pre-existing FAILED (not broken) assertions this run surfaced
  (`verify-c1/c2/c4/i2/i3/i5/p4/r1/r34/s1/s2/s5/w12.js`) are unrelated to
  food/computer work and were not investigated.
- **Blockers / flagged deviations:** None for Phase 8 itself — every
  Verification bullet in the Phase 8 block below was actually run and
  passed. See the "18 harnesses DID NOT REPORT" note above for the one
  thing worth a future session's attention.

## The thesis

Food is the only major system in this game that is still a stat-touch. Hunger
is one derived number, meals are fixed entries in a def table, cooking is a
single picker that teleports ingredients into a finished item, and nothing
you do in the kitchen leaves a mark on anything else. Meanwhile NPCs, needs,
relationships, the economy, and the apartment itself are all systems with
real depth. The food overhaul closes that gap — and it can do it without a
rewrite, because the plumbing is already there: containers with preservation,
an effect DSL, async picker actions, facility tiers, NPC drives, and a
delivery pipeline. What's missing is a *model*: a metabolism that lives,
meals that are actually made of what you cooked, a kitchen you invest in, and
a food culture that reaches NPCs and the computer.

### What this plan is *not*
- **Not a clinical nutrition simulator.** Kcal is the one metabolic currency;
  per-nutrient body pools are explicitly dead (D2). "Realistic" means the
  numbers on food are real USDA-derived values and the direction of the
  mechanics is true to life — never a spreadsheet pretending to be a body.
- **Not a grind machine.** Interactive cooking is the manual path with real
  stakes, but auto-cook (D14/D15) is first-class: a meal cooked well enough
  once can be instant-cooked forever after. A player who doesn't want to play
  a cooking minigame every dinner must not have to.
- **Not a recipe-collection expansion.** Endless combinations come from the
  verb + tag + stage engine (D16), not from authoring thousands of recipe
  defs. Enumerated recipes survive only as unlockable *cards* on the website
  (D21), derived from the same engine.
- **Not a restaurant or economy rework.** DoorDrop restaurants keep their
  mechanics and pricing; they gain kcal data and ride the same pipeline.
  Grocery prices and delivery fees are not rebalanced here (the gig-economy
  balance in the 2026-08-17 audit governs money).
- **Not a save wipe.** Old saves migrate: food without kcal gets derived
  values once, meal instances missing plate metadata get a best-effort
  backfill, and the world/npc/objects folders are untouched by the new
  fields.

---

## Evidence

The current system, measured from code (line numbers will drift — find by
name):

| System | Today | Where |
|---|---|---|
| Hunger model | derived rhythm: `90 − hours×5`, floor 0 at 18h; sleep ×0.5; `mealsToday` cap 4 | `sim.js` `satietyFrom`/`decayPlayerNeeds`, `config.js` `HUNGER_RHYTHM` |
| Meal-size restore | hunger delta adds real satiety, capped at 90 (2026-08-17 B2) — but a 250-kcal snack and a 1200-kcal dinner both land at the same cap | `effects.js` `applyAdjustNeed` |
| Spoilage | perishables rot by `def.perishable.days × container.preservation + 2d grace`; fridge ×4, pantry ×2, bag ×1, doormat ×0.75, floor ×0.5; rotten → container state → smell. **The multipliers themselves are scattered** — only `bagPreservation`/`graceDays` actually live in `ROT`; fridge/pantry/doormat/floor each carry their own `container.preservation` on their OBJECT_DEFS entry, not one owning table (D18's rebalance is the moment to consolidate — see Design invariant 5) | `config.js` `ROT`, `defs.world.js` container defs, `sim.js` `processSpoilageForDay` |
| Freezer | **does not exist** | — |
| Meals | fixed `meal_*` defs with hardcoded values; cook = one picker. **Not single-serving-only**: `RECIPES` for pasta/stir-fry/fried-rice/soup already produce `qty: 2` and `buildCookEffects` already spawns the full batch and leaves the rest as untracked leftovers in inventory — there's no `servings` field or depletion bar (D25 formalizes what partially exists, it isn't building batch yields from nothing) | `defs.world.js` `ITEM_DEFS`/`RECIPES`, `defs.actions.js` `prepareCook`/`buildCookEffects` |
| Kitchen | stove is the only cooking surface; starts as a functional countertop burner day 1 (D37, 2026-08-18 — no longer broken) | `config.js` `FACILITY_STARTING_TIERS`, `defs.actions.js` `self.cook` requires |
| Dishes | abstract: `sink_kitchen.dishes`/`stove.burner` clutter counts, no types, no units, no capacity | `defs.world.js` states, `drives.js` eat-drive leaves |
| Groceries | Nile → `world.deliveries` → doormat spawn at day rollover; player then hand-sorts item by item | `ui.js` `processDeliveriesForDay`, `computer.js` `checkoutCart` |
| Food delivery | DoorDrop, 12 restaurants, driver pool, ETA, doormat-or-hands handover | `computer.js` `placeFoodOrder`, `ui.js` `handOverFoodOrder` |
| NPC food | eat drive raids bag then kitchen, eats until 65, scrounge fallback; maid cooks 2 meals/visit; no tastes | `drives.js` `tryEatFood`, `config.js` `NPC_INVENTORY`/`MAID_TUNING` |

The through-line: everything is *flat*. Food exists to move one number.
Nothing eats, cooks, or stores in a way that composes.

---

## Locked decisions

### Metabolism
- **D1 — Kcal is the single metabolic currency.** Full per-nutrient tracking
  (protein/lipids/carbs/micros) is dropped. Items carry `kcal`; the metabolism
  tracks calories, nothing else.
- **D2 — The rhythm is the substrate, metabolism is the driver.** The
  hours-since-last-meal rhythm and its 0–100 derived display survive, but the
  flat `5/hr` drain becomes a **metabolic rate** that ebbs dynamically: with
  the size and recency of meals, sleep (existing ×0.5 stays), and activity
  (exercise, gig work, physical actions raise it). Player "metabolic rate" is
  a living multiplier, not a constant.
- **D3 — Meal size sets the fullness window.** Eating doesn't reset a
  flat "satiety 90" — the kcal of what you ate sets a **fullness window**
  (approx. 1h per ~250 kcal, capped, diminishing returns on feasts). A snack
  keeps you fed an hour; a dinner keeps you fed the evening. Fullness 0 = the
  existing starvation line.
- **D4 — Daily energy ledger, short-term only.** Track `kcalToday` intake vs
  expenditure (basal × rate + activity), rolled at day rollover. A deficit
  day accelerates hunger, slows energy recovery, and pulls mood down (small);
  a surplus day is the mirror. **Weight/body trend is OUT of scope v1**
  (parked — see Open questions). `mealsToday`'s well-fed/skipped-meals mood
  terms get reconciled with the ledger during Phase 2 (they survive, keyed to
  real meals rather than any positive hunger delta).

### Meals & cooking
- **D5 — Meals are instances, sum of their parts.** A cooked plate carries
  its own `meta.plate` snapshot: kcal (and quality) genuinely computed from
  the ingredient values consumed + a **meal bonus** that scales with recipe
  complexity (distinct foods / food-group variety). Fixed `meal_*` def values
  are gone as the source of truth.
- **D6 — Batch yields, portions, rarely single-serving.** Cooking produces
  `servings.total` based on quantities and method (D25 locks the field name
  and its Servings-bar UI); a big pot of stew feeds the household and the
  week. Servings are what you eat.
- **D7 — Leftovers are a mechanic.** Cooked portions keep via the freshness
  ladder, are reheatable (Phase 3's stove/oven fallback, a proper microwave
  in Phase 6; a cold or still-frozen portion loses its `betterHot` mood bonus
  entirely — D25–D29), and can be eaten by NPCs or used in set_meal spreads.
- **D8 — Cooking fats and seasonings are real reagents.** Oil, butter, salt,
  sugar, spices join the pantry as tiny-quantity consumables with real kcal
  weight (frying adds oil fat) and a **taste gate** (underseasoned/overseasoned
  outcomes in Phase 5). Stir-fry needs oil; baking needs flour *and* fat.
- **D9 — Cooking and eating generate real dishes and mess.** Tracked by type
  in the rooms where they happen (sink, table, stove, dishwasher). No more
  abstract `dishes: 1` — there are plates, cups, forks, pans.
- **D10 — Dishes carry type data: size and capabilities.** A pot has
  `sizeL` and enables boiling; a pan enables frying/sautéing; a tray + oven
  enables baking/roasting; a wok enables stir-frying. Capability is the gate,
  size is the capacity.
- **D11 — Dish washing is capacity-modeled.** Hand-wash (`self.dishes`) and
  dishwashers both wash a number of **dish units per cycle/action**, scaled
  by skill and equipment tier.
- **D12 — Equipment genuinely aids cooking.** Better stove = more burners
  (parallel cooking) + better temperature control (less burn risk); mixer
  speeds processing/mixing and unlocks knead/whip/blend; bigger dishwasher
  fits more; bigger pots boil more; freezer preserves; microwave reheats and
  defrosts. All ride the existing FACILITY_DEFS/RenoFix tier pipeline.
- **D13 — Equipment gates failure risk and throughput, not just unlocks.**
  A cheap pan burns things; a good one forgives. Upgrades are felt in the
  moment, not just as menu doors opening.
- **D14 — Grades and auto-cook.** Manual cooks are graded **F, D, C, B,
  A−/+, S−/+**. Cooking a recipe to a grade at or above its auto-cook
  threshold unlocks **instant cook** for it (ingredients consumed, plate
  produced, auto-quality roll) — forever, given ingredients on hand.
  **Equipment upgrades lower the threshold** (a great stove lets a B-grade
  habit auto-cook what used to need an A).
- **D15 — Interactive cooking is the manual path; auto-cook is first-class.**
  The manual loop (choose cookware → process → mix → cook, per D16) is
  opt-in for quality, experiments, and grade-chasing. Botches are recoverable
  and *flavorful* — burnt, raw, bland, overseasoned, mushy — each with
  different consequences and rescue paths (burnt → charred flavor, lower
  quality; raw → finish it, risk it, or toss it).
- **D16 — Endless combinations from a bounded engine.** Verbs (chop, slice,
  mince, whisk, knead, blend, simmer, boil, fry, sauté, sear, bake, roast,
  steam) × ingredient tags (starchy, meaty, sweet, leafy, ...) × stages (raw
  → processed → cooked) × cookware-gated methods. A plate's identity is
  composed, not enumerated; the recipe-card website (D21) publishes what the
  engine can already produce.

### Storage & grocery
- **D17 — Freezer.** A real container object (or fridge tier) that halts
  spoilage (near-infinite preservation on a long shelf, e.g. ×20+). Makes
  bulk buying and batch cooking rational. Shipped in Phase 1 with the pickup
  rework, not later.
- **D18 — Spoilage is too aggressive; rebalance the whole ladder.** Fridge
  ×4 and the current cadence make food rot before it's eaten; long-shelf
  staples (pasta, rice, canned) should NOT rot on a playable timescale.
  Phase 1 re-derives `ROT`/preservation multipliers from first principles
  (real-world-ish shelf life compressed to game pace, not the reverse).
- **D19 — Grocery pickup: "Pick Up" vs "Auto Transfer To Storage."** At the
  doormat, delivered groceries can be taken item-by-item (today's flow) or
  auto-sorted to the right container by type: short-shelf perishables →
  fridge, freezer items → freezer, long-shelf dry/canned → pantry, drinks →
  fridge. No more hand-sorting a shopping order.
- **D20 — Cook from storage.** Recipes draw ingredients from the fridge,
  freezer, and pantry directly; you never have to carry everything in your
  bag to cook. (NPCs already do this via the eat drive — the player gets the
  same privilege.)

### Discovery & planning
- **D21 — In-game recipe website.** A real computer app: searchable/browsable
  recipe cards, **unlock-on-taste** (eat a dish → its card unlocks), and
  **"Add All Ingredients to Cart"** — one click stages the whole shopping
  list into the Nile cart.
- **D22 — Meal planning.** Plan meals for upcoming days → auto-generated
  shopping list → one-click order (via D21's add-to-cart) → auto-sorted on
  pickup (D19). Kills the "what do I even need to buy" guessing game.

### NPCs
- **D23 — NPC taste preferences.** Per-NPC likes/dislikes (leveraging the
  existing personality/bible data) that move set_meal outcomes: a cooked-for
  NPC gets relationship and mood deltas scaled by whether you fed them
  something they actually like.
- **D24 — NPCs run on the same pipeline.** They auto-cook (grade rolled
  automatically, mess + dishes generated), eat by calories converted to their
  single hunger need, and draw from kitchen storage — never through the
  interactive loop.

### Servings, freezing & reheating (session 2 refinement, 2026-08-18)
- **D25 — The Servings bar.** Building on D6: every prepared meal displays a
  **Servings bar** — `servings.left / servings.total` as a fraction — that
  depletes uniformly per serving eaten regardless of the total count. Eating
  one serving off an 8-serving stew drains the same relative amount as eating
  one off a 2-serving portion; the bar is the primary "how much is left" UI,
  not a raw count. (`servings.total`/`servings.left` already exist on the
  Phase 3 plate shape below — this locks the UI contract on top of them.)
- **D26 — Freezing trades shelf life for a recook touch.** A frozen stack
  (ingredient or cooked plate) does not age at all while frozen — effectively
  forever, per D17 — but cannot be eaten normally without first passing back
  through a reheat/recook action (`REHEAT_ITEM`, Phase 3; a real cook pass
  for frozen raw ingredients, unchanged). This is deliberate: freezing a
  week's batch still means a kitchen touch every day, not a way to opt out of
  the food loop entirely (see the freeze-and-coast risk this closes).
- **D27 — "Better Hot" tag.** Recipes/dishes may carry `betterHot: true`.
  Eating one that was not reheated (served cold, or still frozen) forfeits
  its **entire** mood bonus — zero, not reduced. This is D26's mechanical
  teeth: skipping the reheat step has a real, felt cost.
- **D28 — Eating frozen is allowed but costs mood, unless it's meant to be
  frozen.** Bypassing D26 and eating straight from the freezer is always
  possible; for ordinary food it imposes a definite mood penalty (distinct
  from and in addition to D27's forfeited bonus). Items tagged `frozenFood`
  (ice cream, popsicles, and the like) are exempt — eating them frozen is the
  intended, undiminished experience.
- **D29 — Thawing.** A frozen stack thaws — leaves the frozen state — by
  spending time somewhere that isn't refrigeration/freezing: carried in the
  bag, left on a counter, stored in the pantry. Thawing is duration-based
  (room-temperature exposure), not instant; once thawed, the stack resumes
  the normal (D18-rebalanced) spoilage clock from its frozen-at anchor — no
  time is "lost" while frozen.
- **D30 — The freezer is a separate kitchen object, not a fridge tier.**
  Decided during Phase 1 (was the Open-question "new object or fridge
  tier?"). Implemented as a `freezer` OBJECT_DEF in the kitchen layout
  (chest-freezer floor-plan glyph), its own `storageClass: 'freezer'` row in
  `ROT.preservation` (25×), and a `kitchen_freezer` facility starting at the
  'functional' tier (Phase 6 reuses the renovation FACILITY_DEFS pipeline to
  upgrade it). Storage-class routing (D19) keys off the class, so a
  tier-upgrade fridge replacing the separate unit would need no sorter
  change.
- **D31 — Hydration is deliberately OUT of scope (decided during Phase 2).**
  The open-question hydration meter (water/coffee/juice matter, overhydration
  cap, a second metabolic track) is parked, not built. Drinks stay
  calorie-only for v1: `bottled_water` carries NO kcal and no consumable
  block (never enters the eat picker, never feeds the ledger), and
  `fullnessHoursFromKcal(0) === 0` — a 0-kcal drink is hydration, not a
  meal. A future hydration track can ride the same ledger shape.
- **D32 — The meal bonus is food-group variety (decided during Phase 3).**
  Each distinct food group beyond the first on a plate adds
  `PLATE_TUNING.groupBonusKcal` kcal and a `qualityFromVariety` quality bump.
  Chosen over distinct-food count because it rewards balanced plates without
  pretending to nutrition science (D2). Components carry `foodGroup` on their
  ITEM_DEFS; `makePlate` reads them at cook time (Phase 5's fats/seasonings
  land in the same group set when they get real values).

- **D33 — The sink is pressure-only, never a hard gate (decided during Phase
  4).** A full sink does not block cooking or any other action — the
  deliberate answer to the Phase 4 open question "hard-block or
  pressure-only?". Dirt escalates through the derived 'few'/'many' ladder
  (DISH_TUNING.sinkDirtyAtFew 2 / sinkDirtyAtMany 8) into the dirty_dishes
  signal and the room's cleanliness, and washing is a capacity model
  (DISHWASH_TUNING: hand-wash 4→10 units by cleaning skill, dishwasher 8/12
  units per 45/40-min cycle by kitchen_appliances tier). The dishwasher's
  purchase-decision weight comes from wash convenience, not from unlocking
  anything cooking needs.
- **D34 — Rescues are portion-counted; overseasoned is reached through them
  (decided during Phase 5).** Each rescue id applies AT MOST ONCE per plan
  (`plan.rescues` marker), and add_salt adds a salt PORTION even to an
  already-salted dish. overseasonedAt = 3: the base cook screen only reaches
  0–2 flavor (None/Salt/Spices/Both), and the outcome screen's seasoning
  rescues are offered on ANY cooked dish (reagent on hand, rescue not yet
  applied, dish not already overseasoned) — so pushing a 2-flavor dish past
  the need is exactly how the player experiences D8's over-seasoning, and the
  "taste and adjust" loop is real. Salt is presence-blind on purpose: adding
  salt to an already-salted dish is the classic "needs salt… no, too much"
  mistake, not a no-op.
- **D35 — Reagent ids ARE item defIds (decided during Phase 5).**
  `COOK_TUNING.reagents` keys must equal the pantry ITEM_DEFS id
  (oil/butter/salt/spices/sugar), so availability, consumption and kcal all
  hit the same stack. The first cut keyed `spice` against the `spices` item,
  which silently made spices unavailable and unconsumable — found in live
  testing, fixed by renaming the key rather than adding a defId indirection.
- **D36 — The outcome screen reveals the PLATE's final grade (decided during
  Phase 5).** `buildPlate`'s ingredient×execution blend — the dish that
  actually lands in the fridge — is what the cook screen's grade/quality
  reveal shows, computed with the same inputs Serve uses, so what's revealed
  is what's eaten. Showing the raw execution quality alone misled (an F/19%
  reveal with a D/39% plate landing), and the per-step lines already give the
  execution detail.
- **D37 — The kitchen starts with a WORKING cooktop (user decision,
  2026-08-18).** `FACILITY_STARTING_TIERS.kitchen_stove` is 'functional',
  flavored as a single countertop electric burner ("one coil, slow to heat,
  quick to burn. Shabby, but it cooks.") — cooking is playable from day one
  (the starter groceries already made day-one recipes possible). 'broken'
  survives only as a migration backstop (facility decay floors at
  'functional', renovation locked decision #5, so nothing in play can
  re-break it); the 'upgraded' gas range (6000/6d) is the paid RenoFix goal,
  and the functional tier is cost 0 / duration 0 because it's the baseline,
  not a purchasable upgrade. Existing saves get the same start: world 4→5
  migration (state.js) flips a persisted `kitchen_stove.tier === 'broken'`
  to 'functional' with condition 100 — safe because a broken stove on disk
  can only mean the old new-game default.
- **D38 — The microwave is a real kitchen OBJECT (not an appliance tier)
  whose SPEED is tiered (decided during Phase 6).** `self.microwave` is a
  proper ACTION_DEF sourced from a `microwave` object in the kitchen layout
  (APARTMENT_LAYOUT_VERSION 8), gated on `kitchen_appliances` being
  functional, with its reheat time read from `EQUIPMENT_DEFS.microwave`
  (3 min functional / 1 min upgraded) — always faster than the stove's
  `self.reheat` (ACTION_TUNING.reheatMinutes 10), and it reuses the SAME
  REHEAT_ITEM effect so `wasReheated` semantics never fork. The freezer
  stays equipment-tier-labeled (D30's object already exists) with
  preservation living on ROT, not tiers.

---

- **D39 — NPC tastes are DERIVED-but-stable, never stored (decided during
  Phase 7).** `npcTaste(npc)` in `src/srcfiles/taste.js` computes
  likes/dislikes deterministically from `bible.genSeed` + NPC traits
  (`TASTE_TUNING.traitAnchors`), every NPC getting exactly `likesPerNpc` 3 /
  `dislikesPerNpc` 2 by capping anchor pushes and re-filtering candidates
  between the like and dislike draws (the original draw ordering silently
  dropped overlapping picks, leaving some NPCs a dislike short — caught by
  the strictened phase-7 harness). An explicit `npc.taste = {likes, dislikes}`
  on an NPC instance overrides the derivation — no new persisted key, no
  migration. Chosen over a stored field because tastes then vary across saves
  without data, stay stable within a save, and match how NPC traits already
  work.

---

- **D40 — ChefBook card eligibility is RECIPES ∪ RESTAURANT_DISH_IDS, not
  Phase 7's broader "ready-made food" set (decided during Phase 8).**
  `isRecipeCardId` (`computer.js`) says yes only to a `RECIPES` key or an
  itemId some `RESTAURANT_DEFS` menu actually sells — narrower than
  `tryEatFood`'s ready/raw split (`category ∈ {meal, snack, drink, food}`,
  Phase 7), which exists to answer "is this eaten without cooking," a
  different question from "is this a dish worth a card." A raw ingredient or
  a `freeform` cook (D16 — no `RECIPES` template) never gets a card.
  Unlocking is player-only (`maybeUnlockRecipeCard`, called once from
  `EFFECTS`' `applyEatItem`, idempotent) — NPCs eating never discovers a
  card, matching D21's "taste it yourself" framing. A restaurant dish's card
  carries no `ingredients`/`steps`/`grade` (it's delivered whole, never
  cooked from a list); only `RECIPES` entries are plannable in the Meal
  Planner or shop for. "Add All Ingredients to Cart" and the planner's
  "Fill Nile Cart" both diff against bag+fridge+pantry+freezer (D20's whole
  kitchen) AND whatever units are already queued in the Nile cart, so a
  repeat click is a no-op rather than a duplicate order.

- **D41 — Phase 9 needed no new state.js migration code (decided during
  Phase 9).** All three items named in Phase 9's original file list turned
  out to already be handled by infrastructure earlier phases built: kcal
  lives in `ITEM_DEFS`/`RECIPES` (code, not save data), so there is nothing
  to derive for "pre-kcal" items — a legacy stack's read path already
  resolves it live. A pre-Phase-3 `meal_*` stack needs no plate-metadata
  backfill because design invariant 1 (a cooked plate is a snapshot) plus
  the Phase 3 decision to leave old `meal_*` defs permanently in place means
  there is no plate-shaped hole to fill — old food stays old food, unchanged,
  forever, on purpose. The freezer backfills onto an old save automatically
  through the EXISTING `ensureAllObjectBuckets`/`ensureObjectsForBucket`
  self-healing pipeline (keyed on `APARTMENT_LAYOUT_VERSION`), which Phase 1
  already wired when it added the freezer to `APARTMENT_LAYOUT.kitchen` — no
  bespoke migration needed. Verified end-to-end (not just per-mechanism) by
  `dev/verify/verify-food-phase9.js`'s migration-chain section, which runs a
  mocked pre-overhaul save (player v6, objects v2, a stale `layoutVersion`)
  through the REAL `loadGameState()`.

## Data model

### Plate instance — the shape everything converges on (Phase 3)
```js
// On a meal stack, ITEM_DEFS provides only label/base; the real data is here.
stack.meta.plate = {
  recipeKey: 'freeform' | recipeId,
  label: 'Stir-fried vegetables and rice',        // composed display name
  kcalPerServing: 612,
  servings: { total: 4, left: 4 },                // D25 — the Servings bar reads left/total
  quality: 0.82,                                  // 0..1
  grade: 'A-',                                    // D14 scale
  components: [{ defId: 'rice', qty: 2, stage: 'boiled' }, ...],
  method: 'stir_fry',
  cookware: 'wok',
  preparedAbs: 1482336000,                        // freshness anchor (continuous clock)
  wasReheated: false,                             // D27 — set true by REHEAT_ITEM; gates the betterHot bonus
}
```
Computed once at cook time, stored on the instance. The old `meal_*`
hardcoded consumable values stop being read once a plate exists.
`RECIPE`/dish defs gain a static `betterHot: true` flag (D27) read at eat time
against `wasReheated`/frozen state — not part of the instance, since it never
changes per-instance.

### Frozen/thaw state (Phase 1)
```js
// Carried on any stack (ingredient or plate) moved into a freezer. Absence
// of `frozen` means normal storage — the common case.
stack.meta.frozen = {
  frozenAtAbs: 1482300000,   // continuous-clock anchor; the freshness clock
                              // does not advance past this value while frozen (D17)
  thawStartAbs: null,        // set the instant the stack leaves a freezer
                              // container; null while still frozen-and-stored
}
// Fully thawed once (now - thawStartAbs) crosses THAW_TUNING.roomTempThawHours
// (D29) — at that point `frozen` is cleared and the normal spoilage clock
// resumes counting from `frozenAtAbs` (no time lost while frozen).
// Eating directly from `frozen` (skipping reheat) is legal but resolves
// through D28's mood-penalty/`frozenFood`-exemption check.
```

### Metabolism state (Phase 2)
```js
player.meta = {
  metabolicRate: 1.0,        // D2 — the ebbing multiplier on the hunger clock
  satietyUntilAbs: 0,        // D3 — fullness window end; 0 = derive from history
  kcalToday: 0,              // D4 — intake, rolled at day rollover
  kcalBurnedToday: 0,        // D4 — expenditure accumulator
}
// player.hunger stays the derived 0-100 display; satietyFrom(hoursSinceLastMeal)
// becomes satietyFrom(remainingFullness, metabolicRate) — same readers, new inputs.
```
`ITEM_DEFS[].consumable += { kcal }` — USDA FoodData Central per-serving
values, generated in bulk (Phase 2 data pass).

### Dishes & cookware (Phase 4)
```js
DISH_DEFS = {
  pot:      { label: 'Pot',     unit: 3, sizeL: 5, capabilities: ['boil','simmer','steam'] },
  pan:      { label: 'Pan',     unit: 1, sizeL: 2, capabilities: ['fry','saute','sear'] },
  baking_tray: { label: 'Baking tray', unit: 1, capabilities: ['bake','roast'] },
  wok:      { label: 'Wok',     unit: 2, sizeL: 4, capabilities: ['stir_fry'] },
  plate:    { label: 'Plate',   unit: 1 },  cup: { ..., unit: 1 },  fork: { ..., unit: 1 }, ...
}
// per-container dirtiness (sink, table, stove counter, dishwasher):
obj.dishes = { pot: 1, pan: 1, plate: 3 }
obj.dishUnits = 7                     // derived: Σ count × unit
obj.dishwasher = { load: { plate: 3 }, cycleActiveUntilAbs: 0 }   // capacityUnits from tier
```

### Cooking engine (Phase 5) and equipment (Phase 6)
```js
// Ingredients declare what they can become; methods declare what transforms them.
INGREDIENT.stages = { raw: {...}, chopped: {...}, fried: {...}, boiled: {...}, ... }  // kcal/quality deltas
METHODS = {
  boil:    { cookware: 'pot',  needSizeL: 3, oil: false, water: true },
  fry:     { cookware: 'pan',  oil: true,   burner: 'med-high' },
  bake:    { cookware: 'baking_tray', oven: true, burner: null },
  ...
}
// Phase 5 owns the two lines above plus grade() at tier-1/manual defaults.
// Phase 6 adds EQUIPMENT_DEFS and wires it into grade()'s `equipment` term
// and autocookThreshold() — Phase 5 never needs this table to be verifiable.
EQUIPMENT_DEFS = {                // tier-gated via FACILITY_DEFS/RenoFix (Phase 6)
  stove:      { tier, burners, tempPrecision, burnRiskMult },
  oven:       { tier, tempPrecision },
  mixer:      { tier, processTimeMult, unlocks: ['knead','whip','blend'] },
  dishwasher: { tier, capacityUnits, cycleMinutes },
  microwave:  { tier, reheatMinutes },
  freezer:    { tier, preservation },
}
grade(stepQuality, ingredientFreshness, equipment, skill, timing) -> 'F'..'S+'   // Phase 5
autocookThreshold(recipe, equipment) -> grade        // equipment lowers it (D14) — Phase 6
```

### Website & planner (Phase 8)
```js
world.computer.apps.recipes = { unlockedIds: [], planner: [{ recipeId, day }] }
RECIPE_CARDS[recipeId] = { label, steps, ingredients, kcalPerServing, grade, chefNotes }
// "Add All Ingredients to Cart" → appends to the Nile cart (computer.js cartPath
// already supports reuse), which then flows through checkoutCart → world.deliveries.
```

---

## Implementation phases

### Phase 1 — Storage, pickup, the freezer, and thawing
**Goal:** Groceries stop being a sorting chore and food stops rotting
pointlessly. The doormat handover gains "Pick Up" vs "Auto Transfer To
Storage"; the freezer exists and halts spoilage indefinitely; a frozen stack
thaws on its own once it leaves refrigeration; the whole `ROT`/preservation
ladder is rebalanced gentler AND consolidated into one owning table (D17,
D18, D19, D29).
**Files:**
- `src/srcfiles/defs.world.js`: new `freezer` OBJECT_DEF (container, `preservation` per D17, `FACILITY_STARTING_TIERS` fridge/freezer tiers); every perishable def gets an explicit storage-class hint (fridge/freezer/pantry/dry) that drives D19 sorting; `STARTER_GROCERIES` gains freezer staples.
- `src/srcfiles/config.js`: re-derive `ROT` and preservation from first principles (D18) — grace, stage percentages, and multipliers all get gentler, AND move the fridge/pantry/doormat/floor multipliers that currently live scattered on each container's own OBJECT_DEFS entry into `ROT` itself, one table, containers reference it by storage class (closes the Design-invariant-5 gap the Evidence table flags); add `FROZEN_PRESERVATION` and `THAW_TUNING.roomTempThawHours` (D29).
- `src/srcfiles/items.js`: `storageClassOf(def)`; `sortIntoStorage(gameState, stacks)` — the D19 auto-sorter (pure, deterministic); `freezeStack`/`thawProgress` — the D29 pair: freezing stamps `meta.frozen.frozenAtAbs` and halts the freshness anchor, leaving a non-freezer container stamps `thawStartAbs`, and `thawProgress` (pure, reads current time vs `THAW_TUNING`) reports frozen/thawing/thawed so any reader (render, eat, cook) can check it lazily — the same anchor-based pattern `processSpoilageForDay` already uses, not a new per-tick loop.
- `src/srcfiles/ui.js`: doormat pickup flow — per-item take (existing) vs one-click auto-transfer that runs `sortIntoStorage` across the whole delivery; narration for where things went.
- `src/srcfiles/world.js`: `spawnObjectsForNewGame`/lazy-spawn path gains the freezer; `processSpoilageForDay` (sim.js) frozen-stack handling (frozen stacks don't age at all while `meta.frozen` is set; once `thawProgress` reports thawed, the freshness anchor resumes from `frozenAtAbs` with zero elapsed time charged for the frozen span).
- `src/srcfiles/render.js`: pickup UI (doormat inspect), storage-class tag on grocery stacks, a frozen/thawing badge on affected stacks.
**Verification:** place a Nile order of mixed classes → auto-transfer lands milk/eggs in the fridge, pasta/rice in the pantry, frozen veg in the freezer, with correct quantities and cohort timestamps; a frozen stack survives N days at 0 spoilage while its fridge twin advances; a frozen stack moved to the bag/pantry and left `THAW_TUNING.roomTempThawHours` reports thawed and its freshness clock resumes exactly where it was frozen (not from the frozen span's real-world duration); no stale rot-cleanup breaks any container. Live: `browser_eval` a seeded delivery + auto-transfer, then check container contents and `gameDaysNow` anchors.

### Phase 2 — The calorie layer and metabolism
**Goal:** Kcal exists on everything and the hunger rhythm becomes a living
metabolic rate. Players feel meal *size* and activity (D1–D4).
**Files:**
- `src/srcfiles/defs.world.js`: `consumable.kcal` on every food/drink/ingredient/dish (USDA-derived, bulk-generated — see Verification), storage-class per def.
- `src/srcfiles/effects.js`: `ADJUST_NEED hunger` rework — positive deltas set the fullness window from kcal (D3), feed the daily ledger (D4), keep `mealsToday` semantics; `EAT_ITEM` kcal path.
- `src/srcfiles/sim.js`: `satietyFrom` → fullness-window + metabolic-rate derivation; `decayPlayerNeeds` accumulates `kcalBurnedToday` from activity (exercise/gig/physical actions meter), applies sleep ×0.5 and activity multipliers; day rollover resets the ledger.
- `src/srcfiles/config.js`: `METABOLISM` tuning block (base rate, per-kcal fullness curve, deficit/surplus effects, activity multipliers), `MEALSWellFed`/skipped-meals reconciled to real-meal events.
- `src/srcfiles/items.js`/`inventory.js`: serving → kcal helpers for pickers.
- `src/srcfiles/render.js`: hunger bar/status text shows fullness ("Satisfied — dinner's still holding") and the energy bridge hint.
**Verification:** a 300-kcal snack vs a 900-kcal dinner at the same clock time → different fullness windows; an active day (gym + gig shift) burns visibly faster than a couch day; sleep overnight halves the burn (audit B3 behavior preserved); ledger rolls at day rollover. Data pass: generate kcal for every def from USDA values via an offline `execute_js` job into a scratch JSON, spot-check 15 defs by hand, then merge into `defs.world.js`.

### Phase 3 — Meals as instances, the Servings bar, leftovers, reheating, cook-from-storage
**Goal:** Cooking stops spawning fixed defs. Every cooked result is a plate
instance with real derived values and a Servings bar; yields are batches;
leftovers persist, reheat, and can be eaten frozen (at a cost); recipes draw
from anywhere in the kitchen (D5, D6, D7, D20, D25, D26, D27, D28).
**Files:**
- `src/srcfiles/defs.world.js`: `RECIPES` become templates (ingredient lists + steps + yield rules) that produce plate instances, almost always `servings.total > 1` per D25; `RECIPE`/dish defs gain `betterHot` (D27) and `frozenFood` (D28) flags where relevant (ice cream and the like ship `frozenFood: true`); `RECIPE` → `RECIPE_CARDS` split deferred to Phase 8, but the shape allows it; restaurant dish defs gain kcal.
- `src/srcfiles/items.js`: `makePlate(gameState, recipe, ingredients, method, cookware)` — the pure sum-of-parts builder (Σ stage kcal + meal bonus per complexity, D5); `plateServingsLeft` — the D25 Servings-bar reader, `left/total`, same fraction math regardless of `total`.
- `src/srcfiles/effects.js`: `SPAWN_ITEM`/`DESTROY_ITEM`/`MOVE_ITEM` handle plate stacks (servings consumed atomically off `servings.left`, leftovers keep `meta.plate`); new `REHEAT_ITEM` (microwave absent until Phase 6 — reheat via oven/cookware in the interim, or a simple stove action) — sets `wasReheated: true` and, on a frozen stack, also resolves D29's thaw (reheating from frozen skips waiting out `THAW_TUNING`); `EAT_ITEM`'s mood term reads `wasReheated`/`meta.frozen` against the def's `betterHot`/`frozenFood` flags (D27's forfeited bonus, D28's frozen-eaten-cold penalty and its exemption).
- `src/srcfiles/defs.actions.js`: `prepareCook`/`buildCookEffects` rewritten onto the builder — pick recipe (or freeform), draw ingredients from bag+fridge+freezer+pantry (D20), produce batch into kitchen, auto-eat one serving (today's contract), leave mess; `self.eat` shows per-serving kcal/quality and the Servings bar, and warns before eating something frozen/unreheated that it'll cost mood.
- `src/srcfiles/sim.js`: `processSpoilageForDay` — cooked plates rot on the normal ladder; frozen ones don't (Phase 1's `meta.frozen` handling covers plates the same as ingredients).
- `src/srcfiles/render.js`: plate labels/quality/grade in inventory + pickers; the Servings bar (D25, `left/total` fraction, visually identical whether `total` is 2 or 8); a "needs reheating" / "frozen" indicator wherever `betterHot`/`frozenFood` matters.
**Verification:** cook pasta from pantry-only ingredients with the player bag empty (D20); verify plate kcal = Σ ingredients + bonus (fats/seasonings land in Phase 5 with the cooking engine — the Phase 3 kcal delta is ingredients-only until then); a 4-serving stew eaten 2 → 2 servings left, bar at 50%, → next day still edible → day 5 stale → day 9 rotten; an 8-serving batch at 7/8 left shows the same 87.5%-full bar shape as a 2-serving portion at 1.75/2; reheat restores quality to a stale portion AND sets `wasReheated`; eating a `betterHot` plate cold forfeits its whole mood bonus; eating an ordinary plate straight from the freezer costs mood, eating a `frozenFood` (ice cream) plate frozen does not.

### Phase 4 — Dishes, cookware, and the dishwasher
**Goal:** Real dish objects with sizes and capabilities; cooking/eating dirt
the right things; washing is a capacity model (D9, D10, D11).
**Files:**
- `src/srcfiles/config.js`: `DISH_DEFS` (types, units, sizes, capabilities), dish-producing rules (what cooking steps and what meals produce which dish units), `DISHWASH_TUNING` (hand-wash units/action by skill, dishwasher capacity/cycle by tier).
- `src/srcfiles/defs.world.js`: dish-aware dirtiness — sink/table/stove/counter hold `obj.dishes` maps; dishwasher object with `load`/`cycleActiveUntilAbs`.
- `src/srcfiles/effects.js`: `SET_DISHES`/`ADD_DISHES` effects (replace the `leaves: dishes:1` lines in recipes and the eat drive); `CLEAN_DISHES` effect (hand-wash + dishwasher cycle resolution).
- `src/srcfiles/defs.actions.js`: `self.dishes` reworked onto unit math + a dishwasher-fill action; `self.eat`/`set_meal` add plate/cup/fork units to the room; `self.cook` adds the cookware's units.
- `src/srcfiles/drives.js`/`cognition.js`: eat-drive `leaves` converted to dish maps; NPC washing drive can run the dishwasher.
- `src/srcfiles/render.js`: dish counts render on kitchen objects; "dishwasher: full/cycling" status.
**Verification:** cook pasta → pot + pan units in the sink; eat dinner as a household → 3 plates + cups on the table; hand-wash clears up to skill-scaled units, dishwasher clears capacityUnits and is busy for cycleMinutes; a full sink blocks further cooking (new requirement checker `hasFreeSinkCapacity`? — only if the phase decides the sink is a hard gate; otherwise it's a cleanliness/smell pressure only. Decision during Phase 4).

### Phase 5 — The cooking engine and grades
**Goal:** The interactive manual loop exists on its own — cookware choice,
processing, mixing, methods, fats/seasonings, recoverable failure, and
grades — verifiable with equipment held at tier 1 throughout (D8, D14–D16).
Split from the original single "engine + equipment" phase (session 2): this
half is reviewable without any tier math in play.
**Files:**
- `src/srcfiles/config.js`: `STAGE_DEFS`/`METHODS`/`INGREDIENT.stages`, fat/seasoning reagents, `GRADES` (F–S+ thresholds and what step-quality/freshness/skill/timing inputs produce them).
- `src/srcfiles/cooking.js` (new): the pure engine — `planCook`, `resolveCookStep` (deterministic per (state, seed)), `computeGrade`, `buildPlate` (Phase 3's builder consumed here for freeform too), failure outcomes (burnt/raw/bland/overseasoned/mushy + rescue paths). Equipment-aware knobs (burn risk, throughput, `autocookThreshold`) are stubbed to tier-1/manual-only defaults here — Phase 6 wires real equipment in without touching this file's shape.
- `src/srcfiles/defs.actions.js`: `self.cook` becomes the interactive entry (cookware → steps → method → serve).
- `src/srcfiles/skills.js`: cooking skill feeds step quality (existing `cookQuality` curve).
- `src/srcfiles/items.js`/`effects.js`: stage transforms as `TRANSFORM_ITEM`/`COOK_STEP` effects; fats consumed via normal `CONSUME_ITEM` with tiny qty.
- `src/srcfiles/render.js`: the cook screen — step list, timers, quality bars, grade reveal.
**Verification:** underseasoned chicken + oil pan → "bland" outcome, add salt → rescue to "good"; burnt batch is still *edible* (lower kcal/quality + mood sting), not deleted; identical (state, seed) inputs always produce the identical grade (determinism, since equipment isn't a variable yet); mixing verbs (knead/whip/blend) are reachable and gated by cookware capability (D10) alone, tier-1 mixer.

### Phase 6 — Equipment tiers and auto-cook
**Goal:** Equipment genuinely changes the feel of Phase 5's engine, and a
grade cleared once unlocks instant-cook forever (D12, D13, D14, D15).
**Files:**
- `src/srcfiles/config.js`: `EQUIPMENT_DEFS` + FACILITY_DEFS tier rows (stove burners/tempPrecision, oven, mixer, dishwasher, microwave, freezer).
- `src/srcfiles/cooking.js`: `autocookThreshold(recipe, equipment) -> grade` (equipment lowers it, D14); `resolveCookStep` reads equipment tier for burn-risk/throughput modulation (extends Phase 5's engine, doesn't fork it).
- `src/srcfiles/defs.actions.js`: `self.cook` gains the auto-cook path for any recipe cleared to its threshold (consumes ingredients, rolls quality, produces a plate — no interactive loop); `self.microwave` becomes the proper fast reheat, upgrading Phase 3's interim oven/stove `REHEAT_ITEM`.
- `src/srcfiles/render.js`: equipment tier displays (burner count, mixer unlocks, dishwasher capacity), the auto-cook affordance once a recipe qualifies.
**Verification:** the same recipe with identical inputs on tier-1 vs tier-3 stove → better grade distribution and lower burn rate; mixing without a mixer fails knead/blend, with one succeeds; a recipe cooked to A− once → auto-cook unlocked, consumes ingredients and yields a plate with a quality roll ≥ the threshold's floor; a better stove lowers the auto-cook threshold for a recipe already at B (D14's worked example); microwave reheat is faster than the Phase 3 stove fallback and still sets `wasReheated`.

### Phase 7 — NPC food culture
**Goal:** Roommates and guests actually participate: tastes, auto-cooked
meals, calorie-based eating, set_meal that rewards knowing them (D23, D24).
**Files:**
- `src/srcfiles/npc.js`/`defs.menu.js` (or wherever NPC bible/personality fields live): taste preferences (`taste.likes`/`taste.dislikes` by ingredient tag/def) seeded from personality/traits with deterministic variation.
- `src/srcfiles/drives.js`/`cognition.js`: eat drive consumes plate instances by calories→hunger; NPC auto-cook path (grade rolled, dishes + mess generated, storage drawn) when the kitchen has ingredients and they want a meal they like; cooldown/window math survives on the continuous-clock base.
- `src/srcfiles/defs.actions.js`: `set_meal` — attendee deltas scale by taste match (loves it / tolerates it / hates it → relationship and mood multipliers), spread builder feeds real servings.
- `src/srcfiles/commitments.js`: meal commitments unchanged structurally; attendee feedback uses the new deltas.
**Verification:** a roommate with `likes: ['eggs','cheese']` fed an omelette gains more than one fed leftover stir-fry; an NPC auto-cooks pasta from pantry when hungry and hungry-NPC == 0 in the fridge; the eat drive never double-eats a plate's last serving.

### Phase 8 — The recipe website and meal planner
**Goal:** Discovery + planning as one loop: taste a dish → unlock its card →
plan it → add all ingredients to cart → auto-sorted on arrival (D21, D22).
**Files:**
- `src/srcfiles/defs.computer.js`: `recipes` app definition (search, browse, detail, planner); site name/branding.
- `src/srcfiles/computer.js`: app logic — `recipeCardsFromEngine` (published from `cooking.js`), unlock-on-taste hook (eat/plate creation registers the card), `addRecipeIngredientsToCart` (appends to the Nile cart), `planner` reads/writes, `shoppingListForPlanner`.
- `src/srcfiles/render.computer.js` (+ phone): the website UI, cart banner, planner rows.
- `src/srcfiles/ui.computer.js`: handlers; the "Add All Ingredients to Cart" button flow.
**Verification:** eat a restaurant dish → its card unlocks; plan Monday–Friday dinners → shopping list dedupes shared ingredients → one click fills the Nile cart with exactly the missing quantities (diffs against fridge/pantry contents) → checkout → Phase 1 auto-transfer on arrival.

### Phase 9 — Balance, migration, and the long tail
**Goal:** The whole system reads coherently: no system is left on old math,
saves migrate cleanly, and the tuning is defensible (D18's rebalance lands
permanently; all `mealsToday`/`mealsWellFed`/hunger readers are consistent).
**Files:**
- `src/srcfiles/state.js`: player/world/objects migrations — kcal derivation for pre-kcal items, plate-metadata backfill, freezer bucket addition.
- `src/srcfiles/config.js`: global constant pass (`METABOLISM`, `ROT`, `FOOD_TUNING`, restaurant kcal sanity vs price).
- `src/srcfiles/ui.js`/`render.js`: polish — starving messaging references real fullness; picker labels show kcal; doormat auto-transfer toggle (default on for food).
**Verification:** load a save created before Phase 2 (mocked kv) → items resolve kcal, cooked stacks get plate backfill, no assertion trips; a full week of simulated living (browser_eval fast-forward) keeps hunger in sensible bands with a mix of cooking, delivery, and set_meal, INCLUDING a batch frozen mid-week and reheated later; no `ReferenceError`/`perchanceErrors` on the fresh-load pass.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | Freezer + thawing + gentler, consolidated spoilage + auto-sorted grocery pickup |
| 2 | **Done** | Kcal on everything; metabolism replaces the flat hunger clock |
| 3 | **Done** | Plates as instances with a Servings bar; leftovers, reheating, betterHot/frozen mood rules, cook-from-storage |
| 4 | **Done** | Real dishes, cookware sizes/capabilities, capacity-modeled washing (D33: sink is pressure-only, no hard block) |
| 5 | **Done** | Interactive cooking engine, fats/seasonings, recoverable failure, grades (tier-1 equipment); cook screen + rescues |
| 6 | **Done** | Equipment tiers modulate the engine; grade-gated auto-cook unlock |
| 7 | **Done** | NPC tastes, auto-cook, calorie eating, set_meal deltas |
| 8 | **Done** | Recipe website (ChefBook), unlock-on-taste, Add All Ingredients to Cart, meal planner (D21/D22, D40) |
| 9 | **Done** | Balance/tuning audit (no changes needed), migration-chain verification (D41 — no new migration code needed), harness tooling debt cleared (0 DID NOT REPORT) |

## Dependency order

```
Phase 1 (storage/freezer/thaw) ──► Phase 3 (plates use storage-class + frozen hints)
Phase 2 (metabolism/kcal) ──► Phase 3 (plate kcal math)
        └─► Phase 4 (dishes; food values unchanged)
Phase 3 (plate instances, servings, reheat) ──► Phase 5 (engine builds plates)
        └─► Phase 7 (NPCs eat plates)
        └─► Phase 8 (website publishes plates)
Phase 4 (dishes/cookware) ──► Phase 5 (cookware capability IS the engine's method gate)
Phase 5 (engine + grades) ──► Phase 6 (equipment modulates the engine; needs real grades to lower a threshold against)
        └─► Phase 7 (NPC auto-cook needs real grades — Phase 6's equipment-lowered thresholds refine but don't block it)
        └─► Phase 8 (cards published from the engine)
Phase 6 (equipment + auto-cook) ──► Phase 7 (an NPC's auto-cook threshold should already reflect kitchen equipment)
Phase 9 (migration) ──► anything that shipped before it
```

Phase 4's dish model is usable as soon as Phase 2 is in (dish units don't
need kcal), but Phase 5's cookware-gated methods do. Phase 5 is independently
verifiable at tier-1 equipment throughout — Phase 6 is a pure extension, not
a rework, so a session can stop after Phase 5 and Phase 6 remains a clean
next step. Phase 7 can slot in right after Phase 3 if NPC hunger eating
plates matters more than NPC auto-cooking; the auto-cook half genuinely wants
Phase 6 first. Phase 9 is last by definition. Phase 1 and Phase 2 are
independent of each other — either can run first; the plan orders 1 before 2
only because the pickup/freezer is the cheapest visible win.

## Open questions (parked, none blocking)

- **Hydration.** **DECIDED during Phase 2 — parked (D31).** Drinks stay
  calorie-only for v1; no second metabolic track.
- **Weight / body trend.** The long-arc version of the energy balance (weight
  drift over weeks, affecting energy max and comfort). Out of scope for v1
  (D4); **re-parked at Phase 9 (explicitly, not skipped)** — the Phase 9 live
  week-long sim found the D4 ledger's deficit/surplus mood term already
  reading sensibly with no obvious gap wanting a weight consequence on top.
  Revisit only if a future playtest specifically wants it.
- **Food poisoning.** **RE-PARKED during Phase 5, and again at Phase 9
  (explicitly, not skipped).** D15's raw already carries the finish-cooking
  rescue, a 0.70 quality dent and the "The middle is still undercooked" flaw;
  Phase 9's actual audit found no live gap this would close (spoiled food
  already costs mood + energy via `ROT.spoiledMoodPenalty`/
  `spoiledEnergyPenalty`), so a day-long poisoning track stays a genuine
  future feature, not a Phase 9 balance finding.
- **Meal-timing bonuses.** Eating in a proper window (breakfast/lunch/dinner)
  vs 3am snacks. **DECIDED during Phase 9 — not built, re-parked.** The
  Phase 9 audit turned up no other balance gap needing a new mood term, and
  the live week-long sim showed the existing fullness/deficit/well-fed terms
  already producing sensible mood pressure without one; adding a brand-new
  mood term on the plan's last phase, with no dedicated design pass, would
  be unreviewed scope growth rather than the "long tail" cleanup Phase 9 was
  scoped for. Cheap to add later if a future playtest wants it.
- **Does a full sink hard-block cooking, or only apply smell/cleanliness
  pressure?** **DECIDED during Phase 4 — pressure-only (D33).** No hard
  gate; the dish model is in and the answer is "never block, escalate
  signal + cleanliness pressure."
- **Freezer: new object or fridge tier?** **DECIDED — separate object (D30).**
  Matches the pantry precedent and gives the kitchen layout a second
  container; a tier-upgrade fridge remains a Phase 6 option for *replacing*
  the separate unit if the layout ever argues for it, but the storageClass
  table already handles either (`ROT.preservation.freezer`).

## Design invariants

1. **A cooked plate is a snapshot.** All plate data lives on `meta.plate`;
   recipe/template changes never retroactively rewrite food already in the
   fridge. The scar: the 2026-08-17 B2 audit — fixed defs made "restores 50
   hunger" a lie for the item actually in your bag; instances exist so what
   you hold is always what you got.
2. **Kcal is the only metabolic writer.** The hunger display is derived from
   the metabolic clock; no new system may write `player.hunger` directly
   except the existing `satietyFrom`-style recompute. (Mirrors the game's
   mood invariant — one derived bar, one writer.)
3. **NPCs stay a single number.** NPC hunger is 0–100; calories convert at
   consume time. NPCs never see the ledger, and the eat drive never touches
   `player.meta`. The scar: the eat-drive's fixed-def raid had to be
   rewritten once already for inventory overhaul; don't re-couple it.
4. **The cooking engine decides, the LLM narrates.** Step outcomes, grades,
   and plate values are pure functions of (state, seed) — same inputs, same
   plate. The narrator (ai-text-plugin) may flavor, never resolve. Same
   rule the ask system's `$AskId` spine lives by.
5. **Never enumerate persisted keys in two places.** Dish maps, storage
   classes, and plate fields each get ONE owning definition; consumers read
   it. The scar: `castWeb` silently never persisted for months because its
   write was missing from one of two hand-maintained lists.
