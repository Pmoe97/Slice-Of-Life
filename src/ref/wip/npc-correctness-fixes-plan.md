# NPC Correctness Fixes

Status: **in progress — Phases 1–3 done**. Design session complete
2026-08-10; all decisions locked. Phases 4–5 outstanding.
Last updated 2026-08-10.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 0 of six, and every later plan assumes these fixes have landed).
- `src/ref/complete/npc-overhaul-plan.md` (built the systems this repairs; kept for the original design rationale).
- `src/ref/complete/inventory-needs-menu-saves-plan.md` (owns `NEEDS` and the eat drive that Phase 4 rebalances against).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** Phase 4 (need economy rebalance). Phases 1–3 are done and
verified.

**Phase 3 notes (2026-08-10):**
- Landed in full; 23 assertions pass at `scratchpad/verify-p3.js`.
- **Deviation from the Files list, deliberate.** The plan said drives would
  carry an explicit `importance` on each event object. Shipped instead as a
  central `EVENT_IMPORTANCE` type→band table in `config.js`, with
  `eventImportance()` (UI) reading an explicit `evt.importance` first if one
  is present. Same outcome, one place to look, and `drives.js` needed no
  edit at all. The per-event override is still available for a future emitter
  that needs it.
- **Found and fixed in passing:** `addMemoryFact` ran its budget check
  *before* the push (`if (length >= max) shift()`), so the facts tier settled
  at `maxFacts` but dropped one entry early on every add once full. Now
  evicts after the push, and fills to exactly 40.
- Invalidated facts (`valid: false`) score −1 and are always evicted first —
  they are the cheapest thing in the tier to lose.
- `applyProposal` **clamps** a model-declared episode importance to
  `MEMORY_IMPORTANCE.significant`. A proposal is untrusted input and must not
  be able to mint a memory that outranks everything and never evicts.
- The all-exempt case is handled: if every episode is day-0 shared history,
  the tier overflows its budget rather than dropping something declared
  permanent. Asserted.

**Phase 2 notes (2026-08-10):**
- Landed in full; 26 assertions pass at `scratchpad/verify-p2.js`. The ladder
  now spans usefully: the four sample relationships in the harness score 8 /
  25 / 48 / 85, one per rung.
- **`state.js` cannot be loaded into the harness with a `DEV` stub** — it
  declares the real `const DEV` and `function assert` itself, and derives DEV
  from `window`. Provide `window = { generatorPublicId, generatorIsUnsaved:
  false }` instead. `verify-p2.js` does this; copy that preamble for any
  future harness that needs `state.js`.
- The `npcs` 3→4 migration calls `deriveConversationPhase`, which lives in
  `npc.js` — a file that loads *after* `state.js`. This is fine and has
  precedent (`migrateNpcToV2` and `seedNpcInventory` are called the same way):
  migration bodies only run at `loadGameState` time, long after every script
  has executed.
- Checked as part of this phase: `MOVE_IN_TUNING`'s two phase gates are now
  real without being impossible — `familiar` passes the advocate gate and
  fails the stricter move-in gate, `close` passes both. The audit flagged both
  as silently loosened; they now bite.

**Phase 1 notes (2026-08-10):**
- **Phase 1 landed in full.** 23 assertions pass in a Node `vm` harness at
  `scratchpad/verify-p1.js`. **This is a better verification route than the
  iframe technique ARCHITECTURE.md describes** — `config.js` and `npc.js`
  load into a bare `vm` context with four stubs (`root`, `DEV`, `assert`,
  `mulberry32`) and the memory functions are callable directly. No browser,
  no Perchance runtime, no snapshot-staleness problem. Use it for Phases 2–4;
  extend the same file rather than starting a new one.
- **A locked decision was wrong and has been changed.** The Phase 1 bullet
  prescribed fixing `resolveGrievance` with a word-boundary match. The
  harness proved that does not work: `\bdishes\b` matches "washed dishes"
  because "dishes" genuinely is a whole word there, so the exact case the old
  comment complained about still matched. Replaced with **word boundary AND a
  coverage ratio** — `GRIEVANCE_MIN_COVERAGE = 0.5`, so the query must cover
  at least half the grievance text. See the "Deviations" section below.
- **Found and fixed in passing:** `buildImPrompt` had a `//` comment sitting
  *inside* its template literal, so the literal text
  `// NPC Overhaul Phase 2 + Phase 4 (query for retrieval)` was being sent to
  the model in every single IM prompt. Removed.
- `applyProposal` now declares `const channel` at the top of the function
  because the `additions.recentExchanges` path needs it and runs earlier than
  the dialogue block — do not move it back down next to its other use, that
  is a TDZ error.
- `main.html` cache tags: the three changed files were bumped
  (`config.js` 54→55, `npc.js` 12→13, `llm.js` 13→14).
  **ARCHITECTURE.md's "bump every tag together" instruction is stale** — the
  tags are independent per-file counters ranging from v=1 to v=55, so the
  project has plainly been bumping per-changed-file for a long time. Bumping
  only changed files achieves the stated goal (never a half-old client).
- Deliberately **not** in scope: pruning the 34 dead fields. Many of them
  (`facts[].category`, `episodes[].participants`, `emotionalTag`,
  `compatibility`, `friction`) get real consumers in roadmap Plans 3 and 4.
  Phase 5 triages them into keep/reserve/prune rather than deleting on sight.

**Blockers / flagged deviations:** One deviation, recorded below. No blockers.

---

## Deviations from the locked plan

- **Phase 1, grievance matching.** Planned: word-boundary match. Shipped:
  word-boundary match **plus** a 0.5 coverage ratio
  (`GRIEVANCE_MIN_COVERAGE`, `npc.js`). Reason: word boundaries alone
  demonstrably fail the case the fix exists for — verified, not assumed.
  Consequence: a one-word query no longer resolves a long grievance at all
  (`'bins'` will not clear `'never takes the bins out'`), which is a
  deliberate trade. A model resolving a grievance echoes most of it back
  (`'dirty dishes in the sink'` → `'left dirty dishes in the sink'`, 83%
  coverage, still matches). If grievances turn out to under-resolve in play,
  lower the constant rather than reverting to substring matching.

---

## The thesis

Five things in the NPC layer are not working as designed. Not missing —
*broken*. Each was built deliberately, each is wired end to end, and each
produces the wrong result every time it runs.

They matter now, rather than as background cleanup, because every plan in
the roadmap builds directly on top of them. A knowledge web (Plan 4) built
over a memory tier that evicts by FIFO and writes its transcript backwards
would bake both defects in permanently. NPC initiative (Plan 5) motivated by
relationship phase would inherit a phase ladder whose bottom rung is
unreachable.

This plan is small, entirely mechanical, and should land in one or two
sessions. It buys correctness for everything after it.

### What this plan is *not*

- **Not a feature plan.** Nothing new becomes possible. Things that were
  supposed to work start working.
- **Not a dead-code purge.** Phase 5 triages and records; it deletes only
  fields with no future consumer in any roadmap plan.
- **Not a rebalance of the player's needs.** Phase 4 touches the `npc*`
  rates in `NEEDS` and the NPC-side restore logic in `resolveTick` only. The
  player's economy was tuned in the inventory overhaul and is out of scope.
- **Not a prompt redesign.** The prompt keeps its current shape here.
  Rewriting `buildNpcBlockV2` belongs to Plan 4, where the knowledge model
  changes what there is to say.
- **Not a migration of conversation history.** Existing saves keep whatever
  is in `memory.recent`; Phase 1 raises the cap going forward and does not
  reconstruct the past.

---

## Evidence

Citations were true at commit `e675ab0`. Find by name, not line number.

**Relationship phase** — `npc.js` `deriveConversationPhase`:

```
intimacyLevel = ((trust + 1) + (affection + 1) + (comfort × 2)) / 4 × 50
fresh NPC (all axes 0)  →  ((0+1) + (0+1) + 0) / 4 × 50  =  25
thresholds: ≥70 intimate · ≥40 close · ≥20 familiar · else early
```

`early` requires `trust + affection + 2·comfort < −0.4`. `applyRelDelta`
re-derives on every call and the scene prompt template requests a
`relationshipDeltas` object every turn, so the flip happens on exchange one.

**Need economy** — `config.js` `NEEDS`, against `sim.js` `resolveTick` and the
`day_shift` weekday template in `SCHEDULES`:

| Need | Decay/day | Restore/day | Resting state |
|---|---|---|---|
| hygiene | −48 | +112 (14 ticks × 8 on morning/wind_down/evening) | Pinned at 100; `shower` drive gate `<30` unreachable |
| social | −96 | +4/tick co-located only | Pinned near 0 |
| stimulation | −48 | `leisure` block only — absent from every weekday shift template | Pinned at 0 |
| hunger | −144 | +72 passive, plus the eat drive | Chronically low |
| comfort | −24 | +3/tick, but only with an upgraded facility | Pinned at 0 pre-upgrade |
| energy | −96 | +90 on the sleep block | Roughly balanced |

Knock-on: the `shower` drive is the only writer of `clothing: 'towel'`, the
only NPC-side source of `showers`/`waterHeating` utility metering, and a peep
target. All three are dead because one restore rate is 2.3× too high.

---

## Locked decisions

### Relationship phase

- **D1 — Rebase the intimacy formula so a stranger scores zero.**
  ```
  raw   = trust + affection + (2 × comfort) − tension        // range [−3, 4]
  level = clamp(raw / 4, 0, 1) × 100
  ```
  All-zero axes → 0. Fully positive → 100. Existing thresholds (70/40/20)
  are kept and now mean something: `familiar` needs
  `trust + affection + 2·comfort − tension ≥ 0.8`.

- **D2 — Tension is subtractive.** A relationship where someone is furious
  with you is not `intimate` regardless of trust. This is the wrong-register
  problem the whole roadmap exists to fix, in miniature.

- **D3 — Re-derive phase on load, once, via an `npcs` folder migration.**
  Phase is derived state (RI3), so the fix is not to migrate the stored value
  but to recompute it. Without this, existing saves keep an inflated phase
  until the next delta happens to fire.

### Conversation memory

- **D4 — Player input is recorded before NPC dialogue.** In `applyProposal`,
  move the `playerAction` block above the `proposal.dialogue` loop. Cause
  before effect.

- **D5 — `recent` holds 40 entries; the prompt slice takes 16.** Up from
  10 and 5. A turn writes one player line plus up to three dialogue lines, so
  40 is roughly ten real exchanges and 16 is roughly four.

- **D6 — `recent` entries carry a `channel` and the prompt filters on it.**
  `'scene'` or `'im'`. Texting someone and then talking to them in person
  currently interleaves two unrelated conversations into one transcript.
  The reader ships in the same phase (R8): `getRecentExchanges` gains a
  channel argument, and both prompt builders pass theirs.

- **D7 — `buildImPrompt` reads the real thread.** The IM app already persists
  `world.computer.apps.im.threads[npcId].msgs`. The prompt takes the last N
  from there rather than reconstructing from the shared buffer.

### Memory importance

- **D8 — Episode importance is set by source, not hardcoded.** Autonomous
  world events land at `MEMORY_IMPORTANCE.ambient` (0.15); drive-produced
  social events at `.social` (0.3); LLM-proposed episodes keep whatever the
  proposal declares, defaulted to `.conversational` (0.5); deliberate beats
  (grievances, confrontations, gifts, being caught) at `.significant` (0.8).

- **D9 — Eviction drops the lowest `importance × decay`, not the oldest.**
  `retrieveRelevantMemories` already ranks by exactly this product, so the
  ranking function exists and only eviction is naive. Day-0 shared-history
  episodes stay exempt, as they are today.

### Need economy

- **D10 — Hygiene has no passive restore.** Remove the block-based hygiene
  restore from `resolveTick` entirely. Decay stays at 1/tick (48/day); the
  `shower` drive's +40 becomes the only source. NPCs then need to shower
  roughly daily, which is both correct and what revives the towel state,
  the utility metering and the peep target.

- **D11 — Hunger has no passive restore either.** Same reasoning: the `eat`
  drive really consumes food from the fridge and pantry, which is the whole
  point of it. Decay drops 3 → 2/tick, the drive gate rises 25 → 35 so they
  eat before they are desperate, and `eatUntilHunger` stays at 65.
  `tryEatFood`'s existing scrounge fallback means an empty kitchen still
  never starves anyone.

- **D12 — Social decay halves; co-located restore rises.** Decay 2 → 1/tick,
  `npcSocialRestore` 4 → 5. A working NPC gets 8–11 co-located ticks in an
  evening, which now roughly covers the day with room for dips.

- **D13 — Stimulation restores on `evening` and `wind_down` as well as
  `leisure`, and decays at 0.5/tick.** The weekday shift templates have no
  `leisure` block at all, which is why this need was unreachable.

- **D14 — Comfort gets a small unconditional baseline.** +1/tick in the
  living room or the NPC's own bedroom regardless of upgrade tier, with the
  existing +3/tick when a comfort facility is functional or upgraded. The
  upgrade incentive is preserved; the pre-upgrade floor is not zero.

- **D15 — `seek_stimulation.blockFilter` loses `'afternoon'`.** No schedule
  template defines that block. Replace with the real names.

### Triage

- **D16 — A dead field is pruned only if no roadmap plan claims it.** Phase 5
  produces a table with one row per field and one of three dispositions:
  `prune`, `reserved for Plan N`, or `wire now`. The table goes in this
  document and is the record; deletions happen in the same phase.

---

## Data model

### `MEMORY_IMPORTANCE` (Phase 3) — `config.js`

```js
const MEMORY_IMPORTANCE = {
  ambient:        0.15,  // OFFSCREEN_EVENTS draws — laundry, naps, packages
  social:         0.30,  // drive-produced: npc_chat, eat, gift
  conversational: 0.50,  // LLM-proposed episodes, default when unspecified
  significant:    0.80,  // grievance, confrontation, caught peeping, move-in
};
```

### `recent[]` entry (Phase 1) — extended shape

```js
{ speaker, text, type, day, tick, channel }   // channel: 'scene' | 'im'
```

`channel` is the only new field, and `getRecentExchanges(npc, count, channel)`
is its reader, shipped in the same phase.

---

## Implementation phases

### Phase 1 — Conversation memory correctness

**Goal:** an NPC's transcript reads in causal order, is deep enough to hold a
real conversation, and does not interleave two channels. After this phase a
ten-turn conversation is coherent to the model start to finish.

**Files:**
- `src/srcfiles/npc.js`: in `applyProposal`, move the `playerAction` recent-exchange block above the `proposal.dialogue` loop (D4). Raise `addRecentExchange`'s cap 10 → 40 and add the `channel` parameter, defaulting to `'scene'` for callers that do not pass one (D5, D6). `getRecentExchanges(npc, count, channel)` gains the filter and its default count rises 5 → 16. Fix `resolveGrievance`'s condition: drop the unreachable third clause and require a word-boundary match rather than a bare `includes`, which is what the existing comment already claims it does.
- `src/srcfiles/llm.js`: `buildNpcBlockV2` gains a `channel` argument threaded from its two callers; `buildMemorySliceV2` passes it through to `getRecentExchanges`. `buildImPrompt` takes the last `IM_PROMPT.threadDepth` messages from the real thread and renders them as a transcript (D7).
- `src/srcfiles/computer.js`: `assembleImContext` passes the thread through on the context object so `buildImPrompt` does not reach into `gameState` itself.
- `src/srcfiles/config.js`: `IM_PROMPT = { threadDepth: 12 }`.

**Verification:** with the iframe harness against a synthetic NPC, run five
scripted exchanges through `applyProposal` and assert `memory.recent` reads
`player → npc → player → npc`, never inverted. Assert the buffer holds 40 and
the prompt slice returns 16. Send an IM to the same NPC and assert the scene
prompt's `[Memories — recent]` does not contain the IM text, and vice versa.
Assert `resolveGrievance('dishes')` does **not** resolve a grievance reading
"washed dishes", and does resolve one reading "dishes".

---

### Phase 2 — Relationship phase derivation

**Goal:** a stranger reads as `early` and stays there until the relationship
is actually earned. `relationshipDirective` stops telling the model to
reference shared experiences with someone met ninety seconds ago.

**Files:**
- `src/srcfiles/npc.js`: replace `deriveConversationPhase`'s formula per D1/D2. Keep the return shape `{ intimacyLevel, conversationPhase }` — every caller is unchanged.
- `src/srcfiles/state.js`: register an `npcs` folder version bump whose migration re-derives `relPlayer.intimacyLevel` and `relPlayer.conversationPhase` from the stored axes (D3). Pure recomputation, no data invented.
- `src/srcfiles/config.js`: lift the three thresholds out of the function into `PHASE_THRESHOLDS = { intimate: 70, close: 40, familiar: 20 }` so they are tunable without touching logic.

**Verification:** assert a freshly created NPC derives to `intimacyLevel 0`,
`phase 'early'`, and that applying a zero-valued `relationshipDeltas` object —
which the prompt template requests every turn — leaves it at `early`. Assert
`trust .4 / affection .4 / comfort .1` lands `familiar` and not `close`.
Assert `trust .9 / affection .9 / comfort .8 / tension .9` does **not** reach
`intimate`. Load a pre-migration save through the real `loadGameState` and
assert an untouched NPC's phase drops from `familiar` to `early`.

---

### Phase 3 — Memory importance and eviction

**Goal:** a week of laundry and naps no longer evicts the conversation that
mattered. Episodes are forgotten by significance, not by age.

**Files:**
- `src/srcfiles/config.js`: `MEMORY_IMPORTANCE` per the data model.
- `src/srcfiles/npc.js`: `addMemoryEpisode` evicts the lowest `importance × decay` when over budget rather than calling `shift()`, exempting `day === 0` shared-history episodes as today. `addMemoryFact` gets the same treatment against `importance`.
- `src/srcfiles/ui.js`: `advanceAndResolve`'s event loop stops passing a hardcoded `0.5`. Importance comes from a new `eventImportance(evt)` helper keyed on `evt.type` against `MEMORY_IMPORTANCE` (D8).
- `src/srcfiles/drives.js`: drive-produced events carry an explicit `importance` on the event object so `eventImportance` reads it rather than guessing from the type string.

**Verification:** seed an NPC with 30 episodes — 25 ambient at 0.15, five
conversational at 0.5 — then add a significant one and assert the evicted
episode is an ambient one and every conversational episode survives. Run 200
simulated ticks of pure ambient events and assert a single 0.8 episode
recorded at the start is still present at the end. Assert a day-0 episode is
never evicted regardless of budget pressure.

---

### Phase 4 — Need economy rebalance

**Goal:** all six needs move through a usable range instead of sitting at a
floor or a ceiling, so `needsLine` differentiates one NPC from another and
the drives gated on them actually fire. The shower drive comes back to life,
and with it the towel state, NPC water metering and a peep target.

**Files:**
- `src/srcfiles/config.js`: `NEEDS` — `npcHungerDecay` 3 → 2 (D11), `npcSocialDecay` 2 → 1 and `npcSocialRestore` 4 → 5 (D12), `npcStimulationDecay` 1 → 0.5 (D13), new `npcComfortBaselineRestore: 1` (D14). Delete `npcEatRestore` and `npcHygieneRestore` — with D10 and D11 they have no reader left. `DRIVE_DEFS.eat.gates` threshold 25 → 35 (D11); `DRIVE_DEFS.seek_stimulation.blockFilter` loses `'afternoon'` and gains the real block names (D15).
- `src/srcfiles/sim.js`: in `resolveTick` pass 2, remove the block-keyed hunger and hygiene restore branches entirely (D10, D11). Add `evening`/`wind_down` to the stimulation restore condition (D13). Restructure the comfort branch so the baseline applies unconditionally in the living room or the NPC's own bedroom and the facility bonus stacks on top (D14).

**Verification:** simulate a full 48-tick day for one `day_shift` NPC and one
`night_shift` NPC with a stocked kitchen, logging all six needs per tick.
Assert every need's daily minimum falls below its drive gate at least once and
its daily maximum stays under 100 — no pinning at either end. Assert the
`shower` drive fires at least once per simulated day and that
`clothing === 'towel'` is observed. Assert `recordUtilityUsage` receives
`showers` and `waterHeating` from an NPC source. Assert an NPC in a kitchen
with an empty fridge and empty pantry hits the scrounge fallback rather than
reaching hunger 0.

---

### Phase 5 — Dead-field triage

**Goal:** every field the audit flagged has a recorded disposition, and the
ones with no future are gone. Nothing is deleted that a later roadmap plan
needs.

**Files:**
- `src/ref/wip/npc-correctness-fixes-plan.md`: the disposition table, appended to this document as a new section. This is the deliverable — the code changes follow from it.
- `src/srcfiles/config.js`, `sim.js`, `npc.js`: remove the fields marked `prune`, including their generation, their schema entries and their migration backfills. Expected: `bible.occupation.stressProfile`, `bible.interests[].skill`, `bible.speech.vocabularyLevel`, `physical.typicalAttire`, `physical.genitals`, `styleCounters.lastJobMention`, `styleCounters.lastHobbyMention`, `relPlayer.firstMetDay`.
- Expected `reserved`, to be left exactly as-is with a one-line comment naming the plan that will consume them: `facts[].category`, `facts[].importance`, `episodes[].emotionalTag`, `episodes[].participants`, `castWeb.compatibility`, `castWeb.friction`, `castWeb.beatPositive`, `bible.sampleLines`, `bible.history`, `bible.values`, `bible.interests[].name`, `relPlayer.lastInteractionDay`, `arcs`, `bibleRevision`, `bibleChanges`.

**Verification:** grep each pruned identifier across `src/srcfiles/` and
assert zero remaining references. Generate a fresh house and round-trip it
through `writeGeneratedGameState` → `loadGameState` against mocked kv; assert
`validateCharacter` returns valid and no console warnings fire. Load a
pre-prune save and assert the same.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | Conversation transcript order, depth, channel separation; real IM thread in the IM prompt. 23 assertions pass (`scratchpad/verify-p1.js`) |
| 2 | **Done** | Rebase the intimacy formula so a stranger reads as `early`; re-derive on load. 26 assertions pass (`scratchpad/verify-p2.js`) |
| 3 | **Done** | Source-keyed episode importance; evict by `importance × decay` instead of FIFO. 23 assertions pass (`scratchpad/verify-p3.js`) |
| 4 | Not started | Rebalance the six NPC need rates against the real schedule blocks |
| 5 | Not started | Triage all 34 dead fields; prune the ones no roadmap plan claims |

---

## Dependency order

```
Phase 1 (memory correctness) ──┐
Phase 2 (phase derivation)  ───┼──► independent of each other, any order
Phase 3 (importance)        ───┤
Phase 4 (need rebalance)    ───┘
                                └──► Phase 5 (triage — last, so it sees the final field set)
```

Phases 1–4 touch disjoint code and may run in any order or together in one
session. Phase 5 must be last: Phases 1 and 3 add readers to fields that are
currently dead (`channel`, `importance`), and triaging before they land would
prune fields that were about to acquire consumers.

---

## Open questions (parked, none blocking)

- **Should `tension` decay over time on its own?** Nothing currently reduces
  it except an LLM proposal choosing to. With D2 making tension subtractive,
  a relationship can get stuck. Decide during Plan 4, where rumination gives
  a natural home for "they cooled off about it."
- **Should the 40-entry `recent` buffer be per-conversation rather than
  rolling?** A conversation that ends and resumes three days later currently
  shares one buffer. Decide during Plan 4.
- **Does `respect` do anything?** It is on every axis list, moved only by LLM
  proposals, and read only as a number printed in the prompt. Either give it a
  consumer in Plan 3 or 4, or prune it. Not urgent enough to block here.

---

## Design invariants

1. **Derived state is recomputed, never migrated.** `conversationPhase` is
   derived from three axes; the D3 migration recomputes it rather than
   patching stored values. The moment a derived field is hand-edited in a
   migration, the derivation and the storage can disagree and nothing will
   catch it.

2. **A ranking function and its eviction function must agree.**
   `retrieveRelevantMemories` ranked by `importance × decay` while eviction
   dropped the oldest, so the tier surfaced by relevance and forgot by age —
   two contradictory theories of what memory is, in one file.

3. **Cause is recorded before effect.** The reversed `recent` buffer survived
   an entire overhaul plus an audit fix pass because nothing ever printed the
   buffer in order. Any append-only log of an exchange writes the stimulus
   first.

4. **When a restore rate and a drive gate disagree, the drive loses
   silently.** Hygiene restored 2.3× faster than it decayed, so a drive with
   a `<30` gate could never fire, and nothing anywhere reported it. Any need
   with a drive gated on it needs a simulated-day assertion that the gate is
   reachable.
