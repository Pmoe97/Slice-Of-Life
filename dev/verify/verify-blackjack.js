// Game Room Phase 5 — blackjack (blackjack.js; game-room-overhaul-plan.md D12; 0.14.5).
//
//   node dev/verify/verify-blackjack.js
//
// The table's state machine (bets, the deal, naturals, hit / stand / double, bust, the dealer's rule),
// settlement in chips (3:2, push, doubled), a whole seeded night (chips conserved, it ends, near a fair
// game for basic strategy), the night's result and the IOU scaling, and its route through the match spine.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'games.js', 'cardgames.js', 'blackjack.js', 'state.js'],
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
  // A hand in play with chosen cards: player, dealer, and what the deck will give (in order).
  __hand = (player, dealer, draws, bet, opts) => {
    const st = bjNew(opts || {});
    st.handNo = 1; st.phase = 'player'; st.bet = bet || 20;
    st.player = __c(player); st.dealer = __c(dealer);
    st.deck = __c(draws || '2C').reverse();
    return st;
  };
`);

console.log('\n0. The table');
const table = J(`(() => {
  const st = bjNew({});
  const fresh = { p: st.playerChips, d: st.dealerChips, phase: st.phase, hands: st.handsMax, over: st.over };
  const mb = { min: bjMinBet(st), max: bjMaxBet(st) };
  const small = bjNew({ startChips: 30 }); const smallBet = { min: bjMinBet(small), max: bjMaxBet(small) };
  const tiny = bjNew({ startChips: 10 }); const tinyBet = { min: bjMinBet(tiny), max: bjMaxBet(tiny) };
  const dealt = (() => { const s = bjNew({}); const r = bjDeal(s, mulberry32(4), 50); return { ok: r.ok, phase: s.phase, p: s.player.length, d: s.dealer.length, bet: s.bet, deck: s.deck.length, hand: s.handNo }; })();
  const clampHigh = (() => { const s = bjNew({}); bjDeal(s, mulberry32(4), 9999); return s.bet; })();
  const clampLow = (() => { const s = bjNew({}); bjDeal(s, mulberry32(4), 1); return s.bet; })();
  const twice = (() => { const s = bjNew({}); bjDeal(s, mulberry32(4), 20); const b = bjDeal(s, mulberry32(5), 20); return b.ok; })();
  const spanish = (() => { const s = bjNew({ spanish: true }); bjDeal(s, mulberry32(9), 20); return s.deck.length + s.player.length + s.dealer.length; })();
  const same = (() => { const a = bjNew({}), b = bjNew({}); bjDeal(a, mulberry32(11), 20); bjDeal(b, mulberry32(11), 20); return JSON.stringify([a.player, a.dealer]) === JSON.stringify([b.player, b.dealer]); })();
  return { fresh, mb, smallBet, tinyBet, dealt, clampHigh, clampLow, twice, spanish, same };
})()`);
check('a table opens level with a night of eight hands; bets run from 10 up to half of the shorter stack', table.fresh.p === 200 && table.fresh.d === 200 && table.fresh.phase === 'bet' && table.fresh.hands === 8 && !table.fresh.over && table.mb.min === 10 && table.mb.max === 100 && table.smallBet.max === 15 && table.tinyBet.max === 10, JSON.stringify({ mb: table.mb, small: table.smallBet, tiny: table.tinyBet }));
check('the deal: two cards each, the bet taken as asked (clamped to the limits), 48 left in the deck (44 for Spanish 21 with no tens: 48 cards)', table.dealt.ok && table.dealt.p === 2 && table.dealt.d === 2 && table.dealt.bet === 50 && table.dealt.deck === 48 && table.clampHigh === 100 && table.clampLow === 10 && table.spanish === 48, JSON.stringify(table.dealt));
check('one hand at a time; the same seed deals the same cards', table.twice === false && table.same);

const nat = J(`(() => {
  let playerNat = null, dealerNat = null, bothNat = null;
  for (let seed = 1; seed < 4000 && !(playerNat && dealerNat && bothNat); seed++) {
    const s = bjNew({}); bjDeal(s, mulberry32(seed), 20);
    const pn = isBlackjack(s.player), dn = isBlackjack(s.dealer);
    if (pn && !dn && !playerNat) playerNat = { seed, chips: s.playerChips, dealer: s.dealerChips, last: s.last && s.last.result, phase: s.phase };
    if (dn && !pn && !dealerNat) dealerNat = { seed, chips: s.playerChips, last: s.last && s.last.result };
    if (dn && pn && !bothNat) bothNat = { seed, chips: s.playerChips, last: s.last && s.last.result };
  }
  return { playerNat, dealerNat, bothNat };
})()`);
check('a natural ends the hand at once: yours pays 3:2, the dealer\'s takes your bet, both is a push', nat.playerNat && nat.playerNat.last === 'blackjack' && nat.playerNat.chips === 230 && nat.playerNat.dealer === 170 && nat.playerNat.phase === 'bet' && nat.dealerNat && nat.dealerNat.last === 'lose' && nat.dealerNat.chips === 180 && nat.bothNat && nat.bothNat.last === 'push' && nat.bothNat.chips === 200, JSON.stringify(nat));

console.log('\n1. Playing a hand');
const play = J(`(() => {
  // hit to a bust
  const a = __hand('10S 6H', '9D 8C', '9S');
  const l0 = bjLegal(a);
  const hit = bjAct(a, 'hit');
  const bust = { bust: hit.bust, phase: a.phase, chips: a.playerChips, dealer: a.dealerChips, last: a.last.result };
  // hit to 21 stands automatically, then the dealer plays
  const b = __hand('10S 5H', '9D 8C', '6S');
  const h21 = bjAct(b, 'hit');
  const twentyOne = { pv: bjValue(b.player), phase: b.phase, last: b.last.result, chips: b.playerChips };
  // stand: the dealer draws to 16 and stands on 17
  const c = __hand('10S 9H', '6D 10C', '5S 2C');
  bjAct(c, 'stand');
  const d16 = { dealer: c.dealer.map(cardLabel), dv: bjValue(c.dealer), last: c.last.result };
  const soft = __hand('10S 9H', 'AD 6C', '5S');
  bjAct(soft, 'stand');
  const s17 = { dealer: soft.dealer.map(cardLabel), last: soft.last.result };
  const hard17 = __hand('10S 9H', '10D 7C', '5S');
  bjAct(hard17, 'stand');
  const h17 = { dealer: hard17.dealer.length, last: hard17.last.result };
  const dbust = __hand('10S 6H', '10D 6C', '9S');
  bjAct(dbust, 'stand');
  const db = { last: dbust.last.result, chips: dbust.playerChips };
  const win = __hand('10S 10H', '10D 8C', '2S'); bjAct(win, 'stand');
  const lose = __hand('10S 7H', '10D 8C', '2S'); bjAct(lose, 'stand');
  const push = __hand('10S 8H', '10D 8C', '2S'); bjAct(push, 'stand');
  // double
  const d = __hand('6S 5H', '10D 7C', '9S');
  const dl = bjLegal(d);
  const dr = bjAct(d, 'double');
  const doubled = { canDouble: dl.canDouble, bet: d.last.bet, delta: d.last.delta, chips: d.playerChips, dv: d.last.pv, flag: d.last.doubled };
  const notFirst = __hand('2S 3H 4D', '10D 7C', '9S'); const nf = bjLegal(notFirst);
  const poor = __hand('6S 5H', '10D 7C', '9S', 20); poor.playerChips = 30; const pl = bjLegal(poor);
  const wrong = bjAct(__hand('10S 9H', '10D 7C', '2S'), 'sit');
  const idle = bjAct(bjNew({}), 'stand');
  return { l0, bust, twentyOne, d16, s17, h17, db, results: [win.last.result, lose.last.result, push.last.result], winDelta: win.last.delta, chips: [win.playerChips, lose.playerChips, push.playerChips], doubled, notFirst: nf.canDouble, poor: pl.canDouble, wrong: wrong.ok, idle: idle.ok };
})()`);
check('at the start of a hand you may hit, stand or double', play.l0.canHit && play.l0.canStand && play.l0.canDouble);
check('going over 21 loses at once and the dealer never plays; chips move both ways', play.bust.bust && play.bust.phase === 'bet' && play.bust.chips === 180 && play.bust.dealer === 220 && play.bust.last === 'lose', JSON.stringify(play.bust));
check('hitting to 21 stands for you', play.twentyOne.pv === 21 && play.twentyOne.phase === 'bet' && play.twentyOne.last === 'win' && play.twentyOne.chips === 220, JSON.stringify(play.twentyOne));
check('the dealer draws to 16, stands on 17 — hard or soft — and busts on 22+', play.d16.dv === 23 || play.d16.dv >= 17, JSON.stringify(play.d16));
check('a soft 17 stands (no draw); a hard 17 stands; a bust dealer pays', play.s17.dealer.length === 2 && play.h17.dealer === 2 && play.db.last === 'win' && play.db.chips === 220, JSON.stringify({ s17: play.s17, h17: play.h17, db: play.db }));
check('win, lose and push settle as they should', JSON.stringify(play.results) === '["win","lose","push"]' && play.winDelta === 20 && JSON.stringify(play.chips) === '[220,180,200]', JSON.stringify(play.results));
check('double down: the bet doubles, one card, you stand — and it pays or costs double; only on your first two cards, and only if you can cover it', play.doubled.canDouble && play.doubled.bet === 40 && play.doubled.flag && play.doubled.dv === 20 && play.doubled.delta === 40 && play.notFirst === false && play.poor === false, JSON.stringify(play.doubled));
check('nonsense actions and acting out of turn do nothing', play.wrong === false && play.idle === false);

console.log('\n2. A whole night');
const night = J(`(() => {
  const run = (seed, risk, bet) => { const st = bjNew({}); bjSimulate(st, mulberry32(seed), risk, bet); return st; };
  const a = run(21), b = run(21);
  const same = JSON.stringify([a.playerChips, a.dealerChips, a.handNo]) === JSON.stringify([b.playerChips, b.dealerChips, b.handNo]);
  let conserved = 0, ended = 0, nonneg = 0, hands = 0, sumNet = 0, wins = 0, N = 2000;
  for (let i = 0; i < N; i++) { const st = run(1000 + i); if (st.playerChips + st.dealerChips === 400) conserved++; if (st.over) ended++; if (st.playerChips >= 0 && st.dealerChips >= 0) nonneg++; hands += st.handNo; sumNet += st.playerChips - 200; if (st.playerChips > 200) wins++; }
  // a big flat bet can bust either side, and the night still ends
  let bigOk = 0; for (let i = 0; i < 200; i++) { const st = run(50000 + i, 0, 100); if (st.over && st.playerChips + st.dealerChips === 400) bigOk++; }
  const bold = (() => { let s = 0; for (let i = 0; i < 600; i++) s += run(9000 + i, 1).playerChips - 200; return s / 600; })();
  return { same, conserved: conserved / N, ended: ended / N, nonneg: nonneg / N, avgHands: hands / N, meanNet: sumNet / N, winRate: wins / N, bigOk: bigOk / 200, bold };
})()`);
check('a seeded night replays exactly; every night ends with chips conserved and never negative, even with big bets', night.same && night.conserved === 1 && night.ended === 1 && night.nonneg === 1 && night.bigOk === 1, JSON.stringify(night));
check('a night runs about its length', night.avgHands >= 6 && night.avgHands <= 8, String(night.avgHands));
check('basic strategy against this dealer is close to a fair game (a small house edge, not a rout: no splits, no insurance)', night.meanNet > -8 && night.meanNet < 4 && night.winRate > 0.35 && night.winRate < 0.55, JSON.stringify({ mean: night.meanNet, win: night.winRate }));

console.log('\n3. The result');
const res = J(`(() => {
  const mk = (p) => { const s = bjNew({}); s.playerChips = p; s.dealerChips = 400 - p; s.handNo = 8; return s; };
  const up = bjNightResult(mk(230), 'Mira'), down = bjNightResult(mk(20), 'Mira'), even = bjNightResult(mk(200), 'Mira'), big = bjNightResult(mk(400), 'Mira');
  return { up, down, even, bigGrade: big.grade, iou: [bjIouAmount(mk(300), 20), bjIouAmount(mk(50), 20), bjIouAmount(mk(400), 20), bjIouAmount(mk(200), 20), bjIouAmount(mk(300), 0)] };
})()`);
check('the result: who won, by how much, graded by the chip gap, a line naming the dealer and the minutes it took', res.up.playerWon && res.up.net === 30 && res.up.grade === 'close' && /Mira/.test(res.up.summary) && res.down.playerWon === false && res.down.grade === 'normal' && res.bigGrade === 'blowout' && res.even.playerWon === false && res.up.minutes === 8 + 3 * 8, JSON.stringify(res));
check('an IOU is scaled by how far the chips moved, and capped at the stake; nothing on an even night', JSON.stringify(res.iou) === '[10,15,20,0,0]', JSON.stringify(res.iou));

console.log('\n4. Through the match spine');
api(`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260929, n === undefined ? 3 : n);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'game_room'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.8, tension: 0 }; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
`);
const spine = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const noCards = gameOptions(g, 'game_room').includes('blackjack');
  g.player.inventory = [{ defId: 'playing_cards', qty: 1 }];
  const withCards = gameOptions(g, 'game_room').includes('blackjack');
  const p1 = gamePlanMatch(g, 'blackjack', A, 'iou', 20), p2 = gamePlanMatch(g, 'blackjack', A, 'iou', 20);
  const played = gamePlanMatch(g, 'blackjack', A, 'iou', 20, { playerWon: true, grade: 'close', summary: 'You walk away 30 chips up on Mira.', minutes: 32, iouAmount: 3 });
  const nothing = gamePlanMatch(g, 'blackjack', A, 'iou', 20, { playerWon: false, grade: 'normal', summary: 'x', minutes: 20, iouAmount: 0 });
  const pool = gamePlanMatch(g, 'pool', A, 'iou', 20);
  const line = gameMatchNarration(g, played);
  return { noCards, withCards, same: JSON.stringify(p1) === JSON.stringify(p2), modelled: p1.played === true && /Mira/.test(p1.summary), stake: p1.stakeId, amt: p1.amount, played: { stake: played.stakeId, amt: played.amount, minutes: played.minutes, won: played.playerWon }, nothing: nothing.stakeId, poolAmt: pool.amount, line, def: { mg: GAME_DEFS.blackjack.minigame, multi: !!GAME_DEFS.blackjack.multi } };
})()`);
check('blackjack needs the deck; headless it is modelled and deterministic, its IOU scaled by the chips, and told by its own summary', spine.noCards === false && spine.withCards && spine.same && spine.modelled && spine.def.mg === 'blackjack' && spine.def.multi === false && (spine.stake === 'brag' || spine.amt <= 20), JSON.stringify(spine));
check('a played night becomes the plan: the winner, its minutes, the IOU as reported (nothing to pay is bragging rights); other games keep the fixed stake', spine.played.won && spine.played.minutes === 32 && spine.played.stake === 'iou' && spine.played.amt === 3 && spine.nothing === 'brag' && spine.poolAmt === 20 && /walk away/.test(spine.line), JSON.stringify(spine));

console.log('\n5. Wiring and R1');
{
  const b = srcOf('blackjack.js'), ui = srcOf('render.games.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../../../dev/verify/loadgame.js');
  check('blackjack.js is loaded by index.html and the verify loader, every random thing takes an rng, and the screen is wired', /srcfiles\/blackjack\.js\?v=\d+/.test(html) && /'blackjack\.js'/.test(loader) && !/Math\.random/.test(b) && /function openBlackjackGame\(/.test(ui) && /kind === 'blackjack'\) return openBlackjackGame/.test(ui));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  check('R1: no religion in the blackjack table', !vocab.test(b), (b.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
