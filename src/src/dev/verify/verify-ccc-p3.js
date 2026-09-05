// continuous-cadence-closure-plan.md — Phase 3: Needs decay path
// unification (D4, D11).
//
//   node src/src/dev/verify/verify-ccc-p3.js
//
// resolveBatch's per-tick applyNeedsHeartbeat call used to always pass a
// flat CLOCK.tickMinutes (30), regardless of the batch's true elapsed span
// — so a discrete action that merely CROSSED one 30-minute grid line (ticks
// = 1) got charged a full 30 minutes of NPC needs decay even if only a few
// real minutes passed, and a longer misaligned span could just as easily be
// undercharged. This phase threads the batch's TRUE minutes in
// (opts.needsMinutes, mirroring what advancePhoneBattery already gets) and
// divides it evenly across the batch's ticks, so the total matches the real
// span exactly — while each tick still calls applyNeedsHeartbeat
// separately, right after that tick's own resolveTick, so restore still
// keys on the block/location THAT tick actually resolved to (the
// needs-and-heartbeat-plan's own Phase 3 reason the per-tick call exists at
// all — an end-of-batch single call would key on only the FINAL block and
// lose sleep restore entirely). Design invariant 1: omitting needsMinutes
// (every existing whole-tick caller — sleep, gig blocks, etc.) must stay
// byte-identical to the old flat-30-per-tick behavior.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'commitments.js', 'world.js', 'movement.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  // A seeded house, clock parked deep in the 'standard' template's sleep
  // range (weekday sleep is [0,450) per verify-ccc-p2's own probe) so every
  // resident's schedule block stays 'sleep' — stable, no transition — across
  // the handful of ticks these checks advance through. Needs are reset to a
  // known mid-range value, comfortably away from the [0,100] clamp in
  // either direction, so decay stays linear in minutes.
  __house = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    h.meta = { seed: h.seed, clock: { day: 2, minutes: 60 }, contentConfig: null, sessionLog: [] };
    for (const npc of Object.values(h.npcs)) {
      npc.bible = npc.bible || {};
      npc.bible.scheduleTemplate = 'standard';
      npc.needs = { hunger: 50, energy: 50, hygiene: 50, social: 50, comfort: 50, stimulation: 50, desire: 50 };
    }
    return h;
  };
  __firstNpcId = (h) => Object.keys(h.npcs)[0];
  __needs = (h, id) => h.npcs[id].needs;
  __block = (h, id) => h.npcs[id].schedule && h.npcs[id].schedule.currentBlock;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration + fixture sanity');
const fixture = J(`(() => {
  const h = __house(20260902);
  const id = __firstNpcId(h);
  return { hasResolveBatch: typeof resolveBatch === 'function', npcCount: Object.keys(h.npcs).length, tickMinutes: CLOCK.tickMinutes };
})()`);
check('resolveBatch is a real function', fixture.hasResolveBatch);
check('fixture house has residents', fixture.npcCount > 0, JSON.stringify(fixture));
check('CLOCK.tickMinutes is 30 (this harness assumes it)', fixture.tickMinutes === 30, JSON.stringify(fixture));

// ---------------------------------------------------------------- 1
console.log('\n1. Default (no needsMinutes) is byte-identical to needsMinutes=ticks*CLOCK.tickMinutes (Invariant 1 — old flat-30-per-tick behavior unchanged)');
const defaultVsExplicit = J(`(() => {
  const h1 = __house(20260902);
  const id = __firstNpcId(h1);
  const r1 = resolveBatch(h1, 1, {});
  const h2 = __house(20260902);
  const r2 = resolveBatch(h2, 1, { needsMinutes: CLOCK.tickMinutes });
  return { defaultNeeds: __needs(r1.state, id), explicitNeeds: __needs(r2.state, id), block: __block(r1.state, id) };
})()`);
check('block stayed sleep (fixture assumption holds)', defaultVsExplicit.block === 'sleep', JSON.stringify(defaultVsExplicit));
check('omitting needsMinutes matches passing ticks*CLOCK.tickMinutes exactly, need-by-need',
  Object.keys(defaultVsExplicit.defaultNeeds).every(k => defaultVsExplicit.defaultNeeds[k] === defaultVsExplicit.explicitNeeds[k]),
  JSON.stringify(defaultVsExplicit));

// ---------------------------------------------------------------- 2
console.log('\n2. The bug fix: a 1-tick batch charges the TRUE span, not a flat 30 minutes');
const shortVsFull = J(`(() => {
  const h30 = __house(20260902);
  const id = __firstNpcId(h30);
  const start = { ...__needs(h30, id) };
  const r30 = resolveBatch(h30, 1, { needsMinutes: 30 });
  const h5 = __house(20260902);
  const r5 = resolveBatch(h5, 1, { needsMinutes: 5 });
  const n30 = __needs(r30.state, id), n5 = __needs(r5.state, id);
  return {
    start,
    delta30: { hunger: n30.hunger - start.hunger, energy: n30.energy - start.energy },
    delta5: { hunger: n5.hunger - start.hunger, energy: n5.energy - start.energy },
  };
})()`);
// Old code would have applied a flat 30 minutes regardless of needsMinutes,
// so delta5 would equal delta30 exactly — the bug this phase fixes. The
// fixed code must scale delta5 down to 5/30 of delta30 (block/location are
// stable across both single-tick calls, so decay is exactly linear).
const ratio = 5 / 30;
check('a 5-minute batch decays hunger by exactly 5/30 of a 30-minute batch (not the old flat 30)',
  Math.abs(shortVsFull.delta5.hunger - shortVsFull.delta30.hunger * ratio) < 1e-9, JSON.stringify(shortVsFull));
check('a 5-minute batch decays energy by exactly 5/30 of a 30-minute batch (not the old flat 30)',
  Math.abs(shortVsFull.delta5.energy - shortVsFull.delta30.energy * ratio) < 1e-9, JSON.stringify(shortVsFull));
check('the 5-minute batch is strictly smaller in magnitude than the 30-minute batch (sanity: not a no-op, not equal to the old bug)',
  Math.abs(shortVsFull.delta5.hunger) > 0 && Math.abs(shortVsFull.delta5.hunger) < Math.abs(shortVsFull.delta30.hunger), JSON.stringify(shortVsFull));

// ---------------------------------------------------------------- 3
console.log('\n3. The closed-form invariant: 2 ticks of 15 minutes each sums to the same total as 1 tick of 30 minutes (block stable across both)');
const splitVsWhole = J(`(() => {
  const hWhole = __house(20260902);
  const id = __firstNpcId(hWhole);
  const rWhole = resolveBatch(hWhole, 1, { needsMinutes: 30 });
  const hSplit = __house(20260902);
  const rSplit = resolveBatch(hSplit, 2, { needsMinutes: 30 });
  return {
    blockWhole: __block(rWhole.state, id), blockSplit: __block(rSplit.state, id),
    whole: __needs(rWhole.state, id), split: __needs(rSplit.state, id),
  };
})()`);
check('the 2-tick split stayed in the same sleep block both ticks (fixture assumption holds)',
  splitVsWhole.blockWhole === 'sleep' && splitVsWhole.blockSplit === 'sleep', JSON.stringify(splitVsWhole));
check('2x15-minute ticks land on the identical final needs as 1x30-minute tick (the closed-form invariant)',
  ['hunger', 'energy', 'hygiene', 'comfort', 'stimulation'].every(k => Math.abs(splitVsWhole.whole[k] - splitVsWhole.split[k]) < 1e-9),
  JSON.stringify(splitVsWhole));

// ---------------------------------------------------------------- 4
console.log('\n4. Sleep-restore is still keyed per-tick, not lost to an end-of-batch final-block read (the needs-and-heartbeat-plan invariant this phase must not break)');
const sleepAcrossWake = J(`(() => {
  // standard.weekday: sleep [0,450) morning [480,600) — start at 07:00
  // (420) with 3 ticks (90 minutes) crossing into morning (08:00, minute
  // 480) partway through, exactly the "8h sleep ending at 08:00" shape the
  // sim.js comment warns about, compressed to a few ticks for a fast test.
  const h = SIM_generateHouse(20260902, 3);
  h.meta = { seed: h.seed, clock: { day: 2, minutes: 420 }, contentConfig: null, sessionLog: [] };
  const id = Object.keys(h.npcs)[0];
  for (const npc of Object.values(h.npcs)) {
    npc.bible = npc.bible || {};
    npc.bible.scheduleTemplate = 'standard';
    npc.needs = { hunger: 50, energy: 30, hygiene: 50, social: 50, comfort: 50, stimulation: 50, desire: 50 };
  }
  const r = resolveBatch(h, 3, { needsMinutes: 90 });
  return {
    finalBlock: r.state.npcs[id].schedule && r.state.npcs[id].schedule.currentBlock,
    energyBefore: 30, energyAfter: r.state.npcs[id].needs.energy,
    sleepRestorePerMinute: NEEDS.npcSleepRestorePerMinute, energyDecayPerMinute: NEEDS.npcEnergyDecayPerMinute,
  };
})()`);
// If sleep restore were only keyed on the FINAL block (the bug the current
// per-tick shape prevents), the whole 90-minute span would read 'morning'
// and energy would move by -decayPerMinute*90 only (net negative, no
// restore at all — the "8h sleep ending at 08:00 restores nothing" bug).
// With per-tick keying, at least the first tick(s) (still inside sleep,
// 420-450) apply the sleep restore, so energy should move UP overall,
// or at minimum lose far less than a pure-decay 90 minutes would.
const pureDecay90 = sleepAcrossWake.energyDecayPerMinute * 90;
const netIfAllRestored = (sleepAcrossWake.sleepRestorePerMinute - sleepAcrossWake.energyDecayPerMinute) * 90;
check('crossing sleep->morning mid-batch still credits SOME sleep restore (energy does not simply fall by the full 90-minute pure-decay amount)',
  sleepAcrossWake.energyAfter > sleepAcrossWake.energyBefore - pureDecay90 + 1e-9, JSON.stringify({ sleepAcrossWake, pureDecay90 }));

// ---------------------------------------------------------------- 5
console.log('\n5. Wiring: time.js\'s advanceAndResolveMinutes applies NPC needs directly when no tick boundary is crossed (the ticks===0 gap this phase also closes)');
const fs = require('fs');
const timeSrc = fs.readFileSync(require('path').join(__dirname, '..', '..', 'srcfiles', 'time.js'), 'utf8');
function bodyOf(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`);
  if (start < 0) return null;
  let depth = 0, i = src.indexOf('{', start), end = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(start, end + 1);
}
const aarmBody = bodyOf(timeSrc, 'advanceAndResolveMinutes');
check('advanceAndResolveMinutes exists', !!aarmBody);
check('its ticks===0 branch now calls applyNeedsHeartbeat directly (player: false, since decayPlayerNeeds already owns the player on this path)',
  !!aarmBody && /advancePhoneBattery\(currentGameState, minutes\);[\s\S]*?applyNeedsHeartbeat\(currentGameState, minutes, \{ player: false \}\)/.test(aarmBody),
  aarmBody ? 'call not found in the expected shape/order' : 'function not found');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
