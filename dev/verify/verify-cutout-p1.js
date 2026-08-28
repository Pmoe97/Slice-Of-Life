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
  api(`cutoutKey('n123', 'seated', 'happy', 'cdressed_o_tshirt_bjeans', '')`) === 'cut_pv4c2_n123_seated_happy_cdressed_o_tshirt_bjeans',
  api(`cutoutKey('n123', 'seated', 'happy', 'cdressed_o_tshirt_bjeans', '')`));
check('the key carries the CURRENT prompt version, whatever it is — a bump must turn the namespace over',
  api(`cutoutKey('n1', 'standing', 'neutral', 'c_o_t_b', '').startsWith('cut_' + IMAGE_PROMPT_VERSION)`));
check('...and the cutout-only pipeline version too (D20), so a cleanup change repaints cutouts WITHOUT throwing away plates and portraits',
  api(`cutoutKey('n1', 'standing', 'neutral', 'c_o_t_b', '').startsWith('cut_' + IMAGE_PROMPT_VERSION + CUTOUT_PIPELINE_VERSION + '_')`));
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

console.log('\nD17 — alpha levels collapse RMBG\'s hedged mask before anything else reads it');
const levelsSetup = `(() => {
  const W = 6, H = 1;
  const data = new Uint8ClampedArray(W * H * 4);
  const alphas = [0, 40, 90, 145, 200, 255]; // background haze .. solid subject
  for (let i = 0; i < W; i++) { data[i*4] = 180; data[i*4+1] = 180; data[i*4+2] = 180; data[i*4+3] = alphas[i]; }
  return { W, H, data };
})()`;
check('the alpha-40 haze that survived the old pipeline is now background outright',
  api(`(() => { const { W, H, data } = ${levelsSetup}; cutoutAlphaLevels(data, W, H, CUTOUT_TUNING); return data[1*4+3] === 0; })()`),
  'this pixel is the reported bug in miniature: RMBG hedges over a textured backdrop, and alpha 40 used to render as visible speckle over the room plate');
check('a pixel exactly AT the floor is background too (the boundary is inclusive)',
  api(`(() => { const { W, H, data } = ${levelsSetup}; cutoutAlphaLevels(data, W, H, CUTOUT_TUNING); return data[2*4+3] === 0; })()`));
check('a pixel at or above the ceiling becomes fully solid',
  api(`(() => { const { W, H, data } = ${levelsSetup}; cutoutAlphaLevels(data, W, H, CUTOUT_TUNING); return data[4*4+3] === 255 && data[5*4+3] === 255; })()`));
check('the band between floor and ceiling stays a GRADIENT — a soft hair edge must not become a jaggy hard cut',
  api(`(() => { const { W, H, data } = ${levelsSetup}; cutoutAlphaLevels(data, W, H, CUTOUT_TUNING); const mid = data[3*4+3]; return mid > 0 && mid < 255; })()`),
  'alpha 145 sits mid-knee; smoothstep must leave it partially transparent, not snap it to an end');
check('RGB is never touched — this pass decides alpha and nothing else',
  api(`(() => { const { W, H, data } = ${levelsSetup}; cutoutAlphaLevels(data, W, H, CUTOUT_TUNING); return data[0] === 180 && data[1] === 180 && data[2] === 180; })()`));
check('a misconfigured knee (ceiling <= floor) leaves the mask alone rather than flattening it',
  api(`(() => { const { W, H, data } = ${levelsSetup}; const t = Object.assign({}, CUTOUT_TUNING, { alphaFloor: 200, alphaCeil: 200 }); cutoutAlphaLevels(data, W, H, t); return data[1*4+3] === 40; })()`));

console.log('\nD18 — closing RESCUES near-touching fragments; it must no longer MERGE residue into the main blob');
// The reported failure, reduced: a 400px subject and a 200px residue blob
// sitting 2px away from it — inside closeRadius' reach. Under the old
// "label the closed mask" scheme the two became ONE component, which was
// therefore the main one, which was therefore immune. It is also far too
// big for speckAreaMax (120), so D5 alone could never have caught it either.
const bridgeSetup = `(() => {
  const W = 200, H = 200;
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = (y * W + x) * 4;
      data[o] = 200; data[o+1] = 150; data[o+2] = 100; data[o+3] = 255;
    }
  };
  fill(20, 119, 40, 139);  // main subject, 100x100 = 10000px
  fill(122, 141, 60, 79);  // residue slab, 20x20 = 400px, a 2px gap from the
                           // subject's edge — well inside closeRadius' reach
  return { W, H, data };
})()`;
check('the main component is chosen from the RAW mask, so bridging can never inflate it',
  api(`(() => {
    const { W, H, data } = ${bridgeSetup};
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return r.mainArea === 10000;
  })()`),
  'the old scheme reported 10400 here — subject plus residue, closed into one component, which was therefore the largest, which was therefore immune');
check('a residue slab too big to be a wisp is NOT rescued just for sitting inside closing range',
  api(`(() => {
    const { W, H, data } = ${bridgeSetup};
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return r.rescued === 0;
  })()`),
  'rescueAreaMax is what separates "hair strand" from "background blob that happens to touch the silhouette"');
check('...so it gets erased',
  api(`(() => {
    const { W, H, data } = ${bridgeSetup};
    cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return data[(70 * W + 130) * 4 + 3] === 0;
  })()`));
check('...and the subject itself survives that same sweep intact',
  api(`(() => {
    const { W, H, data } = ${bridgeSetup};
    cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return data[(90 * W + 60) * 4 + 3] === 255;
  })()`));
check('a wisp-scale fragment in the same position IS still rescued — D15 is not undone by the cap',
  api(`(() => {
    const { W, H, data } = ${bridgeSetup};
    for (let y = 60; y <= 79; y++) for (let x = 122; x <= 141; x++) data[(y*W+x)*4+3] = 0; // clear the slab
    for (let x = 122; x <= 131; x++) data[(70*W+x)*4+3] = 255;                              // 10px strand instead
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return r.rescued === 1 && data[(70 * W + 125) * 4 + 3] === 255;
  })()`));

console.log('\nD19 — the dominance prune catches residue too big for the absolute speck threshold');
const dwarfSetup = `(() => {
  const W = 200, H = 200;
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = (y * W + x) * 4;
      data[o] = 200; data[o+1] = 150; data[o+2] = 100; data[o+3] = 255;
    }
  };
  fill(40, 139, 40, 139);   // main subject, 100x100 = 10000px
  fill(150, 169, 60, 79);   // residue, 20x20 = 400px: > speckAreaMax, < 6% of main, nowhere near a border
  return { W, H, data };
})()`;
check('a 400px residue blob is erased even though speckAreaMax (120) would have passed it',
  api(`(() => {
    const { W, H, data } = ${dwarfSetup};
    cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return data[(70 * W + 160) * 4 + 3] === 0;
  })()`));
check('WITHOUT D19 (speckRelMax 0) that same blob survives — proving the amendment is load-bearing',
  api(`(() => {
    const { W, H, data } = ${dwarfSetup};
    const t = Object.assign({}, CUTOUT_TUNING, { speckRelMax: 0, removeBorderComponents: false });
    cutoutPruneSpecks(data, W, H, t);
    return data[(70 * W + 160) * 4 + 3] === 255;
  })()`));
check('a component that is MOST of the frame is never erased by the dominance rule (the 0.85 guard still holds)',
  api(`(() => {
    const W = 60, H = 40;
    const data = new Uint8ClampedArray(W * H * 4);
    const fill = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y*W+x)*4+3] = 255; };
    fill(5, 24, 10, 29);   // 400px
    fill(30, 48, 10, 29);  // 380px — 0.95 of main, not dwarfed
    cutoutPruneSpecks(data, W, H, Object.assign({}, CUTOUT_TUNING, { removeBorderComponents: false }));
    return data[(20 * W + 35) * 4 + 3] === 255;
  })()`),
  'two comparably-sized blobs are ambiguous; the sweep must not gamble on which one is the character');

console.log('\nD18 — the bottom band is exempt from the border prune (feet legitimately reach it)');
const bandMask = `(W, H, x0, x1, y0, y1) => { const m = new Uint8Array(W*H); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y*W+x] = 1; return m; }`;
check('a component flush against the BOTTOM edge is not flagged as touching the border',
  api(`(() => {
    const W = 60, H = 40;
    const m = (${bandMask})(W, H, 10, 19, H - 10, H - 1);
    const r = cutoutLabelComponents(m, W, H, 3, true);
    return r.border[r.labels[(H - 1) * W + 15]] === false;
  })()`),
  'a standing pose\'s feet and a seated pose\'s hip both land here; erasing them would amputate the character');
check('...while the same component flush against the TOP edge IS flagged (unambiguously background)',
  api(`(() => {
    const W = 60, H = 40;
    const m = (${bandMask})(W, H, 10, 19, 0, 2);
    const r = cutoutLabelComponents(m, W, H, 3, true);
    return r.border[r.labels[1 * W + 15]] === true;
  })()`));
check('with borderIgnoreBottom off, the bottom edge counts again — the exemption is a real switch, not hardcoded',
  api(`(() => {
    const W = 60, H = 40;
    const m = (${bandMask})(W, H, 10, 19, H - 10, H - 1);
    const r = cutoutLabelComponents(m, W, H, 3, false);
    return r.border[r.labels[(H - 1) * W + 15]] === true;
  })()`));

console.log('\nD20 — Stage 0 stops asking for the backdrop that caused this');
check('the cutout prompt no longer says "studio background" — the phrase that summons a mottled muslin backdrop',
  api(`(() => {
    const npc = { bible: { name: 'Ada', age: 30, gender: 'female', physical: { hair: { color: 'red' }, eyes: {}, skin: {}, face: {}, body: {} } } };
    return !/studio background/i.test(buildCutoutPrompt(npc, 'standing', 'neutral'));
  })()`));
check('the isolation instruction is the LAST thing in the composed prompt, after the style suffix',
  api(`(() => {
    const npc = { bible: { name: 'Ada', age: 30, gender: 'female', physical: { hair: { color: 'red' }, eyes: {}, skin: {}, face: {}, body: {} } } };
    return cutoutPromptFor(npc, 'standing', 'neutral').endsWith(CUTOUT_ISOLATION_TAIL);
  })()`),
  'half of IMAGE_STYLES ends in a texture phrase that would otherwise apply to the backdrop too');
check('the negative prompt bans the specific artifacts the first live run produced',
  api(`(() => {
    const n = cutoutNegativePrompt().toLowerCase();
    return ['mottled background', 'textured background', 'grain', 'speckles', 'cast shadow'].every(t => n.includes(t));
  })()`));

console.log('\nD19 — Stage 3 crops to the SUBJECT, so a surviving speck cannot pin the box open');
// Cleanup is best-effort; one stubborn corner blob is always possible. What
// must NOT be possible is that blob deciding the crop, because the crop is
// also where D16 measures the floor anchor from — a frame-wide bbox hands
// the layout a character at the wrong scale, floating off the floor.
const cropSetup = `(() => {
  const W = 200, H = 200;
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, x1, y0, y1, a) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y*W+x)*4+3] = a;
  };
  fill(60, 119, 40, 159, 255);   // subject, 60x120, well inside the frame
  fill(0, 29, 0, 29, 255);       // a 900px corner blob the sweep will erase
  return { W, H, data };
})()`;
check('the main-component bbox is the subject\'s own box, not the frame',
  api(`(() => {
    const { W, H, data } = ${cropSetup};
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    const b = cutoutBBoxFromMask(r.mainMask, W, H);
    return b.minX === 60 && b.maxX === 119 && b.minY === 40 && b.maxY === 159;
  })()`));
check('a rescued wisp is inside the crop box — the subject is the main component PLUS what was rescued for it',
  api(`(() => {
    const W = 200, H = 200;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 40; y <= 159; y++) for (let x = 60; x <= 119; x++) data[(y*W+x)*4+3] = 255;
    for (let x = 122; x <= 131; x++) data[(100*W+x)*4+3] = 255; // 10px strand, 2px gap
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    const b = cutoutBBoxFromMask(r.mainMask, W, H);
    return r.rescued === 1 && b.maxX === 131;
  })()`),
  'cropping to the bare main component would slice a rescued hair strand back off');
check('cleanCutout prefers the main-component box and keeps the alpha box only as a fallback',
  api(`/cutoutBBoxFromMask\\([\\s\\S]{0,80}\\|\\|[\\s\\S]{0,40}cutoutBBox\\(/.test(cleanCutout.toString())`));
check('an all-background frame still yields no bbox, so the getter can refuse to cache an invisible sprite',
  api(`(() => {
    const W = 40, H = 40;
    const data = new Uint8ClampedArray(W * H * 4);
    const r = cutoutPruneSpecks(data, W, H, CUTOUT_TUNING);
    return cutoutBBoxFromMask(r.mainMask, W, H) === null;
  })()`));
check('...and both cutout getters take the null-bbox exit instead of blobbing a transparent canvas',
  api(`(() => {
    const src = getCharacterCutout.toString() + getPlayerCutout.toString();
    return (src.match(/cleaned\\.bbox/g) || []).length === 2;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
