// ===== SECTION: ITEMS =====
// Item stacks, container contents, recipes, and legacy-inventory
// normalization. Pure functions only — mutation happens through EFFECTS'
// applyEffects (MOVE_ITEM/CONSUME_ITEM/DESTROY_ITEM/SPAWN_ITEM), which
// calls into these helpers rather than duplicating stack-list logic.
//
// Uniform stack shape everywhere: { defId, qty, ownerId, meta }.

function stackQty(stacks, defId) {
  return (stacks || []).filter(s => s.defId === defId).reduce((sum, s) => sum + s.qty, 0);
}

// Every purchasable item, computed once at load (ITEM_DEFS is static
// content, not runtime state) — COMPUTER's Nile app browses this list
// directly rather than a hand-authored parallel catalog, so pricing lives
// with the item once.
const SHOP_CATALOG_LIST = Object.values(ITEM_DEFS).filter(d => d.id !== '_unknown' && d.price != null);

// Adds qty of defId to a stack list, merging into an existing same-owner
// stack when the def is stackable (capped at maxStack), else appending a
// new entry. Returns a new array — never mutates the input.
function addStack(stacks, defId, qty, ownerId, meta) {
  const def = ITEM_DEFS[defId] || ITEM_DEFS._unknown;
  const list = [...(stacks || [])];
  if (def.stackable) {
    const idx = list.findIndex(s => s.defId === defId && s.ownerId === (ownerId ?? null));
    if (idx >= 0) {
      const newQty = Math.min(def.maxStack || Infinity, list[idx].qty + qty);
      list[idx] = { ...list[idx], qty: newQty };
      return list;
    }
  }
  list.push({ defId, qty, ownerId: ownerId ?? null, meta: meta || {} });
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

// First recipe (declaration order) whose ingredients are fully covered by
// the combined fridge+pantry contents — see RECIPES' file comment for why
// declaration order is a deliberate priority, not incidental.
function pickAvailableRecipe(fridgeContents, pantryContents) {
  const pool = [...(fridgeContents || []), ...(pantryContents || [])];
  return Object.values(RECIPES).find(r => recipeAvailable(r, pool)) || null;
}

// ===== /SECTION: ITEMS =====
