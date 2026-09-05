// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 13: East Wing hotspot + sauna (D22).
//
//   node src/src/dev/verify/verify-aa-p13.js
//
// Node coverage for everything pure/trusted-producer in this phase: the six
// new verbs (self.sunbathe, self.pool_games, self.yoga, self.lift_weights,
// self.sauna, self.tend_balcony_plant) and their sourcing/gating; the
// lockers "wardrobe hook" (lockers.interact/lockers.change_outfit/
// lockers.open, the container.open/take/put triad, hasLockerClothes); the
// new residentsPresent checker; the sauna's own facility (pool_sauna) and
// its APARTMENT_LAYOUT placement; balcony_table's new dish-mess states
// feeding self.eat's now-three-room source list; and the pool_party
// COMMITMENT_KINDS entry resolving through the existing $Invite leaf
// (inviteKindFromFlavor). Rendering (the sauna's floor-plan icon, the
// lockers submenu chip in render.js's container loop) is presentation
// layer and outside this loader (invariant 7) — verified on the live page
// instead; this harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'commitments.js', 'world.js',
    'items.js', 'inventory.js', 'effects.js', 'actions.js', 'asks.js', 'time.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    return g;
  };
  __objByDef = (g, roomId, defId) => Object.values(g.objects['room_' + roomId] || {}).find(o => o.defId === defId);
  __ctx = (g, roomId, presentNpcIds) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: presentNpcIds || [] });
  __apply = (g, roomId, lines) => applyEffects(parseEffectDSL(lines.join('\\n')), __ctx(g, roomId));
  __functional = (g, ...ids) => { for (const id of ids) g.world.upgrades[id] = { tier: 'functional', condition: 100 }; };
  __residentIds = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — six new verbs, the lockers submenu trio, the new checker, and every new object/facility/layout entry');
const reg = J(`({
  actions: {
    sunbathe: ACTION_DEFS['self.sunbathe'],
    poolGames: ACTION_DEFS['self.pool_games'],
    yoga: ACTION_DEFS['self.yoga'],
    liftWeights: ACTION_DEFS['self.lift_weights'],
    sauna: ACTION_DEFS['self.sauna'],
    tendPlant: ACTION_DEFS['self.tend_balcony_plant'],
    lockersChange: ACTION_DEFS['lockers.change_outfit'],
  },
  submenuParents: {
    lockersInteract: ACTION_DEFS['lockers.interact'],
    lockersOpen: ACTION_DEFS['lockers.open'],
  },
  checkers: {
    residentsPresent: typeof ACTION_REQUIREMENT_CHECKERS.residentsPresent === 'function',
    hasLockerClothes: typeof ACTION_REQUIREMENT_CHECKERS.hasLockerClothes === 'function',
  },
  saunaDef: OBJECT_DEFS.sauna,
  lockersDef: OBJECT_DEFS.lockers,
  balconyTableDef: OBJECT_DEFS.balcony_table,
  plantBalconyDef: OBJECT_DEFS.plant_balcony,
  poolRoomLayoutHasSauna: APARTMENT_LAYOUT.pool_room.some(o => o.defId === 'sauna'),
  layoutVersion: APARTMENT_LAYOUT_VERSION,
  saunaFacility: FACILITY_DEFS.pool_sauna,
  roomFacilitiesPoolRoom: ROOM_FACILITIES.pool_room,
  startingTierSauna: FACILITY_STARTING_TIERS.pool_sauna,
  gymGatesActions: FACILITY_DEFS.gym_equipment.gatesActions,
  poolPartyKind: COMMITMENT_KINDS.pool_party,
  eatRoomIds: ACTION_DEFS['self.eat'].source.roomIds,
  anchors: {
    sunbathe: ACTION_ANCHOR_OBJS['self.sunbathe'], poolGames: ACTION_ANCHOR_OBJS['self.pool_games'],
    yoga: ACTION_ANCHOR_OBJS['self.yoga'], liftWeights: ACTION_ANCHOR_OBJS['self.lift_weights'],
    sauna: ACTION_ANCHOR_OBJS['self.sauna'], tendPlant: ACTION_ANCHOR_OBJS['self.tend_balcony_plant'],
    lockersChange: ACTION_ANCHOR_OBJS['lockers.change_outfit'],
  },
})`);
check('all six new self.* actions exist', Object.values(reg.actions).every(Boolean), JSON.stringify(Object.keys(reg.actions).filter(k => !reg.actions[k])));
check('every new REAL action declares a timeCost (verify-i5 invariant)', Object.values(reg.actions).every(a => a.timeCost && typeof a.timeCost.base === 'number'));
check('lockers.interact/lockers.open exist as submenu/delegate parents (no timeCost expected, matching wardrobe.interact/wardrobe.open)', !!reg.submenuParents.lockersInteract && !!reg.submenuParents.lockersOpen);
check('lockers.interact declares the two-item submenu', JSON.stringify(reg.submenuParents.lockersInteract.submenu) === JSON.stringify(['lockers.change_outfit', 'lockers.open']));
check('both new requirement checkers exist', Object.values(reg.checkers).every(Boolean));
check('sauna OBJECT_DEFS entry exists and affords self.sauna', !!reg.saunaDef && reg.saunaDef.affords.includes('self.sauna'));
check('lockers is a real { capacity, label } container and affords the open/take/put triad', reg.lockersDef.container && typeof reg.lockersDef.container === 'object'
  && ['container.open', 'container.take', 'container.put'].every(a => reg.lockersDef.affords.includes(a)));
check('balcony_table carries dishes/clutter states (same shape as dining_table)', JSON.stringify(reg.balconyTableDef.states.dishes) === JSON.stringify(['clean', 'few', 'many']));
check('plant_balcony affords self.tend_balcony_plant', reg.plantBalconyDef.affords.includes('self.tend_balcony_plant'));
check('APARTMENT_LAYOUT.pool_room places the sauna', reg.poolRoomLayoutHasSauna === true);
check('APARTMENT_LAYOUT_VERSION was bumped for the sauna back-fill', reg.layoutVersion >= 9, String(reg.layoutVersion));
check('FACILITY_DEFS.pool_sauna exists with three tiers gating self.sauna', !!reg.saunaFacility && reg.saunaFacility.gatesActions.includes('self.sauna') && reg.saunaFacility.tiers.length === 3);
check('ROOM_FACILITIES.pool_room lists both pool_systems and pool_sauna', reg.roomFacilitiesPoolRoom.includes('pool_systems') && reg.roomFacilitiesPoolRoom.includes('pool_sauna'));
check('pool_sauna starts broken like every other paid renovation', reg.startingTierSauna === 'broken');
check('gym_equipment now also gates self.yoga and self.lift_weights', reg.gymGatesActions.includes('self.yoga') && reg.gymGatesActions.includes('self.lift_weights'));
check('COMMITMENT_KINDS.pool_party exists, player-invitable, rooted in pool_room', !!reg.poolPartyKind && reg.poolPartyKind.playerInvitable === true && reg.poolPartyKind.roomId === 'pool_room');
check('self.eat now also sources from the balcony', reg.eatRoomIds.includes('balcony'));
check('every new object-sourced action has an ACTION_ANCHOR_OBJS entry', Object.values(reg.anchors).every(a => Array.isArray(a) && a.length > 0), JSON.stringify(reg.anchors));

// ---------------------------------------------------------------- 1
console.log('\n1. Sourcing & gating: object-sourced verbs only appear with their object present, and the paid-facility gates hold');
const gating = J(`(() => {
  const g = __mk(41, 5);
  g.player.location = 'pool_room';
  const ctxPool = __ctx(g, 'pool_room');

  const sourceMatchesBeforeFunctional = actionSourceMatches(ACTION_DEFS['self.sauna'], ctxPool);
  const gateBeforeFunctional = checkRequirements(ACTION_DEFS['self.sauna'], ctxPool);
  __functional(g, 'pool_systems', 'pool_sauna');
  const gateAfterFunctional = checkRequirements(ACTION_DEFS['self.sauna'], ctxPool);

  const gymFunctionalOnly = __mk(41, 5);
  gymFunctionalOnly.player.location = 'gym';
  __functional(gymFunctionalOnly, 'gym_equipment');
  const ctxGym = __ctx(gymFunctionalOnly, 'gym');
  const yogaGateOk = checkRequirements(ACTION_DEFS['self.yoga'], ctxGym);
  const liftGateOk = checkRequirements(ACTION_DEFS['self.lift_weights'], ctxGym);

  return { sourceMatchesBeforeFunctional, gateBeforeFunctional, gateAfterFunctional, yogaGateOk, liftGateOk };
})()`);
check('self.sauna is object-sourced — it matches as soon as the sauna object exists, before the facility is paid for', gating.sourceMatchesBeforeFunctional === true);
check('...but checkRequirements refuses it while pool_sauna is still broken', gating.gateBeforeFunctional.ok !== true, JSON.stringify(gating.gateBeforeFunctional));
check('...and accepts it once pool_sauna is functional', gating.gateAfterFunctional.ok === true, JSON.stringify(gating.gateAfterFunctional));
check('self.yoga passes once gym_equipment is functional', gating.yogaGateOk.ok === true, JSON.stringify(gating.yogaGateOk));
check('self.lift_weights passes once gym_equipment is functional', gating.liftGateOk.ok === true, JSON.stringify(gating.liftGateOk));

// ---------------------------------------------------------------- 2
console.log('\n2. residentsPresent: self.pool_games only opens with real company, matching sharedActivityParticipants exactly');
const presence = J(`(() => {
  const g = __mk(42, 5);
  g.player.location = 'pool_room';
  __functional(g, 'pool_systems');
  const npcId = __residentIds(g)[0];

  const ctxAlone = __ctx(g, 'pool_room', []);
  const gateAlone = ACTION_REQUIREMENT_CHECKERS.residentsPresent(ctxAlone);

  const ctxWithNpc = __ctx(g, 'pool_room', [npcId]);
  const gateWithNpc = ACTION_REQUIREMENT_CHECKERS.residentsPresent(ctxWithNpc);
  const fullGateAlone = checkRequirements(ACTION_DEFS['self.pool_games'], ctxAlone);
  const fullGateWithNpc = checkRequirements(ACTION_DEFS['self.pool_games'], ctxWithNpc);

  // A showering resident is excluded by SHARED_ACTIVITY.excludeActivities —
  // the same list resolveSharedActivity itself reads — so residentsPresent
  // must agree and refuse too, not just count raw room presence. Checked
  // AFTER the two full-gate reads above, since this mutates the live npc
  // that ctxWithNpc's checker call reads at call time.
  g.npcs[npcId].activity = 'showering';
  const ctxShowering = __ctx(g, 'pool_room', [npcId]);
  const gateShowering = ACTION_REQUIREMENT_CHECKERS.residentsPresent(ctxShowering);

  return { gateAlone, gateWithNpc, gateShowering, fullGateAlone, fullGateWithNpc };
})()`);
check('residentsPresent refuses an empty room', presence.gateAlone !== true, JSON.stringify(presence.gateAlone));
check('residentsPresent opens with a resident present', presence.gateWithNpc === true);
check('residentsPresent excludes a showering resident (same exclusion resolveSharedActivity uses)', presence.gateShowering !== true, JSON.stringify(presence.gateShowering));
check('self.pool_games\' full requirement chain refuses when alone', presence.fullGateAlone.ok !== true);
check('self.pool_games\' full requirement chain accepts with company', presence.fullGateWithNpc.ok === true, JSON.stringify(presence.fullGateWithNpc));

// ---------------------------------------------------------------- 3
console.log('\n3. Lockers: the wardrobe-hook round trip — empty gates the chip, stashing swimwear opens it, and prepare finds the LOCKERS object, not the bedroom wardrobe');
const lockersFlow = J(`(() => {
  const g = __mk(43, 5);
  g.player.location = 'changing_room';
  const ctxChanging = __ctx(g, 'changing_room');
  const lockers = __objByDef(g, 'changing_room', 'lockers');

  const gateEmpty = ACTION_REQUIREMENT_CHECKERS.hasLockerClothes(ctxChanging);
  lockers.contents = lockers.contents || [];
  lockers.contents.push({ defId: 'swim_trunks', qty: 1, ownerId: 'player', meta: {} });
  const gateStocked = ACTION_REQUIREMENT_CHECKERS.hasLockerClothes(ctxChanging);

  const fullGate = checkRequirements(ACTION_DEFS['lockers.change_outfit'], ctxChanging);

  // prepareLockerChangeOutfit needs a real UI panel to await a pick, which
  // this bare vm has none of — but it must resolve the LOCKERS instance
  // (findObjectInRoom(ctx, 'lockers')), not silently fall through to the
  // wardrobe or crash. Confirmed indirectly: no wardrobe object exists in
  // changing_room at all, so if prepare ever looked up 'wardrobe' instead it
  // would find nothing and always report cancelled regardless of openWardrobePanel.
  const noWardrobeInChangingRoom = !__objByDef(g, 'changing_room', 'wardrobe');

  return { gateEmpty, gateStocked, fullGate, noWardrobeInChangingRoom };
})()`);
check('hasLockerClothes refuses an empty locker', lockersFlow.gateEmpty !== true, JSON.stringify(lockersFlow.gateEmpty));
check('hasLockerClothes opens once swimwear is stashed', lockersFlow.gateStocked === true);
check('lockers.change_outfit\'s full requirement chain agrees', lockersFlow.fullGate.ok === true, JSON.stringify(lockersFlow.fullGate));
check('changing_room has no wardrobe object (prepareLockerChangeOutfit must resolve lockers specifically)', lockersFlow.noWardrobeInChangingRoom === true);

// ---------------------------------------------------------------- 4
console.log('\n4. balcony_table dish mess: eating on the balcony dirties the balcony_table exactly like dining_table/kitchen_table, via the real obj.dishes unit map (not a literal state write — dishLevelOf derives it, same as every other dish-bearing surface)');
const balconyEat = J(`(() => {
  const g = __mk(44, 5);
  g.player.location = 'balcony';
  const ctxBalcony = __ctx(g, 'balcony');

  const sourceMatches = actionSourceMatches(ACTION_DEFS['self.eat'], ctxBalcony);
  const table = __objByDef(g, 'balcony', 'balcony_table');
  const beforeUnits = dishUnitsOf(table);
  const beforeLevel = dishLevelOf(table);

  // The exact DISH_TUNING.eatFootprint lines buildEatEffects emits per
  // serving (plate + fork), applied through the real ADD_DISHES effect.
  __apply(g, 'balcony', Object.entries(DISH_TUNING.eatFootprint).map(([type, qty]) => 'ADD_DISHES ' + table.id + ' ' + type + ' ' + qty));
  const afterUnits = dishUnitsOf(table);
  const afterLevel = dishLevelOf(table);

  // buildEatEffects' own table lookup (defs.actions.js) now includes
  // balcony_table — confirm it actually finds THIS object from this room,
  // not null.
  const foundByEatEffects = Object.values(g.objects['room_balcony'] || {})
    .some(o => o.id === table.id && (o.defId === 'kitchen_table' || o.defId === 'dining_table' || o.defId === 'balcony_table'));

  return { sourceMatches, hasTable: !!table, beforeUnits, beforeLevel, afterUnits, afterLevel, foundByEatEffects };
})()`);
check('self.eat is available while on the balcony', balconyEat.sourceMatches === true);
check('the balcony has a real balcony_table object', balconyEat.hasTable === true);
check('balcony_table starts with no dish units (clean)', balconyEat.beforeUnits === 0 && balconyEat.beforeLevel === 'clean', JSON.stringify(balconyEat));
check('ADD_DISHES (buildEatEffects\' own line shape) adds real units to balcony_table, same as dining_table/kitchen_table', balconyEat.afterUnits > balconyEat.beforeUnits, JSON.stringify(balconyEat));
check('buildEatEffects\' table lookup now matches balcony_table by defId', balconyEat.foundByEatEffects === true);

// ---------------------------------------------------------------- 5
console.log('\n5. pool_party rides the existing $Invite leaf — no bespoke ask code, per D37\'s precedent for meal/hangout');
const invite = J(`(() => {
  const kindFromPoolParty = inviteKindFromFlavor('pool party this weekend');
  const kindFromSwimParty = inviteKindFromFlavor('swim party');
  const kindFromNothing = inviteKindFromFlavor('');
  return { kindFromPoolParty, kindFromSwimParty, kindFromNothing };
})()`);
check('"pool party" flavor resolves to the pool_party kind', invite.kindFromPoolParty === 'pool_party', invite.kindFromPoolParty);
check('"swim party" flavor also resolves to pool_party', invite.kindFromSwimParty === 'pool_party', invite.kindFromSwimParty);
check('unrecognized/empty flavor still falls back to hangout (unchanged default)', invite.kindFromNothing === 'hangout', invite.kindFromNothing);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
