// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 11: Laundry chain + Snoop (D20).
//
//   node src/src/dev/verify/verify-aa-p11.js
//
// Node coverage for everything pure/trusted-producer in this phase: the four
// new verbs (self.laundry rewritten + dryer.dry/fold/putaway) and their
// requirement checkers; the four new trusted effects (MOVE_GARMENTS/
// START_LAUNDRY_CYCLE/FOLD_GARMENTS/PUTAWAY_GARMENTS); the full physical
// chain dirty -> washed -> dried -> folded -> stored, including a garment
// actually becoming wearable again once put away; the day-rollover wear
// mechanic (processLaundryWearForDay); the laundry snoop stealth mechanic
// (resolveLaundrySnoop, witnessed vs unwitnessed, stealth XP on the clean
// branch); and the NPC/maid chore fix (runHamperIntoWasher) that stops the
// old blind fill-flag reset from deleting real dirty garments. Presentation
// (the chips, the Snoop chip's room gate) is UI and would be verified on the
// live page per invariant 7; this harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'world.js',
    'items.js', 'stealth.js', 'skills.js', 'drives.js', 'computer.js'],
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
    g.player.location = 'laundry';
    return g;
  };
  __objByDef = (g, roomId, defId) => Object.values(g.objects['room_' + roomId] || {}).find(o => o.defId === defId);
  __ctx = (g, roomId) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: [] });
  __apply = (g, roomId, lines) => applyEffects(parseEffectDSL(lines.join('\\n')), __ctx(g, roomId));
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — all four verbs, four checkers, four trusted effects, dryer.affords updated');
const reg = J(`({
  actions: {
    wash: ACTION_DEFS['self.laundry'],
    dry: ACTION_DEFS['dryer.dry'],
    fold: ACTION_DEFS['dryer.fold'],
    putaway: ACTION_DEFS['dryer.putaway'],
  },
  checkers: {
    washerReadyToWash: typeof ACTION_REQUIREMENT_CHECKERS.washerReadyToWash === 'function',
    dryerReadyForLoad: typeof ACTION_REQUIREMENT_CHECKERS.dryerReadyForLoad === 'function',
    dryerLoadReadyToFold: typeof ACTION_REQUIREMENT_CHECKERS.dryerLoadReadyToFold === 'function',
    foldedLaundryReady: typeof ACTION_REQUIREMENT_CHECKERS.foldedLaundryReady === 'function',
  },
  effects: {
    moveGarments: EFFECT_DEFS.MOVE_GARMENTS && EFFECT_DEFS.MOVE_GARMENTS.implemented,
    startCycle: EFFECT_DEFS.START_LAUNDRY_CYCLE && EFFECT_DEFS.START_LAUNDRY_CYCLE.implemented,
    fold: EFFECT_DEFS.FOLD_GARMENTS && EFFECT_DEFS.FOLD_GARMENTS.implemented,
    putaway: EFFECT_DEFS.PUTAWAY_GARMENTS && EFFECT_DEFS.PUTAWAY_GARMENTS.implemented,
  },
  dryerAffords: OBJECT_DEFS.dryer.affords,
  gatesActions: FACILITY_DEFS.laundry_machines.gatesActions,
  tuning: { wash: LAUNDRY_TUNING.washCycleMinutes, dry: LAUNDRY_TUNING.dryCycleMinutes,
    fold: LAUNDRY_TUNING.foldMinutes, putaway: LAUNDRY_TUNING.putawayMinutes },
})`);
check('all four ACTION_DEFS entries exist', Object.values(reg.actions).every(Boolean), JSON.stringify(Object.keys(reg.actions).filter(k => !reg.actions[k])));
check('every new/changed action declares a timeCost (verify-i5 invariant)', Object.values(reg.actions).every(a => a.timeCost && typeof a.timeCost.base === 'number'));
check('all four new requirement checkers exist', Object.values(reg.checkers).every(Boolean));
check('all four new trusted effects are registered and implemented', Object.values(reg.effects).every(Boolean), JSON.stringify(reg.effects));
check("dryer's affords lists all three of its new verbs", ['dryer.dry', 'dryer.fold', 'dryer.putaway'].every(a => reg.dryerAffords.includes(a)));
check('laundry_machines facility gates both self.laundry and dryer.dry', reg.gatesActions.includes('self.laundry') && reg.gatesActions.includes('dryer.dry'));
check('LAUNDRY_TUNING carries real positive minute values', Object.values(reg.tuning).every(v => typeof v === 'number' && v > 0), JSON.stringify(reg.tuning));

// ---------------------------------------------------------------- 1
console.log('\n1. The full physical chain: dirty -> washed -> dried -> folded -> stored, and the garment becomes wearable again');
const chain = J(`(() => {
  const g = __mk(11, 1);
  const npcId = Object.keys(g.npcs)[0];
  const hamper = __objByDef(g, 'laundry', 'laundry_hamper');
  const washer = __objByDef(g, 'laundry', 'washer');
  const dryer = __objByDef(g, 'laundry', 'dryer');
  // Seed one dirty garment owned by the player straight into the hamper —
  // isolates the wash/dry/fold/putaway chain from the separate day-rollover
  // dirtying mechanism, which section 3 below tests on its own.
  hamper.contents = [{ defId: 'hoodie', qty: 1, ownerId: 'player', meta: { laundryState: 'dirty' } }];
  hamper.state = { ...hamper.state, fill: hamperFillLevel(hamper) };
  // Isolated from the starter wardrobe's own (randomly-seeded) contents —
  // this section only cares about the wash/dry/fold/putaway chain, not
  // where the garment started. A deliberately near-empty wardrobe also
  // guarantees Put Away has room, so a capacity refusal can't masquerade
  // as a chain bug.
  const wardrobe = __objByDef(g, 'bedroom_player', 'wardrobe');
  wardrobe.contents = [];

  const fillDirty = hamper.state.fill;
  const ctxLaundry = __ctx(g, 'laundry');
  const washGateBefore = ACTION_REQUIREMENT_CHECKERS.washerReadyToWash(ctxLaundry);
  const washPrepared = prepareLaundry(ctxLaundry);
  __apply(g, 'laundry', buildLaundryEffects(ctxLaundry, washPrepared));
  const inWasherAfterWash = (washer.contents || []).some(s => s.defId === 'hoodie' && laundryStateOf(s) === 'dirty');
  const hamperEmptyAfterWash = (hamper.contents || []).length === 0;
  const fillAfterWash = hamper.state.fill;
  const washRunning = laundryCycleProgress(washer, gameDaysNow(g.meta.clock)) === 'running';
  const dryGateWhileWashing = ACTION_REQUIREMENT_CHECKERS.dryerReadyForLoad(ctxLaundry);

  // Force the wash cycle's anchor into the past — same "advance the lazy
  // clock" trick used by the dishwasher's own tests — instead of simulating
  // real elapsed game time tick by tick.
  washer.laundry.cycleActiveUntilAbs = 0.0001;
  const dryGateReady = ACTION_REQUIREMENT_CHECKERS.dryerReadyForLoad(ctxLaundry);
  const washedInWasher = (washer.contents || []).some(s => s.defId === 'hoodie' && laundryStateOf(s) === 'washed');

  const dryPrepared = prepareDryerDry(ctxLaundry);
  __apply(g, 'laundry', buildDryerDryEffects(ctxLaundry, dryPrepared));
  const inDryerAfterDry = (dryer.contents || []).some(s => s.defId === 'hoodie' && laundryStateOf(s) === 'washed');
  const washerEmptyAfterDry = (washer.contents || []).length === 0;
  const foldGateWhileDrying = ACTION_REQUIREMENT_CHECKERS.dryerLoadReadyToFold(ctxLaundry);

  dryer.laundry.cycleActiveUntilAbs = 0.0001;
  const foldGateReady = ACTION_REQUIREMENT_CHECKERS.dryerLoadReadyToFold(ctxLaundry);
  const driedInDryer = (dryer.contents || []).some(s => s.defId === 'hoodie' && laundryStateOf(s) === 'dried');

  const foldPrepared = prepareDryerFold(ctxLaundry);
  __apply(g, 'laundry', buildDryerFoldEffects(ctxLaundry, foldPrepared));
  const foldedInDryer = (dryer.contents || []).some(s => s.defId === 'hoodie' && laundryStateOf(s) === 'folded');
  const putawayGateReady = ACTION_REQUIREMENT_CHECKERS.foldedLaundryReady(ctxLaundry);

  const moodBefore = (g.player.moodEvents || []).length;
  const putawayPrepared = prepareDryerPutaway(ctxLaundry);
  __apply(g, 'laundry', buildDryerPutawayEffects(ctxLaundry, putawayPrepared));
  const dryerEmptyAfterPutaway = (dryer.contents || []).length === 0;
  const hoodieInWardrobeAfter = (wardrobe.contents || []).find(s => s.defId === 'hoodie' && laundryStateOf(s) === 'stored');
  const hoodieFoundInWardrobe = !!hoodieInWardrobeAfter;
  const moodAfter = (g.player.moodEvents || []).length;

  return {
    fillDirty, washGateBefore,
    inWasherAfterWash, hamperEmptyAfterWash, fillAfterWash, washRunning, dryGateWhileWashing,
    dryGateReady, washedInWasher,
    inDryerAfterDry, washerEmptyAfterDry, foldGateWhileDrying,
    foldGateReady, driedInDryer,
    foldedInDryer, putawayGateReady,
    dryerEmptyAfterPutaway, hoodieFoundInWardrobe,
    hoodieOwnerIdAfter: hoodieInWardrobeAfter ? hoodieInWardrobeAfter.ownerId : 'MISSING',
    moodBefore, moodAfter,
  };
})()`);
check('hamper reads partial/full once a dirty garment sits in it', chain.fillDirty === 'partial' || chain.fillDirty === 'full', chain.fillDirty);
check('washerReadyToWash opens on an idle, empty washer', chain.washGateBefore === true);
check('Wash moves the dirty garment into the washer', chain.inWasherAfterWash === true);
check('Wash empties the hamper of what it took', chain.hamperEmptyAfterWash === true);
check("hamper.state.fill is derived back to 'empty' after Wash", chain.fillAfterWash === 'empty');
check('the wash cycle is actually running right after Wash', chain.washRunning === true);
check('Dry is blocked while the wash cycle is still running', chain.dryGateWhileWashing !== true, JSON.stringify(chain.dryGateWhileWashing));
check('Dry opens once the wash cycle resolves as done', chain.dryGateReady === true, JSON.stringify(chain.dryGateReady));
check("the resolved cycle bumped the garment dirty -> 'washed' in place", chain.washedInWasher === true);
check('Dry moves the washed garment into the dryer', chain.inDryerAfterDry === true);
check('Dry empties the washer of what it took', chain.washerEmptyAfterDry === true);
check('Fold is blocked while the dry cycle is still running', chain.foldGateWhileDrying !== true);
check('Fold opens once the dry cycle resolves as done', chain.foldGateReady === true);
check("the resolved dry cycle bumped the garment washed -> 'dried' in place", chain.driedInDryer === true);
check("Fold flips the garment to 'folded' in place (no container move)", chain.foldedInDryer === true);
check('Put Away opens once something is folded', chain.putawayGateReady === true);
check('Put Away empties the dryer of the folded load', chain.dryerEmptyAfterPutaway === true);
check("the garment lands back in the player's wardrobe as 'stored' — wearable again", chain.hoodieFoundInWardrobe === true, JSON.stringify(chain));
check('Put Away nulls ownerId back to the wardrobe convention (implicit-by-location)', chain.hoodieFoundInWardrobe && chain.hoodieOwnerIdAfter === null, JSON.stringify(chain.hoodieOwnerIdAfter));
check('Put Away pushes a real mood impulse (invariant 6 — a real reader, not orphan tuning)', chain.moodAfter > chain.moodBefore, JSON.stringify(chain));

// ---------------------------------------------------------------- 2
console.log('\n2. Day-rollover wear: processLaundryWearForDay dirties exactly the worn outfit, ownerId-stamped, for player and NPC alike');
const wear = J(`(() => {
  const g = __mk(12, 1);
  const npcId = Object.keys(g.npcs)[0];
  const npc = g.npcs[npcId];
  npc.residency = { ...(npc.residency || {}), status: 'resident', room: npc.residency?.room || 'bedroom_a' };
  const npcWardrobe = __objByDef(g, npc.residency.room, 'wardrobe');
  npc.outfit = { top: 'basic_tee', bottom: 'jeans' };
  npcWardrobe.contents = [
    { defId: 'basic_tee', qty: 1, ownerId: null, meta: {} },
    { defId: 'jeans', qty: 1, ownerId: null, meta: {} },
    { defId: 'sweater', qty: 1, ownerId: null, meta: {} },
  ];
  g.player.outfit = { top: 'graphic_tee' };
  const playerWardrobe = __objByDef(g, 'bedroom_player', 'wardrobe');
  playerWardrobe.contents = [{ defId: 'graphic_tee', qty: 1, ownerId: null, meta: {} }];
  const hamper = __objByDef(g, 'laundry', 'laundry_hamper');
  hamper.contents = [];

  processLaundryWearForDay(g, 2);

  const playerDirtyInHamper = hamper.contents.filter(s => s.ownerId === 'player');
  const npcDirtyInHamper = hamper.contents.filter(s => s.ownerId === npcId);
  const untouchedSweaterStillStored = (npcWardrobe.contents || []).some(s => s.defId === 'sweater' && laundryStateOf(s) === 'stored');
  const teeGoneFromNpcWardrobe = !(npcWardrobe.contents || []).some(s => s.defId === 'basic_tee');
  const teeGoneFromPlayerWardrobe = !(playerWardrobe.contents || []).some(s => s.defId === 'graphic_tee');
  return { playerDirtyInHamper, npcDirtyInHamper, untouchedSweaterStillStored, teeGoneFromNpcWardrobe, teeGoneFromPlayerWardrobe, fill: hamper.state.fill };
})()`);
check("the player's one worn slot (graphic_tee) is dirtied into the hamper, owner-stamped 'player'", wear.playerDirtyInHamper.length === 1 && wear.playerDirtyInHamper[0].defId === 'graphic_tee', JSON.stringify(wear.playerDirtyInHamper));
check("the NPC's two worn slots are dirtied into the hamper, owner-stamped with the NPC's own id", wear.npcDirtyInHamper.length === 2, JSON.stringify(wear.npcDirtyInHamper));
check('the NPC garment NOT worn (sweater) stays untouched in their wardrobe', wear.untouchedSweaterStillStored === true);
check("the worn garment is physically gone from the NPC's wardrobe (no longer wearable) until Put Away brings it back", wear.teeGoneFromNpcWardrobe === true);
check("the worn garment is physically gone from the player's wardrobe too", wear.teeGoneFromPlayerWardrobe === true);
check('hamperFillLevel reflects the fresh dirty load', wear.fill === 'partial' || wear.fill === 'full', wear.fill);

// ---------------------------------------------------------------- 3
console.log('\n3. Laundry snoop (D20) — its own P1B-pattern resolver: unwitnessed clean + stealth XP, witnessed caught + grievance, empty pool refuses');
const snoop = J(`(() => {
  const g = __mk(13, 1);
  const npcId = Object.keys(g.npcs)[0];
  const hamper = __objByDef(g, 'laundry', 'laundry_hamper');
  const emptyPoolResult = resolveLaundrySnoop(g);

  hamper.contents = [{ defId: 'bra', qty: 1, ownerId: npcId, meta: { laundryState: 'dirty' } }];
  g.npcs[npcId].location = 'kitchen'; // not present in the laundry room
  const stealthBefore = (g.player.skills || {}).stealth || 0;
  const clean = resolveLaundrySnoop(g);
  const stealthAfter = (g.player.skills || {}).stealth || 0;

  hamper.contents = [{ defId: 'bra', qty: 1, ownerId: npcId, meta: { laundryState: 'dirty' } }];
  g.npcs[npcId].location = 'laundry'; // present — a direct witness
  const grievancesBefore = (g.npcs[npcId].relPlayer?.grievances || []).length;
  const witnessed = resolveLaundrySnoop(g);
  const grievancesAfter = (g.npcs[npcId].relPlayer?.grievances || []).length;

  return { emptyPoolResult, clean, stealthBefore, stealthAfter, witnessed, grievancesBefore, grievancesAfter };
})()`);
check('an empty hamper/washer/dryer refuses cleanly, no crash', snoop.emptyPoolResult.ok === false && !!snoop.emptyPoolResult.reason);
check('the absent-owner branch resolves ok with a real narration', snoop.clean.ok === true && !!snoop.clean.narration, JSON.stringify(snoop.clean));
check('the absent-owner (unwitnessed) branch is never marked caught', snoop.clean.caught === false);
check('a clean snoop awards real stealth XP (P1B/D32 convention, generalized to this new mechanic)', snoop.stealthAfter > snoop.stealthBefore, JSON.stringify({ before: snoop.stealthBefore, after: snoop.stealthAfter }));
check('the present-owner branch is a direct, certain catch', snoop.witnessed.ok === true && snoop.witnessed.caught === true, JSON.stringify(snoop.witnessed));
check('a witnessed catch adds a real grievance (Phase 7/D12 convention)', snoop.grievancesAfter > snoop.grievancesBefore, JSON.stringify(snoop));

// ---------------------------------------------------------------- 4
console.log('\n4. NPC/maid laundry chore fix — runHamperIntoWasher never deletes real dirty garments (the old emptiesHamper bug shape)');
const chore = J(`(() => {
  const g = __mk(14, 1);
  const hamper = __objByDef(g, 'laundry', 'laundry_hamper');
  const washer = __objByDef(g, 'laundry', 'washer');
  hamper.contents = [{ defId: 'jeans', qty: 1, ownerId: 'player', meta: { laundryState: 'dirty' } }];
  const startedWhenFree = runHamperIntoWasher(g, gameDaysNow(g.meta.clock));
  const inWasherAfter = (washer.contents || []).some(s => s.defId === 'jeans');
  const hamperEmptyAfter = (hamper.contents || []).length === 0;

  // Now the washer is already mid-cycle with an unrelated load — a second
  // dirty garment shows up in the hamper (e.g. Phase 11's own wear
  // mechanic). The old code would have reset hamper.state.fill to 'empty'
  // unconditionally here, silently deleting this garment from the world.
  hamper.contents = [{ defId: 'shorts', qty: 1, ownerId: 'player', meta: { laundryState: 'dirty' } }];
  const startedWhileBusy = runHamperIntoWasher(g, gameDaysNow(g.meta.clock));
  const shortsStillInHamper = (hamper.contents || []).some(s => s.defId === 'shorts');

  return { startedWhenFree, inWasherAfter, hamperEmptyAfter, startedWhileBusy, shortsStillInHamper };
})()`);
check('runHamperIntoWasher starts a real load when the washer is free', chore.startedWhenFree === true && chore.inWasherAfter === true && chore.hamperEmptyAfter === true, JSON.stringify(chore));
check('runHamperIntoWasher is a no-op while the washer is busy — it does NOT start a second load', chore.startedWhileBusy === false);
check('a garment left in the hamper while the washer is busy is NOT deleted (the bug this phase fixed)', chore.shortsStillInHamper === true, JSON.stringify(chore));

// ---------------------------------------------------------------- summary
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
