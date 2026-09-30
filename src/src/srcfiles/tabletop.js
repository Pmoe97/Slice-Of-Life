// ===== SECTION: TABLETOP =====
// Game Room Phase 9 (game-room-overhaul-plan.md D13; 0.14.5): the board games and the party game.
// The board game in your bag is now two quick games — Drop Four (four in a row on a 7×6 grid) and
// Push Your Luck (a dice game: keep rolling for more points, or hold and bank them) — and the house
// has a party game: "Who Is It?", questions about the people at the table, built from what is
// actually true of them (their quirks, likes, dislikes, jobs, interests, and what they have been
// seen doing lately). Console games stay abstract (the user's standing answer, 2026-09-29).
//
// The pure half: the rules, the roommate's play (a search for Drop Four, a hold rule for the dice, a
// familiarity-weighted guess for the party) and whole-game simulators, all seeded (R6). The screens
// are render.games.js.

const TABLETOP = {
  // Drop Four
  c4: { cols: 7, rows: 6, connect: 4, minutes: 20 },
  // Push Your Luck: first to `target`.
  pig: { target: 60, minutes: 20, holdBase: 18, maxTurnRolls: 40 },
  // Who Is It?
  party: {
    questions: 6, perSubject: 2, minutes: 25,
    // How well someone guesses a question about someone else: a base, what they know of them, a little luck.
    guessBase: 0.3, guessFamiliarity: 0.45, guessLuck: 0.12,
    // Events that are nobody else's business are never used as questions.
    banned: /intimate|sex|cum|moan|nude|shower|peep|masturb|voyeur|naked|kiss|makeout|hookup|underwear/i,
    recentDays: 6,
  },
  close: 0.34, blowout: 0.8,
};

// --- Drop Four ---------------------------------------------------------------------------------

function c4New(first) {
  const C = TABLETOP.c4;
  return { b: Array.from({ length: C.rows }, () => new Array(C.cols).fill(0)), turn: first === 'n' ? 2 : 1, moves: 0, winner: null, line: null, last: null };
}

function c4Legal(s) {
  const out = [];
  for (let c = 0; c < TABLETOP.c4.cols; c++) if (s.b[0][c] === 0) out.push(c);
  return out;
}

// The four (or more) in a row through (r, c) for `who`, or null. Pure.
function c4LineAt(b, r, c, who) {
  const C = TABLETOP.c4;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn;
      while (rr >= 0 && rr < C.rows && cc >= 0 && cc < C.cols && b[rr][cc] === who) { cells.push([rr, cc]); rr += dr * sgn; cc += dc * sgn; }
    }
    if (cells.length >= C.connect) return cells;
  }
  return null;
}

// Drops a disc for whoever's turn it is. Mutates. Returns the row it landed in, or -1.
function c4Drop(s, col) {
  const C = TABLETOP.c4;
  if (s.winner || col < 0 || col >= C.cols) return -1;
  let r = C.rows - 1;
  while (r >= 0 && s.b[r][col] !== 0) r--;
  if (r < 0) return -1;
  const who = s.turn;
  s.b[r][col] = who; s.moves += 1; s.last = { r, c: col, who };
  const line = c4LineAt(s.b, r, col, who);
  if (line) { s.winner = who === 1 ? 'p' : 'n'; s.line = line; }
  else if (s.moves >= C.rows * C.cols) s.winner = 'draw';
  else s.turn = who === 1 ? 2 : 1;
  return r;
}

// A cheap read of the position for `who`: windows of four that are still open, weighted by how full.
function c4Score(b, who) {
  const C = TABLETOP.c4;
  const other = who === 1 ? 2 : 1;
  let score = 0;
  for (let r = 0; r < C.rows; r++) score += (b[r][3] === who ? 3 : b[r][3] === other ? -3 : 0);
  const windows = [];
  for (let r = 0; r < C.rows; r++) for (let c = 0; c < C.cols; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= C.rows || ec < 0 || ec >= C.cols) continue;
    const w = [b[r][c], b[r + dr][c + dc], b[r + 2 * dr][c + 2 * dc], b[er][ec]];
    windows.push(w);
  }
  for (const w of windows) {
    const mine = w.filter(x => x === who).length, theirs = w.filter(x => x === other).length;
    if (mine && theirs) continue;
    if (mine === 3) score += 5; else if (mine === 2) score += 2;
    if (theirs === 3) score -= 6; else if (theirs === 2) score -= 2;
  }
  return score;
}

function c4Search(s, depth, alpha, beta, me) {
  if (s.winner) return s.winner === 'draw' ? 0 : ((s.winner === 'p') === (me === 1) ? 100000 + depth : -100000 - depth);
  if (depth === 0) return c4Score(s.b, me);
  const maximizing = s.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  const order = c4Legal(s).sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
  for (const col of order) {
    const t = { b: s.b.map(r => r.slice()), turn: s.turn, moves: s.moves, winner: s.winner, line: null, last: null };
    c4Drop(t, col);
    const v = c4Search(t, depth - 1, alpha, beta, me);
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

// The roommate's move: a search a few plies deep (deeper the better they are), with the odd blunder for the
// less practised. Pure given the rng. Returns a column.
function c4Ai(s, skill, rng) {
  const legal = c4Legal(s);
  if (!legal.length) return -1;
  const sk = Math.max(0, Math.min(1, skill));
  if (rng() < (1 - sk) * 0.22) return legal[Math.floor(rng() * legal.length)];
  const depth = 1 + Math.round(sk * 4);
  const me = s.turn;
  let best = -Infinity, pick = [];
  for (const col of legal.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))) {
    const t = { b: s.b.map(r => r.slice()), turn: s.turn, moves: s.moves, winner: s.winner, line: null, last: null };
    c4Drop(t, col);
    const v = c4Search(t, depth - 1, -Infinity, Infinity, me) + (rng() - 0.5) * 0.01;
    if (v > best + 1e-9) { best = v; pick = [col]; } else if (Math.abs(v - best) <= 1e-9) pick.push(col);
  }
  return pick[Math.floor(rng() * pick.length)];
}

function c4Simulate(rng, skillP, skillN, first) {
  const s = c4New(first);
  let g = 0;
  while (!s.winner && g++ < 60) c4Drop(s, c4Ai(s, s.turn === 1 ? skillP : skillN, rng));
  return s;
}

function c4Result(s, npcName) {
  const name = npcName || 'they';
  if (s.winner === 'draw') return { playerWon: false, draw: true, grade: 'close', summary: `The board fills up: a draw with ${name}.`, moves: s.moves, minutes: TABLETOP.c4.minutes };
  const playerWon = s.winner === 'p';
  const grade = s.moves <= 15 ? 'blowout' : s.moves >= 30 ? 'close' : 'normal';
  return { playerWon, draw: false, grade, moves: s.moves, minutes: TABLETOP.c4.minutes,
    summary: playerWon ? `You get four in a row with ${name} still hunting for a block.` : `${name} gets four in a row. You saw it coming a move too late.` };
}

// --- Push Your Luck ----------------------------------------------------------------------------

function pigNew(first) {
  return { scores: { p: 0, n: 0 }, turn: first === 'n' ? 'n' : 'p', total: 0, over: false, winner: null, rolls: 0, last: null, busts: { p: 0, n: 0 } };
}

// Rolls the die for whoever's turn it is. Mutates. A 1 loses the turn's points and passes the dice.
function pigRoll(s, rng) {
  if (s.over) return null;
  const d = 1 + Math.floor(rng() * 6);
  s.rolls += 1;
  s.last = { who: s.turn, d };
  if (d === 1) {
    s.busts[s.turn] += 1;
    s.last.bust = s.total;
    s.total = 0; s.turn = s.turn === 'p' ? 'n' : 'p';
  } else {
    s.total += d;
    if (s.scores[s.turn] + s.total >= TABLETOP.pig.target) { s.scores[s.turn] += s.total; s.total = 0; s.over = true; s.winner = s.turn; }
  }
  return d;
}

// Banks the turn's points and passes the dice. Mutates.
function pigHold(s) {
  if (s.over || s.total === 0) return false;
  s.scores[s.turn] += s.total;
  s.last = { who: s.turn, held: s.total };
  s.total = 0;
  if (s.scores[s.turn] >= TABLETOP.pig.target) { s.over = true; s.winner = s.turn; return true; }
  s.turn = s.turn === 'p' ? 'n' : 'p';
  return true;
}

// Should this player hold? The classic rule of thumb (hold at about 20), pushed by the score: behind, push;
// close to winning, go for it; skill sharpens it, and a bold temperament (risk > 0) holds later. Pure given rng.
function pigShouldHold(s, who, skill, risk, rng) {
  const P = TABLETOP.pig;
  const mine = s.scores[who], theirs = s.scores[who === 'p' ? 'n' : 'p'];
  if (mine + s.total >= P.target) return true;
  let threshold = P.holdBase + (risk || 0) * 6;
  if (theirs >= P.target - 15) threshold += 8;              // they are about to win: I have to push
  else if (mine - theirs >= 15) threshold -= 5;             // comfortably ahead: bank it
  if (P.target - mine <= 20) threshold = Math.max(threshold, P.target - mine);   // go for the win
  const sk = Math.max(0, Math.min(1, skill));
  let hold = s.total >= threshold;
  if (rng() < (1 - sk) * 0.2) hold = !hold;                 // the less practised misjudge it now and then
  return hold && s.total > 0;
}

function pigSimulate(rng, skillP, skillN, riskP, riskN, first) {
  const s = pigNew(first);
  let g = 0;
  while (!s.over && g++ < 4000) {
    const who = s.turn;
    if (s.total > 0 && pigShouldHold(s, who, who === 'p' ? skillP : skillN, who === 'p' ? riskP : riskN, rng)) pigHold(s);
    else pigRoll(s, rng);
  }
  return s;
}

// How bold a roommate is with the dice, -1..1: the assertive push their luck; the anxious and cautious bank early. Pure.
function tabletopRisk(npc) {
  const t = npc?.bible?.temperament || {};
  const traits = npc?.bible?.personality?.traits || [];
  let r = 0.6 * (t.assertiveness || 0) + 0.2 * (t.volatility || 0);
  if (traits.includes('impulsive') || traits.includes('adventurous') || traits.includes('confident')) r += 0.3;
  if (traits.includes('cautious') || traits.includes('anxious') || traits.includes('methodical')) r -= 0.3;
  return Math.max(-1, Math.min(1, r));
}

function pigResult(s, npcName) {
  const name = npcName || 'they';
  const playerWon = s.winner === 'p';
  const gap = Math.abs(s.scores.p - s.scores.n);
  const grade = gap <= 12 ? 'close' : gap >= 35 ? 'blowout' : 'normal';
  return { playerWon, draw: false, grade, gap, minutes: TABLETOP.pig.minutes,
    summary: playerWon ? `You get to ${TABLETOP.pig.target} first, with ${name} on ${s.scores.n}.` : `${name} gets to ${TABLETOP.pig.target} while you are stuck on ${s.scores.p}.` };
}

// --- Who Is It? (the party game) ---------------------------------------------------------------

function partyName(gs, id) { return gs?.npcs?.[id]?.bible?.name || 'Someone'; }

function partyAn(word) { return /^[aeiou]/i.test(String(word).trim()) ? 'an' : 'a'; }

// Every true, askable fact about someone at the table. Each is { kind, subject, key, text } where `key` is
// the fact itself (so it can be checked to belong to only one person here). Pure.
function partyFactsOf(gs, id) {
  const b = gs?.npcs?.[id]?.bible;
  if (!b) return [];
  const out = [];
  for (const q of b.personality?.quirks || []) out.push({ kind: 'quirk', subject: id, key: 'q:' + String(q).toLowerCase(), text: `Who ${String(q).trim().replace(/[.!]+$/, '')}?` });
  for (const l of b.personality?.likes || []) out.push({ kind: 'like', subject: id, key: 'l:' + String(l).toLowerCase(), text: `Who loves ${String(l).trim().replace(/[.!]+$/, '')}?` });
  for (const d of b.personality?.dislikes || []) out.push({ kind: 'dislike', subject: id, key: 'd:' + String(d).toLowerCase(), text: `Who can't stand ${String(d).trim().replace(/[.!]+$/, '')}?` });
  const title = b.job?.title || b.occupation?.title;
  if (title) out.push({ kind: 'job', subject: id, key: 'j:' + String(title).toLowerCase(), text: `Who works as ${partyAn(title)} ${title}?` });
  for (const i of b.interests || []) { const name = typeof i === 'string' ? i : i?.name; if (name) out.push({ kind: 'interest', subject: id, key: 'i:' + String(name).toLowerCase(), text: `Who is really into ${name}?` }); }
  return out;
}

// What someone at the table has been seen doing lately, as a question: "{name} curled up with a book…"
// becomes "Who curled up with a book…?". Only events with no other placeholders, that you saw, and never
// anything private. Pure.
function partyEventFacts(gs, ids) {
  const P = TABLETOP.party;
  const day = gs?.meta?.clock?.day ?? 1;
  const out = [];
  for (const e of gs?.world?.events || []) {
    if (!e || !ids.includes(e.npcId) || typeof e.template !== 'string' || typeof e.day !== 'number') continue;
    if (day - e.day > P.recentDays || e.seenByPlayer === false) continue;
    if (P.banned.test(String(e.type)) || P.banned.test(e.template)) continue;
    const m = /^\{name\} (.+?)\.?$/.exec(e.template.trim());
    if (!m || /[{}]/.test(m[1]) || m[1].length > 90) continue;
    out.push({ kind: 'seen', subject: e.npcId, key: 'e:' + m[1].toLowerCase(), text: `Who ${m[1].replace(/[.!]+$/, '')}?` });
  }
  return out;
}

// The night's questions: up to TABLETOP.party.questions, each true of exactly one person at the table,
// spread across people (no more than perSubject each). Options are everyone at the table. Pure given the rng.
function partyBuild(gs, ids, rng) {
  const P = TABLETOP.party;
  const at = ids.filter(id => gs?.npcs?.[id]);
  if (at.length < 2) return [];
  const facts = [];
  for (const id of at) facts.push(...partyFactsOf(gs, id));
  facts.push(...partyEventFacts(gs, at));
  // a fact is askable only if it is true of exactly one person here
  const holders = {};
  for (const f of facts) (holders[f.key] || (holders[f.key] = new Set())).add(f.subject);
  const askable = facts.filter(f => holders[f.key].size === 1);
  // dedupe by key, shuffle by rng
  const seen = new Set(); const pool = [];
  for (const f of askable) if (!seen.has(f.key)) { seen.add(f.key); pool.push(f); }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // what has been seen lately goes first (they are the freshest), then the rest
  pool.sort((a, b) => (b.kind === 'seen') - (a.kind === 'seen'));
  const per = {}; const picked = [];
  for (const f of pool) {
    if ((per[f.subject] || 0) >= P.perSubject) continue;
    per[f.subject] = (per[f.subject] || 0) + 1;
    picked.push(f);
    if (picked.length >= P.questions) break;
  }
  // and mix the order
  for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  return picked.map((f, n) => ({ n, kind: f.kind, text: f.text, answer: f.subject, options: at.slice() }));
}

// How likely `guesserId` is to know a fact about `subjectId`: the base, how fond they are of each other
// (the castWeb, both ways), and a little luck. The player's guess is their own; this is for roommates. Pure.
function partyKnowledge(gs, guesserId, subjectId) {
  if (guesserId === subjectId) return 0;
  const P = TABLETOP.party;
  let fam = 0.5;
  const key = [guesserId, subjectId].sort().join('|');
  const axes = gs?.world?.castWeb?.[key]?.axes;
  if (axes) {
    const a = axes[`${guesserId}→${subjectId}`]?.affection, b = axes[`${subjectId}→${guesserId}`]?.affection;
    const v = [a, b].filter(x => typeof x === 'number');
    if (v.length) fam = Math.max(0, Math.min(1, 0.5 + v.reduce((x, y) => x + y, 0) / v.length));
  }
  return Math.max(0.05, Math.min(0.95, P.guessBase + P.guessFamiliarity * fam));
}

// A roommate's answer to one question: they know it about themselves and don't answer (null); otherwise
// they get it right with the chance above, else name someone else at the table. Pure given the rng.
function partyNpcAnswer(gs, q, guesserId, rng) {
  if (q.answer === guesserId) return null;
  const P = TABLETOP.party;
  const p = partyKnowledge(gs, guesserId, q.answer) + (rng() - 0.5) * 2 * P.guessLuck;
  if (rng() < p) return q.answer;
  const wrong = q.options.filter(o => o !== q.answer && o !== guesserId);
  return wrong.length ? wrong[Math.floor(rng() * wrong.length)] : q.answer;
}

// The player's modelled answer (headless): how well they know the person, by how much that person likes them
// and what the two of you have shared. Pure given the rng.
function partyPlayerGuess(gs, q, rng) {
  const npc = gs?.npcs?.[q.answer];
  const aff = Math.max(0, Math.min(1, ((npc?.relPlayer?.affection || 0) + 1) / 2));
  const p = Math.max(0.1, Math.min(0.9, TABLETOP.party.guessBase + TABLETOP.party.guessFamiliarity * aff));
  if (rng() < p) return q.answer;
  const wrong = q.options.filter(o => o !== q.answer);
  return wrong.length ? wrong[Math.floor(rng() * wrong.length)] : q.answer;
}

// Scores an answer sheet: `answers[qn][id]` is who each person named. Returns { scores: { id: points } }. Pure.
function partyScore(questions, answers, ids) {
  const scores = {};
  for (const id of ids) scores[id] = 0;
  for (const q of questions) for (const id of ids) if (answers[q.n] && answers[q.n][id] === q.answer) scores[id] += 1;
  return scores;
}

// The night, played by the model: everyone guesses every question that is not about them. Returns { questions,
// answers, scores }. Pure given the rng.
function partySimulate(gs, ids, rng) {
  const questions = partyBuild(gs, ids, rng);
  const answers = {};
  const all = ['player', ...ids];
  for (const q of questions) {
    answers[q.n] = {};
    answers[q.n].player = partyPlayerGuess(gs, q, rng);
    for (const id of ids) { const a = partyNpcAnswer(gs, q, id, rng); if (a) answers[q.n][id] = a; }
  }
  return { questions, answers, scores: partyScore(questions, answers, all) };
}

// The night's result against the table: one entry per roommate (chips = their score), your place, a line. Pure.
function partyNightResult(gs, scores, ids, questions) {
  const T = TABLETOP;
  const me = scores.player || 0;
  const results = ids.map(id => {
    const theirs = scores[id] || 0;
    const rel = questions.length ? Math.abs(me - theirs) / questions.length : 0;
    return { npcId: id, playerWon: me > theirs, grade: rel <= T.close ? 'close' : rel >= T.blowout ? 'blowout' : 'normal', chips: theirs };
  });
  const order = ['player', ...ids].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  // Ties share a place (1, 2, 2, 4): you are first only if nobody scored more than you.
  const place = 1 + ids.filter(id => (scores[id] || 0) > me).length;
  const avg = ids.length ? ids.reduce((a, id) => a + (scores[id] || 0), 0) / ids.length : 0;
  const top = order[0];
  const level = ids.filter(id => (scores[id] || 0) === me);
  const summary = place === 1 && !level.length
    ? `You know this house best: ${me} of ${questions.length}.`
    : place === 1
      ? `You tie for the lead with ${level.map(id => partyName(gs, id)).join(' and ')}: ${me} of ${questions.length} each.`
      : `${partyName(gs, top)} knows the house best: ${scores[top]} of ${questions.length}, against your ${me}.`;
  return { results, place, seats: ids.length + 1, net: Math.round((me - avg) * 10), summary, minutes: T.party.minutes, questions: questions.length, scores, hands: 0 };
}
// ===== /SECTION: TABLETOP =====
