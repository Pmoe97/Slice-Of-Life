# NPC initiative retiming

Status: **COMPLETE — all three phases done, 2026-08-15.** Decisions locked
D1–D5. Last updated 2026-08-15.

Companions:
- `CONTINUOUS-SIMULATION-ROADMAP.md` (the umbrella — implements C1).
- `continuous-behavior-engine-plan.md` (owns *what an NPC is doing*, which
  an overture can interrupt — D6 of that plan. This plan only retimes
  *when an overture channel is allowed to fire again*, a narrower and
  separate concern living in `overture.js`, not `cognition.js`).
- `src/ref/complete/npc-initiative-plan.md` (Plan 5 — built the overture
  system this plan retimes, including the D34 finding this plan directly
  resolves; read for the *why* of the four channels, not re-argued here).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else.**

---

## Handoff — read this first

**The plan is COMPLETE — all three phases shipped.** No new harness rows
(Phase 3 is measurement + instrument re-pointing), so the suite count is
unchanged at 1,324 from Phase 2's pass. This document lives at
`src/ref/complete/npc-initiative-retiming-plan.md` now.

**Resume at:** nothing — every phase is done. If something in this plan ever
breaks, the mechanism tests below are the ones to re-run.

### Phase 3, done this session (population-level re-measurement, 2026-08-15)

**First task — re-pointed `dev/verify/measure-initiative.js` off the dead
tick-space fields.** Its reading-5 section still read `cooldownTicks` /
`OVERTURE.textCooldownTicks` — the fields D1 removed — so it would have
mis-read on a run. Now: the D26 "PERMANENT after the first firing" table
(which existed to surface values at/above the wrap bound) is a plain
`cooldownMinutes` table with no bound; the text/propose/knock sweeps read and
write `cooldownMinutes` at the old tick values × 30, spanning the same
real-time durations. `verify-i6.js`'s instrument checks were updated to match:
it now asserts the instrument reports minutes with no daily bound, and the "no
`cooldownTicks` survives" scan covers the instrument source too — the exact
file that went stale. Also fixed the one remaining stale runtime comment,
`config.js:6199` (`_driveCooldowns = { driveId: tickIndex }` →
`absoluteMinute`).

**The measurement, run live** (browser_eval against the real page; same
methodology as the instrument — 12 households × 3 residents × 7 in-game days,
seeds `20260811 + i × 7919`, real `resolveBatch` + the episode writer, real
`overtureAllowed`/`scoreOvertures`/`overtureTextLine` wrapped at their call
sites):

- **Reading 1 (the rate), measured → published (2026-08-13):**
  untouched 0.067 → 0.099 · fond (aff 0.9) 1.548 → 1.742 · charged 0.512 →
  0.651 · out of flat 0.718 → 0.544 · locked door 0.722 → 0.591 · asleep 0.718
  → 0.567. **These do NOT match within measurement noise** (≈±0.05–0.08 at
  1σ) — see the flagged deviation below.
- **The conversion itself is behavior-invisible — proven three ways:**
  1. **Exact-duration enforcement at population scale.** `setCooldown` wrapped
     to record the gap between successive stamps per NPC+drive across 24
     house-runs (fond + locked-door arms): text_player cd 480 → min gap **480**
     (a text can fire the instant its cooldown elapses), approach cd 360 → min
     390, propose cd 600 → min 1020, gift cd 600 → min 1200. **Zero violations
     in 524 cooldown overwrites.**
  2. **The cooldown is a live lever.** Swept `text_player.cooldownMinutes`
     90/180/360/480/720/1440/2880 on the away arm → 1.401/1.012/0.782/0.718/
     0.679/0.444/0.274 texts/NPC/day — perfectly monotone; the field is what
     the mechanism reads, and 480 sits mid-curve (scoring binds at low values,
     which is why an absolute-rate comparison can't prove anything on its own).
  3. **D34's own channel matched.** `propose_player` (the wrap's headline
     victim) measures **0.425/NPC/day vs the published 0.437** — within noise.
     And the D34 regression probe still passes on a fresh load: a 1440-minute
     cooldown is on at stamp+1439 and free at +1440.
- **Reading 3 (the endings)** on the fond arm: engages-half 1.690 (pub 1.917),
  refuses-half 0.758 (pub 0.897), refuses-all 0.635 (pub 0.758) with a refusal
  cost of 0.100 affection over the week (pub 0.109). The D10 curve's shape
  holds; the absolute level follows reading 1's drift.
- **Gate:** the sleeping arm blocked 1,984 otherwise-ready overtures (pub
  4,260 — lower because the total rate is lower; the gate does the same work).
- Every edit left the page clean on reload: no syntaxErrors/perchanceErrors/
  console errors (the "character slot 2 interest-tag overlap" warnings are
  pre-existing generation warnings, unrelated).

**Flagged deviation (recorded, not a blocker):** the plan's Verification
sentence — "the post-conversion numbers should match Plan 5 Phase 6's
published figures within measurement noise" — is NOT literally met: totals run
11–32% off the 2026-08-13 baseline. The cause is not the conversion. Every
mechanism check above says the cooldown layer preserves Plan 5's tuned
durations exactly; the phase's reasoning ("D1 preserves effective duration
exactly") only holds when the cooldown is the *only* delta, and it is not — the
continuous-behavior-engine overhaul (Phases 1–5), the needs heartbeat and the
external-world retiming all landed between the published baseline and this
phase, upstream of the cooldown in the decision/scoring layer. The drift's
shape (away-arm text 0.452 → 0.718/day; untouched curiosity 0.099 → 0.067) is
exactly where the overhaul changed decision cadence and time-of-day scoring.
**The current measured rates are the baseline `continuous-behavior-engine-plan`
Phase 6 (roadmap row 20) must tune against — not the published 2026-08-13
table.**

**Phase 2, for continuity (2026-08-15):** `isOnCooldown`/`setCooldown`
(drives.js:66–90) now take `nowAbs` and stamp/compare
`clockToAbsolute(clock)`; the wrapped tick-delta branch is gone.
`recencyMultiplier` (cognition.js) reads the same converted field with the same
monotonic subtraction. `evaluateDrives` computes `nowAbs` once (drives.js:133);
`hasChatPartner` (drives.js:814) takes `nowAbs`; `scoreCandidates`' ctx field
is `nowAbs` (cognition.js:325). The `evaluateDrives`/`resolveStandardDrive`
`currentTick` param SURVIVES for event-record `tick:` fields only — do not
remove it. Harnesses verify-i1..i6/c1..c4/p4 were converted the same session.

**Blockers / flagged deviations:** none blocking. One recorded finding (the
baseline drift above) — a measurement outcome, not a failure of the
conversion. Citation drift handled as expected: the plan doc's citations for
`recencyMultiplier`/`isOnCooldown` were a few lines down in the real code by
this session; same functions, same shapes.

---

## The thesis

D34 is not really a tuning bug. It's a representational one: a 0–47
per-day index has no way to express "a cooldown longer than a day" at
all, and the wrap arithmetic that tries to fake it silently produces
"free during a fixed daily window" instead of "free N minutes after
firing" the moment the cooldown value gets anywhere near
`CLOCK.ticksPerDay`. The Plan 5 fix retuned three values back under that
ceiling — correct, but it leaves the ceiling itself in place as something
every future cooldown has to remember not to cross.

Absolute-minute cooldowns (`clockToAbsolute`, already used elsewhere in
this project) don't have that ceiling. `nowAbsolute >= cooldownEndsAbsolute`
is a single monotonic comparison with no wraparound to get wrong at any
duration — a cooldown of six hours and a cooldown of six days are the
same kind of check. This plan is that conversion: four channels'
cooldowns, plus the gift-giving cooldown that shares the same underlying
mechanism, off `isOnCooldown`'s wrapped-tick arithmetic and onto absolute
time.

### What this plan is *not*

- **Not a second fix for D34.** Already fixed, by retuning, in Plan 5.
  This plan removes the representational hazard D34 exposed; it does not
  re-diagnose the symptom.
- **Not a rebalance.** Every cooldown's *effective* duration in real time
  is preserved exactly (`cooldownTicks × 30` minutes) — this plan changes
  what's compared, not how long anything actually waits.
- **Not a change to the four channels' own logic** — proximity gates
  (`adjacent`/`outside`, `isRoomAdjacent`), the do-not-disturb registry,
  motive scoring, all untouched.
- **Not literal-proximity channels.** A channel asking "is the NPC within
  real earshot" rather than "is the NPC in an adjacent room" is C8's
  concern (geometric perception), not this plan's — proximity stays
  room-graph-based here.

---

## Locked decisions

- **D1 — Every `*CooldownTicks` field becomes `*CooldownMinutes`**
  (`textCooldownTicks: 16` → `textCooldownMinutes: 480`, i.e. × 30 —
  mechanical, preserving the exact real-time duration Plan 5 Phase 6
  already tuned).
- **D2 — `isOnCooldown`/`setCooldown` (drives.js) compare absolute
  minutes, not wrapped tick deltas.** `setCooldown` stamps
  `clockToAbsolute(clock)`; `isOnCooldown` checks
  `clockToAbsolute(clock) - stampedAbs < cooldownMinutes` — one
  subtraction, one comparison, no wrap branch, no `CLOCK.ticksPerDay`
  ceiling. This is the whole fix: the D34 bug class requires a wrap to
  exist, and this representation has none.
- **D3 — This is the same mechanism `cooldownTicks` uses everywhere it
  appears**, not just the three overture channels D34 named.
  `NPC_GIFT_TUNING.cooldownTicks` (the fourth value D34's own writeup
  flagged as "not in the original list, and required — same broken
  class, same file") and any `DRIVE_DEFS` entry's `cooldownTicks`
  (general drives, not just overtures — `clean_common: cooldownTicks: 20`,
  `chat_with_roommate: cooldownTicks: 12`, etc., all sharing
  `isOnCooldown`) convert identically. One function, one conversion,
  every caller benefits — not a per-channel patch. This includes
  `recencyMultiplier` (cognition.js:100–112, see Handoff) even though it
  doesn't call `isOnCooldown` directly — it reads the same field and
  duplicates the same wrap arithmetic by hand, so it converts to the same
  absolute-minute comparison in the same phase, not as a separate fix.
- **D4 — Proximity channels stay exactly as they are.** `adjacent`/
  `outside` (overture.js:92, 95) read `isRoomAdjacent`, unchanged. This
  plan's absolute-minute conversion and the room-graph proximity check
  are orthogonal; nothing here touches the second one.
- **D5 — The re-measured baseline is the continuous engine's, not Plan 5's
  published table.** Phase 3 measured (12×7, the instrument's own
  methodology) untouched 0.067, fond 1.548, charged 0.512, out-of-flat
  0.718, locked 0.722, asleep 0.718 overtures/NPC/day. These are outside
  measurement noise of the published 2026-08-13 figures (0.099/1.742/0.651/
  0.544/0.591/0.567), and the drift is attributable to the continuous
  behavior-engine overhaul landing between the two measurements, upstream
  of the cooldown in the decision/scoring layer — proven by three
  mechanism-level checks (zero cooldown violations across 524 stamps;
  monotone text-cooldown lever sweep; propose at 0.425 vs published 0.437,
  within noise). `continuous-behavior-engine-plan` Phase 6 (roadmap row 20)
  tunes against these current figures, not the published table.

---

## Data model

```js
// config.js OVERTURE, converted
textCooldownMinutes: 480,      // was textCooldownTicks: 16  (16 × 30)
knockCooldownMinutes: 600,     // was knockCooldownTicks: 20
proposeCooldownMinutes: 600,   // was proposeCooldownTicks: 20

// NPC_GIFT_TUNING, converted
cooldownMinutes: 600,          // was cooldownTicks: 20 (already retuned by Plan 5)
```

```js
// drives.js — isOnCooldown / setCooldown, converted signature
function isOnCooldown(npc, driveId, nowAbs) {
  const cooldowns = npc.flags?.[DRIVE_COOLDOWN_KEY] || {};
  const stampedAbs = cooldowns[driveId];
  if (stampedAbs === undefined) return false;
  const cd = candidateDef(driveId)?.cooldownMinutes || 0;
  return (nowAbs - stampedAbs) < cd;             // no wrap, no ceiling
}
function setCooldown(npc, driveId, nowAbs) { /* stamps nowAbs, same shape */ }
```

---

## Implementation phases

### Phase 1 — Config field conversion
**Goal:** every `cooldownTicks` field in `config.js` (the three `OVERTURE`
fields, `NPC_GIFT_TUNING.cooldownTicks`, and every `DRIVE_DEFS` entry's
own `cooldownTicks`) exists as `*CooldownMinutes` at the identical
effective duration.
**Files:** `src/srcfiles/config.js` — grep for every `cooldownTicks:`
occurrence first (the full list, not just D34's four) and convert each.
**Verification:** for every converted field,
`newValueMinutes === oldValueTicks * CLOCK.tickMinutes`, exact.

### Phase 2 — `isOnCooldown`/`setCooldown`, and `recencyMultiplier`
**Goal:** D2's absolute-minute comparison replaces the wrapped-tick one;
every caller passes `clockToAbsolute(clock)` instead of a tick index.
`recencyMultiplier`'s independent wrapped-delta copy (D3) converts to the
same absolute-minute comparison in the same pass, not left for later.
**Files:** `src/srcfiles/drives.js` (`isOnCooldown`, `setCooldown`, and
every call site — `cognition.js`'s `isDriveCandidate` among them);
`src/srcfiles/cognition.js` (`recencyMultiplier`, cognition.js:100–112 —
its own `since = ...` wrap arithmetic replaced the same way, reading the
same converted field).
**Verification:** the exact scenario D34's own writeup used to demonstrate
the bug (a cooldown at or above what used to be `CLOCK.ticksPerDay` ticks)
now elapses correctly rather than blocking forever — run as a direct
regression check, proving the bug class is structurally gone, not just
absent from today's tuned values. Separately, `recencyMultiplier` still
returns a penalty (not 1) for a drive performed within its recency
window after conversion — proving Phase 1's rename didn't silently zero
it out.

### Phase 3 — Population-level re-measurement
**Goal:** confirm the conversion is behavior-invisible at the rates Plan 5
Phase 6 already tuned.
**Files:** none (measurement only).
**Verification:** reuse `dev/verify/measure-initiative.js`'s existing
methodology (overtures per NPC per day, by channel) — the post-conversion
numbers should match Plan 5 Phase 6's own published figures within
measurement noise, since D1 preserves effective duration exactly.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done 2026-08-14 | Config fields converted to minutes |
| 2 | Done 2026-08-15 | `isOnCooldown`/`setCooldown` and `recencyMultiplier` compare absolute minutes |
| 3 | Done 2026-08-15 | Re-measured against Plan 5's published baseline |

---

## Dependency order

```
Phase 1 (config conversion) ──► Phase 2 (comparison logic) ──► Phase 3 (re-measurement)
```
Strictly sequential. Depends on `continuous-behavior-engine-plan.md`'s
Phase 1 only in the sense that `clockToAbsolute`-space needs to be the
project's established time address by the time this lands — no direct
code dependency.

---

## Open questions (parked, none blocking)

- None. This plan's scope is narrow and its conversion mechanical by
  design — the open-endedness lives in the plans it depends on, not here.

---

## Design invariants

1. **A cooldown's effective real-time duration is preserved exactly by
   this plan's conversion.** Any change to how long a channel actually
   waits is a retune, and retunes belong to the plan that owns the
   channel's balance (Plan 5), not this one.
2. **The representation itself must make D34's bug class impossible, not
   merely avoid triggering it.** A ceiling nobody is currently crossing is
   still a ceiling; this plan's whole point is removing it.
3. **One `isOnCooldown`, every caller.** A second, parallel cooldown check
   invented for a future channel is the exact mistake that let D34 hide
   for as long as it did behind three different call sites all trusting
   the same broken shared function.
