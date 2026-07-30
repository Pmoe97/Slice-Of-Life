// ===== SECTION: DEFS.WORLD =====
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
    dirtyWhen: {}, cleanlinessWeight: 2,
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
    affords: ['clean.object', 'inspect.object'],
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
};

// --- Apartment layout: what's in each room at new-game spawn ---
// `ownerFrom: 'roomResident'` resolves at spawn time to whichever npc (or
// 'player') currently has residency in that room — see WORLD's
// resolvePlacementOwner. An entry with no owner marker spawns unowned
// (shared/house property), which is correct for shared furniture even
// inside a bedroom (the desk itself isn't "someone's" the way their diary
// or guitar is).
const APARTMENT_LAYOUT = {
  bedroom_player: [
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'desktop_computer' },
  ],
  bedroom_1: [
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'guitar', ownerFrom: 'roomResident' },
    { defId: 'diary', ownerFrom: 'roomResident' },
  ],
  bedroom_2: [
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
    { defId: 'jewelry_box', ownerFrom: 'roomResident' },
  ],
  bedroom_3: [
    { defId: 'bed', ownerFrom: 'roomResident' },
    { defId: 'desk' },
    { defId: 'wardrobe' },
    { defId: 'nightstand' },
  ],
  kitchen: [
    { defId: 'stove' }, { defId: 'fridge' }, { defId: 'sink_kitchen' },
    { defId: 'pantry' }, { defId: 'coffee_maker' }, { defId: 'kitchen_table' }, { defId: 'trash_kitchen' },
  ],
  bathroom: [
    { defId: 'shower' }, { defId: 'toilet' }, { defId: 'sink_bathroom' },
    { defId: 'bathroom_mirror' }, { defId: 'laundry_hamper' },
  ],
  living_room: [
    { defId: 'sofa' }, { defId: 'tv' }, { defId: 'coffee_table_lr' },
    { defId: 'bookshelf' }, { defId: 'lamp_lr' }, { defId: 'plant_lr' },
  ],
  hallway: [
    { defId: 'doormat' }, { defId: 'coat_rack' },
  ],
};

// ===== /SECTION: DEFS.WORLD =====
