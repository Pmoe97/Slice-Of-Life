// ===== SECTION: POKER =====
// Game Room Phase 4 (game-room-overhaul-plan.md D8, D11; 0.14.5): poker night. Texas Hold'em for 2–5
// seats — you and the roommates who are there — with per-session chips (everyone starts level; the
// stakes agreed up front decide what the chips are worth when the session ends). This file is the
// pure table: the state machine, the betting round, side pots, the showdown, and a whole-session
// simulator ("let it play out", and the headless result). The screen is render.games.js; the engine
// under it is cardgames.js (the deck, the evaluator, decidePokerAction, each roommate's style).
//
// A hand: everyone antes into the pot, two hole cards each, then pre-flop / flop / turn / river
// betting rounds (check, call, raise, fold, all-in) and a showdown. Raises are capped per round so a
// round always ends. Side pots are built from what each seat put in, so an all-in can only win what
// they were able to cover. Everything takes an rng (R6): a seeded night replays the same cards.

const POKER_TUNING = {
  startChips: 200,
  ante: 10,
  handsMax: 10,           // a poker night is this many hands unless somebody busts first
  maxRaisesPerRound: 3,
  minRaise: 20,           // the smallest raise on top of the current bet
  // Near the end of the night nobody folds away the last pots (cardgames.js's urgency).
  urgencyLastHands: 2, urgencyAmount: 0.4,
  // A lost pot of at least this many antes adds heat; a win cools it (tilt, D8).
  heatBigPot: 3, heatGain: 0.3, heatCool: 0.15,
  // Grading a night against one roommate: the chip gap as a share of the starting stack.
  close: 0.35, blowout: 1.0,
  minutesBase: 15, minutesPerHand: 6,
  seatsMax: 5,
};

function pokerSeat(id, chips) {
  return { id, chips, hand: [], bet: 0, invested: 0, folded: false, allIn: false, acted: false, out: false, heat: 0, wonLast: false };
}

function pokerNew(ids, opts) {
  const T = POKER_TUNING;
  const o = opts || {};
  const start = o.startChips ?? T.startChips;
  return {
    seats: ids.slice(0, T.seatsMax).map(id => pokerSeat(id, start)),
    dealer: -1, deck: [], community: [], pot: 0, currentBet: 0, raises: 0,
    phase: 'idle', turn: -1, handNo: 0, handsMax: o.handsMax ?? T.handsMax,
    ante: o.ante ?? T.ante, startChips: start, log: [], lastHand: null, over: false, omaha: !!o.omaha,
  };
}

// The next seat clockwise from `from` that satisfies `pred` (or -1).
function pokerNextSeat(state, from, pred) {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(state.seats[i], i)) return i;
  }
  return -1;
}

function pokerLive(state) { return state.seats.filter(s => !s.out); }
function pokerInHand(state) { return state.seats.filter(s => !s.out && !s.folded); }
function pokerCanAct(s) { return !s.out && !s.folded && !s.allIn; }

// Deals the next hand: antes in, two cards each. Mutates. Returns false if the night is over.
function pokerStartHand(state, rng) {
  if (state.over) return false;
  if (pokerLive(state).length < 2 || state.handNo >= state.handsMax) { state.over = true; state.phase = 'idle'; return false; }
  state.dealer = pokerNextSeat(state, state.dealer, s => !s.out);
  state.deck = shuffleDeck(createDeck(), rng);
  state.community = [];
  state.pot = 0; state.currentBet = 0; state.raises = 0;
  state.handNo += 1;
  state.lastHand = null;
  for (const s of state.seats) {
    s.hand = []; s.bet = 0; s.invested = 0; s.folded = s.out; s.allIn = false; s.acted = false; s.wonLast = false;
  }
  for (const s of state.seats) {
    if (s.out) continue;
    const a = Math.min(s.chips, state.ante);
    s.chips -= a; s.invested += a; state.pot += a;
    if (s.chips === 0) s.allIn = true;
  }
  for (let r = 0; r < 2; r++) for (const s of state.seats) if (!s.out) s.hand.push(state.deck.pop());
  state.phase = 'preflop';
  state.turn = pokerNextSeat(state, state.dealer, pokerCanAct);
  if (state.seats.filter(pokerCanAct).length < 2) pokerAdvance(state);   // (nearly) everyone all-in from the ante: no betting, deal it out
  return true;
}

// What seat i may do right now. Pure.
function pokerLegal(state, i) {
  const s = state.seats[i];
  if (!s || state.phase === 'idle' || state.phase === 'showdown' || state.turn !== i || !pokerCanAct(s)) return null;
  const toCall = Math.max(0, state.currentBet - s.bet);
  const maxTo = s.bet + s.chips;
  const minTo = Math.min(maxTo, state.currentBet + POKER_TUNING.minRaise);
  const canRaise = state.raises < POKER_TUNING.maxRaisesPerRound && maxTo > state.currentBet;
  return { toCall: Math.min(toCall, s.chips), canCheck: toCall === 0, canRaise, minTo, maxTo, allInOnly: canRaise && minTo >= maxTo };
}

function pokerLog(state, text) { state.log.push(text); if (state.log.length > 80) state.log.splice(0, state.log.length - 80); }

// Applies one action for seat i: 'fold' | 'check' | 'call' | 'raise' (with raiseTo, the total bet this
// round; all-in is a raise to everything). Mutates and returns { ok, action, amount, allIn, ended } —
// ended is set when the hand is over (a winner without a showdown, or the river was bet out).
function pokerAct(state, i, action, raiseTo) {
  const legal = pokerLegal(state, i);
  if (!legal) return { ok: false };
  const s = state.seats[i];
  const out = { ok: true, action, amount: 0, allIn: false, ended: false, seat: i };
  if (action === 'fold') {
    s.folded = true;
  } else if (action === 'check') {
    if (!legal.canCheck) { action = 'call'; out.action = 'call'; }
  }
  if (action === 'call') {
    const pay = Math.min(legal.toCall, s.chips);
    s.chips -= pay; s.bet += pay; s.invested += pay; state.pot += pay;
    out.amount = pay;
    if (s.chips === 0) { s.allIn = true; out.allIn = true; }
    if (pay === 0) out.action = 'check';
  } else if (action === 'raise') {
    if (!legal.canRaise) return pokerAct(state, i, legal.canCheck ? 'check' : 'call');
    const to = Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(raiseTo ?? legal.minTo)));
    const pay = to - s.bet;
    s.chips -= pay; s.bet += pay; s.invested += pay; state.pot += pay;
    state.currentBet = Math.max(state.currentBet, s.bet);
    state.raises += 1;
    out.amount = pay; out.raiseTo = s.bet;
    if (s.chips === 0) { s.allIn = true; out.allIn = true; }
    for (const o of state.seats) if (o !== s && pokerCanAct(o)) o.acted = false;   // everyone must answer a raise
  }
  s.acted = true;
  const inHand = pokerInHand(state);
  if (inHand.length === 1) {
    pokerAward(state, [inHand[0]], 'fold');
    out.ended = true;
    return out;
  }
  if (pokerRoundDone(state)) { pokerAdvance(state); out.ended = state.phase === 'idle'; }
  else state.turn = pokerNextSeat(state, i, pokerCanAct);
  return out;
}

// The betting round is over when everyone who can act has acted and matched the bet.
function pokerRoundDone(state) {
  for (const s of state.seats) {
    if (!pokerCanAct(s)) continue;
    if (!s.acted || s.bet !== state.currentBet) return false;
  }
  return true;
}

// Next street, or the showdown. Runs the board out if nobody can bet any more. Mutates.
function pokerAdvance(state) {
  for (;;) {
    for (const s of state.seats) { s.bet = 0; s.acted = false; }
    state.currentBet = 0; state.raises = 0;
    if (state.phase === 'preflop') { state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop()); state.phase = 'flop'; }
    else if (state.phase === 'flop') { state.community.push(state.deck.pop()); state.phase = 'turn'; }
    else if (state.phase === 'turn') { state.community.push(state.deck.pop()); state.phase = 'river'; }
    else { pokerShowdown(state); return; }
    const actors = state.seats.filter(pokerCanAct);
    if (actors.length >= 2) { state.turn = pokerNextSeat(state, state.dealer, pokerCanAct); return; }
    // one (or no) player left with chips to bet: no more betting, just deal it out
  }
}

// The pots, built from what each seat put in: a main pot and a side pot for each all-in level, each
// contested only by the players who covered it. Pure. Returns [{ amount, eligible: [seatIndex] }].
function pokerPots(seats) {
  const levels = [...new Set(seats.filter(s => s.invested > 0 && !s.folded && !s.out).map(s => s.invested))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lvl of levels) {
    const amount = seats.reduce((sum, s) => sum + Math.max(0, Math.min(s.invested, lvl) - Math.min(s.invested, prev)), 0);
    const eligible = seats.map((s, i) => (!s.folded && !s.out && s.invested >= lvl ? i : -1)).filter(i => i >= 0);
    if (amount > 0 && eligible.length) pots.push({ amount, eligible });
    prev = lvl;
  }
  // Chips folded players put in above the top live level (they can never be covered) go to the top pot.
  const top = levels.length ? levels[levels.length - 1] : 0;
  const stray = seats.reduce((sum, s) => sum + Math.max(0, s.invested - Math.max(top, 0)) * (s.folded || s.out ? 1 : 0), 0);
  if (stray > 0 && pots.length) pots[pots.length - 1].amount += stray;
  // Folded players' chips below the top level are already counted in the layers above (min(invested, lvl)).
  return pots;
}

function pokerAward(state, winnersSeats, how, detail) {
  const total = state.pot;
  const share = Math.floor(total / winnersSeats.length);
  let rem = total - share * winnersSeats.length;
  const order = winnersSeats.slice().sort((a, b) => state.seats.indexOf(a) - state.seats.indexOf(b));
  const res = [];
  for (const w of order) { const gain = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; w.chips += gain; w.wonLast = true; res.push({ id: w.id, amount: gain }); }
  pokerFinishHand(state, { how, winners: res, showdown: detail || [], pots: [{ amount: total, winners: res.map(r => r.id) }] });
}

function pokerShowdown(state) {
  state.phase = 'showdown';
  const contenders = state.seats.map((s, i) => ({ s, i })).filter(x => !x.s.folded && !x.s.out);
  const scored = new Map();
  for (const { s, i } of contenders) {
    scored.set(i, (state.omaha && state.community.length >= 3 && s.hand.length >= 4) ? evaluateOmaha(s.hand, state.community) : evaluateHand([...s.hand, ...state.community]));
  }
  const pots = pokerPots(state.seats);
  const won = {};
  const potResults = [];
  for (const pot of pots) {
    const cands = pot.eligible.filter(i => scored.has(i));
    if (!cands.length) continue;
    let best = scored.get(cands[0]);
    for (const i of cands) if (compareScores(scored.get(i), best) > 0) best = scored.get(i);
    const winners = cands.filter(i => compareScores(scored.get(i), best) === 0);
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    // the odd chip goes to the first winner left of the dealer
    const ordered = winners.slice().sort((a, b) => ((a - state.dealer - 1 + state.seats.length * 2) % state.seats.length) - ((b - state.dealer - 1 + state.seats.length * 2) % state.seats.length));
    for (const i of ordered) { const g = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; won[i] = (won[i] || 0) + g; }
    potResults.push({ amount: pot.amount, winners: ordered.map(i => state.seats[i].id) });
  }
  const winners = [];
  for (const [i, amt] of Object.entries(won)) { state.seats[i].chips += amt; state.seats[i].wonLast = true; winners.push({ id: state.seats[i].id, amount: amt }); }
  const showdown = contenders.map(({ s, i }) => ({ id: s.id, hand: s.hand.slice(), name: scored.get(i).name, rank: scored.get(i).rank }));
  pokerFinishHand(state, { how: 'showdown', winners, showdown, pots: potResults });
}

function pokerFinishHand(state, result) {
  state.lastHand = result;
  state.pot = 0;
  const bigPot = POKER_TUNING.heatBigPot * state.ante;
  const potSize = result.winners.reduce((a, w) => a + w.amount, 0);
  for (const s of state.seats) {
    if (s.out) continue;
    if (s.wonLast) s.heat = Math.max(0, s.heat - POKER_TUNING.heatCool);
    else if (!s.folded && potSize >= bigPot) s.heat = Math.min(1, s.heat + POKER_TUNING.heatGain);
    if (s.chips <= 0) { s.out = true; s.folded = true; }
  }
  state.phase = 'idle';
  state.turn = -1;
  const live = pokerLive(state);
  if (live.length < 2 || state.handNo >= state.handsMax || state.seats[0].out) state.over = true;
}

// --- A roommate's turn -------------------------------------------------------------------------
// `styles[id]` is the seat's poker style (pokerStyleFor). Returns the pokerAct result. Pure given rng.
function pokerNpcTurn(state, rng, styles) {
  const i = state.turn;
  const s = state.seats[i];
  const legal = pokerLegal(state, i);
  if (!s || !legal) return { ok: false };
  const base = (styles && styles[s.id]) || { ...POKER_STYLE.base, tilt: 0 };
  const T = POKER_TUNING;
  const last = state.handsMax - state.handNo < T.urgencyLastHands;
  const style = { ...pokerTiltedStyle(base, s.heat), urgency: (base.urgency || 0) + (last ? T.urgencyAmount : 0) };
  const table = { community: state.community, pot: state.pot, currentBet: state.currentBet, ante: state.ante, live: pokerInHand(state).length - 1 };
  const d = decidePokerAction({ hand: s.hand, chips: s.chips, bet: s.bet }, table, style, rng, { omaha: state.omaha });
  let action = d.action;
  if (action === 'check' && !legal.canCheck) action = 'call';
  if (action === 'raise' && !legal.canRaise) action = legal.canCheck ? 'check' : 'call';
  const r = pokerAct(state, i, action, d.raiseTo);
  r.bluffing = !!d.bluffing;
  return r;
}

// The whole night, played out by the model: every seat (yours included, at `styles.player`) decides like
// a roommate would. Mutates `state` and returns it. Used headless and by "let it play out".
function pokerSimulate(state, rng, styles) {
  let guard = 0;
  while (!state.over && guard++ < 2000) {
    if (state.phase === 'idle') { if (!pokerStartHand(state, rng)) break; continue; }
    if (state.turn < 0) { pokerAdvance(state); continue; }
    pokerNpcTurn(state, rng, styles);
  }
  return state;
}

// --- The night's result ------------------------------------------------------------------------

// Standings, and how you did against each roommate. `playerId` is 'player'. Pure.
function pokerNightResult(state, playerId, names) {
  const T = POKER_TUNING;
  const me = state.seats.find(s => s.id === playerId);
  const standings = state.seats.slice().sort((a, b) => b.chips - a.chips).map(s => ({ id: s.id, chips: s.chips, out: s.out }));
  const results = state.seats.filter(s => s.id !== playerId).map(o => {
    const gap = me.chips - o.chips;
    const playerWon = gap > 0;
    const rel = Math.abs(gap) / state.startChips;
    return { npcId: o.id, playerWon, grade: rel <= T.close ? 'close' : rel >= T.blowout ? 'blowout' : 'normal', gap, chips: o.chips };
  });
  const place = standings.findIndex(s => s.id === playerId) + 1;
  const net = me.chips - state.startChips;
  const others = state.seats.filter(s => s.id !== playerId);
  const first = standings[0];
  const nm = (id) => (names && names[id]) || 'them';
  const summary = net > 0
    ? `You leave the table ${net} chips up${first.id === playerId ? ', top of the table' : ''}.`
    : net < 0 ? `You leave the table ${-net} chips down${first.id !== playerId ? `; ${nm(first.id)} took the night` : ''}.`
    : 'You break even on the night.';
  return { standings, results, place, seats: state.seats.length, net, playerId, hands: state.handNo, summary, minutes: T.minutesBase + T.minutesPerHand * state.handNo, others: others.length };
}

// Turns a night's chips into what was agreed (D3, D17): an IOU amount is the most that can change hands
// (a full stack won or lost), scaled by how far the chips moved, and split among the roommates in
// proportion to their chips lost (if you won) or won (if you lost). Pure. Returns
// [{ npcId, amount, playerWon }] with whole-dollar amounts summing to at most `amount`.
function pokerIouShares(state, playerId, amount) {
  const me = state.seats.find(s => s.id === playerId);
  const net = me.chips - state.startChips;
  if (!net || !(amount > 0)) return [];
  const total = Math.min(amount, Math.round(Math.abs(net) / state.startChips * amount));
  if (total <= 0) return [];
  const others = state.seats.filter(s => s.id !== playerId);
  const delta = others.map(o => (net > 0 ? Math.max(0, state.startChips - o.chips) : Math.max(0, o.chips - state.startChips)));
  const sum = delta.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  let left = total;
  const shares = others.map((o, k) => ({ npcId: o.id, amount: Math.floor(total * delta[k] / sum), playerWon: net > 0 }));
  left -= shares.reduce((a, s) => a + s.amount, 0);
  for (let k = 0; left > 0 && k < shares.length; k = (k + 1) % shares.length) { if (delta[k] > 0) { shares[k].amount++; left--; } }
  return shares.filter(s => s.amount > 0);
}
// ===== /SECTION: POKER =====
