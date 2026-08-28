# Avatars & The Sprite Studio

Status: **COMPLETE — all 8 phases built and verified.** Design session
2026-08-27; all decisions locked (D1–D25), D9 rewritten the same day against
real pixels.
Last updated 2026-08-27.

Companions:
- `src/ref/wip/character-cutout-scene-rendering-plan.md` (code-complete, one
  live-run gate outstanding) — **this plan is the instrument that closes it.**
  Every unresolved item on that plan's live-run checklist is a question about
  pixels nobody in this repo can see; Phase 5 here puts those pixels on screen
  with the tuning sliders attached. This plan consumes its `CUTOUT_TUNING`,
  `cutoutKey`, `cleanCutout` and `layoutSceneCutouts` and does not redesign
  them.
- `src/ref/wip/home-design-studio-plan.md` (foundation built) — the precedent
  for "an editor is a real feature, not a dev script". Its D7 (undo matters
  more than autosave) is inherited verbatim as D20 below.
- `src/ref/complete/ai-character-generation-plan.md` (built) — the Character
  Studio this plan sits beside. That app owns a character's *bible*; this one
  owns their *pixels*, and the two never write each other's struct (D21).
- `src/ref/complete/scene-reader-ui-plan.md` (built) — the frosted reader the
  cutouts stand behind; Phase 3's ambient tier (D15) has to stay legible
  against it.
- `src/ref/complete/player-creation-and-intro-plan.md` (built) —
  `player.portrait.seed` is the player's identity anchor and stays so.
- `src/ref/wip/settings-and-pause-overhaul-plan.md` (planned) — its D9 image
  style fold is the reason D4 exists. Read D4 before touching either.

This plan is complete — all 8 phases built and verified — and lives in
`src/ref/complete/` now, paired with
`src/ref/complete/avatars-and-sprite-studio-handoff-prompt.md`. That prompt's
Step 0 already handles the all-phases-complete case (stop and report), so a
fresh session handed it will find nothing left to implement here.

---

## Handoff — read this first

**Resume at:** Nothing — **all 8 phases are built and verified.** This
document and its paired handoff prompt now live in `src/ref/complete/`. A
session that opens this by name should treat it as reference, not a queue.

**Two items were deliberately left open, and are recorded here (again) so
they are never rediscovered from scratch:**
1. Phase 6's blocker #1 — **reopening an edited sprite loses the destructive
   half of the work** (`spriteEditorOpen` reads `rec.master || rec.image`, so
   strokes/paint/colour/geometry never survive a close-and-reopen). A prior
   session's note guessed this was "Phase 8's business," but Phase 8's actual
   file list never asked for it — it asked for kv.sprites' save/export round
   trip, a different question (answered below) — so it was left alone rather
   than quietly expanded into an unscoped data-model change. Fixing it means
   the record carrying its overlays, or opening from `image` with `master`
   kept only for reset; that is a real design decision, not a bug fix.
2. Phase 6's blocker #2 — **the editor's scene preview generates from a
   render path**, against hard rule 5 (`renderSpriteScenePreview`'s
   `getScenePlate` call has no no-generate option). Same reasoning: not in
   Phase 8's file list, not touched this session.

Both are still fully described under **Blockers / flagged deviations (Phase
6)** below, unchanged.

**A REAL BUG, found while writing this phase's own boundary test, before
anything ran.** D1's own wording — art a human produced, "...or **explicitly
pinned from a regenerate**" — describes exactly what `doSpriteAvatarUnlink`
(`spritestudio.js`) does: freeze whatever avatar is currently showing into a
PINNED record. But it tagged that record `origin: 'generated'` — the same tag
`doSpriteAvatarLink`'s blob-LESS linked record correctly carries. Since the
unlink path stores real pixels (`image`/`master` both set), that tag was
indistinguishable from raw machine output landing in the permanent store on
its own, which is exactly the failure D1/D7 exist to make impossible — and
exactly what this phase's own boundary check was written to catch. Fixed by
retagging it `'regenerated'`, the one value in the data model's own
documented origin enum (`'generated' | 'uploaded' | 'edited' | 'regenerated'`)
that nothing had ever actually written; `spriteRevertLosesWork`'s existing
comment ("'regenerated' art can be made again from its seed") already assumed
this tag existed.

**Implementation session (2026-08-27, Phase 8 — the integration sweep):**

- **Built and verified.** `dev/verify/verify-sprite-p8.js` — **22
  assertions**, all passing. Boundary assertions rather than features, the
  way `verify-cutout-p6.js` is for its own plan: D1/D7's origin allowlist
  checked against records the REAL studio verbs produce (not a hand-built
  fixture); D4/D5's version/style-token exclusion from slot ids; D21 spied
  over real npc/player objects across every write-capable verb Phase 4-7
  added (link/unlink, promote/demote, revert, upload, regenerate — not just
  Phase 4's original four); a ten-namespace key-prefix uniqueness sweep (the
  cutout plan's six, plus `dream_`/`awa_`/`awi_`/`av_`); peek/dreams/the
  outcome window/photos/the menu gallery confirmed to never call
  `resolveSprite`/`resolveAvatar`; and D10 with the store and LRU both empty.
  Plus two new functions in `src/srcfiles/state.js`:
  `exportSpriteOverrides`/`importSpriteOverrides`.
- **The save/load promise was already true — Phase 1 built it that way.**
  `kv.sprites` became save-independent back in Phase 1 (the flagged deviation
  recorded there and in `state.js`'s `KVFolders` comment): it is absent from
  `SAVE_KEYS`, so `restoreSave` structurally cannot reach it (its write loop
  only touches `Object.entries(record.payload)`, and `payload` never carries
  a `sprites` key because `captureSavePayload` only walks `SAVE_KEYS`), and
  `writeGeneratedGameState` (New Game) never references `root.kv.sprites` at
  all. This session's job was to CONFIRM that promise, not build it — done
  two ways: a source-level assertion that `state.js` never contains the
  literal `root.kv.sprites` anywhere, and a live browser check (below) that
  reproduces both functions' real write loops against a painted record and
  shows it survives untouched either way.
- **The export/import plumbing is new.** `exportSpriteOverrides()` /
  `importSpriteOverrides(text)` in `state.js`, reusing the SAME gzip/base64
  envelope `exportSaveRecord`/`importSaveRecord` already established
  (`gzipBytes`/`gunzipBytes`/`bytesToBase64`/`base64ToBytes`), with its own
  `type`/`version` envelope (`slice-of-life-sprite-overrides`, v1) so a
  foreign or future-format file is refused rather than silently misread. Each
  record's `image`/`master` blobs are base64'd with their MIME type
  (`blobToBase64`/`base64ToBlob`, two small new helpers); import rebuilds
  real Blobs and writes every record back through `putSpriteRecord`, so D7's
  cap is enforced exactly as it would be for a manual save — an import that
  would overflow the store refuses the individual records that don't fit
  (never evicts anything already there) and reports which slots were
  skipped and why, rather than failing the whole import over one oversized
  record.
- **No UI wired to it, deliberately.** Phase 8's own file list names exactly
  three files (`verify-sprite-p8.js`, `state.js`, `ARCHITECTURE.md`) — no
  `render.spritestudio.js`, no `ui.js`. The plumbing exists and is verified;
  a Data-tab or roster-header button that calls it is a small follow-up for
  whoever wires it next, not scope this session pulled forward. (The parked
  open question "sharing overrides between characters... decide during Phase
  8, when the byte budget is real" is adjacent but distinct, and also not
  done — same reasoning: no file-list bullet asked for it.)
- **Why this couldn't run end-to-end inside `dev/verify`'s bare vm, and how
  it WAS verified instead.** `exportSpriteOverrides`/`importSpriteOverrides`
  need `CompressionStream`/`TextEncoder`/`Blob` — browser APIs
  `dev/verify/loadgame.js`'s sandbox deliberately does not expose (the same
  reason `verify-debuglog.js` only source-checks `exportSaveRecord`/
  `importSaveRecord` rather than running them). So `verify-sprite-p8.js`
  checks the export/import functions at the source/shape level (they exist,
  they reuse the real gzip helpers, they read/write through the real store
  functions) and the ACTUAL round trip ran live in `dev-harness.html`
  instead: painted a real two-blob record (real canvas → real PNG blobs) via
  `putSpriteRecord`, exported it, **deleted the slot and wiped the index**
  (simulating a fresh save on a different machine), imported the exported
  text back, and confirmed the restored record is **byte-identical** — same
  MIME type, same size, same bytes compared one at a time, not just size.
  Separately reproduced `restoreSave`'s and `writeGeneratedGameState`'s
  actual write loops (inline, since a full game boot was disproportionate for
  this check) against a painted record and confirmed both leave it
  untouched — including a load of an OLDER save whose payload predates the
  paint, which is the exact scenario the Phase 1 flagged deviation exists to
  protect.
- **Suite: 3311 passed / 72 failed / 8 harness errored** — baseline held
  exactly (72/8 unchanged from every prior phase's number); passes up by
  precisely this phase's 22 (3289 + 22 = 3311). The background run's visible
  log only kept its own tail (alphabetically `verify-w5.js` onward, so this
  phase's own line had scrolled off by the time it was read back) — the
  total is the authoritative number and this arithmetic is the check, the
  same method Phase 7's Handoff used for the same reason.
- **`ARCHITECTURE.md` updated in this pass**: `sprites.js`/`avatar.js` after
  `image.js`, `spritestudio.js`/`render.spritestudio.js` after
  `render.computer.js` in the Load order diagram; moved from the
  plan-summary table into the `complete/` table, paired with its handoff
  prompt, matching every other finished plan's format. `src/ref/README.md`
  updated the same way (moved from its `wip/` table to its `complete/`
  table).
- **This plan and its handoff prompt moved to `src/ref/complete/`** as a
  pair, per the session protocol's own closing step. Both files were
  untracked in git for the entire lifetime of this plan (every phase's work
  landed without a commit) — `git mv` refuses an untracked source, so the
  move used a plain filesystem move instead; nothing here implies these
  files, or anything else this plan touched, has been committed.

**Blockers / flagged deviations (Phase 8):** None new. The two Phase 6 items
above remain open, recorded there rather than repeated in full here.

**Implementation session (2026-08-27, Phase 7 — the avatar crop surface and
the override sweep):**

- **Built and verified.** `dev/verify/verify-sprite-p7.js` — **24
  assertions**. No new `src/srcfiles` file — the recrop surface, the wildcard
  sweep and the avatar paint-edit path all landed in the three files Phase
  4-6 already established (`sprites.js`, `spritestudio.js`,
  `render.spritestudio.js`), plus one new `recrop` screen entry in
  `defs.computer.js`'s `sprites` app, five new `sprites.*` dispatch cases in
  `ui.js`, and the `.spr-*` styles in `index.html`.
- **A REAL BUG, found by tracing D8's own promise rather than by running
  anything.** "A linked avatar follows its cutout" implies a regenerate makes
  the avatar follow — but `derivedAvatarKey(baseKey, crop)` is a pure function
  of `cutoutKey`'s string plus the crop rect, and a regenerate reuses that
  string on purpose (`doSpriteRegenerate` already has to `deleteCachedImage`
  the OLD entry first just to force new pixels under the SAME key). So the
  derived-avatar LRU entry never went stale on its own: a linked avatar kept
  showing the pre-regenerate headshot forever, with nothing in Evidence or a
  prior harness ever having exercised the path to catch it. Fixed with one
  new function, `invalidateDerivedAvatar(identity, baseKey)` in `sprites.js`
  — drops the derived entry for whatever crop the identity's linked record
  (if any) currently specifies, is a no-op for a PINNED avatar (D8's other
  half), and is called from `doSpriteRegenerate` right after a regenerate
  succeeds, before the warming `resolveAvatar` call. Live-verified indirectly
  (the harness can't drive `getCharacterCutout` — no canvas — so it unit-tests
  the invalidation itself against seeded `kv.images` entries) and directly
  (painting an avatar and re-deriving it in the real browser produced a real
  blob and the map marker/studio panel both picked it up on the next
  `render()`, no reload).
- **The wildcard sweep MIGRATES, it does not duplicate.** `promoteSpriteOverride`
  / `demoteSpriteOverride` in `sprites.js` write the record to its new address
  before deleting the old one (so a failed write never loses it), and both
  REFUSE outright if the destination slot is already someone else's override
  — silently overwriting a second piece of the player's own work would be
  exactly the D7 violation the store's cap already refuses to commit.
  `spriteOverrideScope(slot)` answers "where does this apply?" from the slot
  id alone, no store read, so the grid's "Applies to: …" line and the
  widen/narrow button cost nothing extra per cell.
- **Painting an avatar promotes linked → pinned for free**, because
  `spriteEditorOpen`/`spriteEditorSave` are now `kind`-generic
  (`kind === 'avatar' ? ... : 'cutout'`, threaded through `parseSpriteSlotId`)
  rather than hardcoded to `'cutout'`. A linked avatar has no blob (D8), so
  opening one falls through to `resolveAvatar(..., generate:false)` — the
  same derived crop every other avatar surface shows — and `spriteEditorSave`
  writes it back through the ordinary `putSpriteRecord(..., mode:'pinned')`
  path, identical to a manual Pin except the pixels are real. D5's wildcard
  scope is explicitly skipped for `kind==='avatar'` (an avatar variant is
  always `'default'` — no outfit segment to widen). The scene-preview panel
  (D19) is suppressed for an avatar editor session: a 256×256 headshot has no
  scene scale to sit at.
- **The recrop surface is deliberately NOT the cutout editor.** No history, no
  destructive buffers, no tuning — just a square crop rect over a decoded
  cutout canvas (`spriteRecropOpen`/`spriteRecropSetSource`, DOM/canvas,
  call-time only) and pure geometry for the drag
  (`spriteRecropClampCrop`/`spriteRecropCornerAt`/`spriteRecropMoveTo`/
  `spriteRecropResizeFromCorner`/`spriteRecropHandleSize`, fully unit-tested).
  Saving calls the EXISTING `doSpriteAvatarLink` verb — no new write path.
  Live-verified with real `PointerEvent`s dispatched at the canvas: a
  move-drag landed the ring exactly where dragged (clamped at the frame), a
  corner-resize grew the ring from the FIXED opposite corner and stayed
  square, Auto reproduced the original `detectHeadCrop` result byte-for-byte,
  switching source pose to one with no art refused with a friendly message
  and left the session untouched, and the canvas element's identity survived
  every drag (no accidental full re-render mid-drag, which would drop pointer
  capture — the same failure class Phase 6's D25 fixed for the paint editor).
- **The "use a different pose" picker is a plain `<select>` over the 9
  pose×expression combos at the character's CURRENT outfit** — not an async
  scan of which combos actually have art (that would need the grid's own
  per-cell resolve pass). Picking an empty one just answers "that pose has no
  art yet" and leaves the session alone; asserted live.
- **Suite: 3289 passed / 72 failed / 8 harness errored** — baseline held
  (3265 + 24), same failing set (confirmed by total arithmetic; the harness
  suite doesn't name individual harness-errors in its summary line, but the
  count and the pass-count delta both landed exactly where the math predicts).

**New identifiers (grep these, do not re-derive them)**

`sprites.js` — `spriteOverrideScope`, `promoteSpriteOverride`,
`demoteSpriteOverride`, `invalidateDerivedAvatar`.

`spritestudio.js` — `spriteRecropHandleSize`, `spriteRecropClampCrop`,
`spriteRecropCornerAt`, `spriteRecropMoveTo`, `spriteRecropResizeFromCorner`,
`spriteRecropState`, `spriteRecropClose`, `spriteRecropDefaultVariant`,
`spriteRecropDecode`, `spriteRecropOpen`, `spriteRecropSetCrop`,
`spriteRecropAuto`, `spriteRecropSetSource`, `spriteRecropSave`,
`doSpritesOverrideWiden`, `doSpritesOverrideNarrow`, `doSpritesAvatarEdit`,
`doSpritesAvatarRecrop`, `doSpritesRecropClose`, `doSpritesRecropAuto`,
`doSpritesRecropSource`, `doSpritesRecropSave`. `spriteEditorOpen` and
`spriteEditorSave` both gained a `kind` dimension (default `'cutout'`) rather
than new names — grep their bodies, not a new symbol.

`render.spritestudio.js` — `renderSpritesRecrop`, `spriteRecropSourceOptions`,
`paintSpriteRecropCanvas`, `paintSpriteRecropPreview`,
`syncSpriteRecropPreviews`, `attachSpriteRecropPointer`. New dispatch actions
(`ui.js`): `sprites.override-widen`, `sprites.override-narrow`,
`sprites.avatar-edit`, `sprites.avatar-recrop`, `sprites.recrop-close`,
`sprites.recrop-auto`, `sprites.recrop-save`. (`sprites.recrop-source` is
NOT a dispatch action — the `<select>` attaches its own `change` listener,
same reason the colour/tint controls do.) New screen: `defs.computer.js`'s
`sprites` app gained `recrop: { renderer: 'sprites-recrop', hideFromNav:
true }`.

**Implementation session (2026-08-27, Phase 6 — drawing and colour):**

- **Built and verified.** `dev/verify/verify-sprite-p6.js` — **43
  assertions**. No new file, so nothing to register in `index.html` +
  `loadgame.js` this time; everything lands in `spritestudio.js`,
  `render.spritestudio.js`, five dispatch cases in `ui.js`, and the
  `.spe-color` / `.spe-swatches` / `.spe-sw` / `.spe-rail-div` / `.spe-note`
  styles in `index.html`.
- **THE ARCHITECTURE, now five kinds of edit and still no layers (D17).**
  Three parametric, re-run from source on every change — **matte** (D18),
  **colour** (D24), **frame** (D24). Two destructive, accumulated by hand —
  `strokeMask` (erase / restore / magic-erase) and the new RGBA `paint`
  overlay (brush / bucket). The pipeline is:

  ```
  base      = tuning(master)              parametric, from master
  base      = adjust(base)                parametric colour (D24)
  composite = paint OVER (strokeMask applied to base)      (D23)
  working   = geom(composite)             flip / scale / crop, at the END
  ```

  The two orderings that matter and were both asserted: **paint sits above
  the eraser**, so painting into an erased hole is visible — and because it
  does, **the eraser clears the paint layer directly**, carrying a second
  `paintDelta` on the same history entry. And **colour never touches the paint
  layer**, which is what makes pick-then-paint an exact round trip.
- **Geometry is parametric because history is sparse.** Every stroke delta is
  a list of buffer indices. Baking a crop or a resample would re-point two
  hundred undo entries at the wrong pixels — the same trap Phase 5's
  auto-trim comment names. Asserted directly: paint, crop, undo twice, land
  byte-identical on the untouched buffer.
- **THREE REAL DEFECTS, all found by running it, none by reading it.**
  1. **One drag committed one entry per mousemove**, against D20. Measured:
     three pointermoves, three entries. Fixed by the open/segment/close drag
     session (D25) — now 20 pointermoves commit **one** entry, verified live.
     `spriteEditorStroke` and `spriteEditorPaint` remain as the one-call form
     the harness uses; the pointer path no longer calls them.
  2. **`setPointerCapture` throwing aborted the whole pointerdown**, losing
     the stroke rather than merely the capture. It throws `NotFoundError`
     whenever the id is not an active pointer. Now guarded like its release
     already was; verified with an uncapturable pointer id, which still paints
     and still commits one entry.
  3. **A repeat bucket fill committed an empty entry.** The flood recorded
     every matching pixel whether or not it changed, so clicking the same
     region twice gave an undo step that did nothing. It now records only real
     changes and still floods *through* unchanged pixels — skipping them
     outright would stop the fill at its own first pixel.
  Plus one stale readout: the Colour badge sat on "unchanged" while the player
  watched the sprite change, because the panel is deliberately not rebuilt
  mid-drag. `.spe-adjstate` is synced in `syncSpriteEditorChrome` now, beside
  `.spe-dims`.
- **Live verification, `dev-harness.html`, real `PointerEvent`s on a real
  canvas.** (The Browser pane was closed, so this is DOM + canvas pixel
  readback, not screenshots.)
  - **Brush:** a 20-move drag across 161 px — **zero gaps**, nothing off the
    line, canvas pixel exactly `#3a2a1c`, **one** history entry, one undo
    clears it, one redo restores it.
  - **Eyedropper at three zooms** (the plan's live item): 1.0, 0.488 and 0.244
    — the pick matched the pixel under the cursor every time, and the hex
    label updated without a re-render.
  - **Bucket:** 13,516 px filled at tolerance 90, **0 leaked into the
    background**, lowest artwork alpha touched 255, face untouched, empty
    corner still alpha 0.
  - **Flip:** mirrors, and the round trip differs by **0 bytes** over the whole
    240×320 canvas.
  - **Crop by marquee drag:** committed exactly the dragged rect
    (`{x:70,y:30,w:100,h:260}`), canvas resized to 100×260, readout followed,
    master still 240×320 — and painting *through* the crop landed in source
    space at the clicked pixel.
  - **Colour slider:** seven live frames → **0** entries during the drag, **1**
    on release, one undo back to zero.
  - **Save round trip:** a session of brush + colour + crop stored
    `origin:'edited'`, revision 2, image **140×236** (the framed result, baked
    in), master **240×320** (pristine, D6), corner alpha 0, and the brush mark
    present at exactly `#ff2244`.
- **Suite: 3265 passed / 72 failed / 8 harness errored** — baseline held
  (3222 + 43), same failing set.

**Blockers / flagged deviations (Phase 6)**

1. **Reopening an edited sprite loses the destructive half of the work.**
   `spriteEditorOpen` reads `rec.master || rec.image`, and the master is
   pristine by design (D6) — so the tuning comes back (it is stored as
   `record.tuning`) but the strokes, the paint, the colour and the frame do
   not. Measured: saved a 140×236 edit, reopened, got the 240×320 original.
   This is Phase 5 behaviour that Phase 6 makes much more expensive (a whole
   painting session, not a few erase strokes). Fixing it is a **data-model
   change** — the record would have to carry the overlays, or open from
   `image` with `master` kept for reset — so it was deliberately not done
   here. It belongs to Phase 8's save round trip, or to a decision before it.
2. **The editor's scene preview generates from a render path**, against hard
   rule 5. `renderSpriteScenePreview` (Phase 5, D19) calls `getScenePlate`,
   which has no no-generate option: a cache miss always generates. Measured
   with a `root.generateImage` spy — **1 generation per editor re-render**, so
   five tool clicks cost five. With the computer closed, `render()` fires
   **zero**, so nothing else regressed. In a real session the current room's
   plate is nearly always already cached (it is the picture behind the
   window), which is why this has not bitten — but "nearly always" is not the
   rule. The fix is one call site: read the cache directly via `plateKey` +
   `getCachedImage`, or give `getScenePlate` a `generate: false`.
3. **Deviation from the previous handoff's sketch.** It predicted "a new
   overlay in the same shape as `strokeMask` plus one branch in
   `spriteCompositeStrokes`". There is such a branch, but paint composites
   **above** the stroke mask rather than beside it (D23), and there is a third
   pipeline stage after it for geometry (D24). Both are recorded as locked
   decisions with the reasoning.

**New identifiers (grep these, do not re-derive them)**

`spritestudio.js` — `spriteHexToRgb`, `spriteRgbToHex`, `spriteRgbToHsl`,
`spriteHslToRgb`, `spriteAdjustDefaults`, `spriteAdjustIsIdentity`,
`spriteAdjustBuffer`, `spriteAdjustedMaster`, `spriteGeomDefaults`,
`spriteGeomIsIdentity`, `spriteGeomRect`, `spriteGeomOutSize`,
`spriteGeomApply`, `spriteGeomToSource`, `spritePaintDelta`,
`spriteStampPaint`, `spritePaintSegment`, `spritePaintClearIndices`,
`spriteBucketFill`, `spritePickColor`, `spriteDominantColors`,
`spriteEditorStrokeOpen`, `spriteMergeMaskDelta`, `spriteMergePaintDelta`,
`spriteEditorStrokeSegment`, `spriteEditorStrokeClose`,
`spriteEditorApplyPaintDelta`, `spriteEditorPaint`, `spriteEditorFill`,
`spriteEditorPick`, `spriteEditorSetAdjust`, `spriteEditorResetAdjust`,
`spriteEditorSetGeom`, `spriteEditorFlip`, `spriteEditorSetScale`,
`spriteEditorSetCrop`, `spriteEditorCropToArtwork`, `spriteEditorResetGeom`,
`spriteEditorSwatches`, `doSpritesEditorSwatch`, `doSpritesEditorFlip`,
`doSpritesEditorResetAdjust`, `doSpritesEditorCropArtwork`,
`doSpritesEditorResetFrame`.

Editor session fields added: `paint`, `paintUsed`, `adjust`, `geom`,
`composite`, `outWidth`, `outHeight`, `openStroke`, `fillTolerance`, and
`brush.opacity` / `brush.color`. History entry kinds added: `paint`, `adjust`,
`geom`; `stroke` and `paint` entries may carry `paintDelta`.

`render.spritestudio.js` — `SPRITE_TOOLS_DRAW`, `SPRITE_TOOL_HINTS`,
`SPRITE_ADJUST_ROWS`, `spriteCropDrag`, `commitSpriteCropDrag`,
`syncSpriteEditorColor`, `spriteNote`, `spriteColorRow`, `spriteSwatchRow`,
`spriteTintRow`. New dispatch actions: `sprites.editor-swatch`,
`sprites.editor-flip`, `sprites.editor-reset-adjust`,
`sprites.editor-crop-artwork`, `sprites.editor-reset-frame`.

**Implementation session (2026-08-27, Phase 5 — the cleaning suite):**

- **Built and verified.** `dev/verify/verify-sprite-p5.js` — **25 assertions**.
  The editor core in `spritestudio.js` (pure array math, no canvas), its
  screen in `render.spritestudio.js`, ten dispatch cases in `ui.js`, and the
  `.spe-*` stylesheet in `index.html`. The Edit button is back.
- **THE ARCHITECTURE, and the thing to not break.** There are two kinds of
  edit and they must not destroy each other:
  - **parametric** — the matte sliders (D18) re-run `image.js`'s own
    `cutoutAlphaLevels` / `cutoutSuppressSpill` / `cutoutPruneSpecks` against
    the master **from scratch** on every change. Recomputing from source is
    what makes them non-compounding: drag alpha-floor up and back down and
    you are byte-identical to where you started (asserted).
  - **destructive** — eraser, restore, magic-erase, accumulated by hand.

  If they shared a buffer, every slider drag would wipe every stroke. So
  strokes live in a separate signed `strokeMask` (negative erases, positive
  restores) and the working image is `composite(tuning(master), strokeMask)`.
  Asserted from both directions: a slider drag does not resurrect erased
  pixels, and clearing edits does not reset the tuning.
- **A 200-deep history is only affordable because it stores SPARSE DELTAS.**
  A full stroke mask at 512×768 is 786 KB, so 200 snapshots would be ~150 MB.
  Each entry holds the touched indices plus their prior values. A stroke that
  changes nothing does not commit — otherwise a player could fill their undo
  stack with no-ops (asserted). One slider *drag* commits **one** entry, not
  sixty: `input` repaints live, `change` rewinds to the pre-drag value and
  re-applies through the committing path.
- **Two real bugs found by running it, both the same shape.** Phase 4 found
  that `cleanCutout` refines an alpha channel and cannot create one; Phase 5
  found the same gap twice more:
  1. **Opening an uploaded sprite resurrected its backdrop.** `record.master`
     is the pristine file (correctly — D6 needs it for recrop and reset), so
     the editor was loading a white rectangle and saving it back opaque.
     Measured: a saved edit came back with **corner alpha 255**. Fixed by
     splitting `ed.pristine` (saved as `record.master`) from `ed.master` (the
     editing source — pristine, matted if it had no alpha of its own). A
     consequence worth having: **restore now brings back the original
     artwork, not the original background**, which is what the word means to
     a player.
  2. **A zero-size canvas produced NaN coordinates.** `spriteCanvasPoint`
     divided by a `getBoundingClientRect` width of 0 when the window was not
     laid out, and NaN silently did nothing. It returns null now and the
     callers bail.
- **A layout bug the default window size exposed.** In a 640px window the
  scene preview's side text wrapped into a tower and squeezed
  `.spe-canvaswrap` to **24px tall**. The canvas now has a `min-height`
  floor, the preview bar wraps, and a container query narrows the panel under
  720px. Worth knowing: this app wants a roomy window.
- **Live verification, `dev-harness.html`** — the whole path, with real
  `PointerEvent`s on a real canvas:
  - **Magic erase** on a grey residue blob: 255 → 0, with the shirt and head
    untouched at 255.
  - **Eraser drag** across three points: continuous (no gaps at 70/100/115/130),
    nothing erased off the stroke line, and **released far outside the
    canvas** — pointer capture let go cleanly, and a stray `pointermove`
    afterwards drew nothing.
  - **Undo/redo**: a pixel touched only by the last segment restores; one
    touched by an earlier segment correctly stays erased. Full undo to index
    −1 and full redo both land exactly.
  - **Save round trip**: `origin: 'edited'`, revision 2, the saved image has
    **no backdrop (corner alpha 0)** and carries the stroke, and the stored
    master is still the **pristine** file at 255.
- **Suite: 3222 passed / 72 failed / 8 harness errored** — baseline held.

**Implementation session (2026-08-27, Phase 4 — the app):**

- **Built and verified.** `dev/verify/verify-sprite-p4.js` — **29 assertions**.
  New files: `src/srcfiles/spritestudio.js` (the verbs) and
  `src/srcfiles/render.spritestudio.js` (the screens), the pairing
  `studio.js`/`render.computer.js` already uses. New app in
  `defs.computer.js` (`sprites`, `category: 'utility'`,
  `devices: ['computer','phone']`); nav state in `computer.js`'s
  `defaultComputerState().apps.sprites`; twelve dispatch cases in `ui.js`; an
  icon in `icons.js`; CSS, the script tags and a hidden
  `#sprite-upload-input` in `index.html`. `spritestudio.js` is in
  `loadgame.js`'s `ORDER`; `render.spritestudio.js` deliberately is **not**
  (it is pure view code, and the render layer is outside that loader).
- **A promise the code could not keep, found live and fixed.**
  `SPRITE_STORE.importRemoveBg.cutout` is `true`, and `ingestSpriteUpload`
  called `cleanCutout` to honour it. But **`cleanCutout` refines an alpha
  channel; it cannot create one** — a generated cutout arrives with RMBG's
  mask already applied, which is all that function has ever had to cope with.
  An uploaded JPEG has no alpha at all and a flattened PNG rarely does, so
  alpha is 255 everywhere, the whole frame reads as subject, and the measured
  result was a **full-frame bbox with `bottomFrac: 0`** — i.e. an uploaded
  sprite would have been placed at the wrong scale, floating.
  `spriteMatteFromBackground` (in `sprites.js`) now derives the alpha first.
  It is the algorithm validated against the real reference images in
  `dev/design/sprite-studio/matte-and-measure.py`, **two tolerances and all**:
  a loose border-connected flood (30) to lift the backdrop, plus a tight
  global pass (6) for background *walled in* by the subject. Re-measured live
  on a fixture carrying both traps: 512×768 → **140×640**, `bottomFrac`
  0.089, **white shirt kept at alpha 255**, **leg gap cleared to 0**.
  Also pinned in the harness, including an assertion that a single tolerance
  demonstrably cannot do both jobs.
- **The master is now genuinely pristine.** It is drawn from a second canvas,
  because by the time the blob is taken the working canvas has had the matte
  written into it. Without that, D6's "the untouched source" would have been
  the *matted* source, and recrop/reset would have been one-way after all.
- **Deliberately absent: the Edit button.** The plan's Phase 4 file list
  includes it, but Phase 5 builds the editor, so in Phase 4 it would be a
  button that silently does nothing (there is no `sprites.edit` case). It was
  present briefly, spotted in live testing, and removed. A dead affordance is
  worse than a missing one in an app whose whole job is telling the player
  what state their art is in.
- **Live verification, `dev-harness.html`, both surfaces.**
  - **Computer:** the app opens as a window, 19 roster cards each with a real
    avatar chip, filters counting correctly (`All 19 / Household 4 / Has
    custom art 0 / Needs art 19`), the storage meter reading `0 of 240 slots ·
    0.0 MB of 48.0 MB`. Clicking a card navigates to the character sheet
    (screen → `character`), which shows the avatar panel with
    Regenerate/Upload/**Recrop**/Pin, the 18/24/40/56 size strip, a 3×3
    pose×expression grid, and — after selecting a cell — Regenerate/Upload.
  - **Phone:** the `sprites` tile appears in the app grid, opens the same
    roster (18 cards, `data-device="phone"`), and the character sheet carries
    Regenerate/Upload/Pin with **no Recrop**, plus the "Painting tools are on
    the computer" note. D16 confirmed from both sides.
  - **A real upload round trip** through a real canvas (the one path the Node
    harness cannot reach): decode → matte → clean → measure → store as a
    wildcard slot → resolves as an override for a *different* outfit → an
    avatar derives from it (`source: 'derived'`, crop 206×206).
- **Suite: 3197 passed / 72 failed / 8 harness errored** — baseline held.

**Implementation session (2026-08-27, Phase 3 — the queue and the ambient tier):**

- **Built and verified.** `dev/verify/verify-sprite-p3.js` — **24 assertions**.
  New in `sprites.js`: `spriteTierOf`, `characterArtMode`,
  `characterArtEnabled`, `spriteTierCeiling`, `spriteQueue`,
  `noteSpriteActivity`, `spriteReadySetFor`, `spriteReadiness`,
  `spriteQueueRefill`, `spriteQueueBudgetLeft`, `spriteQueueBlockedReason`,
  `spriteQueueStep`, `spriteQueuePump`. New in `config.js`: `SPRITE_QUEUE`.
  New in `defs.settings.js`: `CHARACTER_ART_MODES` + the `characterArt` field
  + an Appearance row. New in `settings.js`: `activeCharacterArt`.
- **D14 needed a foreground signal that did not exist, so one was built.**
  All **16** `root.generateImage` call sites (every one of them is in
  `image.js`) now route through `generateImageTracked`, with `imageBusy()` as
  the single honest answer to "is the game already spending quota on something
  the player is waiting for?". Without it D14 was unenforceable — sixteen call
  sites each knew only about themselves. Asserted both ways, including that
  **the counter unwinds when a generation throws** (a stuck counter would
  starve the queue permanently and silently).
- **The obvious pump deadlocks; `spriteQueuePump` schedules instead.**
  `render()` calls `noteSpriteActivity()` and then the pump, so at the moment
  of the call the game is by definition not idle — a test-and-run pump would
  never once execute. It arms a timer for the idle window, re-arms on
  transient blocks (not-idle / foreground-busy / hidden), stops on terminal
  ones (setting-off / budget), and stops when there is no work so the next
  `render()` re-arms it. That is how a newly-arrived roommate is picked up
  without anything polling.
- **The scene renderer now goes through the resolver, and layers are keyed by
  SLOT ID.** `renderSceneCutouts` called `getCharacterCutout`/`getPlayerCutout`
  directly, which meant **a sprite the player painted would never appear in a
  scene** — the whole point of the override store, missing. It now calls
  `resolveSprite(..., { generate: true })`; `generate: true` is correct here
  and *only* here on the render path, because a character the player is
  looking at is the one case where making the art now is what they want.
  Keying on the cache key was a second bug in waiting: an override produces a
  different key for the same character, so the diff would have dropped the
  layer and built a new one (a flash, a restarted transition, a re-request).
  The resize handler was updated to match.
- **Live verification, `dev-harness.html`** — all three of the plan's Phase 3
  live checks:
  - Two active + two ambient + player = **5 layers**; ambient at scale 0.82
    and z 1/5, active at 1.0 and z 11/13, player at 100. The z **bands** never
    overlap, so a promote can never reorder the foreground.
  - Promoting an ambient NPC: **the same DOM node** rescaled 0.82 → 1.0, moved
    z 5 → 14, dropped `is-ambient`, and **zero generations**. The CSS
    transition animates the promotion instead of re-fetching.
  - Character art = Off: **0 cutout layers, plate still shown**, queue reports
    `setting-off`, a forced `spriteQueueStep` returns false, and an isolated
    window of 4 renders plus a forced step produced **0 generations**. Off
    genuinely means off.
- **Suite: 3168 passed / 72 failed / 8 harness errored** — baseline held.

**Implementation session (2026-08-27, Phase 2 — avatars and the shared chip):**

- **Built and verified.** `dev/verify/verify-sprite-p2.js` — **26 assertions**;
  `verify-sprite-p1.js` grew to **34**. New file `src/srcfiles/avatar.js`,
  registered in **both** `index.html` (`?v=1`, after `sprites.js`) and
  `loadgame.js`'s `ORDER`. `AVATAR_TUNING` added to `config.js`;
  `detectHeadCrop` / `spriteAlphaMask` / `deriveAvatarFromCutout` /
  `resolveAvatar` / `derivedAvatarKey` added to `sprites.js`.
- **All three top-of-phase blockers fixed and confirmed live** in
  `dev-harness.html`: `fp-clip-player` now exists (the defs loop covers
  `'player'`), the player hydrates (`hydrateFloorPlanAvatars` iterates the
  player as a subject), and the marker carries
  `preserveAspectRatio="xMidYMid slice"` so a square avatar fills the ring
  instead of letterboxing. Measured: 18 markers for a 17-NPC cast + player,
  18 clip paths.
- **A FOURTH kv storm was found by measuring, and fixed.** Memoising only the
  *hits* killed Evidence 3's `kv.meta` write storm and left a **read** storm
  untouched: measured live at **18 `kv.images.get` per render, on every
  render, forever** (54 across three), because the steady state of this game
  is a roster with no art yet and a miss was never remembered. `sprites.js`
  now has a `spriteMissCache`, cleared by every write path. Re-measured:
  first render 20 reads + 1 index load, **next five renders zero kv calls**.
  Pinned by three assertions in `verify-sprite-p1.js`, including that a
  remembered miss never outlives the art that answers it and never swallows
  an explicit `generate: true`.
- **A real bug the harness caught: subject-less chips were colliding.**
  `cutoutIdentityToken` falls back to hashing `id || name || ''` when there is
  no `genSeed`, which is right for its purposes and wrong for a chip — RoomList
  mints ~30 stubs a day with no genSeed, and every one of them was taking the
  *same* fallback token. They would have shared a memo entry and, the moment
  that token acquired art, all worn the same face. `avatarIdentityFor` is now
  strict: no real anchor (`bible.genSeed`, or `portrait.seed` for the player)
  means **no identity**, which means initials, which is correct for something
  that is not a character yet.
- **Call sites converted (all of them).** `render.computer.js` ×10 (applicant
  profile, applicants grid, move-in offers, browse stubs, the fetch-queue row,
  studio character list, studio profile header, both Messages avatars, the
  studio gallery tile); `ui.js` ×1 (`conv-avatar`); `render.js` (the floor-plan
  markers, plus the new per-line speaker chip). `hashToColor` **moved** from
  `render.computer.js` to `avatar.js`; `initialsFor` is **deleted** from
  `render.js` — `avatarInitials` is the one implementation now, asserted.
  Remaining `charAt(0)` sites are all non-people and deliberately untouched:
  Streamly shows, Nile products, browser favicons, EduStream course badges,
  room letters.
- **`render.phone.js` needed no change** — it reuses `COMPUTER_RENDERERS`
  unchanged (`render.phone.js:8`), so converting the computer's renderers
  converted the phone's too. The plan's file bullet expected work here; there
  was none to do.
- **Flagged deviation — the conversation BUBBLES were left alone.** The plan
  said "each dialogue row in `conv-log`" gains a chip. `conv-log` is a
  two-party chat with side-based attribution (`conv-bubble[data-from]`), where
  a per-bubble face adds noise without adding information, and the header chip
  already says who you are talking to. The **scene reader** got the chips
  instead, which is where several people speak in one block and a face is
  doing real disambiguation work (`mountSpeakerChip`, `render.js`). Verified
  live: a known speaker gets a chip, an unknown name gets none and the line
  reads exactly as before, narration gets none.
- **Live verification, `dev-harness.html`.** Chips render at their intended
  sizes (18px map / 32px `im-avatar` / 96px hero), the player's chip carries
  the accent ring and the `p…` identity, a stub carries no identity, and
  `dev-harness.html`'s kv folder list gained `sprites` per its own
  keep-in-step-with-`KVFolders` comment. **Note for whoever tests here:**
  `generateText` is stubbed to throw, so generated NPCs have **empty names** —
  a chip showing `?` in this harness is the D10 floor working, not a bug.
  Assign `npc.bible.name` before testing anything name-shaped.
- **Suite: 3144 passed / 72 failed / 8 harness errored** — failures and errors
  unchanged from baseline, passes up by this phase's 26 plus Phase 1's three
  new ones.

**Implementation session (2026-08-27, Phase 1 — the store and the resolver):**

- **Built and verified.** `dev/verify/verify-sprite-p1.js` — **31 assertions,
  all passing.** New file `src/srcfiles/sprites.js`, registered in **both**
  `index.html` (after `image.js`, `?v=1`) and `dev/verify/loadgame.js`'s `ORDER`
  in the same commit.
- **Real identifiers the next session will grep for.** `spriteSlotId` /
  `parseSpriteSlotId` / `cutoutVariant` / `wildcardVariantOf` /
  `isWildcardVariant`; `loadSpriteIndex` / `spriteIndexEntry` /
  `writeSpriteIndexEntry` / `spriteStoreUsage` / `spriteStoreHeaviest`;
  `getSpriteRecord` / `putSpriteRecord` / `deleteSpriteRecord` /
  `markSpriteBroken` / `listSpriteSlots`; **`resolveSprite`**,
  `invalidateSprite`, `clearSpriteSession`, `spriteUrlCache`. Constants:
  `SPRITE_KINDS`, `SPRITE_WILDCARD`, `SPRITE_AVATAR_VARIANT`,
  `SPRITE_INDEX_KEY`, and `SPRITE_STORE` in `config.js`.
- **D3's stated order is a PRIORITY, not an execution order — and the
  difference is the whole point.** The plan lists the session map third.
  Executing it third would mean two `kv.sprites` reads before the memo, which
  is precisely Evidence 3's kv storm. So `resolveSprite` checks the memo
  **first**, and answers "is there an override?" from the **in-memory index**
  rather than from kv — a slot with no override costs *zero* `kv.sprites`
  reads, ever. Asserted with a counting kv, not assumed: 5 redraws × 20
  characters = **0 kv calls**. If you change this, that assertion is the one
  that will catch you.
- **Flagged deviation — `kv.sprites` is NOT in `SAVE_KEYS`.** The plan's Phase
  1 bullet had overrides riding along inside saves. They do not. The folder is
  browser-local and save-independent (like `kv.menu`'s settings and the
  `kv.images` LRU), registered in `KVFolders` + `FOLDER_VERSIONS` for
  migration only. Reason: tying authored art to a save payload means loading
  an older save can destroy work made later — exactly the failure design
  invariant 2 exists to prevent, arriving through the save system instead of
  through eviction. Slot ids anchor on `genSeed`, stable across saves of a
  run, so a save-independent store just works. Moving art between machines
  stays Phase 8's export/import, which is a deliberate act. The full reasoning
  is in a comment above `KVFolders` in `state.js`.
- **Two upstream fixes landed in passing.** (1) `checkAndMigrateFolder`
  (`state.js`) now returns early when `root.kv[folder]` does not exist — a
  brand-new folder joining `KVFolders` hits `versions[folder] === 0`, so it
  does *not* early-return on version match and would have reached into an
  unprovisioned folder. `sprites` is the first new folder since that code was
  written; any future one would have hit the same wall. (2)
  `dev/verify/loadgame.js`'s vm sandbox had **no `URL` at all**, so any path
  reaching `image.js`'s `createObjectUrl` threw. Added as a deterministic
  counter stub (`blob:test/N`) rather than Node's real implementation —
  no file in this project ever constructs a real `URL` (grep: only
  `createObjectURL`/`revokeObjectURL` are used). Same category as the typed
  arrays and `innerWidth` gaps found during the cutout work.
- **Suite: 3115 passed / 72 failed / 8 harness errored**, against the
  documented baseline of **72 failed / 8 errored**. Failures and errors
  unchanged; passes up by exactly this phase's 31.
  **Caveat on how that was measured, so nobody re-runs it and panics:** a
  `git stash` baseline comparison is *misleading in this working tree*,
  because `config.js`, `state.js`, `index.html` and `loadgame.js` all carried
  pre-existing uncommitted work when this session began. Stashing reverts that
  too, which drops the D17–D20 `CUTOUT_TUNING` values and fails 6 tests in
  `verify-cutout-p1.js` that have nothing to do with this plan. Compare
  against the documented 72/8 numbers, not against `HEAD`.
- **Not built, and deliberately.** `resolveSprite` returns `source: 'none'`
  for `kind: 'avatar'` unless an override exists, and that result is
  **deliberately not memoised** — Phase 2 makes this branch answer with the
  cutout-derived crop (D8), and a cached null would outlive the reason for it.
  The seam is commented in place.

**Last session's notes (design session, 2026-08-27 — no code written):**

- The codebase was audited before any decision was made. What already exists,
  and must not be rebuilt: the whole cutout generation and cleanup pipeline
  (`image.js:733`–`1229`, `CUTOUT_TUNING`/`CUTOUT_POSES` at `config.js:5386`),
  the layered scene renderer (`render.js:1063` `renderSceneCutouts`), the
  shared image info/reroll modal (`ui.js:8318` `setImageMeta` → `openImageInfo`),
  the file-import pattern this plan's upload flow copies (`ui.js:8201`,
  `FileReader` + `index.html:6783`'s hidden `<input type="file">`), and the
  Character Studio's create/list/profile shape (`render.computer.js:2488`).
- **Three latent bugs were found in the existing avatar layer**, all silent
  today and all guaranteed to surface the moment avatars actually populate.
  They are Phase 2's top-of-phase blocker; see Evidence below for the
  measurements. Do not start Phase 2 by writing new code — start by fixing
  those three.
- Four decisions came from the design conversation with the user and are not
  open: the studio is a **computer *and* phone** app (D16); the avatar is
  **cutout-derived by default but independently overridable** (D8); generation
  is **lazy with an eager pass for the household** (D12); the deliverable is
  **plan plus design canvas**.
- **D9 was rewritten the same day, against real pixels.** The user generated
  nine reference images from the game's own Stage 0 prompts; the original
  shoulder-break scan was run against them and did not work — six of seven
  subjects fell through to the clamp. See Evidence 5, and
  `dev/design/sprite-studio/refs/out/REPORT.md` for the full run. **Do not
  re-derive the original;** it is recorded there specifically so nobody does.
  `dev/design/sprite-studio/matte-and-measure.py` is the reference
  implementation of the replacement and of the Phase 5 flood tool, and its
  cases are what `verify-sprite-p2.js` should port.
- The same run found five defects belonging to the **cutout** plan (Evidence
  7). They are that document's business, not this one's, but somebody should
  carry them across — D20's negative prompt does not actually stop cast
  shadows, and D16 cannot tell a `bottomFrac` of 0 from a figure cropped off
  at the thigh.
- The design canvas for the studio UI is published separately; if its link is
  lost, the artboards are reproducible from the Phase 4/5/6 file bullets,
  which carry the same layout decisions in prose.

**Blockers / flagged deviations:** None.

---

## The thesis

Every person in this game is currently a **letter in a coloured circle**.

Not as a placeholder — as the shipped design. The floor plan draws one
(`render.js:716`). The conversation header draws one (`ui.js:6156`). RoomList's
browse grid, the applicant cards, the Messages contact list, the Character
Studio's own gallery tiles, the phone's contact rows: twenty-six separate
hand-rolled `hashToColor(name) + name.charAt(0)` templates across two files,
each one independently reinvented, none of them sharing a line of code.

This is a game about *living with people*. Its social model tracks fourteen
kinds of memory, gossip propagation, willingness curves, and the difference
between what an NPC knows and what they can plausibly have noticed — and it
represents all of it with the first letter of a name.

Meanwhile the machinery to fix it is already built and already stalled. The
cutout plan generates transparent, per-character, deterministic full-body
sprites and layers them into the scene. It is code-complete. It has been
code-complete since 2026-08-21, and it cannot move to `complete/` because
**nobody in this repo can see what it produces.** `root.generateImage` only
exists inside Perchance's runtime; the verify harness stubs it; the plan's
Handoff carries a six-item live-run checklist whose every item is some version
of *"go look at the pixels and tune it."*

The first real run confirmed why that gate matters: heavy background speckle,
root-caused to two failures at opposite ends of the pipeline, fixed by four
new decisions (D17–D20 there) that were themselves written against a synthetic
reproduction rather than against real output. The remaining 15% of residue is
explicitly noted as "the half of this that cannot be unit-tested here."

So the pipeline is stuck in a loop: it cannot be tuned without seeing output,
and seeing output requires shipping it. The way out is not a better algorithm.
**The way out is to stop requiring the algorithm to be perfect.**

Give the player an eraser, a despeckle slider wired to the same
`CUTOUT_TUNING` table the pipeline uses, a preview of the sprite standing on
the actual room plate, and a regenerate button — and a 15%-residue cutout
stops being a blocking defect and becomes a ten-second cleanup. Give them
upload, and a character can look like anything they want. Give them the crop
handle, and the headshot that fills every one of those twenty-six letter
circles is theirs to frame.

That is the shape of this plan. A permanent store for art the player made, a
resolver that puts it ahead of anything generated, one avatar component to
replace twenty-six, a queue that keeps the household ready without spending
the world's quota, and a Sprite Studio on the computer and the phone that owns
all of it.

### What this plan is *not*

- **Not a redesign of the cutout pipeline.** `cleanCutout`, `cutoutKey`,
  `composeCutoutSeed`, `CUTOUT_TUNING` and the D17–D20 cleanup stages are
  consumed as they are. If a tuning default turns out wrong, that is an edit
  to a number in `config.js` and a note in the *other* plan — not a new
  algorithm here. The single most likely way this plan fails is by quietly
  becoming Cutout Pipeline v3.
- **Not a layered image editor.** One RGBA buffer plus a preserved master
  (D17). No layer stack, no blend modes, no selection masks beyond the flood
  tools, no text tool. Layers are a different product and would eat every
  remaining phase.
- **Not a character editor.** The Sprite Studio never writes `npc.bible`,
  never touches `physical.*`, never renames anyone (D21). The Character Studio
  owns who someone *is*; this one owns what they *look like on screen*. Two
  apps writing one struct is how the AI-generation plan's Phase 5 nearly went
  wrong, and its top-of-phase check exists for exactly this reason.
- **Not an animation system.** Poses are a discrete catalogue of three
  (`CUTOUT_POSES`) and stay that way. No frames, no rigs, no sprite sheets in
  the walk-cycle sense. The cutout plan's D9 already refused this once.
- **Not a second image cache.** `kv.sprites` holds *only* art a human
  authored, uploaded, or explicitly pinned. Generated art stays in the
  existing LRU where eviction is free. The instant the override store starts
  holding regenerable pixels, its cap becomes a lie and the player's own work
  starts competing with machine output for space.
- **Not a way around the live run.** The cutout plan's live-run checklist
  still has to happen. This plan makes items 2, 3, 5 and 6 answerable *from
  inside the game by the player*, which is far better than a developer
  answering them once — but item 1 (does alpha survive the canvas→blob round
  trip) is still a precondition for all of it, and if it fails, Phase 5 is
  building a paint program for opaque rectangles. **Check item 1 first.**

---

## Evidence

Four measurements taken from the live code this session. All four are the
reason a phase exists.

### 1. The map avatar is wired to the wrong image, and cannot be right

`hydrateFloorPlanAvatars` (`render.js:823`) fills each marker from
`composeCharKey(npc, 'neutral', 'standing')` — the `char_` **portrait** key.
That image is generated at `IMAGE_CACHE.resolutions.char` = **512×768**, and
`buildCharacterPrompt` (`image.js:434`) asks for *full body, clean background,
character sheet pose* — a whole standing figure, head to feet.

The marker it lands in (`render.js:717`):

```
<image x="-9" y="-9" width="18" height="18" clip-path="url(#fp-clip-<id>)" />
```

SVG `<image>` defaults to `preserveAspectRatio="xMidYMid meet"`, so a 2:3
source fits to **12×18 inside an 18×18 box**, and the clip is a **circle of
r=9**. The visible result is a 9-radius circle cut from the middle band of a
letterboxed *full-length standing figure* — i.e. roughly the subject's waist —
with transparent gutters either side of the circle where the 12-wide image
does not reach the 18-wide box.

This has never been seen because the hydrate path is cache-only by design and
`char_` portraits are generated almost nowhere. It is not a styling bug. There
is no crop of a 512×768 full-body character sheet that is a good 18px map
token, which is what D8/D9 exist to fix.

### 2. The player has no clip path, and never hydrates at all

The `<clipPath>` defs loop (`render.js:231`) iterates `Object.keys(gs.npcs)`.
`avatarMarkerHtml('player', …)` (`render.js:717`) emits
`clip-path="url(#fp-clip-player)"` regardless. **That id is never defined.**

Per CSS Masking, an invalid `clip-path` reference applies no clipping at all,
so the player's marker art would render as an unclipped 12×18 rectangle
straddling the 9-radius ring. It has never been observed because
`hydrateFloorPlanAvatars` also loops `gs.npcs` only — the player is skipped
entirely and shows "You" forever.

Both bugs are invisible today and both become visible on the first day
avatars actually exist. Phase 2 fixes them before it adds anything.

### 3. Every render pays O(roster) kv writes, once avatars populate

The call chain is unconditional:

```
render()                    render.js:10
  └─ renderFloorPlan()      render.js:200
       └─ hydrateFloorPlanAvatars(gs)   render.js:210  →  loops ALL of gs.npcs
```

and per NPC it calls `getCachedImage` (`state.js:1023`), which on a **hit**
does:

```js
await root.kv.meta.update('meta', (meta) => ({ ...meta, imageIndex: { …, [key]: Date.now() } }));
```

A cache *miss* returns before the write, which is the only reason this is not
already a problem — today essentially every lookup misses. Populate avatars
for a 20-person roster and every single player action costs 20 `kv.images.get`
plus 20 read-modify-write `kv.meta` transactions, on a shared meta record that
also carries the session log and the day-rollover economy fields.

The fix is not a smaller loop. It is that **nothing should reach kv for a
sprite more than once per session** — which is D3's in-memory resolution map,
built in Phase 1 and consumed in Phase 2.

### 4. Ambient characters are in the room, in the prose, and not in the picture

`layoutSceneCutouts` (`image.js:613`) builds its slot list from
`sceneState.active` alone. But scene presence is two-tiered: `promoteToActive`
/ `demoteToAmbient` (`npc.js:1424`–`1456`) maintain a capped foreground
`active` set and an `ambient` list holding everyone else in the room, and the
LLM context builder feeds **both** (`llm.js:80`, `npc.js:1568`).

So an NPC can be described by the scene reader, be addressable, appear in the
present-list (`ui.js:5559` reads `active` *and* `ambient`) — and be absent
from the scene image. The user's ask ("every character or actor in the game
world should generate cutouts which appear in the scene rendering window") is
not satisfied by the current renderer, and the gap is exactly one tier wide.

### 5. D9 was tested against real generations before being written, and failed

Nine reference images were generated from the game's own Stage 0 prompts
(`dev/design/sprite-studio/refs/PROMPTS.md`) — six characters chosen to break
a crop heuristic in six different ways, plus a talking variant, a room plate,
and one `char_` portrait. `dev/design/sprite-studio/matte-and-measure.py`
mattes them and runs the pipeline's own math, ported verbatim from
`image.js`, plus D9. **Full write-up:
`dev/design/sprite-studio/refs/out/REPORT.md`.**

Caveat, stated once and applying to everything here: the references arrived
without `removeBackground: true`, so the alpha comes from a flood-fill
stand-in, not RMBG-1.4. Nothing below tests RMBG. It does test everything
downstream of the mask, which is shipped code, and D9, which was not.

**D9 as originally specified did not work.** Sampling "head width" from the
top 5% of the bbox samples the *crown* — the narrow dome at the top of the
skull — so the reference width read ~40% low (72px against a real head width
nearer 120px) and `1.6×` an underestimate was crossed while still inside the
head. **Six of seven subjects fell through to the `minSideFrac` clamp**: the
guard rail was doing all the work and the detector none. No value of
`shoulderRatio` fixes it, because the reference is measured in the wrong
place.

The width profiles show two populations, split by **hair, not build**:

```
Sam     0%:  5   4%:117   8%:134  12%:106  16%: 55  20%:112     <- neck, unmistakable
Theo    0%:  2   4%: 93   8%: 89  12%: 92  16%: 74  20%:102  24%:195
Julian  0%:  2   4%:129   8%:136  12%:120  16%: 95  20%: 92  24%:130

Marisol 0%:  4   4%: 83   8%:113  12%:126  16%:130  20%:175     <- no neck, ever
Nadia   0%: 10   4%: 85   8%:141  12%:157  16%:172  20%:179
Priya   0%:  6   4%:108   8%:157  12%:184  16%:204  20%:221
```

Short or tied hair gives an enormous neck signal (Sam narrows 137 → 55).
**Long hair worn down gives none at all** — the profile rises monotonically
from crown to hip because the hair fills the neck and covers the shoulder
line. Half the subjects. So the neck is a refinement available on *some*
people, never the primary mechanism, which is why D9 now sizes
proportionally and lets a detected neck narrow it.

After the rewrite no clamp fires on any subject, and the two paths converge —
neck-derived sides land at 0.232–0.264 of bbox height, the proportional
default at 0.269. Two independent methods agreeing is the best evidence
available that the number is right.

A second failure came out of the same run and became **D9b**: a high bun put
`bbox.minY` at the top of the *hair*, sliding the frame up and cutting the
subject's mouth off. Anchoring to the head's widest row instead fixed it and
left the six good crops unchanged.

**None of this makes the recrop surface optional.** It makes it the exception
rather than the rule, which is the correct relationship — Phase 7 exists for
the subject whose hair defeats the heuristic, and there will be some.

### 6. The magic-erase tool needs two tolerances, and they are measurable

Compositing the first cutouts on a dark plate exposed bright white slabs
between the legs, under arms and through gaps in hair — background regions
**enclosed by the subject**, which a border-connected flood can never reach.
The naive fix, a global threshold, punches a hole straight through a white
t-shirt. Measured on one image carrying both traps, with `d` = distance from
white along the darkest channel:

| Region | min | p10 | median |
|---|---|---|---|
| Outer background | 0 | 1 | **1** |
| Enclosed leg gap | 0 | 1 | **2** |
| A white t-shirt | **8** | 25 | 28 |

True background is essentially pure white; a white *garment* never is, because
it is shaded. A loose connected flood at `d < 30` plus a tight global pass at
`d < 6` separates them with margin to spare.

This is a Phase 5 requirement on evidence rather than intuition: the
magic-erase tool must be **click-anywhere** (so the player can reach an
enclosed region at all) *and* carry a **visible tolerance control** (because
one setting demonstrably cannot serve both jobs).

### 7. Findings that belong to the cutout plan, not this one

The same run turned up five defects in
`character-cutout-scene-rendering-plan.md`'s territory. They are recorded in
full in `REPORT.md` §F4–F8 and summarised here only so they are not lost:

- **Cast shadows survive D20's negative prompt** — four of seven generations
  have one, and because it touches the feet it is contiguous with the subject,
  so the D18/D19 prune cannot remove it either. D20's claim that the negative
  prompt handles this is false.
- **Generation crops figures mid-thigh** (two of seven), and D16 cannot tell
  `bottomFrac: 0` meaning "feet at the frame bottom" from "figure cut off by
  the frame". A cropped generation gets placed with a severed thigh on the
  floor line at full standing scale.
- **D14 decontaminates toward a colour that is on nobody.** The subject's
  global opaque mean came out `[111,102,105]`, `[101,83,80]`, `[120,98,92]` —
  muddy greys averaging skin, denim, hair and shoes. A white halo around
  auburn hair becomes a *grey* halo. The reasoning is sound; the sampling
  window is too wide. A local mean would be right.
- **The seated pose sits on an invisible chair**, at chair height, with
  nothing guaranteeing the plate has a chair where the layout puts it.
- **Plates hardcode `'Anime-inspired illustration style'` while cutouts get
  no style at all** on default settings. Possibly the literal answer to that
  plan's live-run item 6.

What the run *confirmed working*, which matters as much: **D18's wisp rescue
fires and does real work** (2 components rescued on one subject, 4 on
another — hair strands and fingertips strict adjacency would have severed and
the speck prune then deleted), and **D19's dominance prune and
main-component bbox behave** (component areas like `[152953, 11, 4, 1, 1]`,
every fragment correctly erased, the bbox anchored so no stray pixel could
pin it open).

---

## Locked decisions

### The store and the resolver

- **D1 — Two stores, one resolver, and they hold different kinds of thing.**
  Generated art stays in the existing `kv.images` LRU
  (`IMAGE_CACHE.cap` 500, `state.js:1023`), where eviction is free because
  everything in it is reproducible from a seed. Art a *human* produced —
  uploaded, painted, cropped, or explicitly pinned from a regenerate — lives
  in a **new permanent `kv.sprites` folder that is never LRU-evicted.**
  Player work is not reproducible; a cache is the wrong shape for it, and one
  eviction is one destroyed thing the player made.
- **D2 — A slot id is `<identity>|<kind>|<variant>`.** `identity` is
  `cutoutIdentityToken(who, isPlayer)` — already the anchor for both NPCs
  (`n<genSeed>`) and the player (portrait seed), so overrides survive
  everything an npc id does not. `kind` is `cutout` or `avatar`. `variant` is
  `<pose>_<expression>_<outfit>` for a cutout (matching `cutoutKey`'s
  dimensions) and `default` for an avatar. The outfit segment may be the
  literal `*` — see D5.
- **D3 — One resolution order, one function, no exceptions.**

  ```
  exact override  →  wildcard override  →  in-memory session map
                  →  kv.images (generated key)  →  generate  →  placeholder
  ```

  `resolveSprite(identity, kind, variant, opts)` is the only thing in the
  codebase permitted to read a sprite blob. It memoises resolved object URLs
  in an in-memory `Map` for the session, which is what makes Evidence 3's
  per-render kv storm impossible rather than merely unlikely. Every consumer —
  the scene renderer, the map, the chip component, the studio itself — goes
  through it.
- **D4 — An override is style-agnostic, and it wins over style.**
  `cutoutKey` folds `imageStyleToken()` (`image.js:761`) so an 18-style
  change repaints everything. A slot id does **not**. A player who painted a
  character's sprite meant "this is what she looks like", not "this is what
  she looks like in Anime mode"; having their work vanish on a settings toggle
  is the worse of the two surprises. The studio makes the trade visible: an
  overridden slot shows a **Custom — style off** badge and a one-click
  **Revert to generated**. A per-slot style-lock is parked, not built.
- **D5 — Outfit wildcards, because the exact-match trap is real.** A cutout
  variant carries `cutoutOutfitToken(who)` — clothing state plus three garment
  ids (`image.js:743`). Paint a sprite, have the NPC change her shirt, and the
  slot id no longer matches: the player's work silently stops appearing and
  looks lost. So the studio's save dialog offers **this outfit** or **every
  outfit** for the same pose+expression, the latter storing under
  `<identity>|cutout|<pose>_<expression>_*`, and D3's order checks exact
  before wildcard. Default for an *edit* is this-outfit; default for an
  *upload* is every-outfit, because someone uploading a picture of a character
  is describing the character, not the laundry.
- **D6 — Every override keeps its master.** A record stores **two** blobs:
  `master` (the untouched source — the generated cutout, or the uploaded file
  as it arrived) and `image` (the working result). Recrop, the restore brush,
  "reset edits", and re-running cleanup at different tuning all read `master`.
  Without it, every edit is one-way and the first bad eraser stroke costs a
  regeneration. This doubles the byte cost of an override and is worth it.
- **D7 — The store is capped, and the cap is visible, and nothing is evicted
  silently.** `SPRITE_STORE.maxSlots` (default 240) and
  `SPRITE_STORE.softByteBudget` (default 48 MB). The studio shows usage on its
  roster screen. At the cap, a save is **refused with a message naming what to
  delete**, never satisfied by evicting somebody's work. This is the exact
  inverse of the LRU's contract and the inversion is the point.
- **D8 — The avatar derives from the cutout by default and is its own slot
  regardless.** Two states:
  - **`linked`** — no blob stored. The avatar is computed on demand by
    cropping the current cutout. The record holds only
    `{ mode:'linked', crop:{x,y,w,h}|null, sourceVariant }`; a null crop means
    "auto-detect" (D9). Cheap, always matches the sprite, survives a cutout
    regeneration for free.
  - **`pinned`** — a stored blob, from an upload, a dedicated headshot
    generation, or a paint edit.

  Regenerating or uploading an **avatar** never touches the cutout, and
  regenerating a **cutout** never overwrites a pinned avatar. A linked avatar
  does follow its cutout, because that is what linked means. The studio shows
  which state a slot is in and switching is one click each way.
- **D9 — The head crop is proportional by default, refined by a neck when one
  exists.** *(Rewritten 2026-08-27 after being tested against eight real
  generations — see Evidence 5. The original spec, a shoulder-break scan off
  the median width of the top 5% of the bbox, was structurally wrong and is
  recorded there so nobody re-derives it.)*

  `detectHeadCrop(mask, w, h, bbox)` walks the opaque run-width per row and:
  1. finds the **head peak** — the widest row in `[peakLoFrac, peakHiFrac]`
     of bbox height, i.e. cheekbone/ear level;
  2. finds the **neck** — the narrowest row between the peak and
     `headBandFrac`;
  3. calls the neck real only when `peakWidth / neckWidth >= neckRatio`.

  With a real neck, the crop's core is the neck row plus `chinDropFrac`. With
  no neck — **which is half of all subjects, because long hair worn down
  covers the neck entirely and the width profile rises monotonically from
  crown to hip** — the core is simply `defaultHeadFrac` of bbox height. Either
  way the side is clamped into `[minSideFrac, maxSideFrac]`.

  The square is centred **on the head's widest row**, not on `bbox.minY`
  (D9b below), and horizontally on the centroid of the head rows only, so a
  raised arm cannot pull the frame off the face.
- **D9b — The vertical anchor is the head's widest row, never the topmost
  opaque pixel.** `bbox.minY` is the top of whatever is highest — a bun, a
  hat, a raised tuft — so hanging the crop off it slides the whole frame up
  and eats the chin. Measured: a high bun did exactly that and cut the
  subject's mouth off. The widest row of the head sits at cheekbone level,
  roughly the middle of the face, and is stable across hairstyles;
  `faceBiasFrac` nudges down from there so the chin clears.

### Avatars in the UI

- **D10 — Initials are the floor, never the failure.** Every avatar surface
  paints synchronously as a coloured initial chip and *upgrades* when art
  resolves. There is no loading state, no spinner, no layout shift, and no
  code path where a missing image produces an empty circle. The LRU can evict,
  a generation can fail, a brand-new applicant has nothing — all three are the
  normal case, not the error case.
- **D11 — One component, everywhere, and the old ones are deleted.**
  `avatarChip(identity, opts)` in a new `src/srcfiles/avatar.js` (following
  `fields.js` and `icons.js` as the precedent for a small shared-component
  file). It emits the same DOM for an 18px map token and a 40px conversation
  header, differing only by a size class. **All twenty-six hand-rolled
  templates are removed in Phase 2**, not left as fallbacks — a fallback here
  is a second implementation that drifts, and the floor-plan hydrate path is
  already the worked example of what a bespoke one-off costs (Evidence 1–3).
- **D12 — Lazy everywhere, eager for the household.** A background queue with
  four priority tiers: `player` > `resident` > `present` (anyone in the
  player's current room) > `contact` (messaged or `contactKnown`). **Nothing
  below `contact` is ever generated eagerly** — `gs.npcs` grows unbounded as
  RoomList loads full profiles on demand, and a roster you met once must not
  cost quota.
- **D13 — One cutout buys both assets.** Because the avatar is cutout-derived
  by default (D8), the eager pass generates exactly **one**
  `standing`/`neutral`/current-outfit cutout per household member. The avatar
  falls out of it for free. This is what makes eager generation affordable at
  all, and it is why D8's default matters mechanically and not just as taste.
- **D14 — The queue never competes with the foreground.** One generation in
  flight, and only when no foreground image request is pending. A scene plate,
  a peek frame, a dream panel or an outcome-window image always wins. The
  queue yields between items and stops entirely when the tab is hidden.
- **D15 — Ambient characters render too, behind and smaller.**
  `layoutSceneCutouts` takes `[...active, ...ambient]`, and ambient slots get
  `scale × ambientScale` (0.82), a `z` below every active slot, and
  `filter: saturate(.9) brightness(.94)` via an `is-ambient` class. This is a
  depth cue that the presence model was already handing us for free (Evidence
  4). Ambient cutouts are generated at `present` priority, never eagerly.

### The Sprite Studio

- **D16 — One app, two device profiles.** A new `sprites` app in
  `defs.computer.js` with `devices: ['computer', 'phone']`, `category:
  'utility'`. The phone carries **browse, regenerate, upload, revert, set
  active, link/pin** — every asset-management verb. The **paint canvas is
  computer-only**, and the phone says so with a real affordance rather than a
  missing button. A precision raster editor on a simulated phone screen is a
  worse tool than no tool, and `renderPhoneScreen` reuses `COMPUTER_RENDERERS`
  unchanged (`render.phone.js:8`) so the split costs one capability check, not
  a second renderer.
- **D17 — Single RGBA buffer plus a preserved master.** No layers (see "what
  this is not"). The editor's whole state is: `master` ImageData, `working`
  ImageData, a history stack of ImageData snapshots, and the tool settings.
  Everything else is derived.
- **D18 — The cleanup sliders *are* `CUTOUT_TUNING`.** Alpha floor/ceiling
  (D17 there), spill suppression (D14 there), close radius, speck area, speck
  relative max, border components, border-ignore-bottom — the studio exposes
  the same fields, running the **same functions** (`cutoutAlphaLevels`,
  `cutoutSuppressSpill`, `cutoutPruneSpecks`, `cutoutMorphClose`,
  `image.js:831`–`1067`) against `master`, live. A per-slot tuning override is
  saved with the record. This is the single highest-value idea in the plan:
  it turns the other plan's unverifiable tuning gate into a feature, and it
  means a bad default costs a slider drag instead of a release.
- **D19 — Preview on a real plate.** The editor's backdrop toggles between
  checkerboard, white, near-black, and **the current room's actual plate**
  (`getScenePlate`), with the sprite drawn at true scene scale and the scene
  reader's frosted panel overlaid at its real height. The cutout plan's
  live-run item 6 asks "do they read as one image, or as stickers on a photo?"
  — this is where that gets answered, by the person who can act on the answer.
- **D20 — Two hundred levels of undo, and autosave on commit.** Inherited
  verbatim from the Home Design Studio's D7, including its reasoning:
  *"the undo stack matters more than the autosave: closing a tab is rare, a
  confident wrong drag is not."* A commit is a completed stroke or a settled
  slider, not a mousemove.
- **D21 — The studio edits pixels, never people.** No write to `npc.bible`,
  `npc.appearance`, `player.physical`, or any field the Character Studio owns.
  The two apps share `cutoutIdentityToken` and nothing else. Cross-links are
  navigation only.

### The editor's five kinds of edit (Phase 6)

- **D23 — The paint layer is a SECOND overlay, and it sits ABOVE the stroke
  mask.** `strokeMask` (Int16, signed) says how opaque the *artwork* is;
  `paint` (RGBA) is literal colour the player put there. The composite is
  `paint over (strokeMask applied to tuning(master))`, in that order, because
  a player who erases a patch and then draws a new arm into it has to see the
  arm. The other half of that promise is that **the eraser clears the paint
  layer directly** rather than by lowering alpha underneath it — erase,
  restore and magic-erase all carry an optional second `paintDelta` on their
  history entry so one undo takes both back. Asserted from both directions.
- **D24 — Colour and frame are PARAMETRIC, exactly like the matte.** Hue /
  saturation / lightness / brightness / contrast / tint, and flip / scale /
  crop, are held as descriptions and re-applied from source on every
  recompose. Two consequences that are the whole reason:
  - **Colour applies to the artwork, never to the paint layer** (and to the
    master the restore brush reads, so a restored pixel matches its
    neighbours). That is what makes an eyedropper pick round-trip exactly
    through the brush — pick a colour, paint with it, get that colour.
  - **Geometry is applied at the END of the pipeline, so the strokes stay in
    source space.** Every stroke delta is a list of buffer indices; baking a
    crop or a resample into the buffers would silently re-point up to two
    hundred undo entries at the wrong pixels. Held parametrically, a crop
    cannot invalidate history, a flip is undone by flipping back, and the
    master keeps every pixel so the frame can always be widened again.
    Pointer coordinates are mapped back through `spriteGeomToSource`.
- **D25 — One pointer DRAG is one commit.** D20 said it ("a commit is a
  completed stroke or a settled slider, not a mousemove") and the code did not
  do it: measured live, three pointermoves made three history entries, so a
  three-second stroke at 60Hz would push ~180 entries and evict a 200-deep
  stack. The entry now stays open for the length of the drag
  (`spriteEditorStrokeOpen` / `...Segment` / `...Close`) and the segments merge
  into it, keeping the earliest prior value per pixel and the latest next.

### Failure

- **D22 — A broken override degrades to generated, never to nothing.** If an
  override record is missing its blob, fails to decode, or carries a slot id
  whose character no longer exists, `resolveSprite` logs once, marks the record
  `broken: true`, and continues down D3's order as though the override were
  absent. The studio surfaces broken records on the roster screen with a
  **Delete** and a **Re-upload**. The record is never auto-deleted — a broken
  record is still the only evidence that the player made something.

---

## Data model

### `kv.sprites` record (Phase 1)

```js
// key = slot id, D2:  `${identity}|${kind}|${variant}`
{
  slot:     'n81421|cutout|standing_neutral_cdressed_o_ttee_bjeans',
  identity: 'n81421',
  kind:     'cutout',            // 'cutout' | 'avatar'
  variant:  'standing_neutral_cdressed_o_ttee_bjeans',  // or 'default', or '…_*'

  mode:     'pinned',            // 'pinned' | 'linked'  (linked: avatars only, D8)
  origin:   'edited',            // 'generated' | 'uploaded' | 'edited' | 'regenerated'

  image:    Blob,                // the working result — what resolveSprite serves
  master:   Blob,                // D6: the untouched source, never overwritten
  crop:     { x, y, w, h } | null,   // D8/D9: avatar crop rect in master pixels

  w: 512, h: 768,
  bbox:       { x, y, w, h },    // alpha bbox, measured at write
  bottomFrac: 0.058,             // D16 (cutout plan) floor anchor, measured at write

  tuning:   { alphaFloor: 96, speckRelMax: 0.09 } | null,  // D18 per-slot overrides
  source:   { key, prompt, seed, negativePrompt } | null,  // provenance for the ⓘ modal
  sourceVariant: 'standing_neutral_…' | null,              // linked avatars: which cutout

  broken:   false,               // D22
  revision: 3,
  editedAt: 1756304400000,
}
```

A `linked` avatar record omits `image`, `master`, `w`, `h`, `bbox` and
`bottomFrac` entirely — it is `{ slot, identity, kind:'avatar', mode:'linked',
crop, sourceVariant, revision, editedAt }` and typically under 200 bytes.
This is why linking is the default: a full household of linked avatars costs
less than one PNG.

### `SPRITE_STORE` (config.js, new — Phase 1)

```js
const SPRITE_STORE = {
  maxSlots:        240,        // D7 hard cap; refuse, never evict
  softByteBudget:  48 * 1024 * 1024,   // shown in the studio, warns at 80%
  maxUploadBytes:  6 * 1024 * 1024,
  uploadTypes:     ['image/png', 'image/webp', 'image/jpeg'],
  // An upload that is not already RGBA gets an alpha channel added and, if
  // the studio's "remove background on import" toggle is on, run through
  // cleanCutout with the slot's tuning. A JPEG has no alpha at all, which is
  // why the toggle defaults ON for cutouts and OFF for avatars.
  importRemoveBg:  { cutout: true, avatar: false },
};
```

### `AVATAR_TUNING` (config.js, new — Phase 2)

Every value below is **measured**, not chosen — see Evidence 5 and
`dev/design/sprite-studio/refs/out/REPORT.md` for the run that set them.

```js
const AVATAR_TUNING = {
  // D9 — head structure search
  headBandFrac:    0.25,   // window from bbox top to look for head + neck in
  peakLoFrac:      0.02,   // head-peak search starts below the crown sliver
  peakHiFrac:      0.15,
  neckRatio:       1.25,   // peakWidth / neckWidth before a neck counts as real
  defaultHeadFrac: 0.24,   // crown -> chin as a share of bbox height (no neck)
  chinDropFrac:    0.30,   // below the neck line, as a share of the core
  headroomFrac:    0.12,   // above the crown, as a share of the crop side
  faceBiasFrac:    0.10,   // D9b — nudge down off the widest row so the chin clears
  minSideFrac:     0.16,   // crop side floor, as a share of bbox height
  maxSideFrac:     0.34,   // ...and ceiling, so a failed scan cannot take the torso
  outputSize:      256,    // stored/derived avatar is a 256x256 square PNG
  sizes: { map: 18, chip: 24, header: 40, card: 56, hero: 96 },  // CSS px, D11
};
```

`minSideFrac`/`maxSideFrac` are the guard rails for a mask that failed
outright. **On the eight real subjects measured, neither fires** — which is
the point: in the original spec six of seven fell through to the clamp, so the
guard rail was quietly doing all the work and the detector none. A clamp that
fires routinely is a detector that does not work.

### `SPRITE_QUEUE` (config.js, new — Phase 3)

```js
const SPRITE_QUEUE = {
  tiers: ['player', 'resident', 'present', 'contact'],   // D12; nothing below is eager
  maxPerDay:      12,      // in-game day rollover resets the counter
  maxPerSession:  40,
  idleMs:         2500,    // quiet time required before the queue may start
  yieldMs:        400,     // between items
  // D13: what "ready" means for a character. One cutout; the avatar derives.
  readySet: [{ pose: 'standing', expression: 'neutral', outfit: 'current' }],
};
```

### Readiness (derived, never stored — Phase 3)

```js
spriteReadiness(gs, identity) -> {
  tier:    'resident',
  avatar:  'custom' | 'derived' | 'none',
  cutouts: { total: 9, present: 4, custom: 1 },   // of the pose x expression grid
  state:   'ready' | 'partial' | 'queued' | 'none',
}
```

The roster screen renders one badge per character straight off this.

### Editor session state (Phase 5, in-memory only)

```js
{
  slot, master: ImageData, working: ImageData,
  history: [ImageData],  historyIndex: 7,   // D20, capped at 200
  tool: 'erase',  brush: { size: 24, hardness: 0.6, opacity: 1, color: '#000' },
  tuning: { ...CUTOUT_TUNING, ...slot.tuning },
  backdrop: 'plate',     // 'checker' | 'white' | 'dark' | 'plate'  (D19)
  anchor: 0.058,         // draggable floor line -> bottomFrac
  dirty: true,
}
```

---

## Implementation phases

### Phase 1 — The sprite store and the resolver

**Goal:** There is a permanent, capped, indexed store for player-authored art,
and exactly one function in the codebase that can read a sprite. Nothing in
the UI changes and no pixel moves — but every later phase becomes a small
patch instead of a new subsystem, and Evidence 3's per-render kv storm becomes
structurally impossible. This phase is entirely pure logic and is fully
covered by a verify harness.

**Files:**
- `src/srcfiles/sprites.js` **(new)** — the whole spine. `spriteSlotId`,
  `parseSlotId`, `wildcardSlotId`; `getSpriteRecord` / `putSpriteRecord` /
  `deleteSpriteRecord` over `root.kv.sprites`; `spriteStoreIndex` (a slot →
  `{bytes, editedAt, revision}` map kept in `kv.meta` so the roster's usage
  figures never require reading blobs); and **`resolveSprite`**, implementing
  D3's order verbatim with the session `Map` in front of it. Also
  `spriteStoreUsage()` and the D7 cap check that *refuses* rather than evicts,
  returning a named reason the UI can print. Place it after `image.js` in load
  order — it calls `getCharacterCutout`, `getCachedImage`, `createObjectUrl`.
- `src/srcfiles/config.js` — `SPRITE_STORE` (above). Nothing else; the cutout
  tables are consumed unchanged.
- `src/srcfiles/state.js` — `kv.sprites` joins the folder set. Extend the save
  snapshot/restore paths (`state.js:646`, `1358`, `1675`) so overrides ride
  along with a save and its slots, and so the orphan sweep that deletes
  `kv.npcs` keys with no live NPC **does not** delete sprite records — a
  character can be re-added, and D22 says a record is evidence. Add
  `deleteCachedImage`'s sibling for the override store.
- `dev/verify/loadgame.js` — add `sprites.js` to `ORDER`, and stub
  `root.kv.sprites`. *(The handoff prompt's hard rule: `ORDER` must list every
  file `index.html` loads, in the same commit. A prior incident silently
  dropped 175 assertions this way.)*
- `index.html` — one `<script src="src/srcfiles/sprites.js?v=1">` tag, after
  `image.js`.
- `dev/verify/verify-sprite-p1.js` **(new)**.

**Verification:** `node dev/verify/verify-sprite-p1.js`, and it must print its
pass/fail summary — a harness that only passes `node --check` is not verified
(five harnesses in this repo were syntactically broken and had never once
executed). Assert: slot ids round-trip through `parseSlotId` for all four
kinds including a wildcard and a player identity; D3's order holds in all five
positions, proven by seeding each layer independently and removing them one at
a time; an exact override beats a wildcard beats the LRU; the session map
serves a second read **without a second `kv` call** (spy on the stub —
this is Evidence 3's fix and it must be asserted, not assumed); a save at
`maxSlots` is refused with a reason and the existing records are untouched;
byte accounting matches the sum of the blobs; a record with a missing blob
resolves *past* itself to the generated key and is marked `broken` (D22); and
that `kv.sprites` survives a save→load→save round trip with its index intact.

---

### Phase 2 — Avatars: the crop, the component, and the twenty-six sites

**Top-of-phase blocker — fix these three before writing anything new.**
They are measured in Evidence 1–3 and every one of them is currently invisible:

1. `render.js:231` defines `<clipPath id="fp-clip-<id>">` for NPCs only; the
   player's marker references `fp-clip-player`, which does not exist.
2. `hydrateFloorPlanAvatars` (`render.js:823`) loops `gs.npcs` only, so the
   player never hydrates at all.
3. That same function is called from `renderFloorPlan` on **every** `render()`
   and does one `kv.images.get` + one `kv.meta.update` per cached NPC. It must
   be rewritten onto `resolveSprite`, whose session map makes it a no-op after
   the first pass.

**Goal:** Every character in the game is represented by their face. One
component does it in all twenty-six places, the map included, the player
included, and it degrades to initials without a single conditional at the call
sites.

**Files:**
- `src/srcfiles/sprites.js` — `detectHeadCrop` and `deriveAvatarFromCutout`
  implementing D9's shoulder-break scan against a decoded alpha channel, plus
  `resolveAvatar(identity)` which handles D8's linked/pinned split and caches
  a derived avatar in the **LRU** (not the override store — a derived avatar
  is reproducible, so eviction is free, and it must not consume D7's budget).
- `src/srcfiles/avatar.js` **(new)** — `avatarChip(identity, opts)` returning a
  node, and `mountAvatar(el, identity)` for the in-place case. Emits the
  initial-letter ring synchronously (D10) with `hashToColor` for the tint, then
  swaps in art when `resolveAvatar` settles. `opts.size` picks from
  `AVATAR_TUNING.sizes`; `opts.ring` carries the map's player/sleeping/transit
  states. **`hashToColor` moves here from `render.computer.js:3938`** — it is
  used by both files and belongs with the component, and `render.computer.js`
  keeps using it unchanged from its new home.
- `src/srcfiles/render.js` — the three blocker fixes; `avatarMarkerHtml` and
  `hydrateFloorPlanAvatars` rebuilt on `resolveAvatar`; the clip loop covers
  `player` too; the `<image>` gets `preserveAspectRatio="xMidYMid slice"` so a
  square 256×256 avatar fills the 18×18 box rather than letterboxing.
- `src/srcfiles/ui.js` — `conv-avatar` (`ui.js:6156`) becomes a chip; each
  dialogue row in `conv-log` and each dialogue line the scene reader composes
  gains a small speaker chip. This is the change the user asked for by name and
  it is the one that will be felt most.
- `src/srcfiles/render.computer.js` — the nine `rl-card-avatar` /
  `rl-profile-avatar` / `im-avatar` / `rl-studio-char-avatar` /
  `rl-studio-gallery-letter` sites, all replaced. Non-person avatars
  (`br-card-favicon`, `str-thumb-label`, `nile-thumb-label`, `es-card-badge`)
  are **not** touched — they are product tiles, not people, and pulling them
  into a person component is scope creep with a bug attached.
- `src/srcfiles/render.phone.js` — the contact rows and the camera share row
  (`render.phone.js:525`).
- `index.html` — `.avatar-chip` and its size modifiers; the `fp-avatar-img`
  rules adjusted for `slice`; one `<script src>` line for `avatar.js`.
- `dev/verify/verify-sprite-p2.js` **(new)** — the crop scan, on synthetic
  buffers.

**Verification:** Harness, against constructed alpha buffers exactly as
`verify-cutout-p1.js` does its pixel math — and the cases are no longer
guesses, they are the ones that actually failed (Evidence 5): a silhouette
with a **clear neck** takes the neck path and a **monotonic** one (long hair,
no narrowing anywhere) takes the proportional path, both landing within
0.20–0.30 of bbox height; a silhouette with a **tall crown mass** (a bun) is
centred on its widest row and keeps the chin, which is the regression D9b
exists to prevent; an all-transparent buffer returns null and `resolveAvatar`
falls to initials; the centroid tracks a head that is off centre; and
`minSideFrac`/`maxSideFrac` do **not** fire on any well-formed silhouette —
a routinely-firing clamp is the signature of the bug this replaced.

`dev/design/sprite-studio/matte-and-measure.py` is the reference
implementation and carries the measured expectations; port its cases rather
than inventing new ones. Then live, in `dev-harness.html`: grep the whole tree for
`charAt(0)` beside `hashToColor` and confirm **zero** person-avatar sites
remain; confirm the player marker clips to a circle; and — the one that
matters — instrument the `kv` stub and confirm a floor plan render with 20
cached avatars performs **one** batch of lookups on first paint and **zero**
on every subsequent `render()`.

---

### Phase 3 — The sprite queue, readiness, and the ambient tier

**Goal:** The household is always ready without anybody waiting, the world's
long tail costs nothing, and everyone standing in the room is standing in the
picture.

**Files:**
- `src/srcfiles/sprites.js` — `spriteQueue`: tiering by D12, the single-flight
  guard and foreground yield of D14, day/session budgets, and
  `spriteReadiness` (the derived record above). The queue is driven from the
  existing idle/tick path rather than a new timer, and it must consult the
  same in-flight flag the foreground generators set — add one if there isn't a
  usable one, in `image.js`, shared.
- `src/srcfiles/config.js` — `SPRITE_QUEUE`.
- `src/srcfiles/image.js` — `layoutSceneCutouts` takes
  `[...(sceneState.active||[]), ...(sceneState.ambient||[])]`, tags each
  placement `ambient: true|false`, and applies `ambientScale` and the z-order
  split (D15). The player stays centre-front and on top; active NPCs keep
  their band; ambient sits behind both. Placement seeding still excludes
  identity, per the other plan's D10 — only the *count* changes.
- `src/srcfiles/render.js` — `renderSceneCutouts` stamps `is-ambient` on
  ambient layers; the diff already keys on `data-cutout-key`, so a
  promote/demote moves a character between tiers without re-requesting art.
- `src/srcfiles/defs.settings.js` — an Appearance row: **Character art** with
  Off / Household only / Everyone I know, writing `SPRITE_QUEUE`'s effective
  tier ceiling. Off must genuinely mean off — the queue never runs and the game
  falls back to initials and plate-only scenes, which is also the honest
  answer for a player on a metered connection.
- `index.html` — `.scene-cutout.is-ambient`.
- `dev/verify/verify-sprite-p3.js` **(new)**.

**Verification:** Harness: tier assignment is correct for player, resident,
present, contact and a stranger (the stranger is **never** enqueued); the
budget stops the queue mid-roster and resumes after a day rollover; a
foreground request in flight prevents a queue start and the queue resumes
after; the ready set is one cutout per character and the avatar is *not*
separately enqueued (D13 — assert the queue length, because this is the number
that makes the eager pass affordable). Live: a room with two active and two
ambient NPCs renders four cutout layers, ambient behind and smaller; promoting
an ambient NPC to active rescales the existing layer without a new fetch;
the settings toggle at Off leaves the scene plate-only with no queue activity.

---

### Phase 4 — The Sprite Studio: app shell, roster, character sheet

**Goal:** The app exists on the computer and the phone, and every
asset-management verb works on both: browse the cast, see what art each person
has, regenerate a slot, upload a replacement, revert to generated, link or pin
an avatar. No painting yet — this phase is complete and useful on its own, and
it is the entire phone experience (D16).

**Files:**
- `src/srcfiles/defs.computer.js` — the `sprites` app: `id:'sprites'`,
  `label:'Sprite Studio'`, `category:'utility'`,
  `devices:['computer','phone']`, `entryScreen:'roster'`, screens
  `roster` / `character` (`hideFromNav`) / `editor` (`hideFromNav`,
  computer-only).
- `src/srcfiles/render.spritestudio.js` **(new)** — the renderers, registering
  themselves with `Object.assign(COMPUTER_RENDERERS, {…})` at load. A separate
  file because `render.computer.js` is already 5,870 lines; the registry is a
  `const` object literal (`render.computer.js:22`) and a later script can add
  to it, which is exactly how a new app should join now.
  - **Roster:** a grid of `avatarChip` cards at `hero` size, each with a
    readiness badge from `spriteReadiness`, sorted household-first. Header
    carries the D7 storage meter and a filter (All / Household / Has custom art
    / Broken). Broken records surface here with Delete and Re-upload (D22).
  - **Character sheet:** the avatar panel (current art, state badge —
    *Derived* / *Custom* / *Uploaded*, and Regenerate / Upload / Recrop /
    Pin / Unlink), then the sprite grid — rows are the three `CUTOUT_POSES`,
    columns the three `CUTOUT_EXPRESSIONS`, with an outfit selector above
    listing the outfits this character actually has art for plus "current".
    Each cell shows its state (generated / custom / missing / queued) and
    offers Regenerate, Upload, Revert, and — computer only — **Edit**.
- `src/srcfiles/spritestudio.js` **(new)** — the app's actions, separate from
  its rendering, matching how `studio.js` sits beside `render.computer.js`'s
  studio renderers: upload ingest (`FileReader` → decode → alpha-normalise →
  optional `cleanCutout` per `SPRITE_STORE.importRemoveBg` → measure bbox and
  `bottomFrac` → `putSpriteRecord`), regenerate (through the existing
  `getCharacterCutout` / a new `getCharacterAvatar` for pinned headshots,
  landing as `origin:'regenerated'`), revert, link/pin, and the D5 scope
  dialog (this outfit / every outfit).
- `index.html` — the studio's CSS block and one hidden
  `<input type="file" id="sprite-upload-input" accept="image/png,image/webp,image/jpeg">`,
  copying the save-import pattern at `index.html:6783` / `ui.js:8201`.
- `src/srcfiles/icons.js` — one app icon.
- `dev/verify/verify-sprite-p4.js` **(new)**.

**Verification:** Harness: upload ingest produces a record with a measured
bbox and `bottomFrac` and both blobs (D6); a JPEG upload gains an alpha
channel; an oversize file and a wrong MIME type are both refused with a named
reason; revert deletes the override and the next `resolveSprite` returns the
generated key; the D5 scope dialog writes the wildcard slot when asked and
the exact slot otherwise; regenerating an avatar leaves the cutout record
byte-identical and vice versa (D8 — assert both directions, it is the
decision most likely to be broken by a careless edit). Live: the app opens on
both computer and phone; the phone shows no Edit affordance and explains why;
a regenerate updates the scene and every avatar surface without a reload.

---

### Phase 5 — The editor: the cleaning suite

**Goal:** The player can make a bad cutout good. This is the phase the thesis
is about, and it is where the cutout plan's live-run checklist stops being a
developer's problem.

**Files:**
- `src/srcfiles/spritestudio.js` — the editor engine, all of it pure functions
  over `ImageData` so it is testable without a DOM:
  - **Matte panel (D18):** alpha floor/ceiling, spill suppression, close
    radius, speck area, speck relative max, border components,
    border-ignore-bottom — every one of them re-running the *existing*
    `cutoutAlphaLevels` / `cutoutSuppressSpill` / `cutoutMorphClose` /
    `cutoutPruneSpecks` against `master`, so a slider drag is a recompute from
    source and never a compounding edit. "Reset to defaults" restores
    `CUTOUT_TUNING`; "Save tuning with this sprite" writes `record.tuning`.
  - **Magic-erase (flood):** click a pixel, erase the contiguous region within
    a colour tolerance, with an antialias feather at the boundary. The single
    most useful tool against residue that abuts the silhouette — the exact
    15% the other plan says its prompt fix cannot reach. **Two requirements,
    both measured (Evidence 6), neither optional:** it must be
    *click-anywhere*, because the worst residue is background *enclosed* by
    the subject (the wedge between the legs, the gap under an arm, holes in
    hair) which no border-anchored sweep can reach; and it must expose its
    **tolerance** as a control, because a loose setting is needed to lift a
    backdrop and a tight one to clear an enclosed pure-white region without
    eating a white shirt — one value demonstrably cannot do both.
  - **Eraser / restore:** soft and hard, size and opacity. Restore paints
    alpha back **from `master`** (D6), which is what makes the eraser safe to
    use aggressively.
  - **Auto-trim:** recrop to the alpha bbox via the existing `cutoutBBox`.
  - **Floor anchor (D16 there):** a draggable line over the canvas writing
    `bottomFrac` directly. The manual answer to "are the feet on the floor",
    available the moment the automatic one is wrong.
  - History: `pushHistory` / `undo` / `redo`, 200 deep, commit-granular (D20).
- `src/srcfiles/render.spritestudio.js` — the editor screen: tool rail left,
  canvas centre, panel right (matte sliders, brush settings, history), backdrop
  toggle and **plate preview** (D19) beneath the canvas, showing the sprite at
  true scene scale with the reader panel overlaid at its real height. Pointer
  events on a `<canvas>`; pointer capture so a stroke that leaves the canvas
  still ends cleanly.
- `index.html` — the editor layout, the checkerboard backdrop, the tool rail.
- `dev/verify/verify-sprite-p5.js` **(new)**.

**Verification:** Harness, on synthetic buffers built the way
`verify-cutout-p1.js` builds its (a main blob, a detached speck, a wisp
attached through a 2px gap, plus a low-alpha haze reproducing the first live
run's failure): flood-erase removes a connected region and stops at the
tolerance boundary; the restore brush recovers exactly the alpha `master`
holds and never more; a matte slider round-trips — set, change, reset,
byte-identical to the untouched pipeline output; undo/redo across 200 commits
lands on the right buffer and the 201st drops the oldest; auto-trim's bbox
matches `cutoutBBox`. Live: a stroke that exits the canvas mid-drag ends
cleanly; the plate preview shows the real current room; the anchor drag moves
the sprite's feet in the preview.

---

### Phase 6 — The editor: drawing and colour

**Goal:** The player can *change* a sprite, not just clean it. Brush, fill,
eyedropper, and the colour adjustments that let a sprite sit on a night plate
without looking pasted on.

**Files:**
- `src/srcfiles/spritestudio.js` — brush (size / hardness / opacity / colour,
  drawn as a stamped soft circle along the interpolated pointer path so a fast
  stroke is not a dotted line), bucket fill constrained to the existing alpha,
  eyedropper, and the adjustment set: hue / saturation / lightness,
  brightness / contrast, and a **tint** slider whose whole purpose is matching
  a sprite to a dim plate. Plus flip-horizontal, uniform scale, and manual
  crop. All of them pure `ImageData → ImageData`, all of them recomputed from
  the *committed* buffer rather than compounding per frame.
- `src/srcfiles/render.spritestudio.js` — the tool rail's second group, the
  colour panel, and a swatch row seeded from the sprite's own dominant colours
  (a cheap histogram of opaque pixels) so recolouring hair means clicking the
  hair colour that is already there.
- `index.html` — colour panel styles.
- `dev/verify/verify-sprite-p6.js` **(new)**.

**Verification:** Harness: a brush stroke between two distant points is
continuous (no gaps — assert opacity along the interpolated path, this is the
classic bug); bucket fill never writes a transparent pixel; HSL adjustments
round-trip to identity at zero and are idempotent when reapplied from the
committed buffer; flip is its own inverse; scale preserves the alpha bbox's
aspect ratio. Live: an eyedropper pick matches the pixel under the cursor at
every zoom level.

---

### Phase 7 — The avatar crop surface and the override sweep

**Goal:** The headshot in every one of those twenty-six circles is the
player's to frame, and an override applies as widely as they meant it to.

**Files:**
- `src/srcfiles/render.spritestudio.js` — the recrop surface: the cutout master
  at full size with a square crop ring (drag to move, corner to resize,
  constrained square), an **Auto** button re-running `detectHeadCrop`, a live
  round preview at all five `AVATAR_TUNING.sizes` so the player sees the 18px
  map token and the 40px conversation chip at once — because a crop that reads
  at 96px can be unrecognisable at 18px, and that is a decision only visible
  side by side.
- `src/srcfiles/spritestudio.js` — writing a linked record's `crop` (no blob,
  D8), promoting to pinned when the player paints on an avatar, and the "use a
  different pose as the source" picker (`sourceVariant`).
- `src/srcfiles/sprites.js` — the wildcard sweep (D5): a **Where does this
  apply?** control on every override showing which slots it currently answers
  for, and a promote/demote between exact and wildcard that migrates the record
  rather than duplicating it.
- `dev/verify/verify-sprite-p7.js` **(new)**.

**Verification:** Harness: a linked record with a manual crop survives a cutout
regeneration and re-derives against the new pixels at the same rect; promoting
exact→wildcard leaves exactly one record; demoting wildcard→exact writes the
outfit currently in effect and no other; a pinned avatar is untouched by a
cutout regeneration (D8, again — assert it here too, from the other side).
Live: recrop, then check the map token and the conversation header both
changed without a reload.

---

### Phase 8 — Integration sweep

**Goal:** The promises in "what this plan is *not*" are pinned as assertions,
the storage story survives saves, and nothing generated is quietly living in
the override store.

**Files:**
- `dev/verify/verify-sprite-p8.js` **(new)** — one harness that asserts the
  boundaries rather than the features, the way `verify-cutout-p6.js` does:
  - `kv.sprites` contains **only** records whose `origin` is `uploaded`,
    `edited`, `regenerated`, or a `linked` avatar. Nothing with
    `origin:'generated'` may ever be in there (D1).
  - No slot id anywhere contains `IMAGE_PROMPT_VERSION`,
    `CUTOUT_PIPELINE_VERSION`, or a style token (D4/D5) — grep-level, so a
    future session cannot reintroduce it by copying `cutoutKey`.
  - The Sprite Studio's module writes no key under `bible`, `appearance`, or
    `physical` (D21) — assert over a spy'd NPC object, not by reading source.
  - Peek, photos, dream panels, outcome-window art and the menu gallery are
    untouched: their namespaces are still mutually distinct by prefix and none
    of them route through `resolveSprite`.
  - Every avatar surface renders with the store empty and the LRU empty (D10).
- `src/srcfiles/state.js` — a save/load round trip carrying overrides, and an
  **export/import** of the override store as a single file, reusing the save
  system's existing import plumbing. A player who spent an hour painting a
  household should be able to carry it to a new save.
- `src/ref/structural/ARCHITECTURE.md` — the four new files in the script-order
  list and the plan-summary table. *(Update in the same commit. Five docs were
  once deleted with eighteen live citations pointing at them because this was
  not done.)*

**Verification:** The full suite (`node dev/verify/run-all.js`) against the
recorded baseline — the failing set must be **identical** to baseline, not
merely similar. Then a live save → reload → save with a painted household, and
an export → fresh save → import.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | `kv.sprites`, slot ids, `resolveSprite` and its session map — 34 assertions |
| 2 | **Done** | Head-crop detection, the shared avatar chip, all call sites, the 3 blocker bugs — 26 assertions |
| 3 | **Done** | The generation queue, readiness, and ambient characters in the scene — 24 assertions |
| 4 | **Done** | The Sprite Studio app — roster and character sheet, computer + phone — 29 assertions |
| 5 | **Done** | The editor's cleaning suite, wired to `CUTOUT_TUNING` — 25 assertions |
| 6 | **Done** | The editor's drawing and colour tools — 43 assertions |
| 7 | **Done** | Avatar recrop, link/pin, the wildcard override sweep, and the paint-an-avatar path — 24 assertions |
| 8 | **Done** | Boundary assertions, save round trip, export/import — 22 assertions |

---

## Dependency order

```
Phase 1 (store + resolver) ──► everything else
        │
        ├─► Phase 2 (avatars + the 26 sites) ──► Phase 7
        │        └─ carries the 3 blocker bugs; do not defer them
        │
        ├─► Phase 3 (queue + ambient) ── independent of 4-7
        │
        └─► Phase 4 (studio shell) ──► Phase 5 (cleaning) ──► Phase 6 (drawing)
                                  └──► Phase 7 (recrop)

Phase 8 last, after everything it asserts about exists.
```

**What may safely run out of order:** Phase 3 touches only the queue, the scene
layout and one settings row; it can slot anywhere after Phase 1 and is a good
choice for a short session. Phase 6 is genuinely optional to the thesis — the
cleaning suite is what unblocks the cutout plan, and drawing is what the user
asked for; if a session has to stop early, stopping after 5 leaves a coherent
tool. Phase 7 needs 2 (for `detectHeadCrop`) and 4 (for a surface to put it
on) but not 5 or 6.

**What may not:** Phase 2 before Phase 1. The whole point of the resolver is
that the twenty-six call sites are converted **once**, onto the final
contract. Converting them against `getCachedImage` and re-converting later is
two risky sweeps instead of one.

---

## Open questions (parked, none blocking)

- **Should the studio be branded in-fiction?** It ships as a plain `utility`
  app called Sprite Studio, which the computer's OS chrome supports without
  pretending. A consumer-product skin (a photo app in the RoomList / Streamly
  / DoorDrop naming register) is available later and costs a label and an
  icon. Decide if the meta framing grates in play — not before.
- **A "sad" cutout expression.** The cutout plan deliberately refuses one
  (`cutoutExpressionFor`, `image.js:596`: a bad mood stays neutral because
  inventing a sad cutout silently would be worse than the omission). Once the
  studio exists, adding one is cheap and testable. Decide during Phase 5, when
  there is a way to look at the result.
- **Per-slot style lock (D4).** Overrides are style-agnostic. Whether a player
  ever wants "this painted sprite, but only in Noir" is unknown. Decide if
  anyone asks.
- **Sharing overrides between characters.** Two NPCs, one uploaded sprite. The
  slot grammar allows it (nothing stops the same blob in two records) but there
  is no UI and no dedupe. Decide during Phase 8, when the byte budget is real.
- **Should `bottomFrac` from an override feed the *floor plan*?** The map draws
  people as tokens, not figures. Probably no. Decide if the map ever grows a
  side elevation.

---

## Design invariants

1. **Nothing reads a sprite blob except `resolveSprite`.** The floor-plan
   hydrate path is the standing proof of what a bespoke one-off costs: a
   cache-only lookup against the wrong key, a clip path that does not exist, a
   player who never appears, and O(roster) kv writes per render — four defects
   in twenty lines, all of them silent, none of them findable until the day the
   cache stopped missing.
2. **A cache holds what can be regenerated; a store holds what cannot.** The
   moment a generated pixel is written to `kv.sprites`, D7's cap becomes a
   lie and the player's own work starts competing with machine output for
   space. `verify-sprite-p8.js` asserts this because a comment cannot.
3. **The master is never overwritten.** Every destructive operation reads
   `master` and writes `image`. This is what makes the eraser safe, the matte
   sliders non-compounding, and recrop possible a week later.
4. **Initials are the floor.** Every avatar surface must be correct with no
   image at all. Not "degrades gracefully" — *correct*, as the ordinary case,
   because a brand-new applicant, an evicted blob, and a failed generation are
   all normal.
5. **Two apps never write one struct.** The Character Studio owns the bible;
   the Sprite Studio owns the pixels. They share one identity token and nothing
   else. The AI-generation plan's Phase 5 carried a top-of-phase check for
   exactly this hazard and it is inherited here.
6. **Version tokens belong in cache keys, never in slot ids.** A cutout key
   folds `IMAGE_PROMPT_VERSION`, `CUTOUT_PIPELINE_VERSION` and the style token
   so a pipeline change repaints everything — which is right for generated art
   and catastrophic for authored art. Bumping a version must never be able to
   orphan something a player made.
7. **Measure, don't assume, and put the measurement where the player can see
   it.** The head crop is measured (D9), the floor anchor is measured (D16
   there) — and where the measurement is still wrong, the studio hands over the
   slider rather than waiting for a better constant. That is the whole
   argument of this plan compressed into one rule.
