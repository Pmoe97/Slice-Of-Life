// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 1: the invitation & event core (D1-D4).
//
//   node src/src/dev/verify/verify-aa-p1.js
//
// This is also asks.js's FIRST Node coverage of any kind — it was missing
// from loadgame.js's ORDER entirely (invariant 8's exact bug shape) across
// the whole asks-and-attachments-plan run; added here in the same commit as
// ASK_INVITE. A load failure of asks.js itself will show up as `required`
// throwing before section 0 ever prints.
//
// What's asserted, in the order it would hurt if it broke:
//   - $Invite is a real ASK_TYPES/ASK_CATEGORIES entry, registered once.
//   - decide() never lets flavor text move the accept/decline verdict
//     (invariant 2/D1) — only which kind/room/extra-invitees get WRITTEN.
//   - inviteKindFromFlavor / inviteExtraGuestsFromFlavor parse the way the
//     plan's own Verification line ("$Invite dinner with npc_2") expects.
//   - createCommitment's new `host` field is real (never guessed from
//     proposerId) and defaults to 'player'.
//   - cancelCommitment ("Clear the Calendar") removes a scheduled record and
//     refuses anything that isn't one.
//   - upcomingCommitments / trackerCommitments (the Agenda's new scheduler
//     hook) surface a booked plan before its window opens.
//   - the existing per-NPC scheduler (resolveScheduleActivity) already
//     relocates EVERY accepted attendee of a shared commitment for its
//     window — proving multi-guest events need no new scheduler, just
//     visibility (which this phase adds).
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'commitments.js', 'overture.js', 'tracker.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260831, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // High affection, no tension: pins the ask ABOVE ASK_TUNING.acceptThreshold
  // even against the full ±acceptNoiseRange draw, so accept/decline is a
  // property of the flavor text (or lack of it), not the RNG.
  __warm = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: 5, tension: 0, trust: 5 }; return npc; };
  // A generated slot can land with bible.name === '' (character generation
  // sometimes gives up on the interest-tag overlap and ships a schema-valid
  // but nameless stub — inviteExtraGuestsFromFlavor's own guard already
  // skips a blank name, matching ASK_INFO's documented precedent). Name
  // parsing needs REAL, distinct names to test against, so this pins fixed
  // ones on the three residents rather than trusting what generation drew.
  __nameResidents = (g, ids) => {
    const names = ['Aiko', 'Bramwell', 'Coraline'];
    ids.forEach((id, i) => { g.npcs[id].bible = { ...g.npcs[id].bible, name: names[i] || ('Npc' + i) }; });
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. $Invite is registered once, and COMMITMENT_KINDS carries the new fields');
const reg = J(`({
  hasType: !!ASK_TYPES.Invite,
  categoryIds: ASK_CATEGORIES.map(c => c.id),
  inviteCategoryChildren: (ASK_CATEGORIES.find(c => c.id === 'invite') || { children: [] }).children.map(l => l.id),
  mealRoomId: COMMITMENT_KINDS.meal.roomId,
  mealInvitable: COMMITMENT_KINDS.meal.playerInvitable,
  hangoutInvitable: COMMITMENT_KINDS.hangout.playerInvitable,
  collabInvitable: !!COMMITMENT_KINDS.content_collab.playerInvitable,
})`);
check('ASK_TYPES.Invite exists', reg.hasType);
// Phase 17 (D26) later extends this SAME category with its own HouseParty
// leaf (verify-aa-p17.js), so this only asserts Invite is still IN there,
// not that it's the category's only member.
check('one "invite" category exists, holding Invite', reg.inviteCategoryChildren.includes('Invite'));
check('"invite" category id appears exactly once in ASK_CATEGORIES', reg.categoryIds.filter(id => id === 'invite').length === 1);
check("COMMITMENT_KINDS.meal.roomId === 'dining' (restated, not re-hardcoded at call sites)", reg.mealRoomId === 'dining');
check('meal and hangout opted into playerInvitable', reg.mealInvitable === true && reg.hangoutInvitable === true);
check('content_collab (vocation-only) did NOT opt in', reg.collabInvitable === false);

// ---------------------------------------------------------------- 1
console.log('\n1. inviteKindFromFlavor / inviteExtraGuestsFromFlavor parse the Verification line');
const g1 = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  __nameResidents(g, ids);
  return {
    ids,
    dinner: inviteKindFromFlavor('dinner with ' + (g.npcs[ids[1]].bible.name)),
    bareKind: inviteKindFromFlavor(''),
    hangoutWord: inviteKindFromFlavor('just wanna hang out'),
    extras: inviteExtraGuestsFromFlavor(g, 'dinner with ' + g.npcs[ids[1]].bible.name, ids[0]),
    selfExcluded: inviteExtraGuestsFromFlavor(g, 'dinner with ' + g.npcs[ids[0]].bible.name, ids[0]),
    noExtras: inviteExtraGuestsFromFlavor(g, 'just the two of us', ids[0]),
  };
})()`);
check('"dinner with <name>" resolves to kind "meal"', g1.dinner === 'meal');
check('a bare/empty flavor defaults to "hangout"', g1.bareKind === 'hangout');
check('"hang out" resolves to kind "hangout"', g1.hangoutWord === 'hangout');
check('the named extra resident is pulled out as inviteExtraIds', JSON.stringify(g1.extras) === JSON.stringify([g1.ids[1]]));
check('naming the PRIMARY partner themselves is excluded, not duplicated', g1.selfExcluded.length === 0);
check('flavor naming nobody yields no extras', g1.noExtras.length === 0);

// ---------------------------------------------------------------- 2
console.log('\n2. decide() never lets flavor move the accept/decline verdict (D1/invariant 2)');
const g2 = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  __nameResidents(g, ids);
  const primary = ids[0], extra = ids[1];
  __warm(g.npcs[primary]);
  const ctx = {};
  const bare = resolveAsk(g, primary, 'Invite', '', ctx);
  const worded = resolveAsk(g, primary, 'Invite', 'dinner with ' + g.npcs[extra].bible.name, ctx);
  return {
    bareAccept: bare.decision.accept,
    wordedAccept: worded.decision.accept,
    bareKind: bare.decision.inviteKind,
    wordedKind: worded.decision.inviteKind,
    wordedExtras: worded.decision.inviteExtraIds,
    extraId: extra,
  };
})()`);
check('a warm NPC accepts a bare $Invite', g2.bareAccept === true);
check('the SAME warm NPC accepts identically once flavor names an event + a guest (verdict unmoved by flavor)', g2.wordedAccept === g2.bareAccept);
check('...even though the parsed kind differs (bare="hangout", worded="meal")', g2.bareKind === 'hangout' && g2.wordedKind === 'meal');
check('...and the extra guest rode along on the decision for the schedule flow to read', JSON.stringify(g2.wordedExtras) === JSON.stringify([g2.extraId]));

// ---------------------------------------------------------------- 3
console.log("\n3. createCommitment: `host` is real (never guessed from proposerId), defaults to 'player'");
const g3 = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const a = createCommitment(g, { kind: 'hangout', startAbs: 2000, endAbs: 2060, roomId: 'living_room', invitedIds: [ids[0]] });
  // The asks-plan schedule-flow shape: proposerId set (to skip re-rolling an
  // NPC who already said yes in stage 1) but host must stay 'player' unless
  // explicitly overridden — proposerId must never be read as "who's hosting".
  const b = createCommitment(g, { kind: 'hangout', startAbs: 4000, endAbs: 4060, roomId: 'living_room', invitedIds: [], proposerId: ids[1] });
  // The TRUE npc-initiated path (doOvertureRespond's shape): host explicitly npcId.
  const c = createCommitment(g, { kind: 'hangout', startAbs: 6000, endAbs: 6060, roomId: 'living_room', invitedIds: [], proposerId: ids[2], host: ids[2] });
  return { aHost: a.record.host, bHost: b.record.host, cHost: c.record.host, npc1: ids[1], npc2: ids[2] };
})()`);
check("no host param -> defaults to 'player'", g3.aHost === 'player');
check("proposerId set but host omitted -> STILL 'player' (proposerId is not host)", g3.bHost === 'player');
check('host explicitly passed -> stored verbatim', g3.cHost === g3.npc2);

// ---------------------------------------------------------------- 4
console.log('\n4. cancelCommitment — "Clear the Calendar"');
const g4 = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const { record } = createCommitment(g, { kind: 'hangout', startAbs: 8000, endAbs: 8060, roomId: 'living_room', invitedIds: [ids[0]] });
  const before = g.world.commitments.length;
  const missing = cancelCommitment(g, 'not-a-real-id');
  const removed = cancelCommitment(g, record.id);
  const after = g.world.commitments.length;
  const second = cancelCommitment(g, record.id);
  return { before, after, missing, removedId: removed && removed.id, wantId: record.id, second };
})()`);
check('cancelling an unknown id returns null and touches nothing', g4.missing === null);
check('cancelling a real scheduled commitment removes exactly one record', g4.before - g4.after === 1);
check('cancelCommitment returns the removed record', g4.removedId === g4.wantId);
check('cancelling the same id twice is a no-op the second time (already gone, not "cancelled")', g4.second === null);

// ---------------------------------------------------------------- 5
console.log('\n5. upcomingCommitments / trackerCommitments — the Agenda scheduler hook');
const g5 = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  g.meta.clock.day = 1;
  const dayAbs = g.meta.clock.day * 1440;
  // Two commitments, deliberately created out of chronological order, to
  // prove upcomingCommitments SORTS rather than just returning insertion order.
  createCommitment(g, { kind: 'hangout', startAbs: dayAbs + 600, endAbs: dayAbs + 660, roomId: 'living_room', invitedIds: [ids[0]] });
  createCommitment(g, { kind: 'meal', startAbs: dayAbs + 60, endAbs: dayAbs + 120, roomId: 'dining', invitedIds: [ids[1]] });
  __warm(g.npcs[ids[0]]); __warm(g.npcs[ids[1]]);
  // Re-create through respondToCommitment's real accept path this time (the
  // two calls above may or may not have been accepted) so trackerCommitments
  // has a real acceptedIds name to show.
  const upcoming = upcomingCommitments(g);
  const entries = trackerCommitments(g);
  return {
    count: upcoming.length,
    sortedAscending: upcoming.every((c, i) => i === 0 || upcoming[i - 1].startAbs <= c.startAbs),
    everyDeepLinksToCalendar: entries.every(e => e.deepLink.appId === 'calendar' && e.deepLink.screenId === 'upcoming'),
    everyKeyPrefixed: entries.every(e => e.key.startsWith('commitment:')),
    sameCountAsUpcoming: entries.length === upcoming.length,
  };
})()`);
check('two booked commitments both surface', g5.count === 2);
check('upcomingCommitments sorts soonest-first', g5.sortedAscending);
check('trackerCommitments deep-links every entry to the new calendar app', g5.everyDeepLinksToCalendar);
check("every entry's key is namespaced 'commitment:<id>' (never collides with rent/bill/etc keys)", g5.everyKeyPrefixed);
check('trackerCommitments and upcomingCommitments agree on count (one definition, two surfaces)', g5.sameCountAsUpcoming);

// ---------------------------------------------------------------- 6
console.log('\n6. the existing per-NPC scheduler already relocates EVERY accepted attendee (no new scheduler needed)');
const g6 = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const dayAbs = g.meta.clock.day * 1440;
  const startAbs = dayAbs + 1150, endAbs = dayAbs + 1200; // inside hangout's 19:00-21:00 slot
  const { record } = createCommitment(g, {
    kind: 'hangout', startAbs, endAbs, roomId: 'living_room',
    invitedIds: [], proposerId: ids[0], host: 'player',
  });
  // Force the second resident to ALSO be accepted (a real multi-guest event
  // — respondToCommitment's own noise draw is not what this section is
  // testing, so wire it directly onto the record the way createCommitment's
  // own accepted-path would have on a lucky roll).
  record.acceptedIds.push(ids[1]);
  // activeCommitmentFor (commitments.js) always reads gameState.meta.clock
  // directly, not the clock param resolveScheduleActivity is handed (that
  // param only feeds the template-schedule fallback branch) - so the probe
  // clock has to be the real one for the commitment lookup to see it.
  g.meta.clock = { ...g.meta.clock, minutes: 1170 };
  const r0 = resolveScheduleActivity(g.npcs[ids[0]], g.meta.clock, g, ids[0]);
  const r1 = resolveScheduleActivity(g.npcs[ids[1]], g.meta.clock, g, ids[1]);
  const r2 = resolveScheduleActivity(g.npcs[ids[2]], g.meta.clock, g, ids[2]); // never invited
  return {
    hostRoom: r0.commitmentRoomId, guestRoom: r1.commitmentRoomId,
    uninvitedBound: r2.commitmentRoomId || null,
  };
})()`);
check('the host (proposerId, pre-accepted) is bound to the commitment room for the window', g6.hostRoom === 'living_room');
check('the SECOND accepted guest is independently bound too — same window, same room, zero new code', g6.guestRoom === 'living_room');
check('a resident never invited is untouched by the commitment', g6.uninvitedBound === null);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
