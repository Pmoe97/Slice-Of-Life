// ===== SECTION: ORBITAL — S4714, the game's random number generator =====
//
// Every random number in this game is produced by a star falling around a
// supermassive black hole.
//
// S4714 is a real star in the S-cluster at the galactic centre (Peißker et
// al. 2020). It orbits Sagittarius A* — 4.3 million solar masses — on a
// wildly eccentric path: it spends most of a ~12-year orbit crawling through
// the outer reaches at a few hundred km/s, then whips through pericenter at
// roughly 24,000 km/s. That is about 8% the speed of light. It is the
// fastest-moving star currently known.
//
// This file propagates that orbit with real two-body mechanics (Kepler's
// equation, solved properly) and turns the star's instantaneous state into
// uniform random numbers. It is a completely unnecessary way to pick which
// line of dialogue an NPC says. That is the point.
//
// --- How this is an honest PRNG, not a decoration ---
//
// A PRNG is a state plus an output function. Here the STATE is genuinely the
// star: a scalar epoch, advanced every call, from which the eccentric
// anomaly, orbital radius and instantaneous speed are computed by actual
// orbital mechanics. The OUTPUT FUNCTION is an avalanche hash over the bits
// of those three quantities.
//
// The hash is doing the statistical work, and it has to: orbital motion is
// smooth and periodic, which is the opposite of random. Feeding the speed out
// directly would give you a beautifully non-uniform, strongly autocorrelated
// mess. What the orbit provides is a state that never repeats and that varies
// enormously between calls — the step is a golden-ratio fraction of the
// period, so consecutive draws land on opposite sides of the orbit and the
// speed swings across its full ~130x range every single call. The hash then
// whitens that into something that passes for uniform.
//
// So: the star is the state, the hash is the whitener, and the physics is
// real. Nobody needs this.
//
// --- Determinism (design invariant 6) is fully preserved ---
//
// seededRng(seed, key) still returns a pure deterministic function of its
// arguments — same save, same sequence, forever, across reloads and
// re-renders. All that changed is what happens between the seed going in and
// the number coming out. The unseeded orbitalRandom() replaces raw
// Math.random() and is seeded from wall-clock time at first use, so the
// places that wanted genuine per-session variety still get it.

// --- Physical constants (SI) ---
const ORBITAL_CONST = {
  AU: 1.495978707e11,          // metres
  GM_SUN: 1.32712440018e20,    // m^3/s^2 — the Sun's standard gravitational parameter
  SECONDS_PER_YEAR: 31557600,  // Julian year
  C: 299792458,                // m/s, for the "percent of lightspeed" readout
};

// --- Derived orbital elements, computed once from S4714_ORBIT (CONFIG) ---
// Lazy so this file has no load-time dependency on config.js's evaluation
// order; every consumer here is a runtime call anyway.
let _s4714 = null;
function s4714Elements() {
  if (_s4714) return _s4714;
  const o = S4714_ORBIT;
  const a = o.semiMajorAxisAu * ORBITAL_CONST.AU;              // metres
  const mu = o.centralMassSolar * ORBITAL_CONST.GM_SUN;        // m^3/s^2
  const n = Math.sqrt(mu / (a * a * a));                       // mean motion, rad/s
  const period = 2 * Math.PI / n;                              // seconds
  _s4714 = {
    a, mu, n, period,
    e: o.eccentricity,
    periapsis: a * (1 - o.eccentricity),
    apoapsis: a * (1 + o.eccentricity),
    periodYears: period / ORBITAL_CONST.SECONDS_PER_YEAR,
    // Step one golden-ratio fraction of an orbit per draw. An irrational
    // fraction never revisits a previous phase, and it maximises the gap
    // between consecutive samples — at e=0.985 that means every draw jumps
    // between a near-stationary crawl and a relativistic sprint.
    stepSeconds: period * 0.6180339887498949,
  };
  return _s4714;
}

// --- Kepler's equation: M = E - e·sin(E), solved for E ---
// Newton-Raphson. At e=0.985 the naive starter E=M diverges near pericenter
// (the derivative 1 - e·cos E collapses toward 1-e = 0.015 there), so this
// uses Danby's starter, which is built for exactly this regime, and caps the
// iteration count rather than trusting convergence blindly.
function keplerSolve(M, e) {
  // Normalise to [-π, π] — the starter assumes it.
  let m = M % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  if (m < -Math.PI) m += 2 * Math.PI;

  let E = m + 0.85 * e * Math.sign(m || 1);
  for (let i = 0; i < 64; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    // fp is bounded below by 1-e (0.015 here), so it never actually hits
    // zero — the guard is for a pathological config, not for this orbit.
    if (Math.abs(fp) < 1e-15) break;
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// The star's state at time `t` (seconds since an arbitrary epoch). Returns
// real quantities: where it is and how fast it is going.
function s4714StateAt(t) {
  const el = s4714Elements();
  const M = el.n * t;
  const E = keplerSolve(M, el.e);
  const cosE = Math.cos(E);
  const r = el.a * (1 - el.e * cosE);
  // True anomaly via the half-angle form — numerically well behaved at high e,
  // unlike the acos(...) form which loses precision near pericenter.
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + el.e) * Math.sin(E / 2),
    Math.sqrt(1 - el.e) * Math.cos(E / 2),
  );
  // vis-viva
  const v = Math.sqrt(el.mu * (2 / r - 1 / el.a));
  return { t, M, E, nu, r, v };
}

// --- Bit mixing ---
// Doubles go in via their raw IEEE-754 bits so the full mantissa contributes;
// rounding the physics to a few decimals first would throw away most of the
// entropy the orbit is carrying.
const _obF64 = new Float64Array(1);
const _obU32 = new Uint32Array(_obF64.buffer);

// murmur3 fmix32 — a proper avalanche finalizer. This is what makes the
// output uniform; see the header.
function _fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function _mixDouble(h, x) {
  _obF64[0] = x;
  h = _fmix32(h ^ _obU32[0]);
  h = _fmix32(h ^ _obU32[1]);
  return h;
}

// --- The generator ---
// Returns a function producing uniforms in [0,1), exactly like mulberry32's
// contract, so it drops straight into seededRng / weightedPick / pickUnique.
//
// `startSeconds` places the star somewhere on its orbit; the counter is mixed
// in alongside the orbital state purely to guarantee a long period — float
// accumulation in `t` would eventually cycle on its own, and a silent short
// cycle in the game's main RNG would be a real bug rather than a fun one.
function orbitalStream(startSeconds) {
  const el = s4714Elements();
  let t = startSeconds;
  let counter = 0;
  return function orbitalRng() {
    t += el.stepSeconds;
    counter = (counter + 1) | 0;
    const s = s4714StateAt(t);
    let h = 0x9e3779b9 ^ counter;
    h = _mixDouble(h, s.E);
    h = _mixDouble(h, s.r);
    h = _mixDouble(h, s.v);
    // 32-bit uint -> [0,1). 2^-32 keeps the result strictly below 1.
    return _fmix32(h) * 2.3283064365386963e-10;
  };
}

// Turn a seed pair into a starting epoch. The hash spreads seeds across the
// whole orbit rather than clustering them near pericenter, where the orbit's
// own variation is most extreme.
function orbitalEpochFor(baseSeed, subSeed) {
  const el = s4714Elements();
  const h = hashStr(String(baseSeed) + '|' + String(subSeed));
  return (h / 4294967296) * el.period;
}

// Seeded: the drop-in replacement for the old mulberry32-backed seededRng.
// Same contract — pure function of (baseSeed, subSeed).
function s4714Rng(baseSeed, subSeed) {
  return orbitalStream(orbitalEpochFor(baseSeed, subSeed));
}

// --- Unseeded: the Math.random() replacement ---
// One module-level star, started from wall-clock time at first use so that
// per-session variety (flavour-text picks, NPC reaction rolls) stays genuinely
// unpredictable the way Math.random() was. Never use this for anything that
// has to survive a reload — that is what seededRng is for.
let _liveStar = null;
function orbitalRandom() {
  if (!_liveStar) {
    _liveStar = orbitalStream(
      (Date.now() % 1e9) * 1000 + Math.floor(performance.now() * 1000),
    );
  }
  return _liveStar();
}

// --- Flavour / diagnostics ---
// Where is the star right now, and how fast is it going? Handy for verifying
// the propagator, and the whole reason any of this exists.
function s4714Report(t) {
  const el = s4714Elements();
  const at = typeof t === 'number' ? t : (Date.now() / 1000);
  const s = s4714StateAt(at);
  const kms = s.v / 1000;
  return {
    trueAnomalyDeg: +(s.nu * 180 / Math.PI).toFixed(2),
    radiusAu: +(s.r / ORBITAL_CONST.AU).toFixed(2),
    speedKmS: +kms.toFixed(1),
    percentLightspeed: +(100 * s.v / ORBITAL_CONST.C).toFixed(3),
    periodYears: +el.periodYears.toFixed(2),
    periapsisAu: +(el.periapsis / ORBITAL_CONST.AU).toFixed(2),
    apoapsisAu: +(el.apoapsis / ORBITAL_CONST.AU).toFixed(2),
    summary: `S4714 is ${(s.r / ORBITAL_CONST.AU).toFixed(0)} AU from Sgr A*, `
      + `moving at ${kms.toFixed(0)} km/s (${(100 * s.v / ORBITAL_CONST.C).toFixed(2)}% c).`,
  };
}
