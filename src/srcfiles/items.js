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
//   acquiredDay   game day the stack entered the world; stamped by
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
//   origName      existing: preserved text for _unknown legacy items
//   ...           free-form, as today

// Effective spoilage cohort for merge comparison. Non-perishables are
// null (merge freely, as before Phase 4); perishables fall back to
// acquiredDay when the Phase 4 `cohort` field predates the stack.
function stackCohort(stack) {
  const def = ITEM_DEFS[stack?.defId];
  if (!def?.perishable?.days) return null;
  if (stack?.meta?.cohort != null) return stack.meta.cohort;
  return stack?.meta?.acquiredDay ?? null;
}

function stackQty(stacks, defId) {
  return (stacks || []).filter(s => s.defId === defId).reduce((sum, s) => sum + s.qty, 0);
}

// Every purchasable item, computed once at load (ITEM_DEFS is static
// content, not runtime state) — COMPUTER's Nile app browses this list
// directly rather than a hand-authored parallel catalog, so pricing lives
// with the item once.
const SHOP_CATALOG_LIST = Object.values(ITEM_DEFS).filter(d => d.id !== '_unknown' && d.price != null);

// Adds qty of defId to a stack list, merging into an existing same-owner
// stack when the def is stackable AND the effective spoilage cohort matches
// (Phase 4 B2 fix — `defId + ownerId + cohort`, so milk bought today never
// merges into milk bought last week and drags the fresh stack down with
// it), else appending a new entry. Returns a new array — never mutates
// the input. `day` (optional, game day) stamps meta.acquiredDay on NEW
// stacks when the supplied meta doesn't already carry one, and stamps
// meta.cohort (the freshness anchor) on NEW perishable stacks; the merge
// path preserves the existing stack's meta (an older stack keeps its
// age). Non-perishables keep cohort null and merge exactly as before.
function addStack(stacks, defId, qty, ownerId, meta, day) {
  const def = ITEM_DEFS[defId] || ITEM_DEFS._unknown;
  const list = [...(stacks || [])];
  const newCohort = stackCohort({ defId, meta }) ?? (def?.perishable?.days ? day ?? null : null);
  if (def.stackable) {
    const idx = list.findIndex(s => s.defId === defId && s.ownerId === (ownerId ?? null) && stackCohort(s) === newCohort);
    if (idx >= 0) {
      const newQty = Math.min(def.maxStack || Infinity, list[idx].qty + qty);
      list[idx] = { ...list[idx], qty: newQty };
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
// Effective shelf life = def.perishable.days × container.preservation.
// State ladder (ROT.freshnessThresholds): Fresh < 0.5 | Use soon 0.5–0.85
// | Spoiling 0.85–1 | Rotten > 1. `containerDef` is the OBJECT_DEFS entry
// of the container holding the stack (null = the player's bag, the 1.0
// baseline). Returns null for a non-perishable or a stack whose age is
// unknown (treated as freshly acquired — never instantly rotten). `pct` is
// the unclamped fraction of shelf life elapsed (can exceed 1 when Rotten),
// so sorters can rank urgency and eaters can scale restore.
function effectiveShelfDays(def, containerDef) {
  const shelf = def?.perishable?.days;
  if (!shelf) return null;
  const pres = containerDef?.container?.preservation ?? ROT.bagPreservation;
  return shelf * pres;
}

function freshnessOf(stack, containerDef, day) {
  const def = ITEM_DEFS[stack?.defId];
  const shelfDays = effectiveShelfDays(def, containerDef);
  if (shelfDays == null) return null;
  const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
  if (anchor == null || day == null) return null;
  const elapsed = day - anchor;
  // Negative elapsed only occurs after retimeStack moves an already-Rotten
  // stack into a slower container (its anchor lands in the future) — that
  // stack is still Rotten, never "fresh".
  const pct = elapsed < 0 ? 1 + (-elapsed) / shelfDays : elapsed / shelfDays;
  const { useSoon, spoiling } = ROT.freshnessThresholds;
  const key = pct > 1 ? 'rotten' : pct >= spoiling ? 'spoiling' : pct >= useSoon ? 'useSoon' : 'fresh';
  return {
    key,
    label: { fresh: 'Fresh', useSoon: 'Use soon', spoiling: 'Spoiling', rotten: 'Rotten' }[key],
    pct,
    rot: pct > 1,
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
function retimeStack(stack, fromDef, toDef, day) {
  const def = ITEM_DEFS[stack?.defId];
  const fromShelf = effectiveShelfDays(def, fromDef);
  const toShelf = effectiveShelfDays(def, toDef);
  if (fromShelf == null || toShelf == null) return stack;
  const anchor = stack?.meta?.cohort ?? stack?.meta?.acquiredDay;
  if (anchor == null || day == null) return stack;
  // No clamp: an already-Rotten stack (fraction > 1) must stay Rotten at
  // the destination, and a retimed-rotten anchor (elapsed < 0) must keep
  // its rottenness too — clamping to 0 would resurrect it as Fresh.
  const fraction = (day - anchor) / fromShelf;
  const newAnchor = day - fraction * toShelf;
  const meta = { ...(stack.meta || {}) };
  meta.cohort = newAnchor;
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
