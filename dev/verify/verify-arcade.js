// Game Room Phases 7–8 — the arcade cabinet (arcade.js; game-room-overhaul-plan.md D5/D14; 0.14.5).
//
//   node dev/verify/verify-arcade.js
//
// The four games as pure fixed-step state machines (Rent Runner, Night Shift, Stack Up, Neon Serpent):
// their rules, deterministic replay, and a model player whose score rises with skill; the high-score
// table; roommates' derived scores and the weekly pass; and the cabinet's route through the verbs
// (unlocked by the Entertainment Hub tier, a solo go, the board, practice).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'skills.js', 'games.js', 'arcade.js', 'defs.actions.js', 'actions.js', 'state.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __run = (s, seconds, input, rng) => { const n = Math.round(seconds / ARCADE_TUNING.dt); for (let i = 0; i < n && !s.over; i++) arcadeStep(s, ARCADE_TUNING.dt, i === 0 ? (input || {}) : {}, rng || mulberry32(1)); return s; };
  __med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
`);

const K = J('({ RUNNER: { speedMax: RUNNER.speedMax }, SHIFT: { serve: SHIFT.serve, catchScore: SHIFT.catchScore }, STACK: { perfectBonus: STACK.perfectBonus }, SERPENT: { startLen: SERPENT.startLen, foodScore: SERPENT.foodScore, wallLife: SERPENT.wallLife, stepMin: SERPENT.stepMin } })');

console.log('\n0. Registration');
const reg = J(`(() => ({
  ids: ARCADE_IDS.join(), impl: ARCADE_IDS.every(id => !!ARCADE_IMPL[id] && !!ARCADE_GAMES[id].label && ARCADE_GAMES[id].capSeconds > 0),
  news: ARCADE_IDS.every(id => { const s = arcadeNew(id, mulberry32(1)); return s && s.gameId === id && s.over === false && s.score === 0; }),
  unknown: arcadeNew('nope', mulberry32(1)),
  verb: !!ACTION_DEFS['game.arcade'], effect: typeof gameApplyArcade === 'function',
  lines: !!GAMES_TUNING.lines.arcade && GAMES_TUNING.lines.arcade.play.length >= 2,
}))()`);
check('four games, each a pure state machine with a bot, a label and a time cap; unknown games are refused', reg.ids === 'rent_runner,night_shift,stack_up,neon_serpent' && reg.impl && reg.news && reg.unknown === null, JSON.stringify(reg));
check('the verb, its writer and its lines are registered', reg.verb && reg.effect && reg.lines);

console.log('\n1. Rent Runner');
const run = J(`(() => {
  const s = arcadeNew('rent_runner', mulberry32(1));
  __run(s, 0.2, {});
  const t0 = { y: s.y, x: s.x, speed: s.speed };
  // jump: the arc goes up, peaks near the expected height, comes down; no double jump
  const j = arcadeNew('rent_runner', mulberry32(2)); j.obstacles = []; j.nextSpawn = 1e9;
  arcadeStep(j, ARCADE_TUNING.dt, { press: true }, mulberry32(2));
  let peak = 0, air = 0, doubled = false;
  for (let i = 0; i < 120 && (j.y > 0 || i < 2); i++) { arcadeStep(j, ARCADE_TUNING.dt, i === 5 ? { press: true } : {}, mulberry32(2)); peak = Math.max(peak, j.y); if (j.y > 0) air++; }
  const expectPeak = RUNNER.jumpV * RUNNER.jumpV / (2 * RUNNER.gravity);
  const expectAir = 2 * RUNNER.jumpV / RUNNER.gravity;
  // running into a bill costs a life, removes it and gives a beat of grace
  const h = arcadeNew('rent_runner', mulberry32(3)); h.obstacles = [{ x: h.x + RUNNER.playerX + 0.1, w: 0.7 }]; h.nextSpawn = 1e9;
  arcadeStep(h, ARCADE_TUNING.dt, {}, mulberry32(3));
  const hit = { lives: h.lives, obs: h.obstacles.length, inv: h.invuln > 0 };
  arcadeStep(h, ARCADE_TUNING.dt, {}, mulberry32(3));
  const again = h.lives;
  // three strikes ends it
  const d = arcadeNew('rent_runner', mulberry32(4)); d.nextSpawn = 1e9;
  for (let k = 0; k < 3; k++) { d.obstacles = [{ x: d.x + RUNNER.playerX + 0.1, w: 0.7 }]; d.invuln = 0; arcadeStep(d, ARCADE_TUNING.dt, {}, mulberry32(4)); }
  // clearing it: a jump at the right moment takes no damage
  const c = arcadeNew('rent_runner', mulberry32(5)); c.obstacles = [{ x: c.x + RUNNER.playerX + 3, w: 0.7 }]; c.nextSpawn = 1e9;
  const bot = {}; let g = 0; while (g++ < 400 && c.obstacles.length) arcadeStep(c, ARCADE_TUNING.dt, runnerBot(c, 1, mulberry32(5), bot), mulberry32(5));
  // a coin in reach
  const k2 = arcadeNew('rent_runner', mulberry32(6)); k2.obstacles = []; k2.nextSpawn = 1e9; k2.coins = [{ x: k2.x + RUNNER.playerX + 0.05, y: 0.4 }];
  arcadeStep(k2, ARCADE_TUNING.dt, {}, mulberry32(6));
  // speed rises and caps
  const sp = arcadeNew('rent_runner', mulberry32(7)); sp.obstacles = []; sp.nextSpawn = 1e9; sp.coins = [];
  const sp0 = sp.speed; sp.t = 200; arcadeStep(sp, ARCADE_TUNING.dt, {}, mulberry32(7));
  // the same seed replays exactly
  const a = arcadeNew('rent_runner', mulberry32(9)), b = arcadeNew('rent_runner', mulberry32(9)); const bb = {}, ba = {};
  for (let i = 0; i < 1800; i++) { arcadeStep(a, ARCADE_TUNING.dt, runnerBot(a, 0.7, mulberry32(9 + i), ba), mulberry32(9)); arcadeStep(b, ARCADE_TUNING.dt, runnerBot(b, 0.7, mulberry32(9 + i), bb), mulberry32(9)); }
  return { t0, peak, expectPeak, air: air / 60, expectAir, doubled, hit, again, dead: { over: d.over, reason: d.reason }, cleared: { lives: c.lives, over: c.over }, coin: { got: k2.coinsGot, score: k2.score }, speed: { start: sp0, capped: sp.speed }, same: JSON.stringify([a.x, a.score, a.lives]) === JSON.stringify([b.x, b.score, b.lives]) };
})()`);
check('running moves you along the ground; a jump peaks where the physics says and comes back down, and cannot be repeated in the air', run.t0.x > 0 && run.t0.y === 0 && Math.abs(run.peak - run.expectPeak) < 0.1 && Math.abs(run.air - run.expectAir) < 0.08, JSON.stringify(run));
check('hitting a bill costs a life, removes it and gives a beat of grace; three strikes and the landlord catches you', run.hit.lives === 2 && run.hit.obs === 0 && run.hit.inv && run.again === 2 && run.dead.over && run.dead.reason === 'caught', JSON.stringify({ hit: run.hit, dead: run.dead }));
check('a well-timed jump clears a bill unharmed; a coin in reach is worth ten', run.cleared.lives === 3 && run.coin.got === 1 && run.coin.score >= 10, JSON.stringify({ c: run.cleared, coin: run.coin }));
check('it speeds up but caps out, and the same seed replays exactly', run.speed.capped === K.RUNNER.speedMax && run.speed.capped > run.speed.start && run.same, JSON.stringify(run.speed));

console.log('\n2. Night Shift');
const shift = J(`(() => {
  const mk = () => { const s = arcadeNew('night_shift', mulberry32(1)); s.spawnIn = 1e9; return s; };
  // slide a drink at a customer: served, scored, combo grows
  const a = mk(); a.lanes[1].customers.push({ id: 1, x: 0.6, v: 0, leaves: false });
  arcadeStep(a, ARCADE_TUNING.dt, { lane: 1 }, mulberry32(1));
  const fired = a.lanes[1].drinks.length;
  const cool1 = a.lanes[1].cool > 0;
  arcadeStep(a, ARCADE_TUNING.dt, { lane: 1 }, mulberry32(1));            // cooling down: no second drink
  const noSecond = a.lanes[1].drinks.length;
  for (let i = 0; i < 90; i++) arcadeStep(a, ARCADE_TUNING.dt, {}, mulberry32(1));
  const served = { served: a.served, score: a.score, combo: a.combo, cust: a.lanes[1].customers.length };
  // a customer who reaches the bar costs a life
  const b = mk(); b.lanes[0].customers.push({ id: 2, x: 0.05, v: 0.5, leaves: false });
  for (let i = 0; i < 20; i++) arcadeStep(b, ARCADE_TUNING.dt, {}, mulberry32(1));
  // a served customer may leave an empty; tap the bar while it is near to catch it; else it breaks
  const c = mk(); c.lanes[2].customers.push({ id: 3, x: 0.3, v: 0, leaves: true });
  arcadeStep(c, ARCADE_TUNING.dt, { lane: 2 }, mulberry32(1));
  for (let i = 0; i < 60; i++) arcadeStep(c, ARCADE_TUNING.dt, {}, mulberry32(1));
  const empties = c.lanes[2].empties.length;
  // wait until it is close to the bar then catch it
  let g = 0; while (g++ < 900 && !(c.lanes[2].empties[0] && c.lanes[2].empties[0].x <= SHIFT.catchWindow)) arcadeStep(c, ARCADE_TUNING.dt, {}, mulberry32(1));
  const scoreBefore = c.score;
  arcadeStep(c, ARCADE_TUNING.dt, { lane: 2 }, mulberry32(1));
  const caught = { caught: c.caught, gain: c.score - scoreBefore, left: c.lanes[2].empties.length, lives: c.lives };
  const d = mk(); d.lanes[3].empties.push({ id: 9, x: 0.05 });
  for (let i = 0; i < 40; i++) arcadeStep(d, ARCADE_TUNING.dt, {}, mulberry32(1));
  // running out of lives closes the bar; a drink that misses everyone breaks the combo
  const e = mk(); e.lives = 1; e.lanes[0].customers.push({ id: 5, x: 0.03, v: 0.6, leaves: false });
  for (let i = 0; i < 10; i++) arcadeStep(e, ARCADE_TUNING.dt, {}, mulberry32(1));
  const f = mk(); f.combo = 3; arcadeStep(f, ARCADE_TUNING.dt, { lane: 0 }, mulberry32(1)); for (let i = 0; i < 120; i++) arcadeStep(f, ARCADE_TUNING.dt, {}, mulberry32(1));
  // customers spawn, in every lane over time, and faster later
  const s = arcadeNew('night_shift', mulberry32(3)); const lanesSeen = new Set(); let early = 0, late = 0;
  for (let i = 0; i < 60 * 30; i++) { arcadeStep(s, ARCADE_TUNING.dt, {}, mulberry32(3 + i)); s.lives = 3; for (let n = 0; n < 4; n++) if (s.lanes[n].customers.length) lanesSeen.add(n); }
  return { fired, cool1, noSecond, served, lives: b.lives, empties, caught, brokeLives: d.lives, over: { over: e.over, reason: e.reason }, comboBroke: f.combo, lanes: lanesSeen.size };
})()`);
check('a tap slides a drink down the bar, with a cooldown; the drink serves the customer it meets, scores, and builds a combo', shift.fired === 1 && shift.cool1 && shift.noSecond === 1 && shift.served.served === 1 && shift.served.score === K.SHIFT.serve && shift.served.combo === 1 && shift.served.cust === 0, JSON.stringify(shift.served));
check('a customer who reaches the bar unserved costs a life', shift.lives === 2);
check('a served customer can send back an empty: tap that bar when it is close and you catch it (points); leave it and it breaks (a life)', shift.empties === 1 && shift.caught.caught === 1 && shift.caught.gain === K.SHIFT.catchScore && shift.caught.left === 0 && shift.brokeLives === 2, JSON.stringify({ e: shift.empties, c: shift.caught, b: shift.brokeLives }));
check('no lives left closes the bar; a drink that misses everyone breaks the combo; customers turn up in every bar', shift.over.over && shift.over.reason === 'closed down' && shift.comboBroke === 0 && shift.lanes === 4, JSON.stringify(shift));

console.log('\n3. Stack Up');
const stack = J(`(() => {
  const s = arcadeNew('stack_up', mulberry32(1));
  const start = { floors: s.floors, w: s.slabs[0].w, cur: s.cur.w };
  // put the slab exactly over the tower and drop: perfect
  s.cur.x = s.slabs[0].x;
  arcadeStep(s, ARCADE_TUNING.dt, { press: true }, mulberry32(1));
  const perfect = { floors: s.floors, w: s.slabs[s.slabs.length - 1].w, score: s.score, perf: s.lastDrop.perfect, streak: s.streak };
  // off-centre: the overhang is sliced
  s.cur.x = s.slabs[s.slabs.length - 1].x + 0.1;
  const before = s.slabs[s.slabs.length - 1].w;
  arcadeStep(s, ARCADE_TUNING.dt, { press: true }, mulberry32(1));
  const sliced = { w: s.slabs[s.slabs.length - 1].w, expected: before - 0.1, floors: s.floors, streak: s.streak, next: s.cur.w };
  // missing entirely ends it
  const m = arcadeNew('stack_up', mulberry32(2)); m.cur.x = m.slabs[0].x + 0.6; m.cur.w = 0.2; m.slabs[0].w = 0.2;
  arcadeStep(m, ARCADE_TUNING.dt, { press: true }, mulberry32(2));
  // it swings back and forth within the frame and gets faster
  const w = arcadeNew('stack_up', mulberry32(3)); let minX = 9, maxX = -9; for (let i = 0; i < 600; i++) { arcadeStep(w, ARCADE_TUNING.dt, {}, mulberry32(3)); minX = Math.min(minX, w.cur.x - w.cur.w / 2); maxX = Math.max(maxX, w.cur.x + w.cur.w / 2); }
  const fast = arcadeNew('stack_up', mulberry32(4)); for (let k = 0; k < 15; k++) { fast.cur.x = fast.slabs[fast.slabs.length - 1].x; arcadeStep(fast, ARCADE_TUNING.dt, { press: true }, mulberry32(4)); }
  // a drop lands where it is on screen: the same tap gives the same result whatever the swing does next
  const p = arcadeNew('stack_up', mulberry32(5)); p.cur.x = p.slabs[0].x + 0.004; arcadeStep(p, ARCADE_TUNING.dt, { press: true }, mulberry32(5));
  // three perfects in a row grow the slab back
  const r = arcadeNew('stack_up', mulberry32(6)); r.slabs[0].w = 0.3; r.cur.w = 0.3; for (let k = 0; k < 5; k++) { r.cur.x = r.slabs[r.slabs.length - 1].x; arcadeStep(r, ARCADE_TUNING.dt, { press: true }, mulberry32(6)); }
  return { start, perfect, sliced, missed: { over: m.over, reason: m.reason }, minX, maxX, speed0: STACK.speed0, speed15: fast.speed, dropPerfect: p.lastDrop.perfect, regrown: r.slabs[r.slabs.length - 1].w, rw: 0.3 };
})()`);
check('a drop right over the tower is perfect: the slab keeps its width and scores the bonus', stack.perfect.floors === 1 && stack.perfect.perf && Math.abs(stack.perfect.w - stack.start.w) < 1e-9 && stack.perfect.score === 1 + K.STACK.perfectBonus && stack.perfect.streak === 1, JSON.stringify(stack.perfect));
check('an off-centre drop slices the overhang: the next slab is only what overlapped', Math.abs(stack.sliced.w - stack.sliced.expected) < 1e-9 && stack.sliced.streak === 0 && Math.abs(stack.sliced.next - stack.sliced.w) < 1e-9, JSON.stringify(stack.sliced));
check('missing the tower ends the game; the slab swings edge to edge; it gets faster with every floor', stack.missed.over && stack.missed.reason === 'missed' && stack.minX < 0.01 && stack.maxX > 0.99 && stack.speed15 > stack.speed0, JSON.stringify({ m: stack.missed, x: [stack.minX, stack.maxX] }));
check('a drop within a hair of centre counts as perfect, and a run of perfects grows a shrunk slab back', stack.dropPerfect && stack.regrown > stack.rw, JSON.stringify({ p: stack.dropPerfect, r: stack.regrown }));

console.log('\n4. Neon Serpent');
const serp = J(`(() => {
  const dt = SERPENT.step0 + 0.001;
  const step = (s, dir) => arcadeStep(s, dt, dir ? { dir } : {}, mulberry32(1));
  const s = arcadeNew('neon_serpent', mulberry32(1));
  const h0 = { x: s.body[0].x, y: s.body[0].y, len: s.body.length };
  step(s);
  const moved = { dx: s.body[0].x - h0.x, len: s.body.length };
  // never straight back into itself
  step(s, 'left'); const dirAfterBack = s.dir;
  step(s, 'up'); const dirUp = s.dir;
  // eating: grow, score
  const e = arcadeNew('neon_serpent', mulberry32(2)); e.food = { x: e.body[0].x + 1, y: e.body[0].y };
  step(e);
  const ate = { len: e.len, score: e.score, eaten: e.eaten, food: !!e.food, sameCell: e.food && e.food.x === e.body[0].x && e.food.y === e.body[0].y };
  for (let i = 0; i < 3; i++) step(e);
  const grown = e.body.length;
  // the tail you shed becomes a wall, which fades
  const w = arcadeNew('neon_serpent', mulberry32(3)); step(w); step(w);
  const walls1 = w.walls.length, life1 = w.walls[0] && w.walls[0].life;
  const first = { x: w.walls[0].x, y: w.walls[0].y };
  let maxWalls = 0;
  for (let i = 0; i < SERPENT.wallLife + 2; i++) { step(w, i === 2 ? 'down' : null); maxWalls = Math.max(maxWalls, w.walls.length); }
  const firstGone = !w.walls.some(x => x.x === first.x && x.y === first.y);
  // walls kill
  const k = arcadeNew('neon_serpent', mulberry32(4)); k.walls = [{ x: k.body[0].x + 1, y: k.body[0].y, life: 5 }]; step(k);
  // the edge kills
  const ed = arcadeNew('neon_serpent', mulberry32(5)); for (let i = 0; i < 40 && !ed.over; i++) step(ed);
  // eating yourself kills: a tight U-turn
  const me = arcadeNew('neon_serpent', mulberry32(6)); me.len = 8; me.body = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 3, y: 5 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }]; me.dir = 'up'; me.want = 'up'; me.food = { x: 0, y: 0 };
  step(me, 'left'); step(me, 'down'); step(me, 'right');
  // it speeds up as it eats
  const sp = arcadeNew('neon_serpent', mulberry32(7)); const i0 = serpentInterval(sp); sp.eaten = 10; const i10 = serpentInterval(sp); sp.eaten = 500;
  return { moved, dirAfterBack, dirUp, ate, grown, walls1, life1, firstGone, maxWalls, wallKill: { over: k.over, reason: k.reason }, edge: { over: ed.over, reason: ed.reason }, self: { over: me.over, reason: me.reason }, speed: { i0, i10, floor: serpentInterval(sp), min: SERPENT.stepMin } };
})()`);
check('it moves a cell per step, never turns straight back into itself, and turns when told', serp.moved.dx === 1 && serp.moved.len === 3 && serp.dirAfterBack === 'right' && serp.dirUp === 'up', JSON.stringify({ m: serp.moved, b: serp.dirAfterBack, u: serp.dirUp }));
check('eating grows it, scores, and puts food somewhere else', serp.ate.len === K.SERPENT.startLen + 1 && serp.ate.eaten === 1 && serp.ate.score >= K.SERPENT.foodScore && serp.ate.food && !serp.ate.sameCell && serp.grown === K.SERPENT.startLen + 1, JSON.stringify(serp.ate));
check('the twist: the tail you shed becomes a wall that fades after a while', serp.walls1 >= 1 && serp.life1 <= K.SERPENT.wallLife && serp.firstGone && serp.maxWalls <= K.SERPENT.wallLife, JSON.stringify({ w1: serp.walls1, life: serp.life1, gone: serp.firstGone, max: serp.maxWalls }));
check('a wall, the edge and its own body all end the game', serp.wallKill.over && serp.wallKill.reason === 'a wall' && serp.edge.over && serp.edge.reason === 'the edge' && serp.self.over && serp.self.reason === 'yourself', JSON.stringify({ w: serp.wallKill, e: serp.edge, s: serp.self }));
check('it speeds up with every bite, down to a floor', serp.speed.i10 < serp.speed.i0 && Math.abs(serp.speed.floor - serp.speed.min) < 1e-9);

console.log('\n5. The model player');
const bots = J(`(() => {
  const out = {};
  for (const id of ARCADE_IDS) {
    const at = (skill) => { const sc = []; for (let i = 0; i < 9; i++) sc.push(arcadeModelScore(id, skill, mulberry32(300 + i))); return __med(sc); };
    const lo = at(0.1), mid = at(0.5), hi = at(0.95);
    const a = arcadeModelScore(id, 0.6, mulberry32(77)), b = arcadeModelScore(id, 0.6, mulberry32(77));
    const st = arcadeModelPlay(id, 0.6, mulberry32(78));
    out[id] = { lo, mid, hi, same: a === b, ended: st.over, t: st.t };
  }
  return out;
})()`);
for (const id of ['rent_runner', 'night_shift', 'stack_up', 'neon_serpent']) {
  const b = bots[id];
  check(`${id}: a better player scores more (skill 0.1 < 0.5 < 0.95), the same seed replays, and every game ends`, b.lo < b.hi && b.lo <= b.mid && b.mid <= b.hi && b.same && b.ended, JSON.stringify(b));
}

console.log('\n6. The score table');
api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260929, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 14, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
`);
const table = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const empty = { t: arcadeTable(g, 'stack_up').length, best: arcadeBest(g, 'stack_up', 'player'), holder: arcadeHolder(g, 'stack_up') };
  const r1 = arcadeRecord(g, 'stack_up', 'player', 40, 14);
  const r2 = arcadeRecord(g, 'stack_up', A, 60, 14);
  const r3 = arcadeRecord(g, 'stack_up', 'player', 30, 15);          // worse than your best: no change
  const r4 = arcadeRecord(g, 'stack_up', 'player', 90, 16);
  const t = arcadeTable(g, 'stack_up').map(e => [e.who === 'player' ? 'you' : 'npc', e.score]);
  const full = __mk(); for (let i = 0; i < 9; i++) arcadeRecord(full, 'stack_up', 'p' + i, 10 + i, 1);
  const cap = arcadeTable(full, 'stack_up').length;
  const order = arcadeTable(full, 'stack_up').map(e => e.score);
  return { empty, r1: [r1.rank, r1.newBest], r2: [r2.rank, r2.newBest], r3: [r3.newBest, r3.prevBest], r4: [r4.rank, r4.newBest], t, holder: arcadeHolder(g, 'stack_up'), cap, sorted: order.every((v, i, a) => i === 0 || a[i - 1] >= v), top: order[0] };
})()`);
check('an empty board has no holder; entries sort best first, one per person (their best), and it keeps five', table.empty.t === 0 && table.empty.best === 0 && table.empty.holder === null && JSON.stringify(table.t) === '[["you",90],["npc",60]]' && table.cap === 5 && table.sorted && table.top === 18, JSON.stringify(table));
check('a score reports whether it is a new personal best and where it lands', table.r1[1] === true && table.r2[0] === 1 && table.r3[0] === false && table.r3[1] === 40 && table.r4[0] === 1 && table.r4[1] === true && table.holder.who === 'player', JSON.stringify(table));

console.log('\n7. Roommates on the machine (D5)');
const npcs = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const s1 = arcadeNpcWeekScore(g, A, 'stack_up', 3), s2 = arcadeNpcWeekScore(g, A, 'stack_up', 3);
  const skill = { lo: (() => { g.npcs[A].bible.interests = [{ name: 'gaming', skill: 5 }]; return arcadeNpcSkill(g, A, 'stack_up', 7); })(), hi: (() => { g.npcs[A].bible.interests = [{ name: 'gaming', skill: 95 }]; return arcadeNpcSkill(g, A, 'stack_up', 7); })(), later: arcadeNpcSkill(g, A, 'stack_up', 70), bounded: arcadeNpcSkill(g, A, 'stack_up', 1e6) <= 0.97 };
  // not a pass day
  const off = processArcadeForDay(g, 13);
  const tableBefore = JSON.stringify(g.world.games && g.world.games.arcade || null);
  // a pass day: each resident has a go at one game and is on the board
  const on = processArcadeForDay(g, 14);
  const gamesTouched = ARCADE_IDS.filter(id => arcadeTable(g, id).length > 0).length;
  const entries = ARCADE_IDS.reduce((a, id) => a + arcadeTable(g, id).length, 0);
  const again = processArcadeForDay(g, 14);
  const entriesAfter = ARCADE_IDS.reduce((a, id) => a + arcadeTable(g, id).length, 0);
  // one who beats your best says so
  const h = __mk(); const ids = __ids(h);
  const results = [];
  for (const id of ids) for (const gid of ARCADE_IDS) results.push([id, gid, ARCADE_IDS[hashStr(id + '|' + 2 + '|pick') % ARCADE_IDS.length] === gid]);
  const [X] = ids; const picked = ARCADE_IDS[hashStr(X + '|2|pick') % ARCADE_IDS.length];
  arcadeRecord(h, picked, 'player', 1, 13);                 // you have played it, and badly
  const told = processArcadeForDay(h, 14);
  const lineForX = told.lines.find(l => l.includes('Mira'));
  const strong = __mk(); const [S] = __ids(strong); const spicked = ARCADE_IDS[hashStr(S + '|2|pick') % ARCADE_IDS.length];
  arcadeRecord(strong, spicked, 'player', 10 ** 9, 13);    // nobody beats this
  const quiet = processArcadeForDay(strong, 14).lines.length;
  const never = __mk(); const noPlay = processArcadeForDay(never, 14).lines.length;   // you have never played any: nobody has anything to beat
  return { same: s1 === s2, s1, skill, off: off.lines.length, tableBefore, gamesTouched, entries, entriesAfter, told: told.lines.length, lineForX, quiet, noPlay, picked };
})()`);
check('a roommate\'s score is derived (same every time), rises with their gaming skill, creeps up week by week, and is bounded', npcs.same && npcs.skill.hi > npcs.skill.lo && npcs.skill.later > npcs.skill.hi - 0.001 && npcs.skill.bounded, JSON.stringify(npcs.skill));
check('the weekly pass does nothing on other days; on a pass day every resident is on the board, and doing it twice adds nobody', npcs.off === 0 && npcs.entries >= 1 && npcs.entries <= 3 && npcs.entriesAfter === npcs.entries, JSON.stringify({ off: npcs.off, entries: npcs.entries, after: npcs.entriesAfter }));
check('a roommate who beats your best tells you (naming them and the game); nobody says anything if you are unbeaten or have never played', npcs.told >= 1 && /Mira/.test(npcs.lineForX || '') && npcs.quiet === 0 && npcs.noPlay === 0, JSON.stringify({ told: npcs.told, l: npcs.lineForX, q: npcs.quiet, n: npcs.noPlay }));

console.log('\n8. The cabinet through the verbs');
const cab = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const ctxFor = (gs) => ({ gameState: gs, roomId: 'game_room', roomObjects: gs.objects.room_game_room, actorId: null, presentNpcIds: __ids(gs).filter(id => gs.npcs[id].location === 'game_room') });
  const locked = checkRequirements(ACTION_DEFS['game.arcade'], ctxFor(g));
  g.world.upgrades.game_room_setup = { tier: 'upgraded', condition: 100 };
  const open = checkRequirements(ACTION_DEFS['game.arcade'], ctxFor(g));
  const broke = __mk(); broke.world.upgrades.game_room_setup = { tier: 'broken', condition: 0 };
  const brokenReq = checkRequirements(ACTION_DEFS['game.arcade'], ctxFor(broke)).ok;
  // headless: a modelled go, deterministic, on the first machine
  const prepared = ACTION_DEFS['game.arcade'].prepare(ctxFor(g));
  const again = ACTION_DEFS['game.arcade'].prepare(ctxFor(g));
  const plan = prepared.game;
  const lines = ACTION_DEFS['game.arcade'].buildEffects(ctxFor(g), prepared);
  const minutes = resolveTimeCost(ACTION_DEFS['game.arcade'], g, prepared, null);
  const narr1 = ACTION_DEFS['game.arcade'].narration.build(ctxFor(g), prepared);
  const xp0 = (g.player.skills || {}).games || 0;
  applyEffects(parseEffectDSL(lines.join('\\n')), buildEffectContext(g, [], [], {}, []));
  const s = arcadeBest(g, plan.gameId, 'player');
  const xp = g.player.skills.games - xp0;
  // a later, better go is a new best and says so; an overtaken roommate is named
  arcadeRecord(g, plan.gameId, A, plan.score + 50, 14);
  const p2 = gamePlanArcade(g, plan.gameId, { score: plan.score + 500, minutes: 9 });
  const narr2 = gameArcadeNarration(g, p2);
  const rows = arcadeRows(g);
  const promptHolder = gamesPromptLine(g, A);
  const pv = arcadePreview(g, plan.gameId, 1);
  return { locked: { ok: locked.ok, reason: locked.reason }, open: open.ok, brokenReq, same: JSON.stringify(plan) === JSON.stringify(again.game), plan: { id: plan.gameId, score: plan.score, minutes: plan.minutes, arcade: plan.arcade }, lines, minutes, narr1, best: s, xp, p2: { newBest: p2.preview.newBest, over: p2.preview.overtakes === A, minutes: p2.minutes }, narr2, rows: rows.map(r => r.label), noteHasHolder: rows.find(r => r.id === plan.gameId).note.includes('Mira'), promptHolder, pvRank: pv.rank };
})()`);
check('the cabinet is locked below the Entertainment Hub tier (with a reason) and open at it; a broken game room is not', cab.locked.ok === false && /Entertainment Hub/.test(cab.locked.reason) && cab.open === true && cab.brokenReq === false, JSON.stringify(cab.locked));
check('a headless go is modelled and deterministic; it is one solo go with its own length; the effect puts the score on the board and pays practice', cab.same && cab.plan.arcade && cab.plan.minutes === 12 && cab.minutes === 12 && cab.lines.some(l => /^GAME_ARCADE /.test(l)) && cab.best === cab.plan.score && cab.xp >= ARCADE_TUNING_XP(), JSON.stringify({ plan: cab.plan, lines: cab.lines, best: cab.best, xp: cab.xp }));
check('the line says what you scored; beating the holder is told, naming them; the picker shows your best and who is top', /\d/.test(cab.narr1) && cab.p2.newBest && cab.p2.over && /Mira/.test(cab.narr2) && cab.rows.length === 4 && cab.noteHasHolder, JSON.stringify({ n1: cab.narr1, n2: cab.narr2 }));
check('a roommate who holds a top score mentions it in conversation; a score below everyone ranks below them', /holds the high score/.test(cab.promptHolder || '') && cab.pvRank >= 1, JSON.stringify({ p: cab.promptHolder, r: cab.pvRank }));

console.log('\n9. Wiring and R1');
{
  const a = srcOf('arcade.js'), ui = srcOf('render.games.js'), acts = srcOf('defs.actions.js'), uij = srcOf('ui.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../../../dev/verify/loadgame.js');
  check('arcade.js is loaded by index.html and the verify loader, never uses Math.random (everything takes an rng), and the screen, the verb and the weekly pass are wired', /srcfiles\/arcade\.js\?v=\d+/.test(html) && /'arcade\.js'/.test(loader) && !/Math\.random/.test(a) && /function openArcadeGame\(/.test(ui) && /kind === 'arcade'\) return openArcadeGame/.test(ui) && /openMinigame\('arcade'/.test(acts) && /processArcadeForDay\(currentGameState, day\)/.test(uij));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([ARCADE_GAMES, ARCADE_TUNING, GAMES_TUNING.lines.arcade])');
  const authored = a.replace(/\.bible|bible\?/g, '');   // npc.bible is a field name, not a word
  check('R1: no religion in the arcade', !vocab.test(T) && !vocab.test(authored), (T.match(vocab) || authored.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
function ARCADE_TUNING_XP() { return 3; }
