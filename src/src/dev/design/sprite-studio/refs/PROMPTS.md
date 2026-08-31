# Reference image prompts — Sprite Studio design canvas

Every prompt below is composed by **the game's own builders**, not invented.
Generate these and what you get is what the pipeline will actually produce.

Traced from:
- `buildVisualCharacterClause` (`image.js:265`) — the character prose
- `buildCutoutPrompt` + `applyImageStyle` + `CUTOUT_ISOLATION_TAIL` =
  `cutoutPromptFor` (`image.js:777`–`809`) — the cutout composition, in that
  exact order (D20: the isolation tail gets the **last** word, after the style
  suffix)
- `cutoutNegativePrompt` (`image.js:811`)
- `buildCharacterPrompt` (`image.js:434`) — the `char_` portrait
- `buildBackgroundPrompt` + `backgroundNegPrompt` (`image.js:502`, `543`) — the
  room plate

---

## Settings that matter

| | Value | Why |
|---|---|---|
| **Cutout / portrait resolution** | `512x768` | `IMAGE_CACHE.resolutions.cutout` and `.char` |
| **Plate resolution** | `768x512` | `IMAGE_CACHE.resolutions.scene.landscape` |
| **`removeBackground`** | `true` on cutouts only | The plugin's RMBG-1.4 pass |
| **Style** | `anime` suffix — see note below | |
| **Seed** | anything, but **write it down** | Cutouts are deterministic (D3); a recorded seed means we can reproduce or re-roll exactly |

**If you can't pass `removeBackground: true`,** generate on the white
background and hand me the flat PNGs — I'll matte them here. The Stage 0
prompt asks for "flat solid white background" precisely so that this works
(D20), so a threshold + the existing `cleanCutout` math gets close enough for
mockup purposes. Just tell me which way you generated.

### A style asymmetry worth deciding on

With the default `imageStyle: 'none'` (`defs.settings.js:23`), `applyImageStyle`
appends **nothing** — so a cutout carries no style instruction at all. But
`buildBackgroundPrompt` **hardcodes** `'Anime-inspired illustration style, warm
tones, detailed background, slice-of-life atmosphere, empty room, no people.'`
into every plate regardless of the setting (`image.js:534`).

So on default settings the room is explicitly anime and the people standing in
it are unstyled — which is one plausible answer to the cutout plan's live-run
item 6, *"do they read as one image, or as stickers on a photo?"* Possibly the
answer is "stickers, by construction."

I've appended the `anime` suffix to the character prompts below so the set is
stylistically consistent for the mockup. **Whether the game should do the same
is a real open question** — either the plate stops hardcoding anime, or
character surfaces adopt a default style. Worth a decision; I haven't put it
in the plan yet because it belongs to the cutout plan, not this one.

*(Faithfulness note: `buildCutoutPrompt` ends in `character sprite.` and
`applyImageStyle` concatenates `, anime-inspired…` straight onto it, producing
a literal `sprite., anime-…`. That's what the code emits, so it's reproduced
verbatim below. Harmless to a diffusion model.)*

---

## The cast, and what each one is testing

The six characters are not decoration — each breaks the D9 head-crop scan a
different way. **The lounging and long-hair cases are the ones I most expect
to fail**, so if you only generate a few, generate those.

| # | Who | Pose | What it tests |
|---|---|---|---|
| 1 | Marisol Vance | standing | Baseline, plus **long loose hair** — hair mass makes the "head width" band already wide, which can suppress the shoulder break entirely. The #1 threshold breaker. |
| 2 | Theo Hargrove | standing | **Broad shoulders, cropped hair** — the easy case. If `shoulderRatio: 1.6` doesn't fire cleanly here, it's wrong everywhere. |
| 3 | Nadia Ishikawa | standing | **High bun + glasses** — vertical mass *above* the crown, which is what `headroomFrac` exists for. |
| 4 | Julian Rourke | seated | Seated framing sits the head lower and changes `bottomFrac`. |
| 5 | Priya Iyer | lounging | **The silhouette never narrows** — the plan says this should hit the `maxSideFrac` clamp rather than returning a torso. This is the case that proves the guard rail. |
| 6 | Sam (the player) | standing | The player's own token, for the "You" card and the map marker. |

Optional extras, in priority order:

7. **Marisol again, `talking` expression** — for the conversation speaker chip.
8. **One room plate** — makes the editor's "preview on the real plate" panel
   (D19) real instead of a grey rectangle.
9. **One `char_` portrait of Marisol** (prompt at the bottom) — this is the
   image the floor plan currently squeezes into an 18px circle. I want to show
   the actual bug in the canvas, not describe it.
10. **The speckled cutout you still have** — the single most valuable file
    here. The despeckle sliders exist to fix exactly that; showing the real
    defect beats showing a clean sprite.

---

## Cutout prompts

All six use the same negative prompt and settings:

**Negative prompt (all cutouts):**
```
blurry, distorted, extra limbs, low quality, text, watermark, background details, background scenery, noise, artifacts, textures on background, borders, frame, vignette, multiple people, cropped, studio backdrop, muslin backdrop, canvas backdrop, mottled background, textured background, gradient background, grunge, speckles, splatter, paint splatter, grain, film grain, dust, scratches, paper texture, cast shadow, drop shadow, floor, ground plane, reflection
```

**Resolution `512x768`, `removeBackground: true`.**

---

### 1 — Marisol Vance · standing · neutral

```
Marisol Vance, a 27-year-old woman, tall and slender, with long wavy auburn hair worn loose, green almond-shaped eyes, olive smooth skin, oval face, a straight nose, full lips, slender build, upright posture, a small scar through one eyebrow, wearing a denim jacket, a graphic tee and jeans, neutral expression, standing casually, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 2 — Theo Hargrove · standing · neutral

```
Theo Hargrove, a 31-year-old man, tall and broad-shouldered, with short straight black hair in a crew cut, brown deep-set eyes, dark brown smooth skin, square face, a broad nose, a strong jawline, with a short beard, muscular build, wide shoulders, wearing an open flannel shirt, a plain white tee and chinos, neutral expression, standing casually, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 3 — Nadia Ishikawa · standing · happy

```
Nadia Ishikawa, a 24-year-old woman, petite and slight, with long straight black hair in a high bun, dark brown monolid eyes, fair smooth skin, heart-shaped face, a small nose, high cheekbones, slim build, upright posture, a pair of round wire glasses, wearing an oversized cardigan, a ribbed tank top and leggings, happy expression, standing casually, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 4 — Julian Rourke · **seated** · neutral

```
Julian Rourke, a 35-year-old man, average height and stocky, with medium curly ginger hair, hazel round eyes, freckled fair skin, round face, a snub nose, a soft jawline, with light stubble, stocky build, relaxed posture, wearing a knit sweater and corduroy trousers, neutral expression, seated, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 5 — Priya Iyer · **lounging** · neutral

```
Priya Iyer, a 29-year-old woman, average height and curvy, with shoulder-length wavy dark brown hair, brown almond-shaped eyes, warm brown smooth skin, oval face, full lips, curvy build, wide hips, a gold stud on the left nostril, wearing a linen shirt and wide-leg trousers, neutral expression, lounging, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 6 — Sam · standing · neutral · *the player*

```
Sam, a 26-year-old person, average height and lean, with short messy sandy blond hair, blue round eyes, fair freckled skin, oval face, a straight nose, lean build, upright posture, wearing a hoodie and jeans, neutral expression, standing casually, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

### 7 — Marisol Vance · standing · **talking** *(optional)*

Identical to #1 with the expression word swapped — `cutoutExpressionFor`
returns `talking` while a conversation overlay is open with that NPC.

```
Marisol Vance, a 27-year-old woman, tall and slender, with long wavy auburn hair worn loose, green almond-shaped eyes, olive smooth skin, oval face, a straight nose, full lips, slender build, upright posture, a small scar through one eyebrow, wearing a denim jacket, a graphic tee and jeans, talking, mouth slightly open, standing casually, full body, alone on a plain flat pure white background, even soft lighting on the character, character sprite., anime-inspired illustration, clean linework, soft shading, flat solid white background, empty background behind the subject, no backdrop texture, no background pattern, no shadow cast on the background.
```

---

## 8 — Room plate *(optional)* — living room, evening

**Resolution `768x512`. NO `removeBackground`.** This is
`buildBackgroundPrompt('living_room', 'evening', …)` with the real
`imagePhrase` fallback and the landscape framing clause.

```
Interior of a living room in a shared apartment, warm golden hour light through windows. Sofa, coffee table, TV, bookshelf. Lived-in but comfortable. Wide cinematic composition, the room filling the frame, eye-level camera angle. Anime-inspired illustration style, warm tones, detailed background, slice-of-life atmosphere, empty room, no people.
```

**Negative prompt (plate)** — `backgroundNegPrompt()`, the usual scene negative
plus the people ban. The ban is the point: a plate must have nobody in it,
ever.

```
blurry, distorted, extra limbs, low quality, text, watermark, person, people, human, man, woman, child, boy, girl, crowd, face, portrait, figure, character, creature, animal, silhouette, body, arms, legs, hands, eyes, skin
```

---

## 9 — `char_` portrait of Marisol *(optional, for the bug demo)*

**Resolution `512x768`. NO `removeBackground`.** This is
`buildCharacterPrompt(npc, 'neutral', 'standing')` — the image
`hydrateFloorPlanAvatars` currently pulls into an 18×18 circular clip, which
is why the map shows a slice of somebody's waist.

```
Marisol Vance, a 27-year-old woman, tall and slender, with long wavy auburn hair worn loose, green almond-shaped eyes, olive smooth skin, oval face, a straight nose, full lips, slender build, upright posture, a small scar through one eyebrow, wearing a denim jacket, a graphic tee and jeans, neutral expression, standing casually, full body, clean background, character sheet pose, warm lighting.
```

**Negative prompt:** `blurry, distorted, extra limbs, low quality, text, watermark`

---

## Where to put them

Drop everything in this folder (`dev/design/sprite-studio/refs/`), named
however you like — I'll sort them out. Originals stay untouched; I downsample
copies to ~70 KB for embedding in the canvas.

Tell me:
1. Whether cutouts came through `removeBackground: true` or as flat white-background PNGs.
2. The seeds, if you have them.
