// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 5: Reverse overtures & NPC-initiated asks (D10, D31).
//
//   node src/src/dev/verify/verify-aa-p5.js
//
// D10's real gap, once the pre-existing npc-initiative-plan machinery (four
// overture channels, propose_player/collab_ask already booking commitments
// NPC-initiated) turned out to already cover "invitation" — was the REQUEST
// half: nothing let an NPC ask the player for money or an item. This adds two
// new OVERTURE_DEFS rows riding the propose channel (overture.js's
// requestTerms, `proposal`'s new sibling field `request`) and money.js's
// existing bidirectional ledger does the rest. D31 fixes the one real defect
// in the pre-existing (Intimacy & Voyeurism Phase 17) sneak_into_bed drive:
// its "caught" branch used to resolve a fixed hostile outcome the instant it
// woke the player, with NO player input at all — exactly the roll-decides-
// feelings shape D31 forbids. The roll still decides only whether the player
// wakes; boundary.js's resolveSleepAdvanceChoice now applies whichever of
// three outcomes the player actually chose.
//
// Node coverage for everything pure/trusted-producer: requestTerms,
// scoreOvertures/openOverture carrying `request` alongside `proposal`,
// trySneakIntoBed's new pending-stamp (no longer resolving consequences
// inline), and resolveSleepAdvanceChoice's three real outcomes. The accept-
// time transaction (ui.js's doOvertureRespond `def.requests` branch) and the
// deferred sleep-advance gate (ui.js, presentWorldGate) are UI and are
// verified on the live page per invariant 7 — see the Handoff note for what
// was checked there.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'overture.js', 'boundary.js', 'money.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
    }
    h.player.location = 'living_room';
    h.player.money = 200;
    return h;
  }
  function residentsOf(h) { return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident'); }
  function warmTowardPlayer(npc) {
    npc.relPlayer = { trust: 0.5, affection: 0.5, tension: 0.1, respect: 0.4, comfort: 0.7, desire: 0.9, conversationPhase: 'intimate' };
    return npc;
  }
  function coldTowardPlayer(npc) {
    npc.relPlayer = { trust: -0.2, affection: 0.0, tension: 0.3, respect: 0.1, comfort: 0.1, desire: 0.0, conversationPhase: 'stranger' };
    return npc;
  }
  function ctxFor(h, npcId) {
    const npc = h.npcs[npcId];
    return { location: npc.location, block: 'leisure', isVisitor: false, npcId, nowAbs: clockToAbsolute(h.meta.clock) };
  }
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the two new overture rows and the new functions all exist');
const reg = J(`({
  hasMoney: !!OVERTURE_DEFS.request_money_player,
  hasBorrow: !!OVERTURE_DEFS.request_borrow_player,
  moneyRequests: OVERTURE_DEFS.request_money_player.requests,
  borrowRequests: OVERTURE_DEFS.request_borrow_player.requests,
  moneyHasNoProposes: !OVERTURE_DEFS.request_money_player.proposes,
  hasRequestTerms: typeof requestTerms === 'function',
  hasPendingFn: typeof hasPendingSleepAdvance === 'function',
  hasResolveFn: typeof resolveSleepAdvanceChoice === 'function',
})`);
check('request_money_player and request_borrow_player are both registered', reg.hasMoney && reg.hasBorrow);
check('each names its request kind via `requests` (proposal\'s sibling field, never a second proposes)',
  reg.moneyRequests.kind === 'money' && reg.borrowRequests.kind === 'borrow_item' && reg.moneyHasNoProposes);
check('requestTerms/hasPendingSleepAdvance/resolveSleepAdvanceChoice all exist', reg.hasRequestTerms && reg.hasPendingFn && reg.hasResolveFn);

// ---------------------------------------------------------------- 1
console.log('\n1. requestTerms — money is unconditional (D10: no gate on what the player can grant); borrow needs a real candidate');
const terms = J(`(() => {
  const h = house(50, 1);
  const money = requestTerms(null, OVERTURE_DEFS.request_money_player, h);
  h.player.inventory = [];
  const borrowEmpty = requestTerms(null, OVERTURE_DEFS.request_borrow_player, h);
  h.player.inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: 'player', meta: {} }];
  const borrowSome = requestTerms(null, OVERTURE_DEFS.request_borrow_player, h);
  h.player.inventory = [{ defId: 'house_keys', qty: 1, ownerId: 'player', meta: { keyItem: true } }];
  const borrowOnlyKeyItem = requestTerms(null, OVERTURE_DEFS.request_borrow_player, h);
  return { money, borrowEmpty, borrowSome, borrowOnlyKeyItem };
})()`);
check('a money request always names an amount — ASK_TUNING.loan\'s own default, no floor against player.money',
  terms.money.kind === 'money' && terms.money.amount === J(`ASK_TUNING.loan.defaultAmount`));
check('nothing borrowable in the player\'s bag → no candidacy at all (null, not a request for nothing)', terms.borrowEmpty === null);
check('something borrowable → names that real item', terms.borrowSome.kind === 'borrow_item' && terms.borrowSome.defId === 'hobby_sketchpad');
check('a key item alone still names nothing (borrowableStacks excludes key items, reused unchanged)', terms.borrowOnlyKeyItem === null);

// ---------------------------------------------------------------- 2
console.log('\n2. scoreOvertures end-to-end — the affection floor gates both new rows exactly like propose_player');
const scored = J(`(() => {
  const h = house(51, 2);
  const [r1, r2] = residentsOf(h);
  h.npcs[r1].location = h.player.location; warmTowardPlayer(h.npcs[r1]);
  h.npcs[r2].location = h.player.location; coldTowardPlayer(h.npcs[r2]);
  h.player.inventory = [{ defId: 'hobby_sketchpad', qty: 1, ownerId: 'player', meta: {} }];
  const warmScored = scoreOvertures(h.npcs[r1], r1, h, ctxFor(h, r1));
  const coldScored = scoreOvertures(h.npcs[r2], r2, h, ctxFor(h, r2));
  return {
    warmHasMoney: !!warmScored.request_money_player,
    warmMoneyRequest: warmScored.request_money_player && warmScored.request_money_player.request,
    warmHasBorrow: !!warmScored.request_borrow_player,
    warmBorrowRequest: warmScored.request_borrow_player && warmScored.request_borrow_player.request,
    coldHasEither: !!coldScored.request_money_player || !!coldScored.request_borrow_player,
  };
})()`);
check('a warm, adjacent, cooldown-clear npc is scored as a candidate for BOTH new rows', scored.warmHasMoney && scored.warmHasBorrow);
check('the record carries a real `request` term, not just candidacy', scored.warmMoneyRequest.kind === 'money' && scored.warmBorrowRequest.kind === 'borrow_item');
check('below the affection floor (REL_CONSEQUENCES.affectionGiftThreshold), neither row is a candidate — same bar propose_player already reads', !scored.coldHasEither);

// ---------------------------------------------------------------- 3
console.log('\n3. openOverture — carries `request` onto the live record; refuses outright with no terms (mirrors proposeTerms\'s own refusal)');
const opened = J(`(() => {
  const h = house(52, 1);
  const [r1] = residentsOf(h);
  const withTerms = openOverture(h, r1, {
    overtureId: 'request_money_player', motive: 'affection', motiveRef: {}, tone: 'warm',
    request: { kind: 'money', amount: 40 },
  });
  delete h.npcs[r1].overture;
  const withoutTerms = openOverture(h, r1, { overtureId: 'request_money_player', motive: 'affection', motiveRef: {}, tone: 'warm' });
  return { withTermsRequest: withTerms && withTerms.request, withoutTerms };
})()`);
check('a real request term rides the opened record verbatim', opened.withTermsRequest && opened.withTermsRequest.kind === 'money' && opened.withTermsRequest.amount === 40);
check('a `requests` def with no term at all opens nothing — no record a player could never answer', opened.withoutTerms === null);

// ---------------------------------------------------------------- 4
console.log('\n4. D31 — trySneakIntoBed\'s caught branch: a pending record, not a resolved outcome (regression: silent success is untouched)');
const sneak = J(`(() => {
  const sneakState = (seed, cons) => {
    const h = house(seed, 2);
    const [r1] = residentsOf(h);
    h.player.flags = { ...(h.player.flags || {}), _vulnerableState: 'sleeping' };
    h.npcs[r1].bible.temperament.openness = 0.9; h.npcs[r1].bible.temperament.assertiveness = 0.9;
    h.npcs[r1].bible.temperament.conscientiousness = cons;
    h.npcs[r1].needs = { ...(h.npcs[r1].needs || {}), desire: 80 }; h.npcs[r1].location = 'hallway_a';
    return h;
  };
  let silent = null, caught = null;
  for (let s = 9000; s < 9600 && (!silent || !caught); s++) {
    const h = sneakState(s, 0.2);
    const [r1] = residentsOf(h);
    const res = trySneakIntoBed(h.npcs[r1], r1, { location: 'hallway_a' }, h);
    if (!res) continue;
    if (!silent && !res.caught) silent = { s, h };
    if (!caught && res.caught) caught = { s, h };
  }
  const hs = silent.h; const [rs] = residentsOf(hs);
  const resS = trySneakIntoBed(hs.npcs[rs], rs, { location: 'hallway_a' }, hs);
  const silentOk = resS.caught === false && resS.activityOverride === 'lying beside you' && resS.event === null
    && !hasPendingSleepAdvance(hs.npcs[rs]);

  const hc = caught.h; const [rc] = residentsOf(hc);
  const beforeC = JSON.stringify(hc.npcs[rc].relPlayer);
  const beforeSuspicion = hc.npcs[rc].suspicion && hc.npcs[rc].suspicion.boundary_violation || 0;
  const resC = trySneakIntoBed(hc.npcs[rc], rc, { location: 'hallway_a' }, hc);
  const afterC = JSON.stringify(hc.npcs[rc].relPlayer);
  const afterSuspicion = hc.npcs[rc].suspicion && hc.npcs[rc].suspicion.boundary_violation || 0;
  const caughtOk = resC.caught === true && resC.event === null
    && beforeC === afterC // NO relPlayer deltas fire yet — that used to happen right here
    && beforeSuspicion === afterSuspicion // NO suspicion bump yet either
    && hasPendingSleepAdvance(hc.npcs[rc]) === true; // the pending record IS the outcome of this call now
  return { silentOk, caughtOk };
})()`);
check('silent success is unchanged by this phase (regression)', sneak.silentOk === true);
check('caught now stamps a pending record and applies NOTHING immediately — no roll decides the player\'s feelings (D31)', sneak.caughtOk === true);

// ---------------------------------------------------------------- 5
console.log('\n5. D31 — resolveSleepAdvanceChoice: three real outcomes, and nothing to resolve returns null');
const choices = J(`(() => {
  const pendingFixture = (seed) => {
    const h = house(seed, 1);
    const [r1] = residentsOf(h);
    h.player.location = 'hallway_a';
    h.npcs[r1].location = 'hallway_a';
    // comfort starts above 0 deliberately — it clamps at a [0,1] floor
    // (npc.js's applyRelDelta), so declineRelDeltas' -0.03 would be
    // unobservable starting from 0.
    h.npcs[r1].relPlayer = { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0.5, desire: 0, conversationPhase: 'stranger' };
    h.npcs[r1].flags = { ...(h.npcs[r1].flags || {}), _sleepAdvance: { status: 'pending', openedDay: h.meta.clock.day, openedTick: 0 } };
    return { h, r1 };
  };
  const objectsFixture = (h, roomId) => { h.objects = { ['room_' + roomId]: { bed1: { defId: 'bed', state: { made: 'made' } } } }; };

  const { h: hI, r1: rI } = pendingFixture(60);
  objectsFixture(hI, 'hallway_a');
  const resI = resolveSleepAdvanceChoice(hI, rI, 'into_it');
  const bed = Object.values(hI.objects['room_hallway_a']).find(o => o.defId === 'bed');

  const { h: hD, r1: rD } = pendingFixture(61);
  const beforeD = JSON.stringify(hD.npcs[rD].relPlayer);
  const resD = resolveSleepAdvanceChoice(hD, rD, 'decline');

  const { h: hA, r1: rA } = pendingFixture(62);
  const resA = resolveSleepAdvanceChoice(hA, rA, 'angry');

  const hN = house(63, 1);
  const rN = residentsOf(hN)[0]; // no _sleepAdvance stamped at all
  const noPending = resolveSleepAdvanceChoice(hN, rN, 'angry');

  return {
    intoIt: {
      outcome: resI.outcome, pendingCleared: !hasPendingSleepAdvance(hI.npcs[rI]),
      relRose: hI.npcs[rI].relPlayer.affection > 0,
      clothing: hI.npcs[rI].clothing, activity: hI.npcs[rI].activity,
      bedUnmade: bed && bed.state.made === 'unmade',
    },
    decline: {
      outcome: resD.outcome, pendingCleared: !hasPendingSleepAdvance(hD.npcs[rD]),
      tensionRose: hD.npcs[rD].relPlayer.tension > JSON.parse(beforeD).tension,
      comfortFell: hD.npcs[rD].relPlayer.comfort < JSON.parse(beforeD).comfort,
    },
    angry: {
      outcome: resA.outcome, pendingCleared: !hasPendingSleepAdvance(hA.npcs[rA]),
      tensionDelta: +(hA.npcs[rA].relPlayer.tension - 0).toFixed(3),
      expectedTensionDelta: BOUNDARY.npcSneak.caughtRelDeltas.tension,
      suspicion: hA.npcs[rA].suspicion && hA.npcs[rA].suspicion.boundary_violation,
      expectedSuspicion: BOUNDARY.npcSneak.caughtSuspicion,
    },
    noPending,
  };
})()`);
check('into_it: a completed act — clothing/activity flip, the bed unmakes, relPlayer warms, the pending flag clears',
  choices.intoIt.outcome === 'into_it' && choices.intoIt.pendingCleared && choices.intoIt.relRose
    && choices.intoIt.clothing === 'undressed' && choices.intoIt.activity === 'intimacy' && choices.intoIt.bedUnmade === true);
check('decline: a real no, gently taken — a small tension/comfort cost, the pending flag clears, no completed act',
  choices.decline.outcome === 'decline' && choices.decline.pendingCleared && choices.decline.tensionRose && choices.decline.comfortFell);
check('angry: exactly what \'caught\' used to fire unconditionally, now gated behind the player\'s own choice',
  choices.angry.outcome === 'angry' && choices.angry.pendingCleared
    && choices.angry.tensionDelta === choices.angry.expectedTensionDelta
    && choices.angry.suspicion === choices.angry.expectedSuspicion);
check('nothing pending → null, never a silent no-op mistaken for success', choices.noPending === null);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
