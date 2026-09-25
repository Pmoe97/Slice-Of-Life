# Aging — everyone gets older, slowly

Status: **planned — design complete 2026-09-22; not started.** Builds with
Birthdays P2–P3 (roadmap build order). Last updated 2026-09-22.

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

**Resume at:** Phase 1. **Survey (2026-09-22):** `bible.age` is stated in
every image subject description (`image.js` ~L350, "a 28-year-old …") and
in the prompt's `[Identity]` line (`llm.js` `buildNpcBlockV2`), but image
**cache keys are identity-anchored, not description-anchored**:
`composeCharKey` keys on `bible.genSeed`, `cutoutIdentityToken` on
`n<genSeed>` (players: `playerIdentityToken`). So changing `bible.age` or a
physical descriptor does NOT refresh a cached portrait — it would sit stale
until LRU eviction and then regenerate *different* at a random moment. That
is exactly the "instant, drastic change" R9 forbids, arriving by accident.
A4 is the fix. **Blockers:** none.

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
| 1–5 | Not started |

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
