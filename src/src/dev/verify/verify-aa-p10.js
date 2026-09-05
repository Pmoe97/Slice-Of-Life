// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 10: Kitchen & Dining + Bathroom & Grooming (D18/D19).
//
//   node src/src/dev/verify/verify-aa-p10.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// registration of all six new verbs (self.brew, trash.take_out, toilet.use,
// toilet.clean, sink.wash_hands, mirror.groom) and their three new
// requirement checkers (hasCoffeeBeans, trashNeedsTakingOut, toiletDirty);
// self.brew's real ingredient-consumption/spawn wiring (reusing self.cook's
// kitchenSources/ingredientDestroyLines/findObjectByDefIdLive helpers);
// trash.take_out closing the loop on the pre-existing, previously-only-
// written trash_kitchen fill/rotten_food states; toilet.use/toilet.clean
// closing the same kind of loop on toilet's clean/dirty state, including the
// gate flipping both ways; and the flat hygiene/mood effects on
// sink.wash_hands and mirror.groom. Presentation (the chips themselves) is
// UI and would be verified on the live page per invariant 7; this harness
// only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'world.js', 'signals.js', 'computer.js', 'dirt.js', 'items.js'],
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
    g.player.location = 'kitchen';
    return g;
  };
  __objByDef = (g, roomId, defId) => Object.values(g.objects['room_' + roomId] || {}).find(o => o.defId === defId);
  __ctx = (g, roomId) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: [] });
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — all six verbs, all three new checkers, all five affords updates exist');
const reg = J(`({
  actions: {
    brew: ACTION_DEFS['self.brew'],
    trashOut: ACTION_DEFS['trash.take_out'],
    toiletUse: ACTION_DEFS['toilet.use'],
    toiletClean: ACTION_DEFS['toilet.clean'],
    washHands: ACTION_DEFS['sink.wash_hands'],
    groom: ACTION_DEFS['mirror.groom'],
  },
  checkers: {
    hasCoffeeBeans: typeof ACTION_REQUIREMENT_CHECKERS.hasCoffeeBeans === 'function',
    trashNeedsTakingOut: typeof ACTION_REQUIREMENT_CHECKERS.trashNeedsTakingOut === 'function',
    toiletDirty: typeof ACTION_REQUIREMENT_CHECKERS.toiletDirty === 'function',
  },
  affords: {
    coffeeMaker: OBJECT_DEFS.coffee_maker.affords,
    trashKitchen: OBJECT_DEFS.trash_kitchen.affords,
    toilet: OBJECT_DEFS.toilet.affords,
    sinkBathroom: OBJECT_DEFS.sink_bathroom.affords,
    bathroomMirror: OBJECT_DEFS.bathroom_mirror.affords,
  },
  tuning: {
    brewMinutes: ACTION_TUNING.brewMinutes, trashOutMinutes: ACTION_TUNING.trashOutMinutes,
    toiletMinutes: ACTION_TUNING.toiletMinutes, washHandsMinutes: ACTION_TUNING.washHandsMinutes,
    groomMinutes: ACTION_TUNING.groomMinutes,
  },
})`);
check('all six ACTION_DEFS entries exist', Object.values(reg.actions).every(Boolean), JSON.stringify(Object.keys(reg.actions).filter(k => !reg.actions[k])));
check('self.brew is sourced from coffee_maker', reg.actions.brew.source.kind === 'object' && reg.actions.brew.source.objDef === 'coffee_maker');
check('trash.take_out is sourced from trash_kitchen', reg.actions.trashOut.source.objDef === 'trash_kitchen');
check('toilet.use and toilet.clean are both sourced from toilet', reg.actions.toiletUse.source.objDef === 'toilet' && reg.actions.toiletClean.source.objDef === 'toilet');
check('sink.wash_hands is sourced from sink_bathroom', reg.actions.washHands.source.objDef === 'sink_bathroom');
check('mirror.groom is sourced from bathroom_mirror', reg.actions.groom.source.objDef === 'bathroom_mirror');
check('every new action declares a timeCost (verify-i5 invariant)', Object.values(reg.actions).every(a => a.timeCost && typeof a.timeCost.base === 'number'));
check('all three new requirement checkers exist', Object.values(reg.checkers).every(Boolean));
check("coffee_maker's affords lists self.brew", reg.affords.coffeeMaker.includes('self.brew'));
check("trash_kitchen's affords lists trash.take_out (alongside the still-unwired clean.object)", reg.affords.trashKitchen.includes('trash.take_out') && reg.affords.trashKitchen.includes('clean.object'));
check("toilet's affords lists both toilet.use and toilet.clean", reg.affords.toilet.includes('toilet.use') && reg.affords.toilet.includes('toilet.clean'));
check("sink_bathroom's affords lists sink.wash_hands", reg.affords.sinkBathroom.includes('sink.wash_hands'));
check("bathroom_mirror's affords lists mirror.groom", reg.affords.bathroomMirror.includes('mirror.groom'));
check('ACTION_TUNING carries real positive numbers for every new verb', Object.values(reg.tuning).every(v => typeof v === 'number' && v > 0), JSON.stringify(reg.tuning));

// ---------------------------------------------------------------- 1
console.log('\n1. self.brew — hasCoffeeBeans gate, real ingredient consumption (kitchenSources/ingredientDestroyLines reuse), real dish_fresh_coffee spawn');
const brew = J(`(() => {
  const g = __mk(1, 1);
  const ctx = __ctx(g, 'kitchen');
  g.player.inventory = [];
  const gateNoBeans = ACTION_REQUIREMENT_CHECKERS.hasCoffeeBeans(ctx);
  g.player.inventory = [{ defId: 'coffee_beans', qty: 2 }];
  const gateWithBeans = ACTION_REQUIREMENT_CHECKERS.hasCoffeeBeans(ctx);
  const prepared = prepareBrew(ctx);
  const lines = buildBrewEffects(ctx, prepared);
  applyEffects(parseEffectDSL(lines.join('\\n')), ctx);
  const beansLeft = (g.player.inventory.find(s => s.defId === 'coffee_beans')?.qty) || 0;
  const fridge = __objByDef(g, 'kitchen', 'fridge');
  const coffeeQty = fridge ? (fridge.contents || []).filter(s => s.defId === 'dish_fresh_coffee').reduce((a,s)=>a+s.qty,0)
    : g.player.inventory.filter(s => s.defId === 'dish_fresh_coffee').reduce((a,s)=>a+s.qty,0);
  const narration = brewNarration(ctx, prepared);
  return { gateNoBeans, gateWithBeans, lines, beansLeft, coffeeQty, narration, hasFridge: !!fridge };
})()`);
check('no beans on hand blocks the chip', brew.gateNoBeans !== true, JSON.stringify(brew.gateNoBeans));
check('beans on hand open the chip', brew.gateWithBeans === true);
check('brewing destroys exactly 1 coffee_beans (reuses ingredientDestroyLines, same as self.cook)', brew.beansLeft === 1, JSON.stringify(brew));
check('brewing spawns exactly 1 dish_fresh_coffee into the fridge (or the bag with none)', brew.coffeeQty === 1, JSON.stringify(brew));
check('narration confirms the brew', /brew/i.test(brew.narration));

// no-beans cancel path
const brewCancel = J(`(() => {
  const g = __mk(2, 1);
  const ctx = __ctx(g, 'kitchen');
  g.player.inventory = [];
  const prepared = prepareBrew(ctx);
  const lines = buildBrewEffects(ctx, prepared);
  return { cancelled: prepared.cancelled, lines };
})()`);
check('prepareBrew cancels cleanly with no beans, buildBrewEffects returns no lines', brewCancel.cancelled === true && brewCancel.lines.length === 0, JSON.stringify(brewCancel));

// ---------------------------------------------------------------- 2
console.log('\n2. trash.take_out — closes the loop on the pre-existing (NPC-eat-drive-written) fill/rotten_food states');
const trash = J(`(() => {
  const g = __mk(3, 1);
  const ctx = __ctx(g, 'kitchen');
  const bin = __objByDef(g, 'kitchen', 'trash_kitchen');
  const gateEmpty = ACTION_REQUIREMENT_CHECKERS.trashNeedsTakingOut(ctx);
  bin.state = { ...bin.state, fill: 'full', rotten_food: 'rotten' };
  const gateFull = ACTION_REQUIREMENT_CHECKERS.trashNeedsTakingOut(ctx);
  const cleanBefore = refreshRoomCleanliness(g, 'kitchen');
  const prepared = prepareTrashOut(ctx);
  const lines = buildTrashOutEffects(ctx, prepared);
  applyEffects(parseEffectDSL(lines.join('\\n')), ctx);
  const cleanAfter = refreshRoomCleanliness(g, 'kitchen');
  const gateAfter = ACTION_REQUIREMENT_CHECKERS.trashNeedsTakingOut(ctx);
  return { gateEmpty, gateFull, fillAfter: bin.state.fill, rottenAfter: bin.state.rotten_food, cleanBefore, cleanAfter, gateAfter };
})()`);
check('an empty bin blocks the chip', trash.gateEmpty !== true, JSON.stringify(trash.gateEmpty));
check('a full, rotten bin opens the chip', trash.gateFull === true);
check('taking out the trash resets both fill and rotten_food', trash.fillAfter === 'empty' && trash.rottenAfter === 'none', JSON.stringify(trash));
check('refreshRoomCleanliness (the real reader) picks up the reset — cleanliness rises', trash.cleanAfter > trash.cleanBefore, JSON.stringify(trash));
check('the gate closes again once emptied', trash.gateAfter !== true, JSON.stringify(trash.gateAfter));

// ---------------------------------------------------------------- 3
console.log('\n3. toilet.use / toilet.clean — closes the loop on a dirtyWhen state that had NO writer anywhere before this phase');
const toilet = J(`(() => {
  const g = __mk(4, 1);
  g.player.location = 'bathroom_a';
  const ctx = __ctx(g, 'bathroom_a');
  const t = __objByDef(g, 'bathroom_a', 'toilet');
  const startClean = t.state.clean;
  const gateDirtyBefore = ACTION_REQUIREMENT_CHECKERS.toiletDirty(ctx);
  g.player.hygiene = 50; // headroom below the 100 cap so the restore is observable
  const hygieneBefore = g.player.hygiene;
  const usePrepared = prepareToiletUse(ctx);
  const useLines = buildToiletUseEffects(ctx, usePrepared);
  applyEffects(parseEffectDSL(useLines.join('\\n')), ctx);
  const afterUseState = t.state.clean;
  const hygieneAfter = g.player.hygiene;
  const gateDirtyAfterUse = ACTION_REQUIREMENT_CHECKERS.toiletDirty(ctx);
  const useNarration = toiletUseNarration(ctx, usePrepared);
  const cleanPrepared = prepareToiletClean(ctx);
  const cleanLines = buildToiletCleanEffects(ctx, cleanPrepared);
  applyEffects(parseEffectDSL(cleanLines.join('\\n')), ctx);
  const afterCleanState = t.state.clean;
  const gateDirtyAfterClean = ACTION_REQUIREMENT_CHECKERS.toiletDirty(ctx);
  const cleanNarration = toiletCleanNarration(ctx, cleanPrepared);
  return { startClean, gateDirtyBefore, hygieneBefore, afterUseState, hygieneAfter, gateDirtyAfterUse, useNarration, afterCleanState, gateDirtyAfterClean, cleanNarration };
})()`);
check('toilet starts clean', toilet.startClean === 'clean', JSON.stringify(toilet.startClean));
check('Clean the Toilet is not offered on a clean toilet', toilet.gateDirtyBefore !== true);
check('using the toilet dirties it (the previously dead write path)', toilet.afterUseState === 'dirty', JSON.stringify(toilet));
check('using the toilet restores hygiene by exactly toiletHygieneGain', toilet.hygieneAfter === toilet.hygieneBefore + J('ACTION_TUNING.toiletHygieneGain'), JSON.stringify(toilet));
check('the toiletDirty gate now opens', toilet.gateDirtyAfterUse === true);
check('use narration mentions the toilet', /toilet/i.test(toilet.useNarration));
check('cleaning the toilet resets it to clean', toilet.afterCleanState === 'clean', JSON.stringify(toilet));
check('the gate closes again after cleaning', toilet.gateDirtyAfterClean !== true);
check('clean narration confirms the scrub', /clean|scrub/i.test(toilet.cleanNarration));

// ---------------------------------------------------------------- 4
console.log('4. sink.wash_hands / mirror.groom — flat hygiene/mood beats (no object-state loop; neither object carries a use-driven dirtyWhen)');
const flat = J(`({
  washHandsEffects: ACTION_DEFS['sink.wash_hands'].effects,
  groomEffects: ACTION_DEFS['mirror.groom'].effects,
})`);
check('wash hands restores hygiene by exactly washHandsHygieneGain', flat.washHandsEffects.some(l => l === `ADJUST_NEED player hygiene +${J('ACTION_TUNING.washHandsHygieneGain')}`), JSON.stringify(flat.washHandsEffects));
check('grooming restores hygiene by exactly groomHygieneGain', flat.groomEffects.some(l => l === `ADJUST_NEED player hygiene +${J('ACTION_TUNING.groomHygieneGain')}`), JSON.stringify(flat.groomEffects));
check('grooming pushes a mood impulse by exactly groomMoodGain (the whole "appearance/confidence" hook — D19, see config.js)', flat.groomEffects.some(l => l === `ADJUST_NEED player mood +${J('ACTION_TUNING.groomMoodGain')}`), JSON.stringify(flat.groomEffects));

// ---------------------------------------------------------------- 5
console.log("5. Grooming's mood impulse is real and reachable through the SAME decaying-impulse pipeline every other mood source uses (invariant 6 — a real reader, not an orphan field)");
const impulse = J(`(() => {
  const g = __mk(5, 1);
  g.player.location = 'bathroom_a';
  const before = (g.player.moodEvents || []).length;
  const ctx = { gameState: g, roomId: 'bathroom_a', roomObjects: g.objects['room_bathroom_a'] || {}, presentNpcIds: [] };
  applyEffects(parseEffectDSL(ACTION_DEFS['mirror.groom'].effects.join('\\n')), ctx);
  const after = (g.player.moodEvents || []).length;
  return { before, after };
})()`);
check('grooming actually pushes a new decaying mood impulse (pushMoodImpulse), not a dead write', impulse.after > impulse.before, JSON.stringify(impulse));

// ---------------------------------------------------------------- summary
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
