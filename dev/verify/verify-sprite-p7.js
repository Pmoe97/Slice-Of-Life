// Avatars & Sprite Studio, Phase 7 — the avatar crop surface and the
// override sweep. (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// Three things worth testing here, and none of them need a canvas:
//
//   THE WILDCARD SWEEP (D5)   promote/demote MIGRATE a record between an
//                             exact slot and its wildcard rather than
//                             duplicating it — leaving both would mean the
//                             exact one silently shadows the wildcard
//                             forever (D3 checks exact first), so the
//                             widen/narrow control would look like a no-op.
//   THE STALE-AVATAR BUG      a cutout REGENERATE reuses cutoutKey's
//   (D8/D13, Phase 7)         deterministic string, so derivedAvatarKey — a
//                             pure function of that string plus the crop
//                             rect — is unchanged too. A linked avatar's
//                             derived-cache entry would otherwise outlive
//                             the sprite it was cut from. invalidateDerivedAvatar
//                             is the fix; this file asserts it from both
//                             sides of D8 (linked drops its stale entry,
//                             pinned is untouched).
//   THE RECROP RING'S MATHS   clamp / corner hit-test / move / resize, pure
//                             over numbers so the drag logic is directly
//                             testable without a pointer or a canvas.
//
// What this file deliberately does NOT test: the actual pixel crop
// (deriveAvatarFromCutout / spriteRecropOpen's decode) and the live drag —
// both need createImageBitmap/canvas, which this bare vm does not have, the
// same boundary every other sprite-studio harness respects. Those are
// spot-checked live in dev-harness.html instead.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js', 'spritestudio.js'] });

let pass = 0, fail = 0;
async function check(name, condOrPromise, detail) {
  let cond = condOrPromise;
  if (cond && typeof cond.then === 'function') cond = await cond;
  if (cond === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof cond === 'string' && cond ? cond : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

async function main() {

api(`
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      const S = () => stores[name] || (stores[name] = {});
      m.get = async (k) => { const v = S()[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { S()[k] = structuredClone(v); };
      m.update = async (k, fn) => { const s = S(); const cur = s[k] === undefined ? undefined : structuredClone(s[k]); const nv = fn(cur); s[k] = structuredClone(nv); return nv; };
      m.keys = async () => Object.keys(S());
      m.delete = async (k) => { delete S()[k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta','player','world','npcs','objects','images','snapshots','saves','saveIndex','menu','sprites']) kv[f] = wrap(f);
    return kv;
  }
  function blob(size) { return { size: size, __blob: true }; }

  async function freshStore() {
    root.kv = makeMemKv();
    clearSpriteSession();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS } });
    await loadSpriteIndex(true);
  }

  function cutRecord(slot, size, extra) {
    return Object.assign({ slot: slot, origin: 'edited', mode: 'pinned', image: blob(size || 1000), master: blob(size || 1000) }, extra || {});
  }

  var IDENT = 'n77';
  var POSE = 'standing', EXPR = 'neutral';
  var OUT_A = 'cdressed_ojacket_ttee_bjeans';
  var OUT_B = 'cswim_o_t_b';
  var VAR_A = cutoutVariant(POSE, EXPR, OUT_A);
  var VAR_B = cutoutVariant(POSE, EXPR, OUT_B);
  var WILD = wildcardVariantOf(VAR_A);
  var AV_SLOT = spriteSlotId(IDENT, 'avatar', SPRITE_AVATAR_VARIANT);
`);

console.log('\n1. spriteOverrideScope — read straight off the slot id, no store read');

await check('an exact slot reports narrow scope and names its own widen target',
  api(`(() => {
    const s = spriteOverrideScope(spriteSlotId(IDENT, 'cutout', VAR_A));
    if (s.wide !== false) return 'reported wide: ' + JSON.stringify(s);
    return s.widenVariant === WILD || ('widenVariant=' + s.widenVariant);
  })()`));

await check('a wildcard slot reports wide scope and no widen target',
  api(`(() => {
    const s = spriteOverrideScope(spriteSlotId(IDENT, 'cutout', WILD));
    return (s.wide === true && s.widenVariant === null) || JSON.stringify(s);
  })()`));

await check('an avatar slot has no scope — D5 is outfit-only',
  api(`spriteOverrideScope(AV_SLOT) === null`));

console.log('\n2. Promote exact -> wildcard MIGRATES the record (D5)');

await check('promoting leaves exactly ONE record, addressed as the wildcard',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR_A), 111));
    const res = await promoteSpriteOverride(spriteSlotId(IDENT, 'cutout', VAR_A));
    if (!res.ok) return 'refused: ' + res.message;
    if (res.slot !== spriteSlotId(IDENT, 'cutout', WILD)) return 'wrong new slot: ' + res.slot;
    const keys = await root.kv.sprites.keys();
    if (keys.length !== 1) return 'left ' + keys.length + ' records: ' + JSON.stringify(keys);
    if (keys[0] !== res.slot) return 'the surviving record is at the wrong address: ' + keys[0];
    return true;
  })()`));

await check('...and the pixels moved with it — same bytes, new address',
  api(`(async () => {
    const rec = await getSpriteRecord(spriteSlotId(IDENT, 'cutout', WILD));
    return (rec && rec.image.size === 111) || 'wrong pixels after promotion: ' + JSON.stringify(rec);
  })()`));

await check('...and it now answers for an outfit it NEVER had art for — the whole point',
  api(`(async () => {
    const r = await resolveSprite(IDENT, 'cutout', VAR_B, { styleToken: '' });
    if (r.source !== 'override') return 'source was ' + r.source;
    return r.slot === spriteSlotId(IDENT, 'cutout', WILD) || 'resolved the wrong slot: ' + r.slot;
  })()`));

await check('promoting an already-wide slot is refused',
  api(`(async () => {
    const res = await promoteSpriteOverride(spriteSlotId(IDENT, 'cutout', WILD));
    return (res.ok === false) || 'a wildcard was widened again';
  })()`));

await check('promoting is refused if the wildcard is already someone else\'s — never silently overwritten',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR_A), 10));
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', WILD), 20));
    const res = await promoteSpriteOverride(spriteSlotId(IDENT, 'cutout', VAR_A));
    if (res.ok) return 'the collision was not caught — one of the two records is gone now';
    const keys = await root.kv.sprites.keys();
    return keys.length === 2 || 'a record vanished on a refused promote: ' + JSON.stringify(keys);
  })()`));

console.log('\n3. Demote wildcard -> exact writes ONLY the outfit currently in effect (D5)');

await check('demoting leaves exactly ONE record, addressed at the given outfit and no other',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', WILD), 222));
    const res = await demoteSpriteOverride(spriteSlotId(IDENT, 'cutout', WILD), OUT_A);
    if (!res.ok) return 'refused: ' + res.message;
    if (res.slot !== spriteSlotId(IDENT, 'cutout', VAR_A)) return 'wrong new slot: ' + res.slot;
    const keys = await root.kv.sprites.keys();
    if (keys.length !== 1 || keys[0] !== res.slot) return JSON.stringify(keys);
    return true;
  })()`));

await check('...and the OTHER outfit it used to cover now falls through — nothing left answering for it',
  api(`(async () => {
    const r = await resolveSprite(IDENT, 'cutout', VAR_B, { styleToken: '' });
    return r.source !== 'override' || 'VAR_B is still served by an override after narrowing to VAR_A: ' + r.slot;
  })()`));

await check('demoting an already-exact slot is refused',
  api(`(async () => {
    const res = await demoteSpriteOverride(spriteSlotId(IDENT, 'cutout', VAR_A), OUT_A);
    return (res.ok === false) || 'an exact slot was narrowed again';
  })()`));

await check('demoting with no outfit token is refused rather than guessing',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', WILD), 5));
    const res = await demoteSpriteOverride(spriteSlotId(IDENT, 'cutout', WILD), null);
    return (res.ok === false) || 'demoted with no outfit to narrow to';
  })()`));

await check('demoting is refused if the exact slot is already someone else\'s',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', WILD), 30));
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR_A), 40));
    const res = await demoteSpriteOverride(spriteSlotId(IDENT, 'cutout', WILD), OUT_A);
    if (res.ok) return 'the collision was not caught';
    const keys = await root.kv.sprites.keys();
    return keys.length === 2 || 'a record vanished on a refused demote: ' + JSON.stringify(keys);
  })()`));

console.log('\n4. The stale-avatar bug — a cutout regenerate must not leave a linked avatar behind (D8/D13)');

await check('a LINKED avatar\'s derived cache entry is dropped by invalidateDerivedAvatar',
  api(`(async () => {
    await freshStore();
    const key = cutoutKey(IDENT, POSE, EXPR, OUT_A, '');
    await setCachedImage(key, blob(1));                 // "the cutout, before a reroll"
    const crop = { x: 10, y: 12, w: 40, h: 40 };
    await doSpriteAvatarLink({}, IDENT, { crop: crop, sourceVariant: VAR_A });
    const avKey = derivedAvatarKey(key, crop);
    await setCachedImage(avKey, blob(2));                // "the headshot cut from it"
    if (!(await getCachedImage(avKey))) return 'setup: derived entry did not seed';

    await invalidateDerivedAvatar(IDENT, key);
    return (await getCachedImage(avKey)) === null || 'the stale derived avatar survived invalidation';
  })()`));

await check('...and the LINKED record itself — crop, sourceVariant, mode — is untouched by that call',
  api(`(async () => {
    const rec = await getSpriteRecord(AV_SLOT);
    if (!rec || rec.mode !== 'linked') return 'not linked: ' + JSON.stringify(rec);
    if (rec.sourceVariant !== VAR_A) return 'sourceVariant drifted: ' + rec.sourceVariant;
    return (rec.crop.x === 10 && rec.crop.w === 40) || 'crop drifted: ' + JSON.stringify(rec.crop);
  })()`));

await check('a linked avatar with NO CROP (crop: null) is invalidated at the crop-less key, not thrown on',
  api(`(async () => {
    await freshStore();
    const key = cutoutKey(IDENT, POSE, EXPR, OUT_A, '');
    await doSpriteAvatarLink({}, IDENT, { crop: null, sourceVariant: VAR_A });
    const avKey = derivedAvatarKey(key, null);
    await setCachedImage(avKey, blob(3));
    await invalidateDerivedAvatar(IDENT, key);
    return (await getCachedImage(avKey)) === null || 'a crop-less derived entry survived';
  })()`));

await check('a PINNED avatar is untouched by the same call — D8\'s direction rule, from this side too',
  api(`(async () => {
    await freshStore();
    const key = cutoutKey(IDENT, POSE, EXPR, OUT_A, '');
    await putSpriteRecord({ slot: AV_SLOT, origin: 'uploaded', mode: 'pinned', image: blob(555), master: blob(555) });
    const before = JSON.stringify(await getSpriteRecord(AV_SLOT));

    await invalidateDerivedAvatar(IDENT, key);   // must be a no-op

    const after = JSON.stringify(await getSpriteRecord(AV_SLOT));
    return before === after || 'a pinned avatar record changed:\\n  ' + before + '\\n  ' + after;
  })()`));

await check('an identity with no avatar record at all does not throw, and touches nothing',
  api(`(async () => {
    await freshStore();
    const key = cutoutKey(IDENT, POSE, EXPR, OUT_A, '');
    await invalidateDerivedAvatar(IDENT, key);
    await invalidateDerivedAvatar('', key);
    await invalidateDerivedAvatar(IDENT, null);
    return true;
  })()`));

console.log('\n5. The recrop ring\'s pure geometry');

await check('clamp keeps the ring square and inside the frame from every direction',
  api(`(() => {
    const cases = [
      { x: -50, y: -50, w: 40, h: 40 },
      { x: 900, y: 900, w: 40, h: 40 },
      { x: 10, y: 10, w: 9999, h: 9999 },
      { x: 10, y: 10, w: 40, h: 90 },   // not square going in
    ];
    for (const c of cases) {
      const r = spriteRecropClampCrop(c, 300, 200);
      if (r.w !== r.h) return 'not square: ' + JSON.stringify(r);
      if (r.x < 0 || r.y < 0 || r.x + r.w > 300 || r.y + r.h > 200) return 'left the frame: ' + JSON.stringify(r);
    }
    return true;
  })()`));

await check('corner hit-testing finds all four corners and nothing far from them',
  api(`(() => {
    const crop = { x: 50, y: 60, w: 80, h: 80 };
    const handle = spriteRecropHandleSize(crop);
    if (spriteRecropCornerAt(crop, 50, 60, handle) !== 'tl') return 'missed tl';
    if (spriteRecropCornerAt(crop, 130, 60, handle) !== 'tr') return 'missed tr';
    if (spriteRecropCornerAt(crop, 50, 140, handle) !== 'bl') return 'missed bl';
    if (spriteRecropCornerAt(crop, 130, 140, handle) !== 'br') return 'missed br';
    return spriteRecropCornerAt(crop, 90, 100, handle) === null || 'the CENTRE registered as a corner';
  })()`));

await check('moving the ring keeps its size and clamps at the edge',
  api(`(() => {
    const crop = { x: 50, y: 50, w: 40, h: 40 };
    const moved = spriteRecropMoveTo(crop, 100, 20, 300, 200);
    if (moved.w !== 40 || moved.h !== 40) return 'size changed on a move: ' + JSON.stringify(moved);
    if (moved.x !== 100 || moved.y !== 20) return 'did not land where dragged: ' + JSON.stringify(moved);
    const edge = spriteRecropMoveTo(crop, 290, 190, 300, 200);
    return (edge.x + edge.w <= 300 && edge.y + edge.h <= 200) || 'a move at the edge left the frame: ' + JSON.stringify(edge);
  })()`));

await check('resizing from br grows away from the FIXED tl anchor and stays square',
  api(`(() => {
    const crop = { x: 40, y: 40, w: 60, h: 60 };
    const r = spriteRecropResizeFromCorner(crop, 'br', 160, 100, 300, 200);
    if (r.x !== 40 || r.y !== 40) return 'the anchor moved: ' + JSON.stringify(r);
    if (r.w !== r.h) return 'not square: ' + JSON.stringify(r);
    return r.w === 120 || ('expected side 120 (max(|160-40|,|100-40|)), got ' + r.w);
  })()`));

await check('resizing from tl grows away from the FIXED br anchor',
  api(`(() => {
    const crop = { x: 100, y: 100, w: 60, h: 60 };
    const r = spriteRecropResizeFromCorner(crop, 'tl', 40, 90, 300, 200);
    const anchorX = 160, anchorY = 160; // br of the original crop
    if (r.x + r.w !== anchorX || r.y + r.h !== anchorY) return 'the br anchor moved: ' + JSON.stringify(r);
    return r.w === r.h || 'not square: ' + JSON.stringify(r);
  })()`));

await check('the handle size has a floor, so a tiny crop is still grabbable',
  api(`spriteRecropHandleSize({ w: 2 }) >= 14 && spriteRecropHandleSize({ w: 400 }) > spriteRecropHandleSize({ w: 40 })`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
