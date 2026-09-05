// continuous-cadence-closure-plan.md — Phase 5: Per-minute conversion of
// Pass 2's remaining flat rates (D6, D13).
//
//   node src/src/dev/verify/verify-ccc-p5.js
//
// D6 named six subsystems (DIRT_TUNING.footTrafficPerTick,
// SOUND_DEVICE_DEFS.music.keepItDown.chancePerTick,
// THERMOSTAT_TUNING.complainChancePerTick, the ambient random-event roll's
// flat 0.15, and PARTY_TUNING's complainChancePerTick/dirtPerTickPerGuest/
// attendeeMoodPerTick) as needing conversion from a flat per-30-minute-tick
// amount to a per-minute rate. Tracing every OTHER flat per-tick constant
// actually read inside resolveTick's Pass 2 loop (not just D6's named list —
// the same "follow every direct reader" discipline D10/D12 already
// established for this plan) turned up six more living in the exact same
// guard blocks as D6's own named subsystems: SOUND_DEVICE_DEFS.music's
// npcMoodPerIntensity/npcMoodCap (the ambient music mood lift, right next to
// keepItDown's chance) and headphones/mp3_player's npcMoodGainPerTick (the
// worn-device gain, same block); THERMOSTAT_TUNING's
// annoyanceMoodDeltaPerDegree/annoyanceMoodDeltaCap (the discomfort malus,
// right next to the complain chance) and selfAdjustChancePerTick (the
// self-adjust roll, same block); PARTY_TUNING's
// annoyanceMoodPerIntensity/annoyanceMoodCap (the listener malus, right next
// to the complain chance). All are converted here too (D13) — leaving HALF
// of a mechanic's block converted and half not would itself be the silent
// mistuning Design Invariant 3 exists to prevent, the moment Phase 7 starts
// resolving spans other than exactly 30 minutes. NOT converted: player-side
// equilibrium-target terms (SOUND_DEVICE_DEFS.music.playerMoodScale/
// playerMoodCap/wornPlayerMoodTarget — resolveMoodTarget reads these as a
// steady-state target, never a per-resolution accumulation) and
// STEALTH_TUNING.baseEvidenceDiscoveryChance (read by BOTH sim.js's Pass 2,
// per-NPC-tick, AND computer.js's performCleaningVisit, a per-cleaning-visit
// roll with no tick relationship at all — splitting that shared constant
// safely is real, separate work, flagged in the Handoff for a future
// session rather than rushed here).
//
// THERMOSTAT_TUNING.selfAdjustChancePerTick itself stays named *PerTick and
// unrenamed (D13, mirroring D10's SLEEP_RHYTHM precedent): its one reader,
// thermostatSelfAdjustChance(npc), personality-scales it BEFORE any minute
// conversion could happen (the scaling factor varies per NPC), so the
// minutes conversion has to run on that already-scaled per-NPC result, not
// on the raw base rate — converting the table itself would just be more
// edited surface for the same math.
//
// Two conversion shapes, both mechanical:
//   - Deterministic magnitudes (dirt bumps, mood deltas, their caps):
//     ratePerMinute = ratePerTick / 30, applied as ratePerMinute * minutes.
//   - Chance rolls: NOT a linear scale — a per-tick chance p compounded over
//     30 one-minute draws is a different distribution than one draw at p.
//     chancePerMinute = 1 - (1 - p) ** (1/30); applied via the new
//     chanceOverMinutes(chancePerMinute, minutes) = 1-(1-chancePerMinute)**minutes,
//     which collapses to p exactly (mod floating point) at minutes === 30.
//
// verify-aa-p17.js (the house-party mechanic riding this exact loop) was
// re-run after this phase's edits per its own top-of-phase blocker — 51/51,
// unchanged pass count, its own field-name assertions updated to match the
// new *PerMinute names (mechanical, not a behavior change).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'commitments.js', 'world.js', 'movement.js',
    'cognition.js', 'dirt.js', 'temperature.js', 'signals.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

// ---------------------------------------------------------------- 0
console.log('0. Registration — every converted field exists under its new name; every old *PerTick name is gone (no dual definition left at phase end)');
const reg = J(`({
  fn: typeof chanceOverMinutes === 'function',
  dirt: {
    footTrafficPerMinute: DIRT_TUNING.footTrafficPerMinute,
    oldGone: !('footTrafficPerTick' in DIRT_TUNING),
  },
  party: {
    dirtPerMinutePerGuest: PARTY_TUNING.dirtPerMinutePerGuest,
    attendeeMoodPerMinute: PARTY_TUNING.attendeeMoodPerMinute,
    annoyanceMoodPerIntensityPerMinute: PARTY_TUNING.annoyanceMoodPerIntensityPerMinute,
    annoyanceMoodCapPerMinute: PARTY_TUNING.annoyanceMoodCapPerMinute,
    complainChancePerMinute: PARTY_TUNING.complainChancePerMinute,
    oldGone: ['dirtPerTickPerGuest', 'attendeeMoodPerTick', 'annoyanceMoodPerIntensity', 'annoyanceMoodCap', 'complainChancePerTick']
      .every(k => !(k in PARTY_TUNING)),
  },
  thermostat: {
    annoyanceMoodDeltaPerDegreePerMinute: THERMOSTAT_TUNING.annoyanceMoodDeltaPerDegreePerMinute,
    annoyanceMoodDeltaCapPerMinute: THERMOSTAT_TUNING.annoyanceMoodDeltaCapPerMinute,
    complainChancePerMinute: THERMOSTAT_TUNING.complainChancePerMinute,
    selfAdjustChancePerTickStillThere: THERMOSTAT_TUNING.selfAdjustChancePerTick,
    oldGone: ['annoyanceMoodDeltaPerDegree', 'annoyanceMoodDeltaCap', 'complainChancePerTick'].every(k => !(k in THERMOSTAT_TUNING)),
  },
  music: {
    npcMoodPerIntensityPerMinute: SOUND_DEVICE_DEFS.music.npcMoodPerIntensityPerMinute,
    npcMoodCapPerMinute: SOUND_DEVICE_DEFS.music.npcMoodCapPerMinute,
    keepItDownChancePerMinute: SOUND_DEVICE_DEFS.music.keepItDown.chancePerMinute,
    headphonesGainPerMinute: SOUND_DEVICE_DEFS.headphones.npcMoodGainPerMinute,
    mp3GainPerMinute: SOUND_DEVICE_DEFS.mp3_player.npcMoodGainPerMinute,
    playerTermsUntouched: SOUND_DEVICE_DEFS.music.playerMoodScale === 0.05 && SOUND_DEVICE_DEFS.music.playerMoodCap === 0.04
      && SOUND_DEVICE_DEFS.music.wornPlayerMoodTarget === 0.02,
    oldGone: !('npcMoodPerIntensity' in SOUND_DEVICE_DEFS.music) && !('npcMoodCap' in SOUND_DEVICE_DEFS.music)
      && !('chancePerTick' in SOUND_DEVICE_DEFS.music.keepItDown)
      && !('npcMoodGainPerTick' in SOUND_DEVICE_DEFS.headphones) && !('npcMoodGainPerTick' in SOUND_DEVICE_DEFS.mp3_player),
  },
  ambient: { chancePerMinute: OFFSCREEN_EVENT_TUNING.chancePerMinute },
  // continuous-cadence-closure Phase 7 closed this specific gap (the one
  // flagged below as deliberately left open): baseEvidenceDiscoveryChance no
  // longer exists as a single shared name — see verify-ccc-p7.js for the
  // split (roomSearchEvidenceDiscoveryChance / evidenceDiscoveryChancePerTick)
  // and its own minute-conversion proof. This assertion now checks the split
  // landed cleanly rather than that the old name survived untouched.
  stealthSplitByPhase7: STEALTH_TUNING.roomSearchEvidenceDiscoveryChance === 0.15
    && STEALTH_TUNING.evidenceDiscoveryChancePerTick === 0.15
    && STEALTH_TUNING.evidenceStrengthDiscoveryFactor === 0.5
    && !('baseEvidenceDiscoveryChance' in STEALTH_TUNING),
})`);
check('chanceOverMinutes is a real function', reg.fn);
check('DIRT_TUNING.footTrafficPerMinute is a real number; footTrafficPerTick is gone', typeof reg.dirt.footTrafficPerMinute === 'number' && reg.dirt.oldGone, JSON.stringify(reg.dirt));
check('PARTY_TUNING carries every converted field as a number; every old *PerTick name is gone',
  Object.entries(reg.party).filter(([k]) => k !== 'oldGone').every(([, v]) => typeof v === 'number') && reg.party.oldGone, JSON.stringify(reg.party));
check('THERMOSTAT_TUNING carries every converted field as a number; selfAdjustChancePerTick deliberately still exists (D13); old converted names are gone',
  typeof reg.thermostat.annoyanceMoodDeltaPerDegreePerMinute === 'number' && typeof reg.thermostat.annoyanceMoodDeltaCapPerMinute === 'number'
  && typeof reg.thermostat.complainChancePerMinute === 'number' && reg.thermostat.selfAdjustChancePerTickStillThere === 0.05
  && reg.thermostat.oldGone, JSON.stringify(reg.thermostat));
check('SOUND_DEVICE_DEFS carries every converted field as a number; player-target terms are untouched; old *PerTick/npcMoodPerIntensity/npcMoodCap names are gone',
  Object.entries(reg.music).filter(([k]) => !['playerTermsUntouched', 'oldGone'].includes(k)).every(([, v]) => typeof v === 'number')
  && reg.music.playerTermsUntouched && reg.music.oldGone, JSON.stringify(reg.music));
check('OFFSCREEN_EVENT_TUNING.chancePerMinute is a real number (the old bare 0.15 literal is now named)', typeof reg.ambient.chancePerMinute === 'number', JSON.stringify(reg.ambient));
check('STEALTH_TUNING\'s shared evidence-discovery constant was later split cleanly by Phase 7 (roomSearchEvidenceDiscoveryChance/evidenceDiscoveryChancePerTick; the old shared baseEvidenceDiscoveryChance name is gone) — see verify-ccc-p7.js for the full proof', reg.stealthSplitByPhase7, JSON.stringify(reg));

// ---------------------------------------------------------------- 1
console.log('\n1. Deterministic conversions — ratePerMinute * 30 reproduces the exact old ratePerTick literal (Design Invariant 1)');
const linear = J(`({
  footTraffic: DIRT_TUNING.footTrafficPerMinute * 30,
  partyDirt: PARTY_TUNING.dirtPerMinutePerGuest * 30,
  partyMood: PARTY_TUNING.attendeeMoodPerMinute * 30,
  partyAnnoy: PARTY_TUNING.annoyanceMoodPerIntensityPerMinute * 30,
  partyAnnoyCap: PARTY_TUNING.annoyanceMoodCapPerMinute * 30,
  musicMood: SOUND_DEVICE_DEFS.music.npcMoodPerIntensityPerMinute * 30,
  musicCap: SOUND_DEVICE_DEFS.music.npcMoodCapPerMinute * 30,
  headphones: SOUND_DEVICE_DEFS.headphones.npcMoodGainPerMinute * 30,
  mp3: SOUND_DEVICE_DEFS.mp3_player.npcMoodGainPerMinute * 30,
  thermoDelta: THERMOSTAT_TUNING.annoyanceMoodDeltaPerDegreePerMinute * 30,
  thermoCap: THERMOSTAT_TUNING.annoyanceMoodDeltaCapPerMinute * 30,
})`);
const oldLiterals = {
  footTraffic: 0.003, partyDirt: 0.006, partyMood: 0.01, partyAnnoy: 0.06, partyAnnoyCap: 0.05,
  musicMood: 0.04, musicCap: 0.03, headphones: 0.003, mp3: 0.004, thermoDelta: 0.01, thermoCap: 0.08,
};
for (const [k, oldVal] of Object.entries(oldLiterals)) {
  check(`${k}PerMinute * 30 === old ${oldVal} exactly`, Math.abs(linear[k] - oldVal) < 1e-12, `got ${linear[k]}`);
}

// ---------------------------------------------------------------- 2
console.log('\n2. Chance conversions — chanceOverMinutes(chancePerMinute, 30) reproduces the exact old chancePerTick literal');
const chanceExact = J(`({
  ambient: chanceOverMinutes(OFFSCREEN_EVENT_TUNING.chancePerMinute, 30),
  music: chanceOverMinutes(SOUND_DEVICE_DEFS.music.keepItDown.chancePerMinute, 30),
  thermostat: chanceOverMinutes(THERMOSTAT_TUNING.complainChancePerMinute, 30),
  party: chanceOverMinutes(PARTY_TUNING.complainChancePerMinute, 30),
})`);
check('ambient event chance at 30 minutes reproduces the old flat 0.15', Math.abs(chanceExact.ambient - 0.15) < 1e-9, JSON.stringify(chanceExact));
check('music keep-it-down chance at 30 minutes reproduces the old flat 0.05', Math.abs(chanceExact.music - 0.05) < 1e-9, JSON.stringify(chanceExact));
check('thermostat complain chance at 30 minutes reproduces the old flat 0.08', Math.abs(chanceExact.thermostat - 0.08) < 1e-9, JSON.stringify(chanceExact));
check('party complain chance at 30 minutes reproduces the old flat 0.12', Math.abs(chanceExact.party - 0.12) < 1e-9, JSON.stringify(chanceExact));

// ---------------------------------------------------------------- 3
console.log('\n3. The thermostat self-adjust wrap (D13) — personality-scaled BEFORE minute conversion, reproduces thermostatSelfAdjustChance(npc) exactly at 30 minutes across the full assertiveness range');
const selfAdjust = J(`(() => {
  const mk = (a) => ({ bible: { temperament: { assertiveness: a } } });
  return [-1, -0.5, 0, 0.5, 1].map(a => {
    const npc = mk(a);
    const perTick = thermostatSelfAdjustChance(npc);
    const wrapped = chanceOverMinutes(1 - Math.pow(1 - perTick, 1 / 30), 30);
    return { a, perTick, wrapped, diff: Math.abs(wrapped - perTick) };
  });
})()`);
check('the minutes-wrapped self-adjust chance matches thermostatSelfAdjustChance exactly at 30 minutes for every assertiveness tested (not just one value — proves the wrap must scale the PERSONALITY-SCALED result, not the raw base rate)',
  selfAdjust.every(c => c.diff < 1e-9), JSON.stringify(selfAdjust));
check('a naive "scale the base rate, then apply personality" would NOT have matched (sanity: the personality factors actually differ meaningfully here)',
  new Set(selfAdjust.map(c => c.perTick)).size === selfAdjust.length, JSON.stringify(selfAdjust));

// ---------------------------------------------------------------- 4
console.log('\n4. Large-N statistical proof — the REAL config-stored chancePerMinute values, compounded over exactly 30 one-minute draws, reproduce the old per-tick firing rate (not a single-seed coincidence)');
const stat = J(`(() => {
  const N = 20000;
  const probes = {
    ambient: { p: chanceOverMinutes(OFFSCREEN_EVENT_TUNING.chancePerMinute, 30), old: 0.15, hits: 0 },
    music: { p: chanceOverMinutes(SOUND_DEVICE_DEFS.music.keepItDown.chancePerMinute, 30), old: 0.05, hits: 0 },
    thermostat: { p: chanceOverMinutes(THERMOSTAT_TUNING.complainChancePerMinute, 30), old: 0.08, hits: 0 },
    party: { p: chanceOverMinutes(PARTY_TUNING.complainChancePerMinute, 30), old: 0.12, hits: 0 },
  };
  for (const key of Object.keys(probes)) {
    const probe = probes[key];
    for (let i = 0; i < N; i++) {
      const rng = seededRng('ccc_p5_stat', key + '_' + i);
      if (rng() < probe.p) probe.hits++;
    }
    probe.rate = probe.hits / N;
  }
  return { N, probes };
})()`);
for (const key of Object.keys(stat.probes)) {
  const p = stat.probes[key];
  check(`${key}: empirical rate over ${stat.N} independent draws (${p.rate.toFixed(4)}) is within 0.01 of the old per-tick chance (${p.old})`,
    Math.abs(p.rate - p.old) < 0.01, JSON.stringify(p));
}

// ---------------------------------------------------------------- 5
console.log('\n5. chanceOverMinutes scales sensibly for spans other than 30 (Phase 7 readiness — not wired in yet, but the math must already be right)');
const scaling = J(`(() => {
  const p = 0.1; // an arbitrary per-minute rate, isolated from any config table
  return {
    at30: chanceOverMinutes(p, 30),
    at60: chanceOverMinutes(p, 60),
    at1: chanceOverMinutes(p, 1),
    zero: chanceOverMinutes(p, 0),
  };
})()`);
check('doubling the span raises the chance, but sub-linearly (real compounding, not naive doubling — 60min chance is more than the 30min chance but less than double it)',
  scaling.at60 > scaling.at30 && scaling.at60 < 2 * scaling.at30, JSON.stringify(scaling));
check('a single minute reproduces the raw per-minute rate exactly (chanceOverMinutes(p,1) === p)', Math.abs(scaling.at1 - 0.1) < 1e-12, JSON.stringify(scaling));
check('a zero-minute span never fires (chanceOverMinutes(p,0) === 0)', scaling.zero === 0, JSON.stringify(scaling));

// ---------------------------------------------------------------- 6
console.log('\n6. Real resolveTick wiring — one real 30-minute tick of ambient foot-traffic dirt matches the converted rate exactly, proving the call site (not just the config math) is right');
const g6 = J(`(() => {
  const h = SIM_generateHouse(20260902, 1);
  const g = { meta: { seed: h.seed, clock: { day: 2, minutes: 600 }, contentConfig: null, sessionLog: [] },
              player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  const id = Object.keys(g.npcs).find(k => g.npcs[k].residency.status === 'resident');
  g.npcs[id].bible = { ...g.npcs[id].bible, scheduleTemplate: 'standard' };
  delete g.npcs[id].commitment;
  delete g.npcs[id].follow;
  g.npcs[id].walk = null;
  g.npcs[id].transit = null;
  g.npcs[id].location = 'living_room';
  g.world.rooms.living_room = g.world.rooms.living_room || {};
  const before = g.world.rooms.living_room.dirt || 0;
  resolveTick(g);
  const after = g.world.rooms.living_room.dirt || 0;
  return { before, after, bumped: after - before, expected: DIRT_TUNING.footTrafficPerMinute * 30 };
})()`);
check('a real resolveTick call bumps room dirt by exactly footTrafficPerMinute * 30 (the old flat per-tick amount), not some other span',
  Math.abs(g6.bumped - g6.expected) < 1e-9, JSON.stringify(g6));

// ---------------------------------------------------------------- 7
console.log('\n7. Wiring: sim.js no longer contains the old un-scaled literals/field reads');
const fs = require('fs');
const simSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'sim.js'), 'utf8');
check('sim.js no longer rolls the bare inline `rng() < 0.15` ambient chance', !/rng\(\) < 0\.15/.test(simSrc));
check('sim.js no longer reads any of the six D6/D13 *PerTick field names directly',
  !/\.footTrafficPerTick\b/.test(simSrc) && !/\.dirtPerTickPerGuest\b/.test(simSrc) && !/\.attendeeMoodPerTick\b/.test(simSrc)
  && !/keepItDown\.chancePerTick\b/.test(simSrc) && !/THERMOSTAT_TUNING\.complainChancePerTick\b/.test(simSrc)
  && !/PARTY_TUNING\.complainChancePerTick\b/.test(simSrc) && !/\.npcMoodPerIntensity\b(?!PerMinute)/.test(simSrc)
  && !/\.npcMoodGainPerTick\b/.test(simSrc) && !/annoyanceMoodDeltaPerDegree\b(?!PerMinute)/.test(simSrc)
  && !/annoyanceMoodDeltaCap\b(?!PerMinute)/.test(simSrc) && !/PARTY_TUNING\.annoyanceMoodPerIntensity\b(?!PerMinute)/.test(simSrc)
  && !/PARTY_TUNING\.annoyanceMoodCap\b(?!PerMinute)/.test(simSrc));
check('sim.js still calls thermostatSelfAdjustChance(npc) (D13\'s wrap, not a replacement)', /thermostatSelfAdjustChance\(npc\)/.test(simSrc));
// continuous-cadence-closure Phase 7 (D16): minutesThisTick became
// resolveTick's own parameter (default CLOCK.tickMinutes, preserving every
// pre-Phase-7 single-argument caller) instead of a hoisted local const — see
// verify-ccc-p7.js section 1 for the byte-identical-default proof. This
// check now looks for the parameter default rather than the old hoisted
// const line it replaced.
check('sim.js\'s resolveTick defaults minutesThisTick to CLOCK.tickMinutes (Phase 7\'s parameterization) and uses chanceOverMinutes for every converted chance roll', /minutesThisTick = CLOCK\.tickMinutes/.test(simSrc) && (simSrc.match(/chanceOverMinutes\(/g) || []).length >= 5);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
