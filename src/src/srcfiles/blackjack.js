// ===== SECTION: BLACKJACK =====
// Game Room Phase 5 (game-room-overhaul-plan.md D12; 0.14.5): blackjack with a roommate dealing.
// Versus, not the house: the roommate is the dealer, playing their own stack, so chips move between
// the two of you and a night has a real winner. House rules: the dealer draws to 16 and stands on
// every 17 (soft included), a natural pays 3:2, double down on your first two cards, no splitting
// (a home game), a fresh deck every hand. Spanish 21 (no tens) is a variant flag.
//
// The pure half: the table's state machine, the settlement, a whole-night simulator ("let it play
// out", and the headless result), and the night's result. The screen is render.games.js; the card
// arithmetic is cardgames.js. Everything takes an rng (R6).

const BJ_TUNING = {
  startChips: 200,
  handsMax: 8,
  minBet: 10, betStep: 5, maxBetShare: 0.5,     // a bet is at most half of the shorter stack
  simBet: 20,                                     // the modelled player's flat bet
  close: 0.35, blowout: 1.0,                      // the chip gap as a share of the starting stack
  minutesBase: 8, minutesPerHand: 3,
};

function bjNew(opts) {
  const o = opts || {};
  const start = o.startChips ?? BJ_TUNING.startChips;
  return {
    playerChips: start, dealerChips: start, startChips: start,
    phase: 'bet', deck: [], player: [], dealer: [], bet: 0, doubled: false,
    handNo: 0, handsMax: o.handsMax ?? BJ_TUNING.handsMax, spanish: !!o.spanish,
    last: null, over: false, log: [],
  };
}

// The most that can be bet this hand. Pure.
function bjMaxBet(state) {
  const short = Math.min(state.playerChips, state.dealerChips);
  const cap = Math.floor(short * BJ_TUNING.maxBetShare / BJ_TUNING.betStep) * BJ_TUNING.betStep;
  return Math.min(short, Math.max(cap, BJ_TUNING.minBet));
}

function bjMinBet(state) { return Math.min(BJ_TUNING.minBet, Math.min(state.playerChips, state.dealerChips)); }

function bjCheckOver(state) {
  if (state.handNo >= state.handsMax || state.playerChips <= 0 || state.dealerChips <= 0) state.over = true;
  return state.over;
}

// Deals a hand for `bet` chips. Mutates. Returns { ok, natural } (a natural on either side ends the hand
// at once).
function bjDeal(state, rng, bet) {
  if (state.over || state.phase !== 'bet') return { ok: false };
  const min = bjMinBet(state), max = Math.max(min, bjMaxBet(state));
  const b = Math.max(min, Math.min(max, Math.round(bet || min)));
  if (!(b > 0)) return { ok: false };
  state.deck = shuffleDeck(createDeck({ spanish: state.spanish }), rng);
  state.bet = b; state.doubled = false; state.last = null;
  state.handNo += 1;
  state.player = [state.deck.pop(), state.deck.pop()];
  state.dealer = [state.deck.pop(), state.deck.pop()];
  state.phase = 'player';
  if (isBlackjack(state.player) || isBlackjack(state.dealer)) { bjFinish(state); return { ok: true, natural: true }; }
  return { ok: true, natural: false };
}

// The player's options right now. Pure.
function bjLegal(state) {
  if (state.phase !== 'player') return null;
  const first = state.player.length === 2 && !state.doubled;
  const canDouble = first && state.playerChips >= state.bet * 2 && state.dealerChips >= state.bet * 2;
  return { canHit: bjValue(state.player) < 21, canStand: true, canDouble };
}

function bjAct(state, action) {
  const legal = bjLegal(state);
  if (!legal) return { ok: false };
  if (action === 'hit' && legal.canHit) {
    state.player.push(state.deck.pop());
    if (bjValue(state.player) > 21) { bjFinish(state); return { ok: true, bust: true, ended: true }; }
    if (bjValue(state.player) === 21) return bjAct(state, 'stand');
    return { ok: true };
  }
  if (action === 'double' && legal.canDouble) {
    state.bet *= 2; state.doubled = true;
    state.player.push(state.deck.pop());
    if (bjValue(state.player) > 21) { bjFinish(state); return { ok: true, bust: true, ended: true, doubled: true }; }
    return { ...bjAct(state, 'stand'), doubled: true };
  }
  if (action === 'stand') {
    state.phase = 'dealer';
    while (bjDealerShouldHit(state.dealer)) state.dealer.push(state.deck.pop());
    bjFinish(state);
    return { ok: true, ended: true };
  }
  return { ok: false };
}

// Settles the hand: chips move, the record is kept, the night may end. Mutates.
function bjFinish(state) {
  const s = bjSettle(state.player, state.dealer);
  const delta = Math.round(state.bet * s.mult);
  state.playerChips += delta; state.dealerChips -= delta;
  state.last = { result: s.result, delta, bet: state.bet, player: state.player.slice(), dealer: state.dealer.slice(), pv: bjValue(state.player), dv: bjValue(state.dealer), doubled: state.doubled };
  state.phase = 'bet';
  bjCheckOver(state);
}

// The whole night, played by the model: the player plays basic strategy for a flat bet. Mutates and
// returns the state. Used headless and by "let it play out".
function bjSimulate(state, rng, risk, bet) {
  let guard = 0;
  while (!state.over && guard++ < 200) {
    bjDeal(state, rng, bet ?? BJ_TUNING.simBet);
    let g = 0;
    while (state.phase === 'player' && g++ < 12) {
      const act = bjNpcDecision(state.player, state.dealer[0], risk || 0);
      bjAct(state, act === 'hit' ? 'hit' : 'stand');
    }
  }
  return state;
}

// The night's result against the dealer. Pure.
function bjNightResult(state, dealerName) {
  const T = BJ_TUNING;
  const net = state.playerChips - state.startChips;
  const playerWon = net > 0;
  const rel = Math.abs(net) / state.startChips;
  const grade = rel <= T.close ? 'close' : rel >= T.blowout ? 'blowout' : 'normal';
  const nm = dealerName || 'the dealer';
  const summary = net > 0 ? `You walk away ${net} chips up on ${nm}.` : net < 0 ? `${nm} takes ${-net} chips off you.` : `You and ${nm} finish level.`;
  return { playerWon, grade, net, summary, hands: state.handNo, minutes: T.minutesBase + T.minutesPerHand * state.handNo, gap: Math.abs(net) };
}

// An IOU by how far the chips moved: a full stack won or lost is the whole stake, capped. Pure. Whole dollars.
function bjIouAmount(state, amount) {
  if (!(amount > 0)) return 0;
  const net = Math.abs(state.playerChips - state.startChips);
  return Math.min(amount, Math.round(net / state.startChips * amount));
}
// ===== /SECTION: BLACKJACK =====
