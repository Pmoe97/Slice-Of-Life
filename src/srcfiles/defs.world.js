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
// `dirtyWhen: { stateKey: { value: griminess0to1 } }` is what
// recomputeRoomCleanliness (WORLD) reads — data-driven, so "what makes a
// room feel dirty" is a CONFIG-shaped fact about each object, not a
// hardcoded formula.

const OBJECT_DEFS = {
  // --- Bedroom furniture (instanced once per bedroom via APARTMENT_LAYOUT) ---
  bed: {
    id: 'bed', label: 'Bed', nouns: ['bed', 'mattress'],
    portable: false, breakable: false, container: false, private: true,
    states: { made: ['made', 'unmade'] }, defaultState: { made: 'made' },
    dirtyWhen: { made: { unmade: 0.15 } }, cleanlinessWeight: 2,
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
  wardrobe: {
    id: 'wardrobe', label: 'Wardrobe', nouns: ['wardrobe', 'closet'],
    portable: false, breakable: false, container: true, containerCapacity: 20, private: true,
    states: { door: ['closed', 'open'] }, defaultState: { door: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a wardrobe',
  },
  nightstand: {
    id: 'nightstand', label: 'Nightstand', nouns: ['nightstand', 'bedside table'],
    portable: false, breakable: false, container: true, containerCapacity: 6, private: true,
    states: { door: ['closed', 'open'] }, defaultState: { door: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 0,
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
  // ref/BrineOS-The-Phone-plan.md, NOT an inventory item: only objects
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
    portable: true, breakable: false, container: true, containerCapacity: 10, private: true,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a small jewelry box',
  },

  // --- Kitchen ---
  stove: {
    id: 'stove', label: 'Stove', nouns: ['stove', 'range', 'burner', 'hob'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], burner: ['clean', 'crusty', 'filthy'] }, defaultState: { power: 'off', burner: 'clean' },
    dirtyWhen: { burner: { crusty: 0.5, filthy: 1.0 } }, cleanlinessWeight: 3,
    affords: ['cook.meal', 'clean.object', 'inspect.object'],
    imagePhrase: 'a small gas stove',
  },
  fridge: {
    id: 'fridge', label: 'Fridge', nouns: ['fridge', 'refrigerator', 'icebox'],
    portable: false, breakable: false, container: true, containerCapacity: 24, private: false,
    states: { door: ['closed', 'open'] }, defaultState: { door: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['container.open', 'container.take', 'container.put', 'clean.object', 'inspect.object'],
    imagePhrase: 'a refrigerator covered in magnets',
  },
  sink_kitchen: {
    id: 'sink_kitchen', label: 'Kitchen Sink', nouns: ['sink', 'kitchen sink'],
    portable: false, breakable: false, container: false, private: false,
    states: { dishes: ['clean', 'few', 'many'] }, defaultState: { dishes: 'clean' },
    dirtyWhen: { dishes: { few: 0.4, many: 0.9 } }, cleanlinessWeight: 3,
    affords: ['self.dishes', 'clean.object', 'inspect.object'],
    imagePhrase: 'a kitchen sink',
  },
  pantry: {
    id: 'pantry', label: 'Pantry', nouns: ['pantry', 'cupboard'],
    portable: false, breakable: false, container: true, containerCapacity: 30, private: false,
    states: { door: ['closed', 'open'] }, defaultState: { door: 'closed' },
    dirtyWhen: {}, cleanlinessWeight: 1,
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
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['inspect.object'],
    imagePhrase: 'a small kitchen table with mismatched chairs',
  },
  trash_kitchen: {
    id: 'trash_kitchen', label: 'Trash Can', nouns: ['trash', 'trash can', 'garbage'],
    portable: false, breakable: false, container: true, containerCapacity: 999, private: false,
    states: { fill: ['empty', 'partial', 'full'] }, defaultState: { fill: 'empty' },
    dirtyWhen: { fill: { partial: 0.3, full: 0.8 } }, cleanlinessWeight: 2,
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a kitchen trash can',
  },

  // --- Bathroom ---
  shower: {
    id: 'shower', label: 'Shower', nouns: ['shower'],
    portable: false, breakable: true, container: false, private: false,
    states: { power: ['off', 'on'], grime: ['clean', 'soap-scummed'] }, defaultState: { power: 'off', grime: 'clean' },
    dirtyWhen: { grime: { 'soap-scummed': 0.6 } }, cleanlinessWeight: 2,
    affords: ['shower.use', 'clean.object', 'inspect.object'],
    imagePhrase: 'a shower with a frosted glass door',
  },
  toilet: {
    id: 'toilet', label: 'Toilet', nouns: ['toilet'],
    portable: false, breakable: false, container: false, private: false,
    states: { clean: ['clean', 'dirty'] }, defaultState: { clean: 'clean' },
    dirtyWhen: { clean: { dirty: 0.7 } }, cleanlinessWeight: 2,
    affords: ['clean.object', 'inspect.object'],
    imagePhrase: 'a toilet',
  },
  sink_bathroom: {
    id: 'sink_bathroom', label: 'Bathroom Sink', nouns: ['sink', 'bathroom sink'],
    portable: false, breakable: false, container: false, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.4 } }, cleanlinessWeight: 1,
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
  laundry_hamper: {
    id: 'laundry_hamper', label: 'Laundry Hamper', nouns: ['hamper', 'laundry hamper', 'laundry'],
    portable: false, breakable: false, container: true, containerCapacity: 15, private: false,
    states: { fill: ['empty', 'partial', 'full'] }, defaultState: { fill: 'empty' },
    dirtyWhen: {}, cleanlinessWeight: 1,
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
    affords: ['inspect.object', 'clean.object'],
    imagePhrase: 'a coffee table scattered with mail and remotes',
  },
  bookshelf: {
    id: 'bookshelf', label: 'Bookshelf', nouns: ['bookshelf', 'shelf'],
    portable: false, breakable: false, container: true, containerCapacity: 40, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
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
  doormat: {
    id: 'doormat', label: 'Doormat', nouns: ['doormat', 'mat'],
    portable: false, breakable: false, container: true, containerCapacity: 10, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a doormat by the front door, the kind packages get left on',
  },
  coat_rack: {
    id: 'coat_rack', label: 'Coat Rack', nouns: ['coat rack', 'rack'],
    portable: false, breakable: false, container: true, containerCapacity: 8, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['container.open', 'container.take', 'container.put', 'inspect.object'],
    imagePhrase: 'a coat rack by the door',
  },
  bedroom_door: {
    id: 'bedroom_door', label: 'Door', nouns: ['door', 'bedroom door'],
    portable: false, breakable: false, container: false, private: false,
    states: { lock: ['unlocked', 'locked'] }, defaultState: { lock: 'unlocked' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.lock_door', 'self.unlock_door', 'inspect.object'],
    imagePhrase: 'a bedroom door with a simple lock',
  },
  bathroom_door: {
    id: 'bathroom_door', label: 'Door', nouns: ['door', 'bathroom door'],
    portable: false, breakable: false, container: false, private: false,
    states: { lock: ['unlocked', 'locked'] }, defaultState: { lock: 'unlocked' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['self.lock_door', 'self.unlock_door', 'inspect.object'],
    imagePhrase: 'a bathroom door with a simple lock',
  },

  // --- Dining Room ---
  dining_table: {
    id: 'dining_table', label: 'Dining Table', nouns: ['dining table', 'table'],
    portable: false, breakable: false, container: false, private: false,
    states: { clutter: ['tidy', 'cluttered'] }, defaultState: { clutter: 'tidy' },
    dirtyWhen: { clutter: { cluttered: 0.2 } }, cleanlinessWeight: 2,
    affords: ['inspect.object', 'clean.object'],
    imagePhrase: 'a large dining table with mismatched chairs',
  },

  // --- Entry / Foyer ---
  front_door: {
    id: 'front_door', label: 'Front Door', nouns: ['front door', 'door'],
    portable: false, breakable: false, container: false, private: false,
    states: { lock: ['unlocked', 'locked'] }, defaultState: { lock: 'unlocked' },
    dirtyWhen: {}, cleanlinessWeight: 0,
    affords: ['inspect.object'],
    imagePhrase: 'a heavy front door',
  },
  shoe_rack: {
    id: 'shoe_rack', label: 'Shoe Rack', nouns: ['shoe rack', 'shoes'],
    portable: false, breakable: false, container: true, containerCapacity: 12, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 0,
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
  // 'empty' until the liner and pump are fixed, then 'filled'. Cleanliness
  // weight is high because a green, stagnant pool drags a whole wing down.
  swimming_pool: {
    id: 'swimming_pool', label: 'Swimming Pool', nouns: ['pool', 'swimming pool', 'the water'],
    portable: false, breakable: false, container: false, private: false,
    states: { water: ['filled', 'empty'], clarity: ['clear', 'cloudy', 'green'] },
    defaultState: { water: 'empty', clarity: 'green' },
    dirtyWhen: { clarity: { cloudy: 0.5, green: 1.0 } }, cleanlinessWeight: 4,
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
    portable: false, breakable: false, container: true, containerCapacity: 60, private: false,
    states: {}, defaultState: {}, dirtyWhen: {}, cleanlinessWeight: 1,
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
    portable: false, breakable: true, container: true, containerCapacity: 15, private: false,
    states: { power: ['off', 'on'], cycle: ['empty', 'running', 'done'] }, defaultState: { power: 'off', cycle: 'empty' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['self.laundry', 'container.open', 'container.put', 'inspect.object'],
    imagePhrase: 'a front-loading washing machine',
  },
  dryer: {
    id: 'dryer', label: 'Dryer', nouns: ['dryer', 'drying machine'],
    portable: false, breakable: true, container: true, containerCapacity: 15, private: false,
    states: { power: ['off', 'on'], cycle: ['empty', 'running', 'done'] }, defaultState: { power: 'off', cycle: 'empty' },
    dirtyWhen: {}, cleanlinessWeight: 1,
    affords: ['container.open', 'container.take', 'inspect.object'],
    imagePhrase: 'a dryer next to the washer',
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
const APARTMENT_LAYOUT_VERSION = 3;

const APARTMENT_LAYOUT = {
  bedroom_player: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'desktop_computer' },
    { defId: 'phone', ownerFrom: 'roomResident' },
  ],
  bedroom_1: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'guitar', ownerFrom: 'roomResident' },
    { defId: 'diary', ownerFrom: 'roomResident' },
  ],
  bedroom_2: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'jewelry_box', ownerFrom: 'roomResident' },
  ],
  bedroom_3: [
    { defId: 'bedroom_door' },
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
  ],
  kitchen: [
    { defId: 'stove' }, { defId: 'fridge' }, { defId: 'sink_kitchen' },
    { defId: 'pantry' }, { defId: 'coffee_maker' }, { defId: 'kitchen_table' }, { defId: 'trash_kitchen' },
  ],
  bathroom_a: [
    { defId: 'bathroom_door' },
    { defId: 'shower' }, { defId: 'toilet' }, { defId: 'sink_bathroom' },
    { defId: 'bathroom_mirror' },
  ],
  bathroom_b: [
    { defId: 'bathroom_door' },
    { defId: 'shower' }, { defId: 'toilet' }, { defId: 'sink_bathroom' },
    { defId: 'bathroom_mirror' },
  ],
  living_room: [
    { defId: 'sofa' }, { defId: 'tv' }, { defId: 'coffee_table_lr' },
    { defId: 'bookshelf' }, { defId: 'lamp_lr' }, { defId: 'plant_lr' },
  ],
  hallway_a: [
    { defId: 'coat_rack' },
  ],
  hallway_b: [
    { defId: 'coat_rack' },
  ],
  entry: [
    { defId: 'front_door' },
    { defId: 'doormat' },
    { defId: 'shoe_rack' },
  ],
  dining: [
    { defId: 'dining_table' },
  ],
  game_room: [
    { defId: 'pool_table' }, { defId: 'game_console' }, { defId: 'dartboard' },
  ],
  gym: [
    { defId: 'treadmill' }, { defId: 'weight_set' }, { defId: 'yoga_mat' },
  ],
  pool_room: [
    { defId: 'swimming_pool' }, { defId: 'pool_pump' }, { defId: 'pool_loungers' },
  ],
  study: [
    { defId: 'study_desk' }, { defId: 'study_bookshelf' }, { defId: 'armchair' },
  ],
  balcony: [
    { defId: 'balcony_table' }, { defId: 'plant_balcony' },
  ],
  laundry: [
    { defId: 'washer' }, { defId: 'dryer' }, { defId: 'laundry_hamper' },
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

  // Ingredients
  eggs: { id: 'eggs', label: 'Eggs', nouns: ['egg', 'eggs'], category: 'ingredient', stackable: true, maxStack: 24, perishable: { days: 14 }, consumable: { hunger: 6 }, price: 4, buyQty: 12 },
  milk: { id: 'milk', label: 'Milk', nouns: ['milk'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 7 }, consumable: { hunger: 3 }, price: 3, buyQty: 1 },
  bread: { id: 'bread', label: 'Bread', nouns: ['bread', 'loaf'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 5 }, consumable: { hunger: 10 }, price: 3, buyQty: 1 },
  pasta_dry: { id: 'pasta_dry', label: 'Dry Pasta', nouns: ['pasta'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 15 }, price: 2, buyQty: 2 },
  tomato_sauce: { id: 'tomato_sauce', label: 'Tomato Sauce', nouns: ['tomato sauce', 'sauce'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 4 }, price: 3, buyQty: 2 },
  rice: { id: 'rice', label: 'Rice', nouns: ['rice'], category: 'ingredient', stackable: true, maxStack: 8, consumable: { hunger: 12 }, price: 4, buyQty: 2 },
  chicken_raw: { id: 'chicken_raw', label: 'Raw Chicken', nouns: ['chicken'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 3 }, consumable: { hunger: 5 }, price: 8, buyQty: 2 },
  ground_beef: { id: 'ground_beef', label: 'Ground Beef', nouns: ['ground beef', 'beef'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 3 }, consumable: { hunger: 5 }, price: 9, buyQty: 1 },
  cheese: { id: 'cheese', label: 'Cheese', nouns: ['cheese'], category: 'ingredient', stackable: true, maxStack: 6, perishable: { days: 20 }, consumable: { hunger: 4 }, price: 5, buyQty: 1 },
  butter: { id: 'butter', label: 'Butter', nouns: ['butter'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 30 }, price: 4, buyQty: 1 },
  onion: { id: 'onion', label: 'Onion', nouns: ['onion'], category: 'ingredient', stackable: true, maxStack: 10, consumable: { hunger: 2 }, price: 1, buyQty: 3 },
  garlic: { id: 'garlic', label: 'Garlic', nouns: ['garlic'], category: 'ingredient', stackable: true, maxStack: 10, price: 1, buyQty: 3 },
  potatoes: { id: 'potatoes', label: 'Potatoes', nouns: ['potato', 'potatoes'], category: 'ingredient', stackable: true, maxStack: 10, consumable: { hunger: 8 }, price: 3, buyQty: 5 },
  lettuce: { id: 'lettuce', label: 'Lettuce', nouns: ['lettuce'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 6 }, consumable: { hunger: 3 }, price: 2, buyQty: 1 },
  tomato: { id: 'tomato', label: 'Tomato', nouns: ['tomato'], category: 'ingredient', stackable: true, maxStack: 8, perishable: { days: 6 }, consumable: { hunger: 2 }, price: 1, buyQty: 4 },
  bacon: { id: 'bacon', label: 'Bacon', nouns: ['bacon'], category: 'ingredient', stackable: true, maxStack: 4, perishable: { days: 10 }, consumable: { hunger: 5 }, price: 6, buyQty: 1 },
  flour: { id: 'flour', label: 'Flour', nouns: ['flour'], category: 'ingredient', stackable: true, maxStack: 4, price: 3, buyQty: 1 },
  sugar: { id: 'sugar', label: 'Sugar', nouns: ['sugar'], category: 'ingredient', stackable: true, maxStack: 4, price: 3, buyQty: 1 },
  coffee_beans: { id: 'coffee_beans', label: 'Coffee', nouns: ['coffee', 'coffee beans'], category: 'ingredient', stackable: true, maxStack: 4, consumable: { energy: 8, mood: 0.02 }, price: 8, buyQty: 1 },
  tea_bags: { id: 'tea_bags', label: 'Tea Bags', nouns: ['tea'], category: 'ingredient', stackable: true, maxStack: 20, consumable: { mood: 0.02 }, price: 4, buyQty: 10 },
  cereal: { id: 'cereal', label: 'Cereal', nouns: ['cereal'], category: 'ingredient', stackable: true, maxStack: 3, consumable: { hunger: 12 }, price: 4, buyQty: 1 },

  // Prepared meals (produced by RECIPES below)
  meal_pasta: { id: 'meal_pasta', label: 'Pasta', nouns: ['pasta'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 3 }, consumable: { hunger: 40, mood: 0.03 } },
  meal_omelette: { id: 'meal_omelette', label: 'Omelette', nouns: ['omelette'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.02 } },
  meal_stirfry: { id: 'meal_stirfry', label: 'Stir-fry', nouns: ['stir-fry', 'stirfry'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 3 }, consumable: { hunger: 42, mood: 0.03 } },
  meal_sandwich: { id: 'meal_sandwich', label: 'Sandwich', nouns: ['sandwich'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 25 } },
  // --- New meal items (P8) ---
  meal_breakfast: { id: 'meal_breakfast', label: 'Bacon and Eggs', nouns: ['bacon and eggs', 'breakfast'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 35, mood: 0.03 } },
  meal_burger: { id: 'meal_burger', label: 'Burger', nouns: ['burger'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 38, mood: 0.04 } },
  meal_salad: { id: 'meal_salad', label: 'Salad', nouns: ['salad'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.02 } },
  meal_fried_rice: { id: 'meal_fried_rice', label: 'Fried Rice', nouns: ['fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 3 }, consumable: { hunger: 40, mood: 0.03 } },
  meal_soup: { id: 'meal_soup', label: 'Tomato Soup', nouns: ['soup', 'tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 4 }, consumable: { hunger: 28, mood: 0.02 } },
  meal_potato: { id: 'meal_potato', label: 'Loaded Potato', nouns: ['potato', 'baked potato'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.03 } },

  // Delivered restaurant dishes (external-world plan Phase 5). Real items,
  // not a "you ate out" abstraction: a delivered dish lands in inventory or
  // on the doormat like any other object, can go in the fridge, and carries
  // the same perishable/consumable fields as a home-cooked meal. Deliberately
  // NO `price` field — price is per-restaurant and lives in RESTAURANT_DEFS'
  // menu (DEFS.COMPUTER); a `price` here would put takeout in Nile's catalog,
  // which builds itself from every priced ITEM_DEF (SHOP_CATALOG_LIST, ITEMS).
  // Restaurant food beats home cooking on hunger and mood — that's what the
  // markup buys — and spoils faster, so ordering ahead has a real cost.
  dish_kung_pao: { id: 'dish_kung_pao', label: 'Kung Pao Chicken', nouns: ['kung pao', 'kung pao chicken'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 45, mood: 0.05 } },
  dish_chow_mein: { id: 'dish_chow_mein', label: 'Beef Chow Mein', nouns: ['chow mein', 'noodles'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.04 } },
  dish_dumplings: { id: 'dish_dumplings', label: 'Pork Dumplings', nouns: ['dumplings'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.05 } },
  dish_egg_rolls: { id: 'dish_egg_rolls', label: 'Egg Rolls', nouns: ['egg rolls'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 18, mood: 0.03 } },

  dish_pepperoni_pizza: { id: 'dish_pepperoni_pizza', label: 'Pepperoni Pizza', nouns: ['pizza', 'pepperoni pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 55, mood: 0.06 } },
  dish_garlic_knots: { id: 'dish_garlic_knots', label: 'Garlic Knots', nouns: ['garlic knots', 'knots'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 20, mood: 0.04 } },
  dish_calzone: { id: 'dish_calzone', label: 'Calzone', nouns: ['calzone'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05 } },

  dish_double_burger: { id: 'dish_double_burger', label: 'Double Cheeseburger', nouns: ['burger', 'cheeseburger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 50, mood: 0.05 } },
  dish_fries: { id: 'dish_fries', label: 'Basket of Fries', nouns: ['fries'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.04 } },
  dish_milkshake: { id: 'dish_milkshake', label: 'Milkshake', nouns: ['milkshake', 'shake'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 15, mood: 0.06 } },

  dish_salmon_roll: { id: 'dish_salmon_roll', label: 'Salmon Roll Set', nouns: ['sushi', 'salmon roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.07 } },
  dish_tempura_udon: { id: 'dish_tempura_udon', label: 'Tempura Udon', nouns: ['udon', 'tempura udon'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_miso_soup: { id: 'dish_miso_soup', label: 'Miso Soup', nouns: ['miso', 'miso soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 16, mood: 0.03 } },

  dish_al_pastor: { id: 'dish_al_pastor', label: 'Al Pastor Tacos', nouns: ['tacos', 'al pastor'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.06 } },
  dish_burrito: { id: 'dish_burrito', label: 'Carne Asada Burrito', nouns: ['burrito'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 52, mood: 0.05 } },
  dish_chips_guac: { id: 'dish_chips_guac', label: 'Chips & Guac', nouns: ['chips and guac', 'guacamole'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.04 } },

  dish_pad_thai: { id: 'dish_pad_thai', label: 'Pad Thai', nouns: ['pad thai'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.06 } },
  dish_green_curry: { id: 'dish_green_curry', label: 'Green Curry', nouns: ['green curry', 'curry'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_spring_rolls: { id: 'dish_spring_rolls', label: 'Fresh Spring Rolls', nouns: ['spring rolls'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04 } },

  // --- Full-menu expansion (restaurant network overhaul Phase 3): every
  // new dish follows the same conventions — NO `price` (prices live in the
  // restaurant's menu entries only), stackable, 1-2 day perishable (fried/
  // short-lived = 1, noodle/curry/diner = 2), hunger in the existing range
  // with mood 0.03-0.08; coffee/tea drinks add `energy` like coffee_beans.
  // Golden Wok
  dish_orange_chicken: { id: 'dish_orange_chicken', label: 'Orange Chicken', nouns: ['orange chicken'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05 } },
  dish_lo_mein: { id: 'dish_lo_mein', label: 'Lo Mein', nouns: ['lo mein'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.04 } },
  dish_house_fried_rice: { id: 'dish_house_fried_rice', label: 'House Fried Rice', nouns: ['fried rice', 'house fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.04 } },
  dish_beef_broccoli: { id: 'dish_beef_broccoli', label: 'Beef & Broccoli', nouns: ['beef and broccoli', 'broccoli'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_wonton_soup: { id: 'dish_wonton_soup', label: 'Wonton Soup', nouns: ['wonton soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 20, mood: 0.04 } },
  dish_fortune_cookies: { id: 'dish_fortune_cookies', label: 'Fortune Cookies', nouns: ['fortune cookies', 'fortune cookie'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 8, mood: 0.03 } },

  // Sal's Pizzeria
  dish_cheese_pizza: { id: 'dish_cheese_pizza', label: 'Cheese Pizza', nouns: ['cheese pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 48, mood: 0.05 } },
  dish_sausage_pizza: { id: 'dish_sausage_pizza', label: 'Sausage Pizza', nouns: ['sausage pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 52, mood: 0.06 } },
  dish_white_pizza: { id: 'dish_white_pizza', label: 'White Pizza', nouns: ['white pizza', 'pizza'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 2 }, consumable: { hunger: 50, mood: 0.05 } },
  dish_meatball_sub: { id: 'dish_meatball_sub', label: 'Meatball Sub', nouns: ['meatball sub', 'sub'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.05 } },
  dish_breadsticks: { id: 'dish_breadsticks', label: 'Garlic Breadsticks', nouns: ['breadsticks', 'breadstick'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04 } },
  dish_caesar_wedge: { id: 'dish_caesar_wedge', label: 'Caesar Wedge', nouns: ['caesar salad', 'wedge'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.03 } },
  dish_cannoli: { id: 'dish_cannoli', label: 'Cannoli', nouns: ['cannoli'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.06 } },
  dish_limonata: { id: 'dish_limonata', label: 'Lemon Soda', nouns: ['limonata', 'lemon soda'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 10, mood: 0.03 } },

  // Big Bite Burgers
  dish_breakfast_burger: { id: 'dish_breakfast_burger', label: 'Breakfast Burger', nouns: ['breakfast burger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05 } },
  dish_sausage_egg_muffin: { id: 'dish_sausage_egg_muffin', label: 'Sausage Egg Muffin', nouns: ['sausage egg muffin', 'egg muffin'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04 } },
  dish_pancakes: { id: 'dish_pancakes', label: 'Short Stack of Pancakes', nouns: ['pancakes', 'pancake'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 36, mood: 0.05 } },
  dish_hash_browns: { id: 'dish_hash_browns', label: 'Hash Browns', nouns: ['hash browns', 'hash brown'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.03 } },
  dish_chicken_sandwich: { id: 'dish_chicken_sandwich', label: 'Crispy Chicken Sandwich', nouns: ['chicken sandwich'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_onion_rings: { id: 'dish_onion_rings', label: 'Onion Rings', nouns: ['onion rings'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.04 } },
  dish_bacon_burger: { id: 'dish_bacon_burger', label: 'Bacon Cheeseburger', nouns: ['bacon cheeseburger', 'burger'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 52, mood: 0.06 } },
  dish_nuggets: { id: 'dish_nuggets', label: 'Chicken Nuggets', nouns: ['nuggets'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04 } },
  dish_lemonade: { id: 'dish_lemonade', label: 'Fresh Lemonade', nouns: ['lemonade'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 8, mood: 0.03 } },
  dish_apple_pie: { id: 'dish_apple_pie', label: 'Apple Pie Slice', nouns: ['apple pie'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.04 } },

  // Kaisen Sushi
  dish_spicy_tuna_roll: { id: 'dish_spicy_tuna_roll', label: 'Spicy Tuna Roll', nouns: ['spicy tuna roll', 'tuna roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.06 } },
  dish_rainbow_roll: { id: 'dish_rainbow_roll', label: 'Rainbow Roll', nouns: ['rainbow roll'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.07 } },
  dish_ebi_tempura: { id: 'dish_ebi_tempura', label: 'Ebi Tempura', nouns: ['ebi tempura', 'tempura'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.05 } },
  dish_chicken_katsu: { id: 'dish_chicken_katsu', label: 'Chicken Katsu', nouns: ['chicken katsu', 'katsu'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 44, mood: 0.05 } },
  dish_gyoza: { id: 'dish_gyoza', label: 'Pork Gyoza', nouns: ['gyoza'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.05 } },
  dish_edamame: { id: 'dish_edamame', label: 'Edamame', nouns: ['edamame'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.03 } },
  dish_green_tea: { id: 'dish_green_tea', label: 'Green Tea', nouns: ['green tea', 'tea'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 6, mood: 0.02, energy: 4 } },
  dish_mochi: { id: 'dish_mochi', label: 'Mochi', nouns: ['mochi'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 12, mood: 0.06 } },

  // El Camino Taqueria
  dish_carnitas_tacos: { id: 'dish_carnitas_tacos', label: 'Carnitas Tacos', nouns: ['carnitas tacos', 'tacos'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05 } },
  dish_chorizo_tacos: { id: 'dish_chorizo_tacos', label: 'Chorizo Tacos', nouns: ['chorizo tacos', 'tacos'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.06 } },
  dish_quesadilla: { id: 'dish_quesadilla', label: 'Cheese Quesadilla', nouns: ['quesadilla'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.05 } },
  dish_tamales: { id: 'dish_tamales', label: 'Tamales', nouns: ['tamales'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 36, mood: 0.05 } },
  dish_elote: { id: 'dish_elote', label: 'Mexican Street Corn', nouns: ['elote', 'street corn'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.04 } },
  dish_sopes: { id: 'dish_sopes', label: 'Sopes', nouns: ['sopes'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04 } },
  dish_horchata: { id: 'dish_horchata', label: 'Horchata', nouns: ['horchata'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.03 } },
  dish_bean_cheese_burrito: { id: 'dish_bean_cheese_burrito', label: 'Bean & Cheese Burrito', nouns: ['bean and cheese burrito', 'burrito'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04 } },

  // Bangkok House
  dish_drunken_noodles: { id: 'dish_drunken_noodles', label: 'Drunken Noodles', nouns: ['drunken noodles'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_massaman_curry: { id: 'dish_massaman_curry', label: 'Massaman Curry', nouns: ['massaman curry', 'curry'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 50, mood: 0.06 } },
  dish_thai_fried_rice: { id: 'dish_thai_fried_rice', label: 'Thai Fried Rice', nouns: ['thai fried rice', 'fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.04 } },
  dish_tom_yum: { id: 'dish_tom_yum', label: 'Tom Yum Soup', nouns: ['tom yum', 'tom yum soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 24, mood: 0.03 } },
  dish_satay: { id: 'dish_satay', label: 'Chicken Satay', nouns: ['satay', 'chicken satay'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.04 } },
  dish_thai_iced_tea: { id: 'dish_thai_iced_tea', label: 'Thai Iced Tea', nouns: ['thai iced tea', 'iced tea'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 12, mood: 0.03, energy: 4 } },
  dish_mango_sticky_rice: { id: 'dish_mango_sticky_rice', label: 'Mango Sticky Rice', nouns: ['mango sticky rice', 'sticky rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.07 } },
  dish_coconut_ice_cream: { id: 'dish_coconut_ice_cream', label: 'Coconut Ice Cream', nouns: ['coconut ice cream', 'ice cream'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.06 } },

  // Sunrise Cafe (new)
  dish_pancake_stack: { id: 'dish_pancake_stack', label: 'Pancake Stack', nouns: ['pancake stack', 'pancakes'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.06 } },
  dish_belgian_waffle: { id: 'dish_belgian_waffle', label: 'Belgian Waffle', nouns: ['belgian waffle', 'waffle'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.06 } },
  dish_breakfast_sandwich: { id: 'dish_breakfast_sandwich', label: 'Breakfast Sandwich', nouns: ['breakfast sandwich'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04 } },
  dish_avocado_toast: { id: 'dish_avocado_toast', label: 'Avocado Toast', nouns: ['avocado toast'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.05 } },
  dish_hash_brown_bowl: { id: 'dish_hash_brown_bowl', label: 'Hash Brown Bowl', nouns: ['hash brown bowl'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04 } },
  dish_granola_bowl: { id: 'dish_granola_bowl', label: 'Granola Bowl', nouns: ['granola bowl'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 32, mood: 0.05 } },
  dish_breakfast_potatoes: { id: 'dish_breakfast_potatoes', label: 'Breakfast Potatoes', nouns: ['breakfast potatoes'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 20, mood: 0.03 } },
  dish_fresh_coffee: { id: 'dish_fresh_coffee', label: 'Fresh Coffee', nouns: ['coffee', 'fresh coffee'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 8, energy: 10 } },
  dish_oat_latte: { id: 'dish_oat_latte', label: 'Oat Latte', nouns: ['oat latte', 'latte'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 6, mood: 0.02, energy: 6 } },
  dish_orange_juice_pitcher: { id: 'dish_orange_juice_pitcher', label: 'Orange Juice Pitcher', nouns: ['orange juice', 'juice pitcher'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 3, mood: 0.02 } },
  dish_croissant: { id: 'dish_croissant', label: 'Butter Croissant', nouns: ['croissant'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.04 } },
  dish_bagel_cc: { id: 'dish_bagel_cc', label: 'Bagel with Cream Cheese', nouns: ['bagel', 'bagel with cream cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 24, mood: 0.04 } },

  // The Greasy Spoon (new)
  dish_diner_breakfast: { id: 'dish_diner_breakfast', label: 'Diner Breakfast Platter', nouns: ['diner breakfast', 'breakfast platter'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 45, mood: 0.05 } },
  dish_club_sandwich: { id: 'dish_club_sandwich', label: 'Club Sandwich', nouns: ['club sandwich'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_patty_melt: { id: 'dish_patty_melt', label: 'Patty Melt', nouns: ['patty melt'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05 } },
  dish_grilled_cheese: { id: 'dish_grilled_cheese', label: 'Grilled Cheese', nouns: ['grilled cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.04 } },
  dish_tomato_soup_cup: { id: 'dish_tomato_soup_cup', label: 'Tomato Soup (Cup)', nouns: ['tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 16, mood: 0.03 } },
  dish_chicken_tenders: { id: 'dish_chicken_tenders', label: 'Chicken Tenders', nouns: ['chicken tenders', 'tenders'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04 } },
  dish_hamburger_steak: { id: 'dish_hamburger_steak', label: 'Hamburger Steak', nouns: ['hamburger steak', 'burger steak'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 50, mood: 0.05 } },
  dish_pancake_plate: { id: 'dish_pancake_plate', label: 'Pancake Plate', nouns: ['pancake plate', 'pancakes'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 35, mood: 0.05 } },
  dish_pie_slice: { id: 'dish_pie_slice', label: 'Pie Slice', nouns: ['pie slice', 'pie'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.05 } },
  dish_coffee_mug: { id: 'dish_coffee_mug', label: 'Diner Coffee Mug', nouns: ['coffee', 'mug of coffee'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 6, energy: 8 } },
  dish_vanilla_shake: { id: 'dish_vanilla_shake', label: 'Vanilla Shake', nouns: ['vanilla shake', 'shake'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.05 } },
  dish_onion_soup: { id: 'dish_onion_soup', label: 'French Onion Soup', nouns: ['french onion soup', 'onion soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 22, mood: 0.04 } },

  // Corner Deli (new)
  dish_pho_ga: { id: 'dish_pho_ga', label: 'Pho Ga', nouns: ['pho ga', 'pho'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 42, mood: 0.05 } },
  dish_tomato_soup_bowl: { id: 'dish_tomato_soup_bowl', label: 'Tomato Soup (Bowl)', nouns: ['tomato soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 28, mood: 0.03 } },
  dish_bread_bowl_chili: { id: 'dish_bread_bowl_chili', label: 'Bread Bowl Chili', nouns: ['bread bowl chili', 'chili'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 40, mood: 0.05 } },
  dish_chicken_flatbread: { id: 'dish_chicken_flatbread', label: 'Chicken Flatbread', nouns: ['chicken flatbread', 'flatbread'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 38, mood: 0.04 } },
  dish_salad_medley: { id: 'dish_salad_medley', label: 'Salad Medley', nouns: ['salad medley', 'salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.03 } },
  dish_mushroom_soup: { id: 'dish_mushroom_soup', label: 'Mushroom Soup', nouns: ['mushroom soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 30, mood: 0.04 } },
  dish_half_sandwich_soup: { id: 'dish_half_sandwich_soup', label: 'Half Sandwich & Soup', nouns: ['half sandwich and soup', 'sandwich and soup'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 36, mood: 0.04 } },
  dish_grilled_cheese_deli: { id: 'dish_grilled_cheese_deli', label: 'Deli Grilled Cheese', nouns: ['deli grilled cheese', 'grilled cheese'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 32, mood: 0.04 } },
  dish_lemonade_pitcher: { id: 'dish_lemonade_pitcher', label: 'Lemonade Pitcher', nouns: ['lemonade', 'lemonade pitcher'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.02 } },
  dish_turkey_club: { id: 'dish_turkey_club', label: 'Turkey Club', nouns: ['turkey club'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.05 } },

  // Emerald Kitchen (new) — the splurge: hunger values deliberately exceed
  // the usual ceiling, priced accordingly (prices in the menu entry).
  dish_ribeye: { id: 'dish_ribeye', label: 'Ribeye', nouns: ['ribeye', 'ribeye steak'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 65, mood: 0.08 } },
  dish_duck_breast: { id: 'dish_duck_breast', label: 'Duck Breast', nouns: ['duck breast', 'duck'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 60, mood: 0.08 } },
  dish_short_rib: { id: 'dish_short_rib', label: 'Braised Short Rib', nouns: ['short rib'], category: 'meal', stackable: true, maxStack: 2, perishable: { days: 1 }, consumable: { hunger: 62, mood: 0.08 } },
  dish_caesar_salad: { id: 'dish_caesar_salad', label: 'Emerald Caesar Salad', nouns: ['caesar salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 24, mood: 0.03 } },
  dish_butter_potatoes: { id: 'dish_butter_potatoes', label: 'Butter-Roasted Potatoes', nouns: ['butter potatoes'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04 } },
  dish_creme_brulee: { id: 'dish_creme_brulee', label: 'Crème Brûlée', nouns: ['creme brulee', 'creme'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 16, mood: 0.07 } },
  dish_chocolate_torte: { id: 'dish_chocolate_torte', label: 'Chocolate Torte', nouns: ['chocolate torte', 'torte'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 18, mood: 0.07 } },
  dish_house_red: { id: 'dish_house_red', label: 'House Red', nouns: ['house red', 'red wine'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { mood: 0.08, energy: -4 } },
  dish_espresso: { id: 'dish_espresso', label: 'Espresso', nouns: ['espresso'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { energy: 8 } },

  // Midnight Noodle (new)
  dish_tonkotsu_ramen: { id: 'dish_tonkotsu_ramen', label: 'Tonkotsu Ramen', nouns: ['tonkotsu ramen', 'ramen'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 52, mood: 0.06 } },
  dish_dan_dan: { id: 'dish_dan_dan', label: 'Dan Dan Noodles', nouns: ['dan dan noodles', 'dan dan'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 48, mood: 0.05 } },
  dish_spicy_wontons: { id: 'dish_spicy_wontons', label: 'Spicy Wontons', nouns: ['spicy wontons', 'wontons'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.05 } },
  dish_garlic_fried_rice: { id: 'dish_garlic_fried_rice', label: 'Garlic Fried Rice', nouns: ['garlic fried rice', 'fried rice'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.04 } },
  dish_chashu_bowl: { id: 'dish_chashu_bowl', label: 'Chashu Bowl', nouns: ['chashu bowl'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 2 }, consumable: { hunger: 46, mood: 0.05 } },
  dish_egg_ramen: { id: 'dish_egg_ramen', label: 'Egg Ramen', nouns: ['egg ramen', 'ramen'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 2 }, consumable: { hunger: 36, mood: 0.04 } },
  dish_gyoza_night: { id: 'dish_gyoza_night', label: 'Gyoza (Late Night)', nouns: ['gyoza'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 30, mood: 0.05 } },
  dish_boba_milk_tea: { id: 'dish_boba_milk_tea', label: 'Boba Milk Tea', nouns: ['boba milk tea', 'boba'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 12, mood: 0.05, energy: 4 } },
  dish_cucumber_salad: { id: 'dish_cucumber_salad', label: 'Cucumber Salad', nouns: ['cucumber salad'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 14, mood: 0.03 } },

  // Latenight Munchies (new)
  dish_loaded_nachos: { id: 'dish_loaded_nachos', label: 'Loaded Nachos', nouns: ['loaded nachos', 'nachos'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 40, mood: 0.05 } },
  dish_buffalo_wings: { id: 'dish_buffalo_wings', label: 'Buffalo Wings', nouns: ['buffalo wings', 'wings'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 42, mood: 0.05 } },
  dish_chili_cheese_tots: { id: 'dish_chili_cheese_tots', label: 'Chili Cheese Tots', nouns: ['chili cheese tots', 'tots'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 34, mood: 0.04 } },
  dish_hot_dog: { id: 'dish_hot_dog', label: 'Hot Dog', nouns: ['hot dog'], category: 'meal', stackable: true, maxStack: 4, perishable: { days: 1 }, consumable: { hunger: 26, mood: 0.03 } },
  dish_mozzarella_sticks: { id: 'dish_mozzarella_sticks', label: 'Mozzarella Sticks', nouns: ['mozzarella sticks'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 28, mood: 0.04 } },
  dish_poutine: { id: 'dish_poutine', label: 'Poutine', nouns: ['poutine'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 44, mood: 0.06 } },
  dish_fried_pickles: { id: 'dish_fried_pickles', label: 'Fried Pickles', nouns: ['fried pickles'], category: 'meal', stackable: true, maxStack: 6, perishable: { days: 1 }, consumable: { hunger: 22, mood: 0.04 } },
  dish_cheesesteak: { id: 'dish_cheesesteak', label: 'Cheesesteak', nouns: ['cheesesteak'], category: 'meal', stackable: true, maxStack: 3, perishable: { days: 1 }, consumable: { hunger: 48, mood: 0.05 } },
  dish_freezie: { id: 'dish_freezie', label: 'Freezie', nouns: ['freezie', 'slushie'], category: 'drink', stackable: true, maxStack: 6, perishable: { days: 2 }, consumable: { hunger: 10, mood: 0.04 } },

  // Snacks/drinks (directly consumable, no cooking needed)
  instant_noodles: { id: 'instant_noodles', label: 'Instant Noodles', nouns: ['instant noodles', 'ramen'], category: 'food', stackable: true, maxStack: 12, consumable: { hunger: 20 }, price: 2, buyQty: 4 },
  energy_drink: { id: 'energy_drink', label: 'Energy Drink', nouns: ['energy drink'], category: 'drink', stackable: true, maxStack: 12, consumable: { energy: 15, hygiene: -1 }, price: 3, buyQty: 4 },
  soda: { id: 'soda', label: 'Soda', nouns: ['soda', 'pop'], category: 'drink', stackable: true, maxStack: 12, consumable: { mood: 0.02 }, price: 2, buyQty: 6 },
  chips: { id: 'chips', label: 'Chips', nouns: ['chips'], category: 'food', stackable: true, maxStack: 8, consumable: { hunger: 12, mood: 0.02 }, price: 3, buyQty: 2 },
  granola_bar: { id: 'granola_bar', label: 'Granola Bar', nouns: ['granola bar'], category: 'food', stackable: true, maxStack: 12, consumable: { hunger: 15 }, price: 2, buyQty: 6 },
  beer: { id: 'beer', label: 'Beer', nouns: ['beer'], category: 'drink', stackable: true, maxStack: 12, consumable: { mood: 0.05, energy: -3 }, price: 3, buyQty: 6, tags: ['substance'] },
  wine: { id: 'wine', label: 'Wine', nouns: ['wine'], category: 'drink', stackable: true, maxStack: 4, consumable: { mood: 0.06, energy: -4 }, price: 12, buyQty: 1, tags: ['substance'] },
  orange_juice: { id: 'orange_juice', label: 'Orange Juice', nouns: ['orange juice', 'juice'], category: 'drink', stackable: true, maxStack: 4, perishable: { days: 10 }, consumable: { hunger: 3, mood: 0.01 }, price: 4, buyQty: 1 },
  bottled_water: { id: 'bottled_water', label: 'Bottled Water', nouns: ['water'], category: 'drink', stackable: true, maxStack: 24, price: 1, buyQty: 12 },
  frozen_pizza: { id: 'frozen_pizza', label: 'Frozen Pizza', nouns: ['pizza'], category: 'food', stackable: true, maxStack: 4, consumable: { hunger: 35, mood: 0.02 }, price: 7, buyQty: 1 },

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
  headphones: { id: 'headphones', label: 'Headphones', nouns: ['headphones'], category: 'electronics', stackable: false, maxStack: 1, price: 25, buyQty: 1 },
  book: { id: 'book', label: 'Book', nouns: ['book'], category: 'media', stackable: true, maxStack: 10, price: 12, buyQty: 1 },
  board_game: { id: 'board_game', label: 'Board Game', nouns: ['board game'], category: 'media', stackable: true, maxStack: 4, price: 20, buyQty: 1 },
  pain_reliever: { id: 'pain_reliever', label: 'Pain Reliever', nouns: ['pain reliever', 'ibuprofen', 'medicine'], category: 'medication', stackable: true, maxStack: 4, price: 5, buyQty: 1 },
  allergy_medicine: { id: 'allergy_medicine', label: 'Allergy Medicine', nouns: ['allergy medicine'], category: 'medication', stackable: true, maxStack: 4, price: 6, buyQty: 1 },
  flowers: { id: 'flowers', label: 'Flowers', nouns: ['flowers'], category: 'gift', stackable: true, maxStack: 3, price: 15, buyQty: 1 },
  chocolate_box: { id: 'chocolate_box', label: 'Box of Chocolates', nouns: ['chocolates', 'chocolate box'], category: 'gift', stackable: true, maxStack: 3, price: 10, buyQty: 1 },
};

// --- Recipes: what stove.cook_meal (DEFS.ACTIONS) draws from. Checked in
// declaration order by ITEMS' pickAvailableRecipe — the first one whose
// ingredients are on hand wins, so listing the cheap/common recipe first
// is a real design choice, not just documentation order. `leaves` are
// EFFECTS-DSL lines applied after cooking succeeds — always dirtying
// something, which is what gives the wash_dishes drive (P7) and the
// dishes boundary (P6) something real to react to. ---
const RECIPES = {
  pasta: {
    id: 'pasta', label: 'Pasta',
    ingredients: [{ defId: 'pasta_dry', qty: 1 }, { defId: 'tomato_sauce', qty: 1 }],
    produces: { defId: 'meal_pasta', qty: 2 },
    leaves: ['SET_OBJECT_STATE {sink} dishes many', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  omelette: {
    id: 'omelette', label: 'Omelette',
    ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'cheese', qty: 1 }],
    produces: { defId: 'meal_omelette', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  stirfry: {
    id: 'stirfry', label: 'Stir-fry',
    ingredients: [{ defId: 'rice', qty: 1 }, { defId: 'chicken_raw', qty: 1 }, { defId: 'onion', qty: 1 }],
    produces: { defId: 'meal_stirfry', qty: 2 },
    leaves: ['SET_OBJECT_STATE {sink} dishes many', 'SET_OBJECT_STATE {stove} burner filthy'],
  },
  sandwich: {
    id: 'sandwich', label: 'Sandwich',
    ingredients: [{ defId: 'bread', qty: 2 }, { defId: 'cheese', qty: 1 }],
    produces: { defId: 'meal_sandwich', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few'],
  },
  // --- New recipes (P8 content volume) ---
  bacon_eggs: {
    id: 'bacon_eggs', label: 'Bacon and Eggs',
    ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'bacon', qty: 1 }],
    produces: { defId: 'meal_breakfast', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  burger: {
    id: 'burger', label: 'Burger',
    ingredients: [{ defId: 'ground_beef', qty: 1 }, { defId: 'bread', qty: 1 }, { defId: 'onion', qty: 1 }],
    produces: { defId: 'meal_burger', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  salad: {
    id: 'salad', label: 'Salad',
    ingredients: [{ defId: 'lettuce', qty: 1 }, { defId: 'tomato', qty: 1 }, { defId: 'cheese', qty: 1 }],
    produces: { defId: 'meal_salad', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few'],
  },
  fried_rice: {
    id: 'fried_rice', label: 'Fried Rice',
    ingredients: [{ defId: 'rice', qty: 1 }, { defId: 'eggs', qty: 1 }, { defId: 'onion', qty: 1 }],
    produces: { defId: 'meal_fried_rice', qty: 2 },
    leaves: ['SET_OBJECT_STATE {sink} dishes many', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  soup: {
    id: 'soup', label: 'Tomato Soup',
    ingredients: [{ defId: 'tomato_sauce', qty: 1 }, { defId: 'onion', qty: 1 }, { defId: 'garlic', qty: 1 }],
    produces: { defId: 'meal_soup', qty: 2 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few', 'SET_OBJECT_STATE {stove} burner crusty'],
  },
  loaded_potato: {
    id: 'loaded_potato', label: 'Loaded Baked Potato',
    ingredients: [{ defId: 'potatoes', qty: 1 }, { defId: 'cheese', qty: 1 }, { defId: 'butter', qty: 1 }],
    produces: { defId: 'meal_potato', qty: 1 },
    leaves: ['SET_OBJECT_STATE {sink} dishes few'],
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
  ],
};

// ===== /SECTION: DEFS.WORLD =====
