# Character Cutout Scene Rendering

Status: **code complete — all 6 phases built. Pixel output still unseen.**
Design session complete 2026-08-21; all decisions locked (D1–D16).
Last updated 2026-08-21 (implementation session — all six phases). The
plan does NOT move to `complete/` yet: every phase's *logic* is built and
verified, but no cutout has ever actually been generated, because
`root.generateImage` exists only inside Perchance's runtime. One live run
is the remaining gate — see the Handoff.

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

**Resume at:** a **live Perchance run**, not a phase. All six phases are
code-complete and the game now renders plate + cutout layers, but the
cutout pipeline has never produced a real pixel in this environment (see
below). Do that run before treating any of D14/D15/D16 as proven, and
before moving this document to `complete/`.

---

### Live-run checklist (the one thing left)

Everything below needs `root.generateImage` and therefore a published
Perchance generator. Nothing in this repo can substitute for it.

1. **Does alpha survive the plugin's `result.canvas` → `canvasToBlob` PNG
   round-trip?** If not, every cutout is an opaque rectangle and
   `cleanCutout` is operating on a fully-opaque buffer. This is the single
   highest-risk unknown and the first thing to check.
2. **Does `removeBorderComponents: false` (D5) hold for a standing
   cutout?** Flip it true on one and compare; the default was chosen for
   seated/edge poses.
3. **Do D14/D15 actually do their jobs on real RMBG output?** Put a cutout
   on a DARK plate and look for a white fringe (D14); check hair wisps and
   fingertips survive (D15). The synthetic tests prove the algorithms are
   correct on constructed buffers, not that the thresholds suit real masks.
   Tune `CUTOUT_TUNING` and record what changed.
4. **Cross-pose identity consistency** — generate `standing/neutral` and
   `seated/happy` for one NPC and confirm they read as the same person.
   Untested territory relative to persona-realm (one pose per persona,
   ever). If they drift, strengthen `buildVisualCharacterClause` anchoring
   rather than changing the cutout pipeline.
5. **Is `IMAGE_CACHE.resolutions.cutout` (512x768) the right shape** for a
   full-body sprite, and does a generated cutout's own measured
   `bottomFrac` (D16) land the feet on the floor plane convincingly?
6. **A vision pass on a composed scene** — plate + 2-3 cutouts + the
   reader. Do they read as one image, or as stickers on a photo? Tuning
   levers: the `.scene-cutout` `height: 70%` / `max-width: 60%`, the pose
   scales, and the (deliberately unbuilt) floor shadow — see the deviation
   note below.

**Measured tuning datapoint from the live DOM this session:** with the
current CSS, **53%** of a cutout's height reads above the scene reader's
top edge (reader covers the bottom 40%, figures are 70% tall anchored 6%
up from the floor). The reader is translucent so the lower half is still
partly visible, which is the intended VN look — but if a vision pass says
the characters read as submerged, the lever is `.scene-cutout { height }`
plus `CUTOUT_POSES[*].bottomFrac`, not the reader.

---

**Implementation session part 2 (2026-08-21, Phases 3–6 — the switch and
everything after it):**
- **Phase 3 is live.** `sceneArtContext` now returns a PLATE key/prompt/seed
  plus an `overlay` layer plan; `renderScene` calls `getScenePlate` and a new
  `renderSceneCutouts` that diffs live layers against desired ones by
  `data-cutout-key`. `layoutSceneCutouts` (D10) does the seeded spread.
  `IMAGE_PROMPT_VERSION` → `pv4`. **Verified in a real browser** against
  `dev-harness.html`: cast changes never re-stamp `data-loading` on the
  plate and the player's DOM node survives them (so its CSS transition
  animates rather than restarting); a no-op re-render produces byte-identical
  node identity; a room change DOES reload the plate; a laid table seats
  everyone and puts `meal-` in the plate key; measured geometry has each
  layer centered exactly on its anchor with all feet on one floor line; the
  resize handler re-derives pixel offsets and preserves fractions exactly
  (0.303/0.534/0.763 across a 716px→436px change).
- **Two "bugs" during that verification were both test artifacts, recorded
  so the next session doesn't re-chase them.** (1) `currentGameState` and
  `currentSceneState` are `let` bindings in `ui.js` (global *lexical*
  scope), so `window.currentGameState = …` from an injected script does NOT
  set them — the resize handler's guard correctly bailed and looked like a
  dead listener. Assign the bare name, not the `window.` property. (2) CSS
  transitions do not tick while `document.visibilityState === 'hidden'` (a
  backgrounded preview tab) or under `visibility: hidden` — layers sat
  frozen at `currentTime: 0` with vars apparently ignored. `getAnimations()
  .forEach(a => a.finish())` settles them for measurement.
- **Phase 4** was largely satisfied by Phase 3's shape: `rerollSceneImage`
  already recomputes through `sceneArtContext`, so it rerolls the plate
  under the plate key (D11) and never touches cutouts; its negative prompt
  and the ⓘ modal's (`ui.js` `openSceneImageInfo`) now use
  `backgroundNegPrompt()` so a reroll cannot reintroduce people. Degrade
  (D12): a failed cutout gets `.cutout-missing` and stays invisible while
  the reader still narrates that character — confirmed live, since the
  harness stubs generation to throw, so *every* scene rendered during
  verification was exercising the degrade path. `cleanupImageUrls`'s
  keep-list needed no change: it has **no callers at all** (verified by
  grep), so the plan's Phase 4 bullet about it is moot.
- **Phase 5**: `cutoutExpressionFor` replaces the hardcoded `'neutral'` —
  `talking` when the player's conversation overlay is open with that NPC
  (the same `_inConversation` flag OVERTURE's do-not-disturb registry
  reads, plus `convState.npcId`), `happy` at mood ≥ 0.35, else neutral. A
  bad mood stays neutral **on purpose**: there is no sad cutout in the
  catalogue and silently inventing one would be worse than the omission.
  `reduceMotion` is now a real setting (`SETTINGS_DEFAULTS`, an Appearance >
  Motion toggle row, `applyReduceMotion` stamping `data-reduce-motion` on
  `<html>`, applied on boot/reset/write-through) — verified live: the
  position transition drops and the opacity fade stays, both directions.
  The attribute is only ever *added*, never removed to force motion back on
  over an OS preference. Speck-parameter tuning against real cutouts is the
  one Phase 5 item that genuinely cannot be done here — see the live-run
  checklist.
- **Phase 6**: `verify-cutout-p6.js` pins all four "what this plan is not"
  promises as assertions — portraits (`getCharacterImage`, no
  `removeBackground`), peek (its own namespace, still the only surface
  opting into the intimate layer), photos (prompt+seed record, people still
  baked in), and the menu gallery (own ring/cap) — plus a check that all six
  LRU namespaces are mutually distinct by prefix, and that `captureSave`'s
  thumbnail fallback composes a key `getScenePlate` would actually produce.
- **One genuine deviation from the plan, flagged.** D6 says
  "`buildImagePrompt` becomes `buildBackgroundPrompt`" and "`getSceneImage`
  is removed (render.js is its only consumer)". That is right about
  `getSceneImage` but **wrong about `buildImagePrompt`, which had a second
  consumer the plan missed: `takePhoto`** (the phone camera). A photo
  legitimately *should* have people in it, and it carries none of the
  multiplicative cost D6 exists to kill — a photo is keyed by its own id
  (`photo_<id>`), frozen at capture and never recomposed, so there is no
  cast-combination namespace to explode. It was therefore **renamed to
  `buildPhotoPrompt` and scoped to the camera** rather than deleted;
  `composeSceneKey`, `composeSceneSeed` and `getSceneImage` are gone
  outright as specified. `verify-cutout-p2.js` asserts both halves (the
  three are `undefined`; `buildPhotoPrompt` exists and still names people).
- **One deviation from the plan's CSS sketch**, already noted last session
  and now load-bearing: `--cutout-x`/`--cutout-y` are PIXEL offsets computed
  by `renderSceneCutouts`, not 0..1 fractions, because a percentage inside
  `transform: translate()` resolves against the layer's own box rather than
  its parent's. This is why a `resize` listener is required and exists.
- **Not built, deliberately: the D10/Stage-4 floor shadow.** The plan calls
  for a `.scene-cutout::after` radial-gradient ellipse to seat figures on
  the floor plane. `::after` **does not render on replaced elements like
  `<img>`**, so the layer would need a wrapper `<div>` per cutout. That is a
  real structural change to the layer diff, and whether it's needed at all
  is a question only a vision pass on real cutouts can answer (a cutout with
  a soft matte edge may seat fine without one). Left out rather than guessed
  at; it is item 6 on the live-run checklist.
- **Suite state:** 2277 passed / 61 failed / 1 harness errored, against a
  2170 / 61 / 2 baseline at the start of this work. The failing set is
  **identical to baseline** (unrelated NPC-willingness / cognition /
  world-gen harnesses); broken harnesses went 2 → 1 because `verify-meal.js`
  is now fixed. Its laid-table assertions were **ported, not deleted** —
  they now exercise `plateKey` and `layoutSceneCutouts`, since those own the
  concern the deleted `composeSceneKey` used to.

**Implementation session (2026-08-21, Phases 1 and 2 — code written):**
- **What actually got verified, and what didn't.** This repo only runs for
  real inside Perchance's platform runtime — `root.generateImage`/`root.kv`
  are injected by Perchance at load time. Both `dev-harness.html` and
  `dev/verify/loadgame.js` deliberately stub `generateImage` (one throws,
  one returns `{}`), so there is no way to call real generation, and
  therefore no way to check actual pixels (transparency, halo-free edges,
  cross-pose identity, a vision pass on a laid table) from this
  environment. Everything mechanically checkable WITHOUT real generation —
  key/seed composition, prompt content, the pixel-math cleanup algorithm
  (D5/D14/D15/D16) — is now covered by `dev/verify/verify-cutout-p1.js`
  (20 checks) and `verify-cutout-p2.js` (14 checks), all passing. The
  pixel-math tests are the meaningful ones: they construct a synthetic
  alpha buffer with a main blob, a genuinely detached speck, and a hair-wisp
  attached only through a 2px gap, and prove D15's morphological closing is
  load-bearing (a `closeRadius: 0` control case shows the wisp WOULD be
  pruned exactly like the speck without it). **Still unverified, and
  cannot be until a real Perchance run:** whether alpha survives the
  plugin's canvas→blob round-trip, whether `removeBorderComponents: false`
  is truly sufficient for a standing cutout, whether RMBG-1.4 is swappable
  for a newer matting model, and the cross-pose identity-consistency check
  Phase 1's verify list calls for. Whoever picks up Phase 3 should get a
  real Perchance run before trusting the cutout pipeline's actual output —
  the code is written to spec but its pixels are unseen.
- **Two harness gaps found and fixed while writing the above tests**, both
  in `dev/verify/loadgame.js` (shared by every harness, not cutout-specific):
  the vm sandbox never exposed `Uint8Array`/`Uint8ClampedArray`/`Int32Array`
  (nothing needed them before the cutout pipeline's pure pixel-math
  functions), and it never exposed bare `innerWidth`/`innerHeight` (which
  `image.js`'s `sceneOrientation()` reads directly). The second one was a
  real, pre-existing, silent breakage: ANY call reaching `sceneOrientation()`
  — including the already-shipped `composeSceneKey` — threw a
  `ReferenceError` in this harness before today, which is why
  `verify-meal.js` was crashing outright (`DID NOT REPORT` in `run-all.js`)
  rather than failing individual checks. Fixing it unmasked one further
  pre-existing stale assertion in `verify-meal.js` (a key string hardcoded
  before the VN refactor added the orientation segment and bumped
  `pv2`→`pv3`) — corrected in the same commit. `verify-intro.js`'s own
  `DID NOT REPORT` (a null `playerStudioDraft.gender` in `studio.js`) and
  the ~60 pre-existing failures scattered across unrelated `verify-c*/i*/
  p4/r*/s*/w*` harnesses are untouched by this session — confirmed
  unrelated to `image.js`/`config.js`/the cutout files by content (NPC
  willingness, cognition, world-gen — nothing cutout/image-adjacent) and
  out of scope for this plan.
- **Phase 1 built exactly to spec**, with the D14/D15/D16 amendments folded
  in from the start rather than bolted on: `cutoutIdentityToken`/
  `cutoutOutfitToken`/`cutoutKey`/`composeCutoutSeed`/`buildCutoutPrompt`/
  `cutoutNegativePrompt`, the pure pixel-math pipeline
  (`cutoutSuppressSpill` D14, `cutoutDilate`/`cutoutErode`/`cutoutMorphClose`/
  `cutoutLabelComponents`/`cutoutPruneSpecks` D15+D5, `cutoutBBox`/
  `cutoutBottomFrac` D16/Stage 3, `cleanCutout` orchestrating all of it on a
  canvas), and `getCharacterCutout`/`getPlayerCutout` — all in `image.js`.
  `CUTOUT_TUNING`/`CUTOUT_POSES`/`CUTOUT_EXPRESSIONS` and the cutout/500-cap
  `IMAGE_CACHE` changes are in `config.js`. `#scene-cutouts`/`.scene-cutout`
  CSS and the container div landed in `main.html` between `#scene-img` and
  `.scene-overlay`, per D1's DOM ordering — dead until Phase 3. One
  deliberate deviation from the plan's literal data-model sketch: CSS
  `--cutout-x`/`--cutout-y` are documented as PIXEL offsets computed by
  Phase 3's JS, not 0..1 fractions — a percentage inside `transform:
  translate()` resolves against the LAYER's own box, not its parent's, so
  fraction-to-pixel conversion has to happen in JS regardless; doing it
  there instead of leaning on CSS container-query units (`cqw`/`cqh`, which
  would have worked but add a newer-CSS-feature risk for zero benefit)
  keeps the rule itself boring and universally supported.
- **Phase 2 built exactly to spec:** `buildBackgroundPrompt`/
  `backgroundNegPrompt`/`plateKey`/`composePlateSeed`/`getScenePlate` in
  `image.js`, additive next to the untouched `buildImagePrompt`/
  `getSceneImage`. `plateKey`'s arity (4 params, no npc/player slot) is
  itself asserted in the verify harness as a structural proof the cast
  cannot enter the key even by mistake, not just an empirical one.

**Resume-at-Phase-3 checklist** (from the plan's own dependency order —
Phase 3 needs both 1 and 2, which is why it's next):
- `sceneArtContext` (render.js:969) returns a plate key/prompt/seed + an
  overlay plan instead of a scene key; `renderScene` calls `getScenePlate`
  and a new `renderSceneCutouts` that diffs the live `#scene-cutouts`
  children against the desired layer set via `data-cutout-key`.
- `layoutSceneCutouts(gs, sceneState, plateKey)` (D10) — seeded spread,
  player front-center, seated mode on a laid table.
- `buildImagePrompt`/`getSceneImage`/`composeSceneKey` get DELETED at this
  switchover (D6's last sentence), not left as a fallback — `render.js` is
  `getSceneImage`'s only consumer, confirmed via grep this session.
  `IMAGE_PROMPT_VERSION` moves `pv3` → `pv4` (this plan's own namespace
  turnover) — bump it in the SAME commit as the switch so no `pv3` cache
  entry is ever misread against the new (plate-only) prompt shape.
- The `--cutout-x`/`-y` pixel-offset design (see above) means
  `renderSceneCutouts` needs a resize listener alongside the room-change
  path to keep layers correctly placed — `#scene-cutouts`' rendered size is
  the conversion basis and it changes with the viewport.
- A live Perchance run is the earliest point any of Phase 1's D14/D15/D16
  pixel work can actually be SEEN — strongly consider doing that before or
  during Phase 3, since Phase 3 is also the first phase a vision pass has
  anything to look at.

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

**Review pass (2026-08-21, same day, no code written):** persona-realm's
algorithm was proven for exactly one job — one cutout per persona, flattened
onto a plausible backdrop once. This plan asks it to do a harder job (many
independent generations per character, kept as live layers on arbitrary
plates), and three gaps in a verbatim port were identified and locked as
D14–D16 below: edge-color spill was never suppressed (persona-realm's JPEG
flatten hid it; a transparent layer on a dark plate won't), the specks
cleanup can amputate hair wisps/fingertips that are legitimately part of the
subject, and `bottomFrac` was a design-time guess where a generation-time
measurement is both more accurate and free. A fourth open risk — whether
independently-generated poses/expressions for the same character stay
recognizably the same person, which persona-realm never had to solve since
it only ever rendered one pose — is not a locked decision but is now an
explicit Phase 1 verify step (see below); if cutouts drift, D3's identity
anchoring needs strengthening before Phase 3 wires anything live.

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
  threshold 24. Amended by D14/D15 below — a verbatim port of this stage
  handles islands but not edge color or thin-extremity pruning.

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

### Cutout quality amendments (review pass, 2026-08-21)
persona-realm's Stage 1–2 was validated for one cutout per persona, flattened
once. Placing the same algorithm's output as a live transparent layer on
many different, arbitrary plates is a harder job it was never tested
against. These three amendments close the gaps a verbatim port would carry
forward.

- **D14 — Edge spill suppression (decontamination).** A new step between
  Stage 1 (mask apply) and Stage 2 (specks cleanup): for every pixel with
  partial alpha (`speckAlpha < alpha < spillAlphaMax`, i.e. a soft matte
  edge, not solid subject and not solid background), blend its RGB toward
  the mean color of the subject's own opaque (`alpha ≈ 255`) pixels,
  weighted by how far the pixel's alpha sits below full. Why: RMBG-1.4's
  mask is soft with no color decontamination, so partial-alpha border pixels
  keep the *background's* color — white, since Stage 0's prompt is "pure
  white background." persona-realm never surfaced this because it flattened
  onto a plausible JPEG immediately; this plan places the same fringed edge
  on arbitrary plates, including night scenes, where a white halo around
  hair reads as a bug. Cheap (one pass over already-decoded pixel data,
  no new model), and it runs once per cutout generation, not per render.
- **D15 — Morphological closing before component labeling.** Stage 2's
  connected-component sweep runs on a binarized foreground mask
  (`alpha > speckAlpha`) that is first dilated then eroded by
  `CUTOUT_TUNING.closeRadius` (default 2px) before labeling. Why: a hair
  wisp or fingertip connected to the main silhouette only through a couple
  of low-alpha (but nonzero) pixels gets severed into its own tiny
  component by strict adjacency and then pruned as a speck — this is the
  actual mechanism behind the "floating hair" and "clipped fingers"
  artifacts Phase 5's verify step already anticipated. Speck-area or
  border-margin tuning cannot fix this: it's a labeling-input problem, not
  a threshold problem. A morphological close reconnects near-touching
  wisps before the sweep ever runs, so real extremities survive and true
  islands (dust, background fragments) still get pruned.
- **D16 — The floor anchor is measured, not guessed.** `CUTOUT_POSES`'
  `bottomFrac` values become fallback defaults only, used before any
  generation exists for a pose. The authoritative `bottomFrac` for a given
  cutout is recomputed from its own alpha channel — the same bbox scan
  `cutoutBBox` (Stage 3) already performs, re-run at layout/render time
  against the decoded PNG (an offscreen canvas `getImageData`, one scan,
  cheap) to find the lowest opaque row. Why: generation framing (how much
  floor a pose includes) is not strictly controlled by the model, so a
  static per-pose constant risks floating or clipped feet; the true answer
  is already sitting in the pixels the pipeline generated, for free. This
  needs no cache-format change and no new index — it stays inside D2/design
  invariant 3 (the blob itself is still the only thing stored; the anchor
  is derived on load like the bbox already is).

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
  closeRadius: 2,              // D15: dilate-then-erode radius (px) before
                                // component labeling — protects hair wisps/
                                // fingertips from being pruned as specks
  spillAlphaMax: 250,          // D14: pixels with speckAlpha < alpha < this
                                // are matte-edge pixels; their RGB gets
                                // decontaminated toward the subject's own
                                // opaque-pixel mean color
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
// bottomFrac here is a FALLBACK ONLY (D16) — used before a pose has ever
// been generated. Once a cutout exists, its real floor anchor is measured
// from its own alpha channel at layout time and this value is ignored.
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
  bottomFrac, // 0..1 up from the plate's bottom (the floor anchor) — the
              // MEASURED value off the cutout's own alpha (D16), falling
              // back to CUTOUT_POSES[pose].bottomFrac only when no cutout
              // has been generated yet
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
  also settle** whether alpha survives the plugin canvas → blob round-trip,
  whether `removeBorderComponents: false` is truly required for a standing
  cutout, and whether `imports/text-to-image-plugin`'s `removeBackground`
  path is hard-locked to RMBG-1.4 or a newer matting model can be passed
  through (record the finding in the Handoff either way — a better matting
  model reduces halo/wisp problems at the source, which D14/D15 otherwise
  have to compensate for after the fact).
- Verify D14 (spill suppression) and D15 (morphological closing) with
  `browser_eval` + `vision`: zoom a generated cutout's edge pixels and
  confirm no white-fringe halo survives against a dark test background;
  confirm a character with visible hair strands or an extended hand keeps
  them intact (not severed by the specks sweep) with `removeBorderComponents`
  still off.
- Verify cross-pose identity consistency: generate `standing`/`neutral` and
  `seated`/`happy` for the same NPC and vision-check they read as the same
  character (hair color/style, skin tone, outfit color, face shape). This
  is untested territory relative to persona-realm, which only ever rendered
  one pose per persona (see the Handoff's review-pass note) — if the two
  drift noticeably, flag it before Phase 3 wires layout live; the likely
  fix is strengthening `buildVisualCharacterClause`'s anchoring, not a
  cutout-pipeline change.

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
| 1 | **Built** — `verify-cutout-p1.js` 21/21. Pixel output unseen (live-run items 1–4). | Cutout factory: RMBG removal, specks cleanup (D5/D15), spill suppression (D14), bbox/bottomFrac (D16), deterministic keys, LRU round-trip |
| 2 | **Built** — `verify-cutout-p2.js` 19/19. | Empty background plates: people-free prompt, people-ban negative, plate keys |
| 3 | **Built** — `verify-cutout-p3.js` 15/15 + live browser verification of the layer diff, idempotency, geometry and resize. | Layered render: plate + positioned cutouts, layout, transitions, pv4 switch. **Floor shadow deliberately not built** — `::after` doesn't render on `<img>`; needs a wrapper and a vision pass first. |
| 4 | **Built** — covered by `verify-cutout-p45.js` + the live degrade path (harness generation always throws, so every verified render exercised it). | Reroll = plate only (D11); degrade paths (D12); images-off playability |
| 5 | **Built** — `verify-cutout-p45.js` 25/25 + live expression/reduce-motion checks. Speck tuning against real cutouts remains (live-run item 3). | Pose/expression catalogue, outfit keying, content gating, style fold, reduceMotion setting |
| 6 | **Built** — `verify-cutout-p6.js` 16/16. Live visual verification remains (live-run item 6). | Integration sweep: portraits/peek/photos/gallery provably untouched, namespace separation, save-thumbnail key |

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
