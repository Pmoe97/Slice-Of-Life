You are one session in a long-running series implementing the **Avatars &
Sprite Studio** overhaul for this game — every character in the world stops
being a letter in a coloured circle and gets a real face: a headshot avatar on
the floor-plan map, in conversation, and in every list, plus a full-body sprite
in the scene, all of it regenerable, uploadable and hand-editable by the player
in an in-game Sprite Studio on the computer and the phone.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

---

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/avatars-and-sprite-studio-plan.md`.

The first phase not marked **Done** is your phase. **As of 2026-08-27, all 8
are Done** — this plan and this prompt now live in `src/ref/complete/`
together; if you were handed this file, read the Handoff section anyway (Step
0 below still applies), but expect it to say there is nothing left to do.

**Exceptions — phases that may run out of order:**
- **Phase 6** (drawing and colour) is genuinely optional to the thesis. Phase 5
  is what unblocks the cutout plan; Phase 6 is what the user asked for. If a
  session has to stop early, stopping after 5 leaves a coherent tool.
- **Phase 7** needs Phase 2 (for `detectHeadCrop`) and Phase 4 (for a surface
  to put it on), but **not** 5 or 6.
- **Phase 8** goes last, after everything it asserts about exists.

**Hard prerequisite:** never start Phase 2 before Phase 1. The whole point of
`resolveSprite` is that the ~26 avatar call sites are converted **once**, onto
the final contract. Converting them against `getCachedImage` and re-converting
later is two risky sweeps instead of one.

**External block:** the cutout pipeline needs `root.generateImage`, which only
exists inside Perchance. `dev-harness.html` stubs it to **throw**. That is
fine and expected — every phase so far has been verified against it. But if a
phase genuinely requires real generated pixels, **stop and tell the user**
rather than faking them.

If all phases are marked Done, **stop** and report that to the user.

You should never need to read the whole plan document in one session. It is
~1,400 lines and most of it is history.

---

## Step 1 — read the plan's Handoff, then your phase

Reading order: **Handoff** → **Locked decisions** → **Data model** → your
phase block → **Design invariants**. Skip the Evidence section unless your
phase's bullets point into it.

**Citations drift.** Cross-check every cited file and line number against the
actual current code before trusting it. Find the real current location by name
or content, not blindly by line number. A stale citation is expected, not an
error — this plan has already moved several hundred lines of `render.js`,
`ui.js` and `image.js` under its own citations.

**Stop and flag, don't improvise.** If a phase's instructions conflict with
what you find in the live code, or a locked decision turns out to be
unworkable, **stop and flag it** — add a note under "Blockers / flagged
deviations" and end the session there. Three deviations have already been
taken deliberately and recorded that way (the store is not in `SAVE_KEYS`; the
conversation bubbles were left alone; the Edit button was withheld for a
phase). A silent workaround is the single most expensive failure here: it
looks like progress and is discovered phases later.

---

## Step 2 — do exactly one phase, then stop

### Scope
One phase. Do not pull work forward even with budget left. Phase boundaries
encode dependency order, risk, and what can be reviewed on its own.

### Reuse, don't approximate — go read these
- **`src/srcfiles/sprites.js`** — `resolveSprite` is the ONLY function allowed
  to read a sprite blob (design invariant 1). Whatever you are building, it
  goes through this, not around it.
- **`src/srcfiles/spritestudio.js`** — the studio's verbs *and* the editor
  core. Read the two-buffer note at the top of the editor section before
  touching anything that writes pixels.
- **`src/srcfiles/render.spritestudio.js`** — registers into
  `COMPUTER_RENDERERS` via `Object.assign`. That is how a new app joins now.
- **`src/srcfiles/avatar.js`** — `avatarChip` / `avatarChipHtml` /
  `hydrateAvatars`. Never hand-roll a person chip again; that is what D11 is.
- **`src/srcfiles/studio.js` + the `rl-studio-*` renderers in
  `render.computer.js`** — the Character Studio, which is the shape this app
  deliberately mirrors (verbs file beside renderers file).
- **`dev/design/sprite-studio/matte-and-measure.py`** — the reference
  implementation for `detectHeadCrop` and the two-tolerance matte, with the
  measured numbers behind both. Port its cases rather than inventing new ones.

### Hard technical rules
1. **A new `src/srcfiles/*.js` needs a line in TWO places, in the same
   commit:** `index.html`'s script tags AND `dev/verify/loadgame.js`'s `ORDER`.
   Shipping to only one is the rumination.js scar — five harnesses and 175
   assertions died silently that way. (`render.spritestudio.js` is the one
   deliberate exception: it is pure view code and the render layer is outside
   that loader.)
2. **A cache holds what can be regenerated; a store holds what cannot.** Never
   write generated pixels to `kv.sprites`. The moment you do, D7's cap becomes
   a lie and the player's own work competes with machine output for space.
3. **Version tokens belong in cache keys, never in slot ids.** Bumping
   `CUTOUT_PIPELINE_VERSION` must be *incapable* of orphaning something a
   player painted.
4. **Parametric and destructive edits live in separate buffers** (Phase 5).
   The matte sliders recompute from the master; strokes accumulate in
   `strokeMask`; the working image is the composite. A paint tool that writes
   into the base would silently make every slider drag destroy every stroke.
5. **Never generate from a render path.** `resolveSprite` defaults
   `generate: false` for exactly this reason. The one legitimate exception is
   `renderSceneCutouts`, because a character the player is *looking at* is the
   case where making the art now is what they want.
6. **Initials are the floor, never the failure** (D10). Every avatar surface
   must be correct with no image at all. A brand-new applicant, an evicted
   blob and a failed generation are the ordinary case.
7. **This app writes pixels, never people** (D21). No `npc.bible`, no
   `physical.*`, no renames. The Character Studio owns who somebody is.
8. **`dev-harness.html`'s kv folder list must stay in step with `KVFolders`**
   in `state.js` — its own comment says so, and a missing folder reads like a
   game bug and is not one.

### Verification is not optional
- **Pure logic → a `dev/verify` harness.** Anything below the render/ui layer.
  A new harness is not verified until it has actually **run and printed its
  pass/fail line** — `node --check` clean is not the same thing (five
  harnesses in this repo were syntactically broken and had never once
  executed).
- **Render/UI → the live page.** `dev-harness.html` through a local server,
  driven with `javascript_tool`. Screenshots need the Browser pane open; if it
  is closed, use `javascript_tool` to read the DOM and computed styles
  instead — that has caught every layout bug in this plan so far, including a
  canvas squeezed to 24px and a canvas with a zero-size rect.
- **Two checks that are easy to skip and have both caught real bugs here:**
  (a) instrument `root.kv` and count calls across repeated `render()` passes —
  a redraw must cost **zero**; (b) after any change to the scene or avatar
  path, confirm no generation fires from a render (`root.generateImage` spy,
  expect 0).
- **The suite:** `node dev/verify/run-all.js`. The baseline is **72 failed / 8
  harness errored** and the failing set must be *identical*, not merely
  similar. **Do NOT use `git stash` to establish that baseline in this working
  tree** — `config.js`, `state.js`, `index.html` and `loadgame.js` all carry
  pre-existing uncommitted work, so stashing drops the D17–D20 `CUTOUT_TUNING`
  values and fails 6 unrelated cutout tests. Compare against the documented
  numbers.
- **Harness gotcha:** `generateText` throws in `dev-harness.html`, so generated
  NPCs have **empty names**. A chip showing `?` there is D10 working, not a
  bug. Assign `npc.bible.name` before testing anything name-shaped.

Once the phase is verified, **stop.** Do not roll into the next one.

---

## Step 3 — write the handoff note before ending, every time

Whether the phase finished, is partial, or is blocked:

1. **Overwrite** the plan's `## Handoff — read this first` — Resume at / this
   session's notes / Blockers. Keep the per-phase session notes below it as
   history, but the top block must describe *now*.
2. **Update the Status table row.** Never leave Status and Handoff disagreeing.
3. **Promote any resolved open question** into Locked decisions as a new
   D-number and strike it from Open questions.
4. **Record real identifiers** — function names, constants, slot ids — because
   the next session will grep for them, not read prose.
5. **Record measured numbers** nobody else will go and measure again: kv calls
   per render, suite totals, byte sizes, anything you tuned.
6. **Mark the plan complete** if this was the last phase, and move it plus this
   prompt to `src/ref/complete/` as a pair.

> A half-finished phase with a precise Handoff note is recoverable; a
> half-finished phase with no note is not.

---

## Two things specific to this overhaul

**The thesis, so you don't optimise against it.** The companion plan
`character-cutout-scene-rendering-plan.md` is code-complete and stuck: nobody
in this repo can see a real cutout, so its tuning cannot be verified. This
plan's answer is not a better algorithm — it is handing the player an eraser.
When a choice comes up between making the pipeline smarter and making the
result *inspectable and fixable by the player*, choose the second.

**Findings that belong to the other plan.** Evidence 7 lists five defects in
the cutout plan's territory found while building this one (cast shadows
surviving D20's negative prompt; D16 unable to tell `bottomFrac: 0` from a
figure cropped at the thigh; D14 decontaminating toward a colour on nobody;
the seated pose sitting on an invisible chair; plates hardcoding a style while
cutouts get none). They are that document's business. **Do not fix them here** —
but if you touch `image.js` for another reason and one is in your way, flag it
rather than quietly repairing it in the wrong plan.
