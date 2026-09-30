// ===== SECTION: POOL =====
// Game Room Phase 6 (game-room-overhaul-plan.md D10; 0.14.5): 8-ball on a real 2D table. The pure half:
// the physics (ball–ball collisions, cushions, pockets, friction, a little follow/draw and side spin),
// the rules (open table, groups, fouls and ball-in-hand, the 8 ball), a roommate's shot (a ghost-ball
// aim with a seeded error scaled by their skill) and a whole-game simulator (the headless result and
// "let it play out"). The screen — aim, power, spin, the balls rolling — is render.games.js.
//
// The table is 2 wide by 1 tall (x right, y down), pockets at the four corners and the middle of the
// long sides. Everything is deterministic given the rng (R6): the same seed breaks and misses the same.
//
// Balls: id 0 is the cue ball, 1–7 solids, 8 the black, 9–15 stripes.

const POOL_TUNING = {
  w: 2.0, h: 1.0,
  radius: 0.0235,
  pocket: { corner: 0.056, side: 0.05 },
  dt: 1 / 300,                 // seconds per physics step
  maxSpeed: 5.5,               // the cue ball's speed at full power (table heights per second)
  drag0: 0.1, drag1: 0.25,     // slowing: dv/dt = -(drag0 + drag1·v). Tuned so a full-power break pots something about one time in four.
  stopBelow: 0.02,
  ballRestitution: 0.96, cushionRestitution: 0.78,
  followK: 0.5,                // topspin/backspin: extra velocity along the shot after the first ball hit
  englishK: 0.35,              // side spin: sideways kick off a cushion
  englishDecay: 0.6,           // how much side spin is left after each cushion
  maxStepsPerShot: 6000,       // a shot never runs longer than 20 s of table time
  // A roommate's aim error (one standard deviation, radians) by skill 0..1, and how much their power wobbles.
  aimSigmaMax: 0.05, aimSigmaMin: 0.004, powerNoise: 0.08,
  // The player's aim is their own hand; skill does not correct it. (The screen is the game.)
  shotsMax: 100,               // a game that runs this long is decided on balls left
  breakPower: 1.0,
  // A result: the loser's balls still on the table (the 8 counts).
  close: 2, blowout: 6,
  minutes: 35,
};

const POOL_POCKETS = (() => {
  const T = POOL_TUNING;
  return [
    { x: 0, y: 0, r: T.pocket.corner }, { x: T.w, y: 0, r: T.pocket.corner },
    { x: 0, y: T.h, r: T.pocket.corner }, { x: T.w, y: T.h, r: T.pocket.corner },
    { x: T.w / 2, y: -0.008, r: T.pocket.side }, { x: T.w / 2, y: T.h + 0.008, r: T.pocket.side },
  ];
})();

function poolBall(id, x, y) { return { id, x, y, vx: 0, vy: 0, potted: false, sx: 0 }; }

function poolGroupOf(id) { return id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : id === 8 ? 'eight' : 'cue'; }

// Racks the fifteen at the foot spot (a triangle, the 8 in the middle, a solid and a stripe at the back
// corners) and puts the cue ball on the head spot. Pure given the rng (the order of the rest is drawn).
function poolRackBalls(rng) {
  const T = POOL_TUNING, R = T.radius;
  const balls = [poolBall(0, T.w * 0.25, T.h / 2)];
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  // triangle positions, row by row, apex toward the cue ball
  const foot = { x: T.w * 0.72, y: T.h / 2 };
  const dx = Math.sqrt(3) * R * 1.001, dy = R * 1.001;
  const spots = [];
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) spots.push({ x: foot.x + row * dx, y: foot.y + (k - row / 2) * 2 * dy });
  // the 8 in the middle of the third row (index 4), the back corners (indices 10 and 14) one of each group
  const order = new Array(15);
  order[4] = 8;
  const solid = rest.filter(id => id < 8), stripe = rest.filter(id => id > 8);
  order[10] = solid.shift(); order[14] = stripe.shift();
  const others = [...solid, ...stripe];
  for (let i = 0; i < 15; i++) if (order[i] === undefined) order[i] = others.shift();
  order.forEach((id, i) => balls.push(poolBall(id, spots[i].x, spots[i].y)));
  return balls;
}

function poolNew(rng, opts) {
  return {
    balls: poolRackBalls(rng),
    turn: 'p', groups: { p: null, n: null }, ballInHand: false,
    shots: 0, over: false, winner: null, foul: null, log: [], lastShot: null, shot: null,
  };
}

function poolBallById(state, id) { return state.balls.find(b => b.id === id); }
function poolOnTable(state) { return state.balls.filter(b => !b.potted); }

// Balls left for a group (and the 8 when they are all gone): the ones still on the table. Pure.
function poolRemaining(state, group) {
  if (!group) return 0;
  return state.balls.filter(b => !b.potted && poolGroupOf(b.id) === group).length;
}

// --- Physics -------------------------------------------------------------------------------------

// Starts a shot: the cue ball's velocity from angle (radians, 0 = +x, y down) and power 0..1, with spin
// { x: side (−1 left .. 1 right), y: follow (+) or draw (−) }. Mutates.
function poolBeginShot(state, shot) {
  const T = POOL_TUNING;
  const cue = poolBallById(state, 0);
  const power = Math.max(0.03, Math.min(1, shot.power));
  const spin = { x: Math.max(-1, Math.min(1, (shot.spin && shot.spin.x) || 0)), y: Math.max(-1, Math.min(1, (shot.spin && shot.spin.y) || 0)) };
  cue.vx = Math.cos(shot.angle) * power * T.maxSpeed;
  cue.vy = Math.sin(shot.angle) * power * T.maxSpeed;
  cue.sx = spin.x;
  state.shot = {
    angle: shot.angle, power, spin, shooter: state.turn, steps: 0, firstContact: null, potted: [], cuePotted: false,
    railAfterContact: false, cushionHits: 0, cueHit: false, cueDir: null, ballInHand: state.ballInHand, breakShot: state.shots === 0,
  };
  state.ballInHand = false;
  state.foul = null;
}

function poolMoving(state) {
  const T = POOL_TUNING;
  for (const b of state.balls) if (!b.potted && (Math.abs(b.vx) > T.stopBelow || Math.abs(b.vy) > T.stopBelow)) return true;
  return false;
}

// One physics step. Mutates the balls and the shot's record. Returns true while anything still moves.
function poolStep(state) {
  const T = POOL_TUNING, R = T.radius, dt = T.dt, shot = state.shot;
  const balls = state.balls;
  for (const b of balls) {
    if (b.potted) continue;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 0) {
      const slow = Math.min(sp, (T.drag0 + T.drag1 * sp) * dt);
      const k = (sp - slow) / sp;
      b.vx *= k; b.vy *= k;
      if (sp - slow < T.stopBelow * 0.5) { b.vx = 0; b.vy = 0; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  // pockets
  for (const b of balls) {
    if (b.potted) continue;
    for (const p of POOL_POCKETS) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < p.r * p.r) {
        b.potted = true; b.vx = 0; b.vy = 0;
        if (shot) { if (b.id === 0) shot.cuePotted = true; else shot.potted.push(b.id); }
        break;
      }
    }
  }
  // cushions
  for (const b of balls) {
    if (b.potted) continue;
    let hit = false;
    if (b.x < R) { b.x = R; if (b.vx < 0) { b.vx = -b.vx * T.cushionRestitution; hit = 'x'; } }
    else if (b.x > T.w - R) { b.x = T.w - R; if (b.vx > 0) { b.vx = -b.vx * T.cushionRestitution; hit = 'x'; } }
    if (b.y < R) { b.y = R; if (b.vy < 0) { b.vy = -b.vy * T.cushionRestitution; hit = 'y'; } }
    else if (b.y > T.h - R) { b.y = T.h - R; if (b.vy > 0) { b.vy = -b.vy * T.cushionRestitution; hit = 'y'; } }
    if (hit) {
      if (shot) { shot.cushionHits += 1; if (shot.firstContact !== null) shot.railAfterContact = true; }
      if (b.id === 0 && b.sx) {
        // side spin kicks the ball along the rail
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const kick = b.sx * T.englishK * speed;
        if (hit === 'x') b.vy += kick; else b.vx -= kick;
        b.sx *= T.englishDecay;
      }
    }
  }
  // ball–ball
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.potted) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j];
      if (c.potted) continue;
      const dx = c.x - a.x, dy = c.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;   // closing speed along the normal
      const overlap = 2 * R - d;
      a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; c.x += nx * overlap / 2; c.y += ny * overlap / 2;
      if (rel > 0) {
        const jn = (1 + T.ballRestitution) * rel / 2;
        // remember the cue ball's heading for follow/draw before it changes
        const cueBall = a.id === 0 ? a : c.id === 0 ? c : null;
        let ux = 0, uy = 0;
        if (cueBall) { const sp = Math.sqrt(cueBall.vx * cueBall.vx + cueBall.vy * cueBall.vy) || 1; ux = cueBall.vx / sp; uy = cueBall.vy / sp; }
        a.vx -= jn * nx; a.vy -= jn * ny; c.vx += jn * nx; c.vy += jn * ny;
        if (shot && cueBall && !shot.cueHit) {
          shot.cueHit = true;
          const other = cueBall === a ? c : a;
          if (shot.firstContact === null) shot.firstContact = other.id;
          const s = shot.spin;
          if (s && s.y) { cueBall.vx += ux * s.y * T.followK * rel; cueBall.vy += uy * s.y * T.followK * rel; }
        } else if (shot && cueBall && shot.firstContact === null) {
          shot.firstContact = (cueBall === a ? c : a).id;
        }
      }
    }
  }
  if (shot) shot.steps += 1;
  return poolMoving(state);
}

// --- Rules -----------------------------------------------------------------------------------------

function poolOther(w) { return w === 'p' ? 'n' : 'p'; }

// Everything of a group is gone: the 8 is now theirs to shoot. Pure.
function poolClearedGroup(state, who) {
  const g = state.groups[who];
  return !!g && poolRemaining(state, g) === 0;
}

// The balls that are legal to hit first for the shooter now. Pure.
function poolLegalTargets(state, who) {
  const on = poolOnTable(state).filter(b => b.id !== 0);
  const g = state.groups[who];
  if (!g) return on.filter(b => b.id !== 8).map(b => b.id);
  if (poolClearedGroup(state, who)) return [8].filter(id => !poolBallById(state, id).potted);
  return on.filter(b => poolGroupOf(b.id) === g).map(b => b.id);
}

// Ends a shot: decides fouls, groups, whose turn, and the game. Mutates and returns the shot's verdict.
function poolEndShot(state) {
  const shot = state.shot;
  const who = shot.shooter;
  const opp = poolOther(who);
  const potted = shot.potted.slice();
  const targetsBefore = shot.targetsBefore || poolLegalTargets(state, who);
  const v = { shooter: who, potted, foul: null, cuePotted: shot.cuePotted, firstContact: shot.firstContact, ended: false, winner: null, assigned: null, continues: false };
  // the 8 ball
  const eightDown = potted.includes(8);
  // fouls
  let foul = null;
  if (shot.cuePotted) foul = 'scratch';
  else if (shot.firstContact === null) foul = 'no contact';
  else if (!shot.breakShot && !targetsBefore.includes(shot.firstContact)) foul = 'wrong ball';
  else if (!shot.breakShot && potted.length === 0 && !shot.railAfterContact) foul = 'no rail';
  // the break: needs a ball down or four balls to a rail
  if (shot.breakShot && !foul && potted.length === 0 && shot.cushionHits < 4) foul = 'weak break';
  v.foul = foul;
  // the game
  if (eightDown) {
    if (shot.breakShot) {
      const eight = poolBallById(state, 8);
      eight.potted = false; eight.x = POOL_TUNING.w * 0.72 + 2 * Math.sqrt(3) * POOL_TUNING.radius * 1.001; eight.y = POOL_TUNING.h / 2; eight.vx = 0; eight.vy = 0;
      v.potted = potted.filter(id => id !== 8);
    } else {
      state.over = true;
      const legalEight = !foul && poolClearedGroupBeforeEight(state, who, potted);
      state.winner = legalEight ? who : opp;
      v.ended = true; v.winner = state.winner;
    }
  }
  if (!state.over) {
    // groups: the first legal pot on an open table decides them
    const real = v.potted.filter(id => id !== 8 && id !== 0);
    if (!state.groups[who] && !foul && real.length && !shot.breakShot) {   // (a ball down on the break leaves the table open)
      const g = poolGroupOf(real[0]);
      state.groups[who] = g; state.groups[opp] = g === 'solids' ? 'stripes' : 'solids';
      v.assigned = g;
    }
    const own = state.groups[who] ? real.filter(id => poolGroupOf(id) === state.groups[who]) : real;
    const scored = !foul && own.length > 0;
    if (foul) { state.turn = opp; state.ballInHand = true; state.foul = foul; }
    else if (scored) { v.continues = true; }
    else state.turn = opp;
    if (shot.cuePotted) { const cue = poolBallById(state, 0); cue.potted = true; }
  }
  state.shots += 1;
  state.lastShot = v;
  state.shot = null;
  if (!state.over && state.shots >= POOL_TUNING.shotsMax) { poolCallIt(state); v.ended = true; v.winner = state.winner; }
  return v;
}

// (The 8 was legal if its shooter had cleared their group before the shot — i.e. none of it is left and
// none was potted with the 8.)
function poolClearedGroupBeforeEight(state, who, potted) {
  const g = state.groups[who];
  if (!g) return false;
  const leftNow = state.balls.filter(b => !b.potted && poolGroupOf(b.id) === g).length;
  return leftNow === 0 && !potted.some(id => id !== 8 && poolGroupOf(id) === g);
}

// Out of shots: whoever has fewer balls left takes it (the roommate keeps a tie). Mutates.
function poolCallIt(state) {
  if (state.over) return;
  state.over = true;
  const rp = poolRemaining(state, state.groups.p), rn = poolRemaining(state, state.groups.n);
  state.winner = state.groups.p && state.groups.n ? (rp < rn ? 'p' : 'n') : 'n';
}

// Runs a shot to rest and applies the rules. Headless and for the AI. Returns the verdict.
function poolShoot(state, shot) {
  poolBeginShot(state, shot);
  state.shot.targetsBefore = poolLegalTargets(state, state.turn);
  let g = 0;
  while (g++ < POOL_TUNING.maxStepsPerShot && poolStep(state)) { /* roll */ }
  return poolEndShot(state);
}

// For the screen, which steps the physics itself: begin, remember what was legal, step, end.
function poolBeginShotLive(state, shot) {
  poolBeginShot(state, shot);
  state.shot.targetsBefore = poolLegalTargets(state, state.turn);
}

// Puts the cue ball down after a foul (or a scratch) — anywhere clear on the table (D: ball in hand).
// Returns true if it could be placed there.
function poolPlaceCue(state, x, y) {
  const T = POOL_TUNING, R = T.radius;
  if (x < R || x > T.w - R || y < R || y > T.h - R) return false;
  for (const b of state.balls) {
    if (b.id === 0 || b.potted) continue;
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy < 4 * R * R * 1.02) return false;
  }
  const cue = poolBallById(state, 0);
  cue.potted = false; cue.x = x; cue.y = y; cue.vx = 0; cue.vy = 0;
  state.ballInHand = false;
  return true;
}

// --- A roommate's shot -----------------------------------------------------------------------------

// How far a ball starting at speed v rolls before it stops (closed form of the drag above). Pure.
function poolRollDistance(v) {
  const T = POOL_TUNING;
  if (v <= 0) return 0;
  return v / T.drag1 - (T.drag0 / (T.drag1 * T.drag1)) * Math.log(1 + T.drag1 * v / T.drag0);
}

// The power (0..1) that rolls a ball about `distance` table units: the inverse of poolRollDistance. Pure.
function poolPowerFor(distance) {
  const T = POOL_TUNING;
  let lo = 0, hi = T.maxSpeed * 1.5;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (poolRollDistance(mid) < distance) lo = mid; else hi = mid; }
  return Math.max(0.1, Math.min(1, ((lo + hi) / 2) / T.maxSpeed));
}

function poolGauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Is the straight path a→b clear of every ball except `skip` ids (centres at least two radii from the line)?
function poolPathClear(state, a, b, skipIds, margin) {
  const R = POOL_TUNING.radius;
  const m = margin ?? 2 * R * 0.98;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  for (const ball of state.balls) {
    if (ball.potted || skipIds.includes(ball.id)) continue;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / len2));
    const px = a.x + t * dx - ball.x, py = a.y + t * dy - ball.y;
    if (px * px + py * py < m * m) return false;
  }
  return true;
}

// The best shot at the table for the shooter: the ball and pocket, the ghost-ball aim, how hard.
// Returns { angle, power, targetId, pocket, ghost } or null when nothing is pottable (then a safety).
function poolBestShot(state, who) {
  const R = POOL_TUNING.radius;
  const cue = poolBallById(state, 0);
  const targets = poolLegalTargets(state, who);
  let best = null;
  for (const id of targets) {
    const t = poolBallById(state, id);
    for (let pi = 0; pi < POOL_POCKETS.length; pi++) {
      const p = POOL_POCKETS[pi];
      const px = p.x, py = p.y;
      const dxp = px - t.x, dyp = py - t.y;
      const dp = Math.sqrt(dxp * dxp + dyp * dyp);
      const ux = dxp / dp, uy = dyp / dp;
      const ghost = { x: t.x - ux * 2 * R, y: t.y - uy * 2 * R };
      if (ghost.x < R || ghost.x > POOL_TUNING.w - R || ghost.y < R || ghost.y > POOL_TUNING.h - R) continue;
      const cx = ghost.x - cue.x, cy = ghost.y - cue.y;
      const dc = Math.sqrt(cx * cx + cy * cy);
      if (dc < 1e-6) continue;
      const cos = (cx / dc) * ux + (cy / dc) * uy;
      if (cos < 0.25) continue;                                  // too thin a cut
      if (!poolPathClear(state, cue, ghost, [0, id])) continue;
      if (!poolPathClear(state, t, { x: px, y: py }, [id, 0], 2 * R * 0.95)) continue;
      const score = -(dc + dp * 1.2) + cos * 0.8;
      if (!best || score > best.score) best = { score, angle: Math.atan2(cy, cx), power: Math.min(1, poolPowerFor(dc + (dp * 1.25) / Math.max(0.55, cos)) + 0.05), targetId: id, pocket: pi, ghost, dist: dc + dp };
    }
  }
  return best;
}

// The roommate's shot: the best pottable one with a seeded error scaled by their skill; failing that, a
// gentle safety at the nearest legal ball; on the break, a full-power hit at the head of the rack. Returns
// { angle, power, spin }. Pure given the rng.
function poolNpcShot(state, who, skill, rng) {
  const T = POOL_TUNING;
  const cue = poolBallById(state, 0);
  const s = Math.max(0, Math.min(1, skill));
  const sigma = T.aimSigmaMax - (T.aimSigmaMax - T.aimSigmaMin) * s;
  if (state.shots === 0) {
    const head = state.balls.filter(b => b.id !== 0 && !b.potted).sort((a, b) => a.x - b.x)[0];   // the apex of the rack
    const angle = Math.atan2(head.y - cue.y, head.x - cue.x) + poolGauss(rng) * sigma * 0.6;
    return { angle, power: T.breakPower * (0.92 + rng() * 0.08), spin: { x: 0, y: 0 } };
  }
  const best = poolBestShot(state, who);
  if (best) {
    return { angle: best.angle + poolGauss(rng) * sigma, power: Math.max(0.15, Math.min(1, best.power * (1 + poolGauss(rng) * T.powerNoise * (1.4 - s)))), spin: { x: 0, y: 0 }, aimed: best };
  }
  // a safety: roll gently into the nearest legal ball
  const targets = poolLegalTargets(state, who).map(id => poolBallById(state, id)).sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y));
  const t = targets[0] || state.balls.find(b => b.id !== 0 && !b.potted);
  const dist = Math.hypot(t.x - cue.x, t.y - cue.y);
  return { angle: Math.atan2(t.y - cue.y, t.x - cue.x) + poolGauss(rng) * sigma * 0.7, power: Math.min(0.5, poolPowerFor(dist + 0.2)), spin: { x: 0, y: 0 } };
}

// Where a roommate puts the cue ball with ball in hand: behind the ghost ball of their best shot, else the head spot.
function poolNpcPlaceCue(state, who) {
  const T = POOL_TUNING, R = T.radius;
  const cue = poolBallById(state, 0);
  cue.potted = true;   // out of the way while we look
  // find the best shot assuming the cue can be anywhere: try a few candidate spots behind each ghost
  let best = null;
  for (const id of poolLegalTargets(state, who)) {
    const t = poolBallById(state, id);
    for (let pi = 0; pi < POOL_POCKETS.length; pi++) {
      const p = POOL_POCKETS[pi];
      const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
      const ux = dx / d, uy = dy / d;
      const ghost = { x: t.x - ux * 2 * R, y: t.y - uy * 2 * R };
      const spot = { x: ghost.x - ux * 0.3, y: ghost.y - uy * 0.3 };
      if (spot.x < R || spot.x > T.w - R || spot.y < R || spot.y > T.h - R) continue;
      cue.potted = false; cue.x = spot.x; cue.y = spot.y;
      const clear = poolPathClear(state, spot, ghost, [0, id]) && poolPathClear(state, t, { x: p.x, y: p.y }, [id, 0], 2 * R * 0.95)
        && state.balls.every(b => b.id === 0 || b.potted || Math.hypot(b.x - spot.x, b.y - spot.y) > 2.2 * R);
      cue.potted = true;
      if (!clear) continue;
      const score = -d;
      if (!best || score > best.score) best = { score, x: spot.x, y: spot.y };
    }
  }
  const tries = best ? [best] : [];
  tries.push({ x: T.w * 0.25, y: T.h / 2 });
  for (let k = 0; k < 40; k++) tries.push({ x: T.w * 0.15 + (k % 8) * 0.06, y: 0.15 + Math.floor(k / 8) * 0.17 });
  for (const t of tries) if (poolPlaceCue(state, t.x, t.y)) return t;
  for (let gx = 0; gx < 40; gx++) for (let gy = 0; gy < 20; gy++) {   // last resort: any free spot at all
    const t = { x: R + gx * (T.w - 2 * R) / 39, y: R + gy * (T.h - 2 * R) / 19 };
    if (poolPlaceCue(state, t.x, t.y)) return t;
  }
  return null;
}

// --- A whole game, modelled -------------------------------------------------------------------------

// Both sides shoot like a roommate of their skill. Mutates and returns the state.
function poolSimulate(state, rng, skillP, skillN) {
  let guard = 0;
  while (!state.over && guard++ < POOL_TUNING.shotsMax + 5) {
    const who = state.turn;
    if (state.ballInHand) poolNpcPlaceCue(state, who);
    poolShoot(state, poolNpcShot(state, who, who === 'p' ? skillP : skillN, rng));
  }
  if (!state.over) poolCallIt(state);
  return state;
}

// { playerWon, grade, summary, minutes } for a finished game. Pure.
function poolResult(state, npcName) {
  const T = POOL_TUNING;
  const playerWon = state.winner === 'p';
  const loser = playerWon ? 'n' : 'p';
  const left = state.groups[loser] ? poolRemaining(state, state.groups[loser]) + (poolBallById(state, 8).potted ? 0 : 0) : 8;
  const grade = left <= T.close ? 'close' : left >= T.blowout ? 'blowout' : 'normal';
  const name = npcName || 'they';
  const summary = playerWon
    ? `You sink the black with ${name} still on ${left} ball${left === 1 ? '' : 's'}.`
    : `${name} sinks the black while you still had ${left} ball${left === 1 ? '' : 's'} left.`;
  return { playerWon, grade, summary, minutes: T.minutes, shots: state.shots, left };
}
// ===== /SECTION: POOL =====
