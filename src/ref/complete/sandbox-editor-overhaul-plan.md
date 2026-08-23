# Sandbox Pre-Game Editor Overhaul

Status: **complete — all 6 phases built and browser-verified.** Design
session complete 2026-08-23; all decisions locked. Implementation session
2026-08-23 (same day): all 6 phases built end-to-end in one session and
verified live in the Browser pane against `dev-harness.html` (see the
Handoff section for exactly what was checked and the small number of
in-implementation deviations from the original phase text).
Last updated 2026-08-23.

Companions:
- `src/ref/complete/seasonal-calendar-and-sandbox-plan.md` (built the sandbox
  mode this plan is rewriting the SHELL of — Part B, phases B4/B5/B6. Every
  field this plan touches — `pendingSandboxConfig`, the roommate `partial`
  shape, `SANDBOX_HOUSE_PRESETS`, `applySandboxPreset` — was authored there.
  This plan does not change what any of those mean, only how they're edited).
- `src/ref/complete/settings-and-pause-overhaul-plan.md` (built the tabbed
  settings screen — `SETTINGS_TABS`, the rail nav, the data-driven
  section→row renderer — that this plan's new tab shell is modeled on. D1
  below explains exactly what's reused and what's new).
- `src/ref/complete/player-creation-and-intro-plan.md` (built the Player
  Design studio — `PLAYER_STUDIO_TABS`, `openStudio`/`renderPlayerStudio` —
  that this plan deliberately does NOT reimplement. D2 keeps it as the
  appearance-editing layer, launched from both the Player tab and each
  roommate's card, exactly as sandbox mode already does today).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** Nothing — all 6 phases are built and verified, and a
post-implementation audit (same day) has been done and its findings fixed.
This document is now historical/reference; if a future session touches this
screen again, treat it as maintenance on a finished feature, not a
resumption of WIP.

### Post-implementation audit (2026-08-23)

**The headline finding: two of the four Economy fields were inert.**
`cfg.economy.rentGraceDays` and `cfg.economy.billsStartDay` were written by
the new UI and read by NOTHING. `applySandboxPreset`'s step 6 only ever
consumed `money`/`taxReserve`; the engine took the other two from the global
`ECONOMY.opening.*` constants (`sim.js`'s player factory and
`initBillState`). Confirmed by starting a real game on **Tight** (grace 7,
bills day 3) and getting rent due day **15** and first utility day **19** —
the untouched global defaults.

This contradicted this plan's own Phase 4 goal sentence ("four working
fields... all consumed unchanged by `applySandboxPreset` (D10)"). That
sentence was simply wrong: B4 authored all four fields into
`defaultSandboxConfig` speculatively, and the engine only ever grew
consumption for two of them. Note that Phase 4's *verification* text names
only `player.money`/`world.taxes.reserve` — so following the plan's
verification literally could not have caught this. It didn't.

**Why the fix is NOT in `applySandboxPreset`.** The obvious fix — write
`player.rentDueDay` / `world.bills[id].dueDay` in step 6 — is precisely what
D19's guard forbids: `snapshotSandboxDayFields` captures exactly those
fields before step 1 and throws if step 6 moved them. Making that fix would
have thrown on **every** sandbox start.

D19's actual objection is to *rebasing* a day stamp the factory already
made (which opens the game on retroactively-overdue bills). It has no
quarrel with the factory *generating a different opening in the first
place*. So the wiring went in one seam earlier:

- `SIM_generateHouse(seed, residentCount, partials, playerDraft, economyCfg)`
  — new optional 5th param, threaded to `buildGameState`, which resolves
  `openingGraceDays` / `openingBillDelay` once and feeds them to the player
  factory and to `initBillState(graceDays, billDelay)` (both params
  optional, both defaulting to `ECONOMY`'s numbers).
- `startSandboxGame` passes `cfg.economy`; the three non-sandbox callers
  pass nothing and are byte-identical to before.
- **D19 was not amended and its guard was not weakened** — it now passes
  because nothing is rebased, which is the outcome it was written to
  produce.
- Both values are floored (`grace >= 1`, `delay >= 0`) so no authored
  opening can put a bill on day 1 — the "wall of bills" state D19 names.
- The per-utility stagger is shifted wholesale, never rescaled, so the
  calendar plan's D6 spread ("do not tidy these onto day 35") survives.

Verified after: Tight now yields rent day 8 / internet day 14 with the
stagger intact and no D19 throw; **Standard** and a no-config solo start
produce byte-identical day fields to the pre-fix defaults (rent 15,
internet 19, electric 21, water 25, gas 29, phone 35, insurance 37);
`verify-cal-p1..p4` stayed at 0 failures and `verify-sbx-p1/p2/p3/p7` at
their unchanged pre-existing counts.

**Three smaller fixes, same audit:**

1. **Generic `number` rows didn't clamp.** `min`/`max` on a number input
   only constrain the spinner — typed values bypass them entirely, and the
   write path did a bare `Number(el.value)`. An authored `money:
   999999999` or `taxReserve: -5000` reached `player.money` /
   `world.taxes.reserve` verbatim. Now clamped to the row's declared bounds,
   read off the element so there is no second source of truth. (The two
   pre-existing numeric paths in the same file — roommate age and facility
   condition — both already clamped; the generic path was the odd one out.)
2. **A cleared number box silently wrote 0**, because `Number('') === 0` —
   the field looked empty while the config said 0, and for `economy.money`
   that 0 reached the started game. Now a mid-edit (`input`) empty leaves
   the config alone and a settled (`change`) empty repaints the box from the
   config, so field and config can never disagree.
3. **`refreshSandboxPresetRow` used an unscoped
   `document.querySelector('.sbx-preset-row')`**, which also matches the
   House Layout starting-condition picker (it reuses that class) — firing it
   while House was on screen appended a stray "Custom" chip to the house
   picker. The difficulty row now carries its own `.sbx-difficulty-row`
   marker class and the lookup targets that. This was unreachable in
   practice today (generic dot-path fields only render on Economy) but was a
   live landmine for exactly the case D5 anticipates: a generic row landing
   on House Layout.

**Noted, deliberately not fixed** (all pre-existing or cosmetic):

- The Room/Bed pickers render **two** empty options — `sbxSelectControl`
  always prepends its own "—" roll option, and `roomOptions[0]` is already
  `{value:'', label:'First free room'}`. Inherited verbatim from B5 and
  moved unchanged into `renderSandboxRoommatePlacement`; visible in the UI.
- **Dead generic infrastructure:** the `toggle`, `text`, `select` and
  `button` row kinds and the `sandbox.row-toggle` verb are implemented and
  work, but nothing ships that uses them — only `presetRow`/`number`/
  `slider` appear in `SANDBOX_TABS`. D5 mandated `toggle`, but D6 kept the
  structural toggles bespoke, so it never found a consumer.
- **Escape does not close the sandbox screen**, though it now looks and
  behaves exactly like the settings overlay, where Escape does close. Not a
  regression (identical to pre-overhaul), but the visual promotion makes the
  inconsistency newly noticeable.
- `renderSandboxScreen` and `renderSandboxHousePanel` remain as guarded
  dormant no-ops (~30 lines). Kept deliberately; worth a decision rather
  than letting them drift.

**Implementation session (2026-08-23, same day as the design session):** All
six phases were built and browser-verified in one sitting, in phase order,
each phase syntax-checked (`node --check`) and exercised live against
`dev-harness.html` (form fills, button clicks, and direct state assertions
via the browser's JS console) before moving to the next. The existing
sandbox data-model harnesses (`dev/verify/verify-sbx-p1/p2/p3/p7.js`) were
re-run after every phase touching House/Roommates data flow and showed the
same pass/fail counts throughout (1 pre-existing failure each in p1/p3/p7,
none in p2 — all in `sim.js`/`llm.js` code this plan never touches; not
investigated further, out of scope). A full Start-Sandbox smoke test at the
end (one authored roommate — name, an authored appearance field, room
placement, a non-default economy value) confirmed the whole pipeline still
lands correctly in the started game's NPC bible and player state.

Deviations from the phase text, all discovered while implementing rather
than at design time:

- **D11's `.sbx-badge` wiring and `MENU_ACTIONS` dedup landed in Phase 1,
  not Phase 2.** The plan assigned both to Phase 2 (the House-migration
  phase), but the `MENU_ACTIONS`/`ENERGY_GATE_EXEMPT` block was already open
  for the new `sandbox.tab`/`sandbox.subtab`/`sandbox.row-toggle` verbs in
  Phase 1, so the dedup fix landed there instead — harmless, same fix either
  way. `.sbx-badge` itself landed in Phase 6 as originally planned (a
  roommate's authored occupation-category chip on the rail card).
- **The generic `toggle`/`slider` row kinds route through the EXISTING
  `wireSandboxConfigInputs` delegated listener, not a new one**, by adding
  one branch at the top of its `handle()`: a `data-sbx-field` value with no
  `|` is a bare dot-path against `pendingSandboxConfig` directly
  (`getSandboxValue`/`setSandboxValue`); one WITH `|` is the pre-existing
  `<roommateIndex>|<path>` convention. This is what Phase 4's own file-list
  text ("`wireSandboxConfigInputs` gains the four new
  `data-sbx-field="economy.<key>"` paths... a new branch alongside the
  roommate one") describes — Phase 1 just built that branch pre-emptively
  since `toggle`/`slider` needed it too, ahead of Economy actually shipping
  real fields through it. `toggle` itself (a button, not a form input)
  routes through the ordinary `data-action` click chain instead
  (`sandbox.row-toggle` + `doSandboxRowToggle`), same as every other button
  in this screen — the row-kind CONTRACT comment's "via the same...
  dispatcher `wireSandboxConfigInputs` already owns" reads as approximate
  rather than literal for a button-shaped kind.
- **`SANDBOX_DIFFICULTY_PRESETS`' exact numbers** (the Open Question this
  plan explicitly parked): `comfortable: {money: 6000, rentGraceDays: 21,
  billsStartDay: 14, taxReserve: 500}`, `standard` = `defaultSandboxConfig`'s
  existing numbers verbatim (so a fresh config shows "Standard" selected,
  never "Custom"), `tight: {money: 2200, rentGraceDays: 7, billsStartDay: 3,
  taxReserve: 0}`. Comfortable ≈1.6× starting money with a longer grace
  period and a funded tax reserve; Tight ≈0.6× money with half the grace
  period and bills landing almost immediately.
- **`sandbox.roommate-toggle`'s replacement** (the plan's other explicit Open
  Question): retired outright rather than reused. `sandbox.roommate-select`
  is a new verb with rail-select semantics (`data-index` of the roommate to
  open, or `-1` for "back to rail"); nothing dispatches the old id any more,
  and it was removed from `MENU_ACTIONS`/`ENERGY_GATE_EXEMPT`/`handleAction`
  rather than left wired to dead code.
- **A latent reorder bug, found and fixed while porting `sbxExpandedRoommate`
  bookkeeping to `sandboxActiveRoommate`** (the Phase 5 "top-of-phase
  blocker" the plan flagged as needing care): the OLD `doSandboxRoommateMove`
  only followed the MOVED roommate's expanded state
  (`sbxExpandedRoommate === index → target`), never the DISPLACED one's. A
  ±1 move via `splice(index,1)` + `splice(target,0,r)` is a true two-element
  swap, so if the adjacent roommate (the one your ▲/▼ click displaces, not
  the one you clicked it on) had their detail view open, the old code left
  the expanded-state pointer on the now-vacated index — silently showing the
  WRONG person's form as "open." Fixed in the new `doSandboxRoommateMove` by
  checking both `index` and `target` against `sandboxActiveRoommate` and
  swapping either way; browser-verified directly (see Phase 5 in the
  now-archived implementation transcript). This bug never shipped in a
  released build — it was still in the same uncommitted working tree this
  whole plan was authored against.
- **Player and Roommates never got a real "temporary placeholder pane"
  moment.** Phase 1 built the placeholder-dispatch branch as specified, but
  Phases 3 and 5 ran in the same session immediately after, so the
  placeholder was never actually reachable in a real user session between
  phases — noted only because a future skim of the Phase 1 file-changes text
  might expect to find it still live.

**Last session's notes (design session, 2026-08-23 — no code written):**

A dedicated research pass mapped the current Sandbox Options screen in full
before any design work started. What it found, worth carrying forward:

- **The whole screen is one function.** `renderSandboxScreen()`
  (`menu.js:348-390`) does a full `body.innerHTML = ''` rebuild on every
  mutation — no sectioning, no tabs, everything in one scrolling
  `46vh`-capped box (`main.html:3267`). There is no existing tab state to
  migrate; this is a from-scratch shell over an unchanged data model.
- **Two tab patterns already exist in this codebase**, and they are NOT the
  same shape. Pattern A (`PLAYER_STUDIO_TABS`, `studio.js:57-152`) is a flat
  array of `{id, label, sections}` — fields only, no row-kind polymorphism,
  filtered per subject kind (`studioTabs()`, `studio.js:326-329`), full
  teardown/rebuild on switch, no sub-tabs. Pattern B (`SETTINGS_TABS`,
  `defs.settings.js:521+`) is `{id, label, icon, sections:[{title,
  rows:[{kind, ...}]}]}` — a left rail, a generic row dispatcher
  (`renderSettingsRow`, `menu.js:1268+`) with six row kinds already
  (`toggle`/`cycle`/`sliders`/`grid`/`button`/`text`), a remembered active
  tab (`settingsActiveTab`, session-scoped, deliberately not persisted —
  `menu.js:26-33`), and a working cross-tab search. **D1 locks in Pattern B**
  as the base to extend — see its rationale.
- **Neither pattern has sub-tabs today.** There is no existing
  `subTab`/`SUB_TAB` convention anywhere in the codebase. The Roommates tab's
  three-level nesting (D3) is new design surface, not a reuse of something
  proven.
- **`Economy` is nearly a stub.** `defaultSandboxConfig()` (`menu.js:313-339`)
  already carries `money`/`rentGraceDays`/`billsStartDay`/`taxReserve`, but
  `renderSandboxScreen` only ever displays ONE of them
  (`sandboxSummaryRow('Starting money', ...)`, `menu.js:388`), read-only —
  `wireSandboxConfigInputs` (`menu.js:896-993`) has no field path for any of
  the four. This is exactly the gap "difficulty tags, sliders" fills (D7).
- **No "difficulty" concept exists anywhere in the game** (confirmed by a
  full-repo grep — the two hits are unrelated tuning comments). The
  difficulty-preset system (D7/D8) is being designed from nothing, not
  extracted from something half-built.
- **The roommate cap is 7** (`menu.js:373`, `cfg.roommates.length >= 7`
  disables Add). The roommate `partial` shape (rollCastSlot-authoring
  surface) is documented in full in the Data model section below — every
  field in it must survive the redesign; none of it changes shape.
- **Two small pre-existing bugs were found**, unrelated to any of this but
  worth fixing while this code is already open (D11): `MENU_ACTIONS`
  (`ui.js:3163-3168`) lists `sandbox.house-preset`/`sandbox.house-structural`
  TWICE (lines 3167-3168 duplicate verbatim); `ENERGY_GATE_EXEMPT`
  (`ui.js:3249-3252`) lists the other nine sandbox verbs but not those same
  two — harmless pre-game (no live energy gate exists yet), but worth
  correcting for consistency.
- **`.sbx-badge`/`.sbx-badge-on` CSS exists with no element ever creating
  one** (`main.html`, in the `.sbx-*` block) — dead CSS from an earlier
  iteration. D11 proposes wiring it to something real (a roommate's rolled
  occupation category / trait badges on the new roommate rail) rather than
  deleting it, since the visual design already anticipated exactly this kind
  of at-a-glance summary chip.

**Blockers / flagged deviations:** None.

---

## The thesis

Sandbox mode lets a player author every roommate, the apartment's starting
condition, and (nominally) the economy by hand before a game begins — the
same authoring power "New Game" gives you for your own character, extended to
the whole household and the flat. But the screen that exposes it hasn't grown
to match: it is one 400-line render function producing one scrolling list,
where a 7-roommate household with every field touched is a multi-thousand-
pixel scroll through identity fields, five sliders, five prose pickers, and a
room picker per person, with the house and (barely-wired) economy tacked on
at the bottom.

The player already knows what a better version of this looks like, because
the game already has one: character creation. `PLAYER_STUDIO_TABS` gives the
player's OWN appearance a real tabbed editor — identity, body, face, marks,
style, intimate, portrait, each its own pane, switchable without losing your
place. Sandbox mode reuses that studio for appearance today (`Design`
buttons, both for the player and per roommate) but wraps it in a screen that
has none of its own organization. The mismatch is the problem: the part of
sandbox mode that already feels like character creation is the part it
launches OUT to; the part that doesn't is the 90% of the screen you actually
scroll through.

This plan gives the OUTER shell the same treatment: a real tabbed (and, for
Roommates, sub-tabbed) editor — Player / Roommates / House / Economy —
built on the data-driven tab system this game already shipped once
(`SETTINGS_TABS`), not a new one invented from scratch. Economy stops being a
read-only line and becomes the difficulty system sandbox mode has never had:
named presets over sliders that already exist in the data model and have
simply never had UI.

### What this plan is *not*

- **Not a rewrite of the appearance studio.** `PLAYER_STUDIO_TABS` and
  `openStudio` are complete, proven, and untouched. D2 keeps every "Design"
  launch point exactly as it is today — this plan owns the shell around it,
  never the studio itself.
- **Not a data-model change.** `pendingSandboxConfig`'s shape, the roommate
  `partial` object, `SANDBOX_HOUSE_PRESETS`, `STRUCTURAL_UPGRADES`, and
  `applySandboxPreset`/`startSandboxGame`'s consumption of all of it are
  UNCHANGED (D10). Every field means exactly what it means today; only how
  it's presented and edited changes. A future session should never need to
  touch `sim.js:4864-4975` for anything in this plan.
- **Not a rebalance of the actual difficulty of the game.** The difficulty
  PRESETS this plan adds (D7/D8) are convenience bundles over existing,
  already-tuned economy fields (`ECONOMY.startingMoney`,
  `ECONOMY.opening.rentGraceDays`, etc.) — picking "Tight" moves numbers
  sandbox mode could already reach one field at a time; it does not touch
  `ECONOMY`'s own tuned defaults or the rent curve `economy-and-rent-plan.md`
  owns.
- **Not a start-day or calendar picker.** `applySandboxPreset`'s own D19
  invariant (`sim.js`, the hard guard at the end of the function) throws if
  the calendar moved from `SIM_generateHouse`'s fresh day-1 state — "sandbox
  is always day 1; the advanced thing is the house, never the calendar." This
  plan does not touch that guard or propose a way around it.
- **Not a redesign of the visual language.** The dark violet-black cards,
  gold accent, `Cinzel` section titles — kept. New chrome (a tab rail,
  sub-tab strip, difficulty tag row) is styled to match the existing
  `.sbx-*`/`.settings-*` palette, not to replace it.

---

## Locked decisions

### A. The tab architecture

- **D1 — Extend Pattern B (`SETTINGS_TABS`'s data-driven tab→section→row
  shape), not Pattern A.** Pattern B already separates tab IDENTITY (id,
  label, icon) from CONTENT (sections of rows) as pure data, with a generic
  renderer (`renderSettingsUi`/`renderTabPanes`/`renderSettingsRow`) that
  doesn't know or care what a specific row does beyond its declared `kind` —
  exactly the shape a Player/Roommates/House/Economy split needs. Pattern A's
  tab table is fields-only, has no row-kind polymorphism, and is purpose-built
  for one thing (the appearance editor) that this plan is explicitly not
  touching (D2). Pattern B also already has session-scoped remembered-tab
  state and a rail-nav layout that reads cleanly at the width sandbox mode
  already commits to (`main.html:5607-5626`'s 176px left rail).

- **D2 — Appearance editing (player and every roommate) keeps launching the
  existing studio overlay. It is never reimplemented inline.** The Player
  top-level tab's content is a summary row + a `Design` button, exactly as
  today (`sandboxRowEl('You', ...)`, `menu.js:355-364`); each roommate's
  Identity sub-tab (D3) keeps its own `Design appearance` button
  (`doSandboxRoommateDesign`, `menu.js:1055-1059`). `openStudio`/
  `renderPlayerStudio`/`PLAYER_STUDIO_TABS` are not read, extended, or
  duplicated by this plan. This is deliberate scope control: the studio
  ALREADY IS the "character creation, tabbed" experience the redesign is
  modeled on — reimplementing it inline here would be large, risky, and
  would produce a second, divergent copy of a working system.

- **D3 — Roommates gets THREE levels: top tab → roommate instance → field
  sub-tab.** This is the part of "tabbed and sub-tabbed" that does the real
  work. Selecting the Roommates top-level tab shows a roommate RAIL (a
  vertical list of cards — name, one-line summary, add/remove/reorder
  controls — replacing today's flat stack of expandable accordion cards).
  Selecting one roommate opens a SUB-TAB strip scoped to that roommate:
  - **Identity** — first name, age, gender, species, occupation category,
    the appearance `Design` button (D2).
  - **Personality** — the five temperament sliders (warmth, volatility,
    openness, conscientiousness, assertiveness), each with its existing ×
    reset (`menu.js:751-770`).
  - **Interests & Values** — the three interest selects, the two value
    selects.
  - **Backstory** — the five prose-pool selects (baggage, wound, want, blind
    spot, boundary).
  - **Placement & Prose** — room select, bed select, the Prose
    templated/AI-written toggle (`sbx-skip-row`, currently rendered inline at
    card level, `menu.js:` inside `renderSandboxRoommateCard`).
  Every field keeps its exact `partial.<path>` write target
  (`wireSandboxConfigInputs`, `menu.js:896-993`) — this is a re-grouping of
  existing controls into named panes, not a new field set.

- **D4 — One new table, `SANDBOX_TABS`, structurally modeled on
  `SETTINGS_TABS` with an added optional `subtabs` array per top-level tab
  entry** (used by Roommates; House also uses it per D6). A tab WITHOUT
  `subtabs` renders its `sections`/`rows` directly, exactly like Settings
  does today; a tab WITH `subtabs` renders a second-level strip and delegates
  to the active sub-tab's own `sections`/`rows`. Roommates' per-INSTANCE
  sub-tabs (D3) are a further special case — see the Data model section for
  the exact shape, since "sub-tabs that repeat once per dynamic list item"
  isn't expressible as a static `subtabs` array the way House's two static
  sub-tabs are.

- **D5 — Row kinds: reuse conceptually, add two.** `text`/`number`/`select`
  already exist as bespoke sandbox controls (`sbxTextControl`/
  `sbxNumberControl`/`sbxSelectControl`, `menu.js:847-888`) and are adapted
  into the generic row-dispatch shape (a thin wrapper choosing which
  `sbx*Control` to call based on `row.kind`) rather than rewritten. Two new
  kinds are added because sandbox has never had them: `toggle` (today's
  toggles are faked with `sbxActionBtn` action-buttons that flip state and
  re-render the WHOLE screen — a real toggle row updates its own state and
  re-renders only what needs it) and `slider`/`sliders` (a single slider row,
  and a multi-slider grid adapted from Settings' `renderSliderGrid`/
  `renderSliderRow`, `menu.js:1533-1568+`, but bound to
  `pendingSandboxConfig` instead of `settingsCache` — Economy's four fields
  are exactly this shape). Bespoke, non-generic content (the per-facility
  tier+condition rows, the structural-upgrade toggle list, the roommate
  rail itself) stays as dedicated render functions invoked from within a
  tab or sub-tab's content — the same way Settings' `grid` kind already
  special-cases image-style tiles rather than forcing them through a generic
  row shape that doesn't fit.

- **D6 — House splits into two static sub-tabs: Layout (starting-condition
  preset + the five structural-upgrade toggles) and Facilities (the
  per-room, per-facility tier+condition overrides).** Facilities is already
  the single longest section on the current screen (one row per
  `FACILITY_LIST` entry, grouped by `ROOM_FACILITIES`) and deserves its own
  scroll pane rather than sharing a 46vh box with the much shorter
  preset/structural choices.

### B. Economy & Difficulty (the new functionality)

- **D7 — Economy becomes "Economy & Difficulty," fronted by a difficulty
  PRESET row, with the four existing-but-unwired fields as real controls
  underneath.** The preset row is a set of tag/button choices (e.g.
  Comfortable / Standard / Tight / Custom) rendered the same visual shape as
  the existing house-preset picker (`sbx-preset-row`, `menu.js:472-477`).
  Selecting a named preset stamps `cfg.economy.money`/`.rentGraceDays`/
  `.billsStartDay`/`.taxReserve` to that preset's values and re-renders;
  touching any ONE of the four fields afterward is what flips the picker to
  "Custom" (D8) — there is no separate `cfg.economy.difficulty` flag to keep
  in sync. `money` and `taxReserve` render as `number` rows; `rentGraceDays`
  and `billsStartDay` render as `slider` rows (both are small bounded
  integers — days — that read better as a slider than a bare number input).

- **D8 — "Custom" is computed, never stored.** The active preset shown in
  the UI is derived live: does `cfg.economy` deep-equal any
  `SANDBOX_DIFFICULTY_PRESETS[id]`'s value set? If yes, that preset is
  highlighted; if no, "Custom" is shown (unselectable itself — it's a
  READOUT of "nothing matches," never a button you click). This is the exact
  same non-stored-derivation discipline `SANDBOX_HOUSE_PRESETS`'s own
  `wreck`/`lived_in`/`restored` already keep relative to
  `cfg.house.facilities`'s per-facility override map — precedented in this
  same file, not invented for this plan.

- **D9 — `SANDBOX_DIFFICULTY_PRESETS` is authored data (config.js), same
  shape and same file as `SANDBOX_HOUSE_PRESETS`** (`config.js:2066-2070`) —
  not a hardcoded UI concept living in menu.js. Three presets ship
  (Comfortable/Standard/Tight); "Custom" is the derived fourth state (D8),
  never an entry in the table.

### C. State and cleanup

- **D10 — `pendingSandboxConfig`'s shape, the roommate `partial` object, and
  every existing config-consuming function (`applySandboxPreset`,
  `startSandboxGame`, `wireSandboxConfigInputs`'s field-path contract) are
  UNCHANGED.** This plan is a view-layer rewrite. The "empty deletes" contract
  (an unset field means "roll it") holds for every relocated control exactly
  as it holds today.

- **D11 — Three small, low-risk fixes land alongside the phase that touches
  their code, not as their own phase:** `MENU_ACTIONS`'s duplicate
  `sandbox.house-preset`/`sandbox.house-structural` lines (Phase 2, since
  that's the House-migration phase); `ENERGY_GATE_EXEMPT` gaining those same
  two ids for consistency with the other nine sandbox verbs (Phase 2); and
  `.sbx-badge`/`.sbx-badge-on` either wired to real content (a roommate's
  occupation-category / notable-trait chip on the new roommate rail, Phase 5)
  or, if that reads as clutter once built, deleted in the same phase rather
  than left dead a second time.

- **D12 — Active-tab/sub-tab/instance state is module-level and
  session-scoped, matching `settingsActiveTab`'s own explicit precedent**
  (`menu.js:26-33`: "the settings schema has no tab field and adding one is
  not in the plan"). Three new module vars: `sandboxActiveTab` (top-level id,
  defaults to `'player'`), `sandboxActiveSubtab` (keyed per top-level tab id
  that has static subtabs — House only, per D6), `sandboxActiveRoommate`
  (index into `cfg.roommates`, or `null` when the Roommates tab is on its
  rail view rather than a specific roommate's sub-tabs) plus
  `sandboxRoommateSubtab` (which of the five per-roommate sub-tabs is open,
  shared across roommates rather than per-instance — switching roommates
  keeps you on the same sub-tab, e.g. Personality, the way switching
  Settings tabs keeps the search box's scroll position). None of these are
  written to any persisted store.

---

## Data model

### `SANDBOX_TABS` (Phase 1) — new, config.js

```js
const SANDBOX_TABS = [
  { id: 'player', label: 'Player', icon: '🧍' },              // D2: summary + Design launch only
  { id: 'roommates', label: 'Roommates', icon: '👥',
    // D3/D4: dynamic per-instance sub-tabs, NOT a static `subtabs` array —
    // rendered by dedicated roommate-rail/roommate-subtab logic (Phase 5),
    // this entry exists in the table only for the top-level rail button.
    dynamicInstances: true },
  { id: 'house', label: 'House', icon: '🏠',
    subtabs: [
      { id: 'layout', label: 'Layout', sections: [ /* preset picker row, structural-upgrade toggle rows — D6 */ ] },
      { id: 'facilities', label: 'Facilities', sections: [ /* per-room facility rows — bespoke render, D5 */ ] },
    ] },
  { id: 'economy', label: 'Economy & Difficulty', icon: '💰',
    sections: [
      { title: 'Difficulty', rows: [ { id: 'difficultyPreset', kind: 'presetRow', presets: 'SANDBOX_DIFFICULTY_PRESETS' } ] },
      { title: 'Starting conditions', rows: [
        { id: 'money', kind: 'number', field: 'economy.money', label: 'Starting money', min: 0, max: 20000 },
        { id: 'rentGraceDays', kind: 'slider', field: 'economy.rentGraceDays', label: 'Rent grace period (days)', min: 0, max: 30 },
        { id: 'billsStartDay', kind: 'slider', field: 'economy.billsStartDay', label: 'Bills start (day)', min: 1, max: 30 },
        { id: 'taxReserve', kind: 'number', field: 'economy.taxReserve', label: 'Starting tax reserve', min: 0, max: 20000 },
      ] },
    ] },
];
```

### The per-roommate sub-tab table (Phase 5) — new, menu.js

Not part of `SANDBOX_TABS` (D4's note) because it applies once per
`cfg.roommates[i]`, not once per screen. Same `{id, label, sections, rows}`
shape as a static tab, just re-rendered against whichever `r =
cfg.roommates[sandboxActiveRoommate]` is selected:

```js
const SANDBOX_ROOMMATE_SUBTABS = [
  { id: 'identity', label: 'Identity', sections: [ /* name, age, gender, species, occupation + Design button — D2/D3 */ ] },
  { id: 'personality', label: 'Personality', sections: [ /* the 5 temperament sliders */ ] },
  { id: 'interests', label: 'Interests & Values', sections: [ /* 3 interest selects, 2 value selects */ ] },
  { id: 'backstory', label: 'Backstory', sections: [ /* baggage/wound/want/blindSpot/boundary selects */ ] },
  { id: 'placement', label: 'Placement & Prose', sections: [ /* room, bed, skipProse toggle */ ] },
];
```

### `SANDBOX_DIFFICULTY_PRESETS` (Phase 4) — new, config.js

```js
// Same shape and file as SANDBOX_HOUSE_PRESETS (config.js:2066-2070).
// "Custom" is never an entry — it's the derived state when cfg.economy
// matches none of these (D8).
const SANDBOX_DIFFICULTY_PRESETS = {
  comfortable: { money: /* > ECONOMY.startingMoney */, rentGraceDays: /* generous */, billsStartDay: /* later */, taxReserve: /* > 0 */ },
  standard:    { money: ECONOMY.startingMoney, rentGraceDays: ECONOMY.opening.rentGraceDays, billsStartDay: ECONOMY.opening.firstBillDelay + 1, taxReserve: 0 },
  tight:       { money: /* < ECONOMY.startingMoney */, rentGraceDays: /* short */, billsStartDay: /* sooner */, taxReserve: 0 },
};
```
Exact numeric values are a Phase 4 tuning task, not locked here — see Open
questions.

### New row kinds' render contracts (Phase 1)

```js
// kind: 'toggle' — replaces the sbxActionBtn-as-toggle idiom for anything
// that isn't a whole-screen-affecting structural change (those stay bespoke
// per D5). Writes a boolean to `field` via the same "empty deletes"
// dispatcher wireSandboxConfigInputs already owns.
{ id, kind: 'toggle', field: '<dot.path>', label, desc? }

// kind: 'slider' — one labeled range input + live value readout, no reset
// button (unlike the per-axis temperament sliders, which keep their
// existing bespoke ×-reset markup — D5 doesn't touch those).
{ id, kind: 'slider', field: '<dot.path>', label, min, max, step? }

// kind: 'presetRow' — the difficulty-tag button row (D7/D8). Not a form
// field; clicking a tag stamps multiple fields at once and re-renders.
{ id, kind: 'presetRow', presets: '<SANDBOX_DIFFICULTY_PRESETS-shaped table name>' }
```

---

## Implementation phases

### Phase 1 — The tab shell

**Goal:** `SANDBOX_TABS` exists, a rail nav renders and switches top-level
tabs, the generic row dispatcher understands the two new kinds (`toggle`,
`slider`), and House/Economy's STATIC content (not yet the real Economy
fields — see Phase 4) round-trips through it. Roommates and Player still
render via a temporary placeholder pane. This phase is about proving the
shell works, not migrating everything at once.

**Files:**
- `src/srcfiles/config.js`: add `SANDBOX_TABS` (Data model above), minus the
  Roommates `dynamicInstances` branch's real content (Phase 5) and the
  Economy tab's `presetRow` (Phase 4) — those two entries exist as stubs.
- `src/srcfiles/menu.js`: new `renderSandboxUi()` (mirrors
  `renderSettingsUi`, `menu.js:1140-1176`) — rail nav
  (`renderSandboxTabRail`, mirrors `menu.js:1140-1152`'s rail-button loop),
  `renderSandboxTabPanes`/`renderSandboxSubtabPanes` (mirrors
  `renderTabPanes`, `menu.js:1178-1221`), and the generic
  `renderSandboxRow(row)` dispatcher (mirrors `renderSettingsRow`,
  `menu.js:1268+`) covering `text`/`number`/`select`/`toggle`/`slider`/
  `sliders`/`button`. `doMenuSandbox()` (`menu.js:341-346`) now calls
  `renderSandboxUi()` instead of `renderSandboxScreen()`.
- `src/srcfiles/ui.js`: new `handleAction` cases `sandbox.tab` (sets
  `sandboxActiveTab`, mirrors `settings.tab`, `ui.js:4024`) and
  `sandbox.subtab` (sets `sandboxActiveSubtab`, keyed per tab id). Both
  added to `MENU_ACTIONS`/`ENERGY_GATE_EXEMPT` (and D11's two existing-verb
  fixes land here, since this is the phase touching that exact list).
- `main.html`: new `.sbx-tab-rail`/`.sbx-tab-btn`/`.sbx-subtab-strip`/
  `.sbx-subtab-btn` rules, styled off the existing `.settings-rail`/
  `.settings-tab-btn` shapes (`main.html:2881-2902` region) recolored into
  the `.sbx-*` palette (`#191527`/`#2e2745`/`#d9b871`) rather than a new
  palette. New `.sbx-toggle`/`.sbx-slider-row` rules for the two new row
  kinds (the latter can share most of `.settings-slider-row`'s rules,
  reskinned).

**Verification:** Load the sandbox screen; confirm the rail renders all four
top-level tabs and switching between them swaps content without a full page
reload artifact (scroll position resets are fine here — Settings' own
scroll-preservation, `menu.js:1146,1175`, is a nice-to-have for Phase 6, not
required day one). Confirm a `toggle` row and a `slider` row round-trip a
write into `pendingSandboxConfig` via a temporary throwaway test field, then
remove the throwaway before Phase 2. Confirm `MENU_ACTIONS`/
`ENERGY_GATE_EXEMPT` have no duplicate entries and cover every sandbox verb
that exists after this phase.

---

### Phase 2 — House migrated (Layout + Facilities sub-tabs)

**Goal:** House becomes a real two-sub-tab pane inside the Phase 1 shell,
losing nothing from today's screen. This is the proving phase for D4's
static-`subtabs` shape and D6's split, chosen to go first because it's the
lowest-risk content migration — every field it needs already has a working
control (`sbxActionBtn` for presets/structural, the tier+condition pair for
facilities) and none of it is new functionality.

**Files:**
- `src/srcfiles/config.js`: fill in `SANDBOX_TABS.house.subtabs`'s two
  entries' real `sections` (preset row + structural toggles under Layout;
  the facility-row bespoke render stays a dedicated function called from
  Facilities' content, per D5, rather than being forced into row data).
- `src/srcfiles/menu.js`: `renderSandboxHousePanel` (`menu.js:465-508`)
  splits into `renderSandboxHouseLayout` (preset + structural) and
  `renderSandboxHouseFacilities` (the per-room facility loop,
  `renderSandboxFacilityRow` unchanged, `menu.js:524-557`), each invoked as
  the content of its respective sub-tab. `doSandboxHousePreset`/
  `doSandboxHouseStructural` (`menu.js:559-574`) unchanged in behavior — they
  still re-render, now re-rendering only the House pane rather than the
  whole screen.
- `src/srcfiles/ui.js`: land D11's two fixes here (duplicate `MENU_ACTIONS`
  lines, `ENERGY_GATE_EXEMPT` additions) since this phase is already
  touching every House-related verb to confirm they still fire correctly
  post-split.

**Verification:** Toggle every structural upgrade and confirm the live
`sandboxBedroomIds`/quality-preview behavior (`menu.js:595-599`,
`sandboxQualityPreview`, `menu.js:459-463`) is unchanged — this is the one
place House has a cross-cutting side effect (adding `study` as a bedroom
option) that must survive the split. Set every facility's tier+condition
override, start a sandbox game, and confirm `applySandboxPreset`
(`sim.js:4864-4975`) lands the exact same `world.upgrades` state as before
the rewrite for an identical `cfg.house`.

---

### Phase 3 — Player tab migrated

**Goal:** The Player tab shows the existing summary row and Design button
inside the new shell. Lowest-risk phase in the whole plan — this is a
relocation, not a redesign (D2).

**Files:**
- `src/srcfiles/menu.js`: the player-summary block currently inline in
  `renderSandboxScreen` (`menu.js:355-364`) becomes the Player tab's
  content function, unchanged in logic.
- `src/srcfiles/config.js`: `SANDBOX_TABS.player`'s content marked as a
  bespoke render (no generic rows needed — it's one summary row + one
  button, per D5's "bespoke where the generic shape doesn't fit"
  allowance).

**Verification:** Confirm `Design` still opens the real studio
(`openSandboxPlayerStudio`, `studio.js:989-1009`) and that confirming inside
it still writes `pendingSandboxConfig.player` and returns to the Player tab
(not the studio's own tab state, not a different sandbox tab) exactly as
today.

---

### Phase 4 — Economy & Difficulty (new functionality)

**Goal:** The stub becomes real. A difficulty preset row and four working
fields (money/rentGraceDays/billsStartDay/taxReserve), all writing into
`cfg.economy` for the first time via the UI, all consumed unchanged by
`applySandboxPreset` (D10). This is the one phase in the plan building
something that didn't work AT ALL before, not just relocating something that
did.

**Top-of-phase blocker:** none technical, but the exact numeric values for
`SANDBOX_DIFFICULTY_PRESETS` (Data model above) need to be chosen against
`ECONOMY`'s real tuned numbers before this phase can call itself done — see
Open questions. Do not ship placeholder numbers as if they were tuned.

**Files:**
- `src/srcfiles/config.js`: `SANDBOX_DIFFICULTY_PRESETS` (Data model above),
  tuned against `ECONOMY.startingMoney`/`ECONOMY.opening.rentGraceDays`/
  `ECONOMY.opening.firstBillDelay`. Fill in `SANDBOX_TABS.economy`'s real
  `sections` (already drafted in the Data model above).
- `src/srcfiles/menu.js`: the `presetRow` row-kind renderer (button row over
  `Object.keys(SANDBOX_DIFFICULTY_PRESETS)`, mirroring
  `renderSandboxHousePanel`'s existing preset-button loop,
  `menu.js:472-477`, restyled under `.sbx-preset-row`); the live
  preset-vs-custom derivation (D8) — a pure function comparing `cfg.economy`
  against each preset's value set, called every render, never stored.
  `wireSandboxConfigInputs` (`menu.js:896-993`) gains the four new
  `data-sbx-field="economy.<key>"` paths (top-level `cfg.economy`, not
  per-roommate `partial` — the existing dispatcher already branches on
  path shape, this is a new branch alongside the roommate one, not a
  parallel dispatcher).
- `src/srcfiles/ui.js`: new `handleAction` case `sandbox.difficulty-preset`
  (stamps all four fields from the chosen preset, re-renders the Economy
  tab).

**Verification:** Click each difficulty preset and confirm all four fields
update and the preset row correctly highlights it; edit any ONE field by
hand afterward and confirm the row falls back to showing no preset selected
(D8's live derivation, not a stored flag going stale). Start a sandbox game
at each preset and confirm `player.money`/`world.taxes.reserve` land exactly
as `applySandboxPreset`'s steps 6 (`sim.js`, the numbered step list in the
Handoff/Evidence) already describe — this phase changes what values REACH
that function, never the function itself.

---

### Phase 5 — Roommates (rail + per-instance sub-tabs)

**Goal:** The hardest phase. Selecting the Roommates top-level tab shows the
roommate rail (D3); selecting a roommate opens its five sub-tabs
(`SANDBOX_ROOMMATE_SUBTABS`, Data model above), each carrying the fields the
current accordion card holds today, with nothing lost.

**Top-of-phase blocker:** `sandboxActiveRoommate` (D12) must be reset to
`null` — falling back to the rail view — whenever the roommate at that index
is removed or the array is reordered such that the index no longer points at
the same person. `doSandboxRoommateRemove`/`doSandboxRoommateMove`
(`menu.js:1029-1048`) already do index bookkeeping for the old
`sbxExpandedRoommate` var; this phase's version of that bookkeeping must be
written and tested before the rest of the phase, or a remove/reorder while a
roommate's sub-tab is open will silently point at the wrong person.

**Files:**
- `src/srcfiles/menu.js`: `renderSandboxRoommateRail` (new — the vertical
  list of roommate cards, collapsed: name/summary/reorder/remove, replacing
  `renderSandboxRoommateCard`'s current always-expandable-accordion role,
  `menu.js:650-729`), `renderSandboxRoommateSubtabs` (new — the five-sub-tab
  strip + content for whichever roommate is active, built from
  `SANDBOX_ROOMMATE_SUBTABS` against `cfg.roommates[sandboxActiveRoommate]`),
  and `buildSandboxRoommateForm`'s field-building logic
  (`menu.js:731-834`) split across the five sub-tabs' content functions
  rather than one flat form. `doSandboxRoommateToggle` (`menu.js:1050-1053`)
  is replaced by whatever now sets `sandboxActiveRoommate` (a `sandbox.
  roommate-select` verb, or reusing `roommate-toggle`'s id with new
  semantics — decide in-phase, document either way).
- `src/srcfiles/ui.js`: `handleAction` cases for entering/leaving a
  roommate's sub-tab view and for `sandbox.roommate-subtab` (switches which
  of the five is shown, shared across roommates per D12).
- `main.html`: `.sbx-roommate-rail`/`.sbx-roommate-rail-card` (compact
  variant of today's `.sbx-roommate-card`, no inline form), reusing
  `.sbx-subtab-strip`/`.sbx-subtab-btn` from Phase 1 for the per-roommate
  sub-tab strip rather than inventing a fourth tab-strip style.

**Verification:** Build a 7-roommate cast (the cap) entirely through the new
UI, touching every field in every sub-tab for at least one roommate and
leaving others fully rolled, then start the game and confirm the resulting
cast matches what the OLD accordion-card UI would have produced for an
identical `partial` set (byte-comparable `roommates[].partial` before
`SIM_generateHouse` ever runs — this is a pure UI check, not a generation
check). Remove a roommate while a DIFFERENT roommate's sub-tab is open and
confirm the blocker above holds (no index drift). Reorder roommates and
confirm the rail's displayed order and the sub-tab view (if one is open)
stay correctly paired to the same person throughout.

---

### Phase 6 — Polish

**Goal:** The things that make the new shell feel finished rather than
merely functional.

**Files:**
- `src/srcfiles/menu.js`: a persistent summary strip (roommate count, house
  quality %, active difficulty preset or "Custom") shown regardless of
  active tab — cheap, and answers "what am I actually starting with" without
  a dedicated review tab neither existing pattern has (checked directly
  against both `PLAYER_STUDIO_TABS` and `SETTINGS_TABS`: neither has one).
  Scroll-position preservation across tab switches, matching Settings'
  existing `prevScroll` handling (`menu.js:1146,1175`).
- `main.html`: D11's `.sbx-badge`/`.sbx-badge-on` resolution — wire to a
  roommate's occupation-category chip on the rail card, or remove if it
  reads as clutter once actually built and looked at.

**Verification:** Live-page pass (browser) with a full 7-roommate,
fully-customized House and Economy setup: confirm the summary strip stays
accurate through every tab switch and every field edit, confirm no scroll
position is lost switching between House's two sub-tabs or between two
different roommates' sub-tabs.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | The tab shell — rail nav, generic row dispatch, two new row kinds |
| 2 | Done | House migrated into Layout + Facilities sub-tabs |
| 3 | Done | Player tab migrated (relocation only) |
| 4 | Done | Economy & Difficulty — new functionality, presets over 4 previously-unwired fields |
| 5 | Done | Roommates — the rail + per-instance five-sub-tab editor |
| 6 | Done | Persistent summary strip, scroll preservation, `.sbx-badge` resolution |

## Dependency order

```
Phase 1 (shell) ──► everything else
        ├─► Phase 2 (House) ──► Phase 4 needs no House work, but reuses
        │                       Phase 2's sub-tab rendering path directly —
        │                       do 2 before 4 even though nothing else forces it
        ├─► Phase 3 (Player) ── independent once Phase 1 lands, may run
        │                       before or after Phase 2
        └─► Phase 5 (Roommates) ── the largest phase; benefits from Phase 2's
                                    sub-tab plumbing existing first, but has
                                    no HARD dependency on it beyond that shared
                                    code path

Phase 4 (Economy & Difficulty) — soft-depends on Phase 2 only for the
  presetRow row-kind's visual precedent (the house-preset button row it's
  styled after); could technically run before Phase 2 but shouldn't, since
  Phase 2 is the phase that proves the sub-tab shell works at all.

Phase 6 (polish) ◄── after everything above; touches all four tabs' rendered
  output, so is the one phase that must go last.
```

## Open questions (parked, none blocking)

- **The exact numeric values for `SANDBOX_DIFFICULTY_PRESETS`.** Locked to
  exist (D7/D9), not locked to specific numbers — decide during Phase 4,
  tuned against `ECONOMY`'s real values so "Tight" is meaningfully tighter
  than the game's own default opening, not an arbitrary offset.
- **Should the Roommates rail show a difficulty-relevant summary per card**
  (e.g. an income-band hint), given Economy & Difficulty now exists as a
  concept? Decide during Phase 5 or Phase 6 — not required for either to be
  complete, but worth considering once both exist side by side.
- **`sandbox.roommate-toggle`'s replacement verb name** — reuse the id with
  new semantics (rail-select instead of accordion-expand) or mint a new
  `sandbox.roommate-select` id and retire the old one outright. Decide during
  Phase 5; either is fine, just pick one and don't leave both wired to
  overlapping behavior.

## Design invariants

1. **The data model never changes shape.** `pendingSandboxConfig`,
   `applySandboxPreset`, `startSandboxGame`, and the roommate `partial`
   contract are read-only surfaces to this plan (D10). A phase that finds
   itself editing `sim.js:4864-4975` has left this plan's scope.
2. **Bespoke content stays bespoke; the generic row system is not forced
   onto shapes it doesn't fit.** Facility tier+condition pairs, structural
   toggles, and the roommate rail are dedicated render functions called
   from within a tab/sub-tab's content, the same way Settings' `grid` kind
   already carves out an exception for image-style tiles (D5). Forcing
   these into `{kind, field}` rows would produce a row-kind explosion for
   one-off shapes that will never be reused.
3. **"Custom" is always derived, never stored** (D8). A stored
   `difficulty` flag would drift from the fields it's supposed to describe
   the moment a player hand-edits one slider — exactly the class of bug a
   live comparison against `SANDBOX_DIFFICULTY_PRESETS` cannot have.
4. **Tab/sub-tab/instance state is session-scoped only**, matching
   `settingsActiveTab`'s explicit precedent (D12). Nothing in this plan
   writes an active-tab id to any persisted save or settings store.
5. **The appearance studio is a leaf dependency, never a fork point.**
   Every "Design" button in this plan (Player, each roommate) calls the
   existing `openStudio`/`openSandboxPlayerStudio`/`openRoommateStudio`
   unmodified (D2). A phase that finds itself adding a tab to
   `PLAYER_STUDIO_TABS` or duplicating studio logic has drawn its boundary
   wrong.
