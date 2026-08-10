You are one session in a long-running series implementing the **Restaurant
Network Expansion** overhaul for this game — growing the DoorDrop restaurant
network from 6 places to 12, expanding every menu to full size, adding
meal-category coverage (breakfast / lunch / dinner / late-night-craving /
24-hour), and enforcing one hard invariant: **at least two restaurants open
at every half-hour tick of every day.** You have no memory of any previous
session. Everything you need to know about where things stand is either in
the target document's **Handoff** section or must be discovered by reading
the current code — never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status section, not the full doc)

Read only the `## Handoff — read this first` header line and the
`## Status`-equivalent markers in `ref/restaurant-network-expansion-plan.md`
(the plan's phases are listed as numbered `## Phase N` sections; its
Handoff section tracks exactly which one is next).

The first phase not marked done/complete is your phase — go to Step 1. The
phases must be done in order: Phase 1 (hours model), Phase 2
(cross-midnight deliveries), Phase 3 (new restaurants + full menus), Phase
4 (verification). Phase 4 is the only one that depends on the earlier three
being done — the others are independent enough that a partial Phase 3
(more data) is always safe, but never skip Phase 1 before Phase 2: Phase 2
assumes wrap-aware hours exist.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a given
session — read the Handoff section, the plan's design intro ("The target
roster" + "Coverage proof") once so you understand the shape, then the
specific phase block (goal / where / steps) for the phase you're on.

## Step 1 — read the plan's Handoff section, then the relevant phase

- The plan's `## Handoff — read this first` section is the single source of
  truth for exactly where the last session left off — read it before
  anything else.
- Then read the plan's "The target roster" and "Coverage proof" tables
  (every phase depends on them — the roster is the data contract and the
  coverage proof is the invariant the whole change exists to satisfy), and
  the specific phase you're resuming or starting.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** These documents drift as the codebase changes
  under them — a citation may have moved since it was written. Find the real
  current location by name/content, not blindly by line number. A stale
  citation is expected, not an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code, or
  a "locked decision" (e.g. no `price` on dish item defs so takeout doesn't
  leak into Nile's catalog; keep every existing `restaurantId` unchanged so
  in-flight `world.foodOrders` records keep resolving) turns out to be
  unworkable given how something else actually works, **stop and flag it** —
  add a note under the Handoff section's "Blockers / flagged deviations,"
  explain exactly what you found, and end the session there rather than
  improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started — no more. Don't pull
  forward work from a later phase even if it looks convenient right now; the
  phase boundaries are deliberate (dependency order, risk, and verification
  granularity all assume phase-sized chunks, and each phase is meant to be
  reviewed on its own). The one deliberate exception: data added in Phase 3
  (dish `ITEM_DEFS` lines, restaurant defs) may be written in any order and
  can be split across sessions without harm — a Phase 3 session that runs
  out of budget having expanded four of twelve menus is a fine stopping
  point, as long as every menu entry added has a real `ITEM_DEFS` behind it
  and no restaurant's `menu` is left referencing a missing dish.
- When a phase says to mirror an existing pattern ("exactly the pattern the
  escort booking screen already uses at `render.computer.js:1495`," "same
  conventions as the existing five restaurant defs"), go read that existing
  code first and match its actual current shape — don't approximate from the
  doc's paraphrase.
- **Actually run the phase's Verification steps before considering it done**
  — don't mark it complete because the code looks right. There is no test
  harness in this repo; verification is done by loading the live page and
  exercising the game through the fresh-iframe `browser_eval` technique (see
  `ref/ARCHITECTURE.md`'s P2 section for the iframe pattern and the
  snapshotting caveat). For Phase 1 and 2, drive the actual DoorDrop flow
  end-to-end (open the app, browse, filter, cart, place an order, advance
  the clock past arrival, confirm the handover). For Phase 3, assert the
  ≥2-open-at-every-tick invariant across all 48 ticks plus the menu-integrity
  checks listed in the plan's Phase 4.
- Once a phase is genuinely complete and verified, **stop.** Do not roll
  into the next phase in the same session, even if you have context budget
  left — one phase per session is the point of this workflow.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Update the plan's `## Handoff — read this first` section (overwrite it,
   don't append to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified, anything
     that surprised you (moved citations, a small necessary deviation and
     why, the actual dish/restaurant ids added).
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase marker in the plan doc: mark the phase "Done" (or note
   it as in-progress/partial) — never leave the Handoff and the phase
   markers disagreeing with each other.
3. If you completed Phase 4 (the last phase), mark the plan's Status header
   line "**complete**" so Step 0 of the next session correctly reports the
   work as done.

Do not end a session without doing this, even if you ran out of useful
context mid-phase — a half-finished phase with a precise Handoff note is
recoverable; a half-finished phase with no note is not.
