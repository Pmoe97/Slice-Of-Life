// ===== SECTION: WORLD =====
// Object instances: spawning, placement ownership, and cleanliness
// derivation. (Apartment Expansion v2 — Mirrored H)
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

// Door lock state for a room. Returns 'unlocked' for rooms without a door
// object ( or if the door hasn't spawned yet. Used by the interruption
// system (Phase 5) to modify walk-in probability, and by the floor plan
// visual to show door states. Checks for both bedroom_door and
// bathroom_door objects.
function getDoorState(gameState, roomId) {
  const bucket = gameState.objects?.[`room_${roomId}`];
  if (!bucket) return 'unlocked';
  const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
  return door?.state?.lock || 'unlocked';
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
    evidence: null, discovered: {}, flags: { ...(def.defaultFlags || {}) }, spawnedDay: day || 1,
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
    obj.contents = groceries.map(g => ({ defId: g.defId, qty: g.qty, ownerId: null, meta: { acquiredDay: 1 } }));
  }
}

// Lazy-spawn a single bucket that's missing or empty in kv — the path both
// a pre-WORLD save (which has no 'objects' folder data at all) and a
// newly-added carry bucket (e.g. a mid-game move-in) go through. Idempotent:
// re-running against an already-populated bucket is a no-op (checked by
// the caller, ensureAllObjectBuckets, but also safe to call directly).
// backfillLayout — when true, add any APARTMENT_LAYOUT fixture this bucket
// is missing. Only ever true for the one load after APARTMENT_LAYOUT_VERSION
// changes (see ensureAllObjectBuckets): running it unconditionally on every
// load re-added anything the player had permanently removed from a room, so
// carrying the lamp out of the living room quietly never stuck.
async function ensureObjectsForBucket(bucket, gameState, backfillLayout = false) {
  const existing = await getObjectBucket(bucket);
  if (existing && Object.keys(existing).length > 0) {
    if (backfillLayout && bucket.startsWith('room_')) {
      const roomId = bucket.replace(/^room_/, '');
      const placements = APARTMENT_LAYOUT[roomId];
      if (placements) {
        const existingDefIds = new Set(Object.values(existing).map(o => o.defId));
        let added = false;
        let slot = Object.keys(existing).length;
        for (const placement of placements) {
          if (existingDefIds.has(placement.defId)) continue;
          // L5: a `unique` def must exist exactly once across ALL buckets.
          // Without the guard, a layout bump would re-spawn a phone the
          // player happens to be carrying (carry_player) or has left in
          // another room — and every later bump spawns another.
          const def = OBJECT_DEFS[placement.defId];
          if (def?.unique && objectDefIdExistsAnywhere(placement.defId, gameState, bucket)) continue;
          const inst = makeObjectInstance(placement, bucket, slot, gameState.meta.seed, roomId, gameState.npcs, gameState.meta.clock.day);
          if (inst) { existing[inst.id] = inst; slot++; added = true; }
        }
        if (added) await setObjectBucket(bucket, existing);
      }
    }
    return existing;
  }
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
  // One-shot fixture back-fill, stamped in meta rather than in the buckets
  // themselves — a marker key inside a bucket would show up in
  // Object.keys/values scans of that bucket (computeReachSet, cleanliness
  // derivation, object lists) as if it were an object.
  const seenLayoutVersion = gameState.meta?.layoutVersion || 0;
  const backfillLayout = seenLayoutVersion !== APARTMENT_LAYOUT_VERSION;

  const objects = {};
  // Pass 1: ensure every bucket exists — spawn missing rooms fresh, leave
  // populated ones untouched.
  for (const bucket of buckets) objects[bucket] = await ensureObjectsForBucket(bucket, gameState, false);

  // Pass 2: the one-shot back-fill, run only AFTER every bucket is loaded
  // so a `unique`-def guard can scan the whole house, not just the buckets
  // loaded so far (L5 — the phone in the kitchen must stop a second phone
  // spawning into the bedroom).
  if (backfillLayout) {
    // The guard reads gameState.objects; the caller assigns the return
    // value after this function completes, so publish the loaded map now.
    gameState.objects = objects;
    for (const bucket of buckets) {
      if (!bucket.startsWith('room_')) continue;
      objects[bucket] = await ensureObjectsForBucket(bucket, gameState, true);
    }
    gameState.meta.layoutVersion = APARTMENT_LAYOUT_VERSION;
    await updateMeta(m => ({ ...m, layoutVersion: APARTMENT_LAYOUT_VERSION }));
  }
  // Canonicalize the denormalized bucket field on load. Runtime logic reads
  // the structural bucket key (see findPhoneObject), so this is belt-and-
  // braces rather than load-bearing — but obj.bucket is still persisted and
  // read by effects.js, and a copy that disagrees with its own map entry is
  // a bug waiting to be believed by the next reader.
  for (const [bucket, objs] of Object.entries(objects)) {
    if (!objs) continue;
    for (const obj of Object.values(objs)) obj.bucket = bucket;
  }
  return objects;
}

// Does any bucket other than `skipBucket` hold an object with this defId?
// Feeds ensureObjectsForBucket's back-fill, so a `unique` object (the
// phone) never gets a second instance just because it's not in the room
// being back-filled.
function objectDefIdExistsAnywhere(defId, gameState, skipBucket) {
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    if (bucket === skipBucket) continue;
    if (objs && Object.values(objs).some(o => o.defId === defId)) return true;
  }
  return false;
}

// --- Phone (BrineOS Phase 2/3) ---
// The phone's durable world state. Decision B of
// src/ref/BrineOS-The-Phone-plan.md says presence is DERIVED from the object's
// bucket — never stored on world.phone (two sources of truth desync).
// world.phone holds only the shell's nav state + settings (Phase 3): power
// (screen on/off), the app stack, and the one DND boolean (plan 3.7). The
// object holds battery (flags.battery) and plugged/lock state.
function defaultPhoneState() {
  return {
    power: 'off', openAppId: null, navStack: [],
    // Phase 9 (9.1): passcode is a standing setting, not a one-off PIN
    // entry minigame — same "one boolean, no over-engineering" precedent
    // as DND. When on, the phone auto-locks itself on close (doPhoneClose)
    // and auto-unlocks on open (doPhoneOpen — it's your own phone, you
    // always get back in); when off, the lock state doesn't self-manage
    // and stays whatever it last was. Locked is what actually defeats
    // snooping (trySnoopPhone, drives.js) — the setting is what makes
    // locking happen automatically instead of relying on the player to
    // remember every time.
    settings: { dnd: false, passcode: false },
    // Phase 4: the Tracker's player intents, keyed by deterministic entry
    // keys. `dismissed` = { key: dayDismissed } (stays gone for the life
    // of that obligation — keys embed the obligation's identity, so a new
    // cycle of the same bill re-notifies under a fresh key);
    // `snoozed` = { key: resurfaceDay }. Nothing else about obligations is
    // ever stored (decision D) — see tracker.js.
    dismissed: {},
    snoozed: {},
    // Phase 8: the camera roll — photo RECORDS (prompt+seed+metadata, never
    // the rendered blob itself — see image.js's takePhoto/getPhotoImage and
    // landmine L10). Newest first; capped at CAMERA.rollCap.
    camera: { roll: [] },
  };
}

// A save written before Phase 3 has no power/settings keys — fill them so
// shell code can read world.phone unconditionally. navStack/openAppId pass
// through (they already existed since Phase 0.2), but a Phase-2 navStack
// could be a stale/non-array in some edge save; coerce defensively.
function normalizePhoneState(raw) {
  if (!raw) return defaultPhoneState();
  return {
    power: raw.power || 'off',
    openAppId: raw.openAppId || null,
    navStack: Array.isArray(raw.navStack) ? raw.navStack : [],
    settings: { dnd: !!(raw.settings && raw.settings.dnd), passcode: !!(raw.settings && raw.settings.passcode) },
    dismissed: (raw.dismissed && typeof raw.dismissed === 'object') ? raw.dismissed : {},
    snoozed: (raw.snoozed && typeof raw.snoozed === 'object') ? raw.snoozed : {},
    // A save from before Phase 8 has no camera key at all — back-fill an
    // empty roll rather than losing the field.
    camera: { roll: Array.isArray(raw.camera?.roll) ? raw.camera.roll : [] },
  };
}

// The phone instance wherever it is — one per save (def.unique), so
// "first found" is unambiguous. Returns { obj, bucket } so callers read the
// structural bucket KEY rather than obj.bucket: the key cannot go stale,
// because it IS the map's placement. The obj.bucket field is a denormalized
// copy (kept in sync by applyMoveObject) and must never be what runtime
// logic branches on — a stale copy once reported the phone 'elsewhere'
// while it sat in the room.
function findPhoneObject(gameState) {
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    const obj = objs && Object.values(objs).find(o => o.defId === 'phone');
    if (obj) return { obj, bucket };
  }
  return null;
}

// 'carried' when in the player's pocket, 'here' when in the same room as
// the player, 'elsewhere' otherwise (or before the phone has spawned).
// Used by the always-on-screen phone button (Phase 3) and by Phase 4's
// notification filtering — decision C: in another room, nothing gets
// through.
function phonePresence(gameState) {
  const found = findPhoneObject(gameState);
  if (!found) return 'elsewhere';
  if (found.bucket === 'carry_player') return 'carried';
  if (found.bucket === `room_${gameState.player.location}`) return 'here';
  return 'elsewhere';
}

// Charging requires: a room bucket (not the pocket — moving to carry_player
// auto-unplugs), the plugged state, and power not cut off. This is the
// "NPC behaviour must show up on the bills" invariant applied to the
// player: charging meters the electric bill's `devices` meter.
function isPhoneCharging(gameState, phone, bucket) {
  if (!phone) return false;
  if (!bucket || !bucket.startsWith('room_')) return false;
  if (phone.state.plugged !== 'plugged') return false;
  if (isCutoffActive(gameState, 'power')) return false;
  return true;
}

// BrineOS Phase 9: force the phone's lock state. A direct setter, not a
// toggle — doPhoneOpen always unlocks (it's the owner's own phone, they
// always get back in) and doPhoneClose locks only when settings.passcode
// is on, and both need to FORCE a specific value, not flip whatever it
// currently is.
function setPhoneLock(gameState, locked) {
  const found = findPhoneObject(gameState);
  if (!found) return;
  found.obj.state.lock = locked ? 'locked' : 'unlocked';
}

// Battery moves with the sim. Called once per resolved tick from UI's
// advanceAndResolve (ui.js), which BOTH the continuous clock's sim
// checkpoints and every discrete action (sleep, work blocks, gigs) flow
// through — hooking only the checkpoint path would let an 8-hour sleep
// cost zero battery (decision C's "verify the discrete path" note).
function advancePhoneBattery(gameState, ticks) {
  const found = findPhoneObject(gameState);
  if (!found) return;
  const phone = found.obj;
  phone.flags = phone.flags || {};
  const battery = phone.flags.battery == null ? PHONE.startingBattery : phone.flags.battery;
  if (isPhoneCharging(gameState, phone, found.bucket)) {
    phone.flags.battery = clamp(battery + PHONE.batteryChargePerCheckpoint * ticks, 0, 100);
    recordUtilityUsage(gameState, 'devices', PHONE.chargeMeterDevicesPerCheckpoint * ticks);
  } else {
    phone.flags.battery = clamp(battery - PHONE.batteryDrainPerCheckpoint * ticks, 0, 100);
  }
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
