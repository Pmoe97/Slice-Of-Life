You are one session in a long-running series implementing the **Actions &
Activities Overhaul** for this game — filling the apartment with things to
do, so every room is a place something happens instead of scenery with no
verb. When finished, the player books events and asks NPCs into them
through one invitation spine built on the existing Ask system; a real
stealth/detection layer backs every covert act (steal, snoop, pickpocket,
acting on someone asleep); the East Wing becomes the social hotspot it was
meant to be; and a house full of dead objects (`coffee_maker`, `toilet`,
`yoga_mat`, `mailbox`, the whole laundry cycle) each get a verb that earns
its place.

You have no memory of any previous session. Everything you need to know
about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be
told which phase to work on — find it yourself using the steps below.

**One thing that is NOT drift, read this before anything else:** this
repo was restructured 2026-08-31. The game's source lives at
`src/src/srcfiles/`, design docs at `src/src/ref/`, and the dev/verify
harness at `src/src/dev/verify/` — **all nested one level deeper than a
plain `src/` layout**, because the repo mirrors Perchance's own container
shape (an outer `src/` you can't rename or download as a whole, wrapping
an inner `src/` that you can). Only `index.html` and `main.pjs` sit outside
both layers. If you find yourself typing `src/srcfiles/...` or
`dev/verify/...`, stop — it's `src/src/srcfiles/...` and
`src/src/dev/verify/...`. This has already burned one session mid-restructure
(six files had off-by-one `..` bugs from exactly this kind of assumption);
don't repeat it.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/src/ref/wip/actions-and-activities-overhaul-plan.md`.

The first phase not marked "Done" is your phase, reading the table top to
bottom (1, 1B, 2, 3, 4, ...). **Phase 18 is marked "Retired," not "Done" —
that's expected (Pets was cut, D28), not a gap; skip it when scanning.**

**Exceptions to strict order** — the plan's own dependency graph (below
the Status table) names a large parallel-safe cluster: P1B, P2, P4, P6,
P10, P11, P12, P14, P15, P16 are all independent of each other once P1
lands, and may be done in any order convenient to the session. P3 must
precede P7, P8, and P17. P9 must precede P17. P19 (audio) can land
alongside literally anything, any time.

**Hard prerequisites:**
- **Never skip Phase 1** — every later phase's booking/scheduling assumes
  the invitation spine (`$Invite`, the extended `commitments.js` roster)
  already exists.
- **Do Phase 1B before Phase 2, Phase 4, or Phase 5** even though the
  dependency graph calls them independent-after-P1 — D30's cover-tracks
  window (Phase 2), D33's pickpocketing (Phase 4), and D31's sleeping-player
  branch (Phase 5) all consume something Phase 1B builds. Building 2/4/5
  first means building against a stub that isn't there yet. (Reading the
  Status table top-to-bottom already puts 1B before 2, so this should
  never actually come up — flagged in case a session is tempted to jump
  ahead to a "more interesting" phase.)
- **Phase 3 (Flags & Conditions) before Phase 7, Phase 8, or Phase 17** —
  boundary flags (D13), comfort flags (D16), and party flag-collisions
  (D26) all read the D15 engine Phase 3 builds.

**External block, Phase 17 only:** cook-off judging weights and stakes
(Q4 in Open questions) are still parked. If you reach Phase 17 and Q4 is
still open, **stop and ask the user** rather than inventing scoring
weights or stakes yourself — don't infer an answer.

If every phase (1 through 19, excluding retired 18) is marked Done, **stop**
and report that completion to the user.

You should never need to fully read the whole plan document in a session —
it's over a thousand lines.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" (D1–D36 — a lot, but read the section headers
  and skim; you mainly need the ones your phase cites, plus D1–D4 and
  D32 always, since the invitation spine and the stealth spine are the
  substrate everything else sits on).
- Then "Data model", your phase's block under "Implementation phases",
  and "Design invariants".
- **Cross-check every cited file and line number against the actual
  current code before trusting it.** Unusually for a fresh plan, most of
  D1–D36's citations were checked against the live codebase during the
  design-review session (not just asserted) — `doMakeAMove`, `boundary.js`'s
  sleep-room gate, `isPrivacyRoom`, `willingnessFloorReasons`, the three
  already-shipped stealth mechanics all confirmed real with file:line
  citations as of 2026-08-31. That still doesn't make them permanent — a
  stale citation from drift since then is expected, not an error. Find the
  real current location by name/content, not blindly by line number.
- Several phases' Files lines say "real home TBD — likely X/Y" for a
  module that doesn't exist under the name a first draft of this plan
  guessed (`planner.js`, `wardrobe.js`, `beliefs.js`, `chores.js`,
  `appearance.js` never existed; `money.js` is a genuine open call). Don't
  create a new file just because the plan names one — grep for where the
  logic actually lives first, per the TBD note.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations"
  and end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode dependency order
  deliberately — Phase 1 proves the invitation spine before anything books
  through it; Phase 1B wires real XP into stealth mechanics that already
  ship before any new covert verb leans on them.
- When told to reuse a pattern, go read that code and match its current
  shape — don't work from this prompt's or the plan's paraphrase. Patterns
  to mirror, by function and file:
  - `src/src/srcfiles/asks.js` — `ASK_HANGOUT`, `ASK_GIFT`, `ASK_INTIMACY`
    and the `ASK_CATEGORIES`/`ASK_TYPES` tree shape every new ask leaf
    (D1, D5–D7, D30's Affection ladder, D8–D14's social/item leaves)
    must match exactly: pure `decide()`, `effects()`/`postEffects()`,
    `leafNote()`.
  - `src/src/srcfiles/stealth.js` — `resolveRoomEntryStealth` and
    `resolvePeep` are the two proven shapes (seeded roll, `skillMod`-gated
    chance, witnessed/unwitnessed or clean/suspected/caught branches,
    evidence via `pickEvidenceObject`) that Phase 1B's pickpocket resolver
    (D33) must copy, not reinvent. `ui.js`'s `doSearchPhone`/
    `doSearchRoom` are the third proven instance — read them before
    building D36's cover-tracks window, since the suspicion-adjustment
    calls they already make are exactly what a cover-tracks action needs
    to partially undo.
  - `src/src/srcfiles/boundary.js` — `resolveBoundaryGate` and
    `applyBoundarySleepRoom` are what D30/D31 extend for the
    sleeping/unaware-target branch. `src/src/srcfiles/willingness.js`'s
    `willingnessFloorReasons` hard 'asleep' floor is what D30 explicitly
    must NOT be touched or relaxed — the boundary gate exists precisely so
    nothing else has to.
  - `src/src/srcfiles/skills.js` — `awardSkillXp`/`skillLevel`/`skillMod`
    and `SKILL_CURVES.stealthSuccess` already exist and are already read
    by all three stealth mechanics; Phase 1B's real work is new
    `awardSkillXp(player, 'stealth', ...)` call sites, not a new curve.
  - `src/src/srcfiles/signals.js` — `PLAUSIBLE_TUNING.bySignal.footsteps`
    is the existing signal D34's Sneaking toggle suppresses; don't invent
    a parallel noise system.
  - `src/src/srcfiles/commitments.js`'s `hangout` kind + `ASK_HANGOUT` —
    what D2's event/roster extension builds on.
- **Hard technical rules**, each a Design invariant from the plan — repeat
  here because they're the ones easiest to violate by accident:
  - **The willingness gate is the only door to sex** (invariant 2) — for
    player-initiated AND NPC-initiated advances. D30/D31's sleeping-target
    branch routes through `boundary.js`, never through a relaxed
    `willingnessFloorReasons` floor. If a phase seems to need the asleep
    floor to bend, that's a stop-and-flag, not a workaround.
  - **An NPC is never bound by a rule it cannot perceive** (invariant 3,
    D15). Detection through the perception/signal layer is a precondition
    for enforcement — a house rule an NPC can't perceive doesn't fire.
  - **No field without a reader** (invariant 6) — the vocation-plan scar.
    Don't add a data-model field this phase doesn't itself consume.
  - **New source files register in BOTH `index.html`'s `<script>` tags
    AND `src/src/dev/verify/loadgame.js`'s `ORDER` array, in the same
    commit** (invariant 8) — note the new nested path. A file in only one
    has silently broken every harness that touches it before, repeatedly,
    in this project's history.
  - **Money and items are symmetric ledgers** (invariant 9, D8–D9). A loan
    is a loan whichever side owes it; never a one-way flag.
  - **Decide before you decorate** (invariant 1) — every outcome computed
    deterministically first; flavor/LLM text only finishes the wording.
    This applies to every new ask leaf and every stealth-gated act without
    exception.
- **Actually run the phase's Verification steps.** Per invariant 7: pure
  logic in `src/src/dev/verify` (Node), presentation/visual on the live
  page. **`run-all.js` now takes a filter** (2026-08-31 fix — it used to
  run all 111 harnesses strictly sequentially, ~30+ minutes; it's now
  parallel and filterable, ~90 seconds unfiltered): during iteration, run
  only the harness(es) that exercise what you're touching —
  `node src/src/dev/verify/run-all.js w6 w9` matches by substring, in
  seconds, not minutes. Run the **full unfiltered sweep once**, near the
  end of the session before writing the Step 3 handoff note, and take the
  baseline seriously: as of 2026-08-31 it reports **3298 passed, 76
  failed, 13 harness(es) errored** — all pre-existing and unrelated to
  this plan (several are explicitly documented elsewhere as known,
  not-yours-to-fix, e.g. `verify-w6.js`). If your phase's changes move
  those numbers down, or move them up by more than what your own new
  assertions account for, something regressed — find it before ending the
  session. For UI/presentation phases, a Node harness proves nothing;
  verify on the live page instead (a local `python -m http.server` per
  `.claude/launch.json`, or the `dev-harness.html` shim which fetches and
  replays `index.html`'s own script list — read its own file-header
  comment, it explains its limits).
- Once verified, **stop.** One phase per session is the point, even with
  budget left.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes
   / Blockers). Name the real identifiers you created — function names,
   the exact ask-leaf ids, the real file a TBD module landed in — because
   the next session greps for them, not for prose.
2. Update the phase's row in the `## Status` table. Never leave Status and
   Handoff disagreeing — a later session's Step 0 reads only the table.
3. Promote any resolved open question into `## Locked decisions` as a new
   D-number (continue from D36). If Q4 gets answered at Phase 17 kickoff,
   this is where that answer becomes permanent.
4. Phase-specific obligations:
   - **Phase 1:** record the actual file the scheduler hook landed in —
     the plan flags this as a real TBD (likely `tracker.js`/`intent.js`),
     and every later phase booking through the invitation spine needs the
     real answer, not the guess.
   - **Phase 1B:** record the exact XP amounts wired into each of the
     three existing mechanics' clean/unwitnessed branches, and confirm
     with a measured example that a fresh player crosses at least one
     `stealthSuccess` level boundary within a reasonable number of clean
     sneaks — "it compiles" is not evidence the dead XP path is actually
     fixed.
   - **Phase 4:** record the real file `money.js` (or its ledger logic)
     ended up in — this was flagged as a genuine open call, not a
     factual error, so the decision itself is this phase's to make and
     record.
   - **Phase 17:** record Q4's resolution (judging weights, actual stakes)
     as a new D-number before implementing the cook-off event type.
5. If this was Phase 19 (or whichever phase turns out to be last), mark
   the plan's Status header **complete**.

Do not end a session without doing this. A half-finished phase with a
precise Handoff note is recoverable; a half-finished phase with no note is
not.
