// ===== SECTION: IMAGE =====
// Scene composition, generateImage call, canvas→Blob caching, URL management.
// Placeholder shown immediately, swap async. No state writes (uses STATE adapter).

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
function buildImagePrompt(roomId, phase, activeNpcs) {
  const room = ROOMS[roomId];
  const roomName = String(room?.name || roomId);
  const roomType = room?.type || 'common';
  const light = phaseLighting(phase);

  let prompt = `Interior of a ${roomType === 'bedroom' ? 'cozy bedroom' : roomName.toLowerCase()} in a shared apartment, ${light}. `;

  // Room-specific details
  if (roomType === 'bedroom') {
    prompt += 'Single bed, desk, wardrobe, personal items. ';
  } else if (roomId === 'kitchen') {
    prompt += 'Counters, stove, fridge, small table. Dishes, mugs. ';
  } else if (roomId === 'living_room') {
    prompt += 'Sofa, coffee table, TV, bookshelf. Lived-in but comfortable. ';
  } else if (roomId === 'bathroom') {
    prompt += 'Sink, mirror, shower. Tiles, towels. ';
  }

  // Character layers
  if (activeNpcs && activeNpcs.length > 0) {
    for (const npc of activeNpcs) {
      const v = npc.bible.visual || 'a person';
      const expr = npc.activity ? `, ${npc.activity}` : '';
      prompt += `${v}${expr}. `;
    }
  }

  prompt += 'Anime-inspired illustration style, warm tones, detailed background, slice-of-life atmosphere.';
  return prompt;
}

function buildCharacterPrompt(npc, expression, pose) {
  const v = npc.bible.visual || 'a young adult';
  return `${v}, ${expression || 'neutral expression'}, ${pose || 'standing casually'}, anime-inspired illustration style, full body, clean background, character sheet pose, warm lighting.`;
}

// --- Generate or retrieve cached background ---
async function getSceneImage(roomId, phase, activeNpcs) {
  const sceneKey = composeSceneKey(roomId, phase, 'normal', activeNpcs?.map(n => n.id) || []);

  // Check cache
  const cached = await getCachedImage(sceneKey);
  if (cached) {
    return { url: createObjectUrl(sceneKey, cached), cached: true };
  }

  // Generate new
  try {
    const prompt = buildImagePrompt(roomId, phase, activeNpcs);
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
