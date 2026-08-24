// ===== SECTION: WILLINGNESS (Intimacy & Voyeurism Phase 9, D13) =====
// The ONLY door into an intimacy act (design invariant 1). The willingness
// function is PURE — same state in, same answer out, no writes, no rng —
// and every act, drive or effect that touches intimacy reads it before
// anything happens. It returns a number in [-1, 1]:
//
//   >= threshold(act)  willing — the act may proceed (gates and other
//                      conditions still apply).
//   <  threshold(act)  a soft no — refused with prose, no effects. Anyone
//                      is allowed to change their mind.
//   <  abortFloor (0)  cannot fire AT ALL. A HARD FLOOR returns exactly -1
//                      (asleep, hostile/tension-high, actively refusing, or
//                      a stranger with zero prior interaction), and no
//                      drive, verb, effect or LLM call may bypass it.
//
// Phase 17's boundary acts are the ONE exception, and they route through
// their OWN narrow gate with devastating consequences in that phase — never
// through a relaxed willingness.
//
// Consumers today: COGNITION's scoreDrive `utility.willingness` bias term
// (the desire bias's partner, declared on the desire-motive overtures) and
// DEFS.ACTIONS' `willingness` requirement checker (Phase 11's acts declare
// it). Both live in this file's naming so the floor stays one function.

// Local clamps — the same reason cognition.js/overture.js carry theirs:
// npc.js's clamp01 loads after this file, and a second global of the same
// name is the kind of thing that works until it doesn't.
function wlClamp01(v) { return Math.max(0, Math.min(1, v)); }
function wlClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// The target's id. ctx.npcId is the fast path (scoreCandidates carries it);
// the identity fallback serves direct callers (Make-a-Move, the harness).
function willingnessTargetId(gs, npc, ctx) {
  if (ctx && typeof ctx.npcId === 'string' && ctx.npcId) return ctx.npcId;
  if (!gs || !npc) return null;
  for (const [id, n] of Object.entries(gs.npcs || {})) {
    if (n === npc) return id;
  }
  return null;
}

// --- Act thresholds --------------------------------------------------------
// An act is willing when willingness() >= willingnessThreshold(act). The
// plan's quickie/sex/share_shower letters are these numbers; `masturbate`
// is solo, so the floor is its only door (threshold 0). Unknown acts read
// `default`. Pure.
function willingnessThreshold(act) {
  const t = WILLINGNESS.thresholds;
  return typeof t[act] === 'number' ? t[act] : t.default;
}

// --- The attraction term ---------------------------------------------------
// "How much the target wants the initiator": the relational desire axis —
// relPlayer.desire toward the player, castWeb target→initiator desire for
// an NPC partner — mapped from [-1,1] to [0,1], PLUS the initiator's outfit
// through the SHARED clothingWillingnessBias (Phase 7), so the wearer's
// outfit tilts a consent check the same way it tilts the attraction and
// desire reads everywhere else (one meaning per stat). Observer-neutral on
// the outfit: it looks the same to whomever is asked. Pure.
function willingnessAttraction(gs, target, initiatorId, ctx) {
  const c = WILLINGNESS.attraction;
  let axis = 0.5;    // the "want them" axis, [0,1]; 0.5 = neutral, absent data
  let wearer = null;
  if (initiatorId === 'player') {
    const rel = (target && target.relPlayer) || {};
    axis = ((rel.desire || 0) + 1) / 2;
    wearer = gs && gs.player;
  } else {
    const targetId = willingnessTargetId(gs, target, ctx);
    const pair = targetId && gs?.world?.castWeb ? gs.world.castWeb[[targetId, initiatorId].sort().join('|')] : null;
    const dirKey = `${targetId}→${initiatorId}`;
    const axes = (pair && pair.axes && pair.axes[dirKey]) || {};
    axis = ((axes.desire || 0) + 1) / 2;
    wearer = gs && gs.npcs ? gs.npcs[initiatorId] : null;
  }
  const outfitBias = wearer ? clothingWillingnessBias(wearer) : 0;
  return wlClamp01(axis * c.axisWeight + outfitBias * c.clothingWeight);
}

// The desire term — general arousal, npc.needs.desire / max. Pure.
function willingnessDesire(npc) {
  const d = npc && npc.needs && typeof npc.needs.desire === 'number' ? npc.needs.desire : 0;
  return wlClamp01(d / DESIRE.npc.max);
}

// The phase term — the relationship ladder early→familiar→close→intimate.
// For the player that is the derived relPlayer.conversationPhase; for an NPC
// initiator it is DERIVED from the castWeb axes the same way deriveConversationPhase
// derives from relPlayer (raw = trust + affection + 2·comfort − tension,
// bucketed by PHASE_THRESHOLDS) — one ladder, no per-pair phase field to
// drift. Pure.
function willingnessPhase(gs, target, initiatorId, ctx) {
  if (initiatorId === 'player') {
    const phase = (target && target.relPlayer && target.relPlayer.conversationPhase) || 'early';
    const idx = Math.max(0, PHASE_ORDER.indexOf(phase));
    return PHASE_ORDER.length > 1 ? idx / (PHASE_ORDER.length - 1) : 0;
  }
  const targetId = willingnessTargetId(gs, target, ctx);
  const pair = targetId && gs?.world?.castWeb ? gs.world.castWeb[[targetId, initiatorId].sort().join('|')] : null;
  const axes = (pair && pair.axes && pair.axes[`${targetId}→${initiatorId}`]) || {};
  const raw = (axes.trust || 0) + (axes.affection || 0) + (2 * (axes.comfort || 0)) - (axes.tension || 0);
  const level = Math.max(0, Math.min(1, raw / 4)) * 100;
  let phase = 'early';
  if (level >= PHASE_THRESHOLDS.intimate) phase = 'intimate';
  else if (level >= PHASE_THRESHOLDS.close) phase = 'close';
  else if (level >= PHASE_THRESHOLDS.familiar) phase = 'familiar';
  const idx = Math.max(0, PHASE_ORDER.indexOf(phase));
  return PHASE_ORDER.length > 1 ? idx / (PHASE_ORDER.length - 1) : 0;
}

// The personality term — curiosity (openness) and how game the target is for
// boundary-adjacent stuff (npcDeviancy, the shared derived read). Both [0,1];
// the weights are the tuning home. Pure.
function willingnessPersonality(npc) {
  const c = WILLINGNESS.personality;
  const t = (npc && npc.bible && npc.bible.temperament) || {};
  const openness = typeof t.openness === 'number' ? (t.openness + 1) / 2 : 0.5;
  return wlClamp01(openness * c.opennessWeight + npcDeviancy(npc) * c.deviancyWeight);
}

// The context term — how conducive the target's current room is to a yes.
// Private room (bedroom/bathroom) + locked door is the safest possible; a
// common room is the riskiest; someone else standing in the same room costs
// privacy regardless. Pure.
function willingnessContext(gs, npc, ctx) {
  const c = WILLINGNESS.context;
  const roomId = (npc && npc.location) || (ctx && ctx.location) || null;
  if (!roomId || !ROOMS[roomId]) return c.shared;
  const def = ROOMS[roomId];
  const isPrivate = def.type === 'bedroom' || roomId.startsWith('bathroom');
  let score = isPrivate
    ? (gs && getDoorState(gs, roomId) === 'locked' ? c.privateLocked : c.privateUnlocked)
    : c.shared;
  const selfId = willingnessTargetId(gs, npc, ctx);
  const others = getPresentNpcIds((gs && gs.npcs) || {}, roomId).filter(id => id !== selfId).length;
  if (others > 0) score -= c.peoplePresentPenalty;
  return wlClamp01(score);
}

// The history term — a small cold/quiet drag, [0,1]:
//   recency — intimacy within the last `intimateRecencyDays` means a just-
//             sated appetite (the "give me a minute" read, which is what the
//             plan's negative history weight means).
//   refusals — intimacy refusals within `refusalWindowDays` chill the
//             target for a while after the lockout floor has lifted.
// The plan's "lastIntimateDay recency, prior refusals" is exactly these two
// reads; neither field exists until Phase 11/13's writers produce it, so a
// fresh NPC has no history baggage at all. Pure.
function willingnessHistory(gs, npc, day) {
  const c = WILLINGNESS.history;
  let term = 0;
  const refs = npc && npc.flags && npc.flags._intimacyRefusals;
  if (refs && typeof refs.count === 'number' && refs.count > 0 && typeof refs.lastDay === 'number' && typeof day === 'number') {
    const since = day - refs.lastDay;
    if (since >= 0 && since <= c.refusalWindowDays) term += wlClamp01(refs.count * c.refusalPerRefusal);
  }
  const hist = npc && npc.flags && npc.flags._intimacyHistory;
  if (hist && typeof hist.lastIntimateDay === 'number' && typeof day === 'number') {
    const since = Math.max(0, day - hist.lastIntimateDay);
    if (since <= c.intimateRecencyDays) term += c.intimateRecencyPenalty * (1 - since / c.intimateRecencyDays);
  }
  return wlClamp01(term);
}

// --- The stranger floor ----------------------------------------------------
// "Zero prior interaction" read from the persisted relationship: the target
// has never had a relationship axis move toward the initiator. For the
// player that is every relPlayer axis still at its default AND no
// grievances; for an NPC partner it is a castWeb pair with every axis at 0
// on both sides (or no pair at all — they have never met). A roommate on
// day one IS a stranger; the first real exchange moves an axis and clears
// it. Pure.
function npcIsStrangerTo(gs, target, initiatorId, ctx) {
  if (!target) return true;
  if (initiatorId === 'player') {
    const rel = (target && target.relPlayer) || {};
    if ((rel.intimacyLevel || 0) > 0) return false;
    if (rel.conversationPhase && rel.conversationPhase !== 'early') return false;
    const flat = !(rel.trust || rel.affection || rel.tension || rel.respect || rel.desire)
      && !(rel.comfort || 0);
    if (!flat) return false;
    return !(rel.grievances && rel.grievances.length > 0);
  }
  const targetId = willingnessTargetId(gs, target, ctx);
  if (!targetId || !gs?.world?.castWeb) return true;
  const pair = gs.world.castWeb[[targetId, initiatorId].sort().join('|')];
  if (!pair || !pair.axes) return true;
  const dirA = pair.axes[`${targetId}→${initiatorId}`] || {};
  const dirB = pair.axes[`${initiatorId}→${targetId}`] || {};
  const flatA = !(dirA.trust || dirA.affection || dirA.tension || dirA.respect || dirA.desire) && !(dirA.comfort || 0);
  const flatB = !(dirB.trust || dirB.affection || dirB.tension || dirB.respect || dirB.desire) && !(dirB.comfort || 0);
  return flatA && flatB;
}

// --- The hard floors -------------------------------------------------------
// Any one of these returns true and the willingness function returns
// exactly -1 (abort). The floors are the game's line in the sand (D13):
// asleep, hostile (tension at/above REL_CONSEQUENCES.tensionHigh), actively
// refusing (a pending lockout from noteIntimacyRefusal, or the caller
// passing ctx.refusing mid-refusal), or a stranger. Phase 17 routes its
// boundary acts elsewhere — never through a relaxed floor here.
function willingnessFloorReasons(gs, npc, initiatorId, ctx) {
  ctx = ctx || {};
  const out = [];
  if (!npc) { out.push('no_target'); return out; }
  const activity = (npc.activity || '').toLowerCase();
  if (activity === 'sleeping' || activity === 'napping' || ctx.block === 'sleep') out.push('asleep');
  // Intimacy & Voyeurism Phase 16 (D2/D14): the cold-shoulder HARD FLOOR. A
  // cold-shouldering NPC is the D13 line in the sand in its coldest form —
  // they will not even look at the player, so no intimacy drive, verb or
  // effect may make them participate. This is a NEW floor (fail-closed only,
  // invariant 1's direction) — the cold state never relaxes a door, it only
  // closes one. The desire override and every other gate read this the same
  // way they read 'hostile'/'asleep'.
  if (coldShoulderActive(npc)) out.push('cold_shoulder');
  if (ctx.refusing === true) out.push('actively_refusing');
  const refs = npc.flags && npc.flags._intimacyRefusals;
  const day = gs && gs.meta && gs.meta.clock ? gs.meta.clock.day : null;
  if (refs && typeof refs.lockUntilDay === 'number' && typeof day === 'number' && day < refs.lockUntilDay) {
    out.push('actively_refusing');
  }
  const tension = initiatorId === 'player'
    ? ((npc.relPlayer && npc.relPlayer.tension) || 0)
    : (() => {
        const targetId = willingnessTargetId(gs, npc, ctx);
        const pair = targetId && gs?.world?.castWeb ? gs.world.castWeb[[targetId, initiatorId].sort().join('|')] : null;
        const axes = pair && pair.axes && pair.axes[`${targetId}→${initiatorId}`];
        return (axes && axes.tension) || 0;
      })();
  if (tension >= REL_CONSEQUENCES.tensionHigh) out.push('hostile');
  if (npcIsStrangerTo(gs, npc, initiatorId, ctx)) out.push('stranger');
  return out;
}

function willingnessFloor(gs, npc, initiatorId, ctx) {
  return willingnessFloorReasons(gs, npc, initiatorId, ctx).length > 0;
}

// --- The willingness function ---------------------------------------------
// The plan's signature and shape, exactly: base + Σ(term × weight), with
// the hard floors returning -1 before any term is evaluated. Pure.
// F1 (Discord feedback, 2026-08-23): the New Game/Sandbox "receptivity"
// slider, [-1,1] via world.gameplayOptions.willingnessBaseline. A soft term
// like every other one in willingness() below — summed in AFTER
// willingnessFloor's hard gate already ran (this function is never called
// unless the floor already passed), so it cannot make a floored NPC
// participate. Missing/malformed input reads as 0 — a total no-op, same
// as every other gameplayOptions field. Pure.
function willingnessDisposition(gs) {
  const v = gs?.world?.gameplayOptions?.willingnessBaseline;
  return typeof v === 'number' ? wlClamp(v, -1, 1) : 0;
}

function willingness(gs, npc, initiatorId, act, ctx) {
  ctx = ctx || {};
  if (willingnessFloor(gs, npc, initiatorId, ctx)) return -1;
  const c = WILLINGNESS.terms;
  const day = gs && gs.meta && gs.meta.clock ? gs.meta.clock.day : 1;
  const w = c.base
    + willingnessAttraction(gs, npc, initiatorId, ctx) * c.attraction
    + willingnessDesire(npc) * c.desire
    + (typeof npc.mood === 'number' ? npc.mood : 0) * c.mood
    + willingnessPhase(gs, npc, initiatorId, ctx) * c.phase
    + willingnessPersonality(npc) * c.personality
    + willingnessContext(gs, npc, ctx) * c.context
    - willingnessHistory(gs, npc, day) * c.history
    + willingnessDisposition(gs) * c.disposition;
  return wlClamp(w, -1, 1);
}

// Whether the target is willing for a specific act, per that act's bar. The
// answer every act-level consumer reads. Pure.
function isWilling(gs, npc, initiatorId, act, ctx) {
  return willingness(gs, npc, initiatorId, act, ctx) >= willingnessThreshold(act);
}

// --- The gate (the "first call site" Phase 11's acts read) ----------------
// The shared gate: every intimacy act passes this BEFORE any effect, clock,
// or state change happens. resolveWillingnessGate is the single refusal
// shape — DEFS.ACTIONS' `willingness` requirement checker and Phase 11's
// paired acts both call it, so a Make-a-Move, an NPC pair act and the
// action pipeline can never disagree about what a no is.
//   reason 'floor'           — hard abort (design invariant 1): a floored
//                              target cannot be made to participate, period.
//   reason 'below_threshold' — a soft no: refused with prose, no effects.
//                              Revocable consent, exactly as D13 wants.
function resolveWillingnessGate(gs, targetNpcId, initiatorId, act, ctx) {
  const target = gs && gs.npcs ? gs.npcs[targetNpcId] : null;
  const threshold = willingnessThreshold(act);
  if (!target) return { allowed: false, willingness: -1, threshold, reason: 'no_target' };
  const w = willingness(gs, target, initiatorId, act, { ...(ctx || {}), npcId: targetNpcId });
  if (w < WILLINGNESS.abortFloor) {
    return { allowed: false, willingness: w, threshold, reason: 'floor',
      reasons: willingnessFloorReasons(gs, target, initiatorId, { ...(ctx || {}), npcId: targetNpcId }) };
  }
  if (w < threshold) return { allowed: false, willingness: w, threshold, reason: 'below_threshold' };
  return { allowed: true, willingness: w, threshold, reason: null };
}

// --- The refusal writers (Phase 11/13 call these; the harness tests them) --
// A refused intimacy attempt. Bumps the count, stamps the day, and — with
// `lockoutDays` (default WILLINGNESS.history.refusalLockoutDays) — holds the
// actively-refusing floor so a no means no for a while, not for one tick.
// Mirrors OVERTURE's _overtureRefusals shape, per-NPC in flags.
function noteIntimacyRefusal(npc, day, opts = {}) {
  if (!npc) return null;
  const prev = (npc.flags && npc.flags._intimacyRefusals) || null;
  const lockout = typeof opts.lockoutDays === 'number'
    ? opts.lockoutDays : WILLINGNESS.history.refusalLockoutDays;
  const stamp = typeof day === 'number' ? day : (prev && prev.lastDay) || 1;
  npc.flags = {
    ...(npc.flags || {}),
    _intimacyRefusals: {
      count: ((prev && prev.count) || 0) + 1,
      lastDay: stamp,
      lockUntilDay: lockout > 0 ? stamp + lockout : (prev && prev.lockUntilDay) || null,
    },
  };
  return npc.flags._intimacyRefusals;
}

// A completed intimacy act — the recency half of the history term. partnerId
// is 'player' or an npcId; the function itself is relationship-agnostic (the
// history term is the target's own satedness, whoever it was with).
function noteIntimacyOccurred(npc, day, partnerId) {
  if (!npc) return null;
  npc.flags = {
    ...(npc.flags || {}),
    _intimacyHistory: { lastIntimateDay: typeof day === 'number' ? day : 1, lastWith: partnerId || null },
  };
  return npc.flags._intimacyHistory;
}

// A short, honest refusal line for the action pipeline (the requirement
// checker's prose). Static narration only — never boundary content, so it
// needs no gate of its own (D15 gates explicit prompts, not refusals).
function willingnessRefusalProse(npc, gate) {
  const name = (npc && npc.bible && npc.bible.name) || 'They';
  const reasons = gate && gate.reasons ? gate.reasons : [];
  if (reasons.includes('asleep')) return `${name} is fast asleep.`;
  if (reasons.includes('cold_shoulder')) return `${name} has gone cold on you. They won't even look at you.`;
  if (reasons.includes('hostile')) return `${name} is in no mood for you right now.`;
  if (reasons.includes('actively_refusing')) return `${name} has already said no.`;
  if (reasons.includes('stranger')) return `${name} is practically a stranger to you — not interested.`;
  return `${name} shakes their head. Not now.`;
}
