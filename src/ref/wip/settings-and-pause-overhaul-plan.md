# Settings & Pause Overhaul

Status: **complete — all 10 phases done and verified**. Design session complete 2026-08-19; all
decisions locked.
Last updated 2026-08-20 (Phase 10 — game-speed HUD — built & verified).

Companions:
- `src/ref/structural/game-clock-time-system.md` — the dilation loop (`TIME.clockFrame`, the context stack) that Phase 10's speed multiplier wraps, and the `AUTOSAVE_MS` timer Phase 4 retunes. Read §3 and §9 before Phase 10.
- `src/ref/complete/inventory-needs-menu-saves-plan.md` — built the VN-style save panel (`#save-panel`), the main-menu component, and the `kv.menu` 'options'/'prefs' keys that Phases 1–3 rework.
- `src/ref/complete/external-world-npcs-overhaul-plan.md` — the visit spine and every external presence (maid, escorts, contractors, friends-of-friends, food drivers) whose generation Phase 6 re-populates.
- `src/ref/complete/afterhours-redesign-plan.md` — Hot Singles / AfterHours profile generation (a Phase 6 population target).
- `src/ref/structural/perchance-menu-conventions.md` — the reference-game menu structure the pause screen restyles. The deviation notes in it are deliberate; keep them.
- `src/ref/complete/prompt-generator-v2.md` — built `PROMPT_V2` in `defs.menu.js`, which Phases 5–7 consume (art-actor distribution, race descriptors, style suffix).
- `src/ref/wip/home-design-studio-plan.md` — explicitly **not** touched: themes must not alter in-world visuals (`ROOM_DECOR`/shapes), only UI chrome.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/wip/settings-and-pause-overhaul-handoff-prompt.md` for the full
session protocol.

---

## Handoff — read this first

**Resume at:** All phases complete. The Settings & Pause Overhaul is DONE —
Phases 1–10 shipped and verified. There is nothing left to build; the parked
open questions below are standing content/scope levers, not work items. See
the 2026-08-20 Phase 10 note below for the speed-HUD record.

**Last session's notes (2026-08-20, Phase 10 — Game-speed HUD):**
- `index.html`: `#hdr-speed` cluster (label + four `.btn.btn-secondary.tiny`
  buttons `data-action="speed.set"` `data-id="x0|x1|x20|x100"`) inserted
  between `#hdr-status-group` and `#hdr-room-sep`, plus `#hdr-speed-sep`.
  CSS: `#hdr-speed` (gap), `.hdr-speed-btns` (2px-gap flex), button padding/
  size, and `[data-active]` (accent fill — out-specs `.btn-secondary`).
  Mobile `@media (max-width:900px)` hides `#hdr-speed-sep, #header #hdr-speed`
  alongside the status group (speed rides with Day/Time/Money there).
  `?v=` bumps: time.js 29, render.js 73, ui.js 114. loadgame.js ORDER
  unchanged (no new files).
- `src/srcfiles/time.js`: `getTimeScale()` now returns
  `(context scale) * currentSpeed().multiplier` with a D12 comment block.
  It is the ONLY multiplier site and its ONLY caller is `clockFrame` — the
  discrete path (`advanceAndResolveMinutes`/`advanceAndResolve`/sleep) never
  reads it, so minute-exact targets are speed-independent by construction.
  x0 → scale 0 → clockFrame's `scale > 0` guard skips accumulation while the
  rAF loop stays alive, so a later preset click resumes cleanly. The sim
  checkpoint accumulator runs off accrued game-minutes (D12), so checkpoints
  scale naturally with speed — zero change needed.
- `src/srcfiles/render.js`: new `renderSpeedButtons()` (marks `data-active`
  on the matching `#hdr-speed [data-id]` button), called from `renderHeader`
  and directly from the 'speed.set' action so a click re-marks without a
  full render pass.
- `src/srcfiles/ui.js`: `'speed.set'` added to `MENU_ACTIONS` and
  `ENERGY_GATE_EXEMPT` (meta, free at 0 energy, reachable with no game);
  delegation chain gained `data-id` → `extra.id`; new case in handleAction
  next to `options.bg-art` → `setSpeed(extra.id)` + `renderSpeedButtons()`.
- **Verification (live, browser_eval + browser_refresh + vision + html2canvas):**
  cluster renders, x20 default-active on render. **x100**: exactly 30.01
  game-minutes in 18.0 real-sec (1.67 gm/sec = 100 game-sec/sec) with a sim
  checkpoint firing on exactly 30 accumulated minutes (instrumented
  `runSimCheckpoint` wrapper: 1 fire, 30 minutes). **x0**: clock frozen
  (identical abs across 4s) while chips stay interactive (a `move` to
  hallway_a succeeded and logged "You move to Hallway A."). **Conversation**:
  pushed 'conversation' context → scale 1/60 at x20, 5/60 at x100,
  0 at x0 (multiplier applies over the 1/60 context scale). **Discrete**:
  sleep at x0 landed minute-exact (day 2, 06:00, `minutes === 937`) —
  identical arithmetic to pre-overhaul. **Reload**: browser_refresh boots at
  x20, zero perchanceErrors/syntaxErrors. Settings round-trip intact
  (theme midnight / textSize medium / imageStyle none / genderDist
  40/40/8/6/6 / raceDist human:100). No header overflow
  (scrollWidth === clientWidth). html2canvas + vision: all four buttons
  present and legible, 20× filled/highlighted, no clipping/overlap.

**Blockers / flagged deviations:** None. Two notes → **D23**: (1) the parked
"persist game speed?" question was answered NO — session-local, booting at
x20, so speed never touches `kv.menu` 'settings' (invisible to export/import
text and resetAllData). (2) The plan text said "clockFrame multiplies the
resolved context scale"; the multiplier actually lives one level down in
`getTimeScale()` (same effect — it is clockFrame's only scale source, and
keeping the multiplication at the resolution point means any future caller
of getTimeScale gets the same D12 semantics).

**Last session's notes (2026-08-20, Phase 9 — Data tab):**
- `src/srcfiles/defs.settings.js`: the Data tab config replaces the empty
  `sections: []` — three sections: 'Save transfer' (`export-save`,
  `import-save`, both `kind:'button'`), 'Storage' (`storage-summary`,
  `kind:'storage'` — a NEW row kind), 'Danger zone' (`data-reset`,
  `danger: true`). The Images tab's `clear-image-cache` row gained
  `danger: true` too — the button renderer only adds the red
  `settings-clear-btn` class when `row.danger` is set now.
- `src/srcfiles/settings.js`: `storageSummary()` (reads kv LIVE, never a
  cache) returns `{ rows: [{label,count,bytes}], totalBytes }` over four
  groups — Save slots (kv.saveIndex 'index' ARRAY length + kv.saves byte
  scan), Cached images (kv.images, counting `blob.size`), Settings & menu
  (kv.menu), Current playthrough (meta/player/world/npcs/objects/
  snapshots). NOTE the save-count footgun fixed during verification: the
  slot index is ONE kv key ('index') holding the entry array — count the
  array, not `saveIndex.keys()`. Helpers: `approxValueBytes(v)` /
  `formatStorageBytes(bytes)`. `resetAllData()` — see D22 for the two
  load-bearing details; it ends with the doExitGame boot dance
  (`closeModal/closeSaveMenu/closeMainMenu` + `currentGameState = null` +
  `showMainMenu('boot')`, all typeof-guarded).
- `src/srcfiles/menu.js`: new `kind:'storage'` branch in
  `renderSettingsControl` (readout box `.settings-storage-body` filled
  async by `fillStorageReadout`, Refresh button carrying the row's
  `data-action`); `refreshStorageReadout()` re-fills the live box in place;
  `resetMenuOptionsCache()` (menuOptionsCache → DEFAULT_MENU_OPTIONS).
  The storage fill is tagged (`_storageFillId` / `box.dataset.fillId`) so
  a stale async completion can't clobber a newer refresh.
- `src/srcfiles/ui.js`: MENU_ACTIONS + ENERGY_GATE_EXEMPT gained
  `'set.export-save'`, `'set.import-save'`, `'data.reset'`, `'data.storage'`.
  handleAction: `set.export-save` → `openSaveMenu('load')` (every occupied
  card already has its own Export button), `set.import-save` →
  `openImportModal()`, `data.reset` → `askConfirm` then `resetAllData()`,
  `data.storage` → `refreshStorageReadout()`. Cross-checked: all 17 rows
  across all 5 tabs resolve to real MENU_ACTIONS ids (zero misses).
- `index.html`: `.settings-storage*` CSS (readout box, per-row label/value,
  green total, right-aligned Refresh) + `?v=` bumps: defs.settings.js 8,
  settings.js 6, menu.js 24, ui.js 113. loadgame.js ORDER unchanged (no
  new files). The Data tab's `storage` kind needed no SETTINGS_TABS renderer
  change beyond the kind branch — it renders like any section.
- **Verification (live, browser_eval + browser_refresh + vision):** all 4
  rows render with correct action ids; Export/Import buttons are plain,
  Reset has the red danger class; clicking "Export a save…" opens the save
  panel in Load mode; export→import round-trips through a slot (manual_0's
  `sv_qb4f4tkmpt` deleted then re-imported with the SAME saveId via
  `doExportSlot` → `#export-text` → `deleteSaveSlot` → `openImportModal` +
  `handleImportSave`); storageSummary counts match reality 4/4 (7 slots /
  2→4 images / 4 menu keys / 126 live keys); cross-tab filter 'reset'
  surfaces the Data row under the "💾 Data" header; Reset shows the confirm,
  wipes every STORAGE_FOLDERS folder to 0, restores defaults (theme
  midnight, textSize medium, imageStyle none, sfw off, genderDist
  40/40/8/6/6, raceDist human 100), resets `data-theme`, disables
  Continue, and the FOLLOWING hard reload boots with zero
  perchanceErrors/syntaxErrors. The readout's Refresh button re-fills in
  place tracking live kv (0 slots / 3 images / 2 menu / total ≈ 2.1 MB).
  html2canvas capture of the Data tab (load 1.4.1 from jsdelivr; its
  parser chokes on the `color-mix()` in `.settings-clear-btn` — neutralize
  with an injected `!important` override `<style>` before capturing):
  vision-confirmed clean layout — two transfer buttons right-aligned, no
  clipped/overlapping text, green "Total ≈" line, red-bordered Reset.
  Settings left at defaults (midnight/medium), kv mostly empty but with a
  healthy fresh first-run `meta`.

**Blockers / flagged deviations:** None blocking. Two notes → **D22**:
(1) `resetAllData` wipes EVERY folder in `STORAGE_FOLDERS` (meta/player/
world/npcs/objects/saveIndex/saves/snapshots/images/menu) — a superset of
the plan's "saves+images+settings" (D11), because the live-game folders are
game data too and would otherwise keep consuming storage and show up in the
insight forever. (2) The reset's two load-bearing details, both verified by
failing live first: it cancels state.js's debounced `writeQueue`/`writeTimer`
(clearTimeout + `writeQueue.clear()`, typeof-guarded) before the wipe — a
pending flush would re-populate the wiped folders — AND re-runs
`initStorage()` right after the wipe to re-seed the fresh first-run meta.
Without that fresh meta, the boot gallery's first generated image
(`setCachedImage` merges onto `meta || {}` and PRESERVES versions — but on
an emptied folder it creates a bare `{imageIndex}`) poisons the NEXT boot:
`checkAndMigrateFolder('meta')` sees version 0 and asserts "Migration
incomplete for meta: at 0, expected 2", and since boot awaits initStorage
FIRST, the whole page fails to boot. Calling `initStorage()` (state.js's own
creation path, not a hand-kept copy of the literal) restores the invariant;
gallery writes afterwards merge onto the versions-correct meta. Pattern
anchors for Phase 10 (read fresh): `TIME.clockFrame` in time.js + the
`AUTOSAVE_MS`-era `startAutosave` in state.js (settings.js's
`autosaveIntervalMs()` is the precedent for a runtime-read timer period);
`renderHeader` in render.js; `currentSpeed/setSpeed` in settings.js;
`SPEED_PRESETS` in defs.settings.js. Parked from earlier phases still true:
`validateNpcItemObject` (state.js) shares the pre-D19 array-itemFields
pattern; `CHARACTER_SCHEMA.bible.species` enum must stay in sync with RACES
(hardcoded because config.js loads before defs.settings.js); boot menu +
settings frame keep hardcoded gold/brown chrome (D10's scope is the token
set).
## The thesis

The game's settings are its weakest surface. The menu is one component with
two contexts, but the pause context just reuses the boot title screen — the
slideshow spins behind a "pause," Options is a flat scroll of binary toggles,
cast preferences are six on/off switches with no notion of proportion, and
there is no way to restyle, rescale, filter content, or understand what data
the game is holding. Meanwhile the systems that would power real options all
exist and are idle: a per-save `contentConfig` flag set that every prompt
consumer already respects, a dilation loop built for a scale multiplier, an
image cache that keys off prompts, a tokenized `:root` palette, and — for the
population half — a single `rollGender` choke point every NPC generator
already funnels through.

This overhaul turns settings into a first-class, searchable, tabbed surface
where every control has a live consumer; replaces the pause-menu reuse with a
real pause screen; replaces the cast toggles with a **population distribution
over gender AND race that governs every cast generation source** (with fantasy
races available but off by default, per the player poll); adds a global
image-style system, a dozen+ color themes, text sizing, an SFW guidance
toggle, and a game-speed HUD — and cuts anything that cannot be wired.

### What this plan is *not*
- **Not a resolution/quality settings surface.** Resolution, guidance scale,
  and negative prompts stay hardcoded — explicitly cut by the user.
- **Not retroactive recasting.** The living cast is fixed per save; the
  distribution governs *generation* only — new games and newly spawned
  external NPCs — and never re-rolls existing NPCs.
- **Not applied to authored NPCs.** Del Connors (and any future hand-authored
  cast) is exempt by construction: authored NPCs never pass through the roll
  path, and `partial.species` pins an authored species explicitly.
- **Not a rewrite of `PROMPT_V2` or `rollCastSlot`.** The distribution plugs
  into the existing `rollGender`/`rollActors`/`rollCastSlot`; the engines stay
  untouched.
- **Not theming of generated imagery.** Themes recolor UI chrome
  (`:root` tokens); scene/character images are unaffected.
- **Not a per-save settings model.** Settings are browser-local (`kv.menu`),
  like today's `bgArt`. The one exception is the SFW flag, which patches the
  per-save `meta.contentConfig` because that is the field the whole content
  pipeline already reads.
- **Not content censorship.** The SFW toggle guides outputs through existing
  consumers (`contentFlags.mature=false`); no verb is removed or hidden.

## Locked decisions

### Surfaces
- **D1 — Two settings surfaces.** The boot menu's Options row keeps
  main-menu-only concerns (Background art, Debug panel) and adds an entry
  into the tabbed settings. The in-game pause Options opens the full tabbed
  settings screen. Main-menu cosmetic options never appear in the tabs, and
  gameplay settings never appear on the boot row. Autosave **moves** off the
  boot row into the General tab (it is a gameplay setting).
- **D2 — The tabbed screen is a sub-screen of `#main-menu`**, origin-tracked:
  Back returns to wherever it was opened from (boot options row, pause
  screen, or title). Left-rail tab navigation (icons + labels always
  visible), a cross-tab filter box, and **immediate-apply rows** — no Apply
  or Save button; every change writes `kv.menu` and takes effect live.
  The last-opened tab is remembered. Esc closes it (existing keydown chain).
- **D3 — Pause menu is a new `#menu-pause-screen` sub-screen** with, top to
  bottom: **Resume · Save · Load · Options · Discord · Quit to Menu**, plus a
  day/time readout. It is a plain dimmed overlay — the pause context stops
  running the title gallery, slideshow auto-cycle, and slideshow darkening.
  Save/Load open the existing VN slot grid (`#save-panel`) in save/load mode
  — it already sits above the menu (z 200 > 190) and slot load already
  confirms (`doLoadFromSlot`). Quit to Menu reuses `doExitGame` (exit-save +
  return to boot). Escape closes (existing).

### Settings semantics
- **D4 — The settings store is `kv.menu` 'settings', one object, one
  schema**, browser-local and deliberately NOT part of save records
  (`kv.menu` is already outside `SAVE_KEYS`). Migration on first load pulls
  today's `kv.menu` 'options'.autosave and 'prefs' into the new object;
  `bgArt` stays in 'options'. The old 'prefs' keys are retired.
- **D5 — SFW toggle = `contentFlags.mature = false` on the live game's
  `meta.contentConfig`.** This is the existing "all-SFW mode" the whole
  pipeline already respects: `menuRatingCap` → 'sfw', `CONTENT_DIRECTIVES`
  mature off → "fade to black" in LLM prompts, `intimateAllowed` → gate
  closed for character-image description, `activeContentFlags` → adult sites
  gated in the browser. Disabled by default. Applied at toggle time (live
  game), at new-game cast approval (`pendingCast.contentConfig`), and
  re-applied on `resumeFromRecord`. It guides outputs; it never removes
  verbs.
- **D6 — Autosave interval choices `30s | 1m | 5m | 10m`.** `AUTOSAVE_MS`
  becomes a runtime read from settings; changing the interval re-arms a live
  timer. Default `30s` (today's constant).
- **D7 — Text size is font-size-only** (`small | medium | large` via a
  `data-text-scale` attribute and a token set), never layout metrics. It
  covers the high-impact text families: body base, dialogue/log, action
  chips, conversation, header values, sidebar, menus, save panel. UI scale
  is explicitly cut.
- **D15 — Settings persistence semantics (Phase 1).** The `settingsCache`
  object in settings.js is the live cache; `loadSettings()` is idempotent
  and runs a one-way migration ONLY when no stored 'settings' object exists,
  persisting the migrated object immediately — so a re-migration can never
  clobber later edits and the old 'options'/'prefs' keys are retired on
  first load. `setSettings(patch)` normalizes, caches, and persists (every
  row writes through it; no Apply button). Distribution fields (`genderDist`,
  `raceDist`) are replaced WHOLESALE by the stored value when present and
  renormalized by `normalizeDistribution` to integer shares summing to
  exactly 100 (largest-remainder). `normalizeSettings` coerces every field
  to a valid shape so a half-corrupt stored object can never poison a later
  phase's reads. The boot menu keeps reading/writing 'options' (bgArt) and
  'prefs' until their retiring phases land.
- **D16 — Settings sub-screen mechanics (Phase 2).** The "last-opened tab
  is remembered" (D2) is **session-local** (`settingsActiveTab` module var)
  — deliberately not persisted: the settings schema has no tab field,
  `normalizeSettings` drops unknown keys, and adding one isn't in the plan.
  Escape closes the settings screen from BOTH origins (returning to the
  origin, same as Back — `closeSettingsScreen`); the existing pause-only
  Escape chain is unchanged below it. The filter box is an input event, not
  a data-action; a filter hit's tab-group header is a `settings.tab` button
  with `data-clear-filter` (jump clears the query + input). Row kinds render
  as: toggle = On/Off pill, cycle = single "next value" pill button. In the
  boot options row, the Autosave entry is re-pointed onto `settings.autosave`
  (single source of truth) but stays in the HTML until Phase 4 removes it.
- **D17 — Text-size scope (Phase 4).** Scaled: body base, dialogue/log,
  action chips, conversation, header values, sidebar, menus (boot title,
  pause, options, settings screens), save panel. NOT scaled (micro-labels
  / chrome — "UI scale is explicitly cut"): SVG floor-plan labels
  (`.fp-*`, 6–12px), moodle pips, inventory/container badges + detail
  chips, desktop-icon labels, intro progress.

### Population
- **D8 — The Population tab governs the densities of ALL cast generation:**
  the apartment cast at new game, Hot Singles, maid and escort services,
  friends-of-friends, classifieds/applicants, contractors, food drivers, and
  background-art actors. It replaces the six old art toggles **and**
  `CHAR_GEN.genderWeights` as the generation source. It is never
  retroactive (the living cast is fixed per save) and never touches authored
  NPCs (Del Connors is the one authored, included-from-start NPC and stays
  untouched; `partial.species` pins any future authored species).
- **D13 — Race & species distribution is a proportional slider set over the
  `RACES` pool, defaulting to human 100% with every fantasy race OFF.**
  This is the player-poll result: races available, not the default. It
  governs the same all-cast scope as gender. Races are prompt-layer visible
  (`bible.species` + the describer + art-actor descriptors) — no new anatomy
  simulation. The pool is a standing content lever (extending it is a data
  edit, not a feature).
- **D14 — The gender distribution is expressed in the cast identity
  taxonomy** — the five `CHAR_GEN` identities (female / male / futanari /
  trans_male / trans_female), defaulting to today's weights (40/40/8/6/6) —
  because that is the taxonomy `bible.gender` and every `rollGender` caller
  already use. `rollGender` becomes a settings read. Background-art actors
  derive their presentation tag from the rolled identity
  (female/futanari/trans_female → 'f'; male/trans_male → 'm'); the old
  f/m/nb toggles are retired and the 'nb' art-pool entries go dormant (parked
  question: whether to add an nb cast identity).
- **D18 — `RACES.artPhrase` is a per-presentation map `{f, m}` (Phase 5).**
  The plan's D13 sketch showed a single string ("an elven woman"), but the
  art-actor pool is f/m-presenting via `identityToArtTag`, so a male actor
  must never be described with the female form. `raceArtPhrase(species,
  artTag)` picks the form; `human` short-circuits to '' so a human-100
  distribution adds no prompt text (byte-identical art).
- **D19 — Schema defaults are cloned at assignment (Phase 6, bug fix).**
  `validateCharacter`/`validateNestedObject` used to assign the SHARED
  `CHARACTER_SCHEMA` default objects by reference; a second `validateCharacter`
  on the same bible (createNpcFromStub / buildStudioNpc validate the same
  `physical` twice) recursed into the shared `physical.typicalAttire` default
  and filled its empty sub-keys INTO the schema, poisoning every later
  validation on the page. Fixed with a `cloneDefault()` helper at every
  default-assignment site in npc.js. The fix makes default assignment
  idempotent — a cast is byte-identical regardless of page history, which is
  what Phase 6's determinism verification depends on. Residual (parked):
  double-validated NPCs still get the four-key shape on their OWN clone
  (content-identical, deterministic); `validateNpcItemObject` (state.js)
  still shares `spec.default` for array `itemFields` — revisit if a future
  phase writes into `bible.interests[].tags` etc.
- **D20 — The image-style cache-key token is omitted when the style is
  'none' (Phase 7).** `imageStyleToken()` returns '' for 'none' and the token
  is APPENDED to every cache key (scene/char/peek/portrait/photo/menu ring),
  exactly mirroring the existing empty-`detail` rule: a default-settings key
  is byte-identical to pre-overhaul, so the existing cache survives the
  feature, while any other style produces fresh keys and the LRU evicts the
  old frames. The '__custom' token folds the custom PHRASE's hash
  (`stc_<hash>`), so editing the phrase also invalidates — not only toggling
  Custom on. IMAGE_STYLES is exactly 18 entries (17 premade + the '__custom'
  sentinel); 'none' is the separate off-state rendered by the Images tab as
  its own tile.
- **D21 — COLOR_THEMES.vars and the `[data-theme]` CSS blocks are a
  two-sided table (Phase 8).** The JS vars (defs.settings.js) drive the
  Appearance tab's tile swatches (menu.js's THEME_SWATCH_TOKENS reads
  bg/surface/accent/text out of them) and are the human-readable palette;
  the CSS blocks in the tokens <style> (index.html) are the runtime
  authority — `html[data-theme="…"]` beats `:root` on specificity.
  'midnight' needs no block (it IS the :root base, byte-for-byte);
  'match-system' ships no values in either (CSS prefers-color-scheme
  queries pick the midnight/dark or daylight/light palette). The two sides
  must stay in sync: a CSS-only edit looks right in-game until the swatch
  preview gives it away. Themes are CSS-only by construction — no prompt,
  cache key, or image path reads a theme value (D10's "imagery untouched"
  is structural, not a side effect).
- **D22 — Reset-all-data wipes EVERY kv game folder and re-seeds the fresh
  first-run meta (Phase 9).** `resetAllData()` clears all ten
  `STORAGE_FOLDERS` (meta/player/world/npcs/objects/saveIndex/saves/
  snapshots/images/menu) — a superset of D11's "saves+images+settings",
  because the live-game folders are game data too and would otherwise keep
  consuming storage and appear in the storage insight forever. Two
  load-bearing details, both found by failing live first: (1) it cancels
  state.js's debounced `writeQueue`/`writeTimer` BEFORE the wipe — a
  pending flush would re-populate the just-wiped folders with stale game
  data; (2) it re-runs `initStorage()` right after the wipe so the fresh
  first-run `meta` (versions pre-seeded) exists before the boot gallery's
  first generated image touches the folder. Without that, `setCachedImage`
  merges onto `meta || {}` and — on an emptied folder — creates a bare
  `{imageIndex}`, so the NEXT boot's `checkAndMigrateFolder('meta')` sees
  version 0 and asserts "Migration incomplete for meta: at 0, expected 2"
  while `boot()` awaits `initStorage()` first → the whole page fails to
  boot. Calling `initStorage()` is state.js's own creation path — never a
  hand-kept copy of the fresh-meta literal.
- **D9 — Image styles are 18 premade presets + 'Custom'.** Each preset is
  `{id, label, blurb, suffix}` — a prompt phrase appended to **every**
  `generateImage` prompt through ONE helper in image.js (the single funnel —
  all ~8 call sites live there). A Custom text field appends verbatim. Style
  is prompt-text only: per-character seeds are untouched (determinism). The
  active style id folds into every image cache key (scene/char/peek/
  portrait/photo/menu ring) so a style change produces fresh frames and the
  LRU evicts the stale ones.
- **D10 — Themes are 14 palettes over the existing `:root` token set** (the
  `--color-*` variables plus `--color-card`), applied via a `data-theme`
  attribute on `<html>` with rule-sets in the tokens `<style>`. Groups:
  Standard (Midnight = today, Daylight, Match System via `prefers-color-
  scheme`), Accessibility (High Contrast, Dimmed, Sepia, Nord), Flavour
  (Crimson, Ocean, Synthwave, Forest, Sunset, Blossom, Monochrome). Color-
  blind-safe pairings required for the need-bar/warning/desire colors.
- **D11 — Data tab: Export/Import reuse the save panel's existing tools,
  Reset all data wipes `kv` saves+images+settings (confirm modal, back to
  boot), and Storage insight shows per-folder entry counts + approximate
  bytes read live from `kv`** (saves slots used, image-cache entries,
  settings).
- **D12 — Game-speed HUD x0 | x1 | x20 | x100 lives in the header, NOT in
  settings.** It is a multiplier over the resolved context scale in
  `clockFrame`: x20 = today's default (multiplier 1), x1 = 1 game-sec/real-
  sec (multiplier 1/20), x100 = multiplier 5, x0 = multiplier 0 (time
  frozen). Sleep stays discrete; conversation stays relative to its context
  scale. Session-local (resets to x20 on reload) unless Phase 10 promotes
  the parked question.
- **D23 — Game speed stays session-local (Phase 10, resolved parked
  question).** The open question \"Persist the game-speed selection across
  reloads?\" was answered NO at Phase 10: `speedCache` lives in settings.js
  module state and `setSpeed` never persists, so a reload always boots at
  x20. Keeping it out of `kv.menu` 'settings' means speed is invisible to
  the export/import save text and to `resetAllData` — nothing speed-related
  to migrate or wipe. The multiplier is read live every frame in
  `getTimeScale()`, so a header click applies on the next clock frame with
  no settings write-through at all.

## Data model

### Settings object (kv.menu 'settings')
```js
SETTINGS_DEFAULTS = {
  autosave: true,                 // migrated from kv.menu 'options'.autosave
  autosaveInterval: '30s',        // '30s'|'1m'|'5m'|'10m'  (D6)
  sfwMode: false,                 // contentFlags.mature=false when true (D5)
  textSize: 'medium',             // 'small'|'medium'|'large' (D7)
  genderDist: {                   // cast identity taxonomy, sums to 100 (D14)
    female: 40, male: 40, futanari: 8, trans_male: 6, trans_female: 6,
  },
  raceDist: { human: 100 },       // RACES ids, sums to 100; fantasy OFF by default (D13)
  pairings: { hetero: true, gay: true, lesbian: true },  // art allowlist only
  imageStyle: 'none',             // style id from IMAGE_STYLES, or '__custom' (D9)
  customStylePrompt: '',          // used when imageStyle === '__custom'
  theme: 'midnight',              // id from COLOR_THEMES (D10)
}
```
Load: `loadSettings()` merges over `SETTINGS_DEFAULTS`, running migration.
Write: `setSettings(patch)` updates the cache and persists. `kv.menu` is
outside `SAVE_KEYS` — never add this to a save record.

### Migration map (first load)
| Old key (kv.menu) | New field |
|---|---|
| `'options'.autosave` | `settings.autosave` |
| `'prefs'.actorGenders` | `settings.genderDist` — map on-axes to identities by presentation: 'f' → female+futanari+trans_female, 'm' → male+trans_male, 'nb' → nothing (no nb identity); untouched/ all-on toggles → default 40/40/8/6/6. Approximate by design; nearly all players left the defaults |
| `'prefs'.pairings` | `settings.pairings` (verbatim) |
| — | `settings.raceDist` defaults to `{human:100}` (no old key) |
| `'options'.bgArt` | **stays** in `'options'` (boot-only) |

### Tables (defs.settings.js)
```js
AUTOSAVE_INTERVALS = [ { id:'30s', ms:30000 }, { id:'1m', ms:60000 },
                       { id:'5m', ms:300000 }, { id:'10m', ms:600000 } ];
TEXT_SIZES = [ { id:'small', scale:0.9 }, { id:'medium', scale:1 }, { id:'large', scale:1.2 } ];
SPEED_PRESETS = [ { id:'x0', label:'0×', multiplier:0 }, { id:'x1', label:'1×', multiplier:1/20 },
                  { id:'x20', label:'20×', multiplier:1 }, { id:'x100', label:'100×', multiplier:5 } ];
```
`RACES` (starter pool of 10, standing content lever — office-clicker-inspired,
trimmed for a cozy slice-of-life tone): each `{ id, label, article, noun,
traitPhrase, artPhrase }` where `article`+`noun` compose the description
("an elf", "an orc") and `traitPhrase` is the visible-feature fragment the
describer appends (e.g. elf → "with pointed ears and angular features").
Entries: `human` (traitPhrase '' — today's behavior), `elf`, `orc`, `dwarf`,
`tiefling`, `vampire`, `fae`, `catfolk`, `wolffolk`, `dragonborn`.
`artPhrase` is the art-actor variant ("an elven woman", "a catfolk woman"…).

`IMAGE_STYLES` (18): each `{ id, label, blurb, suffix }` where suffix is a
comma-prefixed prompt phrase. Example entries: `anime` (today's default look:
"anime-inspired illustration, clean linework, soft shading"), `photoreal`,
`watercolor`, `oilPainting`, `noir` (b/w, hard shadows), `ghibli` (hand-
drawn, warm flat colors), `pixel`, `3dRender`, `lineart`, `pastel`,
`synthwave`, `vintage`, `minimalist`, `inkWash`, `claymation`, `dramatic`
(cinematic HDR), `sketch`, `custom` sentinel. `'none'` = no suffix.

`COLOR_THEMES` (14): each `{ id, label, group, blurb, vars }` where `vars`
maps the `:root` token names (`--color-bg`, `--color-surface`,
`--color-surface-alt`, `--color-surface-hover`, `--color-border`,
`--color-border-strong`, `--color-text`, `--color-text-dim`,
`--color-text-faint`, `--color-accent`, `--color-accent-hover`,
`--color-accent-dim`, `--color-warm`, `--color-cool`, `--color-positive`,
`--color-negative`, `--color-desire`, `--color-warning`, `--color-shadow`,
`--color-overlay`, `--color-card`). `midnight` reproduces today's values
exactly.

### The tabbed settings config (defs.settings.js)
Data-driven so a phase adds rows, never renderer code:
```js
SETTINGS_TABS = [ {
  id: 'general', label: 'General', icon: '⚙️',
  sections: [ { title: 'Play', rows: [ /* { id, kind:'toggle'|'cycle'|'sliders'|'grid'|'button'|'text', action, ... } */ ] } ],
}, { id:'population', ... }, { id:'images', ... }, { id:'appearance', ... }, { id:'data', ... } ];
```
The renderer (`menu.js`) builds the rail + panes from this; the filter box
matches across `label`/`desc`/tab and shows the tab each hit belongs to.
The Population pane mirrors the office-clicker HR pattern: a **Gender
Diversity** slider grid (5 identities) and a **Race & Species** slider grid
(`RACES`), each with typed % inputs, live normalization, a total-100 readout,
and a ⚠ warning when the total leaves 100, plus the pairing allowlist
section.

## Implementation phases

### Phase 1 — Settings foundation (schema, store, migration, helpers)
**Goal:** `kv.menu` 'settings' is the one source of truth, migrated from the
old keys, with pure helpers every later phase consumes. No UI yet.
**Files:**
- `src/srcfiles/defs.settings.js`: `SETTINGS_DEFAULTS`, `SETTINGS_TABS`
  skeleton (five tabs, empty sections), `AUTOSAVE_INTERVALS`, `TEXT_SIZES`,
  `SPEED_PRESETS`. `RACES` lands in Phase 5, `IMAGE_STYLES` in Phase 7,
  `COLOR_THEMES` in Phase 8 — keep the tables in this file so the schema is
  one place.
- `src/srcfiles/settings.js`: `loadSettings()` (migrate + merge),
  `setSettings(patch)` (cache + persist), `settingsCache` module state,
  `autosaveIntervalMs()`, `isSfwMode()`, `textScaleFactor()`, `currentSpeed()/
  setSpeed()` (session-local), `activeImageStyle()`, `applySfwMode(gs)`
  (patches `gs.meta.contentConfig.contentFlags.mature`). Distribution
  samplers (`genderDistSampler`, `raceDistSampler`) land in Phase 5 with the
  tables they sample.
- `index.html`: two new `<script>` tags — `defs.settings.js` right after
  `config.js`, `settings.js` after it and before `state.js` (state.js calls
  `autosaveIntervalMs` at runtime only, but keep load order tidy); bump
  `?v=` on every touched file.
- `src/srcfiles/ui.js`: call `loadSettings()` once at boot before first
  render (guard — menu.js's `showMainMenu` may run first at boot).
- `src/dev/verify/loadgame.js`: add both files to the `ORDER` array in the
  same commit (a missed file silently drops assertions).
**Verification:** `browser_eval` — write a legacy `kv.menu` 'options'+
'prefs' pair, run `loadSettings`, assert every migrated field (including the
'prefs'.actorGenders → `genderDist` mapping and the `raceDist` default);
round-trip `setSettings`; assert the helpers return what was stored.

### Phase 2 — Tabbed settings UI (rail, filter, rows, origin-tracked back)
**Goal:** `#menu-settings-screen` renders from `SETTINGS_TABS`; navigation is
fast; every rendered row already resolves to a real action.
**Files:**
- `index.html`: `#menu-settings-screen` sub-screen inside `#main-menu`
  (sibling of `#menu-options-screen`), `#settings-tab-rail`,
  `#settings-filter-input`, `#settings-panes`, `.settings-layout` CSS (left
  rail + content pane, scrollable), row/pill/swatch CSS. Boot options row
  gains a "Cast & more settings…" button opening the screen on a tab.
- `src/srcfiles/menu.js`: `openSettingsScreen(tab)` (records origin:
  `'boot'|'pause'`), `renderSettingsUi()`, tab switching, filter box
  handling (event, not data-action), Back/Esc honoring origin,
  `rememberSettingsTab()`. `doMenuOpenOptions` becomes context-aware:
  pause → `openSettingsScreen(lastTab)`, boot → existing options row.
- `src/srcfiles/ui.js`: new actions in `MENU_ACTIONS` + dispatch:
  `'settings.tab'`, `'settings.back'`, `'settings.open'` (with `extra.tab`).
- `src/srcfiles/defs.settings.js`: General tab rows that are already real —
  Autosave (toggle → `settings.autosave`, re-points `doToggleAutosave`/
  `isAutosaveEnabled` off the retired 'options' key, re-arms a live timer)
  and Autosave interval (cycle → `settings.autosaveInterval`; persists here,
  the timer honors it in Phase 4). Population/Images/Appearance/Data panes
  render their (empty) section headers only.
**Verification:** from boot and from pause, open settings; switch tabs; the
filter narrows across tabs and jumps on click; Back lands on the origin;
Esc closes; every rendered row's action id exists in `MENU_ACTIONS`
(`browser_eval` cross-check); the Autosave toggle writes `settings.autosave`
and re-arms a live timer, and the interval persists for Phase 4.

### Phase 3 — Pause menu
**Goal:** the header Menu button opens a real pause screen; Save/Load/
Options/Discord/Quit to Menu all work; the clock is frozen; the title
gallery does not run behind it.
**Files:**
- `index.html`: `#menu-pause-screen` sub-screen — "Paused" heading +
  `#pause-clock` (day/time), buttons: Resume (`menu.resume`), Save
  (`save`), Load (`load-menu`), Options (`menu.options`), Discord anchor,
  Quit to Menu (`menu.exit`).
- `src/srcfiles/menu.js`: `showMainMenu('pause')` shows the pause screen,
  skips `initTitleGallery()` for the pause context, stops any running
  auto-cycle; `showMainMenu('boot')` keeps the gallery. Title screen drops
  its pause-only Resume button.
- `src/srcfiles/ui.js`: the `'menu'` action and dispatch already route
  through `showMainMenu('pause')` — verify `closeMainMenu` still stops the
  slideshow; `doExitGame`'s pause branch is the Quit to Menu path (no
  change needed beyond label).
**Verification:** Menu → pause overlay with the game dimmed behind it and NO
gallery/slideshow (vision check); clock frozen while open, resumes on
Resume; Save opens the slot grid above the menu and saves; Load opens load
mode and confirms before loading then resumes; Quit to Menu exit-saves and
returns to boot; Escape closes; boot menu unchanged (gallery still spins).

### Phase 4 — General tab: autosave interval, SFW mode, text size
**Goal:** every General row has a live effect; SFW mode flips the existing
content pipeline.
**Files:**
- `src/srcfiles/state.js`: `AUTOSAVE_MS` becomes a runtime read
  (`autosaveIntervalMs()`); `startAutosave` uses it.
- `src/srcfiles/settings.js`: `setSettings` re-arms a live autosave timer
  when `autosave`/`autosaveInterval` changes and a game is active.
- `src/srcfiles/settings.js` + `src/srcfiles/ui.js`: `applySfwMode` wiring —
  toggle sets `settings.sfwMode` and patches `currentGameState.meta.
  contentConfig.contentFlags.mature` immediately; apply in
  `resumeFromRecord` (after restore) and in `approveCastAndStartGame`
  (on `pendingCast.contentConfig`). Boot gallery: `menuContentConfig`
  (image.js:609) falls back to settings when there is no game.
- `index.html`: `data-text-scale` on `<html>` + `[data-text-scale=…]`
  overrides for the high-impact text families (tokenize the handful of
  `font-size` declarations, scale via a `--text-scale` calc); move Autosave
  off the boot options row.
- `src/srcfiles/defs.settings.js`: General rows — SFW mode (toggle),
  Text size (cycle), Autosave, Autosave interval.
**Verification:** SFW on → `browser_eval` checks: `menuRatingCap` caps at
'sfw'; a generated LLM prompt contains the mature-off directive ("non-
explicit"); `intimateAllowed(gs)` is false; `activeContentFlags(gs).mature`
false and the adult site is gated; then a save→load round-trip preserves it.
Text size: vision-check a scene and the menus at small/large — text scales,
layout does not. Interval: set 10m, wait for a boundary save, assert the
timer period.

### Phase 5 — Population tab: gender + race distribution editor, art-actor wiring
**Goal:** the Population pane (gender sliders over the five cast identities +
race sliders over `RACES` + pairing allowlist) persists to settings, and the
background-art actor pool is the first live consumer — with `raceDist` at
human-100%, art output is byte-identical to today.
**Files:**
- `src/srcfiles/defs.settings.js`: `RACES` (10-entry starter pool, D13
  shape), Population tab config (two slider grids + pairings, office-clicker
  HR pattern: typed % inputs, live normalization, total-100 + ⚠ warning).
- `src/srcfiles/settings.js`: `genderDistSampler()` / `raceDistSampler()`
  (proportional picks from the settings distributions), `identityToArtTag()`
  (D14 mapping), `raceArtPhrase(species)`.
- `src/srcfiles/defs.menu.js`: `chooseActorGenders`/`rollActors` draw from
  `genderDistSampler()` → `identityToArtTag()`; non-human rolls append
  `raceArtPhrase` to the actor description; `pairingGenders` reads
  `settings.pairings`; retire `normalizePreferences`/`MENU_PREFERENCES_DEFAULTS`
  reads (keep a migration shim from Phase 1).
- `src/srcfiles/ui.js`: `'set.population-dist'` action (axis set → normalize
  → `setSettings`); drop `prefs.*` actions from `MENU_ACTIONS`.
- `src/srcfiles/menu.js`: remove the six toggle rows from the boot options
  screen (replaced in Phase 2 by the "Cast & more settings…" entry).
**Verification:** distribution `{female:100,…}` → every art actor is
female-presenting; `raceDist {human:50, elf:50}` → ~half the art actors carry
an elf descriptor and the rest none; sliders never leave 100% (typed-input
warning); `raceDist {human:100}` reproduces today's art exactly (no
descriptors); old `prefs.*` actions are gone from the DOM and `MENU_ACTIONS`.

### Phase 6 — Population → the world: all cast generation + species schema
**Goal:** `rollGender` reads the settings distribution and `rollSpecies` is
live across every cast generation source — the apartment cast at new game,
Hot Singles, maid/escorts/friends-of-friends/contractors/food drivers,
applicants — with `bible.species` on the schema and the describer emitting
race phrases. Del and other authored NPCs are untouched.
**Files:**
- `src/srcfiles/sim.js`: `rollGender` reads `settings.genderDist` (fallback
  `CHAR_GEN.genderWeights` when unset); new `rollSpecies(rng)` reads
  `settings.raceDist`; `rollCastSlot` appends the species draw at the END of
  the per-character sequence (after the existing field draws, `partial.
  species` override, default 'human') → `bible.species`.
- `src/srcfiles/config.js`: `CHARACTER_SCHEMA.bible.species` —
  `{ type:'string', required:false, default:'human', enum: RACES ids }`.
- `src/srcfiles/computer.js`: thread `species` (same append-at-end rule) into
  the stub / Hot Single / friend / applicant generation sites (the
  `rollGender`+`rollAge` clusters at :1180, :2444, :2556 and the `rollCastSlot`
  callers :1290, :1374, :1593).
- `src/srcfiles/npc.js`: `getPhysicalDescriptionForPrompt` prepends the race
  article+noun and appends `traitPhrase` for non-human species.
- `src/srcfiles/state.js`: save migration backfills `bible.species`='human'
  for existing NPCs (same pattern as the `physical.facialHair` backfill).
- **Determinism rule:** every new draw (species) is APPENDED at the end of
  its sequence, never inserted mid-stream — inserting mid-stream shifts every
  existing seed's cast. With default settings (human 100%), a given seed must
  produce the same cast it did before this overhaul.
**Verification:** with defaults, a new game's cast is byte-identical to
pre-overhaul for the same seed (draw-order preservation); bump `raceDist`
{human:50, elf:50} → a new external NPC (Hot Single / visit / applicant)
carries `bible.species` and its description names the race; Del's bible and
description are unchanged; an old save loads with human backfill; changing
the distribution mid-save never re-rolls living NPCs; a player-authored
`partial.species` pins the species.

### Phase 7 — Images tab: style presets + Custom + clear cache
**Goal:** every generated image carries the active style; changing it makes
fresh frames, not stale-cached ones.
**Files:**
- `src/srcfiles/defs.settings.js`: `IMAGE_STYLES` (18 + `custom` sentinel) +
  Images tab config (style grid, Custom text field, Clear cached images).
- `src/srcfiles/image.js`: `applyImageStyle(prompt)` helper (appends the
  active style's suffix or the custom text); call it at every
  `root.generateImage` site (portrait, scene, character, peek, photo, menu
  slideshow ~:792). Fold the style id into every cache key: `composeSceneKey`,
  `composeCharKey`, `composePeekKey`, the player-portrait key, photo keys,
  and the menu ring/`MENU_SLIDESHOW` keys. Never disturb seeds.
- `src/srcfiles/settings.js`: `clearImageCache()` (wipe the image LRU's kv
  folder + menu ring blobs), confirm in ui.
**Verification:** style `noir` → `applyImageStyle(buildImagePrompt(...))`
ends with the noir suffix; cache keys change vs 'none'; an already-cached
scene from the previous style is not served; Custom text appends verbatim;
flipping styles twice yields identical prompts for the same seed
(determinism); Clear cached images empties the folder.

### Phase 8 — Appearance tab: color themes
**Goal:** 14 themes re-skin the UI chrome and persist; imagery is untouched.
**Files:**
- `src/srcfiles/defs.settings.js`: `COLOR_THEMES` (14, D10 groups),
  Appearance tab config (theme grid with swatches + blurb).
- `index.html`: `[data-theme="…"]` rule-sets in the tokens `<style>` (or a
  sibling block); `midnight` = today's values.
- `src/srcfiles/settings.js`: `applyTheme()` sets `data-theme` on
  `document.documentElement`; `setSettings` applies on change + on boot.
  "Match System" = a `@media (prefers-color-scheme)` palette with no
  explicit values.
**Verification:** each theme applies (browser_eval reads computed `--color-
bg`), persists across reload, and the scene canvas/image colors are
unchanged; spot-check contrast on High Contrast / Sepia / one colour-blind-
safe palette; themes coexist with text size.

### Phase 9 — Data tab: export/import, reset, storage insight
**Goal:** players can see and control their data.
**Files:**
- `src/srcfiles/defs.settings.js`: Data tab config — Export a save (opens
  the save panel), Import (opens `openImportModal`), Reset all data,
  Storage insight readout.
- `src/srcfiles/settings.js`: `storageSummary()` (iterate the kv folders —
  saves index/slots, image cache entries, settings — return counts +
  approximate bytes); `resetAllData()` (delete saves + images + settings
  keys, then boot).
- `src/srcfiles/ui.js`: `'set.export-save'`, `'set.import-save'`,
  `'data.reset'` (confirm modal), `'data.storage'` refresh; `MENU_ACTIONS`
  additions.
**Verification:** counts match reality (a save + a few cached images +
settings present); export→import round-trips through a slot; Reset shows the
confirm, wipes, and boots clean with defaults restored.

### Phase 10 — Game-speed HUD (x0/x1/x20/x100)
**Goal:** the header clock row has speed controls; time dilates by the
multiplier; discrete actions and sleep are unaffected.
**Files:**
- `index.html`: `#hdr-speed` cluster beside the status group — four buttons
  `data-action="speed.set"` with `extra.id`.
- `src/srcfiles/settings.js`: `currentSpeed()/setSpeed(id)` (session-local,
  D12).
- `src/srcfiles/time.js`: `clockFrame` multiplies the resolved context scale
  by the current speed multiplier (x0 → 0). The sim-checkpoint accumulator
  already runs off accumulated game-minutes — no change needed there.
- `src/srcfiles/render.js`: `renderHeader` highlights the active speed
  (data-attr).
- `src/srcfiles/ui.js`: `'speed.set'` action + `MENU_ACTIONS` entry.
**Verification:** at x100 (multiplier 5 over the idle 20x = 100 game-sec/
real-sec), ~30 game-minutes accrue in ~18 real seconds and a sim checkpoint
fires; at x0 the clock freezes but chips stay interactive; a conversation
still crawls (multiplier applies over the 1/60 context scale); a discrete
action (sleep) lands on the same minute-exact target as before; reload
resets to x20.

## Status
| Phase | Status | What it does |
|---|---|---|
| 1 | Done | Settings schema + kv.menu 'settings' store + migration + helpers |
| 2 | Done | Tabbed settings UI: rail, filter, rows, origin-tracked back |
| 3 | Done | Real pause menu (Resume/Save/Load/Options/Discord/Quit to Menu) |
| 4 | Done | General tab: autosave interval, SFW mode, text size |
| 5 | Done | Population tab: gender + race distribution editor, art-actor wiring |
| 6 | Done | Population → world: rollGender reads genderDist, rollSpecies live everywhere, bible.species + describer + migration |
| 7 | Done | Images tab: 18 styles + Custom + clear cache |
| 8 | Done | Appearance tab: 14 color themes |
| 9 | Done | Data tab: export/import, reset all data, storage insight |
| 10 | Done | Game-speed HUD x0/x1/x20/x100 |

## Dependency order
```
Phase 1 (settings foundation) ──► 2 (UI shell) ──► 4, 7, 8, 9 (independent tabs)
        └─► 3 (pause menu; needs 2 for its Options wiring) ──► any tab phase
Phase 5 (population tab) ──► 6 (population → world; consumes raceDist/RACES)
Phase 10 (speed HUD) ──► needs 1 (SPEED_PRESETS) only — can slot anywhere after
```
Phases 4, 7, 8, 9 are independent of each other once 2 lands. Phase 3 only
needs the settings screen to be reachable from the pause menu (Phase 2); its
Resume/Save/Load/Quit parts don't depend on the tabs. Phase 6 must come after
Phase 5 (it consumes `settings.raceDist` + the `RACES` table) and before the
world starts generating non-human NPCs.

## Open questions (parked, none blocking)
- **Add a non-binary identity to the cast taxonomy?** The 'nb' entries in
  `PROMPT_V2.detail.actor` go dormant once art actors are driven by the
  five-identity cast roll (D14). Adding 'nb' to `bible.gender`/names/
  studio/describer is a separate decision — decide during Phase 6 if the user
  asks.
- **Per-race name pools?** Phase 6 shares the human name pools across races;
  fantasy-flavoured name pools are a standing content lever (a data edit in
  `RACES`, not a feature).
- **Species picker in the Player Design studio?** The distribution governs
  NPCs; the player character has no species field. Parked unless the user
  wants a playable elf/dragonborn.
- **Persist the game-speed selection across reloads?** Default is
  session-local. Promote during Phase 10 if the user wants it remembered.
- ~~Which text components stop scaling?~~ **Decided in Phase 4 → D17.**

## Design invariants
1. **Every settings control has a live consumer.** The user's standing rule:
   an option that reads kv but has no effect is cut. The `SETTINGS_TABS`
   renderer and `MENU_ACTIONS` must never diverge — a row whose action id is
   not in `MENU_ACTIONS` is a bug (Phase 2's verification checks it).
2. **`kv.menu` 'settings' is the single schema.** Never persist settings
   keys in two places. The old 'options'/'prefs' split drifted silently for
   exactly this reason; the migration is one-way, and the old keys are
   retired after first load.
3. **Settings are browser-local, never save fields.** `kv.menu` stays out of
   `SAVE_KEYS`. The only exception is D5's SFW flag, which patches
   `meta.contentConfig` — and only because that field is *already* a save
   field every consumer reads.
4. **Determinism.** Settings must never consume RNG or reorder a seed draw.
   Every draw this plan adds (the species roll) is **appended at the END of
   its sequence, never inserted mid-stream** — inserting mid-stream shifts
   every existing seed's cast. Style/theme/cast-dist are prompt- and data-
   layer changes only; per-character seeds are untouched. "Same seed, same
   house" still holds.
5. **Authored NPCs are exempt.** Del Connors (and any future hand-authored
   cast) is never touched by the population distribution — authored NPCs
   never pass through the roll path, and `partial.species` pins an authored
   species explicitly.
6. **Prompt-affecting settings must fold into image cache keys.** A style or
   cast change that serves stale cached frames is a correctness bug, not a
   cosmetic one (D9).
7. **Register every file change in both places.** `index.html`'s `?v=`
   cache-busters bump on every changed/new srcfile, and
   `src/dev/verify/loadgame.js`'s `ORDER` array lists every file the page
   loads — in the same commit (a real prior incident silently dropped 175
   assertions).
