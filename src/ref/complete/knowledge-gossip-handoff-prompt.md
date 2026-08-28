# Knowledge, Gossip & Rumination — session prompt

You are one session in a long-running series implementing the Knowledge,
Gossip & Rumination overhaul for this game — giving every NPC a memory that
says where a thing was learned and how much to trust it, a way for facts to
travel through actual conversation events (never by osmosis), and an
offscreen rumination pass that turns what they hold into open questions. You
have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's Handoff section or must
be discovered by reading the current code — never assume continuity with a
prior chat. This prompt is reused verbatim for every session. Don't wait to be
told which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/ref/complete/knowledge-gossip-memory-plan.md`. The first phase not
marked Done is your phase.

* Hard prerequisite. Never do Phase 2 before Phase 1. The belief record has
  to be a pure, tested, migrated thing before facts start moving; written
  inside the transmission loop it becomes a transmission loop full of logic
  that cannot be tested. This is the invariant D14 was shaped around.
* Ordering exception. Phases 2 (transmission) and 3 (rumination) are
  independent of each other, both after Phase 1, and may run in either order.
  Phase 4 needs Phase 3. Phase 5 needs only Phase 1 and is normally last.
* Stop condition. If every phase is marked Done, stop and report the plan
  complete to the user. Do not invent further work.

## Step 1 — read the plan's Handoff section, then your phase

* Handoff first. It is the single source of truth for where the last session
  left off, and it carries hard-won specifics — measurement traps, which
  assertions were themselves wrong, why a constant is the value it is.
* Then `## Locked decisions` (D1–D18), `## Data model`, your phase block, and
  `## Design invariants`. Read `## Open questions` too — it parks decisions a
  later phase is supposed to revisit.
* Cross-check every cited file and line number against the actual current
  code before trusting it. Find the real location by name, not by line
  number. A stale citation is expected, not an error.
* If a phase conflicts with the live code, or a locked decision turns out
  unworkable, stop and flag it — add a note under "Blockers / flagged
  deviations" in the Handoff and end the session there. Do not improvise a
  silent workaround; it looks like progress and surfaces three phases later.

## Step 2 — do exactly one phase, then stop

Scope. Implement only that phase. Phase boundaries encode dependency order
and review granularity — pulling the next phase forward means neither is
independently reviewable. Reuse, don't approximate. Go read these and match
their current shape rather than working from a paraphrase:

* `addMemoryFact`, `evictLowestScored`, `retrieveRelevantMemories`,
  `buildMemorySliceV2`, `migrateNpcToV2` — `src/srcfiles/npc.js`. Facts and
  episodes stay separate tiers (D14); the plan edits these, it does not
  replace them.
* The `memoryAdditions` loop in `applyProposal` (`npc.js`, near the end) — the
  model leg of transmission lives here (D18). Note the existing clamp:
  proposed episode importance is clamped to `conversational` unless declared.
* The `npc_chat` drive — `src/srcfiles/drives.js` (~line 455). Templated
  event with `data: { other }`, no payload; D5's deterministic leg adds the
  payload here.
* `compactMemory` — `src/srcfiles/llm.js`. The piggyback-on-player-contact
  pattern D8 copies.
* `renderRoomListStudio` — `src/srcfiles/render.computer.js` (~line 1860),
  and the `studio` block of `defaultComputerState` in `computer.js`. D16's
  home; Phase 5 must not entangle profile mode with `studio.draft`.
* `BELIEF`, `FACT_DISPLAY`, `EMOTIONAL_WEIGHTS`, `TRANSMISSION`,
  `RUMINATION` — `src/srcfiles/config.js`. Author these new tables, do not
  scatter the numbers through function bodies.
* `MEASURE_COGNITION` — the cognition plan's population instrument. The
  population for every measurement in this plan is **12 households × 7
  in-game days × 3 residents, seeds 1–12**, the same population the cognition
  plan's Evidence used, so cross-plan comparisons are honest.

Hard technical rules. Each carries its consequence:

* The tick stays synchronous, pure and LLM-free (R2). Transmission leg 1,
  inference and the open-question lifecycle are arithmetic over state.
  Nothing in this plan may be `async` or reach `root.generateText` inside
  `resolveTick` — that is also the only reason any of this is measurable. A
  harness assertion stubs `generateText` and fails if any in-tick code ever
  calls it.
* Scoring is pure; committing is a named writer. `pickFactsToRaise` and
  `ruminate` read state and return results; they never write. Writes happen
  through `addMemoryFact` / the receiver write / `applyProposal`, called by
  whoever ran the tick. A harness assertion snapshots `gameState` around the
  pure functions.
* Provenance is written once, at storage time, and never rewritten (invariant
  3). A fact that changes hands is a new record in the receiver's memory.
  Confidence changes by exactly three routes: down on transmission, down at
  inference, up on re-witnessing — nothing else touches it (D2). Assert it.
* No field without its reader in the same phase (R8/RI6). `pinned`,
  `confidence`, `salience`, `provenance`, `emotionalTag`, `openQuestions` and
  `curiosity` each get a reader in the phase that adds them. The open-question
  lifecycle is Phase 3's reader for `openQuestions`; D13's bridge is its
  declared consumer (the NOTE_TEMPLATES precedent — name it, don't smuggle
  it).
* Bump `?v=N` in `index.html` for every file you change. A partial bump is how
  a client ends up running half-old code. They are independent per-file
  counters; bump the ones you touched. A new file needs a `<script>` tag —
  `rumination.js` loads after `npc.js`.

Three measurement traps, two learned by earlier plans and one written here:

* `resolveBatch(gameState, ticks)` returns `{ state, events, peepResults }`
  and does not mutate its argument. Read `g.npcs` after calling it and every
  need reads as a flat value. Thread the returned `state`.
* Tuning constants are measured, not reasoned. The cognition plan's cooldown
  rollover bug, and the correctness plan's need economy ("the first pass was
  wrong in both directions"), are why every number in this plan's tables says
  *provisional, measure in Phase N*. A number in `BELIEF`/`TRANSMISSION`/
  `RUMINATION` with no Handoff note saying how it was obtained is a number
  nobody can safely change.
* D15's cap (60) is *provisional*. Measure the real fill on the population in
  Phase 1 and record the verdict — "exercised" or "headroom" — in the Handoff.
  If it is headroom, say so; pretending a cap was exercised is how a dead
  constant starts.

Verification is not optional, and where it happens depends on the phase:

* Pure logic → the harness. `node dev/verify/run-all.js` runs the whole suite;
  `node dev/verify/verify-k1.js` runs one. Read `dev/verify/README.md` first.
  **Environment deviation: this workspace currently has no node, no `dev/`,
  and the HTML file is `index.html` (not `index.html`).** In that case write
  the same harness as a browser_eval script into `scratch/` (the cognition
  plan's `scratch/verify-c5.js` precedent) and record that it is ephemeral —
  the numbers are the record. If a future session has the real `dev/`, run it
  and trust its verdicts over the scratch notes where they disagree.
* Behaviour over time → the population instrument. Run it once before you
  touch anything and confirm the baseline still reproduces the cognition
  plan's Evidence numbers; if it does not, the baseline has already moved and
  that is your first finding. Run it again after your phase.
* Feel → the browser. `dev-harness.html` on the `slice-of-life` launch
  config (port 8734), with a cache-buster, driven from the console. Phase 4's
  proof and Phase 5's studio are feel judgements with assertions as their
  proxy.
* Always re-run the whole suite before finishing. It is over four hundred
  assertions across three completed plans and it has caught real regressions
  in phases that "obviously" could not have broken anything.

Once your phase is verified, stop. Do not roll into the next one even with
budget left. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's `## Handoff` section — Resume at / notes / Blockers.
   Overwrite, do not append: a growing history buries the current state. Name
   the real identifiers you created; the next session greps for them.
2. Update your phase's row in the Status table. Never leave Status and
   Handoff disagreeing.
3. Promote any resolved open question into Locked decisions as a new D-number
   and strike it from `## Open questions`.
4. Record any tuning number you set by measurement, with what you measured and
   on what population (the 12×7×3 population). A number in `BELIEF`/
   `TRANSMISSION`/`RUMINATION` with no note saying how it was obtained is a
   number nobody can safely change. Several constants in this codebase were
   wrong on the first pass in both directions.
5. If a measured figure in any plan's `## Evidence` moves, update it there and
   say which phase moved it. A stale baseline makes every comparison a lie.
6. If this was the last phase: mark the plan's Status header complete, move
   both the plan and this prompt to `src/ref/complete/`, and update the
   indexes in the same step — `src/ref/README.md`,
   `src/ref/structural/ARCHITECTURE.md`, and the Plan 4 row in
   `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md`. House rules 3 and 4.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
