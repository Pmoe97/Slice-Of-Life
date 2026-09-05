// ===== SECTION: MAIL =====
// Actions & Activities Overhaul Phase 12 (D21): the front door becomes real.
// Two independent mechanics that share this file because both are about
// what shows up at the apartment's one entrance:
//   - The mailbox (world.mailbox[]): bills/flyers/letters, generated once a
//     day (processMailForDay) and claimed through the new mailbox object's
//     Get Mail verb (defs.actions.js). A 'bill' entry is never invented
//     here — ui.js's processBillsForDayUi calls pushMailEntry directly, the
//     moment the REAL bill system (money.js-adjacent computer.js's
//     processBillsForDay) actually posts a charge, so the mailbox can never
//     disagree with the bills app about what's due.
//   - The door event (world.doorEvent): a single pending "who's there" — at
//     most one caller at a time, matching a real front door. Two sources
//     this phase: a Nile/Home delivery (world.deliveries) retimed off its
//     old instant/silent doormat placement, and a solicitor (flavor-only,
//     no NPC record). Admit hands a delivery straight to the player
//     (mirrors ui.js's handOverFoodOrder toPlayer branch); refuse/ignore/
//     timeout falls back to EXACTLY the prior silent doormat placement
//     (fallbackDeliveryToDoormat), so an AFK or inattentive player loses
//     nothing.
//
// Deliberately NOT built this phase: routing the existing friend-of-
// roommate/outside-partner visit systems (ui.js's processFriendVisitsForDay/
// processOutsidePartnerVisitsForDay) through this same door event. Those are
// two already-shipped, tested organic-visit systems with their own soft-cap/
// cooldown machinery (VISIT_TUNING/FRIEND_TUNING); folding them into
// "who's there, admit or refuse" is a real, contained follow-up, not a
// same-phase rewrite of two working systems for a flavor payoff. See the
// Phase 12 Handoff for the explicit flag.
//
// Every function here takes `gameState` explicitly (never reads the global
// currentGameState) — the same discipline processLaundryWearForDay/
// planFriendVisitsForDay follow, and what makes this file directly
// Node-testable in dev/verify without a DOM.

// --- Mailbox ---

function pushMailEntry(gameState, kind, from, day) {
  const mailbox = gameState.world.mailbox || (gameState.world.mailbox = []);
  const id = `mail_${day}_${mailbox.length}_${kind}`;
  const entry = { id, kind, from: from || null, arrivedDay: day, claimed: false };
  mailbox.push(entry);
  return entry;
}

// Solicitor: rolled once per day, seeded by day — idempotent under replay.
// Skipped entirely if a door event is already pending (a real awaited
// delivery, or yesterday's solicitor somehow still ringing) so a random
// flavor roll never bumps something that actually matters. The window is a
// FIXED time of day (MAIL_TUNING.solicitorStartMinute), not randomized, so
// a harness can assert the exact ring window without depending on when a
// tick-driven sweep happens to first run.
function maybeScheduleSolicitor(gameState, day) {
  if (gameState.world.doorEvent) return null;
  const rng = seededRng(gameState.meta.seed, `solicitor_${day}`);
  if (rng() >= MAIL_TUNING.solicitorChance) return null;
  const dayStartAbs = day * 1440;
  const evt = {
    id: `door_solicitor_${day}`, kind: 'solicitor',
    label: SOLICITOR_LABELS[Math.floor(rng() * SOLICITOR_LABELS.length)],
    refId: null,
    createdAbs: dayStartAbs + MAIL_TUNING.solicitorStartMinute,
    expiresAbs: dayStartAbs + MAIL_TUNING.solicitorStartMinute + MAIL_TUNING.solicitorWindowMinutes,
    announced: false,
  };
  gameState.world.doorEvent = evt;
  return evt;
}

// Daily rollover: flyers/letters roll independently of each other and of
// the solicitor roll; bills are pushed separately (see file header). Also
// prunes long-claimed mail (MAIL_TUNING.retainClaimedDays) so the array
// doesn't grow for the life of the playthrough — nothing ever re-reads a
// claimed entry, so once it ages out it's pure save weight.
// Returns the flyer/letter entries created today, for the caller to narrate.
function processMailForDay(gameState, day) {
  if (!gameState?.world) return [];
  const mailbox = gameState.world.mailbox || (gameState.world.mailbox = []);
  const rng = seededRng(gameState.meta.seed, `mail_${day}`);
  const created = [];
  if (rng() < MAIL_TUNING.flyerChance) {
    created.push(pushMailEntry(gameState, 'flyer', MAIL_FLYER_SENDERS[Math.floor(rng() * MAIL_FLYER_SENDERS.length)], day));
  }
  if (rng() < MAIL_TUNING.letterChance) {
    created.push(pushMailEntry(gameState, 'letter', MAIL_LETTER_SENDERS[Math.floor(rng() * MAIL_LETTER_SENDERS.length)], day));
  }
  maybeScheduleSolicitor(gameState, day);
  const cutoff = day - MAIL_TUNING.retainClaimedDays;
  for (let i = mailbox.length - 1; i >= 0; i--) {
    if (mailbox[i].claimed && mailbox[i].arrivedDay < cutoff) mailbox.splice(i, 1);
  }
  return created;
}

// --- Door event ---

// world.deliveries retiming: called from ui.js's processDeliveriesForDay in
// place of the old instant SPAWN_ITEM-onto-doormat. Only queues if the
// single door-event slot is free; if it's busy (another delivery or a
// solicitor already ringing), this delivery simply retries on the NEXT
// day's rollover — its status stays 'ordered' and `day < d.etaDay` is false
// forever once the ETA has passed, so nothing is ever silently dropped.
function queueDeliveryDoorEvent(gameState, delivery, day) {
  if (gameState.world.doorEvent) return null;
  const nowAbs = clockToAbsolute(gameState.meta.clock);
  const evt = {
    id: `door_${delivery.id}`, kind: 'delivery',
    label: 'A delivery courier', refId: delivery.id,
    createdAbs: nowAbs, expiresAbs: nowAbs + MAIL_TUNING.deliveryKnockWindowMinutes,
    announced: false,
  };
  gameState.world.doorEvent = evt;
  return evt;
}

// Fallback: EXACTLY the pre-Phase-12 processDeliveriesForDay body — a
// delivery that goes unanswered lands on the doormat, uncollected, same as
// it always did. Returns the narration line for the caller to log.
function fallbackDeliveryToDoormat(gameState, delivery) {
  delivery.status = 'delivered';
  delivery.deliveredDay = gameState.meta.clock.day;
  delivery.handedTo = 'doormat';
  const doormat = Object.values(gameState.objects?.room_entry || {}).find(o => o.defId === 'doormat');
  const label = ITEM_DEFS[delivery.defId]?.label || delivery.defId || 'a package';
  if (doormat && delivery.defId) {
    doormat.contents = addStack(doormat.contents, delivery.defId, delivery.qty || 1, null, {}, gameDaysNow(gameState.meta.clock));
    return `A delivery has arrived: ${label}. It's waiting by the front door.`;
  }
  return `A delivery has arrived: ${label}.`;
}

// The admit/refuse resolver behind self.answer_door / self.refuse_door
// (RESOLVE_DOOR_EVENT's applier calls straight into this — the same
// thin-effects-wrapper-over-a-real-function shape as applyMoveGarments /
// moveGarmentStacks). Clears the slot unconditionally: whatever happens
// next, the caller is no longer standing there. For a delivery, the actual
// item hand-off (to the player or to the doormat) is a separate SPAWN_ITEM
// effect line built by the action's own buildEffects, using data this
// function's caller already read in prepare() — this only flips the
// delivery record's bookkeeping (status/handedTo), mirroring
// handOverFoodOrder's own status write.
function resolveDoorEventDecision(gameState, decision) {
  const evt = gameState.world.doorEvent;
  gameState.world.doorEvent = null;
  if (!evt) return null;
  if (evt.kind === 'delivery') {
    const delivery = (gameState.world.deliveries || []).find(d => d.id === evt.refId);
    if (delivery) {
      delivery.status = 'delivered';
      delivery.deliveredDay = gameState.meta.clock.day;
      delivery.handedTo = decision === 'admit' ? 'player' : 'doormat';
    }
  }
  return evt;
}

// Tick-driven (called from ui.js's advanceAndResolve, the same "every path
// that moves the clock goes through here" reasoning as processFoodOrdersNow):
// announces a pending event the first time the clock reaches its
// createdAbs, and resolves an unanswered one to its fallback once its
// expiresAbs passes. Pure — mutates gameState, returns a narration line (or
// null) for the caller to log; never calls addLogEntry itself.
function sweepDoorEvent(gameState) {
  const evt = gameState?.world?.doorEvent;
  if (!evt) return null;
  const nowAbs = clockToAbsolute(gameState.meta.clock);
  // Expiry is checked FIRST, ahead of the announce transition: a sweep that
  // hasn't run since before createdAbs and doesn't run again until after
  // expiresAbs (a long idle stretch) must resolve straight to the fallback,
  // not "announce" a knock for an event that's already given up and left.
  if (nowAbs >= evt.expiresAbs) {
    gameState.world.doorEvent = null;
    if (evt.kind === 'delivery') {
      const delivery = (gameState.world.deliveries || []).find(d => d.id === evt.refId);
      if (delivery && delivery.status === 'ordered') return fallbackDeliveryToDoormat(gameState, delivery);
      return null;
    }
    return 'Nobody answered — whoever it was gave up and left.';
  }
  if (!evt.announced && nowAbs >= evt.createdAbs) {
    evt.announced = true;
    return DOOR_KNOCK_LINES[evt.kind] || 'There is a knock at the door.';
  }
  return null;
}
