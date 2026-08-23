You are one session in a long-running series implementing the **Seasonal
Calendar & Sandbox Mode** overhaul for this game. Two halves, one plan.
**Part A** resizes the world's calendar from a 360-day year nobody ever
reaches into four 35-day seasons — five 7-day weeks each, 140 days to the
year, day 1 a Sunday, every season and every year beginning on a Sunday
forever — with utility bills posting once per season and estimated taxes
billing twice a year, at the end of Summer and the end of Winter. **Part B**
adds Sandbox mode: a third start path beside the solo opening where the
player authors their roommates outright (identity *and* appearance), assigns
their rooms, sets the apartment's condition anywhere from today's wreck to
fully restored. **The game still begins on day 1** — what a sandbox advances
is the state of the house on that first morning, never the calendar.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/seasonal-calendar-and-sandbox-plan.md`.

Phases are labelled **A1-A5** (calendar) and **B1-B7** (sandbox). The first
phase not marked "Done" is your phase, in that order, with these exceptions:

- **A4 (investing) is independent of A2 and A3.** It needs only A1. If A2 or
  A3 is blocked, A4 is safe work.
- **The whole of Part B needs nothing from Part A.** Sandbox never reads or
  writes a calendar field (D19). If Part A is stalled or blocked, any Part B
  phase is safe work — and the reverse holds too.
- **B5 and B6 are siblings** and may run in either order.

Hard prerequisites — never skip these, and the reason matters:

- **Never do A5 before A1.** A5 writes the real `formatDate` against helpers
  A1 creates. Done first, it writes against config fields A1 deletes.
- **Never do A3 before A1.** A3's entire subject is the `daysPerTaxPeriod`
  constant A1 introduces.
- **Never do B5 before B2.** The appearance studio has nowhere to write an
  authored appearance until `rollCastSlot` accepts a `physical` partial.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off. It also carries five audit findings that correct plausible-sounding
  wrong beliefs about this code. Read them; at least one will apply to you.
- Then "Locked decisions", "Data model", your phase block, and "Design
  invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error. Find
  the real location by name/content, never blindly by line number.
- Several phases deliberately say "derive this list by grep, do not trust the
  enumeration in this plan." Do that. Those lists were accurate on
  2026-08-21 and are the ones most likely to have rotted.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode dependency order and
  review granularity.

- When told to reuse a pattern, go read that code and match its current shape
  — do not work from this prompt's paraphrase. **Patterns to mirror:**
  - **Part A** — the calendar helpers block in `src/srcfiles/sim.js` (all pure
    functions of the day counter, no state object threaded anywhere; keep it
    that way), `isDueToday`/`rescheduleDue` beside them for anything recurring,
    and `processBillsForDay` in `src/srcfiles/computer.js` for how a cadence
    actually fires.
  - **B1** — `expandCharacterProse` and the `fallback*` family in
    `src/srcfiles/llm.js`, and the `candidateBible` construction inside
    `approveCastAndStartGame` in `src/srcfiles/ui.js` that you are replacing.
  - **B2** — `generatePlayerAppearance` in `src/srcfiles/sim.js`. Its merge
    half is the function you are extracting; its comments record three
    separate bugs (the per-group shallow merge, the `intimate` half-level
    merge, the `heightBuild` recompose). Do not reimplement it from the plan's
    description.
  - **B3** — `applyStructuralUpgrades` (`src/srcfiles/config.js`),
    `applyFacilityCompletionStates` (`src/srcfiles/ui.js`),
    `moveNpcIntoRoom` (`src/srcfiles/sim.js`), and the recruitment room-picker
    in `src/srcfiles/computer.js`. All four already exist; the phase is
    sequencing them, not writing them.
  - **B4** — `startSoloGame` in `src/srcfiles/ui.js`, beat for beat. The
    ordering of `stopAutosave`/`stopClockLoop` at its top closes a real race
    documented in its comments, and `closeMainMenu` is the single point that
    uncovers `#app` — a path that forgets it half-starts a game behind a
    blank screen.
  - **B5** — `PLAYER_STUDIO_TABS` and the populate/read walk in
    `src/srcfiles/studio.js`. Its header comment states the rule you are
    working under: one table, walked by both populate and read, because a
    second hand-written reader is how a field gets offered to the player and
    then silently dropped.
  - **B4/B5/B6 UI wiring** — the `data-action` dispatch chain in
    `src/srcfiles/ui.js` (`handleAction`) and the menu sub-screen pattern in
    `src/srcfiles/menu.js` (`showMenuScreen`). This codebase does not attach
    per-element listeners.

- **Hard technical rules:**

  - **Per-day parity is Part A's acceptance test.** Every constant that posts
    *per cycle* is scaled by the cycle-length ratio (30→35 is ×7/6); every
    *per-day* or *per-unit* rate is left exactly alone. `UTILITY_METER` rates,
    `UTILITY_HVAC_SEASONAL` and `graceDays` do **not** change. If a change
    moves dollars-per-day, it is a bug in the change, not a design choice —
    stop and flag it.
  - **Ask what a rate multiplies before scaling it.** `underpaymentPenalty`
    (a fraction of a shrinking shortfall) stays 0.08; `interestRate` (a
    fraction of a balance that does not shrink) scales to 0.015. They sit
    three lines apart in `TAX_CONFIG` and behave oppositely.
  - **Do not collapse the bill stagger onto the season boundary.** D6 keeps
    `initBillState`'s existing first-due offsets deliberately. "Once per
    season" is about the period, not the phase. Six bills plus taxes on day 35
    is a ~$600 wall every season forever.
  - **Do not rename the persisted `world.taxes.lastQuarterBilled` key.** Its
    meaning changes (0-1 instead of 0-3); its name stays, because renaming it
    needs a save migration this plan explicitly refuses. Comment it instead.
  - **Sandbox is always day 1. Never rebase a day field.** The advanced thing
    is the house, not the calendar (D19). If a phase seems to want
    `meta.clock.day`, `player.rentDueDay`, `world.bills[id].dueDay`,
    `world.taxes.lastQuarterBilled` or `gigs.lastRefreshDay` written, it does
    not — stop and flag it. Phase B7 ships a guard that throws if any of them
    differs from a plain solo start's.
  - **This plan ships no save migration.** Day numbers are opaque counters and
    seasons are derived, never persisted. An old save loads and starts
    printing a different date string. If you find yourself writing a
    migration, you have misunderstood something — stop and flag it.
  - **Determinism: the same seed must produce the same cast.** Every new draw
    is APPENDED at the end of its sequence, never inserted mid-stream —
    inserting shifts every existing seed's household. B2's appearance merge
    **draws no randomness at all** and must be placed after every existing
    roll in `rollCastSlot`. The B2 harness asserts this by generating the
    same seed twice and comparing byte-for-byte; if that assertion is not in
    your harness, the phase is not verified.
  - **`WEEKDAY_NAMES` stays Monday-first and is not touched.** Day 1 becomes
    Sunday via `getWeekday`'s base shift only. Reordering the array would
    silently move every persisted maid contract (`schedule[].weekday`, a raw
    0-6 index) by one day, with no error and no migration hook.
  - **Module-level tables do not rebuild themselves.** Writing
    `world.flags.structural_*` changes nothing until
    `applyStructuralUpgrades(gameState)` is called. Setting a facility tier
    does not write its `completionStates` until
    `applyFacilityCompletionStates(gameState, id)` is called. Both are
    explicit steps in `applySandboxPreset`'s ordered list, and the order is
    load-bearing.
  - **Never hand-construct a bible.** Every character construction path
    returns through `validateCharacter`. A new persisted bible field
    (`authoredFields`) must be added to `CHARACTER_SCHEMA` in the same phase,
    or validation strips it on the way in and the lock is a no-op that looks
    like it works.
  - **Two files have different names in the repo and in Perchance.** This is
    a known, unfixable naming mismatch — Perchance dictates its side and the
    repo's copies were named before that was understood. Do not "correct"
    either name, and do not assume a file is missing because the other name
    is the one you were looking for:

    | In this repo | In Perchance | What it is |
    |---|---|---|
    | `main.html` | `index.html` | The page body + every `<script>` tag |
    | `perchance.pjs` | `main.pjs` | The `$meta` block and the plugin imports |

  - **The `?v=` cache-busters bump on every changed srcfile.** They live in
    the script list in `main.html` / `index.html`. If you add a new srcfile it
    must be registered in **both** that script list **and**
    `dev/verify/loadgame.js`'s `ORDER` array, **in the same commit** — a
    missed `ORDER` entry silently drops assertions rather than failing.
  - `main.html` / `index.html` is the `<body>` contents only — never add
    `<html>`/`<head>`/`<body>` tags. Imported plugins are reached via `root`,
    and they are declared in `perchance.pjs` / `main.pjs`.
  - Every new UI control's action id must exist in the `data-action` dispatch
    table, or the button is inert with no error.

- **Actually run the phase's Verification steps.** Verification splits by
  layer, and getting this wrong means a "verified" phase that never ran:
  - **A1-A4, B1-B3, and the harness half of B7** verify in
    `dev/verify/` — `node dev/verify/verify-<name>.js` for the new harness,
    then `node dev/verify/run-all.js` for the whole suite. `loadgame.js`
    brings the entire engine up in a bare Node `vm`, so every pure function
    is directly callable against real generated houses. Prefer it.
  - **A5, B4, B5, B6 and the UI half of B7** touch the render layer, which
    `loadgame.js` deliberately stops short of. These verify on the **live
    Perchance page** (`browser_eval`/`browser_refresh` + `vision` for anything
    visual) — the runtime needs `root.kv` and the image plugin, and a local
    server proves nothing.
  - **At minimum for every phase, whichever layer:** `node dev/verify/run-all.js`
    green, and — for any phase touching state shape — a save/load round-trip
    proving every field you wrote survives `writeGeneratedGameState` →
    `loadGameState`. For UI phases, also confirm the page is error-free on
    refresh (no `perchanceErrors`/`syntaxErrors`).
  - Four harnesses in this plan exist to catch a *specific* silent failure and
    are the ones worth writing first: **A2**'s per-day dollar parity, **A3**'s
    exact-internet-deduction count, **B2**'s same-seed byte-identical cast,
    and **B3**'s pool `completionStates` assertion. If you are short on
    budget, write those before the convenience assertions.

- Once verified, **stop.** Do not roll into the next phase even with budget
  left. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers) — overwrite, do not append. Name the real identifiers you
   created: function names, config keys, harness filenames. The next session
   greps for them.
2. Update the phase's row in the Status table. Never leave Status and Handoff
   disagreeing.
3. Promote any resolved open question into Locked decisions as a new D-number
   and strike it from "Open questions".
4. **Phase-specific obligations:**
   - **A1** — record the complete list of call sites you renamed, and confirm
     the `grep` for `daysPerQuarter|getQuarter|isQuarterEnd|monthNames|daysPerMonth`
     returns zero non-comment hits.
   - **A2** — record the measured total dollars posted over 140 days per bill,
     against the old-constant equivalent. Those two numbers are the parity
     proof and nobody will go re-measure them.
   - **A3** — record the measured compounded interest over three periods
     against the old rate over the same number of days.
   - **A4** — confirm in writing that per-day returns are unchanged, and
     record the per-season display figures now shown for all three funds.
   - **A5** — record the exact date strings rendered on days 1, 35, 36, 70,
     140 and 141, and confirm `structural/game-clock-time-system.md` was
     updated in the same commit (D10).
   - **B2** — confirm the same-seed byte-identical cast assertion passed, and
     name the seeds you tested.
   - **B3** — record where `applySandboxPreset` ended up living and why (the
     `ui.js` vs new `sandbox.js` question is parked in Open questions —
     resolving it means promoting it to a D-number per step 3).
   - **B5** — record every thunk in `PLAYER_STUDIO_TABS` that was coupled to
     the module-global `playerStudioDraft` and had to be re-pointed at the
     subject. There is at least one (`breastPoolForGender`); assume there are
     more and say how many you found.
   - **B7** — record the grep-derived list of tutorial/milestone flag ids you
     suppressed, and confirm the D19 guard is in place and firing (build the
     heaviest sandbox you can and diff its clock/bill/rent day fields against
     a plain solo start's — they must be identical).
5. If this was the last phase, mark the plan's Status header complete and move
   both the plan and this prompt from `src/ref/wip/` to `src/ref/complete/` —
   they move as a pair — updating `src/ref/README.md`'s contents table in the
   same commit.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
