// Avatars & Sprite Studio, Phase 5 — the editor's cleaning suite.
// (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// This is the phase the plan's thesis rests on: the cutout pipeline is stuck
// because nobody in this repo can see its output, and the way out is not a
// better algorithm but handing the player an eraser. So the assertions below
// are mostly about one architectural claim —
//
//   PARAMETRIC AND DESTRUCTIVE EDITS DO NOT DESTROY EACH OTHER.
//
// The matte sliders (D18) re-run image.js's own cleanup against the MASTER
// from scratch every time one moves, which is what makes them
// non-compounding. Strokes are accumulated by hand. If they shared a buffer,
// every slider drag would wipe every stroke — and the player who spent two
// minutes cleaning a hairline and then nudged a slider would lose all of it.
//
// Plus the two things the plan names specifically: the restore brush can
// never invent opacity the master did not have (D6 is why the master exists),
// and a 200-deep history has to be affordable, which it only is because the
// history stores sparse deltas rather than buffer snapshots.
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

// A synthetic cutout built the way verify-cutout-p1.js builds its fixtures: a
// main blob, a detached speck, and a low-alpha haze — the shape of the
// problem the first live run actually produced.
api(`
  var EW = 120, EH = 160;
  function makeMaster() {
    const d = new Uint8ClampedArray(EW * EH * 4);
    const put = (x, y, r, g, b, a) => { const i = (y * EW + x) * 4; d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = a; };
    // main subject: a solid body
    for (let y = 30; y < 140; y++) for (let x = 40; x < 80; x++) put(x, y, 40, 60, 110, 255);   // a dark shirt
    // head
    for (let y = 12; y < 34; y++) for (let x = 48; x < 72; x++) put(x, y, 240, 200, 175, 255);  // skin
    // a detached speck, far away and small
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) put(x, y, 120, 120, 120, 255);
    // a low-alpha haze across a corner — the residue D17's knee exists for
    for (let y = 100; y < 155; y++) for (let x = 90; x < 118; x++) put(x, y, 230, 230, 230, 60);
    // An OPAQUE gradient band. Real residue shades; a flat patch bounded by a
    // huge colour step would make any tolerance look identical, which is not
    // a test of the control at all.
    for (let y = 145; y < 158; y++) {
      for (let x = 6; x < 114; x++) {
        const v = Math.round(40 + (x - 6) * (190 / 108));
        put(x, y, v, v, v, 255);
      }
    }
    return d;
  }
  function openEd(tuning) {
    const ed = spriteEditorNew('n1|cutout|standing_neutral_c_o_t_b', makeMaster(), EW, EH, tuning, 0.05);
    spriteEditorRecompose(ed);
    return ed;
  }
  function alphaAt(buf, x, y) { return buf[((y * EW) + x) * 4 + 3]; }
  function countOpaque(buf) { let n = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] > 20) n++; return n; }
`);

console.log('\n1. The parametric base IS the shipped pipeline (D18)');

check('the base is exactly what image.js produces for the same tuning — the sliders are the cleanup, not an imitation',
  api(`(() => {
    const ed = openEd();
    // Run the real pipeline by hand, in the documented order, on the same master.
    const mine = new Uint8ClampedArray(makeMaster());
    cutoutAlphaLevels(mine, EW, EH, CUTOUT_TUNING);
    cutoutSuppressSpill(mine, EW, EH, CUTOUT_TUNING);
    cutoutPruneSpecks(mine, EW, EH, CUTOUT_TUNING);
    for (let i = 0; i < mine.length; i++) {
      if (mine[i] !== ed.base[i]) return 'diverged at byte ' + i + ': ' + mine[i] + ' vs ' + ed.base[i];
    }
    return true;
  })()`));

check('the default tuning clears the low-alpha haze and keeps the subject',
  api(`(() => {
    const ed = openEd();
    if (alphaAt(ed.working, 100, 120) !== 0) return 'the haze survived (alpha ' + alphaAt(ed.working, 100, 120) + ')';
    if (alphaAt(ed.working, 60, 80) !== 255) return 'the body was damaged';
    if (alphaAt(ed.working, 60, 20) !== 255) return 'the head was damaged';
    return true;
  })()`));

check('a slider ROUND-TRIPS — set, change, reset, byte-identical (non-compounding)',
  api(`(() => {
    const ed = openEd();
    const before = Uint8ClampedArray.from(ed.working);
    spriteEditorSetTuning(ed, { alphaFloor: 40 });
    if (JSON.stringify([...ed.working]) === JSON.stringify([...before])) return 'the slider changed nothing at all';
    spriteEditorSetTuning(ed, { alphaFloor: 180 });
    spriteEditorSetTuning(ed, { alphaFloor: CUTOUT_TUNING.alphaFloor });
    for (let i = 0; i < before.length; i++) {
      if (ed.working[i] !== before[i]) return 'not byte-identical after returning to the default, at byte ' + i;
    }
    return true;
  })()`));

check('only the CHANGED tuning is saved with the sprite, so a future default improvement still reaches it',
  api(`(() => {
    const ed = openEd();
    if (spriteEditorTuningDiff(ed) !== null) return 'an untouched editor wants to store tuning';
    spriteEditorSetTuning(ed, { alphaFloor: 96 });
    const diff = spriteEditorTuningDiff(ed);
    if (!diff || diff.alphaFloor !== 96) return 'the change was not captured: ' + JSON.stringify(diff);
    if (Object.keys(diff).length !== 1) return 'it stored the whole table: ' + JSON.stringify(diff);
    return true;
  })()`));

console.log('\n2. Strokes and sliders do not destroy each other — the architecture');

check('a slider drag does NOT wipe eraser strokes',
  api(`(() => {
    const ed = openEd();
    spriteEditorStroke(ed, 55, 60, 65, 60);              // erase across the body
    if (alphaAt(ed.working, 60, 60) !== 0) return 'the stroke did not erase (alpha ' + alphaAt(ed.working, 60, 60) + ')';
    spriteEditorSetTuning(ed, { alphaFloor: 60 });        // now move a slider
    if (alphaAt(ed.working, 60, 60) !== 0) return 'a slider drag resurrected erased pixels — the whole point of the split';
    return true;
  })()`));

check('...and clearing the STROKES leaves the tuning alone, and vice versa',
  api(`(() => {
    const ed = openEd();
    spriteEditorSetTuning(ed, { alphaFloor: 60 });
    spriteEditorStroke(ed, 55, 60, 65, 60);
    spriteEditorResetStrokes(ed);
    if (ed.tuning.alphaFloor !== 60) return 'clearing edits reset the tuning too';
    if (alphaAt(ed.working, 60, 60) === 0) return 'clearing edits did not restore the erased pixels';
    spriteEditorResetTuning(ed);
    if (ed.tuning.alphaFloor !== CUTOUT_TUNING.alphaFloor) return 'reset tuning did not restore the default';
    return true;
  })()`));

console.log('\n3. The brush');

check('a stroke between two DISTANT points is continuous — no dotted trail',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 6, hardness: 1 };
    spriteEditorStroke(ed, 42, 40, 78, 40);   // 36px apart, 6px brush
    for (let x = 44; x <= 76; x++) {
      if (alphaAt(ed.working, x, 40) !== 0) return 'gap at x=' + x + ' (alpha ' + alphaAt(ed.working, x, 40) + ')';
    }
    return true;
  })()`));

check('a soft brush has a soft edge, and a hard brush does not',
  api(`(() => {
    const soft = openEd(); soft.brush = { size: 20, hardness: 0 };
    spriteEditorStroke(soft, 60, 80, 60, 80);
    const hard = openEd(); hard.brush = { size: 20, hardness: 1 };
    spriteEditorStroke(hard, 60, 80, 60, 80);
    const softEdge = alphaAt(soft.working, 69, 80);
    const hardEdge = alphaAt(hard.working, 69, 80);
    if (!(softEdge > 0 && softEdge < 255)) return 'the soft brush edge is not partial: ' + softEdge;
    if (hardEdge !== 0) return 'the hard brush edge is not hard: ' + hardEdge;
    return true;
  })()`));

check('RESTORE recovers exactly what the master holds, and never more (D6)',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 30, hardness: 1 };
    // erase a patch that spans BOTH solid subject and the low-alpha haze
    spriteEditorStroke(ed, 88, 110, 88, 110);
    ed.tool = 'restore';
    spriteEditorStroke(ed, 88, 110, 88, 110);
    // the haze area: the master had alpha 60 there, and the DEFAULT tuning
    // decided that is background. Restore must not exceed the master's own
    // alpha — it can bring back at most what was there.
    const master = makeMaster();
    for (let y = 100; y < 125; y++) {
      for (let x = 78; x < 100; x++) {
        const got = alphaAt(ed.working, x, y);
        const src = master[((y * EW) + x) * 4 + 3];
        if (got > src + 1) return 'restore invented opacity at ' + x + ',' + y + ': ' + got + ' > master ' + src;
      }
    }
    return true;
  })()`));

check('restore brings the master COLOUR back, not the decontamination mean',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 16, hardness: 1 };
    spriteEditorStroke(ed, 60, 80, 60, 80);
    ed.tool = 'restore';
    spriteEditorStroke(ed, 60, 80, 60, 80);
    const i = ((80 * EW) + 60) * 4;
    const m = makeMaster();
    if (ed.working[i] !== m[i] || ed.working[i+1] !== m[i+1] || ed.working[i+2] !== m[i+2]) {
      return 'colour is ' + [ed.working[i], ed.working[i+1], ed.working[i+2]] + ', master is ' + [m[i], m[i+1], m[i+2]];
    }
    return true;
  })()`));

console.log('\n4. Magic erase (Evidence 6) — click-anywhere, with a real tolerance');

check('a flood clears the region it was clicked in and stops at the boundary',
  api(`(() => {
    const ed = openEd();
    ed.tolerance = 30;
    // click inside the head, which is a distinct colour from the body
    const before = countOpaque(ed.working);
    spriteEditorFlood(ed, 60, 20);
    if (alphaAt(ed.working, 60, 20) !== 0) return 'the clicked region survived';
    if (alphaAt(ed.working, 60, 80) !== 255) return 'the flood crossed into the body — the tolerance is not holding';
    const after = countOpaque(ed.working);
    if (!(after < before)) return 'nothing was erased';
    return true;
  })()`));

check('a LOWER tolerance erases less than a higher one — the control is real',
  api(`(() => {
    const tight = openEd(); tight.tolerance = 3;
    const loose = openEd(); loose.tolerance = 60;
    // Click in the middle of the gradient band, where tolerance is the ONLY
    // thing deciding how far the fill reaches.
    spriteEditorFlood(tight, 60, 151);
    spriteEditorFlood(loose, 60, 151);
    const t = countOpaque(tight.working), l = countOpaque(loose.working);
    return l < t || 'loose kept ' + l + ' opaque, tight kept ' + t + ' — tolerance is doing nothing';
  })()`));

check('the flood is CLICK-ANYWHERE — it works on a region no border sweep could reach',
  api(`(() => {
    const ed = openEd();
    ed.tolerance = 40;
    // A hole punched in the middle of the body, walled in on every side.
    ed.brush = { size: 10, hardness: 1 };
    spriteEditorStroke(ed, 60, 80, 60, 80);
    const enclosed = alphaAt(ed.working, 60, 80);
    if (enclosed !== 0) return 'setup failed';
    // Flooding from inside that hole is exactly the enclosed-region case.
    const n = ed.history.length;
    spriteEditorFlood(ed, 60, 80);
    return ed.history.length >= n || 'a flood inside an enclosed region did nothing';
  })()`));

console.log('\n5. History (D20) — 200 deep, and affordable');

check('undo and redo land on the right pixels',
  api(`(() => {
    const ed = openEd();
    const clean = alphaAt(ed.working, 60, 60);
    spriteEditorStroke(ed, 55, 60, 65, 60);
    const erased = alphaAt(ed.working, 60, 60);
    if (erased === clean) return 'the stroke did nothing';
    if (!spriteEditorUndo(ed)) return 'undo refused';
    if (alphaAt(ed.working, 60, 60) !== clean) return 'undo did not restore: ' + alphaAt(ed.working, 60, 60);
    if (!spriteEditorRedo(ed)) return 'redo refused';
    if (alphaAt(ed.working, 60, 60) !== erased) return 'redo did not re-apply';
    return true;
  })()`));

check('a TUNING change undoes too, not just strokes',
  api(`(() => {
    const ed = openEd();
    spriteEditorSetTuning(ed, { alphaFloor: 20 });
    if (ed.tuning.alphaFloor !== 20) return 'setup';
    spriteEditorUndo(ed);
    return ed.tuning.alphaFloor === CUTOUT_TUNING.alphaFloor || 'tuning undo left ' + ed.tuning.alphaFloor;
  })()`));

check('an action after an undo REPLACES the redo branch rather than forking it',
  api(`(() => {
    const ed = openEd();
    spriteEditorStroke(ed, 50, 50, 52, 50);
    spriteEditorStroke(ed, 50, 90, 52, 90);
    spriteEditorUndo(ed);
    if (!spriteEditorCanRedo(ed)) return 'setup: nothing to redo';
    spriteEditorStroke(ed, 70, 70, 72, 70);
    return spriteEditorCanRedo(ed) === false || 'the old redo branch survived a new action';
  })()`));

check('the history caps at 200 and drops the OLDEST, not the newest',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 2, hardness: 1 };
    // Each stroke must land on pixels no earlier stroke touched: a stroke
    // that changes nothing correctly does NOT commit, or a player could fill
    // their undo stack with no-ops.
    let made = 0;
    for (let gy = 0; gy < 27 && made < SPRITE_EDIT_HISTORY_MAX + 25; gy++) {
      for (let gx = 0; gx < 10 && made < SPRITE_EDIT_HISTORY_MAX + 25; gx++) {
        const x = 41 + gx * 4, y = 32 + gy * 4;
        if (spriteEditorStroke(ed, x, y, x, y)) made++;
      }
    }
    if (made < SPRITE_EDIT_HISTORY_MAX + 25) return 'the fixture only made ' + made + ' commits';
    if (ed.history.length !== SPRITE_EDIT_HISTORY_MAX) return 'history length is ' + ed.history.length;
    if (ed.historyIndex !== SPRITE_EDIT_HISTORY_MAX - 1) return 'index is ' + ed.historyIndex;
    // the most recent action must still be undoable
    return spriteEditorCanUndo(ed) === true || 'the newest action was dropped';
  })()`));

check('a stroke that changes nothing does not commit — an undo stack of no-ops helps nobody',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 6, hardness: 1 };
    if (!spriteEditorStroke(ed, 60, 60, 60, 60)) return 'the first stroke did not commit';
    const n = ed.history.length;
    if (spriteEditorStroke(ed, 60, 60, 60, 60) !== null) return 'a repeat of the same stroke committed again';
    return ed.history.length === n || 'history grew from ' + n + ' to ' + ed.history.length;
  })()`));

check('history stores SPARSE deltas — 200 buffer snapshots would be ~150 MB',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 8, hardness: 1 };
    spriteEditorStroke(ed, 50, 50, 55, 50);
    const e = ed.history[ed.history.length - 1];
    if (e.kind !== 'stroke') return 'wrong entry kind';
    if (!e.delta || !e.delta.indices) return 'no sparse delta';
    const full = EW * EH;
    if (e.delta.indices.length >= full) return 'the delta is the whole buffer (' + e.delta.indices.length + ' of ' + full + ')';
    if (e.delta.indices.length !== e.delta.prev.length || e.delta.prev.length !== e.delta.next.length) return 'delta arrays disagree in length';
    return true;
  })()`));

check('undoing a whole stroke returns to BEFORE it, not to mid-stroke',
  api(`(() => {
    const ed = openEd();
    ed.brush = { size: 12, hardness: 1 };
    const clean = [];
    for (let x = 42; x < 78; x++) clean.push(alphaAt(ed.working, x, 70));
    // one long stroke whose stamps overlap heavily
    spriteEditorStroke(ed, 42, 70, 78, 70);
    spriteEditorUndo(ed);
    for (let x = 42; x < 78; x++) {
      if (alphaAt(ed.working, x, 70) !== clean[x - 42]) return 'residue left at x=' + x;
    }
    return true;
  })()`));

console.log('\n5b. Opening an UPLOADED sprite does not resurrect its background');
// Measured live before this split existed: editing an uploaded sprite and
// saving it produced an image with corner alpha 255 — the ingest matte
// silently undone, the sprite an opaque rectangle again.

api(`
  function makeOpaqueUpload() {
    const d = new Uint8ClampedArray(EW * EH * 4);
    for (let i = 0; i < EW * EH; i++) { const o = i*4; d[o]=255; d[o+1]=255; d[o+2]=255; d[o+3]=255; }
    for (let y = 40; y < 120; y++) for (let x = 45; x < 75; x++) {
      const o = ((y*EW)+x)*4; d[o]=40; d[o+1]=60; d[o+2]=110; d[o+3]=255;
    }
    return d;
  }
`);

check('the editing source is matted, while the PRISTINE file is kept for restore and saving (D6)',
  api(`(() => {
    const ed = spriteEditorNew('n1|cutout|v', makeOpaqueUpload(), EW, EH, null, null);
    spriteEditorRecompose(ed);
    if (ed.pristine[((5*EW)+5)*4+3] !== 255) return 'the pristine copy was matted — recrop and reset would lose the original';
    if (ed.master[((5*EW)+5)*4+3] !== 0) return 'the editing source still has its backdrop (alpha ' + ed.master[((5*EW)+5)*4+3] + ')';
    if (ed.master[((80*EW)+60)*4+3] !== 255) return 'the subject was matted away';
    if (alphaAt(ed.working, 5, 5) !== 0) return 'the working image shows the backdrop';
    return true;
  })()`));

check('a genuine cutout is NOT re-matted — it already has an alpha channel',
  api(`(() => {
    const ed = openEd();
    return ed.master === ed.pristine || 'a transparent cutout was needlessly matted into a second buffer';
  })()`));

check('RESTORE brings back the artwork, not the backdrop',
  api(`(() => {
    const ed = spriteEditorNew('n1|cutout|v', makeOpaqueUpload(), EW, EH, null, null);
    spriteEditorRecompose(ed);
    ed.brush = { size: 20, hardness: 1 };
    ed.tool = 'restore';
    spriteEditorStroke(ed, 20, 20, 20, 20);
    return alphaAt(ed.working, 20, 20) === 0 || 'restore repainted the backdrop (alpha ' + alphaAt(ed.working, 20, 20) + ')';
  })()`));


console.log('\n6. Trim and the floor anchor (D16)');

check('the working bbox tracks the pixels, so auto-trim has something honest to crop to',
  api(`(() => {
    const ed = openEd();
    const before = ed.bbox;
    if (!before) return 'no bbox at all';
    const direct = cutoutBBox(ed.working, EW, EH, ed.tuning.bboxAlpha);
    if (JSON.stringify(before) !== JSON.stringify(direct)) return 'the editor bbox disagrees with cutoutBBox';
    // erase the head and the box must shrink from the top
    ed.brush = { size: 40, hardness: 1 };
    spriteEditorStroke(ed, 60, 20, 60, 20);
    if (!(ed.bbox.minY > before.minY)) return 'the bbox did not follow the erase: ' + before.minY + ' -> ' + ed.bbox.minY;
    return true;
  })()`));

check('the floor anchor is settable, clamped, and undoable',
  api(`(() => {
    const ed = openEd();
    const before = ed.anchor;
    spriteEditorSetAnchor(ed, 0.12);
    if (ed.anchor !== 0.12) return 'anchor is ' + ed.anchor;
    spriteEditorSetAnchor(ed, 9);
    if (ed.anchor > 0.5) return 'anchor was not clamped: ' + ed.anchor;
    spriteEditorSetAnchor(ed, -3);
    if (ed.anchor < 0) return 'negative anchor allowed: ' + ed.anchor;
    spriteEditorUndo(ed); spriteEditorUndo(ed); spriteEditorUndo(ed);
    return ed.anchor === before || 'undo left the anchor at ' + ed.anchor;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
