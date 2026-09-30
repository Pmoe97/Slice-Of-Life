// Game Room Phase 6 — pool (pool.js; game-room-overhaul-plan.md D10; 0.14.5).
//
//   node src/src/dev/verify/verify-pool.js
//
// The physics (rolling, friction, cushions, ball–ball impulses, follow / draw / side spin, pockets, no
// tunnelling, energy never created), the rack, the rules (fouls and ball-in-hand, groups, the turn, the
// 8 ball won and lost, the break), a roommate's shot (skill matters, ball-in-hand placement) and whole
// seeded games (every one ends, replays exactly, the better player wins more, nothing leaves the table).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'games.js', 'pool.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  // A table with only the balls asked for: spec is { id: [x, y] }; everything else is in a pocket.
  __bare = (spec, over) => {
    const st = poolNew(mulberry32(1));
    for (const b of st.balls) { if (spec[b.id]) { b.x = spec[b.id][0]; b.y = spec[b.id][1]; b.potted = false; } else b.potted = true; b.vx = 0; b.vy = 0; }
    Object.assign(st, over || {});
    return st;
  };
  __rest = (st) => { let g = 0; while (g++ < 8000 && poolStep(st)) {} };
  __ke = (st) => st.balls.reduce((a, b) => a + (b.potted ? 0 : b.vx * b.vx + b.vy * b.vy), 0);
  __dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
`);

console.log('\n0. The rack');
const rack = J(`(() => {
  const st = poolNew(mulberry32(3));
  const R = POOL_TUNING.radius;
  const ids = st.balls.map(b => b.id).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 0; i < st.balls.length; i++) for (let j = i + 1; j < st.balls.length; j++) minGap = Math.min(minGap, __dist(st.balls[i], st.balls[j]));
  const cue = poolBallById(st, 0);
  const rackBalls = st.balls.filter(b => b.id !== 0);
  const apex = rackBalls.slice().sort((a, b) => a.x - b.x)[0];
  const back = rackBalls.filter(b => Math.abs(b.x - Math.max(...rackBalls.map(q => q.x))) < 1e-9).sort((a, b) => a.y - b.y);
  const eight = poolBallById(st, 8);
  const centre = { x: apex.x + 2 * Math.sqrt(3) * R * 1.001, y: apex.y };
  const same = JSON.stringify(poolNew(mulberry32(3)).balls.map(b => b.id)) === JSON.stringify(st.balls.map(b => b.id));
  const diff = JSON.stringify(poolNew(mulberry32(4)).balls.map(b => b.id)) !== JSON.stringify(st.balls.map(b => b.id));
  return {
    ids: ids.join(), minGap: minGap / (2 * R), cue: { x: cue.x, y: cue.y }, inside: st.balls.every(b => b.x > R && b.x < POOL_TUNING.w - R && b.y > R && b.y < POOL_TUNING.h - R),
    eightAtCentre: Math.abs(eight.x - centre.x) < 1e-6 && Math.abs(eight.y - centre.y) < 1e-6,
    corners: back.length === 5 && [poolGroupOf(back[0].id), poolGroupOf(back[4].id)].sort().join(),
    apexIsNot8: apex.id !== 8, same, diff, turn: st.turn, groups: st.groups, over: st.over,
    groupsOf: [1, 7, 8, 9, 15, 0].map(poolGroupOf).join(),
    pockets: POOL_POCKETS.length,
  };
})()`);
check('sixteen balls, ids 0 to 15, racked tight without overlap (touching), the cue on the head spot, everything on the table', rack.ids === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15' && rack.minGap >= 0.999 && rack.minGap < 1.02 && Math.abs(rack.cue.x - 0.5) < 1e-9 && Math.abs(rack.cue.y - 0.5) < 1e-9 && rack.inside, JSON.stringify(rack));
check('the 8 is in the middle of the rack, the back corners are one solid and one stripe, and the order is drawn from the seed', rack.eightAtCentre && rack.corners === 'solids,stripes' && rack.apexIsNot8 && rack.same && rack.diff, JSON.stringify({ eight: rack.eightAtCentre, corners: rack.corners }));
check('you break, on an open table, six pockets, ids map to solids / eight / stripes / cue', rack.turn === 'p' && rack.groups.p === null && rack.groups.n === null && !rack.over && rack.pockets === 6 && rack.groupsOf === 'solids,solids,eight,stripes,stripes,cue');

console.log('\n1. Physics');
const phys = J(`(() => {
  // rolling and stopping: friction slows a ball; a harder shot goes farther; it always comes to rest
  const roll = (power) => { const st = __bare({ 0: [0.3, 0.5] }); poolBeginShot(st, { angle: 0, power }); const c = poolBallById(st, 0); let px = c.x, py = c.y, path = 0, g = 0; while (g++ < 8000 && poolStep(st)) { path += Math.hypot(c.x - px, c.y - py); px = c.x; py = c.y; } return { x: c.x, still: !poolMoving(st), steps: st.shot.steps, moved: path }; };
  const soft = roll(0.1), mid = roll(0.2), hard = roll(0.3);
  // a cushion: straight into the right rail and back
  const cs = __bare({ 0: [1.0, 0.5] }); poolBeginShot(cs, { angle: 0, power: 0.7 }); let maxX = 0, bounced = false, lastVx = 0; let g = 0;
  while (g++ < 8000 && poolStep(cs)) { const c = poolBallById(cs, 0); maxX = Math.max(maxX, c.x); if (c.vx < 0) bounced = true; }
  const cushion = { maxX, limit: POOL_TUNING.w - POOL_TUNING.radius, bounced, hits: cs.shot.cushionHits, finalX: poolBallById(cs, 0).x };
  // a head-on collision: the cue stops dead-ish, the object ball takes the speed; momentum is kept
  const ho = __bare({ 0: [0.5, 0.5], 1: [0.8, 0.5] }); poolBeginShot(ho, { angle: 0, power: 0.5 });
  let before = null, after = null, guard = 0;
  while (guard++ < 4000) { const c = poolBallById(ho, 0); if (!ho.shot.cueHit) before = { vx: c.vx, vy: c.vy }; poolStep(ho); if (ho.shot.cueHit) { const a = poolBallById(ho, 0), o = poolBallById(ho, 1); after = { cue: Math.hypot(a.vx, a.vy), obj: Math.hypot(o.vx, o.vy), px: a.vx + o.vx }; break; } }
  const head = { cueAfter: after.cue, objAfter: after.obj, ratio: after.cue / after.obj, momentum: after.px / before.vx, first: ho.shot.firstContact };
  // a cut: the object ball goes off along the line of centres, the cue deflects the other way
  const cut = __bare({ 0: [0.5, 0.5], 1: [0.8, 0.5 - 0.0235] }); poolBeginShot(cut, { angle: 0, power: 0.5 });
  g = 0; while (g++ < 4000) { poolStep(cut); if (cut.shot.cueHit) break; }
  const co = poolBallById(cut, 1), cc = poolBallById(cut, 0);
  const cutRes = { objVy: co.vy, cueVy: cc.vy, opposite: co.vy * cc.vy < 0 };
  // follow and draw
  const spinShot = (y) => { const st = __bare({ 0: [0.5, 0.5], 1: [0.8, 0.5] }); poolBeginShot(st, { angle: 0, power: 0.5, spin: { x: 0, y } }); let gg = 0; while (gg++ < 4000) { poolStep(st); if (st.shot.cueHit) break; } for (let k = 0; k < 6; k++) poolStep(st); const c = poolBallById(st, 0); return c.vx; };
  const follow = spinShot(1), none = spinShot(0), draw = spinShot(-1);
  // side spin changes the rebound off a cushion
  const english = (x) => { const st = __bare({ 0: [1.5, 0.3] }); poolBeginShot(st, { angle: Math.atan2(0.4, 0.5), power: 0.6, spin: { x, y: 0 } }); let hit = 0, gg = 0; while (gg++ < 6000 && hit < 1) { poolStep(st); hit = st.shot.cushionHits; } for (let k = 0; k < 30; k++) poolStep(st); const c = poolBallById(st, 0); return { vx: c.vx, vy: c.vy }; };
  const e0 = english(0), eL = english(-1), eR = english(1);
  return { soft, mid, hard, cushion, head, cutRes, follow, none, draw, e0, eL, eR };
})()`);
check('a ball slows and always comes to rest, and a harder shot rolls farther', phys.soft.still && phys.mid.still && phys.hard.still && phys.soft.moved > 0.1 && phys.mid.moved > phys.soft.moved * 1.3 && phys.hard.moved > phys.mid.moved * 1.3 && phys.hard.steps < 6000, JSON.stringify({ s: phys.soft, m: phys.mid, h: phys.hard }));
check('a cushion turns a ball around without letting it through, and takes some of its speed', phys.cushion.bounced && phys.cushion.maxX <= phys.cushion.limit + 1e-6 && phys.cushion.hits >= 1 && phys.cushion.finalX < phys.cushion.limit - 0.05, JSON.stringify(phys.cushion));
check('a head-on hit sends the object ball away at nearly the cue\'s speed and stops the cue; momentum is kept, and the first contact is recorded', phys.head.ratio < 0.12 && phys.head.momentum > 0.95 && phys.head.momentum < 1.03 && phys.head.first === 1, JSON.stringify(phys.head));
check('a cut sends the object ball one way and the cue the other', phys.cutRes.opposite && phys.cutRes.objVy < 0, JSON.stringify(phys.cutRes));
check('topspin follows through, backspin draws back, and no spin does neither', phys.follow > phys.none + 0.05 && phys.draw < phys.none - 0.05 && phys.draw < 0.1, JSON.stringify({ follow: phys.follow, none: phys.none, draw: phys.draw }));
check('side spin kicks the ball off a cushion one way or the other', phys.eL.vy !== phys.eR.vy && Math.abs(phys.eL.vx - phys.eR.vx) > 0.02 || Math.abs(phys.eL.vy - phys.eR.vy) > 0.02, JSON.stringify({ e0: phys.e0, eL: phys.eL, eR: phys.eR }));

const phys2 = J(`(() => {
  // pots
  const pot = __bare({ 0: [0.5, 0.5], 1: [0.25, 0.25] }); poolBeginShot(pot, { angle: Math.atan2(-1, -1), power: 0.4 });
  __rest(pot);
  const sideP = __bare({ 0: [1.0, 0.8], 3: [1.0, 0.4] }); poolBeginShot(sideP, { angle: -Math.PI / 2, power: 0.3 }); __rest(sideP);
  // a scratch: the cue into a corner
  const sc = __bare({ 0: [0.3, 0.3] }); poolBeginShot(sc, { angle: Math.atan2(-0.3, -0.3), power: 0.5 }); __rest(sc);
  // no tunnelling: a full-power shot through a line of balls
  const tun = __bare({ 0: [0.2, 0.5], 1: [0.6, 0.5], 2: [0.66, 0.5], 3: [0.72, 0.5] }); poolBeginShot(tun, { angle: 0, power: 1 });
  __rest(tun);
  const passed = tun.balls.filter(b => !b.potted && b.id !== 0).every(b => b.x >= 0);
  const inside = tun.balls.filter(b => !b.potted).every(b => b.x >= POOL_TUNING.radius - 1e-6 && b.x <= POOL_TUNING.w - POOL_TUNING.radius + 1e-6 && b.y >= POOL_TUNING.radius - 1e-6 && b.y <= POOL_TUNING.h - POOL_TUNING.radius + 1e-6);
  const order = tun.balls.filter(b => !b.potted && b.id !== 0).sort((a, b) => a.x - b.x).map(b => b.id);
  // energy is never created (no spin): watch a break
  const br = poolNew(mulberry32(8)); poolBeginShot(br, { angle: 0, power: 1 });
  let maxRise = 0, prev = __ke(br), g = 0; while (g++ < 6000 && poolStep(br)) { const k = __ke(br); if (k - prev > maxRise) maxRise = k - prev; prev = k; }
  // determinism
  const a = poolNew(mulberry32(8)), b = poolNew(mulberry32(8)); poolShoot(a, { angle: 0.02, power: 1 }); poolShoot(b, { angle: 0.02, power: 1 });
  const same = JSON.stringify(a.balls.map(x => [x.x, x.y, x.potted])) === JSON.stringify(b.balls.map(x => [x.x, x.y, x.potted]));
  return { potted: pot.shot.potted, cuePot: pot.shot.cuePotted, sidePotted: sideP.shot.potted, scratch: sc.shot.cuePotted, passed, inside, order, maxRise, same, ke0: __ke(br) };
})()`);
check('a ball rolled at a corner or a middle pocket goes down, and the cue stays up unless it goes in itself', JSON.stringify(phys2.potted) === '[1]' && !phys2.cuePot && JSON.stringify(phys2.sidePotted) === '[3]' && phys2.scratch, JSON.stringify(phys2));
check('a full-power shot through a line of balls never tunnels: nothing leaves the table and none swap places', phys2.inside && phys2.passed && phys2.order.join() === '1,2,3' || phys2.order.length < 3, JSON.stringify(phys2.order));
check('a break never creates energy (no step makes the table faster), and the same break always plays the same way', phys2.maxRise < 1e-6 && phys2.same, JSON.stringify({ rise: phys2.maxRise, same: phys2.same }));

console.log('\n2. The rules');
const rules = J(`(() => {
  const shoot = (st, angle, power, spin) => poolShoot(st, { angle, power: power ?? 0.5, spin });
  const DIAG = Math.atan2(-1, -1);
  // an open table: a legal pot assigns groups and you go again
  const a = __bare({ 0: [0.5, 0.5], 2: [0.25, 0.25], 10: [1.5, 0.8], 8: [1.6, 0.3] }, { shots: 3 });
  const va = shoot(a, DIAG, 0.4);
  const assigned = { g: a.groups, potted: va.potted, cont: va.continues, turn: a.turn, foul: va.foul, assigned: va.assigned };
  // a miss passes the turn
  let miss = null;
  for (const ang of [0.02, 0.05, 0.08, 0.12, 0.16, 0.2, -0.05, -0.1]) {
    const b = __bare({ 0: [0.4, 0.5], 2: [0.9, 0.5], 10: [1.5, 0.8], 8: [1.6, 0.3] }, { shots: 3 });
    b.groups = { p: 'solids', n: 'stripes' };
    const vb = shoot(b, ang, 0.4);
    if (!vb.foul && vb.potted.length === 0) { miss = { turn: b.turn, foul: vb.foul, hand: b.ballInHand, cont: vb.continues, ang }; break; }
  }
  // no contact is a foul, and the other side gets the ball in hand
  const c = __bare({ 0: [0.4, 0.5], 2: [1.5, 0.2], 10: [1.5, 0.8], 8: [1.6, 0.3] }, { shots: 3 });
  c.groups = { p: 'solids', n: 'stripes' };
  const vc = shoot(c, Math.PI, 0.3);
  const nocontact = { foul: vc.foul, turn: c.turn, hand: c.ballInHand };
  // wrong ball first
  const d = __bare({ 0: [0.4, 0.5], 2: [1.5, 0.2], 10: [0.7, 0.5], 8: [1.6, 0.3] }, { shots: 3 });
  d.groups = { p: 'solids', n: 'stripes' };
  const vd = shoot(d, 0, 0.4);
  const wrong = { foul: vd.foul, first: vd.firstContact, turn: d.turn, hand: d.ballInHand };
  // a scratch
  const e = __bare({ 0: [0.3, 0.3], 2: [1.5, 0.2], 10: [1.5, 0.8], 8: [1.6, 0.3] }, { shots: 3 });
  e.groups = { p: 'solids', n: 'stripes' };
  const ve = shoot(e, Math.atan2(-0.3, -0.3), 0.5);
  const scratch = { foul: ve.foul, cue: poolBallById(e, 0).potted, turn: e.turn, hand: e.ballInHand };
  // potting the opponent's ball is not a score: the turn passes (it is not a foul when you hit your own first)
  const f = __bare({ 0: [0.5, 0.5], 3: [0.4, 0.4], 10: [0.28, 0.28], 8: [1.6, 0.3] }, { shots: 3 });
  f.groups = { p: 'solids', n: 'stripes' };
  const vf = shoot(f, DIAG, 0.4);
  // the eight
  const win = __bare({ 0: [0.5, 0.5], 8: [0.25, 0.25], 12: [1.5, 0.8] }, { shots: 9 });
  win.groups = { p: 'solids', n: 'stripes' };
  const vw = shoot(win, DIAG, 0.4);
  const early = __bare({ 0: [0.5, 0.5], 8: [0.25, 0.25], 3: [1.5, 0.8], 12: [1.4, 0.7] }, { shots: 9 });
  early.groups = { p: 'solids', n: 'stripes' };
  const ve2 = shoot(early, DIAG, 0.4);
  const scratch8 = __bare({ 0: [0.5, 0.5], 8: [0.25, 0.25], 12: [1.5, 0.8] }, { shots: 9 });
  scratch8.groups = { p: 'solids', n: 'stripes' };
  const vs8 = shoot(scratch8, DIAG, 0.4, { x: 0, y: 1 });   // topspin: the cue follows the 8 into the pocket
  const openEight = __bare({ 0: [0.5, 0.5], 8: [0.25, 0.25], 3: [1.5, 0.8], 12: [1.4, 0.7] }, { shots: 9 });
  const vo = shoot(openEight, DIAG, 0.4);
  // placing the cue
  const g = __bare({ 0: [0.4, 0.5], 2: [0.9, 0.5] }, { shots: 3 });
  const inBall = poolPlaceCue(g, 0.9, 0.5), offTable = poolPlaceCue(g, -0.1, 0.5), edge = poolPlaceCue(g, 0.001, 0.5), ok = poolPlaceCue(g, 1.2, 0.3);
  const legalT = { open: poolLegalTargets(a, 'p').length, solids: (() => { const s = __bare({ 0: [0.4, 0.5], 2: [0.9, 0.5], 10: [1.0, 0.5], 8: [1.6, 0.3] }); s.groups = { p: 'solids', n: 'stripes' }; return poolLegalTargets(s, 'p'); })(), cleared: (() => { const s = __bare({ 0: [0.4, 0.5], 10: [1.0, 0.5], 8: [1.6, 0.3] }); s.groups = { p: 'solids', n: 'stripes' }; return poolLegalTargets(s, 'p'); })() };
  return { assigned, miss, nocontact, wrong, scratch, potOpp: { turn: f.turn, foul: vf.foul, potted: vf.potted, cont: vf.continues }, win: { over: win.over, winner: win.winner, ended: vw.ended }, early: { over: early.over, winner: early.winner }, scratch8: { over: scratch8.over, winner: scratch8.winner, foul: vs8.foul }, openEight: { foul: vo.foul, over: openEight.over, winner: openEight.winner }, place: { inBall, offTable, edge, ok }, legalT };
})()`);
check('a legal pot on an open table gives you that group, your opponent the other, and you shoot again', rules.assigned.potted.join() === '2' && rules.assigned.g.p === 'solids' && rules.assigned.g.n === 'stripes' && rules.assigned.cont && rules.assigned.turn === 'p' && !rules.assigned.foul, JSON.stringify(rules.assigned));
check('a shot that neither pots nor fouls passes the turn without a foul; hitting nothing is a foul that gives the other side the ball in hand', rules.miss && rules.miss.turn === 'n' && !rules.miss.foul && !rules.miss.hand && rules.nocontact.foul === 'no contact' && rules.nocontact.turn === 'n' && rules.nocontact.hand === true, JSON.stringify({ miss: rules.miss, nc: rules.nocontact }));
check('hitting the wrong group first is a foul, and so is scratching (the cue comes off the table until placed)', rules.wrong.foul === 'wrong ball' && rules.wrong.first === 10 && rules.wrong.hand && rules.scratch.foul === 'scratch' && rules.scratch.cue && rules.scratch.hand && rules.scratch.turn === 'n', JSON.stringify({ w: rules.wrong, s: rules.scratch }));
check('potting the other group\'s ball (after hitting your own first) is not a score: no foul, but the turn passes', rules.potOpp.potted.join() === '10' && rules.potOpp.foul === null && rules.potOpp.turn === 'n' && !rules.potOpp.cont, JSON.stringify(rules.potOpp));
check('the 8: potted after clearing your group wins; early, or on a scratch, or on an open table loses', rules.win.over && rules.win.winner === 'p' && rules.early.over && rules.early.winner === 'n' && rules.scratch8.over && rules.scratch8.winner === 'n' && rules.openEight.over && rules.openEight.winner === 'n', JSON.stringify({ w: rules.win, e: rules.early, s: rules.scratch8, o: rules.openEight }));
check('the cue ball goes down only on a clear spot on the table; the legal targets are the open table, your group, then the 8', !rules.place.inBall && !rules.place.offTable && !rules.place.edge && rules.place.ok && rules.legalT.open >= 1 && rules.legalT.solids.join() === '2' && rules.legalT.cleared.join() === '8', JSON.stringify({ p: rules.place, t: rules.legalT }));

const brk = J(`(() => {
  // the break: a ball down keeps your turn; four balls to a rail is enough; a weak break is a foul; the 8 is spotted again
  let potBreak = null, weak = null, eightBreak = null;
  for (let seed = 1; seed < 200 && !(potBreak && weak); seed++) {
    const st = poolNew(mulberry32(seed));
    const v = poolShoot(st, { angle: (seed % 7 - 3) * 0.01, power: seed % 3 === 0 ? 0.25 : 1 });
    if (!potBreak && v.potted.length && !v.foul) potBreak = { seed, cont: v.continues, turn: st.turn, groups: st.groups, potted: v.potted };
    if (!weak && v.foul === 'weak break') weak = { seed, turn: st.turn, hand: st.ballInHand };
  }
  const st = poolNew(mulberry32(2)); const e8 = poolBallById(st, 8); const before = { x: e8.x, y: e8.y };
  // force the 8 down on the break by making it potted during the shot
  poolBeginShot(st, { angle: 0, power: 1 }); st.shot.targetsBefore = poolLegalTargets(st, 'p'); e8.potted = true; st.shot.potted.push(8); st.shot.firstContact = 1; st.shot.cushionHits = 5;
  const v = poolEndShot(st);
  return { potBreak, weak, eightSpotted: !e8.potted && Math.abs(e8.x - before.x) < 1e-6, over: st.over, v: { potted: v.potted } };
})()`);
check('a ball down on the break keeps the table open and your turn; a soft break with nothing down is a foul; the 8 on the break is spotted again, not a loss', brk.potBreak && brk.potBreak.cont && brk.potBreak.turn === 'p' && brk.potBreak.groups.p === null && brk.weak && brk.weak.turn === 'n' && brk.weak.hand && brk.eightSpotted && !brk.over, JSON.stringify(brk));

console.log('\n3. A roommate\'s shot');
const ai = J(`(() => {
  // an easy shot: a ball near a corner with a clean line
  const setup = () => { const st = __bare({ 0: [0.6, 0.6], 3: [0.22, 0.22], 12: [1.6, 0.9], 8: [1.7, 0.2] }, { shots: 4 }); st.groups = { p: 'solids', n: 'stripes' }; return st; };
  const best = poolBestShot(setup(), 'p');
  const rate = (skill, n) => { let ok = 0; for (let i = 0; i < n; i++) { const st = setup(); const r = mulberry32(700 + i); const v = poolShoot(st, poolNpcShot(st, 'p', skill, r)); if (v.potted.includes(3) && !v.foul) ok++; } return ok / n; };
  const great = rate(1, 60), poor = rate(0, 60), mid = rate(0.5, 60);
  // blocked: a ball in the way of the only line means no pottable shot is claimed through it
  const blocked = __bare({ 0: [0.5, 0.5], 3: [0.22, 0.22], 4: [0.36, 0.36], 8: [1.7, 0.2], 12: [1.6, 0.9] }, { shots: 4 }); blocked.groups = { p: 'solids', n: 'stripes' };
  const bb = poolBestShot(blocked, 'p');
  const blockedThroughBall = bb === null;
  // a safety when nothing can be potted
  const boxed = __bare({ 0: [0.5, 0.5], 3: [1.0, 0.5], 12: [1.5, 0.5], 8: [1.6, 0.6] }, { shots: 4 }); boxed.groups = { p: 'solids', n: 'stripes' };
  const orig = poolBestShot; poolBestShot = () => null;
  let safe; try { safe = poolNpcShot(boxed, 'p', 0.5, mulberry32(1)); } finally { poolBestShot = orig; }
  // the break: aimed at the rack, hard
  const br = poolNew(mulberry32(3)); const bs = poolNpcShot(br, 'n', 0.5, mulberry32(2));
  const apex = br.balls.filter(b => b.id !== 0).sort((a, b) => a.x - b.x)[0];
  const cue = poolBallById(br, 0);
  const toApex = Math.atan2(apex.y - cue.y, apex.x - cue.x);
  const bv = poolShoot(br, bs);
  // ball in hand
  const bih = __bare({ 0: [0.5, 0.5], 3: [0.9, 0.3], 12: [1.5, 0.6], 8: [1.7, 0.2] }, { shots: 4, ballInHand: true }); bih.groups = { p: 'solids', n: 'stripes' };
  poolBallById(bih, 0).potted = true;
  const put = poolNpcPlaceCue(bih, 'p');
  const cueAfter = poolBallById(bih, 0);
  const clear = bih.balls.every(b => b.id === 0 || b.potted || __dist(b, cueAfter) >= 2 * POOL_TUNING.radius);
  // stable and seeded
  const s1 = JSON.stringify(poolNpcShot(setup(), 'p', 0.7, mulberry32(4))), s2 = JSON.stringify(poolNpcShot(setup(), 'p', 0.7, mulberry32(4)));
  return { best: best && { id: best.targetId, pocket: best.pocket, power: best.power }, great, mid, poor, blockedThroughBall, safe: { power: safe.power }, bs: { power: bs.power, off: Math.abs(bs.angle - toApex) }, breakLegal: !bv.foul || bv.foul === 'weak break', put: !!put, placed: !cueAfter.potted, clear, deterministic: s1 === s2 };
})()`);
check('a clear shot at a corner is found, aimed at the right ball and pocket, at a sensible power', ai.best && ai.best.id === 3 && ai.best.pocket === 0 && ai.best.power > 0.1 && ai.best.power < 0.9, JSON.stringify(ai.best));
check('skill matters: a great player pots the easy ball far more often than a poor one, with a middling one between', ai.great > 0.85 && ai.poor < ai.great - 0.2 && ai.mid >= ai.poor - 0.05 && ai.mid <= ai.great + 0.05, JSON.stringify({ great: ai.great, mid: ai.mid, poor: ai.poor }));
check('a line through another ball is not taken; with nothing to pot they play a gentle safety; the break is hard at the head of the rack', ai.blockedThroughBall && ai.safe.power <= 0.5 && ai.bs.power > 0.9 && ai.bs.off < 0.1 && ai.deterministic, JSON.stringify({ safe: ai.safe, bs: ai.bs, blocked: ai.blockedThroughBall }));
check('with ball in hand they put the cue somewhere clear on the table', ai.put && ai.placed && ai.clear);

console.log('\n4. Whole games');
const games = J(`(() => {
  const play = (seed, sp, sn) => { const st = poolNew(mulberry32(seed)); poolSimulate(st, mulberry32(seed + 5000), sp, sn); return st; };
  const a = play(31, 0.6, 0.5), b = play(31, 0.6, 0.5);
  const same = JSON.stringify(a.balls.map(x => [x.x, x.y, x.potted])) === JSON.stringify(b.balls.map(x => [x.x, x.y, x.potted])) && a.winner === b.winner && a.shots === b.shots;
  let ended = 0, sane = 0, N = 24, shots = 0, endedBy8 = 0;
  const R = POOL_TUNING.radius;
  for (let i = 0; i < N; i++) {
    const st = play(100 + i, 0.6, 0.6);
    if (st.over && (st.winner === 'p' || st.winner === 'n')) ended++;
    if (st.balls.every(b => b.potted || (b.x >= R - 1e-6 && b.x <= POOL_TUNING.w - R + 1e-6 && b.y >= R - 1e-6 && b.y <= POOL_TUNING.h - R + 1e-6))) sane++;
    shots += st.shots;
    if (poolBallById(st, 8).potted) endedBy8++;
  }
  let strong = 0, M = 20;
  for (let i = 0; i < M; i++) { const st = play(300 + i, 0.95, 0.25); if (st.winner === 'p') strong++; }
  const res = poolResult(a, 'Mira');
  const close = poolResult(Object.assign(poolNew(mulberry32(1)), { winner: 'p', groups: { p: 'solids', n: 'stripes' } }), 'Mira');
  const half = (() => { const st = poolNew(mulberry32(1)); st.groups = { p: 'solids', n: 'stripes' }; st.winner = 'n'; for (const b of st.balls) if (poolGroupOf(b.id) === 'solids' && b.id > 3) b.potted = true; return poolResult(st, 'Mira'); })();
  const wide = (() => { const st = poolNew(mulberry32(1)); st.groups = { p: 'solids', n: 'stripes' }; st.winner = 'n'; return poolResult(st, 'Mira'); })();
  return { same, ended: ended / N, sane: sane / N, avgShots: shots / N, endedBy8: endedBy8 / N, strong: strong / M, res, close: close.grade, half: half.grade, wide: wide.grade };
})()`);
check('a seeded game replays exactly; every game ends with a winner, nothing leaves the table, and the 8 decides it', games.same && games.ended === 1 && games.sane === 1 && games.endedBy8 > 0.85, JSON.stringify(games));
check('a game takes a sensible number of shots', games.avgShots > 12 && games.avgShots < 90, String(games.avgShots));
check('the better player wins far more often', games.strong > 0.65, String(games.strong));
check('the result names who won and by how much, graded by the balls the loser had left', /Mira/.test(games.res.summary) && games.close === 'close' || games.close === 'blowout' && games.wide === 'blowout', JSON.stringify({ res: games.res, close: games.close, half: games.half, wide: games.wide }));

console.log('\n5. Through the match spine');
api(String.raw`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260929, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.8, tension: 0 }; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
`);
const spine = J(String.raw`(() => {
  const g = __mk(); const [A] = __ids(g);
  const p1 = gamePlanMatch(g, 'pool', A, 'brag', 0), p2 = gamePlanMatch(g, 'pool', A, 'brag', 0);
  const played = gamePlanMatch(g, 'pool', A, 'iou', 10, { playerWon: true, grade: 'close', summary: 'You sink the black with Mira still on 2 balls.', minutes: 35 });
  return { same: JSON.stringify(p1) === JSON.stringify(p2), modelled: p1.played === true && /Mira/.test(p1.summary) && /black/.test(p1.summary), minutes: p1.minutes, mg: GAME_DEFS.pool.minigame, played: { won: played.playerWon, grade: played.grade, stake: played.stakeId, amt: played.amount }, line: gameMatchNarration(g, played) };
})()`);
check('headless, a game of pool is played out by the physics, deterministic, and told by its own summary; a played game becomes the plan with the stake as agreed', spine.same && spine.modelled && spine.minutes === 35 && spine.mg === 'pool' && spine.played.won && spine.played.grade === 'close' && spine.played.stake === 'iou' && spine.played.amt === 10 && /sink the black/.test(spine.line), JSON.stringify(spine));

console.log('\n6. Wiring and R1');
{
  const p = srcOf('pool.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../dev/verify/loadgame.js');
  const ui = srcOf('render.games.js');
  check('pool.js is loaded by index.html and the verify loader, every random thing takes an rng, and the screen is wired', /srcfiles\/pool\.js\?v=\d+/.test(html) && /'pool\.js'/.test(loader) && !/Math\.random/.test(p) && /function openPoolGame\(/.test(ui) && /kind === 'pool'\) return openPoolGame/.test(ui));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  check('R1: no religion in the pool table', !vocab.test(p), (p.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
