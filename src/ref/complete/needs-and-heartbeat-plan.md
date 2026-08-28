# Needs and the simulation heartbeat

Status: **built** — all 4 phases (rate conversion, heartbeat accumulator, closed-form fast-forward + phone/memory, and the Phase-4 tuning pass that confirmed the value) complete and verified. Design session complete 2026-08-14; all decisions locked. A 2026-08-15 completeness audit found and fixed a real gap in Phase 3 — see Addendum.
Last updated 2026-08-15.

Companions:
- `CONTINUOUS-SIMULATION-ROADMAP.md` (the umbrella — implements C1, C6, C7).
- `continuous-behavior-engine-plan.md` (the sibling this plan is cut apart
  from: that plan owns *what an NPC is doing*; this plan owns *how their
  needs move while they do it*. Split into separate documents because they
  touch different code — behavior touches `cognition.js`/`sim.js`'s
  activity resolution, this touches `NEEDS`/`decayPlayerNeeds`/
  `resolveTick`'s needs-decay half — not because they're unrelated).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else.**

---

## Handoff — read this first

**Resume at:** nothing — the plan is complete (all four phases Done, see
Status). The open question about the heartbeat cadence was answered in
Phase 4 and promoted to a locked decision (D8). There is no further work
in this document; later sessions should pick up the next not-Done row in
`CONTINUOUS-SIMULATION-ROADMAP.md`'s checklist (`external-world-retiming`
Phase 1 is the next pending row).

**Addendum (2026-08-15, completeness audit).** Two real gaps found and
fixed, both in Phase 3's territory (phone battery / memory decay joining
the heartbeat), neither in the headless `dev/verify` suite's reach (both
live in `ui.js`/`time.js`, which need `currentGameState`/DOM and were
verified live in `dev-harness.html` instead):

1. **The discrete path's phone-battery/memory-decay hook only fired when
   `advanceAndResolveMinutes` crossed at least one 30-minute tick boundary**
   (`ticks > 0`), while `decayPlayerNeeds` — right beside it, same
   function — always ran on the exact requested span. A short action (a
   note read, a door lock, any span under `CLOCK.tickMinutes` that
   doesn't straddle a boundary) silently skipped both for its whole
   duration; a subtler version of the same bug applied even when
   `ticks > 0`, because `advanceAndResolve`'s existing hook scaled by
   `ticks * CLOCK.tickMinutes` — a grid-boundary-crossing COUNT, not a
   duration — which diverges from the true elapsed span whenever the span
   doesn't start on a tick boundary. Fixed by threading the exact minute
   count through as an explicit `needsMinutes` option (`ui.js`'s
   `advanceAndResolve`, defaulting to the old `ticks*tickMinutes` shape so
   every one of its dozen-plus direct tick-count callers is unaffected)
   and applying it directly in the `ticks === 0` branch
   `advanceAndResolveMinutes` used to skip entirely. Verified live: a
   10-minute span starting mid-tick (`ticks: 0`) now drains phone battery
   by the correct fractional amount instead of leaving it frozen.
2. **`NEEDS.energy/hygiene/comfort/stimulation.decayPerMinute`** — added
   in Phase 1 "to sit alongside the per-tick forms... until the heartbeat
   switches readers over" — **were never read anywhere.** `decayPlayerNeeds`
   kept the per-tick rate and multiplies by a fractional tick count
   instead (byte-exact with old saves, no rebalance); `applyNeedsHeartbeat`'s
   NPC path reads its own separate `npc*PerMinute` constants. Confirmed
   dead by a whole-codebase grep (including `dev/verify/`) and removed,
   per the same precedent as the NPC correctness plan's Phase 5
   dead-field triage.

**Last session's notes (Phase 4 — tuning, 2026-08-14 — complete and
verified):**
- `HEARTBEAT_MINUTES` was **retuned 1 → 5** (config.js). The parked open
  question ("Is 1 minute the right heartbeat, or is 5 indistinguishable
  and cheaper?") is answered with live evidence: 5 is byte-identical in
  every outcome and 5× cheaper (288 vs 1440 heartbeat calls/day).
- **Verification (all `browser_eval` against the real live engine — the
  Node `dev/verify` suite is unavailable here, so the checks were ported
  via the translation rule; page reloaded clean each time, no
  syntaxErrors/perchanceErrors, final `browser_refresh` clean):**
  - Test 1 — cost: timing `applyNeedsHeartbeat(state, 1, {idle:true})` on
    the real 5-resident house → **0.0645 ms/call**. At idle scale 20 (1 gm
    per 3 real-sec), a 1-min heartbeat fires every 3 real-sec ≈ **~77 ms
    of CPU per real hour of idle play**; 5-min ≈ ~15 ms/hr. Both
    negligible — cost was never the deciding axis, identity was.
  - Test 2 — chunking identity, static state: 1440×`(1 min)` vs 288×
    `(5 min)` vs 48×`(30 min)` over a full day on the same clone →
    **maxNpcDiff ≈ 1e-13** (pure float noise), player needs diff 0, mood
    diff **0.0002** only at 30-min chunking (mood eases toward a moving
    target each call — the one non-linear consumer; at 5-min the diff was
    1.8e-6, invisible).
  - Test 3 — chunking identity, WITH checkpoint block transitions: a full
    simulated day where `schedule.currentBlock` flips (sleep/morning/
    commute/work/evening/wind_down) every 30 gm, exactly as the real sim
    checkpoint rewrites it → **maxNpcNeedDiff 0.0 for 1-vs-5 AND
    1-vs-30**. Restore keys only change at checkpoints (30 gm), so no
    heartbeat span ever straddles a restore-key change; the cadence
    genuinely cannot differ from the closed form.
  - Test 4 — float accumulation robustness: the heartbeat accumulator
    math at scales 1/60, 10, 20, 25, 30 → **exactly 1440 fires/day at
    1-min, 288 at 5-min, 48 at 30-min, zero drift**, at every scale.
  - Test 5 — live continuous path at the NEW value: rebuilt a real
    5-resident house in the page, set `TIME_DILATION.HEARTBEAT_MINUTES`
    to 5, drove 500 gm through the REAL funnel (heartbeat every 5 gm →
    `applyNeedsHeartbeat` + `advancePhoneBattery` + `decayAllMemories`;
    checkpoint every 30 gm → real `runSimCheckpoint`), then compared
    against an identical 500-gm run at 1-min: **maxNpcNeedDiff 0, NPC
    mood diff 0, player energy/mood diff 0** — byte-identical end state.
    Uniform per-minute decay confirmed at scale 400 live (NPC energy
    −0.0647/gm vs the exact 2/30 rate) and the earlier 1-min live pass
    (player energy −0.11 over 8 gm ≈ −0.133 expected with idle mult).
  - Why 5 and not 30 (both are byte-identical): the plan proposed 1, the
    open question asked about 5, and 30-min would collapse the heartbeat
    onto the checkpoint cadence itself — 5 keeps the heartbeat visibly
    finer than the 30-min sim checkpoints (freshness margin for any
    future reader) at a cost that's still immaterial. A need surfaces as a
    5%-bucketed bar; decision reads happen at ≥30-gm cadence; nothing
    reads needs at a finer granularity than 5 gm anywhere in the game.
- config.js comment for `HEARTBEAT_MINUTES` rewritten to state the Phase-4
  result and cite D8; `?v=` bumped config 103 → 104 in index.html.
- **Observation worth knowing (not a blocker): the need bars in the footer
  do NOT move during pure idle play.** The continuous loop's clockFrame
  only calls `updateClockDisplay` + `renderFloorPlanLive` per frame; the
  full `render()` (which draws `renderStatusStrip`) runs only on player
  actions. So while the player idles, `currentGameState` needs decay at
  per-minute cadence but the visible bars sit frozen until the next
  action. This is D12's design ("static layer renders on real state
  changes only") and pre-dates this plan's Phase 3, so it is NOT a
  regression to fix here — flagging it for whoever does the behavior-engine
  plan's Phase 6 live pass (the natural owner of "what should the player
  see during idle" questions). Verified live: energy 69→66 in state while
  the bar stayed 70%.

**Blockers / flagged deviations:**
- The Node `dev/verify/*.js` suite cannot be executed in this environment
  (no Node/shell). Its checks were translated to `browser_eval` against the
  live engine per the roadmap's translation rule; the numbers above are the
  real measured ones. A future Node-capable session may re-run the suite
  for extra confidence, but nothing in it reads `HEARTBEAT_MINUTES`, so
  the retune cannot break its assertions.
- No files were added this session → no `loadgame.js` ORDER / index.html
  script-tag updates needed. (Only config.js was edited — a value change
  plus comment — and index.html's `?v=` for it.)
- The Phase-3 flagged finding still stands for any future work that calls
  bare `resolveTick`: needs no longer live there at all, so a bare
  `resolveTick` + the pass-3 carry freezes needs. Drive the funnel
  (`resolveBatch`) instead. Not re-litigated in Phase 4.

---
## The thesis

`resolveTick` decays every active NPC's needs once per 30 simulated
minutes, inside the same loop that used to decide their schedule block.
`continuous-behavior-engine-plan.md` takes that loop apart — decisions
happen when a commitment completes, not on a fixed grid. Needs decay
cannot ride along with that split for a simple reason: it has to keep
moving even while an NPC is deep inside a two-hour "go to work" commitment
with no decision points along the way. Decay needs its **own** cadence,
independent of when decisions happen.

That cadence does not need to be every rendered frame. A need only ever
surfaces as a rounded percentage bar; recomputing it 60 times a second
buys nothing a once-a-simulated-minute heartbeat doesn't already deliver,
at a cost that scales with cast size for zero visible benefit.

### What this plan is *not*

- **Not a rebalance.** Every rate conversion here is mechanical
  (`decayPerTick ÷ 30 = decayPerMinute`). None of the hard-won tuning from
  the correctness plan's Phase 4 rebalance is being revisited.
- **Not a change to `HUNGER_RHYTHM`'s own model** — hunger stays derived,
  untouched by this plan's per-minute conversion.
- **Not per-frame.** Rejected explicitly in this session's second design
  round — see Locked decisions.

## Evidence

Current rates, read directly from `config.js`'s `NEEDS` block
(config.js:1754–1810) rather than recalled:

| Need | Field | Value | Unit today |
|---|---|---|---|
| Player energy | `energy.decayPerTick` | 2 | per 30-min tick |
| Player hygiene | `hygiene.decayPerTick` | 1 | per 30-min tick |
| Player hunger | *(none — derived via `HUNGER_RHYTHM`)* | — | continuous already |
| NPC energy | `npcEnergyDecay` | 2 | per tick |
| NPC hunger | `npcHungerDecay` | 1.5 | per tick |
| NPC hygiene | `npcHygieneDecay` | 1 | per tick |
| NPC social | `npcSocialDecay` | 1 | per tick |
| NPC comfort | `npcComfortDecay` | 0.5 | per tick |
| NPC stimulation | `npcStimulationDecay` | 1 | per tick |
| Idle decay multiplier | `idleDecayMultiplier` | 0.25 | applies to minutes spent idling (continuous loop's sim checkpoints) vs. acting |

Also tick-quantized, confirmed by grep, folded into this plan's scope
rather than a separate document since they're the same mechanism (a rate
applied "per sim checkpoint"): phone battery drain/charge (`PHONE` config)
and memory decay (called from `advanceAndResolve`'s per-checkpoint layer,
UI section).

---

## Locked decisions

- **D1 — A new `HEARTBEAT_MINUTES` constant** (proposed value: 1
  simulated minute — confirmed or retuned in Phase 3's live pass) drives
  decay/restoration, phone battery, and memory decay. One heartbeat, three
  consumers — not three independently-cadenced systems.
- **D2 — The heartbeat is one more accumulator inside the existing
  continuous loop**, alongside `clockFrame`'s own `simCheckpointMinutes`
  threshold (time.js:189) — not a second rAF registration, not a new
  timer. When accumulated game-minutes cross `HEARTBEAT_MINUTES`, fire the
  decay pass for that many minutes' worth.
- **D3 — Every `decayPerTick` becomes `decayPerMinute` by dividing by
  `CLOCK.tickMinutes` (30).** Mechanical, stated once here so no phase
  re-derives it differently. `hunger` is explicitly excluded — see
  Handoff.
- **D4 — Fast-forward resolves decay in closed form, never by looping the
  heartbeat.** `elapsed_minutes × decayPerMinute`, clamped to the need's
  floor/ceiling — the exact shape `decayPlayerNeeds`'s existing `ticks`
  multiplier already has, generalized to a `minutes` multiplier. An
  8-hour sleep jump is one multiplication per need, not 480 heartbeat
  iterations. This is C7 from the umbrella, restated with this plan's
  actual formula.
- **D5 — Restoration keeps its current trigger shape, retimed.** Needs
  are restored by *what an NPC is doing* (sleep → energy, a meal → hunger,
  a shared room → social, a functional comfort facility → comfort) — this
  doesn't change. What changes is the restoration amount being expressed
  per-minute (or, for actions with a real duration from the behavior-
  engine plan, applied once on completion scaled by that action's real
  duration) rather than per-tick.
- **D6 — The idle-decay multiplier's *meaning* survives, its trigger
  changes.** Today it distinguishes "minutes spent idling on the
  narration log" from "minutes spent taking actions" via the continuous
  loop's sim checkpoints specifically. Under the heartbeat model this
  becomes: any heartbeat tick where the player issued no action since the
  last one applies the multiplier; a heartbeat tick that lands inside an
  executing action does not.
- **D7 — The closed form is a NET per-minute rate, applied once.** The
  decay-and-restore pair for one need over `minutes` is
  `value + (restorePerMinute − decayPerMinute) * minutes`, clamped to
  [0, max] — NOT decay-then-restore. Decaying the whole span first (floor
  at 0) and then restoring on the clamped zero overcounts restore for any
  need that dips to its floor mid-span (measured: stimulation at 25 in a
  leisure block over a day landed at 96 instead of the correct 73). The
  net form is the closed form of per-minute interleaving, and it equals
  the old per-tick path exactly in steady state (verified maxDiff 0.0
  across 1–96-tick spans). D4's `elapsed_minutes × decayPerMinute` and
  D5's per-minute restore both compose into this one expression; Phase 3
  should reuse `applyNeedsHeartbeat`'s shape rather than inventing a
  second one.
- **D8 (promoted from the parked open question in Phase 4) — 5 game-minutes
  is the confirmed heartbeat cadence.** The live pass proved 1 vs 5 vs 30
  chunking of the closed form is byte-identical in every consumer (needs,
  phone battery, memory) over a full day — even across checkpoint block
  transitions, because restore keys only change at the 30-gm checkpoints
  (max measured need diff 0.0; the only cadence-sensitive consumer, mood
  easing, differs 1.8e-6 at 5-min and 0.0002 at 30-min over a day — both
  invisible on the displayed bars). Cost at 1-min is ~0.0645 ms/heartbeat
  on a 5-resident house (~77 ms per real hour of idle play at scale 20) —
  immaterial either way, so cost did not decide it. 5 was chosen over 30
  (also byte-identical) to keep the heartbeat visibly finer than the
  30-min sim checkpoints, leaving a freshness margin for any future reader
  of needs. Nothing in the game reads needs at a finer granularity than
  5 gm: needs surface as 5%-bucketed bars and decision reads happen at
  ≥30-gm cadence.

---

## Data model

```js
// config.js — NEEDS block, converted
energy:  { decayPerMinute: 2/30,  max: 100, warnBelow: 20 },
hygiene: { decayPerMinute: 1/30,  max: 100, warnBelow: 25, washRestore: 60 },
// hunger: unchanged — HUNGER_RHYTHM, not this table
comfort:     { decayPerMinute: 0.5/30, max: 100, warnBelow: 20, warnAbove: 80 },
stimulation: { decayPerMinute: 1/30,   max: 100, warnBelow: 20, warnAbove: 80 },

npcEnergyDecayPerMinute: 2/30,
npcHungerDecayPerMinute: 1.5/30,
npcHygieneDecayPerMinute: 1/30,
npcSocialDecayPerMinute: 1/30,
npcComfortDecayPerMinute: 0.5/30,
npcStimulationDecayPerMinute: 1/30,
```

```js
// TIME_DILATION (time.js's config), new field alongside simCheckpointMinutes
HEARTBEAT_MINUTES: 5,   // Phase 4 confirmed 5: byte-identical to 1 at 5× the cost saving (D8)
```

---

## Implementation phases

### Phase 1 — Rate conversion
**Goal:** every decay/restore rate in `NEEDS` exists in its per-minute
form alongside (not yet replacing) the per-tick form, so both can be
compared during verification.
**Files:** `src/srcfiles/config.js` (`NEEDS` block).
**Verification:** for every converted rate, `decayPerMinute * 30 ===
decayPerTick` (exact, since this plan is explicit that no rebalance is
happening).

### Phase 2 — The heartbeat accumulator
**Goal:** the heartbeat fires at `HEARTBEAT_MINUTES` cadence inside the
existing continuous loop; decay/restoration for every active NPC and the
player runs off it instead of off `resolveTick`'s per-tick pass.
**Files:**
- `src/srcfiles/time.js`: `clockFrame` gains the new accumulator (D2).
- `src/srcfiles/sim.js`: the needs-decay half of `resolveTick` moves out
  to the new heartbeat call site; `resolveTick` itself is left to
  `continuous-behavior-engine-plan.md`'s Phase 2 to finish dismantling.
**Verification:** over a fixed simulated span at a fixed dilation scale,
total decay applied via the heartbeat matches total decay the old per-tick
path would have applied over the same span, within floor/ceiling clamping
differences (a population-level equivalence check, not a byte-for-byte
one, since the *timing* of when decay lands is deliberately finer now).

### Phase 3 — Fast-forward closed form + phone/memory
**Goal:** D4 lands; phone battery and memory decay move onto the same
heartbeat/closed-form pair.
**Files:** `src/srcfiles/time.js` (battery), the memory-decay call site
(UI section, confirm exact function at implementation time).
**Verification:** an 8-hour sleep jump produces the same end-state needs
values whether resolved via the closed-form multiplication or (in a test
harness only) via looping the heartbeat 480 times — proving the shortcut
is exact, not approximate, before the loop path is deleted.

### Phase 4 — Tuning
**Goal:** `HEARTBEAT_MINUTES` itself gets a value that's been watched, not
just proposed.
**Verification:** live pass, same technique as the behavior-engine plan's
Phase 6. **Result: D8 — confirmed and retuned to 5.** See the Handoff's
Last session's notes for the full browser_eval evidence (chunking
byte-identity, live continuous-path equivalence, float robustness, cost).

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | Per-minute rates alongside per-tick |
| 2 | Done | Heartbeat accumulator replaces per-tick decay |
| 3 | Done | Closed-form fast-forward; phone/memory join the heartbeat. The discrete path's join had a real gap until the 2026-08-15 audit — see Addendum |
| 4 | Done | Tuning pass — `HEARTBEAT_MINUTES` confirmed at 5 (D8) |

---

## Dependency order

```
Phase 1 (rate conversion) ──► Phase 2 (heartbeat accumulator) ──► Phase 3 (closed-form + phone/memory) ──► Phase 4 (tuning)
```
Phase 2 can start once `continuous-behavior-engine-plan.md`'s Phase 1
lands (needs a place to call *from* once `resolveTick`'s shape starts
changing) but does not depend on that plan's later phases.

---

## Open questions (parked, none blocking)

- ~~**Is 1 minute the right heartbeat, or is 5 indistinguishable and
  cheaper?**~~ **Resolved in Phase 4 → locked as D8: 5.** The live pass
  measured 5 byte-identical to 1 across every consumer and every checkpoint
  block transition, at 5× fewer calls.
- **Does restoration-on-completion (D5, for behavior-engine actions with a
  real duration) ever produce a visibly different curve than continuous
  per-minute restoration would have?** Only answerable once both plans'
  Phase 2/3 exist together.

---

## Design invariants

1. **One heartbeat, every consumer.** Decay, restoration, phone battery,
   memory decay — not four independently-tuned cadences that can drift
   out of sync with each other.
2. **A time-skip is always closed-form.** No fast-forward path may loop
   the heartbeat; the day this stops being true is the day a long sleep
   becomes a performance cliff.
3. **`hunger` is not this plan's to touch.** It has its own derived model;
   converting it into a decay rate here would be a second, disagreeing
   implementation of the same value.
