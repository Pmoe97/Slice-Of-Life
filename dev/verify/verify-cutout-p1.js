// Character-cutout-scene-rendering-plan, Phase 1 — the cutout factory's
// pure-logic half: key/seed composition and the cleanup pipeline's pixel
// math (D5/D14/D15/D16). root.generateImage is stubbed in this harness
// (loadgame.js), so getCharacterCutout/getPlayerCutout and cleanCutout
// itself (both need a real canvas) are NOT exercised here — see the plan's
// Handoff for what still needs a live Perchance run.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

console.log('\nKey and seed composition (D2/D3)');
check('cutoutKey has the documented shape',
  api(`cutoutKey('n123', 'seated', 'happy', 'cdressed_o_tshirt_bjeans', '')`) === 'cut_pv4_n123_seated_happy_cdressed_o_tshirt_bjeans',
  api(`cutoutKey('n123', 'seated', 'happy', 'cdressed_o_tshirt_bjeans', '')`));
check('the key carries the CURRENT prompt version, whatever it is — a bump must turn the namespace over',
  api(`cutoutKey('n1', 'standing', 'neutral', 'c_o_t_b', '').startsWith('cut_' + IMAGE_PROMPT_VERSION + '_')`));
check('a style token appends',
  api(`cutoutKey('n123', 'seated', 'happy', 'cdressed_o_tshirt_bjeans', 'st_noir')`).endsWith('_st_noir'));
check('composeCutoutSeed is deterministic — same inputs, same seed',
  api(`composeCutoutSeed('n123', 'standing', 'neutral', 'cdressed_o_t_b', '') === composeCutoutSeed('n123', 'standing', 'neutral', 'cdressed_o_t_b', '')`));
check('a different pose changes the seed',
  api(`composeCutoutSeed('n123', 'standing', 'neutral', 'cdressed_o_t_b', '') !== composeCutoutSeed('n123', 'seated', 'neutral', 'cdressed_o_t_b', '')`));
check('cutoutIdentityToken for an NPC matches composeSceneSeed\'s own anchor shape',
  api(`cutoutIdentityToken({ bible: { genSeed: 42 } }, false)`) === 'n42');
check('cutoutIdentityToken for the player defers to playerIdentityToken (D7)',
  api(`cutoutIdentityToken({ portrait: { seed: 99 } }, true)`) === 'p99');
check('cutoutOutfitToken names clothing state + the three worn slots',
  api(`cutoutOutfitToken({ clothing: 'dressed', outfit: { outerwear: 'jacket', top: 'tee', bottom: 'jeans' } })`) === 'cdressed_ojacket_ttee_bjeans');
check('a non-dressed clothing state overrides the outfit slots in the token',
  api(`cutoutOutfitToken({ clothing: 'towel', outfit: { outerwear: 'jacket', top: 'tee', bottom: 'jeans' } })`) === 'ctowel_ojacket_ttee_bjeans',
  'the state still folds in even though the character is not literally wearing the outfit right now — D4 treats clothing-state as its own key axis, not exclusive with outfit slots');
check('an outfit change alone changes the token (D4)',
  api(`cutoutOutfitToken({ clothing: 'dressed', outfit: { top: 'tee' } }) !== cutoutOutfitToken({ clothing: 'dressed', outfit: { top: 'blouse' } })`));

console.log('\nStage 3 — alpha bounding box + D16 floor anchor');
// A 10x8 buffer with a solid 4x3 opaque block at (3,2)-(6,4).
const bboxSetup = `(() => {
  const W = 10, H = 8;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 2; y <= 4; y++) for (let x = 3; x <= 6; x++) {
    const o = (y * W + x) * 4;
    data[o] = 200; data[o+1] = 150; data[o+2] = 100; data[o+3] = 255;
  }
  return { W, H, data };
})()`;
check('bbox finds the exact opaque rectangle',
  api(`(() => { const { W, H, data } = ${bboxSetup}; const b = cutoutBBox(data, W, H, 24); return b.minX === 3 && b.maxX === 6 && b.minY === 2 && b.maxY === 4 && b.width === 4 && b.height === 3; })()`));
check('an all-transparent buffer has no bbox',
  api(`cutoutBBox(new Uint8ClampedArray(40), 10, 1, 24) === null`));
check('bottomFrac is measured from the bbox\'s own lowest opaque row (D16), not a guessed constant',
  api(`(() => { const { H } = ${bboxSetup}; const b = cutoutBBox(${bboxSetup}.data, 10, H, 24); return Math.abs(cutoutBottomFrac(b, H) - (H - 1 - b.maxY) / H) < 1e-9; })()`),
  'sanity check on the formula itself');
check('a subject cropped flush to the bottom row has bottomFrac 0',
  api(`(() => { const W=10,H=8; const data=new Uint8ClampedArray(W*H*4); const y=H-1; for (let x=3;x<=6;x++){ const o=(y*W+x)*4; data[o+3]=255; } const b=cutoutBBox(data,W,H,24); return cutoutBottomFrac(b,H) === 0; })()`));

console.log('\nD15 — morphological closing preserves a thin extremity a strict sweep would sever');
// The dry-run-verified geometry: a 400px main blob, a 10px wisp attached
// through a 2px gap, and a 9px speck with no attachment. Without closing
// the wisp is its own tiny component (would be pruned as a speck exactly
// like "floating hair" in the wild); with D15's closeRadius it merges into
// the main component and survives, while the truly detached speck still
// gets pruned by D5's area/ratio test either way.
const setupCanvas = `(() => {
  const W = 40, H = 40;
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = (y * W + x) * 4;
      data[o] = 200; data[o+1] = 150; data[o+2] = 100; data[o+3] = 255;
    }
  };
  fill(5, 24, 5, 24);   // main, 20x20 = 400px
  fill(35, 37, 35, 37); // detached speck, 3x3 = 9px, far from main
  fill(27, 28, 10, 14); // wisp, 2x5 = 10px, separated from main's x=24 edge by a 2px gap (x=25,26)
  return { W, H, data };
})()`;
check('with D15 closing, the wisp merges into the main component and is never even considered for pruning',
  api(`(() => {
    const { W, H, data } = ${setupCanvas};
    const before = data.slice();
    const result = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    const wispIdx = (12 * W + 27) * 4 + 3; // inside the wisp
    return data[wispIdx] === 255 && before[wispIdx] === 255;
  })()`),
  'the wisp pixel\'s alpha must survive pruning unchanged');
check('the genuinely detached speck is still erased (D5 unaffected by D15 for real islands)',
  api(`(() => {
    const { W, H, data } = ${setupCanvas};
    cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    const speckIdx = (36 * W + 36) * 4 + 3; // inside the speck
    return data[speckIdx] === 0;
  })()`));
check('the main blob itself is always untouched',
  api(`(() => {
    const { W, H, data } = ${setupCanvas};
    cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    const mainIdx = (10 * W + 10) * 4 + 3;
    return data[mainIdx] === 255;
  })()`));
check('WITHOUT the D15 close (closeRadius 0), the same wisp would have been pruned as a speck — the regression this amendment fixes',
  api(`(() => {
    const { W, H, data } = ${setupCanvas};
    const tuning = Object.assign({}, CUTOUT_TUNING, { closeRadius: 0 });
    cutoutPruneSpecks(data, W, H, tuning);
    const wispIdx = (12 * W + 27) * 4 + 3;
    return data[wispIdx] === 0;
  })()`),
  'proves D15 is load-bearing, not a no-op — without it the wisp is severed and pruned just like the speck');

console.log('\nD14 — edge spill suppression decontaminates matte-edge RGB toward the subject\'s own color');
const spillSetup = `(() => {
  const W = 6, H = 1;
  const data = new Uint8ClampedArray(W * H * 4);
  // Fully opaque subject pixel: a warm skin tone.
  data[0] = 200; data[1] = 120; data[2] = 80; data[3] = 255;
  // A matte-edge pixel at half alpha, still carrying the WHITE background
  // color RMBG's soft mask leaves behind (the halo this amendment targets).
  data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 130;
  // A background pixel (below speckAlpha) — must be left alone entirely.
  data[8] = 255; data[9] = 255; data[10] = 255; data[11] = 10;
  return { W, H, data };
})()`;
check('a white matte-edge pixel moves toward the subject\'s own color, not left white',
  api(`(() => {
    const { W, H, data } = ${spillSetup};
    cutoutSuppressSpill(data, W, H, CUTOUT_TUNING);
    return data[4] < 250; // was 255 (pure white) before suppression
  })()`),
  'red channel of the matte-edge pixel should have moved down from 255 toward 200');
check('the subject\'s own opaque pixel is never touched',
  api(`(() => {
    const { W, H, data } = ${spillSetup};
    cutoutSuppressSpill(data, W, H, CUTOUT_TUNING);
    return data[0] === 200 && data[1] === 120 && data[2] === 80;
  })()`));
check('a background pixel below speckAlpha is left alone (nothing to decontaminate visibly)',
  api(`(() => {
    const { W, H, data } = ${spillSetup};
    cutoutSuppressSpill(data, W, H, CUTOUT_TUNING);
    return data[8] === 255 && data[9] === 255 && data[10] === 255;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
