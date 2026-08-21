// ===== SECTION: DEFS.WORLD =====
// Object definitions and apartment layout (Apartment Expansion v2 — Mirrored H).
// Object definitions (the "what kind of thing is this") and the
// apartment's initial layout (the "what's actually in each room"). See
// WORLD for the instance schema, spawning, and cleanliness derivation that
// consume this data.
//
// `affords` on a definition is a DECLARATION of which ACTION_DEFS entries a
// player can take against an instance of it — the mechanics live in
// DEFS.ACTIONS, not here (a def doesn't know how to be used, only what it
// is). Object-sourced actions land in a later phase; this file exists now
// so the object/instance model has real content to spawn and render
// against.
//
// Item-holding defs (inventory overhaul Phase 2) carry a `container`
// object instead of the old `container: true` boolean:
//   container: {
//     capacity: null,      // null = uncapped (D4); field exists for future caps
//     storageClass: null,  // which row of ROT.preservation applies here —
//                          // 'fridge' | 'freezer' | 'pantry' | 'doormat' |
//                          // 'floor' | null (null = the bag 1.0 baseline).
//                          // FOOD-overhaul Phase 1 (D18): the multipliers
//                          // themselves live in ONE table (ROT.preservation);
//                          // containers only reference a row. Old
//                          // `preservation:` numbers are still honored by
//                          // ITEMS' preservationFor for legacy defs.
//     label: 'Fridge'      // UI title for the browse panel
//   }
// `container: false` on non-holding defs is unchanged. The browse/transfer
// UI reads the affords (`container.open/take/put`) — a def that is
// browsable but not takable/putable (washer/dryer) simply omits the verb.
//
// `dirtyWhen: { stateKey: { value: griminess0to1 } }` is what
// recomputeRoomCleanliness (WORLD) reads — data-driven, so "what makes a
// room feel dirty" is a CONFIG-shaped fact about each object, not a
// hardcoded formula.
//
// `emits: { stateKey: { value: { signal, intensity } } }` is the SAME shape,
// deliberately, and is what SIGNALS' deriveStandingSignals reads (perception
// plan D9). One convention covers both questions an object's state answers:
// does this make the room feel dirty, and can anyone smell/see/hear it.
//
// A container going rotten is the single most repeated emitter in the file —
// every food-holding def carries the identical `rotten_food: 'rotten'` state,
// and it always means the same thing to the nose. Spread EMITS_ROT rather
// than restating it fifteen times, so the intensity of rot lives in exactly
// one place.
const EMITS_ROT = { rotten_food: { rotten: { signal: 'rot', intensity: 0.8 } } };

const OBJECT_DEFS = {
  // --- Bedroom furniture (instanced once per bedroom via APARTMENT_LAYOUT) ---
  bed: {
    id: 'bed', label: 'Bed', nouns: ['bed', 'mattress'],
    portable: false, breakable: false, container: false, private: true,
    states: { made: ['made', 'unmade'] }, defaultState: { made: 'made' },
    dirtyWhen: { made: { unmade: 0.15 } }, cleanlinessWeight: 2,
    emits: { made: { unmade: { signal: 'unmade_bed', intensity: 0.5 } } },
    affords: ['bed.sleep', 'inspect.object'],
    imagePhrase: 'a single bed with rumpled sheets',
  },
  desk: {
    id: 'desk', label: 'Desk', nouns: ['desk'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a small desk',
  },
  // Wardrobe (Intimacy & Voyeurism Phase 4, D11): clothing storage with a
  // tiered capacity. `capacityByTier` is what containerCapacity (ITEMS)
  // reads; the instance's tier lives in `flags.tier` (a number, default 1 —
  // numbers live in flags because state values must stay string enums).
  // `capacity: null` stays so the shared container machinery treats the
  // base block as uncapped for every reader that hasn't learned the tiered
  // shape yet; capacityByTier is the wardrobe's ONLY cap. The upgrade path
  // that raises the tier is a later phase.
  wardrobe: {
    id: 'wardrobe', label: 'Wardrobe', nouns: ['wardrobe', 'closet'],
    portable: false, breakable: false,
    container: { capacity: null, capacityByTier: { 1: 12, 2: 24, 3: 40 }, label: 'Wardrobe' }, private: true,
    states: { rotten_food: ['none', 'rotten'], door: ['closed', 'open'] },
    defaultState: { rotten_food: 'none', door: 'closed' },
    defaultFlags: { tier: 1 },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a wardrobe',
  },
  nightstand: {
    id: 'nightstand', label: 'Nightstand', nouns: ['nightstand', 'bedside table'],
    portable: false, breakable: false, container: { capacity: null, label: 'Nightstand' }, private: true,
    states: { rotten_food: ['none', 'rotten'], door: ['closed', 'open'] },
    defaultState: { rotten_food: 'none', door: 'closed' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a nightstand with a lamp',
  },
  desktop_computer: {
    id: 'desktop_computer', label: 'Computer', nouns: ['computer', 'pc', 'desktop', 'monitor'],
    portable: false, breakable: true, container: false, private: true,
    states: { power: ['off', 'sleep', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['computer.use', 'computer.power', 'inspect.object'],
    evidenceKinds: ['browser_history', 'open_app'],
    imagePhrase: 'a desktop computer on the desk',
  },
  // The BrineOS phone — a world OBJECT per decision B of
  // src/ref/BrineOS-The-Phone-plan.md, NOT an inventory item: only objects
  // have per-instance identity, mutable state/flags, and can sit alone in
  // a room bucket (a carried phone on the kitchen counter needs a floor).
  // `unique` stops a layout bump ever spawning a second one (L5).
  // Battery is numeric flags.battery (0-100), NOT state — state values
  // must stay string enums (cleanRoomObjects / validateObjectStateChange
  // depend on it). NO dirtyWhen/cleanlinessWeight (L6). evidenceKinds
  // added in Phase 9 (L7) — withheld through Phases 2-8 so the phone
  // wasn't a LEAVE_EVIDENCE target for the player's own sneaking before
  // snooping (the actual mechanic that reads this kind) existed.
  phone: {
    id: 'phone', label: 'Phone', nouns: ['phone', 'cell', 'cellphone'],
    portable: true, breakable: true, container: false, private: true,
    unique: true,
    states: { plugged: ['unplugged', 'plugged'], lock: ['unlocked', 'locked'] },
    defaultState: { plugged: 'unplugged', lock: 'unlocked' },
    defaultFlags: { battery: PHONE.startingBattery },
    affords: ['phone.use', 'phone.pickup', 'phone.drop', 'phone.plug', 'inspect.object'],
    imagePhrase: 'a phone face-down on the surface',
    evidenceKinds: ['phone_contents'],
  },
  guitar: {
    id: 'guitar', label: 'Guitar', nouns: ['guitar'],
    portable: true, breakable: true, container: false, private: true,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a guitar leaning against the wall',
  },
  diary: {
    id: 'diary', label: 'Diary', nouns: ['diary', 'journal'],
    portable: true, breakable: false, container: false, private: true,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    evidenceKinds: ['personal_item'],
    imagePhrase: 'a diary tucked in a drawer',
  },
  jewelry_box: {
    id: 'jewelry_box', label: 'Jewelry Box', nouns: ['jewelry box', 'jewelry'],
    portable: true, breakable: false, container: { capacity: null, label: 'Jewelry Box' }, private: true,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a small jewelry box',
  },
  // --- Buyable hobby objects (inventory overhaul Phase 6) ---
  // Nile purchases the player places in a room — the ITEM_DEFS hobby_*
  // entries above are the shipped items; the Place verb (INVENTORY/UI,
  // SPAWN_OBJECT in EFFECTS) turns one into an instance of the matching
  // OBJECT_DEFS here, sitting in the room bucket so it persists like any
  // fixture. portable:false + unowned: the object lives where the player
  // put it. Each affords exactly one hobby action (sourced 'object' in
  // DEFS.ACTIONS), so the hobby is usable only in the room that contains
  // it. Distinct defs from the pre-existing fixture objects (guitar,
  // bookshelf, game_console, plant_lr) so buying one never collides with
  // a roommate's fixture guitar or the living room's seeded bookshelf.
  hobby_guitar: {
    id: 'hobby_guitar', label: 'Guitar', nouns: ['guitar', 'acoustic guitar'],
    portable: false, breakable: true, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['hobby.guitar', 'inspect.object'],
    imagePhrase: 'a guitar leaning against the wall, strings a little loose',
  },
  hobby_bookshelf: {
    id: 'hobby_bookshelf', label: 'Bookshelf', nouns: ['bookshelf', 'bookcase'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['hobby.bookshelf', 'inspect.object'],
    imagePhrase: 'a bookshelf crammed with paperbacks and dog-eared novels',
  },
  hobby_record_player: {
    id: 'hobby_record_player', label: 'Record Player', nouns: ['record player', 'turntable'],
    portable: false, breakable: true, container: false, private: false,
    // Intimacy & Voyeurism Phase 19: the record player gains a volume state
    // + the standing music signal - power on AND volume > 0 spins the vinyl
    // (the hobby action's buildEffects powers it up; the sound submenu verbs
    // control it from there).
    states: { power: ['off', 'on'], volume: ['0', '1', '2', '3'] },
    defaultState: { power: 'off', volume: '0' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    emits: {
      volume: { '1': { signal: 'music', intensity: 0.2, when: { power: 'on' } },
                '2': { signal: 'music', intensity: 0.45, when: { power: 'on' } },
                '3': { signal: 'music', intensity: 0.7, when: { power: 'on' } } },
    },
    affords: ['hobby.record_player', 'inspect.object'],
    imagePhrase: 'a record player with a small stack of vinyl beside it',
  },
  // --- Music devices (Intimacy & Voyeurism Phase 19) --------------------
  // The soundscape's placed devices. A `volume` state derives a STANDING
  // `music` signal while `power` is on (SOUND_DEVICE_DEFS holds the
  // volume-to-intensity table; the emits here reference it). The stereo is
  // the seeded living-room fixture; the boombox is the buyable portable.
  // Both also ship as ITEM_DEFS stacks (same string, other namespace) so
  // Nile sells them and the Place verb turns the item into one of these
  // instances via SPAWN_OBJECT, exactly like the hobby objects.
  stereo: {
    id: 'stereo', label: 'Stereo', nouns: ['stereo', 'stereo system'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], volume: ['0', '1', '2', '3'] },
    defaultState: { power: 'off', volume: '0' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    emits: {
      volume: { '1': { signal: 'music', intensity: 0.25, when: { power: 'on' } },
                '2': { signal: 'music', intensity: 0.5, when: { power: 'on' } },
                '3': { signal: 'music', intensity: 0.75, when: { power: 'on' } } },
    },
    affords: ['sound.play', 'sound.set_volume', 'sound.eject', 'inspect.object'],
    imagePhrase: 'a stereo on a low shelf, a rack of records beside it and a pair of bookshelf speakers on the wall',
  },
  boombox: {
    id: 'boombox', label: 'Boombox', nouns: ['boombox', 'ghetto blaster', 'radio'],
    portable: true, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], volume: ['0', '1', '2', '3'] },
    defaultState: { power: 'off', volume: '0' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    emits: {
      volume: { '1': { signal: 'music', intensity: 0.3, when: { power: 'on' } },
                '2': { signal: 'music', intensity: 0.55, when: { power: 'on' } },
                '3': { signal: 'music', intensity: 0.85, when: { power: 'on' } } },
    },
    affords: ['sound.play', 'sound.set_volume', 'sound.eject', 'inspect.object'],
    imagePhrase: 'a battered boombox with silver grilles and a handle',
  },
  hobby_console: {
    id: 'hobby_console', label: 'Game Console', nouns: ['console', 'game console'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['hobby.console', 'inspect.object'],
    imagePhrase: 'a game console hooked to a small TV with controllers on the floor',
  },
  hobby_sketchpad: {
    id: 'hobby_sketchpad', label: 'Sketchpad', nouns: ['sketchpad', 'sketchbook'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['hobby.sketchpad', 'inspect.object'],
    imagePhrase: 'an open sketchpad covered in half-finished drawings',
  },
  hobby_houseplant: {
    id: 'hobby_houseplant', label: 'Houseplant', nouns: ['houseplant', 'plant'],
    portable: false, breakable: false, container: false, private: false,
    states: { health: ['thriving', 'wilting'] }, defaultState: { health: 'thriving' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['hobby.houseplant', 'inspect.object'],
    imagePhrase: 'a leafy houseplant in a ceramic pot',
  },

  // --- Kitchen ---
  stove: {
    id: 'stove', label: 'Stove', nouns: ['stove', 'range', 'burner', 'hob'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], burner: ['clean', 'crusty', 'filthy'] }, defaultState: { power: 'off', burner: 'clean' },
    dirtyWhen: { burner: { crusty: 0.5, filthy: 1.0 } }, cleanlinessWeight: 3,
    emits: { burner: { crusty: { signal: 'grease', intensity: 0.3 },
                       filthy: { signal: 'grease', intensity: 0.55 } } },
    affords: ['cook.meal', 'clean.object', 'inspect.object'],
    // D37 (2026-08-18): the starting stove is a single shabby countertop
    // electric burner, not a gas range — the gas range is the upgraded
    // tier's flavor (FACILITY_DEFS.kitchen_stove).
    imagePhrase: 'a single countertop electric burner with a coil visible, on a worn kitchen counter',
  },
  fridge: {
    id: 'fridge', label: 'Fridge', nouns: ['fridge', 'refrigerator', 'icebox'],
    surfaces: true,   // perception plan Phase 4: you can stick a note here
    portable: false, breakable: false, container: { capacity: null, storageClass: 'fridge', label: 'Fridge' }, private: false,
    states: { rotten_food: ['none', 'rotten'], door: ['closed', 'open'] },
    defaultState: { rotten_food: 'none', door: 'closed' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    // Perception plan Phase 1 (D9). Same shape as dirtyWhen above — state key
    // → state value → payload — deliberately, so there is one convention to
    // learn rather than two. Read by SIGNALS' deriveStandingSignals.
    emits: { rotten_food: { rotten: { signal: 'rot', intensity: 0.8 } } },
    affords: ['container.open', 'container.take', 'container.put', 'clean.object', 'inspect.object'],
    imagePhrase: 'a refrigerator covered in magnets',
  },
  freezer: {
    id: 'freezer', label: 'Freezer', nouns: ['freezer', 'chest freezer', 'deep freeze'],
    portable: false, breakable: false, container: { capacity: null, storageClass: 'freezer', label: 'Freezer' }, private: false,
    states: { rotten_food: ['none', 'rotten'], door: ['closed', 'open'] },
    defaultState: { rotten_food: 'none', door: 'closed' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'clean.object', 'inspect.object'],
    imagePhrase: 'an old chest freezer, humming to itself',
  },
  sink_kitchen: {
    id: 'sink_kitchen', label: 'Kitchen Sink', nouns: ['sink', 'kitchen sink'],
    portable: false, breakable: false, container: false, private: false,
    // Food-overhaul Phase 4 (D9/D11): `dishes` here is the DERIVED ladder
    // home, not stored state — the dirty_dishes signal and room cleanliness
    // read ITEMS' dishLevelOf against the object's dish MAP (obj.dishes,
    // the real state). The ladder stays declared so the def self-describes
    // and validateObjectStateChange has the values available; nothing writes
    // state.dishes any more (recipe `leaves` and the wash action emit
    // ADD_DISHES/CLEAN_DISHES against the map instead).
    states: { dishes: ['clean', 'few', 'many'] }, defaultState: { dishes: 'clean' },
    dirtyWhen: { dishes: { few: 0.4, many: 0.9 } }, cleanlinessWeight: 3,
    emits: { dishes: { few:  { signal: 'dirty_dishes', intensity: 0.3 },
                       many: { signal: 'dirty_dishes', intensity: 0.65 } } },
    affords: ['self.dishes', 'clean.object', 'inspect.object'],
    imagePhrase: 'a kitchen sink',
  },
  // Food-overhaul Phase 4 (D11): the dishwasher. Its load and cycle live on
  // the INSTANCE (obj.dishwasher = { load: {dishType: count},
  // cycleActiveUntilAbs }) — `cycle` below is a DERIVED state maintained by
  // the dish effects (RUN_DISHWASHER sets 'running', the lazy cycle resolver
  // flips it back to 'idle'), so the floorplan and validateObjectStateChange
  // have a string to read without the state being a second source of truth.
  // `unique` keeps the L5 layout-backfill guard from ever spawning a second
  // one. Capacity/cycle length come from EQUIPMENT_DEFS.dishwasher.tiers
  // keyed to the kitchen_appliances facility tier (Phase 6 D12).
  dishwasher: {
    id: 'dishwasher', label: 'Dishwasher', nouns: ['dishwasher', 'dish washer', 'machine'],
    portable: false, breakable: false, container: false, private: false,
    unique: true,
    states: { cycle: ['idle', 'running'] }, defaultState: { cycle: 'idle' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.dishwasher', 'inspect.object'],
    imagePhrase: 'a dishwasher under the counter',
  },
  // Food-overhaul Phase 6 (D12): the microwave — the proper fast reheat
  // (self.microwave, beating Phase 3's 10-min stove fallback). Its
  // throughput comes from EQUIPMENT_DEFS.microwave keyed to the
  // kitchen_appliances facility tier; `unique` keeps the layout backfill
  // guard from ever spawning a second one.
  microwave: {
    id: 'microwave', label: 'Microwave', nouns: ['microwave', 'microwave oven', 'nuke machine'],
    portable: false, breakable: false, container: false, private: false,
    unique: true,
    states: {}, defaultState: {},
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.microwave', 'inspect.object'],
    imagePhrase: 'a microwave with a dented door and a greasy glass plate',
  },
  pantry: {
    id: 'pantry', label: 'Pantry', nouns: ['pantry', 'cupboard'],
    portable: false, breakable: false, container: { capacity: null, storageClass: 'pantry', label: 'Pantry' }, private: false,
    states: { rotten_food: ['none', 'rotten'], door: ['closed', 'open'] },
    defaultState: { rotten_food: 'none', door: 'closed' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a small pantry shelf',
  },
  coffee_maker: {
    id: 'coffee_maker', label: 'Coffee Maker', nouns: ['coffee maker', 'coffee machine'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a coffee maker',
  },
  kitchen_table: {
    id: 'kitchen_table', label: 'Kitchen Table', nouns: ['kitchen table', 'table'],
    portable: false, breakable: false, container: false, private: false,
    // Food-overhaul Phase 4 (D9): eating leaves plates/cups/forks in a dish
    // MAP on the table (same derived-ladder read as the sink — dishLevelOf
    // against obj.dishes). Solo meals leave a tableful of plates that read
    // as mild grime; a set meal's clutter carries the social signal.
    states: { dishes: ['clean', 'few', 'many'], clutter: ['tidy', 'cluttered'] },
    defaultState: { clutter: 'tidy' },
    dirtyWhen: { dishes: { few: 0.3, many: 0.6 }, clutter: { cluttered: 0.2 } }, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a small kitchen table with mismatched chairs',
  },
  trash_kitchen: {
    id: 'trash_kitchen', label: 'Trash Can', nouns: ['trash', 'trash can', 'garbage'],
    portable: false, breakable: false, container: { capacity: null, label: 'Trash Can' }, private: false,
    states: { rotten_food: ['none', 'rotten'], fill: ['empty', 'partial', 'full'] },
    defaultState: { rotten_food: 'none', fill: 'empty' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime }, fill: { partial: 0.3, full: 0.8 } }, cleanlinessWeight: 2,
    // A bin that needs taking out smells of the same thing rot does, just
    // less — so `fill` emits `rot` at reduced intensity rather than earning a
    // signal of its own. Two keys can name the same signal; mergePerceived
    // collapses them to the strongest, which is the right answer for a full
    // bin that ALSO has something properly rotten in it.
    emits: { ...EMITS_ROT,
             fill: { partial: { signal: 'rot', intensity: 0.25 },
                     full:    { signal: 'rot', intensity: 0.5 } } },
    affords: ['container.open', 'container.take', 'container.put', 'clean.object', 'inspect.object'],
    imagePhrase: 'a kitchen trash can',
  },

  // --- Bathroom ---
  shower: {
    id: 'shower', label: 'Shower', nouns: ['shower'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], grime: ['clean', 'soap-scummed'] }, defaultState: { power: 'off', grime: 'clean' },
    dirtyWhen: { grime: { 'soap-scummed': 0.6 } }, cleanlinessWeight: 2,
    emits: { grime: { 'soap-scummed': { signal: 'bathroom_grime', intensity: 0.35 } } },
    affords: ['shower.use', 'clean.object', 'inspect.object'],
    imagePhrase: 'a shower with a frosted glass door',
  },
  // --- Changing room (floorplan plan Phase 1) ---
  // The east wing's wet room: a hygiene facility that is NOT one of the two
  // contested bathrooms, and only convenient if you are already on the pool
  // side. That conditionality is the point — it relieves bathroom
  // contention without flatly removing it.
  lockers: {
    id: 'lockers', label: 'Lockers', nouns: ['lockers', 'locker'],
    portable: false, breakable: false, container: true, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.35 } }, cleanlinessWeight: 1,
    emits: { clutter: { cluttered: { signal: 'clutter', intensity: 0.35 } } },
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a bank of narrow metal lockers',
  },
  changing_bench: {
    id: 'changing_bench', label: 'Bench', nouns: ['bench', 'changing bench'],
    portable: false, breakable: false, container: false, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.3 } }, cleanlinessWeight: 1,
    emits: { clutter: { cluttered: { signal: 'clutter', intensity: 0.3 } } },
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a slatted wooden bench with towels folded on it',
  },
  toilet: {
    id: 'toilet', label: 'Toilet', nouns: ['toilet'],
    portable: false, breakable: false, container: false, private: false,
    states: { clean: ['clean', 'dirty'] }, defaultState: { clean: 'clean' },
    dirtyWhen: { clean: { dirty: 0.7 } }, cleanlinessWeight: 2,
    emits: { clean: { dirty: { signal: 'bathroom_grime', intensity: 0.7 } } },
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a toilet',
  },
  sink_bathroom: {
    id: 'sink_bathroom', label: 'Bathroom Sink', nouns: ['sink', 'bathroom sink'],
    portable: false, breakable: false, container: false, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.4 } }, cleanlinessWeight: 1,
    emits: { clutter: { cluttered: { signal: 'clutter', intensity: 0.4 } } },
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a bathroom sink with a foggy mirror above it',
  },
  bathroom_mirror: {
    id: 'bathroom_mirror', label: 'Mirror', nouns: ['mirror'],
    portable: false, breakable: true, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a mirror',
  },
  // --- Notes (perception plan Phase 4) ---
  // A note is an ordinary object whose `read` state drives its own signal
  // intensity: unread it is the loudest thing in the room, read it is just
  // paper on a fridge. That collapse needs no code anywhere — the emits table
  // below IS the mechanism, and it falls out of the standing-signal model for
  // free (plan D1).
  //
  // Per-instance content lives on `meta` (authorId, text, addressedTo, day),
  // filled by WORLD's spawnNote. Not portable and not a container: you read a
  // note where it is, and binning it is the only way to make it stop.
  note: {
    id: 'note', label: 'Note', nouns: ['note', 'paper', 'message'],
    portable: false, breakable: false, container: false, private: false,
    states: { read: ['unread', 'read'] }, defaultState: { read: 'unread' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    emits: { read: { unread: { signal: 'note', intensity: NOTE_TUNING.unreadIntensity },
                     read:   { signal: 'note', intensity: NOTE_TUNING.readIntensity } } },
    affords: ['self.read_note', 'self.bin_note', 'inspect.object'],
    imagePhrase: 'a handwritten note',
  },
  laundry_hamper: {
    id: 'laundry_hamper', label: 'Laundry Hamper', nouns: ['hamper', 'laundry hamper', 'laundry'],
    portable: false, breakable: false, container: { capacity: null, label: 'Laundry Hamper' }, private: false,
    states: { rotten_food: ['none', 'rotten'], fill: ['empty', 'partial', 'full'] },
    defaultState: { rotten_food: 'none', fill: 'empty' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    emits: { rotten_food: { rotten: { signal: 'rot', intensity: 0.8 } },
             fill: { partial: { signal: 'stale_laundry', intensity: 0.2 },
                     full:    { signal: 'stale_laundry', intensity: 0.5 } } },
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a laundry hamper in the corner',
  },

  // --- Living room ---
  sofa: {
    id: 'sofa', label: 'Sofa', nouns: ['sofa', 'couch'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.relax', 'inspect.object'],
    imagePhrase: 'a well-worn sofa',
  },
  tv: {
    id: 'tv', label: 'TV', nouns: ['tv', 'television'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.watch_tv', 'inspect.object'],
    imagePhrase: 'a TV mounted on the wall',
  },
  coffee_table_lr: {
    id: 'coffee_table_lr', label: 'Coffee Table', nouns: ['coffee table'],
    portable: false, breakable: true, container: false, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.3 } }, cleanlinessWeight: 2,
    emits: { clutter: { cluttered: { signal: 'clutter', intensity: 0.45 } } },
    affords: ['inspect.object', 'clean.object'],
    imagePhrase: 'a coffee table scattered with mail and remotes',
  },
  bookshelf: {
    id: 'bookshelf', label: 'Bookshelf', nouns: ['bookshelf', 'shelf'],
    portable: false, breakable: false, container: { capacity: null, label: 'Bookshelf' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a bookshelf crammed with paperbacks',
  },
  lamp_lr: {
    id: 'lamp_lr', label: 'Floor Lamp', nouns: ['lamp'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a floor lamp',
  },
  plant_lr: {
    id: 'plant_lr', label: 'Houseplant', nouns: ['plant', 'houseplant'],
    portable: false, breakable: false, container: false, private: false,
    states: { health: ['thriving', 'wilting'] }, defaultState: { health: 'thriving' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a slightly neglected houseplant',
  },

  // --- Hallway ---
  // 0.8, not the floor's 0.5: a doormat is a covered indoor hallway, so
  // food left on it is at room temperature and merely uncovered. Under the
  // whole-day freshness model the distinction never showed; with continuous
  // time it is the difference between "collect your groceries this morning"
  // and "your delivery rotted while you were in the shower".
  doormat: {
    id: 'doormat', label: 'Doormat', nouns: ['doormat', 'mat'],
    portable: false, breakable: false, container: { capacity: null, storageClass: 'doormat', label: 'Doormat' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a doormat by the front door, the kind packages get left on',
  },
  coat_rack: {
    id: 'coat_rack', label: 'Coat Rack', nouns: ['coat rack', 'rack'],
    portable: false, breakable: false, container: { capacity: null, label: 'Coat Rack' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a coat rack by the door',
  },
  bedroom_door: {
    id: 'bedroom_door', label: 'Door', nouns: ['door', 'bedroom door'],
    surfaces: true,   // perception plan Phase 4: you can stick a note here
    portable: false, breakable: false, container: false, private: false,
    // ajar (intimacy-voyeurism Phase 3, D4) is the door-cue state: closed by
    // default, and a Phase 10 write-hook — nothing sets it ajar yet, so the
    // cue stays honestly silent until something opens the door a crack.
    states: { lock: ['unlocked', 'locked'], ajar: ['closed', 'ajar'] }, defaultState: { lock: 'unlocked', ajar: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.lock_door', 'self.unlock_door', 'inspect.object'],
    imagePhrase: 'a bedroom door with a simple lock',
  },
  bathroom_door: {
    id: 'bathroom_door', label: 'Door', nouns: ['door', 'bathroom door'],
    portable: false, breakable: false, container: false, private: false,
    // ajar (intimacy-voyeurism Phase 3, D4) — see the bedroom_door entry.
    states: { lock: ['unlocked', 'locked'], ajar: ['closed', 'ajar'] }, defaultState: { lock: 'unlocked', ajar: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.lock_door', 'self.unlock_door', 'inspect.object'],
    imagePhrase: 'a bathroom door with a simple lock',
  },

  // --- Dining Room ---
  dining_table: {
    id: 'dining_table', label: 'Dining Table', nouns: ['dining table', 'table'],
    surfaces: true,   // perception plan Phase 4: you can stick a note here
    portable: false, breakable: false, container: false, private: false,
    // Food-overhaul Phase 4 (D9): same dish-map + derived-ladder shape as
    // kitchen_table — a set meal leaves per-eater plates/cups/forks here.
    states: { dishes: ['clean', 'few', 'many'], clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { dishes: { few: 0.3, many: 0.6 }, clutter: { cluttered: 0.2 } }, cleanlinessWeight: 2,
    emits: { clutter: { cluttered: { signal: 'clutter', intensity: 0.4 } } },
    affords: ['inspect.object', 'clean.object'],
    imagePhrase: 'a large dining table with mismatched chairs',
  },

  // --- Entry / Foyer ---
  front_door: {
    id: 'front_door', label: 'Front Door', nouns: ['front door', 'door'],
    surfaces: true,   // perception plan Phase 4: you can stick a note here
    portable: false, breakable: false, container: false, private: false,
    states: { lock: ['unlocked', 'locked'] }, defaultState: { lock: 'unlocked' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a heavy front door',
  },
  shoe_rack: {
    id: 'shoe_rack', label: 'Shoe Rack', nouns: ['shoe rack', 'shoes'],
    portable: false, breakable: false, container: { capacity: null, label: 'Shoe Rack' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a shoe rack by the door',
  },

  // --- Game Room ---
  pool_table: {
    id: 'pool_table', label: 'Pool Table', nouns: ['pool table', 'pool'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.play_games', 'inspect.object'],
    imagePhrase: 'a pool table with a rack of cues',
  },
  game_console: {
    id: 'game_console', label: 'Game Console', nouns: ['console', 'game console', 'playstation', 'xbox'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.play_games', 'inspect.object'],
    imagePhrase: 'a game console hooked up to a wall-mounted TV',
  },
  dartboard: {
    id: 'dartboard', label: 'Dartboard', nouns: ['dartboard', 'darts'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a dartboard on the wall',
  },

  // --- Gym ---
  treadmill: {
    id: 'treadmill', label: 'Treadmill', nouns: ['treadmill', 'running machine'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.workout', 'inspect.object'],
    imagePhrase: 'a treadmill facing the window',
  },
  // --- Pool Room (Recreation Wing) ---
  // `water` tracks what the pool systems facility has actually restored:
  // 'empty' until the liner and pump are fixed, then 'filled' — and it IS
  // set now, by the facility's `completionStates` (CONFIG's FACILITY_DEFS,
  // applied at job completion in UI). It used to be a state nothing ever
  // wrote, which is how the derelict pool ended up smelling of stagnant
  // water it does not contain: the emitter keyed on `clarity` alone, so a
  // dry basin with a torn liner announced itself as green pool water.
  //
  // The two states now say different things. `water` is what the renovation
  // restored; `clarity` is upkeep — how much has grown in the basin, whether
  // that basin is full or dry. The same `clarity: 'green'` therefore means
  // two different smells, so the emitters are guarded on which side of the
  // renovation the pool is on: filled → stagnant water, empty → the mildew
  // and dead-chlorine damp of a sealed indoor pool room (this is a penthouse
  // and the pool is INDOORS — no leaves, no rain, nothing blows in; what
  // rots here is mould in the grout and standing water in the drain). All
  // four combinations read coherently, and the tier-0 description ("It holds
  // no water") is finally true of the room you walk into.
  //
  // `dirtyWhen` stays keyed on `clarity` ALONE and must — cleanRoomObjects
  // resets every dirtyWhen key to `states[key][0]`, so listing `water` here
  // would let the housekeeper rebuild a $12,000 pool with a mop. Scrubbing
  // the basin out is what cleaning a derelict pool can do; filling it is the
  // contractor's job.
  swimming_pool: {
    id: 'swimming_pool', label: 'Swimming Pool', nouns: ['pool', 'swimming pool', 'the water'],
    portable: false, breakable: false, container: false, private: false,
    states: { water: ['filled', 'empty'], clarity: ['clear', 'cloudy', 'green'] },
    defaultState: { water: 'empty', clarity: 'green' },
    dirtyWhen: { clarity: { cloudy: 0.5, green: 1.0 } }, cleanlinessWeight: 4,
    emits: {
      water:   { empty: { signal: 'derelict_pool', intensity: 0.7, when: { clarity: 'green' } } },
      clarity: { cloudy: { signal: 'stagnant_water', intensity: 0.4, when: { water: 'filled' } },
                 green:  { signal: 'stagnant_water', intensity: 0.85, when: { water: 'filled' } } },
    },
    affords: ['self.swim', 'clean.object', 'inspect.object'],
    imagePhrase: 'an indoor swimming pool',
  },
  pool_pump: {
    id: 'pool_pump', label: 'Pool Pump & Filter', nouns: ['pump', 'filter', 'pool pump', 'filtration'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'] }, defaultState: { power: 'off' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a pool pump and filter housing in the corner',
  },
  pool_loungers: {
    id: 'pool_loungers', label: 'Loungers', nouns: ['loungers', 'deck chairs', 'lounger'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.relax', 'inspect.object'],
    imagePhrase: 'a row of loungers along the poolside',
  },
  weight_set: {
    id: 'weight_set', label: 'Weight Set', nouns: ['weights', 'weight set', 'dumbbells'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.workout', 'inspect.object'],
    imagePhrase: 'a rack of dumbbells and a weight bench',
  },
  yoga_mat: {
    id: 'yoga_mat', label: 'Yoga Mat', nouns: ['yoga mat', 'mat'],
    portable: true, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.workout', 'self.relax', 'inspect.object'],
    imagePhrase: 'a rolled yoga mat in the corner',
  },

  // --- Study ---
  study_desk: {
    id: 'study_desk', label: 'Study Desk', nouns: ['study desk', 'desk'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.study', 'inspect.object'],
    imagePhrase: 'a large oak desk with a reading lamp',
  },
  study_bookshelf: {
    id: 'study_bookshelf', label: 'Bookshelf', nouns: ['bookshelf', 'shelf', 'books'],
    portable: false, breakable: false, container: { capacity: null, label: 'Bookshelf' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'floor-to-ceiling bookshelves lined with well-worn books',
  },
  armchair: {
    id: 'armchair', label: 'Armchair', nouns: ['armchair', 'chair'],
    portable: false, breakable: false, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.relax', 'inspect.object'],
    imagePhrase: 'a leather armchair by the window',
  },

  // --- Balcony ---
  balcony_table: {
    id: 'balcony_table', label: 'Bistro Table', nouns: ['table', 'bistro table'],
    portable: false, breakable: true, container: false, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a small bistro table with two chairs',
  },
  plant_balcony: {
    id: 'plant_balcony', label: 'Potted Plants', nouns: ['plants', 'potted plants', 'plant'],
    portable: false, breakable: false, container: false, private: false,
    states: { health: ['thriving', 'wilting'] }, defaultState: { health: 'thriving' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'potted plants along the railing',
  },

  // --- Laundry Room ---
  washer: {
    id: 'washer', label: 'Washer', nouns: ['washer', 'washing machine'],
    portable: false, breakable: true, container: { capacity: null, label: 'Washer' }, private: false,
    states: { rotten_food: ['none', 'rotten'], power: ['off', 'on'], cycle: ['empty', 'running', 'done'] },
    defaultState: { rotten_food: 'none', power: 'off', cycle: 'empty' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['self.laundry', 'container.open', 'container.put', 'inspect.object'],
    imagePhrase: 'a front-loading washing machine',
  },
  dryer: {
    id: 'dryer', label: 'Dryer', nouns: ['dryer', 'drying machine'],
    portable: false, breakable: true, container: { capacity: null, label: 'Dryer' }, private: false,
    states: { rotten_food: ['none', 'rotten'], power: ['off', 'on'], cycle: ['empty', 'running', 'done'] },
    defaultState: { rotten_food: 'none', power: 'off', cycle: 'empty' },
    dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 1,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'inspect.object'],
    imagePhrase: 'a dryer next to the washer',
  },
  // Dropped items (inventory overhaul Phase 1): every room gets one floor
  // object so the inventory panel's Drop verb has a real destination that
  // persists like any other container. Deliberately invisible and inert —
  // no imagePhrase (room scene prompts must not mention empty floor), no
  // cleanlinessWeight, no affordances. Phase 2 gives it browsing UI and
  // its preservation multiplier (0.5, floor/doormat row of the table).
  floor: {
    id: 'floor', label: 'Floor', nouns: ['floor', 'ground'],
    portable: false, breakable: false, container: { capacity: null, storageClass: 'floor', label: 'Floor' }, private: false,
    states: { rotten_food: ['none', 'rotten'] }, defaultState: { rotten_food: 'none' }, dirtyWhen: { rotten_food: { rotten: ROT.rottenMessGrime } }, cleanlinessWeight: 0,
    emits: EMITS_ROT,
    affords: ['container.open', 'container.take', 'container.put'],
  },
};

// --- Apartment layout: what's in each room at new-game spawn ---
// `ownerFrom: 'roomResident'` resolves at spawn time to whichever npc (or
// 'player') currently has residency in that room — see WORLD's
// resolvePlacementOwner. An entry with no owner marker spawns unowned
// (shared/house property), which is correct for shared furniture even
// inside a bedroom (the desk itself isn't "someone's" the way their diary
// or guitar is).
// Bump whenever a fixture is ADDED to an existing room's placement list.
// WORLD's ensureAllObjectBuckets compares this against meta.layoutVersion
// and back-fills the new fixtures into already-spawned buckets exactly
// once. (v2 = the Mirrored H expansion: bedroom_door/bathroom_door and the
// seven new rooms.) Removing a fixture needs no bump — the back-fill only
// ever adds, and never deletes what a save already has.
// (v4 = inventory overhaul Phase 1: a `floor` in every room for Drop.)
const APARTMENT_LAYOUT_VERSION = 8;

const APARTMENT_LAYOUT = {
  bedroom_player: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'desktop_computer' },
    { defId: 'phone', ownerFrom: 'roomResident' },
    { defId: 'floor' },
  ],
  bedroom_1: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'guitar', ownerFrom: 'roomResident' },
    { defId: 'diary', ownerFrom: 'roomResident' },
    { defId: 'floor' },
  ],
  bedroom_2: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'jewelry_box', ownerFrom: 'roomResident' },
    { defId: 'floor' },
  ],
  bedroom_3: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'floor' },
  ],
  kitchen: [
    { defId: 'stove' }, { defId: 'fridge' }, { defId: 'freezer' }, { defId: 'sink_kitchen' },
    { defId: 'pantry' }, { defId: 'coffee_maker' }, { defId: 'kitchen_table' }, { defId: 'trash_kitchen' },
    { defId: 'dishwasher' },  // food-overhaul Phase 4 (D11)
    { defId: 'microwave' },   // food-overhaul Phase 6 (D12) — the fast reheat
    { defId: 'floor' },
  ],
  bathroom_a: [
    { defId: 'bathroom_door' },
    { defId: 'shower' }, { defId: 'toilet' }, { defId: 'sink_bathroom' },
    { defId: 'bathroom_mirror' },
    { defId: 'floor' },
  ],
  bathroom_b: [
    { defId: 'bathroom_door' },
    { defId: 'shower' }, { defId: 'toilet' }, { defId: 'sink_bathroom' },
    { defId: 'bathroom_mirror' },
    { defId: 'floor' },
  ],
  living_room: [
    { defId: 'sofa' }, { defId: 'tv' }, { defId: 'coffee_table_lr' },
    { defId: 'bookshelf' }, { defId: 'lamp_lr' }, { defId: 'plant_lr' },
    { defId: 'stereo' },   // Intimacy & Voyeurism Phase 19: the soundscape
    { defId: 'floor' },
  ],
  hallway_a: [
    { defId: 'coat_rack' },
    { defId: 'floor' },
  ],
  hallway_b: [
    { defId: 'coat_rack' },
    { defId: 'floor' },
  ],
  entry: [
    { defId: 'front_door' },
    { defId: 'doormat' },
    { defId: 'shoe_rack' },
    { defId: 'floor' },
  ],
  dining: [
    { defId: 'dining_table' },
    { defId: 'floor' },
  ],
  game_room: [
    { defId: 'pool_table' }, { defId: 'game_console' }, { defId: 'dartboard' },
    { defId: 'floor' },
  ],
  gym: [
    { defId: 'treadmill' }, { defId: 'weight_set' }, { defId: 'yoga_mat' },
    { defId: 'floor' },
  ],
  // Doors on both faces (north to the Gym, south to the Game Room), which is
  // what puts this room ON the path through the east wing rather than in a
  // detour off it.
  changing_room: [
    { defId: 'shower' }, { defId: 'lockers' }, { defId: 'changing_bench' },
    { defId: 'bathroom_mirror' },
    { defId: 'floor' },
  ],
  pool_room: [
    { defId: 'swimming_pool' }, { defId: 'pool_pump' }, { defId: 'pool_loungers' },
    { defId: 'floor' },
  ],
  study: [
    { defId: 'study_desk' }, { defId: 'study_bookshelf' }, { defId: 'armchair' },
    { defId: 'floor' },
  ],
  balcony: [
    { defId: 'balcony_table' }, { defId: 'plant_balcony' },
    { defId: 'floor' },
  ],
  laundry: [
    { defId: 'washer' }, { defId: 'dryer' }, { defId: 'laundry_hamper' },
    { defId: 'floor' },
  ],
};

// --- Item definitions (ITEMS section) ---
// Uniform stack shape everywhere an item can sit — player.inventory and a
// container's .contents — is { defId, qty, ownerId, meta }. `price`/
// `buyQty` are what a later SHOP_CATALOG (P4) derives from, so pricing
// lives with the item once, not duplicated into a parallel catalog table.
const ITEM_DEFS = {
  _unknown: {
    id: '_unknown', label: 'Unidentified Item', nouns: [], category: 'misc',
    stackable: true, maxStack: 99,
  },

  // --- Key items (inventory overhaul Phase 1) ---
  // Personal effects that can never be dropped, trashed, or given away —
  // `keyItem` is exactly the flag the panel's stackActions reads to hide
  // those verbs. Deliberately NO `price`, so SHOP_CATALOG_LIST (ITEMS)
  // never offers them for sale. Seeded into the player's starting
  // inventory (SIM's buildGameState) so the protection is real from day
  // one; Phase 8 seeds the same shape into NPC inventories.
  apartment_keys: { id: 'apartment_keys', label: 'Keys', nouns: ['keys', 'key', 'apartment keys'], category: 'key', keyItem: true, stackable: false, maxStack: 1 },
  wallet: { id: 'wallet', label: 'Wallet', nouns: ['wallet'], category: 'key', keyItem: true, stackable: false, maxStack: 1 },
  id_card: { id: 'id_card', label: 'ID Card', nouns: ['id', 'id card', 'idcard'], category: 'key', keyItem: true, stackable: false, maxStack: 1 },
  // Phase 8 (NPC inventories, D8): everyone's personal phone — seeded into
  // NPC inventories like the other key items and protected the same way
  // (keyItem = can't be dropped, trashed, or taken by the player's room-
  // search). Deliberately NO `price`, so it never joins Nile's catalog.
  personal_phone: { id: 'personal_phone', label: 'Phone', nouns: ['phone', 'cellphone', 'cell phone'], category: 'key', keyItem: true, stackable: false, maxStack: 1 },

  // Ingredients
  // `perishable.days` is the ROOM-TEMPERATURE time to inedible (see the ROT
  // block in CONFIG) — the end of the ladder, not the first sign of trouble.
  // A container's preservation multiplier (ROT.preservation, looked up by
  // the container's storageClass) stretches the whole ladder, so these read
  // as "on the counter", and the fridge's 5× is what makes them read as a
  // real week or a real month. Food-overhaul Phase 1 (D18) re-derived these
  // from real-world-ish shelf life compressed to game pace and bumped the
  // short ones (milk/raw meat/bacon/lettuce) so a delivery that spends a
  // night on the doormat survives to be put away.
  // Food-overhaul Phase 3 (D5): every ingredient carries one `foodGroup`
  // (starchy/protein/vegetable/dairy/sweet/fat) — the meal bonus that the
  // plate builder (ITEMS' makePlate) reads through foodGroupOf, so the
  // bonus metric (food-group variety, the phase's resolution of the open
  // question) has ONE owning definition per def and one consumer.
  eggs: { id: 'eggs', storageClass: 'fridge', label: 'Eggs', nouns: ['egg', 'eggs'], category: 'ingredient', stackable: true, maxStack: 24, perishable: { days: 7 }, consumable: { hunger: 6, kcal: 72 }, foodGroup: 'protein', rawDangerous: true, price: 4, buyQty: 12 },
  milk: { id: 'milk', storageClass: 'fridge', label: 'Milk', nouns: ['milk'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 3 }, consumable: { hunger: 3, kcal: 120 }, foodGroup: 'dairy', price: 3, buyQty: 1 },
  bread: { id: 'bread', storageClass: 'fridge', label: 'Bread', nouns: ['bread', 'loaf'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 5 }, consumable: { hunger: 10, kcal: 80 }, foodGroup: 'starchy', price: 3, buyQty: 1 },
  pasta_dry: { id: 'pasta_dry', storageClass: 'pantry', label: 'Dry Pasta', nouns: ['pasta'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 15, kcal: 200 }, foodGroup: 'starchy', price: 2, buyQty: 2 },
  tomato_sauce: { id: 'tomato_sauce', storageClass: 'pantry', label: 'Tomato Sauce', nouns: ['tomato sauce', 'sauce'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 4, kcal: 70 }, foodGroup: 'vegetable', price: 3, buyQty: 2 },
  rice: { id: 'rice', storageClass: 'pantry', label: 'Rice', nouns: ['rice'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 12, kcal: 205 }, foodGroup: 'starchy', price: 4, buyQty: 2 },
  // Raw meat is the shortest-lived thing you can buy, but not so short that
  // a Nile order can rot on the doormat before you get up — 1 day out is
  // 18h on the mat and 4 days in the fridge.
  chicken_raw: { id: 'chicken_raw', storageClass: 'fridge', label: 'Raw Chicken', nouns: ['chicken'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 1.5 }, consumable: { hunger: 5, kcal: 165 }, foodGroup: 'protein', rawDangerous: true, price: 8, buyQty: 2 },
  ground_beef: { id: 'ground_beef', storageClass: 'fridge', label: 'Ground Beef', nouns: ['ground beef', 'beef'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 1.5 }, consumable: { hunger: 5, kcal: 243 }, foodGroup: 'protein', rawDangerous: true, price: 9, buyQty: 1 },
  cheese: { id: 'cheese', storageClass: 'fridge', label: 'Cheese', nouns: ['cheese'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 7 }, consumable: { hunger: 4, kcal: 110 }, foodGroup: 'dairy', price: 5, buyQty: 1 },
  butter: { id: 'butter', kcal: 102, storageClass: 'fridge', label: 'Butter', nouns: ['butter'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 14 }, foodGroup: 'fat', price: 4, buyQty: 1 },
  onion: { id: 'onion', storageClass: 'pantry', label: 'Onion', nouns: ['onion'], category: 'ingredient', stackable: true, maxStack: 10, consumable: { hunger: 2, kcal: 44 }, foodGroup: 'vegetable', price: 1, buyQty: 3 },
  garlic: { id: 'garlic', kcal: 4, storageClass: 'pantry', label: 'Garlic', nouns: ['garlic'], category: 'ingredient', stackable: true, maxStack: 10, foodGroup: 'vegetable', price: 1, buyQty: 3 },
  potatoes: { id: 'potatoes', storageClass: 'pantry', label: 'Potatoes', nouns: ['potato', 'potatoes'], category: 'ingredient', stackable: true, maxStack: 10, consumable: { hunger: 8, kcal: 160 }, foodGroup: 'starchy', price: 3, buyQty: 5 },
  lettuce: { id: 'lettuce', storageClass: 'fridge', label: 'Lettuce', nouns: ['lettuce'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 3, kcal: 8 }, foodGroup: 'vegetable', price: 2, buyQty: 1 },
  tomato: { id: 'tomato', storageClass: 'fridge', label: 'Tomato', nouns: ['tomato'], category: 'ingredient', stackable: true, maxStack: 8, perishable: { days: 5 }, consumable: { hunger: 2, kcal: 22 }, foodGroup: 'vegetable', price: 1, buyQty: 4 },
  bacon: { id: 'bacon', storageClass: 'fridge', label: 'Bacon', nouns: ['bacon'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 5, kcal: 86 }, foodGroup: 'protein', rawDangerous: true, price: 6, buyQty: 1 },
  flour: { id: 'flour', kcal: 228, storageClass: 'pantry', label: 'Flour', nouns: ['flour'], category: 'ingredient', stackable: true, maxStack: 4, foodGroup: 'starchy', price: 3, buyQty: 1 },
  sugar: { id: 'sugar', kcal: 48, storageClass: 'pantry', label: 'Sugar', nouns: ['sugar'], category: 'ingredient', stackable: true, maxStack: 4, foodGroup: 'sweet', price: 3, buyQty: 1 },
  // Food-overhaul Phase 5 (D8): the fat/seasoning reagents — real pantry
  // items the cooking engine consumes in tiny quantities. Deliberately NO
  // consumable block (top-level `kcal` only, like butter/flour/sugar), so
  // they stay OUT of the eat picker — you don't sit down to a bowl of
  // salt. COOK_TUNING.reagents owns their cooking role.
  oil: { id: 'oil', kcal: 40, storageClass: 'pantry', label: 'Oil', nouns: ['oil', 'cooking oil'], category: 'ingredient', stackable: true, maxStack: 4, foodGroup: 'fat', price: 4, buyQty: 1 },
  salt: { id: 'salt', kcal: 0, storageClass: 'pantry', label: 'Salt', nouns: ['salt'], category: 'ingredient', stackable: true, maxStack: 6, price: 1, buyQty: 1 },
  spices: { id: 'spices', kcal: 4, storageClass: 'pantry', label: 'Spices', nouns: ['spices', 'spice'], category: 'ingredient', stackable: true, maxStack: 4, price: 4, buyQty: 1 },
  coffee_beans: { id: 'coffee_beans', storageClass: 'pantry', label: 'Coffee', nouns: ['coffee', 'coffee beans'], category: 'ingredient', stackable: true, maxStack: 4, consumable: { energy: 8, mood: 0.02, kcal: 2 }, price: 8, buyQty: 1 },
  tea_bags: { id: 'tea_bags', storageClass: 'pantry', label: 'Tea Bags', nouns: ['tea'], category: 'ingredient', stackable: true, maxStack: 20, consumable: { mood: 0.02, kcal: 1 }, price: 4, buyQty: 10 },
  cereal: { id: 'cereal', storageClass: 'pantry', label: 'Cereal', nouns: ['cereal'], category: 'ingredient', stackable: true, maxStack: 3, consumable: { hunger: 12, kcal: 210 }, foodGroup: 'starchy', price: 4, buyQty: 1 },

  // Prepared meals (produced by RECIPES below)
  // Cooked food, same room-temperature-to-inedible reading as the
  // ingredients. A day or two on the counter; four to eight in the fridge,
  // which is where leftovers actually live.
  meal_pasta: { id: 'meal_pasta', storageClass: 'fridge', label: 'Pasta', nouns: ['pasta'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.03, kcal: 450 } },
  meal_omelette: { id: 'meal_omelette', storageClass: 'fridge', label: 'Omelette', nouns: ['omelette'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.02, kcal: 300 } },
  meal_stirfry: { id: 'meal_stirfry', storageClass: 'fridge', label: 'Stir-fry', nouns: ['stir-fry', 'stirfry'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 42, mood: 0.03, kcal: 600 } },
  meal_sandwich: { id: 'meal_sandwich', storageClass: 'fridge', label: 'Sandwich', nouns: ['sandwich'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 25, kcal: 380 } },
  // --- New meal items (P8) ---
  meal_breakfast: { id: 'meal_breakfast', storageClass: 'fridge', label: 'Bacon and Eggs', nouns: ['bacon and eggs', 'breakfast'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 35, mood: 0.03, kcal: 430 } },
  meal_burger: { id: 'meal_burger', storageClass: 'fridge', label: 'Burger', nouns: ['burger'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 38, mood: 0.04, kcal: 550 } },
  meal_salad: { id: 'meal_salad', storageClass: 'fridge', label: 'Salad', nouns: ['salad'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.02, kcal: 250 } },
  meal_fried_rice: { id: 'meal_fried_rice', storageClass: 'fridge', label: 'Fried Rice', nouns: ['fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.03, kcal: 550 } },
  meal_soup: { id: 'meal_soup', storageClass: 'fridge', label: 'Tomato Soup', nouns: ['soup', 'tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 3 }, consumable: { hunger: 28, mood: 0.02, kcal: 250 } },
  meal_potato: { id: 'meal_potato', storageClass: 'fridge', label: 'Loaded Potato', nouns: ['potato', 'baked potato'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.03, kcal: 400 } },

  // Food-overhaul Phase 3 (D5/D25): the carrier def for EVERY home-cooked
  // plate. Cooked food is an INSTANCE now — the real label, kcal, quality,
  // grade, servings and components live on stack.meta.plate (computed once
  // by ITEMS' makePlate at cook time, a snapshot per design invariant 1),
  // NOT on a per-recipe meal_* def. This def exists only so a plate rides
  // the ordinary stack pipeline (containers, freshness, pickers): it is a
  // meal so it is edible, its consumable is a placeholder that every
  // plate-aware reader (EFFECTS' EAT_ITEM/DESTROY_ITEM, INVENTORY's
  // stackServingsLeft/describeStack, the pickers) overrides, and it never
  // merges (stackable:false + ITEMS' addStack plate guard). The legacy
  // meal_* defs above stay for saves cooked before this phase.
  cooked_meal: { id: 'cooked_meal', storageClass: 'fridge', label: 'Cooked Meal', nouns: ['cooked meal', 'home-cooked meal', 'leftovers'], category: 'meal', stackable: false, maxStack: 1, perishable: { days: 3 }, consumable: { hunger: 1, kcal: 1 } },

  // Delivered restaurant dishes (external-world plan Phase 5). Real items,
  // not a "you ate out" abstraction: a delivered dish lands in inventory or
  // on the doormat like any other object, can go in the fridge, and carries
  // the same perishable/consumable fields as a home-cooked meal. Deliberately
  // NO `price` field — price is per-restaurant and lives in RESTAURANT_DEFS'
  // menu (DEFS.COMPUTER); a `price` here would put takeout in Nile's catalog,
  // which builds itself from every priced ITEM_DEF (SHOP_CATALOG_LIST, ITEMS).
  // Restaurant food beats home cooking on hunger and mood — that's what the
  // markup buys — and spoils faster, so ordering ahead has a real cost.
  // Inventory overhaul Phase 3: whole/shared dishes carry `servings: n` —
  // eating one serving leaves the rest behind as a partial stack
  // (meta.servingsLeft), so a pizza is eaten a slice at a time instead of
  // vanishing whole. See INVENTORY's edibility/servings section.
  // Food-overhaul Phase 3 (D28): `frozenFood: true` marks food whose
  // intended state is frozen — eating it frozen costs nothing. Read by
  // EFFECTS' EAT_ITEM (D28 exemption) at eat time.
  dish_kung_pao: { id: 'dish_kung_pao', storageClass: 'fridge', label: 'Kung Pao Chicken', nouns: ['kung pao', 'kung pao chicken'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 45, mood: 0.05, kcal: 800 } },
  dish_chow_mein: { id: 'dish_chow_mein', storageClass: 'fridge', label: 'Beef Chow Mein', nouns: ['chow mein', 'noodles'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.04, kcal: 780 } },
  dish_dumplings: { id: 'dish_dumplings', storageClass: 'fridge', label: 'Pork Dumplings', nouns: ['dumplings'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.05, kcal: 480 } },
  dish_egg_rolls: { id: 'dish_egg_rolls', storageClass: 'fridge', label: 'Egg Rolls', nouns: ['egg rolls'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 18, mood: 0.03, kcal: 260 } },

  dish_pepperoni_pizza: { id: 'dish_pepperoni_pizza', storageClass: 'fridge', label: 'Pepperoni Pizza', nouns: ['pizza', 'pepperoni pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, servings: 4, consumable: { hunger: 55, mood: 0.06, kcal: 2600 } },
  dish_garlic_knots: { id: 'dish_garlic_knots', storageClass: 'fridge', label: 'Garlic Knots', nouns: ['garlic knots', 'knots'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 20, mood: 0.04, kcal: 350 } },
  dish_calzone: { id: 'dish_calzone', storageClass: 'fridge', label: 'Calzone', nouns: ['calzone'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05, kcal: 750 } },

  dish_double_burger: { id: 'dish_double_burger', storageClass: 'fridge', label: 'Double Cheeseburger', nouns: ['burger', 'cheeseburger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 50, mood: 0.05, kcal: 900 } },
  dish_fries: { id: 'dish_fries', storageClass: 'fridge', label: 'Basket of Fries', nouns: ['fries'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.04, kcal: 365 } },
  dish_milkshake: { id: 'dish_milkshake', storageClass: 'fridge', label: 'Milkshake', nouns: ['milkshake', 'shake'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 0.5 }, consumable: { hunger: 15, mood: 0.06, kcal: 500 } },

  dish_salmon_roll: { id: 'dish_salmon_roll', storageClass: 'fridge', label: 'Salmon Roll Set', nouns: ['sushi', 'salmon roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.07, kcal: 540 } },
  dish_tempura_udon: { id: 'dish_tempura_udon', storageClass: 'fridge', label: 'Tempura Udon', nouns: ['udon', 'tempura udon'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05, kcal: 620 } },
  dish_miso_soup: { id: 'dish_miso_soup', storageClass: 'fridge', label: 'Miso Soup', nouns: ['miso', 'miso soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 16, mood: 0.03, kcal: 90 } },

  dish_al_pastor: { id: 'dish_al_pastor', storageClass: 'fridge', label: 'Al Pastor Tacos', nouns: ['tacos', 'al pastor'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.06, kcal: 600 } },
  dish_burrito: { id: 'dish_burrito', storageClass: 'fridge', label: 'Carne Asada Burrito', nouns: ['burrito'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 52, mood: 0.05, kcal: 780 } },
  dish_chips_guac: { id: 'dish_chips_guac', storageClass: 'fridge', label: 'Chips & Guac', nouns: ['chips and guac', 'guacamole'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.04, kcal: 350 } },

  dish_pad_thai: { id: 'dish_pad_thai', storageClass: 'fridge', label: 'Pad Thai', nouns: ['pad thai'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.06, kcal: 800 } },
  dish_green_curry: { id: 'dish_green_curry', storageClass: 'fridge', label: 'Green Curry', nouns: ['green curry', 'curry'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05, kcal: 700 } },
  dish_spring_rolls: { id: 'dish_spring_rolls', storageClass: 'fridge', label: 'Fresh Spring Rolls', nouns: ['spring rolls'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04, kcal: 280 } },

  // --- Full-menu expansion (restaurant network overhaul Phase 3): every
  // new dish follows the same conventions — NO `price` (prices live in the
  // restaurant's menu entries only), stackable, 1-2 day perishable (fried/
  // short-lived = 1, noodle/curry/diner = 2), hunger in the existing range
  // with mood 0.03-0.08; coffee/tea drinks add `energy` like coffee_beans.
  // Golden Wok
  dish_orange_chicken: { id: 'dish_orange_chicken', storageClass: 'fridge', label: 'Orange Chicken', nouns: ['orange chicken'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05, kcal: 900 } },
  dish_lo_mein: { id: 'dish_lo_mein', storageClass: 'fridge', label: 'Lo Mein', nouns: ['lo mein'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.04, kcal: 750 } },
  dish_house_fried_rice: { id: 'dish_house_fried_rice', storageClass: 'fridge', label: 'House Fried Rice', nouns: ['fried rice', 'house fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.04, kcal: 780 } },
  dish_beef_broccoli: { id: 'dish_beef_broccoli', storageClass: 'fridge', label: 'Beef & Broccoli', nouns: ['beef and broccoli', 'broccoli'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05, kcal: 850 } },
  dish_wonton_soup: { id: 'dish_wonton_soup', storageClass: 'fridge', label: 'Wonton Soup', nouns: ['wonton soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 20, mood: 0.04, kcal: 180 } },
  dish_fortune_cookies: { id: 'dish_fortune_cookies', storageClass: 'fridge', label: 'Fortune Cookies', nouns: ['fortune cookies', 'fortune cookie'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 14 }, consumable: { hunger: 8, mood: 0.03, kcal: 120 } },

  // Sal's Pizzeria
  dish_cheese_pizza: { id: 'dish_cheese_pizza', storageClass: 'fridge', label: 'Cheese Pizza', nouns: ['cheese pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, servings: 4, consumable: { hunger: 48, mood: 0.05, kcal: 2400 } },
  dish_sausage_pizza: { id: 'dish_sausage_pizza', storageClass: 'fridge', label: 'Sausage Pizza', nouns: ['sausage pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, servings: 4, consumable: { hunger: 52, mood: 0.06, kcal: 2600 } },
  dish_white_pizza: { id: 'dish_white_pizza', storageClass: 'fridge', label: 'White Pizza', nouns: ['white pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, servings: 4, consumable: { hunger: 50, mood: 0.05, kcal: 2500 } },
  dish_meatball_sub: { id: 'dish_meatball_sub', storageClass: 'fridge', label: 'Meatball Sub', nouns: ['meatball sub', 'sub'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.05, kcal: 820 } },
  dish_breadsticks: { id: 'dish_breadsticks', storageClass: 'fridge', label: 'Garlic Breadsticks', nouns: ['breadsticks', 'breadstick'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04, kcal: 350 } },
  dish_caesar_wedge: { id: 'dish_caesar_wedge', storageClass: 'fridge', label: 'Caesar Wedge', nouns: ['caesar salad', 'wedge'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.03, kcal: 320 } },
  dish_cannoli: { id: 'dish_cannoli', storageClass: 'fridge', label: 'Cannoli', nouns: ['cannoli'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.06, kcal: 250 } },
  dish_limonata: { id: 'dish_limonata', storageClass: 'fridge', label: 'Lemon Soda', nouns: ['limonata', 'lemon soda'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 10, mood: 0.03, kcal: 130 } },

  // Big Bite Burgers
  dish_breakfast_burger: { id: 'dish_breakfast_burger', storageClass: 'fridge', label: 'Breakfast Burger', nouns: ['breakfast burger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05, kcal: 700 } },
  dish_sausage_egg_muffin: { id: 'dish_sausage_egg_muffin', storageClass: 'fridge', label: 'Sausage Egg Muffin', nouns: ['sausage egg muffin', 'egg muffin'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04, kcal: 480 } },
  dish_pancakes: { id: 'dish_pancakes', storageClass: 'fridge', label: 'Short Stack of Pancakes', nouns: ['pancakes', 'pancake'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, servings: 3, consumable: { hunger: 36, mood: 0.05, kcal: 600 } },
  dish_hash_browns: { id: 'dish_hash_browns', storageClass: 'fridge', label: 'Hash Browns', nouns: ['hash browns', 'hash brown'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.03, kcal: 230 } },
  dish_chicken_sandwich: { id: 'dish_chicken_sandwich', storageClass: 'fridge', label: 'Crispy Chicken Sandwich', nouns: ['chicken sandwich'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05, kcal: 620 } },
  dish_onion_rings: { id: 'dish_onion_rings', storageClass: 'fridge', label: 'Onion Rings', nouns: ['onion rings'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.04, kcal: 400 } },
  dish_bacon_burger: { id: 'dish_bacon_burger', storageClass: 'fridge', label: 'Bacon Cheeseburger', nouns: ['bacon cheeseburger', 'burger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 52, mood: 0.06, kcal: 950 } },
  dish_nuggets: { id: 'dish_nuggets', storageClass: 'fridge', label: 'Chicken Nuggets', nouns: ['nuggets'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04, kcal: 280 } },
  dish_lemonade: { id: 'dish_lemonade', storageClass: 'fridge', label: 'Fresh Lemonade', nouns: ['lemonade'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 8, mood: 0.03, kcal: 180 } },
  dish_apple_pie: { id: 'dish_apple_pie', storageClass: 'fridge', label: 'Apple Pie Slice', nouns: ['apple pie'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04, kcal: 350 } },

  // Kaisen Sushi
  dish_spicy_tuna_roll: { id: 'dish_spicy_tuna_roll', storageClass: 'fridge', label: 'Spicy Tuna Roll', nouns: ['spicy tuna roll', 'tuna roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.06, kcal: 400 } },
  dish_rainbow_roll: { id: 'dish_rainbow_roll', storageClass: 'fridge', label: 'Rainbow Roll', nouns: ['rainbow roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.07, kcal: 450 } },
  dish_ebi_tempura: { id: 'dish_ebi_tempura', storageClass: 'fridge', label: 'Ebi Tempura', nouns: ['ebi tempura', 'tempura'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.05, kcal: 420 } },
  dish_chicken_katsu: { id: 'dish_chicken_katsu', storageClass: 'fridge', label: 'Chicken Katsu', nouns: ['chicken katsu', 'katsu'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.05, kcal: 700 } },
  dish_gyoza: { id: 'dish_gyoza', storageClass: 'fridge', label: 'Pork Gyoza', nouns: ['gyoza'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.05, kcal: 330 } },
  dish_edamame: { id: 'dish_edamame', storageClass: 'fridge', label: 'Edamame', nouns: ['edamame'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.03, kcal: 160 } },
  dish_green_tea: { id: 'dish_green_tea', storageClass: 'fridge', label: 'Green Tea', nouns: ['green tea', 'tea'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 6, mood: 0.02, energy: 4, kcal: 5 } },
  dish_mochi: { id: 'dish_mochi', storageClass: 'fridge', label: 'Mochi', nouns: ['mochi'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 12, mood: 0.06, kcal: 180 } },

  // El Camino Taqueria
  dish_carnitas_tacos: { id: 'dish_carnitas_tacos', storageClass: 'fridge', label: 'Carnitas Tacos', nouns: ['carnitas tacos', 'tacos'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05, kcal: 620 } },
  dish_chorizo_tacos: { id: 'dish_chorizo_tacos', storageClass: 'fridge', label: 'Chorizo Tacos', nouns: ['chorizo tacos', 'tacos'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.06, kcal: 650 } },
  dish_quesadilla: { id: 'dish_quesadilla', storageClass: 'fridge', label: 'Cheese Quesadilla', nouns: ['quesadilla'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.05, kcal: 520 } },
  dish_tamales: { id: 'dish_tamales', storageClass: 'fridge', label: 'Tamales', nouns: ['tamales'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 36, mood: 0.05, kcal: 400 } },
  dish_elote: { id: 'dish_elote', storageClass: 'fridge', label: 'Mexican Street Corn', nouns: ['elote', 'street corn'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.04, kcal: 230 } },
  dish_sopes: { id: 'dish_sopes', storageClass: 'fridge', label: 'Sopes', nouns: ['sopes'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04, kcal: 480 } },
  dish_horchata: { id: 'dish_horchata', storageClass: 'fridge', label: 'Horchata', nouns: ['horchata'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.03, kcal: 300 } },
  dish_bean_cheese_burrito: { id: 'dish_bean_cheese_burrito', storageClass: 'fridge', label: 'Bean & Cheese Burrito', nouns: ['bean and cheese burrito', 'burrito'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04, kcal: 560 } },

  // Bangkok House
  dish_drunken_noodles: { id: 'dish_drunken_noodles', storageClass: 'fridge', label: 'Drunken Noodles', nouns: ['drunken noodles'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05, kcal: 850 } },
  dish_massaman_curry: { id: 'dish_massaman_curry', storageClass: 'fridge', label: 'Massaman Curry', nouns: ['massaman curry', 'curry'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 50, mood: 0.06, kcal: 800 } },
  dish_thai_fried_rice: { id: 'dish_thai_fried_rice', storageClass: 'fridge', label: 'Thai Fried Rice', nouns: ['thai fried rice', 'fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.04, kcal: 780 } },
  dish_tom_yum: { id: 'dish_tom_yum', storageClass: 'fridge', label: 'Tom Yum Soup', nouns: ['tom yum', 'tom yum soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 24, mood: 0.03, kcal: 220 } },
  dish_satay: { id: 'dish_satay', storageClass: 'fridge', label: 'Chicken Satay', nouns: ['satay', 'chicken satay'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.04, kcal: 380 } },
  dish_thai_iced_tea: { id: 'dish_thai_iced_tea', storageClass: 'fridge', label: 'Thai Iced Tea', nouns: ['thai iced tea', 'iced tea'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 12, mood: 0.03, energy: 4, kcal: 250 } },
  dish_mango_sticky_rice: { id: 'dish_mango_sticky_rice', storageClass: 'fridge', label: 'Mango Sticky Rice', nouns: ['mango sticky rice', 'sticky rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.07, kcal: 420 } },
  dish_coconut_ice_cream: { id: 'dish_coconut_ice_cream', storageClass: 'freezer', label: 'Coconut Ice Cream', nouns: ['coconut ice cream', 'ice cream'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.06, kcal: 300 }, frozenFood: true },

  // Sunrise Cafe (new)
  dish_pancake_stack: { id: 'dish_pancake_stack', storageClass: 'fridge', label: 'Pancake Stack', nouns: ['pancake stack', 'pancakes'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, servings: 3, consumable: { hunger: 40, mood: 0.06, kcal: 640 } },
  dish_belgian_waffle: { id: 'dish_belgian_waffle', storageClass: 'fridge', label: 'Belgian Waffle', nouns: ['belgian waffle', 'waffle'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.06, kcal: 550 } },
  dish_breakfast_sandwich: { id: 'dish_breakfast_sandwich', storageClass: 'fridge', label: 'Breakfast Sandwich', nouns: ['breakfast sandwich'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04, kcal: 480 } },
  dish_avocado_toast: { id: 'dish_avocado_toast', storageClass: 'fridge', label: 'Avocado Toast', nouns: ['avocado toast'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.05, kcal: 360 } },
  dish_hash_brown_bowl: { id: 'dish_hash_brown_bowl', storageClass: 'fridge', label: 'Hash Brown Bowl', nouns: ['hash brown bowl'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04, kcal: 420 } },
  dish_granola_bowl: { id: 'dish_granola_bowl', storageClass: 'fridge', label: 'Granola Bowl', nouns: ['granola bowl'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 32, mood: 0.05, kcal: 450 } },
  dish_breakfast_potatoes: { id: 'dish_breakfast_potatoes', storageClass: 'fridge', label: 'Breakfast Potatoes', nouns: ['breakfast potatoes'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.03, kcal: 260 } },
  dish_fresh_coffee: { id: 'dish_fresh_coffee', storageClass: 'fridge', label: 'Fresh Coffee', nouns: ['coffee', 'fresh coffee'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 8, energy: 10, kcal: 5 } },
  dish_oat_latte: { id: 'dish_oat_latte', storageClass: 'fridge', label: 'Oat Latte', nouns: ['oat latte', 'latte'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 6, mood: 0.02, energy: 6, kcal: 180 } },
  dish_orange_juice_pitcher: { id: 'dish_orange_juice_pitcher', storageClass: 'fridge', label: 'Orange Juice Pitcher', nouns: ['orange juice', 'juice pitcher'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, servings: 4, consumable: { hunger: 3, mood: 0.02, kcal: 440 } },
  dish_croissant: { id: 'dish_croissant', storageClass: 'fridge', label: 'Butter Croissant', nouns: ['croissant'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.04, kcal: 300 } },
  dish_bagel_cc: { id: 'dish_bagel_cc', storageClass: 'fridge', label: 'Bagel with Cream Cheese', nouns: ['bagel', 'bagel with cream cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 24, mood: 0.04, kcal: 420 } },

  // The Greasy Spoon (new)
  dish_diner_breakfast: { id: 'dish_diner_breakfast', storageClass: 'fridge', label: 'Diner Breakfast Platter', nouns: ['diner breakfast', 'breakfast platter'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 45, mood: 0.05, kcal: 750 } },
  dish_club_sandwich: { id: 'dish_club_sandwich', storageClass: 'fridge', label: 'Club Sandwich', nouns: ['club sandwich'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05, kcal: 700 } },
  dish_patty_melt: { id: 'dish_patty_melt', storageClass: 'fridge', label: 'Patty Melt', nouns: ['patty melt'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05, kcal: 850 } },
  dish_grilled_cheese: { id: 'dish_grilled_cheese', storageClass: 'fridge', label: 'Grilled Cheese', nouns: ['grilled cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.04, kcal: 430 } },
  dish_tomato_soup_cup: { id: 'dish_tomato_soup_cup', storageClass: 'fridge', label: 'Tomato Soup (Cup)', nouns: ['tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 16, mood: 0.03, kcal: 180 } },
  dish_chicken_tenders: { id: 'dish_chicken_tenders', storageClass: 'fridge', label: 'Chicken Tenders', nouns: ['chicken tenders', 'tenders'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04, kcal: 460 } },
  dish_hamburger_steak: { id: 'dish_hamburger_steak', storageClass: 'fridge', label: 'Hamburger Steak', nouns: ['hamburger steak', 'burger steak'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 50, mood: 0.05, kcal: 750 } },
  dish_pancake_plate: { id: 'dish_pancake_plate', storageClass: 'fridge', label: 'Pancake Plate', nouns: ['pancake plate', 'pancakes'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, servings: 2, consumable: { hunger: 35, mood: 0.05, kcal: 480 } },
  dish_pie_slice: { id: 'dish_pie_slice', storageClass: 'fridge', label: 'Pie Slice', nouns: ['pie slice', 'pie'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.05, kcal: 380 } },
  dish_coffee_mug: { id: 'dish_coffee_mug', storageClass: 'fridge', label: 'Diner Coffee Mug', nouns: ['coffee', 'mug of coffee'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 6, energy: 8, kcal: 5 } },
  dish_vanilla_shake: { id: 'dish_vanilla_shake', storageClass: 'fridge', label: 'Vanilla Shake', nouns: ['vanilla shake', 'shake'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.05, kcal: 550 } },
  dish_onion_soup: { id: 'dish_onion_soup', storageClass: 'fridge', label: 'French Onion Soup', nouns: ['french onion soup', 'onion soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 22, mood: 0.04, kcal: 300 } },

  // Corner Deli (new)
  dish_pho_ga: { id: 'dish_pho_ga', storageClass: 'fridge', label: 'Pho Ga', nouns: ['pho ga', 'pho'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 42, mood: 0.05, kcal: 550 } },
  dish_tomato_soup_bowl: { id: 'dish_tomato_soup_bowl', storageClass: 'fridge', label: 'Tomato Soup (Bowl)', nouns: ['tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 28, mood: 0.03, kcal: 260 } },
  dish_bread_bowl_chili: { id: 'dish_bread_bowl_chili', storageClass: 'fridge', label: 'Bread Bowl Chili', nouns: ['bread bowl chili', 'chili'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.05, kcal: 720 } },
  dish_chicken_flatbread: { id: 'dish_chicken_flatbread', storageClass: 'fridge', label: 'Chicken Flatbread', nouns: ['chicken flatbread', 'flatbread'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04, kcal: 580 } },
  dish_salad_medley: { id: 'dish_salad_medley', storageClass: 'fridge', label: 'Salad Medley', nouns: ['salad medley', 'salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.03, kcal: 280 } },
  dish_mushroom_soup: { id: 'dish_mushroom_soup', storageClass: 'fridge', label: 'Mushroom Soup', nouns: ['mushroom soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.04, kcal: 240 } },
  dish_half_sandwich_soup: { id: 'dish_half_sandwich_soup', storageClass: 'fridge', label: 'Half Sandwich & Soup', nouns: ['half sandwich and soup', 'sandwich and soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 36, mood: 0.04, kcal: 420 } },
  dish_grilled_cheese_deli: { id: 'dish_grilled_cheese_deli', storageClass: 'fridge', label: 'Deli Grilled Cheese', nouns: ['deli grilled cheese', 'grilled cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04, kcal: 460 } },
  dish_lemonade_pitcher: { id: 'dish_lemonade_pitcher', storageClass: 'fridge', label: 'Lemonade Pitcher', nouns: ['lemonade', 'lemonade pitcher'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, servings: 4, consumable: { hunger: 12, mood: 0.02, kcal: 560 } },
  dish_turkey_club: { id: 'dish_turkey_club', storageClass: 'fridge', label: 'Turkey Club', nouns: ['turkey club'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.05, kcal: 680 } },

  // Emerald Kitchen (new) — the splurge: hunger values deliberately exceed
  // the usual ceiling, priced accordingly (prices in the menu entry).
  dish_ribeye: { id: 'dish_ribeye', storageClass: 'fridge', label: 'Ribeye', nouns: ['ribeye', 'ribeye steak'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 65, mood: 0.08, kcal: 1100 } },
  dish_duck_breast: { id: 'dish_duck_breast', storageClass: 'fridge', label: 'Duck Breast', nouns: ['duck breast', 'duck'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 60, mood: 0.08, kcal: 850 } },
  dish_short_rib: { id: 'dish_short_rib', storageClass: 'fridge', label: 'Braised Short Rib', nouns: ['short rib'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 62, mood: 0.08, kcal: 950 } },
  dish_caesar_salad: { id: 'dish_caesar_salad', storageClass: 'fridge', label: 'Emerald Caesar Salad', nouns: ['caesar salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 24, mood: 0.03, kcal: 420 } },
  dish_butter_potatoes: { id: 'dish_butter_potatoes', storageClass: 'fridge', label: 'Butter-Roasted Potatoes', nouns: ['butter potatoes'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04, kcal: 350 } },
  dish_creme_brulee: { id: 'dish_creme_brulee', storageClass: 'fridge', label: 'Crème Brûlée', nouns: ['creme brulee', 'creme'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.07, kcal: 320 } },
  dish_chocolate_torte: { id: 'dish_chocolate_torte', storageClass: 'fridge', label: 'Chocolate Torte', nouns: ['chocolate torte', 'torte'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.07, kcal: 420 } },
  dish_house_red: { id: 'dish_house_red', storageClass: 'fridge', label: 'House Red', nouns: ['house red', 'red wine'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { mood: 0.08, energy: -4, kcal: 125 } },
  dish_espresso: { id: 'dish_espresso', storageClass: 'fridge', label: 'Espresso', nouns: ['espresso'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { energy: 8, kcal: 5 } },

  // Midnight Noodle (new)
  dish_tonkotsu_ramen: { id: 'dish_tonkotsu_ramen', storageClass: 'fridge', label: 'Tonkotsu Ramen', nouns: ['tonkotsu ramen', 'ramen'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 52, mood: 0.06, kcal: 750 } },
  dish_dan_dan: { id: 'dish_dan_dan', storageClass: 'fridge', label: 'Dan Dan Noodles', nouns: ['dan dan noodles', 'dan dan'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 48, mood: 0.05, kcal: 700 } },
  dish_spicy_wontons: { id: 'dish_spicy_wontons', storageClass: 'fridge', label: 'Spicy Wontons', nouns: ['spicy wontons', 'wontons'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.05, kcal: 420 } },
  dish_garlic_fried_rice: { id: 'dish_garlic_fried_rice', storageClass: 'fridge', label: 'Garlic Fried Rice', nouns: ['garlic fried rice', 'fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.04, kcal: 720 } },
  dish_chashu_bowl: { id: 'dish_chashu_bowl', storageClass: 'fridge', label: 'Chashu Bowl', nouns: ['chashu bowl'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05, kcal: 780 } },
  dish_egg_ramen: { id: 'dish_egg_ramen', storageClass: 'fridge', label: 'Egg Ramen', nouns: ['egg ramen', 'ramen'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 36, mood: 0.04, kcal: 600 } },
  dish_gyoza_night: { id: 'dish_gyoza_night', storageClass: 'fridge', label: 'Gyoza (Late Night)', nouns: ['gyoza'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.05, kcal: 330 } },
  dish_boba_milk_tea: { id: 'dish_boba_milk_tea', storageClass: 'fridge', label: 'Boba Milk Tea', nouns: ['boba milk tea', 'boba'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.05, energy: 4, kcal: 380 } },
  dish_cucumber_salad: { id: 'dish_cucumber_salad', storageClass: 'fridge', label: 'Cucumber Salad', nouns: ['cucumber salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.03, kcal: 120 } },

  // Latenight Munchies (new)
  dish_loaded_nachos: { id: 'dish_loaded_nachos', storageClass: 'fridge', label: 'Loaded Nachos', nouns: ['loaded nachos', 'nachos'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, servings: 3, consumable: { hunger: 40, mood: 0.05, kcal: 1050 } },
  dish_buffalo_wings: { id: 'dish_buffalo_wings', storageClass: 'fridge', label: 'Buffalo Wings', nouns: ['buffalo wings', 'wings'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05, kcal: 600 } },
  dish_chili_cheese_tots: { id: 'dish_chili_cheese_tots', storageClass: 'fridge', label: 'Chili Cheese Tots', nouns: ['chili cheese tots', 'tots'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.04, kcal: 520 } },
  dish_hot_dog: { id: 'dish_hot_dog', storageClass: 'fridge', label: 'Hot Dog', nouns: ['hot dog'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 26, mood: 0.03, kcal: 300 } },
  dish_mozzarella_sticks: { id: 'dish_mozzarella_sticks', storageClass: 'fridge', label: 'Mozzarella Sticks', nouns: ['mozzarella sticks'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04, kcal: 480 } },
  dish_poutine: { id: 'dish_poutine', storageClass: 'fridge', label: 'Poutine', nouns: ['poutine'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.06, kcal: 780 } },
  dish_fried_pickles: { id: 'dish_fried_pickles', storageClass: 'fridge', label: 'Fried Pickles', nouns: ['fried pickles'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.04, kcal: 320 } },
  dish_cheesesteak: { id: 'dish_cheesesteak', storageClass: 'fridge', label: 'Cheesesteak', nouns: ['cheesesteak'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05, kcal: 800 } },
  dish_freezie: { id: 'dish_freezie', storageClass: 'freezer', label: 'Freezie', nouns: ['freezie', 'slushie'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 10, mood: 0.04, kcal: 120 }, frozenFood: true },

  // Snacks/drinks (directly consumable, no cooking needed)
  instant_noodles: { id: 'instant_noodles', storageClass: 'pantry', label: 'Instant Noodles', nouns: ['instant noodles', 'ramen'], category: 'food', stackable: true, maxStack: 12, consumable: { hunger: 20, kcal: 290 }, price: 2, buyQty: 4 },
  energy_drink: { id: 'energy_drink', storageClass: 'fridge', label: 'Energy Drink', nouns: ['energy drink'], category: 'drink', stackable: true, maxStack: 12, consumable: { energy: 15, hygiene: -1, kcal: 110 }, price: 3, buyQty: 4 },
  soda: { id: 'soda', storageClass: 'fridge', label: 'Soda', nouns: ['soda', 'pop'], category: 'drink', stackable: true, maxStack: 12, consumable: { mood: 0.02, kcal: 150 }, price: 2, buyQty: 6 },
  chips: { id: 'chips', storageClass: 'pantry', label: 'Chips', nouns: ['chips'], category: 'food', stackable: true, maxStack: 8, consumable: { hunger: 12, mood: 0.02, kcal: 260 }, price: 3, buyQty: 2 },
  granola_bar: { id: 'granola_bar', storageClass: 'pantry', label: 'Granola Bar', nouns: ['granola bar'], category: 'food', stackable: true, maxStack: 12, consumable: { hunger: 15, kcal: 190 }, price: 2, buyQty: 6 },
  beer: { id: 'beer', storageClass: 'fridge', label: 'Beer', nouns: ['beer'], category: 'drink', stackable: true, maxStack: 12, consumable: { mood: 0.10, energy: -4, kcal: 150 }, price: 3, buyQty: 6, tags: ['substance'] },
  wine: { id: 'wine', storageClass: 'fridge', label: 'Wine', nouns: ['wine'], category: 'drink', stackable: true, maxStack: 4, consumable: { mood: 0.06, energy: -4, kcal: 125 }, price: 12, buyQty: 1, tags: ['substance'] },
  orange_juice: { id: 'orange_juice', storageClass: 'fridge', label: 'Orange Juice', nouns: ['orange juice', 'juice'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 10 }, consumable: { hunger: 3, mood: 0.01, kcal: 110 }, price: 4, buyQty: 1 },
  bottled_water: { id: 'bottled_water', storageClass: 'fridge', label: 'Bottled Water', nouns: ['water'], category: 'drink', stackable: true, maxStack: 24, price: 1, buyQty: 12 },
  // Pre-frozen from the shop: meant to stay in the freezer (D17). It has a
  // shelf life at all so that IF it's left out to thaw it eventually goes
  // off like any pizza — while frozen it never ages, which is the point.
  frozen_pizza: { id: 'frozen_pizza', storageClass: 'freezer', label: 'Frozen Pizza', nouns: ['pizza'], category: 'food', stackable: true, maxStack: 4, servings: 4, perishable: { days: 14 }, consumable: { hunger: 35, mood: 0.02, kcal: 1360 }, price: 7, buyQty: 1 },

  // --- Comfort consumables (inventory overhaul Phase 6, D13) ---
  // The day-one happiness sources: cheap, ungated, purchasable on Nile like
  // any priced item (they join SHOP_CATALOG_LIST automatically), consumed
  // through the inventory panel's Use verb. Category 'comfort' keeps them
  // OUT of the Eat picker — they're treats, not meals — and gives them
  // their own sort group. Every one trades something (a bigger mood spike
  // costs energy or hygiene), so spamming isn't free; mood values sit at or
  // under the AfterHours +0.25 ceiling and decay like any impulse. Existing
  // cheaper sources (soda/chips/energy_drink/wine) stay as they were; beer
  // was re-tuned to the Phase 6 table's proposed values.
  comfort_coffee: { id: 'comfort_coffee', storageClass: 'pantry', label: 'Coffee', nouns: ['coffee', 'cup of coffee'], category: 'comfort', stackable: true, maxStack: 8, consumable: { energy: 8, mood: 0.05, kcal: 5 }, price: 4, buyQty: 4 },
  comfort_latte: { id: 'comfort_latte', storageClass: 'pantry', label: 'Good Coffee', nouns: ['good coffee', 'latte'], category: 'comfort', stackable: true, maxStack: 4, consumable: { energy: 10, mood: 0.08, kcal: 190 }, price: 7, buyQty: 1 },
  comfort_tea: { id: 'comfort_tea', storageClass: 'pantry', label: 'Tea', nouns: ['tea', 'cup of tea'], category: 'comfort', stackable: true, maxStack: 8, consumable: { energy: 5, mood: 0.04, kcal: 2 }, price: 3, buyQty: 4 },
  comfort_whiskey: { id: 'comfort_whiskey', storageClass: 'pantry', label: 'Cheap Whiskey', nouns: ['whiskey', 'cheap whiskey'], category: 'comfort', stackable: true, maxStack: 4, consumable: { mood: 0.12, energy: -6, hygiene: -2, kcal: 100 }, price: 9, buyQty: 1, tags: ['substance'] },
  comfort_ice_cream: { id: 'comfort_ice_cream', storageClass: 'freezer', label: 'Ice Cream', nouns: ['ice cream'], category: 'comfort', stackable: true, maxStack: 4, perishable: { days: 30 }, consumable: { hunger: 15, mood: 0.10, kcal: 260 }, frozenFood: true, price: 5, buyQty: 1 },
  comfort_chocolate: { id: 'comfort_chocolate', storageClass: 'pantry', label: 'Chocolate Bar', nouns: ['chocolate', 'chocolate bar'], category: 'comfort', stackable: true, maxStack: 8, consumable: { hunger: 8, mood: 0.06, kcal: 220 }, price: 3, buyQty: 2 },
  comfort_joint: { id: 'comfort_joint', storageClass: 'pantry', label: 'Joint', nouns: ['joint', 'weed', 'marijuana'], category: 'comfort', stackable: true, maxStack: 4, consumable: { mood: 0.20, energy: -12, kcal: 0 }, price: 8, buyQty: 1, tags: ['substance'] },

  // --- Hobby objects (inventory overhaul Phase 6, D13) ---
  // The buyable hobby set. Each ITEM_DEFS id here has a matching
  // OBJECT_DEFS id (same string, different namespace) — the item is the
  // Nile-shipped purchase that rides the normal delivery pipeline into
  // your bag, and the Place verb (INVENTORY's stackActions / UI's
  // doInventoryPlace) turns it into a placed OBJECT_DEFS instance in the
  // room via SPAWN_OBJECT, which is what unlocks its action (sourced from
  // the object, so the hobby is usable only where it physically sits).
  // stackable:false + maxStack 1 = one at a time in the bag; buyQty 1 =
  // one delivery delivers the one object. No consumable — the joy is the
  // action, not the item.
  hobby_guitar: { id: 'hobby_guitar', label: 'Guitar', nouns: ['guitar', 'acoustic guitar'], category: 'hobby', stackable: false, maxStack: 1, price: 60, buyQty: 1 },
  hobby_bookshelf: { id: 'hobby_bookshelf', label: 'Bookshelf', nouns: ['bookshelf', 'bookcase'], category: 'hobby', stackable: false, maxStack: 1, price: 45, buyQty: 1 },
  hobby_record_player: { id: 'hobby_record_player', label: 'Record Player', nouns: ['record player', 'turntable', 'vinyl'], category: 'hobby', stackable: false, maxStack: 1, price: 70, buyQty: 1 },
  hobby_console: { id: 'hobby_console', label: 'Game Console', nouns: ['console', 'game console'], category: 'hobby', stackable: false, maxStack: 1, price: 120, buyQty: 1 },
  hobby_sketchpad: { id: 'hobby_sketchpad', label: 'Sketchpad', nouns: ['sketchpad', 'sketchbook'], category: 'hobby', stackable: false, maxStack: 1, price: 12, buyQty: 1 },
  hobby_houseplant: { id: 'hobby_houseplant', label: 'Houseplant', nouns: ['houseplant', 'plant'], category: 'hobby', stackable: false, maxStack: 1, price: 18, buyQty: 1 },

  // Cleaning supplies
  dish_soap: { id: 'dish_soap', label: 'Dish Soap', nouns: ['dish soap'], category: 'cleaning', stackable: true, maxStack: 4, price: 4, buyQty: 1 },
  sponge: { id: 'sponge', label: 'Sponge', nouns: ['sponge'], category: 'cleaning', stackable: true, maxStack: 6, price: 2, buyQty: 2 },
  paper_towels: { id: 'paper_towels', label: 'Paper Towels', nouns: ['paper towels'], category: 'cleaning', stackable: true, maxStack: 6, price: 5, buyQty: 2 },
  all_purpose_cleaner: { id: 'all_purpose_cleaner', label: 'All-Purpose Cleaner', nouns: ['cleaner', 'all-purpose cleaner'], category: 'cleaning', stackable: true, maxStack: 4, price: 5, buyQty: 1 },
  trash_bags: { id: 'trash_bags', label: 'Trash Bags', nouns: ['trash bags', 'garbage bags'], category: 'cleaning', stackable: true, maxStack: 20, price: 6, buyQty: 10 },
  laundry_detergent: { id: 'laundry_detergent', label: 'Laundry Detergent', nouns: ['detergent'], category: 'cleaning', stackable: true, maxStack: 4, price: 8, buyQty: 1 },

  // Toiletries
  toothpaste: { id: 'toothpaste', label: 'Toothpaste', nouns: ['toothpaste'], category: 'toiletry', stackable: true, maxStack: 4, price: 3, buyQty: 1 },
  shampoo: { id: 'shampoo', label: 'Shampoo', nouns: ['shampoo'], category: 'toiletry', stackable: true, maxStack: 4, price: 5, buyQty: 1 },
  soap_bar: { id: 'soap_bar', label: 'Soap', nouns: ['soap'], category: 'toiletry', stackable: true, maxStack: 6, price: 2, buyQty: 2 },
  toilet_paper: { id: 'toilet_paper', label: 'Toilet Paper', nouns: ['toilet paper'], category: 'toiletry', stackable: true, maxStack: 24, price: 6, buyQty: 12 },
  razor: { id: 'razor', label: 'Razor', nouns: ['razor'], category: 'toiletry', stackable: true, maxStack: 6, price: 4, buyQty: 1 },

  // Misc/tools/decor/electronics/media/medication/gifts
  lightbulb: { id: 'lightbulb', label: 'Lightbulb', nouns: ['lightbulb', 'bulb'], category: 'tool', stackable: true, maxStack: 8, price: 3, buyQty: 2 },
  batteries: { id: 'batteries', label: 'Batteries', nouns: ['batteries'], category: 'tool', stackable: true, maxStack: 16, price: 5, buyQty: 4 },
  candle: { id: 'candle', label: 'Candle', nouns: ['candle'], category: 'decor', stackable: true, maxStack: 6, price: 4, buyQty: 1 },
  phone_charger: { id: 'phone_charger', label: 'Phone Charger', nouns: ['charger'], category: 'electronics', stackable: true, maxStack: 3, price: 10, buyQty: 1 },
  // Intimacy & Voyeurism Phase 19: headphones become a WORN accessory (the
  // wardrobe's accessory slot) that blocks received audio - 'blocksSound'
  // marks the def, and signals.js's wearsSoundBlocking reads the wearer's
  // outfit. The accessory slot is the whole tradeoff: wearing them means no
  // necklace (and no attraction term from one).
  headphones: { id: 'headphones', label: 'Headphones', nouns: ['headphones'], category: 'electronics', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 25, buyQty: 1, blocksSound: true, stats: { attraction: 0, comfort: 0.15, modesty: 0.05, thermal: 0, reveal: 0 }, traits: ['everyday'], styleTags: ['practical', 'plugged-in'] },
  mp3_player: { id: 'mp3_player', label: 'MP3 Player', nouns: ['mp3 player', 'digital music player'], category: 'electronics', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 40, buyQty: 1, blocksSound: true, stats: { attraction: 0, comfort: 0.2, modesty: 0.05, thermal: 0, reveal: 0 }, traits: ['everyday'], styleTags: ['practical', 'plugged-in'] },
  // Phase 19 sound devices: the buyable item forms. Same defId as the
  // OBJECT_DEFS instance the Place verb spawns, like the hobby objects.
  stereo: { id: 'stereo', label: 'Stereo', nouns: ['stereo', 'stereo system'], category: 'electronics', stackable: false, maxStack: 1, price: 90, buyQty: 1 },
  boombox: { id: 'boombox', label: 'Boombox', nouns: ['boombox', 'ghetto blaster'], category: 'electronics', stackable: false, maxStack: 1, price: 45, buyQty: 1 },
  book: { id: 'book', label: 'Book', nouns: ['book'], category: 'media', stackable: true, maxStack: 10, price: 12, buyQty: 1 },
  board_game: { id: 'board_game', label: 'Board Game', nouns: ['board game'], category: 'media', stackable: true, maxStack: 4, price: 20, buyQty: 1 },
  pain_reliever: { id: 'pain_reliever', label: 'Pain Reliever', nouns: ['pain reliever', 'ibuprofen', 'medicine'], category: 'medication', stackable: true, maxStack: 4, price: 5, buyQty: 1 },
  allergy_medicine: { id: 'allergy_medicine', label: 'Allergy Medicine', nouns: ['allergy medicine'], category: 'medication', stackable: true, maxStack: 4, price: 6, buyQty: 1 },
  flowers: { id: 'flowers', label: 'Flowers', nouns: ['flowers'], category: 'gift', stackable: true, maxStack: 3, price: 15, buyQty: 1 },
  chocolate_box: { id: 'chocolate_box', label: 'Box of Chocolates', nouns: ['chocolates', 'chocolate box'], category: 'gift', stackable: true, maxStack: 3, price: 10, buyQty: 1 },

  // --- Clothing (Intimacy & Voyeurism Phase 4, D11) ---
  // The wardrobe system's data lives HERE, in ITEM_DEFS, so pricing exists
  // once: SHOP_CATALOG_LIST (ITEMS) derives Nile's catalog from every priced
  // ITEM_DEF, which is what makes clothing buyable through the plain
  // checkout → doormat → container pipeline with zero new plumbing. Each
  // entry carries the CLOTHING fields alongside the stack shape:
  //   slot      — body position: top|bottom|outerwear|shoes|socks|underwear|
  //               swimwear|accessory (CLOTHING_SLOTS below)
  //   category  — the STYLE FAMILY (casual/work/sport/lounge/sleep/formal/
  //               swim); this is deliberately the plan's field name and NOT
  //               an inventory category, so each def also sets sortGroup
  //               'clothing' explicitly (the sort-group stamping loop below
  //               only fills absent sortGroups, so it never overrides)
  //   stats     — { attraction, comfort, modesty, thermal, reveal }, each a
  //               0..1 bias term that Phase 7 wires into existing formulas;
  //               every item carries all five (zeros where meaningless) so
  //               consumers never null-guard
  //   traits    — everyday|sexy|work|sport|sleep|formal|revealing|
  //               comfortable|versatile — the OUTFIT_TYPE match keys
  //   styleTags — free tags for Phase 7's scene-prompt flavor
  // Non-stackable + buyQty 1: one item, one wardrobe slot (capacity counts
  // items — see containerItemCount, ITEMS). No consumable, no perishable —
  // clothes don't spoil. keyItem is NOT set, so clothes can be dropped/
  // trashed/given like any ordinary item.
  // Tops
  basic_tee: { id: 'basic_tee', label: 'Basic Tee', nouns: ['tee', 't-shirt', 'basic tee'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 12, buyQty: 1, stats: { attraction: 0.02, comfort: 0.05, modesty: 0.35, thermal: 0.15, reveal: 0 }, traits: ['everyday', 'versatile'], styleTags: ['plain', 'neutral'] },
  graphic_tee: { id: 'graphic_tee', label: 'Graphic Tee', nouns: ['graphic tee', 'band tee'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 15, buyQty: 1, stats: { attraction: 0.08, comfort: 0.05, modesty: 0.35, thermal: 0.15, reveal: 0 }, traits: ['everyday'], styleTags: ['loud', 'casual'] },
  tank_top: { id: 'tank_top', label: 'Tank Top', nouns: ['tank top', 'tank'], category: 'sport', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 10, buyQty: 1, stats: { attraction: 0.12, comfort: 0.25, modesty: 0.2, thermal: 0.05, reveal: 0.3 }, traits: ['sport', 'everyday', 'versatile'], styleTags: ['sleeveless'] },
  crop_top: { id: 'crop_top', label: 'Crop Top', nouns: ['crop top', 'crop'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 14, buyQty: 1, stats: { attraction: 0.25, comfort: 0.15, modesty: 0.15, thermal: 0, reveal: 0.4 }, traits: ['sexy', 'revealing', 'everyday'], styleTags: ['midriff', 'trendy'] },
  button_up: { id: 'button_up', label: 'Button-Up Shirt', nouns: ['button-up', 'button up shirt', 'shirt'], category: 'work', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 25, buyQty: 1, stats: { attraction: 0.15, comfort: 0.1, modesty: 0.45, thermal: 0.2, reveal: 0.05 }, traits: ['work', 'everyday', 'versatile'], styleTags: ['collared', 'neutral'] },
  blouse: { id: 'blouse', label: 'Blouse', nouns: ['blouse'], category: 'work', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 32, buyQty: 1, stats: { attraction: 0.3, comfort: 0.15, modesty: 0.4, thermal: 0.15, reveal: 0.15 }, traits: ['work', 'formal'], styleTags: ['elegant', 'soft'] },
  sweater: { id: 'sweater', label: 'Sweater', nouns: ['sweater', 'jumper'], category: 'lounge', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 30, buyQty: 1, stats: { attraction: 0.2, comfort: 0.35, modesty: 0.5, thermal: 0.45, reveal: 0 }, traits: ['comfortable', 'everyday', 'versatile'], styleTags: ['knit', 'cozy'] },
  dress_shirt: { id: 'dress_shirt', label: 'Dress Shirt', nouns: ['dress shirt', 'crisp shirt'], category: 'work', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 40, buyQty: 1, stats: { attraction: 0.35, comfort: 0.1, modesty: 0.5, thermal: 0.2, reveal: 0.05 }, traits: ['work', 'formal'], styleTags: ['sharp', 'crisp'] },
  // Bottoms
  jeans: { id: 'jeans', label: 'Jeans', nouns: ['jeans', 'denim'], category: 'casual', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 30, buyQty: 1, stats: { attraction: 0.15, comfort: 0.15, modesty: 0.5, thermal: 0.25, reveal: 0 }, traits: ['everyday', 'versatile'], styleTags: ['denim', 'neutral'] },
  sweatpants: { id: 'sweatpants', label: 'Sweatpants', nouns: ['sweatpants', 'joggers'], category: 'lounge', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 22, buyQty: 1, stats: { attraction: 0.05, comfort: 0.45, modesty: 0.5, thermal: 0.35, reveal: 0 }, traits: ['comfortable', 'sport', 'everyday'], styleTags: ['cozy', 'loose'] },
  dress_pants: { id: 'dress_pants', label: 'Dress Pants', nouns: ['dress pants', 'slacks', 'trousers'], category: 'work', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 35, buyQty: 1, stats: { attraction: 0.25, comfort: 0.1, modesty: 0.55, thermal: 0.25, reveal: 0 }, traits: ['work', 'formal'], styleTags: ['tailored', 'neutral'] },
  shorts: { id: 'shorts', label: 'Shorts', nouns: ['shorts'], category: 'casual', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 15, buyQty: 1, stats: { attraction: 0.08, comfort: 0.3, modesty: 0.25, thermal: 0.1, reveal: 0.2 }, traits: ['everyday', 'sport'], styleTags: ['summer', 'casual'] },
  skirt: { id: 'skirt', label: 'Skirt', nouns: ['skirt'], category: 'work', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 28, buyQty: 1, stats: { attraction: 0.2, comfort: 0.2, modesty: 0.25, thermal: 0.1, reveal: 0.25 }, traits: ['work', 'sexy', 'formal'], styleTags: ['flowy', 'feminine'] },
  athletic_shorts: { id: 'athletic_shorts', label: 'Athletic Shorts', nouns: ['athletic shorts', 'gym shorts', 'running shorts'], category: 'sport', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 14, buyQty: 1, stats: { attraction: 0.1, comfort: 0.2, modesty: 0.25, thermal: 0.05, reveal: 0.2 }, traits: ['sport', 'everyday'], styleTags: ['breezy', 'sporty'] },
  // Outerwear
  hoodie: { id: 'hoodie', label: 'Hoodie', nouns: ['hoodie', 'hooded sweatshirt'], category: 'lounge', sortGroup: 'clothing', slot: 'outerwear', stackable: false, maxStack: 1, price: 35, buyQty: 1, stats: { attraction: 0.1, comfort: 0.4, modesty: 0.5, thermal: 0.4, reveal: 0 }, traits: ['comfortable', 'everyday', 'versatile'], styleTags: ['cozy', 'streetwear'] },
  denim_jacket: { id: 'denim_jacket', label: 'Denim Jacket', nouns: ['denim jacket', 'jacket'], category: 'casual', sortGroup: 'clothing', slot: 'outerwear', stackable: false, maxStack: 1, price: 45, buyQty: 1, stats: { attraction: 0.2, comfort: 0.1, modesty: 0.45, thermal: 0.3, reveal: 0.05 }, traits: ['everyday', 'work'], styleTags: ['casual', 'denim'] },
  coat: { id: 'coat', label: 'Coat', nouns: ['coat', 'winter coat'], category: 'work', sortGroup: 'clothing', slot: 'outerwear', stackable: false, maxStack: 1, price: 60, buyQty: 1, stats: { attraction: 0.25, comfort: 0.1, modesty: 0.6, thermal: 0.6, reveal: 0 }, traits: ['work', 'formal', 'everyday'], styleTags: ['tailored', 'warm'] },
  // Shoes
  sneakers: { id: 'sneakers', label: 'Sneakers', nouns: ['sneakers', 'trainers', 'runners'], category: 'casual', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 35, buyQty: 1, stats: { attraction: 0.08, comfort: 0.3, modesty: 0, thermal: 0.1, reveal: 0 }, traits: ['everyday', 'sport', 'versatile'], styleTags: ['neutral', 'practical'] },
  dress_shoes: { id: 'dress_shoes', label: 'Dress Shoes', nouns: ['dress shoes', 'oxfords'], category: 'work', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 45, buyQty: 1, stats: { attraction: 0.2, comfort: 0.05, modesty: 0, thermal: 0.05, reveal: 0 }, traits: ['work', 'formal'], styleTags: ['polished', 'sharp'] },
  sandals: { id: 'sandals', label: 'Sandals', nouns: ['sandals', 'flip-flops'], category: 'casual', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 18, buyQty: 1, stats: { attraction: 0.05, comfort: 0.25, modesty: 0, thermal: 0, reveal: 0.1 }, traits: ['everyday', 'swim'], styleTags: ['summer', 'open'] },
  slippers: { id: 'slippers', label: 'Slippers', nouns: ['slippers', 'house shoes'], category: 'sleep', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 12, buyQty: 1, stats: { attraction: 0, comfort: 0.4, modesty: 0, thermal: 0.15, reveal: 0 }, traits: ['sleep', 'comfortable', 'everyday'], styleTags: ['soft', 'cozy'] },
  // Socks
  socks_cotton: { id: 'socks_cotton', label: 'Cotton Socks', nouns: ['socks', 'cotton socks'], category: 'casual', sortGroup: 'clothing', slot: 'socks', stackable: false, maxStack: 1, price: 6, buyQty: 1, stats: { attraction: 0, comfort: 0.2, modesty: 0, thermal: 0.1, reveal: 0 }, traits: ['everyday', 'versatile'], styleTags: ['neutral'] },
  dress_socks: { id: 'dress_socks', label: 'Dress Socks', nouns: ['dress socks', 'formal socks'], category: 'work', sortGroup: 'clothing', slot: 'socks', stackable: false, maxStack: 1, price: 8, buyQty: 1, stats: { attraction: 0.05, comfort: 0.1, modesty: 0, thermal: 0.1, reveal: 0 }, traits: ['work', 'formal'], styleTags: ['thin', 'formal'] },  sports_socks: { id: 'sports_socks', label: 'Sports Socks', nouns: ['sports socks', 'athletic socks'], category: 'sport', sortGroup: 'clothing', slot: 'socks', stackable: false, maxStack: 1, price: 7, buyQty: 1, stats: { attraction: 0, comfort: 0.25, modesty: 0, thermal: 0.1, reveal: 0 }, traits: ['sport', 'everyday'], styleTags: ['cushioned'] },
  // Underwear
  boxers: { id: 'boxers', label: 'Boxers', nouns: ['boxers', 'boxer shorts'], category: 'casual', sortGroup: 'clothing', slot: 'underwear', stackable: false, maxStack: 1, price: 8, buyQty: 1, stats: { attraction: 0, comfort: 0.3, modesty: 0.1, thermal: 0.1, reveal: 0 }, traits: ['everyday', 'comfortable'], styleTags: ['plain'] },
  briefs: { id: 'briefs', label: 'Briefs', nouns: ['briefs'], category: 'casual', sortGroup: 'clothing', slot: 'underwear', stackable: false, maxStack: 1, price: 8, buyQty: 1, stats: { attraction: 0.05, comfort: 0.2, modesty: 0.1, thermal: 0.1, reveal: 0 }, traits: ['everyday'], styleTags: ['plain'] },
  bra: { id: 'bra', label: 'Bra', nouns: ['bra', 'brassiere'], category: 'casual', sortGroup: 'clothing', slot: 'underwear', stackable: false, maxStack: 1, price: 15, buyQty: 1, stats: { attraction: 0.1, comfort: 0.15, modesty: 0.05, thermal: 0.05, reveal: 0 }, traits: ['everyday'], styleTags: ['plain'] },
  panties: { id: 'panties', label: 'Panties', nouns: ['panties', 'underwear'], category: 'casual', sortGroup: 'clothing', slot: 'underwear', stackable: false, maxStack: 1, price: 10, buyQty: 1, stats: { attraction: 0.1, comfort: 0.15, modesty: 0.05, thermal: 0.05, reveal: 0 }, traits: ['everyday'], styleTags: ['plain'] },
  lingerie_set: { id: 'lingerie_set', label: 'Lingerie Set', nouns: ['lingerie', 'lace set'], category: 'casual', sortGroup: 'clothing', slot: 'underwear', stackable: false, maxStack: 1, price: 40, buyQty: 1, stats: { attraction: 0.4, comfort: 0.1, modesty: 0.05, thermal: 0, reveal: 0.5 }, traits: ['sexy', 'revealing'], styleTags: ['lace', 'evening'] },
  // Swimwear
  swim_trunks: { id: 'swim_trunks', label: 'Swim Trunks', nouns: ['swim trunks', 'trunks'], category: 'swim', sortGroup: 'clothing', slot: 'swimwear', stackable: false, maxStack: 1, price: 18, buyQty: 1, stats: { attraction: 0.1, comfort: 0.2, modesty: 0.15, thermal: 0, reveal: 0.15 }, traits: ['swim', 'sport'], styleTags: ['beach'] },
  bikini: { id: 'bikini', label: 'Bikini', nouns: ['bikini'], category: 'swim', sortGroup: 'clothing', slot: 'swimwear', stackable: false, maxStack: 1, price: 25, buyQty: 1, stats: { attraction: 0.3, comfort: 0.15, modesty: 0.1, thermal: 0, reveal: 0.45 }, traits: ['swim', 'sexy', 'revealing'], styleTags: ['beach', 'bold'] },
  one_piece: { id: 'one_piece', label: 'One-Piece Swimsuit', nouns: ['one-piece', 'one piece swimsuit'], category: 'swim', sortGroup: 'clothing', slot: 'swimwear', stackable: false, maxStack: 1, price: 30, buyQty: 1, stats: { attraction: 0.2, comfort: 0.2, modesty: 0.45, thermal: 0, reveal: 0.3 }, traits: ['swim'], styleTags: ['classic'] },
  // Accessories
  wristwatch: { id: 'wristwatch', label: 'Wristwatch', nouns: ['watch', 'wristwatch'], category: 'work', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 25, buyQty: 1, stats: { attraction: 0.1, comfort: 0, modesty: 0, thermal: 0, reveal: 0 }, traits: ['work', 'formal', 'everyday'], styleTags: ['professional'] },
  necklace: { id: 'necklace', label: 'Necklace', nouns: ['necklace', 'pendant'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 20, buyQty: 1, stats: { attraction: 0.25, comfort: 0, modesty: 0, thermal: 0, reveal: 0.05 }, traits: ['sexy', 'formal', 'everyday'], styleTags: ['delicate'] },
  cap: { id: 'cap', label: 'Cap', nouns: ['cap', 'baseball cap'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 12, buyQty: 1, stats: { attraction: 0.05, comfort: 0.1, modesty: 0, thermal: 0, reveal: 0 }, traits: ['everyday', 'sport'], styleTags: ['casual', 'sporty'] },
  glasses: { id: 'glasses', label: 'Glasses', nouns: ['glasses', 'spectacles'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 30, buyQty: 1, stats: { attraction: 0.08, comfort: 0, modesty: 0, thermal: 0, reveal: 0 }, traits: ['everyday', 'versatile'], styleTags: ['studious'] },
  // --- Fashion-flavored clothing (Everyday style → wardrobe, Phase: style) ---
  // The wardrobe seeder keys the starter sets off the player's/NPC's
  // `physical.fashion`, and these defs are the palette those sets draw from
  // so each style reads differently at a glance (the preppy roommate in a
  // polo, the goth one in the leather jacket). Same slot/trait/stat shape as
  // the base clothing above; pricing is the shop's only concern beyond that.
  flannel_shirt: { id: 'flannel_shirt', label: 'Flannel Shirt', nouns: ['flannel', 'flannel shirt'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 24, buyQty: 1, stats: { attraction: 0.12, comfort: 0.2, modesty: 0.42, thermal: 0.3, reveal: 0 }, traits: ['everyday', 'versatile'], styleTags: ['plaid', 'cozy'] },
  turtleneck: { id: 'turtleneck', label: 'Turtleneck', nouns: ['turtleneck', 'turtle neck'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 28, buyQty: 1, stats: { attraction: 0.2, comfort: 0.2, modesty: 0.5, thermal: 0.4, reveal: 0 }, traits: ['everyday', 'work'], styleTags: ['minimal', 'neutral'] },
  polo_shirt: { id: 'polo_shirt', label: 'Polo Shirt', nouns: ['polo shirt', 'polo'], category: 'casual', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 18, buyQty: 1, stats: { attraction: 0.1, comfort: 0.2, modesty: 0.4, thermal: 0.18, reveal: 0 }, traits: ['everyday', 'work'], styleTags: ['collared', 'sporty'] },
  cardigan: { id: 'cardigan', label: 'Cardigan', nouns: ['cardigan', 'cardie'], category: 'lounge', sortGroup: 'clothing', slot: 'top', stackable: false, maxStack: 1, price: 32, buyQty: 1, stats: { attraction: 0.18, comfort: 0.35, modesty: 0.5, thermal: 0.4, reveal: 0 }, traits: ['comfortable', 'everyday'], styleTags: ['knit', 'cozy'] },
  cargo_pants: { id: 'cargo_pants', label: 'Cargo Pants', nouns: ['cargo pants', 'cargos'], category: 'casual', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 28, buyQty: 1, stats: { attraction: 0.1, comfort: 0.2, modesty: 0.5, thermal: 0.2, reveal: 0 }, traits: ['everyday', 'sport'], styleTags: ['tactical', 'loose'] },
  chinos: { id: 'chinos', label: 'Chinos', nouns: ['chinos', 'khakis'], category: 'casual', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 30, buyQty: 1, stats: { attraction: 0.18, comfort: 0.2, modesty: 0.52, thermal: 0.22, reveal: 0 }, traits: ['work', 'everyday'], styleTags: ['tailored', 'neutral'] },
  overalls: { id: 'overalls', label: 'Overalls', nouns: ['overalls', 'dungarees'], category: 'casual', sortGroup: 'clothing', slot: 'bottom', stackable: false, maxStack: 1, price: 34, buyQty: 1, stats: { attraction: 0.12, comfort: 0.25, modesty: 0.5, thermal: 0.3, reveal: 0 }, traits: ['everyday', 'work'], styleTags: ['denim', 'casual'] },
  leather_jacket: { id: 'leather_jacket', label: 'Leather Jacket', nouns: ['leather jacket', 'biker jacket'], category: 'casual', sortGroup: 'clothing', slot: 'outerwear', stackable: false, maxStack: 1, price: 95, buyQty: 1, stats: { attraction: 0.35, comfort: 0.05, modesty: 0.4, thermal: 0.35, reveal: 0 }, traits: ['everyday', 'work'], styleTags: ['edgy', 'street'] },
  windbreaker: { id: 'windbreaker', label: 'Windbreaker', nouns: ['windbreaker', 'windcheater'], category: 'sport', sortGroup: 'clothing', slot: 'outerwear', stackable: false, maxStack: 1, price: 38, buyQty: 1, stats: { attraction: 0.12, comfort: 0.3, modesty: 0.35, thermal: 0.3, reveal: 0 }, traits: ['sport', 'everyday'], styleTags: ['technical', 'bright'] },
  work_boots: { id: 'work_boots', label: 'Work Boots', nouns: ['work boots', 'boots'], category: 'work', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 42, buyQty: 1, stats: { attraction: 0.12, comfort: 0.15, modesty: 0, thermal: 0.3, reveal: 0 }, traits: ['work', 'sport'], styleTags: ['boots', 'sturdy'] },
  beanie: { id: 'beanie', label: 'Beanie', nouns: ['beanie', 'knit cap'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 10, buyQty: 1, stats: { attraction: 0.03, comfort: 0.15, modesty: 0, thermal: 0.15, reveal: 0 }, traits: ['everyday', 'comfortable'], styleTags: ['cozy', 'winter'] },
  sun_hat: { id: 'sun_hat', label: 'Sun Hat', nouns: ['sun hat', 'wide-brim hat'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 14, buyQty: 1, stats: { attraction: 0.06, comfort: 0.1, modesty: 0, thermal: 0.05, reveal: 0 }, traits: ['everyday', 'swim'], styleTags: ['summer', 'wide-brim'] },
  bracelet: { id: 'bracelet', label: 'Bracelet', nouns: ['bracelet', 'bangle'], category: 'casual', sortGroup: 'clothing', slot: 'accessory', stackable: false, maxStack: 1, price: 15, buyQty: 1, stats: { attraction: 0.15, comfort: 0, modesty: 0, thermal: 0, reveal: 0 }, traits: ['sexy', 'everyday'], styleTags: ['bohemian'] },
  high_tops: { id: 'high_tops', label: 'High-Top Sneakers', nouns: ['high tops', 'high-top sneakers'], category: 'casual', sortGroup: 'clothing', slot: 'shoes', stackable: false, maxStack: 1, price: 50, buyQty: 1, stats: { attraction: 0.15, comfort: 0.2, modesty: 0, thermal: 0.15, reveal: 0 }, traits: ['everyday', 'sport'], styleTags: ['street', 'bold'] },
};

// --- Sort groups (inventory overhaul Phase 1) ---
// The inventory panel groups items by def.sortGroup — the renderer never
// hardcodes a category→group list. Every def is stamped with its
// sortGroup at load from its category via CATEGORY_SORT_GROUP below (the
// panel also groups by this on a per-def basis if a def ever overrides
// sortGroup directly). Categories `comfort`/`hobby`/`key`/`junk` exist now
// for the later phases of the overhaul even though no current item uses
// them yet.
const SORT_GROUPS = {
  food:     { label: 'Food',      order: 10 },
  drink:    { label: 'Drinks',    order: 20 },
  clothing: { label: 'Clothing',  order: 25 },
  comfort:  { label: 'Comfort',   order: 30 },
  hobby:    { label: 'Hobbies',   order: 40 },
  gift:     { label: 'Gifts',     order: 50 },
  cleaning: { label: 'Cleaning',  order: 60 },
  toiletry: { label: 'Toiletries', order: 70 },
  medication: { label: 'Medication', order: 80 },
  gear:     { label: 'Gear',      order: 90 },
  key:      { label: 'Keys & ID', order: 100 },
  junk:     { label: 'Junk',      order: 110 },
  other:    { label: 'Other',     order: 120 },
};

const CATEGORY_SORT_GROUP = {
  ingredient: 'food', meal: 'food', food: 'food', snack: 'food',
  drink: 'drink',
  comfort: 'comfort', hobby: 'hobby', gift: 'gift',
  cleaning: 'cleaning', toiletry: 'toiletry', medication: 'medication',
  tool: 'gear', decor: 'gear', electronics: 'gear', media: 'gear',
  key: 'key', junk: 'junk', misc: 'other',
};

for (const def of Object.values(ITEM_DEFS)) {
  if (!def.sortGroup) def.sortGroup = CATEGORY_SORT_GROUP[def.category] || 'other';
}

// --- Clothing model (Intimacy & Voyeurism Phase 4, D11) ---
// CLOTHING_DEFS is the slot-carrying VIEW over ITEM_DEFS — one table, never
// a second parallel catalog (same rule SHOP_CATALOG_LIST follows). `slot`
// marks a def as clothing; everything else the wardrobe system reads
// (stats/traits/styleTags) rides the item def itself.
const CLOTHING_DEFS = Object.fromEntries(
  Object.entries(ITEM_DEFS).filter(([, d]) => d && d.slot).map(([id, d]) => [id, d])
);

// Ordered body positions — Phase 5's wardrobe panel renders slots in this
// order, and composeOutfit (ITEMS) fills them in this order.
const CLOTHING_SLOTS = ['top', 'bottom', 'outerwear', 'shoes', 'socks', 'underwear', 'swimwear', 'accessory'];

// The outfit kinds D11 names (daily/work/sleepwear/loungewear/workout/swim/
// formal). Each maps to the item TRAITS that best fit it — the key
// composeOutfit scores against (schedule-block → outfit type → best items is
// Phase 6's job; the pure pick is built here so both phases share one).
const OUTFIT_TYPES = {
  daily:      { label: 'Daily',      traits: ['everyday'], note: 'everyday clothes' },
  work:       { label: 'Work',       traits: ['work', 'formal'], note: 'something presentable' },
  sleepwear:  { label: 'Sleepwear',  traits: ['sleep', 'comfortable'], note: 'bed clothes' },
  loungewear: { label: 'Loungewear', traits: ['comfortable', 'everyday'], note: 'relaxed home clothes' },
  workout:    { label: 'Workout',    traits: ['sport'], note: 'exercise gear' },
  swim:       { label: 'Swimwear',   traits: ['swim'], note: 'swim gear' },
  formal:     { label: 'Formal',     traits: ['formal', 'work'], note: 'something sharp' },
};

// --- Recipes: what stove.cook_meal (DEFS.ACTIONS) draws from. Checked in
// declaration order by ITEMS' pickAvailableRecipe — the first one whose
// ingredients are on hand wins, so listing the cheap/common recipe first
// is a real design choice, not just documentation order. `leaves` are
// EFFECTS-DSL lines applied after cooking succeeds — always dirtying
// something, which is what gives the wash_dishes drive (P7) and the
// dishes boundary (P6) something real to react to.
//
// Food-overhaul Phase 3 (D5/D6/D25/D27): a recipe is a TEMPLATE for a
// plate INSTANCE, not a fixed def. `servings` is the batch yield (D6 —
// cooking produces portions, the Servings bar reads them); the old
// `produces: { defId: 'meal_*', qty }` line is gone — ITEMS' makePlate
// computes the plate's real kcal/quality/grade/servings from these
// ingredients + the D5 meal bonus. `method`/`cookware` are Phase-3
// placeholders the plate carries (Phase 4/5 make them mechanical gates);
// `betterHot` (D27) marks a dish that should be eaten reheated — a plate
// eaten cold forfeits its whole mood bonus, which is what makes
// REHEAT_ITEM's kitchen touch meaningful. `servings > 1` is the norm per
// D25; a 1-serving recipe (a single burger) simply cooks-and-eats.
//
// Food-overhaul Phase 4 (D9): the `SET_OBJECT_STATE {sink} dishes many`
// lines are GONE from every recipe — the sink's dish dirt is now a dish
// MAP whose production is declared once in DISH_TUNING.cookFootprint
// (keyed by method, DISH_DEFS the single owning table), and buildCookEffects
// emits the ADD_DISHES lines itself. What `leaves` keeps is the rest of
// the footprint (grease on the stove's burner), which has no home in a
// dish map.
const RECIPES = {
  pasta: {
    id: 'pasta', label: 'Pasta',
    ingredients: [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }],
    servings: 3, method: 'boil', cookware: 'pot', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  omelette: {
    id: 'omelette', label: 'Omelette',
    ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'cheese', qty: 1 }],
    // Food-overhaul Phase 5 (D16): a mixing step in a real recipe — the
    // whisked eggs are the classic case, and it exercises the mixer-gate
    // in ordinary play, not just the engine's unit tests.
    mix: ['whisk'],
    servings: 2, method: 'fry', cookware: 'pan', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  stirfry: {
    id: 'stirfry', label: 'Stir-fry',
    ingredients: [{ defId: 'rice', qty: 1 }, { defId: 'chicken_raw', qty: 1 }, { defId: 'onion', qty: 1 }],
    servings: 3, method: 'stir_fry', cookware: 'wok', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner filthy'],
  },
  sandwich: {
    id: 'sandwich', label: 'Sandwich',
    ingredients: [{ defId: 'bread', qty: 2 }, { defId: 'cheese', qty: 1 }],
    servings: 2, method: 'none', cookware: null,
    leaves: [],
  },
  // --- New recipes (P8 content volume) ---
  bacon_eggs: {
    id: 'bacon_eggs', label: 'Bacon and Eggs',
    ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'bacon', qty: 1 }],
    servings: 2, method: 'fry', cookware: 'pan', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  burger: {
    id: 'burger', label: 'Burger',
    ingredients: [{ defId: 'ground_beef', qty: 1 }, { defId: 'bread', qty: 1 }, { defId: 'onion', qty: 1 }],
    servings: 1, method: 'fry', cookware: 'pan', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  salad: {
    id: 'salad', label: 'Salad',
    ingredients: [{ defId: 'lettuce', qty: 1 }, { defId: 'tomato', qty: 1 }, { defId: 'cheese', qty: 1 }],
    servings: 2, method: 'none', cookware: null,
    leaves: [],
  },
  fried_rice: {
    id: 'fried_rice', label: 'Fried Rice',
    ingredients: [{ defId: 'rice', qty: 1 }, { defId: 'eggs', qty: 1 }, { defId: 'onion', qty: 1 }],
    servings: 3, method: 'stir_fry', cookware: 'wok', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  soup: {
    id: 'soup', label: 'Tomato Soup',
    ingredients: [{ defId: 'tomato_sauce', qty: 1 }, { defId: 'onion', qty: 1 }, { defId: 'garlic', qty: 1 }],
    servings: 4, method: 'simmer', cookware: 'pot', betterHot: true,
    leaves: ['SET_OBJECT_STATE {stove} burner crusty'],
  },
  loaded_potato: {
    id: 'loaded_potato', label: 'Loaded Baked Potato',
    ingredients: [{ defId: 'potatoes', qty: 1 }, { defId: 'cheese', qty: 1 }, { defId: 'butter', qty: 1 }],
    servings: 1, method: 'bake', cookware: 'oven', betterHot: true,
    leaves: [],
  },
  // 2026-08-20 (playtest feedback): the starter freezer's frozen pizza
  // finally gets the "pop it in the oven" beat its spawn comment always
  // promised — there was no recipe for it, so the ONLY thing a player could
  // do was eat it frozen (and take the D28 mood penalty for the privilege).
  // Baked, it's a real meal: 4 servings, betterHot so it should be eaten
  // fresh or reheated. Eating it straight from the freezer stays legal and
  // stays sad.
  frozen_pizza: {
    id: 'frozen_pizza', label: 'Baked Pizza',
    ingredients: [{ defId: 'frozen_pizza', qty: 1 }],
    servings: 4, method: 'bake', cookware: 'baking_tray', betterHot: true,
    leaves: [],
  },
};

// Seeded into the fridge/pantry at new-game spawn (WORLD's
// spawnObjectsForNewGame) so cooking is playable from day one — matches
// the existing "the house has a past before the player's first turn"
// convention (SIM backdates castWeb shared-history beats the same way).
const STARTER_GROCERIES = {
  fridge: [
    { defId: 'eggs', qty: 6 }, { defId: 'milk', qty: 1 },
    { defId: 'cheese', qty: 2 }, { defId: 'butter', qty: 1 },
    { defId: 'bacon', qty: 1 }, { defId: 'lettuce', qty: 1 },
  ],
  pantry: [
    { defId: 'pasta_dry', qty: 2 }, { defId: 'tomato_sauce', qty: 2 },
    { defId: 'rice', qty: 2 }, { defId: 'bread', qty: 2 },
    { defId: 'onion', qty: 2 }, { defId: 'potatoes', qty: 2 },
    // Food-overhaul Phase 5 (D8): the starter kitchen is stocked to cook —
    // oil for frying, salt and spices so the taste gate has what it needs
    // (run out of salt and the cooking engine will happily call your
    // dinner bland).
    { defId: 'oil', qty: 2 }, { defId: 'salt', qty: 2 }, { defId: 'spices', qty: 1 },
  ],
  // Food-overhaul Phase 1 (D17): the house starts with a freezer and
  // something in it — a frozen pizza for the "pop it in the oven later"
  // beat and ice cream because it's the freezer's most honest purpose.
  freezer: [
    { defId: 'frozen_pizza', qty: 1 }, { defId: 'comfort_ice_cream', qty: 1 },
  ],
};

// Starter clothing per wardrobe, keyed by room, seeded by WORLD's
// seedStarterWardrobes at new-game spawn (same path STARTER_GROCERIES
// uses — a fresh house is dressed from day one, existing saves keep their
// current wardrobes untouched). The player's set is deliberately varied so
// Phase 5's Change Outfit has real daily/work/lounge options to switch
// between; every set must fit its wardrobe's tier-1 capacity (12 items).
const STARTER_WARDROBES = {
  bedroom_player: [
    { defId: 'basic_tee', qty: 1 }, { defId: 'button_up', qty: 1 },
    { defId: 'tank_top', qty: 1 }, { defId: 'jeans', qty: 1 },
    { defId: 'sweatpants', qty: 1 }, { defId: 'athletic_shorts', qty: 1 },
    { defId: 'sneakers', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'hoodie', qty: 1 },
  ],
  // Intimacy & Voyeurism Phase 6 (D11): the roommates get SIGNATURE
  // wardrobes instead of identical five-item kits, so the outfit AI has
  // something real to work with from day one and each NPC reads differently
  // at a glance — the contractor is the one in dress clothes, the athlete is
  // the one in gym gear, the beach-lover is the one in swimwear. All three
  // still fit tier-1 capacity (12). NPCs whose wardrobe lacks a given
  // outfit's items degrade gracefully to the best available daily fit.
  bedroom_1: [ // the work-leaning roommate
    { defId: 'basic_tee', qty: 1 }, { defId: 'button_up', qty: 1 },
    { defId: 'dress_pants', qty: 1 }, { defId: 'dress_shoes', qty: 1 },
    { defId: 'dress_socks', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'socks_cotton', qty: 1 }, { defId: 'boxers', qty: 1 },
  ],
  bedroom_2: [ // the athletic roommate
    { defId: 'basic_tee', qty: 1 }, { defId: 'tank_top', qty: 1 },
    { defId: 'athletic_shorts', qty: 1 }, { defId: 'sports_socks', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'socks_cotton', qty: 1 }, { defId: 'boxers', qty: 1 },
  ],
  bedroom_3: [ // the beach-leaning roommate
    { defId: 'basic_tee', qty: 1 }, { defId: 'swim_trunks', qty: 1 },
    { defId: 'one_piece', qty: 1 }, { defId: 'sandals', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'socks_cotton', qty: 1 }, { defId: 'boxers', qty: 1 },
  ],
};

// The Everyday-style wardrobe catalog (Player Design studio's `fashion`
// select). WORLD's seedStarterWardrobes swaps the fixed STARTER_WARDROBES
// sets above for whichever of these matches each character's rolled or
// chosen `physical.fashion`, so the style choice is not just a description
// line — it's the actual clothes on the hangers and the outfit on the
// person's back. Every set:
//   - fits tier-1 wardrobe capacity (12 items),
//   - carries real underwear + socks + shoes so a full outfit composes,
//   - keeps at least one everyday/versatile core so composeOutfit can always
//     build a daily outfit, and
//   - mostly carries a work-capable top so an NPC with a job isn't naked at
//     the office (degrade-gracefully covers the ones that don't).
const FASHION_WARDROBES = {
  'casual hoodies and jeans': [
    { defId: 'basic_tee', qty: 1 }, { defId: 'button_up', qty: 1 },
    { defId: 'hoodie', qty: 1 }, { defId: 'jeans', qty: 1 },
    { defId: 'sweatpants', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'socks_cotton', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'briefs', qty: 1 }, { defId: 'cap', qty: 1 },
  ],
  'thrifted vintage': [
    { defId: 'graphic_tee', qty: 1 }, { defId: 'flannel_shirt', qty: 1 },
    { defId: 'denim_jacket', qty: 1 }, { defId: 'cardigan', qty: 1 },
    { defId: 'overalls', qty: 1 }, { defId: 'jeans', qty: 1 },
    { defId: 'sandals', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'beanie', qty: 1 },
  ],
  'minimalist monochrome': [
    { defId: 'turtleneck', qty: 1 }, { defId: 'basic_tee', qty: 1 },
    { defId: 'button_up', qty: 1 }, { defId: 'chinos', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'coat', qty: 1 },
    { defId: 'sneakers', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'wristwatch', qty: 1 },
  ],
  'bright patterns': [
    { defId: 'graphic_tee', qty: 1 }, { defId: 'tank_top', qty: 1 },
    { defId: 'windbreaker', qty: 1 }, { defId: 'shorts', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'sports_socks', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'cap', qty: 1 },
  ],
  'comfort-first athleisure': [
    { defId: 'basic_tee', qty: 1 }, { defId: 'tank_top', qty: 1 },
    { defId: 'sweatpants', qty: 1 }, { defId: 'athletic_shorts', qty: 1 },
    { defId: 'hoodie', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'sports_socks', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'slippers', qty: 1 },
  ],
  'smart-casual': [
    { defId: 'button_up', qty: 1 }, { defId: 'blouse', qty: 1 },
    { defId: 'chinos', qty: 1 }, { defId: 'dress_pants', qty: 1 },
    { defId: 'coat', qty: 1 }, { defId: 'dress_shoes', qty: 1 },
    { defId: 'dress_socks', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'wristwatch', qty: 1 },
  ],
  'bohemian layers': [
    { defId: 'blouse', qty: 1 }, { defId: 'sweater', qty: 1 },
    { defId: 'cardigan', qty: 1 }, { defId: 'flannel_shirt', qty: 1 },
    { defId: 'skirt', qty: 1 }, { defId: 'jeans', qty: 1 },
    { defId: 'sandals', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'sun_hat', qty: 1 },
    { defId: 'bracelet', qty: 1 },
  ],
  'streetwear': [
    { defId: 'graphic_tee', qty: 1 }, { defId: 'tank_top', qty: 1 },
    { defId: 'hoodie', qty: 1 }, { defId: 'windbreaker', qty: 1 },
    { defId: 'cargo_pants', qty: 1 }, { defId: 'high_tops', qty: 1 },
    { defId: 'sports_socks', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'cap', qty: 1 },
  ],
  'preppy': [
    { defId: 'polo_shirt', qty: 1 }, { defId: 'button_up', qty: 1 },
    { defId: 'chinos', qty: 1 }, { defId: 'sweater', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'sneakers', qty: 1 },
    { defId: 'socks_cotton', qty: 1 }, { defId: 'boxers', qty: 1 },
    { defId: 'wristwatch', qty: 1 },
  ],
  'goth-adjacent': [
    { defId: 'turtleneck', qty: 1 }, { defId: 'basic_tee', qty: 1 },
    { defId: 'graphic_tee', qty: 1 }, { defId: 'leather_jacket', qty: 1 },
    { defId: 'cargo_pants', qty: 1 }, { defId: 'jeans', qty: 1 },
    { defId: 'high_tops', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'necklace', qty: 1 },
  ],
  'workwear': [
    { defId: 'flannel_shirt', qty: 1 }, { defId: 'basic_tee', qty: 1 },
    { defId: 'cargo_pants', qty: 1 }, { defId: 'overalls', qty: 1 },
    { defId: 'jeans', qty: 1 }, { defId: 'denim_jacket', qty: 1 },
    { defId: 'work_boots', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'boxers', qty: 1 }, { defId: 'cap', qty: 1 },
  ],
  'flowy dresses': [
    { defId: 'blouse', qty: 1 }, { defId: 'skirt', qty: 1 },
    { defId: 'sweater', qty: 1 }, { defId: 'cardigan', qty: 1 },
    { defId: 'sandals', qty: 1 }, { defId: 'socks_cotton', qty: 1 },
    { defId: 'bra', qty: 1 }, { defId: 'panties', qty: 1 },
    { defId: 'sun_hat', qty: 1 }, { defId: 'bracelet', qty: 1 },
    { defId: 'necklace', qty: 1 },
  ],
};

// ===== /SECTION: DEFS.WORLD =====
