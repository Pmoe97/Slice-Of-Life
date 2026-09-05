// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 3: Flags & Conditions engine (D15).
//
//   node src/src/dev/verify/verify-aa-p3.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// condition matcher (houseRuleConditionMet), the personality-driven care/
// severity formulas (ruleCareWeight/ruleReactionSeverity), the co-presence
// detection gap (an NPC outside the room never reacts — design invariant 3),
// the compliance gate (a sufficiently unbothered NPC lets a violation go
// with zero consequence), and the belief/gossip write (addMemoryFact,
// category 'house'/emotionalTag 'domestic', so npc.js's existing TRANSMISSION
// machinery is the gossip path — nothing new to test there, it already has
// its own harness). Section 6 proves the real wiring: the SAME EAT_ITEM
// effect line the game's inventory-panel Use verb and the kitchen's Eat chip
// both resolve through actually triggers a witnessed reaction, not just the
// standalone flags.js functions in isolation. Presentation (the "Set/Rescind
// House Rule" chip in the misc/"More" group) is UI and is verified on the
// live page per invariant 7 — see the Handoff note for what was checked
// there. This harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'npc.js', 'flags.js'],
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
  // Extreme, unclamped-by-construction temperament so the care formula lands
  // reliably on one side of minCareToReact regardless of the seeded default.
  __caresALot = (npc) => { npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: 1, warmth: -1, volatility: 1 } }; return npc; };
  __letsItSlide = (npc) => { npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: -1, warmth: 1, volatility: -1 } }; return npc; };
  __activateRule = (g, day) => { g.world.houseRules = [{ id: 'no_eating_living_room', setDay: day || 1 }]; return g; };
  __factCount = (npc) => (npc.memory.facts || []).length;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the engine is real, the one shipped rule exists');
const reg = J(`({
  hasResolve: typeof resolveHouseRuleViolations === 'function',
  hasApply: typeof applyHouseRuleViolations === 'function',
  hasCheck: typeof checkHouseRules === 'function',
  hasCondition: typeof houseRuleConditionMet === 'function',
  ruleDef: HOUSE_RULE_DEFS.no_eating_living_room,
  tuning: FLAGS_TUNING,
})`);
check('the pure decide fn, the trusted apply fn, and the one entry point all exist', reg.hasResolve && reg.hasApply && reg.hasCheck && reg.hasCondition);
check('the one shipped house rule matches the plan\'s own verification example', reg.ruleDef && reg.ruleDef.condition.act === 'eat' && reg.ruleDef.condition.roomId === 'living_room');
check('FLAGS_TUNING is a real config bucket, not inline magic numbers', typeof reg.tuning.careBase === 'number' && typeof reg.tuning.minCareToReact === 'number');

// ---------------------------------------------------------------- 1
console.log('\n1. Condition matcher — a missing key matches anything, a present key must match exactly');
const cond = J(`({
  full:      houseRuleConditionMet({ act: 'eat', roomId: 'living_room' }, { act: 'eat', roomId: 'living_room' }),
  wrongRoom: houseRuleConditionMet({ act: 'eat', roomId: 'living_room' }, { act: 'eat', roomId: 'kitchen' }),
  wrongAct:  houseRuleConditionMet({ act: 'eat', roomId: 'living_room' }, { act: 'nap', roomId: 'living_room' }),
  actOnly:   houseRuleConditionMet({ act: 'eat' }, { act: 'eat', roomId: 'anywhere' }),
  empty:     houseRuleConditionMet({}, { act: 'anything', roomId: 'anywhere' }),
  noCond:    houseRuleConditionMet(null, { act: 'eat', roomId: 'living_room' }),
})`);
check('exact act+room match', cond.full === true);
check('room mismatch refuses', cond.wrongRoom === false);
check('act mismatch refuses', cond.wrongAct === false);
check('an act-only condition ignores room entirely', cond.actOnly === true);
check('an empty condition matches any event', cond.empty === true);
check('a missing condition matches nothing', cond.noCond === false);

// ---------------------------------------------------------------- 2
console.log('\n2. Perception gap (design invariant 3) — an NPC outside the room never reacts');
const gap = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  const witnessId = ids[0];
  __caresALot(g.npcs[witnessId]);
  __activateRule(g);
  g.npcs[witnessId].location = 'kitchen'; // NOT living_room
  const before = { mood: g.npcs[witnessId].mood, tension: g.npcs[witnessId].relPlayer.tension, facts: __factCount(g.npcs[witnessId]) };
  const result = checkHouseRules(g, { act: 'eat', roomId: 'living_room', actorId: 'player' });
  const after = { mood: g.npcs[witnessId].mood, tension: g.npcs[witnessId].relPlayer.tension, facts: __factCount(g.npcs[witnessId]) };
  return { applied: result.applied.length, before, after };
})()`);
check('an NPC not in the room applies nothing', gap.applied === 0);
check('their mood/tension/memory are byte-unchanged (the perception gap)', JSON.stringify(gap.before) === JSON.stringify(gap.after));

// ---------------------------------------------------------------- 3
console.log('\n3. A co-present, high-care NPC reacts — mood down, tension up, a belief written');
const react = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  const witnessId = ids[0];
  __caresALot(g.npcs[witnessId]);
  __activateRule(g);
  g.npcs[witnessId].location = 'living_room'; // co-present with the violation
  const beforeMood = g.npcs[witnessId].mood;
  const beforeTension = g.npcs[witnessId].relPlayer.tension;
  const result = checkHouseRules(g, { act: 'eat', roomId: 'living_room', actorId: 'player' });
  const npc = g.npcs[witnessId];
  const fact = (npc.memory.facts || [])[npc.memory.facts.length - 1];
  return {
    applied: result.applied.length,
    moodDropped: npc.mood < beforeMood,
    tensionRose: npc.relPlayer.tension > beforeTension,
    factCategory: fact && fact.category,
    factTag: fact && fact.emotionalTag,
    factMentionsYou: !!(fact && fact.text.includes('you')),
  };
})()`);
check('two effects applied (MOOD_DELTA + REL_DELTA)', react.applied === 2);
check('mood dropped', react.moodDropped === true);
check('tension rose', react.tensionRose === true);
check("the belief is filed under 'house' (a TRANSMISSION practicalCategory) with the 'domestic' emotional tag", react.factCategory === 'house' && react.factTag === 'domestic');
check('the belief names the player (2nd person, matching WITNESS_MEMORY_TEMPLATES\' own precedent)', react.factMentionsYou === true);

// ---------------------------------------------------------------- 4
console.log('\n4. No active rule — checkHouseRules is a real no-op');
const noRule = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  g.npcs[ids[0]].location = 'living_room';
  // world.houseRules deliberately left empty/undefined.
  const result = checkHouseRules(g, { act: 'eat', roomId: 'living_room', actorId: 'player' });
  return { applied: result.applied.length };
})()`);
check('nothing applied when no house rule is active', noRule.applied === 0);

// ---------------------------------------------------------------- 5
console.log('\n5. Compliance is personality-driven — a low-care NPC lets it go entirely (D15)');
const slide = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const witnessId = ids[0];
  __letsItSlide(g.npcs[witnessId]);
  __activateRule(g);
  g.npcs[witnessId].location = 'living_room';
  const before = { mood: g.npcs[witnessId].mood, tension: g.npcs[witnessId].relPlayer.tension, facts: __factCount(g.npcs[witnessId]) };
  const care = ruleCareWeight(g.npcs[witnessId]);
  const result = checkHouseRules(g, { act: 'eat', roomId: 'living_room', actorId: 'player' });
  const after = { mood: g.npcs[witnessId].mood, tension: g.npcs[witnessId].relPlayer.tension, facts: __factCount(g.npcs[witnessId]) };
  return { care, belowThreshold: care < FLAGS_TUNING.minCareToReact, applied: result.applied.length, before, after };
})()`);
check('the extreme low-conscientiousness/high-warmth NPC scores below minCareToReact', slide.belowThreshold === true, `care=${slide.care}`);
check('and applies nothing at all — not a smaller reaction, none', slide.applied === 0);
check('state is byte-unchanged', JSON.stringify(slide.before) === JSON.stringify(slide.after));

// ---------------------------------------------------------------- 6
console.log('\n6. Real wiring — the SAME EAT_ITEM effect the game\'s Eat/Use verbs resolve through triggers this');
const wired = J(`(() => {
  const g = __mk(5);
  const ids = __ids(g);
  const witnessId = ids[0];
  __caresALot(g.npcs[witnessId]);
  __activateRule(g);
  g.npcs[witnessId].location = 'living_room';
  g.player.location = 'living_room';
  g.player.inventory = [{ defId: 'granola_bar', qty: 1 }];
  const beforeTension = g.npcs[witnessId].relPlayer.tension;
  const ctx = buildEffectContext(g, [], getPresentNpcIds(g.npcs, 'living_room'), g.objects['room_living_room'] || {}, g.player.inventory);
  applyEffects(parseEffectDSL('EAT_ITEM granola_bar 1 player'), ctx);
  return { tensionRose: g.npcs[witnessId].relPlayer.tension > beforeTension, ateIt: g.player.inventory.length === 0 };
})()`);
check('eating (the real EAT_ITEM effect, not a direct flags.js call) still raises tension for the co-present witness', wired.tensionRose === true);
check('the item was actually consumed — this is a real eat, not a stub', wired.ateIt === true);

// ---------------------------------------------------------------- 7
console.log('\n7. The actor never reacts to their own violation');
const selfExempt = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const actorId = ids[0];
  __caresALot(g.npcs[actorId]);
  __activateRule(g);
  g.npcs[actorId].location = 'living_room';
  const violations = resolveHouseRuleViolations(g, { act: 'eat', roomId: 'living_room', actorId });
  return { count: violations.length };
})()`);
check('an NPC eating in violation of the rule is not counted as its own witness', selfExempt.count === 0);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
