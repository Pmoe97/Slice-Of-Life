You are one session in a long-running series implementing the **Settings &
Pause Overhaul** for this game — turning the reused boot-menu pause into a
real pause screen, and the flat Options list into a searchable, tabbed
settings surface (General/Population/Images/Appearance/Data) where every
option is actually wired, plus a population distribution over gender AND
fantasy race that governs every cast generation source, an 18-style image
system, 14 color themes, text sizing, an SFW guidance toggle, and an
x0/x1/x20/x100 game-speed HUD.
You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/wip/settings-and-pause-overhaul-plan.md`.

The first phase not marked "Done" is your phase. The phases must be done in
order, with these exceptions: **Phases 4, 7, 8 and 9 are mutually independent
once Phase 2 lands** and may run in any order; **Phase 10 only needs Phase 1**
(`SPEED_PRESETS`) and can slot in anywhere. Never skip Phase 1 before Phase 2
— every tab phase and the pause screen read the settings store. **Phase 6 must
come after Phase 5** — it consumes `settings.raceDist` and the `RACES` table
from the Population tab, and until Phase 6 lands the distribution only affects
background art, not the world.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off.
- Then "Locked decisions", "Data model", the phase block, and "Design
  invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error. Find
  the real location by name/content.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate.
- When told to reuse a pattern, go read that code and match its current shape.
  Patterns to mirror: the main-menu sub-screen pattern in `src/srcfiles/
  menu.js` (`showMenuScreen`, `doToggleBgArt`/`doToggleAutosave` for the
  toggle-row shape), the `kv.menu` persistence pattern in `menu.js`
  (`loadMenuOptions`/`setMenuOptions`), the data-action dispatch in
  `src/srcfiles/ui.js` (`MENU_ACTIONS` + `handleAction`), the save-panel
  wiring (`openSaveMenu('save'|'load')`, `doLoadFromSlot`'s confirm), and —
  for Phase 5 — the reference HR-tab proportional-slider behaviour in
  `scratch/generators/freeuseofficeclicker/index.html` (both the
  `genderSlidersHost` **and** `raceSlidersHost` grids: typed % inputs, live
  normalization, total-100 readout + warning). For Phase 6, the choke points
  are `rollGender`/`rollAge` (sim.js) and `rollCastSlot` (sim.js) — read them
  and their callers before threading new draws.
- **Hard technical rules:**
  - `kv.menu` settings stay out of `SAVE_KEYS` — settings are browser-local;
    the only exception is D5's SFW flag patching `meta.contentConfig`.
  - Determinism: settings never touch RNG or reorder seed draws. **Every new
    draw added by this plan (the species roll) is APPENDED at the end of its
    sequence, never inserted mid-stream** — inserting mid-stream shifts every
    existing seed's cast. With default settings, a seed's cast must be
    identical to pre-overhaul. Image styles are prompt-text only; a style or
    cast change that serves stale cached frames is a correctness bug (fold
    the style into cache keys — D9).
  - Authored NPCs are exempt: Del Connors never passes through the roll path,
    and `partial.species` pins an authored species.
  - `index.html` `?v=` cache-busters bump on every changed/new srcfile, and
    `src/dev/verify/loadgame.js`'s `ORDER` array must list every file the page
    loads, **in the same commit** (a missed one silently drops assertions).
  - `index.html` is the `<body>` contents only — never add
    `<html>`/`<head>`/`<body>` tags. Imported plugins are reached via `root`.
  - Every new/changed setting row's action id must exist in `MENU_ACTIONS`.
- **Actually run the phase's Verification steps.** Verification happens on the
  **live Perchance page** (`browser_eval`/`browser_refresh` + `vision` for
  anything visual), not a local server — the runtime needs `root.kv` and the
  image plugin. At minimum for every phase: the settings save/load round-trip
  through `kv.menu` 'settings', and a check that the page is error-free
  (no `perchanceErrors`/`syntaxErrors` on refresh).
- Once verified, **stop.** One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). Name the real identifiers you created — the next session greps.
2. Update the phase's row in the Status table. Never leave Status and Handoff
   disagreeing.
3. Promote any resolved open question into Locked decisions as a new D-number.
4. Phase-specific obligations: **Phase 4** — record which text components you
   decided to scale (and any you deliberately skipped); **Phase 5** — record
   the `RACES` ids shipped and the `identityToArtTag` mapping; **Phase 6** —
   record every generation site you threaded species into and confirm the
   default-settings same-seed cast is byte-identical to pre-overhaul;
   **Phase 7** — record the cache keys you touched; **Phase 8** — record the
   14 theme ids shipped; **Phase 10** — record the measured x100 checkpoint
   behaviour.
5. If this was the last phase, mark the plan's Status header complete.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
