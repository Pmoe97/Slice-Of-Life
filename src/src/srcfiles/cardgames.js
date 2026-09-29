// ===== SECTION: CARDGAMES =====
// Game Room Phase 3 (game-room-overhaul-plan.md D8, D11, D12, R12; 0.14.5): the card engine, ported
// from the user's own AcesAndLace (C:\Projects\AcesAndLace\AcesAndLace.html) as engine MATH, not code
// shape: the deck, the best-five-of-N evaluator, one shared 0–1 strength scale, and blackjack's
// arithmetic come across nearly verbatim (the random source is an rng that is passed in, so a
// seeded table replays the same deal — R6). Its opponent logic is redesigned as a pure multi-way
// decidePokerAction(seat, table, style, rng) whose play style is drawn from the roommate's own
// temperament and traits (D8), and its heads-up-only bookkeeping is gone.
//
// No UI, no DOM, no globals of its own: the poker table (Phase 4) and blackjack (Phase 5) are
// state machines built on top of this and games.js's match spine.

const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_RANK_VAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// Strength of a made hand by rank (high card … royal flush) on the same 0–1 scale as pre-flop.
const CARD_RANK_STRENGTH = [0.18, 0.36, 0.56, 0.68, 0.78, 0.85, 0.92, 0.97, 0.99, 1.0];

// Play-style baselines (AcesAndLace's DIFF, "normal") and how far a temperament moves them.
const POKER_STYLE = {
  base: { strengthBias: 0, bluff: 0.10, foldPressure: 1.0, aggression: 0.65, slowplay: 0.08, exploit: 0.5 },
  // Temperament axes (about −1..1) and personality trait tags each nudge one dial (D8).
  assertiveness: { aggression: 0.22, bluff: 0.04 },
  volatility: { tilt: 0.6 },
  traits: {
    deceptive: { bluff: 0.10 }, teasing: { bluff: 0.06 }, manipulative: { bluff: 0.08 }, honest: { bluff: -0.06 },
    cautious: { foldPressure: 0.18 }, anxious: { foldPressure: 0.14 }, guarded: { foldPressure: 0.08 },
    patient: { slowplay: 0.08 }, methodical: { strengthBias: 0.04, slowplay: 0.03 }, impulsive: { strengthBias: -0.04, aggression: 0.06 },
    confident: { aggression: 0.05 }, insecure: { foldPressure: 0.08 }, rebellious: { bluff: 0.03 },
  },
  min: { aggression: 0.3, bluff: 0.02, foldPressure: 0.75, slowplay: 0.01 },
  max: { aggression: 0.92, bluff: 0.32, foldPressure: 1.35, slowplay: 0.3 },
  // Fewer people in the pot means a hand is worth more; more, less (per extra live opponent).
  multiway: 0.035,
  // Heat (AcesAndLace's tilt): a run of losses makes a volatile player push harder and fold less.
  tiltAggression: 0.2, tiltFold: 0.25,
};

function cardClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// --- The deck --------------------------------------------------------------------------------

function createDeck(opts) {
  const d = [];
  for (const s of CARD_SUITS) for (const r of CARD_RANKS) {
    if (opts && opts.spanish && r === '10') continue;   // Spanish 21: 48 cards, no tens
    d.push({ suit: s, rank: r, val: CARD_RANK_VAL[r] });
  }
  return d;
}

// Fisher–Yates with a passed-in rng: the same seed always deals the same hands. Mutates and returns.
function shuffleDeck(d, rng) {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardLabel(c) { return `${c.rank}${c.suit}`; }

// --- The hand evaluator ------------------------------------------------------------------------

function cardCombinations(arr, k) {
  if (k > arr.length) return [];
  if (k === 0) return [[]];
  if (k === arr.length) return [arr.slice()];
  const [f, ...r] = arr;
  const withF = cardCombinations(r, k - 1).map(c => [f, ...c]);
  const without = cardCombinations(r, k);
  return [...withF, ...without];
}

// One five-card hand's rank: { rank 0..9, name, values[] (the tie-break ladder), cards }.
function scoreFive(cards) {
  const vals = cards.map(c => c.val).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const rc = {};
  for (const v of vals) rc[v] = (rc[v] || 0) + 1;
  const counts = Object.values(rc).sort((a, b) => b - a);
  const groups = Object.entries(rc).sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(e => parseInt(e[0]));
  const uv = [...new Set(vals)].sort((a, b) => b - a);
  let isStraight = false, sHigh = 0;
  if (uv.length === 5) {
    if (uv[0] - uv[4] === 4) { isStraight = true; sHigh = uv[0]; }
    if (uv[0] === 14 && uv[1] === 5 && uv[2] === 4 && uv[3] === 3 && uv[4] === 2) { isStraight = true; sHigh = 5; }   // the wheel
  }
  if (isStraight && isFlush) {
    if (sHigh === 14) return { rank: 9, name: 'Royal Flush', values: [9, 14], cards };
    return { rank: 8, name: 'Straight Flush', values: [8, sHigh], cards };
  }
  if (counts[0] === 4) return { rank: 7, name: 'Four of a Kind', values: [7, groups[0], groups[1]], cards };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, name: 'Full House', values: [6, groups[0], groups[1]], cards };
  if (isFlush) return { rank: 5, name: 'Flush', values: [5, ...vals], cards };
  if (isStraight) return { rank: 4, name: 'Straight', values: [4, sHigh], cards };
  if (counts[0] === 3) return { rank: 3, name: 'Three of a Kind', values: [3, groups[0], groups[1], groups[2]], cards };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, name: 'Two Pair', values: [2, groups[0], groups[1], groups[2]], cards };
  if (counts[0] === 2) return { rank: 1, name: 'Pair', values: [1, groups[0], ...vals.filter(v => v !== groups[0]).slice(0, 3)], cards };
  return { rank: 0, name: 'High Card', values: [0, ...vals], cards };
}

// >0 if a beats b, <0 if b beats a, 0 for a split pot.
function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const av = a.values[i] || 0, bv = b.values[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// The best five of any five to seven cards (hold'em and stud).
function evaluateHand(cards) {
  const all = cards.slice().sort((a, b) => b.val - a.val);
  if (all.length < 5) return { rank: 0, name: 'Incomplete', values: [0], cards: all };
  let best = null;
  for (const c of cardCombinations(all, 5)) {
    const r = scoreFive(c);
    if (!best || compareScores(r, best) > 0) best = r;
  }
  return best;
}

// Omaha: exactly two of your four and three of the five.
function evaluateOmaha(hole, community) {
  let best = null;
  for (const h of cardCombinations(hole, 2)) for (const c of cardCombinations(community, 3)) {
    const r = scoreFive([...h, ...c]);
    if (!best || compareScores(r, best) > 0) best = r;
  }
  return best || { rank: 0, name: 'Incomplete', values: [0], cards: [] };
}

// Who wins a showdown: the indices of the best hand(s) among `hands` (each with its community).
function showdownWinners(hands, community, opts) {
  const scored = hands.map(h => (opts && opts.omaha && community.length >= 3 && h.length >= 4) ? evaluateOmaha(h, community) : evaluateHand([...h, ...community]));
  let best = scored[0];
  for (const s of scored) if (compareScores(s, best) > 0) best = s;
  return { winners: scored.map((s, i) => (compareScores(s, best) === 0 ? i : -1)).filter(i => i >= 0), scored };
}

// --- Strength: pre-flop and post-flop on one 0–1 scale -----------------------------------------
// (AcesAndLace's own comment: they used to be two incompatible scales, so the AI was reckless
// pre-flop and folded almost everything after the flop. Both share one now.)

function twoCardStrength(a, b, suited) {
  const hi = Math.max(a, b), lo = Math.min(a, b), gap = hi - lo;
  if (hi === lo) return cardClamp(0.48 + ((hi - 2) / 12) * 0.47, 0.48, 0.95);   // a pair
  let s = 0.10 + ((hi - 2) / 12) * 0.30 + ((lo - 2) / 12) * 0.18;
  if (suited) s += 0.07;
  if (gap === 1) s += 0.06; else if (gap === 2) s += 0.03; else if (gap > 4) s -= 0.05;
  return cardClamp(s, 0.05, 0.80);
}

function preflopStrength(cards) {
  if (cards.length < 2) return 0.2;
  let best = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    best = Math.max(best, twoCardStrength(cards[i].val, cards[j].val, cards[i].suit === cards[j].suit));
  }
  return cardClamp(best + (cards.length > 2 ? 0.03 * (cards.length - 2) : 0), 0, 1);   // extra hole cards are worth a little
}

function handStrength(cards, community, opts) {
  const comm = community || [];
  const all = [...cards, ...comm];
  if (all.length < 5) return preflopStrength(cards);
  const e = (opts && opts.omaha && comm.length >= 3 && cards.length >= 4) ? evaluateOmaha(cards, comm) : evaluateHand(all);
  const base = CARD_RANK_STRENGTH[e.rank] !== undefined ? CARD_RANK_STRENGTH[e.rank] : 0.18;
  const kicker = cardClamp((((e.values && e.values[1]) || 0) - 2) / 12, 0, 1);
  // Top-end hands barely care about kickers; and no kicker may lift a hand past the next class's floor
  // (the original let an ace-high flush, 0.95, outrank a full house, 0.92).
  const next = CARD_RANK_STRENGTH[e.rank + 1];
  const spread = Math.min(e.rank >= 6 ? 0.02 : 0.10, next !== undefined ? (next - base) * 0.9 : 0.02);
  return cardClamp(base + kicker * spread, 0, 1);
}

// --- A roommate's poker style, from who they are (D8) ------------------------------------------

// { strengthBias, bluff, foldPressure, aggression, slowplay, exploit, tilt }. Pure, and stable: the
// same roommate always plays the same way. `npc` is a gameState NPC record.
function pokerStyleFor(npc) {
  const S = POKER_STYLE;
  const st = { ...S.base, tilt: 0 };
  const t = npc?.bible?.temperament || {};
  const as = t.assertiveness || 0;
  st.aggression += S.assertiveness.aggression * as;
  st.bluff += S.assertiveness.bluff * as;
  st.tilt = Math.max(0, (t.volatility || 0)) * S.volatility.tilt + (npc?.bible?.personality?.traits || []).filter(x => x === 'impulsive' || x === 'rebellious').length * 0.1;
  for (const trait of npc?.bible?.personality?.traits || []) {
    const d = S.traits[trait];
    if (!d) continue;
    for (const [k, v] of Object.entries(d)) st[k] = (st[k] || 0) + v;
  }
  for (const k of Object.keys(S.min)) st[k] = cardClamp(st[k], S.min[k], S.max[k]);
  return st;
}

// The style at this moment: heat (0..1, a run of losses) pushes a tilt-prone player harder and makes
// them fold less. Pure.
function pokerTiltedStyle(style, heat) {
  const h = cardClamp(heat || 0, 0, 1) * cardClamp(style.tilt || 0, 0, 1);
  if (!h) return style;
  return { ...style, aggression: cardClamp(style.aggression + POKER_STYLE.tiltAggression * h, 0, 0.98), foldPressure: Math.max(0.5, style.foldPressure * (1 - POKER_STYLE.tiltFold * h)), bluff: style.bluff + 0.05 * h };
}

// --- The decision (multi-way) ------------------------------------------------------------------
// seat:  { hand, chips, bet }                       (what this player holds and has in)
// table: { community, pot, currentBet, ante, live }  (live = opponents still in the hand)
// style: from pokerStyleFor (or pokerTiltedStyle), plus optional `urgency` 0..1 — near the end of a
//        match or on a stakes hand, a player stops folding away pots — and `foldRate` 0..1, how
//        often the people they face fold to aggression (a light read on them).
// Returns { action: 'fold'|'check'|'call'|'raise', raiseTo, bluffing }. Pure given the rng.
function decidePokerAction(seat, table, style, rng, opts) {
  const S = POKER_STYLE;
  const strength = handStrength(seat.hand, table.community || [], opts);
  const toCall = Math.max(0, (table.currentBet || 0) - (seat.bet || 0));
  const potOdds = toCall > 0 ? toCall / ((table.pot || 0) + toCall) : 0;
  const live = Math.max(1, table.live || 1);
  const foldy = style.foldRate || 0;
  let adj = cardClamp(strength + style.strengthBias + foldy * 0.12 * style.exploit - S.multiway * (live - 1), 0, 1);
  const canBet = seat.chips > (table.ante || 10) * 3;
  const urgency = style.urgency || 0;
  const callFloor = urgency * 0.5;
  let action;
  if (adj > 0.72) {
    if (rng() < style.slowplay && toCall === 0) action = 'check';
    else if (rng() < style.aggression && canBet) action = 'raise';
    else action = toCall > 0 ? 'call' : 'check';
  } else if (adj > 0.42) {
    if (toCall === 0) action = rng() < style.aggression * 0.45 ? 'raise' : 'check';
    else if (potOdds < adj) action = 'call';
    else action = rng() < 0.4 + urgency * 0.45 ? 'call' : 'fold';
  } else if (toCall === 0) {
    action = 'check';
  } else {
    const foldThresh = seat.chips * 0.3 * style.foldPressure * (1 + urgency * 1.5);
    if (toCall > foldThresh && adj < callFloor) action = 'fold';
    else action = rng() < 0.25 + urgency * 0.5 ? 'call' : 'fold';
  }
  const bluffing = (action === 'check' || action === 'fold') && rng() < style.bluff && canBet;
  if (bluffing) action = 'raise';
  if (action === 'call' && toCall >= seat.chips) action = 'call';   // an all-in call is still a call
  let raiseTo;
  if (action === 'raise') {
    const potFrac = adj > 0.85 && rng() < 0.35 ? 1.0 : [0.5, 0.66, 0.75, 1.0][Math.floor(rng() * 4)];
    raiseTo = Math.max((table.currentBet || 0) + Math.max(table.ante || 10, 20), Math.round((table.currentBet || 0) + (table.pot || 0) * potFrac));
    if (adj > 0.9 && seat.chips < (table.pot || 0) * 1.5) raiseTo = (seat.bet || 0) + seat.chips;   // a strong hand with a short stack shoves
    raiseTo = Math.min(raiseTo, (seat.bet || 0) + seat.chips);
    if (raiseTo <= (table.currentBet || 0)) { action = toCall > 0 ? 'call' : 'check'; raiseTo = undefined; }
  }
  return { action, raiseTo, bluffing: !!bluffing && action === 'raise', strength: adj };
}

// Which cards to throw away in five-card draw: keep what has equity, draw the rest. Returns the
// indices to KEEP (AcesAndLace's aiDiscardDecision, by equity rather than "keep everything Q or better").
function drawKeepIndices(hand) {
  const counts = {}, suits = {};
  hand.forEach(c => { counts[c.val] = (counts[c.val] || 0) + 1; suits[c.suit] = (suits[c.suit] || 0) + 1; });
  const idx = hand.map((c, i) => i);
  const groups = Object.values(counts).sort((a, b) => b - a);
  if (groups[0] >= 3 || (groups[0] === 2 && groups[1] === 2)) return idx.filter(i => counts[hand[i].val] >= 2);   // trips or better, two pair: stand mostly pat
  const flushSuit = Object.keys(suits).find(s => suits[s] >= 4);
  if (flushSuit) return idx.filter(i => hand[i].suit === flushSuit);                                              // four to a flush
  const vals = [...new Set(hand.map(c => c.val))].sort((a, b) => a - b);
  for (let start = 0; start + 3 < vals.length; start++) {
    if (vals[start + 3] - vals[start] === 3) {                                                                    // four to an open-ended straight
      const run = vals.slice(start, start + 4);
      return idx.filter(i => run.includes(hand[i].val)).slice(0, 4);
    }
  }
  const pairVal = Object.keys(counts).find(v => counts[v] === 2);
  if (pairVal) return idx.filter(i => String(hand[i].val) === pairVal);                                           // one pair: keep it, draw three
  return idx.filter(i => hand[i].val >= 13).slice(0, 2);                                                          // nothing: keep at most two high cards
}

// --- Blackjack ---------------------------------------------------------------------------------

function bjValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (c.rank === '10' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(hand) { return hand.length === 2 && bjValue(hand) === 21; }

// A soft hand counts an ace as 11.
function bjIsSoft(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (c.rank === '10' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') total += 10;
    else total += parseInt(c.rank, 10);
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return soft && aces > 0 && total <= 21;
}

// House rules (D12): the dealer draws to 16 and stands on every 17, soft included.
function bjDealerShouldHit(hand) { return bjValue(hand) < 17; }

// A roommate's play against the dealer's up card: basic strategy, nudged by temperament (the bold hit a
// little later, the careful stand a little sooner). `risk` −1..1. Returns 'hit' or 'stand'.
function bjNpcDecision(hand, dealerUp, risk) {
  const total = bjValue(hand);
  const up = dealerUp.rank === 'A' ? 11 : Math.min(10, dealerUp.val);
  const bold = (risk || 0) > 0.33, careful = (risk || 0) < -0.33;
  if (bjIsSoft(hand)) {
    if (total <= 17) return 'hit';
    if (total === 18) return up >= 9 && !careful ? 'hit' : 'stand';   // a soft 18 against a 9, 10 or ace: the bold and the middling hit
    return 'stand';
  }
  if (total <= 11) return 'hit';
  if (total >= 17) return 'stand';
  // A stiff hand (12–16): stand if the dealer shows weakness. The bold trust that a little less, the careful a little more.
  const weakUpTo = careful ? 7 : bold ? 5 : 6;
  if (total === 12) return up >= 4 && up <= weakUpTo ? 'stand' : 'hit';
  return up <= weakUpTo ? 'stand' : 'hit';
}

// The result of one blackjack hand against another (the roommate dealing is the house, D12):
// 'blackjack' (pays 3:2), 'win', 'push', 'lose'. Pure.
function bjSettle(player, dealer) {
  const pv = bjValue(player), dv = bjValue(dealer);
  const pbj = isBlackjack(player), dbj = isBlackjack(dealer);
  if (pv > 21) return { result: 'lose', mult: -1 };
  if (pbj && !dbj) return { result: 'blackjack', mult: 1.5 };
  if (dbj && !pbj) return { result: 'lose', mult: -1 };
  if (dv > 21) return { result: 'win', mult: 1 };
  if (pv > dv) return { result: 'win', mult: 1 };
  if (pv < dv) return { result: 'lose', mult: -1 };
  return { result: 'push', mult: 0 };
}
// ===== /SECTION: CARDGAMES =====
