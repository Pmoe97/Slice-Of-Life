You are one session in a long-running series implementing the **Night Scene**
— the sleeping-NPC free-play minigame that replaces this game's old
one-roll-decides-everything sleeping interaction with a real resource-managed
scene. You have no memory of any previous session. Everything you need to know
about where things stand is either in the target document's **Handoff** section
or must be discovered by reading the current code — never assume continuity
with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

**One thing that is NOT drift, read this before anything else:** this repo
mirrors Perchance's own container shape. The game's source lives at
`src/src/srcfiles/`, design docs at `src/src/ref/`, the dev harness at
`src/src/dev/verify/` — **all nested one level deeper than a plain `src/`
layout**. Only `index.html`, `main.pjs` and `dev-harness.html` sit outside both
layers. If you find yourself typing `src/srcfiles/...`, stop — it's
`src/src/srcfiles/...`. This has burned a session before.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/src/ref/complete/night-scene-sleeping-npc-plan.md`.

The first phase not marked "Done" is your phase, reading the table top to
bottom.

**Two ordering rules that are not obvious from the table:**

- **Phase 3 begins with a mechanics revision, not with DOM.** The UI design
  session (2026-09-04) changed four things about already-landed Phase 1 code —
  the composed action grammar replacing flat `zoneId`s (D16), the deletion of
  `nightStepQuell` (D17), the demotion of Ghost/Bail from game states to
  descriptions (D22), and per-action XP (D23). Building a tray against the
  current Phase 1 signatures builds a UI for a game that no longer exists. Land
  the resolver revision and its harness first, in the same session, before
  writing a line of the overlay.
- **Phases 5 and 6 do not depend on the UI.** If Phase 3 or 4 is blocked for a
  reason you cannot resolve, either of those is a legitimate thing to pick up
  instead — say so explicitly rather than forcing the blocked phase.

If all six phases are complete, **stop** and report that to the user rather
than inventing further work.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off, including defects found but not yet fixed.
- Then `## Locked decisions` (D1–D14; several are superseded or amended
  tombstones — read the amendments, they are where the current truth is) and
  `## UI — locked (D15–D26)`. A UI or imagery phase needs D15–D21 in full; a
  mechanics phase needs D16/D17/D22/D23/D24.
- Then `## Data model`, your phase's own block under `## Implementation
  phases`, and the `## Design invariants` at the bottom. **Invariant 1** (the
  hard `'asleep'` willingness floor is never relaxed) and **invariant 3**
  (image generation is never on the critical path) are the two that every
  phase can break by accident.
- **Cross-check every cited file, function and line number against the actual
  current code before trusting it.** Find things by name and content, never
  blindly by line number. A stale citation is expected, not an error.
- The night scene's own code lives in one marked region:
  `src/src/srcfiles/boundary.js`, section `===== SECTION: NIGHT SCENE =====`,
  with its tuning in `BOUNDARY.nightScene` (`src/src/srcfiles/config.js`).
- **If your phase touches the UI, read
  `src/src/ref/wip/night-scene-ui-mockups/README.md` before the artboards.**
  Every colour in those files is a hardcoded hex, which was right for a mockup
  and is wrong for this game — it ships **14 colour themes** that override the
  `:root` token block. Pasting an inline `#232342` into the overlay produces a
  night scene that looks correct in `midnight` and broken in the other
  thirteen. The README carries the hex → token mapping to reverse it.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it in the Handoff** and end the session there
  rather than improvising a silent workaround. The last session found two real
  defects and a decision-level contradiction by doing exactly this.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode real dependency order
  and real risk containment.
- **Harness-first where the phase is pure.** Every resolver in this feature is
  a pure function of state + seed and is node-verifiable like the rest of
  `boundary.js`. Add or extend the phase's harness under
  `src/src/dev/verify/` (`verify-night-p1.js`, `verify-night-p2.js` exist) and
  register any new file in **both** `loadgame.js` and `run-all.js` — shipping a
  file to only one of the two is the rumination.js scar, where five harnesses
  and 175 assertions died silently.
- A full `run-all.js` pass currently shows a large number of pre-existing
  failures across files this plan never touches. Do not try to fix them and do
  not let them mask your own: run your phase's harness directly and compare
  `run-all` before and after your change rather than against zero.
- **The LLM narrates, never decides** (invariant 2). If your phase adds
  narration, the meter deltas, wake thresholds and resolutions must already be
  decided by a pure resolver before any text is requested, and a phrasing
  failure must degrade to a fallback line while the mechanics stand.
- **Never `await` a generation on a path the player is waiting on** (invariant
  3). D18 makes imagery frequent; D20's concurrency cap and prefetch are what
  make that safe. A tap resolves instantly or the phase is wrong.
- Don't start the next phase "while you're in there," and don't refactor
  neighbouring systems that merely look untidy.

## Step 3 — mandatory: write the handoff note before ending, every time

Before you finish, update — in this order, as the last thing you do:

1. `## Handoff — read this first` — **overwrite it**, don't append. Resume at /
   what you built / what you found and did not fix / blockers. Name real
   identifiers; the next session greps for them.
2. The `## Status` table row for your phase, with the harness name and its
   pass count.
3. Any question your phase resolved, promoted out of `## Open questions` with
   the answer written where the decision lives.

A phase whose outcome is only in the chat log is a phase the next session
cannot build on.
