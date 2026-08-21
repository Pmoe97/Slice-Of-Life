// ===== SECTION: STATE =====
// Save/load, kv access, migration (Apartment Expansion v2 — Mirrored H).
// Sole kv access point for SIM state. The title-gallery preference reads in
// menu.js / defs.menu.js / image.js (the MENU_GALLERY_* keys) are the one
// documented exception — UI persistence only, never sim state.
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
  meta: 2,
  player: 7,
  world: 5,
  npcs: 8,
  images: 1,
  snapshots: 1,
  objects: 3,
};

// --- Persisted-key table (Phase 9: the invariant the save system rests on) ---
// The SINGLE source of truth for what lives in the persisted folders. Both
// the autosave path (saveAtBoundary) and the snapshot path (captureSave)
// walk this table — never enumerate persisted keys in two places. castWeb
// silently never persisted for months because it was missing from exactly
// this list (it was added to saveAtBoundary's hard-coded queueWrite block,
// and the two paths drifted apart). `all: true` folders store one kv key
// per record (npcs: one per character; objects: one per placement bucket) —
// every key, by construction.
const SAVE_KEYS = [
  { folder: 'meta', keys: ['meta'] },
  { folder: 'player', keys: ['player'] },
  { folder: 'world', keys: [
    'rooms', 'castWeb', 'relationships', 'events', 'deliveries', 'renovationJobs',
    'visits', 'commitments', 'foodOrders', 'groceryOrders', 'externalStubs', 'escortRoster',
    'escortBookings', 'hotSinglesRoster', 'moveInOffers', 'flags', 'quests',
    'rent', 'computer', 'taxes', 'bills', 'upgrades', 'utilities',
    'phone', 'afterHours', 'signals', 'outsidePartners',
    'pregnancies',
    'autoCookCleared',
  ] },
  { folder: 'npcs', all: true },
  { folder: 'objects', all: true },
];

// The in-memory source map for a folder — { key: value } pairs in the same
// shape SAVE_KEYS describes. meta/player are single-key folders whose value
// is the live object itself; world is the world map; npcs/objects are their
// own maps.
function folderSourceMap(gs, folder) {
  if (folder === 'meta') return { meta: gs.meta };
  if (folder === 'player') return { player: gs.player };
  return gs[folder] || {};
}

// World keys that may be absent from an in-memory state (a brand-new game
// state from SIM_generateHouse omits phone/afterHours; a key added to
// SAVE_KEYS before every construction path sets it) get their historical
// safe default at write time. These are called at RUNTIME only — the
// default* fns live in later scripts (sim/computer/world).
const WORLD_KEY_FALLBACKS = {
  rooms: () => ({}),
  castWeb: () => ({}),
  // Intimacy & Voyeurism Phase 12: the relationship store. An empty object is
  // exactly what a save from before this existed should read as — the same
  // additive-default precedent as world.computer / signals.
  relationships: () => ({}),
  // Intimacy & Voyeurism Phase 14: the outside-partner index (residentId →
  // { npcId, sinceDay, lastVisitDay }). Empty for saves written before this
  // existed — ensureOutsidePartners backfills at the next day rollover / new
  // game write, so no migration.
  outsidePartners: () => ({}),
  // Intimacy & Voyeurism Phase 18: the pregnancy lifecycle store. Empty for
  // saves written before this existed — no migration, the same additive-default
  // precedent as relationships/outsidePartners.
  pregnancies: () => [],
  // Food-overhaul Phase 6 (D14): the auto-cook mastery proofs (recipeId →
  // best grade cooked). Empty for saves written before this existed — no
  // migration, the same additive-default precedent as relationships.
  autoCookCleared: () => ({}),
  events: () => [],
  deliveries: () => [],
  renovationJobs: () => [],
  visits: () => [],
  commitments: () => [],
  foodOrders: () => [],
  groceryOrders: () => [],
  externalStubs: () => ({}),
  escortRoster: () => [],
  escortBookings: () => [],
  hotSinglesRoster: () => [],
  moveInOffers: () => [],
  flags: () => ({}),
  quests: () => ({ active: [], completed: [] }),
  rent: () => ({ total: ECONOMY.rent.total, playerShare: ECONOMY.rent.total, roommateShares: {}, coveredByRoommates: 0, contributorCount: 0 }),
  computer: () => defaultComputerState(),
  taxes: () => ({ quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0, quarterDeductions: 0, lastQuarterOwed: 0, lastQuarterPaid: 0 }),
  bills: () => initBillState(),
  upgrades: () => initUpgradesState(),
  utilities: () => initUtilitiesState(),
  phone: () => defaultPhoneState(),
  afterHours: () => defaultAfterHoursState(),
  // Perception plan Phase 3: the transient-signal ring buffer. An empty list
  // is exactly what a save from before this existed should read as, so no
  // migration is needed — same precedent as world.computer.
  signals: () => [],
};

// --- Migration functions (per folder). Stubbed for day-one; iterate here. ---
const MIGRATIONS = {
  meta: [
    // meta 1->2 (scene reader Phase 1): seed meta.scene so a save written
    // before this plan opens inside a valid scene rather than a null one.
    // Existing sessionLog entries carry no sceneId and read as scene 0, so
    // they land in the history drawer under "Earlier" — which is exactly
    // right for "everything that happened before this update". Deliberately
    // does NOT backfill the entries themselves: their room and time were
    // never recorded, and inventing them would be worse than admitting it.
    { from: 1, to: 2, fn: (meta) => {
      if (!meta || typeof meta !== 'object' || meta.scene) return meta;
      const clock = meta.clock || {};
      return {
        ...meta,
        scene: {
          id: 1,
          roomId: null,      // set by the first openScene, on the first move
          startedDay: clock.day ?? 1,
          startedMinutes: clock.minutes ?? CLOCK.startMinutes,
          shouted: [],
        },
      };
    } },
  ],
  player: [
    // player 1->2 (ITEMS section): inventory was mixed-type — bare strings
    // from very early code, {name,qty} objects from placeDelivery. Real
    // stacks are {defId,qty,ownerId,meta}; unmatched legacy names fall
    // through to ITEM_DEFS._unknown with the original text preserved in
    // meta.origName, so no save loses data even if the name doesn't match
    // anything (see ITEMS' migrateInventory/resolveItemDefIdByName).
    { from: 1, to: 2, fn: (player) => ({ ...player, inventory: migrateInventory(player.inventory) }) },
    // player 2->3 (Phase 8): add burnout, alarm, and energyMax fields
    // for saves predating the sleep/alarm system. These are all safe
    // defaults — no alarm, no burnout, energyMax at the starting value.
    { from: 2, to: 3, fn: (player) => ({
      ...player,
      alarm: player.alarm ?? null,
      energyMax: player.energyMax ?? ENERGY.startingMax,
      burnout: player.burnout ?? { consecutiveWorkDays: 0, burnoutLevel: 0, lastWorkDay: 0 },
    }) },
    // player 3->4 (needs rebalance Phase 5): the hunger rhythm + mood
    // impulse model. hoursSinceLastMeal is backfilled FROM the old 0-100
    // hunger display (satietyStart − hunger)/perHour, clamped ≥ 0, so a
    // save mid-day keeps a sensible hunger state instead of snapping to
    // "just ate" — an old hunger of 80 → 2h, 40 → 10h, 0 → 18h (still
    // starving). mealsToday and the moodEvents pool start empty.
    { from: 3, to: 4, fn: (player) => ({
      ...player,
      hoursSinceLastMeal: player.hoursSinceLastMeal ?? Math.max(0, (HUNGER_RHYTHM.satietyStart - (player.hunger ?? 80)) / HUNGER_RHYTHM.satietyPerHour),
      mealsToday: player.mealsToday ?? 0,
      moodEvents: player.moodEvents ?? [],
    }) },
    // player 4->5 (player creation + intro plan, Phases 1-2): the player
    // becomes a person. Three additions, all safe defaults:
    //
    //  - name/surname. The player had NO name at all before this — the only
    //    reference was a dead `gs.player?.name || 'You'` fallback on the save
    //    card. A pre-migration save keeps reading "You" because the fallback
    //    is still there; it does NOT invent a name, since a name the player
    //    never chose is worse than no name, and the studio is where names get
    //    chosen.
    //  - portrait. The prompt/seed pair, never the blob (same reason as
    //    takePhoto's photo records — the image LRU can evict pixels).
    //  - appearance.physical.intimate, matching the npcs 6->7 backfill.
    //    An NPC seeds this off bible.genSeed; the player's appearance record
    //    carries no such field, and a per-key migration fn is handed only the
    //    player object (never meta.seed). So the seed is DERIVED from the
    //    already-rolled appearance itself — stable for a given body, which is
    //    the property that matters: rerunning the migration must not reroll.
    { from: 4, to: 5, fn: (player) => {
      if (!player || typeof player !== 'object') return player;
      const next = {
        ...player,
        name: typeof player.name === 'string' ? player.name : '',
        surname: typeof player.surname === 'string' ? player.surname : '',
        portrait: player.portrait ?? { prompt: '', seed: 0, promptDirty: false },
      };
      const physical = next.appearance?.physical;
      if (physical && typeof physical === 'object' && !(physical.intimate && physical.intimate.genitals)) {
        const rng = seededRng(hashStr(JSON.stringify(physical)), 'player_intimate_backfill');
        next.appearance = {
          ...next.appearance,
          physical: { ...physical, intimate: generateIntimate(rng, next.appearance.gender) },
        };
      }
      return next;
    } },
    // player 5->6 (Intimacy & Voyeurism Phase 11, D8/D15): backfill the
    // knowledge ledger. player.ledger[npcId] is the per-character, day-stamped
    // list of intimacy acts the player participated in or witnessed — Phase 11
    // writes the 'participated' half, the Phase 15 codex reads it. Additive
    // safe default; a save that predates the ledger starts with an empty one
    // rather than a missing object every reader would have to guard against.
    { from: 5, to: 6, fn: (player) => {
      if (!player || typeof player !== 'object') return player;
      return { ...player, ledger: player.ledger ?? {} };
    } },
    // player 6->7 (food-overhaul Phase 2, D2/D3/D4): the kcal metabolism.
    // The Phase 5 hunger clock's real state was hoursSinceLastMeal; the
    // overhaul replaces it with the D3 fullness window while PRESERVING the
    // displayed satiety: old hunger H maps to a legacy 18h window with
    // (90−H)/5 hours consumed, so a save mid-day keeps exactly the bar it
    // showed (hunger 80 → 16h of 18h left → still 80). The D4 ledger and
    // the activity meter start empty and balanced. All additive safe
    // defaults; a save that never ran the overhaul reads identically to
    // the old clock (window 18h, rate 1.0).
    { from: 6, to: 7, fn: (player) => {
      if (!player || typeof player !== 'object') return player;
      const window = HUNGER_RHYTHM.starveHours;
      const h = typeof player.hoursSinceLastMeal === 'number'
        ? player.hoursSinceLastMeal
        : Math.max(0, (HUNGER_RHYTHM.satietyStart - (player.hunger ?? 80)) / HUNGER_RHYTHM.satietyPerHour);
      return {
        ...player,
        fullnessWindowHours: window,
        fullnessRemainingHours: Math.max(0, Math.min(window, window - h)),
        meta: {
          ...(player.meta || {}),
          kcalToday: player.meta?.kcalToday ?? 0,
          kcalBurnedToday: player.meta?.kcalBurnedToday ?? 0,
          energyBalance: player.meta?.energyBalance ?? 'balanced',
          activityEvents: player.meta?.activityEvents ?? [],
        },
      };
    } },
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
    // world 2->3 (Apartment Expansion): the single `hallway` splits into
    // `hallway_a`/`hallway_b`, the single `bathroom` splits into
    // `bathroom_a`/`bathroom_b`. Old room entries are cloned (both halves
    // get a copy of the old cleanliness/capacity), then the old keys are
    // deleted. New rooms (dining, entry, game_room, gym, study, balcony,
    // laundry) don't need migration here — they're lazily spawned by
    // ensureObjectsForBucket on first load, and their room-shell entries
    // are created on first access by SIM's room initialization.
    { from: 2, to: 3, fn: (data) => {
      if (!data || typeof data !== 'object') return data;
      const looksLikeRooms = Object.values(data).some(v => v && typeof v === 'object' && 'capacity' in v);
      if (!looksLikeRooms) return data;
      const migrated = {};
      for (const [roomId, room] of Object.entries(data)) {
        if (roomId === 'hallway') {
          migrated['hallway_a'] = { ...room };
          migrated['hallway_b'] = { ...room };
        } else if (roomId === 'bathroom') {
          migrated['bathroom_a'] = { ...room };
          migrated['bathroom_b'] = { ...room };
        } else {
          migrated[roomId] = room;
        }
      }
      return migrated;
    } },
    // world 3->4 (perception plan Phase 2, D10): strip the dead `odor` key
    // from room shells. Room smell is now DERIVED from the container states
    // that cause it (SIGNALS' deriveStandingSignals), so a stored mirror of it
    // could only ever drift — and nothing reads it any more.
    //
    // Same "only touch things that structurally look like a room-shell map"
    // guard as the two migrations above: the `world` folder holds several
    // differently-shaped keys (rooms/castWeb/quests/events/deliveries/rent)
    // under one migration pass, and this function cannot tell which key it is
    // being handed.
    { from: 3, to: 4, fn: (data) => {
      if (!data || typeof data !== 'object') return data;
      const looksLikeRooms = Object.values(data).some(v => v && typeof v === 'object' && 'capacity' in v);
      if (!looksLikeRooms) return data;
      const migrated = {};
      for (const [roomId, room] of Object.entries(data)) {
        const { odor, ...rest } = room;
        migrated[roomId] = rest;
      }
      return migrated;
    } },
    // world 4->5 (food overhaul D37, 2026-08-18): the apartment STARTS with
    // a working (shabby) cooktop — FACILITY_STARTING_TIERS made kitchen_stove
    // 'functional' so cooking is possible day one, and this hands the same
    // start to saves created under the old 'broken' default. Safe because
    // facility decay floors at 'functional' (renovation locked decision #5)
    // and renovation only ever moves tier UP, so a broken kitchen_stove on
    // disk can only mean "old new-game default", never player-caused neglect
    // — flipping it is the game state the player was supposed to have. Same
    // per-key guard as the room migrations above (the world folder holds
    // many differently-shaped keys under one pass; only the upgrades map has
    // a kitchen_stove entry).
    { from: 4, to: 5, fn: (data) => {
      if (!data || typeof data !== 'object') return data;
      const stove = data.kitchen_stove;
      if (!stove || stove.tier !== 'broken') return data;
      return {
        ...data,
        kitchen_stove: {
          ...stove,
          tier: 'functional',
          // A functional facility starts at full condition (the same
          // startingCondition initUpgradesState/normalizeUpgrades give a
          // fresh game) — a broken-stove save flipping functional with
          // condition 0 would immediately read as "needs repair".
          condition: MAINTENANCE.startingCondition,
        },
      };
    } },
  ],
  npcs: [
    // npcs 1->2 (NPC Overhaul Phase 0): backfill all new fields with
    // defaults for existing saves. Every new field is additive — the
    // additive-default pattern (same as suspicion/clothing) means no
    // consumer breaks, but a formal migration ensures consistency rather
    // than relying on every read site to guard with `|| {}`.
    { from: 1, to: 2, fn: (npc) => migrateNpcToV2(npc) },
    // npcs 2->3 (inventory overhaul Phase 8, D8): backfill npc.inventory
    // from the lifestyle template (NPC.seedNpcInventory) for saves
    // predating NPC possessions. Deterministic per bible.genSeed, and
    // keyed to residency.since (the day they moved in) so a mid-game
    // backfill ages their snack stash from move-in, not day one. An NPC
    // that somehow already carries an inventory passes through untouched.
    { from: 2, to: 3, fn: (npc) => seedNpcInventory(npc, npc?.residency?.since ?? 1) },
    // npcs 3->4 (correctness plan Phase 2, D3): re-derive relPlayer's
    // intimacyLevel/conversationPhase from the stored axes under the rebased
    // formula. Both are DERIVED state, so this recomputes rather than
    // patching — the migration must never be able to disagree with
    // deriveConversationPhase, which is exactly what hand-editing a derived
    // field in a migration would allow.
    //
    // Without this, an existing save keeps its inflated phase (every NPC sat
    // at `familiar` or better from their first exchange) until some later
    // delta happens to re-derive it. Most saves visibly drop a rung here;
    // that is the bug being corrected, not data loss.
    { from: 3, to: 4, fn: (npc) => {
      if (!npc || typeof npc !== 'object' || !npc.relPlayer) return npc;
      const { intimacyLevel, conversationPhase } = deriveConversationPhase(npc.relPlayer);
      return { ...npc, relPlayer: { ...npc.relPlayer, intimacyLevel, conversationPhase } };
    } },
    // npcs 4->5 (knowledge-gossip-memory-plan Phase 1, D1/D2/D3/D10):
    // backfill the belief record onto every fact — provenance/confidence/
    // salience/pinned/emotionalTag — via the same normalizer migrateNpcToV2
    // uses (backfillFactRecordV2). Bare-string and partial-object facts get
    // 'witnessed'/1.0/0.5, pinned per D3 (importance >= significant). The
    // invariant "every fact carries provenance and confidence" is asserted
    // forever after by the plan's harness.
    { from: 4, to: 5, fn: (npc) => migrateFactRecordV2(npc) },
    // npcs 5->6 (knowledge-gossip-memory-plan Phase 3, D9/D20): default
    // memory.openQuestions to [] and assign a stable factId to every held
    // fact that lacks one (backfillOpenQuestionsV2). The open-question
    // lifecycle's factId reference must resolve for facts written before
    // this phase existed. Additive — no fact's provenance/confidence is
    // rewritten (invariant 3).
    { from: 5, to: 6, fn: (npc) => backfillOpenQuestionsV2(npc) },
    // npcs 6->7 (player creation + intro plan, Phase 1): backfill
    // bible.physical.intimate. Derived from the NPC's OWN stored gender and
    // seeded from their OWN genSeed, so the backfill is deterministic and an
    // NPC who existed before this layer gets the same body every time the
    // migration runs — not a fresh roll on each load.
    { from: 6, to: 7, fn: (npc) => {
      if (!npc || typeof npc !== 'object' || !npc.bible) return npc;
      const physical = npc.bible.physical;
      if (!physical || typeof physical !== 'object') return npc;
      if (physical.intimate && physical.intimate.genitals) return npc;   // already migrated
      const rng = seededRng(npc.bible.genSeed || 0, 'intimate_backfill');
      return {
        ...npc,
        bible: {
          ...npc.bible,
          physical: { ...physical, intimate: generateIntimate(rng, npc.bible.gender) },
        },
      };
    } },
    // npcs 7->8 (Settings & Pause Overhaul Phase 6, D13): backfill
    // bible.species = 'human' for every NPC written before the species
    // schema field existed. Pure additive default — the same pattern as the
    // facialHair/typicalAttire schema defaults; a pre-species NPC IS a human,
    // and the describer's human short-circuit keeps their prose identical.
    { from: 7, to: 8, fn: (npc) => {
      if (!npc || typeof npc !== 'object' || !npc.bible) return npc;
      if (npc.bible.species) return npc;   // already migrated / authored
      return { ...npc, bible: { ...npc.bible, species: 'human' } };
    } },
  ],
  images: [],
  snapshots: [],
  objects: [
    // objects 1->2 (Apartment Expansion): the old single `hallway` and
    // `bathroom` rooms became per-wing pairs, so their object buckets have
    // to move. This is a folderFn, not an `fn`: the objects folder stores
    // one kv key *per bucket*, so the per-key transform is handed a single
    // bucket's { objId: instance } map and can neither see nor rename the
    // bucket key. (The first version of this migration was written as an
    // `fn` that matched `bucketKey === 'room_hallway'` against object ids —
    // it never matched anything and silently did nothing.)
    //
    // The contents move to ONE wing rather than being cloned into both.
    // Cloning would have produced two buckets holding objects with
    // identical ids and a stale `bucket` field, and findObjectById
    // (EFFECTS) resolves an id by scanning buckets and taking the first
    // hit — SET_OBJECT_STATE/MOVE_OBJECT/LEAVE_EVIDENCE would have been a
    // coin flip between the two copies.
    //
    // Two objects also changed rooms in the new layout, so their instances
    // are rehomed rather than left where the old layout put them:
    // laundry_hamper (bathroom → laundry) and doormat (hallway → entry,
    // which is where processDeliveriesForDay now looks for packages).
    { from: 1, to: 2, folderFn: (all) => {
      if (!all || typeof all !== 'object') return null;
      const REHOME = { laundry_hamper: 'room_laundry', doormat: 'room_entry' };
      const RENAME = { room_hallway: 'room_hallway_a', room_bathroom: 'room_bathroom_a' };
      const next = {};
      const put = (bucket, obj) => {
        (next[bucket] = next[bucket] || {})[obj.id] = { ...obj, bucket };
      };

      for (const [bucketKey, bucketData] of Object.entries(all)) {
        const target = RENAME[bucketKey];
        if (!target) { next[bucketKey] = bucketData; continue; }
        for (const obj of Object.values(bucketData || {})) {
          if (!obj || !obj.id) continue;
          put(REHOME[obj.defId] || target, obj);
        }
        // Ensure the renamed bucket exists even if it ended up empty, so
        // ensureObjectsForBucket back-fills it instead of respawning from
        // scratch and duplicating whatever we just moved out.
        if (!next[target]) next[target] = {};
      }
      return next;
    } },
    // objects 2->3 (food-overhaul Phase 4, D9/D11): dish maps. A bucket is
    // one kv key holding { objId: instance }; the per-key fn stamps every
    // instance with the additive dish defaults (obj.dishes dish-map,
    // obj.dishUnits, obj.dishwasher load/cycle record — null except on the
    // dishwasher appliance). It also converts the OLD abstract
    // sink.state.dishes enum ('few'/'many') into a real dish map so a
    // pre-overhaul sink full of abstract dishes reads as a sink full of
    // plates/pots — the map is the world state now, the ladder is derived
    // (dishLevelOf), so the vestigial state field is reset to 'clean'.
    { from: 2, to: 3, fn: (bucket) => {
      if (!bucket || typeof bucket !== 'object') return bucket;
      const next = {};
      for (const [id, obj] of Object.entries(bucket)) {
        if (!obj || typeof obj !== 'object') { next[id] = obj; continue; }
        const mig = { ...obj };
        const wasDirty = mig.state?.dishes === 'few' || mig.state?.dishes === 'many';
        mig.dishes = mig.dishes ?? (wasDirty ? (mig.state.dishes === 'many'
          ? { plate: 4, bowl: 2, pot: 1 }
          : { plate: 2, fork: 1 }) : {});
        mig.dishUnits = typeof mig.dishUnits === 'number' ? mig.dishUnits : dishUnitsOf(mig);
        mig.dishwasher = mig.dishwasher ?? (mig.defId === 'dishwasher' ? { load: {}, cycleActiveUntilAbs: 0 } : null);
        if (wasDirty && mig.state) mig.state = { ...mig.state, dishes: 'clean' };
        next[id] = mig;
      }
      return next;
    } },
  ],
};

// A migration entry declares `fn` (a per-key value transform — the common
// case, applied by migrateFolder below) and/or `folderFn` (applied by
// migrateFolderKeys). The distinction matters: checkAndMigrateFolder walks
// the folder one key at a time and hands `fn` a single key's *value*, so a
// per-key transform structurally cannot add, rename or delete keys. Any
// migration that reshapes the key space — splitting room_bathroom into
// room_bathroom_a/_b, say — has to be a folderFn, which receives the whole
// {key: value} map and returns the new one.
function migrateFolder(folder, data, fromVer, toVer) {
  let current = data;
  let ver = fromVer;
  for (const m of MIGRATIONS[folder]) {
    if (m.from === ver && m.to === ver + 1) {
      if (m.fn) current = m.fn(current);
      ver = m.to;
    }
  }
  assert(ver === toVer, `Migration incomplete for ${folder}: at ${ver}, expected ${toVer}`, { folder });
  return current;
}

// Folder-level (key-space) migrations. Runs after the per-key pass so a
// folderFn sees values that are already at the right version.
async function migrateFolderKeys(folder, fromVer, toVer) {
  for (const m of MIGRATIONS[folder]) {
    if (!m.folderFn) continue;
    if (m.from < fromVer || m.to > toVer) continue;
    const keys = await root.kv[folder].keys();
    const all = {};
    for (const k of keys) all[k] = await root.kv[folder].get(k);
    const next = m.folderFn(all);
    if (!next) continue;
    for (const [k, v] of Object.entries(next)) await root.kv[folder].set(k, v);
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, k)) await root.kv[folder].delete(k);
    }
  }
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
    // Key-space reshaping (splits/renames/deletes) — see migrateFolderKeys.
    await migrateFolderKeys(folder, currentVer, targetVer);
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
      // Spread FOLDER_VERSIONS rather than restating it. This literal was a
      // hand-maintained second copy of that table and had already drifted
      // (it still said npcs: 2 after the Phase 8 bump to 3) — the same
      // enumerate-in-two-places failure SAVE_KEYS exists to prevent. It was
      // benign only because the npcs folder is empty at this point and
      // seedNpcInventory is idempotent; the next drift might not be.
      versions: { ...FOLDER_VERSIONS },
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
let autosaveTimer = null;

// getState is a zero-arg callback returning the current game state (or
// null). STATE takes it as a parameter rather than reaching into a UI
// global directly, keeping the section boundary intact while still letting
// the timer see whatever currentGameState points to at each tick.
function startAutosave(getState) {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
  // Menu overhaul Phase 10: the Options screen's Autosave toggle (kv.menu
  // 'options') can switch autosaving off. isAutosaveEnabled() lives in
  // MENU — defined after STATE at load, but only CALLED at runtime (the
  // same forward-reference rule every startX in this file relies on).
  // Absent (nothing defined it yet) means on — the historical default.
  if (typeof isAutosaveEnabled === 'function' && !isAutosaveEnabled()) return;
  // Settings & Pause Overhaul Phase 4 (D6): the timer period is a runtime
  // read from settings (autosaveIntervalMs lives in SETTINGS, which loads
  // before STATE). Changing the interval re-arms the timer through
  // SETTINGS' setSettings — this call just honors whatever period is set.
  autosaveTimer = setInterval(() => saveAtBoundary('timer', getState ? getState() : null), autosaveIntervalMs());
}

// Stops ticking without restarting — used at the start of a new-game
// transition (UI's approveCastAndStartGame), which awaits prose expansion
// and several kv writes that can easily exceed the autosave interval.
// Without this, a stale timer from the PREVIOUS game could fire
// mid-transition (its getState closure still resolves to the old
// currentGameState, since that module-level binding isn't reassigned until
// syncGameStateFromKv completes) and write the old game's NPCs back into kv
// via the debounced queue, after writeGeneratedGameState already wrote the
// new cast — polluting the new game with leftover roommates from the old
// one.
function stopAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
}

// --- AfterHours (Site Expansion Phase 6): durable site data ---
// The site's player records persist as their own world sub-key so
// history/liked/searchHistory/continueWatching survive reloads independent
// of the wholesale world.computer write. Lazy-init for old saves (the
// world.phone pattern, below) — nothing here needs a migration.
function defaultAfterHoursState() {
  return {
    history: [],             // most-recent-first, capped AH_TUNING.historyCap (100)
    liked: [],               // most-recent-first, capped AH_TUNING.likedCap (200)
    searchHistory: [],       // most-recent-first, capped AH_TUNING.searchHistoryCap (20)
    continueWatching: null,  // { clipId, ...snapshot, day, tick } | null
    metNpcIds: [],           // Phase 7 — Hot Singles the player said hi to
  };
}

// Defensive normalization for hand-typed/partially-written saves. Records
// are full clip snapshots plus the plan's day/tick fields; the site's own
// lookups re-derive anything missing (see AH_recordToClip in afterhours.js),
// so preserving array shape is enough here.
function normalizeAfterHoursState(raw) {
  if (!raw || typeof raw !== 'object') return defaultAfterHoursState();
  const asArr = (v) => Array.isArray(v) ? v : [];
  return {
    history: asArr(raw.history),
    liked: asArr(raw.liked),
    searchHistory: asArr(raw.searchHistory),
    continueWatching: (raw.continueWatching && typeof raw.continueWatching === 'object') ? raw.continueWatching : null,
    metNpcIds: asArr(raw.metNpcIds),
  };
}

// Persist the live game state at a save boundary (phase change, scene exit,
// before an LLM call, manual save, or the autosave timer). gameState is the
// in-memory object UI mutates directly during play — without it there is
// nothing new to write and this only stamps the save timestamp.
async function saveAtBoundary(reason, gameState) {
  if (gameState) {
    const now = Date.now();
    // Phase 9: real time between boundaries is real play time. saveTimestamp
    // is stamped here, so the delta from the previous boundary is play that
    // happened; the save record's meta.playtimeMs reads the accumulator.
    gameState.meta.playtimeMs = (gameState.meta.playtimeMs || 0) + (now - (gameState.meta.saveTimestamp || now));
    gameState.meta.saveTimestamp = now;
    // Lazy-init guarantee (the world.phone pattern): every later reader can
    // trust world.phone/world.afterHours exist. Both are then picked up by
    // the SAVE_KEYS loop below like any other world key.
    gameState.world.phone = gameState.world.phone || defaultPhoneState();
    gameState.world.afterHours = gameState.world.afterHours || defaultAfterHoursState();
    // The persisted key list is SAVE_KEYS and nothing else — the single
    // table both the autosave path and the snapshot path (captureSave)
    // walk, so a new world sub-key joins both with one edit.
    for (const { folder, keys, all } of SAVE_KEYS) {
      const src = folderSourceMap(gameState, folder);
      if (all) {
        // npcs/objects: one kv key per record — write everything present.
        for (const [id, data] of Object.entries(src)) {
          queueWrite(folder, id, data);
        }
      } else {
        for (const key of keys) {
          let val = src[key];
          if (val === undefined && folder === 'world' && WORLD_KEY_FALLBACKS[key]) {
            val = WORLD_KEY_FALLBACKS[key]();
          }
          queueWrite(folder, key, val);
        }
      }
    }
  } else {
    const meta = await root.kv.meta.get('meta') || {};
    meta.saveTimestamp = Date.now();
    queueWrite('meta', 'meta', meta);
  }
  await forceFlush();
  // Phase 9: boundary autosaves rotate a save record (the 5-deep ring) so
  // the save menu always has recent recoverable points. Manual/quick/exit
  // writes go through their own handlers (saveToSlot); only the reasons in
  // SAVE_TUNING.recordReasons land here.
  if (gameState && SAVE_TUNING.recordReasons.includes(reason)) {
    await saveToSlot(gameState, 'auto');
  }
  console.debug('Autosaved at boundary:', reason);
}

// --- Atomic update wrapper (mandatory for read-modify-write) ---
// Currently unused (all real call sites go through the per-folder
// updateX functions above, or through multiKeyOp), but fixed to match
// their pattern rather than left as a landmine: kv-plugin's update()
// resolves to the underlying IDB transaction result, not the callback's
// return value, so a caller trusting this function's return value would
// get undefined back instead of the updated record (see updatePlayer/
// updateWorld/updateMeta above, and getPresentNpcIds's
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

// updateNpc (read-modify-write an npc through kv) is deliberately gone:
// every former caller — applyProposal, processRentForDay,
// checkQuestCompletion — now mutates currentGameState.npcs in memory and
// lets the next saveAtBoundary persist it. A kv round-trip mid-turn reads
// a snapshot from before the clock loop's in-flight checkpoint changes and
// writes it back over them. Use the in-memory object; setNpc below is the
// escape hatch when a full replacement really does need to hit kv now.

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

// Remove one image from the LRU — both the blob folder and the index.
// Used by the menu slideshow to enforce its own share cap (deviation 4:
// the menu keeps a bounded ring of its cache keys and deletes the evicted
// ones itself, instead of letting unbounded menu generation churn the
// shared LRU against scene images).
async function deleteCachedImage(key) {
  await root.kv.images.delete(key);
  await root.kv.meta.update('meta', (meta) => {
    meta = meta || {};
    const imageIndex = { ...(meta.imageIndex || {}) };
    delete imageIndex[key];
    return { ...meta, imageIndex };
  });
}

// ===== SAVE / LOAD =====
// (saveGame is gone — Phase 9's save system writes through saveToSlot +
// saveAtBoundary; a bare 'manual' persist is `saveAtBoundary('manual', gs)`.)

async function hasSave() {
  const meta = await root.kv.meta.get('meta');
  return !!(meta && meta.seed);
}

async function loadGameState() {
  await initStorage();
  const meta = await getMeta();
  if (!meta || !meta.seed) return null;

  const player = await getPlayer();
  // The player's appearance is new; every save written before it has none.
  // Backfilled here rather than as a `player` folder migration on purpose —
  // a migration `fn` receives one key's VALUE and nothing else, and a rolled
  // appearance needs the save's seed to stay deterministic (reload the same
  // save twice, get the same person). meta.seed is in hand right here and
  // nowhere in there, so this is the honest place for it. Same pattern as
  // the WORLD_KEY_FALLBACKS above: absent key, safe default at read time.
  if (player && !player.appearance) player.appearance = generatePlayerAppearance(meta.seed, null);
  const npcs = await getAllNpcs();
  const rooms = await getWorld('rooms') || {};
  const castWeb = await getWorld('castWeb') || {};
  // Intimacy & Voyeurism Phase 12: the relationship store. Empty for saves
  // written before Phase 12 — records form live from co-location, so there
  // is nothing to backfill (same additive-default pattern as moveInOffers).
  const relationships = await getWorld('relationships') || {};
  const quests = await getWorld('quests') || { active: [], completed: [] };
  const events = await getWorld('events') || [];
  const deliveries = await getWorld('deliveries') || [];
  // playerShare replaced perResident when rent stopped being an even split
  // (see SIM's computeRent). A save written before that has the old field;
  // it's recomputed from live residency on the next computeRent call, so
  // the fallback here just needs a sane shape, not a migration.
  const rent = await getWorld('rent')
    || { total: ECONOMY.rent.total, playerShare: ECONOMY.rent.total, roommateShares: {}, coveredByRoommates: 0, contributorCount: 0 };
  // A new kv key rather than a version bump — defaultComputerState()
  // (COMPUTER) is exactly what a save from before the computer existed
  // should read as. A save from after the computer existed but before its
  // windowed-desktop rework has a `computer` key in the old single-`view`
  // shape though, so a real normalizer is needed here, not just a
  // fallback — see COMPUTER's normalizeComputerState.
  const computer = normalizeComputerState(await getWorld('computer'));
  // Phase 6 taxes state — falls back to a fresh quarter accumulator for
  // a save written before taxes existed. quarterDeductions, lastQuarterOwed,
  // and lastQuarterPaid are new in Phase 6; old saves get zeros.
  const taxes = await getWorld('taxes') || { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0, quarterDeductions: 0, lastQuarterOwed: 0, lastQuarterPaid: 0 };
  // Phase 3 bills — falls back to a fresh initBillState() for a save from
  // before bills existed. Old saves had no `bills` key; the clean-break
  // migration (when it lands) will discard them entirely, but this keeps
  // the game playable for now.
  const bills = await getWorld('bills') || initBillState();
  // Phase 4 upgrades — falls back to a fresh initUpgradesState() for a
  // save from before upgrades existed. Old saves get a disrepair state
  // (everything broken) which the player then restores. This is a
  // playable but harsh fallback; the clean-break migration will discard
  // old saves entirely when it lands.
  // Renovation overhaul + Phase 9: normalize the persisted upgrades —
  // prunes the dead shared `bedroom_habitability` key (its state maps onto
  // the four per-bedroom facilities), backfills facilities a save predates
  // from FACILITY_STARTING_TIERS so the RenoFix dashboard renders every
  // facility, and backfills the `condition` field for pre-maintenance saves.
  // See normalizeUpgrades (SIM).
  const upgrades = normalizeUpgrades(await getWorld('upgrades'));
  // Phase 5 utility meters — falls back to fresh counters for a save from
  // before metering existed. Old saves had no `utilities` key; the flat
  // bill amounts still apply as a fallback in computeBillAmount when
  // utilities is absent.
  const utilities = await getWorld('utilities') || initUtilitiesState();
  // Renovation overhaul: active/completed contracted jobs. Falls back to an
  // empty array for saves written before renovationJobs existed.
  const renovationJobs = await getWorld('renovationJobs') || [];
  // Visit spine (external-world plan Phase 1): the "who is onsite and why"
  // queue. Falls back to an empty array for saves written before visits
  // existed — an in-flight job on such a save gets its crew visits via
  // processVisitsForDay's rollover backstop, no migration needed.
  const visits = await getWorld('visits') || [];
  // Meal commitments (inventory overhaul Phase 7): the resident-side
  // schedule-override queue. Empty for saves written before Phase 7 — a
  // commitment is created live at invite time, so there is nothing to
  // backfill (same pattern as moveInOffers).
  const commitments = await getWorld('commitments') || [];
  // Food delivery (external-world plan Phase 5): placed DoorDrop orders.
  // Empty for saves written before food existed; an order in flight survives
  // a reload because its driver's visit is in `visits` alongside it.
  const foodOrders = await getWorld('foodOrders') || [];
  const groceryOrders = await getWorld('groceryOrders') || [];
  // Friends of roommates (external-world plan Phase 6): the friend-stub table.
  // Empty for saves written before Phase 6 — ensureSocialCircles refills it at
  // the next day rollover, so no migration is needed.
  const externalStubs = await getWorld('externalStubs') || {};
  // Escorts (external-world plan Phase 7): the persistent roster and booking
  // ledger. Empty for saves written before Phase 7 — ensureEscortRoster
  // backfills the roster on first browse/day rollover, so no migration.
  const escortRoster = await getWorld('escortRoster') || [];
  const escortBookings = await getWorld('escortBookings') || [];
  // Hot Singles (AfterHours Site Expansion Phase 7): roster membership.
  // Empty for saves written before Phase 7 — ensureHotSinglesRoster
  // backfills on first browse/day rollover, so no migration.
  const hotSinglesRoster = await getWorld('hotSinglesRoster') || [];
  // Outside partners (Intimacy & Voyeurism Phase 14): the residentId →
  // { npcId, sinceDay, lastVisitDay } index. Empty for saves written before
  // Phase 14 — ensureOutsidePartners backfills at the next day rollover, so
  // no migration (the partner NPCs themselves persist in the npcs folder).
  const outsidePartners = await getWorld('outsidePartners') || {};
  // Intimacy & Voyeurism Phase 18: the pregnancy lifecycle store. Read via
  // the SAME additive-default pattern as relationships/outsidePartners — an
  // absent key on an old save loads as [], no migration.
  const pregnancies = await getWorld('pregnancies') || [];
  // Food-overhaul Phase 6 (D14): auto-cook mastery proofs (recipeId → best
  // grade cooked). Same additive-default pattern as relationships — absent
  // on an old save, and instant cook is gated behind the proof anyway.
  const autoCookCleared = await getWorld('autoCookCleared') || {};
  // Move-in offers (external-world plan Phase 8): pending vouches for an
  // external NPC to move in. Empty for saves written before Phase 8 — an
  // offer is created live in conversation, so there is nothing to backfill.
  const moveInOffers = await getWorld('moveInOffers') || [];
  // Contractor tutorial (contractor doc Phase 3): one-shot tutorial/milestone flags.
  const flags = await getWorld('flags') || {};
  // BrineOS Phase 2: phone shell nav state (Phase 3). Presence is derived
  // from the object bucket, so this is the whole persisted shape.
  const phone = normalizePhoneState(await getWorld('phone'));
  // AfterHours (Site Expansion Phase 6): durable site data. Empty for saves
  // written before Phase 6 — lazy-init by defaultAfterHoursState, filled as
  // the player browses, so no migration.
  const afterHours = normalizeAfterHoursState(await getWorld('afterHours'));

  const gameState = {
    meta,
    player,
    npcs,
    // Reconstruct npcIds in slot order from the seed (the ids are
    // deterministic: genSeededNpcId(seed, slotIndex)). Only covers
    // seed-generated residents — dynamically imported characters
    // (genNpcId) are appended by Object.keys order, which is fine since
    // npcIds is only consumed during character creation, not gameplay.
    npcIds: Object.keys(npcs).filter(id => id.startsWith('npc_')),
    // droppedConstraints is persisted in meta by writeGeneratedGameState.
    droppedConstraints: meta.droppedConstraints || [],
    world: { rooms, castWeb, relationships, quests, events, deliveries, renovationJobs, visits, commitments, foodOrders, groceryOrders, externalStubs, escortRoster, escortBookings, moveInOffers, rent, computer, taxes, bills, upgrades, utilities, phone, afterHours, hotSinglesRoster, flags, outsidePartners, pregnancies, autoCookCleared },
  };
  // Rebuild the live room graph from base + whichever structural upgrades
  // this save has built (floorplan plan Phase 6). MUST run before anything
  // reads ROOM_ADJACENCY/ROOM_THRESHOLDS for this save — a game with the
  // ensuite built has a different apartment, and object spawning, pathing
  // and signal propagation all need to be looking at the right one.
  applyStructuralUpgrades(gameState);
  // Lazily spawns any bucket missing from kv (a pre-WORLD save, or a
  // resident who moved in since the last full write) rather than needing a
  // destructive migration — see WORLD's ensureAllObjectBuckets.
  gameState.objects = await ensureAllObjectBuckets(gameState);
  // Room shells for any room in the CONFIG that this save has never seen
  // (floorplan plan Phase 1 added `changing_room`). Same "absent key, safe
  // default at read time" convention as the player.appearance fallback
  // above, and self-healing for any room a later layout adds — a migration
  // would have to be written again next time. Runs AFTER the object buckets
  // exist so cleanliness is derived from real contents rather than guessed.
  for (const roomId of ALL_ROOMS) {
    if (gameState.world.rooms[roomId]) continue;
    gameState.world.rooms[roomId] = {
      capacity: ROOMS[roomId].capacity,
      cleanliness: recomputeRoomCleanliness(gameState.objects[`room_${roomId}`]),
      lastEvent: null,
    };
    queueWrite('world', 'rooms', gameState.world.rooms);
  }
  // Intimacy & Voyeurism Phase 6 (D11): a save written before the wardrobe
  // landed carries no outfit/clothing on its NPCs. Derive both from each
  // resident's bedroom wardrobe exactly as resolveTick pass 2 keeps deriving
  // them — additive default, never overwriting a value a Phase 6-era save
  // actually persisted — so the first render after a reload already shows a
  // real outfit and the intimate gate reads a real state instead of an
  // undefined one. The wardrobe buckets are guaranteed present by
  // ensureAllObjectBuckets above; visitors stay untouched (their sim is
  // dormant, and they keep whatever they arrived in).
  for (const npc of Object.values(gameState.npcs)) {
    if (npc.residency?.status !== 'resident') continue;
    const block = npc.schedule?.currentBlock || 'morning';
    if (!npc.outfit) npc.outfit = npcOutfitForContext(npc, gameState, block, null);
    if (!npc.clothing) npc.clothing = 'dressed';
  }
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

  // Friends of roommates (external-world plan Phase 6): give the founding
  // cast their social circles before the first write, so a brand-new game
  // ships with them rather than growing them at the first day rollover (the
  // rollover call stays, as the backstop for later move-ins and old saves).
  ensureSocialCircles(gameState);
  // Escorts (external-world plan Phase 7): pre-generate the roster before the
  // first write so a brand-new game ships with escorts in the app (the day-
  // rollover / first-browse call stays, as the backstop for old saves).
  ensureEscortRoster(gameState);
  // Hot Singles (AfterHours Site Expansion Phase 7): pre-generate the roster
  // before the first write exactly like the escorts — a brand-new game ships
  // with the site's six singles (the first-browse / rollover call stays, as
  // the backstop for old saves).
  ensureHotSinglesRoster(gameState);
  // Outside partners (Intimacy & Voyeurism Phase 14): give eligible residents
  // their long-distance partner before the first write, so a brand-new game
  // ships with the couples already in place (the day-rollover call stays, as
  // the backstop for later move-ins and old saves).
  ensureOutsidePartners(gameState);

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
    // Phase 9 lineage: a fresh playthrough is its own run; the first save
    // captures it as saveIndex 1 with no parent. lastSaveId null means "no
    // save loaded yet this session" — captureSave chains the first one to
    // nothing, every later one to whatever came before.
    runId: genRunId(),
    saveIndex: 0,
    lastSaveId: null,
    playtimeMs: 0,
  });

  // The new-game write walks the SAME SAVE_KEYS table as the autosave path
  // and the snapshot path — a new world sub-key joins all three with one
  // edit (the invariant). meta is excluded: setMeta above is the one true
  // write for the fresh meta (a SIM_generateHouse state has no meta yet).
  // phone/afterHours are lazy-inited beside the write (the world.phone
  // pattern) before the loop picks them up.
  gameState.world.phone = gameState.world.phone || defaultPhoneState();
  gameState.world.afterHours = gameState.world.afterHours || defaultAfterHoursState();
  for (const { folder, keys, all } of SAVE_KEYS) {
    if (all || folder === 'meta') continue; // npcs/objects below (with stale-key sweeps)
    for (const key of keys) {
      let val = folder === 'world' ? gameState.world[key] : gameState[folder];
      if (val === undefined && folder === 'world' && WORLD_KEY_FALLBACKS[key]) {
        val = WORLD_KEY_FALLBACKS[key]();
      }
      await root.kv[folder].set(key, val);
    }
  }

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

// ===== SAVE SYSTEM V2 (inventory overhaul Phase 9, D9/D10) =====
// VN-style slot grid on kv. kv.saves holds the full records, one key per
// slot (manual_0..manual_11 plus grown, auto_0..auto_4, quick, exit);
// kv.saveIndex holds a lightweight list of summaries the menu renders
// cards from WITHOUT deserializing any payload. runId groups saves under a
// playthrough; parentSaveId + saveIndex record lineage so the branching-tree
// view is a later pure-UI addition with zero migration. Records follow the
// plan's save-record shape: { saveId, runId, parentSaveId, saveIndex, kind,
// createdAt, meta (card summary), payload (full folder snapshot) }.

function genRunId() {
  return 'run_' + orbitalRandom().toString(36).substring(2, 10);
}

function genSaveId() {
  return 'sv_' + orbitalRandom().toString(36).substring(2, 12);
}

// Build the per-slot index entry (summary, no payload) from a record. The
// card render surface is the SAME object the record carries — one shape,
// two writers.
function recordToIndexEntry(record) {
  return {
    saveId: record.saveId,
    slotId: record.slotId,
    kind: record.kind,
    runId: record.runId,
    parentSaveId: record.parentSaveId,
    saveIndex: record.saveIndex,
    createdAt: record.createdAt,
    meta: record.meta,
  };
}

async function getSaveIndex() {
  const idx = await root.kv.saveIndex.get('index');
  return Array.isArray(idx) ? idx : [];
}

async function setSaveIndex(list) {
  await root.kv.saveIndex.set('index', list);
}

async function upsertIndexEntry(entry) {
  const list = await getSaveIndex();
  // Keyed by SLOT, not saveId: overwriting a slot produces a brand-new
  // saveId, and matching on saveId would stack a second index entry per
  // overwrite (the index would grow without bound while the ring rotates).
  const i = list.findIndex(e => e.slotId === entry.slotId);
  if (i >= 0) list[i] = entry; else list.push(entry);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // newest first
  await setSaveIndex(list);
  return list;
}

// Rebuild the index from kv.saves — recovery/self-heal if the index and the
// records ever disagree (e.g. an overwrite landed but the index update was
// interrupted). Cheap: kv.saves holds at most ~30 small records.
async function rebuildSaveIndex() {
  const keys = await root.kv.saves.keys();
  const list = [];
  for (const slotId of keys) {
    const record = await root.kv.saves.get(slotId);
    if (record && record.saveId) list.push(recordToIndexEntry(record));
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  await setSaveIndex(list);
  return list;
}

async function dropIndexEntry(slotId) {
  const list = await getSaveIndex();
  const next = list.filter(e => e.slotId !== slotId);
  await setSaveIndex(next);
  return next;
}

// Full folder snapshot from the live in-memory state, walking SAVE_KEYS —
// the invariant that makes the whole design hold (a new world sub-key
// joins the save the moment it joins SAVE_KEYS; there is nowhere else to
// forget it).
function captureSavePayload(gs) {
  const payload = {};
  for (const { folder, keys, all } of SAVE_KEYS) {
    const src = folderSourceMap(gs, folder);
    payload[folder] = {};
    if (all) {
      for (const [id, data] of Object.entries(src)) payload[folder][id] = data;
    } else {
      for (const key of keys) {
        let val = src[key];
        if (val === undefined && folder === 'world' && WORLD_KEY_FALLBACKS[key]) {
          val = WORLD_KEY_FALLBACKS[key]();
        }
        if (val !== undefined) payload[folder][key] = val;
      }
    }
  }
  return payload;
}

// Build a save record from the live in-memory state. Mutates gs.meta the
// same way saveAtBoundary does (runId/saveIndex/lastSaveId lazy-init) — the
// surrounding write persists meta, so the lineage is durable, not just
// in-memory. opts.sceneKey is the image-cache key of the scene currently on
// screen (thumbnail reuses the LRU blob cache in kv.images — a cache key,
// never a second copy of the image); when absent it is recomputed from the
// present NPCs.
function captureSave(gs, kind, opts = {}) {
  const meta = gs.meta || {};
  const clock = meta.clock || {};
  meta.runId = meta.runId || genRunId();
  meta.saveIndex = (meta.saveIndex ?? 0) + 1;
  const saveId = genSaveId();
  const parentSaveId = meta.lastSaveId || null;
  meta.lastSaveId = saveId;

  const roomId = gs.player?.location;
  const minutes = clock.minutes ?? CLOCK.startMinutes;
  // character-cutout-scene-rendering-plan, Phase 3: the thumbnail store
  // wants a kv.images key for whatever is CURRENTLY DISPLAYED as the scene
  // backdrop — since the switch, that is the plate (composeSceneKey/
  // getSceneImage are retired; the cast is drawn as separate cutout
  // layers, not part of any single cacheable "scene photo" a thumbnail
  // could point at). Most callers pass opts.sceneKey straight from the DOM
  // (ui.js's currentSceneKey(), reading #scene-img's data-scene-key, which
  // renderScene now stamps with the plate key) — this recompute is only the
  // fallback for autosaves, which never pass it.
  const sceneKey = opts.sceneKey
    || (roomId ? plateKey(roomId, clock.phase || getPhase(minutes), sceneDetailSignature(gs.objects?.[`room_${roomId}`]), imageStyleToken()) : null);

  const log = meta.sessionLog || [];
  const headlineEntry = [...log].reverse()
    .find(e => e && typeof e.text === 'string' && ['narration', 'dialogue', 'action'].includes(e.type))
    || log[log.length - 1];
  const headline = headlineEntry?.text && typeof headlineEntry.text === 'string'
    ? (headlineEntry.text.length > 160 ? headlineEntry.text.slice(0, 160) + '…' : headlineEntry.text)
    : null;

  const castNames = Object.values(gs.npcs || {})
    .filter(n => n?.residency?.status !== 'former')
    .map(n => n?.bible?.name || 'Unknown');

  const record = {
    saveId,
    slotId: null, // assigned by writeSaveRecord
    runId: meta.runId,
    parentSaveId,
    saveIndex: meta.saveIndex,
    kind,
    createdAt: Date.now(),
    meta: {
      day: clock.day ?? 1,
      minutes,
      phase: clock.phase || getPhase(minutes),
      roomId,
      money: gs.player?.money ?? 0,
      playerName: gs.player?.name || 'You',
      castNames,
      thumbKey: sceneKey,
      headline,
      playtimeMs: meta.playtimeMs || 0,
      gameVersion: GAME_VERSION,
      folderVersions: { ...FOLDER_VERSIONS },
    },
    payload: captureSavePayload(gs),
  };
  return record;
}

// Write a record to its slot + refresh the lightweight index. The lineage
// fields captureSave stamped on gs.meta are reached through the payload
// snapshot (payload.meta IS gs.meta) and pushed to kv.meta here so the next
// capture in this session chains parentSaveId correctly.
async function writeSaveRecord(record, slotId) {
  record.slotId = slotId;
  await root.kv.saves.set(slotId, record);
  await upsertIndexEntry(recordToIndexEntry(record));
  if (record.payload?.meta?.meta) {
    await root.kv.meta.set('meta', record.payload.meta.meta);
  }
  return record;
}

// Save the live game state to a slot. slotId absent → kind decides:
// manual = lowest free manual slot (grow on demand), auto = the oldest
// autosave (rotating ring), quick/exit = their fixed slots.
async function saveToSlot(gs, kind, opts = {}) {
  let target = opts.slotId;
  if (!target) {
    if (kind === 'quick' || kind === 'exit') target = kind;
    else if (kind === 'auto') target = await rotateAutosaveSlot();
    else target = await allocateManualSlot();
  }
  const record = captureSave(gs, kind, { sceneKey: opts.sceneKey });
  await writeSaveRecord(record, target);
  return record;
}

async function allocateManualSlot() {
  const index = await getSaveIndex();
  const used = new Set();
  for (const e of index) {
    const m = /^manual_(\d+)$/.exec(e.slotId || '');
    if (m) used.add(Number(m[1]));
  }
  for (let i = 0; i < SAVE_TUNING.manualBaseSlots; i++) {
    if (!used.has(i)) return `manual_${i}`;
  }
  // Base grid full — grow on demand above it.
  let n = SAVE_TUNING.manualBaseSlots;
  while (used.has(n)) n++;
  return `manual_${n}`;
}

async function rotateAutosaveSlot() {
  const index = await getSaveIndex();
  const autos = index.filter(e => e.kind === 'auto').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (autos.length < SAVE_TUNING.autosaveDepth) {
    const used = new Set(autos.map(e => Number(String(e.slotId).split('_')[1]) || 0));
    for (let i = 0; i < SAVE_TUNING.autosaveDepth; i++) {
      if (!used.has(i)) return `auto_${i}`;
    }
  }
  return autos.length > 0 ? autos[0].slotId : 'auto_0'; // oldest overwritten
}

async function deleteSaveSlot(slotId) {
  await root.kv.saves.delete(slotId);
  await dropIndexEntry(slotId);
}

async function saveCapacityInfo() {
  const index = await getSaveIndex();
  const total = index.length;
  return {
    total,
    free: Math.max(0, SAVE_TUNING.maxTotalSaves - total),
    warn: total >= SAVE_TUNING.maxTotalSaves - SAVE_TUNING.warnNearLimit,
  };
}

// Get the full record for a slot (index entry + payload). Returns null if
// the slot is empty or its record is missing.
async function getSaveRecord(slotId) {
  const record = await root.kv.saves.get(slotId);
  return record || null;
}

// The slot id space, ordered for the grid: manual slots first (base range +
// any grown above it, both from the index), then the autosave ring, then
// quick + exit. Occupied slots carry their index entry; empty ones are
// placeholders. The menu renders from this — kv.saveIndex alone, never a
// payload.
async function buildSaveSlotGrid() {
  const index = await getSaveIndex();
  const bySlot = new Map(index.map(e => [e.slotId, e]));
  const manualIds = new Set();
  for (const e of index) if (/^manual_\d+$/.test(e.slotId || '')) manualIds.add(e.slotId);
  for (let i = 0; i < SAVE_TUNING.manualBaseSlots; i++) manualIds.add(`manual_${i}`);
  const manual = [...manualIds].sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const auto = [];
  for (let i = 0; i < SAVE_TUNING.autosaveDepth; i++) auto.push(`auto_${i}`);
  const order = ['quick', 'exit'];
  const sections = [
    { label: 'Manual saves', slotIds: manual },
    { label: 'Autosaves', slotIds: auto },
    { label: 'Quick & exit', slotIds: order },
  ];
  return sections.map(sec => ({
    label: sec.label,
    slots: sec.slotIds.map(slotId => ({ slotId, entry: bySlot.get(slotId) || null })),
  }));
}

// Install a record's payload into kv and run the recorded folder versions
// up through the existing migration chain, then rebuild the in-memory state.
// Refuses a NEWER save (recorded version > current — importing a save from
// a newer build must be surfaced as a warning, not silently mangled).
async function restoreSave(record) {
  if (!record || !record.payload) return null;
  const recordedVersions = record.payload.meta?.meta?.versions || {};
  for (const [folder, ver] of Object.entries(recordedVersions)) {
    if (typeof FOLDER_VERSIONS[folder] === 'number' && ver > FOLDER_VERSIONS[folder]) {
      throw new Error(`This save was written by a newer version of the game (${folder} v${ver} > v${FOLDER_VERSIONS[folder]}). Please update the game before loading it.`);
    }
  }
  await initStorage(); // folders exist before the writes below
  for (const [folder, data] of Object.entries(record.payload)) {
    if (!root.kv[folder]) continue;
    for (const [key, value] of Object.entries(data || {})) {
      await root.kv[folder].set(key, value);
    }
  }
  // Stale keys from a later state must not leak into the loaded save: an
  // NPC who moved in after this snapshot isn't part of it, and an object
  // bucket spawned later isn't either. Same stale-key sweep
  // writeGeneratedGameState does for a new game.
  const expectedNpcKeys = new Set(Object.keys(record.payload.npcs || {}));
  for (const k of await root.kv.npcs.keys()) {
    if (!expectedNpcKeys.has(k)) await root.kv.npcs.delete(k);
  }
  const expectedObjKeys = new Set(Object.keys(record.payload.objects || {}));
  for (const k of await root.kv.objects.keys()) {
    if (!expectedObjKeys.has(k)) await root.kv.objects.delete(k);
  }
  // The installed meta carries the recorded folderVersions; loadGameState's
  // initStorage runs each folder's MIGRATIONS chain from there up to the
  // current version (snapshot-before-migrate included) and rebuilds state.
  return await loadGameState();
}

// ===== EXPORT / IMPORT =====
// --- D17 (knowledge-gossip-memory-plan Phase 5) — the schema-guarded
// single-field writer. The Character Studio's Edit Mode routes every edit
// through this so it can change any *valid* value but cannot corrupt a save:
// out-of-range numbers, enum violations and type mismatches are rejected
// exactly where the save validator would reject them, and valid values come
// back normalized (strings truncated to maxLength, array items defaulted per
// itemFields) — the same normalization a save round-trip applies.
//
// `path` is dotted, with `[n]` for array elements:
//   'bible.name'  'bible.temperament.warmth'  'bible.physical.hair.color'
//   'bible.interests[0].name'  'bible.sampleLines[1]'
//   'relPlayer.trust'  'needs.hunger'  'residency.status'
//   'memory.facts[0].importance'  'mood'
// The first segment is 'bible' or a mutable (top-level) field name; the
// rest walk CHARACTER_SCHEMA's nested `fields` / `itemFields` (config.js),
// the exact schema validateCharacter validates whole bibles against — two
// validators over one schema cannot drift apart.
//
// Returns { ok:true, value } (normalized) or { ok:false, error }.
function parseSchemaPath(path) {
  const tokens = [];
  for (const bit of String(path).split('.')) {
    // A segment may be a key, an index ('[0]'), or both ('interests[0]').
    const m = /^([^[\]]*)(?:\[(\d+)\])?$/.exec(bit);
    if (!m || (m[1] === '' && m[2] === undefined)) return null;
    const t = {};
    if (m[1] !== '') t.k = m[1];
    if (m[2] !== undefined) t.i = Number(m[2]);
    tokens.push(t);
  }
  return tokens;
}

// Walk CHARACTER_SCHEMA down `tokens`. Returns { spec, arrayElement } where
// arrayElement means the value being validated IS an element of an array
// (tokens ended at an index), or { error }.
function resolveNpcFieldSpec(path) {
  const tokens = parseSchemaPath(path);
  if (!tokens || tokens.length === 0) return { error: `Invalid path: ${path}` };
  const first = tokens[0];
  if (!first.k) return { error: `Invalid path: ${path}` };
  // The bible root is a FIELD MAP (CHARACTER_SCHEMA.bible is not itself a
  // spec node with type/fields — its keys ARE the fields); the mutable root
  // is a map of spec nodes. Both are handled by the same walk below via the
  // rootIsFieldMap flag.
  let spec;
  let rootIsFieldMap = false;
  if (first.k === 'bible') {
    spec = CHARACTER_SCHEMA.bible;
    rootIsFieldMap = true;
  } else {
    spec = (CHARACTER_SCHEMA.mutable || {})[first.k];
    if (!spec) return { error: `Unknown field: ${first.k}` };
  }
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.k !== undefined) {
      let node;
      if (rootIsFieldMap) {
        node = spec[t.k];
        rootIsFieldMap = false;
      } else if (spec && spec.type === 'object' && spec.fields) {
        node = spec.fields[t.k];
      } else {
        node = undefined;
      }
      if (node === undefined) return { error: `Unknown field: ${t.k}` };
      spec = node;
    }
    if (t.i !== undefined) {
      if (!spec || spec.type !== 'array') return { error: `Not an array: ${path}` };
      i++;
      if (i >= tokens.length) return { spec, arrayElement: true };
      if (!spec.itemFields) return { error: `Array has no item schema: ${path}` };
      const f = tokens[i];
      if (!f.k || !spec.itemFields[f.k]) return { error: `Unknown item field: ${f.k}` };
      spec = spec.itemFields[f.k];
      i++;
      continue;
    }
    i++;
  }
  return { spec, arrayElement: false };
}

function validateNpcScalar(spec, value, path) {
  if (value === null) {
    if (spec.nullable) return { ok: true, value: null };
    return { ok: false, error: `${path} cannot be null` };
  }
  if (spec.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) return { ok: false, error: `${path} must be a number` };
    if (spec.range && (value < spec.range[0] || value > spec.range[1])) {
      return { ok: false, error: `${path} must be within [${spec.range[0]}, ${spec.range[1]}]` };
    }
    return { ok: true, value };
  }
  if (spec.type === 'string') {
    if (typeof value !== 'string') return { ok: false, error: `${path} must be a string` };
    let v = value;
    if (spec.maxLength && v.length > spec.maxLength) v = v.substring(0, spec.maxLength);
    if (spec.enum && !spec.enum.includes(v)) {
      return { ok: false, error: `${path} must be one of: ${spec.enum.join(', ')}` };
    }
    return { ok: true, value: v };
  }
  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') return { ok: false, error: `${path} must be true or false` };
    return { ok: true, value };
  }
  if (spec.type === 'array') {
    if (!Array.isArray(value)) return { ok: false, error: `${path} must be an array` };
    if (spec.maxItems && value.length > spec.maxItems) {
      return { ok: false, error: `${path} may have at most ${spec.maxItems} items` };
    }
    if (spec.itemFields) {
      const items = [];
      for (let i = 0; i < value.length; i++) {
        const r = validateNpcItemObject(spec.itemFields, value[i], `${path}[${i}]`);
        if (!r.ok) return r;
        items.push(r.value);
      }
      return { ok: true, value: items };
    }
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string') return { ok: false, error: `${path}[${i}] must be a string` };
    }
    return { ok: true, value };
  }
  if (spec.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: `${path} must be an object` };
    }
    return { ok: true, value };
  }
  return { ok: false, error: `Unsupported schema type: ${spec.type}` };
}

function validateNpcItemObject(itemFields, value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: `${path} must be an object` };
  }
  const out = {};
  for (const [field, spec] of Object.entries(itemFields)) {
    let v = value[field];
    if (v === undefined || v === null) {
      if (spec.required) return { ok: false, error: `${path}.${field} is required` };
      out[field] = spec.default !== undefined ? spec.default
        : spec.type === 'string' ? '' : spec.type === 'number' ? 0
        : spec.type === 'boolean' ? false : spec.type === 'array' ? [] : {};
      continue;
    }
    const r = validateNpcScalar(spec, v, `${path}.${field}`);
    if (!r.ok) return r;
    out[field] = r.value;
  }
  return { ok: true, value: out };
}

function validateNpcField(path, value) {
  const r = resolveNpcFieldSpec(path);
  if (r.error) return { ok: false, error: r.error };
  if (r.arrayElement) {
    if (r.spec.itemFields) return validateNpcItemObject(r.spec.itemFields, value, path);
    return validateNpcScalar({ type: 'string' }, value, path);
  }
  return validateNpcScalar(r.spec, value, path);
}

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

// --- Save export/import (Phase 9, D10) ---
// A save exports as a gzip-compressed base64 blob — copyable into chat or a
// file, and downloadable. Import validates the envelope, warns on a
// gameVersion mismatch (a NEWER save is refused by restoreSave's version
// guard), and installs into a fresh manual slot. Thumbnails are cache keys,
// not image data, so an export never carries multi-megabyte blobs.
const SAVE_EXPORT_TYPE = 'slice-of-life-save';
const SAVE_EXPORT_VERSION = 1;

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzipBytes(bytes) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzipBytes(bytes) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// Compressed base64 export of a full record.
async function exportSaveRecord(record) {
  const json = JSON.stringify({
    type: SAVE_EXPORT_TYPE,
    version: SAVE_EXPORT_VERSION,
    gameVersion: GAME_VERSION,
    exportedAt: Date.now(),
    record,
  });
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzipBytes(bytes);
  return bytesToBase64(compressed);
}

// Parse + validate an exported blob. Returns the record, or throws a
// human-readable error. gameVersion is surfaced on the returned object's
// .gameVersion for the UI's version-mismatch warning; the imported record's
// meta.imageIndex is scrubbed because the LRU index is local-browser state —
// a stale index would evict real cached images before their blobs ever load.
async function importSaveRecord(text) {
  let parsed;
  try {
    const compressed = base64ToBytes(text.trim());
    const bytes = await gunzipBytes(compressed);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error('That file is not a valid save (could not decompress it).');
  }
  if (!parsed || parsed.type !== SAVE_EXPORT_TYPE) {
    throw new Error('That file is not a save for this game.');
  }
  if (parsed.version !== SAVE_EXPORT_VERSION) {
    throw new Error(`Unsupported save format version ${parsed.version} (this build reads version ${SAVE_EXPORT_VERSION}).`);
  }
  const record = parsed.record;
  if (!record || !record.payload) throw new Error('That save is missing its payload and cannot be loaded.');
  if (record.payload.meta?.meta) {
    record.payload.meta.meta.imageIndex = {};
  }
  record._importedGameVersion = parsed.gameVersion || 'unknown';
  return record;
}

// ===== /SECTION: STATE =====
