// ===== SECTION: STATE =====
// Sole kv access point. No other section calls root.kv directly.
// Per-folder versioning, snapshot-before-migrate, debounced coalesced writes,
// pendingOp records for crash recovery, LRU image cache, assert() helper.

// --- Assert helper: throws in dev, logs to ring buffer + continues in prod ---
const ASSERT_RING_BUFFER = [];
const ASSERT_RING_MAX = 100;
const DEV = !window.generatorPublicId || window.generatorIsUnsaved !== false;

function assert(cond, msg, context) {
  if (cond) return;
  const entry = {
    msg,
    context: context || null,
    stack: new Error().stack,
    timestamp: Date.now(),
  };
  ASSERT_RING_BUFFER.push(entry);
  if (ASSERT_RING_BUFFER.length > ASSERT_RING_MAX) ASSERT_RING_BUFFER.shift();
  if (DEV) throw new Error(`Assert failed: ${msg}`);
  // prod: logged, continue
}

// --- Folder versions (independent migration) ---
const FOLDER_VERSIONS = {
  meta: 1,
  player: 2,
  world: 2,
  npcs: 1,
  images: 1,
  snapshots: 1,
  objects: 1,
};

// --- Migration functions (per folder). Stubbed for day-one; iterate here. ---
const MIGRATIONS = {
  meta: [
    // { from: 0, to: 1, fn: (state) => { ... } }
  ],
  player: [
    // player 1->2 (ITEMS section): inventory was mixed-type — bare strings
    // from very early code, {name,qty} objects from placeDelivery. Real
    // stacks are {defId,qty,ownerId,meta}; unmatched legacy names fall
    // through to ITEM_DEFS._unknown with the original text preserved in
    // meta.origName, so no save loses data even if the name doesn't match
    // anything (see ITEMS' migrateInventory/resolveItemDefIdByName).
    { from: 1, to: 2, fn: (player) => ({ ...player, inventory: migrateInventory(player.inventory) }) },
  ],
  world: [
    // world 1->2 (WORLD section): rooms[].objects was a spec'd field that
    // was initialized to [] and never read or written by anything — real
    // objects now live in the 'objects' kv folder instead. This migration
    // just drops the dead field. The 'world' folder holds several
    // differently-shaped keys under one migration pass (rooms/castWeb/
    // quests/events/deliveries/rent all share this function), so it only
    // touches entries that structurally look like a room-shell map
    // (values with a `capacity` property) and passes everything else
    // through untouched.
    { from: 1, to: 2, fn: (data) => {
      if (!data || typeof data !== 'object') return data;
      const looksLikeRooms = Object.values(data).some(v => v && typeof v === 'object' && 'capacity' in v);
      if (!looksLikeRooms) return data;
      const migrated = {};
      for (const [roomId, room] of Object.entries(data)) {
        const { objects, ...rest } = room;
        migrated[roomId] = rest;
      }
      return migrated;
    } },
  ],
  npcs: [],
  images: [],
  snapshots: [],
  objects: [],
};

function migrateFolder(folder, data, fromVer, toVer) {
  let current = data;
  let ver = fromVer;
  for (const m of MIGRATIONS[folder]) {
    if (m.from === ver && m.to === ver + 1) {
      current = m.fn(current);
      ver = m.to;
    }
  }
  assert(ver === toVer, `Migration incomplete for ${folder}: at ${ver}, expected ${toVer}`, { folder });
  return current;
}

// ===== KV ADAPTER =====
// All kv access goes through here. Folders are auto-created by property access.

const KVFolders = ['meta', 'player', 'world', 'npcs', 'images', 'snapshots', 'objects'];

// --- Pending operation records for multi-key crash recovery ---
async function setPendingOp(opId, description, keys) {
  const meta = await root.kv.meta.get('meta') || {};
  meta.pendingOp = { id: opId, description, keys, timestamp: Date.now() };
  await root.kv.meta.set('meta', meta);
}

async function clearPendingOp() {
  const meta = await root.kv.meta.get('meta') || {};
  delete meta.pendingOp;
  await root.kv.meta.set('meta', meta);
}

async function getPendingOp() {
  const meta = await root.kv.meta.get('meta') || {};
  return meta.pendingOp || null;
}

// --- Reconciliation on load: repair partial state from crashed mid-operation ---
async function reconcilePendingOp() {
  const pending = await getPendingOp();
  if (!pending) return null;
  // The source of truth is NPC residency status. world.rooms carries no
  // occupants mirror to repair (presence is derived live from npc.location —
  // see getPresentNpcIds in SIM), so there is nothing to cascade there.
  //
  // A crashed move-out CAN leave a stale castWeb pair: doAskToLeave writes
  // the npc's residency ('former') and the castWeb prune through the same
  // multiKeyOp, in that order, so a crash between the two leaves a 'former'
  // resident still referenced in castWeb. Scan for that and prune it.
  const npcKeys = await root.kv.npcs.keys();
  const formerIds = [];
  for (const npcId of npcKeys) {
    const npc = await root.kv.npcs.get(npcId);
    if (npc && npc.residency && npc.residency.status === 'former') formerIds.push(npcId);
  }
  if (formerIds.length > 0) {
    const web = await root.kv.world.get('castWeb') || {};
    let changed = false;
    for (const key of Object.keys(web)) {
      const [a, b] = key.split('|');
      if (formerIds.includes(a) || formerIds.includes(b)) {
        delete web[key];
        changed = true;
      }
    }
    if (changed) await root.kv.world.set('castWeb', web);
  }

  await clearPendingOp();
  return pending;
}

// --- Version check + migrate a folder (snapshot first) ---
async function checkAndMigrateFolder(folder) {
  const meta = await root.kv.meta.get('meta') || {};
  const versions = meta.versions || {};
  const currentVer = versions[folder] || 0;
  const targetVer = FOLDER_VERSIONS[folder];
  if (currentVer === targetVer) return;

  // Snapshot before migration
  if (currentVer > 0) {
    const snapKey = `pre-migrate-${folder}-${currentVer}-to-${targetVer}-${Date.now()}`;
    if (folder === 'npcs') {
      const keys = await root.kv.npcs.keys();
      const snap = {};
      for (const k of keys) snap[k] = await root.kv.npcs.get(k);
      await root.kv.snapshots.set(snapKey, snap);
    } else {
      const keys = await root.kv[folder].keys();
      const snap = {};
      for (const k of keys) snap[k] = await root.kv[folder].get(k);
      await root.kv.snapshots.set(snapKey, snap);
    }
  }

  // Apply migrations
  if (folder === 'npcs') {
    const keys = await root.kv.npcs.keys();
    for (const k of keys) {
      let npc = await root.kv.npcs.get(k);
      npc = migrateFolder('npcs', npc, currentVer, targetVer);
      await root.kv.npcs.set(k, npc);
    }
  } else if (folder === 'meta') {
    let data = await root.kv.meta.get('meta') || {};
    data = migrateFolder('meta', data, currentVer, targetVer);
    await root.kv.meta.set('meta', data);
  } else {
    const keys = await root.kv[folder].keys();
    for (const k of keys) {
      let data = await root.kv[folder].get(k);
      data = migrateFolder(folder, data, currentVer, targetVer);
      await root.kv[folder].set(k, data);
    }
  }

  // Update version record
  const updatedMeta = await root.kv.meta.get('meta') || {};
  updatedMeta.versions = updatedMeta.versions || {};
  updatedMeta.versions[folder] = targetVer;
  await root.kv.meta.set('meta', updatedMeta);
}

// --- Initialize all folders with versioning ---
async function initStorage() {
  let meta = await root.kv.meta.get('meta');
  if (!meta) {
    meta = {
      versions: { meta: 1, player: 1, world: 1, npcs: 1, images: 1, snapshots: 1 },
      seed: null,
      clock: null,
      structuralHash: null,
      saveTimestamp: null,
      imageIndex: {}, // lightweight key→lastAccess for LRU, avoiding loading Blobs
    };
    await root.kv.meta.set('meta', meta);
  }
  // Reconcile any crashed operations
  const pending = await reconcilePendingOp();
  if (pending) console.warn('Reconciled pending op:', pending);
  // Migrate all folders
  for (const f of KVFolders) {
    await checkAndMigrateFolder(f);
  }
}

// --- Debounced coalesced writes ---
const DEBOUNCE_MS = 2000;
const writeQueue = new Map(); // key → { folder, data }
let writeTimer = null;
let lastWriteTime = 0;

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flushWrites, DEBOUNCE_MS);
}

async function flushWrites() {
  writeTimer = null;
  if (writeQueue.size === 0) return;
  // Bug this fixes: the old loop destructured the *composite* map key
  // ("meta:meta") and passed it straight to kv.set as the kv key, instead
  // of the real key stored on the entry ("meta"). Every debounced write
  // landed under a bogus compound key that nothing ever reads back —
  // saves have silently gone nowhere since day one, regardless of what
  // callers queue.
  const batch = [...writeQueue.values()];
  writeQueue.clear();
  for (const { folder, key, data } of batch) {
    await root.kv[folder].set(key, data);
  }
  lastWriteTime = Date.now();
}

// Queue a debounced write
function queueWrite(folder, key, data) {
  writeQueue.set(`${folder}:${key}`, { folder, key, data });
  scheduleWrite();
}

// Force immediate flush (for boundary saves)
async function forceFlush() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  await flushWrites();
}

// --- Autosave: timer + boundary triggers ---
const AUTOSAVE_MS = 30000; // 30s timer
let autosaveTimer = null;

// getState is a zero-arg callback returning the current game state (or
// null). STATE takes it as a parameter rather than reaching into a UI
// global directly, keeping the section boundary intact while still letting
// the timer see whatever currentGameState points to at each tick.
function startAutosave(getState) {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(() => saveAtBoundary('timer', getState ? getState() : null), AUTOSAVE_MS);
}

// Stops ticking without restarting — used at the start of a new-game
// transition (UI's approveCastAndStartGame), which awaits prose expansion
// and several kv writes that can easily exceed AUTOSAVE_MS. Without this,
// a stale timer from the PREVIOUS game could fire mid-transition (its
// getState closure still resolves to the old currentGameState, since that
// module-level binding isn't reassigned until syncGameStateFromKv
// completes) and write the old game's NPCs back into kv via the debounced
// queue, after writeGeneratedGameState already wrote the new cast —
// polluting the new game with leftover roommates from the old one.
function stopAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
}

// Persist the live game state at a save boundary (phase change, scene exit,
// before an LLM call, manual save, or the autosave timer). gameState is the
// in-memory object UI mutates directly during play — without it there is
// nothing new to write and this only stamps the save timestamp.
async function saveAtBoundary(reason, gameState) {
  if (gameState) {
    gameState.meta.saveTimestamp = Date.now();
    queueWrite('meta', 'meta', gameState.meta);
    queueWrite('player', 'player', gameState.player);
    queueWrite('world', 'rooms', gameState.world.rooms);
    // castWeb was missing here — NPC-to-NPC relationship deltas from
    // applyNpcToNpcDelta silently never persisted past the in-memory
    // session (found while wiring EFFECTS into the save path; see
    // ref/ARCHITECTURE.md).
    queueWrite('world', 'castWeb', gameState.world.castWeb);
    queueWrite('world', 'events', gameState.world.events);
    queueWrite('world', 'deliveries', gameState.world.deliveries);
    queueWrite('world', 'quests', gameState.world.quests);
    queueWrite('world', 'rent', gameState.world.rent);
    queueWrite('world', 'computer', gameState.world.computer || defaultComputerState());
    // kv.npcs is one key per npc (brief: "appending an episode rewrites one
    // character, not the world"). Every tick resolves every NPC's
    // location/activity/needs/mood in-memory via resolveBatch, but until
    // this loop existed nothing ever wrote that back to kv — location and
    // needs silently reverted to new-game values on every reload.
    for (const [id, npc] of Object.entries(gameState.npcs || {})) {
      queueWrite('npcs', id, npc);
    }
    // Object buckets are few (~12) and small, so an unconditional write
    // loop here is the same tradeoff the NPC loop above already makes —
    // real dirty-tracking is worth adding once something actually mutates
    // objects on most turns (P2 cooking, P6 stealth), not before.
    for (const [bucket, data] of Object.entries(gameState.objects || {})) {
      queueWrite('objects', bucket, data);
    }
  } else {
    const meta = await root.kv.meta.get('meta') || {};
    meta.saveTimestamp = Date.now();
    queueWrite('meta', 'meta', meta);
  }
  await forceFlush();
  console.debug('Autosaved at boundary:', reason);
}

// --- Atomic update wrapper (mandatory for read-modify-write) ---
// Currently unused (all real call sites go through the per-folder
// updateX functions above, or through multiKeyOp), but fixed to match
// their pattern rather than left as a landmine: kv-plugin's update()
// resolves to the underlying IDB transaction result, not the callback's
// return value, so a caller trusting this function's return value would
// get undefined back instead of the updated record (see updatePlayer/
// updateNpc/updateWorld/updateMeta above, and getPresentNpcIds's
// null-guard in SIM, for the bug this caused in practice).
async function atomicUpdate(folder, key, updateFn) {
  await root.kv[folder].update(key, updateFn);
  return root.kv[folder].get(key);
}

// --- Multi-key operation with pendingOp tracking ---
async function multiKeyOp(opId, description, operations) {
  // operations: [{ folder, key, fn }] — fn takes current value, returns new value
  const keys = operations.map(o => `${o.folder}:${o.key}`);
  await setPendingOp(opId, description, keys);
  try {
    for (const op of operations) {
      await root.kv[op.folder].update(op.key, op.fn);
    }
    await clearPendingOp();
  } catch (e) {
    // Leave pendingOp for reconciliation on next load
    assert(false, `Multi-key op failed: ${description}`, { error: e.message, opId });
  }
}

// ===== PLAYER ACCESSORS =====

async function getPlayer() {
  return await root.kv.player.get('player');
}

async function updatePlayer(fn) {
  await root.kv.player.update('player', fn);
  return await root.kv.player.get('player');
}

// ===== NPC ACCESSORS =====

async function getNpc(id) {
  return await root.kv.npcs.get(id);
}

async function getAllNpcs() {
  const keys = await root.kv.npcs.keys();
  const npcs = {};
  for (const k of keys) npcs[k] = await root.kv.npcs.get(k);
  return npcs;
}

async function updateNpc(id, fn) {
  await root.kv.npcs.update(id, fn);
  return await root.kv.npcs.get(id);
}

async function setNpc(id, data) {
  return root.kv.npcs.set(id, data);
}

async function deleteNpc(id) {
  return root.kv.npcs.delete(id);
}

// ===== WORLD ACCESSORS =====

async function getWorld(key) {
  return await root.kv.world.get(key);
}

async function setWorld(key, data) {
  return root.kv.world.set(key, data);
}

async function updateWorld(key, fn) {
  await root.kv.world.update(key, fn);
  return await root.kv.world.get(key);
}

// ===== OBJECT ACCESSORS (WORLD section's instance data) =====
// One kv key per placement bucket (room_<roomId> | carry_<'player'|npcId>)
// — mirrors the 'world' folder's per-key split (rooms/castWeb/quests/...)
// rather than one giant blob, so mutating one room's objects doesn't
// rewrite every bucket.

async function getObjectBucket(bucket) {
  return await root.kv.objects.get(bucket);
}

async function setObjectBucket(bucket, data) {
  return root.kv.objects.set(bucket, data);
}

async function updateObjectBucket(bucket, fn) {
  await root.kv.objects.update(bucket, fn);
  return await root.kv.objects.get(bucket);
}

async function getAllObjectBuckets() {
  const keys = await root.kv.objects.keys();
  const out = {};
  for (const k of keys) out[k] = await root.kv.objects.get(k);
  return out;
}

// ===== META ACCESSORS =====

async function getMeta() {
  return await root.kv.meta.get('meta');
}

async function setMeta(data) {
  return root.kv.meta.set('meta', data);
}

async function updateMeta(fn) {
  await root.kv.meta.update('meta', fn);
  return await root.kv.meta.get('meta');
}

// ===== IMAGE CACHE (LRU via lightweight index in meta) =====

// Both functions below route the imageIndex mutation through
// kv.meta.update (atomic read-modify-write) rather than get-then-set. The
// old get-then-set here could race with any other in-flight meta write
// (a session-log append, a day-rollover economy field) and silently
// revert it — "get-then-set on shared state is a bug, not a style
// choice." render()'s idempotency fix already means this only runs when
// the scene actually changes, not on every render, but the write itself
// still needed to be atomic regardless of frequency.

async function getCachedImage(sceneKey) {
  const cached = await root.kv.images.get(sceneKey);
  if (!cached) return null;
  await root.kv.meta.update('meta', (meta) => {
    meta = meta || {};
    return { ...meta, imageIndex: { ...(meta.imageIndex || {}), [sceneKey]: Date.now() } };
  });
  return cached.blob;
}

async function setCachedImage(sceneKey, blob) {
  await root.kv.images.set(sceneKey, { blob, lastAccess: Date.now() });

  let toEvict = [];
  await root.kv.meta.update('meta', (meta) => {
    meta = meta || {};
    const imageIndex = { ...(meta.imageIndex || {}), [sceneKey]: Date.now() };
    const entries = Object.entries(imageIndex);
    if (entries.length > IMAGE_CACHE.cap) {
      entries.sort((a, b) => a[1] - b[1]); // oldest first
      const evictEntries = entries.slice(0, entries.length - IMAGE_CACHE.cap);
      toEvict = evictEntries.map(([key]) => key);
      for (const key of toEvict) delete imageIndex[key];
    }
    return { ...meta, imageIndex };
  });

  // Blob deletion is a separate kv folder — can't be part of the same
  // atomic transaction as the meta update (brief: cross-folder writes
  // aren't atomic regardless), so it happens after, once the index is
  // already consistent.
  for (const key of toEvict) {
    await root.kv.images.delete(key);
  }
}

// ===== SAVE / LOAD =====

async function saveGame(gameState) {
  await saveAtBoundary('manual', gameState);
}

async function hasSave() {
  const meta = await root.kv.meta.get('meta');
  return !!(meta && meta.seed);
}

async function loadGameState() {
  await initStorage();
  const meta = await getMeta();
  if (!meta || !meta.seed) return null;

  const player = await getPlayer();
  const npcs = await getAllNpcs();
  const rooms = await getWorld('rooms') || {};
  const castWeb = await getWorld('castWeb') || {};
  const quests = await getWorld('quests') || { active: [], completed: [] };
  const events = await getWorld('events') || [];
  const deliveries = await getWorld('deliveries') || [];
  const rent = await getWorld('rent') || { total: ECONOMY.rent.total, perResident: 0, contributorCount: 0 };
  // A new kv key rather than a version bump — defaultComputerState()
  // (COMPUTER) is exactly what a save from before the computer existed
  // should read as. A save from after the computer existed but before its
  // windowed-desktop rework has a `computer` key in the old single-`view`
  // shape though, so a real normalizer is needed here, not just a
  // fallback — see COMPUTER's normalizeComputerState.
  const computer = normalizeComputerState(await getWorld('computer'));

  const gameState = {
    meta,
    player,
    npcs,
    world: { rooms, castWeb, quests, events, deliveries, rent, computer },
  };
  // Lazily spawns any bucket missing from kv (a pre-WORLD save, or a
  // resident who moved in since the last full write) rather than needing a
  // destructive migration — see WORLD's ensureAllObjectBuckets.
  gameState.objects = await ensureAllObjectBuckets(gameState);
  return gameState;
}

// --- New game: initialize fresh state ---
// Generates a house and writes it in one step — used for a quick-start
// (random/guided/seed) with no review. The character-creation preview flow
// (roll → review/reroll → approve → prose expand) instead calls
// SIM_generateHouse and writeGeneratedGameState separately, so the player
// can see and reroll characters before anything touches kv.
async function newGameState(seed, residentCount, partials) {
  await initStorage();
  const gameState = await SIM_generateHouse(seed, residentCount, partials);
  return writeGeneratedGameState(gameState);
}

// Persist an already-generated (and possibly prose-expanded /
// player-reviewed) game state. droppedConstraints (which cast-level
// requirements the generator gave up on to hit maxAttempts — see SIM's
// scoreCast) is written to meta so the debug cast viewer can show it, per
// the brief's "record which were dropped."
async function writeGeneratedGameState(gameState) {
  await initStorage();

  await setMeta({
    versions: { ...FOLDER_VERSIONS },
    seed: gameState.seed,
    clock: gameState.clock,
    structuralHash: gameState.structuralHash,
    saveTimestamp: Date.now(),
    imageIndex: {},
    droppedConstraints: gameState.droppedConstraints || [],
    // Player's tone/content choices from character creation. Not yet
    // consumed by narration (that's LLM prompt-construction territory —
    // see ui.js's handleGenerateCast) but persisted rather than dropped.
    contentConfig: gameState.contentConfig || { tone: CONTENT_CONFIG.tone, contentPrefs: [] },
  });

  await root.kv.player.set('player', gameState.player);

  await root.kv.world.set('rooms', gameState.world.rooms);
  await root.kv.world.set('castWeb', gameState.world.castWeb);
  await root.kv.world.set('quests', gameState.world.quests);
  await root.kv.world.set('events', gameState.world.events);
  await root.kv.world.set('deliveries', gameState.world.deliveries);
  await root.kv.world.set('rent', gameState.world.rent);
  await root.kv.world.set('computer', gameState.world.computer || defaultComputerState());

  for (const [id, npc] of Object.entries(gameState.npcs)) {
    await root.kv.npcs.set(id, npc);
  }
  // Delete stale NPC keys from a previous game that aren't in the new
  // cast. Done AFTER the new NPCs are written so a failure here leaves
  // the new state intact rather than deleting everything.
  const newNpcIds = new Set(Object.keys(gameState.npcs));
  const existingNpcKeys = await root.kv.npcs.keys();
  for (const k of existingNpcKeys) {
    if (!newNpcIds.has(k)) await root.kv.npcs.delete(k);
  }

  for (const [bucket, data] of Object.entries(gameState.objects || {})) {
    await root.kv.objects.set(bucket, data);
  }

  return gameState;
}

// ===== EXPORT / IMPORT =====

async function exportCharacter(npcId) {
  const npc = await getNpc(npcId);
  if (!npc) return null;
  return {
    type: 'slice-of-life-character',
    version: 1,
    bible: npc.bible,
    bibleRevision: npc.bibleRevision,
    bibleChanges: npc.bibleChanges,
  };
}

async function importCharacter(json) {
  assert(json.type === 'slice-of-life-character', 'Invalid character export format');
  const { valid, errors, normalized } = validateCharacter({
    bible: json.bible,
    bibleRevision: json.bibleRevision || 0,
    bibleChanges: json.bibleChanges || [],
  });
  assert(valid, 'Imported character failed validation', errors);
  const id = genNpcId();
  const newNpc = createNpcFromBible(normalized.bible, 'prospective');
  await setNpc(id, newNpc);
  return id;
}

async function exportHousehold() {
  const npcs = await getAllNpcs();
  const castWeb = await getWorld('castWeb') || {};
  const meta = await getMeta();
  const bibles = {};
  const revisions = {};
  for (const [id, npc] of Object.entries(npcs)) {
    bibles[id] = npc.bible;
    revisions[id] = { bibleRevision: npc.bibleRevision, bibleChanges: npc.bibleChanges };
  }
  return {
    type: 'slice-of-life-household',
    version: 1,
    seed: meta.seed,
    bibles,
    revisions,
    castWeb,
  };
}

async function importHousehold(json) {
  assert(json.type === 'slice-of-life-household', 'Invalid household export');
  const npcs = {};
  for (const [id, bible] of Object.entries(json.bibles)) {
    const { valid, errors, normalized } = validateCharacter({ bible });
    assert(valid, `Imported character ${id} failed validation`, errors);
    npcs[id] = createNpcFromBible(normalized.bible, 'resident');
  }
  // Write to state
  for (const [id, npc] of Object.entries(npcs)) {
    await setNpc(id, npc);
  }
  await setWorld('castWeb', json.castWeb || {});
  return npcs;
}

// ===== /SECTION: STATE =====
