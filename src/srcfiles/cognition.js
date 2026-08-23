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
// commits the NPC to it for `utility.holdTicks`, held as `npc.commitment`.
// The weight roll is gone.
//
// PURITY (design invariant 1). `scoreDrive`, `scoreCandidates`, `choosePursuit`
// and `shouldBreakPursuit` READ state and return numbers or a choice. None of
// them writes. The writers are `openCommitment` / `releaseCommitment` /
// `ageCommitment` / `notePlayerAddressed` (Phase 2), plus `openWorkCommitment`
// / `returnHome` (Phase 5, D5) — all named and grouped at the bottom of the
// file, following SCENE's `composeScene` / `openScene` split. verify-c1
// snapshots gameState around the scorer; verify-c2 pins the writers as the
// only path to `npc.commitment`.
//
// Naming note (continuous-behavior-engine-plan Phase 1): `npc.commitment` is
// the held-activity record described by that plan's Data model — NOT the
// shared-activity records `commitments.js` keeps in `gameState.world.commitments`
// (meal/hangout invitations). Same word, different table, no runtime overlap:
// an NPC's commitment lives on the npc; the household's live beside visits.
//
// Nothing here is async or reaches the model (R2 / D11). Scoring runs for every
// resident every tick, and every autonomy feature in this game rests on
// `resolveTick` staying synchronous and network-free — that is also the only
// reason any of this is measurable.

// Local, because npc.js's clamp01 loads after this file and a second global of
// the same name is the kind of thing that works until it doesn't.
function cogClamp01(v) { return Math.max(0, Math.min(1, v)); }

// Snapshot of the needs the D6 interrupt trigger scan compares against (Phase
// 5). Taken at commitment open so a crossing is an EDGE (was above, now below)
// rather than a level — the distinction that stops an interrupted NPC from
// being released again on the tick after their fresh decision re-opened a
// commitment whose need is already below the bar.
function npcNeedsSnapshot(npc) {
  const n = (npc && npc.needs) || {};
  return {
    hunger: n.hunger, hygiene: n.hygiene, energy: n.energy,
    social: n.social, comfort: n.comfort, stimulation: n.stimulation,
  };
}

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
    hasChatPartner(npc, npcId, ctx.location, gameState, 'chat_with_roommate', ctx.nowAbs),
  // Intimacy & Voyeurism Phase 6 (D11): the VISIBLE changing beat. The outfit
  // itself is derived every tick in resolveTick pass 2, so by construction it
  // always matches the current moment — but those updates only merge at the
  // end of the batch, so `npc.outfit` HERE is what they had on LAST tick.
  // Comparing it to the current block's target therefore detects a genuine
  // transition: waking into a workday morning still in yesterday's daily fit,
  // or landing home still dressed for the office. It fires at that moment and
  // then stops (once dressed for the block it matches, so no loop — the
  // cooldown is belt-and-braces), and never mid-activity: someone in the pool
  // or on the treadmill is already dressed for what they are doing whatever
  // their wardrobe. The fastidious/slovenly split is the drive's utility
  // temperamentWeights, not a second condition here.
  change_clothes: (npc, npcId, gameState, ctx) => {
    if (ACTIVITY_OUTFIT_TYPES[ctx.activity]) return false;
    const target = outfitTypeForContext(npc, ctx.block, null, gameState?.meta?.clock, npcId);
    if (outfitMatchesType(npc.outfit, target)) return false;
    return npcWardrobeItems(gameState, npc).length > 0;
  },
  // Intimacy & Voyeurism Phase 13 (D3/D13): the two new drives' candidacy.
  // `masturbate` is SOLO — a private room and a real desire level is the
  // whole gate (no other party for D13 to protect, exactly as the player's
  // own masturbate act). `intimate` is a PAIR act — the same private room +
  // desire, AND a co-located resident who passes the willingness gate:
  // findIntimatePartner is pure (it only READS willingness), so calling it
  // here costs nothing and cannot drift from what the resolver re-checks.
  masturbate: (npc, npcId, gameState, ctx) =>
    isPrivateRoom(ctx.location) && (npc.needs?.desire || 0) >= NPC_INTIMACY.masturbate.desireThreshold,
  intimate: (npc, npcId, gameState, ctx) =>
    isPrivateRoom(ctx.location)
      && (npc.needs?.desire || 0) >= NPC_INTIMACY.intimate.desireThreshold
      && !!findIntimatePartner(npc, npcId, gameState, ctx.location, ctx.block),
  // --- Content-creation work (vocation plan D16/D17, Phase 5) -------------
  // `content_session` is the at-home shift of someone whose job is filmed.
  // The door is the OCCUPATION plus a private room — deliberately not a
  // desire threshold, because this is work: a cam model with a schedule to
  // keep does not need to be in the mood, and gating on desire would turn
  // their job into an occasional urge. Desire still SCORES it
  // (utility.desire), so wanting to makes it more likely; it just is not the
  // door. The private-room requirement is the same isPrivateRoom the Phase 13
  // drives read, so a shoot cannot happen in the living room.
  content_session: (npc, npcId, gameState, ctx) =>
    !!npc?.bible?.occupation?.contentWork && isPrivateRoom(ctx.location),

  // D17 — the rare late-night pool session. Four conditions on top of the
  // occupation, and each one is doing a job:
  //   - high disinhibition: this is the exhibitionist end of the trait, not
  //     something every content creator does. Reuses npcDisinhibition (D8),
  //     the same [0,1] the adult-occupation floor is scored on.
  //   - a late block: the point is LATE, when the flat has gone quiet.
  //   - a functional pool: registered in MAINTENANCE.npcDecayActions against
  //     pool_systems, exactly as `swim` is, so scoreDrive's existing facility
  //     gate does the work. Filming in a dry basin is not a beat.
  //   - an EMPTY pool room: what makes it a private act in a common space,
  //     and the reason walking in on it lands at all. It also means the
  //     session simply does not happen on a busy evening, which is most of
  //     why it stays rare.
  content_pool_session: (npc, npcId, gameState, ctx) => {
    if (!npc?.bible?.occupation?.contentWork) return false;
    if (npcDisinhibition(npc) < CONTENT_WORK_TUNING.poolDisinhibitionFloor) return false;
    if (ctx.block !== 'wind_down' && ctx.block !== 'evening') return false;
    // The pool's working state is NOT checked here: scoreDrive already
    // refuses any drive whose MAINTENANCE.npcDecayActions facility is broken,
    // and 'content_pool_session' is registered there against pool_systems.
    // One gate, in the place the swim drive already uses.
    return getPresentNpcIds(gameState.npcs, 'pool_room').filter(id => id !== npcId).length === 0;
  },

  // D19 — the couple session. Reads as a stack of conditions ON TOP of the
  // ordinary pair-act door, and the order matters: findIntimatePartner is
  // called LAST and its answer is the answer. That function is what runs
  // resolveWillingnessGate, so no arrangement of the content conditions above
  // it can produce a candidate whose partner has not consented. Adding a
  // cheaper path around it — a "they're both creators so skip the gate"
  // shortcut — is the specific mistake design invariant 5 exists to forbid.
  //
  // The initiator must do content work; the PARTNER need only clear the
  // collab disinhibition floor, because being in someone's shoot is a smaller
  // step than running one. Both still clear the willingness gate.
  content_collab: (npc, npcId, gameState, ctx) => {
    if (!npc?.bible?.occupation?.contentWork) return false;
    if (!isPrivateRoom(ctx.location)) return false;
    const partnerId = findIntimatePartner(npc, npcId, gameState, ctx.location, ctx.block);
    if (!partnerId) return false;
    return npcDisinhibition(gameState.npcs[partnerId]) >= CONTENT_WORK_TUNING.collabDisinhibitionFloor;
  },

  // Intimacy & Voyeurism Phase 14 (D14): the long-distance thread's door.
  // The drive is only a candidate when the NPC has an OUTSIDE partner (a
  // visitor-status relationship record created by ensureOutsidePartners) who
  // is NOT currently in the house — co-located means the pair drive is the
  // right resolution, not a text. Real desire beyond the sext floor, same
  // spirit as the Phase 13 desire floors. outsidePartnerIdOf is pure (a
  // lookup, no writes), so calling it here cannot drift from the resolver.
  sext_partner: (npc, npcId, gameState, ctx) => {
    const partnerId = outsidePartnerIdOf(gameState, npcId);
    if (!partnerId) return false;
    if ((npc.needs?.desire || 0) < OUTSIDE_PARTNER_TUNING.sext.desireFloor) return false;
    if (getActiveVisits(gameState).some(v => v.npcId === partnerId)) return false;
    return true;
  },
  // Intimacy & Voyeurism Phase 17 (D13): the NPC's sleeping-room mirror of
  // the player's own slide-into-bed — a deviant, aroused NPC, the player
  // genuinely asleep, an unlocked door, and adjacency. The willingness gate
  // is deliberately NOT consulted here for the same reason it is not in the
  // player's own sleep_with: the player is ASLEEP (the gate's asleep floor
  // returns -1 — expected), the act is a risk attempt with consequences,
  // never a completed intimacy act with a participating target, and a locked
  // door makes it impossible. boundarySneakCandidacy is pure (reads only).
  sneak_into_bed: (npc, npcId, gameState, ctx) =>
    boundarySneakCandidacy(npc, npcId, gameState, ctx),
};

// Everything that decides an NPC *may* do this drive at all, mirroring
// `evaluateDrives`' own filter in the same order — block, visitor allowlist,
// facility under construction, hard gates, cooldown, candidacy. This is now the
// ONLY such filter: Phase 2 deleted the copy inside the drive loop rather than
// keeping a second one that could drift from it.
function isDriveCandidate(driveId, drive, npc, gameState, ctx) {
  // No blockFilter hard gate any more — D4's driveTimeOfDayWeight is the
  // routine lever, and it is a score term, not an exclusion (a drive outside
  // its preferred time of day scores at routineOutOfBand and loses to
  // anything that is genuinely pressing). The former gate's reachability is
  // preserved in practice: an out-of-routine drive sits far below
  // COGNITION.actionThreshold, which is exactly "effectively exclusive
  // without a hard boundary" (D4).
  if (ctx.isVisitor && !VISITOR_DRIVE_ALLOWLIST.includes(driveId)) return false;
  // Intimacy & Voyeurism Phase 16 (D2/D14): a cold-shouldering NPC never
  // directs a drive at the player — no peeping you, no going through your
  // phone, no gifts, no crossing the room to react. Overture suppression
  // lives in overture.js's scorer; the drive half is this filter — one read
  // (coldShoulderSuppressesOvertures), both gates, so they cannot drift.
  if (coldShoulderSuppressesOvertures(npc) && COLD_SHOULDER.suppressedDrives.includes(driveId)) return false;
  const decayFacilities = MAINTENANCE.npcDecayActions[driveId];
  if (decayFacilities && decayFacilities.some(fid => !isFacilityFunctional(gameState, fid))) return false;
  if (!checkHardGates(drive, npc, ctx.perceived)) return false;
  if (isOnCooldown(npc, driveId, ctx.nowAbs)) return false;
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
// npc-initiative-retiming-plan Phase 2 (D3): recencyMultiplier reads the SAME
// converted field and makes the SAME absolute-minute comparison isOnCooldown
// does (one monotonic subtraction, no wrap branch — D2). The old independent
// copy of the wrapped per-day delta was the one place the D34 wrap arithmetic
// lived outside drives.js; converting it with the same comparison in the same
// phase is what D3 requires, not a separate fix.
function recencyMultiplier(npc, driveId, nowAbs) {
  const cd = candidateDef(driveId)?.cooldownMinutes || 0;
  if (!cd || typeof nowAbs !== 'number') return 1;
  const last = (npc.flags?.[DRIVE_COOLDOWN_KEY] || {})[driveId];
  if (last === undefined) return 1;
  const since = nowAbs - last;
  return since < cd * COGNITION.recencyWindow ? COGNITION.recencyPenalty : 1;
}

// --- D4: the routine weight (continuous-behavior-engine Phase 3) ----------
// `blockFilter` used to EXCLUDE a drive outright outside its schedule blocks;
// D4 replaces the gate with a multiplier evaluated at the current minute of
// day. A drive's `timeOfDay` blocks map through BLOCK_TIME_OF_DAY to real
// minute windows; inside one it scores its `blockAppeal` (default 1), outside
// it scores COGNITION.routineOutOfBand instead of being unreachable — the
// same practical result for a normal routine (a morning-only drive at 15:00
// scores base × 0.25, far below actionThreshold), without a boundary anyone
// can catch fraying. The ramp makes the curve CONTINUOUS: the weight fades
// linearly across `routineRampMinutes` on each side of a window edge, so
// nothing about a decision ever depends on where a 30-minute tick boundary
// happened to land. A drive with no `timeOfDay` (or null) is time-of-day
// agnostic and weights 1.
//
// Pure. `drive` may be a DRIVE_DEFS entry (which declares `timeOfDay`) or an
// OVERTURE_DEFS entry (which does not — overtures keep their own blockFilter
// gate until npc-initiative-retiming-plan converts them, so they weight 1
// here and their gate stays the gate).
function driveTimeOfDayWeight(drive, minutesOfDay) {
  const blocks = drive && drive.timeOfDay;
  if (!blocks || blocks.length === 0) return 1;
  // No clock → no time-of-day preference. scoreCandidates always supplies the
  // current minute; a direct scoreDrive caller without one (the dev harness)
  // gets the neutral multiplier rather than a NaN curve.
  if (typeof minutesOfDay !== 'number' || !Number.isFinite(minutesOfDay)) return 1;
  const u = drive.utility;
  let weight = COGNITION.routineOutOfBand;
  for (const blockName of blocks) {
    const ranges = BLOCK_TIME_OF_DAY[blockName];
    // An unknown block name must never LOCK a drive out: it contributes the
    // in-band weight, making the drive available rather than silently dead.
    // The phase's verification greps every set, so a typo is caught there —
    // this branch is the conservative runtime answer, not the guard.
    if (!ranges || ranges.length === 0) return Math.max(weight, (u && u.blockAppeal && u.blockAppeal[blockName]) ?? 1);
    const inBand = (u && u.blockAppeal && u.blockAppeal[blockName]) ?? 1;
    for (const [start, end] of ranges) {
      weight = Math.max(weight, routineRampWeight(minutesOfDay, start, end, inBand));
    }
  }
  return weight;
}

// The per-window half of driveTimeOfDayWeight: the in-band weight inside
// [start, end), fading linearly down to routineOutOfBand over
// routineRampMinutes past either edge.
function routineRampWeight(minutesOfDay, start, end, inBand) {
  const ramp = COGNITION.routineRampMinutes;
  const oob = COGNITION.routineOutOfBand;
  if (minutesOfDay >= start && minutesOfDay < end) return inBand;
  const dist = minutesOfDay < start ? start - minutesOfDay : minutesOfDay - end;
  if (dist >= ramp) return oob;
  const t = dist / ramp;
  return oob + (inBand - oob) * (1 - t);
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
// `ctx` is `{ perceived, block, minutesOfDay, nowAbs, motives, ... }`. The plan
// sketched this as `scoreDrive(drive, npc, perceived, block)`; recency needs
// the drive id and the absolute minute as well, so the four loose arguments
// became a context object rather than growing to six.

// The D23 reader for the occupation's `idlePastimes` list (Phase 7). True when
// the drive is one of the low-stakes idle pastimes this NPC's occupation names.
// An absent or empty list — a legacy save, a hand-authored NPC — is false for
// every drive, which is exactly the field's schema default: no list, no lean,
// and every idle drive scores its bare base appeal.
function idlePastimePreferred(npc, driveId) {
  const list = npc?.bible?.occupation?.idlePastimes;
  return Array.isArray(list) && list.length > 0 && list.includes(driveId);
}

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

  // Intimacy & Voyeurism Phase 8 (D9/D12) — the desire bias term. The mirror
  // of the need term: where `utility.need` rises as a need depletes, this
  // rises as the NPC's DESIRE NEED (npc.needs.desire, 0..100) climbs past
  // `above` toward DESIRE.npc.max — so a high-desire NPC's intimacy
  // candidates (the ones that DECLARE `utility.desire`) score higher, and a
  // low-desire NPC's identical candidate scores nothing extra. It is a bias
  // term, never a gate (D12): a candidate that declares it can still lose to
  // a starving NPC's eat, and no non-intimacy candidate ever carries it, so
  // desire cannot gate a non-intimacy action. Entries declare the curve as
  // `desire: DESIRE.scoring`; absent → 0, like every other term.
  let desireBias = 0;
  if (u.desire && (u.desire.weight ?? 0) > 0) {
    const d = npc.needs?.desire;
    if (typeof d === 'number') {
      const above = u.desire.above ?? 0;
      desireBias = u.desire.weight * cogClamp01((d - above) / (DESIRE.npc.max - above));
    }
  }

  // Intimacy & Voyeurism Phase 9 (D13) — the willingness bias term, the
  // desire term's partner. Where `utility.desire` rewards how much an NPC
  // WANTS the intimacy, `utility.willingness` weights the same candidates by
  // how game they actually are: a candidate that declares it gains
  // `weight × willingness(...)` appeal — the very same function the player's
  // Make-a-Move and Phase 13's pair acts read — so the overture path and the
  // act path cannot disagree about what "game" means. It is scoped to the
  // desire motive only (flirtation is not yet the act, and an NPC who merely
  // wants a chat is unaffected), and a candidate whose willingness toward
  // the player hits a HARD FLOOR (asleep, hostile, actively refusing,
  // stranger — design invariant 1) is dropped from the candidate list
  // entirely: a desire-motive overture from someone who would refuse an
  // advance is the exact thing this phase exists to prevent. Entries declare
  // it as `willingness: WILLINGNESS.scoring`; absent → 0.
  let willingnessBias = 0;
  if (u.willingness && (u.willingness.weight ?? 0) > 0 && ctx.motives?.[driveId]?.motive === 'desire') {
    const gs = ctx.gameState;
    if (gs && npc) {
      const w = willingness(gs, npc, 'player', u.willingness.act || 'default', ctx);
      if (w < WILLINGNESS.abortFloor) return null;
      willingnessBias = u.willingness.weight * cogClamp01(w);
    }
  }

  // Phase 7 (vocation-and-lifestyle plan, D23) — the pastime term. The idle
  // drives (read_book/watch_tv/scroll_phone) clear the action bar on appeal
  // alone — that is the whole fix for the empty afternoon. WHICH one a person
  // reaches for is the occupation's `idlePastimes` list, authored in the pool
  // and carried onto the bible: the listed drive gains `utility.pastimeWeight`
  // on top of its base appeal, so it ranks decisively ahead of its unlisted
  // siblings without either ever dropping below the bar. A lean, never a
  // gate — and an absent list (a legacy save, a hand-authored NPC) means
  // every idle drive scores flat, so untinted NPCs still idle, just without
  // a favourite. The field and this reader ship in the same phase (RI6).
  let pastime = 0;
  if (u.pastimeWeight && idlePastimePreferred(npc, driveId)) {
    pastime = u.pastimeWeight;
  }

  const appeal = base + need + signal + motive + desireBias + willingnessBias + pastime;

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

  // D4 — the routine term. The old `blockAppeal[ctx.block] ?? 1` was a
  // per-schedule-block multiplier on top of a separate `blockFilter` HARD
  // gate; both are now one continuous function of the time of day
  // (driveTimeOfDayWeight), evaluated at the exact current minute rather
  // than at the block the 30-minute grid happened to put us in.
  const block = driveTimeOfDayWeight(drive, ctx.minutesOfDay);
  // `ctx.ignoreRecency` is for rescoring a drive an NPC is CURRENTLY doing
  // (shouldBreakPursuit). The recency penalty says "you did this recently, you
  // would rather not again" — applied to the thing in progress it would make
  // every pursuit progressively easier to displace the longer it ran, which is
  // the opposite of committing to it.
  const recency = ctx.ignoreRecency ? 1 : recencyMultiplier(npc, driveId, ctx.nowAbs);

  const score = (appeal + temperament) * block * recency;
  // Code-review fix: `pastime` (the Phase 7 idle-pastime lean, folded into
  // `appeal` above) was missing from this object, so `terms` no longer summed
  // to `score` whenever a drive's pastime term was non-zero — breaking the
  // debugging surface this field exists for (verify-c1.js's own regression
  // test asserts the sum) for every idle-pastime-preferred drive.
  return { driveId, score, terms: { base, need, signal, motive, desireBias, willingnessBias, pastime, temperament, block, recency } };
}

// --- Scoring everything this NPC could do -------------------------------
// Returns candidates ranked best first. Ties break on DRIVE_DEFS order, which is
// stable across runs — the scorer must be deterministic for the same state, and
// an rng tie-break would quietly make it not.
//
// `nowAbs` is the absolute-minute address of the decision — `clockToAbsolute(
// clock)`, day*1440 + minutes — the same space every cooldown stamp and
// commitment lives in, so cooldown and recency reads here agree exactly with
// the ones evaluateDrives makes. That space is monotonic: no midnight wrap, no
// per-day index to get a negative delta from (npc-initiative-retiming D2).
function scoreCandidates(npc, npcId, gameState, resolved, perceived, opts = {}) {
  const ctx = {
    perceived: perceived || [],
    block: resolved?.block,
    // D4 — the exact current minute of day (clock.minutes, a float), NOT the
    // schedule block, so driveTimeOfDayWeight's curve is continuous rather
    // than quantized to the 30-minute tick grid. `block` stays in the ctx for
    // the consumers that still need it (overture.js's blockFilter gate).
    minutesOfDay: gameState.meta.clock.minutes,
    location: resolved?.location ?? null,   // D15's candidacy conditions need it
    activity: resolved?.activity ?? null,   // Phase 6's change_clothes candidacy
    npcId,
    nowAbs: clockToAbsolute(gameState.meta.clock),
    isVisitor: !!opts.isVisitor,
    // Intimacy & Voyeurism Phase 9 (D13): the willingness bias term reads the
    // world (the player, castWeb, rooms, door states), so the scoring ctx
    // carries gameState like every other scorer consumer does. Additive.
    gameState,
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
// picks from those numbers (pure) or writes `npc.commitment` (a named writer).
// The split is deliberate and is the shape SCENE's composeScene/openScene pair
// proved out across five phases: a scorer written inside the selection loop is
// a selection loop full of logic, and it cannot be tested.
//
// `npc.commitment` has EXACTLY ONE WRITER — openCommitment, plus
// releaseCommitment which clears it. That is what makes D3's
// `activityOverride` clobber impossible by construction rather than prevented
// by convention. Convention already failed here once: five drives grew their
// own bypass of the weight roll without anyone deciding the model had changed.
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
  const p = npc && npc.commitment;
  if (!p) return null;

  const known = p.shouted || [];
  if (loudSignals(ctx.perceived).some(id => !known.includes(id))) return 'signal';

  const rescored = scoreDrive(p.id, npc, { ...ctx, ignoreRecency: true });
  const currentScore = rescored ? rescored.score : (p.score || 0);
  const challenger = (candidates || []).find(c => c.driveId !== p.id);
  if (challenger && challenger.score > currentScore + COGNITION.breakMargin) return 'outscored';

  return null;
}

// --- The writers ----------------------------------------------------------
// `choice` is { driveId, score, roomId, activity, perceived } — the scored
// candidate that won, plus what the resolver actually did with it. The
// activity and the room are stored because a held commitment re-applies them
// WITHOUT re-resolving the drive: an NPC doing laundry for three ticks should
// do one load, not three, and should not be walked back to wherever their
// schedule says they belong halfway through.
//
// The record is the commitment shape of continuous-behavior-engine-plan.md's
// Data model (Phase 1): the tick-counted `ticksLeft` is replaced by an
// absolute completion minute, so hold expiry is a time comparison rather than
// a decrement — which stays exactly one resolveTick per 30 game-minutes, so
// this is behavior-identical to the old countdown while establishing the
// absolute-minute address every later phase of the roadmap converts to.
// Phase 3 converted the def-side `holdTicks` to `holdMinutes` and made an
// `action` candidate resolve its own duration and anchor through the anchor
// system. `score`/`shouted`/`activity` are the hold bookkeeping today's
// per-tick logic still consumes (shouldBreakPursuit, the held re-application);
// they are not part of the plan's primary shape and Phase 4 may absorb them.
function openCommitment(gameState, npcId, choice) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || !choice) return null;
  const nowAbs = clockToAbsolute(gameState.meta.clock);
  // Phase 3: an `action` candidate (an ACTION_DEFS self-action surfaced by
  // the Phase 2 event-driven scheduler) resolves its own duration and anchor
  // through the anchor system — that is where the walk destination comes
  // from in Phase 4. A plain drive candidate commits for its def's
  // `holdMinutes` and anchors at the room the resolver chose, with no
  // object or point until the physical layer.
  //
  // A DRIVE_DEFS entry that WRAPS an action (D2: "a drive that has a
  // physical component wraps an ACTION_DEFS entry... rather than inventing
  // its own") still commits at `choice.driveId` — cooldowns, the activity
  // fallback (commitmentActivity) and the def's own `holdMinutes` all stay
  // keyed on the drive, which is the identity Phase 6's tuning measured.
  // `choice.actionId` names the wrapped action so ONLY its anchor system
  // is borrowed, not its (skill-aware, differently-tuned) timeCost — a
  // held-duration change is a rebalance this fix does not make silently.
  let durationMinutes, anchor;
  if (choice.kind === 'action') {
    const resolved = resolveActionCommitment(gameState, choice.actionId ?? choice.driveId, choice.actorId ?? npcId);
    if (!resolved) return null;
    durationMinutes = choice.durationMinutes ?? resolved.durationMinutes;
    anchor = resolved.anchor;
  } else {
    durationMinutes = DRIVE_DEFS[choice.driveId]?.utility?.holdMinutes || CLOCK.tickMinutes;
    anchor = { roomId: choice.roomId ?? null, objId: null, point: null };
  }
  // Phase 4 (physical layer, D8/D9/C4): a commitment with a resolvable
  // stand-point plans a real walk to it, and `arrived` stays false until the
  // walk lands — nothing the commitment produces begins before arrival.
  // Action anchors carry a point from the anchor system; a drive anchor
  // names a room but no point, so the room's centroid becomes the stand-
  // point (which is also where the floor plan already drew that NPC). The
  // walk starts from where the NPC is standing THIS tick (the resolver's
  // resolved location, not last tick's npc.location).
  const startRoom = choice.startRoom ?? npc.location ?? null;
  let anchorPoint = anchor.point || null;
  if (!anchorPoint && anchor.roomId && ROOMS[anchor.roomId]) {
    const [cx, cy] = roomCentre(anchor.roomId);
    anchorPoint = { x: cx, y: cy };
  }
  let arrived = true;
  if (anchorPoint) {
    const planned = planWalk(gameState, npc, startRoom, { roomId: anchor.roomId, point: anchorPoint });
    if (planned) {
      npc.pos = { ...planned.path[0] };
      npc.walk = planned;
      arrived = false;
    }
  }
  npc.commitment = {
    id: choice.driveId,
    kind: choice.kind || 'drive',
    startedAtAbs: nowAbs,
    completesAtAbs: nowAbs + durationMinutes,
    // `arrived` is false exactly while the physical layer's walk is in
    // flight — advanceFrameWalks/settleWalks (movement.js) own the flip to
    // true, the same way they own npc.location per D8. `anchor.point` is the
    // stand-point the walk targets (null only when the commitment has no
    // room to anchor to, in which case nothing walks and arrival is instant).
    anchor: { ...anchor, point: anchorPoint },
    arrived,
    // Phase 5 (D6): the needs snapshot the interrupt scan compares against —
    // a need crossing below its urgency threshold since this commitment
    // opened is the edge that breaks it. See npcNeedsSnapshot.
    needsAtOpen: npcNeedsSnapshot(npc),
    activity: choice.activity ?? null,
    score: choice.score,
    shouted: loudSignals(choice.perceived),
  };
  return npc.commitment;
}

// The commitment's flavor label for every consumer that reads what the NPC is
// doing. The stored `activity` is the label the resolver produced at commit
// time (sometimes genuinely dynamic — `eat` is 'cooking' or 'snacking'
// depending on where the food came from, so it cannot be re-derived from the
// id alone); a drive that opened with no label falls back to its def's static
// `activityOverride`. Named accessor so drives.js never reaches into the
// record's guts.
function commitmentActivity(c) {
  if (!c) return null;
  return c.activity || (DRIVE_DEFS[c.id]?.activityOverride ?? null);
}

// Absent means no commitment, never an empty object — so this deletes rather
// than nulls, and a save written mid-commitment round-trips to genuinely
// absent.
function releaseCommitment(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || !npc.commitment) return false;
  delete npc.commitment;
  // Phase 4: releasing the commitment stops any walk it was holding — the
  // NPC stands where the walk last put them, so pos survives; a dangling
  // walk with no commitment to arrive for is the state that would outlive
  // its reason (the same class of staleness this file's delete-absent rule
  // already guards for commitments).
  npc.walk = null;
  return true;
}

// Called once per active NPC at the top of the drive pass, BEFORE anything is
// scored, so a commitment still present when evaluateDrives runs is one with
// time left to run. Returns the surviving commitment, or null.
//
// A commitment also ends when the NPC stops being in a position to do it at
// all: asleep, or out of the flat entirely. Without that, an NPC who left for
// work at tick 2 of a three-tick chore would carry "doing laundry" into the
// office.
//
// Being in TRANSIT is deliberately not on that list. Pass 1 re-rolls a room
// preference every tick, so an NPC is in transit most of the time they are
// awake and at home, and releasing on it cancelled nearly half of all
// commitments — usually on the tick right after one had walked the NPC to the
// room it needed. resolveTick cancels the wander instead; see the comment
// there.
function ageCommitment(gameState, npcId, resolved) {
  const npc = gameState.npcs?.[npcId];
  const c = npc && npc.commitment;
  if (!c) return null;
  // Phase 5 (D5): a work commitment is off-map BY DESIGN — the
  // missing-location release below would kill it on its first off-site tick.
  // It only ever ends at its own single completion time; pass 1's return
  // branch (sim.js) has already handled that by the time this runs, so this
  // is the defensive backstop for the same completion.
  if (c.kind === 'work') {
    if (clockToAbsolute(gameState.meta.clock) >= c.completesAtAbs) {
      returnHome(gameState, npcId);
      return null;
    }
    return npc.commitment;
  }
  if (!resolved || resolved.block === 'sleep' || !resolved.location) {
    // Phase 6 (fluid work boundary): the missing-location release fires the
    // moment the schedule block goes off-map (commute/work/commute_home) and
    // was hard-cutting an in-flight drive commitment at the boundary — measured
    // live: every work commitment in a 36-npc-day trace opened at exactly the
    // block's first minute, including one mid-`do_laundry`. The grace: on the
    // COMMUTE block (the shift has not started), a commitment completing within
    // the next tick is let to finish — the "finish getting ready, then leave"
    // of D5's thesis. Bounded to one tick and to the commute block only, so
    // nobody is ever more than 30 game-minutes late and nobody walks in through
    // the door of an already-running shift. The completion release below (or
    // pass 3's agedAway → work branch on the next tick) handles the landing.
    const nowAbs = clockToAbsolute(gameState.meta.clock);
    const finishingSoon = resolved.block === 'commute' && (c.completesAtAbs - nowAbs <= CLOCK.tickMinutes);
    if (!finishingSoon) {
      releaseCommitment(gameState, npcId);
      return null;
    }
    return npc.commitment;
  }
  if (clockToAbsolute(gameState.meta.clock) >= c.completesAtAbs) {
    releaseCommitment(gameState, npcId);
    return null;
  }
  return npc.commitment;
}

// The other half of D5's short list, and the reader for
// COGNITION.alwaysBreak.playerAddress. The player talking to someone always
// stops what they were doing — an NPC who carries on folding laundry for four
// ticks while you stand there talking to them is a feel bug, and no scoring
// margin should be able to produce it. Called from UI's doTalk, outside the
// tick, because that is where the player addressing someone actually happens.
function notePlayerAddressed(gameState, npcId) {
  if (!COGNITION.alwaysBreak.playerAddress) return false;
  return releaseCommitment(gameState, npcId);
}

// ===========================================================================
// PHASE 5 — WORK/COMMUTE, INTERRUPTS, AND THE RETURN PLACEMENT
//
// D5 — work/commute is ONE long commitment, not the schedule's
// commute → work → commute_home block sequence. A due resident whose block is
// a work-boundary block (commute = about to leave, work = shift already
// underway) opens the work commitment: it plans a real walk to the front-door
// anchor, goes off-map (pos:null, location:null — today's off-screen
// convention, so every consumer that already reads a missing location as "not
// here" keeps working) for the rest of the shift, and at its single completion
// time the NPC is placed back at the front door, present again, ready for the
// next decision to walk them from there. The completion time is computed once,
// from the occupation's schedule window — the end of the commute_home block
// (or of the work block where a template has no commute home), which is
// resolveScheduleActivity's own willReturnAt, "when they arrive home". Never
// re-derived per tick.
//
// D6 — interrupts re-trigger the break-and-re-decide flow by EVENTS rather
// than by re-scoring every held NPC every tick. The trigger scan
// (commitmentInterruptTriggers) is cheap by construction — number comparisons
// against the needsAtOpen snapshot, no scoring, no perception — and runs only
// for NPCs holding a non-work commitment. On a hit the commitment is released
// and the NPC falls through to the normal scorer the same tick; that re-decision
// (scoreCandidates / choosePursuit / openCommitment) IS the "fresh decision
// immediately" of today's early-release path, and it is the re-use of
// shouldBreakPursuit's logic D6 names. The player addressing an NPC already
// breaks via notePlayerAddressed above, so it is not re-checked here.
//
// Writers: `npc.commitment` gains two named writers in this section —
// openWorkCommitment (the only builder) and returnHome (the only releaser that
// also places the NPC). They live beside the Phase 2 writers for the reason
// verify-c2 pins: building or deleting the record anywhere else is how
// commitment invariants quietly rot.

// The front door's stand-point — the same anchor shape resolveActionAnchor
// produces, so the walk machinery needs no new convention. The entry room's
// front_door object when it carries a real coordinate; the entry's centroid
// otherwise (C3/C5: a base fixture carries no recorded position, so the room's
// centre is the deterministic stand-point). Pure: reads objects/ROOMS only.
function frontDoorAnchor(gameState) {
  const bucket = (gameState.objects && gameState.objects['room_entry']) || {};
  let door = null;
  for (const o of Object.values(bucket)) {
    if (o.defId !== 'front_door') continue;
    door = o;
    break;
  }
  if (door && door.pos) {
    return { roomId: 'entry', objId: door.id, point: { x: door.pos.x + door.pos.w / 2, y: door.pos.y + door.pos.h / 2 } };
  }
  const [cx, cy] = roomCentre('entry');
  return { roomId: 'entry', objId: door ? door.id : null, point: { x: cx, y: cy } };
}

// Code-review fix: the end-of-work-block computation used to be duplicated
// verbatim between openWorkCommitment and openHomeWorkCommitment (same
// SCHEDULES lookup, same daySched derivation, same workEndTick loop, same
// `day*1440 + tick*CLOCK.tickMinutes` formula) — a future change to how this
// is computed would have to be made in both places or the two sibling
// commitment-openers would silently diverge on completion time. One shared
// reader now, called by both.
//
// Also fixes the falsy-zero sentinel both copies shared: `workEndTick`
// started at 0 as the "no work range found" marker, but 0 is also a
// legitimate tick value (midnight) — night_shift's own `work` range starts
// at tick 0 in this config, so 0 is already a normal in-range boundary here,
// not something that can safely stand for "absent". A `found` flag replaces
// it, so a work block that genuinely ends at midnight is no longer
// indistinguishable from a day with no work block at all.
//
// Returns the absolute minute the work block ends, or null if there is no
// work block in today's schedule.
function workBlockEndAbs(npc, clock) {
  const template = SCHEDULES[npc.bible.scheduleTemplate] || SCHEDULES.standard;
  const dayType = isWeekend(clock.day) ? 'weekend' : 'weekday';
  const daySched = template[dayType] || template.weekday;
  let workEndTick = 0;
  let found = false;
  for (const [blockName, ranges] of Object.entries(daySched)) {
    if (blockName !== 'work') continue;
    for (const [, end] of ranges) {
      found = true;
      workEndTick = Math.max(workEndTick, end);
    }
  }
  if (!found) return null;
  return clock.day * 1440 + workEndTick * CLOCK.tickMinutes;
}

// The one builder of the work commitment (D5). `npc.commitment` is off-limits
// here if one already exists — a work commitment must never stack on another
// commitment. Pure of rng/model: block, walk and completion time all come from
// state reads, so a given save reproduces a given shift byte for byte (C6).
// Returns the record, or null when work cannot be started.
function openWorkCommitment(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || npc.commitment || !npc.bible?.scheduleTemplate) return null;
  const clock = gameState.meta.clock;
  const nowAbs = clockToAbsolute(clock);
  const sched = resolveScheduleActivity(npc, clock, gameState, npcId);
  // D15 — the top-of-function guard, deliberately BEFORE the walk is planned.
  // This commitment means "leave the flat": it walks to the front-door anchor
  // and movement.js lands it by setting pos/location to null. Opening it for
  // someone who works from home would strand them off-map for the entire
  // shift with no return path. The check belongs here and not in movement.js,
  // where by then the walk already exists and the damage is a repair job.
  if (!npcIsOffsite(npc, sched?.block, clock, npcId)) return null;
  // Completion = the end of today's shift, expressed once. Same-day and in
  // the future whenever the caller's block is a work-boundary block — no
  // schedule template runs a shift across midnight.
  let returnAbs = null;
  if (sched && sched.willReturnAt != null) {
    returnAbs = clock.day * 1440 + sched.willReturnAt;
  } else {
    returnAbs = workBlockEndAbs(npc, clock);
    if (returnAbs == null) return null; // no work block today — not a work-boundary day
  }
  if (!(returnAbs > nowAbs)) return null;

  const anchor = frontDoorAnchor(gameState);
  let arrived = true;
  if (anchor.point) {
    const planned = planWalk(gameState, npc, npc.location || null, anchor);
    if (planned) {
      npc.pos = { ...planned.path[0] };
      npc.walk = planned;
      arrived = false;
    }
  }
  if (arrived) {
    // Already standing at the door: the walk is skipped and the NPC is
    // off-map from the moment the commitment opens.
    npc.pos = null;
    npc.location = null;
  }
  npc.commitment = {
    id: 'go_work',
    kind: 'work', // D5's third kind, beside D2's 'action'/'drive' — see Handoff
    startedAtAbs: nowAbs,
    completesAtAbs: returnAbs,
    anchor,
    arrived,
    activity: 'heading to work',
    score: 0,
    shouted: [],
  };
  return npc.commitment;
}

// --- The at-home shift (vocation plan D5/D16, Phase 3) --------------------
// The sibling of openWorkCommitment for someone whose work happens HERE.
//
// It exists because of what happened without it. `npcIsOffsite` correctly
// stopped a remote worker from walking out the front door — and then they
// fell through to the ordinary drive scorer and spent their entire shift
// doing laundry. Measured: a week of remote Backend Engineers produced ZERO
// ticks in the study and 140 in the laundry room. Not working from home;
// just not working. This file's own Phase 5 comment already says why that is
// wrong — "a worker at their desk is not also folding laundry" — and it is
// no less true when the desk is in the study.
//
// A SEPARATE KIND, not a flag on the work record, and that is load-bearing:
// movement.js nulls `pos`/`location` at two sites keyed on
// `kind === 'work'`, which is exactly the behaviour an at-home worker must
// never get. A distinct kind means those checks simply never fire, rather
// than needing two more mode-aware edits in the file whose whole job is
// walking people out of the flat.
//
// Two deliberate differences from the off-site shift:
//   - It BINDS TO A ROOM instead of leaving. The room comes from
//     resolveWorkRoom (D5), so it respects capacity and the study contends.
//   - It is INTERRUPTIBLE. shouldInterruptCommitment exempts `kind: 'work'`
//     because an off-site worker cannot answer their needs from the office;
//     someone working in the next room obviously can, so a real need still
//     pulls them to the kitchen and they go back after. That is more life
//     than the schedule ever gave them, not less.
//
// Completion is the end of the WORK block, not of commute_home: a person who
// works from home does not have a commute home, and reading one would keep
// them "at work" for an extra hour of nothing.
// `precomputedPlacement` (optional): resolveTick's pass 1 already calls
// resolveHomeWorkPlacement for every at-home worker before this function ever
// runs, and by the time a caller reaches this function it has already
// confirmed the NPC is not offsite — so that result is a real placement.
// Used ONLY for the yield-to-content-work candidacy check below, which reads
// it in place of last tick's stale npc.location; it is deliberately NOT
// reused for the actual room commit further down, which still calls
// resolveHomeWorkPlacement fresh. That recompute has to stay live: its
// capacity check reads npcs' CURRENT location, and this function commits one
// NPC at a time within the same per-tick loop pass 1 ran in — pass 1's
// placements were each computed against that loop's pre-start snapshot, with
// no visibility into each other, so trusting one for the commit let multiple
// home workers independently "win" the same under-capacity room in one tick.
function openHomeWorkCommitment(gameState, npcId, precomputedPlacement) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || npc.commitment || !npc.bible?.scheduleTemplate) return null;
  const clock = gameState.meta.clock;
  const nowAbs = clockToAbsolute(clock);
  const sched = resolveScheduleActivity(npc, clock, gameState, npcId);
  if (sched?.block !== 'work') return null;
  if (npcIsOffsite(npc, sched.block, clock, npcId)) return null;

  // D16 — the generic at-home shift must YIELD to content work.
  //
  // sim.js opens this commitment and then `continue`s, skipping the drive
  // scorer entirely for the rest of the tick. That is the whole point for an
  // ordinary remote worker (it is what stopped them spending their shift in
  // the laundry room), and it is exactly wrong for someone whose shift IS a
  // drive: a cam model bound to "answering messages" for eight hours never
  // gets to be a candidate for the job they actually do.
  //
  // Measured before this guard: 28 content sessions against 60 pool sessions
  // over 336 npc-days — the rare late-night beat firing more than twice as
  // often as the ordinary working one, because the ordinary one could never
  // win a tick it was never scored on.
  //
  // So a content worker who COULD film right now is left to the scorer, where
  // content_session's work-block appeal makes it the strong favourite. If it
  // loses, or is on cooldown, they fall through to pass 1's placement and are
  // at their desk anyway — the desk is the fallback, not the cage.
  // Code-review fix: this used to hardcode a check against content_session
  // alone, so content_collab — whose own timeOfDay also includes 'work' —
  // never got asked, even with a willing co-located partner right there. The
  // `isContentWorkDrive` flag on all three content drives (config.js) existed
  // for exactly this generalization and was never actually read anywhere
  // until now. content_pool_session is included in the same sweep for free
  // and stays inert here on its own terms — its candidacy function already
  // requires a 'wind_down'/'evening' block, so it correctly returns false
  // during 'work' without this site needing to know that.
  if (npc.bible?.occupation?.contentWork) {
    const ctx = {
      block: sched.block,
      location: precomputedPlacement?.location ?? npc.location,
      activity: precomputedPlacement?.activity ?? (npc.activity || ''),
      nowAbs,
    };
    for (const [contentDriveId, contentDrive] of Object.entries(DRIVE_DEFS)) {
      if (!contentDrive.isContentWorkDrive) continue;
      const candidacy = DRIVE_CANDIDACY[contentDriveId];
      if (!candidacy) continue;
      if (isOnCooldown(npc, contentDriveId, nowAbs)) continue;
      if (candidacy(npc, npcId, gameState, ctx)) return null;
    }
  }

  // Code-review fix: shares workBlockEndAbs with openWorkCommitment above
  // instead of re-deriving the same computation (and the same falsy-zero
  // sentinel bug) a second time.
  const completesAtAbs = workBlockEndAbs(npc, clock);
  if (completesAtAbs == null) return null;
  if (!(completesAtAbs > nowAbs)) return null;

  // Code-review correction: the efficiency fix's first draft reused
  // `precomputedPlacement` HERE too, not just for the yield-guard's ctx above
  // — and that broke real capacity checking. resolveHomeWorkPlacement's
  // capacity check reads getPresentNpcIds, which reads LIVE npc.location; the
  // old code recomputed fresh, sequentially, in this same per-NPC commit
  // loop, so NPC B's check correctly saw NPC A already seated in the study
  // (A's `npc.location = placed.location` a few lines below had already
  // landed before B ran). Pass 1's precomputed placements are each checked
  // against the PRE-TICK snapshot instead — none of them see each other — so
  // reusing pass 1's result here let three home workers all independently
  // "win" the same under-capacity room in the same tick. Measured: 0
  // over-capacity ticks before this reuse, 14 after. So this one recomputes
  // fresh, live, same as before the efficiency pass; only the yield-guard's
  // candidacy context above (which has no commit-ordering consequence) still
  // reuses the pass-1 result.
  const rng = seededRng(`homework_${npcId}`, `d${clock.day}`);
  const placed = resolveHomeWorkPlacement(npc, npcId, gameState.npcs, rng, gameState);

  npc.location = placed.location;
  npc.walk = null;
  reconcileNpcPos(npc);   // no walk — the workspace is a room change, not a journey
  npc.commitment = {
    id: 'work_from_home',
    kind: 'work_home',
    startedAtAbs: nowAbs,
    completesAtAbs,
    anchor: { roomId: placed.location, objId: null, point: null },
    arrived: true,
    activity: placed.activity,
    score: 0,
    shouted: [],
    needsAtOpen: npcNeedsSnapshot(npc),
  };
  return npc.commitment;
}

// The one releaser that also PLACES the NPC: a completed work commitment ends
// with the worker back at the front door — physically at the anchor's stand-
// point, present in the entry, ready for the next decision to walk them from
// there. That next commitment's own walk IS the "walk back in from the front
// door on return" of D5.
function returnHome(gameState, npcId) {
  const npc = gameState.npcs?.[npcId];
  if (!npc || !npc.commitment) return false;
  delete npc.commitment;
  npc.walk = null;
  const anchor = frontDoorAnchor(gameState);
  npc.location = anchor.roomId;
  npc.pos = anchor.point ? { ...anchor.point } : null;
  return true;
}

// The D6 trigger scan. Cheap by construction: number comparisons only, no
// scoring, no perception. Returns a list of reason strings (empty = carry on).
//   - need: a need NOT served by the held commitment has CROSSED below its
//     urgency threshold since the commitment opened (the needsAtOpen
//     snapshot). Edge-triggered on purpose: a need already urgent at open
//     must not re-release the NPC on the tick after their fresh decision.
//   - overture: an overture is pending for this NPC — waiting on an answer is
//     the exact shape of an interruption (design invariant 2). Defensive: the
//     open paths cannot produce this state today, and if one ever does, the
//     waiting must win over whatever the NPC was committed to.
function commitmentInterruptTriggers(npc, commitment) {
  const out = [];
  const served = (candidateDef(commitment.id)?.utility?.need?.need) || null;
  const urgency = COGNITION.interruptUrgency || {};
  const snapshot = commitment.needsAtOpen;
  for (const [need, threshold] of Object.entries(urgency)) {
    if (!(threshold > 0)) continue;
    if (need === served) continue;
    const atOpen = snapshot && snapshot[need];
    // An absent snapshot (a commitment written before Phase 5) triggers
    // nothing — the conservative answer, since an edge cannot be measured.
    if (!(atOpen >= threshold)) continue;
    if (!((npc.needs?.[need] ?? 0) < threshold)) continue;
    out.push(`need:${need}`);
  }
  if (isOverturePending(npc)) out.push('overture');
  return out;
}

// The event check pass 3 runs for NPCs HOLDING a commitment (the D6
// interrupt). The expensive half of the old per-tick break check — full
// scoring, perception — is deliberately not polled every tick; the trigger
// scan above is the event, and a fired event IS the break. The freed NPC
// re-decides through the exact same pipeline the break path has always used
// (scoreCandidates → choosePursuit → openCommitment), which is the re-use D6
// names. Work commitments are exempt outright: an off-site worker cannot
// answer their needs from the office, exactly as the schedule kept them at
// work regardless.
function shouldInterruptCommitment(npc, commitment) {
  if (!npc || !commitment || commitment.kind === 'work') return null;
  const triggers = commitmentInterruptTriggers(npc, commitment);
  return triggers.length > 0 ? triggers[0] : null;
}

// ===========================================================================
// DECISION QUEUE — continuous-behavior-engine-plan Phase 2 (D3)
//
// D3 replaces the flat scan. Today resolveTick resolves every active NPC
// every 30-minute tick (the getActiveNpcIds loop, sim.js) — which is what
// makes a committed NPC's own hold still cost a full per-tick
// re-resolution (scoring, perception, the shouldBreakPursuit re-check) for
// its whole duration. New: an NPC's next decision is due at a single
// absolute minute, and the tick only touches NPCs whose time has arrived.
//
// The queue is DERIVED, not stored. Its one entry shape is the plan's Data
// model — { npcId, nextDecisionAbs } — and nextDecisionAbs is read straight
// off live state: npc.commitment.completesAtAbs while a commitment holds,
// or "now" when there is none. A stored copy would go stale the instant any
// writer released a commitment outside the queue — notePlayerAddressed
// (doTalk), ageCommitment's sleep/missing-location release — and a stale
// decision time is the exact "elapses and never fires again" class of bug
// this roadmap is removing everywhere else. Derived means stale is
// impossible by construction. Phase 5's batch fast-forward will want the
// same shape as a sorted structure; these reads are the ground truth it
// would sort.
//
// Purity: everything in this section READS state and returns values. It
// writes nothing — npc.commitment still has exactly the four named writers
// declared above.

// The absolute minute this NPC's next decision is due. The Data model's own
// fallback: no commitment → "now", so an un-committed NPC is always due and
// stays on the schedule baseline, exactly as the flat scan left them.
function nextDecisionAbs(npc, gameState) {
  if (!npc || !npc.commitment) return clockToAbsolute(gameState.meta.clock);
  return npc.commitment.completesAtAbs;
}

// Who among `ids` is due a decision at this clock — the flat loop's
// replacement. A committed NPC drops out until its own completion; an NPC
// with no commitment is due now and stays due until one opens.
function dueForDecision(gameState, ids) {
  const nowAbs = clockToAbsolute(gameState.meta.clock);
  const due = [];
  for (const id of ids) {
    const npc = gameState.npcs[id];
    if (!npc) continue;
    if (nextDecisionAbs(npc, gameState) <= nowAbs) due.push(id);
  }
  return due;
}

// The resolved record for an NPC who is NOT due: they hold a commitment
// with time left to run, so where they are and what they're doing come from
// the commitment, never re-rolled from the schedule. The re-roll is exactly
// what the flat loop did to committed NPCs — pass 1 re-rolled a room
// preference every tick, and measured, that cancelled 233 of 485
// commitments, nearly always on the tick after one had moved the NPC to the
// room it needed. Under the event-driven cadence the schedule is consulted
// for the BLOCK only (an rng-free lookup), and only so the things that key
// on the block keep their old triggers:
//   - pass 2's block-based restores/clothing (sleep → energy + sleepwear),
//   - pass 3's ageCommitment releases — a sleep or work/commute block means
//     the NPC is no longer in a position to hold a commitment. The
//     work/commute/sleep records mirror pass 1's own branches exactly
//     (off-screen location, the block's activity, the bedroom on sleep), so
//     ageCommitment releases on precisely the same records it releases on
//     today. Without that mirror, a committed NPC would hold "watching TV"
//     straight through their work shift, which is a regression in the shape
//     of a schedule that never wins.
// Returns null for an NPC with no commitment — which cannot happen from the
// caller (no commitment ⇒ due ⇒ never derived), so it is defensive only.
function deriveHeldRecord(npcId, npc, gameState, isVisitor) {
  const c = npc.commitment;
  if (!c) return null;
  const sched = isVisitor
    ? { block: 'leisure' }
    : resolveScheduleActivity(npc, gameState.meta.clock, gameState, npcId);
  if (sched.block === 'sleep') {
    return {
      block: 'sleep',
      location: npc.residency?.room || npc.location || null,
      activity: 'sleeping',
      transit: null,
    };
  }
  // Phase 5 (D5): a work commitment is either walking OUT to the door (a real,
  // visible WALK — the off-screen mirror below must not swallow it) or already
  // off-site (pos/location null, the off-screen convention every consumer
  // reads as "not here"). It never falls through to the held-activity branch:
  // a worker at their desk is not also folding laundry.
  if (c.kind === 'work') {
    if (!c.arrived) {
      return {
        block: sched.block,
        location: npc.location || c.anchor?.roomId || null,
        activity: 'heading to the front door',
        transit: null,
      };
    }
    return {
      block: sched.block,
      location: null,
      activity: ACTIVITY_TABLES[sched.block] ? ACTIVITY_TABLES[sched.block][0] : 'at work',
      transit: null,
    };
  }
  // D12: mirrors pass 1's branch, which is now mode-aware — an at-home worker
  // is not off-screen, so the mirror must not claim they are. It still returns
  // BEFORE the held-activity branch below, for the same reason as always: a
  // worker at their desk is not also folding laundry, whether that desk is in
  // an office or in the study.
  // The at-home shift's held record (D5/Phase 3). Same shape and the same
  // reason as the off-site branch above: the commitment owns where they are
  // and what they are doing, so the schedule is not re-rolled underneath it.
  // The only difference is that the location is a real room in this flat.
  if (c.kind === 'work_home') {
    return {
      block: sched.block,
      location: c.anchor?.roomId || npc.location || null,
      activity: c.activity || 'working',
      transit: null,
    };
  }
  // Code-review fix, corrected on a second pass. The first draft of this fix
  // removed the block entirely for any commitment that isn't 'work' or
  // 'work_home', reasoning that such a commitment "already carries its own
  // real anchor". That is true for content_session/content_collab (they only
  // ever OPEN while the NPC is not offsite, by openHomeWorkCommitment's own
  // guard) — but it broke the pre-existing "fluid work boundary" mechanism
  // this function's own header comment documents: ageCommitment's
  // missing-location release depends on THIS function returning
  // `location: null` the instant a held NPC becomes offsite, whatever
  // ordinary commitment (read_book, do_laundry, anything) they happened to
  // be mid-hold on — that is what cuts an in-flight drive short at a real
  // work boundary instead of leaving them reading straight through a hybrid
  // worker's office-day shift. Measured: removing the check let a `read_book`
  // commitment held into an office day's first work-block tick keep reporting
  // its stale living-room anchor instead of going offsite.
  //
  // So the offsite check is restored, generically, for ANY commitment kind —
  // but the resolveHomeWorkPlacement RE-ROLL is not: when offsite, this
  // returns the same off-map record 'work'/'work_home' already return; when
  // NOT offsite, execution falls through to the generic anchor-based
  // fallback below, which is what actually fixed the content-work clobbering
  // bug. content_session/content_collab can never trip the offsite branch
  // (their own candidacy requires !npcIsOffsite to have opened at all, and
  // workMode/officeDays/gigDay are stable for the rest of that day), so
  // they still always take the fallback path exactly as intended.
  if (npcIsOffsite(npc, sched.block, gameState.meta.clock, npcId)) {
    return {
      block: sched.block,
      location: null,
      activity: ACTIVITY_TABLES[sched.block] ? ACTIVITY_TABLES[sched.block][0] : sched.block,
      transit: null,
    };
  }
  // Phase 4 (physical layer): a commitment whose walk is still in flight is
  // a WALK, not the activity. `location` is the position system's live
  // projection (D8) — the frame integrator has been updating it as the
  // marker crosses room rects — and the activity names where they are
  // heading. The commitment's own effects have not begun: `arrived` is the
  // gate every consumer reads, and it is false exactly here.
  if (!c.arrived) {
    return {
      block: sched.block,
      location: npc.location || c.anchor?.roomId || (isVisitor ? null : (npc.residency?.room || null)),
      activity: `heading to ${roomPhrase(c.anchor?.roomId)}`,
      transit: null,
    };
  }
  return {
    block: sched.block,
    location: c.anchor?.roomId || npc.location || (isVisitor ? null : (npc.residency?.room || null)),
    activity: commitmentActivity(c),
    transit: null,
  };
}
