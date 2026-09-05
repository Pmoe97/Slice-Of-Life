// ===== SECTION: MONEY =====
// actions-and-activities-overhaul-plan.md Phase 4 (D9) — money becomes one
// bidirectional ledger: player.moneyLedger[npcId] = { playerOwes, npcOwes }.
// playerOwes: the player borrowed from this NPC (ask_loan's debt, formerly
// the one-way player.flags._loanOwed). npcOwes: this NPC borrowed from the
// player (asks.js's $GiveMoney ... loan). A loan is a loan whichever side
// owes it (design invariant 9) — settling one direction never touches the
// other, and an NPC with no debts either way carries no entry at all (an
// empty { playerOwes: 0, npcOwes: 0 } is not a meaningful state).
//
// Migration: the legacy player.flags._loanOwed[npcId] (asks-and-attachments-
// plan Phase 6) is folded into playerOwes the first time this npc's ledger
// entry is WRITTEN (adjustMoneyLedger) — never on a read, since decide()/
// available() must stay pure (design invariant 1; a menu render must never
// mutate state). Until that first write, moneyOwedByPlayer's pure read
// falls back to the legacy flag directly, so an old debt is still visible
// and repayable before anything migrates it. No versioned-folder migration
// (state.js's MIGRATIONS) is needed for a bare lazily-defaulted field —
// player.sneaking (Phase 1B) and _loanOwed itself both already set that
// precedent.
//
// Loads after items.js/effects.js (money.js itself needs nothing from
// them — no load-time reads, all calls are runtime-only) and before asks.js,
// whose ask_loan/ask_repay/$GiveMoney/$CollectMoney leaves are the only
// callers.

// PURE — how much the PLAYER owes this npc. Reads the new ledger first;
// falls back to the not-yet-migrated legacy flag so an old save's debt
// reads correctly before its first write-side touch.
function moneyOwedByPlayer(gs, npcId) {
  const entry = gs && gs.player && gs.player.moneyLedger && gs.player.moneyLedger[npcId];
  if (entry) return entry.playerOwes || 0;
  return (gs && gs.player && gs.player.flags && gs.player.flags._loanOwed && gs.player.flags._loanOwed[npcId]) || 0;
}

// PURE — how much this npc owes the PLAYER. No legacy source (npcOwes is
// new in this phase — there was never a one-way flag for it).
function moneyOwedToPlayer(gs, npcId) {
  const entry = gs && gs.player && gs.player.moneyLedger && gs.player.moneyLedger[npcId];
  return (entry && entry.npcOwes) || 0;
}

// MUTATES — call only from postEffects / apply-time code, never from
// decide()/available(). Folds any legacy _loanOwed[npcId] into the ledger
// on first touch (and removes the legacy entry once folded), then applies
// delta to the given side (side is 'playerOwes' or 'npcOwes'), clamped at
// 0, pruning the whole per-npc entry once both sides are settled.
function adjustMoneyLedger(gs, npcId, side, delta) {
  const flags = gs.player.flags || (gs.player.flags = {});
  const legacy = flags._loanOwed && flags._loanOwed[npcId];
  const ledger = gs.player.moneyLedger || (gs.player.moneyLedger = {});
  const entry = ledger[npcId] || (ledger[npcId] = { playerOwes: legacy || 0, npcOwes: 0 });
  if (legacy) {
    const next = { ...flags._loanOwed };
    delete next[npcId];
    if (Object.keys(next).length) flags._loanOwed = next;
    else delete flags._loanOwed;
  }
  entry[side] = Math.max(0, (entry[side] || 0) + delta);
  if (entry.playerOwes <= 0 && entry.npcOwes <= 0) delete ledger[npcId];
}
// ===== /SECTION: MONEY =====
