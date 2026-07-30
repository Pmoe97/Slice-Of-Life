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
  return false; // 'object'/'npc'/'item'/'app' sources arrive in later phases
}

function buildActionContext(gameState) {
  const roomId = gameState.player.location;
  return { gameState, presentNpcIds: getPresentNpcIds(gameState.npcs, roomId), roomId };
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
// convention. Applies def.effects directly via applyEffects, bypassing
// validateEffects — this is the trusted-producer path (see EFFECTS' file
// header): the effect list is config-authored, not user input, so the
// LLM-facing magnitude caps don't apply to it. ---
async function executeAction(actionId, gameState) {
  const def = ACTION_DEFS[actionId];
  if (!def) return { ok: false, reason: 'Unknown action.' };
  const ctx = buildActionContext(gameState);

  const check = checkRequirements(def, ctx);
  if (!check.ok) return { ok: false, reason: check.reason, ticksSpent: 0 };

  const effects = (def.effects || []).map(line => parseEffectDSL(line)[0]).filter(Boolean);
  const roomObjects = (gameState.objects && gameState.objects[`room_${ctx.roomId}`]) || {};
  const effCtx = buildEffectContext(gameState, [], ctx.presentNpcIds, roomObjects, gameState.player.inventory || []);
  applyEffects(effects, effCtx);

  const ticks = def.timeCost?.base ?? 1;
  await advanceAndResolve(ticks);
  gameState.player = decayPlayerNeeds(gameState.player, ticks);

  return { ok: true, ticksSpent: ticks, narration: narrateAction(def) };
}

function narrateAction(def) {
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
    render(currentGameState, currentSceneState);
    await saveAtBoundary(actionId, currentGameState);
  } finally {
    hideLoading();
  }
}

// ===== /SECTION: ACTIONS =====
