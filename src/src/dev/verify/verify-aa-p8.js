// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 8: Temperature & clothing (D16).
//
//   node src/src/dev/verify/verify-aa-p8.js
//
// Node coverage for everything pure/trusted-producer in this phase:
// ambientTempC/thermostatHvacMultiplier/npcComfortBandC/temperatureDiscomfort/
// temperatureClothingBiasWeight/thermostatSelfAdjustChance (temperature.js),
// the real ADJUST_THERMOSTAT effect wiring (effects.js, not just a standalone
// applier call), the real HVAC billing wiring (computer.js's
// accrueHvacForDay), the real wardrobe wiring (npc.js's npcOutfitForContext,
// not just composeOutfit in isolation), and the real per-tick annoyance/
// complaint/self-adjust wiring (sim.js's resolveTick/resolveBatch — the SAME
// discipline verify-aa-p1b's paired-trial section used for Sneaking).
// Presentation (the thermostat object's chip in the hallway) is UI and is
// verified on the live page per invariant 7 — see the Handoff note for what
// was checked there. This harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'effects.js', 'npc.js', 'computer.js', 'temperature.js'],
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
  __setTarget = (g, c) => { g.world.thermostat = { targetC: c }; return g; };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — the thermostat object/verbs/effect/tuning all exist');
const reg = J(`({
  tuning: THERMOSTAT_TUNING,
  obj: OBJECT_DEFS.thermostat,
  raise: ACTION_DEFS['thermostat.raise'],
  lower: ACTION_DEFS['thermostat.lower'],
  checkers: { above: typeof ACTION_REQUIREMENT_CHECKERS.thermostatAboveMin === 'function', below: typeof ACTION_REQUIREMENT_CHECKERS.thermostatBelowMax === 'function' },
  effect: EFFECT_DEFS.ADJUST_THERMOSTAT,
  fns: {
    ambient: typeof ambientTempC === 'function', hvac: typeof thermostatHvacMultiplier === 'function',
    band: typeof npcComfortBandC === 'function', discomfort: typeof temperatureDiscomfort === 'function',
    bias: typeof temperatureClothingBiasWeight === 'function', selfAdjust: typeof thermostatSelfAdjustChance === 'function',
  },
})`);
check('THERMOSTAT_TUNING is a real config bucket, not inline magic numbers', typeof reg.tuning.neutralC === 'number' && typeof reg.tuning.costPerDegreeC === 'number');
check('the thermostat object exists and affords both verbs', !!reg.obj && reg.obj.affords.includes('thermostat.raise') && reg.obj.affords.includes('thermostat.lower'));
check('both verbs are real object-anchored ACTION_DEFS entries', !!reg.raise && reg.raise.source.objDefs.includes('thermostat') && !!reg.lower && reg.lower.source.objDefs.includes('thermostat'));
check('both requirement checkers exist', reg.checkers.above && reg.checkers.below);
check('ADJUST_THERMOSTAT is a real, trusted-only (llm:false) effect', !!reg.effect && reg.effect.llm === false && reg.effect.implemented === true);
check('all six temperature.js functions exist', Object.values(reg.fns).every(Boolean));

// ---------------------------------------------------------------- 1
console.log('\n1. ambientTempC — seasonal baseline blended toward the thermostat target');
const ambient = J(`(() => {
  const g = __mk(1, 1);   // day 1 = spring
  __setTarget(g, THERMOSTAT_TUNING.defaultC);
  const spring = ambientTempC(g);
  // seasons-and-weather-plan.md Phase 1 (W2) changed the OUTDOOR side of this
  // blend on purpose: it was the flat season value (18 in spring), it is now
  // seasons.js's outdoorTempC (that day's weather and hour; its season MEAN is
  // still 18 — verify-weather.js pins that). The blend formula itself is
  // unchanged, so the exact-match check stands against the live outdoor value.
  const outdoorSpring = typeof outdoorTempC === 'function' ? outdoorTempC(g) : 18;
  const expectedSpring = outdoorSpring + (THERMOSTAT_TUNING.defaultC - outdoorSpring) * THERMOSTAT_TUNING.hvacEfficiency;
  g.meta.clock.day = 106; // winter
  const winterCold = ambientTempC(g);
  __setTarget(g, THERMOSTAT_TUNING.maxC);
  const winterHot = ambientTempC(g);
  return { spring, expectedSpring, winterCold, winterHot };
})()`);
check('spring ambient matches the exact blend formula', Math.abs(ambient.spring - ambient.expectedSpring) < 1e-9, `${ambient.spring} vs ${ambient.expectedSpring}`);
check('raising the thermostat target strictly raises winter ambient', ambient.winterHot > ambient.winterCold, JSON.stringify(ambient));

// ---------------------------------------------------------------- 2
console.log('\n2. thermostatHvacMultiplier — 1.0 at neutral, scales with |delta| either direction, and real billing wiring');
const hvac = J(`(() => {
  const g = __mk(2, 1);
  __setTarget(g, THERMOSTAT_TUNING.neutralC);
  const atNeutral = thermostatHvacMultiplier(g);
  __setTarget(g, THERMOSTAT_TUNING.maxC);
  const hot = thermostatHvacMultiplier(g);
  __setTarget(g, THERMOSTAT_TUNING.minC);
  const cold = thermostatHvacMultiplier(g);
  const expectedHot = 1 + Math.abs(THERMOSTAT_TUNING.maxC - THERMOSTAT_TUNING.neutralC) * THERMOSTAT_TUNING.costPerDegreeC;
  // Real wiring: accrueHvacForDay itself, not just the standalone multiplier.
  const gLow = __mk(3, 1); gLow.world.utilities = { hvac: { count: 0, daysAccrued: 0 } };
  __setTarget(gLow, THERMOSTAT_TUNING.neutralC);
  accrueHvacForDay(gLow, 1);
  const gHigh = __mk(3, 1); gHigh.world.utilities = { hvac: { count: 0, daysAccrued: 0 } };
  __setTarget(gHigh, THERMOSTAT_TUNING.maxC);
  accrueHvacForDay(gHigh, 1);
  return { atNeutral, hot, cold, expectedHot, lowCount: gLow.world.utilities.hvac.count, highCount: gHigh.world.utilities.hvac.count };
})()`);
check('multiplier is exactly 1 at neutralC', hvac.atNeutral === 1, `${hvac.atNeutral}`);
check('multiplier matches the exact formula away from neutral (hot side)', Math.abs(hvac.hot - hvac.expectedHot) < 1e-9);
check('multiplier also rises below neutral (cold side), not just above it', hvac.cold > 1, `${hvac.cold}`);
check('accrueHvacForDay actually bills more at the extreme setting — real wiring, not just the standalone function', hvac.highCount > hvac.lowCount, JSON.stringify(hvac));

// ---------------------------------------------------------------- 3
console.log('\n3. npcComfortBandC — deterministic per NPC, real jitter (not a constant), bounded');
const band = J(`(() => {
  const g = __mk(4, 1);
  const ids = __ids(g);
  const a1 = npcComfortBandC(g.npcs[ids[0]], ids[0]);
  const a2 = npcComfortBandC(g.npcs[ids[0]], ids[0]);
  const b = npcComfortBandC(g.npcs[ids[1]], ids[1]);
  return { a1, a2, b };
})()`);
check('the same NPC gets the same band every call (deterministic, no live rng)', JSON.stringify(band.a1) === JSON.stringify(band.a2));
check('different NPCs get different bands (real per-NPC jitter, not a shared constant)', JSON.stringify(band.a1) !== JSON.stringify(band.b));
check('the band stays within the configured jitter bounds', Math.abs(band.a1.minC - reg.tuning.baseMinC) <= reg.tuning.comfortJitterC && Math.abs(band.a1.maxC - reg.tuning.baseMaxC) <= reg.tuning.comfortJitterC);

// ---------------------------------------------------------------- 4
console.log('\n4. temperatureDiscomfort / temperatureClothingBiasWeight — sign matches direction, zero inside the band');
const discomfort = J(`(() => {
  const g = __mk(5, 106); // winter
  const ids = __ids(g);
  const npc = g.npcs[ids[0]];
  const b = npcComfortBandC(npc, ids[0]);
  __setTarget(g, THERMOSTAT_TUNING.minC);
  const cold = { d: temperatureDiscomfort(g, npc, ids[0]), bias: temperatureClothingBiasWeight(g, npc, ids[0]) };
  __setTarget(g, THERMOSTAT_TUNING.maxC);
  // A genuinely warm moment, so the maxC setting reads hot given
  // hvacEfficiency < 1. Was "day 1 = spring" against the old flat 18°C; under
  // seasons-and-weather-plan.md Phase 1's smooth curve day 1 is the COLD edge
  // of spring (and the harness clock is morning), so a summer afternoon
  // states the test's own premise instead of assuming it.
  g.meta.clock.day = 53; g.meta.clock.minutes = 900;
  const hot = { d: temperatureDiscomfort(g, npc, ids[0]), bias: temperatureClothingBiasWeight(g, npc, ids[0]) };
  __setTarget(g, (b.minC + b.maxC) / 2);
  const mid = { d: temperatureDiscomfort(g, npc, ids[0]), bias: temperatureClothingBiasWeight(g, npc, ids[0]) };
  return { cold, hot, mid };
})()`);
check('too cold reads a negative discomfort and a positive (favor-warm) clothing bias', discomfort.cold.d < 0 && discomfort.cold.bias === reg.tuning.clothingBiasWeight, JSON.stringify(discomfort.cold));
check('too hot reads a positive discomfort and a negative (favor-cool) clothing bias', discomfort.hot.d > 0 && discomfort.hot.bias === -reg.tuning.clothingBiasWeight, JSON.stringify(discomfort.hot));
check('inside the band reads zero discomfort and zero bias', discomfort.mid.d === 0 && discomfort.mid.bias === 0, JSON.stringify(discomfort.mid));

// ---------------------------------------------------------------- 5
console.log('\n5. ADJUST_THERMOSTAT — real DSL wiring, clamps at both ends, lazy-inits world.thermostat');
const adjust = J(`(() => {
  const g = __mk(6, 1);
  delete g.world.thermostat; // fresh save that never touched the dial
  const ctx = { gameState: g };
  applyEffects(parseEffectDSL('ADJUST_THERMOSTAT +1'), ctx);
  const afterOne = g.world.thermostat.targetC;
  // Walk it past maxC and confirm it clamps rather than overshoots.
  for (let i = 0; i < 20; i++) applyEffects(parseEffectDSL('ADJUST_THERMOSTAT +1'), ctx);
  const clampedHigh = g.world.thermostat.targetC;
  for (let i = 0; i < 40; i++) applyEffects(parseEffectDSL('ADJUST_THERMOSTAT -1'), ctx);
  const clampedLow = g.world.thermostat.targetC;
  return { afterOne, clampedHigh, clampedLow };
})()`);
check('lazy-init default is THERMOSTAT_TUNING.defaultC, then +1 applies for real', adjust.afterOne === J('THERMOSTAT_TUNING.defaultC') + J('THERMOSTAT_TUNING.stepC'), JSON.stringify(adjust));
check('clamps at maxC, never overshoots', adjust.clampedHigh === J('THERMOSTAT_TUNING.maxC'));
check('clamps at minC, never overshoots', adjust.clampedLow === J('THERMOSTAT_TUNING.minC'));

// ---------------------------------------------------------------- 6
console.log('\n6. thermostatBelowMax / thermostatAboveMin — the chip gate at both boundaries');
const gate = J(`(() => {
  const g = __mk(7, 1);
  const ctxAt = (c) => ({ gameState: __setTarget(__mk(7, 1), c) });
  return {
    belowAtMax: ACTION_REQUIREMENT_CHECKERS.thermostatBelowMax(ctxAt(THERMOSTAT_TUNING.maxC)),
    belowMid: ACTION_REQUIREMENT_CHECKERS.thermostatBelowMax(ctxAt(THERMOSTAT_TUNING.defaultC)),
    aboveAtMin: ACTION_REQUIREMENT_CHECKERS.thermostatAboveMin(ctxAt(THERMOSTAT_TUNING.minC)),
    aboveMid: ACTION_REQUIREMENT_CHECKERS.thermostatAboveMin(ctxAt(THERMOSTAT_TUNING.defaultC)),
  };
})()`);
check('raise chip refuses (a string reason, not true) once already at maxC', gate.belowAtMax !== true && typeof gate.belowAtMax === 'string');
check('raise chip allows it away from maxC', gate.belowMid === true);
check('lower chip refuses once already at minC', gate.aboveAtMin !== true && typeof gate.aboveAtMin === 'string');
check('lower chip allows it away from minC', gate.aboveMid === true);

// ---------------------------------------------------------------- 7
console.log('\n7. Real wardrobe wiring — npcOutfitForContext flips a real pick under a real thermal bias');
const wardrobe = J(`(() => {
  const g = __mk(8, 106); // winter
  const ids = __ids(g);
  const npcId = ids[0];
  const npc = g.npcs[npcId];
  // Neutralise the Phase 7 styleLean bias (npc.js's npcOutfitForContext also
  // feeds occupation.styleLean into composeOutfit's scoring) — a real,
  // independent system this test isn't about; a seeded occupation whose lean
  // happens to favor one candidate's styleTags would confound the read on
  // the NEW thermal bias specifically.
  if (npc.bible.occupation) npc.bible = { ...npc.bible, occupation: { ...npc.bible.occupation, styleLean: [] } };
  // npcWardrobeItems (npc.js) prefers a real wardrobe OBJECT in the NPC's own
  // bedroom over their inventory fallback — house generation already stocks
  // one, so overwrite ITS contents rather than npc.inventory (which the
  // wardrobe object would otherwise shadow entirely).
  const bucket = g.objects['room_' + npc.residency.room] || {};
  const wardrobeObj = Object.values(bucket).find(o => o && o.defId === 'wardrobe');
  const stock = [{ defId: 'shorts', qty: 1 }, { defId: 'cargo_pants', qty: 1 }];
  if (wardrobeObj) wardrobeObj.contents = stock; else npc.inventory = stock;
  const baseline = composeOutfit('daily', ['shorts', 'cargo_pants'], {}).bottom;
  __setTarget(g, THERMOSTAT_TUNING.minC);
  const cold = npcOutfitForContext(npc, g, 'leisure', null, npcId).bottom;
  g.meta.clock.day = 1; // spring
  __setTarget(g, THERMOSTAT_TUNING.maxC);
  const hot = npcOutfitForContext(npc, g, 'leisure', null, npcId).bottom;
  return { baseline, cold, hot };
})()`);
check("with no bias, the wardrobe's default (higher comfort/attraction) pick wins", wardrobe.baseline === 'shorts', JSON.stringify(wardrobe));
check('a real cold ambient flips the ACTUAL npcOutfitForContext pick to the higher-thermal item', wardrobe.cold === 'cargo_pants', JSON.stringify(wardrobe));
check('a real hot ambient keeps/restores the lower-thermal item', wardrobe.hot === 'shorts', JSON.stringify(wardrobe));

// ---------------------------------------------------------------- 8
console.log('\n8. Real per-tick wiring — resolveBatch: annoyance mood malus and a genuine complaint event, paired against a comfortable control');
const tickWiring = J(`(() => {
  const mkAt = (targetC, day) => {
    const g = __mk(9, day);
    __setTarget(g, targetC);
    const ids = __ids(g);
    for (const id of ids) { g.npcs[id].location = 'living_room'; g.npcs[id].schedule = { currentBlock: 'leisure' }; }
    return g;
  };
  // Cold trial: winter, thermostat pinned at minC — every resident should be
  // well below their own band (comfortJitterC is only ±2 against a ~14° gap).
  let coldState = mkAt(THERMOSTAT_TUNING.minC, 106);
  let complaints = 0, selfAdjusted = false;
  const startTarget = coldState.world.thermostat.targetC;
  const startMood = __ids(coldState).map(id => coldState.npcs[id].mood);
  for (let i = 0; i < 60; i++) {
    const result = resolveBatch(coldState, 1, { suppressNeeds: true });
    coldState = result.state;
    complaints += result.events.filter(e => e.type === 'temperature_complaint').length;
    if (coldState.world.thermostat.targetC !== startTarget) selfAdjusted = true;
  }
  const endMood = __ids(coldState).map(id => coldState.npcs[id].mood);
  // Comfortable control: same cast/seed, thermostat pinned at each NPC's own
  // midpoint-ish neutral — should NOT accumulate the same mood drag.
  let comfyState = mkAt(THERMOSTAT_TUNING.defaultC, 106);
  const startMoodComfy = __ids(comfyState).map(id => comfyState.npcs[id].mood);
  for (let i = 0; i < 60; i++) {
    comfyState = resolveBatch(comfyState, 1, { suppressNeeds: true }).state;
  }
  const endMoodComfy = __ids(comfyState).map(id => comfyState.npcs[id].mood);
  const coldMoodDrop = startMood.reduce((s, v, i) => s + (v - endMood[i]), 0);
  const comfyMoodDrop = startMoodComfy.reduce((s, v, i) => s + (v - endMoodComfy[i]), 0);
  return { complaints, selfAdjusted, coldMoodDrop, comfyMoodDrop };
})()`);
check('a sustained cold snap produces at least one real narrated complaint event over 60 ticks', tickWiring.complaints > 0, JSON.stringify(tickWiring));
check('a sustained cold snap eventually triggers a real self-adjust write to world.thermostat', tickWiring.selfAdjusted === true, JSON.stringify(tickWiring));
check("the cold household's aggregate mood drops measurably more than the comfortable control's (paired trial, same cast/seed)", tickWiring.coldMoodDrop > tickWiring.comfyMoodDrop, JSON.stringify(tickWiring));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
