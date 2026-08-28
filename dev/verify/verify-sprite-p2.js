// Avatars & Sprite Studio, Phase 2 — the head crop (D9/D9b).
// (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// The cases below are NOT invented. They are the two populations the real
// reference generations actually split into, reproduced as synthetic
// silhouettes so they can be asserted without shipping 3 MB of PNGs into the
// test suite:
//
//   CLEAR NECK      short or tied hair. The silhouette narrows hard after the
//                   head (one real subject went 137px -> 55px) and then flares
//                   at the shoulders. Enormous signal.
//   MONOTONIC       long hair worn down. NO neck at any threshold — the
//                   profile rises steadily from crown to hip because the hair
//                   fills the neck and covers the shoulder line. Half of all
//                   real subjects measured.
//   TALL CROWN      a high bun. bbox.minY lands on the top of the HAIR, which
//                   is what made the first implementation slide the frame up
//                   and cut a subject's mouth off. D9b exists for this row.
//
// The reference implementation these are checked against is
// dev/design/sprite-studio/matte-and-measure.py, which produced the numbers
// quoted below from the real images. Where a specific value is asserted here
// it is because that exact value came out of that run — this file is a
// cross-implementation check of the JS port, not a fresh set of guesses.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// A silhouette builder. `profile` maps 0..1 down the figure to an opaque run
// width, so a test says what SHAPE it is testing rather than which pixels.
api(`
  var SILW = 512, SILH = 768;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(f, stops) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [f0, w0] = stops[i], [f1, w1] = stops[i + 1];
      if (f >= f0 && f <= f1) return lerp(w0, w1, f1 === f0 ? 0 : (f - f0) / (f1 - f0));
    }
    return stops[stops.length - 1][1];
  }
  function makeSil(stops, opts) {
    opts = opts || {};
    const top = opts.top != null ? opts.top : 24;
    const bot = opts.bot != null ? opts.bot : 740;
    const cx  = opts.cx  != null ? opts.cx  : SILW / 2;
    const bh = bot - top;
    const mask = new Uint8Array(SILW * SILH);
    for (let y = top; y <= bot; y++) {
      const w = seg((y - top) / bh, stops);
      if (w <= 0) continue;
      const x0 = Math.max(0, Math.round(cx - w / 2));
      const x1 = Math.min(SILW - 1, Math.round(cx + w / 2));
      for (let x = x0; x <= x1; x++) mask[y * SILW + x] = 1;
    }
    return mask;
  }
  function cropOf(mask) {
    const bbox = cutoutBBoxFromMask(mask, SILW, SILH);
    return { bbox: bbox, res: detectHeadCrop(mask, SILW, SILH, bbox) };
  }

  // The real profiles, as measured. Widths are the actual numbers from the
  // reference run; only the interpolation between them is synthetic.
  var SIL_NECK = [[0,10],[0.02,82],[0.06,133],[0.10,137],[0.14,79],[0.16,55],[0.20,112],[0.25,140],[0.40,196],[1,290]];
  var SIL_MONO = [[0,4],[0.02,65],[0.06,93],[0.10,126],[0.14,137],[0.16,130],[0.20,175],[0.24,156],[0.40,171],[1,276]];
  var SIL_BUN  = [[0,26],[0.04,44],[0.08,30],[0.12,64],[0.18,141],[0.22,157],[0.26,172],[0.32,183],[0.40,203],[1,300]];
`);

console.log('\n1. The two real populations resolve on different bases (D9)');

check('a silhouette with a clear neck takes the NECK path',
  api(`(() => { const r = cropOf(makeSil(SIL_NECK)).res; return r.basis === 'neck' || ('basis=' + r.basis + ' neckRatio=' + r.neckRatio); })()`));

check('...and it found the neck where the real profile has it (~0.16 of figure height)',
  api(`(() => {
    const { bbox, res } = cropOf(makeSil(SIL_NECK));
    const f = res.neckRow / bbox.height;
    return (f > 0.13 && f < 0.19) || ('neck at ' + f.toFixed(3));
  })()`));

check('a MONOTONIC silhouette — long hair, no narrowing anywhere — takes the PROPORTIONAL path',
  api(`(() => { const r = cropOf(makeSil(SIL_MONO)).res; return r.basis === 'proportional' || ('basis=' + r.basis + ' neckRatio=' + r.neckRatio); })()`));

check('...and that is not a threshold that could be tuned away: its peak/neck ratio is ~1.0',
  api(`(() => {
    const r = cropOf(makeSil(SIL_MONO)).res;
    return (r.neckRatio !== null && r.neckRatio < 1.10) || ('neckRatio=' + r.neckRatio);
  })()`));

console.log('\n2. The JS port reproduces the reference implementation\'s numbers');

check('the proportional side is exactly defaultHeadFrac x (1 + headroomFrac) — 0.269, as measured',
  api(`(() => {
    const r = cropOf(makeSil(SIL_MONO)).res;
    const expect = +(AVATAR_TUNING.defaultHeadFrac * (1 + AVATAR_TUNING.headroomFrac)).toFixed(3);
    if (expect !== 0.269) return 'the tuning moved: expected 0.269, table gives ' + expect;
    return r.sideFracOfBbox === expect || ('side=' + r.sideFracOfBbox + ' expected ' + expect);
  })()`));

check('the neck side follows neckRow x (1 + chinDropFrac) x (1 + headroomFrac)',
  api(`(() => {
    const { bbox, res } = cropOf(makeSil(SIL_NECK));
    const expect = +((res.neckRow / bbox.height) * (1 + AVATAR_TUNING.chinDropFrac) * (1 + AVATAR_TUNING.headroomFrac)).toFixed(3);
    return Math.abs(res.sideFracOfBbox - expect) < 0.002 || ('side=' + res.sideFracOfBbox + ' expected ~' + expect);
  })()`));

console.log('\n3. The clamps do NOT fire on well-formed silhouettes');
// This is the assertion that would have caught the original D9. Six of seven
// real subjects fell through to the min clamp, which is the signature of a
// detector contributing nothing.

check('neither clamp fires on any of the three real shapes',
  api(`(() => {
    const bad = [];
    for (const [name, stops] of [['neck', SIL_NECK], ['mono', SIL_MONO], ['bun', SIL_BUN]]) {
      const r = cropOf(makeSil(stops)).res;
      if (r.clamped) bad.push(name + '=' + r.clamped);
    }
    return bad.length === 0 || ('clamped: ' + bad.join(', '));
  })()`));

check('the max clamp DOES fire on a silhouette with no head structure at all — the guard rail still works',
  api(`(() => {
    // A uniform column: no peak, no neck, nothing. It must clamp rather than
    // return a torso.
    const r = cropOf(makeSil([[0,200],[1,200]])).res;
    return r.sideFracOfBbox <= AVATAR_TUNING.maxSideFrac || ('side=' + r.sideFracOfBbox);
  })()`));

console.log('\n4. D9b — the anchor is the head\'s widest row, not the topmost pixel');

check('a tall crown (a high bun) does NOT slide the frame up off the face',
  api(`(() => {
    const { bbox, res } = cropOf(makeSil(SIL_BUN));
    // The regression: hanging the crop off bbox.minY put the frame on the bun
    // and cut the chin. Anchored on the widest row, the crop starts BELOW the
    // top of the hair.
    return res.crop.y > bbox.minY || ('crop.y=' + res.crop.y + ' bbox.minY=' + bbox.minY + ' — the frame is still hanging off the crown');
  })()`));

check('...and the crop still reaches past the head, so the chin is inside it',
  api(`(() => {
    const { bbox, res } = cropOf(makeSil(SIL_BUN));
    const cropBottom = res.crop.y + res.crop.h;
    const headBottom = bbox.minY + Math.round(0.22 * bbox.height); // where the face ends in SIL_BUN
    return cropBottom > headBottom || ('crop ends at ' + cropBottom + ', the face ends at ' + headBottom);
  })()`));

check('a figure with NO tall crown still frames from near the top',
  api(`(() => {
    const { bbox, res } = cropOf(makeSil(SIL_NECK));
    return (res.crop.y - bbox.minY) < 0.06 * bbox.height || ('crop starts ' + (res.crop.y - bbox.minY) + 'px below the crown');
  })()`));

console.log('\n5. Centring, and the degenerate cases');

check('the horizontal centre tracks a head that is off-centre',
  api(`(() => {
    const left  = cropOf(makeSil(SIL_NECK, { cx: 160 })).res;
    const right = cropOf(makeSil(SIL_NECK, { cx: 360 })).res;
    const dl = left.crop.x + left.crop.w / 2;
    const dr = right.crop.x + right.crop.w / 2;
    if (Math.abs(dl - 160) > 12) return 'left-shifted head centred at ' + dl;
    if (Math.abs(dr - 360) > 12) return 'right-shifted head centred at ' + dr;
    return true;
  })()`));

check('the crop never leaves the frame',
  api(`(() => {
    for (const cx of [20, 60, 452, 500]) {
      const r = cropOf(makeSil(SIL_NECK, { cx: cx })).res;
      const c = r.crop;
      if (c.x < 0 || c.y < 0 || c.x + c.w > SILW || c.y + c.h > SILH) return 'cx=' + cx + ' -> ' + JSON.stringify(c);
    }
    return true;
  })()`));

check('an empty mask returns null rather than throwing — resolveAvatar then falls to initials (D10)',
  api(`(() => {
    const mask = new Uint8Array(SILW * SILH);
    const bbox = cutoutBBoxFromMask(mask, SILW, SILH);
    return bbox === null && detectHeadCrop(mask, SILW, SILH, bbox) === null;
  })()`));

check('a silhouette too short to have anatomy returns null',
  api(`(() => {
    const mask = makeSil([[0,40],[1,40]], { top: 100, bot: 104 });
    const bbox = cutoutBBoxFromMask(mask, SILW, SILH);
    return detectHeadCrop(mask, SILW, SILH, bbox) === null || 'a 5px figure produced a crop';
  })()`));

check('the crop is always square',
  api(`(() => {
    for (const stops of [SIL_NECK, SIL_MONO, SIL_BUN]) {
      const c = cropOf(makeSil(stops)).res.crop;
      if (c.w !== c.h) return JSON.stringify(c);
    }
    return true;
  })()`));

console.log('\n6. spriteAlphaMask agrees with the pipeline\'s own bbox threshold');

check('the mask uses CUTOUT_TUNING.bboxAlpha, so a crop and a cutout bbox always see the same silhouette',
  api(`(() => {
    const n = 4 * 4;
    const data = new Uint8ClampedArray(n * 4);
    // one pixel just below the threshold, one just above
    data[3] = CUTOUT_TUNING.bboxAlpha;          // index 0 -> excluded (strictly >)
    data[7] = CUTOUT_TUNING.bboxAlpha + 1;      // index 1 -> included
    const m = spriteAlphaMask(data, 4, 4);
    return (m[0] === 0 && m[1] === 1) || ('mask=' + m[0] + ',' + m[1]);
  })()`));

console.log('\n7. The shared component (D10/D11)');

check('initials read as a person\'s initials, up to two, and never empty',
  api(`avatarInitials('Marisol Vance') === 'MV'
    && avatarInitials('Sam') === 'S'
    && avatarInitials('Ana Lucia Perez Ortiz') === 'AL'
    && avatarInitials('') === '?'
    && avatarInitials(null) === '?'
    && avatarInitials('   ') === '?'`));

check('a chip paints initials and a tint with NO art and NO identity — the D10 floor',
  api(`(() => {
    const html = avatarChipHtml(null, { name: 'Beatrix Ellery' });
    if (!html.includes('avatar-chip-initials')) return 'no initials layer';
    if (!html.includes('>BE<')) return 'wrong initials: ' + html;
    if (!html.includes('background:hsl(')) return 'no tint';
    if (html.includes('data-avatar-identity')) return 'claimed an identity it does not have';
    return true;
  })()`));

check('a subject with NO anchor gets NO identity — 30 RoomList stubs must not collapse into one person',
  api(`(() => {
    // The real shape: a browse-grid stub has a name and no genSeed.
    const a = avatarChipHtml({ bible: { name: 'Otto Zeller' } }, {});
    const b = avatarChipHtml({ bible: { name: 'Beatrix Ellery' } }, {});
    if (a.includes('data-avatar-identity') || b.includes('data-avatar-identity')) {
      return 'a stub claimed an identity — every stub would share it';
    }
    // ...and they still look like different people.
    if (a === b) return 'two different stubs produced identical chips';
    // A player with no portrait seed is the same case.
    if (avatarIdentityFor({ name: 'Sam' }, true) !== null) return 'a seedless player claimed an identity';
    if (avatarIdentityFor(null, false) !== null) return 'null claimed an identity';
    return true;
  })()`));

check('a chip for a real NPC carries the SAME identity token the override store uses',
  api(`(() => {
    const npc = { bible: { name: 'Theo Hargrove', genSeed: 4242 } };
    const html = avatarChipHtml(npc, {});
    const want = cutoutIdentityToken(npc, false);
    if (want !== 'n4242') return 'identity token drifted: ' + want;
    return html.includes('data-avatar-identity="n4242"') || html;
  })()`));

check('...and the player\'s chip uses the PLAYER anchor, not an npc id',
  api(`(() => {
    const p = { name: 'Sam', portrait: { seed: 7 } };
    const html = avatarChipHtml(p, { isPlayer: true, ring: 'player' });
    if (!html.includes('data-avatar-identity="p7"')) return 'wrong identity: ' + html;
    return html.includes('data-ring="player"') || 'lost the player ring';
  })()`));

check('a name with markup in it cannot break out of the chip',
  api(`(() => {
    const html = avatarChipHtml(null, { name: '<img src=x onerror=alert(1)>' });
    if (html.includes('<img')) return 'unescaped markup reached the DOM string';
    const t = avatarChipHtml(null, { name: 'x', title: '"><script>' });
    return !t.includes('<script') || 'unescaped title';
  })()`));

check('the size table drives the chip, and an unknown size falls back rather than producing NaN',
  api(`(() => {
    if (avatarChipSize('map') !== AVATAR_TUNING.sizes.map) return 'map size wrong';
    if (avatarChipSize('hero') !== AVATAR_TUNING.sizes.hero) return 'hero size wrong';
    if (avatarChipSize(64) !== 64) return 'a literal px size was ignored';
    const fallback = avatarChipSize('nonsense');
    if (!Number.isFinite(fallback) || fallback <= 0) return 'unknown size gave ' + fallback;
    return avatarChipHtml(null, { name: 'A', size: 'map' }).includes('--avatar-size:18px') || 'size did not reach the markup';
  })()`));

check('hashToColor still lives (moved from render.computer.js) and is stable per name',
  api(`typeof hashToColor === 'function'
    && hashToColor('Marisol Vance') === hashToColor('Marisol Vance')
    && hashToColor('Marisol Vance') !== hashToColor('Theo Hargrove')
    && /^hsl\\(\\d+, 45%, 35%\\)$/.test(hashToColor('anyone'))`));

check('render.js\'s initialsFor is GONE — one implementation, not two (D11)',
  api(`typeof initialsFor === 'undefined'`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
