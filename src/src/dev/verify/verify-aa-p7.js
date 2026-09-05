// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 7: Apology + Ask for Space / Boundaries (D12-D13).
//
//   node src/src/dev/verify/verify-aa-p7.js
//
// Node coverage for everything pure/trusted-producer in this phase.
//
// D12 (apology): the belief-gate (getUnresolvedGrievances, npc.js) rejecting
// an apology for nothing; the sincere+timely accept (trust up, tension down,
// the grievance resolves); the two ways an apology reads insincere (too
// late, or a repeat try on a still-unresolved grievance) and deepens tension
// instead; and the REAL transgression wiring this phase adds — stealth.js's
// three "caught" branches (resolveRoomEntryStealth's direct witness,
// resolvePeep's detected catch, resolvePickpocket's caught take) now write a
// real addGrievance the apology leaf can later target end to end.
//
// D13 (boundary flags): ASK_BOUNDARY setting a real npc.flags._boundaryRules
// instance; flags.js's checkBoundaryRules (the self-directed sibling of
// Phase 3's checkHouseRules — same matcher/formulas, D39, but the "witness"
// is the bound NPC's own conscience, not someone else in the room); and the
// real sim.js wiring (resolveBatch's drive-driven room-entry hook) proven by
// swapping in a controlled resolveTick for one batch tick — the same "prove
// the REAL funnel, not just the standalone function" discipline verify-aa-p3
// section 6 used for EAT_ITEM.
//
// Presentation (the new "Apologize"/"Ask for Space" Ask-menu categories) is
// UI and is verified on the live page per invariant 7 — see the Handoff note
// for what was checked there. This harness only proves what a Node vm can.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'npc.js', 'flags.js', 'asks.js', 'stealth.js', 'willingness.js'],
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
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __warm = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: 5, tension: 0, trust: 5, mood: 0 }; npc.mood = 0.5; return npc; };
  __cold = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: -2, tension: 5, trust: -5, mood: 0 }; npc.mood = -0.5; return npc; };
  __caresALot = (npc) => { npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: 1, warmth: -1, volatility: 1 } }; return npc; };
  __letsItSlide = (npc) => { npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: -1, warmth: 1, volatility: -1 } }; return npc; };
  __factCount = (npc) => (npc.memory.facts || []).length;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — both leaves, the boundary engine, and tuning are all real');
const reg = J(`({
  hasApologize: !!ASK_TYPES.Apologize, apologizeCategory: ASK_TYPES.Apologize && ASK_TYPES.Apologize.category,
  hasBoundary: !!ASK_TYPES.AskForSpace, boundaryCategory: ASK_TYPES.AskForSpace && ASK_TYPES.AskForSpace.category,
  categoryIds: ASK_CATEGORIES.map(c => c.id),
  hasResolveViolation: typeof resolveBoundaryRuleViolation === 'function',
  hasApplyViolation: typeof applyBoundaryRuleViolation === 'function',
  hasCheck: typeof checkBoundaryRules === 'function',
  ruleDef: BOUNDARY_RULE_DEFS.no_enter_room,
  apologyTuning: ASK_TUNING.apology, boundaryTuning: ASK_TUNING.boundary,
  hasNoteAttempt: typeof noteGrievanceApologyAttempt === 'function',
})`);
check('ASK_TYPES carries Apologize (category apology) and AskForSpace (category boundary)',
  reg.hasApologize && reg.apologizeCategory === 'apology' && reg.hasBoundary && reg.boundaryCategory === 'boundary');
check('both new categories are registered exactly once', reg.categoryIds.filter(id => id === 'apology').length === 1 && reg.categoryIds.filter(id => id === 'boundary').length === 1);
check('the boundary engine\'s decide/apply/entry functions all exist', reg.hasResolveViolation && reg.hasApplyViolation && reg.hasCheck);
check('the one shipped boundary rule targets the player\'s own bedroom', reg.ruleDef && reg.ruleDef.condition.act === 'enter_room' && reg.ruleDef.condition.roomId === 'bedroom_player');
check('ASK_TUNING carries real apology/boundary tuning, not inline magic numbers', typeof reg.apologyTuning.timelyWindowDays === 'number' && typeof reg.boundaryTuning.acceptThreshold === 'number');
check('noteGrievanceApologyAttempt is a real function', reg.hasNoteAttempt);

// ---------------------------------------------------------------- 1
console.log('\n1. D12 — belief-gated: apologizing for nothing is rejected outright');
const unknown = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  const turn = resolveAsk(g, npcId, 'Apologize', '', {});
  return { accept: turn.decision.accept, reason: turn.decision.reason };
})()`);
check('no unresolved grievance -> rejected with the belief-gate reason', unknown.accept === false && unknown.reason === 'apology_unknown');

// ---------------------------------------------------------------- 2
console.log('\n2. D12 — a sincere, timely apology repairs trust, relieves tension, and resolves the grievance');
const sincere = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  const npcId = ids[0];
  // A realistic, IN-CLAMP-RANGE trust (never __warm's deliberately unclamped
  // 5 — apology's decide() doesn't gate on receptivity at all, so there's no
  // need for it here, and a starting value already past the clamp ceiling
  // would hide a real repair behind clamp(trust+delta, -1, 1) === trust).
  g.npcs[npcId].relPlayer = { ...(g.npcs[npcId].relPlayer || {}), trust: 0.2, tension: 0.3, affection: 0.2 };
  g.meta.clock.day = 5;
  g.npcs[npcId] = addGrievance(g.npcs[npcId], 'You ate my leftovers again.', 0.4, 4); // day 4, "now" is day 5 -> timely
  const beforeTrust = g.npcs[npcId].relPlayer.trust;
  const beforeTension = g.npcs[npcId].relPlayer.tension;
  const turn = resolveAsk(g, npcId, 'Apologize', 'sorry about that', {});
  const decision = { accept: turn.decision.accept, reason: turn.decision.reason, grievanceText: turn.decision.grievanceText };
  turn.applyEffects();
  const npc = g.npcs[npcId];
  const fact = (npc.memory.facts || [])[npc.memory.facts.length - 1];
  return {
    decision,
    trustRose: npc.relPlayer.trust > beforeTrust,
    tensionFell: npc.relPlayer.tension < beforeTension,
    stillUnresolved: getUnresolvedGrievances(npc).length,
    factMentionsIt: !!(fact && fact.text.toLowerCase().includes('apolog')),
  };
})()`);
check('accepted as sincere, and decide() names the real grievance text (never player flavor, D1)',
  sincere.decision.accept === true && sincere.decision.reason === 'apology_sincere' && sincere.decision.grievanceText === 'You ate my leftovers again.');
check('trust rose', sincere.trustRose === true);
check('tension fell', sincere.tensionFell === true);
check('the grievance is actually resolved, not just scored', sincere.stillUnresolved === 0);
check('a memory fact records the apology (gossip-eligible like every other fact in this file)', sincere.factMentionsIt === true);

// ---------------------------------------------------------------- 3
console.log('\n3. D12 — a first attempt made too late reads as insincere: no repair, tension rises, grievance stays open');
const late = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  g.meta.clock.day = 20;
  g.npcs[npcId] = addGrievance(g.npcs[npcId], 'You forgot my birthday.', 0.5, 1); // day 1, "now" day 20 -> way past timelyWindowDays
  const beforeTension = g.npcs[npcId].relPlayer.tension;
  const beforeTrust = g.npcs[npcId].relPlayer.trust;
  const turn = resolveAsk(g, npcId, 'Apologize', '', {});
  const decision = { accept: turn.decision.accept, reason: turn.decision.reason };
  turn.applyEffects();
  const npc = g.npcs[npcId];
  return {
    decision,
    tensionRose: npc.relPlayer.tension > beforeTension,
    trustUnchanged: npc.relPlayer.trust === beforeTrust,
    stillUnresolved: getUnresolvedGrievances(npc).length,
    attemptMarked: npc.relPlayer.grievances[0].apologizedDay === 20,
  };
})()`);
check('rejected as too late, not sincere', late.decision.accept === false && late.decision.reason === 'apology_late');
check('tension rises instead of falling', late.tensionRose === true);
check('trust does not move on an insincere apology', late.trustUnchanged === true);
check('the grievance stays unresolved', late.stillUnresolved === 1);
check('the attempt is marked on the grievance itself', late.attemptMarked === true);

// ---------------------------------------------------------------- 4
console.log('\n4. D12 — a second attempt on the same still-unresolved grievance reads as insincere too, even if nominally timely');
const repeat = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  g.meta.clock.day = 2;
  g.npcs[npcId] = addGrievance(g.npcs[npcId], 'You lied to me.', 0.4, 1);
  g.npcs[npcId] = noteGrievanceApologyAttempt(g.npcs[npcId], 0, 1); // an attempt already happened on day 1
  const turn = resolveAsk(g, npcId, 'Apologize', '', {});
  return { accept: turn.decision.accept, reason: turn.decision.reason };
})()`);
check('a repeat try on a still-unresolved grievance is insincere regardless of timing', repeat.accept === false && repeat.reason === 'apology_repeat');

// ---------------------------------------------------------------- 5
console.log('\n5. D12 — real transgression wiring: stealth.js\'s three "caught" branches now write a real grievance');
const wiredGrievance = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  const targetId = ids[0];
  const owner = g.npcs[targetId];
  owner.location = 'living_room';
  g.player.location = 'living_room';
  owner.inventory = [{ defId: 'hairbrush', qty: 1 }];
  // Force a catch: baseDetectionChance is 0.5 and stealth skill starts at 0,
  // so a seed sweep finds a caught roll deterministically.
  let caughtSeed = null;
  for (let s = 1; s < 40; s++) {
    const g2 = __mk(s);
    const t2 = g2.npcs[targetId] ? targetId : __ids(g2)[0];
    g2.npcs[t2].location = 'living_room';
    g2.player.location = 'living_room';
    g2.npcs[t2].inventory = [{ defId: 'hairbrush', qty: 1 }];
    const before = getUnresolvedGrievances(g2.npcs[t2]).length;
    const res = resolvePickpocket(g2, t2);
    if (res.ok && res.caught) { caughtSeed = { seed: s, before, after: getUnresolvedGrievances(g2.npcs[t2]).length }; break; }
  }
  return caughtSeed;
})()`);
check('a real caught pickpocket writes a real, fresh grievance (resolvePickpocket, not a direct addGrievance call)',
  wiredGrievance && wiredGrievance.before === 0 && wiredGrievance.after === 1, JSON.stringify(wiredGrievance));

const wiredEndToEnd = J(`(() => {
  let found = null;
  for (let s = 100; s < 160 && !found; s++) {
    const g = __mk(s);
    const ids = __ids(g);
    const targetId = ids[0];
    g.npcs[targetId].location = 'living_room';
    g.player.location = 'living_room';
    g.npcs[targetId].inventory = [{ defId: 'hairbrush', qty: 1 }];
    const res = resolvePickpocket(g, targetId);
    if (res.ok && res.caught) {
      g.npcs[targetId].relPlayer = { ...(g.npcs[targetId].relPlayer || {}), trust: 0.2, tension: 0.2, affection: 0.2 };
      g.meta.clock.day += 1; // still well within timelyWindowDays
      const turn = resolveAsk(g, targetId, 'Apologize', '', {});
      found = { gotCaught: true, apologyReason: turn.decision.reason, apologyText: turn.decision.grievanceText };
    }
  }
  return found || { gotCaught: false };
})()`);
check('the apology leaf can then target that real, wired grievance end to end',
  wiredEndToEnd.gotCaught === true && wiredEndToEnd.apologyReason === 'apology_sincere' && typeof wiredEndToEnd.apologyText === 'string' && wiredEndToEnd.apologyText.length > 0,
  JSON.stringify(wiredEndToEnd));

// ---------------------------------------------------------------- 6
console.log('\n6. D13 — $AskForSpace: acceptance writes a real npc.flags._boundaryRules instance');
const askBoundary = J(`(() => {
  const g = __mk(7);
  const ids = __ids(g);
  const npcId = ids[0];
  __warm(g.npcs[npcId]);
  const before = (g.npcs[npcId].flags && g.npcs[npcId].flags._boundaryRules) || [];
  const turn = resolveAsk(g, npcId, 'AskForSpace', '', {});
  turn.applyEffects();
  const after = g.npcs[npcId].flags._boundaryRules || [];
  // Asking again once already agreed short-circuits cleanly.
  const turn2 = resolveAsk(g, npcId, 'AskForSpace', '', {});
  turn2.applyEffects();
  const afterAgain = g.npcs[npcId].flags._boundaryRules || [];
  return {
    accept: turn.decision.accept, reason: turn.decision.reason,
    beforeCount: before.length, afterCount: after.length, ruleId: after[0] && after[0].id,
    reason2: turn2.decision.reason, afterAgainCount: afterAgain.length,
  };
})()`);
check('a warm NPC agrees, and a real instance lands on npc.flags._boundaryRules (D38 sub-keyed array)',
  askBoundary.accept === true && askBoundary.beforeCount === 0 && askBoundary.afterCount === 1 && askBoundary.ruleId === 'no_enter_room');
check('asking again once already agreed is a clean, idempotent reaffirmation', askBoundary.reason2 === 'boundary_already' && askBoundary.afterAgainCount === 1);

// ---------------------------------------------------------------- 7
console.log('\n7. D13 — a cold NPC (hostile floor) declines outright, and nothing is written');
const declineBoundary = J(`(() => {
  const g = __mk(8);
  const ids = __ids(g);
  const npcId = ids[0];
  __cold(g.npcs[npcId]);
  const turn = resolveAsk(g, npcId, 'AskForSpace', '', {});
  turn.applyEffects();
  return { accept: turn.decision.accept, reason: turn.decision.reason, rules: (g.npcs[npcId].flags && g.npcs[npcId].flags._boundaryRules) || [] };
})()`);
check('a hostile relationship blocks the ask on the shared willingness floors, same as every other ask leaf',
  declineBoundary.accept === false && declineBoundary.reason === 'floor_hostile');
check('nothing is written on a decline', declineBoundary.rules.length === 0);

// ---------------------------------------------------------------- 8
console.log('\n8. D13 — checkBoundaryRules: the bound NPC\'s own matching act raises their own tension + a memory fact');
const violation = J(`(() => {
  const g = __mk(9);
  const ids = __ids(g);
  const npcId = ids[0];
  __caresALot(g.npcs[npcId]);
  g.npcs[npcId].flags = { _boundaryRules: [{ id: 'no_enter_room', setDay: 1 }] };
  const beforeTension = g.npcs[npcId].relPlayer.tension;
  const beforeFacts = __factCount(g.npcs[npcId]);
  const result = checkBoundaryRules(g, { act: 'enter_room', roomId: 'bedroom_player', actorId: npcId });
  const npc = g.npcs[npcId];
  const fact = (npc.memory.facts || [])[npc.memory.facts.length - 1];
  return {
    applied: result.applied.length,
    tensionRose: npc.relPlayer.tension > beforeTension,
    factsGrew: __factCount(npc) > beforeFacts,
    factCategory: fact && fact.category, factTag: fact && fact.emotionalTag,
  };
})()`);
check('one effect applied (self-directed REL_DELTA tension)', violation.applied === 1);
check('their own tension rose', violation.tensionRose === true);
check('a memory fact was written', violation.factsGrew === true);
check("filed under the same 'house'/'domestic' bucket the house-rule engine uses (TRANSMISSION picks it up for free)",
  violation.factCategory === 'house' && violation.factTag === 'domestic');

// ---------------------------------------------------------------- 9
console.log('\n9. D13 — checkBoundaryRules is a real no-op when nothing applies');
const noops = J(`(() => {
  const g = __mk(10);
  const ids = __ids(g);
  const npcId = ids[0];
  __caresALot(g.npcs[npcId]);
  const noRule = checkBoundaryRules(g, { act: 'enter_room', roomId: 'bedroom_player', actorId: npcId }).applied.length;
  g.npcs[npcId].flags = { _boundaryRules: [{ id: 'no_enter_room', setDay: 1 }] };
  const wrongRoom = checkBoundaryRules(g, { act: 'enter_room', roomId: 'kitchen', actorId: npcId }).applied.length;
  __letsItSlide(g.npcs[npcId]);
  const care = ruleCareWeight(g.npcs[npcId]);
  const letItSlide = checkBoundaryRules(g, { act: 'enter_room', roomId: 'bedroom_player', actorId: npcId }).applied.length;
  return { noRule, wrongRoom, care, letItSlide };
})()`);
check('no active boundary rule at all -> nothing applied', noops.noRule === 0);
check('a room that doesn\'t match the rule\'s condition -> nothing applied', noops.wrongRoom === 0);
check('an NPC who scores below minCareToReact lets their own violation go entirely (D39\'s same formula, self-directed)', noops.letItSlide === 0, `care=${noops.care}`);

// ---------------------------------------------------------------- 10
console.log('\n10. D13 — real wiring: sim.js\'s resolveBatch actually fires checkBoundaryRules on a real drive-driven room change');
const wiredSim = J(`(() => {
  const g = __mk(11);
  const ids = __ids(g);
  const npcId = ids[0];
  __caresALot(g.npcs[npcId]);
  g.npcs[npcId].location = 'living_room';
  g.npcs[npcId].flags = { _boundaryRules: [{ id: 'no_enter_room', setDay: 1 }] };
  const beforeTension = g.npcs[npcId].relPlayer.tension;
  const beforeFacts = __factCount(g.npcs[npcId]);
  const origResolveTick = resolveTick;
  // Stand in for a real drive choosing to walk into bedroom_player this tick
  // — resolveTick itself (drive scoring, RNG-dependent) isn't what this test
  // is proving; the wiring FROM its npcUpdates output THROUGH resolveBatch's
  // diff-and-check pass is.
  resolveTick = () => ({ newEvents: [], peepResults: [], npcUpdates: { [npcId]: { location: 'bedroom_player' } } });
  let batchResult;
  try {
    batchResult = resolveBatch(g, 1, {});
  } finally {
    resolveTick = origResolveTick;
  }
  const npc = batchResult.state.npcs[npcId];
  const fact = (npc.memory.facts || [])[npc.memory.facts.length - 1];
  return {
    location: npc.location,
    tensionRose: npc.relPlayer.tension > beforeTension,
    factsGrew: __factCount(npc) > beforeFacts,
    factMentionsBoundary: !!(fact && fact.text.includes('boundary')),
  };
})()`);
check('the NPC actually moved into the watched room', wiredSim.location === 'bedroom_player');
check('resolveBatch\'s own diff pass fired checkBoundaryRules for real — tension rose', wiredSim.tensionRose === true);
check('and a real memory fact landed', wiredSim.factsGrew === true && wiredSim.factMentionsBoundary === true);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
