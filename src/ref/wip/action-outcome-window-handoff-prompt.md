You are one session in a long-running series implementing the **Action
Outcome Window** overhaul for this game — a reusable `ActionWindow`
component that shows narration, usually an image, and a "what changed"
delta strip whenever the player does something that matters, so an action
never again resolves as a silent DOM repaint. When finished, verbs from a
quick nap to a full shared dinner scene each open a focused pane that
closes only once their outcome is legible, instead of leaving the player
to go check three different panels to find out what happened.

You have no memory of any previous session. Everything you need to know
about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be
told which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/ref/wip/action-outcome-window-plan.md`.

The first phase not marked "Done" is your phase. The six phases run in
this order, with two named exceptions: **Phase 5** (the AfterHours/
`invite-dinner` scheduling picker) needs only Phase 1 and may run in
parallel with 2/3/4 whenever it's more convenient. **Phase 6** (the long
tail) may begin piecemeal as soon as Phase 1 lands, but any row that turns
out to need the D6 handoff should wait for Phase 4 rather than duplicating
that migration early — check Appendix A's per-row notes before pulling a
Phase 6 row forward.

Never skip Phase 1 before anything else — every later phase's Files
section assumes `ActionWindow` and its render/dismiss contract already
exist. Never skip Phase 2 before Phase 3 — `sit`'s Tier D scene depends on
the D6 handoff and D7 gate Phase 2 builds.

**Phase 4 carries a hard external block:** it does not start until the
user has explicitly confirmed whether `peek.js` and the two existing
bubble patterns (interruption, caught-peeping-by-an-NPC) fully migrate
onto `ActionWindow`, or stay separate implementations modeled on it. If
you reach Phase 4 and this hasn't been confirmed in the plan's Locked
decisions yet, **stop and ask the user** — do not infer an answer and
proceed, even though the plan's own Handoff section leans toward "yes."

If all six phases are marked Done, **stop** and report that completion to
the user. Note for that report: the Dream Engine (D11 — what actually
generates sleep/nap's imagery) is deliberately out of this plan's scope
and is a separate, likely not-yet-written document — the outcome window
being "done" does not mean sleep/nap's dream content is designed.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" (D1–D14 — read all of them once; later phases
  lean on early ones, e.g. Phase 3 needs D5/D6/D7/D10/D12/D13 all at once),
  "Data model", the phase block, and "Design invariants".
- **Cross-check every cited file and line number against the actual
  current code before trusting it.** A stale citation is expected, not an
  error — find the real current location by name/content.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations"
  and end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate — Phase 1
  proves the component on the two simplest image paths at once
  (fresh/reused, D5) before anything depends on it; Phase 2 proves the
  handoff/gate primitives on the simplest real case (an NPC overture)
  before Phase 3 spends them on `sit`, the single most architecture-
  exercising verb in the plan.
- When told to reuse a pattern, go read that code and match its current
  shape — don't work from this prompt's or the plan's paraphrase. Patterns
  to mirror:
  - `src/srcfiles/peek.js` + `render.js`'s `renderPeekOverlay` — the
    pure-logic/render split `actionwindow.js` must copy exactly (peek.js
    decides, render.js only projects; peek.js holds "NO logic of its own"
    per its own file comments).
  - `src/srcfiles/image.js`'s `composePeekKey` and its siblings — the
    LRU-cache-by-composed-key pattern D5's archetype/instance split reuses
    rather than reinventing.
  - `src/srcfiles/effects.js`'s `applyEffects` and its typed effect list —
    the delta strip's only data source; never compute a delta by any other
    means.
  - `src/srcfiles/npc.js` / `src/srcfiles/overture.js` / `src/srcfiles/drives.js`
    (`npc.overture`'s commit/decide substrate) — what Phase 2's
    world-initiated gate rides, and what Phase 3's per-NPC "Can I join
    you?" ask is proposed to reuse in a meal-joining flavor (D12).
- **Hard technical rules**, each a Design invariant from the plan — repeat
  them here because they're the ones easiest to violate by accident:
  - The window is a renderer, not a decision-maker. If you find yourself
    writing a chance roll or an effect calculation inside
    `actionwindow.js`, stop — that logic belongs in the verb's own file,
    with `actionwindow.js` only reading the result.
  - A handoff (D6) is outcome-conditional, never verb-conditional. Don't
    hard-code "verb X always talks afterward" — branch on the outcome
    value the verb's own logic already produced.
  - Every image goes through `image.js`'s existing cache/budget machinery.
    A direct `generateImage` call from inside `actionwindow.js` is a bug,
    not a shortcut.
  - `main.html`'s script tags and `dev/verify/loadgame.js`'s `ORDER` array
    both need a line for any new `src/srcfiles/*.js` file, in the same
    commit — a file present in only one has silently broken every harness
    that touches it before in this project's history (see
    `structural/ARCHITECTURE.md`'s Load order section for the current list
    and where a new file belongs in it).
- **Actually run the phase's Verification steps.** This plan is UI-and-
  presentation work almost end to end, so verification happens on the
  **live page** — a Node harness cannot exercise DOM rendering, image
  generation, or dismissal timing. At minimum, on every phase: confirm
  dismissal still requires a tap (D1) and never auto-advances, and confirm
  a sample of untouched Tier A verbs still resolve with no window at all
  (a regression there means something is intercepting the action pipeline
  too broadly).
- Once verified, **stop.** One phase per session is the point, even with
  budget left.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes
   / Blockers). Name the real identifiers you created — function names,
   cache-key formats, the exact `outcomeWindow` shape you landed on if it
   drifted from the Data model sketch — because the next session greps for
   them, not for prose.
2. Update the phase's row in the `## Status` table. Never leave Status and
   Handoff disagreeing — a later session's Step 0 reads only the table.
3. Promote any resolved open question into `## Locked decisions` as a new
   D-number (continue from D14). If Phase 4's migration question gets
   answered this session, this is where that answer becomes permanent.
4. Phase-specific obligations:
   - **Phase 1:** record the actual cache-key shape you chose for the
     archetype/instance split — the next phase's images depend on it
     matching, not on redescribing it from memory.
   - **Phase 3:** record which of the four guest-list branches (none /
     confirmed only / walk-in only / both) you actually exercised live,
     and how you forced each one — a future audit will want to re-run
     exactly that.
   - **Phase 4:** record the before/after confirmation that every peek
     outcome (`stop`/`ignore`/`escalate`/`engage`/`confront`) still
     narrates and applies effects identically post-migration — this
     phase's whole risk is a silent behavior change, so the note that
     nothing changed is the deliverable, not just the migration itself.
5. If this was Phase 6, mark the plan's Status header **complete** and
   note explicitly that the Dream Engine remains a separate, open item —
   don't let "the outcome window plan is done" read as "sleep/nap's
   imagery is designed."

Do not end a session without doing this. A half-finished phase with a
precise Handoff note is recoverable; a half-finished phase with no note is
not.
