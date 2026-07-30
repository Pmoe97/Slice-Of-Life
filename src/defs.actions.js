// ===== SECTION: DEFS.ACTIONS =====
// Declarative action registry — the data half of the action engine (see
// ACTIONS for the executor). Each entry describes: where it's available
// from (source), what gates it (requires), what it costs (timeCost), what
// it does (effects — EFFECTS-vocabulary DSL strings, static or computed at
// runtime via `prepare`/`buildEffects`, see ACTIONS' executeAction), and
// how it's narrated. `source.kind` is 'object'|'room'|'npc'|'self'|'item'|
// 'app'.
//
// Porting note: only the five simplest verbs (eat/cook/shower/watch_tv/
// relax) are ported here — see renderActionChips (RENDER) and handleAction
// (UI), which resolve/dispatch these through resolveAvailableActions/
// executeAction (ACTIONS) instead of a hardcoded if-chain and switch case.
// sleep/work/talk/move/pay-rent/ask-to-leave keep their hand-written
// UI.js implementations for now — they involve multi-tick batching, LLM
// calls, or residency mutation that fit more naturally once the
// free-action pipeline (P5) exists. self.cook is object-sourced (the
// stove) and recipe-driven (ITEMS' RECIPES/pickAvailableRecipe) — the
// first action to actually use the object model beyond room-gating; see
// prepareCook/buildCookEffects/cookNarration below.

const ACTION_DEFS = {
  'self.eat': {
    id: 'self.eat', label: 'Eat', verbs: ['eat', 'snack', 'grab a bite'],
    source: { kind: 'room', roomIds: ['kitchen'] },
    group: 'kitchen', chipPriority: 30,
    requires: [],
    timeCost: { base: 1 },
    effects: [`ADJUST_NEED player hunger +${NEEDS.hunger.eatRestore}`],
    narration: { mode: 'template', templates: ['You grab something to eat. Better.'] },
  },
  'self.cook': {
    id: 'self.cook', label: 'Cook', verbs: ['cook', 'make food', 'prepare a meal'],
    source: { kind: 'object', objDef: 'stove' },
    group: 'kitchen', chipPriority: 40,
    requires: ['hasRecipeIngredients'],
    timeCost: { base: 2 },
    prepare: prepareCook,
    buildEffects: buildCookEffects,
    narration: { mode: 'dynamic', build: cookNarration },
  },
  'self.shower': {
    id: 'self.shower', label: 'Shower', verbs: ['shower', 'wash up', 'bathe'],
    source: { kind: 'room', roomIds: ['bathroom'] },
    group: 'bathroom', chipPriority: 30,
    requires: [],
    timeCost: { base: 1 },
    effects: [`ADJUST_NEED player hygiene +${NEEDS.hygiene.washRestore}`],
    narration: { mode: 'template', templates: ['You take a shower. Refreshed.'] },
  },
  'self.watch_tv': {
    id: 'self.watch_tv', label: 'Watch TV', verbs: ['watch tv', 'watch television', 'put on a show'],
    source: { kind: 'room', roomIds: ['living_room'] },
    group: 'living_room', chipPriority: 30,
    requires: [],
    timeCost: { base: 2 },
    effects: [`ADJUST_NEED player mood +${ACTION_TUNING.tvMoodGain}`],
    narration: { mode: 'template', templates: ['You watch some TV. Mindless, relaxing.'] },
  },
  'self.relax': {
    id: 'self.relax', label: 'Relax', verbs: ['relax', 'unwind', 'chill', 'take a breather'],
    source: { kind: 'room', roomIds: ['living_room'] },
    group: 'living_room', chipPriority: 20,
    requires: [],
    timeCost: { base: 1 },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.relaxMoodGain}`,
      `ADJUST_NEED player energy +${ACTION_TUNING.relaxEnergyGain}`,
    ],
    narration: { mode: 'template', templates: ['You take a moment to just breathe.'] },
  },
};

// Name→predicate registry, mirroring SIM's CAST_REQUIREMENT_CHECKERS
// (config-declared requirement names, one predicate implementation per
// name). Each checker takes (ctx, ...args) and returns true, or a string
// reason the action is currently unavailable. `requires` entries on an
// ACTION_DEFS record are 'name' or 'name:arg:arg'.
const ACTION_REQUIREMENT_CHECKERS = {
  needAbove: (ctx, need, min) => (ctx.gameState.player[need] ?? 100) >= Number(min) || `Not enough ${need}.`,
  needBelow: (ctx, need, max) => (ctx.gameState.player[need] ?? 0) <= Number(max) || `${need} is too high right now.`,
  moneyAtLeast: (ctx, amt) => ctx.gameState.player.money >= Number(amt) || `Can't afford it (need $${amt}).`,
  phaseIn: (ctx, ...phases) => phases.includes(ctx.gameState.meta.clock.phase) || 'Not the right time of day.',
  alone: (ctx) => ctx.presentNpcIds.length === 0 || 'Not alone right now.',
  roomIs: (ctx, ...roomIds) => roomIds.includes(ctx.gameState.player.location) || 'Wrong room for that.',
  skillAtLeast: (ctx, skillId, lvl) => skillLevelSafe(ctx.gameState.player, skillId) >= Number(lvl) || `Requires ${skillId} level ${lvl}.`,
  hasFlag: (ctx, who, key) => !!resolveFlagBagSafe(ctx, who)[key] || 'Conditions not met.',
  hasRecipeIngredients: (ctx) => {
    const fridge = findObjectInRoom(ctx, 'fridge');
    const pantry = findObjectInRoom(ctx, 'pantry');
    return !!pickAvailableRecipe(fridge?.contents, pantry?.contents) || 'Nothing to cook — the kitchen is out of ingredients.';
  },
};

// --- self.cook's runtime logic (ITEMS-backed: ITEM_DEFS/RECIPES) ---
// prepare() picks the recipe once; buildEffects/cookNarration both read
// that same pick, so what happened and what got said about it can't
// disagree (see ACTIONS' executeAction for why this two-step exists).
function prepareCook(ctx) {
  const fridge = findObjectInRoom(ctx, 'fridge');
  const pantry = findObjectInRoom(ctx, 'pantry');
  return { recipe: pickAvailableRecipe(fridge?.contents, pantry?.contents), fridge, pantry };
}

// Ingredients may be split across fridge and pantry (an omelette's eggs
// come from the fridge, a sandwich's bread from the pantry and cheese
// from the fridge) — checks fridge stock first, pantry for the remainder,
// matching pickAvailableRecipe's combined-pool availability check.
function ingredientConsumeLines(ing, fridge, pantry) {
  const fridgeQty = stackQty(fridge?.contents, ing.defId);
  const fromFridge = Math.min(ing.qty, fridgeQty);
  const fromPantry = ing.qty - fromFridge;
  const lines = [];
  if (fromFridge > 0 && fridge) lines.push(`CONSUME_ITEM ${ing.defId} ${fromFridge} ${fridge.id}`);
  if (fromPantry > 0 && pantry) lines.push(`CONSUME_ITEM ${ing.defId} ${fromPantry} ${pantry.id}`);
  return lines;
}

// RECIPES' `leaves` lines use {stove}/{sink} placeholders (declared once,
// resolved here against whichever actual instance is in this kitchen —
// the same recipe text works regardless of the room's seeded object ids).
function expandCookLeaveLine(line, ctx) {
  const stove = findObjectInRoom(ctx, 'stove');
  const sink = findObjectInRoom(ctx, 'sink_kitchen');
  return line.replace('{stove}', stove?.id || '').replace('{sink}', sink?.id || '');
}

// Produces the full recipe batch into inventory, then eats one portion
// immediately (matching the old self.cook's "click once, hunger restored"
// feel) — leftovers stay in inventory when a recipe produces more than 1.
function buildCookEffects(ctx, prepared) {
  if (!prepared?.recipe) return [];
  const { recipe, fridge, pantry } = prepared;
  const lines = recipe.ingredients.flatMap(ing => ingredientConsumeLines(ing, fridge, pantry));
  lines.push(`SPAWN_ITEM ${recipe.produces.defId} ${recipe.produces.qty} player`);
  lines.push(`CONSUME_ITEM ${recipe.produces.defId} 1 player`);
  for (const leave of recipe.leaves || []) lines.push(expandCookLeaveLine(leave, ctx));
  return lines;
}

function cookNarration(ctx, prepared) {
  if (!prepared?.recipe) return 'You rummage through the kitchen but come up empty-handed.';
  const leftover = prepared.recipe.produces.qty > 1;
  return `You cook ${prepared.recipe.label.toLowerCase()}. It smells good` + (leftover ? " — there's enough for leftovers." : '.');
}

// Guard used before SKILLS (P3) exists — skillMod/skillLevel land then;
// until this phase, every skill reads as level 0 rather than throwing a
// ReferenceError the first time a requirement references one.
function skillLevelSafe(player, skillId) {
  if (typeof skillLevel === 'function') return skillLevel(player, skillId);
  return 0;
}
function resolveFlagBagSafe(ctx, who) {
  if (who === 'player') return ctx.gameState.player.flags || {};
  return ctx.gameState.npcs[who]?.flags || {};
}

// ===== /SECTION: DEFS.ACTIONS =====
