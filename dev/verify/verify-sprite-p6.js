// Avatars & Sprite Studio, Phase 6 — the editor's drawing and colour tools.
// (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// Phase 5 gave the player an eraser. This one lets them CHANGE a sprite
// rather than only clean it, and that adds two more kinds of edit to a file
// whose whole architecture is about kinds of edit not destroying each other:
//
//   PARAMETRIC   the matte sliders (Phase 5) — and now the colour
//                adjustments and the frame (flip / scale / crop). All three
//                re-run from source on every change, so every one of them has
//                a way back.
//   DESTRUCTIVE  erase / restore / magic-erase in `strokeMask`, and now the
//                brush and the bucket in `paint`, a second RGBA overlay.
//
// The assertions below are mostly about the seams between those five things.
// The ones the plan names specifically are all here — brush continuity (the
// classic dotted-line bug), a bucket that can never write a transparent
// pixel, adjustments that are identity at zero and idempotent when reapplied,
// a flip that is its own inverse, and a scale that keeps the bbox's aspect
// ratio — plus the one that is easy to miss and expensive to find later:
// GEOMETRY DOES NOT INVALIDATE HISTORY. Every stroke delta is a list of
// buffer indices, so a crop that baked itself into the buffers would silently
// re-point two hundred undo entries at the wrong pixels.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js', 'spritestudio.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// The same synthetic cutout verify-sprite-p5.js uses, so a failure here can be
// read against that file directly: a solid body, a head in a different colour,
// a detached speck and a low-alpha haze.
api(`
  var EW = 120, EH = 160;
  function makeMaster() {
    const d = new Uint8ClampedArray(EW * EH * 4);
    const put = (x, y, r, g, b, a) => { const i = (y * EW + x) * 4; d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = a; };
    for (let y = 30; y < 140; y++) for (let x = 40; x < 80; x++) put(x, y, 40, 60, 110, 255);   // a dark shirt
    for (let y = 12; y < 34; y++) for (let x = 48; x < 72; x++) put(x, y, 240, 200, 175, 255);  // skin
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) put(x, y, 120, 120, 120, 255);    // a detached speck
    for (let y = 100; y < 155; y++) for (let x = 90; x < 118; x++) put(x, y, 230, 230, 230, 60); // haze
    return d;
  }
  function openEd(tuning) {
    const ed = spriteEditorNew('n1|cutout|standing_neutral_c_o_t_b', makeMaster(), EW, EH, tuning, 0.05);
    spriteEditorRecompose(ed);
    return ed;
  }
  function alphaAt(buf, x, y, w) { return buf[((y * (w || EW)) + x) * 4 + 3]; }
  function hexAt(buf, x, y, w) {
    const o = ((y * (w || EW)) + x) * 4;
    return spriteRgbToHex(buf[o], buf[o+1], buf[o+2]);
  }
  function same(a, b) {
    if (a.length !== b.length) return 'lengths differ: ' + a.length + ' vs ' + b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 'byte ' + i + ': ' + a[i] + ' vs ' + b[i];
    return null;
  }
  function brushEd(color, size) {
    const ed = openEd();
    ed.tool = 'brush';
    ed.brush = { size: size || 9, hardness: 1, opacity: 1, color: color || '#ff0000' };
    return ed;
  }
`);

console.log('\n1. The brush — continuity, which is the classic bug');

check('a stroke between two DISTANT points is continuous, with no gaps along the path',
  api(`(() => {
    const ed = brushEd('#ff0000', 9);
    spriteEditorPaint(ed, 15, 60, 105, 60);
    for (let x = 15; x <= 105; x++) {
      if (ed.paint[((60 * EW) + x) * 4 + 3] !== 255) {
        return 'gap in the stroke at x=' + x + ' (alpha ' + ed.paint[((60 * EW) + x) * 4 + 3] + ')';
      }
    }
    return true;
  })()`));

check('a fast DIAGONAL is continuous too — the interpolation is not axis-aligned luck',
  api(`(() => {
    const ed = brushEd('#ff0000', 7);
    spriteEditorPaint(ed, 10, 10, 110, 150);
    // Walk the analytic line and require paint at every step.
    for (let t = 0; t <= 100; t++) {
      const x = Math.round(10 + (110 - 10) * (t / 100));
      const y = Math.round(10 + (150 - 10) * (t / 100));
      if (ed.paint[((y * EW) + x) * 4 + 3] === 0) return 'gap at (' + x + ',' + y + ')';
    }
    return true;
  })()`));

check('the stroke stays ON the line — a brush that painted everywhere would pass the gap test too',
  api(`(() => {
    const ed = brushEd('#ff0000', 9);
    spriteEditorPaint(ed, 15, 60, 105, 60);
    if (ed.paint[((75 * EW) + 60) * 4 + 3] !== 0) return 'paint 15px off the line';
    if (ed.paint[((60 * EW) + 5) * 4 + 3] !== 0) return 'paint 10px before the start';
    return true;
  })()`));

check('the brush LAYS DOWN ITS COLOUR, over the artwork and over empty space alike',
  api(`(() => {
    const ed = brushEd('#ff0000', 9);
    spriteEditorPaint(ed, 15, 60, 105, 60);   // crosses the shirt and empty background
    if (hexAt(ed.working, 60, 60) !== '#ff0000') return 'over the shirt it is ' + hexAt(ed.working, 60, 60);
    if (hexAt(ed.working, 20, 60) !== '#ff0000') return 'over empty space it is ' + hexAt(ed.working, 20, 60);
    if (alphaAt(ed.working, 20, 60) !== 255) return 'painting empty space made no opacity';
    return true;
  })()`));

check('opacity is honoured, and a soft brush falls off toward its edge',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 21, hardness: 0, opacity: 0.5, color: '#ff0000' };
    spriteEditorPaint(ed, 60, 60, 60, 60);
    const mid = ed.paint[((60 * EW) + 60) * 4 + 3];
    const edge = ed.paint[((60 * EW) + 69) * 4 + 3];
    if (Math.abs(mid - 128) > 2) return 'centre alpha is ' + mid + ', not half';
    if (!(edge > 0 && edge < mid)) return 'no falloff: centre ' + mid + ', edge ' + edge;
    return true;
  })()`));

console.log('\n2. The bucket — constrained to the existing alpha');

check('the fill NEVER writes a transparent pixel, whatever the tolerance',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.composite);
    ed.brush.color = '#00ff00';
    ed.fillTolerance = 160;                 // as loose as the control goes
    spriteEditorFill(ed, 60, 80);
    for (let i = 0; i < EW * EH; i++) {
      if (before[i * 4 + 3] <= 8 && ed.paint[i * 4 + 3] !== 0) {
        return 'painted a transparent pixel at index ' + i + ' (artwork alpha ' + before[i * 4 + 3] + ')';
      }
    }
    return true;
  })()`));

check('...and it does fill the region it was clicked in',
  api(`(() => {
    const ed = openEd();
    ed.brush.color = '#00ff00';
    spriteEditorFill(ed, 60, 80);
    if (hexAt(ed.working, 60, 80) !== '#00ff00') return 'the click point is ' + hexAt(ed.working, 60, 80);
    if (hexAt(ed.working, 45, 120) !== '#00ff00') return 'the far side of the shirt is ' + hexAt(ed.working, 45, 120);
    return true;
  })()`));

check('the tolerance is real — a tight fill stops at the neckline instead of eating the face',
  api(`(() => {
    const ed = openEd();
    ed.brush.color = '#00ff00';
    ed.fillTolerance = 40;
    spriteEditorFill(ed, 60, 80);
    if (ed.paint[((20 * EW) + 60) * 4 + 3] !== 0) return 'the fill crossed into the skin';
    return true;
  })()`));

check('a filled region keeps the edge softness the matte gave it',
  api(`(() => {
    const ed = openEd();
    ed.brush.color = '#00ff00';
    ed.brush.opacity = 1;
    spriteEditorFill(ed, 60, 80);
    // Every painted pixel's alpha tracks the artwork's own alpha there.
    for (let i = 0; i < EW * EH; i++) {
      const pa = ed.paint[i * 4 + 3];
      if (pa === 0) continue;
      if (pa !== ed.base[i * 4 + 3]) return 'painted alpha ' + pa + ' against artwork alpha ' + ed.base[i * 4 + 3];
    }
    return true;
  })()`));

console.log('\n3. Colour adjustments — parametric, so there is always a way back');

check('every adjustment is IDENTITY at zero',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    spriteEditorSetAdjust(ed, { hue: 0, sat: 0, light: 0, brightness: 0, contrast: 0, tint: 0 });
    return same(before, ed.working) === null || 'zero changed the image: ' + same(before, ed.working);
  })()`));

check('a colour slider ROUND-TRIPS — set, change, reset, byte-identical (non-compounding)',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    spriteEditorSetAdjust(ed, { sat: 60 });
    if (same(before, ed.working) === null) return 'saturation changed nothing at all';
    spriteEditorSetAdjust(ed, { sat: -80 });
    spriteEditorSetAdjust(ed, { sat: 0 });
    return same(before, ed.working) === null || 'not byte-identical back at zero: ' + same(before, ed.working);
  })()`));

check('reapplying the same adjustment is IDEMPOTENT — it recomputes from the committed buffer, never stacks',
  api(`(() => {
    const ed = openEd();
    spriteEditorSetAdjust(ed, { hue: 40, sat: 25, brightness: -10 });
    const once = Uint8ClampedArray.from(ed.working);
    spriteEditorRecompose(ed);
    spriteEditorRecompose(ed);
    spriteEditorRecompose(ed);
    return same(once, ed.working) === null || 'three recomposes drifted: ' + same(once, ed.working);
  })()`));

check('an adjustment never touches ALPHA — "darker" must not eat the matte',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    spriteEditorSetAdjust(ed, { brightness: -70, contrast: 60, sat: -100, tint: 80 });
    for (let i = 3; i < before.length; i += 4) {
      if (before[i] !== ed.working[i]) return 'alpha moved at byte ' + i + ': ' + before[i] + ' -> ' + ed.working[i];
    }
    return true;
  })()`));

check('the TINT slider — the one that exists to match a sprite to a dim plate — pulls toward its colour',
  api(`(() => {
    const ed = openEd();
    const before = hexAt(ed.working, 60, 20);              // skin
    spriteEditorSetAdjust(ed, { tint: 100, tintColor: '#0000ff' });
    const after = hexAt(ed.working, 60, 20);
    if (after !== '#0000ff') return 'a full tint landed on ' + after + ' (from ' + before + ')';
    spriteEditorSetAdjust(ed, { tint: 50 });
    const half = ed.working[((20 * EW) + 60) * 4 + 2];
    if (!(half > 150)) return 'a half tint barely moved the blue channel: ' + half;
    return true;
  })()`));

check('the restore brush follows the adjustment, so a restored pixel matches its neighbours',
  api(`(() => {
    const ed = openEd();
    spriteEditorSetAdjust(ed, { hue: 120, sat: 40 });
    const neighbour = hexAt(ed.working, 55, 80);
    ed.brush = { size: 12, hardness: 1, opacity: 1, color: '#000000' };
    ed.tool = 'erase';
    spriteEditorStroke(ed, 60, 80, 60, 80);
    ed.tool = 'restore';
    spriteEditorStroke(ed, 60, 80, 60, 80);
    const restored = hexAt(ed.working, 60, 80);
    return restored === neighbour || 'restored to ' + restored + ' beside ' + neighbour;
  })()`));

console.log('\n4. The frame — flip, scale, crop, all of them descriptions and not cuts');

check('FLIP IS ITS OWN INVERSE, exactly',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    spriteEditorFlip(ed);
    if (same(before, ed.working) === null) return 'the flip changed nothing';
    if (hexAt(ed.working, EW - 1 - 60, 20) !== hexAt(before, 60, 20)) return 'the flip did not mirror';
    spriteEditorFlip(ed);
    return same(before, ed.working) === null || 'flipping twice drifted: ' + same(before, ed.working);
  })()`));

check('a uniform SCALE preserves the alpha bbox aspect ratio',
  api(`(() => {
    const ed = openEd();
    const r0 = ed.bbox.width / ed.bbox.height;
    for (const s of [0.5, 1.5, 2]) {
      spriteEditorSetScale(ed, s);
      if (ed.outWidth !== Math.round(EW * s) || ed.outHeight !== Math.round(EH * s)) {
        return 'scale ' + s + ' produced ' + ed.outWidth + 'x' + ed.outHeight;
      }
      const r1 = ed.bbox.width / ed.bbox.height;
      if (Math.abs(r1 - r0) > 0.05) return 'scale ' + s + ' moved the bbox ratio ' + r0.toFixed(3) + ' -> ' + r1.toFixed(3);
    }
    return true;
  })()`));

check('CROP IS A FRAME, NOT A CUT — the master is untouched and uncropping is byte-identical',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    const master = Uint8ClampedArray.from(ed.master);
    spriteEditorCropToArtwork(ed);
    if (ed.outWidth >= EW || ed.outHeight >= EH) return 'crop-to-artwork did not shrink the frame';
    if (same(master, ed.master) !== null) return 'the crop wrote into the master';
    spriteEditorResetGeom(ed);
    return same(before, ed.working) === null || 'uncropping drifted: ' + same(before, ed.working);
  })()`));

check('crop-to-artwork lands on the bbox the matte measured',
  api(`(() => {
    const ed = openEd();
    const box = cutoutBBox(ed.composite, EW, EH, ed.tuning.bboxAlpha);
    spriteEditorCropToArtwork(ed);
    if (ed.outWidth !== box.width || ed.outHeight !== box.height) {
      return 'cropped to ' + ed.outWidth + 'x' + ed.outHeight + ', bbox is ' + box.width + 'x' + box.height;
    }
    if (hexAt(ed.working, 0, 0, ed.outWidth) !== hexAt(ed.composite, box.minX, box.minY)) return 'the crop origin is off';
    return true;
  })()`));

check('the pointer mapping inverts the frame — crop, scale and flip together',
  api(`(() => {
    const g = { flipH: false, scale: 2, crop: { x: 20, y: 30, w: 40, h: 50 } };
    let p = spriteGeomToSource(g, EW, EH, 0, 0);
    if (p.x !== 20 || p.y !== 30) return 'origin mapped to ' + p.x + ',' + p.y;
    p = spriteGeomToSource(g, EW, EH, 2, 4);
    if (p.x !== 21 || p.y !== 32) return 'a scaled point mapped to ' + p.x + ',' + p.y;
    g.flipH = true;
    p = spriteGeomToSource(g, EW, EH, 0, 0);
    if (p.x !== 20 + 39 || p.y !== 30) return 'flipped origin mapped to ' + p.x + ',' + p.y;
    // Identity must be a straight pass-through, since that is every ordinary session.
    p = spriteGeomToSource(spriteGeomDefaults(), EW, EH, 7, 11);
    return (p.x === 7 && p.y === 11) || 'identity remapped a point';
  })()`));

check('at scale 1 the frame is a LOSSLESS copy — which is what makes flip exact rather than nearly exact',
  api(`(() => {
    const ed = openEd();
    const out = spriteGeomApply(ed.composite, EW, EH, { flipH: false, scale: 1, crop: { x: 10, y: 20, w: 60, h: 70 } });
    for (let y = 0; y < 70; y++) {
      for (let x = 0; x < 60; x++) {
        for (let c = 0; c < 4; c++) {
          const a = out.data[(y * 60 + x) * 4 + c];
          const b = ed.composite[(((y + 20) * EW) + (x + 10)) * 4 + c];
          if (a !== b) return 'resampled at ' + x + ',' + y + ' channel ' + c + ': ' + a + ' vs ' + b;
        }
      }
    }
    return true;
  })()`));

console.log('\n5. The seams — five kinds of edit that must not destroy each other');

check('a MATTE slider does not wipe the paint, and painting does not reset the matte',
  api(`(() => {
    const ed = brushEd('#ff0000', 15);
    spriteEditorSetTuning(ed, { alphaFloor: 60 });
    spriteEditorPaint(ed, 60, 80, 60, 80);
    if (ed.tuning.alphaFloor !== 60) return 'painting moved the tuning';
    spriteEditorSetTuning(ed, { alphaFloor: 140 });
    if (hexAt(ed.working, 60, 80) !== '#ff0000') return 'a slider drag wiped the paint';
    spriteEditorSetTuning(ed, { alphaFloor: CUTOUT_TUNING.alphaFloor });
    return hexAt(ed.working, 60, 80) === '#ff0000' || 'resetting the matte wiped the paint';
  })()`));

check('a COLOUR slider does not restate the paint — the paint layer sits on top of the adjustments',
  api(`(() => {
    const ed = brushEd('#ff0000', 15);
    spriteEditorPaint(ed, 60, 80, 60, 80);
    spriteEditorSetAdjust(ed, { hue: 150, sat: -60, brightness: -40 });
    return hexAt(ed.working, 60, 80) === '#ff0000'
      || 'the adjustment re-coloured the brush mark to ' + hexAt(ed.working, 60, 80);
  })()`));

check('PAINT INTO AN ERASED HOLE IS VISIBLE — paint composites after the eraser, not under it',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 20, hardness: 1, opacity: 1, color: '#ff0000' };
    ed.tool = 'erase';
    spriteEditorStroke(ed, 60, 80, 60, 80);
    if (alphaAt(ed.working, 60, 80) !== 0) return 'the erase did not clear the pixel';
    ed.tool = 'brush';
    spriteEditorPaint(ed, 60, 80, 60, 80);
    if (alphaAt(ed.working, 60, 80) !== 255) return 'the paint was swallowed by the erase (alpha ' + alphaAt(ed.working, 60, 80) + ')';
    return hexAt(ed.working, 60, 80) === '#ff0000' || 'the painted colour is ' + hexAt(ed.working, 60, 80);
  })()`));

check('...and THE ERASER REACHES THE PAINT, which is the other half of the same promise',
  api(`(() => {
    const ed = brushEd('#ff0000', 20);
    spriteEditorPaint(ed, 20, 60, 20, 60);       // paint on empty background
    if (alphaAt(ed.working, 20, 60) !== 255) return 'nothing was painted to erase';
    ed.tool = 'erase';
    ed.brush.size = 24;
    spriteEditorStroke(ed, 20, 60, 20, 60);
    if (ed.paint[((60 * EW) + 20) * 4 + 3] !== 0) return 'the paint layer survived the eraser';
    return alphaAt(ed.working, 20, 60) === 0 || 'the mark is still visible (alpha ' + alphaAt(ed.working, 20, 60) + ')';
  })()`));

check('magic erase reaches the paint too — its footprint is a flood, not a brush path',
  api(`(() => {
    const ed = brushEd('#ff0000', 30);
    spriteEditorPaint(ed, 60, 80, 60, 80);
    ed.tool = 'flood';
    ed.tolerance = 20;
    spriteEditorFlood(ed, 60, 80);
    if (ed.paint[((60 * EW) + 60) * 4 + 3] !== 0) return 'the flood left the paint behind';
    return alphaAt(ed.working, 60, 80) === 0 || 'the pixel is still opaque';
  })()`));

check('"Clear edits" clears BOTH overlays, and undo brings both back',
  api(`(() => {
    const ed = brushEd('#ff0000', 15);
    spriteEditorPaint(ed, 60, 80, 60, 80);
    ed.tool = 'erase';
    spriteEditorStroke(ed, 60, 20, 60, 20);
    const painted = Uint8ClampedArray.from(ed.working);
    spriteEditorResetStrokes(ed);
    if (hexAt(ed.working, 60, 80) === '#ff0000') return 'the paint survived Clear edits';
    if (alphaAt(ed.working, 60, 20) !== 255) return 'the erase survived Clear edits';
    spriteEditorUndo(ed);
    return same(painted, ed.working) === null || 'undoing the clear did not restore both: ' + same(painted, ed.working);
  })()`));

console.log('\n6. History across all five kinds');

check('undo and redo land EXACTLY across paint, erase, colour and frame together',
  api(`(() => {
    const ed = brushEd('#ff0000', 12);
    const start = Uint8ClampedArray.from(ed.working);
    spriteEditorPaint(ed, 50, 70, 70, 90);
    ed.tool = 'erase';
    spriteEditorStroke(ed, 45, 120, 75, 120);
    ed.brush.color = '#00ff00';
    spriteEditorSetAdjust(ed, { sat: 45 });
    spriteEditorFlip(ed);
    const end = Uint8ClampedArray.from(ed.working);
    if (ed.history.length !== 4) return 'expected 4 entries, got ' + ed.history.length;
    for (let i = 0; i < 4; i++) spriteEditorUndo(ed);
    if (spriteEditorCanUndo(ed)) return 'still more to undo after four';
    const back = same(start, ed.working);
    if (back !== null) return 'four undos did not land on the start: ' + back;
    for (let i = 0; i < 4; i++) spriteEditorRedo(ed);
    return same(end, ed.working) === null || 'four redos did not land on the end: ' + same(end, ed.working);
  })()`));

check('A CROP DOES NOT INVALIDATE THE HISTORY UNDER IT — the deltas stay in source space',
  api(`(() => {
    const ed = openEd();
    const clean = Uint8ClampedArray.from(ed.working);
    ed.brush = { size: 20, hardness: 1, opacity: 1, color: '#ff0000' };
    ed.tool = 'brush';
    spriteEditorPaint(ed, 60, 80, 60, 80);
    spriteEditorCropToArtwork(ed);
    const cropped = Uint8ClampedArray.from(ed.working);
    spriteEditorUndo(ed);                     // the crop
    spriteEditorUndo(ed);                     // the paint, indices from before the crop
    if (same(clean, ed.working) !== null) return 'undo through a crop drifted: ' + same(clean, ed.working);
    spriteEditorRedo(ed); spriteEditorRedo(ed);
    return same(cropped, ed.working) === null || 'redo through a crop drifted';
  })()`));

check('a painted stroke stores a SPARSE delta, not a buffer snapshot',
  api(`(() => {
    const ed = brushEd('#ff0000', 9);
    spriteEditorPaint(ed, 40, 60, 60, 60);
    const e = ed.history[ed.historyIndex];
    if (!e.paintDelta) return 'no paint delta on the entry';
    const touched = e.paintDelta.indices.length;
    if (touched === 0) return 'the delta is empty';
    if (touched > EW * EH / 4) return 'the delta covers ' + touched + ' of ' + (EW * EH) + ' pixels';
    if (e.paintDelta.prev.length !== touched * 4) return 'the prev buffer is not one RGBA per touched pixel';
    return true;
  })()`));

check('a stroke that changes nothing does not commit — an undo stack cannot be filled with no-ops',
  api(`(() => {
    const ed = brushEd('#ff0000', 9);
    spriteEditorPaint(ed, 60, 60, 60, 60);
    const n = ed.history.length;
    if (spriteEditorPaint(ed, 60, 60, 60, 60) !== null) return 'a repeat of the same stamp committed again';
    if (ed.history.length !== n) return 'history grew from ' + n + ' to ' + ed.history.length;
    // A fill over the region it already filled is the same story.
    ed.brush.color = '#00ff00';
    spriteEditorFill(ed, 60, 80);
    const m = ed.history.length;
    if (spriteEditorFill(ed, 60, 80) !== null) return 'a repeat fill committed again';
    return ed.history.length === m || 'the repeat fill grew history';
  })()`));

console.log('\n6b. One drag is one commit (D20) — found live, three mousemoves made three entries');

check('a DRAG of many segments commits exactly ONE history entry',
  api(`(() => {
    const ed = brushEd('#ff0000', 10);
    spriteEditorStrokeOpen(ed, 'brush');
    let x = 20;
    for (let i = 0; i < 40; i++) { spriteEditorStrokeSegment(ed, x, 60, x + 2, 60); x += 2; }
    if (ed.history.length !== 0) return 'history grew mid-drag to ' + ed.history.length;
    spriteEditorStrokeClose(ed);
    if (ed.history.length !== 1) return 'a 40-segment drag committed ' + ed.history.length + ' entries';
    return ed.history[0].label === 'Brush' || 'the entry is labelled ' + ed.history[0].label;
  })()`));

check('...and ONE undo takes the whole drag back, not the last segment of it',
  api(`(() => {
    const ed = brushEd('#ff0000', 10);
    const clean = Uint8ClampedArray.from(ed.working);
    spriteEditorStrokeOpen(ed, 'brush');
    let x = 20;
    for (let i = 0; i < 40; i++) { spriteEditorStrokeSegment(ed, x, 60, x + 2, 60); x += 2; }
    spriteEditorStrokeClose(ed);
    const drawn = Uint8ClampedArray.from(ed.working);
    if (same(clean, drawn) === null) return 'the drag drew nothing';
    spriteEditorUndo(ed);
    if (same(clean, ed.working) !== null) return 'one undo did not clear the drag: ' + same(clean, ed.working);
    spriteEditorRedo(ed);
    return same(drawn, ed.working) === null || 'redo did not restore the drag';
  })()`));

check('the merged delta keeps the EARLIEST prior value per pixel, so an overlapping drag still lands',
  api(`(() => {
    const ed = brushEd('#ff0000', 20);
    const clean = Uint8ClampedArray.from(ed.working);
    spriteEditorStrokeOpen(ed, 'brush');
    // Paint the same place four times over, then move away and come back.
    for (let i = 0; i < 4; i++) spriteEditorStrokeSegment(ed, 60, 80, 60, 80);
    spriteEditorStrokeSegment(ed, 60, 80, 90, 80);
    spriteEditorStrokeSegment(ed, 90, 80, 60, 80);
    spriteEditorStrokeClose(ed);
    if (ed.history.length !== 1) return ed.history.length + ' entries';
    spriteEditorUndo(ed);
    return same(clean, ed.working) === null || 'residue after undo: ' + same(clean, ed.working);
  })()`));

check('an ERASE drag over paint merges BOTH deltas into the one entry',
  api(`(() => {
    const ed = brushEd('#ff0000', 16);
    spriteEditorPaint(ed, 20, 60, 40, 60);        // something to rub out
    const painted = Uint8ClampedArray.from(ed.working);
    ed.tool = 'erase';
    spriteEditorStrokeOpen(ed, 'erase');
    spriteEditorStrokeSegment(ed, 20, 60, 30, 60);
    spriteEditorStrokeSegment(ed, 30, 60, 40, 60);
    const entry = spriteEditorStrokeClose(ed);
    if (!entry) return 'the erase drag committed nothing';
    if (!entry.delta || !entry.paintDelta) return 'the entry is missing one of the two deltas';
    if (alphaAt(ed.working, 30, 60) !== 0) return 'the mark survived the erase';
    spriteEditorUndo(ed);
    return same(painted, ed.working) === null || 'one undo did not restore both: ' + same(painted, ed.working);
  })()`));

check('a drag that changes nothing commits nothing',
  api(`(() => {
    const ed = brushEd('#ff0000', 10);
    spriteEditorPaint(ed, 60, 60, 60, 60);
    const n = ed.history.length;
    spriteEditorStrokeOpen(ed, 'brush');
    spriteEditorStrokeSegment(ed, 60, 60, 60, 60);   // exactly what is already there
    if (spriteEditorStrokeClose(ed) !== null) return 'an empty drag committed';
    if (ed.history.length !== n) return 'history grew from ' + n + ' to ' + ed.history.length;
    // And closing with no drag open at all is a no-op, not a crash.
    return spriteEditorStrokeClose(ed) === null || 'closing nothing committed something';
  })()`));

console.log('\n7. The eyedropper and the swatches');

check('a pick returns EXACTLY the pixel it was given, and painting it back is a round trip',
  api(`(() => {
    const ed = brushEd('#3f7fbf', 15);
    spriteEditorPaint(ed, 60, 80, 60, 80);
    const picked = spriteEditorPick(ed, 60, 80);
    if (picked !== '#3f7fbf') return 'picked ' + picked;
    if (ed.brush.color !== '#3f7fbf') return 'the pick did not load the brush';
    spriteEditorPaint(ed, 30, 100, 30, 100);
    return hexAt(ed.working, 30, 100) === '#3f7fbf' || 'the round trip landed on ' + hexAt(ed.working, 30, 100);
  })()`));

check('a pick reads through the FRAME — it takes the pixel the player can see, not the one underneath',
  api(`(() => {
    const ed = openEd();
    const skin = hexAt(ed.working, 60, 20);
    spriteEditorFlip(ed);
    const picked = spriteEditorPick(ed, EW - 1 - 60, 20);
    if (picked !== skin) return 'flipped pick got ' + picked + ', expected ' + skin;
    spriteEditorResetGeom(ed);
    spriteEditorSetScale(ed, 2);
    return spriteEditorPick(ed, 120, 40) === skin || 'scaled pick got ' + spriteEditorPick(ed, 120, 40);
  })()`));

check('a pick on a hole returns nothing rather than a colour that is not there',
  api(`(() => {
    const ed = openEd();
    if (spriteEditorPick(ed, 5, 150) !== null) return 'it invented a colour for a transparent pixel';
    if (spriteEditorPick(ed, -4, 8) !== null) return 'it read outside the buffer';
    return true;
  })()`));

check('the swatch row is seeded from the dominant colours already in the sprite',
  api(`(() => {
    const ed = openEd();
    const sw = spriteEditorSwatches(ed);
    if (!sw.length) return 'no swatches at all';
    if (sw.length > 8) return sw.length + ' swatches';
    if (sw.indexOf('#283c6e') < 0) return 'the shirt colour is missing: ' + sw.join(' ');
    if (sw.indexOf('#f0c8af') < 0) return 'the skin colour is missing: ' + sw.join(' ');
    // The shirt is the biggest region, so it has to lead.
    return sw[0] === '#283c6e' || 'the dominant colour is ' + sw[0] + ', not the shirt';
  })()`));

check('the swatches are cached, so rebuilding the panel does not re-histogram the frame',
  api(`(() => {
    const ed = openEd();
    const a = spriteEditorSwatches(ed);
    return spriteEditorSwatches(ed) === a || 'a second call rebuilt the list';
  })()`));

console.log('\n8. Colour helpers');

check('hex parsing survives the shapes a colour input and a swatch actually produce',
  api(`(() => {
    const cases = [['#ff8000', 255, 128, 0], ['ff8000', 255, 128, 0], ['#f80', 255, 136, 0], ['', 0, 0, 0], [null, 0, 0, 0]];
    for (const [hex, r, g, b] of cases) {
      const c = spriteHexToRgb(hex);
      if (c.r !== r || c.g !== g || c.b !== b) return JSON.stringify(hex) + ' -> ' + JSON.stringify(c);
    }
    return spriteRgbToHex(255, 128, 0) === '#ff8000' || 'round trip failed';
  })()`));

check('RGB -> HSL -> RGB is stable, which is what keeps a hue slider from bleaching a sprite',
  api(`(() => {
    for (const [r, g, b] of [[40, 60, 110], [240, 200, 175], [0, 0, 0], [255, 255, 255], [128, 128, 128]]) {
      const h = spriteRgbToHsl(r, g, b);
      const back = spriteHslToRgb(h.h, h.s, h.l);
      if (Math.abs(back.r - r) > 1 || Math.abs(back.g - g) > 1 || Math.abs(back.b - b) > 1) {
        return r + ',' + g + ',' + b + ' came back ' + Math.round(back.r) + ',' + Math.round(back.g) + ',' + Math.round(back.b);
      }
    }
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
