You are one session in a long-running series implementing a set of linked
overhauls for this game — renovation & occupancy, the Contractor Friend &
tutorial, and the external world / services / NPC framework. You have no
memory of any previous session. Everything you need to know about where things stand is either in
the target document's **Handoff** section or must be discovered by reading
the current code — never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which document or phase to work on — find it yourself using the steps
below.

## Step 0 — find out where you are (cheap: Status tables, not full docs)

Check these three documents **in order**, reading only the `## Status` table
near the bottom of each:

1. `ref/renovation-occupancy-overhaul-plan.md`
2. `ref/contractor-tutorial-overhaul-plan.md`
3. `ref/external-world-npcs-overhaul-plan.md`

The **first** one with any phase not marked "Done" is your document, and the
first not-Done phase in it is your phase — go to Step 1. Documents 1 and 2
were complete when this protocol was written, so in practice you will
usually land in document 3; confirm that from the tables rather than
assuming it.

If all three are fully done, **stop** and report that completion to the user.

You should never need to fully read more than **one** of the three
documents in a given session. If your current document's phase explicitly
depends on something from another document (e.g. a function signature the
Contractor doc's Phase 2 needs from the Renovation doc's Phase 1), open only
the relevant section of that other document — not the whole thing.

**One cross-document case needs care.** `ref/external-world-npcs-overhaul-plan.md`
Phase 4 deliberately modifies already-shipped renovation code: it changes
`etaDay` from raw calendar days to *working* days and adds a paid
weekend-rush option. That is intentional, not a conflict. When you do that
phase, also update `ref/renovation-occupancy-overhaul-plan.md`'s description
of `etaDay`, so a completed document doesn't keep describing behavior that
no longer exists.

## Step 1 — read your document's Handoff section, then the relevant phase

- Your document's `## Handoff` section (right near the top) is the single
  source of truth for exactly where the last session left off — read it
  before anything else.
- Then read the document's Thesis and "Locked decisions" sections (they're
  short and every phase depends on them), and the specific phase block
  (Goal / Files / Verification) you're resuming or starting.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** These documents drift as the codebase changes
  under them — a citation may have moved since it was written. Find the real
  current location by name/content, not blindly by line number. A stale
  citation is expected, not an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code, or
  a "locked decision" turns out to be unworkable given how something else
  actually works, **stop and flag it** — add a note under the Handoff
  section's "Blockers / flagged deviations," explain exactly what you found,
  and end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started — no more. Don't pull
  forward work from a later phase even if it looks convenient right now; the
  phase boundaries are deliberate (dependency order, risk, and verification
  granularity all assume phase-sized chunks, and each phase is meant to be
  reviewed on its own).
- When a phase says to reuse an existing pattern ("mirrors
  `processDeliveriesForDay`," "same shape as `trackerDeliveries`"), go read
  that existing code first and match its actual current shape — don't
  approximate from the doc's paraphrase.
- **Actually run the phase's Verification steps** before considering it
  done — don't mark it complete because the code looks right. If you can
  exercise the game directly (start a save, advance the clock, click
  through the UI), do that for the core behaviors listed.
- Once a phase is genuinely complete and verified, **stop.** Do not roll
  into the next phase in the same session, even if you have context budget
  left — one phase per session is the point of this workflow.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Update the document's `## Handoff` section (overwrite it, don't append to
   a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified, anything
     that surprised you (moved citations, a small necessary deviation and
     why).
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase's row in the `## Status` table: "Done," "In progress,"
   or leave "Not started" if you didn't get to it — never leave Status and
   Handoff disagreeing with each other.
3. If you completed the last phase of a document, mark the whole document's
   Status header line accordingly so Step 0 of the next session correctly
   moves on to the next document.

Do not end a session without doing this, even if you ran out of useful
context mid-phase — a half-finished phase with a precise Handoff note is
recoverable; a half-finished phase with no note is not.
