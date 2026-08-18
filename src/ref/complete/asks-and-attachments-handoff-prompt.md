You are one session in a long-running series implementing the **Asks &
Conversation Attachments** overhaul for this game — a `+` attachments menu on
the in-person conversation overlay whose **Request** tree walks the player
through nested categories of hardcoded ask types (meals, hangouts, loans,
chores, photos, intimacy, info). Picking an ask fills the input with
`$AskId <Optional>`; the player may replace `<Optional>` with flavor. The
outcome is **deterministic** — `decide()` is a pure function of NPC state,
relationship, world, and seed — and the LLM is fed the normal conversation
prompt *edited with the intent and the verdict*, so it only ever *phrases* the
NPC's in-character response, never decides it. Scheduled asks bind the NPC's
real schedule (they actually show up) through a calendar modal. You have no
memory of any previous session. Everything you need to know about where things
stand is either in the target document's **Handoff** section or must be
discovered by reading the current code — never assume continuity with a prior
chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` header line and the `## Status`
table in `src/ref/complete/asks-and-attachments-plan.md`.

The first phase not marked "Done" is your phase — go to Step 1. The phases
must be done in order, with these deliberate exceptions (from the plan's
Dependency order):
- **Phase 1 first, always.** Everything downstream assumes the spine exists.
- Phases 7 (intimacy), 8 (photos), and 9 (gifts) depend only on Phase 1 and
  can be slotted in any order.
- Phase 5 (`requestMeal` inference) requires Phase 4 (the calendar modal).
- Phase 6's only Phase-3 coupling is one ladder-penalty term — it may run
  before Phase 3 if the penalty is stubbed with a TODO.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a given
session — read the Handoff section, the "Locked decisions" section once so
you understand the shape, then the specific phase block (Goal / Files /
Verification) for the phase you're on.

## Step 1 — read the plan's Handoff section, then the relevant phase

- The plan's `## Handoff — read this first` section is the single source of
  truth for exactly where the last session left off — read it before anything
  else.
- Then read the plan's "Locked decisions" (every phase depends on D1–D14 —
  especially D1 flavor-blind determinism, D2 effect-stripping, D3 `$AskId`
  syntax, D7 the repeat ladder, D8/D9 the two-stage scheduled flow, D10
  meal-type inference, D14 the willingness gate) and the specific phase block
  (Goal / Files / Verification) you're resuming or starting.
- **The reusable LLM prompt is `src/ref/complete/asks-llm-prompt.md`** — Phase 1
  implements it as `buildAskDirective` in `llm.js`. Read it before touching
  the prompt side of any phase, and keep it in sync when the directive
  changes.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** These documents drift as the codebase changes
  under them — a citation may have moved since it was written. Find the real
  current location by name/content, not blindly by line number. A stale
  citation is expected, not an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code, or
  a "locked decision" turns out to be unworkable given how something else
  actually works, **stop and flag it** — add a note under the Handoff
  section's "Blockers / flagged deviations," explain exactly what you found,
  and end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started — no more. Don't pull
  forward work from a later phase even if it looks convenient right now; the
  phase boundaries are deliberate (dependency order, risk, and verification
  granularity all assume phase-sized chunks, and each phase is meant to be
  reviewed on its own).
- When a phase says to reuse an existing pattern, go read that existing code
  first and match its actual current shape — don't approximate from the
  doc's paraphrase. Patterns you will be told to mirror:
  - The deterministic decision: `respondToCommitment` + `createCommitment`
    (commitments.js) — the template for `decide()`: seeded noise, the
    affection−tension score, the `'busy'`/`'cool'` reason split, and the
    durable record.
  - The schedule probe: `resolveScheduleActivity` +
    `COMMITMENT_TUNING.busyBlocks` (sim.js, config.js).
  - The intimacy gate: `resolveWillingnessGate` / `noteIntimacyRefusal` /
    `noteIntimacyOccurred` (willingness.js) — reuse whole, never a second gate.
  - The conversation send path: `doConvSend`, `convAddBubble`, `convAddBeat`
    (ui.js) — where parse → decide → strip → inject → apply happens, and where
    the dim tag chip renders.
  - The prompt builder: `buildScenePrompt` + `callLLM` (llm.js) and
    `validateProposal` / `applyProposal` (npc.js) — the ask directive appends
    to the prompt; ask effects apply through the normal effect pipeline
    (`applyEffects`, `buildEffectContext`, `EFFECT_DEFS`, `validateEffects`
    in effects.js).
  - Determinism: `seededRng` (sim.js/orbital.js) — same convention
    `respondToCommitment` uses.
  - Free-text routing precedent: `classifyIntent` (intent.js).
  - Photo artifacts: `getPhotoImage` / `getPlaceholder` (image.js) and the
    IM photo-thumbnail pattern (render.computer.js).
  - Memory writers: `addMemoryFact` / `MEMORY_FACT` / `MEMORY_EPISODE`
    (npc.js); the Assessor/Chronicler (`x5.js`) — the writer already scores
    nothing; asks extend that.
  - Save discipline: `saveAtBoundary` (state.js).
- **Hard technical rules every phase must respect:**
  - **Decision before any LLM call on ask turns** (invariant 1). The ask's
    outcome is computed before `generateText` is ever invoked. A session that
    lets the writer have the first word has undone the point of the whole
    plan.
  - **Flavor never decides** (invariant 2). The `<Optional>` text feeds the
    LLM phrase only. If a player's wording could flip a decision, that is a
    bug — add a test for it in the phase's verification.
  - **Strip writer effects on ask turns** (invariant 3) — gate it in
    `doConvSend`, NOT inside `callLLM`: the regex fallback tier in `callLLM`
    can smuggle `parseEffectDSL` lines back in. Ask effects are applied by
    the ask pipeline through the effect pipeline at the same point
    `applyProposal` would have.
  - **Seeded determinism.** Every decision draws
    `seededRng(meta.seed, 'ask_'+category+'_'+npcId+'_'+day+'_'+count)`. No
    `Math.random` anywhere in the decision path. Reloading a save never
    renegotiates an answer.
  - **All state writes go through existing writers** — the effect pipeline,
    `createCommitment`, `noteIntimacyRefusal`/`noteIntimacyOccurred`, the
    memory writers. Never mutate persisted stacks directly.
  - **Semantic stances only.** The LLM prompt receives `reasonPhrase` /
    `stance` words, never the raw willingness/score numbers behind the
    decision (see `asks-llm-prompt.md`'s placeholder rules).
  - **`textContent`, not `innerHTML`,** for anything from player or LLM
    input.
  - **Load order.** New `src/srcfiles/asks.js` registers in index.html's
    SCRIPTS section after commitments/willingness/effects/npc/llm/x5 and
    before ui.js (all call-time deps, so the exact slot is flexible within
    that range) — update the load-order comment above it and bump the `?v=`
    query on **every** changed script tag together.
  - **The willingness gate is the only door to intimacy** (D14). Never relax
    or bypass it inside an ask.
  - **Don't touch the IM "Invite to Dinner" chip.** The IM scheduled flow
    stays as-is; asks are in-person only in v1 (a parked open question).
- **Actually run the phase's Verification steps before considering it done**
  — don't mark it complete because the code looks right. Verification happens
  on the live perchance page via `browser_eval` (and `vision` for the menu /
  layout). A phase's verification block lists exactly what to check; at
  minimum drive the phase's core flow end-to-end and assert the ask
  invariants — same-save-same-answer, flavor-never-flips, writer effects
  stripped, and the save/load round-trip.
- Once a phase is genuinely complete and verified, **stop.** Do not roll into
  the next phase in the same session, even if you have context budget left —
  one phase per session is the point of this workflow.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Update the plan's `## Handoff — read this first` section (overwrite it,
   don't append to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified, anything
     that surprised you (moved citations, a small necessary deviation and
     why, actual ids/shapes added — the next session greps for them).
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase's row in the plan's `## Status` table: "Done," "In
   progress," or leave "Not started" if you didn't get to it — never leave
   Status and Handoff disagreeing with each other.
3. Promote any resolved open question into Locked decisions as a new
   D-number.
4. If you changed the ask-directive wording, update `src/ref/complete/asks-llm-prompt.md`
   so the reusable prompt and the code never drift apart.
5. If you completed the last phase of the plan, mark the plan's Status header
   line accordingly so Step 0 of the next session correctly reports the work
   as done.

Do not end a session without doing this, even if you ran out of useful
context mid-phase — a half-finished phase with a precise Handoff note is
recoverable; a half-finished phase with no note is not.
