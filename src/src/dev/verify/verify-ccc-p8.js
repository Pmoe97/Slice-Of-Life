// continuous-cadence-closure-plan.md — Phase 8: Ambient "meanwhile"
// scene-text ticker (D9).
//
//   node src/src/dev/verify/verify-ccc-p8.js
//
// meanwhile.js (new this phase, registered in both index.html and
// dev/verify/loadgame.js's ORDER, invariant 6): composeMeanwhileTicker
// (pure, called from scene.js's composeScene) picks the single most recent
// not-yet-seen, importance-qualifying world event NEAR (never IN) the
// player's room — "near" per meanwhilePerceivableRooms, which reuses
// signals.js's reachMultipliers across all three channels (Design Invariant
// 4: reused, not reimplemented) — and formats it as one line.
// markMeanwhileShown (the one write, called at render time from render.js's
// render() and ui.js's addLogEntry, mirroring markCalloutsShouted/
// markDoorCuesShown) marks the surfaced event's evt.seenByPlayer so it never
// repeats.
//
// Same-room events are OUT OF SCOPE for this ticker on purpose (found live,
// not guessed): ui.js's surfaceRoomEvidence already owns same-room evidence,
// called explicitly from doMove/doLookAround. Both fire several OTHER
// addLogEntry calls (each re-rendering the scene) before reaching that call
// — so if this ticker also considered the current room, an earlier
// intermediate render within the SAME action could silently "steal" (mark
// seenByPlayer with only a same-frame-invisible DOM flash, never a durable
// sessionLog line) an event surfaceRoomEvidence was about to claim and
// narrate durably moments later. Section 2 below proves the exclusion; the
// idling-in-your-own-room half of the Goal is instead a direct
// surfaceRoomEvidence call from advanceAndResolve (ui.js), gated to the idle
// checkpoint path (advanceClock===false) — source-checked in section 9.
//
// Zero new LLM calls, zero new event types (Design Invariant 5) — this
// harness never calls root.generateText/generateImage, only reads plain
// gameState.world.events records the same shape sim.js already pushes.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'signals.js', 'meanwhile.js', 'scene.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // A minimal, fully-controlled gameState. bedroom_player is the player's
  // real starting room from SIM_generateHouse — its true reach map (all
  // three signal channels) was probed by hand before writing this harness:
  //   reachable (union of smell/sound/sight): bedroom_player itself, plus
  //     hallway_a, bathroom_a, bedroom_1, living_room, game_room, dining,
  //     entry, kitchen.
  //   NOT reachable on any channel: study (and bedroom_2/3, hallway_b,
  //     bathroom_b, laundry, changing_room, gym, balcony, pool_room).
  __mk = () => {
    const h = SIM_generateHouse(20260902, 1);
    h.meta = { seed: h.seed, clock: { day: 5, minutes: 600 }, contentConfig: null, sessionLog: [] };
    h.world.events = [];
    return h;
  };
  __residentId = (h) => Object.keys(h.npcs).find(id => h.npcs[id].residency.status === 'resident');
  __evt = (over) => ({
    day: 5, tick: 20, roomId: null, npcId: null, type: 'npc_chat', moodDelta: 0,
    template: '{name} chatted for a while.', data: {}, seenByPlayer: false, ...over,
  });
`);

// ---------------------------------------------------------------- 0
console.log('0. Registration + fixture sanity');
const fixture = J(`(() => {
  const h = __mk();
  return {
    hasCompose: typeof composeMeanwhileTicker === 'function',
    hasPerceivable: typeof meanwhilePerceivableRooms === 'function',
    hasMark: typeof markMeanwhileShown === 'function',
    playerRoom: h.player.location,
    residentId: __residentId(h),
    eventImportanceNpcChat: EVENT_IMPORTANCE.npc_chat,
    eventImportanceCooking: EVENT_IMPORTANCE.cooking,
  };
})()`);
check('composeMeanwhileTicker is a real function', fixture.hasCompose);
check('meanwhilePerceivableRooms is a real function', fixture.hasPerceivable);
check('markMeanwhileShown is a real function', fixture.hasMark);
check("fixture's player starts in bedroom_player (this harness's rooms assume it)", fixture.playerRoom === 'bedroom_player', JSON.stringify(fixture));
check("EVENT_IMPORTANCE classifies npc_chat as 'social' (this harness assumes it)", fixture.eventImportanceNpcChat === 'social', JSON.stringify(fixture));
check('EVENT_IMPORTANCE has no entry for cooking — the ambient fallback this phase floors out', fixture.eventImportanceCooking === undefined, JSON.stringify(fixture));

// ---------------------------------------------------------------- 1
console.log('\n1. An ambient/unclassified event (cooking — D9\'s own "someone did laundry" example) never surfaces, even right here in the player\'s own room');
const ambientSilent = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'bedroom_player', npcId: id, type: 'cooking', template: '{name} cooked dinner.' }));
  return { result: composeMeanwhileTicker(h, 'bedroom_player') };
})()`);
check('an unclassified (ambient-band) event produces no ticker line', ambientSilent.result === null, JSON.stringify(ambientSilent));

// ---------------------------------------------------------------- 2
console.log('\n2. A social/significant event right here in the player\'s own room NEVER surfaces via this ticker — surfaceRoomEvidence\'s job, kept race-free (see header)');
const hereCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'bedroom_player', npcId: id, type: 'npc_chat', template: '{name} chatted for a while.' }));
  return {
    result: composeMeanwhileTicker(h, 'bedroom_player'),
    reachIncludesSelf: meanwhilePerceivableRooms(h, 'bedroom_player').has('bedroom_player'),
  };
})()`);
check("meanwhilePerceivableRooms still includes the room itself (reachMultipliers' own seed) — the exclusion below is an explicit skip, not an accident of the reach set", hereCase.reachIncludesSelf, JSON.stringify(hereCase));
check('a same-room qualifying event is explicitly excluded — composeMeanwhileTicker returns null even though nothing else disqualifies it', hereCase.result === null, JSON.stringify(hereCase));

// ---------------------------------------------------------------- 3
console.log('\n3. A social/significant event in a NEARBY (signal-reachable) room surfaces, room-prefixed');
const nearbyCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat', template: '{name} chatted for a while.' }));
  const result = composeMeanwhileTicker(h, 'bedroom_player');
  const kitchenName = ROOMS.kitchen.name;
  const rawText = formatEventText(h.world.events[0], h.npcs);
  return { result, kitchenName, rawText, reachHasKitchen: meanwhilePerceivableRooms(h, 'bedroom_player').has('kitchen') };
})()`);
check('meanwhilePerceivableRooms confirms kitchen is reachable from bedroom_player on at least one channel (this harness assumes it)', nearbyCase.reachHasKitchen, JSON.stringify(nearbyCase));
check('a qualifying event in a reachable-but-different room surfaces', !!nearbyCase.result, JSON.stringify(nearbyCase));
check('the line is prefixed "Meanwhile, in the <room>: " + the plain event text', nearbyCase.result?.line === `Meanwhile, in the ${nearbyCase.kitchenName}: ${nearbyCase.rawText}`, JSON.stringify(nearbyCase));

// ---------------------------------------------------------------- 4
console.log('\n4. A social/significant event in a room OUT of signal reach never surfaces');
const farCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'study', npcId: id, type: 'argument', template: '{name} argued about something.' }));
  return {
    result: composeMeanwhileTicker(h, 'bedroom_player'),
    reachHasStudy: meanwhilePerceivableRooms(h, 'bedroom_player').has('study'),
  };
})()`);
check('meanwhilePerceivableRooms confirms study is NOT reachable from bedroom_player on any channel (this harness assumes it)', !farCase.reachHasStudy, JSON.stringify(farCase));
check('a qualifying event out of signal reach produces no ticker line', farCase.result === null, JSON.stringify(farCase));

// ---------------------------------------------------------------- 5
console.log('\n5. An event already marked seenByPlayer never surfaces, even if it otherwise qualifies (nearby room — kitchen, per section 3)');
const seenCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat', seenByPlayer: true }));
  return { result: composeMeanwhileTicker(h, 'bedroom_player') };
})()`);
check('an already-seen event is skipped', seenCase.result === null, JSON.stringify(seenCase));

// ---------------------------------------------------------------- 6
console.log('\n6. Among multiple qualifying unseen events (all in the same nearby room — kitchen), the most RECENT (day, then tick) wins');
const recencyCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat', day: 3, tick: 40, template: 'OLDEST: {name} chatted.' }));
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat', day: 5, tick: 10, template: 'MIDDLE: {name} chatted.' }));
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat', day: 5, tick: 20, template: 'NEWEST: {name} chatted.' }));
  return { result: composeMeanwhileTicker(h, 'bedroom_player') };
})()`);
check('the most recent (day=5, tick=20) event wins over an earlier tick the same day and an earlier day entirely',
  !!recencyCase.result?.line && recencyCase.result.line.includes('NEWEST'), JSON.stringify(recencyCase));

// ---------------------------------------------------------------- 7
console.log('\n7. markMeanwhileShown mutates the SAME live event (reference, not a copy) — the ticker never repeats it afterward (nearby room — kitchen)');
const markCase = J(`(() => {
  const h = __mk();
  const id = __residentId(h);
  h.world.events.push(__evt({ roomId: 'kitchen', npcId: id, type: 'npc_chat' }));
  const before = { seenByPlayer: h.world.events[0].seenByPlayer };
  const first = composeMeanwhileTicker(h, 'bedroom_player');
  markMeanwhileShown(h, first);
  const after = { seenByPlayer: h.world.events[0].seenByPlayer };
  const second = composeMeanwhileTicker(h, 'bedroom_player');
  return { firstSurfaced: !!first, before, after, second };
})()`);
check('the event surfaced on the first call', markCase.firstSurfaced, JSON.stringify(markCase));
check('seenByPlayer was false before marking', markCase.before.seenByPlayer === false, JSON.stringify(markCase));
check('markMeanwhileShown flips the REAL event in gameState.world.events to seenByPlayer:true', markCase.after.seenByPlayer === true, JSON.stringify(markCase));
check('a second compose call after marking returns null — no repeat', markCase.second === null, JSON.stringify(markCase));

// ---------------------------------------------------------------- 8
console.log('\n8. markMeanwhileShown(gameState, null) is a harmless no-op (composeMeanwhileTicker returns null whenever nothing qualifies)');
const noopCase = J(`(() => {
  const h = __mk();
  markMeanwhileShown(h, null);
  markMeanwhileShown(h, undefined);
  return { ok: true };
})()`);
check('marking a null/undefined ticker result never throws', noopCase.ok === true);

// ---------------------------------------------------------------- 9
console.log('\n9. Wiring: meanwhile.js registered in BOTH index.html and loadgame.js ORDER (invariant 6); scene.js/render.js/ui.js actually call it');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
const loadgameSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
const sceneSrc = fs.readFileSync(path.join(SRC, 'scene.js'), 'utf8');
const renderSrc = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
check('index.html has a <script> tag for meanwhile.js', /srcfiles\/meanwhile\.js\?v=\d+/.test(indexHtml));
check("loadgame.js's ORDER array registers 'meanwhile.js'", /'meanwhile\.js'/.test(loadgameSrc));
check("index.html loads meanwhile.js BEFORE scene.js (composeScene calls composeMeanwhileTicker at runtime)",
  indexHtml.indexOf('srcfiles/meanwhile.js') < indexHtml.indexOf('srcfiles/scene.js') && indexHtml.indexOf('srcfiles/meanwhile.js') > -1);
check("scene.js's composeScene calls composeMeanwhileTicker and returns it as `meanwhile`",
  /const meanwhile = composeMeanwhileTicker\(gameState, roomId\)/.test(sceneSrc) && /meanwhile,/.test(sceneSrc));
check("render.js's renderSceneReader draws scene.meanwhile into the establishing passage",
  /scene\.meanwhile/.test(renderSrc) && /sr-meanwhile/.test(renderSrc));
check("render.js's main render() marks the ticker's event seen after drawing it",
  /markMeanwhileShown\(gameState, composedScene\?\.meanwhile\)/.test(renderSrc));
check("ui.js's addLogEntry (the other scene-redraw call site, per markCalloutsShouted's own comment there) also marks it seen",
  /markMeanwhileShown\(currentGameState, composedScene\?\.meanwhile\)/.test(uiSrc));
check("ui.js's advanceAndResolve calls surfaceRoomEvidence on the idle checkpoint path only (advanceClock===false), covering same-room idling without racing the ticker",
  /if \(!advanceClockToo\) surfaceRoomEvidence\(currentGameState\.player\.location\);/.test(uiSrc));
check("meanwhile.js's composeMeanwhileTicker source itself excludes the current room explicitly (evt.roomId === roomId skip), not just via this harness's fixture",
  /evt\.roomId === roomId\) continue;/.test(fs.readFileSync(path.join(SRC, 'meanwhile.js'), 'utf8')));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
