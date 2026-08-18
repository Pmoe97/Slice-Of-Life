// ===== SECTION: ITEMS =====
// Item stacks, container contents, recipes, and legacy-inventory
// normalization. Pure functions only — mutation happens through EFFECTS'
// applyEffects (MOVE_ITEM/CONSUME_ITEM/DESTROY_ITEM/SPAWN_ITEM), which
// calls into these helpers rather than duplicating stack-list logic.
//
// Uniform stack shape everywhere: { defId, qty, ownerId, meta }.
//
// Stack `meta` contract (inventory overhaul Phase 1 — later phases add
// fields here, this is the single source):
//   acquiredDay   game time the stack entered the world, in CONTINUOUS days
//                 (day + minutes/1440 — see gameDaysNow); stamped by
//                 addStack's `day` argument when not already present
//                 (null/absent = pre-Phase-1 legacy stack; freshness
//                 treats it as acquired today — the safe default)
//   cohort        spoilage cohort key (Phase 4); null for non-perishables.
//                 For perishables this is the freshness ANCHOR: the
//                 container-adjusted day-equivalent the stack would have
//                 had to enter the world to have consumed its current
//                 fraction of shelf life at this location's rate. Set to
//                 `day` at creation, recomputed on every transfer
//                 (retimeStack). It is the merge discriminator (B2): two
//                 stacks only merge when their effective cohorts match,
//                 so merging can never misrepresent either stack's
//                 remaining life — a week-old and a fresh stack of the
//                 same item never fuse.
//   keyItem       true = cannot be dropped, trashed, or given
//   servingsLeft  partial meals (Phase 3); absent = whole
//   frozen        food-overhaul Phase 1 (D17/D29): { frozenAtAbs,
//                 thawStartAbs, agedFraction } — see the frozen/thaw block
//                 below. Absent = normal storage, the common case.
//   plate         food-overhaul Phase 3 (D5/D25): the home-cooked meal
//                 INSTANCE. { recipeKey, label, kcalPerServing, servings:
//                 { total, left }, quality, grade, components, method,
//                 cookware, preparedAbs, wasReheated } — computed once by
//                 makePlate at cook time and never re-derived (design
//                 invariant 1: a cooked plate is a snapshot). Plate stacks
//                 carry qty 1 and their servings live HERE, not in the
//                 def's `servings`/meta.servingsLeft. Absent = ordinary
//                 def-driven food (the common case).
//   wasReheated   food-overhaul Phase 3 (D27): reheat marker for
//                 def-driven stacks (restaurant leftovers). Plate stacks
//                 carry it on meta.plate.wasReheated instead.
//   origName      existing: preserved text for _unknown legacy items
//   ...           free-form, as today

// --- Plate readers (food-overhaul Phase 3, D5/D25/D27/D28) ---
// A cooked meal is an INSTANCE (meta.plate) riding the ordinary stack
// pipeline on the `cooked_meal` carrier def. These readers are how the
// rest of the system — EFFECTS' EAT_ITEM/DESTROY_ITEM/REHEAT_ITEM,
// INVENTORY's stackServingsLeft/describeStack, the pickers — tells a
// plate stack apart and reads its real values instead of the carrier
// def's placeholders. Plate data is a SNAPSHOT (design invariant 1), so
// every read here is of the instance, never of RECIPES/ITEM_DEFS — a
// recipe change never retroactively rewrites food already in the fridge.
function isPlateStack(stack) {
  return !!stack?.meta?.plate;
}

// The single food-group reader (D5). The owning definition is each
// ingredient def's `foodGroup` field; makePlate reads through here so the
// bonus metric has ONE consumer.
function foodGroupOf(def) {
  return def?.foodGroup || null;
}

// The D14 F–S+ ladder (COOK_TUNING/GRADES in CONFIG, owned by the Phase-5
// cooking engine). Grade is a pure function of quality; the ONE reader is
// cooking.js's computeGrade, and every other caller (makePlate, this
// legacy alias) delegates to it so the ladder cannot be read two ways. A
// plate's grade is part of its snapshot either way (design invariant 1).
function gradeFromQuality(quality) {
  return computeGrade(quality);
}

// The D25 Servings-bar reader: { left, total, frac } where frac is the
// left/total fraction — the SAME shape whatever the batch size, so a bar
// that's 7/8 full reads identically whether the batch held 8 or 2
// servings. Plate-aware; returns null for a non-plate stack.
function plateServingsLeft(stack) {
  const s = stack?.meta?.plate?.servings;
  if (!s) return null;
  const total = Math.max(0, s.total || 0);
  const left = Math.max(0, s.left || 0);
  return { left, total, frac: total > 0 ? left / total : 0 };
}

// Display label for a stack: the plate's own composed label wins over the
// def's, so a fridge full of plates reads as "Pasta"/"Stir-fry"/… rather
// than every stack being the carrier's "Cooked Meal". (The plate label is
// itself a snapshot from cook time.)
function stackLabel(stack) {
  const plate = stack?.meta?.plate;
  if (plate?.label) return plate.label;
  return ITEM_DEFS[stack?.defId]?.label || 'Something';
}

// Per-serving kcal of a plate stack (null for non-plates).
function plateKcalPerServing(stack) {
  return stack?.meta?.plate?.kcalPerServing ?? null;
}

// Per-serving hunger the plate fills — calories convert to the ONE hunger
// number at consume time for NPCs (design invariant 3). The conversion is
// the same satiety curve the player's own legacy path used: HUNGER_RHYTHM
// says 5 hunger points ≈ 1 hour of fullness ≈ ~kcalPerFullnessHour kcal.
function plateHungerPerServing(stack) {
  const kcal = plateKcalPerServing(stack);
  if (kcal == null) return null;
  return Math.round(kcal / HUNGER_RHYTHM.satietyPerHour);
}

// Per-serving mood of a plate stack, freshness-scaled the same way a
// def-driven stack's mood is (stale ×R, spoiled ×R in EFFECTS' EAT_ITEM).
// D27's whole-bonus forfeit and D28's frozen penalty are applied at eat
// time (EFFECTS), on top of this base.
function plateMoodPerServing(stack, fresh) {
  const plate = stack?.meta?.plate;
  if (!plate) return null;
  const mult = fresh?.key === 'spoiled' ? ROT.spoiledRestoreMultiplier
    : fresh?.key === 'stale' ? ROT.staleRestoreMultiplier : 1;
  return PLATE_TUNING.qualityMoodScale * plate.quality * mult;
}

// --- Dish maps (food-overhaul Phase 4, D9/D10/D11) ---
// A kitchen surface's dirty dishes: obj.dishes is a { dishType: count }
// map — DISH_DEFS is its single owning definition (invariant 5), and
// obj.dishUnits is the derived Σ count×unit that washing capacity is
// measured against. The 'clean'/'few'/'many' ladder is DERIVED from the
// unit count (dishLevelOf, thresholds in DISH_TUNING) and never stored, so
// the dirty_dishes signal and room cleanliness can't desync from the maps
// that cause them — the same derive-don't-mirror rule the rot signal
// follows. All readers (SIGNALS' deriveStandingSignals, WORLD's
// computeObjectGriminess, the wash/dishwasher actions) go through these
// helpers; nothing reads obj.dishes directly.
function dishUnitsOf(obj) {
  if (!obj?.dishes || typeof obj.dishes !== 'object') return 0;
  let units = 0;
  for (const [type, count] of Object.entries(obj.dishes)) {
    if (!(count > 0)) continue;
    units += (DISH_DEFS[type]?.unit || 1) * count;
  }
  return units;
}
function dishLevelOf(obj) {
  const units = dishUnitsOf(obj);
  return units >= DISH_TUNING.sinkDirtyAtMany ? 'many'
    : units >= DISH_TUNING.sinkDirtyAtFew ? 'few' : 'clean';
}
// Adds dishType:count into a surface's dish map and recomputes dishUnits.
function addDishUnits(obj, map) {
  if (!obj || !map) return obj;
  const cur = { ...(obj.dishes || {}) };
  for (const [type, count] of Object.entries(map)) {
    if (!DISH_DEFS[type] || !(count > 0)) continue;
    cur[type] = (cur[type] || 0) + count;
  }
  obj.dishes = cur;
  obj.dishUnits = dishUnitsOf(obj);
  return obj;
}
// Removes up to `units` dish units from a surface's dish map (absent
// units = all). Drains larger items first — a pot blocks more of the sink
// than a fork — so a partial wash leaves the fiddly small stuff behind.
// Returns the number of units actually removed.
function clearDishUnits(obj, units) {
  if (!obj?.dishes || typeof obj.dishes !== 'object') return 0;
  let remaining = units == null ? Infinity : Math.max(0, Number(units) || 0);
  const kept = {};
  let removed = 0;
  const types = Object.keys(obj.dishes)
    .sort((a, b) => (DISH_DEFS[b]?.unit || 1) - (DISH_DEFS[a]?.unit || 1));
  for (const type of types) {
    const count = obj.dishes[type];
    if (!(count > 0)) continue;
    if (remaining <= 0) { kept[type] = count; continue; }
    const unit = DISH_DEFS[type]?.unit || 1;
    const removable = Math.min(count, Math.floor(remaining / unit));
    if (removable <= 0) { kept[type] = count; continue; }
    const takeUnits = removable * unit;
    if (removable >= count) remaining -= count * unit; else remaining -= takeUnits;
    removed += takeUnits;
    if (removable < count) kept[type] = count - removable;
  }
  obj.dishes = kept;
  obj.dishUnits = dishUnitsOf(obj);
  return removed;
}
// Counts each distinct dirty dish type across a set of surfaces (a map
// keyed by dish type → total count), for narration/UI prose.
function dishMapAcross(objs) {
  const out = {};
  for (const obj of objs || []) {
    for (const [type, count] of Object.entries(obj?.dishes || {})) {
      if (!(count > 0)) continue;
      out[type] = (out[type] || 0) + count;
    }
  }
  return out;
}
// "2 plates, 1 pot and a cutting board" — label prose for narration/UI.
// Called with a { dishType: count } map (dishMapAcross' output).
function dishSummary(map) {
  const parts = Object.entries(map || {})
    .filter(([, n]) => n > 0)
    .map(([type, n]) => {
      const label = (DISH_DEFS[type]?.label || type).toLowerCase();
      return n === 1 ? (DISH_DEFS[type]?.unit > 1 ? `a ${label}` : label) : `${n} ${label}s`;
    });
  if (parts.length === 0) return 'no dirty dishes';
  return parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
// Hand-wash capacity per self.dishes action, scaled by cleaning skill
// (linear between DISHWASH_TUNING.handWashBaseUnits at level 0 and
// handWashMaxUnits at max level).
function handWashUnitsFor(actor) {
  const lvl = typeof skillLevel === 'function' ? skillLevel(actor, 'cleaning') : 0;
  const max = typeof SKILLS !== 'undefined' ? (SKILLS.maxLevel || 10) : 10;
  const frac = max > 0 ? clamp(lvl / max, 0, 1) : 0;
  return Math.round(DISHWASH_TUNING.handWashBaseUnits
    + (DISHWASH_TUNING.handWashMaxUnits - DISHWASH_TUNING.handWashBaseUnits) * frac);
}
// Facility-tier index helper: which row of a FACILITY_DEFS ladder the
// current world.upgrades tier maps to (0=broken, 1=functional,
// 2=upgraded). Construction-aware like isFacilityFunctional: an absent
// upgrades map (old save) falls back to FACILITY_STARTING_TIERS, then
// 'functional' — the day-one baseline. Phase 6's dishwasher/microwave
// equipment reads share this so they index EQUIPMENT_DEFS tiers by the
// same index.
function facilityTierIdx(gameState, facilityId) {
  const def = (typeof FACILITY_DEFS !== 'undefined' && FACILITY_DEFS[facilityId]);
  const tier = gameState?.world?.upgrades?.[facilityId]?.tier
    || (typeof FACILITY_STARTING_TIERS !== 'undefined' ? FACILITY_STARTING_TIERS[facilityId] : null)
    || 'functional';
  const idx = def?.tiers?.findIndex(t => t.tier === tier) ?? -1;
  return idx < 0 ? 0 : idx;
}
// Dishwasher tier index = the kitchen_appliances facility ladder.
function dishwasherTierIdx(gameState) {
  return facilityTierIdx(gameState, 'kitchen_appliances');
}
// Dishwasher throughput, indexed by the kitchen_appliances ladder through
// EQUIPMENT_DEFS.dishwasher.tiers (Phase 6 D12 — the single owning table;
// the read shape below matches the old DISHWASH_TUNING.tiers exactly).
function dishwasherCapacityUnits(gameState) {
  const t = EQUIPMENT_DEFS.dishwasher.tiers[dishwasherTierIdx(gameState)];
  return t?.capacityUnits || 0;
}
function dishwasherCycleMinutes(gameState) {
  const t = EQUIPMENT_DEFS.dishwasher.tiers[dishwasherTierIdx(gameState)];
  return t?.cycleMinutes || 0;
}
// Microwave reheat throughput, keyed to the same kitchen_appliances
// ladder through EQUIPMENT_DEFS.microwave.tiers (Phase 6 D12). self.microwave's
// prepare reads this so the chip's time reflects the machine you own.
function microwaveReheatMinutes(gameState) {
  const t = EQUIPMENT_DEFS.microwave.tiers[dishwasherTierIdx(gameState)];
  return t?.present ? (t.reheatMinutes || 0) : 0;
}
// Dish units currently loaded in a dishwasher (its load is a dish map on
// obj.dishwasher.load — same per-type unit math as a surface's obj.dishes).
function dishwasherLoadUnits(dw) {
  const load = dw?.dishwasher?.load || {};
  let units = 0;
  for (const [type, count] of Object.entries(load)) {
    if (!(count > 0)) continue;
    units += (DISH_DEFS[type]?.unit || 1) * count;
  }
  return units;
}
// Moves up to `units` dish units from a surface's dish map into a
// dishwasher's load (largest items first). Mutates both objects' maps;
// returns { moved } — the units actually transferred.
function moveDishUnitsToLoad(dw, source, units) {
  const rec = dw.dishwasher || (dw.dishwasher = { load: {}, cycleActiveUntilAbs: 0 });
  const load = { ...(rec.load || {}) };
  let remaining = Math.max(0, Math.floor(units || 0));
  let moved = 0;
  const types = Object.keys(source?.dishes || {})
    .sort((a, b) => (DISH_DEFS[b]?.unit || 1) - (DISH_DEFS[a]?.unit || 1));
  for (const type of types) {
    if (remaining <= 0) break;
    const count = source.dishes[type];
    if (!(count > 0)) continue;
    const unit = DISH_DEFS[type]?.unit || 1;
    const removable = Math.min(count, Math.floor(remaining / unit));
    if (removable <= 0) continue;
    source.dishes[type] = count - removable;
    load[type] = (load[type] || 0) + removable;
    remaining -= removable * unit;
    moved += removable * unit;
  }
  source.dishes = Object.fromEntries(Object.entries(source.dishes).filter(([, n]) => n > 0));
  source.dishUnits = dishUnitsOf(source);
  rec.load = load;
  return { moved };
}
// Lazy dishwasher-cycle reader: 'idle' | 'running' | 'done'. `now` is// continuous game days (gameDaysNow) — the cycleActiveUntilAbs anchor is on
// the same scale as preparedAbs/frozenAtAbs (the codebase's continuous-clock
// anchor pattern, never a per-tick loop). 'done' means the clock has passed
// the anchor and the load is clean.
function dishwasherCycleProgress(dw, now) {
  const rec = dw?.dishwasher;
  if (!rec || !(rec.cycleActiveUntilAbs > 0)) return 'idle';
  return (now != null && now >= rec.cycleActiveUntilAbs) ? 'done' : 'running';
}
// Write-path resolver for a completed cycle (same hygiene pattern as
// processSpoilageForDay's thawed-stack normalization): the clean load is
// emptied and the derived `cycle` state flips back to 'idle'. Pure readers
// (dishwasherCycleProgress, the floorplan) never mutate — this is called
// from write paths only (the dishwasher action's prepare, the dishwashing
// cleanup sweep).
function resolveDishwasherCycle(dw, now) {
  if (dishwasherCycleProgress(dw, now) !== 'done') return dw;
  dw.dishwasher = { load: {}, cycleActiveUntilAbs: 0 };
  if (dw.state) dw.state = { ...dw.state, cycle: 'idle' };
  return dw;
}

// --- makePlate: the D5 sum-of-parts plate builder (food-overhaul Phase 3).
// Pure and deterministic — no Math.random, nothing but the recipe's
// ingredients, the shared foodGroup/foodQuality readers and the clock.
// Called at cook time by DEFS.ACTIONS' buildCookEffects; the returned
// plate object is stamped onto the spawned stack's meta as `plate` and
// never touched again (design invariant 1).
//
//   recipe      the RECIPES entry (id/label/servings/method/cookware)
//   ingredients the actual ingredients drawn for the cook, as
//               [{ defId, qty }] — Phase 3 this IS recipe.ingredients;
//               Phase 5's engine passes its own resolved list
//   method/cookware  strings the plate carries (Phase-3 placeholders;
//               Phase 4/5 make them mechanical)
//
// kcal is the sum of the ingredient kcal actually consumed (kcalOf — both
// the consumable-carried and the raw-inedible top-level values), plus the
// D5 meal bonus for food-group variety (PLATE_TUNING.groupBonusKcal per
// distinct group beyond the first). The plan's Phase-3 verification is
// explicit that fats/seasonings land in Phase 5, so this is
// ingredients-only until the cooking engine exists. Quality is the
// Phase-3 approximation: base + the ingredients' shared foodQuality reader
// + a variety bonus. servings.left starts at servings.total (D6/D25).
function makePlate(gameState, recipe, ingredients, method, cookware) {
  const now = gameDaysNow(gameState?.meta?.clock);
  let kcal = 0;
  let qualitySum = 0;
  const groups = new Set();
  const comps = [];
  for (const ing of ingredients || []) {
    const def = ITEM_DEFS[ing.defId];
    if (!def) continue;
    kcal += kcalOf(def) * (ing.qty || 1);
    const g = foodGroupOf(def);
    if (g) groups.add(g);
    if (typeof foodQuality === 'function') qualitySum += foodQuality(def);
    comps.push({ defId: ing.defId, qty: ing.qty || 1, stage: PLATE_TUNING.stagesByMethod[method] || 'cooked' });
  }
  const groupCount = groups.size;
  const bonusKcal = PLATE_TUNING.groupBonusKcal * Math.max(0, groupCount - 1);
  const avgQ = comps.length > 0 ? qualitySum / comps.length : 0;
  const quality = Math.min(PLATE_TUNING.qualityCap,
    PLATE_TUNING.baseQuality + PLATE_TUNING.qualityFromFood * avgQ
    + PLATE_TUNING.qualityFromVariety * Math.max(0, groupCount - 1));
  const servings = Math.max(1, Math.round(recipe?.servings || 1));
  return {
    recipeKey: recipe?.id || 'freeform',
    label: recipe?.label || 'Home-cooked meal',
    kcalPerServing: Math.round((kcal + bonusKcal) / servings),
    servings: { total: servings, left: servings },
    quality: Math.round(quality * 100) / 100,
    grade: gradeFromQuality(quality),
    components: comps,
    method: method || recipe?.method || null,
    cookware: cookware || recipe?.cookware || null,
    preparedAbs: now,
    wasReheated: false,
  };
}


// Effective spoilage cohort for merge comparison. Non-perishables are
// null (merge freely, as before Phase 4); perishables fall back to
// acquiredDay when the Phase 4 `cohort` field predates the stack.
function stackCohort(stack) {
  const def = ITEM_DEFS[stack?.defId];
  if (!def?.perishable?.days) return null;
  if (stack?.meta?.cohort != null) return stack.meta.cohort;
  return stack?.meta?.acquiredDay ?? null;
}

// Merge test for two freshness anchors. Non-perishables (null on both
// sides) merge freely, exactly as before Phase 4. Perishables merge when
// their anchors are within ROT.mergeToleranceHours: the anchor is
// continuous now, so the old `===` would have made every minute of a
// shopping trip its own stack. The tolerance is small enough that a merge
// still cannot misrepresent either stack's remaining life — and addStack
// keeps the OLDER of the two anchors anyway, so it can only ever err
// toward "this is older than you think".
function cohortsMergeable(a, b) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= ROT.mergeToleranceHours / 24;
}

function stackQty(stacks, defId) {
  return (stacks || []).filter(s => s.defId === defId).reduce((sum, s) => sum + s.qty, 0);
}
// Every purchasable item, computed once at load (ITEM_DEFS is static
// content, not runtime state) — split between QuickCart (groceries +
// household urgencies) and Nile (everything else), the same real-world
// split Amazon vs. Instacart draws. `isGroceryDef` reuses `storageClassOf`
// (the D19 grocery sorter, defined later in this file — a `function`
// declaration hoists within the script, so the forward reference is safe)
// plus three household categories real Instacart also covers for a same-
// day run. Nobody hand-maintains two catalogs going stale against each
// other: one predicate, two filters, guaranteed disjoint.
const GROCERY_EXTRA_CATEGORIES = ['toiletry', 'cleaning', 'medication'];
function isGroceryDef(def) {
  return !!def && (storageClassOf(def) != null || GROCERY_EXTRA_CATEGORIES.includes(def.category));
}
const GROCERY_CATALOG_LIST = Object.values(ITEM_DEFS).filter(d => d.id !== '_unknown' && d.price != null && isGroceryDef(d));
const SHOP_CATALOG_LIST = Object.values(ITEM_DEFS).filter(d => d.id !== '_unknown' && d.price != null && !isGroceryDef(d));

// Adds qty of defId to a stack list, merging into an existing same-owner
// stack when the def is stackable AND the effective spoilage cohort matches
// (Phase 4 B2 fix — `defId + ownerId + cohort`, so milk bought today never
// merges into milk bought last week and drags the fresh stack down with
// it), else appending a new entry. Returns a new array — never mutates
// the input. `day` (optional, CONTINUOUS game days — gameDaysNow) stamps
// meta.acquiredDay on NEW stacks when the supplied meta doesn't already
// carry one, and stamps meta.cohort (the freshness anchor) on NEW
// perishable stacks; the merge path keeps the OLDER of the two anchors, so
// fusing a fresh delivery into an hour-old one can never make the older
// food read as newer than it is. Non-perishables keep cohort null and merge
// exactly as before.
function addStack(stacks, defId, qty, ownerId, meta, day) {
  const def = ITEM_DEFS[defId] || ITEM_DEFS._unknown;
  const list = [...(stacks || [])];
  const newCohort = stackCohort({ defId, meta }) ?? (def?.perishable?.days ? day ?? null : null);
  // Food-overhaul Phase 1: frozen and never-frozen stacks of the same item
  // never merge — a fresh carton slid into a frozen stack must not inherit
  // the frozen block (and vice versa). The frozen flag is part of the merge
  // key alongside defId/owner/cohort.
  const incomingFrozen = !!(meta?.frozen);
  if (def.stackable) {
    const idx = list.findIndex(s => s.defId === defId && s.ownerId === (ownerId ?? null)
      && (!!s.meta?.frozen) === incomingFrozen
      && !s.meta?.plate && !meta?.plate
      && cohortsMergeable(stackCohort(s), newCohort));
    if (idx >= 0) {
      const newQty = Math.min(def.maxStack || Infinity, list[idx].qty + qty);
      const existingCohort = stackCohort(list[idx]);
      const mergedMeta = (existingCohort != null && newCohort != null && newCohort < existingCohort)
        ? { ...(list[idx].meta || {}), cohort: newCohort }
        : list[idx].meta;
      list[idx] = { ...list[idx], qty: newQty, meta: mergedMeta };
      return list;
    }
  }
  const metaOut = { ...(meta || {}) };
  if (metaOut.acquiredDay == null && day != null) metaOut.acquiredDay = day;
  if (def?.perishable?.days && metaOut.cohort == null && day != null) metaOut.cohort = day;
  list.push({ defId, qty, ownerId: ownerId ?? null, meta: metaOut });
  return list;
}

// Removes up to qty of defId (any owner, oldest-entry-first) from a stack
// list. Returns { stacks, removed } — removed may be less than qty if
// there wasn't enough; the caller (EFFECTS' appliers) only applies
// consumption effects proportional to what was actually removed.
function removeStack(stacks, defId, qty) {
  let remaining = qty;
  const list = [];
  for (const s of stacks || []) {
    if (remaining > 0 && s.defId === defId) {
      if (s.qty <= remaining) { remaining -= s.qty; continue; }
      list.push({ ...s, qty: s.qty - remaining });
      remaining = 0;
      continue;
    }
    list.push(s);
  }
  return { stacks: list, removed: qty - remaining };
}

// --- Freshness (inventory overhaul Phase 4) ---
// The derived model (invariant 5): a stack's remaining life is never
// stored — it's a pure function of its meta.cohort (the container-adjusted
// age anchor, == acquiredDay until the first transfer), the container's
// preservation multiplier, and today's game day. It therefore survives
// saves, reloads, and multi-day time skips untouched.
//
// Effective shelf life = def.perishable.days × container.preservation, and
// `def.perishable.days` is the room-temperature time to ROTTEN — the end of
// the ladder, not the first sign of trouble.
//
// State ladder (ROT.stages, fraction of that life consumed):
//   Fresh   < stages.good AND under ROT.freshHours of actual elapsed time
//   —       < stages.stale   (good; deliberately carries no label)
//   Stale   < stages.spoiled
//   Spoiled < 1              (edible, with penalties)
//   Rotten  ≥ 1              (NOT edible)
//
// The Fresh window is absolute rather than fractional because "fresh" means
// recently made. A fraction alone would call month-keeping butter Fresh for
// two days and a milkshake Fresh for two hours, which is backwards for the
// butter and only accidentally right for the shake.
//
// `containerDef` is the OBJECT_DEFS entry of the container holding the
// stack (null = the player's bag, the 1.0 baseline). `day` is CONTINUOUS
// game days (gameDaysNow) — passing a bare `clock.day` still works but
// quantises the whole ladder to midnight, which is what this replaced.
// Returns null for a non-perishable or a stack whose age is unknown
// (treated as freshly acquired — never instantly rotten). `pct` is the
// unclamped fraction of shelf life elapsed (can exceed 1 when Rotten), so
// sorters can rank urgency and eaters can scale restore.
// The preservation multiplier for a container OBJECT_DEFS entry, resolved
// through the ONE owning table (ROT.preservation — food-overhaul Phase 1,
// D18, design invariant 5) by the container's storageClass. The legacy
// numeric `container.preservation` field is still honored for defs written
// before the consolidation; null / absent storageClass means the bag
// baseline. ITEMS' effectiveShelfDays, SIM's spoilage pass, and INVENTORY's
// descriptions all read preservation HERE so the two sites can't drift.
function preservationFor(containerDef) {
  const legacy = containerDef?.container?.preservation;
  if (legacy != null) return legacy;
  const cls = containerDef?.container?.storageClass;
  if (cls && ROT.preservation[cls] != null) return ROT.preservation[cls];
  return ROT.bagPreservation;
}

function effectiveShelfDays(def, containerDef) {
  const shelf = def?.perishable?.days;
  if (!shelf) return null;
  return shelf * preservationFor(containerDef);
}

// Continuous game time in days. Whole-day `clock.day` arithmetic is what
// made a short-life dish skip the entire ladder at rollover; the minutes
// term gives the same derived model hour-level resolution without changing
// its shape or storing anything.
function gameDaysNow(clock) {
  if (clock?.day == null) return null;
  return clock.day + (clock.minutes ?? 0) / (CLOCK.ticksPerDay * 30);
}

// --- Frozen / thaw (food-overhaul Phase 1, D17/D29) ---
// A stack moved into a freezer stops aging entirely. meta.frozen pins its
// freshness clock at the moment of freezing, and no game time is charged
// for it until it has fully thawed — the frozen span is free, and the
// clock resumes from exactly where it was frozen (D29). The whole state is
// two timestamps plus one snapshot, computed lazily against the current
// clock (the same anchor pattern processSpoilageForDay uses — never a
// per-tick mutation loop):
//   meta.frozen = {
//     frozenAtAbs:   game-days (gameDaysNow scale) when the stack froze.
//                    While frozen the freshness clock does not advance past
//                    this value (D17).
//     thawStartAbs:  game-days when the stack first left a freezer for a
//                    non-refrigerated spot, or null while it is still
//                    stored frozen. One-way: once set, it stays set until
//                    the stack fully thaws (or is re-frozen).
//     agedFraction:  the fraction of its shelf life consumed AT the moment
//                    of freezing — a snapshot, so the pinned age survives
//                    container changes while frozen (the pre-freeze cohort
//                    anchor is deliberately NOT re-based during frozen
//                    transfers; that would change the pinned age).
//   }
// thawProgress(stack, day) reports 'none' | 'frozen' | 'thawing' | 'thawed'
// for any reader (render badges, eat, cook, the spoilage sweep) without
// mutating anything; freshnessOf reads through it. While frozen OR thawing
// the stack's pct IS the agedFraction snapshot (nothing ages during the
// thaw window — the clock resumes only once thawing completes, D29). Once
// thawed, aging resumes at the thaw window's end and the frozen span is
// never charged. A fully-thawed stack is normalized (frozen block dropped,
// cohort anchor rewritten to resume the normal clock) by the next transfer
// or spoilage sweep — hygiene, not correctness: freshnessOf reads right in
// the interim.

// Pure frozen-state reader. 'none' = never frozen; 'frozen' = stored in
// cold storage; 'thawing' = left cold storage but under
// THAW_TUNING.roomTempThawHours; 'thawed' = fully thawed.
function thawProgress(stack, day) {
  const fr = stack?.meta?.frozen;
  if (!fr) return 'none';
  if (fr.thawStartAbs == null) return 'frozen';
  if (day - fr.thawStartAbs >= THAW_TUNING.roomTempThawHours / 24) return 'thawed';
  return 'thawing';
}

// Returns a NEW stack stamped as frozen (the stack must already be in the
// freezer — `fromDef` is the container it just left, used only to snapshot
// the fraction of shelf life consumed). Non-perishables get agedFraction 0:
// they can't rot, but they can still be frozen-stored.
function freezeStack(stack, fromDef, day) {
  const def = ITEM_DEFS[stack?.defId];
  const shelf = effectiveShelfDays(def, fromDef);
  const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
  const pct = (shelf != null && anchor != null && day != null)
    ? Math.max(0, (day - anchor) / shelf)
    : 0;
  const meta = { ...(stack.meta || {}) };
  meta.frozen = { frozenAtAbs: day, thawStartAbs: null, agedFraction: pct };
  return { ...stack, meta };
}

function freshnessOf(stack, containerDef, day) {
  const def = ITEM_DEFS[stack?.defId];
  const shelfDays = effectiveShelfDays(def, containerDef);
  if (shelfDays == null) return null;
  const fr = stack?.meta?.frozen;
  let frozenState = 'none';
  let elapsed;
  if (fr) {
    const prog = thawProgress(stack, day);
    if (prog === 'frozen' || prog === 'thawing') {
      // The freshness clock is pinned at the moment of freezing (D17), and
      // nothing ages during the thaw window either (D29). The pct IS the
      // snapshot; express it back in elapsed-days so the rung math below
      // stays one code path.
      frozenState = prog;
      elapsed = (fr.agedFraction ?? 0) * shelfDays;
    } else {
      // Fully thawed: aging resumes after the thaw window; the frozen span
      // itself is never charged. Handles stacks nobody has normalized yet.
      frozenState = 'thawed';
      const post = (day - fr.thawStartAbs - THAW_TUNING.roomTempThawHours / 24) / shelfDays;
      elapsed = Math.max(0, (fr.agedFraction ?? 0) + post) * shelfDays;
    }
  } else {
    const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
    if (anchor == null || day == null) return null;
    elapsed = day - anchor;
  }
  // Negative elapsed only occurs after retimeStack moves an already-Rotten
  // stack into a slower container (its anchor lands in the future) — that
  // stack is still Rotten, never "fresh".
  const pct = elapsed < 0 ? 1 + (-elapsed) / shelfDays : elapsed / shelfDays;
  const { good, stale, spoiled } = ROT.stages;
  const key = pct >= 1 ? 'rotten'
    : pct >= spoiled ? 'spoiled'
    : pct >= stale ? 'stale'
    : (pct >= good || elapsed * 24 >= ROT.freshHours) ? 'good'
    : 'fresh';
  return {
    key,
    label: ROT.labels[key],
    pct,
    ageDays: Math.max(0, elapsed),
    shelfDays,
    edible: key !== 'rotten',
    rot: key === 'rotten',
    frozenState,
  };
}

// Recomputes a stack's remaining life against a NEW container's
// preservation multiplier when it's transferred (moving milk out of the
// fridge for an hour must not cost it a week — D5). Preserves the fraction
// of shelf life already consumed: freshnessOf derives pct as
// (day − anchor)/shelfDays, so the new anchor must satisfy
// (day − newAnchor)/toShelf = fractionConsumed, i.e. the anchor moves to
// day − fraction×toShelf. Returns a NEW stack (pure — the caller writes
// it through applyEffects); the `cohort` anchor is updated to the
// container-adjusted value and `acquiredDay` stays the literal entry day.
// Non-perishables and age-unknown legacy stacks pass through unchanged.
// `fromDef`/`toDef` are the OBJECT_DEFS entries of the source/destination
// containers (null = the player's bag).
//
// Food-overhaul Phase 1 (D17/D29): the freezer lifecycle lives HERE too,
// because a transfer is the only place a stack can enter or leave cold
// storage. Frozen stacks never get their anchor re-based while frozen
// (that would change the pinned age); instead the transfer stamps the
// bookkeeping: into a freezer = freeze (or re-freeze); out of a freezer to
// a non-refrigerated spot = start the thaw timer; a fully-thawed stack =
// normalized back onto the normal clock. Bag-baseline (null) container
// defs are never cold storage.
function retimeStack(stack, fromDef, toDef, day) {
  const def = ITEM_DEFS[stack?.defId];
  const fromShelf = effectiveShelfDays(def, fromDef);
  const toShelf = effectiveShelfDays(def, toDef);
  const meta = { ...(stack.meta || {}) };
  const fr = stack?.meta?.frozen;
  const cold = (d) => {
    const cls = d?.container?.storageClass;
    return cls === 'fridge' || cls === 'freezer';
  };
  const toFreezer = toDef?.container?.storageClass === 'freezer';

  if (fr) {
    const prog = thawProgress(stack, day);
    if (toFreezer) {
      // Entering a freezer. Still-stored-frozen → no-op. Thawing or thawed
      // → a re-freeze: restart the frozen state from today's effective age
      // (the frozen span is not charged, but any post-thaw aging is).
      if (fr.thawStartAbs != null) {
        const pct = freshnessOf(stack, fromDef, day)?.pct ?? 0;
        meta.frozen = { frozenAtAbs: day, thawStartAbs: null, agedFraction: pct };
      }
    } else if (prog === 'frozen') {
      // Leaving cold storage. Only a NON-refrigerated destination starts
      // the thaw timer (D29 — the fridge is still refrigeration; a frozen
      // stack parked there stays frozen, and still doesn't age).
      if (!cold(toDef)) meta.frozen = { ...fr, thawStartAbs: day };
    } else if (prog === 'thawed') {
      // Fully thawed: normalize back onto the normal clock — drop the
      // frozen block and rewrite the anchor so (day − anchor)/toShelf
      // equals the frozen-aware pct (frozen span never charged).
      const pct = freshnessOf(stack, toDef, day)?.pct ?? 0;
      delete meta.frozen;
      if (toShelf != null) meta.cohort = day - pct * toShelf;
    }
    // Frozen stacks never re-base their anchor on transfer — the pinned
    // age is the snapshot, not a function of the current container.
    return { ...stack, meta };
  }

  // A never-frozen stack moving into a freezer is a NEW freeze, not an
  // aging transfer: the anchor is left where it was (the snapshot takes
  // over while frozen) and the frozen block is stamped.
  if (toFreezer) return freezeStack(stack, fromDef, day);

  if (fromShelf == null || toShelf == null) return stack;
  const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
  if (anchor == null || day == null) return stack;
  // No clamp: an already-Rotten stack (fraction > 1) must stay Rotten at
  // the destination, and a retimed-rotten anchor (elapsed < 0) must keep
  // its rottenness too — clamping to 0 would resurrect it as Fresh.
  const fraction = (day - anchor) / fromShelf;
  meta.cohort = day - fraction * toShelf;
  return { ...stack, meta };
}

// --- Legacy inventory normalization (player 1->2 migration, STATE) ---
// Matches a free-text name (from a bare-string legacy entry, or the `name`
// field a pre-ITEMS delivery wrote) against ITEM_DEFS' label/nouns,
// case-insensitively. Unmatched falls through to `_unknown` with the
// original text preserved in meta — no legacy save loses data.
function resolveItemDefIdByName(name) {
  const lower = String(name || '').toLowerCase().trim();
  for (const def of Object.values(ITEM_DEFS)) {
    if (def.id === '_unknown') continue;
    if (def.label.toLowerCase() === lower) return def.id;
    if (def.nouns?.some(n => n.toLowerCase() === lower)) return def.id;
  }
  return null;
}

function normalizeLegacyInventoryEntry(entry) {
  const name = typeof entry === 'string' ? entry : entry?.name;
  const qty = typeof entry === 'string' ? 1 : (entry?.qty || 1);
  if (!name) return null;
  const defId = resolveItemDefIdByName(name) || '_unknown';
  return { defId, qty, ownerId: 'player', meta: defId === '_unknown' ? { origName: name } : {} };
}

function migrateInventory(inventory) {
  return (inventory || []).map(normalizeLegacyInventoryEntry).filter(Boolean);
}

// --- Clothing & wardrobe (Intimacy & Voyeurism Phase 4, D11) ---
// Pure helpers over CLOTHING_DEFS/ITEM_DEFS and container .contents — the
// same contract as the rest of ITEMS (no DOM, no mutation). Mutation still
// routes through EFFECTS' MOVE_ITEM (addStack/removeStack inside it); these
// decide what MAY move and how an outfit is composed. Consumers: the
// container transfer UI (UI), the container panel (RENDER), and Phase 5/6
// (outfit picking).

// The capacity of an object instance's container. Resolves the wardrobe's
// tiered capacity from its instance tier (flags.tier, default 1) — numbers
// live in flags because state values must stay string enums. Returns null
// for uncapped containers (every non-wardrobe chest today).
function containerCapacity(obj) {
  const c = OBJECT_DEFS[obj?.defId]?.container;
  if (!c) return null;
  if (c.capacityByTier) return c.capacityByTier[obj?.flags?.tier ?? 1] ?? null;
  return c.capacity ?? null;
}

// How many ITEMS a container currently holds (sum of stack quantities —
// each non-stackable clothing item is qty 1, so one shirt = one slot).
function containerItemCount(obj) {
  return (obj?.contents || []).reduce((sum, s) => sum + (s?.qty || 0), 0);
}

// The single capacity check both the Put verb and Put All read: moving
// `qty` of defId into `obj` succeeds iff the container is uncapped or has
// room. Pure — the UI turns `ok: false` into a refusal + message.
function wardrobePutCheck(obj, defId, qty) {
  const capacity = containerCapacity(obj);
  if (capacity == null) return { ok: true, capacity: null, used: 0, remaining: Infinity };
  const used = containerItemCount(obj);
  const remaining = Math.max(0, capacity - used);
  return { ok: (qty || 1) <= remaining, used, capacity, remaining };
}

// Builds an OUTFIT ({ slot: itemId }) for a wanted OUTFIT_TYPES key from a
// pool of item defIds (wardrobe contents, or any other source). Deterministic
// — no Math.random anywhere: per slot it scores every candidate and takes
// the best, breaking ties by id so the same wardrobe always composes the
// same outfit. `bias` (optional) lets later phases push the scoring (e.g.
// Phase 7 wires attraction/deviancy into the weights); its entries are
// extra stat weights keyed by stat name, defaulting to the neutral table.
// Missing slots stay unset (n/a) — an outfit never fabricates a slot.
function composeOutfit(wantedType, itemIds, bias = {}) {
  const type = OUTFIT_TYPES[wantedType] || OUTFIT_TYPES.daily;
  const preferred = new Set(type.traits || []);
  const statWeights = { comfort: 2, attraction: 1, ...(bias.stats || {}) };
  const traitBonus = (bias.traitBonus != null) ? bias.traitBonus : 4;
  const score = (id) => {
    const def = CLOTHING_DEFS[id];
    if (!def) return -Infinity;
    let s = 0;
    // Traits are ordered primary-first, so a match at position 0 counts more
    // than a secondary match — a sport-first athletic short beats a
    // comfortable-first sweatpants for the workout outfit even though both
    // carry the `sport` trait.
    (def.traits || []).forEach((t, i) => { if (preferred.has(t)) s += traitBonus / (i + 1); });
    for (const [stat, w] of Object.entries(statWeights)) s += (def.stats?.[stat] || 0) * w;
    return s;
  };
  const outfit = {};
  for (const slot of CLOTHING_SLOTS) {
    const candidates = (itemIds || [])
      .map(id => ({ id, def: CLOTHING_DEFS[id] }))
      .filter(c => c.def && c.def.slot === slot)
      .sort((a, b) => score(b.id) - score(a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (candidates.length > 0) outfit[slot] = candidates[0].id;
  }
  return outfit;
}

// Phase 7 (D11): the outfit aggregation readers shared by every clothing
// consumer. All PURE and null-safe (missing outfit → 0 / false), so a save
// with no outfit at all still reads cleanly — the "default outfit supplied"
// guarantee of the phase's verification.
//
//   outfitStatSum       — the SUM of one stat across every worn item (0 for
//                         an unset stat). The single aggregation every
//                         formula reads, so "how revealing is she" means one
//                         thing everywhere.
//   outfitHasTrait      — does ANY worn item carry this trait? (Traits are
//                         per-item; an outfit of three everyday pieces that
//                         add up to nothing special is ordinary.)
//   outfitEffectiveReveal — the reveal sum cancelled by the modesty sum
//                         through CLOTHING_EFFECTS.modestyDampen (a modest
//                         fit reads non-inviting). The ONE formula for
//                         "how much skin this outfit actually shows" — the
//                         desire source, the prose gate and the willingness
//                         term all read THIS number, never their own copy.
function outfitStatSum(outfit, stat) {
  let sum = 0;
  for (const id of Object.values(outfit || {})) {
    const s = CLOTHING_DEFS[id]?.stats?.[stat];
    if (typeof s === 'number') sum += s;
  }
  return sum;
}

function outfitHasTrait(outfit, trait) {
  return Object.values(outfit || {}).some(id => (CLOTHING_DEFS[id]?.traits || []).includes(trait));
}

function outfitEffectiveReveal(outfit) {
  const reveal = outfitStatSum(outfit, 'reveal');
  const modesty = outfitStatSum(outfit, 'modesty');
  return Math.max(0, reveal * (1 - modesty * CLOTHING_EFFECTS.modestyDampen));
}

// --- Storage classes & the grocery sorter (food-overhaul Phase 1, D19) ---
// Every food def carries an explicit `storageClass` hint (DEFS.WORLD) for
// where it belongs; storageClassOf is the single reader, so the auto-sorter
// and any future consumer (Phase 3's cook-from-storage, Phase 8's meal
// planner) never re-invent the mapping. Non-food defs resolve to null and
// are never auto-sorted — the pickup rework is a GROCERY convenience, and
// nobody asked the toothbrush where it wants to live.
//
// The field name is deliberately SHARED with the container block's
// storageClass (which selects a ROT.preservation row) — same word, two
// namespaces: the ITEM def says where it should live, the CONTAINER says
// how well it preserves. storageClassOf reads the item; preservationFor
// reads the container.
function storageClassOf(def) {
  if (!def) return null;
  if (def.storageClass) return def.storageClass;
  const foodCat = ['ingredient', 'food', 'meal', 'drink', 'comfort'].includes(def.category);
  if (!foodCat) return null;
  if (def.category === 'drink' || def.perishable?.days) return 'fridge';
  return 'pantry';
}

// The D19 auto-sorter: plans where a batch of stacks (a doormat delivery)
// should go, given the apartment's actual containers. Pure and
// deterministic — returns a plan, applies nothing. Destinations live in
// the KITCHEN bucket on purpose: the whole point of "auto-transfer to
// storage" is that you don't have to be standing in the kitchen to put
// the shopping away. A kitchen missing the freezer (a save that predates
// the layout bump and hasn't backfilled yet) simply leaves freezer-class
// stacks unplaced rather than inventing space.
//   Returns { placed: [{ defId, qty, objId, storageClass }...],
//             unplaced: [stack...] }
function sortIntoStorage(gameState, stacks) {
  const kitchen = gameState?.objects?.['room_kitchen'] || {};
  const findObj = (defId) => Object.values(kitchen).find(o => o.defId === defId);
  const targets = {
    fridge: findObj('fridge'),
    freezer: findObj('freezer'),
    pantry: findObj('pantry'),
  };
  const out = { placed: [], unplaced: [] };
  for (const stack of stacks || []) {
    if (!(stack?.qty > 0)) continue;
    const cls = storageClassOf(ITEM_DEFS[stack.defId]);
    const target = cls ? targets[cls] : null;
    if (!target) { out.unplaced.push(stack); continue; }
    out.placed.push({ defId: stack.defId, qty: stack.qty, objId: target.id, storageClass: cls });
  }
  return out;
}

// --- Recipes ---
function recipeAvailable(recipe, ingredientPool) {
  return recipe.ingredients.every(ing => stackQty(ingredientPool, ing.defId) >= ing.qty);
}

// Every recipe whose ingredients are fully covered by the combined pool,
// in RECIPES declaration order. The player chooses from this list when
// cooking (self.cook's prepare, Phase 2) — the kitchen is never a slot
// machine where the first matching recipe silently wins.
function availableRecipes(pool) {
  return Object.values(RECIPES).filter(r => recipeAvailable(r, pool || []));
}

// First available recipe (declaration order) — the single-recipe path and
// the no-choice consumer (hasRecipeIngredients gate). Kept as a thin
// wrapper over availableRecipes so the maid's auto-cook path and any
// other first-match caller stay untouched; see RECIPES' file comment for
// why declaration order is a deliberate priority, not incidental.
function pickAvailableRecipe(fridgeContents, pantryContents) {
  const pool = [...(fridgeContents || []), ...(pantryContents || [])];
  return availableRecipes(pool)[0] || null;
}

// ===== /SECTION: ITEMS =====
