#!/usr/bin/env python3
"""
matte-and-measure.py — turn the raw reference portraits into real cutouts,
then measure them with the game's own pipeline math.

Why this exists
---------------
`root.generateImage` only runs inside Perchance, so nothing in this repo has
ever seen a real cutout. The reference images in `refs/` were generated with
the game's own Stage 0 prompt but WITHOUT `removeBackground: true`, so they
arrive as flat figures on a white background.

This script does two separate jobs, and the distinction matters:

  1. STAND-IN FOR RMBG. `matte()` derives an alpha channel by flood-filling
     the border-connected white. This is NOT RMBG-1.4 and does not test it.
     It is, however, exactly the magic-erase (flood) tool the Sprite Studio's
     Phase 5 cleaning suite specifies — so this half is a prototype of that
     tool, not a fake of the model.

  2. THE REAL PIPELINE, PORTED VERBATIM. Everything after `matte()` is a
     faithful port of `src/srcfiles/image.js`: D17 alpha levels, D14 spill
     suppression, D15/D18 morphological rescue, D5/D18/D19 speck pruning,
     D19's main-component bbox, D16's floor anchor. Same constants, read from
     the same CUTOUT_TUNING values. This half IS a real exercise of shipped
     code against real images, for the first time.

  3. D9, WHICH IS NOT WRITTEN YET. `detect_head_crop()` is the
     avatars-and-sprite-studio plan's shoulder-break scan, implemented here so
     its constants can be judged against real silhouettes BEFORE anyone writes
     it into `sprites.js`. Every intermediate measurement is reported.

Usage:  python dev/design/sprite-studio/matte-and-measure.py
Writes: refs/out/*.png  +  refs/out/REPORT.md
"""

import json
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REFS = os.path.join(HERE, "refs")
OUT = os.path.join(REFS, "out")

# --- CUTOUT_TUNING, verbatim from src/srcfiles/config.js:5386 ---------------
TUNING = {
    "bboxAlpha": 24,
    "speckAlpha": 20,
    "speckAreaMax": 120,
    "speckMainRatio": 0.85,
    "borderMarginFrac": 0.02,
    "removeBorderComponents": True,
    "borderIgnoreBottom": True,
    "closeRadius": 2,
    "spillAlphaMax": 250,
    "alphaFloor": 110,
    "alphaCeil": 200,
    "speckRelMax": 0.06,
    "rescueAreaMax": 300,
}

# --- AVATAR_TUNING ----------------------------------------------------------
# REVISED after the first run against real silhouettes. The plan's original
# D9 (median width of the top 5% of rows, first row exceeding 1.6x that) is
# wrong, and wrong structurally rather than by a constant: the top 5% of a
# bbox is the CROWN — the narrow dome at the top of the skull — so headWidth
# read ~40% low on every subject and 1.6x it was crossed while still inside
# the head. Six of eight then fell straight through to the minSideFrac clamp,
# i.e. the "guard rail" was silently doing all the work.
#
# What the width profiles actually show (see REPORT.md):
#   - Short or tied hair (Theo, Sam, Julian): a clear NECK — the silhouette
#     narrows hard after the head (137 -> 55 for Sam) and then widens at the
#     shoulders. Unmistakable signal.
#   - Long hair worn down (Marisol, Nadia, Priya): NO neck at all. The profile
#     rises monotonically from crown to hip, because the hair fills the neck
#     and shoulder line. There is no narrowing to detect, at any threshold.
#
# So the neck is a REFINEMENT available on some subjects, not the primary
# mechanism. The primary mechanism is proportional.
AVATAR = {
    "headBandFrac": 0.25,      # search window for head structure, from bbox top
    "peakLoFrac": 0.02,        # head-peak search starts below the crown sliver
    "peakHiFrac": 0.15,
    "neckRatio": 1.25,         # peakWidth / neckWidth to call a neck real
    "defaultHeadFrac": 0.24,   # crown -> chin as a share of bbox height
    "chinDropFrac": 0.30,      # below the neck/chin line, share of the core
    "headroomFrac": 0.12,      # above the crown, share of the crop side
    "faceBiasFrac": 0.10,      # push the frame down off the widest row, so a
                               # tall hairstyle does not eat the chin
    "minSideFrac": 0.16,
    "maxSideFrac": 0.34,
    "outputSize": 256,
}

# Which reference file is who, and what each one is meant to break.
CAST = [
    ("1.png", "Marisol Vance", "standing", "long loose hair — the shoulder-break breaker"),
    ("2.png", "Theo Hargrove", "standing", "broad shoulders + WHITE TEE (matte trap)"),
    ("3.png", "Nadia Ishikawa", "standing", "high bun + glasses — headroom"),
    ("4.png", "Julian Rourke", "seated", "seated framing"),
    ("5.png", "Priya Iyer", "lounging", "silhouette never narrows — clamp case"),
    ("6.png", "Sam (player)", "standing", "the player token"),
    ("7.png", "Marisol Vance", "talking", "talking expression"),
    ("9.png", "Marisol Vance", "portrait", "the char_ portrait the map misuses"),
]


# ===========================================================================
# 1. The matte — stand-in for RMBG, prototype of the Phase 5 flood tool
# ===========================================================================

def matte(img, bg_tolerance=30, enclosed_tolerance=6, feather=1.2):
    """Border-connected flood fill over near-white, then an antialiased edge.

    TWO tolerances, and the reason is measured rather than assumed:

      - A LOOSE border-connected flood (`bg_tolerance`, 30) is what removes
        the backdrop. It has to be connectivity-based, because a global
        threshold at this level punches a hole straight through Theo's white
        tee and Priya's white shirt.

      - A TIGHT global pass (`enclosed_tolerance`, 6) is what removes
        background the flood cannot REACH — the wedge between the legs, the
        gap under an arm, the holes in Nadia's hair. Those are enclosed by the
        subject, so no border flood will ever get to them, and they showed up
        as bright white slabs the moment the sprites were composited on a dark
        plate.

    Measured on 2.png, which carries both traps at once:

        outer background   median d=1    max d=2
        enclosed leg gap   median d=2    p10 d=1
        white tee          MIN d=8       median d=28

    True background is essentially pure white; a white GARMENT never is,
    because it is shaded. 6 sits clear of both. This is the single most
    useful thing this script learned, and it is a finding about the Sprite
    Studio's magic-erase tool, not about the game: it needs a click-anywhere
    flood AND a tolerance the player can move, because one tolerance cannot
    serve both jobs.
    """
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()

    # distance from white along the darkest channel
    dist = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b = px[x, y]
            m = r if r < g else g
            if b < m:
                m = b
            d = 255 - m
            dist[base + x] = d if d < 255 else 255

    # flood fill from every border pixel over `dist < bg_tolerance`
    bg = bytearray(w * h)
    q = deque()

    def seed(i):
        if not bg[i] and dist[i] < bg_tolerance:
            bg[i] = 1
            q.append(i)

    for x in range(w):
        seed(x)
        seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w)
        seed(y * w + w - 1)

    while q:
        i = q.popleft()
        x = i % w
        if x > 0:
            j = i - 1
            if not bg[j] and dist[j] < bg_tolerance:
                bg[j] = 1
                q.append(j)
        if x < w - 1:
            j = i + 1
            if not bg[j] and dist[j] < bg_tolerance:
                bg[j] = 1
                q.append(j)
        if i >= w:
            j = i - w
            if not bg[j] and dist[j] < bg_tolerance:
                bg[j] = 1
                q.append(j)
        if i < w * (h - 1):
            j = i + w
            if not bg[j] and dist[j] < bg_tolerance:
                bg[j] = 1
                q.append(j)

    # The tight global pass: pure-white regions the flood could not reach.
    enclosed = 0
    for i in range(w * h):
        if not bg[i] and dist[i] < enclosed_tolerance:
            bg[i] = 1
            enclosed += 1

    hard = bytes(0 if bg[i] else 255 for i in range(w * h))
    alpha = Image.frombytes("L", (w, h), hard)
    # A soft edge, so D17's knee and D14's decontamination have a real matte
    # edge to act on rather than a hard binary cut.
    alpha = alpha.filter(ImageFilter.GaussianBlur(feather))

    rgba = img.convert("RGBA")
    rgba.putalpha(alpha)
    bg_px = sum(bg)
    return rgba, {"bgPixels": bg_px, "bgFrac": round(bg_px / (w * h), 4),
                  "enclosedPixels": enclosed}


# ===========================================================================
# 2. The real pipeline, ported from src/srcfiles/image.js
# ===========================================================================

def cutout_alpha_levels(a, tuning):
    """D17 — the matte knee. image.js:831"""
    lo, hi = tuning["alphaFloor"], tuning["alphaCeil"]
    if not hi > lo:
        return 0
    cleared = 0
    span = hi - lo
    for i in range(len(a)):
        v = a[i]
        if v <= lo:
            if v > 0:
                cleared += 1
            a[i] = 0
        elif v >= hi:
            a[i] = 255
        else:
            t = (v - lo) / span
            a[i] = int(round(255 * t * t * (3 - 2 * t)))
    return cleared


def cutout_suppress_spill(rgb, a, tuning):
    """D14 — edge decontamination toward the subject's own mean. image.js:860"""
    n = len(a)
    rs = gs = bs = 0
    opaque = 0
    sam = tuning["spillAlphaMax"]
    for i in range(n):
        if a[i] >= sam:
            o = i * 3
            rs += rgb[o]
            gs += rgb[o + 1]
            bs += rgb[o + 2]
            opaque += 1
    if opaque == 0:
        return 0, None
    mr, mg, mb = rs / opaque, gs / opaque, bs / opaque
    spa = tuning["speckAlpha"]
    denom = sam - spa
    touched = 0
    for i in range(n):
        v = a[i]
        if v <= spa or v >= sam:
            continue
        wgt = 1 - (v - spa) / denom
        o = i * 3
        rgb[o] = int(rgb[o] + (mr - rgb[o]) * wgt)
        rgb[o + 1] = int(rgb[o + 1] + (mg - rgb[o + 1]) * wgt)
        rgb[o + 2] = int(rgb[o + 2] + (mb - rgb[o + 2]) * wgt)
        touched += 1
    return touched, (round(mr), round(mg), round(mb))


def morph_close(mask_bytes, w, h, radius):
    """D15/D18 dilate-then-erode. PIL Max/MinFilter IS box dilate/erode."""
    if not radius:
        return mask_bytes
    size = radius * 2 + 1
    im = Image.frombytes("L", (w, h), bytes(255 if v else 0 for v in mask_bytes))
    im = im.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    return bytearray(1 if v else 0 for v in im.tobytes())


def label_components(mask, w, h, margin, ignore_bottom):
    """image.js:949 — 4-connected labeling with a border-touch flag."""
    n = w * h
    labels = [-1] * n
    areas = []
    border = []
    nxt = 0
    for start in range(n):
        if not mask[start] or labels[start] != -1:
            continue
        stack = [start]
        labels[start] = nxt
        area = 0
        touches = False
        while stack:
            idx = stack.pop()
            area += 1
            x = idx % w
            y = idx // w
            if x < margin or y < margin or x >= w - margin:
                touches = True
            if not ignore_bottom and y >= h - margin:
                touches = True
            if x > 0:
                j = idx - 1
                if mask[j] and labels[j] == -1:
                    labels[j] = nxt
                    stack.append(j)
            if x < w - 1:
                j = idx + 1
                if mask[j] and labels[j] == -1:
                    labels[j] = nxt
                    stack.append(j)
            if y > 0:
                j = idx - w
                if mask[j] and labels[j] == -1:
                    labels[j] = nxt
                    stack.append(j)
            if y < h - 1:
                j = idx + w
                if mask[j] and labels[j] == -1:
                    labels[j] = nxt
                    stack.append(j)
        areas.append(area)
        border.append(touches)
        nxt += 1
    return labels, areas, border, nxt


def prune_specks(a, w, h, tuning):
    """D5 + D15 + D18 + D19. image.js:1004"""
    n = w * h
    fg = bytearray(1 if a[i] > tuning["speckAlpha"] else 0 for i in range(n))
    margin = max(3, round(tuning["borderMarginFrac"] * min(w, h)))
    labels, areas, border, count = label_components(
        fg, w, h, margin, tuning["borderIgnoreBottom"]
    )
    if count == 0:
        return {"erased": 0, "mainArea": 0, "componentCount": 0, "rescued": 0,
                "mainMask": bytearray(n)}

    main = max(range(count), key=lambda i: areas[i])
    main_area = areas[main]

    # D18's rescue question
    rescued = bytearray(count)
    rescued_count = 0
    if tuning["closeRadius"]:
        closed = morph_close(fg, w, h, tuning["closeRadius"])
        clabels, _, _, _ = label_components(
            closed, w, h, margin, tuning["borderIgnoreBottom"]
        )
        main_closed = -1
        for i in range(n):
            if fg[i] and labels[i] == main:
                main_closed = clabels[i]
                break
        if main_closed >= 0:
            for i in range(n):
                if not fg[i]:
                    continue
                lbl = labels[i]
                if lbl == main or rescued[lbl]:
                    continue
                if areas[lbl] > tuning["rescueAreaMax"]:
                    continue
                if clabels[i] == main_closed:
                    rescued[lbl] = 1
                    rescued_count += 1

    erase = bytearray(count)
    for i in range(count):
        if i == main or rescued[i]:
            continue
        small = areas[i] < tuning["speckAreaMax"]
        dwarfed = areas[i] < tuning["speckRelMax"] * main_area
        edge = tuning["removeBorderComponents"] and border[i]
        if (small or dwarfed or edge) and areas[i] < tuning["speckMainRatio"] * main_area:
            erase[i] = 1

    erased = 0
    main_mask = bytearray(n)
    for i in range(n):
        if not fg[i]:
            continue
        lbl = labels[i]
        if lbl >= 0 and erase[lbl]:
            a[i] = 0
            erased += 1
        elif lbl == main or rescued[lbl]:
            main_mask[i] = 1

    return {"erased": erased, "mainArea": main_area, "componentCount": count,
            "rescued": rescued_count, "mainMask": main_mask,
            "componentAreas": sorted(areas, reverse=True)[:8]}


def bbox_from_mask(mask, w, h):
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        row = y * w
        for x in range(w):
            if mask[row + x]:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < 0:
        return None
    return {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y,
            "width": max_x - min_x + 1, "height": max_y - min_y + 1}


# ===========================================================================
# 3. D9 — the shoulder-break scan. NOT YET WRITTEN IN THE GAME.
# ===========================================================================

def detect_head_crop(mask, w, h, bbox, av):
    """D9, REVISED — proportional crop, refined by a neck when one exists.

    Run against the eight reference silhouettes, the original spec's
    shoulder-break scan fired inside the head on every subject (see
    AVATAR_TUNING above). This version inverts the relationship: the crop is
    sized proportionally by default, and the neck — which only half of real
    subjects have a detectable one of — narrows it when it IS found.

    Returns the crop AND every intermediate measurement, because the point of
    this run is to judge the constants, not to trust them.
    """
    if not bbox:
        return None

    widths = []
    for y in range(bbox["minY"], bbox["maxY"] + 1):
        row = y * w
        lo, hi = None, None
        for x in range(bbox["minX"], bbox["maxX"] + 1):
            if mask[row + x]:
                if lo is None:
                    lo = x
                hi = x
        widths.append(0 if lo is None else hi - lo + 1)

    bh = bbox["height"]
    if bh < 8:
        return None

    # Smooth, so a single ragged row (a stray hair, a jpeg edge) cannot be
    # mistaken for anatomy.
    sm = []
    for i in range(bh):
        lo = max(0, i - 3)
        hi = min(bh, i + 4)
        seg = widths[lo:hi]
        sm.append(sum(seg) / len(seg))

    band = max(4, int(av["headBandFrac"] * bh))
    p_lo = max(1, int(av["peakLoFrac"] * bh))
    p_hi = max(p_lo + 1, min(band, int(av["peakHiFrac"] * bh)))

    peak_row = max(range(p_lo, p_hi), key=lambda i: sm[i])
    peak_w = sm[peak_row]

    neck_row = None
    neck_w = None
    if peak_row + 1 < band:
        neck_row = min(range(peak_row + 1, band), key=lambda i: sm[i])
        neck_w = sm[neck_row]

    neck_found = bool(neck_w and neck_w > 0 and peak_w / neck_w >= av["neckRatio"])

    if neck_found:
        core = neck_row * (1 + av["chinDropFrac"])
        basis = "neck"
    else:
        core = av["defaultHeadFrac"] * bh
        basis = "proportional"

    side = core * (1 + av["headroomFrac"])
    lo_side = av["minSideFrac"] * bh
    hi_side = av["maxSideFrac"] * bh
    clamped = None
    if side < lo_side:
        side = lo_side
        clamped = "min"
    elif side > hi_side:
        side = hi_side
        clamped = "max"

    # Horizontal centre from the HEAD rows only — a raised arm or a hip must
    # never pull the frame off the face.
    sx = 0
    cnt = 0
    for y in range(bbox["minY"], min(bbox["maxY"], bbox["minY"] + max(1, int(core))) + 1):
        row = y * w
        for x in range(bbox["minX"], bbox["maxX"] + 1):
            if mask[row + x]:
                sx += x
                cnt += 1
    cx = (sx / cnt) if cnt else (bbox["minX"] + bbox["width"] / 2)

    # Vertical anchor: the head's WIDEST row, not the topmost opaque pixel.
    # bbox.minY is the top of whatever is highest — a bun, a hat, a raised
    # tuft — so hanging the crop off it slides the whole frame up and eats the
    # chin (Nadia's high bun, measured). The widest row of the head sits at
    # cheekbone/ear level, i.e. roughly the middle of the face, which is a far
    # stabler landmark. faceBiasFrac nudges down so the chin clears.
    centre_y = bbox["minY"] + peak_row + av["faceBiasFrac"] * side
    top = centre_y - side / 2
    left = cx - side / 2
    left = max(0, min(w - side, left))
    top = max(0, min(h - side, top))

    return {
        "crop": {"x": int(round(left)), "y": int(round(top)),
                 "w": int(round(side)), "h": int(round(side))},
        "basis": basis,
        "headPeakRow": peak_row,
        "headPeakFrac": round(peak_row / bh, 3),
        "headPeakW": round(peak_w),
        "neckRow": neck_row,
        "neckFrac": round(neck_row / bh, 3) if neck_row is not None else None,
        "neckW": round(neck_w) if neck_w is not None else None,
        "neckRatio": round(peak_w / neck_w, 2) if neck_w else None,
        "neckFound": neck_found,
        "coreRows": round(core),
        "sideFracOfBbox": round(side / bh, 3),
        "clamped": clamped,
        "maxWidthPx": max(widths) if widths else 0,
    }


# ===========================================================================
# main
# ===========================================================================

def process(fname, name, pose, tests):
    path = os.path.join(REFS, fname)
    img = Image.open(path)
    w, h = img.size

    rgba, mstats = matte(img)
    raw = bytearray(rgba.tobytes())
    n = w * h
    rgb = bytearray(n * 3)
    a = bytearray(n)
    for i in range(n):
        o = i * 4
        t = i * 3
        rgb[t] = raw[o]
        rgb[t + 1] = raw[o + 1]
        rgb[t + 2] = raw[o + 2]
        a[i] = raw[o + 3]

    cleared = cutout_alpha_levels(a, TUNING)
    touched, mean = cutout_suppress_spill(rgb, a, TUNING)
    pruned = prune_specks(a, w, h, TUNING)
    bbox = bbox_from_mask(pruned["mainMask"], w, h)

    out = bytearray(n * 4)
    for i in range(n):
        o = i * 4
        t = i * 3
        out[o] = rgb[t]
        out[o + 1] = rgb[t + 1]
        out[o + 2] = rgb[t + 2]
        out[o + 3] = a[i]
    full = Image.frombytes("RGBA", (w, h), bytes(out))

    stem = os.path.splitext(fname)[0]
    head = detect_head_crop(pruned["mainMask"], w, h, bbox, AVATAR)

    bottom_frac = None
    if bbox:
        bottom_frac = round(max(0, (h - 1 - bbox["maxY"]) / h), 4)
        cropped = full.crop((bbox["minX"], bbox["minY"], bbox["maxX"] + 1, bbox["maxY"] + 1))
        cropped.save(os.path.join(OUT, f"cut-{stem}.png"))
    if head:
        c = head["crop"]
        av = full.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
        av = av.resize((AVATAR["outputSize"], AVATAR["outputSize"]), Image.LANCZOS)
        av.save(os.path.join(OUT, f"avatar-{stem}.png"))

    return {
        "file": fname, "name": name, "pose": pose, "tests": tests,
        "size": [w, h],
        "matte": mstats,
        "alphaLevelsCleared": cleared,
        "spillTouched": touched, "subjectMeanRGB": mean,
        "components": pruned["componentCount"],
        "componentAreasTop": pruned["componentAreas"],
        "mainArea": pruned["mainArea"],
        "erased": pruned["erased"], "rescued": pruned["rescued"],
        "bbox": bbox, "bottomFrac": bottom_frac,
        "head": head,
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    results = []
    for fname, name, pose, tests in CAST:
        if not os.path.exists(os.path.join(REFS, fname)):
            print(f"  skip {fname} (missing)")
            continue
        print(f"  {fname:8s} {name} ({pose}) ...", end="", flush=True)
        r = process(fname, name, pose, tests)
        results.append(r)
        hd = r["head"]
        print(f" bbox {r['bbox']['width']}x{r['bbox']['height']}"
              f"  bottomFrac {r['bottomFrac']}"
              f"  comps {r['components']}"
              f"  basis {hd['basis']:12s}"
              f"  neck {hd['neckFrac']}/{hd['neckRatio']}"
              f"  side {hd['sideFracOfBbox']}"
              f"  clamp {hd['clamped']}")
    with open(os.path.join(OUT, "measurements.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {len(results)} cutouts + avatars to {OUT}")


if __name__ == "__main__":
    main()
