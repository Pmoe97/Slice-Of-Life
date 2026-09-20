// Knock-and-consent (bug report 2026-09-13):
//
//   node src/src/dev/verify/verify-knock-consent.js
//
// Before this fix, doKnock (ui.js) was pure flavor text — a random line,
// sometimes literally "Come in!" — that wrote no state at all, and
// resolveRoomEntryStealth (stealth.js) treated every entry into an owned,
// occupied bedroom as an unconditional boundary violation regardless of
// what the door conversation a moment ago implied. This harness covers the
// new stealth.js pieces: resolveKnock's deterministic decision (hard floors
// before scoring, three reachable outcome bands), the one-shot
// player.flags._invitedInto grant, and resolveRoomEntryStealth actually
// honoring it (skipping the WITNESS/suspicion/tension/grievance branch
// while still allowing the "looks up" narration doMove shows either way).
//
// The LLM-voicing half (buildKnockPrompt/buildKnockFallback, llm.js/ui.js)
// and the outcome-window presentation are UI/LLM layer — verified live per
// invariant 7, not here; this harness only proves what a Node vm can.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'npc.js', 'world.js', 'willingness.js', 'stealth.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260913, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.player.flags = g.player.flags || {};
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // Home in their own room, awake, present — the baseline every test starts
  // from before dialing relationship/activity to the case under test.
  __home = (g, npcId) => { g.npcs[npcId].location = g.npcs[npcId].residency.room; g.npcs[npcId].activity = 'idle'; return g.npcs[npcId]; };
  // affection/comfort default to a small non-zero value: willingness.js's
  // npcIsStrangerTo floors a relationship as a total stranger when EVERY
  // axis (trust/affection/tension/respect/desire/comfort) is exactly 0 and
  // conversationPhase is 'early' — a freshly-generated NPC starts exactly
  // there, so a "neutral acquaintance" test case has to nudge affection/
  // comfort off zero on purpose, or it silently tests the stranger floor
  // instead of the score band it means to.
  __rel = (npc, { trust, tension, mood, phase, affection, comfort }) => {
    npc.relPlayer = {
      ...(npc.relPlayer || {}), trust: trust ?? 0, tension: tension ?? 0, conversationPhase: phase || 'early',
      affection: affection ?? 0.05, comfort: comfort ?? 0.05,
    };
    npc.mood = mood ?? 0;
    return npc;
  };
  __cold = (npc) => __rel(npc, { trust: -0.5, tension: 0.8, mood: -0.5, phase: 'early' });
  __neutral = (npc) => __rel(npc, { trust: 0, tension: 0, mood: 0, phase: 'early' });
  __warmFamiliar = (npc) => __rel(npc, { trust: 0.8, tension: 0, mood: 0.5, phase: 'close' });
  __grievanceCount = (npc) => getUnresolvedGrievances(npc).length;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning and functions are real, thresholds ordered correctly');
const reg = J(`({
  hasResolveKnock: typeof resolveKnock === 'function',
  hasScore: typeof knockReceptivityScore === 'function',
  floorActivities: KNOCK_HARD_FLOOR_ACTIVITIES,
  hallwayThreshold: KNOCK_TUNING.hallwayThreshold,
  inviteThreshold: KNOCK_TUNING.inviteThreshold,
})`);
check('resolveKnock and knockReceptivityScore both exist', reg.hasResolveKnock && reg.hasScore);
check('KNOCK_HARD_FLOOR_ACTIVITIES covers the door-specific unavailable states',
  ['showering', 'masturbating', 'masturbating in bed'].every(a => reg.floorActivities.includes(a)));
check('hallwayThreshold < inviteThreshold (a real band exists between them)', reg.hallwayThreshold < reg.inviteThreshold);

// ---------------------------------------------------------------- 1
console.log('\n1. Hard floor (asleep) blocks scoring outright, even when the relationship alone would clear inviteThreshold');
const asleepFloor = J(`(() => {
  const g = __mk(1);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __warmFamiliar(owner); // would score well above inviteThreshold if reached
  owner.activity = 'sleeping';
  const decision = resolveKnock(g, owner.residency.room);
  return { outcome: decision.outcome, reason: decision.reason, score: decision.score, flagSet: !!g.player.flags._invitedInto };
})()`);
check('a warm, familiar but ASLEEP owner still gets no_answer/floor_asleep, never scored',
  asleepFloor.outcome === 'no_answer' && asleepFloor.reason === 'floor_asleep' && asleepFloor.score === null);
check('no invite flag is set on a floored knock', asleepFloor.flagSet === false);

// ---------------------------------------------------------------- 2
console.log('\n2. Hard floor — masturbating (both activity strings)');
const mastFloor = J(`(() => {
  const g = __mk(2);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __warmFamiliar(owner);
  const out = [];
  for (const act of ['masturbating', 'masturbating in bed']) {
    owner.activity = act;
    const d = resolveKnock(g, owner.residency.room);
    out.push({ act, outcome: d.outcome, reason: d.reason });
  }
  return out;
})()`);
check('both masturbating activity strings floor to no_answer/floor_masturbating',
  mastFloor.every(r => r.outcome === 'no_answer' && r.reason === 'floor_masturbating'), JSON.stringify(mastFloor));

// ---------------------------------------------------------------- 3
console.log('\n3. Hard floor via willingnessFloorReasons — hostile tension');
const hostileFloor = J(`(() => {
  const g = __mk(3);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __rel(owner, { trust: 0.9, tension: REL_CONSEQUENCES.tensionHigh + 0.1, mood: 0.9, phase: 'intimate' }); // everything else maxed out warm
  const decision = resolveKnock(g, owner.residency.room);
  return { outcome: decision.outcome, reason: decision.reason };
})()`);
check('hostile tension floors the knock regardless of every other warm signal',
  hostileFloor.outcome === 'no_answer' && hostileFloor.reason === 'floor_hostile', JSON.stringify(hostileFloor));

// ---------------------------------------------------------------- 4
console.log('\n4. Owner absent from the room being knocked on');
const absentFloor = J(`(() => {
  const g = __mk(4);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __warmFamiliar(owner);
  owner.location = 'living_room'; // not in their own bedroom right now
  const decision = resolveKnock(g, owner.residency.room);
  return { outcome: decision.outcome, reason: decision.reason };
})()`);
check('owner not actually in the room -> no_answer/floor_absent', absentFloor.outcome === 'no_answer' && absentFloor.reason === 'floor_absent');

// ---------------------------------------------------------------- 5
console.log('\n5. All three outcome bands are reachable');
const bands = J(`(() => {
  const g = __mk(5);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);

  __cold(owner);
  const coldOutcomes = new Set();
  for (let day = 1; day <= 8; day++) { g.meta.clock.day = day; coldOutcomes.add(resolveKnock(g, owner.residency.room).outcome); }

  __warmFamiliar(owner);
  const warmOutcomes = new Set();
  for (let day = 1; day <= 8; day++) { g.meta.clock.day = day; warmOutcomes.add(resolveKnock(g, owner.residency.room).outcome); }

  __neutral(owner);
  const neutralOutcomes = new Set();
  for (let day = 1; day <= 30; day++) { g.meta.clock.day = day; neutralOutcomes.add(resolveKnock(g, owner.residency.room).outcome); }

  return { cold: [...coldOutcomes], warm: [...warmOutcomes], neutral: [...neutralOutcomes] };
})()`);
check('a cold relationship always lands no_answer (unwilling), never hallway/invite',
  bands.cold.length === 1 && bands.cold[0] === 'no_answer', JSON.stringify(bands.cold));
check('a warm, familiar relationship always lands invite',
  bands.warm.length === 1 && bands.warm[0] === 'invite', JSON.stringify(bands.warm));
check('a neutral relationship reaches hallway across a day sweep',
  bands.neutral.includes('hallway'), JSON.stringify(bands.neutral));

// ---------------------------------------------------------------- 6
console.log('\n6. player.flags._invitedInto is set iff outcome === invite');
const flagShape = J(`(() => {
  const g = __mk(6);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __warmFamiliar(owner);
  const roomId = owner.residency.room;
  const decision = resolveKnock(g, roomId);
  return { outcome: decision.outcome, flag: g.player.flags._invitedInto, ownerId, roomId };
})()`);
check('invite outcome sets the flag with the exact {roomId, npcId} shape',
  flagShape.outcome === 'invite' && flagShape.flag && flagShape.flag.roomId === flagShape.roomId && flagShape.flag.npcId === flagShape.ownerId,
  JSON.stringify(flagShape));
const noFlagOnColdOrHallway = J(`(() => {
  const g = __mk(7);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  __cold(owner);
  resolveKnock(g, owner.residency.room);
  const afterCold = !!g.player.flags._invitedInto;

  __neutral(owner);
  let sawHallway = false, flagSetOnHallway = false;
  for (let day = 1; day <= 30 && !sawHallway; day++) {
    g.meta.clock.day = day;
    g.player.flags._invitedInto = undefined;
    const d = resolveKnock(g, owner.residency.room);
    if (d.outcome === 'hallway') { sawHallway = true; flagSetOnHallway = !!g.player.flags._invitedInto; }
  }
  return { afterCold, sawHallway, flagSetOnHallway };
})()`);
check('no_answer never sets the flag', noFlagOnColdOrHallway.afterCold === false);
check('hallway never sets the flag either', noFlagOnColdOrHallway.sawHallway && noFlagOnColdOrHallway.flagSetOnHallway === false, JSON.stringify(noFlagOnColdOrHallway));

// ---------------------------------------------------------------- 7
console.log('\n7. resolveRoomEntryStealth honors a matching invite — no violation, no grievance, contrasted against the uninvited case');
const honored = J(`(() => {
  const g = __mk(8);
  const ownerId = __ids(g)[0];
  const owner = __home(g, ownerId);
  const roomId = owner.residency.room;
  const before = __grievanceCount(g.npcs[ownerId]);

  g.player.flags._invitedInto = { roomId, npcId: ownerId };
  const invitedResult = resolveRoomEntryStealth(g, roomId);
  const afterInvited = __grievanceCount(g.npcs[ownerId]);

  // Same setup, no flag this time — the uninvited contrast.
  const g2 = __mk(8);
  const ownerId2 = __ids(g2)[0];
  const owner2 = __home(g2, ownerId2);
  const roomId2 = owner2.residency.room;
  const before2 = __grievanceCount(g2.npcs[ownerId2]);
  const uninvitedResult = resolveRoomEntryStealth(g2, roomId2);
  const afterUninvited = __grievanceCount(g2.npcs[ownerId2]);

  return {
    invited: invitedResult.invited, witnessed: invitedResult.witnessed, applied: invitedResult.applied,
    grievanceGrewWhenInvited: afterInvited > before,
    uninvitedWitnessed: uninvitedResult.witnessed,
    grievanceGrewWhenUninvited: afterUninvited > before2,
  };
})()`);
check('an invited entry: invited=true, witnessed=false, no effects applied', honored.invited === true && honored.witnessed === false && Array.isArray(honored.applied) && honored.applied.length === 0, JSON.stringify(honored));
check('an invited entry files NO grievance', honored.grievanceGrewWhenInvited === false);
check('the SAME setup without the flag is witnessed and DOES file a grievance (the contrast that proves the flag is doing something)',
  honored.uninvitedWitnessed === true && honored.grievanceGrewWhenUninvited === true, JSON.stringify(honored));

// ---------------------------------------------------------------- 8
console.log('\n8. The invite grant is one-shot: consumed on the next call regardless of match, and does not carry over to a different room');
const oneShot = J(`(() => {
  const g = __mk(9);
  const ids = __ids(g);
  const ownerA = __home(g, ids[0]);
  const ownerB = __home(g, ids[1]);
  const roomA = ownerA.residency.room;
  const roomB = ownerB.residency.room;

  g.player.flags._invitedInto = { roomId: roomA, npcId: ids[0] };
  // Detour through room B first — the flag doesn't match, so it should be
  // discarded silently (stale), not saved for later use on room A.
  const bResult = resolveRoomEntryStealth(g, roomB);
  const flagAfterB = g.player.flags._invitedInto;
  // Now actually enter room A — the grant is gone, so this is an ordinary
  // (uninvited) entry, not a consented one.
  const aResult = resolveRoomEntryStealth(g, roomA);

  return {
    bWitnessed: bResult.witnessed, bInvited: bResult.invited,
    flagClearedAfterB: flagAfterB === undefined,
    aWitnessedAfterDetour: aResult.witnessed, aInvitedAfterDetour: aResult.invited,
  };
})()`);
check('a detour through a different room is an ordinary witnessed entry, not consented', oneShot.bWitnessed === true && oneShot.bInvited === false);
check('the stale flag is cleared even though it did not match', oneShot.flagClearedAfterB === true);
check('the original room no longer benefits from the grant once it has been burned on a detour',
  oneShot.aWitnessedAfterDetour === true && oneShot.aInvitedAfterDetour === false, JSON.stringify(oneShot));

// ---------------------------------------------------------------- 9
console.log("\n9. Real end-to-end wiring — doMove's exact two-line sequence (player.location = roomId; resolveRoomEntryStealth(gameState, roomId))");
const wired = J(`(() => {
  const g = __mk(10);
  const ids = __ids(g);
  const ownerA = __home(g, ids[0]);
  const ownerB = __home(g, ids[1]);
  __warmFamiliar(ownerA); // deterministic invite
  const roomA = ownerA.residency.room;
  const roomB = ownerB.residency.room;

  const decision = resolveKnock(g, roomA);
  g.player.location = roomA;               // doMove's assignment, ui.js
  const enterA = resolveRoomEntryStealth(g, roomA); // doMove's call, ui.js

  // A second, separate knock-and-invite cycle, then wander into a DIFFERENT
  // bedroom instead of the one that was invited — the grant must not leak.
  const decision2 = resolveKnock(g, roomA);
  g.player.location = roomB;
  const enterB = resolveRoomEntryStealth(g, roomB);

  return {
    decisionOutcome: decision.outcome,
    enterAWitnessed: enterA.witnessed, enterAInvited: enterA.invited,
    decision2Outcome: decision2.outcome,
    enterBWitnessed: enterB.witnessed, enterBInvited: enterB.invited,
  };
})()`);
check('resolveKnock deterministically invites for this relationship', wired.decisionOutcome === 'invite');
check('an invited knock followed by walking into that exact room produces no violation',
  wired.enterAWitnessed === false && wired.enterAInvited === true, JSON.stringify(wired));
check('the same knock followed by walking into a DIFFERENT bedroom does not carry the grant over — normal violation fires',
  wired.enterBWitnessed === true && wired.enterBInvited === false, JSON.stringify(wired));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
