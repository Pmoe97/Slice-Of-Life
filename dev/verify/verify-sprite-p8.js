// Avatars & Sprite Studio, Phase 8 — the integration sweep.
// (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// This harness asserts the plan's BOUNDARIES rather than any one phase's
// features, the way verify-cutout-p6.js does for its own plan:
//
//   D1/D7   kv.sprites holds ONLY human-authored art. Every record the real
//           studio verbs actually produce (not a hand-built fixture) is
//           checked against the allowed origin set; nothing with
//           origin:'generated' may carry pixels — only a blob-less LINKED
//           avatar record is the exception D1's wording carves out.
//   D4/D5   a slot id never folds IMAGE_PROMPT_VERSION, CUTOUT_PIPELINE_VERSION
//           or a style token — grep-level, so copying cutoutKey's pattern
//           into a slot id can never sneak back in unnoticed.
//   D21     the studio writes pixels, never people — spied over the REAL npc
//           and player records across every write-capable verb this plan
//           added through Phase 7 (link/unlink, promote/demote, revert,
//           upload, regenerate), not just Phase 4's original four.
//   —       peek/dream panels/the outcome window/photos/the menu gallery keep
//           their own key namespaces and never call resolveSprite or
//           resolveAvatar — checked against the actual file text.
//   —       kv.sprites is save-independent (the Phase 1 flagged deviation,
//           `KVFolders`'s comment in state.js) and a fresh game never clears
//           it; the export/import plumbing exists to move it on purpose.
//   D10     every avatar surface is CORRECT with the store and the LRU both
//           empty — initials, synchronously, never a blank circle.
//
// What this file deliberately does NOT test: any one phase's own feature
// behaviour (that's P1-P7's job) or the export/import round trip's actual
// bytes — CompressionStream/btoa/TextEncoder are browser APIs this bare vm
// does not expose (see verify-debuglog.js's identical exportSaveRecord
// precedent). Checked here at the source/shape level; the real round trip is
// a live dev-harness.html check.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js', 'spritestudio.js', 'avatar.js', 'state.js'] });

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

const srcCache = {};
function srcText(file) {
  if (!srcCache[file]) srcCache[file] = fs.readFileSync(path.join(SRC, file), 'utf8');
  return srcCache[file];
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
        res1: {
          bible: { name: 'Marisol Vance', genSeed: 201 },
          physical: { hair: { color: 'black' }, eyes: {}, skin: {}, face: {}, body: {} },
          residency: { status: 'resident' }, location: 'living_room',
          clothing: 'dressed', outfit: { top: 'tee', bottom: 'jeans' },
        },
      },
      objects: {},
      world: { computer: { apps: {} } },
    };
  }

  async function freshStudio() {
    root.kv = makeMemKv();
    root.generateImage = async () => ({});
    clearSpriteSession();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS } });
    await loadSpriteIndex(true);
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    spriteQueue.pending = []; spriteQueue.running = false;
    spriteQueue.spentSession = 0; spriteQueue.spentDay = 0; spriteQueue.day = null;
    return studioState();
  }
`);

console.log('\nD1/D7 — kv.sprites holds only human-authored art, checked against real writes');

await check('an upload writes an allowed origin (uploaded)', api(`(async () => {
  const gs = await freshStudio();
  const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
  const variant = spriteReadySetFor(row.who)[0];
  const res = await saveSpriteUpload(gs, row.identity, variant,
    { image: blob(10), master: blob(10), w: 10, h: 10, bbox: null, bottomFrac: null },
    { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
  return res.ok || res.message;
})()`));

await check('linking an avatar tags origin generated but carries NO pixels — the one exception D1\'s wording allows',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const res = await doSpriteAvatarLink(gs, row.identity, { crop: { x: 0, y: 0, w: 10, h: 10 } });
    if (!res.ok) return res.message;
    const rec = await getSpriteRecord(spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT));
    if (rec.origin !== 'generated') return 'origin is ' + rec.origin;
    return (rec.image == null && rec.master == null) || 'a linked record carries pixels';
  })()`));

await check('unlinking (pinning what is showing) tags the PIXEL-BEARING record regenerated, never generated',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    // Seed an existing PINNED avatar so resolveAvatar's step 1 answers
    // directly from the override — deriving fresh pixels from a cutout needs
    // createImageBitmap, which this bare vm does not have (the same boundary
    // every other sprite-studio harness respects: see Phase 7's own note).
    // doSpriteAvatarUnlink writes its origin tag unconditionally, so seeding
    // the avatar this way still exercises the real line being tested.
    const slot = spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT);
    await putSpriteRecord({ slot, origin: 'uploaded', mode: 'pinned', image: blob(5), master: blob(5) });
    const res = await doSpriteAvatarUnlink(gs, row.identity);
    if (!res.ok) return res.message;
    const rec = await getSpriteRecord(slot);
    if (rec.origin !== 'regenerated') return 'origin is ' + rec.origin + ' (this is the bug D1 forbids: pinned pixels tagged as raw machine output)';
    return !!rec.image || 'a pinned record was written with no pixels';
  })()`));

await check('regenerating a cutout writes NOTHING to kv.sprites — it only ever touches the generated cache',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const before = await listSpriteSlots();
    await doSpriteRegenerate(gs, row.identity, spriteReadySetFor(row.who)[0]);
    const after = await listSpriteSlots();
    return after.length === before.length || ('slot count changed: ' + before.length + ' -> ' + after.length);
  })()`));

await check('after a full pass of upload/regenerate/promote/demote/link/unlink, EVERY record in the store satisfies the boundary',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const v = spriteReadySetFor(row.who)[0];
    await saveSpriteUpload(gs, row.identity, v,
      { image: blob(9), master: blob(9), w: 1, h: 1, bbox: null, bottomFrac: null },
      { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
    await doSpriteRegenerate(gs, row.identity, v);
    await doSpriteAvatarLink(gs, row.identity, {});
    await doSpriteAvatarUnlink(gs, row.identity);
    const promoted = await promoteSpriteOverride(spriteSlotId(row.identity, 'cutout', v));
    if (promoted.ok) await demoteSpriteOverride(promoted.slot, cutoutOutfitToken(row.who));

    const slots = await listSpriteSlots();
    if (slots.length === 0) return 'setup produced no records to check';
    const bad = [];
    for (const slot of slots) {
      const rec = await getSpriteRecord(slot);
      const allowedOrigin = ['uploaded', 'edited', 'regenerated'].includes(rec.origin);
      const linkedNoPixels = rec.mode === 'linked' && !rec.image && !rec.master;
      if (!allowedOrigin && !linkedNoPixels) bad.push(slot + ' origin=' + rec.origin + ' mode=' + rec.mode);
    }
    return bad.length === 0 || bad.join('; ');
  })()`));

console.log('\nD4/D5 — a slot id never folds a version token or a style token (design invariant 6)');

await check('spriteSlotId\'s own source never references the version constants or the style-token function',
  api(`!/IMAGE_PROMPT_VERSION|CUTOUT_PIPELINE_VERSION|imageStyleToken/.test(spriteSlotId.toString())`));

await check('a real slot id, built with a non-default style active, carries neither the pipeline version nor the active style token',
  api(`(() => {
    settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
    settingsCache.imageStyle = 'noir';
    const style = imageStyleToken();
    if (!style) return 'test setup produced no style token to check against';
    const slot = spriteSlotId('n1', 'cutout', cutoutVariant('standing', 'neutral', 'c_o_t_b'));
    if (slot.includes(style)) return 'slot id carries the style token: ' + slot;
    if (slot.includes(IMAGE_PROMPT_VERSION)) return 'slot id carries the prompt version: ' + slot;
    if (slot.includes(CUTOUT_PIPELINE_VERSION)) return 'slot id carries the pipeline version: ' + slot;
    return true;
  })()`));

console.log('\nD21 — the studio writes pixels, never people (extended past Phase 4\'s original four verbs)');

await check('every write-capable verb this plan added, run in sequence against real npc AND player records, leaves both byte-identical',
  api(`(async () => {
    const gs = await freshStudio();
    const row = spriteStudioRoster(gs).find((r) => r.id === 'res1');
    const playerIdentity = avatarIdentityFor(gs.player, true);
    const beforeNpc = JSON.stringify(gs.npcs.res1);
    const beforePlayer = JSON.stringify(gs.player);

    const v = spriteReadySetFor(row.who)[0];
    await doSpriteRegenerate(gs, row.identity, v);
    await saveSpriteUpload(gs, row.identity, v,
      { image: blob(9), master: blob(9), w: 1, h: 1, bbox: null, bottomFrac: null },
      { kind: 'cutout', scope: 'exact', origin: 'uploaded' });
    const promoted = await promoteSpriteOverride(spriteSlotId(row.identity, 'cutout', v));
    if (promoted.ok) await demoteSpriteOverride(promoted.slot, cutoutOutfitToken(row.who));
    await doSpriteAvatarLink(gs, row.identity, {});
    await doSpriteAvatarUnlink(gs, row.identity);
    await doSpriteRevert(gs, spriteSlotId(row.identity, 'cutout', v));
    await doSpriteAvatarLink(gs, playerIdentity, {});
    await doSpriteAvatarUnlink(gs, playerIdentity);

    const afterNpc = JSON.stringify(gs.npcs.res1);
    const afterPlayer = JSON.stringify(gs.player);
    if (beforeNpc !== afterNpc) return 'the NPC record changed:\\n  ' + beforeNpc + '\\n  ' + afterNpc;
    if (beforePlayer !== afterPlayer) return 'the player record changed:\\n  ' + beforePlayer + '\\n  ' + afterPlayer;
    return true;
  })()`));

console.log('\nPeek, dream panels, the outcome window, photos and the menu gallery are untouched');

for (const f of ['peek.js', 'dreams.js', 'actionwindow.js', 'image.js', 'menu.js']) {
  await check(`${f} never calls resolveSprite or resolveAvatar`,
    !/resolveSprite|resolveAvatar/.test(srcText(f)));
}

console.log('\nEvery generated-art surface keeps its own key namespace — a collision would let one evict or serve another\'s pixels');

await check('all ten image-cache namespaces (six from the cutout plan, plus dream/outcome-archetype/outcome-instance/derived-avatar) stay mutually distinct by prefix',
  api(`(() => {
    const cutout = cutoutKey('n1', 'standing', 'neutral', 'c_o_t_b', '');
    const keys = [
      plateKey('kitchen', 'morning', '', ''),
      cutout,
      composeCharKey({ bible: { genSeed: 1 } }, 'neutral', 'standing'),
      composePeekKey({ meta: { clock: { phase: 'day' } } }, 'bathroom_a', { bible: { genSeed: 1 } }, 'x'),
      menuGalleryKeyPrefix('sfw'),
      'photo_abc',
      composeDreamPanelKey({ id: 'd1' }, 0),
      composeActionArchetypeKey({}, { verbId: 'shower', roomId: 'bathroom_a' }),
      composeActionInstanceKey({}, { verbId: 'shower', roomId: 'bathroom_a' }),
      derivedAvatarKey(cutout, null),
    ];
    const prefixes = keys.map((k) => k.split('_')[0]);
    return new Set(prefixes).size === prefixes.length || ('duplicate prefixes among: ' + prefixes.join(', '));
  })()`));

await check('the derived-avatar key lives in the kv.images LRU namespace (av_), never in kv.sprites — it is reproducible from the cutout, so D7\'s cap must never apply to it',
  api(`derivedAvatarKey('cut_x', null).startsWith('av_')`));

console.log('\nkv.sprites is save-independent (Phase 1\'s flagged deviation), and the export/import plumbing exists to move it deliberately');

await check('sprites joins KVFolders and FOLDER_VERSIONS for migration, but is absent from every SAVE_KEYS folder',
  api(`(() => {
    if (!KVFolders.includes('sprites')) return 'sprites is not in KVFolders';
    if (typeof FOLDER_VERSIONS.sprites !== 'number') return 'sprites has no FOLDER_VERSIONS entry';
    const inSaveKeys = SAVE_KEYS.some((e) => e.folder === 'sprites');
    return !inSaveKeys || 'sprites appears in SAVE_KEYS — overrides would ride inside saves after all, which is exactly the failure design invariant 2 exists to prevent';
  })()`));

await check('state.js never touches root.kv.sprites directly — every read/write routes through sprites.js\'s own functions, so no save/load/New-Game code path can accidentally clear or corrupt it',
  !/root\.kv\.sprites/.test(srcText('state.js')));

await check('exportSpriteOverrides/importSpriteOverrides exist and reuse the save system\'s own gzip/base64 envelope rather than inventing a second one',
  api(`(() => {
    if (typeof exportSpriteOverrides !== 'function') return 'exportSpriteOverrides is missing';
    if (typeof importSpriteOverrides !== 'function') return 'importSpriteOverrides is missing';
    const exp = exportSpriteOverrides.toString();
    const imp = importSpriteOverrides.toString();
    if (!/gzipBytes/.test(exp)) return 'export does not reuse gzipBytes';
    if (!/gunzipBytes/.test(imp)) return 'import does not reuse gunzipBytes';
    if (!/listSpriteSlots/.test(exp) || !/getSpriteRecord/.test(exp)) return 'export does not read the real store through its own functions';
    if (!/putSpriteRecord/.test(imp)) return 'import does not write through the capped store writer — D7\\'s refuse-at-cap would go unenforced on import';
    return true;
  })()`));

await check('the export envelope carries its own type/version so a foreign or future-format file is refused, never silently misread',
  api(`typeof SPRITE_EXPORT_TYPE === 'string' && SPRITE_EXPORT_TYPE.length > 0 && SPRITE_EXPORT_VERSION === 1`));

console.log('\nD10 — every avatar surface is correct with the store AND the LRU both empty');

await check('avatarChipHtml renders synchronous initials markup — no img tag — for a subject with no anchor at all',
  api(`(() => {
    const html = avatarChipHtml({ bible: { name: 'Nell Ashworth' } }, {});
    return (/avatar-chip-initials/.test(html) && !/<img/.test(html)) || ('missing initials markup or an img leaked in: ' + html);
  })()`));

await check('resolveAvatar against a genuinely empty store and LRU resolves to source:none rather than throwing',
  api(`(async () => {
    const gs = await freshStudio();
    const res = await resolveAvatar('n999999', { generate: false });
    return (res.source === 'none' && res.url === null) || ('got ' + JSON.stringify(res));
  })()`));

await check('resolveSprite against a genuinely empty store and LRU resolves to source:none for a cutout too',
  api(`(async () => {
    const gs = await freshStudio();
    const res = await resolveSprite('n999999', 'cutout', 'standing_neutral_c_o_t_b', { generate: false });
    return (res.source === 'none' && res.url === null) || ('got ' + JSON.stringify(res));
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}

main();
