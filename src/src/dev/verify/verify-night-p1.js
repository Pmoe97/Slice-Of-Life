// night-scene-sleeping-npc-plan.md — Phase 1 core, REVISED by Phase 3a.
//
//   node src/src/dev/verify/verify-night-p1.js
//
// Phase 3a rewrote what an action IS, so most of the original file moved with
// it. What's asserted now, in the order it would hurt if it broke:
//   - the D16/D31/D33 tables are internally complete: every part declares at
//     least one instrument, every declared instrument yields at least one
//     motion, no motion is orphaned, every evidence tag a part or a move can
//     leave has a Cleanup part that clears it, every pose-graph edge names
//     real nodes, and motion rows really are in ascending intensity (D33
//     makes the row ORDER information).
//   - the things the design passes DELETED stay deleted: `zones`, `quell`,
//     `nightStepQuell`, `heatWillingMin`, the four-outcome xp bucket, and the
//     'ghost'/'bail' return values.
//   - the coupling rules, which are NOT the old "heat has zero coupling to
//     the risk side" assertion (D27 deliberately couples action intensity to
//     wakefulness on an overshoot, so the old wording would either fail or be
//     loosened into meaninglessness). The real rule, tested in both
//     directions: WAKEFULNESS/STIRRING NEVER INFLUENCE HEAT, and heat reaches
//     wakefulness ONLY through D27's overshoot multiplier and D36's move
//     discount — both of which are proved to be live rather than assumed.
//   - stirring never decreases (including on a soothe), wakefulness never
//     sits below stirring, an instant wake at exactly detectionWake,
//     determinism (same seed -> same result).
//   - D17: a soothe has wakeDelta < 0 AND stirDelta > 0 AND heatDelta < 0,
//     and it takes all three of part/motion/pace to make one.
//   - D16: Pace moves wakefulness and heat in opposite directions (emergent
//     through D27, not a raw multiplier pair).
//   - D27: an overshoot past tooFastAt returns a negative heatDelta and a
//     bigger wakeDelta; a gap below staleAt returns a near-zero but
//     non-negative one; the curve is continuous at its four boundaries.
//   - D38: heat is unbounded, every 100 is another climax, and a spent
//     checkpoint never re-arms.
//   - D28: the same NPC seed always derives the same preferences; an
//     authored `sensitivity` beats the roll; an authored `preferences` beats
//     the sensitivity.
//   - D29: the willing/hostile bar is per-NPC, clamped, and monotone in
//     relationship and deviancy.
//   - D34/D36: pose gates the palette, a move walks a real edge, and there is
//     no direct front->back edge (reaching a part can take a ROUTE).
//   - D30/D32: every line has two halves, varies between repeats, reproduces
//     from the same seed, never leaks an unreplaced {token}, and degrades to
//     the fallback rather than throwing when a pool is empty.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'skills.js', 'npc.js', 'boundary.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, stealthXp) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'bedroom_1';
    g.player.skills = { stealth: stealthXp || 0 };
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  // A target and a player with BOTH genital types and a breasted chest, so a
  // table sweep covers every region rather than whichever ones the house roll
  // happened to produce. Sensitivity is pinned to a neutral band so D35's
  // bible-first rule doesn't colour the sweep.
  __bothBodies = (g, id, opts) => {
    const o = opts || {};
    const gens = [{ type: 'vagina', sensitivity: o.sens || 'average' }, { type: 'penis', sensitivity: o.sens || 'average' }];
    const npc = g.npcs[id];
    g.npcs[id] = { ...npc, bible: { ...npc.bible, physical: { ...npc.bible.physical,
      intimate: { ...npc.bible.physical.intimate, genitals: gens,
        breasts: { ...(npc.bible.physical.intimate.breasts||{}), size: o.flat ? 'flat' : 'full', sensitivity: o.sens || 'average' } } } } };
    g.player = { ...g.player, appearance: { ...g.player.appearance, physical: { ...g.player.appearance.physical,
      intimate: { ...g.player.appearance.physical.intimate, genitals: gens } } } };
    return g;
  };
  __open = (g, id, over) => {
    // Phase 7: the record gained D34's third axis. Fixtures default to the
    // FULLY DISPLACED set, so a grammar sweep is testing the grammar and not
    // re-testing the clothing gate; the tests that care about that gate pass
    // their own clothing map through the overrides argument.
    const rec = { targetId: id, openedDay: 1, openedMinute: 100, detection: 0, floor: 0, heat: 0,
      evidence: [], touches: [], pose: 'back', covers: 'off',
      clothing: { shirt: 'displaced', bottoms: 'displaced', panties: 'displaced' },
      climaxCount: 0, xp: 0, resolved: null };
    g.npcs[id] = { ...g.npcs[id], flags: { ...(g.npcs[id].flags||{}), _nightScene: { ...rec, ...(over||{}) } } };
    return g.npcs[id].flags._nightScene;
  };
  // A pose this part is actually reachable in, so a table sweep is testing
  // the grammar rather than re-testing D34's gate.
  __poseFor = (partId) => {
    const cfg = BOUNDARY.nightScene;
    const part = cfg.parts[partId];
    const region = cfg.regions[part.region] || {};
    const reach = Object.prototype.hasOwnProperty.call(part, 'reach') ? part.reach : region.reach;
    return Array.isArray(reach) ? reach[0] : 'back';
  };
  __sideFor = (partId) => {
    const cfg = BOUNDARY.nightScene;
    const part = cfg.parts[partId];
    if (part.paired) return 'both';
    if ((cfg.regions[part.region] || {}).genital) return 'g1';
    return '-';
  };
  __allTags = () => {
    const cfg = BOUNDARY.nightScene;
    const t = new Set();
    for (const p of Object.keys(cfg.parts)) for (const tag of (cfg.parts[p].evidence || [])) t.add(tag);
    for (const m of Object.keys(cfg.motions)) for (const tag of (cfg.motions[m].evidence || [])) t.add(tag);
    return [...t];
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. The D16/D31/D33 tables are internally complete');
const shape = J(`(() => {
  const cfg = BOUNDARY.nightScene;
  const problems = [];
  const partIds = Object.keys(cfg.parts);
  const motionIds = Object.keys(cfg.motions);
  const regionIds = Object.keys(cfg.regions);
  const used = new Set();
  let combos = 0;
  for (const p of partIds) {
    const part = cfg.parts[p];
    if (!part.label || !part.standalone) problems.push('missing a label pair: ' + p);
    if (part.paired && !part.plural) problems.push('paired part with no authored plural: ' + p);
    if (!cfg.regions[part.region]) problems.push('unknown region on ' + p);
    if (!Array.isArray(part.wakeDelta) || part.wakeDelta[0] > part.wakeDelta[1]) problems.push('bad wakeDelta on ' + p);
    if (typeof part.intensity !== 'number' || typeof part.heat !== 'number') problems.push('bad intensity/heat on ' + p);
    const acc = part.acc || {};
    if (!Object.keys(acc).length) problems.push('part offers no instrument: ' + p);
    for (const inst of Object.keys(acc)) {
      const ms = nightMotionsFor(p, inst);
      if (!ms.length) problems.push('instrument with no motions: ' + p + '/' + inst);
      combos += ms.length;
      for (let i = 1; i < ms.length; i++) {
        if (cfg.motions[ms[i]].intensityOffset < cfg.motions[ms[i-1]].intensityOffset) {
          problems.push('motion row not in ascending intensity: ' + p + '/' + inst);
        }
      }
      for (const m of ms) used.add(m);
    }
  }
  const orphanMotions = motionIds.filter(m => !used.has(m));
  // Every evidence tag anything can leave must have a Cleanup part for it.
  const cleaners = partIds.filter(p => cfg.parts[p].clears).map(p => cfg.parts[p].clears);
  const uncleanable = __allTags().filter(t => cleaners.indexOf(t) < 0);
  // Pose graph: every edge names real nodes, and every node is on some edge.
  const touched = new Set();
  for (const m of motionIds) {
    const mo = cfg.motions[m];
    if (mo.pose) {
      for (const f of mo.pose.from) { if (!cfg.poses[f]) problems.push('edge from unknown pose: ' + m); touched.add(f); }
      if (!cfg.poses[mo.pose.to]) problems.push('edge to unknown pose: ' + m);
      touched.add(mo.pose.to);
    }
    if (mo.covers) {
      for (const f of mo.covers.from) if (!cfg.covers[f]) problems.push('cover edge from unknown state: ' + m);
      if (!cfg.covers[mo.covers.to]) problems.push('cover edge to unknown state: ' + m);
    }
  }
  const orphanPoses = Object.keys(cfg.poses).filter(p => !touched.has(p));
  const orders = regionIds.map(r => cfg.regions[r].order);
  return {
    partCount: partIds.length, combos, problems, orphanMotions, uncleanable, orphanPoses,
    ordersUnique: new Set(orders).size === orders.length,
    skillCurveLength: cfg.skillMult.length, stirringCurveLength: cfg.stirringRate.length,
    tiers: Object.keys(cfg.tierRiskMult).sort(),
    paceKeys: Object.keys(cfg.pace).sort(),
  };
})()`);
check('the part table is structurally sound (labels, plurals, ranges, regions)', shape.problems.length === 0, JSON.stringify(shape.problems));
check(`a real palette exists (${shape.partCount} parts, ${shape.combos} part x instrument x motion combinations)`, shape.partCount >= 40 && shape.combos >= 500);
check('no motion is orphaned — every verb is reachable from some part', shape.orphanMotions.length === 0, JSON.stringify(shape.orphanMotions));
check('every evidence tag anything can leave has a Cleanup part that clears it', shape.uncleanable.length === 0, JSON.stringify(shape.uncleanable));
check('every pose is on at least one graph edge (no unreachable node)', shape.orphanPoses.length === 0, JSON.stringify(shape.orphanPoses));
check('region tab orders are unique', shape.ordersUnique);
check('skillMult/stirringRate are both 11-entry curves (levels 0..10)', shape.skillCurveLength === 11 && shape.stirringCurveLength === 11);
check('tier table covers cold/hostile/neutral/warm', JSON.stringify(shape.tiers) === JSON.stringify(['cold', 'hostile', 'neutral', 'warm']));
check('Pace is exactly the three positions D16 locks', JSON.stringify(shape.paceKeys) === JSON.stringify(['firm', 'gentle', 'steady']));

// ---------------------------------------------------------------- 1
console.log('\n1. What the design passes deleted stays deleted');
const gone = J(`(() => {
  const cfg = BOUNDARY.nightScene;
  return {
    zones: cfg.zones === undefined,
    quellBucket: cfg.quell === undefined,
    quellFn: typeof nightStepQuell !== 'function',
    touchFn: typeof nightStepTouch !== 'function',
    heatWillingMin: cfg.thresholds.heatWillingMin === undefined,
    xpBucket: cfg.xp.ghostComplete === undefined && cfg.xp.bailClean === undefined,
    perActionXp: typeof cfg.xp.perAction === 'number' && typeof cfg.xp.perIntensity === 'number',
    cleanLeave: resolveNightSceneOutcome({}, { evidence: [] }, 'leave'),
    dirtyLeave: resolveNightSceneOutcome({}, { evidence: ['fluids', 'sheets'] }, 'leave'),
    bailGone: resolveNightSceneOutcome({}, { evidence: [] }, 'bail'),
  };
})()`);
check('BOUNDARY.nightScene.zones is gone (D16 replaced the flat palette)', gone.zones);
check('the quell config bucket is gone (D17)', gone.quellBucket);
check('nightStepQuell no longer exists (D17)', gone.quellFn);
check('nightStepTouch converged into one resolver (D16/D17)', gone.touchFn);
check('thresholds.heatWillingMin is gone — the bar is per-NPC now (D29)', gone.heatWillingMin);
check('the four-outcome xp bucket is gone, replaced by a per-action rate (D23)', gone.xpBucket && gone.perActionXp);
check("a clean exit is just 'exit' — there is no 'ghost' (D22)", gone.cleanLeave === 'exit');
check("a dirty exit is the SAME 'exit' — there is no 'bail' (D22)", gone.dirtyLeave === 'exit');
check("'bail' is not an exit choice any more", gone.bailGone === null);

// ---------------------------------------------------------------- 2
console.log('\n2. Determinism, and the coupling rules D7 actually protected');
const r2 = J(`(() => {
  const g = __mk(11); const id = __target(g); __bothBodies(g, id);
  __open(g, id, { pose: 'back', covers: 'off', detection: 30, floor: 10, heat: 20 });
  const a = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'ctx1');
  const g2 = __mk(11); __bothBodies(g2, id);
  __open(g2, id, { pose: 'back', covers: 'off', detection: 30, floor: 10, heat: 20 });
  const b = nightStepAction(g2, id, 'thigh.both.hand.knead.steady', 'ctx1');

  // Closed-form recompute of the wake magnitude, reading NOTHING from
  // part.heat or record.heat. An exact match proves the risk side is not
  // secretly reading the win track.
  const cfg = BOUNDARY.nightScene;
  const part = cfg.parts.thigh, motion = cfg.motions.knead, pace = cfg.pace.steady, inst = cfg.instruments.hand;
  const tierMult = cfg.tierRiskMult[boundaryTierFor(g, g.npcs[id])];
  const level = skillLevel(g.player, 'stealth');
  const prefs = nightPreferenceMults(nightPreferences(g.npcs[id]), 'thigh', 'knead');
  const rng = seededRng(g.meta.seed, 'night_act_' + id + '_thigh.both.hand.knead.steady_ctx1');
  const rolled = part.wakeDelta[0] + rng() * (part.wakeDelta[1] - part.wakeDelta[0]);
  const expected = rolled * motion.wakeMult * pace.wakeMult * inst.wakeMult * tierMult
    * cfg.skillMult[level] * prefs.wake;
  const expectedStir = Math.abs(expected) * cfg.stirringRate[level];

  // WAKEFULNESS NEVER INFLUENCES HEAT: same everything, wildly different
  // detection/floor -> byte-identical heatDelta.
  __open(g, id, { pose: 'back', covers: 'off', detection: 5,  floor: 1,  heat: 20 });
  const lowWake = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'ctx1');
  __open(g, id, { pose: 'back', covers: 'off', detection: 90, floor: 80, heat: 20 });
  const highWake = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'ctx1');

  // HEAT REACHES WAKEFULNESS ONLY THROUGH THE OVERSHOOT: two heats that both
  // sit inside the window -> byte-identical raw wake magnitude.
  const raw = (r) => r.wakeDelta;
  __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat: 8 });
  const heatA = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'ctx1');
  __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat: 14 });
  const heatB = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'ctx1');
  return {
    same: a.detection === b.detection && a.floor === b.floor && a.heat === b.heat && a.verdict === b.verdict,
    wakeMatchesClosedForm: Math.abs(lowWake.wakeDelta - expected) < 1e-9,
    stirMatchesClosedForm: Math.abs(lowWake.stirDelta - expectedStir) < 1e-9,
    heatIgnoresWakefulness: lowWake.heatDelta === highWake.heatDelta,
    verdictsInWindow: [heatA.verdict, heatB.verdict],
    wakeIgnoresHeatInsideWindow: Math.abs(raw(heatA) - raw(heatB)) < 1e-9,
  };
})()`);
check('same seed + same args -> identical result', r2.same);
check('the wake magnitude matches a closed form that never reads heat (exact)', r2.wakeMatchesClosedForm);
check('...and stirring is that SAME magnitude x stirringRate (exact)', r2.stirMatchesClosedForm);
check('WAKEFULNESS NEVER INFLUENCES HEAT: detection 5 vs 90 -> identical heatDelta', r2.heatIgnoresWakefulness);
check('two in-window heats produce an identical wake cost (heat reaches wake ONLY via the overshoot)',
  r2.wakeIgnoresHeatInsideWindow, JSON.stringify(r2.verdictsInWindow));

// ---------------------------------------------------------------- 3
console.log('\n3. ...and the two BLESSED heat->wake couplings are genuinely live');
const r3 = J(`(() => {
  const g = __mk(11); const id = __target(g); __bothBodies(g, id);
  // D27: the same firm action on a cold NPC overshoots and costs MORE wake.
  __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat: 2 });
  const cold = nightStepAction(g, id, 'nipple.both.fingers.pinch.firm', 'o');
  __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat: 48 });
  const warm = nightStepAction(g, id, 'nipple.both.fingers.pinch.firm', 'o');
  // D36: the same move costs LESS at high heat. Never mirror this.
  __open(g, id, { pose: 'side_toward', covers: 'off', detection: 20, floor: 5, heat: 0 });
  const moveCold = nightStepAction(g, id, 'her_body.-.hand.roll_to_back.steady', 'm');
  __open(g, id, { pose: 'side_toward', covers: 'off', detection: 20, floor: 5, heat: 100 });
  const moveWarm = nightStepAction(g, id, 'her_body.-.hand.roll_to_back.steady', 'm');
  const M = BOUNDARY.nightScene.move;
  return {
    coldVerdict: cold.verdict, warmVerdict: warm.verdict,
    overshootCostsMore: cold.wakeDelta > warm.wakeDelta,
    moveDiscounts: moveWarm.wakeDelta < moveCold.wakeDelta,
    discountExact: Math.abs(moveWarm.wakeDelta - moveCold.wakeDelta * (1 - M.heatDiscountMax)) < 1e-9,
    movesCarryNoHeat: moveCold.heatDelta === 0 && moveWarm.heatDelta === 0,
  };
})()`);
check("D27: a firm pinch on a cold NPC reads 'overshoot' and a warm one does not",
  r3.coldVerdict === 'overshoot' && r3.warmVerdict !== 'overshoot', JSON.stringify(r3));
check('...and the overshoot costs strictly more wakefulness (a jarring escalation rouses)', r3.overshootCostsMore);
check('D36: the SAME move costs less at high heat (a warm NPC moves with you)', r3.moveDiscounts);
check('...at exactly the configured maximum discount when heat is at heatPliancyFull', r3.discountExact);
check('a move carries no heat of its own', r3.movesCarryNoHeat);

// ---------------------------------------------------------------- 4
console.log('\n4. Stirring never decreases; Wakefulness never sits below it; an instant wake at exactly the cap');
const r4 = J(`(() => {
  const g = __mk(22); const id = __target(g); __bothBodies(g, id);
  __open(g, id, { pose: 'back', covers: 'off', detection: 0, floor: 0, heat: 0 });
  const walk = ['thigh.both.hand.stroke.steady', 'shoulders.-.hand.stroke.gentle',
                'nipple.both.fingers.circle.gentle', 'arm.both.hand.stroke.gentle',
                'inner_thigh.both.hand.stroke.steady', 'hair.-.fingers.stroke.gentle'];
  const violations = [];
  const floors = [];
  for (const a of walk) {
    const before = g.npcs[id].flags._nightScene;
    const r = nightStepAction(g, id, a, 'walk');
    if (!r) { violations.push('refused: ' + a); continue; }
    if (r.floor < before.floor - 1e-9) violations.push('stirring decreased on ' + a);
    if (r.stirDelta < -1e-9) violations.push('negative stirDelta on ' + a);
    if (r.detection < r.floor - 1e-9) violations.push('wakefulness below stirring after ' + a);
    applyNightStep(g, id, r);
    floors.push(g.npcs[id].flags._nightScene.floor);
  }
  const nonDecreasing = floors.every((f, i) => i === 0 || f >= floors[i-1] - 1e-9);
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 95, floor: 90, heat: 60 });
  const cap = nightStepAction(g, id, 'inside.g1.fingers.pump.firm', 'cap');
  return {
    violations, nonDecreasing, walked: floors.length,
    cappedExactly: cap.detection === BOUNDARY.nightScene.thresholds.detectionWake,
    reportsWoke: cap.woke === true,
    hasOutcome: cap.outcome === 'wake_willing' || cap.outcome === 'wake_hostile',
  };
})()`);
check('a mixed touch/soothe walk produces no monotonicity violation', r4.violations.length === 0, JSON.stringify(r4.violations));
check('the whole walk resolved (nothing silently refused)', r4.walked === 6, JSON.stringify(r4));
check('stirring history is monotonic non-decreasing', r4.nonDecreasing);
check('an action that would overshoot clamps EXACTLY to detectionWake', r4.cappedExactly);
check('that clamp is reported as woke:true with a wake outcome', r4.reportsWoke && r4.hasOutcome);

// ---------------------------------------------------------------- 5
console.log('\n5. The doubled skill bonus (D2): skill shrinks wakefulness once, stirring TWICE');
const r5 = J(`(() => {
  const gLow = __mk(33, 0); const gHigh = __mk(33, 4000);
  const id = __target(gLow);
  __bothBodies(gLow, id); __bothBodies(gHigh, id);
  __open(gLow, id, { pose: 'side_toward', covers: 'off', detection: 20, floor: 5, heat: 20 });
  __open(gHigh, id, { pose: 'side_toward', covers: 'off', detection: 20, floor: 5, heat: 20 });
  const low = nightStepAction(gLow, id, 'ass_cheek.both.hand.squeeze.steady', 'skillcmp');
  const high = nightStepAction(gHigh, id, 'ass_cheek.both.hand.squeeze.steady', 'skillcmp');
  return {
    higherLevel: skillLevel(gHigh.player, 'stealth') > skillLevel(gLow.player, 'stealth'),
    wakeShrank: high.wakeDelta < low.wakeDelta,
    stirShrankMore: (high.stirDelta / low.stirDelta) < (high.wakeDelta / low.wakeDelta),
  };
})()`);
check('the two probes really do differ in stealth level', r5.higherLevel);
check("higher stealth shrinks an action's Wakefulness gain", r5.wakeShrank);
check('...and shrinks its Stirring gain by a STRICTLY BIGGER factor (the doubled bonus)', r5.stirShrankMore);

// ---------------------------------------------------------------- 6
console.log('\n6. D31: every id the tables can compose resolves, and everything else is refused');
const r6 = J(`(() => {
  const cfg = BOUNDARY.nightScene;
  const results = { checked: 0, refused: [], resolvedNull: [] };
  for (const flat of [false, true]) {
    const g = __mk(44); const id = __target(g); __bothBodies(g, id, { flat });
    const variant = nightChestVariant(g.npcs[id]);
    for (const p of Object.keys(cfg.parts)) {
      const part = cfg.parts[p];
      if (part.variant && part.variant !== variant) continue;
      const side = __sideFor(p);
      for (const instBase of Object.keys(part.acc || {})) {
        for (const m of nightMotionsFor(p, instBase)) {
          const motion = cfg.motions[m];
          // Put her in a state where this action IS possible: a pose that
          // reaches the part, or the pose the edge leaves from; covers off;
          // every evidence tag outstanding so Cleanup has something to clear.
          const pose = motion.pose ? motion.pose.from[0] : __poseFor(p);
          const covers = motion.covers ? motion.covers.from[0] : 'off';
          // Phase 7: and a clothing state in which it is possible. Everything
          // displaced by default (so no body part is clothing-blocked), except
          // the one garment this edge is FOR, which has to still be on.
          const clothing = { shirt: 'displaced', bottoms: 'displaced', panties: 'displaced', towel: 'displaced' };
          if (motion.garment) clothing[motion.garment.id] = motion.garment.from[0];
          __open(g, id, { pose, covers, clothing, detection: 10, floor: 2, heat: 25, evidence: __allTags() });
          const actionId = composeNightActionId(p, side, instBase, m, 'steady');
          const v = nightActionValid(g, id, actionId);
          results.checked++;
          if (!v.ok) { if (results.refused.length < 8) results.refused.push(actionId + ' -> ' + v.reason); continue; }
          if (nightStepAction(g, id, actionId, 'sweep') === null && results.resolvedNull.length < 8) {
            results.resolvedNull.push(actionId);
          }
        }
      }
    }
  }
  const g = __mk(44); const id = __target(g); __bothBodies(g, id);
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 25, evidence: [] });
  const bad = {
    tonguePinch: nightActionValid(g, id, 'nipple.both.tongue.pinch.steady').reason,
    cockOnHair:  nightActionValid(g, id, 'hair.-.cock.thrust.steady').reason,
    unknownPart: nightActionValid(g, id, 'elbow.-.hand.rub.steady').reason,
    unknownMotion: nightActionValid(g, id, 'thigh.both.hand.yodel.steady').reason,
    unknownPace: nightActionValid(g, id, 'thigh.both.hand.rub.violently').reason,
    unknownInstrument: nightActionValid(g, id, 'thigh.both.elbow.rub.steady').reason,
    missingSide: nightActionValid(g, id, 'nipple.-.fingers.pinch.steady').reason,
    sideOnUnpaired: nightActionValid(g, id, 'hair.left.fingers.stroke.gentle').reason,
    cleanupWithNothingToClean: nightActionValid(g, id, 'panties.-.hand.straighten.steady').reason,
    moveWithNoEdge: nightActionValid(g, id, 'her_body.-.hand.uncurl.steady').reason,
    wrongArity: nightActionValid(g, id, 'thigh.hand.rub').reason,
    notAString: nightActionValid(g, id, null).reason,
    stepRefusesInvalid: nightStepAction(g, id, 'nipple.both.tongue.pinch.steady', 'x') === null,
  };
  return { results, bad };
})()`);
check(`every composable action id validates (${r6.results.checked} checked across both chest variants)`,
  r6.results.checked > 1500 && r6.results.refused.length === 0, JSON.stringify(r6.results.refused));
check('...and every one of them resolves rather than returning null', r6.results.resolvedNull.length === 0, JSON.stringify(r6.results.resolvedNull));
check('nobody pinches a nipple with their tongue (invalid combination refused)', r6.bad.tonguePinch === 'invalid_combination');
check('a genital instrument on a part that never accepts one is refused', r6.bad.cockOnHair === 'invalid_combination');
check('an unknown part / motion / pace / instrument is each refused by name',
  r6.bad.unknownPart === 'no_part' && r6.bad.unknownMotion === 'no_motion'
  && r6.bad.unknownPace === 'no_pace' && r6.bad.unknownInstrument === 'no_instrument', JSON.stringify(r6.bad));
check('a paired part with no side, and an unpaired part with one, are both refused',
  r6.bad.missingSide === 'bad_side' && r6.bad.sideOnUnpaired === 'bad_side');
check('a Cleanup for evidence that is not outstanding is refused', r6.bad.cleanupWithNothingToClean === 'no_evidence');
check('a Move whose graph edge does not leave this pose is refused', r6.bad.moveWithNoEdge === 'no_edge');
check('a malformed id is refused rather than parsed loosely', r6.bad.wrongArity === 'bad_id' && r6.bad.notAString === 'bad_id');
check('the RESOLVER refuses an invalid id too, not just the validator', r6.bad.stepRefusesInvalid);

// ---------------------------------------------------------------- 7
console.log('\n7. D17: soothing is emergent, and it takes all three of part x motion x pace');
const r7 = J(`(() => {
  const g = __mk(55); const id = __target(g); __bothBodies(g, id);
  const at = (a) => { __open(g, id, { pose: 'side_toward', covers: 'off', detection: 55, floor: 10, heat: 40 });
                      return nightStepAction(g, id, a, 's'); };
  const soothe = at('shoulders.-.hand.stroke.gentle');
  const notPace = at('shoulders.-.hand.stroke.firm');
  const notMotion = at('shoulders.-.hand.squeeze.gentle');
  const notPart = at('nipple.both.fingers.stroke.gentle');
  return {
    wakeNegative: soothe.wakeDelta < 0,
    stirPositive: soothe.stirDelta > 0,
    heatNegative: soothe.heatDelta < 0,
    flagged: soothe.soothe === true && soothe.verdict === 'soothe',
    notPace: notPace.soothe === false && notPace.wakeDelta > 0,
    notMotion: notMotion.soothe === false && notMotion.wakeDelta > 0,
    notPart: notPart.soothe === false && notPart.wakeDelta > 0,
    heatDrainIsSmall: Math.abs(soothe.heatDelta) <= 2,
  };
})()`);
check('a soothe has wakeDelta < 0 (that IS the soothe)', r7.wakeNegative);
check('...AND stirDelta > 0 — the anti-spam rule: soothing costs permanently', r7.stirPositive);
check('...AND a small negative heatDelta — calming her down cools her down', r7.heatNegative && r7.heatDrainIsSmall);
check('...and the resolver reports it as a soothe', r7.flagged);
check('the same part+motion at a firmer pace is NOT a soothe', r7.notPace);
check('the same part+pace with a non-calming motion is NOT a soothe', r7.notMotion);
check('a calming motion at gentle pace on a NON-soothing part is NOT a soothe', r7.notPart);

// ---------------------------------------------------------------- 8
console.log('\n8. D16/D27: Pace moves wakefulness and heat in OPPOSITE directions');
const r8 = J(`(() => {
  const g = __mk(66); const id = __target(g); __bothBodies(g, id);
  const at = (pace, heat) => { __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat });
                               return nightStepAction(g, id, 'nipple.both.fingers.pinch.' + pace, 'p'); };
  const gentle = at('gentle', 20), steady = at('steady', 20), firm = at('firm', 20);
  return {
    intensityRises: gentle.intensity < steady.intensity && steady.intensity < firm.intensity,
    wakeRises: gentle.wakeDelta < steady.wakeDelta && steady.wakeDelta < firm.wakeDelta,
    gentleGainsHeat: gentle.heatDelta > 0,
    firmLosesHeat: firm.heatDelta < 0,
    verdicts: [gentle.verdict, steady.verdict, firm.verdict],
  };
})()`);
check('pace raises the action intensity monotonically (D27: gentle is how you APPROACH)', r8.intensityRises);
check('pace raises the wakefulness cost monotonically', r8.wakeRises);
check('at a heat where gentle is a step up and firm overshoots, the heat deltas have OPPOSITE signs',
  r8.gentleGainsHeat && r8.firmLosesHeat, JSON.stringify(r8.verdicts));

// ---------------------------------------------------------------- 9
console.log('\n9. D27: the acceleration curve itself');
const r9 = J(`(() => {
  const I = BOUNDARY.nightScene.iar;
  const f = (gap) => nightHeatFactor(gap, 1);
  const eps = 1e-6;
  const samples = [-60, I.staleAt - eps, I.staleAt, I.staleAt / 2, -eps, 0, I.idealPeak / 2,
                   I.idealPeak, (I.idealPeak + I.tooFastAt) / 2, I.tooFastAt, I.tooFastAt + eps, 60];
  const rows = samples.map(gap => ({ gap: +gap.toFixed(4), ...f(gap) }));
  const at = (gap) => f(gap);
  return {
    rows,
    peakAtIdeal: at(I.idealPeak).factor > at(0).factor && at(I.idealPeak).factor > at(I.tooFastAt).factor,
    peakIsOne: Math.abs(at(I.idealPeak).factor - 1) < 1e-9,
    regressionNeverNegative: [-40, -80, -200, -1000].every(gp => at(gp).factor >= 0),
    regressionDecays: at(-40).factor > at(-80).factor && at(-80).factor > at(-200).factor,
    continuousAtStale: Math.abs(at(I.staleAt).factor - at(I.staleAt - eps).factor) < 1e-3,
    continuousAtZero: Math.abs(at(0).factor - at(-eps).factor) < 1e-3,
    continuousAtIdeal: Math.abs(at(I.idealPeak).factor - at(I.idealPeak - eps).factor) < 1e-3,
    verdicts: {
      overshoot: at(I.tooFastAt + 1).verdict, edge: at(I.tooFastAt).verdict,
      step: at(I.idealPeak + 1).verdict, level: at(1).verdict,
      maintain: at(-1).verdict, regression: at(I.staleAt - 1).verdict,
    },
  };
})()`);
check('the gain peaks at exactly idealPeak, at factor 1.0', r9.peakAtIdeal && r9.peakIsOne, JSON.stringify(r9.rows));
check('the five verdict bands are labelled as D27 names them',
  r9.verdicts.overshoot === 'overshoot' && r9.verdicts.step === 'step' && r9.verdicts.level === 'level'
  && r9.verdicts.maintain === 'maintain' && r9.verdicts.regression === 'regression', JSON.stringify(r9.verdicts));
check('a deep regression decays toward zero and NEVER goes negative (ineffective, not unpleasant)',
  r9.regressionNeverNegative && r9.regressionDecays);
check('the curve is continuous at staleAt, 0 and idealPeak (no cliff a player could not read)',
  r9.continuousAtStale && r9.continuousAtZero && r9.continuousAtIdeal);

const r9b = J(`(() => {
  const g = __mk(77); const id = __target(g); __bothBodies(g, id);
  const I = BOUNDARY.nightScene.iar;
  const at = (heat, action) => { __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat });
                                 return nightStepAction(g, id, action, 'c'); };
  const over = at(2, 'inside.g1.cock.thrust.firm');       // cock down a cold stranger's throat, essentially
  const stale = at(95, 'knee.both.fingers.rub.steady'); // a knee rub after full sex
  const step = at(20, 'nipple.both.fingers.circle.gentle');
  return {
    overshootLosesHeat: over.heatDelta < 0 && over.verdict === 'overshoot',
    overshootRouses: over.wakeDelta > 0,
    staleVerdict: stale.verdict,
    staleNonNegativeButTiny: stale.heatDelta >= 0 && stale.heatDelta < 1,
    stepGains: step.heatDelta > 0,
  };
})()`);
check('escalating far too fast LOSES heat and rouses her', r9b.overshootLosesHeat && r9b.overshootRouses);
check("regressing to a knee rub at heat 95 is 'regression' and gains a near-zero, non-negative amount",
  r9b.staleVerdict === 'regression' && r9b.staleNonNegativeButTiny, JSON.stringify(r9b));
check('a step up inside the window gains heat', r9b.stepGains);

// ---------------------------------------------------------------- 10
console.log('\n10. D38: heat is unbounded, and every 100 is another climax');
const r10 = J(`(() => {
  const g = __mk(88); const id = __target(g); __bothBodies(g, id);
  const cycle = BOUNDARY.nightScene.thresholds.climaxEvery;
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: cycle - 2 });
  const first = nightStepAction(g, id, 'inside.g1.tongue.curl.steady', 'k');
  applyNightStep(g, id, first);
  const afterFirst = g.npcs[id].flags._nightScene;
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 2 * cycle - 2, climaxCount: 1 });
  const second = nightStepAction(g, id, 'inside.g1.tongue.curl.steady', 'k');
  // Falling back below a spent checkpoint and climbing through it again must
  // NOT fire the beat a second time.
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: cycle - 2, climaxCount: 1 });
  const rearm = nightStepAction(g, id, 'inside.g1.tongue.curl.steady', 'k');
  // D38's load-bearing fix: IAR reads heat MOD cycle, so the escalation curve
  // restarts after a climax rather than reading everything as a regression.
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 12 });
  const lowCycle = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'g');
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 212, climaxCount: 2 });
  const highCycle = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'g');
  return {
    exceeds100: first.heat > cycle,
    firstFired: first.climaxed === true && first.climaxCount === 1,
    persisted: afterFirst.climaxCount === 1 && afterFirst.heat > cycle,
    secondFired: second.climaxed === true && second.climaxCount === 2,
    noRearm: rearm.climaxed === false && rearm.climaxCount === 1,
    cycleGaps: [lowCycle.gap, highCycle.gap],
    cycleIdentical: lowCycle.gap === highCycle.gap && lowCycle.verdict === highCycle.verdict,
  };
})()`);
check('heat climbs past 100 — the Math.min(100, ...) cap is gone', r10.exceeds100);
check('crossing the first hundred fires the climax beat', r10.firstFired);
check('...and applyNightStep persists both the heat and the count', r10.persisted);
check('crossing the SECOND hundred fires it again', r10.secondFired);
check('falling back and re-crossing a spent checkpoint does NOT re-arm it', r10.noRearm);
check('IAR reads the WITHIN-CYCLE position: heat 12 and heat 212 give the identical gap and verdict',
  r10.cycleIdentical, JSON.stringify(r10.cycleGaps));

// ---------------------------------------------------------------- 11
console.log('\n11. D28: preferences are derived, stable, and the bible outranks the roll');
const r11 = J(`(() => {
  const g = __mk(99); const id = __target(g);
  const npc = g.npcs[id];
  const a = nightPreferences(npc);
  const b = nightPreferences(JSON.parse(JSON.stringify(npc)));
  const other = { ...npc, bible: { ...npc.bible, genSeed: (npc.bible.genSeed || 1) + 12345 } };
  const c = nightPreferences(other);
  const P = BOUNDARY.nightScene.prefs;
  // D35: an authored sensitivity on a genital entry wins for that region.
  const mk = (sens) => ({ ...npc, bible: { ...npc.bible, physical: { ...npc.bible.physical,
    intimate: { ...npc.bible.physical.intimate, genitals: [{ type: 'vagina', sensitivity: sens }],
      breasts: { ...(npc.bible.physical.intimate.breasts||{}), sensitivity: 'exquisite' } } } } });
  const hi = nightPreferences(mk('exquisite'));
  const lo = nightPreferences(mk('low'));
  // And an authored preferences block outranks even that.
  const authored = mk('low');
  authored.bible.physical.intimate.preferences = { loved: ['clit'], disliked: ['nipple'] };
  const auth = nightPreferences(authored);
  const noSeed = nightPreferences({ id: 'stub' });
  return {
    stable: JSON.stringify(a) === JSON.stringify(b),
    differsBySeed: JSON.stringify(a) !== JSON.stringify(c),
    counts: { loved: Object.values(a.parts).filter(v => v === 'loved').length,
              disliked: Object.values(a.parts).filter(v => v === 'disliked').length },
    sensitivityWinsHigh: hi.parts.clit === 'loved' && hi.parts.nipple === 'loved',
    sensitivityWinsLow: lo.parts.clit === 'disliked',
    authoredWins: auth.parts.clit === 'loved' && auth.parts.nipple === 'disliked',
    noMovePartsInPool: Object.keys(a.parts).every(p => {
      const kind = (BOUNDARY.nightScene.regions[BOUNDARY.nightScene.parts[p].region] || {}).kind;
      return kind !== 'move' && kind !== 'cleanup';
    }),
    seedlessStillWorks: Object.keys(noSeed.parts).length >= P.lovedParts,
  };
})()`);
check('the same NPC always derives the same preferences (no stored field, no migration)', r11.stable);
check('a different genSeed derives different preferences', r11.differsBySeed);
check('the derived draw lands at least the configured loved/disliked counts',
  r11.counts.loved >= 3 && r11.counts.disliked >= 2, JSON.stringify(r11.counts));
check("D35: an authored 'exquisite' sensitivity makes that region loved", r11.sensitivityWinsHigh);
check("...and an authored 'low' one makes it disliked", r11.sensitivityWinsLow);
check('an authored `preferences` block outranks even the sensitivity read', r11.authoredWins);
check('Move and Cleanup parts are never given a preference', r11.noMovePartsInPool);
check('an NPC with no genSeed at all still derives a profile (hashes its id)', r11.seedlessStillWorks);

const r11b = J(`(() => {
  const g = __mk(101); const id = __target(g); __bothBodies(g, id);
  const npc = g.npcs[id];
  const withPref = (band) => { const n = JSON.parse(JSON.stringify(npc));
    n.bible.physical.intimate.preferences = band === 'loved' ? { loved: ['thigh'] } : { disliked: ['thigh'] };
    g.npcs[id] = n; };
  const run = () => { __open(g, id, { pose: 'back', covers: 'off', detection: 20, floor: 5, heat: 12 });
                      return nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'pref'); };
  withPref('loved'); const loved = run();
  withPref('disliked'); const disliked = run();
  const P = BOUNDARY.nightScene.prefs;
  return {
    lovedGainsMoreHeat: loved.heatDelta > disliked.heatDelta,
    lovedCostsLessWake: loved.wakeDelta < disliked.wakeDelta,
    windowWidens: P.loved.windowMult > 1 && P.disliked.windowMult < 1,
  };
})()`);
check('a loved part gains more heat than a disliked one', r11b.lovedGainsMoreHeat);
check('...and costs less wakefulness (an unwelcome touch rouses)', r11b.lovedCostsLessWake);
check('a loved part WIDENS the D27 window and a disliked one narrows it', r11b.windowWidens);

// ---------------------------------------------------------------- 12
console.log('\n12. D29: the willing/hostile bar is a per-NPC moving target');
const r12 = J(`(() => {
  const g = __mk(111); const id = __target(g);
  const W = BOUNDARY.nightScene.willing;
  const mk = (rel, temp) => ({ ...g.npcs[id], relPlayer: { ...g.npcs[id].relPlayer, ...rel },
    bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, ...temp } } });
  const stranger = mk({ affection: -1, desire: -1, intimacyLevel: 0 }, { openness: -1, assertiveness: -1 });
  const partner  = mk({ affection: 1, desire: 1, intimacyLevel: 100 }, { openness: 1, assertiveness: 1 });
  const middling = mk({ affection: 0, desire: 0, intimacyLevel: 50 }, { openness: 0, assertiveness: 0 });
  const tS = nightWillingThreshold(g, stranger), tP = nightWillingThreshold(g, partner), tM = nightWillingThreshold(g, middling);
  // ...and the forced wake actually reads it.
  const cold = { ...stranger, flags: { _nightScene: null } };
  g.npcs[id] = stranger;
  __open(g, id, { pose: 'back', covers: 'off', detection: 99, floor: 90, heat: 10 });
  const hostile = nightStepAction(g, id, 'thigh.both.hand.knead.firm', 'w');
  g.npcs[id] = partner;
  __open(g, id, { pose: 'back', covers: 'off', detection: 99, floor: 90, heat: 95 });
  const willing = nightStepAction(g, id, 'thigh.both.hand.knead.firm', 'w');
  return {
    order: tS > tM && tM > tP,
    clamped: tS <= W.max && tP >= W.min && tS <= W.max + 1e-9,
    strangerNeedsMost: Math.abs(tS - W.max) < 1e-9 || tS > 70,
    deterministic: nightWillingThreshold(g, stranger) === tS,
    hostileOutcome: hostile.outcome, willingOutcome: willing.outcome,
    values: [+tS.toFixed(2), +tM.toFixed(2), +tP.toFixed(2)],
  };
})()`);
check('a cold stranger needs strictly more heat than a middling NPC, who needs more than a warm partner',
  r12.order, JSON.stringify(r12.values));
check('the threshold is clamped into its configured band', r12.clamped);
check('it is a READ, not a roll — the same NPC always gives the same number', r12.deterministic);
check('a forced wake at low heat on a cold stranger is hostile', r12.hostileOutcome === 'wake_hostile');
check('...and at high heat on a warm partner it is willing (retroactive consent, earned)', r12.willingOutcome === 'wake_willing');

// ---------------------------------------------------------------- 13
console.log('\n13. D34/D36: position is real state, it gates the palette, and reaching a part can take a ROUTE');
const r13 = J(`(() => {
  const g = __mk(121); const id = __target(g); __bothBodies(g, id);
  const palettePartIds = (over) => { __open(g, id, over);
    return nightPalette(g, id).regions.flatMap(r => r.parts.map(p => p.partId)); };
  const covered = palettePartIds({ pose: 'back', covers: 'covered' });
  const uncovered = palettePartIds({ pose: 'back', covers: 'off' });
  const onFront = palettePartIds({ pose: 'front', covers: 'off' });
  const parted = palettePartIds({ pose: 'back_parted', covers: 'off' });
  // The pose graph: no direct front -> back edge, so it routes through a side.
  const cfg = BOUNDARY.nightScene;
  const edgesFromFront = Object.keys(cfg.motions).filter(m => cfg.motions[m].pose && cfg.motions[m].pose.from.indexOf('front') >= 0);
  const directFrontToBack = edgesFromFront.some(m => cfg.motions[m].pose.to === 'back');
  // Walk the route and confirm the pose really moves.
  __open(g, id, { pose: 'front', covers: 'off', detection: 10, floor: 2, heat: 10 });
  const leg1 = nightStepAction(g, id, 'her_body.-.hand.roll_off_front.steady', 'r1');
  applyNightStep(g, id, leg1);
  const mid = g.npcs[id].flags._nightScene.pose;
  const leg2 = nightStepAction(g, id, 'her_body.-.hand.roll_to_back.steady', 'r2');
  applyNightStep(g, id, leg2);
  const end = g.npcs[id].flags._nightScene.pose;
  // A move can ADD evidence, and Cleanup has to answer for it.
  __open(g, id, { pose: 'back', covers: 'covered', detection: 10, floor: 2, heat: 10 });
  const sheet = nightStepAction(g, id, 'the_sheet.-.hand.draw_sheet_back.gentle', 'sh');
  applyNightStep(g, id, sheet);
  const afterSheet = g.npcs[id].flags._nightScene;
  const cleanable = nightPalette(g, id).regions.find(r => r.regionId === 'cleanup');
  return {
    coveredIsSmaller: covered.length < uncovered.length,
    noNippleUnderCovers: covered.indexOf('nipple') < 0 && uncovered.indexOf('nipple') >= 0,
    frontOffersAss: onFront.indexOf('asshole') >= 0 && uncovered.indexOf('asshole') < 0,
    partedOffersInside: parted.indexOf('inside') >= 0 && uncovered.indexOf('inside') < 0,
    sootheAlwaysReachable: ['shoulders','arm','her_hand'].every(p => covered.indexOf(p) >= 0 && onFront.indexOf(p) >= 0),
    noDirectFrontToBack: !directFrontToBack,
    routeWorks: mid === 'side_toward' && end === 'back',
    moveAddsEvidence: afterSheet.evidence.indexOf('sheets') >= 0 && afterSheet.covers === 'turned_back',
    cleanupOffered: !!cleanable && cleanable.parts.some(p => p.partId === 'sheets'),
  };
})()`);
check('the covers really gate the palette (fewer parts offered under them)', r13.coveredIsSmaller);
check('...specifically: no nipple under the covers, and one once they are off', r13.noNippleUnderCovers);
check('pose gates too — her ass on her front, not on her back', r13.frontOffersAss);
check('...and inside her only once her thighs are parted', r13.partedOffersInside);
check('the soothing heartland stays reachable in every pose (never posed into a corner)', r13.sootheAlwaysReachable);
check('there is NO direct front->back edge — the pose graph forces a route', r13.noDirectFrontToBack);
check('...and walking that route two legs really lands her on her back', r13.routeWorks);
check('a move can add evidence (drawing the sheet back leaves the sheets mussed)', r13.moveAddsEvidence);
check('...and Cleanup then offers the tag that move created', r13.cleanupOffered);

// ---------------------------------------------------------------- 14
console.log('\n14. Evidence and Cleanup, and D23 per-action XP');
const r14 = J(`(() => {
  const g = __mk(131); const id = __target(g); __bothBodies(g, id);
  __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 40 });
  const dirty = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'e1');
  applyNightStep(g, id, dirty);
  const afterDirty = g.npcs[id].flags._nightScene;
  const clean = nightStepAction(g, id, 'panties.-.hand.straighten.steady', 'e2');
  applyNightStep(g, id, clean);
  const afterClean = g.npcs[id].flags._nightScene;
  // Phase 7: straightening her panties RESTORES them, so the part they cover
  // is out of reach until they come aside again. That is the point of
  // restores field — Cleanup is a real mid-scene decision, not free tidying.
  const blockedAfterClean = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'e3');
  const reopen = nightStepAction(g, id, 'g_panties.-.hand.pull_panties_aside.steady', 'e4');
  applyNightStep(g, id, reopen);
  const repeat = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'e5');
  // XP: intensity buys it.
  const at = (a) => { __open(g, id, { pose: 'back_parted', covers: 'off', detection: 10, floor: 2, heat: 40 });
                      return nightStepAction(g, id, a, 'x'); };
  const cheap = at('hair.-.fingers.stroke.gentle');
  const dear = at('inside.g1.cock.thrust.steady');
  return {
    leftBoth: afterDirty.evidence.indexOf('panties') >= 0 && afterDirty.evidence.indexOf('fluids') >= 0,
    clearedExactlyOne: afterClean.evidence.indexOf('panties') < 0 && afterClean.evidence.indexOf('fluids') >= 0,
    cleanupCostsWake: clean.wakeDelta > 0 && clean.stirDelta > 0,
    cleanupCarriesNoHeat: clean.heatDelta === 0,
    cleanupClosesAccess: blockedAfterClean === null,
    reopenRetags: reopen.evidenceAdded.indexOf('panties') >= 0,
    noDoubleTag: repeat.evidenceAdded.indexOf('fluids') < 0,
    xpPositive: cheap.xp > 0 && dear.xp > 0,
    xpScalesWithIntensity: dear.xp > cheap.xp,
    xpAccumulates: afterClean.xp > 0,
  };
})()`);
check('an intimate touch leaves the evidence tags its part declares', r14.leftBoth);
check('a Cleanup action clears exactly its own tag and nothing else', r14.clearedExactlyOne);
check('...at a real wakefulness AND stirring cost — never a free undo', r14.cleanupCostsWake);
check('...and carries no heat', r14.cleanupCarriesNoHeat);
check('Phase 7: putting her panties back closes off what they cover', r14.cleanupClosesAccess);
check('...and pulling them aside again re-leaves the tag', r14.reopenRetags);
check('a repeated touch does not re-add a tag already outstanding', r14.noDoubleTag);
check('D23: every action pays XP, and a more intense one pays more', r14.xpPositive && r14.xpScalesWithIntensity);
check('...and applyNightStep accumulates it on the record', r14.xpAccumulates);

// ---------------------------------------------------------------- 15
// REPLACED BY PHASE 5. This section used to assert rollGhostSuspicion's
// private evidence-weighted chance against an independent recompute. D25
// retired that roll rather than tuning it -- the leftover evidence now goes to
// the SHARED stealth machinery (LEAVE_EVIDENCE -> sim.js's discovery scan ->
// ui.js's ADJUST_SUSPICION), which verify-night-p5.js owns end to end. What is
// left here is the tombstone: a later session must not quietly reintroduce a
// second, private consequence channel beside the shared one, because that is
// exactly the thing invariant 6 forbids.
console.log('\n15. D25: the private suspicion roll is RETIRED, not merely unused');
const r15 = J(`(() => ({
  fnGone: typeof rollGhostSuspicion === 'undefined',
  bucketGone: BOUNDARY.nightScene.suspicion === undefined,
  replacementExists: typeof resolveNightSceneConsequence === 'function'
    && typeof applyNightSceneEnd === 'function',
}))()`);
check('rollGhostSuspicion no longer exists', r15.fnGone);
check('...and neither does its BOUNDARY.nightScene.suspicion bucket', r15.bucketGone);
check('...because the shared-machinery replacement is what ships instead', r15.replacementExists);

// ---------------------------------------------------------------- 16
console.log('\n16. D30/D32: the line is authored, has two halves, and varies between repeats');
const r16 = J(`(() => {
  const g = __mk(151); const id = __target(g); __bothBodies(g, id);
  const line = (action, ctx, over) => {
    __open(g, id, over || { pose: 'back', covers: 'off', detection: 40, floor: 10, heat: 30 });
    const r = nightStepAction(g, id, action, ctx);
    return r ? composeNightLine(g, id, r, ctx) : null;
  };
  const a = line('thigh.both.hand.knead.steady', 'r1');
  const b = line('thigh.both.hand.knead.steady', 'r2');
  const aAgain = line('thigh.both.hand.knead.steady', 'r1');
  // Half two is keyed on STATE, so the SAME action at a different heat reads
  // differently -- that is what makes a repeat feel like a scene progressing.
  const cold = line('nipple.both.fingers.circle.gentle', 'h', { pose:'back', covers:'off', detection: 20, floor: 5, heat: 2 });
  const hot  = line('nipple.both.fingers.circle.gentle', 'h', { pose:'back', covers:'off', detection: 20, floor: 5, heat: 55 });
  // Sweep a wide set for leaked template tokens and empty halves.
  const sweep = [];
  const cfg = BOUNDARY.nightScene;
  for (const p of Object.keys(cfg.parts)) {
    const side = __sideFor(p);
    const instBase = Object.keys(cfg.parts[p].acc)[0];
    for (const m of nightMotionsFor(p, instBase)) {
      const motion = cfg.motions[m];
      const pose = motion.pose ? motion.pose.from[0] : __poseFor(p);
      const covers = motion.covers ? motion.covers.from[0] : 'off';
      __open(g, id, { pose, covers, detection: 40, floor: 10, heat: 30, evidence: __allTags() });
      const actionId = composeNightActionId(p, side, instBase, m, 'firm');
      const r = nightStepAction(g, id, actionId, 'sw');
      if (!r) continue;
      const L = composeNightLine(g, id, r, 'sw');
      if (!L || !L.act || !L.response) { sweep.push('empty half: ' + actionId); continue; }
      if (/[{}]/.test(L.text)) sweep.push('leaked token: ' + L.text);
      if (/\\s{2,}|\\s\\./.test(L.text)) sweep.push('whitespace: ' + JSON.stringify(L.text));
      if (!/\\.$/.test(L.act)) sweep.push('act not a sentence: ' + L.act);
    }
  }
  // A phrasing failure must degrade, never take the mechanics with it.
  const savedFrames = BOUNDARY.nightScene.prose.actFrames;
  const savedVerdict = BOUNDARY.nightScene.prose.verdict;
  BOUNDARY.nightScene.prose.actFrames = [];
  BOUNDARY.nightScene.prose.verdict = {};
  __open(g, id, { pose: 'back', covers: 'off', detection: 40, floor: 10, heat: 30 });
  const starved = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'f');
  let degraded = null, threw = false;
  try { degraded = composeNightLine(g, id, starved, 'f'); } catch (e) { threw = true; }
  BOUNDARY.nightScene.prose.actFrames = savedFrames;
  BOUNDARY.nightScene.prose.verdict = savedVerdict;
  return {
    twoHalves: !!(a.act && a.response),
    variesBetweenRepeats: a.text !== b.text,
    reproducible: a.text === aAgain.text,
    stateKeyed: cold.response !== hot.response,
    sweepProblems: sweep.slice(0, 6), sweptClean: sweep.length === 0,
    degradedNotThrown: !threw && !!degraded,
    mechanicsStood: starved !== null && typeof starved.wakeDelta === 'number',
    samples: [a.text, b.text, cold.text, hot.text],
  };
})()`);
check('a line has both halves — what you did, and what she did back (D32)', r16.twoHalves, JSON.stringify(r16.samples));
check('the same action twice gives two different lines (the per-repeat counter is in the seed)', r16.variesBetweenRepeats);
check('...and the same (seed, action, counter) reproduces the identical line', r16.reproducible);
check('half two is keyed on STATE: the same touch reads differently at heat 2 and heat 55', r16.stateKeyed);
check('a full sweep leaks no {template} token, empty half, or stray whitespace', r16.sweptClean, JSON.stringify(r16.sweepProblems));
check('an emptied prose pool degrades to the fallback rather than throwing...', r16.degradedNotThrown);
check('...and the mechanics stand regardless (invariant 2)', r16.mechanicsStood);

// ---------------------------------------------------------------- 17
console.log('\n17. Nothing progresses once a session is resolved (invariant 2)');
const r17 = J(`(() => {
  const g = __mk(161); const id = __target(g); __bothBodies(g, id);
  __open(g, id, { pose: 'back', covers: 'off', detection: 10, floor: 2, heat: 10, evidence: ['fluids'], resolved: 'exit' });
  const r = nightStepAction(g, id, 'thigh.both.hand.knead.steady', 'x');
  const applied = applyNightStep(g, id, { detection: 99, floor: 99, heat: 99, actionId: 'x', climaxCount: 9, xp: 9 });
  return { stepRefused: r === null, applyRefused: applied === null,
           endRefused: resolveNightSceneEnd(g, id, 'abandon') === null,
           abandonRefused: abandonNightScene(g, id) === null };
})()`);
check('nightStepAction refuses a resolved session', r17.stepRefused);
check('applyNightStep refuses to write onto a resolved session', r17.applyRefused);
check('resolveNightSceneEnd refuses to re-resolve', r17.endRefused);
check('abandonNightScene refuses a resolved session', r17.abandonRefused);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
