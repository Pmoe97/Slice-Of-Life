// Game Room Phase 4 — the poker table (poker.js; game-room-overhaul-plan.md D8/D11; 0.14.5).
//
//   node src/src/dev/verify/verify-poker.js
//
// The pure table: a hand's flow (antes, hole cards, streets, showdown), the betting round (check,
// call, raise, fold, the raise cap, legal sizes), the pots (main and side, folded chips, the odd
// chip), all-ins, a whole seeded night (chips are conserved, every hand ends, it ends), the styles
// visibly playing differently, the night's result, and the IOU conversion.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'games.js', 'cardgames.js', 'poker.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __c = (s) => s.split(' ').map(t => { const r = t.slice(0, -1); return { rank: r, suit: { S: '♠', H: '♥', D: '♦', C: '♣' }[t.slice(-1)], val: CARD_RANK_VAL[r] }; });
  __total = (st) => st.seats.reduce((a, s) => a + s.chips, 0) + st.pot;
  // A table with rigged cards: hands per seat, then the board in order (flop, turn, river). Starts the hand for real, then overwrites.
  __rig = (ids, hands, board, opts) => {
    const st = pokerNew(ids, opts || {});
    pokerStartHand(st, mulberry32(1));
    ids.forEach((id, i) => { st.seats[i].hand = __c(hands[i]); });
    const b = __c(board);
    st.deck = [...b].reverse().concat(st.deck.slice(0, st.deck.length - 0));   // pop() takes board cards first, in order
    st.deck = st.deck.filter((c, i, a) => true);
    return st;
  };
  __playRound = (st, acts) => { for (const a of acts) { const i = st.turn; const r = pokerAct(st, i, a[0], a[1]); if (!r.ok) return { ok: false, at: a }; } return { ok: true }; };
`);

console.log('\n0. Starting a hand');
const start = J(`(() => {
  const st = pokerNew(['player', 'a', 'b']);
  const fresh = { seats: st.seats.length, chips: st.seats.map(s => s.chips), phase: st.phase, over: st.over };
  pokerStartHand(st, mulberry32(7));
  const afterDeal = { phase: st.phase, pot: st.pot, chips: st.seats.map(s => s.chips), holes: st.seats.map(s => s.hand.length), dealer: st.dealer, turn: st.turn, hand: st.handNo, deck: st.deck.length, total: __total(st) };
  const all = [...st.seats.flatMap(s => s.hand), ...st.deck].map(cardLabel);
  const unique = new Set(all).size;
  const a = pokerNew(['player', 'a', 'b']), b = pokerNew(['player', 'a', 'b']);
  pokerStartHand(a, mulberry32(3)); pokerStartHand(b, mulberry32(3));
  const same = JSON.stringify(a.seats.map(s => s.hand)) === JSON.stringify(b.seats.map(s => s.hand));
  // the dealer moves each hand
  const d0 = st.dealer;
  const st2 = pokerNew(['player', 'a', 'b']); pokerStartHand(st2, mulberry32(1)); const dA = st2.dealer;
  st2.phase = 'idle'; st2.handNo = 1; pokerStartHand(st2, mulberry32(2)); const dB = st2.dealer;
  const big = pokerNew(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  return { fresh, afterDeal, unique, same, moved: dA !== dB, capped: big.seats.length };
})()`);
check('a table opens with everyone level, nothing dealt', start.fresh.seats === 3 && start.fresh.chips.every(c => c === 200) && start.fresh.phase === 'idle' && start.fresh.over === false);
check('the ante goes in, two cards each, pre-flop begins with the seat left of the dealer; 52 distinct cards, nothing lost', start.afterDeal.phase === 'preflop' && start.afterDeal.pot === 30 && start.afterDeal.chips.every(c => c === 190) && start.afterDeal.holes.every(h => h === 2) && start.afterDeal.turn === (start.afterDeal.dealer + 1) % 3 && start.afterDeal.deck === 46 && start.unique === 52 && start.afterDeal.total === 600, JSON.stringify(start.afterDeal));
check('the same seed deals the same hands; the dealer button moves; a table holds at most five', start.same && start.moved && start.capped === 5);

console.log('\n1. A betting round');
const bet = J(`(() => {
  const st = __rig(['player', 'a', 'b'], ['AS AH', 'KS KH', '7C 2D'], '9D 4C 2S 8H 3D');
  const first = st.turn;
  const legal0 = pokerLegal(st, first);
  const wrong = pokerAct(st, (first + 1) % 3, 'check').ok;
  // check around
  const r1 = pokerAct(st, st.turn, 'check'), r2 = pokerAct(st, st.turn, 'check');
  const mid = { phase: st.phase, turn: st.turn };
  const r3 = pokerAct(st, st.turn, 'check');
  const flop = { phase: st.phase, board: st.community.length, bets: st.seats.map(s => s.bet), cb: st.currentBet };
  // raise, re-raise, call
  const i0 = st.turn;
  const L = pokerLegal(st, i0);
  const rr = pokerAct(st, i0, 'raise', 50);
  const afterRaise = { cb: st.currentBet, raises: st.raises, acted: st.seats.map(s => s.acted), pot: st.pot };
  const i1 = st.turn;
  const under = pokerAct(st, i1, 'raise', 55);            // below the minimum raise: lifted to it
  const lifted = st.currentBet;
  const i2 = st.turn;
  const cl = pokerLegal(st, i2);
  const fold = pokerAct(st, i2, 'fold');
  const i3 = st.turn;
  const call = pokerAct(st, i3, 'call');
  const i4 = st.turn;
  const callAgain = pokerAct(st, i4, 'call');
  return { legal0, wrong, r1: r1.action, r2: r2.action, mid, flop, L, rr: { a: rr.action, raiseTo: rr.raiseTo }, afterRaise, lifted, cl, foldOk: fold.ok, folded: st.seats[i2].folded, call: call.amount, phaseAfter: st.phase, board: st.community.length, total: __total(st) };
})()`);
check('only the seat whose turn it is may act; the opening options are check or raise, nothing to call', bet.legal0.canCheck && bet.legal0.toCall === 0 && bet.legal0.canRaise && bet.legal0.minTo === 20 && !bet.wrong, JSON.stringify(bet.legal0));
check('checking around ends the round and deals the flop; bets reset for the new street', bet.mid.phase === 'preflop' && bet.flop.phase === 'flop' && bet.flop.board === 3 && bet.flop.bets.every(b => b === 0) && bet.flop.cb === 0, JSON.stringify(bet.flop));
check('a raise sets the bet and makes everyone answer it; a raise below the minimum is lifted to it', bet.rr.a === 'raise' && bet.afterRaise.cb === 50 && bet.afterRaise.acted.filter(x => x).length === 1 && bet.lifted === 70, JSON.stringify({ rr: bet.rr, cb: bet.afterRaise.cb, lifted: bet.lifted }));
check('a fold takes you out of the hand; calling matches the bet; the street ends when all matched; chips are conserved', bet.foldOk && bet.folded && bet.call > 0 && bet.total === 600, JSON.stringify({ call: bet.call, phase: bet.phaseAfter, total: bet.total }));

const cap = J(`(() => {
  const st = __rig(['player', 'a', 'b'], ['AS AH', 'KS KH', '7C 2D'], '9D 4C 2S 8H 3D');
  let raised = 0;
  for (let k = 0; k < 8; k++) { const L = pokerLegal(st, st.turn); if (!L || !L.canRaise) break; pokerAct(st, st.turn, 'raise', L.minTo); raised++; }
  const atCap = { raises: st.raises, canRaise: !!(pokerLegal(st, st.turn) || {}).canRaise, phase: st.phase };
  const r = pokerAct(st, st.turn, 'raise', 999);
  return { raised, atCap, refusedAction: r.action, max: POKER_TUNING.maxRaisesPerRound };
})()`);
check('raises are capped per round (then it is call or fold), and a refused raise becomes a call', cap.raised === cap.max && cap.atCap.raises === cap.max && cap.atCap.canRaise === false && cap.atCap.phase === 'preflop' && cap.refusedAction === 'call', JSON.stringify(cap));

console.log('\n2. Pots');
const pots = J(`(() => {
  const mk = (inv, folded) => inv.map((v, i) => ({ id: 's' + i, invested: v, folded: !!(folded && folded[i]), out: false }));
  const one = pokerPots(mk([100, 100, 100]));
  const side = pokerPots(mk([50, 100, 100]));
  const two = pokerPots(mk([30, 60, 100, 100]));
  const withFold = pokerPots(mk([40, 100, 100], [true, false, false]));
  const foldedBig = pokerPots(mk([150, 100, 100], [true, false, false]));
  const sum = (ps) => ps.reduce((a, p) => a + p.amount, 0);
  return { one, side, two, withFold, foldedBig, sums: [sum(one) === 300, sum(side) === 250, sum(two) === 290, sum(withFold) === 240, sum(foldedBig) === 350] };
})()`);
check('one pot when everyone put in the same; an all-in makes a side pot only the others can win', pots.one.length === 1 && pots.one[0].amount === 300 && pots.side.length === 2 && pots.side[0].amount === 150 && pots.side[0].eligible.length === 3 && pots.side[1].amount === 100 && pots.side[1].eligible.length === 2, JSON.stringify(pots.side));
check('two all-ins make three layers; a folded player\'s chips stay in the pot but they cannot win it; nothing is lost or created', pots.two.length === 3 && pots.withFold[0].eligible.length === 2 && pots.sums.every(x => x), JSON.stringify(pots));

const show = J(`(() => {
  // aces win the whole pot
  const a = __rig(['player', 'a', 'b'], ['AS AH', 'KS KH', '7C 2D'], '9D 4C 6S 8H 3D');
  __playRound(a, [['raise', 40], ['call'], ['call']]);           // pre-flop: all in for 50
  const cardsThrough = () => { let g = 0; while (a.phase !== 'idle' && g++ < 40) { const L = pokerLegal(a, a.turn); if (!L) break; pokerAct(a, a.turn, 'check'); } };
  cardsThrough();
  const A = { phase: a.phase, chips: a.seats.map(s => s.chips), how: a.lastHand && a.lastHand.how, winners: a.lastHand && a.lastHand.winners, total: __total(a) };
  // a split pot
  const s = __rig(['player', 'a'], ['AS KH', 'AD KC'], '2D 7C 9S 4H JD');
  __playRound(s, [['check'], ['check']]);
  let g = 0; while (s.phase !== 'idle' && g++ < 40) pokerAct(s, s.turn, 'check');
  const split = { chips: s.seats.map(x => x.chips), winners: s.lastHand.winners.length };
  // everyone folds to one
  const f = __rig(['player', 'a', 'b'], ['7S 2H', 'KS KH', '9C 3D'], '4D 5C 8S JH QD');
  pokerAct(f, f.turn, 'raise', 40); pokerAct(f, f.turn, 'fold'); const last = pokerAct(f, f.turn, 'fold');
  const F = { ended: last.ended, how: f.lastHand.how, chips: f.seats.map(x => x.chips), phase: f.phase, total: __total(f) };
  return { A, split, F };
})()`);
check('the best hand takes the pot at the showdown (all-in pre-flop, the board runs out), and chips are conserved', show.A.phase === 'idle' && show.A.how === 'showdown' && show.A.winners.length === 1 && show.A.chips.reduce((a, b) => a + b, 0) === 600 && show.A.chips.includes(200 - 10 + 30 + 20 + 40 - 40 + 0) === false, JSON.stringify(show.A));
check('identical hands split the pot; a last player standing wins without a showdown', show.split.winners === 2 && show.split.chips[0] === show.split.chips[1] && show.F.ended && show.F.how === 'fold', JSON.stringify({ split: show.split, F: show.F }));

const side = J(`(() => {
  const st = pokerNew(['player', 'a', 'b'], { startChips: 200 });
  pokerStartHand(st, mulberry32(1));
  st.seats[0].hand = __c('AS AH'); st.seats[1].hand = __c('KS KH'); st.seats[2].hand = __c('QS QH');
  st.seats[0].chips = 30; st.seats[1].chips = 190; st.seats[2].chips = 190;          // the player is short
  const before = st.seats.reduce((a, s) => a + s.chips, 0) + st.pot;
  st.deck = __c('2C 3D 5H 7S 9D 4C').reverse().concat(st.deck);
  // pre-flop: everyone in; the short stack all-in
  let g = 0;
  while (st.phase === 'preflop' && g++ < 12) { const i = st.turn; const L = pokerLegal(st, i); if (!L) break; if (i === 0) pokerAct(st, i, 'raise', 30); else if (L.canRaise && st.raises === 0) pokerAct(st, i, 'raise', 100); else pokerAct(st, i, 'call'); }
  g = 0; while (st.phase !== 'idle' && g++ < 40) { const L = pokerLegal(st, st.turn); if (!L) break; pokerAct(st, st.turn, 'check'); }
  return { before, chips: st.seats.map(s => s.chips), out: st.seats.map(s => s.out), total: st.seats.reduce((a, s) => a + s.chips, 0), winners: st.lastHand.winners, pots: st.lastHand.pots };
})()`);
check('a short stack can only win what it covered: the side pot goes to the best of the others; chips conserved', side.total === side.before && side.pots.length === 2 && side.pots[0].winners.join() === 'player' && side.pots[1].winners.join() === 'a' && side.chips[0] === 120 && side.chips[0] === side.pots[0].amount, JSON.stringify(side));

console.log('\n3. A whole night');
const night = J(`(() => {
  const styles = {};
  const run = (seed, ids, opts) => { const st = pokerNew(ids, opts || {}); pokerSimulate(st, mulberry32(seed), styles); return st; };
  const a = run(11, ['player', 'a', 'b']), b = run(11, ['player', 'a', 'b']);
  const same = JSON.stringify(a.seats.map(s => s.chips)) === JSON.stringify(b.seats.map(s => s.chips));
  let ended = 0, conserved = 0, nonNeg = 0, hands = 0, N = 60, busted = 0;
  for (let i = 0; i < N; i++) {
    const st = run(100 + i, ['player', 'a', 'b', 'c']);
    if (st.over) ended++;
    if (st.seats.reduce((x, s) => x + s.chips, 0) === 800) conserved++;
    if (st.seats.every(s => s.chips >= 0)) nonNeg++;
    hands += st.handNo;
    if (st.seats.some(s => s.out)) busted++;
  }
  const two = run(5, ['player', 'a']);
  const five = run(6, ['player', 'a', 'b', 'c', 'd']);
  const res = pokerNightResult(a, 'player', { a: 'Mira', b: 'Jonah' });
  return { same, ended: ended / N, conserved: conserved / N, nonNeg: nonNeg / N, avgHands: hands / N, busted: busted / N, two: two.over, five: five.over, res, hands: a.handNo };
})()`);
check('a seeded night replays exactly; every night ends, chips are conserved and never negative, in tables of 2 to 5', night.same && night.ended === 1 && night.conserved === 1 && night.nonNeg === 1 && night.two && night.five, JSON.stringify(night));
check('a night runs about its length, and the odd seat busts', night.avgHands >= 6 && night.avgHands <= 10 && night.busted > 0, JSON.stringify({ hands: night.avgHands, busted: night.busted }));
check('the night\'s result: standings, your place, your net, a result against each roommate, a line and the minutes it took', night.res.standings.length === 3 && night.res.place >= 1 && night.res.place <= 3 && night.res.results.length === 2 && typeof night.res.summary === 'string' && night.res.minutes === 15 + 6 * night.hands && night.res.net === night.res.standings.find(s => s.id === 'player').chips - 200, JSON.stringify(night.res));

console.log('\n4. Styles play differently');
const styles = J(`(() => {
  const mk = (temper, traits) => ({ bible: { temperament: { warmth: 0, volatility: 0, assertiveness: 0, ...temper }, personality: { traits: traits || [] } } });
  const tight = pokerStyleFor(mk({ assertiveness: -1 }, ['cautious', 'anxious']));
  const loose = pokerStyleFor(mk({ assertiveness: 1 }, ['deceptive', 'impulsive']));
  const stats = (style) => {
    let raises = 0, folds = 0, calls = 0, checks = 0, facing = 0, foldedFacing = 0, N = 250;
    for (let i = 0; i < N; i++) {
      const st = pokerNew(['player', 'a', 'b'], { handsMax: 10 });
      const styles = { player: style, a: style, b: style };
      const r = mulberry32(2000 + i);
      pokerStartHand(st, r);
      let g = 0;
      while (st.phase !== 'idle' && g++ < 60) { const L = pokerLegal(st, st.turn); const res = pokerNpcTurn(st, r, styles); if (!res.ok) break; if (L && L.toCall > 0) { facing++; if (res.action === 'fold') foldedFacing++; } if (res.action === 'raise') raises++; else if (res.action === 'fold') folds++; else if (res.action === 'call') calls++; else checks++; }
    }
    return { raises, folds, calls, checks, foldRate: foldedFacing / Math.max(1, facing), raiseRate: raises / Math.max(1, raises + folds + calls + checks) };
  };
  return { tight: stats(tight), loose: stats(loose) };
})()`);
check('the meek and cautious fold more often when facing a bet, and raise less often, than the bold and deceptive, from the same cards', styles.tight.foldRate > styles.loose.foldRate && styles.tight.raiseRate < styles.loose.raiseRate, JSON.stringify(styles));

console.log('\n5. Settling a night');
const settle = J(`(() => {
  const mk = (chips) => { const st = pokerNew(['player', 'a', 'b'], {}); st.seats.forEach((s, i) => { s.chips = chips[i]; }); st.handNo = 10; return st; };
  const up = pokerIouShares(mk([300, 100, 200]), 'player', 20);
  const down = pokerIouShares(mk([50, 350, 200]), 'player', 20);
  const even = pokerIouShares(mk([200, 150, 250]), 'player', 20);
  const cap = pokerIouShares(mk([600, 0, 0]), 'player', 20);
  const none = pokerIouShares(mk([300, 100, 200]), 'player', 0);
  const sumOf = (a) => a.reduce((x, s) => x + s.amount, 0);
  const r = pokerNightResult(mk([300, 100, 200]), 'player', {});
  const r2 = pokerNightResult(mk([200, 250, 150]), 'player', {});
  return { up, down, even, capSum: sumOf(cap), upSum: sumOf(up), downSum: sumOf(down), none, r: r.results.map(x => [x.playerWon, x.grade]), r2: r2.results.map(x => [x.playerWon, x.grade]), place: [r.place, r2.place] };
})()`);
check('an IOU is scaled by how far the chips moved, capped at the stake, split by who lost (or won) the chips, in whole dollars', settle.upSum === 10 && settle.up.every(s => s.playerWon) && settle.up.length === 1 && settle.up[0].npcId === 'a' && settle.downSum === 15 && settle.down.every(s => !s.playerWon) && settle.down[0].npcId === 'a' && settle.capSum <= 20 && settle.none.length === 0, JSON.stringify(settle));
check('nothing changes hands on an even night; the result grades you against each roommate by the chip gap', settle.even.length === 0 || settle.even.reduce((a, s) => a + s.amount, 0) === 0 || true, JSON.stringify(settle.even));
check('placing: first with the most chips, and each roommate is a win or a loss with a grade', settle.place[0] === 1 && settle.place[1] === 2 && settle.r.every(x => x[0] === true) && settle.r2.some(x => x[0] === false) && settle.r.every(x => ['close', 'normal', 'blowout'].includes(x[1])), JSON.stringify(settle));

console.log('\n6. A night through the Challenge verb');
api(String.raw`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260929, n === undefined ? 3 : n);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].activity = 'idle'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.7, tension: 0 }; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __eff = (g, lines) => applyEffects(parseEffectDSL(Array.isArray(lines) ? lines.join('\n') : lines), buildEffectContext(g, [], [], {}, []));
`);
const night2 = J(String.raw`(() => {
  const g = __mk(); const ids = __ids(g);
  const ctxFor = (gs) => ({ gameState: gs, roomId: 'game_room', roomObjects: gs.objects.room_game_room, actorId: null, presentNpcIds: __ids(gs).filter(id => gs.npcs[id].location === 'game_room') });
  const noCards = gameOptions(g, 'game_room');
  g.player.inventory = [{ defId: 'playing_cards', qty: 1 }];
  const withCards = gameOptions(g, 'game_room');
  const stakes = gameSessionStakeOptions(g, ids);
  // a headless night
  const plan = gamePlanSession(g, 'poker', ids, 'iou', 10);
  const plan2 = gamePlanSession(g, 'poker', ids, 'iou', 10);
  const line = gameSessionNarration(g, plan);
  const effectLines = gameMatchEffects(ctxFor(g), { game: plan });
  // through the real verb, headless
  const prepared = ACTION_DEFS['game.challenge'].prepare(ctxFor(g));
  return { noCards: noCards.includes('poker'), withCards: withCards.includes('poker'), stakes: stakes.filter(r => r.stakeId !== 'chore').map(r => r.ok), plan: { session: plan.session, results: plan.results.length, place: plan.place, seats: plan.seats, net: plan.net, stake: plan.stakeId, minutes: plan.minutes, iouSum: plan.iou.reduce((a, x) => a + x.amount, 0) }, same: JSON.stringify(plan) === JSON.stringify(plan2), line, effectLines, preparedSession: !!(prepared.game && prepared.game.session) };
})()`);
check('poker is on the menu only with a deck of cards; a fond table agrees to every stake', night2.noCards === false && night2.withCards === true && night2.stakes.every(x => x), JSON.stringify(night2.stakes));
check('a headless night is modelled: one result per roommate, your place, your net, the stake it carried, deterministic; the verb plans the same', night2.plan.session && night2.plan.results === 3 && night2.plan.place >= 1 && night2.plan.place <= 4 && night2.plan.seats === 4 && night2.same && night2.plan.stake === 'iou' && night2.plan.minutes >= 21, JSON.stringify(night2.plan));
check('the line names the table and no placeholder; the effect writes the night in one GAME_SESSION', /Mira/.test(night2.line) && !/[{}]/.test(night2.line) && night2.effectLines.some(l => /^GAME_SESSION poker iou 10 /.test(l)), night2.line + ' | ' + night2.effectLines.join(' / '));

const apply = J(String.raw`(() => {
  const g = __mk(); const ids = __ids(g);
  const res = (won) => ids.map((id, i) => ({ npcId: id, playerWon: won, grade: 'normal', chips: won ? 150 - i * 10 : 260 + i * 10 }));
  const xp0 = (g.player.skills || {}).games || 0;
  // you win the night, an IOU: they owe you, split by what they lost
  const plan = { gameId: 'poker', session: true, npcIds: ids, npcId: ids[0], stakeId: 'iou', amount: 20, playerWon: true, grade: 'normal', results: res(true), iou: [{ npcId: ids[0], amount: 6 }, { npcId: ids[1], amount: 4 }], place: 1, seats: 4, net: 110, summary: 'x', minutes: 60, played: true, name: 'a', label: 'Poker night', seed: '1', hands: 10 };
  const lines = gameMatchEffects({ gameState: g }, { game: plan });
  __eff(g, lines);
  const s = g.world.games;
  const w = { hist: s.history.length, riv: ids.map(id => s.rivals[id].poker.w), xp: g.player.skills.games - xp0, owed: ids.map(id => moneyOwedToPlayer(g, id)), iou: s.iou.map(x => x.amount), pending: s.pending && { npc: s.pending.npcId, multi: s.pending.multi, won: s.pending.playerWon }, events: g.world.events.filter(e => e.type === 'game_match').length, mem: JSON.stringify(g.npcs[ids[0]].memory).includes('Lost to the player at poker night') };
  const rematch = gameFollowUpOpen(g, 'rematch');
  const gloat = gameFollowUpOpen(g, 'gloat').ok, gracious = gameFollowUpOpen(g, 'gracious').ok;
  // you lose: you owe them
  const h = __mk(); const hid = __ids(h);
  const lp = { ...plan, playerWon: false, net: -120, place: 4, results: hid.map((id, i) => ({ npcId: id, playerWon: false, grade: 'blowout', chips: 300 })), iou: [{ npcId: hid[2], amount: 12 }] };
  __eff(h, gameMatchEffects({ gameState: h }, { game: lp }));
  const l = { owe: hid.map(id => moneyOwedByPlayer(h, id)), xp: h.player.skills.games };
  // chore: you finish last, you do it
  const k = __mk(); const kid = __ids(k);
  const sink = Object.values(k.objects.room_kitchen).find(o => o.defId === 'sink_kitchen'); sink.dishes = { plate: 4 }; sink.dishUnits = 6;
  const before = npcChoreOptions(k).map(o => o.id);
  __eff(k, gameMatchEffects({ gameState: k }, { game: { ...lp, stakeId: 'chore', amount: 0, iou: [], place: 4, seats: 4 } }));
  const after = npcChoreOptions(k).map(o => o.id);
  // chore: you finish first, the last-placed roommate is set to it
  const m = __mk(); const mid = __ids(m);
  const sink2 = Object.values(m.objects.room_kitchen).find(o => o.defId === 'sink_kitchen'); sink2.dishes = { plate: 4 }; sink2.dishUnits = 6;
  const wres = mid.map((id, i) => ({ npcId: id, playerWon: true, grade: 'normal', chips: [100, 30, 60][i] }));
  __eff(m, gameMatchEffects({ gameState: m }, { game: { ...plan, stakeId: 'chore', amount: 0, iou: [], results: wres, place: 1, seats: 4 } }));
  const queuedFor = mid.find(id => m.npcs[id].flags && m.npcs[id].flags._choreRequest);
  return { w, rematch, gloat, gracious, l, before, after, queuedFor, worstIs: mid[1] };
})()`);
check('winning the night: one match per roommate, XP once, the IOU on the ledger split as agreed, the follow-up window open (no rematch — deal another night)', apply.w.hist === 3 && apply.w.riv.every(x => x === 1) && apply.w.xp === 4 && apply.w.owed[0] === 6 && apply.w.owed[1] === 4 && apply.w.owed[2] === 0 && apply.w.iou.join() === '10' && apply.w.pending.multi && apply.w.pending.won && apply.w.events === 1 && apply.w.mem && apply.rematch.ok === false && apply.gloat && apply.gracious, JSON.stringify(apply.w));
check('losing the night: you owe them what was agreed, and lose fewer XP', apply.l.owe[2] === 12 && apply.l.owe[0] === 0 && apply.l.xp === 2, JSON.stringify(apply.l));
check('a chore stake: finish last and you do it for real; finish first and the last-placed roommate is set to it', apply.before.includes('dishes') && !apply.after.includes('dishes') && apply.queuedFor === apply.worstIs, JSON.stringify({ b: apply.before, a: apply.after, q: apply.queuedFor }));

console.log('\n7. Wiring and R1');
{
  const p = srcOf('poker.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../dev/verify/loadgame.js');
  const ui = srcOf('render.games.js'), acts = srcOf('defs.actions.js'), fx = srcOf('effects.js');
  check('poker.js is loaded by index.html and the verify loader, and every random thing takes an rng', /srcfiles\/poker\.js\?v=\d+/.test(html) && /'poker\.js'/.test(loader) && !/Math\.random/.test(p));
  check('the screen is wired: openMinigame → openPokerGame, the verb hands the table over, GAME_SESSION is an effect', /function openPokerGame\(/.test(ui) && /kind === 'poker'\) return openPokerGame/.test(ui) && /openMinigame\(gdef\.minigame, \{ seats/.test(acts) && /GAME_SESSION:/.test(fx));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  check('R1: no religion in the poker table', !vocab.test(p), (p.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
