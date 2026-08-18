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
    day: gameDaysNow(gs.meta.clock),
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
// def.perishable.days × ROT.preservation[storageClass] (preservationFor),
// derived from the stack's meta.cohort anchor (see ITEMS), never a stored
// countdown, so it survives saves, reloads, and multi-day time skips.
// `containerDef` is the OBJECT_DEFS entry of the container the stack sits
// in (null = the bag, the 1.0 baseline). Thresholds and preservation
// multipliers live in CONFIG's ROT block.
function stackFreshnessFraction(stack, day, containerDef) {
  const fresh = freshnessOf(stack, containerDef, day);
  return fresh?.pct ?? null;
}

function freshnessState(stack, day, containerDef) {
  return freshnessOf(stack, containerDef, day);
}

// Hours below a day, days above it — the one unit rule for every span the
// freshness UI prints. A span the player reads as "18h" is exactly the span
// that used to round to "day 0" and tell them nothing.
function formatFreshnessSpan(days) {
  if (!(days > 0)) return '0h';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${days < 10 ? Math.round(days * 10) / 10 : Math.round(days)}d`;
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
// Categories that count as food for edibility (edibleDef). 2026-08-17
// audit (B1): 'ingredient' joined the set. Ingredients ARE food — every
// edible ingredient (bread, cheese, cereal, eggs, milk…) carries real
// consumable values and was already eatable via the bag's Use verb, but
// the Eat chip and picker excluded them because the category allowlist
// didn't name 'ingredient', leaving a brand-new player with a fridge and
// pantry full of food and no Eat chip (the stove was broken on day one at
// the time, so cooking wasn't a bridge either — it now starts functional
// per D37, but the Eat chip rule stands on its own). Non-food ingredients
// (flour, sugar, garlic, butter) are still inedible: edibleDef ALSO
// requires non-empty `consumable`, which those lack. The chip and the bag's
// Use verb now read the same rule again.
const EDIBLE_CATEGORIES = new Set(['food', 'meal', 'snack', 'drink', 'ingredient']);

function itemServings(def) {
  return (def?.servings > 0) ? def.servings : 1;
}

// Total servings currently held by one stack — (qty−1)×servings plus the
// open item's remaining servings, or qty×servings for a wholly-untouched
// stack. Always ≥ 0. Food-overhaul Phase 3 (D25): a PLATE stack's serving
// ledger lives on the instance (meta.plate.servings.left), so this reads
// that for plate stacks and the def-driven encoding for everything else.
function stackServingsLeft(stack) {
  const plate = stack?.meta?.plate?.servings;
  if (plate) return Math.max(0, plate.left || 0);
  const sv = itemServings(stackDef(stack));
  if (!(stack?.qty > 0)) return 0;
  const sl = stack?.meta?.servingsLeft;
  if (sl == null) return stack.qty * sv;
  return Math.max(0, (stack.qty - 1) * sv + sl);
}

// Total servings a stack ever held: the plate's batch size (servings.total)
// for a plate stack, qty×servings for a def-driven stack. Used by the D25
// Servings-bar denominator.
function stackServingsTotal(stack) {
  const plate = stack?.meta?.plate?.servings;
  if (plate) return Math.max(0, plate.total || 0);
  const sv = itemServings(stackDef(stack));
  if (!(stack?.qty > 0)) return 0;
  const sl = stack?.meta?.servingsLeft;
  if (sl == null) return stack.qty * sv;
  return Math.max(0, (stack.qty - 1) * sv + Math.min(sv, sl));
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

// food-overhaul Phase 2 (D1): the item's total kcal. Edible defs carry it
// INSIDE consumable ({ kcal }) so the serving math divides it uniformly with
// every other consumable; the four raw-inedible ingredients (butter, flour,
// sugar, garlic) carry it at the def top level (`kcal:`) so they still fail
// edibleDef's non-empty-consumable test and stay OUT of the eat picker (the
// 2026-08-17 B1 audit contract). One helper owns the read.
function kcalOf(def) {
  if (!def) return 0;
  const c = def.consumable?.kcal;
  if (typeof c === 'number' && isFinite(c)) return c;
  const t = def.kcal;
  return (typeof t === 'number' && isFinite(t)) ? t : 0;
}

// Per-serving kcal (kcalOf / servings) — what the pickers show and what
// EAT_ITEM actually restores for one serving.
function perServingKcal(def) {
  return kcalOf(def) / itemServings(def);
}

// "Hunger +40, Mood +0.03" style summary of a consumable map (whole-item,
// or per-serving when requested). Values rounded to 2dp for display only —
// the restore itself is the exact fraction. food-overhaul Phase 2: the kcal
// is the player's fullness truth (D3), so it leads the summary and the
// hunger term yields to it when present (an item's hunger points still drive
// NPC eating, but a player facing this text restores from kcal).
function consumableSummary(def, { perServing = false } = {}) {
  const labels = { hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', mood: 'Mood' };
  const src = perServing ? perServingConsumable(def) : (def.consumable || {});
  const kcal = perServing ? perServingKcal(def) : kcalOf(def);
  const parts = [];
  if (kcal > 0) parts.push(`≈${Math.round(kcal)} kcal`);
  for (const [need, v] of Object.entries(src)) {
    if (need === 'kcal' || v === 0) continue;
    if (need === 'hunger' && kcal > 0) continue;
    parts.push(`${labels[need] || need} ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}`);
  }
  return parts.join(', ');
}

// Everything edible right now for the player to pick from: the bag, plus
// the fridge/pantry in the current room (or — from the dining room — the
// kitchen's fridge/pantry, since self.eat's picker is supposed to reach
// them in both rooms; the effects path resolves the kitchen object ids the
// same way trusted producers already do). Each option carries the location
// ref EAT_ITEM consumes from and the source label the picker shows.
function edibleStacks(gs, ctx) {
  const out = [];
  const day = gameDaysNow(gs?.meta?.clock);
  const collect = (list, from, sourceLabel, containerDef) => {
    for (const stack of list || []) {
      const def = stackDef(stack);
      if (!edibleDef(def)) continue;
      // Rotten is refuse, not a bad choice — it never reaches the picker.
      // EFFECTS' applyEatItem refuses it too, so the two agree by
      // construction rather than by both remembering to check.
      if (freshnessOf(stack, containerDef, day)?.key === 'rotten') continue;
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
    .filter(o => o.defId === 'fridge' || o.defId === 'pantry' || o.defId === 'freezer');
  if (inRoom.length > 0) return inRoom;
  if (ctx?.roomId === 'dining') {
    const kitchen = gs?.objects?.['room_kitchen'] || {};
    return Object.values(kitchen).filter(o => o.defId === 'fridge' || o.defId === 'pantry' || o.defId === 'freezer');
  }
  return [];
}

// Food-overhaul Phase 3 (D7/D26/D27): everything the Reheat action can
// touch — every PLATE stack with servings left (home-cooked leftovers, hot
// or frozen), reachable from the bag or the nearby fridge/pantry/freezer.
// Def-driven food is deliberately NOT listed: restaurant dishes keep their
// def's mood whether served hot or cold until a later phase decides they
// carry D27's contract too, and a frozen raw ingredient wants a real cook
// pass (Phase 5), not a reheat. Rotten plates are refused like edibleStacks
// refuses rotten food — you don't reheat what's already gone off.
function reheatableStacks(gs, ctx) {
  const out = [];
  const day = gameDaysNow(gs?.meta?.clock);
  const collect = (list, from, sourceLabel, containerDef) => {
    for (const stack of list || []) {
      const def = stackDef(stack);
      if (!isPlateStack(stack)) continue;
      if (!(stackServingsLeft(stack) > 0)) continue;
      if (freshnessOf(stack, containerDef, day)?.key === 'rotten') continue;
      out.push({ stack, def, from, sourceLabel, containerDef, day });
    }
  };
  collect(gs?.player?.inventory, 'player', 'Your bag', null);
  for (const obj of nearbyFoodContainers(gs, ctx)) {
    collect(obj?.contents, obj.id, containerDefOf(obj)?.label || 'Storage', containerDefOf(obj));
  }
  return out;
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

// --- Gifts (asks plan Phase 9) ---
// What the player can hand to an NPC as a gift: every stack in the bag the
// give verb would allow (stackActions.give's rule — not a key item), with a
// quantity to spare. Key items are the player's own identity (keys, wallet,
// phone); everything else is their call — a candle, a bottle of wine, a
// half-used bottle of dish soap. The gift ask's picker (ui.js
// openConvGiftPicker) and its availability gate both read this, so the menu
// and the send can never disagree on what is giftable.
function giftableStacks(gs) {
  const inv = (gs && gs.player && gs.player.inventory) || [];
  return inv.filter(s => {
    const def = stackDef(s);
    const keyItem = !!(s && s.meta && s.meta.keyItem) || !!(def && def.keyItem);
    return !keyItem && (s && s.qty || 0) > 0;
  });
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
  const plate = stack?.meta?.plate;
  const label = typeof stack === 'string' ? stack
    : (stack?.name && !stack?.defId ? stack.name
      : (plate?.label
        ? plate.label
        : (def.id === '_unknown' ? (stack?.meta?.origName || def.label) : def.label)));
  const freshness = freshnessState(stack, day, containerDef);
  // Food-overhaul Phase 1 (D17/D29): the frozen/thawing states change what
  // the freshness line should say — a frozen stack isn't "aging here", and
  // a thawing one is on a visible countdown.
  let freshnessText = null;
  if (freshness) {
    if (freshness.frozenState === 'frozen') {
      freshnessText = 'Frozen — keeps indefinitely (doesn\u2019t spoil while frozen)';
    } else if (freshness.frozenState === 'thawing' && stack?.meta?.frozen?.thawStartAbs != null && day != null) {
      const remainingH = THAW_TUNING.roomTempThawHours - (day - stack.meta.frozen.thawStartAbs) * 24;
      freshnessText = `Thawing — ready in ~${Math.max(1, Math.ceil(remainingH))}h`;
    } else {
      freshnessText = `${freshness.label || 'Good'} · ${formatFreshnessSpan(freshness.ageDays)} old · keeps ~${formatFreshnessSpan(freshness.shelfDays)} here`;
    }
  }
  return {
    label,
    qty: typeof stack === 'object' && stack?.qty != null ? stack.qty : 1,
    sublabel: SORT_GROUPS[def.sortGroup]?.label || def.category || 'Item',
    description: buildItemDescription(stack, def),
    freshness,
    // Age and remaining life read in HOURS below a day, which is the whole
    // point of the continuous model — "day 0/1" told the player nothing
    // about a dish that had four good hours left in it.
    freshnessText,
    plate: plate || null,
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
  // Food-overhaul Phase 3 (D5/D25/D27): a PLATE stack's description is its
  // instance, not the carrier def — the Servings bar numbers, the quality
  // and grade, and the reheat hint when the batch should be eaten hot.
  const plate = stack?.meta?.plate;
  if (plate) {
    const parts = [];
    const bar = plateServingsLeft(stack);
    if (bar) parts.push(`${bar.left} of ${bar.total} servings left`);
    parts.push(`${Math.round(plate.quality * 100)}% quality · grade ${plate.grade}`);
    parts.push(`≈${plate.kcalPerServing} kcal per serving`);
    if (plate.components?.length) {
      parts.push(`Made with ${plate.components.map(c => `${ITEM_DEFS[c.defId]?.label || c.defId}${c.qty > 1 ? ` ×${c.qty}` : ''}`).join(', ')}.`);
    }
    // Food-overhaul Phase 5 (D15): the failure tags live on the snapshot —
    // a bland or burnt batch says so, so the fridge doesn't pretend.
    if (plate.flaws?.length) {
      parts.push(plate.flaws.map(f => COOK_TUNING[f]?.line || f).join(' '));
    }
    if (RECIPES[plate.recipeKey]?.betterHot && !plate.wasReheated) {
      parts.push('Better eaten reheated — reheating restores the mood bonus.');
    }
    return parts.join(' ');
  }
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
    // Food-overhaul Phase 1 (D18): the fridge multiplier reads the one
    // owning table (preservationFor) rather than a hardcoded copy.
    parts.push(`Perishable — about ${formatFreshnessSpan(def.perishable.days)} out in the open before it's inedible, ${preservationFor(OBJECT_DEFS.fridge)}× that in the fridge. It goes stale, then spoiled, then rotten.`);
  }
  if (stack?.meta?.keyItem || def.keyItem) {
    parts.push('A personal item — you can\u2019t drop, trash, or give it away.');
  }
  return parts.join(' ');
}

// ===== /SECTION: INVENTORY =====
