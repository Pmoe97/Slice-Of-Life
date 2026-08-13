// ===== SECTION: COGNITION =====
// NPC utility scoring (src/ref/complete/npc-cognition-plan.md, Phase 1).
//
// Twelve independent per-drive coin flips produce inaction almost always: an
// NPC with something it could do does nothing 82.6% of the time (the plan's
// Evidence). This file replaces the question "does drive N fire?" with "of the
// things this NPC could do right now, which one appeals most?" — one number per
// candidate, comparable across candidates.
//
// As of Phase 2 this file IS the decision: `evaluateDrives` scores every
// candidate here, takes the best one above COGNITION.actionThreshold, and
// commits the NPC to it for `utility.holdTicks`. The weight roll is gone.
//
// PURITY (design invariant 1). `scoreDrive`, `scoreCandidates`, `choosePursuit`
// and `shouldBreakPursuit` READ state and return numbers or a choice. None of
// them writes. The writers are `openPursuit` / `releasePursuit` / `agePursuit`
// / `notePlayerAddressed`, named and grouped at the bottom of the file,
// following SCENE's `composeScene` / `openScene` split. verify-c1 snapshots
// gameState around the scorer; verify-c2 pins the writers as the only path to
// `npc.pursuit`.
//
// Nothing here is async or reaches the model (R2 / D11). Scoring runs for every
// resident every tick, and every autonomy feature in this game rests on
// `resolveTick` staying synchronous and network-free — that is also the only
// reason any of this is measurable.

// Local, because npc.js's clamp01 loads after this file and a second global of
// the same name is the kind of thing that works until it doesn't.
function cogClamp01(v) { return Math.max(0, Math.min(1, v)); }

// --- Hard exclusions vs. preferences ------------------------------------
// D6 turns a *need* gate into a score term: a threshold that is never crossed
// now produces a low score rather than an impossibility. That is the whole fix
// for the two drives (`sleep_recover`, `seek_comfort`) that were mathematically
// unable to fire for the entire life of the drive system.
//
// A *signal* gate is a different kind of thing and stays a hard exclusion: you
// cannot tidy mess you cannot perceive, and `tryInvestigateSmell` needs the
// source room off the perceived record to do anything at all. Those are about
// the action being possible, not about it being preferred — which is exactly
// the line the plan draws around what `gates` keeps.
//
// Reuses DRIVES' `checkDriveGates` with `skipNeeds` rather than reimplementing
// the loop, so the two can never disagree about what "the strongest of this
// list" means.
function checkHardGates(drive, npc, perceived) {
  return checkDriveGates(drive, npc, perceived, { skipNeeds: true });
}

// --- Candidacy: may this NPC do this at all? -----------------------------
// D15. Four drives were scored as unconditionally available because what
// actually restricts them lives inside their resolver: the player being
// vulnerable and adjacent, a phone lying about, affection plus something worth
// giving, the player being in the room at all. Under twelve independent coin
// flips a failed precondition wasted one roll. Under selection it consumes the
// tick — measured, `snoop_phone` was a candidate on 100% of npc-ticks at a flat
// 0.45 and would have won 54% of them.
//
// This table is the bill for D10: D10 takes selection away from the resolvers,
// so the conditions the resolvers were quietly enforcing have to be readable
// from out here. Each entry CALLS the predicate that its resolver calls, in
// DRIVES — never a second copy of the condition.
const DRIVE_CANDIDACY = {
  peep_player:     (npc, npcId, gameState, ctx) => canPeepPlayer(npc, ctx.location, gameState),
  snoop_phone:     (npc, npcId, gameState, ctx) => !!findSnoopablePhone(npc, ctx.location, gameState),
  gift_to_player:  (npc, npcId, gameState, ctx) => !!giftableStack(npc),
  // Not one of D15's four, but the same defect: react_to_player's resolver does
  // literally nothing when the player is elsewhere, and chat_with_roommate's
  // banks the social restore and wears the activity label with nobody to talk to.
  react_to_player: (npc, npcId, gameState, ctx) => !!ctx.location && ctx.location === gameState.player?.location,
  chat_with_roommate: (npc, npcId, gameState, ctx) =>
    hasChatPartner(npc, npcId, ctx.location, gameState, 'chat_with_roommate', ctx.currentTick),
};

// Everything that decides an NPC *may* do this drive at all, mirroring
// `evaluateDrives`' own filter in the same order — block, visitor allowlist,
// facility under construction, hard gates, cooldown, candidacy. This is now the
// ONLY such filter: Phase 2 deleted the copy inside the drive loop rather than
// keeping a second one that could drift from it.
function isDriveCandidate(driveId, drive, npc, gameState, ctx) {
  if (drive.blockFilter && !drive.blockFilter.includes(ctx.block)) return false;
  if (ctx.isVisitor && !VISITOR_DRIVE_ALLOWLIST.includes(driveId)) return false;
  const decayFacilities = MAINTENANCE.npcDecayActions[driveId];
  if (decayFacilities && decayFacilities.some(fid => !isFacilityFunctional(gameState, fid))) return false;
  if (!checkHardGates(drive, npc, ctx.perceived)) return false;
  if (isOnCooldown(npc, driveId, ctx.currentTick)) return false;
  const can = DRIVE_CANDIDACY[driveId];
  if (can && !can(npc, ctx.npcId, gameState, ctx)) return false;
  return true;
}

// --- The recency multiplier ---------------------------------------------
// COGNITION.recencyPenalty was specified as applying "within its own cooldown",
// which cannot happen: the cooldown is a hard exclusion, so a drive inside it is
// never a candidate and never scored. That is the same defect class as the two
// unreachable gates this phase exists to fix, in the plan's own new config, so
// it is corrected rather than copied — the penalty applies in the stretch AFTER
// the cooldown lapses, out to `recencyWindow` multiples of it. An NPC who
// showered four hours ago can shower again; they just would rather not.
function recencyMultiplier(npc, driveId, currentTick) {
  const cd = candidateDef(driveId)?.cooldownTicks || 0;
  if (!cd || typeof currentTick !== 'number') return 1;
  const last = (npc.flags?.[DRIVE_COOLDOWN_KEY] || {})[driveId];
  if (last === undefined) return 1;
  // Same wrapped per-day delta as isOnCooldown (drives.js): the tick index
  // wraps at midnight, and a raw subtraction after a rollover would read a
  // huge negative "ago" that the `since < 0` guard then had to paper over.
  // The wrap replaces that guard and is exact because every cooldownTicks is
  // well under ticksPerDay.
  const since = currentTick >= last ? currentTick - last : currentTick + CLOCK.ticksPerDay - last;
  return since < cd * COGNITION.recencyWindow ? COGNITION.recencyPenalty : 1;
}

// --- Scoring one drive ---------------------------------------------------
// score = (base + need + signal + temperament) × block × recency
//
// The first four are appeal in the same units, so they read as "how much this is
// worth doing"; the last two are multipliers on the whole, so they read as "and
// how much does now suit it". `terms` records each contribution so a tuning run
// can be read rather than guessed at — it has exactly one consumer, the
// measurement instrument, and is deliberately not rendered anywhere.
//
// `ctx` is `{ perceived, block, currentTick }`. The plan sketched this as
// `scoreDrive(drive, npc, perceived, block)`; recency needs the drive id and the
// tick as well, so the four loose arguments became a context object rather than
// growing to six.
function scoreDrive(driveId, npc, ctx) {
  const drive = candidateDef(driveId);
  const u = drive && drive.utility;
  if (!u) return null;

  const base = u.baseAppeal;

  // D6 — the need term. Zero at and above `below`, rising linearly to
  // COGNITION.needWeight at a fully depleted need. `below` is therefore both
  // "the point at which this starts to matter" and the scale of the ramp.
  let need = 0;
  if (u.need && u.need.below > 0) {
    const val = npc.needs?.[u.need.need];
    if (typeof val === 'number') {
      need = COGNITION.needWeight * cogClamp01((u.need.below - val) / u.need.below);
    }
  }

  // D8 — the signal term, at THIS NPC's own attenuated intensity. The record
  // perceiveSignals returns has already had distance and doors applied, so an
  // NPC two rooms from the rot cares proportionally less without anything here
  // knowing about geometry.
  let signal = 0;
  if (u.signal) {
    const wanted = Array.isArray(u.signal.signal) ? u.signal.signal : [u.signal.signal];
    let best = 0;
    for (const rec of ctx.perceived || []) {
      if (wanted.includes(rec.signalId) && rec.intensity > best) best = rec.intensity;
    }
    signal = best * (u.signal.scale ?? 1);
  }

  // D5 (initiative plan Phase 3) — the motive term, and the reason an overture
  // needs no scorer of its own. It is the need term's opposite number: a need is
  // what the NPC's body wants from the world, a motive is what they want from a
  // person, and `utility.need` and `utility.motive` are mutually exclusive on
  // every authored entry so nothing competes with self-care at the moments
  // self-care should win.
  //
  // The STRENGTH is computed outside — OVERTURE's scoreOvertures resolves which
  // of the entry's `motives` is strongest right now and what specifically it is
  // about, because that answer is also the overture record's `motive`/
  // `motiveRef` and deriving it twice is how the two would drift. Here it is
  // just a number in ctx, keyed by candidate id. Absent → 0, so a motive-scored
  // candidate that reached the scorer with nothing behind it sits at its bare
  // baseAppeal instead of scoring as if it were maximally motivated.
  let motive = 0;
  if (u.motive) {
    const m = ctx.motives && ctx.motives[driveId];
    if (m && typeof m.strength === 'number') {
      motive = (u.motive.weight ?? 0) * cogClamp01(m.strength);
    }
  }

  const appeal = base + need + signal + motive;

  // D7 — personality, as `1 + Σ(temperament[axis] × weight[axis])`. This is the
  // THIRD use of the idiom INTERRUPTION.personalityWeights established and
  // SNOOP_TUNING.chanceModifiers copied; it is deliberately not a fourth shape.
  // Recorded as its contribution to appeal rather than as the raw multiplier, so
  // the four appeal terms sum to what they scale.
  //
  // Clamped at a floor because these weights are authored per drive in Phase 3
  // and an unlucky sum could otherwise take a score negative, which would sort
  // below "do nothing" in a way no author intended.
  let temperamentMult = 1;
  const temperament0 = npc.bible?.temperament;
  if (u.temperamentWeights && temperament0) {
    let sum = 0;
    for (const axis of Object.keys(u.temperamentWeights)) {
      const v = temperament0[axis];
      if (typeof v === 'number') sum += v * u.temperamentWeights[axis];
    }
    temperamentMult = Math.max(COGNITION.temperamentFloor, 1 + sum);
  }
  const temperament = appeal * (temperamentMult - 1);

  const block = (u.blockAppeal && u.blockAppeal[ctx.block]) ?? 1;
  // `ctx.ignoreRecency` is for rescoring a drive an NPC is CURRENTLY doing
  // (shouldBreakPursuit). The recency penalty says "you did this recently, you
  // would rather not again" — applied to the thing in progress it would make
  // every pursuit progressively easier to displace the longer it ran, which is
  // the opposite of committing to it.
  const recency = ctx.ignoreRecency ? 1 : recencyMultiplier(npc, driveId, ctx.currentTick);

  const score = (appeal + temperament) * block * recency;
  return { driveId, score, terms: { base, need, signal, motive, temperament, block, recency } };
}

// --- Scoring everything this NPC could do -------------------------------
// Returns candidates ranked best first. Ties break on DRIVE_DEFS order, which is
// stable across runs — the scorer must be deterministic for the same state, and
// an rng tie-break would quietly make it not.
//
// `currentTick` is derived the same way resolveTick derives it —
// `getTickIndex(clock.minutes)`, a 0..47 per-day index rather than an absolute
// tick — so cooldown and recency reads here agree exactly with the ones
// evaluateDrives makes. That index wraps at midnight; Phase 5 fixed the
// cooldown arithmetic to wrap with it (see isOnCooldown/recencyMultiplier),
// which had previously read any late-day drive as permanently on cooldown.
function scoreCandidates(npc, npcId, gameState, resolved, perceived, opts = {}) {
  const ctx = {
    perceived: perceived || [],
    block: resolved?.block,
    location: resolved?.location ?? null,   // D15's candidacy conditions need it
    npcId,
    currentTick: getTickIndex(gameState.meta.clock.minutes),
    isVisitor: !!opts.isVisitor,
  };

  const out = [];
  for (const [driveId, drive] of Object.entries(DRIVE_DEFS)) {
    if (!isDriveCandidate(driveId, drive, npc, gameState, ctx)) continue;
    const scored = scoreDrive(driveId, npc, ctx);
    if (scored) out.push(scored);
  }

  // Initiative plan Phase 3 (D1) — overtures are ranked HERE, in the same list,
  // by the same arithmetic. This is the whole of "the scorer selects": there is
  // one ranked list and one choosePursuit, so an NPC cannot end a tick having
  // both walked over to you and started the laundry. Design invariant 2 is
  // therefore a property of the loop rather than a rule somebody has to
  // remember, which is exactly what Plan 3's D3 did for `activityOverride`.
  //
  // scoreOvertures lives in overture.js (loaded after this file; the call is at
  // runtime, so the direction of the reference costs nothing) and answers the
  // one question this file cannot: which of a candidate's motives is strongest
  // and what it is about. `ctx.motives` carries the strength into scoreDrive's
  // motive term; the record itself rides on the scored candidate so the winner
  // reaches openOverture without anything recomputing it.
  // Called directly rather than behind a `typeof` guard on purpose: a guard
  // would turn overture.js failing to load into an initiative system that
  // silently does nothing, which is the exact shape of the rumination.js
  // incident (in main.html, never in loadgame.js's ORDER, 175 assertions gone).
  // A ReferenceError is findable in a way that silence is not.
  const motives = scoreOvertures(npc, npcId, gameState, ctx);
  ctx.motives = motives;
  for (const overtureId of Object.keys(motives)) {
    const scored = scoreDrive(overtureId, npc, ctx);
    if (!scored) continue;
    scored.overture = motives[overtureId];
    out.push(scored);
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

// ===========================================================================
// PHASE 2 — CHOICE AND COMMITMENT
//
// Everything above reads state and returns numbers. Everything below either
// picks from those numbers (pure) or writes `npc.pursuit` (a named writer).
// The split is deliberate and is the shape SCENE's composeScene/openScene pair
// proved out across five phases: a scorer written inside the selection loop is
// a selection loop full of logic, and it cannot be tested.
//
// `npc.pursuit` has EXACTLY ONE WRITER — openPursuit, plus releasePursuit which
// clears it. That is what makes D3's `activityOverride` clobber impossible by
// construction rather than prevented by convention. Convention already failed
// here once: five drives grew their own bypass of the weight roll without
// anyone deciding the model had changed.
// ===========================================================================

// --- Choosing (pure) ------------------------------------------------------
// The best candidate, if it is worth departing from the scheduled activity for.
// `candidates` is already ranked, and ties broke on DRIVE_DEFS order back in
// scoreCandidates — deterministically, because an rng tie-break would make the
// same state produce different behaviour on a reload.
//
// Returning null is the common and correct case: an NPC with nothing pressing
// carries on with whatever their schedule says they are doing.
function choosePursuit(candidates) {
  const best = (candidates || [])[0];
  if (!best || !(best.score > COGNITION.actionThreshold)) return null;
  return best;
}

// Which perceived signals are loud enough to stop someone (D5's short list).
// `salience` is `SIGNAL_DEFS[id].salience * attenuated intensity`, so this is
// the same number and the same bar the scene reader shouts a callout at —
// deliberately one idea of "this stops you" rather than two.
function loudSignals(perceived) {
  const bar = COGNITION.alwaysBreak.calloutSalience;
  return (perceived || []).filter(r => (r.salience || 0) >= bar).map(r => r.signalId);
}

// --- Breaking (pure) ------------------------------------------------------
// D5: a challenger must beat the held pursuit's CURRENT score by
// `breakMargin`, and separately a short list of events breaks it regardless.
// Pure hysteresis was rejected because it couples "does she notice me" to
// weight tuning; hard commitment was rejected because an NPC who ignores you
// for four ticks because they committed to laundry is a feel bug.
//
// "Current" matters: an NPC who has just eaten is holding a pursuit whose need
// term has collapsed, so it is cheap to displace — which is what stops a
// commitment from outliving its reason. Recency is excluded from that rescore
// (see scoreDrive) because it is about repeating a thing, not continuing one.
//
// The loud-signal break only fires on a signal that was NOT already there when
// the pursuit opened. Without that, a standing smell would break every pursuit
// on every tick for as long as it lasted, and the cast would never finish
// anything. This is the same problem `meta.scene.shouted` solves for callouts,
// solved the same way.
//
// Returns the reason as a string (useful in the harness and the instrument) or
// null to carry on.
function shouldBreakPursuit(npc, candidates, ctx) {
  const p = npc && npc.pursuit;
  if (!p) return null;

  const known = p.shouted || [];
  if (loudSignals(ctx.perceived).some(id => !known.includes(id))) return 'signal';

  const rescored = scoreDrive(p.driveId, npc, { ...ctx, ignoreRecency: true });
  const currentScore = rescored ? rescored.score : (p.score || 0);
  const challenger = (candidates || []).find(c => c.driveId !== p.driveId);
  if (challenger && challenger.score > currentScore + COGNITION.breakMargin) return 'outscored';

  return null;
}

// --- The writers ----------------------------------------------------------
// `choice` is { driveId, score, startedTick, roomId, activity, perceived } —
// the scored candidate that won, plus what the resolver actually did with it.
// The activity and the room are stored because a held tick re-applies them
// WITHOUT re-resolving the drive: an NPC doing laundry for three ticks should
// do one load, not three, and should not be walked back to wherever their
// schedule says they belong halfway through.
function openPursuit(gameState, npcId, choice) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || !choice) return null;
  npc.pursuit = {
    driveId: choice.driveId,
    startedTick: choice.startedTick,
    ticksLeft: DRIVE_DEFS[choice.driveId]?.utility?.holdTicks || 1,
    roomId: choice.roomId ?? null,
    activity: choice.activity ?? null,
    score: choice.score,
    shouted: loudSignals(choice.perceived),
  };
  return npc.pursuit;
}

// Absent means no pursuit, never an empty object — so this deletes rather than
// nulls, and a save written mid-pursuit round-trips to genuinely absent.
function releasePursuit(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || !npc.pursuit) return false;
  delete npc.pursuit;
  return true;
}

// Called once per active NPC at the top of the drive pass, BEFORE anything is
// scored, so a pursuit still present when evaluateDrives runs is one with ticks
// left to run. Returns the surviving pursuit, or null.
//
// A pursuit also ends when the NPC stops being in a position to do it at all:
// asleep, or out of the flat entirely. Without that, an NPC who left for work
// at tick 2 of a three-tick chore would carry "doing laundry" into the office.
//
// Being in TRANSIT is deliberately not on that list. Pass 1 re-rolls a room
// preference every tick, so an NPC is in transit most of the time they are
// awake and at home, and releasing on it cancelled nearly half of all pursuits
// — usually on the tick right after one had walked the NPC to the room it
// needed. resolveTick cancels the wander instead; see the comment there.
function agePursuit(gameState, npcId, resolved) {
  const npc = gameState.npcs?.[npcId];
  const p = npc && npc.pursuit;
  if (!p) return null;
  if (!resolved || resolved.block === 'sleep' || !resolved.location) {
    releasePursuit(gameState, npcId);
    return null;
  }
  const ticksLeft = (p.ticksLeft || 0) - 1;
  if (ticksLeft <= 0) {
    releasePursuit(gameState, npcId);
    return null;
  }
  npc.pursuit = { ...p, ticksLeft };
  return npc.pursuit;
}

// The other half of D5's short list, and the reader for
// COGNITION.alwaysBreak.playerAddress. The player talking to someone always
// stops what they were doing — an NPC who carries on folding laundry for four
// ticks while you stand there talking to them is a feel bug, and no scoring
// margin should be able to produce it. Called from UI's doTalk, outside the
// tick, because that is where the player addressing someone actually happens.
function notePlayerAddressed(gameState, npcId) {
  if (!COGNITION.alwaysBreak.playerAddress) return false;
  return releasePursuit(gameState, npcId);
}
