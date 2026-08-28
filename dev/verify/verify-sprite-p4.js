// Avatars & Sprite Studio, Phase 4 — the app: roster, character sheet, and
// every asset verb. (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// What is being defended:
//
//   D8's DIRECTION RULE — regenerating or uploading an AVATAR never touches
//     the cutout, and regenerating a CUTOUT never overwrites a pinned avatar.
//     Asserted from BOTH sides, because it is the decision most likely to be
//     broken by a careless edit and the symptom (someone's chosen face
//     quietly reverting) is exactly the kind of thing nobody reports.
//   D5's SCOPE — an upload describes the CHARACTER, so it defaults to every
//     outfit of that pose; an edit defaults to this one.
//   D6's MASTER — an upload stores the file AS IT ARRIVED beside the
//     processed result, or recrop and "reset edits" are one-way doors.
//   D21's BOUNDARY — this app writes pixels and never people. Asserted over a
//     spied object rather than by reading source, because the AI-generation
//     plan's Phase 5 nearly went wrong the same way and a comment did not
//     stop it there.
//   REFUSALS — a bad upload is refused with a message a player can act on,
//     and the store is left exactly as it was.
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

  function studioState() {
    return {
      meta: { clock: { day: 2, phase: 'evening' } },
      player: { name: 'Sam', location: 'living_room', portrait: { seed: 7 }, clothing: 'dressed', outfit: {} },
      npcs: {
        res1: { bible: { name: 'Marisol Vance', genSeed: 201 }, residency: { status: 'resident' }, location: 'living_room', clothing: 'dressed', outfit: { top: 'tee', bottom: 'jeans' } },
        res2: { bible: { name: 'Theo Hargrove', genSeed: 202 }, residency: { status: 'resident' }, location: 'kitchen', clothing: 'dressed', outfit: {} },
        far:  { bible: { name: 'Zed Nobody',    genSeed: 203 }, residency: { status: 'former' },   location: 'elsewhere', clothing: 'dressed', outfit: {} },
        stub: { bible: { name: 'No Anchor' },                   residency: { status: 'visitor' },  location: 'elsewhere', clothing: 'dressed', outfit: {} },
      },
      objects: {},
      world: { computer: { apps: {} } },
    };
  }

  async function freshStudio() {
    root.kv = makeMemKv();
    clearSpriteSession();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS } });
    await loadSpriteIndex(true);
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    spriteQueue.pending = []; spriteQueue.running = false;
    spriteQueue.spentSession = 0; spriteQueue.spentDay = 0; spriteQueue.day = null;
    return studioState();
  }
`);

console.log('\n1. The app is registered on both surfaces (D16)');

await check('the app exists, is a utility, and declares computer AND phone',
  api(`(() => {
    const a = APP_DEFS.sprites;
    if (!a) return 'no APP_DEFS.sprites';
    if (a.category !== 'utility') return 'category is ' + a.category;
    if (JSON.stringify(a.devices) !== JSON.stringify(['computer', 'phone'])) return 'devices: ' + JSON.stringify(a.devices);
    if (a.entryScreen !== 'roster') return 'entry screen is ' + a.entryScreen;
    return true;
  })()`));

await check('the editor screen is hidden from nav — you reach it from a sprite, never from the tab bar',
  api(`(() => {
    const sc = APP_DEFS.sprites.screens;
    if (!sc.roster || sc.roster.hideFromNav) return 'roster should be nav-visible';
    if (!sc.character || !sc.character.hideFromNav) return 'character should be hidden';
    if (!sc.editor || !sc.editor.hideFromNav) return 'editor should be hidden';
    return true;
  })()`));

await check('the app gets fresh state on a save that predates it (the back-fill path)',
  api(`(() => {
    const merged = normalizeComputerState({ power: 'on', apps: { gigs: { board: [], accepted: [], reputation: 5 } } });
    const st = merged.apps.sprites;
    if (!st) return 'the sprites app state was not back-filled';
    if (st.mode !== 'roster' || st.filter !== 'all') return JSON.stringify(st);
    return true;
  })()`));

console.log('\n2. The roster');

await check('the roster is built from the SAME tier function the queue uses, household first',
  api(`(async () => {
    const gs = await freshStudio();
    const rows = spriteStudioRoster(gs);
    if (rows[0].id !== 'player') return 'first row is ' + rows[0].id;
    const ids = rows.map((r) => r.id);
    if (!ids.includes('res1') || !ids.includes('res2')) return 'the household is missing: ' + JSON.stringify(ids);
    // rank ordering: player(0) then residents(2) then the rest
    for (let i = 1; i < rows.length; i++) if (rows[i].rank < rows[i - 1].rank) return 'out of order: ' + JSON.stringify(rows.map((r) => [r.id, r.rank]));
    return true;
  })()`));

await check('a character with NO anchor is not in the roster at all — nothing to address art to',
  api(`(async () => {
    const gs = await freshStudio();
    const ids = spriteStudioRoster(gs).map((r) => r.id);
    return !ids.includes('stub') || 'an anchorless stub reached the roster';
  })()`));

await check('the filters partition the roster the way their labels claim',
  api(`(async () => {
    const gs = await freshStudio();
    const rows = spriteStudioRoster(gs);
    const house = rows.filter((r) => spriteStudioFilterRow(gs, r, 'household')).map((r) => r.id).sort();
    if (JSON.stringify(house) !== JSON.stringify(['player', 'res1', 'res2'])) return 'household: ' + JSON.stringify(house);
    if (rows.filter((r) => spriteStudioFilterRow(gs, r, 'custom')).length !== 0) return 'custom is not empty on a fresh store';
    const none = rows.filter((r) => spriteStudioFilterRow(gs, r, 'none')).length;
    if (none !== rows.length) return 'not everyone reads as needing art: ' + none + '/' + rows.length;

    // give one of them art and watch it move between filters
    const row = rows.find((r) => r.id === 'res1');
    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', spriteReadySetFor(row.who)[0]), origin: 'edited', mode: 'pinned', image: blob(10), master: blob(10) });
    if (!spriteStudioFilterRow(gs, row, 'custom')) return 'a character with an override is not in "has custom art"';
    if (spriteStudioFilterRow(gs, row, 'none')) return 'a character with an override still reads as needing art';
    return true;
  })()`));

console.log('\n3. The grid (D5 — the outfit trap, made visible)');

await check("the grid follows the character's current outfit by default",
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const token = spriteStudioOutfitToken(gs, row, 'current');
    if (token !== cutoutOutfitToken(row.who)) return 'got ' + token;
    // ...and an explicit choice overrides it
    const picked = spriteStudioOutfitToken(gs, row, 'ctowel_o_t_b');
    return picked === 'ctowel_o_t_b' || 'explicit outfit ignored: ' + picked;
  })()`));

await check('the outfit list is built from art that EXISTS, plus "current"',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    if (JSON.stringify(spriteStudioOutfits(row.identity)) !== JSON.stringify(['current'])) return 'a fresh store offered more than "current"';
    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', cutoutVariant('standing', 'neutral', 'ctowel_o_t_b')), origin: 'uploaded', mode: 'pinned', image: blob(9), master: blob(9) });
    const list = spriteStudioOutfits(row.identity);
    if (!list.includes('ctowel_o_t_b')) return 'the stored outfit is missing: ' + JSON.stringify(list);
    if (list[0] !== 'current') return '"current" is not first';
    return true;
  })()`));

await check('a WILDCARD override never appears as a pickable outfit — it is an address, not an outfit',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const v = cutoutVariant('standing', 'neutral', cutoutOutfitToken(row.who));
    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', wildcardVariantOf(v)), origin: 'uploaded', mode: 'pinned', image: blob(9), master: blob(9) });
    const list = spriteStudioOutfits(row.identity);
    return !list.some((o) => o.includes('*')) || 'a wildcard leaked into the outfit picker: ' + JSON.stringify(list);
  })()`));

await check('a cell reports custom / custom-all / missing distinctly, so the grid can say WHERE art applies',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const outfit = cutoutOutfitToken(row.who);
    let cs = await spriteStudioCellState(gs, row, 'standing', 'neutral', outfit);
    if (cs.state !== 'missing') return 'fresh cell reads ' + cs.state;

    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', wildcardVariantOf(cutoutVariant('standing','neutral',outfit))), origin: 'uploaded', mode: 'pinned', image: blob(9), master: blob(9) });
    clearSpriteSession(); await loadSpriteIndex(true);
    cs = await spriteStudioCellState(gs, row, 'standing', 'neutral', outfit);
    if (cs.state !== 'custom-all') return 'a wildcard-backed cell reads ' + cs.state;

    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', cutoutVariant('standing','neutral',outfit)), origin: 'edited', mode: 'pinned', image: blob(9), master: blob(9) });
    clearSpriteSession(); await loadSpriteIndex(true);
    cs = await spriteStudioCellState(gs, row, 'standing', 'neutral', outfit);
    if (cs.state !== 'custom') return 'an exact override reads ' + cs.state;
    return true;
  })()`));

console.log('\n4. D8 — the direction rule, from both sides');

await check('regenerating a CUTOUT does not touch a pinned avatar',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const avSlot = spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT);
    await putSpriteRecord({ slot: avSlot, origin: 'uploaded', mode: 'pinned', image: blob(555), master: blob(555) });
    const before = JSON.stringify(spriteIndexEntry(avSlot));

    root.generateImage = async () => ({});   // the harness has no canvas: the failure path
    await doSpriteRegenerate(gs, row.identity, spriteReadySetFor(row.who)[0]);

    const after = JSON.stringify(spriteIndexEntry(avSlot));
    if (before !== after) return 'the pinned avatar record changed:\\n  ' + before + '\\n  ' + after;
    const rec = await getSpriteRecord(avSlot);
    return (rec && rec.image && rec.image.size === 555) || 'the pinned avatar pixels changed';
  })()`));

await check('uploading an AVATAR does not touch the cutout',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const variant = spriteReadySetFor(row.who)[0];
    const cutSlot = spriteSlotId(row.identity, 'cutout', variant);
    await putSpriteRecord({ slot: cutSlot, origin: 'edited', mode: 'pinned', image: blob(777), master: blob(777) });
    const before = JSON.stringify(spriteIndexEntry(cutSlot));

    await saveSpriteUpload(gs, row.identity, SPRITE_AVATAR_VARIANT,
      { image: blob(88), master: blob(88), w: 256, h: 256, bbox: null, bottomFrac: null },
      { kind: 'avatar', scope: 'exact', origin: 'uploaded' });

    const after = JSON.stringify(spriteIndexEntry(cutSlot));
    if (before !== after) return 'the cutout record changed';
    const rec = await getSpriteRecord(cutSlot);
    return (rec && rec.image.size === 777) || 'the cutout pixels changed';
  })()`));

await check('a PINNED avatar outranks the derived one, so the sprite can change under it without changing the face',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT), origin: 'uploaded', mode: 'pinned', image: blob(42), master: blob(42) });
    clearSpriteSession(); await loadSpriteIndex(true);
    const res = await resolveAvatar(row.identity, { who: row.who, isPlayer: false });
    if (res.source !== 'override') return 'a pinned avatar resolved as ' + res.source;
    return res.record.image.size === 42 || 'wrong pixels served';
  })()`));

await check('unlinking with nothing to keep refuses rather than pinning an empty avatar',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const res = await doSpriteAvatarUnlink(gs, row.identity);
    if (res.ok) return 'it pinned something that does not exist';
    return !!res.message || 'refused with no message';
  })()`));

await check('linking stores a record with NO pixels — a linked avatar is a crop rect, not an image',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const res = await doSpriteAvatarLink(gs, row.identity, { crop: { x: 10, y: 20, w: 100, h: 100 } });
    if (!res.ok) return res.message;
    const rec = await getSpriteRecord(spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT));
    if (rec.mode !== 'linked') return 'mode is ' + rec.mode;
    if (rec.image || rec.master) return 'a linked record carries pixels';
    if (!rec.crop || rec.crop.x !== 10) return 'the crop rect was lost';
    const entry = spriteIndexEntry(rec.slot);
    // ~200 bytes of overhead and no blobs: the reason linking is the default.
    return entry.bytes < 1000 || 'a linked record weighs ' + entry.bytes + ' bytes';
  })()`));

console.log('\n5. Uploads — refusals, scope (D5) and the master (D6)');

await check('a wrong file type and an oversize file are both refused, with a message naming why',
  api(`(async () => {
    const big = { type: 'image/png', size: SPRITE_STORE.maxUploadBytes + 1 };
    const wrong = { type: 'image/gif', size: 100 };
    const a = await ingestSpriteUpload(wrong, { kind: 'cutout' });
    const b = await ingestSpriteUpload(big, { kind: 'cutout' });
    if (a.ok || b.ok) return 'a bad upload was accepted';
    if (!/PNG|WebP|JPEG/i.test(a.message)) return 'the type refusal does not say what IS allowed: ' + a.message;
    if (!/MB/.test(b.message)) return 'the size refusal does not name the limit: ' + b.message;
    return true;
  })()`));

await check('a refused upload leaves the store byte-for-byte as it was',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    await putSpriteRecord({ slot: spriteSlotId(row.identity, 'cutout', spriteReadySetFor(row.who)[0]), origin: 'edited', mode: 'pinned', image: blob(64), master: blob(64) });
    const before = JSON.stringify(spriteStoreUsage());
    await ingestSpriteUpload({ type: 'image/gif', size: 10 }, { kind: 'cutout' });
    return before === JSON.stringify(spriteStoreUsage()) || 'the store moved on a refusal';
  })()`));

await check('an upload defaults to EVERY outfit of the pose (D5) — it describes the character, not the laundry',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const variant = spriteReadySetFor(row.who)[0];
    const res = await saveSpriteUpload(gs, row.identity, variant,
      { image: blob(30), master: blob(31), w: 512, h: 768, bbox: { minX: 0, minY: 0, maxX: 100, maxY: 200, width: 101, height: 201 }, bottomFrac: 0.05 },
      { kind: 'cutout', scope: 'all', origin: 'uploaded' });
    if (!res.ok) return res.message;
    if (!isWildcardVariant(res.record.variant)) return 'stored against ' + res.record.variant;
    // ...and it therefore answers for an outfit it was never uploaded against
    clearSpriteSession();
    const other = cutoutVariant('standing', 'neutral', 'ctowel_o_t_b');
    const got = await resolveSprite(row.identity, 'cutout', other, { styleToken: '' });
    return got.source === 'override' || 'the wildcard did not answer for a different outfit: ' + got.source;
  })()`));

await check('...and an EXACT scope stays exactly where it was put',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const variant = spriteReadySetFor(row.who)[0];
    await saveSpriteUpload(gs, row.identity, variant,
      { image: blob(30), master: blob(31), w: 512, h: 768, bbox: null, bottomFrac: null },
      { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
    clearSpriteSession();
    const other = cutoutVariant('standing', 'neutral', 'ctowel_o_t_b');
    const got = await resolveSprite(row.identity, 'cutout', other, { styleToken: '' });
    return got.source !== 'override' || 'an exact upload leaked to another outfit';
  })()`));

await check('D6 — the record keeps the master BESIDE the working image, and they are not the same object',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const res = await saveSpriteUpload(gs, row.identity, spriteReadySetFor(row.who)[0],
      { image: blob(30), master: blob(31), w: 512, h: 768, bbox: { minX: 1, minY: 2, maxX: 3, maxY: 4, width: 3, height: 3 }, bottomFrac: 0.07 },
      { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
    const rec = await getSpriteRecord(res.record.slot);
    if (!rec.master) return 'no master was stored — recrop and reset would be one-way doors';
    if (rec.master.size === rec.image.size) return 'the master looks like the processed image';
    if (!rec.bbox || rec.bottomFrac == null) return 'the measurements were not stored: the layout has nothing to place it by';
    return true;
  })()`));

console.log('\n5b. Deriving alpha from a flat background — the upload path');
// cleanCutout REFINES an alpha channel; it cannot create one. An uploaded
// JPEG or flattened PNG is opaque everywhere, so without this the whole frame
// reads as subject — measured live before it existed: a full-frame bbox and a
// floor anchor of 0. The two tolerances are the measured ones from
// dev/design/sprite-studio/refs/out/REPORT.md.

api(`
  // A figure on white carrying BOTH traps at once: a WHITE GARMENT (which a
  // global threshold would punch a hole through) and an ENCLOSED background
  // region walled in by the subject (which a border flood cannot reach).
  function uploadFixture(W, H) {
    const data = new Uint8ClampedArray(W * H * 4);
    const put = (x, y, r, g, b) => { const i = (y * W + x) * 4; data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 255, 255, 255);   // backdrop
    const rect = (x0,y0,x1,y1,r,g,b) => { for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) put(x,y,r,g,b); };
    rect(20, 10, 80, 60, 200, 106, 74);        // head
    rect(10, 60, 90, 140, 58, 90, 138);        // jacket
    rect(38, 66, 62, 132, 244, 244, 242);      // WHITE shirt (min d = 11)
    rect(14, 140, 40, 230, 42, 58, 90);        // left leg
    rect(60, 140, 86, 230, 42, 58, 90);        // right leg
    rect(10, 230, 90, 236, 42, 58, 90);        // a bar across the feet, so the
                                               // gap between the legs is fully
                                               // ENCLOSED by the subject
    return data;
  }
  var UW = 100, UH = 250;
`);

await check('an opaque upload is recognised as needing a matte, and a real cutout is not',
  api(`(() => {
    const opaque = uploadFixture(UW, UH);
    if (spriteImageIsOpaque(opaque) !== true) return 'a flattened upload was not recognised as opaque';
    // a genuine cutout: mostly transparent
    const cut = new Uint8ClampedArray(UW * UH * 4);
    for (let i = 0; i < UW * UH; i++) cut[i * 4 + 3] = (i % 5 === 0) ? 255 : 0;
    return spriteImageIsOpaque(cut) === false || 'a transparent cutout was mistaken for a flat upload';
  })()`));

await check('the WHITE GARMENT survives — a global threshold would punch a hole through it',
  api(`(() => {
    const d = uploadFixture(UW, UH);
    spriteMatteFromBackground(d, UW, UH);
    const a = (x, y) => d[((y * UW) + x) * 4 + 3];
    if (a(50, 100) !== 255) return 'the white shirt was erased (alpha ' + a(50, 100) + ')';
    if (a(50, 30) !== 255) return 'the head was erased';
    return true;
  })()`));

await check('the ENCLOSED background IS erased — a border flood alone can never reach it',
  api(`(() => {
    const d = uploadFixture(UW, UH);
    const stats = spriteMatteFromBackground(d, UW, UH);
    const a = (x, y) => d[((y * UW) + x) * 4 + 3];
    if (a(50, 190) !== 0) return 'the walled-in gap between the legs survived (alpha ' + a(50, 190) + ')';
    if (stats.enclosed <= 0) return 'the tight pass cleared nothing, so the loose flood must have reached it — the fixture is not testing what it claims';
    if (a(2, 2) !== 0) return 'the outer backdrop survived';
    return true;
  })()`));

await check('the two tolerances are genuinely different jobs — one value cannot do both',
  api(`(() => {
    // At the LOOSE tolerance applied globally, the white shirt dies.
    const d = uploadFixture(UW, UH);
    spriteMatteFromBackground(d, UW, UH, { enclosedTolerance: 30 });
    const shirt = d[((100 * UW) + 50) * 4 + 3];
    if (shirt !== 0) return 'the fixture does not demonstrate the trap: a 30-tolerance global pass left the shirt at ' + shirt;
    // At the TIGHT tolerance applied to the flood, the backdrop survives its
    // own antialiasing — which is why the flood needs the loose one.
    return true;
  })()`));

await check('a matte that erases essentially everything is refused rather than stored as an invisible sprite',
  api(`(() => {
    // An all-white image: there is no subject.
    const d = new Uint8ClampedArray(UW * UH * 4).fill(255);
    const stats = spriteMatteFromBackground(d, UW, UH);
    return stats.keptFrac < 0.005 || 'an all-background image kept ' + stats.keptFrac;
  })()`));

console.log('\n6. D21 — this app writes pixels, never people');

await check('every studio verb leaves the NPC record untouched',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const before = JSON.stringify(gs.npcs.res1);
    root.generateImage = async () => ({});

    await doSpriteRegenerate(gs, row.identity, spriteReadySetFor(row.who)[0]);
    await doSpriteAvatarLink(gs, row.identity, {});
    await saveSpriteUpload(gs, row.identity, spriteReadySetFor(row.who)[0],
      { image: blob(12), master: blob(12), w: 1, h: 1, bbox: null, bottomFrac: null },
      { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
    await doSpriteRevert(gs, spriteSlotId(row.identity, 'cutout', spriteReadySetFor(row.who)[0]));

    const after = JSON.stringify(gs.npcs.res1);
    if (before !== after) return 'the NPC record changed:\\n  ' + before + '\\n  ' + after;
    const player = JSON.stringify(gs.player);
    await doSpriteAvatarLink(gs, avatarIdentityFor(gs.player, true), {});
    return player === JSON.stringify(gs.player) || 'the player record changed';
  })()`));

await check("the studio's state carries navigation only — no pixels, no character data",
  api(`(async () => {
    const gs = await freshStudio();
    const st = spriteStudioState(gs);
    const keys = Object.keys(st).sort();
    const allowed = ['editing', 'filter', 'mode', 'notice', 'outfit', 'viewingId', 'viewingIdentity'];
    if (JSON.stringify(keys) !== JSON.stringify(allowed)) return 'unexpected state keys: ' + JSON.stringify(keys);
    return true;
  })()`));

console.log('\n7. Revert');

await check('revert deletes the OVERRIDE and the next resolve falls through to generated art',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const variant = spriteReadySetFor(row.who)[0];
    const slot = spriteSlotId(row.identity, 'cutout', variant);
    const parts = variant.split('_');
    await setCachedImage(cutoutKey(row.identity, parts[0], parts[1], parts.slice(2).join('_'), ''), blob(500));
    await putSpriteRecord({ slot, origin: 'edited', mode: 'pinned', image: blob(64), master: blob(64) });
    if ((await resolveSprite(row.identity, 'cutout', variant, { styleToken: '' })).source !== 'override') return 'setup: the override is not winning';
    await doSpriteRevert(gs, slot);
    const after = await resolveSprite(row.identity, 'cutout', variant, { styleToken: '' });
    if (after.source !== 'cache') return 'after revert the sprite resolved as ' + after.source;
    return spriteIndexEntry(slot) === null || 'the index still lists the reverted slot';
  })()`));

await check('reverting UPLOADED or PAINTED art is flagged as losing work; generated art is not',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const v = spriteReadySetFor(row.who)[0];
    const mk = async (origin) => {
      const slot = spriteSlotId(row.identity, 'cutout', v);
      await putSpriteRecord({ slot, origin, mode: 'pinned', image: blob(8), master: blob(8) });
      return spriteRevertLosesWork(slot);
    };
    if (await mk('uploaded') !== true) return 'an upload was not flagged';
    if (await mk('edited') !== true) return 'a painted edit was not flagged';
    if (await mk('regenerated') !== false) return 'regenerated art was flagged, which would nag on every revert';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
