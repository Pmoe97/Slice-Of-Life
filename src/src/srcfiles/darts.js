// ===== SECTION: DARTS =====
// Game Room Phase 2 (game-room-overhaul-plan.md D9; 0.14.5). Darts is a timing game: the crosshair
// sweeps the board on two axes at once, you tap to throw where it is, and your steadiness (the
// 'games' skill) decides how much your hand wobbles on top. Two games: 301 (count down to exactly
// zero; go past it and the turn is bust) and Around the Clock (1 to 20, then the bull).
//
// This file is the pure half: the board's geometry and scoring, a thrower's spread, the state
// machine of a match, a roommate's aim, and a whole-match simulator (the headless result, and the
// "let it play out" button). The modal UI is render.games.js. Everything takes an rng, so a
// seeded match replays exactly (R6).

const DARTS_TUNING = {
  // The board, clockwise from the top, and where its rings sit (as a share of the radius).
  sectors: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5],
  rings: { bull: 0.035, outerBull: 0.09, tripleIn: 0.55, tripleOut: 0.62, doubleIn: 0.92, doubleOut: 1.0 },
  modes: { '301': { label: '301', start: 301, maxTurns: 14, minutes: 25 }, clock: { label: 'Around the Clock', maxTurns: 14, minutes: 20 } },
  throwsPerTurn: 3,
  // A thrower's spread (one standard deviation, in board radii) by skill 0..1.
  sigmaMax: 0.36, sigmaMin: 0.08,
  // The player's hand adds only this share of that, on top of where the crosshair was: the crosshair
  // timing is the game, the wobble is the skill.
  playerWobble: 0.5,
  // The crosshair: how far it sweeps and how slowly (seconds per pass) by skill.
  aimAmp: 0.85, aimPeriodX: 2.1, aimPeriodY: 1.55, aimSlowPerSkill: 0.6,
  // Grading a result: the loser's remaining points (301) or numbers still to hit (clock).
  grade301: { close: 40, blowout: 200 }, gradeClock: { close: 3, blowout: 10 },
};

function dartsSigma(skill) {
  const T = DARTS_TUNING;
  const s = Math.max(0, Math.min(1, skill));
  return T.sigmaMax - (T.sigmaMax - T.sigmaMin) * s;
}

// A normal draw from one rng() stream (Box–Muller). Pure given the rng.
function dartsGauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// dartsLanding plus where it stuck (the UI draws the dart there). Pure.
function dartsAt(x, y) {
  return { ...dartsLanding(x, y), x, y };
}

// What a dart at (x, y) — board radii from the centre, y down — has hit. Pure.
function dartsLanding(x, y) {
  const R = DARTS_TUNING.rings;
  const r = Math.sqrt(x * x + y * y);
  if (r <= R.bull) return { ring: 'bull', sector: 25, points: 50, label: 'bullseye', mult: 2 };
  if (r <= R.outerBull) return { ring: 'outer', sector: 25, points: 25, label: 'the outer bull', mult: 1 };
  if (r > R.doubleOut) return { ring: 'miss', sector: 0, points: 0, label: 'a miss', mult: 0 };
  // Angle clockwise from straight up; each sector spans 18 degrees, centred on its number.
  let a = Math.atan2(x, -y) * 180 / Math.PI;
  if (a < 0) a += 360;
  const sector = DARTS_TUNING.sectors[Math.floor(((a + 9) % 360) / 18)];
  const mult = r >= R.doubleIn ? 2 : (r >= R.tripleIn && r <= R.tripleOut) ? 3 : 1;
  const ring = mult === 2 ? 'double' : mult === 3 ? 'treble' : 'single';
  return { ring, sector, points: sector * mult, label: mult === 2 ? `double ${sector}` : mult === 3 ? `treble ${sector}` : String(sector), mult };
}

// The centre of a segment: where you would aim to hit `sector` in the `mult` ring (1, 2 or 3). Pure.
function dartsAimPoint(sector, mult) {
  if (sector === 25) return mult === 2 ? { x: 0, y: 0 } : { x: 0, y: -0.062 };
  const i = DARTS_TUNING.sectors.indexOf(sector);
  const ang = i * 18 * Math.PI / 180;
  const R = DARTS_TUNING.rings;
  const r = mult === 3 ? (R.tripleIn + R.tripleOut) / 2 : mult === 2 ? (R.doubleIn + R.doubleOut) / 2 : 0.32 + 0.18;
  return { x: Math.sin(ang) * r, y: -Math.cos(ang) * r };
}

// --- The match ---------------------------------------------------------------------------------

function dartsNew(mode) {
  const M = DARTS_TUNING.modes[mode] || DARTS_TUNING.modes['301'];
  return {
    mode: DARTS_TUNING.modes[mode] ? mode : '301',
    left: { p: M.start || 0, n: M.start || 0 },     // 301: points remaining
    at: { p: 1, n: 1 },                             // clock: the number to hit next (1..20, 21 = bull)
    turn: 'p', dartsLeft: DARTS_TUNING.throwsPerTurn, turns: 0,
    turnStart: { p: M.start || 0, n: M.start || 0, pAt: 1, nAt: 1 },
    winner: null, log: [],
  };
}

function dartsOther(who) { return who === 'p' ? 'n' : 'p'; }

// What this thrower needs next, as the target the AI aims at. Pure.
function dartsTarget(state, who) {
  if (state.mode === 'clock') {
    const n = state.at[who];
    return n >= 21 ? { sector: 25, mult: 2 } : { sector: n, mult: 1 };
  }
  const r = state.left[who];
  if (r > 60) return { sector: 20, mult: 3 };
  if (r <= 20) return { sector: r, mult: 1 };
  if (r <= 40 && r % 2 === 0) return { sector: r / 2, mult: 2 };
  return { sector: 20, mult: 1 };
}

// Applies one dart. Mutates and returns { hit, bust, turnEnd, win }. Pure given the state.
function dartsApplyThrow(state, who, landing) {
  if (state.winner || state.turn !== who) return null;
  const out = { hit: landing, bust: false, turnEnd: false, win: false };
  if (state.mode === 'clock') {
    const want = state.at[who];
    const hit = want >= 21 ? landing.sector === 25 : (landing.sector === want && landing.ring !== 'miss');
    if (hit) { state.at[who] = want + 1; if (state.at[who] > 21) { state.winner = who; out.win = true; } }
  } else {
    const after = state.left[who] - landing.points;
    if (after === 0) { state.left[who] = 0; state.winner = who; out.win = true; }
    else if (after < 0) { out.bust = true; state.left[who] = state.turnStart[who]; }
    else state.left[who] = after;
  }
  state.log.push({ who, sector: landing.sector, ring: landing.ring, points: landing.points });
  state.dartsLeft -= 1;
  if (!state.winner && (state.dartsLeft <= 0 || out.bust)) {
    out.turnEnd = true;
    state.turn = dartsOther(who);
    state.dartsLeft = DARTS_TUNING.throwsPerTurn;
    if (who === 'n') state.turns += 1;
    state.turnStart = { p: state.left.p, n: state.left.n, pAt: state.at.p, nAt: state.at.n };
    const M = DARTS_TUNING.modes[state.mode];
    if (state.turns >= M.maxTurns) dartsCallIt(state);
  }
  return out;
}

// Out of turns: the one closer to finishing takes it (a tie goes to the one who threw second — the
// roommate — so a stalemate is never a free win). Mutates.
function dartsCallIt(state) {
  if (state.winner) return;
  if (state.mode === 'clock') state.winner = state.at.p > state.at.n ? 'p' : 'n';
  else state.winner = state.left.p < state.left.n ? 'p' : 'n';
}

// A roommate's throw at their target: the target's centre plus their spread. Pure given the rng.
function dartsNpcThrow(rng, skill, target) {
  const t = dartsAimPoint(target.sector, target.mult);
  const s = dartsSigma(skill);
  return dartsAt(t.x + dartsGauss(rng) * s, t.y + dartsGauss(rng) * s);
}

// The player's throw: where the crosshair was, plus the hand's wobble. Pure given the rng.
function dartsPlayerThrow(rng, skill, x, y) {
  const s = dartsSigma(skill) * DARTS_TUNING.playerWobble;
  return dartsAt(x + dartsGauss(rng) * s, y + dartsGauss(rng) * s);
}

// The crosshair at time t seconds for a player of this skill: two out-of-phase sweeps. Pure.
function dartsCrosshair(t, skill) {
  const T = DARTS_TUNING;
  const slow = 1 + T.aimSlowPerSkill * Math.max(0, Math.min(1, skill));
  return {
    x: T.aimAmp * Math.sin(2 * Math.PI * t / (T.aimPeriodX * slow)),
    y: T.aimAmp * Math.sin(2 * Math.PI * t / (T.aimPeriodY * slow) + 1.1),
  };
}

// The whole match, played out by the model: both sides throw like a thrower of their skill aiming at
// what they need. The headless result, and the "let it play out" button. Returns the state.
function dartsSimulate(rng, mode, skillP, skillN, from) {
  const state = from || dartsNew(mode);
  let guard = 0;
  while (!state.winner && guard++ < 400) {
    const who = state.turn;
    const landing = who === 'p'
      ? dartsNpcThrow(rng, skillP, dartsTarget(state, 'p'))
      : dartsNpcThrow(rng, skillN, dartsTarget(state, 'n'));
    dartsApplyThrow(state, who, landing);
  }
  if (!state.winner) dartsCallIt(state);
  return state;
}

// { playerWon, grade, summary } for a finished match. Pure.
function dartsResult(state, npcName) {
  const T = DARTS_TUNING;
  const playerWon = state.winner === 'p';
  let gap;
  if (state.mode === 'clock') {
    const loser = playerWon ? 'n' : 'p';
    gap = 21 - state.at[loser] + 1; // numbers the loser still needed
  } else {
    gap = state.left[playerWon ? 'n' : 'p'];
  }
  const G = state.mode === 'clock' ? T.gradeClock : T.grade301;
  const grade = gap <= G.close ? 'close' : gap >= G.blowout ? 'blowout' : 'normal';
  const name = npcName || 'they';
  const summary = state.mode === 'clock'
    ? (playerWon ? `You get to the bull first, with ${name} still needing ${gap} more.` : `${name} hits the bull first, and you still needed ${gap} more.`)
    : (playerWon ? `You finish on exactly zero; ${name} still has ${gap} to go.` : `${name} finishes on exactly zero; you still had ${gap} to go.`);
  return { playerWon, grade, summary, turns: state.turns + 1, gap };
}
// ===== /SECTION: DARTS =====
