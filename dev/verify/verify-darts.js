// Game Room Phase 2 — darts (darts.js; game-room-overhaul-plan.md D9; 0.14.5).
//
//   node dev/verify/verify-darts.js
//
// The board's geometry and scoring; the spread by skill; a thrower's aim; the state machine (301's
// exact finish and bust, Around the Clock's order, a turn's three darts, running out of turns); the
// crosshair; a whole seeded match (deterministic, the better thrower wins more, both modes end);
// grading; and the wiring into the Challenge verb (the modelled result headless, the minigame when
// the screen is loaded, a played result becoming the plan).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'skills.js', 'money.js',
    'defs.actions.js', 'actions.js', 'games.js', 'darts.js', 'state.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

console.log('\n0. The board');
const board = J(`(() => {
  const at = (sector, mult) => { const p = dartsAimPoint(sector, mult); return dartsLanding(p.x, p.y); };
  const all = DARTS_TUNING.sectors.every(s => [1, 2, 3].every(m => { const l = at(s, m); return l.sector === s && l.mult === m && l.points === s * m; }));
  return {
    n: DARTS_TUNING.sectors.length, uniq: new Set(DARTS_TUNING.sectors).size, sum: DARTS_TUNING.sectors.reduce((a, b) => a + b, 0), all,
    bull: dartsLanding(0, 0), outer: dartsLanding(0.06, 0), miss: dartsLanding(1.2, 0), missCorner: dartsLanding(0.9, 0.9),
    t20: dartsLanding(0, -0.585), d20: dartsLanding(0, -0.96), s20: dartsLanding(0, -0.75), right: dartsLanding(0.75, 0), left: dartsLanding(-0.75, 0), down: dartsLanding(0, 0.75),
    bullAim: dartsAimPoint(25, 2), outerAim: dartsLanding(dartsAimPoint(25, 1).x, dartsAimPoint(25, 1).y),
    withXY: (() => { const a = dartsAt(0.3, -0.2); return a.x === 0.3 && a.y === -0.2 && a.points > 0; })(),
  };
})()`);
check('twenty distinct numbers, 1 to 20, in the standard order', board.n === 20 && board.uniq === 20 && board.sum === 210 && board.all, JSON.stringify({ n: board.n, s: board.sum, all: board.all }));
check('the rings score: bull 50, outer 25, treble ×3, double ×2, single, and off the board is a miss', board.bull.points === 50 && board.outer.points === 25 && board.t20.points === 60 && board.d20.points === 40 && board.s20.points === 20 && board.miss.points === 0 && board.missCorner.points === 0, JSON.stringify({ b: board.bull, t: board.t20, d: board.d20, s: board.s20 }));
check('the sectors run clockwise from the top: 20 above, 6 to the right, 3 below, 11 to the left', board.t20.sector === 20 && board.right.sector === 6 && board.down.sector === 3 && board.left.sector === 11, JSON.stringify({ r: board.right.sector, d: board.down.sector, l: board.left.sector }));
check('an aim point lands where it says, and a throw carries where it stuck', board.bullAim.x === 0 && board.outerAim.points === 25 && board.withXY);

console.log('\n1. Spread and aim');
const spread = J(`(() => {
  const rng = mulberry32(7);
  const measure = (skill) => { let miss = 0, tw = 0, N = 4000; const r = mulberry32(99); for (let i = 0; i < N; i++) { const l = dartsNpcThrow(r, skill, { sector: 20, mult: 3 }); if (l.points === 0) miss++; if (l.sector === 20 && l.mult === 3) tw++; } return { miss: miss / N, t20: tw / N }; };
  const g = []; const rr = mulberry32(1); for (let i = 0; i < 20000; i++) g.push(dartsGauss(rr));
  const mean = g.reduce((a, b) => a + b, 0) / g.length, sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) * (b - mean), 0) / g.length);
  const low = measure(0.1), high = measure(0.9);
  const c0 = dartsCrosshair(0, 0.5), c1 = dartsCrosshair(0.4, 0.5);
  const slowFast = (() => { let dx = 0; for (let k = 0; k < 100; k++) { const a = dartsCrosshair(k * 0.05, 0), b = dartsCrosshair(k * 0.05 + 0.05, 0); dx += Math.abs(b.x - a.x); } let dy = 0; for (let k = 0; k < 100; k++) { const a = dartsCrosshair(k * 0.05, 1), b = dartsCrosshair(k * 0.05 + 0.05, 1); dy += Math.abs(b.x - a.x); } return { fast: dx, slow: dy }; })();
  const inBounds = (() => { let ok = true; for (let k = 0; k < 500; k++) { const c = dartsCrosshair(k * 0.137, 0.3); if (Math.abs(c.x) > DARTS_TUNING.aimAmp + 1e-9 || Math.abs(c.y) > DARTS_TUNING.aimAmp + 1e-9) ok = false; } return ok; })();
  return { sigLow: dartsSigma(0), sigHigh: dartsSigma(1), sigClamp: dartsSigma(5) === dartsSigma(1) && dartsSigma(-3) === dartsSigma(0), mean, sd, low, high, moves: c0.x !== c1.x, slowFast, inBounds };
})()`);
check('a steadier hand has a tighter spread; skill is clamped', spread.sigLow > spread.sigHigh && spread.sigClamp && spread.sigLow === 0.36 && Math.abs(spread.sigHigh - 0.08) < 1e-9, JSON.stringify(spread));
check('the gaussian is a normal one (mean ~0, sd ~1)', Math.abs(spread.mean) < 0.03 && Math.abs(spread.sd - 1) < 0.03, JSON.stringify({ m: spread.mean, sd: spread.sd }));
check('a good thrower hits the treble 20 far more often than a poor one, and misses the board less', spread.high.t20 > spread.low.t20 * 2 && spread.high.miss < spread.low.miss, JSON.stringify({ low: spread.low, high: spread.high }));
check('the crosshair sweeps, stays on the board, and a steadier player gets a slower one', spread.moves && spread.inBounds && spread.slowFast.slow < spread.slowFast.fast, JSON.stringify(spread.slowFast));

console.log('\n2. 301');
const t301 = J(`(() => {
  const s = dartsNew('301');
  const L = (sector, mult) => { const p = dartsAimPoint(sector, mult); return dartsLanding(p.x, p.y); };
  const start = { p: s.left.p, n: s.left.n, turn: s.turn, darts: s.dartsLeft };
  const o1 = dartsApplyThrow(s, 'p', L(20, 3));
  const o2 = dartsApplyThrow(s, 'p', L(20, 3));
  const wrongTurn = dartsApplyThrow(s, 'n', L(20, 1));
  const o3 = dartsApplyThrow(s, 'p', L(20, 3));
  const afterTurn = { left: s.left.p, turn: s.turn, darts: s.dartsLeft, end: o3.turnEnd, ts: s.turnStart.p };
  // bust: the turn reverts
  const b = dartsNew('301'); b.left.p = 10; b.turnStart.p = 10;
  const bo = dartsApplyThrow(b, 'p', L(20, 1));
  const bust = { bust: bo.bust, left: b.left.p, turn: b.turn, end: bo.turnEnd };
  // exact finish
  const f = dartsNew('301'); f.left.p = 40; f.turnStart.p = 40;
  const fo = dartsApplyThrow(f, 'p', L(20, 2));
  // one dart short
  const h = dartsNew('301'); h.left.p = 40; h.turnStart.p = 40;
  dartsApplyThrow(h, 'p', L(20, 1));
  const tg = { far: dartsTarget(Object.assign(dartsNew('301'), {}), 'p'), r50: (() => { const q = dartsNew('301'); q.left.p = 50; return dartsTarget(q, 'p'); })(), r32: (() => { const q = dartsNew('301'); q.left.p = 32; return dartsTarget(q, 'p'); })(), r15: (() => { const q = dartsNew('301'); q.left.p = 15; return dartsTarget(q, 'p'); })(), r45: (() => { const q = dartsNew('301'); q.left.p = 45; return dartsTarget(q, 'p'); })() };
  return { start, o1: o1.hit.points, wrongTurn, afterTurn, bust, win: { win: fo.win, winner: f.winner, left: f.left.p }, short: { left: h.left.p, winner: h.winner }, tg };
})()`);
check('a match starts at 301 each with three darts; only the thrower whose turn it is can throw', t301.start.p === 301 && t301.start.n === 301 && t301.start.darts === 3 && t301.wrongTurn === null);
check('three treble twenties take you to 121 and end your turn', t301.afterTurn.left === 121 && t301.afterTurn.turn === 'n' && t301.afterTurn.darts === 3 && t301.afterTurn.end && t301.afterTurn.ts === 121, JSON.stringify(t301.afterTurn));
check('going past zero is a bust: the turn ends and you are back where you started it', t301.bust.bust && t301.bust.left === 10 && t301.bust.turn === 'n' && t301.bust.end, JSON.stringify(t301.bust));
check('finishing on exactly zero wins; one dart short of it does not', t301.win.win && t301.win.winner === 'p' && t301.win.left === 0 && t301.short.left === 20 && t301.short.winner === null, JSON.stringify(t301.win));
check('the roommate aims for the treble 20 while far out, the exact double or single when close, and the 20 to get there in between', t301.tg.far.sector === 20 && t301.tg.far.mult === 3 && t301.tg.r32.sector === 16 && t301.tg.r32.mult === 2 && t301.tg.r15.sector === 15 && t301.tg.r15.mult === 1 && t301.tg.r45.sector === 20 && t301.tg.r45.mult === 1, JSON.stringify(t301.tg));

console.log('\n3. Around the Clock');
const clock = J(`(() => {
  const s = dartsNew('clock');
  const L = (sector, mult) => { const p = dartsAimPoint(sector, mult); return dartsLanding(p.x, p.y); };
  dartsApplyThrow(s, 'p', L(1, 1));
  dartsApplyThrow(s, 'p', L(5, 1));       // wrong number: no progress
  dartsApplyThrow(s, 'p', L(2, 3));       // a treble 2 counts as a 2
  const at = s.at.p;
  const tgt = dartsTarget(s, 'p');
  // run the numbers to the bull
  const t = dartsNew('clock'); t.at.p = 20;
  dartsApplyThrow(t, 'p', L(20, 1));
  const tb = dartsTarget(t, 'p');
  const w = dartsApplyThrow(t, 'p', L(25, 2));
  return { at, tgt, tb, win: w.win, winner: t.winner, bullAt: t.at.p };
})()`);
check('you must hit the numbers in order; a wrong number gets you nowhere; a treble counts as its number', clock.at === 3 && clock.tgt.sector === 3 && clock.tgt.mult === 1, JSON.stringify(clock));
check('after 20 the target is the bull, and hitting it wins', clock.tb.sector === 25 && clock.win && clock.winner === 'p', JSON.stringify(clock));

console.log('\n4. A whole match');
const sim = J(`(() => {
  const play = (seed, mode, sp, sn) => dartsSimulate(mulberry32(seed), mode, sp, sn);
  const a = play(11, '301', 0.6, 0.4), b = play(11, '301', 0.6, 0.4);
  const same = JSON.stringify(a) === JSON.stringify(b);
  const rate = (mode, sp, sn, n) => { let w = 0, ended = 0, turns = 0; for (let i = 0; i < n; i++) { const st = play(1000 + i, mode, sp, sn); if (st.winner) ended++; if (st.winner === 'p') w++; turns += st.turns; } return { w: w / n, ended: ended / n, turns: turns / n }; };
  const even = rate('301', 0.5, 0.5, 200), better = rate('301', 0.8, 0.3, 200), worse = rate('301', 0.2, 0.7, 200);
  const cEven = rate('clock', 0.5, 0.5, 200), cBetter = rate('clock', 0.85, 0.3, 200);
  const r = dartsResult(a, 'Mira');
  const close = dartsResult({ mode: '301', winner: 'p', left: { p: 0, n: 12 }, at: {}, turns: 5 }, 'Mira');
  const blow = dartsResult({ mode: '301', winner: 'n', left: { p: 250, n: 0 }, at: {}, turns: 5 }, 'Mira');
  const cclose = dartsResult({ mode: 'clock', winner: 'p', at: { p: 22, n: 20 }, left: {}, turns: 5 }, 'Mira');
  const called = dartsNew('301'); called.left.p = 100; called.left.n = 150; dartsCallIt(called);
  const tie = dartsNew('301'); dartsCallIt(tie);
  return { same, ended: a.winner !== null, even, better, worse, cEven, cBetter, r, close: close.grade, blow: blow.grade, cclose: cclose.grade, called: called.winner, tie: tie.winner, summary: r.summary };
})()`);
check('a seeded match replays exactly, and always ends with a winner', sim.same && sim.ended && sim.even.ended === 1 && sim.cEven.ended === 1, JSON.stringify({ e: sim.even, c: sim.cEven }));
check('the better thrower wins more, in both games; level players are near even (the roommate keeps the tie)', sim.better.w > sim.even.w + 0.2 && sim.worse.w < sim.even.w - 0.2 && sim.even.w > 0.3 && sim.even.w < 0.6 && sim.cBetter.w > sim.cEven.w + 0.15, JSON.stringify({ better: sim.better.w, even: sim.even.w, worse: sim.worse.w, cE: sim.cEven.w, cB: sim.cBetter.w }));
check('a match takes a few turns, not one and not the cap', sim.even.turns > 3 && sim.even.turns < 14, JSON.stringify(sim.even));
check('grading: a narrow finish is close, a big gap a walkover; out of turns the closer one takes it and a tie goes to the roommate', sim.close === 'close' && sim.blow === 'blowout' && sim.cclose === 'close' && sim.called === 'p' && sim.tie === 'n', JSON.stringify({ c: sim.close, b: sim.blow, cc: sim.cclose, called: sim.called, tie: sim.tie }));
check('the summary names the opponent and no placeholder', /Mira/.test(sim.summary) && !/[{}]/.test(sim.summary), sim.summary);

console.log('\n5. Wired into the Challenge verb');
api(`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260929, n === undefined ? 3 : n);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].activity = 'idle'; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
`);
const wired = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  g.npcs[A].relPlayer = { ...g.npcs[A].relPlayer, affection: 0.9, tension: 0 };
  const p1 = gamePlanMatch(g, 'darts', A, 'brag', 0), p2 = gamePlanMatch(g, 'darts', A, 'brag', 0);
  const clockPlan = gamePlanMatch(g, 'darts', A, 'brag', 0, null, 'clock');
  const played = gamePlanMatch(g, 'darts', A, 'brag', 0, { playerWon: true, grade: 'close', summary: 'You finish on exactly zero; Mira still has 12 to go.', minutes: 22 }, '301');
  const line = gameMatchNarration(g, played);
  const stakeKept = gamePlanMatch(g, 'darts', A, 'iou', 5, { playerWon: false, grade: 'blowout', summary: 'Mira wins.' }, '301');
  return { same: JSON.stringify(p1) === JSON.stringify(p2), modelled: p1.played === true && typeof p1.summary === 'string' && p1.summary.includes('Mira'), minutes: [p1.minutes, clockPlan.minutes], clockSummary: clockPlan.summary,
    played: { won: played.playerWon, grade: played.grade, minutes: played.minutes }, line, iou: { stake: stakeKept.stakeId, amt: stakeKept.amount, won: stakeKept.playerWon },
    modes: GAME_DEFS.darts.modes.map(m => m.id), minigame: GAME_DEFS.darts.minigame, pool: gamePlanMatch(g, 'console', A, 'brag', 0).played };
})()`);
check('headless, darts is modelled (both throw like their skill): deterministic, told by the match summary, and each mode has its own length', wired.same && wired.modelled && wired.modes.join() === '301,clock' && wired.minigame === 'darts' && wired.minutes[0] === 25 && wired.minutes[1] === 20, JSON.stringify(wired));
check('a played result becomes the plan (winner, grade, minutes, and its own line), the stake still applies, and other games are untouched', wired.played.won && wired.played.grade === 'close' && wired.played.minutes === 22 && /exactly zero/.test(wired.line) && wired.iou.stake === 'iou' && wired.iou.amt === 5 && wired.iou.won === false && wired.pool === false, JSON.stringify(wired));
{
  const d = srcOf('darts.js'), ui = srcOf('render.games.js'), acts = srcOf('defs.actions.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
  check('the screen is wired: openMinigame → openDartsGame, the verb awaits it only when loaded, both scripts are in index.html', /function openMinigame\(/.test(ui) && /function openDartsGame\(/.test(ui) && /typeof openMinigame === 'function'/.test(acts) && /srcfiles\/darts\.js\?v=\d+/.test(html) && /srcfiles\/render\.games\.js\?v=\d+/.test(html));
  check('darts.js never touches Math.random or a global rng (every function takes its rng)', !/Math\.random/.test(d));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([DARTS_TUNING, GAME_DEFS.darts])');
  check('R1: no religion in the darts tables', !vocab.test(T), (T.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
