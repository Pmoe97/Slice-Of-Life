# AI-Assisted Character Generation — session prompt

> **RETIRED 2026-08-26 — do not run this prompt.** All seven phases are built
> and verified and `ai-character-generation-plan.md` sits beside this file in
> `src/ref/complete/`. Its Status header says COMPLETE and its Status table has
> no unstarted row, so Step 0 below would correctly tell you to stop — this
> banner just saves you the reading. Kept as the design record of how the
> overhaul was run. Further work on AI character generation is a change to a
> finished system: start from the plan's `## Locked decisions` (D1–D14), not
> from this protocol.

Hand this to an implementation session **verbatim**. It is reused unchanged
every session; the plan's Handoff section, not this prompt, is what tells you
where things stand.

---

You are one session in a long-running series implementing the **AI-Assisted
Character Generation** overhaul for this game — a "Describe & Generate"
section on every surface where a character is edited, so that one typed
sentence ("the ex-Marine landlord's kid who never left") fills a whole
character sheet the player then edits, instead of several hundred fields they
mostly don't care about.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/ai-character-generation-plan.md`.

The first phase not marked built is your phase. Phases 1 and 2 are a hard
ordering — **never build the engine before free text works**. Phase 2 has no
UI and Phase 1 has no generator, so both are independently verifiable, but
building 2 first makes every later phase's verification blind to whether a
generated value actually *displays*, which is the single failure this plan
exists to prevent (design invariant 6).

Phases 3, 4, 5 and 6 are mutually independent and may be taken in any order.
Whichever runs first authors the shared `renderConceptSection` renderer; if
that is not Phase 3, say so in the Handoff so the next session knows where it
lives. Phase 7 depends on Phase 4.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off, and it currently carries two deviations from the original phase
  text that will bite you if you miss them (D4 moved into Phase 1; its
  resolvers live in `sim.js`, not `concept.js`).
- Then "Locked decisions", "Data model", your phase block, and "Design
  invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error — this
  codebase's files are large and move constantly. Grep for the identifier, not
  the line.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate.
- When told to reuse a pattern, go read that code and match its current shape.
  Patterns to mirror, by name and file:
  - `PLAYER_STUDIO_TABS` (`src/srcfiles/studio.js`) — the one-table discipline:
    populate and read both walk the same table, so a field can never be
    offered and then silently dropped.
  - `rollCastSlot`'s partial contract (`src/srcfiles/sim.js`) — "whatever is
    supplied is held fixed; everything else is rolled". A concept fill is a
    fat partial, never a second construction path.
  - `doClassifiedsStudioSaveEdits` (`src/srcfiles/ui.computer.js`) — the
    validate → skip-no-op → apply → log-to-`bibleChanges` → one-revision-per-pass
    loop. Phase 6 reuses this rather than writing its own.
  - `mergeProseIntoBible` + `roommateAuthoredFields` (`src/srcfiles/llm.js`,
    `src/srcfiles/menu.js`) — the authored-field lock and its prefix-match
    coverage rule.
  - `comboControl` / `offPoolValues` (`src/srcfiles/fields.js`) — how a
    control accepts and displays a value outside its pool.

- **Hard technical rules**, each with the consequence that earned it:
  1. **Register a new source file in `index.html` AND `dev/verify/loadgame.js`
     in the same commit.** `rumination.js` shipped to only one of the two and
     five harnesses with 175 assertions died silently.
  2. **Bump the `?v=` query on every `index.html` script tag you edit.** The
     browser will serve you a cached file and you will debug a change that
     never loaded.
  3. **Never author a field without its reader in the same phase.**
     `stressProfile` sat on all 20 occupation entries, read by nothing, until
     a correctness pass deleted it.
  4. **Never write to `kv` outside `state.js`.**
  5. **Determinism is asserted.** Anything you add inside `rollCastSlot` must
     draw no randomness, or a given seed's household changes. `weightedPick`
     consumes exactly one `rng()` regardless of candidate-list length — that
     is what makes D4's resolve-to-one-candidate safe, and it is the shape any
     similar change must preserve. Prove it with a hash over several seeds
     against a clean `HEAD` worktree, the way Phase 1 did.
  6. **Free text is decided by the validator, never by taste.** `enum` in
     `CHARACTER_SCHEMA` is the only vocabulary gate `validateNpcScalar`
     applies. Derive the picker/free-text split from the schema; never restate
     it in a table that can drift.
  7. **A generated value must display in the control that owns it.** Storing a
     value the form cannot show is worse than not storing it — the next form
     harvest destroys it and the player watches their character revert with no
     error. Check the *display* half of every round trip, not just the store.
  8. **`_touched` never reaches a bible.** Strip it explicitly in every
     adapter; do not rely on `validateCharacter` to drop unknown keys.
  9. **Nothing in the UI ever says "vibe"** (D6). The label is "Describe &
     Generate", the button is "Generate". Internal identifiers use the
     `concept` prefix.

- **Actually run the phase's Verification steps.** Verification happens in two
  places and both matter:
  - **Node harnesses** (`node dev/verify/verify-*.js`) for anything pure. At
    minimum re-run `verify-sbx-p1/p2/p3/p7` and `verify-cal-p1..p4` after any
    change touching character data flow, and compare counts — `p1`, `p3` and
    `p7` each carry **one known pre-existing failure** that is not yours to
    fix. For a full `run-all.js` comparison, measure the baseline from a clean
    `git worktree add /tmp/<dir> HEAD --detach` rather than trusting memory;
    the baseline at the start of this plan was **72 failed, 8 errored**.
  - **The live page** for anything with a surface. Serve with the
    `slice-of-life` launch config and drive `dev-harness.html` — `index.html`
    cannot boot outside Perchance because it needs `root`. Prefer
    `read_page` / `javascript_tool` assertions over screenshots. **Reload
    before trusting anything**, and pair that with rule 2.
- Once verified, **stop.** One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's `## Handoff — read this first` section (Resume at /
   Last session's notes / Blockers). **Name the real identifiers you
   created** — function names, file names, action verbs, CSS classes. The next
   session greps for them; prose about "the new renderer" is useless.
2. Update the phase's row in the `## Status` table, and the Status header if
   the whole plan is done. Never leave Status and Handoff disagreeing — this
   is the most common failure in practice.
3. If the phase resolved an open question, promote it into "Locked decisions"
   as a new D-number and strike it from "Open questions".
4. **If the phase deviated from its written text, say so in the Handoff and
   amend the phase block itself.** Phase 1 pulled D4 forward and relocated its
   resolvers; the plan says so in three places rather than leaving a future
   session to discover it by grep. Do the same.
5. If this was the last phase, mark the Status header complete and move both
   the plan and this prompt to `src/ref/complete/` **together** — they are a
   pair — and update `src/ref/README.md` and
   `src/ref/structural/ARCHITECTURE.md` in the same commit.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
