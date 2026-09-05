// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 4: Money & Item controls (D8-D9).
//
//   node src/src/dev/verify/verify-aa-p4.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// bidirectional money ledger (money.js — pure reads, the mutating
// adjustMoneyLedger, the legacy _loanOwed migration-on-write), ask_loan/
// ask_repay now mapping onto it instead of the old one-way flag, the two new
// money leaves ($GiveMoney/$CollectMoney) that close the loop in both
// directions, and the two new item leaves ($BorrowItem/$ReturnItem) —
// including the ownerId-follows-the-lender / meta.borrowed stamping that
// deliberately bypasses the generic MOVE_ITEM DSL line (see asks.js's
// ASK_BORROW header comment for why) and section 8's proof that a borrowed
// unit can never merge with the player's own already-owned stack of the same
// def. Section 11 confirms steal (doTakeFromRoom, ui.js — not Node-loadable)
// still stamps evidence/suspicion correctly by reconstructing its own DSL
// lines and running them through the real effect pipeline — this phase's
// Files line named it but, per the plan's own Goal text, needed zero new
// code. Presentation (the borrow/return pickers, the doTalk overdue-item
// beat) is UI and is verified on the live page per invariant 7 — see the
// Handoff note for what was checked there.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'items.js', 'inventory.js', 'money.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.player.money = 200;
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // Extreme, unclamped-by-construction relationship so the loan/borrow score
  // lands reliably on one side of acceptThreshold regardless of the seeded
  // noise (ASK_TUNING.acceptNoiseRange is 0.3 — a ±5 spread overwhelms it).
  __warm = (npc) => { npc.relPlayer = { ...npc.relPlayer, affection: 5, trust: 5, tension: 0 }; return npc; };
  __cold = (npc) => { npc.relPlayer = { ...npc.relPlayer, affection: -5, trust: -5, tension: 5 }; return npc; };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the new leaves, the ledger module, and the tuning all exist');
const reg = J(`({
  hasOwed: typeof moneyOwedByPlayer === 'function',
  hasOwedTo: typeof moneyOwedToPlayer === 'function',
  hasAdjust: typeof adjustMoneyLedger === 'function',
  giveMoney: !!ASK_TYPES.GiveMoney,
  collectMoney: !!ASK_TYPES.CollectMoney,
  borrowItem: !!ASK_TYPES.BorrowItem,
  returnItem: !!ASK_TYPES.ReturnItem,
  tuning: { giveMoney: ASK_TUNING.giveMoney, borrow: ASK_TUNING.borrow },
})`);
check('money.js\'s pure reads + mutating adjust all exist', reg.hasOwed && reg.hasOwedTo && reg.hasAdjust);
check('all four new ask leaves are registered', reg.giveMoney && reg.collectMoney && reg.borrowItem && reg.returnItem);
check('ASK_TUNING gained real config buckets, not inline magic numbers', typeof reg.tuning.giveMoney.giftRelDelta === 'number' && typeof reg.tuning.borrow.dueDays === 'number');

// ---------------------------------------------------------------- 1
console.log('\n1. The ledger itself — independent directions, clamped, pruned when settled');
const ledger = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  const npcId = ids[0];
  const zero = { playerOwes: moneyOwedByPlayer(g, npcId), npcOwes: moneyOwedToPlayer(g, npcId) };
  adjustMoneyLedger(g, npcId, 'playerOwes', 40);
  const afterPlayerOwes = { playerOwes: moneyOwedByPlayer(g, npcId), npcOwes: moneyOwedToPlayer(g, npcId) };
  adjustMoneyLedger(g, npcId, 'npcOwes', 25);
  const afterBoth = { playerOwes: moneyOwedByPlayer(g, npcId), npcOwes: moneyOwedToPlayer(g, npcId) };
  adjustMoneyLedger(g, npcId, 'playerOwes', -100); // overpay — clamps at 0, never negative
  const clamped = moneyOwedByPlayer(g, npcId);
  const entryStillThere = !!g.player.moneyLedger[npcId]; // npcOwes side still owed
  adjustMoneyLedger(g, npcId, 'npcOwes', -25);
  const pruned = !g.player.moneyLedger[npcId]; // both sides zero — entry deleted
  return { zero, afterPlayerOwes, afterBoth, clamped, entryStillThere, pruned };
})()`);
check('a fresh npc owes nothing either direction', ledger.zero.playerOwes === 0 && ledger.zero.npcOwes === 0);
check('playerOwes moves independently of npcOwes', ledger.afterPlayerOwes.playerOwes === 40 && ledger.afterPlayerOwes.npcOwes === 0);
check('npcOwes moves independently — settling one side never touches the other', ledger.afterBoth.playerOwes === 40 && ledger.afterBoth.npcOwes === 25);
check('an overpay clamps at 0, never goes negative', ledger.clamped === 0);
check('the per-npc entry survives while one side is still owed', ledger.entryStillThere === true);
check('once BOTH sides settle, the entry is pruned entirely (not a meaningful {0,0} state)', ledger.pruned === true);

// ---------------------------------------------------------------- 2
console.log('\n2. Legacy migration — an old _loanOwed debt reads correctly before any write, and folds in on the first one');
const migrate = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  const npcId = ids[0];
  g.player.flags = { _loanOwed: { [npcId]: 40 } };
  const beforeReadJSON = JSON.stringify(g.player.flags._loanOwed);
  const pureRead = moneyOwedByPlayer(g, npcId);
  const afterReadJSON = JSON.stringify(g.player.flags._loanOwed);
  adjustMoneyLedger(g, npcId, 'playerOwes', 0); // a no-op delta — still a "touch"
  return {
    pureRead,
    readWasPure: beforeReadJSON === afterReadJSON,
    ledgerAfter: g.player.moneyLedger[npcId].playerOwes,
    legacyGoneAfterWrite: g.player.flags._loanOwed === undefined,
  };
})()`);
check('the pure read sees the legacy debt before any migration write', migrate.pureRead === 40);
check('the pure read never mutates state (decide()/available() must stay pure)', migrate.readWasPure === true);
check('the legacy debt folded into the new ledger on the first write', migrate.ledgerAfter === 40);
check('the legacy flag is gone once migrated — no lingering duplicate source of truth', migrate.legacyGoneAfterWrite === true);

// ---------------------------------------------------------------- 3
console.log('\n3. ask_loan/ask_repay now map onto the ledger, not the old flag');
const loanRepay = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  // $15 stays under ASK_TUNING.loan.maxByPhase.early (20) — relPlayer has no
  // conversationPhase here, so the request leaf's own phase cap would
  // otherwise silently shrink a larger ask; this test is about the ledger
  // wiring, not the cap.
  const loanTurn = resolveAsk(g, npcId, 'RequestLoan', '$15', {});
  loanTurn.applyEffects();
  const afterLoan = { owed: moneyOwedByPlayer(g, npcId), noLegacyFlag: !(g.player.flags && g.player.flags._loanOwed) };
  const repayTurn = resolveAsk(g, npcId, 'RequestRepay', '', {});
  repayTurn.applyEffects();
  const afterRepay = { owed: moneyOwedByPlayer(g, npcId), entryGone: !g.player.moneyLedger[npcId] };
  return { loanAccepted: loanTurn.decision.accept, afterLoan, afterRepay };
})()`);
check('a warm npc accepts the loan', loanRepay.loanAccepted === true);
check('the debt lands on the new ledger for real money', loanRepay.afterLoan.owed === 15);
check('a fresh loan never touches the legacy flag at all', loanRepay.afterLoan.noLegacyFlag === true);
check('repaying the whole debt clears it', loanRepay.afterRepay.owed === 0 && loanRepay.afterRepay.entryGone === true);

// ---------------------------------------------------------------- 4
console.log('\n4. $GiveMoney — gift vs loan mode, decided by flavor, never the accept (D1)');
const give = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const giftTargetId = ids[0], loanTargetId = ids[1];
  const moneyBefore = g.player.money;
  const giftTurn = resolveAsk(g, giftTargetId, 'GiveMoney', '$20', {});
  giftTurn.applyEffects();
  const afterGift = { money: g.player.money, npcOwes: moneyOwedToPlayer(g, giftTargetId), rel: g.npcs[giftTargetId].relPlayer.affection };
  const loanTurn = resolveAsk(g, loanTargetId, 'GiveMoney', '$30 loan', {});
  loanTurn.applyEffects();
  const afterLoan = { money: g.player.money, npcOwes: moneyOwedToPlayer(g, loanTargetId) };
  return { moneyBefore, giftAccepted: giftTurn.decision.accept, afterGift, afterLoan };
})()`);
check('$GiveMoney is always accepted — the verdict IS the transaction', give.giftAccepted === true);
check('a gift spends real money and leaves NO ledger entry', give.afterGift.money === give.moneyBefore - 20 && give.afterGift.npcOwes === 0);
check('a gift moves affection', give.afterGift.rel > 0);
check('"...loan" in the flavor books it as npcOwes instead, on top of the gift\'s spend', give.afterLoan.money === give.moneyBefore - 20 - 30 && give.afterLoan.npcOwes === 30);

// ---------------------------------------------------------------- 5
console.log('\n5. $GiveMoney caps at money on hand, never overdrafts (asks are trusted producers — no validateEffects gate)');
const poor = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  g.player.money = 15;
  const npcId = ids[0];
  const turn = resolveAsk(g, npcId, 'GiveMoney', '$200', {});
  turn.applyEffects();
  return { moneyAfter: g.player.money };
})()`);
check('a $200 ask against $15 on hand only ever spends the $15 — never goes negative', poor.moneyAfter === 0);

// ---------------------------------------------------------------- 6
console.log('\n6. $CollectMoney — the npcOwes mirror of ask_repay, closing the loop\'s other direction');
const collect = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const npcId = ids[0];
  const beforeAvailable = ASK_TYPES.CollectMoney.available(g, g.npcs[npcId], {});
  adjustMoneyLedger(g, npcId, 'npcOwes', 60);
  const afterOwedAvailable = ASK_TYPES.CollectMoney.available(g, g.npcs[npcId], {});
  const moneyBefore = g.player.money;
  const turn = resolveAsk(g, npcId, 'CollectMoney', '$20', {});
  turn.applyEffects();
  const partial = { money: g.player.money, owed: moneyOwedToPlayer(g, npcId) };
  const rest = resolveAsk(g, npcId, 'CollectMoney', '', {});
  rest.applyEffects();
  const settled = { owed: moneyOwedToPlayer(g, npcId), entryGone: !g.player.moneyLedger[npcId] };
  return { beforeAvailable, afterOwedAvailable, moneyBefore, partial, settled };
})()`);
check('unavailable when nothing is owed', collect.beforeAvailable === false);
check('available once the npc owes money', collect.afterOwedAvailable === true);
check('a partial collection earns real money and reduces what\'s owed', collect.partial.money === collect.moneyBefore + 20 && collect.partial.owed === 40);
check('a bare ask collects the rest and clears the ledger entry', collect.settled.owed === 0 && collect.settled.entryGone === true);

// ---------------------------------------------------------------- 7
console.log('\n7. $BorrowItem — real accept/decline (mirrors ask_loan), ownership stays with the lender');
const borrow = J(`(() => {
  const g = __mk(7);
  const ids = __ids(g);
  const warmId = ids[0], coldId = ids[1];
  g.npcs[warmId].inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: warmId, meta: {} }];
  g.npcs[coldId].inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: coldId, meta: {} }];
  __warm(g.npcs[warmId]);
  __cold(g.npcs[coldId]);
  const warmTurn = resolveAsk(g, warmId, 'BorrowItem', '', {}, { borrowDefId: 'hobby_sketchpad' });
  const coldTurn = resolveAsk(g, coldId, 'BorrowItem', '', {}, { borrowDefId: 'hobby_sketchpad' });
  warmTurn.applyEffects();
  coldTurn.applyEffects();
  const moved = g.player.inventory.find(s => s.defId === 'hobby_sketchpad' && s.meta && s.meta.borrowed);
  return {
    warmAccepted: warmTurn.decision.accept,
    coldAccepted: coldTurn.decision.accept,
    coldStillHasIt: (g.npcs[coldId].inventory || []).some(s => s.defId === 'hobby_sketchpad' && (s.qty || 0) > 0),
    warmNoLongerHasIt: !(g.npcs[warmId].inventory || []).some(s => s.defId === 'hobby_sketchpad' && (s.qty || 0) > 0),
    movedOwnerIsLender: !!moved && moved.ownerId === warmId,
    dueDay: moved && moved.meta.borrowed.dueDay,
    expectedDueDay: g.meta.clock.day + ASK_TUNING.borrow.dueDays,
  };
})()`);
check('a warm npc lends it', borrow.warmAccepted === true);
check('a cold npc refuses — borrowing is a real trust question, not an always-accept gift', borrow.coldAccepted === false);
check('refusing leaves their own copy untouched', borrow.coldStillHasIt === true);
check('accepting actually moves the item out of their inventory', borrow.warmNoLongerHasIt === true);
check('the item lands in the player\'s bag, owned by the LENDER not the player (D8: possession != ownership while borrowed)', borrow.movedOwnerIsLender === true);
check('meta.borrowed.dueDay is stamped exactly askDay()+borrow.dueDays', borrow.dueDay === borrow.expectedDueDay);

// ---------------------------------------------------------------- 8
console.log('\n8. Borrow merge-safety — a borrowed unit never fuses with the player\'s own already-owned stack');
const mergeSafe = J(`(() => {
  const g = __mk(8);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  // A stackable item on purpose (energy_drink) — this is the exact merge-key
  // collision case the file header warns about (applyMoveItem/addStack would
  // otherwise fuse the incoming unit into the player's own pre-existing
  // stack of the same def).
  g.player.inventory = [{ defId: 'energy_drink', qty: 2, ownerId: 'player', meta: {} }];
  g.npcs[npcId].inventory = [{ defId: 'energy_drink', qty: 1, ownerId: npcId, meta: {} }];
  const turn = resolveAsk(g, npcId, 'BorrowItem', '', {}, { borrowDefId: 'energy_drink' });
  turn.applyEffects();
  const ownStack = g.player.inventory.find(s => s.defId === 'energy_drink' && s.ownerId === 'player');
  const borrowedStack = g.player.inventory.find(s => s.defId === 'energy_drink' && s.meta && s.meta.borrowed);
  return { ownQtyUnchanged: ownStack && ownStack.qty === 2, borrowedIsSeparate: !!borrowedStack && borrowedStack.qty === 1 };
})()`);
check('the player\'s own 2 copies stay exactly 2 — no bleed from the merge key', mergeSafe.ownQtyUnchanged === true);
check('the borrowed unit lives in its own separate, tagged stack', mergeSafe.borrowedIsSeparate === true);

// ---------------------------------------------------------------- 9
console.log('\n9. $ReturnItem — always accepted, clears the marker, restores ownership, moves trust');
const giveBack = J(`(() => {
  const g = __mk(9);
  const ids = __ids(g);
  const npcId = ids[0];
  const day = g.meta.clock.day;
  g.player.inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: npcId, meta: { borrowed: { from: npcId, dueDay: day + 3 } } }];
  g.npcs[npcId].inventory = []; // no pre-existing stack to accidentally merge into
  const beforeAvailable = ASK_TYPES.ReturnItem.available(g, g.npcs[npcId], {});
  const beforeTrust = g.npcs[npcId].relPlayer.trust || 0;
  const turn = resolveAsk(g, npcId, 'ReturnItem', '', {}, { returnDefId: 'hobby_sketchpad' });
  turn.applyEffects();
  const npcStack = (g.npcs[npcId].inventory || []).find(s => s.defId === 'hobby_sketchpad');
  return {
    beforeAvailable,
    accepted: turn.decision.accept,
    playerNoLongerHasIt: !g.player.inventory.some(s => s.defId === 'hobby_sketchpad'),
    npcHasItBack: !!npcStack && npcStack.qty === 1,
    markerCleared: !(npcStack && npcStack.meta && npcStack.meta.borrowed),
    trustRose: g.npcs[npcId].relPlayer.trust > beforeTrust,
  };
})()`);
check('available while something is actually borrowed from them', giveBack.beforeAvailable === true);
check("always accepted — no 'no' to a returned item, same shape as ask_repay", giveBack.accepted === true);
check('the item leaves the player\'s bag', giveBack.playerNoLongerHasIt === true);
check('and lands back with the lender', giveBack.npcHasItBack === true);
check('the borrowed marker is cleared, not carried forward as stale state', giveBack.markerCleared === true);
check('trust rises on a real return', giveBack.trustRose === true);

// ---------------------------------------------------------------- 10
console.log('\n10. Overdue detection (firstOverdueBorrowedStack) — pure, day-gated, scoped to the right lender');
const overdue = J(`(() => {
  const g = __mk(10);
  const ids = __ids(g);
  const lenderId = ids[0], otherId = ids[1];
  const day = g.meta.clock.day;
  g.player.inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: lenderId, meta: { borrowed: { from: lenderId, dueDay: day + 2 } } }];
  const notYetDue = firstOverdueBorrowedStack(g, lenderId);
  g.meta.clock.day = day + 2; // due today counts as overdue
  const dueToday = firstOverdueBorrowedStack(g, lenderId);
  const wrongLender = firstOverdueBorrowedStack(g, otherId);
  return { notYetDue, dueTodayDefId: dueToday && dueToday.defId, wrongLender };
})()`);
check('nothing overdue before the due day', overdue.notYetDue === null);
check('due-today counts as overdue (dueDay <= day)', overdue.dueTodayDefId === 'hobby_sketchpad');
check('scoped to the actual lender — a different npc sees nothing owed to them', overdue.wrongLender === null);

// ---------------------------------------------------------------- 11
console.log('\n11. Steal (regression) — the existing doTakeFromRoom DSL still stamps evidence/suspicion correctly');
const steal = J(`(() => {
  const g = __mk(11);
  const ids = __ids(g);
  const ownerId = ids[0];
  g.npcs[ownerId].inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId, meta: {} }];
  g.npcs[ownerId].suspicion = { boundary_violation: 0 };
  // Mirrors doTakeFromRoom's own DSL construction (ui.js) exactly — the
  // unwitnessed branch (owner not present).
  const ctx = buildEffectContext(g, [], [], {}, g.player.inventory || []);
  const lines = [
    \`MOVE_ITEM hobby_sketchpad 1 \${ownerId} player\`,
    \`ADJUST_SUSPICION \${ownerId} boundary_violation +\${STEALTH_TUNING.possessionTakeSuspicionDelta}\`,
  ];
  applyEffects(parseEffectDSL(lines.join('\\n')), ctx);
  return {
    playerHasIt: (g.player.inventory || []).some(s => s.defId === 'hobby_sketchpad' && s.ownerId === 'player'),
    ownerLostIt: !(g.npcs[ownerId].inventory || []).some(s => s.defId === 'hobby_sketchpad' && (s.qty || 0) > 0),
    suspicionRaised: g.npcs[ownerId].suspicion.boundary_violation === STEALTH_TUNING.possessionTakeSuspicionDelta,
  };
})()`);
check('a stolen item transfers real ownership to the player (permanent, like a gift — D8)', steal.playerHasIt === true);
check('the owner actually loses it', steal.ownerLostIt === true);
check('an unwitnessed take still raises boundary-violation suspicion by the documented delta', steal.suspicionRaised === true);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
