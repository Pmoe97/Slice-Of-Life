// ===== SECTION: ACTIONS =====
// (Apartment Expansion v2 — Mirrored H)
// The action engine: data (DEFS.ACTIONS) -> resolution -> execution. This
// is the chokepoint that starts replacing the old hardcoded switch (UI's
// handleAction) and if-chain (RENDER's renderActionChips) for any verb
// registered in ACTION_DEFS. Verbs not yet ported (sleep/work/talk/move/
// pay-rent/ask-to-leave) keep their existing UI.js implementations — see
// DEFS.ACTIONS' file header for why.

// --- Availability: which registered actions can be taken right now ---
function resolveAvailableActions(gameState) {
  const ctx = buildActionContext(gameState);
  const out = [];
  for (const def of Object.values(ACTION_DEFS)) {
    if (!actionSourceMatches(def, ctx)) continue;
    const check = checkRequirements(def, ctx);
    out.push({ actionId: def.id, label: def.label, group: def.group, chipPriority: def.chipPriority || 0, ok: check.ok, reason: check.reason });
  }
  return out.sort((a, b) => (b.chipPriority || 0) - (a.chipPriority || 0));
}

function actionSourceMatches(def, ctx) {
  if (def.source.kind === 'room') return def.source.roomIds.includes(ctx.gameState.player.location);
  if (def.source.kind === 'self') return true;
  if (def.source.kind === 'object') {
    if (Array.isArray(def.source.objDefs)) return def.source.objDefs.some(d => !!findObjectInRoom(ctx, d));
    return !!findObjectInRoom(ctx, def.source.objDef);
  }
  return false; // 'npc'/'item'/'app' sources arrive in later phases
}

function buildActionContext(gameState) {
  const roomId = gameState.player.location;
  const roomObjects = (gameState.objects && gameState.objects[`room_${roomId}`]) || {};
  return { gameState, presentNpcIds: getPresentNpcIds(gameState.npcs, roomId), roomId, roomObjects };
}

// Find the (first) instance of a given OBJECT_DEFS id in the current room
// — used both for source:'object' availability and by action-specific
// prepare()/buildEffects() logic (e.g. self.cook finding the stove/fridge/
// pantry it needs). Rooms never hold two instances of the same def today,
// so "first" is unambiguous.
function findObjectInRoom(ctx, defId) {
  return Object.values(ctx.roomObjects).find(o => o.defId === defId) || null;
}

// --- Requirement checking (mirrors SIM's CAST_REQUIREMENT_CHECKERS: a
// config-declared list of requirement names against a name→predicate
// registry, so extending `requires` is a data change, not a code change). ---
function checkRequirements(def, ctx) {
  for (const rule of def.requires || []) {
    const [name, ...args] = rule.split(':');
    const checker = ACTION_REQUIREMENT_CHECKERS[name];
    if (!checker) { console.warn(`Unknown action requirement checker: ${name}`); continue; }
    const result = checker(ctx, ...args);
    if (result !== true) return { ok: false, reason: result };
  }
  return { ok: true, reason: null };
}

// --- executeAction: the single chokepoint for a registered verb.
// Decomposed into named steps to respect the 40-line-per-function
// convention. Applies effects directly via applyEffects, bypassing
// validateEffects — this is the trusted-producer path (see EFFECTS' file
// header): the effect list is config-authored (even when computed at
// runtime by buildEffects), not user input, so the LLM-facing magnitude
// caps don't apply to it.
//
// `def.prepare(ctx)` (optional) computes shared runtime data ONCE — e.g.
// self.cook picking which recipe is actually available — and passes the
// result to both `buildEffects` and a dynamic narration builder, so the
// same recipe pick can't disagree between what happened and what got
// said about it. Actions that don't need this (the four simple ones)
// leave `prepare`/`buildEffects` unset and keep using the static
// `effects`/`narration.templates` shape from P0. ---
async function executeAction(actionId, gameState) {
  const def = ACTION_DEFS[actionId];
  if (!def) return { ok: false, reason: 'Unknown action.' };
  const ctx = buildActionContext(gameState);

  const check = checkRequirements(def, ctx);
  if (!check.ok) return { ok: false, reason: check.reason, ticksSpent: 0 };

  const prepared = def.prepare ? await def.prepare(ctx) : null;
  // A prepare() that presented a choice and got cancelled (self.cook's
  // recipe picker) must abort the whole action before any effects, time,
  // or ingredient consumption happens — executeAction returns a cancelled
  // result and the caller (runRegisteredAction) exits silently.
  if (prepared && prepared.cancelled) return { ok: false, reason: null, cancelled: true, ticksSpent: 0 };
  const effectLines = def.buildEffects ? def.buildEffects(ctx, prepared) : [...(def.effects || [])];
  // Skill XP is declarative (def.skill), not something buildEffects has to
  // remember to emit itself — checkRequirements already guaranteed the
  // action is actually happening by the time we get here, so awarding it
  // unconditionally is correct, not a "gained XP for nothing" risk.
  if (def.skill) effectLines.push(`ADD_SKILL_XP ${def.skill.id} ${def.skill.xp}`);
  const effects = effectLines.map(line => parseEffectDSL(line)[0]).filter(Boolean);
  const effCtx = buildEffectContext(gameState, [], ctx.presentNpcIds, ctx.roomObjects, gameState.player.inventory || []);
  applyEffects(effects, effCtx);

  // Phase 7 (D7): an action that dirtied a room's objects (SET_OBJECT_STATE
  // on a dirtyWhen-carrying object — cooking a stove, a shared meal on the
  // dining table) must recompute the room's DERIVED cleanliness. This is
  // the refresh hook the WORLD doc planned for P2 but that was never
  // wired — without it a dirty table LOOKS cluttered but the room still
  // reads clean to the mood/cleanliness systems. Scoped to the rooms the
  // action actually touched, deduped (a meal that dirties one object is
  // one recompute, not N).
  const touchedRooms = new Set();
  for (const eff of effects) {
    if (eff.type === 'SET_OBJECT_STATE') {
      const obj = findObjectById(gameState, eff.params?.objId);
      if (obj && obj.bucket?.startsWith('room_')) touchedRooms.add(obj.bucket.slice('room_'.length));
    }
  }
  for (const roomId of touchedRooms) refreshRoomCleanliness(gameState, roomId);

  // Phase 5: meter utility usage for actions that consume utilities. The
  // `meters` field on an ACTION_DEFS entry is a list of [meterKey, amount]
  // pairs — e.g. self.shower meters water + water heating. This is the
  // player-side metering; NPC drives meter in drives.js.
  if (def.meters) {
    for (const [key, amt] of def.meters) {
      recordUtilityUsage(gameState, key, amt);
    }
  }

  // Perception plan Phase 3: the player is audible too. Same declarative
  // `emitsSignal: { signal, intensity }` field the DRIVE_DEFS entries carry,
  // so an NPC showering and the player showering produce the same sound —
  // which is what Plan 3 needs in order for an NPC to react to the player
  // being somewhere without a bespoke check for each case.
  if (def.emitsSignal) {
    emitTransient(gameState, {
      id: def.emitsSignal.signal,
      roomId: gameState.player.location,
      intensity: def.emitsSignal.intensity,
      sourceId: 'player',
    });
  }

  // Phase 9: decay facility condition for gated actions. Find which
  // facility this action requires and decay it. A tier drop is rare
  // (condition starts at 100, decays 1.5/use) but when it happens the
  // action may stop being available until the facility is repaired.
  if (def.requires) {
    for (const req of def.requires) {
      if (typeof req !== 'string') continue;
      if (req.startsWith('facilityFunctional:')) {
        // Direct facility reference: 'facilityFunctional:kitchen_stove'
        const facilityId = req.split(':')[1];
        const dropped = decayFacilityCondition(gameState, facilityId);
        if (dropped) {
          const facDef = FACILITY_DEFS[facilityId];
          addLogEntry('system', `The ${facDef?.label || facilityId} has worn out and needs repair.`);
        }
      } else if (req.startsWith('facilityFunctionalHere:')) {
        // Room-inferred facility: 'facilityFunctionalHere:self.shower'
        // Look up which facility in the player's current room gates
        // this action, and decay that facility.
        const actionId = req.split(':')[1];
        const roomId = gameState.player.location;
        const facilityIds = (typeof ROOM_FACILITIES !== 'undefined' && ROOM_FACILITIES[roomId]) || [];
        for (const fid of facilityIds) {
          const facDef = FACILITY_DEFS[fid];
          if (!facDef?.gatesActions?.includes(actionId)) continue;
          const dropped = decayFacilityCondition(gameState, fid);
          if (dropped) {
            addLogEntry('system', `The ${facDef.label} has worn out and needs repair.`);
          }
          break; // only decay the first matching facility
        }
      }
    }
  }

  const minutes = resolveTimeCost(def, gameState, prepared);

  // Declaring `vulnerableState` on an action is all it takes for the NPC
  // peep system (DRIVES/STEALTH) to be able to catch the player mid-action:
  // the flag is live for exactly the ticks this action resolves, which is
  // the window during which the player is actually exposed. Cleared in a
  // finally so a throw mid-resolve can't strand the player permanently
  // "showering" — the failure mode the old location-inference version had
  // by construction.
  const ticks = await withVulnerableState(gameState, def.vulnerableState, () => advanceAndResolveMinutes(minutes));

  return { ok: true, ticksSpent: ticks, minutesSpent: minutes, narration: narrateAction(def, ctx, prepared) };
}

// Runs `fn` with gameState.player.flags._vulnerableState set, restoring
// whatever was there before (normally nothing) afterward. A null/undefined
// state is a no-op passthrough, so non-private actions pay nothing.
async function withVulnerableState(gameState, state, fn) {
  if (!state) return fn();
  const flags = gameState.player.flags || (gameState.player.flags = {});
  const previous = flags._vulnerableState;
  flags._vulnerableState = state;
  try {
    return await fn();
  } finally {
    // currentGameState may have been replaced by resolveBatch during fn,
    // so restore on the live player object, not the captured one.
    const liveFlags = (typeof currentGameState !== 'undefined' && currentGameState?.player?.flags) || flags;
    if (previous === undefined) delete liveFlags._vulnerableState;
    else liveFlags._vulnerableState = previous;
  }
}

// Base time cost in game-minutes. Supports:
// - `base` (number): flat minutes (legacy: if the whole timeCost is a
//   bare number, it's minutes)
// - `byItemCategory` (true): the picked item's category via
//   INVENTORY_TUNING.useTimeMinutes (Phase 3 self.eat — the item is in
//   `prepared.option.def`)
// - `skill`/`curve` (string): shrinks the base by a skill curve — e.g.
//   { base: 20, skill: 'cooking', curve: 'timeReduction', min: 15 }
//   means 20 min minus up to 50% at max cooking level, floored at 15
// - `perIngredient` (number): adds N minutes per ingredient in the recipe
//   picked by `prepare()` (the prepared result must include `recipe`)
// - `perDirtyDish` (number): adds N minutes per dirty-dish level — reads
//   the sink's dishes state ('clean'=0, 'few'=1, 'many'=2)
// - `max`/`min` (number): clamp
// `prepare()` data (prepared) is passed as the 3rd arg so perIngredient
// can read the recipe pick.
//
// `skillBonus`/`skillId` (a flat per-level delta) and `compute` (an escape
// hatch taking a function) were declared here and used by no action.
// skillBonus was a second, weaker way to say what skill/curve already says,
// and `compute` put a function in what is otherwise pure data — the thing
// this whole registry exists to avoid. Both removed; add them back if a
// real action needs them.
function resolveTimeCost(def, gameState, prepared) {
  const tc = def.timeCost;
  if (typeof tc === 'number') return Math.max(1, tc);
  let minutes = tc.base ?? 0;

  // Inventory overhaul Phase 3: self.eat's time is the eaten item's
  // category — drink 5 / snack 10 / food 10 / full meal 25 — reading
  // INVENTORY_TUNING.useTimeMinutes, the SAME table the inventory
  // panel's Use verb reads, so the Eat chip and the panel can never
  // disagree about how long eating takes.
  if (tc.byItemCategory && prepared?.option?.def) {
    minutes = INVENTORY_TUNING.useTimeMinutes[prepared.option.def.category] ?? INVENTORY_TUNING.useTimeMinutes._default;
  }

  if (tc.perIngredient && prepared?.recipe) {
    minutes += (prepared.recipe.ingredients?.length || 0) * tc.perIngredient;
  }
  if (tc.perDirtyDish) {
    const sink = Object.values((gameState.objects && gameState.objects['room_kitchen']) || {})
      .find(o => o.defId === 'sink_kitchen');
    const dishLevel = sink?.state?.dishes;
    const level = dishLevel === 'many' ? 2 : dishLevel === 'few' ? 1 : 0;
    minutes += level * tc.perDirtyDish;
  }
  if (tc.skill && tc.curve) {
    const mod = skillMod(gameState.player, tc.skill, tc.curve);
    minutes = minutes * mod;
  }

  if (tc.max != null) minutes = Math.min(minutes, tc.max);
  if (tc.min != null) minutes = Math.max(minutes, tc.min);
  return Math.max(1, Math.round(minutes));
}

function narrateAction(def, ctx, prepared) {
  if (def.narration?.mode === 'dynamic' && def.narration.build) return def.narration.build(ctx, prepared);
  const templates = def.narration?.templates || ['You do it.'];
  return templates[Math.floor(orbitalRandom() * templates.length)];
}

// --- UI-facing wrapper: mirrors the existing doX() convention (loading
// state, render, save-at-boundary) so a registered action is a drop-in
// replacement for a hand-written doX(). Called from UI's handleAction. ---
async function runRegisteredAction(actionId) {
  showLoading();
  // Phase 7 (D7): a set_meal that HAPPENED is the moment a scheduled meal
  // commitment in the player's room becomes 'held' — captured BEFORE the
  // action so a late dinner that ends just past the window still counts
  // (executeAction advances the clock by the action's minutes). Eating a
  // solo snack in the dining room during someone's dinner window is NOT
  // the same thing, so only set_meal marks.
  const mealCommitments = actionId === 'set_meal'
    ? activeMealCommitmentsInRoom(currentGameState, currentGameState.player.location)
    : [];
  try {
    const result = await executeAction(actionId, currentGameState);
    // A cancelled choice (e.g. closing the recipe picker) aborts silently —
    // no system-log line, no narration, no save.
    if (result.cancelled) return;
    if (!result.ok) { addLogEntry('system', result.reason || "You can't do that right now."); return; }
    addLogEntry('narration', result.narration);
    if (actionId === 'set_meal') {
      for (const c of mealCommitments) c.status = 'held';
    }
    // Phase 8: working out grows the energy ceiling (energyMax). This is
    // the exercise path to a higher daily work capacity — the other path
    // is sleep consistency (handled in doSleep).
    if (actionId === 'self.workout' && currentGameState.player.energyMax) {
      currentGameState.player.energyMax = Math.min(
        ENERGY.absoluteMax,
        currentGameState.player.energyMax + ENERGY.growthPerWorkout
      );
    }
    // Chain quest progress: check if this action type completes a step
    const def = ACTION_DEFS[actionId];
    const actionType = actionId.split('.').pop();
    if (actionType === 'cook' || actionType === 'watch_tv') {
      // Check all NPCs for chain quests with matching steps
      for (const npcId of Object.keys(currentGameState.npcs)) {
        checkChainQuestProgress(actionType, npcId);
      }
    }
    render(currentGameState, currentSceneState);
    await saveAtBoundary(actionId, currentGameState);
  } finally {
    hideLoading();
  }
}

// ===== /SECTION: ACTIONS =====
