// ===== SECTION: IMAGE =====
// Scene composition, generateImage call, canvas→Blob caching, URL management.
// Placeholder shown immediately, swap async. No state writes (uses STATE adapter).
// (Apartment Expansion v2 — Mirrored H)

// Track active object URLs for cleanup
const activeImageUrls = new Map(); // sceneKey → objectURL

// --- Scene key composition ---
function composeSceneKey(roomId, phase, lighting, npcIds) {
  const npcPart = npcIds && npcIds.length > 0 ? npcIds.slice().sort().join('-') : 'empty';
  return `${roomId}_${phase}_${lighting || 'normal'}_${npcPart}`;
}

function composeCharKey(npc, expression, pose) {
  return `char_${npc.bible.genSeed}_${expression || 'neutral'}_${pose || 'standing'}`;
}

// --- Lighting from phase ---
function phaseLighting(phase) {
  switch (phase) {
    case 'early_morning': return 'soft blue dawn light';
    case 'morning': return 'bright morning light';
    case 'midday': return 'bright daylight';
    case 'afternoon': return 'warm afternoon light';
    case 'evening': return 'warm golden hour light through windows';
    case 'night': return 'dim warm lamp light, dark outside';
    default: return 'neutral indoor lighting';
  }
}

// --- Build image prompt ---
// `roomObjects` (optional, WORLD's bucket for this room) drives the
// room-specific detail sentence from each object def's imagePhrase — real
// furniture the player can act on, instead of a fixed per-roomType string
// that never reflected what was actually there. Falls back to the old
// generic phrasing when objects aren't available (e.g. a caller that
// hasn't loaded WORLD state), so this stays non-breaking.
function buildImagePrompt(roomId, phase, activeNpcs, roomObjects) {
  const room = ROOMS[roomId];
  const roomName = String(room?.name || roomId);
  const roomType = room?.type || 'common';
  const light = phaseLighting(phase);

  let prompt = `Interior of a ${roomType === 'bedroom' ? 'cozy bedroom' : roomName.toLowerCase()} in a shared apartment, ${light}. `;
  prompt += roomObjectsPhrase(roomObjects) || fallbackRoomPhrase(roomId, roomType);

  // Character layers
  if (activeNpcs && activeNpcs.length > 0) {
    for (const npc of activeNpcs) {
      const v = (typeof getPhysicalDescriptionForPrompt === 'function' ? getPhysicalDescriptionForPrompt(npc) : null) || npc.bible.visual || 'a person';  // NPC Overhaul Phase 1
      const expr = npc.activity ? `, ${npc.activity}` : '';
      prompt += `${v}${expr}. `;
    }
  }

  prompt += 'Anime-inspired illustration style, warm tones, detailed background, slice-of-life atmosphere.';
  return prompt;
}

function roomObjectsPhrase(roomObjects) {
  if (!roomObjects) return null;
  const phrases = Object.values(roomObjects)
    .map(obj => OBJECT_DEFS[obj.defId]?.imagePhrase)
    .filter(Boolean);
  return phrases.length > 0 ? `${phrases.join(', ')}. ` : null;
}

// Only reached when no WORLD object bucket was passed in — kept as a
// fallback so this function never regresses to producing an empty prompt.
function fallbackRoomPhrase(roomId, roomType) {
  if (roomType === 'bedroom') return 'Single bed, desk, wardrobe, personal items. ';
  if (roomId === 'kitchen') return 'Counters, stove, fridge, small table. Dishes, mugs. ';
  if (roomId === 'living_room') return 'Sofa, coffee table, TV, bookshelf. Lived-in but comfortable. ';
  if (roomId === 'bathroom_a' || roomId === 'bathroom_b') return 'Sink, mirror, shower. Tiles, towels. ';
  if (roomId === 'hallway_a' || roomId === 'hallway_b') return 'A narrow hallway with coat rack. ';
  if (roomId === 'dining') return 'A large dining table with chairs. ';
  if (roomId === 'entry') return 'A front door, doormat, shoe rack. ';
  if (roomId === 'game_room') return 'Pool table, game console, dartboard. ';
  if (roomId === 'gym') return 'Treadmill, weights, yoga mat. ';
  if (roomId === 'pool_room') return 'An indoor swimming pool, loungers, tiled surround. ';
  if (roomId === 'study') return 'A desk, bookshelves, armchair. ';
  if (roomId === 'balcony') return 'Bistro table, potted plants, city view. ';
  if (roomId === 'laundry') return 'Washer, dryer, hamper. ';
  return '';
}

function buildCharacterPrompt(npc, expression, pose) {
  const v = (typeof getPhysicalDescriptionForPrompt === 'function' ? getPhysicalDescriptionForPrompt(npc) : null) || npc.bible.visual || 'a young adult';  // NPC Overhaul Phase 1
  return `${v}, ${expression || 'neutral expression'}, ${pose || 'standing casually'}, anime-inspired illustration style, full body, clean background, character sheet pose, warm lighting.`;
}

// --- Generate or retrieve cached background ---
async function getSceneImage(roomId, phase, activeNpcs, roomObjects) {
  const sceneKey = composeSceneKey(roomId, phase, 'normal', activeNpcs?.map(n => n.id) || []);

  // Check cache
  const cached = await getCachedImage(sceneKey);
  if (cached) {
    return { url: createObjectUrl(sceneKey, cached), cached: true };
  }

  // Generate new
  try {
    const prompt = buildImagePrompt(roomId, phase, activeNpcs, roomObjects);
    const result = await root.generateImage(prompt, {
      resolution: IMAGE_CACHE.resolutions.bg,
      negativePrompt: 'blurry, distorted, extra limbs, low quality',
    });

    // Convert canvas to blob
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(sceneKey, blob);

    return { url: createObjectUrl(sceneKey, blob), cached: false };
  } catch (e) {
    console.warn('Image generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// --- Generate character image ---
async function getCharacterImage(npc, expression, pose) {
  const charKey = composeCharKey(npc, expression, pose);

  const cached = await getCachedImage(charKey);
  if (cached) {
    return { url: createObjectUrl(charKey, cached), cached: true };
  }

  try {
    const prompt = buildCharacterPrompt(npc, expression, pose);
    const result = await root.generateImage(prompt, {
      resolution: IMAGE_CACHE.resolutions.char,
      seed: npc.bible.genSeed,
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
    });

    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(charKey, blob);

    return { url: createObjectUrl(charKey, blob), cached: false };
  } catch (e) {
    console.warn('Character image generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// --- Canvas to Blob ---
function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas) {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

// --- Object URL management ---
function createObjectUrl(key, blob) {
  if (!blob) return null;
  // Revoke old URL for this key if exists
  if (activeImageUrls.has(key)) {
    URL.revokeObjectURL(activeImageUrls.get(key));
  }
  const url = URL.createObjectURL(blob);
  activeImageUrls.set(key, url);
  return url;
}

// Revoke all URLs for scene keys that are no longer active
function cleanupImageUrls(keepKeys) {
  for (const [key, url] of activeImageUrls) {
    if (!keepKeys.includes(key)) {
      URL.revokeObjectURL(url);
      activeImageUrls.delete(key);
    }
  }
}

// --- Camera (BrineOS Phase 8) ---
// A photo record is deliberately NOT the rendered blob (landmine L10): the
// image cache (IMAGE_CACHE) is a shared LRU that can evict a photo's pixels
// at any time regardless of how few photos the player has taken — evicting
// a "memory" the player is holding onto would be a narrative-correctness
// bug, not just a cache miss. Instead a photo freezes what it takes to
// reproduce the exact same image on demand: the prompt text (built once,
// at capture time, from that moment's room/NPCs — NOT rebuilt later from
// current state, so a photo still looks like the room did when it was
// taken even after the room changes) and a seed (root.generateImage
// reproduces the same image for the same seed, the same contract
// getCharacterImage already relies on for NPC portraits).

// Take a photo of the room the player is currently in. Returns the new
// record; mutates world.phone.camera.roll (caller saves).
function takePhoto(gameState, tags) {
  const roomId = gameState.player.location;
  const roomObjects = gameState.objects?.[`room_${roomId}`] || {};
  const subjectNpcIds = getPresentNpcIds(gameState.npcs, roomId);
  const activeNpcs = subjectNpcIds.map(id => gameState.npcs[id]).filter(Boolean);
  const phase = getPhase(gameState.meta.clock.minutes);
  const day = gameState.meta.clock.day;
  const tick = getTickIndex(gameState.meta.clock.minutes);

  const roll = gameState.world.phone.camera.roll;
  const slot = roll.length;
  // Seeded, never Date.now() — the same (save seed, day, tick, slot) tuple
  // always names the same photo, matching genObjectId's (world.js) pattern.
  const id = `photo_${hashStr(`${gameState.meta.seed}|camera|${day}|${tick}|${slot}`).toString(36)}`;
  const seed = hashStr(`${gameState.meta.seed}|photo_seed|${id}`);

  const prompt = buildImagePrompt(roomId, phase, activeNpcs, roomObjects)
    + ' Candid smartphone photo, casual snapshot framing, slightly imperfect composition.';

  const photo = {
    id, day, tick, roomId, subjectNpcIds,
    caption: `${ROOMS[roomId]?.name || roomId}, Day ${day}`,
    prompt, seed, tags: tags || [],
  };
  roll.unshift(photo); // newest first
  if (roll.length > CAMERA.rollCap) roll.length = CAMERA.rollCap; // 8.2: oldest evicted
  return photo;
}

// Regenerate (or fetch from cache) the image for a photo record. Keyed by
// the photo's own id, not by room/phase/npc composition — two photos of
// the same room a day apart must stay visually distinct and individually
// addressable, unlike getSceneImage's shared "current state of this room"
// cache key.
async function getPhotoImage(photo) {
  const photoKey = `photo_${photo.id}`;
  const cached = await getCachedImage(photoKey);
  if (cached) return { url: createObjectUrl(photoKey, cached), cached: true };
  try {
    const result = await root.generateImage(photo.prompt, {
      resolution: IMAGE_CACHE.resolutions.bg,
      seed: photo.seed,
      negativePrompt: 'blurry, distorted, extra limbs, low quality',
    });
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(photoKey, blob);
    return { url: createObjectUrl(photoKey, blob), cached: false };
  } catch (e) {
    console.warn('Photo generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// --- Placeholder ---
function getPlaceholder() {
  // Inline SVG placeholder
  return 'data:image/svg+xml;base64,' + btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="0 0 768 512">
      <rect width="768" height="512" fill="#2a2a4a"/>
      <text x="384" y="256" font-family="sans-serif" font-size="24" fill="#5a5a7c" text-anchor="middle" dominant-baseline="middle">Loading scene...</text>
    </svg>`
  );
}

// ===== MENU TITLE GALLERY (Phase 10) =====
// The boot-menu slideshow — the reference games' component
// (src/ref/structural/perchance-menu-conventions.md §3.4–3.8) adapted onto this game's
// image pipeline. Two absolutely-positioned <img> layers crossfade on an
// 8 s cycle; a `generating` boolean keeps exactly one generation in flight;
// the auto-cycle tick that finds no next image calls the generator WITHOUT
// advancing the index, so the current slide simply stays up.
//
// Three deliberate deviations from the reference:
//  - Caching: images live in the shared LRU (kv.images, capped) under a
//    `menu_<gen>_<rating>_<orient>_<ts>_<rand>` key, and a bounded ring of those keys is
//    persisted in kv.menu so the art survives reloads without a second
//    copy. The menu deletes its evicted keys itself (state.deleteCachedImage)
//    so its generation can never churn the LRU against scene images.
//    The reference stores 30 full multi-MB data-URLs in a kv folder.
//  - Failure: bounded retries with exponential backoff, then a quiet
//    "background art unavailable" line and the gradient — never the
//    reference's uncapped 500 ms retry loop.
//  - Gating: every generated key carries the rating cap it was drawn under
//    (defs.menu's menuRatingCap), and both the persisted ring and the
//    in-memory session buffer are filtered to the current cap on open, so
//    a restricted save never shows art from a looser mix.

const titleGallery = {
  images: [],        // { key, url } session buffer (newest last)
  idx: 0,
  autoTimer: null,
  genTimer: null,    // the forever-generation pacer (see scheduleNextGeneration)
  hydrateTimer: null,// background rehydration of the session buffer from the ring
  generating: false,
  retries: 0,
  contentConfig: null,
  ring: [],          // persisted menu_* cache keys (newest last)
};

// Every menu timer in one place. The gallery owns three (cycle, generation
// pacer, rehydrator) and all three must die when the menu closes — a pacer
// that outlives the menu keeps generating images nobody is looking at, which
// is exactly the uncapped-work failure deviation 3 exists to prevent.
function stopMenuGalleryTimers() {
  for (const k of ['autoTimer', 'genTimer', 'hydrateTimer']) {
    if (titleGallery[k]) { clearTimeout(titleGallery[k]); clearInterval(titleGallery[k]); titleGallery[k] = null; }
  }
}

// The menu is open and background art is on — i.e. generation is allowed to
// keep running. Checked before every paced generation so closing the menu
// (or toggling the option off) ends the loop at the next tick.
function menuGalleryActive() {
  const menu = document.getElementById('main-menu');
  return !!menu && !menu.hidden;
}

// Forever generation (paced). Below bufferTarget we fill fast so the
// slideshow can start cycling; after that we produce one image every
// steadyGenMs indefinitely, and rememberMenuGalleryImage prunes the ring's
// own oldest beyond maxPersistedImages. The pool stays at its cap and stays
// fresh, instead of freezing at the first three images ever generated.
function scheduleNextGeneration() {
  if (titleGallery.genTimer) { clearTimeout(titleGallery.genTimer); titleGallery.genTimer = null; }
  if (!menuGalleryActive()) return;
  const fast = titleGallery.images.length < MENU_SLIDESHOW.bufferTarget;
  const delay = fast ? MENU_SLIDESHOW.fastFillMs : MENU_SLIDESHOW.steadyGenMs;
  titleGallery.genTimer = setTimeout(() => {
    titleGallery.genTimer = null;
    genNextTitleImg();
  }, delay);
}

const MENU_GALLERY_KV_FOLDER = 'menu';
const MENU_GALLERY_RING_KEY = 'ring';
const MENU_GALLERY_OPTIONS_KEY = 'options';

// Cache-key generation token. Bump this whenever a change makes previously
// STORED pixels wrong — not merely different. Everything from an older
// generation is purged on the next menu open rather than displayed.
//
// g2: the pre-crop purge. Until the crop step was removed, every image was
// centre-cropped to the viewport's aspect (clamped to a 3.2 maximum) BEFORE
// being cached, so a wide window baked a 3.2:1 letterbox strip into the
// stored pixels permanently. Shown honestly with object-fit: contain, those
// strips render as a thin band across the middle of the screen with the
// subject's head and legs already missing — there is nothing to fit, the
// content is simply gone. They cannot be repaired, only replaced.
const MENU_GALLERY_GENERATION = 'g2';

function menuGalleryKeyPrefix(rating) {
  return `menu_${MENU_GALLERY_GENERATION}_${rating}_`;
}

// A key from the current generation. Anything else — including every
// pre-token key, which is by definition pre-crop-removal — is stale.
function isCurrentGenerationKey(key) {
  return typeof key === 'string' && key.startsWith(`menu_${MENU_GALLERY_GENERATION}_`);
}

function menuGalleryKeyRating(key) {
  const m = /^menu_g\d+_(sfw|suggestive|explicit)_/.exec(key || '');
  return m ? m[1] : 'explicit'; // unknown/legacy keys assumed permissive
}

function genMenuGalleryKey(rating) {
  const o = titleGallery.orientation === 'portrait' ? 'p' : 'l';
  return `${menuGalleryKeyPrefix(rating)}${o}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function menuGalleryKeyOrientation(key) {
  const m = /^menu_g\d+_(sfw|suggestive|explicit)_(l|p)_/.exec(key || '');
  return m ? m[2] : null;
}

function keyMatchesOrientation(key, orientation) {
  const ko = menuGalleryKeyOrientation(key);
  if (ko) return ko === (orientation === 'portrait' ? 'p' : 'l');
  return orientation !== 'portrait';
}

// --- Viewport-orientation-aware generation. The plugin is asked for the
// resolution matching the viewport's orientation and the prompt carries a
// composition hint, so the generated frame is already close to the shape it
// will be shown in and the letterbox bars stay small.
//
// The image is NEVER cropped or stretched. It is displayed with
// object-fit: contain, so the whole frame is always visible and any leftover
// space becomes a bar showing the .title-bg-layer gradient — the same
// gradient that IS the design when no image exists at all.
//
// This replaced a centre-crop-to-viewport-aspect step that ran BEFORE the
// blob was cached. That was the worse half of the problem: the crop was
// baked into the stored image permanently, so pixels were gone for good and
// a window resize (or the same pool viewed on another device) could never
// recover them. Cropping, if it ever comes back, belongs in CSS at display
// time — never on the way into the cache. ---
function menuViewportOrientation() {
  return innerWidth >= innerHeight ? 'landscape' : 'portrait';
}

function menuContentConfig() {
  return (currentGameState && currentGameState.meta && currentGameState.meta.contentConfig) || CONTENT_CONFIG;
}

async function loadMenuGalleryRing() {
  try {
    const ring = await root.kv.menu.get(MENU_GALLERY_RING_KEY);
    titleGallery.ring = Array.isArray(ring) ? ring : [];
  } catch (e) {
    titleGallery.ring = [];
  }
  await purgeStaleGenerationImages();
  return titleGallery.ring;
}

// Drop — and hard-delete — every ring entry from an older key generation.
// These are not merely differently-shaped images that a better fit could
// rescue; their pixels were destructively cropped before storage, so the
// only correct handling is to evict them and regenerate. Runs on every ring
// load, so a player who never clears their cache still self-heals on the
// next menu open; a no-op once the pool has turned over.
//
// Deliberately deletes from the image cache too, not just the ring: leaving
// the blobs behind would keep occupying the menu's LRU share with pixels
// nothing can ever display again.
async function purgeStaleGenerationImages() {
  const stale = titleGallery.ring.filter(k => !isCurrentGenerationKey(k));
  if (stale.length === 0) return 0;
  titleGallery.ring = titleGallery.ring.filter(isCurrentGenerationKey);
  await saveMenuGalleryRing();
  for (const k of stale) {
    try { await deleteCachedImage(k); } catch (e) {}
  }
  console.debug(`Menu gallery: purged ${stale.length} pre-${MENU_GALLERY_GENERATION} image(s).`);
  return stale.length;
}

async function saveMenuGalleryRing() {
  try {
    await root.kv.menu.set(MENU_GALLERY_RING_KEY, titleGallery.ring);
  } catch (e) { /* ring is a cache; a failed write costs nothing */ }
}

// Persist a newly generated menu image key, enforcing the menu's share cap
// of the LRU: the oldest key beyond maxPersistedImages is deleted from the
// cache outright (not just dropped from the ring), so the menu's footprint
// is bounded no matter how long the slideshow runs.
async function rememberMenuGalleryImage(key) {
  titleGallery.ring = titleGallery.ring.filter(k => k !== key);
  titleGallery.ring.push(key);
  const max = MENU_SLIDESHOW.maxPersistedImages;
  let evict = [];
  if (titleGallery.ring.length > max) {
    evict = titleGallery.ring.slice(0, titleGallery.ring.length - max);
    titleGallery.ring = titleGallery.ring.slice(titleGallery.ring.length - max);
  }
  await saveMenuGalleryRing();
  for (const k of evict) {
    try { await deleteCachedImage(k); } catch (e) {}
  }
}

function pushMenuGalleryImage(img) {
  titleGallery.images.push(img);
  const max = MENU_SLIDESHOW.maxSessionImages;
  if (titleGallery.images.length > max) {
    titleGallery.images.splice(0, titleGallery.images.length - max);
  }
  if (titleGallery.idx >= titleGallery.images.length) {
    titleGallery.idx = Math.max(0, titleGallery.images.length - 1);
  }
}

// --- Slideshow DOM helpers (the menu owns this markup) ---
function setMenuCounter(i, n) {
  const el = document.getElementById('titleCounter');
  if (!el) return;
  el.textContent = n > 0 ? `${i} / ${n}` : '…';
}
function setMenuPrevNextDisabled(disabled) {
  const prev = document.getElementById('titlePrevBtn');
  const next = document.getElementById('titleNextBtn');
  if (prev) prev.disabled = disabled;
  if (next) next.disabled = disabled;
}
function showMenuLoading(msg) {
  const el = document.getElementById('menuLoading');
  if (!el) return;
  el.textContent = msg || 'Generating background art…';
  el.hidden = false;
}
function hideMenuLoading() {
  const el = document.getElementById('menuLoading');
  if (el) { el.textContent = ''; el.hidden = true; }
}
function showMenuUnavailable() {
  const el = document.getElementById('menuUnavailable');
  if (el) el.hidden = false;
}
function hideMenuUnavailable() {
  const el = document.getElementById('menuUnavailable');
  if (el) el.hidden = true;
}

// Two-layer crossfade: set the hidden layer's src (and await its decode)
// BEFORE the class flip, so an undecoded image never flashes in.
async function showTitleImg(i) {
  const imgA = document.getElementById('titleBgImgA');
  const imgB = document.getElementById('titleBgImgB');
  if (!imgA || !imgB || titleGallery.images.length === 0) return;
  if (i < 0) i = 0;
  if (i >= titleGallery.images.length) i = titleGallery.images.length - 1;
  titleGallery.idx = i;
  const visible = imgA.classList.contains('visible') ? imgA : imgB;
  const hidden = visible === imgA ? imgB : imgA;
  hidden.src = titleGallery.images[i].url;
  await hidden.decode().catch(() => {});
  hidden.classList.add('visible');
  visible.classList.remove('visible');
  setMenuCounter(i + 1, titleGallery.images.length);
}

function startTitleAutoCycle() {
  if (titleGallery.autoTimer) { clearInterval(titleGallery.autoTimer); titleGallery.autoTimer = null; }
  titleGallery.autoTimer = setInterval(() => {
    // Wrap rather than stall at the end: with a pool of up to
    // maxPersistedImages there is a real back catalogue to cycle through,
    // and the paced generator (scheduleNextGeneration) is already topping it
    // up in the background — the cycle no longer has to drive generation.
    if (titleGallery.images.length === 0) return;
    showTitleImg((titleGallery.idx + 1) % titleGallery.images.length);
  }, MENU_SLIDESHOW.intervalMs);
}

// Stops the cycle AND the generation pacer/rehydrator — closing the menu
// must end all background work, not just the visible part. This is what
// MENU's closeMainMenu calls.
function stopTitleAutoCycle() {
  stopMenuGalleryTimers();
}

// Cycle-only stop, for manual navigation. Deliberately does NOT touch the
// generation pacer: clicking through the back catalogue must not silently
// end forever-generation for the rest of the session.
function stopTitleCycleOnly() {
  if (titleGallery.autoTimer) { clearInterval(titleGallery.autoTimer); titleGallery.autoTimer = null; }
}

// Manual nav — stops the cycle, acts, restarts it (reference §3.4). Both
// wrap, so the pool is a loop in either direction.
function titleNext() {
  stopTitleCycleOnly();
  const n = titleGallery.images.length;
  if (n > 0) showTitleImg((titleGallery.idx + 1) % n);
  startTitleAutoCycle();
}
function titlePrev() {
  stopTitleCycleOnly();
  const n = titleGallery.images.length;
  if (n > 0) showTitleImg((titleGallery.idx - 1 + n) % n);
  startTitleAutoCycle();
}

// Exactly one generation in flight (the `generating` guard); the callers
// never advance the index, so a slow/failing generator just leaves the
// current slide up. Failures retry with exponential backoff and settle on
// the gradient after the cap (deviation 3) — never a blind retry loop.
async function genNextTitleImg() {
  if (titleGallery.generating) return;
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden) return;
  let bgArtOn = true;
  try {
    const opts = await root.kv.menu.get(MENU_GALLERY_OPTIONS_KEY) || {};
    bgArtOn = opts.bgArt !== false;
  } catch (e) {}
  if (!bgArtOn) return; // background art disabled — gradient is the design

  titleGallery.generating = true;
  showMenuLoading('Generating background art…');
  try {
    const cap = menuRatingCap(titleGallery.contentConfig);
    const orient = titleGallery.orientation || menuViewportOrientation();
    const prompt = genTitlePrompt(titleGallery.contentConfig, orient);
    const result = await root.generateImage(prompt, {
      resolution: MENU_SLIDESHOW.resolutions[orient],
      negativePrompt: MENU_ART.negativePrompt,
    });
    // Cached uncropped, at whatever the plugin produced — see the
    // orientation block's comment for why nothing is trimmed on the way in.
    const blob = await canvasToBlob(result && result.canvas);
    if (!blob) throw new Error('empty canvas');
    const key = genMenuGalleryKey(cap);
    await setCachedImage(key, blob);
    await rememberMenuGalleryImage(key);
    pushMenuGalleryImage({ key, url: createObjectUrl(key, blob) });
    titleGallery.retries = 0;
    hideMenuLoading();
    hideMenuUnavailable();
    if (titleGallery.images.length === 1) {
      // First-ever image: paint it, enable nav, start the cycle.
      setMenuPrevNextDisabled(false);
      await showTitleImg(0);
      startTitleAutoCycle();
    }
    setMenuCounter(titleGallery.idx + 1, titleGallery.images.length);
    scheduleNextGeneration(); // keep going — the ring prunes its own oldest
  } catch (e) {
    console.warn('Title image generation failed:', e.message);
    titleGallery.retries++;
    if (titleGallery.retries > MENU_SLIDESHOW.retryMax) {
      hideMenuLoading();
      showMenuUnavailable();
    } else {
      const delay = MENU_SLIDESHOW.retryBaseMs * Math.pow(2, titleGallery.retries - 1);
      showMenuLoading(`Background art unavailable — retrying in ${Math.round(delay / 1000)}s…`);
      setTimeout(genNextTitleImg, delay);
    }
  } finally {
    titleGallery.generating = false;
  }
}

// Reload the session buffer from the persisted ring, filtered to the current
// rating cap. Loads the NEWEST bufferTarget synchronously so the menu paints
// fast, then hands the rest to a background rehydrator — with a pool of up
// to maxPersistedImages, pulling every blob out of the LRU up front would
// stall the menu open for seconds. Returns how many loaded synchronously.
async function loadCachedTitleImages() {
  await loadMenuGalleryRing();
  const cap = menuRatingCap(titleGallery.contentConfig);
  const eligible = titleGallery.ring.filter(k =>
    RATING_ORDER[menuGalleryKeyRating(k)] <= RATING_ORDER[cap] &&
    keyMatchesOrientation(k, titleGallery.orientation));
  const want = Math.min(MENU_SLIDESHOW.bufferTarget, eligible.length);
  for (let i = eligible.length - want; i < eligible.length; i++) {
    const key = eligible[i];
    try {
      const blob = await getCachedImage(key);
      if (blob) pushMenuGalleryImage({ key, url: createObjectUrl(key, blob) });
    } catch (e) {}
  }
  // Older remainder, newest-first, hydrated in the background.
  hydrateRemainingTitleImages(eligible.slice(0, eligible.length - want));
  return titleGallery.images.length;
}

// Pull the rest of the eligible ring into the session buffer a few blobs at
// a time, yielding between batches so the menu stays responsive. Prepends
// (older images belong before the newest ones) and keeps titleGallery.idx
// pointing at the same image across each splice, so a slide never jumps
// under the player while this runs.
function hydrateRemainingTitleImages(keys) {
  if (titleGallery.hydrateTimer) { clearTimeout(titleGallery.hydrateTimer); titleGallery.hydrateTimer = null; }
  let remaining = keys.slice();
  const step = async () => {
    titleGallery.hydrateTimer = null;
    if (!menuGalleryActive() || remaining.length === 0) return;
    if (titleGallery.images.length >= MENU_SLIDESHOW.maxSessionImages) return;
    const batch = remaining.splice(-MENU_SLIDESHOW.hydrateBatch);
    const loaded = [];
    for (const key of batch) {
      try {
        const blob = await getCachedImage(key);
        if (blob) loaded.push({ key, url: createObjectUrl(key, blob) });
      } catch (e) {}
    }
    if (loaded.length > 0) {
      titleGallery.images.unshift(...loaded);
      titleGallery.idx += loaded.length; // same image stays on screen
      setMenuCounter(titleGallery.idx + 1, titleGallery.images.length);
    }
    if (remaining.length > 0) titleGallery.hydrateTimer = setTimeout(step, 60);
  };
  titleGallery.hydrateTimer = setTimeout(step, 60);
}

// (Re)start the slideshow. Called every time the menu opens — idempotent:
// a warm restart resumes the session buffer; a cold start (first open this
// session, or the buffer emptied by a stricter contentConfig) reloads from
// the ring and tops up by generating. If the Background art option is off,
// the gradient is the designed state and nothing runs.
async function initTitleGallery() {
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden) return;
  stopTitleAutoCycle();
  titleGallery.generating = false;
  titleGallery.contentConfig = menuContentConfig();
  titleGallery.orientation = menuViewportOrientation();
  hideMenuLoading();
  hideMenuUnavailable();

  let bgArtOn = true;
  try {
    const opts = await root.kv.menu.get(MENU_GALLERY_OPTIONS_KEY) || {};
    bgArtOn = opts.bgArt !== false;
  } catch (e) {}
  if (!bgArtOn) {
    setMenuCounter(0, 0);
    setMenuPrevNextDisabled(true);
    return;
  }

  const cap = menuRatingCap(titleGallery.contentConfig);
  // Re-filter the in-memory buffer in case the cap tightened since it was
  // generated (e.g. the boot menu ran on the default config and a
  // restricted save now owns the pause menu), or the viewport orientation
  // flipped since it was generated.
  const kept = titleGallery.images.filter(img =>
    isCurrentGenerationKey(img.key) &&
    RATING_ORDER[menuGalleryKeyRating(img.key)] <= RATING_ORDER[cap] &&
    keyMatchesOrientation(img.key, titleGallery.orientation));
  if (kept.length > 0) {
    titleGallery.images = kept;
    if (titleGallery.idx >= kept.length) titleGallery.idx = kept.length - 1;
    await showTitleImg(titleGallery.idx);
    setMenuPrevNextDisabled(false);
    startTitleAutoCycle();
    scheduleNextGeneration(); // warm restart still keeps producing
    return;
  }

  // Cold start.
  titleGallery.images = [];
  titleGallery.idx = 0;
  titleGallery.retries = 0;
  setMenuCounter(0, 0);
  setMenuPrevNextDisabled(true);
  const loaded = await loadCachedTitleImages();
  if (loaded > 0) {
    await showTitleImg(titleGallery.images.length - 1); // newest cached first
    setMenuPrevNextDisabled(false);
    startTitleAutoCycle();
    scheduleNextGeneration();
  } else {
    genNextTitleImg(); // nothing cached — generate immediately, then pace
  }
}

// Orientation flip (portrait↔landscape) while the menu is open: swap the
// gallery to the matching frame. initTitleGallery re-filters the buffer and
// ring by orientation, so a flip cold-restarts with the right mix.
window.addEventListener('resize', () => {
  if (titleGallery.orientation && titleGallery.orientation !== menuViewportOrientation()) {
    titleGallery.orientation = menuViewportOrientation();
    initTitleGallery();
  }
});

// ===== /SECTION: IMAGE =====
