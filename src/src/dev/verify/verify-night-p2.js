// night-scene-sleeping-npc-plan.md — Phase 2: session state + lifecycle.
//
//   node src/src/dev/verify/verify-night-p2.js
//
// What's asserted, in the order it would hurt if it broke:
//   - resolveNightSceneGate refuses a non-resident, an awake target, a
//     target in a different room, a cold-shouldering target, and a target
//     with an already-active session — and ALWAYS still consults the
//     willingness gate (invariant 1's asleep-floor audit trail), returning
//     it as targetGate even on the happy path.
//   - openNightScene only ever succeeds through that same gate, writes the
//     record shape the plan's data model promises, and refuses a second
//     session on top of an active one (no silent double-open).
//   - abandonNightScene / resolveNightSceneEnd each only ever act on a
//     genuinely open (resolved===null) record, and refuse (return null)
//     otherwise — no re-resolving an already-closed session.
//   - hasActiveNightScene agrees with resolved===null exactly.
//   - sweepStaleNightScenes closes ONLY the open records across a whole npc
//     map, leaving already-resolved records and npcs with no session alone.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'skills.js', 'npc.js', 'willingness.js', 'boundary.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260902, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.player.skills = { stealth: 0 };
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  __sleepInRoom = (g, targetId, roomId) => {
    g.npcs[targetId] = { ...g.npcs[targetId], location: roomId, activity: 'sleeping' };
    g.player.location = roomId;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. resolveNightSceneGate — every refusal reason, and the happy-path audit trail');
const r0 = J(`(() => {
  const g = __mk(1);
  const targetId = __target(g);
  __sleepInRoom(g, targetId, 'bedroom_1');

  const notHere = resolveNightSceneGate({ ...g, player: { ...g.player, location: 'living_room' } }, targetId, {});
  const notAsleep = resolveNightSceneGate(g, targetId, { location: 'bedroom_1' });
  // (the above call happens BEFORE we flip activity, so build a fresh awake copy)
  const gAwake = JSON.parse(JSON.stringify(g));
  gAwake.npcs[targetId].activity = 'idle';
  const notAsleepReal = resolveNightSceneGate(gAwake, targetId, { location: 'bedroom_1' });

  const gCold = JSON.parse(JSON.stringify(g));
  gCold.npcs[targetId].flags = { ...(gCold.npcs[targetId].flags || {}), _coldShoulder: { severity: 3, day: 1, reason: 'test' } };
  const coldShouldered = resolveNightSceneGate(gCold, targetId, { location: 'bedroom_1' });

  const happy = resolveNightSceneGate(g, targetId, { location: 'bedroom_1' });

  const gActive = JSON.parse(JSON.stringify(g));
  gActive.npcs[targetId].flags = { ...(gActive.npcs[targetId].flags || {}), _nightScene: { resolved: null } };
  const alreadyActive = resolveNightSceneGate(gActive, targetId, { location: 'bedroom_1' });

  const missing = resolveNightSceneGate(g, 'not_a_real_npc', { location: 'bedroom_1' });

  return {
    notHereReason: notHere.reason,
    notAsleepReason: notAsleepReal.reason,
    coldShoulderReason: coldShouldered.reason,
    alreadyActiveReason: alreadyActive.reason,
    missingReason: missing.reason,
    happyAllowed: happy.allowed,
    happyGateReason: happy.targetGate && happy.targetGate.reason,
    happyGateWillingness: happy.targetGate && happy.targetGate.willingness,
  };
})()`);
check("player in a different room -> reason 'not_here'", r0.notHereReason === 'not_here');
check("target awake -> reason 'not_asleep'", r0.notAsleepReason === 'not_asleep');
check("active cold-shoulder -> reason 'cold_shoulder'", r0.coldShoulderReason === 'cold_shoulder');
check("an already-open session -> reason 'already_active'", r0.alreadyActiveReason === 'already_active');
check("a missing npc id -> reason 'no_target'", r0.missingReason === 'no_target');
check('the happy path (resident, asleep, same room, no cold shoulder, no active session) is allowed', r0.happyAllowed);
check("...and STILL carries the willingness floor read (invariant 1's audit trail: reason 'floor')", r0.happyGateReason === 'floor');
check("...with willingness -1, exactly as a genuinely-asleep target must read", r0.happyGateWillingness === -1);

// ---------------------------------------------------------------- 1
console.log('\n1. openNightScene — record shape, refusal on a bad gate, refusal on a double-open');
const r1 = J(`(() => {
  const g = __mk(2);
  const targetId = __target(g);
  __sleepInRoom(g, targetId, 'bedroom_1');

  const refused = openNightScene({ ...g, player: { ...g.player, location: 'kitchen' } }, targetId, { location: 'kitchen' });

  const record = openNightScene(g, targetId, { location: 'bedroom_1' });
  const liveRecord = g.npcs[targetId].flags._nightScene;
  const second = openNightScene(g, targetId, { location: 'bedroom_1' }); // already active now

  return {
    refusedOutsideGate: refused === null,
    recordShapeOk: record && record.targetId === targetId
      && record.detection === 0 && record.floor === 0 && record.heat === 0
      && Array.isArray(record.evidence) && record.evidence.length === 0
      && Array.isArray(record.touches) && record.touches.length === 0
      // Phase 3a: sheetStage became D34's pose + covers, climaxCount carries
      // D38's monotone checkpoint, xp accumulates D23's per-action award, and
      // bailPending went with D22's collapse to a single exit.
      && typeof record.pose === 'string' && !!BOUNDARY.nightScene.poses[record.pose]
      && record.covers === 'covered' && record.climaxCount === 0 && record.xp === 0
      && record.sheetStage === undefined && record.bailPending === undefined
      && record.resolved === null
      && typeof record.openedDay === 'number' && typeof record.openedMinute === 'number',
    writesOntoLiveNpc: liveRecord && liveRecord.resolved === null,
    refusesDoubleOpen: second === null,
  };
})()`);
check('a gate refusal propagates to a null openNightScene, not a half-written record', r1.refusedOutsideGate);
check("a successful open returns the record shape the plan's data model promises", r1.recordShapeOk);
check('the record is actually written onto npc.flags._nightScene', r1.writesOntoLiveNpc);
check('opening a second session while one is active is refused', r1.refusesDoubleOpen);

// ---------------------------------------------------------------- 2
console.log('\n2. abandonNightScene / resolveNightSceneEnd only ever act on a genuinely open record');
const r2 = J(`(() => {
  const g = __mk(3);
  const targetId = __target(g);
  __sleepInRoom(g, targetId, 'bedroom_1');
  openNightScene(g, targetId, { location: 'bedroom_1' });

  const noneOpen = abandonNightScene(g, 'nobody_home');
  const abandoned = abandonNightScene(g, targetId);
  const abandonedTwice = abandonNightScene(g, targetId); // already resolved now

  const g2 = __mk(4);
  const targetId2 = __target(g2);
  __sleepInRoom(g2, targetId2, 'bedroom_1');
  openNightScene(g2, targetId2, { location: 'bedroom_1' });
  const ended = resolveNightSceneEnd(g2, targetId2, 'wake_willing');
  const endedTwice = resolveNightSceneEnd(g2, targetId2, 'wake_hostile'); // already resolved

  return {
    noneOpen: noneOpen === null,
    abandonedCorrectly: abandoned && abandoned.resolved === 'abandon',
    refusesReAbandon: abandonedTwice === null,
    endedCorrectly: ended && ended.resolved === 'wake_willing',
    refusesReEnd: endedTwice === null,
    liveStateStillWillingNotHostile: g2.npcs[targetId2].flags._nightScene.resolved === 'wake_willing',
  };
})()`);
check('abandoning a target with no open session returns null', r2.noneOpen);
check('a real open session abandons to resolved:"abandon"', r2.abandonedCorrectly);
check('abandoning an already-resolved session refuses (no re-resolving)', r2.refusesReAbandon);
check('resolveNightSceneEnd writes the given outcome', r2.endedCorrectly);
check('resolveNightSceneEnd refuses a second write on an already-resolved record', r2.refusesReEnd);
check("the second (refused) write did NOT overwrite the first outcome", r2.liveStateStillWillingNotHostile);

// ---------------------------------------------------------------- 3
console.log('\n3. hasActiveNightScene agrees with resolved===null exactly');
const r3 = J(`(() => {
  const openNpc = { flags: { _nightScene: { resolved: null } } };
  const closedNpc = { flags: { _nightScene: { resolved: 'ghost' } } };
  const noneNpc = { flags: {} };
  return {
    openIsActive: hasActiveNightScene(openNpc) === true,
    closedIsNotActive: hasActiveNightScene(closedNpc) === false,
    noSessionIsNotActive: hasActiveNightScene(noneNpc) === false,
  };
})()`);
check('an open record (resolved:null) reads active', r3.openIsActive);
check('a resolved record reads inactive', r3.closedIsNotActive);
check('an npc with no _nightScene at all reads inactive', r3.noSessionIsNotActive);

// ---------------------------------------------------------------- 4
console.log('\n4. sweepStaleNightScenes closes ONLY the open records in a whole npc map');
const r4 = J(`(() => {
  const npcs = {
    open1: { flags: { _nightScene: { resolved: null, evidence: [] } } },
    closedGhost: { flags: { _nightScene: { resolved: 'ghost', evidence: [] } } },
    open2: { flags: { _nightScene: { resolved: null, evidence: ['fluids'] } } },
    noSession: { flags: {} },
  };
  sweepStaleNightScenes(npcs);
  return {
    open1Closed: npcs.open1.flags._nightScene.resolved === 'abandon',
    ghostUntouched: npcs.closedGhost.flags._nightScene.resolved === 'ghost',
    open2Closed: npcs.open2.flags._nightScene.resolved === 'abandon',
    open2EvidencePreserved: JSON.stringify(npcs.open2.flags._nightScene.evidence) === JSON.stringify(['fluids']),
    noSessionUntouched: !npcs.noSession.flags._nightScene,
  };
})()`);
check('an open record is swept to abandon', r4.open1Closed);
check('an already-resolved record is left exactly as it was', r4.ghostUntouched);
check('a second open record in the same sweep is also closed', r4.open2Closed);
check("sweeping preserves the rest of the record's fields (not a blind overwrite)", r4.open2EvidencePreserved);
check('an npc with no session at all is untouched', r4.noSessionUntouched);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
