// NPC avatar liveliness — Phase 2b: reverse overture (move-to-NPC, D20).
//
//   node src/src/dev/verify/verify-present-p2b.js
//
// The plan's Phase 2b Verification, translated into checks against the real
// engine (config/sim/world/movement/time/cognition). resolveMoveToNpc is the
// pure heart of D20 — the player clicks an NPC's floor-plan avatar and the
// sim says where the player walks and at what player-tier cost; invariant 9
// ("a move-to-NPC destination is the sim's position at arrival time, read
// from the sim — never a guess") and invariant 1 ("the presentation layer
// never writes sim state") are both asserted here. The D22 "the NPC actually
// advanced during the player's move" check and the live click affordance are
// verified on the live page (this file cannot load render.js/ui.js — both are
// deliberately absent from loadgame ORDER, and ui.js needs a DOM).
//
//   1. Stationary NPC -> their room, player-tier arriveSec, no feedback.
//   2. Mid-walk NPC -> their DESTINATION room (not their current one), on the
//      faster player tier (D19).
//   3. Off-map-bound (work walk), player arrives after the NPC leaves ->
//      entry room + "gone before you could reach them" feedback.
//   4. Off-map-bound, player beats the off-map time -> entry room, no
//      feedback (they meet at the door).
//   5. Already off-map -> null (no-op).
//   6. Already co-located with a stationary NPC -> null (no-op).
//   7. Unknown NPC -> null.
//   8. Invariant 1: resolveMoveToNpc mutates NOTHING (npc record + clock
//      byte-identical after the call).
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'sim.js', 'world.js', 'movement.js',
             'time.js', 'cognition.js', 'npc.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260902, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __nowAbs = (g) => clockToAbsolute(g.meta.clock);

  __setStationary = (g, id, room) => {
    const n = g.npcs[id];
    n.walk = null;
    n.location = room;
    const [cx, cy] = roomCentre(room);
    n.pos = { x: cx, y: cy };
    n.commitment = { id: 'relax', kind: 'drive', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 30,
      anchor: { roomId: room, objId: null, point: { x: cx, y: cy } },
      arrived: true, activity: 'relaxing', score: 0, shouted: [] };
  };

  __setMidwalk = (g, id, fromRoom, toRoom) => {
    const n = g.npcs[id];
    n.location = fromRoom;
    const [cx, cy] = roomCentre(fromRoom);
    n.pos = { x: cx, y: cy };
    const [tx, ty] = roomCentre(toRoom);
    const point = { x: tx, y: ty };
    n.commitment = { id: 'go_eat', kind: 'drive', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 30,
      anchor: { roomId: toRoom, objId: null, point }, arrived: false,
      activity: 'heading out', score: 0, shouted: [] };
    n.walk = planWalk(g, n, fromRoom, { roomId: toRoom, point });
  };

  __setWork = (g, id, fromRoom, untilOffMapSec) => {
    const n = g.npcs[id];
    n.location = fromRoom;
    const [cx, cy] = roomCentre(fromRoom);
    n.pos = { x: cx, y: cy };
    const anchor = frontDoorAnchor(g);
    n.commitment = { id: 'go_work', kind: 'work', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 120, anchor, arrived: false,
      activity: 'heading to work', score: 0, shouted: [] };
    n.walk = planWalk(g, n, fromRoom, anchor);
    if (untilOffMapSec != null) n.walk.completesAtAbs = __nowAbs(g) + untilOffMapSec / 60;
  };

  __t_stationary = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setStationary(g, id, 'bedroom_1');
    const plan = resolveMoveToNpc(g, 'living_room', id);
    return { got: !!plan, room: plan && plan.targetRoomId, expected: 'bedroom_1',
      arriveSec: plan && plan.arriveSec,
      tierMatches: !!plan && Math.abs(plan.arriveSec - walkSeconds(findPath('living_room', 'bedroom_1'), 'player')) < 1e-9,
      noFeedback: !!plan && plan.feedback == null };
  };

  __t_midwalk = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');   // mid-walk bedroom_1 -> kitchen
    const plan = resolveMoveToNpc(g, 'living_room', id);
    const npcCurrent = g.npcs[id].location;         // still bedroom_1 (not arrived)
    const playerTier = walkSeconds(findPath('living_room', 'kitchen'), 'player');
    const npcTier = walkSeconds(findPath('living_room', 'kitchen'), 'npc');
    return { got: !!plan, destRoom: plan && plan.targetRoomId, expected: 'kitchen',
      npcCurrent,
      arriveSec: plan && plan.arriveSec,
      targetsDestNotCurrent: !!plan && plan.targetRoomId === 'kitchen' && npcCurrent === 'bedroom_1',
      tierMatches: !!plan && Math.abs(plan.arriveSec - playerTier) < 1e-9,
      playerFaster: !!plan && plan.arriveSec < npcTier,
      noFeedback: !!plan && plan.feedback == null };
  };

  __t_workGone = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setWork(g, id, 'bedroom_1', 1);   // steps out the door in 1 game-second
    const plan = resolveMoveToNpc(g, 'living_room', id);
    return { got: !!plan, room: plan && plan.targetRoomId, expected: 'entry',
      feedback: plan && plan.feedback,
      hasGoneFeedback: !!plan && !!plan.feedback &&
        plan.feedback.indexOf('gone before you could reach them') !== -1 };
  };

  __t_workMeet = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setWork(g, id, 'bedroom_1', 600);   // off-map in 10 game-minutes — the player easily beats it
    const plan = resolveMoveToNpc(g, 'living_room', id);
    return { got: !!plan, room: plan && plan.targetRoomId, expected: 'entry',
      noFeedback: !!plan && plan.feedback == null };
  };

  __t_offmap = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    const n = g.npcs[id];
    n.location = null; n.pos = null; n.walk = null;
    return { isNull: resolveMoveToNpc(g, 'living_room', id) === null };
  };

  __t_colocated = () => {
    const g = __mk();
    const id = __ids(g)[0];
    __setStationary(g, id, 'living_room');
    g.player.location = 'living_room';
    return { isNull: resolveMoveToNpc(g, 'living_room', id) === null };
  };

  __t_unknown = () => {
    const g = __mk();
    g.player.location = 'living_room';
    return { isNull: resolveMoveToNpc(g, 'living_room', 'nobody') === null };
  };

  __t_nowrite = () => {
    const g = __mk();
    g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');
    const beforeNpc = JSON.stringify(g.npcs[id]);
    const beforeClock = JSON.stringify(g.meta.clock);
    const beforePlayer = JSON.stringify(g.player);
    const plan = resolveMoveToNpc(g, 'living_room', id);
    return { same: beforeNpc === JSON.stringify(g.npcs[id])
        && beforeClock === JSON.stringify(g.meta.clock)
        && beforePlayer === JSON.stringify(g.player),
      got: !!plan };
  };

  __t_d22 = () => {
    // The D22 partial batch advance (settleWalks): a walk that has NOT
    // completed when a batch step lands advances proportionally to wherever
    // the clock is inside its span — coveredUnits = totalUnits x
    // (nowAbs - startedAtAbs)/span — instead of freezing then snapping.
    // Pure function of the clock + walk record (C6); the live regime
    // advances per-rAF via advanceFrameWalks and is not what this tests.
    const g = __mk();
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');
    const w = g.npcs[id].walk;
    const total = w.totalUnits;
    // Stretch the span to 45 game-minutes so a single 30-min tick lands
    // exactly 2/3 of the way through.
    const nowAbs = __nowAbs(g);
    w.startedAtAbs = nowAbs;
    w.completesAtAbs = nowAbs + 0.75;
    w.coveredUnits = 0;
    // One full tick (30 game-min) later, still mid-walk.
    g.meta.clock = absoluteToClock(nowAbs + 0.5);
    settleWalks(g);
    const n = g.npcs[id];
    const coveredAfter = w.coveredUnits;
    const expected = total * (0.5 / 0.75);
    const midPos = pointAlongPath(w.path, coveredAfter);
    const midOk = coveredAfter > 0 && coveredAfter < total
      && Math.abs(coveredAfter - expected) < 1e-6
      && !!n.walk
      && Math.abs(n.pos.x - midPos.x) < 1e-9 && Math.abs(n.pos.y - midPos.y) < 1e-9;
    // Advance past completion — the walk lands at the final waypoint.
    g.meta.clock = absoluteToClock(nowAbs + 1.0);
    settleWalks(g);
    const end = w.path[w.path.length - 1];
    const landedOk = !n.walk
      && n.commitment.arrived === true
      && n.pos && Math.abs(n.pos.x - end.x) < 1e-9 && Math.abs(n.pos.y - end.y) < 1e-9;
    return { midOk, coveredAfter, expected, total, stillWalkingMid: !!n.walk, landedOk };
  };
`);

console.log('\n1. Stationary NPC — walk to their room, player tier, no feedback');
const st = api('__t_stationary()');
check(`targets the NPC's room (${st.expected})`, st.got && st.room === st.expected,
  `got ${st.room}`);
check('arriveSec is the player-tier walk to that room', st.tierMatches,
  `arriveSec=${st.arriveSec.toFixed(2)}`);
check('no "gone" feedback for a stationary NPC', st.noFeedback);

console.log('\n2. Mid-walk NPC — walk to their DESTINATION, faster player tier (D19)');
const mw = api('__t_midwalk()');
check(`targets the destination room (${mw.expected}), not the room they are still in (${mw.npcCurrent})`,
  mw.got && mw.targetsDestNotCurrent, `got ${mw.destRoom}`);
check('arriveSec is the player-tier walk to the destination', mw.tierMatches,
  `arriveSec=${mw.arriveSec.toFixed(2)}`);
check('player tier is genuinely faster than the NPC tier (catching up is the norm)',
  mw.playerFaster, `player=${mw.arriveSec.toFixed(2)} npc tier > player tier`);
check('no "gone" feedback for an ordinary mid-walk', mw.noFeedback);

console.log('\n3. Off-map-bound (work walk), player arrives after they leave — entry + feedback');
const wg = api('__t_workGone()');
check(`travels to the entry room (${wg.expected})`, wg.got && wg.room === wg.expected, `got ${wg.room}`);
check('"gone before you could reach them" feedback fires', wg.hasGoneFeedback,
  `feedback=${wg.feedback}`);

console.log('\n4. Off-map-bound, player beats the off-map time — meet at the door');
const wm = api('__t_workMeet()');
check(`travels to the entry room (${wm.expected})`, wm.got && wm.room === wm.expected, `got ${wm.room}`);
check('no "gone" feedback — they will still be there', wm.noFeedback, `feedback=${wm.feedback}`);

console.log('\n5. No-ops (D20): already off-map, already co-located, unknown id');
check('already off-map NPC -> null', api('__t_offmap()').isNull);
check('already co-located stationary NPC -> null', api('__t_colocated()').isNull);
check('unknown npcId -> null', api('__t_unknown()').isNull);

console.log('\n6. Invariant 1 — resolveMoveToNpc writes NO sim state');
const nw = api('__t_nowrite()');
check('npc record, player and clock byte-identical after the call', nw.same,
  `got plan=${nw.got}`);

console.log('\n7. D22 — settleWalks advances an INCOMPLETE walk proportionally (batch regime)');
const d22 = api('__t_d22()');
check('mid-span: coveredUnits = totalUnits x elapsed/span, pos on the path, walk kept',
  d22.midOk, `covered=${d22.coveredAfter.toFixed(3)} expected=${d22.expected.toFixed(3)}`);
check('past completion: walk null, arrived=true, pos at the final waypoint', d22.landedOk);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
