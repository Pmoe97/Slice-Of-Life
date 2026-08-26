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
    // Action outcome window Phase 1 (D3/D5): the INSTANCE half of the image
    // split. What you ate is the whole point of an eating frame — a plate of
    // pasta and a cold slice out of the fridge are not the same picture — so
    // the frame is composed per occurrence off prepare()'s pick
    // (composeActionInstanceKey, image.js). Both fields are builders because
    // both read that pick; see eatWindowSubject/eatWindowPhrase below.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: {
        kind: 'instance',
        subject: eatWindowSubject,
        phrase: eatWindowPhrase,
      },
    },
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
  // action-outcome-window-plan Phase 3 (D10): set_meal LAYS THE TABLE and
  // stops there. It used to lay out AND resolve the whole meal — round-robin
  // servings, attendee deltas, dishes — in one silent call; `sit` owns all of
  // that now and is the sole trigger for the real meal event. The split is
  // what makes an open invitation possible: there is a stretch of time when
  // the food is on the table and nobody has sat down yet, which is exactly
  // the window someone can walk into.
  'set_meal': {
    id: 'set_meal', label: 'Set the Table', verbs: ['set the table', 'lay the table', 'lay out dinner', 'put dinner out'],
    source: { kind: 'room', roomIds: ['dining', 'kitchen'] },
    group: 'kitchen', chipPriority: 35,
    requires: ['hasEdibleFood'],
    // Laying out is a fraction of what the whole meal used to cost — the
    // stretch of clock the meal itself takes moved to `sit` (SIT_TUNING).
    timeCost: { base: ACTION_TUNING.setTableMinutes },
    // Laying food out is a smell in the room, and that smell is what gives a
    // roommate two rooms away any way of knowing dinner is happening (D12's
    // signal substrate). Reuses the existing 'cooking' signal rather than
    // adding one: its phrases are already about food smelling good, and the
    // plan says read signals.js, don't extend it.
    emitsSignal: { signal: 'cooking', intensity: SIGNALS_EMIT.cookingDrive },
    prepare: prepareSetMeal,
    buildEffects: buildSetMealEffects,
    narration: { mode: 'dynamic', build: setMealNarration },
    // D10: a plain Tier B confirmation of what got laid out. Nothing to
    // picture beyond the strip — the table with people at it is `sit`'s image.
    outcomeWindow: {
      tier: 'B', trigger: 'player', dismissal: 'tap',
      heading: 'The table is set',
    },
  },
  // action-outcome-window-plan Phase 3 (D10/D12/D13). The real meal event.
  // Gated by two questions resolved the INSTANT the player sits, in closed
  // form — are there confirmed guests, and does anyone uninvited join.
  'sit': {
    id: 'sit', label: 'Sit Down to Eat', verbs: ['sit down', 'sit down to eat', 'eat at the table', 'have dinner', 'share a meal'],
    source: { kind: 'room', roomIds: ['dining', 'kitchen'] },
    group: 'kitchen', chipPriority: 36,
    requires: ['tableIsLaid'],
    timeCost: { base: SIT_TUNING.windowMinutes },
    prepare: prepareSit,
    buildEffects: buildSitEffects,
    narration: { mode: 'dynamic', build: sitNarration },
    // Tier is decided by the OUTCOME, not the verb (Design invariant 2 in the
    // same shape D6 uses for dismissal): company makes this the shared-meal
    // scene, an empty table makes it the quick solo beat.
    outcomeWindow: {
      tier: (view) => ((view.prepared && view.prepared.guests || []).length > 0 ? 'D' : 'C'),
      trigger: 'player',
      dismissal: 'tap',
      heading: (view) => ((view.prepared && view.prepared.guests || []).length > 0
        ? 'Dinner together' : 'Dinner'),
      // D10's "freeform conversation via the D6 handoff", and it is
      // OUTCOME-conditional in the way Design invariant 2 requires: the
      // choices exist because people are at the table, not because the verb
      // is `sit`. Eating alone resolves with a plain Continue.
      choices: sitWindowChoices,
      dismissal: 'tap',
      onDismiss: sitWindowDismiss,
      image: {
        kind: 'instance',
        phrase: sitWindowPhrase,
        subject: sitWindowSubject,
      },
    },
  },
  'self.cook': {
    id: 'self.cook', label: 'Cook', verbs: ['cook', 'make food', 'prepare a meal'],
    source: { kind: 'object', objDef: 'stove' },
    group: 'kitchen', chipPriority: 40,
    requires: ['hasRecipeIngredients', 'gasNotCutoff', 'facilityFunctional:kitchen_stove'],
    // Food-overhaul Phase 5 (D16): the interactive loop's minutes are the
    // ENGINE's step plan total (prep + mixing + method + rescues) —
    // fromPrepared makes that the base; the static values are the fallback
    // for callers with no plan. The cooking skill still shrinks the total.
    timeCost: { fromPrepared: true, base: 30, perIngredient: 3, max: 50, skill: 'cooking', curve: 'timeReduction', min: 15 },
    skill: { id: 'cooking', xp: 12 },
    meters: [['cooking', 1], ['devices', 0.5]],
    emitsSignal: { signal: 'cooking', intensity: SIGNALS_EMIT.cookingAction },
    shared: {
      rate: 'companionable',
      fact: 'You and {name} cooked together.',
      templates: [
        'You cook with {name} — one of you chopping, one of you stirring, both of you in the way.',
        '{name} ends up beside you at the stove, and between you it comes together faster than it would have alone.',
      ],
    },
    prepare: prepareCook,
    buildEffects: buildCookEffects,
    narration: { mode: 'dynamic', build: cookNarration },
    // Action outcome window Phase 6 (D3/D5): the interactive engine is the
    // D-phase; the frame here is the fresh plate itself. Instance (which dish),
    // composed off prepare()'s pick exactly like self.eat.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: cookWindowSubject, phrase: cookWindowPhrase },
    },
  },
  // Food-overhaul Phase 3 (D26/D27/D29): the interim reheat (no microwave
  // until Phase 6 — a stove/oven reheat covers the meantime). Makes a
  // frozen batch eatable without waiting out THAW_TUNING and restores a
  // stale batch's quality; for a betterHot plate it's what earns the mood
  // bonus at the table. Sourced from the stove like self.cook, so it only
  // appears where the stove does.
  'self.reheat': {
    id: 'self.reheat', label: 'Reheat', verbs: ['reheat', 'warm up', 'heat up leftovers'],
    source: { kind: 'object', objDef: 'stove' },
    group: 'kitchen', chipPriority: 42,
    requires: ['hasReheatableFood', 'gasNotCutoff', 'facilityFunctional:kitchen_stove'],
    timeCost: { base: ACTION_TUNING.reheatMinutes },
    prepare: prepareReheat,
    buildEffects: buildReheatEffects,
    narration: { mode: 'dynamic', build: reheatNarration },
    // Action outcome window Phase 6 (D3): the specific leftover, warmed
    // through — an instance frame so each dish gets its own plate.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: reheatWindowSubject, phrase: reheatWindowPhrase },
    },
  },
  // Food-overhaul Phase 6 (D12): the proper fast reheat — the microwave,
  // upgrading Phase 3's interim stove touch. Same REHEAT_ITEM effect (and
  // the same picker) as self.reheat, but sourced from the microwave object
  // and clocked by the machine you own (EQUIPMENT_DEFS.microwave:
  // reheatMinutes 3/1 by kitchen_appliances tier vs the stove's 10). A
  // microwave runs on electricity, so a power cutoff takes it out while
  // the gas stove's reheat keeps working — the two are genuinely different
  // appliances with different failure modes.
  'self.microwave': {
    id: 'self.microwave', label: 'Microwave', verbs: ['microwave', 'nuke', 'heat up in the microwave', 'zap leftovers'],
    source: { kind: 'object', objDef: 'microwave' },
    group: 'kitchen', chipPriority: 43,
    requires: ['hasReheatableFood', 'powerNotCutoff', 'facilityFunctional:kitchen_appliances'],
    timeCost: { fromPrepared: true, base: ACTION_TUNING.reheatMinutes },
    prepare: prepareMicrowave,
    buildEffects: buildReheatEffects,
    narration: { mode: 'dynamic', build: microwaveNarration },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: reheatWindowSubject, phrase: microwaveWindowPhrase },
    },
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
    // Intimacy & Voyeurism Phase 5 (D11): the shower is a naked-in-scene
    // moment. 'nude' is live for the action's ticks (the scene/peek systems
    // read it), then 'towel' is left behind — TRANSIENT_CLOTHING reverts it
    // to 'dressed' on the next decayPlayerNeeds span. 'nude' is a member of
    // NAKED_CLOTHING_STATES, so the intimate gate opens for a showering
    // player exactly when its other two conditions (opt-in + content flags)
    // allow — invariant 4 preserved, fail-closed.
    transientClothing: 'nude',
    afterClothing: 'towel',
    emitsSignal: { signal: 'running_water', intensity: SIGNALS_EMIT.shower },
    timeCost: { base: 15 },
    effects: [`ADJUST_NEED player hygiene +${NEEDS.hygiene.washRestore}`],
    meters: [['showers', 1], ['waterHeating', 1]],
    narration: { mode: 'template', templates: ['You take a shower. Refreshed.'] },
    // Action outcome window Phase 1 (D3/D5): the ARCHETYPE half of the image
    // split. Showering is a repetitive-motion verb — the specific occurrence
    // is never the point — so one representative "just showered" frame per
    // bathroom is generated once and reused for every shower after it
    // (composeActionArchetypeKey, image.js). Wholly declarative: no builder
    // functions, because nothing about this frame varies per occurrence.
    // `clothing` names the state the PROMPT describes, and is folded into the
    // key: this is the outcome (afterClothing 'towel'), not the act, so it is
    // deliberately not the transient 'nude' the moment-photo path would use.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: {
        kind: 'archetype',
        variant: 'after',
        clothing: 'towel',
        phrase: 'freshly showered and wrapped in a towel, damp hair, steam still hanging in the air',
      },
    },
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
    shared: {
      rate: 'companionable',
      fact: 'You and {name} watched TV together.',
      templates: [
        'You watch TV with {name}. Neither of you is really following it, which is fine.',
        '{name} takes the other end of the sofa and you watch whatever is on until it ends.',
      ],
    },
    prepare: prepareSocialAction,
    buildEffects: buildWatchTvEffects,
    narration: { mode: 'template', templates: ['You watch some TV. Mindless, relaxing.'] },
    // Action outcome window Phase 6 (D3/D5): a repetitive-motion verb — one
    // representative "watching TV" frame, reused. Archetype.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'tv', phrase: 'settled on the sofa watching television, the glow of the screen on their face' },
    },
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
    shared: {
      rate: 'companionable',
      fact: 'You and {name} sat around together doing nothing much.',
      templates: [
        'You sit with {name} and neither of you does anything in particular. It is easy.',
        '{name} is already there, so you just sit, and the quiet turns out to be company.',
      ],
    },
    narration: { mode: 'template', templates: ['You take a moment to just breathe.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'relax', phrase: 'settled in and unwinding, a drink nearby, letting the tension out' },
    },
  },
  'self.dishes': {
    id: 'self.dishes', label: 'Wash Dishes', verbs: ['wash dishes', 'do the dishes', 'clean up'],
    source: { kind: 'object', objDef: 'sink_kitchen' },
    group: 'kitchen', chipPriority: 25,
    requires: ['dishesDirty', 'waterNotCutoff'],
    // Food-overhaul Phase 4 (D11): time scales with the dish UNITS this
    // action actually clears (perDishUnit reads prepared.units — the wash
    // capacity, skill-scaled via handWashUnitsFor), shrunk by the cleaning
    // skill's cleanEfficiency curve.
    timeCost: { base: 5, perDishUnit: 2, max: 40, skill: 'cleaning', curve: 'cleanEfficiency', min: 5 },
    skill: { id: 'cleaning', xp: 8 },
    meters: [['dishes', 1], ['waterHeating', 0.5]],
    prepare: prepareDishes,
    buildEffects: buildDishesEffects,
    narration: { mode: 'dynamic', build: dishesNarration },
    // Action outcome window Phase 6 (D3/D5): the whole strip is the "how
    // many done" — one cached "doing dishes" frame (D13's mess resolution).
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'dishes', phrase: 'washing dishes at the kitchen sink, sleeves rolled up, suds on the plates' },
    },
  },
  // Food-overhaul Phase 4 (D11): the dishwasher — load it from the sink and
  // tables and start a cycle. The machine clears DISHWASH_TUNING.tiers'
  // capacityUnits per cycle (keyed to the kitchen_appliances facility tier)
  // and is busy for cycleMinutes, lazily completed against the continuous
  // clock (ITEMS' dishwasherCycleProgress — a finished cycle frees the
  // machine on the next read). Sourced from the dishwasher object, so the
  // chip only appears where the machine is.
  'self.dishwasher': {
    id: 'self.dishwasher', label: 'Load & Run Dishwasher', verbs: ['load the dishwasher', 'run the dishwasher', 'use the dishwasher'],
    source: { kind: 'object', objDef: 'dishwasher' },
    group: 'kitchen', chipPriority: 27,
    requires: ['dishesDirty', 'waterNotCutoff', 'facilityFunctional:kitchen_appliances', 'dishwasherReady'],
    timeCost: { base: 5 },
    skill: { id: 'cleaning', xp: 6 },
    meters: [['dishes', 1], ['waterHeating', 0.5]],
    prepare: prepareDishwasher,
    buildEffects: buildDishwasherEffects,
    narration: { mode: 'dynamic', build: dishwasherNarration },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'dishwasher', phrase: 'loading the dishwasher, stacking plates into the rack' },
    },
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
  // --- Intimacy & Voyeurism Overhaul Phase 1 (D5): expandable submenus ---
  // A multi-verb object renders as ONE "X ▸" chip that expands a one-level
  // popover of its verbs. The parent (`door.interact`) is a grouping entry
  // that never executes — render.js builds the chip from it and ui.js
  // toggles the popover; `submenu` lists the verbs in declaration order.
  // Each verb is a normal ACTION_DEFS entry (own requires/effects/
  // narration) inheriting the parent's room context. Submenu verbs never
  // surface as flat chips (resolveAvailableActions excludes them).
  // `door.keyhole`/`door.listen` are stubs — Phase 3/10 slots real logic
  // in; `door.open`/`door.knock` delegate to the existing move/knock
  // handlers via `delegate` (ui.js routes them before the registered-
  // action bridge).
  'door.interact': {
    id: 'door.interact', label: 'Door',
    group: 'door', chipPriority: 45,
    submenu: ['door.keyhole', 'door.listen', 'door.unlock', 'door.open', 'door.knock'],
  },
  // door.unlock — the one door verb that works from the OUTSIDE. Only the
  // player ever locks a door (no NPC lock rule exists), so a locked door
  // you're standing next to is always one you locked — and undoing it from
  // out here is what makes lock-your-room-and-walk-out a recovery instead
  // of a permanent softlock (the door lives in the ADJACENT room, not the
  // one you're in, so the registered-action bridge can't run it; ui.js
  // intercepts it before the bridge, the same pattern as door.keyhole).
  'door.unlock': {
    id: 'door.unlock', label: 'Unlock the Door',
    source: { kind: 'room', roomIds: ['hallway_a', 'hallway_b'] },
    group: 'door', chipPriority: 31,
  },
  'door.keyhole': {
    id: 'door.keyhole', label: 'Peek Through the Keyhole',
    source: { kind: 'room', roomIds: ['hallway_a', 'hallway_b'] },
    group: 'door',
    // Intimacy & Voyeurism Phase 10 (D6): the peek hold is NOT a discrete
    // action — ui.js intercepts this verb (and door.listen) before the
    // registered-action bridge and hands the adjacent room to peek.js's
    // startPeekSession, which runs the timed loop against the continuous
    // clock. No timeCost/narration here on purpose: nothing about this
    // entry ever goes through executeAction.
  },
  'door.listen': {
    id: 'door.listen', label: 'Listen at the Door',
    source: { kind: 'room', roomIds: ['hallway_a', 'hallway_b'] },
    group: 'door',
    // The audio twin of door.keyhole — same intercepted hold, audio-only
    // lines, same risk model (see peek.js).
  },
  'door.open': {
    id: 'door.open', label: 'Open the Door',
    source: { kind: 'room', roomIds: ['hallway_a', 'hallway_b'] },
    group: 'door', chipPriority: 30,
    delegate: 'move',
  },
  'door.knock': {
    id: 'door.knock', label: 'Knock',
    source: { kind: 'room', roomIds: ['hallway_a', 'hallway_b'] },
    group: 'door', chipPriority: 25,
    delegate: 'knock',
  },
  // --- Wardrobe (Intimacy & Voyeurism Phase 5, D11) ---
  // The wardrobe object renders as ONE "Wardrobe ▸" chip expanding a one-level
  // popover — the same Phase 1 (D5) submenu pattern as the door — replacing
  // the flat "Open Wardrobe" chip (buildActionGroups special-cases the def).
  // `wardrobe.open` is a thin wrapper over the existing container machinery
  // (delegate → container.open); `wardrobe.change_outfit` is the real verb:
  // object-sourced off the wardrobe, its prepare() opens the wardrobe panel
  // (RENDER's openWardrobePanel, the picker family) and returns the chosen
  // OUTFIT, which executeAction persists via def.writesOutfit (SIM's
  // applyPlayerOutfit).
  'wardrobe.interact': {
    id: 'wardrobe.interact', label: 'Wardrobe',
    group: 'wardrobe', chipPriority: 45,
    submenu: ['wardrobe.change_outfit', 'wardrobe.open'],
  },
  'wardrobe.change_outfit': {
    id: 'wardrobe.change_outfit', label: 'Change Outfit', verbs: ['change clothes', 'change outfit', 'get dressed', 'try on clothes'],
    source: { kind: 'object', objDef: 'wardrobe' },
    group: 'wardrobe', chipPriority: 50,
    requires: ['hasWardrobeClothes'],
    timeCost: { base: ACTION_TUNING.changeOutfitMinutes },
    writesOutfit: true,
    prepare: prepareChangeOutfit,
    narration: { mode: 'dynamic', build: changeOutfitNarration },
    // Action outcome window Phase 6 (D2/D3/D5): the picker is the D-phase
    // (it runs inside the chrome's picker family, not this frame); the frame
    // here is the freshly chosen fit, keyed per outfit so each one keeps its
    // own picture (instance).
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: {
        kind: 'instance',
        subject: changeOutfitWindowSubject,
        clothing: (view) => {
          const o = view?.prepared?.outfit;
          return actionWindowSlug((o && Object.values(o).filter(Boolean).join(' ')) || 'dressed') || 'dressed';
        },
        phrase: changeOutfitWindowPhrase,
      },
    },
  },
  'wardrobe.open': {
    id: 'wardrobe.open', label: 'Open the Wardrobe',
    source: { kind: 'object', objDef: 'wardrobe' },
    group: 'wardrobe', chipPriority: 40,
    delegate: 'container.open',
  },
  // --- Intimacy & Voyeurism Overhaul Phase 11 (D3/D13): the player's
  // intimacy verbs. The plan's INTIMACY_ACT_DEFS as ACTION_DEFS rows; every
  // act passes the Phase 9 willingness gate (design invariant 1) — the
  // `willingness:<act>` requirement fails closed with refusal prose, and
  // executeAction's `paired` path (ACTIONS.resolvePairedAct) applies both
  // parties' effects/deltas. `source: { kind: 'paired' }` is deliberately a
  // kind actionSourceMatches rejects, so the paired acts surface ONLY through
  // the Make-a-Move flow (ui.js) — never as flat chips. Masturbate is solo
  // and self-sourced, so it appears as an ordinary chip in private rooms.
  //
  // Clothing semantics (invariant 4): the paired acts hold 'undressed' for
  // the whole act AND afterwards — undressed is NOT a transient state, so it
  // persists until the wardrobe (or a shower) resets it, which is exactly the
  // meaning the intimate-description gate expects. masturbate is naked-in-
  // scene during ('nude') and dressed after; share_shower is nude during and
  // towel after (TRANSIENT_CLOTHING reverts towel on the next span).
  'intimacy.masturbate': {
    id: 'intimacy.masturbate', label: 'Masturbate', verbs: ['masturbate'],
    source: { kind: 'self' },
    group: 'intimacy', chipPriority: 40,
    requires: ['privateRoom'],
    // The apartment act rides the discrete action pipeline (executeAction →
    // advanceAndResolveMinutes), so it is independent of the AfterHours
    // session's continuous 'masturbating' time context (TIME_DILATION.scales.
    // masturbating) — Phase 10's hold interplay note, resolved: no context is
    // pushed here because none applies to a discrete batch.
    vulnerableState: 'masturbating',   // the peep_player drive reads this mid-act
    transientClothing: 'nude',
    afterClothing: 'dressed',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningLow },
    // B6 (Discord feedback, 2026-08-23): freezes a moment photo into the
    // camera roll on completion (image.js's captureActionMoment/
    // buildActionMomentPrompt) — the community-fork feature players asked
    // for. momentPhrase/momentCaption are this action's own copy for that
    // generic hook; nothing else reads them.
    generatesImage: true,
    momentPhrase: 'mid-masturbation, eyes closed, lost in the feeling',
    momentCaption: 'Alone with your thoughts',
    timeCost: { base: INTIMACY.durationMinutes.masturbate },
    effects: [
      `ADJUST_NEED player desire -${DESIRE.release.masturbate}`,
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.masturbate}`,
      `ADJUST_NEED player energy -${INTIMACY.playerEnergyCost.masturbate}`,
    ],
    narration: { mode: 'template', templates: [
      'You take a little time for yourself, alone.',
      'You give in to the feeling and take care of it yourself.',
    ] },
    // Action outcome window Phase 6 (D3/D5): the player's solo act — an
    // instance frame (the moment itself), keyed on the clock like self.eat.
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: intimacyWindowSubject, clothing: 'dressed', phrase: masturbateWindowPhrase },
    },
  },
  'intimacy.quickie': {
    id: 'intimacy.quickie', label: 'Quickie',
    source: { kind: 'paired' },
    group: 'intimacy', chipPriority: 20,
    requires: ['willingness:quickie', 'privateRoom'],
    paired: {
      npcEffects: [
        `ADJUST_NEED {target} energy -${INTIMACY.npcEnergyCost.quickie}`,
        `ADJUST_NEED {target} hygiene -${INTIMACY.npcHygieneCost.quickie}`,
        `ADJUST_NEED {target} desire -${INTIMACY.npcDesireRelease.quickie}`,
        `MOOD_DELTA {target} +${INTIMACY.npcMoodGain.quickie}`,
      ],
      relDeltas: INTIMACY.relDeltas.quickie,
      npcClothing: 'undressed',
      npcClothingAfter: 'undressed',
      ledgerAct: 'quickie',
    },
    vulnerableState: 'intimacy',
    transientClothing: 'undressed',
    afterClothing: 'undressed',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningMed },
    timeCost: { base: INTIMACY.durationMinutes.quickie },
    effects: [
      `ADJUST_NEED player desire -${DESIRE.release.quickie}`,
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.quickie}`,
      `ADJUST_NEED player energy -${INTIMACY.playerEnergyCost.quickie}`,
      `ADJUST_NEED player hygiene -${INTIMACY.playerHygieneCost.quickie}`,
    ],
    narration: { mode: 'template', templates: [
      'You and {name} find a quick moment together.',
      'It is fast and frantic and leaves you both breathless.',
    ] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: intimacyWindowSubject, clothing: 'undressed', phrase: quickieWindowPhrase },
    },
  },
  'intimacy.sex': {
    id: 'intimacy.sex', label: 'Sex',
    source: { kind: 'paired' },
    group: 'intimacy', chipPriority: 20,
    requires: ['willingness:sex', 'privateRoom', 'privacy'],
    paired: {
      npcEffects: [
        `ADJUST_NEED {target} energy -${INTIMACY.npcEnergyCost.sex}`,
        `ADJUST_NEED {target} hygiene -${INTIMACY.npcHygieneCost.sex}`,
        `ADJUST_NEED {target} desire -${INTIMACY.npcDesireRelease.sex}`,
        `MOOD_DELTA {target} +${INTIMACY.npcMoodGain.sex}`,
      ],
      relDeltas: INTIMACY.relDeltas.sex,
      npcClothing: 'undressed',
      npcClothingAfter: 'undressed',
      ledgerAct: 'sex',
    },
    vulnerableState: 'intimacy',
    transientClothing: 'undressed',
    afterClothing: 'undressed',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningHigh },
    timeCost: { base: INTIMACY.durationMinutes.sex },
    effects: [
      `ADJUST_NEED player desire -${DESIRE.release.sex}`,
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.sex}`,
      `ADJUST_NEED player energy -${INTIMACY.playerEnergyCost.sex}`,
      `ADJUST_NEED player hygiene -${INTIMACY.playerHygieneCost.sex}`,
    ],
    narration: { mode: 'template', templates: [
      'You and {name} close the door and give in to each other.',
      'There is a long, unselfconscious while before either of you says anything.',
      'The room is warm and messy by the time you are done.',
    ] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: intimacyWindowSubject, clothing: 'undressed', phrase: sexWindowPhrase },
    },
  },
  'intimacy.cuddle': {
    id: 'intimacy.cuddle', label: 'Cuddle',
    source: { kind: 'paired' },
    group: 'intimacy', chipPriority: 20,
    requires: ['willingness:cuddle', 'afterSexOrClose'],
    paired: {
      npcEffects: [
        `MOOD_DELTA {target} +${INTIMACY.npcMoodGain.cuddle}`,
      ],
      relDeltas: INTIMACY.relDeltas.cuddle,
      ledgerAct: 'cuddle',
    },
    // Cuddle is deliberately NOT a vulnerable state: it is the one intimacy
    // act that can happen out in the open (a couch in the living room), so it
    // sets no _vulnerableState and no clothing. Its pairing exists for the
    // relationship/ledger/history halves, not for exposure.
    timeCost: { base: INTIMACY.durationMinutes.cuddle },
    effects: [
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.cuddle}`,
    ],
    narration: { mode: 'template', templates: [
      'You and {name} settle against each other and stay there.',
      'No words for a while — just holding on.',
    ] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: intimacyWindowSubject, phrase: cuddleWindowPhrase },
    },
  },
  'intimacy.share_shower': {
    id: 'intimacy.share_shower', label: 'Share a Shower',
    source: { kind: 'paired' },
    group: 'intimacy', chipPriority: 20,
    requires: ['willingness:share_shower', 'facilityFunctionalHere:self.shower'],
    paired: {
      npcEffects: [
        `ADJUST_NEED {target} hygiene +${INTIMACY.shareShowerRestore}`,
        `ADJUST_NEED {target} energy -${INTIMACY.npcEnergyCost.share_shower}`,
        `MOOD_DELTA {target} +${INTIMACY.npcMoodGain.share_shower}`,
      ],
      relDeltas: INTIMACY.relDeltas.share_shower,
      // 'undressed', not 'nude': the tick's clothing pass derives an NPC's
      // state from context each tick and would revert 'nude' → 'dressed' the
      // moment the partner's activity is anything other than showering/
      // swimming. 'undressed' survives the window; the towel after still
      // applies once the act closes.
      npcClothing: 'undressed',
      npcClothingAfter: 'towel',   // TRANSIENT_CLOTHING reverts towel → dressed
      ledgerAct: 'shared_shower',
    },
    vulnerableState: 'intimacy',
    transientClothing: 'nude',
    afterClothing: 'towel',
    emitsSignal: { signal: 'running_water', intensity: SIGNALS_EMIT.shower },
    timeCost: { base: INTIMACY.durationMinutes.share_shower },
    effects: [
      `ADJUST_NEED player hygiene +${INTIMACY.shareShowerRestore}`,
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.share_shower}`,
      `ADJUST_NEED player energy -${INTIMACY.playerEnergyCost.share_shower}`,
    ],
    meters: [['showers', 1], ['waterHeating', 1]],
    narration: { mode: 'template', templates: [
      'You and {name} share the shower, taking turns under the water.',
      'Soapy hands and warm water — the shower is a lot smaller than usual.',
    ] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'instance', subject: intimacyWindowSubject, clothing: 'towel', phrase: shareShowerWindowPhrase },
    },
  },
  // --- Intimacy & Voyeurism Overhaul Phase 17 (D13/D14): boundary acts ---
  // The sleeping-room verbs surface ONLY through the bed's "Bed ▸" submenu
  // (render.js builds the parent chip when a resident is asleep in the
  // room). Like the door/wardrobe submenu parents, `bed.interact` is a
  // grouping entry that never executes. Each verb's `source` is the
  // 'paired' kind actionSourceMatches rejects, so they can never resolve as
  // flat chips either. ui.js intercepts both verbs BEFORE the registered-
  // action bridge (the door.keyhole pattern) and hands the sleeping
  // resident to boundary.js's applyBoundarySleepRoom — the narrow gate, the
  // wake/catch roll, and the shaming/reciprocate routing are domain logic,
  // not action-pipeline rows. The labels carry {name} for the sleeper;
  // ui.js substitutes it when rendering the popover rows.
  'bed.interact': {
    id: 'bed.interact', label: 'Bed',
    group: 'boundary', chipPriority: 45,
    submenu: ['boundary.sleep_with', 'boundary.sleep_watch'],
  },
  'boundary.sleep_with': {
    id: 'boundary.sleep_with', label: 'Slide Into Bed With {name}',
    source: { kind: 'paired' },   // rejected by actionSourceMatches — never a flat chip
    group: 'boundary',
    // Intercepted by ui.js before the registered-action bridge (the
    // door.keyhole pattern). Nothing here ever goes through executeAction.
  },
  'boundary.sleep_watch': {
    id: 'boundary.sleep_watch', label: 'Watch {name} Sleep',
    source: { kind: 'paired' },
    group: 'boundary',
    // Same interception as boundary.sleep_with.
  },
  // The three-way act — the SAME gate as every paired act (Phase 9
  // willingness for all three parties), named by configuration as 'cuck'
  // when two of the three are a committed/seeing couple (consenting, D14).
  // Its only door is the 'Propose a Threesome' chip render.js builds when
  // two residents are present; `source: { kind: 'paired' }` keeps it from
  // ever resolving as a flat chip, and ui.js intercepts it before the
  // registered-action bridge.
  'boundary.throuple': {
    id: 'boundary.throuple', label: 'Propose a Threesome',
    source: { kind: 'paired' },
    group: 'boundary', chipPriority: 0,
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
    timeCost: { base: ACTION_TUNING.workoutMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.workoutMoodGain}`,
      `ADJUST_NEED player energy -${ACTION_TUNING.workoutEnergyCost}`,
      `ADJUST_NEED player hygiene -${ACTION_TUNING.workoutHygieneCost}`,
    ],
    meters: [['devices', 0.5]],
    shared: {
      rate: 'parallel',
      fact: 'You and {name} worked out together.',
      templates: [
        'You work out with {name} — mostly in silence, mostly counting, occasionally spotting.',
        '{name} is on the next machine over. Neither of you says much, but you both go a little harder for it.',
      ],
    },
    narration: { mode: 'template', templates: ['You get a good workout in. Winded but feeling sharp.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'workout', phrase: 'mid-workout at the gym, determined, slightly out of breath' },
    },
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
    shared: {
      rate: 'parallel',
      fact: 'You and {name} swam together.',
      templates: [
        'You swim laps alongside {name}. Neither of you talks; the water does not really allow it.',
        '{name} is already in the pool. You end up racing without either of you saying that is what this is.',
      ],
    },
    narration: { mode: 'template', templates: ['You swim until your arms ache. The water is the quietest place in the apartment.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'swim', phrase: 'swimming laps in the pool, gliding through the water' },
    },
  },
  'self.play_games': {
    id: 'self.play_games', label: 'Play Games', verbs: ['play games', 'game', 'play video games', 'play pool'],
    source: { kind: 'room', roomIds: ['game_room'] },
    group: 'game_room', chipPriority: 35,
    requires: ['facilityFunctional:game_room_setup'],
    timeCost: { base: ACTION_TUNING.gamesMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.gamesMoodGain}`,
      `ADJUST_NEED player energy -${ACTION_TUNING.gamesEnergyCost}`,
    ],
    meters: [['devices', 1]],
    shared: {
      rate: 'companionable',
      fact: 'You and {name} played against each other.',
      templates: [
        'You play against {name} until one of you is properly, unreasonably invested in winning.',
        '{name} takes the second controller. It gets loud, and then it gets late.',
      ],
    },
    narration: { mode: 'template', templates: ['You lose track of time playing. Good distraction.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'games', phrase: 'focused on a game, controller in hand, into it' },
    },
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
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'laundry', phrase: 'loading clothes into the washing machine' },
    },
  },
  'self.study': {
    id: 'self.study', label: 'Study', verbs: ['study', 'hit the books'],
    source: { kind: 'room', roomIds: ['study'] },
    group: 'study', chipPriority: 30,
    requires: ['facilityFunctional:study_setup'],
    timeCost: { base: ACTION_TUNING.studyMinutes },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.studyMoodGain}`,
    ],
    shared: {
      rate: 'parallel',
      fact: 'You and {name} studied in the same room.',
      templates: [
        'You work at the desk while {name} works at the other end of it. Nobody talks and somehow that helps.',
        '{name} is already at the table with their own thing spread out. You take the far side and get on with it.',
      ],
    },
    narration: { mode: 'template', templates: ['You settle in at the desk and focus. Quiet and productive.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'study', phrase: 'working at the desk, a book and notes spread out, focused' },
    },
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
    // Action outcome window Phase 6 (D11) left nap an unconditional Tier C
    // window with no `image`, and called the empty field the Dream Engine's
    // hook. Dream Engine Phase 7 fills it — through `onDismiss` rather than
    // through `image`, and D41 records why: a dream panel cannot be an outcome
    // frame. `image.phrase` is composed into a NEW prompt by
    // getActionWindowImage (the player's visual clause, this room, this
    // lighting) under an `awi_` key, which would generate a fresh picture on
    // the nap click and throw away the frozen prompt, the frozen seed and the
    // perspective the panel was composed under. So the nap's own window keeps
    // reporting the nap — twenty minutes, energy, mood — and the dream is a
    // second window behind it, showing the panel it actually rendered, with
    // the prose the writer wrote for it (D13: no strip on that one).
    outcomeWindow: { tier: 'C', trigger: 'player', dismissal: 'tap', onDismiss: napWindowDismiss },
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
    shared: {
      rate: 'confiding',
      fact: 'You and {name} sat out on the balcony together.',
      templates: [
        'You sit out on the balcony with {name}. The street noise fills the gaps, and then it stops needing to.',
        '{name} comes out and leans on the rail beside you. Somewhere in the next half hour you both stop making conversation and just talk.',
      ],
    },
    narration: { mode: 'template', templates: ['You sit on the balcony and watch the street below. The city hums on without you.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'balcony', phrase: 'sitting on the balcony looking out at the city, relaxed' },
    },
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
    shared: {
      rate: 'confiding',
      fact: 'You and {name} went for a walk.',
      templates: [
        'You walk the block with {name}. Walking beside someone turns out to be easier than sitting across from them.',
        '{name} grabs a jacket and comes with you. By the third street you are talking about something you had not planned to.',
      ],
    },
    narration: { mode: 'template', templates: ['You step out and walk around the block. Fresh air, sore legs, clearer head.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'walk', phrase: 'walking down the street, hands in pockets, head clear' },
    },
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
    shared: {
      rate: 'parallel',
      fact: 'You and {name} listened to music together.',
      templates: [
        'You put music on and {name} lets it play. Two people in a room agreeing about a sound.',
        '{name} is there when you put it on, and stays for the whole side of it.',
      ],
    },
    narration: { mode: 'template', templates: ['You put on music and let it carry you for a while.'] },
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'music', phrase: 'with headphones on, lost in the music, eyes half closed' },
    },
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
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      image: { kind: 'archetype', variant: 'long', clothing: 'towel', phrase: 'lingering under a long hot shower, steam everywhere, deeply relaxed' },
    },
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
  // --- Music devices (Intimacy & Voyeurism Phase 19) ---------------------
  // The soundscape verbs behind a device's "X >" submenu (SOUND_DEVICE_DEFS.
  // affords). Grouping-only parent like the door/wardrobe/bed ones (no
  // source, never executes); the three verbs are intercepted by nothing —
  // they are normal registered actions whose prepare/buildEffects write the
  // DEVICE OBJECT's state (SET_OBJECT_STATE), which is what flips the
  // standing `music` signal on and off. The parent chip carries the device's
  // objId as data-obj-id; executeAction threads it into ctx.actObjId (see
  // soundDeviceObj). play turns the device on at an audible volume,
  // set_volume picks 0-3, eject stops it.
  'sound.interact': {
    id: 'sound.interact', label: 'Device',
    group: 'sound', chipPriority: 45,
    submenu: ['sound.play', 'sound.set_volume', 'sound.eject'],
  },
  'sound.play': {
    id: 'sound.play', label: 'Play Music', verbs: ['play music', 'turn on the music', 'start some music'],
    source: { kind: 'object', objDefs: ['stereo', 'boombox', 'hobby_record_player'] },
    group: 'sound', chipPriority: 45,
    requires: [],
    timeCost: { base: 1 },
    prepare: prepareSoundDevice,
    buildEffects: buildSoundPlayEffects,
    narration: { mode: 'dynamic', build: soundPlayNarration },
  },
  'sound.set_volume': {
    id: 'sound.set_volume', label: 'Set Volume', verbs: ['set the volume', 'adjust the volume', 'volume'],
    source: { kind: 'object', objDefs: ['stereo', 'boombox', 'hobby_record_player'] },
    group: 'sound', chipPriority: 40,
    requires: [],
    timeCost: { base: 1 },
    prepare: prepareSoundVolume,
    buildEffects: buildSoundVolumeEffects,
    narration: { mode: 'dynamic', build: soundVolumeNarration },
  },
  'sound.eject': {
    id: 'sound.eject', label: 'Eject / Stop', verbs: ['stop the music', 'eject the record', 'turn it off'],
    source: { kind: 'object', objDefs: ['stereo', 'boombox', 'hobby_record_player'] },
    group: 'sound', chipPriority: 35,
    requires: [],
    timeCost: { base: 1 },
    prepare: prepareSoundDevice,
    buildEffects: buildSoundEjectEffects,
    narration: { mode: 'dynamic', build: soundEjectNarration },
  },
};

// --- Anchor preference table (continuous-behavior-engine Phase 3, D2/C3) ---
// For each action id, the object defIds — base OBJECT_DEFS ids and
// DECOR_CATALOG_DEFS ids alike — that make a good stand-point for it, in
// preference order. This is the "decor plan's table" the roadmap's C3/C5
// describe: it is what lets a furnished living room resolve `self.watch_tv`
// to the placed sofa's position instead of room-centroid, and an unfurnished
// one degrade to room-centroid (C5: an empty room is genuinely inert).
// actions.js's resolveActionAnchor scans the action's room bucket for the
// first placed (pos-carrying) object whose defId is listed here; base
// furniture has no recorded coordinate yet, so it can only ever contribute
// its room's centroid, which is exactly "no couch → generic room-center
// idle". An action with no entry (or no match) falls back to the room's
// centroid — the resolver never needs this table to produce a valid anchor.
const ACTION_ANCHOR_OBJS = {
  'self.eat': ['dining_table', 'kitchen_table', 'dining_chair'],
  'set_meal': ['dining_table', 'kitchen_table'],
  'sit': ['dining_table', 'kitchen_table', 'dining_chair'],
  'self.cook': ['stove'],
  'self.shower': ['shower'],
  'self.long_shower': ['shower'],
  'self.watch_tv': ['sofa', 'sofa_basic', 'armchair'],
  'self.relax': ['sofa', 'sofa_basic', 'armchair'],
  'self.nap': ['sofa', 'sofa_basic', 'bed', 'bed_basic'],
  'self.dishes': ['sink_kitchen'],
  'self.dishwasher': ['dishwasher'],
  'self.lock_door': ['bedroom_door', 'bathroom_door'],
  'self.unlock_door': ['bedroom_door', 'bathroom_door'],
  'self.read_note': ['note'],
  'self.bin_note': ['note'],
  'self.workout': ['treadmill'],
  'self.swim': ['swimming_pool'],
  'self.play_games': ['pool_table', 'game_console', 'dartboard'],
  'self.laundry': ['washer'],
  'self.study': ['desk', 'desktop_computer'],
  'self.listen_music': ['sofa', 'sofa_basic', 'armchair'],
  'self.balcony_sit': ['plant', 'plant_lr'],
  'self.take_walk': [],
};

// Name→predicate registry, mirroring SIM's CAST_REQUIREMENT_CHECKERS
// (config-declared requirement names, one predicate implementation per
// name). Each checker takes (ctx, ...args) and returns true, or a string
// reason the action is currently unavailable. `requires` entries on an
// ACTION_DEFS record are 'name' or 'name:arg:arg'.
// --- Intimacy & Voyeurism Phase 11 (D3/D13) ------------------------------
// What counts as a private room for the intimacy acts. Mirrors the
// willingness function's own private-room read (willingness.js keeps its
// inline copy — Phase 9's purity is tested byte-identical, so the one place
// that function runs is not touched; this is the UI/requirement-side twin).
// A bedroom is private; the bathrooms are private (their ROOMS.type says
// 'common', but a single-person bathroom behind a locking door is the most
// private room in the flat); every open room is not.
function isPrivateRoom(roomId) {
  const def = roomId ? ROOMS[roomId] : null;
  if (!def) return false;
  return def.type === 'bedroom' || roomId.startsWith('bathroom');
}

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
    // Food-overhaul Phase 3 (D20): cooking draws from the whole kitchen —
    // bag + fridge + pantry + freezer — so the gate reads the same pool the
    // action itself will cook from (they can't disagree about whether
    // there's something to make).
    return availableRecipes(kitchenIngredientPool(ctx.gameState, ctx)).length > 0
      || 'Nothing to cook — the kitchen is out of ingredients.';
  },
  // Food-overhaul Phase 3 (D26/D27/D29): the Reheat chip only lights up when
  // a cookable leftover actually exists — REHEAT_ITEM's own source list
  // (INVENTORY's reheatableStacks), the same list the action picks from.
  hasReheatableFood: (ctx) => {
    return reheatableStacks(ctx.gameState, ctx).length > 0
      || 'Nothing to reheat — no cooked leftovers around.';
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
  // action-outcome-window-plan Phase 3 (D10): `sit` needs a table that has
  // actually been laid. The gate is the SAME pair of facts the scene art
  // reads to draw a laid table (clutter 'cluttered' + a non-empty spread, via
  // tableSpreadIds), so the chip cannot light up for a table the picture says
  // is bare. buildSitEffects clears the spread when the meal is eaten, which
  // is what stops `sit` from repeating on an empty table.
  tableIsLaid: (ctx) => {
    const roomObjects = ctx.gameState.objects?.[`room_${ctx.roomId}`] || {};
    if (tableSpreadIds(roomObjects).length === 0) {
      return 'Nothing is laid out — set the table first.';
    }
    return true;
  },
  // Intimacy & Voyeurism Phase 5 (D11): Change Outfit only lights up when the
  // wardrobe in this room actually holds something to wear — an empty closet
  // is a real early-game state (bought clothing hasn't been delivered yet).
  hasWardrobeClothes: (ctx) => {
    const wardrobe = findObjectInRoom(ctx, 'wardrobe');
    if (!wardrobe) return 'No wardrobe here.';
    const hasClothes = (wardrobe.contents || []).some(s => (s?.qty || 0) > 0 && CLOTHING_DEFS[s.defId]);
    return hasClothes || 'The wardrobe is empty — nothing to change into yet.';
  },
  dishesDirty: (ctx) => {
    // Food-overhaul Phase 4 (D9): "dirty" means dish units in the wash
    // scope — the kitchen sink plus the kitchen/dining tables (eating
    // leaves dishes on the table; "do the dishes" clears them all). Reads
    // the same scope the wash/dishwasher actions clear, so the chip and the
    // action can't disagree about whether there's something to do.
    return dirtyDishScope(ctx.gameState, ctx.roomId).units > 0 || 'No dirty dishes to wash.';
  },
  // Food-overhaul Phase 4 (D11): the dishwasher chip only lights when a
  // machine is here AND it's not mid-cycle (a running machine can't be
  // re-loaded; a finished cycle is resolved on the action's prepare).
  dishwasherReady: (ctx) => {
    const dw = findObjectInRoom(ctx, 'dishwasher');
    if (!dw) return 'No dishwasher here.';
    if (dishwasherCycleProgress(dw, gameDaysNow(ctx.gameState.meta.clock)) === 'running') return 'The dishwasher is mid-cycle.';
    return true;
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
  // actor's current room — for actions available in multiple rooms that
  // each have their own facility (showers in bathroom_a vs bathroom_b).
  // Looks up ROOM_FACILITIES for the room the actor is standing in and
  // finds the first facility whose gatesActions includes the calling
  // action. Reads ctx.roomId (actions.js's buildActionContext, set from
  // the actor's location) rather than reaching for the player directly, so
  // the same checker serves whichever actor the action engine generalizes
  // to (continuous-behavior-engine Phase 3).
  facilityFunctionalHere: (ctx, actionId) => {
    const roomId = ctx.roomId || ctx.gameState.player.location;
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
  // Intimacy & Voyeurism Phase 9 (D13): the willingness gate as an action
  // requirement — the first call site of willingness.js wired to the action
  // pipeline. Phase 11's intimacy acts declare it as e.g.
  // `requires: ['willingness:sex:0.6']` and set `ctx.actTargetNpcId` in
  // their partner selection; the gate FAILS CLOSED on the hard floors
  // (design invariant 1 — a floored target can never be made to
  // participate, whatever the chip says) and returns refusal prose for a
  // soft no. The optional third arg overrides the act's authored bar.
  willingness: (ctx, act, threshold) => {
    const targetId = ctx.actTargetNpcId || ctx.actTargetId || null;
    if (!targetId) return 'You need to be with someone for that.';
    const gate = resolveWillingnessGate(ctx.gameState, targetId, 'player', act || 'default', {
      block: null,
      location: ctx.roomId,
      npcId: targetId,
    });
    if (gate.reason === 'no_target') return 'They are not here.';
    if (gate.reason === 'floor') {
      // Phase 11 (D9/D13): the marker tells executeAction whether a failed
      // check is an actual REFUSAL (write noteIntimacyRefusal — a no means no
      // for a while) or a hard-floor state (asleep/hostile/stranger/refusing
      // already) that writes nothing. Only 'below_threshold' is a conscious
      // soft no from an awake, non-hostile target.
      if (!gate.reasons || !gate.reasons.includes('actively_refusing')) ctx._willingnessRefused = gate.reason;
      return willingnessRefusalProse(ctx.gameState.npcs[targetId], gate);
    }
    if (gate.reason === 'below_threshold') {
      ctx._willingnessRefused = 'below_threshold';
      return willingnessRefusalProse(ctx.gameState.npcs[targetId], gate);
    }
    if (threshold !== undefined && gate.willingness < Number(threshold)) {
      ctx._willingnessRefused = 'below_threshold';
      return willingnessRefusalProse(ctx.gameState.npcs[targetId], gate);
    }
    return true;
  },
  // Intimacy & Voyeurism Phase 11 (D3/D13): the paired acts' room gates.
  // privateRoom — the plan's `private_room` requirement (bedroom or bathroom);
  // privacy — the plan's `privacy` requirement for sex: a locked door, or a
  // room with nobody present but the chosen partner (a third person in the
  // room is not privacy however locked the door is). Both pure reads.
  privateRoom: (ctx) => isPrivateRoom(ctx.roomId) || 'You need a private room for that.',
  privacy: (ctx) => {
    const roomId = ctx.roomId;
    if (!roomId || !ROOMS[roomId]) return 'Not a real room.';
    if (getDoorState(ctx.gameState, roomId) === 'locked') return true;
    const onlookers = (ctx.presentNpcIds || []).filter(id => id !== ctx.actTargetNpcId);
    return onlookers.length === 0 || 'Someone else is here — not private enough.';
  },
  // The plan's `after_sex_or_close` for cuddle: the target is at close phase
  // (or better) toward the player, or the two were intimate earlier TODAY —
  // cuddling is a closeness act, not an icebreaker.
  afterSexOrClose: (ctx) => {
    const targetId = ctx.actTargetNpcId;
    if (!targetId) return 'You need to be with someone for that.';
    const npc = ctx.gameState.npcs?.[targetId];
    if (!npc) return 'They are not here.';
    const phase = npc.relPlayer?.conversationPhase || 'early';
    if (PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('close')) return true;
    const hist = npc.flags?._intimacyHistory;
    if (hist && typeof hist.lastIntimateDay === 'number'
        && ctx.gameState.meta?.clock && hist.lastIntimateDay === ctx.gameState.meta.clock.day) return true;
    return 'They are not close enough to you for that yet.';
  },
};

// --- self.cook's runtime logic (food-overhaul Phase 5: the interactive
// cooking engine — D8/D14/D16) ---
// prepare() drives the whole manual loop: pick the recipe once, then
// RENDER's openCookScreen runs cookware → processing → mixing → fat →
// seasoning → heat/timing → grade reveal → rescues, and returns the fully
// resolved plan (steps, seasoning, seed, minutes, the engine's outcome and
// the plate INSTANCE it produces). buildEffects/cookNarration both read
// that same prepared object, so what happened and what got said about it
// can't disagree (see ACTIONS' executeAction for why this two-step exists).
// A cancel resolves null and marks the action cancelled so executeAction
// bails before spending time or eating ingredients.
async function prepareCook(ctx) {
  const pool = kitchenIngredientPool(ctx.gameState, ctx);
  const recipes = availableRecipes(pool);
  if (recipes.length === 0) return { recipes, recipe: null };
  let recipe;
  if (recipes.length === 1) {
    recipe = recipes[0];
  } else {
    const choiceId = await openRecipePicker(recipes);
    if (!choiceId) return { recipes, recipe: null, cancelled: true };
    recipe = recipes.find(r => r.id === choiceId);
    if (!recipe) return { recipes, recipe: null, cancelled: true };
  }
  // The interactive cook screen. openCookScreen needs the real current
  // gameState for its availability checks — ctx.gameState is the action
  // start snapshot, which is exactly what prepare() may always use (the
  // live-state hazard is handled below prepare, in buildEffects).
  const prepared = await openCookScreen(recipe, ctx.gameState, ctx);
  if (!prepared) return { recipes, recipe: null, cancelled: true };
  return { recipes, recipe, ...prepared };
}

// Food-overhaul Phase 3 (D20): the whole kitchen as one ingredient pool —
// the player's bag plus every nearby fridge/pantry/freezer (the dining-room
// fallback the same way INVENTORY's nearbyFoodContainers does it, so a meal
// cooked from the kitchen can also be planned from the table). read by the
// hasRecipeIngredients gate and prepareCook; buildCookEffects re-derives
// its own copy from the LIVE state (see kitchenSources).
function kitchenIngredientPool(gs, ctx) {
  const pool = [...(gs?.player?.inventory || [])];
  for (const obj of kitchenContainers(gs, ctx)) pool.push(...(obj?.contents || []));
  return pool;
}

// The container objects cooking/eating/reheating can draw from, resolved
// against the given gameState (live or snapshot — caller's choice). Mirrors
// nearbyFoodContainers' in-room-then-dining-fallback shape without reading
// ctx.roomObjects, which is captured at action START and can be stale once
// a picker await has let a heartbeat replace currentGameState.
function kitchenContainers(gs, ctx) {
  const isKitchen = (o) => o?.defId === 'fridge' || o?.defId === 'pantry' || o?.defId === 'freezer';
  const inRoom = Object.values(gs?.objects?.[`room_${ctx?.roomId}`] || {}).filter(isKitchen);
  if (inRoom.length > 0) return inRoom;
  if (ctx?.roomId === 'dining') {
    return Object.values(gs?.objects?.['room_kitchen'] || {}).filter(isKitchen);
  }
  return [];
}

// buildEffects' DESTROY_ITEM sources, in draw order: bag first (bag food
// spoils 4× faster than fridge food, so it's the stack to burn), then
// fridge, pantry, freezer. Each source carries the location ref its
// DESTROY_ITEM line will name.
function kitchenSources(gs, ctx) {
  const sources = [{ id: 'player', contents: gs?.player?.inventory }];
  for (const obj of kitchenContainers(gs, ctx)) sources.push({ id: obj.id, contents: obj.contents });
  return sources;
}

// Live-state object lookup for buildEffects (same rule as executeAction's
// `live`): findObjectInRoom reads ctx.roomObjects, which was captured when
// the action started — but the picker await let the continuous clock replace
// currentGameState, so effects must resolve the stove/fridge/sink against
// the LIVE state or they'd write through the detached snapshot. Scans every
// bucket like EFFECTS' findObjectById (object ids are stable, so what this
// finds is the same instance, freshly read).
function findObjectByDefIdLive(gs, defId) {
  for (const bucket of Object.values(gs?.objects || {})) {
    const o = Object.values(bucket).find(o => o?.defId === defId);
    if (o) return o;
  }
  return null;
}

// --- wardrobe.change_outfit's runtime logic (Intimacy & Voyeurism Phase 5,
// D11) ---
// prepare() opens the wardrobe panel (RENDER's openWardrobePanel — the same
// picker family as openRecipePicker/openSpreadPicker) and returns the
// player's chosen OUTFIT ({ slot: itemId }, missing slot = nothing worn
// there) alongside the outfit they were wearing BEFORE, so the narration can
// say what actually changed. A cancel (Close / Escape) resolves null and
// marks the action cancelled, so executeAction bails before spending any
// time — the wardrobe is never a free instant outfit-swap either.
async function prepareChangeOutfit(ctx) {
  const wardrobe = findObjectInRoom(ctx, 'wardrobe');
  if (!wardrobe) return { cancelled: true };
  const player = ctx.gameState.player;
  const previousOutfit = player?.outfit || {};
  const outfit = await openWardrobePanel(ctx.gameState, wardrobe.id, previousOutfit);
  if (!outfit) return { cancelled: true };
  return { outfit, previousOutfit };
}

// Names what actually changed, slot by slot — never a canned "you changed
// clothes" line (D4's spirit: the wardrobe is a system, so the prose is
// specific). Reads the prepared pick against the previous outfit, so the
// narration and the applied state cannot disagree.
function changeOutfitNarration(ctx, prepared) {
  if (!prepared?.outfit) return 'You change clothes.';
  const added = [];
  for (const slot of CLOTHING_SLOTS) {
    const now = prepared.outfit[slot];
    if (!now || now === prepared.previousOutfit?.[slot]) continue;
    const def = CLOTHING_DEFS[now];
    if (def) added.push(def.label.toLowerCase());
  }
  if (added.length === 0) return 'You straighten your clothes and call it an outfit.';
  const named = added.length === 1 ? added[0] : `${added.slice(0, -1).join(', ')} and ${added[added.length - 1]}`;
  return `You change into your ${named}.`;
}

// Ingredients may be split across bag, fridge, pantry and freezer (an
// omelette's eggs come from the fridge, a sandwich's bread from the pantry
// and cheese from the fridge) — draws each ingredient down the kitchenSources
// order, emitting one DESTROY_ITEM per source that actually supplies any.
// The pool the recipe was checked against (kitchenIngredientPool) is exactly
// the sum of these sources, so what looked available IS what gets destroyed.
// Phase 3 decision (resolves the cooking double-count): ingredients are
// DESTROYED without restoring hunger — they're transformed into the meal,
// not eaten raw, so a cooked dish restores exactly the meal's own
// consumable values and nothing is granted from nothing. (The maid's
// performMaidVisit never went through buildCookEffects, so this change
// does not touch it.)
function ingredientDestroyLines(ing, sources) {
  const lines = [];
  let remaining = ing.qty;
  for (const src of sources || []) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, stackQty(src?.contents, ing.defId));
    if (take > 0) {
      lines.push(`DESTROY_ITEM ${ing.defId} ${take} ${src.id}`);
      remaining -= take;
    }
  }
  return lines;
}

// RECIPES' `leaves` lines use {stove}/{sink} placeholders (declared once,
// resolved here against whichever actual instance is in this kitchen —
// the same recipe text works regardless of the room's seeded object ids).
// Resolves against the LIVE state (same rule as buildCookEffects): object
// ids are stable, but reading them through the pre-await ctx would violate
// the live-state contract for nothing.
function expandCookLeaveLine(line, ctx) {
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const stove = findObjectByDefIdLive(gs, 'stove');
  const sink = findObjectByDefIdLive(gs, 'sink_kitchen');
  return line.replace('{stove}', stove?.id || '').replace('{sink}', sink?.id || '');
}

// Produces the recipe's full batch as a PLATE INSTANCE (COOKING's
// buildPlate — the engine's snapshot: quality/grade/kcal/flaws derived once
// and never re-derived), spawns it into the fridge (bag fallback for the
// pre-fridge early game), then auto-eats one serving immediately (matching
// the old self.cook's "click once, hunger restored" feel — the rest is
// leftovers). Fats/seasonings drawn by the plan are consumed on the side
// (fats via CONSUME_ITEM, seasonings via TRANSFORM_ITEM — both trusted
// pipeline verbs). Re-derives the LIVE gameState after prepare()'s modal
// await (a heartbeat/checkpoint can have replaced currentGameState while
// it was open) — the live-state hazard this whole pipeline guards: effects
// written through the stale ctx capture would silently vanish from the save.
function buildCookEffects(ctx, prepared) {
  if (!prepared?.recipe) return [];
  const { recipe } = prepared;
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const now = gameDaysNow(gs?.meta?.clock);
  const sources = kitchenSources(gs, ctx);
  const lines = recipe.ingredients.flatMap(ing => ingredientDestroyLines(ing, sources));
  // The engine's plate — precomputed by the interactive screen when there
  // was one (prepared.plate), or derived here for bare/legacy callers.
  const plate = prepared.plate || buildPlate(gs, recipe, recipe.ingredients, recipe.method, recipe.cookware, prepared);
  for (const reagentId of prepared.seasoning || []) {
    const r = COOK_TUNING.reagents[reagentId];
    if (!r) continue;
    const verb = r.kind === 'fat' ? 'CONSUME_ITEM' : 'TRANSFORM_ITEM';
    lines.push(...reagentConsumeLines(verb, reagentId, r.qtyPerUse, sources));
  }
  // The batch lives where it keeps best and where the leftovers stay
  // reachable: the fridge. No fridge yet (early game) → the player's bag.
  const fridge = findObjectByDefIdLive(gs, 'fridge');
  const into = fridge ? fridge.id : 'player';
  const metaJson = JSON.stringify({ plate, cohort: now, acquiredDay: now });
  lines.push(`COOK_STEP cooked_meal 1 ${into} ${metaJson}`);
  lines.push(`EAT_ITEM cooked_meal 1 ${into}`);
  // Food-overhaul Phase 6 (D14): a plate that clears the CURRENT auto-cook
  // threshold records its mastery proof — instant cook for this recipe
  // unlocks forever (world.autoCookCleared, via the AUTO_COOK_UNLOCK verb).
  // Equipment upgrades LOWER the threshold, so a cook that missed the bar
  // today can unlock the same recipe later under a better stove.
  const threshold = autocookThreshold(recipe, gs);
  if (plate.grade && gradeAtOrAbove(plate.grade, threshold)) {
    lines.push(`AUTO_COOK_UNLOCK ${recipe.id} ${plate.grade}`);
  }
  // Food-overhaul Phase 4 (D9): the cook's dish footprint — the recipe
  // method's cookware (DISH_TUNING.cookFootprint) plus the universal prep
  // tools — lands in the sink as REAL dish units. The production rules live
  // once in DISH_TUNING; the recipes' old SET_OBJECT_STATE sink lines are
  // gone. `{sink}` resolves live via expandCookLeaveLine below; no sink in
  // the kitchen (early game) → no dish mess to leave.
  const sinkId = findObjectByDefIdLive(gs, 'sink_kitchen')?.id;
  if (sinkId) {
    const footprint = { ...(DISH_TUNING.cookFootprint[recipe.method] || {}), ...DISH_TUNING.prepFootprint };
    for (const [dishType, qty] of Object.entries(footprint)) {
      lines.push(`ADD_DISHES ${sinkId} ${dishType} ${qty}`);
    }
  }
  for (const leave of recipe.leaves || []) lines.push(expandCookLeaveLine(leave, ctx));
  return lines;
}

// Draws qty of a reagent down the kitchenSources order (bag → fridge →
// pantry → freezer), emitting one verb line per source that supplies any —
// the mirror of ingredientDestroyLines, for the engine's fat/seasoning
// consumption. `verb` is CONSUME_ITEM (fats) or TRANSFORM_ITEM (seasonings).
function reagentConsumeLines(verb, reagentId, qty, sources) {
  const lines = [];
  let remaining = qty;
  for (const src of sources || []) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, stackQty(src?.contents, reagentId));
    if (take > 0) {
      lines.push(`${verb} ${reagentId} ${take} ${src.id}`);
      remaining -= take;
    }
  }
  return lines;
}

function cookNarration(ctx, prepared) {
  if (!prepared?.recipe) return 'You rummage through the kitchen but come up empty-handed.';
  const recipe = prepared.recipe;
  const leftover = (recipe.servings || 1) > 1;
  let tail = 'It smells good.';
  const grade = prepared.plate?.grade;
  const flawLines = (prepared.plate?.flaws || []).map(f => cookFlawTail(f));
  if (grade) {
    tail = `It comes out ${grade}${flawLines.length ? ` — ${flawLines[0]}.` : '.'}`;
  }
  // Food-overhaul Phase 6 (D14): the auto-cook path has its own voice — it
  // is NOT a fresh cook, it's a recipe you've proven you know, on autopilot.
  if (prepared.auto) {
    return `You put together ${recipe.label.toLowerCase()} on autopilot — you've made it enough times that it barely needs you${flawLines.length ? ` (${flawLines[0]})` : '.'}`;
  }
  return `You cook ${recipe.label.toLowerCase()}. ${tail}` + (leftover ? " There's enough for leftovers." : '');
}

// --- self.reheat's runtime logic (food-overhaul Phase 3, D26/D27/D29) ---
// prepare() picks the leftover once; buildEffects/reheatNarration read that
// same pick (the ACTIONS two-step contract). Options come from INVENTORY's
// reheatableStacks (plate batches with servings left, bag + nearby fridge/
// pantry/freezer); one option reheats straight through, several ask via
// RENDER's openReheatPicker. A cancel resolves null and marks the action
// cancelled so executeAction bails before spending time or touching food.
async function prepareReheat(ctx) {
  const options = reheatableStacks(ctx.gameState, ctx);
  if (options.length === 0) return { options, option: null, cancelled: true };
  if (options.length === 1) return { options, option: options[0] };
  const choice = await openReheatPicker(options);
  // Index-based (== null, not falsy — index 0 is a valid pick).
  if (choice == null) return { options, option: null, cancelled: true };
  return { options, option: options[choice] || null };
}

function buildReheatEffects(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return [];
  // REHEAT_ITEM reheats the whole stack where it sits (the fridge/freezer
  // batch stays put — no move needed for the kitchen touch to land).
  return [`REHEAT_ITEM ${option.stack.defId} ${option.from}`];
}

function reheatNarration(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return 'You stand at the stove with nothing to warm up.';
  const label = stackLabel(option.stack).toLowerCase();
  const fresh = freshnessOf(option.stack, option.containerDef ?? null, option.day ?? gameDaysNow(ctx?.gameState?.meta?.clock));
  const frozen = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
  const stale = fresh?.key === 'stale' || fresh?.key === 'spoiled';
  const tail = frozen
    ? ' — the frozen batch thaws and warms through.'
    : stale
      ? ' — it comes back to life.'
      : '.';
  return `You reheat the ${label} on the stove${tail}`;
}

// Food-overhaul Phase 6 (D12): the microwave's prepare — the same reheat
// picker as the stove, plus the machine's reheatMinutes (EQUIPMENT_DEFS,
// keyed to kitchen_appliances) so resolveTimeCost clocks the action at the
// machine you actually own. Falls through the shared cancel/no-options
// shapes unchanged.
async function prepareMicrowave(ctx) {
  const base = await prepareReheat(ctx);
  if (!base.option) return base;
  return { ...base, minutes: microwaveReheatMinutes(ctx.gameState) || ACTION_TUNING.reheatMinutes };
}

function microwaveNarration(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return 'You stand at the microwave with nothing to warm up.';
  const label = stackLabel(option.stack).toLowerCase();
  const fresh = freshnessOf(option.stack, option.containerDef ?? null, option.day ?? gameDaysNow(ctx?.gameState?.meta?.clock));
  const frozen = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
  const stale = fresh?.key === 'stale' || fresh?.key === 'spoiled';
  const tail = frozen
    ? ' — the frozen batch thaws and steams through.'
    : stale
      ? ' — it comes back to life.'
      : '.';
  return `You nuke the ${label}${tail}`;
}

// --- Social time (inventory overhaul Phase 6, D13) ---
// The game's thesis made mechanical: being with people who like you pays.
// presentResidentAffection is the shared read (average affection of
// residents physically in the player's room, hostile/absent = 0) used by
// watch_tv, eating together, and the hobby actions. The persistent
// baseline side lives in SIM's resolveMoodTarget (MOOD_TARGET.social.
// presencePerPerson); these are the per-action impulse sides.
//
// Initiative plan Phase 5: the resident filter this used to inline is now
// ACTIONS' sharedActivityParticipants, and this reads it. "Who is actually in
// this with me" is ONE question, and D16's facts and deltas ask it about the
// same room at the same moment as this mood impulse does — two implementations
// would have been two ideas of togetherness with nothing forcing them to agree.
// The behaviour changes in exactly one case, and it was wrong: a roommate
// asleep on the sofa used to make watching TV "with someone who likes you".
function presentResidentAffection(ctx) {
  const ids = sharedActivityParticipants(ctx);
  let sum = 0;
  for (const id of ids) sum += ctx.gameState?.npcs?.[id]?.relPlayer?.affection ?? 0;
  return ids.length > 0 ? sum / ids.length : 0;
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

// `watchTvNarration` is GONE (initiative plan Phase 5). It existed for one
// branch — "you watch TV with someone who actually likes you" — which fired on
// affection rather than on presence, so it stayed silent for the whole of an
// untouched playthrough (every relationship axis generates at 0) and would have
// contradicted the shared template the moment affection moved. narrateAction
// prefers `def.shared.templates` whenever somebody is actually in the room now,
// which is the two-person version D17 asks for, so what is left of this action's
// narration is one solo line and a dynamic builder for it would be a function
// that only ever returns a constant. The def is `mode: 'template'` again;
// prepareSocialAction stays, because buildWatchTvEffects still needs the
// affection-scaled mood impulse.

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
      // Action outcome window Phase 6 (D3/D5): one representative frame per
      // hobby OBJECT (archetype, reused) — the point is the mood/delta, not
      // "which song" or "which page".
      outcomeWindow: {
        tier: 'C', trigger: 'player', dismissal: 'tap',
        image: { kind: 'archetype', variant: objDef, phrase: (view) => HOBBY_WINDOW_PHRASE[objDef] || 'engrossed in a hobby' },
      },
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
  // Intimacy & Voyeurism Phase 19: playing the records IS the music — the
  // record player's standing music signal comes from its own state, so the
  // hobby spins it up (on, audible). The sound submenu verbs control it
  // from there.
  if (key === 'hobby_record_player') {
    const rec = findObjectInRoom(ctx, 'hobby_record_player');
    if (rec) {
      lines.push(`SET_OBJECT_STATE ${rec.id} power on`);
      if (!rec.state?.volume || rec.state.volume === '0') lines.push(`SET_OBJECT_STATE ${rec.id} volume 2`);
    }
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

// Action outcome window Phase 6 (D3/D5): the phrase for each hobby's
// reused (archetype) frame. Mirrors HOBBY_NARRATION — authored here in the
// verb's file, never in actionwindow.js.
const HOBBY_WINDOW_PHRASE = {
  hobby_guitar: 'playing guitar, fingers on the strings, eyes on the instrument',
  hobby_bookshelf: 'curled up reading, lost in a book',
  hobby_record_player: 'with the needle down on a record, eyes closed, listening',
  hobby_console: 'focused on a console, controller in hand',
  hobby_sketchpad: 'sketching in a sketchpad, pencil moving across the page',
  hobby_houseplant: 'tending a houseplant, watering it and turning it toward the light',
};

function hobbyNarration(ctx, prepared) {
  const key = prepared?.key;
  const line = HOBBY_NARRATION[key];
  if (line) return line;
  return 'You lose yourself in the hobby for a while. Good for the head.';
}

// The device object behind a sound verb, resolved from the parent chip's
// objId (ctx.actObjId, threaded by executeAction) so a submenu row acts on
// the EXACT device it was opened from; falls back to the first sound device
// in the room (a submenu row without the objId context, e.g. a re-dispatched
// action). Null when no device is reachable — the caller cancels.
function soundDeviceObj(ctx) {
  if (ctx.actObjId) {
    const byId = findObjectById(ctx.gameState, ctx.actObjId);
    if (byId && SOUND_DEVICE_DEFS[byId.defId]) return byId;
  }
  for (const key of Object.keys(SOUND_DEVICE_DEFS)) {
    const sdef = SOUND_DEVICE_DEFS[key];
    if (!sdef.sourceObjDef) continue;
    const obj = findObjectInRoom(ctx, sdef.sourceObjDef);
    if (obj) return obj;
  }
  return null;
}

function prepareSoundDevice(ctx) {
  const obj = soundDeviceObj(ctx);
  if (!obj) return { cancelled: true };
  return { objId: obj.id, defId: obj.defId, volume: obj.state?.volume || '0', power: obj.state?.power || 'off' };
}

// The volume picker's prepare: presents the 0-3 choices (RENDER's
// openVolumePicker) and resolves to the chosen STATE string or cancelled.
async function prepareSoundVolume(ctx) {
  const obj = soundDeviceObj(ctx);
  if (!obj) return { cancelled: true };
  const label = OBJECT_DEFS[obj.defId]?.label || 'Device';
  const chosen = await openVolumePicker(obj.state?.volume || '0', label);
  if (!chosen) return { cancelled: true };
  return { objId: obj.id, defId: obj.defId, volume: chosen };
}

function buildSoundPlayEffects(ctx, prepared) {
  if (!prepared?.objId) return [];
  const lines = [`SET_OBJECT_STATE ${prepared.objId} power on`];
  if (!prepared.volume || prepared.volume === '0') lines.push(`SET_OBJECT_STATE ${prepared.objId} volume 2`);
  return lines;
}

function buildSoundVolumeEffects(ctx, prepared) {
  if (!prepared?.objId) return [];
  return [`SET_OBJECT_STATE ${prepared.objId} volume ${prepared.volume}`];
}

function buildSoundEjectEffects(ctx, prepared) {
  if (!prepared?.objId) return [];
  return [`SET_OBJECT_STATE ${prepared.objId} power off`];
}

function soundDeviceName(prepared) {
  const label = prepared?.defId ? (OBJECT_DEFS[prepared.defId]?.label || 'device') : 'device';
  return label.toLowerCase();
}

function soundPlayNarration(ctx, prepared) {
  return `You switch on the ${soundDeviceName(prepared)}. The room fills with music.`;
}

function soundVolumeNarration(ctx, prepared) {
  const name = soundDeviceName(prepared);
  if (prepared?.volume === '0') return `You turn the ${name} down to nothing.`;
  return `You set the ${name} to volume ${prepared?.volume}.`;
}

function soundEjectNarration(ctx, prepared) {
  return `You stop the ${soundDeviceName(prepared)}. The room goes quiet.`;
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
  // Index-based resolution (== null, not falsy: index 0 is a valid pick) —
  // two plate batches of the same recipe can share a container, and only
  // the option's position in THIS list tells them apart.
  if (choice == null) return { options, option: null, cancelled: true, affection };
  return { options, option: options[choice] || null, affection };
}

function buildEatEffects(ctx, prepared) {
  const option = prepared?.option;
  if (!option) return [];
  // EAT_ITEM consumes in place (fridge leftovers stay in the fridge — a
  // bag would spoil them 4× faster) and restores the def's consumable
  // scaled to one serving.
  const lines = [`EAT_ITEM ${option.stack.defId} 1 ${option.from}`];
  // Food-overhaul Phase 4 (D9): eating dirties a plate + fork onto the
  // table in the room you ate in (DISH_TUNING.eatFootprint — a solo bite
  // leaves a one-plate mess the next wash pass clears). Resolved against
  // the LIVE state (same rule as buildCookEffects): the picker await can
  // let a heartbeat replace currentGameState, so the table id must come
  // from the live gameState, not the pre-await ctx capture.
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const table = Object.values(gs.objects?.[`room_${ctx.roomId}`] || {})
    .find(o => o.defId === 'kitchen_table' || o.defId === 'dining_table');
  if (table) {
    for (const [dishType, qty] of Object.entries(DISH_TUNING.eatFootprint)) {
      lines.push(`ADD_DISHES ${table.id} ${dishType} ${qty}`);
    }
  }
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
  // Food-overhaul Phase 3 (D25): a plate's label is its own snapshot, not
  // the cooked_meal carrier def's — a fridge of plates narrates as "pasta"
  // / "stir-fry", never as "cooked meal".
  const label = stackLabel(option.stack).toLowerCase();
  // Phase 4: surface the eaten item's freshness — the picker shows the
  // same freshness tags, and the Stale/Spoiled lines match the restore
  // penalties applyEatItem applies. There is no Rotten line: rotten food
  // never reaches the picker (INVENTORY's edibleStacks) and applyEatItem
  // would refuse it anyway.
  const fresh = freshnessOf(option.stack, option.containerDef ?? null, gameDaysNow(ctx?.gameState?.meta?.clock));
  if (fresh?.key === 'spoiled') return `You eat some ${label}. It tastes off, and you know it the whole way down.`;
  if (fresh?.key === 'stale') return `You eat some ${label}. It has been sitting a while — it does the job.`;
  // Raw-ingredient line (2026-08-20): a rawDangerous def eaten straight
  // from storage reads as the mistake it is — mirroring RAW_FOOD's penalty
  // in EFFECTS' applyEatItem. Plates are never raw, so the check is
  // def-driven only.
  if (!option.stack?.meta?.plate && def.rawDangerous) {
    const reaction = {
      eggs: "Eggy. There's a reason eggs go in a pan.",
      chicken_raw: 'Cold and rubbery. Your stomach files a protest.',
      ground_beef: 'Cold and raw. Your stomach files a protest.',
      bacon: 'Chewy and raw. Your stomach files a protest.',
    }[def.id] || 'That was probably a mistake.';
    return `You eat some ${label} raw. ${reaction}`;
  }
  // Food-overhaul Phase 3 (D27/D28): a plate eaten in a way that costs mood
  // gets its own line — the cold betterHot plate forfeiting its bonus, and
  // the frozen-ordinary-plate penalty bite — mirroring what applyEatItem
  // actually does to the player's mood bar.
  if (option.stack?.meta?.plate) {
    const cold = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
    const hotNow = !cold && ((option.stack.meta.plate.wasReheated || option.stack.meta.wasReheated) || fresh?.key === 'fresh');
    if (stackBetterHot(option.stack) && !hotNow) return `You eat the ${label} cold. It still fills you up, but the magic is gone.`;
    if (cold && !stackFrozenFood(option.stack)) return `You eat the ${label} straight from the freezer. It's a miserable mouthful, but it's food.`;
  }
  // Phase 6: eating with a liked resident is its own line — the social
  // bonus buildEatEffects added deserves narration.
  if ((prepared?.affection ?? 0) > 0) return `You share a meal with someone who actually likes you. The ${label} never tasted better.`;
  if (def.category === 'drink') return `You drink some ${label}.`;
  const amount = itemServings(def) > 1 ? 'some of the' : 'a';
  return `You eat ${amount} ${label}.`;
}

// --- self.eat's outcome-window builders (action-outcome-window Phase 1, D5) ---
// Both read prepare()'s pick, the same way buildEatEffects and eatNarration
// already do, so the picture, the prose and the effects can't disagree about
// what got eaten. `view` is actionwindow.js's resolve-time bundle
// ({ gs, def, result, prepared, roomId }) — NOT the ACTIONS ctx, because the
// window resolves after executeAction has already returned and the clock has
// already moved.

// The cache-key discriminator for the instance frame. The dish is what makes
// the frame worth generating at all, and the clock stamp is what makes it THIS
// occurrence rather than a shared entry for every pasta ever eaten — eating
// costs at least 5 game-minutes (INVENTORY_TUNING.useTimeMinutes), so no two
// meals can collide on it.
function eatWindowSubject(view) {
  const option = view?.prepared?.option;
  const clock = view?.gs?.meta?.clock || {};
  const label = option ? stackLabel(option.stack) : 'food';
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'food';
  return `${slug}-d${clock.day || 0}m${Math.floor(clock.minutes || 0)}`;
}

// The verb's own phrase for the frame — image.js composes the player clause
// and the room around it, but WHAT the player is doing is authored here, in
// the verb's file, never in the window.
function eatWindowPhrase(view) {
  const option = view?.prepared?.option;
  if (!option) return 'sitting at the table with nothing to eat';
  const label = String(stackLabel(option.stack)).toLowerCase();
  if (option.def?.category === 'drink') return `drinking ${label}, glass in hand`;
  return `mid-meal, eating ${label}, a plate and cutlery on the table in front of them`;
}

// --- set_meal's runtime logic (inventory overhaul Phase 7, D7) ---
// prepare() lays out the SPREAD once and snapshots the table (attendees,
// commitment state, dining-table instance, who eats what); buildEffects and
// the narration both read that SAME snapshot so what happened and what got
// said about it can't disagree (the ACTIONS two-step contract).
//
// The spread is several dishes, not one. It used to be one: the player
// picked a single item, and `fedNpcIds` was capped at that item's servings
// minus the player's own. A 1-serving steak with three roommates at the
// table therefore fed the player and nobody else — the other three collected
// the attendance mood bonus, the comfort restore and a relationship delta for
// watching. The cap was right; having only one dish to cap against was not.
//
// Now: pick up to COMMITMENT_TUNING.maxSpreadDishes dishes, their servings
// pool, and everyone at the table takes one serving round-robin across the
// dishes (allocateSpread). Catering for the room becomes a visible decision —
// the picker shows servings against seats — and under-catering costs the
// unfed their attendanceMultFed rather than doing so silently.
//
// The action's time cost is still the flat set_meal stretch, not the item
// category, since the point is the gathering, not the bite.
async function prepareSetMeal(ctx) {
  const affection = presentResidentAffection(ctx);
  const options = edibleStacks(ctx.gameState, ctx);
  if (options.length === 0) return { options, spread: [], cancelled: true, affection };
  const attendees = mealAttendees(ctx.gameState, ctx.roomId);
  // Food-overhaul Phase 7 (D23): each dish rows who at the table actually
  // likes it — the spread picker shows "Maya loves it · Sam hates it" so
  // catering to known tastes is a visible decision, not a guess. The notes
  // are computed once here (taste is a pure function of each NPC) and read
  // by RENDER's openSpreadPicker.
  for (const o of options) {
    o.tasteNotes = tasteNoteList(o.stack, attendees)
      .map(n => `${n.name} ${TASTE_TUNING.bands[n.band].label}`);
  }
  const seats = 1 + attendees.length; // the player plus everyone at the table
  const chosen = await openSpreadPicker(options, { seats, max: COMMITMENT_TUNING.maxSpreadDishes });
  if (!chosen || chosen.length === 0) return { options, spread: [], cancelled: true, affection };
  // Index-based (two plates of the same recipe can share a container; the
  // position in THIS options list is the only unambiguous key).
  const spread = chosen.map(i => options[i]).filter(Boolean);
  if (spread.length === 0) return { options, spread: [], cancelled: true, affection };

  const hasCommitment = activeMealCommitmentsInRoom(ctx.gameState, ctx.roomId).length > 0;
  // The table the spread lands on is resolved LIVE in buildSetMealEffects
  // against the room the meal actually happened in (dining table in the
  // dining room, kitchen table in the kitchen) — buildEffects must never
  // write through a pre-await object capture, and the room is known only at
  // apply time.
  //
  // Phase 3 (D10): NO servings are allocated here and nobody eats. Laying the
  // table records WHAT is out (the table's flags.spread, which the scene art
  // already reads) and consumes nothing — the stacks stay where they are and
  // `sit` re-resolves them when someone actually sits down. That is what
  // leaves a real interval during which the food is out and the meal has not
  // happened yet, which is the interval an uninvited roommate walks into.
  return {
    options, spread, affection, attendees, hasCommitment,
    seats, totalServings: spreadServings(spread),
  };
}

// Total servings on the table.
function spreadServings(spread) {
  return (spread || []).reduce((sum, o) => sum + stackServingsLeft(o.stack), 0);
}

// Who eats what. Each eater in seat order takes ONE serving, round-robin
// across the dishes rather than draining the first — a table of four with
// pizza (4), fries (1) and salad (1) eats pizza, fries, salad, pizza and
// leaves two slices, which is how a real table of food gets eaten. Draining
// in order would have fed all four from the pizza and left the fries and
// salad untouched, which makes laying out a spread pointless.
//
// Returns one { who, defId, from, def } per serving actually served; an eater
// the spread ran out for simply doesn't appear, and that IS the under-catering
// signal every caller reads.
function allocateSpread(spread, eaters) {
  const left = spread.map(o => stackServingsLeft(o.stack));
  const out = [];
  let dish = 0;
  for (const who of eaters) {
    // Walk from the round-robin cursor to the first dish with anything left.
    let tried = 0;
    while (tried < spread.length && left[dish] <= 0) {
      dish = (dish + 1) % spread.length;
      tried++;
    }
    if (left[dish] <= 0) break; // the whole spread is gone — the rest go unfed
    left[dish] -= 1;
    // The stack rides along so per-dish consumers (the mood math in
    // buildSetMealEffects) can read a PLATE's instance values — a def id is
    // not enough to tell a plate from the carrier def's placeholder.
    out.push({ who, defId: spread[dish].stack.defId, from: spread[dish].from, def: spread[dish].def, stack: spread[dish].stack });
    dish = (dish + 1) % spread.length;
  }
  return out;
}

// How good a meal this dish is, 0..1 — hunger is the bulk, mood and energy
// sweeten it. Scales the relationship delta (a four-cheese pizza bonds
// people more than a dry sandwich).
function foodQuality(def) {
  const c = def.consumable || {};
  const raw = (c.hunger || 0) + (c.mood || 0) * 40 + (c.energy || 0) * 0.4;
  return clamp(raw / 60, 0, 1);
}

// How good a single dish on the table is, 0..1. Food-overhaul Phase 3: a
// PLATE's quality is its instance snapshot (plate.quality, set once at cook
// time — design invariant 1) — the cooked_meal carrier def only carries a
// placeholder consumable, so reading it would call every home-cooked plate
// a dry sandwich.
function dishQuality(o) {
  const plate = o?.stack?.meta?.plate;
  if (plate) return plate.quality;
  return foodQuality(o?.def);
}

// How good the WHOLE TABLE is: its BEST dish, plus
// COMMITMENT_TUNING.spreadVarietyBonus per additional distinct dish. This is
// the only place that judgement is made — mealRelDelta reads it rather than
// re-deriving it.
//
// Best-plus-variety rather than the mean, which was the first thing tried and
// is simply the wrong function: averaging makes putting fries and a salad next
// to a good pizza score WORSE than serving the pizza alone, so the mechanic
// would have punished laying out a spread — the exact opposite of the point.
// A dinner is judged by its centrepiece and by how much there is to choose
// from. The existing 0..1 clamp bounds the variety term, so a six-dish
// banquet tops out rather than running away.
function spreadQuality(spread) {
  if (!spread || spread.length === 0) return 0;
  const best = Math.max(...spread.map(o => dishQuality(o)));
  // Distinct dishes by what they actually ARE: a plate counts by its recipe,
  // a def-driven dish by its def id — two cooked plates are not variety.
  const kinds = new Set(spread.map(o => {
    const plate = o?.stack?.meta?.plate;
    return plate ? plate.recipeKey : o?.def?.id;
  }));
  const variety = (kinds.size - 1) * COMMITMENT_TUNING.spreadVarietyBonus;
  return clamp(best + variety, 0, 1);
}

// Per-attendee relationship delta for a shared meal, scaled by the spread's
// quality, whether they actually ate ("attendance"), and the existing
// relationship (someone who already likes you warms faster). All numbers
// from COMMITMENT_TUNING.
function mealRelDelta(quality, npc, fed) {
  const existing = Math.max(0, npc?.relPlayer?.affection || 0);
  const raw = (COMMITMENT_TUNING.relationshipBase + quality * COMMITMENT_TUNING.relationshipQualityWeight)
    * (fed ? COMMITMENT_TUNING.attendanceMultFed : COMMITMENT_TUNING.attendanceMultPresent)
    * (1 + existing * COMMITMENT_TUNING.relationshipExistingWeight);
  return Math.round(Math.min(COMMITMENT_TUNING.relationshipCap, raw) * 1000) / 1000;
}

function buildSetMealEffects(ctx, prepared) {
  const spread = prepared?.spread || [];
  if (spread.length === 0) return [];
  const lines = [];

  // Phase 3 (D10): laying the table is a WORLD WRITE and nothing else. No
  // EAT_ITEM, no attendee deltas, no dishes — `sit` owns every one of those
  // now, because every one of them is about the meal happening rather than
  // about the food being out. What this leaves behind is a laid table:
  // `clutter: cluttered` plus the spread's def ids, which is the pair
  // IMAGE's tableSpreadIds already reads to draw what is on the table, and
  // which `sit` now reads to know what there is to eat.
  //
  // Nothing is consumed. The stacks stay in the fridge/bag they came from
  // and `sit` re-resolves them at eat time — so a spread that gets raided or
  // goes off between laying and sitting is genuinely gone, rather than having
  // been teleported into an invisible holding pen at lay-out time.
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const mealRoom = gs.player.location;
  const table = Object.values(gs.objects?.[`room_${mealRoom}`] || {})
    .find(o => o.defId === 'dining_table' || o.defId === 'kitchen_table') || null;
  if (table) {
    lines.push(`SET_OBJECT_STATE ${table.id} clutter cluttered`);
    lines.push(`SET_TABLE_SPREAD ${table.id} ${spread.map(o => o.stack.defId).join(' ')}`);
  }
  return lines;
}

// Joins labels the way a person would: "a", "a and b", "a, b and c".
function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Food-overhaul Phase 7 (D23): the non-neutral taste reactions at a set
// meal — "Maya lights up — this is exactly their thing. Sam soldiers
// through it with a brave face." Computed from the SAME per-eater band
// buildSetMealEffects scales its deltas by (tasteBandForStack on the actual
// serving), so the prose and the relationship change cannot disagree about
// what each attendee got.
function setMealTasteLines(ctx, prepared) {
  const reactions = [];
  for (const s of prepared?.servings || []) {
    if (s.who === 'player') continue;
    const npc = ctx.gameState.npcs[s.who];
    if (!npc) continue;
    const row = tasteBandRow(tasteBandForStack(s.stack, npcTaste(npc)));
    if (!row?.reaction) continue;
    reactions.push(row.reaction.replace('{name}', npc.bible?.name || 'They'));
  }
  return reactions;
}

// Phase 3 (D10): this describes a table that has just been LAID, not a meal
// that has been eaten. Nobody has sat down yet — that is `sit` — so there are
// no taste reactions, no under-catering, and nobody to name as company. What
// it can still say is what went out, whether any of it is off, whether the
// table was set for a booked occasion, and whether there is enough for the
// people who might turn up.
function setMealNarration(ctx, prepared) {
  const spread = prepared?.spread || [];
  if (spread.length === 0) return 'You go to lay the table, but there is nothing to put on it.';
  // Food-overhaul Phase 3 (D25): a plate dishes its own label ("pasta"),
  // not the cooked_meal carrier def's ("cooked meal").
  const dishes = joinList(spread.map(o => stackLabel(o.stack).toLowerCase()));
  const setting = prepared?.hasCommitment ? ' It is booked, and the table is properly set.' : '';

  // Anything laid out that has already turned gets its own line — it is the
  // most important thing about the table, and it applies to the SPREAD, so a
  // single bad dish among four is named as the one that is off.
  const now = gameDaysNow(ctx.gameState.meta.clock);
  const off = spread.filter(o => freshnessOf(o.stack, o.containerDef ?? null, now)?.key === 'spoiled');
  if (off.length > 0) {
    const offLabels = joinList(off.map(o => stackLabel(o.stack).toLowerCase()));
    return `You lay out ${dishes}.${setting} The ${offLabels} is past its best, and it is not subtle about it.`;
  }

  // How many the table could actually feed, against how many seats there are.
  // Said now rather than at the meal, because catering is a decision made
  // HERE and the player should be able to fix it before anyone sits down.
  const servings = spreadServings(spread);
  const short = servings < SIT_TUNING.maxSeats
    ? ` There is enough for ${servings === 1 ? 'one' : servings}.` : '';
  return `You lay ${dishes} out on the table.${setting}${short} It smells like dinner, and that carries.`;
}

// --- `sit`'s runtime logic (action-outcome-window-plan Phase 3) -----------
// D10's real meal event, and the one verb that exercises the whole
// architecture at once: D5's image split, D6's conditional handoff, D12's
// per-NPC ask, D13's downstream chore.
//
// THE CLOSED-FORM RULE (D22). When the player sits, the game answers "who
// shows up in the next 45 minutes?" immediately — no ticks, no walk
// simulation, no real waiting. Confirmed guests are not rolled for at all:
// they said yes, so they are there. Everyone else is scored off the signal
// substrate, rolled once, and asked. From the player's side the whole thing
// resolves in the time it takes to open a window.
//
// SEATING ORDER IS LOAD-BEARING (D23). Invited guests are seated first and
// unconditionally, so a walk-in can never take a chair a confirmed guest was
// owed. Only the seats left over are offered to walk-ins.

// What is actually on the table, re-resolved against live stacks. `set_meal`
// recorded def ids only (SET_TABLE_SPREAD) and consumed nothing, so the food
// is still wherever it was — which means it can also be GONE, and a spread
// that half-vanished between laying and sitting is a real outcome the meal
// has to be able to describe rather than a bug to paper over.
//
// Returns the same { stack, def, from, sourceLabel, containerDef, day } rows
// edibleStacks yields, so every downstream consumer (taste bands, plate
// instances, freshness) reads exactly what a set_meal spread used to.
function resolveLaidSpread(gs, ctx) {
  const roomObjects = gs.objects?.[`room_${ctx.roomId}`] || {};
  const laidIds = tableSpreadIds(roomObjects);
  if (laidIds.length === 0) return { rows: [], laidIds, missing: [] };

  const available = edibleStacks(gs, ctx);
  const rows = [];
  const missing = [];
  // One row per laid dish, matched to a live stack that has not already been
  // claimed by an earlier dish of the same def.
  const claimed = new Set();
  for (const defId of laidIds) {
    const hit = available.find(o => o.stack.defId === defId && !claimed.has(o.stack)
      && stackServingsLeft(o.stack) > 0);
    if (hit) { claimed.add(hit.stack); rows.push(hit); }
    else missing.push(defId);
  }
  return { rows, laidIds, missing };
}

// The table's own object, in the room the meal is happening in. Same lookup
// buildSetMealEffects used, kept as one helper now that three callers want it.
function mealTableIn(gs, roomId) {
  return Object.values(gs.objects?.[`room_${roomId}`] || {})
    .find(o => o.defId === 'dining_table' || o.defId === 'kitchen_table') || null;
}

// D12/D23's guest list, resolved closed-form. PURE except for the rng it is
// handed — the roll is here, the scoring is overture.js's, and the writing is
// buildSitEffects'.
//
// Returns { confirmed, asked, seatsLeft, scheduled } where `asked` is the
// ordered list of walk-in candidates who rolled through and will actually put
// the question to the player. Nobody is seated by this function: an ask is a
// question, and D12 is explicit that joining is never an automatic seat.
function resolveSitGuestList(gs, roomId, rng) {
  const commitments = activeMealCommitmentsInRoom(gs, roomId);
  const scheduled = commitments.length > 0;

  // Confirmed guests: everyone who accepted a commitment active in this room
  // right now. D22 — they are not rolled for and not asked. They committed;
  // sitting down is when they turn up.
  const confirmedIds = [];
  for (const c of commitments) {
    for (const id of c.acceptedIds || []) {
      if (id !== 'player' && gs.npcs[id] && !confirmedIds.includes(id)) confirmedIds.push(id);
    }
  }
  // Anyone already standing in the room who is NOT on a commitment is not a
  // "walk-in" in the fiction — they are already here — but they still have to
  // ask, because D12 says joining is always an explicit ask. They are simply
  // the candidates with the strongest reach.
  const confirmed = confirmedIds.slice(0, SIT_TUNING.maxSeats - 1);

  // Seats: the player always has one. D23's cap counts them.
  let seatsLeft = Math.max(0, (SIT_TUNING.maxSeats - 1) - confirmed.length);
  if (seatsLeft === 0) {
    return { confirmed, asked: [], seatsLeft, scheduled, candidates: [] };
  }

  const candidates = mealJoinCandidates(gs, roomId, { exclude: confirmed, scheduled });
  const asked = [];
  for (const cand of candidates) {
    if (asked.length >= seatsLeft) break;
    if (rng() < cand.chance) asked.push(cand);
  }
  return { confirmed, asked, seatsLeft, scheduled, candidates };
}

// D12's per-NPC ask, as one beat inside the window. The DECISION that this
// person asks was made by resolveSitGuestList before we got here; this only
// puts the question and returns the answer.
//
// Returns true (yes), false (no), or null (the player closed the window) —
// and null aborts the whole action, because a closed window is not a "no" to
// a question the game has already committed to asking.
async function askJoinMeal(gs, npcId) {
  if (typeof presentActionStep !== 'function') return true;
  const npc = gs.npcs[npcId];
  const name = npc?.bible?.name || 'Someone';
  const answer = await presentActionStep(gs, {
    heading: name,
    // Deliberately does not END on the closing quote: render.js's shared
    // sentence() tests /[.!?]$/ and appends a period to anything else, so a
    // line finishing on a quote mark renders as `?".` — the trailing clause
    // is the smaller fix, and it keeps that helper out of scope.
    narration: `${name} appears in the doorway holding an empty plate. "Room for one more?" they ask`,
    cutout: { npcId, pose: 'standing', expression: 'talking' },
    defaultChoice: null,      // no quiet answer — a person is standing there
    choices: [
      { id: 'yes', label: `Pull out a chair`, tone: 'primary' },
      { id: 'no', label: `Not tonight`, tone: 'quiet' },
    ],
  });
  if (answer === null) return null;
  return answer === 'yes';
}

// D10's in-scene choice of what to eat from what is laid out. Rendered inside
// the same chrome as the asks, so the whole of `sit` happens in one frame
// rather than bouncing the player between a window and a modal.
//
// Returns the chosen INDEX into `rows`, or null if the window closed.
async function pickMealDish(rows, guestCount) {
  if (typeof presentActionStep !== 'function') return 0;
  const answer = await presentActionStep(currentGameState, {
    heading: 'What do you take?',
    narration: guestCount > 0
      ? 'The table is between you. You serve yourself first.'
      : 'Everything is still out. You pick.',
    defaultChoice: null,
    choices: rows.map((o, i) => ({
      id: String(i),
      label: stackLabel(o.stack),
      tone: i === 0 ? 'primary' : 'quiet',
    })),
  });
  if (answer === null) return null;
  const i = Number(answer);
  return Number.isFinite(i) ? i : 0;
}

// The interactive half (D2 — the existing interaction UI renders INSIDE the
// window's chrome). Two sub-steps, both of them the player answering rather
// than the game deciding:
//   1. one "Can I join you?" beat per walk-in who rolled through (D12), and
//   2. the in-scene choice of what to eat from what is laid out (D10),
//      offered only when there is more than one dish to choose between.
// Both run through ActionWindow's own step primitives, so a cancel at any
// point aborts the whole action the way every other picker in this file does.
async function prepareSit(ctx) {
  const gs = ctx.gameState;
  const { rows, missing } = resolveLaidSpread(gs, ctx);
  if (rows.length === 0) {
    return { cancelled: true, spread: [], guests: [], reason: 'nothing-left' };
  }

  const rng = seededRng(gs.meta?.seed, `sit_${gs.meta.clock.day}_${gs.meta.clock.minutes}`);
  const { confirmed, asked, scheduled, candidates } = resolveSitGuestList(gs, ctx.roomId, rng);

  // The asks, one beat at a time, inside the window (D2/D12). Declining costs
  // nothing beyond the seat — it is not an overture refusal and must not
  // spend D10's economy, because "not tonight, I'm eating" is not the same as
  // turning someone away who crossed a room to talk to you.
  const accepted = [];
  for (const cand of asked) {
    const yes = await askJoinMeal(gs, cand.npcId);
    if (yes === null) return { cancelled: true, spread: rows, guests: [] }; // window closed
    if (yes) accepted.push(cand.npcId);
  }

  const guests = [...confirmed, ...accepted];

  // D10's in-scene food choice. Only worth asking when there is a real choice
  // — one dish on the table is not a decision, it is dinner.
  let playerPick = rows[0];
  if (rows.length > 1) {
    const picked = await pickMealDish(rows, guests.length);
    if (picked === null) return { cancelled: true, spread: rows, guests };
    playerPick = rows[picked] || rows[0];
  }

  // Seat order: the player takes what they chose, then the guests round-robin
  // the rest. allocateSpread is reused unchanged — it is the same "everyone
  // takes one, round-robin across the dishes" rule set_meal proved out, only
  // now it starts from the dish the player actually picked.
  const ordered = [playerPick, ...rows.filter(r => r !== playerPick)];
  const eaters = ['player', ...guests];
  const servings = allocateSpread(ordered, eaters);
  const fedNpcIds = servings.filter(s => s.who !== 'player').map(s => s.who);

  const attendees = guests.map(id => ({ npcId: id, npc: gs.npcs[id], committed: confirmed.includes(id) }));
  return {
    spread: rows, ordered, servings, fedNpcIds, attendees, guests,
    confirmed, walkIns: accepted, scheduled, missing, playerPick,
    affection: presentResidentAffection(ctx),
    // Recorded for the handoff/audit trail: who was even in the running, and
    // with what chance. Never read by the effects — this is evidence, not input.
    candidateTrace: candidates.map(c => ({ npcId: c.npcId, chance: Math.round(c.chance * 1000) / 1000 })),
  };
}

// Every effect the meal applies. Structurally the old buildSetMealEffects,
// minus the lay-out writes (those already happened at set_meal) and plus
// D13's mess, which now lands HERE because the mess is made by eating rather
// than by putting food on a table.
function buildSitEffects(ctx, prepared) {
  const servings = prepared?.servings || [];
  if (servings.length === 0) return [];
  const spread = prepared?.ordered || prepared?.spread || [];
  const attendees = prepared?.attendees || [];
  const fedNpcIds = prepared?.fedNpcIds || [];
  const lines = [];

  // One EAT_ITEM per serving actually served, naming BOTH the dish and the
  // eater — unchanged from set_meal's proven shape. EAT_ITEM's `who` routes
  // the restore to their needs out of the real stack at the real per-serving
  // value; nothing is restored from nowhere.
  for (const s of servings) {
    lines.push(`EAT_ITEM ${s.defId} 1 ${s.from} ${s.who}`);
  }

  const quality = spreadQuality(spread);
  const moodByEater = new Map(servings.map(s => {
    const plate = s.stack?.meta?.plate;
    const mood = plate ? (plateMoodPerServing(s.stack) ?? 0) : (perServingConsumable(s.def).mood || 0);
    return [s.who, mood];
  }));
  // LIVE first, snapshot second. prepare() awaited up to four windows before
  // we got here, and executeAction's own comment says the continuous clock can
  // replace currentGameState across a gap that long — so an attendee's
  // relationship must be read off the object the effects are about to be
  // applied to, not off the one that existed before the player started
  // answering. `sit` awaits far longer than any other verb, which is what
  // makes the difference worth spending a lookup on.
  //
  // Declared BEFORE bandByEater: that line calls aOf, and a `const` referenced
  // from a hoisted function before its own declaration is a TDZ throw, not an
  // undefined.
  const liveGs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  function aOf(who) { return liveGs.npcs?.[who] || attendees.find(x => x.npcId === who)?.npc; }

  const bandByEater = new Map(servings.map(s => [s.who, tasteBandForStack(s.stack, npcTaste(aOf(s.who)))]));

  for (const a of attendees) {
    const npc = aOf(a.npcId);
    if (!npc) continue;   // they left the flat mid-meal; nothing to write
    const isFed = fedNpcIds.includes(a.npcId);
    const band = isFed ? (bandByEater.get(a.npcId) || 'neutral') : 'neutral';
    const bandRow = tasteBandRow(band);
    const moodBoost = (COMMITMENT_TUNING.attendeeMoodBonus + (isFed ? (moodByEater.get(a.npcId) || 0) : 0)) * bandRow.moodMult;
    if (moodBoost > 0) lines.push(`MOOD_DELTA ${a.npcId} +${Math.round(moodBoost * 100) / 100}`);
    lines.push(`ADJUST_NEED ${a.npcId} comfort +${COMMITMENT_TUNING.attendeeComfortRestore}`);
    const delta = Math.round(mealRelDelta(quality, npc, isFed) * bandRow.relMult * 1000) / 1000;
    if (delta > 0) lines.push(`REL_DELTA ${a.npcId} affection +${delta}`);
    if (isFed && COMMITMENT_TUNING.relationshipTensionRelief > 0) {
      lines.push(`REL_DELTA ${a.npcId} tension -${COMMITMENT_TUNING.relationshipTensionRelief}`);
    }
  }

  const commitmentBonus = prepared?.scheduled ? COMMITMENT_TUNING.settingBonusMood : 0;
  const affection = prepared?.affection ?? 0;
  const socialBonus = affection > 0 ? Math.round(affection * MOOD_TARGET.social.activityScale * 100) / 100 : 0;
  const playerBonus = Math.round((commitmentBonus + socialBonus) * 100) / 100;
  if (playerBonus > 0) lines.push(`ADJUST_NEED player mood +${playerBonus}`);

  // D13 — eating leaves a real mess, and it is the EXISTING mess: dish units
  // in the table's dish map (what self.dishes washes) plus the clutter state
  // (what container.clear-mess and the maid's cleanRoomObjects clear). No new
  // mess system, exactly as the decision requires. The clutter flag was
  // already set by set_meal; it is re-asserted here so a solo eater who never
  // laid a formal table still leaves one behind.
  //
  // The spread flag is CLEARED: the food has been eaten, so a table that goes
  // on claiming a spread would keep drawing dinner into the scene art long
  // after it was gone. Clearing it is also what makes `sit` un-repeatable
  // without laying the table again, which is the gate `tableIsLaid` reads.
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const table = mealTableIn(gs, gs.player.location);
  if (table) {
    for (const [dishType, qty] of Object.entries(DISH_TUNING.setMealFootprint)) {
      lines.push(`ADD_DISHES ${table.id} ${dishType} ${qty * servings.length}`);
    }
    lines.push(`SET_OBJECT_STATE ${table.id} clutter cluttered`);
    lines.push(`SET_TABLE_SPREAD ${table.id}`);
  }
  return lines;
}

function sitNarration(ctx, prepared) {
  const spread = prepared?.ordered || prepared?.spread || [];
  if (spread.length === 0) return 'You sit down, but the table is bare.';
  const attendees = prepared?.attendees || [];
  const names = attendees.map(a => ctx.gameState.npcs[a.npcId]?.bible?.name || 'a roommate');
  const mine = stackLabel(prepared?.playerPick?.stack || spread[0].stack).toLowerCase();

  // Something that was laid out is no longer there. Said first, because it is
  // the most surprising thing about sitting down.
  const raided = (prepared?.missing || []).length > 0
    ? ' Something you put out earlier has already gone.' : '';

  const tasteLines = sitTasteLines(ctx, prepared);
  const tasteTail = tasteLines.length > 0 ? ' ' + tasteLines.join(' ') : '';

  const unfed = attendees.length - (prepared?.fedNpcIds?.length || 0);
  if (names.length === 0) {
    // D10's quick solo beat. Deliberately short — it is a Tier C moment, not
    // a scene, and the mess it leaves is the part that matters afterward.
    return `You sit down and eat the ${mine} on your own.${raided} The plates stay where they are.`;
  }
  if (unfed > 0) {
    const shortNames = joinList(names.slice(-unfed));
    return `You sit down to ${mine} with ${joinList(names)}.${raided} There isn't enough to go round — ${shortNames} ${unfed > 1 ? 'end up' : 'ends up'} picking at an empty plate.${tasteTail}`;
  }
  // Someone invited themselves and you said yes. Worth its own clause,
  // because an evening you planned and an evening that happened to you are
  // different evenings — and the wording has to survive a MIXED list, where
  // some of the people at the table were expected and some just turned up.
  const walkIns = (prepared?.walkIns || []).length;
  const confirmedCount = (prepared?.confirmed || []).length;
  let uninvited = '';
  if (walkIns > 0) {
    const who = walkIns === 1
      ? (ctx.gameState.npcs[prepared.walkIns[0]]?.bible?.name || 'One of them')
      : `${walkIns} of them`;
    uninvited = confirmedCount > 0
      ? ` ${who} invited themselves, and the table is better for it.`
      : ` Nobody planned it, and it is better for that.`;
  }
  return `You sit down to ${mine} with ${joinList(names)}.${raided}${uninvited} It all tastes better for the company.${tasteTail}`;
}

// The same per-eater taste bands buildSitEffects scales its deltas by, said
// out loud — so the prose and the relationship change cannot disagree about
// what each guest got. Structurally setMealTasteLines, rehomed onto `sit`
// because `sit` is where anyone eats now.
function sitTasteLines(ctx, prepared) {
  const reactions = [];
  for (const s of prepared?.servings || []) {
    if (s.who === 'player') continue;
    const npc = ctx.gameState.npcs[s.who];
    if (!npc) continue;
    const row = tasteBandRow(tasteBandForStack(s.stack, npcTaste(npc)));
    if (!row?.reaction) continue;
    reactions.push(row.reaction.replace('{name}', npc.bible?.name || 'They'));
  }
  return reactions;
}

// D10's shared-meal scene resolves into a real conversation, or into nothing.
// Returns null when nobody came — and a null choice list is what makes the
// solo beat a plain tap-to-continue (D1) rather than a menu with one item.
//
// One choice per guest, because "who do you actually talk to" is a decision
// the player makes about a specific person, not a generic "chat" verb. Each
// carries handoff: true, so dismissing through it cross-fades into the
// conversation instead of snapping shut (D6 via D20 — the window performs the
// transition, sitWindowDismiss below supplies the destination).
function sitWindowChoices(view) {
  const guests = (view.prepared && view.prepared.guests) || [];
  if (guests.length === 0) return null;
  const gs = view.gs;
  const rows = guests.map(id => ({
    id: `talk:${id}`,
    label: `Talk to ${gs?.npcs?.[id]?.bible?.name || 'them'}`,
    tone: 'primary',
    handoff: true,
  }));
  rows.push({ id: 'done', label: 'Finish up', tone: 'quiet' });
  return rows;
}

// Dream Engine Phase 7 (D16): a nap dreams too, differently — a single-panel
// fragment form at DREAM_TUNING.napChanceMult of the night rate, out of the
// queue's own nap slot (D36). Same D20 split as sitWindowDismiss below: the
// window transitioned, and where it lands is the verb's business. Everything
// this decides is "was there a nap dream", and even that is asked of dreams.js.
//
// Un-guarded on the reason: any dismissal of the nap window means the nap
// happened, and there is no choice on it to branch over.
async function napWindowDismiss() {
  if (typeof presentDreamForSleep === 'function') await presentDreamForSleep('nap');
}

// The DESTINATION half of D20's split, and it lives here in the verb's own
// file rather than in actionwindow.js — the window transitions, the verb
// decides where to. Reads the id the player pressed; anything that is not a
// talk choice is a plain close.
async function sitWindowDismiss(view, reason) {
  if (typeof reason !== 'string' || !reason.startsWith('talk:')) return;
  const npcId = reason.slice('talk:'.length);
  if (!npcId || !view.gs?.npcs?.[npcId]) return;
  if (typeof doTalk === 'function') await doTalk(npcId);
}

// D5's instance image. The frame is worth generating because THIS table, with
// THESE people at it, is the point — so the subject carries the guest list and
// the clock stamp, exactly the way self.eat's does for its dish.
function sitWindowSubject(view) {
  const p = view.prepared || {};
  const clock = view.gs?.meta?.clock || {};
  const who = (p.guests || []).slice().sort().join('-') || 'alone';
  return `${who}-d${clock.day || 0}m${Math.floor(clock.minutes || 0)}`;
}

function sitWindowPhrase(view) {
  const p = view.prepared || {};
  const gs = view.gs;
  const dishes = (p.ordered || p.spread || [])
    .map(o => stackLabel(o.stack).toLowerCase()).slice(0, 3);
  const food = dishes.length ? dishes.join(' and ') : 'a plate of food';
  const names = (p.guests || []).map(id => gs?.npcs?.[id]?.bible?.name).filter(Boolean);
  if (names.length === 0) {
    return `one person eating alone at a laid table, ${food} in front of them, the other chairs empty`;
  }
  return `${names.length + 1} people seated around a table sharing a meal, ${food} laid out between them, mid-conversation`;
}

// --- Action outcome window Phase 6 (the long tail) ---------------------------
// The shared instance-subject/phrase builders for the verbs whose frame is
// genuinely THIS occurrence (which dish, which partner, which outfit). Same
// contract Phase 1's eatWindowSubject/eatWindowPhrase established: the
// discriminator varies per occurrence and the phrase is authored HERE, in the
// verb's file, never in actionwindow.js (Design invariant 1). All PURE
// reads of the view.
function actionWindowClockStamp(view) {
  const clock = view?.gs?.meta?.clock || {};
  return `d${clock.day || 0}m${Math.floor(clock.minutes || 0)}`;
}
function actionWindowSlug(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}
// The partner in a paired act is result.shared.withIds[0] — the Make-a-Move
// picker's explicit choice, threaded through resolveSharedActivity.
function intimacyPartner(view) {
  const id = view?.result?.shared?.withIds?.[0];
  return (id && view?.gs?.npcs?.[id]) || null;
}
function intimacyPartnerName(view) {
  const p = intimacyPartner(view);
  return p?.bible?.name || 'them';
}
function intimacyWindowSubject(view) {
  return `${actionWindowSlug(intimacyPartnerName(view)) || 'partner'}-${actionWindowClockStamp(view)}`;
}
// self.cook's fresh plate frame — which dish and how it turned out.
function cookWindowSubject(view) {
  return `${actionWindowSlug(view?.prepared?.recipe?.label) || 'meal'}-${actionWindowClockStamp(view)}`;
}
function cookWindowPhrase(view) {
  const label = (view?.prepared?.recipe?.label || 'a meal').toLowerCase();
  const grade = view?.prepared?.plate?.grade;
  return `serving up a freshly cooked ${label}${grade ? `, turned out ${grade}` : ''}, a plated dish in front of them, the kitchen warm and smelling of it`;
}
// The reheat frame — the specific leftover being warmed through.
function reheatWindowSubject(view) {
  const label = view?.prepared?.option ? stackLabel(view.prepared.option.stack) : '';
  return `${actionWindowSlug(label) || 'reheat'}-${actionWindowClockStamp(view)}`;
}
function reheatWindowPhrase(view) {
  const label = view?.prepared?.option ? stackLabel(view.prepared.option.stack).toLowerCase() : 'leftovers';
  return `reheating ${label} on the stove, steam rising off the pan`;
}
function microwaveWindowPhrase(view) {
  const label = view?.prepared?.option ? stackLabel(view.prepared.option.stack).toLowerCase() : 'leftovers';
  return `pulling a steaming plate of ${label} from the microwave`;
}
// The wardrobe frame — the freshly chosen fit, keyed so each outfit keeps
// its own frame rather than one shared "changed clothes" picture.
function changeOutfitWindowSubject(view) {
  const outfit = view?.prepared?.outfit || {};
  const bits = Object.values(outfit).filter(Boolean).slice(0, 2).map(actionWindowSlug);
  return `${bits.join('-') || 'outfit'}-${actionWindowClockStamp(view)}`;
}
function changeOutfitWindowPhrase(view) {
  return 'freshly changed into a new outfit, adjusting the clothes, a little more put-together than before';
}
function masturbateWindowPhrase(view) {
  return 'a quiet, private moment alone, alone with their thoughts';
}
function quickieWindowPhrase(view) {
  return `a quick, breathless intimate moment with ${intimacyPartnerName(view)}, close and unselfconscious`;
}
function sexWindowPhrase(view) {
  return `making love with ${intimacyPartnerName(view)} in a private room, tangled together, the room warm`;
}
function cuddleWindowPhrase(view) {
  return `curled up and holding ${intimacyPartnerName(view)}, at ease and close`;
}
function shareShowerWindowPhrase(view) {
  return `sharing a warm shower with ${intimacyPartnerName(view)}, taking turns under the water`;
}

// --- self.dishes' runtime logic (food-overhaul Phase 4, D9/D11) ---
// Dish dirt is a per-type MAP now, so "how dirty" means dish UNITS in the
// wash scope (the sink + the kitchen/dining tables) rather than the old
// sink-state enum ladder. prepare() measures the scope and the action's
// skill-scaled hand-wash capacity; buildEffects clears up to that capacity
// (CLEAN_DISHES per scope object, sink first); time cost scales per unit
// (perDishUnit in resolveTimeCost) and shrinks with cleaning skill.
//
// The wash scope spans the kitchen AND dining rooms on purpose: eating
// leaves dishes on the table, and "do the dishes" is the single chore that
// clears them all — the same kitchen+dining reach the cook/eat pipelines
// already use (kitchenContainers' dining fallback).
function dirtyDishObjs(gs) {
  const ids = new Set();
  for (const r of ['kitchen', 'dining']) {
    for (const o of Object.values(gs?.objects?.[`room_${r}`] || {})) {
      if (o.defId === 'sink_kitchen' || o.defId === 'kitchen_table' || o.defId === 'dining_table') ids.add(o.id);
    }
  }
  const objs = [];
  for (const bucket of Object.values(gs?.objects || {})) {
    for (const o of Object.values(bucket || {})) if (ids.has(o.id)) objs.push(o);
  }
  return objs;
}
function dirtyDishScope(gs, roomId) {
  const objs = dirtyDishObjs(gs);
  const units = objs.reduce((sum, o) => sum + dishUnitsOf(o), 0);
  return { objs, units, map: dishMapAcross(objs) };
}

function prepareDishes(ctx) {
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const scope = dirtyDishScope(gs, ctx.roomId);
  const capacity = handWashUnitsFor(gs?.player);
  const units = Math.min(capacity, scope.units);
  // scopeUnits is the scope's TOTAL dirty units (prepared.units is the
  // action's washed capacity, which collides with the spread scope.units) —
  // dishesNarration compares them to say whether every dish got washed.
  return { ...scope, scopeUnits: scope.units, capacity, units, dirty: scope.units > 0 ? (scope.units >= DISH_TUNING.sinkDirtyAtMany ? 2 : 1) : 0 };
}

function buildDishesEffects(ctx, prepared) {
  if (!prepared?.units || prepared.units <= 0) return [];
  // Allocate the action's capacity across the scope objects, sink first
  // (the pot blocks the basin), so each CLEAN_DISHES clears exactly what
  // this action can reach and the rest waits for the next wash.
  const lines = [];
  let remaining = prepared.units;
  const ordered = (prepared.objs || []).slice()
    .sort((a, b) => ((a.defId === 'sink_kitchen' ? 0 : 1) - (b.defId === 'sink_kitchen' ? 0 : 1)));
  for (const obj of ordered) {
    if (remaining <= 0) break;
    const have = dishUnitsOf(obj);
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    lines.push(`CLEAN_DISHES ${obj.id} ${take}`);
    remaining -= take;
  }
  lines.push(`ADJUST_NEED player mood +${ACTION_TUNING.dishesMoodGain}`);
  return lines;
}

function dishesNarration(ctx, prepared) {
  if (!prepared?.units || prepared.units <= 0) return 'The dishes are already clean.';
  const summary = dishSummary(prepared.map);
  if (prepared.units >= prepared.scopeUnits) return `You wash every last ${summary} until the sink is spotless. Satisfying.`;
  return `You work through the ${summary}. The pile is smaller now.`;
}

// --- self.dishwasher's runtime logic (food-overhaul Phase 4, D11) ---
// prepare() resolves a completed cycle (a finished machine frees up), reads
// the tier-scaled capacity vs the sink/table load, and computes how many
// units this load will move; buildEffects loads and starts the cycle. The
// cycle itself completes lazily against the continuous clock (ITEMS'
// dishwasherCycleProgress) — no per-tick bookkeeping.
function prepareDishwasher(ctx) {
  const gs = (typeof currentGameState !== 'undefined' && currentGameState) || ctx.gameState;
  const dw = findObjectInRoom(ctx, 'dishwasher');
  if (!dw) return { cancelled: true, reason: 'no-dishwasher' };
  const now = gameDaysNow(gs?.meta?.clock);
  resolveDishwasherCycle(dw, now); // a finished cycle frees the machine (write path)
  if (dishwasherCycleProgress(dw, now) === 'running') return { cancelled: true, reason: 'mid-cycle' };
  const scope = dirtyDishScope(gs, ctx.roomId);
  const capacity = dishwasherCapacityUnits(gs);
  const loaded = dishwasherLoadUnits(dw);
  const free = Math.max(0, capacity - loaded);
  const units = Math.min(free, scope.units);
  if (units <= 0) return { cancelled: true, reason: 'nothing-to-load' };
  return { dishwasher: dw, units, capacity, loaded, scopeUnits: scope.units, map: scope.map };
}

function buildDishwasherEffects(ctx, prepared) {
  if (!prepared?.units || !prepared.dishwasher) return [];
  return [
    `LOAD_DISHWASHER ${prepared.dishwasher.id} ${prepared.units}`,
    `RUN_DISHWASHER ${prepared.dishwasher.id}`,
  ];
}

function dishwasherNarration(ctx, prepared) {
  if (!prepared?.units || !prepared.dishwasher) return 'The dishwasher is empty of dishes to load.';
  const summary = dishSummary(prepared.map);
  const done = prepared.units >= (prepared.scopeUnits || 0) ? ' everything' : '';
  return `You stack${done} the ${summary} into the dishwasher and start it. It hums to life.`;
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
