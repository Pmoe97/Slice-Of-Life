// ===== SECTION: TEMPERATURE =====
// Actions & Activities Overhaul Phase 8 (D16) — the thermostat becomes real.
// world.thermostat = { targetC } is player-set (thermostat.raise/lower,
// defs.actions.js, ADJUST_THERMOSTAT effect). This file is the pure math
// three callers share: HVAC billing (computer.js), an NPC's comfort band and
// mood reaction to being outside it (sim.js's resolveTick, mirroring the
// existing music_too_loud shape), and the wardrobe's pick (npc.js's
// npcOutfitForContext, via the existing 'thermal' clothing stat — see
// config.js's CLOTHING_EFFECTS comment for why that stat had no reader until
// now).
//
// All PURE, all deterministic (no rng — a per-NPC comfort band is a
// deterministic hash of their id, never a live roll), same trust tier as
// flags.js's ruleCareWeight/ruleReactionSeverity: reads npc.bible.temperament
// only where D39 already established a real mapping exists, and does NOT
// invent a fake one where it doesn't (see THERMOSTAT_TUNING's own comment in
// config.js for why the comfort band itself is a fixed physical range, not a
// temperament-derived one).

// The apartment's current ambient temperature. One value for the whole
// house — the thermostat is a single central unit, not a per-room system —
// blending the season's unconditioned outdoor baseline toward the player's
// target by THERMOSTAT_TUNING.hvacEfficiency (a real HVAC doesn't perfectly
// hit its target). Deliberately has no heat-source term (cooking, occupancy)
// this phase — THERMOSTAT_TUNING is the one table any future producer adds
// a bump to, same "engine built generic enough" precedent as D38's flags
// table.
function ambientTempC(gameState) {
  const day = gameState?.meta?.clock?.day || 1;
  // seasons-and-weather-plan.md Phase 1 (W2): the outdoor side is now the
  // real day's weather and hour (seasons.js's outdoorTempC) — a smooth
  // curve whose season MEANS equal seasonOutdoorC by construction, so the
  // house is on average exactly as warm as before, but a cold snap or a hot
  // afternoon now reaches in. typeof-guarded (temperature.js loads before
  // seasons.js; a harness may load it alone): the flat season value is the
  // fallback.
  const outdoor = typeof outdoorTempC === 'function'
    ? outdoorTempC(gameState)
    : THERMOSTAT_TUNING.seasonOutdoorC[getSeasonIndex(day)];
  const targetC = gameState?.world?.thermostat?.targetC ?? THERMOSTAT_TUNING.defaultC;
  return outdoor + (targetC - outdoor) * THERMOSTAT_TUNING.hvacEfficiency;
}

// The HVAC billing multiplier — REPLACES the old flat UTILITY_THERMOSTAT=1.0
// constant (accrueHvacForDay, computer.js). Scales with the player's chosen
// DELTA from neutralC, never with the raw setting: 21°C costs baseline
// whichever season it is, 28°C costs more in every season alike. Extreme
// settings are the drama (D16) — this is what makes them cost something.
function thermostatHvacMultiplier(gameState) {
  const targetC = gameState?.world?.thermostat?.targetC ?? THERMOSTAT_TUNING.defaultC;
  return 1 + Math.abs(targetC - THERMOSTAT_TUNING.neutralC) * THERMOSTAT_TUNING.costPerDegreeC;
}

// An NPC's comfort band — a fixed physical range (THERMOSTAT_TUNING.baseMinC/
// baseMaxC) plus a small deterministic per-NPC spread, so not every resident
// reacts to the same room identically. Hashed off npcId (mulberry32/hashStr,
// sim.js — the same seeded-jitter primitive D35 used for the phone-snoop
// explicit roll), never off temperament (D39: no real trait maps to physical
// cold/heat tolerance) — personality instead scales the REACTION below.
function npcComfortBandC(npc, npcId) {
  const roll = mulberry32(hashStr(`thermcomfort_${npcId || 'npc'}`))();
  const jitter = (roll * 2 - 1) * THERMOSTAT_TUNING.comfortJitterC;
  return { minC: THERMOSTAT_TUNING.baseMinC + jitter, maxC: THERMOSTAT_TUNING.baseMaxC + jitter };
}

// Signed degrees outside this NPC's comfort band right now: negative when
// too cold, positive when too hot, 0 inside the band. The ONE shared read
// for every consumer that needs both the MAGNITUDE and the DIRECTION
// (sim.js's annoyance/complaint/self-adjust, npc.js's clothing bias) — never
// computed twice, never allowed to disagree about which way is which.
function temperatureDiscomfort(gameState, npc, npcId) {
  const ambient = ambientTempC(gameState);
  const band = npcComfortBandC(npc, npcId);
  if (ambient < band.minC) return ambient - band.minC;
  if (ambient > band.maxC) return ambient - band.maxC;
  return 0;
}

// The signed bias composeOutfit's bias.stats.thermal reads (ITEMS' own
// documented extension point: "bias lets later phases push the scoring").
// Positive (favor high-thermal items) when cold, negative (favor low/negative
// -thermal items like swimwear) when hot, zero inside the comfort band — a
// zero bias is byte-identical to composeOutfit's pre-Phase-8 behavior, since
// bias.stats.thermal simply isn't set for any wardrobe read that isn't
// currently uncomfortable.
function temperatureClothingBiasWeight(gameState, npc, npcId) {
  const d = temperatureDiscomfort(gameState, npc, npcId);
  if (d < 0) return THERMOSTAT_TUNING.clothingBiasWeight;
  if (d > 0) return -THERMOSTAT_TUNING.clothingBiasWeight;
  return 0;
}

// How likely this NPC is to nudge the thermostat themselves when
// uncomfortable, this tick — assertiveness-scaled (the closest real trait to
// "acts on it instead of just suffering," same normalisation npc.js's
// npcDeviancy already uses for openness/assertiveness). A low-assertiveness
// NPC still has SOME chance; a high one is notably more likely.
function thermostatSelfAdjustChance(npc) {
  const assertRaw = npc?.bible?.temperament?.assertiveness;
  const assert = ((typeof assertRaw === 'number' ? assertRaw : 0) + 1) / 2;
  return THERMOSTAT_TUNING.selfAdjustChancePerTick * (0.5 + assert);
}
// ===== /SECTION: TEMPERATURE =====
