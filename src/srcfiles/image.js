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
// scene namespace turns over with it.
const IMAGE_PROMPT_VERSION = 'pv3';

// VN refactor (D15): the scene backdrop's box follows the viewport's aspect,
// so generate toward it — a portrait phone should not cram a 3:2 landscape
// frame into a tall column. Mirrors the menu gallery's orientation split;
// the token folds into the scene key so landscape and portrait frames can
// never share a cache entry (they would, and both would crop badly).
function sceneOrientation() {
  return innerWidth >= innerHeight ? 'landscape' : 'portrait';
}

function composeSceneKey(roomId, phase, lighting, npcIds, detail, player) {
  const ids = (npcIds || []).filter(Boolean);
  const npcPart = ids.length > 0 ? ids.slice().sort().join('-') : 'empty';
  const base = `${roomId}_${phase}_${lighting || 'normal'}_${npcPart}`;
  const stylePart = imageStyleToken();
  // The player is ALWAYS in their own scene, so who they are is part of what
  // this scene IS. Without this, two different solo saves in the same
  // room/phase with nobody present shared one cache entry — player B was
  // served player A's art. The token also anchors the deterministic scene
  // seed (composeSceneSeed), so revisiting a moment reproduces its frame.
  const playerPart = playerIdentityToken(player);
  const middle = `${base}_${playerPart}${detail ? `_${detail}` : ''}`;
  return `${IMAGE_PROMPT_VERSION}_${sceneOrientation()}_${stylePart ? `${middle}_${stylePart}` : middle}`;
}

// A short stable signature of who the player is, for scene cache keys and
// seeds. The portrait seed is the strongest anchor when one exists (it is
// hashStr of the portrait prompt — change the portrait, change the token);
// without a portrait, a hash of the appearance fields stands in.
function playerIdentityToken(player) {
  if (!player) return 'nobody';
  if (player.portrait?.seed) return `p${player.portrait.seed}`;
  const src = player.appearance ? JSON.stringify(player.appearance) : String(player.name || '');
  return `ph${hashStr(src).toString(36)}`;
}

// Deterministic scene seed: the SAME scene — same save, same room, same
// phase, same cast — always reproduces the same image instead of rerolling
// every person's face on every cache miss (the #1 volatility complaint).
// The hash mixes in each present character's OWN identity seed (portrait hash
// / genSeed) so the scene's latent noise stays anchored to who is actually
// in it, and the scene key so two different scenes never share a seed.
function composeSceneSeed(sceneKey, player, activeNpcs) {
  const anchors = [];
  if (player) anchors.push(playerIdentityToken(player));
  for (const npc of activeNpcs || []) {
    anchors.push(npc.bible?.genSeed != null
      ? `n${npc.bible.genSeed}`
      : `ni${hashStr(String(npc.id || npc.name || '')).toString(36)}`);
  }
  anchors.sort();
  return hashStr(`${sceneKey}|${anchors.join('|')}`);
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

// --- Build image prompt ---
// `roomObjects` (optional, WORLD's bucket for this room) drives the
// room-specific detail sentence from each object def's imagePhrase — real
// furniture the player can act on, instead of a fixed per-roomType string
// that never reflected what was actually there. Falls back to the old
// generic phrasing when objects aren't available (e.g. a caller that
// hasn't loaded WORLD state), so this stays non-breaking.
// `opts.player` is the player object — passing it puts THEM in the picture.
// Until they had an appearance at all (SIM's generatePlayerAppearance) this
// function could only ever draw the roommates, so every scene was shot from
// the perspective of someone who wasn't in it.
//
// B (scene imagery audit): the character clauses come from the VISUAL-only
// describer (buildVisualCharacterClause) — never the LLM describer, which
// adds voice/scent/gait noise an image model cannot render — and the player
// is drawn LAST, immediately before the style clause. Diffusion models weight
// the start and end of a prompt most strongly, so the scene's subject belongs
// at the end, not buried mid-prompt behind the roommates.
function buildImagePrompt(roomId, phase, activeNpcs, roomObjects, opts = {}) {
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

  // VN refactor (D15): the scene is a full-bleed backdrop, so say so. The
  // framing clause matches the orientation the frame was generated for, and
  // deliberately keeps the subjects' faces toward the top two-thirds of the
  // image — that is the band that stays visible above the reader panel.
  prompt += sceneOrientation() === 'landscape'
    ? 'Wide cinematic composition, the room filling the frame, subjects in the upper two-thirds, facing the camera. '
    : 'Tall vertical composition, the room filling the frame, subjects in the middle of the frame, facing the camera. ';

  prompt += 'Anime-inspired illustration style, warm tones, detailed background, slice-of-life atmosphere.';
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
  return `${v}, ${expression || 'neutral expression'}, ${pose || 'standing casually'}, anime-inspired illustration style, full body, clean background, character sheet pose, warm lighting.`;
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
    + 'anime-inspired illustration style, upper body portrait, clean simple background, warm lighting.';
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
    const result = await root.generateImage(applyImageStyle(portrait.prompt), {
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

// --- Generate or retrieve cached background ---
// The generation passes a DETERMINISTIC seed (composeSceneSeed) derived from
// the scene key plus every present character's own identity seed — the same
// moment revisited reproduces the same frame, instead of rerolling every
// person's face on every cache miss. This is the core of the volatility fix.
async function getSceneImage(roomId, phase, activeNpcs, roomObjects, opts = {}) {
  const sceneKey = composeSceneKey(roomId, phase, 'normal', activeNpcs?.map(n => n.id) || [], sceneDetailSignature(roomObjects), opts.player);

  // Check cache
  const cached = await getCachedImage(sceneKey);
  if (cached) {
    return { url: createObjectUrl(sceneKey, cached), cached: true };
  }

  // Generate new
  try {
    const prompt = applyImageStyle(buildImagePrompt(roomId, phase, activeNpcs, roomObjects, opts));
    // VN refactor (D15): generate toward the viewport's orientation — the
    // backdrop box matches the screen, so the frame should too.
    const resolution = IMAGE_CACHE.resolutions.scene[sceneOrientation()];
    const result = await root.generateImage(prompt, {
      resolution,
      seed: composeSceneSeed(sceneKey, opts.player, activeNpcs),
      negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
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

// --- Reroll the current scene backdrop (D17/D17.6) ---
// The info modal's Regenerate button. `fields` = { prompt, seed, negativePrompt }
// from the modal: prompt is used verbatim (it was pre-filled with the exact
// style-applied prompt the current pixels came from), seed null means "roll
// fresh", negativePrompt defaults to the surface's usual one. The result is
// cached UNDER THE SAME scene key — the player chose this art, so revisiting
// the scene shows the rerolled frame. Falls through render.js's
// sceneArtContext so it always rerolls whatever the CURRENT scene is.
async function rerollSceneImage(gs, sceneState, fields) {
  const ctx = sceneArtContext(gs, sceneState);
  if (!ctx || !ctx.sceneKey) return { error: 'No scene to reroll.' };
  try {
    const result = await root.generateImage(fields.prompt, {
      resolution: IMAGE_CACHE.resolutions.scene[sceneOrientation()],
      seed: fields.seed ?? Math.floor(Math.random() * 2147483647),
      negativePrompt: fields.negativePrompt || IMAGE_NEGATIVE.scene,
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
    const result = await root.generateImage(prompt, {
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

  const prompt = buildImagePrompt(roomId, phase, activeNpcs, roomObjects, { gameState })
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
    const result = await root.generateImage(promptForGen, {
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
    const result = await root.generateImage(applyImageStyle(record.prompt), {
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
    const result = await root.generateImage(photo.prompt, {
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
    const result = await root.generateImage(fields.prompt, {
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
