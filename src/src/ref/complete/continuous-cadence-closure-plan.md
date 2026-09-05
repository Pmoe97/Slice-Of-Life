# Continuous Cadence Closure

Status: **complete — all 9 phases built and independently verified.**
Design session complete 2026-09-02; all decisions locked.
Last updated 2026-09-02.

Companions:
- `src/src/ref/complete/CONTINUOUS-SIMULATION-ROADMAP.md` (the plan this one
  closes the gap behind — see "The thesis" below for exactly what its own
  claim got wrong, and D8/Phase 9 for the correction this plan owes it).
- `src/src/ref/complete/continuous-behavior-engine-plan.md` (built
  `npc.commitment` — this plan changes when it gets *evaluated*, not what it
  stores).
- `src/src/ref/complete/needs-and-heartbeat-plan.md` (the proven precedent
  this plan's Phase 5 mechanically repeats — its own `decayPerTick` →
  `decayPerMinute` conversion, generalized to Pass 2's other rates).
- `src/src/ref/complete/npc-avatar-liveliness-and-movement-plan.md` (COMPLETE,
  verified accurate — the floor-plan avatar layer is NOT in scope here; this
  plan only touches scene-level presence state and the sim's decision
  cadence, never the already-correct `movement.present.js` animation layer).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table near the bottom, as the very last thing you do each session — see
`src/src/ref/complete/continuous-cadence-closure-handoff-prompt.md` for the full
session protocol.

---

## Handoff — read this first

**Resume at:** Nothing — this plan is complete. All 9 phases are Done (see
the Status table below). If you are reading this because you were told to
find the next phase in this plan, there isn't one; report the completion
to the user rather than inventing further work here. Any follow-on
scope (C8 geometric perception, a save-migration project, etc.) belongs to
a new plan document, not this one — see "What this plan is *not*" above.

**Last session's notes (Phase 9, 2026-09-02).** Documentation-only, as the
phase's own Goal specified — no code touched, no verify harness added or
run (Phase 9's Verification bullet is explicit: "None (docs-only)"; the
Handoff section is fully current with Phase 8's own notes below, which
were already accurate at the top of this session, so Step 0/1 of the
session protocol found zero drift to reconcile before writing).

1. **The one deliverable: `CONTINUOUS-SIMULATION-ROADMAP.md`'s Plan 1
   section gained a dated correction note (D8, closed).** Inserted
   immediately after Plan 1's own description paragraph, before the
   `### Plan 2` heading — quotes the original claim verbatim ("Decision
   cadence becomes event-driven... the loop resolves only who's due, not
   everyone on a fixed interval"), states what was actually true (the
   `npc.commitment` data model was real and continuous; nothing but
   `resolveTick` ever read it, and `resolveTick` only fired on the flat
   30-minute `CLOCK.tickMinutes`/`TIME_DILATION.simCheckpointMinutes`
   grid on both the discrete and idle paths — a continuous data model
   wrapped around the same fixed-interval poll it claimed to replace),
   and points to this plan's Phases 6-7 (`nextWakeAbs` + the
   `resolveTick`/`resolveBatch` variable-length cutover) as the actual
   closure, with a link. Re-read after writing per the phase's own
   Verification bullet ("confirm it doesn't overstate in the opposite
   direction either") — it credits the real half of the original claim
   (the data model) rather than implying Plan 1 was wrong about
   everything, and names the exact mechanism (Phase 6/7) that closed the
   gap rather than vaguely gesturing at "later work." The note was NOT
   added to this roadmap's own Design Invariant 3 ("Decision cadence is
   per-entity and event-driven everywhere it appears in this roadmap") —
   D8 and Phase 9's own Files bullet both scope the correction to "Plan
   1's own description" specifically, and invariant 3 is a forward-looking
   rule for future plans in this roadmap, not itself a claim about what
   already shipped; broadening the edit there would have been scope this
   phase was never asked to cover.
2. **Nothing else changed in `CONTINUOUS-SIMULATION-ROADMAP.md`.** Its
   own top-of-file Status line (five plans, "every plan the umbrella
   indexes is now built") was left untouched — the continuous-cadence-
   closure plan is a separate document, linked from the roadmap's
   Companions list, not one of the five plans that Status line describes;
   correcting Plan 1's description text is a different edit than
   revising what the umbrella claims about its own five-plan scope, and
   the latter was never asked for.
3. **This plan's own Status header (top of this file) marked complete**,
   per the session protocol's own Step 3.5 ("If this was Phase 9, mark
   the plan's Status header complete") — see immediately above the
   Companions list.

**Verification.** None beyond the re-read specified by the phase itself
(docs-only, no code path, no verify harness — see point 1 above). No
`run-all.js` re-run: this phase touched zero `.js` files, so there is
nothing for that suite to regress against. `verify-i4.js` and
`verify-voc-p9.js`'s pre-existing errors (source lines 473/68) were not
re-checked this session since nothing sim/code-side changed — the last
confirmed-unchanged reading remains Phase 8's.

**Blockers / flagged deviations:** None. This plan is done.

---

**Last session's notes (Phase 8, 2026-09-02).** The ambient ticker (D9),
plus one real correctness bug found and fixed live rather than shipped.

1. **New module: `meanwhile.js`.** Sits directly after `signals.js` and
   before `scene.js` in both `index.html` and `dev/verify/loadgame.js`'s
   `ORDER` (invariant 6), and in `ARCHITECTURE.md`'s load-order diagram —
   `scene.js`'s `composeScene` calls it at runtime. Three functions:
   - `meanwhilePerceivableRooms(gameState, roomId)` — pure, the room itself
     plus every room reachable on ANY of the three signal channels (smell/
     sound/sight), via `reachMultipliers` (signals.js) called once per
     channel and unioned. D9's "same signal-layer reasoning
     `perceiveSignals` already uses" — that reasoning IS `reachMultipliers`;
     reused, not reimplemented (Design Invariant 4's own discipline one
     level up, same as Phase 1's `reconcileScenePresenceForRoom`).
   - `composeMeanwhileTicker(gameState, roomId)` — pure, the single most
     recent (`day`, then `tick`) not-yet-`seenByPlayer`,
     `EVENT_IMPORTANCE`-qualifying event in a room `meanwhilePerceivableRooms`
     returns, **excluding `roomId` itself** (see point 3 below — this
     exclusion is load-bearing, not a stylistic choice), formatted as
     `Meanwhile, in the {room}: {formatEventText(evt, npcs)}`. The
     importance floor reuses `EVENT_IMPORTANCE[evt.type]` truthy exactly
     like `chatterBestCandidateForDay`'s own precedent (chatter.js) —
     ambient/unclassified events (cooking, laundry, naps — D9's own
     "someone did laundry" example verbatim) never qualify.
   - `markMeanwhileShown(gameState, meanwhile)` — the one write, mirroring
     `markCalloutsShouted`/`markDoorCuesShown` (scene.js) exactly: sets
     `meanwhile.evt.seenByPlayer = true` on the SAME live object
     `composeMeanwhileTicker` returned a reference to (not a re-lookup by
     matching fields — `composeScene`'s own `beats` field already hands out
     live `sessionLog` references the same way, so this isn't a new pattern).
2. **Wiring.** `scene.js`'s `composeScene` gained a `meanwhile` field,
   computed alongside `doorCues`/`sensory`. `render.js`'s `renderSceneReader`
   draws `scene.meanwhile.line` into the establishing passage as a new
   `.sr-meanwhile` div (styled in `index.html`, dim like `.sr-sensory` but
   never italic — a plain recalled fact, not an ongoing impression), placed
   right after the sensory loop. BOTH scene-redraw call sites mark it shown
   after drawing: `render.js`'s main `render()` (after `markDoorCuesShown`)
   and `ui.js`'s `addLogEntry` (the second call site, per its own comment
   about why it duplicates the marking calls).
3. **The race, found live in `dev-harness.html`, not guessed.** The first
   build let the ticker consider the player's OWN current room too (`here`
   vs "elsewhere" phrasing, like `sensory` lines). Reproduced directly: push
   two `EVENT_IMPORTANCE`-qualifying same-room events, then call the real
   `doLookAround()`. Expected both narrated via the pre-existing
   `surfaceRoomEvidence` (ui.js) — got only one. Cause: `doLookAround`/
   `doMove` each fire an EARLIER `addLogEntry` call (the room description /
   walk narration) before their own explicit `surfaceRoomEvidence(roomId)`
   call, and `addLogEntry` itself unconditionally re-renders the scene
   reader — so that earlier render let the ticker "steal" the most-recent
   same-room event, marking it `seenByPlayer` with only a same-render-frame
   DOM flash (never a durable `sessionLog` line, since the ticker's line is
   recomputed fresh every render like `sensory`/`doorCues`, never appended
   to the log) — moments before `surfaceRoomEvidence` would otherwise have
   claimed and durably narrated it. Net effect: the event's text silently
   never appeared anywhere the player could read it. Fixed by excluding
   `evt.roomId === roomId` from `composeMeanwhileTicker`'s candidates
   entirely (point 1 above) — same-room narration is now ALWAYS
   `surfaceRoomEvidence`'s job, zero overlap, zero race. This does cost the
   ticker the "idling in your own room" half of the Goal ("...or simply
   idling" surfacing "anything perceptible that happened"), so that half is
   covered separately: `ui.js`'s `advanceAndResolve` now calls
   `surfaceRoomEvidence(currentGameState.player.location)` unconditionally,
   gated to `!advanceClockToo` (i.e. `opts.advanceClock === false` — the
   exact branch condition Phase 7's D16 established for the idle/continuous
   checkpoint path) — reusing the same already-race-free mechanism (Design
   Invariant 4) rather than teaching the ticker to duplicate it. Both the
   exclusion and the new call are source-checked in
   `verify-ccc-p8.js` section 9, and both were re-verified live afterward:
   the two-same-room-event scenario now narrates both lines via
   `doLookAround`, and a same-room event surfaces correctly through a direct
   `advanceAndResolve(1, { advanceClock: false, ... })` call mirroring
   `runSimCheckpoint`'s own call shape.
4. **Recency, not importance, breaks ties among multiple qualifying nearby
   candidates.** `(day, then tick)`, most recent wins — matches
   `surfaceRoomEvidence`'s own `.slice(-maxItems)` recency bias rather than
   `chatterBestCandidateForDay`'s importance-weighted scoring; the ticker is
   about "what just happened," not "what's most notable."

**Verification.** `node src/src/dev/verify/verify-ccc-p8.js` — new harness,
30/30: registration/fixture sanity (0), the ambient-floor exclusion —
`cooking` never surfaces even same-room (1), the same-room exclusion itself,
proven against a fixture where nothing else would disqualify the event (2),
a nearby (signal-reachable) room surfaces with the correct
`Meanwhile, in the {room}:` prefix (3), an out-of-reach room never surfaces
(4), an already-`seenByPlayer` event is skipped (5), recency tie-breaking
across three candidates in the same nearby room (6), `markMeanwhileShown`
mutates the real live event and the ticker never repeats it (7), marking a
null/undefined result is a harmless no-op (8), and source-level wiring
checks for every touched file plus the same-room exclusion and the new
`advanceAndResolve` call site (9). `node src/src/dev/verify/run-all.js ccc`
— 196/196 (all eight ccc harnesses; the prior 166 plus this phase's 30 new,
zero regressions). Full `run-all.js` (unfiltered): **4110 passed / 83
failed / 12 errored** — the Phase 7 baseline (4080/83/12) plus exactly this
phase's 30 new passes, zero movement in failed/errored. Live-verified in
`dev-harness.html` (sandbox save, one resident, generateText/generateImage
both stubbed to throw so every path exercised was a real deterministic
fallback): a nearby-room event renders the correct room-prefixed line with
the correct `.sr-meanwhile` styling and does not repeat on a second render;
an ambient (`cooking`) same-room event stays silent; an out-of-reach
(`study`) event stays silent; the race-fix scenario and the idle-path
same-room fix (point 3 above) both reproduced correctly against the real
`doLookAround`/`advanceAndResolve` functions, not mocks.

**Blockers / flagged deviations:** None.

**Last session's notes (Phase 7, 2026-09-02).** Two things landed.

1. **D15 — the STEALTH_TUNING split (top-of-phase blocker, closed).**
   `STEALTH_TUNING.baseEvidenceDiscoveryChance` is gone. Split into
   `roomSearchEvidenceDiscoveryChance` (config.js) — `computer.js`'s
   `performCleaningVisit`, unchanged value (0.15), never minute-converted,
   no tick relationship — and `evidenceDiscoveryChancePerTick` (config.js,
   same raw 0.15) — `resolveTick`'s Pass 2 evidence-discovery block
   (sim.js), now minute-converted AT THE CALL SITE. `evidenceStrengthDiscoveryFactor`
   stays unrenamed (D10's precedent: sim.js's own single reader). The
   conversion mirrors `thermostatSelfAdjustChance`'s own shape exactly
   (D13): `evidenceDiscoveryChancePerTick + evidence.strength *
   evidenceStrengthDiscoveryFactor` is combined into one effective
   per-tick chance PER OBJECT first (evidence.strength varies per
   object), then THAT result is minute-converted via
   `chanceOverMinutes(1 - Math.pow(1 - evidenceTickChance, 1 /
   CLOCK.tickMinutes), minutesThisTick)` — never the raw constants
   individually.

2. **D16 — `resolveTick`/`resolveBatch` cut over to variable-length
   resolution.** `resolveTick(gameState, minutesThisTick =
   CLOCK.tickMinutes)` (sim.js) — the span is now a real parameter, not a
   hoisted `const`; the default preserves every pre-Phase-7 single-argument
   caller byte-for-byte (dozens, across unrelated verify harnesses —
   `verify-ccc-p7.js` section 1 proves this directly). `resolveBatch`
   (sim.js) now has two branches:
   - **`advanceClock !== false`** (the discrete/action path — every
     caller except TIME's checkpoint): no longer `ticks` identical
     `CLOCK.tickMinutes`-sized calls. Total clock advance stays EXACTLY
     `ticks*CLOCK.tickMinutes` and total needs stays `opts.needsMinutes`
     (or the same total) — only the NUMBER and SIZE of intermediate
     `resolveTick` calls changed. Each step covers
     `Math.min(nextWakeAbs(state, { includeHeartbeat: false }), nowAbs +
     CLOCK.tickMinutes, nowAbs + remaining) - nowAbs` — the soonest of a
     REAL scheduled completion, the old flat 30-minute cadence, or what's
     left in the batch. Needs decay is now a proportional (not equal)
     share per step (generalizing needs-and-heartbeat Phase 3/D11's
     "equal division across ticks," which assumed every tick was the same
     size).
   - **`advanceClock === false`** (TIME's `runSimCheckpoint` — the
     continuous/idle checkpoint path): collapses to ONE `resolveTick`
     call over the TRUE elapsed span (`opts.needsMinutes`, now threaded
     through from `time.js` even though `suppressNeeds` is true on this
     path). Replaces the old loop of `ticks` IDENTICAL
     `CLOCK.tickMinutes`-sized calls, which — since `meta.clock` never
     moved between them on this path — silently replayed the EXACT SAME
     rng seed every iteration (`seededRng` keys on `day`/`minutes`),
     correlating what were supposed to be independent per-30-minute
     chance draws. Fixed as a side effect of the redesign, not a separate
     patch.
   - New helper `advanceClockByMinutes(clock, minutes)` (sim.js, right
     after `advanceClock`) — the per-step clock advance now that a step
     isn't always exactly one tick; forward-only, kept in sim.js rather
     than calling `time.js`'s `advanceClockMinutes` (sim.js never calls
     into time.js — the same precedent `nextWakeAbs` itself already set).
   - `time.js`: `runSimCheckpoint` now passes `needsMinutes: minutes`
     (the TRUE accumulated span) instead of leaving `resolveBatch` to
     infer it from a lossily-rounded `ticks` count. `pendingCheckpointMinutes`'s
     own re-fire guard changed from `>= simCheckpointMinutes` to `> 0` —
     it used to wait for a full 30 minutes to accumulate before re-firing
     a queued checkpoint, which no longer reliably happens now that
     checkpoints are usually smaller than 30.
   - `time.js`: `clockFrame`'s checkpoint gate — new module-local
     `nextCheckpointWakeAbs` (invalidated on `startClockLoop`/
     `resumeClockLoop`, since a paused discrete action can change state
     out from under a cached target), computed as `Math.min(nextWakeAbs(currentGameState,
     { includeHeartbeat: false }), nowAbsAtCompute + TIME_DILATION.simCheckpointMinutes)`
     right after each checkpoint resolves; a checkpoint fires once
     `clockAccumulatedMinutes > 0` and the clock has reached that target.

3. **D17 — `nextWakeAbs` gained `opts.includeHeartbeat` (default `true`,
   every existing caller including `verify-ccc-p6.js`'s 31 checks
   untouched).** Found WIRING D16, not guessed: `nextWakeAbs`'s own
   unconditional heartbeat-boundary fallback (D7) means its raw default is
   NEVER more than `TIME_DILATION.HEARTBEAT_MINUTES` (5) away, even when
   nothing real is scheduled anywhere near that soon. Using that raw
   default directly as `resolveBatch`'s step bound (this session's first
   attempt) made EVERY step heartbeat-sized — which re-evaluates every
   UNCOMMITTED NPC's Pass 1 far more often than the old flat 30-minute
   cadence, since `dueForDecision` treats "no commitment" as "always due."
   Measured breaking wander movement directly: `verify-ccc-p4.js` failed 3
   checks (a captured wander walk's duration didn't match replaying
   `planWalk` from its own recorded start — because the NPC had already
   landed and re-rolled a FRESH target from an intermediate position
   within the same batch a wander walk is tens of real-seconds long, so it
   lands almost immediately, then a subsequent ~5-minute step re-rolls a
   new one, repeatedly, inside what used to be a single 30-minute
   decision). Fixed by excluding the heartbeat term
   (`includeHeartbeat: false`) from `resolveBatch`'s OWN step-bound
   computation and `clockFrame`'s checkpoint-gate computation specifically,
   falling back to the OLD flat cadence (`CLOCK.tickMinutes`/
   `TIME_DILATION.simCheckpointMinutes`) when nothing real is sooner —
   reproducing the old per-NPC decision frequency exactly for the
   "nothing scheduled" case while still landing exactly on a real
   completion whenever one falls inside the current flat window.
   `verify-ccc-p4.js` is back to 28/28 after this fix.

**Measured before/after (the concrete round-trip the plan's own
Verification bullet asks for).** A resident's synthetic commitment
(`kind: 'activity'`, anchor `living_room`) completing at `nowAbs+47`
(clock day 5 / minute 600 → absolute 7800, so `completesAtAbs=7847` — not
a multiple of 30 OR 5), inside a `resolveBatch(h, 2, {})` call (2 ticks =
60 minutes, spanning 7800→7860). OLD behavior (traced by hand against the
pre-Phase-7 code, since the old flat-tick loop is gone): tick 1 lands the
clock at 7830 (commitment still correctly held — not yet due); tick 2
lands the clock at 7860 in ONE lump, and ONLY THEN does `dueForDecision`
notice `7847 <= 7860` and release it — meaning the ENTIRE 30 minutes from
7830 to 7860 gets Pass 2's per-minute rates (dirt, mood) attributed to
whatever the POST-release schedule location resolves to, even though the
commitment's own anchor (`living_room`) was still genuinely held for the
first 17 of those 30 minutes (7830→7847). NEW behavior (`verify-ccc-p7.js`
section 3, all reproduced live): three steps — 7800→7830 (flat cadence,
held), 7830→7847 (17 minutes, landing EXACTLY on `completesAtAbs` — the
commitment releases here, Pass 2's rates for this 17-minute step still
correctly attribute to `living_room`), 7847→7860 (13-minute remainder,
Pass 2 now correctly attributes to the NPC's real post-release location).
Same total span (60 minutes), same final clock (7860) — only the internal
attribution boundary moved from a fabricated 7860 to the commitment's own
real 7847.

**Verification.** `node src/src/dev/verify/verify-ccc-p7.js` — new
harness, 32/32: `resolveTick`'s 1-arg/2-arg default is byte-identical (1),
the STEALTH_TUNING split — both readers, both values, source-text wiring
(2), the exact-minute-landing round-trip above plus the 3-step trace and
the released-original-commitment check (3), needs decay sums to the true
`opts.needsMinutes` span despite variable step sizes (4), the frozen-clock
checkpoint branch is exactly one call over the true span with the clock
untouched (5), zero-span guards on both branches (6), `nextWakeAbs`'s new
`includeHeartbeat:false` option — infinite-when-nothing-real, agrees with
the default when a real candidate beats the heartbeat, diverges correctly
when it doesn't (6b), and source-level wiring checks for every touched
file (7). `node src/src/dev/verify/run-all.js ccc` — 166/166 (all seven
ccc harnesses; `verify-ccc-p5.js` and `verify-ccc-p6.js` each needed one
assertion updated to match Phase 7's own changes — the STEALTH_TUNING
split superseding Phase 5's "left untouched" check, and `nextWakeAbs`
going from zero to one real call site superseding Phase 6's "nothing
calls it yet" check — both are EXPECTED corrections, not regressions).
`node src/src/dev/verify/verify-aa-p17.js` (this phase's own named
top-of-phase blocker check) — 51/51, unchanged from the Phase 5 baseline.
Full `run-all.js` (unfiltered): **4080 passed / 83 failed / 12 errored** —
the Phase 6 baseline (4048/83/12) plus this phase's own 32 new passes
exactly, zero movement in failed/errored. `verify-i4.js` and
`verify-voc-p9.js` re-checked individually: both still error at the exact
same source lines (473 and 68) as every prior phase's handoff recorded.

**Blockers / flagged deviations:** None. The one real blocker carried
into this session (STEALTH_TUNING, D15 above) was closed, not deferred.

**Last session's notes (Phase 6, 2026-09-02).** `nextWakeAbs(gameState)`
now exists in `sim.js`, immediately after `chanceOverMinutes` (same "pure
clock-math helpers" cluster `getTickIndex` anchors) — sim.js was in fact
the natural home, confirmed rather than guessed, per the Open Question this
closes. It is pure, reads `gameState`, writes nothing, and per the phase's
own Goal is called from NOWHERE yet — Phase 7 is the wiring session.

D7 named three source categories to `min()` over: every active resident's
`commitment.completesAtAbs`, the next `TIME_DILATION.HEARTBEAT_MINUTES`
boundary, and `world.{commitments,visits,deliveries}[].startAbs/endAbs`.
As built: every term is required to be STRICTLY future (`> nowAbs`) — an
already-overdue candidate means an NPC is already due for a decision on
THIS tick (`dueForDecision`'s domain, cognition.js), not a "how far can we
skip forward" question. The heartbeat term is `nowAbs + (HEARTBEAT_MINUTES
- (nowAbs % HEARTBEAT_MINUTES))`, which is always present and always
future by construction (the on-the-boundary case falls out of the same
formula, yielding `HEARTBEAT_MINUTES` itself rather than 0) — this is what
makes the required "no-one-scheduled" fallback unconditional rather than a
special case. `sim.js` never calls `clockToAbsolute` (time.js loads after
it); `nowAbs` is `clock.day*1440+clock.minutes` inlined, the same
precedent `visitDay`/`getActiveVisits` (both sim.js, above) already set.

**D14 (new) — two corrections to D7's literal wording, found reading the
live code, both load-bearing for Phase 7's own correctness and both
covered by this session's harness:**
1. Broadened "every active RESIDENT's commitment" to every ACTIVE npc's
   commitment — residents AND active visitors, via the exact same
   `getActiveVisits`/`getActiveNpcIds` (sim.js) `resolveTick` itself
   iterates (Design Invariant 4's "call the existing reader" discipline,
   applied to activity state the way Phase 1 applied it to presence).
   `resolveTick`'s own Pass 1 comment already establishes that a visiting
   NPC can hold a real `npc.commitment` exactly like a resident ("pinned to
   it like any committed NPC until their own completion"), and
   `nextDecisionAbs`/`dueForDecision` (cognition.js) already read
   `npc.commitment` uniformly across both — D7's literal "resident-only"
   wording would have missed a visitor's own commitment ending, the exact
   "discovered late" bug class Phase 7 exists to close, just for a visitor
   instead of a resident. `verify-ccc-p6.js` section 3 constructs a
   visiting NPC whose own commitment is the soonest event in the scenario
   and confirms it wins.
2. Narrowed D7's "`world.{commitments,visits,deliveries}`" list to just
   commitments and visits. Read live: `world.deliveries[]` (computer.js)
   and `world.renovationJobs[]` (riding the same day-rollover path) are
   DAY-granular (`etaDay`/`startDay`) — there is no `startAbs`/`endAbs`
   field on either record shape to read at all, so D7's premise
   ("deliveries... already clockToAbsolute-space") does not hold for the
   live code. They also are not part of the problem Phase 7 solves:
   midnight is already detected independently, every frame, by
   `clockFrame`'s own day-crossing check (`time.js`, `currentGameState.
   meta.clock.day !== prevDay`) — a mechanism Phase 7 does not touch
   (Design Invariant 2: only `resolveTick`'s SPAN changes, never what
   triggers day rollover). Folding day-granular records into a
   minute-level wake primitive would have been wrong, not merely
   redundant. This is the one piece of D7 this session found genuinely
   unworkable against the live code — resolved the same way D10-D13
   resolved their own plan-vs-code gaps: scope to what the live data
   actually is. `verify-ccc-p6.js` section 6 confirms both record shapes
   are simply inert to `nextWakeAbs`'s answer (present in `gameState.world`,
   never read).

Both `world.commitments[]` and `world.visits[]` contribute BOTH bounds
(`startAbs` and `endAbs`) when `> nowAbs`, filtered to live-relevant status
only (`'scheduled'` for commitments — `'held'`/`'missed'` are resolved
history; not `'done'`/`'deferred'` for visits, mirroring `getActiveVisits`'
own filter exactly) — a window not yet open needs `startAbs` (an override
binds at the open), a window already active needs `endAbs` (its close);
`nextWakeAbs` doesn't need to know which phase a window is in, since
requiring `> nowAbs` on both terms and taking the min naturally picks
whichever one is still ahead.

**Verification.** `node src/src/dev/verify/verify-ccc-p6.js` — new
harness, 31/31 passing: registration/reuse sanity (0), the no-one-
scheduled fallback returns the exact next heartbeat boundary across six
different starting minutes including sitting exactly on a boundary,
never null/undefined (1), a resident commitment beats the heartbeat
boundary when sooner (2), D14 point 1 — a VISITING npc's own commitment
wins over everything else (3), `world.commitments[]` — not-yet-open picks
`startAbs`, already-open picks `endAbs`, a `'held'` record with a
nominally-future window is ignored entirely (4), the same three shapes for
`world.visits[]` plus `'done'`/`'deferred'` filtering (5), a genuine
three-way TIE across a resident commitment/a world commitment/a world
visit all landing on the same minute resolves to that minute, and adding
`world.deliveries[]`/`world.renovationJobs[]` records alongside it neither
throws nor moves the answer — D14 point 2 (6), every candidate being
already-overdue falls all the way through to the heartbeat boundary rather
than returning a stale/past minute (7), and a source-level check that
`nextWakeAbs` reuses `getActiveVisits`/`getActiveNpcIds` rather than
re-deriving activity, never calls `clockToAbsolute`, and has exactly ONE
occurrence in `sim.js` — its own definition, confirming nothing calls it
yet (8). `node src/src/dev/verify/run-all.js ccc` — 134/134 (all six ccc
harnesses). Full `run-all.js` (unfiltered): **4048 passed / 83 failed / 12
errored** — the Phase 5 baseline (4017/83/12) plus this phase's own 31 new
passes exactly, zero movement in failed/errored. `verify-i4.js` and
`verify-voc-p9.js` re-checked individually: both still error at the exact
same source lines (473 and 68) as every prior phase's handoff recorded.

**Blockers / flagged deviations:** None blocking Phase 6 itself. D14 above
is a documented deviation from D7's literal wording (same "found tracing
the real data, not scope creep" precedent D10-D13 already set). The
STEALTH_TUNING gap (Phase 5's own flag) remains open and is now the one
thing standing between here and Phase 7 — see "Resume at" above; it is
Phase 7's responsibility to close or explicitly re-affirm, not Phase 6's.

**Last session's notes (Phase 5, 2026-09-02).** Every Pass 2 flat-per-tick
rate is now a per-minute rate, applied as `ratePerMinute * minutesThisTick`
(deterministic magnitudes) or via a new `chanceOverMinutes(perMinuteChance,
minutes)` helper (sim.js, right after `getTickIndex` — `1 -
Math.pow(1-perMinuteChance, minutes)`) for chance rolls. `minutesThisTick`
is a new local in `resolveTick` (sim.js), hoisted right above the Pass 2
loop and currently always `CLOCK.tickMinutes` — `resolveTick` still has no
variable-span parameter (that's Phase 7's job, Design Invariant 2); today's
value is the real span every call resolves, not a placeholder, so nothing
here needs revisiting when Phase 7 lands, only the hoisted constant's
source needs to change from `CLOCK.tickMinutes` to a real parameter.

D6's own named six: `DIRT_TUNING.footTrafficPerTick` →
`footTrafficPerMinute`; `SOUND_DEVICE_DEFS.music.keepItDown.chancePerTick`
→ `chancePerMinute`; `THERMOSTAT_TUNING.complainChancePerTick` →
`complainChancePerMinute`; the ambient random-event roll's bare inline
`0.15` → a new named `OFFSCREEN_EVENT_TUNING.chancePerMinute` (config.js,
right above `OFFSCREEN_EVENTS`); `PARTY_TUNING.dirtPerTickPerGuest` →
`dirtPerMinutePerGuest`, `.attendeeMoodPerTick` → `.attendeeMoodPerMinute`,
`.complainChancePerTick` → `.complainChancePerMinute`.

**Real blast radius beyond D6 (D13, new).** Tracing every OTHER flat
per-tick constant actually read inside `resolveTick`'s Pass 2 loop — not
just D6's named six, the same "follow every direct reader" discipline
D10/D12 already used on this plan — turned up six more living in the exact
same guard blocks as D6's own named ones: `SOUND_DEVICE_DEFS.music`'s
`npcMoodPerIntensity`/`npcMoodCap` (the ambient music mood lift, right next
to `keepItDown`'s chance) → `npcMoodPerIntensityPerMinute`/
`npcMoodCapPerMinute`; `headphones`/`mp3_player.npcMoodGainPerTick` (the
worn-device gain, same block) → `npcMoodGainPerMinute`;
`THERMOSTAT_TUNING`'s `annoyanceMoodDeltaPerDegree`/`annoyanceMoodDeltaCap`
(the discomfort malus, right next to the complain chance) →
`*PerMinute`; `PARTY_TUNING`'s `annoyanceMoodPerIntensity`/`annoyanceMoodCap`
(the listener malus, right next to the complain chance) → `*PerMinute`. All
converted this session — leaving half of a mechanic's block converted and
half not would itself be the silent mistuning Design Invariant 3 exists to
prevent, the moment Phase 7 stops resolving exactly 30 minutes every call.
See D13 below (Locked decisions) for the full reasoning, including the two
things deliberately NOT converted (`SOUND_DEVICE_DEFS.music`'s
player-target terms, and `THERMOSTAT_TUNING.selfAdjustChancePerTick`, which
stays named `*PerTick` on purpose).

**Flagged, not fixed — for a future session, before Phase 7 cuts over.**
`STEALTH_TUNING.baseEvidenceDiscoveryChance`/`evidenceStrengthDiscoveryFactor`
is ALSO a flat per-NPC-tick chance read in this same Pass 2 loop (sim.js,
the evidence-discovery block right after the party block), and is currently
unconverted. It was not touched this session because the SAME constant is
also read by `computer.js`'s `performCleaningVisit` — a per-cleaning-visit,
per-room roll with no tick relationship at all (`processDayRollover`'s
housekeeper mechanic). Converting the Pass 2 reader without breaking the
unrelated cleaning-visit reader requires splitting them into two
independently-named constants first (mirroring how D10 handled
`SLEEP_RHYTHM`'s single-reader case, but in reverse — here there are two
readers, one tick-scoped and one not, sharing one name). This is real,
scoped, doable work — just not done here, to avoid rushing a shared-constant
split at the end of an already-large session. **Whoever picks up Phase 6 or
7 should either do this split first, or explicitly re-confirm it's still
out of scope** — Phase 7's own top-of-phase blocker note ("everything Phase
5 converted must already be merged") does not by itself catch this, since
Phase 5 never claimed to convert it.

**Verification.** `node src/src/dev/verify/verify-ccc-p5.js` — new harness,
36/36 passing: registration/no-dual-definition sanity (0), every
deterministic conversion's `ratePerMinute * 30 === the exact old ratePerTick
literal` (1), every chance conversion's `chanceOverMinutes(chancePerMinute,
30) === the exact old chancePerTick literal` (2), the thermostat
self-adjust wrap reproduces `thermostatSelfAdjustChance(npc)` exactly at 30
minutes across five different assertiveness values — proving the wrap must
run on the already-personality-scaled result, not the raw base rate (3), a
large-N (20,000 draws per subsystem) statistical proof that the REAL
config-stored `chancePerMinute` values, compounded over exactly 30
one-minute draws, reproduce the old per-tick firing rate within 0.01 for
all four chance-based subsystems (4 — the plan's own required "statistically
… large-N comparison, not a single seed"), `chanceOverMinutes`'s scaling
sanity for spans other than 30 (5, Phase 7 readiness), one real
`resolveTick` call's dirt bump matching the converted rate exactly (6), and
a source-level check that the old un-scaled literals/field names are gone
from sim.js and every converted chance roll goes through `chanceOverMinutes`
(7). `node src/src/dev/verify/run-all.js ccc` — 103/103 (all five ccc
harnesses). `node src/src/dev/verify/verify-aa-p17.js` (this phase's own
required re-run, per its top-of-phase blocker) — 51/51, unchanged pass
count; its two direct field-name/value reads updated to the new
`*PerMinute` names (mechanical migration, not a behavior change — see the
harness's own updated comments). `verify-aa-p9.js` (`DIRT_TUNING` field
check) and `verify-w19.js` (two exact-value music/mp3 mood-delta checks,
`SOUND_DEVICE_DEFS.music.npcMoodPerIntensity`/`.mp3_player.npcMoodGainPerTick`)
were the only other direct readers of anything renamed this phase — both
updated (`* 30` reproduces the one-tick amount they were already asserting)
and both still green (46/46, 27/27). Full `run-all.js` (unfiltered): **4017
passed / 83 failed / 12 errored** — the Phase 4 baseline (3981/83/12) plus
this phase's own 36 new passes, zero movement in failed/errored (stable
across two consecutive runs; a keyword search across the full output for
every subsystem name touched this phase — footTraffic, dirtPerTick,
attendeeMood, annoyanceMood, complainChance, npcMoodPerIntensity,
npcMoodGainPerTick, thermostat, keepItDown, selfAdjustChance — returned zero
hits among the 83 pre-existing failures). `verify-i4.js` and
`verify-voc-p9.js` re-checked individually: both still error at the exact
same source lines (473 and 68) as every prior phase's handoff recorded.

**Blockers / flagged deviations:** None blocking. Two documented,
non-blocking deviations: (1) D13's blast-radius expansion beyond the plan's
literal Files/Goal-text scope (D6-named six only) — same "found tracing
every direct reader, not scope creep" precedent D10/D12 already set for
this plan; (2) the `STEALTH_TUNING` evidence-discovery gap flagged above,
genuinely deferred rather than fixed — a future session must either close
it or explicitly re-affirm the deferral before Phase 7 cuts over, since nothing
currently forces that check to happen.

**Last session's notes (Phase 4, 2026-09-02).** `sim.js`'s Pass 1 wander
branch (`resolveTick`, the `else` arm after the sleep/work/commute/follow/
commitment-room checks — search for "Continuous-cadence-closure-plan Phase
4") no longer steps the NPC one room per tick via `npc.transit`. It now
mutates `npc.pos`/`npc.walk` directly and calls the SAME `planWalk`
(movement.js) commitment-anchored movement already uses, exactly as D5
specified — a wander target names only a room, so its centroid becomes the
anchor point (the same fallback `openCommitment` uses for a plain drive
anchor). `npc.transit` is now written nowhere in the codebase; the field is
left in the `resolved[id]`/`npcUpdates[id]` shape only for backward
compatibility with existing readers (`movement.present.js`,
render.js's `!!npc.transit || !!npc.walk` truthy checks, and a few verify
fixtures' static `transit: null`) — none of them needed touching, since a
permanently-false extra check is harmless and Files scope was sim.js. A
walk-in-progress is detected via `npc.walk` (not re-rolled every tick, same
"keep heading to the existing destination" shape the old `.transit` code
had); a landed/absent walk picks a fresh target via `resolveRoomForActivity`
exactly as before. `resolved[id]` gained a `walk` field (mirroring the old
`transit` field) so Pass 3's "a held commitment cancels an in-flight wander"
check (search "resolved[id].walk" in sim.js) could be renamed onto the new
field with unchanged logic.

**The bug this actually fixes.** A wander used to jump one room per 30-
minute tick regardless of distance — a 3-room wander took a flat 90 minutes,
a same-room "wander" a flat 30 — and the NPC's `location` teleported through
each intermediate room on the tick boundary with no real transit at all.
Now a wander plans a real `WALK.secondsPerRoom.npc`-based, distance-
proportional walk (via the same `settleWalks`/`advanceFrameWalks` regime
committed movement already integrates every frame, and lands/proportionally-
advances at the top of every `resolveTick` via `settleWalks`, which already
ran unconditionally before this phase). A same-room wander (target's
centroid within `WALK.arriveEpsilon`) now lands instantly, same as before.

**Real blast radius — two files beyond sim.js, both required for D5's own
design to be correct, not scope creep.** Reusing `npc.walk` for wander (a
field that used to be commitment-exclusive) surfaced a real correctness gap
in cognition.js, found by tracing every writer of `npc.walk`, not guessed:
`openCommitment` and `openWorkCommitment` (cognition.js) each had a branch
where they decide NOT to plan a fresh walk of their own (already standing at
the anchor / no anchor at all) and, before this phase, simply left
`npc.walk` untouched in that case — which was always safe before, because
nothing but commitment-opening code ever wrote `npc.walk`, so it was already
null. Now an UNCOMMITTED wander can leave `npc.walk` set, and a fresh
commitment opening with nothing of its own to walk would have inherited that
stray walk — an `arrived: true` commitment (or an off-map worker with
`pos`/`location` nulled) still animating toward the old wander target on the
next tick's `settleWalks`. Both functions now explicitly null `npc.walk` in
that branch (search "D5 blast radius" in cognition.js for both sites).
`openHomeWorkCommitment`/`returnHome` already unconditionally null
`npc.walk` and needed no change.

**Verification.** `node src/src/dev/verify/verify-ccc-p4.js` — new harness,
28/28 passing. Every wander/commitment check stubs `evaluateDrives` to a
neutral no-op first: empirically, on this fixture (3 residents, needs
satisfied, `standard` weekday `midday` block), `evaluateDrives` opens SOME
drive-commitment for virtually every due, uncommitted npc-tick — real,
correct, pre-existing D2 behavior ("a commitment overrides the schedule"),
but it means a "pure wander nothing else touches this tick" is not a
naturally-sampled state, so isolating pass 1's own mechanism (this phase's
actual subject) required neutralizing pass 3 for the duration of these
checks (see the harness's own file-header comment — this is documented
there in detail for the next session that touches this file). Checks cover:
a genuine wander plants `npc.walk` (never `npc.transit`) with a duration
strictly under one tick (0), that duration exactly matches `planWalk`'s own
formula replayed on the same start/destination (1), an in-flight walk is
NOT re-rolled every tick — same path, same `totalUnits`, same "heading to"
label (2 — this is the harness section that would have caught a regression
to per-tick re-rolling), a two-tick round trip lands the NPC exactly in the
room the walk was heading to (3, Design Invariant 1's "same eventual
outcome" — the ONLY invariant-1 sense that applies to this phase, see below),
`openCommitment` clears a stray wander walk when it plans no walk of its own
(4, the blast-radius fix), and a source-level check that the old
`npc.transit.progress` stepping is gone and `planWalk`/`walkDestRoom` are
really wired into pass 1 (5). `node src/src/dev/verify/run-all.js ccc` —
67/67 (all four ccc-p* harnesses). Full `run-all.js` (unfiltered): **3981
passed / 83 failed / 12 errored** — one FEWER failure than Phase 3's
recorded baseline (3952/84/12) plus this phase's own 28 new passes
(3952+28=3980, actual 3981); the extra pass and matching failure-count drop
is one pre-existing test that now incidentally passes, not a regression —
confirmed by re-running the full sweep twice (stable/reproducible numbers),
spot-checking the failure content of the files most plausibly connected to
movement (`verify-c1.js`, `verify-c4.js`, `verify-w13.js` — all pre-existing
drive-tuning/intimacy-history issues with zero code path through
sim.js/cognition.js), and a targeted keyword search across the full sweep's
output for "walk"/"transit"/"wander"/".pos" (the two "walk" hits outside
`verify-ccc-p4.js` are `verify-c4.js`'s `tryInvestigateSmell` "walk leg"
checks — an unrelated, coincidentally-named smell-investigation mechanic in
drives.js, exercised by calling `evaluateDrives` directly with a hand-built
npc, never touching sim.js/cognition.js at all). `verify-i4.js` and
`verify-voc-p9.js` re-checked individually: both still error at the exact
same source lines (473 and 68) as every prior phase's handoff recorded.

**Design Invariant 1, for this phase specifically.** Read literally,
invariant 1 groups phases "2, 3, 4, 5" as "behavior-invisible by
construction," but Phase 4 is not a rate CONVERSION like its siblings — it
REPLACES a movement mechanism the phase's own Goal text and Verification
bullet explicitly call a bug ("never a flat one-room-per-tick jump... not a
flat 90 minutes"). Judged the same way Phase 3's D11 judged its own
imprecise Files bullet: the invariant's real, verification-proven meaning
(established by Phases 2/3's own proofs) is "the OLD default call pattern
stays byte-identical," not "nothing about the new mechanism's timing may
differ" — and Phase 4 has no such old-default-pattern concept, since the
flat one-room-per-tick jump was the exact artifact being replaced. What DOES
still have to hold, and what the harness's section 4 (round-trip) verifies:
the EVENTUAL OUTCOME — which room a wander ends up in — is unchanged.

**Blockers / flagged deviations:** None. The cognition.js blast-radius fix
(D12 below) is a documented deviation from the plan's Files list (sim.js
only), not a blocker — the same "real blast radius, not scope creep"
precedent Phase 3's handoff already set, this time surfaced by tracing every
WRITER of `npc.walk` rather than every reader of a converted table.

**Last session's notes (Phase 3, 2026-09-02).** The plan's own Files bullet
("resolveBatch's per-tick applyNeedsHeartbeat(state, CLOCK.tickMinutes, ...)
loop call replaced with one call at the real span being resolved") turned
out to be imprecise in a way that would have been a real regression if
implemented literally — see D11 below for the full reasoning. What actually
shipped: `resolveBatch` (sim.js) still calls `applyNeedsHeartbeat` once PER
TICK, inside the loop, exactly as before — but each tick's `minutes`
argument is no longer a hardcoded `CLOCK.tickMinutes`. A new `opts.
needsMinutes` (the batch's TRUE elapsed minutes, defaulting to `ticks *
CLOCK.tickMinutes` when omitted) is divided evenly across the batch's ticks
(`perTickNeedsMinutes = opts.needsMinutes / ticks`), so the total applied
across the batch matches the real span exactly instead of always `ticks *
30`. `advanceAndResolve` (ui.js) now computes `needsMinutes` *before* calling
`resolveBatch` (it used to compute it only after, for `advancePhoneBattery`)
and threads the same value into both — one true-span source, two consumers,
same pattern advancePhoneBattery already established.

**The bug this actually fixes.** `advanceAndResolveMinutes` (time.js) counts
`ticks` as 30-minute GRID LINES crossed by an action's span, not `minutes /
30` — a 5-minute action that happens to straddle a grid line gets `ticks=1`,
and a 59-minute action that doesn't straddle an extra line can also get
`ticks=1`. Before this phase, `resolveBatch` charged every one of those
ticks a flat 30 minutes of NPC needs decay regardless — so short actions
that crossed a boundary were overcharged (a 5-minute door-lock draining as
much as a 30-minute action) and longer misaligned ones could be
undercharged. Now the true span is what gets charged, split proportionally
across whatever ticks the action happened to cross.

**D11 (new) — needs decay stays keyed PER TICK, never collapsed to one
end-of-batch call, even though the plan's Files bullet said "one call."**
Reading `resolveBatch`'s own existing comment (inherited from
`needs-and-heartbeat-plan.md`'s Phase 3) surfaced the reason the per-tick
shape exists at all: restore (sleep/meal/social) keys on the block/location
THAT TICK actually resolved to, and an end-of-batch single call would key on
only the FINAL block — for `resolveBatch`'s own primary use case (`doSleep`,
an 8-hour multi-tick batch that starts in 'sleep' and ends in 'morning'),
that would have silently zeroed out sleep restore for the whole night, a
regression Design Invariant 1 (behavior-invisible by construction) exists
specifically to catch. The plan's literal Goal text ("closed-form call at
the exact elapsed minutes") and the "2×15-minute actions must equal 1×30-
minute action" verification bullet are both still satisfied by the shape
that actually shipped: dividing the true span evenly across ticks keeps
each tick's own block/location read intact (preserving sleep-restore
correctness) while making the SUM across ticks match the true span exactly
(fixing the real bug) — proportional per-tick apportionment, not literal
single-call collapse. Section 4 of `verify-ccc-p3.js` (below) specifically
regression-tests the sleep-restore-across-a-block-transition case this
would have broken. Per the session protocol's own instruction ("if a phase
conflicts with the live code... stop and flag it"): this was judged a case
of an imprecise phase-description phrase rather than a genuinely unworkable
locked decision — D4's actual intent (fix the true-span mismatch) is sound
and was implementable without the regression, so the session proceeded
rather than stopping, following the same "verify against the live code,
document the real design" precedent Phase 2's own handoff already set
(its "Real blast radius" section) rather than treating every plan-vs-code
gap as a hard stop.

**Real blast radius — correction to the plan's own Files list.** The plan's
Phase 3 block named only sim.js. Reading the live code found two more call
sites that needed touching for the fix to actually close the gap, both
found by tracing every caller of `resolveBatch`/`applyNeedsHeartbeat`, not
guessed:
- `ui.js`'s `advanceAndResolve` — `needsMinutes` used to be computed AFTER
  the `resolveBatch` call (it only fed `advancePhoneBattery`); moved before,
  and now also passed into `resolveBatch`'s opts.
- `time.js`'s `advanceAndResolveMinutes` — its `ticks === 0` branch (no grid
  line crossed at all) already drove `advancePhoneBattery`/`decayAllMemories`
  directly, with a comment explicitly noting the parallel gap this left for
  "whatever else should track true elapsed minutes." NPC needs had exactly
  that gap: since `resolveBatch` never runs at all when `ticks === 0`, EVERY
  sub-tick discrete action (a note read, a door lock, a short walk leg) left
  every resident NPC's needs completely frozen for its whole span, not just
  wrongly-scaled. Closed by calling `applyNeedsHeartbeat(currentGameState,
  minutes, { player: false })` directly in that branch, mirroring the
  phone-battery/memory-decay calls already there line-for-line.

**Verification.** `node src/src/dev/verify/verify-ccc-p3.js` — new harness,
13/13 passing: registration/fixture sanity (0), default-omitted-needsMinutes
is byte-identical to the old flat-30 behavior (1, Invariant 1), a 5-minute
batch decays exactly 5/30 of a 30-minute batch's amount instead of the old
flat 30 (2, the actual bug fix, checked on both hunger and energy), the
closed-form invariant itself — 2×15-minute ticks land on IDENTICAL final
needs to 1×30-minute tick when the block stays stable across both (3) —
sleep restore surviving a sleep→morning block transition mid-batch instead
of reading only the final block (4, the regression D11 exists to prevent),
and a source-level check that `advanceAndResolveMinutes`'s `ticks===0`
branch really does call `applyNeedsHeartbeat` (5). `node src/src/dev/verify/
verify-ccc-p1.js` — still 7/7. `node src/src/dev/verify/verify-ccc-p2.js` —
still 19/19. `node src/src/dev/verify/run-all.js` (full, unfiltered): **3952
passed / 84 failed / 12 errored** — the Phase 2 baseline (3939/84/12) plus
this phase's own 13 new passes, zero movement in failed/errored (confirmed
by diffing the full per-file failure list, not just the totals).
`verify-i4.js` and `verify-voc-p9.js` re-checked individually: both still
error at the exact same source lines (473 and 68 respectively) as Phase 2's
handoff recorded, confirming these remain pre-existing and unrelated to
this phase's sim.js/ui.js/time.js edits.

**Blockers / flagged deviations:** None (D11 above is a documented deviation
from the plan's literal Files-bullet wording, not a blocker — the phase's
actual goal was achieved and independently verified).

---

## The thesis

`CONTINUOUS-SIMULATION-ROADMAP.md`'s own words, quoted directly: *"Decision
cadence becomes event-driven: each NPC carries its own next-decision time;
the loop resolves only who's due, not everyone on a fixed interval."* That
sentence describes a real per-entity priority-queue scheduler. What actually
shipped, verified by direct code reading (not doc-trusting) in the session
that opened this plan:

- `npc.commitment` genuinely stores a continuous absolute-minute completion
  time — that half of the claim is real (`npc.pursuit`, its predecessor, is
  fully dead code; `npc.commitment` is live, 31 uses in `cognition.js`).
- But **nothing ever checks that time except `resolveTick`, and `resolveTick`
  only ever fires on a flat 30-minute grid** — `CLOCK.tickMinutes` and
  `TIME_DILATION.simCheckpointMinutes` are both hardcoded to 30
  (`config.js`), on both the discrete (player-action) path
  (`advanceAndResolveMinutes`, `time.js`) and the idle/continuous path
  (`clockFrame`'s checkpoint gate, `time.js`). A commitment that finishes at
  `:47` is not discovered until the next `:00`/`:30` boundary. This is a
  continuous *data model* wrapped around the exact same fixed-interval
  *poll* it claimed to replace, with only cheaper per-NPC filtering
  (`dueNpcIds`) once that poll fires.

The gap is not cosmetic. It cascades: `SCHEDULES`' fallback block lookup is
still `getTickIndex`-keyed; needs decay is only genuinely 5-minute-continuous
while idling, reverting to flat 30-minute lumps the instant the player acts;
an uncommitted "just wandering" NPC still teleports one room per whole tick
(90 minutes for a 3-room walk) even though a *committed* NPC walking
somewhere already rides the exact same real-seconds system the player does;
ambient domestic events are hard-capped at one roll per NPC per 30 minutes,
undocumented as a limit anywhere; and the scene the player reads has zero
ambient awareness of anything that happened while they were idle — the
floor-plan avatar layer visibly shows the world moving, but the prose next
to it is frozen until the next action.

This plan closes those gaps, in the order that keeps each phase
independently safe: cheap, bounded fixes first (Phases 1-4), the mechanical
per-minute conversion Plan 2 already proved works, generalized to what it
missed (Phase 5), THEN the actual scheduler (Phases 6-7), THEN the one
genuinely new player-facing feature the closed gap makes worth building
(Phase 8), and finally the documentation correction this whole plan exists
to earn (Phase 9).

### What this plan is *not*

- **Not a rewrite of `cognition.js`'s scorer, `DRIVE_DEFS` content, or any
  NPC's actual behavior.** Only the *cadence* at which existing decisions
  get discovered and existing rates get applied changes. A conversion phase
  that produces a different wall-clock outcome than the tick-indexed version
  would have is wrong — same invariant `CONTINUOUS-SIMULATION-ROADMAP.md`
  already stated for its own conversion plans, inherited here unchanged.
- **Not touching `movement.present.js` or the floor-plan avatar animation
  layer.** It's already correct — confirmed against live code before this
  plan was written, not assumed. This plan's scope is scene-level presence
  state (cutouts, chips, conversation validity) and the sim's own decision
  cadence, a different layer entirely.
- **Not C8 (geometric perception — real distance/line-of-sight signals).**
  `CONTINUOUS-SIMULATION-ROADMAP.md` already and honestly defers this as a
  thesis, not a plan, until continuous position exists. It exists now (the
  avatar-liveliness plan), but re-opening C8 is real, separate, unrequested
  scope — a future plan's job, not this one's.
- **Not a save-migration project.** Same waiver the original roadmap
  recorded — the game hasn't shipped.
- **Not a one-shot flip of `resolveTick`'s calling contract.** Phase 7 (the
  actual cutover) is deliberately preceded by Phase 5, which must land
  first: every Pass 2 subsystem currently written as a flat "per 30-minute
  tick" amount (room dirt, music/thermostat annoyance and complaint chance,
  the ambient random-event roll, the house-party noise/mess pass) would
  silently mis-tune the moment `resolveTick` starts resolving variable-length
  spans instead of always exactly 30 minutes — too much dirt for a short
  span, too little for a long one — unless converted to per-minute rates
  first. Cutting over before that conversion is the single most tempting
  shortcut this plan refuses.

---

## Locked decisions

### The bug fix (Phase 1)
- **D1 — Scene presence reconciles on every `advanceAndResolve`, not just
  inside an open conversation's own turn.** `reconcileScenePresence`
  (llm.js) already existed and already did the right filter — it just had
  no caller outside one per-turn hook inside an already-open conversation.
  Calling it unconditionally from the end of `advanceAndResolve` (both the
  discrete and idle paths) closes the general staleness gap in one
  chokepoint, because `currentSceneState` is a single shared global every
  other render site (including `actions.js`'s own) reads — no second call
  site was needed there. `doTalk` separately gained its own presence GATE
  (`conversationPartnerPresent`, before anything else in the function)
  since reconciling state doesn't stop a stale chip's click from trying to
  open a conversation in the first place. It triggers a `render()` itself
  when presence actually changed, so an NPC leaving mid-idle visibly
  updates the screen without waiting for the player's next input — even
  though a caller may render again moments later, matching this file's own
  established "cheap idempotent flush" style (`flushPendingPeepBubble` and
  siblings, called unconditionally the same way).
- **D2 — `demoteToAmbient` is for "still in the room," not "departed
  entirely."** The ambient tier represents an NPC present but not actively
  engaged — it has no location filter and never should get one bolted on,
  because the tier's whole point is "in the room, backgrounded." Its four
  real callers split cleanly, no runtime branch needed: `doConvLeave`/
  `doStepAway` (the player deliberately stepping back while the NPC stays
  physically present) keep `demoteToAmbient` unchanged;
  `endDepartureConversation`/the [Join] button handler (both gated on
  `conversationPartnerPresent` already having returned false — that's their
  whole precondition for running at all) were swapped outright to the new
  `removeFromScene(sceneState, npcId)`, which drops from both tiers AND
  `present`. Conflating "conversation ended" with "left the room" inside
  one function was the actual bug, not a missing location check.

### Cadence conversions (Phases 2-4)
- **D3 — `SCHEDULES`' fallback block lookup becomes an absolute-minute range
  check, not a `getTickIndex` table lookup.** Purely a reindex — the ranges
  themselves, and which block wins at any given real moment, do not change;
  only the key space they're checked against does (mirrors Plan 3 of the
  original roadmap's exact technique for `world.visits[]`).
- **D4 — The discrete action path applies needs decay in ONE call at the
  exact elapsed minutes, not `CLOCK.tickMinutes`-sized lumps inside a loop.**
  The math was already closed-form (`applyNeedsHeartbeat`'s own rate ×
  minutes); only the calling pattern inside `resolveBatch` changes. This
  makes the discrete path match what the idle path's 5-minute heartbeat
  already does, closing the asymmetry directly.
- **D5 — Wander movement (no active commitment) routes through the SAME
  `npc.walk`/`planWalk` continuous system commitment-anchored movement
  already uses.** No new movement system; the one-room-per-tick `npc.
  transit.progress` stepping is retired for this case, not generalized.
- **D10 — A cadence-conversion phase must follow every direct reader of the
  table it converts, not just the file(s) the plan names, but a tuning
  constant read (and rescaled) at a single call site does not need to be
  converted itself.** Found doing Phase 2: `SCHEDULES`' reindex had to cover
  all three direct readers of its raw ranges — `resolveScheduleActivity`
  (sim.js, the only one the plan's Files list named) plus two undocumented
  mirrors, `nextScheduleBoundary` and `workBlockEndAbs` (both cognition.js) —
  because all three parse the SAME table and would silently desync
  otherwise (one comparing a tick index against now-minute-scale bounds,
  then double-scaling the result by the leftover `* CLOCK.tickMinutes` on
  top). `SLEEP_RHYTHM`, by contrast, stayed tick-scale and unrenamed because
  it has exactly one reader, which now scales it by `CLOCK.tickMinutes` at
  that one point of use — converting the table itself would have been
  strictly more edited surface (including an existing test's direct field
  read, `verify-voc-p9.js`'s `SLEEP_RHYTHM.erraticTicks`) for no behavioral
  difference. Phase 5 will hit this same judgment call repeatedly (every
  `*PerTick` constant it converts) — the test is "how many places read this
  raw, today," not "does the name say tick."
- **D11 — `resolveBatch`'s needs decay stays keyed PER TICK; only the LUMP
  SIZE per tick becomes the batch's true elapsed span (divided evenly across
  ticks), never a single end-of-batch call.** Found doing Phase 3: the
  plan's own Files bullet said "one call at the real span being resolved,"
  but `resolveBatch`'s existing comment (from `needs-and-heartbeat-plan.md`'s
  own Phase 3) already established WHY the per-tick shape exists — restore
  (sleep/meal/social) keys on the block/location THAT TICK resolved to, and
  a single end-of-batch call would key on only the FINAL block, silently
  zeroing sleep restore for any multi-tick batch that crosses a block
  boundary (`doSleep`'s own 8-hour case, by construction). D4's actual
  intent — every tick used to get a flat `CLOCK.tickMinutes` of decay
  regardless of the batch's true span, so a short action that merely
  crossed one grid line got overcharged a full 30 minutes — is fully
  satisfied by dividing the batch's true `needsMinutes` evenly across its
  ticks instead: the SUM matches the true span exactly (fixing the real
  bug) while each tick still reads its own resolved block (preserving the
  restore-keying invariant). Omitting `needsMinutes` (every existing
  whole-tick caller) stays byte-identical to the old flat-30-per-tick
  behavior. See the Phase 3 Handoff notes for the full reasoning and why
  this was judged a documented deviation from an imprecise phase
  description rather than a stop-and-flag blocker.
- **D12 — `npc.walk` becomes shared between wander and commitments; every
  writer of it must null it when it does not plan a fresh one of its own.**
  Found doing Phase 4: before this phase, `npc.walk` was written ONLY by
  commitment-opening code (`openCommitment`, `openWorkCommitment`,
  `openHomeWorkCommitment`), so a branch in those functions that decided NOT
  to plan a walk (already at the anchor, or no anchor at all) could safely
  leave `npc.walk` untouched — it was already null, nothing else ever set
  it. Phase 4 makes an UNCOMMITTED wander write `npc.walk` too (D5's whole
  point — reusing the same continuous system), which means that assumption
  no longer holds: a fresh commitment landing in one of those "no walk of my
  own" branches could inherit a stray wander walk still heading toward an
  unrelated room, contradicting `arrived: true` (or, for
  `openWorkCommitment`'s off-map case, contradicting `pos`/`location` both
  going null). Fixed by making both functions explicitly null `npc.walk` in
  that branch (cognition.js) — a real blast-radius finding from tracing every
  WRITER of `npc.walk`, the same discipline Phase 3's D10/blast-radius note
  used tracing every READER of a converted table. `openHomeWorkCommitment`
  and `returnHome` already unconditionally null `npc.walk` on every path and
  needed no change. Any FUTURE writer of `npc.commitment` that skips walking
  must do the same — `npc.walk` is no longer implicitly commitment-owned.

### The scheduler (Phases 5-7)
- **D6 — Every Pass 2 subsystem still expressed as a flat per-30-minute-tick
  amount converts to a per-minute rate, scaled by the ACTUAL span
  `resolveTick` is resolving.** Mechanical, one subsystem at a time, each
  independently verified against its OLD behavior at exactly 30 minutes (the
  conversion must be behavior-invisible at the historical tick size — same
  invariant D3/D4 restate). Known subsystems needing this (audited, not
  guessed): `DIRT_TUNING.footTrafficPerTick` (dirt.js/sim.js),
  `SOUND_DEVICE_DEFS.music.keepItDown.chancePerTick` and
  `THERMOSTAT_TUNING.complainChancePerTick` (sim.js), the ambient
  random-event roll's flat `0.15` chance (sim.js Pass 2), and
  `PARTY_TUNING.complainChancePerTick`/`dirtPerTickPerGuest`/
  `attendeeMoodPerTick` (added by the actions-and-activities-overhaul-plan's
  Phase 17, riding this exact loop — this plan's Phase 5 must not silently
  break that phase's own verified numbers, and must re-run
  `verify-aa-p17.js` as part of its own verification for exactly that
  reason).
- **D13 — D6's "known subsystems" list was not exhaustive; a Phase-5-or-later
  session must trace every direct reader of Pass 2's per-tick constants, not
  just D6's named six, and must explicitly decide (not silently skip) any
  found sibling.** Found doing Phase 5: six more flat-per-tick constants live
  in the EXACT SAME guard blocks as D6's own named ones —
  `SOUND_DEVICE_DEFS.music.npcMoodPerIntensity`/`npcMoodCap` (the ambient
  music mood lift, same `if` block as `keepItDown`'s chance),
  `SOUND_DEVICE_DEFS.headphones`/`mp3_player.npcMoodGainPerTick` (the
  worn-device gain, same block), `THERMOSTAT_TUNING.annoyanceMoodDeltaPerDegree`/
  `annoyanceMoodDeltaCap` (the discomfort malus, same block as the
  complain chance), and `PARTY_TUNING.annoyanceMoodPerIntensity`/
  `annoyanceMoodCap` (the listener malus, same block as the complain
  chance). All six converted alongside D6's named ones (same two mechanical
  shapes: linear `/30` for deterministic magnitudes, the compound formula
  below for chances) — leaving half of a mechanic's own block converted and
  half not would itself be the silent mistuning Invariant 3 exists to
  prevent, the moment Phase 7 stops always resolving exactly 30 minutes.
  Two things traced and DELIBERATELY left unconverted, both documented at
  their own definitions: `SOUND_DEVICE_DEFS.music`'s `playerMoodScale`/
  `playerMoodCap`/`wornPlayerMoodTarget` (equilibrium mood-TARGET terms
  `resolveMoodTarget` reads as a steady state, never a per-resolution
  accumulation — not the same shape as the NPC per-tick deltas at all), and
  `THERMOSTAT_TUNING.selfAdjustChancePerTick` (D10's exact single-reader
  precedent: `thermostatSelfAdjustChance(npc)` personality-scales it BEFORE
  any minute conversion could run, so the conversion has to apply to that
  already-scaled per-NPC result at the sim.js call site, not to this raw
  base rate — converting the table itself would be more edited surface for
  identical math). A THIRD candidate, `STEALTH_TUNING.baseEvidenceDiscoveryChance`/
  `evidenceStrengthDiscoveryFactor` (also a flat per-NPC-tick chance,
  read in the same Pass 2 loop's evidence-discovery block), was found but
  NOT converted — it is also read by `computer.js`'s `performCleaningVisit`,
  a per-cleaning-visit-per-room roll with no tick relationship at all, so
  converting the Pass 2 reader safely requires first splitting the shared
  constant into two independently-named ones. Flagged in the Handoff for a
  future session rather than rushed here — this is the one D6-adjacent gap
  that remains open going into Phase 6/7.
  **The chance-conversion formula, used everywhere above and by D6's own
  named chances:** a per-tick chance `p` compounded over 30 one-minute draws
  is NOT the same distribution as one draw at `p` — `chancePerMinute = 1 -
  (1 - p) ** (1/30)`, stored in config.js as the real per-minute number;
  applied via a new `chanceOverMinutes(chancePerMinute, minutes) = 1 -
  (1-chancePerMinute)**minutes` (sim.js, beside `getTickIndex`), which
  collapses to `p` exactly (mod floating point) at `minutes === 30`. Verified
  both exactly (every converted chance reproduces its old literal at 30
  minutes to within `1e-9`) and statistically (20,000 independent draws per
  subsystem against the real config-stored values landed within 0.01 of the
  old rate for all four — `verify-ccc-p5.js` sections 2 and 4).
- **D14 — Two corrections to D7's literal wording, found doing Phase 6
  against the live code rather than guessed.** (1) Broadened "every active
  RESIDENT's commitment" to every ACTIVE npc's commitment — residents AND
  active visitors, reusing the exact same `getActiveVisits`/
  `getActiveNpcIds` (sim.js) `resolveTick` itself iterates. A visiting NPC
  can hold a real `npc.commitment` exactly like a resident (`resolveTick`'s
  own Pass 1 comment: "pinned to it like any committed NPC until their own
  completion"), and `nextDecisionAbs`/`dueForDecision` (cognition.js)
  already read `npc.commitment` uniformly across both — the literal
  resident-only wording would have missed a visitor's own commitment
  ending, the exact "discovered late" bug class Phase 7 exists to close.
  (2) Narrowed D7's "`world.{commitments,visits,deliveries}`" list to just
  commitments and visits. `world.deliveries[]` (computer.js) and
  `world.renovationJobs[]` (same day-rollover path) are DAY-granular
  (`etaDay`/`startDay`) with no `startAbs`/`endAbs` field to read at all —
  D7's premise that deliveries are "already clockToAbsolute-space" does
  not hold live. They also fall outside the problem Phase 7 solves:
  midnight is detected independently every frame by `clockFrame`'s own
  day-crossing check (`time.js`), a mechanism Phase 7 does not touch
  (Invariant 2). This is the one piece of D7 this session found genuinely
  unworkable against live code, resolved the way D10-D13 resolved their
  own plan-vs-code gaps: scope to what the live data actually is. Both
  `world.commitments[]` and `world.visits[]` contribute BOTH `startAbs` and
  `endAbs` (when `> nowAbs`), filtered to live-relevant status only
  (`'scheduled'` for commitments, not `'done'`/`'deferred'` for visits,
  mirroring `getActiveVisits`' own filter) — a window not yet open needs
  `startAbs`, one already active needs `endAbs`; requiring `> nowAbs` on
  both and taking the min picks whichever is still ahead without
  `nextWakeAbs` needing to know which phase a window is in. See the Phase 6
  Handoff notes for the full reasoning and `verify-ccc-p6.js` for the
  proof (sections 3 and 6 specifically target these two corrections).
- **D7 — The next-wake-time primitive is pure and built standalone before
  anything is cut over to it (Phase 6), then wired in a separate phase
  (Phase 7).** `nextWakeAbs(gameState)` returns the soonest absolute minute
  anything needs attention: the minimum of every active resident's
  `commitment.completesAtAbs`, the next 5-minute heartbeat boundary, and any
  other scheduled absolute-minute event already in `gameState.world`
  (deliveries, commitments, visits — all already `clockToAbsolute`-space per
  the original roadmap's Plan 3/the actions-and-activities plan's D37).
  `CLOCK.tickMinutes`/`getTickIndex` may keep existing for bookkeeping
  explicitly out of scope here (day-boundary math, save versioning) — C1 of
  the original roadmap, inherited unchanged, not re-litigated.
- **D8 — `CONTINUOUS-SIMULATION-ROADMAP.md` gets corrected in place once
  Phase 7 lands, not silently and not by deletion.** A dated note under Plan
  1's own description: what the original claim said, what was actually
  true, and a pointer to this plan as the actual closure — matching how this
  project already corrects a stale Data-model sketch (D37/D38 elsewhere)
  rather than pretending it was always right.
- **D15 — `STEALTH_TUNING`'s shared evidence-discovery constant is split,
  closing the top-of-phase blocker carried from the Phase 5 handoff.**
  `baseEvidenceDiscoveryChance` is gone; `roomSearchEvidenceDiscoveryChance`
  (`computer.js`'s `performCleaningVisit`, unchanged value, never
  minute-converted — no tick relationship) and `evidenceDiscoveryChancePerTick`
  (`resolveTick`'s Pass 2, sim.js — minute-converted at the call site, same
  additive-then-convert shape as `thermostatSelfAdjustChance`, D13) replace
  it. `evidenceStrengthDiscoveryFactor` stays unrenamed (D10's precedent —
  sim.js's own single reader). See `verify-ccc-p7.js` section 2.
- **D16 — `resolveTick`/`resolveBatch` cut over to variable-length
  resolution (the actual Phase 7 cutover).** `resolveTick(gameState,
  minutesThisTick = CLOCK.tickMinutes)` — the span is a real parameter now,
  defaulting to the old flat tick so every pre-Phase-7 single-argument
  caller is untouched (Design Invariant 2). `resolveBatch`'s
  `advanceClock !== false` (discrete/action) branch steps by
  `Math.min(nextWakeAbs(state, { includeHeartbeat: false }), nowAbs +
  CLOCK.tickMinutes, nowAbs + remaining) - nowAbs` per call — the soonest
  of a real scheduled completion, the old flat 30-minute cadence, or the
  batch's own remainder — with needs decay taking a PROPORTIONAL (not
  equal) share per step, generalizing needs-and-heartbeat Phase 3/D11's
  "equal division across ticks" now that ticks are no longer uniform size.
  Total clock advance and total needs both stay exactly what they were
  (Invariant 1's own sibling for this cutover: same total, finer internal
  grain) — only the number and size of intermediate calls changed. The
  `advanceClock === false` (TIME's `runSimCheckpoint`) branch collapses to
  ONE `resolveTick` call over the true `opts.needsMinutes` span, replacing
  a loop of identical-rng-seed calls (meta.clock never moved between them
  on this path, so every iteration used to replay the same draws). New
  helper `advanceClockByMinutes` (sim.js, beside `advanceClock`) is the
  per-step clock advance. `time.js`'s `runSimCheckpoint` now threads the
  true accumulated minutes through as `needsMinutes` instead of a
  lossily-rounded tick count; `clockFrame`'s checkpoint gate gained
  `nextCheckpointWakeAbs`, computed the same
  `Math.min(nextWakeAbs(..., { includeHeartbeat: false }),
  nowAbs + simCheckpointMinutes)` way, right after each checkpoint
  resolves. See `verify-ccc-p7.js` sections 1/3/4/5/6/7 and the Handoff's
  own measured before/after.
- **D17 — `nextWakeAbs` gained `opts.includeHeartbeat` (default `true`,
  every pre-Phase-7 caller untouched).** Found wiring D16, not guessed:
  `nextWakeAbs`'s own unconditional heartbeat-boundary fallback (D7) means
  its raw default is never more than `HEARTBEAT_MINUTES` (5) away, even
  with nothing real scheduled anywhere near that soon. Using that raw
  default directly as `resolveBatch`'s step bound re-evaluates every
  UNCOMMITTED NPC's Pass 1 far more often than the old flat 30-minute
  cadence (`dueForDecision`: no commitment = always due) — measured
  breaking wander movement directly (`verify-ccc-p4.js`: a wander walk is
  tens of real-seconds long, so it lands almost immediately, then a
  subsequent ~5-minute step re-rolls a fresh target from the just-arrived
  position, repeatedly, inside what used to be one 30-minute decision).
  `includeHeartbeat: false` returns the soonest REAL candidate only (or
  `+Infinity`, deliberately not special-cased, when none exists — every
  caller of this branch immediately `Math.min()`s it against its own flat-
  cadence fallback), letting D16's stepping fall back to the OLD flat
  cadence when nothing real is sooner instead of being forced onto the
  heartbeat's. See `verify-ccc-p7.js` section 6b for the option itself and
  the Phase 4 regression note above for the bug it fixes.

### Ambient narration (Phase 8)
- **D9 — The "meanwhile" ticker surfaces only REAL, already-recorded world
  events, never generates new content.** Reads `gameState.world.events`
  (the same `newEvents`/`EVENT_IMPORTANCE`/`EVENT_EMOTION` stream chatter,
  memory, and tracker already consume) since the player's last action,
  filtered to events in rooms the player could plausibly have perceived
  something about (adjacent rooms, same signal-layer reasoning
  `perceiveSignals` already uses) and above a minimum importance band so
  idle ticks don't spam "someone did laundry" every few minutes. Zero new
  LLM calls, zero new event types — a deterministic surface over data that
  already exists, same "decide before decorate" discipline every other
  system here follows.
- **D18 — The ambient ticker (D9) never considers the player's own current
  room; `surfaceRoomEvidence` (ui.js, pre-existing) keeps sole ownership of
  same-room narration.** Found live doing Phase 8, not guessed: letting the
  ticker also cover "here" raced `surfaceRoomEvidence` inside the SAME
  `doLookAround`/`doMove` call — an earlier, unrelated `addLogEntry` call in
  those functions (the room description / walk narration) triggers its own
  scene re-render before `surfaceRoomEvidence`'s own explicit call runs,
  which let the ticker "steal" (mark `seenByPlayer`, with only a
  same-render-frame-invisible DOM flash — never a durable `sessionLog` line)
  the most recent same-room qualifying event moments before
  `surfaceRoomEvidence` would otherwise have claimed and durably narrated
  it. Fixed by excluding `evt.roomId === roomId` from
  `composeMeanwhileTicker`'s candidates entirely — zero overlap with
  `surfaceRoomEvidence`, zero race, by construction rather than by careful
  ordering. The "or simply idling [in your own room]" half of D9's Goal this
  exclusion would otherwise drop is covered instead by
  `advanceAndResolve` (ui.js) calling `surfaceRoomEvidence(currentGameState.
  player.location)` directly, gated to the idle/continuous checkpoint path
  only (`!advanceClockToo`, i.e. `opts.advanceClock === false` — Phase 7's
  own D16 branch condition) — reusing the existing, already race-free
  mechanism (Design Invariant 4) rather than teaching the ticker to
  duplicate it. See the Phase 8 Handoff notes (point 3) and
  `verify-ccc-p8.js` sections 2 and 9 for the full reasoning and proof.

---

## Data model

### Scene presence reconciliation (Phase 1 — as actually built)
```js
// llm.js — PRE-EXISTING, not new. This phase's real work was calling it
// from advanceAndResolve (ui.js), not writing it.
function reconcileScenePresence(sceneState, gameState) { /* ... */ }
```
```js
// npc.js — demoteToAmbient's sibling, genuinely new. Drops from ALL of
// present/active/ambient/engagement, unlike demoteToAmbient which only
// ever re-tiers within active/ambient.
function removeFromScene(sceneState, npcId) {
  const engagement = { ...(sceneState.engagement || {}) };
  delete engagement[npcId];
  return {
    ...sceneState,
    present: (sceneState.present || []).filter(id => id !== npcId),
    active: sceneState.active.filter(id => id !== npcId),
    ambient: sceneState.ambient.filter(id => id !== npcId),
    engagement,
  };
}
```

### Next-wake-time primitive (Phase 6 — as actually built, D14; not wired until Phase 7)
```js
// sim.js, right after chanceOverMinutes — pure, nothing calls it yet.
// D14 (see Locked decisions): broadened resident-only to every ACTIVE npc
// (residents + active visitors, via getActiveVisits/getActiveNpcIds —
// the same index resolveTick itself iterates); narrowed deliveries out
// (day-granular, no startAbs/endAbs, and midnight is detected elsewhere).
// Every candidate must be STRICTLY future (> nowAbs) — an overdue term is
// dueForDecision's domain, not this function's.
function nextWakeAbs(gameState) {
  const nowAbs = gameState.meta.clock.day * 1440 + gameState.meta.clock.minutes; // inlined: sim.js never calls time.js's clockToAbsolute
  const candidates = [];
  for (const id of getActiveNpcIds(gameState, getActiveVisits(gameState))) {
    const c = gameState.npcs[id] && gameState.npcs[id].commitment;
    if (c && Number.isFinite(c.completesAtAbs) && c.completesAtAbs > nowAbs) candidates.push(c.completesAtAbs);
  }
  for (const c of (gameState.world?.commitments || [])) {
    if (c.status !== 'scheduled') continue;
    if (c.startAbs > nowAbs) candidates.push(c.startAbs);
    if (c.endAbs > nowAbs) candidates.push(c.endAbs);
  }
  for (const v of (gameState.world?.visits || [])) {
    if (v.status === 'done' || v.status === 'deferred') continue;
    if (v.startAbs > nowAbs) candidates.push(v.startAbs);
    if (v.endAbs > nowAbs) candidates.push(v.endAbs);
  }
  const hb = TIME_DILATION.HEARTBEAT_MINUTES;
  candidates.push(nowAbs + (hb - (nowAbs % hb))); // always present, always future — the guaranteed fallback
  return Math.min(...candidates);
}
```

### Per-minute Pass 2 rates (Phase 5 — as actually built, D6 + D13)
```js
// config.js — every *PerTick key this phase converts gains a *PerMinute
// sibling (old key kept until every call site migrates, then removed —
// no silent dual-definition left behind at phase end). D6's original six,
// plus D13's six same-block siblings the plan's own audit missed:
DIRT_TUNING.footTrafficPerTick   → footTrafficPerMinute   (÷ 30)
SOUND_DEVICE_DEFS.music.keepItDown.chancePerTick → chancePerMinute (chance formula, see D13)
SOUND_DEVICE_DEFS.music.npcMoodPerIntensity/npcMoodCap → *PerMinute (÷ 30, D13)
SOUND_DEVICE_DEFS.headphones/mp3_player.npcMoodGainPerTick → npcMoodGainPerMinute (÷ 30, D13)
THERMOSTAT_TUNING.complainChancePerTick          → complainChancePerMinute (chance formula)
THERMOSTAT_TUNING.annoyanceMoodDeltaPerDegree/annoyanceMoodDeltaCap → *PerMinute (÷ 30, D13)
THERMOSTAT_TUNING.selfAdjustChancePerTick stays UNRENAMED (D13 — single reader,
  personality-scaled before conversion can run; see D13's own reasoning)
PARTY_TUNING.dirtPerTickPerGuest / attendeeMoodPerTick / complainChancePerTick
  → dirtPerMinutePerGuest / attendeeMoodPerMinute / complainChancePerMinute
PARTY_TUNING.annoyanceMoodPerIntensity/annoyanceMoodCap → *PerMinute (÷ 30, D13)
// The old bare inline `0.15` ambient-event roll (sim.js) is now a named
// OFFSCREEN_EVENT_TUNING.chancePerMinute (config.js, beside OFFSCREEN_EVENTS).
// Deterministic amounts applied as ratePerMinute × minutesThisTick.
// Chances applied via the new chanceOverMinutes(chancePerMinute, minutes)
// helper (sim.js, beside getTickIndex) — see D13 for the formula.
// NOT converted: SOUND_DEVICE_DEFS.music's playerMoodScale/playerMoodCap/
// wornPlayerMoodTarget (equilibrium targets, not per-tick deltas) and
// STEALTH_TUNING.baseEvidenceDiscoveryChance/evidenceStrengthDiscoveryFactor
// (shared with an unrelated per-cleaning-visit reader — flagged, not fixed;
// see the Phase 5 Handoff note).
```

### The ambient "meanwhile" ticker (Phase 8 — as actually built, D9 + D18)
```js
// meanwhile.js (new file) — pure, called from scene.js's composeScene.
// D18: NEVER the player's own room — surfaceRoomEvidence (ui.js) owns that,
// and letting this ticker also claim it raced it. See the Handoff notes.
function meanwhilePerceivableRooms(gameState, roomId) {
  const out = new Set([roomId]); // reachMultipliers' own seed; harmless — composeMeanwhileTicker skips roomId explicitly before ever consulting this set
  for (const channel of MEANWHILE_TUNING.channels) { // ['smell','sound','sight']
    for (const r of Object.keys(reachMultipliers(gameState, roomId, channel))) out.add(r);
  }
  return out;
}
function composeMeanwhileTicker(gameState, roomId) {
  const events = Array.isArray(gameState.world?.events) ? gameState.world.events : [];
  const reach = meanwhilePerceivableRooms(gameState, roomId);
  let best = null;
  for (const evt of events) {
    if (!evt || evt.seenByPlayer) continue;
    if (!evt.roomId || evt.roomId === roomId) continue; // D18's exclusion
    if (!reach.has(evt.roomId)) continue;
    if (!EVENT_IMPORTANCE[evt.type]) continue; // same floor as chatterBestCandidateForDay
    if (!best || evt.day > best.day || (evt.day === best.day && evt.tick > best.tick)) best = evt;
  }
  if (!best) return null;
  return { roomId: best.roomId, line: `Meanwhile, in the ${ROOMS[best.roomId]?.name || best.roomId}: ${formatEventText(best, gameState.npcs)}`, evt: best };
}
// The one write — mirrors markCalloutsShouted/markDoorCuesShown exactly.
function markMeanwhileShown(gameState, meanwhile) {
  if (meanwhile?.evt) meanwhile.evt.seenByPlayer = true;
}
// scene.js's composeScene: `meanwhile: composeMeanwhileTicker(gameState, roomId)`
// render.js's render() and ui.js's addLogEntry both call, right after
// markDoorCuesShown: `markMeanwhileShown(gameState, composedScene?.meanwhile);`
// ui.js's advanceAndResolve — D18's same-room-idling coverage, gated to the
// idle/continuous checkpoint path only:
//   if (!advanceClockToo) surfaceRoomEvidence(currentGameState.player.location);
```

---

## Implementation phases

### Phase 1 — Scene presence reconciliation & departure integrity
**Goal.** An NPC's scene cutout and the Social tab's chip list never lag
more than the time to the next reconciliation call behind live
`npc.location`; a conversation can never be opened (fresh or resumed) with
someone not actually in the room.
**Files.**
- `ui.js`: call the pre-existing `reconcileScenePresence` (llm.js) at the
  end of `advanceAndResolve`, before `checkConversationWalkOut()`, on both
  the discrete and idle-checkpoint paths — renders when presence actually
  shrank; a new presence gate at the very top of `doTalk`, before
  `notePlayerAddressed`, refusing with narration when
  `conversationPartnerPresent` is false instead of proceeding to
  `promoteToActive`/`openConversationOverlay`; `endDepartureConversation`
  and the `[Join]` button handler's `demoteToAmbient` calls swapped to
  `removeFromScene` outright (both only ever run when the NPC is already
  confirmed absent — no runtime branch needed). `actions.js` needed no
  separate change — it reads the same shared `currentSceneState` global
  `advanceAndResolve` already reconciled by the time it renders.
- `npc.js`: new `removeFromScene`, `demoteToAmbient`'s two legitimate
  callers (`doConvLeave`, `doStepAway`) left untouched.
**Verification.** `node src/src/dev/verify/verify-ccc-p1.js` (7/7 — the pure
building blocks; `doTalk`/`conversationPartnerPresent` live in ui.js, which
isn't Node-loadable, see the harness's own header). Live-verified in
`dev-harness.html` per the Handoff note above — confirmed with real
before/after DOM counts and console state, not just visual inspection.

### Phase 2 — SCHEDULES fallback: continuous-minute reindex
**Goal.** `resolveScheduleActivity`'s no-commitment fallback resolves the
correct block for any absolute minute without consulting `getTickIndex`.
**Files.**
- `sim.js`: `resolveScheduleActivity`'s block-range loop reads
  `[startMinute,endMinute)` against `clock.minutes` (or an absolute-minute
  equivalent) instead of `[start,end)` tick indices from `getTickIndex`.
- `config.js`: `SCHEDULES` templates' ranges re-expressed in minutes (same
  technique `COMMITMENT_TUNING.mealSlots`/`COMMITMENT_KINDS.hangout.slots`
  already used, per the original roadmap's Addendum).
**Verification.** A harness proving every existing schedule template
resolves the IDENTICAL block at every minute of a full day, before and
after — behavior-invisible by construction (this phase's whole point is
representation, not behavior, per invariant D3).

### Phase 3 — Needs decay path unification
**Goal.** The discrete (player-action) path applies needs decay in one
closed-form call at the exact elapsed minutes, matching the idle path's
5-minute heartbeat granularity instead of 30-minute lumps.
**Files.**
- `sim.js`: `resolveBatch`'s per-tick `applyNeedsHeartbeat(state,
  CLOCK.tickMinutes, ...)` loop call replaced with one call at the real
  span being resolved.
**Verification.** A harness proving identical total decay over a fixed span
regardless of how many discrete actions it was split across (2×15-minute
actions must equal 1×30-minute action, exactly — the closed-form
invariant), plus the existing needs-and-heartbeat-plan harnesses still pass
unchanged.

### Phase 4 — Continuous wander movement
**Goal.** An NPC with no active commitment, walking toward a chosen
destination, moves at the same real-seconds, distance-proportional rate a
committed NPC already does — never a flat one-room-per-tick jump.
**Files.**
- `sim.js`: Pass 1's wander-transit branch (`npc.transit.progress` stepping)
  replaced with opening a real `npc.walk` via the same `planWalk`
  (movement.js) commitment-anchored movement already calls.
**Verification.** A harness timing a 3-room wander and confirming it now
takes the same duration `WALK.secondsPerRoom.npc`-based math would predict
for a committed walk of the same distance, not a flat 90 minutes.

### Phase 5 — Per-minute conversion of Pass 2's remaining flat rates
**Goal.** Every subsystem D6 names resolves identically to its current
behavior when given exactly 30 minutes (regression-proof), and correctly
scales for any other span — the load-bearing prerequisite for Phase 7.
**Top-of-phase blocker:** this phase must re-run `verify-aa-p17.js` (the
house-party mechanic, which rides this exact Pass 2 loop) as part of its own
verification — a silent regression there would be discovered phases later
otherwise, the exact failure mode `PLAN-ARCHITECTURE.md` warns about.
**Files.**
- `config.js`: the `*PerMinute` siblings from the Data model section.
- `dirt.js`, `sim.js`: `bumpRoomDirt` call sites scale by minutes resolved.
- `sim.js`: the music/thermostat/party complaint chance rolls become
  probability-per-minute (a per-tick chance `p` over `n` whole-tick calls is
  NOT the same distribution as one chance over `n` ticks' worth of minutes —
  this phase must get that math right, most likely `1 - (1-perMinute)^
  minutes`, and prove it statistically matches the old per-tick roll's rate
  at exactly 30 minutes before trusting it at any other span).
**Verification.** Per-subsystem harnesses proving old-vs-new behavior
matches at 30 minutes exactly (statistically, for the chance-based ones —
large-N comparison, not a single seed), PLUS `verify-aa-p17.js` unchanged.

### Phase 6 — The next-wake-time primitive
**Goal.** `nextWakeAbs(gameState)` exists, is pure, and is proven correct
against constructed scenarios — but nothing calls it yet from the real
resolution path.
**Files.**
- New function per the Data model section — real home decided this phase
  (`sim.js` is the likely candidate given `resolveTick`/`resolveBatch`
  already live there, but check for a natural existing module first, same
  "don't create a new file just because a draft guessed one" discipline
  every other plan in this project follows).
**Verification.** A harness constructing gameStates with known soonest
commitment/heartbeat/event times and asserting `nextWakeAbs` returns exactly
that minute, across several scenarios including ties and the
no-one-has-anything-scheduled fallback (must still return the heartbeat
boundary, never null/undefined).

### Phase 7 — Cut over: variable-length resolution
**Goal.** `resolveBatch`/`advanceAndResolve` resolve UP TO `nextWakeAbs`'s
answer, not always exactly one 30-minute tick; the flat
`simCheckpointMinutes` poll stops being the sole discovery mechanism. A
commitment ending at `:47` is discovered and acted on at `:47`, not the next
`:00`/`:30`.
**Top-of-phase blocker:** everything Phase 5 converted must already be
merged and verified — this phase is where an unconverted flat-rate
subsystem would silently mistune for the first time in a way no earlier
phase's own verification would catch (it would only show up as "the party
gets messier when it runs long" or similar, phases later).
**Files.** `sim.js` (`resolveBatch`'s tick-stepping loop),
`time.js` (`advanceAndResolveMinutes`/`clockFrame`'s checkpoint gate).
`CLOCK.tickMinutes`/`getTickIndex` may keep existing per D7/C1 — this phase
removes their role as the RESOLUTION trigger, not their existence.
**Verification.** The single most important round-trip in this whole plan:
construct a commitment ending at a non-tick-boundary minute, confirm it is
discovered and the NPC relocated at THAT minute (not the next grid line),
across both the discrete and idle paths. Full `run-all.js` unfiltered sweep
against this plan's own recorded baseline (Phase 1's harness count onward)
— any regression outside this plan's own new/touched files is a stop-and-
investigate per the actions-and-activities plan's own precedent for exactly
this check.

### Phase 8 — Ambient "meanwhile" scene-text ticker
**Goal.** Returning to a room (or simply idling) after real time has passed
surfaces a short, deterministic line about anything perceptible that
happened while the player wasn't acting — never fabricated, never an LLM
call.
**Files.**
- New module (real home decided this phase) reading `gameState.world.events`
  per D9; a render.js hook for where the line actually appears (likely the
  scene's own establishing passage, alongside the existing signal-derived
  ambient lines — read `SCENE_READER`/`composeScene` first, don't invent a
  second slot).
**Verification.** A harness proving the ticker surfaces a real recorded
event above the importance floor and stays silent when nothing crossed it;
live-verified for placement/readability in `dev-harness.html`.

### Phase 9 — Documentation correction
**Goal.** `CONTINUOUS-SIMULATION-ROADMAP.md`'s Plan 1 description no longer
overstates what shipped.
**Files.**
- `CONTINUOUS-SIMULATION-ROADMAP.md`: a dated correction note under Plan 1's
  own description per D8 — what it claimed, what was true, pointer to this
  plan.
**Verification.** None (docs-only) — the correction itself IS the
deliverable; re-read it once written to confirm it doesn't overstate in the
opposite direction either (this plan's own real, narrower scope).

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done 2026-09-02 | Scene presence reconciliation & departure integrity |
| 2 | Done 2026-09-02 | SCHEDULES fallback: continuous-minute reindex |
| 3 | Done 2026-09-02 | Needs decay path unification |
| 4 | Done 2026-09-02 | Continuous wander movement |
| 5 | Done 2026-09-02 | Per-minute conversion of Pass 2's flat rates |
| 6 | Done 2026-09-02 | The next-wake-time primitive (standalone) |
| 7 | Done 2026-09-02 | Cut over to variable-length resolution |
| 8 | Done 2026-09-02 | Ambient "meanwhile" scene-text ticker |
| 9 | Done 2026-09-02 | Documentation correction |

## Dependency order

```
Phase 1 (presence bug fix)         — independent, ship first
Phase 2 (SCHEDULES reindex)        — independent
Phase 3 (needs unification)        — independent
Phase 4 (wander movement)          — independent
                                       │
Phase 5 (per-minute Pass 2 rates) ────┤ (prerequisite for Phase 7 — see D6)
Phase 6 (next-wake-time primitive) ───┤ (no hard code dependency on 5, but
                                       │  pointless to wire before Phase 7
                                       │  can safely use it)
Phase 7 (variable-length cutover) ────┘ needs BOTH 5 and 6 merged first
        │
        ├─► Phase 8 (ambient ticker) — technically buildable earlier, but
        │   far more valuable once Phase 7 makes "idle time" genuinely
        │   eventful again
        └─► Phase 9 (doc correction) — always last; describes the landed
            state, not an aspiration
```

Phases 1-4 may be worked in any order, including out of numeric order,
since none of them touch Pass 2's tick-rate math or the resolution loop
itself. **Never start Phase 7 before Phase 5 and Phase 6 are both merged and
independently verified** — this is the one hard prerequisite in this plan,
for the exact silent-mistuning reason D6/Phase 5's blocker note spells out.

## Open questions (parked — none blocking)

- ~~Phase 6's real module home.~~ Resolved (Phase 6, 2026-09-02): `sim.js`,
  right after `chanceOverMinutes` — see D14 and the Data model section.
- ~~Phase 8's exact render slot.~~ Resolved (Phase 8, 2026-09-02): its own
  `.sr-meanwhile` div (render.js), placed right after the sensory loop in
  the establishing passage — never folded into the existing signal-derived
  ambient passage. See D18.

## Design invariants

1. **A conversion phase (2, 3, 4, 5) is behavior-invisible by construction.**
   If verification produces a different wall-clock outcome than the old
   tick-indexed version would have, the conversion is wrong. Inherited from
   `CONTINUOUS-SIMULATION-ROADMAP.md`'s own invariant #1, restated because
   every phase in this plan depends on it holding.
2. **`resolveTick`'s Pass 1/2/3 internal CONTRACT never changes — only what
   span of time it's asked to resolve does.** Every other system built on
   top of "resolveTick resolves some world state" (my own recent house-party
   mechanic included) keeps working unmodified once Phase 5's rates are
   correct; this plan is not a rewrite of what Pass 2 computes, only of the
   units its flat constants are expressed in and the cadence that triggers
   it.
3. **Never cut Phase 7 in before Phase 5 is verified.** The scar this
   invariant exists to prevent: a flat "per 30-minute tick" rate silently
   over- or under-firing the moment the calling span stops always being 30
   minutes, discovered not by any test but by a player noticing the numbers
   feel wrong weeks later.
4. **The scene-presence reconciliation this plan's Phase 1 builds is a
   PRESENTATION-layer concern, never a second copy of `getPresentNpcIds`'s
   own live-location logic.** `reconcileScenePresenceForRoom` calls the
   existing reader; it does not reimplement "who's actually in this room."
5. **No new LLM calls, ever, for anything this plan adds.** The ambient
   ticker (Phase 8) is a deterministic surface over already-recorded events,
   full stop — "decide before decorate" applies here exactly as it does to
   every ask leaf and stealth mechanic elsewhere in this codebase.
