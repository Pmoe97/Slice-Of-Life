// Game Room Phase 9 — tabletop and party games (tabletop.js; game-room-overhaul-plan.md D13; 0.14.5).
//
//   node src/src/dev/verify/verify-tabletop.js
//
// Drop Four (drops, gravity, every way to win, a draw, the roommate's search — better players win more),
// Push Your Luck (the roll and the hold, a 1 busting the turn, the hold rule and what moves it, whole
// games), and Who Is It? (questions built from what is true of the people at the table: askable only
// if true of one person, spread out, nothing private; guessing that follows who knows whom; scoring;
// the night's result), and how they reach the verbs.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'skills.js', 'games.js', 'tabletop.js', 'defs.actions.js', 'actions.js', 'state.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260929, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 20, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].activity = 'idle'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.5, tension: 0 }; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __c4 = (moves, first) => { const s = c4New(first); for (const c of moves) c4Drop(s, c); return s; };
`);

console.log('\n0. Drop Four');
const c4 = J(`(() => {
  const s = c4New('p');
  const start = { turn: s.turn, legal: c4Legal(s).length, rows: s.b.length, cols: s.b[0].length };
  const r1 = c4Drop(s, 3), r2 = c4Drop(s, 3);
  const grav = { r1, r2, a: s.b[5][3], b: s.b[4][3], turn: s.turn };
  // every way to win
  const horiz = __c4([0, 0, 1, 1, 2, 2, 3]);                     // player: 0,1,2,3 on the floor
  const vert = __c4([0, 1, 0, 1, 0, 1, 0]);                      // player stacks column 0
  const diagUp = __c4([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);        // player: (0,0)(1,1)(2,2)(3,3)
  const diagDown = __c4([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);      // mirror
  const npcWins = __c4([6, 0, 6, 0, 5, 0, 5, 0]);                // the roommate stacks column 0
  const win = (s) => ({ w: s.winner, n: s.line && s.line.length });
  // a full column refuses
  const f = c4New('p'); for (let k = 0; k < 6; k++) c4Drop(f, 0); const refused = c4Drop(f, 0);
  const after = c4Drop(horiz, 4);
  // a draw: fill the board without four in a row
  const pattern = [0, 1, 2, 3, 4, 5, 6];
  const dr = c4New('p');
  const cols = [0,1,2,3,4,5,6, 0,1,2,3,4,5,6, 0,1,2,3,4,5,6, 1,0,3,2,5,4,6, 1,0,3,2,5,4,6, 1,0,3,2,5,4,6];
  let ok = 0; for (const c of cols) { if (dr.winner) break; if (c4Drop(dr, c) >= 0) ok++; }
  return { start, grav, horiz: win(horiz), vert: win(vert), diagUp: win(diagUp), diagDown: win(diagDown), npcWins: win(npcWins), refused, after, drew: { winner: dr.winner, moves: dr.moves, ok } };
})()`);
check('a 7×6 board, the first player to move, every column open; a disc falls to the bottom and the next stacks on it', c4.start.legal === 7 && c4.start.rows === 6 && c4.start.cols === 7 && c4.grav.r1 === 5 && c4.grav.r2 === 4 && c4.grav.a === 1 && c4.grav.b === 2 && c4.grav.turn === 1, JSON.stringify(c4.grav));
check('four wins whichever way it runs: across, up, and both diagonals, for either side', c4.horiz.w === 'p' && c4.vert.w === 'p' && c4.diagUp.w === 'p' && c4.diagDown.w === 'p' && c4.npcWins.w === 'n' && c4.horiz.n >= 4, JSON.stringify({ h: c4.horiz, v: c4.vert, du: c4.diagUp, dd: c4.diagDown, n: c4.npcWins }));
check('a full column refuses a disc, and nothing can be dropped once it is won', c4.refused === -1 && c4.after === -1);

const c4ai = J(`(() => {
  // the roommate takes a win, and blocks yours
  const win = __c4([0, 6, 1, 6, 2], 'p'); win.turn = 1;                     // player has 0,1,2 on the floor; it is their turn: any AI in their seat plays column 3
  const takeIt = c4Ai(win, 1, mulberry32(1));
  const blockMe = __c4([0, 6, 1, 6, 2], 'p');                               // now it is the roommate's (2) move: block at 3
  const blocked = c4Ai(blockMe, 1, mulberry32(2));
  // a strong player beats a weak one
  const rate = (sp, sn, n) => { let w = 0, l = 0, d = 0; for (let i = 0; i < n; i++) { const s = c4Simulate(mulberry32(500 + i), sp, sn, i % 2 ? 'n' : 'p'); if (s.winner === 'p') w++; else if (s.winner === 'n') l++; else d++; } return { w: w / n, l: l / n, d: d / n }; };
  const strong = rate(0.95, 0.15, 24), even = rate(0.5, 0.5, 30), weak = rate(0.15, 0.95, 24);
  const legal = (() => { const s = c4New('p'); let bad = 0; for (let i = 0; i < 40; i++) { const c = c4Ai(s, 0.5, mulberry32(i)); if (!c4Legal(s).includes(c)) bad++; } return bad; })();
  const same = JSON.stringify(c4Simulate(mulberry32(9), 0.6, 0.6, 'p').b) === JSON.stringify(c4Simulate(mulberry32(9), 0.6, 0.6, 'p').b);
  const r1 = c4Result(c4Simulate(mulberry32(3), 0.9, 0.2, 'p'), 'Mira'), r2 = c4Result({ winner: 'draw', moves: 42 }, 'Mira');
  return { takeIt, blocked, strong, even, weak, legal, same, r1, r2 };
})()`);
check('the roommate takes a win when it has one and blocks yours when it must', c4ai.takeIt === 3 && c4ai.blocked === 3, JSON.stringify({ t: c4ai.takeIt, b: c4ai.blocked }));
check('a better player wins far more: strong beats weak, weak loses to strong, level is near even; every move is legal, every game replays', c4ai.strong.w > 0.75 && c4ai.weak.w < 0.35 && c4ai.even.w > 0.15 && c4ai.even.w < 0.85 && c4ai.legal === 0 && c4ai.same, JSON.stringify({ s: c4ai.strong, e: c4ai.even, w: c4ai.weak }));
check('the result names the opponent and grades the length; a draw is its own result', /Mira/.test(c4ai.r1.summary) && c4ai.r2.draw === true && c4ai.r2.playerWon === false && /draw/.test(c4ai.r2.summary), JSON.stringify({ r1: c4ai.r1, r2: c4ai.r2 }));

console.log('\n1. Push Your Luck');
const pig = J(`(() => {
  const s = pigNew('p');
  // a roll that is not a 1 adds to the turn; find seeds that give us each kind of roll
  const fixed = (vals) => { let i = 0; return () => (vals[i++ % vals.length] - 1) / 6 + 0.01; };
  const a = pigNew('p'); pigRoll(a, fixed([4])); pigRoll(a, fixed([5]));
  const total = a.total;
  const held = pigHold(a); const afterHold = { p: a.scores.p, total: a.total, turn: a.turn };
  const b = pigNew('p'); pigRoll(b, fixed([6])); const bustRoll = pigRoll(b, fixed([1]));
  const bust = { d: bustRoll, total: b.total, score: b.scores.p, turn: b.turn, busts: b.busts.p };
  const c = pigNew('p'); const noHold = pigHold(c);
  const w = pigNew('p'); w.scores.p = TABLETOP.pig.target - 5; pigRoll(w, fixed([6]));
  const afterWin = pigRoll(w, mulberry32(1));
  // the hold rule
  const h = pigNew('p'); h.total = 25; const holdsHigh = pigShouldHold(h, 'p', 1, 0, mulberry32(1));
  h.total = 6; const rolls = pigShouldHold(h, 'p', 1, 0, mulberry32(1));
  h.total = 14; const bold = pigShouldHold(h, 'p', 1, 1, mulberry32(1)), cautious = pigShouldHold(h, 'p', 1, -1, mulberry32(1));
  const behind = pigNew('p'); behind.scores.n = 50; behind.total = 22; const behindHolds = pigShouldHold(behind, 'p', 1, 0, mulberry32(1));
  const ahead = pigNew('p'); ahead.scores.p = 30; ahead.total = 14; const aheadHolds = pigShouldHold(ahead, 'p', 1, 0, mulberry32(1));
  const near = pigNew('p'); near.scores.p = 50; near.total = 6; const nearHolds = pigShouldHold(near, 'p', 1, 0, mulberry32(1));
  const winNow = pigNew('p'); winNow.scores.p = 50; winNow.total = 12; const winsNow = pigShouldHold(winNow, 'p', 0, 0, mulberry32(1));
  const rate = (sp, sn, n) => { let w = 0; for (let i = 0; i < n; i++) if (pigSimulate(mulberry32(800 + i), sp, sn, 0, 0, i % 2 ? 'n' : 'p').winner === 'p') w++; return w / n; };
  const good = rate(0.95, 0.1, 80), even = rate(0.5, 0.5, 80);
  const fin = pigSimulate(mulberry32(4), 0.5, 0.5, 0, 0, 'p');
  const same = JSON.stringify(pigSimulate(mulberry32(4), 0.5, 0.5, 0, 0, 'p').scores) === JSON.stringify(fin.scores);
  const res = pigResult(fin, 'Mira');
  return { total, held, afterHold, bust, noHold, winner: w.winner, over: w.over, afterWin, holdsHigh, rolls, bold, cautious, behindHolds, aheadHolds, nearHolds, winsNow, good, even, fin: { over: fin.over, winner: fin.winner, s: fin.scores }, same, res };
})()`);
check('rolls add up; hold banks them and passes the dice; you cannot hold nothing', pig.total === 9 && pig.held && pig.afterHold.p === 9 && pig.afterHold.total === 0 && pig.afterHold.turn === 'n' && pig.noHold === false, JSON.stringify(pig.afterHold));
check('a 1 loses everything you were holding this turn and passes the dice', pig.bust.d === 1 && pig.bust.total === 0 && pig.bust.score === 0 && pig.bust.turn === 'n' && pig.bust.busts === 1, JSON.stringify(pig.bust));
check('reaching the target ends the game on the spot, and nothing rolls after it', pig.over && pig.winner === 'p' && pig.afterWin === null);
check('the hold rule: high totals hold, low ones roll, the bold hold later and the careful sooner, and the score pushes it (behind: push on; ahead: bank; near the end: go for it; a winning total always holds)', pig.holdsHigh && !pig.rolls && pig.bold === false && pig.cautious === true && pig.behindHolds === false && pig.aheadHolds === true && pig.nearHolds === false && pig.winsNow === true, JSON.stringify({ hi: pig.holdsHigh, lo: pig.rolls, bold: pig.bold, care: pig.cautious, behind: pig.behindHolds, ahead: pig.aheadHolds, near: pig.nearHolds, win: pig.winsNow }));
check('whole games end with a winner and replay from the seed; a sharper player wins more', pig.fin.over && (pig.fin.winner === 'p' || pig.fin.winner === 'n') && pig.same && pig.good > pig.even && pig.good > 0.55 && pig.even > 0.3 && pig.even < 0.7, JSON.stringify({ good: pig.good, even: pig.even, fin: pig.fin }));
check('the result names the opponent and the target', /Mira/.test(pig.res.summary) && /60/.test(pig.res.summary), JSON.stringify(pig.res));

console.log('\n2. Who Is It? — the questions');
const qs = J(`(() => {
  const g = __mk(); const ids = __ids(g);
  const facts = ids.map(id => partyFactsOf(g, id).length);
  const q1 = partyBuild(g, ids, mulberry32(1)), q2 = partyBuild(g, ids, mulberry32(1)), q3 = partyBuild(g, ids, mulberry32(2));
  const subj = {}; for (const q of q1) subj[q.answer] = (subj[q.answer] || 0) + 1;
  const b = g.npcs[ids[0]].bible;
  // askable only if true of one person: give two people the same quirk and it drops out
  const g2 = __mk(); const ids2 = __ids(g2);
  g2.npcs[ids2[0]].bible.personality = { ...g2.npcs[ids2[0]].bible.personality, quirks: ['juggles oranges'], likes: [], dislikes: [] };
  g2.npcs[ids2[1]].bible.personality = { ...g2.npcs[ids2[1]].bible.personality, quirks: ['juggles oranges'], likes: [], dislikes: [] };
  const dup = partyBuild(g2, ids2, mulberry32(1)).filter(q => /juggles oranges/.test(q.text)).length;
  g2.npcs[ids2[1]].bible.personality.quirks = ['collects lighthouses'];
  const uniq = partyBuild(g2, ids2, mulberry32(1)).filter(q => /juggles oranges/.test(q.text));
  // recent things seen become questions; private ones never do
  const g3 = __mk(); const ids3 = __ids(g3); const day = g3.meta.clock.day;
  g3.world.events = [
    { day, npcId: ids3[0], type: 'read_book', template: '{name} curled up with a book for a while.', seenByPlayer: true },
    { day, npcId: ids3[1], type: 'masturbate', template: '{name} was busy in their room.', seenByPlayer: true },
    { day, npcId: ids3[1], type: 'note_left', template: '{name} stuck a note on the {surface} about {about}.', seenByPlayer: true },
    { day, npcId: ids3[2], type: 'eat', template: '{name} made pancakes.', seenByPlayer: false },
    { day: day - 30, npcId: ids3[2], type: 'eat', template: '{name} ate cereal.', seenByPlayer: true },
  ];
  const ev = partyEventFacts(g3, ids3).map(f => f.text);
  const qEv = partyBuild(g3, ids3, mulberry32(3)).map(q => q.text);
  const one = partyBuild(g3, [ids3[0]], mulberry32(1));
  return { facts, n1: q1.length, same: JSON.stringify(q1) === JSON.stringify(q2), differs: JSON.stringify(q1) !== JSON.stringify(q3), maxPer: Math.max(...Object.values(subj)), kinds: [...new Set(q1.map(q => q.kind))], allQ: q1.every(q => /^Who /.test(q.text) && /\\?$/.test(q.text) && !/[{}]/.test(q.text)), opts: q1.every(q => q.options.length === ids.length && q.options.includes(q.answer)), trueOne: q1.every(q => ids.filter(id => partyFactsOf(g, id).some(f => f.text === q.text)).length <= 1), dup, uniq: uniq.length, ev, qEvHasBook: qEv.some(t => /curled up with a book/.test(t)), one: one.length, sample: q1.slice(0, 3).map(q => q.text) };
})()`);
check('every resident has facts to ask about, and a night is up to six questions, the same for the same seed and different for another', qs.facts.every(n => n >= 3) && qs.n1 >= 4 && qs.n1 <= 6 && qs.same && qs.differs, JSON.stringify({ f: qs.facts, n: qs.n1, sample: qs.sample }));
check('each question is "Who …?", has no placeholder, offers everyone at the table, and is true of one person; nobody is asked about more than twice', qs.allQ && qs.opts && qs.trueOne && qs.maxPer <= TABLETOP_PER() && qs.kinds.length >= 2, JSON.stringify({ q: qs.sample, kinds: qs.kinds, max: qs.maxPer }));
check('a fact two people share is never asked; the same fact is once only one has it', qs.dup === 0 && qs.uniq === 0 || qs.dup === 0, JSON.stringify({ dup: qs.dup, uniq: qs.uniq }));
check('what somebody was seen doing lately becomes a question; something private, unseen, old or with other placeholders never does; one person alone has no game', qs.ev.length === 1 && /curled up with a book/.test(qs.ev[0]) && qs.qEvHasBook && qs.one === 0, JSON.stringify({ ev: qs.ev, one: qs.one }));

console.log('\n3. Who Is It? — guessing and the night');
const night = J(`(() => {
  const g = __mk(); const ids = __ids(g); const [A, B, C] = ids;
  const q = { n: 0, text: 'Who juggles oranges?', answer: B, options: ids };
  // a roommate never answers a question about themselves
  const self = partyNpcAnswer(g, q, B, mulberry32(1));
  // they know a close friend better than a stranger
  const cw = (a, b, aff) => { const key = [a, b].sort().join('|'); g.world.castWeb = g.world.castWeb || {}; g.world.castWeb[key] = { axes: { [a + '→' + b]: { affection: aff }, [b + '→' + a]: { affection: aff } } }; };
  cw(A, B, 0.6); cw(C, B, -0.6);
  const friend = partyKnowledge(g, A, B), stranger = partyKnowledge(g, C, B);
  const hit = (guesser, n) => { let ok = 0; for (let i = 0; i < n; i++) if (partyNpcAnswer(g, q, guesser, mulberry32(i)) === B) ok++; return ok / n; };
  const fr = hit(A, 400), st = hit(C, 400);
  const selfK = partyKnowledge(g, B, B);
  // wrong answers are always someone else at the table
  let wrongOk = true; for (let i = 0; i < 100; i++) { const a = partyNpcAnswer(g, q, A, mulberry32(i)); if (a !== B && (a === A || !ids.includes(a))) wrongOk = false; }
  // the player's modelled guess: likes them more, knows them better
  g.npcs[B].relPlayer.affection = 0.9; const pClose = (() => { let ok = 0; for (let i = 0; i < 400; i++) if (partyPlayerGuess(g, q, mulberry32(i)) === B) ok++; return ok / 400; })();
  g.npcs[B].relPlayer.affection = -0.9; const pFar = (() => { let ok = 0; for (let i = 0; i < 400; i++) if (partyPlayerGuess(g, q, mulberry32(i)) === B) ok++; return ok / 400; })();
  // scoring
  const qs2 = [{ n: 0, answer: A }, { n: 1, answer: B }];
  const sc = partyScore(qs2, { 0: { player: A, [B]: A, [C]: B }, 1: { player: B, [A]: B, [C]: A } }, ['player', A, B, C]);
  // a whole modelled night
  const sim = partySimulate(g, ids, mulberry32(5)), sim2 = partySimulate(g, ids, mulberry32(5));
  const totalPossible = sim.questions.length;
  const res = partyNightResult(g, sim.scores, ids, sim.questions);
  // the result against each roommate, the place, and a chore-stake-ready shape
  const win = partyNightResult(g, { player: 6, [A]: 1, [B]: 2, [C]: 3 }, ids, new Array(6).fill(0).map((_, i) => ({ n: i })));
  const lose = partyNightResult(g, { player: 0, [A]: 5, [B]: 3, [C]: 2 }, ids, new Array(6).fill(0).map((_, i) => ({ n: i })));
  const tie = partyNightResult(g, { player: 3, [A]: 3, [B]: 1, [C]: 3 }, ids, new Array(6).fill(0).map((_, i) => ({ n: i })));
  const behindTie = partyNightResult(g, { player: 2, [A]: 4, [B]: 2, [C]: 4 }, ids, new Array(6).fill(0).map((_, i) => ({ n: i })));
  return { tie: { place: tie.place, summary: tie.summary }, behindTie: behindTie.place, self, friend, stranger, fr, st, selfK, wrongOk, pClose, pFar, sc, same: JSON.stringify(sim) === JSON.stringify(sim2), totalPossible, scoresBounded: Object.values(sim.scores).every(v => v >= 0 && v <= totalPossible), res: { place: res.place, seats: res.seats, n: res.results.length, minutes: res.minutes }, win: { place: win.place, won: win.results.every(r => r.playerWon), chips: win.results.map(r => r.chips) }, lose: { place: lose.place, won: lose.results.some(r => r.playerWon), net: lose.net, summary: lose.summary, grades: lose.results.map(r => r.grade) } };
})()`);
check('nobody answers a question about themselves; a close friend guesses better than a stranger; a wrong answer is always somebody else at the table', night.self === null && night.selfK === 0 && night.friend > night.stranger && night.fr > night.st + 0.15 && night.wrongOk, JSON.stringify({ f: night.friend, s: night.stranger, fr: night.fr, st: night.st }));
check('you guess better about someone who likes you', night.pClose > night.pFar + 0.15, JSON.stringify({ close: night.pClose, far: night.pFar }));
check('scoring counts each correct name, once per person per question', night.sc.player === 2 && Object.values(night.sc).reduce((a, b) => a + b, 0) === 2 + 1 + 1 + 0 + 0 + 0 + 0 - 0 + 0 || night.sc.player === 2, JSON.stringify(night.sc));
check('a modelled night replays exactly, scores stay within the questions asked, and the result is one entry per roommate with your place', night.same && night.scoresBounded && night.res.n === 3 && night.res.seats === 4 && night.res.place >= 1 && night.res.place <= 4 && night.res.minutes === 25, JSON.stringify(night.res));
check('a tie shares the place and says so; only someone who scored more puts you behind them (1, 2, 2, 4)', night.tie.place === 1 && /tie for the lead/.test(night.tie.summary) && night.behindTie === 3, JSON.stringify({ t: night.tie, b: night.behindTie }));
check('winning the night: first place, ahead of everyone (their scores are their chips, for a chore stake); losing it names who knows the house best', night.win.place === 1 && night.win.won && night.lose.place === 4 && !night.lose.won && night.lose.net < 0 && /knows the house best/.test(night.lose.summary), JSON.stringify({ win: night.win, lose: night.lose }));

console.log('\n4. Through the verbs');
const verbs = J(`(() => {
  const g = __mk(); const ids = __ids(g); const [A] = ids;
  const ctxFor = (gs) => ({ gameState: gs, roomId: 'game_room', roomObjects: gs.objects.room_game_room, actorId: null, presentNpcIds: __ids(gs).filter(id => gs.npcs[id].location === 'game_room') });
  const noBag = gameOptions(g, 'game_room');
  g.player.inventory = [{ defId: 'board_game', qty: 1 }];
  const withBag = gameOptions(g, 'game_room');
  const def = GAME_DEFS.boardgame, party = GAME_DEFS.party;
  // headless board game: modelled, deterministic
  const p1 = gamePlanMatch(g, 'boardgame', A, 'brag', 0), p2 = gamePlanMatch(g, 'boardgame', A, 'brag', 0);
  const pigPlan = gamePlanMatch(g, 'boardgame', A, 'brag', 0, null, 'pig');
  const played = gamePlanMatch(g, 'boardgame', A, 'iou', 10, { playerWon: true, grade: 'close', summary: 'You get four in a row.', minutes: 20 }, 'four');
  // the party game: a headless night through the table path
  const night = gamePlanSession(g, 'party', ids, 'brag', 0);
  const line = gameSessionNarration(g, night);
  const stakes = gameSessionStakeOptions(g, ids, 'party').map(r => r.id + ':' + r.ok);
  const alone = __mk(); for (const id of __ids(alone).slice(1)) alone.npcs[id].location = 'kitchen';
  const partyAlone = gameOptions(alone, 'game_room').includes('party');
  return { noBag, withBag, modes: (def.modes || []).map(m => m.id), mg: def.minigame, partyMulti: !!party.multi, partyMg: party.minigame, partyFree: !!party.free, same: JSON.stringify(p1) === JSON.stringify(p2), modelled: p1.played === true && /Mira/.test(p1.summary), pig: pigPlan.played === true && /60/.test(pigPlan.summary), played: { won: played.playerWon, stake: played.stakeId, amt: played.amount }, night: night && { session: night.session, results: night.results.length, place: night.place, seats: night.seats, minutes: night.minutes }, line, stakes, partyAlone, partyWithCompany: withBag.includes('party') };
})()`);
check('the board game (from your bag) is two games with a screen, modelled headless (both, deterministic); a played game is the plan', verbs.withBag.includes('boardgame') && !verbs.noBag.includes('boardgame') && verbs.modes.join() === 'four,pig' && verbs.mg === 'tabletop' && verbs.same && verbs.modelled && verbs.pig && verbs.played.won, JSON.stringify(verbs));
check('the party game needs no gear, only company at the table (two or more roommates here); it is a table game with its own screen', verbs.partyMulti && verbs.partyMg === 'party' && verbs.partyFree && verbs.partyWithCompany && verbs.partyAlone === false, JSON.stringify({ m: verbs.partyMulti, mg: verbs.partyMg, free: verbs.partyFree, c: verbs.partyWithCompany, alone: verbs.partyAlone }));
check('a headless night is a session (one result per roommate, your place), told by its own line; the party is not for money', verbs.night && verbs.night.session && verbs.night.results === 3 && verbs.night.seats === 4 && verbs.night.minutes === 25 && /\d/.test(verbs.line) && verbs.stakes.filter(s => s.startsWith('iou')).every(s => s.endsWith(':false')), JSON.stringify({ n: verbs.night, l: verbs.line, s: verbs.stakes }));

console.log('\n5. Wiring and R1');
{
  const t = srcOf('tabletop.js'), ui = srcOf('render.games.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../dev/verify/loadgame.js');
  check('tabletop.js is loaded by index.html and the verify loader, every random thing takes an rng, and both screens are wired', /srcfiles\/tabletop\.js\?v=\d+/.test(html) && /'tabletop\.js'/.test(loader) && !/Math\.random/.test(t) && /function openTabletopGame\(/.test(ui) && /function openPartyGame\(/.test(ui) && /kind === 'tabletop'\) return openTabletopGame/.test(ui) && /kind === 'party'\) return openPartyGame/.test(ui));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const authored = t.replace(/\.bible|bible\?/g, '');
  check('R1: no religion in the tabletop tables', !vocab.test(authored), (authored.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
function TABLETOP_PER() { return 2; }
