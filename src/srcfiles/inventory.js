// ===== SECTION: INVENTORY =====
// (inventory overhaul Phase 1)
// Pure query/sort/describe helpers over stack lists — no DOM, no state
// mutation. All mutation routes through EFFECTS' applyEffects (MOVE_ITEM /
// CONSUME_ITEM / DESTROY_ITEM), mirroring ITEMS' pure-function contract;
// the panel (RENDER), the action handlers (UI), and Phase 2's container
// views all read these to decide what to show and which effect-DSL lines
// to emit. Never call addStack/removeStack from here.
//
// Uniform stack shape everywhere: { defId, qty, ownerId, meta } — meta
// carries the Phase 1 contract (acquiredDay/cohort/keyItem/servingsLeft/
// origName; see ITEMS' header comment for the full list).

function stackDef(stack) {
  return ITEM_DEFS[stack?.defId] || ITEM_DEFS._unknown;
}

// --- Containers (Phase 2) ---
// The shared container-view contract. Any OBJECT_DEFS entry with a
// `container` block is a chest; the browse/transfer UI (RENDER's
// container panel + UI's transfer handlers) is ONE implementation for
// every container — no fridge-specific path. `containerStacks` reads the
// instance's .contents; `transferPlan` turns a transfer intent into the
// MOVE_ITEM effect-DSL lines to emit (mutation still routes exclusively
// through applyEffects). Take All / Put All are just transferPlan per
// stack, batched into one applyEffects + one advanceAndResolveMinutes.
function containerStacks(obj) {
  return obj?.contents || [];
}

function containerDefOf(obj) {
  const def = OBJECT_DEFS[obj?.defId];
  return def?.container || null;
}

// Returns the MOVE_ITEM DSL lines (usually exactly one) that move qty of
// defId from `from` to `to`, where each ref is 'player' or a container
// object id — the same refs locationStackListMutable (EFFECTS) resolves.
// Empty array = nothing to do; the caller decides whether to still pay
// time.
function transferPlan(from, to, defId, qty) {
  if (!(qty > 0)) return [];
  return [`MOVE_ITEM ${defId} ${qty} ${from} ${to}`];
}

// Everything the panel/action layer needs to evaluate a stack's context,
// assembled in one place so the renderer and the handlers can't drift
// apart on what "here" means. `roomObjects` is { objId: instance } for
// the player's current room (the same shape effects.js uses). `gameState`
// is included so the same ctx object can be handed to applyEffects (the
// effect appliers read ctx.gameState) without rebuilding it.
function buildInventoryCtx(gs) {
  const roomObjects = (gs.objects && gs.objects[`room_${gs.player.location}`]) || {};
  return {
    gameState: gs,
    day: gs.meta.clock.day,
    roomId: gs.player.location,
    roomObjects,
    presentNpcIds: getPresentNpcIds(gs.npcs, gs.player.location),
  };
}

// --- Grouping ---
// Groups stacks by def.sortGroup (stamped at load from the def's category
// in DEFS.WORLD — the renderer never hardcodes a category→group list),
// ordered by SORT_GROUPS.order. Returns [{ id, label, stacks }].
function groupStacks(stacks) {
  const groups = new Map();
  for (const stack of stacks || []) {
    const id = stackDef(stack).sortGroup || 'other';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(stack);
  }
  return [...groups.entries()]
    .sort((a, b) => (SORT_GROUPS[a[0]]?.order ?? 999) - (SORT_GROUPS[b[0]]?.order ?? 999))
    .map(([id, list]) => ({ id, label: SORT_GROUPS[id]?.label || id, stacks: list }));
}

// --- Sorting ---
// modes: 'name' (A→Z), 'category' (group order, then name), 'qty'
// (largest first), 'freshness' (most-urgent perishables first, then
// non-perishables). `day` feeds the freshness comparison (Phase 4:
// container-aware — a stack's urgency is its fraction of shelf life
// elapsed, which needs today's game day). Returns a new array.
function sortStacks(stacks, mode, day) {
  const list = [...(stacks || [])];
  const byName = (a, b) => (stackDef(a).label || '').localeCompare(stackDef(b).label || '');
  switch (mode) {
    case 'name': return list.sort(byName);
    case 'qty': return list.sort((a, b) => (b.qty || 0) - (a.qty || 0) || byName(a, b));
    case 'freshness': {
      const frac = s => stackFreshnessFraction(s, day);
      return list.sort((a, b) => {
        const fa = frac(a), fb = frac(b);
        if (fa == null && fb == null) return byName(a, b);
        if (fa == null) return 1;
        if (fb == null) return -1;
        return fb - fa || byName(a, b);
      });
    }
    case 'category':
    default: {
      const order = s => SORT_GROUPS[stackDef(s).sortGroup]?.order ?? 999;
      return list.sort((a, b) => order(a) - order(b) || byName(a, b));
    }
  }
}

// --- Filtering ---
// Case-insensitive substring match against the def's label and nouns, plus
// a legacy `_unknown` stack's preserved origName. Empty query = pass-all.
function filterStacks(stacks, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return stacks;
  return (stacks || []).filter(s => {
    const def = stackDef(s);
    const label = (def.id === '_unknown' ? s?.meta?.origName : def.label) || '';
    const alias = s?.meta?.origName || '';
    return label.toLowerCase().includes(q)
      || alias.toLowerCase().includes(q)
      || (def.nouns || []).some(n => n.toLowerCase().includes(q));
  });
}

// --- Freshness (Phase 1: display-grade → Phase 4: derived model) ---
// These are thin delegates over ITEMS' freshnessOf — the one implementation
// of the container-aware derived model (D5): effective shelf life =
// def.perishable.days × container.preservation, derived from the stack's
// meta.cohort anchor (see ITEMS), never a stored countdown, so it survives
// saves, reloads, and multi-day time skips. `containerDef` is the
// OBJECT_DEFS entry of the container the stack sits in (null = the bag,
// the 1.0 baseline). Thresholds and preservation multipliers live in
// CONFIG's ROT block.
function stackFreshnessFraction(stack, day, containerDef) {
  const fresh = freshnessOf(stack, containerDef, day);
  return fresh?.pct ?? null;
}

function freshnessState(stack, day, containerDef) {
  return freshnessOf(stack, containerDef, day);
}

// --- Edibility & servings (Phase 3) ---
// Item-driven eating: a def is edible when it has a consumable effect AND
// its category is something you'd eat or drink (food/meal/snack/drink).
// Ingredients are deliberately NOT in the eat picker — they're cooking
// stock, not what the picker offers — though the panel's Use verb still
// consumes them raw (via EAT_ITEM, servings absent = whole item), which is
// unchanged from Phase 1.
// A def may declare `servings: n` (e.g. a whole dish_pepperoni_pizza is 4
// slices). One stack of a multi-serving item tracks a partially-eaten item
// via meta.servingsLeft: qty counts the open item plus any whole items
// behind it, and stackServingsLeft() is the stack's true total. Eating one
// serving restores consumable/servings and re-encodes the stack (EFFECTS'
// EAT_ITEM applier) — so eating a whole item sums to exactly its
// consumable values, and leftovers are a real recurring resource rather
// than a flavour word.
const EDIBLE_CATEGORIES = new Set(['food', 'meal', 'snack', 'drink']);

function itemServings(def) {
  return (def?.servings > 0) ? def.servings : 1;
}

// Total servings currently held by one stack — (qty−1)×servings plus the
// open item's remaining servings, or qty×servings for a wholly-untouched
// stack. Always ≥ 0.
function stackServingsLeft(stack) {
  const sv = itemServings(stackDef(stack));
  if (!(stack?.qty > 0)) return 0;
  const sl = stack?.meta?.servingsLeft;
  if (sl == null) return stack.qty * sv;
  return Math.max(0, (stack.qty - 1) * sv + sl);
}

function edibleDef(def) {
  return !!def && !!def.consumable && Object.keys(def.consumable).length > 0
    && EDIBLE_CATEGORIES.has(def.category);
}

// Per-serving consumable values (consumable / servings) — the numbers the
// eat picker and item descriptions show, and exactly what EAT_ITEM
// restores for one serving.
function perServingConsumable(def) {
  const sv = itemServings(def);
  const out = {};
  for (const [need, amt] of Object.entries(def.consumable || {})) out[need] = amt / sv;
  return out;
}

// "Hunger +40, Mood +0.03" style summary of a consumable map (whole-item,
// or per-serving when requested). Values rounded to 2dp for display only —
// the restore itself is the exact fraction.
function consumableSummary(def, { perServing = false } = {}) {
  const labels = { hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', mood: 'Mood' };
  const src = perServing ? perServingConsumable(def) : (def.consumable || {});
  return Object.entries(src)
    .filter(([, v]) => v !== 0)
    .map(([need, v]) => `${labels[need] || need} ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}`)
    .join(', ');
}

// Everything edible right now for the player to pick from: the bag, plus
// the fridge/pantry in the current room (or — from the dining room — the
// kitchen's fridge/pantry, since self.eat's picker is supposed to reach
// them in both rooms; the effects path resolves the kitchen object ids the
// same way trusted producers already do). Each option carries the location
// ref EAT_ITEM consumes from and the source label the picker shows.
function edibleStacks(gs, ctx) {
  const out = [];
  const day = gs?.meta?.clock?.day;
  const collect = (list, from, sourceLabel, containerDef) => {
    for (const stack of list || []) {
      const def = stackDef(stack);
      if (!edibleDef(def)) continue;
      out.push({ stack, def, from, sourceLabel, containerDef, day });
    }
  };
  collect(gs?.player?.inventory, 'player', 'Your bag', null);
  for (const obj of nearbyFoodContainers(gs, ctx)) {
    collect(obj?.contents, obj.id, containerDefOf(obj)?.label || 'Fridge', containerDefOf(obj));
  }
  return out;
}

function nearbyFoodContainers(gs, ctx) {
  const inRoom = Object.values(ctx?.roomObjects || {})
    .filter(o => o.defId === 'fridge' || o.defId === 'pantry');
  if (inRoom.length > 0) return inRoom;
  if (ctx?.roomId === 'dining') {
    const kitchen = gs?.objects?.['room_kitchen'] || {};
    return Object.values(kitchen).filter(o => o.defId === 'fridge' || o.defId === 'pantry');
  }
  return [];
}

// --- Actions ---
// Which verbs are legal for this stack right now. `use` = has a
// consumable effect to apply; `eat` (Phase 3) = the def is edible, i.e.
// it's eligible for the self.eat picker (the panel routes food through
// the same EAT_ITEM serving-aware consumption as its Use verb); `give` is
// computed against the present NPCs (the panel button itself arrives in
// Phase 8 — the quest path already exists via the give-item chip); `drop`
// needs a floor object in the current room; `transfer` (Phase 2) is true
// when a browsable container is in the current room. `keyItem` (from the
// stack's meta or the def) suppresses drop/trash/give/transfer entirely.
function stackActions(stack, ctx = {}) {
  const def = stackDef(stack);
  const keyItem = !!(stack?.meta?.keyItem || def.keyItem);
  const hasConsumable = !!(def.consumable && Object.keys(def.consumable).length);
  const hasFloor = Object.values(ctx.roomObjects || {}).some(o => o.defId === 'floor');
  const hasBrowsableContainer = Object.values(ctx.roomObjects || {})
    .some(o => OBJECT_DEFS[o.defId]?.affords?.includes('container.open'));
  return {
    use: !keyItem && hasConsumable,
    eat: !keyItem && edibleDef(def),
    give: !keyItem && (ctx.presentNpcIds?.length > 0), // Phase 8 wires the button
    drop: !keyItem && hasFloor,
    trash: !keyItem,
    transfer: !keyItem && hasBrowsableContainer,
    // Phase 6: a buyable hobby object (a hobby-category def with a matching
    // OBJECT_DEFS entry) can be placed in the current room, turning the
    // shipped item into a placed object that unlocks its action there.
    place: !keyItem && def.category === 'hobby' && !!OBJECT_DEFS[stack?.defId],
  };
}

// --- Description (for the panel's detail pane) ---
// Returns { label, qty, sublabel, description, freshness, freshnessText,
// tooltip }. Tolerates un-migrated legacy shapes (a bare string, or an
// object with `name` instead of defId) so the panel never crashes in the
// window before a legacy save's migration runs.
function describeStack(stack, ctx = {}) {
  const day = ctx.day;
  const containerDef = ctx.containerDef ?? null;
  const def = stackDef(stack);
  const label = typeof stack === 'string' ? stack
    : (stack?.name && !stack?.defId ? stack.name
      : (def.id === '_unknown' ? (stack?.meta?.origName || def.label) : def.label));
  const freshness = freshnessState(stack, day, containerDef);
  const anchor = freshness && stack?.meta ? (stack.meta.cohort ?? stack.meta.acquiredDay) : null;
  return {
    label,
    qty: typeof stack === 'object' && stack?.qty != null ? stack.qty : 1,
    sublabel: SORT_GROUPS[def.sortGroup]?.label || def.category || 'Item',
    description: buildItemDescription(stack, def),
    freshness,
    freshnessText: freshness && anchor != null && day != null
      ? `${freshness.label} · day ${Math.max(0, Math.round(day - anchor))}/${Math.round(def.perishable.days)}`
      : null,
    tooltip: def.id === '_unknown'
      ? 'The game doesn\u2019t recognize this item — probably from before the item system. It won\u2019t spoil or do anything until you use or dispose of it.'
      : null,
  };
}

// Generated description from the def's data; a def may override it with an
// authored `desc` field (later phases add those) and that always wins.
function buildItemDescription(stack, def) {
  if (def.desc) return def.desc;
  if (def.id === '_unknown') return stack?.meta?.origName || 'An unidentified item.';
  if (def.category === 'hobby' && OBJECT_DEFS[def.id]) {
    const objDef = OBJECT_DEFS[def.id];
    return `A ${objDef.label.toLowerCase()} in its shipping box. Place it in a room to set it up — then you can use it there.`;
  }
  const parts = [];
  const consumable = def.consumable;
  if (consumable && Object.keys(consumable).length) {
    if (itemServings(def) > 1) {
      parts.push(`Serves ${def.servings} — one serving restores ${consumableSummary(def, { perServing: true })}.`);
    } else {
      parts.push(`Consuming restores ${consumableSummary(def)}.`);
    }
  } else {
    parts.push('Not consumable.');
  }
  if (def.perishable?.days) {
    parts.push(`Perishable — keeps about ${def.perishable.days} days out in the open, longer in the fridge.`);
  }
  if (stack?.meta?.keyItem || def.keyItem) {
    parts.push('A personal item — you can\u2019t drop, trash, or give it away.');
  }
  return parts.join(' ');
}

// ===== /SECTION: INVENTORY =====
