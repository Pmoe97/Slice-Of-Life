# Inventory, Needs, Main Menu & Save System Overhaul

Status: **complete — all ten phases done and verified.** Design session
complete 2026-08-09; all thirteen decisions locked. No open questions
blocking any phase.
Last updated 2026-08-09.

Companions: `ref/perchance-menu-conventions.md` (**landed 2026-08-09** — the
source-level read of `lusthaven` / `stellar-lust` / `hedonism-island`; Phase 10
implements against it, and section 5 of it is explicitly **not** a reference
for Phase 9 — see that phase's note),
`ref/external-world-npcs-overhaul-plan.md` (built — the maid,
DoorDrop, and `world.visits[]`; this plan makes its ~200 delivered dishes
edible and gives its maid a new mess to clean),
`ref/afterhours-redesign-plan.md` (built — the source of the `+0.25` mood
spike this plan re-bases onto a decaying impulse),
`ref/economy-and-rent-plan.md` (the cost stack roommates eating your
groceries adds to), `ref/apartment-expansion-plan.md` (the facility tiers
that currently gate every large mood source).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`ref/inventory-needs-menu-saves-handoff-prompt.md` for the full session
protocol.

---

## Handoff — read this first

**Resume at:** **Live verification of the 2026-08-09 post-completion fixes**
(see the first "Last session's notes" block below) — they were written
outside a browser session. Drive the menu on the live page: boot cover, the
`fullscreenButton` render, slideshow pacing/wrapping, and the 100-image
pool's rehydration. All ten phases are otherwise complete; Phase 10 landed
and verified 2026-08-09. If a future session
touches the menu, the entry points are `menu.js` (the component),
`image.js` (`titleGallery` slideshow), `defs.menu.js` (rated trait lists +
`genTitlePrompt`) and the menu markup/CSS in `index.html`; the Phase-10
block below documents the deliberate deviations this session implemented.

**Last session's notes (post-completion audit + fixes, 2026-08-09):**
An independent audit of all ten phases against this document. Everything
mechanically checkable held: B1/B2 both genuinely fixed (and all 7 `addStack`
callers pass the new `day` arg), `SAVE_KEYS` is a single table read by all
three paths, ZERO direct `player.mood =` writes anywhere, only the clock loop
passes `{idle:true}`, freshness is derived, `restoreSave → loadGameState →
initStorage` really does run the migration chain over a restored snapshot, all
21 changed scripts had `?v=` bumps, `boot()` is invoked exactly once, and all
35 files pass `node --check`. Four things were then fixed:

1. **The LLM could conjure free meals.** `ADJUST_NEED` is `llm:true` and the
   scene-prompt's worked example was literally `"ADJUST_NEED player hunger
   +10"`. Phase 5 made this worse, not better: `applyAdjustNeed` treats ANY
   positive player-hunger delta as a whole meal (resets `hoursSinceLastMeal`,
   +1 `mealsToday`), so magnitude is discarded and `+1` fed you exactly as
   much as `+40` — design invariant 3 bypassed through the narration path.
   **Fix:** `hunger` removed from `validateNeedName`'s player list (NPC hunger
   kept — the drive fallback is a trusted producer), prompt example changed to
   an energy line, plus an explicit "never emit a hunger change for the
   player" rule in the contract.
2. **`initStorage` carried a second copy of `FOLDER_VERSIONS` and it had
   already drifted** (`npcs: 2` after the Phase 8 bump to 3). Benign only
   because the folder is empty there and `seedNpcInventory` is idempotent.
   **Fix:** `versions: { ...FOLDER_VERSIONS }`.
3. **Perchance shortcode leak (visible bug).** Both `[fullscreenButton(...)]`
   calls passed a CSS string containing `var(--…)`; the bracket parser breaks
   on the nested parens and spilled the tail as literal text on the page.
   **Fix:** literal values, no `var()`, no `--`. **Rule: never put `var(...)`
   — or any parentheses — inside a Perchance `[shortcode(...)]` argument.**
4. **Game shell flashed before the menu.** `#main-menu` is `hidden` until
   `menu.js` (the last script) runs `boot()`, so the play screen painted for
   the whole parse+load window. **Fix:** `data-app-hidden` on `#app` in the
   MARKUP (covered from first paint), CSS `visibility:hidden` — not
   `display:none`, so layout still resolves for anything that measures while
   covered. `closeMainMenu()` is the single uncover point; `showMainMenu`
   re-covers in the boot context only. All five entry paths into play route
   through `closeMainMenu`.

Also this session (requested changes, not audit findings):
- **Slideshow now generates forever** instead of stopping at 3. New
  `scheduleNextGeneration` pacer: `fastFillMs` (800ms) below `bufferTarget`,
  then `steadyGenMs` (15s) indefinitely while the menu is open; the ring
  prunes its own oldest beyond `maxPersistedImages`. `maxSessionImages` 12 →
  100 to match the ring, with `hydrateRemainingTitleImages` pulling the older
  remainder out of the LRU in background batches so opening the menu still
  paints fast. The cycle now WRAPS (there's a real back catalogue) instead of
  driving generation. `stopTitleAutoCycle` kills all three timers;
  `stopTitleCycleOnly` is what manual prev/next uses, so clicking through the
  catalogue doesn't silently end generation for the session.
- **Cross-gender clothing.** `rollClothing` was blind to the wearer. Clothing
  entries gained a SOFT `lean: 'f'|'m'` (not a gate) weighted at
  `crossLeanWeight` 0.08, and masculine-leaning entries were added so
  down-weighting doesn't just funnel men into the few unisex items. Measured
  over 20k rolls: feminine items on male actors **~1-in-5 → 2.2%**, masculine
  items on men 25%. Non-binary actors treat everything as unisex.
  **Landmine avoided:** the weighted picker is `menuWeightedPick`, NOT
  `weightedPick` — SIM already defines a global `weightedPick(rng, items, fn)`
  and loads AFTER defs.menu.js, so a same-named declaration is silently
  replaced and called with the wrong arguments.
- **Framing: whole image, never cropped or stretched.** `.title-bg-img` is
  `object-fit: contain` (was `cover`), so the entire generated frame is always
  visible and the leftover space becomes a letterbox/pillarbox bar showing the
  `.title-bg-layer` gradient — the menu's designed no-image state, so the bars
  read as framing rather than as missing content. More importantly the
  `cropCanvasToViewport` step was **deleted**: it centre-cropped the canvas to
  the viewport aspect *before* the blob was cached, baking the crop in
  permanently, so those pixels could never be recovered by a resize or on
  another device. `menuViewportAspect` and `MENU_SLIDESHOW.maxCropAspect` went
  with it. **Rule: never trim an image on the way INTO the cache — fit at
  display time, in CSS.** Orientation-matched generation resolutions stay, now
  purely to keep the bars small.
  - Note for whoever verifies: images already in the ring from before this
    change are still stored pre-cropped. They'll display contained at their
    baked aspect and age out naturally as the forever-generator churns the
    100-image pool; no migration needed.
  - `#scene-img` (the in-game scene image) is still `object-fit: cover`
    inside a fixed 360px box. Left alone deliberately — this change was
    scoped to the menu — but it's the same trade-off if it ever comes up.
- **Hand anomalies.** `negativePrompt` now enumerates concrete hand/limb
  failures (count, fusion, length, extra arms) instead of relying on the
  catch-all `bad anatomy, mutated hands` pair.
- Re-verified after the changes: rating cap still holds (0 real leaks in 3000
  sfw-capped draws — an apparent 1.5% was the audit regex matching "blowing
  bubbles in a mug of cocoa"), all touched files pass `node --check`, `?v=`
  bumped for config 52, defs.menu 8, state 27, effects 15, llm 13, image 11,
  menu 6.

**NOT verified live** — these changes were made outside a browser session.
The next session should drive the menu on the live page before trusting the
slideshow pacing, the boot cover, and the fullscreenButton fix.

**Last session's notes (Phase 10, D11 — DONE, verified):**
- **Boot flow:** `boot()` (ui.js) no longer auto-loads a save — it always
  presents the menu. `showMenuModal` is retired. The `boot()` INVOCATION
  moved from the bottom of ui.js to the bottom of `menu.js` (the last
  script to load), because boot() now calls MENU/IMAGE functions defined
  after ui.js. If the game ever boots straight into play again, check that
  menu.js still calls boot() at its bottom.
- **menu.js (new):** the component, two contexts — `showMainMenu('boot')`
  (startup) and `showMainMenu('pause')` (header Menu button). Pause context
  genuinely pauses the game: `pauseClockLoop()` on open; `resumeClockLoop()`
  ONLY in `doMenuResume()`/Escape. `closeMainMenu()` deliberately does NOT
  touch the clock (resuming there would skip startClockLoop's
  lastRolledOverDay adoption and risks a double start). Game-start/load
  paths call closeMainMenu themselves: resumeFromRecord, startSoloGame,
  approveCastAndStartGame, continueGame.
- **Continue** (`refreshMenuContinue`/`doMenuContinue`): enabled from
  `kv.saveIndex` when a save exists, pointing at the most recent save in
  the most recent run (`latestContinueEntry` — run-head grouping, not just
  index[0], so an imported older-run save can't shadow the active run). It
  loads the RECORD via `resumeFromRecord`, never the live folders. Verified
  disabled with an empty index, enabled + loads the right record with one.
- **Exit Game** (`doExitGame`): pause context = best-effort
  `saveToSlot(gs,'exit')` + drop the game + back to the boot menu; boot
  context = `window.close()` attempt + a 4s "you can close this tab" note
  (`#menu-exit-note`).
- **Options screen** (`#menu-options-screen`, toggled from the title
  screen): Background art (slideshow on/off — off is the pure gradient) and
  Autosave (on/off). Both persist in `kv.menu` 'options'
  (`MENU_GALLERY_OPTIONS_KEY`) — browser-local like the image LRU, NOT in
  SAVE_KEYS, deliberately not part of save records. `startAutosave`
  (state.js) now consults `isAutosaveEnabled()` (menu.js, runtime
  forward-reference). The Debug Panel entry lives on the Options screen now
  (`menu.debug` → toggleDebugPanel). Verified both options persist across a
  reload.
- **Slideshow** (image.js, `titleGallery`): reference §3.4–3.8 two-layer
  crossfade (set the hidden layer's src + `await decode()` BEFORE the class
  flip), 8s cycle, lazy 3-image buffer, exactly-one-in-flight via
  `generating`, manual prev/next stop+restart the timer. Caching per
  deviation 4: images live in the shared LRU under `menu_<rating>_<ts>_<r>`
  keys; a bounded ring (`MENU_SLIDESHOW.maxPersistedImages` = 12) persists
  in `kv.menu` 'ring'; evicted ring keys are hard-deleted via new
  `deleteCachedImage` (state.js). Failure per deviation 3: exponential
  backoff (2s·2^n) up to `retryMax` (4), then a quiet "Background art
  unavailable" line (`#menuUnavailable`) and the gradient — no uncapped
  retry loop, no blank frame.
- **Content gating (deviation 2):** every `MENU_ART` trait entry carries an
  `r` rating (sfw/suggestive/explicit); `genTitlePrompt(contentConfig)`
  filters every pool by `menuRatingCap` (mature:false → sfw; romance:false
  → suggestive; default → explicit). The cache KEY encodes the rating, and
  both the persisted ring and the in-memory session buffer are re-filtered
  to the current cap on every menu open, so a restricted save never shows
  looser art. Verified: 100 draws under the sfw cap never contain a mature
  word; the full-range mix demonstrably reaches explicit prompts.
- **Discord:** column button + fixed bottom-right badge, both
  `https://discord.com/invite/E6N9WKpGPA`, `target="_blank"`
  `rel="noopener noreferrer"`. Badge = inline SVG data URI, gold #d9b871
  FA-discord glyph on a dark tile (reference §4 recoloured). Verified the
  glyph renders (canvas pixel check + vision).
- **Menu markup/CSS live in the primary HTML document.** Naming note, since
  this has already confused one review: Perchance's editor calls that living
  text field **`index.html`**, and the same field is checked into this repo as
  **`main.html`**. One file, two names — `main.html` is the one on disk to
  edit; there is no separate `index.html`. (The other Perchance field is
  `main.pjs`, checked in as `perchance.pjs`.)
  `#main-menu` sits at z-index 190 (above phone 170, below modal/save/
  loading 200). Google Fonts added: Cinzel + Cormorant Garamond. `?v=`
  bumps this session: config 49, state 26, image 9, render 27, ui 46,
  menu 2, defs.menu 1. Load-order comment updated (DEFS.MENU after
  DEFS.COMPUTER; …→ UI.PHONE → MENU → BOOT).
- **Verification summary (browser_eval on the live page):** boots to menu,
  not play; Continue no-save/save states; slideshow paints gradient → first
  image → crossfades on the 8s cycle through distinct slides
  (vision-verified); manual nav stops/restarts the timer; forced
  generateImage failures retry with visible backoff then settle on the
  gradient; ring capped at 12 with oldest evicted; sfw/suggestive/full
  mixes; Discord button + badge; pause menu is the same component with
  Resume, clock paused while open and restarted on Resume/Escape; Exit
  writes an exit record and returns to the boot menu; Continue after exit
  loads it; Options (bg-art off = pure gradient, on = cold-start reload
  from ring; autosave toggle flips isAutosaveEnabled) persist across a
  reload; loading overlay paints above the menu; save index consistent (no
  dupes; 1 exit + 5 autos + 2 manual after testing); zero
  syntaxErrors/perchanceErrors on fresh loads. The test session left an
  'exit' record of the user's real state in the exit slot and the live
  folders restored from their newest save — harmless, keep or delete from
  the grid.

**Blockers / flagged deviations:**
1. **All-SFW mode has no in-UI path yet.** The slideshow honors
   `contentFlags.mature:false` (sfw-only), but the char-creation form's
   content-prefs field only turns flags ON (they default on), so no
   player-reachable configuration produces it today. Wiring a
   "mild"/"sfw" pref that turns mature/romance OFF would make it reachable
   — but that also changes LLM content directives for the whole save, so
   it's a product decision, not a Phase-10 coding gap. Filed as an open
   question.
2. **`hasSave()` (state.js) is now dead** (boot no longer checks it) — left
   in place, harmless.
3. **The `continue` action (continueGame) is kept for compat** and now also
   closes the menu; the menu's Continue is `menu.continue`.
4. Legacy note carried forward: single-quoted JS strings with apostrophes
   are a SyntaxError with a real line number — prefer double quotes.
4b. **Never put `var(...)`, or any parentheses, inside a Perchance
   `[shortcode(...)]` argument.** The bracket parser breaks on the nested
   parens and spills the remainder of the argument onto the page as literal
   text. Cost a visible render bug in both `[fullscreenButton(...)]` calls;
   use literal CSS values there, or a class plus a stylesheet rule.
4c. **Check for an existing global before naming a new top-level function.**
   These are plain scripts sharing one global scope, so a duplicate name is
   silently resolved in load order with no error — `menuWeightedPick` exists
   under that name because SIM's `weightedPick` would otherwise have
   swallowed it.
5. Harness note: browser_eval occasionally races a hard reload (the eval
   runs mid-script-load and reports "X is not defined" for a function in a
   later script) — harmless, re-run the eval.
---
---

## The thesis

The game's needs system currently teaches the wrong lesson. Hunger is a
treadmill you jog on for the whole session, and mood is a bar that only ever
falls — except for one action, in one app, which happens to be masturbating.
A player optimizing rationally ends up watching porn to stay functional, which
is not the game this is.

Underneath that, the game has hundreds of authored food items, a complete item
effects layer, and containers that already hold real stacks — and no way for
the player to touch any of it. You can order a pepperoni pizza. It arrives.
You cannot eat it.

This plan closes both gaps with one system. A real inventory makes the food
edible; making food edible makes spoilage meaningful; spoilage gives the
kitchen and the maid something to do; the same inventory gives NPCs
possessions, which makes gifts, theft, and roommates eating your groceries all
possible; and a rebalanced, derived mood turns every one of those small
domestic acts — a good meal, a clean apartment, dinner with someone who likes
you — into the happiness the player is currently getting from a browser tab.

Then it wraps the whole thing in the front door the game doesn't have: a real
main menu and a save system that can hold a playthrough.

### What this plan is *not*

- **Not a survival game.** Uncapped inventory, no weight, no hunger death
  spiral. The pressure is spoilage and money, never inventory Tetris.
- **Not a nerf of AfterHours.** The `+0.25` stays. It stops being *dominant*
  because everything else stops being broken, not because it gets worse.
- **Not a save-system rewrite.** The kv layer, per-folder versioning, and
  migration chain are good and stay. Phase 9 wraps them in slots.
- **Not a new economy.** It leans on the existing rent pressure rather than
  adding a parallel one. Groceries disappearing is pressure applied through
  the economy that already exists.
- **Not a crafting system.** Recipes stay what they are; the player just gets
  to choose one.

---

## Code audit — the numbers behind the complaint

Verified against the working tree 2026-08-09.

### The needs math

Tick = 30 minutes (`CLOCK.tickMinutes`, config.js:1426). 48 ticks/day, ~32
awake.

| Need | Decay/tick | Decay/waking day | Best restore | Verdict |
|---|---|---|---|---|
| energy | 2 | −64 | full night = +100 | fine |
| hygiene | 1 | −48 (all 48 ticks) | shower +60 | fine |
| hunger | 3 | **−96 awake, −48 more asleep** | eat +40 | **~3.5 meals/day to break even** |
| mood | 0.02 | **−0.64 on a −1…1 scale** | relax +0.16 | **badly underwater** |

Sources: `NEEDS` (config.js:1259), `decayPlayerNeeds` (sim.js:1259),
`ACTION_TUNING` (config.js:2468).

**Hunger** is a treadmill because sleep alone burns half the bar (16 ticks × 3
= 48) before the player takes a single action.

**Mood** is the sharper failure. The largest single mood source in the game is
AfterHours' `cumEffects: +0.25` (defs.computer.js:365), and it is the only
large one **not gated behind a renovation**: gym +0.12, pool +0.18, game room
+0.10, study +0.08 all need facilities an early player does not have. The
user's complaint that "aside from porn there is nothing to do to make yourself
happier" is arithmetically correct, not a perception problem.

### The second decay path

`runSimCheckpoint` (time.js:294) decays player needs as **real wall-clock
time** passes via the rAF clock loop, independent of any action. Sitting still
reading the narration log makes you hungry. D12 keeps this but scales it down.

### Eating: the pipeline exists, the verb does not

- `self.eat` (defs.actions.js:24) is a flat `ADJUST_NEED player hunger +40`
  available in the kitchen that **consumes nothing**.
- Every food item already carries `consumable: { hunger, mood, energy }`
  (defs.world.js:560+).
- `CONSUME_ITEM` is `implemented: true` with a full validator
  (effects.js:404), and `applyConsumeItem` already reads `def.consumable` and
  applies each need (effects.js:266).

Nothing ever calls it with a player-chosen item. The machine is built and
idling.

### Inventory: 80% a UI problem

- `player.inventory` is an array of `{ defId, qty, ownerId, meta }`.
- Containers hold the **identical shape** in `obj.contents`
  (defs.world.js:550, world.js:95).
- `locationStackListMutable` (effects.js:232) resolves `'player'` →
  `player.inventory` and an object id → `obj.contents` interchangeably, so
  `MOVE_ITEM` already does bag↔fridge transfer today.
- `renderInventory` (render.js:346) is a read-only `name ×qty` list with
  **zero interaction**.

### Two latent bugs this plan must fix

- **B1 — `applyConsumeItem` hardcodes the eater.** effects.js:274 calls
  `applyAdjustNeed({ who: 'player', ... })` regardless of who consumed. Phase 8
  cannot work until `CONSUME_ITEM` takes a `who` param. Additive with a
  `'player'` default — no migration.
- **B2 — `addStack` merges away freshness.** items.js:22 merges any two stacks
  sharing `defId` + `ownerId`. Once stacks carry a spoilage cohort in `meta`,
  merging milk bought today into milk bought last week corrupts the older
  stack's expiry. Phase 4 must make the merge key cohort-aware **first**.

Also: `pickAvailableRecipe` (items.js:91) returns the **first** recipe whose
ingredients happen to be present, so cooking is currently a slot machine.
Phase 2 replaces it with player choice.

---

## Locked decisions

Decided with the user 2026-08-09. Settled — do not relitigate mid-phase.

### Needs and mood

- **D1 — Full needs redesign, not a tuning pass.** Rhythm-based hunger,
  derived mood, and a rate pass on energy/hygiene.
- **D12 — Idle decay stays, but much slower.** Real time still passes; minutes
  spent idling decay at a fraction of the rate of minutes spent acting.
- **D13 — Happiness comes from everywhere.** Consumable comfort items, owned
  hobby objects, social time with roommates, free ambient actions, good sleep,
  and completed work gigs all feed mood. Anything that reads as a dopamine hit
  gives some.

### Items, containers and food

- **D2 — The fridge stops being an action menu and becomes an inventory.**
  Chest-like: browse, take, put, same stack shape as the player's bag.
- **D3 — Two ways to eat:** directly from your inventory anywhere, or **Set
  Meal** at the kitchen/dining table.
- **D4 — Player inventory is uncapped.** No weight, no slots. The pressure is
  spoilage.
- **D5 — Food in your bag spoils much faster than food in the fridge.**
  Per-item realistic shelf lives, scaled by a per-container preservation
  multiplier.
- **D6 — Rot creates mess on a timer.** Past its window an item goes Rotten;
  after a grace period it emits odor and drags room cleanliness down. Cleared
  by hand or by the maid.
- **D14 — Cooking destroys ingredients without restoring hunger.** A cooked
  meal restores exactly its own `consumable` values; the raw ingredients are
  transformed, not eaten (resolved in Phase 3: `buildCookEffects` emits
  `DESTROY_ITEM` for ingredients instead of `CONSUME_ITEM`). This kills the
  double-count where a cooked dish restored ingredient hunger AND its own.

### Social dining

- **D7 — Set Meal is an invitation system, not a random gathering.** You
  invite NPCs by IM or in person, agree a day and time, and they actually show
  up. If nobody comes it is a normal meal with a small "proper setting" bonus.
  Meals at the table leave a mess.

### NPC possessions

- **D8 — NPC inventories do all four jobs:** ground LLM prose, source two-way
  gifts, get really consumed by NPC needs (your groceries disappear), and be
  snoopable/stealable through the existing stealth system.
- **D15 — NPCs don't contribute groceries.** Shopping stays the player's
  burden (that's the rent-pressure invariant at work); hungry NPCs raid the
  fridge, the pantry, and their own bags, and only fall back to an abstract
  scrounge when every reachable source is genuinely empty (so nobody starves
  because the player forgot to shop). Resolved in Phase 8 (`tryEatFood`).

### Saves and menu

- **D9 — Saves are grouped by playthrough now, with tree-ready data.** Every
  save stores `runId` + `parentSaveId` + `saveIndex` from day one so the
  branching-tree view is a later pure-UI addition with zero migration.
- **D10 — VN-style slot grid** with rotating autosaves, manual slots, rich
  per-save metadata, and export/import.
- **D11 — Main menu is the boot screen:** Continue / New Game / Load Game /
  Options / Discord / Exit Game, left-aligned, over a live-generating image
  slideshow.

---

## Data model

### Stack `meta` contract (Phase 1)

The uniform stack shape stays `{ defId, qty, ownerId, meta }` everywhere —
player bag, container `.contents`, NPC inventory. Phase 1 extends only `meta`:

```
meta: {
  acquiredDay,   // game day the stack entered the world; set by addStack
  cohort,        // spoilage cohort key; null for non-perishables (Phase 4)
  keyItem,       // true = cannot be dropped, trashed, or given
  servingsLeft,  // partial meals (Phase 3); absent = whole
  origName,      // existing: preserved text for _unknown legacy items
  ...            // free-form, as today
}
```

### Container defs (Phase 2)

`OBJECT_DEFS` entries that hold items gain:

```
container: {
  capacity: null,      // null = uncapped (D4); field exists for future caps
  preservation: 4.0,   // shelf-life multiplier — see table
  label: 'Fridge'
}
```

| Location | `preservation` |
|---|---|
| fridge | 4.0 |
| pantry | 2.0 |
| player bag | 1.0 |
| floor / doormat | 0.5 |

### Freshness (Phase 4)

Derived, never stored as a countdown, so it stays correct across saves and
time skips. Effective shelf life = `def.perishable.days × container.preservation`.

| State | Fraction of shelf life elapsed |
|---|---|
| Fresh | < 0.5 |
| Use Soon | 0.5 – 0.85 |
| Spoiling | 0.85 – 1.0 |
| Rotten | > 1.0 |

Moving a stack between containers **recomputes remaining life against the new
multiplier** rather than resetting it — taking milk out of the fridge for an
hour must not cost it a week.

### Hunger, derived (Phase 5)

`player.hunger` survives as a **derived display value** so every existing
reader (`NEED_CONSEQUENCES`, LLM prompt context, header bars, NPC reactions)
keeps working with no migration. The real state is `hoursSinceLastMeal` /
`mealsToday`:

| Hours since last meal | State | Effect |
|---|---|---|
| < 4 | Satisfied | none |
| 4 – 8 | Peckish | none |
| 8 – 12 | Hungry | small mood penalty |
| 12 – 18 | Very hungry | larger mood penalty, work-output penalty |
| 18+ | Starving | existing `NEED_CONSEQUENCES.hunger` path |

### Mood, derived (Phase 5)

```
moodTarget = base
           + needsTerm     (hunger/energy/hygiene state)
           + socialTerm    (recent quality NPC interaction, affection)
           + comfortTerm   (room cleanliness, odor, facility tier)
           + stressTerm    (rent due, burnout, unpaid bills)
           + eventTerm     (decaying sum of recent mood impulses)

player.mood -> eased toward moodTarget over ~1 game day
```

`eventTerm` is where every existing `ADJUST_NEED player mood +X` line lands,
so the ~30 call sites across defs.actions.js, defs.computer.js and effects.js
keep working unchanged — they now push a **decaying impulse** instead of
permanently moving a bar. This is the single change that ends porn's
dominance: `+0.25` becomes a real but temporary spike that fades if the rest
of your life is a mess.

### `world.commitments[]` (Phase 7)

The resident-side sibling of `world.visits[]`. `world.visits` is already the
single source of truth for "who is onsite and why" (sim.js:392) but covers
**external** NPCs only; residents resolve through `resolveScheduleActivity`
(sim.js:701). So commitments are a new list, consulted as a schedule
**override**:

```
{ id, kind: 'meal', day, tickStart, tickEnd, roomId,
  invitedIds: [], acceptedIds: [], declinedIds: [], status }
```

Built generically, the same table later serves movie nights, chore
agreements, and anything else the household agrees to do together.

### `npc.inventory` (Phase 8)

Identical stack shape. Seeded at NPC creation from a lifestyle template
derived from the character bible — job, income tier, interests, quirks.
Everyone gets a phone, keys, and a wallet with cash scaled to their means;
beyond that a musician has an instrument, a student has textbooks, a nurse has
scrubs.

### The save record (Phase 9)

```
{
  saveId, runId, parentSaveId, saveIndex,
  kind: 'manual' | 'auto' | 'quick' | 'exit',
  createdAt,
  meta: {                     // everything the slot card renders
    day, minutes, phase, roomId, money,
    playerName, castNames[], thumbKey,
    headline,                 // last narration line
    playtimeMs, gameVersion, folderVersions
  },
  payload: { meta, player, world, npcs, objects }   // full folder snapshot
}
```

`runId` groups saves under a playthrough; `parentSaveId` + `saveIndex` record
lineage, so the branching-tree view is later a pure UI addition with zero
migration (D9).

**Why this absorbs future systems without rework:** `payload` is a
whole-folder snapshot produced by walking the same key list `saveAtBoundary`
(state.js:442) already walks. A new system that adds `world.somethingNew` is
captured automatically the moment it joins that list. The rule that makes it
hold: **never enumerate persisted keys in two places** — Phase 9 extracts them
into a single `SAVE_KEYS` table read by both the autosave path and the
snapshot path.

kv layout: `kv.saves` for records, `kv.saveIndex` for a lightweight list the
menu renders without deserializing any payload.

---

## Implementation phases

### Phase 1 — Inventory core

**Goal:** a real, interactive inventory panel over the existing stack data.
The player can browse, search, sort, read what an item does, and
use/drop/trash it, with the clock and needs responding correctly. Mutation
still routes exclusively through `applyEffects`.

**Files:**
- `src/srcfiles/items.js`: extend the header comment's stack contract with the
  `meta` fields above; `addStack` stamps `meta.acquiredDay` when not supplied.
  No behavior change to merging yet — that is Phase 4's B2 fix.
- `src/srcfiles/defs.world.js`: add the categories the later phases need to
  `ITEM_DEFS` — `comfort`, `hobby`, `key`, `gift`, `junk` — plus a `sortGroup`
  on every def so the panel groups without a hardcoded list in the renderer.
  Mark the existing key items (`phone`, keys, ID) with `keyItem: true`.
- `src/srcfiles/inventory.js` **(new)**: pure query/sort helpers, no DOM, no
  mutation — `groupStacks(stacks)`, `sortStacks(stacks, mode)` for
  name/category/qty/freshness, `filterStacks(stacks, query)` matching `label`
  and `nouns`, `stackActions(stack, ctx)` returning which of
  use/eat/give/drop/trash/transfer are legal right now (respects
  `meta.keyItem`, room context, presence of an NPC), and `describeStack(stack)`
  → `{ label, qty, sublabel, freshness, tooltip }`.
- `src/srcfiles/render.js`: replace `renderInventory` (line 346) with the
  panel — grouped list left, detail pane right showing description,
  `consumable` values, freshness, and legal action buttons; search box and
  sort dropdown on top. Use `<template>` cloning like the existing
  `tpl-inv-item` path, not string HTML.
- `src/srcfiles/ui.js`: action handlers dispatching through the existing
  `data-action` chain, emitting effect-DSL lines — `CONSUME_ITEM <defId> <qty>
  player`, `MOVE_ITEM <defId> <qty> player <ref>`, `DESTROY_ITEM`. All already
  `implemented: true` in `EFFECT_DEFS`. Acting from the panel costs the same
  time as the equivalent action chip and goes through
  `advanceAndResolveMinutes` — the panel must never be a way to sidestep the
  clock.
- `main.html`: inventory panel + templates + styles; `?v=` bumps; add
  `inventory.js` to the SCRIPTS block after `items.js`.

**Verification:** open the bag with mixed contents; search matches on both
label and noun aliases; each sort mode reorders correctly; the detail pane
shows real `consumable` numbers from `ITEM_DEFS`; drop moves a stack to the
room and it is still there after a reload; trash removes it; a `keyItem`
offers no drop/trash/give button; browsing costs zero game time but acting
advances the clock and decays needs once (not twice).

### Phase 2 — Containers as chests

**Goal:** fridge, pantry, dresser, doormat and trash become browsable
two-panel transfer UIs, and cooking stops being a slot machine.

**Files:**
- `src/srcfiles/defs.world.js`: `container: { capacity, preservation, label }`
  on every item-holding `OBJECT_DEFS` entry, per the preservation table above.
- `src/srcfiles/inventory.js`: `containerStacks(obj)`, `transferPlan(from, to,
  defId, qty)` returning the `MOVE_ITEM` lines to emit. One shared
  implementation for every container — no fridge-specific path.
- `src/srcfiles/render.js`: the shared container view — contents left, bag
  right, Take / Take All / Put / Put All.
- `src/srcfiles/items.js`: `availableRecipes(pool)` returning **all**
  satisfiable recipes. Keep `pickAvailableRecipe` as a thin wrapper over it so
  the maid's auto-cook path (computer.js:2452) is untouched.
- `src/srcfiles/defs.actions.js`: `self.cook`'s `prepare` (line 357) presents
  the satisfiable recipe list for the player to choose instead of taking
  `pickAvailableRecipe`'s first match.
- `src/srcfiles/ui.js`: open-container action wiring; the doormat becomes a
  real destination so the existing delivery drops (ui.js:542, ui.js:881) land
  somewhere the player visits and unpacks.
- `main.html`: container view markup + styles; `?v=` bumps.

**Verification:** open the fridge, move items both directions, reload and
confirm contents persisted; Take All / Put All move everything; cooking offers
every satisfiable recipe and cooking a chosen one consumes exactly its
ingredients across fridge *and* pantry; the maid's auto-cook still works
unchanged; a Nile order lands on the doormat and can be unpacked into the
fridge.

### Phase 3 — Eating and consumption

**Goal:** every food item in the game becomes edible and the free `self.eat`
refill is retired. No action in the game restores hunger from nothing.

**Files:**
- `src/srcfiles/defs.actions.js`: replace `self.eat`'s flat
  `ADJUST_NEED player hunger +40` (line 30) with an item-driven action. In the
  kitchen or dining room the picker also lists fridge and pantry contents, so
  the common case is one click — implemented as `MOVE_ITEM` → `CONSUME_ITEM`
  in one effect batch, never as a special case inside the applier. `timeCost`
  by category: drink 5 min, snack 10, full meal 25.
- `src/srcfiles/inventory.js`: `edibleStacks(gs, ctx)` merging bag + nearby
  container contents; serving math.
- `src/srcfiles/defs.world.js`: optional `servings: n` on meal defs. Eating
  consumes one serving and returns the remainder as a stack with
  `meta.servingsLeft` — this is what makes leftovers a real recurring resource
  rather than a flavour word. `dish_pepperoni_pizza` at `hunger: 55` is a whole
  pizza and should be ~4 servings.
- `src/srcfiles/effects.js`: leave the hook for Phase 4's spoiled-food penalty;
  no applier change needed otherwise.
- `main.html`: eat-picker markup; `?v=` bumps.

**Verification:** eat from the bag in a bedroom; eat from the fridge in the
kitchen without taking first; a multi-serving dish leaves a partial stack with
the right `servingsLeft` and eating the last serving removes it; need
restoration matches the def's `consumable` values exactly; grep confirms no
remaining action grants hunger without consuming something.

### Phase 4 — Spoilage, rot, mess and odor

**Goal:** food decay is real, and rot becomes a mess with consequences (D5,
D6).

**Files:**
- `src/srcfiles/items.js`: **fix B2 first** — make `addStack`'s merge key
  `defId + ownerId + cohort`. Non-perishables keep `cohort: null` and merge as
  today. Nothing else in this phase is safe until this lands. Then
  `freshnessOf(stack, containerDef, day)` implementing the derived table
  above, and `retimeStack(stack, fromDef, toDef)` recomputing remaining life on
  transfer.
- `src/srcfiles/sim.js`: a daily spoilage pass in the day-rollover path — mark
  stacks Rotten, and after `ROT.graceDays` convert them to a mess.
- `src/srcfiles/defs.world.js`: a `rotten_food` state on containers, carrying
  `cleanlinessWeight` and `dirtyWhen` so it feeds the **existing** cleanliness
  machinery (defs.world.js:26) rather than a parallel one; an `odor` room
  state.
- `src/srcfiles/computer.js`: `cleanRoomObjects` (line 789) — which the maid
  already calls — clears rot and odor, so hiring the maid genuinely solves it
  and the player can also just throw it out.
- `src/srcfiles/config.js`: new `ROT` block next to `MAINTENANCE` holding
  `graceDays`, the freshness thresholds, the odor mood penalty, and the
  spoiled-food eating penalties. One tuning surface.
- `src/srcfiles/llm.js`: odor into prompt context so narration mentions the
  smell.

**Verification:** milk in the bag spoils in roughly a quarter the time of milk
in the fridge; moving a half-old item between them does not reset or destroy
its remaining life; two purchases of the same item on different days do **not**
merge into one stack; a forgotten stack goes Rotten, then after the grace
period drags kitchen cleanliness down and sets odor; the maid clears it;
throwing it out clears it; eating Spoiling gives reduced restore and eating
Rotten costs mood and energy; odor appears in narration.

**Balance guard:** odor is an annoyance that motivates a chore, not a spiral.
Roommates may mention it; they must not gain tension from it in v1.

### Phase 5 — Needs rebalance

**Goal:** the full redesign (D1) plus the idle-decay fix (D12). A player who
eats two or three meals a day, showers, sleeps, and spends some time with
their roommates sits at a comfortable mood without ever opening AfterHours.

> **This phase's constants-only step is independent of Phases 1–4** and is the
> fastest possible relief for the felt problem. If playtesting is blocked on
> the current rates, a session may land the `NEEDS` numbers and
> `idleDecayMultiplier` early, then return here for the structural work. That
> is the only sanctioned out-of-order work in this plan.

**Files:**
- `src/srcfiles/config.js`: `NEEDS` gains `idleDecayMultiplier` (start `0.25`)
  and the hunger-rhythm + mood-target thresholds; `NEED_CONSEQUENCES` retuned
  so starvation and filthy still land at the intended moments.
- `src/srcfiles/sim.js`: `decayPlayerNeeds` (line 1259) takes an options bag
  with `idle`; hunger switches to the `hoursSinceLastMeal` / `mealsToday`
  model with `player.hunger` kept as a derived display value; new
  `resolveMoodTarget(gs)` and the ~1-day easing toward it.
- `src/srcfiles/effects.js`: `ADJUST_NEED player mood` becomes an impulse
  written into `eventTerm` rather than a direct write to `player.mood`. All
  existing call sites keep their current syntax.
- `src/srcfiles/time.js`: `runSimCheckpoint` (line 294) passes `idle: true`;
  `advanceAndResolveMinutes` (line 279) does not.
- `src/srcfiles/state.js`: persist the new player fields; add a `player`
  folder migration (3→4) backfilling `hoursSinceLastMeal`, `mealsToday`, and
  `moodEvents: []` for existing saves.

**Verification:** idling on the narration log for several real minutes barely
moves needs while a 30-minute action moves them fully; sleeping 8 hours no
longer wakes you starving; two meals a day holds hunger steady; a single
AfterHours session spikes mood and the spike **decays back** over the
following day unless other terms support it; a day of good living (meals,
shower, clean apartment, roommate time, rent paid) lands mood comfortably
positive with AfterHours untouched; every existing `ADJUST_NEED player mood`
call site still compiles and still visibly does something.

### Phase 6 — Happiness content

**Goal:** many real, ungated sources of mood (D13), so Phase 5's model has
something to reward. A day-one player with no renovations and no money must
have at least four available.

**Files:**
- `src/srcfiles/defs.world.js`: comfort consumables as `ITEM_DEFS` entries
  with `category: 'comfort'` and a `consumable` block, purchasable on Nile —
  coffee, good coffee, tea, beer, wine, cheap whiskey, ice cream, chocolate,
  chips, energy drinks, weed. Each trades something. Proposed starting values:

  | Item | mood | other |
  |---|---|---|
  | Good Coffee | +0.08 | energy +10 |
  | Ice Cream | +0.10 | hunger +15 |
  | Beer | +0.10 | energy −4 |
  | Cheap Whiskey | +0.12 | energy −6, hygiene −2 |
  | Joint | +0.20 | energy −12, stimulation −15 |

  Also hobby objects as `OBJECT_DEFS` entries — guitar, bookshelf, record
  player, game console, sketchpad, houseplant. One-time Nile purchases, placed
  in a room. A $60 guitar is reachable on day two; a renovated gym is not.
- `src/srcfiles/defs.actions.js`: one action per hobby object, sourced from it;
  free ambient actions (nap, sit on the balcony, take a walk, listen to music,
  long shower) with small mood and zero cost — the safety net that guarantees
  the player is never stuck.
- `src/srcfiles/sim.js` / `src/srcfiles/drives.js`: social time pays — sharing
  a room with a roommate, watching TV together, and eating together give mood
  scaled by affection. This is the game's thesis and is currently mechanically
  absent.
- Across the codebase: mood impulses on completing a work gig, finishing a
  course lesson, paying rent on time, completing a quest, a skill level-up, a
  full night's sleep, and a clean apartment. Mostly a matter of finding each
  existing event and adding one line.
- `src/srcfiles/config.js`: all new numbers, none inline at the call site.

**Verification:** start a fresh game and list every mood source reachable on
day one with starting money — at least four, none requiring a renovation; each
comfort consumable applies its full tradeoff; a hobby object bought on Nile
arrives, is placed, and unlocks its action in that room only; sitting with a
liked roommate raises mood and with a hostile one does not; no single
consumable out-earns a good day's living.

### Phase 7 — Set Meal and dining commitments

**Goal:** the dining table becomes the place the household gathers, on purpose
(D7).

**Files:**
- `src/srcfiles/commitments.js` **(new)**: `world.commitments[]` per the data
  model; `createCommitment`, `respondToCommitment`, `activeCommitmentFor(npc,
  clock)`. Acceptance gated on affection, tension, and whether the NPC's
  schedule block is free — a roommate who dislikes you says no, and that
  refusal is information.
- `src/srcfiles/sim.js`: `resolveScheduleActivity` (line 701) checks
  `world.commitments` **first** and relocates an NPC with an accepted
  commitment to the room for its window. This is what makes an invitation bind
  rather than hope.
- `src/srcfiles/computer.js` / `src/srcfiles/ui.js`: invite from the IM app or
  in person; pick day and time.
- `src/srcfiles/defs.actions.js`: the `set_meal` action at the kitchen or
  dining table — place food stacks from bag or fridge onto the table.
  Resolution: everyone present eats with real `consumable` values, mood and
  comfort get the "proper setting" bonus, and each attendee gives a
  relationship delta scaled by food quality, attendance, and current
  relationship. If nobody shows it resolves as a normal meal plus the setting
  bonus.
- `src/srcfiles/state.js`: persist `world.commitments` in `saveAtBoundary`
  alongside `visits` (state.js:459) and in `buildGameState`.
- Leftovers return to the fridge; the table is left dirty, feeding the same
  cleanliness machinery as Phase 4. A shared dinner should cost you a chore.

**Verification:** invite two residents to dinner tomorrow at 19:00; one
accepts, one declines for a real reason; the accepter actually relocates to
the dining room at 19:00 and is there across a save/reload; setting a meal and
eating with them restores everyone's hunger from the real items and gives
relationship deltas; a meal nobody attends still gives the setting bonus;
leftovers land in the fridge; the table is dirty afterward and the maid cleans
it; a low-affection NPC declines.

### Phase 8 — NPC inventories

**Goal:** NPCs own things, and those things matter (D8).

**Files:**
- `src/srcfiles/effects.js`: **fix B1 first** — `CONSUME_ITEM` gains a `who`
  param defaulting to `'player'`; `applyConsumeItem` (line 274) stops
  hardcoding the eater. Nothing else in this phase works until this lands.
  Additive default, no migration.
- `src/srcfiles/npc.js`: `npc.inventory` seeded at creation from a lifestyle
  template derived from the bible — job, income tier, interests, quirks.
- `src/srcfiles/state.js`: `npcs` folder migration (2→3) backfilling
  inventories on existing saves.
- `src/srcfiles/prompt.js` / `src/srcfiles/llm.js`: possessions into prompt
  context so narration references things NPCs actually own. Cheapest step,
  biggest flavour return.
- `src/srcfiles/config.js` (`DRIVE_DEFS`) / `src/srcfiles/drives.js`: the
  hunger drive (config.js:2723) currently conjures `ADJUST_NEED self hunger
  +30` from nothing. Make it search the fridge and the NPC's own bag and
  actually consume what it finds — **your groceries disappear.** This is the
  strongest new pressure in the plan and it points straight at the game's
  thesis: a full house is expensive. Fall back to the abstract restore only
  when the kitchen is genuinely empty, so an NPC never starves because the
  player forgot to shop. New gift drives emit `MOVE_ITEM` from NPC to player
  or to a shared container.
- `src/srcfiles/stealth.js` / `src/srcfiles/ui.js`: searching an NPC's room
  surfaces their possessions; taking something routes through the existing
  suspicion/evidence path (`ADJUST_SUSPICION boundary_violation`), the same
  pattern phone-snooping already uses (drives.js:400). NPCs may also borrow
  from the player, which is where a missing item becomes a conversation.

**Verification:** a fresh NPC has a plausible inventory matching their bible;
an old save gets one via migration; narration references a real owned item; a
hungry roommate eats a specific item out of the fridge and it is gone from the
player's view; an empty kitchen falls back without starving anyone; an NPC
gifts the player something and it arrives in the bag; searching a room lists
possessions and taking one raises that NPC's suspicion; `CONSUME_ITEM` with no
`who` still applies to the player.

### Phase 9 — Save system v2

**Goal:** a VN-style multi-slot save system on kv, future-proof by
construction (D9, D10).

**What already works and must be kept:** saves are already on kv, not
localStorage. `FOLDER_VERSIONS` + `MIGRATIONS` (state.js:27) is a good
per-folder migration spine with real migrations in it, and `saveAtBoundary`
(state.js:442) already knows every key that needs persisting. Do not rewrite
this — wrap it.

> **This save system is novel. It is not ported from anything.** Section 5 of
> `ref/perchance-menu-conventions.md` documents `hedonism-island`'s
> `SaveManager` and the two RPGs' single-localStorage-key saves. That section
> is **background only and is not a model for this phase** — the user has
> explicitly ruled it out as a basis. Those games save one blob of a live
> `game` object with a quota-failure "lite" fallback and no versioning; this
> plan's design (per-folder snapshots, a migration chain run at load time,
> `runId`/`parentSaveId` lineage, and a `SAVE_KEYS` single source of truth) is
> deliberately a different and stronger thing. Do not import their record
> shape, their key naming, or their storage strategy.

**Files:**
- `src/srcfiles/state.js`: extract the persisted key list into a single
  exported `SAVE_KEYS` table read by **both** the autosave path and the
  snapshot path (the invariant the whole design rests on); `captureSave(gs,
  kind)` and `restoreSave(record)` per the save record shape; run the existing
  per-folder migration chain against a snapshot's recorded `folderVersions`
  before installing it; `kv.saves` + `kv.saveIndex`; slot model — 12 manual
  slots (grow on demand), a 5-deep rotating autosave ring, one quicksave, one
  exit-save. Autosave triggers reuse the boundary reasons already threaded
  through `saveAtBoundary`.
- `src/srcfiles/render.js` / new save-menu UI: the slot grid. Cards show day,
  time, room, money, cast, and the last narration line, and must render from
  `kv.saveIndex` alone — never deserialize a payload to draw a card.
  Thumbnails reuse the LRU image cache in state.js by storing the scene
  image's **cache key**, not a second copy of the image; fall back to a
  room-coloured placeholder.
- `src/srcfiles/ui.js`: save/load/overwrite/delete handlers; export a record
  to a compressed base64 blob (copyable and downloadable) and import it back
  with validation and a version-mismatch warning.
- `main.html`: save menu markup + styles; `?v=` bumps.

**Storage discipline:** measure a real snapshot's size early in this phase and
**record the number in the Handoff note.** Cap total saves, warn near the
limit, make deletion easy. If snapshots are large, the mitigation is
per-folder deduplication against the previous save in the same run, which
`parentSaveId` already makes possible.

**Verification:** save to a slot, play on, load it back, and confirm full
fidelity — clock, needs, inventory, NPC state, objects, computer/phone state;
the autosave ring rotates and never exceeds its depth; slot cards render with
no payload load; a save from before a schema change loads through the
migration chain; export produces a blob that imports on a fresh browser
profile; runs group correctly and `parentSaveId` is populated on every save;
deleting a slot frees it.

### Phase 10 — Main menu

**Goal:** a full-screen boot menu with a live slideshow background and a
Discord link (D11).

**Reference:** `ref/perchance-menu-conventions.md` is the source-level record
of how the user's other generators do this, and is the style authority for
this phase. Read these sections rather than re-deriving anything: **§1.3**
(hedonism-island's persistent-DOM + ES-class screen structure — the one to
copy, see below), **§2** (the full CSS: Cinzel + Cormorant Garamond, the gold
`#d9b871` on dark-gradient palette, `.big-btn` / `.title-btn` / `.menu-btn`
button component, hover glow + lift), **§3.4–3.8** (the slideshow component
verbatim), **§4** (the Discord badge, complete with CSS and invite URL), and
**§6** (house style + the eight flagged defects).

**Adopt as-is from the reference:**
- The **two-layer opacity crossfade** (§3.4): two absolutely-positioned `<img>`
  layers toggling a `.visible` class with `transition: opacity 1.2s ease-in-out`,
  the hidden layer's `src` set **before** the class flip so it decodes before
  fading in. 8000 ms interval.
- The **never-blank mechanism** (§3.7): a `.title-bg-layer` gradient element at
  z0 sits behind the image layers, with the text column above at z3. Zero
  images is a designed state, not a failure state.
- The **lazy 3-image buffer with exactly one in-flight request** (§3.5): a
  `generating` boolean guards the generator; the auto-cycle tick that finds no
  next image calls the generator **without advancing the index**, so the
  current slide simply stays up. No queue, no skipped frames.
- The **left-aligned text column** with the content warning directly under the
  buttons (§1, §6.6), and **Continue hidden/disabled until a save exists**
  (§6.5).
- The **Discord badge** (§4) essentially verbatim: inline SVG data URI (no
  external request, no quota), `.discord-logo-link` fixed bottom-right,
  120×120 (80×80 mobile), `object-fit: contain`, hover = `scale(1.1)
  translateY(-5px)` + coloured glow + `brightness(1.2)` on the glyph,
  `target="_blank" rel="noopener noreferrer"` + `title` tooltip, invite
  `https://discord.com/invite/E6N9WKpGPA`. Recolour the glyph to this game's
  palette rather than reusing hedonism-island's bronze `#b47a3c`.

**Deliberate deviations — these correct wrong assumptions in the original
draft of this phase, and each one is a decision, not an oversight:**
1. **Structure follows hedonism-island, not the two RPGs.** lusthaven and
   stellar-lust re-render screens as template literals into `innerHTML` with
   inline `onclick` handlers (§1.1, §6.3). This codebase uses persistent DOM,
   `<template>` cloning, and a `data-action` dispatch chain — so use
   hedonism-island's persistent-DOM + `.hidden`-toggle + class-per-screen
   approach (§1.3), which the reference doc itself calls "a bigger, more
   maintainable OO approach." Take the *visual* style from the RPGs and the
   *structural* pattern from hedonism-island.
2. **Content gating is new work.** §3.3 is unambiguous: the reference lists
   carry **no rating tags**, the hardcore/solo split is a hardcoded
   `Math.random() < 0.5` coin flip, every generated prompt is unconditionally
   NSFW, and neither game's intensity setting or images-on/off toggle gates the
   title gallery at all. The original draft of this phase assumed rating tags
   existed to port. They do not. Tag every trait entry in this game's lists
   with a rating and have the mix respect `meta.contentConfig` — including an
   all-SFW mode. Flag §6.5 says the same thing.
3. **No uncapped retry loop.** §3.7 / flag §6.3: on persistent generation
   failure both games retry every 500 ms **forever**, with no backoff, no cap,
   and no error UI. Do not copy this. Use bounded retries with exponential
   backoff, and after the cap show a quiet "background art unavailable" line
   and settle on the gradient.
4. **Do not store data-URLs in kv.** Flag §6.4: the reference games put full
   768×768 base64 PNGs (~1–2 MB each, `MAX_CACHED = 30`) into a `titleGallery`
   kv folder — tens of MB of IndexedDB per user, and this game's kv budget is
   already carrying save snapshots (Phase 9). Reuse `state.js`'s existing LRU
   image cache and its eviction, and cap the menu's share of it.
5. **Fix the two reference bugs on the way in.** Flag §6.1 (the kv-eviction
   comparator's `||`/`-` precedence bug — `parseInt(a)||0-(parseInt(b)||0)`
   returns a constant and only "works" because `sort` is stable) and flag §6.2
   (the loading text never clears on the first-ever run). Neither should be
   reproduced here.
6. **Viewport-orientation-aware generation (post-completion refinement).**
   The reference games always generate landscape 768×512 and let
   `object-fit: cover` blow it up on portrait/phone viewports, cropping away
   most of the frame. This game detects the viewport orientation and asks the
   plugin for the matching resolution (`768x512` landscape / `512x768`
   portrait), appends a composition hint to the prompt, and centre-crops the
   returned canvas to the viewport's exact aspect ratio (capped at ±3.2:1) so
   `object-fit: cover` never crops further — the frame fills edge-to-edge.
   Cache keys are tagged with orientation (`menu_<rating>_<l|p>_…`) and both
   the persisted ring and the in-session buffer are filtered by orientation,
   so a portrait phone never displays a landscape image; legacy untagged keys
   (pre-refinement, all landscape) are treated as landscape. A resize listener
   restarts the gallery when the orientation flips while the menu is open.

**Files:**
- `src/srcfiles/menu.js` **(new)**: the menu component, used in both contexts —
  boot screen and in-play pause menu (with Resume added). One system, two
  contexts. Entries, left-aligned: Continue · New Game · Load Game · Options ·
  Discord · Exit Game. Structure per deviation 1.
- `src/srcfiles/ui.js`: `boot()` (line 2990) currently auto-loads an existing
  save and renders straight into the game — change it to always present the
  menu, with Continue enabled when a save exists and pointing at the most
  recent save in the most recent run (Phase 9's `kv.saveIndex`). Retire
  `showMenuModal` (line 2899) and move its Debug Panel entry behind Options or
  a key chord.
- `src/srcfiles/image.js`: the slideshow, adopting §3.4–3.8's component onto
  this game's existing plumbing — `root.generateImage` is already wired through
  the `text-to-image-plugin` (perchance.pjs) and called at image.js:106, so do
  not import a second image path. Caching per deviation 4, failure handling per
  deviation 3.
- `src/srcfiles/defs.menu.js` **(new)** or a `config.js` block: the compiled
  trait lists (Actors × Set × Setting × Pose × Emotion × …) and the prompt
  assembly function, modelled on §3.2's `genTitlePrompt` — flat lists, one
  complete noun phrase per entry, uniform selection, fixed concatenation order,
  a shared style tail and negative prompt. **Every entry carries a rating tag**
  (deviation 2). Keep the lists large; the reference games reach their
  combinatorial range with roughly 50 entries per list across five lists.
- `main.html`: menu markup, the z0 gradient + two image layers + overlay + text
  column stack (§1.1's DOM tree is a good map), Discord badge, styles; `?v=`
  bumps; `menu.js` loads after `ui.js`.

**Verification:** the game boots to the menu, not into play; Continue is
disabled with no save and loads the right save with one; the slideshow paints
the gradient immediately and the first image when it arrives, then cross-fades
on the 8 s cycle with no flash of an undecoded image; manual prev/next stops
and restarts the timer; killing the network mid-slideshow retries with visible
backoff, gives up after the cap with the unavailable note, and never shows a
blank frame; setting `contentConfig` to its most restrictive value produces a
demonstrably SFW mix and the most permissive produces the full range; the
image cache respects its cap and does not grow unbounded across boots; the
Discord link opens the right invite in a new tab with `noopener`; the pause
menu is the same component and Resume returns to play with state intact;
Options changes persist across a reload.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | Inventory core: stack meta contract, `inventory.js` helpers, interactive panel, use/drop/trash verbs |
| 2 | **Done** | Containers as chests: fridge/pantry/doormat transfer UI, preservation multipliers, recipe choice |
| 3 | **Done** | Eating: item-driven `self.eat`, eat from nearby containers, servings and leftovers |
| 4 | **Done** | Spoilage: B2 cohort-aware merge, derived freshness + retimeStack, rot → mess → odor, maid + player clear it, spoiled-eating penalties |
| 5 | **Done** | Needs rebalance: rhythm hunger, derived mood, idle-decay multiplier |
| 6 | **Done** | Happiness content: comfort consumables, hobby objects, social time, ambient actions, progress impulses |
| 7 | **Done** | Set Meal: `world.commitments[]`, invitations, schedule override, shared dinner + mess |
| 8 | **Done** | NPC inventories: B1 fix, lifestyle seeding, prose grounding, two-way gifts, NPCs eat your food, theft |
| 9 | **Done** | Save system v2: `SAVE_KEYS`, slot grid, autosave ring, thumbnails, export/import |
| 10 | **Done** | Main menu: boot screen, slideshow, Discord, pause menu, Options (slideshow implements against `ref/perchance-menu-conventions.md`, deviations 1–5) |

## Dependency order

```
Phase 1 (inventory core) ──► 2 ──► 3 ──► 4
                              │      └─► 7 (Set Meal needs eating)
                              └─► 8 (NPC inventories need containers)

Phase 5 (needs) ──► 6 (happiness content)
   └─ constants-only step is independent; may be pulled forward

Phase 9 (saves)  — independent of 1-8; should come after them so the new
                   schemas exist to be captured
Phase 10 (menu)  — independent of 1-9; wants Phase 9's kv.saveIndex for
                   Continue/Load, so prefer running it after
```

Phase 1 is the hard prerequisite for 2, 3, 4, 7 and 8. **B2 must be fixed at
the top of Phase 4 and B1 at the top of Phase 8** — both are latent today and
silently corrupt the phase that depends on them. Phase 5 is structurally
independent of the item work but should land after Phase 3, since the mood
model wants real restore sources to reward. Phase 9 is last among the systems
so it captures the finished schemas; Phase 10 can slot anywhere, but prefers
to follow Phase 9 so Continue and Load Game can read `kv.saveIndex` instead of
a temporary shim.

---

## Open questions (parked, none blocking)

- **Cooking for storage** — can the player batch-cook meals into the fridge, or
  only cook to eat? Phase 3's serving model is in place (EAT_ITEM +
  meta.servingsLeft) and doesn't foreclose either; only the feature itself is
  unimplemented. Recommend allowing it.

- **Does the branching-tree save view ship at all**, or is the grouped list
  enough in practice? Decide after playing with Phase 9's grouped view — the
  data model supports either.
- **A needs-intensity slider in Options** — cheap once the Phase 5 constants
  are centralized, and it makes the original complaint self-serviceable.
- **How does the player reach the all-SFW mode?** Phase 10 implemented the
  mechanism (the slideshow honors `contentFlags.mature:false` and
  `romance:false`), but the char-creation form's content-prefs field only
  turns flags ON (they default on), so no player-reachable configuration
  produces a restrictive mix yet. Wiring a "mild"/"sfw" pref that turns
  mature/romance OFF would make it reachable — but that also changes LLM
  content directives for the whole save, so it needs a product decision
  before implementation.
- **All numeric values in this document are proposed defaults**, tunable, and
  flagged inline.

## Design invariants

1. **One stack shape everywhere.** `{ defId, qty, ownerId, meta }` in the
   player's bag, in container `.contents`, and in `npc.inventory`. Never a
   parallel item representation.
2. **Mutation routes through `applyEffects`.** `items.js` and `inventory.js`
   stay pure — query and sort only. This is the existing ITEMS contract and it
   is what keeps the save system able to snapshot state coherently.
3. **No action restores a need from nothing.** After Phase 3, any hunger gain
   is backed by a consumed item.
4. **Inventory is uncapped; the pressure is spoilage.** Never reintroduce
   weight or slot limits.
5. **Freshness is derived from elapsed days, never a stored countdown.** It
   must stay correct across saves, reloads, and multi-day time skips.
6. **Mood is an impulse system, not a bar.** New content emits impulses;
   nothing writes `player.mood` directly after Phase 5.
7. **Never enumerate persisted keys in two places.** `SAVE_KEYS` is the single
   table; both the autosave path and the snapshot path read it. `castWeb`
   silently never persisted for months because it was missed in exactly this
   way (state.js:452).
8. **Every tuning number lives in `config.js`** next to its neighbours, never
   inline at the call site. The codebase already carries at least one
   duplicated tuning surface where one copy was silently inert
   (config.js:2493) — don't add another.
9. **The menu never renders blank.** The z0 gradient layer sits behind the
   image layers permanently, so zero images is a designed state; the slideshow
   degrades generation failure → cache → gradient, with bounded retries and no
   uncapped retry loop.
10. **Bump the `?v=` query on every changed script tag in `main.html`.** The
    restaurant-network overhaul lost a full debugging session to stale cached
    `src/*.js` — this is the most common way work in this repo appears not to
    have happened.
