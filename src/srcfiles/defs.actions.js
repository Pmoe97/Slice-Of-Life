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
// stove) and recipe-driven (ITEMS' RECIPES/availableRecipes) — the first
// action to actually use the object model beyond room-gating; see
// prepareCook/buildCookEffects/cookNarration below. Since Phase 2 the
// player CHOOSES among every satisfiable recipe (the kitchen is never a
// slot machine where the first match silently wins): prepareCook lists
// availableRecipes and, when more than one is on hand, presents a picker
// (RENDER's openRecipePicker) and awaits the choice. Since Phase 3
// self.eat is item-driven (INVENTORY's edibleStacks + EAT_ITEM serving
// math) — see prepareEat/buildEatEffects/eatNarration below.

const ACTION_DEFS = {
  'self.eat': {
    // Inventory overhaul Phase 3: item-driven eating. The old flat
    // ADJUST_NEED refill is retired — eating now picks one edible item
    // (bag + fridge/pantry in the kitchen, or the kitchen's when dining)
    // and consumes ONE SERVING of it via EAT_ITEM: a multi-serving dish
    // leaves a partial stack behind (meta.servingsLeft), so leftovers are
    // a real recurring resource. Time is the eaten item's category
    // (drink 5 / snack 10 / food 10 / full meal 25) via
    // INVENTORY_TUNING.useTimeMinutes — same table the inventory panel's
    // Use verb reads, so the chip and the panel can never disagree.
    id: 'self.eat', label: 'Eat', verbs: ['eat', 'snack', 'grab a bite'],
    source: { kind: 'room', roomIds: ['kitchen', 'dining'] },
    group: 'kitchen', chipPriority: 30,
    requires: ['hasEdibleFood'],
    timeCost: { byItemCategory: true },
    prepare: prepareEat,
    buildEffects: buildEatEffects,
    narration: { mode: 'dynamic', build: eatNarration },
  },
  // Inventory overhaul Phase 7 (D7): Set Meal — the dining table becomes
  // the place the household gathers, on purpose. Invitations (IM or in
  // person) create world.commitments that relocate accepted residents to
  // the dining room for their window (COMMITMENTS + SIM); this action is
  // the meal itself: pick one dish, and every resident present at the
  // table eats a real serving of it (EAT_ITEM's Phase 7 `who`), with the
  // "proper setting" mood bonus, NPC comfort/mood, and per-attendee
  // relationship deltas. If nobody committed, it's still a proper meal at
  // a set table. The table is left dirty — a shared dinner costs a chore.
  'set_meal': {
    id: 'set_meal', label: 'Set the Table & Eat', verbs: ['set the table', 'share a meal', 'sit down to dinner', 'eat together', 'have dinner'],
    source: { kind: 'room', roomIds: ['dining', 'kitchen'] },
    group: 'kitchen', chipPriority: 35,
    requires: ['hasEdibleFood'],
    // Phase 7 (D7): laying out and eating a proper shared meal takes a real
    // stretch of clock (ACTION_TUNING.setMealMinutes) — longer than a solo
    // bite, shorter than cooking.
    timeCost: { base: ACTION_TUNING.setMealMinutes },
    prepare: prepareSetMeal,
    buildEffects: buildSetMealEffects,
    narration: { mode: 'dynamic', build: setMealNarration },
  },
  'self.cook': {
    id: 'self.cook', label: 'Cook', verbs: ['cook', 'make food', 'prepare a meal'],
    source: { kind: 'object', objDef: 'stove' },
    group: 'kitchen', chipPriority: 40,
    requires: ['hasRecipeIngredients', 'gasNotCutoff', 'facilityFunctional:kitchen_stove'],
    timeCost: { base: 30, perIngredient: 3, max: 50, skill: 'cooking', curve: 'timeReduction', min: 15 },
    skill: { id: 'cooking', xp: 12 },
    meters: [['cooking', 1], ['devices', 0.5]],
    emitsSignal: { signal: 'cooking', intensity: SIGNALS_EMIT.cookingAction },
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
    emitsSignal: { signal: 'running_water', intensity: SIGNALS_EMIT.shower },
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
    // Phase 6 (D13): TV is a real leisure action — it takes time and pays
    // mood. The mood gain scales with present-resident affection, so
    // watching with someone who likes you beats watching alone (social
    // time pays; see prepareSocialAction/buildWatchTvEffects).
    timeCost: { base: ACTION_TUNING.tvMinutes },
    prepare: prepareSocialAction,
    buildEffects: buildWatchTvEffects,
    narration: { mode: 'dynamic', build: watchTvNarration },
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
    emitsSignal: { signal: 'door_close', intensity: SIGNALS_EMIT.doorClose },
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
  // --- Notes (perception plan Phase 4) ---
  // Reading is the mechanism, not a formality: flipping `read` to 'read'
  // collapses the note's emitted signal intensity from 0.9 to 0.2, so it
  // stops competing for attention the moment you have taken it in. That
  // behaviour lives entirely in the object def's emits table.
  'self.read_note': {
    id: 'self.read_note', label: 'Read Note', verbs: ['read the note', 'read note'],
    source: { kind: 'object', objDef: 'note' },
    group: 'here', chipPriority: 60,
    requires: ['unreadNoteHere'],
    timeCost: { base: 1 },
    prepare: prepareNote,
    buildEffects: buildReadNoteEffects,
    narration: { mode: 'dynamic', build: readNoteNarration },
  },
  'self.bin_note': {
    id: 'self.bin_note', label: 'Bin the Note', verbs: ['bin the note', 'throw away the note', 'take down the note'],
    source: { kind: 'object', objDef: 'note' },
    group: 'here', chipPriority: 20,
    requires: ['readNoteHere'],
    timeCost: { base: 1 },
    prepare: prepareNote,
    buildEffects: buildBinNoteEffects,
    narration: { mode: 'dynamic', build: binNoteNarration },
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
    emitsSignal: { signal: 'machine_running', intensity: SIGNALS_EMIT.laundry },
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
  // --- Free ambient actions (inventory overhaul Phase 6, D13) ---
  // The ungated safety net: small mood, zero money/items/facilities, and
  // available from day one. Each still advances the clock like any action,
  // so the "safety net" never becomes a free-turn machine. `group: 'chill'`
  // is flavour only — all chips render into the Here column.
  'self.nap': {
    id: 'self.nap', label: 'Nap', verbs: ['nap', 'take a nap', 'lie down for a bit'],
    source: { kind: 'object', objDefs: ['bed', 'sofa'] },
    group: 'chill', chipPriority: 15,
    requires: [],
    timeCost: { base: ACTION_TUNING.napMinutes },
    effects: [
      `ADJUST_NEED player energy +${ACTION_TUNING.napEnergyGain}`,
      `ADJUST_NEED player mood +${ACTION_TUNING.napMoodGain}`,
    ],
    narration: { mode: 'template', templates: ['You lie down and nap. Twenty minutes later you surface, groggy but steadier.'] },
  },
  'self.balcony_sit': {
    id: 'self.balcony_sit', label: 'Sit on the Balcony', verbs: ['sit on the balcony', 'sit outside', 'enjoy the balcony'],
    source: { kind: 'room', roomIds: ['balcony'] },
    group: 'chill', chipPriority: 15,
    requires: [],
    timeCost: { base: ACTION_TUNING.balconyMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.balconyMoodGain}`,
    ],
    narration: { mode: 'template', templates: ['You sit on the balcony and watch the street below. The city hums on without you.'] },
  },
  'self.take_walk': {
    id: 'self.take_walk', label: 'Take a Walk', verbs: ['take a walk', 'go for a walk', 'stretch your legs'],
    source: { kind: 'room', roomIds: ['entry'] },
    group: 'chill', chipPriority: 15,
    requires: [],
    timeCost: { base: ACTION_TUNING.walkMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.walkMoodGain}`,
    ],
    narration: { mode: 'template', templates: ['You step out and walk around the block. Fresh air, sore legs, clearer head.'] },
  },
  'self.listen_music': {
    id: 'self.listen_music', label: 'Listen to Music', verbs: ['listen to music', 'put on headphones', 'zone out to music'],
    source: { kind: 'room', roomIds: ['living_room', 'balcony'] },
    group: 'chill', chipPriority: 15,
    requires: [],
    timeCost: { base: ACTION_TUNING.listenMusicMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.listenMusicMoodGain}`,
    ],
    narration: { mode: 'template', templates: ['You put on music and let it carry you for a while.'] },
  },
  'self.long_shower': {
    id: 'self.long_shower', label: 'Long Shower', verbs: ['take a long shower', 'luxuriate in the shower', 'long shower'],
    source: { kind: 'room', roomIds: ['bathroom_a', 'bathroom_b'] },
    group: 'bathroom', chipPriority: 20,
    requires: ['waterNotCutoff', 'facilityFunctionalHere:self.shower'],
    vulnerableState: 'showering',
    emitsSignal: { signal: 'running_water', intensity: SIGNALS_EMIT.shower },
    timeCost: { base: ACTION_TUNING.longShowerMinutes },
    effects: [
      `ADJUST_NEED player hygiene +${ACTION_TUNING.longShowerHygieneGain}`,
      `ADJUST_NEED player mood +${ACTION_TUNING.longShowerMoodGain}`,
    ],
    meters: [['water', 2], ['waterHeating', 1.5]],
    narration: { mode: 'template', templates: ['You take your time under the hot water. Steam, quiet, no rush.'] },
  },
  // --- Buyable hobby actions (inventory overhaul Phase 6, D13) ---
  // One per hobby OBJECT_DEFS entry, generated by createHobbyAction (below)
  // so the six are guaranteed to share one shape. Sourced from the OBJECT,
  // which is what makes a hobby usable only in the room that contains it.
  ...createHobbyAction('hobby_guitar', 'Play Guitar', ['play guitar', 'strum the guitar', 'practice guitar']),
  ...createHobbyAction('hobby_bookshelf', 'Read', ['read', 'curl up with a book', 'read a book']),
  ...createHobbyAction('hobby_record_player', 'Listen to Records', ['listen to records', 'put on a record', 'spin some vinyl']),
  ...createHobbyAction('hobby_console', 'Play Console', ['play the console', 'play video games', 'game']),
  ...createHobbyAction('hobby_sketchpad', 'Sketch', ['sketch', 'draw', 'doodle']),
  ...createHobbyAction('hobby_houseplant', 'Tend Plant', ['tend the plant', 'water the plant', 'care for the plant']),
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
    const pool = [...(fridge?.contents || []), ...(pantry?.contents || [])];
    return availableRecipes(pool).length > 0 || 'Nothing to cook — the kitchen is out of ingredients.';
  },
  // Inventory overhaul Phase 3: the Eat chip only lights up when there's
  // actually something edible to eat — bag, or the fridge/pantry (in the
  // kitchen, or the kitchen's when dining) — so the retired free refill
  // can't be replaced by a hunger-from-nothing shortcut of a different
  // name. Reads INVENTORY's edibleStacks, the same list the action itself
  // picks from.
  hasEdibleFood: (ctx) => {
    return edibleStacks(ctx.gameState, ctx).length > 0 || 'Nothing to eat around here — check your bag, the fridge, or the pantry.';
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
  // A note the player hasn't taken in yet — the whole point of the Read chip.
  unreadNoteHere: (ctx) => {
    const note = firstNoteInRoom(ctx, 'unread');
    return !!note || 'Nothing here to read.';
  },
  // Binning is offered only once it has been read, so a note can never be
  // thrown away unseen.
  readNoteHere: (ctx) => {
    const note = firstNoteInRoom(ctx, 'read');
    return !!note || 'Read it first.';
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
      // Renovation overhaul: a mid-job facility reads as unavailable too,
      // but it deserves its own message — it's coming back, not waiting
      // to be booked. (An active job only ever runs on a functional+
      // facility, so the 'broken' line still covers every genuinely
      // broken case.)
      const upgrade = ctx.gameState.world.upgrades?.[facilityId];
      if (upgrade?.activeJobId) {
        const job = (ctx.gameState.world.renovationJobs || []).find(j => j.id === upgrade.activeJobId && j.status === 'active');
        if (job) return `${def?.label || 'That'} is under construction — the crew wraps up by day ${job.etaDay}.`;
      }
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
        // Same construction-aware variant as facilityFunctional — a room
        // mid-job is coming back, not broken.
        const upgrade = ctx.gameState.world.upgrades?.[fid];
        if (upgrade?.activeJobId) {
          const job = (ctx.gameState.world.renovationJobs || []).find(j => j.id === upgrade.activeJobId && j.status === 'active');
          if (job) return `${def.label} is under construction — the crew wraps up by day ${job.etaDay}.`;
        }
        return `${def.label} is broken — repair it via RenoFix.`;
      }
    }
    return true;
  },
  // Escorts (external-world plan Phase 7): the mechanical half of the
  // dual-enforced booking limits. escortVisitActive requires a live
  // purpose:'escort' visit whose booking is active for that NPC;
  // escortServiceBooked narrows further to EXACTLY the purchased set.
  // Consumed by the escort.request-service chip handler (UI) — the prompt
  // boundary (PROMPT's buildEscortBoundaryText) is the in-character half,
  // and the chips themselves only render from the booking, so everything
  // outside the set is both refused and unreachable.
  escortVisitActive: (ctx, npcId) => {
    const booking = getActiveEscortVisit(ctx.gameState, npcId);
    return booking ? true : `${ctx.gameState.npcs?.[npcId]?.bible?.name || 'They'} isn't booked with you right now.`;
  },
  escortServiceBooked: (ctx, npcId, serviceId) => {
    const booking = getActiveEscortVisit(ctx.gameState, npcId);
    return isEscortServiceBooked(booking, serviceId) || `That wasn't part of what you booked.`;
  },
};

// --- self.cook's runtime logic (ITEMS-backed: ITEM_DEFS/RECIPES) ---
// prepare() picks the recipe once; buildEffects/cookNarration both read
// that same pick, so what happened and what got said about it can't
// disagree (see ACTIONS' executeAction for why this two-step exists).
// Since Phase 2 prepare is async: with one satisfiable recipe it cooks
// straight through; with several it asks the player which to make via
// RENDER's openRecipePicker (a modal, resolved by clicking a row). A
// cancel resolves null and marks the action cancelled so executeAction
// bails before spending time or eating ingredients.
async function prepareCook(ctx) {
  const fridge = findObjectInRoom(ctx, 'fridge');
  const pantry = findObjectInRoom(ctx, 'pantry');
  const pool = [...(fridge?.contents || []), ...(pantry?.contents || [])];
  const recipes = availableRecipes(pool);
  if (recipes.length === 0) return { recipes, fridge, pantry, recipe: null };
  if (recipes.length === 1) return { recipes, fridge, pantry, recipe: recipes[0] };
  const choiceId = await openRecipePicker(recipes);
  if (!choiceId) return { recipes, fridge, pantry, recipe: null, cancelled: true };
  return { recipes, fridge, pantry, recipe: recipes.find(r => r.id === choiceId) || null };
}

// Ingredients may be split across fridge and pantry (an omelette's eggs
// come from the fridge, a sandwich's bread from the pantry and cheese
// from the fridge) — checks fridge stock first, pantry for the remainder,
// matching pickAvailableRecipe's combined-pool availability check.
// Phase 3 decision (resolves the cooking double-count): ingredients are
// DESTROYED without restoring hunger — they're transformed into the meal,
// not eaten raw, so a cooked dish restores exactly the meal's own
// consumable values and nothing is granted from nothing. (The maid's
// performMaidVisit never went through buildCookEffects, so this change
// does not touch it.)
function ingredientDestroyLines(ing, fridge, pantry) {
  const fridgeQty = stackQty(fridge?.contents, ing.defId);
  const fromFridge = Math.min(ing.qty, fridgeQty);
  const fromPantry = ing.qty - fromFridge;
  const lines = [];
  if (fromFridge > 0 && fridge) lines.push(`DESTROY_ITEM ${ing.defId} ${fromFridge} ${fridge.id}`);
  if (fromPantry > 0 && pantry) lines.push(`DESTROY_ITEM ${ing.defId} ${fromPantry} ${pantry.id}`);
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
  const lines = recipe.ingredients.flatMap(ing => ingredientDestroyLines(ing, fridge, pantry));
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

// --- Social time (inventory overhaul Phase 6, D13) ---
// The game's thesis made mechanical: being with people who like you pays.
// presentResidentAffection is the shared read (average affection of
// residents physically in the player's room, hostile/absent = 0) used by
// watch_tv, eating together, and the hobby actions. The persistent
// baseline side lives in SIM's resolveMoodTarget (MOOD_TARGET.social.
// presencePerPerson); these are the per-action impulse sides.
function presentResidentAffection(ctx) {
  const ids = ctx?.presentNpcIds || [];
  let sum = 0, n = 0;
  for (const id of ids) {
    const npc = ctx.gameState?.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident') continue;
    sum += npc.relPlayer?.affection ?? 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function prepareSocialAction(ctx) {
  return { affection: presentResidentAffection(ctx) };
}

function buildWatchTvEffects(ctx, prepared) {
  const base = ACTION_TUNING.tvMoodGain;
  const affection = prepared?.affection ?? 0;
  const bonus = affection > 0 ? Math.round(affection * MOOD_TARGET.social.activityScale * 100) / 100 : 0;
  return [`ADJUST_NEED player mood +${Math.round((base + bonus) * 100) / 100}`];
}

function watchTvNarration(ctx, prepared) {
  const affection = prepared?.affection ?? 0;
  if (affection > 0) return 'You watch TV with someone who actually likes you. Best show on right now.';
  return 'You watch some TV. Mindless, relaxing.';
}

// --- Buyable hobbies (inventory overhaul Phase 6, D13) ---
// createHobbyAction generates one ACTION_DEFS entry per hobby OBJECT_DEFS
// id (HOBBY_TUNING holds the numbers). The action id is 'hobby.' + the
// object id suffix; sourcing from the object is what scopes the hobby to
// the room it was placed in. The social layer rides along: a liked
// resident watching you play makes it better.
function createHobbyAction(objDef, label, verbs) {
  const id = `hobby.${objDef.slice('hobby_'.length)}`;
  // The closure captures objDef so buildEffects/narration know which hobby
  // this is — executeAction only hands prepare/buildEffects the ctx and the
  // prepared result, not the def (see ACTIONS' two-step contract).
  const prepare = (ctx) => ({ key: objDef, affection: presentResidentAffection(ctx) });
  return {
    [id]: {
      id, label, verbs,
      source: { kind: 'object', objDef },
      group: 'hobby', chipPriority: 25,
      requires: [],
      timeCost: { base: HOBBY_TUNING.useMinutes[objDef] ?? 20 },
      prepare,
      buildEffects: buildHobbyEffects,
      narration: { mode: 'dynamic', build: hobbyNarration },
    },
  };
}

function buildHobbyEffects(ctx, prepared) {
  const key = prepared?.key;
  const mood = HOBBY_TUNING.moodGain[key];
  const energy = HOBBY_TUNING.energyCost[key] || 0;
  if (mood == null) return [];
  const lines = [`ADJUST_NEED player mood +${mood}`];
  if (energy > 0) lines.push(`ADJUST_NEED player energy -${energy}`);
  const affection = prepared?.affection ?? 0;
  if (affection > 0) {
    const bonus = Math.round(affection * MOOD_TARGET.social.activityScale * 100) / 100;
    if (bonus > 0) lines.push(`ADJUST_NEED player mood +${bonus}`);
  }
  return lines;
}

const HOBBY_NARRATION = {
  hobby_guitar: "You pick at the strings until a tune starts to come together. The apartment is the only audience, and it doesn't care how you play.",
  hobby_bookshelf: 'You lose an hour in a chapter. The rest of the day can wait.',
  hobby_record_player: 'The needle drops and the room fills. You close your eyes and just listen.',
  hobby_console: 'You game until your thumbs ache. Pointless, unproductive, excellent.',
  hobby_sketchpad: 'You sketch until the page stops being wrong. Half of it is terrible — the other half is you, getting better.',
  hobby_houseplant: "You water it, turn it toward the light, talk to it a little. It looks greener already, or maybe that's you.",
};

function hobbyNarration(ctx, prepared) {
  const key = prepared?.key;
  const line = HOBBY_NARRATION[key];
  if (line) return line;
  return 'You lose yourself in the hobby for a while. Good for the head.';
}

// --- self.eat's runtime logic (inventory overhaul Phase 3) ---
// prepare() picks the food once; buildEffects/eatNarration both read that
// same pick (the ACTIONS two-step contract, same as self.cook). Options
// come from INVENTORY's edibleStacks (bag + nearby fridge/pantry); with
// one option the action eats straight through, with several it asks via
// RENDER's openEatPicker and awaits the choice — a cancel marks the
// action cancelled so executeAction bails before time or hunger effects.
// The eaten quantity is always ONE SERVING; multi-serving dishes are
// eaten over several visits (leftovers persist via meta.servingsLeft).
async function prepareEat(ctx) {
  const affection = presentResidentAffection(ctx);
  const options = edibleStacks(ctx.gameState, ctx);
  if (options.length === 0) return { options, option: null, cancelled: true, affection };
  if (options.length === 1) return { options, option: options[0], affection };
  const choice = await openEatPicker(options);
  if (!choice) return { options, option: null, cancelled: true, affection };
  return { options, option: options.find(o => o.from === choice.from && o.stack.defId === choice.defId) || null, affection };
}

function buildEatEffects(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return [];
  // EAT_ITEM consumes in place (fridge leftovers stay in the fridge — a
  // bag would spoil them 4× faster) and restores the def's consumable
  // scaled to one serving.
  const lines = [`EAT_ITEM ${option.stack.defId} 1 ${option.from}`];
  // Phase 6 (D13): eating together pays — a liked resident at the table
  // adds a small affection-scaled mood impulse on top of the food's own
  // values. Hostile or alone contributes 0.
  const affection = prepared?.affection ?? 0;
  if (affection > 0) {
    const bonus = Math.round(affection * MOOD_TARGET.social.activityScale * 100) / 100;
    if (bonus > 0) lines.push(`ADJUST_NEED player mood +${bonus}`);
  }
  return lines;
}

function eatNarration(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return 'You rummage through your food but come up empty.';
  const def = option.def;
  const label = def.label || 'something';
  // Phase 4: surface the eaten item's freshness — the picker shows the
  // same freshness tags, and the Rotten/Spoiling lines match the restore
  // penalties applyEatItem applies.
  const fresh = freshnessOf(option.stack, option.containerDef ?? null, ctx?.gameState?.meta?.clock?.day);
  if (fresh?.key === 'rotten') return `You force down some ${label.toLowerCase()} despite the smell. You regret it immediately.`;
  if (fresh?.key === 'spoiling') return `You eat some ${label.toLowerCase()}. It tastes... off.`;
  // Phase 6: eating with a liked resident is its own line — the social
  // bonus buildEatEffects added deserves narration.
  if ((prepared?.affection ?? 0) > 0) return `You share a meal with someone who actually likes you. The ${label.toLowerCase()} never tasted better.`;
  if (def.category === 'drink') return `You drink some ${label.toLowerCase()}.`;
  const amount = itemServings(def) > 1 ? 'some of the' : 'a';
  return `You eat ${amount} ${label.toLowerCase()}.`;
}

// --- set_meal's runtime logic (inventory overhaul Phase 7, D7) ---
// prepare() picks the food once and snapshots the table (attendees,
// commitment state, dining-table instance, who gets fed); buildEffects and
// the narration both read that SAME snapshot so what happened and what got
// said about it can't disagree (the ACTIONS two-step contract).
//
// The meal feeds the player plus every resident present at the table, one
// serving each in presence order, until the dish runs out — multi-serving
// dishes are exactly what a shared dinner is for (a 4-serving pizza with
// three people at the table leaves one serving of leftovers). The picker
// is the same one self.eat uses (it shows the serving count and per-serving
// restore); the action's time cost is the flat set_meal stretch, not the
// item category, since the point is the gathering, not the bite.
async function prepareSetMeal(ctx) {
  const affection = presentResidentAffection(ctx);
  const options = edibleStacks(ctx.gameState, ctx);
  if (options.length === 0) return { options, option: null, cancelled: true, affection };
  let option;
  if (options.length === 1) {
    option = options[0];
  } else {
    const choice = await openEatPicker(options);
    if (!choice) return { options, option: null, cancelled: true, affection };
    option = options.find(o => o.from === choice.from && o.stack.defId === choice.defId) || null;
  }
  if (!option) return { options, option: null, cancelled: true, affection };
  const attendees = mealAttendees(ctx.gameState, ctx.roomId);
  const hasCommitment = activeMealCommitmentsInRoom(ctx.gameState, ctx.roomId).length > 0;
  // The dining table is the household's table even when the player cooks in
  // the kitchen — but the mess only lands on it if the meal actually
  // happened there (the player.location === 'dining' guard in buildEffects).
  const diningTable = Object.values(ctx.gameState.objects?.['room_dining'] || {})
    .find(o => o.defId === 'dining_table') || null;
  // Who actually gets fed: the player's own serving first, then present
  // NPCs in presence order, one serving each, until the dish runs out.
  const remaining = Math.max(0, stackServingsLeft(option.stack) - 1);
  const fedNpcIds = [];
  for (const a of attendees) {
    if (fedNpcIds.length >= remaining) break;
    fedNpcIds.push(a.npcId);
  }
  return { options, option, affection, attendees, hasCommitment, diningTable, fedNpcIds };
}

// How good a meal this dish is, 0..1 — hunger is the bulk, mood and energy
// sweeten it. Scales the relationship delta (a four-cheese pizza bonds
// people more than a dry sandwich).
function foodQuality(def) {
  const c = def.consumable || {};
  const raw = (c.hunger || 0) + (c.mood || 0) * 40 + (c.energy || 0) * 0.4;
  return clamp(raw / 60, 0, 1);
}

// Per-attendee relationship delta for a shared meal, scaled by food
// quality, whether they actually ate ("attendance"), and the existing
// relationship (someone who already likes you warms faster). All numbers
// from COMMITMENT_TUNING.
function mealRelDelta(def, npc, fed) {
  const q = foodQuality(def);
  const existing = Math.max(0, npc?.relPlayer?.affection || 0);
  const raw = (COMMITMENT_TUNING.relationshipBase + q * COMMITMENT_TUNING.relationshipQualityWeight)
    * (fed ? COMMITMENT_TUNING.attendanceMultFed : COMMITMENT_TUNING.attendanceMultPresent)
    * (1 + existing * COMMITMENT_TUNING.relationshipExistingWeight);
  return Math.round(Math.min(COMMITMENT_TUNING.relationshipCap, raw) * 1000) / 1000;
}

function buildSetMealEffects(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return [];
  const { stack, def, from } = option;
  const attendees = prepared?.attendees || [];
  const fedNpcIds = prepared?.fedNpcIds || [];
  const lines = [];

  // The player's own serving — real consumption, per-serving restore,
  // freshness-aware (EAT_ITEM).
  lines.push(`EAT_ITEM ${stack.defId} 1 ${from} player`);
  // Every fed attendee's serving comes out of the same real dish
  // (EAT_ITEM's Phase 7 `who` routes the restore to their needs — an NPC
  // who eats genuinely eats; nothing is restored from nowhere).
  for (const npcId of fedNpcIds) {
    lines.push(`EAT_ITEM ${stack.defId} 1 ${from} ${npcId}`);
  }

  const per = perServingConsumable(def);
  const foodMood = per.mood || 0;
  for (const a of attendees) {
    const isFed = fedNpcIds.includes(a.npcId);
    const moodBoost = COMMITMENT_TUNING.attendeeMoodBonus + (isFed ? (foodMood || 0) : 0);
    if (moodBoost > 0) lines.push(`MOOD_DELTA ${a.npcId} +${Math.round(moodBoost * 100) / 100}`);
    // A properly set meal restores comfort for everyone who sat down.
    lines.push(`ADJUST_NEED ${a.npcId} comfort +${COMMITMENT_TUNING.attendeeComfortRestore}`);
    // Relationship: scaled by food quality, attendance, existing rel.
    const delta = mealRelDelta(def, a.npc, isFed);
    if (delta > 0) lines.push(`REL_DELTA ${a.npcId} affection +${delta}`);
    if (isFed && COMMITMENT_TUNING.relationshipTensionRelief > 0) {
      lines.push(`REL_DELTA ${a.npcId} tension -${COMMITMENT_TUNING.relationshipTensionRelief}`);
    }
  }

  // The player side: the "proper setting" bonus when a commitment was
  // scheduled here (D7 — even if nobody else showed), plus the Phase 6
  // shared-meal social bonus scaled by present-resident affection.
  const commitmentBonus = prepared?.hasCommitment ? COMMITMENT_TUNING.settingBonusMood : 0;
  const affection = prepared?.affection ?? 0;
  const socialBonus = affection > 0 ? Math.round(affection * MOOD_TARGET.social.activityScale * 100) / 100 : 0;
  const playerBonus = Math.round((commitmentBonus + socialBonus) * 100) / 100;
  if (playerBonus > 0) lines.push(`ADJUST_NEED player mood +${playerBonus}`);

  // The table is left with plates and crumbs — meals at the table leave a
  // mess, feeding the EXISTING cleanliness machinery (dining_table's
  // dirtyWhen clutter), which the maid's cleanRoomObjects clears.
  if (prepared?.diningTable && ctx.gameState.player.location === 'dining') {
    lines.push(`SET_OBJECT_STATE ${prepared.diningTable.id} clutter cluttered`);
  }
  return lines;
}

function setMealNarration(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return 'You sit down to eat, but there is nothing to put on the table.';
  const def = option.def;
  const label = def.label.toLowerCase();
  const attendees = prepared?.attendees || [];
  const fedNpcIds = prepared?.fedNpcIds || [];
  const names = attendees.map(a => ctx.gameState.npcs[a.npcId]?.bible?.name || 'a roommate');
  const fedCount = fedNpcIds.length;
  const fresh = freshnessOf(option.stack, option.containerDef ?? null, ctx.gameState.meta.clock.day);
  if (fresh?.key === 'rotten') {
    return `You set the table and serve some ${label} that has clearly turned. ${names.length ? `${names.join(' and ')} ${names.length > 1 ? 'make' : 'makes'} a face but eats anyway.` : 'You grimace and eat it anyway.'}`;
  }
  const sv = itemServings(def);
  const leftoverServings = Math.max(0, sv - 1 - fedCount);
  const leftover = leftoverServings > 0 ? ' — there are leftovers for later' : '';
  const setting = prepared?.hasCommitment ? ' The table is properly set.' : '';
  if (names.length > 0) {
    const eaters = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `You set the table and share dinner with ${eaters}.${setting} The ${label} tastes better for the company${leftover}.`;
  }
  if (prepared?.hasCommitment) {
    return `You set the table properly and eat alone. Nobody showed${leftover}.`;
  }
  return `You set the table and eat some ${label}${leftover}.`;
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

// --- Notes runtime logic (perception plan Phase 4) ---
// Rooms can hold several notes, unlike every other object def, so these can't
// use findObjectInRoom's "first instance of this def" shortcut — they pick by
// read-state. Oldest-first so a stack of notes is worked through in the order
// they were left, which is the order they make sense in.
function firstNoteInRoom(ctx, readState) {
  return Object.values(ctx.roomObjects)
    .filter(o => o.defId === 'note' && (o.state?.read || 'unread') === readState)
    .sort((a, b) => (a.meta?.day || 0) - (b.meta?.day || 0))[0] || null;
}

function prepareNote(ctx) {
  return { note: firstNoteInRoom(ctx, 'unread') || firstNoteInRoom(ctx, 'read') };
}

function buildReadNoteEffects(ctx, prepared) {
  if (!prepared?.note) return [];
  return [`SET_OBJECT_STATE ${prepared.note.id} read read`];
}

function buildBinNoteEffects(ctx, prepared) {
  if (!prepared?.note) return [];
  return [`DESTROY_OBJECT ${prepared.note.id}`];
}

// The note's actual words are the narration — there is no separate reading
// UI, because a note is three lines and a modal for it would be ceremony.
function readNoteNarration(ctx, prepared) {
  const note = prepared?.note;
  if (!note) return 'There is nothing here to read.';
  const authorId = note.meta?.authorId;
  const name = authorId === 'player' ? null : ctx.gameState.npcs?.[authorId]?.bible?.name;
  // Three real cases, each written out rather than composed from a fragment:
  // "A note, in Hana:" is what a `${name}` slot produces, and it is wrong.
  const attribution = authorId === 'player'
    ? 'in your own handwriting'
    : (name ? `in ${name}'s handwriting` : "in handwriting you don't recognise");
  return `A note, ${attribution}:\n\n    "${note.meta?.text || ''}"`;
}

function binNoteNarration(ctx, prepared) {
  return prepared?.note ? 'You take the note down and bin it.' : 'There is no note to take down.';
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
