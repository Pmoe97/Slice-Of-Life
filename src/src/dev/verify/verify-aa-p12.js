// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 12: Entry — mail, deliveries, answer the door (D21).
//
//   node src/src/dev/verify/verify-aa-p12.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// three new verbs (self.get_mail, self.answer_door, self.refuse_door) and
// their requirement checkers (hasUnclaimedMail, doorEventPending); the two
// new trusted effects (CLAIM_MAIL, RESOLVE_DOOR_EVENT); the mailbox's daily
// roll and claim (processMailForDay/pushMailEntry/prepareGetMail); the
// Nile/Home delivery retiming (queueDeliveryDoorEvent — admit hands the
// item straight to the player, refuse/expiry falls back to exactly the old
// silent doormat placement); the solicitor's daily roll and its fixed ring
// window (maybeScheduleSolicitor); and the tick-driven sweep (sweepDoorEvent
// — announce-once, then resolve-to-fallback on expiry). The ui.js glue this
// phase adds (the one-line pushMailEntry call inside processBillsForDayUi,
// and processDeliveriesForDay/advanceAndResolve calling into mail.js) is UI
// layer and outside this loader (invariant 7) — verified on the live page
// instead; this harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'world.js',
    'items.js', 'mail.js', 'time.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const mailTuning = J('MAIL_TUNING');

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'entry';
    return g;
  };
  __objByDef = (g, roomId, defId) => Object.values(g.objects['room_' + roomId] || {}).find(o => o.defId === defId);
  __ctx = (g, roomId) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: [] });
  __apply = (g, roomId, lines) => applyEffects(parseEffectDSL(lines.join('\\n')), __ctx(g, roomId));
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — three verbs, two checkers, two trusted effects, the mailbox object + entry placement');
const reg = J(`({
  actions: {
    getMail: ACTION_DEFS['self.get_mail'],
    answerDoor: ACTION_DEFS['self.answer_door'],
    refuseDoor: ACTION_DEFS['self.refuse_door'],
  },
  checkers: {
    hasUnclaimedMail: typeof ACTION_REQUIREMENT_CHECKERS.hasUnclaimedMail === 'function',
    doorEventPending: typeof ACTION_REQUIREMENT_CHECKERS.doorEventPending === 'function',
  },
  effects: {
    claimMail: EFFECT_DEFS.CLAIM_MAIL && EFFECT_DEFS.CLAIM_MAIL.implemented,
    resolveDoorEvent: EFFECT_DEFS.RESOLVE_DOOR_EVENT && EFFECT_DEFS.RESOLVE_DOOR_EVENT.implemented,
  },
  mailboxDef: OBJECT_DEFS.mailbox,
  entryLayoutHasMailbox: APARTMENT_LAYOUT.entry.some(o => o.defId === 'mailbox'),
  tuning: { getMail: MAIL_TUNING.getMailMinutes, answer: MAIL_TUNING.answerDoorMinutes, refuse: MAIL_TUNING.refuseDoorMinutes,
    deliveryWindow: MAIL_TUNING.deliveryKnockWindowMinutes, solicitorWindow: MAIL_TUNING.solicitorWindowMinutes },
})`);
check('all three ACTION_DEFS entries exist', Object.values(reg.actions).every(Boolean), JSON.stringify(Object.keys(reg.actions).filter(k => !reg.actions[k])));
check('every new action declares a timeCost (verify-i5 invariant)', Object.values(reg.actions).every(a => a.timeCost && typeof a.timeCost.base === 'number'));
check('both new requirement checkers exist', Object.values(reg.checkers).every(Boolean));
check('both new trusted effects are registered and implemented', Object.values(reg.effects).every(Boolean), JSON.stringify(reg.effects));
check('mailbox OBJECT_DEFS entry exists and affords self.get_mail', !!reg.mailboxDef && reg.mailboxDef.affords.includes('self.get_mail'));
check("APARTMENT_LAYOUT.entry places the mailbox", reg.entryLayoutHasMailbox === true);
check('MAIL_TUNING carries real positive minute values', Object.values(reg.tuning).every(v => typeof v === 'number' && v > 0), JSON.stringify(reg.tuning));

// ---------------------------------------------------------------- 1
console.log('\n1. Mailbox: accumulates, gates self.get_mail, claim marks everything claimed, and processMailForDay is seeded-deterministic');
const mailbox = J(`(() => {
  const g = __mk(31, 5);
  const ctxEntry = __ctx(g, 'entry');
  const gateEmpty = ACTION_REQUIREMENT_CHECKERS.hasUnclaimedMail(ctxEntry);

  pushMailEntry(g, 'bill', 'GreenLeaf Electric', 5);
  pushMailEntry(g, 'flyer', 'a pizza place two blocks over', 5);
  const gateAfterPush = ACTION_REQUIREMENT_CHECKERS.hasUnclaimedMail(ctxEntry);

  const prepared = prepareGetMail(ctxEntry);
  const narration = getMailNarration(ctxEntry, prepared);
  __apply(g, 'entry', buildGetMailEffects(ctxEntry, prepared));
  const allClaimed = g.world.mailbox.every(m => m.claimed);
  const gateAfterClaim = ACTION_REQUIREMENT_CHECKERS.hasUnclaimedMail(ctxEntry);

  // Determinism: same seed/day, two independent states, must produce the
  // exact same flyer/letter roll.
  const g2a = __mk(31, 40);
  const g2b = __mk(31, 40);
  const createdA = processMailForDay(g2a, 40);
  const createdB = processMailForDay(g2b, 40);

  // Pruning: a long-claimed entry ages out; an unclaimed one never does.
  const g3 = __mk(31, 100);
  g3.world.mailbox = [
    { id: 'old_claimed', kind: 'flyer', from: 'x', arrivedDay: 1, claimed: true },
    { id: 'old_unclaimed', kind: 'letter', from: 'y', arrivedDay: 1, claimed: false },
  ];
  processMailForDay(g3, 100);
  const oldClaimedGone = !g3.world.mailbox.some(m => m.id === 'old_claimed');
  const oldUnclaimedSurvives = g3.world.mailbox.some(m => m.id === 'old_unclaimed');

  return { gateEmpty, gateAfterPush, narration, allClaimed, gateAfterClaim, createdA, createdB, oldClaimedGone, oldUnclaimedSurvives };
})()`);
check('hasUnclaimedMail refuses an empty mailbox', mailbox.gateEmpty !== true, JSON.stringify(mailbox.gateEmpty));
check('hasUnclaimedMail opens once mail is pushed', mailbox.gateAfterPush === true);
check('Get Mail narration names both pieces of mail', /bill from GreenLeaf Electric/.test(mailbox.narration) && /flyer from a pizza place/.test(mailbox.narration), mailbox.narration);
check('CLAIM_MAIL marks every mailbox entry claimed', mailbox.allClaimed === true);
check('hasUnclaimedMail closes again once everything is claimed', mailbox.gateAfterClaim !== true, JSON.stringify(mailbox.gateAfterClaim));
check('processMailForDay is seeded-deterministic (same seed+day => same roll)', JSON.stringify(mailbox.createdA) === JSON.stringify(mailbox.createdB), JSON.stringify([mailbox.createdA, mailbox.createdB]));
check('processMailForDay prunes a long-claimed entry', mailbox.oldClaimedGone === true);
check('processMailForDay never prunes an unclaimed entry, however old', mailbox.oldUnclaimedSurvives === true);

// ---------------------------------------------------------------- 2
console.log('\n2. Delivery retiming: queueDeliveryDoorEvent opens a door event; admit hands the item to the player; refuse and expiry both fall back to exactly the old doormat placement');
const delivery = J(`(() => {
  const g = __mk(32, 3);
  g.meta.clock.day = 3; g.meta.clock.minutes = 0;
  const ctxEntry = __ctx(g, 'entry');

  // Admit.
  g.world.deliveries = [{ id: 'del_1', defId: 'book', qty: 1, status: 'ordered', etaDay: 3, orderedDay: 2 }];
  const evt1 = queueDeliveryDoorEvent(g, g.world.deliveries[0], 3);
  const gatePendingRightAway = ACTION_REQUIREMENT_CHECKERS.doorEventPending(ctxEntry);
  const prepared1 = prepareDoorEvent(ctxEntry);
  const narrationAdmit = answerDoorNarration(ctxEntry, prepared1);
  __apply(g, 'entry', buildAnswerDoorEffects(ctxEntry, prepared1));
  const d1 = g.world.deliveries[0];
  const admittedInInventory = (g.player.inventory || []).some(s => s.defId === 'book');
  const doorClearedAfterAdmit = g.world.doorEvent === null;

  // Refuse: a second delivery, same day.
  g.world.deliveries.push({ id: 'del_2', defId: 'book', qty: 1, status: 'ordered', etaDay: 3, orderedDay: 2 });
  const evt2 = queueDeliveryDoorEvent(g, g.world.deliveries[1], 3);
  const prepared2 = prepareDoorEvent(ctxEntry);
  const narrationRefuse = refuseDoorNarration(ctxEntry, prepared2);
  __apply(g, 'entry', buildRefuseDoorEffects(ctxEntry, prepared2));
  const d2 = g.world.deliveries[1];
  const doormat = __objByDef(g, 'entry', 'doormat');
  // Sum qty rather than counting array entries — 'book' is stackable, so a
  // second addStack of the same defId/owner merges into the first entry
  // instead of pushing a new one.
  const doormatQty = () => (doormat.contents || []).filter(s => s.defId === 'book').reduce((sum, s) => sum + (s.qty || 0), 0);
  const refusedOnDoormat = doormatQty(); // 1 from refuse so far

  // A third delivery arrives while the door is already busy (occupied here
  // by hand — a solicitor mid-ring would do the same) — the queue attempt
  // itself must no-op, not silently drop the order.
  g.world.deliveries.push({ id: 'del_3', defId: 'book', qty: 1, status: 'ordered', etaDay: 3, orderedDay: 2 });
  g.world.doorEvent = { id: 'occupied', kind: 'solicitor', refId: null, label: 'x', createdAbs: 0, expiresAbs: 999999, announced: true };
  const queueWhileBusy = queueDeliveryDoorEvent(g, g.world.deliveries[2], 3);

  // Expiry fallback: a fourth delivery, unanswered past its window.
  g.world.doorEvent = null;
  g.world.deliveries.push({ id: 'del_4', defId: 'book', qty: 1, status: 'ordered', etaDay: 3, orderedDay: 2 });
  const evt4 = queueDeliveryDoorEvent(g, g.world.deliveries[3], 3);
  g.meta.clock.day = Math.floor((evt4.expiresAbs + 1) / 1440);
  g.meta.clock.minutes = (evt4.expiresAbs + 1) - g.meta.clock.day * 1440;
  const fallbackLine = sweepDoorEvent(g);
  const d4 = g.world.deliveries[3];
  const doormatAfterFallback = doormatQty(); // refuse's 1 + fallback's 1 = 2
  const doorClearedAfterExpiry = g.world.doorEvent === null;

  return {
    gatePendingRightAway, narrationAdmit, deliveredStatus1: d1.status, handedTo1: d1.handedTo, admittedInInventory, doorClearedAfterAdmit,
    narrationRefuse, deliveredStatus2: d2.status, handedTo2: d2.handedTo, refusedOnDoormat,
    queueWhileBusy,
    fallbackLine, deliveredStatus4: d4.status, handedTo4: d4.handedTo, doormatAfterFallback, doorClearedAfterExpiry,
  };
})()`);
check('a freshly-queued delivery door event is pending immediately (createdAbs === now)', delivery.gatePendingRightAway === true);
check('Answer the Door narration names the courier', /delivery courier/i.test(delivery.narrationAdmit), delivery.narrationAdmit);
check('admit flips the delivery to delivered/player', delivery.deliveredStatus1 === 'delivered' && delivery.handedTo1 === 'player');
check('admit hands the item straight to the player inventory', delivery.admittedInInventory === true);
check('admit clears world.doorEvent', delivery.doorClearedAfterAdmit === true);
check('refuse flips the delivery to delivered/doormat', delivery.deliveredStatus2 === 'delivered' && delivery.handedTo2 === 'doormat');
check('refuse places the item on the doormat, not the player', delivery.refusedOnDoormat === 1, delivery.refusedOnDoormat);
check('queueDeliveryDoorEvent no-ops (never overwrites) when the one door-event slot is already busy', delivery.queueWhileBusy === null);
check('an unanswered delivery falls back to EXACTLY the old doormat placement once its window expires', delivery.deliveredStatus4 === 'delivered' && delivery.handedTo4 === 'doormat');
check('the expiry fallback narration matches the pre-Phase-12 line', /waiting by the front door/.test(delivery.fallbackLine), delivery.fallbackLine);
check('the expiry fallback actually placed the item (doormat now holds both refused deliveries)', delivery.doormatAfterFallback === 2, delivery.doormatAfterFallback);
check('expiry clears world.doorEvent too', delivery.doorClearedAfterExpiry === true);

// ---------------------------------------------------------------- 3
console.log('\n3. Solicitor: seeded daily roll, a fixed ring window, doorEventPending respects it, sweep announces once then resolves to nothing left behind');
const solicitor = J(`(() => {
  let hit = null;
  for (let d = 1; d < 500 && !hit; d++) {
    const g = __mk(41, d);
    const evt = maybeScheduleSolicitor(g, d);
    if (evt) hit = { day: d, evt, doorEventIsEvt: g.world.doorEvent === evt };
  }
  if (!hit) return { hit: null };

  // Determinism: same seed+day rolled twice must agree.
  const gRepeat = __mk(41, hit.day);
  const evtRepeat = maybeScheduleSolicitor(gRepeat, hit.day);

  // Never overwrites an already-occupied slot.
  const gBusy = __mk(41, hit.day);
  gBusy.world.doorEvent = { id: 'existing', kind: 'delivery', refId: 'x', createdAbs: 0, expiresAbs: 999999, announced: true };
  const blocked = maybeScheduleSolicitor(gBusy, hit.day);

  // Gate boundaries: before its window, at its window start, after it expires.
  const gGate = __mk(41, hit.day);
  gGate.world.doorEvent = { ...hit.evt, announced: false };
  gGate.meta.clock.day = hit.day; gGate.meta.clock.minutes = 0;
  const ctxGate = __ctx(gGate, 'entry');
  const beforeWindow = ACTION_REQUIREMENT_CHECKERS.doorEventPending(ctxGate);
  gGate.meta.clock.minutes = MAIL_TUNING.solicitorStartMinute;
  const atWindowStart = ACTION_REQUIREMENT_CHECKERS.doorEventPending(ctxGate);
  gGate.meta.clock.minutes = MAIL_TUNING.solicitorStartMinute + MAIL_TUNING.solicitorWindowMinutes + 1;
  const afterWindow = ACTION_REQUIREMENT_CHECKERS.doorEventPending(ctxGate);

  // Sweep: announce-once at window start, then resolve-to-nothing at expiry.
  const gSweep = __mk(41, hit.day);
  gSweep.world.doorEvent = { ...hit.evt, announced: false };
  gSweep.meta.clock.day = hit.day; gSweep.meta.clock.minutes = MAIL_TUNING.solicitorStartMinute;
  const line1 = sweepDoorEvent(gSweep);
  const announcedNow = gSweep.world.doorEvent && gSweep.world.doorEvent.announced === true;
  const line2 = sweepDoorEvent(gSweep); // same moment, already announced, not yet expired
  gSweep.meta.clock.minutes = MAIL_TUNING.solicitorStartMinute + MAIL_TUNING.solicitorWindowMinutes + 1;
  const line3 = sweepDoorEvent(gSweep);
  const clearedAfterExpiry = gSweep.world.doorEvent === null;

  // Admit: mood effect fires, narration names the solicitor, slot clears.
  const gAdmit = __mk(41, hit.day);
  gAdmit.world.doorEvent = { ...hit.evt, announced: true };
  const ctxAdmit = __ctx(gAdmit, 'entry');
  const prepared = prepareDoorEvent(ctxAdmit);
  const narrationAdmit = answerDoorNarration(ctxAdmit, prepared);
  const moodBefore = (gAdmit.player.moodEvents || []).length;
  __apply(gAdmit, 'entry', buildAnswerDoorEffects(ctxAdmit, prepared));
  const moodAfter = (gAdmit.player.moodEvents || []).length;
  const doorClearedAfterAdmit = gAdmit.world.doorEvent === null;

  return {
    hit, evtRepeatMatches: JSON.stringify(evtRepeat) === JSON.stringify(hit.evt), blocked,
    beforeWindow, atWindowStart, afterWindow,
    line1, announcedNow, line2, line3, clearedAfterExpiry,
    narrationAdmit, moodBefore, moodAfter, doorClearedAfterAdmit,
  };
})()`);
check('maybeScheduleSolicitor rolls a hit within 500 days at a 12% daily chance', !!solicitor.hit, 'no hit in 500 days — check MAIL_TUNING.solicitorChance / the seed');
if (solicitor.hit) {
  check('a solicitor door event carries kind/label/a fixed window', solicitor.hit.evt.kind === 'solicitor' && typeof solicitor.hit.evt.label === 'string'
    && solicitor.hit.evt.createdAbs === solicitor.hit.day * 1440 + mailTuning.solicitorStartMinute
    && solicitor.hit.evt.expiresAbs === solicitor.hit.day * 1440 + mailTuning.solicitorStartMinute + mailTuning.solicitorWindowMinutes,
    JSON.stringify(solicitor.hit.evt));
  check('the created event is written to world.doorEvent (same reference)', solicitor.hit.doorEventIsEvt === true);
  check('maybeScheduleSolicitor is seeded-deterministic (same seed+day => same roll)', solicitor.evtRepeatMatches === true);
  check('maybeScheduleSolicitor never overwrites an already-occupied door-event slot', solicitor.blocked === null);
  check('doorEventPending refuses before the scheduled window opens', solicitor.beforeWindow !== true, JSON.stringify(solicitor.beforeWindow));
  check('doorEventPending opens exactly at the window start', solicitor.atWindowStart === true);
  check('doorEventPending refuses once the window has closed', solicitor.afterWindow !== true, JSON.stringify(solicitor.afterWindow));
  check('sweepDoorEvent announces the knock the first time the window opens', typeof solicitor.line1 === 'string' && solicitor.line1.length > 0, solicitor.line1);
  check('sweepDoorEvent marks the event announced so it never re-announces', solicitor.announcedNow === true && solicitor.line2 === null, JSON.stringify([solicitor.announcedNow, solicitor.line2]));
  check('sweepDoorEvent resolves an unanswered solicitor to a real line, no item side effects', typeof solicitor.line3 === 'string' && solicitor.line3.length > 0, solicitor.line3);
  check('sweepDoorEvent clears world.doorEvent on solicitor expiry too', solicitor.clearedAfterExpiry === true);
  check('admitting a solicitor names them in the narration', solicitor.narrationAdmit.includes(solicitor.hit.evt.label), solicitor.narrationAdmit);
  check('admitting a solicitor costs a little mood (a real, if mild, tradeoff for refuse)', solicitor.moodAfter > solicitor.moodBefore, JSON.stringify(solicitor));
  check('admit clears world.doorEvent', solicitor.doorClearedAfterAdmit === true);
}

// ---------------------------------------------------------------- summary
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
