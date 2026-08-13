# Session prompt — Plan X-5, Conversation Consequences

Hand this to an agent verbatim each session. It holds *how to work*;
`src/ref/complete/plan-x5-conversation-consequences.md` holds *what to build*.

---

You are one session in a series implementing Plan X-5 for this game —
separating the model that *writes* an NPC's dialogue from the model that
*judges what it did*. Today one call returns dialogue, relationship deltas and
memory additions together, which is an actor grading their own performance; and
what a conversation teaches an NPC never reaches the fields anything reads.

You have no memory of any previous session. Everything you need is either in
the target document's Handoff section or must be discovered by reading the
current code — never assume continuity with a prior chat. This prompt is reused
verbatim every session. Don't wait to be told which phase to work on.

## Step 0 — find out where you are

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/plan-x5-conversation-consequences.md`. The first phase not
marked Done is your phase.

* **Hard prerequisite: Phase 1 before Phase 2 or 3, always.** This plan's only
  testable surface is the part that is *not* the model call. Parsing, clamping,
  windowing and ingestion written inside a call site cannot be tested, and then
  neither can anything else.
* **Phases 2 and 3 are independent** and may run in either order.
* **Phase 4 is always last.** Both passes change what there is to measure.
* **Stop condition.** If every phase is Done, stop and report the plan
  complete. **Then say explicitly that Plan 5 is now unblocked** — X-5 exists
  to precede it.

## Step 1 — read the Handoff, then your phase

* **Handoff first.** Single source of truth for where the last session stopped.
* Then `## Locked decisions`, `## Data model`, your phase block, and
  `## Design invariants`. **Read `## Evidence` the first time you touch a phase
  that changes behaviour.**
* **Cross-check every cited file and line number against the current code.**
  Find things by name, not by line number. A stale citation is expected.
* If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and end
  the session there. Do not improvise a silent workaround.

## Step 2 — do exactly one phase, then stop

**Reuse, don't approximate.** Read these and match their current shape:

* `callLLM`, `callImLLM`, `buildNpcBlockV2` — `src/srcfiles/llm.js`. What you
  are splitting apart. Note the parse-recovery ladder; your parsers need their
  own, and the plan's Phase 1 enumerates the fixtures.
* `validateProposal`, `applyProposal`, `applyRelDelta`, `deriveConversationPhase`
  — `src/srcfiles/npc.js`. **Both passes emit proposal-shaped output and go
  through these** (D4). Do not build a second ingestion path.
* `compactMemoryIfNeeded` — `src/srcfiles/ui.js`. The precedent for a deferred,
  threshold-triggered LLM call that piggybacks on player contact, with the
  explicit rule *"never on a pure tick"*. Both X-5 passes are this pattern.
* `openScene`, `currentScene` — `src/srcfiles/scene.js`, and `sceneId` on
  `meta.sessionLog` entries. The Assessor's window already exists and is
  persisted; do not invent a second one.
* `addRecentExchange`, `MEMORY_BUDGET.maxRecent` — `src/srcfiles/npc.js`. The
  Chronicler's window is "unprocessed entries in `memory.recent`".
* `addMemoryFact`, `addMemoryEpisode`, `backfillFactRecordV2` —
  `src/srcfiles/npc.js`. Plan 4's belief contract that every extracted fact
  must satisfy.
* `ruminate` — `src/srcfiles/rumination.js`. The consumer whose inference rules
  Phase 3 exists to feed.

**Hard technical rules.** Each carries its consequence:

* **Nothing in this plan runs inside the tick (R2, D16).** `resolveTick` stays
  synchronous and model-free; a harness assertion stubs `generateText` and fails
  if the tick calls it.
* **`x5.js` is pure and has no `async`.** Parsing, clamping, windowing and
  ingestion are arithmetic over strings and state. The calls live in `llm.js`
  and are fired from `ui.js`. If `x5.js` grows an `await`, the phase boundary
  has been crossed.
* **`provenance` is set by ingestion code, never by the model** (D11). An
  extractor that can name its own provenance can claim to have witnessed
  anything, and the gossip layer will propagate it.
* **Importance is clamped** (D12). `importance >= MEMORY_IMPORTANCE.significant`
  (0.8) grants `pinned`, and pinned facts never evict. Plan 4 measured every
  conversation fact pinning itself; do not spring that trap from the other side.
* **Extracted episodes must carry `participants` and `emotionalTag`** (D13).
  This is the cold-start fix and the entire reason Plan 5 sequences behind this
  plan. Without them rumination infers nothing.
* **A failed pass is a no-op** (D14). No retries, no partial application, no
  fallback to the writing pass — after D5 there is nothing to fall back to. Mark
  the window processed and continue.
* **Integers on the wire; divide on ingestion** (D7). Do not ask the model for
  floats.
* **`tension` is inverted** (D9). Up is worse, and `deriveConversationPhase`
  subtracts it. A sign error here inverts the relationship model rather than
  merely miscounting.
* **Zero is the modal answer** (D8). If a prompt you write does not lead with
  the all-zero case, it will drift, and Phase 4 will measure it as a straight
  line.
* **Bump `?v=N` in `main.html` for every file you change.** A new file needs a
  `<script>` tag — `x5.js` loads after `llm.js` — **and a line in
  `dev/verify/loadgame.js`'s `ORDER`.** `rumination.js` shipped without the
  latter and silently killed 175 assertions across five harnesses.

**Measurement traps inherited from earlier plans:**

* `resolveBatch(gameState, ticks)` returns `{ state, events, peepResults }` and
  does not mutate its argument.
* **`resolveBatch` does not write episodes.** `ui.js`'s `advanceAndResolve`
  does, outside the tick. Measure memory occupancy headlessly and you read zero
  and conclude the knowledge layer is dead.
* Every relationship axis generates at 0 and **never moves without player
  conversation**. If you are measuring anything relational, move the axes
  deliberately first.

**Verification.** This plan is LLM-dependent and the harness cannot test the
model — which is exactly why Phase 1 makes the non-model surface as large as
possible.

* **Pure logic → the Node harness.** `node dev/verify/run-all.js`;
  `node dev/verify/verify-x1.js` for one. **Read `dev/verify/README.md` first** —
  its seven rules each exist because one was broken. Add a `verify-x*.js` for
  your phase covering the invariant, not the instance.
* **Stub the model, never skip it.** A stubbed Assessor/Chronicler reply driven
  end to end through ingestion is the assertion that matters; the fixtures in
  Phase 1 are where malformed replies get covered.
* **Drift → `dev/verify/measure-x5.js`** (Phase 4 creates it). Instruments
  print; they do not assert.
* **Feel → the browser.** `dev-harness.html` on the `slice-of-life` launch
  config (port 8734) with a cache-buster (`?cb=7`). Hold a real conversation and
  read the deltas. **The feel judgement wins.**
* **Always re-run the whole suite before finishing.** 662 assertions across five
  completed plans. **A harness reported as `DID NOT REPORT` is not a harness
  that passed** — never read past that line.

Once your phase is verified, stop. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. **Overwrite** the plan's `## Handoff` section — Resume at / notes /
   Blockers. Overwrite, do not append. Name the real identifiers you created.
2. Update your phase's row in the Status table. **Never leave Status and
   Handoff disagreeing.**
3. Promote any resolved open question into Locked decisions as a new D-number
   and strike it from `## Open questions`.
4. **Record any tuning number you set by measurement, with what you measured and
   on what corpus.** Every constant in `X5` is a first pass set by arithmetic
   and known to be provisional.
5. If a measured figure in `## Evidence` moves, update it there and say which
   phase moved it.
6. If this was the last phase: mark the Status header complete, move both files
   to `src/ref/complete/`, update `src/ref/README.md` and
   `src/ref/structural/ARCHITECTURE.md`, and **note in
   `src/ref/wip/npc-initiative-plan.md`'s Handoff that its Phase 2 prerequisite
   is now met.**

Do not end a session without doing this.
