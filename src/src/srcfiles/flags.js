// ===== SECTION: FLAGS =====
// Flags & Conditions engine (actions-and-activities-overhaul-plan.md Phase 3,
// D15) — the freeuseofficeclicker pattern: a named rule an NPC checks at
// decision time. Three sources are in the data model (player-set house
// rules, boundary flags a player sets against one NPC — D13, Phase 7 — and
// an NPC's own comfort/preference flags — D16, Phase 8); this phase ships
// the engine plus the one source with a real player-facing verb today:
// house rules. The other two sources are future producers into the SAME
// checker below, not a second engine — see the plan's Phase 3 Handoff for
// exactly what's deliberately not built yet.
//
// TRUSTED PRODUCER, same trust tier as stealth.js's resolveRoomEntryStealth —
// calls applyEffects directly and skips validateEffects (numbers come from
// FLAGS_TUNING/HOUSE_RULE_DEFS, config.js, never the model).
//
// Detection: co-presence (getPresentNpcIds), the SAME primitive
// resolveRoomEntryStealth/resolvePeep use for an overtly witnessed act. A
// sight-channel signal barely leaves its own room in this game
// (SIGNAL_TUNING.attenuation.sight = 0.10 — see signals.js), and nothing
// here is secretive (nobody rolls a stealth chance to eat a sandwich), so a
// full perceiveSignals round-trip would just re-derive what presence already
// answers. Design invariant 3 ("an NPC is never bound by a rule it cannot
// perceive") holds by construction: an NPC not in the room never enters
// `presentIds` and never reacts.

// Does `condition` match this event? `condition` is `{ act, roomId }` — an
// absent key matches anything. New rule shapes add new keys here, never a
// parallel matcher — HOUSE_RULE_DEFS.no_eating_living_room is the only
// producer of `act`/`roomId` today, but any future rule (D13's boundary
// flags, D16's comfort flags) reads through this same function.
function houseRuleConditionMet(condition, event) {
  if (!condition) return false;
  if (condition.act && condition.act !== event.act) return false;
  if (condition.roomId && condition.roomId !== event.roomId) return false;
  return true;
}

// How much this NPC mind order/propriety being broken — conscientiousness
// raises it, warmth (the closest existing trait to "agreeableness") lowers
// it. This is "how much they care," never a probability of noticing (that's
// co-presence, above).
function ruleCareWeight(npc) {
  const t = npc?.bible?.temperament || {};
  const consc = typeof t.conscientiousness === 'number' ? t.conscientiousness : 0;
  const warmth = typeof t.warmth === 'number' ? t.warmth : 0;
  return clamp01(FLAGS_TUNING.careBase
    + consc * FLAGS_TUNING.careConscientiousnessWeight
    + warmth * FLAGS_TUNING.careWarmthWeight);
}

// How sharp the reaction runs once it fires — volatility (emotional
// reactivity / low impulse control) is the closest existing trait to the
// plan's "disinhibition." Scales the CONSEQUENCE only; ruleCareWeight above
// already decided whether one fires at all.
function ruleReactionSeverity(npc) {
  const t = npc?.bible?.temperament || {};
  const vol = typeof t.volatility === 'number' ? t.volatility : 0;
  return clamp01(FLAGS_TUNING.severityBase + vol * FLAGS_TUNING.severityVolatilityWeight);
}

// PURE — decides who reacts and how much. `event`: { act, roomId, actorId }.
// Returns [] when nothing is active, nothing matched, nobody witnessed it, or
// every witness's own personality let it go. One entry per reacting NPC per
// matched rule: { npcId, rule, careWeight, severity }.
function resolveHouseRuleViolations(gameState, event) {
  const active = gameState.world?.houseRules || [];
  if (active.length === 0) return [];
  const matched = active
    .map(rec => HOUSE_RULE_DEFS[rec.id])
    .filter(def => def && houseRuleConditionMet(def.condition, event));
  if (matched.length === 0) return [];
  // A sleeping resident doesn't witness the violation (2026-09-10 audit fix,
  // sleeping-npc-contradiction-audit.md item 3 — the witness set used to
  // include her regardless, so she'd react to and later gossip about
  // something she slept through).
  const presentIds = getPresentNpcIds(gameState.npcs, event.roomId)
    .filter(id => id !== event.actorId && !npcIsAsleep(gameState.npcs[id]));
  if (presentIds.length === 0) return [];
  const out = [];
  for (const npcId of presentIds) {
    const npc = gameState.npcs[npcId];
    if (!npc) continue;
    const careWeight = ruleCareWeight(npc);
    if (careWeight < FLAGS_TUNING.minCareToReact) continue; // lets it slide entirely
    const severity = ruleReactionSeverity(npc);
    for (const rule of matched) out.push({ npcId, rule, careWeight, severity });
  }
  return out;
}

// MUTATES — applies each violation's consequence: MOOD_DELTA + REL_DELTA
// tension scaled by the rule's own weight and the witness's personality, plus
// a belief (addMemoryFact, category 'house' — one of TRANSMISSION's
// practicalCategories, config.js — so conscientious listeners are already
// biased to raise it later; emotionalTag 'domestic'). That fact IS the
// gossip hook: npc.js's existing TRANSMISSION machinery carries it to other
// NPCs on its own terms, exactly like every other witnessed fact in this
// game — no separate gossip system needed.
function applyHouseRuleViolations(gameState, event, violations) {
  if (!violations || violations.length === 0) return { applied: [] };
  const roomObjects = gameState.objects[`room_${event.roomId}`] || {};
  const presentIds = getPresentNpcIds(gameState.npcs, event.roomId);
  const effCtx = buildEffectContext(gameState, [], presentIds, roomObjects, gameState.player.inventory || []);
  const day = gameState.meta.clock.day;
  const lines = [];
  for (const v of violations) {
    // A weighted AVERAGE of care/severity, not a product of three 0..1
    // terms — three multiplied fractions crush the result toward zero long
    // before any of them individually looks small.
    const strength = v.careWeight * FLAGS_TUNING.reactionCareWeight + v.severity * FLAGS_TUNING.reactionSeverityWeight;
    const magnitude = v.rule.weight * strength;
    lines.push(`MOOD_DELTA ${v.npcId} ${(FLAGS_TUNING.moodDeltaAtFullStrength * magnitude).toFixed(3)}`);
    lines.push(`REL_DELTA ${v.npcId} tension +${(FLAGS_TUNING.tensionDeltaAtFullStrength * magnitude).toFixed(3)}`);
  }
  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  const result = applyEffects(effects, effCtx);
  const actorLabel = event.actorId === 'player' ? 'you' : (gameState.npcs[event.actorId]?.bible?.name || 'someone');
  for (const v of violations) {
    const npc = gameState.npcs[v.npcId];
    if (!npc) continue;
    gameState.npcs[v.npcId] = addMemoryFact(npc, {
      text: `Watched ${actorLabel} ignore the house rule: "${v.rule.label}."`,
      day, importance: MEMORY_IMPORTANCE.social, category: 'house', emotionalTag: 'domestic',
    });
  }
  return { applied: result.applied, violations };
}

// The one entry point callers use — decide, then apply (invariant 1). Safe
// to call unconditionally: a no-op whenever no house rule is active, no rule
// matched this event, or nobody witnessed it.
function checkHouseRules(gameState, event) {
  const violations = resolveHouseRuleViolations(gameState, event);
  return applyHouseRuleViolations(gameState, event, violations);
}

// --- D13 boundary flags (Phase 7) ------------------------------------------
// An NPC's OWN promised rule (npc.flags._boundaryRules, D38 — never
// world.houseRules, which is house-wide, not per-NPC), checked against THEIR
// OWN act, not a witness's reaction to someone else's. Same matcher
// (houseRuleConditionMet) and same personality formulas (ruleCareWeight/
// ruleReactionSeverity, D39) as the house-rule engine above — only the
// SUBJECT changes: instead of "how much do I mind seeing this," it's "how
// much do I mind having just broken my own word." Wired from the one
// drive-driven room-entry decision point (sim.js's resolveBatch) — see that
// file's own comment for why only that path is covered.

// PURE — does this actor's own promise, if any, match this event? null when
// nothing is active, nothing matched, or care rounds down to zero (the same
// "let it go entirely" floor the house-rule engine uses above).
function resolveBoundaryRuleViolation(gameState, event) {
  const npc = gameState.npcs[event.actorId];
  const active = (npc && npc.flags && npc.flags._boundaryRules) || [];
  if (active.length === 0) return null;
  const matched = active
    .map(rec => BOUNDARY_RULE_DEFS[rec.id])
    .find(def => def && houseRuleConditionMet(def.condition, event));
  if (!matched) return null;
  const careWeight = ruleCareWeight(npc);
  if (careWeight < FLAGS_TUNING.minCareToReact) return null;
  const severity = ruleReactionSeverity(npc);
  return { npcId: event.actorId, rule: matched, careWeight, severity };
}

// MUTATES — a self-directed tension rise (they crossed their own line) plus a
// memory fact tagged for gossip like every other fact in this file (category
// 'house', emotionalTag 'domestic' — the same practical bucket the house-rule
// violation above uses, so TRANSMISSION picks it up for free).
function applyBoundaryRuleViolation(gameState, event, violation) {
  if (!violation) return { applied: [] };
  const npc = gameState.npcs[violation.npcId];
  if (!npc) return { applied: [] };
  const strength = violation.careWeight * FLAGS_TUNING.reactionCareWeight + violation.severity * FLAGS_TUNING.reactionSeverityWeight;
  const magnitude = violation.rule.weight * strength;
  const line = `REL_DELTA ${violation.npcId} tension +${(FLAGS_TUNING.boundaryTensionAtFullStrength * magnitude).toFixed(3)}`;
  const effCtx = buildEffectContext(gameState, [violation.npcId], [violation.npcId], {}, []);
  const result = applyEffects([parseEffectDSL(line)[0]], effCtx);
  const day = gameState.meta.clock.day;
  gameState.npcs[violation.npcId] = addMemoryFact(gameState.npcs[violation.npcId], {
    text: `I told the player I'd respect their boundary — "${violation.rule.label}" — and I broke it anyway.`,
    day, importance: MEMORY_IMPORTANCE.social, category: 'house', emotionalTag: 'domestic',
  });
  return { applied: result.applied, violation };
}

// The one entry point (decide, then apply — invariant 1). Safe to call
// unconditionally: a no-op whenever the actor has no active boundary rules,
// nothing matched, or their own care rounds down to zero.
function checkBoundaryRules(gameState, event) {
  const violation = resolveBoundaryRuleViolation(gameState, event);
  return applyBoundaryRuleViolation(gameState, event, violation);
}

// --- Player-bound boundaries (aspirations-and-creative-careers Phase 13, D45) --
// The mirror of _boundaryRules: a line an NPC drew for the PLAYER
// (npc.flags._playerBoundaries, written by asks.js's $SubscriptionTalk),
// matched against the player's act, applied only when THAT NPC learns of
// the crossing — through NOTICE (the creator who knows the handle) or by
// gossip (maybeBoundaryUponFact, wired beside maybeJealousUponFact). The
// normal boundary-violation path: tension through REL_DELTA, a memory fact,
// and — since someone else broke their word to them — a grievance an
// apology can answer. Never relationships.js's infidelity deltas. Deduped
// per subject (a subscription learned twice is one crossing).

// PURE — does the player's act cross a line this NPC drew?
function resolvePlayerBoundaryViolation(gameState, npcId, event) {
  const npc = gameState.npcs?.[npcId];
  const active = (npc && npc.flags && npc.flags._playerBoundaries) || [];
  if (active.length === 0) return null;
  const matched = active
    .map(rec => BOUNDARY_RULE_DEFS[rec.id])
    .find(def => def && def.playerBound && houseRuleConditionMet(def.condition, event));
  if (!matched) return null;
  const reacted = (npc.flags._playerBoundaryReacted || []);
  if (event.subjectKey && reacted.includes(event.subjectKey)) return null;
  const careWeight = ruleCareWeight(npc);
  if (careWeight < FLAGS_TUNING.minCareToReact) return null;
  return { npcId, rule: matched, careWeight, severity: ruleReactionSeverity(npc) };
}

// MUTATES — the reaction. Returns { applied, violation } (violation null
// when nothing crossed).
function applyPlayerBoundaryViolation(gameState, event, violation) {
  if (!violation) return { applied: [], violation: null };
  const npc = gameState.npcs[violation.npcId];
  if (!npc) return { applied: [], violation: null };
  const strength = violation.careWeight * FLAGS_TUNING.reactionCareWeight + violation.severity * FLAGS_TUNING.reactionSeverityWeight;
  const magnitude = violation.rule.weight * strength;
  const line = `REL_DELTA ${violation.npcId} tension +${(FLAGS_TUNING.playerBoundaryTensionAtFullStrength * magnitude).toFixed(3)}`;
  const effCtx = buildEffectContext(gameState, [violation.npcId], [violation.npcId], {}, []);
  const result = applyEffects([parseEffectDSL(line)[0]], effCtx);
  const day = gameState.meta.clock.day;
  const text = `The player agreed to "${violation.rule.label}" and then crossed it anyway.`;
  let next = addMemoryFact(gameState.npcs[violation.npcId], { text, day, importance: MEMORY_IMPORTANCE.significant, category: 'social', emotionalTag: 'grievance' });
  next = addGrievance(next, text, FLAGS_TUNING.playerBoundaryGrievanceSeverity * Math.max(0.5, strength), day);
  if (event.subjectKey) next = { ...next, flags: { ...(next.flags || {}), _playerBoundaryReacted: [...((next.flags && next.flags._playerBoundaryReacted) || []), event.subjectKey] } };
  gameState.npcs[violation.npcId] = next;
  return { applied: result.applied, violation };
}

function checkPlayerBoundary(gameState, npcId, event) {
  const violation = resolvePlayerBoundaryViolation(gameState, npcId, event);
  return applyPlayerBoundaryViolation(gameState, event, violation);
}

// The gossip leg: a `subscription` opinion fact reaching an NPC who drew
// the line — learning IS the crossing reaching them. Same call shape as
// maybeJealousUponFact so the two sit side by side at the transmission
// sites; returns the fields the caller must merge (relPlayer, flags,
// memory) or null.
function maybeBoundaryUponFact(gameState, receiverId, fact) {
  if (!fact || fact.kind !== 'opinion' || !fact.subject || fact.subject.kind !== 'subscription') return null;
  const [creatorId, tier] = String(fact.subject.ref || '').split(':');
  if (tier !== 'private') return null;
  const r = checkPlayerBoundary(gameState, receiverId, { act: 'subscribe_private', creatorId, subjectKey: fact.subject.key || `subscription:${fact.subject.ref}` });
  if (!r.violation) return null;
  const npc = gameState.npcs[receiverId];
  return { relPlayer: npc.relPlayer, flags: npc.flags, memory: npc.memory };
}
// ===== /SECTION: FLAGS =====
