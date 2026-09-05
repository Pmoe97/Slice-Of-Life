// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 9: Cleaning system + Clean Hallway (D17/D49).
//
//   node src/src/dev/verify/verify-aa-p9.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// ambient dirt.js layer (bumpRoomDirt/roomDirtOf/dustSignalIntensity), its
// blend into world.js's refreshRoomCleanliness, the real ADD_ROOM_DIRT
// effect wiring, the real 'dust' standing-signal wiring
// (signals.js's deriveStandingSignals), the real cooking/eating source
// wiring (defs.actions.js's buildCookEffects, effects.js's applyEatItem),
// the real self.clean action (prepare/buildEffects/narration + the
// roomHasDirt gate + the all_purpose_cleaner consumption path), the real
// NPC-chore/paid-service reset wiring (computer.js's cleanRoomObjects), the
// real per-tick foot-traffic wiring (sim.js's resolveTick/resolveBatch —
// same discipline verify-aa-p8's own section 8 used for temperature), and
// hallway_a/hallway_b specifically — the user's literal "Clean Hallway" ask,
// which only the ambient layer can satisfy since both rooms' furniture is
// entirely cleanlinessWeight:0. Presentation (the "Clean Up" chip itself) is
// UI and would be verified on the live page per invariant 7; this harness
// only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'world.js', 'signals.js', 'computer.js', 'dirt.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the ambient dirt layer, its verb, its effect and its signal all exist');
const reg = J(`({
  tuning: DIRT_TUNING,
  action: ACTION_DEFS['self.clean'],
  checker: typeof ACTION_REQUIREMENT_CHECKERS.roomHasDirt === 'function',
  effect: EFFECT_DEFS.ADD_ROOM_DIRT,
  signal: SIGNAL_DEFS.dust,
  fns: {
    bump: typeof bumpRoomDirt === 'function', read: typeof roomDirtOf === 'function',
    dustIntensity: typeof dustSignalIntensity === 'function',
  },
  cleanerItem: !!ITEM_DEFS.all_purpose_cleaner,
})`);
// Continuous-cadence-closure Phase 5 (D6): footTrafficPerTick renamed footTrafficPerMinute.
check('DIRT_TUNING is a real config bucket', typeof reg.tuning.cleanlinessPenaltyMax === 'number' && typeof reg.tuning.footTrafficPerMinute === 'number');
check("self.clean is a real, room-sourced action covering every room (hallways included)", !!reg.action && reg.action.source.kind === 'room' && reg.action.source.roomIds.includes('hallway_a') && reg.action.source.roomIds.includes('hallway_b'));
check('the roomHasDirt requirement checker exists', reg.checker);
check('ADD_ROOM_DIRT is a real, trusted-only (llm:false) effect', !!reg.effect && reg.effect.llm === false && reg.effect.implemented === true);
check("the 'dust' standing signal is registered on the smell channel", !!reg.signal && reg.signal.channel === 'smell');
check('all three dirt.js functions exist', Object.values(reg.fns).every(Boolean));
check('all_purpose_cleaner (the pre-existing, previously-unread item) still exists to be wired against', reg.cleanerItem);

// ---------------------------------------------------------------- 1
console.log('\n1. bumpRoomDirt — clamps to [0,1], and a REAL refreshRoomCleanliness blend, proven on hallway_a (every object there is cleanlinessWeight:0)');
const bump = J(`(() => {
  const g = __mk(1, 1);
  const startDirt = g.world.rooms.hallway_a.dirt;
  const startClean = g.world.rooms.hallway_a.cleanliness;
  bumpRoomDirt(g, 'hallway_a', 0.5);
  const midDirt = g.world.rooms.hallway_a.dirt;
  const midClean = g.world.rooms.hallway_a.cleanliness;
  bumpRoomDirt(g, 'hallway_a', 10); // way past the ceiling
  const highDirt = g.world.rooms.hallway_a.dirt;
  bumpRoomDirt(g, 'hallway_a', -10); // way past the floor
  const lowDirt = g.world.rooms.hallway_a.dirt;
  const lowClean = g.world.rooms.hallway_a.cleanliness;
  return { startDirt, startClean, midDirt, midClean, highDirt, lowDirt, lowClean };
})()`);
check('a fresh room starts at zero dirt', bump.startDirt === 0, JSON.stringify(bump));
check("hallway_a's object-derived score is exactly CLEANLINESS.baseline (every object there is cleanlinessWeight:0) — so cleanliness only moves because of dirt", bump.startClean === J('CLEANLINESS.baseline'), JSON.stringify(bump));
check('+0.5 dirt lands exactly on 0.5 (no clamp needed mid-range)', bump.midDirt === 0.5, JSON.stringify(bump));
check('cleanliness drops by exactly dirt * cleanlinessPenaltyMax — real blend, not a placeholder', bump.midClean === Math.round(J('CLEANLINESS.baseline') - 0.5 * J('DIRT_TUNING.cleanlinessPenaltyMax')), JSON.stringify(bump));
check('dirt clamps at 1, never overshoots', bump.highDirt === 1, JSON.stringify(bump));
check('dirt clamps at 0, never undershoots', bump.lowDirt === 0 && bump.lowClean === J('CLEANLINESS.baseline'), JSON.stringify(bump));

// ---------------------------------------------------------------- 2
console.log('\n2. ADD_ROOM_DIRT — real DSL wiring (parseEffectDSL/applyEffects), both directions, and the magnitude-cap guard');
const dsl = J(`(() => {
  const g = __mk(2, 1);
  const ctx = { gameState: g };
  applyEffects(parseEffectDSL('ADD_ROOM_DIRT hallway_b 0.4'), ctx);
  const afterAdd = g.world.rooms.hallway_b.dirt;
  applyEffects(parseEffectDSL('ADD_ROOM_DIRT hallway_b -0.15'), ctx);
  const afterSubtract = g.world.rooms.hallway_b.dirt;
  const overCap = EFFECT_DEFS.ADD_ROOM_DIRT.validate({ roomId: 'hallway_b', amount: '999' }, ctx);
  const badRoom = EFFECT_DEFS.ADD_ROOM_DIRT.validate({ roomId: 'not_a_real_room', amount: '0.1' }, ctx);
  return { afterAdd, afterSubtract, overCap, badRoom };
})()`);
check('a positive DSL line raises dirt by exactly its amount', Math.abs(dsl.afterAdd - 0.4) < 1e-9, JSON.stringify(dsl));
check('a negative DSL line lowers dirt by exactly its amount', Math.abs(dsl.afterSubtract - 0.25) < 1e-9, JSON.stringify(dsl));
check('validate refuses a magnitude past EFFECT_LIMITS.roomDirtDeltaCap', dsl.overCap !== true && typeof dsl.overCap === 'string', JSON.stringify(dsl));
check('validate refuses a room that does not exist', dsl.badRoom !== true && typeof dsl.badRoom === 'string', JSON.stringify(dsl));

// ---------------------------------------------------------------- 3
console.log("\n3. deriveStandingSignals — the 'dust' signal reads world.rooms[].dirt directly, gated on dustSignalFloor");
const dust = J(`(() => {
  const g = __mk(3, 1);
  const below = deriveStandingSignals(g).filter(s => s.signalId === 'dust' && s.roomId === 'hallway_a');
  bumpRoomDirt(g, 'hallway_a', DIRT_TUNING.dustSignalFloor - 0.01);
  const stillBelow = deriveStandingSignals(g).filter(s => s.signalId === 'dust' && s.roomId === 'hallway_a');
  bumpRoomDirt(g, 'hallway_a', 0.5); // now comfortably above the floor
  const above = deriveStandingSignals(g).find(s => s.signalId === 'dust' && s.roomId === 'hallway_a');
  return { belowCount: below.length, stillBelowCount: stillBelow.length, above, dirt: g.world.rooms.hallway_a.dirt, expected: dustSignalIntensity(g.world.rooms.hallway_a.dirt) };
})()`);
check('a clean room emits no dust signal', dust.belowCount === 0, JSON.stringify(dust));
check('a room just under the floor still emits nothing', dust.stillBelowCount === 0, JSON.stringify(dust));
check("a room above the floor emits a real 'dust' record with the exact formula's intensity", !!dust.above && Math.abs(dust.above.intensity - dust.expected) < 1e-9, JSON.stringify(dust));

// ---------------------------------------------------------------- 4
console.log('4. cleanRoomObjects — the NPC-chore/paid-cleaning-service path also resets the ambient layer, not just object dirtyWhen');
const chore = J(`(() => {
  const g = __mk(4, 1);
  bumpRoomDirt(g, 'hallway_b', 0.7);
  const before = { dirt: g.world.rooms.hallway_b.dirt, clean: g.world.rooms.hallway_b.cleanliness };
  cleanRoomObjects(g, 'hallway_b');
  const after = { dirt: g.world.rooms.hallway_b.dirt, clean: g.world.rooms.hallway_b.cleanliness };
  return { before, after };
})()`);
check('the ambient layer was genuinely dirtied first (test setup sanity)', chore.before.dirt === 0.7 && chore.before.clean < J('CLEANLINESS.baseline'), JSON.stringify(chore));
check("an NPC/service cleaning pass (cleanRoomObjects) zeroes the ambient dirt too — 'an NPC chore cleans a room' covers both layers", chore.after.dirt === 0 && chore.after.clean === J('CLEANLINESS.baseline'), JSON.stringify(chore));

// ---------------------------------------------------------------- 5
console.log('5. applyEatItem — eating is a real D17 dirt source, wherever the eater actually is');
const eat = J(`(() => {
  const g = __mk(5, 1);
  g.player.location = 'kitchen';
  g.player.inventory = [{ defId: 'cereal', qty: 1 }];
  const before = g.world.rooms.kitchen.dirt;
  applyEatItem({ defId: 'cereal', qty: 1, from: 'player', who: 'player' }, { gameState: g });
  const after = g.world.rooms.kitchen.dirt;
  return { before, after };
})()`);
check('eating a real item bumps the eater room dirt by exactly DIRT_TUNING.eatingDirtPerAct', Math.abs(eat.after - eat.before - J('DIRT_TUNING.eatingDirtPerAct')) < 1e-9, JSON.stringify(eat));

// ---------------------------------------------------------------- 6
console.log('6. buildCookEffects — cooking is a real D17 dirt source, on top of (not instead of) the existing stove/sink object mess');
const cook = J(`(() => {
  const g = __mk(6, 1);
  g.player.location = 'kitchen';
  const ctx = { gameState: g };
  const prepared = {
    recipe: { id: 'test_recipe', ingredients: [], leaves: [], method: 'stovetop', cookware: null, servings: 1 },
    plate: { grade: null, flaws: [], kcalPerServing: 100, servings: { left: 1 } },
    seasoning: [],
  };
  const lines = buildCookEffects(ctx, prepared);
  const dirtLine = lines.find(l => l.startsWith('ADD_ROOM_DIRT'));
  const before = g.world.rooms.kitchen.dirt;
  applyEffects(parseEffectDSL(lines.join('\\n')), ctx);
  const after = g.world.rooms.kitchen.dirt;
  return { dirtLine, before, after };
})()`);
check("buildCookEffects emits a real ADD_ROOM_DIRT line for the player's actual room", cook.dirtLine === `ADD_ROOM_DIRT kitchen ${J('DIRT_TUNING.cookingDirtPerCook')}`, JSON.stringify(cook));
// buildCookEffects' OWN returned lines also include `EAT_ITEM cooked_meal 1
// <into>` (self.cook auto-eats what it just made) — and since section 5
// proved applyEatItem is a real dirt source too, applying the FULL real line
// set correctly bumps kitchen dirt by cooking AND eating, not cooking alone.
// That double bump is the correct emergent behavior, not a test artifact.
check('applying the real returned lines raises kitchen dirt by cooking + the auto-eat that follows it', Math.abs(cook.after - cook.before - J('DIRT_TUNING.cookingDirtPerCook') - J('DIRT_TUNING.eatingDirtPerAct')) < 1e-9, JSON.stringify(cook));

// ---------------------------------------------------------------- 7
console.log('7. self.clean — prepare/buildEffects/narration + roomHasDirt gate + the all_purpose_cleaner consumption path');
const clean = J(`(() => {
  const g = __mk(7, 1);
  g.player.location = 'hallway_a';
  const ctx = { gameState: g, roomId: 'hallway_a' };
  const gateBefore = ACTION_REQUIREMENT_CHECKERS.roomHasDirt(ctx);
  bumpRoomDirt(g, 'hallway_a', 0.6);
  const gateAfterDirty = ACTION_REQUIREMENT_CHECKERS.roomHasDirt(ctx);
  // Bare-handed pass: no cleaner owned.
  g.player.inventory = [];
  const prepBare = prepareClean(ctx);
  const linesBare = buildCleanEffects(ctx, prepBare);
  const narrationBare = cleanNarration(ctx, prepBare);
  applyEffects(parseEffectDSL(linesBare.join('\\n')), ctx);
  const afterBare = g.world.rooms.hallway_a.dirt;
  const gateAfterBareClean = ACTION_REQUIREMENT_CHECKERS.roomHasDirt(ctx);
  // Refill and try again WITH the cleaner owned — should clear it fully and consume one unit.
  bumpRoomDirt(g, 'hallway_a', 0.6);
  g.player.inventory = [{ defId: 'all_purpose_cleaner', qty: 1 }];
  const prepCleaner = prepareClean(ctx);
  const linesCleaner = buildCleanEffects(ctx, prepCleaner);
  applyEffects(parseEffectDSL(linesCleaner.join('\\n')), ctx);
  const afterCleaner = g.world.rooms.hallway_a.dirt;
  const cleanerLeft = (g.player.inventory.find(s => s.defId === 'all_purpose_cleaner')?.qty) || 0;
  return { gateBefore, gateAfterDirty, prepBare, linesBare, narrationBare, afterBare, gateAfterBareClean, prepCleaner, linesCleaner, afterCleaner, cleanerLeft };
})()`);
check('a spotless room refuses self.clean (a string reason, not true)', clean.gateBefore !== true && typeof clean.gateBefore === 'string', JSON.stringify(clean.gateBefore));
check('a dirtied room allows self.clean', clean.gateAfterDirty === true, JSON.stringify(clean.gateAfterDirty));
check('prepareClean picks cleanStepBase with no cleaner owned', clean.prepBare.step === Math.min(0.6, J('DIRT_TUNING.cleanStepBase')) && clean.prepBare.usedCleaner === false, JSON.stringify(clean.prepBare));
check('buildCleanEffects (bare-handed) emits ADD_ROOM_DIRT with a NEGATIVE step and no DESTROY_ITEM line', clean.linesBare.some(l => l === `ADD_ROOM_DIRT hallway_a -${clean.prepBare.step}`) && !clean.linesBare.some(l => l.startsWith('DESTROY_ITEM')), JSON.stringify(clean.linesBare));
check('applying it actually drains hallway_a dirt by exactly cleanStepBase', Math.abs(clean.afterBare - (0.6 - J('DIRT_TUNING.cleanStepBase'))) < 1e-9, JSON.stringify(clean));
check("a partial clean (cleanStepBase < the dirt that was there) leaves the room still needing another pass — narration says so", clean.narrationBare.includes('more to do'), clean.narrationBare);
check('with all_purpose_cleaner owned, prepareClean picks the bigger cleanStepVacuum step', clean.prepCleaner.usedCleaner === true && clean.prepCleaner.step === Math.min(clean.prepCleaner.dirt, J('DIRT_TUNING.cleanStepVacuum')), JSON.stringify(clean.prepCleaner));
check('buildCleanEffects (with cleaner) emits a real DESTROY_ITEM line for the cleaner', clean.linesCleaner.some(l => l === 'DESTROY_ITEM all_purpose_cleaner 1 player'), JSON.stringify(clean.linesCleaner));
check('applying it actually consumes one unit of all_purpose_cleaner from the real inventory', clean.cleanerLeft === 0, JSON.stringify(clean));
check('the cleaner pass drains at least as much dirt as the bare-handed pass did', (0.6 - clean.afterCleaner) >= J('DIRT_TUNING.cleanStepBase'), JSON.stringify(clean));

// ---------------------------------------------------------------- 8
console.log('8. Real per-tick wiring — resolveBatch: foot traffic accumulates dirt for an awake resident, and every resident asleep accumulates none');
const tick = J(`(() => {
  const mkAt = (day) => {
    const g = __mk(8, day);
    const ids = __ids(g);
    for (const id of ids) { g.npcs[id].location = 'living_room'; g.npcs[id].schedule = { currentBlock: 'leisure' }; }
    return g;
  };
  const totalDirt = (g) => ALL_ROOMS.reduce((sum, r) => sum + (g.world.rooms[r]?.dirt || 0), 0);
  let awakeState = mkAt(1);
  const startDirt = awakeState.world.rooms.living_room.dirt;
  for (let i = 0; i < 20; i++) {
    awakeState = resolveBatch(awakeState, 1, { suppressNeeds: true }).state;
  }
  const endDirtAwake = awakeState.world.rooms.living_room.dirt;
  // The sleep trial can't force 'sleep' by poking npc.schedule directly — Pass
  // 1 re-derives each NPC's block fresh from SCHEDULES every tick, ignoring
  // that field. Real control instead: day 1 is a real weekend day
  // ((1+5)%7=6, isWeekend), and every SCHEDULES variant's weekend sleep
  // window covers at least ticks [0,16] — so pinning the clock to midnight
  // and running a short window inside that is genuine sleep for EVERY
  // resident regardless of which shift template they were assigned. Summed
  // across every room (not just living_room) since a sleeping resident
  // resolves to their OWN bedroom, not wherever they started.
  let sleepState = __mk(8, 1);
  sleepState.meta.clock.minutes = 0;
  const startDirtSleep = totalDirt(sleepState);
  for (let i = 0; i < 8; i++) {
    sleepState = resolveBatch(sleepState, 1, { suppressNeeds: true }).state;
  }
  const endDirtSleep = totalDirt(sleepState);
  const blocksDuringSleep = __ids(sleepState).map(id => sleepState.npcs[id].schedule?.currentBlock);
  return { startDirt, endDirtAwake, startDirtSleep, endDirtSleep, blocksDuringSleep };
})()`);
check("20 ticks of an awake, present resident measurably raises the room's ambient dirt (real resolveTick/resolveBatch wiring, not just the standalone bumpRoomDirt call)", tick.endDirtAwake > tick.startDirt, JSON.stringify(tick));
check('at midnight on a weekend, every resident actually resolves to the sleep block (test control sanity)', tick.blocksDuringSleep.length > 0 && tick.blocksDuringSleep.every(b => b === 'sleep'), JSON.stringify(tick));
check('8 ticks with every resident genuinely asleep leaves total dirt across every room exactly where it started — the sleep guard is real', tick.endDirtSleep === tick.startDirtSleep, JSON.stringify(tick));

// ---------------------------------------------------------------- 9
console.log('9. Hallway cleaning end-to-end — the literal "Clean Hallway" ask, on a room with zero cleanlinessWeight objects');
const hallway = J(`(() => {
  const results = {};
  for (const roomId of ['hallway_a', 'hallway_b']) {
    const g = __mk(9, 1);
    g.player.location = roomId;
    const ctx = { gameState: g, roomId };
    // Simulate a few days of foot traffic the direct way (the per-tick path
    // is already proven in section 8) so the room is genuinely dirty.
    bumpRoomDirt(g, roomId, 0.4);
    const dirtyGate = ACTION_REQUIREMENT_CHECKERS.roomHasDirt(ctx);
    const dirtyClean = g.world.rooms[roomId].cleanliness;
    const prepared = prepareClean(ctx);
    const lines = buildCleanEffects(ctx, prepared);
    applyEffects(parseEffectDSL(lines.join('\\n')), ctx);
    const afterDirt = g.world.rooms[roomId].dirt;
    const afterClean = g.world.rooms[roomId].cleanliness;
    results[roomId] = { dirtyGate, dirtyClean, afterDirt, afterClean };
  }
  return results;
})()`);
for (const roomId of ['hallway_a', 'hallway_b']) {
  const r = hallway[roomId];
  check(`${roomId}: a dirtied hallway lights up the Clean Up chip`, r.dirtyGate === true, JSON.stringify(r));
  check(`${roomId}: the dirty hallway reads below baseline cleanliness (only the ambient layer moved it — its furniture is all cleanlinessWeight:0)`, r.dirtyClean < J('CLEANLINESS.baseline'), JSON.stringify(r));
  check(`${roomId}: cleaning it for real drains the ambient dirt`, r.afterDirt < 0.4, JSON.stringify(r));
  check(`${roomId}: cleanliness recovers toward baseline as dirt drains`, r.afterClean > r.dirtyClean, JSON.stringify(r));
}

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
