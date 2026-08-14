# Needs and the simulation heartbeat

Status: **planned — not started**. Design session complete 2026-08-14; all
decisions locked. Documentation only — no code written.
Last updated 2026-08-14.

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

**Resume at:** Phase 1. Nothing has been built.

**Last session's notes (design session, 2026-08-14 — no code written):**
- The exact current rates were read in full from `config.js`'s `NEEDS`
  block (line 1754 on) rather than assumed — see Evidence. Several fields
  already carry their own hard-won tuning history (a rebalance table in
  the source comments, `src/ref/complete/npc-correctness-fixes-plan.md`
  Phase 4) that this plan must convert without re-arguing.
- `hunger` has **no** `decayPerTick` today — Phase 5 of the correctness
  plan made it a derived rhythm value instead (`HUNGER_RHYTHM`, read
  elsewhere). This plan's per-minute conversion does not apply to hunger
  the same way it applies to energy/hygiene/comfort/stimulation/social —
  flagged explicitly so a future phase doesn't invent a `hungerDecayPer
  Minute` that fights `HUNGER_RHYTHM`.

**Blockers / flagged deviations:** None.

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
HEARTBEAT_MINUTES: 1,
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
Phase 6.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | Per-minute rates alongside per-tick |
| 2 | Not started | Heartbeat accumulator replaces per-tick decay |
| 3 | Not started | Closed-form fast-forward; phone/memory join the heartbeat |
| 4 | Not started | Tuning pass |

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

- **Is 1 minute the right heartbeat, or is 5 indistinguishable and
  cheaper?** Phase 4's job, not a decision to make from a document.
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
