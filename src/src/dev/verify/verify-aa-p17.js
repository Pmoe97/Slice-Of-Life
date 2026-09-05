// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 17: House Parties + Touring (D26-D27).
//
//   node src/src/dev/verify/verify-aa-p17.js
//
// Node coverage for everything pure/trusted-producer in this phase:
//   - ASK_PARTY (asks.js): registration, decide() (affection-scored,
//     flavor-blind on the verdict — D1), multi-guest parsing via the SAME
//     inviteExtraGuestsFromFlavor ASK_INVITE uses, and the real
//     createCommitment('party', ...) booking path.
//   - ASK_TOUR (asks.js): registration, available()/decide() (byte-identical
//     formula to ASK_FOLLOW), postEffects setting BOTH npc.follow and
//     npc.touring on accept.
//   - advanceTouring (movement.js): fires each TOUR_STOPS beat exactly once,
//     {name}-substitutes, skips a balked/released follower, and — on the
//     final stop — clears follow+touring and pays out TOUR_TUNING's reward.
//   - advanceFollowers (movement.js): a privacy-room refusal now also clears
//     npc.touring, not just npc.follow (Phase 6's own release path).
//   - sim.js Pass 2's real per-tick wiring: an accepted party attendee is
//     placed in the party's room by the EXISTING activeCommitmentFor
//     mechanism (no new scheduler needed, same as Phase 1's meal/hangout
//     proof) and, once there, adds real dirt beyond ordinary foot traffic,
//     emits 'party_noise', and gets a small mood lift; a resident elsewhere
//     who can perceive it gets annoyed and — over enough exposure — a real
//     'party_loud' complaint event fires (never when no party is live).
// Presentation (the Throw a Party / Show Them Around chips, the calendar
// modal, doMove's live narration) is UI and is verified on the live page per
// invariant 7 — see the Handoff note for what was checked there. This
// harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'npc.js',
    'world.js', 'signals.js', 'computer.js', 'dirt.js', 'commitments.js', 'movement.js', 'cognition.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260902, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day != null ? day : h.clock.day, minutes: h.clock.minutes },
                contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.world.signals = g.world.signals || [];
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __warm = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: 5, tension: 0, trust: 5 }; return npc; };
  __cool = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: -2, tension: 0.3, trust: 1 }; npc.mood = 0; return npc; };
  __nameResidents = (g, ids) => {
    const names = ['Aiko', 'Bramwell', 'Coraline'];
    ids.forEach((id, i) => { g.npcs[id].bible = { ...g.npcs[id].bible, name: names[i] || ('Npc' + i) }; });
  };
  // A weekday/weekend-agnostic evening minute — the SAME window
  // COMMITMENT_KINDS.hangout.slots already trusts as free for this cast.
  __eveningStartAbs = (g, dayOffset) => (g.meta.clock.day + (dayOffset || 0)) * 1440 + 1140;
  __setClock = (g, abs) => {
    g.meta.clock.day = Math.floor(abs / 1440);
    g.meta.clock.minutes = abs % 1440;
    g.meta.clock.weekday = getWeekday(g.meta.clock.day);
    g.meta.clock.phase = getPhase(g.meta.clock.minutes);
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — ASK_PARTY/ASK_TOUR, COMMITMENT_KINDS.party, the tuning buckets, the new signal, and the event-classification tables');
const reg = J(`({
  inviteChildren: (ASK_CATEGORIES.find(c => c.id === 'invite') || { children: [] }).children.map(l => l.id),
  followChildren: (ASK_CATEGORIES.find(c => c.id === 'follow') || { children: [] }).children.map(l => l.id),
  hasParty: !!ASK_TYPES.HouseParty,
  hasTour: !!ASK_TYPES.ShowAround,
  partyKind: COMMITMENT_KINDS.party,
  partyNotInvitable: !COMMITMENT_KINDS.party.playerInvitable,
  partyTuning: PARTY_TUNING,
  tourStops: Object.keys(TOUR_STOPS),
  tourStopsHaveName: Object.values(TOUR_STOPS).every(l => l.includes('{name}')),
  tourTuning: TOUR_TUNING,
  signalDef: SIGNAL_DEFS.party_noise,
  signalEmit: SIGNALS_EMIT.partyNoise,
  importance: EVENT_IMPORTANCE.party_loud,
  emotion: EVENT_EMOTION.party_loud,
  fns: {
    advanceTouring: typeof advanceTouring === 'function',
    activePartyCommitmentInRoom: typeof activePartyCommitmentInRoom === 'function',
  },
})`);
check('a "invite" category holds Invite AND the new HouseParty leaf', reg.inviteChildren.includes('Invite') && reg.inviteChildren.includes('HouseParty'), JSON.stringify(reg.inviteChildren));
check('a "follow" category holds FollowMe AND the new ShowAround leaf', reg.followChildren.includes('FollowMe') && reg.followChildren.includes('ShowAround'), JSON.stringify(reg.followChildren));
check('ASK_TYPES carries both HouseParty and ShowAround', reg.hasParty && reg.hasTour);
check("COMMITMENT_KINDS.party is real — 'leisure' block (reused, not invented), living_room, a label", reg.partyKind && reg.partyKind.block === 'leisure' && reg.partyKind.roomId === 'living_room' && !!reg.partyKind.label);
check('COMMITMENT_KINDS.party is deliberately NOT playerInvitable (bespoke leaf owns booking, not generic $Invite)', reg.partyNotInvitable);
// Continuous-cadence-closure Phase 5 (D6/D13): every field below was
// *PerTick before this phase's per-minute conversion — field names updated
// to match, values unchanged in kind (still real numbers).
check('PARTY_TUNING is a real config bucket with every number this phase reads', ['dirtPerMinutePerGuest', 'attendeeMoodPerMinute', 'annoyanceMoodPerIntensityPerMinute', 'annoyanceMoodCapPerMinute', 'complainThreshold', 'complainChancePerMinute', 'complainMoodDelta'].every(k => typeof reg.partyTuning[k] === 'number') && Array.isArray(reg.partyTuning.complaintLines) && reg.partyTuning.complaintLines.length > 0);
check('TOUR_STOPS is a real, non-trivial curated room list, every line carrying {name}', reg.tourStops.length >= 8 && reg.tourStopsHaveName, JSON.stringify(reg.tourStops));
check('TOUR_STOPS excludes both bathrooms (privacy rooms Follow would refuse anyway)', !reg.tourStops.includes('bathroom_a') && !reg.tourStops.includes('bathroom_b'));
check('TOUR_STOPS includes the player\'s own bedroom as a stop', reg.tourStops.includes('bedroom_player'));
check('TOUR_TUNING carries a completion reward and a wrap-up line', reg.tourTuning.completeMoodDelta > 0 && reg.tourTuning.completeRelDelta && typeof reg.tourTuning.completeLine === 'string' && reg.tourTuning.completeLine.includes('{name}'));
check("the 'party_noise' signal is registered on the sound channel, distinct from 'voices'", !!reg.signalDef && reg.signalDef.channel === 'sound');
check('SIGNALS_EMIT.partyNoise is louder than the ordinary chat_with_roommate voices emission (0.5)', reg.signalEmit > 0.5);
check("EVENT_IMPORTANCE/EVENT_EMOTION both classify 'party_loud', same bands as music_too_loud", reg.importance === 'social' && reg.emotion === 'argument');
check('advanceTouring and activePartyCommitmentInRoom are both real functions', reg.fns.advanceTouring && reg.fns.activePartyCommitmentInRoom);

// ---------------------------------------------------------------- 1
console.log('\n1. ASK_PARTY.decide() — affection-scored, flavor-blind on the verdict; extra guests parse from the flavor like $Invite');
const g1 = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  __nameResidents(g, ids);
  const primary = ids[0], extra = ids[1], cool = ids[2];
  __warm(g.npcs[primary]);
  __cool(g.npcs[cool]);
  const bare = resolveAsk(g, primary, 'HouseParty', '', {});
  const worded = resolveAsk(g, primary, 'HouseParty', 'with ' + g.npcs[extra].bible.name, {});
  const coolResult = resolveAsk(g, cool, 'HouseParty', '', {});
  return {
    bareAccept: bare.decision.accept, bareExtras: bare.decision.inviteExtraIds,
    wordedAccept: worded.decision.accept, wordedExtras: worded.decision.inviteExtraIds,
    coolAccept: coolResult.decision.accept, coolReason: coolResult.decision.reason,
  };
})()`);
check('a warm primary accepts', g1.bareAccept === true);
check('flavor never moves the accept/decline verdict (D1) — only which extras get parsed', g1.wordedAccept === g1.bareAccept);
check('a bare $HouseParty names no extra guests', Array.isArray(g1.bareExtras) && g1.bareExtras.length === 0);
check('"...with <name>" resolves that resident as an extra invitee, via the SAME parser $Invite uses', g1.wordedExtras.length === 1, JSON.stringify(g1.wordedExtras));
check('a cool (tense) primary declines', g1.coolAccept === false && g1.coolReason === 'cool');

// ---------------------------------------------------------------- 2
console.log('\n2. The real booking path — createCommitment("party", ...): host, room, and independent multi-guest accept/decline');
const g2 = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  __warm(g.npcs[ids[0]]);
  __cool(g.npcs[ids[1]]);
  const startAbs = __eveningStartAbs(g, 0);
  const { record, responses } = createCommitment(g, {
    kind: 'party', startAbs, endAbs: startAbs + 120, roomId: 'living_room',
    invitedIds: [ids[1]], proposerId: ids[0], host: 'player',
  });
  return {
    kind: record.kind, roomId: record.roomId, host: record.host, status: record.status,
    hostAccepted: record.acceptedIds.includes(ids[0]),
    guestResponse: responses[ids[1]].accept,
    guestListed: record.acceptedIds.includes(ids[1]) || record.declinedIds.includes(ids[1]),
  };
})()`);
check("record.kind === 'party', roomId is the booked living room, host is the player, freshly scheduled", g2.kind === 'party' && g2.roomId === 'living_room' && g2.host === 'player' && g2.status === 'scheduled');
check('the proposer (who threw the party) is auto-accepted, never re-rolled', g2.hostAccepted === true);
check('the cool extra guest rolls their OWN real accept/decline and lands in exactly one list', g2.guestResponse === false && g2.guestListed === true);

// ---------------------------------------------------------------- 3
console.log('\n3. ASK_TOUR — available()/decide(), byte-identical formula to ASK_FOLLOW');
const g3 = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const warmId = ids[0], alreadyFollowingId = ids[1], alreadyTouringId = ids[2];
  __warm(g.npcs[warmId]);
  g.npcs[alreadyFollowingId].follow = { leader: 'player', sinceDay: g.meta.clock.day };
  g.npcs[alreadyTouringId].touring = { visited: [] };
  const warm = resolveAsk(g, warmId, 'ShowAround', '', {});
  return {
    warmAvailable: ASK_TYPES.ShowAround.available(g, g.npcs[warmId]),
    followingAvailable: ASK_TYPES.ShowAround.available(g, g.npcs[alreadyFollowingId]),
    touringAvailable: ASK_TYPES.ShowAround.available(g, g.npcs[alreadyTouringId]),
    warmAccept: warm.decision.accept,
  };
})()`);
check('a warm, idle NPC can be asked for a tour', g3.warmAvailable === true && g3.warmAccept === true);
check('already following the player blocks a second $ShowAround', g3.followingAvailable === false);
check('already mid-tour blocks a second $ShowAround (no reset of visited)', g3.touringAvailable === false);

// ---------------------------------------------------------------- 4
console.log('\n4. ASK_TOUR.postEffects — accept sets BOTH npc.follow and npc.touring; decline sets neither');
const g4 = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const warmId = ids[0], coolId = ids[1];
  __warm(g.npcs[warmId]);
  __cool(g.npcs[coolId]);
  g.meta.clock.day = 9;
  const accepted = resolveAsk(g, warmId, 'ShowAround', '', {});
  accepted.applyEffects();
  const declined = resolveAsk(g, coolId, 'ShowAround', '', {});
  declined.applyEffects();
  return {
    acceptFollow: g.npcs[warmId].follow || null,
    acceptTouring: g.npcs[warmId].touring || null,
    declineFollow: g.npcs[coolId].follow || null,
    declineTouring: g.npcs[coolId].touring || null,
  };
})()`);
check('accept sets npc.follow = { leader: "player", sinceDay }, riding Follow\'s own record shape', g4.acceptFollow && g4.acceptFollow.leader === 'player' && g4.acceptFollow.sinceDay === 9, JSON.stringify(g4.acceptFollow));
check('accept ALSO sets npc.touring = { visited: [] }', g4.acceptTouring && Array.isArray(g4.acceptTouring.visited) && g4.acceptTouring.visited.length === 0, JSON.stringify(g4.acceptTouring));
check('decline writes neither follow nor touring', g4.declineFollow === null && g4.declineTouring === null);

// ---------------------------------------------------------------- 5
console.log('\n5. advanceTouring — one beat per NEW stop, {name}-substituted, never refires, skips a balked follower');
const g5 = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  const touringId = ids[0], plainFollowerId = ids[1];
  __nameResidents(g, ids);
  const name = g.npcs[touringId].bible.name;
  g.npcs[touringId].location = 'living_room';
  g.npcs[touringId].follow = { leader: 'player', sinceDay: 1 };
  g.npcs[touringId].touring = { visited: [] };
  // A plain follower (no touring) sitting in the SAME room must generate no beat at all.
  g.npcs[plainFollowerId].location = 'living_room';
  g.npcs[plainFollowerId].follow = { leader: 'player', sinceDay: 1 };
  const first = advanceTouring(g, 'player', 'living_room');
  const again = advanceTouring(g, 'player', 'living_room'); // same room, second call: no re-fire
  // Now simulate a balked/released follower: advanceFollowers already deleted
  // follow+touring and left them NOT in the destination room.
  delete g.npcs[touringId].follow;
  g.npcs[touringId].location = 'hallway_a'; // one room short, exactly as advanceFollowers leaves them
  const afterBalk = advanceTouring(g, 'player', 'kitchen');
  return {
    firstCount: first.length, firstLine: first[0] && first[0].line, firstHasName: first[0] && first[0].line.includes(name),
    againCount: again.length,
    plainFollowerBeat: first.some(b => b.npcId === plainFollowerId),
    afterBalkCount: afterBalk.length,
    visited: g.npcs[touringId].touring.visited,
  };
})()`);
check('the first arrival in a curated room fires exactly one beat', g5.firstCount === 1, JSON.stringify(g5));
check("the beat's {name} is substituted with the touring NPC's real name", g5.firstHasName === true, g5.firstLine);
check('re-arriving in the SAME already-visited room fires nothing a second time', g5.againCount === 0);
check('a plain follower (no npc.touring) in the same room gets no beat at all', g5.plainFollowerBeat === false);
check("visited grew by exactly one stop ('living_room')", JSON.stringify(g5.visited) === JSON.stringify(['living_room']));
check('a touring npc who balked and is not actually IN the destination room gets no beat (advanceFollowers already handled them)', g5.afterBalkCount === 0);

// ---------------------------------------------------------------- 6
console.log('\n6. advanceTouring — completing every curated stop ends the tour and pays out the reward, clamped');
const g6 = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const touringId = ids[0];
  __nameResidents(g, ids);
  g.npcs[touringId].follow = { leader: 'player', sinceDay: 1 };
  const stops = Object.keys(TOUR_STOPS);
  // Pre-visit every stop but the last one, so this call's single beat is the FINAL one.
  g.npcs[touringId].touring = { visited: stops.slice(0, -1) };
  g.npcs[touringId].location = stops[stops.length - 1];
  g.npcs[touringId].mood = 0.9; // near the +1 ceiling, to prove the reward clamps rather than overshoots
  g.npcs[touringId].relPlayer = { affection: 0.99, trust: 0.99, tension: 0 };
  const beats = advanceTouring(g, 'player', stops[stops.length - 1]);
  return {
    beatCount: beats.length,
    roomBeatFinal: beats[0] && beats[0].final,
    wrapBeatFinal: beats[1] && beats[1].final === true,
    wrapHasName: beats[1] && beats[1].line.includes(g.npcs[touringId].bible.name),
    followGone: !g.npcs[touringId].follow,
    touringGone: !g.npcs[touringId].touring,
    mood: g.npcs[touringId].mood,
    affection: g.npcs[touringId].relPlayer.affection,
  };
})()`);
check('the last stop fires TWO beats — the room\'s own line, then the wrap-up, only the second flagged final', g6.beatCount === 2 && !g6.roomBeatFinal && g6.wrapBeatFinal === true, JSON.stringify(g6));
check("the wrap-up line is {name}-substituted too", g6.wrapHasName === true);
check('completing the tour clears BOTH follow and touring', g6.followGone === true && g6.touringGone === true);
check('mood/affection got the completion bump but stayed clamped to 1', g6.mood <= 1 && g6.mood > 0.9 && g6.affection <= 1, JSON.stringify(g6));

// ---------------------------------------------------------------- 7
console.log('\n7. advanceFollowers — a privacy-room refusal clears npc.touring along with npc.follow');
const g7 = J(`(() => {
  const g = __mk(7);
  const id = __ids(g)[0];
  g.npcs[id].location = 'living_room';
  g.npcs[id].follow = { leader: 'player', sinceDay: 1 };
  g.npcs[id].touring = { visited: ['living_room'] };
  const released = advanceFollowers(g, 'player', 'living_room', ['hallway_a', 'bathroom_a']);
  return { released, followGone: !g.npcs[id].follow, touringGone: !g.npcs[id].touring };
})()`);
check('the bathroom refusal releases the follower AND clears the orphaned touring record', g7.released.length === 1 && g7.followGone && g7.touringGone, JSON.stringify(g7));

// ---------------------------------------------------------------- 8
console.log('8. Real per-tick wiring — an accepted party attendee is placed by the EXISTING commitment scheduler and adds real dirt/noise/mood');
const g8 = J(`(() => {
  const g = __mk(8);
  const ids = __ids(g);
  const attendeeId = ids[0];
  __warm(g.npcs[attendeeId]);
  const startAbs = __eveningStartAbs(g, 0);
  createCommitment(g, { kind: 'party', startAbs, endAbs: startAbs + 120, roomId: 'living_room', invitedIds: [], proposerId: attendeeId, host: 'player' });
  __setClock(g, startAbs);
  const startDirt = g.world.rooms.living_room.dirt || 0;
  const moodBefore = g.npcs[attendeeId].mood;
  const result = resolveTick(g);
  const placedLocation = result.npcUpdates[attendeeId] && result.npcUpdates[attendeeId].location;
  const endDirt = g.world.rooms.living_room.dirt || 0;
  const partySignal = (g.world.signals || []).find(s => s.id === 'party_noise' && s.sourceId === attendeeId);
  const moodAfter = result.npcUpdates[attendeeId] ? result.npcUpdates[attendeeId].mood : null;
  // Continuous-cadence-closure Phase 5: *PerTick renamed to *PerMinute; ×30
  // reproduces the one-tick (30-minute) amount this check compares against.
  return { placedLocation, startDirt, endDirt, footTraffic: DIRT_TUNING.footTrafficPerMinute * 30, partyBump: PARTY_TUNING.dirtPerMinutePerGuest * 30, partySignal: !!partySignal, signalIntensity: partySignal && partySignal.intensity, moodBefore, moodAfter };
})()`);
// boundActivity ('partying') is what the commitment resolves TO, but an
// overture the same tick can overwrite the display activity afterward
// (pre-existing behavior, unrelated to this phase — meal/hangout attendees
// have the same softness) — location is the real, load-bearing proof here.
check("the EXISTING activeCommitmentFor scheduler places the accepted attendee in the party's room — no new placement code needed (D2's own proof, restated for 'party')", g8.placedLocation === 'living_room', JSON.stringify(g8));
check('room dirt rose by MORE than ordinary foot traffic alone would (real party-specific bump, on top of the baseline)', g8.endDirt - g8.startDirt > g8.footTraffic, JSON.stringify(g8));
check('the tick emitted a real party_noise transient sourced from this attendee, at the configured intensity', g8.partySignal === true && g8.signalIntensity === J('SIGNALS_EMIT.partyNoise'), JSON.stringify(g8));
check("the attendee's own mood ticked up (the fun of it)", g8.moodAfter !== null && g8.moodAfter > g8.moodBefore, JSON.stringify(g8));

// ---------------------------------------------------------------- 9
console.log('9. Real per-tick wiring — a resident elsewhere gets annoyed by a live party, and over real exposure a genuine party_loud complaint fires (never with no party)');
const g9 = J(`(() => {
  function run(withParty, seed) {
    const g = __mk(seed, 1);
    const ids = __ids(g);
    const attendeeId = ids[0], listenerId = ids[1];
    __nameResidents(g, ids);
    const startAbs = __eveningStartAbs(g, 0);
    const endAbs = startAbs + 2880; // spans the whole multi-tick loop below — duration is a test artifice, the MECHANISM is what's under test
    if (withParty) {
      createCommitment(g, { kind: 'party', startAbs, endAbs, roomId: 'living_room', invitedIds: [], proposerId: attendeeId, host: 'player' });
    }
    // Pin the listener one open hop away (dining), deterministically, via a
    // real commitment of their own — NOT the party's room, so any reaction
    // is genuinely the LISTENER side, never mistaken for attendee mood.
    createCommitment(g, { kind: 'hangout', startAbs, endAbs, roomId: 'dining', invitedIds: [], proposerId: listenerId, host: 'player' });
    let complaints = 0, sawTemplate = false, moodDeltaSum = 0;
    for (let abs = startAbs; abs < startAbs + 1440; abs += 30) {
      __setClock(g, abs);
      const before = g.npcs[listenerId].mood;
      const result = resolveTick(g);
      for (const evt of result.newEvents) {
        if (evt.type === 'party_loud' && evt.npcId === listenerId) {
          complaints++;
          if (evt.template && evt.template.includes('{name}')) sawTemplate = true;
        }
      }
      if (result.npcUpdates[listenerId]) moodDeltaSum += (result.npcUpdates[listenerId].mood - before);
    }
    return { complaints, sawTemplate, moodDeltaSum };
  }
  const withParty = run(true, 20260902);
  const noParty = run(false, 20260903);
  return { withParty, noParty };
})()`);
check('a resident one room away from a real live party eventually gets a real party_loud complaint (real signal propagation + the chance roll, not a stub)', g9.withParty.complaints > 0, JSON.stringify(g9.withParty));
check("the complaint's own template still carries {name} unsubstituted at the event layer (substitution is UI's job, same as music_too_loud)", g9.withParty.sawTemplate === true);
check('with no party booked at all, the same listener over the same window NEVER complains (real gate, not a background chance)', g9.noParty.complaints === 0, JSON.stringify(g9.noParty));
check("the listener's mood trended down across the exposed window (annoyance, not enjoyment)", g9.withParty.moodDeltaSum < 0, JSON.stringify(g9.withParty));

// ---------------------------------------------------------------- 10
console.log('10. activePartyCommitmentInRoom — the exact live-window/room read the sim pass relies on');
const g10 = J(`(() => {
  const g = __mk(10);
  const ids = __ids(g);
  const startAbs = __eveningStartAbs(g, 0);
  createCommitment(g, { kind: 'party', startAbs, endAbs: startAbs + 120, roomId: 'living_room', invitedIds: [], proposerId: ids[0], host: 'player' });
  __setClock(g, startAbs + 30);
  const duringInRoom = activePartyCommitmentInRoom(g, 'living_room');
  const duringWrongRoom = activePartyCommitmentInRoom(g, 'dining');
  __setClock(g, startAbs - 60);
  const beforeWindow = activePartyCommitmentInRoom(g, 'living_room');
  __setClock(g, startAbs + 300);
  const afterWindow = activePartyCommitmentInRoom(g, 'living_room');
  return { duringInRoom: !!duringInRoom, duringWrongRoom: duringWrongRoom, beforeWindow: beforeWindow, afterWindow: afterWindow };
})()`);
check('returns the live commitment for its own room during its window', g10.duringInRoom === true);
check('returns null for a different room, even during the same live window', g10.duringWrongRoom === null);
check('returns null before the window opens', g10.beforeWindow === null);
check('returns null after the window closes', g10.afterWindow === null);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
