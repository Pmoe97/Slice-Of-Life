# Night Scene — UI design session prompt (one-shot)

You are running a **one-shot design session** for the UI of the Night Scene,
a sleeping-NPC free-play minigame in this game. This is **not** the
one-phase-per-session implementation protocol used elsewhere in this repo —
you are not building a phase. You produce **design decisions and mockups**,
the user picks, and you write the result back into the plan. No gameplay code
is written this session.

You have no memory of any previous session. Everything you need is either in
the target document or must be discovered by reading the current code — never
assume continuity with a prior chat.

**One thing that is NOT drift, read this before anything else:** this repo
mirrors Perchance's own container shape. The game's source lives at
`src/src/srcfiles/`, design docs at `src/src/ref/`, the dev harness at
`src/src/dev/verify/` — **all nested one level deeper than a plain `src/`
layout**. Only `index.html`, `main.pjs` and `dev-harness.html` sit outside
both layers. If you find yourself typing `src/srcfiles/...`, stop — it's
`src/src/srcfiles/...`. This has burned a session before.

---

## Why this session exists

The Night Scene's mechanics are **fully designed and half built** — Phases 1
and 2 are landed and green. The UI is **deliberately undesigned**. An earlier
design pass produced a UI proposal (a button tray, three meters, one static
cached image) that the user was **not happy with** and explicitly reopened:

> "I am actually leaning towards a more image-generation heavy UI system, but
> it isn't just visual… we need to find a way to display image feedback
> (consistently, and with player-controlled protections for poor quality
> generation), text feedback, and the action tray eloquently on PC and mobile
> displays without losing a drop of quality between them… I want to see every
> approach we could take. this isn't based on what may be established in the
> doc, we can start from scratch on the UI for all I care."

Take that literally. The old UI decisions (D9, D10, D11 in the plan) are
listed there as **reopened context, not constraints**. Do not re-propose them
as the answer just because they're written down; the user already rejected
that direction once.

---

## Step 0 — read, in this order (and note what is NOT a constraint)

1. `src/src/ref/complete/night-scene-sleeping-npc-plan.md` — specifically:
   - `## Handoff — read this first` (current state, what's built)
   - `## UI — explicitly deferred, not locked` (**the brief** — every
     reopened question is enumerated there)
   - `## Locked decisions` (the mechanics your UI must serve — D1–D6, D8,
     D12–D14)
   - `## Data model` (the live session record shape the UI reads/writes)
   - `## Design invariants`
2. The built mechanics, so your proposals serve real functions rather than
   imagined ones — `src/src/srcfiles/boundary.js`, section
   `===== SECTION: NIGHT SCENE =====`: `nightStepTouch`, `nightStepCleanup`,
   `nightStepQuell`, `resolveNightSceneOutcome`, `rollGhostSuspicion`,
   `resolveNightSceneGate`, `openNightScene`, `abandonNightScene`,
   `resolveNightSceneEnd`.
3. `BOUNDARY.nightScene` in `src/src/srcfiles/config.js` — the zone table
   (with its `category` field), the cleanup table, thresholds.

**Cross-check every cited file, function and line number against the actual
current code before trusting it.** A stale citation is expected, not an error
— find things by name and content, never blindly by line number.

You should not need to read the whole plan document.

---

## Step 1 — ground yourself in what this codebase can actually render

A UI proposal that assumes capabilities this project doesn't have is worthless.
Before designing, go read these — they are the nearest existing precedents,
and at least one of them should be the shape you build on:

- `src/src/srcfiles/actionwindow.js` — **the closest precedent**: the existing
  full-screen outcome overlay. `resolveActionWindowSpec`, `deriveActionDeltas`,
  `ACTION_WINDOW_ROW_BUILDERS` (pure), and `presentActionOutcome` /
  `renderActionWindow` / `dismissActionWindow` (lifecycle). The Night Scene is
  intended to be the sim's **third overlay** after conversation and this one.
- `src/src/srcfiles/peek.js` — the closest precedent for a *live, ticking,
  risk-managed session* with its own UI loop: `startPeekSession`, `_peekTick`,
  `peekRiskPerTick`, `composePeekViewLine`.
- `src/src/srcfiles/image.js` — what image generation actually costs and how
  it's cached: `composeSceneKey`, `buildImagePrompt`, `sceneDetailSignature`,
  and the plate/cutout pipeline. Also read
  `src/src/ref/wip/character-cutout-scene-rendering-plan.md`.
- `src/src/srcfiles/render.js` and `ui.js` for this project's actual layout,
  mobile, and theming conventions.

**Forbid yourself inference here.** If you cannot find evidence that something
is possible in this runtime, write **"not found in source"** and say what you'd
need to check — do not design around a capability you assumed. A gap the user
can fill is worth far more than a plausible guess they can't distinguish from
fact.

---

## Step 2 — the constraints that are real (and the fact that inverts the usual assumption)

**Mechanics the UI must serve (locked, do not redesign):**
- **Two bars, not three.** Detection is current risk; underneath it sits a
  permanent **Floor** that only ever rises and that Quell can never drain
  below. The user's own call: render the Floor as a **deeper-colored band
  within the same Detection bar** — "kinda sorta two bars in one." Heat is
  the second, separate bar.
- **Heat is pure reward.** It never costs anything, never feeds risk, and
  maxing it is a win (a climax beat). It must never be *presented* as a
  danger, a cost, or a resource being spent.
- **Action categories:** Lull / Stimulate / Intimate / Quell / **Cleanup**.
  Bail is an **exit action**, not a touch category — a drop-everything panic
  run that leaves evidence behind.
- **Cleanup is a real, risky action set** (restore panties/bottoms/shirt,
  smooth sheets, clean up) — it's the only path to a true Ghost ending, and
  each item is its own risky click. The UI has to make "what evidence is
  still outstanding" legible at a glance.
- Detection hitting 100 is an instant wake; Heat at that instant decides
  willing vs. hostile.

**The technical fact that flips the normal assumption — design around it:**
> On this project's infra, **deterministic-prompt image generation is
> comparatively FAST. It is the narration TEXT that is slow** (Perchance
> server load).

Most designers reflexively minimize image generation and lean on text. Here
that is backwards. Treat frequent, deterministic, cached image feedback as
genuinely on the table, and treat a slow text beat as the thing that needs
covering.

**Other hard requirements:**
- **Player-controlled protection against a bad generation** is required — the
  mechanism is yours to propose (regenerate? approve-before-commit? a quality
  floor? a fallback plate? a toggle?). Name the tradeoffs of each.
- **PC and mobile both first-class** — "without losing a drop of quality
  between them." Not a desktop design with a mobile fallback.
- **No mechanic ever blocks waiting on a generation.** Whatever the cadence,
  a touch resolves instantly; art catches up.
- **The avatar-headshot-on-the-pillow idea is rejected.** Do not re-propose
  it. Any identity solution must be something else.

---

## Step 3 — what to produce, in this order

**Section 1 is the one that matters most. Be exhaustive there.**

1. **Every approach, genuinely distinct.** At least four or five, differing in
   **kind, not degree** — not one idea with the tray moved around. For each:
   - the core idea in one sentence;
   - how image, text, and action input coexist spatially;
   - the PC layout and the mobile layout;
   - how it covers a slow text beat and how it handles a bad image;
   - what it is **bad** at — every approach has a real cost, name it.
   **Preserve the differences; do not average them into one compromise.** If
   two approaches genuinely conflict, that conflict is information the user
   wants to see, not a problem to smooth over.
2. **Mockups, not just prose.** Visual artboards are far more useful here than
   description — consider the `design` skill (a multi-artboard canvas) or
   inline HTML/SVG mockups. Show the same approach at both PC and mobile
   widths.
3. **A recommendation** — which one you'd build and why, followed by **the
   strongest argument against it**. State it plainly; the user rejected the
   last confident UI suggestion, so a recommendation without its own
   counter-case is not useful.
4. **Things you'd flag.** Anything you noticed while designing that looks
   wrong — in the mechanics, the data model, the plan, or the existing code.
   The mechanics were designed in conversation and built fast; a fresh pair of
   eyes on them is part of this session's value, not a digression.
5. **Open sub-questions** the user must answer before Phase 3 can start.

---

## Step 4 — mandatory: write the outcome back before ending

Once the user has picked a direction (**ask; do not choose for them**):

1. **Replace** the plan's `## UI — explicitly deferred, not locked` section
   with real locked decisions, numbered as new D-numbers **continuing from
   D14** (D15, D16, …). The reopened D9/D10/D11 should be explicitly marked
   superseded by whichever new numbers replace them.
2. **Overwrite** the plan's `## Handoff — read this first` section — Resume
   at / this session's notes / Blockers. Name real identifiers; the next
   session greps for them.
3. **Update the Status table** — the "UI design" row, and Phases 3 and 4,
   which are currently marked "Blocked on UI design."
4. **Promote resolved questions** out of `## Open questions` (Q7 is already
   folded into this session; others may resolve here too).
5. If no reusable phase handoff prompt exists yet at
   `src/src/ref/complete/night-scene-handoff-prompt.md`, consider writing one now
   per `src/src/ref/patterns/HANDOFF-PROMPT-ARCHITECTURE.md`, since Phases 3–6
   become workable the moment the UI is decided.

**Do not implement Phase 3 in this session**, even with budget left. Phase 3
is its own session against a decided design — that separation is the whole
point of stopping here.

A design session whose outcome is only in the chat log is a design session
that didn't happen.
