// Vocation & Lifestyle Expansion — Phase 8: income → rent.
//
// Phase 8's goal, quoted from the plan: incomeBand and incomeSource finally drive
// the rent contribution that defaultRoommateShare was the declared placeholder for.
// Every resident used to pay the flat 0.15; now computeRent derives each
// contributor's share from incomeBand × incomeSource via incomeRentShare (ECONOMY.
// rent.incomeShare), still clamped to the building's [min, max] ceiling, still
// multiplied down for a shared bedroom — the ceiling and the rent total are the
// load-bearing invariants and must be UNCHANGED (design invariant 7 / D22: this
// is the only phase allowed to touch a rent number, and here it does not — no
// knob of the tuned curve moves, only the per-roommate default becomes income-aware).
//
// Careful, deliberate corners:
//   - residency.rentShare is NOT pre-populated anymore (it used to be set to the
//     flat 0.15 at move-in). null = "derive from income."
//   - negotiatedOrDerived ignores a stored value equal to defaultRoommateShare: an old
//     save's 0.15 was the uniform default, not a negotiation, so old saves pick up
//     income-driven rent too. Only a genuinely different value (the future agreement
//     system) is honored.
//   - 'none' incomeSource contributes 0 — the broke roommate pushes MORE onto the
//     player, which is the "money is running out" direction, not the dangerous one.
//
// Field:   ECONOMY.rent.incomeShare (config.js) — a table, NOT an occupation
//          schema field, so D23's "field+reader" rule is satisfied trivially:
//          the reader (incomeRentShare, sim.js) ships in the same change.
// Reader:  incomeRentShare(npc) → negotiatedOrDerived(npc) → computeRent (sim.js)
// A/B:     section 3, the before/after pressure measurement over generated casts.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------- 1
console.log('\n1. incomeRentShare picks a cell by incomeBand × incomeSource');

const cells = api(`(function () {
  const mk = (source, band) => incomeRentShare({ bible: { occupation: { incomeSource: source, incomeBand: band } } });
  return {
    wage:  { low: mk('wage','low'), mid: mk('wage','mid'), high: mk('wage','high') },
    self:  { low: mk('self','low'), mid: mk('self','mid'), high: mk('self','high') },
    means: { low: mk('means','low'), mid: mk('means','mid'), high: mk('means','high') },
    none:  { low: mk('none','low'), mid: mk('none','mid'), high: mk('none','high') },
    missing: incomeRentShare({ bible: { occupation: {} } }),
  };
})()`);

// A wage-earning mid-band roommate is the archetype: the curve is centered there,
// so a typical cast lands in the same pressure band as the old flat 0.15.
check('wage/mid equals the flat default (the curve is centered on the archetype)',
  cells.wage.mid === ECONOMY_rent_default_share(),
  `wage/mid=${cells.wage.mid}, default=${ECONOMY_rent_default_share()}`);
check('a broke roommate (incomeSource none) contributes 0 regardless of band',
  cells.none.low === 0 && cells.none.mid === 0 && cells.none.high === 0);
check('income rises monotonically with band within a source',
  cells.wage.low < cells.wage.mid && cells.wage.mid < cells.wage.high);
check('variable income (self) sits at or under the wage curve of the same band',
  cells.self.low <= cells.wage.low && cells.self.mid <= cells.wage.mid && cells.self.high <= cells.wage.high);
check('means covers the same as a wage earner of the band (no roof-subsidy premium)',
  cells.means.low === cells.wage.low && cells.means.mid === cells.wage.mid && cells.means.high === cells.wage.high);
check('an illegible occupation falls back to the default (pure, null-safe)',
  cells.missing === ECONOMY_rent_default_share());

function ECONOMY_rent_default_share() { return 0.15; }

// ---------------------------------------------------------------- 2
console.log('\n2. negotiatedOrDerived — legacy vs negotiated vs derive');

const nod = api(`(function () {
  const base = { bible: { occupation: { incomeSource: 'wage', incomeBand: 'high' } } };
  return {
    null:   negotiatedOrDerived({ ...base, residency: { rentShare: null } }),
    absent: negotiatedOrDerived({ ...base, residency: {} }),
    legacy: negotiatedOrDerived({ ...base, residency: { rentShare: ECONOMY.rent.defaultRoommateShare } }),
    negotiated: negotiatedOrDerived({ ...base, residency: { rentShare: 0.30 } }),
  };
})()`);
check('null / absent residency derives from income (high wage → 0.20)',
  nod.null === 0.20 && nod.absent === 0.20, `null=${nod.null}, absent=${nod.absent}`);
check('a legacy stored 0.15 is ignored as NOT a negotiation → still derives',
  nod.legacy === 0.20);
check('a genuine negotiated share (≠ default) is honored',
  nod.negotiated === 0.30);

// ---------------------------------------------------------------- 3
console.log('\n3. THE A/B — rent pressure before vs after, over generated casts');

// Month-one is identical by construction: the game opens SOLO (opening.soloStart,
// zero roommates), so the player's share is the full rent under both models. The
// difference only ever appears once roommates live there. So the meaningful check is
// that the income model does NOT REMOVE pressure (the plan's stated fear) — on a
// sampled distribution of real casts it must land at or above the flat baseline.
const pressure = api(`(function () {
  const real = incomeRentShare;
  const mk = (seed, n) => {
    const h = SIM_generateHouse('p8-v-' + seed + '-' + n, n);
    const gs = { meta:{seed:h.seed, clock:h.clock, contentConfig:null, sessionLog:[]},
                 player:h.player, npcs:h.npcs, world:h.world, objects:h.objects };
    for (const k of Object.keys(gs.world.upgrades)) gs.world.upgrades[k] = { tier:'functional', condition:100 };
    return gs;
  };
  let baseSum = 0, afterSum = 0, ct = 0;
  let soloBase = null, soloAfter = null;
  for (const n of [1,3,5,7]) {
    for (let s = 0; s < 20; s++) {
      const gs = mk(s, n);
      incomeRentShare = () => ECONOMY.rent.defaultRoommateShare;
      const b = computeRent(gs.npcs, gs);
      incomeRentShare = real;
      const a = computeRent(gs.npcs, gs);
      baseSum += b.playerShare; afterSum += a.playerShare; ct++;
      if (s === 0 && n === 1) { soloBase = b.playerShare; soloAfter = a.playerShare; }
    }
  }
  incomeRentShare = real;
  return {
    ct,
    meanBase: baseSum / ct, meanAfter: afterSum / ct,
    meanDelta: (afterSum - baseSum) / ct,   // +ve = MORE player pressure
    soloBase, soloAfter,
    rentTotal: ECONOMY.rent.total,
    minShare: ECONOMY.rent.minRoommateShare, maxShare: ECONOMY.rent.maxRoommateShare,
    sharedMult: ECONOMY.rent.sharedRoomShareMultiplier,
  };
})()`);
console.log(`        across ${pressure.ct} casts: base ${pressure.meanBase.toFixed(0)} → after ${pressure.meanAfter.toFixed(0)} ($/wk, Δ ${pressure.meanDelta.toFixed(0)})`);
check('the income model does NOT remove pressure (mean Δ >= 0)',
  pressure.meanDelta >= 0, `Δ ${pressure.meanDelta.toFixed(0)}`);
check('month-one (solo) pressure is identical under both models (zero contributors)',
  pressure.soloBase === pressure.soloAfter && pressure.soloBase === pressure.rentTotal);
check('...and equals the full rent (player holds the lease alone at month one)',
  pressure.soloBase === pressure.rentTotal);
// Design invariant 7 — not a rent-number change: every load-bearing knob of the
// tuned curve is byte-identical to the pre-phase values.
check('the tuned rent curve is untouched (total, min, max, shared-room multiplier)',
  pressure.rentTotal === 1900 && pressure.minShare === 0.08 && pressure.maxShare === 0.30 && pressure.sharedMult === 0.8);

// Determinism: same composition in, same rent out, every call.
const det = api(`(function () {
  const h = SIM_generateHouse('p8-det', 5);
  const gs = { meta:{seed:h.seed, clock:h.clock}, player:h.player, npcs:h.npcs, world:h.world, objects:h.objects };
  for (const k of Object.keys(gs.world.upgrades)) gs.world.upgrades[k] = { tier:'functional', condition:100 };
  const a = computeRent(gs.npcs, gs);
  const b = computeRent(gs.npcs, gs);
  return JSON.stringify(a) === JSON.stringify(b) && computeRent(gs.npcs, gs).coveredByRoommates === a.coveredByRoommates;
})()`);
check('computeRent is deterministic (same input → same shares, same playerShare)', det);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
