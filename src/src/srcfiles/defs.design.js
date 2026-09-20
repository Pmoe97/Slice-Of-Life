// ===== SECTION: DEFS.DESIGN =====
// The interior. Two tables and one idea.
//
// THE IDEA: a piece of furniture is ONE OBJECT, not a pile of shapes.
// The floor plan's first furniture pass drew each item from a hand-written
// function that emitted absolute-coordinate SVG — which meant a bed could be
// drawn but never moved, resized or turned, because its pillow bar had no
// relationship to its frame beyond both being written on the same line. That
// is shape salad: it looks like an object and behaves like debris.
//
// Here a shape is a list of PARTS in a NORMALIZED 0..1 box. The placement
// supplies x/y/w/h/rot; every part scales and turns with it because every
// part is expressed as a fraction of the whole. Drag the corner of a bed and
// the pillow follows, because the pillow was never anywhere except "the top
// sixth of whatever this is".
//
// Authored in dev/designer.html. Open that rather than editing coordinates
// by hand — it is the only way to see what you are doing.

// --- Part kinds ---
//   rect     x, y, w, h  (+ optional rx for rounding)
//   ellipse  cx, cy, rx, ry
//   line     x1, y1, x2, y2
// All values are fractions of the placement's own box.
//
// `cls` picks a fill/stroke from the floor plan's palette:
//   frame   solid furniture       soft    upholstery / bedding
//   detail  hardware, fittings    felt    baize (pool table)
//   water   filled water          plant   greenery
//   glass   glazing               void    a hole in the thing (a pool basin)
const DESIGN_SHAPES = {
  // --- Sleeping ---
  bed: { label: 'Bed', w: 26, h: 34, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.05, cls: 'frame' },
    { kind: 'rect', x: 0.06, y: 0.27, w: 0.88, h: 0.68, rx: 0.04, cls: 'soft' },
    { kind: 'rect', x: 0.12, y: 0.05, w: 0.76, h: 0.17, rx: 0.05, cls: 'detail' },
  ] },
  bed_double: { label: 'Double Bed', w: 36, h: 34, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.04, cls: 'frame' },
    { kind: 'rect', x: 0.05, y: 0.27, w: 0.9, h: 0.68, rx: 0.03, cls: 'soft' },
    { kind: 'rect', x: 0.08, y: 0.05, w: 0.38, h: 0.17, rx: 0.05, cls: 'detail' },
    { kind: 'rect', x: 0.54, y: 0.05, w: 0.38, h: 0.17, rx: 0.05, cls: 'detail' },
  ] },
  nightstand: { label: 'Nightstand', w: 9, h: 9, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.12, cls: 'frame' },
    { kind: 'line', x1: 0.2, y1: 0.55, x2: 0.8, y2: 0.55, cls: 'detail' },
  ] },
  wardrobe: { label: 'Wardrobe', w: 22, h: 9, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'frame' },
    { kind: 'line', x1: 0.5, y1: 0, x2: 0.5, y2: 1, cls: 'detail' },
  ] },
  desk: { label: 'Desk', w: 24, h: 11, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.04, cls: 'frame' },
    { kind: 'rect', x: 0.62, y: 0.12, w: 0.32, h: 0.76, rx: 0.06, cls: 'detail' },
  ] },
  // Aspirations & Creative Careers Phase 6 (D22): a recording kit — a
  // small desk-sized surface with an interface block and two monitor
  // squares. DECOR_CATALOG_DEFS.recording_kit places it.
  recording_kit: { label: 'Recording Kit', w: 16, h: 9, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.05, cls: 'frame' },
    { kind: 'rect', x: 0.3, y: 0.2, w: 0.4, h: 0.6, rx: 0.08, cls: 'detail' },
    { kind: 'rect', x: 0.04, y: 0.15, w: 0.18, h: 0.7, rx: 0.1, cls: 'soft' },
    { kind: 'rect', x: 0.78, y: 0.15, w: 0.18, h: 0.7, rx: 0.1, cls: 'soft' },
  ] },
  bookshelf: { label: 'Bookshelf', w: 22, h: 7, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'frame' },
    { kind: 'line', x1: 0, y1: 0.5, x2: 1, y2: 0.5, cls: 'detail' },
  ] },

  // --- Seating / living ---
  sofa: { label: 'Sofa', w: 32, h: 14, parts: [
    { kind: 'rect', x: 0, y: 0.22, w: 1, h: 0.78, rx: 0.08, cls: 'soft' },
    { kind: 'rect', x: 0, y: 0, w: 1, h: 0.3, rx: 0.1, cls: 'frame' },
    { kind: 'rect', x: 0, y: 0.2, w: 0.1, h: 0.8, rx: 0.2, cls: 'frame' },
    { kind: 'rect', x: 0.9, y: 0.2, w: 0.1, h: 0.8, rx: 0.2, cls: 'frame' },
  ] },
  armchair: { label: 'Armchair', w: 13, h: 13, parts: [
    { kind: 'rect', x: 0, y: 0.22, w: 1, h: 0.78, rx: 0.14, cls: 'soft' },
    { kind: 'rect', x: 0, y: 0, w: 1, h: 0.3, rx: 0.16, cls: 'frame' },
  ] },
  coffee_table: { label: 'Coffee Table', w: 22, h: 12, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.1, cls: 'frame' },
  ] },
  rug: { label: 'Rug', w: 44, h: 30, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.03, cls: 'soft' },
    { kind: 'rect', x: 0.05, y: 0.07, w: 0.9, h: 0.86, rx: 0.02, cls: 'detail-outline' },
  ] },
  rug_round: { label: 'Round Rug', w: 30, h: 30, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5, cls: 'soft' },
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, cls: 'detail-outline' },
  ] },
  tv: { label: 'TV', w: 24, h: 4, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.08, cls: 'detail' },
  ] },

  // --- Dining / kitchen ---
  dining_table: { label: 'Dining Table', w: 36, h: 20, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.08, cls: 'frame' },
  ] },
  dining_table_round: { label: 'Round Table', w: 26, h: 26, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5, cls: 'frame' },
  ] },
  chair: { label: 'Chair', w: 8, h: 8, parts: [
    { kind: 'rect', x: 0.1, y: 0.15, w: 0.8, h: 0.85, rx: 0.15, cls: 'soft' },
    { kind: 'rect', x: 0.05, y: 0, w: 0.9, h: 0.2, rx: 0.1, cls: 'frame' },
  ] },
  counter: { label: 'Counter Run', w: 40, h: 10, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'frame' },
    { kind: 'line', x1: 0, y1: 0.82, x2: 1, y2: 0.82, cls: 'detail' },
  ] },
  stove: { label: 'Stove', w: 14, h: 12, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'ellipse', cx: 0.28, cy: 0.28, rx: 0.15, ry: 0.15, cls: 'detail' },
    { kind: 'ellipse', cx: 0.72, cy: 0.28, rx: 0.15, ry: 0.15, cls: 'detail' },
    { kind: 'ellipse', cx: 0.28, cy: 0.72, rx: 0.15, ry: 0.15, cls: 'detail' },
    { kind: 'ellipse', cx: 0.72, cy: 0.72, rx: 0.15, ry: 0.15, cls: 'detail' },
  ] },
  fridge: { label: 'Fridge', w: 13, h: 13, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'line', x1: 0.78, y1: 0.15, x2: 0.78, y2: 0.85, cls: 'detail' },
  ] },
  sink: { label: 'Sink', w: 14, h: 10, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.08, cls: 'frame' },
    { kind: 'ellipse', cx: 0.5, cy: 0.55, rx: 0.28, ry: 0.3, cls: 'detail' },
  ] },
  island: { label: 'Kitchen Island', w: 30, h: 16, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'rect', x: 0.08, y: 0.12, w: 0.84, h: 0.5, rx: 0.05, cls: 'detail-outline' },
  ] },

  // --- Bathroom / wet ---
  shower: { label: 'Shower', w: 15, h: 15, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.05, cls: 'frame' },
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.16, ry: 0.16, cls: 'detail' },
  ] },
  bathtub: { label: 'Bathtub', w: 30, h: 14, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.2, cls: 'frame' },
    { kind: 'rect', x: 0.06, y: 0.14, w: 0.88, h: 0.72, rx: 0.2, cls: 'void' },
  ] },
  toilet: { label: 'Toilet', w: 9, h: 13, parts: [
    { kind: 'rect', x: 0.1, y: 0, w: 0.8, h: 0.32, rx: 0.1, cls: 'frame' },
    { kind: 'ellipse', cx: 0.5, cy: 0.66, rx: 0.42, ry: 0.34, cls: 'frame' },
  ] },
  vanity: { label: 'Vanity', w: 16, h: 8, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.28, cls: 'detail' },
  ] },
  lockers: { label: 'Lockers', w: 22, h: 8, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'frame' },
    { kind: 'line', x1: 0.25, y1: 0, x2: 0.25, y2: 1, cls: 'detail' },
    { kind: 'line', x1: 0.5, y1: 0, x2: 0.5, y2: 1, cls: 'detail' },
    { kind: 'line', x1: 0.75, y1: 0, x2: 0.75, y2: 1, cls: 'detail' },
  ] },
  bench: { label: 'Bench', w: 22, h: 6, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.1, cls: 'frame' },
  ] },

  // --- Leisure ---
  // The pool is the reason `void` exists as a part class: a pool is a hole
  // with a surround, and drawing it as one filled rectangle makes it a
  // billiard table with delusions.
  pool: { label: 'Swimming Pool', w: 90, h: 70, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.03, cls: 'coping' },
    { kind: 'rect', x: 0.07, y: 0.09, w: 0.86, h: 0.82, rx: 0.02, cls: 'water' },
    { kind: 'line', x1: 0.35, y1: 0.09, x2: 0.35, y2: 0.91, cls: 'lane' },
    { kind: 'line', x1: 0.65, y1: 0.09, x2: 0.65, y2: 0.91, cls: 'lane' },
  ] },
  lounger: { label: 'Lounger', w: 9, h: 22, parts: [
    { kind: 'rect', x: 0, y: 0.25, w: 1, h: 0.75, rx: 0.2, cls: 'soft' },
    { kind: 'rect', x: 0.05, y: 0, w: 0.9, h: 0.3, rx: 0.3, cls: 'frame' },
  ] },
  pool_table: { label: 'Pool Table', w: 32, h: 18, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'rect', x: 0.06, y: 0.1, w: 0.88, h: 0.8, rx: 0.03, cls: 'felt' },
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.09, cls: 'detail' },
  ] },
  treadmill: { label: 'Treadmill', w: 13, h: 22, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'rect', x: 0.12, y: 0.28, w: 0.76, h: 0.66, rx: 0.04, cls: 'detail' },
  ] },
  weight_rack: { label: 'Weight Rack', w: 20, h: 8, parts: [
    { kind: 'rect', x: 0, y: 0.3, w: 1, h: 0.4, cls: 'frame' },
    { kind: 'ellipse', cx: 0.12, cy: 0.5, rx: 0.12, ry: 0.45, cls: 'detail' },
    { kind: 'ellipse', cx: 0.88, cy: 0.5, rx: 0.12, ry: 0.45, cls: 'detail' },
  ] },
  yoga_mat: { label: 'Yoga Mat', w: 9, h: 20, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.15, cls: 'soft' },
  ] },

  // --- Utility / decor ---
  washer: { label: 'Washer', w: 12, h: 12, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.06, cls: 'frame' },
    { kind: 'ellipse', cx: 0.5, cy: 0.55, rx: 0.26, ry: 0.26, cls: 'detail' },
  ] },
  plant: { label: 'Plant', w: 9, h: 9, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.48, ry: 0.48, cls: 'plant' },
  ] },
  plant_large: { label: 'Large Plant', w: 14, h: 14, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5, cls: 'plant' },
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22, cls: 'detail' },
  ] },
  lamp: { label: 'Floor Lamp', w: 7, h: 7, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5, cls: 'detail' },
  ] },
  shelf: { label: 'Shelf', w: 16, h: 5, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'frame' },
  ] },
  doormat: { label: 'Doormat', w: 14, h: 7, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.08, cls: 'soft' },
  ] },
  desk_chair: { label: 'Desk Chair', w: 9, h: 9, parts: [
    { kind: 'ellipse', cx: 0.5, cy: 0.55, rx: 0.45, ry: 0.45, cls: 'soft' },
    { kind: 'rect', x: 0.1, y: 0, w: 0.8, h: 0.22, rx: 0.1, cls: 'frame' },
  ] },
  glass_partition: { label: 'Glass Partition', w: 40, h: 3, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, cls: 'glass' },
  ] },
  // Phase 17 (D110): the desk's monitor, so arranging the player's own
  // bedroom doesn't make it vanish — every APARTMENT_LAYOUT fixture in that
  // room now resolves to a shape via BASE_FURNITURE_SHAPES below.
  desktop_computer: { label: 'Computer', w: 10, h: 6, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.08, cls: 'frame' },
    { kind: 'rect', x: 0.12, y: 0.14, w: 0.76, h: 0.6, rx: 0.04, cls: 'detail' },
  ] },

  // --- The player's own work ---
  // Aspirations & Creative Careers Phase 16 (D54): a finished piece hung on
  // a wall — a frame around a canvas. The canvas part's class is `art`, the
  // one part class whose fill the renderer takes from the PLACEMENT
  // (place.fill: the piece's seeded swatch, D80) rather than the palette,
  // so two pieces on two walls are not the same picture. Placed by
  // works.js's hangWork into a wall slot (wallSlotsFor below), never by
  // the packer; `meta.workId` on the placement links it to the work.
  player_art: { label: 'Framed Piece', w: 12, h: 8, parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, rx: 0.04, cls: 'frame' },
    { kind: 'rect', x: 0.1, y: 0.14, w: 0.8, h: 0.72, cls: 'art' },
  ] },
};

// --- Style (Phase 16, D52) ---
// What a shape says about a room's taste, in the SAME vocabulary an NPC's
// occupation.styleLean already speaks (config.js's OCCUPATION_POOL:
// cozy / plain / minimal / bold / studious / practical / ...) — so "does
// this room suit them" is one vocabulary matched against itself, not a
// second taste system. A shape with no row (a toilet) is a placement that
// counts for density and says nothing about style. roomStyleWeights sums
// these per room; notice.js's roomDesignQuality reads the sum against the
// NPC's lean.
const DESIGN_STYLE_TAGS = {
  bed: ['soft', 'plain'], bed_double: ['soft', 'elegant'], nightstand: ['plain'], wardrobe: ['plain', 'neutral'],
  desk: ['studious', 'practical'], recording_kit: ['edgy', 'studious'], bookshelf: ['studious', 'cozy'],
  sofa: ['casual', 'soft'], armchair: ['cozy', 'soft'], coffee_table: ['casual', 'neutral'],
  rug: ['cozy', 'soft'], rug_round: ['cozy', 'bold'], tv: ['casual'],
  dining_table: ['classic', 'neutral'], dining_table_round: ['classic', 'elegant'], chair: ['plain', 'neutral'],
  counter: ['practical'], stove: ['practical'], fridge: ['practical'], sink: ['practical'], island: ['sharp', 'elegant'],
  bathtub: ['elegant', 'soft'], vanity: ['elegant'], lockers: ['sturdy', 'practical'], bench: ['sturdy', 'plain'],
  pool: ['bold', 'elegant'], lounger: ['casual', 'soft'], pool_table: ['bold', 'casual'],
  treadmill: ['sporty', 'practical'], weight_rack: ['sporty', 'sturdy'], yoga_mat: ['sporty', 'soft'],
  washer: ['practical'], plant: ['soft', 'cozy'], plant_large: ['bold', 'soft'], lamp: ['cozy', 'minimal'],
  shelf: ['minimal', 'plain'], doormat: ['plain', 'practical'], desk_chair: ['practical', 'minimal'],
  glass_partition: ['sharp', 'minimal'], player_art: ['bold', 'elegant'],
};

// --- Authored placements ---
// ROOM_DECOR[roomId] is a list of placed shapes. When a room has one, it is
// drawn INSTEAD of the automatic perimeter layout — so a room is either
// designed or auto-arranged, never a confusing half of each.
//
//   { shape, x, y, w, h, rot }            rot in degrees, about the centre
//   { ..., requires: { facility, minTier } }   only drawn once the facility
//                                              has reached that tier
//
// `requires` is what lets a design describe the FINISHED room: lay the pool
// out as it will be when the water works, and the basin simply is not drawn
// until the crew has been. One design, revealed by renovation.
const ROOM_DECOR = {
  pool_room: [
    // The pool takes the south-east of the room and most of its area, with
    // circulation kept along the north and west walls — which is how a real
    // pool room is laid out, and the reverse of what the auto-placer did.
    // defId (npc-avatar-liveliness Phase 2, D9): the shape↔object link the
    // anchor resolver needs to match the drawn pool to the defId an NPC
    // swims in. Additive — renderDesignShape/decorVisible ignore it; only
    // resolveObjectStandPoint reads it.
    { shape: 'pool', defId: 'swimming_pool', x: 372, y: 352, w: 96, h: 92, rot: 0,
      requires: { facility: 'pool_systems', minTier: 'functional' } },
    // Before the water works there is still a basin in the floor. Same
    // footprint, drawn as a dry hole, so the room reads as a pool room from
    // day one and the renovation fills it rather than conjuring it.
    { shape: 'pool', defId: 'swimming_pool', x: 372, y: 352, w: 96, h: 92, rot: 0, variant: 'empty',
      requires: { facility: 'pool_systems', maxTier: 'broken' } },
    { shape: 'lounger', x: 336, y: 356, w: 9, h: 22, rot: 0 },
    { shape: 'lounger', x: 336, y: 384, w: 9, h: 22, rot: 0 },
    { shape: 'plant_large', x: 334, y: 414, w: 14, h: 14, rot: 0 },
    { shape: 'bench', x: 372, y: 326, w: 22, h: 6, rot: 0 },
    { shape: 'plant', x: 458, y: 324, w: 9, h: 9, rot: 0 },
  ],
};

// Does a placement's gate pass, given the live upgrade state? A placement
// with no `requires` is always drawn. Unknown facilities fail CLOSED — a
// gate that cannot be evaluated is not a gate.
const FACILITY_TIER_ORDER = ['broken', 'functional', 'upgraded'];
function decorVisible(placement, gameState) {
  const req = placement && placement.requires;
  if (!req) return true;
  const tier = gameState?.world?.upgrades?.[req.facility]?.tier;
  if (!tier) return false;
  const at = FACILITY_TIER_ORDER.indexOf(tier);
  if (at < 0) return false;
  if (req.minTier && at < FACILITY_TIER_ORDER.indexOf(req.minTier)) return false;
  if (req.maxTier && at > FACILITY_TIER_ORDER.indexOf(req.maxTier)) return false;
  return true;
}

// --- What a room's design IS (aspirations-and-creative-careers Phase 16, D51–D54) ---
// Three sources, one reader. A room's drawn contents come from:
//   1. world.roomDecorOverrides[roomId] — the PLAYER's arrangement of the
//      room, a ROOM_DECOR-shaped array (D53: the studio's own data shape,
//      kept literally). Wins over 2 and 3 when present. Phase 17's designer
//      writes it; this phase reads it.
//   2. ROOM_DECOR[roomId] — the authored design (the pool room).
//   3. Neither → the perimeter packer (defs.placement.js), which is not a
//      design and counts for nothing here.
// PLUS, in every case, the objects the player has placed with a `pos` —
// decor bought through the Home app (computer.js's placeDecorItem) and
// pieces hung on a wall (works.js's hangWork). Those were already the
// game's one player-placement store (decor-economy plan D4: real object
// instances, so anchors, cleanliness and signals find them); they are
// read here as placements rather than copied into a second store.
//
// roomDesignBase — source 1 or 2 with its provenance, or null (auto).
// roomPlacedDecor — the pos-carrying objects as placements
//                   ({ shape, defId, objId, x, y, w, h, rot, meta }).
// decorFor        — everything drawn as a design: the visible base entries
//                   (decorVisible) then the placed objects. [] when the
//                   room is auto-arranged with nothing placed.
// roomDesigned    — decorFor is non-empty. The D51/D52 predicate.
// All pure over gameState; no DOM (invariant 7).
function roomDesignBase(gameState, roomId) {
  const over = gameState?.world?.roomDecorOverrides?.[roomId];
  if (Array.isArray(over) && over.length > 0) return { source: 'override', placements: over };
  const authored = (typeof ROOM_DECOR !== 'undefined' && ROOM_DECOR[roomId]) || null;
  if (authored && authored.length > 0) return { source: 'authored', placements: authored };
  return null;
}
function roomPlacedDecor(gameState, roomId) {
  const bucket = gameState?.objects?.[`room_${roomId}`] || {};
  const out = [];
  for (const o of Object.values(bucket)) {
    if (!o || !o.pos || !Number.isFinite(o.pos.x) || !Number.isFinite(o.pos.y)) continue;
    const shape = o.defId === 'player_art' ? 'player_art'
      : (typeof DECOR_CATALOG_DEFS !== 'undefined' && DECOR_CATALOG_DEFS[o.defId] && DECOR_CATALOG_DEFS[o.defId].shape) || null;
    if (!shape || !DESIGN_SHAPES[shape]) continue;
    out.push({ shape, defId: o.defId, objId: o.id, x: o.pos.x, y: o.pos.y, w: o.pos.w, h: o.pos.h, rot: o.pos.rot || 0, meta: o.meta || {} });
  }
  return out;
}
function decorFor(gameState, roomId) {
  const base = roomDesignBase(gameState, roomId);
  const shown = base ? base.placements.filter(p => decorVisible(p, gameState)) : [];
  return shown.concat(roomPlacedDecor(gameState, roomId));
}
function roomDesigned(gameState, roomId) {
  return decorFor(gameState, roomId).length > 0;
}
// How much of the room's design is the PLAYER's doing: override entries
// plus placed objects. The authored pool room is designed (D51's comfort
// applies) but not by the player — so it is not an opinion subject about
// the player (D52 reads this), and Compass's "Design a room" counts it
// for nothing.
function roomPlayerDesignCount(gameState, roomId) {
  const over = gameState?.world?.roomDecorOverrides?.[roomId];
  return (Array.isArray(over) ? over.length : 0) + roomPlacedDecor(gameState, roomId).length;
}
// Density in [0, 1]: placements over HOME_TUNING.densityRef, capped. The
// one scale both the comfort impulse (D51) and the opinion (D52) read.
function roomDecorDensity(gameState, roomId) {
  const n = decorFor(gameState, roomId).length;
  const ref = (typeof HOME_TUNING !== 'undefined' && HOME_TUNING.densityRef) || 8;
  return Math.max(0, Math.min(1, n / ref));
}
// The room's style, as tag weights summing to ≤ 1: each placement is one
// vote split across its DESIGN_STYLE_TAGS row, over the placement count.
// {} for an undesigned room. A placement with no row still divides the
// pot (a room half full of untagged fixtures is half untasteful, not
// louder about the half that has taste).
function roomStyleWeights(gameState, roomId) {
  const places = decorFor(gameState, roomId);
  const weights = {};
  if (places.length === 0) return weights;
  for (const p of places) {
    const tags = DESIGN_STYLE_TAGS[p.shape] || [];
    for (const t of tags) weights[t] = (weights[t] || 0) + 1 / (tags.length * places.length);
  }
  for (const t of Object.keys(weights)) weights[t] = Math.round(weights[t] * 1000) / 1000;
  return weights;
}
// A short version stamp for "this design" — the room_design subject key's
// version (notice.js), so a room an NPC has judged is judged again only
// when it materially changes: the multiset of shapes plus which pieces
// hang there. Nudging a sofa two units is the same design; adding a plant
// or a painting is a new one. Pure; base-36 of a string hash.
function roomDesignVersion(gameState, roomId) {
  const places = decorFor(gameState, roomId);
  if (places.length === 0) return null;
  const sig = places.map(p => `${p.shape}${p.meta && p.meta.workId ? '@' + p.meta.workId : ''}`).sort().join('|');
  let h = 2166136261;
  for (let i = 0; i < sig.length; i++) { h ^= sig.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
// D51 — the comfort a rest or a sleep in this room grants: designedRoomMood
// at full density, a sliver of it for one plant, nothing for an
// auto-arranged room. Pure; world.js's applyDesignedRoomComfort pushes it.
function designedRoomComfort(gameState, roomId) {
  if (!roomDesigned(gameState, roomId)) return 0;
  const T = (typeof HOME_TUNING !== 'undefined' && HOME_TUNING) || { designedRoomMood: 0.02 };
  return Math.round(T.designedRoomMood * roomDecorDensity(gameState, roomId) * 10000) / 10000;
}

// --- Wall slots (Phase 16, D54) ---
// Where a piece can hang: one slot centred on each outer wall of the room's
// largest rectangle, the framed footprint HOME_TUNING.wallSlot just inside
// the wall line. A wall whose outside is another rect of the SAME room (the
// seam of an L-shaped living room) is not a wall and offers no slot. The
// full editor is Phase 17; this is the minimal "pick a wall" placement the
// plan asks for. Pure geometry over ROOM_LAYOUT.
//   → [{ id: 'n'|'e'|'s'|'w', label, x, y, w, h, rot }]
function wallSlotsFor(roomId) {
  const rects = (typeof ROOM_LAYOUT !== 'undefined' && ROOM_LAYOUT[roomId]) || [];
  if (rects.length === 0) return [];
  const T = (typeof HOME_TUNING !== 'undefined' && HOME_TUNING.wallSlot) || { w: 12, h: 8, inset: 1.5 };
  const [rx, ry, rw, rh] = rects.slice().sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const inside = (px, py) => rects.some(([x, y, w, h]) => px > x && px < x + w && py > y && py < y + h);
  const walls = [
    { id: 'n', label: 'North wall', probe: [rx + rw / 2, ry - 1],      x: rx + rw / 2 - T.w / 2, y: ry + T.inset,          w: T.w, h: T.h, rot: 0 },
    { id: 'e', label: 'East wall',  probe: [rx + rw + 1, ry + rh / 2], x: rx + rw - T.inset - T.h, y: ry + rh / 2 - T.w / 2, w: T.h, h: T.w, rot: 0 },
    { id: 's', label: 'South wall', probe: [rx + rw / 2, ry + rh + 1], x: rx + rw / 2 - T.w / 2, y: ry + rh - T.inset - T.h, w: T.w, h: T.h, rot: 0 },
    { id: 'w', label: 'West wall',  probe: [rx - 1, ry + rh / 2],      x: rx + T.inset,          y: ry + rh / 2 - T.w / 2, w: T.h, h: T.w, rot: 0 },
  ];
  return walls
    .filter(s => !inside(s.probe[0], s.probe[1]) && s.w <= rw && s.h <= rh)
    .map(({ probe, ...s }) => ({ ...s, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 }));
}
// The hung piece occupying a slot, if any (a room object with defId
// player_art whose meta.slot names it), or null.
function wallSlotOccupant(gameState, roomId, slotId) {
  const bucket = gameState?.objects?.[`room_${roomId}`] || {};
  return Object.values(bucket).find(o => o && o.defId === 'player_art' && o.meta && o.meta.slot === slotId) || null;
}

// --- The in-game designer (Phase 17, D55) ---
// normalizePlacement is the ONE choke point both the Home app's Studio
// (ui.computer.js) and the dev tool (dev/designer.html, synced by
// dev/sync-designer.js — verify-plan.js §8 fails if the two drift) run a
// candidate x/y/w/h/rot through: grid-snap, a size floor so nothing shrinks
// to a point, a 15°-step rotation, and — only when a roomId is given — a
// reject-outside-the-room check against ROOM_LAYOUT. Returns null on
// rejection (the caller keeps whatever it had); rotation is never bounds-
// checked, matching every other reader of a placement's w/h (decorVisible,
// resolveObjectStandPoint) which already ignore rot for geometry. Pure.
function normalizePlacement(pos, opts = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)
      || !Number.isFinite(pos.w) || !Number.isFinite(pos.h)) return null;
  const { snap = true, gridSize = 5, minSize = 2, rotStep = 15, roomId = null } = opts;
  const G = (v) => (snap ? Math.round(v / gridSize) * gridSize : Math.round(v));
  const out = {
    x: G(pos.x), y: G(pos.y),
    w: Math.max(minSize, G(pos.w)), h: Math.max(minSize, G(pos.h)),
    rot: (Math.round((Number(pos.rot) || 0) / rotStep) * rotStep % 360 + 360) % 360,
  };
  if (roomId && typeof ROOM_LAYOUT !== 'undefined') {
    const rects = ROOM_LAYOUT[roomId];
    if (rects && rects.length > 0 && !placementFitsRoom(out, rects)) return null;
  }
  return out;
}
// All four corners of the placement's (unrotated) box must land inside the
// SAME-or-different rects of the room's union — good enough to reject "off
// the map entirely" without a full polygon-coverage solver; every other
// consumer of a placement's box (decorVisible, resolveObjectStandPoint,
// roomDesignVersion) already treats it as axis-aligned the same way.
function placementFitsRoom(pos, rects) {
  const corners = [
    [pos.x, pos.y], [pos.x + pos.w, pos.y],
    [pos.x, pos.y + pos.h], [pos.x + pos.w, pos.y + pos.h],
  ];
  return corners.every(([px, py]) => rects.some(([rx, ry, rw, rh]) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh));
}

// --- "Arrange base furniture" (Phase 17, Handoff (c)) ---
// The player's own bed/desk/stove/etc. are ordinary room-bucket objects
// with NO `pos` — resolveAutoPlacements packs them procedurally, the same
// as an un-placed bought decor item. "Arranging" a room snapshots that
// packing into a ROOM_DECOR-shaped roomDecorOverrides[roomId] entry per
// object (by defId, exactly the pool room's `{ shape, defId, x, y, w, h }`
// pattern — D106 already made resolveObjectStandPoint match overrides by
// defId for this reason). A defId with no resolvable shape is left out of
// the snapshot and simply stops being drawn once the room is arranged —
// the SAME accepted gap the shipped pool_room already has for pool_pump/
// sauna (neither has a ROOM_DECOR entry either); this table covers every
// fixture in the player's own rooms (APARTMENT_LAYOUT) so that gap never
// actually bites there.
const BASE_FURNITURE_SHAPES = {
  coffee_table_lr: 'coffee_table', lamp_lr: 'lamp', plant_lr: 'plant', plant_balcony: 'plant',
  sink_bathroom: 'sink', sink_kitchen: 'sink', weight_set: 'weight_rack', changing_bench: 'bench',
  bathroom_mirror: 'shelf', coat_rack: 'shelf', shoe_rack: 'shelf', dryer: 'washer',
  laundry_hamper: 'shelf', kitchen_table: 'dining_table', balcony_table: 'dining_table_round',
  study_desk: 'desk', study_bookshelf: 'bookshelf', tv_basic: 'tv',
};
function baseFurnitureShape(defId) {
  if (typeof DESIGN_SHAPES !== 'undefined' && DESIGN_SHAPES[defId]) return defId;
  const alias = BASE_FURNITURE_SHAPES[defId];
  return (alias && typeof DESIGN_SHAPES !== 'undefined' && DESIGN_SHAPES[alias]) ? alias : null;
}
// The room's current auto-packed base, as override-shaped candidates —
// what startRoomArrange (computer.js) snapshots. Pure; [] for a room with
// nothing to arrange or with no ROOM_LAYOUT entry. Deliberately does not
// consult roomDesignBase — arranging only ever starts from the AUTO layout
// (an already-authored or already-overridden room has nothing to snapshot
// from here; computer.js's startRoomArrange refuses those separately).
function roomAutoBaseCandidates(gameState, roomId) {
  const placements = (typeof resolveAutoPlacements === 'function' && resolveAutoPlacements(gameState, roomId)) || [];
  const out = [];
  for (const p of placements) {
    const shape = baseFurnitureShape(p.defId);
    if (!shape) continue;
    out.push({ shape, defId: p.defId, x: p.x, y: p.y, w: p.w, h: p.h, rot: 0 });
  }
  return out;
}

// ===== /SECTION: DEFS.DESIGN =====
