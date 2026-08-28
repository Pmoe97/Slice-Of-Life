You are one session in a long-running series implementing the **NPC avatar
liveliness and movement presentation** overhaul for this game — the
floor-plan avatars stop snapping between rooms and start reading as constant,
alive people: a presentation layer animates every avatar (including the
player's) between where the sim says they are and where the player last saw
them, walking through doors along the existing paths; NPCs stand at the
object they're actually using instead of a room's empty centre; and an
in-person conversation notices when its partner is about to leave or has
left, lets the model say so naturally, and never replies for a person who
isn't there. You have no memory of any previous session. Everything you need
to know about where things stand is either in the target document's
**Handoff** section or must be discovered by reading the current code —
never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section (including its **Audit
corrections** list) and the `## Status` table in
`src/ref/wip/npc-avatar-liveliness-and-movement-plan.md`.

**The design gate is CLOSED.** The design session ran on 2026-08-28 and
locked D15–D21; a code audit the same day added D22/D23 and amended
D4/D5/D6/D9/D14/D15. There is no `## Open questions` section any more — do
not go looking for one, and do not re-run the design session. What remains
open is only tunables and two flagged interpretations, neither blocking.
Record of the answers is in `## Design session record`; record of the
corrections is in the Handoff section.

**Do not "restore" a corrected decision.** Four constants in the original
design (`PRESENT.trackThreshold`, `PRESENT.maxRoomsForWalk`, the retirement
of `WALK.unitsPerSecond`, and a `ROOM_DECOR` `defId` that was assumed to
exist) were each defensible in prose and wrong against the real code or the
real floor plan. If a phase seems to want one back, read the `Audit
corrections` list before changing anything — the reasoning and the measured
numbers are there.

The first phase not marked "Done" in the Status table is your phase. Order:
**Phase 0 first** (everything's timing sits on it, and it carries D22 which
Phase 2b silently depends on), then **Phase 1** (the presentation floor).
**Phases 2, 2b and 3 are mutually independent** and may run in any order —
except that **2b additionally requires Phases 0 and 1**. Phase 4 requires
all five. If all phases are complete, **stop** and report that completion to
the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions", "Data model", the phase block, and "Design
  invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate.
- When told to reuse a pattern, go read that code and match its current
  shape. Patterns to mirror:
  - `planWalk` / `advanceFrameWalks` / `deriveLocationFromPosition`
    (`src/srcfiles/movement.js`) — the path re-planner and the live
    integrator the presentation layer extends; note `clockFrame`'s
    gameMinutes→gameSeconds formula is the ONE time↔distance conversion
    (`clockFrame` computes gameMinutes at time.js:183; `advanceFrameWalks`
    turns it into gameSeconds at movement.js:153) — never reinvent it. The
    dilation scale is a MULTIPLIER OVER REAL TIME, so one rAF at idle 20×
    is 1/3 game-second, not 20 — getting this backwards is what produced
    the `trackThreshold` the audit had to delete.
  - `renderFloorPlanLive` / `floorPlanAvatarPlacement` (`src/srcfiles/render.js`)
    — the per-frame loop the presentation layer takes over, and the SIM
    position source it must not mutate.
  - `resolveActionAnchor` (`src/srcfiles/actions.js`) — where the stand-point
    computation lives; Phase 2 swaps its centroid fallback for
    `resolveObjectStandPoint`.
  - `renderAutoFurniture` (`src/srcfiles/render.js`) — the packing Phase 2
    extracts into `resolveAutoPlacements`; extract verbatim so the picture
    doesn't change.
  - `buildScenePrompt` / `conversationContinuityLine` (`src/srcfiles/llm.js`)
    — where the DEPARTURE AWARENESS block and the per-turn presence
    reconciliation plug in. The reconciliation FILTERS `currentSceneState`;
    it never reassigns it from `getSceneParticipants`, which returns a fresh
    `engagement: {}` and would wipe the scene's engagement counters (D14).
  - `activeConversationSession` / `doConvSend` (`src/srcfiles/ui.js`) — the
    per-turn presence recheck and session end.
- **Hard technical rules:**
  - **The presentation layer never writes sim state.** `npc.pos`,
    `npc.location`, `npc.walk`, `commitment.arrived` keep exactly the writers
    they have today. If you catch yourself assigning any of them from a
    render path, stop — you're breaking determinism (invariant 1).
  - Determinism: any new draw is appended at the END of a sequence; never
    insert mid-sequence (it shifts every seed's cast).
  - kv access only through the `state.js` helpers — never `root.kv` directly.
  - A new source file registers in TWO places in the same commit: the
    `src/` load list in `index.html` (with a `?v=` bump) and `loadgame.js`'s
    `ORDER`. A real prior incident silently dropped 175 assertions this way.
    **This plan adds two such files**: `movement.present.js` (Phase 1) and
    `defs.placement.js` (Phase 2).
  - **`render.js` is NOT in `loadgame.js`'s `ORDER`** ("stops before
    render/ui"). Anything a Node harness must exercise cannot live there —
    which is why Phase 2 moves the furniture FOOTPRINT table out of
    `render.js` and leaves only `draw()` behind.
  - **Never threshold a per-frame distance.** units/frame varies with the
    player's refresh rate and the current time dilation. Track-vs-catch-up
    reads CAUSE (does the avatar hold a `walk` record?); teleport-vs-replay
    reads a game-TIME gap. This is invariant 7b and the single easiest
    mistake to reintroduce.
  - Verification split: pure logic (path re-planning, placement identity,
    `imminentDeparture` window maths) gets a Node harness under
    `dev/verify/` (named `verify-present-pN.js` — `run-all.js` GLOBS
    `verify-*.js`, so there is no list to register in, just the filename);
    anything visual or UI gets verified on the live page with
    `browser_eval`/`vision` — a local server proves nothing.
  - **Confirm the harness actually loaded the engine.** `loadEngine()`
    silently loads ZERO files and every assertion "passes" if the source
    path is wrong, unless you pass `required: [...]`. Always pass it. (The
    tree shipped in exactly this broken state until 2026-08-28.) The
    pre-Phase-0 `run-all.js` baseline is **3310 passed, 73 failed, 8
    errored** — those failures are other work's, not yours; compare against
    that number rather than expecting a clean suite.
- **Actually run the phase's Verification steps.** At minimum, the two
  checks that apply to nearly every phase here: the save/load round-trip,
  and the "marker never jumps / sim state untouched" assertion for Phase 1
  (or the presence-recheck behavior for Phase 3).
- Once verified, **stop.** One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). **Keep the `Audit corrections` list intact** — it is why six
   D-numbers read the way they do, and a session that loses it will
   reintroduce the constants it removed. Name the real identifiers you
   created — the next session greps for them.
2. Update the phase's row in the Status table. Never leave Status and
   Handoff disagreeing.
3. If a phase forced a locked decision to change, amend that D-number in
   place and add a line to `Audit corrections` saying what moved and why —
   never silently rewrite a D-number.
4. If this was the last phase, mark the plan's Status header complete.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
