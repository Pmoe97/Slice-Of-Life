// Game Room Phase 3 — the card engine (cardgames.js; game-room-overhaul-plan.md D8/D11/D12/R12; 0.14.5).
//
//   node dev/verify/verify-cards.js
//
// Ported from AcesAndLace as engine math: the deck (seeded), the best-five-of-N evaluator and its
// tie-breaks, Omaha's exactly-two rule, showdown and split pots, ONE strength scale for pre- and
// post-flop, a roommate's poker style drawn from their temperament and traits (D8), the pure
// multi-way decision (folds, calls, raises, bluffs, tilt, urgency, all-ins), the draw decision, and
// blackjack's arithmetic (the dealer stands on soft 17, 3:2 for a natural).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'games.js', 'cardgames.js', 'state.js'],
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
  __rate = (n, f) => { let c = 0; for (let i = 0; i < n; i++) if (f(mulberry32(5000 + i), i)) c++; return c / n; };
`);

console.log('\n0. The deck');
const deck = J(`(() => {
  const d = createDeck();
  const keys = new Set(d.map(c => c.rank + c.suit));
  const s21 = createDeck({ spanish: true });
  const a = shuffleDeck(createDeck(), mulberry32(42)).map(cardLabel).join(' ');
  const b = shuffleDeck(createDeck(), mulberry32(42)).map(cardLabel).join(' ');
  const c = shuffleDeck(createDeck(), mulberry32(43)).map(cardLabel).join(' ');
  const sorted = shuffleDeck(createDeck(), mulberry32(9)).map(cardLabel).sort().join() === createDeck().map(cardLabel).sort().join();
  // fairness: the top card is spread over the deck
  const top = {}; for (let i = 0; i < 2600; i++) { const t = cardLabel(shuffleDeck(createDeck(), mulberry32(i))[0]); top[t] = (top[t] || 0) + 1; }
  const counts = Object.values(top);
  return { n: d.length, uniq: keys.size, s21: s21.length, no10: s21.every(x => x.rank !== '10'), same: a === b, differs: a !== c, sorted, spread: Object.keys(top).length, max: Math.max(...counts), vals: d.every(x => x.val === CARD_RANK_VAL[x.rank]) };
})()`);
check('52 distinct cards; Spanish 21 is 48, no tens', deck.n === 52 && deck.uniq === 52 && deck.s21 === 48 && deck.no10 && deck.vals);
check('a shuffle is a permutation, replays exactly from a seed, differs by seed, and is not lopsided', deck.sorted && deck.same && deck.differs && deck.spread >= 45 && deck.max < 120, JSON.stringify({ spread: deck.spread, max: deck.max }));

console.log('\n1. Hands');
const hands = J(`(() => {
  const r = (s) => scoreFive(__c(s));
  const names = {
    royal: r('AS KS QS JS 10S').name, sf: r('9H 8H 7H 6H 5H').name, quads: r('KS KH KD KC 2S').name, full: r('3S 3H 3D 9C 9S').name, flush: r('AS 9S 7S 4S 2S').name,
    straight: r('9S 8H 7D 6C 5S').name, wheel: r('AS 2H 3D 4C 5S').name, trips: r('7S 7H 7D KC 2S').name, twoPair: r('KS KH 4D 4C 2S').name, pair: r('QS QH 9D 4C 2S').name, high: r('AS JH 9D 4C 2S').name,
  };
  const rank = Object.fromEntries(Object.entries({ royal: 'AS KS QS JS 10S', sf: '9H 8H 7H 6H 5H', quads: 'KS KH KD KC 2S', full: '3S 3H 3D 9C 9S', flush: 'AS 9S 7S 4S 2S', straight: '9S 8H 7D 6C 5S', trips: '7S 7H 7D KC 2S', twoPair: 'KS KH 4D 4C 2S', pair: 'QS QH 9D 4C 2S', high: 'AS JH 9D 4C 2S' }).map(([k, v]) => [k, r(v).rank]));
  const wheel = r('AS 2H 3D 4C 5S'), six = r('2S 3H 4D 5C 6S');
  const cmp = {
    wheelBeatenBySix: compareScores(wheel, six) < 0,
    pairKicker: compareScores(r('QS QH AD 4C 2S'), r('QD QC KD 4H 2C')) > 0,
    higherPair: compareScores(r('KS KH 3D 4C 2S'), r('QD QC AD 5H 6C')) > 0,
    fullByTrips: compareScores(r('9S 9H 9D 2C 2S'), r('8S 8H 8D AC AS')) > 0,
    flushByHigh: compareScores(r('AS 9S 7S 4S 2S'), r('KH QH JH 9H 7H')) > 0,
    tie: compareScores(r('AS KH QD JC 9S'), r('AD KC QH JS 9D')) === 0,
    order: Object.values(rank).every((v, i, a) => i === 0 || v <= a[i - 1]),
  };
  return { names, rank, cmp };
})()`);
check('every hand class is named and ranked, from the royal flush down to high card', hands.names.royal === 'Royal Flush' && hands.names.sf === 'Straight Flush' && hands.names.quads === 'Four of a Kind' && hands.names.full === 'Full House' && hands.names.flush === 'Flush' && hands.names.straight === 'Straight' && hands.names.wheel === 'Straight' && hands.names.trips === 'Three of a Kind' && hands.names.twoPair === 'Two Pair' && hands.names.pair === 'Pair' && hands.names.high === 'High Card' && hands.cmp.order, JSON.stringify(hands.names));
check('tie-breaks: the wheel is the lowest straight, kickers, the higher pair, the trips of a full house, a flush by its high card; equal hands split', hands.cmp.wheelBeatenBySix && hands.cmp.pairKicker && hands.cmp.higherPair && hands.cmp.fullByTrips && hands.cmp.flushByHigh && hands.cmp.tie, JSON.stringify(hands.cmp));

const best = J(`(() => {
  const seven = evaluateHand(__c('AS KS 2S 9S 4S KD KC'));      // a flush AND trips: the flush... and quads? no: KS KD KC = trips; flush beats trips
  const boardStraight = evaluateHand(__c('9H 8D 7C 6S 5H 2D 3C'));
  const incomplete = evaluateHand(__c('AS KS 2S 9S'));
  const fullOverFlush = evaluateHand(__c('KS KH KD 4S 4H 2S 9S'));
  // Omaha's exactly-two rule: four hole hearts and one on the board are NOT a flush
  const hole = __c('4H 5H 6H 7H'), board = __c('AH 9C 2D KS QD');
  const holdem = evaluateHand([...hole, ...board]);
  const omaha = evaluateOmaha(hole, board);
  const omahaOk = evaluateOmaha(__c('AH KH 2C 3D'), __c('QH JH 9H 2S 8D'));
  // showdown
  const sd = showdownWinners([__c('AS AH'), __c('KS KH'), __c('QS QH')], __c('2D 7C 9S 4H JD'));
  const split = showdownWinners([__c('AS KH'), __c('AD KC')], __c('2D 7C 9S 4H JD'));
  return { seven: seven.name, boardStraight: boardStraight.name, incomplete: incomplete.name, fullOverFlush: fullOverFlush.name, holdem: holdem.name, omaha: omaha.name, omahaOk: omahaOk.name, sd: sd.winners, split: split.winners };
})()`);
check('best five of seven: a flush beats trips; a straight on the board plays; four cards is incomplete; a full house beats a flush', best.seven === 'Flush' && best.boardStraight === 'Straight' && best.incomplete === 'Incomplete' && best.fullOverFlush === 'Full House', JSON.stringify(best));
check('Omaha uses exactly two hole cards: four hole hearts and one on the board is no flush there, but is at hold\'em; two and three is', best.holdem === 'Flush' && best.omaha !== 'Flush' && best.omahaOk === 'Flush', JSON.stringify(best));
check('showdown: the best hand wins; identical hands split the pot', best.sd.length === 1 && best.sd[0] === 0 && best.split.length === 2, JSON.stringify({ sd: best.sd, split: best.split }));

console.log('\n2. Strength, on one scale');
const str = J(`(() => {
  const pre = (s) => preflopStrength(__c(s));
  const post = (h, b) => handStrength(__c(h), __c(b));
  const ladder = ['AS KD 8C 5H 2S 9D 3C'].map(() => 0);
  const byRank = ['AS JH 9D 4C 2S', 'QS QH 9D 4C 2S', 'KS KH 4D 4C 2S', '7S 7H 7D KC 2S', '9S 8H 7D 6C 5S', 'AS 9S 7S 4S 2S', '3S 3H 3D 9C 9S', 'KS KH KD KC 2S', '9H 8H 7H 6H 5H', 'AS KS QS JS 10S'].map(x => handStrength(__c(x), []));
  return {
    aa: pre('AS AH'), kk: pre('KS KH'), twoTwo: pre('2S 2H'), aks: pre('AS KS'), ako: pre('AS KH'), seven2: pre('7S 2H'), connect: pre('8S 7S'), gap: pre('8S 3H'),
    pairFlop: post('KS 9H', '9D 4C 2S'), nothing: post('KS QH', '9D 4C 2S'), flushFlop: post('AS 9S', '7S 4S 2D'),
    monotone: byRank.every((v, i, a) => i === 0 || v >= a[i - 1]), byRank,
    bounded: byRank.every(v => v >= 0 && v <= 1), few: preflopStrength([]),
    comparable: post('KS 9H', '9D 4C 2S') > pre('7S 2H'),
  };
})()`);
check('pre-flop: pairs beat everything, suited beats offsuit, connected beats gapped, and it is one 0–1 scale', str.aa > str.kk && str.kk > str.twoTwo && str.twoTwo >= 0.48 && str.aks > str.ako && str.connect > str.gap && str.aa <= 0.95 && str.seven2 < str.ako && str.bounded, JSON.stringify(str));
check('post-flop strength rises with the hand class all the way to the royal flush', str.monotone, JSON.stringify(str.byRank));
check('post-flop is on the same scale as pre-flop: a made pair is worth more than pre-flop junk, and air is worth little', str.comparable && str.pairFlop > 0.35 && str.nothing < str.pairFlop && str.flushFlop < 0.85, JSON.stringify({ pf: str.pairFlop, n: str.nothing, fl: str.flushFlop }));

console.log('\n3. A roommate\'s style (D8)');
const style = J(`(() => {
  const mk = (temper, traits) => ({ bible: { temperament: { warmth: 0, volatility: 0, assertiveness: 0, ...temper }, personality: { traits: traits || [] } } });
  const base = pokerStyleFor(mk({}, []));
  const bold = pokerStyleFor(mk({ assertiveness: 1 }, []));
  const meek = pokerStyleFor(mk({ assertiveness: -1 }, []));
  const liar = pokerStyleFor(mk({}, ['deceptive', 'teasing']));
  const honest = pokerStyleFor(mk({}, ['honest']));
  const careful = pokerStyleFor(mk({}, ['cautious', 'anxious']));
  const patient = pokerStyleFor(mk({}, ['patient']));
  const rash = pokerStyleFor(mk({ volatility: 0.9 }, ['impulsive']));
  const extreme = pokerStyleFor(mk({ assertiveness: 1 }, ['deceptive', 'teasing', 'manipulative', 'cautious', 'anxious', 'guarded', 'insecure']));
  const again = JSON.stringify(pokerStyleFor(mk({ assertiveness: 1 }, ['deceptive']))) === JSON.stringify(pokerStyleFor(mk({ assertiveness: 1 }, ['deceptive'])));
  const heated = pokerTiltedStyle(rash, 1), calm = pokerTiltedStyle(base, 1), cool = pokerTiltedStyle(rash, 0);
  const inBounds = [base, bold, meek, liar, honest, careful, patient, rash, extreme].every(s => s.aggression >= 0.3 && s.aggression <= 0.92 && s.bluff >= 0.02 && s.bluff <= 0.32 && s.foldPressure >= 0.75 && s.foldPressure <= 1.35 && s.slowplay >= 0.01 && s.slowplay <= 0.3);
  return { base, again, boldOver: bold.aggression > base.aggression && base.aggression > meek.aggression, liar: liar.bluff > base.bluff && honest.bluff < base.bluff, careful: careful.foldPressure > base.foldPressure, patient: patient.slowplay > base.slowplay, rashTilt: rash.tilt > 0 && base.tilt === 0, heated: heated.aggression > rash.aggression && heated.foldPressure < rash.foldPressure, calm: JSON.stringify(calm) === JSON.stringify(base), cool: JSON.stringify(cool) === JSON.stringify(rash), inBounds };
})()`);
check('the same roommate always plays the same way; the assertive are bolder and the meek are not', style.again && style.boldOver, JSON.stringify(style.base));
check('deceptive and teasing bluff more, the honest less; the cautious and anxious fold sooner; the patient slow-play', style.liar && style.careful && style.patient);
check('a volatile, impulsive player tilts (heat pushes them harder and folds less); a steady one does not; no heat, no change; every dial stays in range', style.rashTilt && style.heated && style.calm && style.cool && style.inBounds, JSON.stringify(style));

console.log('\n4. The decision');
const dec = J(`(() => {
  const tbl = (over) => ({ community: [], pot: 60, currentBet: 0, ante: 10, live: 1, ...over });
  const seat = (hand, over) => ({ hand: __c(hand), chips: 500, bet: 0, ...over });
  const base = { ...POKER_STYLE.base, tilt: 0 };
  const dist = (n, s, t, st, opts) => { const c = { fold: 0, check: 0, call: 0, raise: 0, bluff: 0 }; for (let i = 0; i < n; i++) { const d = decidePokerAction(s, t, st, mulberry32(9000 + i)); c[d.action]++; if (d.bluffing) c.bluff++; } return { fold: c.fold / n, check: c.check / n, call: c.call / n, raise: c.raise / n, bluff: c.bluff / n }; };
  const flop = __c('7S 4S 2D');
  const nuts = dist(600, seat('AS 9S', {}), tbl({ community: __c('7S 4S 2S'), currentBet: 100, bet: 0 }), base);
  const air = dist(600, seat('KH 3C', {}), tbl({ community: __c('9D 6C 2S'), currentBet: 300 }), base);
  const freeAir = dist(600, seat('KH 3C', {}), tbl({ community: __c('9D 6C 2S') }), base);
  const bluffy = dist(600, seat('KH 3C', {}), tbl({ community: __c('9D 6C 2S') }), { ...base, bluff: 0.32 });
  const honest = dist(600, seat('KH 3C', {}), tbl({ community: __c('9D 6C 2S') }), { ...base, bluff: 0.02 });
  const cheap = dist(600, seat('JS 8H', {}), tbl({ community: __c('JD 6C 2S'), currentBet: 10 }), base);
  const alone = dist(600, seat('KS KH', {}), tbl({ community: __c('9D 4C 2S'), currentBet: 40, live: 1 }), base);
  const crowd = dist(600, seat('KS KH', {}), tbl({ community: __c('9D 4C 2S'), currentBet: 40, live: 5 }), base);
  const calm = dist(600, seat('7S 2H', {}), tbl({ community: __c('AD KC 9S'), currentBet: 200 }), base);
  const desperate = dist(600, seat('7S 2H', {}), tbl({ community: __c('AD KC 9S'), currentBet: 200 }), { ...base, urgency: 0.85 });
  const timid = dist(600, seat('KS 9H', {}), tbl({ community: __c('9D 4C 2S'), currentBet: 200, pot: 100 }), { ...base, foldPressure: 1.35 });
  const gutsy = dist(600, seat('KS 9H', {}), tbl({ community: __c('9D 4C 2S'), currentBet: 200, pot: 100 }), { ...base, foldPressure: 0.75 });
  // raise sizing
  let ok = true, minRaise = Infinity, shoved = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const s = seat('AS AH', { chips: 120 });
    const d = decidePokerAction(s, tbl({ community: __c('AD 7C 2S'), currentBet: 20, pot: 200 }), base, mulberry32(i));
    if (d.action === 'raise') { n++; if (!(d.raiseTo > 20) || d.raiseTo > s.bet + s.chips) ok = false; minRaise = Math.min(minRaise, d.raiseTo); if (d.raiseTo === s.bet + s.chips) shoved++; }
  }
  const same = JSON.stringify(decidePokerAction(seat('AS KS'), tbl({ currentBet: 50 }), base, mulberry32(3))) === JSON.stringify(decidePokerAction(seat('AS KS'), tbl({ currentBet: 50 }), base, mulberry32(3)));
  const shortCall = decidePokerAction(seat('AS AH', { chips: 30 }), tbl({ community: __c('AD 7C 2S'), currentBet: 100 }), base, mulberry32(1));
  return { nuts, air, freeAir, bluffy, honest, cheap, alone, crowd, calm, desperate, timid, gutsy, ok, n, minRaise, shoved, same, shortAct: shortCall.action };
})()`);
check('a monster is never folded to a bet, and mostly raises or calls', dec.nuts.fold === 0 && dec.nuts.raise + dec.nuts.call > 0.99 && dec.nuts.raise > 0.4, JSON.stringify(dec.nuts));
check('air facing a big bet mostly folds; air with nothing to pay mostly checks', dec.air.fold > 0.6 && dec.freeAir.check > 0.7 && dec.freeAir.fold === 0, JSON.stringify({ air: dec.air, free: dec.freeAir }));
check('a bluffer bluffs more than an honest player, from the same nothing, and only ever by raising', dec.bluffy.bluff > dec.honest.bluff * 2 && dec.bluffy.raise > dec.honest.raise && dec.honest.bluff < 0.1, JSON.stringify({ b: dec.bluffy, h: dec.honest }));
check('a hand is worth less in a crowd: the same pair calls more heads-up than five-handed', dec.alone.call + dec.alone.raise > dec.crowd.call + dec.crowd.raise, JSON.stringify({ alone: dec.alone, crowd: dec.crowd }));
check('urgency (the end of a match, a stakes hand) makes the same weak hand fold far less', dec.desperate.fold < dec.calm.fold - 0.2, JSON.stringify({ calm: dec.calm.fold, urgent: dec.desperate.fold }));
check('fold pressure is a real dial: the timid fold that pair to a big bet more than the gutsy', dec.timid.fold >= dec.gutsy.fold, JSON.stringify({ timid: dec.timid.fold, gutsy: dec.gutsy.fold }));
check('raises are legal (above the bet, within the stack), a short stack with a monster shoves, and the same seed decides the same', dec.ok && dec.n > 20 && dec.shoved > 0 && dec.same, JSON.stringify({ ok: dec.ok, n: dec.n, shoved: dec.shoved }));
check('an all-in call is still a call, never a fold, with a monster', dec.shortAct !== 'fold', dec.shortAct);

console.log('\n5. Five-card draw');
const draw = J(`(() => {
  const k = (s) => drawKeepIndices(__c(s));
  return { trips: k('7S 7H 7D KC 2S'), twoPair: k('KS KH 4D 4C 2S'), flush: k('AS 9S 7S 4S 2H'), straight: k('9S 8H 7D 6C 2S'), pair: k('QS QH 9D 4C 2S'), air: k('AS KH 9D 4C 2S'), lowAir: k('8S 6H 9D 4C 2S') };
})()`);
check('keep trips and two pair, four to a flush or straight, a lone pair, two high cards; draw the rest', JSON.stringify(draw.trips) === '[0,1,2]' && JSON.stringify(draw.twoPair) === '[0,1,2,3]' && JSON.stringify(draw.flush) === '[0,1,2,3]' && draw.straight.length === 4 && JSON.stringify(draw.pair) === '[0,1]' && JSON.stringify(draw.air) === '[0,1]' && draw.lowAir.length === 0, JSON.stringify(draw));

console.log('\n6. Blackjack');
const bj = J(`(() => {
  const v = (s) => bjValue(__c(s));
  const hit = (h, up, risk) => bjNpcDecision(__c(h), __c(up)[0], risk);
  const s = (p, d) => bjSettle(__c(p), __c(d));
  return {
    vals: [v('KS 5H'), v('AS 6H'), v('AS AH'), v('AS AH 9C'), v('AS KH'), v('KS QH 5D'), v('5S 5H 10D'), v('AS 5S 5H'), v('2S 3S 4S 5S 6S')],
    bj: [isBlackjack(__c('AS KH')), isBlackjack(__c('AS 5H 5D')), isBlackjack(__c('10S AH'))],
    soft: [bjIsSoft(__c('AS 6H')), bjIsSoft(__c('AS 6H 10C')), bjIsSoft(__c('KS 6H')), bjIsSoft(__c('AS AH'))],
    dealer: [bjDealerShouldHit(__c('KS 6H')), bjDealerShouldHit(__c('KS 7H')), bjDealerShouldHit(__c('AS 6H')), bjDealerShouldHit(__c('5S 4H 6D'))],
    strat: { h8: hit('5S 3H', '10S', 0), h11: hit('6S 5H', '6S', 0), h12v2: hit('10S 2H', '2S', 0), h12v5: hit('10S 2H', '5S', 0), h16v6: hit('10S 6H', '6S', 0), h16v10: hit('10S 6H', 'KS', 0), h17: hit('10S 7H', 'AS', 0), s17: hit('AS 6H', '10S', 0), s18v6: hit('AS 7H', '6S', 0), s18v10: hit('AS 7H', 'KS', 0), s19: hit('AS 8H', 'KS', 0), bold16v6: hit('10S 6H', '6S', 1), careful16v7: hit('10S 6H', '7S', -1), mid16v7: hit('10S 6H', '7S', 0) },
    settle: { nat: s('AS KH', '10S 9H'), natPush: s('AS KH', 'AD KC'), win: s('10S 9H', '10D 8C'), lose: s('10S 8H', '10D 9C'), push: s('10S 9H', '9D KC'), bust: s('10S 6H 9D', '5D 7C'), dealerBust: s('10S 6H', '10D 6C 9D'), dealerNat: s('10S 9H 2D', 'AD KC') },
  };
})()`);
check('hand values: aces count as 1 or 11 as needed, faces are 10, five cards can make 20', JSON.stringify(bj.vals) === JSON.stringify([15, 17, 12, 21, 21, 25, 20, 21, 20]), JSON.stringify(bj.vals));
check('a natural is exactly two cards making 21; soft hands are those still counting an ace as 11', JSON.stringify(bj.bj) === '[true,false,true]' && JSON.stringify(bj.soft) === '[true,false,false,true]', JSON.stringify({ bj: bj.bj, soft: bj.soft }));
check('the dealer draws to 16 and stands on every 17, soft included (the house rule)', JSON.stringify(bj.dealer) === '[true,false,false,true]', JSON.stringify(bj.dealer));
check('basic strategy: hit to 11, stand on 17+, stiff hands stand against a weak dealer and hit against a strong one, soft 18 hits a strong dealer', bj.strat.h8 === 'hit' && bj.strat.h11 === 'hit' && bj.strat.h12v2 === 'hit' && bj.strat.h12v5 === 'stand' && bj.strat.h16v6 === 'stand' && bj.strat.h16v10 === 'hit' && bj.strat.h17 === 'stand' && bj.strat.s17 === 'hit' && bj.strat.s18v6 === 'stand' && bj.strat.s18v10 === 'hit' && bj.strat.s19 === 'stand', JSON.stringify(bj.strat));
check('temperament shifts it: the bold hit a stiff 16 against a 6, the careful stand on it against a 7', bj.strat.bold16v6 === 'hit' && bj.strat.careful16v7 === 'stand' && bj.strat.mid16v7 === 'hit', JSON.stringify(bj.strat));
check('settling: a natural pays 3:2 (unless matched), bust loses first, a bust dealer loses to any live hand, equal is a push', bj.settle.nat.mult === 1.5 && bj.settle.natPush.result === 'push' && bj.settle.win.result === 'win' && bj.settle.lose.result === 'lose' && bj.settle.push.result === 'push' && bj.settle.bust.result === 'lose' && bj.settle.dealerBust.result === 'win' && bj.settle.dealerNat.result === 'lose', JSON.stringify(bj.settle));

console.log('\n7. Wiring and R1');
{
  const c = srcOf('cardgames.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../../../dev/verify/loadgame.js');
  check('cardgames.js is loaded by index.html and the verify loader, and never touches Math.random (every random thing takes an rng)', /srcfiles\/cardgames\.js\?v=\d+/.test(html) && /'cardgames\.js'/.test(loader) && !/Math\.random/.test(c));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const authored = c.replace(/\.bible|bible\?/g, '');   // npc.bible is a field name, not a word
  check('R1: no religion in the card engine', !vocab.test(authored), (authored.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
