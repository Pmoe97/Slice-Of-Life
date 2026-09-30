// ===== SECTION: ARCADE =====
// Game Room Phases 7–8 (game-room-overhaul-plan.md D5, D14; 0.14.5): the arcade cabinet, which the
// Entertainment Hub tier of the game room unlocks. Four original one-button / touch games — Rent Runner,
// Night Shift, Stack Up, Neon Serpent — sharing one shape: a pure fixed-step state machine
// (arcadeNew / arcadeStep), so the screen (render.games.js) just feeds it input and draws it, and a
// model player (arcadeBot) can play it headless. A roommate's high score is derived from their skill
// by running that bot, seeded (R5/R6), so it is deterministic and never stored except when it beats a
// score on the board.
//
// world.games.arcade = { table: { gameId: [{ who, score, day }] } }   (top ARCADE_TUNING.keep, best first)

const ARCADE_TUNING = {
  dt: 1 / 60,
  keep: 5,                    // scores kept per game
  minutes: 12,                // what a go costs on the clock
  modelDt: 1 / 60,            // the model player's step (the screen's, so a model plays as a hand would)
  // A roommate's bot skill, from their skill in gaming (0..1), and the week-by-week improvement of a regular.
  weeklyGain: 0.01,
  // Mood and practice for the player.
  mood: 0.05, newBestMood: 0.03, xp: 3, newBestXp: 2,
};

const ARCADE_GAMES = {
  rent_runner: { id: 'rent_runner', label: 'Rent Runner', controls: 'Tap to jump', blurb: 'Jump the overdue bills, grab the coins. Three strikes and the landlord catches you.', capSeconds: 150 },
  night_shift: { id: 'night_shift', label: 'Night Shift', controls: 'Tap a bar to slide a drink; tap it again when an empty comes back', blurb: 'Slide drinks down four bars before the customers reach the end, and catch the empties.', capSeconds: 120 },
  stack_up: { id: 'stack_up', label: 'Stack Up', controls: 'Tap to drop the slab', blurb: 'Drop the swinging slab on the tower. The overhang is sliced off. How high can you go?', capSeconds: 240 },
  neon_serpent: { id: 'neon_serpent', label: 'Neon Serpent', controls: 'Swipe or arrow keys', blurb: 'Eat, grow, survive: the tail you shed becomes walls for a while.', capSeconds: 180 },
};
const ARCADE_IDS = Object.keys(ARCADE_GAMES);

// --- Rent Runner -------------------------------------------------------------------------------
const RUNNER = {
  viewTiles: 12, playerX: 2.2, playerW: 0.6,
  jumpV: 10.0, gravity: 28,
  speed0: 6.5, speedGain: 0.06, speedMax: 11,
  obsW: 0.7, obsH: 1.0, gapMin: 1.6, gapSpeedTime: 0.85, gapRandom: 1.1,
  coinChance: 0.6, coinY: 1.5, coinValue: 10, coinReach: 0.5,
  lives: 3, invuln: 1.0,
};

function runnerNew(rng) {
  return { t: 0, x: 0, speed: RUNNER.speed0, y: 0, vy: 0, obstacles: [], coins: [], nextSpawn: 12, lives: RUNNER.lives, invuln: 0, coinsGot: 0, score: 0, over: false, reason: null, hits: 0 };
}

function runnerStep(s, dt, input, rng) {
  const R = RUNNER;
  s.t += dt;
  s.speed = Math.min(R.speedMax, R.speed0 + R.speedGain * s.t);
  s.x += s.speed * dt;
  if (input && input.press && s.y === 0) s.vy = R.jumpV;
  if (s.y > 0 || s.vy > 0) {
    s.vy -= R.gravity * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) { s.y = 0; s.vy = 0; }
  }
  // spawn ahead (world x)
  while (s.nextSpawn < s.x + R.viewTiles + 6) {
    const wide = rng() < 0.2;
    const w = wide ? R.obsW * 2 : R.obsW;
    s.obstacles.push({ x: s.nextSpawn, w });
    if (rng() < R.coinChance) s.coins.push({ x: s.nextSpawn + w / 2, y: R.coinY });
    s.nextSpawn += w + R.gapMin + s.speed * R.gapSpeedTime + rng() * R.gapRandom * s.speed * 0.3;
  }
  if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);
  const px = s.x + R.playerX;
  // obstacles
  for (let i = s.obstacles.length - 1; i >= 0; i--) {
    const o = s.obstacles[i];
    if (o.x + o.w < px - R.playerW - 1) { s.obstacles.splice(i, 1); continue; }
    if (s.invuln === 0 && px + R.playerW / 2 > o.x && px - R.playerW / 2 < o.x + o.w && s.y < R.obsH) {
      s.lives -= 1; s.hits += 1; s.invuln = R.invuln;
      s.obstacles.splice(i, 1);
      if (s.lives <= 0) { s.over = true; s.reason = 'caught'; }
    }
  }
  // coins
  for (let i = s.coins.length - 1; i >= 0; i--) {
    const c = s.coins[i];
    if (c.x < px - 2) { s.coins.splice(i, 1); continue; }
    if (Math.abs(c.x - px) < R.coinReach && Math.abs(c.y - (s.y + 0.4)) < 0.7) { s.coinsGot += 1; s.coins.splice(i, 1); }
  }
  s.score = Math.floor(s.x) + s.coinsGot * R.coinValue;
  if (s.t >= ARCADE_GAMES.rent_runner.capSeconds && !s.over) { s.over = true; s.reason = 'payday'; }
}

function runnerBot(s, skill, rng, bot) {
  const R = RUNNER;
  const px = s.x + R.playerX;
  const next = s.obstacles.find(o => o.x + o.w > px - R.playerW / 2);
  if (!next || s.y > 0) return {};
  // The arc clears the obstacle's height for a window of the jump; centre the time the player spends
  // over it in that window. A careless player is off by a few hundredths of a second.
  const window0 = (R.jumpV - Math.sqrt(R.jumpV * R.jumpV - 2 * R.gravity * R.obsH)) / R.gravity;
  const window1 = (R.jumpV + Math.sqrt(R.jumpV * R.jumpV - 2 * R.gravity * R.obsH)) / R.gravity;
  const over = (next.w + R.playerW) / s.speed;
  const lead = window0 + (window1 - window0 - over) / 2 + (rng() - 0.5) * 2 * (1 - skill) * 0.32;
  const dist = next.x - (px + R.playerW / 2);
  if (dist <= s.speed * lead && dist > -0.2) return { press: true };
  return {};
}

// --- Night Shift -------------------------------------------------------------------------------
const SHIFT = {
  lanes: 4, lives: 3,
  customerSpeed0: 0.12, customerSpeedGain: 0.0016, customerSpeedMax: 0.3,
  drinkSpeed: 0.7, drinkCooldown: 0.35, emptyChance: 0.55, emptySpeed: 0.36, catchWindow: 0.16,
  spawn0: 1.5, spawnMin: 0.42, spawnDecay: 0.011,
  serve: 10, catchScore: 5, comboCap: 5,
};

function shiftNew(rng) {
  return { t: 0, nextId: 1, lanes: Array.from({ length: SHIFT.lanes }, () => ({ customers: [], drinks: [], empties: [], cool: 0 })), lives: SHIFT.lives, spawnIn: 1.2, combo: 0, score: 0, served: 0, caught: 0, over: false, reason: null, lastLane: -1 };
}

function shiftStep(s, dt, input, rng) {
  const T = SHIFT;
  s.t += dt;
  const speed = Math.min(T.customerSpeedMax, T.customerSpeed0 + T.customerSpeedGain * s.t * 10);
  // input: a tap on a lane catches an empty near the bar, else slides a drink
  if (input && typeof input.lane === 'number' && input.lane >= 0 && input.lane < T.lanes) {
    const L = s.lanes[input.lane];
    const e = L.empties.findIndex(x => x.x <= T.catchWindow);
    if (e >= 0) { L.empties.splice(e, 1); s.caught += 1; s.score += T.catchScore; }
    else if (L.cool <= 0) { L.drinks.push(0); L.cool = T.drinkCooldown; }
  }
  // spawn a customer
  s.spawnIn -= dt;
  if (s.spawnIn <= 0) {
    let lane = Math.floor(rng() * T.lanes);
    if (lane === s.lastLane) lane = (lane + 1 + Math.floor(rng() * (T.lanes - 1))) % T.lanes;
    s.lastLane = lane;
    s.lanes[lane].customers.push({ id: s.nextId++, x: 1.0, v: speed * (0.85 + rng() * 0.3), leaves: rng() < T.emptyChance });
    s.spawnIn = Math.max(T.spawnMin, T.spawn0 - T.spawnDecay * s.t * 10) * (0.8 + rng() * 0.4);
  }
  for (const L of s.lanes) {
    if (L.cool > 0) L.cool -= dt;
    // drinks slide right and serve the first customer they meet
    for (let i = L.drinks.length - 1; i >= 0; i--) {
      L.drinks[i] += T.drinkSpeed * dt;
      const d = L.drinks[i];
      const ci = L.customers.findIndex(c => d >= c.x);
      if (ci >= 0) {
        const c = L.customers[ci];
        L.customers.splice(ci, 1);
        L.drinks.splice(i, 1);
        s.combo = Math.min(T.comboCap, s.combo + 1); s.served += 1; s.score += T.serve * s.combo;
        if (c.leaves) L.empties.push({ id: s.nextId++, x: Math.min(0.95, c.x) });
      } else if (d >= 1) { L.drinks.splice(i, 1); s.combo = 0; }
    }
    // customers walk to the bar
    for (let i = L.customers.length - 1; i >= 0; i--) {
      L.customers[i].x -= L.customers[i].v * dt;
      if (L.customers[i].x <= 0.02) { L.customers.splice(i, 1); s.lives -= 1; s.combo = 0; }
    }
    // empties slide back to you
    for (let i = L.empties.length - 1; i >= 0; i--) {
      L.empties[i].x -= T.emptySpeed * dt;
      if (L.empties[i].x <= 0) { L.empties.splice(i, 1); s.lives -= 1; s.combo = 0; }
    }
  }
  if (s.lives <= 0 && !s.over) { s.over = true; s.reason = 'closed down'; }
  if (s.t >= ARCADE_GAMES.night_shift.capSeconds && !s.over) { s.over = true; s.reason = 'last orders'; }
}

function shiftBot(s, skill, rng, bot) {
  // A player either notices a customer or an empty in time or does not (decided once each, by skill),
  // and reacts a beat late — a little later the less practised they are.
  const seen = bot.seen || (bot.seen = {});
  const notices = (id) => { if (!(id in seen)) seen[id] = rng() < 0.5 + 0.5 * skill; return seen[id]; };
  bot.wait = (bot.wait || 0) - 1;
  if (bot.wait > 0) return {};
  bot.wait = Math.round((1 - skill) * 5) + 1;
  for (let n = 0; n < SHIFT.lanes; n++) {
    const e = s.lanes[n].empties.find(e => e.x <= SHIFT.catchWindow * 0.85 && notices(e.id));
    if (e) return { lane: n };
  }
  for (let n = 0; n < SHIFT.lanes; n++) {
    const L = s.lanes[n];
    if (L.cool > 0) continue;
    const c = L.customers.filter(c => c.x < 0.98 && notices(c.id)).sort((a, b) => a.x - b.x)[0];
    if (c && !L.drinks.some(d => d < c.x)) return { lane: n };
  }
  return {};
}

// --- Stack Up ----------------------------------------------------------------------------------
const STACK = { baseW: 0.42, speed0: 0.55, speedGain: 0.025, speedMax: 1.2, perfect: 0.012, perfectBonus: 2, regrow: 0.012, maxFloors: 70 };

function stackNew(rng) {
  const w = STACK.baseW;
  return { t: 0, floors: 0, slabs: [{ x: 0.5, w }], cur: { x: w / 2, w, dir: 1 }, speed: STACK.speed0, perfects: 0, streak: 0, score: 0, over: false, reason: null, lastDrop: null };
}

function stackStep(s, dt, input, rng) {
  s.t += dt;
  if (s.over) return;
  const c = s.cur;
  // a drop lands where the slab IS (before this step's swing), so what you saw is what you get
  if (input && input.press) {
    const top = s.slabs[s.slabs.length - 1];
    const left = Math.max(c.x - c.w / 2, top.x - top.w / 2), right = Math.min(c.x + c.w / 2, top.x + top.w / 2);
    const overlap = right - left;
    if (overlap <= 0.004) { s.over = true; s.reason = 'missed'; s.lastDrop = { overlap: 0 }; return; }
    const off = Math.abs(c.x - top.x);
    let placed;
    if (off <= STACK.perfect) {
      placed = { x: top.x, w: Math.min(STACK.baseW, top.w + (s.streak >= 2 ? STACK.regrow : 0)) };
      s.perfects += 1; s.streak += 1; s.score += STACK.perfectBonus;
    } else {
      placed = { x: (left + right) / 2, w: overlap };
      s.streak = 0;
    }
    s.slabs.push(placed);
    s.floors += 1; s.score += 1;
    s.lastDrop = { overlap, perfect: off <= STACK.perfect };
    s.speed = Math.min(STACK.speedMax, STACK.speed0 + STACK.speedGain * s.floors);
    s.cur = { x: c.dir > 0 ? placed.w / 2 : 1 - placed.w / 2, w: placed.w, dir: c.dir > 0 ? 1 : -1 };
    if (s.floors >= STACK.maxFloors) { s.over = true; s.reason = 'topped out'; }
  }
  // swing
  const c2 = s.cur;
  c2.x += c2.dir * s.speed * dt;
  if (c2.x - c2.w / 2 < 0) { c2.x = c2.w / 2; c2.dir = 1; }
  if (c2.x + c2.w / 2 > 1) { c2.x = 1 - c2.w / 2; c2.dir = -1; }
  if (s.t >= ARCADE_GAMES.stack_up.capSeconds && !s.over) { s.over = true; s.reason = 'time'; }
}

function stackBot(s, skill, rng, bot) {
  const top = s.slabs[s.slabs.length - 1];
  // Drop at the step where the slab is closest to over the tower (this step's, not the next's), with a
  // hand that wobbles more the less practised it is.
  const c = s.cur;
  const now = Math.abs(c.x - top.x);
  const nextX = c.x + c.dir * s.speed * ARCADE_TUNING.modelDt;
  const next = Math.abs(nextX - top.x);
  if (bot.pending > 0) { bot.pending -= 1; if (bot.pending === 0) return { press: true }; return {}; }
  if (now <= next && now <= s.speed * ARCADE_TUNING.modelDt) {
    const late = Math.floor(rng() * (1 - skill) * 12);      // steps late (a beat is 1/60 s)
    if (late === 0) return { press: true };
    bot.pending = late;
  }
  return {};
}

// --- Neon Serpent ------------------------------------------------------------------------------
const SERPENT = { w: 18, h: 12, step0: 0.16, stepGain: 0.004, stepMin: 0.075, wallLife: 9, foodScore: 10, startLen: 3 };
const SERPENT_DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function serpentNew(rng) {
  const cy = Math.floor(SERPENT.h / 2);
  const body = [];
  for (let i = 0; i < SERPENT.startLen; i++) body.push({ x: 6 - i, y: cy });
  const s = { t: 0, acc: 0, body, dir: 'right', want: 'right', walls: [], food: null, len: SERPENT.startLen, eaten: 0, steps: 0, score: 0, over: false, reason: null };
  s.food = serpentFood(s, rng);
  return s;
}

function serpentOccupied(s, x, y) {
  return s.body.some(b => b.x === x && b.y === y) || s.walls.some(w => w.x === x && w.y === y);
}

function serpentFood(s, rng) {
  for (let k = 0; k < 400; k++) {
    const x = Math.floor(rng() * SERPENT.w), y = Math.floor(rng() * SERPENT.h);
    if (!serpentOccupied(s, x, y)) return { x, y };
  }
  return null;
}

function serpentInterval(s) { return Math.max(SERPENT.stepMin, SERPENT.step0 - SERPENT.stepGain * s.eaten); }

function serpentStep(s, dt, input, rng) {
  s.t += dt;
  if (s.over) return;
  if (input && input.dir && SERPENT_DIRS[input.dir]) {
    const [dx, dy] = SERPENT_DIRS[input.dir], [cx, cy] = SERPENT_DIRS[s.dir];
    if (!(dx === -cx && dy === -cy)) s.want = input.dir;     // never straight back into yourself
  }
  s.acc += dt;
  const interval = serpentInterval(s);
  while (s.acc >= interval && !s.over) {
    s.acc -= interval;
    s.dir = s.want;
    const [dx, dy] = SERPENT_DIRS[s.dir];
    const head = { x: s.body[0].x + dx, y: s.body[0].y + dy };
    // the tail is about to move off its cell, unless we are growing
    const growing = s.body.length < s.len;
    const tail = s.body[s.body.length - 1];
    if (head.x < 0 || head.y < 0 || head.x >= SERPENT.w || head.y >= SERPENT.h) { s.over = true; s.reason = 'the edge'; break; }
    if (s.walls.some(w => w.x === head.x && w.y === head.y)) { s.over = true; s.reason = 'a wall'; break; }
    if (s.body.some((b, i) => b.x === head.x && b.y === head.y && !(i === s.body.length - 1 && !growing))) { s.over = true; s.reason = 'yourself'; break; }
    s.body.unshift(head);
    if (s.food && head.x === s.food.x && head.y === s.food.y) {
      s.len += 1; s.eaten += 1; s.score += SERPENT.foodScore;
      s.food = serpentFood(s, rng);
    }
    if (s.body.length > s.len) {
      const shed = s.body.pop();
      s.walls.push({ x: shed.x, y: shed.y, life: SERPENT.wallLife });   // the tail you shed becomes a wall
    }
    for (let i = s.walls.length - 1; i >= 0; i--) { s.walls[i].life -= 1; if (s.walls[i].life <= 0) s.walls.splice(i, 1); }
    s.steps += 1;
    if (s.steps % 10 === 0) s.score += 1;
  }
  if (s.t >= ARCADE_GAMES.neon_serpent.capSeconds && !s.over) { s.over = true; s.reason = 'time'; }
}

function serpentBot(s, skill, rng, bot) {
  return serpentBotV2(s, skill, rng, bot);
}

function serpentBotOld(s, skill, rng, bot) {
  // Breadth-first to the food over free cells; a careless player sometimes just turns.
  const head = s.body[0];
  const blocked = new Set();
  s.body.forEach((b, i) => { if (i < s.body.length - 1) blocked.add(b.x + ',' + b.y); });
  s.walls.forEach(w => { if (w.life > 1) blocked.add(w.x + ',' + w.y); });
  const free = (x, y) => x >= 0 && y >= 0 && x < SERPENT.w && y < SERPENT.h && !blocked.has(x + ',' + y);
  const [cx, cy] = SERPENT_DIRS[s.dir];
  const legal = Object.keys(SERPENT_DIRS).filter(d => { const [dx, dy] = SERPENT_DIRS[d]; return !(dx === -cx && dy === -cy) && free(head.x + dx, head.y + dy); });
  if (!legal.length) return {};
  if (rng() < (1 - skill) * 0.05) return { dir: legal[Math.floor(rng() * legal.length)] };
  if (s.food) {
    const prev = new Map(); const q = [];
    for (const d of legal) { const [dx, dy] = SERPENT_DIRS[d]; const k = (head.x + dx) + ',' + (head.y + dy); prev.set(k, d); q.push({ x: head.x + dx, y: head.y + dy, first: d }); }
    let qi = 0;
    while (qi < q.length) {
      const c = q[qi++];
      if (c.x === s.food.x && c.y === s.food.y) return { dir: c.first };
      for (const d of Object.keys(SERPENT_DIRS)) {
        const [dx, dy] = SERPENT_DIRS[d]; const nx = c.x + dx, ny = c.y + dy; const k = nx + ',' + ny;
        if (!free(nx, ny) || prev.has(k)) continue;
        prev.set(k, c.first); q.push({ x: nx, y: ny, first: c.first });
      }
    }
  }
  // no route to the food: keep going straight if that is safe, else any safe turn (prefer the one with most room)
  if (legal.includes(s.dir)) return { dir: s.dir };
  return { dir: legal[0] };
}

// Breadth-first to the food, but only by a move that leaves room to live in (a flood fill from the new
// head); otherwise the move with the most room. A careless player skips the room check and sometimes
// just turns.
function serpentBotV2(s, skill, rng, bot) {
  if (bot.step === s.steps && bot.choice) return bot.choice;    // one decision per grid step
  const out = serpentDecide(s, skill, rng);
  bot.step = s.steps; bot.choice = out;
  return out;
}

function serpentDecide(s, skill, rng) {
  const head = s.body[0];
  // A cell is blocked at a given number of steps from now if the body will still be there (the tail
  // leaves as we move) or the wall will not have faded yet.
  const bodyAt = new Map();
  s.body.forEach((b, i) => bodyAt.set(b.x + ',' + b.y, { until: s.body.length - i + SERPENT.wallLife - 1, tail: i === s.body.length - 1 }));   // blocked until the tail has left it and the wall it becomes has faded
  const wallAt = new Map();
  s.walls.forEach(w => wallAt.set(w.x + ',' + w.y, w.life));                     // a wall blocks arrivals while it has life left
  const inside = (x, y) => x >= 0 && y >= 0 && x < SERPENT.w && y < SERPENT.h;
  const free = (x, y, dist) => {
    if (!inside(x, y)) return false;
    const k = x + ',' + y;
    const b = bodyAt.get(k);
    if (b && !(b.tail && dist === 1 && s.body.length >= s.len) && dist <= b.until) return false;
    if (wallAt.has(k) && dist <= wallAt.get(k)) return false;
    return true;
  };
  const [cx, cy] = SERPENT_DIRS[s.dir];
  const legal = Object.keys(SERPENT_DIRS).filter(d => { const [dx, dy] = SERPENT_DIRS[d]; return !(dx === -cx && dy === -cy) && free(head.x + dx, head.y + dy, 1); });
  if (!legal.length) return {};
  if (rng() < (1 - skill) * 0.1) return { dir: legal[Math.floor(rng() * legal.length)] };
  const room = (x, y) => {
    const seen = new Set([x + ',' + y]); const q = [[x, y, 1]]; let qi = 0;
    while (qi < q.length && seen.size < 70) {
      const [px, py, dd] = q[qi++];
      for (const d of Object.keys(SERPENT_DIRS)) {
        const nx = px + SERPENT_DIRS[d][0], ny = py + SERPENT_DIRS[d][1], k = nx + ',' + ny;
        if (free(nx, ny, dd + 1) && !seen.has(k)) { seen.add(k); q.push([nx, ny, dd + 1]); }
      }
    }
    return seen.size;
  };
  const need = Math.min(60, s.len + 6);
  const careful = rng() >= (1 - skill) * 0.7;
  const roomOf = {};
  for (const d of legal) roomOf[d] = room(head.x + SERPENT_DIRS[d][0], head.y + SERPENT_DIRS[d][1]);
  const safe = careful ? legal.filter(d => roomOf[d] >= need) : legal;
  const pool = safe.length ? safe : [legal.slice().sort((a, b) => roomOf[b] - roomOf[a])[0]];
  if (s.food) {
    const prev = new Set(); const q = [];
    for (const d of pool) { const nx = head.x + SERPENT_DIRS[d][0], ny = head.y + SERPENT_DIRS[d][1]; prev.add(nx + ',' + ny); q.push({ x: nx, y: ny, first: d, dist: 1 }); }
    let qi = 0;
    while (qi < q.length) {
      const c = q[qi++];
      if (c.x === s.food.x && c.y === s.food.y) return { dir: c.first };
      for (const d of Object.keys(SERPENT_DIRS)) {
        const nx = c.x + SERPENT_DIRS[d][0], ny = c.y + SERPENT_DIRS[d][1], k = nx + ',' + ny;
        if (!free(nx, ny, c.dist + 1) || prev.has(k)) continue;
        prev.add(k); q.push({ x: nx, y: ny, first: c.first, dist: c.dist + 1 });
      }
    }
  }
  const byRoom = pool.slice().sort((a, b) => roomOf[b] - roomOf[a]);
  return { dir: byRoom[0] };
}

// --- The common interface ----------------------------------------------------------------------

const ARCADE_IMPL = {
  rent_runner: { init: runnerNew, step: runnerStep, bot: runnerBot },
  night_shift: { init: shiftNew, step: shiftStep, bot: shiftBot },
  stack_up: { init: stackNew, step: stackStep, bot: stackBot },
  neon_serpent: { init: serpentNew, step: serpentStep, bot: serpentBot },
};

function arcadeNew(gameId, rng) {
  const impl = ARCADE_IMPL[gameId];
  if (!impl) return null;
  const s = impl.init(rng);
  s.gameId = gameId;
  return s;
}

function arcadeStep(state, dt, input, rng) {
  if (state.over) return state;
  ARCADE_IMPL[state.gameId].step(state, dt, input, rng);
  return state;
}

// The model player: plays the game at fixed steps with the bot's input, decisions from `skill` 0..1.
// Returns the finished state. Deterministic given the rng.
function arcadeModelPlay(gameId, skill, rng) {
  const impl = ARCADE_IMPL[gameId];
  const state = arcadeNew(gameId, rng);
  const bot = {};
  const dt = ARCADE_TUNING.modelDt;
  const cap = ARCADE_GAMES[gameId].capSeconds;
  let guard = 0;
  while (!state.over && state.t < cap + 1 && guard++ < 20000) {
    const input = impl.bot(state, skill, rng, bot);
    arcadeStep(state, dt, input, rng);
  }
  return state;
}

// A roommate's (or anyone's) score in `gameId`, by skill. Pure.
function arcadeModelScore(gameId, skill, rng) {
  return arcadeModelPlay(gameId, skill, rng).score;
}

// --- The score table ---------------------------------------------------------------------------

function arcadeTable(gs, gameId) {
  const a = gs?.world?.games?.arcade;
  return (a && a.table && Array.isArray(a.table[gameId])) ? a.table[gameId] : [];
}

function arcadeEnsure(gs) {
  const g = gamesState(gs);
  if (!g.arcade || typeof g.arcade !== 'object') g.arcade = { table: {} };
  if (!g.arcade.table || typeof g.arcade.table !== 'object') g.arcade.table = {};
  return g.arcade;
}

// Enters a score on the board. Returns { rank (1-based, or 0 if it did not place), newBest (for that person) }.
function arcadeRecord(gs, gameId, who, score, day) {
  const a = arcadeEnsure(gs);
  const list = a.table[gameId] || (a.table[gameId] = []);
  const prevBest = Math.max(0, ...list.filter(e => e.who === who).map(e => e.score));
  list.push({ who, score, day });
  list.sort((x, y) => y.score - x.score || x.day - y.day);
  // one entry per person per game, best first: keep a person's best only
  const seen = new Set();
  a.table[gameId] = list.filter(e => { if (seen.has(e.who)) return false; seen.add(e.who); return true; }).slice(0, ARCADE_TUNING.keep);
  const rank = a.table[gameId].findIndex(e => e.who === who && e.score === Math.max(score, prevBest)) + 1;
  return { rank, newBest: score > prevBest, prevBest };
}

function arcadeBest(gs, gameId, who) {
  return Math.max(0, ...arcadeTable(gs, gameId).filter(e => e.who === who).map(e => e.score));
}

// Who holds the top spot: { who, score } or null. Pure.
function arcadeHolder(gs, gameId) {
  const t = arcadeTable(gs, gameId);
  return t[0] ? { who: t[0].who, score: t[0].score } : null;
}

// --- Roommates on the machine (D5) --------------------------------------------------------------

// A roommate's bot skill on the machine: their game skill (games.js's gameSkillOf, 0..1) plus the slow
// improvement of a regular, one small step per week. Pure.
function arcadeNpcSkill(gs, npcId, gameId, day) {
  const base = typeof gameSkillOf === 'function' ? gameSkillOf(gs, npcId, 'console') : 0.45;
  return Math.max(0.05, Math.min(0.97, base + ARCADE_TUNING.weeklyGain * Math.floor((day || 1) / 7)));
}

// What a roommate scores on a given game in a given week: the model player at their skill, seeded by
// (save, person, game, week). Deterministic; costs one modelled game. Pure.
function arcadeNpcWeekScore(gs, npcId, gameId, week) {
  const skill = arcadeNpcSkill(gs, npcId, gameId, week * 7);
  return arcadeModelScore(gameId, skill, seededRng(gs.meta?.seed, `arcade_${npcId}_${gameId}_${week}`));
}

// Once a week each roommate has a go at one game (their pick is derived). If it beats the board they are
// on it, and if it beats YOUR best they tell you. Returns { lines }. Mutates the table only.
function processArcadeForDay(gs, day) {
  const out = { lines: [] };
  if (!gs?.world || typeof gamesState !== 'function' || day % 7 !== 0) return out;
  const week = Math.floor(day / 7);
  const arcade = arcadeEnsure(gs);
  for (const id of Object.keys(gs.npcs || {}).sort()) {
    if (gs.npcs[id]?.residency?.status !== 'resident') continue;
    const gameId = ARCADE_IDS[hashStr(`${id}|${week}|pick`) % ARCADE_IDS.length];
    const score = arcadeNpcWeekScore(gs, id, gameId, week);
    const mine = arcadeBest(gs, gameId, 'player');
    const before = arcadeBest(gs, gameId, id);
    const rec = arcadeRecord(gs, gameId, id, score, day);
    if (mine > 0 && score > mine && score > before) {
      const name = gs.npcs[id].bible?.name || 'A roommate';
      out.lines.push(`${name} got ${score} on ${ARCADE_GAMES[gameId].label}, past your ${mine}. They will want you to know.`);
    }
  }
  return out;
}
// ===== /SECTION: ARCADE =====
