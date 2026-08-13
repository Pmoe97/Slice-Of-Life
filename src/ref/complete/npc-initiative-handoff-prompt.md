# Session prompt — NPC Initiative & Social Verbs (Plan 5)

> **RETIRED — Plan 5 shipped all six phases on 2026-08-13.** Do not hand this
> to an agent expecting work: its Step 0 says to find the first phase not
> marked Done, and there is none. It is kept beside the plan as the record of
> how those six sessions were run, and as a model for the next overhaul's
> prompt (`patterns/HANDOFF-PROMPT-ARCHITECTURE.md` is the generic form).

Held *how to work* while the plan was live;
`src/ref/complete/npc-initiative-plan.md` holds *what was built*.

---

You are one session in a long-running series implementing the NPC Initiative
overhaul for this game — giving NPCs the ability to *open*. Today every
language beat in the game except two adult-content interruptions is initiated
by the player. This plan makes an NPC cross the room because they want
something, and gives the player things to do *with* someone rather than *at*
them.

You have no memory of any previous session. Everything you need is either in
the target document's Handoff section or must be discovered by reading the
current code — never assume continuity with a prior chat. This prompt is reused
verbatim every session. Don't wait to be told which phase to work on — find it
yourself.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/npc-initiative-plan.md`. The first phase not marked Done is
your phase.

* **Hard prerequisite: never do Phase 3 before Phase 2.** Four of this plan's
  five motivation sources measured **exactly zero** at design time. An overture
  system built on them passes a harness and does nothing in play. Phase 2 is
  what makes the plan measurable at all.
* **Phase 1 is independent** and ships first — it needs only `npc.mood`, the
  one source measured alive.
* **Phase 6 is always last.** Phases 3, 4 and 5 all change what scores what.
* **Ordering exception.** Phases 4 and 5 are independent of each other, both
  after Phase 3.
* **Stop condition.** If every phase is Done, stop and report the plan complete.
  Do not invent further work.

You should never need to read the whole plan document in one session.

## Step 1 — read the Handoff, then your phase

* **Handoff first.** It is the single source of truth for where the last
  session left off, and it carries hard-won specifics.
* Then `## Locked decisions`, `## Data model`, your phase block, and
  `## Design invariants`. **Read `## Evidence` the first time you touch any
  phase that changes behaviour** — the four-sources-read-zero finding is the
  reason this plan is shaped the way it is.
* **Cross-check every cited file and line number against the current code
  before trusting it.** Find things by name, not by line number. A stale
  citation is expected, not an error.
* If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** — add a note under "Blockers / flagged
  deviations" and end the session there. Do not improvise a silent workaround;
  it looks like progress and surfaces three phases later.

## Step 2 — do exactly one phase, then stop

**Scope.** Implement only that phase. Phase boundaries encode dependency order
and review granularity.

**Reuse, don't approximate.** Go read these and match their current shape:

* `scoreCandidates`, `scoreDrive`, `choosePursuit`, `shouldBreakPursuit`,
  `openPursuit`/`releasePursuit`/`agePursuit` — `src/srcfiles/cognition.js`.
  An overture is selected by this scorer (D1); it is not a second one.
* `evaluateDrives`, `resolveStandardDrive`, `applyDriveLeaves` —
  `src/srcfiles/drives.js`. `expresses` is applied where `emitsSignal` and
  `leaves` already are, so a drive's full footprint reads in one place.
* `npcCuriosity` — `src/srcfiles/sim.js`. The pattern `npcDisinhibition` must
  copy: one definition extracted precisely so two inline copies cannot drift.
* `checkRelConsequences` — `src/srcfiles/ui.js`. Where `mayInitiate` and
  `highDesire` are computed and dropped. D20: wire them or delete them.
* `createCommitment`, `respondToCommitment`, `activeCommitmentFor` —
  `src/srcfiles/commitments.js`. Its header already anticipates non-meal kinds.
* `perceiveSignals` / `mergePerceived` / `deriveStandingSignals` —
  `src/srcfiles/signals.js`. Phase 1's expressions are entirely built on these.
* `ruminate`, `topOpenQuestion` — `src/srcfiles/rumination.js`,
  `src/srcfiles/npc.js`. The D7 inference rules Phase 2 must make fire.
* `startInterruptionPreGeneration`, `showInterruptionBubble` —
  `src/srcfiles/interruption.js`, `src/srcfiles/ui.computer.js`. The existing
  precedent for an NPC-initiated beat *and* for generating its line ahead of
  need.

**Hard technical rules.** Each carries its consequence:

* **The tick stays synchronous, pure and LLM-free (R2, D18).** The decision to
  make an overture is arithmetic; the line is generated at the moment it
  surfaces, on the player's time budget. Nothing in this plan may be `async` or
  reach `root.generateText` from inside the tick. A harness assertion stubs
  `generateText` and fails if the tick ever calls it.
* **Scoring is pure; committing is a named writer.** `npc.overture` has exactly
  one writer (D19). Convention already failed once here — five drives grew
  their own bypass of Plan 3's weight roll without anyone deciding the model
  had changed.
* **One committed intent per NPC.** `npc.pursuit` and `npc.overture` must never
  both resolve in the same npc-tick. Plan 3 made that clobber impossible by
  construction; do not reintroduce it by addition.
* **Expressions cost no tick.** An expression that starts consuming one is a
  bug — it breaks Plan 3's one-action-per-tick guarantee.
* **Three words are already taken.** `commitment` is `commitments.js`,
  `pursuit` is Plan 3, `intent` is the player's classifier. Use **`overture`**,
  and put new code in `src/srcfiles/overture.js`, loaded after `cognition.js`.
* **No field without its reader in the same phase** (R8/RI6). This plan begins
  with two flags that have never caused anything to happen; do not add a third.
* **Content flags gate desire-driven behaviour** (D14).
  `meta.contentConfig.contentFlags.romance` / `.mature` already exist and the
  player owns them. An overture is always declinable (D10).
* **Bump `?v=N` in `main.html` for every file you change.** They are
  independent per-file counters. A new file needs a `<script>` tag —
  `overture.js` loads after `cognition.js`.
* **A new `src/srcfiles/*.js` needs a line in `dev/verify/loadgame.js`'s
  `ORDER` too.** `rumination.js` shipped without one and silently killed 175
  assertions across five harnesses for two plans.
* Do not put backslash escapes through a `python - <<'PYEOF'` heredoc in this
  environment. Use the literal character.

**Three measurement traps this plan already fell into.** All three cost real
time:

* **`resolveBatch(gameState, ticks)` returns `{ state, events, peepResults }`
  and does not mutate its argument.** Read `g.npcs` after calling it and every
  need reads a flat 50.
* **`resolveBatch` does not write episodes.** `ui.js`'s `advanceAndResolve`
  does, outside the tick. Measure memory occupancy headlessly and you read 0
  episodes, 0 facts and 0 open questions, which looks exactly like a dead
  knowledge layer. Simulate the loop — the plan's Evidence section shows how.
* **A freshly generated house never gets dirty on its own until Plan 3's Phase
  4 traces accumulate**, and every relationship axis generates at 0 and never
  moves without player conversation. If you are measuring anything relational,
  you must move the axes deliberately first.

**Verification is not optional**, and where it happens depends on the phase:

* **Pure logic → the Node harness.** `node dev/verify/run-all.js` runs all of
  it; `node dev/verify/verify-i1.js` runs one. **Read `dev/verify/README.md`
  first** — its seven rules exist because each was broken once. Add a
  `verify-i*.js` for your phase covering the invariant, not just the instance.
* **Behaviour over time → the instrument.** `measure-cognition.js` for what the
  cast does; `measure-signals.js` for propagation;
  `dev/verify/measure-initiative.js` is Phase 6's to create. Instruments print;
  they do not assert.
* **Feel → the browser.** `dev-harness.html` on the `slice-of-life` launch
  config (port 8734), with a cache-buster (`?cb=7`). Phase 6 in particular is a
  feel judgement with a number as its proxy, **and the feel judgement wins**.
* **Always re-run the whole suite before finishing.** It is 662 assertions
  across five completed plans and it has caught real regressions in phases that
  "obviously" could not have broken anything. **A harness reported as
  `DID NOT REPORT` is not a harness that passed** — never read past that line.

Once your phase is verified, stop. Do not roll into the next one even with
budget left. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. **Overwrite** the plan's `## Handoff` section — Resume at / notes /
   Blockers. Overwrite, do not append: a growing history buries the current
   state. Name the real identifiers you created; the next session greps for
   them.
2. Update your phase's row in the Status table. **Never leave Status and
   Handoff disagreeing** — a plan shipped with a header claiming "Phase 4 of 5"
   while its own table said complete.
3. Promote any resolved open question into Locked decisions as a new D-number
   and strike it from `## Open questions`.
4. **Record any tuning number you set by measurement, with what you measured
   and on what population.** Several constants in this codebase were wrong on
   the first pass in both directions. A number with no note saying how it was
   obtained is a number nobody can safely change.
5. If a measured figure in `## Evidence` moves, update it there and say which
   phase moved it. A stale baseline makes every later comparison a lie.
6. If this was the last phase: mark the Status header complete, move both the
   plan and this prompt to `src/ref/complete/`, and update all three indexes in
   the same commit — `src/ref/README.md`,
   `src/ref/structural/ARCHITECTURE.md`, and the Plan 5 row in
   `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md`. House rules 3 and 4.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
