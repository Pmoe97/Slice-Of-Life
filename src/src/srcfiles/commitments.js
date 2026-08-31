// ===== SECTION: COMMITMENTS =====
// (inventory overhaul Phase 7, D7)
// world.commitments[] — the resident-side sibling of world.visits[].
// Where a visit is "an external NPC is onsite for a window", a commitment
// is "a resident agreed to be somewhere for a window" — currently only
// shared meals, but shaped generically (the same table later serves movie
// nights, chore agreements, and anything else the household agrees to do
// together).
//
// Record shape (see the plan's Data model):
//   { id, kind, startAbs, endAbs, roomId,
//     invitedIds, acceptedIds, declinedIds, status }
// status: 'scheduled' (invite out, meal not yet held) → 'held' (the meal
// happened during its window) | 'missed' (the window passed with no meal).
//
// startAbs/endAbs are clockToAbsolute-space (day*1440 + minutes), the same
// convention world.visits[] uses (external-world-retiming-plan D6) — a
// commitment has no separate `day` field; commitmentDay() derives it, the
// same way sim.js's visitDay() does. This closes a gap the continuous-
// simulation roadmap's C1 left behind: this file and OVERTURE's proposeTerms
// were never converted by any of the roadmap's five plans, despite being
// squarely in the visit/initiative layers C1 says must not branch on ticks.
//
// `kind` is a COMMITMENT_KINDS key (config.js). Since the initiative plan's
// Phase 4 there are two: 'meal', which the player books through
// doInviteDinner, and 'hangout', which an NPC books by PROPOSING one and the
// player accepting (D8) — the first commitment in the game whose invitation
// came from the other side. What a kind changes is exactly one thing: the
// schedule block resolveScheduleActivity returns while its window is live.
// Everything else in this file is kind-agnostic and always was; only the two
// MEAL-specific reads below (activeMealCommitmentsInRoom, mealAttendees) filter
// on it, because only a dinner table has attendees.
//
// Like world.visits, commitments are WORLD-SCHEDULE state, not item state:
// they are created by schedule-style helpers (createCommitment) and
// mutated directly on gameState.world.commitments — scheduleVisit (SIM)
// sets that precedent by pushing straight into world.visits. They never
// touch stacks; item mutation still routes exclusively through applyEffects.
//
// The schedule override lives in SIM's resolveScheduleActivity: a resident
// with an ACTIVE accepted commitment is relocated to the commitment's room
// for its window — an invitation binds rather than hopes. The meal itself
// (DEFS.ACTIONS' set_meal) resolves the commitments' accepted NPCs who are
// actually at the table and feeds everyone from the real item via EAT_ITEM.

// Decision function: would this NPC accept a commitment at the proposed
// day/time? Pure — reads relPlayer + schedule template + a seeded draw, so
// the same save always gives the same answer (reloading never renegotiates
// a yes or a no). Returns { accept, reason: 'accept'|'busy'|'cool', block }.
// 'busy' = the NPC's own schedule has work/commute/sleep at that time (a
// real reason, named in the invite narration); 'cool' = the relationship
// isn't there.
function respondToCommitment(npc, npcId, commitment, gameState) {
  const rel = npc.relPlayer || {};
  const affection = rel.affection || 0;
  const tension = rel.tension || 0;
  // Is the NPC's own schedule block at the proposed time free? Probed with
  // a synthetic clock for that day/window — deliberately WITHOUT gameState
  // so the probe can't see this very commitment (it isn't active yet anyway,
  // but the call must not depend on that).
  const probeClock = absoluteToClock(commitment.startAbs);
  const { block } = resolveScheduleActivity(npc, probeClock);
  if (COMMITMENT_TUNING.busyBlocks.includes(block)) {
    return { accept: false, reason: 'busy', block };
  }
  const score = affection - tension * COMMITMENT_TUNING.tensionPenaltyWeight;
  const rng = seededRng(gameState.meta?.seed ?? gameState.seed, `commit_${commitment.id}_${npcId}`);
  const noise = (rng() - 0.5) * 2 * COMMITMENT_TUNING.acceptNoiseRange;
  const accept = score + noise >= COMMITMENT_TUNING.acceptThreshold;
  return { accept, reason: accept ? 'accept' : 'cool', block };
}

// The day a commitment falls on, derived rather than stored — the same
// pattern sim.js's visitDay() uses for world.visits[].
function commitmentDay(c) {
  return Math.floor(c.startAbs / 1440);
}

// Active commitment for a resident RIGHT NOW: one they accepted, still
// 'scheduled', of a kind the game knows, and the current clock inside its
// window. This is what SIM's resolveScheduleActivity checks first.
//
// The kind test used to be `=== 'meal'` and is now "is a COMMITMENT_KINDS key"
// — which keeps it a real filter rather than dropping it. A record of an
// unknown kind has no block to override the schedule WITH, so it must not be
// found here; falling through to the template is the only safe answer.
function activeCommitmentFor(npcId, gameState) {
  const clock = gameState?.meta?.clock;
  if (!clock || clock.day == null) return null;
  const nowAbs = clockToAbsolute(clock);
  const list = gameState?.world?.commitments;
  if (!Array.isArray(list)) return null;
  return list.find(c =>
    COMMITMENT_KINDS[c.kind] &&
    c.status === 'scheduled' &&
    nowAbs >= c.startAbs && nowAbs < c.endAbs &&
    (c.acceptedIds || []).includes(npcId)
  ) || null;
}

// Every commitment whose window is live right now in a given room. Two
// separate invitations to the same dinner are two records; the meal
// resolution unions their accepted NPCs.
function activeMealCommitmentsInRoom(gameState, roomId) {
  const clock = gameState?.meta?.clock;
  if (!clock || clock.day == null) return [];
  const nowAbs = clockToAbsolute(clock);
  return (gameState?.world?.commitments || []).filter(c =>
    c.kind === 'meal' &&
    c.roomId === roomId &&
    c.status === 'scheduled' &&
    nowAbs >= c.startAbs && nowAbs < c.endAbs
  );
}

// Create one commitment and immediately resolve each invitee's answer (you
// ask, they say yes/no on the spot). Dedupes an overlapping same-slot
// invitation to the same NPC instead of stacking a second dinner on top of
// itself. Returns { record, responses } where responses maps npcId →
// { accept, reason, block } — the durable record keeps only
// acceptedIds/declinedIds; the reasons are narration-time flavour.
//
// `kind` defaults to 'meal' so every existing caller reads unchanged.
//
// `proposerId` (initiative plan Phase 4) is an NPC who is not polled because
// they are the one ASKING: they go straight into acceptedIds. Nobody declines
// their own proposal, and putting them through respondToCommitment would let a
// noise draw do exactly that. The slot they proposed was already checked
// against their schedule by OVERTURE's proposeTerms, using this file's own
// busyBlocks bar — so the one thing respondToCommitment would have caught has
// been caught upstream, where it belongs.
function createCommitment(gameState, { kind, startAbs, endAbs, roomId, invitedIds, proposerId }) {
  const list = gameState.world.commitments || (gameState.world.commitments = []);
  kind = kind || 'meal';
  const existing = list.find(c =>
    c.kind === kind &&
    c.startAbs === startAbs && c.endAbs === endAbs &&
    ((c.invitedIds || []).some(i => (invitedIds || []).includes(i))
     || (proposerId && (c.acceptedIds || []).includes(proposerId)))
  );
  if (existing) {
    const responses = {};
    for (const i of invitedIds || []) {
      // An NPC new to this record goes through the real acceptance logic;
      // one already invited to the same slot answers with its stored
      // membership (the reason is narration-time flavour, so a deduped
      // re-invite reads as a plain accept/decline).
      if (!existing.invitedIds.includes(i)) {
        existing.invitedIds.push(i);
        const npc = gameState.npcs?.[i];
        if (!npc || npc.residency?.status !== 'resident') {
          responses[i] = { accept: false, reason: 'busy', block: 'away' };
          existing.declinedIds.push(i);
        } else {
          const res = respondToCommitment(npc, i, existing, gameState);
          responses[i] = res;
          if (res.accept) existing.acceptedIds.push(i);
          else existing.declinedIds.push(i);
        }
      } else {
        responses[i] = existing.acceptedIds.includes(i)
          ? { accept: true, reason: 'accept' }
          : { accept: false, reason: 'cool' };
      }
    }
    return { record: existing, responses };
  }
  const record = {
    id: `commit_${startAbs}_${list.length}`,
    kind,
    startAbs, endAbs, roomId,
    invitedIds: [...(invitedIds || [])],
    acceptedIds: proposerId ? [proposerId] : [],
    declinedIds: [],
    status: 'scheduled',
  };
  const responses = {};
  for (const npcId of invitedIds || []) {
    const npc = gameState.npcs?.[npcId];
    // Only residents can be committed to a household meal (a guest arrives
    // through the visits system instead).
    if (!npc || npc.residency?.status !== 'resident') {
      responses[npcId] = { accept: false, reason: 'busy', block: 'away' };
      record.declinedIds.push(npcId);
      continue;
    }
    const res = respondToCommitment(npc, npcId, record, gameState);
    responses[npcId] = res;
    if (res.accept) record.acceptedIds.push(npcId);
    else record.declinedIds.push(npcId);
  }
  list.push(record);
  return { record, responses };
}

// Day-rollover sweep (UI's processDayRollover): a 'scheduled' commitment
// whose day has passed without a meal becomes 'missed' (nobody set the
// table), and old held/missed records are pruned past retainedDays so
// world state doesn't grow forever — same retention rationale as
// VISIT_TUNING.retainDoneDays.
function processCommitmentsForDay(gameState, day) {
  const list = gameState?.world?.commitments;
  if (!Array.isArray(list)) return;
  for (const c of list) {
    if (c.status === 'scheduled' && commitmentDay(c) < day) c.status = 'missed';
  }
  const cutoff = day - COMMITMENT_TUNING.retainedDays;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (commitmentDay(c) < cutoff && (c.status === 'held' || c.status === 'missed')) list.splice(i, 1);
  }
}

// The dinner table's attendee roster right now: residents physically
// present in the room, tagged with whether they were committed to this
// meal (accepted an active commitment for this room). Pure read — the
// relocation side is SIM's resolveScheduleActivity doing its job.
function mealAttendees(gameState, roomId) {
  const present = getPresentNpcIds(gameState.npcs, roomId);
  const committedIds = new Set(
    activeMealCommitmentsInRoom(gameState, roomId).flatMap(c => c.acceptedIds || [])
  );
  return present.map(id => ({
    npcId: id,
    npc: gameState.npcs[id],
    committed: committedIds.has(id),
  }));
}

// ===== /SECTION: COMMITMENTS =====
