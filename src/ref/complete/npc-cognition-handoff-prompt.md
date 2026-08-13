# NPC Cognition — session prompt

Hand this to an agent **verbatim, unchanged, every session**. It is paired 1:1
with `npc-cognition-plan.md` and moves with it. The plan holds *what to
build*; this holds *how to work*.

---

You are one session in a long-running series implementing the **NPC Cognition**
overhaul for this game — replacing twelve independent per-drive coin flips with
utility scoring: each tick, every candidate action is scored against needs,
perceived signals, personality and schedule; the best one is chosen; and the
NPC **commits to it for a few ticks** so that behaviour reads as a person doing
one thing rather than as a queue of coincidences. You have no memory of any
previous session. Everything you need to know about where things stand is
either in the target document's **Handoff** section or must be discovered by
reading the current code — never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/npc-cognition-plan.md`.

The first phase not marked **Done** is your phase.

- **Hard prerequisite.** Never do Phase 2 before Phase 1. The scorer has to be
  a pure, tested, computed thing before it is a decision; written inside the
  selection loop it becomes a selection loop full of logic that cannot be
  tested. This is the invariant Plan 2 was shaped around and the reason it
  went as well as it did.
- **Phase 5 is always last.** It tunes constants by measurement, and Phases 3
  and 4 both change what scores what. Tuning before them means tuning twice.
- **Ordering exception.** Phases 3 (personality) and 4 (traces) are
  independent of each other and may run in either order, both after Phase 2.
- **Stop condition.** If every phase is marked Done, **stop** and report the
  plan complete to the user. Do not invent further work.

You should never need to read the whole plan document in one session.

## Step 1 — read the plan's Handoff section, then your phase

- **Handoff first.** It is the single source of truth for where the last
  session left off, and it carries hard-won specifics — measurement traps,
  which assertions were themselves wrong, why a constant is the value it is.
- Then `## Locked decisions`, `## Data model`, your phase block, and
  `## Design invariants`. Read `## Evidence` too the first time you touch a
  phase that changes behaviour — the numbers there are what "better" is
  measured against.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** Find the real location by name, not by line
  number. A stale citation is expected, not an error.
- **If a phase conflicts with the live code, or a locked decision turns out
  unworkable, stop and flag it** — add a note under "Blockers / flagged
  deviations" in the Handoff and end the session there. Do not improvise a
  silent workaround; it looks like progress and surfaces three phases later.

## Step 2 — do exactly one phase, then stop

**Scope.** Implement only that phase. Phase boundaries encode dependency
order and review granularity — pulling the next phase forward means neither is
independently reviewable.

**Reuse, don't approximate.** Go read these and match their current shape
rather than working from a paraphrase:

- `evaluateDrives`, `checkDriveGates`, `driveGateValue`, `isOnCooldown`,
  `setCooldown` — `src/srcfiles/drives.js`. Note the five custom-resolver
  dispatches (`isPeepDrive`, `isSnoopDrive`, `isEatDrive`,
  `isInvestigateDrive`, `isGiftDrive`); D10 keeps their resolution and takes
  away their selection.
- `DRIVE_DEFS` — `src/srcfiles/config.js`. Sixteen entries.
- **The personality idiom you must copy, not reinvent:**
  `INTERRUPTION.personalityWeights` (`config.js`), consumed in
  `interruption.js` as `p *= 1 + Σ(temperament[axis] * weight[axis])` against
  `npc.bible.temperament`. `SNOOP_TUNING.chanceModifiers` is the same idea a
  second way. Do not add a third.
- `perceiveSignals` / `mergePerceived` — `src/srcfiles/signals.js`. Already
  called once per NPC per tick in `evaluateDrives` and handed to every gate;
  a perceived record's `intensity` is already attenuated for that NPC (D8).
- `composeScene` / `openScene` / `markCalloutsShouted` — `src/srcfiles/scene.js`.
  The pure-reader / named-writer split this plan copies.
- `resolveTick` and `resolveBatch` — `src/srcfiles/sim.js`, including the NPC
  field merge at the end of the drive block that Plan 0 had to fix once for
  memory replacement.

**Hard technical rules.** Each carries its consequence:

- **The tick stays synchronous, pure and LLM-free (R2, D11).** Scoring is
  arithmetic over state. Nothing in this plan may be `async` or reach
  `root.generateText`. Every autonomy feature rests on `resolveTick` being
  callable a hundred times in a loop with no network — that is also the only
  reason any of this is measurable. A harness assertion stubs `generateText`
  and fails if scoring ever calls it.
- **Scoring is pure; committing is a named writer.** `scoreCandidates` reads
  state and returns numbers; it never writes. If you need a side effect it
  belongs in `openPursuit`/`releasePursuit` beside it, called by whoever ran
  the tick. A harness assertion snapshots `gameState` around the scorer.
- **`npc.pursuit` has exactly one writer.** The whole point of D3 is that the
  `activityOverride` clobber becomes impossible by construction. Convention
  already failed here once: five drives grew their own bypass of the weight
  roll without anyone deciding the model had changed.
- **Two words are already taken.** `commitments.js` owns *commitment* (meal
  and social commitments) and `intent.js` is the **player's** free-text
  classifier. Use `pursuit`, and put new code in `src/srcfiles/cognition.js`.
- **No field without its reader in the same phase** (roadmap R8/RI6). The NPC
  audit that started this roadmap found 34 fields written, migrated,
  schema-validated and read by nothing.
- **Bump `?v=N` in `main.html` for every file you change.** A partial bump is
  how a client ends up running half-old code. They are independent per-file
  counters; bump the ones you touched. A new file needs a `<script>` tag —
  `cognition.js` loads after `drives.js`.
- **Do not put backslash escapes through a `python - <<'PYEOF'` heredoc in
  this environment.** `content: '\25B8'` arrived as octal `\25` (0x15) plus
  `B8`. Use the literal character.

**Two measurement traps this plan already fell into.** Both cost real time:

- **`resolveBatch(gameState, ticks)` returns `{ state, events, peepResults }`
  and does not mutate its argument.** Read `g.npcs` after calling it and every
  need reads as a flat 50, which looks exactly like a broken need economy.
  Thread the returned `state`.
- **A freshly generated house never gets dirty.** Measuring on one makes
  `clean_common` and `investigate_smell` look dead when they are not. If you
  are measuring anything that depends on mess, dirty the house deliberately
  first — and see Phase 4, which exists because of this.

**Verification is not optional, and where it happens depends on the phase:**

- **Pure logic → the Node harness.** `node dev/verify/run-all.js` runs all of
  it; `node dev/verify/verify-c1.js` runs one. Read `dev/verify/README.md`
  first. Add a `verify-*.js` for your phase covering the invariant, not just
  the instance.
- **Behaviour over time → the instrument.** `dev/verify/measure-cognition.js`
  already exists and prints actions per npc-tick, the drive mix and gate
  reachability. It is a tuning instrument, not a test: it prints, it does not
  assert. **Run it once before you touch anything** — it should print the
  plan's `## Evidence` section back to you, and if it does not, the baseline
  has already moved and that is your first finding. Run it again after any
  phase that changes scoring, against the
  same population Evidence used — 12 households × 7 in-game days — so the
  comparison is meaningful.
- **Feel → the browser.** `dev-harness.html` on the `slice-of-life` launch
  config (port 8734), **with a cache-buster** (`?cb=7`) because the browser
  caches the harness itself. Drive it from the console. Phase 5 in particular
  is a feel judgement with a number as its proxy, and the feel judgement wins.
- **Always re-run the whole suite before finishing.** It is 432 assertions
  across three completed plans and it has caught real regressions in phases
  that "obviously" could not have broken anything.

Once your phase is verified, **stop.** Do not roll into the next one even with
budget left. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. **Overwrite** the plan's `## Handoff` section — Resume at / notes /
   Blockers. Overwrite, do not append: a growing history buries the current
   state. Name the real identifiers you created; the next session greps for
   them.
2. **Update your phase's row in the Status table.** Never leave Status and
   Handoff disagreeing.
3. **Promote any resolved open question** into Locked decisions as a new
   D-number and strike it from `## Open questions`.
4. **Record any tuning number you set by measurement**, with what you measured
   and on what population. This plan is unusually full of them and several
   constants in this codebase were wrong on the first pass in both directions;
   the next person needs to know a number was observed rather than reasoned.
   A number in `COGNITION` with no note saying how it was obtained is a number
   nobody can safely change.
5. **If a measured figure in `## Evidence` moves**, update it there and say
   which phase moved it. Evidence is the baseline every later phase compares
   against; a stale baseline makes every comparison a lie.
6. **If this was the last phase:** mark the plan's Status header complete, move
   both the plan and this prompt to `src/ref/complete/`, and update all three
   indexes in the same commit — `src/ref/README.md`,
   `src/ref/structural/ARCHITECTURE.md`, and the Plan 3 row in
   `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md`. House rules 3 and 4.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
