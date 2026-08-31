// NPC avatar liveliness — Phase 3: conversation departure awareness
// (D11/D12/D13/D21) + per-turn presence reconciliation (D14).
//
//   node src/src/dev/verify/verify-present-p3.js
//
// The plan's Phase 3 Verification, translated into checks against the real
// engine (config/sim/world/movement/time/cognition/llm — llm.js is in ORDER
// and its pure half is testable; ui.js is NOT, it needs a DOM, so the
// doConvSend lifecycle is verified on the live page). imminentDeparture is
// the pure heart of D12/D13 — the deterministic probe (invariant 1: pure
// reads only, the harness asserts byte-identical state) that the UI stores on
// convState and the prompt's DEPARTURE AWARENESS block consumes. Three
// signals, priority order:
//   1. walk-out — mid-walk to a different room (destType from the walk:
//      work → offflat, private room → privacy, else shared);
//   2. work boundary — the schedule says off-site (work/commute block +
//      npcIsOffsite), due now for an uncommitted NPC;
//   3. next room — a schedule block boundary within the window implies an
//      in-flat move (meal-ish → shared room, sleep/wind_down → own bedroom).
// reconcileScenePresence (D14) and conversationDepartureLine (D12) are the
// prompt-side half, also pure.
//
//   1. Walk-out: shared / offflat / privacy (bathroom + own bedroom) /
//      same-room walk → null.
//   2. Work boundary: on_site mid-shift → offflat; remote mid-shift → null;
//      on_site out-of-work-block → null.
//   3. Next room: morning boundary → kitchen; wind_down → own bedroom; end-
//      of-day wrap → own bedroom; outside the window → null; deep sleep → null.
//   4. Invariant 1: imminentDeparture mutates NOTHING (byte-identical).
//   5. reconcileScenePresence: drops the departed from present/active/ambient,
//      keeps the engagement object identity, returns a NEW state.
//   6. conversationDepartureLine: shared invites / privacy does not /
//      offflat farewells / ack is final / empty when neither flag set.
//   7. Save/load round-trip: JSON-stringify → parse → identical probe result.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'sim.js', 'commitments.js', 'world.js',
             'movement.js', 'time.js', 'cognition.js', 'npc.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260903, 4);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __nowAbs = (g) => clockToAbsolute(g.meta.clock);
  // Day 3 is a Tuesday (getWeekday(3)=1) — a WEEKDAY, so day_shift's weekday
  // template applies. Every signal-2/3 test runs on it.
  __clockAt = (g, minutes) => { g.meta.clock = absoluteToClock(3 * 1440 + minutes); };

  // Stationary, UNCOMMITTED, in a fixed room — the base for signal 2/3 tests
  // (a commitment would short-circuit resolveScheduleActivity to its own
  // block). residency.room stays the generated one.
  __setHome = (g, id, room) => {
    const n = g.npcs[id];
    n.walk = null;
    n.commitment = null;
    n.location = room;
    const [cx, cy] = roomCentre(room);
    n.pos = { x: cx, y: cy };
    const occ = n.bible.occupation || {};
    n.bible.scheduleTemplate = 'day_shift';   // sim reads bible.scheduleTemplate (sim.js:1239)
    n.bible.occupation = { ...occ, workMode: 'on_site', sleepRhythm: 'regular' };
    return n;
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
    return n;
  };

  __setWorkWalk = (g, id, fromRoom) => {
    const n = g.npcs[id];
    n.location = fromRoom;
    const [cx, cy] = roomCentre(fromRoom);
    n.pos = { x: cx, y: cy };
    const anchor = frontDoorAnchor(g);
    n.commitment = { id: 'go_work', kind: 'work', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 120, anchor, arrived: false,
      activity: 'heading to work', score: 0, shouted: [] };
    n.walk = planWalk(g, n, fromRoom, anchor);
    return n;
  };

  // Same-room "walk" — a walk whose destination is where the NPC already is
  // (anchor roomId === location). Signal 1 must NOT treat it as a departure.
  __setSameRoomWalk = (g, id) => {
    const n = g.npcs[id];
    const [cx, cy] = roomCentre('living_room');
    n.location = 'living_room'; n.pos = { x: cx, y: cy };
    n.commitment = { id: 'x', kind: 'drive', startedAtAbs: __nowAbs(g),
      completesAtAbs: __nowAbs(g) + 30,
      anchor: { roomId: 'living_room', objId: null, point: { x: cx, y: cy } },
      arrived: false, activity: 'x', score: 0, shouted: [] };
    n.walk = { path: [{ x: cx, y: cy }], totalUnits: 0, coveredUnits: 0,
      startedAtAbs: __nowAbs(g), completesAtAbs: __nowAbs(g) + 30, fromRoom: 'living_room' };
    return n;
  };

  __t_walkShared = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');
    const d = imminentDeparture(g, id);
    return { got: !!d, reason: d && d.reason, type: d && d.destType,
      room: d && d.destRoomId, walk: !!g.npcs[id].walk };
  };

  __t_walkOffflat = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setWorkWalk(g, id, 'bedroom_1');
    const d = imminentDeparture(g, id);
    return { got: !!d, reason: d && d.reason, type: d && d.destType,
      room: d && d.destRoomId };
  };

  __t_walkPrivacy = (toRoom) => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', toRoom);
    const d = imminentDeparture(g, id);
    return { got: !!d, type: d && d.destType, room: d && d.destRoomId };
  };

  __t_walkSameRoom = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setSameRoomWalk(g, id);
    __clockAt(g, 200);   // deep in sleep: no signal 2/3 either, so the
    const d = imminentDeparture(g, id);   // walk guard alone must yield null
    return { got: !!d, walk: !!g.npcs[id].walk };
  };

  __t_workBoundary = (workMode) => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    const n = __setHome(g, id, 'living_room');
    if (workMode) n.bible.occupation.workMode = workMode;
    __clockAt(g, 600);   // tick 20 — day_shift work block (10:00)
    const d = imminentDeparture(g, id);
    return { got: !!d, reason: d && d.reason, type: d && d.destType,
      room: d && d.destRoomId, minutes: d && d.minutesAway };
  };

  __t_workBoundaryOffBlock = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setHome(g, id, 'living_room');
    __clockAt(g, 1200);  // tick 40 — day_shift evening block (20:00)
    const d = imminentDeparture(g, id);
    return { got: !!d, reason: d && d.reason };
  };

  __t_nextRoom = (minutes, atRoom) => {
    const g = __mk(); g.player.location = atRoom || 'living_room';
    const id = __ids(g)[0];
    const n = __setHome(g, id, atRoom || 'living_room');
    __clockAt(g, minutes);
    const d = imminentDeparture(g, id);
    return { got: !!d, reason: d && d.reason, type: d && d.destType,
      room: d && d.destRoomId, minutes: d && d.minutesAway,
      residency: n.residency && n.residency.room };
  };

  __t_nowrite = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');
    const beforeNpc = JSON.stringify(g.npcs[id]);
    const beforeClock = JSON.stringify(g.meta.clock);
    const beforePlayer = JSON.stringify(g.player);
    const d = imminentDeparture(g, id);
    return { same: beforeNpc === JSON.stringify(g.npcs[id])
        && beforeClock === JSON.stringify(g.meta.clock)
        && beforePlayer === JSON.stringify(g.player),
      got: !!d };
  };

  __t_reconcile = () => {
    const g = __mk(); g.player.location = 'living_room';
    const ids = __ids(g);
    const a = ids[0], b = ids[1], c = ids[2];
    __setHome(g, a, 'living_room');
    __setHome(g, b, 'kitchen');
    __setHome(g, c, 'living_room');
    const engagement = { [a]: 3, [b]: 5, [c]: 1 };
    const ss = { present: [a, b, c], active: [b], ambient: [a, c], engagement,
      sceneId: 7 };
    const out = reconcileScenePresence(ss, g);
    return { notSame: out !== ss,
      present: out.present, active: out.active, ambient: out.ambient,
      a, b, c,
      keepsEngagement: out.engagement === engagement,
      engagementUnchanged: JSON.stringify(out.engagement) === JSON.stringify(engagement),
      inputUntouched: ss.present.length === 3 && ss.active.length === 1 && ss.ambient.length === 2,
      sceneId: out.sceneId };
  };

  __t_line = (which, dep) => {
    const g = __mk();
    const id = __ids(g)[0];
    const name = g.npcs[id].bible.name;
    const ctx = { conversationNpcId: id };
    if (which === 'aware') ctx.departureAwareness = dep;
    else if (which === 'ack') ctx.departureAck = dep;
    return { line: conversationDepartureLine(ctx, g), name };
  };

  __t_roundtrip = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    __setMidwalk(g, id, 'bedroom_1', 'kitchen');
    const before = imminentDeparture(g, id);
    const g2 = JSON.parse(JSON.stringify(g));
    const after = imminentDeparture(g2, id);
    return { same: JSON.stringify(before) === JSON.stringify(after),
      got: !!after, reason: after && after.reason };
  };
`);

console.log('\\n1. Signal 1 — walk-out (D12 destType tiers)');
const ws = api('__t_walkShared()');
check(`mid-walk bedroom_1 -> kitchen is a departure (${ws.reason})`,
  ws.got && ws.reason === 'walk-out', JSON.stringify(ws));
check('drive walk to a common room -> shared', ws.type === 'shared', `type=${ws.type}`);
check('destRoomId is the walked-to room', ws.room === 'kitchen', `room=${ws.room}`);

const wo = api('__t_walkOffflat()');
check(`work walk -> offflat (${wo.reason})`, wo.got && wo.type === 'offflat', JSON.stringify(wo));
check('offflat destRoomId is the front-door room', wo.room === 'entry', `room=${wo.room}`);

const wp = api(`__t_walkPrivacy('bathroom_a')`);
check('walk to a bathroom -> privacy', wp.got && wp.type === 'privacy', JSON.stringify(wp));
const wr2 = api(`
  __t_ownBedroomWalk = () => {
    const g = __mk(); g.player.location = 'living_room';
    const id = __ids(g)[0];
    const n = g.npcs[id];
    const room = n.residency.room;
    __setMidwalk(g, id, 'living_room', room);
    const d = imminentDeparture(g, id);
    return { got: !!d, type: d && d.destType, room: d && d.destRoomId, residency: room };
  };
  __t_ownBedroomWalk()
`);
check('walk to own bedroom -> privacy', wr2.got && wr2.type === 'privacy',
  `type=${wr2.type} room=${wr2.room} residency=${wr2.residency}`);
check('walk into a walk that stays put -> null (same-room walk guard)',
  api('__t_walkSameRoom()').got === false);

console.log('\\n2. Signal 2 — work boundary (D12 offflat)');
const wb = api('__t_workBoundary(\'on_site\')');
check(`on_site mid-shift (10:00, tick 20) -> work-boundary, offflat`,
  wb.got && wb.reason === 'work-boundary' && wb.type === 'offflat', JSON.stringify(wb));
check('offflat goes to the front door', wb.room === 'entry', `room=${wb.room}`);
check('uncommitted NPC is due now (minutesAway 0)', wb.minutes === 0, `minutes=${wb.minutes}`);
check('remote mid-shift -> null (home worker is not departing)',
  api('__t_workBoundary(\'remote\')').got === false);
check('on_site outside a work block -> null',
  api('__t_workBoundaryOffBlock()').got === false);

console.log('\\n3. Signal 3 — next room within the window (deterministic, no rng)');
const nr1 = api(`__t_nextRoom(535, 'living_room')`);   // tick 17, morning -> morning@tick18
check(`morning boundary in 5 min -> schedule-boundary, shared, kitchen`,
  nr1.got && nr1.reason === 'schedule-boundary' && nr1.type === 'shared' && nr1.room === 'kitchen',
  JSON.stringify(nr1));
check('window arithmetic (minutesAway 5)', nr1.minutes === 5, `minutes=${nr1.minutes}`);
const nr2 = api(`__t_nextRoom(1255, 'living_room')`);   // tick 41, wind_down -> wind_down@tick42
check(`wind_down boundary in 5 min -> privacy, own bedroom`,
  nr2.got && nr2.type === 'privacy' && nr2.room === nr2.residency,
  `room=${nr2.room} residency=${nr2.residency}`);
const nr3 = api(`__t_nextRoom(1435, 'living_room')`);   // tick 47, wraps to next-day sleep
check(`end-of-day wrap to sleep in 5 min -> privacy, own bedroom`,
  nr3.got && nr3.type === 'privacy' && nr3.room === nr3.residency, JSON.stringify(nr3));
const nr4 = api(`__t_nextRoom(550, 'living_room')`);    // tick 18, commute starts in 20 min
check('boundary outside the 8-min window -> null', nr4.got === false, JSON.stringify(nr4));
const nr5 = api(`__t_nextRoom(200, 'living_room')`);    // tick 6, deep sleep, wake in 280 min
check('deep sleep (boundary hours away) -> null', nr5.got === false, JSON.stringify(nr5));

console.log('\\n4. Invariant 1 — imminentDeparture writes NO sim state');
const nw = api('__t_nowrite()');
check('npc record, player and clock byte-identical after the probe', nw.same,
  `got probe=${nw.got}`);

console.log('\\n5. D14 — reconcileScenePresence');
const rc = api('__t_reconcile()');
check('returns a NEW scene state', rc.notSame);
check('present keeps the co-located pair, drops the departed one',
  JSON.stringify(rc.present) === JSON.stringify([rc.a, rc.c]), `present=${rc.present}`);
check('active is emptied (only the departed NPC was active)',
  rc.active.length === 0, `active=${rc.active}`);
check('ambient keeps the co-located pair',
  JSON.stringify(rc.ambient) === JSON.stringify([rc.a, rc.c]), `ambient=${rc.ambient}`);
check('engagement object identity preserved (never recomputed)', rc.keepsEngagement);
check('input scene state untouched', rc.inputUntouched);

console.log('\\n6. D12 — conversationDepartureLine tiers');
const lShare = api(`__t_line('aware', {destType:'shared', destRoomId:'kitchen', minutesAway:5})`);
check('shared invite says "join me" and names the room',
  lShare.line.indexOf('join me') !== -1 && lShare.line.indexOf('Kitchen') !== -1, lShare.line);
const lPriv = api(`__t_line('aware', {destType:'privacy', destRoomId:'bathroom_a', minutesAway:3})`);
check('privacy tier signals privacy and does NOT invite',
  lPriv.line.indexOf('privacy') !== -1 && lPriv.line.indexOf('join me') === -1, lPriv.line);
const lOff = api(`__t_line('aware', {destType:'offflat', destRoomId:'entry', minutesAway:1})`);
check('offflat tier is a farewell', lOff.line.indexOf('goodbye') !== -1, lOff.line);
check('offflat phrasing is grammatical ("go out shortly")',
  lOff.line.indexOf('go out in about') !== -1 || lOff.line.indexOf('go out shortly') !== -1, lOff.line);
const lAck = api(`__t_line('ack', {destType:'shared', destRoomId:'kitchen'})`);
check('ack line is the FINAL exchange', lAck.line.indexOf('FINAL') !== -1, lAck.line);
check('empty when neither flag is set', api('__t_line(\'none\', null)').line === '');

console.log('\\n7. Save/load round-trip — probe is serialization-stable');
const rt = api('__t_roundtrip()');
check('identical probe result after JSON.stringify -> parse', rt.same && rt.got,
  `reason=${rt.reason}`);

console.log(`\\n${'='.repeat(46)}\\n  ${pass} passed, ${fail} failed\\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
