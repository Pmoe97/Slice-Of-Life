// ===== SECTION: WORLD =====
// Object instances: spawning, placement ownership, and cleanliness
// derivation. Pure functions only — kv access goes through STATE's
// getObjectBucket/setObjectBucket/updateObjectBucket (added alongside the
// 'objects' folder), never root.kv directly, per the "state.js is the sole
// kv access point" invariant.
//
// Instance shape (lives in kv folder 'objects', one key per placement
// bucket — room_<roomId> or carry_<'player'|npcId>):
//   { id, defId, bucket, ownerId, state, condition, contents, evidence,
//     discovered, flags, spawnedDay }
// `id` is seeded from (save seed, bucket, slot) via genObjectId — never
// Date.now() — so "paste a seed, get the same house" (the invariant
// genSeededNpcId exists to protect for characters) holds for objects too.

// --- Seeded object id ---
function genObjectId(seed, bucket, slot, defId) {
  return `obj_${hashStr(`${seed}|${bucket}|${slot}`).toString(36)}_${defId}`;
}

// --- Room ownership/privacy: DERIVED, never stored — mirrors
// getPresentNpcIds's "presence is derived live from npc.location, not
// mirrored" pattern (SIM), so a move-in/move-out can never leave a stale
// owner behind. ---
function roomOwnerId(roomId, npcs) {
  if (roomId === 'bedroom_player') return 'player';
  if (!ROOMS[roomId] || ROOMS[roomId].type !== 'bedroom') return null;
  const owner = Object.entries(npcs || {}).find(([, n]) => n.residency.room === roomId && n.residency.status !== 'former');
  return owner ? owner[0] : null;
}

function roomPrivacy(roomId) {
  return ROOMS[roomId]?.type === 'bedroom' ? 'owned' : 'public';
}

function resolvePlacementOwner(placement, roomId, npcs) {
  if (placement.ownerFrom === 'roomResident') return roomOwnerId(roomId, npcs);
  return placement.ownerId ?? null;
}

function makeObjectInstance(placement, bucket, slot, seed, roomId, npcs, day) {
  const def = OBJECT_DEFS[placement.defId];
  if (!def) { console.warn(`Unknown object def in APARTMENT_LAYOUT: ${placement.defId}`); return null; }
  const id = genObjectId(seed, bucket, slot, placement.defId);
  return {
    id, defId: placement.defId, bucket,
    ownerId: resolvePlacementOwner(placement, roomId, npcs),
    state: { ...def.defaultState }, condition: 100, contents: [],
    evidence: null, discovered: {}, flags: {}, spawnedDay: day || 1,
  };
}

// --- Spawning ---

// Full spawn for a brand-new game: every room bucket from APARTMENT_LAYOUT,
// plus an empty carry bucket for the player and each npc.
function spawnObjectsForNewGame(seed, npcs) {
  const objects = {};
  for (const [roomId, placements] of Object.entries(APARTMENT_LAYOUT)) {
    const bucket = `room_${roomId}`;
    objects[bucket] = {};
    placements.forEach((placement, slot) => {
      const inst = makeObjectInstance(placement, bucket, slot, seed, roomId, npcs, 1);
      if (inst) objects[bucket][inst.id] = inst;
    });
  }
  seedStarterGroceries(objects);
  objects['carry_player'] = {};
  for (const npcId of Object.keys(npcs)) objects[`carry_${npcId}`] = {};
  return objects;
}

// STARTER_GROCERIES (DEFS.WORLD) into the fridge/pantry instances' own
// .contents, so a fresh house is cookable on day one — matches the
// existing "the house has a past before the player's first turn"
// convention (SIM backdates castWeb shared-history beats the same way).
function seedStarterGroceries(objects) {
  const kitchen = objects['room_kitchen'];
  if (!kitchen) return;
  for (const [defId, groceries] of Object.entries(STARTER_GROCERIES)) {
    const obj = Object.values(kitchen).find(o => o.defId === defId);
    if (!obj) continue;
    obj.contents = groceries.map(g => ({ defId: g.defId, qty: g.qty, ownerId: null, meta: {} }));
  }
}

// Lazy-spawn a single bucket that's missing or empty in kv — the path both
// a pre-WORLD save (which has no 'objects' folder data at all) and a
// newly-added carry bucket (e.g. a mid-game move-in) go through. Idempotent:
// re-running against an already-populated bucket is a no-op (checked by
// the caller, ensureAllObjectBuckets, but also safe to call directly).
async function ensureObjectsForBucket(bucket, gameState) {
  const existing = await getObjectBucket(bucket);
  if (existing && Object.keys(existing).length > 0) return existing;
  if (bucket.startsWith('carry_')) { await setObjectBucket(bucket, {}); return {}; }

  const roomId = bucket.replace(/^room_/, '');
  const placements = APARTMENT_LAYOUT[roomId];
  if (!placements) { await setObjectBucket(bucket, {}); return {}; }

  const spawned = {};
  placements.forEach((placement, slot) => {
    const inst = makeObjectInstance(placement, bucket, slot, gameState.meta.seed, roomId, gameState.npcs, gameState.meta.clock.day);
    if (inst) spawned[inst.id] = inst;
  });
  await setObjectBucket(bucket, spawned);
  return spawned;
}

// Ensure every bucket the current household needs exists, spawning any
// that are missing (see ensureObjectsForBucket). Called from STATE's
// loadGameState, after npcs are loaded — a fresh save from spawnObjects
// ForNewGame already has every bucket, so this is a fast no-op there; a
// pre-WORLD save (or one where a resident moved in after last save)
// populates lazily here instead of needing a destructive migration.
async function ensureAllObjectBuckets(gameState) {
  const buckets = [
    'carry_player',
    ...Object.keys(gameState.npcs || {}).map(id => `carry_${id}`),
    ...Object.keys(APARTMENT_LAYOUT).map(roomId => `room_${roomId}`),
  ];
  const objects = {};
  for (const bucket of buckets) objects[bucket] = await ensureObjectsForBucket(bucket, gameState);
  return objects;
}

// --- Cleanliness: derived from object state, not a standalone field that
// only ever gets set once. griminess is a data-driven lookup (def.dirtyWhen)
// rather than a formula, so "what makes this room feel dirty" stays a
// per-object fact instead of hardcoded logic. ---
function computeObjectGriminess(def, obj) {
  if (!def || !def.dirtyWhen) return 0;
  let grime = 0;
  for (const [key, weights] of Object.entries(def.dirtyWhen)) {
    const val = obj.state?.[key];
    if (val != null && weights[val] != null) grime = Math.max(grime, weights[val]);
  }
  return grime;
}

function recomputeRoomCleanliness(bucketObjects) {
  const objs = Object.values(bucketObjects || {});
  let weightedGrime = 0, totalWeight = 0;
  for (const obj of objs) {
    const def = OBJECT_DEFS[obj.defId];
    if (!def || !def.cleanlinessWeight) continue;
    totalWeight += def.cleanlinessWeight;
    weightedGrime += def.cleanlinessWeight * computeObjectGriminess(def, obj);
  }
  if (totalWeight === 0) return CLEANLINESS.baseline;
  return Math.round(clamp(100 - (weightedGrime / totalWeight) * 100, 0, 100));
}

// Recompute and write back cleanliness for one room from its current
// object bucket — the hook future phases (P2 cooking, P6 cleaning) call
// after any effect changes an object's dirty-relevant state.
function refreshRoomCleanliness(gameState, roomId) {
  const bucket = gameState.objects?.[`room_${roomId}`];
  const cleanliness = recomputeRoomCleanliness(bucket);
  if (gameState.world.rooms[roomId]) gameState.world.rooms[roomId].cleanliness = cleanliness;
  return cleanliness;
}

// ===== /SECTION: WORLD =====
