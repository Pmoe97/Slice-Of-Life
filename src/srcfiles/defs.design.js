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
    { shape: 'pool', x: 372, y: 352, w: 96, h: 92, rot: 0,
      requires: { facility: 'pool_systems', minTier: 'functional' } },
    // Before the water works there is still a basin in the floor. Same
    // footprint, drawn as a dry hole, so the room reads as a pool room from
    // day one and the renovation fills it rather than conjuring it.
    { shape: 'pool', x: 372, y: 352, w: 96, h: 92, rot: 0, variant: 'empty',
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

// ===== /SECTION: DEFS.DESIGN =====
