# Architecture notes — the sandbox expansion

This file tracks the implementation of the sandbox-expansion plan (computer,
object model, items, skills, stealth, autonomy). The original design brief
lives in `ref/Original Prompt and Response Train.txt`; the full phased plan
this file follows lives in the plan history (chat-side), summarized per
phase below as each lands. There is no git repo for this project, so this
document — plus the section-header comments in each `src/*.js` file — is
the only design record. Keep it current as phases land; don't let it drift.

## Status

| Phase | Status | What it adds |
|---|---|---|
| P0 | **Done** | Effects engine, action registry, tone/content wiring |
| P1 | Not started | World object model |
| P2 | Not started | Items and inventory |
| P3 | Not started | Skills and progression |
| P4 | Not started | The computer |
| P5 | Not started | Free-action resolution pipeline |
| P6 | Not started | Stealth, evidence, suspicion |
| P7 | Not started | NPC autonomy |
| P8 | Not started | Content volume expansion |

## Load order

`main.html`'s `<script>` tags are the dependency graph. Current order:

```
config.js → defs.actions.js → state.js → sim.js → effects.js → actions.js
→ npc.js → prompt.js → llm.js → image.js → render.js → ui.js
```

Rule: if a new script's *top-level* code reads another script's `const`/
data at load time (e.g. `defs.actions.js` builds `ACTION_DEFS` entries by
reading `NEEDS`/`ACTION_TUNING` from `config.js`), the dependency must load
earlier. If a script only *calls* another script's function from inside a
function body, order doesn't matter — that call happens at runtime, after
every script has finished loading (classic `<script>` tags share one global
scope; function declarations are hoisted within their own file, and by the
time `boot()` runs, every file has already executed top to bottom).

## P0 — Effects engine, action registry, tone/content wiring

**New files:**
- `src/defs.actions.js` — `ACTION_DEFS` (data: the five ported verbs —
  `self.eat`, `self.cook`, `self.shower`, `self.watch_tv`, `self.relax`)
  and `ACTION_REQUIREMENT_CHECKERS` (a name→predicate registry, mirroring
  SIM's `CAST_REQUIREMENT_CHECKERS`).
- `src/effects.js` — `EFFECT_DEFS` (the typed effect vocabulary),
  `parseEffectDSL`/`normalizeProposal` (DSL → typed effects),
  `validateEffects` (the LLM-input boundary), `applyEffects` (pure,
  synchronous, in-memory mutation), `LLM_TELEMETRY` (parse-tier and
  effect-accept/reject counters, surfaced in the debug panel).
- `src/actions.js` — `resolveAvailableActions`, `executeAction` (the
  chokepoint for a registered verb), `runRegisteredAction` (the UI-facing
  wrapper matching the old `doX()` convention).
- `src/prompt.js` — `buildStyleSection`/`buildContentSection` (tone/content
  directives injected into every narrative prompt) and
  `buildEffectVocabSection` (tells the LLM which effect types it may use
  this turn, and their exact param shape).

**The three decisions this phase commits to (see the plan for full
rationale):**
1. **One effect engine, three producers.** Player actions, LLM proposals,
   and (from P7) NPC autonomy all emit the same typed effect list. The
   *validator* (`validateEffects`) is specifically the LLM-input boundary —
   trusted producers (an `ACTION_DEFS` entry's own `effects` list, later a
   `DRIVE_DEFS` entry's) are config-authored, not user input, so they call
   `applyEffects` directly and skip validation/caps entirely. See
   `effects.js`'s file header.
2. **Effects cross the LLM boundary as a flat line-oriented string DSL**
   (`ADJUST_NEED player hunger +20`), not nested JSON — recoverable by
   regex from a mangled response, which is exactly what the tier-3 fallback
   in `callLLM` (LLM section) now does.
3. **`applyEffects` must stay synchronous and in-memory-only.** This is a
   hard constraint, not a style choice: NPC autonomy (P7) will call it from
   inside `resolveTick`, which is a hard zero-LLM, zero-async invariant.
   Persistence happens later, at the next `saveAtBoundary` (already an
   unconditional per-NPC write loop) — same pattern SIM's
   `resolveTick`/`resolveBatch` already use.

**How `effects` relates to the legacy proposal keys.** `relationshipDeltas`/
`moodDeltas`/`memoryAdditions` keep their own dedicated, already-hardened
code paths in `validateProposal`/`applyProposal` (NPC section), completely
untouched — those rules are byte-identical to before this phase. `effects`
is a **new, additive** field: `normalizeProposal` desugars it (DSL strings
or already-typed objects) into a flat effect array, which
`validateProposal` validates via `validateEffects(..., 'llm')` (recording
telemetry) and `applyProposal` applies via `applyEffects`. Effect-touched
NPC ids are returned as `effectNpcIds`, kept separate from `updatedNpcIds`
(which specifically means "needs a kv resync" — effects mutate the same
`gameState` object UI's `currentGameState` already points to, so there's
nothing to resync).

**Implemented vs. declared-only effect types.** `EFFECT_DEFS` declares the
full vocabulary from the plan now, so the DSL shape is stable across
phases, but only these are `implemented:true` in P0: `ADJUST_NEED`,
`MOOD_DELTA`, `REL_DELTA`, `SPEND_MONEY`, `EARN_MONEY`, `SPEND_TIME` (parsed
but not yet consumed — wired up in P5), `MOVE_PLAYER`, `NPC_MOVE`,
`NPC_ACTIVITY`, `ADD_SKILL_XP`, `ADD_FLAG`, `CLEAR_FLAG`, `MEMORY_FACT`,
`MEMORY_EPISODE`. Object/item/evidence/suspicion/app/schedule/residency/arc
types are declared with `implemented:false` — validating against them
always fails (safe direction), and they're excluded from
`SCENE_EFFECT_VOCAB` in `prompt.js` so the LLM is never invited to use a
verb that can't do anything yet. As WORLD (P1)/ITEMS (P2)/STEALTH (P6) land,
flip `implemented:true`, add an `apply()`, and widen the relevant
`effectVocabulary` list.

**Action porting.** Only the five simplest verbs are ported onto
`ACTION_DEFS` in P0: eat/cook/shower/watch_tv/relax. `sleep`/`work`/`talk`/
`move`/`pay-rent`/`ask-to-leave` keep their hand-written `ui.js`
implementations — they involve multi-tick batching, LLM calls, or residency
mutation that fit more naturally once the object model (P1) and the
free-action pipeline (P5) exist. `handleAction` (UI) checks
`ACTION_DEFS[action]` before its switch and dispatches to
`runRegisteredAction` — a non-breaking bridge; unported verbs fall through
to the switch exactly as before. `renderActionChips` (RENDER) now queries
`resolveAvailableActions` for the room-sourced chips instead of a hardcoded
if-chain for those five specifically; Sleep/Work/Talk/Pay Rent chips are
still hardcoded above/below that block.

**Fixed in passing:** `saveAtBoundary` (STATE) was missing
`queueWrite('world', 'castWeb', ...)` — NPC-to-NPC relationship deltas from
`applyNpcToNpcDelta` silently never persisted past the in-memory session.
Found while wiring effects into the save path; now fixed.

**Known gap, deliberately deferred:** `saveAtBoundary` still writes every
NPC unconditionally on every boundary save (no dirty-tracking). The plan
bundles this fix with P1, since object buckets need the same dirty-set
mechanism — no sense building it twice.

**Verification performed for P0** (no test harness exists in this repo; see
the plan's Verification section for the longer-term `dev.selftest.js`
proposal). Since the game requires the real Perchance runtime (`root.kv`,
`root.generateText`) to fully boot, P0 was verified by loading `main.html`
in a browser and exercising the new pure functions directly via the
console against synthetic state:
- `parseEffectDSL` on a mixed valid/garbage multi-line string — correctly
  parsed 4 of 5 lines, correctly captured multi-word tail params (`reason`,
  `text`), correctly skipped the non-matching line.
- `validateEffects` against a mix of in-range/over-cap/unreachable
  effects — correctly accepted 2, rejected 3, with the expected reasons
  (need-delta cap, money cap, "not an active participant").
- `applyEffects` against a synthetic `gameState` — correctly mutated
  `player.hunger`/`player.money`/`npc.relPlayer.trust` in place,
  synchronously, with no kv calls.
- `resolveAvailableActions` on a synthetic kitchen-located player state —
  correctly returned exactly `['self.cook', 'self.eat']`, sorted by
  `chipPriority` (cook=40 before eat=30), and correctly excluded
  bathroom/living-room-sourced actions.
- `buildScenePrompt`/`validateProposal`/`applyProposal` against a synthetic
  context and an effects-only proposal — prompt built without error and
  included the new style/content/vocabulary sections; validation correctly
  passed the pre-existing checks unchanged while separately accepting 2 and
  rejecting 1 new-vocabulary effect; application correctly mutated a
  synthetic `gameState` (money 500→480, `skills.cooking`→8) with zero kv
  calls, confirming the effects-only path never touches `root.kv`.

Full live-loop verification (kv persistence, real LLM calls, NPC schedule
interaction with the new action chips) still needs the actual Perchance
generator environment and hasn't been done outside it — that's a
pre-existing constraint of this project, not something P0 introduced.
