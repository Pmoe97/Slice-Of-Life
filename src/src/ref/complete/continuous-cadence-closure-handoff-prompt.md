You are one session in a long-running series implementing the **Continuous
Cadence Closure** overhaul for this game — closing the gap between what
`CONTINUOUS-SIMULATION-ROADMAP.md` claims (NPC decisions are event-driven,
checked on their own continuous schedule) and what actually ships (a
continuous data model discovered only on a flat 30-minute poll), plus the
scene-presentation staleness bugs that gap produces (a departed NPC's
portrait or Talk chip lingering, a conversation reopenable with someone no
longer in the room). You have no memory of any previous session. Everything
you need to know about where things stand is either in the target
document's **Handoff** section or must be discovered by reading the current
code — never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/src/ref/complete/continuous-cadence-closure-plan.md`.

The first phase not marked "Done" is your phase, reading the table top to
bottom. Phases 1-4 are independent of each other and of everything after
them — order among those four doesn't matter. **Never start Phase 7 before
Phases 5 AND 6 are both merged and independently verified** — Phase 5
converts every remaining flat "per 30-minute tick" rate in the sim's Pass 2
to a per-minute rate; skipping it before Phase 7 lets `resolveTick` resolve
variable-length spans against un-converted math, which silently mistunes
dirt/mood/complaint-chance systems in a way no test catches until a player
notices the numbers feel wrong weeks later. Phase 6 (the next-wake-time
primitive) has no hard code dependency on Phase 5, but there's no reason to
build it before Phase 5 makes it safe to actually wire in.

If all nine phases are complete, **stop** and report that completion to the
user rather than inventing further work.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" (D1-D9 — short list, read all of it; every phase
  after 1 depends on at least one of D3-D9) and "Data model".
- Then your phase's own block under "Implementation phases", and the
  "Design invariants" at the bottom — invariant 3 in particular is the one
  rule every phase from 5 onward exists to protect.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** Find the real current location by name/content,
  not blindly by line number. A stale citation is expected, not an error —
  this plan's own citations were gathered by an investigating agent, not
  hand-verified line-by-line at write time.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode real dependency
  order (see Step 0) and real risk containment (Phase 5 exists specifically
  so Phase 7 isn't a leap of faith).
- When told to reuse a pattern, go read that code and match its current
  shape — don't work from this plan's paraphrase. Patterns to mirror:
  - `needs-and-heartbeat-plan.md`'s own `decayPerTick` → `decayPerMinute`
    conversion (`ref/complete/`) — Phase 5's exact technique, already proven
    once in this codebase; read how THAT plan did it before inventing your
    own approach.
  - `getPresentNpcIds` (sim.js) — the live-location reader Phase 1's
    `reconcileScenePresenceForRoom` must call, never reimplement.
  - `planWalk`/the commitment-anchored NPC walk (movement.js) — what Phase
    4's wander movement must route through, not parallel.
  - `activeMealCommitmentsInRoom`/`activePartyCommitmentInRoom`
    (commitments.js) — the "everything in `clockToAbsolute` space, no tick
    index" convention every one of this plan's own reads/writes must match.
- **Hard technical rules:**
  - Invariant 1: a conversion phase (2/3/4/5) that produces a different
    wall-clock outcome than the tick-indexed version would have is wrong.
    Verify against the OLD behavior at the old granularity before trusting
    the new one at any other span.
  - Invariant 2: `resolveTick`'s Pass 1/2/3 internal contract does not
    change, ever, in this plan — only the units of its constants (Phase 5)
    and the span it's asked to resolve (Phase 7). Every other system already
    riding that loop (the house-party mechanic from the
    actions-and-activities-overhaul-plan, in particular) must keep working
    unmodified.
  - Invariant 5: zero new LLM calls anywhere in this plan, including Phase
    8's ambient ticker — it surfaces already-recorded events, it does not
    generate anything.
- **Actually run the phase's Verification steps.** Pure logic verified in
  `node src/src/dev/verify/*.js` per this project's own established split;
  presentation (Phase 1's chip/cutout staleness, Phase 8's ticker placement)
  verified live in `dev-harness.html` — a local server proves nothing about
  the actual LLM-fallback/scene-render pipeline the live page exercises. At
  minimum, every phase from 2 onward should re-run
  `node src/src/dev/verify/run-all.js` (filtered during iteration, full
  unfiltered once near the end) and treat any failure-count movement outside
  this plan's own new/touched files as a stop-and-investigate, exactly the
  discipline the actions-and-activities-overhaul-plan already established —
  don't re-derive that discipline, just follow it. Phase 5 specifically must
  re-run `verify-aa-p17.js` by name, since it rides the exact Pass 2 loop
  this phase is converting.
- Once verified, **stop.** One phase per session is the point, even with
  budget left.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). Name the real identifiers you created — function names, the
   real module a "TBD" phase (6, 8) landed in — because the next session
   greps for them, not for prose.
2. Update the phase's row in the `## Status` table. Never leave Status and
   Handoff disagreeing.
3. Promote any resolved open question into `## Locked decisions` as a new
   D-number (continue from D9).
4. Phase-specific obligations:
   - Phase 5: record the actual probability-conversion formula used for each
     chance-based rate (per-tick chance → per-minute chance is NOT a linear
     scale — get this right and record how it was verified statistically).
   - Phase 6: record the real module `nextWakeAbs` landed in.
   - Phase 7: record the measured before/after — a commitment ending
     mid-tick is now discovered at its own real minute, with a concrete
     example (which NPC, which commitment, which two clock reads).
   - Phase 8: record the real render.js hook point decided at Phase 8-time
     per the plan's own Open Question.
5. If this was Phase 9, mark the plan's Status header complete.

Do not end a session without doing this. A half-finished phase with a
precise Handoff note is recoverable; a half-finished phase with no note is
not.
