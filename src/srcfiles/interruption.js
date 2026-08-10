// ===== SECTION: INTERRUPTION =====
// Phase 5: personality-driven, AI-generated "walked in on" events.
// When the player cums (Phase 3's doAfterHoursCum), the system rolls an
// interruption check per eligible NPC. If it succeeds, an NPC walks in on
// the player. The NPC's line is AI-generated with full context
// (personality, relationship, what the player is watching, door state)
// and pre-generated in the background so it appears instantly.
//
// The bubble is DOM-injected, NOT part of the normal render cycle —
// render() → renderComputerScreen() → renderWindows() does
// body.innerHTML='' on every window body, which would wipe a
// render-attached bubble. The bubble is created via direct DOM
// manipulation, appended to #computer-screen (which persists across
// re-renders — only its children's innerHTML is rebuilt), and removed
// on dismiss.
//
// Background pre-generation: when the player enters the masturbating
// state (doAfterHoursMasturbate), we immediately start a background
// generateText call for the top interruption candidate. When "Cum" is
// clicked and the roll succeeds for that NPC, text is ready — the bubble
// appears instantly. If a different NPC wins the roll, fall back to
// on-demand generation with a "footsteps..." narration beat to cover
// the ~1s latency.

// --- Pending pre-generated interruption (module-level, ephemeral) ---
// Set by startInterruptionPreGeneration, consumed/cleared by rollInterruption.
let pendingInterruption = null;
// { npcId, text, doorState, clipTitle, clipCategory }

// What the player was (last) watching, for interruption flavour — the active
// clip's title when one is loaded, else the most recent entry in the
// persisted AfterHours history (Phase 6), else a bland placeholder. Read at
// runtime only (afterhours.js loads after this file), so the world store is
// always available here.
function interruptionClipTitle(gameState) {
  const browser = gameState?.world?.computer?.apps?.browser;
  const clip = (browser?.afterHoursClips || []).find(c => c.id === browser?.afterHoursWatching);
  if (clip?.title) return clip.title;
  const history = gameState?.world?.afterHours?.history;
  if (Array.isArray(history) && history[0]?.title) return history[0].title;
  return 'something';
}

// --- Eligibility: which NPCs can interrupt? ---
// An NPC is eligible if they're a current resident, currently in the
// apartment (location !== null), and not asleep. AfterHours Phase 8 also
// admits SOCIAL visitors inside their active visit window (invited Hot
// Singles, roommates' friends): they're physically in the apartment and
// awake, and a deviant Hot Single you've invited over is precisely the
// person the Phase 8 interruption scaling is for. Scoped to purpose
// 'social' on purpose — maids, contractors, delivery drivers, and escorts
// are on the clock, not wandering.
function getEligibleNpcs(gameState) {
  const playerRoom = gameState.player.location;
  const socialVisitorIds = new Set(
    getActiveVisits(gameState)
      .filter(v => v.purpose === 'social' && v.npcId)
      .map(v => v.npcId)
  );
  return Object.entries(gameState.npcs).filter(([id, npc]) => {
    if (socialVisitorIds.has(id)) {
      // A resident never resolves as a visitor (resolveTick excludes them),
      // but guard anyway. Present, not already in the player's room.
      if (npc.residency.status === 'resident') return false;
      if (!npc.location) return false;
      if (npc.location === playerRoom) return false;
      return true;
    }
    if (npc.residency.status !== 'resident') return false;
    if (!npc.location) return false;
    if (npc.location === playerRoom) return false;
    const { block } = resolveScheduleActivity(npc, gameState.meta.clock);
    if (block === 'sleep') return false;
    if (block === 'work' || block === 'commute') return false;
    return true;
  });
}

// --- Per-NPC interruption probability ---
function getInterruptionProbability(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  if (!npc) return 0;

  const cfg = INTERRUPTION;
  let p = cfg.baseChance;

  // Door state
  const playerRoom = gameState.player.location;
  const doorState = getDoorState(gameState, playerRoom);
  p *= cfg.doorMultiplier[doorState] ?? 1.0;

  // Time of day phase
  const phase = gameState.meta.clock.phase || getPhase(gameState.meta.clock.minutes);
  p *= cfg.phaseMultiplier[phase] ?? 1.0;

  // NPC personality
  const t = npc.bible.temperament;
  const pw = cfg.personalityWeights;
  // AfterHours Phase 8: an NPC's baked deviantLevel ([0,1]; absent on cast
  // roommates, so `|| 0`) amplifies the volatility term — a high-deviant
  // Hot Single genuinely is more likely to wander in. The weight lives in
  // AH_HOT_SINGLES_TUNING.interruptionDeviantWeight; clamp it if playtest
  // finds the effect obnoxious.
  const deviantLevel = typeof npc.bible?.deviantLevel === 'number' ? npc.bible.deviantLevel : 0;
  const volatilityFactor = t.volatility * (1 + (AH_HOT_SINGLES_TUNING?.interruptionDeviantWeight ?? 0.5) * deviantLevel);
  p *= 1 + (
    t.assertiveness * pw.assertiveness +
    t.conscientiousness * pw.conscientiousness +
    t.warmth * pw.warmth +
    volatilityFactor * pw.volatility
  );

  // NPC schedule block — except for a social visitor, who is HERE, in your
  // apartment, inside their visit window. Their own schedule template says
  // nothing about what they're doing: every external NPC is generated on
  // 'day_shift', whose weekday work block (ticks 20-34) swallows all but the
  // first hour of the 09:00-16:30 invite window, and
  // scheduleMultiplier.work is 0 — so reading the template here zeroed out
  // every weekday invite and silently cancelled the eligibility extension
  // above. SIM already resolves these NPCs as 'leisure'
  // (resolveVisitPresence's social branches); match it.
  const onSocialVisit = getActiveVisits(gameState)
    .some(v => v.purpose === 'social' && v.npcId === npcId);
  const block = onSocialVisit
    ? 'leisure'
    : resolveScheduleActivity(npc, gameState.meta.clock).block;
  p *= cfg.scheduleMultiplier[block] ?? 1.0;
  if (p <= 0) return 0;

  // Relationship
  const rel = npc.relPlayer || {};
  const tension = rel.tension || 0;
  const affection = rel.affection || 0;
  if (tension > 0.3) p *= cfg.relationshipMultiplier.highTension;
  else if (affection > 0.3) p *= cfg.relationshipMultiplier.highAffection;
  else if (tension < -0.1 && affection < -0.1) p *= cfg.relationshipMultiplier.lowBoth;

  return Math.min(1, Math.max(0, p));
}

// --- Roll: pick which NPC (if any) walks in on the player ---
// Returns { npcId, doorState } or null.
function rollInterruption(gameState) {
  const eligible = getEligibleNpcs(gameState);
  if (eligible.length === 0) return null;

  const playerRoom = gameState.player.location;
  const doorState = getDoorState(gameState, playerRoom);
  const rng = seededRng(gameState.meta.seed, `interrupt_${gameState.meta.clock.day}_${Math.floor(gameState.meta.clock.minutes)}_${gameState.meta.clock.day}`);

  // Roll per NPC. First success = that NPC walks in. This means multiple
  // NPCs COULD succeed, but we only show one — the highest-probability
  // success, not the first rolled, so a high-assertiveness NPC with a
  // 0.4 chance beats a low-assertiveness one with 0.1 even if the
  // low one happened to roll first.
  let bestSuccess = null;
  let bestProb = 0;

  for (const [npcId, npc] of eligible) {
    const prob = getInterruptionProbability(gameState, npcId);
    if (prob <= 0) continue;
    if (rng() < prob) {
      if (prob > bestProb) {
        bestSuccess = npcId;
        bestProb = prob;
      }
    }
  }

  if (!bestSuccess) return null;
  return { npcId: bestSuccess, doorState };
}

// --- Start background pre-generation of the top candidate's line ---
// Called from doAfterHoursMasturbate. Identifies the highest-probability
// NPC and fires a generateText call in the background. The result is
// stored in pendingInterruption and consumed if that NPC wins the roll.
// If the roll picks a different NPC (or fails), pendingInterruption is
// discarded.
function startInterruptionPreGeneration(gameState) {
  pendingInterruption = null;

  const eligible = getEligibleNpcs(gameState);
  if (eligible.length === 0) return;

  // Pick the highest-probability NPC for pre-generation
  let topNpcId = null;
  let topProb = 0;
  for (const [npcId] of eligible) {
    const prob = getInterruptionProbability(gameState, npcId);
    if (prob > topProb) { topProb = prob; topNpcId = npcId; }
  }
  if (!topNpcId) return;

  const playerRoom = gameState.player.location;
  const doorState = getDoorState(gameState, playerRoom);
  const browser = gameState.world.computer?.apps?.browser;
  const clips = browser?.afterHoursClips;
  const clip = clips?.find(c => c.id === browser?.afterHoursWatching);
  const clipTitle = interruptionClipTitle(gameState);
  const clipCategory = clip?.category || browser?.afterHoursCategory || 'adult content';

  // Fire the generation in the background (don't await — this runs
  // concurrently with the player's masturbating session)
  const prompt = buildInterruptionPrompt(gameState, topNpcId, { title: clipTitle, category: clipCategory }, doorState);

  root.generateText(prompt).then(text => {
    // Guard: only store if the player is still masturbating (hasn't
    // cum/stopped/closed, and hasn't pocketed/locked/killed the device —
    // Phase 5.5 makes this a derived check). Check the LIVE
    // currentGameState, not the captured one — resolveBatch replaces
    // currentGameState with a new object, so the captured gameState's
    // session would be stale.
    if (!isAfterHoursSessionActive(currentGameState)) return;

    pendingInterruption = {
      npcId: topNpcId,
      text: text.trim(),
      doorState,
      clipTitle,
      clipCategory,
    };
  }).catch(() => {
    // Pre-generation failed — on-demand fallback will handle it
  });
}

// --- Apply interruption consequences ---
// Called from the bubble's response buttons. Applies suspicion/tension
// based on door state and which button the player clicked.
function applyInterruptionConsequences(gameState, npcId, doorState, response) {
  const npc = gameState.npcs[npcId];
  if (!npc) return;

  const cfg = INTERRUPTION;
  const t = npc.bible.temperament;
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  const lines = [];

  if (doorState === 'locked') {
    // Locked door — they knocked, you had privacy. Minimal consequence.
    lines.push(`REL_DELTA ${npcId} tension +${cfg.lockedTensionDelta}`);
  } else {
    // Caught with door open or closed (unlocked)
    // Suspicion scaled by openness (low openness = bigger penalty)
    const opennessFactor = 1 - (t.openness + 1) / 2; // 0..1, 1=low openness
    const suspDelta = cfg.caughtSuspicionDelta * (0.5 + opennessFactor);
    let tensionDelta = cfg.caughtTensionDelta;

    if (response === 'sorry') {
      // "Sorry!" reduces the tension bump by 50%
      tensionDelta *= (1 - cfg.sorryTensionReduction);
    } else if (response === 'own_it') {
      // "Own it" — high warmth/openness reduces tension; low warmth increases
      if (t.openness > cfg.ownItOpennessThreshold && t.warmth > 0) {
        tensionDelta = -cfg.caughtTensionDelta * cfg.ownItHighWarmthReduction;
      } else if (t.warmth < 0) {
        tensionDelta *= cfg.ownItLowWarmthIncrease;
      }
      // Moderate warmth/openness: no additional change (tension stays at base)
    }

    lines.push(`ADJUST_SUSPICION ${npcId} boundary_violation +${suspDelta.toFixed(2)}`);
    lines.push(`REL_DELTA ${npcId} tension ${tensionDelta >= 0 ? '+' : ''}${tensionDelta.toFixed(2)}`);

    // Memory episode — the NPC remembers this. Phase 6: the title falls
    // back to the most recent persisted AfterHours history entry when no
    // clip is active, so the memory still names something real.
    const memText = `Walked in on you masturbating to "${interruptionClipTitle(gameState)}".`;
    lines.push(`MEMORY_EPISODE ${npcId} ${memText}`);
  }

  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  applyEffects(effects, effCtx);
}

// ===== /SECTION: INTERRUPTION =====
