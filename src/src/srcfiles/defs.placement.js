// defs.placement.js — shared furniture placement (npc-avatar-liveliness
// Phase 2, D8/D9/D10). The single source for where furniture IS, consumed by
// BOTH the floor-plan renderer (draws it) and the action-anchor resolver
// (walks NPCs to it), so the furniture drawn and the furniture walked to are
// the same coordinates by construction (invariant 2).
//
// FP_FOOTPRINTS moved here out of render.js (D8): render.js is deliberately
// absent from loadgame.js's ORDER ("stops before render/ui"), so a packer
// that still reached into render.js could not be verified by a Node harness
// at all. render.js keeps only the draw() half and merges these footprints
// onto its entries at load.
//
// Registered in BOTH index.html's load list (right after defs.design.js, with
// a ?v= bump) and loadgame.js's ORDER, in the same commit (invariant 6).

// The {w, h} footprint table the packer reads and the anchor resolver uses.
// Extracted VERBATIM from render.js's FP_FURNITURE (2026-08-29) so the
// picture cannot change.
const FP_FOOTPRINTS = {
  bed: { w: 26, h: 34 },
  desk: { w: 24, h: 11 },
  study_desk: { w: 24, h: 11 },
  wardrobe: { w: 20, h: 9 },
  nightstand: { w: 9, h: 9 },
  bookshelf: { w: 22, h: 7 },
  study_bookshelf: { w: 22, h: 7 },
  desktop_computer: { w: 10, h: 6 },
  shower: { w: 14, h: 14 },
  toilet: { w: 9, h: 12 },
  sink_bathroom: { w: 11, h: 8 },
  sink_kitchen: { w: 14, h: 10 },
  bathroom_mirror: { w: 12, h: 3 },
  lockers: { w: 20, h: 8 },
  changing_bench: { w: 20, h: 6 },
  stove: { w: 14, h: 12 },
  fridge: { w: 12, h: 12 },
  freezer: { w: 10, h: 12 },
  dishwasher: { w: 10, h: 10 },
  microwave: { w: 8, h: 6 },
  pantry: { w: 11, h: 10 },
  kitchen_table: { w: 20, h: 14 },
  dining_table: { w: 34, h: 20 },
  coffee_table_lr: { w: 20, h: 11 },
  balcony_table: { w: 14, h: 14 },
  trash_kitchen: { w: 7, h: 7 },
  coffee_maker: { w: 6, h: 5 },
  sofa: { w: 30, h: 13 },
  armchair: { w: 12, h: 12 },
  tv: { w: 22, h: 4 },
  pool_table: { w: 30, h: 17 },
  game_console: { w: 8, h: 5 },
  dartboard: { w: 8, h: 8 },
  treadmill: { w: 12, h: 20 },
  weight_set: { w: 14, h: 7 },
  yoga_mat: { w: 8, h: 18 },
  swimming_pool: { w: 70, h: 50 },
  pool_loungers: { w: 8, h: 18 },
  pool_pump: { w: 8, h: 7 },
  sauna: { w: 24, h: 22 },
  plant_lr: { w: 7, h: 7 },
  plant_balcony: { w: 7, h: 7 },
  lamp_lr: { w: 6, h: 6 },
  washer: { w: 11, h: 11 },
  dryer: { w: 11, h: 11 },
  laundry_hamper: { w: 8, h: 8 },
  doormat: { w: 12, h: 6 },
  shoe_rack: { w: 12, h: 5 },
  coat_rack: { w: 6, h: 6 },
  rug: { w: 40, h: 26 },
};

// shape-id → symbol-id aliases (decor-economy plan Phase 2, D10). Moved here
// with the footprints: resolveAutoPlacements must resolve a placed decor
// object's footprint to pack it, and it cannot read render.js. render.js's
// FP_FURNITURE build loop reads the same const.
const DECOR_SYMBOL_ALIASES = {
  sofa_basic: 'sofa', armchair: 'armchair', coffee_table: 'coffee_table_lr',
  tv_basic: 'tv', tv_stand: 'bookshelf', rug: 'rug', floor_lamp: 'lamp_lr',
  plant: 'plant_lr', bed_basic: 'bed', nightstand: 'nightstand',
  wardrobe: 'wardrobe', desk: 'desk', desk_chair: 'armchair',
  dining_table: 'dining_table', dining_chair: 'armchair',
  bookshelf: 'bookshelf', shelf: 'bookshelf',
  // Aspirations & Creative Careers Phase 6 (D22): the recording kit packs
  // like the desktop computer it sits beside.
  recording_kit: 'desktop_computer',
};

// Resolve an object defId to its {w, h} footprint, following the decor-shape
// alias chain. null when nothing is drawn for the defId (floor, phone, diary,
// doors — no useful top-down silhouette, and the packer skips them, exactly
// as renderAutoFurniture always has).
function fpFootprint(defId) {
  let cur = defId;
  const seen = new Set();
  while (cur && !FP_FOOTPRINTS[cur] && DECOR_SYMBOL_ALIASES[cur] && !seen.has(cur)) {
    seen.add(cur);
    cur = DECOR_SYMBOL_ALIASES[cur];
  }
  return FP_FOOTPRINTS[cur] || null;
}

// The deterministic perimeter packer, extracted VERBATIM from render.js's
// renderAutoFurniture (2026-08-29) and returned as DATA instead of SVG, so
// the anchor resolver reads exactly the footprints the renderer draws. Pure:
// reads ROOM_LAYOUT / gs.objects / FP_FOOTPRINTS only — no rng, no clock, no
// model. Returns [{ defId, objId, x, y, w, h }] in draw order, [] when the
// room has no drawable objects, or null when the room is not in ROOM_LAYOUT.
function resolveAutoPlacements(gs, roomId) {
  const rects = ROOM_LAYOUT[roomId] || [];
  if (rects.length === 0) return null;
  const bucket = gs?.objects?.[`room_${roomId}`] || {};
  // Aspirations & Creative Careers Phase 16 (D53): an object the player
  // PLACED (a `pos` — Home-app decor, a hung piece) is drawn where they
  // put it (render.js's renderPlacedDecor via defs.design.js's
  // roomPlacedDecor) and anchored there (resolveObjectStandPoint's first
  // branch, below), so it no longer claims a wall here — the packer was
  // drawing a placed sofa on the north wall while NPCs walked to where it
  // actually stood, the one drawn≠walked gap in invariant 2.
  const items = Object.values(bucket)
    .filter(o => fpFootprint(o.defId) && !(o.pos && Number.isFinite(o.pos.x) && Number.isFinite(o.pos.y)))
    .sort((a, b) => {
      const A = fpFootprint(a.defId), B = fpFootprint(b.defId);
      return (B.w * B.h) - (A.w * A.h);   // biggest first: they claim the good walls
    });
  if (items.length === 0) return [];

  // The largest rect is the room's body; the notch on an L-shape is left
  // empty rather than half-filled with a bed that overlaps a wall.
  const [rx, ry, rw, rh] = rects.slice().sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const inset = 3;
  const walls = [
    { cursor: rx + inset, limit: rx + rw - inset, place: (d, fw, fh) => [d, ry + inset] },                  // top
    { cursor: ry + inset, limit: ry + rh - inset, place: (d, fw, fh) => [rx + rw - inset - fw, d] },        // right
    { cursor: rx + inset, limit: rx + rw - inset, place: (d, fw, fh) => [d, ry + rh - inset - fh] },        // bottom
    { cursor: ry + inset, limit: ry + rh - inset, place: (d, fw, fh) => [rx + inset, d] },                  // left
  ];
  const placements = [];
  let wi = 0;
  for (const obj of items) {
    const fp = fpFootprint(obj.defId);
    // Rotate the footprint to lie along the wall it is going on.
    const along = (wi % 2 === 0);
    const fw = along ? fp.w : fp.h;
    const fh = along ? fp.h : fp.w;
    let placed = false;
    for (let tries = 0; tries < 4 && !placed; tries++) {
      const wall = walls[wi % 4];
      const span = along ? fw : fh;
      if (wall.cursor + span <= wall.limit) {
        const [fx, fy] = wall.place(wall.cursor, fw, fh);
        placements.push({ defId: obj.defId, objId: obj.id, x: fx, y: fy, w: fw, h: fh });
        wall.cursor += span + 2;
        placed = true;
      }
      wi++;
    }
    if (!placed) break;   // room is full; the rest simply are not drawn
  }
  return placements;
}

// D10 (npc-avatar-liveliness): the stand-point at an object's edge nearest
// the room's centroid, pushed OUTWARD by standInset so the NPC *uses* the
// object (stands at the pool's edge, at the stove) rather than overlapping
// its drawn centre. 'center' anchorMode (lie-on/sit-in surfaces: bed, sofa)
// returns the object's centre instead — standing ON the surface is the point.
const DEFAULT_STAND_INSET = 4;

function objectStandPoint(rect, roomCx, roomCy, inset) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const edges = [
    { mx: cx, my: rect.y, nx: 0, ny: -1 },
    { mx: rect.x + rect.w, my: cy, nx: 1, ny: 0 },
    { mx: cx, my: rect.y + rect.h, nx: 0, ny: 1 },
    { mx: rect.x, my: cy, nx: -1, ny: 0 },
  ];
  let best = edges[0], bestD = Infinity;
  for (const e of edges) {
    const d = Math.hypot(e.mx - roomCx, e.my - roomCy);
    if (d < bestD) { bestD = d; best = e; }
  }
  return { x: best.mx + best.nx * inset, y: best.my + best.ny * inset };
}

// D9 priority: placed obj.pos (player-placed decor) → authored ROOM_DECOR
// placement for the defId → resolveAutoPlacements footprint for the defId →
// room centroid. Branching authored-vs-auto exactly as renderRoomFurniture
// does (invariant 2): in an authored room nothing resolveAutoPlacements
// produces is drawn, so it must not be used as the anchor either; in an auto
// room ROOM_DECOR is never consulted. Applies the D10 offset at every tier
// except 'center'. obj may be null → room centroid.
function resolveObjectStandPoint(gs, roomId, obj) {
  if (!roomId || !ROOMS[roomId]) return null;
  const [rcx, rcy] = roomCentre(roomId);
  let rect = null;
  if (obj && obj.pos && Number.isFinite(obj.pos.x) && Number.isFinite(obj.pos.y)
      && Number.isFinite(obj.pos.w) && Number.isFinite(obj.pos.h)) {
    rect = { x: obj.pos.x, y: obj.pos.y, w: obj.pos.w, h: obj.pos.h };
  } else if (obj) {
    // Phase 16 (D53): the player's override of the room wins over the
    // authored ROOM_DECOR entry here exactly as it does in the renderer
    // (roomDesignBase is the one reader both branch on).
    const base = typeof roomDesignBase === 'function' ? roomDesignBase(gs, roomId) : null;
    const decor = base ? base.placements : ((typeof ROOM_DECOR !== 'undefined' && ROOM_DECOR[roomId]) || null);
    if (decor && decor.length > 0) {
      const place = decor.find(p => p.defId === obj.defId);
      if (place) rect = { x: place.x, y: place.y, w: place.w, h: place.h };
    } else {
      const placements = resolveAutoPlacements(gs, roomId) || [];
      const p = placements.find(pl => pl.objId === obj.id);
      if (p) rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    }
  }
  if (!rect) return { x: rcx, y: rcy };
  const def = obj && typeof OBJECT_DEFS !== 'undefined' ? OBJECT_DEFS[obj.defId] : null;
  const mode = def?.anchorMode || 'edge';
  if (mode === 'center') return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const inset = (def && typeof def.standInset === 'number') ? def.standInset : DEFAULT_STAND_INSET;
  return objectStandPoint(rect, rcx, rcy, inset);
}
