# Plan X-5 — Conversation Consequences

Status: **COMPLETE — all four phases done. Decisions locked D1–D28.**
Last updated 2026-08-12.

**Sequencing: X-5 is built and executed in full BEFORE Plan 5.** It is not part
of the roadmap's original six. It exists because Plan 5's design session
measured that four of its five motivation sources read exactly zero, and the
reason is upstream of Plan 5 entirely: what a conversation *does* to an NPC is
decided by the same model call that writes the dialogue, and what it *teaches*
them never reaches the fields anything reads. Plan 5's Phase 2 assumes those
sources are alive. This plan is what makes them alive.

Companions:
- `src/ref/wip/npc-initiative-plan.md` (Plan 5 — **designed, not started**. Its D4 spends desire, grievance, curiosity, mood and affection; this plan is what moves four of them).
- `src/ref/complete/knowledge-gossip-memory-plan.md` (Plan 4 — **complete**. Its belief record is the contract every extracted fact must satisfy, and its D19 importance clamp is the trap this plan must not spring).
- `src/ref/complete/scene-reader-ui-plan.md` (Plan 2 — **complete**. `meta.scene.id` is the window this plan's first pass judges).

Paired session prompt: `src/ref/complete/plan-x5-handoff-prompt.md`.

**Read the Handoff section immediately below before anything else.**

---

## Handoff — read this first

**This plan is COMPLETE.** All four phases are Done. There is nothing to
resume; what follows is what the last phase measured and what the next reader
needs in order not to undo it.

**Plan 5 (`src/ref/wip/npc-initiative-plan.md`) is now unblocked.** X-5 existed
to precede it: its Phase 2 assumes desire, grievance, curiosity and mood are
live sources, and four of the five read zero before this plan. They do not now.

**The suite is green at 957 assertions** (`node dev/verify/run-all.js`), up
from 938. `verify-x1.js` contributes 115, `verify-x2.js` 80, `verify-x3.js` 81,
`verify-x4.js` 19.

### What Phase 4 built and changed

- **`dev/verify/measure-x5.js`** — **new instrument**, six sections. It prints;
  it does not assert. Every figure below came out of it. Listed in
  `dev/verify/README.md` alongside the other three `measure-*` scripts, and
  `verify-x4` asserts that listing so it does not become an instrument nobody
  re-runs.
- **`src/srcfiles/config.js`** — **`X5.deltaDivisor` 100 → 50**, the only
  constant this phase moved, plus the reasoning and the floor recorded at the
  constant itself (D27). `index.html` is `config.js?v=79`.
- **`dev/verify/verify-x4.js`** — 19 assertions covering the side Phases 1–3
  could not: the ladder is *reachable*, a quiet judge is *still* quiet, and the
  divisor floor is a live guard.

### The one number that changed, and why

Phases 1–3 asserted that the two passes are **safe**. Every one of those
invariants is satisfied perfectly by a wire that moves nothing at all, and
that turned out to be close to what shipped.

At `deltaDivisor: 100`, a judge following the rubric's own bands took **57
windows to carry an NPC from stranger to `familiar` and 141 to `intimate`** —
19 and 47 in-game days for someone getting a real share of the player's
evening. `conversationPhase` is the strongest single lever in the NPC block
(see the comment on `PHASE_THRESHOLDS`), so at that rate it never moves during
a playthrough and every housemate talks like a stranger forever. That is Plan
0's D1/D2 bug — everyone flipping to `familiar` on exchange one — overshot in
the other direction.

At **50**, the same judge reaches familiar in 29 windows (~10 days), close in
57 (~19) and intimate in 90 (~30). See the sweep table below for what the
alternatives buy.

### Every number, and what was measured to get it

Corpus for sections 1–2 and the sweep: 200 windows per profile, one NPC from a
standing start, each reply serialised as a JSON **string** and driven through
the shipped chain — `parseAssessorReply` → `toProposalDeltas` →
`validateProposal` → `applyProposal`. The judge profiles are **hypotheses about
how a judge misbehaves, not measurements of one**; the model cannot be measured
here, which is exactly why Phase 1 made the non-model surface this large. What
the instrument measures is what each hypothesis *implies*.

**Drift, at the shipped divisor of 50** — windows until each phase falls:

| judge profile | familiar (20) | close (40) | intimate (70) |
|---|---|---|---|
| `silent` — all zeros, every window (D8 answered correctly) | never | never | never |
| `nudge` — +1 trust on 1 window in 10 | never (>200) | never | never |
| `warm` — +1 trust and +1 comfort EVERY window | 14 | 27 | 47 |
| `generous` — +2/+1/+1 every window | 8 | 16 | 30 |
| `realistic` — 65% zero, 25% small, 8% notable, 2% strong; 1 in 4 negative | **29** | **57** | **90** |
| `ceiling` — every positive axis at `deltaClamp` | 1 | 2 | 4 |

**The divisor sweep** (`realistic` / `warm`, windows to `familiar`):

| divisor | max per axis per window | realistic | warm |
|---|---|---|---|
| 200 | 0.050 | 99 | 52 |
| 100 (was) | 0.100 | 57 | 26 |
| 75 | 0.133 | 46 | 20 |
| **50 (shipped)** | **0.200** | **29** | **14** |
| 40 | 0.250 | 21 | 11 |
| 25 | 0.400 | **below floor — see D27** | |

**Windows per in-game day**, through the real trigger logic (`assessorWindow`
and its `full` flag, `markAssessed`, `chroniclerWindow`). The turn counts are
the assumption; everything else is shipped code:

| a day of play | player turns | room changes | Assessor calls | Chronicler calls |
|---|---|---|---|---|
| light | 6 | 2 | 3 | 1 |
| normal | 15 | 4 | 5 | 2 |
| heavy | 40 | 6 | 8 | 4 |

Those are the rate for **one NPC getting the player's whole evening**. A player
splitting an evening across three housemates gets roughly a third each, which
is why the tables above are converted at 3/day as well as 5/day.

**Fact accumulation against `BELIEF.maxFacts` (60):**

| extractor | @10 win | @30 win | @100 win | fills the tier at |
|---|---|---|---|---|
| `silent` — nothing new, ever | 0 | 0 | 0 | never |
| `sparse` — one fact every fourth window | 2 | 7 | 25 | never |
| `steady` — one fact per window | 10 | 30 | 60 | 60 windows (~30 days) |
| `chatty` — `maxFactsPerWindow` every window | 40 | 60 | 60 | 15 windows (~8 days) |

A conversation fact's eviction score (`importance × confidence`) is **0.18** for
ordinary detail and **0.675** at the very most a window may claim, against
**0.8** for a pinned fact. So everything the Chronicler writes sits below the
pinning bar by construction (D12) and evicts before anything defining does.
`maxFactsPerWindow` was **measured and deliberately left at 4** — the worst case
self-limits, and the tier losing conversational trivia first is correct.

**Near-duplicate blindness (D25): 4 of 12 caught.** The corpus is twelve pairs
an extractor could produce across two windows about one disclosure. All four
D25 catches are the same sentence with case, punctuation or whitespace moved.
Everything genuinely reworded goes through: *"The player says they grew up in
Leeds"* vs *"The player is from Leeds"*, *"work night shifts"* vs *"work
nights"*, *"their mother is unwell"* vs *"their mum is ill"*. See Blockers.

### What the browser leg proved — and the feel judgement

`dev-harness.html` on port 8735, `root.generateText` rigged from the console to
answer as writer, Assessor or Chronicler by prompt. Real `doTalk` /
`doConvSend` / `doMove`, no console errors:

| | |
|---|---|
| 50 player turns in one sitting, judge following the rubric (4 windows of 10 non-zero) | intimacy **0 → 18**, just short of `familiar`. At the old divisor the same 50 turns produced **9** |
| calls for those 50 turns | 50 writer + **10 Assessor** + **6 Chronicler** — a 32% overhead on model calls |
| the Assessor's cadence | exactly one call per `assessorMaxExchanges`, never mid-window |
| walking out of the room with 3 unassessed exchanges left | exactly **one** Assessor call; the old scene's window then reads 0 |
| walking straight back in | **no call** — a judged window does not reopen (D14) |
| an all-zero judgement | applied nothing; `intimacy` unchanged at 18 |

**The feel judgement, which wins:** 50 turns of solid conversation with one
person landing just under `familiar` is right. `familiar` should cost more than
one evening and less than a fortnight, and at 10–20 turns per NPC per evening
that is two or three evenings. The old divisor made it eight.

One caution for whoever plays next: the axes also move from **scripted**
sources, and they are easy to misread as the judge. Walking into a housemate's
bedroom added `tension +0.1` on its own during this session's first run, which
is four times the largest single-axis move the Assessor can make.

### Blockers / flagged deviations

**None blocking.** Three things the next reader should know:

1. **Near-duplicate facts are measured and deliberately NOT fixed here** — 4 of
   12 caught, above. Fixing it means fuzzy matching (token overlap, a
   similarity threshold), which is a *behaviour* change and not a tuning one:
   a matcher loose enough to catch "their mum is ill" against "their mother is
   unwell" is loose enough to drop "their **father** is unwell" as a duplicate,
   which silently destroys a true belief. That trade needs a plan and a
   threshold set by measurement, not a Phase 4 edit. It is the single largest
   piece of unfinished business in this plan. Impact is bounded: duplicates
   evict like anything else, and at the `steady` rate they halve time-to-full
   from ~30 in-game days to ~15.
2. **The wire cannot separate a biased judge from an honest one, and D28 now
   says so.** Every profile above scales by the same factor when the divisor
   moves, so `warm` stays exactly 2.1× faster than `realistic` at every legal
   setting. A future session that observes real inflation must not "fix" it by
   raising `deltaDivisor` — that slows genuine relationships by the identical
   factor and changes nothing about the bias. The levers on the *ratio* are all
   in the rubric (D8's zero-first framing), and the parked open question about
   showing the Assessor its own history is the one structural idea left.
3. **`X5.deltaDivisor` has a hard floor of 34 that lives in another file.**
   `validateProposal` rejects any single axis above 0.3, and a proposal fails
   *whole* on one bad axis — so below the floor it is precisely the LARGE
   judgements that stop landing while small ones sail through. The scale
   inverts, and the only symptom is a console warning nobody reads, because
   D14 marks the window judged either way. `verify-x4` demonstrates this
   directly and `verify-x1` asserts the clearance, so a retune past the floor
   fails the suite instead of shipping.

## The thesis

Talking to someone is the only thing in this game that moves a relationship,
and the model that writes the dialogue is the same one that scores it.

That is an actor grading their own performance. An NPC who has just written a
warm, generous line is the worst available judge of whether the exchange earned
warmth — and structurally the deltas are emitted in the *same generation* as
the dialogue, so they describe intent rather than outcome. The scoring happens
before the line exists.

The second half is worse and quieter. A conversation is the only place the
knowledge layer gets seeded, and what it writes never reaches the fields
rumination reads. Plan 5's design session measured **1,080 ambient episodes —
30 per resident, a saturated tier — producing 0 facts and 0 open questions**,
because the ambient writer supplies no `participants` and no `emotionalTag`.
The conversation writer supplies them only when the model volunteers them
inside a JSON blob it is also using to write prose.

So: **separate the writing from the judging, and window the judging.**

The windowing is the part that is not obvious, and it came out of the design
session rather than the prior art. Judging per message is what *creates*
drift — a small optimistic bias multiplied by hundreds of calls is monotonic
relationship inflation regardless of what the player does. Judging a window
makes "nothing really changed here" the easy answer, and it lets the judge see
an arc: *the player pushed three times and then backed off* is legible across
five exchanges and invisible in any one of them. Extraction over a window also
dedupes for free — a fact raised three times in one conversation is one fact,
where per-message extraction writes three.

---

## Evidence

Measured 2026-08-12 by reading the current code. The relationship figures come
from the Plan 5 design session's population run (12 households × 7 in-game
days × 3 residents).

### ~~Every relationship delta in the game comes from the writing pass~~

**Moved by Phase 2 — this is no longer true, and the rest of this section is
kept as the baseline it was measured against.**

`callLLM` returned one proposal carrying dialogue **and** `relationshipDeltas`
**and** `memoryAdditions`. Four surfaces call it:

| Surface | Call site |
|---|---|
| `doTalk` — scene conversation | `ui.js:3019` |
| `doPlayerAction` — free-text actions | `ui.js:2586` |
| Room entry beats | `ui.js:3166` |
| IM replies (`callImLLM`) | `llm.js:555` |

Everything else that writes `relPlayer` is scripted and small: rent lateness,
quest rewards, `mealRelDelta`, interruption/peep consequences, and
`react_to_player`'s ±0.01 — the only drive in the game that touches it.

**As of Phase 2, none of those four surfaces can move a relationship at all.**
The prompt no longer asks, and `stripWriterJudgement` removes the field on the
way in whether it asked or not (D22). Every conversation-sourced delta now
comes from `callAssessor`, on the two triggers in D2.

**And as of Phase 3, none of them can write memory either.** `memoryAdditions`
is gone from both prompts and stripped on ingestion alongside
`relationshipDeltas` (D22). Every conversation-sourced fact, episode and
grievance now comes from `callChronicler`, on the two triggers in D3. The four
surfaces still write dialogue, mood and topic — that is the whole of what the
writing pass decides now.

### Three of the six axes the model is told to move change nothing

`respect`, `comfort` and `desire` have **no behavioural reader**. `respect`
appears only in the prompt line, the effects allowlist and the Studio display.
`comfort` reaches behaviour solely through `deriveConversationPhase`. `desire`
reaches only `mayInitiate` / `highDesire` — two flags computed in
`checkRelConsequences` and consumed by nothing.

The model is instructed every exchange to move six axes, half of which cannot
cause anything to happen.

### ~~The wire format invites magnitude errors~~

**Answered by Phase 1 and re-measured by Phase 4.** The original instruction was
*"Relationship deltas are tiny: trust / affection / tension / respect / comfort
/ desire range -0.3 to +0.3."* Floats are exactly where models fumble scale —
`0.3` for `0.03` is a 10× error that parses cleanly and looks plausible. And
±0.3 per exchange meant **four exchanges could saturate an axis**.

Integers on the wire (D7) fixed the magnitude error. The saturation rate was
then over-corrected: at the Phase 1 divisor of 100 an axis needed ten
*maximum* windows, and a judge following the rubric's own bands needed **57
windows — some 19 in-game days — to move an NPC one rung up the phase ladder**.
Phase 4 measured that with `measure-x5.js` (a thing that *can* now be measured
headlessly, because Phase 1 made the wire pure) and set the divisor to 50. See
D27 and the Handoff's sweep table.

### ~~The knowledge layer's cold start is a field mismatch~~

**Moved by Phase 3 for conversation-sourced episodes. Still true of the ambient
writer, which is now the counterfactual rather than the whole story.**

Rumination's D7 rules key on episode `participants` (co-occurrence) and
`emotionalTag` / category (repetition). The ambient writer —
`advanceAndResolve` in `ui.js` — calls
`addMemoryEpisode(npc, evt.day, text, eventImportance(evt))` with neither.
Measured consequence: a saturated 30-episode tier per resident yields **0
facts, 0 inferred facts, 0 open questions**.

As of Phase 3, every episode the **Chronicler** writes carries both fields
(D13), and two chronicled conversations for one NPC yield **3 facts (1
witnessed, 2 inferred) and 3 open questions** — the open-question cap, not the
supply, is what bounds it. The ambient writer's own episodes still yield zero
and still call `addMemoryEpisode` with four arguments; `verify-x3` runs both
and asserts the difference, so this line stays honest if either moves. Whether
the ambient writer should be given the two fields as well is Plan 5's question,
not this plan's.

### The scene is already a persisted window

`openScene(gameState, roomId)` increments `meta.scene.id` whenever the player
changes room, and every `sessionLog` entry carries its `sceneId`
(`ui.js:3955`). `scene.js:188` already filters the log by it. A conversation
window therefore needs no new state — it exists, it is persisted, and Plan 2
migrated saves onto it.

### There is already a deferred-LLM precedent

`compactMemoryIfNeeded(npcIds)` (`ui.js:1909`) is a threshold-triggered
summarisation call that piggybacks on player contact, with the explicit rule
*"never on a pure tick — compaction runs only when a player-contact call
happens anyway."* This plan's two passes are the same pattern.

### There is no model selection

`root.generateText` accepts `{ instruction, startWith, stopSequences }` and
nothing else. Every pass is a full-price call on whatever model Perchance
provides; "run the judge on something cheaper" is not available. This is the
constraint that makes windowing a cost decision as well as a quality one.

---

## Locked decisions

### Architecture

- **D1 — Two passes, separated from the writing call and from each other.**
  The Assessor scores the relationship; the Chronicler extracts knowledge.
  Neither writes dialogue; the writer scores nothing. The writer stays
  *informed* by relationship state through `buildNpcBlockV2` — being informed
  is not the same as grading yourself.

- **D2 — The Assessor windows on the SCENE.** It fires when `openScene`
  increments `meta.scene.id`, judging every exchange that carried the closing
  scene's id, and emits deltas per NPC who was present. Secondary trigger: a
  scene that accumulates `X5.assessorMaxExchanges` without the player leaving
  flushes early and starts a new window, so a long conversation in one room is
  not judged as a single undifferentiated block at the end of the night.

- **D3 — The Chronicler windows LARGER than the Assessor.** Facts extract more
  accurately from more context, and a larger window dedupes: a fact raised
  three times in one conversation is one fact. It fires at day rollover for
  every NPC with unprocessed exchanges, and early if an NPC's unprocessed count
  crosses `X5.chroniclerMaxExchanges`. The user's decision, and it is also what
  keeps the cost sane — one call per NPC per day, not one per message.

- **D4 — Both passes emit PROPOSAL-SHAPED output and go through
  `validateProposal` / `applyProposal`.** The ingestion path, the axis
  allowlist, the `applyRelDelta` re-derivation of `intimacyLevel` /
  `conversationPhase`, and the memory writers all already exist and are tested.
  A second ingestion path would be a second set of bugs.

- **D5 — `relationshipDeltas` and `memoryAdditions` are REMOVED from the
  writing prompt**, and the removal lands in the same phase as its replacement.
  The user's choice. Removing them earlier would leave the game with no
  relationship movement at all; leaving them later would mean two sources of
  truth silently fighting. There is no fallback to the inline values (D14) —
  they will not exist.

- **D6 — Both passes are deferred and never block the player.** The Assessor
  fires after the response has rendered; the Chronicler runs at rollover, which
  is already a wait. `compactMemoryIfNeeded` is the pattern.

### The wire

- **D7 — Integers on the wire, divided on ingestion.** The Assessor returns
  integers in `[-X5.deltaClamp, +X5.deltaClamp]`, divided by 100 when applied.
  A malformed integer is obvious; a malformed float is a plausible 10× error.
  This also replaces the current ±0.3 ceiling, which allows an axis to saturate
  in four exchanges.

- **D8 — Zero is the modal output and the prompt must demonstrate it.** Most
  windows change nothing. The rubric leads with the all-zero case and shows it
  as the first example. A judge that always finds some movement produces
  monotonic drift across a long game, which is the single most likely way this
  plan fails silently. Phase 4 measures the drift rate directly.

- **D9 — `tension`'s inverted valence is stated explicitly in the prompt.**
  Five axes where up is good and one where up is bad is a sign-error generator.
  `deriveConversationPhase` subtracts it (`raw = trust + affection + 2·comfort
  − tension`), so a sign error there is not cosmetic — it inverts the
  relationship model.

- **D10 — Labels in, integers out.** The Assessor is shown relationship state
  as bucketed labels (`trust: guarded`, `comfort: easy`) rather than raw
  numbers, alongside `conversationPhase`. Mixing a 0–100 display with a ±10
  answer is what forces prior art to warn *"NEVER output values like 50, 80 or
  100"* — that warning treats a symptom of showing two scales in one prompt.

### Truth

- **D11 — Extracted facts are ATTRIBUTED CLAIMS, not truths.** The Chronicler
  records *"the player says X"* with a model-assigned confidence and
  `provenance: 'witnessed'` — the NPC did witness the claim being made. The
  user's choice. This is what Plan 4's provenance chain was built for: an NPC
  can be lied to, hold it at moderate confidence, and pass it on as something
  they were told. Flattening a claim into a fact at confidence 1.0 lets the
  player lie once and have the gossip layer propagate it to the household as
  established fact.

- **D12 — Importance is clamped to `conversational` unless the model
  explicitly declares higher.** Plan 4's D19, restated because this plan is the
  path that would spring it: `importance >= MEMORY_IMPORTANCE.significant`
  (0.8) grants `pinned`, and pinned facts never evict. Plan 4's Phase 1
  measured every conversation fact pinning itself. A generous extractor fills
  the 60-fact budget with unevictable trivia.

- **D13 — Extracted episodes MUST carry `participants` and `emotionalTag`.**
  This is the cold-start fix and the reason Plan 5 sequences behind this plan.
  Without them, rumination's inference rules cannot fire, no facts are
  inferred, no open questions are created, and Plan 5's curiosity motivation is
  dead on arrival.

### Boundaries

- **D14 — A failed pass is a NO-OP, never a fallback.** If the model errors or
  returns something unparseable, nothing is applied and the window is marked
  processed. Retrying invites doubled deltas; falling back to the writing pass
  is impossible by D5. A relationship that occasionally fails to move is
  correct; one that moves twice is not.

- **D15 — Non-determinism is accepted and deliberate.** Reloading and replaying
  an exchange may score differently. The user's decision: people play how they
  play, and variety makes characters feel alive. Recorded as a decision so no
  later session "fixes" it by seeding the judge.

- **D16 — Nothing in this plan runs inside the tick (R2).** Both passes are on
  player-contact or rollover paths. `resolveTick` stays synchronous and
  model-free; the harness asserts it with a stubbed `generateText`.

- **D17 — Surfaces: `doTalk`, `doPlayerAction`, and IM. Not room entry.** The
  user's choice. Free-text actions are included deliberately — what the player
  *does* in front of someone is richer relational material than what they say.
  Room-entry beats carry near-zero relational content and would multiply cost
  for predictably empty windows.

### Settled in Phase 1

- **D18 — The window IDENTIFIER is `meta.scene.id`; the window CONTENT is
  `npc.memory.recent`.** `addRecentExchange` stamps `sceneId` onto every entry
  it writes, and `assessorWindow` filters on it. Not `meta.sessionLog`: IM is a
  surface (D17) and never writes there, and the Assessor emits deltas per NPC,
  which a global log of system + narration + dialogue lines would turn into a
  speaker-matching problem. This is the existing persisted window applied to
  the existing per-NPC buffer — no second window and no second buffer.

- **D19 — Two cursors, one buffer: `assessed` and `processed`.** The two
  passes read the same transcript on different cadences, so each carries its
  own flag. A single shared flag cannot work: whichever pass ran first would
  blind the other to everything it had just consumed. Both flags are ordinary
  additive memory fields — absent means unjudged, and they survive save/load
  like any other. The marks differ in shape because the windows do:
  `markAssessed(npc, sceneId)` is scene-scoped and deliberately sweeps up
  unassessed entries from *older* scenes (whose window closed without being
  judged, so they can never be judged now); `markProcessed(npc, upTo)` takes a
  count, since the Chronicler's window is a prefix of the buffer.

- **D20 — An exchange is a PLAYER TURN, not a line, and both window ceilings
  are bounded by `MEMORY_BUDGET.maxRecent`.** One turn writes a player line
  plus up to three dialogue lines into the same buffer, so counting entries
  would fire every flush four times too early. And the buffer holds
  `floor(maxRecent / X5.linesPerExchange)` = 10 exchanges, ever — a threshold
  above that is a threshold that never fires, which is the mistake
  `verify-c1`'s D9 exists to make impossible. See the Handoff for the
  arithmetic that moved 8/24 to 5/10.

- **D21 — A fractional delta is TRUNCATED, not rounded.** D7 asks for
  integers; the interesting failure is a model still answering on the old
  ±0.3 float scale. Truncation makes that contribute exactly nothing, which is
  the safe direction and a statable invariant. Rounding would turn 0.6 into a
  real delta the model never meant. Do not "fix" this to `Math.round`.

### Settled in Phase 2

- **D22 — D5 is ENFORCED on ingestion, not requested in the prompt.**
  `stripWriterJudgement(proposal)` deletes `relationshipDeltas` in both
  `callLLM` and `callImLLM`, before `validateProposal`. Removing the field from
  the prompt is a request; models volunteer familiar JSON keys regardless, and
  `applyProposal` would have applied them — silently restoring the exact
  actor-grades-their-own-performance loop this plan exists to break, in the one
  case nobody would think to check by playing. Verified against a stub that
  claims `+0.3` on three axes every turn: the relationship stays byte-identical.
  **Phase 3 added `'memoryAdditions'` to `X5_WRITER_STRIPPED`**, and the same
  stub test run against a writer volunteering an invented fact, episode and
  grievance at `importance: 1.0` shows none of it lands.

### Settled in Phase 3

- **D25 — What an NPC already believes is dropped on INGESTION, not left to
  the prompt.** `toProposalMemory` takes the NPC record and filters any fact or
  episode whose text they already hold, folding case and punctuation. D22's
  shape applied to knowledge, and for the same reason: the Chronicler's prompt
  *shows* the extractor what is already known so it can spend its four slots on
  what is new, and a prompt that shows a model a list is a prompt that invites
  the list back. It matters because `addMemoryFact` does not dedupe at all — a
  re-recorded belief becomes a second record with its own `factId`, and the
  pair then out-votes everything else in retrieval while filling
  `BELIEF.maxFacts` twice as fast. Exact-text only; near-duplicates are Phase
  4's to measure. **Measured: 4 of a 12-pair paraphrase corpus caught**, and all
  four are the same sentence with case, punctuation or whitespace moved.
  Everything genuinely reworded goes through. Deliberately not fixed here — see
  Blocker 1 for why a fuzzy matcher is a behaviour change and not a tuning one.

- **D26 — The player renders as "the player" in inferred fact text.** The
  player is a participant on every episode the Chronicler extracts, and
  `player` is a speaker token, not a name — so co-occurrence minted "Hana and
  player spend time together", which then went into a prompt verbatim. Fixed in
  `rumination.js`'s `resolveNpcName`, which is where names are resolved, not in
  the extractor: the participant value has to stay the token every other reader
  already matches on. "the player" is the register the NPC block already uses
  (`[Relationship with player]`). The bare literal is used rather than x5.js's
  `X5_PLAYER_PARTICIPANT` because `rumination.js` loads *before* `x5.js`, and a
  cross-file constant read from inside `resolveTick` is how a load-order slip
  becomes a `ReferenceError` that kills five harnesses silently (README rule 6).

- **D23 — ONE Assessor call per window, covering everyone in it.** Not one call
  per NPC. The roster is rendered as a block per character — id, phase, labels,
  their own transcript — and the reply is keyed by npcId, which is the shape
  `parseAssessorReply` already returns. There is no model selection (see
  Evidence), so every pass is a full-price call; per-NPC calls would multiply
  the cost of a three-person kitchen by three for a conversation the judge is
  better off reading as one scene. The per-NPC transcripts differ because
  `applyProposal` writes the player's line to everyone present and each NPC's
  dialogue only to themselves — that asymmetry is real and is shown as-is
  rather than merged.

- **D24 — IM lines are marked `(text)` in the judged transcript.** Both
  surfaces share one `memory.recent` buffer (Plan 0's D6) and IM is judged
  (D17), so a window can hold both. "I miss you" typed at midnight is not the
  same act as "I miss you" said across a kitchen, and unmarked the judge cannot
  tell them apart. The marker is in `formatWindowTranscript`, so the Chronicler
  inherits it.

### Settled in Phase 4

- **D27 — `deltaDivisor` is 50, set by measurement, and has a hard floor of
  34.** The Phase 1 first pass of 100 made a rubric-following judge take 57
  windows (~19 in-game days) to reach `familiar` and 141 (~47 days) to reach
  `intimate`, which makes the `conversationPhase` ladder decoration in any
  playthrough somebody actually finishes. 50 gives 29 / 57 / 90, and the
  browser leg put 50 turns of solid conversation just short of `familiar`,
  which is the intended cost. **The floor is not in any table:**
  `validateProposal` rejects a single axis above 0.3 and fails a proposal whole
  on one bad axis, so below `deltaClamp / 0.3` it is the LARGE judgements that
  stop landing while small ones still apply — the scale inverts and the only
  symptom is a console warning. Never set `deltaDivisor` below 34 at
  `deltaClamp` 10. `verify-x1` asserts the clearance; `verify-x4` demonstrates
  the failure.

- **D28 — the wire sets the TIMESCALE; only the prompt sets the drift-to-signal
  RATIO.** Every judge profile scales by the same factor when `deltaDivisor`
  moves, so a judge with a bias stays exactly as far ahead of an honest one at
  every legal setting (measured: `warm` is 2.1× faster than `realistic`, at 200
  and at 40 alike). A session that observes real inflation and answers it by
  raising the divisor will slow genuine relationships by the identical factor
  and change nothing about the bias. The levers on the ratio are D8's zero-first
  rubric, the window size, and — still parked — showing the Assessor its own
  history. This is recorded so the obvious wrong fix is a decision somebody has
  to argue against, not one they can reach for by accident.

---

## Data model

### `X5` — `config.js` (built, Phase 1)

```js
const X5 = {
  deltaClamp: 10,               // integer wire range, ± (D7)
  deltaDivisor: 100,            // applied delta = integer / this → ±0.10 max
  linesPerExchange: 4,          // D20 — 1 player line + up to 3 dialogue lines
  assessorMaxExchanges: 5,      // flush a long single-room scene early (D2)
  chroniclerMaxExchanges: 10,   // flush before day rollover if busy (D3)
  factConfidenceDefault: 0.6,   // an unverified player claim; == RUMINATION.createThreshold
  factConfidenceMax: 0.9,       // invariant 3 — below certainty, always
  factImportanceCeiling: 0.75,  // D12 — strictly below MEMORY_IMPORTANCE.significant
  maxFactsPerWindow: 4,
  maxEpisodesPerWindow: 2,
  maxGrievancesPerWindow: 2,
  maxParticipants: 4,
  maxTextLen: 240,
  maxCategoryLen: 40,
  transcriptMaxLines: 60,
};
```

Every number here is a **first pass set by arithmetic** and Phase 4 sets them
by measurement. Plan 0 Phase 4, Plan 1 Phase 1 and Plan 3 Phase 5 all had
first-pass constants come out wrong in both directions — and this table's two
window sizes were already wrong once before a line of it shipped (D20; the
Handoff has the arithmetic).

### `npc.memory.recent[]` — three new fields (Phase 1)

| Field | Written by | Means |
|---|---|---|
| `sceneId` | `addRecentExchange`, from `meta.scene.id` | which window this exchange belongs to (D18) |
| `assessed` | `markAssessed` | the Assessor has judged it |
| `processed` | `markProcessed` | the Chronicler has read it |

All three additive: absent reads as scene 0 and unjudged, which is what a save
written before this plan should look like. Two flags, not one (D19). No second
buffer — the cost is that the window is bounded by `MEMORY_BUDGET.maxRecent`
(D20).

### The Assessor's return, after parsing

```js
{ npc_maya: { trust: 2, affection: 1, tension: 0, respect: 0, comfort: 1, desire: 0 } }
```

Integers. Converted to a `relationshipDeltas` proposal fragment and handed to
`applyProposal` (D4).

### The Chronicler's return, after parsing

```js
{
  facts: [{ text: "The player says they grew up in Leeds", category: 'history',
            confidence: 0.6, importance: 0.5, emotionalTag: '' }],
  episodes: [{ text: "...", participants: ['npc_maya'], emotionalTag: 'warm' }],
  grievances: [], resolveGrievances: [],
}
```

`provenance` is set by the ingestion code, never by the model — an extractor
that can choose its own provenance can claim to have witnessed anything.

---

## Implementation phases

### Phase 1 — The wire, and everything testable without a model

**Goal:** every part of this plan that is not the model call is built and
tested first. This is Plan 3's Phase 1 discipline applied to an LLM feature:
the parsing, clamping, windowing and ingestion are pure, computed things before
anything calls out.

**Files:**
- `src/srcfiles/config.js`: the `X5` table.
- `src/srcfiles/x5.js`: **new**, loaded after `llm.js`. `parseAssessorReply(text)` → integer deltas or null; `parseChroniclerReply(text)` → a validated proposal fragment or null; `toProposalDeltas(parsed)` applying `deltaDivisor` and the axis allowlist; `assessorWindow(gameState)` and `chroniclerWindow(npc)` returning the exchanges each pass would judge; `markProcessed(npc, upTo)`.
- `dev/verify/verify-x1.js`: the harness.

**Verification:** harness, and it should be large. Parse fixtures: well-formed, reordered axes, missing axes, out-of-range values, floats where integers were asked for, prose before the answer, empty, truncated. Clamping holds at both ends. An unknown axis name is dropped, not applied. `tension`'s sign survives the round trip. Windowing: a scene change closes a window; a long scene flushes at `assessorMaxExchanges`; `processed` marks exactly the exchanges judged and survives a save/load round-trip. Ingestion through `applyProposal` moves the axes and re-derives `conversationPhase`. Nothing in `x5.js` is async or reaches `generateText` — this file is pure.

### Phase 2 — The Assessor

**Goal:** relationship deltas come from a separate pass that judges a scene, and
the writing prompt stops scoring itself.

**Files:**
- `src/srcfiles/llm.js`: `buildAssessorPrompt(gameState, sceneExchanges, npcIds)` and `callAssessor(...)`. The rubric implements D8 (zero-first), D9 (tension's valence), D10 (labels in, integers out), and one line per axis defining what moves it.
- `src/srcfiles/llm.js`: **`relationshipDeltas` removed from the writing prompt and its parser** (D5), in this phase, not a later one.
- `src/srcfiles/ui.js`: fire the Assessor on scene close and on the early-flush trigger, after render, following `compactMemoryIfNeeded`.

**Verification:** harness for everything but the call — the writing prompt no longer mentions relationship deltas (source scan); a stubbed Assessor reply moves the axes end to end; a failed reply is a no-op and marks the window processed (D14); the tick never calls it. Then the browser: hold a real conversation, walk out of the room, confirm the deltas land once and are plausible for what was said.

### Phase 3 — The Chronicler

**Goal:** what a conversation teaches an NPC reaches the fields that read it.

**Files** (as built — the signatures below are the shipped ones, not the sketch this section originally carried):
- `src/srcfiles/llm.js`: `buildChroniclerPrompt(npc, npcId, win)` and `callChronicler(gameState, npcId, win)`, plus `buildChroniclerKnownBlock` and `chroniclerTagVocabulary`. Emits facts as attributed claims with confidence (D11), episodes with `participants` and `emotionalTag` (D13), and grievances.
- `src/srcfiles/llm.js`: **`memoryAdditions` removed from both writing prompts** (D5).
- `src/srcfiles/ui.js`: `chronicleDayRollover` at day rollover for every NPC with unprocessed exchanges, `chronicleIfFull` at `chroniclerMaxExchanges`, both through `runChroniclerPass`.
- `src/srcfiles/x5.js`: ingestion sets `provenance` itself, applies D12's importance clamp, and drops what the NPC already believes (D25).
- `src/srcfiles/rumination.js`: D26's renderer fix, and the `selfIdHint` fix for the self-targeting bug this phase made reachable (see Handoff).

**Verification:** harness — every extracted fact satisfies Plan 4's belief contract (`provenance`, `confidence`, `salience`, `pinned`, `emotionalTag` all present and in range); importance is clamped so a stubbed extractor claiming `importance: 1.0` on everything does not fill the tier with pinned facts; every extracted episode carries `participants` and `emotionalTag`. **Then the measurement that justifies the whole plan:** feed a stubbed Chronicler realistic episodes with participants and tags, run `ruminate`, and assert facts and open questions go from 0 to non-zero. If they do not, that is the finding, and it belongs in the Handoff before Plan 5 starts.

### Phase 4 — Measure the drift, then tune

**Goal:** the constants in `X5` are set by observation, and the failure mode
D8 names is measured rather than assumed.

**Files:**
- `dev/verify/measure-x5.js`: **new instrument.** Against a scripted corpus of exchanges replayed through the parser and ingestion (no model needed for the arithmetic half): where do the axes land after 20, 50, 200 windows of neutral input? A judge with a small positive bias should show up here as a straight line.
- `src/srcfiles/config.js`: `deltaClamp`, `deltaDivisor`, the two window sizes, `factConfidenceDefault`.
- The plan's Handoff: **record every number with what was measured to get it.**

**Verification:** the instrument for drift, then real play in the browser. The judgement is whether a long conversation moves a relationship by an amount that feels earned, and whether a neutral one leaves it alone. **The feel judgement wins.**

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** (2026-08-12) | `x5.js` — parsing, clamping, windowing, ingestion. Pure and tested; nothing calls a model. `verify-x1.js`, 115 assertions |
| 2 | **Done** (2026-08-12) | The Assessor: `buildAssessorPrompt` / `callAssessor` (llm.js), `runAssessorPass` / `assessSceneIfFull` (ui.js), `relationshipDeltas` removed from both writing prompts and stripped on ingestion (D22). `verify-x2.js`, 80 assertions |
| 3 | **Done** (2026-08-12) | The Chronicler: `buildChroniclerPrompt` / `callChronicler` (llm.js), `runChroniclerPass` / `chronicleIfFull` / `chronicleDayRollover` (ui.js), `memoryAdditions` removed from both writing prompts and stripped on ingestion, ingestion-side dedupe (D25). The cold start is closed and measured: 0→3 inferred-and-witnessed facts, 0→3 open questions. `verify-x3.js`, 81 assertions |
| 4 | **Done** (2026-08-12) | `measure-x5.js` — the instrument (drift under six judge profiles, windows-per-day through the real triggers, fact accumulation, the paraphrase corpus, the divisor sweep). One constant retuned: `deltaDivisor` 100 → 50 (D27), which took a rubric-following judge from 19 in-game days to reach `familiar` down to 10. `verify-x4.js`, 19 assertions |

**Status: COMPLETE.** 957 assertions across six plans. Plan 5's Phase 2
prerequisite is met.

---

## Dependency order

```
Phase 1 (the wire) ──► Phase 2 (Assessor) ──► Phase 4 (tune)
                  └──► Phase 3 (Chronicler) ──┘
```

**Phase 1 before either pass, always.** Same reason Plan 3 put the scorer before
the selector: parsing and windowing written inside a call site cannot be tested,
and this plan's only testable surface is the part that is not the call.

**Phases 2 and 3 are independent** and may run in either order.

**Phase 4 is last.** Both passes change what there is to measure.

**This whole plan ships before Plan 5's Phase 2**, which is the phase that
assumes desire, grievance and curiosity are live.

---

## Open questions (parked, none blocking)

- **Should fact dedupe be fuzzy?** D25 catches 4 of 12 paraphrase pairs, so the
  same disclosure reworded across two windows becomes two belief records. The
  fix is a similarity threshold, and the danger is symmetrical: a matcher loose
  enough to fold "their mum is ill" into "their mother is unwell" is loose
  enough to fold "their **father** is unwell" into it too, destroying a true
  belief silently. Needs its own plan and a threshold set by measurement. The
  largest piece of unfinished business this plan leaves.

- **Should the Assessor see the previous window's deltas?** It would allow
  hysteresis — "they apologised, and I already took the tension hit for this" —
  but risks the judge chasing its own history. **Phase 4 made this the most
  live question in the plan rather than answering it.** D28 measured that no
  setting of the wire changes how far a biased judge runs ahead of an honest
  one, so every remaining lever on that ratio is in the prompt, and this is the
  only structural one left unspent. Whoever picks it up should start from
  `measure-x5.js` section 1: the profile to beat is `warm`, which reaches
  `familiar` in 14 windows on nothing but small talk.
- **Does a lie ever get caught?** D11 stores claims with confidence but nothing
  contradicts them. Plan 4's `deriveStandingSignals` and the perception layer
  could in principle contradict a claim the NPC can see is false. Real, and out
  of scope here.
- **Do NPC-to-NPC conversations get a Chronicler?** Gossip already transfers
  facts deterministically in-tick. Extraction would only matter if NPC↔NPC
  exchanges ever produce prose, which they do not today. **Phase 3 made this
  sharper without answering it:** the Chronicler runs per-NPC over that NPC's
  own buffer, and an NPC's dialogue is written only to themselves — so B can no
  longer pick up something A revealed in front of them, which
  `applyProposal`'s overhearing leg used to cover. See Blocker 2 in the
  Handoff for why re-widening the context is the wrong fix.

---

## Design invariants

1. **The writer never grades itself.** The model that produces dialogue does
   not decide what the dialogue was worth. It stays informed by relationship
   state and decides nothing about it.

2. **Judge windows, not messages.** Per-message scoring multiplies any bias by
   the number of exchanges in the game. The window is what makes "nothing
   changed" expressible and an arc legible.

3. **A claim is not a fact.** Everything the player says enters memory
   attributed and with confidence below certainty. Provenance is set by code,
   never by the model.

4. **A failed pass changes nothing.** No retries, no partial application, no
   fallback. The window is marked processed and the game continues.

5. **Nothing here runs in the tick.** R2. Both passes live on player-contact
   and rollover paths, exactly as `compactMemoryIfNeeded` does.
