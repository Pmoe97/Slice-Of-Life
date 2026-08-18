You are one session in a long-running series implementing the **Intimacy &
Voyeurism Overhaul** for this game — a 2D "Sims"-flavoured apartment sim
becoming a very immersive adult sim: a full wardrobe system, doors you can
peek through and listen at, desire as a real need, NPCs who couple, cheat,
masturbate, and get caught, a player with symmetric intimacy verbs, a
per-character knowledge codex, and consequences that reach cold-shoulder and
move-out. You have no memory of any previous session. Everything you need to
know about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md`.

The first phase not marked "Done" is your phase. Phases must be done in
order, with these exceptions:

- Phase 9 (willingness math) is pure and may be built before Phase 8, but
  must precede Phases 11, 13, 15, and 17.
- Phases 17–19 are the most standalone — each needs only its own arc's
  prerequisites and may be taken early once those are in.
- Phase 18 (pregnancy) needs Phases 12/13 (couples) only, not the
  voyeurism arc.
- **Hard prerequisites:** never Phase 10 (peek) before Phases 3, 4, and 5
  (it reads door cues and renders clothing state); never Phase 11 or 13
  before Phase 9 (willingness is the only door); never Phase 13 before
  Phase 12 (pair acts need relationship records).

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" (D1–D16 — these are the design conversation's
  answers; do not relitigate them), the "Data model" shapes, the phase
  block, and "Design invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate; the arc
  structure (UI substrate → wardrobe → desire/voyeurism → couples → consequences →
  boundary/pregnancy → sound) encodes dependency and review granularity.
- When the plan says to reuse a pattern, go read that code and match its
  current shape. Patterns to mirror:
  - Action pipeline: `resolveAvailableActions` / `executeAction` /
    `runRegisteredAction` (actions.js) + `renderActionChips` /
    `handleAction` (render.js / ui.js)
  - Picker/panel UI: `openRecipePicker` / `openEatPicker` /
    `openSpreadPicker` (render.js)
  - Drive + commitment resolution: `scoreCandidates` / `choosePursuit` /
    `openCommitment` (cognition.js / drives.js) and `DRIVE_DEFS` entries
    (config.js) — especially the `actionId`-wrapping pattern (shower/nap)
  - Shared two-person activities: `resolveSharedActivity` /
    `sharedActivityParticipants` (actions.js)
  - Signals: `emitTransient` / `deriveStandingSignals` / `perceiveSignals`
    (signals.js); `leaves`/`emitsSignal`/`expresses` footprints on drives
  - The intimate content gate: `getPhysicalDescriptionForPrompt` +
    `intimateAllowed` (npc.js) and `buildEscortBoundaryText` (prompt.js) —
    D15 requires every explicit surface to follow these
  - Gossip/transmission: `pickFactsToRaise` / `addMemoryFact` /
    `factTransfers` (drives.js, npc.js)
  - Visits (outside partners): the visit spine in the external-world plan's
    code — `getActiveEscortVisit` (computer.js) and friends
  - NPC↔NPC axes: `world.castWeb` / `createBlankPair` /
    `applyNpcToNpcDelta` (npc.js)
  - Scene images: `composeSceneKey` / `composeCharKey` / `phaseLighting`
    (image.js)
- **Hard technical rules** (each with its consequence):
  - **The willingness function is the only door into intimacy.** No effect,
    drive, verb, or LLM call may make an unwilling subject participate (D13,
    invariant 1). Verify the negative floor actually aborts — this is the
    one check that cannot be skipped.
  - **Deterministic authority.** A boundary act is decided by data and only
    narrated by the LLM/image pipeline. Never hardcode explicit prompt
    strings that bypass the `getPhysicalDescriptionForPrompt`-style gate;
    never ask an LLM call to decide whether a boundary act happens (D15,
    invariant 3).
  - **`clothing === 'undressed'` must keep its meaning** at the intimate gate
    (invariant 4). If the clothing state machine changes it, the gate is
    updated in the same phase and only in the fail-closed direction.
  - **Symmetric initiation** (D3, invariant 2): player Make-a-Move and NPC
    overtures share one gate. A bypass either direction is a bug.
  - **State.js owns kv access.** Runtime reads/writes go through `state.js`
    adapters; deterministic systems stay pure (no bare `Math.random()` in
    sim-adjacent code — seeded rng only).
  - **Respect the closed-form fast-forward.** New timed loops (peek, Phase 10)
    must advance the clock in the same chunked/minutes semantics the
    heartbeat uses — never by looping real ticks during fast-forward.
  - **The floor plan is never omniscient** (D10, invariant 5). New map
    surfaces apply fog/plausibility gating; a render that "loses"
    information vs. an old save is the intended change.
  - **Submenus nest one level, never two** (D5, invariant 6). Keep the
    existing 40-line-per-function convention and the `hidden`-attribute UI
    rule in every new file.
- **Actually run the phase's Verification steps.** Verification happens on
  the **live Perchance page** (`browser_eval`/`browser_refresh` against the
  rendered generator, where `root.kv` and the image plugin exist — a local
  server proves nothing). At minimum, every phase: (1) the save/load
  round-trip (run the flow, reload, confirm state survived), and (2) the
  willingness/gate integrity check (a negative-willingness act never fires —
  assert it directly in the page, e.g. via a `browser_eval` harness).
  Phases that generate images must respect the plan's peek budget during
  verification (Phases 10+): reuse the cache, keep fresh generations low.
- Once verified, **stop.** One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). Name the real identifiers you created — the next session greps
   for them.
2. Update the phase's row in the Status table. Never leave Status and Handoff
   disagreeing.
3. Promote any resolved open question into Locked decisions as a new D-number
   and strike it from Open questions.
4. Record any measured numbers the phase produced (tuning values, peek-risk
   rates, willingness calibration, image counts) — nobody else will go
   measure them.
5. If this was the last phase, mark the plan's Status header complete and
   move the plan + this prompt to `src/ref/complete/` (and update the
   `src/ref/README.md` + `src/ref/structural/ARCHITECTURE.md` indexes).

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
