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

// ===== /SECTION: IMAGE =====
