# Scene Reader — session prompt

**Retired 2026-08-11 — the plan it drives is complete.** All five phases are
built and verified; there is no phase left for a session to pick up, and
Step 0's stop condition now fires immediately. Kept as the record of how the
work was run, and as a template worth copying for the next multi-session plan.
Do not hand it to an agent.

It is paired 1:1 with `scene-reader-ui-plan.md` and moved here with it. The
plan holds *what was built*; this holds *how it was worked*.

---

You are one session in a long-running series implementing the **Scene Reader**
overhaul for this game — replacing the flat scrolling narration log in
`#main-content` with a room-scoped *scene*: a heading, a composed establishing
passage saying who is present and what the player can sense, the beats that
have happened since they walked in, and closed scenes folded into a history
drawer. You have no memory of any previous session. Everything you need to
know about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/scene-reader-ui-plan.md`.

The first phase not marked **Done** is your phase.

- **Ordering exceptions.** Phase 5 (the conversation pane) touches only the
  conversation overlay and is independent of Phases 1–4 — it may run at any
  point. Phase 3 needs Phase 1's data but not Phase 2's DOM, so it may run
  either side of Phase 2.
- **Hard prerequisite.** Never do Phase 2 before Phase 1. The whole value of
  this plan is that the scene is a *computed object* (`composeScene`, pure and
  harness-tested) before it is a DOM tree; building the renderer first
  produces a renderer full of logic, which is the failure mode design
  invariant 1 exists to prevent.
- **Stop condition.** If every phase is marked Done, **stop** and report the
  plan complete to the user. Do not invent further work.

You should never need to read the whole plan document in one session.

## Step 1 — read the plan's Handoff section, then your phase

- **Handoff first.** It is the single source of truth for where the last
  session left off, and it carries hard-won specifics — browser quirks, which
  assertions were themselves wrong, why a constant is the value it is.
- Then `## Locked decisions`, `## Data model`, your phase block, and
  `## Design invariants`.
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

- `composeScene` / `openScene` / `markCalloutsShouted` — `src/srcfiles/scene.js`
- `renderSceneReader` / `renderSceneMoodles` / `buildLogEntryNode` — `src/srcfiles/render.js`
- `perceiveSignals` / `mergePerceived` / `signalPhrase` / `signalsByRoom` — `src/srcfiles/signals.js`
- `addRecentExchange` / `getRecentExchanges` — `src/srcfiles/npc.js` (the
  channel-tagged conversation buffer Phase 5 reads)
- The conversation overlay — `openConversationOverlay`, `convAddBubble`,
  `convAddBeat`, `doConvSend` in `src/srcfiles/ui.js`, markup at
  `#conversation-overlay` in `index.html`

**Hard technical rules.** Each carries its consequence:

- **`composeScene` stays pure.** It reads state and returns a plain object; it
  never writes and never calls the model. A harness assertion snapshots
  `gameState` around it and another stubs `root.generateText`. If you need a
  side effect, it belongs in a named writer beside it (see
  `markCalloutsShouted`), called by whoever presented the scene.
- **Renderers are projections.** `renderSceneReader` *returns* the scene so its
  caller can mark callouts; it does not mark them itself. A projection that
  writes to the thing it projects is how view and state start to disagree, and
  a harness assertion greps for exactly that regression.
- **Both draw paths matter.** `render()` (`render.js`) and `addLogEntry`
  (`ui.js`) each draw the scene. Anything that must happen when the scene is
  drawn has to happen in both, or a beat arriving at the wrong moment silently
  skips it.
- **No field without its reader in the same phase** (roadmap R8/RI6). The NPC
  audit that started this whole roadmap found 34 fields written, migrated,
  schema-validated and read by nothing.
- **Bump `?v=N` in `index.html` for every file you change.** A partial bump is
  how a client ends up running half-old code. They are independent per-file
  counters; bump the ones you touched.
- **Do not put backslash escapes through a `python - <<'PYEOF'` heredoc in
  this environment.** `content: '\25B8'` arrived as octal `\25` (0x15) plus
  `B8` and rendered as garbage in the history drawer. Use the literal
  character.

**Verification is not optional, and where it happens depends on the phase:**

- **Pure logic → the Node harness.** `node dev/verify/run-all.js` runs all of
  it; `node dev/verify/verify-r1.js` runs one. Read `dev/verify/README.md`
  first. Add a `verify-*.js` for your phase covering the invariant, not just
  the instance.
- **DOM → the browser.** `dev-harness.html` on the `slice-of-life` launch
  config (port 8734), **with a cache-buster** (`?cb=7`) because the browser
  caches the harness itself. Drive it from the console; `currentGameState`,
  `doMove`, `addLogEntry` and the render functions are all reachable by bare
  name. Verify DOM state with `javascript_tool` rather than by reading a
  screenshot — after a few viewport resizes the browser pane returns
  scaled-down captures and region zoom is unsupported.
- **Always re-run the whole suite before finishing.** It is 389 assertions
  across three plans and it has caught real regressions in phases that
  "obviously" could not have broken anything.

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
4. **Record any tuning number you set by measurement**, with what you measured.
   Several constants in this codebase were wrong on the first pass in both
   directions; the next person needs to know a number was observed rather than
   reasoned.
5. **If this was the last phase:** mark the plan's Status header complete, move
   both the plan and this prompt to `src/ref/complete/`, and update all three
   indexes in the same commit — `src/ref/README.md`,
   `src/ref/structural/ARCHITECTURE.md`, and the Plan 2 row in
   `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md`. House rules 3 and 4.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
