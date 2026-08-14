// The floor plan and movement overhaul — phases 1-3.
//
// The invariant this suite exists for, above all others: THE MAP AND THE
// MOVEMENT GRAPH CANNOT DISAGREE. Before this plan, zero of seventeen
// declared adjacencies shared a wall — the graph and the picture had drifted
// completely apart and nothing noticed, because nothing was ever asked.
//
// Everything here is a read of pure data or a call to a pure function, so it
// runs headless with no DOM and no Perchance runtime.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, ctx } = loadEngine({ required: ['config.js', 'sim.js', 'world.js', 'signals.js', 'computer.js', 'overture.js'] });
const vm = require('vm');
const run = (src) => vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const ROOMS_ = api('ROOMS');
const ADJ = api('ROOM_ADJACENCY');
const THR = api('ROOM_THRESHOLDS');
const LAYOUT = api('ROOM_LAYOUT');
const ALL = api('ALL_ROOMS');
const TOL = api('WALL_TOUCH_TOLERANCE');

// ---------------------------------------------------------------- 1
console.log('\n1. The map and the graph agree');

const noWall = [];
for (const [a, ns] of Object.entries(ADJ)) {
  for (const b of ns) {
    const seg = api(`sharedWallSegment('${a}', '${b}')`);
    if (!seg || seg.len < 8) noWall.push(`${a}~${b}${seg ? ` (${seg.len.toFixed(0)}px)` : ' (none)'}`);
  }
}
check('EVERY declared adjacency shares a real wall', noWall.length === 0, noWall.join('\n        '));
check('...wide enough for a door on every one of them',
      noWall.length === 0, `tolerance ${TOL}px, minimum shared wall 8px`);

// The failure this catches is a room nudged in the layout until it no longer
// touches a neighbour it still claims. Demonstrated from the other side so
// the check above is known to be capable of failing.
check('the wall check can actually fail (a moved room stops sharing)', api(`
  (() => {
    const save = JSON.parse(JSON.stringify(ROOM_LAYOUT.bedroom_1));
    ROOM_LAYOUT.bedroom_1 = ROOM_LAYOUT.bedroom_1.map(([x,y,w,h]) => [x + 400, y, w, h]);
    const broken = sharedWallSegment('bedroom_1', 'hallway_a');
    ROOM_LAYOUT.bedroom_1 = save;
    return broken === null && !!sharedWallSegment('bedroom_1', 'hallway_a');
  })()
`));

check('every room has geometry', ALL.every(r => Array.isArray(LAYOUT[r]) && LAYOUT[r].length > 0),
      ALL.filter(r => !LAYOUT[r]).join(', '));
check('no geometry for a room that does not exist',
      Object.keys(LAYOUT).every(r => !!ROOMS_[r]),
      Object.keys(LAYOUT).filter(r => !ROOMS_[r]).join(', '));
check('a room is a LIST of rects, never a bare box (D2)',
      Object.values(LAYOUT).every(v => Array.isArray(v) && v.every(r => Array.isArray(r) && r.length === 4)));
check('the L-shaped rooms really are multi-rect',
      LAYOUT.gym.length > 1 && LAYOUT.living_room.length > 1,
      `gym ${LAYOUT.gym.length}, living_room ${LAYOUT.living_room.length}`);
check('adjacency is symmetric',
      ALL.every(a => (ADJ[a] || []).every(b => (ADJ[b] || []).includes(a))));
check('no room is adjacent to itself', ALL.every(a => !(ADJ[a] || []).includes(a)));
check('every room is reachable from the entry', api(`
  (() => {
    const seen = new Set(['entry']); const q = ['entry'];
    while (q.length) for (const n of (ROOM_ADJACENCY[q.pop()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return seen.size === ALL_ROOMS.length;
  })()
`));

// ---------------------------------------------------------------- 2
console.log('\n2. Thresholds');

const edgeKeys = Object.keys(THR);
check('every adjacency has a threshold',
      Object.entries(ADJ).every(([a, ns]) => ns.every(b => !!api(`thresholdBetween('${a}','${b}')`))));
check('every threshold key is a sorted pair',
      edgeKeys.every(k => { const [a, b] = k.split('|'); return a < b; }),
      edgeKeys.filter(k => { const [a, b] = k.split('|'); return a >= b; }).join(', '));
check('every threshold names two real rooms',
      edgeKeys.every(k => k.split('|').every(r => !!ROOMS_[r])));
check('every threshold value is one of the three types',
      Object.values(THR).every(v => ['door', 'open', 'glass'].includes(v)));
check('thresholdBetween answers the same in both directions',
      edgeKeys.every(k => { const [a, b] = k.split('|');
        return api(`thresholdBetween('${a}','${b}')`) === api(`thresholdBetween('${b}','${a}')`); }));
check('unconnected rooms return null, not a default',
      api(`thresholdBetween('bedroom_player', 'pool_room')`) === null,
      '"no barrier" and "no connection" must not be the same answer');

// D5. The single most dangerous confusion in this plan: a threshold that is
// not a route. D14 also makes the pane an UPGRADE rather than a starting
// condition, so the base layout has no glass at all — these drive it through
// applyStructuralUpgrades and assert the invariant on the result.
check('the BASE layout has no glass — the pane is an upgrade (D14)',
      edgeKeys.every(k => THR[k] !== 'glass'));
check('the pool window upgrade adds a glass threshold', api(`
  (() => {
    const gs = { world: { flags: { structural_pool_window: true } } };
    applyStructuralUpgrades(gs);
    const ok = ROOM_THRESHOLDS['living_room|pool_room'] === 'glass';
    applyStructuralUpgrades();
    return ok;
  })()
`));
check('NO glass edge reaches ROOM_ADJACENCY, even once built (D5)', api(`
  (() => {
    const gs = { world: { flags: { structural_pool_window: true } } };
    applyStructuralUpgrades(gs);
    const walkable = (ROOM_ADJACENCY.living_room || []).includes('pool_room')
                  || (ROOM_ADJACENCY.pool_room || []).includes('living_room');
    applyStructuralUpgrades();
    return !walkable;
  })()
`), 'a walkable window is the bug this decision exists to prevent');
check('...but it DOES reach the signal edge list', api(`
  (() => {
    const gs = { world: { flags: { structural_pool_window: true } } };
    applyStructuralUpgrades(gs);
    const seen = (SIGNAL_EDGES.living_room || []).includes('pool_room');
    applyStructuralUpgrades();
    return seen;
  })()
`));
check('findPath never routes through glass', api(`
  (() => {
    const gs = { world: { flags: { structural_pool_window: true } } };
    applyStructuralUpgrades(gs);
    const p = findPath('living_room', 'pool_room');
    applyStructuralUpgrades();
    if (!p) return false;
    return p.length > 2;   // must take the long way round, via the Game Room
  })()
`));

// D6 — the open core, asserted as a property rather than restated as a list.
check('the open core is one contiguous zone containing both hallways (D6)', api(`
  (() => {
    const open = {};
    for (const k of Object.keys(ROOM_THRESHOLDS)) {
      if (ROOM_THRESHOLDS[k] !== 'open') continue;
      const [a, b] = k.split('|');
      (open[a] = open[a] || []).push(b); (open[b] = open[b] || []).push(a);
    }
    const seen = new Set(['living_room']); const q = ['living_room'];
    while (q.length) for (const n of (open[q.pop()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return ['entry','living_room','dining','kitchen','hallway_a','hallway_b'].every(r => seen.has(r));
  })()
`));
check('every private room is exactly one door off that core (D6)', api(`
  (() => {
    const core = ['entry','living_room','dining','kitchen','hallway_a','hallway_b'];
    for (const r of ALL_ROOMS) {
      if (core.includes(r)) continue;
      if (ROOMS[r].wing === 'east') continue;         // the wing is behind ONE door, then internal
      const touchesCore = (ROOM_ADJACENCY[r] || []).some(n => core.includes(n));
      if (!touchesCore) return false;
    }
    return true;
  })()
`));

// ---------------------------------------------------------------- 3
console.log('\n3. Propagation reads the thresholds');

run(`
  var __h = SIM_generateHouse('planverify', 3, []);
  var __g = { ...__h, meta: { seed: __h.seed, clock: __h.clock } };
  var __reach = (from, ch) => reachMultipliers(__g, from, ch);
`);
check('an OPEN crossing costs distance and nothing else', api(`
  Math.abs((__reach('dining','smell')['living_room'] || 0) - SIGNAL_TUNING.attenuation.smell) < 1e-9
`), `got ${api(`__reach('dining','smell')['living_room']`)}`);
check('a DOOR crossing is strictly worse than an open one', api(`
  (__reach('bedroom_2','smell')['hallway_b'] || 0) < (__reach('dining','smell')['living_room'] || 0)
`));
// The pane, measured against the apartment without it — which is now simply
// the base layout, since D14 made it an upgrade.
run(`
  var __withoutPane = reachMultipliers(__g, 'pool_room', 'sight')['living_room'] || 0;
  applyStructuralUpgrades({ world: { flags: { structural_pool_window: true } } });
  var __withPane = reachMultipliers(__g, 'pool_room', 'sight')['living_room'] || 0;
  var __paneSound = reachMultipliers(__g, 'pool_room', 'sound')['living_room'] || 0;
  applyStructuralUpgrades();
`);
check('a GLASS crossing passes sight', api('__withPane') > 0, `got ${api('__withPane')}`);
check('...above the notice floor, or it is a window nobody can see through',
      api('__withPane') >= api('SIGNAL_TUNING.noticeFloor.sight'),
      `sight ${api('__withPane')} vs floor ${api('SIGNAL_TUNING.noticeFloor.sight')}`);
check('a GLASS crossing carries sight BETTER than the walk-around route does',
      api('__withPane') > api('__withoutPane'),
      `with ${api('__withPane').toFixed(3)} vs without ${api('__withoutPane').toFixed(3)}`);
check('...and carries no sound at all — it is a wall, not a door', api(`
  Math.abs(__paneSound - (reachMultipliers(__g, 'pool_room', 'sound')['living_room'] || 0)) < 1e-9
`), 'the pane must not change what the living room hears');

// D7, measured rather than asserted. This is the layout's most consequential
// consequence and the reason the two bedroom wings are not interchangeable.
const smellS = api(`__reach('kitchen','smell')['bedroom_2'] || 0`);
const smellN = api(`__reach('kitchen','smell')['bedroom_1'] || 0`);
check('kitchen smell reaches the SOUTH wing far more than the north (D7)',
      smellS > smellN * 2,
      `bedroom_2 ${smellS.toFixed(3)} vs bedroom_1 ${smellN.toFixed(3)} (${(smellS / smellN).toFixed(1)}x)`);
check('...and that is the THRESHOLD doing it, not distance', api(`
  (() => {
    // Same hop count from the kitchen either way? No — so prove the cause by
    // closing the archway and watching the asymmetry collapse.
    const before = (__reach('kitchen','smell')['bedroom_2'] || 0);
    ROOM_THRESHOLDS['hallway_b|kitchen'] = 'door';
    const after = reachMultipliers(__g, 'kitchen', 'smell')['bedroom_2'] || 0;
    ROOM_THRESHOLDS['hallway_b|kitchen'] = 'open';
    return after < before;
  })()
`));

// ---------------------------------------------------------------- 4
console.log('\n4. Walking');

check('resolveWalk is PURE — state is byte-identical after (D12)', api(`
  (() => { const b = JSON.stringify(__g); resolveWalk(__g, 'entry', 'pool_room'); return JSON.stringify(__g) === b; })()
`));
check('resolveWalk is DETERMINISTIC — same input, same output', api(`
  JSON.stringify(resolveWalk(__g,'entry','bedroom_2')) === JSON.stringify(resolveWalk(__g,'entry','bedroom_2'))
`));
check('resolveWalk is model-free (no rng, no async, no LLM in its source)', api(`
  (() => {
    const src = resolveWalk.toString() + walkSeconds.toString() + entryBlockedReason.toString() + walkInterruptIn.toString();
    return !/Math\\.random|callLLM|await |generateText/.test(src);
  })()
`));
check('a walk across the flat crosses every room on the route', api(`
  (() => { const r = resolveWalk(__g, 'bedroom_3', 'gym');
           return r.stoppedAt === 'gym' && r.crossed.length === r.route.length - 1; })()
`));
check('walking to where you already are does nothing', api(`
  (() => { const r = resolveWalk(__g, 'kitchen', 'kitchen');
           return r.stoppedAt === 'kitchen' && r.crossed.length === 0 && r.seconds === 0; })()
`));

console.log('\n   blockers stop you BEFORE the room');
check('a locked door stops the walk in the previous room', api(`
  (() => {
    const d = Object.values(__g.objects['room_bedroom_3']).find(o => o.defId === 'bedroom_door');
    d.state = { ...d.state, lock: 'locked' };
    const r = resolveWalk(__g, 'hallway_b', 'bedroom_3');
    d.state = { ...d.state, lock: 'unlocked' };
    return r.stoppedAt === 'hallway_b' && r.reason === 'locked' && r.blockedBy === 'bedroom_3'
        && !r.crossed.includes('bedroom_3');
  })()
`), 'doMove never consulted getDoorState before this plan — a padlock was decoration');
check('a locked door mid-route stops the walk there, not at the end', api(`
  (() => {
    const d = Object.values(__g.objects['room_bedroom_3']).find(o => o.defId === 'bedroom_door');
    d.state = { ...d.state, lock: 'locked' };
    const r = resolveWalk(__g, 'kitchen', 'bedroom_3');
    d.state = { ...d.state, lock: 'unlocked' };
    return r.stoppedAt === 'hallway_b' && r.reason === 'locked';
  })()
`));

console.log('\n   interrupts stop you IN the room');
check('a pending overture on the route interrupts the walk', api(`
  (() => {
    const id = Object.keys(__g.npcs).find(i => __g.npcs[i].residency.status === 'resident');
    const save = { loc: __g.npcs[id].location, ov: __g.npcs[id].overture };
    __g.npcs[id].location = 'living_room';
    __g.npcs[id].overture = { status: 'pending', targetId: 'player', overtureId: 'x', channel: 'approach' };
    const r = resolveWalk(__g, 'entry', 'pool_room');
    __g.npcs[id].location = save.loc; __g.npcs[id].overture = save.ov;
    return r.stoppedAt === 'living_room' && r.reason === 'overture' && r.blockedBy === id
        && r.crossed.includes('living_room');
  })()
`), 'someone who crossed the apartment to wait for you should catch you walking past');
check('an overture at the DESTINATION does not interrupt — arriving is the point', api(`
  (() => {
    const id = Object.keys(__g.npcs).find(i => __g.npcs[i].residency.status === 'resident');
    const save = { loc: __g.npcs[id].location, ov: __g.npcs[id].overture };
    __g.npcs[id].location = 'dining';
    __g.npcs[id].overture = { status: 'pending', targetId: 'player', overtureId: 'x', channel: 'approach' };
    const r = resolveWalk(__g, 'living_room', 'dining');
    __g.npcs[id].location = save.loc; __g.npcs[id].overture = save.ov;
    return r.stoppedAt === 'dining' && r.reason === null;
  })()
`));
check('an overture aimed at someone else does not interrupt', api(`
  (() => {
    const ids = Object.keys(__g.npcs).filter(i => __g.npcs[i].residency.status === 'resident');
    const save = { loc: __g.npcs[ids[0]].location, ov: __g.npcs[ids[0]].overture };
    __g.npcs[ids[0]].location = 'living_room';
    __g.npcs[ids[0]].overture = { status: 'pending', targetId: ids[1], overtureId: 'x', channel: 'approach' };
    const r = resolveWalk(__g, 'entry', 'pool_room');
    __g.npcs[ids[0]].location = save.loc; __g.npcs[ids[0]].overture = save.ov;
    return r.reason === null && r.stoppedAt === 'pool_room';
  })()
`));

console.log('\n   seconds, derived from the map (D9)');
const secs = (a, b) => api(`resolveWalk(__g, '${a}', '${b}').seconds`);
const near = secs('living_room', 'dining');
const far = secs('bedroom_3', 'gym');
check('a step to the next room costs seconds, not minutes', near > 0 && near < 30,
      `${near.toFixed(1)}s`);
check('crossing the whole apartment costs more than one step', far > near * 2,
      `${far.toFixed(1)}s across vs ${near.toFixed(1)}s next-door`);
check('even the longest walk stays under a game-minute', far < 60, `${far.toFixed(1)}s`);
check('walk time is DERIVED from geometry, not authored', api(`
  (() => {
    const before = resolveWalk(__g, 'living_room', 'dining').seconds;
    const save = JSON.parse(JSON.stringify(ROOM_LAYOUT.dining));
    // Make the dining room enormous; the walk across it must get longer.
    ROOM_LAYOUT.dining = [[40, 355, 170, 300]];
    const after = resolveWalk(__g, 'living_room', 'dining').seconds;
    ROOM_LAYOUT.dining = save;
    return after > before;
  })()
`), 'if it were a per-room constant, resizing the room would change nothing');
check('a blocked walk costs only the distance actually covered', api(`
  (() => {
    const d = Object.values(__g.objects['room_bedroom_3']).find(o => o.defId === 'bedroom_door');
    d.state = { ...d.state, lock: 'locked' };
    const blocked = resolveWalk(__g, 'hallway_b', 'bedroom_3');
    d.state = { ...d.state, lock: 'unlocked' };
    const full = resolveWalk(__g, 'hallway_b', 'bedroom_3');
    return blocked.seconds < full.seconds;
  })()
`));
check('every threshold type has a walk cost', api(`
  ['door','open','glass'].every(t => typeof WALK.secondsPerThreshold[t] === 'number'
                                  || WALK.secondsPerThreshold[t] === Infinity)
`));

console.log('\n   naming a room in prose');
// Eight narration sites wrote `the ${ROOMS[id].name}` by hand and produced
// "the Your Bedroom" and "the Bedroom 2". Nobody noticed because the log
// rarely named a room; walking narrates routes constantly, so it became
// unmissable. One helper now owns it.
check('the player\'s own room reads possessively, not "the Your Bedroom"',
      api(`roomPhrase('bedroom_player')`) === 'your bedroom',
      api(`roomPhrase('bedroom_player')`));
check('a designator room takes no article', api(`roomPhrase('bedroom_2')`) === 'Bedroom 2'
      && api(`roomPhrase('hallway_a')`) === 'Hallway A' && api(`roomPhrase('bathroom_b')`) === 'Bathroom B',
      `${api(`roomPhrase('bedroom_2')`)} / ${api(`roomPhrase('hallway_a')`)} / ${api(`roomPhrase('bathroom_b')`)}`);
check('an ordinary room takes "the"', api(`roomPhrase('kitchen')`) === 'the Kitchen'
      && api(`roomPhrase('changing_room')`) === 'the Changing Room',
      `${api(`roomPhrase('kitchen')`)} / ${api(`roomPhrase('changing_room')`)}`);
check('every room produces a non-empty phrase',
      ALL.every(r => { const p = api(`roomPhrase('${r}')`); return typeof p === 'string' && p.length > 0; }));
check('no room phrase double-articles', ALL.every(r => !/^the the /i.test(api(`roomPhrase('${r}')`))));
// Scanned across the SOURCE TREE rather than through a loaded function,
// because the narration sites live in ui.js/llm.js which this headless
// harness deliberately stops short of. A grep is also the stronger check:
// it catches the pattern being reintroduced in a file nobody thought to load.
const handWritten = [];
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
  fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;      // comments may cite it
    if (/the \$\{ROOMS\[/.test(line)) handWritten.push(`${f}:${i + 1}`);
  });
}
check('no narration site hand-writes an article any more',
      handWritten.length === 0, handWritten.join(', '));

// ---------------------------------------------------------------- 5
console.log('\n5. The new room is a room like any other');

check('changing_room exists in every table a room must be in', api(`
  !!ROOMS.changing_room && !!ROOM_LAYOUT.changing_room
  && !!APARTMENT_LAYOUT.changing_room && !!ROOM_FACILITIES.changing_room
  && (ROOM_ADJACENCY.changing_room || []).length > 0
`));
check('its facility resolves to a real def',
      api(`ROOM_FACILITIES.changing_room.every(f => !!FACILITY_DEFS[f])`));
check('its facility declares the room it lives in',
      api(`ROOM_FACILITIES.changing_room.every(f => FACILITY_DEFS[f].room === 'changing_room')`));
check('it spawns objects on a fresh house',
      api(`Object.keys(__h.objects['room_changing_room'] || {}).length > 0`),
      api(`Object.values(__h.objects['room_changing_room']||{}).map(o=>o.defId).join(', ')`));
check('every object it spawns has a real def',
      api(`Object.values(__h.objects['room_changing_room']||{}).every(o => !!OBJECT_DEFS[o.defId])`));
check('it gets a room shell with a derived cleanliness',
      api(`typeof __h.world.rooms.changing_room?.cleanliness === 'number'`));
check('it sits on the path through the east wing, not in a dead end',
      api(`(ROOM_ADJACENCY.changing_room || []).length >= 2`),
      api(`(ROOM_ADJACENCY.changing_room||[]).join(', ')`));

// Every room in the config must be somewhere a player can be sent, or it is
// scenery. Catches the class of bug where a room is added to ROOMS and
// forgotten everywhere else.
const orphanFacilities = ALL.filter(r => !api(`ROOM_FACILITIES['${r}']`));
check('every room has at least one facility (or is deliberately bare)',
      orphanFacilities.length === 0, `no facility: ${orphanFacilities.join(', ')}`);
const orphanObjects = ALL.filter(r => !api(`APARTMENT_LAYOUT['${r}']`));
check('every room has an object layout', orphanObjects.length === 0, orphanObjects.join(', '));

// ---------------------------------------------------------------- 6
console.log('\n6. Structural upgrades edit the graph (D13)');

const UPS = api('STRUCTURAL_UPGRADES');
const upIds = Object.keys(UPS);
check('every upgrade declares at least one graph edit',
      upIds.every(id => Array.isArray(UPS[id].edits) && UPS[id].edits.length > 0));
check('every upgrade names a real room',
      upIds.every(id => !!ROOMS_[UPS[id].room]), upIds.filter(id => !ROOMS_[UPS[id].room]).join(', '));
check('every edit is a shape the applier understands',
      upIds.every(id => UPS[id].edits.every(e => e.threshold || e.addEdge || e.removeEdge || e.roomType)));
check('every edit names a real target', api(`
  (() => {
    for (const up of Object.values(STRUCTURAL_UPGRADES)) {
      for (const e of up.edits) {
        if (e.threshold && !ROOM_THRESHOLDS_BASE[e.threshold]) return false;
        if (e.removeEdge && !ROOM_THRESHOLDS_BASE[e.removeEdge]) return false;
        if (e.roomType && !ROOMS[e.roomType]) return false;
        if (e.addEdge) {
          const [a, b] = e.addEdge.split('|');
          if (!ROOMS[a] || !ROOMS[b]) return false;
        }
      }
    }
    return true;
  })()
`));
// An added edge has to sit on a real wall, exactly like an authored one —
// the ensuite cuts a door between the bathroom and the player's bedroom, and
// if those two do not touch it is a door to nowhere.
check('every ADDED edge sits on a real shared wall', api(`
  (() => {
    for (const up of Object.values(STRUCTURAL_UPGRADES)) {
      for (const e of up.edits) {
        if (!e.addEdge) continue;
        const [a, b] = e.addEdge.split('|');
        const seg = sharedWallSegment(a, b);
        if (!seg || seg.len < 8) return false;
      }
    }
    return true;
  })()
`), 'the ensuite in particular: bathroom_a and bedroom_player must actually touch');

const applied = (id, expr) => api(`
  (() => {
    applyStructuralUpgrades({ world: { flags: { structural_${id}: true } } });
    const r = (${expr});
    applyStructuralUpgrades();
    return r;
  })()
`);
check('kitchen door closes the south wing off from the kitchen',
      applied('kitchen_hall_door', `ROOM_THRESHOLDS['hallway_b|kitchen'] === 'door'`));
check('...and measurably cuts the smell reaching Bedroom 2 (the D7 fix)', api(`
  (() => {
    const before = reachMultipliers(__g, 'kitchen', 'smell')['bedroom_2'] || 0;
    applyStructuralUpgrades({ world: { flags: { structural_kitchen_hall_door: true } } });
    const after = reachMultipliers(__g, 'kitchen', 'smell')['bedroom_2'] || 0;
    applyStructuralUpgrades();
    return after < before;
  })()
`), 'the upgrade exists to solve a problem the layout creates; it has to actually solve it');
check('the ensuite seals the hallway and opens the bedroom',
      applied('ensuite', `!ROOM_THRESHOLDS['bathroom_a|hallway_a']
                       && ROOM_THRESHOLDS['bathroom_a|bedroom_player'] === 'door'
                       && !(ROOM_ADJACENCY.hallway_a || []).includes('bathroom_a')
                       && (ROOM_ADJACENCY.bedroom_player || []).includes('bathroom_a')`));
check('...and the bathroom is still reachable afterwards (not walled off entirely)',
      applied('ensuite', `!!findPath('living_room', 'bathroom_a')`),
      'an upgrade that strands a room is a bug, not a trade-off');
check('study_to_bedroom really changes what the room IS',
      applied('study_to_bedroom', `ROOMS.study.type === 'bedroom'`));
check('dining doors close the acoustic core',
      applied('dining_doors', `ROOM_THRESHOLDS['dining|living_room'] === 'door'`));
check('two of the five ADD a barrier rather than opening one up', api(`
  (() => {
    let closers = 0;
    for (const up of Object.values(STRUCTURAL_UPGRADES)) {
      for (const e of up.edits) {
        if (e.threshold && e.to === 'door') closers++;
        if (e.removeEdge) closers++;
      }
    }
    return closers >= 2;
  })()
`), 'being able to close the house down is the lever nobody usually gets');

// The property that makes all of the above safe to run in any order.
check('applying no upgrades reproduces the base layout exactly', api(`
  (() => {
    applyStructuralUpgrades();
    const a = JSON.stringify(ROOM_ADJACENCY), t = JSON.stringify(ROOM_THRESHOLDS);
    applyStructuralUpgrades({ world: { flags: { structural_ensuite: true, structural_pool_window: true } } });
    applyStructuralUpgrades();
    return JSON.stringify(ROOM_ADJACENCY) === a && JSON.stringify(ROOM_THRESHOLDS) === t;
  })()
`), 'a rebuild must be a REBUILD, not an accumulation');
check('every upgrade is individually revertible', api(`
  (() => {
    applyStructuralUpgrades();
    const base = JSON.stringify([ROOM_ADJACENCY, ROOM_THRESHOLDS, ROOMS.study.type]);
    for (const id of Object.keys(STRUCTURAL_UPGRADES)) {
      applyStructuralUpgrades({ world: { flags: { ['structural_' + id]: true } } });
      applyStructuralUpgrades();
      if (JSON.stringify([ROOM_ADJACENCY, ROOM_THRESHOLDS, ROOMS.study.type]) !== base) return false;
    }
    return true;
  })()
`));
check('all five applied at once leaves a coherent, fully connected apartment', api(`
  (() => {
    const flags = {};
    for (const id of Object.keys(STRUCTURAL_UPGRADES)) flags['structural_' + id] = true;
    applyStructuralUpgrades({ world: { flags } });
    const seen = new Set(['entry']); const q = ['entry'];
    while (q.length) for (const n of (ROOM_ADJACENCY[q.pop()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
    const connected = seen.size === ALL_ROOMS.length;
    const symmetric = ALL_ROOMS.every(a => (ROOM_ADJACENCY[a] || []).every(b => (ROOM_ADJACENCY[b] || []).includes(a)));
    applyStructuralUpgrades();
    return connected && symmetric;
  })()
`), 'no combination of upgrades may strand a room or leave a one-way door');

// ---------------------------------------------------------------- 7
console.log('\n7. Structural work is bookable, and D7 is priced');

// The UI lives in render.computer.js, which needs a DOM and so is not loaded
// here — scanned as source instead. The class of bug this catches is a table
// that exists, applies correctly, is fully verified, and that the player has
// no way to reach. Which is exactly the state this section was written to
// close, so it is worth asserting rather than remembering.
const renderSrc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const uiCompSrc = fs.readFileSync(path.join(SRC, 'ui.computer.js'), 'utf8');
check('RenoFix renders a section built from STRUCTURAL_UPGRADES',
      /STRUCTURAL_UPGRADES/.test(renderSrc) && /renderStructuralSection/.test(renderSrc));
check('...and the dashboard actually calls it',
      /renderStructuralSection\(body, gs\)/.test(renderSrc));
check('its button action is wired all the way through',
      /data-action="upgrades\.book-structural"/.test(renderSrc)
      && /case 'upgrades\.book-structural'/.test(uiSrc)
      && /function doBookStructural/.test(uiCompSrc));
check('completing a structural job sets the flag and rebuilds the graph',
      /job\.structuralId/.test(uiSrc) && /applyStructuralUpgrades\(currentGameState\)/.test(uiSrc));
// RenoFix marks unaffordable buttons with a `disabled` CLASS, not the
// attribute — and the matching CSS rule did not exist, so an unaffordable
// Book button looked identical to an affordable one on every facility card
// in the game. Asserted because a missing style is invisible to every other
// kind of test.
check('the `disabled` button class is actually styled',
      /\.btn\.disabled\s*\{/.test(fs.readFileSync(path.join(SRC, '..', '..', 'main.html'), 'utf8')),
      'render.computer.js emits class="... disabled" for jobs you cannot afford');
check('...and recomputes rent, so the desirability change lands',
      /structuralId[\s\S]{0,900}?computeRent\(currentGameState\.npcs, currentGameState\)/.test(uiSrc));
check('booking a structural job charges and schedules it', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = [];
    g.player.money = 50000;
    const before = g.player.money;
    const r = bookStructuralJob(g, 'kitchen_hall_door', {});
    if (!r.ok) return false;
    const job = g.world.renovationJobs.find(j => j.structuralId === 'kitchen_hall_door');
    return !!job && job.status === 'active' && job.jobType === 'structural'
        && g.player.money === before - r.cost && job.etaDay > job.startDay;
  })()
`));
check('a structural job carries structuralId and NO facilityId', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = []; g.player.money = 50000;
    bookStructuralJob(g, 'pool_window', {});
    const job = g.world.renovationJobs[0];
    return !!job.structuralId && job.facilityId === undefined;
  })()
`), 'every downstream reader branches on which of the two is present');
check('booking one you cannot afford is refused', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = []; g.player.money = 10;
    return bookStructuralJob(g, 'pool_window', {}).ok === false;
  })()
`));
check('booking one already built is refused', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = []; g.player.money = 50000;
    g.world.flags = { structural_ensuite: true };
    return bookStructuralJob(g, 'ensuite', {}).ok === false;
  })()
`));
check('it respects the one-job-at-a-time cap like any other job', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = []; g.player.money = 50000;
    bookStructuralJob(g, 'dining_doors', {});
    return bookStructuralJob(g, 'pool_window', {}).ok === false;
  })()
`));
check('every structural job type has stage labels to show',
      api(`!!RENOVATION_STAGE_TEMPLATES.structural && RENOVATION_STAGE_TEMPLATES.structural.length > 0`));
check('getRenovationJobStage works on a structural job', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    g.world.renovationJobs = []; g.player.money = 50000;
    bookStructuralJob(g, 'dining_doors', {});
    const j = g.world.renovationJobs[0];
    const s = getRenovationJobStage(j, j.startDay);
    return !!s && typeof s.label === 'string' && s.label.length > 0;
  })()
`));

console.log('\n   D7 is SENSORY, not economic');
// `bedroomDesirability` priced the wing asymmetry into rent for a while, on
// an over-reading of "smell from the kitchen is strong in the south wing" —
// a sensory observation turned into an economic one. The intent is that
// EVERY BEDROOM IS EQUALLY DESIRABLE: the rooms are large, the building has
// good bones, and the south wing's position is a fact that cuts both ways —
// first to know about the bin, first to smell dinner. These assert the
// revert stuck, and that the exposure it was derived from is still there.
check('bedroomDesirability is gone, not merely unused',
      !/bedroomDesirability\s*\(/.test(fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8')),
      'a function left behind unused is the shape RI6 exists to catch');
check('rent carries no roomDesirability config', api(`!ECONOMY.rent.roomDesirability`));
check('two roommates in different wings pay exactly the same', api(`
  (() => {
    const g = JSON.parse(JSON.stringify(__g));
    const ids = Object.keys(g.npcs).filter(i => g.npcs[i].residency.status === 'resident');
    if (ids.length < 1) return false;
    for (const id of ids) g.npcs[id].residency.contributesRent = false;
    g.npcs[ids[0]].residency.contributesRent = true;
    g.npcs[ids[0]].residency.room = 'bedroom_1';
    const north = computeRent(g.npcs, g).roommateShares[ids[0]];
    g.npcs[ids[0]].residency.room = 'bedroom_3';
    const south = computeRent(g.npcs, g).roommateShares[ids[0]];
    return north === south;
  })()
`), 'every bedroom in this apartment is worth the same');
// ...but the exposure it was derived FROM is real, and stays.
check('the south wing still smells the kitchen far more than the north', api(`
  (__reach('kitchen','smell')['bedroom_2'] || 0) > (__reach('kitchen','smell')['bedroom_1'] || 0) * 2
`), 'the sensory asymmetry is the part worth keeping');

// ---------------------------------------------------------------- 8
console.log('\n8. The interior — composite shapes and authored decor');

const SHAPES = api('DESIGN_SHAPES');
const DECOR = api('ROOM_DECOR');
const shapeIds = Object.keys(SHAPES);

check('every shape has a label and a default size',
      shapeIds.every(id => SHAPES[id].label && SHAPES[id].w > 0 && SHAPES[id].h > 0),
      shapeIds.filter(id => !(SHAPES[id].label && SHAPES[id].w > 0)).join(', '));
check('every shape has at least one part', shapeIds.every(id => (SHAPES[id].parts || []).length > 0));
// THE invariant the whole editor rests on. A part expressed in absolute
// coordinates would not move when its object moved — that is shape salad,
// and it is what the first furniture pass was.
const unnormalised = [];
for (const id of shapeIds) {
  for (const p of SHAPES[id].parts) {
    const vals = p.kind === 'rect' ? [p.x, p.y, p.w, p.h]
               : p.kind === 'ellipse' ? [p.cx, p.cy, p.rx, p.ry]
               : [p.x1, p.y1, p.x2, p.y2];
    if (vals.some(v => typeof v !== 'number' || v < -0.01 || v > 1.01)) unnormalised.push(`${id}.${p.kind}`);
  }
}
check('EVERY part is normalized to the 0..1 box', unnormalised.length === 0,
      `${unnormalised.join(', ')} — an absolute coordinate cannot move with its object`);
check('every part declares a kind the renderer draws',
      shapeIds.every(id => SHAPES[id].parts.every(p => ['rect', 'ellipse', 'line'].includes(p.kind))));
check('every part class has a style rule', (() => {
  const css = fs.readFileSync(path.join(SRC, '..', '..', 'main.html'), 'utf8');
  const missing = [];
  for (const id of shapeIds) for (const p of SHAPES[id].parts) {
    if (!new RegExp(`\\.fp-p-${p.cls}\\b`).test(css)) missing.push(`${id}:${p.cls}`);
  }
  return missing.length === 0 || missing.join(', ');
})() === true, 'an unstyled part draws as a default black rectangle');

console.log('\n   authored placements');
for (const [roomId, places] of Object.entries(DECOR)) {
  check(`${roomId}: every placement names a real shape`,
        places.every(p => !!SHAPES[p.shape]),
        places.filter(p => !SHAPES[p.shape]).map(p => p.shape).join(', '));
  check(`${roomId}: every placement is inside the room`, (() => {
    const rects = api(`ROOM_LAYOUT['${roomId}']`);
    const outside = places.filter(p => !rects.some(([x, y, w, h]) =>
      p.x >= x - 1 && p.y >= y - 1 && p.x + p.w <= x + w + 1 && p.y + p.h <= y + h + 1));
    return outside.length === 0 || outside.map(p => p.shape).join(', ');
  })() === true, 'furniture through a wall');
  check(`${roomId}: every gate names a real facility`,
        places.every(p => !p.requires || api(`!!FACILITY_DEFS['${p.requires?.facility}']`)));
}
check('a designed room replaces auto-placement rather than adding to it',
      /renderAuthoredDecor\(gs, roomId\)[\s\S]{0,200}?if \(authored !== null\) return authored/
        .test(fs.readFileSync(path.join(SRC, 'render.js'), 'utf8')),
      'a room is designed or auto-arranged, never a confusing half of each');

console.log('\n   upgrade gating');
check('an ungated placement always shows', api(`decorVisible({ shape: 'rug' }, {})`));
check('a gate on an unknown facility FAILS CLOSED',
      api(`decorVisible({ requires: { facility: 'nope', minTier: 'functional' } }, { world: { upgrades: {} } })`) === false,
      'a gate that cannot be evaluated is not a gate');
check('minTier hides the piece below that tier',
      api(`!decorVisible({ requires: { facility: 'pool_systems', minTier: 'functional' } },
                         { world: { upgrades: { pool_systems: { tier: 'broken' } } } })`));
check('...and shows it at or above',
      api(`decorVisible({ requires: { facility: 'pool_systems', minTier: 'functional' } },
                        { world: { upgrades: { pool_systems: { tier: 'upgraded' } } } })`));
check('maxTier is the mirror of it',
      api(`decorVisible({ requires: { facility: 'pool_systems', maxTier: 'broken' } },
                        { world: { upgrades: { pool_systems: { tier: 'broken' } } } })`)
      && api(`!decorVisible({ requires: { facility: 'pool_systems', maxTier: 'broken' } },
                             { world: { upgrades: { pool_systems: { tier: 'functional' } } } })`));
// The pool is the worked example: one design, two states, never both.
check('the pool room shows exactly one basin at every tier', api(`
  (() => {
    const pool = ROOM_DECOR.pool_room.filter(p => p.shape === 'pool');
    if (pool.length !== 2) return false;
    for (const tier of ['broken', 'functional', 'upgraded']) {
      const gs = { world: { upgrades: { pool_systems: { tier } } } };
      if (pool.filter(p => decorVisible(p, gs)).length !== 1) return false;
    }
    return true;
  })()
`), 'a dry basin and a filled one on the same footprint must never both draw');
check('the two pool states occupy the identical footprint', api(`
  (() => {
    const [a, b] = ROOM_DECOR.pool_room.filter(p => p.shape === 'pool');
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  })()
`), 'renovation should fill the hole, not move it');

console.log('\n   the studio stays in sync with the game');
const designerSrc = fs.readFileSync(path.join(SRC, '..', '..', 'dev', 'designer.html'), 'utf8');
check('dev/designer.html carries every shape the game knows',
      shapeIds.every(id => new RegExp(`"${id}"\\s*:`).test(designerSrc)),
      shapeIds.filter(id => !new RegExp(`"${id}"\\s*:`).test(designerSrc)).join(', ')
      + ' — run `node dev/sync-designer.js`');
check('the studio mirrors the same gate rule as the game',
      /function gatePasses/.test(designerSrc) && /minTier/.test(designerSrc) && /maxTier/.test(designerSrc));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
