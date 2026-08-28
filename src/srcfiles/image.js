// ===== SECTION: IMAGE =====
// Scene composition, generateImage call, canvas→Blob caching, URL management.
// Placeholder shown immediately, swap async. No state writes (uses STATE adapter).
// (Apartment Expansion v2 — Mirrored H)

// Track active object URLs for cleanup
const activeImageUrls = new Map(); // sceneKey → objectURL

// --- Scene key composition ---
// `detail` (optional) is a short signature for room state the art must
// actually reflect — currently just a laid table (sceneDetailSignature). It
// is APPENDED and omitted when empty, so every key composed before it existed
// is byte-identical and no cached image is orphaned by the addition.
//
// The cache key deliberately still ignores most object state (a room getting
// dirtier doesn't repaint it — regenerating art on every state change would
// be ruinous). A spread earns its place because it is the one piece of room
// state a scene is explicitly ABOUT: the player laid it out on purpose, and
// it lasts until the table is cleared rather than changing every tick.
//
// D9 (Settings & Pause Overhaul Phase 7): the active image style also folds
// into every key — a style change must produce fresh frames, never a cached
// one from the old style (styleKeyPart, below). The 'none' style (the
// default) contributes NOTHING, exactly like an empty `detail`: default-
// settings keys are byte-identical to pre-overhaul, so the existing cache
// survives the feature.
// IMAGE_PROMPT_VERSION: bump whenever a change makes CACHED pixels stale
// because the PROMPT TEXT for a surface changed — not merely because a fresh
// draw would roll different data. Folds into every content key that does not
// already change with the prompt (the player-portrait key is excluded on
// purpose: it is the portrait prompt's own hash, so a prompt change is a key
// change). pv2 = the visual-only describer (buildVisualCharacterClause) took
// over image prompts from getPhysicalDescriptionForPrompt, and scenes gained
// deterministic seeds + the player anchor. All pre-pv2 cache entries are
// simply never looked up again. pv3 = the VN refactor (D15): the scene is a
// full-bleed backdrop now, so it generates toward the viewport's own
// orientation (landscape/portrait) with a matching framing clause and an
// orientation token in the key — every scene key changed shape, so the whole
// scene namespace turns over with it. pv4 = the character-cutout refactor
// (character-cutout-scene-rendering-plan Phase 3): the scene stopped being
// one image with people baked in and became a people-free PLATE plus
// per-character transparent cutout layers. Every backdrop prompt lost its
// character clauses and gained the people-ban negative, so no pv3 scene
// entry could ever be correctly served against the new prompt shape — the
// whole scene namespace turns over again with it.
const IMAGE_PROMPT_VERSION = 'pv4';

// VN refactor (D15): the scene backdrop's box follows the viewport's aspect,
// so generate toward it — a portrait phone should not cram a 3:2 landscape
// frame into a tall column. Mirrors the menu gallery's orientation split;
// the token folds into the scene key so landscape and portrait frames can
// never share a cache entry (they would, and both would crop badly).
function sceneOrientation() {
  return innerWidth >= innerHeight ? 'landscape' : 'portrait';
}

// composeSceneKey / composeSceneSeed are GONE (character-cutout Phase 3,
// D6): a backdrop no longer contains characters, so a backdrop key can no
// longer contain them either — see plateKey/composePlateSeed. Design
// invariant 6: reintroducing a person into the plate prompt (or a character
// id into its key) reintroduces the multiplicative cost structure this plan
// exists to kill.

// A short stable signature of who the player is, for cache keys and seeds.
// The portrait seed is the strongest anchor when one exists (it is hashStr
// of the portrait prompt — change the portrait, change the token); without
// a portrait, a hash of the appearance fields stands in. Still live: it
// anchors the PLAYER'S OWN CUTOUT key (D7), which is exactly the kind of
// thing it should key — the player's own pixels, not a room's.
function playerIdentityToken(player) {
  if (!player) return 'nobody';
  if (player.portrait?.seed) return `p${player.portrait.seed}`;
  const src = player.appearance ? JSON.stringify(player.appearance) : String(player.name || '');
  return `ph${hashStr(src).toString(36)}`;
}

// What is on the table in this room right now, or '' for "nothing worth
// repainting". Reads the spread EFFECTS' applySetTableSpread recorded, but
// only while the surface is still `clutter: 'cluttered'` — clearing the table
// is what ends the meal, so there is no separate expiry to forget and a maid
// who tidies up restores the plain cached background for free.
function tableSpreadIds(roomObjects) {
  for (const obj of Object.values(roomObjects || {})) {
    if (obj.state?.clutter !== 'cluttered') continue;
    const spread = obj.flags?.spread;
    if (Array.isArray(spread) && spread.length > 0) return spread;
  }
  return [];
}

function sceneDetailSignature(roomObjects) {
  const spread = tableSpreadIds(roomObjects);
  const spreadPart = spread.length > 0 ? `meal-${spread.slice().sort().join('-')}` : '';
  // Food-overhaul Phase 4 (D9): a sink that has disappeared under dishes is
  // scene-worthy the same way a laid table is — 'mess' enters the scene key
  // so the art actually shows the pile, and leaves it when the wash clears
  // the sink (the derived dishLevelOf flips back to clean).
  let messPart = '';
  for (const obj of Object.values(roomObjects || {})) {
    if (obj.defId === 'sink_kitchen' && dishLevelOf(obj) === 'many') { messPart = 'mess'; break; }
  }
  return [spreadPart, messPart].filter(Boolean).join('_');
}

function composeCharKey(npc, expression, pose) {
  const stylePart = imageStyleToken();
  const base = `char_${IMAGE_PROMPT_VERSION}_${npc.bible.genSeed}_${expression || 'neutral'}_${pose || 'standing'}`;
  return stylePart ? `${base}_${stylePart}` : base;
}

// ===== IMAGE STYLE (Settings & Pause Overhaul Phase 7, D9) =====
// ONE global style across every generated image. The active style id lives
// in settings (kv.menu 'settings'.imageStyle); applyImageStyle is the SINGLE
// funnel every generateImage prompt passes through — call it at every call
// site so a style change repaints every surface. 'none' (the default)
// appends nothing, so default-settings prompts are byte-identical to
// pre-overhaul and the existing cache stays valid. Style is prompt-text
// only: per-character seeds are untouched, so determinism holds.
function applyImageStyle(prompt) {
  const style = (typeof activeImageStyle === 'function' ? activeImageStyle() : null) || { id: 'none', customPrompt: '' };
  if (style.id === 'none') return prompt;
  if (style.id === '__custom') {
    const custom = String(style.customPrompt || '').trim().replace(/^,+\s*/, '');
    return custom ? `${prompt}, ${custom}` : prompt;
  }
  const def = IMAGE_STYLES.find((s) => s.id === style.id);
  if (!def || !def.suffix) return prompt;
  return `${prompt}${def.suffix}`;
}

// The cache-key fold for the active style (D9). '' when no style is active —
// a default-settings key is byte-identical to pre-overhaul, so the existing
// cache survives the feature (mirrors the empty-`detail` rule). Any other
// style folds in so a style change produces fresh frames and the LRU evicts
// the old ones. Custom folds the custom PHRASE (hashed) rather than just the
// id — editing the phrase must also invalidate, not only toggling Custom on.
function imageStyleToken() {
  const style = (typeof activeImageStyle === 'function' ? activeImageStyle() : null) || { id: 'none', customPrompt: '' };
  if (style.id === 'none') return '';
  if (style.id === '__custom') {
    const custom = String(style.customPrompt || '').trim().replace(/^,+\s*/, '');
    return custom ? `stc_${hashStr(custom).toString(36)}` : '';
  }
  return `st_${style.id}`;
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

// --- Build a PHOTO prompt (people baked in) ---
// This was `buildImagePrompt`, the scene-backdrop builder, until the
// character-cutout refactor (Phase 3) split scenes into a people-free plate
// (buildBackgroundPrompt) plus cutout layers. The CAMERA is the one
// surface that still legitimately wants everybody baked into one flat
// frame, so this survived the D6 deletion under a name that says what it
// is now. Its only caller is takePhoto.
//
// It keeps people for a reason the plan's cost argument does not apply to:
// a photo is keyed by its OWN id (`photo_<id>`, see getPhotoImage), frozen
// at capture time and never recomposed, so there is no cast-combination
// namespace to explode — the multiplicative blow-up D6 exists to kill is a
// property of a SHARED, recomposed room key, which a photo does not have.
// A snapshot of an empty room where the player pointed a camera at their
// roommates would also just be wrong.
//
// `roomObjects` (optional, WORLD's bucket for this room) drives the
// room-specific detail sentence from each object def's imagePhrase — real
// furniture the player can act on, instead of a fixed per-roomType string
// that never reflected what was actually there. Falls back to the old
// generic phrasing when objects aren't available (e.g. a caller that
// hasn't loaded WORLD state), so this stays non-breaking.
// `opts.player` is the player object — passing it puts THEM in the picture.
//
// B (scene imagery audit): the character clauses come from the VISUAL-only
// describer (buildVisualCharacterClause) — never the LLM describer, which
// adds voice/scent/gait noise an image model cannot render — and the player
// is drawn LAST, immediately before the style clause. Diffusion models weight
// the start and end of a prompt most strongly, so the shot's subject belongs
// at the end, not buried mid-prompt behind the roommates.
function buildPhotoPrompt(roomId, phase, activeNpcs, roomObjects, opts = {}) {
  const room = ROOMS[roomId];
  const roomName = String(room?.name || roomId);
  const roomType = room?.type || 'common';
  const light = phaseLighting(phase);

  let prompt = `Interior of a ${roomType === 'bedroom' ? 'cozy bedroom' : roomName.toLowerCase()} in a shared apartment, ${light}. `;
  prompt += roomObjectsPhrase(roomObjects) || fallbackRoomPhrase(roomId, roomType);

  // A laid table, named dish by dish. This is the whole reason the scene key
  // carries a spread signature — without the phrase the key would just be
  // regenerating the same picture under a different name.
  const spread = tableSpreadIds(roomObjects);
  const seated = spread.length > 0;
  if (seated) {
    const dishes = spread.map(id => (ITEM_DEFS[id]?.label || id).toLowerCase());
    const unique = [...new Set(dishes)];
    prompt += `The table is set for a shared meal: ${unique.join(', ')}, laid out on plates and serving dishes with cutlery and glasses. `;
  }
  // Food-overhaul Phase 4 (D9): the scene-key 'mess' clause's phrase — a
  // sink piled with dirty dishes is part of the picture when it's bad
  // enough to repaint (mirrors the signature above; absent = plain cache).
  for (const obj of Object.values(roomObjects || {})) {
    if (obj.defId === 'sink_kitchen' && dishLevelOf(obj) === 'many') {
      prompt += 'The kitchen sink is piled high with dirty dishes and cookware. ';
      break;
    }
  }

  // Character layers: the roommates who are present first, then the PLAYER
  // last (see the B note above — the player is the scene's subject and must
  // sit where the model pays most attention).
  const seatedTail = ', seated at the table';
  if (activeNpcs && activeNpcs.length > 0) {
    for (const npc of activeNpcs) {
      const clause = buildVisualCharacterClause(npc, { gameState: opts.gameState });
      const tail = seated ? seatedTail : (npc.activity ? `, ${npc.activity}` : '');
      prompt += `${clause}${tail}. `;
    }
  }
  if (opts.player) {
    const clause = buildVisualCharacterClause(opts.player, { gameState: opts.gameState, isPlayer: true });
    prompt += `${clause}${seated ? seatedTail : ''}. `;
  }

  prompt += sceneOrientation() === 'landscape'
    ? 'Wide composition, the room filling the frame, subjects in the upper two-thirds, facing the camera. '
    : 'Tall vertical composition, the room filling the frame, subjects in the middle of the frame, facing the camera. ';

  prompt += 'Warm tones, detailed background, slice-of-life atmosphere.';
  return prompt;
}

// ===== VISUAL-ONLY CHARACTER CLAUSE (B) =====
// Image prompts get THIS composer, not getPhysicalDescriptionForPrompt: the
// LLM describer also names voice, scent and gait — noise a diffusion model
// cannot render, which dilutes the attributes it CAN. This one keeps only
// what is actually visible, leads with the character's NAME so the model
// treats them as one subject across shots (and can tell people apart in a
// multi-person frame), always states gender explicitly (the LLM describer
// omits it for women), caps low-salience detail, and names the actual worn
// outfit instead of an abstract fashion line. Deterministic — same character,
// same state, same clause. Reads the same `bible.physical` shape every other
// consumer reads (`who.bible` for NPCs, `who.appearance` for the player).
const VISUAL_CAP = { face: 3, body: 2, distinguishing: 2, piercings: 2, tattoos: 2 };

// Gender → natural image-prompt noun. "a 28-year-old woman" reads far better
// to a diffusion model than "28-year-old female"; nonbinary flags survive
// ("futanari woman") rather than being erased.
const IMAGE_GENDER_NOUN = {
  female: 'woman', male: 'man',
  trans_female: 'woman', trans_male: 'man',
  futanari: 'futanari woman', nonbinary: 'person', agender: 'person',
};

function buildVisualCharacterClause(who, opts = {}) {
  const b = who?.bible || who?.appearance;
  const p = b?.physical;
  if (!p || !p.hair || !p.hair.color) {
    return b?.visual || 'a young adult';
  }

  const parts = [];
  const name = opts.name || who?.name || who?.bible?.name;
  if (name) parts.push(name);

  // Race, with the same article+noun the LLM describer uses. Human is the
  // default and adds nothing to an image prompt, so it stays unspoken.
  const species = b.species || 'human';
  const race = species !== 'human' && typeof RACES !== 'undefined' ? RACES.find(r => r.id === species) : null;
  if (race) parts.push(`${race.article} ${race.noun}`);

  // Age + gender ALWAYS stated — an image subject's sex is a visual fact,
  // and leaving it implicit (as the LLM describer does for women) invites
  // the model to guess.
  const ageBit = typeof b?.age === 'number' ? `${b.age}-year-old` : null;
  const genderBit = IMAGE_GENDER_NOUN[b?.gender];
  if (ageBit && genderBit) parts.push(`a ${ageBit} ${genderBit}`);
  else if (ageBit) parts.push(ageBit);
  else if (genderBit) parts.push(genderBit);

  if (p.heightBuild) parts.push(p.heightBuild);
  else if (p.height && p.build) parts.push(`${p.height} and ${p.build}`);

  const hairBits = [p.hair.length, p.hair.texture, p.hair.color, p.hair.style].filter(Boolean);
  if (hairBits.length > 0) parts.push(`with ${hairBits.join(' ')} hair`);

  const eyeBits = [p.eyes.color, p.eyes.shape].filter(Boolean);
  if (eyeBits.length > 0) parts.push(`${eyeBits.join(' ')} eyes`);

  const skinBits = [p.skin.tone, p.skin.texture].filter(Boolean);
  if (skinBits.length > 0) parts.push(`${skinBits.join(' ')} skin`);
  if (p.skin.ethnicity) parts.push(p.skin.ethnicity);

  const faceBits = [
    p.face.shape && `${p.face.shape} face`,
    p.face.nose && `a ${p.face.nose} nose`,
    p.face.lips && `${p.face.lips} lips`,
    p.face.cheekbones && `${p.face.cheekbones} cheekbones`,
    p.face.jawline && `a ${p.face.jawline} jawline`,
    p.face.ears && `${p.face.ears} ears`,
  ].filter(Boolean);
  if (faceBits.length > 0) parts.push(faceBits.slice(0, VISUAL_CAP.face).join(', '));

  if (p.facialHair && p.facialHair !== 'clean-shaven') parts.push(`with ${p.facialHair}`);

  const bodyBits = [
    p.body.shape && `${p.body.shape} build`,
    p.body.chestSize && `${p.body.chestSize} pectorals`,
    p.body.buttSize && `${p.body.buttSize} hips`,
    p.body.legs && `${p.body.legs} legs`,
    p.body.posture && `${p.body.posture} posture`,
  ].filter(Boolean);
  if (bodyBits.length > 0) parts.push(bodyBits.slice(0, VISUAL_CAP.body).join(', '));

  if (Array.isArray(p.distinguishingFeatures) && p.distinguishingFeatures.length > 0) {
    parts.push(p.distinguishingFeatures.slice(0, VISUAL_CAP.distinguishing).join(', '));
  }
  if (Array.isArray(p.piercings) && p.piercings.length > 0) {
    parts.push(p.piercings.slice(0, VISUAL_CAP.piercings).map(pi => `a ${pi.type} on the ${pi.location}`).join(', '));
  }
  if (Array.isArray(p.tattoos) && p.tattoos.length > 0) {
    parts.push(p.tattoos.slice(0, VISUAL_CAP.tattoos).map(t => `a ${t.style} tattoo on the ${t.location}`).join(', '));
  }

  if (race && race.traitPhrase) parts.push(race.traitPhrase);

  // Actual clothing: the state first (a towel overrides everything), then the
  // worn garments — never the abstract "typically wears X" fashion line.
  const clothing = who?.clothing;
  if (clothing && clothing !== 'dressed') {
    const stateProse = {
      changing: 'mid-change, between two outfits',
      nude: 'completely naked',
      towel: 'wrapped in a towel',
      sleepwear: 'currently in sleepwear',
      undressed: 'currently undressed',
    }[clothing];
    if (stateProse) parts.push(stateProse);
  } else {
    const outfit = outfitPhrase(who);
    if (outfit) parts.push(outfit);
  }

  // Visible pregnancy, gated exactly like the LLM describer's clause.
  const selfId = opts?.isPlayer ? 'player' : (opts?.npcId || who?.id);
  if (opts.gameState && typeof pregnancyVisible === 'function'
      && selfId && pregnancyVisible(opts.gameState, selfId)) {
    parts.push('visibly pregnant, with a prominent baby bump');
  }

  // The intimate layer — peek only. Scenes and portraits never opt in, so
  // their output is byte-identical whether or not the gate is open.
  if (opts.intimate && intimateAllowed(opts.gameState) && NAKED_CLOTHING_STATES.includes(clothing)) {
    const intimateBits = typeof composeIntimateDescription === 'function' ? composeIntimateDescription(p.intimate) : '';
    if (intimateBits) parts.push(intimateBits);
  }

  return parts.join(', ').trim();
}

// The garments actually worn right now, as concrete nouns ("a graphic tee and
// jeans"), or null when the subject is not in a describable outfit. Reads the
// same CLOTHING_DEFS slot view everything else uses. Outerwear first (it is
// what you SEE), then the top, then the bottom — never more than three
// pieces, so the clause stays light.
function outfitPhrase(who) {
  const outfit = who?.outfit;
  if (!outfit || typeof outfit !== 'object') return null;
  const item = id => {
    const def = typeof CLOTHING_DEFS !== 'undefined' ? CLOTHING_DEFS[id] : null;
    return def ? (def.nouns?.[0] || def.label) : null;
  };
  const wear = [];
  const outer = item(outfit.outerwear);
  if (outer) wear.push(outer);
  const top = item(outfit.top);
  if (top) wear.push(top);
  const bottom = item(outfit.bottom) || item(outfit.swimwear);
  if (bottom && wear.length < 3) wear.push(bottom);
  if (wear.length < 3) {
    const shoes = item(outfit.shoes);
    if (shoes) wear.push(shoes);
  }
  if (wear.length === 0) return null;
  // Plural garment nouns (jeans, chinos, shorts, slippers...) take no
  // article; singulars get "a/an" — "wearing jeans and a tee", never
  // "a chinos". Join three pieces as "A, B and C".
  const words = wear.map(w => {
    if (/^(a|an|the) /.test(w)) return w;
    return (/s$/.test(w) && !/ss$/.test(w)) ? w : `a ${w}`;
  });
  const joined = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  return `wearing ${joined}`;
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
  if (roomId === 'changing_room') return 'Lockers, a slatted bench, a tiled shower. ';
  if (roomId === 'study') return 'A desk, bookshelves, armchair. ';
  if (roomId === 'balcony') return 'Bistro table, potted plants, city view. ';
  if (roomId === 'laundry') return 'Washer, dryer, hamper. ';
  return '';
}

function buildCharacterPrompt(npc, expression, pose) {
  const v = buildVisualCharacterClause(npc);
  return `${v}, ${expression || 'neutral expression'}, ${pose || 'standing casually'}, full body, clean background, character sheet pose, warm lighting.`;
}

// --- The player's portrait (player creation + intro plan, Phase 4) ---
// Composed from the studio draft through the SAME describer that serves every
// NPC portrait, so the player is drawn by the machinery that draws the cast.
// The draft is `{ name, surname, age, gender, physical, portrait }`, and
// buildVisualCharacterClause reads `{ age, gender, physical }` off
// `.appearance` — so it is handed a shim with that key rather than a second
// composer being written for the same job. The name is threaded through so
// the portrait carries the same identity anchor as the scenes.
//
// Deliberately does NOT opt into the intimate layer: a character-sheet
// portrait is a clothed, face-and-figure shot, and the describer's gate wants
// an explicit request plus an undressed subject. This is the honest default,
// not an oversight.
function buildPlayerPortraitPrompt(draft) {
  const shim = { name: draft?.name, appearance: { age: draft?.age, gender: draft?.gender, physical: draft?.physical || {} } };
  const desc = buildVisualCharacterClause(shim, { name: shim.name });
  return `${desc}, neutral confident expression, standing casually, `
    + 'upper body portrait, clean simple background, warm lighting.';
}

// Keyed on the portrait's own seed rather than on the draft's contents: the
// prompt is editable, so "what this portrait is" is the prompt+seed pair the
// record froze, exactly like a photo record (takePhoto, below). Two different
// prompts are two different keys; regenerating an unchanged prompt hits cache.
// D9: the active style folds into the key (and is appended to the frozen
// prompt at generation time), so a style change re-renders the portrait
// rather than serving the old style's frame.
async function getPlayerPortraitImage(portrait) {
  const stylePart = imageStyleToken();
  const key = `player_portrait_${portrait.seed}${stylePart ? '_' + stylePart : ''}`;
  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true };
  try {
    const result = await generateImageTracked(applyImageStyle(portrait.prompt), {
      resolution: IMAGE_CACHE.resolutions.char,
      seed: portrait.seed,
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
    });
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false };
  } catch (e) {
    console.warn('Player portrait generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// getSceneImage is GONE (character-cutout Phase 3, D6). The scene backdrop
// is now getScenePlate (below) — people-free, cast-independent, one plate
// per room/phase/room-state shared by every save — and the characters are
// drawn on top of it as separate cutout layers by RENDER's
// renderSceneCutouts. render.js was its only consumer.

// ===== EMPTY BACKGROUND PLATES (character-cutout-scene-rendering-plan, Phase 2) =====
// D6: buildBackgroundPrompt is the old buildImagePrompt with every
// character clause removed — a plate is a function of the ROOM, the phase,
// and what's on the table, never of who is standing in it, so plateKey
// (below) can never carry an npc id or the player token (design invariants
// 1 and 6). Phase 3 switched renderScene onto this and deleted the
// character-baking scene path outright: composeSceneKey/composeSceneSeed/
// getSceneImage are gone, and buildImagePrompt survives ONLY as
// buildPhotoPrompt, scoped to the camera (see its own note for why a photo
// legitimately keeps its people).
function buildBackgroundPrompt(roomId, phase, roomObjects) {
  const room = ROOMS[roomId];
  const roomName = String(room?.name || roomId);
  const roomType = room?.type || 'common';
  const light = phaseLighting(phase);

  let prompt = `Interior of a ${roomType === 'bedroom' ? 'cozy bedroom' : roomName.toLowerCase()} in a shared apartment, ${light}. `;
  prompt += roomObjectsPhrase(roomObjects) || fallbackRoomPhrase(roomId, roomType);

  // Room state that belongs in the picture even with nobody in it — a laid
  // table and a dish-piled sink are facts about the ROOM (sceneDetailSignature
  // already folds both into the key), not about a character.
  const spread = tableSpreadIds(roomObjects);
  if (spread.length > 0) {
    const dishes = spread.map(id => (ITEM_DEFS[id]?.label || id).toLowerCase());
    const unique = [...new Set(dishes)];
    prompt += `The table is set for a shared meal: ${unique.join(', ')}, laid out on plates and serving dishes with cutlery and glasses. `;
  }
  for (const obj of Object.values(roomObjects || {})) {
    if (obj.defId === 'sink_kitchen' && dishLevelOf(obj) === 'many') {
      prompt += 'The kitchen sink is piled high with dirty dishes and cookware. ';
      break;
    }
  }

  // No character layers (D6 — the whole point). The framing clause also
  // drops buildImagePrompt's "subjects in the upper two-thirds" phrasing,
  // since this frame deliberately has no subject.
  prompt += sceneOrientation() === 'landscape'
    ? 'Wide cinematic composition, the room filling the frame, eye-level camera angle. '
    : 'Tall vertical composition, the room filling the frame, eye-level camera angle. ';

  prompt += 'Anime-inspired illustration style, warm tones, detailed background, slice-of-life atmosphere, empty room, no people.';
  return prompt;
}

// persona-realm's people-ban negative (Stage 5, genChatScene) appended to
// this surface's usual negative — the plate's job is to have NOBODY in it,
// ever, so the model is banned from drawing anyone even by accident.
const PLATE_PEOPLE_BAN = 'person, people, human, man, woman, child, boy, girl, crowd, face, portrait, '
  + 'figure, character, creature, animal, silhouette, body, arms, legs, hands, eyes, skin';
function backgroundNegPrompt() {
  return `${IMAGE_NEGATIVE.scene}, ${PLATE_PEOPLE_BAN}`;
}

function plateKey(roomId, phase, detail, styleToken) {
  return `plate_${IMAGE_PROMPT_VERSION}_${roomId}_${phase}_${detail || 'plain'}`
    + `_${sceneOrientation()}` + (styleToken ? `_${styleToken}` : '');
}

// Deterministic like every other generated surface here — same room, same
// phase, same room state always reproduces the same plate. No character
// anchor exists to mix in (that is the entire point of D6), so the seed is
// just the key itself.
function composePlateSeed(key) {
  return hashStr(key);
}

// Cache-then-generate under the plate key — one plate serves every cast and
// every save that shares a room/phase/room-state, which is the cost fix
// this whole plan exists for (see the plan's Evidence section).
async function getScenePlate(roomId, phase, roomObjects) {
  const detail = sceneDetailSignature(roomObjects);
  const styleToken = imageStyleToken();
  const key = plateKey(roomId, phase, detail, styleToken);

  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key };

  try {
    const prompt = applyImageStyle(buildBackgroundPrompt(roomId, phase, roomObjects));
    const resolution = IMAGE_CACHE.resolutions.scene[sceneOrientation()];
    const result = await generateImageTracked(prompt, {
      resolution,
      seed: composePlateSeed(key),
      negativePrompt: backgroundNegPrompt(),
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { url: null, cached: false, key, error: 'empty plate frame' };
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key };
  } catch (e) {
    console.warn('Scene plate generation failed:', e.message);
    return { url: null, cached: false, key, error: e.message };
  }
}
// Phase 5: which of the three catalogue expressions this character wears
// right now. Talking wins when the player has a conversation overlay open
// with them (the same `_inConversation` flag OVERTURE's do-not-disturb
// registry reads); otherwise a clearly good mood earns 'happy'; otherwise
// neutral. Deliberately coarse — every distinct expression is its own
// generated cutout (D4), so a finely-graded scale would multiply the
// per-character namespace for differences nobody would read at this size.
const CUTOUT_HAPPY_MOOD = 0.35;
function cutoutExpressionFor(gs, who, isPlayer, charId) {
  if (!isPlayer && gs?.player?.flags?._inConversation
      && typeof convState !== 'undefined' && convState && convState.npcId === charId) {
    return 'talking';
  }
  const mood = typeof who?.mood === 'number' ? who.mood : 0;
  return mood >= CUTOUT_HAPPY_MOOD ? 'happy' : 'neutral';
}

// --- D10: deterministic scene layout ---------------------------------------
// Seeds on the plate key + the sorted cast — the same scene lays out the
// same way every visit, but no character IDENTITY feeds the seed (only how
// many are present), so a layout reseed never depends on WHO is standing
// there, matching the plate/cutout split's whole premise. Returns Placement
// records (see the plan's "Data model" section); pose/xFrac/scale/z are all
// this function's job, bottomFrac here is the D16 FALLBACK only — the
// renderer overrides it with a measured value once a cutout has loaded.
function layoutSceneCutouts(gs, sceneState, plateKeyStr) {
  // D12/"off": a player who turned character art off gets the room alone.
  // Gated here rather than in the renderer so nothing downstream — the
  // layout, the diff, the queue's refill — even considers a cast.
  if (typeof characterArtEnabled === 'function' && !characterArtEnabled()) return [];

  const roomId = gs.player.location;
  const roomObjects = gs.objects?.[`room_${roomId}`];
  const seated = tableSpreadIds(roomObjects).length > 0;
  const activeNpcIds = (sceneState?.active || []).slice().sort();
  // D15 — the AMBIENT tier renders too. Scene presence has always been two
  // tiers: promoteToActive/demoteToAmbient (npc.js) keep a capped foreground
  // `active` set and an `ambient` list holding everyone else in the room, and
  // the LLM context builder feeds BOTH. So an NPC could be described by the
  // scene reader, be addressable, appear in the present-list — and be absent
  // from the picture. That gap was exactly one tier wide.
  //
  // Ambient characters get a smaller scale and a z below every active slot,
  // which is a free depth cue the presence model was already handing us.
  const ambientNpcIds = (sceneState?.ambient || [])
    .filter((id) => !activeNpcIds.includes(id))
    .slice().sort();
  // The seed still folds only the plate key and WHO IS PRESENT, never any
  // character's identity (D10) — only the count changes.
  const seed = hashStr(`${plateKeyStr}|${activeNpcIds.join(',')}|${ambientNpcIds.join(',')}`);
  const rng = mulberry32(seed);

  // The player is always the center-most slot (D10 — "player center-front"),
  // regardless of join order: NPCs sorted by id fill outward from the
  // middle where the player sits. Ambient NPCs sit outside the active band,
  // furthest from centre, which reads as "further back" as well as smaller.
  const npcSlots = activeNpcIds.map(id => ({ charId: id, isPlayer: false, ambient: false }));
  const centerIdx = Math.floor(npcSlots.length / 2);
  const ambientSlots = ambientNpcIds.map(id => ({ charId: id, isPlayer: false, ambient: true }));
  const half = Math.ceil(ambientSlots.length / 2);
  const slots = ambientSlots.slice(0, half)
    .concat(npcSlots.slice(0, centerIdx))
    .concat([{ charId: 'player', isPlayer: true, ambient: false }])
    .concat(npcSlots.slice(centerIdx))
    .concat(ambientSlots.slice(half));
  const count = slots.length;

  const pose = seated ? 'seated' : 'standing';
  const poseDef = CUTOUT_POSES[pose] || CUTOUT_POSES.standing;

  return slots.map((slot, i) => {
    // Evenly spaced across a central band, with a small deterministic
    // jitter (same seed -> same jitter, forever) so same-size casts don't
    // all look mechanically identical scene to scene.
    const base = (i + 1) / (count + 1);
    const jitter = (rng() - 0.5) * (0.5 / (count + 1));
    const xFrac = Math.max(0.08, Math.min(0.92, base + jitter));
    const who = slot.isPlayer ? gs.player : gs.npcs?.[slot.charId];
    return {
      charId: slot.charId,
      isPlayer: slot.isPlayer,
      ambient: !!slot.ambient,
      pose,
      expression: cutoutExpressionFor(gs, who, slot.isPlayer, slot.charId),
      xFrac,
      bottomFrac: poseDef.bottomFrac,
      // D15: ambient figures are smaller and sit BEHIND every active one.
      // The z bands never overlap — ambient occupies 1..9, active 10.., the
      // player 100 — so a promote/demote can never reorder the foreground.
      scale: poseDef.scale * (slot.ambient ? SPRITE_QUEUE.ambientScale : 1),
      z: slot.isPlayer ? 100 : (slot.ambient ? 1 + i : 10 + i),
    };
  });
}
// ===== /SECTION: EMPTY BACKGROUND PLATES =====

// --- Reroll the current scene PLATE (D17/D17.6; D11) ---
// The info modal's Regenerate button. `fields` = { prompt, seed, negativePrompt }
// from the modal: prompt is used verbatim (it was pre-filled with the exact
// style-applied prompt the current pixels came from), seed null means "roll
// fresh", negativePrompt defaults to the surface's usual one. The result is
// cached UNDER THE SAME plate key — the player chose this art, so revisiting
// the room shows the rerolled backdrop. Falls through render.js's
// sceneArtContext so it always rerolls whatever the CURRENT room is.
//
// D11: this rerolls the PLATE ONLY. The cutout layers standing on it are
// untouched — a reroll changes the room the characters are standing in,
// never who they are. (A per-character reroll is parked in the plan's Open
// questions.)
async function rerollSceneImage(gs, sceneState, fields) {
  const ctx = sceneArtContext(gs, sceneState);
  if (!ctx || !ctx.sceneKey) return { error: 'No scene to reroll.' };
  try {
    const result = await generateImageTracked(fields.prompt, {
      resolution: IMAGE_CACHE.resolutions.scene[sceneOrientation()],
      seed: fields.seed ?? Math.floor(Math.random() * 2147483647),
      negativePrompt: fields.negativePrompt || backgroundNegPrompt(),
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { error: 'The model returned an empty frame.' };
    await setCachedImage(ctx.sceneKey, blob);
    const url = createObjectUrl(ctx.sceneKey, blob);
    const img = document.getElementById('scene-img');
    if (img) {
      img.src = url;
      img.removeAttribute('data-loading');
    }
    return { ok: true };
  } catch (e) {
    console.warn('Scene art reroll failed:', e.message);
    return { error: e.message };
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
    const prompt = applyImageStyle(buildCharacterPrompt(npc, expression, pose));
    const result = await generateImageTracked(prompt, {
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

// ===== CHARACTER CUTOUTS (character-cutout-scene-rendering-plan, Phase 1) =====
// Transparent, per-character sprites generated once and reused across every
// room they ever stand in, instead of being baked into the scene image. See
// the plan's "cutout pipeline — technical reference" section for the full
// persona-realm derivation; D14/D15/D16 below are this project's amendments
// on top of that ported algorithm (see the plan's review-pass note for why
// a verbatim port wasn't enough).

// identity = `n<genSeed>` for an NPC, or the player's own identity token
// (D7) — the same anchor composeSceneSeed already uses for NPCs, so a
// cutout and that character's presence in a legacy baked scene always
// agreed on who they were.
function cutoutIdentityToken(who, isPlayer) {
  if (isPlayer) return playerIdentityToken(who);
  return who?.bible?.genSeed != null
    ? `n${who.bible.genSeed}`
    : `ni${hashStr(String(who?.id || who?.name || '')).toString(36)}`;
}

// outfit = c<clothingState>_o<outerwear>_t<top>_b<bottom> — an outfit change
// (or a clothing-state change: dressed/nude/towel/sleepwear/...) is a new
// cutout, exactly like a pose or expression change (D4).
function cutoutOutfitToken(who) {
  const clothing = who?.clothing || 'dressed';
  const outfit = who?.outfit || {};
  const o = outfit.outerwear || '';
  const t = outfit.top || '';
  const b = outfit.bottom || outfit.swimwear || '';
  return `c${clothing}_o${o}_t${t}_b${b}`;
}

// D20: a cutout-only version token, folded in ALONGSIDE IMAGE_PROMPT_VERSION
// rather than by bumping it. The Stage 0 prompt and the D17/D18/D19 cleanup
// both changed, so every cutout generated before them has to be repainted —
// but plates, portraits, peek frames and outcome-window art are all still
// correct, and bumping the shared version would have thrown that whole cache
// away too. Bump this, not IMAGE_PROMPT_VERSION, for any future change that
// only alters how cutouts are made.
const CUTOUT_PIPELINE_VERSION = 'c2';

function cutoutKey(identity, pose, expression, outfit, styleToken) {
  return `cut_${IMAGE_PROMPT_VERSION}${CUTOUT_PIPELINE_VERSION}_${identity}_${pose}_${expression}_${outfit}`
    + (styleToken ? `_${styleToken}` : '');
}

// D3: deterministic — same character, same pose, same expression, same
// outfit, same style → same pixels, forever. Makes LRU eviction invisible
// (D13): a regenerated cutout reproduces its own art.
function composeCutoutSeed(identity, pose, expression, outfit, styleToken) {
  return hashStr(`${identity}|${pose}|${expression}|${outfit}${styleToken ? '|' + styleToken : ''}`);
}

// Stage 0 — the isolate-friendly framing persona-realm proved out: a clean
// studio background gives the removeBackground mask an easy edge. D8:
// clothing-state prose is exactly buildVisualCharacterClause's — the same
// prose today's baked scenes already show, never more.
function buildCutoutPrompt(who, pose, expression, opts = {}) {
  const clause = buildVisualCharacterClause(who, opts);
  const poseWord = (CUTOUT_POSES[pose] || CUTOUT_POSES.standing).seedWord;
  const exprWord = expression === 'happy' ? 'happy expression'
    : expression === 'talking' ? 'talking, mouth slightly open'
    : 'neutral expression';
  return `${clause}, ${exprWord}, ${poseWord}, full body, `
    + 'alone on a plain flat pure white background, even soft lighting on the character, '
    + 'character sprite.';
}

// D20: the isolation instruction, re-stated so it is the LAST thing the model
// reads. applyImageStyle appends the active style suffix to whatever it is
// handed, and half of IMAGE_STYLES ends in a texture phrase — 'visible paper
// texture', 'grainy texture', 'rough graphite texture', 'impasto'. Those apply
// to the WHOLE frame, backdrop included, which is precisely the mottled plate
// RMBG then has to guess its way through. Every other surface wants the style
// to have the last word; the cutout surface cannot afford it.
const CUTOUT_ISOLATION_TAIL = ', flat solid white background, empty background behind the subject, '
  + 'no backdrop texture, no background pattern, no shadow cast on the background.';

// The one composer both cutout getters use: character prose -> active style ->
// isolation tail (D20). Never call applyImageStyle on a cutout prompt directly.
function cutoutPromptFor(who, pose, expression, opts) {
  return applyImageStyle(buildCutoutPrompt(who, pose, expression, opts)) + CUTOUT_ISOLATION_TAIL;
}

// persona-realm's negPrompt() (Stage 0): ban anything that would read as
// "background" or a second subject, so Stage 1's mask gets a clean, single-
// subject edge to work with. D20 widens it past persona-realm's list with the
// terms the first live run actually produced: a photographer's mottled muslin
// backdrop (what 'studio background' summons), speckle/grain, and the cast
// shadow that pools under the feet and comes through the mask as an attached
// grey slab.
function cutoutNegativePrompt() {
  return 'blurry, distorted, extra limbs, low quality, text, watermark, '
    + 'background details, background scenery, noise, artifacts, textures on background, borders, frame, vignette, multiple people, cropped, '
    + 'studio backdrop, muslin backdrop, canvas backdrop, mottled background, textured background, gradient background, '
    + 'grunge, speckles, splatter, paint splatter, grain, film grain, dust, scratches, paper texture, '
    + 'cast shadow, drop shadow, floor, ground plane, reflection';
}

// --- D17: alpha levels (the matte knee) ------------------------------------
// The FIRST thing that touches a fresh cutout's alpha channel, and the single
// biggest lever on background noise. RMBG-1.4 emits a probability mask, not a
// decision: over a flat backdrop it reads ~0 / ~255 and everything downstream
// is easy, but over ANY texture it hedges, and the hedge lands as a haze of
// alpha-30..alpha-150 pixels spread across the whole frame. D5's sweep cannot
// help there — the haze is not small, and after D15's closing it is not even
// separate from the subject. So decide it here, before it becomes anyone
// else's problem: at or below `alphaFloor` is background (0), at or above
// `alphaCeil` is subject (255), and the band between gets a smoothstep so a
// genuine soft edge — hair, a blurred hand — keeps its gradient instead of
// turning into a jaggy hard cut. Mutates `data` in place; pure array math.
function cutoutAlphaLevels(data, width, height, tuning) {
  tuning = tuning || CUTOUT_TUNING;
  const floor = tuning.alphaFloor, ceil = tuning.alphaCeil;
  if (!(ceil > floor)) return 0; // misconfigured knee — leave the mask alone
  const n = width * height;
  let cleared = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4 + 3;
    const a = data[o];
    if (a <= floor) { if (a > 0) cleared++; data[o] = 0; }
    else if (a >= ceil) data[o] = 255;
    else {
      const t = (a - floor) / (ceil - floor);
      data[o] = Math.round(255 * t * t * (3 - 2 * t)); // smoothstep
    }
  }
  return cleared;
}

// --- D14: edge spill suppression (decontamination) -------------------------
// RMBG-1.4's mask is soft with no color decontamination: a partial-alpha
// border pixel keeps the BACKGROUND's color (white, from Stage 0's prompt).
// persona-realm never surfaced this because it flattened onto a plausible
// JPEG immediately; this plan places the same fringed edge on arbitrary
// plates, including night scenes, where a white halo around hair reads as a
// bug. Blends each matte-edge pixel's RGB toward the subject's own opaque-
// pixel mean color, weighted by how far its alpha sits below full. Mutates
// `data` in place; pure array math, no canvas dependency, so it is directly
// unit-testable against a synthetic ImageData-shaped buffer.
function cutoutSuppressSpill(data, width, height, tuning) {
  tuning = tuning || CUTOUT_TUNING;
  const n = width * height;
  let rSum = 0, gSum = 0, bSum = 0, opaqueCount = 0;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    if (a >= tuning.spillAlphaMax) {
      rSum += data[i * 4]; gSum += data[i * 4 + 1]; bSum += data[i * 4 + 2];
      opaqueCount++;
    }
  }
  if (opaqueCount === 0) return 0; // nothing solid to decontaminate toward
  const meanR = rSum / opaqueCount, meanG = gSum / opaqueCount, meanB = bSum / opaqueCount;
  let touched = 0;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    if (a <= tuning.speckAlpha || a >= tuning.spillAlphaMax) continue;
    const weight = 1 - (a - tuning.speckAlpha) / (tuning.spillAlphaMax - tuning.speckAlpha);
    const o = i * 4;
    data[o] = data[o] + (meanR - data[o]) * weight;
    data[o + 1] = data[o + 1] + (meanG - data[o + 1]) * weight;
    data[o + 2] = data[o + 2] + (meanB - data[o + 2]) * weight;
    touched++;
  }
  return touched;
}

// --- D15/D5: morphological closing + persona-realm's specks cleanup -------
// Box dilate/erode (D15's closeRadius) BEFORE connected-component labeling:
// a hair wisp or fingertip attached to the main silhouette only through a
// couple of low-alpha (but nonzero) pixels gets severed into its own tiny
// component by strict adjacency and then pruned as a speck — closing
// reconnects near-touching fragments first, so real extremities survive
// while true islands (dust, background fragments) still get labeled apart
// and pruned. Morphological closing is extensive (original foreground ⊆
// closed foreground), so labeling the closed mask and then looking up each
// ORIGINAL foreground pixel's label is always well-defined.
function cutoutDilate(mask, width, height, radius) {
  if (!radius) return mask;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const rowBase = yy * width;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[rowBase + xx]) { hit = 1; break; }
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

function cutoutErode(mask, width, height, radius) {
  if (!radius) return mask;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let all = 1;
      for (let dy = -radius; dy <= radius && all; dy++) {
        const yy = y + dy;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const v = (yy < 0 || yy >= height || xx < 0 || xx >= width) ? 0 : mask[yy * width + xx];
          if (!v) { all = 0; break; }
        }
      }
      out[y * width + x] = all;
    }
  }
  return out;
}

function cutoutMorphClose(mask, width, height, radius) {
  return cutoutErode(cutoutDilate(mask, width, height, radius), width, height, radius);
}

// Flood-fill component labeling (an explicit Int32Array stack, no
// recursion — persona-realm's killParasitesSync approach, safe on the
// cutout resolution). Returns per-component pixel area and whether it
// touches the border band. D18: `ignoreBottom` drops the bottom edge from
// that band — feet, chair legs and a lounging hip all legitimately reach it,
// and it is the only edge where they do.
function cutoutLabelComponents(mask, width, height, marginBand, ignoreBottom) {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let nextLabel = 0;
  const areas = [];
  const border = [];
  for (let start = 0; start < n; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let top = 0;
    stack[top++] = start;
    labels[start] = nextLabel;
    let area = 0;
    let touchesBorder = false;
    while (top > 0) {
      const idx = stack[--top];
      area++;
      const x = idx % width, y = (idx / width) | 0;
      if (x < marginBand || y < marginBand || x >= width - marginBand) touchesBorder = true;
      if (!ignoreBottom && y >= height - marginBand) touchesBorder = true;
      if (x > 0) { const i2 = idx - 1; if (mask[i2] && labels[i2] === -1) { labels[i2] = nextLabel; stack[top++] = i2; } }
      if (x < width - 1) { const i2 = idx + 1; if (mask[i2] && labels[i2] === -1) { labels[i2] = nextLabel; stack[top++] = i2; } }
      if (y > 0) { const i2 = idx - width; if (mask[i2] && labels[i2] === -1) { labels[i2] = nextLabel; stack[top++] = i2; } }
      if (y < height - 1) { const i2 = idx + width; if (mask[i2] && labels[i2] === -1) { labels[i2] = nextLabel; stack[top++] = i2; } }
    }
    areas.push(area);
    border.push(touchesBorder);
    nextLabel++;
  }
  return { labels, areas, border, count: nextLabel };
}

// Orchestrates D15 (close) + D5 (persona-realm's speck removal, tuned) +
// D18/D19 (the amendments the first live run forced).
//
// D18 — CLOSING NOW RESCUES, IT NO LONGER MERGES. The original sweep labeled
// the CLOSED mask and read each original pixel's label out of it, so a
// dilate-then-erode of radius 2 could bridge scattered background residue
// into one component with the character. That component was then the largest,
// i.e. "the main one", i.e. immune — the sweep was structurally unable to
// erase the noise it existed to erase. So label the RAW mask (which decides
// what "main" is, honestly), and consult the closed mask only to ask a second
// question about each WISP-SCALE component (`rescueAreaMax`): would closing
// have attached you to the main body? If yes it is a hair wisp or a
// fingertip, and it is rescued — the exact case D15 was added for, with none
// of the merge damage. Anything bigger than a wisp is judged on its merits
// below however close to the subject it sits, because residue hugging the
// silhouette's edge is the commonest residue of all.
//
// D19 — a non-main component is also erased when it is under `speckRelMax` of
// the main component's area, whatever its absolute size. `speckAreaMax` alone
// (120px) let anything bigger through, which on a 512x768 frame is most of
// the residue worth complaining about.
//
// Mutates `data`'s alpha channel in place.
function cutoutPruneSpecks(data, width, height, tuning) {
  tuning = tuning || CUTOUT_TUNING;
  const n = width * height;
  const foreground = new Uint8Array(n);
  for (let i = 0; i < n; i++) foreground[i] = data[i * 4 + 3] > tuning.speckAlpha ? 1 : 0;
  const marginBand = Math.max(3, Math.round(tuning.borderMarginFrac * Math.min(width, height)));
  const raw = cutoutLabelComponents(foreground, width, height, marginBand, tuning.borderIgnoreBottom);
  const { labels, areas, border, count } = raw;
  // A frame with no foreground at all still returns a (empty) mainMask —
  // cleanCutout reads it unconditionally, and 'the mask failed entirely' is
  // exactly the case that must reach the null-bbox exit rather than throw.
  if (count === 0) return { erased: 0, mainArea: 0, componentCount: 0, rescued: 0, mainMask: new Uint8Array(n) };
  let mainLabel = 0;
  for (let i = 1; i < count; i++) if (areas[i] > areas[mainLabel]) mainLabel = i;
  const mainArea = areas[mainLabel];

  // D18's rescue question, asked once for the whole frame: which raw
  // components does the closed mask put in the same blob as the main one?
  const rescued = new Uint8Array(count);
  let rescuedCount = 0;
  if (tuning.closeRadius) {
    const closed = cutoutMorphClose(foreground, width, height, tuning.closeRadius);
    const closedLabels = cutoutLabelComponents(closed, width, height, marginBand, tuning.borderIgnoreBottom).labels;
    // Closing is extensive, so every original foreground pixel has a closed
    // label; find the closed label the main component sits in, then mark any
    // other raw component sharing it.
    let mainClosed = -1;
    for (let i = 0; i < n && mainClosed < 0; i++) if (foreground[i] && labels[i] === mainLabel) mainClosed = closedLabels[i];
    if (mainClosed >= 0) {
      for (let i = 0; i < n; i++) {
        if (!foreground[i]) continue;
        const lbl = labels[i];
        if (lbl === mainLabel || rescued[lbl]) continue;
        if (areas[lbl] > tuning.rescueAreaMax) continue; // wisp-scale only
        if (closedLabels[i] === mainClosed) { rescued[lbl] = 1; rescuedCount++; }
      }
    }
  }

  const erase = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (i === mainLabel || rescued[i]) continue;
    const small = areas[i] < tuning.speckAreaMax;
    const dwarfed = areas[i] < tuning.speckRelMax * mainArea;       // D19
    const edge = tuning.removeBorderComponents && border[i];
    if ((small || dwarfed || edge) && areas[i] < tuning.speckMainRatio * mainArea) erase[i] = 1;
  }
  let erased = 0;
  // The subject's own footprint, kept separately from the alpha channel: the
  // crop (Stage 3) anchors to THIS, not to "whatever still has alpha". See
  // cleanCutout for why that distinction is load-bearing.
  const mainMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!foreground[i]) continue;
    const lbl = labels[i];
    if (lbl >= 0 && erase[lbl]) { data[i * 4 + 3] = 0; erased++; }
    else if (lbl === mainLabel || rescued[lbl]) mainMask[i] = 1;
  }
  return { erased, mainArea, componentCount: count, rescued: rescuedCount, mainMask };
}

// --- Stage 3: alpha bounding box -------------------------------------------
// Over an explicit foreground mask rather than the alpha channel — the
// subject-only variant cleanCutout prefers (see there for why).
function cutoutBBoxFromMask(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cutoutBBox(data, width, height, alphaThreshold) {
  const threshold = alphaThreshold != null ? alphaThreshold : CUTOUT_TUNING.bboxAlpha;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // fully transparent — nothing to place
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// D16: the floor anchor as a fraction of frame height, measured from a
// bbox — computed once here (informational, right after generation) and
// re-derived the same way at layout time (Phase 3) against the decoded,
// already-cropped cutout PNG, so placement always uses the true lowest
// opaque row rather than CUTOUT_POSES' fallback constant.
function cutoutBottomFrac(bbox, frameHeight) {
  if (!bbox) return null;
  return Math.max(0, (frameHeight - 1 - bbox.maxY) / frameHeight);
}

// Runs D14 (spill suppression) then D15+D5 (closing + specks) then Stage 3
// (bbox + tight crop) on a freshly generated cutout canvas. The only
// canvas/DOM touch in the whole cleanup pipeline — everything it calls is
// pure array math, directly unit-testable without a real canvas.
function cleanCutout(canvas, tuning) {
  tuning = tuning || CUTOUT_TUNING;
  const ctx = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  cutoutAlphaLevels(imageData.data, width, height, tuning);   // D17, first — decide the mask before anyone reads it
  cutoutSuppressSpill(imageData.data, width, height, tuning); // D14, before Stage 2 per its placement in the pipeline
  const pruned = cutoutPruneSpecks(imageData.data, width, height, tuning); // D15 + D5 + D18/D19
  // D19: crop to the SUBJECT, not to whatever still has alpha. Cleanup is
  // best-effort — one stubborn speck in a corner is always possible — but the
  // bbox is not cosmetic: Stage 3 crops to it and D16 measures the floor
  // anchor from it, so a single surviving corner pixel used to pin the box
  // open to the full frame and hand the layout a character who was the wrong
  // size and floating off the floor. Anchoring to the main component makes
  // placement immune to leftover noise instead of merely unlikely to see it.
  const bbox = cutoutBBoxFromMask(pruned.mainMask, width, height)
    || cutoutBBox(imageData.data, width, height, tuning.bboxAlpha);
  ctx.putImageData(imageData, 0, 0);
  if (!bbox) return { canvas, bbox: null, bottomFrac: null };
  const cropped = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(bbox.width, bbox.height)
    : Object.assign(document.createElement('canvas'), { width: bbox.width, height: bbox.height });
  cropped.getContext('2d').drawImage(canvas, bbox.minX, bbox.minY, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
  return { canvas: cropped, bbox, bottomFrac: cutoutBottomFrac(bbox, height) };
}

// --- The cutout factory -----------------------------------------------------
// getCharacterCutout/getPlayerCutout are the only two callers of
// root.generateImage with removeBackground:true in the whole game. Both
// round-trip through the SAME shared LRU (getCachedImage/setCachedImage,
// state.js) everything else in this file uses — no new index, no new kv
// folder (design invariant 3). D12: never throws past the caller — a
// missing/failed cutout returns {url: null}, and the render layer (Phase 3)
// hides that layer rather than blocking the scene.
async function getCharacterCutout(npc, pose, expression) {
  const identity = cutoutIdentityToken(npc, false);
  const outfit = cutoutOutfitToken(npc);
  const styleToken = imageStyleToken();
  const key = cutoutKey(identity, pose, expression, outfit, styleToken);
  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key };
  try {
    const prompt = cutoutPromptFor(npc, pose, expression);
    const seed = composeCutoutSeed(identity, pose, expression, outfit, styleToken);
    const result = await generateImageTracked(prompt, {
      resolution: IMAGE_CACHE.resolutions.cutout,
      seed,
      removeBackground: true,
      negativePrompt: cutoutNegativePrompt(),
    });
    const cleaned = cleanCutout(result.canvas);
    // D20: a null bbox means the cleanup erased everything — the mask failed
    // outright. cleanCutout hands back the UNCROPPED canvas in that case, and
    // canvasToBlob would happily produce a valid, fully transparent PNG, which
    // the LRU would then serve as this character's sprite forever. D12 already
    // says a missing cutout hides its layer; take that path instead of caching
    // an invisible one.
    if (!cleaned.bbox) return { url: null, cached: false, key, error: 'empty cutout frame' };
    const blob = await canvasToBlob(cleaned.canvas);
    if (!blob) return { url: null, cached: false, key, error: 'empty cutout frame' };
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key };
  } catch (e) {
    console.warn('Character cutout generation failed:', e.message);
    return { url: null, cached: false, key, error: e.message };
  }
}

// D7: the player is a cutout too, keyed by their own identity token
// (portrait seed) — preserving the "player is the scene's subject" rule.
async function getPlayerCutout(player, pose, expression) {
  const identity = cutoutIdentityToken(player, true);
  const outfit = cutoutOutfitToken(player);
  const styleToken = imageStyleToken();
  const key = cutoutKey(identity, pose, expression, outfit, styleToken);
  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key };
  try {
    const prompt = cutoutPromptFor(player, pose, expression, { isPlayer: true });
    const seed = composeCutoutSeed(identity, pose, expression, outfit, styleToken);
    const result = await generateImageTracked(prompt, {
      resolution: IMAGE_CACHE.resolutions.cutout,
      seed,
      removeBackground: true,
      negativePrompt: cutoutNegativePrompt(),
    });
    const cleaned = cleanCutout(result.canvas);
    // D20: a null bbox means the cleanup erased everything — the mask failed
    // outright. cleanCutout hands back the UNCROPPED canvas in that case, and
    // canvasToBlob would happily produce a valid, fully transparent PNG, which
    // the LRU would then serve as this character's sprite forever. D12 already
    // says a missing cutout hides its layer; take that path instead of caching
    // an invisible one.
    if (!cleaned.bbox) return { url: null, cached: false, key, error: 'empty cutout frame' };
    const blob = await canvasToBlob(cleaned.canvas);
    if (!blob) return { url: null, cached: false, key, error: 'empty cutout frame' };
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key };
  } catch (e) {
    console.warn('Player cutout generation failed:', e.message);
    return { url: null, cached: false, key, error: e.message };
  }
}
// ===== /SECTION: CHARACTER CUTOUTS =====

// --- Peek image (Intimacy & Voyeurism Phase 10, D6) -----------------------
// The keyhole-lens image. The keyhole is NEVER baked into the art (D6) —
// the prompt describes a plain room view and index.html's CSS mask crops it.
// The prompt is deterministic and gate-governed (D15): the occupant is
// described through buildVisualCharacterClause with opts.intimate, so
// the SAME three-condition gate (explicit request + mature flag + naked
// state) decides how much of the scene the prompt may name. The explicit
// activity phrase (PEEK_VIEW_ACT) is read only when that gate is open; with
// the gate closed the scene degrades to a safe paraphrase. The cache key
// carries the occupant's stable seed + phase + act, so revisiting the same
// moment reuses the frame instead of spending quota.
function composePeekKey(gs, roomId, npc, actKey) {
  const phase = gs?.meta?.clock?.phase || 'day';
  const stylePart = imageStyleToken();
  const base = `peek_${IMAGE_PROMPT_VERSION}_${roomId}_${npc.bible.genSeed}_${phase}_${actKey || 'none'}`;
  return stylePart ? `${base}_${stylePart}` : base;
}

// PURE. Builds the peek prompt from live state — deterministic, no rng.
function composePeekPrompt(gs, roomId, npc, actKey, npcId) {
  const room = ROOMS[roomId];
  const roomName = room?.name || roomId;
  const light = phaseLighting(gs?.meta?.clock?.phase);
  const clothing = npc?.clothing || 'dressed';
  const gateOpen = intimateAllowed(gs) && NAKED_CLOTHING_STATES.includes(clothing);
  const actDef = PEEK_VIEW_ACT[actKey || ''] || PEEK_VIEW_ACT._default;
  const act = gateOpen && actDef.explicit ? actDef.explicit : actDef.safe;
  const desc = buildVisualCharacterClause(npc, { gameState: gs, intimate: true, npcId });
  return `Interior of the ${roomName.toLowerCase()} in a shared apartment, ${light}, ` +
    `viewed from the doorway, looking into the room from the threshold. ` +
    `${desc} is ${act}, at ease in their own space. ` +
    'Anime-inspired illustration style, warm tones, cinematic composition, slice-of-life atmosphere.';
}

// Cache-keyed peek frame. `cached` in the result lets peek.js spend its
// image budget only on genuinely fresh generations.
async function getPeekImage(gs, roomId, npc, npcId) {
  const actKey = npc.activity || npc.clothing || 'hanging_out';
  const key = composePeekKey(gs, roomId, npc, actKey);
  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key };
  try {
    const prompt = applyImageStyle(composePeekPrompt(gs, roomId, npc, actKey, npcId));
    const result = await generateImageTracked(prompt, {
      resolution: IMAGE_CACHE.resolutions.char, // 512x768 portrait — fits the keyhole
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark, keyhole, door hardware',
    });
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key };
  } catch (e) {
    console.warn('Peek image generation failed:', e.message);
    return { url: null, cached: false, key, error: e.message };
  }
}

// --- Action outcome window images (action-outcome-window-plan Phase 1, D5) --
// D5 splits outcome-window art two ways, and the split is a choice of WHICH
// KEY, not a second caching mechanism: both keys below go through the same
// getCachedImage/setCachedImage LRU as every other surface in this file
// (Design invariant 3 — actionwindow.js never calls generateImage itself).
//
//   ARCHETYPE — repetitive-motion verbs (showering, dishes, a gig block).
//     ONE representative frame per (verb, room, who-you-are, variant),
//     reused every time forever. Deliberately carries no clock/phase part:
//     "representative" is the point, and a shower at 7am and one at
//     midnight are the same picture.
//   INSTANCE  — verbs where the SPECIFIC content is the point (a particular
//     plate, an outfit, an intimate act, a dream). The caller's `subject`
//     is the discriminator; a per-occurrence subject means a fresh frame per
//     occurrence, while still living inside the cache so a re-render of the
//     same open window never generates twice.
//
// Both fold the same things every other key here folds: the prompt version,
// the player's identity token (a haircut must repaint the archetype), the
// clothing state the prompt actually names, the intimate gate (a gate flip
// changes the prompt, so it must change the key), the viewport orientation,
// and the active image style.
function actionWindowKeyBase(gs, plan, discriminator) {
  const gate = (typeof intimateAllowed === 'function' && intimateAllowed(gs)) ? 'i1' : 'i0';
  const clothing = plan.clothing || gs?.player?.clothing || 'dressed';
  return `${IMAGE_PROMPT_VERSION}_${plan.verbId}_${plan.roomId || 'anywhere'}`
    + `_${playerIdentityToken(gs?.player)}_${clothing}_${discriminator}_${gate}_${sceneOrientation()}`;
}

function composeActionArchetypeKey(gs, plan) {
  const stylePart = imageStyleToken();
  const base = `awa_${actionWindowKeyBase(gs, plan, plan.variant || 'base')}`;
  return stylePart ? `${base}_${stylePart}` : base;
}

function composeActionInstanceKey(gs, plan) {
  const stylePart = imageStyleToken();
  const base = `awi_${actionWindowKeyBase(gs, plan, plan.subject || 'once')}`;
  return stylePart ? `${base}_${stylePart}` : base;
}

// PURE. The window's prompt: the acting player through the same visual-clause
// composer every other generated image uses (opted into the intimate layer,
// so peek's own three-condition gate still governs how much it may name),
// plus the verb's OWN declared phrase. The phrase is authored on the action
// def — this file never invents what the verb looked like.
function composeActionWindowPrompt(gs, plan) {
  const player = gs?.player;
  const who = plan.clothing ? { ...(player || {}), clothing: plan.clothing } : player;
  const clause = buildVisualCharacterClause(who, { gameState: gs, isPlayer: true, intimate: true });
  const roomName = ROOMS[plan.roomId]?.name || plan.roomId || 'apartment';
  const light = phaseLighting(gs?.meta?.clock?.phase);
  return `${clause}, ${plan.phrase}, in the ${String(roomName).toLowerCase()}, ${light}, `
    + 'anime-inspired slice-of-life illustration, warm tones, cinematic composition, '
    + (sceneOrientation() === 'landscape' ? 'wide composition, subject centered.' : 'tall vertical composition, subject centered.');
}

// Cache-then-generate under whichever key D5 picked. `prompt` rides back out
// so the window can hand it to the shared info/reroll affordance without
// recomposing it. Seed is the key's own hash, like plateKey/composePlateSeed
// — same key, same picture.
async function getActionWindowImage(gs, plan) {
  if (!plan || !plan.phrase) return { url: null, cached: false, key: null, error: 'no image plan' };
  const key = plan.kind === 'instance'
    ? composeActionInstanceKey(gs, plan)
    : composeActionArchetypeKey(gs, plan);
  const prompt = applyImageStyle(composeActionWindowPrompt(gs, plan));

  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key, prompt };

  try {
    const result = await generateImageTracked(prompt, {
      resolution: IMAGE_CACHE.resolutions.scene[sceneOrientation()],
      seed: hashStr(key),
      negativePrompt: IMAGE_NEGATIVE.actionWindow,
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { url: null, cached: false, key, prompt, error: 'empty outcome frame' };
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key, prompt };
  } catch (e) {
    console.warn('Action window image generation failed:', e.message);
    return { url: null, cached: false, key, prompt, error: e.message };
  }
}

// --- Canvas to Blob ---
// Bug report (2026-08-26): "Character cutout generation failed: canvas.
// toBlob is not a function". cleanCutout (above) crops into a fresh
// `new OffscreenCanvas(...)` whenever the browser supports it (true in
// every modern build), and OffscreenCanvas has no `.toBlob` — that's an
// HTMLCanvasElement-only method. It has `.convertToBlob()` instead, which
// returns the blob directly rather than taking a callback. Every cutout
// generation was silently failing (falling back to no cutout art) because
// of this single unhandled-type gap.
function canvasToBlob(canvas) {
  if (!canvas) return Promise.resolve(null);
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

// --- Foreground generation tracking (avatars-and-sprite-studio D14) ------
// EVERY call to root.generateImage in this project goes through here, so the
// background sprite queue can answer one question honestly: is the game
// already spending image quota on something the player is waiting for?
//
// D14's rule is that a scene plate, a peek frame, a dream panel or an
// outcome-window image ALWAYS wins. That is only enforceable if there is a
// single place that knows a generation is in flight; before this there was
// none, and sixteen call sites each knew only about themselves.
//
// Deliberately counts the QUEUE's own generations too. The queue checks
// imageBusy() before it starts an item and never re-checks mid-flight, so
// counting itself costs nothing and keeps this an honest global picture
// rather than a special case with an exception in it.
let imageGenerationsInFlight = 0;
function imageBusy() { return imageGenerationsInFlight > 0; }
async function generateImageTracked(prompt, opts) {
  imageGenerationsInFlight++;
  try {
    return await root.generateImage(prompt, opts);
  } finally {
    imageGenerationsInFlight--;
  }
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

  const prompt = buildPhotoPrompt(roomId, phase, activeNpcs, roomObjects, { gameState })
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

// B6 (Discord feedback, 2026-08-23): the action-triggered counterpart to
// takePhoto — same frozen prompt+seed record shape (so it drops straight
// into the existing camera roll and reuses getPhotoImage/the Photos app's
// reroll & info UI for free), just built from the ACTING player and the
// action definition instead of the current room's cast. actionId/slot key
// the id so repeat uses of the same action the same tick still get unique,
// individually addressable records, matching takePhoto's contract.
function captureActionMoment(gameState, def, actionId, actor, ctx) {
  const roomId = ctx?.roomId || gameState.player.location;
  const day = gameState.meta.clock.day;
  const tick = getTickIndex(gameState.meta.clock.minutes);
  const roll = gameState.world.phone.camera.roll;
  const slot = roll.length;
  const id = `photo_${hashStr(`${gameState.meta.seed}|moment|${actionId}|${day}|${tick}|${slot}`).toString(36)}`;
  const seed = hashStr(`${gameState.meta.seed}|photo_seed|${id}`);
  const prompt = buildActionMomentPrompt(actor, def, { roomId, gameState });

  const photo = {
    id, day, tick, roomId, subjectNpcIds: [],
    caption: def.momentCaption || `A private moment, Day ${day}`,
    prompt, seed, tags: ['moment'],
  };
  roll.unshift(photo);
  if (roll.length > CAMERA.rollCap) roll.length = CAMERA.rollCap;
  return photo;
}

// The prompt for a captureActionMoment record: the acting player, described
// through the same visual-clause composer as every other generated image,
// opted into the intimate layer (peek's own gate, intimateAllowed, still
// applies — sfwMode off means this stays a clothed/neutral description).
// def.transientClothing is passed as the clause's clothing state directly,
// not read off the live actor, for the timing reason captureActionMoment's
// caller documents.
function buildActionMomentPrompt(actor, def, ctx) {
  const who = { ...actor, clothing: def.transientClothing || actor.clothing };
  const clause = buildVisualCharacterClause(who, { gameState: ctx.gameState, isPlayer: true, intimate: true });
  const room = ROOMS[ctx.roomId]?.name || ctx.roomId || '';
  return `${clause}, ${def.momentPhrase || 'in a private, intimate moment, alone'}, in the ${String(room).toLowerCase()}, `
    + 'soft intimate lighting, '
    + (sceneOrientation() === 'landscape' ? 'wide composition, subject centered.' : 'tall vertical composition, subject centered.');
}

// ===== F3 — conversation scene visualizer (Discord feedback, 2026-08-23) =====
// A dedicated one-off panel of the current conversation, drawn straight into
// the chat log (ui.js's maybeShowConversationScene → convAddImageBubble) —
// a separate system from the character-cutout layer (which never opts into
// this; see buildCharacterPrompt's own note). Ungoverned by the camera-roll
// cache: nothing here is meant to be revisited later, so every call is a
// fresh, uncached generation with its own random seed, same pattern as
// rerollSceneImage's one-off reroll path.
function buildConversationScenePrompt(gameState, npc) {
  const roomId = gameState.player.location;
  const npcClause = buildVisualCharacterClause(npc, { gameState, npcId: npc.id });
  const playerClause = buildVisualCharacterClause(gameState.player, { gameState, isPlayer: true });
  const room = ROOMS[roomId]?.name || roomId;
  const mood = moodLabel(npc.mood);
  return `${npcClause}, talking with ${playerClause}, in the ${String(room).toLowerCase()}, `
    + `${mood} mood, mid-conversation, expressive body language, two people, `
    + (sceneOrientation() === 'landscape' ? 'wide composition, both figures visible.' : 'tall vertical composition, both figures visible.');
}

// ===== F6 — phone-snoop photo finding (Discord feedback, 2026-08-24) =====
// A dedicated one-off, same uncached/fresh-seed pattern as
// generateConversationSceneImage — a single discovered photo, not
// something meant to reproduce identically on a later view. Deliberately
// SFW/candid (the asks.js buildAskPhotoRecord selfie style, not the
// intimate-layer opt-in buildActionMomentPrompt uses) — keeps the "found
// a photo on their phone" beat as a light discovery, not automatically
// an explicit find on its own.
function buildPhoneSnoopPhotoPrompt(npc) {
  const clause = buildVisualCharacterClause(npc, { npcId: npc.id });
  return `${clause}, a candid selfie, soft natural light, casual clothing, relaxed, `
    + (sceneOrientation() === 'landscape' ? 'wide composition.' : 'tall vertical composition, upper-body framing.');
}

async function generatePhoneSnoopPhotoImage(npc) {
  const prompt = buildPhoneSnoopPhotoPrompt(npc);
  try {
    const result = await generateImageTracked(applyImageStyle(prompt), {
      resolution: IMAGE_CACHE.resolutions.char,
      seed: Math.floor(Math.random() * 2147483647),
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
    });
    const blob = await canvasToBlob(result.canvas);
    return { url: URL.createObjectURL(blob), prompt, error: null };
  } catch (e) {
    return { url: null, prompt, error: e.message };
  }
}

async function generateConversationSceneImage(gameState, npc) {
  const prompt = buildConversationScenePrompt(gameState, npc);
  try {
    const result = await generateImageTracked(applyImageStyle(prompt), {
      resolution: IMAGE_CACHE.resolutions.scene[sceneOrientation()],
      seed: Math.floor(Math.random() * 2147483647),
      negativePrompt: IMAGE_NEGATIVE.scene,
    });
    const blob = await canvasToBlob(result.canvas);
    return { url: URL.createObjectURL(blob), prompt, error: null };
  } catch (e) {
    return { url: null, prompt, error: e.message };
  }
}

// Regenerate (or fetch from cache) the image for a photo record. Keyed by
// the photo's own id, not by room/phase/npc composition — two photos of
// the same room a day apart must stay visually distinct and individually
// addressable, unlike getSceneImage's shared "current state of this room"
// cache key. D9: the active style folds into the key and is appended to the
// record's frozen prompt at generation time — the ROOM content stays frozen
// at capture (landmine L10), while the style overlay follows the current
// setting like every other generated image.
async function getPhotoImage(photo) {
  const stylePart = imageStyleToken();
  const photoKey = `photo_${photo.id}${stylePart ? '_' + stylePart : ''}`;
  const cached = await getCachedImage(photoKey);
  if (cached) return { url: createObjectUrl(photoKey, cached), cached: true };
  try {
    // D17.6: a photo rerolled through the info modal stores the EDITED
    // (already style-applied) prompt verbatim with promptStyled set, so it
    // is never re-styled here; a normal capture keeps the raw frozen prompt
    // and gets the style overlay applied like every other generated image.
    const promptForGen = photo.promptStyled ? photo.prompt : applyImageStyle(photo.prompt);
    const result = await generateImageTracked(promptForGen, {
      resolution: IMAGE_CACHE.resolutions.bg,
      seed: photo.seed,
      negativePrompt: photo.negativePrompt || IMAGE_NEGATIVE.photo,
    });
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(photoKey, blob);
    return { url: createObjectUrl(photoKey, blob), cached: false };
  } catch (e) {
    console.warn('Photo generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// --- Ask photo (asks plan Phase 8) ---
// An NPC "sent" photo for the photo ask's accepted flow. Same contract as
// getPhotoImage (a prompt+seed record, cached under the photo namespace so
// the shared LRU owns it), but a PORTRAIT selfie framing —
// IMAGE_CACHE.resolutions.char — because the ask's subject is the NPC
// themselves, not a room. buildAskPhotoRecord (asks.js) builds the record
// deterministically from the save seed, so the cache key is deterministic
// too: reloading the same save reuses the pixels instead of re-spending
// quota, and the same flavor always yields the same photo (D1 — the flavor
// shapes the image CONTENT, never the decision).
async function getAskPhotoImage(record) {
  const stylePart = imageStyleToken();
  const photoKey = `photo_${record.id}${stylePart ? '_' + stylePart : ''}`;
  const cached = await getCachedImage(photoKey);
  if (cached) return { url: createObjectUrl(photoKey, cached), cached: true };
  try {
    const result = await generateImageTracked(applyImageStyle(record.prompt), {
      resolution: IMAGE_CACHE.resolutions.char,
      seed: record.seed,
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
    });
    const blob = await canvasToBlob(result.canvas);
    await setCachedImage(photoKey, blob);
    return { url: createObjectUrl(photoKey, blob), cached: false };
  } catch (e) {
    console.warn('Ask photo generation failed:', e.message);
    return { url: null, cached: false, error: e.message };
  }
}

// --- Dream panels (dream-engine-plan Phase 6, D14/D21/D30) ----------------
// A dream panel is a photo record. compileDream (dreams.js) froze its prompt
// and its seed at compile time; the record persists both and never a blob, so
// the Dream Diary can repaint a page long after the shared LRU has evicted
// its pixels (D14 — the takePhoto discipline, rationale above takePhoto).
// NOTHING here rebuilds the prompt from current state: the room, the cast and
// the light a dream was compiled against are all allowed to have changed, and
// a dream that repainted itself against today's apartment would stop being a
// record of what was dreamt.
//
// D30 splits the cache key in two. composeDreamPanelKey (dreams.js) folds the
// facts about the DREAM — IMAGE_PROMPT_VERSION, the dream id, the panel index
// — and is hashed into the panel's frozen seed, so it can never move. The two
// facts about the DEVICE are appended here, at the cache boundary, exactly as
// getPhotoImage appends the style over a frozen record prompt: the viewport
// orientation and the active image style. A panel drawn on a phone and one
// drawn on a desktop are different pictures and must never share an entry.
function dreamPanelCacheKey(dream, panelIndex) {
  const stylePart = imageStyleToken();
  const base = `${composeDreamPanelKey(dream, panelIndex)}_${sceneOrientation()}`;
  return stylePart ? `${base}_${stylePart}` : base;
}

// The orientation clause DREAM_PROMPT_TAIL deliberately does not carry — see
// the comment above that constant. Same split as composeActionWindowPrompt's
// trailing clause, just applied at render time instead of compose time.
function dreamPanelViewportClause() {
  return sceneOrientation() === 'landscape'
    ? 'wide cinematic composition, subject centered'
    : 'tall vertical composition, subject centered';
}

// Cache-then-generate under the key above — the getActionWindowImage idiom,
// and the same return shape, so the viewer (Phase 7) and the diary (Phase 8)
// can hand `prompt` to the shared info/reroll affordance without recomposing
// it.
//
// The SEED is the record's own frozen panel.seed rather than a hash of the
// key, which is where this getter deliberately differs from every other
// surface in this file. The key varies with the device (orientation, style);
// the seed must not, because a diary entry is a memory of one specific
// picture and rotating a phone is not an event in the dreamer's life.
async function getDreamPanelImage(dream, panelIndex) {
  const panel = dream?.panels?.[panelIndex];
  if (!panel || !panel.prompt) return { url: null, cached: false, key: null, error: 'no dream panel' };
  const key = dreamPanelCacheKey(dream, panelIndex);
  const prompt = applyImageStyle(`${panel.prompt}, ${dreamPanelViewportClause()}`);

  const cached = await getCachedImage(key);
  if (cached) return { url: createObjectUrl(key, cached), cached: true, key, prompt };

  try {
    const result = await generateImageTracked(prompt, {
      resolution: IMAGE_CACHE.resolutions.scene[sceneOrientation()],
      seed: panel.seed,
      negativePrompt: IMAGE_NEGATIVE.dream,
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { url: null, cached: false, key, prompt, error: 'empty dream panel' };
    await setCachedImage(key, blob);
    return { url: createObjectUrl(key, blob), cached: false, key, prompt };
  } catch (e) {
    console.warn('Dream panel image generation failed:', e.message);
    return { url: null, cached: false, key, prompt, error: e.message };
  }
}

// --- Reroll helpers (D17.5/D17.6) ---
// The shared info/reroll modal's regenerate paths for the non-scene
// surfaces. Each reroll receives the modal's field values verbatim —
// { prompt, seed, negativePrompt } — where a null seed means "roll fresh"
// (the modal only passes a concrete seed when the player typed one). All
// cache under the same key, so the player's chosen pixels persist.

// Default negative prompts, one per surface. The modal pre-fills from these
// (or the surface's own stored override), and the reroll passes the field
// through verbatim.
const IMAGE_NEGATIVE = {
  scene: 'blurry, distorted, extra limbs, low quality, text, watermark',
  char: 'blurry, distorted, extra limbs, low quality, text, watermark',
  photo: 'blurry, distorted, extra limbs, low quality',
  peek: 'blurry, distorted, extra limbs, low quality, text, watermark, keyhole, door hardware',
  // The outcome window (action-outcome-window-plan Phase 1): a single-subject
  // moment, so a crowd is as wrong here as a watermark.
  actionWindow: 'blurry, distorted, extra limbs, low quality, text, watermark, crowd, multiple people',
  // A dream panel (dream-engine-plan Phase 6). Deliberately the shortest list
  // here, and deliberately missing two words every other entry carries.
  // 'distorted' and 'blurry' are struck because DREAM_DISTORTIONS and
  // DREAM_LENSES put exactly those qualities in the POSITIVE prompt on
  // purpose — a flooded, doubled, scale-wrong room under polaroid bleed is
  // the brief, and negating it here would quietly cancel the two tables the
  // abstraction slider drives. Anatomical failure is still failure, so
  // 'extra limbs' stays. What is added instead is the multi-frame family:
  // the word "dream" pulls diffusion models hard toward collages and comic
  // strips, and a dream PANEL is one frame — the sequence is the form's job
  // (D4), not the picture's.
  dream: 'extra limbs, deformed hands, low quality, text, watermark, signature, caption, '
    + 'speech bubble, comic panel, panel border, split screen, collage, grid of images',
};

// Photo reroll: re-freezes the memory — the edited prompt (verbatim,
// flagged so getPhotoImage never re-styles it), the seed (or a fresh roll
// when the player left it untouched), and any edited negative prompt all
// persist in the record via the same boundary-save the rest of the phone
// app uses.
async function rerollPhotoImage(photo, imgEl, fields) {
  if (!photo) return { error: 'Photo not found.' };
  const stylePart = imageStyleToken();
  const photoKey = `photo_${photo.id}${stylePart ? '_' + stylePart : ''}`;
  try {
    photo.prompt = fields.prompt;
    photo.promptStyled = true;
    photo.seed = fields.seed ?? Math.floor(Math.random() * 2147483647);
    photo.negativePrompt = fields.negativePrompt || IMAGE_NEGATIVE.photo;
    const result = await generateImageTracked(photo.prompt, {
      resolution: IMAGE_CACHE.resolutions.bg,
      seed: photo.seed,
      negativePrompt: photo.negativePrompt,
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { error: 'The model returned an empty frame.' };
    await setCachedImage(photoKey, blob);
    const url = createObjectUrl(photoKey, blob);
    if (imgEl) imgEl.src = url;
    await saveAtBoundary('photo-reroll', currentGameState);
    return { ok: true };
  } catch (e) {
    console.warn('Photo reroll failed:', e.message);
    return { error: e.message };
  }
}

// Peek-frame reroll: fresh frame for the CURRENT act the player is watching
// through the keyhole, cached under the same peek key.
async function rerollPeekFrame(gs, roomId, npc, npcId, imgEl, fields) {
  const actKey = npc.activity || npc.clothing || 'hanging_out';
  const key = composePeekKey(gs, roomId, npc, actKey);
  try {
    const result = await generateImageTracked(fields.prompt, {
      resolution: IMAGE_CACHE.resolutions.char,
      seed: fields.seed ?? Math.floor(Math.random() * 2147483647),
      negativePrompt: fields.negativePrompt || IMAGE_NEGATIVE.peek,
    });
    const blob = await canvasToBlob(result.canvas);
    if (!blob) return { error: 'The model returned an empty frame.' };
    await setCachedImage(key, blob);
    const url = createObjectUrl(key, blob);
    if (imgEl) imgEl.src = url;
    return { ok: true };
  } catch (e) {
    console.warn('Peek frame reroll failed:', e.message);
    return { error: e.message };
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
// pre-token key, which is by definition pre-crop-removal — is stale. D9: the
// active image style also gates currency — a key whose style token differs
// from the current style is stale too, so a style change regenerates the
// slideshow instead of replaying the old style's pixels.
function isCurrentGenerationKey(key) {
  if (typeof key !== 'string' || !key.startsWith(`menu_${MENU_GALLERY_GENERATION}_`)) return false;
  const m = /^menu_g\d+_(sfw|suggestive|explicit)_(?:((?:st_|stc_)[^_]+)_)?(?:l|p)_/.exec(key);
  return m ? (m[1] || '') === imageStyleToken() : false;
}

function menuGalleryKeyRating(key) {
  const m = /^menu_g\d+_(sfw|suggestive|explicit)_/.exec(key || '');
  return m ? m[1] : 'explicit'; // unknown/legacy keys assumed permissive
}

function genMenuGalleryKey(rating) {
  const o = titleGallery.orientation === 'portrait' ? 'p' : 'l';
  const styleToken = imageStyleToken();
  const stylePart = styleToken ? `${styleToken}_` : '';
  return `${menuGalleryKeyPrefix(rating)}${stylePart}${o}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function menuGalleryKeyOrientation(key) {
  const m = /^menu_g\d+_(sfw|suggestive|explicit)_(?:(?:st_|stc_)[^_]+_)?(l|p)_/.exec(key || '');
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
  const live = currentGameState && currentGameState.meta && currentGameState.meta.contentConfig;
  if (live) return live;
  // Settings & Pause Overhaul Phase 4 (D5): with no live game the boot
  // gallery falls back to the settings SFW state — when SFW mode is on the
  // slideshow's cap drops to 'sfw' before a save exists. The live-game
  // branch above stays authoritative whenever one owns the menu.
  if (typeof isSfwMode === 'function' && isSfwMode()) {
    return { tone: CONTENT_CONFIG.tone, contentPrefs: [], contentFlags: { ...CONTENT_CONFIG.contentFlags, mature: false } };
  }
  return CONTENT_CONFIG;
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

// D9 (Settings & Pause Overhaul Phase 7): called from SETTINGS' setSettings
// whenever the image style (or the Custom phrase) changes — re-filters the
// boot gallery's persisted ring AND its in-memory session buffer to the new
// style and hard-deletes the old style's blobs, so the slideshow shows the
// new style on its next frame instead of replaying stale pixels. A no-op
// when the gallery hasn't been initialized (the style change still lands —
// every new key is style-tagged, so the next menu open self-heals via
// purgeStaleGenerationImages).
async function applyImageStyleLive() {
  if (typeof titleGallery === 'undefined' || !titleGallery) return;
  const purged = await purgeStaleGenerationImages();
  const kept = titleGallery.images.filter(img => isCurrentGenerationKey(img.key));
  if (kept.length === titleGallery.images.length) return;
  titleGallery.images = kept;
  if (titleGallery.idx >= kept.length) titleGallery.idx = Math.max(0, kept.length - 1);
  if (kept.length > 0) {
    await showTitleImg(titleGallery.idx);
    setMenuPrevNextDisabled(false);
  } else {
    setMenuCounter(0, 0);
    setMenuPrevNextDisabled(true);
    genNextTitleImg();
  }
  if (purged > 0) console.debug(`Menu gallery: style change dropped ${purged} cached image(s).`);
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
    const prompt = applyImageStyle(genTitlePrompt(titleGallery.contentConfig, orient));
    const result = await generateImageTracked(prompt, {
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
  // Settings & Pause Overhaul Phase 3 (D3): only the boot title context
  // runs the gallery. The pause menu is a plain dimmed overlay — the
  // slideshow, its generation pacer, and the darkening overlay never run
  // behind it. menuContext lives in MENU (loaded after IMAGE); absent here
  // means boot-context default.
  if (typeof menuContext !== 'undefined' && menuContext !== 'boot') return;
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
