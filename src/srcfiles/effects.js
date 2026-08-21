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
// `hunger` is deliberately NOT in the player's list. Phase 5 made hunger a
// rhythm: applyAdjustNeed treats a positive player-hunger delta as a meal —
// it raises satiety by the delta (capped at satietyStart) and counts toward
// mealsToday. 2026-08-17 audit (B2): the magnitude is now REAL (a snack
// tops you up, only a meal refills you); before that it was discarded and
// +1 fed you exactly as much as +40. Since ADJUST_NEED is
// llm:true, leaving hunger reachable lets the narration path hand out free
// meals and quietly bypass the food economy Phases 1-4 exist to create —
// design invariant 3 ("no action restores a need from nothing"). Every
// legitimate player-hunger path now goes through EAT_ITEM (trusted-only,
// llm:false), which consumes a real item. NPC hunger stays reachable: the
// drive fallback (DRIVE_DEFS' npc_eat) is a trusted producer and skips
// validation anyway, and NPC hunger is still a plain bar.
function validateNeedName(who, need) {
  const allowed = who === 'player' ? ['energy', 'hygiene', 'mood'] : ['hunger', 'energy', 'hygiene', 'social'];
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
function validateObjectDefId(defId) { return !!OBJECT_DEFS[defId] || `Unknown object: ${defId}`; }
function validateRoomId(roomId) { return !!ROOMS[roomId] || `Unknown room: ${roomId}`; }
function validateQtyRange(qtyStr) {
  if (!isFiniteNumber(qtyStr)) return `Not a number: ${qtyStr}`;
  const q = Number(qtyStr);
  return (q > 0 && q <= EFFECT_LIMITS.itemQtyCap) || `Quantity out of range (max ${EFFECT_LIMITS.itemQtyCap}).`;
}
// Food-overhaul Phase 4: SET_DISHES' payload — a JSON { dishType: count }
// map. Keys must be real DISH_DEFS types (the single owning table, invariant
// 5), counts non-negative integers, so it can't become an arbitrary write.
function validateDishMapJson(p) {
  let parsed;
  try { parsed = JSON.parse(p.map); } catch { return 'Malformed dish map.'; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Dish map must be an object.';
  for (const [type, count] of Object.entries(parsed)) {
    if (!DISH_DEFS[type]) return `Unknown dish type: ${type}`;
    if (!Number.isInteger(count) || count < 0) return `Bad count for ${type}.`;
  }
  return true;
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
// Servings-aware stock check for EAT_ITEM: a stack of a multi-serving item
// holds qty×servings (or (qty−1)×servings + servingsLeft when an item is
// already open), so "enough" means enough SERVINGS, not enough whole items.
// Reads the pure serving math from INVENTORY (stackServingsLeft).
function validateHasEnoughServings(defId, qtyStr, from, ctx) {
  if (!isFiniteNumber(qtyStr)) return `Not a number: ${qtyStr}`;
  const q = Number(qtyStr);
  const have = (locationStackList(from, ctx) || []).reduce(
    (sum, s) => (s.defId === defId ? sum + stackServingsLeft(s) : sum), 0
  );
  return have >= q || `Not enough ${defId} at ${from}.`;
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
    if (p.need === 'mood') {
      // Phase 5 (D1): mood is an impulse system. Every ADJUST_NEED player
      // mood line (roughly thirty across defs.actions/defs.computer/effects
      // and the LLM's effects vocab) keeps its old syntax but now pushes a
      // DECAYING impulse into player.moodEvents; the bar itself only moves
      // via the easing toward MOOD_TARGET in SIM's decayPlayerNeeds. The
      // AfterHours +0.25 becomes a real spike that fades over the following
      // day unless the target terms support it.
      pushMoodImpulse(ctx.gameState.player, delta, ctx.gameState.meta.clock.day);
    } else if (p.need === 'hunger') {
      // Phase 5 (D1): hunger is a rhythm, not a bar. The 0-100 display value
      // is derived from the fullness window via satietyFrom.
      //
      // 2026-08-17 audit (B2): a positive hunger delta is still a MEAL, but
      // the size now MATTERS. It used to be discarded entirely — any positive
      // delta reset hoursSinceLastMeal to 0 (satiety 90), so a cracker fed
      // you exactly as much as a feast and every food label ("restores 50
      // hunger" vs "8") was a lie.
      //
      // food-overhaul Phase 2 (D3/D4): the meal is now KCAL-driven. EAT_ITEM
      // sums the kcal it actually consumed (freshness-scaled) and passes it
      // here; applyPlayerMeal sets the D3 fullness window from it, feeds the
      // D4 ledger, and counts real meals toward mealsToday. A producer still
      // writing raw hunger points rides the legacy fallback inside
      // applyPlayerMeal (satiety points → window via satietyPerHour), so the
      // B2 magnitude semantics survive for the one path that predates kcal.
      // Negative deltas are inert for the player: hunger only advances with
      // time. EAT_ITEM is the only producer that reaches this branch.
      if (Number(p.delta) > 0 || Number(p.kcal || 0) > 0) {
        applyPlayerMeal(ctx.gameState, Number(p.kcal) || 0, { fallbackSatiety: Number(p.delta) || 0 });
      }
    } else {
      ctx.gameState.player[p.need] = clamp((ctx.gameState.player[p.need] || 0) + delta, 0, 100);
    }
  } else {
    const npc = ctx.gameState.npcs[p.who];
    if (npc) npc.needs[p.need] = clamp((npc.needs[p.need] || 0) + delta, 0, 100);
  }
}

// food-overhaul Phase 2 (D3/D4): the player's meal writer. The eaten kcal
// sets the D3 fullness window (added to what remains — a big meal eaten on a
// full stomach wastes its size, the B2 cap preserved) and feeds the D4 daily
// ledger. player.hunger is recomputed through satietyFrom here — one of the
// ONLY two player-hunger writers, the other being SIM's decayPlayerNeeds
// (design invariant 2). mealsToday counts only real meals (kcal ≥
// METABOLISM.minKcalForMeal), reconciling the well-fed/skipped terms to
// actual meals per D4. NPCs never reach this function (invariant 3).
function applyPlayerMeal(gameState, kcal, opts = {}) {
  const player = gameState?.player;
  if (!player) return;
  const meta = player.meta || (player.meta = {});
  const fallback = Number(opts.fallbackSatiety) || 0;
  const window = fullnessHoursFromKcal(kcal);
  if (window > 0) {
    const prev = fullnessRemaining(player);
    player.fullnessWindowHours = window;
    player.fullnessRemainingHours = Math.min(METABOLISM.fullnessCapHours, prev + window);
    if (kcal >= METABOLISM.minKcalForMeal) {
      player.mealsToday = Math.min(HUNGER_RHYTHM.mealsPerDayCap, (player.mealsToday || 0) + 1);
    }
  } else if (fallback > 0) {
    // Legacy fallback: hunger POINTS with no kcal. The B2 magnitude
    // semantics survive here — a snack tops you up (short window), a meal
    // refills you (long window); the window is points/satietyPerHour.
    const win = fallback / HUNGER_RHYTHM.satietyPerHour;
    const prev = fullnessRemaining(player);
    player.fullnessWindowHours = win;
    player.fullnessRemainingHours = Math.min(METABOLISM.fullnessCapHours, prev + win);
    player.mealsToday = Math.min(HUNGER_RHYTHM.mealsPerDayCap, (player.mealsToday || 0) + 1);
  }
  if (kcal > 0) meta.kcalToday = (meta.kcalToday || 0) + kcal;
  player.hunger = satietyFrom(player.fullnessRemainingHours, player.fullnessWindowHours || HUNGER_RHYTHM.starveHours);
}
function applyMoodDeltaEffect(p, ctx) {
  const delta = Number(p.delta);
  // Phase 5: the player-side MOOD_DELTA routes through the impulse pool like
  // ADJUST_NEED mood (invariant 6 — nothing writes player.mood directly).
  // NPC mood stays a direct write.
  if (p.who === 'player') { pushMoodImpulse(ctx.gameState.player, delta, ctx.gameState.meta.clock.day); return; }
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
  awardSkillXp(ctx.gameState.player, p.skillId, Number(p.xp), ctx.gameState.meta.clock.day);
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
  // Correctness plan Phase 3 (D8): a MEMORY_EPISODE line is emitted either by
  // the model during a scene or by a trusted producer marking a real beat —
  // both are conversation-tier, well above ambient background noise.
  if (npc) ctx.gameState.npcs[p.npcId] = addMemoryEpisode(npc, ctx.gameState.meta.clock.day, p.text, MEMORY_IMPORTANCE.conversational);
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
// Item-stack location refs (inventory overhaul Phase 8): 'player' resolves
// to the player's bag, a raw NPC id (npc_<n> / del / ...) resolves to that
// NPC's inventory (npc.inventory, the same uniform stack shape — see NPC's
// seedNpcInventory), and anything else is an object id resolving to the
// object instance's .contents. Object ids always start with `obj_`, so a
// raw NPC id can never collide with one. NPC refs are TRUSTED-PRODUCER
// only: the LLM reach-set (validateLocationRef) deliberately does NOT know
// about them, so the narrator can't reach into anyone's pockets — only
// drives and the player's own room-search action do.
function locationStackListMutable(ref, gameState) {
  if (ref === 'player') return gameState.player.inventory;
  if (gameState.npcs[ref]) return gameState.npcs[ref].inventory;
  return findObjectById(gameState, ref)?.contents;
}
function writeLocationStackList(ref, gameState, list) {
  if (ref === 'player') { gameState.player.inventory = list; return; }
  if (gameState.npcs[ref]) { gameState.npcs[ref].inventory = list; return; }
  const obj = findObjectById(gameState, ref);
  if (obj) obj.contents = list;
}

// Preservation lookup for a MOVE_ITEM/EAT_ITEM location ref — 'player'
// resolves to the bag baseline (ROT.bagPreservation); an object id
// resolves to its OBJECT_DEFS container block (null for a non-container,
// which freshness treats as the 1.0 default). Shared by applyMoveItem's
// retimeStack and applyEatItem's spoiled-food penalties so the two call
// sites can't drift apart on what "this container's multiplier" means.
function containerDefForRef(ref, gameState) {
  if (ref === 'player') return null;
  // NPC bag — same 1.0 preservation baseline as the player's bag (D5).
  if (gameState.npcs[ref]) return null;
  const obj = findObjectById(gameState, ref);
  return obj ? OBJECT_DEFS[obj.defId] : null;
}

function applySetObjectState(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (obj) obj.state = { ...obj.state, [p.key]: p.value };
}
// What is laid out on a table right now, as an ordered list of ITEM_DEFS ids.
// It lives in `flags` rather than `state` because state values must stay
// string enums (cleanRoomObjects and validateObjectStateChange both depend on
// that), and a spread is a list — same reason the phone's numeric battery is
// a flag. Unknown ids are dropped rather than trusted, and the list is capped,
// so this can't become an arbitrary write.
//
// Nothing clears it, on purpose: IMAGE reads it only while the table's
// `clutter` state is 'cluttered', so clearing the table is what ends the
// spread. One state change, no second cleanup path to forget — the same
// derive-don't-mirror rule the rot signal follows.
function applySetTableSpread(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj) return;
  const ids = String(p.defIds || '').split(/\s+/).filter(id => ITEM_DEFS[id]);
  obj.flags = { ...(obj.flags || {}), spread: ids.slice(0, COMMITMENT_TUNING.maxSpreadDishes) };
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
  // Inventory overhaul Phase 1: the moved quantity carries the source
  // stack's meta with it (acquiredDay etc.) so a transfer never resets an
  // item's age. Phase 4 (D5): retimeStack then recomputes the moved
  // stack's remaining life against the destination's preservation
  // multiplier — taking milk out of the fridge for an hour must not cost
  // it a week. The destination merge (addStack) is cohort-aware since B2,
  // so a merge only ever fuses stacks with equal effective freshness in
  // this container.
  const srcStack = fromList.find(s => s.defId === p.defId);
  const { stacks: afterRemove, removed } = removeStack(fromList, p.defId, Number(p.qty));
  writeLocationStackList(p.from, ctx.gameState, afterRemove);
  if (removed <= 0) return;
  const now = gameDaysNow(ctx.gameState.meta.clock);
  const toList = locationStackListMutable(p.to, ctx.gameState) || [];
  const movedMeta = srcStack
    ? retimeStack(srcStack, containerDefForRef(p.from, ctx.gameState), containerDefForRef(p.to, ctx.gameState), now).meta
    : srcStack?.meta;
  writeLocationStackList(p.to, ctx.gameState, addStack(toList, p.defId, removed, p.to === 'player' ? 'player' : null, movedMeta, now));
}
function applyConsumeItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const { stacks: afterRemove, removed } = removeStack(fromList, p.defId, Number(p.qty));
  writeLocationStackList(p.from, ctx.gameState, afterRemove);
  if (removed <= 0) return;
  // Phase 8 (B1 fix): CONSUME_ITEM no longer hardcodes 'player' — the
  // eater is `who`, defaulting to 'player' (the optional trailing `?`
  // param; see parseEffectParams). This is what lets an NPC actually
  // consume the player's groceries out of the fridge (the hunger drive)
  // instead of just wishing its hunger away. The consumable's mood entry
  // is skipped for an NPC the same way EAT_ITEM skips it — npc.mood is the
  // direct bar, not a needs-map field (set_meal/drives push it separately).
  const who = p.who || 'player';
  const def = ITEM_DEFS[p.defId];
  for (const [need, amt] of Object.entries(def?.consumable || {})) {
    if (who !== 'player' && need === 'mood') continue;
    // food-overhaul Phase 2 (D1/D4): kcal never flows through CONSUME_ITEM.
    // It is the narrator's incidental-consumption verb (and the NPC drive's
    // raid verb); only EAT_ITEM — a real meal — feeds the player's kcal
    // ledger, and the NPC side converts calories at consume time into their
    // plain hunger bar (design invariant 3), so there is no kcal ledger on
    // this path at all.
    if (need === 'kcal') continue;
    applyAdjustNeed({ who, need, delta: String(amt * removed) }, ctx);
  }
}
// D27/D28 read helpers (food-overhaul Phase 3). The betterHot/frozenFood
// contracts are STATIC per-dish declarations — on the RECIPES entry for a
// plate (via meta.plate.recipeKey), on the ITEM_DEFS entry for def-driven
// food — read at eat time against how the food is being eaten NOW. They
// are deliberately not plate-instance fields: the dish's nature (hot food,
// frozen treat) never changes per instance, so baking it into the snapshot
// would be redundant AND would freeze the flag against a later recipe
// correction. What IS on the instance is wasReheated — the one thing that
// genuinely is per-batch.
function stackBetterHot(stack) {
  const plate = stack?.meta?.plate;
  if (plate) return !!(RECIPES[plate.recipeKey]?.betterHot);
  return !!ITEM_DEFS[stack?.defId]?.betterHot;
}
function stackFrozenFood(stack) {
  const plate = stack?.meta?.plate;
  if (plate) {
    if (plate.frozenFood) return true;
    return !!(RECIPES[plate.recipeKey]?.frozenFood);
  }
  return !!ITEM_DEFS[stack?.defId]?.frozenFood;
}

// EAT_ITEM (inventory overhaul Phase 3): the eating verb.
// Consumes `qty` SERVINGS of defId from the given location (bag or a
// reachable container), restores the eater's consumable scaled by
// servings/def.servings, and re-encodes the stack in place: a
// multi-serving item (def.servings > 1) leaves a partial stack with
// meta.servingsLeft, so eating one slice of a pizza keeps the rest where
// it was (fridge leftovers stay in the fridge — a bag would spoil them
// 4× faster). Single-serving defs (servings absent = 1) behave exactly
// like CONSUME_ITEM: one item gone, full consumable restored — that's why
// the panel's Use verb can route through this for everything.
//
// Phase 7 (D7): an optional trailing `who` (default 'player') feeds that
// NPC instead — the shared-meal primitive behind set_meal, where every
// attendee gets one serving from the same dish with the same math. The
// consumable's mood is skipped for an NPC (npc mood is the direct bar, not
// the needs map — set_meal pushes it separately via MOOD_DELTA).
//
// Phase 4 (spoiled-food penalties, D5/D6) + the food-decay overhaul:
// restore is scaled by the eaten stack's freshness at its current container
// — Stale restores ROT.staleRestoreMultiplier, Spoiled restores
// ROT.spoiledRestoreMultiplier and additionally costs mood + energy (the
// food-poisoning beat, once per eating event), routed to whoever ate it.
// Rotten is NOT edible and is skipped outright: the picker filters it
// (INVENTORY's edibleStacks) and this refuses it, so the two can't drift
// into a state where the UI offers something the applier won't serve.
// Freshness is derived (freshnessOf), so a stack left in a fridge stays
// edible far longer than the same stack in a bag, and eating either late is
// punished the moment it actually is late.
//
// Food-overhaul Phase 3 (D5/D25/D27/D28): a PLATE stack (meta.plate) is
// eaten by the same serving ledger but from the instance — kcal from
// plate.kcalPerServing (player), hunger for an NPC converted from that same
// kcal to their one number (invariant 3), mood from plate quality via
// plateMoodPerServing — and the D27/D28 mood gates apply: a betterHot dish
// eaten cold forfeits its whole mood bonus, and food eaten still frozen
// costs a flat mood penalty unless the dish is frozenFood.
// Trusted-only (llm:false): eating is the player's own verb; the narrator
// still uses CONSUME_ITEM for incidental consumption.
function applyEatItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const def = ITEM_DEFS[p.defId];
  if (!def) return;
  const who = p.who || 'player';
  const sv = itemServings(def);
  const kcalPerSv = kcalOf(def) / sv;
  const fromDef = containerDefForRef(p.from, ctx.gameState);
  const now = gameDaysNow(ctx.gameState.meta.clock);
  let remaining = Math.max(0, Math.floor(Number(p.qty) || 0));
  let ateSpoiled = false;
  let kcalEaten = 0;
  const out = [];
  for (const s of fromList) {
    if (remaining <= 0 || s.defId !== p.defId) { out.push(s); continue; }
    const have = stackServingsLeft(s);
    if (have <= 0) { out.push(s); continue; }
    const fresh = freshnessOf(s, fromDef, now);
    // Rotten is refuse, not food — it stays in the container untouched and
    // the eater moves on to the next stack (or goes hungry).
    if (fresh?.key === 'rotten') { out.push(s); continue; }
    const eat = Math.min(remaining, have);
    remaining -= eat;
    const mult = fresh?.key === 'spoiled' ? ROT.spoiledRestoreMultiplier
      : fresh?.key === 'stale' ? ROT.staleRestoreMultiplier : 1;
    if (fresh?.key === 'spoiled') ateSpoiled = true;
    const plate = s.meta?.plate;
    // Food-overhaul Phase 8 (D21): tasting a dish is what unlocks its
    // ChefBook card — a cooked plate by its recipe, a ready-made item
    // (restaurant delivery) by its own defId. COMPUTER's
    // maybeUnlockRecipeCard no-ops on anything that isn't card-eligible
    // (a raw ingredient, a freeform experiment), so this is safe to call
    // unconditionally for every stack the player's bite draws from.
    if (who === 'player') maybeUnlockRecipeCard(ctx.gameState, plate ? plate.recipeKey : s.defId);
    // food-overhaul Phase 2 (D3): the player's kcal is the meal — scaled by
    // the same freshness multiplier as every restore (a stale plate fills
    // you less across the board), summed over the stacks this bite drew
    // from, and applied once as a single meal event after the loop. Phase 3:
    // a plate's kcal is the instance's kcalPerServing, not the carrier def's.
    if (who === 'player') kcalEaten += (plate ? plate.kcalPerServing : kcalPerSv) * eat * mult;
    // Phase 3 (D27/D28): the mood rules that make the reheat step matter.
    //   D27 — a betterHot dish eaten NOT hot (never reheated and past the
    //   just-made window, or still frozen) forfeits its ENTIRE mood bonus;
    //   D28 — food eaten still frozen costs a flat mood penalty unless the
    //   dish is frozenFood (ice cream, popsicles: meant to be eaten frozen).
    //   The mood stays a PLAYER restore here — an NPC's plate mood is Phase
    //   7's rewire (set_meal feeds NPCs through its own MOOD_DELTA path).
    const cold = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
    const hotNow = !cold && ((plate?.wasReheated || s.meta?.wasReheated) || fresh?.key === 'fresh');
    let moodPerSv = plate ? (plateMoodPerServing(s, fresh) ?? 0) : ((def.consumable?.mood || 0) / sv);
    if (stackBetterHot(s) && !hotNow) moodPerSv = 0;
    if (who === 'player' && moodPerSv !== 0) {
      applyAdjustNeed({ who, need: 'mood', delta: String(moodPerSv * eat) }, ctx);
    }
    if (who === 'player' && cold && !stackFrozenFood(s) && PLATE_TUNING.frozenEatenPenalty > 0) {
      applyAdjustNeed({ who, need: 'mood', delta: String(-PLATE_TUNING.frozenEatenPenalty * eat) }, ctx);
    }
    // Raw-ingredient consequence (2026-08-20): a rawDangerous def eaten
    // as-is — never as a plate, so a cooked omelette is not raw eggs — is
    // a small food-safety sting. Scaled per serving like the frozen
    // penalty above; the eat picker and narration both warn first.
    if (who === 'player' && !plate && def.rawDangerous) {
      applyAdjustNeed({ who, need: 'mood', delta: String(-(RAW_FOOD.moodPenalty * eat)) }, ctx);
      applyAdjustNeed({ who, need: 'energy', delta: String(-(RAW_FOOD.energyPenalty * eat)) }, ctx);
    }
    // Food-overhaul Phase 5 (D15): a BURNT plate's snapshot carries its
    // flaw, and eating it stings a little on top of the quality dent —
    // burnt food is still food (never deleted), just a worse meal.
    if (who === 'player' && plate?.flaws?.includes('burnt') && (COOK_TUNING.burntMoodSting || 0) > 0) {
      applyAdjustNeed({ who, need: 'mood', delta: String(-COOK_TUNING.burntMoodSting * eat) }, ctx);
    }
    if (plate) {
      // Plate restore: kcal (player) handled above; hunger for an NPC
      // converts the plate's per-serving kcal into their ONE number
      // (design invariant 3 — calories become hunger at consume time and
      // the plate never touches the player's meta). The carrier def's
      // placeholder consumable is never read.
      if (who !== 'player') {
        applyAdjustNeed({ who, need: 'hunger', delta: String(plateHungerPerServing(s) * eat * mult) }, ctx);
      }
    } else {
      for (const [need, amt] of Object.entries(def.consumable || {})) {
        // NPCs have no mood NEED — their mood is the direct bar, which
        // ADJUST_NEED doesn't touch; the caller (set_meal) adds MOOD_DELTA.
        if (who !== 'player' && need === 'mood') continue;
        // kcal isn't a need (there's no ADJUST_NEED kcal bar) and the
        // PLAYER's hunger restore comes from the eaten kcal, not the def's
        // hunger points — both handled by the single applyAdjustNeed below.
        // NPC hunger still restores by the def's hunger value (calories
        // convert to their one number at consume time, invariant 3).
        if (need === 'kcal') continue;
        if (who === 'player' && need === 'hunger') continue;
        applyAdjustNeed({ who, need, delta: String(amt * eat / sv * mult) }, ctx);
      }
    }
    const left = have - eat;
    if (left <= 0) continue; // stack fully eaten — drop it
    if (plate) {
      // The plate's serving ledger lives on the instance — eating a serving
      // drains it there and leaves the batch (and its snapshot) intact.
      const meta = { ...(s.meta || {}) };
      meta.plate = { ...plate, servings: { ...plate.servings, left } };
      out.push({ ...s, meta });
    } else {
      const qty = Math.ceil(left / sv);
      const openLeft = left - (qty - 1) * sv;
      const meta = { ...(s.meta || {}) };
      if (openLeft >= sv) {
        delete meta.servingsLeft; // back to a whole-stack representation
        out.push({ ...s, qty, meta });
      } else {
        meta.servingsLeft = openLeft;
        out.push({ ...s, qty, meta });
      }
    }
  }
  if (ateSpoiled) {
    // The food-poisoning beat applies to whoever ate it. Player mood is an
    // impulse (ADJUST_NEED mood routes through pushMoodImpulse); an NPC's
    // mood is their direct bar, so it goes through MOOD_DELTA semantics.
    if (who === 'player') {
      applyAdjustNeed({ who: 'player', need: 'mood', delta: String(-ROT.spoiledMoodPenalty) }, ctx);
    } else {
      applyMoodDeltaEffect({ who, delta: String(-ROT.spoiledMoodPenalty) }, ctx);
    }
    applyAdjustNeed({ who, need: 'energy', delta: String(-ROT.spoiledEnergyPenalty) }, ctx);
  }
  if (who === 'player' && kcalEaten > 0) {
    applyAdjustNeed({ who: 'player', need: 'hunger', delta: '0', kcal: kcalEaten }, ctx);
  }
  writeLocationStackList(p.from, ctx.gameState, out);
}
// Food-overhaul Phase 3 (D25): DESTROY_ITEM on a PLATE stack destroys
// SERVINGS off the instance's ledger, not whole qty — binning one leftover
// serving of a 4-serving batch leaves the other three. (The DSL quantity is
// interpreted as servings for a plate stack, whole items otherwise.)
function applyDestroyItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  let remaining = Math.max(0, Math.floor(Number(p.qty) || 0));
  const out = [];
  for (const s of fromList) {
    if (remaining <= 0 || s.defId !== p.defId) { out.push(s); continue; }
    const plate = s.meta?.plate;
    if (plate) {
      const left = stackServingsLeft(s);
      if (left <= 0) { out.push(s); continue; }
      const nleft = left - Math.min(remaining, left);
      remaining -= Math.min(remaining, left);
      if (nleft <= 0) continue; // batch fully binned — drop the stack
      const meta = { ...s.meta, plate: { ...plate, servings: { ...plate.servings, left: nleft } } };
      out.push({ ...s, meta });
    } else {
      if (s.qty <= remaining) { remaining -= s.qty; continue; }
      out.push({ ...s, qty: s.qty - remaining });
      remaining = 0;
    }
  }
  writeLocationStackList(p.from, ctx.gameState, out);
}
// Food-overhaul Phase 3: SPAWN_ITEM takes an optional trailing JSON meta
// (the ...metaJson param — the whole meta object, e.g. the { plate, cohort,
// acquiredDay } a cooked plate spawns with). JSON.stringify never emits
// whitespace, so the JSON arrives as a single token; a malformed/absent
// meta degrades to the plain spawn (addStack without meta).
function applySpawnItem(p, ctx) {
  const toList = locationStackListMutable(p.to, ctx.gameState) || [];
  let meta;
  if (p.metaJson) {
    try { meta = JSON.parse(p.metaJson); } catch { meta = undefined; }
  }
  writeLocationStackList(p.to, ctx.gameState, addStack(toList, p.defId, Number(p.qty), p.to === 'player' ? 'player' : null, meta, gameDaysNow(ctx.gameState.meta.clock)));
}

// Food-overhaul Phase 5 (D8): an ingredient TRANSFORMED INTO a cooked dish
// — the engine's seasoning consumption (salt/spice/sugar become part of
// the plate; you'd never eat them raw). Mechanically a qty-decrement like
// DESTROY_ITEM, deliberately its own verb: it is engine-only (llm:false)
// and says "this went somewhere", so the narrator can't nibble groceries
// through a name that implies consumption.
function applyTransformItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const { stacks } = removeStack(fromList, p.defId, Number(p.qty));
  writeLocationStackList(p.from, ctx.gameState, stacks);
}

// COOK_STEP's validator: the trailing metaJson must parse to an object
// carrying a real `plate` snapshot — the only thing the effect exists to
// spawn (invariant 1: a cooked plate is its instance or it isn't a plate).
function validateCookPlateJson(p) {
  let meta;
  try { meta = JSON.parse(p.metaJson); } catch { return 'Invalid plate meta.'; }
  if (!meta?.plate || typeof meta.plate.kcalPerServing !== 'number' || !meta.plate.servings) {
    return 'COOK_STEP requires a plate snapshot.';
  }
  return true;
}

// Food-overhaul Phase 6 (D14): AUTO_COOK_UNLOCK's validator — the trusted
// producer's declaration that a recipe was cooked to a grade at or above
// its auto-cook threshold, recorded on world.autoCookCleared so instant
// cook stays unlocked forever. The narrator's gate is the effect's own
// llm:false flag (the validate() signature gets no tier), so this only
// checks the payload names a real recipe and a real grade.
function validateAutoCookUnlock(p) {
  if (!p || typeof p.recipeId !== 'string' || !RECIPES[p.recipeId]) return 'AUTO_COOK_UNLOCK names an unknown recipe.';
  if (!GRADES.some(g => g.grade === p.grade)) return 'AUTO_COOK_UNLOCK requires a real grade.';
  return true;
}

// Food-overhaul Phase 6 (D14): the mastery proof. Writes (or raises) the
// best grade a recipe has been cooked to, onto world.autoCookCleared. The
// write mutates ctx.gameState.world, which the save pipeline persists like
// any world key (state.js SAVE_KEYS); keeping the BEST grade matters
// because an equipment upgrade can lower the threshold again, and a better
// past proof should never be regressed by a later mediocre cook.
function applyAutoCookUnlock(p, ctx) {
  const gs = ctx.gameState;
  const cleared = { ...(gs.world?.autoCookCleared || {}) };
  const cur = cleared[p.recipeId];
  const curIdx = GRADES.findIndex(g => g.grade === cur);
  const newIdx = GRADES.findIndex(g => g.grade === p.grade);
  if (!cur || curIdx < 0 || (newIdx >= 0 && newIdx < curIdx)) cleared[p.recipeId] = p.grade;
  gs.world = gs.world || {};
  gs.world.autoCookCleared = cleared;
}

// Food-overhaul Phase 3 (D26/D27/D29): the reheat verb — the kitchen touch
// that makes frozen batches eatable and stale leftovers good again. Since
// Phase 6 there are TWO kitchen touches: this effect backs both the stove
// reheat (self.reheat, the 10-min Phase-3 fallback) and the microwave
// (self.microwave, the 3/1-min fast path) — they share the effect, only
// the action's time differs.
//   PLATE stacks: sets meta.plate.wasReheated (the D27 hot-now flag),
//   resolves a thaw in one step (reheating from frozen skips waiting out
//   THAW_TUNING — D26), and when the batch has already gone stale/spoiled
//   resets the freshness anchor to now (D7's "reheat restores quality to a
//   stale portion"). A fresh plate keeps its anchor — reheating never
//   extends a just-cooked batch's life.
//   def-driven stacks (restaurant leftovers): sets meta.wasReheated and
//   resolves a thaw, but never resets the freshness anchor — def-driven
//   food has no plate quality to restore, and nothing to exploit.
// Reheats the WHOLE stack (one batch = one kitchen touch); a plate's
// wasReheated is per-instance by design.
function applyReheatItem(p, ctx) {
  const fromList = locationStackListMutable(p.from, ctx.gameState);
  if (!fromList) return;
  const now = gameDaysNow(ctx.gameState.meta.clock);
  const fromDef = containerDefForRef(p.from, ctx.gameState);
  const out = [];
  let done = false;
  for (const s of fromList) {
    if (!done && s.defId === p.defId && stackServingsLeft(s) > 0) {
      const plate = s.meta?.plate;
      const meta = { ...(s.meta || {}) };
      if (plate) {
        const fresh = freshnessOf(s, fromDef, now);
        const needsReset = s.meta?.frozen || (fresh && (fresh.key === 'stale' || fresh.key === 'spoiled'));
        meta.plate = { ...plate, wasReheated: true };
        if (needsReset) {
          delete meta.frozen;
          meta.cohort = now;
        }
      } else {
        meta.wasReheated = true;
        if (s.meta?.frozen) delete meta.frozen;
      }
      out.push({ ...s, meta });
      done = true;
    } else {
      out.push(s);
    }
  }
  writeLocationStackList(p.from, ctx.gameState, out);
}
// --- Dish effects (food-overhaul Phase 4, D9/D11) ---
// Dish dirt is a per-type MAP on an object (obj.dishes — DISH_DEFS the
// single owning definition, invariant 5), so dirtying and washing are their
// own verbs rather than SET_OBJECT_STATE ladder writes. Trusted-only
// (llm:false): what gets dirtied and washed is a consequence of the
// cook/eat/wash actions actually running, never something the narrator
// asserts. Room cleanliness refreshes here (the same D7 hook ACTIONS applies
// after a SET_OBJECT_STATE), because the room's grime derives from the maps.
function applyAddDishes(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj) return;
  addDishUnits(obj, { [p.dishType]: Number(p.qty) });
  if (obj.bucket?.startsWith('room_') && typeof refreshRoomCleanliness === 'function') {
    refreshRoomCleanliness(ctx.gameState, obj.bucket.slice('room_'.length));
  }
}
function applySetDishes(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj) return;
  try { obj.dishes = JSON.parse(p.map) || {}; } catch { return; }
  obj.dishUnits = dishUnitsOf(obj);
  if (obj.bucket?.startsWith('room_') && typeof refreshRoomCleanliness === 'function') {
    refreshRoomCleanliness(ctx.gameState, obj.bucket.slice('room_'.length));
  }
}
function applyCleanDishes(p, ctx) {
  const obj = findObjectById(ctx.gameState, p.objId);
  if (!obj) return;
  clearDishUnits(obj, p.units == null ? null : Number(p.units));
  if (obj.bucket?.startsWith('room_') && typeof refreshRoomCleanliness === 'function') {
    refreshRoomCleanliness(ctx.gameState, obj.bucket.slice('room_'.length));
  }
}
// Loads the dishwasher from the kitchen sink + the kitchen/dining tables
// (the same scope self.dishes washes) up to the given dish units. The load
// lives on the instance (obj.dishwasher.load) — capacity is enforced by the
// action (dishwasherCapacityUnits); the effect just moves what it can.
function applyLoadDishwasher(p, ctx) {
  const dw = findObjectById(ctx.gameState, p.objId);
  if (!dw) return;
  const rec = dw.dishwasher || (dw.dishwasher = { load: {}, cycleActiveUntilAbs: 0 });
  if (rec.cycleActiveUntilAbs > 0) return; // mid-cycle — can't load a running machine
  let remaining = Math.max(0, Math.floor(Number(p.units) || 0));
  if (remaining <= 0) return;
  const load = { ...(rec.load || {}) };
  const gs = ctx.gameState;
  for (const roomId of ['kitchen', 'dining']) {
    const sources = Object.values(gs.objects?.[`room_${roomId}`] || {})
      .filter(o => o.defId === 'sink_kitchen' || o.defId === 'kitchen_table' || o.defId === 'dining_table');
    for (const src of sources) {
      if (remaining <= 0) break;
      const types = Object.keys(src.dishes || {})
        .sort((a, b) => (DISH_DEFS[b]?.unit || 1) - (DISH_DEFS[a]?.unit || 1));
      for (const type of types) {
        const count = src.dishes[type];
        if (!(count > 0)) continue;
        const unit = DISH_DEFS[type]?.unit || 1;
        const removable = Math.min(count, Math.floor(remaining / unit));
        if (removable <= 0) continue;
        src.dishes[type] = count - removable;
        load[type] = (load[type] || 0) + removable;
        remaining -= removable * unit;
      }
      const kept = Object.fromEntries(Object.entries(src.dishes).filter(([, n]) => n > 0));
      src.dishes = kept;
      src.dishUnits = dishUnitsOf(src);
      if (src.bucket?.startsWith('room_') && typeof refreshRoomCleanliness === 'function') {
        refreshRoomCleanliness(ctx.gameState, src.bucket.slice('room_'.length));
      }
    }
  }
  rec.load = load;
}
// Starts a dishwasher cycle. cycleActiveUntilAbs is an absolute-clock anchor
// on the gameDaysNow scale (same pattern as preparedAbs/frozenAtAbs) —
// completion is a lazy reader (ITEMS' dishwasherCycleProgress), never a
// per-tick loop. RUN_DISHWASHER also flips the derived `cycle` state so the
// floorplan reads it; the lazy resolver flips it back on write paths.
function applyRunDishwasher(p, ctx) {
  const dw = findObjectById(ctx.gameState, p.objId);
  if (!dw) return;
  const rec = dw.dishwasher || (dw.dishwasher = { load: {}, cycleActiveUntilAbs: 0 });
  if (rec.cycleActiveUntilAbs > 0) return; // already cycling
  const now = gameDaysNow(ctx.gameState.meta.clock);
  if (now == null) return;
  const minutes = dishwasherCycleMinutes(ctx.gameState) / (CLOCK.ticksPerDay * 30);
  rec.cycleActiveUntilAbs = now + minutes;
  if (dw.state) dw.state = { ...dw.state, cycle: 'running' };
}
// SPAWN_OBJECT (inventory overhaul Phase 6): place a buyable hobby OBJECT_DEFS// instance into a room bucket — the second half of the Place verb (the first
// is DESTROY_ITEM removing the shipped ITEM_DEFS stack from the bag). The
// object is created with makeObjectInstance (WORLD) so it carries the exact
// instance shape every other object has (seeded id, ownerId 'player', state,
// bucket, spawnedDay), which is what lets it persist through saveAtBoundary's
// wholesale bucket write and be found by findObjectById/room-scoped reads like
// any fixture. Trusted-producer only (llm:false): spawning arbitrary objects
// is not something the narrator gets to do.
// Perception plan Phase 4. Deletes an object from whichever bucket holds it.
// findObjectById already scans every bucket, so this needs no roomId param
// and cannot be pointed at the wrong copy of an id.
function applyDestroyObject(p, ctx) {
  const found = findObjectById(ctx.gameState, p.objId);
  if (!found) return;
  const bucketMap = ctx.gameState.objects[found.bucket];
  if (bucketMap) delete bucketMap[p.objId];
}

function applySpawnObject(p, ctx) {
  const def = OBJECT_DEFS[p.defId];
  if (!def) return;
  const roomId = p.roomId || ctx.gameState.player.location;
  const bucket = `room_${roomId}`;
  const bucketMap = ctx.gameState.objects[bucket] || (ctx.gameState.objects[bucket] = {});
  // Perception plan Phase 4: was `Object.keys(bucketMap).length`, which
  // repeats as soon as anything is removed from the bucket and hands the new
  // object an id that silently overwrites an existing one. uniqueObjectSlot
  // (WORLD) walks to the first free slot.
  const slot = uniqueObjectSlot(bucketMap, ctx.gameState.meta.seed, bucket, p.defId);
  const inst = makeObjectInstance(
    { defId: p.defId, ownerId: 'player' },
    bucket, slot, ctx.gameState.meta.seed, roomId, ctx.gameState.npcs, ctx.gameState.meta.clock.day
  );
  if (!inst) return;
  bucketMap[inst.id] = inst;
}

// --- Stealth appliers (P6) ---
function applyWitness(p, ctx) {
  const npc = ctx.gameState.npcs[p.npcId];
  if (!npc) return;
  const text = WITNESS_MEMORY_TEMPLATES[p.certainty];
  // Correctness plan Phase 3 (D8): witnessing a boundary violation outright
  // is a defining beat; merely suspecting one is conversation-tier.
  ctx.gameState.npcs[p.npcId] = addMemoryEpisode(npc, ctx.gameState.meta.clock.day, text,
    p.certainty === 'certain' ? MEMORY_IMPORTANCE.significant : MEMORY_IMPORTANCE.conversational);
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
  // Trusted-only (llm:false): what is on the table is a consequence of the
  // set_meal action having actually consumed those dishes, not something the
  // narrator may assert. `...defIds` takes the rest of the line as a
  // space-separated id list.
  SET_TABLE_SPREAD: {
    paramShape: ['objId', '...defIds'], llm: false, implemented: true,
    validate: (p, ctx) => !!ctx.roomObjects[p.objId] || `Not reachable: ${p.objId}`,
    apply: applySetTableSpread,
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
    // Phase 8 (B1 fix): optional trailing `who` (default 'player') — who
    // actually eats/uses the consumed qty. Trusted drives use it so a
    // hungry roommate consumes the player's groceries out of the fridge
    // for real (applyConsumeItem routes the restore to that NPC). The LLM
    // never gets a who token — the reach-set doesn't expose NPC refs.
    paramShape: ['defId', 'qty', 'from', 'who?'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyConsumeItem,
  },
  EAT_ITEM: {
    // Phase 3 eating verb — consumes SERVINGS (see applyEatItem), trusted-only.
    // Phase 7 (D7): optional trailing `who` (default 'player') — a shared
    // meal feeds each attendee their own serving from the same dish, so the
    // same freshness/serving/penalty math applies per eater.
    paramShape: ['defId', 'qty', 'from', 'who?'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnoughServings(p.defId, p.qty, p.from, ctx)),
    apply: applyEatItem,
  },
  DESTROY_ITEM: {
    paramShape: ['defId', 'qty', 'from'], llm: true, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyDestroyItem,
  },
  SPAWN_ITEM: {
    // Food-overhaul Phase 3: optional trailing `...metaJson` — the stack's
    // meta as a compact JSON object (SPAWN_ITEM cooked_meal 1 obj_x
    // {"plate":{...}}). Trusted producers (self.cook's plate spawn) use it;
    // every existing call is 3 tokens and parses unchanged.
    paramShape: ['defId', 'qty', 'to', '...metaJson'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.to, ctx)),
    apply: applySpawnItem,
  },
  // Food-overhaul Phase 3 (D26/D27/D29): the reheat verb behind self.reheat
  // — marks a batch reheated (wasReheated), resolves a thaw, and restores a
  // stale plate's freshness anchor. Trusted-only: reheating is the player's
  // own kitchen action, not something the narrator asserts.
  REHEAT_ITEM: {
    paramShape: ['defId', 'from'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateLocationRef(p.from, ctx)),
    apply: applyReheatItem,
  },
  // Food-overhaul Phase 5 (D8): the cooking engine's seasoning verb — an
  // ingredient TRANSFORMED INTO a dish (salt/spice/sugar). Trusted-only
  // (llm:false), mechanically a qty-decrement: the narrator gets
  // DESTROY_ITEM, not a verb that implies the food went somewhere.
  TRANSFORM_ITEM: {
    paramShape: ['defId', 'qty', 'from'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.from, ctx), () => validateHasEnough(p.defId, p.qty, p.from, ctx)),
    apply: applyTransformItem,
  },
  // Food-overhaul Phase 5 (D5/invariant 1): the plate-spawn verb — the ONLY
  // way a cooked plate INSTANCE enters the world. Same applier as
  // SPAWN_ITEM's meta path, but validated to carry a real plate snapshot so
  // the engine's output can't arrive without its instance data. Trusted-only.
  COOK_STEP: {
    paramShape: ['defId', 'qty', 'to', '...metaJson'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateItemDefId(p.defId), () => validateQtyRange(p.qty), () => validateLocationRef(p.to, ctx), () => validateCookPlateJson(p)),
    apply: applySpawnItem,
  },
  // Food-overhaul Phase 6 (D14): the mastery proof — records that a recipe
  // was cooked to a grade at or above its auto-cook threshold, unlocking
  // instant cook forever. Trusted-only: buildCookEffects emits it when the
  // plate it just served clears the bar; the narrator can't grant it.
  AUTO_COOK_UNLOCK: {
    paramShape: ['recipeId', 'grade'], llm: false, implemented: true,
    validate: (p) => validateAutoCookUnlock(p),
    apply: applyAutoCookUnlock,
  },
  // Food-overhaul Phase 4 (D9): the dish verbs. ADD_DISHES/SET_DISHES/
  // CLEAN_DISHES address a surface's dish MAP (the sink, the tables) —
  // they replace the old `SET_OBJECT_STATE ... dishes few/many` recipe
  // leaves and the wash action's state write. LOAD_DISHWASHER moves sink/
  // table units into the appliance's load; RUN_DISHWASHER starts the cycle.
  // All trusted-only: what gets dirtied and washed is a consequence of the
  // cook/eat/wash actions actually running.
  ADD_DISHES: {
    paramShape: ['objId', 'dishType', 'qty'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx),
      () => !!DISH_DEFS[p.dishType] || `Unknown dish type: ${p.dishType}`,
      () => validateQtyRange(p.qty)),
    apply: applyAddDishes,
  },
  SET_DISHES: {
    // `...mapJson` takes the rest of the line as one JSON { dishType: count }
    // map (same single-token convention as SPAWN_ITEM's metaJson).
    paramShape: ['objId', '...mapJson'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx), () => validateDishMapJson(p)),
    apply: applySetDishes,
  },
  CLEAN_DISHES: {
    // Optional trailing `units` — absent clears the whole map (the wash
    // action hands its skill-scaled capacity; the dishwasher's unload
    // clears the load).
    paramShape: ['objId', 'units?'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx),
      () => (p.units == null ? true : validateQtyRange(p.units))),
    apply: applyCleanDishes,
  },
  LOAD_DISHWASHER: {
    paramShape: ['objId', 'units'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx),
      () => findObjectById(ctx.gameState, p.objId)?.defId === 'dishwasher' || 'Not the dishwasher.',
      () => validateQtyRange(p.units)),
    apply: applyLoadDishwasher,
  },
  RUN_DISHWASHER: {
    paramShape: ['objId'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateReachableObject(p.objId, ctx),
      () => findObjectById(ctx.gameState, p.objId)?.defId === 'dishwasher' || 'Not the dishwasher.'),
    apply: applyRunDishwasher,
  },
  SPAWN_OBJECT: {
    // Phase 6 hobby placement — see applySpawnObject. Trusted-only: the
    // narrator doesn't get to put furniture in rooms.
    paramShape: ['defId', 'roomId'], llm: false, implemented: true,
    validate: (p, ctx) => firstFailure(validateObjectDefId(p.defId), () => validateRoomId(p.roomId)),
    apply: applySpawnObject,
  },
  DESTROY_OBJECT: {
    // Perception plan Phase 4 — the counterpart to SPAWN_OBJECT, added for
    // binning a note. Trusted-only for the same reason SPAWN_OBJECT is: the
    // narrator does not get to delete the furniture. Reach-checked all the
    // same, so even a trusted producer can only destroy something in the
    // room it is acting in.
    paramShape: ['objId'], llm: false, implemented: true,
    validate: (p, ctx) => validateReachableObject(p.objId, ctx),
    apply: applyDestroyObject,
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
    const rawName = shape[i];
    // A trailing '?' marks an OPTIONAL param (Phase 7's EAT_ITEM who —
    // defaults to 'player'): a missing optional token is not an arity
    // error, it just ends the parse. Every pre-Phase-7 shape has no '?'
    // and keeps its strict-arity behavior, so existing 3-token EAT_ITEM
    // lines parse exactly as before.
    const optional = rawName.endsWith('?');
    const name = optional ? rawName.slice(0, -1) : rawName;
    if (name.startsWith('...')) { params[name.slice(3)] = tokens.slice(i).join(' '); break; }
    if (tokens[i] === undefined) {
      if (optional) break;
      return null; // arity mismatch — drop the line
    }
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
