# NPC avatar liveliness and movement presentation

Status: **COMPLETE — all phases (0, 1, 2, 2b, 3 and 4) DONE** (see Handoff).
Investigation
complete 2026-08-28 (four issues, root causes confirmed in code). **Design
session complete 2026-08-28: all five questions answered + follow-ups →
D15–D21 locked** (see `Design session record`). **Code audit complete
2026-08-28: D22/D23 added, D4/D5/D6/D9/D14/D15 amended against measured
behaviour** (see `Audit corrections` in the Handoff section — four locked
constants were arithmetically wrong and one decision depended on data that
does not exist yet). **Phase 3 added three more Audit corrections of its
own on 2026-08-29** (see items 5–9 there: `destRoomId` on `imminentDeparture`,
the third "next room" signal, the non-existent `meal` block, the checkpoint
cadence correction). Phase 4 (the last phase) ran on 2026-08-29: the full scenario
matrix was verified live, the two real fixes it produced are recorded in the
Handoff's Phase 4 notes, and the plan is complete. Last updated 2026-08-29.

Companions:
- `src/src/ref/complete/continuous-behavior-engine-plan.md` — the substrate this
  plan sits on. Its D8 (position system owns `location`), D9 (live/batch
  velocity regimes) and D12 (static/live render split) define exactly what
  the presentation layer is allowed to touch (nothing sim-side).
- `src/src/ref/complete/floorplan-and-movement-plan.md` — `ROOM_LAYOUT`
  geometry, `walkSeconds`, `resolveWalk`, `planWalk`'s door-midpoint paths,
  and the renderer this plan's markers live in.
- `src/src/ref/wip/home-design-studio-plan.md` — `ROOM_DECOR` authored
  placements (pool_room only today). This plan reads them for anchors where
  they exist; it does not author more rooms.
- `src/src/ref/complete/decor-economy-plan.md` — `placeDecorItem`, the only
  writer of real `obj.pos` today.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table near the bottom, as the very last thing you do each session — see
`src/src/ref/wip/npc-avatar-liveliness-and-movement-handoff-prompt.md` for the
full session protocol.

---

## Handoff — read this first

**No resume — the plan is COMPLETE.** Phases 0, 1, 2, 2b, 3 and 4
are all DONE; see the phase notes in Last session's notes for the full
records. Phase 4 (2026-08-29) ran the whole scenario matrix live against the
engine, found TWO real defects in the off-map fade lifecycle and fixed both
(recorded in "Phase 4 — DONE" below). The only intentionally-open items are
tunables (PRESENT.*, WALK.*, the D19 player-speed multiplier adopted
unchanged in Phase 2b); nothing blocks a fresh plan. A session re-opening
this document should read "Phase 4 — DONE" for the current state of the
presentation layer.

**Audit corrections (2026-08-28, second pass — no code written).** The
design as first locked contained four defects that would each have surfaced
on the first run. Every one is now folded into the decision it belongs to;
this list exists so a resuming session knows these were deliberate
amendments and does not "restore" them:

1. **D4/D5 — `trackThreshold: 3` deleted.** It thresholded a raw per-frame
   sim delta, which is frame-rate and dilation dependent: a normal live walk
   is ~3.8 units/frame at idle 20× / 60fps and 1.6 at 144Hz. Every live walk
   at the DEFAULT speed would have been misclassified as a jump. Replaced by
   cause-based classification (does the avatar hold a `walk` record?).
2. **D6 — `maxRoomsForWalk: 3` deleted.** 170 of the flat's 342 ordered room
   pairs are 4+ hops, so half of all catch-ups — including the ordinary
   cross-flat `settleWalks` snap this plan exists to fix — would have
   fade-teleported. Replaced by a game-time gap gate.
3. **D9 — `ROOM_DECOR` has no `defId`.** Its entries are keyed by
   `DESIGN_SHAPES` names (`pool`), `OBJECT_DEFS` by defIds
   (`swimming_pool`), and nothing maps between them. Tier 2 of the
   stand-point priority did not exist; Phase 2 now authors it.
4. **D15 — in-room walks collapsed to 1 game-second.** A same-room route has
   zero transitions, so `secondsPerRoom × transitions` floored at
   `minSeconds` — and `resolveActionAnchor` deliberately PREFERS the actor's
   own room, making that the most common walk in the game. An in-room
   distance term is now part of the formula.

Plus two decisions the original plan needed and did not have: **D22** (the
batch regime has no partial walk advance, which Phase 0 makes 4–12× more
visible and which D20's catch-up silently depends on) and **D23** (the
presentation layer's only frame source is a clock that the action outcome
window pauses for its whole lifetime).

**Audit corrections, second session (2026-08-29, folded into Phase 3 while
it ran).** The Phase 3 design as locked also contained four defects against
the real code + one behavioural bug found in live verification. Items 5–8
were written into the plan as the phase went; item 9 records the
`checkConversationWalkOut` bug and its fix. A resuming session must treat
these as deliberate, not as something to "restore":

5. **D12 — `imminentDeparture` gained an ADDITIVE `destRoomId` field.** The
   locked D12 shape was `{ reason, destType, leavesAtAbs, minutesAway }`; the
   D21 [Join] flow needs to know WHICH room to walk the player to, and
   `destType` is only coarse. `imminentDeparture` now also returns
   `destRoomId` (the resolved room the partner is bound for). Additive — D21
   depends on it, no D-number moved.
6. **A third signal — "next room" — is required beyond the design's two.**
   The two locked signals (in-walk pre-check, work boundary) ALWAYS evaluate
   'offflat' on a real game: the walk-out pre-check is caught earlier by D11
   (the partner won't start a walk out of an open conversation), and a
   work-boundary departure is always off-flat (work walks anchor at the front
   door). Result: shared-space invites and privacy dismissals (D21's [Join])
   were UNREACHABLE. Added `nextScheduleBoundary(npc, clock)` (cognition.js):
   predicts the next SCHEDULES block boundary within the window from the RAW
   template ranges (weekday/weekend by `isWeekend(day)`, `sleepRhythm`
   deliberately ignored, end-of-day wraps to the next day's sleep) and maps
   block → tier: sleep/wind_down → 'privacy' (residency.room); midday/evening
   → 'shared' ('dining'); leisure → 'shared' ('living_room'); morning →
   'shared' ('kitchen'); commute/work → 'offflat' (frontDoorAnchor's roomId,
   'entry'); else null. Gate: `boundaryAbs − nowAbs ≤ windowMinutes` AND
   `destRoomId ≠ npc.location` (a same-room next block is not a departure).
7. **There is no `meal` schedule block.** The design assumed one drove
   shared-space invites; the real SCHEDULES templates have no `meal` block —
   meals are drive-driven (commitments), not schedule-driven. Shared/invite
   phrasing maps from the morning/midday/evening/leisure blocks instead (item
   6). No D-number moved; the D12 phrasing tiers are unchanged, only which
   block feeds 'shared' changed.
8. **Checkpoint cadence — the Evidence claim "sim checkpoints fire every 30
   real-sec" is wrong for this engine.** simCheckpoints fire every 30
   game-MINUTES (config.js:3502 `simCheckpointMinutes`), which at the
   conversation dilation of 1× is ~30 real MINUTES, not 30 real seconds —
   the departure-mid-conversation scenario is far rarer than Evidence
   implied. The feature still matters (a player can sit in a 1× conversation
   for many game-minutes), but `checkConversationWalkOut` is deliberately
   NO-SAVE (it only mutates in-memory conversation state), so the 30-min
   checkpoint cadence imposes no write cost.
9. **doConvSend stages departure from the STORED probe, never a per-turn
   recompute; and `checkConversationWalkOut` must key on the open overlay,
   not on `activeConversationSession`.** D13's one-beat ack is implemented as
   `convState.departure = { ...imminentDeparture(...), npcId, beatsLeft }`
   captured ONCE when the departure first surfaces; the prompt's DEPARTURE
   AWARENESS block reads ONLY the stored flags each turn —
   `imminentDeparture` is deliberately not re-evaluated per turn (the window
   would decay and the phrasing change mid-exchange). The original
   `checkConversationWalkOut` was keyed on `activeConversationSession(...)`
   and silently bailed when that helper's OWN lazy check had already deleted
   the session on a location mismatch (partner snapped to another room
   mid-batch) — leaving `convState` set and the overlay hanging over a dead
   talk. Fixed to key on the open overlay (`convState?.npcId`), using
   `conversationPartnerPresent` for the co-location check and falling back to
   the session branch for paused talks.

**Phase 4 — DONE (2026-08-29).** Polish + full live verification, carried out against the real engine. This was a bug-fix + polish pass, not a locked-decision change — nothing in Audit corrections moved.

**Two real bugs found by live verification and fixed in `movement.present.js`:**
- **Off-map fade-out never completed (the marker pulsed in place forever).** The top-of-frame `rec.fade` expiry pre-empted the off-map 'out' fade at the exact frame p reached 1, then the off-map branch re-created it at p=0 — `rec.visible` never became false (12 fade restarts over 80 frames, never hidden). Reproduced deterministically in the harness. Fixed with a completion latch: top-of-frame now does `if (rec.fade && (nowMs - rec.fade.t0) >= rec.fade.dur) { const k = rec.fade.kind; rec.fade = null; if (k === 'out' && sim.offMap) rec.visible = false; }` plus a kind-guard on the off-map branch's re-arm (`if (!rec.fade || rec.fade.kind !== 'out')`) so an in-flight 'in' fade converts to 'out' and a completed fade isn't re-armed. Grep for the `completedKind` latch and the off-map re-arm guard.
- **On-map fade-in was a one-frame flash** (opacity 0 on frame 1, then full — the 'in' fade's self-clear only ran while `!rec.visible`, so it never animated and left a stale 'in' fade behind). Fixed with a mid-flight branch mirroring the `rec.tele` blink pattern, inserted after the `if (!rec.visible)` fade-in block and before the tele-blink branch: `if (rec.fade && rec.fade.kind === 'in') { const p = (nowMs - rec.fade.t0)/rec.fade.dur; if (p < 1) { rec.x = sim.x; rec.y = sim.y; return {... inlineOpacity: clamp01(p)}; } rec.fade = null; }`. Grep for the mid-flight 'in' fade branch. `movement.present.js` is at `?v=4` in index.html.

**Harness results (run individually via the worker runner — the aggregate run-all is contaminated by other work's failures):** p0 14/14, p1 24/24, p2 15/15, p2b 17/17, p3 33/33, p4 14/14 (now includes the fade-in ramp assertion: mid-ramp `inlineOpacity` strictly between 0 and 1), m4 22/22.

**Live scenario matrix — all PASS (browser_eval against the real engine):** idle snap-free walking; batch settle replay (Issue-A); reconcile teleport; player doMove catch-up; sleep fast-forward teleport (D6 gate, 450ms blink, no catch replay); reduced motion (D7 — move becomes teleport blink, no catch, no dotted path); BOTH D23 paused-clock scenarios (action window and showMainMenu('pause') — catch continues through the open pause, clock+present loops both suspend on document.hidden); mid-walk save/load (D22 — walk carries startedAtAbs/speed/completesAtAbs through real kv and resumes proportionally); conversation departure (DEPARTURE AWARENESS + typed lines, D13) and the [Join] chip; fade-out completes and STAYS hidden; clean symmetric fade-in on return. Per-frame cost 0.09ms steady / 0.10ms with a walk in flight for 18 avatars.

**Testing gotchas worth keeping (not plan content, but a future session re-verifying should know):** the live present rAF loop races manual test frames — set `currentGameState = null` during manual `presentFrame` loops and restore after; `getSceneParticipants(player, npcs, world)` (NOT `(g, g.player.location)`); any hand-built game state's `g.meta` MUST carry `versions: {...FOLDER_VERSIONS}` or a save breaks migration; never re-assign a `const` in execute_js; the `edit` tool fails byte-matching on `movement.present.js` and this plan file — use fs string replaces; `advanceFrameWalks` skips walks when `npc.pos` is undefined — seed pos first.

**Phase 0 — DONE (2026-08-28).** Walk-time tiers implemented and
live-verified (every check run against the real engine via browser_eval;
the pure ones are also encoded in the new `dev/verify/verify-present-p0.js`):

- `config.js` — `WALK.secondsPerRoom = { npc: 10, player: 3 }`,
  `minSeconds: 1`, `arriveEpsilon: 2`, `unitsPerSecond: 11.5` (retuned
  28 → 11.5: the in-room leg stays distance-derived, D15);
  `secondsPerThreshold` retired (comment at config.js:362).
- `movement.js` — `planWalk` (movement.js:110) computes
  `seconds = perRoom × transitions + inRoomUnits / unitsPerSecond`, stamps
  `startedAtAbs`/`completesAtAbs`, sets per-walk `speed = totalUnits/seconds`;
  `advanceFrameWalks` (movement.js:178) advances by `w.speed ??
  WALK.unitsPerSecond`; `settleWalks` (movement.js:219) advances an
  incomplete walk proportionally only when `typeof w.startedAtAbs ===
  'number'` (D22); a pre-Phase-0 save (no `startedAtAbs`) still snaps.
- `world.js` — `walkSeconds(route, tier='player')` (world.js:68) is the one
  source of truth; `resolveWalk(gs, from, to, tier)` (world.js:156) threads
  the tier and is its only caller. `doMove` (ui.js:7271) passes `'player'`;
  ui.js:7376 consumes `walk.seconds` unchanged.
- Measured live, all 342 ordered room pairs: NPC tier = 10s/hop + in-room
  distance; player tier = NPC tier − 7s/hop exactly. living_room→dining
  24.84s; bedroom_3→gym 79.86s (7 hops) < 90. Same-room living-room
  interior diagonal 322.4 units → 28.03s = 322.4/11.5 (NOT `minSeconds`).
  `advanceFrameWalks` half-span lands exactly half the units at the
  half-way point on the path; a full span (+1e-6 min) completes at the
  anchor. D22: 40% through the span settles to coveredUnits ≈ 40%, pos
  mid-path, arrived still false; past `completesAtAbs` it lands. A JSON
  save/load round-trip preserves `startedAtAbs`; C6 (seed 777001, 96 ticks)
  byte-identical.
- Harnesses: new `dev/verify/verify-present-p0.js` (required:
  config/sim/world/movement/time). Rewritten in place (not deleted):
  `verify-plan.js` section 4 — now asserts the 'npc' tier, bound `< 90`,
  `WALK.secondsPerRoom` positivity, and the D15-inverted geometry check
  (dining resize 24.84 → 33.46s still lengthens); `verify-m4.js` — the six
  `WALK.unitsPerSecond` sites became the per-walk `speed` identity
  (`speed === totalUnits / ((completesAtAbs − startedAtAbs) × 60)`).
- `node src/src/dev/verify/run-all.js` was NOT run (no shell in the build env);
  every harness check was instead executed against the live engine via
  browser_eval and passed, and the three touched harness files parse clean.
  Compare against the pre-Phase-0 baseline **3310 passed, 73 failed, 8
  errored** — those failures are other work's, not Phase 0's.

**Phase 1 — DONE (2026-08-29).** Presentation-position layer + own rAF loop
+ dotted path illustration implemented and live-verified against the real
engine (every check via browser_eval; the pure core is also encoded in the
new `dev/verify/verify-present-p1.js`):

- `src/src/srcfiles/movement.present.js` (new, registered in BOTH `index.html`'s
  load list after movement.js with `?v=1` and `loadgame.js`'s `ORDER` — the
  same commit, invariant 6). Identifiers the next session greps for:
  `presentAvatars` (top-level `let`, per-avatar records; NOT on `window`),
  `presentSeed`, `presentFrame(gs, nowMs)`, `presentStepAvatar(rec, sim,
  ctx, nowMs)` (the pure per-avatar state machine), `beginPresentCatch`,
  `presentCatchDecision`, `presentTeleport`, `replanPresentPath` (start →
  sharedWallSegment door midpoints → target, same machinery `planWalk`
  uses), `presentInRoomUnits`, `coveredAlongPoint`, `presentNpcSleeping`,
  `presentPathToD`, `presentAccent` (FNV-1a accent for the D18 line),
  `freshPresentRec`, `presentWriteRoutePaths`, and the D23 loop
  `startPresentLoop`/`presentLoopFrame`/`presentLoopRunning` (starts at
  file load, independent of clockFrame; `renderFloorPlanLive` keeps calling
  the sim-position half — the two calls are idempotent per frame).
- State-machine fixes that landed during this phase (all in
  `presentStepAvatar`): (1) an in-flight teleport-blink branch right before
  `const w = ...` — without it `presentTeleport` snapped rec to sim and the
  next frame's idle check swallowed the rest of the blink after one frame;
  (2) the mid-catch branch sits ABOVE the TRACK branch, and TRACK carries
  `!rec.catch` — the D23 guard so a paused clock (action-outcome window,
  gap reads 0) never aborts an in-flight catch and snaps the marker; (3)
  `presentTeleport` clears `rec.wasTracking`/`rec.lastWalkPath` so a
  teleport can't be replayed by the stale-saved-path branch.
- `config.js` — new `PRESENT` block after WALK: `floorSec: 0.9`,
  `capSec: 2.4`, `shortHopSec: 0.6` (D5), `teleportAfterGameMinutes: 20`
  (D6 gate is game-TIME, not room count), `liveGapGameSeconds: 2` (D4/D22
  cause-based track-vs-catch time gate — never a per-frame distance,
  invariant 7b), `fadeMs: 350`, `teleportMs: 450`, `lineAboutOpacity:
  0.55`, `lineActiveOpacity: 0.9`, `lineSmooth: 0.12` (D18).
- `render.js` — `renderFloorPlanStatic` emits `<g class="fp-paths">` ahead
  of `<g class="fp-people">` (render.js:452); `renderFloorPlanLive` is now
  just `presentFrame(gs)` (render.js:887); `floorPlanAvatarPlacement`
  (render.js:857) stays the untouched SIM-position source (invariant 1).
- `index.html` — `.fp-route` CSS (fill:none, 1.6 stroke, round cap, `5 4`
  dash, pointer-events:none) + `.fp-avatar { will-change: transform }`. NO
  transition on `.fp-avatar` (the plan's D5 trap). `?v=` bumped on the new
  script tag.
- `dev/verify/verify-present-p1.js` — the path-re-planner/catch harness:
  track (D4), D22 catch along walk path, D23 paused-clock continuation,
  snap-replay (Issue A), generic door-midpoint catch, D6 teleport gate, D7
  reduced motion, D18 no-player-line, invariant-1 no-write. **24 passed, 0
  failed.** NOTE for re-running: there is no shell in this build env — the
  harness runs through `execute_js`'s worker, not `node run-all.js`. The
  loader recipe: acorn-parse each source file, rewrite top-level
  `let`/`const` statements to `var` (so cross-file `const` refs survive
  one concatenated `(0,eval)`), stub `window`/`document`/`root`/
  `requestAnimationFrame`/`URL`/`performance`/timers, strip the harness's
  `require`/`loadEngine(...)`/`api(...)` wrapper, and `(0,eval)` the lot;
  `image.js` is skipped (its unguarded `window.addEventListener('resize')`
  throws against the stub — it is not needed by this harness). Always pass
  `required: ['config.js','sim.js','world.js','movement.js','time.js',
  'movement.present.js']` so a wrong path fails loudly instead of a silent
  24/24.
- Live-verified (all against the real engine, seed 20260828 + 20260901
  houses): D4 continuous track at idle (marker follows sim exactly, 24
  frames, zero catch-ups) AND frame-rate invariance (same walk, same 6
  game-sec, 30fps vs 60fps cadence → both faithful, zero catch-ups —
  the property the deleted `trackThreshold` could not give); D22/D23
  catch-up after a batch advance (48 distinct interpolated positions,
  lands exactly on sim; walk-completed case re-plans through door
  midpoints, `replanPresentPath` path length 4); D23 loop runs on its OWN
  rAF (marker moved (293.5,62.5)→(208.4,201.0)→(146.6,291.0) over real
  time with zero manual `presentFrame` calls, route drawn, `presentLoopRunning`
  true) and a frozen-clock burst of 40 frames paints 40 distinct positions
  while `npc.pos`/`location`/`walk`/`commitment.arrived` stay byte-identical
  (invariant 1); static rebuild places markers at present positions
  immediately (no 0,0 flash); both floor-plan containers (sidebar +
  `#floor-plan-large` overlay) agree exactly; new seed resets `presentAvatars`
  (presentSeed keyed); D18 dotted line fades in (about→active), tracks to the
  destination, fades out and its `<path>` is removed on arrival, and the
  player gets no line. `vision`-checked the styled SVG capture: dashed,
  crosses walls at the door gaps, walker sits ~40% along the first leg.
  Caveat: the action-outcome-window D23 test used the frozen-clock
  equivalent (the window's only presentation effect is clock pause,
  scale=0) rather than literally opening the window UI; the own-rAF loop
  and the `!rec.catch` paused-clock guard are what D23 needs and both were
  verified directly. No `perchanceErrors`/`syntaxErrors` on a final fresh
  load. Compare the suite baseline 3310 passed, 73 failed, 8 errored —
  untouched by Phase 1.

**Phase 2 — DONE (2026-08-29).** Shared furniture placement + interaction
anchors implemented and verified — the furniture the floor plan DRAWS and the
stand-point an NPC WALKS TO are the same coordinates by construction
(invariant 2). Everything in the locked design (D8/D9/D10/D17) landed exactly;
no D-number moved:

- `src/src/srcfiles/defs.placement.js` (NEW — registered in BOTH `index.html`'s
  load list right after defs.design.js, `?v=1`, and `loadgame.js`'s `ORDER`,
  same commit — invariant 6). Identifiers the next session greps for:
  `FP_FOOTPRINTS` (49 `{w,h}` entries moved VERBATIM out of render.js's
  `FP_FURNITURE`), `DECOR_SYMBOL_ALIASES` (also moved from render.js; render.js
  still uses it for its own `FP_FURNITURE[defId] = {...base}` decor-catalog
  copy loop), `fpFootprint(defId)` (alias-following footprint resolver; null
  for undrawn defIds — floor, doors, phone, diary), `resolveAutoPlacements(gs,
  roomId)` (the deterministic perimeter packer extracted VERBATIM from
  renderAutoFurniture's packing, returned as data `[{defId, objId, x, y, w,
  h}]` in draw order, null for unknown room, [] for a room with no drawable
  objects), `objectStandPoint(rect, roomCx, roomCy, inset)` (the D10
  edge-nearest-room-centroid + outward inset), `DEFAULT_STAND_INSET = 4`, and
  `resolveObjectStandPoint(gs, roomId, obj)` (D9 priority: placed `obj.pos` →
  authored `ROOM_DECOR` placement for the defId → `resolveAutoPlacements`
  footprint → room centroid; branches authored-vs-auto exactly as
  `renderRoomFurniture` does; applies the D10 offset at every tier, centre for
  `anchorMode:'center'`).
- `src/src/srcfiles/render.js` — `FP_FURNITURE` entries are now
  `{ ...FP_FOOTPRINTS.<key>, draw: ... }` (mechanical transform, 49 headers;
  the 10 decor-catalog defIds still get their entries from the
  `DECOR_SYMBOL_ALIASES` copy loop and so carry the SAME footprints — verified
  `fpFootprint(o.defId)` === `FP_FURNITURE[o.defId].w/h` for every object in
  every room bucket, so the picture is byte-identical to before the
  extraction). `renderAutoFurniture` consumes `resolveAutoPlacements` and
  calls `FP_FURNITURE[p.defId].draw(p.x, p.y, p.w, p.h, obj?.state || {}, obj)`.
- `src/src/srcfiles/defs.design.js` — the two `pool_room` pool placements gained
  `defId: 'swimming_pool'` (D9's missing shape↔object link; additive — only
  `resolveObjectStandPoint` reads it).
- `src/src/srcfiles/actions.js` — `resolveActionAnchor` returns
  `{ roomId, objId: bestObj.id, point: resolveObjectStandPoint(gameState,
  roomId, bestObj) }` when a best object exists (replaces the old
  `bestObj?.pos`-centre branch + centroid fallback); the centroid fallback for
  no-object remains.
- `src/src/srcfiles/defs.world.js` — D17 curated table via
  `Object.assign(OBJECT_DEFS, {...})` right after OBJECT_DEFS closes:
  bed/sofa/armchair `anchorMode:'center'`; swimming_pool/dining_table/
  kitchen_table `standInset:6`; desk/study_desk/stove/sink_kitchen/toilet 4;
  treadmill/shower/tv 5.
- Harness `dev/verify/verify-present-p2.js` — **15 passed, 0 failed**.
  Checks: every auto room's drawn placement equals its D10 stand-point and is
  off the centroid (64 placements / 18 rooms, seed 20260829); pool_room's
  swimming_pool resolves to the ROOM_DECOR rect edge inset 6 (not the auto
  packer, not the centroid) and a no-defId decoration (pool_pump) falls to
  the centroid; D17 wired; packer determinism; a placed `obj.pos` wins over
  the packer; `self.cook` end-to-end anchors at the kitchen stove's drawn
  edge; `fpFootprint` alias chain + null-for-undrawn.
  RUN RECIPE (no shell in this env — run via `execute_js`'s worker, not
  `node run-all.js`): acorn-parse each source file, rewrite top-level
  `let`/`const` → `var`, stub window/document/root/rAF/URL/performance/
  timers, and `(0, eval)` ALL of `loadgame.js`'s ORDER **concatenated into
  ONE script** (skip only image.js — its unguarded
  `window.addEventListener('resize')` at load throws; nothing this phase needs
  lives in it). CRITICAL PITFALL DISCOVERED THIS SESSION: top-level `const`
  from one indirect `(0, eval)` does NOT persist to the next in this module
  worker (defs.world.js could not see `ROT` from config.js when loaded
  file-by-file) — the whole ORDER must be one concatenated eval, which is why
  the let/const→var rewrite exists. Read ORDER from loadgame.js's AST (regex
  over the source picks up apostrophes inside comments and extracts garbage).
  Always pass `required:` — the harness asserts config/defs.world/
  defs.actions/defs.design/defs.placement/sim/world/actions/npc (npc.js is
  required: `SIM_generateHouse` calls `validateCharacter`, which lives there).
- Live-verified against the real engine (all via browser_eval, house seeds
  20260829 + 20260901): `renderRoomFurniture(gs,'kitchen')`'s drawn SVG rects
  match `resolveAutoPlacements` 1:1 (10 placements, all origins present);
  `resolveObjectStandPoint` for the stove lands on the DRAWN stove rect's edge
  inset 4; `resolveActionAnchor('self.cook', npcInKitchen).point` equals it
  (a hungry NPC cooks at the drawn stove); pool_room's authored decor renders
  at the ROOM_DECOR coords and the swimmer anchors at the pool edge inset 6; a
  sleeper anchors at the bed CENTRE; `fpFootprint` === `FP_FURNITURE`
  footprints for every bucket object (picture unchanged); save/load JSON
  round-trip byte-identical and Phase 2 reads the restored state identically.
  Full floor plan rendered into the DOM via `renderFloorPlan(gs)` and
  vision-checked (rasterized the SVG to a canvas with floor-plan CSS inlined):
  furniture in most rooms, the pool basin clearly drawn in Pool Room, avatars
  inside rooms, no walls bleeding / furniture overflow / garbled blobs.
  No `perchanceErrors`/`syntaxErrors` on a fresh load. Baseline
  **3310 passed, 73 failed, 8 errored** untouched by Phase 2 (other work's
  failures).
- ALSO this session (from the shared incoming bug, verified fixed and still
  in the files): the `.conv-bubble` CSS class collision is resolved — the
  resume-conversation pill is now `class="conv-resume-bubble"` (id
  `conv-bubble` kept, render.js:83-105 unchanged — it uses the id), and the
  avatar-pill CSS block retargeted to `.conv-resume-bubble*`. The overlay
  message bubbles (`.conv-bubble` in ui.js's convAddBubble/convAddImageBubble/
  convRenderRecalled) keep their own CSS and now render in normal flow.

**Phase 2b — DONE (2026-08-29).** Reverse overture (move-to-NPC, D20)
implemented and verified — clicking an NPC's floor-plan avatar walks the
player TO the person, not just the room, including catching a moving NPC
(faster player tier, D19) or missing them at the front door (entry fallback +
feedback line). No D-number moved; the one flagged interpretation (D20
auto-talk) was decided (no auto-talk — the "Talk to {name}" chip appears
naturally). Implemented as a UI feature on the existing movement machinery:

- `src/src/srcfiles/movement.js` — NEW pure `resolveMoveToNpc(gameState,
  playerRoomId, npcId)` (movement.js:292, appended after reconcileNpcPos).
  Reads sim only, never writes (invariant 1, asserted in the harness).
  Returns `{ targetRoomId, arriveSec, feedback }` or null. Branches:
  stationary → the NPC's room; mid-walk → the walk's destination room
  (commitment anchor's roomId when it carries one — a work walk's anchor IS
  the front-door room — else the final waypoint's room); work walk the
  player cannot beat → `frontDoorAnchor(gameState).roomId` (entry) +
  `${name} was gone before you could reach them.`; work walk the player
  beats → entry, no feedback; off-map / co-located-stationary / unknown id →
  null (no-op). `arriveSec` is always the PLAYER tier (walkSeconds + findPath,
  D19). Deliberately NO auto-open of talk — D20 flagged interpretation
  resolved here.
- `src/src/srcfiles/ui.js` — `'moveToNpc'` added to `ENERGY_GATE_EXEMPT` (it IS a
  move); dispatcher avatar-click branch in `attachEventHandlers` inside the
  existing `if (!target)` block, before the room-rect check:
  `e.target.closest('[data-avatar-id]')` with id !== 'player' →
  `handleAction('moveToNpc', npcId)`; `case 'moveToNpc':` in the
  handleAction switch; NEW `async function doMoveToNpc(npcId)` placed right
  after `doMove` — null-checks via resolveMoveToNpc, `await doMove(plan.
  targetRoomId)`, then `addLogEntry('narration', plan.feedback)` if present.
- `src/src/srcfiles/render.js` — `avatarMarkerHtml`: every NPC marker gets
  `is-clickable` and a native `<title>Go to {name}</title>`; the player's
  marker gets neither (falls through to the room rect).
- `index.html` — right after `.fp-people { pointer-events: none; }`:
  `.fp-people [data-avatar-id].is-clickable { pointer-events: all; cursor:
  pointer; }` + `:hover .fp-avatar-ring` (accent stroke 2) and `:hover
  .fp-avatar-bg` (accent-dim fill), scoped to `.fp-people` so the sidebar and
  the `#floorplan-overlay` map share the affordance and the player marker
  stays inert.
- Harness `dev/verify/verify-present-p2b.js` — **17 passed, 0 failed**.
  Original 15: stationary → room + player-tier arriveSec + no feedback;
  mid-walk → destination room (not current) + player tier faster than NPC
  tier + no feedback; work-gone (1 game-sec till off-map) → entry + "gone
  before you could reach them"; work-meet (600s) → entry + no feedback;
  off-map → null; co-located stationary → null; unknown → null; invariant 1
  no-write (npc record + player + clock byte-identical). PLUS 2 NEW checks
  added THIS session (D22, requested by the plan's Phase 2b Verification):
  `settleWalks` mid-span proportional advance (`coveredUnits` == totalUnits ×
  elapsed/span, pos on the path at that point, walk kept) and past-completion
  landing (walk null, arrived=true, pos at final waypoint). RUN RECIPE: same
  as Phase 2's (see above) — one concatenated `(0,eval)` of ALL of
  loadgame.js's ORDER, let/const→var rewrite, stubs, skip image.js, always
  pass `required:` (p2b: config/defs.world/sim/world/movement/time/cognition/
  npc — npc.js because SIM_generateHouse calls validateCharacter; cognition.js
  for frontDoorAnchor). **Two loader gotchas re-learned this session, now
  locked in:** (1) the let/const→var rewrite must replace the WHOLE keyword —
  `'var' + out.slice(start + kw.length, ...)`, not `start + 2` (that yielded
  `varnst`); (2) extract ORDER from loadgame.js's AST — a `^  '...'$` regex
  matched only the 2-space-indented entries (15 of 59; sim.js was silently
  missing → "SIM_generateHouse is not defined").
- Live-verified against the real engine (all via browser_eval, sandbox game
  with 1 roommate, Megan at kitchen): NPC markers carry `is-clickable` +
  `pointer-events: all` + `cursor: pointer` + `title="Go to Megan"`; the
  player marker is `is-player`, `pointer-events: none`, no title. Real click
  on the sidebar marker (stationary) → player walked bedroom_player→kitchen.
  Mid-walk NPC (planWalk kitchen→living_room, player clicked) → player walked
  to the DESTINATION (living_room), i.e. the D20 catch-up target is the
  person's destination, not their current room. D22 end-to-end: the player
  move's `advanceAndResolveMinutes` crossed tick boundaries, `settleWalks`
  advanced the in-flight NPC walk, and it landed at the final waypoint with
  `commitment.arrived === true` (also pinned deterministically by the two new
  harness checks). "Gone" case through the `#floorplan-overlay` (work
  commitment, walk completing in 1 game-sec): player landed at `entry` and
  the log got "Megan was gone before you could reach them." right after "You
  make your way through to the Entry." Clicking the PLAYER's own marker:
  no-op — location unchanged, no log, marker not clickable. No
  `perchanceErrors`/`syntaxErrors` on the fresh loads. Baseline **3310
  passed, 73 failed, 8 errored** untouched by Phase 2b (other work's
  failures).

**Phase 3 — DONE (2026-08-29).** Conversation departure awareness +
per-turn presence FILTER + in-chat [Join] (D11/D12/D13/D14/D21)
implemented and verified live against the real engine; pure logic pinned in
`dev/verify/verify-present-p3.js` (**33 passed, 0 failed**). No new source
files were needed (everything landed in existing files — no `ORDER`/`?v`
registration for new files, but see the `?v=` cache-busting note below).
The two locked signals (walk-out pre-check, work boundary) proved to always
yield 'offflat' on a real game, so a deterministic THIRD signal, "next room"
(`nextScheduleBoundary`), was added and locked — see Audit corrections 5–9.
Real identifiers to grep for: `CONVERSATION.departureWatchWindowMinutes`
(config.js ~405), `walkDestRoom`/`isPrivacyRoom`/`nextScheduleBoundary`/
`imminentDeparture` (cognition.js 1357–1497), `reconcileScenePresence`/
`conversationDepartureLine` (llm.js 152/173, wired into `buildScenePrompt`
right after `conversationContinuityLine`), `conversationPartnerPresent`/
`departureDestPhrase`/`endDepartureConversation`/`checkConversationWalkOut`/
`convRenderJoinButton` (ui.js 6679–6760), the `doConvSend` integration
sites, the `advanceAndResolve` hook (ui.js ~156), and the `.conv-join` CSS
(index.html ~6137).

- `src/src/srcfiles/config.js` — `CONVERSATION.departureWatchWindowMinutes`
  (the window inside which a boundary is "imminent"). Deliberately NOT
  frame-gated and NOT a per-frame distance (invariant 7b).
- `src/src/srcfiles/cognition.js` — `walkDestRoom(npc)` (mid-walk → walk
  destination roomId, off-map → `frontDoorAnchor(gameState).roomId`);
  `isPrivacyRoom(roomId)` (bedroom/ensuite/bathroom); `nextScheduleBoundary(
  npc, clock)` (the third signal — see Audit correction 6);
  `imminentDeparture(gameState, npc)` → `{ reason, destType, destRoomId,
  leavesAtAbs, minutesAway }` or null. Signal precedence: 1) in-walk bound
  for a DIFFERENT room → `reason:'walk-out'`, destType shared/offflat/privacy
  from the dest room (privacy rooms read 'privacy' even mid-walk); 2) work
  walk about to complete off-map → 'offflat' at the front door (minutesAway
  from `commitment.completesAtAbs`); 3) next schedule boundary within the
  window and to a different room → the tier mapping in Audit correction 6.
  Same-room next block → null.
- `src/src/srcfiles/llm.js` — `reconcileScenePresence(currentSceneState, gs)`
  FILTERS the existing `currentSceneState`'s `present`/`active`/`ambient`
  against `conversationPartnerPresent` (never reassigns from
  `getSceneParticipants` — that returns a fresh `engagement: {}` and would
  wipe the counters `advanceEngagement`/`assessSceneIfFull` own; D14).
  `conversationDepartureLine(dep)` renders the DEPARTURE AWARENESS block
  from the STORED `convState.departure` — all four tiers (shared invite
  "join me"+dest room phrase, privacy dismissal "no invitation", off-flat
  "planning to go out shortly", and the one-beat ack "FINAL" — turn
  counting lives on `departure.beatsLeft` in ui.js, never in the prompt;
  D13) plus '' when absent. Both are called from `buildScenePrompt` after
  `conversationContinuityLine`.
- `src/src/srcfiles/ui.js` — `conversationPartnerPresent(gs, npcId)` (id +
  same-room + not-off-map); `departureDestPhrase(dep)`; `endDepartureConversation(
  gs, reason)` (npcId-only handoff "heads to the Kitchen." / gone "has
  already stepped out." / silent for the location-changed case); the
  `advanceAndResolve` hook that fires `checkConversationWalkOut` after a
  batch settle; `checkConversationWalkOut` (Audit correction 9: keyed on
  `convState?.npcId`, co-location via `conversationPartnerPresent`, no-save);
  `convRenderJoinButton` (renders the [Join] chip when the STORED departure's
  destType is 'shared' — clicking walks the player to `departure.destRoomId`
  via the Phase 2b move flow, ends the session, narrates); and the
  `doConvSend` integration: pre-check (bail + close before the LLM call),
  presence reconcile after the turn, departure staging at `context.
  conversationNpcId = myNpcId`, post-check after `removeTyping`, ack
  decrement + handoff/Join after the `if(applied)` block.
- `index.html` — `.conv-join` chip styles.
- **`?v=` cache-busting — standing rule from this session.** Editing an
  existing source file without bumping its `?v=` in index.html serves the
  STALE file in the live preview (the browser cache wins): the live page
  ran OLD llm.js/ui.js (Phase 3 functions absent) while cognition.js
  happened fresh, looking exactly like "code didn't take". Bumped:
  config.js 154→155, cognition.js 29→30, llm.js 45→46, ui.js 143→144 then
  144→145 (after the hook fix). **Every edit to an existing src file must
  bump that file's `?v=` in the SAME commit.**
- **Bug found & fixed in live verification:** the original
  `checkConversationWalkOut` guarded on `activeConversationSession(...)`,
  which silently bailed when the session had already been deleted by that
  helper's own lazy location check (partner snapped to another room
  mid-batch) — leaving `convState` set and the overlay hanging over a dead
  talk. Rewritten per Audit correction 9; live-verified both cases (A:
  location changed → silent close, no narration; B: mid-walk → hook fires,
  closes, narrates; no false positive when the partner is present).
- Harness `dev/verify/verify-present-p3.js` — **33 passed, 0 failed**.
  `required: ['config.js','defs.world.js','sim.js','commitments.js',
  'world.js','movement.js','time.js','cognition.js','npc.js','llm.js']`
  (llm.js IS in ORDER; ui.js/render.js are NOT). Helpers `__mk` (
  SIM_generateHouse(seed,4)), `__clockAt` (absoluteToClock(3*1440+m) — day 3
  = Tuesday; day 0 is a WEEKEND, the first bug cluster), `__setHome` (sets
  `n.bible.scheduleTemplate = 'day_shift'` DIRECTLY on the bible — sim reads
  `bible.scheduleTemplate` at sim.js:1239, NOT occupation.scheduleTemplate,
  the second bug cluster — plus `occupation.workMode='on_site'`),
  `__setMidwalk`/`__setWorkWalk`/`__setSameRoomWalk`, `__t_*` tests incl
  `__t_ownBedroomWalk` (walks from living_room to OWN residency.room — not
  from the bedroom). Covers: walk-out shared/offflat/bathroom-privacy/
  own-bedroom-privacy/same-room-null; work boundary on_site→offflat@entry
  minutesAway 0 / remote→null / off-block→null; signal-3 morning@535→kitchen
  shared 5min / wind_down@1255→privacy / end-of-day wrap / null cases;
  invariant-1 byte-identical (npc + player + clock untouched); reconcile
  (drops departed, KEEPS engagement object identity, input untouched, fresh
  state); conversationDepartureLine all tiers + ack + ''; save/load JSON
  round-trip identical. RUN RECIPE (no shell — execute_js worker, validated
  3×): `await import('https://esm.sh/acorn@8.11.3?bundle')`; acorn-parse
  `src/dev/verify/loadgame.js` and extract the ORDER string array from the
  AST; stub globals (`window={generatorPublicId:'test',generatorIsUnsaved:
  false}`, `document=undefined`, `root={kv:{},generateText:async()=>'{}',
  generateImage:async()=>({})}`, `requestAnimationFrame=()=>0`,
  `setTimeout=()=>0`, `clearTimeout=()=>{}`, `performance={now:()=>0}`,
  `innerWidth=1280`, `innerHeight=800`, `URL`/`navigator` if missing); per
  ORDER file acorn-parse + rewrite ONLY top-level let/const
  VariableDeclarations→'var' (indirect eval drops let/const bindings) then
  `(0,eval)(rewritten)`, try/catch skip-on-error (only image.js skips —
  unguarded top-level window.addEventListener), THROW if a required file
  fails; `g.api=(code)=>(0,eval)(code)`; shim require ('./loadgame.js'→
  `{loadEngine:(opts)=>({ctx:g,loaded,api:g.api})}`, 'path'→join);
  `process={exit:c=>{g.__exitCode=c}}`; eval harness source, return
  fails/summary/exitCode. Inline `api()` snippets must define `__t_*`
  helper FUNCTIONS and end with a bare call — a top-level `return` inside an
  eval'd snippet throws "Illegal return statement".
- Live-verified against the real engine (sandbox game via
  `startSoloGame(null)`, one NPC promoted to resident + day_shift + on_site
  + co-located): all 8 Phase 3 globals present post-?v-fix; `imminentDeparture`
  all three signals on a real clock (walk-out shared/kitchen,
  privacy/bedroom_1, offflat/entry, null same-room; work boundary offflat@
  entry minutesAway 0; signal-3 morning@475→shared/kitchen 5min,
  wind_down@1255→privacy/bedroom_1, evening@1075→shared/dining, deep-sleep +
  far-from-boundary + weekend@480 → null); `conversationPartnerPresent`
  idle true / mid-walk false; `reconcileScenePresence` filters departed,
  keeps engagement identity; `conversationDepartureLine`/`buildScenePrompt`
  all 4 tiers + none + grammar ("planning to go out shortly", privacy "no
  invitation", shared "join me"+"Kitchen", ack FINAL); `doTalk` opens
  overlay + convState; `convRenderJoinButton` renders "Join Del to Kitchen"
  + click walks player to kitchen, ends session, narrates;
  `endDepartureConversation` handoff/gone/silent all verified;
  `checkConversationWalkOut` gone branch with a spoken session; `doConvSend`
  pre-check bail (no ghost reply, session closed); awareness staging + Join
  render after a reply (callLLM stubbed). TEST-SETUP GOTCHA: `roomCentre()`
  returns an ARRAY `[x,y]` but roomsContainingPoint/planWalk anchors need
  `{x,y}` objects — wrap `const pt=r=>{const c=roomCentre(r);return{x:c[0],
  y:c[1]}}`. Also `TIME_DILATION.freezeWhenHidden=false` while testing (the
  editor iframe is document.hidden, which froze the clock otherwise).
- Baseline **3310 passed, 73 failed, 8 errored** untouched by Phase 3
  (other work's failures). No `perchanceErrors`/`syntaxErrors` on any fresh
  load. **Session end cleanup:** the live test game took over the kv live
  folders (meta/player/npcs/world/objects) and the 5-slot autosave ring.
  Restored from the user's most recent real save via the game's own
  `restoreSave(getSaveRecord('exit'))` (Parker, run_odonntew, day 2) and
  deleted the 5 test autosaves with `deleteSaveSlot('auto_0'..'auto_4')`;
  kv.saves verified back to exit + manual_0/1/2 only, live folders and
  saveIndex pointing at the restored game, fresh reload clean.

**Earlier diagnosis (2026-08-28, no code written — still drives Phases
1–3):** four issues investigated one by one, root causes confirmed by
reading the code (see Evidence for the full chain with file:line):

- **A — avatars snap when the DOM rebuilds.** Every player action runs
  `advanceAndResolveMinutes` → `resolveBatch` → `resolveTick`, which calls
  `settleWalks` (sim.js:1704) — snapping every in-flight walk to its end —
  and the apply loop's `reconcileNpcPos` (sim.js:2588) — teleporting every
  non-walk mover (wanderers, visitors, sleepers, off-map returns) to their
  room centroid. Then `render()` → `renderFloorPlanStatic` rebuilds the
  whole SVG `innerHTML`, recreating every marker at the freshly-snapped
  position. There is no CSS transition on `.fp-avatar` and the marker is an
  SVG `<g transform>`, so nothing interpolates. The player's own marker
  always teleports too.
- **B — even "smooth" walks are near-invisible at idle.** `advanceFrameWalks`
  + `renderFloorPlanLive` genuinely run per rAF. The dilation scale is a
  MULTIPLIER OVER REAL TIME, so at idle 20× one real second is 20 game-sec
  and one 60fps rAF is 1/3 game-sec: a 3–6 game-sec neighbour walk is
  ~9–18 frames spread over 0.15–0.3 real seconds, and a 15–20 game-sec
  cross-flat walk takes 0.75–1.0 real seconds. Frames exist — there are just
  too few of them for the eye to read a walk. At conversation 1× the same
  walks take 3–6 real seconds and ARE visible — which is exactly the
  difference the user feels. Presentation must be decoupled from sim time.
- **C — NPCs don't stand on the thing they're using.** The floor plan draws
  furniture with `renderAutoFurniture` (deterministic perimeter packing,
  computed at render time, no stored coords; `ROOM_DECOR` authored only for
  pool_room), while `resolveActionAnchor` picks the stand-point as placed
  `obj.pos` centre (only player-placed decor has pos) else room centroid.
  The drawn pool and the anchor's stand-point disagree by construction, and
  even the authored pool isn't read by the anchor.
- **D — conversations don't know who's leaving.** During a live conversation
  (clock 1×) sim checkpoints fire every 30 real-sec and an NPC can re-decide
  and walk out, but `currentSceneState` is recomputed only at scene-entry
  points (never during a conversation), so `CHARACTERS PRESENT` in the scene
  prompt keeps listing the departed NPC as a speaker; `doConvSend` snapshots
  the NPC id and never re-checks co-location before/after the LLM call, so
  the model replies for a person who isn't there. Nothing in the prompt says
  an NPC is about to leave, even though it's computable from
  `commitment.completesAtAbs`/`nextDecisionAbs`/work boundaries.

**Blockers / flagged deviations:** None outstanding. Phases 0–3 are
complete. Phase 3's deviations from the as-locked design are all recorded
in Audit corrections 5–9 (additive `destRoomId`; the third "next room"
signal; no `meal` block; checkpoint cadence correction; stored-probe +
overlay-keyed `checkConversationWalkOut`). The only remaining flagged item
is the player-speed multiplier (D19: ~3× the NPC, ~3 game-sec/room),
adopted unchanged in Phase 2b — tunable, not blocking. Phase 4 is next.

**Environment note (2026-08-28):** the `dev/verify` harness had been broken
in the working tree — `loadgame.js` and ~57 harnesses pointed at `srcfiles/`
instead of `src/src/srcfiles/`, and five used a path one level above the repo
root — so every harness either threw or, when it did not pass `required:`,
silently loaded ZERO files and reported green against an empty vm context.
Repaired 2026-08-28; `run-all.js` executes end to end again. **If a phase's
"pure harness passed" claim ever looks too easy, check `loaded.length`
first.** Also on 2026-08-28 the entry document was renamed `main.html` →
`index.html` and every reference normalised, so citations in this document
that say `index.html` are now correct as written.

---

## The thesis

The sim already knows where every NPC is, down to the pixel, and recomputes
it every animation frame. The player cannot see any of it. Every mechanism
that moves an avatar is either a sub-second blink or a hard teleport, and
the one place the game tells the story of who-is-where — the floor plan —
throws away the positions it just computed and rebuilds from scratch on
every action. And the conversation layer, which runs at real time and could
notice people leaving, is the only layer that never looks at the positions
at all.

The fix is not more simulation. It is a presentation layer that (1) animates
the gap between what the sim decided and what the player sees, (2) makes the
drawer of furniture and the walker-to-furniture read the same coordinates,
and (3) lets the real-time conversation layer see the departures the sim has
already decided.

### What this plan is *not*
- **Not a pathfinding change.** `findPath`/`planWalk` stay; this plan
  re-presents what they already compute.
- **Not a time-dilation rebalance** — but it IS now a movement-cost
  rebalance. Q1's answer asked for the base walking speed to slow so each
  room-to-room transition is ≈ 10 game-sec and a cross-flat walk ≈ 1
  game-min at 1:1 (Phase 0, D15). `TIME_DILATION` itself is untouched; a
  walk's mechanical duration stays a sim fact (`completesAtAbs`), and the
  presentation layer still decides what the player *sees* — but
  `walkSeconds`/`planWalk`'s time model changes, and `settleWalks` gains a
  partial advance (D22). (Originally this plan was explicitly NOT that; the
  user overrode it.) It is a smaller change than it reads: measured, the new
  model is a near-uniform 28 → ~11.5 units/game-sec slowdown, and the route
  is still pure geometry.
- **Not the Home Design Studio.** We read `ROOM_DECOR` where it exists; we
  do not author more rooms. Phase 2 adds one additive FIELD to its existing
  `pool_room` entries (`defId`, D9) so the anchor can find them — that is a
  link, not a design.
- **Not a rewrite of the D12 static/live render split.** The live pass is
  extended, the two loops are not merged.
- **Not a conversation-system rewrite.** We add a presence recheck and a
  departure notice — not a new dialogue engine.

## Evidence

Measured against the code as it stands (2026-08-28):

| Claim | Where it holds |
|---|---|
| Player action ⇒ in-flight walks snap to their end | `advanceAndResolveMinutes` (ui.js) → `resolveBatch` → `resolveTick` calls `settleWalks` (sim.js:1704); `settleWalks` snaps `pos` to the final waypoint (movement.js:188) |
| Player action ⇒ non-walk movers teleport to room centroid | apply loop calls `reconcileNpcPos` (sim.js:2588); it sets `pos = roomCentre(loc)` for any mover without a walk whose pos doesn't already match its location (movement.js:215) |
| Every player action rebuilds the whole floor-plan SVG | `renderFloorPlan` → `renderFloorPlanStatic` writes `innerHTML` and recreates every marker (render.js:272,285,468); markers are created with no meaningful position and placed by the live pass (render.js:795) |
| No transition smooths a marker | No `.fp-avatar*` rule declares a `transition` (index.html:803-836); the marker is an SVG `<g transform="translate(...)">` written via `setAttribute` (render.js:883). NOTE: a CSS `transition: transform` on an SVG `<g>` DOES work in current browsers — the reason this plan animates in JS is not that CSS can't, it is that the presentation layer needs to control the PATH (through door midpoints), which a transition would cut straight across. Phase 1 must therefore NOT add one: it would compose with the per-frame writes and produce lag |
| The avatar layer is click-through | `.fp-people { pointer-events: none; }` (index.html:802). Combined with the room handler testing `e.target.tagName === 'rect'` (ui.js:8887), a click on an avatar currently matches no branch at all — which is why D20 can claim the gesture without displacing anything |
| The player's marker always teleports | `doMove` assigns `player.location` directly (ui.js:7266+); `floorPlanAvatarPlacement` renders `isPlayer` at room centroid always (render.js:850) |
| Live walks complete in <1 real second at idle | `TIME_DILATION.scales.idle = 20` (config.js:3440) is a MULTIPLIER OVER REAL TIME, not a per-frame quantum: `clockFrame` computes `gameMinutes = (deltaMs/1000) × (scale/60)`, so one real SECOND is 20 game-sec and one rAF at 60fps is **1/3 game-sec** (time.js:183). `walkSeconds` puts a neighbour step at 3–6 game-sec and a cross-flat walk at 15–20 (config.js:348/`WALK`), so a neighbour hop is ~9–18 frames in 0.15–0.3 real-sec and a cross-flat walk 0.75–1.0 real-sec — near-invisible, but never "inside a single frame". `advanceFrameWalks` advances `coveredUnits` by `WALK.unitsPerSecond × gameSeconds` per frame (movement.js:157) |
| Per-frame sim motion is FRAME-RATE and DILATION dependent | units/frame = `speed × (deltaMs/1000) × scale`. At 60fps and today's `unitsPerSecond: 28` that is 9.3 units/frame at idle 20×, 0.47 at conversation 1×, 28 at peeking 60× — and HALF those values on a 144Hz display. Any presentation rule that thresholds a RAW per-frame delta is therefore frame-rate dependent by construction (this is what D4 originally got wrong; see D4/D5) |
| Walk integrator + per-frame repaint DO run | `clockFrame` calls `advanceFrameWalks` then `renderFloorPlanLive` every rAF (time.js:210-211); live loop mutates only transform/class (render.js:873) |
| Furniture is drawn by a render-time packer, anchors by a separate fallback | `renderRoomFurniture` → `renderAuthoredDecor` else `renderAutoFurniture` (render.js:720-726, perimeter packing, no stored coords); `resolveActionAnchor` uses placed `obj.pos` centre else `roomCentre` (actions.js:483). `obj.pos` is written only by `placeDecorItem` (computer.js:789). Authored `ROOM_DECOR` (defs.design.js:223) is not read by the anchor at all |
| `currentSceneState` is never reconciled during a live conversation | `getSceneParticipants` is called only at scene-entry points (ui.js:846, 2654, 5718, 6540, 7306); the checkpoint path (`runSimCheckpoint` → `advanceAndResolve`) never touches it (time.js:322+) |
| The scene prompt keeps listing a departed NPC as a speaker | `buildScenePrompt`'s `CHARACTERS PRESENT` is `activeNpcs`/`ambientNpcs` from the (stale) context (llm.js:175-191) |
| `doConvSend` never re-checks co-location | it snapshots `myNpcId` and reads only that for the whole turn (ui.js:6659-6710); the session is deleted by `activeConversationSession` only when something calls it (render.js:84 renders the avatar bubble) |
| An imminent departure is computable but never surfaced | `npc.commitment.completesAtAbs`, `npc.nextDecisionAbs`, work-block boundaries all exist (cognition.js) and are absent from the scene prompt |

## Locked decisions

### Presentation
- **D1 — Presentation is decoupled from sim time.** `floorPlanAvatarPlacement`
  keeps computing the SIM position; a new presentation layer owns the
  RENDERED position and may lag behind it. The presentation layer never
  writes `npc.pos`/`npc.location`/`npc.walk`/`commitment.arrived` — those
  keep exactly the writers they have today (D8/D9/C6 determinism intact).
- **D2 — Every visible avatar gets this, including the player's own marker.**
  The player's `doMove` teleport is presented as a walk along the route
  `resolveWalk` already computed, not a snap.
- **D3 — The presentation layer is render-layer module state keyed by avatar
  id.** It survives `renderFloorPlanStatic`'s `innerHTML` rebuilds: a marker
  recreated at `translate(0,0)` is repositioned by the live pass from the
  stored rendered position in the same frame, so a DOM rebuild causes no
  jump. This is the whole point.
- **D4 — Track vs catch-up, classified by CAUSE not by distance
  (CORRECTED 2026-08-28).** An avatar whose sim position is being integrated
  by a live walk — i.e. `npc.walk` is a live record this frame — TRACKS
  directly: `advanceFrameWalks` already interpolates it per rAF, and the
  presentation layer just follows. Every other position change is a
  CATCH-UP: the walk record vanished between frames (`settleWalks` snapped
  it, `releaseCommitment`/`returnHome` cleared it), or the position moved
  with no walk record at all (`reconcileNpcPos` teleport, `work_from_home`
  placement, off-map return, the player's `doMove`). On a catch-up the
  marker animates from its last RENDERED position to the sim position along
  a re-planned path — start room → door midpoints
  (`sharedWallSegment`/`findPath`, the same machinery `planWalk` uses) →
  target — over a presentation duration.

  **Why not a distance threshold.** The original D4 thresholded the raw
  per-frame sim delta at 3 units. That is unimplementable: units/frame =
  `speed × (deltaMs/1000) × scale`, so a perfectly ordinary live walk moves
  ~3.8 units/frame at idle 20× / 60fps under Phase 0's speeds (measured:
  ~11.5 units per game-second across all 342 room pairs), 4.8 at working
  25×, and 11.5 at peeking 60× — every one of them ≥ 3, so every frame of
  every live walk would be misclassified as a jump and would restart a
  0.9–2.4s catch-up, at idle, which is the DEFAULT state and the exact one
  the user is complaining about. It is also frame-rate dependent: the same
  walk is 1.6 units/frame on a 144Hz display and would classify the other
  way. Cause is exact, free to read, and frame-rate invariant. `walk`-record
  presence is the signal; there is no constant to tune.
- **D5 — Presentation durations have a floor and a cap, applied to CATCH-UP
  only.** Live walks (D4: the avatar holds a `walk` record) track directly
  at mechanical speed — at 1:1 an NPC visibly strolls the full 10s-per-room
  journey, which is precisely the user's Q1 ask. The floor/cap shape only
  catch-up after a snap (settleWalks, reconcileNpcPos, player move, a fast-
  dilation walk that finished inside one frame): the replay runs
  `clamp(mechanicalRealSec, floorSec, capSec)` real seconds, where
  mechanicalRealSec = the walk's game-seconds ÷ the dilation scale — so a
  10s hop at idle 20× (0.5 real-sec) lifts to the 0.9s floor, and a 60s
  cross-flat at peeking 60× (1 real-sec) still reads as a walk, never a
  teleport. Locked: `PRESENT = { floorSec: 0.9, capSec: 2.4,
  shortHopSec: 0.6, teleportAfterGameMinutes: 20 }`. One budget at every
  dilation — working 25× and peeking 60× get the same treatment (legibility
  everywhere). `trackThreshold` and `maxRoomsForWalk` are GONE — see D4 and
  D6 for what replaced them and why.
- **D6 — The fade-teleport is gated on ELAPSED SIM TIME, not on room count
  (CORRECTED 2026-08-28).** A catch-up whose gap spans more than
  `teleportAfterGameMinutes` of game-time (sleep 8 hours, tab-hidden
  catch-up, a long `wait`) presents as a teleport with a brief fade/scale
  rather than a walk replay: nobody believes a single stroll covered eight
  hours. Everything shorter replays as a walk however many rooms it crosses.

  **Why not a room-count gate.** The original D6 fade-teleported any move
  spanning more than 3 room-changes. Measured against the real floor plan:
  of the 342 ordered room pairs, **170 (49.7%) are 4+ hops** and the flat's
  true diameter is 7 hops (`bedroom_3 → gym`). So an ordinary cross-flat
  `settleWalks` snap — Issue A itself, the thing this plan exists to fix —
  would have presented as a teleport. The gap that actually justifies a
  teleport is a TIME gap, and the presentation layer can read it directly
  (the clock delta since the avatar's last rendered frame).
- **D7 — Reduced motion.** `prefers-reduced-motion` /
  `:root[data-reduce-motion]` disables catch-up animation (teleport +
  opacity fade only), matching the `.scene-cutout` precedent (index.html:968-974).

### Anchors
- **D8 — ONE shared placement source, and the footprint table moves with
  it.** The perimeter auto-arranger's packing is extracted to a pure
  `resolveAutoPlacements(roomId, objects)` consumed by BOTH
  `renderAutoFurniture` and the anchor resolver — the furniture drawn and
  the furniture walked to are the same coordinates by construction.
  **`FP_FURNITURE` moves out of `render.js` with it** (into the same new
  `defs.placement.js`): it is the `{w, h}` footprint table the packer reads,
  and `render.js` is deliberately absent from `loadgame.js`'s `ORDER` ("stops
  before render/ui"), so a `resolveAutoPlacements` that still reached into
  `render.js` could not be verified by a Node harness at all. `render.js`
  keeps the `draw()` half; the new file owns the footprints and the packing.
- **D9 — Stand-point priority, and `ROOM_DECOR` gains a `defId`
  (CORRECTED 2026-08-28).** placed `obj.pos` (player-placed decor) →
  authored `ROOM_DECOR` placement for the defId → `resolveAutoPlacements`
  footprint for the defId → room centroid.

  **Tier 2 does not exist yet and Phase 2 must author it.** `ROOM_DECOR`
  entries are `{ shape, x, y, w, h, rot, requires }` keyed by `DESIGN_SHAPES`
  names (`pool`, `lounger`, `bench`, `plant_large`); `OBJECT_DEFS` is keyed
  by defIds (`swimming_pool`, `sink_kitchen`, `coffee_table_lr`). The two
  namespaces OVERLAP but are not the same, and nothing maps between them —
  `DECOR_CATALOG_DEFS[defId].shape` is the player-purchase path only and
  never covers world furniture. So the pool the floor plan draws (`shape:
  'pool'`) cannot be matched to the pool an NPC swims in (`defId:
  'swimming_pool'`). **Phase 2 adds an optional `defId` to each `ROOM_DECOR`
  placement** (`defs.design.js`), which is additive, ignored by
  `renderDesignShape`/`decorVisible`, and read only by the anchor resolver.
  A placement with no `defId` is decoration (a plant, a rug) and simply
  never wins tier 2. Only then does the authored pool room gain correct
  anchors.

  **Authored rooms skip tier 3 entirely.** `renderRoomFurniture` returns
  `renderAuthoredDecor` for the WHOLE room when `ROOM_DECOR[roomId]` exists,
  so in `pool_room` nothing `resolveAutoPlacements` produces is drawn at
  all. The anchor resolver must branch the same way the renderer does — an
  authored room resolves against `ROOM_DECOR`, an auto room against
  `resolveAutoPlacements` — or invariant 2 is asserted against geometry the
  player cannot see.
- **D10 — Interaction offset.** Stand-points sit at the object's edge
  nearest the room's centroid, offset outward by an object-specific
  `standInset`, so an NPC *uses* the pool/couch rather than standing on its
  centre. `OBJECT_DEFS` gains `standInset` + `anchorMode` (`'edge'` default;
  `'center'` for lie-on/sit-in surfaces such as the bed/sofa where standing
  on the surface is the point). Per-object values are **a design-session
  item (Q4).**

### Conversation
- **D11 — Presence is rechecked every conversation turn.** `doConvSend`
  re-derives co-location of the partner before the LLM call AND after it; if
  the partner is gone or mid-walk-out, the turn does not produce a ghost
  reply — the session ends (pop time context, close the overlay if open,
  narrate the departure beat).
- **D12 — The partner is made AWARE of its own impending move.** When the
  session partner has an imminent departure (work boundary / commitment
  completion / next room, within the watch window), the scene prompt injects
  a DEPARTURE AWARENESS block: the model is told it is planning to go do X,
  must ALERT the player to that, and find a naturally stopping point in the
  conversation. The phrasing is destination-typed (Q3 answer):
  - room → room in shared space (kitchen → living): inviting — "I'm heading
    to the kitchen to make tea — join me if you like", implying the
    conversation could continue there;
  - privacy retreat (bathroom, their own bedroom): firm-but-warm — "I need a
    moment", "I'm going to go relax in my room" — signals don't-follow;
  - leaving the flat / for work (off-map): absolute farewell — "I've got to
    head to work" + a proper goodbye.
  This is not a conversation-interruption tool: it is the NPC noticing its
  own plan and living it out, so it feels more autonomous and alive.
- **D13 — The end is a handoff, never a cutoff.** The awareness line (D12)
  is the LAST NPC line, and the NPC then waits for ONE player beat — the
  player can reply (a goodbye, a "see you there", a "don't let me keep
  you") and the model acknowledges it naturally before leaving. The
  mechanical session end fires at the walk start: overlay closes, context
  pops, a short narration ("X heads to the kitchen — 'join me if you
  like'"). Crucially the NPC is NOT suddenly gone — the walk-out is visible
  on the floor plan (Phases 0/1) with its dotted path (D18), so the player
  watches them cross the room and out, closing the loop the conversation
  opened. If the walk starts with no chance for a goodbye (timing), the
  narration carries it instead.
- **D14 — `currentSceneState`'s active set is FILTERED at the start of
  every conversation turn — never recomputed.** So `CHARACTERS PRESENT` is
  true after a checkpoint moves someone out, not only at scene-entry.

  **It must be a filter.** `getSceneParticipants` (sim.js) returns
  `engagement: {}` — a fresh, empty object every call. Reassigning
  `currentSceneState = getSceneParticipants(...)` each turn would silently
  wipe the engagement counters `advanceEngagement` builds and
  `assessSceneIfFull` reads, plus every ambient→active promotion the scene
  has earned; the Assessor would then judge windows that always look empty.
  The reconciliation removes ids that are no longer co-located from
  `present`/`active`/`ambient` and leaves `engagement` untouched.
- **D15 — Walk time is per-room and per-tier (Q1 + follow-up).** The NPC
  base walking speed slows so each room-to-room transition is ≈ 10 game-sec
  and Bedroom 1 → Bedroom 3 ≈ 1 game-min at 1:1. The PLAYER moves on a
  separate, faster tier so catching up to a moving NPC is genuinely possible
  (D19). Implemented as `WALK.secondsPerRoom = { npc: 10, player: 3 }` and

  ```
  seconds = max(minSeconds,
                secondsPerRoom[tier] × roomTransitions
                + inRoomUnits / unitsPerSecond)
  ```

  where `inRoomUnits` is the length of the path's first and last legs (start
  point → first doorway, last doorway → stand-point). The per-frame
  integrator advances by the walk's own `speed` (`totalUnits / seconds`) so
  position interpolation still lands at `completesAtAbs`.

  **The in-room distance term is not optional (CORRECTED 2026-08-28).** A
  pure `secondsPerRoom × roomTransitions` collapses every SAME-ROOM walk to
  `minSeconds` = 1 game-second, because a same-room route has zero
  transitions. That is the most common walk in the game, not an edge case:
  `resolveActionAnchor` deliberately PREFERS the actor's own room when it is
  one of the candidates ("that is where the action is already happening"),
  so the hungry NPC standing in the kitchen walking to the stove is the
  normal path. The living room's diagonal is 329 units; crossing it in one
  game-second is ~29× walking pace — a blur at every dilation, 1:1
  included. The distance term keeps in-room motion at the same ~11.5
  units/game-sec the per-room tiers produce between rooms, so the two
  regimes agree instead of contradicting each other.

  This is a deliberate, user-driven deviation from the movement plan's "time
  derived from distance" (D9 there) — but a much smaller one than it reads.
  Measured across all 342 ordered room pairs, the per-room model's effective
  speed is 11.8 / 11.2 / 11.5 / 11.5 / 11.6 / 11.6 / 10.8 units per
  game-second for 1–7 hops: the flat is regular enough that "authored per
  hop" and "derived from distance" very nearly coincide, and the change is
  in practice a near-uniform 28 → ~11.5 slowdown. The ROUTE, the door
  midpoints and the interpolation still come from geometry; only the time
  per hop is authored.

  **Tier threading (CORRECTED 2026-08-28).** Both walk-time computations —
  `planWalk` (movement.js, NPC tier) and `walkSeconds` (world.js) — move
  together and take the tier, so the clock, the blocker math and the
  player's own move cost can never disagree. But `walkSeconds` is NOT called
  by `doMove`: its only caller is `resolveWalk` (world.js), whose only
  caller is `doMove` (ui.js:7268). So `resolveWalk` gains the tier parameter
  and passes it down; `ui.js:7376` merely CONSUMES `walk.seconds` and needs
  no edit at all.
- **D16 — The player's own marker gets full presentation on every move
  (Q2).** Same as NPCs: route-walk, floor/cap catch-up, and no dotted path
  line (D18 — the player chooses their path). No short-hop special case for
  rapid clicking — the floor+caps keep it deliberate.
- **D17 — Curated anchor table now, `'edge'` default (Q4).** A small
  hand-authored table (~10 objects: pool, sofa, bed, counter, dining table,
  desk, treadmill, shower, toilet, tv) sets `standInset`/`anchorMode`;
  everything else defaults to `'edge'`. A full `OBJECT_DEFS` sweep is a
  different, HDS-adjacent job.
- **D18 — The path is illustrated on the floor plan — for NPCs only (Q5 +
  follow-up).** When an NPC has a committed-or-active walk, a dotted line is
  drawn along the exact path the presentation layer animates (live walks:
  `planWalk`'s waypoints; catch-up: the re-planned path) — the NPC literally
  follows the dotted line to its destination. Two states: **about-to-take**
  (walk committed, not yet moving — the line fades in ahead of them, e.g.
  while the D12 goodbye plays) and **actively-taking** (walk in progress —
  line persists, avatar advances along it, fades out on arrival). Render-
  layer only; never writes sim state. The player's own marker gets NO line
  (the player chooses their path; it needs no demarcation).
- **D19 — The player walks on a faster tier than the NPCs (Q1 follow-up).**
  `WALK.secondsPerRoom.player ≈ 3` game-sec per hop (roughly 3× the NPC's
  10) so catching up to a moving NPC is the norm, not a miracle. Tunable;
  the flagged open item is the exact multiplier. At 1:1 the player's own
  moves read as a quick, deliberate stroll (~3s/hop, presented at mechanical
  speed per D16). Because player moves advance the clock only ~3s/room, a
  cross-flat player move now costs ~20 game-sec — the "60s clock advance"
  worry from the single-tier design disappears with the split.
- **D20 — Reverse overture: click an NPC's avatar to travel TO THEM.** The
  floor plan's NPC markers become clickable; instead of clicking a room you
  click the NPC and the player walks to the person, not the room. If the NPC
  is stationary, the player walks to their stand-point. If the NPC is
  mid-walk, the player targets their DESTINATION room on the faster tier, so
  the player arrives alongside or just after them — a visible catch-up
  (Phase 1 presents both walks). **This requires D22's partial batch
  advance**: without it the NPC's `coveredUnits` does not move at all while
  the player's own move resolves, and there is nothing to catch up TO. If
  the NPC is off-map-bound (work walk to
  the front door) and the player's arrival time is after the NPC's off-map
  time, the player travels to the entry room (`frontDoorAnchor`,
  cognition.js:865) and gets the feedback "[name] was gone before you could
  reach them." An NPC already off-map or already co-located is a no-op. On
  arrival at a stationary NPC, the standard talk affordance is offered (the
  natural completion of the "reverse overture" — flagged interpretation).
  UI/render only: an avatar-click branch in the global dispatcher
  (ui.js:8887) plus `handleAction('moveToNpc', …)`; the destination is
  always read from sim state, never guessed (invariant 9).
- **D21 — A "join me" confirmation button lives IN the chat.** When the D12
  awareness block produces a shared-space invite ("join me if you like"),
  the chat renders a [Join] button alongside the line. Clicking Join queues
  the player's move to the NPC's destination (D20 machinery, faster tier) so
  the player follows and arrives alongside — a seamless transition. The
  session closes with the goodbye already said, narrated ("You head to the
  kitchen with Sam."), and both are co-located at the destination where talk
  is available again (flagged interpretation). Not responding / clicking
  away = the NPC leaves alone (D13). Privacy and off-flat phrasing tiers
  generate no button.

### Added by the 2026-08-28 code audit
- **D22 — The batch regime gains a PARTIAL walk advance; the walk record
  gains `startedAtAbs`.** `advanceFrameWalks` is currently the only thing
  that moves `coveredUnits`; `settleWalks` snaps walks whose
  `completesAtAbs` has passed and does nothing whatsoever to an in-flight
  one. So any discrete clock advance — a player move's
  `advanceAndResolveMinutes`, a `wait`, an action batch — freezes every
  in-flight NPC mid-stride for the whole span while `completesAtAbs` keeps
  ticking, and then teleports them when it elapses. Phase 0 makes that
  window 4–12× wider (walks go from 3–6 game-sec to 10 per hop, up to 70
  cross-flat), turning a rounding error into a routine visual artifact —
  and it is why D20's "watch the player catch up alongside a moving NPC"
  cannot work as written today.

  **Fix:** `planWalk` stamps `startedAtAbs` beside `completesAtAbs` (it
  already calls `clockToAbsolute`), and `settleWalks` — for a walk that has
  NOT completed — advances `coveredUnits` to
  `totalUnits × (nowAbs − startedAtAbs) / (completesAtAbs − startedAtAbs)`
  and repositions `pos` via `pointAlongPath`, exactly where the frame path
  would have put it. Still pure, still a function of the clock and the walk
  record only, so C6 determinism is untouched: the batch regime now
  reproduces the live regime's INTERMEDIATE positions as well as its
  landings. `startedAtAbs` is an additive field on a persisted record —
  a save written before this phase round-trips with it absent, and a walk
  missing it falls back to today's snap-only behaviour.

- **D23 — The presentation layer needs a frame source that survives a
  paused clock.** `renderFloorPlanLive` is called from exactly one place:
  inside `clockFrame`'s `if (scale > 0 && cappedDeltaMs > 0)` block. So no
  frames are delivered while the clock is paused — and the clock is paused
  by the action outcome window for its whole lifetime
  (`actionwindow.js` pauses on open, resumes on dismiss), by the pause menu,
  and by `advanceAndResolve` itself; `scale` is 0 during sleep. A catch-up
  kicked off by a player action would therefore paint one frame, freeze, and
  then jump to its end when the clock resumed with a stale `t0` — which is
  precisely the snap this plan exists to remove, on the single most common
  path in the game. Phase 1 gives the presentation layer its OWN rAF loop
  (independent of `clockFrame`, since it animates REAL time and touches no
  sim state), or, equivalently, makes the catch-up clock pause-aware by
  advancing `t0` while frames are not being delivered. The former is
  simpler and is what D1's "decoupled from sim time" already implies.

## Data model

### Walk-time model (Phase 0) — D15/D19
```js
// config.js — WALK is now per-room, per-tier; TIME_DILATION untouched.
const WALK = {
  secondsPerRoom: { npc: 10, player: 3 },  // player ~3× faster (D19)
  minSeconds: 1,        // the click floor — a move always costs SOMETHING
  arriveEpsilon: 2,
  // KEPT, not retired: the in-room leg is still distance-derived, so a
  // same-room walk to a stand-point is a walk and not a 1-second blur
  // (D15). Retuned 28 → 11.5 so in-room and cross-room speed agree.
  unitsPerSecond: 11.5,
  // secondsPerThreshold IS retired — the per-room tier absorbs the
  // per-doorway beat it used to add.
};

// movement.js — planWalk (NPC tier):
//   inRoomUnits = |startPoint → first doorway| + |last doorway → standPoint|
//                 (the whole path when the route never leaves the room)
//   seconds = max(minSeconds,
//                 secondsPerRoom.npc × (route.length - 1)
//                 + inRoomUnits / unitsPerSecond)
//   speed   = totalUnits / seconds
//   startedAtAbs = clockToAbsolute(clock)          // D22
//   advanceFrameWalks advances by w.speed (not the constant), so coveredUnits
//   lands on totalUnits exactly at completesAtAbs.
// world.js — walkSeconds(route, tier) returns the same seconds for the given
//   tier (one source of truth). resolveWalk(gs, from, to, tier) threads it;
//   doMove is resolveWalk's only caller and passes tier='player'. doMove
//   itself never calls walkSeconds — it consumes walk.seconds (ui.js:7376).
```

### Walk record (Phase 0) — D22
```js
// movement.js — planWalk's return, + one additive field:
{ path, totalUnits, coveredUnits, speed, startedAtAbs, completesAtAbs }
//   startedAtAbs lets settleWalks advance an INCOMPLETE walk proportionally
//   instead of leaving it frozen for the length of a batch. Persisted with
//   the rest of npc.walk; absent on a pre-Phase-0 save, in which case
//   settleWalks falls back to snap-on-completion (today's behaviour).
```

### Presentation state (Phase 1) — render-layer module memory, never persisted
```js
// config.js
const PRESENT = {
  floorSec: 0.9,         // catch-up floor (real sec); live walks are untouched
  capSec: 2.4,           // catch-up cap
  shortHopSec: 0.6,      // catch-up for a jump with no door crossing
  teleportAfterGameMinutes: 20,  // gap bigger than this → fade-teleport (D6)
  // NO trackThreshold: track-vs-catch-up is decided by CAUSE (does the
  // avatar hold a live `walk` record this frame?), never by measuring a
  // per-frame delta — that quantity is frame-rate and dilation dependent
  // and cannot be thresholded. See D4.
  // NO maxRoomsForWalk: the fade-teleport gate is the TIME gap above, not
  // a hop count — half the flat's room pairs are 4+ hops. See D6.
};
// render-layer module state, keyed by avatar id, survives static rebuilds (D3):
let presentAvatars = {}; // { [avatarId]: { x, y, path, t0, dur, kind, target,
                         //   hadWalk, lastSimAbs,          // D4/D6 inputs
                         //   routePath, pathState } }      // D18 fields
//   hadWalk     — did this avatar hold a walk record on the previous frame?
//                 walk→no-walk is the catch-up trigger (D4).
//   lastSimAbs  — clockToAbsolute at the last presented frame; now − this is
//                 the gap D6 tests against teleportAfterGameMinutes.
```

### Path illustration (Phase 1b) — D18
```js
// presentAvatars[id].routePath = [{x,y}, …]  // the exact line the marker walks
// presentAvatars[id].pathState  = 'off' | 'about' | 'active'
//   'about':  walk committed, not moving — dashed line fades in (D12 beat)
//   'active': walk in progress — line persists, avatar advances along it
//   arrival: line fades out
// Drawn in the floor-plan overlay as a dashed SVG <path> (stroke-dasharray),
// per-avatar accent colour, matching the route the marker animates along.
```

### Shared placement (Phase 2)
```js
// NEW FILE defs.placement.js — registered in BOTH index.html's load list
// (with ?v=1) and loadgame.js's ORDER, same commit (invariant 6).
// It must load before render.js and before actions.js reads it at call time.

// MOVED here from render.js (D8): the {w, h} footprint table the packer
// reads. render.js keeps FP_FURNITURE[defId].draw() and imports the
// footprints from here — the harness cannot load render.js at all, so a
// packer that still reached into it would be unverifiable.
const FP_FOOTPRINTS = { bed: { w: 26, h: 34 }, /* … */ };

// Pure. The exact packing renderAutoFurniture uses today, returned as data
// so the anchor can read the same footprints the renderer draws.
function resolveAutoPlacements(roomId, objects) -> [{ defId, objId, x, y, w, h }]

// Priority D9; applies the D10 interaction offset. BRANCHES the way
// renderRoomFurniture branches: an authored room (ROOM_DECOR[roomId] exists)
// resolves against the authored placements and never against
// resolveAutoPlacements, because in an authored room the auto packing is
// drawn nowhere.
function resolveObjectStandPoint(gs, roomId, obj) -> { x, y }

// defs.design.js — ROOM_DECOR placements gain an OPTIONAL defId (D9), the
// missing link between the shape namespace and the object namespace:
//   { shape: 'pool', defId: 'swimming_pool', x: 372, y: 352, w: 96, h: 92 }
// Additive: renderDesignShape and decorVisible ignore it; only the anchor
// resolver reads it. A placement with no defId is pure decoration (a plant,
// a rug) and never wins D9's tier 2.

// OBJECT_DEFS (defs.world.js / defs.actions.js): + standInset (units),
// + anchorMode ('edge' | 'center')
```

### Reverse overture + join-me follow (Phase 2b / Phase 3) — D20/D21
```js
// movement.js / world.js — pure. Decides the player's move-to-NPC target.
function resolveMoveToNpc(gameState, playerRoomId, npcId)
    -> { targetRoomId, arriveSec, feedback } | null
//   stationary NPC          → their room (arrive at their stand-point)
//   mid-walk in-house NPC   → their DESTINATION room (faster tier → catch-up)
//   off-map-bound NPC: arrive before off-map time → meet at the door;
//     else targetRoomId = 'entry' + feedback = "gone before you could reach
//     them"  (entry/front-door via frontDoorAnchor, cognition.js:865)
//   already off-map or co-located → null (no-op)
// ui.js — handleAction('moveToNpc', npcId): avatar-click branch in the
//   global dispatcher (ui.js:8887); render.js adds cursor/tooltip on NPC
//   markers. Phase 3's [Join] button (D21) calls the same flow with the
//   NPC's destination as the target.
```

### Departure awareness (Phase 3) — D12/D13
```js
// config.js
const CONVERSATION = { departureWatchWindowMinutes: 8 };  // window before a move

// cognition.js — pure read of commitment/nextDecision/work boundaries.
function imminentDeparture(gs, npcId, windowMinutes)
    -> { reason, destType, leavesAtAbs, minutesAway } | null
//   destType: 'shared' | 'privacy' | 'offflat' — picks the D12 phrasing tier.

// llm.js — the DEPARTURE AWARENESS prompt block (D12); '' when nothing
//   imminent. Tells the model it is planning to go do X, to alert the
//   player, and to find a naturally stopping point; phrasing per destType
//   (shared = invite, privacy = firm-but-warm, offflat = absolute farewell).
function conversationDepartureLine(gs, npcId) -> string

// ui.js — D13's one-player-beat ack is a UI COUNTER, not a prompt
//   instruction. A prompt block cannot hold turn state: asked to "wait for
//   one more beat", a model will sometimes leave immediately and sometimes
//   never leave. convState carries the flag and doConvSend decrements it:
//     convState.departure = { npcId, destType, leavesAtAbs, beatsLeft: 1 }
//   Set on the turn the awareness line is emitted; the NEXT player turn
//   decrements beatsLeft to 0 and that turn's reply is the last one. The
//   mechanical session end then fires at walk start (D13) regardless of what
//   the model wrote. The prompt block asks for the right WORDS; the counter
//   guarantees the right NUMBER OF TURNS.
```

## Implementation phases

### Phase 0 — Walk-time tiers (D15/D19)
**Goal:** NPC base walking speed slows so each room-to-room transition is ≈
10 game-sec and a cross-flat walk ≈ 1 game-min at 1:1 (the user's Q1 ask —
the mechanical half of "movement remains legible at all speed levels"; the
presentation floor in Phase 1 is the visual half). The PLAYER moves on a
faster tier (~3 game-sec/hop, D19) so catching a moving NPC is possible —
and because the player's move only advances the clock ~3s/room, a cross-
flat player move costs ~21 game-sec, not ~70. Sim-feel is otherwise
unchanged: walks still finish in fractions of a sim day at idle; at 1:1 the
NPCs visibly stroll and the player's own moves read as quick and deliberate.

**Measured targets (verified against the real `ROOM_LAYOUT`, 2026-08-28).**
The flat's diameter is **7 hops** (`bedroom_3 → gym`), not 6 — so the
longest NPC walk is **70 game-sec**, not 60. The user's stated benchmark
lands exactly: `bedroom_1 → bedroom_3` is 6 hops = **60 game-sec**. Hop
distribution over the 342 ordered room pairs: 40/62/70/72/52/40/6 for
1–7 hops.

**Files:**
- `src/src/srcfiles/config.js`: `WALK` → `secondsPerRoom: { npc: 10, player: 3 }`
  (+`minSeconds`, `arriveEpsilon`); retire `secondsPerThreshold`; **KEEP
  `unitsPerSecond`, retuned 28 → 11.5**, because the in-room leg is still
  distance-derived (D15).
- `src/src/srcfiles/movement.js`: `planWalk` (NPC tier) computes `seconds` as
  per-room + in-room distance and `speed = totalUnits / seconds`; stamps
  `startedAtAbs` (D22); `advanceFrameWalks` advances by `w.speed`;
  **`settleWalks` gains the partial advance for incomplete walks (D22)**.
- `src/src/srcfiles/world.js`: `walkSeconds(route, tier)` returns the same
  seconds for the given tier (one source of truth for the clock, the blocker
  math, and the player's move cost). **`resolveWalk(gs, from, to, tier)`
  threads the tier** — it is `walkSeconds`' only caller. `doMove`
  (ui.js:7268) passes `tier='player'`; ui.js:7376 only consumes
  `walk.seconds` and is NOT edited.

**Verification:** pure harness (Node `dev/verify/verify-present-p0.js`): for
every authored room pair, `planWalk` seconds ≈ 10 × transitions + the
in-room remainder and `walkSeconds(route,'npc')` agrees, and
`walkSeconds(route,'player')` ≈ 3 × transitions + the same remainder; a
same-room walk across the living room's 329-unit diagonal takes ~28 game-sec,
NOT `minSeconds` (the D15 regression guard); a walk advanced by
`advanceFrameWalks` at 1× lands `coveredUnits === totalUnits` exactly at
`completesAtAbs` (no drift); **D22 — a walk half-way through its span,
settled by a batch that does not reach `completesAtAbs`, has
`coveredUnits ≈ totalUnits/2` and a `pos` on the path, not at either end;
two identical-seed runs still produce byte-identical settled sequences (C6)**.

**Existing assertions Phase 0 breaks — all six must be rewritten, not
deleted:**
- `dev/verify/verify-plan.js` *"walk time is DERIVED from geometry, not
  authored"* — resizes `ROOM_LAYOUT.dining` and asserts the walk lengthens.
  This is the floorplan plan's D9 being deliberately inverted by D15.
  **Rewrite it to assert the half that survives**: the ROUTE and the door
  midpoints are still geometric, and resizing a room still changes the
  in-room leg (so the walk still lengthens — just by less). Do not delete
  it; it is the guard that the map still means something.
- `verify-plan.js` *"even the longest walk stays under a game-minute"* —
  `bedroom_3 → gym` is 7 hops = 70s. New bound: under 90 game-sec.
- `verify-plan.js` *"a step to the next room costs seconds, not minutes"* —
  still true (10s), but the `< 30` bound wants re-reading against the new
  scale.
- `verify-plan.js` *"every threshold type has a walk cost"* —
  `WALK.secondsPerThreshold` no longer exists. Replace with an assertion
  that every tier in `WALK.secondsPerRoom` is a positive number.
- `dev/verify/verify-m4.js` *"planWalk emits a walk record"* — asserts
  `w.speed === WALK.unitsPerSecond`. `speed` is now per-walk
  (`totalUnits / seconds`). Assert that identity instead.
- `verify-m4.js` *"coveredUnits advances by exactly WALK.unitsPerSecond ×
  gameSeconds"* plus its two `totalUnits / WALK.unitsPerSecond` helpers —
  all four sites become `w.speed × gameSeconds`.

### Phase 1 — Presentation-position layer + dotted path illustration
**Goal:** No avatar ever visibly snaps on a DOM rebuild or a batch settle.
Every marker — NPCs and the player — animates from its last rendered
position to the sim position over a bounded real-time duration along a path
that passes through door midpoints; live walks (already per-frame smooth)
track directly at mechanical speed, so at 1:1 the user sees the full 10s-
per-room stroll; reduced motion falls back to teleport + fade. The sim state
is byte-for-byte untouched. Phase 1b adds the D18 dotted-line path, drawn
along the same route the marker animates.
**Files:**
- `src/src/srcfiles/movement.present.js` (new): `presentAvatars` state (incl.
  `routePath`/`pathState`), `presentFrame(gs)` (per-avatar track/catch-up
  decision + transform write + path-line state), path re-planning via
  `findPath`/`sharedWallSegment`/`roomsContainingPoint`.
- `src/src/srcfiles/render.js`: `renderFloorPlanLive` calls `presentFrame`
  instead of computing placement each frame, and draws/updates the dashed
  path overlay; `floorPlanAvatarPlacement` stays as the SIM-position source.
  `is-transit` ring shows during catch-up too.
- `src/src/srcfiles/config.js`: the `PRESENT` block (locked, D5).
- `src/src/srcfiles/time.js` **or** `movement.present.js`: **the presentation
  rAF loop (D23)**. `renderFloorPlanLive`'s only caller today is inside
  `clockFrame`'s `if (scale > 0 && cappedDeltaMs > 0)`, so it stops being
  called whenever the clock pauses — which the action outcome window does
  for its entire lifetime, the pause menu does, `advanceAndResolve` does,
  and `scale === 0` does during sleep. The presentation loop animates REAL
  time and writes no sim state, so it runs on its own rAF regardless of
  clock state. `clockFrame` keeps calling the live pass for the sim-position
  half; the two are idempotent per frame.
- `index.html`: register the new file in the load list (`?v=` bump) **and in
  `loadgame.js`'s `ORDER` in the same commit** (invariant 6); the
  reduced-motion rule (D7). **Do NOT add a CSS `transition` to
  `.fp-avatar`.** A CSS transition on an SVG `<g>`'s `transform` DOES work
  in current browsers — which is exactly why it is a trap here rather than a
  no-op: `presentFrame` already writes an interpolated transform every rAF,
  and a transition on top of that composes two smoothings into visible lag.
  `will-change: transform` is fine and welcome.
**Verification:** live (`browser_eval`): force an NPC walk at idle, force a
player action that triggers `settleWalks`, sample the marker `transform`
attribute across frames and assert it moves through intermediate positions
(no single-jump); assert the marker keeps its rendered position across a
`renderFloorPlanStatic` rebuild (no 0,0 flash); assert `npc.pos`/`location`
identical before/after a rendered animation. **D23 — trigger a catch-up,
open the action outcome window mid-animation, and assert the marker keeps
moving while the clock is paused and does not jump on dismiss.** **D4 —
assert a live walk at idle 20× tracks continuously (no catch-up restart)
and that the same walk behaves identically at 60fps and at a throttled
30fps**, the frame-rate-invariance the old `trackThreshold` could not give.
**Both floor-plan containers** (sidebar + `#floor-plan-large` overlay) are
driven from the one `presentAvatars` record — open the overlay mid-walk and
assert both markers agree. Path illustration: commit a walk and assert the
dashed line fades in (about-to-take) before the marker moves, tracks the
marker to the destination, and fades out on arrival; vision-check the dotted
line renders clearly and follows door midpoints. Pure harness for the path
re-planner (Node, `dev/verify/verify-present-p1.js`).

### Phase 2 — Shared furniture placement + interaction anchors
**Goal:** The furniture the floor plan draws and the stand-point an NPC
walks to are the same coordinates; NPCs stand AT the object they're using
(edge, inset) rather than at the room centroid or the object's centre.
**Files:**
- `src/src/srcfiles/defs.placement.js` **(new — NOT world.js)**:
  `resolveAutoPlacements`, extracted verbatim from `renderAutoFurniture`'s
  packing, **plus `FP_FOOTPRINTS` moved out of `render.js` (D8)** — the
  packer needs the `{w, h}` table, and `render.js` is deliberately absent
  from `loadgame.js`'s `ORDER`, so a packer that still reached into it could
  not be verified in Node at all. **Register in BOTH `index.html`'s load
  list (`?v=1`) and `loadgame.js`'s `ORDER`, same commit** (invariant 6).
- `src/src/srcfiles/render.js`: `renderAutoFurniture` consumes
  `resolveAutoPlacements`; `FP_FURNITURE` keeps only the `draw()` half and
  reads footprints from `defs.placement.js`.
- `src/src/srcfiles/defs.design.js`: **optional `defId` on `ROOM_DECOR`
  placements (D9)** — the missing shape↔object link. Today the pool is
  drawn as `shape: 'pool'` and swum in as `defId: 'swimming_pool'`, and
  nothing connects the two, so D9's tier 2 does not exist until this lands.
- `src/src/srcfiles/actions.js`: `resolveActionAnchor`'s point computation
  becomes `resolveObjectStandPoint` (priority D9, inset D10), **branching on
  authored-vs-auto exactly as `renderRoomFurniture` does**.
- `src/src/srcfiles/defs.world.js`: `standInset`/`anchorMode` on `OBJECT_DEFS`
  (values per the curated table, D17).
**Verification:** pure harness (Node `dev/verify/verify-present-p2.js`)
asserts for every room that the drawn footprint centre equals the anchor
stand-point within the inset — the picture and the walk cannot disagree.
**The assertion must read the source the room actually draws from**: an
authored room (`ROOM_DECOR[roomId]` present — `pool_room` today) resolves
against the authored placements, because `renderRoomFurniture` returns
`renderAuthoredDecor` for the WHOLE room and nothing
`resolveAutoPlacements` produces there is drawn at all. Asserting
auto-packing geometry for `pool_room` would be asserting against pixels the
player never sees. Also assert every `ROOM_DECOR` entry that names a real
`OBJECT_DEFS` defId resolves to that object's stand-point. Live: a hungry
NPC cooks at the drawn stove; a swimmer stands at the drawn pool's edge; a
sleeper lies on the bed.

### Phase 2b — Reverse overture (move-to-NPC, D20) + join-me follow (D21)
**Goal:** Clicking an NPC's avatar on the floor plan walks the player TO the
person, not just the room — including catching a moving NPC (faster tier,
D19) or missing them at the front door (entry-room fallback + feedback
line). The join-me button (D21, built in Phase 3) reuses this machinery.
**Files:**
- `src/src/srcfiles/ui.js`: avatar-click branch in the global dispatcher
  (ui.js:8887 — `e.target.closest('[data-avatar-id]')`, excluding the
  player's own marker), `handleAction('moveToNpc', …)`, the off-map
  feedback narration.
- `src/src/srcfiles/world.js` or `movement.js`: `resolveMoveToNpc` (pure —
  stationary → stand-point; mid-walk → destination room; off-map-bound →
  meet at the door or entry fallback).
- `src/src/srcfiles/render.js`: `cursor:pointer` + hover affordance/tooltip on
  `.fp-people [data-avatar-id]` markers (never on the player's own).
- `index.html`: **`.fp-people { pointer-events: none; }` (index.html:802)
  makes the whole avatar layer click-through today — the click must be
  re-enabled on NPC markers only**, leaving the player's own marker and the
  captions inert so the room rect underneath still takes its click. This is
  why avatar clicks currently do nothing at all: the room handler tests
  `e.target.tagName === 'rect'`, and a marker is circles/image/text, so the
  event falls through to no branch. Nothing existing is displaced by
  claiming it.
- `src/src/srcfiles/config.js`: tunables if needed.
**Verification:** pure harness (Node `dev/verify/verify-present-p2b.js`):
stationary NPC → correct room; mid-walk NPC → destination room with arrival
sec on the player tier; off-map-bound NPC with `playerSec ≥ timeUntilOffMap`
→ entry + feedback; `playerSec < timeUntilOffMap` → meet at the door. Live:
click an NPC mid-walk at idle and watch the player marker visibly catch up
alongside (Phase 1); **assert the NPC actually advanced during the player's
move (D22) — before the partial batch advance landed, the NPC's
`coveredUnits` was frozen for the whole span and there was nothing to catch
up to**; click an NPC who just left for work and read the feedback line;
click through the `#floor-plan-large` overlay as well as the sidebar (both
containers carry the same `data-avatar-id` markers). Needs Phases 0 (tiers,
including D22) and 1 (presentation) — not independent of them.

### Phase 3 — Conversation departure awareness + presence recheck
**Goal:** A conversation never replies for a person who isn't there; the
partner is made AWARE of its own impending move (D12), finds a naturally
stopping point with destination-typed phrasing, waits one player beat, then
leaves — and the end is a handoff to a visible walk-out, never a cutoff
(D13). A shared-space invite carries an in-chat [Join] button (D21): the
player can accept and follow the NPC to the destination alongside it.
**Files:**
- `src/src/srcfiles/cognition.js`: `imminentDeparture` → `{ reason, destType,
  leavesAtAbs, minutesAway }` (destType drives the D12 phrasing tier and
  whether a [Join] button appears).
- `src/src/srcfiles/llm.js`: `conversationDepartureLine` (destination-typed
  awareness block) + reconcile the turn's `activeNpcs`/`ambientNpcs` against
  live presence (D14) before `buildScenePrompt`. **The reconciliation
  FILTERS the existing `currentSceneState`; it must never reassign it from
  `getSceneParticipants`, which returns a fresh `engagement: {}` and would
  wipe the counters `advanceEngagement` builds and `assessSceneIfFull`
  reads** (D14).
- `src/src/srcfiles/ui.js`: `doConvSend` presence recheck before and after the
  LLM call (D11); **the one-player-beat ack as a counter on `convState`, not
  as a prompt instruction** (D13 — a prompt block cannot hold turn state, so
  the model would sometimes leave immediately and sometimes never); session
  end + narration at walk start (D13); the in-chat [Join] button
  render/handler (D21 — reuses Phase 2b's move-to-NPC flow with the NPC's
  destination as target). Note `activeConversationSession` (ui.js:6343)
  ALREADY deletes the session when `npc.location !== player.location` — it
  just only runs when something calls it. D11's recheck is a second,
  earlier trigger, not a replacement; do not remove the existing guard.
- `src/src/srcfiles/config.js`: `CONVERSATION` block.
**Verification:** live — start a conversation, let the partner's work
boundary arrive mid-talk; assert the reply that precedes the walk carries a
natural, destination-typed goodbye (shared-space invite vs privacy dismissal
vs off-flat farewell); the player gets one reply beat; then the session ends
(overlay closes/context pops, no ghost reply) WHILE the floor plan shows the
NPC visibly walking out along its dotted path (Phases 0/1). Join flow:
a shared-space invite shows [Join]; clicking it walks the player alongside
to the destination (co-located at arrival, narration reads); not clicking
leaves the NPC to leave alone. A resumed/paused session dies when the NPC
leaves. Pure harness for `imminentDeparture` window maths (Node
`dev/verify/verify-present-p3.js`).

### Phase 4 — Polish + full verification pass
**Goal:** The whole scenario matrix verified live and cheap; no regression
in determinism, save/load, or per-frame cost.
**Files:** tuning touches in `config.js`/`index.html` only; the phase may
also record measured per-frame cost and confirm the avatar-bubble/session
lifecycle interactions.
**Verification:** live run of each scenario (idle snap-free walking, batch
settle, reconcile teleport, player move, click-to-NPC catch-up, conversation
departure with dotted-path walk-out and [Join] follow, off-map work return
and "gone before you could reach them" fallback, sleep fast-forward,
reduced-motion); **plus the two paused-clock scenarios D23 exists for: an
action outcome window opening mid-catch-up, and the pause menu opening
mid-catch-up**; save/load round-trip **including a save taken mid-walk,
which now carries `startedAtAbs` (D22), and a pre-Phase-0 save that does
not**; `dev/verify/run-all.js` baseline updated ONLY where Phase 0
intentionally changed walk timing — the six named assertions in Phase 0 and
nothing else; final `browser_refresh` confirms zero `perchanceErrors`.

**Baseline as of 2026-08-28 (post-harness-repair, pre-Phase-0):**
`run-all.js` reports **3310 passed, 73 failed, 8 harnesses errored**. Those
failures are PRE-EXISTING and belong to other in-flight work, not to this
plan — record the number before Phase 0 and compare against it, rather than
assuming a clean suite.

## Status
| Phase | Status | What it does |
|---|---|---|
| 0 | Done | Walk-time tiers: NPC 10s/room + in-room distance, player ~3s/room; `startedAtAbs` + `settleWalks` partial advance (D15/D19/D22) |
| 1 | Done | Presentation-position layer + own rAF + dotted path for NPCs (no snaps, visible walks at every dilation, D18/D23) — `movement.present.js`, `PRESENT` config, `verify-present-p1.js` 24/24, live-verified 2026-08-29 |
| 2 | Done | Shared furniture placement (new `defs.placement.js`, `ROOM_DECOR` gains `defId`) + object-edge stand-points — `verify-present-p2.js` 15/15, live-verified 2026-08-29 |
| 2b | Done | Reverse overture: click an NPC's avatar to travel to them (`resolveMoveToNpc` + `doMoveToNpc` + `is-clickable` markers, D20) — `verify-present-p2b.js` 17/17, live-verified 2026-08-29 |
| 3 | Done | Conversation departure awareness + per-turn presence FILTER + in-chat [Join] (D11/D12/D13/D14/D21) — `imminentDeparture`/`nextScheduleBoundary` (cognition.js), `reconcileScenePresence`/`conversationDepartureLine` (llm.js), `checkConversationWalkOut`/`convRenderJoinButton`/`doConvSend` integration (ui.js) — `verify-present-p3.js` 33/33, live-verified 2026-08-29 (see Audit corrections 5–9) |
| 4 | Done | Polish + full live verification — two fade-lifecycle bugs found & fixed (`?v=4`, off-map fade-out completion latch + fade-in ramp), full scenario matrix live-verified 2026-08-29 — `verify-present-p4.js` 14/14 |

## Dependency order
```
Phase 0 (walk-time tiers) ────┐
Phase 1 (presentation layer) ─┤
Phase 2 (shared placement) ───┼──► Phase 4 (polish + verification)
Phase 2b (reverse overture) ──┤   (2b needs Phases 0+1)
Phase 3 (conversation) ───────┘
```
Phase 0 is first — small, mechanical, everything else's visuals sit on it,
and it now also carries D22's partial batch advance, which Phase 2b's
catch-up silently depends on. Phase 1 next — the presentation visuals are
the floor every other phase's feel stands on. Phases 2, 2b, 3 are
independent of each other; 2b additionally needs Phases 0+1 (it is a
movement+UI feature built on the tiers and the presentation layer). Phase 4
needs all five preceding phases (0, 1, 2, 2b, 3). **The `Design session
record` below gates all of them** — every question maps to a D-number a
phase reads — and the `Audit corrections` list in the Handoff section
amends six of those D-numbers; read both.

## Design session record (2026-08-28)
All five questions answered and locked (D15–D21), including the follow-up
confirmations; two items are flagged as interpretations (tunable / easy to
reverse), not blockers.

**None of the user's ANSWERS changed in the 2026-08-28 audit — only the
mechanisms chosen to deliver them.** Q1 still gets 10 game-sec per room hop
(and `bedroom_1 → bedroom_3` measures at exactly the 60 game-sec the user
asked for); Q2 still gets full player presentation; Q3 still gets
destination-typed awareness, one player beat, and an in-chat [Join]; Q4
still gets a curated table with an `'edge'` default; Q5 still gets an
NPC-only dotted path. What the audit corrected was arithmetic and missing
data underneath those answers — see `Audit corrections` in the Handoff
section.

1. **Walk speed (D15, D19).** *User:* slow base walking so each room hop ≈
   10 sec and Bedroom 1 → Bedroom 3 ≈ a minute at 1:1 — AND make the player
   considerably faster so catching up to NPCs is possible. **Locked:** D15
   (per-room time, NPC tier 10s/hop) + D19 (separate player tier ≈ 3s/hop,
   ~3× faster). The per-room-vs-distance question is moot: the user chose a
   per-tier, per-room model. *Flagged (tunable): the 3s/hop player speed — a
   config knob.*
2. **Player's own marker (D16).** *User:* "Full like recommended." **Locked:**
   full presentation on every player move.
3. **Conversation end semantics (D12, D13, D21).** *User:* no abrupt
   cutoffs; the NPC is aware of its own impending move, destination-typed
   phrasing (shared → "join me, I'm doing X"; privacy/work → more absolute);
   a **join-me confirmation button IN CHAT** to confirm and follow
   alongside. **Locked:** D12 (destination-typed DEPARTURE AWARENESS) + D13
   (awareness line → one player beat → handoff to a visible walk-out) + D21
   (in-chat [Join] button; Join = follow to the destination alongside,
   session closes with narration, re-talk available at the destination).
   *Flagged (interpretation): the session closes on Join and re-opens at the
   destination, rather than walking-and-talking.*
4. **Anchor modes (D17).** *User:* "Curated for now I suppose." **Locked:**
   curated table (~10 objects), `'edge'` default.
5. **Path illustration (D18).** *User:* dotted path for NPCs, "you choose
   your path" — the player needs no demarcation. **Locked:** D18 NPC-only.
6. **NEW — Reverse overture (D20).** *User:* click an NPC's avatar to travel
   TO them; if they're moving, calculate where they'll be when you arrive;
   if they left before catch-up, travel to the entry room with "[name] was
   gone before you could reach them." **Locked:** D20 (stationary → their
   stand-point; mid-walk → their destination room on the faster tier;
   off-map-bound → meet at the door, or entry-room fallback + feedback).
   *Flagged (interpretation): on arrival at a stationary NPC, offer the
   standard talk affordance (the natural completion of "reverse overture").*

## Design invariants
1. **The presentation layer never writes sim state.** `npc.pos`/`location`/
   `walk`/`commitment.arrived` have exactly the writers they have today —
   plus, from Phase 0, `settleWalks`' partial advance (D22), which is a SIM
   writer in the sim's own batch regime, not a render-path writer. This is
   the D8/D9/C6 scar: the batch regime must stay reproducible from seed, and
   a renderer that mutates the sim is how that dies.
2. **The furniture drawn and the furniture walked to are the same
   coordinates.** Two placement logics disagreeing is the whole of Issue C.
   There are TWO drawing sources, not one — `renderAuthoredDecor` for a room
   with a `ROOM_DECOR` entry, `renderAutoFurniture` for every other room —
   and the anchor resolver must branch the same way `renderRoomFurniture`
   does. "One source" means one source PER ROOM, chosen by the same test.
3. **A conversation never replies for a person who isn't there.** The user's
   report, verbatim; D11/D14 exist for it.
4. **The static/live render split (D12) survives.** The live pass is
   extended, never merged with the static pass.
5. **Citation drift is expected.** Every `file.js:line` in this document was
   true when written; find the real location by name.
6. **New source files register in two places** (`src/src/srcfiles` load list in
   index.html with a `?v=` bump + `loadgame.js`'s `ORDER`) in the same
   commit. **This plan adds TWO**: `movement.present.js` (Phase 1) and
   `defs.placement.js` (Phase 2).
7. **Walk time has one source of truth, per tier.** `planWalk`'s
   `completesAtAbs` and `walkSeconds`'s blocker/doMove math return the same
   seconds for the same tier; if they drift, the clock and the door-stop
   logic disagree about the same doorway. Phase 0 keeps them adjacent,
   deliberately. The tier reaches `walkSeconds` through `resolveWalk`, its
   only caller.
7b. **A per-frame delta is never a decision input.** units/frame =
   `speed × (deltaMs/1000) × scale` — it varies with the player's refresh
   rate and the current dilation, so no threshold over it means the same
   thing twice. Track-vs-catch-up reads CAUSE (`walk` record present?);
   teleport-vs-replay reads a game-TIME gap. Neither is a distance. This is
   the D4/D6 correction and the easiest mistake to reintroduce.
8. **The dotted line is the walked path, literally.** The illustration draws
   the exact route the presentation layer animates — never a different one.
   If the marker and the line ever diverge, that is a Phase 1b bug.
9. **A move-to-NPC destination is the sim's position at arrival time, read
   from the sim — never a guess.** `resolveMoveToNpc` computes target and
   feedback from walk records and off-map times, and the batch advance is
   the same machinery that runs checkpoints; the player arrives where the
   NPC actually is (or at the front door when they've gone).
10. **Every number in this document is measured, not estimated.** The hop
   distribution, the 342 room pairs, the ~11.5 units/game-sec, the 329-unit
   living-room diagonal, the 7-hop diameter and the per-frame deltas were
   all computed against the real `ROOM_LAYOUT` through the `dev/verify`
   loader on 2026-08-28. If a tunable changes, re-measure rather than
   re-reason — the 2026-08-28 audit found three locked constants
   (`trackThreshold`, `maxRoomsForWalk`, and the in-room `minSeconds`
   collapse) that were each defensible in prose and wrong in arithmetic.
