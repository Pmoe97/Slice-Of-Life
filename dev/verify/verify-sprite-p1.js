// Avatars & Sprite Studio, Phase 1 — the override store and the resolver.
// (src/ref/wip/avatars-and-sprite-studio-plan.md)
//
// Everything in sprites.js is pure logic plus kv, with no DOM touch at load
// OR call time, so unlike most of this project's UI-adjacent work it is
// directly and completely testable here. The assertions aim at five things:
//
//   THE GRAMMAR (D2)   — slot ids round-trip, and the wildcard replaces the
//                        OUTFIT segment only. Pose and expression are
//                        genuinely different pictures; an outfit often is not.
//   THE ORDER (D3)     — exact override > wildcard > cache > generate > none,
//                        proven by seeding every layer and removing them one
//                        at a time rather than by reading the code.
//   THE MEMO           — the reason this file exists at all. renderFloorPlan
//                        runs on every action and loops the whole roster; a
//                        second pass must cost ZERO kv calls. Asserted with a
//                        counting kv, not assumed.
//   THE REFUSAL (D7)   — at the cap the store refuses and NAMES what to
//                        delete. It never evicts. This is the exact inverse
//                        of the LRU's contract and the inversion is the point.
//   DEGRADING (D22)    — a broken override falls THROUGH to generated art and
//                        is never auto-deleted, because a broken record is
//                        still the only evidence the player made something.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sprites.js'] });

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

// A counting in-memory kv. The counter is the whole point of the memo
// section below: "the session map works" is not an opinion about the code,
// it is a number of kv calls that must be zero.
api(`
  var kvCalls = { get: 0, set: 0, update: 0, delete: 0, keys: 0 };
  function resetKvCalls() { kvCalls = { get: 0, set: 0, update: 0, delete: 0, keys: 0 }; }
  function kvCallTotal() { return kvCalls.get + kvCalls.set + kvCalls.update + kvCalls.delete + kvCalls.keys; }
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      const S = () => stores[name] || (stores[name] = {});
      m.get = async (k) => { kvCalls.get++; const v = S()[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { kvCalls.set++; S()[k] = structuredClone(v); };
      m.update = async (k, fn) => { kvCalls.update++; const s = S(); const cur = s[k] === undefined ? undefined : structuredClone(s[k]); const nv = fn(cur); s[k] = structuredClone(nv); return nv; };
      m.keys = async () => { kvCalls.keys++; return Object.keys(S()); };
      m.delete = async (k) => { kvCalls.delete++; delete S()[k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta','player','world','npcs','objects','images','snapshots','saves','saveIndex','menu','sprites']) kv[f] = wrap(f);
    return kv;
  }
  // A stand-in blob: spriteRecordBytes reads .size and nothing else, and
  // createObjectUrl only needs truthiness.
  function blob(size) { return { size: size, __blob: true }; }

  // A fresh everything, so no assertion inherits another's store.
  async function freshStore() {
    root.kv = makeMemKv();
    clearSpriteSession();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS } });
    await loadSpriteIndex(true);
  }

  function cutRecord(slot, size, extra) {
    return Object.assign({ slot: slot, origin: 'edited', mode: 'pinned', image: blob(size || 1000), master: blob(size || 1000) }, extra || {});
  }

  var IDENT = 'n42';
  var VAR = cutoutVariant('standing', 'neutral', 'cdressed_ojacket_ttee_bjeans');
  var WILD = wildcardVariantOf(VAR);
`);

console.log('\n1. Slot-id grammar (D2)');

await check('an NPC cutout slot round-trips',
  api(`(() => {
    const s = spriteSlotId('n42', 'cutout', 'standing_neutral_cdressed_o_ttee_bjeans');
    const p = parseSpriteSlotId(s);
    return (p && p.identity === 'n42' && p.kind === 'cutout' && p.variant === 'standing_neutral_cdressed_o_ttee_bjeans') || JSON.stringify(p);
  })()`));

await check('a PLAYER identity round-trips — the portrait-seed token, not an npc id (D2)',
  api(`(() => {
    const ident = cutoutIdentityToken({ portrait: { seed: 99 } }, true);
    const p = parseSpriteSlotId(spriteSlotId(ident, 'cutout', 'standing_neutral_c_o_t_b'));
    return (p && p.identity === ident && p.identity === 'p99') || JSON.stringify(p);
  })()`));

await check('an avatar slot round-trips',
  api(`(() => { const p = parseSpriteSlotId(spriteSlotId('n42', 'avatar', SPRITE_AVATAR_VARIANT)); return (p && p.kind === 'avatar' && p.variant === 'default') || JSON.stringify(p); })()`));

await check('a wildcard slot round-trips',
  api(`(() => { const p = parseSpriteSlotId(spriteSlotId('n42', 'cutout', WILD)); return (p && p.variant === 'standing_neutral_*') || JSON.stringify(p); })()`));

await check('a malformed slot id parses to null rather than throwing (D22 — a corrupt record degrades)',
  api(`parseSpriteSlotId('n42|cutout') === null
    && parseSpriteSlotId('n42|nonsense|x') === null
    && parseSpriteSlotId('|cutout|x') === null
    && parseSpriteSlotId(null) === null
    && parseSpriteSlotId(42) === null`));

await check('the wildcard replaces the OUTFIT segment and keeps pose + expression',
  api(`wildcardVariantOf('standing_neutral_cdressed_ojacket_ttee_bjeans') === 'standing_neutral_*'
    && wildcardVariantOf('seated_talking_ctowel_o_t_b') === 'seated_talking_*'`));

await check('...so two different POSES never share a wildcard, but two outfits do',
  api(`wildcardVariantOf(cutoutVariant('standing','neutral','cA_o_t_b')) === wildcardVariantOf(cutoutVariant('standing','neutral','cB_o_t_b'))
    && wildcardVariantOf(cutoutVariant('standing','neutral','cA_o_t_b')) !== wildcardVariantOf(cutoutVariant('seated','neutral','cA_o_t_b'))`));

await check('isWildcardVariant recognises its own output',
  api(`isWildcardVariant(wildcardVariantOf(VAR)) === true && isWildcardVariant(VAR) === false`));

console.log('\n2. Version and style tokens are NOT in a slot id (D4, invariant 6)');

await check('a slot id carries no prompt version, no pipeline version and no style token',
  api(`(() => {
    const s = spriteSlotId(IDENT, 'cutout', VAR);
    if (s.includes(IMAGE_PROMPT_VERSION)) return 'slot id carries IMAGE_PROMPT_VERSION';
    if (s.includes(CUTOUT_PIPELINE_VERSION)) return 'slot id carries CUTOUT_PIPELINE_VERSION';
    if (s.includes('st_')) return 'slot id carries a style token';
    // ...while the GENERATED key carries all three, which is the contrast
    // that makes bumping a version safe.
    const k = cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_o_t_b', 'st_noir');
    if (!k.includes(IMAGE_PROMPT_VERSION) || !k.includes(CUTOUT_PIPELINE_VERSION) || !k.endsWith('_st_noir')) return 'the generated key lost a token';
    return true;
  })()`));

await check('one override answers under EVERY style — a style switch cannot orphan authored art (D4)',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR)));
    const a = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    const b = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: 'st_noir' });
    const c = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: 'st_watercolor' });
    if (a.source !== 'override' || b.source !== 'override' || c.source !== 'override') {
      return 'style ' + [a.source, b.source, c.source].join('/') + ' — an override stopped answering';
    }
    return true;
  })()`));

console.log('\n3. The resolution order (D3) — every layer seeded, then removed one at a time');

await check('exact override wins over wildcard, cache and generation',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR), 111));
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', WILD), 222));
    await setCachedImage(cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_ojacket_ttee_bjeans', ''), blob(333));
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.source !== 'override') return 'source was ' + r.source;
    if (r.slot !== spriteSlotId(IDENT, 'cutout', VAR)) return 'resolved the wrong slot: ' + r.slot;
    if (r.record.image.size !== 111) return 'served the wrong pixels';
    return true;
  })()`));

await check('remove the exact override and the WILDCARD answers (D5 — the outfit trap)',
  api(`(async () => {
    await deleteSpriteRecord(spriteSlotId(IDENT, 'cutout', VAR));
    clearSpriteSession();
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.source !== 'override') return 'source was ' + r.source;
    if (r.record.image.size !== 222) return 'served the wrong pixels';
    return true;
  })()`));

await check('remove the wildcard too and the generated CACHE answers',
  api(`(async () => {
    await deleteSpriteRecord(spriteSlotId(IDENT, 'cutout', WILD));
    clearSpriteSession();
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.source !== 'cache') return 'source was ' + r.source;
    if (r.key !== cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_ojacket_ttee_bjeans', '')) return 'wrong cache key: ' + r.key;
    return true;
  })()`));

await check('empty the cache and a RENDER path stops — it never spends quota (the hard gate under D14)',
  api(`(async () => {
    await freshStore();
    let gen = 0;
    root.generateImage = async () => { gen++; return {}; };
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.url !== null || r.source !== 'none') return 'a render-path resolve produced ' + r.source;
    if (gen !== 0) return 'a render-path resolve spent ' + gen + ' generation(s)';
    return true;
  })()`));

await check('...and only an explicit generate:true with a subject reaches the generator',
  api(`(async () => {
    await freshStore();
    let gen = 0;
    root.generateImage = async () => { gen++; return {}; };
    await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '', generate: true });
    if (gen !== 0) return 'generated with no subject passed';
    await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '', generate: true, who: { bible: { genSeed: 42 } } });
    if (gen !== 1) return 'expected exactly one generation, saw ' + gen;
    return true;
  })()`));

await check('a wildcard passed as a LIVE variant resolves to nothing — it is a storage address, never a request',
  api(`(async () => {
    await freshStore();
    let gen = 0;
    root.generateImage = async () => { gen++; return {}; };
    const r = await resolveSprite(IDENT, 'cutout', WILD, { styleToken: '', generate: true, who: { bible: { genSeed: 42 } } });
    if (gen !== 0) return 'tried to generate "the sprite for every outfit"';
    return r.url === null || 'a wildcard produced a url';
  })()`));

console.log('\n4. The session map — Evidence 3, asserted as a number');

await check('a second resolve of the same request costs ZERO kv calls',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR)));
    await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });   // warm
    resetKvCalls();
    await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (kvCallTotal() !== 0) return 'second resolve cost ' + JSON.stringify(kvCalls);
    return true;
  })()`));

await check('a whole roster re-resolved costs ZERO kv calls — the floor-plan redraw case',
  api(`(async () => {
    await freshStore();
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const id = 'n' + i;
      ids.push(id);
      await setCachedImage(cutoutKey(id, 'standing', 'neutral', 'c_o_t_b', ''), blob(500));
    }
    const v = cutoutVariant('standing', 'neutral', 'c_o_t_b');
    for (const id of ids) await resolveSprite(id, 'cutout', v, { styleToken: '' });  // first paint
    resetKvCalls();
    for (let pass = 0; pass < 5; pass++) {
      for (const id of ids) await resolveSprite(id, 'cutout', v, { styleToken: '' });
    }
    if (kvCallTotal() !== 0) return '5 redraws x 20 characters cost ' + JSON.stringify(kvCalls);
    return true;
  })()`));

await check('a roster with NO ART AT ALL also costs zero on redraw — the steady state, measured live at 18 reads/render before this',
  api(`(async () => {
    await freshStore();
    const ids = [];
    for (let i = 0; i < 18; i++) ids.push('n' + i);
    const v = cutoutVariant('standing', 'neutral', 'c_o_t_b');
    for (const id of ids) await resolveSprite(id, 'cutout', v, { styleToken: '' });  // first paint, all misses
    resetKvCalls();
    for (let p = 0; p < 3; p++) for (const id of ids) await resolveSprite(id, 'cutout', v, { styleToken: '' });
    if (kvCallTotal() !== 0) return '3 redraws x 18 art-less characters cost ' + JSON.stringify(kvCalls);
    return true;
  })()`));

await check('...but a remembered miss never outlives the art that answers it',
  api(`(async () => {
    await freshStore();
    const v = cutoutVariant('standing', 'neutral', 'c_o_t_b');
    const miss = await resolveSprite('nX', 'cutout', v, { styleToken: '' });
    if (miss.url !== null) return 'setup: expected a miss';
    // Art arrives the way the studio delivers it.
    await putSpriteRecord(cutRecord(spriteSlotId('nX', 'cutout', v), 900));
    const after = await resolveSprite('nX', 'cutout', v, { styleToken: '' });
    if (after.source !== 'override') return 'a stale miss survived a save: ' + after.source;
    return true;
  })()`));

await check('...and a miss does not block an explicit generate:true',
  api(`(async () => {
    await freshStore();
    let gen = 0;
    root.generateImage = async () => { gen++; return {}; };
    const v = cutoutVariant('standing', 'neutral', 'c_o_t_b');
    await resolveSprite('nY', 'cutout', v, { styleToken: '' });               // remembers the miss
    await resolveSprite('nY', 'cutout', v, { styleToken: '', generate: true, who: { bible: { genSeed: 5 } } });
    if (gen !== 1) return 'the remembered miss swallowed a real generate request';
    return true;
  })()`));

await check('a slot with NO override costs no kv.sprites read at all — the index answers from memory',
  api(`(async () => {
    await freshStore();
    await setCachedImage(cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_ojacket_ttee_bjeans', ''), blob(500));
    clearSpriteSession();
    await loadSpriteIndex(true);
    let spriteReads = 0;
    const realGet = root.kv.sprites.get;
    root.kv.sprites.get = async (k) => { spriteReads++; return realGet(k); };
    await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    root.kv.sprites.get = realGet;
    if (spriteReads !== 0) return 'a no-override resolve read kv.sprites ' + spriteReads + ' time(s)';
    return true;
  })()`));

await check('saving an override invalidates the memo, so the next resolve sees the new pixels',
  api(`(async () => {
    await freshStore();
    await setCachedImage(cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_ojacket_ttee_bjeans', ''), blob(500));
    const before = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (before.source !== 'cache') return 'setup: expected cache, got ' + before.source;
    await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR), 777));
    const after = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (after.source !== 'override') return 'a saved override did not take effect: ' + after.source;
    if (after.record.image.size !== 777) return 'stale pixels served after a save';
    return true;
  })()`));

console.log('\n5. The cap refuses; it never evicts (D7)');

await check('at maxSlots a NEW slot is refused, with a reason and a named list of what to delete',
  api(`(async () => {
    await freshStore();
    for (let i = 0; i < SPRITE_STORE.maxSlots; i++) {
      const r = await putSpriteRecord(cutRecord(spriteSlotId('n' + i, 'cutout', VAR), 100));
      if (!r.ok) return 'setup failed at slot ' + i + ': ' + r.message;
    }
    const res = await putSpriteRecord(cutRecord(spriteSlotId('nOverflow', 'cutout', VAR), 100));
    if (res.ok) return 'the cap did not refuse';
    if (res.reason !== 'slots') return 'wrong reason: ' + res.reason;
    if (!res.message || !res.message.includes(String(SPRITE_STORE.maxSlots))) return 'the message does not name the cap';
    if (!Array.isArray(res.heaviest) || res.heaviest.length === 0) return 'the refusal named nothing to delete';
    return true;
  })()`));

await check('...and every existing record is untouched by the refusal — nothing was evicted to make room',
  api(`(async () => {
    const usage = spriteStoreUsage();
    if (usage.slots !== SPRITE_STORE.maxSlots) return 'slot count moved to ' + usage.slots;
    const keys = await root.kv.sprites.keys();
    if (keys.length !== SPRITE_STORE.maxSlots) return 'the store holds ' + keys.length + ' records';
    const survivor = await getSpriteRecord(spriteSlotId('n0', 'cutout', VAR));
    return (survivor && survivor.image.size === 100) || 'the oldest record was evicted';
  })()`));

await check('UPDATING an existing slot still works at the cap — a refusal must not lock the player out of their own art',
  api(`(async () => {
    const res = await putSpriteRecord(cutRecord(spriteSlotId('n0', 'cutout', VAR), 150));
    if (!res.ok) return 'an in-place update was refused: ' + res.message;
    if (res.record.revision !== 2) return 'revision did not increment: ' + res.record.revision;
    return true;
  })()`));

await check('the byte budget refuses too, and names the budget',
  api(`(async () => {
    await freshStore();
    const res = await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR), SPRITE_STORE.softByteBudget + 1));
    if (res.ok) return 'an over-budget write was accepted';
    if (res.reason !== 'bytes') return 'wrong reason: ' + res.reason;
    return true;
  })()`));

await check('byte accounting matches the sum of the blobs actually stored (master included, per D6)',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId('n1', 'cutout', VAR), 1000));
    await putSpriteRecord(cutRecord(spriteSlotId('n2', 'cutout', VAR), 2500));
    const usage = spriteStoreUsage();
    // each record = image + master + the ~200b field overhead
    const expected = (1000 * 2 + 200) + (2500 * 2 + 200);
    if (usage.bytes !== expected) return 'usage says ' + usage.bytes + ', blobs sum to ' + expected;
    if (usage.slots !== 2) return 'slot count is ' + usage.slots;
    return true;
  })()`));

console.log('\n6. A broken override degrades to generated, and is never auto-deleted (D22)');

await check('an index entry whose record has vanished falls THROUGH to the cache',
  api(`(async () => {
    await freshStore();
    const slot = spriteSlotId(IDENT, 'cutout', VAR);
    await putSpriteRecord(cutRecord(slot));
    await setCachedImage(cutoutKey(IDENT, 'standing', 'neutral', 'cdressed_ojacket_ttee_bjeans', ''), blob(500));
    // The record disappears behind the index's back — a corrupt store, a
    // half-finished write, a host that dropped a key.
    await root.kv.sprites.delete(slot);
    clearSpriteSession();
    await loadSpriteIndex(true);
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.source !== 'cache') return 'a broken override resolved to ' + r.source + ' instead of falling through';
    return true;
  })()`));

await check('...the slot is MARKED broken rather than deleted — the record is the only evidence they made something',
  api(`(async () => {
    const slot = spriteSlotId(IDENT, 'cutout', VAR);
    const entry = spriteIndexEntry(slot);
    if (!entry) return 'the index entry was deleted, so the studio can never offer Re-upload';
    if (entry.broken !== true) return 'the entry was not marked broken';
    const slots = await listSpriteSlots(IDENT);
    return slots.includes(slot) || 'the broken slot vanished from the roster listing';
  })()`));

await check('a record present but carrying no pixels is broken too',
  api(`(async () => {
    await freshStore();
    const slot = spriteSlotId(IDENT, 'cutout', VAR);
    await putSpriteRecord({ slot: slot, origin: 'edited', mode: 'pinned', image: null, master: null });
    clearSpriteSession();
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.source === 'override') return 'an override with no image was served';
    return (spriteIndexEntry(slot) || {}).broken === true || 'it was not marked broken';
  })()`));

console.log('\n7. The store survives a reload with its index intact');

await check('a fresh session rebuilds the index from kv.meta and still finds every override',
  api(`(async () => {
    await freshStore();
    await putSpriteRecord(cutRecord(spriteSlotId('n1', 'cutout', VAR), 400));
    await putSpriteRecord(cutRecord(spriteSlotId('n2', 'avatar', SPRITE_AVATAR_VARIANT), 600));
    const beforeUsage = spriteStoreUsage();

    // Simulate a page reload: the in-memory index and memo are gone, kv is not.
    clearSpriteSession();
    if (spriteIndexEntry(spriteSlotId('n1', 'cutout', VAR)) !== null) return 'clearSpriteSession left the index behind';
    await loadSpriteIndex();

    const afterUsage = spriteStoreUsage();
    if (afterUsage.slots !== beforeUsage.slots || afterUsage.bytes !== beforeUsage.bytes) {
      return 'usage changed across the reload: ' + JSON.stringify(beforeUsage) + ' -> ' + JSON.stringify(afterUsage);
    }
    const r = await resolveSprite('n1', 'cutout', VAR, { styleToken: '' });
    if (r.source !== 'override') return 'an override did not survive the reload: ' + r.source;
    const a = await resolveSprite('n2', 'avatar', SPRITE_AVATAR_VARIANT, { styleToken: '' });
    if (a.source !== 'override') return 'an avatar override did not survive the reload: ' + a.source;
    return true;
  })()`));

await check('deleting an override removes it from both the store and the index',
  api(`(async () => {
    const slot = spriteSlotId('n1', 'cutout', VAR);
    await deleteSpriteRecord(slot);
    if (spriteIndexEntry(slot) !== null) return 'the index still lists it';
    if (await getSpriteRecord(slot) !== null) return 'the record is still in the store';
    const keys = await root.kv.sprites.keys();
    return !keys.includes(slot) || 'kv.sprites still holds the key';
  })()`));

await check('the store degrades to a no-op when the host has no sprites folder at all',
  api(`(async () => {
    await freshStore();
    const real = root.kv.sprites;
    delete root.kv.sprites;
    clearSpriteSession();
    const res = await putSpriteRecord(cutRecord(spriteSlotId(IDENT, 'cutout', VAR)));
    if (res.ok) return 'a write succeeded with no store';
    if (res.reason !== 'unavailable') return 'wrong reason: ' + res.reason;
    const r = await resolveSprite(IDENT, 'cutout', VAR, { styleToken: '' });
    if (r.url !== null) return 'resolve produced a url with no store';
    root.kv.sprites = real;
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
