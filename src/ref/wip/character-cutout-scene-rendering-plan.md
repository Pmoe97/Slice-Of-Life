# Character Cutout Scene Rendering

Status: **planned — not started**. Design session complete 2026-08-21; all
decisions locked (D1–D13).
Last updated 2026-08-21.

Companions:
- `src/ref/complete/scene-reader-ui-plan.md` (built — the frosted reader panel this plan renders *underneath*; the scene goes from one `<img>` to a plate plus layered cutouts below that panel)
- `src/ref/wip/settings-and-pause-overhaul-plan.md` (planned — its D9 image-style fold extends into cutout cache keys; a reduce-motion preference should ride its settings surface if it ships first)
- `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (built — peek's gated generative path stays untouched; clothing states and content-flag parity govern what cutouts may show)
- `src/ref/complete/player-creation-and-intro-plan.md` (built — `player.portrait.seed` is the anchor that makes player cutouts deterministic)
- `src/ref/complete/floorplan-and-movement-plan.md` (built — room/phase changes drive plate keys and the layout reseeds)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table near the bottom, as the very last thing you do each session. The
paired handoff prompt (`character-cutout-scene-rendering-handoff-prompt.md`)
does not exist yet — write it from `src/ref/patterns/HANDOFF-PROMPT-ARCHITECTURE.md`
at the start of the first implementation session.

---

## Handoff — read this first

**Resume at:** Phase 1. Nothing has been built yet.

**Last session's notes (design session 2026-08-21 — no code written):**
- **The idea's provenance.** `perchance.org/persona-realm` (fetched to
  `scratch/generators/persona-realm/` that day — a future session must
  re-fetch if it wants the source; scratch is ephemeral) generates each
  character ONCE as a transparent cutout, then composes each chat scene as
  an *empty* background plus the cutout drawn on top. Its source is the
  reference implementation for everything in the technical-reference
  section below.
- **Our current cost.** `src/srcfiles/image.js:getSceneImage` bakes every
  present NPC *and* the player into one image whose cache key
  (`composeSceneKey`, image.js:51) contains every character id plus the
  player identity token — one generation per unique cast combination, and
  the player token means two different saves in the same room can never
  share art.
- **What persona-realm does that we copy** (with source citations in the
  reference section): prompt for an isolated subject, call
  `root.generateImage({removeBackground:true})` (the text-to-image plugin
  runs BRIA **RMBG-1.4** locally via transformers.js), then a
  connected-component "specks" cleanup on the alpha channel, then an
  alpha-bounding-box for cropping/placement.
- **What we deliberately do NOT copy:** persona-realm flattens the cutout
  onto the background into one JPEG at generation time, one fixed
  bottom-center spot, no movement. Our whole point (D1, D9) is keeping the
  cutout as a live DOM layer that CSS moves.
- **Uncertainties for Phase 1 to settle:** whether the alpha survives the
  plugin's `result.canvas` → blob round-trip, and whether `removeBorderComponents`
  must stay off for seated/edge poses.

**Blockers / flagged deviations:** None.

---

## The thesis

Every scene currently pays for the same people twice. Generating a room's
backdrop is cheap *per picture*, but the picture is invalidated the moment
anyone walks in, leaves, sits down, or changes clothes — because the people
are baked into the same pixels as the room. One evening with four roommates
moving between rooms is four or five full generations of near-identical
room art with different faces on top, and the cache key correctly refuses
to share any of it (`composeSceneKey` carries every npc id AND the player
token, image.js:51–64). The player token alone means two saves can never
share a hallway.

Split the pixels by responsibility and the cost structure collapses. A room
plate is a function of the room, the phase, and what's on the table — *not*
of who is standing in it — so one plate serves every cast, every save,
every visit. A character cutout is a function of that one character —
identity, pose, expression, outfit — so it is generated once, cached, and
reused in every room they ever stand in, and it can be *moved*: CSS
repositions the same transparent PNG across the same plate when the scene
changes, instead of buying a whole new picture. This is persona-realm's
trick, generalized from its one-flattened-JPEG form into a live layered
renderer. The scene stops being "a drawing of a room with people in it" and
becomes "a room, with people standing in it" — which is also, for the first
time, a scene the game can actually *re-arrange*.

### What this plan is *not*
- **Not true animation.** No rigs, no skeletal motion, no frame loops — CSS
  `transform` transitions only, exactly per the brief. (A future idle-bob
  is parked in Open questions, explicitly out of scope.)
- **Not a persona-realm clone.** No user-uploaded sprites, no standalone
  persona studio; cutouts derive from this game's existing cast and player
  pipelines.
- **Not a change to peek.** The keyhole lens keeps its gated generative
  path (intimacy-voyeurism D6/D15); it may adopt cutouts later, deliberately
  not now.
- **Not a change to portraits.** `getCharacterImage` (computer RoomList,
  studio) stays exactly as it is. Portraits are not cutouts.
- **Not a behavior/content change.** This is purely a rendering-layer
  replacement. What a scene *is* (who's present, what's on the table, what
  state the characters are in) is unchanged; only how it is drawn changes.

## Evidence

The cache keys ARE the evidence (image.js:51–64, render.js:960–996):

- `composeSceneKey` = room + phase + lighting + **every present npc id** +
  **player identity token** + detail + orientation + style. The image is
  regenerated every time that tuple changes — i.e. every time anyone enters
  or leaves, every room change, every style change.
- The player token exists precisely because without it *different players'
  saves collided on shared cache entries* (image.js:57–61) — the current
  system can neither share art across casts nor across players, by design.
- persona-realm, by contrast, generates its character cutout once per
  persona (cached as a transparent PNG dataURL) and its scenes are just
  empty backdrops — a `genChatScene` whose negative prompt explicitly bans
  people (persona-realm index.html:1980). Its composition pass
  (`composeScene`, :1934) draws the cached cutout onto the fresh backdrop.

The observable difference: with 6–8 NPCs moving around, our scene namespace
grows multiplicatively; persona-realm's grows additively. This plan moves
us onto the additive curve.

---

## The cutout pipeline — technical reference

What follows is the full mechanism of the persona-realm system, documented
so a session can re-implement it without re-deriving it. Citations are to
`scratch/generators/persona-realm/index.html` (fetched 2026-08-21) and to
`imports/text-to-image-plugin/main.pjs` (read-only, always present). The
line numbers rot; names survive.

### Stage 0 — the prompt for an isolatable subject

The character is generated on a clean studio background so the mask has an
easy edge:

> `aesthetic 11, <character description>, isolated on solid pure white
> background, simple studio background, clean studio lighting, full body
> character sprite`

plus a negative prompt that bans anything that would read as
"background": `background details, background scenery, noise, artifacts,
textures on background, borders, frame, vignette, ...` (persona-realm
`negPrompt()`, :1032). Our game already has this idea: `buildCharacterPrompt`
(image.js:444) ends with `clean background, character sheet pose`.

### Stage 1 — `removeBackground: true` (the text-to-image plugin)

Passing `{ removeBackground: true }` to `root.generateImage` routes the
generated frame through the plugin's `removeBackground()` function
(imports/text-to-image-plugin/main.pjs:441–478):

1. Lazy-loads `@huggingface/transformers@3.3.3` from `cdn.jsdelivr.net`
   (`env.allowLocalModels = false`, wasm proxy on). First call per page
   pays the model fetch; the browser caches it.
2. Loads **`briaai/RMBG-1.4`** — BRIA's background-removal model — via
   `AutoModel.from_pretrained(..., {config:{model_type:'custom'}})` and an
   `AutoProcessor` configured to resize to **1024×1024**, normalize
   mean `[0.5,0.5,0.5]`, std `[1,1,1]`, rescale `1/255`.
3. Runs the image through the model, getting a single-channel foreground
   mask: `output[0].mul(255).to('uint8')` → `RawImage.fromTensor(...)`
   → `.resize(image.width, image.height)` back to the generated
   resolution.
4. Draws the original image onto a canvas and **overwrites the alpha
   channel per-pixel with the mask**: `pixelData.data[4*i+3] = mask.data[i]`,
   then `canvas.toDataURL('image/png')`.

Two properties worth knowing:
- The mask is **soft** (0–255, a per-pixel probability times 255) — the
  resulting cutout keeps soft edges; there is no hard cut and no
  morphological post-processing in the plugin.
- The mask is applied at the *generated* resolution (our
  `IMAGE_CACHE.resolutions.char`, 512×768), not upscaled.

### Stage 2 — the specks cleanup (`killParasitesSync`)

persona-realm post-processes the cutout with a connected-component
labelling sweep over the alpha channel (`killParasitesSync`, :881 →
`removeTinySpecksSync`, :839):

- Foreground = alpha > **20**. Components are found by flood-fill (an
  explicit `Int32Array` stack — no recursion, safe on 512×768).
- A **margin band** of `max(3, round(0.02 * min(W,H)))` px marks a
  component as "touching the border".
- A non-main component is **erased** (alpha → 0) if it is `area < 120` **OR**
  touches the border, *and* its area is `< 0.85 ×` the main component's area.
- The intent: remove floaters, dust, and background islands the mask left
  behind, keeping only the character's body. The 0.85 guard protects a real
  second figure or a large accessory.

This is a heuristic tuned for *centered full-body* subjects. Its border
rule would clip a character who legitimately reaches the frame edge — which
is exactly what seated/lounging cutouts do. **We adopt the algorithm with
the border rule configurable and defaulted OFF** (D5).

### Stage 3 — alpha bounding box (`spriteBBox`)

`alpha > 24` counts as part of the subject; the scan finds
`minX/minY/maxX/maxY` and returns the crop rect (persona-realm, :1908).
Used for cropping to the subject and for computing a placement scale.

### Stage 4 — composition (what we do NOT copy verbatim)

persona-realm's `composeScene` (:1934) draws the background to a 768×512
canvas, then draws the cutout bbox scaled to **84% of the canvas height**,
centered horizontally, bottom-anchored 12px from the floor, with a radial
gradient ground shadow (dark core `rgba(0,0,0,.85)` → transparent, ellipse
`w = max(60, 0.6×subjectW)`, `h = max(14, 0.34×w)`, center at `y = 505`),
and flattens to JPEG 0.92. The shadow is the good idea — it visually seats
the cutout on the floor plane and is trivially reproduced as a CSS radial
gradient under a positioned layer. The flattening is the bad idea — it's
the whole reason persona-realm's scenes can't move. **D1 discards it.**

### Stage 5 — the empty background

`genChatScene` (:1990) generates `768x512` backdrops with a prompt like

> `a vast empty landscape backdrop, no people, no characters anywhere:
> <scene>, <lighting>, wide 16:9 establishing shot, only scenery,
> uninhabited, completely empty, no living beings, no human figures, no
> foreground subject, background plate, landscape orientation`

and a negative prompt that bans every person-word it can think of
(`person, people, human, man, woman, child, boy, girl, crowd, face,
portrait, figure, character, creature, animal, silhouette, body, arms,
legs, hands, eyes, skin, text, letters, words, watermark, ...`, :1980).
We already ban *background* noise in `negPrompt()`; the cutout plan adds
the people-ban to the plate surface (D6).

---

## Locked decisions

### Layering and keys
- **D1 — The scene is a plate plus live cutout layers; nothing is flattened.**
  `.scene-container` gains a cutout layer between `#scene-img` and the
  scene reader: each present character is an absolutely-positioned
  `<img class="scene-cutout">` with a transparent PNG. No composite JPEG is
  ever produced or cached. (The explicit divergence from persona-realm's
  `composeScene`.)
- **D2 — Two cache namespaces, one LRU.** Plates key as
  `plate_<v>_<room>_<phase>_<detail>_<orientation>_<style>`; cutouts as
  `cut_<v>_<identity>_<pose>_<expression>_<outfit>_<style>`. Both live in
  the existing `kv.images` LRU (`state.js:getCachedImage/setCachedImage`,
  cap `IMAGE_CACHE.cap` 200 → **500**, config.js:5072). No npc id and no
  player token may ever re-enter a plate key.
- **D3 — Cutouts are deterministic.** Seed = `hashStr(identity|pose|expression|outfit|style)`,
  identity anchored to `bible.genSeed` (NPCs) or `portrait.seed` (player),
  exactly like `composeSceneSeed`'s anchors (image.js:83). Same character,
  same pose, same outfit → same pixels, forever. This makes LRU eviction
  invisible: a regenerated cutout reproduces its own art (D13's why).

### The catalogue
- **D4 — Poses and expressions are a small discrete set.** `CUTOUT_POSES`:
  `standing`, `seated`, `lounging`. `CUTOUT_EXPRESSIONS`: `neutral`,
  `happy`, `talking`. Outfit/clothing-state is a *key dimension*, not a
  pose. Bounded namespace per character ≈ poses × expressions × outfits
  actually worn.
- **D5 — persona-realm's specks cleanup, tuned.** Connected-component
  labeling on alpha (threshold 20), speck removal (`< 120` px **or**
  border-touching, both `< 0.85×` main), but `CUTOUT_TUNING.removeBorderComponents`
  defaults **false** so seated/edge poses aren't clipped. Alpha-bbox
  threshold 24.

### Prompt and gating
- **D6 — Plates ban people.** Character clauses leave the room prompt;
  `buildBackgroundPrompt` is `buildImagePrompt` minus people plus the
  persona-realm people-ban negative. The old character-baking path is
  *deleted* at switchover (Phase 3), not left as a fallback.
- **D7 — The player is a cutout too.** `getPlayerCutout` keyed by
  `playerIdentityToken` (portrait seed), rendered front-and-center —
  preserving the current "player is the scene's subject" rule (image.js:226–232).
- **D8 — Content parity with today's scenes, not with peek.** Cutout
  prompts carry the same clothing-state prose the current scene prompts do
  (nude/towel/sleepwear render as such; SFW worlds never reach those states
  so no nude cutouts occur). The detailed intimate layer
  (`composeIntimateDescription`) stays peek-only; cutouts never opt in, so
  their pixels are byte-identical whether the gate is open or shut.

### Rendering
- **D9 — CSS transforms, not animation.** One `.scene-cutout` rule consumes
  `--cutout-x`, `--cutout-y`, `--cutout-scale` into a single `transform`;
  `transition: transform .6s` smooths re-placement. `prefers-reduced-motion`
  disables the transition. No keyframes, no rigs.
- **D10 — Layout is deterministic and seeded.** `layoutSceneCutouts`
  seeds on `hashStr(plateKey | sortedCastIds)`: the same scene lays out the
  same way every visit. NPCs spread across a bottom band (z below the
  player), the player center-front. A laid table switches present characters
  to their `seated` cutout on the near side of the table.
- **D11 — Reroll rerolls the plate only.** The ⓘ modal's prompt/seed now
  describe the plate; Regenerate replaces it under the same plate key.
  Cutouts are untouched ("reroll characters" is parked in Open questions).

### Failure
- **D12 — Degrade order.** A missing/failed cutout hides that layer and the
  scene-reader text still narrates the character. A missing plate falls
  back to the existing placeholder behaviour. Render never blocks on a
  cutout: plates and reader paint immediately, cutouts fade in when ready.
- **D13 — Eviction is free.** Cutouts churn through the LRU like any image;
  because of D3, eviction + regeneration is invisible to the player.

## Data model

### `CUTOUT_TUNING` (config.js, new)
```js
const CUTOUT_TUNING = {
  bboxAlpha: 24,              // alpha-bbox threshold (persona-realm spriteBBox)
  speckAlpha: 20,             // foreground alpha in the cleanup
  speckAreaMax: 120,          // erase components smaller than this
  speckMainRatio: 0.85,       // ...and smaller than this share of the main
  borderMarginFrac: 0.02,     // border band: max(3, round(min(W,H)*this))
  removeBorderComponents: false, // D5: seated/edge poses may touch the frame
};
```

### Cache keys (image.js)
```js
function cutoutKey(identity, pose, expression, outfit, styleToken) {
  return `cut_${IMAGE_PROMPT_VERSION}_${identity}_${pose}_${expression}_${outfit}`
    + (styleToken ? `_${styleToken}` : '');
}
function plateKey(roomId, phase, detail, styleToken) {
  return `plate_${IMAGE_PROMPT_VERSION}_${roomId}_${phase}_${detail || 'plain'}`
    + `_${sceneOrientation()}` + (styleToken ? `_${styleToken}` : '');
}
// identity = `n<genSeed>` | `p<portraitSeed>` | `ph<appearanceHash>` (playerIdentityToken)
// outfit   = `c<clothingState>_o<outerwear>_t<top>_b<bottom>` (cutoutOutfitToken)
```

### The pose catalogue (config.js or image.js)
```js
const CUTOUT_POSES = {
  standing: { label: 'Standing', scale: 1.0,  bottomFrac: 0.06, seedWord: 'standing casually' },
  seated:   { label: 'Seated',   scale: 0.82, bottomFrac: 0.04, seedWord: 'seated' },
  lounging: { label: 'Lounging', scale: 0.90, bottomFrac: 0.03, seedWord: 'lounging' },
};
const CUTOUT_EXPRESSIONS = ['neutral', 'happy', 'talking'];
```

### Placement record (returned by `layoutSceneCutouts`, consumed by the renderer)
```js
{ charId, isPlayer, pose, expression,
  xFrac,      // 0..1 across the plate's width  (the layer's anchor)
  bottomFrac, // 0..1 up from the plate's bottom (the floor anchor)
  scale,      // pose.scale × layout spread factor
  z }         // draw order; player always top
```

## Implementation phases

### Phase 1 — The cutout factory
**Goal:** `getCharacterCutout(npc, pose, expression)` and `getPlayerCutout`
exist, produce transparent PNGs with persona-realm's cleanup and bbox, are
deterministic (D3), and round-trip through the existing LRU. Nothing is
wired into rendering yet.

**Files:**
- `src/srcfiles/image.js`: `cutoutKey`/`cutoutOutfitToken`; `composeCutoutSeed`
  (D3); `getCharacterCutout`/`getPlayerCutout` calling
  `root.generateImage(buildCharacterPrompt(...), { resolution: IMAGE_CACHE.resolutions.char,
  seed: composeCutoutSeed(...), removeBackground: true, negativePrompt: <cutout neg> })`
  then `cleanCutout` + `cutoutBBox`; `cleanCutout` (module-local
  connected-component sweep per D5, driven by `CUTOUT_TUNING`); `cutoutBBox`
  (threshold `bboxAlpha`). Cache via the existing `getCachedImage`/
  `setCachedImage` (state.js) — no new index, no new kv folder. Object URLs
  join the existing `activeImageUrls`/`cleanupImageUrls` bookkeeping.
- `src/srcfiles/config.js`: `CUTOUT_TUNING`; `IMAGE_CACHE.resolutions.cutout =
  '512x768'`; `IMAGE_CACHE.cap` 200 → 500 (D2).
- `index.html`: `.scene-cutout` base CSS (absolute, bottom-anchored band,
  transform driven by `--cutout-x/-y/-scale`, `pointer-events: none`,
  `object-fit: contain`, `will-change: transform`) — dead until Phase 3.
- Verify with `browser_eval`: generate a cutout for a known NPC; assert the
  PNG blob has real transparency (pixels outside the bbox have alpha 0,
  subject pixels opaque), the bbox is inside the frame, the second call
  hits the LRU (no second generation), and a same-seed regenerate is
  byte-identical (delete the key, regenerate, compare). Test a `towel` and a
  `nude` (mature-on) state to confirm clothing prose lands. **Phase 1 must
  also settle** whether alpha survives the plugin canvas → blob round-trip
  and whether `removeBorderComponents: false` is truly required for a
  standing cutout.

### Phase 2 — Empty background plates
**Goal:** `buildBackgroundPrompt` and `getScenePlate` exist alongside the
old path, untouching rendering, with the people-free prompt and the
people-ban negative proven. Additive; nothing is switched.

**Files:**
- `src/srcfiles/image.js`: `buildBackgroundPrompt(roomId, phase, roomObjects)`
  — everything `buildImagePrompt` does today (room, objects phrase, meal
  spread, sink mess, orientation framing, style) with the character clauses
  removed; `backgroundNegPrompt()` — `negPrompt()` + the persona-realm
  people-ban list (D6); `plateKey`/`composePlateSeed`; `getScenePlate`
  mirroring `getSceneImage`'s cache-then-generate shape under the plate key.
- `src/srcfiles/config.js`: nothing new (plate resolution reuses
  `IMAGE_CACHE.resolutions.scene`).
- Verify with `browser_eval`: prompt output contains no character name or
  clause for a cast of 3 + player; the people-ban negative is present;
  `plateKey` differs by room/phase/detail/style but is identical for two
  different casts in the same room; `getScenePlate` generates and caches.

### Phase 3 — Layered scene rendering (the switch)
**Goal:** `renderScene` draws a plate + positioned cutout layers, the plate
key no longer contains characters, the old character-baking path is gone,
and the scene reader still overlays it all. `IMAGE_PROMPT_VERSION` → `pv4`
(this plan's namespace turnover).

**Files:**
- `src/srcfiles/render.js`: `sceneArtContext` returns plate key/prompt/seed
  + the overlay plan; `renderScene` calls `getScenePlate` (idempotency
  gate: `data-scene-key` still guards plate work — the render.js:1015 fix
  must survive) and a new `renderSceneCutouts` that **diffs the live layer
  set** (`data-cutout-key` per layer) against the desired one: existing
  layers get their `--cutout-x/-y/-scale` vars updated (transition animates
  the move, D9), new layers are created and faded in when their
  `getCharacterCutout` resolves, stale layers are removed. Never re-stamp
  `data-loading` on the plate for a cutout-only change.
- `src/srcfiles/image.js`: `layoutSceneCutouts(gs, sceneState, plateKey)`
  per D10 (seeded spread, player front-center, seated mode on a laid
  table); delete the character-baking path — `buildImagePrompt` becomes
  `buildBackgroundPrompt`, `getSceneImage` is removed (render.js is its
  only consumer).
- `index.html`: finish `.scene-cutout` CSS incl. the floor shadow (a
  `.scene-cutout::after` radial gradient ellipse — persona-realm's Stage-4
  shadow as pure CSS), z-index under the reader, `prefers-reduced-motion`.
- Verify with `browser_eval` + `vision`: same room, two different casts —
  plate key identical (cache hit, no generation), cutout layers differ;
  player renders front/center; a laid table seats the present characters;
  moving between rooms repositions layers via the transition (computed
  `transform` changes); the scene reader still sits above the cutouts.

### Phase 4 — Reroll, info modal, degrade
**Goal:** the ⓘ modal rerolls only the plate; every failure path degrades
per D12; the game is fully playable with images off.

**Files:**
- `src/srcfiles/image.js` + `src/srcfiles/ui.js`: `rerollSceneImage` now
  regenerates under the **plate key**; modal prompt/seed fields are
  plate-scoped (D11).
- `src/srcfiles/render.js`: degrade paths — plate failure → existing
  placeholder; cutout failure → `.cutout-missing` class hides the layer
  (D12); `cleanupImageUrls` keep-list includes cutout URLs.
- Verify with `browser_eval`: reroll swaps the plate and leaves cutout
  layers identical; delete a cutout key → layer regenerates on next scene
  change; set generation to fail (bad seed / network) → reader still
  renders the scene text.

### Phase 5 — Catalogue, gating, tuning
**Goal:** the catalogue, key dimensions, content gating, style fold, and
LRU behaviour are final and measured.

**Files:**
- `src/srcfiles/image.js`: final `CUTOUT_OUTFIT` keying (`cutoutOutfitToken`
  — clothing state + worn slots; outfit change = new cutout, D4); style
  token folds into cutout keys (D2, mirrors `imageStyleToken`); expression
  selection from the scene context (talking when mid-dialogue, happy per
  mood, else neutral).
- `src/srcfiles/config.js`: final `CUTOUT_POSES`/`CUTOUT_EXPRESSIONS`;
  speck params tuned against real cutouts (vision pass on several
  characters — halos, clipped fingers, floating hair).
- `src/srcfiles/settings.js` (or `kv.menu 'settings'` read-if-present):
  `reduceMotion` honoured alongside `prefers-reduced-motion` (D9); respect
  whichever settings surface exists at implementation time.
- Verify with `browser_eval` + `vision`: an outfit change yields a new
  cutout key and regenerated art; a mature-off world's clothing state never
  reaches nude, so no nude cutout is ever requested (D8 — assert the
  prompt at the generation call site); a style change re-renders cutouts;
  after a day of simulated play the LRU holds a healthy plate:cutout mix
  and eviction caused no visible regeneration churn.

### Phase 6 — Integration sweep
**Goal:** every surface that reads scenes is re-verified, the menu
gallery/peek/portraits are provably untouched, and the plan records its own
tuning decisions.

**Files:**
- Sweep (read-only where unchanged): `render.computer.js` portraits
  (`getCharacterImage`), `peek.js`/`getPeekImage`, studio/player portrait,
  menu gallery, save/load round-trip through the LRU.
- Verify end-to-end with `browser_eval` + `vision` on the live page: new
  game → studio → first apartment scene; several rooms across day/night; a
  shared meal; a dialogue (talking expression); a room change mid-cast;
  reroll; a broken-image degrade. Vision-check composed scenes: characters
  seated on the floor plane with shadows, no halos, plate and cutouts
  reading as one image. Record any parameter changes (speck thresholds,
  scales, transition duration) in the Handoff.

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | Cutout factory: RMBG removal, specks cleanup, bbox, deterministic keys, LRU round-trip |
| 2 | Not started | Empty background plates: people-free prompt, people-ban negative, plate keys |
| 3 | Not started | Layered render: plate + positioned cutouts, layout, shadows, transitions, pv4 switch |
| 4 | Not started | Reroll = plate only; degrade paths; images-off playability |
| 5 | Not started | Pose/expression catalogue, outfit keying, content gating, style fold, tuning |
| 6 | Not started | Integration sweep + live visual verification + tuning record |

## Dependency order

```
Phase 1 (cutout factory) ─┐
                          ├─► Phase 3 (layered render) ─► Phase 4 ─► Phase 5 ─► Phase 6
Phase 2 (bg plates) ──────┘
```

Phases 1 and 2 are independent and purely additive — either can slot in
alone. Phase 3 needs both and is the only phase that changes live
rendering, so it is the first phase where the game visibly changes. Phase 5
overlaps Phase 4 (both touch image.js's reroll/gating seams; keep them in
one session's focus at a time). Phase 6 is last by definition.

## Open questions (parked, none blocking)
- **Do seated cutouts need a real seated pose, or does a lower-anchored,
  slightly-scaled standing cutout read well?** persona-realm never tested
  this (it only ever placed one standing figure). Decide in Phase 3 with a
  vision pass over a laid-table scene; the pose catalogue (D4) is written
  to absorb the answer either way.
- **Should computer portraits eventually reuse cutouts?** `getCharacterImage`
  stays for now; cutouts are the same pipeline with a transparent output,
  so the reuse is cheap if wanted later. Decide never in this plan.
- **"Reroll characters"?** D11 says reroll = plate only. A per-character
  reroll is a small addition on top of the layer model if players ask for
  it; not worth predicting the UI now.
- **An idle-bob keyframe?** Deliberately refused (see *What this plan is
  not*). Revisit only behind a reduce-motion-respecting setting.
- **LRU cap 500 vs a separate cutout budget.** The single-LRU choice (D2)
  is simple and the menu gallery already enforces its own ring; revisit only
  if Phase 5's measurement shows the plate namespace starving under a big
  cutout catalogue.

## Design invariants

1. **A cache key folds everything visible in its pixels.** The plate key
   carries no characters and the cutout key carries nothing but the
   character: identity, pose, expression, outfit, style. Any change to what
   the pixels must show is a key change. (The scar that made this plan:
   `composeSceneKey` silently served one save's art to another until the
   player token was added — image.js:57–61.)
2. **renderScene touches the DOM only when something changed.** The plate
   key gates plate work, the layer diff gates cutout work. Re-stamping
   `data-loading` on every render flickers the image after every action —
   the render.js:1015 fix is a rule, not a style.
3. **Index writes go through atomic `kv.meta.update`, never get-then-set.**
   state.js:950's comment is a scar with a name; the cutout plan reuses the
   existing atomic cache and must not add a second write pattern.
4. **Cutouts never block a scene.** Plate and reader paint immediately;
   cutouts fade in. The game must remain fully playable with images off
   (D12).
5. **Same key, same pixels, forever.** Determinism (D3) is what makes
   eviction and cache misses invisible; any code that varies a cutout's
   output on something outside its key is a bug.
6. **The plate is people-free.** Character clauses live only in cutout
   prompts. Someone reintroducing a person into `buildBackgroundPrompt` is
   reintroducing the multiplicative cost structure this plan exists to kill.
