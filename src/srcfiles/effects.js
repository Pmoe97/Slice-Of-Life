// ===== SECTION: EFFECTS =====
// The bounded, typed effect vocabulary that player ACTIONS, LLM proposals,
// and (from P7) NPC autonomy all emit and route through the same
// apply pipeline. This is what lets "the narrator can change the world"
// stay deterministic and cheat-proof: every LLM-sourced effect is checked
// against hard caps and a reach-set (computeReachSet) before anything
// mutates state.
//
// Trust boundary: validateEffects(..., 'llm') is the gate for
// LLM-authored effects — it enforces EFFECT_LIMITS and rejects anything
// outside the reach-set. Trusted producers (an ACTION_DEFS entry's own
// `effects` list, and later a DRIVE_DEFS entry's) are config-authored, not
// user input, so they call applyEffects directly and intentionally SKIP
// validateEffects — the magnitude caps below exist to bound what the
// narrator can request per turn, not to second-guess numbers the game
// itself already vetted by putting them in CONFIG.
//
// apply() functions mutate the passed-in gameState synchronously and
// in-memory (never kv, never async) — this is deliberate, not an
// oversight: it's what lets NPC autonomy (P7) call the exact same
// applyEffects from inside resolveTick, which must stay pure and
// zero-LLM. Persistence happens later, at the next saveAtBoundary
// (already an unconditional per-NPC write loop), exactly like SIM's
// resolveTick/resolveBatch already work.
//
// `implemented:false` entries are declared now so the DSL/vocabulary shape
// is stable across phases, but validation always fails for them until the
// phase that gives them something to act on lands (WORLD/ITEMS landed in
// P1/P2 — SET_OBJECT_STATE/MOVE_ITEM/etc. are real now; STEALTH's
// WITNESS/ADJUST_SUSPICION/LEAVE_EVIDENCE and the trusted-only app/
// schedule/residency/arc types are still ahead). They are deliberately
// excluded from every PROMPT_KINDS effectVocabulary list until implemented,
// so the LLM is never invited to use a verb that can't do anything yet.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function isFiniteNumber(s) { return Number.isFinite(Number(s)) && String(s).trim() !== ''; }

// --- Validators (small, named, reused across EFFECT_DEFS entries) ---
function validateWho(who, ctx) {
  if (who === 'player') return true;
  return ctx.activeNpcIds.includes(who) || `Unknown or inactive target: ${who}`;
}
function validatePresentNpc(npcId, ctx) {
  return ctx.presentNpcIds.includes(npcId) || `${npcId} is not present.`;
}
function validateActiveNpc(npcId, ctx) {
  return ctx.activeNpcIds.includes(npcId) || `${npcId} is not an active participant.`;
}
function validateNeedName(who, need) {
  const allowed = who === 'player' ? ['hunger', 'energy', 'hygiene', 'mood'] : ['hunger', 'energy', 'hygiene', 'social'];
  return allowed.includes(need) || `Unknown need "${need}" for ${who}.`;
}
function validateNeedDelta(need, deltaStr) {
  if (!isFiniteNumber(deltaStr)) return `Not a number: ${deltaStr}`;
  const cap = need === 'mood' ? EFFECT_LIMITS.moodDeltaCap : EFFECT_LIMITS.needDeltaCap;
  return Math.abs(Number(deltaStr)) <= cap || `Delta too large for ${need} (max ±${cap}).`;
}
function validateMagnitude(deltaStr, cap, label) {
  if (!isFiniteNumber(deltaStr)) return `Not a number: ${deltaStr}`;
  return Math.abs(Number(deltaStr)) <= cap || `${label} delta too large (max ±${cap}).`;
}
function validateAxis(axis) {
  return ['trust', 'affection', 'tension', 'respect'].includes(axis) || `Unknown relationship axis: ${axis}`;
}
function validateSpendAmount(amountStr, ctx) {
  if (!isFiniteNumber(amountStr)) return `Not a number: ${amountStr}`;
  const amt = Number(amountStr);
  if (amt <= 0 || amt > EFFECT_LIMITS.moneyDeltaCap) return `Amount out of range (max $${EFFECT_LIMITS.moneyDeltaCap}).`;
  return amt <= (ctx.gameState?.player?.money ?? Infinity) || `Can't afford $${amt}.`;
}
function validatePositiveAmount(amountStr) {
  return (isFiniteNumber(amountStr) && Number(amountStr) > 0) || `Not a positive amount: ${amountStr}`;
}
function validateTicks(ticksStr) {
  if (!isFiniteNumber(ticksStr)) return `Not a number: ${ticksStr}`;
  const t = Number(ticksStr);
  return (t >= EFFECT_LIMITS.spendTimeMin && t <= EFFECT_LIMITS.spendTimeMax) || `Ticks out of range (${EFFECT_LIMITS.spendTimeMin}-${EFFECT_LIMITS.spendTimeMax}).`;
}
function validateSkillId(skillId) { return SKILL_IDS.includes(skillId) || `Unknown skill: ${skillId}`; }
function validateXp(xpStr) {
  if (!isFiniteNumber(xpStr)) return `Not a number: ${xpStr}`;
  const xp = Number(xpStr);
  return (xp > 0 && xp <= EFFECT_LIMITS.skillXpCap) || `XP out of range (max ${EFFECT_LIMITS.skillXpCap}).`;
}
function validateFlagKey(key) { return FLAG_PATTERNS.some(re => re.test(key)) || `Flag key doesn't match a known pattern: ${key}`; }
function validateTextLength(text, max) {
  return (typeof text === 'string' && text.length > 0 && text.length <= max) || `Text missing or too long (max ${max}).`;
}

// --- Object/item validators (WORLD/ITEMS-backed) ---
// ctx.roomObjects is { objId: instance } for the room the effect's
// producer is in — reach is deliberately scoped to "your own room" rather
// than the whole apartment, which is what makes the reach-set an
// anti-hallucination wall and not just an existence check.
function validateReachableObject(objId, ctx) {
  return !!ctx.roomObjects[objId] || `Not reachable: ${objId}`;
}
function validateObjectStateChange(objId, key, value, ctx) {
  const obj = ctx.roomObjects[objId];
  const def = obj && OBJECT_DEFS[obj.defId];
  if (!def) return `Not reachable: ${objId}`;
  if (!def.states?.[key]) return `${def.label} has no state "${key}".`;
  return def.states[key].includes(value) || `Invalid value "${value}" for ${key}.`;
}
function validateObjectBreakable(objId, deltaStr, ctx) {
  const obj = ctx.roomObjects[objId];
  const def = obj && OBJECT_DEFS[obj.defId];
  if (!def) return `Not reachable: ${objId}`;
  if (!def.breakable) return `${def.label} isn't breakable.`;
  return validateMagnitude(deltaStr, EFFECT_LIMITS.objectConditionCap, 'condition');
}
function validateObjectPortable(objId, ctx) {
  const obj = ctx.roomObjects[objId];
  const def = obj && OBJECT_DEFS[obj.defId];
  if (!def) return `Not reachable: ${objId}`;
  return !!def.portable || `${def.label} can't be moved.`;
}
function validateItemDefId(defId) { return !!ITEM_DEFS[defId] || `Unknown item: ${defId}`; }
function validateQtyRange(qtyStr) {
  if (!isFiniteNumber(qtyStr)) return `Not a number: ${qtyStr}`;
  const q = Number(qtyStr);
  return (q > 0 && q <= EFFECT_LIMITS.itemQtyCap) || `Quantity out of range (max ${EFFECT_LIMITS.itemQtyCap}).`;
}
function validateLocationRef(ref, ctx) {
  return ref === 'player' || !!ctx.roomObjects[ref] || `Not reachable: ${ref}`;
}
function locationStackList(ref, ctx) {
  return ref === 'player' ? ctx.carryItems : (ctx.roomObjects[ref]?.contents || []);
}
function validateHasEnough(defId, qtyStr, from, ctx) {
  return stackQty(locationStackList(from, ctx), defId) >= Number(qtyStr) || `Not enough ${defId} at ${from}.`;
}

// --- Stealth validators (P6) ---
function validateSuspicionSubject(s) { return SUSPICION_SUBJECTS.includes(s) || `Unknown suspicion subject: ${s}`; }
function validateCertainty(c) { return ['certain', 'suspects'].includes(c) || `Unknown certainty: ${c}`; }
// NPC-witnesses-NPC is P7 autonomy territory (multi-NPC scenes) — this
// stays player-only until then.
function validateWitnessSubject(ref) { return ref === 'player' || `Unknown witness subject: ${ref}`; }
function validateEvidenceKind(objId, kind, ctx) {
  const obj = ctx.roomObjects[objId];
  const def = obj && OBJECT_DEFS[obj.defId];
  if (!def) return `Not reachable: ${objId}`;
  return (def.evidenceKinds || []).includes(kind) || `${def.label} can't carry evidence of kind "${kind}".`;
}
function validateEvidenceStrength(s) {
  if (!isFiniteNumber(s)) return `Not a number: ${s}`;
  const v = Number(s);
  return (v > 0 && v <= EFFECT_LIMITS.evidenceStrengthCap) || `Strength out of range (max ${EFFECT_LIMITS.evidenceStrengthCap}).`;
}

// Runs each check in order, short-circuiting on the first failure — lets
// each EFFECT_DEFS.validate stay a flat one-liner instead of a nested
// ternary chain. A "check" is either a precomputed true|reason value, or a
// zero-arg function returning one (use a function when a later check
// depends on an earlier one having passed, e.g. "who is valid" before
// "that need name is valid for who").
function firstFailure(...checks) {
  for (const c of checks) {
    const result = typeof c === 'function' ? c() : c;
    if (result !== true) return result;
  }
  return true;
}

// --- Appliers (synchronous, in-memory only) ---
function applyAdjustNeed(p, ctx) {
  const delta = Number(p.delta);
  if (p.who === 'player') {
    if (p.need === 'mood') ctx.gameState.player.mood = clamp(ctx.gameState.player.mood + delta, -1, 1);
    else ctx.gameState.player[p.need] = clamp((ctx.gameState.player[p.need] || 0) + delta, 0, 100);
  } else {
    const npc = ctx.gameState.npcs[p.who];
    if (npc) npc.needs[p.need] = clamp((npc.needs[p.need] || 0) + delta, 0, 100);
  }
}
function applyMoodDeltaEffect(p, ctx) {
  const delta = Number(p.delta);
  if (p.who === 'player') { ctx.gameState.player.mood = clamp(ctx.gameState.player.mood + delta, -1, 1); return; }
  const npc = ctx.gameState.npcs[p.who];
  if (npc) npc.mood = clamp(npc.mood + delta, -1, 1);
}
function applyRelDeltaEffect(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (!npc) return;
  npc.relPlayer[p.axis] = clamp((npc.relPlayer[p.axis] || 0) + Number(p.delta), -1, 1);
}
function applySpendMoney(p, ctx) { ctx.gameState.player.money -= Number(p.amount); }
function applyEarnMoney(p, ctx) { ctx.gameState.player.money += Number(p.amount); }
function applyNpcMove(p, ctx) { const npc = ctx.gameState.npcs[p.npcId]; if (npc) npc.location = p.roomId; }
function applyNpcActivity(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (npc) npc.activity = p.text.slice(0, EFFECT_LIMITS.npcActivityMaxLength);
}
function applyAddSkillXp(p, ctx) {
  const skills = ctx.gameState.player.skills || (ctx.gameState.player.skills = {});
  skills[p.skillId] = (skills[p.skillId] || 0) + Number(p.xp);
}
function resolveFlagBag(p, ctx) {
  return p.who === 'player' ? ctx.gameState.player : ctx.gameState.npcs[p.who];
}
function applyAddFlag(p, ctx) {
  const bag = resolveFlagBag(p, ctx);
  if (!bag) return;
  bag.flags = bag.flags || {};
  bag.flags[p.key] = p.value === 'false' ? false : (p.value || true);
}
function applyClearFlag(p, ctx) {
  const bag = resolveFlagBag(p, ctx);
  if (bag && bag.flags) delete bag.flags[p.key];
}
function applyMemoryFactEffect(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (npc) ctx.gameState.npcs[p.npcId] = addMemoryFact(npc, p.text);
}
function applyMemoryEpisodeEffect(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (npc) ctx.gameState.npcs[p.npcId] = addMemoryEpisode(npc, ctx.gameState.meta.clock.day, p.text, 0.5);
}

// --- Object/item appliers (WORLD/ITEMS-backed) ---
// findObjectById scans every bucket rather than indexing by id — cheap at
// the current object count (~40) and avoids maintaining a second id->bucket
// map that could drift from the real one.
function findObjectById(gameState, objId) {
  for (const bucket of Object.values(gameState.objects || {})) {
    if (bucket[objId]) return bucket[objId];
  }
  return null;
}
function locationStackListMutable(ref, gameState) {
  return ref === 'player' ? gameState.player.inventory : findObjectById(gameState, ref)?.contents;
}
function writeLocationStackList(ref, gameState, list) {
  if (ref === 'player') { gameState.player.inventory = list; return; }
  const obj = findObjectById(gameState, ref);
  if (obj) obj.contents = list;
}

function applySetObjectState(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (obj) obj.state = { ...obj.state, [p.key]: p.value };
}
function applyAdjustObjectCondition(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (obj) obj.condition = clamp((obj.condition ?? 100) + Number(p.delta), 0, 100);
}
function applyMoveObject(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj || !OBJECT_DEFS[obj.defId]?.portable) return;
  const fromBucket = ctx.gameState.objects[obj.bucket];
  if (fromBucket) delete fromBucket[obj.id];
  const toBucket = ctx.gameState.objects[p.toBucket] || (ctx.gameState.objects[p.toBucket] = {});
  obj.bucket = p.toBucket;
  toBucket[obj.id] = obj;
}
function applyMoveItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const { stacks: afterRemove, removed } = removeStack(fromList, p.defId, Number(p.qty));
  writeLocationStackList(p.from, ctx.gameState, afterRemove);
  if (removed <= 0) return;
  const toList = locationStackListMutable(p.to, ctx.gameState) || [];
  writeLocationStackList(p.to, ctx.gameState, addStack(toList, p.defId, removed, p.to === 'player' ? 'player' : null));
}
function applyConsumeItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const { stacks: afterRemove, removed } = removeStack(fromList, p.defId, Number(p.qty));
  writeLocationStackList(p.from, ctx.gameState, afterRemove);
  if (removed <= 0) return;
  const def = ITEM_DEFS[p.defId];
  for (const [need, amt] of Object.entries(def?.consumable || {})) {
    applyAdjustNeed({ who: 'player', need, delta: String(amt * removed) }, ctx);
  }
}
function applyDestroyItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  writeLocationStackList(p.from, ctx.gameState, removeStack(fromList, p.defId, Number(p.qty)).stacks);
}
function applySpawnItem(p, ctx) {
  const toList = locationStackListMutable(p.to, ctx.gameState) || [];
  writeLocationStackList(p.to, ctx.gameState, addStack(toList, p.defId, Number(p.qty), p.to === 'player' ? 'player' : null));
}

// --- Stealth appliers (P6) ---
function applyWitness(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (!npc) return;
  const text = WITNESS_MEMORY_TEMPLATES[p.certainty];
  ctx.gameState.npcs[p.npcId] = addMemoryEpisode(npc, ctx.gameState.meta.clock.day, text, p.certainty === 'certain' ? 0.8 : 0.5);
  const flagKey = p.certainty === 'certain' ? `noticed_boundary_${p.subjectRef}` : `suspects_${p.subjectRef}`;
  applyAddFlag({ who: p.npcId, key: flagKey, value: true }, ctx);
}
function applyAdjustSuspicion(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (!npc) return;
  npc.suspicion = npc.suspicion || {};
  npc.suspicion[p.subject] = clamp((npc.suspicion[p.subject] || 0) + Number(p.delta), 0, 1);
}
function applyLeaveEvidence(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj) return;
  obj.evidence = { kind: p.kind, strength: Number(p.strength), day: ctx.gameState.meta.clock.day, discovered: false };
}

// --- Effect registry ---
// paramShape: token names; a leading '...' on the last entry means "rest of
// line, one free-text param" (so a reason or a message can contain spaces).
const EFFECT_DEFS = {
  ADJUST_NEED: {
    paramShape: ['who', 'need', 'delta'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateWho(p.who, ctx), () => validateNeedName(p.who, p.need), () => validateNeedDelta(p.need, p.delta)),
    apply: applyAdjustNeed,
  },
  MOOD_DELTA: {
    paramShape: ['who', 'delta'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateWho(p.who, ctx), () => validateMagnitude(p.delta, EFFECT_LIMITS.moodDeltaCap, 'mood')),
    apply: applyMoodDeltaEffect,
  },
  REL_DELTA: {
    paramShape: ['npcId', 'axis', 'delta'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateActiveNpc(p.npcId, ctx), () => validateAxis(p.axis), () => validateMagnitude(p.delta, EFFECT_LIMITS.relDeltaCap, 'relationship')),
    apply: applyRelDeltaEffect,
  },
  SPEND_MONEY: {
    paramShape: ['amount', '...reason'], llm: true, implemented: true,
    validate: (p, ctx) => validateSpendAmount(p.amount, ctx),
    apply: applySpendMoney,
  },
  EARN_MONEY: {
    paramShape: ['amount', '...reason'], llm: false, implemented: true,
    validate: (p) => validatePositiveAmount(p.amount),
    apply: applyEarnMoney,
  },
  SPEND_TIME: {
    paramShape: ['ticks'], llm: true, implemented: true, isTimeEffect: true,
    validate: (p) => validateTicks(p.ticks),
    apply: () => null, // consumed by the caller as ticksRequested, not a state write
  },
  MOVE_PLAYER: {
    paramShape: ['roomId'], llm: true, implemented: true,
    validate: (p) => !!ROOMS[p.roomId] || `No such room: ${p.roomId}`,
    apply: (p, ctx) => { ctx.gameState.player.location = p.roomId; },
  },
  NPC_MOVE: {
    paramShape: ['npcId', 'roomId'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validatePresentNpc(p.npcId, ctx), () => !!ROOMS[p.roomId] || `No such room: ${p.roomId}`),
    apply: applyNpcMove,
  },
  NPC_ACTIVITY: {
    paramShape: ['npcId', '...text'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validatePresentNpc(p.npcId, ctx), () => validateTextLength(p.text, EFFECT_LIMITS.npcActivityMaxLength)),
    apply: applyNpcActivity,
  },
  ADD_SKILL_XP: {
    paramShape: ['skillId', 'xp'], llm: true, implemented: true,
    validate: (p) => firstFailure(validateSkillId(p.skillId), () => validateXp(p.xp)),
    apply: applyAddSkillXp,
  },
  ADD_FLAG: {
    paramShape: ['who', 'key', 'value'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateWho(p.who, ctx), () => validateFlagKey(p.key)),
    apply: applyAddFlag,
  },
  CLEAR_FLAG: {
    paramShape: ['who', 'key'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateWho(p.who, ctx), () => validateFlagKey(p.key)),
    apply: applyClearFlag,
  },
  MEMORY_FACT: {
    paramShape: ['npcId', '...text'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateActiveNpc(p.npcId, ctx), () => validateTextLength(p.text, EFFECT_LIMITS.memoryTextMaxLength)),
    apply: applyMemoryFactEffect,
  },
  MEMORY_EPISODE: {
    paramShape: ['npcId', '...text'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateActiveNpc(p.npcId, ctx), () => validateTextLength(p.text, EFFECT_LIMITS.memoryTextMaxLength)),
    apply: applyMemoryEpisodeEffect,
  },

  // --- Object/item effects (WORLD/ITEMS-backed, P1/P2) ---
  SET_OBJECT_STATE: {
    paramShape: ['objId', 'key', 'value'], llm: true, implemented: true,
    validate: (p, ctx) => validateObjectStateChange(p.objId, p.key, p.value, ctx),
    apply: applySetObjectState,
  },
  ADJUST_OBJECT_CONDITION: {
    paramShape: ['objId', 'delta'], llm: true, implemented: true,
    validate: (p, ctx) => validateObjectBreakable(p.objId, p.delta, ctx),
    apply: applyAdjustObjectCondition,
  },
  MOVE_OBJECT: {
    paramShape: ['objId', 'toBucket'], llm: true, implemented: true,
    validate: (p, ctx) => validateObjectPortable(p.objId, ctx),
    apply: applyMoveObject,
  },
  MOVE_ITEM: {
    paramShape: ['defId', 'qty', 'from', 'to'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateLocationRef(p.to, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyMoveItem,
  },
  CONSUME_ITEM: {
    paramShape: ['defId', 'qty', 'from'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyConsumeItem,
  },
  DESTROY_ITEM: {
    paramShape: ['defId', 'qty', 'from'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyDestroyItem,
  },
  SPAWN_ITEM: {
    paramShape: ['defId', 'qty', 'to'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.to, ctx)),
    apply: applySpawnItem,
  },
  // --- Stealth effects (WORLD/SKILLS-backed, P6) ---
  WITNESS: {
    paramShape: ['npcId', 'subjectRef', 'certainty'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validatePresentNpc(p.npcId, ctx), () => validateWitnessSubject(p.subjectRef), () => validateCertainty(p.certainty)),
    apply: applyWitness,
  },
  ADJUST_SUSPICION: {
    paramShape: ['npcId', 'subject', 'delta'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateActiveNpc(p.npcId, ctx), () => validateSuspicionSubject(p.subject), () => validateMagnitude(p.delta, EFFECT_LIMITS.suspicionDeltaCap, 'suspicion')),
    apply: applyAdjustSuspicion,
  },
  LEAVE_EVIDENCE: {
    paramShape: ['objId', 'kind', 'strength'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx), () => validateEvidenceKind(p.objId, p.kind, ctx), () => validateEvidenceStrength(p.strength)),
    apply: applyLeaveEvidence,
  },
  // Still a general-purpose "arbitrary room key/value" primitive with no
  // specific consumer yet — stays undeclared until something actually
  // needs it, rather than forcing a use now (see STEALTH's file-level
  // scope notes in ARCHITECTURE.md).
  SET_ROOM_STATE: { paramShape: ['roomId', 'key', 'value'], llm: true, implemented: false },
  APP_STATE: { paramShape: ['appId', '...jsonPatch'], llm: false, implemented: false },
  SCHEDULE_EVENT: { paramShape: ['day', 'tick', 'type', 'ref'], llm: false, implemented: false },
  RESIDENCY: { paramShape: ['npcId', 'status'], llm: false, implemented: false },
  ARC_ADVANCE: { paramShape: ['npcId', 'arcId', 'stage'], llm: false, implemented: false },
};

// --- DSL parsing ---
// One effect per line: TYPE token token ...(rest). Unknown lines are
// silently skipped, not an error — narration prose that happens to start
// with an uppercase word shouldn't be mistaken for a directive; only exact
// known TYPE names starting a line count, and a shape mismatch drops just
// that line rather than the whole response (partial acceptance, §3 of the
// architecture plan).
function parseEffectDSL(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^([A-Z][A-Z_]{2,32})\s+(.*)$/);
    if (!m || !EFFECT_DEFS[m[1]]) continue;
    const params = parseEffectParams(m[1], m[2]);
    if (params) out.push({ type: m[1], params, raw: line });
  }
  return out;
}

function parseEffectParams(type, rest) {
  const shape = EFFECT_DEFS[type].paramShape;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const params = {};
  for (let i = 0; i < shape.length; i++) {
    const name = shape[i];
    if (name.startsWith('...')) { params[name.slice(3)] = tokens.slice(i).join(' '); break; }
    if (tokens[i] === undefined) return null; // arity mismatch — drop the line
    params[name] = tokens[i];
  }
  return params;
}

// proposal.effects entries may be DSL strings or already-typed objects
// ({type, params...}) — accept both so a hand-authored trusted producer
// doesn't have to round-trip through string formatting.
function normalizeEffectEntry(entry) {
  if (typeof entry === 'string') return parseEffectDSL(entry)[0] || null;
  if (entry && typeof entry === 'object' && entry.type && EFFECT_DEFS[entry.type]) {
    return { type: entry.type, params: entry.params || entry, raw: JSON.stringify(entry) };
  }
  return null;
}

// Desugars proposal.effects (array of DSL strings or typed objects) into a
// flat typed-effect array. Legacy relationshipDeltas/moodDeltas/
// memoryAdditions keys are intentionally NOT touched here — they keep
// their own dedicated, already-hardened path in NPC's validateProposal/
// applyProposal. `effects` is strictly the NEW, additive vocabulary
// (money, time, skills, flags, and — once WORLD/ITEMS/STEALTH land —
// objects/items/evidence).
function normalizeProposal(proposal) {
  const raw = Array.isArray(proposal?.effects) ? proposal.effects : [];
  return { effects: raw.map(normalizeEffectEntry).filter(Boolean) };
}

// --- Reach-set: which object ids an effect is allowed to reference —
// deliberately scoped to the producer's current room (ctx.roomObjects),
// never the whole apartment. An effect naming an id outside it, or one
// that doesn't exist at all, fails validation the same way; the LLM
// cannot distinguish "wrong room" from "doesn't exist", which is exactly
// the point — it can't learn the shape of rooms it can't see. ---
function computeReachSet(ctx) { return new Set(Object.keys(ctx.roomObjects || {})); }

// --- Effect context: what a producer's effects are allowed to touch.
// roomObjects is { objId: instance } for the current room (WORLD);
// carryItems is the player's inventory stack list (ITEMS). Both empty
// arrays/objects are safe defaults for callers that predate WORLD/ITEMS
// data (object/item effects simply have nothing to validate against, so
// they correctly fail rather than silently no-op). ---
function buildEffectContext(gameState, activeNpcIds, presentNpcIds, roomObjects, carryItems) {
  return {
    gameState,
    activeNpcIds: activeNpcIds || [], presentNpcIds: presentNpcIds || [],
    roomObjects: roomObjects || {}, carryItems: carryItems || [],
  };
}

function checkOneEffect(eff, def, ctx, tier) {
  if (!def) return `Unknown effect type: ${eff.type}`;
  if (tier === 'llm' && !def.llm) return `${eff.type} is not available to the narrator.`;
  if (!def.implemented) return `${eff.type} is not available yet.`;
  const result = def.validate ? def.validate(eff.params, ctx) : true;
  return result === true ? null : (result || 'Invalid effect.');
}

// --- Validation: the LLM-input boundary. type known -> tier allowed ->
// implemented -> per-effect predicate -> counted against EFFECT_LIMITS.
// Trusted producers (ACTIONS' own def.effects, later DRIVE_DEFS) do NOT
// call this — see file header. ---
function validateEffects(effects, ctx, tier) {
  const valid = [];
  const rejected = [];
  const perTypeCount = {};
  let needMagnitude = 0, relMagnitude = 0, timeEffects = 0;

  for (const eff of (effects || []).slice(0, EFFECT_LIMITS.maxEffects + 5)) {
    const reason = checkOneEffect(eff, EFFECT_DEFS[eff.type], ctx, tier);
    if (reason) { rejected.push({ effect: eff, reason }); continue; }

    perTypeCount[eff.type] = (perTypeCount[eff.type] || 0) + 1;
    if (perTypeCount[eff.type] > EFFECT_LIMITS.maxPerType) { rejected.push({ effect: eff, reason: 'Too many of this effect type.' }); continue; }
    if (valid.length >= EFFECT_LIMITS.maxEffects) { rejected.push({ effect: eff, reason: 'Too many effects in one turn.' }); continue; }

    const capReason = checkProposalCaps(eff, EFFECT_DEFS[eff.type], { needMagnitude, relMagnitude, timeEffects });
    if (capReason) { rejected.push({ effect: eff, reason: capReason }); continue; }
    if (eff.type === 'ADJUST_NEED') needMagnitude += Math.abs(Number(eff.params.delta));
    if (eff.type === 'REL_DELTA') relMagnitude += Math.abs(Number(eff.params.delta));
    if (EFFECT_DEFS[eff.type].isTimeEffect) timeEffects++;

    valid.push(eff);
  }
  return { valid, rejected };
}

function checkProposalCaps(eff, def, totals) {
  if (def.isTimeEffect && totals.timeEffects + 1 > EFFECT_LIMITS.maxSpendTimePerProposal) return 'Only one time-cost effect per turn.';
  if (eff.type === 'ADJUST_NEED' && totals.needMagnitude + Math.abs(Number(eff.params.delta)) > EFFECT_LIMITS.maxTotalNeedMagnitude) return 'Total need change too large this turn.';
  if (eff.type === 'REL_DELTA' && totals.relMagnitude + Math.abs(Number(eff.params.delta)) > EFFECT_LIMITS.maxTotalRelMagnitude) return 'Total relationship change too large this turn.';
  return null;
}

// --- Application: pure, synchronous, in-memory mutation of ctx.gameState.
// See file header for why this must stay synchronous. ---
function applyEffects(effects, ctx) {
  const applied = [];
  const touchedNpcIds = new Set();
  let ticksRequested = null;
  for (const eff of effects || []) {
    const def = EFFECT_DEFS[eff.type];
    if (!def || !def.implemented) continue;
    if (def.isTimeEffect) { ticksRequested = Number(eff.params.ticks); applied.push(eff); continue; }
    def.apply(eff.params, ctx);
    applied.push(eff);
    if (eff.params.npcId) touchedNpcIds.add(eff.params.npcId);
    if (eff.params.who && eff.params.who !== 'player') touchedNpcIds.add(eff.params.who);
  }
  return { applied, touchedNpcIds: [...touchedNpcIds], ticksRequested };
}

// --- Telemetry: parse/validation health, surfaced in the debug panel.
// Purely observational — "you cannot tune what you don't measure." ---
const LLM_TELEMETRY = {
  calls: 0,
  parseTiers: { 1: 0, 2: 0, 3: 0, 4: 0 },
  effectsProposed: 0, effectsAccepted: 0, effectsRejected: 0,
  rejectionSamples: [],
};
const LLM_TELEMETRY_MAX_SAMPLES = 20;

function recordParseTier(tier) {
  LLM_TELEMETRY.calls++;
  LLM_TELEMETRY.parseTiers[tier] = (LLM_TELEMETRY.parseTiers[tier] || 0) + 1;
}
function recordEffectOutcome(validated) {
  LLM_TELEMETRY.effectsProposed += validated.valid.length + validated.rejected.length;
  LLM_TELEMETRY.effectsAccepted += validated.valid.length;
  LLM_TELEMETRY.effectsRejected += validated.rejected.length;
  for (const r of validated.rejected) LLM_TELEMETRY.rejectionSamples.push({ type: r.effect.type, reason: r.reason, at: Date.now() });
  if (LLM_TELEMETRY.rejectionSamples.length > LLM_TELEMETRY_MAX_SAMPLES) {
    LLM_TELEMETRY.rejectionSamples = LLM_TELEMETRY.rejectionSamples.slice(-LLM_TELEMETRY_MAX_SAMPLES);
  }
}

// ===== /SECTION: EFFECTS =====
