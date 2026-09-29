# Aging — everyone gets older, slowly

Status: **built and verified — all five phases (2026-09-29, shipped as 0.14.5).**
One live check outstanding, the same external gate as the cutout plan: a real
image model has never repainted a portrait after a step (see Handoff). Last
updated 2026-09-29.

Companions:
- `SEASONS-AND-OCCASIONS-ROADMAP.md` — R9 (the user: "a slow process, not an
  instant, drastic change to any one descriptor field… a well-paced gradual
  change") binds this plan; R5/R6 too.
- `birthdays-and-occasions-plan.md` — the birthday rollover is where the
  number moves; Phase 1 there deliberately never said "turning N".
- `src/src/ref/wip/character-cutout-scene-rendering-plan.md` +
  `src/src/ref/complete/avatars-and-sprite-studio-plan.md` — the image keys
  A4 extends.

---

## Handoff — read this first

**Nothing to resume** — see "Built 2026-09-29" below; what remains is the one
live image check and the follow-ups. **Survey (2026-09-22):** `bible.age` is stated in
every image subject description (`image.js` ~L350, "a 28-year-old …") and
in the prompt's `[Identity]` line (`llm.js` `buildNpcBlockV2`), but image
**cache keys are identity-anchored, not description-anchored**:
`composeCharKey` keys on `bible.genSeed`, `cutoutIdentityToken` on
`n<genSeed>` (players: `playerIdentityToken`). So changing `bible.age` or a
physical descriptor does NOT refresh a cached portrait — it would sit stale
until LRU eviction and then regenerate *different* at a random moment. That
is exactly the "instant, drastic change" R9 forbids, arriving by accident.
A4 is the fix. **Blockers:** none.

### Built 2026-09-29 (all five phases, one session — `aging.js`, `verify-aging.js` 48)

- **P1 — the number (A1, A6).** `processAgingForDay` (aging.js) runs FIRST in
  `processBirthdaysForDay`: on each person's birthday, once per birthday year
  (a per-record `agedYear` guard — a reload never ages anyone twice), `bible.age`
  and the player's `appearance.age` go up by one. NPCs of every status age (a
  contact, a visitor, a former roommate — the birthday is derived for all).
  Day 1 ages nobody. No retroactive aging: an old save's NPC whose birthday
  already passed this year simply ages at the next one. The player's morning
  line says "You're 40 now."; 21 and every tenth birthday are milestones — a
  prompt note for `milestoneDays` (3) after (theirs, and yours for a roommate
  who knows it), and importance already reads the new age.
- **P2 — the profile and the drift (A2, A3, A5).** `agingProfile`: onset ages
  per step, derived from `bible.genSeed` (player: seed + name), `AGING_TUNING`
  (config.js) owns the ladders — hair (a few grey strands → greying at the
  temples → salt-and-pepper → grey, always from the ORIGINAL colour, kept in
  `bible.agingBase`), lines (faint laugh lines → laugh lines → crow's feet,
  replacing only what aging itself put there), weathered skin (80% of people),
  a slight stoop (35%). Steps that would change nothing (already grey/dyed
  hair, a feature already at that rung, a missing field) are consumed silently
  and never spend a birthday. `agingNextStep` gives at most ONE step per
  birthday, the earliest-onset due step, ladders climbed in order; the rest
  queue. Measured over 200 people: a 25-year-old over ten birthdays takes 0–2
  steps (≥ 90%), a 50-year-old mostly 3–5, nobody two in one birthday.
  Applied steps land in `bible.physical` and `bible.agingLog`.
- **P3 — portraits (A4).** `appearanceEpochToken` folds into `composeCharKey`,
  `cutoutIdentityToken` and `playerIdentityToken` (image.js) ONLY when epoch > 0;
  `verify-aging.js` pins the epoch-0 keys byte-identical to the old formulas,
  including the player's no-seed fallback hash (the bookkeeping is left out of
  it, with the age held at the age they started at, so a step-less birthday never
  repaints them). Peek keys stay identity-anchored (they don't carry the look).
- **P4 — the player and species (A7–A9).** The player ages with a Settings
  toggle "Your appearance ages" (`playerAging`, default on; it turns the LOOK
  off, never the number) and a mirror line when a step lands. `speciesPace`
  (config.js, beside `RACES`): visible age = age × pace (elf 0.2, vampire
  0.05 …); the number still moves by one each birthday. `bible.agingProfile`
  ({ disabled } | { disable: [ids], onsets: {id: age} }) pins or disables steps.
- **P5 — close-out.** Patch-noted in 0.14.5; loader + index.html registered;
  `verify-occasions` loader-order regex widened for the new file between.

**Waiting on the user (design calls, not confirmed):** (1) "the number" under
A9 — I read "pace multiplier on BOTH the number and the ladder" as: the number
always moves by one and only the visible ladder is slowed; say if you meant the
elf's number should move slower too. (2) The step means and the 0.12 per-person
jitter are mine (config `AGING_TUNING`). (3) NPC steps are silent (no "you
notice…" beat) so it stays gradual — the player only sees it in prompts/portraits.

**Not live-verified:** a real image model repainting a portrait after a step
(no backend in any dev environment) — everything else is measured in node.

## The thesis

A 140-day year means a long save spans years of these people's lives. They
should be older at the end of it — the number, and very gradually, the
look: the first grey at the temples, laugh lines, a softer jaw — each one a
small, single change the player might not notice until they look back. The
failure mode is the opposite: nobody ages (the world is frozen), or a
birthday swaps half a character's descriptors and their portrait re-rolls
into a stranger.

### What this plan is *not*
- **Not dramatic.** At most one descriptor step per birthday; most birthdays
  change nothing visible.
- **Not uniform.** Each person has their own derived aging profile (one
  greys at 32, another at 55).
- **Not a portrait lottery.** Portraits refresh only when a visible step
  lands, from the same seed.

## Locked decisions

- **A1 — The number moves on the birthday**, for NPCs and the player, once
  per birthday year, in the birthday rollover pass (a mark, like the wish).
- **A2 — A derived aging profile** per character (R5): seeded onset ages for
  a short ladder of steps per descriptor — hair (colour → "a few grey
  strands" → "greying at the temples" → "salt-and-pepper" → "grey"), lines
  (none → "faint laugh lines" → "laugh lines" → "crow's feet"), skin texture
  (late), build/posture (rare, late). Onsets spread wide and plausibly; young
  adults rarely change.
- **A3 — One step per birthday, maximum**, and only when the new age has
  crossed that step's onset. Several due steps queue across later birthdays
  — the "well-paced" half of R9.
- **A4 — Portraits follow steps, not birthdays.** An `appearanceEpoch`
  (count of applied steps) folds into the identity tokens (`composeCharKey`,
  `cutoutIdentityToken`, `playerIdentityToken`) **only when > 0**, so every
  existing key — and the whole existing cache — is untouched until a real
  step lands. Same `genSeed`, so the regenerated portrait is the same person
  a little older.
- **A5 — The record**: applied steps land in `bible.physical` (the bible is
  authoritative) plus an `bible.agingLog` of `{ age, field, from, to, day }`
  — debuggable, reversible, and what the "you've gone a bit grey" beat reads.
- **A6 — Milestones speak**: 30/40/50/… birthdays get a prompt note for a few
  days, and feed birthday importance (Birthdays P3).
- **A7 — Authored looks are respected**: a descriptor the user authored in
  the studio is aged along the same ladder (grey comes for everyone), but an
  authored *override* field (`bible.agingProfile`) can pin or disable steps.

## Implementation phases

- **Phase 1 — The number** (A1, A6): age increments at the birthday
  rollover; `[Identity]` reads it; milestone note. Verify: once per year,
  never twice on reload; the prompt line.
- **Phase 2 — The profile & drift** (A2, A3, A5): no images yet. Verify: a
  25-year-old over 10 years changes 0–2 things; a 50-year-old 3–5; never two
  in one birthday; distribution sanity across 200 NPCs.
- **Phase 3 — Portraits** (A4): epoch in keys, default keys byte-identical
  at epoch 0 (pinned by a harness). Verify with the image backend.
- **Phase 4 — The player & species** (A7–A9 + Birthdays P2's picker): the
  player ages too, with the Settings toggle (A8); species pace (A9).
- **Phase 5 — Close-out.**

## Status

| Phase | Status |
|---|---|
| 1–5 | **Built and verified** (2026-09-29) — `verify-aging.js` 48; real-image repaint unverified |

## Resolved questions (user, 2026-09-22)

- **A8 — The player's appearance drifts too**, on by default, with a Settings
  toggle to turn it off (old Q1: "Yes").
- **A9 — Long-lived species age slower** (old Q2: "yes"): a per-species pace
  multiplier on BOTH the number and the appearance ladder (an elf's birthday
  still comes every year, but their visible steps come far slower). The
  multipliers are a lore table in config beside `RACES`; human = 1.

## Design invariants

1. **Epoch 0 keys are byte-identical to today's.** A harness pins it; the
   existing image cache must survive this plan.
2. **Never more than one visible step per birthday.**
