// ===== SECTION: DEFS.MENU =====
// Menu overhaul Phase 10: the title-gallery trait lists and prompt
// assembly, modelled on the reference games' genTitlePrompt
// (ref/perchance-menu-conventions.md §3.2) — flat lists, one complete noun
// phrase per entry, uniform selection, fixed concatenation order, a shared
// style tail and negative prompt.
//
// DELIBERATE DEVIATION (deviation 2): every entry carries a rating tag —
// 'sfw' | 'suggestive' | 'explicit' — and the assembled prompt is filtered
// by the active contentConfig (meta.contentConfig, falling back to
// CONTENT_CONFIG). The reference games' lists carry NO rating tags and are
// unconditionally NSFW with a hardcoded 50/50 solo/partner coin flip; this
// game's slideshow must respect the same content config that gates its
// in-game content, including a fully SFW mix when contentFlags.mature is
// off and a suggestive-only ceiling when romance is off. The mix is the
// ONLY consumer of these ratings — the whole prompt (prefix + picked
// entries + style tail + suffix) is assembled from cap-filtered pools, so
// a restrictive config never lets a mature word into the prompt text.

const RATING_ORDER = { sfw: 0, suggestive: 1, explicit: 2 };

// ContentConfig → the highest rating the slideshow may draw. The most
// restrictive config (every flag off) is the all-SFW mode; the default
// CONTENT_CONFIG (everything on) is the full range.
function menuRatingCap(contentConfig) {
  const cfg = contentConfig || CONTENT_CONFIG;
  const flags = cfg.contentFlags || CONTENT_CONFIG.contentFlags;
  if (flags.mature === false) return 'sfw';          // all-SFW mode
  if (flags.romance === false) return 'suggestive';  // no explicit
  return 'explicit';                                 // full range
}

function menuEntryAtOrBelow(list, cap) {
  const capOrder = RATING_ORDER[cap];
  const pool = list.filter(e => RATING_ORDER[e.r] <= capOrder);
  if (pool.length === 0) return { t: '', r: 'sfw' };
  return pool[Math.floor(Math.random() * pool.length)];
}

const MENU_ART = {
  // Shared style tail + negative prompt for every mix (house style, §6.7).
  // 'child' is in the negative prompt unconditionally — never negotiable.
  styleTail: 'cozy slice-of-life anime illustration, cel-shaded, clean linework, soft volumetric lighting, warm color grade, atmospheric depth, highly detailed background, masterpiece, best quality',
  // Hands are the model's weakest point and the menu shows a LOT of them.
  // The generic 'bad anatomy, mutated hands' pair wasn't holding, so the
  // hand terms are enumerated specifically (count, fusion, length, extra
  // arms) rather than left to one catch-all phrase — diffusion negatives
  // work far better on concrete nouns than on abstract quality words.
  negativePrompt: 'blurry, low quality, deformed, disfigured, bad anatomy, bad hands, bad fingers, mutated hands, malformed hands, poorly drawn hands, extra fingers, missing fingers, fused fingers, too many fingers, six fingers, long fingers, extra digit, missing digit, mangled fingers, extra limbs, extra arms, missing arms, disconnected limbs, malformed limbs, bad proportions, text, watermark, signature, jpeg artifacts, oversaturated, flat colors, simple background, cropped, out of frame, child',

  prefix: {
    sfw: 'A cozy slice-of-life scene in a shared apartment, ',
    suggestive: 'An intimate slice-of-life scene, ',
    explicit: 'An intimate mature slice-of-life scene, ',
  },
  suffix: {
    sfw: '',
    suggestive: ', suggestive, tasteful',
    explicit: ', explicit mature content, nudity, nsfw, adult',
  },

  // One complete noun phrase per entry; the key is the `r` rating tag.
  subjects: [
    { t: 'a young woman with wavy chestnut hair and a spray of freckles', r: 'sfw' },
    { t: 'a tall woman with a sleek black bob and silver earrings', r: 'sfw' },
    { t: 'a woman with soft golden curls and round glasses', r: 'sfw' },
    { t: 'an athletic woman with a pixie cut and a warm smile', r: 'sfw' },
    { t: 'a quiet woman with straight honey-blonde hair', r: 'sfw' },
    { t: 'a woman with vivid teal-dyed hair and a nose ring', r: 'sfw' },
    { t: 'a petite woman with dark skin and box braids', r: 'sfw' },
    { t: 'a young man with tousled dark hair and a soft jaw', r: 'sfw' },
    { t: 'a lanky man with sandy hair and a crooked grin', r: 'sfw' },
    { t: 'a woman with warm brown eyes and a fond, sleepy expression', r: 'sfw' },
    { t: 'a woman in a faded band t-shirt and lounge shorts', r: 'sfw' },
    { t: 'a man with a short beard, reading in an armchair', r: 'sfw' },
    { t: 'a woman with long red hair in a loose braid', r: 'sfw' },
    { t: 'a woman with silver-streaked dark hair and a nose stud', r: 'sfw' },
    { t: 'a broad-shouldered man with a kind face', r: 'sfw' },
    { t: 'a woman with a curtain of dark curls and gold hoop earrings', r: 'sfw' },
    { t: 'a woman with high cheekbones and soft, natural makeup', r: 'sfw' },
    { t: 'a slender woman in a cozy oversized sweater', r: 'sfw' },
    { t: 'a woman with an undercut and a confident smile', r: 'sfw' },
    { t: 'a woman with almond eyes and a gentle laugh', r: 'sfw' },
    { t: 'a woman in soft pyjamas with cat-print socks', r: 'sfw' },
    { t: 'a woman wearing headphones, swaying to music', r: 'sfw' },
    { t: 'a beautiful nude woman with long auburn hair', r: 'explicit' },
    { t: 'a nude woman with pale skin and dark waves', r: 'explicit' },
    { t: 'a bare-chested woman in silk boxers', r: 'explicit' },
    { t: 'a woman in a sheer camisole, barely holding a sheet to her chest', r: 'suggestive' },
  ],

  poses: [
    { t: 'making breakfast in a sunlit kitchen', r: 'sfw' },
    { t: 'curled up reading on a worn sofa', r: 'sfw' },
    { t: 'watering plants on the balcony at dusk', r: 'sfw' },
    { t: 'doing laundry, folding a warm towel', r: 'sfw' },
    { t: 'playing guitar on the floor, eyes closed', r: 'sfw' },
    { t: 'stirring a mug of coffee while gazing out the window', r: 'sfw' },
    { t: 'dancing barefoot in the living room', r: 'sfw' },
    { t: 'playing video games, laughing at the screen', r: 'sfw' },
    { t: 'sprawled on the bed reading a novel', r: 'sfw' },
    { t: 'sketching in a notebook at the kitchen table', r: 'sfw' },
    { t: 'tending a small herb garden by the window', r: 'sfw' },
    { t: 'making tea for two, one mug in each hand', r: 'sfw' },
    { t: 'sitting on the fire escape with a book', r: 'sfw' },
    { t: 'chopping vegetables, apron over a t-shirt', r: 'sfw' },
    { t: 'stretching on a yoga mat in the living room', r: 'sfw' },
    { t: 'watching rain streak the window, a blanket around their shoulders', r: 'sfw' },
    { t: 'building a jigsaw puzzle on the coffee table', r: 'sfw' },
    { t: 'watering a drooping houseplant and talking to it', r: 'sfw' },
    { t: 'lounging in a silk robe with the sash loose', r: 'suggestive' },
    { t: 'stepping out of a steamy shower, towel wrapped low', r: 'suggestive' },
    { t: 'lying across the bed in a lacy camisole', r: 'suggestive' },
    { t: 'pressed against the doorway in nothing but an oversized shirt', r: 'suggestive' },
    { t: 'reclining nude on rumpled sheets, glancing back over a shoulder', r: 'explicit' },
    { t: 'on hands and knees on a bed, arching their back', r: 'explicit' },
    { t: 'sprawled naked on the sofa, stretching languidly', r: 'explicit' },
  ],

  emotions: [
    { t: 'content and at ease', r: 'sfw' },
    { t: 'laughing softly', r: 'sfw' },
    { t: 'sleepy and warm', r: 'sfw' },
    { t: 'thoughtful, staring into the middle distance', r: 'sfw' },
    { t: 'quietly wistful', r: 'sfw' },
    { t: 'pleased with themselves', r: 'sfw' },
    { t: 'playful, a teasing glint in their eyes', r: 'sfw' },
    { t: 'relaxed and unhurried', r: 'sfw' },
    { t: 'fond, a soft smile on their lips', r: 'sfw' },
    { t: 'lost in a good song', r: 'sfw' },
    { t: 'bright and cheerful', r: 'sfw' },
    { t: 'gently self-conscious', r: 'sfw' },
    { t: 'peaceful, at the end of a long day', r: 'sfw' },
    { t: 'amused and a little smug', r: 'sfw' },
    { t: 'flushed and breathless', r: 'suggestive' },
    { t: 'barely-contained anticipation', r: 'suggestive' },
    { t: 'ecstatic, head thrown back', r: 'explicit' },
    { t: 'wanting, dark-eyed and hungry', r: 'explicit' },
  ],

  settings: [
    { t: 'a cozy apartment kitchen with warm pendant lights', r: 'sfw' },
    { t: 'a lived-in living room with mismatched furniture', r: 'sfw' },
    { t: 'a small balcony with potted plants and a city view at dusk', r: 'sfw' },
    { t: 'a cluttered bedroom with fairy lights', r: 'sfw' },
    { t: 'a quiet rooftop at night, the city glittering below', r: 'sfw' },
    { t: 'a neighbourhood coffee shop on a rainy morning', r: 'sfw' },
    { t: 'a laundromat late at night', r: 'sfw' },
    { t: 'a park bench in golden afternoon light', r: 'sfw' },
    { t: 'a cramped but warm kitchen full of dried herbs', r: 'sfw' },
    { t: 'a hallway with a coat rack and a pile of mail', r: 'sfw' },
    { t: 'a sunlit bathroom with a clawfoot tub', r: 'sfw' },
    { t: 'a fire escape with a stray cat watching from the railing', r: 'sfw' },
    { t: 'a living-room floor covered in blankets and pillows', r: 'sfw' },
    { t: 'a bookshop with a reading nook by the window', r: 'sfw' },
    { t: 'a dining table set for one, steam rising from a bowl', r: 'sfw' },
    { t: 'a study with a battered desk and paperbacks stacked everywhere', r: 'sfw' },
    { t: 'a grocery-store aisle, cart half full', r: 'sfw' },
    { t: 'an empty bus shelter in the rain', r: 'sfw' },
    { t: 'a dim bedroom lit only by a string of warm bulbs', r: 'suggestive' },
    { t: 'a shower with the curtain half drawn, warm steam curling', r: 'suggestive' },
    { t: 'a rumpled bed in the soft glow of morning', r: 'explicit' },
    { t: 'a steamy bathroom with the mirrors fogged', r: 'explicit' },
  ],
};

// Composition hint appended for the current viewport orientation, so the
// model frames the scene for the frame it will actually be displayed in
// (the plugin's resolution already sets the aspect; this nudges the
// composition to use that aspect deliberately rather than centering a
// square-ish subject inside it).
const ORIENTATION_HINT = {
  landscape: 'wide horizontal composition, landscape framing, generous negative space to the sides',
  portrait: 'tall vertical composition, portrait framing, vertical depth',
};

// ===== PROMPT V2 — decision-vector generator (ref/prompt-generator-v2.md) ====
// Supersedes the v1 flat mad-lib (one subject + one pose + one emotion + one
// setting) with a ~13-slot decision vector: a parallel context roll (Layer 1)
// frames the scene, a conditioned parallel detail roll (Layer 2) fills it,
// and a small guard-rule pass (Layer 3) repairs cross-slot conflicts. All
// decisions happen in one linear pass; nothing is sequenced.
//
// Authoring decisions from the planning-doc Q&A:
//  - Inclusive pairings (ff/mm/mf, mixed race/gender) with per-player
//    preference filters (gender pools + orientation pairings) read from kv
//    (`menu`/`prefs`). The Options-menu UI comes in a later pass; the engine
//    already honors the data (menuPreferencesCache).
//  - Group scenes up to 4 actors; each actor gets their own clothing clause
//    so the generator keeps them distinct.
//  - Explicit next to mundane settings/activities is DELIBERATE (full nudity
//    while doing ordinary things); the kink slot carries the community's
//    "Free Use" and "Bored & Ignored" scenarios.
//  - Rating gating unchanged: intensity is rolled from the cap-filtered band
//    first and every pool is filtered to that band, so contentConfig still
//    decides the ceiling.
//
// The v1 MENU_ART trait lists (subjects/poses/emotions/settings) remain as
// the migration source; the engine reads PROMPT_V2 below.

const MENU_GALLERY_PREFS_KEY = 'prefs';

const MENU_PREFERENCES_DEFAULTS = {
  actorGenders: { f: true, m: true, nb: true },   // actor pool filters
  pairings: { hetero: true, gay: true, lesbian: true }, // duo orientation pairings
};

let menuPreferencesCache = normalizePreferences(null);

function normalizePreferences(p) {
  const d = MENU_PREFERENCES_DEFAULTS;
  return {
    actorGenders: { ...d.actorGenders, ...((p && p.actorGenders) || {}) },
    pairings: { ...d.pairings, ...((p && p.pairings) || {}) },
  };
}

// Persisted via kv (same 'menu' folder as the gallery options). Called from
// showMainMenu; the options-menu toggles (a later pass) write here too.
async function loadMenuPreferences() {
  try {
    const saved = await root.kv.menu.get(MENU_GALLERY_PREFS_KEY);
    menuPreferencesCache = normalizePreferences(saved);
  } catch (e) {
    menuPreferencesCache = normalizePreferences(null);
  }
  return menuPreferencesCache;
}

const PROMPT_V2 = {
  context: {
    intensity: {
      // The master band: every other pool is filtered to this entry's rating.
      pool: [
        { id: 'cozy',        t: 'cozy domestic bliss', r: 'sfw' },
        { id: 'everyday',    t: 'everyday warmth', r: 'sfw' },
        { id: 'playful',     t: 'playful mischief', r: 'sfw' },
        { id: 'quiet',       t: 'quiet contentment', r: 'sfw' },
        { id: 'flirty',      t: 'flirty tension', r: 'suggestive' },
        { id: 'teasing',     t: 'sultry teasing', r: 'suggestive' },
        { id: 'anticipation',t: 'heated anticipation', r: 'suggestive' },
        { id: 'simmer',      t: 'simmering desire', r: 'suggestive' },
        { id: 'sensual',     t: 'sensual passion', r: 'explicit' },
        { id: 'tasteful',    t: 'tasteful lovemaking', r: 'explicit' },
        { id: 'lewd',        t: 'lewd abandon', r: 'explicit' },
        { id: 'carnal',      t: 'carnal hunger', r: 'explicit' },
        { id: 'hardcore',    t: 'uninhibited hardcore lust', r: 'explicit' },
      ],
    },
    gathering: {
      pool: [
        { id: 'solo',  t: 'solo', r: 'sfw', actors: 1 },
        { id: 'duo',   t: 'duo', r: 'sfw', actors: 2 },
        { id: 'group', t: 'group', r: 'sfw', actors: 3 }, // rolls 3–4
      ],
    },
    setting: {
      pool: [
        { id: 'cozyKitchen',       t: 'a cozy apartment kitchen with warm pendant lights', r: 'sfw' },
        { id: 'livedInLivingRoom', t: 'a lived-in living room with mismatched furniture', r: 'sfw' },
        { id: 'smallBalcony',      t: 'a small balcony with potted plants and a city view at dusk', r: 'sfw' },
        { id: 'clutteredBedroom',  t: 'a cluttered bedroom with fairy lights', r: 'sfw' },
        { id: 'quietRooftop',      t: 'a quiet rooftop at night, the city glittering below', r: 'sfw' },
        { id: 'coffeeShopRain',    t: 'a neighbourhood coffee shop on a rainy morning', r: 'sfw' },
        { id: 'laundromat',        t: 'a laundromat late at night', r: 'sfw' },
        { id: 'parkBench',         t: 'a park bench in golden afternoon light', r: 'sfw' },
        { id: 'crampedKitchen',    t: 'a cramped but warm kitchen full of dried herbs', r: 'sfw' },
        { id: 'hallwayCoatRack',   t: 'a hallway with a coat rack and a pile of mail', r: 'sfw' },
        { id: 'sunlitBathroom',    t: 'a sunlit bathroom with a clawfoot tub', r: 'sfw' },
        { id: 'fireEscape',        t: 'a fire escape with a stray cat watching from the railing', r: 'sfw' },
        { id: 'pillowFloor',       t: 'a living-room floor covered in blankets and pillows', r: 'sfw' },
        { id: 'bookshopNook',      t: 'a bookshop with a reading nook by the window', r: 'sfw' },
        { id: 'diningTable',       t: 'a dining table set for one, steam rising from a bowl', r: 'sfw' },
        { id: 'studyDesk',         t: 'a study with a battered desk and paperbacks stacked everywhere', r: 'sfw' },
        { id: 'groceryAisle',      t: 'a grocery-store aisle, cart half full', r: 'sfw' },
        { id: 'busShelterRain',    t: 'an empty bus shelter in the rain', r: 'sfw' },
        { id: 'sandyBeach',        t: 'a quiet sandy beach at dusk', r: 'sfw', noSnow: true },
        { id: 'partyApartment',    t: 'a crowded party apartment with fairy lights and paper lanterns', r: 'sfw' },
        { id: 'officeDesk',        t: 'a shared office desk at midnight, only a monitor glowing', r: 'sfw' },
        { id: 'dimBedroomBulbs',   t: 'a dim bedroom lit only by a string of warm bulbs', r: 'suggestive' },
        { id: 'showerHalfDrawn',   t: 'a shower with the curtain half drawn, warm steam curling', r: 'suggestive' },
        { id: 'rooftopBar',        t: 'a rooftop bar with string lights', r: 'suggestive', noSnow: true },
        { id: 'rumpledBed',        t: 'a rumpled bed in the soft glow of morning', r: 'explicit' },
        { id: 'steamyBathroom',    t: 'a steamy bathroom with the mirrors fogged', r: 'explicit' },
        { id: 'kitchenByFridge',   t: 'a kitchen counter by the humming fridge, late at night', r: 'explicit' },
        { id: 'laundryRoom',       t: 'a laundry room with warm dryers spinning', r: 'explicit' },
        { id: 'kitchenWindowGarden', t: 'a kitchen window garden with herbs and a humming radiator', r: 'sfw' },
        { id: 'theatreBackstage',  t: 'a dim theatre backstage, ropes and props everywhere', r: 'sfw' },
        { id: 'libraryNight',      t: 'a college library at night, a single lamp glowing', r: 'sfw' },
        { id: 'rooftopGreenhouse', t: 'a rooftop greenhouse with rows of seedlings', r: 'sfw' },
        { id: 'recordShop',        t: 'a vintage record shop with dusty crates', r: 'sfw' },
        { id: 'lateNightDiner',    t: 'a late-night diner with cracked vinyl booths', r: 'sfw' },
        { id: 'trainCarriage',     t: 'a train carriage rattling through the rain', r: 'sfw' },
        { id: 'balconyHammock',    t: 'a sun-drenched balcony with a hammock', r: 'sfw' },
        { id: 'basementGym',       t: 'a basement gym with a heavy bag and chalk dust', r: 'sfw' },
        { id: 'hotelBathroom',     t: 'a cheap hotel bathroom, steam rising off a cracked tub', r: 'suggestive' },
        { id: 'rooftopPool',       t: 'a rooftop pool at night, water lapping at the tiles', r: 'suggestive', noSnow: true },
        { id: 'walkInCloset',      t: 'a walk-in closet lined with warm light and hanging silk', r: 'suggestive' },
        { id: 'pedestalSink',      t: 'a bathroom with a pedestal sink and a cracked mirror', r: 'explicit' },
        { id: 'sunroomDaybed',     t: 'a sunroom with linen curtains and an overstuffed daybed', r: 'explicit' },
        { id: 'backAlleyNeon',     t: 'a back-alley corner in the neon rain', r: 'explicit' },
        { id: 'storeroomBlankets', t: 'a storeroom stacked with boxes and old blankets', r: 'explicit' },
      ],
    },
    timeOfDay: {
      pool: [
        { id: 'dawn', t: 'dawn', r: 'sfw' },
        { id: 'earlyMorning', t: 'early morning', r: 'sfw' },
        { id: 'lateMorning', t: 'late morning', r: 'sfw' },
        { id: 'afternoon', t: 'afternoon', r: 'sfw' },
        { id: 'goldenHour', t: 'golden hour', r: 'sfw' },
        { id: 'evening', t: 'evening', r: 'sfw' },
        { id: 'night', t: 'night', r: 'sfw' },
        { id: 'justPastMidnight', t: 'just past midnight', r: 'sfw' },
      ],
    },
    weather: {
      pool: [
        { id: 'clearSkies', t: 'clear skies', r: 'sfw' },
        { id: 'overcast', t: 'soft overcast light', r: 'sfw' },
        { id: 'drizzle', t: 'drizzling rain', r: 'sfw' },
        { id: 'heavyRain', t: 'heavy rain against the windows', r: 'sfw' },
        { id: 'gentleSnow', t: 'gentle snow falling', r: 'sfw' },
        { id: 'warmBreeze', t: 'a warm breeze', r: 'sfw' },
        { id: 'humidAir', t: 'humid summer air', r: 'sfw' },
      ],
    },
    framing: {
      pool: [
        { id: 'wide', t: 'wide establishing shot', r: 'sfw' },
        { id: 'medium', t: 'medium shot', r: 'sfw' },
        { id: 'closeUp', t: 'close-up', r: 'sfw' },
        { id: 'overShoulder', t: 'over-the-shoulder shot', r: 'sfw' },
        { id: 'lowAngle', t: 'low angle looking up', r: 'sfw' },
        { id: 'highAngle', t: 'high angle looking down', r: 'sfw' },
        { id: 'fromBehind', t: 'shot from behind', r: 'suggestive' },
        { id: 'povShot', t: 'first-person point-of-view shot', r: 'suggestive' },
        { id: 'intimateCloseUp', t: 'intimate close-up on faces and hands', r: 'suggestive' },
        { id: 'macroDetail', t: 'suggestive macro detail, shallow focus', r: 'explicit' },
      ],
    },
  },

  detail: {
    // Shared actor pool — gender-tagged so the preference filters work.
    actor: {
      pool: [
        { id: 'chestnutFreckles', t: 'a young woman with wavy chestnut hair and a spray of freckles', r: 'sfw', g: 'f' },
        { id: 'blackBob', t: 'a tall woman with a sleek black bob and silver earrings', r: 'sfw', g: 'f' },
        { id: 'goldenCurls', t: 'a woman with soft golden curls and round glasses', r: 'sfw', g: 'f' },
        { id: 'pixieSmile', t: 'an athletic woman with a pixie cut and a warm smile', r: 'sfw', g: 'f' },
        { id: 'honeyBlonde', t: 'a quiet woman with straight honey-blonde hair', r: 'sfw', g: 'f' },
        { id: 'tealHair', t: 'a woman with vivid teal-dyed hair and a nose ring', r: 'sfw', g: 'f' },
        { id: 'boxBraids', t: 'a petite woman with dark skin and box braids', r: 'sfw', g: 'f' },
        { id: 'warmBrownEyes', t: 'a woman with warm brown eyes and a fond, sleepy expression', r: 'sfw', g: 'f' },
        { id: 'bandTee', t: 'a woman in a faded band t-shirt and lounge shorts', r: 'sfw', g: 'f' },
        { id: 'redBraids', t: 'a woman with long red hair in a loose braid', r: 'sfw', g: 'f' },
        { id: 'silverStreak', t: 'a woman with silver-streaked dark hair and a nose stud', r: 'sfw', g: 'f' },
        { id: 'darkCurlsHoops', t: 'a woman with a curtain of dark curls and gold hoop earrings', r: 'sfw', g: 'f' },
        { id: 'cheekbones', t: 'a woman with high cheekbones and soft, natural makeup', r: 'sfw', g: 'f' },
        { id: 'oversizedSweater', t: 'a slender woman in a cozy oversized sweater', r: 'sfw', g: 'f' },
        { id: 'undercutSmile', t: 'a woman with an undercut and a confident smile', r: 'sfw', g: 'f' },
        { id: 'almondEyes', t: 'a woman with almond eyes and a gentle laugh', r: 'sfw', g: 'f' },
        { id: 'catSocks', t: 'a woman in soft pyjamas with cat-print socks', r: 'sfw', g: 'f' },
        { id: 'headphones', t: 'a woman wearing headphones, swaying to music', r: 'sfw', g: 'f' },
        { id: 'auburnNude', t: 'a beautiful nude woman with long auburn hair', r: 'explicit', g: 'f' },
        { id: 'paleDarkWaves', t: 'a nude woman with pale skin and dark waves', r: 'explicit', g: 'f' },
        { id: 'tousledDark', t: 'a young man with tousled dark hair and a soft jaw', r: 'sfw', g: 'm' },
        { id: 'sandyCrooked', t: 'a lanky man with sandy hair and a crooked grin', r: 'sfw', g: 'm' },
        { id: 'beardedReader', t: 'a man with a short beard, reading in an armchair', r: 'sfw', g: 'm' },
        { id: 'broadKind', t: 'a broad-shouldered man with a kind face', r: 'sfw', g: 'm' },
        { id: 'glassesWarm', t: 'a man with warm eyes and square glasses', r: 'sfw', g: 'm' },
        { id: 'shortCurls', t: 'an athletic man with short curls and a lopsided smile', r: 'sfw', g: 'm' },
        { id: 'rolledSleeves', t: 'a tall man with a quiet confidence and rolled sleeves', r: 'sfw', g: 'm' },
        { id: 'neatFade', t: 'a man with a neat fade and a teasing grin', r: 'sfw', g: 'm' },
        { id: 'freckledShy', t: 'a skinny man with freckles and a shy laugh', r: 'sfw', g: 'm' },
        { id: 'paintStained', t: 'a man with a strong jaw and paint-stained hands', r: 'sfw', g: 'm' },
        { id: 'jawlineNude', t: 'a muscled man with a sharp jawline, naked and confident', r: 'explicit', g: 'm' },
        { id: 'tannedPlayful', t: 'a fit man with tanned skin and a playful grin', r: 'explicit', g: 'm' },
        { id: 'lavenderCrop', t: 'a person with a soft round face and short-cropped lavender hair', r: 'sfw', g: 'nb' },
        { id: 'sharpUndercut', t: 'an androgynous person with a sharp undercut and dark eyes', r: 'sfw', g: 'nb' },
        { id: 'warmSmirk', t: 'a person with warm skin, a confident smirk, and a tank top', r: 'sfw', g: 'nb' },
        { id: 'bareChestedBoxers', t: 'a bare-chested woman in silk boxers', r: 'explicit', g: 'f' },
        { id: 'twistBraidsGrin', t: 'a woman with a cascade of boxer-braid twists and a gap-toothed grin', r: 'sfw', g: 'f' },
        { id: 'platinumWinged', t: 'a woman with short platinum hair and sharp winged eyeliner', r: 'sfw', g: 'f' },
        { id: 'dimpledSleepy', t: 'a soft-curved woman with dimples and a sleepy-eyed gaze', r: 'sfw', g: 'f' },
        { id: 'dreadlocksTied', t: 'a tall woman with dreadlocks tied back and a nose ring', r: 'sfw', g: 'f' },
        { id: 'bluntFringe', t: 'a woman with a blunt fringe and a shy half-smile', r: 'sfw', g: 'f' },
        { id: 'sunKissedTan', t: 'a woman with a sun-kissed tan and freckled shoulders', r: 'sfw', g: 'f' },
        { id: 'fullFigureSmirk', t: 'a woman with a full figure and a knowing smirk, entirely at ease', r: 'explicit', g: 'f' },
        { id: 'inkBlackMischevious', t: 'a petite woman with ink-black hair and a mischievous look', r: 'explicit', g: 'f' },
        { id: 'closeCroppedBeard', t: 'a man with a close-cropped beard and kind, crinkled eyes', r: 'sfw', g: 'm' },
        { id: 'sunBleached', t: 'a wiry man with sun-bleached hair and a quiet laugh', r: 'sfw', g: 'm' },
        { id: 'broadEasySmile', t: 'a man with broad shoulders and a soft, easy smile', r: 'sfw', g: 'm' },
        { id: 'silverThreaded', t: 'a man with silver-threaded hair and a silver watch', r: 'sfw', g: 'm' },
        { id: 'tattooSleeve', t: 'a lean man with a tattoo sleeve and a confident lean', r: 'explicit', g: 'm' },
        { id: 'strongForearms', t: 'a man with strong forearms and a patient gaze', r: 'explicit', g: 'm' },
        { id: 'roundCheeksGlasses', t: 'a person with round cheeks, round glasses, and a kind smile', r: 'sfw', g: 'nb' },
        { id: 'buzzCutPiercings', t: 'a person with a buzz cut and a constellation of piercings', r: 'sfw', g: 'nb' },
        { id: 'silverDyeCurls', t: 'a person with silver-dyed curls and a gentle confidence', r: 'explicit', g: 'nb' },
        { id: 'shavedSideSultry', t: 'a slender person with a shaved side and a sultry look', r: 'explicit', g: 'nb' },
        { id: 'morningRaspy', t: 'a woman with messy morning hair and a raspy, affectionate voice', r: 'sfw', g: 'f' },
        { id: 'grinDimples', t: 'a young man with sun-darkened skin and a teasing grin', r: 'sfw', g: 'm' },
      ],
    },
    clothing: {
      // level: dressed | partial | nude — the guard layer uses it. There is
      // deliberately NO "nude requires private activity" rule: full nudity
      // while doing ordinary things is a requested feature.
      //
      // `lean: 'f' | 'm'` is a SOFT gender preference, not a gate. Clothing
      // used to be rolled blind to the wearer, which put sundresses and lace
      // lingerie on male actors often enough to be the single most common
      // source of awkward output. Cross-lean picks are down-weighted to
      // crossLeanWeight rather than removed — the combination is still
      // reachable (deliberately: it's a valid thing to depict), just rare
      // instead of ~1-in-8. Entries with no `lean` are unisex and always
      // full weight; non-binary actors treat everything as unisex.
      //
      // Masculine-leaning entries were added at the same time. Down-weighting
      // alone would have funnelled every male actor into the handful of
      // unisex items, which trades one monotony for another.
      crossLeanWeight: 0.08,
      pool: [
        { id: 'sweaterLeggings', t: 'wearing a cozy oversized sweater and leggings', r: 'sfw', level: 'dressed', lean: 'f' },
        { id: 'catSocksPjs', t: 'wearing soft pyjamas with cat-print socks', r: 'sfw', level: 'dressed' },
        { id: 'bandTeeShorts', t: 'wearing a faded band t-shirt and lounge shorts', r: 'sfw', level: 'dressed' },
        { id: 'teeJeans', t: 'wearing a simple t-shirt and jeans', r: 'sfw', level: 'dressed' },
        { id: 'sundress', t: 'wearing a summer sundress', r: 'sfw', level: 'dressed', lean: 'f' },
        { id: 'apronTee', t: 'wearing an apron over a t-shirt', r: 'sfw', level: 'dressed' },
        { id: 'workoutGear', t: 'wearing workout clothes', r: 'sfw', level: 'dressed' },
        { id: 'henleySweats', t: 'wearing a worn henley and grey sweatpants', r: 'sfw', level: 'dressed', lean: 'm' },
        { id: 'flannelJeans', t: 'wearing an open flannel shirt over a plain tee and jeans', r: 'sfw', level: 'dressed', lean: 'm' },
        { id: 'hoodieJoggers', t: 'wearing a zip-up hoodie and joggers', r: 'sfw', level: 'dressed' },
        { id: 'halfUnbuttoned', t: 'wearing a loose button-up shirt, half unbuttoned', r: 'suggestive', level: 'partial' },
        { id: 'oversizedShirt', t: 'wearing just an oversized shirt', r: 'suggestive', level: 'partial' },
        { id: 'laceLingerie', t: 'wearing lacy lingerie', r: 'suggestive', level: 'partial', lean: 'f' },
        { id: 'silkRobe', t: 'wearing a silk robe with the sash loose', r: 'suggestive', level: 'partial' },
        { id: 'underwear', t: 'wearing only underwear', r: 'suggestive', level: 'partial' },
        { id: 'boxersOnly', t: 'wearing only loose boxer shorts', r: 'suggestive', level: 'partial', lean: 'm' },
        { id: 'lowSweatpants', t: 'bare-chested in low-slung sweatpants', r: 'suggestive', level: 'partial', lean: 'm' },
        { id: 'fullyNude', t: 'completely nude', r: 'explicit', level: 'nude' },
        { id: 'apronOnly', t: 'nude except for an open apron', r: 'explicit', level: 'nude' },
        { id: 'towelHip', t: 'nude with a towel loosely wrapped at the hip', r: 'explicit', level: 'nude' },
        { id: 'jewelryOnly', t: 'nude save for a thin strap of jewelry', r: 'explicit', level: 'nude', lean: 'f' },
      ],
    },
    pose: {
      pool: [
        { id: 'handOnHip', t: 'standing with a hand on their hip', r: 'sfw', p: 'solo' },
        { id: 'kneesTucked', t: 'seated on the sofa with knees tucked to their chest', r: 'sfw', p: 'solo' },
        { id: 'sprawledBed', t: 'sprawled across the bed', r: 'sfw', p: 'solo' },
        { id: 'kneelingFloor', t: 'kneeling on the floor', r: 'sfw', p: 'solo' },
        { id: 'yogaStretch', t: 'stretching on a yoga mat', r: 'sfw', p: 'solo' },
        { id: 'counterLeaning', t: 'leaning against the kitchen counter', r: 'sfw', p: 'solo' },
        { id: 'armchairCurled', t: 'curled up in an armchair', r: 'sfw', p: 'solo' },
        { id: 'lyingOnSide', t: 'lying on their side', r: 'sfw', p: 'solo' },
        { id: 'crossLegged', t: 'sitting cross-legged on the floor', r: 'sfw', p: 'solo' },
        { id: 'barefootDancing', t: 'dancing barefoot', r: 'sfw', p: 'solo' },
        { id: 'bentCounter', t: 'bent over the counter', r: 'sfw', p: 'solo' },
        { id: 'windowsillPerched', t: 'perched on the windowsill', r: 'sfw', p: 'solo' },
        { id: 'couchLounging', t: 'lounging on the couch', r: 'sfw', p: 'solo' },
        { id: 'proneFloor', t: 'lying prone on the floor', r: 'sfw', p: 'solo' },
        { id: 'bedEdge', t: 'sitting on the edge of the bed', r: 'sfw', p: 'solo' },
        { id: 'doorframeLean', t: 'leaning against the doorframe', r: 'sfw', p: 'solo' },
        { id: 'plantCrouch', t: 'crouching to tend a plant', r: 'sfw', p: 'solo' },
        { id: 'railingRest', t: 'resting on the fire escape railing', r: 'sfw', p: 'solo' },
        { id: 'silkRecline', t: 'reclining in a silk robe', r: 'suggestive', p: 'solo' },
        { id: 'languidStretch', t: 'stretching languidly on the bed', r: 'suggestive', p: 'solo' },
        { id: 'slowDancing', t: 'slow dancing together', r: 'sfw', p: 'pair' },
        { id: 'foreheadsTouch', t: 'with foreheads touching', r: 'sfw', p: 'pair' },
        { id: 'handInHand', t: 'hand in hand by the window', r: 'sfw', p: 'pair' },
        { id: 'sittingInLap', t: 'sitting in the other’s lap', r: 'sfw', p: 'pair' },
        { id: 'couchEmbrace', t: 'embraced on the couch', r: 'sfw', p: 'pair' },
        { id: 'spooning', t: 'spooning in bed', r: 'sfw', p: 'pair' },
        { id: 'kissingDeep', t: 'kissing deeply', r: 'suggestive', p: 'pair' },
        { id: 'intertwined', t: 'intertwined in an embrace', r: 'suggestive', p: 'pair' },
        { id: 'straddling', t: 'one straddling the other', r: 'explicit', p: 'pair' },
        { id: 'tangledCouch', t: 'tangled together on the couch', r: 'explicit', p: 'pair' },
        { id: 'showerWashing', t: 'washing each other in the shower', r: 'explicit', p: 'pair' },
        { id: 'backAgainstChest', t: 'back pressed against the other’s chest', r: 'explicit', p: 'pair' },
        { id: 'missionarySheets', t: 'in missionary on rumpled sheets', r: 'explicit', p: 'pair' },
        { id: 'ridingArmchair', t: 'riding the other in an armchair', r: 'explicit', p: 'pair' },
        { id: 'doggyBed', t: 'on hands and knees on the bed', r: 'explicit', p: 'pair' },
        { id: 'counterPinned', t: 'pinned against the counter', r: 'explicit', p: 'pair' },
        { id: 'floorIntertwined', t: 'intertwined on the kitchen floor', r: 'explicit', p: 'pair' },
        { id: 'handsOnWindowsill', t: 'leaning back on their hands on the windowsill', r: 'sfw', p: 'solo' },
        { id: 'legsSwinging', t: 'swinging their legs off the edge of a counter', r: 'sfw', p: 'solo' },
        { id: 'twirling', t: 'twirling in the middle of the room', r: 'sfw', p: 'solo' },
        { id: 'hunchedDesk', t: 'hunched over a desk, deep in concentration', r: 'sfw', p: 'solo' },
        { id: 'archedSlowStretch', t: 'arching their back in a slow stretch, head tilted back', r: 'suggestive', p: 'solo' },
        { id: 'shoulderToShoulder', t: 'shoulder to shoulder watching a screen', r: 'sfw', p: 'pair' },
        { id: 'slowSmiles', t: 'trading slow smiles across a table', r: 'sfw', p: 'pair' },
        { id: 'midLaughLean', t: 'caught mid-laugh, leaning into each other', r: 'suggestive', p: 'pair' },
        { id: 'waistFromBehind', t: 'held from behind at the waist', r: 'explicit', p: 'pair' },
        { id: 'couchArmBent', t: 'bent over the arm of the couch', r: 'explicit', p: 'pair' },
        { id: 'onKneesBefore', t: 'on their knees before the other', r: 'explicit', p: 'pair' },
        { id: 'packedCouch', t: 'packed onto a single couch, knees overlapping', r: 'sfw', p: 'group' },
        { id: 'bedChain', t: 'spread across the bed in a tangle of limbs', r: 'explicit', p: 'group' },
        { id: 'gatheredSofa', t: 'gathered on the sofa', r: 'sfw', p: 'group' },
        { id: 'dinnerTable', t: 'arranged around the dinner table', r: 'sfw', p: 'group' },
        { id: 'blanketHuddle', t: 'huddled under a blanket together', r: 'sfw', p: 'group' },
        { id: 'photoLean', t: 'all leaning in together', r: 'sfw', p: 'group' },
        { id: 'bedPile', t: 'tangled together in a pile on the bed', r: 'explicit', p: 'group' },
        { id: 'floorPile', t: 'intertwined together on the floor', r: 'explicit', p: 'group' },
      ],
    },
    activity: {
      pool: [
        { id: 'makingBreakfast', t: 'making breakfast', r: 'sfw', p: 'solo', mundane: true },
        { id: 'choppingVeg', t: 'chopping vegetables', r: 'sfw', p: 'solo', mundane: true },
        { id: 'stirringSoup', t: 'stirring a pot of soup', r: 'sfw', p: 'solo', mundane: true },
        { id: 'wateringPlants', t: 'watering the plants', r: 'sfw', p: 'solo', mundane: true },
        { id: 'doingLaundry', t: 'doing laundry', r: 'sfw', p: 'solo', mundane: true },
        { id: 'foldingClothes', t: 'folding warm laundry', r: 'sfw', p: 'solo', mundane: true },
        { id: 'playingGames', t: 'playing video games', r: 'sfw', p: 'solo', mundane: true },
        { id: 'readingNovel', t: 'reading a novel', r: 'sfw', p: 'solo', mundane: true },
        { id: 'sketching', t: 'sketching in a notebook', r: 'sfw', p: 'solo', mundane: true },
        { id: 'buildingPuzzle', t: 'building a jigsaw puzzle', r: 'sfw', p: 'solo', mundane: true },
        { id: 'watchingRain', t: 'watching the rain streak the window', r: 'sfw', p: 'solo', mundane: true },
        { id: 'strummingGuitar', t: 'strumming a guitar', r: 'sfw', p: 'solo', mundane: true },
        { id: 'brewingCoffee', t: 'brewing coffee', r: 'sfw', p: 'solo', mundane: true },
        { id: 'tidyingUp', t: 'tidying up', r: 'sfw', p: 'solo', mundane: true },
        { id: 'bakingBread', t: 'baking bread', r: 'sfw', p: 'solo', mundane: true },
        { id: 'dancingToMusic', t: 'dancing to music', r: 'sfw', p: 'any' },
        { id: 'takeoutDinner', t: 'sharing a takeout dinner', r: 'sfw', p: 'pair' },
        { id: 'movieTogether', t: 'watching a movie together', r: 'sfw', p: 'pair' },
        { id: 'playingCards', t: 'playing cards with friends', r: 'sfw', p: 'group' },
        { id: 'birthday', t: 'celebrating a birthday', r: 'sfw', p: 'group' },
        { id: 'gamingOnline', t: 'gaming online with friends', r: 'sfw', p: 'group' },
        { id: 'swappingPlaylists', t: 'swapping playlists', r: 'sfw', p: 'pair' },
        { id: 'braidingHair', t: 'braiding each other’s hair', r: 'sfw', p: 'pair' },
        { id: 'slowDancingKitchen', t: 'slow dancing in the kitchen', r: 'suggestive', p: 'pair' },
        { id: 'sharingWine', t: 'sharing a bottle of wine', r: 'suggestive', p: 'pair' },
        { id: 'backMassage', t: 'giving each other a back massage', r: 'suggestive', p: 'pair' },
        { id: 'cuddlingBlanket', t: 'cuddling under a blanket', r: 'suggestive', p: 'pair' },
        { id: 'whisperingSecrets', t: 'whispering secrets in bed', r: 'suggestive', p: 'pair' },
        { id: 'kissingWall', t: 'slow kissing against the wall', r: 'suggestive', p: 'pair' },
        { id: 'undressing', t: 'slowly removing each other’s clothes', r: 'suggestive', p: 'pair' },
        { id: 'sunbathing', t: 'sunbathing together', r: 'suggestive', p: 'pair' },
        { id: 'showerTogether', t: 'washing each other in the shower', r: 'suggestive', p: 'pair' },
        { id: 'makingLoveBed', t: 'making love in bed', r: 'explicit', p: 'pair' },
        { id: 'counterSex', t: 'having sex against the kitchen counter', r: 'explicit', p: 'pair', mundane: true },
        { id: 'eatenOutCouch', t: 'being eaten out on the couch', r: 'explicit', p: 'pair', needs: ['f'] },
        { id: 'blownWhileGaming', t: 'being blown while gaming at the desk', r: 'explicit', p: 'pair', mundane: true, needs: ['m'] },
        { id: 'grindingLap', t: 'grinding on the other’s lap', r: 'explicit', p: 'pair' },
        { id: 'rumpledSex', t: 'sex on rumpled sheets', r: 'explicit', p: 'pair' },
        { id: 'quickieShower', t: 'a quickie in the shower', r: 'explicit', p: 'pair' },
        { id: 'kitchenFloorSex', t: 'sex on the kitchen floor', r: 'explicit', p: 'pair', mundane: true },
        { id: 'sofaMasturbation', t: 'masturbating on the sofa', r: 'explicit', p: 'solo' },
        { id: 'eatenOutWindow', t: 'getting eaten out by the window', r: 'explicit', p: 'pair', mundane: true, needs: ['f'] },
        { id: 'fridgeSex', t: 'sex against the fridge', r: 'explicit', p: 'pair', mundane: true },
        { id: 'couchTvSex', t: 'couch sex while the TV plays', r: 'explicit', p: 'pair', mundane: true },
        { id: 'laundrySex', t: 'sex in the laundry room', r: 'explicit', p: 'pair', mundane: true },
        { id: 'dawnSex', t: 'making love at dawn', r: 'explicit', p: 'pair' },
        { id: 'groupBedPlay', t: 'group play on the bed', r: 'explicit', p: 'group' },
        { id: 'peelingOranges', t: 'peeling oranges at the sink', r: 'sfw', p: 'solo', mundane: true },
        { id: 'feedingStray', t: 'feeding the stray cat on the fire escape', r: 'sfw', p: 'solo', mundane: true },
        { id: 'rearrangingBookshelf', t: 'rearranging the bookshelf', r: 'sfw', p: 'solo', mundane: true },
        { id: 'bathMasturbation', t: 'masturbating in a hot bath', r: 'explicit', p: 'solo' },
        { id: 'windowMasturbation', t: 'touching themselves by the rain-streaked window', r: 'explicit', p: 'solo' },
        { id: 'staircaseSex', t: 'sex against the stairwell railing', r: 'explicit', p: 'pair' },
        { id: 'showerGrinding', t: 'grinding in the shower against the tiles', r: 'explicit', p: 'pair' },
        { id: 'groupShower', t: 'group play in the shower, steam everywhere', r: 'explicit', p: 'group' },
        { id: 'cocoaBubbles', t: 'blowing bubbles in a mug of cocoa', r: 'sfw', p: 'solo', mundane: true },
        { id: 'pinningLaundry', t: 'pinning laundry on a line', r: 'sfw', p: 'solo', mundane: true },
        { id: 'boardGameNight', t: 'playing a board game with dice and laughter', r: 'sfw', p: 'group' },
        { id: 'cookingDinnerFriends', t: 'cooking a big dinner for friends', r: 'sfw', p: 'group' },
        { id: 'armWrestling', t: 'arm-wrestling over the kitchen table', r: 'sfw', p: 'pair' },
        { id: 'singingRadio', t: 'singing terribly along to the radio', r: 'sfw', p: 'any' },
        { id: 'unbuttoningShirt', t: 'slowly unbuttoning a shirt', r: 'suggestive', p: 'pair' },
        { id: 'dryingEachOther', t: 'drying each other off after a shower', r: 'suggestive', p: 'pair' },
        { id: 'sharedCigarette', t: 'sharing a cigarette on the fire escape', r: 'suggestive', p: 'pair' },
        { id: 'coconutOilMassage', t: 'massaging coconut oil into sun-warmed shoulders', r: 'suggestive', p: 'pair' },
        { id: 'bathtubEatenOut', t: 'being eaten out in the bathtub', r: 'explicit', p: 'pair', needs: ['f'] },
        { id: 'tableHandjob', t: 'a handjob under the kitchen table', r: 'explicit', p: 'pair', mundane: true },
        { id: 'carBackseat', t: 'sex in the back of a car', r: 'explicit', p: 'pair' },
        { id: 'fireplaceSex', t: 'making love on the floor in front of the fireplace', r: 'explicit', p: 'pair' },
        { id: 'sinkSex', t: 'sex against the bathroom sink', r: 'explicit', p: 'pair' },
        { id: 'watchingMasturbate', t: 'watching their partner masturbate', r: 'explicit', p: 'pair' },
        { id: 'sunriseLovemaking', t: 'slow, deep lovemaking at sunrise', r: 'explicit', p: 'pair' },
        { id: 'sunLoungerCunnilingus', t: 'cunnilingus on a sun lounger', r: 'explicit', p: 'pair', needs: ['f'] },
        { id: 'rooftopBlowjob', t: 'a blowjob on the roof at night', r: 'explicit', p: 'pair', needs: ['m'] },
        { id: 'fridgeBurningDinner', t: 'fucking against the fridge while dinner burns', r: 'explicit', p: 'pair', mundane: true },
        { id: 'showerRiding', t: 'riding in the shower with water everywhere', r: 'explicit', p: 'pair' },
        { id: 'groupChainSex', t: 'group sex in a chain on the bed', r: 'explicit', p: 'group' },
      ],
    },
    emotion: {
      pool: [
        { id: 'content', t: 'content and at ease', r: 'sfw' },
        { id: 'laughing', t: 'laughing softly', r: 'sfw' },
        { id: 'sleepy', t: 'sleepy and warm', r: 'sfw' },
        { id: 'thoughtful', t: 'thoughtful, staring into the middle distance', r: 'sfw' },
        { id: 'wistful', t: 'quietly wistful', r: 'sfw' },
        { id: 'pleased', t: 'pleased with themselves', r: 'sfw' },
        { id: 'playful', t: 'playful, a teasing glint in their eyes', r: 'sfw' },
        { id: 'relaxed', t: 'relaxed and unhurried', r: 'sfw' },
        { id: 'fond', t: 'fond, a soft smile on their lips', r: 'sfw' },
        { id: 'inSong', t: 'lost in a good song', r: 'sfw' },
        { id: 'cheerful', t: 'bright and cheerful', r: 'sfw' },
        { id: 'selfConscious', t: 'gently self-conscious', r: 'sfw' },
        { id: 'peaceful', t: 'peaceful, at the end of a long day', r: 'sfw' },
        { id: 'smug', t: 'amused and a little smug', r: 'sfw' },
        { id: 'flushed', t: 'flushed and breathless', r: 'suggestive' },
        { id: 'anticipation', t: 'barely-contained anticipation', r: 'suggestive' },
        { id: 'ecstatic', t: 'ecstatic, head thrown back', r: 'explicit' },
        { id: 'wanting', t: 'wanting, dark-eyed and hungry', r: 'explicit' },
        { id: 'devoted', t: 'devoted and adoring', r: 'explicit' },
        { id: 'giddy', t: 'giddy, kicking their feet', r: 'sfw' },
        { id: 'tender', t: 'tender and soft', r: 'sfw' },
        { id: 'smoldering', t: 'smoldering, eyes half-lidded', r: 'suggestive' },
        { id: 'blushingCaught', t: 'caught off guard and blushing', r: 'suggestive' },
        { id: 'wrecked', t: 'wrecked and satisfied', r: 'explicit' },
        { id: 'desperate', t: 'desperate, hips shifting', r: 'explicit' },
        { id: 'overwhelmed', t: 'overwhelmed with pleasure', r: 'explicit' },
      ],
    },
    style: {
      pool: [
        { id: 'cozyWarm', t: 'warm cozy lighting', r: 'sfw' },
        { id: 'moodyTwilight', t: 'moody twilight tones', r: 'sfw' },
        { id: 'dreamy', t: 'dreamy soft focus', r: 'sfw' },
        { id: 'cinematic', t: 'cinematic dramatic lighting', r: 'sfw' },
        { id: 'neon', t: 'neon-tinted glow', r: 'sfw' },
        { id: 'natural', t: 'soft natural daylight', r: 'sfw' },
      ],
    },
    kink: {
      // Explicit-only scenarios; 'plain' is the neutral default (empty text,
      // no scenario framing). Requires ≥2 actors, so only offered for
      // duo/group scenes.
      pool: [
        { id: 'plain', t: '', r: 'sfw', p: 'any' },
        { id: 'freeuse', t: 'free use scenario, eager and available, anything goes', r: 'explicit', p: 'pair' },
        { id: 'boredignored', t: 'bored and ignored scenario, one actor absorbed in an ordinary task while the other uses them', r: 'explicit', p: 'pair' },
        { id: 'praise', t: 'praise kink scenario, reverent and encouraging, soft words', r: 'explicit', p: 'pair' },
        { id: 'tease', t: 'teasing denial scenario, slow and merciless, begging', r: 'explicit', p: 'pair' },
        { id: 'aftercare', t: 'aftercare scenario, tender and gentle, holding close afterward', r: 'explicit', p: 'pair' },
        { id: 'risky', t: 'semi-public scenario, risky and hushed, trying not to be caught', r: 'explicit', p: 'pair' },
        { id: 'wakeup', t: 'lazy wake-up scenario, soft morning light, half-asleep and needy', r: 'explicit', p: 'pair' },
        { id: 'worship', t: 'worship scenario, reverent attention to every inch of their body', r: 'explicit', p: 'pair' },
        { id: 'brat', t: 'bratty and defiant, coaxed into compliance', r: 'explicit', p: 'pair' },
      ],
    },
  },

  // Layer 3 — cross-slot guard rules. `when` matches on slot ids (AND across
  // keys) or is a predicate function; `fix` resamples a slot from its pool
  // filtered by `filter`. There is deliberately no "nude requires a private
  // activity" rule — explicit+mundane is a requested feature.
  rules: [
    // Kink scenarios want an ordinary activity in progress (and freeuse /
    // bored-and-ignored only make sense when a mundane task is happening).
    { when: (v) => v.kink && ['freeuse', 'boredignored'].includes(v.kink.id) && v.activity && !v.activity.mundane,
      fix: { slot: 'activity', filter: (e) => e.mundane === true } },
    // A sexual activity with everyone fully dressed is incoherent.
    { when: (v) => v.activity && v.activity.r === 'explicit' && v.clothing && v.clothing.every((c) => c.level === 'dressed'),
      fix: { slot: 'clothing', filter: (e) => e.level !== 'dressed' } },
    // An explicit-intensity scene with a plain (sfw) activity and everyone
    // dressed has no explicit content at all while carrying explicit tags —
    // force nudity so "explicit + doing the dishes" reads as intended.
    { when: (v) => RATING_ORDER[v.intensity.r] === 2 && v.activity && v.activity.r === 'sfw' && v.kink && v.kink.id === 'plain' && v.clothing && v.clothing.every((c) => c.level === 'dressed'),
      fix: { slot: 'clothing', filter: (e) => e.level !== 'dressed' } },
    // Snow and beach/rooftop settings clash — fix the setting, not the weather.
    { when: { weather: ['gentleSnow'], setting: ['sandyBeach', 'rooftopBar'] },
      fix: { slot: 'setting', filter: (e) => !e.noSnow } },
  ],
};

// --- Engine ---
function peopleOK(p, count) {
  if (p === 'any' || !p) return true;
  if (p === 'solo') return count === 1;
  if (p === 'pair') return count >= 2;
  if (p === 'group') return count >= 3;
  return true;
}

// Gender-aware activities: an entry with `needs` lists the gender(s) the
// scene must include (non-binary counts as either), so "being blown" never
// lands in a lesbian scene and "being eaten out" never lands in a gay one.
function needsSatisfied(e, v) {
  if (!e.needs || e.needs.length === 0) return true;
  const genders = new Set((v.actors || []).map((a) => a.g));
  return e.needs.every((n) => genders.has(n) || genders.has('nb'));
}

function activityOK(e, v) {
  return peopleOK(e.p, v.actorCount) && needsSatisfied(e, v);
}

function pickFrom(pool, order) {
  const elig = pool.filter((e) => RATING_ORDER[e.r] <= order);
  if (elig.length === 0) return null;
  return elig[Math.floor(Math.random() * elig.length)];
}

function enabledGenders(prefs) {
  return ['f', 'm', 'nb'].filter((g) => prefs.actorGenders[g]);
}

// Possible duo gender-pairs given the preference filters.
function pairingGenders(prefs) {
  const g = enabledGenders(prefs);
  const options = [];
  if (prefs.pairings.hetero && g.includes('f') && g.includes('m')) options.push(['f', 'm']);
  if (prefs.pairings.gay && g.includes('m')) options.push(['m', 'm']);
  if (prefs.pairings.lesbian && g.includes('f')) options.push(['f', 'f']);
  if (options.length === 0 && g.length > 0) {
    options.push(g.length > 1 ? [g[0], g[1]] : [g[0], g[0]]);
  }
  return options;
}

function chooseActorGenders(count, prefs) {
  const g = enabledGenders(prefs);
  if (g.length === 0) return null;
  if (count === 1) return [g[Math.floor(Math.random() * g.length)]];
  if (count === 2) {
    const pairs = pairingGenders(prefs);
    if (pairs.length === 0) return null;
    const p = pairs[Math.floor(Math.random() * pairs.length)];
    return Math.random() < 0.5 ? p.slice() : p.slice().reverse();
  }
  const out = [];
  for (let i = 0; i < count; i++) out.push(g[Math.floor(Math.random() * g.length)]);
  if (out.length >= 2 && new Set(out).size === 1 && g.length > 1) {
    out[1] = g[(g.indexOf(out[0]) + 1) % g.length];
  }
  return out;
}

function rollActors(v, prefs) {
  const bandOrder = RATING_ORDER[v.intensity.r];
  const genders = chooseActorGenders(v.actorCount, prefs);
  if (!genders) return [];
  const actors = [];
  for (let i = 0; i < genders.length; i++) {
    let pool = PROMPT_V2.detail.actor.pool.filter((e) => RATING_ORDER[e.r] <= bandOrder && e.g === genders[i]);
    pool = pool.filter((e) => !actors.some((a) => a.id === e.id));
    if (pool.length === 0) pool = PROMPT_V2.detail.actor.pool.filter((e) => RATING_ORDER[e.r] <= bandOrder && e.g === genders[i]);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    actors.push(pick || { id: 'unknown', t: 'a person', r: 'sfw', g: genders[i] });
  }
  return actors;
}

// Weight for one clothing entry given the wearer's gender: 1 when the entry
// is unisex, matches the wearer, or the wearer is non-binary; crossLeanWeight
// when it leans the other way. Soft, not a gate — see the pool's comment.
function clothingWeightFor(entry, gender) {
  if (!entry.lean || !gender || gender === 'nb') return 1;
  return entry.lean === gender ? 1 : PROMPT_V2.detail.clothing.crossLeanWeight;
}

// NOT named weightedPick: SIM already defines a global
// weightedPick(rng, items, weightFn) and loads after this file, so a
// same-named declaration here would be silently replaced by SIM's and every
// clothing roll would call it with the wrong arguments.
function menuWeightedPick(pool, weightFn) {
  let total = 0;
  for (const e of pool) total += weightFn(e);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)] || null;
  let r = Math.random() * total;
  for (const e of pool) {
    r -= weightFn(e);
    if (r <= 0) return e;
  }
  return pool[pool.length - 1] || null;
}

function rollClothing(v) {
  const bandOrder = RATING_ORDER[v.intensity.r];
  const pool = PROMPT_V2.detail.clothing.pool.filter((e) => RATING_ORDER[e.r] <= bandOrder);
  const out = [];
  for (let i = 0; i < v.actorCount; i++) {
    // Clothing is per-actor and index-aligned with v.actors, so each wearer
    // is weighted against their OWN gender rather than the scene's.
    const gender = v.actors && v.actors[i] ? v.actors[i].g : null;
    const pick = pool.length > 0 ? menuWeightedPick(pool, (e) => clothingWeightFor(e, gender)) : null;
    out.push(pick || { id: 'unknown', t: '', r: 'sfw', level: 'dressed' });
  }
  return out;
}

// Layer 1 + Layer 2 in a single linear pass: all context slots roll first
// (in parallel), then all detail slots (in parallel), each conditioned on
// the context. Layer 3 (guard repair) then polishes the vector.
function rollPromptVector(contentConfig, prefs) {
  const capOrder = RATING_ORDER[menuRatingCap(contentConfig)];
  prefs = prefs || normalizePreferences(null);
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = {};
    v.intensity = pickFrom(PROMPT_V2.context.intensity.pool, capOrder);
    // intensity is the master band: every other slot filters to ITS band,
    // not the config cap, so a cozy (sfw) scene can never carry an explicit
    // setting/kink/actor.
    const bandOrder = RATING_ORDER[v.intensity ? v.intensity.r : 'sfw'];
    v.gathering = pickFrom(PROMPT_V2.context.gathering.pool, RATING_ORDER.sfw);
    v.setting = pickFrom(PROMPT_V2.context.setting.pool, bandOrder);
    v.timeOfDay = pickFrom(PROMPT_V2.context.timeOfDay.pool, RATING_ORDER.sfw);
    v.weather = pickFrom(PROMPT_V2.context.weather.pool, RATING_ORDER.sfw);
    v.framing = pickFrom(PROMPT_V2.context.framing.pool, bandOrder);
    v.actorCount = v.gathering ? v.gathering.actors + (v.gathering.id === 'group' && Math.random() < 0.5 ? 1 : 0) : 1;
    v.actors = rollActors(v, prefs);
    v.clothing = rollClothing(v);
    v.pose = pickFrom(PROMPT_V2.detail.pose.pool.filter((e) => peopleOK(e.p, v.actorCount)), bandOrder);
    v.activity = pickFrom(PROMPT_V2.detail.activity.pool.filter((e) => activityOK(e, v)), bandOrder);
    v.emotion = pickFrom(PROMPT_V2.detail.emotion.pool, bandOrder);
    v.style = pickFrom(PROMPT_V2.detail.style.pool, RATING_ORDER.sfw);
    v.kink = pickFrom(PROMPT_V2.detail.kink.pool.filter((e) => peopleOK(e.p, v.actorCount)), bandOrder);
    if (v.intensity && v.actors.length > 0 && repairVector(v, prefs)) return v;
  }
  return fallbackPromptVector();
}

function ruleMatches(rule, v) {
  if (typeof rule.when === 'function') return rule.when(v);
  for (const slot of Object.keys(rule.when)) {
    const val = v[slot];
    if (!val || !rule.when[slot].includes(val.id)) return false;
  }
  return true;
}

function repairVector(v, prefs) {
  for (let i = 0; i < 8; i++) {
    let fixed = false;
    for (const rule of PROMPT_V2.rules) {
      if (ruleMatches(rule, v)) {
        resampleSlot(v, rule.fix.slot, rule.fix.filter);
        fixed = true;
        break;
      }
    }
    if (!fixed) return true;
  }
  return false;
}

function resampleSlot(v, slot, filter) {
  const bandOrder = RATING_ORDER[v.intensity.r];
  if (slot === 'clothing') {
    let pool = PROMPT_V2.detail.clothing.pool.filter((e) => RATING_ORDER[e.r] <= bandOrder);
    if (filter) pool = pool.filter(filter);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) v.clothing[0] = pick;
    return;
  }
  const def = PROMPT_V2.detail[slot] || PROMPT_V2.context[slot];
  if (!def) return;
  let pool = def.pool.filter((e) => RATING_ORDER[e.r] <= bandOrder);
  if (slot === 'activity') {
    pool = pool.filter((e) => activityOK(e, v));
  } else if (slot === 'pose' || slot === 'kink') {
    pool = pool.filter((e) => peopleOK(e.p, v.actorCount));
  }
  if (filter) pool = pool.filter(filter);
  if (pool.length === 0) return;
  v[slot] = pool[Math.floor(Math.random() * pool.length)];
}

// Guaranteed-safe vector; never falls outside the SFW solo band, so the
// slideshow can always emit *something* even if preferences/list state break.
function fallbackPromptVector() {
  const c = PROMPT_V2.context;
  const d = PROMPT_V2.detail;
  const find = (def, id) => def.pool.find((e) => e.id === id) || def.pool[0];
  const actor = d.actor.pool.find((e) => e.id === 'oversizedSweater') || d.actor.pool[0];
  return {
    intensity: find(c.intensity, 'cozy'),
    gathering: find(c.gathering, 'solo'),
    setting: find(c.setting, 'cozyKitchen'),
    timeOfDay: find(c.timeOfDay, 'lateMorning'),
    weather: find(c.weather, 'clearSkies'),
    framing: find(c.framing, 'medium'),
    actorCount: 1,
    actors: [actor],
    clothing: [d.clothing.pool.find((e) => e.id === 'sweaterLeggings') || d.clothing.pool[0]],
    pose: find(d.pose, 'armchairCurled'),
    activity: find(d.activity, 'readingNovel'),
    emotion: find(d.emotion, 'content'),
    style: find(d.style, 'cozyWarm'),
    kink: find(d.kink, 'plain'),
  };
}

// Per-actor clothing clauses keep the generator from merging actors in
// multi-person scenes.
function describeActors(v) {
  const parts = v.actors.map((a, i) => {
    const c = v.clothing[i];
    return `${a.t}${c && c.t ? ', ' + c.t : ''}`;
  });
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, together with ${parts[1]}`;
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

function promptFromVector(v, orientation) {
  const cap = v.intensity ? v.intensity.r : 'sfw';
  const body = [
    describeActors(v),
    v.pose && v.pose.t,
    v.activity && v.activity.t,
    v.emotion && v.emotion.t,
    v.setting ? 'in ' + v.setting.t : '',
    v.timeOfDay && v.timeOfDay.t,
    v.weather && v.weather.t,
    v.framing && v.framing.t,
  ].filter(Boolean);
  const kink = v.kink && v.kink.t ? v.kink.t : '';
  const hint = ORIENTATION_HINT[orientation === 'portrait' ? 'portrait' : 'landscape'];
  const styleTail = v.style && v.style.t ? v.style.t + ', ' + MENU_ART.styleTail : MENU_ART.styleTail;
  return MENU_ART.prefix[cap] + body.join(', ') + ', ' + kink + (kink ? ', ' : '') + hint + ', ' + styleTail + MENU_ART.suffix[cap];
}

// Sanity knob (planning-doc Q&A #4): append ?prompt=1 to the generator URL
// to dump every rolled vector + assembled prompt to the console and a small
// on-page panel while authoring lists/guards.
function promptDebugEnabled() {
  try { return new URLSearchParams(window.location.search).has('prompt'); } catch (e) { return false; }
}

function dumpPromptDebug(v, prompt) {
  try {
    const flat = JSON.stringify(v, (k, val) => (typeof val === 'object' && val && val.t ? val.id : val));
    console.log('[prompt-v2] vector:', flat);
    console.log('[prompt-v2] prompt:', prompt);
    let el = document.getElementById('promptDebug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'promptDebug';
      el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:1002;background:rgba(0,0,0,0.78);color:#9f8;font:10px/1.4 monospace;padding:6px 10px;max-height:140px;max-width:60vw;overflow:auto;white-space:pre-wrap;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = '[prompt-v2] ' + flat + '\n' + prompt;
  } catch (e) { /* debug is best-effort */ }
}

// Public entry point — signature unchanged, so image.js's slideshow (which
// calls genTitlePrompt(contentConfig, orientation)) needs no edits.
function genTitlePrompt(contentConfig, orientation) {
  const v = rollPromptVector(contentConfig, menuPreferencesCache);
  const prompt = promptFromVector(v, orientation);
  if (promptDebugEnabled()) dumpPromptDebug(v, prompt);
  return prompt;
}

// ===== /SECTION: DEFS.MENU =====
