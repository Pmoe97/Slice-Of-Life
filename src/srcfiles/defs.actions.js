// ===== SECTION: DEFS.ACTIONS =====
// Declarative action registry (Apartment Expansion v2 — Mirrored H).
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
    source: { kind: 'room', roomIds: ['kitchen', 'dining'] },
    group: 'kitchen', chipPriority: 30,
    requires: [],
    timeCost: { base: 15 },
    effects: [`ADJUST_NEED player hunger +${NEEDS.hunger.eatRestore}`],
    narration: { mode: 'template', templates: ['You grab a bite to eat.'] },
  },
  'self.cook': {
    id: 'self.cook', label: 'Cook', verbs: ['cook', 'make food', 'prepare a meal'],
    source: { kind: 'object', objDef: 'stove' },
    group: 'kitchen', chipPriority: 40,
    requires: ['hasRecipeIngredients', 'gasNotCutoff', 'facilityFunctional:kitchen_stove'],
    timeCost: { base: 30, perIngredient: 3, max: 50, skill: 'cooking', curve: 'timeReduction', min: 15 },
    skill: { id: 'cooking', xp: 12 },
    meters: [['cooking', 1], ['devices', 0.5]],
    prepare: prepareCook,
    buildEffects: buildCookEffects,
    narration: { mode: 'dynamic', build: cookNarration },
  },
  'self.shower': {
    id: 'self.shower', label: 'Shower', verbs: ['shower', 'wash up', 'bathe'],
    source: { kind: 'room', roomIds: ['bathroom_a', 'bathroom_b'] },
    group: 'bathroom', chipPriority: 30,
    // Bathroom source room IDs cover both wings (bathroom_a, bathroom_b)
    requires: ['waterNotCutoff', 'facilityFunctionalHere:self.shower'],
    // Exposed for the duration of the action — see ACTIONS'
    // withVulnerableState and SIM's getPlayerVulnerableState.
    vulnerableState: 'showering',
    timeCost: { base: 15 },
    effects: [`ADJUST_NEED player hygiene +${NEEDS.hygiene.washRestore}`],
    meters: [['showers', 1], ['waterHeating', 1]],
    narration: { mode: 'template', templates: ['You take a shower. Refreshed.'] },
  },
  'self.watch_tv': {
    id: 'self.watch_tv', label: 'Watch TV', verbs: ['watch tv', 'watch television', 'put on a show'],
    source: { kind: 'room', roomIds: ['living_room'] },
    group: 'living_room', chipPriority: 30,
    requires: ['facilityFunctional:living_room_entertainment'],
    narration: { mode: 'template', templates: ['You watch some TV. Mindless, relaxing.'] },
  },
  'self.relax': {
    id: 'self.relax', label: 'Relax', verbs: ['relax', 'unwind', 'chill', 'take a breather'],
    source: { kind: 'room', roomIds: ['living_room', 'study', 'balcony'] },
    group: 'living_room', chipPriority: 20,
    requires: [],
    timeCost: { base: 15 },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.relaxMoodGain}`,
      `ADJUST_NEED player energy +${ACTION_TUNING.relaxEnergyGain}`,
    ],
    narration: { mode: 'template', templates: ['You take a moment to just breathe.'] },
  },
  'self.dishes': {
    id: 'self.dishes', label: 'Wash Dishes', verbs: ['wash dishes', 'do the dishes', 'clean up'],
    source: { kind: 'object', objDef: 'sink_kitchen' },
    group: 'kitchen', chipPriority: 25,
    requires: ['dishesDirty', 'waterNotCutoff'],
    timeCost: { base: 10, perDirtyDish: 8, max: 30, skill: 'cleaning', curve: 'cleanEfficiency', min: 5 },
    skill: { id: 'cleaning', xp: 8 },
    meters: [['dishes', 1], ['waterHeating', 0.5]],
    prepare: prepareDishes,
    buildEffects: buildDishesEffects,
    narration: { mode: 'dynamic', build: dishesNarration },
  },
  'self.lock_door': {
    id: 'self.lock_door', label: 'Lock Door', verbs: ['lock the door', 'lock door'],
    source: { kind: 'object', objDefs: ['bedroom_door', 'bathroom_door'] },
    group: 'door', chipPriority: 35,
    requires: ['doorUnlocked'],
    timeCost: { base: 1 },
    prepare: prepareDoor,
    buildEffects: buildLockDoorEffects,
    narration: { mode: 'dynamic', build: lockDoorNarration },
  },
  'self.unlock_door': {
    id: 'self.unlock_door', label: 'Unlock Door', verbs: ['unlock the door', 'unlock door'],
    source: { kind: 'object', objDefs: ['bedroom_door', 'bathroom_door'] },
    group: 'door', chipPriority: 35,
    requires: ['doorLocked'],
    timeCost: { base: 1 },
    prepare: prepareDoor,
    buildEffects: buildUnlockDoorEffects,
    narration: { mode: 'dynamic', build: unlockDoorNarration },
  },
  'self.workout': {
    id: 'self.workout', label: 'Work Out', verbs: ['work out', 'workout', 'exercise', 'lift weights'],
    source: { kind: 'room', roomIds: ['gym'] },
    group: 'gym', chipPriority: 35,
    requires: ['facilityFunctional:gym_equipment'],
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.workoutMoodGain}`,
      `ADJUST_NEED player energy -${ACTION_TUNING.workoutEnergyCost}`,
      `ADJUST_NEED player hygiene -${ACTION_TUNING.workoutHygieneCost}`,
    ],
    meters: [['devices', 0.5]],
    narration: { mode: 'template', templates: ['You get a good workout in. Winded but feeling sharp.'] },
  },
  'self.swim': {
    id: 'self.swim', label: 'Swim', verbs: ['swim', 'swim laps', 'take a dip', 'go for a swim'],
    source: { kind: 'room', roomIds: ['pool_room'] },
    group: 'pool_room', chipPriority: 35,
    requires: ['facilityFunctional:pool_systems'],
    timeCost: { base: 30 },
    skill: { id: 'fitness', xp: 10 },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.swimMoodGain}`,
      `ADJUST_NEED player energy -${ACTION_TUNING.swimEnergyCost}`,
      // Unlike the gym, a swim leaves you cleaner than it found you.
      `ADJUST_NEED player hygiene +${ACTION_TUNING.swimHygieneGain}`,
    ],
    // Heating and filtration are the cost here, not the swimmer.
    meters: [['devices', 1.5], ['waterHeating', 1]],
    narration: { mode: 'template', templates: ['You swim until your arms ache. The water is the quietest place in the apartment.'] },
  },
  'self.play_games': {
    id: 'self.play_games', label: 'Play Games', verbs: ['play games', 'game', 'play video games', 'play pool'],
    source: { kind: 'room', roomIds: ['game_room'] },
    group: 'game_room', chipPriority: 35,
    requires: ['facilityFunctional:game_room_setup'],
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.gamesMoodGain}`,
      `ADJUST_NEED player energy -${ACTION_TUNING.gamesEnergyCost}`,
    ],
    meters: [['devices', 1]],
    narration: { mode: 'template', templates: ['You lose track of time playing. Good distraction.'] },
  },
  'self.laundry': {
    id: 'self.laundry', label: 'Do Laundry', verbs: ['do laundry', 'laundry', 'wash clothes'],
    source: { kind: 'object', objDef: 'washer' },
    group: 'laundry', chipPriority: 30,
    requires: ['hamperNotEmpty', 'waterNotCutoff', 'facilityFunctional:laundry_machines'],
    timeCost: { base: 20 },
    meters: [['laundry', 1], ['devices', 0.5]],
    prepare: prepareLaundry,
    buildEffects: buildLaundryEffects,
    narration: { mode: 'dynamic', build: laundryNarration },
  },
  'self.study': {
    id: 'self.study', label: 'Study', verbs: ['study', 'hit the books'],
    source: { kind: 'room', roomIds: ['study'] },
    group: 'study', chipPriority: 30,
    requires: ['facilityFunctional:study_setup'],
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.studyMoodGain}`,
    ],
    narration: { mode: 'template', templates: ['You settle in at the desk and focus. Quiet and productive.'] },
  },
  // --- BrineOS phone object actions (Phase 2) ---
  // Pickup / set-down / plug-in / unplug. These are the first-ever callers
  // of the long-dormant MOVE_OBJECT effect (effects.js) and run as trusted
  // producers through executeAction (effects applied directly, no LLM
  // validation), so the L3 reach-set wall stays intact: the phone's bucket
  // is legitimately NOT in the room's reach set when dropped from the
  // pocket, and the trusted path doesn't need it to be. `phone.drop` is
  // self-sourced (the phone is carried, not in the room) and gated by the
  // phoneCarried checker. Moving to carry_player auto-unplugs (decision B).
  'phone.pickup': {
    id: 'phone.pickup', label: 'Pick Up Phone', verbs: ['pick up the phone', 'pick up phone', 'grab your phone'],
    source: { kind: 'object', objDef: 'phone' },
    group: 'phone', chipPriority: 60,
    requires: [],
    timeCost: { base: 1 },
    prepare: preparePhone,
    buildEffects: buildPhonePickupEffects,
    narration: { mode: 'dynamic', build: phonePickupNarration },
  },
  'phone.drop': {
    id: 'phone.drop', label: 'Put Down Phone', verbs: ['put down the phone', 'set down the phone', 'put the phone down'],
    source: { kind: 'self' },
    group: 'phone', chipPriority: 60,
    requires: ['phoneCarried'],
    timeCost: { base: 1 },
    prepare: preparePhone,
    buildEffects: buildPhoneDropEffects,
    narration: { mode: 'dynamic', build: phoneDropNarration },
  },
  'phone.plug': {
    id: 'phone.plug', label: 'Plug In Phone', verbs: ['plug in the phone', 'plug the phone in', 'charge the phone'],
    source: { kind: 'object', objDef: 'phone' },
    group: 'phone', chipPriority: 55,
    requires: ['phoneUnplugged', 'powerNotCutoff'],
    timeCost: { base: 1 },
    prepare: preparePhone,
    buildEffects: buildPhonePlugEffects,
    narration: { mode: 'dynamic', build: phonePlugNarration },
  },
  'phone.unplug': {
    id: 'phone.unplug', label: 'Unplug Phone', verbs: ['unplug the phone', 'unplug phone'],
    source: { kind: 'object', objDef: 'phone' },
    group: 'phone', chipPriority: 55,
    requires: ['phonePlugged'],
    timeCost: { base: 1 },
    prepare: preparePhone,
    buildEffects: buildPhoneUnplugEffects,
    narration: { mode: 'dynamic', build: phoneUnplugNarration },
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
  dishesDirty: (ctx) => {
    const sink = findObjectInRoom(ctx, 'sink_kitchen');
    const state = sink?.state?.dishes;
    return (state === 'few' || state === 'many') || 'No dirty dishes to wash.';
  },
  doorUnlocked: (ctx) => {
    const door = findObjectInRoom(ctx, 'bedroom_door') || findObjectInRoom(ctx, 'bathroom_door');
    if (!door) return 'No door to lock here.';
    return (door.state?.lock !== 'locked') || 'The door is already locked.';
  },
  doorLocked: (ctx) => {
    const door = findObjectInRoom(ctx, 'bedroom_door') || findObjectInRoom(ctx, 'bathroom_door');
    if (!door) return 'No door to unlock here.';
    return (door.state?.lock === 'locked') || 'The door is already unlocked.';
  },
  hamperNotEmpty: (ctx) => {
    const hamper = findObjectInRoom(ctx, 'laundry_hamper');
    if (!hamper) return 'No hamper here.';
    const fill = hamper.state?.fill;
    return (fill === 'partial' || fill === 'full') || 'The hamper is empty — nothing to wash.';
  },
  // Phase 3 bill cutoffs: a utility whose bill is unpaid past grace blocks
  // the actions/apps that depend on it. waterBlocks/gasBlocks check the
  // specific utility; powerBlocks/internetBlocks gate computer + gig work.
  // These are wired into ACTION_DEFS entries' `requires` below.
  waterNotCutoff: (ctx) => !isCutoffActive(ctx.gameState, 'water') || 'Water is shut off — the bill is unpaid.',
  gasNotCutoff: (ctx) => !isCutoffActive(ctx.gameState, 'gas') || 'Gas is shut off — the bill is unpaid.',
  powerNotCutoff: (ctx) => !isCutoffActive(ctx.gameState, 'power') || 'Power is shut off — the bill is unpaid.',
  internetNotCutoff: (ctx) => !isCutoffActive(ctx.gameState, 'internet') || 'Internet is down — the bill is unpaid.',
  // BrineOS phone (Phase 2): presence is read from buckets (decision B).
  // phoneCarried gates drop; phoneUnplugged/phonePlugged gate plug/unplug
  // and keep the chips honest (the object's own state, not a guess).
  phoneCarried: (ctx) => {
    const carried = ctx.gameState.objects['carry_player'] || {};
    return Object.values(carried).some(o => o.defId === 'phone') || `You don't have the phone with you.`;
  },
  phoneUnplugged: (ctx) => {
    const p = findObjectInRoom(ctx, 'phone');
    if (!p) return 'The phone is not here.';
    return (p.state.plugged !== 'plugged') || 'The phone is already plugged in.';
  },
  phonePlugged: (ctx) => {
    const p = findObjectInRoom(ctx, 'phone');
    if (!p) return 'The phone is not here.';
    return (p.state.plugged === 'plugged') || 'The phone is not plugged in.';
  },
  // Phase 4: a facility must be at least 'functional' for the actions it
  // gates. 'broken' means the equipment is unusable — the stove doesn't
  // light, the treadmill motor is dead. The player must repair it via the
  // RenoFix app before the action becomes available. Args: facilityId.
  facilityFunctional: (ctx, facilityId) => {
    if (!isFacilityFunctional(ctx.gameState, facilityId)) {
      const def = FACILITY_DEFS[facilityId];
      return `${def?.label || 'That'} is broken — repair it via RenoFix.`;
    }
    return true;
  },
  // Like facilityFunctional, but infers which facility to check from the
  // player's current room — for actions available in multiple rooms that
  // each have their own facility (showers in bathroom_a vs bathroom_b).
  // Looks up ROOM_FACILITIES for the player's room and finds the first
  // facility whose gatesActions includes the calling action.
  facilityFunctionalHere: (ctx, actionId) => {
    const roomId = ctx.gameState.player.location;
    const facilityIds = ROOM_FACILITIES[roomId] || [];
    for (const fid of facilityIds) {
      const def = FACILITY_DEFS[fid];
      if (!def?.gatesActions?.includes(actionId)) continue;
      if (!isFacilityFunctional(ctx.gameState, fid)) {
        return `${def.label} is broken — repair it via RenoFix.`;
      }
    }
    return true;
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

// --- self.dishes' runtime logic ---
// Reads the sink's dishes state ('clean'/'few'/'many') to determine time
// cost (via perDirtyDish in resolveTimeCost) and effects. Cleaning skill
// speeds it up via the cleanEfficiency curve.
function prepareDishes(ctx) {
  const sink = findObjectInRoom(ctx, 'sink_kitchen');
  const dishLevel = sink?.state?.dishes;
  return { sink, dishLevel, dirty: dishLevel === 'many' ? 2 : dishLevel === 'few' ? 1 : 0 };
}

function buildDishesEffects(ctx, prepared) {
  if (!prepared?.sink || prepared.dirty === 0) return [];
  return [
    `SET_OBJECT_STATE ${prepared.sink.id} dishes clean`,
    `ADJUST_NEED player mood +${ACTION_TUNING.dishesMoodGain}`,
  ];
}

function dishesNarration(ctx, prepared) {
  if (!prepared?.sink || prepared.dirty === 0) return 'The dishes are already clean.';
  if (prepared.dirty >= 2) return 'You scrub a mountain of dishes. The sink is spotless now.';
  return 'You wash the few dishes in the sink. Satisfying.';
}

// --- self.lock_door / self.unlock_door runtime logic ---
function prepareDoor(ctx) {
  const door = findObjectInRoom(ctx, 'bedroom_door') || findObjectInRoom(ctx, 'bathroom_door');
  return { door };
}

function buildLockDoorEffects(ctx, prepared) {
  if (!prepared?.door) return [];
  return [`SET_OBJECT_STATE ${prepared.door.id} lock locked`];
}

function buildUnlockDoorEffects(ctx, prepared) {
  if (!prepared?.door) return [];
  return [`SET_OBJECT_STATE ${prepared.door.id} lock unlocked`];
}

function lockDoorNarration(ctx, prepared) {
  if (!prepared?.door) return 'No door here to lock.';
  return 'You lock the door. Click.';
}

function unlockDoorNarration(ctx, prepared) {
  if (!prepared?.door) return 'No door here to unlock.';
  return 'You unlock the door. Click.';
}

// --- self.laundry runtime logic ---
// Moves clothes from hamper → washer, starts the wash cycle. The washer
// becomes 'running', hamper becomes 'empty'. A full cycle is abstracted
// to a single action for simplicity.
function prepareLaundry(ctx) {
  const hamper = findObjectInRoom(ctx, 'laundry_hamper');
  const washer = findObjectInRoom(ctx, 'washer');
  return { hamper, washer };
}

function buildLaundryEffects(ctx, prepared) {
  if (!prepared?.hamper || !prepared?.washer) return [];
  return [
    `SET_OBJECT_STATE ${prepared.hamper.id} fill empty`,
    `SET_OBJECT_STATE ${prepared.washer.id} cycle running`,
    `SET_OBJECT_STATE ${prepared.washer.id} power on`,
    `ADJUST_NEED player mood +${ACTION_TUNING.laundryMoodGain}`,
  ];
}

function laundryNarration(ctx, prepared) {
  if (!prepared?.hamper || !prepared?.washer) return 'No washer or hamper here.';
  return 'You load the washer and start a cycle. The machine hums to life.';
}

// --- BrineOS phone action runtime (Phase 2) ---
// preparePhone resolves the phone from either surface: the current room
// (pickup/plug/unplug) or the player's pocket (drop). buildEffects emit
// MOVE_OBJECT / SET_OBJECT_STATE — applied by executeAction on the trusted
// producer path, so the L3 room-scoped reach-set wall is never widened.
function preparePhone(ctx) {
  const roomPhone = findObjectInRoom(ctx, 'phone');
  const carriedBucket = ctx.gameState.objects['carry_player'] || {};
  const carriedPhone = Object.values(carriedBucket).find(o => o.defId === 'phone') || null;
  return { phone: roomPhone || carriedPhone };
}

function buildPhonePickupEffects(ctx, prepared) {
  const p = prepared?.phone;
  if (!p) return [];
  const lines = [`MOVE_OBJECT ${p.id} carry_player`];
  // Moving to the pocket auto-unplugs (decision B).
  if (p.state.plugged === 'plugged') lines.push(`SET_OBJECT_STATE ${p.id} plugged unplugged`);
  return lines;
}
function buildPhoneDropEffects(ctx, prepared) {
  const p = prepared?.phone;
  if (!p) return [];
  return [`MOVE_OBJECT ${p.id} room_${ctx.gameState.player.location}`];
}
function buildPhonePlugEffects(ctx, prepared) {
  const p = prepared?.phone;
  if (!p) return [];
  return [`SET_OBJECT_STATE ${p.id} plugged plugged`];
}
function buildPhoneUnplugEffects(ctx, prepared) {
  const p = prepared?.phone;
  if (!p) return [];
  return [`SET_OBJECT_STATE ${p.id} plugged unplugged`];
}

function phonePickupNarration(ctx, prepared) {
  const p = prepared?.phone;
  const bat = p && p.flags.battery != null ? Math.round(p.flags.battery) : 100;
  return bat <= 20 ? `You pocket your phone. It is at ${bat}% — getting low.` : 'You pick up your phone and pocket it.';
}
function phoneDropNarration(ctx, prepared) {
  const roomName = ROOMS[ctx.gameState.player.location]?.name || 'this room';
  return `You set your phone down in ${roomName}.`;
}
function phonePlugNarration(ctx, prepared) {
  return 'You plug the phone in to charge.';
}
function phoneUnplugNarration(ctx, prepared) {
  return 'You unplug the phone.';
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
