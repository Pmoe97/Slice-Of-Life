// ===== SECTION: ACTIONS =====
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
  if (def.source.kind === 'object') return !!findObjectInRoom(ctx, def.source.objDef);
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

  const prepared = def.prepare ? def.prepare(ctx) : null;
  const effectLines = def.buildEffects ? def.buildEffects(ctx, prepared) : [...(def.effects || [])];
  // Skill XP is declarative (def.skill), not something buildEffects has to
  // remember to emit itself — checkRequirements already guaranteed the
  // action is actually happening by the time we get here, so awarding it
  // unconditionally is correct, not a "gained XP for nothing" risk.
  if (def.skill) effectLines.push(`ADD_SKILL_XP ${def.skill.id} ${def.skill.xp}`);
  const effects = effectLines.map(line => parseEffectDSL(line)[0]).filter(Boolean);
  const effCtx = buildEffectContext(gameState, [], ctx.presentNpcIds, ctx.roomObjects, gameState.player.inventory || []);
  applyEffects(effects, effCtx);

  const ticks = resolveTimeCost(def, gameState);
  await advanceAndResolve(ticks);
  gameState.player = decayPlayerNeeds(gameState.player, ticks);

  return { ok: true, ticksSpent: ticks, narration: narrateAction(def, ctx, prepared) };
}

// Base time cost, optionally shrunk by a skill curve (SKILLS) — declaring
// `timeCost.skill`/`timeCost.curve` on any ACTION_DEFS entry is enough to
// make it faster with practice; nothing else needs to change per-action.
function resolveTimeCost(def, gameState) {
  const base = def.timeCost?.base ?? 1;
  if (!def.timeCost?.skill || !def.timeCost?.curve) return Math.max(1, base);
  const mod = skillMod(gameState.player, def.timeCost.skill, def.timeCost.curve);
  return Math.max(def.timeCost.min || 1, Math.round(base * mod));
}

function narrateAction(def, ctx, prepared) {
  if (def.narration?.mode === 'dynamic' && def.narration.build) return def.narration.build(ctx, prepared);
  const templates = def.narration?.templates || ['You do it.'];
  return templates[Math.floor(Math.random() * templates.length)];
}

// --- UI-facing wrapper: mirrors the existing doX() convention (loading
// state, render, save-at-boundary) so a registered action is a drop-in
// replacement for a hand-written doX(). Called from UI's handleAction. ---
async function runRegisteredAction(actionId) {
  showLoading();
  try {
    const result = await executeAction(actionId, currentGameState);
    if (!result.ok) { addLogEntry('system', result.reason || "You can't do that right now."); return; }
    addLogEntry('narration', result.narration);
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
