// ===== SECTION: COOKING (food-overhaul Phase 5, D8/D14/D16) =====
// The pure cooking engine. Everything in this file is a pure function of
// (state, seed): planCook turns a recipe + the player's choices into a
// step plan, resolveCookPlan rolls every step's quality and its failures
// deterministically from the plan's seed, computeGrade maps the final
// quality onto the F–S+ ladder (GRADES), and buildPlate stamps the
// resolved outcome onto the Phase-3 plate INSTANCE — ITEMS' makePlate is
// the sum-of-parts base, this file owns EXECUTION. Same inputs, same
// plate (design invariant 4: the engine decides, the narrator only
// flavors; invariant 1: whatever it produces is snapshotted once).
//
// Phase 6 wires real EQUIPMENT_DEFS through equipmentState() — the rest
// of this file reads ONLY the shape that function returns, so the tier
// work lands without touching any of these signatures.

// The kitchen's equipment as a pure function of gameState. Phase 6
// (D12/D13/D14): equipmentState reads EQUIPMENT_DEFS through the
// FACILITY_DEFS/RenoFix tier pipeline — the row the CURRENT world.upgrades
// tier of each equipment's facility picks. Every engine reader (canPerformVerb,
// resolveCookStep, planCook, autocookThreshold) consumes THIS object, never
// the tables, so a tier change is a data edit and the engine's signatures
// stay untouched.
function equipmentState(gameState) {
  const stove = equipmentTierState(gameState, 'stove') || {};
  const oven = equipmentTierState(gameState, 'oven') || {};
  const mixer = equipmentTierState(gameState, 'mixer') || {};
  return {
    burnRiskMult: stove.burnRiskMult ?? 1.0,          // tier-1 burner — burn risk is the base rate
    processTimeMult: mixer.processTimeMult ?? 1.0,    // a better mixer speeds the mixing steps
    tempPrecision: stove.tempPrecision ?? 0,          // 0 = coarse — heat choices still matter at tier 1
    mixingVerbs: [...(mixer.unlocks || COOK_TUNING.mixingVerbs || [])],  // the mixer's unlocked verbs
    burners: stove.burners ?? 1,                      // for displays ("4 burners")
    ovenPresent: !!oven.present,                      // bake/roast without one = improvising (heat-miss)
    ovenTempPrecision: oven.tempPrecision ?? 0,       // the oven's own precision for bake/roast quality
    autocookSteps: stove.autocookSteps ?? 0,          // D14: grade-steps the stove lowers auto-cook by
  };
}

// The active tier row of one EQUIPMENT_DEFS entry for a gameState: reads
// world.upgrades[def.facility].tier, indexes the facility's FACILITY_DEFS
// ladder, and returns the matching row (unknown/absent tier → 'functional',
// the day-one baseline). Same construction-aware read the facility system
// itself uses (isFacilityFunctional etc.) — old saves with no upgrades map
// get the starting tier and play identically to a fresh game.
function equipmentTierState(gameState, equipmentId) {
  const def = EQUIPMENT_DEFS[equipmentId];
  if (!def) return null;
  const facDef = FACILITY_DEFS[def.facility];
  const tier = gameState?.world?.upgrades?.[def.facility]?.tier
    || (typeof FACILITY_STARTING_TIERS !== 'undefined' ? FACILITY_STARTING_TIERS[def.facility] : null)
    || 'functional';
  const idx = facDef?.tiers?.findIndex(t => t.tier === tier) ?? -1;
  const i = idx >= 0 ? idx : 1;
  return def.tiers[i] || def.tiers[def.tiers.length - 1] || def.tiers[0];
}

// D10 — capability is the gate. A method can run in a given cookware only
// when DISH_DEFS (the single owning capability table, config.js) declares
// it; `none` needs no cookware at all.
function cookwareCanMethod(cookwareKey, method) {
  if (method === 'none' || !method) return true;
  const cw = DISH_DEFS[cookwareKey];
  return !!cw?.capabilities?.includes(method);
}

// Whether the kitchen physically owns a piece of cookware. Tier-1 owns the
// basic set (they're part of the apartment, like the stove itself); Phase 6
// can modulate this through equipment/furniture without touching callers.
function kitchenCookwareAvailable(gameState, cookwareKey) {
  if (!cookwareKey) return true;   // method 'none' — nothing to own
  return COOK_TUNING.basicCookware.includes(cookwareKey);
}

// The verbs a kitchen can perform: processing verbs are universal (there's
// always a knife); mixing verbs (knead/whip/blend) need the mixer's
// capability (D12 — Phase 5's tier-1 mixer provides all of them, Phase 6
// gates by tier); a METHOD verb needs cookware with that capability (D10).
function canPerformVerb(verb, gameState, cookwareKey) {
  if (COOK_TUNING.mixingVerbs?.includes(verb)) {
    return equipmentState(gameState).mixingVerbs.includes(verb);
  }
  if (METHODS[verb]) return cookwareCanMethod(cookwareKey || METHODS[verb].cookware, verb);
  return true; // a plain processing verb — chopping needs no gate
}

// The ingredient's "natural" prep — the verb its food group does best
// (D16: verbs × ingredient tags). COOK_TUNING.prepByGroup is the table.
function naturalVerbFor(def) {
  const g = foodGroupOf(def);
  return COOK_TUNING.prepByGroup[g] || 'slice';
}

// The processing verbs a player may pick for an ingredient (all that the
// kitchen can perform at this equipment level).
function processingVerbOptions(gameState) {
  return Object.keys(COOK_TUNING.processVerbs).filter(v => canPerformVerb(v, gameState, null));
}

// The OBJECT_DEFS entry of whatever container a kitchen source ref names
// (null for the player's bag, the 1.0 baseline — the same shape
// freshnessOf reads).
function containerDefForSource(sourceId, gameState) {
  if (!sourceId || sourceId === 'player') return null;
  for (const bucket of Object.values(gameState?.objects || {})) {
    const o = (bucket && Object.values(bucket).find(o => o && o.id === sourceId));
    if (o) return OBJECT_DEFS[o.defId] || null;
  }
  return null;
}

// Captures each ingredient's freshness at PLAN time — a stale onion cooks
// worse, and the snapshot keeps the engine deterministic (invariant 4).
// `factor` 1 = fresh/good, <1 for stale/spoiled. Drawn from the same
// kitchenSources order the effects will destroy in.
function ingredientFreshnessSnapshot(gameState, ctx, recipe) {
  const now = gameDaysNow(gameState?.meta?.clock);
  const out = {};
  for (const ing of recipe?.ingredients || []) {
    let n = 0, sum = 0;
    for (const src of kitchenSources(gameState, ctx)) {
      const cdef = containerDefForSource(src.id, gameState);
      for (const stack of src.contents || []) {
        if (stack.defId !== ing.defId) continue;
        const fr = freshnessOf(stack, cdef, now);
        const f = !fr ? 1
          : fr.key === 'rotten' ? 0
          : fr.key === 'spoiled' ? ROT.spoiledRestoreMultiplier
          : fr.key === 'stale' ? ROT.staleRestoreMultiplier : 1;
        sum += f; n++;
      }
    }
    out[ing.defId] = { factor: n > 0 ? sum / n : 1 };
  }
  return out;
}

// Reagent availability for the cook screen (salt/spice/oil/butter run out —
// the taste gate then bites). Reads the same kitchen pool the action cooks
// from.
function reagentAvailability(gameState, ctx) {
  const pool = typeof kitchenIngredientPool === 'function' ? kitchenIngredientPool(gameState, ctx) : [];
  const out = {};
  for (const id of Object.keys(COOK_TUNING.reagents)) out[id] = stackQty(pool, id) > 0;
  return out;
}

// --- planCook: the recipe → step plan builder ---
// Steps come out in a FIXED order (prep per ingredient in recipe order,
// then declared mixing steps, then the method) so every resolution with the
// same (state, seed) rolls the same draws in the same order. `opts`:
//   seed        number (default: a fresh roll — the engine stays pure given
//               any seed; the caller decides what to feed it)
//   roomId      where the kitchen is (defaults to the player's location)
//   auto        true = no player choices (the harness / auto-cook path) —
//               natural verbs, default seasoning for cooked methods
//   choices     { verbs: {defId: verb}, fat: reagentId|null,
//                seasoning: [reagentId], heat, timing }
function planCook(recipe, gameState, opts = {}) {
  const method = recipe?.method || 'none';
  const m = METHODS[method] || METHODS.none;
  const roomId = opts.roomId || gameState?.player?.location || 'kitchen';
  const ctx = { roomId };
  const wanted = opts.cookware || (m.cookware || recipe?.cookware || null);
  // D10: the gate decides. If the requested cookware can't do the method,
  // fall back to the method's own cookware (and if that's not in the
  // kitchen either, the plan still records it — kitchenCookwareAvailable
  // is what the UI warns about; a tier-1 kitchen owns everything).
  const cookware = cookwareCanMethod(wanted, method) ? wanted : m.cookware;
  const seed = opts.seed != null ? (Number(opts.seed) || 0) : Math.floor(Math.random() * 2 ** 31);
  const choices = opts.choices || {};
  const seasoning = Array.isArray(choices.seasoning)
    ? [...choices.seasoning]
    : opts.auto && method !== 'none' ? [...COOK_TUNING.defaultSeasoning]
    : [];
  // The fat choice rides in the same seasoning list as the flavors (the
  // engine reads ONE reagent list for flavor, kcal and consumption) — the
  // UI's Oil/Butter pick lives on choices.fat, so merge it in. A fat is
  // never a flavor (kind 'fat'), so it can't fix or break the taste gate.
  if (choices.fat && !seasoning.includes(choices.fat)) seasoning.push(choices.fat);
  const steps = [];
  for (const ing of recipe?.ingredients || []) {
    const verb = choices.verbs?.[ing.defId] || naturalVerbFor(ITEM_DEFS[ing.defId]);
    steps.push({
      type: 'prep', defId: ing.defId, qty: ing.qty || 1, verb,
      minutes: COOK_TUNING.prepMinutes,
    });
  }
  // Phase 6 (D12): the mixer's processTimeMult scales the MIXING steps —
  // a stand mixer kneads/whisks/blends faster than a hand mixer. Prep
  // (knife work) and the method itself are untouched. Minutes stay a pure
  // function of (state, seed): the equipment row is state, not a roll.
  const processMult = equipmentState(gameState).processTimeMult ?? 1;
  for (const mixVerb of recipe?.mix || []) {
    steps.push({
      type: 'mix', verb: mixVerb,
      minutes: Math.max(1, Math.round(COOK_TUNING.mixMinutes * processMult)),
    });
  }
  const heat = choices.heat || m.burner || 'medium';
  const timing = choices.timing || 'standard';
  steps.push({ type: 'method', method, heat, timing, minutes: m.timeMin });
  const minutes = Math.round(steps.reduce((s, st) => s + st.minutes, 0));
  return {
    recipe, method, cookware, seed, steps, seasoning,
    heat, timing, minutes,
    freshness: ingredientFreshnessSnapshot(gameState, ctx, recipe),
  };
}

// The deterministic per-step RNG: seeded by (recipe, step index, plan seed,
// optional rescue salt). Each step gets its OWN stream so re-resolving a
// plan after a rescue (which appends a step) never perturbs earlier steps'
// draws — add-salt changes the seasoning outcome, not the burn roll.
function stepRng(plan, stepIndex, salt) {
  const key = `${plan.recipe.id}:${stepIndex}${salt ? ':' + salt : ''}:${plan.seed}`;
  return mulberry32(hashStr(key));
}

// Resolve ONE step deterministically against the plan's seed. Pure: reads
// plan/gs, draws exactly the same number of rng values every time, returns
// the resolved step (quality + failure flags). Called by resolveCookPlan
// and directly by the harness.
function resolveCookStep(step, plan, gameState) {
  const rng = stepRng(plan, step.index, step.rescueSalt);
  const player = gameState?.player;
  const skill = typeof skillMod === 'function' ? skillMod(player, 'cooking', 'cookQuality') : 0.5;
  const skillTerm = (skill - 0.5) * COOK_TUNING.skillQualityWeight;
  if (step.type === 'prep') {
    const def = ITEM_DEFS[step.defId];
    const natural = naturalVerbFor(def);
    const bonus = COOK_TUNING.processVerbs[step.verb]?.qualityBonus || 0;
    const fit = step.verb === natural ? bonus : bonus * COOK_TUNING.wrongVerbFraction;
    const fresh = plan.freshness?.[step.defId]?.factor ?? 1;
    const freshTerm = (fresh - 1) * COOK_TUNING.freshQualityWeight;
    const luck = (rng() - 0.5) * COOK_TUNING.rollSpread;
    const quality = clamp(COOK_TUNING.stepBase + fit + skillTerm + freshTerm + luck, 0, 1);
    return { ...step, quality };
  }
  if (step.type === 'mix') {
    const bonus = COOK_TUNING.processVerbs[step.verb]?.qualityBonus || 0;
    const luck = (rng() - 0.5) * COOK_TUNING.rollSpread;
    const quality = clamp(COOK_TUNING.stepBase + bonus + skillTerm + luck, 0, 1);
    return { ...step, quality };
  }
  // method step
  const m = METHODS[step.method] || METHODS.none;
  const eq = equipmentState(gameState);
  // Phase 6 (D12/D13): the equipment term. A bake/roast on a stove with no
  // oven reads as a heat miss — you're improvising, not cooking wrong — so
  // it gets the miss penalty and the miss's burn risk. Otherwise the
  // stove/oven's tempPrecision shrinks the miss penalty AND the miss burn
  // risk (temperature control forgives both directions), and a MATCHED
  // heat earns a small precision edge on top of the fit bonus.
  const ovenMissing = m.oven && !eq.ovenPresent;
  const missPenalty = COOK_TUNING.heatMissPenalty * (1 - (eq.tempPrecision ?? 0) * COOK_TUNING.tempPrecisionMissFraction);
  const matched = step.heat === (m.burner || 'medium');
  const heatFit = ovenMissing
    ? -COOK_TUNING.heatMissPenalty
    : matched ? COOK_TUNING.heatFitBonus : -missPenalty;
  const luck = (rng() - 0.5) * COOK_TUNING.rollSpread;
  let quality = clamp(COOK_TUNING.methodBase + heatFit + skillTerm + luck, 0, 1);
  if (matched && !ovenMissing && (eq.tempPrecision ?? 0) > 0) {
    quality += (eq.tempPrecision ?? 0) * COOK_TUNING.tempPrecisionBonus;
  }
  quality = clamp(quality, 0, 1);
  const skillF = (skill - 0.5) * COOK_TUNING.skillFailureWeight;
  let burnt = false, raw = false, mushy = false;
  if (step.method !== 'none') {
    const burnChance = clamp(
      COOK_TUNING.burnRiskBase * (eq.burnRiskMult ?? 1.0)
      + (heatFit < 0 ? COOK_TUNING.heatMissBurnRisk * (1 - (eq.tempPrecision ?? 0) * COOK_TUNING.tempPrecisionBurnFraction) : 0)
      + (COOK_TUNING.timingBurn[step.timing] || 0)
      - skillF, COOK_TUNING.minFailureChance, 0.8);
    burnt = rng() < burnChance;
    const rawChance = clamp(COOK_TUNING.rawRiskBase + (COOK_TUNING.timingRaw[step.timing] || 0) - skillF, COOK_TUNING.minFailureChance, 0.7);
    raw = rng() < rawChance;
    if (['simmer', 'boil', 'steam', 'bake'].includes(step.method) && step.timing === 'bold') {
      const mushyChance = clamp(COOK_TUNING.mushyRiskBase - skillF, COOK_TUNING.minFailureChance, 0.5);
      mushy = rng() < mushyChance;
    }
  }
  if (burnt) quality *= COOK_TUNING.burnt.qualityMult;
  if (raw) quality *= COOK_TUNING.raw.qualityMult;
  if (mushy) quality *= COOK_TUNING.mushy.qualityMult;
  return { ...step, quality: clamp(quality, 0, 1), burnt, raw, mushy };
}

// Resolve the whole plan: every step plus the D8 taste gate and the final
// quality. Pure and deterministic per (plan, gameState). The failure flags
// that survive to `flaws` follow D15's rules: burnt = any method step
// burnt (a finish-rescue can't un-char), raw = the LAST method step raw
// (finish cooking actually cooks it through), mushy = any soft method step
// pushed too hard. bland/overseasoned come straight off the seasoning.
function resolveCookPlan(plan, gameState) {
  const stepResults = (plan.steps || []).map((s, i) => resolveCookStep({ ...s, index: i }, plan, gameState));
  const seasoning = plan.seasoning || [];
  const flavor = seasoning.filter(r => COOK_TUNING.reagents[r]?.kind === 'seasoning').length;
  const fat = seasoning.find(r => COOK_TUNING.reagents[r]?.kind === 'fat') || null;
  const cooked = (plan.method || 'none') !== 'none';
  const methodSteps = stepResults.filter(s => s.type === 'method');
  const last = methodSteps[methodSteps.length - 1];
  const flaws = [];
  if (cooked && flavor === 0) flaws.push('bland');
  if (cooked && flavor >= COOK_TUNING.overseasonedAt) flaws.push('overseasoned');
  if (methodSteps.some(s => s.burnt)) flaws.push('burnt');
  if (last?.raw) flaws.push('raw');
  if (methodSteps.some(s => s.mushy)) flaws.push('mushy');
  const unique = [...new Set(flaws)];
  const prepSteps = stepResults.filter(s => s.type === 'prep' || s.type === 'mix');
  const prepQ = prepSteps.length > 0 ? prepSteps.reduce((a, s) => a + s.quality, 0) / prepSteps.length : COOK_TUNING.methodBase;
  const methodQ = last ? last.quality : COOK_TUNING.methodBase;
  let quality = clamp(prepQ * 0.35 + methodQ * 0.65, 0, 1);
  for (const f of unique) quality *= (COOK_TUNING[f]?.qualityMult ?? 1);
  if (fat && cooked) quality += COOK_TUNING.fatQualityBonus;
  quality = clamp(quality, 0, 1);
  const reagentKcal = seasoning.reduce((s, r) => s + (COOK_TUNING.reagents[r]?.kcalPerUse || 0), 0);
  return { stepResults, flaws: unique, quality, reagentKcal, flavor, fat, prepQ, methodQ };
}

// --- Rescue paths (D15: recoverable, flavorful failures) ---
// Mutates a plan copy by applying one rescue and returns the new plan (or
// null when the rescue doesn't apply). add_salt/add_spice feed the taste
// gate (a bland batch turns good — or, stacked onto an already-seasoned
// dish, overseasoned: the overseasonedAt band sits at 3 and the base UI
// only reaches 2, so a rescue portion is exactly how a dish gets to it).
// Each rescueId applies AT MOST ONCE per plan (`rescues` marker) — salt is
// portion-counted, not presence-gated, so adding salt to an already-salted
// dish is exactly the "it needs salt... no, too much" loop D8 describes.
// finish appends a second, shorter method pass that re-rolls the raw flag
// (and can itself burn — rescuing is never free).
function applyCookRescue(plan, rescueId, gameState) {
  if (plan.rescues?.includes(rescueId)) return null;
  if (rescueId === 'add_salt' || rescueId === 'add_spice') {
    const seasoning = [...plan.seasoning, rescueId === 'add_salt' ? 'salt' : 'spices'];
    return { ...plan, seasoning, rescues: [...(plan.rescues || []), rescueId], minutes: plan.minutes + COOK_TUNING.seasoningMinutes };
  }
  if (rescueId === 'finish') {
    const m = METHODS[plan.method] || METHODS.none;
    const finishMinutes = Math.max(2, Math.round(m.timeMin * COOK_TUNING.finishMinutesFrac));
    const steps = [...plan.steps, { type: 'method', method: plan.method, heat: plan.heat, timing: 'standard', rescueSalt: 'finish', minutes: finishMinutes }];
    return { ...plan, steps, rescues: [...(plan.rescues || []), 'finish'], minutes: Math.round(steps.reduce((s, st) => s + st.minutes, 0)) };
  }
  return null;
}

// --- computeGrade: the D14 F–S+ ladder ---
// The single reader of GRADES (config.js). gradeFromQuality (ITEMS)
// delegates here, so the ladder cannot be read two ways.
function computeGrade(quality) {
  for (const step of GRADES) {
    if (quality >= step.min) return step.grade;
  }
  return 'F';
}

// --- Auto-cook (food-overhaul Phase 6, D14/D15) ---
// The grade a recipe must clear before its INSTANT-cook path unlocks.
// Base bar is AUTO_COOK_TUNING.baseGrade; the stove's autocookSteps walk
// it DOWN the GRADES ladder (a better range needs a weaker proof). Same
// (state, seed) purity as the rest of the engine: equipment is state.
function autocookThreshold(recipe, gameState) {
  const base = AUTO_COOK_TUNING.baseGrade || 'A-';
  const steps = equipmentState(gameState).autocookSteps ?? 0;
  const from = GRADES.findIndex(g => g.grade === base);
  const start = from >= 0 ? from : GRADES.length - 1;
  return GRADES[Math.min(GRADES.length - 1, start + steps)].grade;
}

// Ordinal grade comparison: true when `grade` is at-or-above `threshold`
// on the S+..F ladder (S+ is the top).
function gradeAtOrAbove(grade, threshold) {
  const a = GRADES.findIndex(g => g.grade === grade);
  const b = GRADES.findIndex(g => g.grade === threshold);
  if (a < 0 || b < 0) return false;
  return a <= b;
}

// Whether instant-cook is open for a recipe right now: a previously cooked
// plate cleared the current (equipment-adjusted) threshold and the proof
// was recorded on world.autoCookCleared — forever, until equipment makes
// the bar easier still.
function autoCookUnlocked(recipe, gameState) {
  if (!recipe) return false;
  const cleared = gameState?.world?.autoCookCleared?.[recipe.id];
  if (!cleared) return false;
  return gradeAtOrAbove(cleared, autocookThreshold(recipe, gameState));
}

// --- buildPlate: the engine's plate builder ---
// ITEMS' makePlate is the D5 sum-of-parts base (ingredient kcal + variety
// bonus, component list, batch servings); THIS function stamps the
// execution: final quality = the ingredient story blended with how the
// cook went, grade from computeGrade, kcal adjusted for reagents and a
// burnt batch, and the flaws recorded on the snapshot. Either way the
// result is stamped once and never re-derived (invariant 1).
function buildPlate(gameState, recipe, ingredients, method, cookware, prepared) {
  const plan = prepared?.plan || planCook(recipe, gameState, { auto: true, seed: prepared?.seed != null ? prepared.seed : 0 });
  const outcome = prepared?.outcome || resolveCookPlan(plan, gameState);
  const base = makePlate(gameState, recipe, ingredients, method, cookware);
  const quality = clamp(
    base.quality * COOK_TUNING.ingredientQualityWeight + outcome.quality * COOK_TUNING.executionQualityWeight,
    0, PLATE_TUNING.qualityCap);
  const totalSv = Math.max(1, base.servings?.total || 1);
  const reagentKcal = Math.min(outcome.reagentKcal, COOK_TUNING.reagentKcalCap);
  const kcalMult = outcome.flaws.includes('burnt') ? COOK_TUNING.burnt.kcalMult : 1;
  let components = base.components;
  if (method === 'none' || !METHODS[method]) {
    // No-cook meals: the component stage is the prep verb's stage word
    // ("sliced bread", "chopped salad"), not a cooking stage.
    const verbByDef = {};
    for (const st of plan.steps || []) if (st.type === 'prep') verbByDef[st.defId] = st.verb;
    components = (base.components || []).map(c => ({
      ...c, stage: COOK_TUNING.processVerbs[verbByDef[c.defId]]?.stage || c.stage,
    }));
  }
  return {
    ...base,
    quality: Math.round(quality * 100) / 100,
    grade: computeGrade(quality),
    kcalPerServing: Math.round(((base.kcalPerServing * totalSv) + reagentKcal) * kcalMult / totalSv),
    components,
    flaws: outcome.flaws,
  };
}

// --- autoCookPlate: the instant-cook plate (food-overhaul Phase 6, D14) ---
// The mastered-recipe reproduction: planCook on auto (natural verbs + the
// default seasoning), one seeded roll, and the final quality FLOORED at the
// current auto-cook threshold's min — a recipe you've proven you know never
// comes out worse than the grade that proved it, though the roll still
// carries upward from there. Flaws can still land (a burnt pan is a burnt
// pan whatever your history with the recipe) and the flavour lines survive;
// only the quality is guaranteed. Same (state, seed) purity as buildPlate.
function autoCookPlate(gameState, recipe, seed, plan, outcome) {
  const p = plan || planCook(recipe, gameState, { auto: true, seed });
  const o = outcome || resolveCookPlan(p, gameState);
  const plate = buildPlate(gameState, recipe, recipe.ingredients, recipe.method, recipe.cookware, { plan: p, outcome: o, seed });
  const threshold = autocookThreshold(recipe, gameState);
  const floor = GRADES.find(g => g.grade === threshold)?.min ?? 0;
  if (plate.quality < floor) {
    plate.quality = Math.round(floor * 100) / 100;
    plate.grade = computeGrade(plate.quality);
  }
  return plate;
}

// --- Outcome → words (the engine's flavor; the narrator only adds color) ---
function cookStepLine(step, resolved) {
  if (!resolved) return '';
  const verbLabel = COOK_TUNING.processVerbs[step.verb]?.label || step.verb;
  const what = step.type === 'prep' ? `${verbLabel} ${ITEM_DEFS[step.defId]?.label || step.defId}`
    : step.type === 'mix' ? `${verbLabel} the mixture`
    : `Cooked ${(METHODS[step.method]?.label || step.method).toLowerCase()}${step.heat && step.method !== 'none' ? ' on ' + step.heat : ''}`;
  const q = Math.round((resolved.quality || 0) * 100);
  const grade = q >= 80 ? 'well' : q >= 55 ? 'okay' : q >= 35 ? 'roughly' : 'poorly';
  return { what, quality: q, grade };
}

function cookFlawLines(outcome) {
  return (outcome?.flaws || []).map(f => COOK_TUNING[f]?.line || f);
}

// A lowercase narration fragment for the action's log line.
function cookFlawTail(flaw) {
  const line = COOK_TUNING[flaw]?.line;
  if (!line) return 'it came out a little rough';
  return line.charAt(0).toLowerCase() + line.slice(1);
}
