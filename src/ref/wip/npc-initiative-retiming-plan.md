# NPC initiative retiming

Status: **planned — not started**. Design session complete 2026-08-14; all
decisions locked. Documentation only — no code written.
Last updated 2026-08-14.

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

**Resume at:** Phase 1. Nothing has been built.

**Last session's notes (design session, 2026-08-14 — no code written):**
- The exact cooldown field names were grep-verified against `overture.js`
  and `config.js` rather than recalled: `OVERTURE.textCooldownTicks: 16`,
  `.knockCooldownTicks: 20`, `.proposeCooldownTicks: 20` (config.js:5619,
  5626, 5631), each wired to its channel's `cooldownTicks` field
  (overture.js:5859, 5907, 5946). `isOnCooldown`/`setCooldown` (drives.js:
  66–86) are the shared mechanism every one of these actually runs
  through — same function the correctness plan's D34 finding is about.
- D34 itself (`src/ref/complete/npc-initiative-plan.md:813`) was read in
  full, not paraphrased from memory: `isOnCooldown` compares a **wrapped**
  delta (`currentTick >= last ? currentTick - last : currentTick +
  CLOCK.ticksPerDay - last`, drives.js:78) against `cooldownTicks`. At or
  above `CLOCK.ticksPerDay` (48) that wrapped delta can never reach the
  threshold, so three entries — `knock_player` (96), `propose_player`
  (48), and `NPC_GIFT_TUNING.cooldownTicks` (96) — fired **exactly once
  per NPC per game** despite their own comments promising "two in-game
  days" / "a full day" / "~2 game days". All three were already retuned
  down (to 20) by Plan 5 Phase 6 as a same-session bug fix — this plan's
  job is not to fix D34 again, it's to convert the *representation* so
  the bug class it describes cannot exist at all, regardless of what
  value any cooldown is ever set to in the future.
- This session's cross-check pass (against `continuous-behavior-engine-
  plan.md`, 2026-08-14) found a **second** site reading `cooldownTicks`
  that the original grep pass missed: `recencyMultiplier`
  (cognition.js:100–112) does not call `isOnCooldown` — it has its own,
  independent copy of the same wrapped-per-day-delta arithmetic (its own
  comment even says so: "Same wrapped per-day delta as isOnCooldown"),
  computing a *recency penalty* rather than a hard gate. It reads the
  identical `candidateDef(driveId)?.cooldownTicks` field `isOnCooldown`
  does. Left unconverted, Phase 1's field rename alone would silently
  zero out every drive's recency penalty (`cd` reads `undefined` → falls
  back to 0 → `recencyMultiplier` always returns 1) without touching
  D34's bug class at all — a real behavior change this plan's own D1
  invariant forbids. Folded into this plan's scope (D3, Phase 2) rather
  than left for `continuous-behavior-engine-plan.md`, since it's the
  same config field and the same wrap arithmetic, not a different
  mechanism.

**Blockers / flagged deviations:** None.

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
| 1 | Not started | Config fields converted to minutes |
| 2 | Not started | `isOnCooldown`/`setCooldown` and `recencyMultiplier` compare absolute minutes |
| 3 | Not started | Re-measured against Plan 5's published baseline |

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
