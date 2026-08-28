# What the reference images taught us

Run: `python dev/design/sprite-studio/matte-and-measure.py`
Date: 2026-08-27. Eight reference images generated from the game's own Stage 0
prompts (see `../PROMPTS.md`), matted here and measured with the pipeline's own
math ported verbatim from `src/srcfiles/image.js`.

**Read the caveat first.** The reference images arrived *without*
`removeBackground: true`, so the alpha channel here comes from a flood-fill
stand-in, not from RMBG-1.4. Nothing below tests RMBG. What it does test is
(a) everything downstream of the mask, which is shipped code, and (b) D9's
head-crop scan, which is not written yet and turned out to be wrong.

---

## Findings that belong to THIS plan

### F1 — D9's shoulder-break scan was structurally wrong. Rewritten.

The plan specified: take the median opaque run-width of the top
`headSampleFrac` (5%) of the bbox as "head width", then call the first row
exceeding `shoulderRatio` (1.6×) that width the shoulder line.

Measured, first run:

| Who | bbox | headW read | shoulder fired at | side | clamp |
|---|---|---|---|---|---|
| Marisol | 276×716 | 72px | 0.084 of bbox | 0.180 | **min** |
| Theo | 280×679 | 87px | 0.218 | 0.268 | none |
| Nadia | 324×757 | 67px | 0.050 | 0.180 | **min** |
| Julian | 440×663 | 86px | 0.063 | 0.180 | **min** |
| Priya | 288×758 | 89px | 0.067 | 0.180 | **min** |
| Sam | 296×731 | 93px | 0.083 | 0.180 | **min** |
| Marisol (talking) | 327×713 | 75px | 0.088 | 0.180 | **min** |

**Six of seven hit the `minSideFrac` clamp**, i.e. the "guard rail" was
silently doing all the work and the detector was contributing nothing.

The cause is structural, not a bad constant. The top 5% of a bbox is the
**crown** — the narrow dome at the top of the skull — so `headWidth` read
~40% below the head's true width (72px against a real head width nearer
120px). 1.6× an underestimate is crossed while still inside the head, every
time. No value of `shoulderRatio` fixes this, because the reference width is
measured in the wrong place.

**What the width profiles actually show** (opaque run-width per row, sampled
every 2% of bbox height):

```
Sam     0%:  5   2%: 82   4%:117   6%:133   8%:134  10%:137  12%:106  14%: 79  16%: 55  18%: 83  20%:112
Theo    0%:  2   2%: 82   4%: 93   6%: 94   8%: 89  10%: 90  12%: 92  14%: 76  16%: 74  18%: 86  20%:102  22%:148  24%:195
Julian  0%:  2   2%: 80   4%:129   6%:131   8%:136  10%:132  12%:120  14%:113  16%: 95  18%: 90  20%: 92  22%:119  24%:130

Marisol 0%:  4   2%: 65   4%: 83   6%: 93   8%:113  10%:126  12%:126  14%:137  16%:130  18%:137  20%:175
Nadia   0%: 10   2%: 64   4%: 85   6%:121   8%:141  10%:156  12%:157  14%:166  16%:172  18%:176  20%:179
Priya   0%:  6   2%: 80   4%:108   6%:133   8%:157  10%:170  12%:184  14%:188  16%:204  18%:201  20%:221
```

Two populations, and the split is **hair**, not build:

- **Short or tied hair** (Sam, Theo, Julian) — an unmistakable **neck**. Sam
  narrows 137 → 55 and then widens. Theo 94 → 74 → 148 → 195. Julian
  136 → 90 → 119. The signal is enormous.
- **Long hair worn down** (Marisol, Nadia, Priya) — **no neck at all.** The
  profile rises monotonically from crown to hip, because the hair fills the
  neck and covers the shoulder line. There is nothing to detect at any
  threshold.

So the neck is a *refinement available on some subjects*, never the primary
mechanism. The rewritten D9 inverts the relationship: size the crop
proportionally by default, and let a detected neck narrow it.

```
peakRow  = argmax width over rows [0.02, 0.15] of bbox height
neckRow  = argmin width over rows [peakRow, 0.25]
neckFound = width[peakRow] / width[neckRow] >= 1.25
core     = neckFound ? neckRow * (1 + chinDropFrac) : defaultHeadFrac * bboxH
side     = clamp(core * (1 + headroomFrac), minSideFrac*bboxH, maxSideFrac*bboxH)
```

Measured, after the rewrite:

| Who | basis | neck ratio | side (frac of bbox) | clamp |
|---|---|---|---|---|
| Marisol | proportional | 1.06 | 0.269 | none |
| Theo | **neck** | 1.30 | 0.232 | none |
| Nadia | proportional | 1.00 | 0.269 | none |
| Julian | **neck** | 1.53 | 0.264 | none |
| Priya | proportional | 1.01 | 0.269 | none |
| Sam | **neck** | 2.67 | 0.233 | none |
| Marisol (talking) | proportional | 1.00 | 0.269 | none |

No clamp fires on any subject, and — the encouraging part — **the two paths
converge**: neck-derived sides (0.232–0.264) land right beside the
proportional default (0.269). Two independent methods agreeing on the same
answer is the best evidence available that the number is about right.

### F2 — The crop must anchor to the head's widest row, not to `bbox.minY`.

First rewrite still failed two subjects, in opposite directions: **Nadia's
high bun** put `bbox.minY` at the top of the *hair*, so the frame slid up and
cut her chin off; **Julian** came out cropped tight at the jaw.

`bbox.minY` is the top of whatever is highest — a bun, a hat, a raised tuft —
which makes it a terrible landmark. The head's **widest row** sits at
cheekbone/ear level, roughly the middle of the face, and is stable across
hairstyles. Anchoring the square's centre there (plus a small `faceBiasFrac`
downward nudge so the chin clears) fixed both, and left the six already-good
crops unchanged.

Visual check after the fix: all seven read as proper headshots at 256px, and
all seven are still legible as distinct people at 18px.

**This does not make the recrop surface optional.** It makes it the exception
rather than the rule, which is the correct relationship — Phase 7 exists for
the subject whose hair defeats the heuristic, and there will be some.

### F3 — The magic-erase tool needs two tolerances, and they are measurable.

Compositing the first cutouts on a dark plate exposed bright white slabs
between the legs, under arms, and through gaps in hair. Those are background
regions **enclosed by the subject**, which a border-connected flood can never
reach. But the naive fix — a global threshold — punches a hole straight
through Theo's white tee and Priya's white shirt.

Measured on `2.png`, which carries both traps at once (`d` = distance from
white along the darkest channel):

| Region | min | p10 | median | |
|---|---|---|---|---|
| Outer background | 0 | 1 | **1** | pure white |
| Enclosed leg gap | 0 | 1 | **2** | pure white |
| White tee | **8** | 25 | 28 | never pure white — it is shaded |

True background is essentially pure white; a white *garment* never is. A loose
connected flood at `d < 30` plus a tight global pass at `d < 6` separates them
cleanly, with a 2-unit margin under the tee's minimum.

**This is a Phase 5 design requirement, not a stand-in artifact.** The
magic-erase tool must be click-anywhere (so the player can reach an enclosed
region) *and* carry a visible tolerance slider (so one setting does not have
to serve both jobs). Both are now in the plan on evidence rather than
intuition.

---

## Findings that belong to the CUTOUT plan

These are about `character-cutout-scene-rendering-plan.md`, not this one. They
are recorded here because this is where they were found; acting on them is
that document's business.

### F4 — Cast shadows survive D20's negative prompt. Confirmed, on real output.

D20 added `cast shadow, drop shadow, floor, ground plane, reflection` to
`cutoutNegativePrompt()` precisely to stop "the cast shadow that pools under
the feet and comes through the mask as an attached grey slab."

**Four of seven generations have a visible cast shadow anyway** — Julian's is
enormous, Sam's and both Marisols' are clear grey patches at bottom-right. The
negative prompt did not prevent it. And because the shadow touches the feet,
it is contiguous with the subject, so the D18/D19 component prune cannot
remove it either: it is part of the main component by construction.

This is exactly the sort of thing the Sprite Studio's eraser exists for, so it
is not blocking. But the claim in D20 that the negative prompt handles it is
now known to be false.

### F5 — Generation crops figures mid-thigh, and D16 cannot tell.

`3.png` (Nadia) and `5.png` (Priya) both run off the bottom of the frame at
mid-thigh, despite `full body` in the prompt. Both measure
**`bottomFrac: 0`**.

D16 says the floor anchor is measured from the cutout's own lowest opaque row
rather than guessed from a per-pose constant — which is right, and better than
the constant. But `bottomFrac: 0` means two completely different things:

- "the feet are at the very bottom of the frame" (good), and
- "the figure is cut off by the frame edge" (bad).

D16 has no way to distinguish them, so a cropped generation gets placed with
its severed thigh on the floor line, at full standing scale. A cheap
discriminator exists: a figure whose silhouette is still **near its maximum
width** at the last row is cut off, whereas a standing figure tapers to feet.
Worth a guard.

### F6 — D14 decontaminates toward a colour that is on nobody.

`cutoutSuppressSpill` blends every partial-alpha edge pixel toward the mean
RGB of the subject's *opaque* pixels. On a full-body sprite that mean is:

| | mean RGB |
|---|---|
| Marisol | `[111, 102, 105]` |
| Theo | `[101, 83, 80]` |
| Nadia | `[120, 98, 92]` |
| Priya | `[138, 107, 92]` |
| Sam | `[139, 120, 117]` |

Every one is a muddy desaturated grey-brown — the average of skin, denim,
hair and shoes, a colour that appears nowhere on the character. Blending a
white halo around auburn hair toward `[111,102,105]` turns a *white* fringe
into a *grey* fringe. An improvement, and still a fringe.

The fix is local rather than global: blend toward the mean of nearby opaque
pixels (a small radius) instead of the whole frame's. D14's reasoning is
sound; its sampling window is too wide. `spillTouched` was 2,300–3,200 pixels
per sprite, so this is not a rare path.

### F7 — The seated pose sits on an invisible chair.

`4.png` renders Julian seated on nothing, at chair height, with a large
shadow beneath. Placed on a room plate he will be floating in a sitting
posture unless he lands exactly on drawn furniture. `layoutSceneCutouts`
switches the cast to `seated` when a table is laid (D10), but nothing
guarantees the plate has a chair where the layout puts him.

### F8 — Plates hardcode a style; cutouts get none.

On default settings (`imageStyle: 'none'`), `applyImageStyle` appends nothing
to a cutout, while `buildBackgroundPrompt` hardcodes
`'Anime-inspired illustration style, warm tones, …'` into every plate
(`image.js:534`). The room is explicitly anime; the people standing in it are
unstyled.

That may well be the answer to the cutout plan's live-run item 6 — *"do they
read as one image, or as stickers on a photo?"* Possibly: stickers, by
construction. Either the plate stops hardcoding a style, or character
surfaces adopt a default one.

---

## What was confirmed working

Not everything was a defect. Against real images:

- **D18's wisp rescue fires and does real work** — 2 components rescued on
  Nadia, 4 on Julian, 1 on Priya. These are hair strands and fingertips that
  strict adjacency would have severed and the speck prune would then have
  deleted. The mechanism is not theoretical.
- **D19's dominance prune and main-component bbox behave.** Component areas
  came out like `[152953, 11, 4, 1, 1]` — one real subject and a handful of
  1–11px fragments, all correctly erased, with the bbox anchored to the main
  component so no stray pixel could pin it open.
- **D17's alpha knee is harmless on a clean matte** and leaves genuine soft
  edges soft. It was designed against RMBG's hedging, which this run cannot
  reproduce, so this is "does no damage" rather than "works".
- **No white halo is visible** on any sprite composited against `#1a1a2e`,
  which is the outcome D14 exists for — notwithstanding F6, which says the
  remaining fringe is grey rather than absent.

---

## Files

| | |
|---|---|
| `cut-N.png` | Matted, cleaned, cropped-to-subject cutouts |
| `avatar-N.png` | 256×256 headshots from the rewritten D9 |
| `_contact-dark.png` / `_contact-light.png` | All seven composited on both grounds — the only way the slab and halo defects are visible |
| `measurements.json` | Every intermediate value, per image |
