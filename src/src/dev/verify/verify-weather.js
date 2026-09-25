// Seasons & Weather plan (seasons-and-weather-plan.md) — Phase 1: the
// weather, temperature and daylight engine (W1–W4); Phase 2: ambience.
//
//   node src/src/dev/verify/verify-weather.js
//
// The claims Phase 1 rests on, measured: every season's outdoor MEAN
// equals the old flat THERMOSTAT_TUNING.seasonOutdoorC (the anchors are
// solved for it — plan invariant 1), each condition's offset nets to zero
// over its season's mix, and the chain's long-run mix IS the authored mix;
// the curve is continuous across season and year boundaries; the diurnal
// swing peaks mid-afternoon; daylight is long in summer and short in winter;
// ambientTempC now reads the day (a cold snap is colder indoors) while HVAC
// billing does not move; the sky line reaches the IM prompt; and the
// rollover speaks only on the first day of summer/autumn/winter.
//
// Phase 2 (sections 8–10): a change of weather arrives at a time of day and
// the temperature eases across it (no step); the weather reaches rooms that
// see outside (the window, the balcony; a storm through the walls), in the
// scene reader and its own scene-prompt line; and the sky watch narrates a
// front arriving (worded for sleep when you slept), the rain stopping, and —
// live only — the sun going down, with the year's first snow exactly once.
//
// Phase 3 (section 11): how inviting it is outside; the balcony weighted by
// it wherever someone picks a room (never boosted by a pick among ANY common
// room); "stepping outside" in a storm becomes watching it from a window;
// the player's balcony and the loungers read the weather; and, on the same
// houses with weather on vs off, a fine day draws people out, a grim one
// empties the balcony, and the number of things people choose to do doesn't
// move — weather changes where, not whether. Plus the two scored leans (swim
// on a hot day, sauna on a bitter one), held to facility-gated drives.
//
// Phase 4 (section 12): seasonal produce prices by the whole dollar in both
// shops (and the "in season" note), and a craving lean — hearty on a cold
// day, fresh on a hot one — that only breaks ties inside a taste band.
//
// Phase 5 (section 13): dressed for the weather when going OUT (the coat on
// a cold morning, no jacket on a hot one; indoor fits still read the
// thermostat), and the seasons in the mood in day-sized beats only — a lift
// on the year's first warm day and first snow, a small floored dip for the
// sensitive in the darkest weeks, measured against the mood economy.
//
// Phase 6 (section 14): the window view in the scene art — a small bounded
// token set in the plate key and prompt for rooms that see outside, windowless
// rooms byte-identical to before, and the cast's layout unmoved by weather.
// (The pixels themselves need the real image backend; see the plan.)
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.computer.js', 'defs.actions.js', 'sim.js', 'scene.js', 'cognition.js', 'effects.js', 'items.js', 'inventory.js', 'drives.js',
    'computer.js', 'npc.js', 'llm.js', 'taste.js', 'defs.world.js', 'temperature.js', 'image.js', 'birthdays.js', 'occasions.js', 'seasons.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __g = (seed, day, minutes) => ({ meta: { seed: seed || 'wx-test', clock: { day: day || 1, minutes: minutes == null ? 720 : minutes } }, world: {}, npcs: {}, player: {} });
  __d = (si, dom, year) => ((year || 1) - 1) * 140 + si * 35 + dom;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration');
const reg = J(`(() => {
  const conds = Object.keys(WEATHER_TUNING.conditions);
  const bad = [];
  for (const [s, mix] of Object.entries(WEATHER_TUNING.mix)) {
    if (!CALENDAR.seasons.includes(s)) bad.push('season ' + s);
    for (const c of Object.keys(mix)) if (!conds.includes(c)) bad.push(s + ':' + c);
  }
  return { bad, seasons: Object.keys(WEATHER_TUNING.mix).sort(), fns: ['weatherConditionOn','outdoorTempC','daylight','weatherNow','skyLine','processWeatherForDay','seasonalBaselineC','weatherOffsetC',
    'weatherTurnMin','weatherConditionAt','weatherRoomExposure','weatherCueText','weatherRoomCue','isFirstSnowDay','skyEventsBetween','weatherChangeLine','skyWatchLines','weatherCueLine',
    'outsideAppeal','roomWeatherWeight','driveWeatherTemplate','balconySitWeather','sunbatheLine','weatherDriveLean',
    'seasonalPriceDelta','itemPriceNow','produceSeasonNote','dayMeanTempC','seasonalFoodLean',
    'outdoorDressBias','isFirstWarmDay','isDarkDay','seasonalLiftEffects','seasonalMoodForDay','firstSnowBetween',
    'windowViewToken','windowViewPhrase'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }) };
})()`);
check('every season has a mix, every mix names real conditions', reg.bad.length === 0 && JSON.stringify(reg.seasons) === JSON.stringify(['autumn', 'spring', 'summer', 'winter']), JSON.stringify(reg));
check('every public seasons.js function is defined', reg.fns);
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
check('index.html loads seasons.js once, right after occasions.js',
  (indexHtml.match(/<script src="src\/src\/srcfiles\/seasons\.js\?v=\d+"><\/script>/g) || []).length === 1
  && indexHtml.indexOf('srcfiles/occasions.js') < indexHtml.indexOf('srcfiles/seasons.js')
  && indexHtml.indexOf('srcfiles/seasons.js') < indexHtml.indexOf('srcfiles/render.js?'));
check('loadgame.js ORDER registers seasons.js after occasions.js', /'occasions\.js',[\s\S]{0,500}?'seasons\.js'/.test(fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8')));

// ---------------------------------------------------------------- 1
console.log('\n1. W2 — the season means are pinned (plan invariant 1)');
const means = J(`(() => {
  const target = THERMOSTAT_TUNING.seasonOutdoorC;
  const base = [], full = [];
  for (let si = 0; si < 4; si++) {
    // The seasonal baseline, integrated over the season (every 30 minutes).
    let s = 0, n = 0;
    for (let dom = 1; dom <= 35; dom++) for (let m = 0; m < 1440; m += 30) { s += seasonalBaselineC(si * 35 + dom + m / 1440); n++; }
    base.push(s / n);
    // The FULL model (weather + diurnal) over 60 years of one seed's weather.
    let f = 0, k = 0;
    for (let y = 1; y <= 60; y++) for (let dom = 1; dom <= 35; dom++) for (let m = 0; m < 1440; m += 180) { f += outdoorTempC(__g('means'), __d(si, dom, y), m); k++; }
    full.push(f / k);
  }
  // Offsets are re-centred per DAY (the day's gated mix): check every day of
  // the year nets to zero over its own mix.
  const offsetMeans = [];
  for (let d = 1; d <= 140; d++) {
    const mix = weatherDayMix(d); const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    offsetMeans.push(Object.entries(mix).reduce((a, [c, w]) => a + weatherOffsetC(c, d) * w, 0) / tot);
  }
  return { target, base, full, offsetMeans, anchors: seasonAnchorsC() };
})()`);
check('the seasonal baseline averages EXACTLY the old flat value in every season (within 0.01°C)', means.base.every((v, i) => Math.abs(v - means.target[i]) < 0.01), JSON.stringify({ base: means.base.map(v => v.toFixed(3)), target: means.target, anchors: means.anchors.map(v => v.toFixed(2)) }));
check('on every day of the year, the condition offsets net to zero over that day\'s mix', means.offsetMeans.length === 140 && means.offsetMeans.every(v => Math.abs(v) < 1e-9), JSON.stringify(means.offsetMeans.filter(v => Math.abs(v) >= 1e-9)));
check('the full model (weather + diurnal) over 60 years stays within 0.5°C of each season\'s old value', means.full.every((v, i) => Math.abs(v - means.target[i]) < 0.5), JSON.stringify(means.full.map(v => v.toFixed(2))));

// ---------------------------------------------------------------- 2
console.log('\n2. W1 — the chain: deterministic, the authored mix in the long run, persistent, seasonal');
const chain = J(`(() => {
  const seq = (seed, n) => Array.from({ length: n }, (_, i) => weatherConditionOn(__g(seed), i + 1));
  const a = seq('alpha', 280), a2 = seq('alpha', 280), b = seq('beta', 280);
  // Three seeds pooled: fronts make days correlated, so one seed's 150 years
  // is only ~1,700 independent days a season — its noise alone reached 2.4
  // points once storms got shorter (Phase 2), and fell to 0.5 at 1,500 years.
  // What remains is real and small: a season's first days carry the last
  // season's weather (summer's sun lingers ~1 point into autumn).
  const MIX_SEEDS = ['mix', 'mix2', 'mix3'];
  const counts = {}, persist = {};
  for (const s of CALENDAR.seasons) { counts[s] = {}; persist[s] = { same: 0, n: 0 }; }
  for (const seed of MIX_SEEDS) for (let y = 1; y <= 150; y++) for (let si = 0; si < 4; si++) {
    const s = CALENDAR.seasons[si];
    for (let dom = 1; dom <= 35; dom++) {
      const d = __d(si, dom, y); const c = weatherConditionOn(__g(seed), d);
      counts[s][c] = (counts[s][c] || 0) + 1;
      if (dom > 1) { persist[s].n++; if (weatherConditionOn(__g(seed), d - 1) === c) persist[s].same++; }
    }
  }
  // The expected share of each condition in a season is the average, over
  // the season's days, of its share of that DAY's gated mix. The chance
  // tomorrow matches today: sum over c of pi_c (p_c + (1 - p_c) q_c) — keep
  // with the condition's own persistence p_c, or redraw it (q = the
  // compensated redraw mix).
  const drift = {}, expectedSame = {};
  for (let si = 0; si < 4; si++) {
    const s = CALENDAR.seasons[si]; const n = MIX_SEEDS.length * 150 * 35;
    const exp = {}; let sameSum = 0;
    for (let dom = 1; dom <= 35; dom++) {
      const mix = weatherDayMix(si * 35 + dom); const tot = Object.values(mix).reduce((x, y) => x + y, 0);
      const red = weatherRedrawMix(mix); const rtot = Object.values(red).reduce((x, y) => x + y, 0);
      for (const [c, w] of Object.entries(mix)) exp[c] = (exp[c] || 0) + w / tot / 35;
      sameSum += Object.entries(mix).reduce((x, [c, w]) => x + (w / tot) * (weatherPersist(c) + (1 - weatherPersist(c)) * red[c] / rtot), 0) / 35;
    }
    const all = new Set([...Object.keys(exp), ...Object.keys(counts[s])]);
    drift[s] = Math.max(...[...all].map(c => Math.abs((counts[s][c] || 0) / n - (exp[c] || 0))));
    expectedSame[s] = sameSum;
  }
  // How long each condition lasts, in days (Phase 2: a storm is an
  // afternoon, a heatwave is a week).
  const runs = {};
  let cur = weatherConditionOn(__g('mix'), 1), len = 1;
  for (let d = 2; d <= 150 * 140; d++) {
    const c = weatherConditionOn(__g('mix'), d);
    if (c === cur) { len++; continue; }
    (runs[cur] = runs[cur] || []).push(len); cur = c; len = 1;
  }
  const runMean = Object.fromEntries(Object.entries(runs).map(([c, r]) => [c, r.reduce((a, b) => a + b, 0) / r.length]));
  const stormLongest = Math.max(...runs.storm);
  const snowOutsideWinter = Object.entries(counts).some(([s, c]) => s !== 'winter' && c.snow);
  const heatOutsideSummer = Object.entries(counts).some(([s, c]) => s !== 'summer' && c.heat);
  // The gates hold on every day of 150 years.
  let gateBreaks = 0;
  for (let d = 1; d <= 150 * 140; d++) {
    const c = weatherConditionOn(__g('mix'), d); const def = WEATHER_TUNING.conditions[c] || {};
    const base = seasonalBaselineC(((d - 1) % 140) + 1 + 0.5);
    if ((def.maxBaseC != null && base > def.maxBaseC) || (def.minBaseC != null && base < def.minBaseC)) gateBreaks++;
  }
  return { det: JSON.stringify(a) === JSON.stringify(a2), differs: JSON.stringify(a) !== JSON.stringify(b), drift,
    persist: Object.fromEntries(Object.entries(persist).map(([s, p]) => [s, p.same / p.n])), expectedSame, snowOutsideWinter, heatOutsideSummer, gateBreaks, runMean, stormLongest };
})()`);
check('the same seed always gives the same weather; a different seed, different weather', chain.det && chain.differs);
check('over 3 seeds x 150 years each condition\'s share matches its authored mix weight (within 2 points)', Object.values(chain.drift).every(v => v < 0.02), JSON.stringify(chain.drift));
check('fronts persist: the chance tomorrow matches today is the chain\'s theoretical value (within 3 points)', Object.keys(chain.persist).every(s => Math.abs(chain.persist[s] - chain.expectedSame[s]) < 0.03), JSON.stringify({ measured: chain.persist, expected: chain.expectedSame }));
check('snow only in winter, heatwaves only in summer', !chain.snowOutsideWinter && !chain.heatOutsideSummer);
// Found reading a live sample (Phase 2): at one shared persistence a
// thunderstorm ran three days in the test house, and 200 sampled years had a
// 12-day storm, 17 days of fog and 22 of rain.
check('a thunderstorm is usually a day (mean under 1.5, never a week); fog lifts within two; a heatwave or cold snap lasts days', chain.runMean.storm < 1.5 && chain.stormLongest <= 6 && chain.runMean.fog < 2 && chain.runMean.heat > 2.5 && chain.runMean.cold_snap > 2, JSON.stringify({ mean: chain.runMean, stormLongest: chain.stormLongest }));
check('the temperature gates hold on every one of 21,000 days: no snow on a mild day, no heatwave in the cool, no "bitter cold snap" at 12°C', chain.gateBreaks === 0, `${chain.gateBreaks} breaks`);

// ---------------------------------------------------------------- 3
console.log('\n3. The curve — continuous across seasons and the year, warmest mid-afternoon');
const curve = J(`(() => {
  let maxStep = 0, worst = null;
  for (let t = 1; t < 281; t += 0.25) { const step = Math.abs(seasonalBaselineC(t + 0.25) - seasonalBaselineC(t)); if (step > maxStep) { maxStep = step; worst = t; } }
  const yearEdge = [seasonalBaselineC(140.99), seasonalBaselineC(141.0), seasonalBaselineC(1.0)];
  const g = __g('diurnal');
  // A STEADY day (no front arriving): since Phase 2 the offset eases across
  // a front's arrival, which bends that one day's shape — the diurnal claim
  // is about the swing itself.
  const steady = (si) => { for (let dom = 18; dom <= 35; dom++) if (weatherTurnMin(g, __d(si, dom)) == null) return __d(si, dom); return null; };
  const day = steady(1), wday = steady(3);
  const hours = Array.from({ length: 24 }, (_, h) => outdoorTempC(g, day, h * 60));
  const hottest = hours.indexOf(Math.max(...hours)), coldest = hours.indexOf(Math.min(...hours));
  const midSummer = seasonalBaselineC(__d(1, 18)), midWinter = seasonalBaselineC(__d(3, 18));
  const winterHours = Array.from({ length: 24 }, (_, h) => outdoorTempC(g, wday, h * 60));
  return { maxStep, worst, yearEdge, hottest, coldest, swing: Math.max(...hours) - Math.min(...hours),
    winterSwing: Math.max(...winterHours) - Math.min(...winterHours), amp: WEATHER_TUNING.diurnalC, midSummer, midWinter };
})()`);
check('no jump anywhere: the baseline never moves more than 0.2°C per six hours', curve.maxStep < 0.2, `${curve.maxStep} at t=${curve.worst}`);
check('the year boundary is seamless (winter\'s last day flows into the 1st of Spring)', Math.abs(curve.yearEdge[0] - curve.yearEdge[1]) < 0.05 && Math.abs(curve.yearEdge[1] - curve.yearEdge[2]) < 1e-9, JSON.stringify(curve.yearEdge));
check('warmest at 15:00, coldest at 03:00, a ~2×diurnalC daily swing (the season\'s own)', curve.hottest === 15 && curve.coldest === 3 && Math.abs(curve.swing - 2 * curve.amp.summer) < 0.6, JSON.stringify({ hottest: curve.hottest, coldest: curve.coldest, swing: curve.swing }));
check('winter swings less than summer (a flat swing made a snowy afternoon read 7°C)', Math.abs(curve.winterSwing - 2 * curve.amp.winter) < 0.6 && curve.winterSwing < curve.swing, JSON.stringify({ winter: curve.winterSwing, summer: curve.swing }));
check('mid-summer is far warmer than mid-winter', curve.midSummer - curve.midWinter > 15, JSON.stringify([curve.midSummer, curve.midWinter]));

// ---------------------------------------------------------------- 4
console.log('\n4. W3 — daylight');
const light = J(`({
  summer: daylight(__d(1, 18)), winter: daylight(__d(3, 18)), spring: daylight(__d(0, 18)),
  allOrdered: Array.from({ length: 140 }, (_, i) => daylight(i + 1)).every(d => d.sunriseMin < d.sunsetMin),
  dayLenSummer: daylight(__d(1, 18)).sunsetMin - daylight(__d(1, 18)).sunriseMin,
  dayLenWinter: daylight(__d(3, 18)).sunsetMin - daylight(__d(3, 18)).sunriseMin,
  darkAt1730Winter: !isDaylight(__d(3, 18), 1050), lightAt2100Summer: isDaylight(__d(1, 18), 1260),
})`);
check('mid-summer: up by 05:30, light until 21:30; mid-winter: dark by 16:50', Math.abs(light.summer.sunriseMin - 330) <= 2 && Math.abs(light.summer.sunsetMin - 1290) <= 2 && Math.abs(light.winter.sunsetMin - 1010) <= 2, JSON.stringify(light));
check('sunrise is always before sunset; summer days are over four hours longer than winter ones', light.allOrdered && light.dayLenSummer - light.dayLenWinter > 240, JSON.stringify([light.dayLenSummer, light.dayLenWinter]));
check('it is dark at half five on a winter evening and still light at nine on a summer one', light.darkAt1730Winter && light.lightAt2100Summer);

// ---------------------------------------------------------------- 5
console.log('\n5. The house feels it — and the bill does not move');
const house = J(`(() => {
  // Find a cold snap and a clear day in the same winter of one seed.
  const seed = 'house';
  let snap = null, clear = null;
  for (let dom = 1; dom <= 35 && !(snap && clear); dom++) {
    const d = __d(3, dom, 2); const c = weatherConditionOn(__g(seed), d);
    if (c === 'cold_snap' && !snap) snap = d; if (c === 'clear' && !clear) clear = d;
  }
  const gAt = (d) => { const g = __g(seed, d, 900); g.world.thermostat = { targetC: THERMOSTAT_TUNING.defaultC }; return g; };
  const ambSnap = ambientTempC(gAt(snap)), ambClear = ambientTempC(gAt(clear));
  const bill = (d) => { const g = gAt(d); g.world.utilities = { hvac: { count: 0, daysAccrued: 0 } }; accrueHvacForDay(g, d); return g.world.utilities.hvac.count; };
  return { snap, clear, ambSnap, ambClear, billSnap: bill(snap), billClear: bill(clear), outdoorSnap: outdoorTempC(gAt(snap)), outdoorClear: outdoorTempC(gAt(clear)) };
})()`);
check('a cold-snap afternoon is genuinely colder outdoors than a clear one the same winter', house.snap && house.clear && house.outdoorClear - house.outdoorSnap > 5, JSON.stringify(house));
check('…and it reaches indoors (ambientTempC) — damped by the HVAC, but real', house.ambSnap < house.ambClear && house.ambClear - house.ambSnap < 3, JSON.stringify([house.ambSnap, house.ambClear]));
check('HVAC billing is the same on both days (it reads the seasonal rate, not the weather)', house.billSnap === house.billClear && house.billSnap > 0, JSON.stringify([house.billSnap, house.billClear]));

// ---------------------------------------------------------------- 6
console.log('\n6. W4 — the sky line and the prompt');
const sky = J(`(() => {
  const noon = __g('sky', __d(1, 18), 720), night = __g('sky', __d(3, 18), 1320), dawn = __g('sky', __d(3, 18), 300);
  const nights = [];
  for (let d = 1; d <= 140; d++) { const g = __g('sky', d, 1320); const w = weatherNow(g); if (w.condition === 'clear') { nights.push(w); break; } }
  return { noon: skyLine(noon), night: skyLine(night), dawn: skyLine(dawn), clearNight: nights[0] };
})()`);
check('the line reads "Outside: <sky>, <feel> (<n>°C), <light>."', /^Outside: [a-z ]+, (freezing|cold|chilly|mild|warm|hot) \(-?\d+°C\), (daylight|the light going|still dark|dark since \d\d:\d\d)\.$/.test(sky.noon), sky.noon);
check('a winter night says "dark since" its sunset; before dawn, "still dark"', /dark since 16:5\d/.test(sky.night) && /still dark/.test(sky.dawn), JSON.stringify([sky.night, sky.dawn]));
check('a clear night is "a clear night" with the moon, not the sun', sky.clearNight && sky.clearNight.sky === 'a clear night' && sky.clearNight.emoji === '🌙', JSON.stringify(sky.clearNight));
const imHasSky = J(`(() => {
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20260924, 2); console.warn = warn;
  const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 60, minutes: 600 }, contentConfig: null, sessionLog: [] }, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  const id = Object.keys(g.npcs).find(i => g.npcs[i].residency.status === 'resident');
  const p = buildImPrompt(assembleImContext(g, id), 'hey');
  return { has: p.includes('- Outside: '), line: (p.split('\\n').find(l => l.startsWith('- Outside: ')) || '') };
})()`);
check('the sky line reaches the real IM prompt', imHasSky.has, imHasSky.line);

// ---------------------------------------------------------------- 7
console.log('\n7. The rollover speaks only for the turn of a season');
// Since Phase 2 a change of weather lands at a time of day and the sky watch
// narrates it then (section 10) — the rollover, at midnight, would announce
// snow hours before it fell. The year's-first-snow and later-snowfall claims
// this section used to make moved to section 10 with it.
const roll = J(`(() => {
  const seed = 'roll';
  const turns = [__d(1, 1), __d(2, 1), __d(3, 1), __d(0, 1, 2)].map(d => processWeatherForDay(__g(seed), d).lines.filter(l => /First day of/.test(l)));
  let other = 0;
  for (let d = 1; d <= 280; d++) other += processWeatherForDay(__g(seed), d).lines.filter(l => !/First day of/.test(l)).length;
  const before = JSON.stringify(__g(seed, 200));
  const g = __g(seed, 200); processWeatherForDay(g, 200);
  return { turns, other, pure: JSON.stringify(g) === before };
})()`);
check('the first day of summer, autumn and winter each get their line; the 1st of Spring does not (New Year\'s Day speaks)', roll.turns[0].length === 1 && /summer/.test(roll.turns[0][0]) && roll.turns[1].length === 1 && /autumn/.test(roll.turns[1][0]) && roll.turns[2].length === 1 && /winter/.test(roll.turns[2][0]) && roll.turns[3].length === 0, JSON.stringify(roll.turns));
check('no change-of-weather line at the rollover over two years — the sky watch owns those now', roll.other === 0, `${roll.other} lines`);
check('processWeatherForDay writes nothing', roll.pure);

// ---------------------------------------------------------------- 8
console.log('\n8. Phase 2 — a front arrives at a time of day, and the temperature eases across it');
const front = J(`(() => {
  const g = __g('front');
  const N = 3 * 140;
  let changes = 0, sameDays = 0, sameNull = 0, inRange = 0, early = 0, flips = 0;
  for (let d = 2; d <= N; d++) {
    const from = weatherConditionOn(g, d - 1), to = weatherConditionOn(g, d);
    const t = weatherTurnMin(g, d);
    if (from === to) { sameDays++; if (t === null) sameNull++; continue; }
    changes++;
    if (Number.isInteger(t) && t >= 0 && t < WEATHER_TUNING.front.turnLatestMin) inRange++;
    if (t < 360) early++;
    // Yesterday's weather until the minute it arrives, today's from it on.
    if ((t === 0 || weatherConditionAt(g, d, t - 1) === from) && weatherConditionAt(g, d, t) === to && weatherConditionAt(g, d, 1439) === to) flips++;
  }
  // Every 10 minutes for three years: the largest step within a day, and at
  // midnight (Phase 1 stepped the whole change of weather there).
  let dayStep = 0, dayWorst = null, midStep = 0, midWorst = null;
  let prev = outdoorTempC(g, 1, 0);
  for (let abs = 1440 + 10; abs < (N + 1) * 1440; abs += 10) {
    const d = Math.floor(abs / 1440), m = abs % 1440;
    const t = outdoorTempC(g, d, m); const step = Math.abs(t - prev); prev = t;
    if (m === 0) { if (step > midStep) { midStep = step; midWorst = d; } }
    else if (step > dayStep) { dayStep = step; dayWorst = [d, m]; }
  }
  // The ease: on a day the weather changes, the temperature a minute before
  // the front and a minute after are within a hair; rampMin later it's the
  // new condition's full offset.
  let easeOk = 0, easeN = 0;
  for (let d = 2; d <= N; d++) {
    const t = weatherTurnMin(g, d); if (t == null || t < 1) continue;
    easeN++;
    const jump = Math.abs(outdoorTempC(g, d, t) - outdoorTempC(g, d, t - 1));
    const full = outdoorTempC(g, d, t + WEATHER_TUNING.front.rampMin);
    const expected = seasonalBaselineC(((d - 1) % 140) + 1 + (t + WEATHER_TUNING.front.rampMin) / 1440) + weatherOffsetC(weatherConditionOn(g, d), d)
      - WEATHER_TUNING.diurnalC[getSeason(d)] * Math.cos(2 * Math.PI * (t + WEATHER_TUNING.front.rampMin - 180) / 1440);
    if (jump < 0.2 && Math.abs(full - expected) < 1e-9) easeOk++;
  }
  return { changes, sameDays, sameNull, inRange, early, flips, dayStep, dayWorst, midStep, midWorst, easeOk, easeN,
    det: weatherTurnMin(__g('front'), 77) === weatherTurnMin(__g('front'), 77),
    chainSame: JSON.stringify(Array.from({ length: 50 }, (_, i) => weatherConditionOn(__g('front'), i + 1))) === JSON.stringify(Array.from({ length: 50 }, (_, i) => weatherConditionOn(__g('front'), i + 1))) };
})()`);
check('a day whose weather matches yesterday has no front; every change has one, at a minute before 22:00', front.sameDays > 0 && front.sameNull === front.sameDays && front.changes > 50 && front.inRange === front.changes, JSON.stringify(front));
check('fronts land around the clock — some overnight, most by day', front.early > front.changes * 0.1 && front.early < front.changes * 0.5, `${front.early} of ${front.changes} before 06:00`);
check('it is yesterday\'s weather until the front arrives, today\'s from that minute to midnight', front.flips === front.changes, `${front.flips} of ${front.changes}`);
check('no step at the front: the temperature eases, reaching the new condition exactly rampMin later', front.easeN > 50 && front.easeOk === front.easeN, `${front.easeOk} of ${front.easeN}`);
check('within a day the temperature never moves more than 1°C in ten minutes (Phase 1 jumped up to 9°C at midnight)', front.dayStep < 1, JSON.stringify([front.dayStep, front.dayWorst]));
check('midnight steps are small too — only a season\'s own switch of mix and swing remains (under 2.5°C)', front.midStep < 2.5, JSON.stringify([front.midStep, front.midWorst]));
check('the arrival minute is deterministic', front.det);

// ---------------------------------------------------------------- 9
console.log('\n9. Phase 2 — the weather reaches the room');
const cues = J(`(() => {
  const T = WEATHER_TUNING;
  const missing = [];
  for (const [c, cue] of Object.entries(T.cues)) {
    if (!T.conditions[c]) missing.push('unknown condition ' + c);
    for (const s of CALENDAR.seasons) {
      if (!weatherCueText(cue.window && cue.window.day, s)) missing.push(c + ' window.day ' + s);
      if (!weatherCueText(cue.outside && cue.outside.day, s)) missing.push(c + ' outside.day ' + s);
    }
  }
  const noCue = Object.keys(T.conditions).filter(c => !T.cues[c]);
  const badRooms = Object.entries(T.rooms).filter(([r, e]) => !ROOMS[r] || !['window', 'outside'].includes(e)).map(([r]) => r);
  const at = (g) => weatherConditionAt(g, g.meta.clock.day, g.meta.clock.minutes);
  const find = (pred) => { for (let d = 2; d <= 700; d++) for (let m = 0; m < 1440; m += 30) { const g = __g('cue', d, m); if (pred(g, d, m)) return g; } return null; };
  const rainDay = find((g, d, m) => at(g) === 'rain' && isDaylight(d, m) && daylight(d).sunsetMin - m > 60);
  const rainNight = find((g, d, m) => at(g) === 'rain' && !isDaylight(d, m));
  const storm = find((g) => at(g) === 'storm');
  const clearDusk = find((g, d, m) => at(g) === 'clear' && isDaylight(d, m) && daylight(d).sunsetMin - m <= 60);
  // A clear summer morning on the balcony, just after sunrise.
  const summerDawn = find((g, d, m) => getSeason(d) === 'summer' && at(g) === 'clear' && m - daylight(d).sunriseMin >= 0 && m - daylight(d).sunriseMin < 60);
  const summerNoon = find((g, d, m) => getSeason(d) === 'summer' && at(g) === 'clear' && m === 780);
  const cloudyNight = find((g, d, m) => at(g) === 'cloudy' && !isDaylight(d, m));
  // A daytime front into rain from a dry day: the cue follows the minute.
  let turn = null;
  for (let d = 2; d <= 700 && !turn; d++) {
    const t = weatherTurnMin(__g('cue'), d);
    if (t != null && t >= 600 && t <= 900 && weatherConditionOn(__g('cue'), d) === 'rain' && ['clear', 'cloudy'].includes(weatherConditionOn(__g('cue'), d - 1))) turn = { d, t };
  }
  const cue = (g, r) => weatherRoomCue(g, r);
  return {
    missing, noCue, badRooms,
    rainDayLR: cue(rainDay, 'living_room'), rainNightLR: cue(rainNight, 'living_room'), rainDayHall: cue(rainDay, 'hallway_a'),
    rainBalcony: cue(rainDay, 'balcony'), stormHall: cue(storm, 'hallway_a'), stormLR: cue(storm, 'living_room'),
    clearDusk: cue(clearDusk, 'kitchen'), cloudyNight: cue(cloudyNight, 'living_room'),
    summerDawnBalcony: cue(summerDawn, 'balcony'), summerNoonBalcony: cue(summerNoon, 'balcony'),
    beforeTurn: turn && cue(__g('cue', turn.d, turn.t - 30), 'living_room'), afterTurn: turn && cue(__g('cue', turn.d, turn.t + 30), 'living_room'),
    seasonal: [weatherCueText(T.cues.rain.window.day, 'autumn'), weatherCueText(T.cues.rain.window.day, 'spring')],
  };
})()`);
check('every room in the table is real; every cue names a real condition; every condition has cues', cues.badRooms.length === 0 && cues.noCue.length === 0 && !cues.missing.some(m => /unknown/.test(m)), JSON.stringify(cues));
check('every condition says something at a window by day and on the balcony by day, in every season', cues.missing.length === 0, JSON.stringify(cues.missing));
check('rain by day at the living room window; at night it ticks on dark glass', cues.rainDayLR && cues.rainDayLR.via === 'window' && /rain .*window/.test(cues.rainDayLR.text) && cues.rainNightLR && /dark glass/.test(cues.rainNightLR.text), JSON.stringify([cues.rainDayLR, cues.rainNightLR]));
check('the balcony is IN the weather (its own cue, not the window\'s)', cues.rainBalcony && cues.rainBalcony.via === 'outside' && /balcony/.test(cues.rainBalcony.text), JSON.stringify(cues.rainBalcony));
check('a windowless hallway: nothing of the rain — but a storm is heard through the walls', cues.rainDayHall === null && cues.stormHall && cues.stormHall.via === 'walls' && /thunder/.test(cues.stormHall.text) && cues.stormLR.via === 'window', JSON.stringify([cues.rainDayHall, cues.stormHall, cues.stormLR]));
check('the last hour of daylight reads as dusk (clear: low gold sun); a cloudy night says nothing', cues.clearDusk && /low sun/.test(cues.clearDusk.text) && cues.cloudyNight === null, JSON.stringify([cues.clearDusk, cues.cloudyNight]));
// Found reading a sample: "the sun hot on your skin" at 06:00. The first
// 90 minutes of daylight have their own slot now, falling back to day.
check('a clear summer dawn on the balcony is early sun, not "hot on your skin"; by 13:00 it is', cues.summerDawnBalcony && /early sun/.test(cues.summerDawnBalcony.text) && cues.summerNoonBalcony && /hot on your skin/.test(cues.summerNoonBalcony.text), JSON.stringify([cues.summerDawnBalcony, cues.summerNoonBalcony]));
check('the cue follows the minute: dry at the window before a daytime front, rain after it', cues.beforeTurn !== undefined && !/rain/.test((cues.beforeTurn || {}).text || '') && cues.afterTurn && /rain/.test(cues.afterTurn.text), JSON.stringify([cues.beforeTurn, cues.afterTurn]));
check('a seasonal cue resolves by season and falls back to its default', /^cold rain/.test(cues.seasonal[0]) && cues.seasonal[1] === 'rain streaking down the window', JSON.stringify(cues.seasonal));
const wired = J(`(() => {
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20260925, 2); console.warn = warn;
  let day = null, min = null;
  for (let d = 2; d <= 280 && day == null; d++) for (let m = 600; m <= 900; m += 30) { if (weatherConditionAt({ meta: { seed: h.seed } }, d, m) === 'rain') { day = d; min = m; break; } }
  const g = { meta: { seed: h.seed, clock: { ...h.clock, day, minutes: min }, contentConfig: null, sessionLog: [] }, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  const sceneState = { active: [], ambient: [], engagement: {} };
  g.player.location = 'living_room';
  const prompt = buildScenePrompt(assembleContext(g, sceneState), 'x');
  const composed = composeScene(g, null).weather;
  g.player.location = 'hallway_a';
  const ctxHall = assembleContext(g, sceneState);
  const promptHall = buildScenePrompt(ctxHall, 'x');
  const lines = prompt.split('\\n');
  const i = lines.findIndex(l => l.startsWith('- The weather, from this room: '));
  return { day, min, composed, line: i >= 0 ? lines[i] : null, prevLine: i > 0 ? lines[i - 1] : null,
    hall: promptHall.includes('- The weather, from this room'), hallAdds: weatherCueLine(ctxHall.scene) };
})()`);
check('composeScene carries the living room\'s rain cue for the scene reader', wired.composed && /rain/.test(wired.composed), JSON.stringify(wired));
check('the scene prompt gives it its own line, right after the sensory line', wired.line && /rain/.test(wired.line) && /^- (What you can sense|Nothing much registers)/.test(wired.prevLine || ''), JSON.stringify([wired.prevLine, wired.line]));
// The line is concatenated straight onto the sensory line (it carries its
// own newline), so an empty string means it adds nothing, not even a blank.
check('a windowless room\'s prompt has no weather line, and the cue adds nothing at all there', !wired.hall && wired.hallAdds === '', JSON.stringify(wired));

// ---------------------------------------------------------------- 10
console.log('\n10. Phase 2 — the sky watch');
const watch = J(`(() => {
  const g = __g('watch');
  const W = WEATHER_TUNING.watch;
  let rain = null, storm = null, dried = null;
  for (let d = 2; d <= 1400 && !(rain && storm && dried); d++) {
    const t = weatherTurnMin(g, d); if (t == null || t < 540 || t > 1000) continue;
    const from = weatherConditionOn(g, d - 1), to = weatherConditionOn(g, d);
    if (!rain && to === 'rain' && ['clear', 'cloudy'].includes(from)) rain = { d, t };
    if (!storm && to === 'storm') storm = { d, t };
    if (!dried && from === 'rain' && ['clear', 'cloudy'].includes(to)) dried = { d, t };
  }
  const at = (x, off) => x.d * 1440 + x.t + off;
  const L = (x, a, b, opts) => skyWatchLines(g, at(x, a), at(x, b), opts).filter(l => !/^🌆|^🌅/.test(l));
  const sun = (day, kind, a, b, opts) => { const m = daylight(day)[kind]; return skyWatchLines(g, day * 1440 + m + a, day * 1440 + m + b, opts).filter(l => /^🌆|^🌅/.test(l)); };
  const winter = __d(3, 18, 2), summer = __d(1, 18, 2), spring = __d(0, 18, 2);
  const before = JSON.stringify(g);
  const out = {
    rainLive: L(rain, -15, 15, { roomId: 'living_room' }),
    rainHall: L(rain, -15, 15, { roomId: 'hallway_a' }),
    rainSlept: L(rain, -300, 120, { roomId: 'bedroom_player', slept: true }),
    rainBefore: L(rain, -60, -1, { roomId: 'living_room' }),
    stormHall: L(storm, -15, 15, { roomId: 'hallway_a' }),
    dried: L(dried, -15, 15, { roomId: 'kitchen' }),
    stale: skyWatchLines(g, at(rain, -W.staleMin - 30), at(rain, 15), { roomId: 'living_room' }),
    backwards: skyWatchLines(g, at(rain, 15), at(rain, -15), { roomId: 'living_room' }),
    duskWinter: sun(winter, 'sunsetMin', -10, 5, { roomId: 'living_room' }),
    duskWinterLate: sun(winter, 'sunsetMin', -10, 40, { roomId: 'living_room' }),
    duskSummer: sun(summer, 'sunsetMin', -10, 10, { roomId: 'balcony' }),
    duskSpring: sun(spring, 'sunsetMin', -10, 10, { roomId: 'study' }),
    duskHall: sun(winter, 'sunsetMin', -10, 10, { roomId: 'hallway_a' }),
    duskLong: sun(winter, 'sunsetMin', -W.liveSpanMin - 10, 10, { roomId: 'living_room' }),
    dawnSlept: sun(winter, 'sunriseMin', -300, 60, { roomId: 'bedroom_player', slept: true }),
    dawnSummer: sun(summer, 'sunriseMin', -10, 10, { roomId: 'bedroom_player' }),
  };
  out.pure = JSON.stringify(g) === before;
  return out;
})()`);
check('a daytime front, watched from the living room: "It\'s started to rain." — once', watch.rainLive.length === 1 && /started to rain/.test(watch.rainLive[0]), JSON.stringify(watch.rainLive));
check('…nothing before it arrives, nothing in a windowless hallway', watch.rainBefore.length === 0 && watch.rainHall.length === 0, JSON.stringify([watch.rainBefore, watch.rainHall]));
check('…and slept through, it is worded for waking ("while you slept")', watch.rainSlept.length === 1 && /while you slept/.test(watch.rainSlept[0]), JSON.stringify(watch.rainSlept));
check('a storm rolling in is heard even from the hallway', watch.stormHall.length === 1 && /thunderstorm/.test(watch.stormHall[0]), JSON.stringify(watch.stormHall));
check('the rain stopping says so', watch.dried.length === 1 && /rain's stopped/.test(watch.dried[0]), JSON.stringify(watch.dried));
check('a stale span (a load, a jump) or a backwards one narrates nothing', watch.stale.length === 0 && watch.backwards.length === 0);
check('a winter sunset, watched: dark before five; a summer one: gone nine; spring: plain', watch.duskWinter.length === 1 && /isn't even five/.test(watch.duskWinter[0]) && watch.duskSummer.length === 1 && /gone nine/.test(watch.duskSummer[0]) && watch.duskSpring.length === 1 && /getting dark outside/.test(watch.duskSpring[0]), JSON.stringify([watch.duskWinter, watch.duskSummer, watch.duskSpring]));
// Found reading a sample: the line was picked from the SUN's minute, so an
// action ending at 17:30 printed "isn't even five". It reads the clock now.
check('the same winter sunset, noticed at 17:30 (the end of a longer action): no "isn\'t even five"', watch.duskWinterLate.length === 1 && !/isn't even five/.test(watch.duskWinterLate[0]), JSON.stringify(watch.duskWinterLate));
check('the light is narrated live only: not from a hallway, not across a long action, never on waking', watch.duskHall.length === 0 && watch.duskLong.length === 0 && watch.dawnSlept.length === 0, JSON.stringify([watch.duskHall, watch.duskLong, watch.dawnSlept]));
check('a summer dawn, up early at the window: "isn\'t even six"', watch.dawnSummer.length === 1 && /isn't even six/.test(watch.dawnSummer[0]), JSON.stringify(watch.dawnSummer));
check('skyWatchLines writes nothing', watch.pure);
// Walk five years in 30-minute steps from the living room, awake: every
// front into snow is announced once, the year's first snow exactly once in a
// year that snows, and never in a snowless one.
const walk = J(`(() => {
  const g = __g('roll');
  const per = [0, 0, 0, 0, 0], snowLines = [0, 0, 0, 0, 0], snowArrivals = [0, 0, 0, 0, 0];
  for (let d = 2; d <= 5 * 140; d++) if (weatherConditionOn(g, d) === 'snow' && weatherConditionOn(g, d - 1) !== 'snow') snowArrivals[getYear(d) - 1]++;
  for (let abs = 1440 + 30; abs < 1440 * (5 * 140 + 1); abs += 30) {
    const y = getYear(Math.floor(abs / 1440)) - 1;
    for (const l of skyWatchLines(g, abs - 30, abs, { roomId: 'living_room' })) {
      if (/first snow of the year/.test(l)) per[y]++;
      if (/snow/i.test(l) && !/stopped snowing|snow has turned to rain/.test(l)) snowLines[y]++;
    }
  }
  const snowed = snowArrivals.map(n => (n > 0 ? 1 : 0));
  return { per, snowed, snowLines, snowArrivals };
})()`);
check('the year\'s first snow is announced exactly once in every year it snows, never in a snowless one', JSON.stringify(walk.per) === JSON.stringify(walk.snowed) && walk.snowed.some(Boolean), JSON.stringify(walk));
check('every front into snow gets exactly one line (first of the year, "started snowing", or rain turning to snow)', JSON.stringify(walk.snowLines) === JSON.stringify(walk.snowArrivals) && walk.snowArrivals.reduce((a, b) => a + b, 0) > 3, JSON.stringify(walk));

// ---------------------------------------------------------------- 11
console.log('\n11. Phase 3 — how inviting it is outside, and what that changes');
const out = J(`(() => {
  const at = (pred) => { for (let d = 2; d <= 700; d++) for (let m = 0; m < 1440; m += 30) { const g = __g('outs', d, m); if (pred(g, d, m)) return g; } return null; };
  const cond = (g) => weatherConditionAt(g, g.meta.clock.day, g.meta.clock.minutes);
  const lit = (g) => isDaylight(g.meta.clock.day, g.meta.clock.minutes);
  const temp = (g) => outdoorTempC(g);
  const storm = at((g) => cond(g) === 'storm');
  const rain = at((g) => cond(g) === 'rain' && lit(g));
  const fineDay = at((g) => cond(g) === 'clear' && lit(g) && temp(g) > 14 && temp(g) <= 27);
  const coldClear = at((g) => cond(g) === 'clear' && lit(g) && temp(g) <= 3);
  const heatDay = at((g) => cond(g) === 'heat' && lit(g) && temp(g) > 32);
  const heatNight = at((g) => cond(g) === 'heat' && !lit(g));
  const A = (g) => outsideAppeal(g);
  // "stepping outside", forced, in a storm and on a fine day.
  ACTIVITY_TABLES.__wx = ['stepping outside'];
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20260926, 2); console.warn = warn;
  const id = Object.keys(h.npcs).find(i => h.npcs[i].residency.status === 'resident');
  const place = (g) => { const hg = { ...h, meta: { seed: g.meta.seed, clock: g.meta.clock } }; return resolveRoomForActivity('__wx', id, h.npcs, seededRng('wx', 'r'), g.meta.clock, hg); };
  const stepStorm = place(storm), stepFine = place(fineDay);
  delete ACTIVITY_TABLES.__wx;
  // The player's balcony and the loungers.
  const sit = (g) => { const w = balconySitWeather(g); const eff = buildBalconySitEffects({ gameState: g }); return { line: w.line, mult: w.moodMult, eff: eff[0] }; };
  const tmpl = (g, room) => driveWeatherTemplate(g, DRIVE_DEFS.read_book, room);
  return {
    appeal: { storm: A(storm), rain: A(rain), fine: A(fineDay), coldClear: A(coldClear), heatDay: A(heatDay), heatNight: A(heatNight) },
    weight: { stormBalcony: roomWeatherWeight(storm, 'balcony'), fineBalcony: roomWeatherWeight(fineDay, 'balcony'), fineCapped: roomWeatherWeight(fineDay, 'balcony', { boost: false }), stormKitchen: roomWeatherWeight(storm, 'kitchen') },
    stepStorm, stepFine,
    sitStorm: sit(storm), sitFine: sit(fineDay), sitCold: sit(coldClear),
    sunNight: sunbatheLine(__g('outs', 60, 1380)), sunFine: sunbatheLine(fineDay), sunRain: sunbatheLine(rain),
    tFineBalcony: tmpl(fineDay, 'balcony'), tRainLiving: tmpl(rain, 'living_room'), tFineLiving: tmpl(fineDay, 'living_room'), tStormBalcony: tmpl(storm, 'balcony'),
    base: ACTION_TUNING.balconyMoodGain,
  };
})()`);
check('outside is 0 in a thunderstorm, near-nothing in rain, ~3 on a fine spring afternoon', out.appeal.storm === 0 && out.appeal.rain < 0.2 && out.appeal.fine > 2.5, JSON.stringify(out.appeal));
check('a clear but bitter day is only middling; a heatwave is worse by day than by night', out.appeal.coldClear < 1.5 && out.appeal.heatNight > out.appeal.heatDay, JSON.stringify(out.appeal));
check('the balcony weighs 0 in a storm and ~3 on a fine day; no other room is touched; a generic picker never gets the boost', out.weight.stormBalcony === 0 && out.weight.fineBalcony > 2.5 && out.weight.fineCapped === 1 && out.weight.stormKitchen === 1, JSON.stringify(out.weight));
check('"stepping outside" in a storm becomes watching it from a window room; on a fine day it is the balcony', out.stepStorm.activity === 'watching the weather from the window' && ['living_room', 'dining', 'kitchen'].includes(out.stepStorm.location) && out.stepFine.activity === 'stepping outside' && out.stepFine.location === 'balcony', JSON.stringify([out.stepStorm, out.stepFine]));
check('Sit on the Balcony: a fine afternoon is worth about twice the base mood, a storm a quarter, with lines that say so', out.sitFine.mult > 1.9 && Math.abs(out.sitStorm.mult - 0.25) < 1e-9 && /thunder|lightning/.test(out.sitStorm.line) && /sun/.test(out.sitFine.line) && out.sitFine.eff === 'ADJUST_NEED player mood +' + (out.base * out.sitFine.mult).toFixed(3), JSON.stringify([out.sitFine, out.sitStorm]));
check('a clear day at or below 5°C gets the bundled-up line', /coat|cold/.test(out.sitCold.line), JSON.stringify(out.sitCold));
check('Sunbathe: pool lights at night, sun through the glass on a fine day, weather against the glass when wet', /pool lights/.test(out.sunNight) && /sun through the glass/.test(out.sunFine) && /against the glass/.test(out.sunRain), JSON.stringify([out.sunNight, out.sunFine, out.sunRain]));
check('an idle pastime is told with the weather only when it\'s the story: out in the sun, curled up in the rain; plain otherwise', /on the balcony in the sun/.test(out.tFineBalcony || '') && /while the rain came down/.test(out.tRainLiving || '') && out.tFineLiving === null && out.tStormBalcony === null, JSON.stringify([out.tFineBalcony, out.tRainLiving, out.tFineLiving, out.tStormBalcony]));

// The population: the same houses, weather weighting on vs off, a few days in
// each season. Where people go changes; what they choose to do barely does.
const pop = J(`(() => {
  const realW = roomWeatherWeight, realT = driveWeatherTemplate;
  const arm = (on) => {
    roomWeatherWeight = on ? realW : (() => 1);
    driveWeatherTemplate = on ? realT : (() => null);
    const tally = { fine: [0, 0], off: [0, 0] }; let events = 0, idle = 0; const told = { sun: 0, cozy: 0 };
    const warn = console.warn; console.warn = () => {};
    try {
      for (let i = 0; i < 5; i++) for (const startDay of [8, 43, 78, 113]) {
        const h = SIM_generateHouse(20260923 + i * 7919, 3);
        let g = { meta: { seed: h.seed, clock: { ...h.clock, day: startDay, minutes: 360 }, contentConfig: null, sessionLog: [] }, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
        for (let s = 0; s < 3 * 48; s++) {
          const r = resolveBatch(g, 1); g = r.state;
          for (const e of r.events || []) {
            events++; if (['read_book', 'watch_tv', 'scroll_phone'].includes(e.type)) idle++;
            if (/on the balcony in the sun/.test(e.template || '')) told.sun++;
            if (/ while /.test(e.template || '')) told.cozy++;
          }
          const a = outsideAppeal(g);
          const b = a >= WEATHER_TUNING.outside.fineAt ? 'fine' : a < WEATHER_TUNING.outside.minAppeal ? 'off' : null;
          if (!b) continue;
          for (const n of Object.values(g.npcs)) {
            if (n.residency?.status !== 'resident' || !n.location || /sleep/.test(n.activity || '')) continue;
            tally[b][1]++; if (n.location === 'balcony') tally[b][0]++;
          }
        }
      }
    } finally { console.warn = warn; roomWeatherWeight = realW; driveWeatherTemplate = realT; }
    return { tally, events, idle, told };
  };
  return { on: arm(true), off: arm(false) };
})()`);
const share = (t) => t[0] / Math.max(1, t[1]);
const within = (a, b, tol) => Math.abs(a - b) / Math.max(a, b, 1) <= tol;
check('a fine day draws people out onto the balcony more than the same houses without weather', share(pop.on.tally.fine) > share(pop.off.tally.fine) * 1.15 && pop.on.tally.fine[1] > 300, JSON.stringify({ on: pop.on.tally.fine, off: pop.off.tally.fine }));
check('in rain, storms and bitter cold the balcony all but empties (under 2%, a quarter of the no-weather share at most)', share(pop.on.tally.off) < 0.02 && share(pop.on.tally.off) < share(pop.off.tally.off) / 4 && pop.on.tally.off[1] > 200, JSON.stringify({ on: pop.on.tally.off, off: pop.off.tally.off }));
check('where, not whether: the same houses fire the same number of drive events, and of idle pastimes, within 5%', within(pop.on.events, pop.off.events, 0.05) && within(pop.on.idle, pop.off.idle, 0.05), JSON.stringify({ on: [pop.on.events, pop.on.idle], off: [pop.off.events, pop.off.idle] }));
check('and the log tells it: reading out in the sun, curled up while it pours', pop.on.told.sun > 0 && pop.on.told.cozy > 0 && pop.off.told.sun === 0 && pop.off.told.cozy === 0, JSON.stringify({ on: pop.on.told, off: pop.off.told }));

// The drive leans: swim on a hot day, sauna on a bitter one. Scored, so held
// to the facility-gated drives only — an always-available drive with a lean
// would reshuffle the idle-pastime budget every rainy day (the appeal-budget
// hazard verify-c3 guards).
const lean = J(`(() => {
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20260927, 2); console.warn = warn;
  const npc = h.npcs[Object.keys(h.npcs).find(i => h.npcs[i].residency.status === 'resident')];
  const find = (pred) => { for (let d = 36; d <= 700; d++) for (let m = 600; m <= 1200; m += 60) { const g = { ...h, meta: { seed: h.seed, clock: { day: d, minutes: m } } }; if (pred(g)) return g; } return null; };
  const hot = find(g => outdoorTempC(g) >= WEATHER_TUNING.drives.hotC);
  const mild = find(g => outdoorTempC(g) > 12 && outdoorTempC(g) < 24 && !['heat', 'cold_snap', 'snow'].includes(weatherConditionAt(g, g.meta.clock.day, g.meta.clock.minutes)));
  const cold = find(g => outdoorTempC(g) <= WEATHER_TUNING.drives.coldC);
  const ctx = (g) => ({ perceived: [], block: 'leisure', nowAbs: 0, minutesOfDay: g.meta.clock.minutes, gameState: g });
  const t = (id, g) => scoreDrive(id, npc, ctx(g)).terms.weather;
  const declared = Object.entries(DRIVE_DEFS).filter(([, d]) => d.utility && d.utility.weather).map(([k]) => k).sort();
  return { swimHot: t('swim', hot), swimMild: t('swim', mild), saunaCold: t('sauna', cold), saunaHot: t('sauna', hot), readHot: t('read_book', hot), declared };
})()`);
check('swim leans in on a hot day and not a mild one; the sauna on a bitter one and not a hot one', lean.swimHot === 0.04 && lean.swimMild === 0 && lean.saunaCold === 0.04 && lean.saunaHot === 0, JSON.stringify(lean));
check('only the facility-gated swim and sauna carry a weather lean — no idle pastime, no always-available drive', JSON.stringify(lean.declared) === JSON.stringify(['sauna', 'swim']) && lean.readHot === 0, JSON.stringify(lean.declared));
const leanPop = J(`(() => {
  const realL = weatherDriveLean;
  const arm = (on, startDay) => {
    weatherDriveLean = on ? realL : (() => 0);
    const c = {};
    const warn = console.warn; console.warn = () => {};
    try {
      for (let i = 0; i < 4; i++) {
        const h = SIM_generateHouse(20260923 + i * 7919, 3);
        let g = { meta: { seed: h.seed, clock: { ...h.clock, day: startDay, minutes: 360 }, contentConfig: null, sessionLog: [] }, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
        for (let s = 0; s < 5 * 48; s++) { const r = resolveBatch(g, 1); g = r.state; for (const e of r.events || []) c[e.type] = (c[e.type] || 0) + 1; }
      }
    } finally { console.warn = warn; weatherDriveLean = realL; }
    return { swim: c.swim || 0, sauna: c.sauna || 0, all: Object.values(c).reduce((a, b) => a + b, 0) };
  };
  return { summerOn: arm(true, 50), summerOff: arm(false, 50), winterOn: arm(true, 117), winterOff: arm(false, 117) };
})()`);
check('the same houses in high summer swim more with the lean; in deep winter they use the sauna more', leanPop.summerOn.swim > leanPop.summerOff.swim * 1.15 && leanPop.winterOn.sauna > leanPop.winterOff.sauna * 1.15, JSON.stringify(leanPop));
check('…and the total of what they do barely moves (within 5%) — a lean, not a takeover', within(leanPop.summerOn.all, leanPop.summerOff.all, 0.05) && within(leanPop.winterOn.all, leanPop.winterOff.all, 0.05), JSON.stringify(leanPop));

// ---------------------------------------------------------------- 12
console.log('\n12. Phase 4 — seasonal food');
const food = J(`(() => {
  const at = (season) => ({ meta: { seed: 'food', clock: { day: CALENDAR.seasons.indexOf(season) * 35 + 18, minutes: 720 } } });
  const price = (id, season) => itemPriceNow(ITEM_DEFS[id], at(season));
  const prices = {};
  for (const id of ['tomato', 'lettuce', 'potatoes', 'eggs', 'onion']) prices[id] = CALENDAR.seasons.map(s => price(id, s));
  const decorId = Object.keys(DECOR_CATALOG_DEFS || {})[0];
  const decorSteady = decorId ? CALENDAR.seasons.every(s => itemPriceNow(DECOR_CATALOG_DEFS[decorId], at(s)) === DECOR_CATALOG_DEFS[decorId].price) : true;
  const net = Object.fromEntries(Object.keys(WEATHER_TUNING.produce).map(id => [id, CALENDAR.seasons.reduce((a, s) => a + (WEATHER_TUNING.produce[id][s] || 0), 0)]));
  const cart = [{ defId: 'lettuce', units: 2 }, { defId: 'eggs', units: 1 }];
  const summer = at('summer');
  const subtotalSummer = cartSubtotal(cart, ITEM_DEFS, summer), subtotalSticker = cartSubtotal(cart, ITEM_DEFS);
  const g = { meta: { seed: 'food', clock: summer.meta.clock }, world: { computer: { apps: { grocery: { cart } } } }, player: {}, npcs: {} };
  const grocerySubtotal = getGroceryOrderTotals(g).subtotal;
  const notes = [produceSeasonNote('lettuce', summer), produceSeasonNote('lettuce', at('winter')), produceSeasonNote('eggs', summer)];
  // Cravings: find a cold day and a hot day for this house's seed.
  const warn = console.warn; console.warn = () => {};
  const h0 = SIM_generateHouse(20260928, 2); console.warn = warn;
  const g0 = (d) => ({ meta: { seed: h0.seed, clock: { day: d, minutes: 720 } } });
  let coldDay = null, hotDay = null, mildDay = null;
  for (let d = 1; d <= 280; d++) {
    const t = dayMeanTempC(g0(d));
    if (!coldDay && t <= WEATHER_TUNING.food.coldC - 1) coldDay = d;
    if (!hotDay && t >= WEATHER_TUNING.food.hotC + 1) hotDay = d;
    if (!mildDay && t > WEATHER_TUNING.food.coldC + 2 && t < WEATHER_TUNING.food.hotC - 2) mildDay = d;
  }
  const leans = { soupCold: seasonalFoodLean(g0(coldDay), 'soup'), saladCold: seasonalFoodLean(g0(coldDay), 'salad'), saladHot: seasonalFoodLean(g0(hotDay), 'salad'), soupHot: seasonalFoodLean(g0(hotDay), 'soup'), soupMild: seasonalFoodLean(g0(mildDay), 'soup'), noodlesCold: seasonalFoodLean(g0(coldDay), null, 'instant_noodles') };
  const w = Object.values(TASTE_TUNING.bands).map(b => b.weight).sort((a, b) => a - b);
  const minGap = Math.min(...w.slice(1).map((x, i) => x - w[i]));
  // The auto-cook choice: a larder that can make soup OR salad.
  const cook = (day, likes, seedTag) => {
    const warn2 = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(20260928, 2); console.warn = warn2;
    h.meta = { ...(h.meta || {}), seed: h.seed, clock: { day, minutes: 720 } };
    const objIn = (defId) => { for (const b of Object.values(h.objects || {})) { const o = Object.values(b).find(o => o.defId === defId); if (o) return o; } return null; };
    const byClass = { pantry: objIn('pantry'), fridge: objIn('fridge'), freezer: objIn('freezer') };
    for (const o of Object.values(byClass)) if (o) o.contents = [];
    for (const r of [RECIPES.soup, RECIPES.salad]) for (const ing of r.ingredients) {
      const target = byClass[ITEM_DEFS[ing.defId].storageClass || 'pantry'] || byClass.pantry;
      const ex = target.contents.find(s => s.defId === ing.defId);
      if (ex) ex.qty += ing.qty; else target.contents.push({ defId: ing.defId, qty: ing.qty, ownerId: null, meta: { acquiredDay: 1 } });
    }
    for (const r of ['oil', 'salt', 'spices']) byClass.pantry.contents.push({ defId: r, qty: 2, ownerId: null, meta: { acquiredDay: 1 } });
    const id = Object.keys(h.npcs).find(i => h.npcs[i].residency.status === 'resident');
    const npc = h.npcs[id]; npc.taste = { likes, dislikes: [] };
    const res = npcAutoCookMeal(npc, id, h, seededRng('cook', seedTag), npc.taste, 0);
    return res && res.recipe && res.recipe.id;
  };
  const picks = (day, likes) => Array.from({ length: 6 }, (_, i) => cook(day, likes, 'k' + i));
  return { prices, decorSteady, net, subtotalSummer, subtotalSticker, grocerySubtotal, notes, coldDay, hotDay, mildDay, leans, minGap, lean: WEATHER_TUNING.food.lean,
    coldPicks: picks(coldDay, []), hotPicks: picks(hotDay, []), mildPicks: picks(mildDay, []), coldLovesSalad: picks(coldDay, ['lettuce']) };
})()`);
check('winter tomatoes cost double; lettuce is $1 in summer and $3 in winter; potatoes are cheapest in autumn; eggs and onions never move', JSON.stringify(food.prices.tomato) === JSON.stringify([1, 1, 1, 2]) && JSON.stringify(food.prices.lettuce) === JSON.stringify([2, 1, 2, 3]) && JSON.stringify(food.prices.potatoes) === JSON.stringify([4, 3, 2, 3]) && food.prices.eggs.every(p => p === 4) && food.prices.onion.every(p => p === 1), JSON.stringify(food.prices));
check('over a year the produce deltas net to zero except the tomato (it cannot go under $1 in summer); decor never moves', food.net.lettuce === 0 && food.net.potatoes === 0 && food.net.tomato === 1 && food.decorSteady, JSON.stringify(food.net));
check('both shops charge today\'s price: the cart subtotal and QuickCart\'s totals read the season', food.subtotalSummer === 6 && food.subtotalSticker === 8 && food.grocerySubtotal === 6, JSON.stringify([food.subtotalSummer, food.subtotalSticker, food.grocerySubtotal]));
check('the card says "in season" / "out of season" only for produce that moved', food.notes[0] === 'in season' && food.notes[1] === 'out of season' && food.notes[2] === null, JSON.stringify(food.notes));
check('a craving is hearty on a cold day, fresh on a hot one, nothing on a mild one', food.leans.soupCold === food.lean && food.leans.saladCold === 0 && food.leans.saladHot === food.lean && food.leans.soupHot === 0 && food.leans.soupMild === 0 && food.leans.noodlesCold === food.lean, JSON.stringify({ days: [food.coldDay, food.hotDay, food.mildDay], leans: food.leans }));
check('the lean is smaller than the smallest gap between two taste bands — a tie-break, never a gate', food.lean < food.minGap, JSON.stringify([food.lean, food.minGap]));
check('a roommate indifferent to both cooks soup on a cold day and salad on a hot one; on a mild day either', food.coldPicks.every(r => r === 'soup') && food.hotPicks.every(r => r === 'salad') && new Set(food.mildPicks).size === 2, JSON.stringify({ cold: food.coldPicks, hot: food.hotPicks, mild: food.mildPicks }));
check('…but one who likes lettuce still makes the salad in the cold — taste outranks the season', food.coldLovesSalad.every(r => r === 'salad'), JSON.stringify(food.coldLovesSalad));

// ---------------------------------------------------------------- 13
console.log('\n13. Phase 5 — dressed for the weather outside, and the seasons in the mood');
const dress = J(`(() => {
  const realType = outfitTypeForContext;
  const wardrobe = ['coat', 'denim_jacket', 'hoodie', 'button_up', 'sweater', 'basic_tee', 'dress_pants', 'shorts', 'dress_shoes', 'sneakers', 'dress_socks', 'boxers'];
  const npc = { id: 'wd', residency: { room: null, status: 'resident' }, inventory: wardrobe.map(defId => ({ defId, qty: 1 })), bible: { temperament: {} } };
  const find = (pred) => { for (let d = 1; d <= 280; d++) for (let m = 420; m <= 540; m += 30) { const gs = { meta: { seed: 'dress', clock: { day: d, minutes: m } }, world: { thermostat: { targetC: 21 } }, objects: {} }; if (pred(outdoorTempC(gs))) return gs; } return null; };
  const cold = find(t => t <= WEATHER_TUNING.dressOut.coldC - 2), mild = find(t => t > 15 && t < 22), hot = find(t => t >= WEATHER_TUNING.dressOut.hotC + 1);
  const outer = (type, gs) => { outfitTypeForContext = () => type; try { return npcOutfitForContext(npc, gs, 'prep', null, 'wd').outerwear; } finally { outfitTypeForContext = realType; } };
  return { work: { cold: outer('work', cold), mild: outer('work', mild), hot: outer('work', hot) }, daily: { cold: outer('daily', cold), hot: outer('daily', hot) }, temps: [cold, mild, hot].map(g => outdoorTempC(g).toFixed(1)) };
})()`);
// Found writing this check: a thermal bias alone kept the coat on at 27°C —
// its work/formal traits outscore any heat — so a hot morning skips the slot.
check('leaving for work on a cold morning: the coat; on a hot one: no jacket at all', dress.work.cold === 'coat' && !dress.work.hot, JSON.stringify(dress));
check('an indoor fit still reads the thermostat, not the weather: the same pick at home on the cold morning and the hot one', dress.daily.cold === dress.daily.hot, JSON.stringify(dress.daily));
const mood = J(`(() => {
  const years = {};
  for (const seed of ['m1', 'm2', 'm3']) { const g = { meta: { seed } }; years[seed] = []; for (let d = 1; d <= 420; d++) if (isFirstWarmDay(g, d)) years[seed].push([getYear(d), getSeason(d), d]); }
  const dark = []; for (let d = 1; d <= 140; d++) if (isDarkDay(d)) dark.push(d);
  // A house to read the beats against.
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20260930, 3); console.warn = warn;
  const ids = Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  const g = { meta: { seed: 'm1', clock: { day: 1, minutes: 0 } }, npcs: h.npcs, player: h.player, world: h.world };
  h.npcs[ids[0]].bible.temperament = { ...h.npcs[ids[0]].bible.temperament, volatility: 0.8 }; h.npcs[ids[0]].mood = 0.5;
  h.npcs[ids[1]].bible.temperament = { ...h.npcs[ids[1]].bible.temperament, volatility: 0.8 }; h.npcs[ids[1]].mood = 0.055;
  h.npcs[ids[2]].bible.temperament = { ...h.npcs[ids[2]].bible.temperament, volatility: -0.5 }; h.npcs[ids[2]].mood = 0.5;
  const warmDay = years.m1[0][2];
  const onWarm = seasonalMoodForDay(g, warmDay), onDark = seasonalMoodForDay(g, dark[5]), onPlain = seasonalMoodForDay(g, 60);
  h.npcs[ids[1]].mood = 0.04; const belowFloor = seasonalMoodForDay(g, dark[5]);
  // The first snow, crossed by the sky watch.
  let snowTurn = null; for (let d = 2; d <= 280 && !snowTurn; d++) { const t = weatherTurnMin(g, d); if (t != null && weatherConditionOn(g, d) === 'snow' && isFirstSnowDay(g, d)) snowTurn = { d, t }; }
  const across = snowTurn && firstSnowBetween(g, snowTurn.d * 1440 + snowTurn.t - 10, snowTurn.d * 1440 + snowTurn.t + 10);
  const before = snowTurn && firstSnowBetween(g, snowTurn.d * 1440 + snowTurn.t - 30, snowTurn.d * 1440 + snowTurn.t - 1);
  return { years, dark: [dark.length, dark[0], dark[dark.length - 1]], ids, onWarm, onDark, onPlain, belowFloor, across, before, lift: WEATHER_TUNING.mood.liftMood, dip: WEATHER_TUNING.mood.darkDip };
})()`);
check('the year\'s first properly warm day comes once a year, in spring', Object.values(mood.years).every(ys => ys.length === 3 && ys.every(([y, s], i) => y === i + 1 && s === 'spring')), JSON.stringify(mood.years));
check('the darkest weeks are the middle of winter (~15 days)', mood.dark[0] >= 10 && mood.dark[0] <= 20 && mood.dark[1] > 105 && mood.dark[2] <= 140, JSON.stringify(mood.dark));
check('the first warm day: a morning line and a lift for you and every resident', mood.onWarm.lines.length === 1 && mood.onWarm.effects.includes('MOOD_DELTA player +' + mood.lift) && mood.ids.every(id => mood.onWarm.effects.includes('MOOD_DELTA ' + id + ' +' + mood.lift)), JSON.stringify(mood.onWarm));
check('a dark day dips only the sensitive, by at most the daily dip, and only out of mood above the floor', mood.onDark.effects.includes('MOOD_DELTA ' + mood.ids[0] + ' -' + mood.dip.toFixed(3)) && mood.onDark.effects.includes('MOOD_DELTA ' + mood.ids[1] + ' -0.005') && !mood.onDark.effects.some(l => l.includes(mood.ids[2])) && mood.onDark.lines.length === 0, JSON.stringify(mood.onDark));
check('below the floor there is no dip at all; an ordinary day has no beat', !mood.belowFloor.effects.some(l => l.includes(mood.ids[1])) && mood.onPlain.effects.length === 0 && mood.onPlain.lines.length === 0, JSON.stringify([mood.belowFloor, mood.onPlain]));
check('the first snow\'s lift fires when the sky watch crosses its start, not before', mood.across === true && mood.before === false, JSON.stringify([mood.across, mood.before]));
// Against the mood economy: the same houses through a winter, one-day
// batches with the rollover's seasonal effects applied between them, the
// dip on vs off. NPC mood is an accumulator (nothing eases it back), so
// this is the check that the dip stays a dip.
const economy = J(`(() => {
  const arm = (dipOn) => {
    const acc = { vol: [0, 0], other: [0, 0] };
    const warn = console.warn; console.warn = () => {};
    try {
      for (let i = 0; i < 4; i++) {
        const h = SIM_generateHouse(20260929 + i * 7919, 3);
        let g = { meta: { seed: h.seed, clock: { ...h.clock, day: 104, minutes: 0 }, contentConfig: null, sessionLog: [] }, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        const ids = Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
        g.npcs[ids[0]].bible.temperament = { ...g.npcs[ids[0]].bible.temperament, volatility: 0.7 };
        for (let day = 104; day <= 130; day++) {
          if (day > 104) {
            const m = seasonalMoodForDay(g, day);
            const lines = dipOn ? m.effects : m.effects.filter(l => / \\+/.test(l));
            const effs = []; for (const l of lines) for (const e of parseEffectDSL(l)) if (e) effs.push(e);
            applyEffects(effs, buildEffectContext(g, ids, ids, {}, []));
          }
          g = resolveBatch(g, 48).state;
          if (!isDarkDay(day)) continue;
          for (const id of ids) { const n = g.npcs[id]; const k = (n.bible.temperament.volatility ?? 0) >= WEATHER_TUNING.mood.darkVolatility ? 'vol' : 'other'; acc[k][0] += n.mood; acc[k][1]++; }
        }
      }
    } finally { console.warn = warn; }
    return { vol: acc.vol[0] / acc.vol[1], other: acc.other[0] / acc.other[1] };
  };
  return { on: arm(true), off: arm(false) };
})()`);
check('against the mood economy: over the dark weeks the sensitive average a little lower (a dip under 0.05), everyone else not at all', economy.on.vol < economy.off.vol && economy.off.vol - economy.on.vol < 0.05 && Math.abs(economy.on.other - economy.off.other) < 0.005, JSON.stringify(economy));

// ---------------------------------------------------------------- 14
console.log('\n14. Phase 6 — the window view in the scene art');
const views = J(`(() => {
  const byExposure = { window: new Set(), outside: new Set(), none: new Set() };
  let badPhrase = [];
  for (let d = 1; d <= 3 * 140; d++) for (let m = 0; m < 1440; m += 60) {
    const g = { meta: { seed: 'views', clock: { day: d, minutes: m, phase: getPhase(m) } } };
    for (const roomId of Object.keys(ROOMS)) {
      const t = windowViewToken(g, roomId);
      const exp = weatherRoomExposure(roomId) || 'none';
      byExposure[exp].add(t === null ? 'null' : t);
      if (t && !windowViewPhrase(t, roomId)) badPhrase.push(t + '@' + roomId);
    }
  }
  // A night token uses the exposure's own night phrase.
  const nightWindow = windowViewPhrase('night-dark', 'living_room'), nightOutside = windowViewPhrase('night-dark', 'balcony');
  // Keys and prompts: a windowless room is byte-identical to before.
  const sunny = { meta: { seed: 'views', clock: { day: 45, minutes: 720, phase: 'midday' } } };
  const hallKeyOld = plateKey('hallway_a', 'midday', 'plain', '');
  const hallKeyNew = plateKey('hallway_a', 'midday', 'plain', '', windowViewToken(sunny, 'hallway_a'));
  const hallPromptOld = buildBackgroundPrompt('hallway_a', 'midday', {});
  const hallPromptNew = buildBackgroundPrompt('hallway_a', 'midday', {}, windowViewToken(sunny, 'hallway_a'));
  const lrView = windowViewToken(sunny, 'living_room');
  const lrPrompt = buildBackgroundPrompt('living_room', 'midday', {}, lrView);
  const balconyPrompt = buildBackgroundPrompt('balcony', 'midday', {}, windowViewToken(sunny, 'balcony'));
  const lrKey = plateKey('living_room', 'midday', 'plain', '', lrView);
  return { counts: { window: byExposure.window.size, outside: byExposure.outside.size, none: [...byExposure.none] }, windowSet: [...byExposure.window].sort(), badPhrase,
    nightWindow, nightOutside, hallSame: hallKeyOld === hallKeyNew && hallPromptOld === hallPromptNew,
    lrView, lrPrompt, balconyPrompt, lrKeyEnds: lrKey.endsWith('_v' + lrView) };
})()`);
check('a room that sees outside has at most 16 looks over three years (13 by day, 3 by night); a windowless room has none', views.counts.window <= 16 && views.counts.outside <= 16 && JSON.stringify(views.counts.none) === JSON.stringify(['null']) && views.badPhrase.length === 0, JSON.stringify({ counts: views.counts, set: views.windowSet, bad: views.badPhrase.slice(0, 5) }));
check('a windowless room\'s plate key and prompt are byte-identical to before (every cached plate still valid)', views.hallSame);
check('a windowed room\'s key ends in its view and its prompt shows it through the window; the balcony is open to the sky', views.lrKeyEnds && /Through the window: .*summer/.test(views.lrPrompt) && /Open to the sky: /.test(views.balconyPrompt) && !/Through the window/.test(views.balconyPrompt), JSON.stringify([views.lrView, views.lrPrompt.slice(-160), views.balconyPrompt.slice(-120)]));
check('at night the window is dark and the balcony is under the night sky', /window dark/.test(views.nightWindow) && /night sky/.test(views.nightOutside), JSON.stringify([views.nightWindow, views.nightOutside]));
// render.js isn't in the vm (it's DOM code), so the REAL sceneArtContext is
// lifted out of it by name (the verify-roomlist-inbox.js technique) — its
// dependencies (plateKey, buildBackgroundPrompt, layoutSceneCutouts…) are
// image.js's, which is loaded. Found the hard way: a typeof-guarded version
// of this check "passed" by skipping.
{
  const RJS = fs.readFileSync(path.join(__dirname, '..', '..', 'srcfiles', 'render.js'), 'utf8');
  const at = RJS.indexOf('function sceneArtContext(');
  let depth = 0, started = false, j = at;
  for (; at >= 0 && j < RJS.length; j++) {
    if (RJS[j] === '{') { depth++; started = true; }
    else if (RJS[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  check('render.js declares sceneArtContext once, and it lifts', at >= 0 && RJS.indexOf('function sceneArtContext(', at + 1) < 0);
  if (at >= 0) api(RJS.slice(at, j));
}
const artCtx = J(`(() => {
  const warn = console.warn; console.warn = () => {};
  const h = SIM_generateHouse(20261001, 2); console.warn = warn;
  const mk = (d, m) => ({ meta: { seed: h.seed, clock: { day: d, minutes: m, phase: getPhase(m) }, contentConfig: null, sessionLog: [] }, player: { ...h.player, location: 'living_room' }, npcs: h.npcs, world: h.world, objects: h.objects });
  const id = Object.keys(h.npcs).find(i => h.npcs[i].residency.status === 'resident');
  const scene = { active: [id], ambient: [], engagement: {} };
  // Two middays, same phase, different views.
  let a = null, b = null;
  for (let d = 2; d <= 140 && !(a && b); d++) { const g = mk(d, 720); const v = windowViewToken(g, 'living_room'); if (!a) a = { d, v }; else if (v !== a.v) b = { d, v }; }
  const ca = sceneArtContext(mk(a.d, 720), scene), cb = sceneArtContext(mk(b.d, 720), scene);
  return { keysDiffer: ca.sceneKey !== cb.sceneKey, sameLayout: JSON.stringify(ca.overlay) === JSON.stringify(cb.overlay), views: [ca.view, cb.view], promptHasView: ca.prompt.includes('Through the window') };
})()`);
check('the scene art context: a different view is a different plate, but the people stand exactly where they stood', artCtx.keysDiffer && artCtx.sameLayout && artCtx.promptHasView, JSON.stringify(artCtx));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
