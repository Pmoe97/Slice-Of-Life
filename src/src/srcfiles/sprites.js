// ===== SECTION: SPRITES =====
// The override store and the one resolver every sprite read goes through.
// avatars-and-sprite-studio-plan.md, Phase 1 (D1-D7, D22).
//
// Two stores, and they hold different KINDS of thing (D1):
//
//   kv.images   the existing 500-entry LRU. Machine output — every entry is
//               reproducible from a seed, so eviction is free and invisible.
//   kv.sprites  NEW, and permanent. Human output — uploaded, painted,
//               recropped, pinned. Reproducible from nothing. One eviction is
//               one destroyed thing a player made, so this store REFUSES a
//               write at its cap rather than evicting to make room (D7).
//
// The single rule that keeps them apart is design invariant 2: a cache holds
// what can be regenerated, a store holds what cannot. The moment a generated
// pixel is written to kv.sprites, D7's cap becomes a lie and the player's own
// work starts competing with machine output for space. verify-sprite-p8.js
// asserts it, because a comment cannot.
//
// Everything below is pure logic plus kv — no DOM at load time — so it loads
// in the bare vm and is directly testable. It sits after image.js in BOTH
// index.html and dev/verify/loadgame.js, because resolveSprite falls through
// to that file's cutoutKey/getCharacterCutout. Registered in both lists in
// the same commit: shipping a file to only one of the two is the rumination.js
// scar, where five harnesses and 175 assertions died silently.

// --- Slot ids (D2) ----------------------------------------------------------
// `<identity>|<kind>|<variant>`
//
//   identity  cutoutIdentityToken(who, isPlayer) — `n<genSeed>` for an NPC,
//             the portrait-seed token for the player. Already the anchor the
//             cutout pipeline uses, so an override survives everything an npc
//             id does not.
//   kind      'cutout' | 'avatar'
//   variant   cutouts: `<pose>_<expression>_<outfit>`, matching cutoutKey's
//             dimensions. avatars: 'default'.
//
// What is deliberately NOT in here (D4, design invariant 6): the prompt
// version, the pipeline version, and the style token. A cutout KEY folds all
// three so a pipeline change repaints every generated sprite — which is right
// for machine output and catastrophic for authored output. Bumping a version
// must be INCAPABLE of orphaning something a player painted.
const SPRITE_KINDS = ['cutout', 'avatar'];
const SPRITE_WILDCARD = '*';
const SPRITE_AVATAR_VARIANT = 'default';

function spriteSlotId(identity, kind, variant) {
  return `${identity}|${kind}|${variant}`;
}

// Tolerant by design: a malformed slot id reaching here means a corrupt
// record, and D22 says a corrupt record degrades rather than throwing.
function parseSpriteSlotId(slot) {
  if (typeof slot !== 'string') return null;
  const parts = slot.split('|');
  if (parts.length !== 3) return null;
  const [identity, kind, variant] = parts;
  if (!identity || !variant || !SPRITE_KINDS.includes(kind)) return null;
  return { identity, kind, variant };
}

function cutoutVariant(pose, expression, outfitToken) {
  return `${pose}_${expression}_${outfitToken}`;
}

// D5 — the exact-match trap, made explicit. A cutout variant carries
// cutoutOutfitToken(who): clothing state plus three garment ids. Paint a
// sprite, have the character change her shirt, and the slot id stops matching
// — the player's work silently vanishes and looks lost. So an override may be
// stored against `<pose>_<expression>_*`, and the resolver checks exact before
// wildcard.
//
// Only the OUTFIT segment wildcards. Pose and expression are genuinely
// different pictures; an outfit often is not.
function wildcardVariantOf(variant) {
  if (typeof variant !== 'string') return null;
  const idx = variant.indexOf('_');
  if (idx < 0) return null;
  const rest = variant.indexOf('_', idx + 1);
  if (rest < 0) return null;
  return `${variant.slice(0, rest)}_${SPRITE_WILDCARD}`;
}

function isWildcardVariant(variant) {
  return typeof variant === 'string' && variant.endsWith(`_${SPRITE_WILDCARD}`);
}

// --- The index --------------------------------------------------------------
// A slot -> {bytes, editedAt, revision, origin, mode, broken} map in kv.meta,
// so the roster's storage meter and the resolver's "is there an override?"
// question never require reading a single blob.
//
// It is loaded ONCE per session into `spriteIndex` and kept in step by every
// write below. That is not an optimisation — it is the whole reason
// Evidence 3's per-render kv storm is structurally impossible: resolveSprite
// can answer "no override" from memory, so a floor plan redraw touches kv
// zero times once the session is warm.
const SPRITE_INDEX_KEY = 'spriteIndex';
let spriteIndex = null;          // slot -> meta, or null until loaded
let spriteIndexLoading = null;   // in-flight load, so concurrent callers share one

async function loadSpriteIndex(force) {
  if (spriteIndex && !force) return spriteIndex;
  if (spriteIndexLoading && !force) return spriteIndexLoading;
  spriteIndexLoading = (async () => {
    let idx = {};
    try {
      const meta = await root.kv.meta.get('meta');
      const stored = meta && meta[SPRITE_INDEX_KEY];
      if (stored && typeof stored === 'object') idx = { ...stored };
    } catch (e) {
      // A missing/unreadable index is the empty index, never an error: the
      // store is additive and the records themselves are the truth.
      console.warn('Sprite index load failed:', e.message);
    }
    spriteIndex = idx;
    spriteIndexLoading = null;
    return spriteIndex;
  })();
  return spriteIndexLoading;
}

// Atomic read-modify-write, the same contract getCachedImage uses on the
// shared meta record — a get-then-set here could silently revert any other
// in-flight meta write (a session-log append, a day-rollover economy field).
async function writeSpriteIndexEntry(slot, entry) {
  await loadSpriteIndex();
  if (entry) spriteIndex[slot] = entry;
  else delete spriteIndex[slot];
  await root.kv.meta.update('meta', (meta) => {
    meta = meta || {};
    const idx = { ...(meta[SPRITE_INDEX_KEY] || {}) };
    if (entry) idx[slot] = entry;
    else delete idx[slot];
    return { ...meta, [SPRITE_INDEX_KEY]: idx };
  });
}

function spriteIndexEntry(slot) {
  return (spriteIndex && spriteIndex[slot]) || null;
}

// D7 — the cap is visible, and nothing is evicted silently. Reported straight
// off the index, so the roster's meter costs no blob reads.
function spriteStoreUsage() {
  const idx = spriteIndex || {};
  const slots = Object.keys(idx);
  let bytes = 0;
  for (const s of slots) bytes += (idx[s] && idx[s].bytes) || 0;
  return {
    slots: slots.length,
    maxSlots: SPRITE_STORE.maxSlots,
    bytes,
    softByteBudget: SPRITE_STORE.softByteBudget,
    slotFrac: SPRITE_STORE.maxSlots ? slots.length / SPRITE_STORE.maxSlots : 0,
    byteFrac: SPRITE_STORE.softByteBudget ? bytes / SPRITE_STORE.softByteBudget : 0,
    overBudget: bytes > SPRITE_STORE.softByteBudget,
  };
}

// The largest overrides, oldest-touched first — what the studio names when it
// refuses a save. "You are full" is useless; "you are full, and these three
// are the biggest" is actionable.
function spriteStoreHeaviest(n) {
  const idx = spriteIndex || {};
  return Object.keys(idx)
    .map((slot) => ({ slot, ...idx[slot] }))
    .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
    .slice(0, n || 5);
}

// --- The store (D1/D6/D7) ---------------------------------------------------

function spriteStoreAvailable() {
  return typeof root !== 'undefined' && root.kv && !!root.kv.sprites;
}

async function getSpriteRecord(slot) {
  if (!spriteStoreAvailable()) return null;
  try {
    const rec = await root.kv.sprites.get(slot);
    return rec || null;
  } catch (e) {
    console.warn('Sprite record read failed:', slot, e.message);
    return null;
  }
}

// A record's own byte weight. Both blobs count (D6 keeps the master beside
// the working image, which genuinely doubles the cost and is worth it), and
// a linked avatar weighs essentially nothing because it stores no pixels.
function spriteRecordBytes(rec) {
  if (!rec) return 0;
  const b = (x) => (x && typeof x.size === 'number' ? x.size : 0);
  return b(rec.image) + b(rec.master) + 200; // 200 ≈ the record's own fields
}

// D7: at the cap this REFUSES and names what to delete. It never evicts —
// that is the exact inverse of the LRU's contract, and the inversion is the
// point. Returns {ok:true, record} or {ok:false, reason, message, heaviest}.
async function putSpriteRecord(record) {
  spriteMissCache.clear();
  if (!spriteStoreAvailable()) {
    return { ok: false, reason: 'unavailable', message: 'Sprite storage is not available in this session.' };
  }
  const parsed = parseSpriteSlotId(record && record.slot);
  if (!parsed) {
    return { ok: false, reason: 'slot', message: `Not a valid sprite slot: ${record && record.slot}` };
  }
  await loadSpriteIndex();

  const existing = spriteIndexEntry(record.slot);
  const bytes = spriteRecordBytes(record);
  const usage = spriteStoreUsage();

  if (!existing && usage.slots >= SPRITE_STORE.maxSlots) {
    return {
      ok: false, reason: 'slots',
      message: `Sprite storage is full (${usage.slots} of ${SPRITE_STORE.maxSlots} slots). Delete some custom art first.`,
      heaviest: spriteStoreHeaviest(5),
    };
  }
  const projected = usage.bytes - ((existing && existing.bytes) || 0) + bytes;
  if (projected > SPRITE_STORE.softByteBudget) {
    return {
      ok: false, reason: 'bytes',
      message: `This would take sprite storage past ${Math.round(SPRITE_STORE.softByteBudget / (1024 * 1024))} MB. Delete some custom art first.`,
      heaviest: spriteStoreHeaviest(5),
    };
  }

  const now = Date.now();
  const toWrite = {
    ...record,
    identity: parsed.identity,
    kind: parsed.kind,
    variant: parsed.variant,
    broken: false,
    revision: ((existing && existing.revision) || 0) + 1,
    editedAt: now,
  };
  try {
    await root.kv.sprites.set(record.slot, toWrite);
  } catch (e) {
    return { ok: false, reason: 'write', message: `Could not save this sprite: ${e.message}` };
  }
  await writeSpriteIndexEntry(record.slot, {
    bytes,
    editedAt: now,
    revision: toWrite.revision,
    origin: toWrite.origin || 'edited',
    mode: toWrite.mode || 'pinned',
    broken: false,
  });
  invalidateSprite(record.slot);
  return { ok: true, record: toWrite };
}

async function deleteSpriteRecord(slot) {
  if (!spriteStoreAvailable()) return false;
  try {
    await root.kv.sprites.delete(slot);
  } catch (e) {
    console.warn('Sprite record delete failed:', slot, e.message);
  }
  await writeSpriteIndexEntry(slot, null);
  invalidateSprite(slot);
  return true;
}

// D22 — a broken override degrades to generated, never to nothing, and is
// never auto-deleted. A broken record is still the only evidence the player
// made something; the studio surfaces it with Delete and Re-upload and lets
// them decide.
async function markSpriteBroken(slot) {
  const entry = spriteIndexEntry(slot);
  if (!entry || entry.broken) return;
  await writeSpriteIndexEntry(slot, { ...entry, broken: true });
}

async function listSpriteSlots(identity) {
  await loadSpriteIndex();
  const all = Object.keys(spriteIndex || {});
  if (!identity) return all;
  return all.filter((s) => {
    const p = parseSpriteSlotId(s);
    return p && p.identity === identity;
  });
}

// --- The wildcard sweep (Phase 7, D5) ---------------------------------------
// "Where does this apply?" is answerable from the slot id alone — no store
// read needed, so the studio can show it beside every cell in the grid.
function spriteOverrideScope(slot) {
  const parsed = parseSpriteSlotId(slot);
  if (!parsed || parsed.kind !== 'cutout') return null;
  const wide = isWildcardVariant(parsed.variant);
  return {
    wide,
    variant: parsed.variant,
    widenVariant: wide ? null : wildcardVariantOf(parsed.variant),
    label: wide ? 'Every outfit of this pose' : 'This outfit only',
  };
}

// Promote / demote MIGRATE the record rather than duplicating it — leaving
// both an exact and a wildcard slot for the same pose+expression would mean
// the exact one silently shadows the wildcard forever (D3's order checks
// exact first), so the widen/narrow control would look like it did nothing.
// Both write the new address before deleting the old one, so a failed write
// never loses the record.
async function promoteSpriteOverride(slot) {
  const parsed = parseSpriteSlotId(slot);
  if (!parsed || parsed.kind !== 'cutout' || isWildcardVariant(parsed.variant)) {
    return { ok: false, message: 'That cannot be widened.' };
  }
  const wildVariant = wildcardVariantOf(parsed.variant);
  if (!wildVariant) return { ok: false, message: 'That cannot be widened.' };
  const wildSlot = spriteSlotId(parsed.identity, 'cutout', wildVariant);
  if (spriteIndexEntry(wildSlot)) {
    return { ok: false, message: 'This character already has art set for every outfit of this pose — delete that first.' };
  }
  const rec = await getSpriteRecord(slot);
  if (!rec) return { ok: false, message: 'That sprite could not be read.' };
  const res = await putSpriteRecord({ ...rec, slot: wildSlot });
  if (!res.ok) return res;
  await deleteSpriteRecord(slot);
  // The wildcard now answers for outfits it never used to — every one of
  // them needs its memoised resolution (hit or remembered miss) dropped.
  invalidateSprite(parsed.identity);
  return { ok: true, slot: wildSlot };
}

async function demoteSpriteOverride(slot, outfitToken) {
  const parsed = parseSpriteSlotId(slot);
  if (!parsed || parsed.kind !== 'cutout' || !isWildcardVariant(parsed.variant)) {
    return { ok: false, message: 'That cannot be narrowed.' };
  }
  if (!outfitToken) return { ok: false, message: 'Could not tell which outfit is current.' };
  const parts = parsed.variant.split('_'); // [pose, expression, '*']
  const exactVariant = cutoutVariant(parts[0], parts[1], outfitToken);
  const exactSlot = spriteSlotId(parsed.identity, 'cutout', exactVariant);
  if (spriteIndexEntry(exactSlot)) {
    return { ok: false, message: 'This outfit already has its own art — delete that first.' };
  }
  const rec = await getSpriteRecord(slot);
  if (!rec) return { ok: false, message: 'That sprite could not be read.' };
  const res = await putSpriteRecord({ ...rec, slot: exactSlot });
  if (!res.ok) return res;
  await deleteSpriteRecord(slot);
  // Every OTHER outfit the wildcard used to answer for now falls through to
  // generated art — those memoised resolutions have to go too.
  invalidateSprite(parsed.identity);
  return { ok: true, slot: exactSlot };
}

// --- The session map --------------------------------------------------------
// resolved request -> { url, source, slot } for the life of the page.
//
// D3 lists the session map third, which is its PRIORITY among sources of
// truth; execution checks it FIRST, because that is the entire point. A
// floor plan redraw runs on every action and loops the whole roster
// (Evidence 3): with the memo in front, the second and every later pass costs
// zero kv reads and zero kv.meta writes. Without it, a 20-person roster costs
// 20 read-modify-write transactions on the shared meta record per click.
// One frozen "there is nothing here" result, so no caller can mutate a
// shared answer and every miss is `===` comparable in a test.
const SPRITE_NONE = Object.freeze({ url: null, source: 'none', slot: null });

const spriteUrlCache = new Map();

// Requests that resolved to NOTHING, remembered separately.
//
// Measured live before this existed: a floor plan redraw cost one
// `kv.images.get` per cast member, on EVERY render, forever — 18 reads per
// click on an 18-person roster, 54 across three renders. Memoising only the
// hits fixed the kv.meta write storm (Evidence 3) and left the read storm
// untouched, because the steady state of this game is a roster that mostly
// has no art yet: every lookup misses, and a miss was never remembered.
//
// A negative is exactly as memoisable as a positive. The only requirement is
// that anything which could turn a miss into a hit clears it — so every write
// path below empties this map wholesale. It is small, clearing it is free,
// and correctness beats granularity: a stale miss means a character silently
// keeps their initials after their art lands, which is precisely the class of
// silent-until-it-matters bug this plan exists to stop repeating.
const spriteMissCache = new Set();

function spriteRequestKey(identity, kind, variant, styleToken) {
  return `${identity}|${kind}|${variant}|${styleToken || ''}`;
}

function invalidateSprite(slotOrIdentity) {
  // Any invalidation could reveal art, so the misses always go.
  spriteMissCache.clear();
  if (!slotOrIdentity) { spriteUrlCache.clear(); return; }
  for (const k of [...spriteUrlCache.keys()]) {
    if (k.startsWith(slotOrIdentity) || spriteUrlCache.get(k).slot === slotOrIdentity) {
      spriteUrlCache.delete(k);
    }
  }
}

function clearSpriteSession() {
  spriteUrlCache.clear();
  spriteMissCache.clear();
  spriteIndex = null;
  spriteIndexLoading = null;
}

// --- resolveSprite (D3) -----------------------------------------------------
// THE ONLY THING IN THE CODEBASE PERMITTED TO READ A SPRITE BLOB.
// (Design invariant 1. The floor-plan hydrate path is the standing proof of
// what a bespoke one-off costs: a cache-only lookup against the wrong key, a
// clip path that does not exist, a player who never appears, and O(roster) kv
// writes per render — four defects in twenty lines, all silent, none findable
// until the day the cache stopped missing.)
//
//   exact override -> wildcard override -> session map -> kv.images -> generate -> null
//
// opts:
//   who         the character record, required only to GENERATE
//   isPlayer    routes to getPlayerCutout instead of getCharacterCutout
//   generate    default FALSE. Render paths must never spend quota; the
//               studio and the queue pass true explicitly.
//   styleToken  defaults to the active style. Folded into the GENERATED key
//               only — an override is style-agnostic and wins over style (D4).
async function resolveSprite(identity, kind, variant, opts = {}) {
  if (!identity || !SPRITE_KINDS.includes(kind) || !variant) return SPRITE_NONE;
  const styleToken = opts.styleToken != null
    ? opts.styleToken
    : (typeof imageStyleToken === 'function' ? imageStyleToken() : '');

  const req = spriteRequestKey(identity, kind, variant, styleToken);
  const memo = spriteUrlCache.get(req);
  if (memo) return memo;
  // A remembered miss only stands for a read-only request. `generate: true`
  // is an explicit instruction to go and make the thing, so it always runs.
  if (!opts.generate && spriteMissCache.has(req)) return SPRITE_NONE;

  await loadSpriteIndex();

  // 1 + 2 — overrides. Answered from the in-memory index, so a slot with no
  // override costs no kv read at all; only a real hit reaches the store.
  const exact = spriteSlotId(identity, kind, variant);
  const wildVariant = kind === 'cutout' ? wildcardVariantOf(variant) : null;
  const wild = wildVariant ? spriteSlotId(identity, kind, wildVariant) : null;

  for (const slot of [exact, wild]) {
    if (!slot) continue;
    const entry = spriteIndexEntry(slot);
    if (!entry || entry.broken) continue;
    const rec = await getSpriteRecord(slot);
    // D22: a record the index promised but the store cannot produce, or one
    // carrying no pixels, is BROKEN — log once, mark it, and carry on down
    // the ladder as though it were absent.
    if (!rec || !rec.image) {
      console.warn('Sprite override is broken, falling through:', slot);
      await markSpriteBroken(slot);
      continue;
    }
    const url = createObjectUrl(slot, rec.image);
    const out = { url, source: 'override', slot, record: rec };
    spriteUrlCache.set(req, out);
    return out;
  }

  // 3 + 4 — the generated cache. Avatars have no generated form of their own
  // yet; Phase 2 fills this in with the cutout-derived crop (D8).
  if (kind === 'avatar') {
    // resolveAvatar owns this kind end to end; reaching here means a caller
    // asked the generic resolver for an avatar, which has no generated form.
    return SPRITE_NONE;
  }

  const parts = variant.split('_');
  const pose = parts[0];
  const expression = parts[1];
  const outfit = parts.slice(2).join('_');
  if (isWildcardVariant(variant)) {
    // A wildcard is a STORAGE address, never a request: nothing can generate
    // "the sprite for every outfit". Reaching here means a caller passed a
    // wildcard as a live variant, which is a bug in that caller.
    return SPRITE_NONE;
  }

  const genKey = cutoutKey(identity, pose, expression, outfit, styleToken);
  const cached = await getCachedImage(genKey);
  if (cached) {
    const out = { url: createObjectUrl(genKey, cached), source: 'cache', slot: null, key: genKey };
    spriteUrlCache.set(req, out);
    return out;
  }

  // 5 — generate. Never from a render path (D14's foreground rule lives in
  // Phase 3's queue; this is the hard gate that makes it possible).
  if (!opts.generate || !opts.who) {
    // Remember the miss. This is the read storm's off switch: without it a
    // cast with no art costs one kv.images.get per member per render.
    spriteMissCache.add(req);
    return { url: null, source: 'none', slot: null, key: genKey };
  }
  const res = opts.isPlayer
    ? await getPlayerCutout(opts.who, pose, expression)
    : await getCharacterCutout(opts.who, pose, expression);
  if (!res || !res.url) {
    // NOT remembered: a generation that failed is a transient, and the next
    // attempt must be allowed to succeed.
    return { url: null, source: 'none', slot: null, key: genKey, error: (res && res.error) || 'generation failed' };
  }
  // Fresh pixels exist now, so every remembered miss is suspect — an avatar
  // that gave up on this identity a moment ago can be derived from it.
  spriteMissCache.clear();
  const out = { url: res.url, source: 'generated', slot: null, key: res.key || genKey };
  spriteUrlCache.set(req, out);
  return out;
}

// ===== AVATARS (Phase 2, D8/D9/D9b) =========================================
// A headshot is a CROP OF THE CUTOUT by default, and its own overridable slot
// regardless. Two states:
//
//   linked   no blob stored. Computed on demand from the current cutout; the
//            record holds only { crop, sourceVariant } and weighs ~200 bytes.
//            Regenerate the sprite and the avatar follows it for free.
//   pinned   a stored blob — uploaded, generated as its own headshot, or
//            painted. Stops following.
//
// The direction rule, asserted from both sides in verify-sprite-p2.js:
// regenerating or uploading an AVATAR never touches the cutout, and
// regenerating a CUTOUT never overwrites a pinned avatar.

// The subject's silhouette as a flat 0/1 mask. Pure; the caller supplies
// decoded RGBA. Separate from image.js's cutoutPruneSpecks mask because that
// one is an intermediate of the cleanup and this one is a question asked of a
// FINISHED cutout, whose alpha is already decided.
function spriteAlphaMask(data, width, height, threshold) {
  const t = threshold != null ? threshold : CUTOUT_TUNING.bboxAlpha;
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > t ? 1 : 0;
  return mask;
}

// --- Deriving an alpha channel from a flat background ----------------------
// cleanCutout REFINES an alpha channel; it does not create one. A generated
// cutout arrives with RMBG's mask already applied, so that is all it has ever
// had to do — but an UPLOADED image usually has no alpha at all (a JPEG
// cannot, and an exported PNG rarely does), which means alpha is 255
// everywhere and the whole frame reads as subject. Caught live: an uploaded
// figure-on-white came back with a full-frame bbox and a floor anchor of 0,
// i.e. `SPRITE_STORE.importRemoveBg` was a promise the code could not keep.
//
// TWO TOLERANCES, and the split is measured rather than assumed. From the
// reference run in dev/design/sprite-studio/refs/out/REPORT.md, where `d` is
// distance from white along the darkest channel:
//
//     outer background   median d=1    max d=2
//     enclosed leg gap   median d=2    p10 d=1
//     a white t-shirt    MIN d=8       median d=28
//
//   - A LOOSE flood from the border (`bgTolerance`, 30) lifts the backdrop.
//     It must be connectivity-based: a global threshold at this level punches
//     a hole straight through a white shirt.
//   - A TIGHT global pass (`enclosedTolerance`, 6) removes background the
//     flood cannot REACH — the wedge between the legs, the gap under an arm,
//     holes in hair. Those are walled in by the subject, so no border-anchored
//     sweep gets to them, and they show up as bright slabs the moment the
//     sprite is composited on a dark plate.
//
// True background is essentially pure white; a white GARMENT never is, because
// it is shaded. This is also the engine behind Phase 5's magic-erase tool.
function spriteImageIsOpaque(data, sampleStep) {
  const step = sampleStep || 997; // a prime stride: samples the whole frame cheaply
  let seen = 0, clear = 0;
  for (let i = 3; i < data.length; i += 4 * step) {
    seen++;
    if (data[i] < 250) clear++;
  }
  // "Effectively opaque" rather than "strictly": a JPEG re-encode or a flattened
  // export can leave a handful of sub-255 pixels that mean nothing.
  return seen > 0 && clear / seen < 0.02;
}

function spriteMatteFromBackground(data, width, height, opts = {}) {
  const bgTolerance = opts.bgTolerance != null ? opts.bgTolerance : 30;
  const enclosedTolerance = opts.enclosedTolerance != null ? opts.enclosedTolerance : 6;
  const n = width * height;

  // Distance from white along the darkest channel.
  const dist = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let m = data[o];
    if (data[o + 1] < m) m = data[o + 1];
    if (data[o + 2] < m) m = data[o + 2];
    dist[i] = 255 - m;
  }

  // Pass 1 — flood from every border pixel over near-white.
  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i) => { if (!bg[i] && dist[i] < bgTolerance) { bg[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < n - width) seed(i + width);
  }

  // Pass 2 — pure-white regions the flood could not reach.
  let enclosed = 0;
  for (let i = 0; i < n; i++) {
    if (!bg[i] && dist[i] < enclosedTolerance) { bg[i] = 1; enclosed++; }
  }

  let cleared = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i]) { data[i * 4 + 3] = 0; cleared++; }
  }
  return { cleared, enclosed, keptFrac: 1 - cleared / n };
}

// D9 — proportional by default, refined by a neck when one exists.
//
// Pure over an explicit mask, exactly like image.js's cutoutBBoxFromMask, so
// it is directly testable against a synthetic silhouette with no canvas
// anywhere near it. Returns the crop plus every intermediate measurement,
// because the constants above were set by reading those measurements and the
// next person to tune them will need the same view.
function detectHeadCrop(mask, width, height, bbox, tuning) {
  const av = tuning || AVATAR_TUNING;
  if (!bbox || bbox.height < 8) return null;

  // Opaque run-width per row, across the bbox only.
  const widths = new Array(bbox.height);
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    const row = y * width;
    let lo = -1, hi = -1;
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      if (mask[row + x]) { if (lo < 0) lo = x; hi = x; }
    }
    widths[y - bbox.minY] = lo < 0 ? 0 : hi - lo + 1;
  }

  const bh = bbox.height;
  // Smooth, so one ragged row — a stray hair, a jagged matte edge — cannot be
  // mistaken for anatomy.
  const sm = new Array(bh);
  for (let i = 0; i < bh; i++) {
    const lo = Math.max(0, i - 3), hi = Math.min(bh, i + 4);
    let s = 0;
    for (let j = lo; j < hi; j++) s += widths[j];
    sm[i] = s / (hi - lo);
  }

  const band = Math.max(4, Math.round(av.headBandFrac * bh));
  const pLo = Math.max(1, Math.round(av.peakLoFrac * bh));
  const pHi = Math.max(pLo + 1, Math.min(band, Math.round(av.peakHiFrac * bh)));

  let peakRow = pLo;
  for (let i = pLo; i < pHi && i < bh; i++) if (sm[i] > sm[peakRow]) peakRow = i;
  const peakW = sm[peakRow];

  let neckRow = null, neckW = null;
  if (peakRow + 1 < Math.min(band, bh)) {
    neckRow = peakRow + 1;
    for (let i = peakRow + 1; i < Math.min(band, bh); i++) if (sm[i] < sm[neckRow]) neckRow = i;
    neckW = sm[neckRow];
  }
  const neckFound = !!(neckW && neckW > 0 && peakW / neckW >= av.neckRatio);

  const core = neckFound
    ? neckRow * (1 + av.chinDropFrac)
    : av.defaultHeadFrac * bh;

  let side = core * (1 + av.headroomFrac);
  const loSide = av.minSideFrac * bh, hiSide = av.maxSideFrac * bh;
  let clamped = null;
  if (side < loSide) { side = loSide; clamped = 'min'; }
  else if (side > hiSide) { side = hiSide; clamped = 'max'; }

  // Horizontal centre from the HEAD rows only — a raised arm or a cocked hip
  // must never pull the frame off the face.
  let sx = 0, cnt = 0;
  const coreEnd = Math.min(bbox.maxY, bbox.minY + Math.max(1, Math.round(core)));
  for (let y = bbox.minY; y <= coreEnd; y++) {
    const row = y * width;
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      if (mask[row + x]) { sx += x; cnt++; }
    }
  }
  const cx = cnt ? sx / cnt : bbox.minX + bbox.width / 2;

  // D9b: anchor on the head's widest row, not on the topmost opaque pixel.
  const centreY = bbox.minY + peakRow + av.faceBiasFrac * side;
  let top = centreY - side / 2;
  let left = cx - side / 2;
  left = Math.max(0, Math.min(width - side, left));
  top = Math.max(0, Math.min(height - side, top));

  return {
    crop: { x: Math.round(left), y: Math.round(top), w: Math.round(side), h: Math.round(side) },
    basis: neckFound ? 'neck' : 'proportional',
    headPeakRow: peakRow,
    headPeakW: Math.round(peakW),
    neckRow, neckW: neckW == null ? null : Math.round(neckW),
    neckRatio: neckW ? +(peakW / neckW).toFixed(2) : null,
    neckFound,
    coreRows: Math.round(core),
    sideFracOfBbox: +(side / bh).toFixed(3),
    clamped,
  };
}

// The canvas half. Decodes a cutout blob, measures it, and returns a square
// PNG blob plus the crop it used. Call-time DOM only — the file still loads
// in the bare vm, and everything worth testing above is already pure.
async function deriveAvatarFromCutout(blob, opts = {}) {
  if (!blob || typeof createImageBitmap !== 'function') return null;
  try {
    const bmp = await createImageBitmap(blob);
    const w = bmp.width, h = bmp.height;
    const src = makeSpriteCanvas(w, h);
    const sctx = src.getContext('2d');
    sctx.drawImage(bmp, 0, 0);
    const data = sctx.getImageData(0, 0, w, h).data;

    let crop = opts.crop;
    let measured = null;
    if (!crop) {
      const mask = spriteAlphaMask(data, w, h);
      const bbox = cutoutBBoxFromMask(mask, w, h);
      measured = detectHeadCrop(mask, w, h, bbox);
      if (!measured) return null;
      crop = measured.crop;
    }

    const size = AVATAR_TUNING.outputSize;
    const out = makeSpriteCanvas(size, size);
    out.getContext('2d').drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, size, size);
    const outBlob = await canvasToBlob(out);
    return outBlob ? { blob: outBlob, crop, measured } : null;
  } catch (e) {
    console.warn('Avatar derivation failed:', e.message);
    return null;
  }
}

function makeSpriteCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

// D8's resolver. Order, and it is the same shape as resolveSprite's:
//
//   pinned override -> derived-from-cutout (LRU) -> derive now -> null
//
// A derived avatar is cached in the kv.images LRU, never in the override
// store: it is reproducible from the cutout, so eviction is free and it must
// not consume D7's budget. Its key is derived FROM the cutout key, so a
// regenerated sprite automatically produces a new avatar key too.
function derivedAvatarKey(cutoutKeyStr, crop) {
  const c = crop ? `_c${crop.x}.${crop.y}.${crop.w}` : '';
  return `av_${cutoutKeyStr}${c}`;
}

async function resolveAvatar(identity, opts = {}) {
  if (!identity) return SPRITE_NONE;
  const styleToken = opts.styleToken != null
    ? opts.styleToken
    : (typeof imageStyleToken === 'function' ? imageStyleToken() : '');

  const req = spriteRequestKey(identity, 'avatar', SPRITE_AVATAR_VARIANT, styleToken);
  const memo = spriteUrlCache.get(req);
  if (memo) return memo;
  if (!opts.generate && spriteMissCache.has(req)) return SPRITE_NONE;

  await loadSpriteIndex();
  const slot = spriteSlotId(identity, 'avatar', SPRITE_AVATAR_VARIANT);
  const entry = spriteIndexEntry(slot);

  // 1 — a PINNED avatar is its own picture and wins outright (D8).
  if (entry && !entry.broken && entry.mode !== 'linked') {
    const rec = await getSpriteRecord(slot);
    if (rec && rec.image) {
      const out = { url: createObjectUrl(slot, rec.image), source: 'override', slot, record: rec };
      spriteUrlCache.set(req, out);
      return out;
    }
    console.warn('Avatar override is broken, falling through:', slot);
    await markSpriteBroken(slot);
  }

  // A LINKED record carries no pixels — only which cutout to crop and where.
  let crop = null, sourceVariant = null;
  if (entry && !entry.broken && entry.mode === 'linked') {
    const rec = await getSpriteRecord(slot);
    if (rec) { crop = rec.crop || null; sourceVariant = rec.sourceVariant || null; }
  }

  const variant = sourceVariant || opts.sourceVariant
    || cutoutVariant('standing', 'neutral', opts.outfitToken || (opts.who ? cutoutOutfitToken(opts.who) : 'c_o_t_b'));

  // 2 — the source cutout, through the ordinary resolver so an OVERRIDDEN
  // sprite is what a linked avatar crops. Painting a sprite changes the face
  // on the map, which is the behaviour "linked" promises.
  const cut = await resolveSprite(identity, 'cutout', variant, {
    ...opts, styleToken, generate: !!opts.generate,
  });
  if (!cut.url) { if (!opts.generate) spriteMissCache.add(req); return SPRITE_NONE; }

  const baseKey = cut.slot || cut.key || `${identity}_${variant}`;
  const avKey = derivedAvatarKey(baseKey, crop);

  // 3 — the derived cache.
  const cached = await getCachedImage(avKey);
  if (cached) {
    const out = { url: createObjectUrl(avKey, cached), source: 'derived', key: avKey };
    spriteUrlCache.set(req, out);
    return out;
  }

  // 4 — derive now. Needs the source PIXELS, not its URL, so this only runs
  // where the blob is reachable; a pure render pass gets `none` and shows
  // initials, which is correct rather than a failure (D10).
  const srcBlob = cut.record ? cut.record.image : await getCachedImage(cut.key);
  if (!srcBlob) { if (!opts.generate) spriteMissCache.add(req); return SPRITE_NONE; }
  const derived = await deriveAvatarFromCutout(srcBlob, { crop });
  // A derivation that failed is not remembered — a broken decode is
  // transient, and a permanent miss would hide a perfectly good cutout.
  if (!derived) return SPRITE_NONE;
  await setCachedImage(avKey, derived.blob);
  const out = { url: createObjectUrl(avKey, derived.blob), source: 'derived', key: avKey, crop: derived.crop };
  spriteUrlCache.set(req, out);
  return out;
}

// D8/D13, Phase 7 — a cutout REGENERATE reuses cutoutKey's deterministic
// string (a reroll only produces new pixels because the caller deletes the
// old cache entry first), so derivedAvatarKey — a pure function of that same
// string plus the crop rect — is unchanged too. Left alone, a LINKED avatar's
// derived-cache entry would outlive the sprite it was cut from: the cutout
// regenerates, but resolveAvatar's step 3 finds the OLD headshot still
// sitting under the same key and never reaches step 4 to cut a new one. A
// PINNED avatar has no derived entry to stale — this is a no-op for it,
// which is D8's other half asserted from this side too.
async function invalidateDerivedAvatar(identity, baseKey) {
  if (!identity || !baseKey) return;
  const slot = spriteSlotId(identity, 'avatar', SPRITE_AVATAR_VARIANT);
  const entry = spriteIndexEntry(slot);
  if (entry && entry.mode !== 'linked') return;
  const rec = entry ? await getSpriteRecord(slot) : null;
  const crop = rec ? rec.crop || null : null;
  try { await deleteCachedImage(derivedAvatarKey(baseKey, crop)); } catch (e) { /* a miss is fine */ }
}

// ===== THE QUEUE (Phase 3, D12-D14) =========================================
// Lazy everywhere, eager for the household.
//
// The shape of the problem: `gs.npcs` is unbounded. RoomList mints ~30 cheap
// stubs a day and promotes any of them to a full NPC the moment the player
// opens a profile, so a roster accumulates people the player met once and
// will never see again. Generating art for all of them is not a budgeting
// question, it is a category error — so nothing below `contact` is ever
// eagerly generated, at any setting.

// D12 — which tier a character is in, or null for "never eagerly".
// Deliberately reads the SAME conditions the rest of the game already uses to
// decide who matters: residency for the household, the player's own room for
// presence, and `contactKnown` for people you have actually exchanged
// messages with (the same scope Messages and the camera's share row use).
function spriteTierOf(gs, npcId, npc) {
  if (!npc) return null;
  const status = npc.residency && npc.residency.status;
  if (status === 'resident') return 'resident';
  if (gs && gs.player && npc.location && npc.location === gs.player.location) return 'present';
  if (status === 'prospective' || npc.contactKnown === true) return 'contact';
  return null;
}

function characterArtMode() {
  // settings.js owns the cache; this is its reader, following the same
  // one-named-reader-per-setting convention as activeImageStyle/sfwModeOn.
  if (typeof activeCharacterArt === 'function') return activeCharacterArt();
  return CHARACTER_ART_MODES.find((m) => m.id === 'household') || CHARACTER_ART_MODES[0];
}

// Off is a HARD gate, not a low ceiling (D12). Everything that could put a
// generated character on screen asks this first.
function characterArtEnabled() {
  return characterArtMode().id !== 'off';
}

// How far down SPRITE_QUEUE.tiers the eager pass is allowed to reach.
// -1 means "not at all".
function spriteTierCeiling() {
  const ceiling = characterArtMode().ceiling;
  if (!ceiling) return -1;
  return SPRITE_QUEUE.tiers.indexOf(ceiling);
}

const spriteQueue = {
  pending: [],        // [{ identity, variant, who, isPlayer, tier, rank }]
  running: false,
  spentSession: 0,
  spentDay: 0,
  day: null,
  lastTouch: 0,       // last time the player did anything (see noteSpriteActivity)
  lastError: null,
};

// Any render pass is evidence the player is doing something, and D14 says the
// queue yields to them. Called from render().
function noteSpriteActivity(now) {
  spriteQueue.lastTouch = now != null ? now : Date.now();
}

// D13 — "ready" is ONE cutout. The avatar falls out of it for free (D8),
// which is the entire reason an eager pass is affordable. If readySet ever
// grows, the per-day budget has to grow with it.
function spriteReadySetFor(who) {
  const outfit = typeof cutoutOutfitToken === 'function' ? cutoutOutfitToken(who) : 'c_o_t_b';
  return SPRITE_QUEUE.readySet.map((r) => cutoutVariant(
    r.pose, r.expression, r.outfit === 'current' ? outfit : r.outfit,
  ));
}

// What art a character actually has right now. Derived, never stored — the
// roster screen renders one badge straight off this.
function spriteReadiness(gs, identity, who, isPlayer) {
  const tierIdx = SPRITE_QUEUE.tiers.indexOf(
    isPlayer ? 'player' : spriteTierOf(gs, null, who),
  );
  const slots = Object.keys(spriteIndex || {});
  let customCutouts = 0, avatarState = 'none', broken = 0;
  for (const slot of slots) {
    const p = parseSpriteSlotId(slot);
    if (!p || p.identity !== identity) continue;
    const entry = spriteIndexEntry(slot);
    if (entry && entry.broken) { broken++; continue; }
    if (p.kind === 'avatar') avatarState = entry && entry.mode === 'linked' ? 'derived' : 'custom';
    else customCutouts++;
  }
  const wanted = spriteReadySetFor(who);
  const queued = spriteQueue.pending.some((it) => it.identity === identity);
  return {
    tier: tierIdx >= 0 ? SPRITE_QUEUE.tiers[tierIdx] : null,
    avatar: avatarState,
    customCutouts,
    broken,
    wanted: wanted.length,
    queued,
    state: broken > 0 ? 'broken'
      : customCutouts > 0 ? 'custom'
      : queued ? 'queued'
      : 'none',
  };
}

// Rebuild the pending list from live state. Cheap and idempotent — it reads
// the in-memory index and never touches kv, so it is safe to call on a tick.
function spriteQueueRefill(gs) {
  spriteQueue.pending = [];
  if (!gs || !characterArtEnabled()) return spriteQueue.pending;
  const ceiling = spriteTierCeiling();
  if (ceiling < 0) return spriteQueue.pending;

  const consider = (who, isPlayer, tier) => {
    const rank = SPRITE_QUEUE.tiers.indexOf(tier);
    if (rank < 0 || rank > ceiling) return;
    const identity = typeof avatarIdentityFor === 'function'
      ? avatarIdentityFor(who, isPlayer)
      : null;
    if (!identity) return; // no real anchor = not a character yet (Phase 2)
    for (const variant of spriteReadySetFor(who)) {
      const req = spriteRequestKey(identity, 'cutout', variant,
        typeof imageStyleToken === 'function' ? imageStyleToken() : '');
      // Already resolved this session, or already known to exist as an
      // override — either way there is nothing to generate.
      if (spriteUrlCache.has(req)) continue;
      if (spriteIndexEntry(spriteSlotId(identity, 'cutout', variant))) continue;
      spriteQueue.pending.push({ identity, variant, who, isPlayer, tier, rank });
    }
  };

  consider(gs.player, true, 'player');
  for (const npc of Object.values(gs.npcs || {})) {
    consider(npc, false, spriteTierOf(gs, null, npc));
  }
  spriteQueue.pending.sort((a, b) => a.rank - b.rank);
  return spriteQueue.pending;
}

function spriteQueueBudgetLeft(gs) {
  const day = gs && gs.meta && gs.meta.clock ? gs.meta.clock.day : null;
  if (day !== spriteQueue.day) { spriteQueue.day = day; spriteQueue.spentDay = 0; }
  if (spriteQueue.spentSession >= SPRITE_QUEUE.maxPerSession) return 0;
  return Math.max(0, SPRITE_QUEUE.maxPerDay - spriteQueue.spentDay);
}

// D14 — every reason the queue must NOT start right now, in one place so a
// test can enumerate them.
function spriteQueueBlockedReason(gs, now) {
  if (!gs) return 'no-state';
  if (!characterArtEnabled()) return 'setting-off';
  if (spriteQueue.running) return 'already-running';
  if (typeof imageBusy === 'function' && imageBusy()) return 'foreground-busy';
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return 'hidden';
  const t = now != null ? now : Date.now();
  if (t - spriteQueue.lastTouch < SPRITE_QUEUE.idleMs) return 'not-idle';
  if (spriteQueueBudgetLeft(gs) <= 0) return 'budget';
  return null;
}

// One item per call. Deliberately NOT a loop: the caller (a tick, an idle
// callback) decides the cadence, so the queue can never monopolise a frame
// and stopping it is simply a matter of not calling it again.
async function spriteQueueStep(gs, now) {
  if (spriteQueueBlockedReason(gs, now)) return false;
  if (spriteQueue.pending.length === 0) spriteQueueRefill(gs);
  const item = spriteQueue.pending.shift();
  if (!item) return false;

  spriteQueue.running = true;
  try {
    const res = await resolveSprite(item.identity, 'cutout', item.variant, {
      who: item.who, isPlayer: item.isPlayer, generate: true,
    });
    if (res && res.url) {
      spriteQueue.spentDay++;
      spriteQueue.spentSession++;
      // D13: the avatar is a crop of what we just made, so warm it now while
      // the pixels are certainly in cache. This is the "one cutout buys both"
      // promise being kept rather than merely asserted.
      await resolveAvatar(item.identity, { who: item.who, isPlayer: item.isPlayer });
      if (typeof refreshAvatars === 'function') refreshAvatars(item.identity);
    } else {
      // A failed generation is NOT retried in a loop — it goes to the back,
      // and the budget it did not spend stays available for someone else.
      spriteQueue.lastError = (res && res.error) || 'generation failed';
    }
  } catch (e) {
    spriteQueue.lastError = e.message;
  } finally {
    spriteQueue.running = false;
  }
  return true;
}

// The pump. Fire-and-forget: never awaited from the render path.
//
// It has to SCHEDULE rather than test-and-run, and the reason is worth
// stating because the obvious version deadlocks: render() calls
// noteSpriteActivity() and then spriteQueuePump(), so at the moment of the
// call the game is by definition not idle. A pump that checked and gave up
// would therefore never once run. Instead it arms a timer for the idle
// window and re-checks when that fires; if the player did something in the
// meantime, lastTouch has moved and it simply arms again.
//
// Stops when there is no work — the next render() re-arms it, which is how a
// newly-arrived roommate gets picked up without anything polling.
let spriteQueueTimer = null;
function spriteQueuePump(gs, delay) {
  if (spriteQueueTimer || !gs) return;
  if (typeof setTimeout !== 'function') return;
  spriteQueueTimer = setTimeout(async () => {
    spriteQueueTimer = null;
    const blocked = spriteQueueBlockedReason(gs);
    // Terminal reasons: nothing that happens on a timer will change these,
    // so stop and let the next render() (or a settings change) re-arm.
    if (blocked === 'setting-off' || blocked === 'budget' || blocked === 'no-state') return;
    // Transient reasons: the player is mid-action, a foreground image is
    // generating, the tab is hidden. Wait out another idle window.
    if (blocked) { spriteQueuePump(gs, SPRITE_QUEUE.idleMs); return; }
    const did = await spriteQueueStep(gs);
    if (did) spriteQueuePump(gs, SPRITE_QUEUE.yieldMs);
  }, delay != null ? delay : SPRITE_QUEUE.idleMs);
}

// ===== /SECTION: SPRITES =====
