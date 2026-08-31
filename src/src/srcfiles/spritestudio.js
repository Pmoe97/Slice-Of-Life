// ===== SECTION: SPRITE STUDIO =====
// The Sprite Studio's verbs. avatars-and-sprite-studio-plan.md, Phase 4.
//
// Sits beside render.spritestudio.js exactly as studio.js sits beside
// render.computer.js's Character Studio renderers: this file decides what
// happens, that one decides what it looks like.
//
// D21 — THIS FILE NEVER WRITES A CHARACTER. No `npc.bible`, no
// `npc.appearance`, no `player.physical`, no rename. The Character Studio
// owns who somebody IS; this one owns what they look like on screen. The two
// share `cutoutIdentityToken` and nothing else. verify-sprite-p8.js asserts
// it over a spied NPC object rather than by reading source, because the
// AI-generation plan's Phase 5 nearly went wrong in exactly this way and a
// comment did not stop it there either.

// The studio's own state lives on the app object, so navigation survives a
// reload. Assets never do — they are in kv.sprites or the image LRU.
function spriteStudioState(gs) {
  const apps = gs && gs.world && gs.world.computer && gs.world.computer.apps;
  if (!apps) return null;
  if (!apps.sprites) {
    apps.sprites = {
      mode: 'roster', viewingIdentity: null, viewingId: null,
      filter: 'all', outfit: 'current', editing: null, notice: null,
    };
  }
  return apps.sprites;
}

// A short-lived message under the header — a refusal, a confirmation. Kept in
// app state rather than the DOM so it survives the re-render that follows the
// action that produced it.
function spriteStudioNotice(gs, text, tone) {
  const st = spriteStudioState(gs);
  if (st) st.notice = text ? { text, tone: tone || 'info', at: Date.now() } : null;
}

// --- The roster ------------------------------------------------------------
// Every character the studio will show, household first. Deliberately built
// from the SAME tier function the queue uses, so the roster and the queue can
// never disagree about who matters.
function spriteStudioRoster(gs) {
  if (!gs) return [];
  const rows = [];
  const playerIdentity = avatarIdentityFor(gs.player, true);
  if (playerIdentity) {
    rows.push({
      id: 'player', identity: playerIdentity, who: gs.player, isPlayer: true,
      name: gs.player.name || 'You', role: 'You', rank: 0,
    });
  }
  for (const [id, npc] of Object.entries(gs.npcs || {})) {
    const identity = avatarIdentityFor(npc, false);
    if (!identity) continue; // no anchor = not a character yet (Phase 2)
    const tier = spriteTierOf(gs, id, npc);
    const status = (npc.residency && npc.residency.status) || '';
    rows.push({
      id, identity, who: npc, isPlayer: false,
      name: npc.bible?.name || 'Unnamed',
      role: status === 'resident' ? 'Roommate'
        : status === 'prospective' ? 'Applicant'
        : tier === 'present' ? 'Here now'
        : npc.contactKnown ? 'Contact' : 'Known',
      rank: tier ? SPRITE_QUEUE.tiers.indexOf(tier) + 1 : 99,
    });
  }
  rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return rows;
}

function spriteStudioFilterRow(gs, row, filter) {
  const r = spriteReadiness(gs, row.identity, row.who, row.isPlayer);
  switch (filter) {
    case 'household': return row.rank <= 2;
    case 'custom': return r.customCutouts > 0 || r.avatar === 'custom';
    case 'none': return r.state === 'none';
    case 'broken': return r.broken > 0;
    default: return true;
  }
}

// --- The sprite grid -------------------------------------------------------
// Which outfit token the grid is addressing. 'current' follows the character;
// anything else is a literal token the player picked from the outfits they
// already have art for.
function spriteStudioOutfitToken(gs, row, choice) {
  if (!choice || choice === 'current') return cutoutOutfitToken(row.who);
  return choice;
}

// The outfits this character actually has art for, plus 'current'. Read off
// the index, so it costs no blob reads.
function spriteStudioOutfits(identity) {
  const seen = new Set();
  for (const slot of Object.keys(spriteIndex || {})) {
    const p = parseSpriteSlotId(slot);
    if (!p || p.identity !== identity || p.kind !== 'cutout') continue;
    const parts = p.variant.split('_');
    const outfit = parts.slice(2).join('_');
    if (outfit && outfit !== SPRITE_WILDCARD) seen.add(outfit);
  }
  return ['current', ...[...seen].sort()];
}

// One cell's state, for the grid. Never generates.
async function spriteStudioCellState(gs, row, pose, expression, outfitToken) {
  const variant = cutoutVariant(pose, expression, outfitToken);
  const slot = spriteSlotId(row.identity, 'cutout', variant);
  const wild = spriteSlotId(row.identity, 'cutout', wildcardVariantOf(variant));
  const entry = spriteIndexEntry(slot) || spriteIndexEntry(wild);
  const res = await resolveSprite(row.identity, 'cutout', variant, {
    who: row.who, isPlayer: row.isPlayer, generate: false,
  });
  const queued = spriteQueue.pending.some((i) => i.identity === row.identity && i.variant === variant);
  return {
    variant, slot, url: res.url,
    state: entry && entry.broken ? 'broken'
      : res.source === 'override' ? (spriteIndexEntry(slot) ? 'custom' : 'custom-all')
      : res.url ? 'generated'
      : queued ? 'queued' : 'missing',
    origin: entry ? entry.origin : null,
  };
}

// --- Regenerate ------------------------------------------------------------
// D8's direction rule, half one: regenerating a CUTOUT never overwrites a
// pinned avatar. It cannot, structurally — this only ever touches the
// generated cache, and a pinned avatar is an override that outranks it.
async function doSpriteRegenerate(gs, identity, variant) {
  const row = spriteStudioRoster(gs).find((r) => r.identity === identity);
  if (!row) return { ok: false, message: 'That character is no longer here.' };
  if (!characterArtEnabled()) {
    return { ok: false, message: 'Character art is turned off in Settings — turn it back on to generate.' };
  }
  const parts = variant.split('_');
  const pose = parts[0], expression = parts[1];
  // A reroll must produce DIFFERENT pixels, and cutouts are deterministic by
  // design (D3) — same inputs, same image, forever. So the old cache entry is
  // dropped first; without that, "Regenerate" would faithfully reproduce the
  // frame the player just rejected.
  const key = cutoutKey(identity, pose, expression, parts.slice(2).join('_'), imageStyleToken());
  try { await deleteCachedImage(key); } catch (e) { /* a miss is fine */ }
  invalidateSprite(identity);

  const res = await resolveSprite(identity, 'cutout', variant, {
    who: row.who, isPlayer: row.isPlayer, generate: true,
  });
  if (!res.url) return { ok: false, message: res.error || 'That did not generate. Try again in a moment.' };
  // The avatar is a crop of what we just made (D13), so warm it now — but a
  // LINKED avatar's derived-cache entry sits under a key that did not change
  // (Phase 7), so it has to go first or resolveAvatar keeps serving the
  // sprite this regenerate just replaced.
  await invalidateDerivedAvatar(identity, res.key || key);
  await resolveAvatar(identity, { who: row.who, isPlayer: row.isPlayer });
  if (typeof refreshAvatars === 'function') refreshAvatars(identity);
  return { ok: true };
}

// --- Upload ----------------------------------------------------------------
// Decode -> normalise alpha -> optionally matte -> measure -> store.
// The measuring is not optional: D19's bbox and D16's floor anchor are what
// the scene layout places a sprite by, and an uploaded PNG has neither until
// someone works them out.
async function ingestSpriteUpload(file, opts = {}) {
  const kind = opts.kind === 'avatar' ? 'avatar' : 'cutout';
  if (!file) return { ok: false, message: 'No file.' };
  if (!SPRITE_STORE.uploadTypes.includes(file.type)) {
    return { ok: false, message: `That file type is not supported. Use PNG, WebP or JPEG.` };
  }
  if (file.size > SPRITE_STORE.maxUploadBytes) {
    const mb = Math.round(SPRITE_STORE.maxUploadBytes / (1024 * 1024));
    return { ok: false, message: `That image is too large — the limit is ${mb} MB.` };
  }
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width, h = bmp.height;
    const canvas = makeSpriteCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);

    // A JPEG has no alpha channel at all, and an exported PNG usually has
    // none either, so an uploaded sprite is normally an opaque rectangle —
    // useless as a layer. cleanCutout REFINES an alpha channel; it cannot
    // create one, so on its own it would look at alpha 255 everywhere,
    // conclude the whole frame is the subject, and hand back a full-frame
    // bbox with a floor anchor of 0. (Measured, on a real upload, before this
    // existed.) So derive the alpha FIRST from the flat background, then run
    // the ordinary cleanup over the result — which is the same pipeline a
    // generated cutout goes through, and the point of doing it at all.
    let cleaned = { canvas, bbox: null, bottomFrac: null };
    let matted = null;
    if (SPRITE_STORE.importRemoveBg[kind] && opts.removeBackground !== false) {
      const raw = ctx.getImageData(0, 0, w, h);
      if (spriteImageIsOpaque(raw.data)) {
        matted = spriteMatteFromBackground(raw.data, w, h, opts.matte);
        ctx.putImageData(raw, 0, 0);
        if (matted.keptFrac < 0.005) {
          return { ok: false, message: 'That image looks like it is almost all background. Turn off “clear the background”, or upload a cut-out PNG.' };
        }
      }
      cleaned = cleanCutout(canvas, opts.tuning);
      if (!cleaned.bbox) {
        return { ok: false, message: 'Nothing was left after clearing the background. Turn that off, or upload a cut-out PNG.' };
      }
    } else {
      const data = ctx.getImageData(0, 0, w, h);
      const mask = spriteAlphaMask(data.data, w, h);
      cleaned.bbox = cutoutBBoxFromMask(mask, w, h) || { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, width: w, height: h };
      cleaned.bottomFrac = cutoutBottomFrac(cleaned.bbox, h);
    }
    const blob = await canvasToBlob(cleaned.canvas);
    if (!blob) return { ok: false, message: 'That image could not be read.' };
    // D6 — the MASTER is the file as it arrived, never the processed result.
    // Recrop, the restore brush and "reset edits" all read it, so an upload
    // that only kept its cleaned form would be a one-way door.
    // The master is the file AS IT ARRIVED — decoded, never matted, never
    // cropped. Drawn from a second canvas because `canvas` has had the matte
    // written into it by now.
    const pristine = makeSpriteCanvas(w, h);
    pristine.getContext('2d').drawImage(bmp, 0, 0);
    const master = await canvasToBlob(pristine);
    return {
      ok: true,
      image: blob, master: master || blob,
      w: cleaned.canvas.width, h: cleaned.canvas.height,
      bbox: cleaned.bbox, bottomFrac: cleaned.bottomFrac,
      matted: matted,
    };
  } catch (e) {
    return { ok: false, message: `That image could not be read: ${e.message}` };
  }
}

// D5's scope. `scope` is 'exact' (this outfit) or 'all' (every outfit of this
// pose and expression). An UPLOAD defaults to 'all' and an edit to 'exact',
// because someone uploading a picture of a character is describing the
// character, not the laundry.
async function saveSpriteUpload(gs, identity, variant, ingested, opts = {}) {
  const scope = opts.scope === 'all' ? 'all' : 'exact';
  const targetVariant = scope === 'all' ? wildcardVariantOf(variant) : variant;
  const slot = spriteSlotId(identity, opts.kind === 'avatar' ? 'avatar' : 'cutout', targetVariant);
  const res = await putSpriteRecord({
    slot,
    origin: opts.origin || 'uploaded',
    mode: 'pinned',
    image: ingested.image,
    master: ingested.master,
    w: ingested.w, h: ingested.h,
    bbox: ingested.bbox,
    bottomFrac: ingested.bottomFrac,
    crop: opts.crop || null,
    tuning: opts.tuning || null,
    source: null,
  });
  if (res.ok && typeof refreshAvatars === 'function') refreshAvatars(identity);
  return res;
}

// --- Revert / delete -------------------------------------------------------
// Deletes the OVERRIDE, not the art. The next resolve falls through to the
// generated cache (or regenerates from the seed), which is why this is safe
// to offer without a confirmation on a generated-origin record — and why it
// DOES warn on an uploaded or painted one, where there is nothing behind it.
async function doSpriteRevert(gs, slot) {
  const parsed = parseSpriteSlotId(slot);
  if (!parsed) return { ok: false, message: 'That is not a sprite.' };
  await deleteSpriteRecord(slot);
  if (typeof refreshAvatars === 'function') refreshAvatars(parsed.identity);
  return { ok: true };
}

function spriteRevertLosesWork(slot) {
  const entry = spriteIndexEntry(slot);
  if (!entry) return false;
  // 'regenerated' art can be made again from its seed; the rest cannot.
  return entry.origin === 'uploaded' || entry.origin === 'edited';
}

// --- Link / pin (D8) -------------------------------------------------------
// Linked: no blob, just a crop rect and which cutout to take it from. Pinned:
// its own picture, which stops following the sprite.
async function doSpriteAvatarLink(gs, identity, opts = {}) {
  const slot = spriteSlotId(identity, 'avatar', SPRITE_AVATAR_VARIANT);
  const res = await putSpriteRecord({
    slot, origin: 'generated', mode: 'linked',
    crop: opts.crop || null,
    sourceVariant: opts.sourceVariant || null,
    image: null, master: null,
  });
  if (res.ok) {
    invalidateSprite(identity);
    if (typeof refreshAvatars === 'function') refreshAvatars(identity);
  }
  return res;
}

async function doSpriteAvatarUnlink(gs, identity) {
  // Unlinking PINS what is currently showing, rather than dropping to
  // nothing: the player asked to stop following the sprite, not to lose the
  // face they were looking at.
  const row = spriteStudioRoster(gs).find((r) => r.identity === identity);
  const current = await resolveAvatar(identity, { who: row && row.who, isPlayer: row && row.isPlayer });
  if (!current.url) return { ok: false, message: 'There is no avatar to keep yet — generate or upload one first.' };
  const blob = current.key ? await getCachedImage(current.key) : (current.record && current.record.image);
  if (!blob) return { ok: false, message: 'That avatar could not be read.' };
  const slot = spriteSlotId(identity, 'avatar', SPRITE_AVATAR_VARIANT);
  // D1's own wording is "explicitly pinned from a regenerate" — this IS that
  // case, and it is why the data model's origin enum carries 'regenerated' at
  // all. 'generated' here (verify-sprite-p8.js's boundary check) would be
  // indistinguishable from machine output landing in the store on its own,
  // which is exactly the failure D1/D7 exist to make impossible; only a
  // blob-less LINKED record (doSpriteAvatarLink, just above) is allowed to
  // carry that tag, because it stores no pixels to mistake for a leak.
  const res = await putSpriteRecord({
    slot, origin: 'regenerated', mode: 'pinned',
    image: blob, master: blob, crop: current.crop || null,
  });
  if (res.ok) {
    invalidateSprite(identity);
    if (typeof refreshAvatars === 'function') refreshAvatars(identity);
  }
  return res;
}

// ===== THE AVATAR RECROP SURFACE (Phase 7, D8/D9) ===========================
// Much smaller than the cutout editor below: no history, no destructive
// buffers, no tuning. The player is placing ONE square over a cutout's own
// pixels and (optionally) choosing WHICH cutout to place it over. Saving
// writes a LINKED record — {crop, sourceVariant}, no blob (D8) — so a later
// cutout regeneration re-derives against the new pixels at the same rect
// rather than freezing a snapshot the moment Save is clicked.
//
// The pure geometry below (clamp / hit-test / move / resize) is deliberately
// free of canvas and DOM, exactly like spriteGeomRect's family above it, so
// the drag maths is directly testable. Only spriteRecropOpen/SetSource touch
// a canvas — decoding a blob into pixels needs one — and are call-time only.

// A corner/edge handle's radius in buffer pixels, shared between hit-testing
// and drawing so they can never disagree about where the grab zone is.
function spriteRecropHandleSize(crop) {
  return Math.max(14, (crop ? crop.w : 0) * 0.12);
}

// The guard rails D9's own clamp uses, reused for a rect a human is dragging
// rather than one a scan produced: always square, always inside the frame.
function spriteRecropClampCrop(rect, width, height) {
  const side = Math.max(8, Math.min(width, height, Math.round(rect.w)));
  const x = Math.max(0, Math.min(width - side, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - side, Math.round(rect.y)));
  return { x, y, w: side, h: side };
}

function spriteRecropCornerAt(crop, x, y, handle) {
  const corners = {
    tl: { x: crop.x, y: crop.y },
    tr: { x: crop.x + crop.w, y: crop.y },
    bl: { x: crop.x, y: crop.y + crop.h },
    br: { x: crop.x + crop.w, y: crop.y + crop.h },
  };
  let best = null, bestD = handle;
  for (const [name, c] of Object.entries(corners)) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d <= bestD) { best = name; bestD = d; }
  }
  return best;
}

// Drag the whole ring so its top-left lands at (x, y) — the caller has
// already subtracted the pointer's grab offset within the ring.
function spriteRecropMoveTo(crop, x, y, width, height) {
  return spriteRecropClampCrop({ x, y, w: crop.w, h: crop.h }, width, height);
}

// Resize from one corner, the OPPOSITE corner fixed, kept square by growing
// to the larger of the two axis deltas — the natural "drag the box out" feel.
function spriteRecropResizeFromCorner(crop, corner, x, y, width, height) {
  const anchor = {
    x: corner === 'tl' || corner === 'bl' ? crop.x + crop.w : crop.x,
    y: corner === 'tl' || corner === 'tr' ? crop.y + crop.h : crop.y,
  };
  const dx = x - anchor.x, dy = y - anchor.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  const rx = dx >= 0 ? anchor.x : anchor.x - side;
  const ry = dy >= 0 ? anchor.y : anchor.y - side;
  return spriteRecropClampCrop({ x: rx, y: ry, w: side, h: side }, width, height);
}

let spriteRecrop = null;

function spriteRecropState() { return spriteRecrop; }
function spriteRecropClose() { spriteRecrop = null; }

// The default source cutout: whatever this identity's ready-set pose+
// expression currently is, at its current outfit — the same one cutout D13's
// eager pass always makes, so it is the one most likely to already have art.
function spriteRecropDefaultVariant(row) {
  const outfit = typeof cutoutOutfitToken === 'function' ? cutoutOutfitToken(row.who) : 'c_o_t_b';
  return cutoutVariant('standing', 'neutral', outfit);
}

// Decode one cutout's pixels into the crop session: a source CANVAS (for the
// live round previews' drawImage) plus the raw buffer (for the alpha mask
// D9's detector needs). Call-time DOM only, like deriveAvatarFromCutout above.
async function spriteRecropDecode(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = makeSpriteCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const mask = spriteAlphaMask(data, bmp.width, bmp.height);
  const bbox = cutoutBBoxFromMask(mask, bmp.width, bmp.height);
  return { canvas, data, width: bmp.width, height: bmp.height, mask, bbox };
}

async function spriteRecropOpen(gs, identity) {
  const row = spriteStudioRoster(gs).find((r) => r.identity === identity);
  if (!row) return { ok: false, message: 'That character is no longer here.' };

  const avSlot = spriteSlotId(identity, 'avatar', SPRITE_AVATAR_VARIANT);
  const avEntry = spriteIndexEntry(avSlot);
  const avRec = avEntry && avEntry.mode === 'linked' ? await getSpriteRecord(avSlot) : null;
  const sourceVariant = (avRec && avRec.sourceVariant) || spriteRecropDefaultVariant(row);

  const res = await resolveSprite(identity, 'cutout', sourceVariant, {
    who: row.who, isPlayer: row.isPlayer, generate: false,
  });
  const srcBlob = res.record ? res.record.image : (res.key ? await getCachedImage(res.key) : null);
  if (!srcBlob) return { ok: false, message: 'There is no sprite to crop yet — generate one first.' };

  const dec = await spriteRecropDecode(srcBlob);
  const detected = dec.bbox ? detectHeadCrop(dec.mask, dec.width, dec.height, dec.bbox) : null;
  const crop = (avRec && avRec.crop)
    || (detected && detected.crop)
    || spriteRecropClampCrop({ x: 0, y: 0, w: Math.min(dec.width, dec.height), h: Math.min(dec.width, dec.height) }, dec.width, dec.height);

  spriteRecrop = {
    identity, row, sourceVariant,
    canvas: dec.canvas, width: dec.width, height: dec.height, bbox: dec.bbox,
    crop, dirty: false,
  };
  return { ok: true, recrop: spriteRecrop };
}

function spriteRecropSetCrop(rect) {
  if (!spriteRecrop) return;
  spriteRecrop.crop = spriteRecropClampCrop(rect, spriteRecrop.width, spriteRecrop.height);
  spriteRecrop.dirty = true;
}

// The Auto button: D9's own detector, re-run against THIS session's already-
// decoded pixels rather than a fresh fetch.
function spriteRecropAuto() {
  if (!spriteRecrop || !spriteRecrop.bbox) return false;
  const mask = spriteAlphaMask(spriteRecrop.canvas.getContext('2d')
    .getImageData(0, 0, spriteRecrop.width, spriteRecrop.height).data, spriteRecrop.width, spriteRecrop.height);
  const detected = detectHeadCrop(mask, spriteRecrop.width, spriteRecrop.height, spriteRecrop.bbox);
  if (!detected) return false;
  spriteRecrop.crop = detected.crop;
  spriteRecrop.dirty = true;
  return true;
}

// "Use a different pose as the source." Re-decodes rather than carrying the
// old rect over blind — a crop measured on one pose is not guaranteed to sit
// on the subject in another.
async function spriteRecropSetSource(gs, variant) {
  if (!spriteRecrop) return { ok: false, message: 'Nothing is open.' };
  const row = spriteRecrop.row;
  const res = await resolveSprite(spriteRecrop.identity, 'cutout', variant, {
    who: row.who, isPlayer: row.isPlayer, generate: false,
  });
  const srcBlob = res.record ? res.record.image : (res.key ? await getCachedImage(res.key) : null);
  if (!srcBlob) return { ok: false, message: 'That pose has no art yet.' };
  const dec = await spriteRecropDecode(srcBlob);
  const detected = dec.bbox ? detectHeadCrop(dec.mask, dec.width, dec.height, dec.bbox) : null;
  spriteRecrop.sourceVariant = variant;
  spriteRecrop.canvas = dec.canvas; spriteRecrop.width = dec.width; spriteRecrop.height = dec.height;
  spriteRecrop.bbox = dec.bbox;
  spriteRecrop.crop = (detected && detected.crop) || spriteRecropClampCrop(spriteRecrop.crop, dec.width, dec.height);
  spriteRecrop.dirty = true;
  return { ok: true };
}

// Save writes a LINKED record via the existing D8 verb — no blob, so a later
// cutout regeneration keeps re-deriving against new pixels at this same rect
// instead of freezing a snapshot.
async function spriteRecropSave(gs) {
  if (!spriteRecrop) return { ok: false, message: 'Nothing is open.' };
  const res = await doSpriteAvatarLink(gs, spriteRecrop.identity, {
    crop: spriteRecrop.crop, sourceVariant: spriteRecrop.sourceVariant,
  });
  if (res.ok) spriteRecrop.dirty = false;
  return res;
}

// ===== THE EDITOR (Phase 5 — the cleaning suite) ============================
//
// TWO KINDS OF EDIT, AND THEY MUST NOT DESTROY EACH OTHER. This is the whole
// architecture, and getting it wrong is the obvious way to build this:
//
//   PARAMETRIC   the matte sliders (D18). These re-run image.js's own
//                cutoutAlphaLevels / cutoutSuppressSpill / cutoutPruneSpecks
//                against the MASTER, from scratch, every time one moves.
//                Recomputing from source is what makes them non-compounding:
//                drag alpha-floor up and back down and you are exactly where
//                you started, which is not true of any edit that stacks.
//   DESTRUCTIVE  eraser, restore, magic-erase. Accumulated by hand.
//
// If the sliders wrote into the same buffer the strokes did, every slider
// drag would wipe every stroke — and a player who spent two minutes cleaning
// a hairline and then nudged a slider would lose all of it. So strokes live
// in their own overlay and the working image is composited:
//
//   base    = tuning applied to master        (recomputed, cheap, disposable)
//   working = base with strokeMask applied    (what you see, what gets saved)
//
// strokeMask is signed: negative erases, positive restores FROM THE MASTER
// (D6 — which is why the master has to exist at all). Zero is untouched.
//
// Everything in this section is pure array math over explicit buffers, so it
// is testable without a canvas. The canvas lives in the render layer.

const SPRITE_EDIT_HISTORY_MAX = 200;   // D20, inherited from the home-design
                                       // studio: "closing a tab is rare, a
                                       // confident wrong drag is not."

let spriteEditor = null;

function spriteEditorState() { return spriteEditor; }

// --- Pure: the parametric base ---------------------------------------------
// A fresh copy of the master with the current tuning applied. This is the
// same pipeline a generated cutout goes through, run against the same
// functions, which is D18's entire point: the sliders are not an
// approximation of the cleanup, they ARE the cleanup.
function spriteApplyTuning(masterData, width, height, tuning) {
  const out = new Uint8ClampedArray(masterData);
  cutoutAlphaLevels(out, width, height, tuning);
  cutoutSuppressSpill(out, width, height, tuning);
  const pruned = cutoutPruneSpecks(out, width, height, tuning);
  return { data: out, pruned };
}

// --- Pure: compositing ------------------------------------------------------
// working = base, then strokes. Negative stroke erases proportionally;
// positive restores toward the master's own alpha at that pixel, so "restore"
// can never invent opacity the source never had.
function spriteCompositeStrokes(baseData, masterData, strokeMask, out, paint) {
  const n = strokeMask.length;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = baseData[o]; out[o + 1] = baseData[o + 1]; out[o + 2] = baseData[o + 2];
    const s = strokeMask[i];
    let a = baseData[o + 3];
    if (s < 0) {
      a = a * (1 + s / 255);
    } else if (s > 0) {
      const target = masterData[o + 3];
      a = a + (target - a) * (s / 255);
      // Restoring pulls the master's COLOUR back too, or an erased-then-
      // restored pixel would come back as whatever the tuned base left in the
      // RGB channels — usually the decontamination mean, which is a grey that
      // appears nowhere on the character.
      out[o] = masterData[o]; out[o + 1] = masterData[o + 1]; out[o + 2] = masterData[o + 2];
    }
    a = a < 0 ? 0 : (a > 255 ? 255 : a);
    // PAINT (Phase 6) sits on top of erase and restore alike. A player who
    // erases a patch and then draws a new arm into it has to see the arm, so
    // the paint layer is composited AFTER the stroke mask rather than under
    // it; the eraser reaches it by clearing the paint layer directly instead.
    if (paint) {
      const pa = paint[o + 3];
      if (pa > 0) {
        const f = pa / 255;
        out[o] = out[o] + (paint[o] - out[o]) * f;
        out[o + 1] = out[o + 1] + (paint[o + 1] - out[o + 1]) * f;
        out[o + 2] = out[o + 2] + (paint[o + 2] - out[o + 2]) * f;
        a = pa + a * (1 - f);
      }
    }
    out[o + 3] = a;
  }
  return out;
}

// --- Pure: the brush --------------------------------------------------------
// A soft round stamp written into strokeMask, returning the delta needed to
// undo it. `amount` is signed: negative erases, positive restores.
//
// Returns SPARSE indices rather than a buffer snapshot, which is what makes a
// 200-deep history affordable: a full 512x768 stroke mask is 786 KB, so 200
// snapshots would be 150 MB. A brush stroke touches a few thousand pixels.
function spriteStampBrush(strokeMask, width, height, cx, cy, radius, hardness, amount) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const idx = [];
  const prev = [];
  const inner = radius * Math.max(0, Math.min(1, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const t = d <= inner ? 1 : (radius === inner ? 1 : 1 - (d - inner) / (radius - inner));
      const add = amount * t;
      const i = y * width + x;
      // A stamp only ever pushes FURTHER in its own direction, so overlapping
      // stamps within one stroke do not compound into a hard edge.
      const cur = strokeMask[i];
      const next = amount < 0 ? Math.min(cur, Math.round(add)) : Math.max(cur, Math.round(add));
      if (next === cur) continue;
      idx.push(i); prev.push(cur);
      strokeMask[i] = next;
    }
  }
  return { indices: Int32Array.from(idx), prev: Int16Array.from(prev) };
}

// Interpolate between two pointer samples, so a fast drag is a line rather
// than a dotted trail. The classic bug this exists to prevent.
function spriteStrokeSegment(strokeMask, width, height, x0, y0, x1, y1, radius, hardness, amount) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius * 0.35);
  const steps = Math.max(1, Math.ceil(dist / step));
  const idx = [];
  const prev = [];
  const seen = new Map();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const d = spriteStampBrush(strokeMask, width, height,
      x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, hardness, amount);
    for (let k = 0; k < d.indices.length; k++) {
      const i = d.indices[k];
      // Keep the EARLIEST prior value per pixel: undoing the whole segment
      // must return to before the segment, not to mid-segment.
      if (!seen.has(i)) { seen.set(i, d.prev[k]); idx.push(i); prev.push(d.prev[k]); }
    }
  }
  return { indices: Int32Array.from(idx), prev: Int16Array.from(prev) };
}

// --- Pure: magic erase ------------------------------------------------------
// Click-anywhere flood over colour similarity, writing erase into strokeMask.
//
// Both properties are measured requirements, not preferences (Evidence 6):
// CLICK-ANYWHERE because the worst residue is background *enclosed* by the
// subject, which no border-anchored sweep can reach; and a real TOLERANCE
// control because a loose value lifts a backdrop while a tight one is needed
// to clear a pure-white gap without eating a white shirt.
function spriteFloodErase(data, width, height, sx, sy, tolerance, strokeMask, opts = {}) {
  const n = width * height;
  const start = sy * width + sx;
  if (start < 0 || start >= n) return { indices: new Int32Array(0), prev: new Int16Array(0) };
  const so = start * 4;
  const sr = data[so], sg = data[so + 1], sb = data[so + 2], sa = data[so + 3];
  const tol = tolerance * tolerance * 3;
  const seen = new Uint8Array(n);
  const stack = [start];
  const idx = [];
  const prev = [];
  const contiguous = opts.contiguous !== false;

  const matches = (i) => {
    const o = i * 4;
    // A fully transparent pixel is already gone; treating it as a match lets
    // the flood cross an existing hole, which is what a player expects when
    // clearing residue AROUND something they already erased.
    if (data[o + 3] === 0 && sa === 0) return true;
    const dr = data[o] - sr, dg = data[o + 1] - sg, db = data[o + 2] - sb;
    const da = data[o + 3] - sa;
    return (dr * dr + dg * dg + db * db) <= tol && Math.abs(da) <= tolerance * 2;
  };

  if (!contiguous) {
    for (let i = 0; i < n; i++) {
      if (!matches(i) || strokeMask[i] === -255) continue;
      idx.push(i); prev.push(strokeMask[i]); strokeMask[i] = -255;
    }
    return { indices: Int32Array.from(idx), prev: Int16Array.from(prev) };
  }

  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    if (!matches(i)) continue;
    if (strokeMask[i] !== -255) { idx.push(i); prev.push(strokeMask[i]); strokeMask[i] = -255; }
    const x = i % width, y = (i / width) | 0;
    if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < width - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - width]) { seen[i - width] = 1; stack.push(i - width); }
    if (y < height - 1 && !seen[i + width]) { seen[i + width] = 1; stack.push(i + width); }
  }
  return { indices: Int32Array.from(idx), prev: Int16Array.from(prev) };
}


// --- Pure: colour -----------------------------------------------------------
// The adjustment set is PARAMETRIC, exactly like the matte (D18) and for the
// same reason: every value re-runs against the base from scratch, so dragging
// saturation up and back down is byte-identical to never having touched it. A
// per-frame accumulate would brown the sprite a little on every mousemove and
// there would be no way back.

function spriteHexToRgb(hex) {
  const s = String(hex == null ? '' : hex).replace('#', '').trim();
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(v, 16);
  if (v.length !== 6 || !isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function spriteRgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function spriteRgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function spriteHslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: ch(h + 1 / 3) * 255, g: ch(h) * 255, b: ch(h - 1 / 3) * 255 };
}

function spriteAdjustDefaults() {
  // tintColor starts on the blue the night plates actually sit in, so the
  // slider whose whole job is matching a sprite to a dim room starts pointed
  // somewhere useful rather than at black.
  return { hue: 0, sat: 0, light: 0, brightness: 0, contrast: 0, tint: 0, tintColor: '#101828' };
}

function spriteAdjustIsIdentity(a) {
  return !a || (!a.hue && !a.sat && !a.light && !a.brightness && !a.contrast && !a.tint);
}

// RGB only. An adjustment must never touch alpha, or "make it darker" would
// quietly eat the matte the player just spent two minutes cleaning.
function spriteAdjustBuffer(data, adjust) {
  if (spriteAdjustIsIdentity(adjust)) return data;
  const a = adjust;
  const doHsl = !!(a.hue || a.sat || a.light);
  const hShift = (a.hue || 0) / 360;
  const sMul = 1 + (a.sat || 0) / 100;
  const lAdd = (a.light || 0) / 100;
  const bAdd = (a.brightness || 0) * 2.55;
  const C = (a.contrast || 0) * 2.55;                 // the classic contrast
  const cf = (259 * (C + 255)) / (255 * (259 - C));   // curve, pivoted on grey
  const tf = (a.tint || 0) / 100;
  const tc = a.tint ? spriteHexToRgb(a.tintColor) : null;
  // Brightness, contrast and tint are per-channel and depend only on the
  // channel VALUE, so they collapse into three 256-entry lookups instead of
  // running the same arithmetic 393,216 times on every slider frame.
  const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const tcc = tc ? [tc.r, tc.g, tc.b] : null;
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      let out = cf * (v + bAdd - 128) + 128;
      if (tcc) out += (tcc[c] - out) * tf;
      lut[c][v] = out;
    }
  }
  const clamp255 = (v) => (v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)));
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] === 0) continue;   // nothing shows through a hole
    let r = data[o], g = data[o + 1], b = data[o + 2];
    if (doHsl) {
      const hsl = spriteRgbToHsl(r, g, b);
      let h = hsl.h + hShift;
      h -= Math.floor(h);
      const c2 = spriteHslToRgb(h,
        Math.max(0, Math.min(1, hsl.s * sMul)),
        Math.max(0, Math.min(1, hsl.l + lAdd)));
      r = c2.r; g = c2.g; b = c2.b;
    }
    data[o] = lut[0][clamp255(r)];
    data[o + 1] = lut[1][clamp255(g)];
    data[o + 2] = lut[2][clamp255(b)];
  }
  return data;
}

// --- Pure: geometry ---------------------------------------------------------
// Flip, uniform scale and crop are PARAMETRIC too, and that is not a stylistic
// choice — it is what keeps the history honest. Every stroke delta is a list
// of buffer INDICES, so baking a crop or a resample into the buffers would
// silently re-point up to two hundred undo entries at the wrong pixels (the
// same trap Phase 5's auto-trim comment names). Held as a description applied
// at the END of the pipeline instead, the strokes stay in source space and
// stay valid forever, and a flip is undone by flipping back rather than by
// resampling twice.

function spriteGeomDefaults() { return { flipH: false, scale: 1, crop: null }; }

function spriteGeomIsIdentity(g) {
  return !g || (!g.flipH && (g.scale == null || g.scale === 1) && !g.crop);
}

function spriteGeomRect(g, width, height) {
  const c = g && g.crop;
  if (!c) return { x: 0, y: 0, w: width, h: height };
  const x = Math.max(0, Math.min(width - 1, Math.round(c.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(c.y)));
  return {
    x, y,
    w: Math.max(1, Math.min(width - x, Math.round(c.w))),
    h: Math.max(1, Math.min(height - y, Math.round(c.h))),
  };
}

function spriteGeomOutSize(g, width, height) {
  const r = spriteGeomRect(g, width, height);
  const s = (g && g.scale) || 1;
  return { width: Math.max(1, Math.round(r.w * s)), height: Math.max(1, Math.round(r.h * s)) };
}

// Bilinear, because a cutout resampled with nearest-neighbour gets a staircase
// silhouette — and the whole point of the scale control is that the result
// goes straight into a scene at true size, where that staircase is visible.
// At scale 1 every weight is 0 or 1, so flip and crop are exact copies and a
// flip really is its own inverse rather than nearly so.
function spriteGeomApply(data, width, height, g) {
  if (spriteGeomIsIdentity(g)) return { data, width, height };
  const r = spriteGeomRect(g, width, height);
  const s = g.scale || 1;
  const ow = Math.max(1, Math.round(r.w * s));
  const oh = Math.max(1, Math.round(r.h * s));
  const out = new Uint8ClampedArray(ow * oh * 4);
  const flip = !!g.flipH;
  for (let y = 0; y < oh; y++) {
    let fy = (y + 0.5) / s - 0.5;
    if (fy < 0) fy = 0; else if (fy > r.h - 1) fy = r.h - 1;
    const y0 = Math.floor(fy), y1 = Math.min(r.h - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < ow; x++) {
      let fx = (x + 0.5) / s - 0.5;
      if (fx < 0) fx = 0; else if (fx > r.w - 1) fx = r.w - 1;
      const x0 = Math.floor(fx), x1 = Math.min(r.w - 1, x0 + 1), wx = fx - x0;
      const sx0 = flip ? r.x + r.w - 1 - x0 : r.x + x0;
      const sx1 = flip ? r.x + r.w - 1 - x1 : r.x + x1;
      const iA = ((r.y + y0) * width + sx0) * 4;
      const iB = ((r.y + y0) * width + sx1) * 4;
      const iC = ((r.y + y1) * width + sx0) * 4;
      const iD = ((r.y + y1) * width + sx1) * 4;
      const o = (y * ow + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[iA + c] + (data[iB + c] - data[iA + c]) * wx;
        const bot = data[iC + c] + (data[iD + c] - data[iC + c]) * wx;
        out[o + c] = top + (bot - top) * wy;
      }
    }
  }
  return { data: out, width: ow, height: oh };
}

// Output pixel -> source pixel. Every pointer tool needs this, because with a
// crop or a flip in force the canvas the player is drawing on is no longer the
// buffer the strokes live in.
function spriteGeomToSource(g, width, height, x, y) {
  if (spriteGeomIsIdentity(g)) return { x, y };
  const r = spriteGeomRect(g, width, height);
  const s = g.scale || 1;
  const cx = x / s, cy = y / s;
  return { x: r.x + (g.flipH ? r.w - 1 - cx : cx), y: r.y + cy };
}

// --- Pure: the paint layer --------------------------------------------------
// The second overlay, and the reason there are two rather than one buffer is
// the reason the eraser and the matte sliders are kept apart: strokeMask says
// how opaque the ARTWORK is, `paint` is literal RGBA the player put there, and
// a paint tool that wrote into the base would make every slider drag destroy
// every brush mark as well as every erase.
//
// Deltas are sparse in the same shape the stroke mask uses, so a painted
// stroke costs its own footprint rather than a 1.5 MB snapshot.

function spritePaintDelta(paint, touched) {
  const n = touched.size;
  const indices = new Int32Array(n);
  const prev = new Uint8ClampedArray(n * 4);
  const next = new Uint8ClampedArray(n * 4);
  let k = 0;
  for (const [i, p] of touched) {
    indices[k] = i;
    const q = k * 4, o = i * 4;
    prev[q] = p[0]; prev[q + 1] = p[1]; prev[q + 2] = p[2]; prev[q + 3] = p[3];
    next[q] = paint[o]; next[q + 1] = paint[o + 1]; next[q + 2] = paint[o + 2]; next[q + 3] = paint[o + 3];
    k++;
  }
  return { indices, prev, next };
}

// One soft round stamp. `mode` is 'paint' (lay `rgb` down at `amount` alpha,
// 0-255) or 'clear' (take painted alpha back out at `amount` strength, 0-1),
// which is what lets the eraser reach the paint layer as well as the artwork.
// `touched` is a Map carried across a whole segment, so the undo entry holds
// the value from BEFORE the segment rather than from mid-segment.
function spriteStampPaint(paint, width, height, cx, cy, radius, hardness, amount, rgb, mode, touched) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const inner = radius * Math.max(0, Math.min(1, hardness));
  const clearing = mode === 'clear';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const t = d <= inner ? 1 : (radius === inner ? 1 : 1 - (d - inner) / (radius - inner));
      const i = y * width + x;
      const o = i * 4;
      const cur = paint[o + 3];
      let nr = paint[o], ng = paint[o + 1], nb = paint[o + 2], na;
      if (clearing) {
        if (cur === 0) continue;
        na = Math.min(cur, Math.round(cur * (1 - t * amount)));
        if (na === cur) continue;
      } else {
        // Within ONE stroke a stamp only ever pushes further, so overlapping
        // stamps along a slow drag do not build into a hard ridge.
        na = Math.max(cur, Math.round(amount * t));
        nr = rgb.r; ng = rgb.g; nb = rgb.b;
        if (na === cur && paint[o] === nr && paint[o + 1] === ng && paint[o + 2] === nb) continue;
      }
      if (!touched.has(i)) touched.set(i, [paint[o], paint[o + 1], paint[o + 2], paint[o + 3]]);
      paint[o] = nr; paint[o + 1] = ng; paint[o + 2] = nb; paint[o + 3] = na;
    }
  }
}

// Interpolate between two pointer samples. Same reason spriteStrokeSegment
// exists: a fast drag has to be a line, not a dotted trail.
function spritePaintSegment(paint, width, height, x0, y0, x1, y1, radius, hardness, amount, rgb, mode) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius * 0.25);
  const steps = Math.max(1, Math.ceil(dist / step));
  const touched = new Map();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    spriteStampPaint(paint, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t,
      radius, hardness, amount, rgb, mode, touched);
  }
  return spritePaintDelta(paint, touched);
}

// Take the paint straight back out under a list of indices — what magic-erase
// needs, since its footprint is a flood region rather than a brush path.
function spritePaintClearIndices(paint, indices) {
  const touched = new Map();
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k], o = i * 4;
    if (paint[o + 3] === 0) continue;
    touched.set(i, [paint[o], paint[o + 1], paint[o + 2], paint[o + 3]]);
    paint[o + 3] = 0;
  }
  return spritePaintDelta(paint, touched);
}

// Bucket fill, CONSTRAINED TO THE EXISTING ALPHA. It can recolour a shirt; it
// can never spill into the background, because a fill that could write a
// transparent pixel would silently undo the matte the player just cleaned —
// and would do it in one click, over the whole frame. The silhouette IS the
// boundary here, which also means no tolerance value can leak past it.
function spriteBucketFill(data, width, height, sx, sy, tolerance, paint, rgb, opacity, minAlpha) {
  const n = width * height;
  const touched = new Map();
  if (!(sx >= 0 && sy >= 0 && sx < width && sy < height)) return spritePaintDelta(paint, touched);
  const start = sy * width + sx;
  const floor = minAlpha != null ? minAlpha : 8;
  const so = start * 4;
  if (data[so + 3] <= floor) return spritePaintDelta(paint, touched);
  const sr = data[so], sg = data[so + 1], sb = data[so + 2];
  const tol = tolerance * tolerance * 3;
  const op = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
  const seen = new Uint8Array(n);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const o = i * 4;
    const a = data[o + 3];
    if (a <= floor) continue;
    const dr = data[o] - sr, dg = data[o + 1] - sg, db = data[o + 2] - sb;
    if (dr * dr + dg * dg + db * db > tol) continue;
    // The written alpha follows the artwork's own, so a filled region keeps
    // exactly the soft edge the matte gave it.
    const na = Math.max(paint[o + 3], Math.round(a * op));
    // A pixel that is already exactly this colour records nothing — otherwise
    // clicking the same region twice commits a second, empty history entry and
    // an undo appears to do nothing. Same rule the brush stamp follows. The
    // flood still walks THROUGH it, or a repeat fill would stop at its own
    // first pixel.
    if (paint[o] !== rgb.r || paint[o + 1] !== rgb.g || paint[o + 2] !== rgb.b || paint[o + 3] !== na) {
      if (!touched.has(i)) touched.set(i, [paint[o], paint[o + 1], paint[o + 2], paint[o + 3]]);
      paint[o] = rgb.r; paint[o + 1] = rgb.g; paint[o + 2] = rgb.b; paint[o + 3] = na;
    }
    const x = i % width, y = (i / width) | 0;
    if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < width - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - width]) { seen[i - width] = 1; stack.push(i - width); }
    if (y < height - 1 && !seen[i + width]) { seen[i + width] = 1; stack.push(i + width); }
  }
  return spritePaintDelta(paint, touched);
}

// The eyedropper. Reads the COMPOSITED pixel, which is the one the player is
// looking at — and because the paint layer sits on top of the adjustments
// rather than under them, a pick followed by a brush stroke lays down exactly
// the colour that was picked.
function spritePickColor(data, width, height, x, y) {
  const px = Math.round(x), py = Math.round(y);
  if (!(px >= 0 && py >= 0 && px < width && py < height)) return null;
  const o = (py * width + px) * 4;
  if (data[o + 3] === 0) return null;   // no colour to take from a hole
  return spriteRgbToHex(data[o], data[o + 1], data[o + 2]);
}

// A cheap histogram of the opaque pixels, quantised to five bits a channel, so
// "recolour her hair" starts by clicking the hair colour that is already there
// rather than by hunting for it in a picker.
function spriteDominantColors(data, width, height, max) {
  const buckets = new Map();
  const n = width * height;
  const step = n > 120000 ? 2 : 1;      // sample every other pixel on a big frame
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    if (data[o + 3] < 200) continue;
    const key = ((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3);
    const b = buckets.get(key);
    if (b) { b.n++; b.r += data[o]; b.g += data[o + 1]; b.b += data[o + 2]; }
    else buckets.set(key, { n: 1, r: data[o], g: data[o + 1], b: data[o + 2] });
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max || 8)
    .map((b) => spriteRgbToHex(b.r / b.n, b.g / b.n, b.b / b.n));
}

// --- The session ------------------------------------------------------------
// In memory only. ImageData cannot live in game state, and an editing session
// is not something a save should resurrect half-finished.

// `pristine` and `master` are DIFFERENT, and the distinction is load-bearing:
//
//   pristine  the file exactly as it arrived. Saved back as record.master, so
//             D6's recrop / reset / restore path stays a real door.
//   master    the EDITING source: pristine, with the background matted off if
//             the file had no alpha of its own.
//
// Without that split, opening an uploaded sprite for editing resurrects its
// white backdrop — the ingest matte silently undone, and the saved result an
// opaque rectangle again. Measured: a saved edit came back with corner alpha
// 255. The parametric base and the restore brush both read `master`, so
// "restore" brings back the original ARTWORK rather than the original
// BACKGROUND, which is what the word means to a player.
function spriteEditorNew(slot, masterData, width, height, tuning, bottomFrac) {
  const pristine = masterData;
  let master = masterData;
  if (spriteImageIsOpaque(masterData)) {
    master = new Uint8ClampedArray(masterData);
    spriteMatteFromBackground(master, width, height);
  }
  return {
    slot, width, height,
    pristine,
    master,
    strokeMask: new Int16Array(width * height),
    // The Phase 6 overlay. Alpha 0 everywhere means "the player has painted
    // nothing", which is why the composite can skip it entirely until they do.
    paint: new Uint8ClampedArray(width * height * 4),
    paintUsed: false,
    tuning: { ...CUTOUT_TUNING, ...(tuning || {}) },
    adjust: spriteAdjustDefaults(),
    geom: spriteGeomDefaults(),
    base: null, composite: null, working: null,
    openStroke: null,       // the drag in progress, if any (D20)
    outWidth: width, outHeight: height,
    history: [], historyIndex: -1,
    tool: 'flood',
    brush: { size: 24, hardness: 0.6, opacity: 1, color: '#c8a27a' },
    tolerance: 30,
    fillTolerance: 40,
    backdrop: 'checker',
    anchor: bottomFrac != null ? bottomFrac : null,
    bbox: null,
    dirty: false,
  };
}

// Rebuild base (from tuning) and working (base + strokes). Called after any
// change; cheap enough to run synchronously at 512x768.
function spriteEditorRecompose(ed) {
  const applied = spriteApplyTuning(ed.master, ed.width, ed.height, ed.tuning);
  ed.base = applied.data;
  ed.pruned = applied.pruned;
  // Stage two, also parametric: the colour adjustments, applied to the
  // ARTWORK — and to the master the restore brush pulls from, so a restored
  // pixel matches the neighbours it lands between instead of reverting to the
  // unadjusted original. Never to the paint layer, which is what makes an
  // eyedropper pick round-trip exactly through the brush.
  spriteAdjustBuffer(ed.base, ed.adjust);
  const master = spriteAdjustedMaster(ed);
  if (!ed.composite || ed.composite.length !== ed.base.length) {
    ed.composite = new Uint8ClampedArray(ed.base.length);
  }
  spriteCompositeStrokes(ed.base, master, ed.strokeMask, ed.composite,
    ed.paintUsed ? ed.paint : null);
  // Stage three: flip / scale / crop. At identity this hands back the very
  // same buffer, so the ordinary case costs nothing and `working` and
  // `composite` are the same array.
  const g = spriteGeomApply(ed.composite, ed.width, ed.height, ed.geom);
  ed.working = g.data;
  ed.outWidth = g.width;
  ed.outHeight = g.height;
  ed.bbox = cutoutBBox(ed.working, ed.outWidth, ed.outHeight, ed.tuning.bboxAlpha);
  return ed.working;
}

// The restore brush reads the master, so with a colour adjustment in force it
// needs an adjusted master. Memoised on the adjustment's own signature: this
// runs inside every recompose, and every stroke is a recompose.
function spriteAdjustedMaster(ed) {
  if (spriteAdjustIsIdentity(ed.adjust)) { ed._adjMaster = null; ed._adjSig = null; return ed.master; }
  const a = ed.adjust;
  const sig = `${a.hue}|${a.sat}|${a.light}|${a.brightness}|${a.contrast}|${a.tint}|${a.tintColor}`;
  if (ed._adjSig !== sig || !ed._adjMaster) {
    ed._adjMaster = new Uint8ClampedArray(ed.master);
    spriteAdjustBuffer(ed._adjMaster, a);
    ed._adjSig = sig;
  }
  return ed._adjMaster;
}

// D20 — a COMMIT is a completed stroke or a settled slider, never a
// mousemove. The caller decides when something is finished; this only records
// it. Truncates any redo branch, because a new action after an undo replaces
// the future rather than forking it.
function spriteEditorCommit(ed, entry) {
  ed.history.length = ed.historyIndex + 1;
  ed.history.push(entry);
  if (ed.history.length > SPRITE_EDIT_HISTORY_MAX) ed.history.shift();
  ed.historyIndex = ed.history.length - 1;
  ed.dirty = true;
  return entry;
}

function spriteEditorApplyStrokeDelta(ed, delta, direction) {
  // direction 'undo' restores prev values; 'redo' re-applies the new ones.
  const { indices, prev, next } = delta;
  for (let k = 0; k < indices.length; k++) {
    ed.strokeMask[indices[k]] = direction === 'undo' ? prev[k] : next[k];
  }
}

function spriteEditorApplyPaintDelta(ed, delta, direction) {
  const { indices } = delta;
  const src = direction === 'undo' ? delta.prev : delta.next;
  for (let k = 0; k < indices.length; k++) {
    const o = indices[k] * 4, q = k * 4;
    ed.paint[o] = src[q]; ed.paint[o + 1] = src[q + 1];
    ed.paint[o + 2] = src[q + 2]; ed.paint[o + 3] = src[q + 3];
  }
}

function spriteEditorCanUndo(ed) { return !!ed && ed.historyIndex >= 0; }
function spriteEditorCanRedo(ed) { return !!ed && ed.historyIndex < ed.history.length - 1; }

function spriteEditorUndo(ed) {
  if (!spriteEditorCanUndo(ed)) return false;
  const entry = ed.history[ed.historyIndex];
  spriteEditorRevertEntry(ed, entry, 'undo');
  ed.historyIndex--;
  spriteEditorRecompose(ed);
  return true;
}

function spriteEditorRedo(ed) {
  if (!spriteEditorCanRedo(ed)) return false;
  const entry = ed.history[ed.historyIndex + 1];
  spriteEditorRevertEntry(ed, entry, 'redo');
  ed.historyIndex++;
  spriteEditorRecompose(ed);
  return true;
}

function spriteEditorRevertEntry(ed, entry, direction) {
  switch (entry.kind) {
    case 'stroke':
      spriteEditorApplyStrokeDelta(ed, entry.delta, direction);
      // An erase stroke carries a second delta when it also took paint off.
      if (entry.paintDelta) spriteEditorApplyPaintDelta(ed, entry.paintDelta, direction);
      break;
    case 'paint':
      spriteEditorApplyPaintDelta(ed, entry.paintDelta, direction);
      break;
    case 'adjust':
      ed.adjust = { ...ed.adjust, ...(direction === 'undo' ? entry.before : entry.after) };
      break;
    case 'geom':
      ed.geom = { ...ed.geom, ...(direction === 'undo' ? entry.before : entry.after) };
      break;
    case 'tuning':
      ed.tuning = { ...ed.tuning, ...(direction === 'undo' ? entry.before : entry.after) };
      break;
    case 'anchor':
      ed.anchor = direction === 'undo' ? entry.before : entry.after;
      break;
    case 'reset':
      // A wholesale clear keeps the FULL prior mask, because that is the one
      // action whose delta is the entire buffer anyway. The paint copy is only
      // taken when there was paint to lose.
      ed.strokeMask = Int16Array.from(direction === 'undo' ? entry.before : entry.after);
      if (entry.beforePaint) {
        ed.paint = Uint8ClampedArray.from(direction === 'undo' ? entry.beforePaint : entry.afterPaint);
      }
      break;
    default: break;
  }
}

// --- The verbs the UI calls -------------------------------------------------

// The ONE-CALL form of a stroke: apply a segment and commit it on its own.
// The pointer path does not use this — a drag goes through
// spriteEditorStrokeOpen / ...Segment / ...Close so that a whole drag is one
// commit (D20). This stays because it is the shape a caller wants when there
// is no drag: a scripted stroke, and every assertion in verify-sprite-p5.js.
function spriteEditorStroke(ed, x0, y0, x1, y1) {
  const erase = ed.tool !== 'restore';
  const amount = erase ? -255 : 255;
  const d = spriteStrokeSegment(ed.strokeMask, ed.width, ed.height,
    x0, y0, x1, y1, ed.brush.size / 2, ed.brush.hardness, amount);
  // The eraser has to reach the PAINT as well (Phase 6). A player who draws
  // something and then rubs it out is asking for the mark to go, not for the
  // artwork's alpha to change under an untouched brush mark. Restore means the
  // same thing, more strongly: back to the original artwork.
  const pd = ed.paintUsed
    ? spritePaintSegment(ed.paint, ed.width, ed.height, x0, y0, x1, y1,
        ed.brush.size / 2, ed.brush.hardness, 1, null, 'clear')
    : null;
  const paintDelta = pd && pd.indices.length ? pd : null;
  if (d.indices.length === 0 && !paintDelta) return null;
  const next = new Int16Array(d.indices.length);
  for (let k = 0; k < d.indices.length; k++) next[k] = ed.strokeMask[d.indices[k]];
  const entry = spriteEditorCommit(ed, {
    kind: 'stroke', label: erase ? 'Erase' : 'Restore',
    delta: { indices: d.indices, prev: d.prev, next },
    paintDelta,
  });
  spriteEditorRecompose(ed);
  return entry;
}

function spriteEditorFlood(ed, x, y) {
  // Source space: with a crop or a flip in force `working` is a different
  // buffer with different dimensions, and the stroke mask is indexed here.
  const d = spriteFloodErase(ed.composite || ed.base, ed.width, ed.height,
    Math.round(x), Math.round(y), ed.tolerance, ed.strokeMask);
  const pd = ed.paintUsed ? spritePaintClearIndices(ed.paint, d.indices) : null;
  const paintDelta = pd && pd.indices.length ? pd : null;
  if (d.indices.length === 0 && !paintDelta) return null;
  const next = new Int16Array(d.indices.length).fill(-255);
  const entry = spriteEditorCommit(ed, {
    kind: 'stroke', label: 'Magic erase',
    delta: { indices: d.indices, prev: d.prev, next },
    paintDelta,
  });
  spriteEditorRecompose(ed);
  return entry;
}

function spriteEditorSetTuning(ed, patch) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = ed.tuning[k];
  ed.tuning = { ...ed.tuning, ...patch };
  spriteEditorRecompose(ed);
  return spriteEditorCommit(ed, { kind: 'tuning', label: 'Matte', before, after: { ...patch } });
}

function spriteEditorResetTuning(ed) {
  const patch = {};
  for (const k of Object.keys(CUTOUT_TUNING)) patch[k] = CUTOUT_TUNING[k];
  return spriteEditorSetTuning(ed, patch);
}

function spriteEditorResetStrokes(ed) {
  const before = Int16Array.from(ed.strokeMask);
  const beforePaint = ed.paintUsed ? Uint8ClampedArray.from(ed.paint) : null;
  ed.strokeMask = new Int16Array(ed.width * ed.height);
  if (beforePaint) ed.paint = new Uint8ClampedArray(ed.width * ed.height * 4);
  spriteEditorRecompose(ed);
  return spriteEditorCommit(ed, {
    kind: 'reset', label: 'Clear edits',
    before, after: new Int16Array(ed.width * ed.height),
    beforePaint,
    afterPaint: beforePaint ? new Uint8ClampedArray(ed.width * ed.height * 4) : null,
  });
}

function spriteEditorSetAnchor(ed, frac) {
  const before = ed.anchor;
  ed.anchor = Math.max(0, Math.min(0.5, frac));
  return spriteEditorCommit(ed, { kind: 'anchor', label: 'Floor anchor', before, after: ed.anchor });
}

// --- One DRAG is one commit (D20) -------------------------------------------
// A pointer drag arrives as dozens of pointermove events, and committing each
// one is what the code did before Phase 6. Measured live: three pointermoves,
// three history entries — so a three-second stroke at 60Hz would push roughly
// 180 entries and evict almost everything else in a stack that is 200 deep.
// D20 is explicit that "a commit is a completed stroke or a settled slider,
// not a mousemove", so the entry now stays OPEN while the pointer is down and
// every segment merges into it.
//
// Merging keeps the EARLIEST prev per pixel and the LATEST next — the same
// rule spriteStrokeSegment already applies within a single segment, extended
// across the whole drag.

function spriteEditorStrokeOpen(ed, tool) {
  const t = tool || ed.tool;
  ed.openStroke = {
    tool: t,
    label: t === 'brush' ? 'Brush' : (t === 'restore' ? 'Restore' : 'Erase'),
    mask: new Map(),    // index -> [prev, next]
    paint: new Map(),   // index -> [prevRGBA, nextRGBA]
  };
  return ed.openStroke;
}

function spriteMergeMaskDelta(map, d) {
  for (let k = 0; k < d.indices.length; k++) {
    const i = d.indices[k];
    const cur = map.get(i);
    if (cur) cur[1] = d.next[k];
    else map.set(i, [d.prev[k], d.next[k]]);
  }
}

function spriteMergePaintDelta(map, d) {
  for (let k = 0; k < d.indices.length; k++) {
    const i = d.indices[k], q = k * 4;
    const nx = [d.next[q], d.next[q + 1], d.next[q + 2], d.next[q + 3]];
    const cur = map.get(i);
    if (cur) cur[1] = nx;
    else map.set(i, [[d.prev[q], d.prev[q + 1], d.prev[q + 2], d.prev[q + 3]], nx]);
  }
}

// One segment of an open drag: the pixels move and the merge records them, but
// history does not grow. The recompose is still per segment, because that is
// what makes the stroke appear under the pointer as it is drawn.
function spriteEditorStrokeSegment(ed, x0, y0, x1, y1) {
  const s = ed.openStroke;
  if (!s) return null;
  const radius = ed.brush.size / 2;
  if (s.tool === 'brush') {
    const rgb = spriteHexToRgb(ed.brush.color);
    const alpha = Math.round(255 * (ed.brush.opacity != null ? ed.brush.opacity : 1));
    const d = spritePaintSegment(ed.paint, ed.width, ed.height, x0, y0, x1, y1,
      radius, ed.brush.hardness, alpha, rgb, 'paint');
    if (d.indices.length) { ed.paintUsed = true; spriteMergePaintDelta(s.paint, d); }
  } else {
    const amount = s.tool === 'restore' ? 255 : -255;
    const d = spriteStrokeSegment(ed.strokeMask, ed.width, ed.height, x0, y0, x1, y1,
      radius, ed.brush.hardness, amount);
    if (d.indices.length) {
      const next = new Int16Array(d.indices.length);
      for (let k = 0; k < d.indices.length; k++) next[k] = ed.strokeMask[d.indices[k]];
      spriteMergeMaskDelta(s.mask, { indices: d.indices, prev: d.prev, next });
    }
    if (ed.paintUsed) {
      const pd = spritePaintSegment(ed.paint, ed.width, ed.height, x0, y0, x1, y1,
        radius, ed.brush.hardness, 1, null, 'clear');
      if (pd.indices.length) spriteMergePaintDelta(s.paint, pd);
    }
  }
  spriteEditorRecompose(ed);
  return s;
}

// Close the drag: materialise the merged maps into ONE sparse entry. A drag
// that changed nothing commits nothing, the same rule a single stamp follows.
function spriteEditorStrokeClose(ed) {
  const s = ed && ed.openStroke;
  if (ed) ed.openStroke = null;
  if (!s || (!s.mask.size && !s.paint.size)) return null;
  const entry = { kind: s.tool === 'brush' ? 'paint' : 'stroke', label: s.label };
  if (entry.kind === 'stroke') {
    const n = s.mask.size;
    const indices = new Int32Array(n), prev = new Int16Array(n), next = new Int16Array(n);
    let k = 0;
    for (const [i, v] of s.mask) { indices[k] = i; prev[k] = v[0]; next[k] = v[1]; k++; }
    entry.delta = { indices, prev, next };
  }
  if (s.paint.size) {
    const n = s.paint.size;
    const indices = new Int32Array(n);
    const prev = new Uint8ClampedArray(n * 4), next = new Uint8ClampedArray(n * 4);
    let k = 0;
    for (const [i, v] of s.paint) {
      indices[k] = i;
      const q = k * 4;
      prev[q] = v[0][0]; prev[q + 1] = v[0][1]; prev[q + 2] = v[0][2]; prev[q + 3] = v[0][3];
      next[q] = v[1][0]; next[q + 1] = v[1][1]; next[q + 2] = v[1][2]; next[q + 3] = v[1][3];
      k++;
    }
    entry.paintDelta = { indices, prev, next };
  }
  return spriteEditorCommit(ed, entry);
}

// --- The verbs the drawing tools call (Phase 6) ------------------------------

// The one-call form of a brush stroke, same story as spriteEditorStroke above:
// the pointer path uses the open/segment/close drag session instead.
function spriteEditorPaint(ed, x0, y0, x1, y1) {
  const rgb = spriteHexToRgb(ed.brush.color);
  const alpha = Math.round(255 * (ed.brush.opacity != null ? ed.brush.opacity : 1));
  const d = spritePaintSegment(ed.paint, ed.width, ed.height, x0, y0, x1, y1,
    ed.brush.size / 2, ed.brush.hardness, alpha, rgb, 'paint');
  if (d.indices.length === 0) return null;
  ed.paintUsed = true;
  const entry = spriteEditorCommit(ed, { kind: 'paint', label: 'Brush', paintDelta: d });
  spriteEditorRecompose(ed);
  return entry;
}

function spriteEditorFill(ed, x, y) {
  const rgb = spriteHexToRgb(ed.brush.color);
  // The fill reads the SOURCE-space composite, never `working`: with a crop or
  // a flip in force those are different buffers, and the paint layer it writes
  // into is indexed in source space.
  const d = spriteBucketFill(ed.composite || ed.base, ed.width, ed.height,
    Math.round(x), Math.round(y), ed.fillTolerance, ed.paint, rgb, ed.brush.opacity);
  if (d.indices.length === 0) return null;
  ed.paintUsed = true;
  const entry = spriteEditorCommit(ed, { kind: 'paint', label: 'Fill', paintDelta: d });
  spriteEditorRecompose(ed);
  return entry;
}

// The eyedropper takes OUTPUT coordinates, because it reads the pixel the
// player can see. It commits nothing: picking a colour changes no pixel, and
// an undo stack full of colour picks would bury the drag the player wants back.
function spriteEditorPick(ed, x, y) {
  const hex = spritePickColor(ed.working, ed.outWidth || ed.width, ed.outHeight || ed.height, x, y);
  if (hex) ed.brush.color = hex;
  return hex;
}

function spriteEditorSetAdjust(ed, patch) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = ed.adjust[k];
  ed.adjust = { ...ed.adjust, ...patch };
  spriteEditorRecompose(ed);
  return spriteEditorCommit(ed, { kind: 'adjust', label: 'Colour', before, after: { ...patch } });
}

function spriteEditorResetAdjust(ed) {
  return spriteEditorSetAdjust(ed, spriteAdjustDefaults());
}

function spriteEditorSetGeom(ed, patch) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = ed.geom[k];
  ed.geom = { ...ed.geom, ...patch };
  spriteEditorRecompose(ed);
  return spriteEditorCommit(ed, { kind: 'geom', label: 'Frame', before, after: { ...patch } });
}

function spriteEditorFlip(ed) { return spriteEditorSetGeom(ed, { flipH: !ed.geom.flipH }); }

function spriteEditorSetScale(ed, scale) {
  return spriteEditorSetGeom(ed, { scale: Math.max(0.1, Math.min(4, scale)) });
}

function spriteEditorSetCrop(ed, rect) { return spriteEditorSetGeom(ed, { crop: rect || null }); }

// Crop to the artwork, measured in SOURCE space — the bbox on `ed.bbox` is in
// output space and would compound with a crop already in force.
function spriteEditorCropToArtwork(ed) {
  const box = cutoutBBox(ed.composite || ed.base, ed.width, ed.height, ed.tuning.bboxAlpha);
  if (!box) return null;
  return spriteEditorSetCrop(ed, { x: box.minX, y: box.minY, w: box.width, h: box.height });
}

function spriteEditorResetGeom(ed) { return spriteEditorSetGeom(ed, spriteGeomDefaults()); }

// The swatch row's colours. Computed once from the artwork and cached on the
// session: the panel is rebuilt on every tool click, and a fresh histogram of
// 393,216 pixels per click is a cost with nothing to show for it.
function spriteEditorSwatches(ed) {
  if (!ed._swatches) ed._swatches = spriteDominantColors(ed.base || ed.master, ed.width, ed.height, 8);
  return ed._swatches;
}

// The tuning the record should carry: only what actually DIFFERS from the
// shipped defaults. Storing the whole table would freeze this sprite against
// every future improvement to CUTOUT_TUNING, which is the opposite of what a
// per-slot override is for.
function spriteEditorTuningDiff(ed) {
  const diff = {};
  for (const k of Object.keys(ed.tuning)) {
    if (ed.tuning[k] !== CUTOUT_TUNING[k]) diff[k] = ed.tuning[k];
  }
  return Object.keys(diff).length ? diff : null;
}

// ===== /SECTION: SPRITE STUDIO EDITOR CORE ==================================

// --- Opening and saving -----------------------------------------------------
// The only DOM in the editor's logic half: a blob has to become an ImageData
// and back, and that needs a canvas.

async function spriteBlobToImageData(blob) {
  const bmp = await createImageBitmap(blob);
  const c = makeSpriteCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  return { data: ctx.getImageData(0, 0, bmp.width, bmp.height).data, width: bmp.width, height: bmp.height };
}

async function spriteImageDataToBlob(data, width, height) {
  const c = makeSpriteCanvas(width, height);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(width, height);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return canvasToBlob(c);
}

// Which pixels the editor edits FROM.
//
// For an override, that is `record.master` — D6's whole reason for existing.
// For a GENERATED sprite there is no separate master: the pixels in the cache
// have already been through cleanCutout and cropped to their bbox, and the
// pre-cleanup canvas was never stored. So the cleaned cutout becomes the
// master, and the tuning sliders re-run the pipeline over it.
//
// That is a second pass of a nearly-idempotent pipeline, not a compounding
// one: after the D17 knee the alpha channel is essentially 0-or-255, so
// re-levelling is a no-op and only genuine soft edges get decontaminated
// again. Asserted in verify-sprite-p5.js rather than assumed. The player's
// experience is the right one either way — moving a slider refines the
// residue that SURVIVED, which is exactly what they are looking at.
// `kind` defaults to 'cutout' (Phase 5/6's only case). Phase 7 opens this on
// an AVATAR too — the "Edit" button beside Recrop — which has no wildcard to
// fall through to and, when linked (D8), no blob of its own: it opens on
// whatever it currently resolves to (the live crop of the sprite), and saving
// PROMOTES the record to pinned (see spriteEditorSave) because a painted
// pixel is a real edit a linked record cannot carry.
async function spriteEditorOpen(gs, identity, variant, kind) {
  const k = kind === 'avatar' ? 'avatar' : 'cutout';
  const slot = spriteSlotId(identity, k, variant);
  const wild = k === 'cutout' ? spriteSlotId(identity, k, wildcardVariantOf(variant)) : null;
  const rec = (await getSpriteRecord(slot)) || (wild ? await getSpriteRecord(wild) : null);

  let sourceBlob = rec && (rec.master || rec.image);
  let bottomFrac = rec ? rec.bottomFrac : null;
  if (!sourceBlob) {
    const row = spriteStudioRoster(gs).find((r) => r.identity === identity);
    if (k === 'avatar') {
      const res = await resolveAvatar(identity, {
        who: row && row.who, isPlayer: row && row.isPlayer, generate: false,
      });
      sourceBlob = res.key ? await getCachedImage(res.key) : null;
    } else {
      const res = await resolveSprite(identity, 'cutout', variant, {
        who: row && row.who, isPlayer: row && row.isPlayer, generate: false,
      });
      sourceBlob = res.key ? await getCachedImage(res.key) : null;
    }
  }
  if (!sourceBlob) {
    return { ok: false, message: 'There is no art to edit yet — generate or upload one first.' };
  }
  const img = await spriteBlobToImageData(sourceBlob);
  spriteEditor = spriteEditorNew(rec ? rec.slot : slot, img.data, img.width, img.height,
    rec ? rec.tuning : null, bottomFrac);
  spriteEditorRecompose(spriteEditor);
  return { ok: true, editor: spriteEditor };
}

function spriteEditorClose() { spriteEditor = null; }

// Saving writes an override (origin 'edited'), which is what puts the
// player's work ahead of anything generated for good.
async function spriteEditorSave(gs, opts = {}) {
  const ed = spriteEditor;
  if (!ed) return { ok: false, message: 'Nothing is open.' };
  const parsed = parseSpriteSlotId(ed.slot);
  if (!parsed) return { ok: false, message: 'That sprite has a broken address.' };

  // The saved image is the FRAMED result — flip, scale and crop are baked in
  // here, because they describe the picture rather than the session. The
  // master stays the pristine source at its own dimensions (D6), so a later
  // recrop still has the whole original to work from.
  const outW = ed.outWidth || ed.width, outH = ed.outHeight || ed.height;
  const image = await spriteImageDataToBlob(ed.working, outW, outH);
  const master = await spriteImageDataToBlob(ed.pristine || ed.master, ed.width, ed.height);
  if (!image || !master) return { ok: false, message: 'That image could not be written.' };

  const bbox = ed.bbox;
  const scope = opts.scope === 'all' ? 'all' : 'exact';
  // D5's wildcard sweep is cutout-only (D5: "only the OUTFIT segment
  // wildcards") — an avatar's variant is always 'default'.
  const variant = parsed.kind === 'cutout' && scope === 'all' && !isWildcardVariant(parsed.variant)
    ? wildcardVariantOf(parsed.variant) : parsed.variant;

  // Saving a painted AVATAR promotes a linked record to pinned (D8) — it
  // arrives here through the exact same call a manual "Pin" makes, just with
  // real pixels instead of a copy of what was already showing.
  const res = await putSpriteRecord({
    slot: spriteSlotId(parsed.identity, parsed.kind, variant),
    origin: 'edited', mode: 'pinned',
    image, master,
    w: outW, h: outH,
    bbox,
    // D16: the floor anchor the player dragged wins; otherwise it is
    // re-measured from the pixels they just produced.
    bottomFrac: ed.anchor != null ? ed.anchor : cutoutBottomFrac(bbox, outH),
    tuning: spriteEditorTuningDiff(ed),
  });
  if (res.ok) {
    ed.dirty = false;
    if (typeof refreshAvatars === 'function') refreshAvatars(parsed.identity);
  }
  return res;
}

// --- UI handlers -----------------------------------------------------------
// Thin: resolve the target, call a verb above, re-render whichever surface
// the click came from. The verbs stay callable (and testable) without any of
// this.

function spriteStudioRerender(device) {
  if (device === 'phone' && typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  else if (typeof renderComputerScreen === 'function') renderComputerScreen(currentGameState);
}

function spriteStudioDeviceOf(ev) {
  const el = ev && ev.target && ev.target.closest ? ev.target.closest('[data-device]') : null;
  return (el && el.getAttribute('data-device')) || 'computer';
}

function doSpritesFilter(rowId, device) {
  const st = spriteStudioState(currentGameState);
  if (st) { st.filter = rowId || 'all'; st.notice = null; }
  spriteStudioRerender(device);
}

function doSpritesOpenCharacter(rowId, device) {
  const st = spriteStudioState(currentGameState);
  if (!st) return;
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!row) return;
  st.viewingId = row.id;
  st.viewingIdentity = row.identity;
  st.mode = 'character';
  st.editing = null;
  st.outfit = 'current';
  st.notice = null;
  switchScreen(currentGameState, 'sprites', 'character', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesOpenRoster(device) {
  const st = spriteStudioState(currentGameState);
  if (st) { st.mode = 'roster'; st.editing = null; st.notice = null; }
  switchScreen(currentGameState, 'sprites', 'roster', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesSelectCell(variant, device) {
  const st = spriteStudioState(currentGameState);
  if (st) { st.editing = st.editing === variant ? null : variant; st.notice = null; }
  spriteStudioRerender(device);
}

function doSpritesSetOutfit(rowId, device) {
  const st = spriteStudioState(currentGameState);
  if (st) { st.outfit = rowId || 'current'; st.editing = null; }
  spriteStudioRerender(device);
}

async function doSpritesRegenerate(variant, device) {
  const st = spriteStudioState(currentGameState);
  if (!st || !st.viewingIdentity) return;
  spriteStudioNotice(currentGameState, 'Generating…', 'info');
  spriteStudioRerender(device);
  const res = await doSpriteRegenerate(currentGameState, st.viewingIdentity, variant);
  spriteStudioNotice(currentGameState, res.ok ? 'Done.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

async function doSpritesRevert(variant, device) {
  const st = spriteStudioState(currentGameState);
  if (!st || !st.viewingIdentity) return;
  const slot = spriteSlotId(st.viewingIdentity, 'cutout', variant);
  const wild = spriteSlotId(st.viewingIdentity, 'cutout', wildcardVariantOf(variant));
  const target = spriteIndexEntry(slot) ? slot : wild;
  // D7's inverse: nothing the player made is thrown away without them saying
  // so. Generated art can be remade from its seed; an upload or a painted
  // edit cannot, so that case asks first.
  if (spriteRevertLosesWork(target) && typeof confirm === 'function') {
    if (!confirm('Delete this artwork? It was uploaded or painted, so it cannot be generated again.')) return;
  }
  const res = await doSpriteRevert(currentGameState, target);
  spriteStudioNotice(currentGameState, res.ok ? 'Reverted to generated art.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

async function doSpritesAvatarRegenerate(rowId, device) {
  const st = spriteStudioState(currentGameState);
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!st || !row) return;
  // Regenerating an avatar re-derives it from the sprite; it never touches
  // the sprite itself (D8). Dropping the derived cache entry is what makes it
  // pick up a changed crop or a changed sprite.
  invalidateSprite(row.identity);
  const res = await resolveAvatar(row.identity, { who: row.who, isPlayer: row.isPlayer, generate: true });
  spriteStudioNotice(currentGameState,
    res.url ? 'Avatar refreshed.' : 'There is no sprite to take an avatar from yet — generate one first.',
    res.url ? 'ok' : 'bad');
  if (typeof refreshAvatars === 'function') refreshAvatars(row.identity);
  spriteStudioRerender(device);
}

async function doSpritesAvatarLink(rowId, device) {
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!row) return;
  const res = await doSpriteAvatarLink(currentGameState, row.identity, {});
  spriteStudioNotice(currentGameState, res.ok ? 'Avatar follows the sprite again.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

async function doSpritesAvatarUnlink(rowId, device) {
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!row) return;
  const res = await doSpriteAvatarUnlink(currentGameState, row.identity);
  spriteStudioNotice(currentGameState, res.ok ? 'Avatar pinned — it no longer follows the sprite.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

// D5's widen/narrow, on whichever slot (exact or wildcard) currently answers.
async function doSpritesOverrideWiden(slot, device) {
  const res = await promoteSpriteOverride(slot);
  spriteStudioNotice(currentGameState, res.ok ? 'Now applies to every outfit of this pose.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

async function doSpritesOverrideNarrow(slot, device) {
  const parsed = parseSpriteSlotId(slot);
  const row = parsed && spriteStudioRoster(currentGameState).find((r) => r.identity === parsed.identity);
  const outfitToken = row ? cutoutOutfitToken(row.who) : null;
  const res = await demoteSpriteOverride(slot, outfitToken);
  spriteStudioNotice(currentGameState, res.ok ? 'Now applies to this outfit only.' : res.message, res.ok ? 'ok' : 'bad');
  spriteStudioRerender(device);
}

// --- Recrop UI handlers ------------------------------------------------------
// Computer-only (D16) — same reason as the paint editor: a precision drag
// needs a pointer and room for the size previews, and a simulated phone
// screen is a worse tool than no tool.

async function doSpritesAvatarRecrop(rowId, device) {
  const st = spriteStudioState(currentGameState);
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!st || !row) return;
  spriteStudioNotice(currentGameState, 'Opening…', 'info');
  spriteStudioRerender(device);
  const res = await spriteRecropOpen(currentGameState, row.identity);
  if (!res.ok) {
    spriteStudioNotice(currentGameState, res.message, 'bad');
    spriteStudioRerender(device);
    return;
  }
  st.viewingId = row.id;
  st.viewingIdentity = row.identity;
  st.mode = 'recrop';
  st.notice = null;
  switchScreen(currentGameState, 'sprites', 'recrop', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesRecropClose(device) {
  const st = spriteStudioState(currentGameState);
  const rc = spriteRecropState();
  if (rc && rc.dirty && typeof confirm === 'function') {
    if (!confirm('Close without saving? This crop will be lost.')) return;
  }
  spriteRecropClose();
  if (st) st.mode = 'character';
  switchScreen(currentGameState, 'sprites', 'character', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesRecropAuto(device) {
  if (!spriteRecropAuto()) {
    spriteStudioNotice(currentGameState, 'Could not detect a head in this pose.', 'bad');
  }
  spriteStudioRerender(device);
}

async function doSpritesRecropSource(variant, device) {
  spriteStudioNotice(currentGameState, 'Loading…', 'info');
  spriteStudioRerender(device);
  const res = await spriteRecropSetSource(currentGameState, variant);
  spriteStudioNotice(currentGameState, res.ok ? null : res.message, res.ok ? 'info' : 'bad');
  spriteStudioRerender(device);
}

async function doSpritesRecropSave(device) {
  const res = await spriteRecropSave(currentGameState);
  spriteStudioNotice(currentGameState, res.ok ? 'Saved. This crop follows the sprite.' : res.message, res.ok ? 'ok' : 'bad');
  if (res.ok) {
    const st = spriteStudioState(currentGameState);
    spriteRecropClose();
    if (st) st.mode = 'character';
    switchScreen(currentGameState, 'sprites', 'character', undefined, device === 'phone' ? 'phone' : undefined);
  }
  spriteStudioRerender(device);
}

// --- Editor UI handlers ------------------------------------------------------

async function doSpritesEdit(variant, device) {
  const st = spriteStudioState(currentGameState);
  if (!st || !st.viewingIdentity) return;
  spriteStudioNotice(currentGameState, 'Opening…', 'info');
  spriteStudioRerender(device);
  const res = await spriteEditorOpen(currentGameState, st.viewingIdentity, variant);
  if (!res.ok) {
    spriteStudioNotice(currentGameState, res.message, 'bad');
    spriteStudioRerender(device);
    return;
  }
  st.mode = 'editor';
  st.editing = variant;
  st.notice = null;
  switchScreen(currentGameState, 'sprites', 'editor', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

// Computer-only (D16), same as sprites.edit — precision painting needs a
// pointer and room for the panels.
async function doSpritesAvatarEdit(rowId, device) {
  const st = spriteStudioState(currentGameState);
  const row = spriteStudioRoster(currentGameState).find((r) => r.id === rowId);
  if (!st || !row) return;
  spriteStudioNotice(currentGameState, 'Opening…', 'info');
  spriteStudioRerender(device);
  const res = await spriteEditorOpen(currentGameState, row.identity, SPRITE_AVATAR_VARIANT, 'avatar');
  if (!res.ok) {
    spriteStudioNotice(currentGameState, res.message, 'bad');
    spriteStudioRerender(device);
    return;
  }
  st.viewingId = row.id;
  st.viewingIdentity = row.identity;
  st.mode = 'editor';
  st.editing = SPRITE_AVATAR_VARIANT;
  st.notice = null;
  switchScreen(currentGameState, 'sprites', 'editor', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesEditorClose(device) {
  const st = spriteStudioState(currentGameState);
  const ed = spriteEditorState();
  if (ed && ed.dirty && typeof confirm === 'function') {
    if (!confirm('Close without saving? Your edits to this sprite will be lost.')) return;
  }
  spriteEditorClose();
  if (st) st.mode = 'character';
  switchScreen(currentGameState, 'sprites', 'character', undefined, device === 'phone' ? 'phone' : undefined);
  spriteStudioRerender(device);
}

function doSpritesEditorTool(tool, device) {
  const ed = spriteEditorState();
  if (ed) ed.tool = tool;
  spriteStudioRerender(device);
}

function doSpritesEditorBackdrop(backdrop, device) {
  const ed = spriteEditorState();
  if (ed) ed.backdrop = backdrop;
  spriteStudioRerender(device);
}

function doSpritesEditorUndo(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorUndo(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorRedo(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorRedo(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorResetTuning(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorResetTuning(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorResetStrokes(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorResetStrokes(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorAutoTrim(device) {
  const ed = spriteEditorState();
  if (!ed || !ed.bbox) return;
  // Auto-trim does not crop the buffer — it re-reads the floor anchor from
  // the pixels as they now stand. The CROP happens at save time, where the
  // bbox is recorded; cropping here would invalidate every history delta,
  // whose indices are relative to this buffer.
  spriteEditorSetAnchor(ed, cutoutBottomFrac(ed.bbox, ed.height));
  spriteStudioNotice(currentGameState, 'Floor anchor re-measured from the artwork.', 'ok');
  spriteStudioRerender(device);
}

function doSpritesEditorSwatch(hex, device) {
  const ed = spriteEditorState();
  if (ed && hex) ed.brush.color = hex;
  spriteStudioRerender(device);
}

function doSpritesEditorFlip(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorFlip(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorResetAdjust(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorResetAdjust(ed);
  spriteStudioRerender(device);
}

function doSpritesEditorCropArtwork(device) {
  const ed = spriteEditorState();
  if (!ed) return;
  if (!spriteEditorCropToArtwork(ed)) {
    spriteStudioNotice(currentGameState, 'There is nothing opaque left to crop to.', 'bad');
  }
  spriteStudioRerender(device);
}

function doSpritesEditorResetFrame(device) {
  const ed = spriteEditorState();
  if (ed) spriteEditorResetGeom(ed);
  spriteStudioRerender(device);
}

async function doSpritesEditorSave(device) {
  const res = await spriteEditorSave(currentGameState, { scope: 'exact' });
  spriteStudioNotice(currentGameState, res.ok ? 'Saved. This sprite is yours now.' : res.message, res.ok ? 'ok' : 'bad');
  if (res.ok) {
    const st = spriteStudioState(currentGameState);
    spriteEditorClose();
    if (st) st.mode = 'character';
    switchScreen(currentGameState, 'sprites', 'character', undefined, device === 'phone' ? 'phone' : undefined);
  }
  spriteStudioRerender(device);
}

// --- Upload plumbing -------------------------------------------------------
// One hidden <input type="file">, the same pattern the save importer uses
// (index.html + ui.js's import flow). The pending target says what the next
// file that arrives is FOR, because the input itself carries no context.
let spriteUploadTarget = null;

function doSpritesUpload(kind, variant, device) {
  const st = spriteStudioState(currentGameState);
  if (!st || !st.viewingIdentity) return;
  const input = document.getElementById('sprite-upload-input');
  if (!input) return;
  spriteUploadTarget = { kind, variant, identity: st.viewingIdentity, device };
  input.value = ''; // so re-picking the same file still fires a change event
  input.click();
}

async function handleSpriteUploadFile(file) {
  const target = spriteUploadTarget;
  spriteUploadTarget = null;
  if (!target || !file) return;
  spriteStudioNotice(currentGameState, 'Reading image…', 'info');
  spriteStudioRerender(target.device);

  const ingested = await ingestSpriteUpload(file, { kind: target.kind });
  if (!ingested.ok) {
    spriteStudioNotice(currentGameState, ingested.message, 'bad');
    spriteStudioRerender(target.device);
    return;
  }
  // D5's default: an upload describes the CHARACTER, so it applies to every
  // outfit of that pose and expression unless the player narrows it. An edit
  // defaults the other way (Phase 5).
  const res = await saveSpriteUpload(currentGameState, target.identity, target.variant, ingested, {
    kind: target.kind,
    scope: target.kind === 'avatar' ? 'exact' : 'all',
    origin: 'uploaded',
  });
  spriteStudioNotice(currentGameState,
    res.ok
      ? (target.kind === 'avatar' ? 'Avatar uploaded and pinned.' : 'Sprite uploaded — it applies to every outfit of this pose.')
      : res.message,
    res.ok ? 'ok' : 'bad');
  spriteStudioRerender(target.device);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('sprite-upload-input');
    if (input) {
      input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleSpriteUploadFile(file);
      });
    }
  });
}

// ===== /SECTION: SPRITE STUDIO =====
