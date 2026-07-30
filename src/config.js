// ===== SECTION: CONFIG =====
// All tunable numbers, content flags, character schema, trait pools, schedule tables.
// Nothing magic outside this section.

// --- Content configuration: drama-first, mature themes not gated ---
const CONTENT_CONFIG = {
  tone: 'balanced',       // balanced|dramatic|comedic|romantic|intense
  contentFlags: {
    profanity: true,
    substance: true,
    romance: true,
    conflict: true,
    mature: true,         // no gating by design
  },
};

// --- Layout / rooms ---
const ROOMS = {
  bedroom_player: { name: "Your Bedroom", capacity: 2, type: 'bedroom', isPlayer: true },
  bedroom_1:      { name: "Bedroom 1", capacity: 2, type: 'bedroom' },
  bedroom_2:      { name: "Bedroom 2", capacity: 2, type: 'bedroom' },
  bedroom_3:      { name: "Bedroom 3", capacity: 2, type: 'bedroom' },
  living_room:    { name: "Living Room", capacity: 6, type: 'common' },
  kitchen:        { name: "Kitchen", capacity: 4, type: 'common' },
  bathroom:       { name: "Bathroom", capacity: 1, type: 'common' },
  hallway:        { name: "Hallway", capacity: 4, type: 'common' },
};

const COMMON_ROOMS = Object.keys(ROOMS).filter(id => ROOMS[id].type === 'common');
const ALL_ROOMS = Object.keys(ROOMS);

// --- Economy ---
const ECONOMY = {
  startingMoney: 1200,
  rent: { total: 2400, perResident: 0 }, // perResident computed at runtime
  workPayPerBlock: 85,     // per 30-min work block
  workEnergyCost: 8,
  deliveryFee: 8,
  payPeriodDays: 7,          // rent due weekly
  rentLatePenaltyMood: 0.1,  // player mood lost per day rent stays unpaid (mood is [-1,1])
  rentLateTensionPerDay: 0.02, // resident tension increase per day unpaid
};

// --- Daily goals (quests), sourced from resident wants/wounds/interests ---
const QUEST_TEMPLATES = [
  { type: 'want', template: "Help {name} with something on their mind: {detail}", rewardMoney: 40, rewardRelation: { affection: 0.1 } },
  { type: 'wound', template: "Check in on {name} — they've been guarded about {detail} lately", rewardMoney: 20, rewardRelation: { trust: 0.1 } },
  { type: 'interest', template: "Bond with {name} over {detail}", rewardMoney: 15, rewardRelation: { affection: 0.05 } },
];

const QUEST_CONFIG = {
  maxActive: 3,
  expiryDays: 3,
  generateChancePerDay: 0.6,
};

// --- Needs ---
const NEEDS = {
  energy:  { decayPerTick: 2,  max: 100, warnBelow: 20, workCost: 8, sleepRestore: 25 },
  hunger:  { decayPerTick: 3,  max: 100, warnBelow: 20, eatRestore: 40 },
  hygiene: { decayPerTick: 1,  max: 100, warnBelow: 25, washRestore: 60 },
  // Player mood lives on the same [-1, 1] scale as NPC mood (relPlayer
  // axes, castWeb axes, moodDelta application all assume -1..1) — it was
  // previously stored 0-100 while moodLabel() and every LLM prompt read it
  // expecting -1..1, so player mood always read as "good" regardless of
  // its actual value. decayPerTick/warnBelow below are the old 0-100
  // figures (1, 20) rescaled by *(2/100) to preserve the same felt rate.
  mood:    { decayPerTick: 0.02, max: 1, warnBelow: -0.6 },
  npcEnergyDecay: 2,
  npcHungerDecay: 3,
  npcHygieneDecay: 1,
  npcSocialDecay: 2,
  npcSocialMax: 100, // hunger/hygiene/energy each carry their own .max above; social has no player-facing counterpart, so its max lives here
  // NPC need restoration per tick, keyed to schedule block rather than
  // parsing activity strings (activity labels are flavor text, not a
  // structured need signal). Without these, NPC needs only ever decayed —
  // written but never read back into consequence.
  npcSleepRestore: 6,    // per tick while in the 'sleep' block
  npcEatRestore: 8,      // per tick during 'morning'/'evening' blocks
  npcHygieneRestore: 8,  // per tick during 'morning'/'wind_down' blocks
  npcSocialRestore: 4,   // per tick when sharing a common room with another resident
};

// --- Clock ---
const CLOCK = {
  ticksPerDay: 48,          // 30-min increments
  startMinutes: 8 * 60,    // 08:00
  phaseThresholds: {       // minutes from midnight
    early_morning: 300,    // 05:00
    morning: 420,          // 07:00
    midday: 720,           // 12:00
    afternoon: 900,        // 15:00
    evening: 1080,        // 18:00
    night: 1320,          // 22:00
  },
  phaseNames: {
    early_morning: 'Early Morning',
    morning: 'Morning',
    midday: 'Midday',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
  },
  tickMinutes: 30,
  sleepTickStart: 0,       // 00:00
  sleepTickEnd: 336,       // 05:36 — sleeping batch
  workBlocksMax: 16,       // max work blocks per day
};

// --- Scene participation ---
const SCENE = {
  maxActiveNpcs: 2,        // hard cap, system invariant
  activeBibleContext: true,
  ambientSketchOnly: true,
  crowdAvoidanceWeight: 3, // multiplier applied to rooms at/above soft capacity
};

// Demotion (active -> ambient) must always be narrated as an in-fiction
// beat, never a silent swap. {name} = the demoted NPC, {other} = whoever
// they're being displaced by (falls back to "you" if omitted).
const DEMOTION_BEATS = [
  '{name} turns back to their laptop.',
  '{name} drifts toward the kitchen.',
  '{name} gets absorbed in their phone.',
  '{name} wanders off, leaving you and {other} to talk.',
  '{name} settles back into what they were doing.',
];

// --- Image cache ---
const IMAGE_CACHE = {
  cap: 200,               // LRU max entries
  resolutions: { bg: '768x512', char: '512x768' },
};

// --- Character generation ---
// Quality thresholds live per-tier on CAST_CONSTRAINTS below (qualityThresholdSolo/
// Group were an earlier, now-superseded flat version — removed rather than left dead).
const CHAR_GEN = {
  maxAttempts: 50,          // constraint satisfaction attempts before relaxation;
                             // also the per-character reroll cap within one attempt
  minTemperamentSpread: 0.5,      // min average per-axis range (max-min) across the cast
  volatilityHighLowThreshold: 0.3, // cast must have one npc >= this and one <= -this
  constraintRelaxOrder: ['secret', 'obstructingWant', 'alliance', 'unresolvedConflict'],
  namePools: {
    first_f: ['Ava','Bianca','Camille','Daria','Elena','Fiona','Grace','Hana','Ivy','Jade','Kira','Lena','Mira','Nora','Olive','Priya','Quinn','Rosa','Sage','Tara','Uma','Vera','Willow','Xena','Yuki','Zara'],
    first_m: ['Aiden','Bruno','Cole','Dexter','Eli','Felix','Gus','Hugo','Ian','Jonah','Kai','Leo','Marcus','Nico','Oscar','Pierce','Quinn','Rex','Sam','Theo','Umar','Victor','Wes','Xavier','Yusuf','Zane'],
    first_n: ['Alex','Blake','Casey','Devin','Ellis','Finley','Grey','Harper','Indigo','Jordan','Kit','Lane','Max','Noel','Orien','Phoenix','Quinn','River','Sky','Taylor','Unknown','Vex','Wren','Xio','Yves','Zion'],
  },
};

// --- Canonical character schema ---
// Single authority. Every construction path returns through validateCharacter.
const CHARACTER_SCHEMA = {
  bible: {
    name:          { type: 'string', required: true, default: '', maxLength: 60 },
    visual:        { type: 'string', required: true, default: '', maxLength: 400 }, // locked appearance string
    genSeed:       { type: 'number', required: true, default: 0 },                  // stable seed for image gen
    history:       { type: 'string', required: true, default: '', maxLength: 600 },  // one paragraph
    temperament:   { type: 'object', required: true, default: {},
      fields: {
        warmth:           { type: 'number', range: [-1, 1] },
        volatility:       { type: 'number', range: [-1, 1] },
        openness:         { type: 'number', range: [-1, 1] },
        conscientiousness: { type: 'number', range: [-1, 1] },
        assertiveness:    { type: 'number', range: [-1, 1] },
        selfAwareness:    { type: 'number', range: [-1, 1] },
      }
    },
    occupation:    { type: 'object', required: true, default: {},
      fields: {
        category:        { type: 'string', required: true },
        title:            { type: 'string', required: true },
        scheduleTemplate: { type: 'string', required: true },  // key into SCHEDULES
        incomeBand:       { type: 'string', required: true },   // low|mid|high
        stressProfile:    { type: 'number', range: [0, 1] },
        hours:            { type: 'string', required: true },
      }
    },
    interests:     { type: 'array', required: true, default: [], maxItems: 3,
      itemFields: { name: { type: 'string', required: true }, tags: { type: 'array', default: [] } } },
    values:         { type: 'array', required: true, default: [], maxItems: 2,
      itemFields: { name: { type: 'string', required: true }, opposition: { type: 'string', required: true } } },
    baggage:        { type: 'string', required: true, default: '', maxLength: 300 },
    wound:          { type: 'string', required: true, default: '', maxLength: 300 },
    want:           { type: 'string', required: true, default: '', maxLength: 300 },
    blindSpot:      { type: 'string', required: true, default: '', maxLength: 300 },
    boundary:       { type: 'string', required: true, default: '', maxLength: 300 },
    speech:         { type: 'object', required: true, default: {},
      fields: {
        verbosity:      { type: 'number', range: [0, 1] },
        formality:      { type: 'number', range: [0, 1] },
        humorStyle:     { type: 'string', default: 'dry' },
        profanityLevel:  { type: 'number', range: [0, 1] },
        verbalTics:     { type: 'array', default: [] },
        textingStyle:   { type: 'string', default: 'casual' },
      }
    },
    scheduleTemplate: { type: 'string', required: true, default: 'standard' },
    sketch:         { type: 'string', required: true, default: '', maxLength: 120 }, // one-line cached sketch for ambient tier
    sampleLines:    { type: 'array', required: true, default: [], maxItems: 5 },
  },
  mutable: {
    bibleRevision:  { type: 'number', default: 0 },
    bibleChanges:   { type: 'array', default: [] },
    residency: { type: 'object', required: true, default: {},
      fields: {
        status:        { type: 'string', enum: ['resident','partner_of_resident','visitor','prospective','former'] },
        room:          { type: 'string', nullable: true },
        bed:           { type: 'string', nullable: true },
        partnerOf:     { type: 'string', nullable: true },
        since:         { type: 'number', default: 1 },
        contributesRent: { type: 'boolean', default: true },
      }
    },
    location:       { type: 'string', nullable: true },
    activity:       { type: 'string', default: '' },
    mood:           { type: 'number', range: [-1, 1], default: 0 },
    needs: { type: 'object', required: true, default: {},
      fields: {
        hunger:   { type: 'number', range: [0, 100], default: 50 },
        hygiene:  { type: 'number', range: [0, 100], default: 50 },
        energy:   { type: 'number', range: [0, 100], default: 50 },
        social:   { type: 'number', range: [0, 100], default: 50 },
      }
    },
    relPlayer: { type: 'object', required: true, default: {},
      fields: {
        trust:      { type: 'number', range: [-1, 1], default: 0 },
        affection:  { type: 'number', range: [-1, 1], default: 0 },
        tension:    { type: 'number', range: [-1, 1], default: 0 },
        respect:    { type: 'number', range: [-1, 1], default: 0 },
      }
    },
    memory: { type: 'object', required: true, default: {},
      fields: {
        facts:    { type: 'array', default: [] },
        episodes: { type: 'array', default: [], itemFields: { day: { type: 'number' }, text: { type: 'string' }, decay: { type: 'number', range: [0, 1] } } },
        summary:  { type: 'string', default: '' },
      }
    },
    arcs:           { type: 'array', default: [] },
    flags:           { type: 'object', default: {} },
  }
};

// --- Temperament axes pools (weighted) ---
const TEMPERAMENT_POOL = [
  // Each entry: { label, axis, value, weight }
  // Values drawn per-axis, not per-label; these are reference distributions
];

// --- Occupation pool with schedule templates, income, stress, hours ---
const OCCUPATION_POOL = [
  { category: 'tech',       title: 'Software Developer',       scheduleTemplate: 'day_shift', incomeBand: 'high', stressProfile: 0.4, hours: '9-17' },
  { category: 'tech',       title: 'QA Tester',                scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
  { category: 'food',       title: 'Line Cook',                scheduleTemplate: 'evening_shift', incomeBand: 'low', stressProfile: 0.7, hours: '16-23' },
  { category: 'food',       title: 'Barista',                  scheduleTemplate: 'morning_shift', incomeBand: 'low', stressProfile: 0.3, hours: '6-14' },
  { category: 'health',     title: 'Nurse',                    scheduleTemplate: 'night_shift', incomeBand: 'mid', stressProfile: 0.8, hours: '19-07' },
  { category: 'health',     title: 'Therapist',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
  { category: 'arts',       title: 'Freelance Designer',        scheduleTemplate: 'irregular', incomeBand: 'mid', stressProfile: 0.4, hours: 'flexible' },
  { category: 'arts',       title: 'Musician',                  scheduleTemplate: 'evening_shift', incomeBand: 'low', stressProfile: 0.6, hours: 'flexible' },
  { category: 'service',    title: 'Retail Manager',           scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.6, hours: '10-19' },
  { category: 'service',    title: 'Bartender',                 scheduleTemplate: 'night_shift', incomeBand: 'mid', stressProfile: 0.7, hours: '18-02' },
  { category: 'education',  title: 'Teacher',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.6, hours: '8-16' },
  { category: 'education',  title: 'Grad Student',             scheduleTemplate: 'irregular', incomeBand: 'low', stressProfile: 0.8, hours: 'flexible' },
  { category: 'finance',    title: 'Accountant',                scheduleTemplate: 'day_shift', incomeBand: 'high', stressProfile: 0.5, hours: '9-17' },
  { category: 'finance',    title: 'Barista-Entrepreneur',      scheduleTemplate: 'morning_shift', incomeBand: 'low', stressProfile: 0.7, hours: '6-14' },
  { category: 'trades',     title: 'Electrician',              scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.4, hours: '7-15' },
  { category: 'trades',     title: 'Plumber',                  scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '8-16' },
  { category: 'media',      title: 'Journalist',                scheduleTemplate: 'irregular', incomeBand: 'mid', stressProfile: 0.6, hours: 'flexible' },
  { category: 'media',      title: 'Podcaster',                 scheduleTemplate: 'irregular', incomeBand: 'low', stressProfile: 0.4, hours: 'flexible' },
  { category: 'legal',      title: 'Paralegal',                 scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.7, hours: '9-18' },
  { category: 'science',    title: 'Lab Researcher',            scheduleTemplate: 'day_shift', incomeBand: 'mid', stressProfile: 0.5, hours: '9-17' },
];

// --- Schedule templates: [weekday/weekend] → tick → activity weight table ---
const SCHEDULES = {
  day_shift: {
    weekday: {  // 0-47 (30-min ticks)
      sleep:    [[0, 15, 1.0]],
      morning:  [[16, 18, 0.8], [18, 19, 0.5]],
      commute:  [[19, 20, 1.0]],
      work:     [[20, 34, 1.0]],
      commute_home: [[34, 35, 1.0]],
      evening:  [[36, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 18, 0.9]],
      leisure:  [[18, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  morning_shift: {
    weekday: {
      sleep:    [[0, 10, 1.0]],
      prep:     [[10, 12, 0.8]],
      commute:  [[12, 13, 1.0]],
      work:     [[13, 28, 1.0]],
      commute_home: [[28, 29, 1.0]],
      evening:  [[30, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 16, 0.9]],
      leisure:  [[16, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  evening_shift: {
    weekday: {
      sleep:    [[0, 16, 1.0]],
      leisure:  [[16, 31, 0.6]],
      prep:     [[31, 32, 0.8]],
      commute:  [[32, 33, 1.0]],
      work:     [[33, 45, 1.0]],
      commute_home: [[45, 46, 1.0]],
      wind_down:[[46, 47, 0.7]],
    },
    weekend: {
      sleep:    [[0, 20, 0.9]],
      leisure:  [[20, 40, 0.7]],
      evening:  [[40, 47, 0.6]],
    }
  },
  night_shift: {
    weekday: {
      work:     [[0, 14, 1.0]],
      commute_home: [[14, 15, 1.0]],
      sleep:    [[15, 38, 1.0]],
      evening:  [[38, 47, 0.6]],
    },
    weekend: {
      sleep:    [[0, 20, 0.9]],
      leisure:  [[20, 40, 0.7]],
      evening:  [[40, 47, 0.6]],
    }
  },
  irregular: {
    weekday: {
      sleep:    [[0, 14, 0.7]],
      work:     [[14, 30, 0.5]],
      leisure:  [[30, 42, 0.6]],
      wind_down:[[42, 47, 0.7]],
    },
    weekend: {
      sleep:    [[0, 16, 0.8]],
      leisure:  [[16, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  standard: {
    weekday: {
      sleep:    [[0, 15, 1.0]],
      morning:  [[16, 20, 0.6]],
      midday:   [[20, 32, 0.5]],
      evening:  [[32, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 18, 0.9]],
      leisure:  [[18, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
};

// --- Activity tables per schedule-block ---
const ACTIVITY_TABLES = {
  sleep:    ['sleeping'],
  morning:  ['making coffee', 'checking phone', 'eating cereal', 'doing yoga', 'reading news'],
  midday:   ['watching TV', 'reading', 'browsing laptop', 'snacking', 'on a phone call'],
  evening:  ['cooking', 'watching a show', 'playing games', 'drinking beer', 'listening to music', 'on a video call'],
  leisure:  ['reading', 'painting', 'playing guitar', 'scrolling social media', 'exercising', 'texting', 'crafting'],
  wind_down:['reading in bed', 'skincare routine', 'journaling', 'stretching'],
  work:     ['at work'],
  commute:  ['commuting'],
  commute_home: ['commuting home'],
  prep:     ['getting ready'],
  morning_shift: ['getting ready for work'],
};

// --- Off-screen event tables (deterministic, no LLM) ---
const OFFSCREEN_EVENTS = [
  { type: 'cooking', weight: 4, text: '{name} cooked {dish} and left leftovers.', moodDelta: 0.05, dataFields: ['dish'] },
  { type: 'breakage', weight: 1, text: '{name} broke a {item} in the kitchen.', moodDelta: -0.1, dataFields: ['item'] },
  { type: 'bad_day', weight: 2, text: '{name} had a rough day at work.', moodDelta: -0.15, dataFields: [] },
  { type: 'guest', weight: 1, text: '{name} brought {guest} home.', moodDelta: 0.1, dataFields: ['guest'] },
  { type: 'argument', weight: 2, text: '{name} and {other} argued about {topic}.', moodDelta: -0.2, dataFields: ['other', 'topic'] },
  { type: 'repair', weight: 1, text: '{name} fixed the {item}.', moodDelta: 0.08, dataFields: ['item'] },
  { type: 'shopping', weight: 2, text: '{name} went grocery shopping.', moodDelta: 0.05, dataFields: [] },
  { type: 'good_news', weight: 2, text: '{name} got good news: {detail}.', moodDelta: 0.15, dataFields: ['detail'] },
  { type: 'cleaning', weight: 3, text: '{name} cleaned the {room}.', moodDelta: 0.05, dataFields: ['room'] },
  { type: 'sick', weight: 1, text: '{name} is coming down with something.', moodDelta: -0.1, dataFields: [] },
];

const EVENT_FILL_DATA = {
  dish: ['pasta', 'stir-fry', 'soup', 'curry', 'tacos', 'salad', 'ramen'],
  item: ['mug', 'plate', 'lamp', 'mirror', 'vase', 'shelf'],
  guest: ['a friend', 'a date', 'a coworker', 'their sibling', 'a neighbor'],
  topic: ['chores', 'noise', 'bathroom time', 'groceries', 'rent', 'a mess', 'the thermostat'],
  room: ['kitchen', 'living room', 'bathroom', 'hallway'],
  detail: ['a promotion opportunity', 'a new gig', 'a raise', 'an acceptance letter', 'a call back'],
};

// --- Interest pool (tagged) ---
const INTEREST_POOL = [
  { name: 'gaming',          tags: ['tech', 'indoor', 'sedentary'] },
  { name: 'cooking',         tags: ['domestic', 'creative', 'indoor'] },
  { name: 'music',           tags: ['creative', 'indoor', 'social'] },
  { name: 'fitness',         tags: ['active', 'outdoor', 'health'] },
  { name: 'reading',         tags: ['intellectual', 'indoor', 'sedentary'] },
  { name: 'art',             tags: ['creative', 'indoor', 'solitary'] },
  { name: 'politics',        tags: ['intellectual', 'social', 'argumentative'] },
  { name: 'film',            tags: ['media', 'indoor', 'sedentary'] },
  { name: 'gardening',       tags: ['domestic', 'outdoor', 'calm'] },
  { name: 'hiking',          tags: ['active', 'outdoor', 'health'] },
  { name: 'writing',         tags: ['creative', 'solitary', 'intellectual'] },
  { name: 'yoga',            tags: ['health', 'calm', 'indoor'] },
  { name: 'partying',        tags: ['social', 'nightlife', 'extrovert'] },
  { name: 'coding',         tags: ['tech', 'intellectual', 'indoor'] },
  { name: 'fashion',         tags: ['creative', 'social', 'indoor'] },
  { name: 'astrology',       tags: ['mystical', 'social', 'indoor'] },
  { name: 'photography',     tags: ['creative', 'outdoor', 'solitary'] },
  { name: 'comedy',          tags: ['social', 'creative', 'extrovert'] },
  { name: 'volunteering',    tags: ['social', 'altruistic', 'outdoor'] },
  { name: 'true crime',      tags: ['media', 'intellectual', 'indoor'] },
  { name: 'crafting',        tags: ['domestic', 'creative', 'indoor'] },
  { name: 'travel',          tags: ['outdoor', 'social', 'adventurous'] },
];

// --- Values pool (with opposition pairs) ---
const VALUES_POOL = [
  { name: 'honesty',         opposition: 'harmony' },
  { name: 'harmony',         opposition: 'honesty' },
  { name: 'independence',    opposition: 'connection' },
  { name: 'connection',     opposition: 'independence' },
  { name: 'ambition',       opposition: 'contentment' },
  { name: 'contentment',     opposition: 'ambition' },
  { name: 'order',           opposition: 'spontaneity' },
  { name: 'spontaneity',     opposition: 'order' },
  { name: 'loyalty',         opposition: 'freedom' },
  { name: 'freedom',         opposition: 'loyalty' },
  { name: 'tradition',       opposition: 'progress' },
  { name: 'progress',        opposition: 'tradition' },
  { name: 'privacy',         opposition: 'transparency' },
  { name: 'transparency',    opposition: 'privacy' },
  { name: 'kindness',        opposition: 'justice' },
  { name: 'justice',         opposition: 'kindness' },
];

// --- Baggage, wounds, wants, blind spots, boundaries pools ---
const BAGGAGE_POOL = [
  'grew up in a chaotic household and craves stability',
  'was the responsible one for younger siblings',
  'moved a lot as a kid and struggles to put down roots',
  'had a falling-out with family and is estranged',
  'was the funny kid who used humor to deflect conflict',
  'had a parent who was emotionally unavailable',
  'was a high achiever who burned out young',
  'grew up poor and is anxious about money',
  'was bullied and overcorrected into people-pleasing',
  'had a string of bad roommates and has trust issues',
  'was the mediator in every family fight',
  'lost a close friend and fears abandonment',
];

const WOUND_POOL = [
  'being told they are not enough',
  'being abandoned when they needed support',
  'being seen as selfish when they put themselves first',
  'being laughed at for caring about something',
  'being controlled by a partner',
  'being the last to know a secret',
  'being told they are too much, too intense',
  'being replaced by someone newer',
  'being accused of lying when telling the truth',
  'being told their feelings are irrational',
];

const WANT_POOL = [
  'to find a relationship that actually works',
  'to save enough to move out alone',
  'to build a creative career from nothing',
  'to repair a broken family relationship',
  'to be taken seriously at work',
  'to throw a party that makes people remember them',
  'to learn to be alone without being lonely',
  'to pay off debt by end of year',
  'to get a pet despite the no-pets lease',
  'to find a community that feels like home',
  'to quit a bad habit they are hiding',
  'to confront a roommate about something',
];

const BLINDSPOT_POOL = [
  'believes they are easy to live with (they are not)',
  'believes they do not care what others think (they do)',
  'believes they are the most responsible person in the room',
  'believes their humor brings people together (it sometimes alienates)',
  'believes they are over their ex',
  'believes they are independent (they are deeply dependent)',
  'believes they are a good listener (they wait to talk)',
  'believes they do not need help',
  'believes their anger is justified every time',
  'believes they are low-maintenance',
  'believes they are open-minded about everything',
  'believes their work does not define them (it does)',
];

const BOUNDARY_POOL = [
  'their bedroom is sacred space — do not enter without asking',
  'no one touches their food in the fridge',
  'do not bring up their ex, ever',
  'they need quiet after 11pm, no exceptions',
  'they will not be the one who calls the landlord',
  'they decide who gets the parking spot',
  'their workout time is non-negotiable',
  'do not comment on how much they drink',
  'their pet peeve is people leaving dishes in the sink',
  'they will not cover rent for someone else twice',
  'their music is not up for debate',
  'do not ask about their family',
];

// --- Speech profile pools ---
const HUMOR_STYLES = ['dry', 'sarcasm', 'goofy', 'dark', 'self-deprecating', 'absurdist', 'none'];
const VERBAL_TICS = ['like', 'you know', 'I mean', 'honestly', 'basically', 'right?', 'so yeah', 'anyway', 'literally', 'um', 'dude', 'okay so'];
const TEXTING_STYLES = ['terse', 'emoji-heavy', 'all-lowercase', 'properly-punctuated', 'stream-of-consciousness', 'meme-laden'];

// --- Relational templates ---
const HOW_THEY_MET_POOL = [
  'answered the same Craigslist ad',
  'were college friends who needed a place',
  'met through a mutual friend who moved out',
  'were coworkers who found out they both needed housing',
  'were introduced at a party',
  'were the previous tenant\'s ex who stayed',
  'knew each other from the gym',
  'were friends of friends who hit it off',
];

const SHARED_BEAT_POSITIVE = [
  'covered for each other during a landlord inspection',
  'threw an impromptu birthday dinner that went surprisingly well',
  'helped each other move furniture up three flights of stairs',
  'shared a power outage with only candles and beer',
  'co-hosted a holiday dinner for friends together',
];

const SHARED_BEAT_NEGATIVE = [
  'had a screaming match over the thermostat that ended in a week of silence',
  'one ate the other\'s clearly-labeled leftovers and never admitted it',
  'a guest of one broke the other\'s prized possession',
  'one accused the other of borrowing clothes without asking',
  'one walked in on the other in a compromising moment',
];

// --- Cast constraints (tiered by resident count) ---
const CAST_CONSTRAINTS = {
  tier1: { // 1 resident
    requirements: ['strongWant', 'sharpWound', 'liveBlindSpot'],
    qualityThreshold: 0.6,
  },
  tier2: { // 2-3 residents
    // temperamentSpread (§7.1: axes must span a range; one high- and one
    // low-volatility character) is meaningless below 2 residents, so it
    // only appears from tier2 up.
    requirements: ['frictionPair', 'asymmetricRelationship', 'temperamentSpread'],
    qualityThreshold: 0.5,
  },
  tier3: { // 4+ residents
    requirements: ['unresolvedConflict', 'alliance', 'secret', 'obstructingWant', 'temperamentSpread'],
    qualityThreshold: 0.5,
  },
};

// --- Skills (full curves land in SKILLS, P3) — the stable id list EFFECTS
// and ACTIONS can validate against before that phase exists, so
// ADD_SKILL_XP has something real to check rather than a landmine. ---
const SKILL_IDS = ['cooking', 'cleaning', 'stealth', 'tech', 'fitness', 'social', 'art', 'writing', 'focus'];

// --- Flag key patterns. ADD_FLAG/CLEAR_FLAG validate against these rather
// than a fixed enum, since flag keys are often parameterized (e.g.
// "intruded_<room>" from a future sneak action) — a pattern still rules out
// the LLM inventing an arbitrary flag namespace. ---
const FLAG_PATTERNS = [
  /^noticed_.+$/,
  /^intruded_.+$/,
  /^met_.+$/,
  /^suspects_.+$/,
  /^told_.+$/,
  /^visited_.+$/,
];

// --- Effect vocabulary caps (EFFECTS enforces these against LLM-tier
// producers only — trusted producers like ACTIONS' own def.effects and,
// later, autonomy's DRIVE_DEFS are config-authored and bypass them; see
// EFFECTS' file header). Nothing magic outside CONFIG. ---
const EFFECT_LIMITS = {
  maxEffects: 6,
  maxPerType: 3,
  maxTotalNeedMagnitude: 40,
  maxTotalRelMagnitude: 0.6,
  maxSpendTimePerProposal: 1,
  needDeltaCap: 25,
  moodDeltaCap: 0.2,
  relDeltaCap: 0.3,
  moneyDeltaCap: 200,
  skillXpCap: 15,
  memoryTextMaxLength: 200,
  npcActivityMaxLength: 60,
  spendTimeMin: 1,
  spendTimeMax: 8,
};

// --- Small numeric tuning for the registered apartment actions (ACTIONS/
// DEFS.ACTIONS), pulled out of doCook/doWatchTV/doRelax's old inline
// literals so nothing magic lives in the action bodies. ---
const ACTION_TUNING = {
  cookExtraHungerRestore: 10, // cooking restores hunger.eatRestore + this
  tvMoodGain: 0.1,
  relaxMoodGain: 0.16,
  relaxEnergyGain: 5,
};

// --- Tone / content directives. PROMPT injects these into every narrative
// prompt — closes the gap where CONTENT_CONFIG was captured at character
// creation and persisted to meta.contentConfig but never reached
// generation (see the former comment at ui.js's handleGenerateCast). ---
const TONE_PROFILES = {
  balanced: { styleDirective: 'Grounded, observational. Let moments breathe rather than escalating for effect.', escalationBias: 0.0, humorBias: 0.1 },
  dramatic: { styleDirective: 'Heighten subtext. Let silences and tension land heavy.', escalationBias: 0.3, humorBias: 0.0 },
  comedic: { styleDirective: 'Lean into the absurd and the awkward. Comic timing over gravity.', escalationBias: 0.0, humorBias: 0.5 },
  romantic: { styleDirective: 'Notice small gestures, proximity, and things left unsaid.', escalationBias: 0.1, humorBias: 0.15 },
  intense: { styleDirective: 'Raise the stakes. Keep conflict and consequence close to the surface.', escalationBias: 0.45, humorBias: 0.0 },
};

const CONTENT_DIRECTIVES = {
  profanity: { on: 'Characters may swear naturally when it fits their voice.', off: 'Avoid profanity.' },
  substance: { on: 'Drinking, smoking, and similar habits may appear naturally.', off: 'Keep substance use off-page.' },
  romance: { on: 'Romantic and physically intimate material may develop naturally between consenting characters.', off: 'Keep romantic content light and non-explicit.' },
  conflict: { on: 'Arguments and interpersonal conflict may escalate realistically.', off: 'Keep conflict low-key and quickly defused.' },
  mature: { on: 'Mature themes and adult situations are permitted when the scene calls for them — write them like an adult novel would, not a summary of one.', off: 'Keep content non-explicit; fade to black rather than describing explicit material.' },
};

// ===== /SECTION: CONFIG =====
