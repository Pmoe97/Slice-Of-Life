// ===== SECTION: SEASONS =====
// Weather, outdoor temperature and daylight (seasons-and-weather-plan.md
// Phases 1–2, W1–W4; SEASONS-AND-OCCASIONS-ROADMAP.md R5/R6/R10/R11). The
// one module that answers "what is it like outside": today's condition and
// the minute its front arrives, the temperature at a given minute, when the
// sun rises and sets, the one sky line every prompt and the HUD read, the
// weather as it reaches a room, and what the sky did between two moments
// (the sky watch's lines).
//
// All of it is DERIVED from meta.seed + the day (R5) and DETERMINISTIC (R6):
// the same save always has the same weather. Nothing is stored. The player
// never leaves the apartment (R10) — weather is seen through windows, heard
// on the glass, felt on the balcony.
//
// WEATHER_TUNING (config.js) is the one table; its header explains why the
// season means can't drift.

// --- The chain (W1) ---------------------------------------------------------

// Per-seed memo of conditions by day (index = day). The chain is sequential
// (tomorrow depends on today), so it's extended lazily and cached — cheap:
// a year is 140 draws.
const WEATHER_MEMO = new Map();

function weatherSeedOf(gs) {
  return String(gs?.meta?.seed ?? 'noseed');
}

function weatherPick(rng, mix) {
  const entries = Object.entries(mix);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [cond, w] of entries) { r -= w; if (r <= 0) return cond; }
  return entries[entries.length - 1][0];
}

// Today's condition id ('clear' | 'rain' | …).
function weatherConditionOn(gs, day) {
  const d = Math.max(1, Math.floor(day || 1));
  const seed = weatherSeedOf(gs);
  let memo = WEATHER_MEMO.get(seed);
  if (!memo) { memo = [null]; WEATHER_MEMO.set(seed, memo); }
  const W = WEATHER_TUNING;
  for (let i = memo.length; i <= d; i++) {
    const mix = weatherDayMix(i);
    const rng = seededRng(`${W.seedSalt}_${seed}`, `d${i}`);
    const prev = memo[i - 1];
    const keep = prev && mix[prev] && rng() < weatherPersist(prev);
    memo.push(keep ? prev : weatherPick(rng, weatherRedrawMix(mix)));
  }
  return memo[d];
}

// The chance a condition simply carries into tomorrow.
function weatherPersist(cond) {
  const p = WEATHER_TUNING.conditions[cond]?.persist;
  return typeof p === 'number' ? p : WEATHER_TUNING.persistence;
}

// What a redraw picks from: each weight times (1 − its persistence). With
// keep-probability p_c and redraw weights q_c, the chain's long-run share of
// c is proportional to q_c / (1 − p_c) — so this makes it exactly the
// authored mix weight however long each condition tends to last.
function weatherRedrawMix(mix) {
  const out = {};
  for (const [c, w] of Object.entries(mix)) out[c] = w * (1 - weatherPersist(c));
  return out;
}

// Phase 2: when the day's change of weather ARRIVES (minute of the day), or
// null when today's condition is yesterday's. Seeded on its own stream, so
// the chain above is untouched. Before this minute it's still yesterday's
// weather.
function weatherTurnMin(gs, day) {
  const d = Math.floor(day || 0);
  if (d <= 1) return null;
  if (weatherConditionOn(gs, d) === weatherConditionOn(gs, d - 1)) return null;
  const F = WEATHER_TUNING.front;
  const rng = seededRng(`${F.seedSalt}_${weatherSeedOf(gs)}`, `d${d}`);
  return Math.floor(rng() * F.turnLatestMin);
}

// The condition at a moment: today's once its front has arrived, yesterday's
// before. Every "what's it doing out there NOW" reader goes through this.
function weatherConditionAt(gs, day, minutes) {
  const d = Math.max(1, Math.floor(day || 1));
  const turn = weatherTurnMin(gs, d);
  return (turn == null || minutes >= turn) ? weatherConditionOn(gs, d) : weatherConditionOn(gs, d - 1);
}

// The day's mix: the season's weights, minus any condition whose temperature
// gate the day's seasonal baseline (at midday) fails. Pure; derived.
function weatherDayMix(day) {
  const W = WEATHER_TUNING;
  const base = seasonalBaselineC(weatherDoy(day) + 0.5);
  const out = {};
  for (const [c, w] of Object.entries(W.mix[getSeason(day)] || {})) {
    const def = W.conditions[c] || {};
    if (def.maxBaseC != null && base > def.maxBaseC) continue;
    if (def.minBaseC != null && base < def.minBaseC) continue;
    out[c] = w;
  }
  return out;
}

// --- Temperature (W2) ---------------------------------------------------------

// Season-midpoint anchors x solving 6x_i + x_{i-1} + x_{i+1} = 8m_i (the
// average of a piecewise-linear curve over a season centred on its anchor is
// x_i + (x_{i-1} + x_{i+1} - 2x_i)/8), so each season's MEAN is exactly
// THERMOSTAT_TUNING.seasonOutdoorC. Solved once, lazily, by Gauss-Jordan.
let SEASON_ANCHORS_C = null;
function seasonAnchorsC() {
  if (SEASON_ANCHORS_C) return SEASON_ANCHORS_C;
  const m = THERMOSTAT_TUNING.seasonOutdoorC;
  const n = m.length;
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n + 1).fill(0);
    row[i] = 6; row[(i + n - 1) % n] += 1; row[(i + 1) % n] += 1; row[n] = 8 * m[i];
    A.push(row);
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  SEASON_ANCHORS_C = A.map((row, i) => row[n] / row[i]);
  return SEASON_ANCHORS_C;
}

// The seasonal baseline for a day-of-year (fractional allowed): linear
// between season midpoints, wrapping winter → spring.
function seasonalBaselineC(doy) {
  const x = seasonAnchorsC();
  const S = CALENDAR.daysPerSeason, Y = CALENDAR.daysPerYear, n = x.length;
  // Continuous day t = doy + minute/1440; season i spans t ∈ [1+35i, 36+35i),
  // centred at 18.5+35i — so pos is 0 exactly at spring's centre.
  const pos = ((((doy - 1 - S / 2) % Y) + Y) % Y) / S;
  const i = Math.floor(pos) % n;
  const t = pos - Math.floor(pos);
  return x[i] + (x[(i + 1) % n] - x[i]) * t;
}

// A condition's offset, re-centred for the DAY so the season's mean is
// unmoved by weather (the day's mix is the chain's local long-run
// distribution; persistence across a gate change leaves a tiny residue —
// verify-weather.js measures the whole model within 0.5°C of the table).
function weatherOffsetC(cond, day) {
  const W = WEATHER_TUNING;
  const mix = weatherDayMix(day);
  const total = Object.values(mix).reduce((s, w) => s + w, 0) || 1;
  const expected = Object.entries(mix).reduce((s, [c, w]) => s + (W.conditions[c]?.offsetC || 0) * w, 0) / total;
  return (W.conditions[cond]?.offsetC || 0) - expected;
}

function weatherDoy(day) {
  const n = CALENDAR.daysPerYear;
  return ((((day - 1) % n) + n) % n) + 1;
}

// The outdoor temperature at a moment (°C). `minutes` defaults to the
// clock's; the day defaults to the clock's. On a day the weather changes,
// the offset eases from yesterday's condition to today's over
// front.rampMin after the front arrives (Phase 2) — no step at the turn.
function outdoorTempC(gs, day, minutes) {
  const d = day ?? gs?.meta?.clock?.day ?? 1;
  const m = minutes ?? gs?.meta?.clock?.minutes ?? 720;
  const doy = weatherDoy(d) + m / 1440;
  const amp = typeof WEATHER_TUNING.diurnalC === 'number' ? WEATHER_TUNING.diurnalC : (WEATHER_TUNING.diurnalC[getSeason(d)] ?? 4);
  const diurnal = -amp * Math.cos(2 * Math.PI * (m - 180) / 1440);
  let offset = weatherOffsetC(weatherConditionOn(gs, d), d);
  const turn = weatherTurnMin(gs, d);
  if (turn != null) {
    const before = weatherOffsetC(weatherConditionOn(gs, d - 1), d);
    const f = Math.min(1, Math.max(0, (m - turn) / WEATHER_TUNING.front.rampMin));
    offset = before + (offset - before) * f;
  }
  return seasonalBaselineC(doy) + offset + diurnal;
}

// --- Daylight (W3) ---------------------------------------------------------------

function daylight(day) {
  const D = WEATHER_TUNING.daylight;
  const S = CALENDAR.daysPerSeason, Y = CALENDAR.daysPerYear;
  const order = CALENDAR.seasons;
  const pos = ((((weatherDoy(day) + 0.5 - 1 - S / 2) % Y) + Y) % Y) / S; // midday of `day`, same frame as seasonalBaselineC
  const i = Math.floor(pos) % order.length;
  const t = pos - Math.floor(pos);
  const a = D[order[i]], b = D[order[(i + 1) % order.length]];
  return { sunriseMin: Math.round(a[0] + (b[0] - a[0]) * t), sunsetMin: Math.round(a[1] + (b[1] - a[1]) * t) };
}

function isDaylight(day, minutes) {
  const { sunriseMin, sunsetMin } = daylight(day);
  return minutes >= sunriseMin && minutes < sunsetMin;
}

// --- The sky line (W4) -----------------------------------------------------------

function tempFeelWord(c) {
  for (const [cut, word] of WEATHER_TUNING.feelWords) if (c <= cut) return word;
  return 'hot';
}

// { condition, emoji, sky, tempC, feel, light } for now.
function weatherNow(gs) {
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  const cond = weatherConditionAt(gs, day, minutes);
  const def = WEATHER_TUNING.conditions[cond] || {};
  const lit = isDaylight(day, minutes);
  const { sunriseMin, sunsetMin } = daylight(day);
  const tempC = outdoorTempC(gs, day, minutes);
  let light;
  if (!lit) light = minutes < sunriseMin ? 'still dark' : `dark since ${formatTime(sunsetMin)}`;
  else if (sunsetMin - minutes <= 60) light = 'the light going';
  else light = 'daylight';
  return {
    condition: cond,
    emoji: (!lit && def.nightEmoji) || def.emoji || '',
    sky: (!lit && def.nightSky) || def.sky || cond,
    tempC, feel: tempFeelWord(tempC), light,
  };
}

// "Outside: steady rain, chilly (11°C), dark since 17:10." — the prompt line.
function skyLine(gs) {
  const w = weatherNow(gs);
  return `Outside: ${w.sky}, ${w.feel} (${Math.round(w.tempC)}°C), ${w.light}.`;
}

// --- The weather in a room (Phase 2, W4) ----------------------------------------

// 'window' | 'outside' | null — how a room meets the weather.
function weatherRoomExposure(roomId) {
  return WEATHER_TUNING.rooms[roomId] || null;
}

// A cue value is a string or { <season>: string, default: string }.
function weatherCueText(v, season) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v[season] || v.default || null;
}

// What the weather is doing, as it reaches this room right now:
// { text, via: 'window' | 'outside' | 'walls' } or null. Pure. The scene
// reader shows `text`; the scene prompt gives it its own line.
function weatherRoomCue(gs, roomId) {
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  const cues = WEATHER_TUNING.cues[weatherConditionAt(gs, day, minutes)];
  if (!cues) return null;
  const exposure = weatherRoomExposure(roomId);
  const season = getSeason(day);
  if (!exposure) {
    const heard = weatherCueText(cues.anywhere, season);
    return heard ? { text: heard, via: 'walls' } : null;
  }
  const { sunriseMin, sunsetMin } = daylight(day);
  // The light: morning and dusk fall back to day where nothing's authored.
  const slot = !isDaylight(day, minutes) ? 'night'
    : sunsetMin - minutes <= 60 ? 'dusk'
      : minutes - sunriseMin < 90 ? 'morning' : 'day';
  const set = (exposure === 'outside' ? cues.outside : cues.window) || {};
  const text = weatherCueText(set[slot], season) || (slot !== 'night' ? weatherCueText(set.day, season) : null);
  return text ? { text, via: exposure } : null;
}

// --- The sky watch (Phase 2): what the sky did between two moments --------------

// Did the year's snow start on this day (no snow on any earlier day of it)?
function isFirstSnowDay(gs, day) {
  if (weatherConditionOn(gs, day) !== 'snow') return false;
  const yearStart = (getYear(day) - 1) * CALENDAR.daysPerYear + 1;
  for (let d = yearStart; d < day; d++) if (weatherConditionOn(gs, d) === 'snow') return false;
  return true;
}

// Every front arrival, sunrise and sunset in (fromAbs, toAbs] — absolute
// game-minutes, day*1440 + minutes (time.js's clockToAbsolute) — oldest
// first. Pure.
function skyEventsBetween(gs, fromAbs, toAbs) {
  const out = [];
  if (!(toAbs > fromAbs)) return out;
  for (let d = Math.max(1, Math.floor(fromAbs / 1440)); d <= Math.floor(toAbs / 1440); d++) {
    const { sunriseMin, sunsetMin } = daylight(d);
    const turn = weatherTurnMin(gs, d);
    const cands = [{ kind: 'sunrise', min: sunriseMin }, { kind: 'sunset', min: sunsetMin }];
    if (turn != null) cands.push({ kind: 'turn', min: turn, from: weatherConditionOn(gs, d - 1), to: weatherConditionOn(gs, d) });
    for (const c of cands) {
      const abs = d * 1440 + c.min;
      if (abs > fromAbs && abs <= toAbs) out.push({ ...c, day: d, abs });
    }
  }
  return out.sort((a, b) => a.abs - b.abs);
}

// The line for one front arriving (see WEATHER_TUNING.changes), or null.
function weatherChangeLine(gs, evt, slept) {
  const C = WEATHER_TUNING.changes;
  const key = slept ? 'slept' : 'live';
  const entry = (evt.to === 'snow' && isFirstSnowDay(gs, evt.day)) ? C.firstSnow
    : C.pairs[`${evt.from}>${evt.to}`] || C.starts[evt.to] || C.ends[evt.from] || null;
  return entry ? entry[key] : null;
}

// The sky watch's lines for an advance from fromAbs to toAbs: the latest
// change of weather crossed, and — live only — the latest sunrise/sunset.
// `slept`: the player slept through it. `roomId`: where the player is now;
// live lines need a room that sees outside (a storm is heard anywhere).
// Pure; ui.js's narrateSkyChanges keeps the marker and logs the lines.
function skyWatchLines(gs, fromAbs, toAbs, opts = {}) {
  const W = WEATHER_TUNING.watch;
  const span = toAbs - fromAbs;
  if (!(span > 0) || span > W.staleMin) return [];
  const slept = !!opts.slept;
  const exposed = !!weatherRoomExposure(opts.roomId);
  const events = skyEventsBetween(gs, fromAbs, toAbs);
  const picked = [];
  const turn = events.filter(e => e.kind === 'turn').pop();
  if (turn && (slept || exposed || turn.to === 'storm')) {
    const line = weatherChangeLine(gs, turn, slept);
    if (line) picked.push({ abs: turn.abs, line });
  }
  const sun = events.filter(e => e.kind !== 'turn').pop();
  if (sun && !slept && exposed && span <= W.liveSpanMin) {
    // Worded for the clock when the line is read (the end of this advance),
    // not the sun's own minute — the two can be liveSpanMin apart.
    const nowMin = ((toAbs % 1440) + 1440) % 1440;
    const row = WEATHER_TUNING.light[sun.kind].find(([cut]) => nowMin < cut);
    if (row) picked.push({ abs: sun.abs, line: row[1] });
  }
  return picked.sort((a, b) => a.abs - b.abs).map(p => p.line);
}

// --- Outdoors (Phase 3, W5): what people do about it ------------------------------

// How inviting it is outside at a moment — the condition's factor
// (daylight or dark) times the temperature's (WEATHER_TUNING.outside). 1 is
// neutral, ~3 a perfect spring afternoon, 0 a thunderstorm. Pure.
function outsideAppeal(gs, day, minutes) {
  const d = day ?? gs?.meta?.clock?.day ?? 1;
  const m = minutes ?? gs?.meta?.clock?.minutes ?? 720;
  const O = WEATHER_TUNING.outside;
  const row = O.condition[weatherConditionAt(gs, d, m)] || [1, 1];
  const t = outdoorTempC(gs, d, m);
  const byTemp = (O.temp.find(([cut]) => t <= cut) || [0, 1])[1];
  return row[isDaylight(d, m) ? 0 : 1] * byTemp;
}

// A room's weight when someone is choosing where to go: the balcony by how
// inviting outside is (0 below outside.minAppeal — off the list), every
// other room 1. The four room pickers (drives.js moveToRoom/moveToCommon,
// sim.js resolveRoomForActivity) multiply their crowd weight by it.
//
// `boost: false` for the pickers that choose among ANY common room
// (moveToCommon, the schedule's fallback): there the weather only takes the
// balcony away, never pulls people out to it — "came out to the common area
// for some company" shouldn't mean an empty balcony at the far end of the
// east wing just because it's sunny. The pull belongs only where the balcony
// is an authored place FOR the activity: reading, a phone call, a beer.
function roomWeatherWeight(gs, roomId, opts) {
  if (weatherRoomExposure(roomId) !== 'outside') return 1;
  const a = outsideAppeal(gs);
  if (a < WEATHER_TUNING.outside.minAppeal) return 0;
  return opts?.boost === false ? Math.min(1, a) : a;
}

// A drive's event, told with the weather when the weather is the story
// (`drive.weatherTemplates`): out on the balcony on a fine day or night, or
// tucked up indoors while it's grim out. Null when the plain template
// should stand. Pure; the caller stores the text on the event.
function driveWeatherTemplate(gs, drive, roomId) {
  const T = drive?.weatherTemplates;
  if (!T || !roomId) return null;
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  if (weatherRoomExposure(roomId) === 'outside') {
    if (!T.outsideFine || outsideAppeal(gs, day, minutes) < WEATHER_TUNING.outside.fineAt) return null;
    return T.outsideFine[isDaylight(day, minutes) ? 0 : 1] || null;
  }
  const cozy = WEATHER_TUNING.cozy[weatherConditionAt(gs, day, minutes)];
  return (cozy && T.cozy) ? T.cozy.replace('{weather}', cozy) : null;
}

// A drive's weather lean (`utility.weather: { hot, cold }`, cognition.js's
// scoreDrive): the hot lean on a day at or above drives.hotC or in a
// heatwave, the cold lean at or below drives.coldC, in a cold snap or snow.
// Small on purpose (WEATHER_TUNING.drives). Pure.
function weatherDriveLean(lean, gs) {
  if (!lean || !gs?.meta?.clock) return 0;
  const D = WEATHER_TUNING.drives;
  const { day, minutes } = gs.meta.clock;
  const t = outdoorTempC(gs, day, minutes);
  const c = weatherConditionAt(gs, day, minutes);
  let v = 0;
  if (lean.hot && (t >= D.hotC || c === 'heat')) v += lean.hot;
  if (lean.cold && (t <= D.coldC || c === 'cold_snap' || c === 'snow')) v += lean.cold;
  return v;
}

// The player's "Sit on the Balcony" in this weather: its line and its mood
// multiplier (WEATHER_TUNING.balconySit). Pure.
function balconySitWeather(gs) {
  const B = WEATHER_TUNING.balconySit;
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  let cond = weatherConditionAt(gs, day, minutes);
  if (cond === 'clear' && outdoorTempC(gs, day, minutes) <= B.coldC) cond = 'clearCold';
  const row = B.lines[cond] || B.lines.cloudy;
  const [lo, hi] = B.moodRange;
  return {
    line: row[isDaylight(day, minutes) ? 0 : 1],
    moodMult: Math.min(hi, Math.max(lo, outsideAppeal(gs, day, minutes))),
  };
}

// Sunbathe's line for the light it happens in (WEATHER_TUNING.sunbathe).
function sunbatheLine(gs) {
  const S = WEATHER_TUNING.sunbathe;
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  if (!isDaylight(day, minutes)) return S.night;
  const cond = weatherConditionAt(gs, day, minutes);
  if (cond === 'clear' || cond === 'heat') return S.sun;
  if (['rain', 'storm', 'snow'].includes(cond)) return S.wet;
  return S.day;
}

// --- Seasonal food (Phase 4, W6) ----------------------------------------------------

// The whole-dollar seasonal change to an item's price (WEATHER_TUNING.produce),
// 0 for anything that isn't seasonal produce.
function seasonalPriceDelta(defId, gs) {
  const row = WEATHER_TUNING.produce[defId];
  if (!row) return 0;
  return row[getSeason(gs?.meta?.clock?.day ?? 1)] || 0;
}

// What an item costs today in either shop: the sticker price plus the
// season's delta, never below $1. Everything that isn't seasonal produce —
// decor, electronics, cleaning supplies — is exactly its sticker price.
function itemPriceNow(def, gs) {
  if (!def || def.price == null) return def?.price;
  const d = seasonalPriceDelta(def.id, gs);
  return d ? Math.max(1, def.price + d) : def.price;
}

// 'in season' / 'out of season' for a card, or null.
function produceSeasonNote(defId, gs) {
  const d = seasonalPriceDelta(defId, gs);
  return d < 0 ? 'in season' : d > 0 ? 'out of season' : null;
}

// Today's mean temperature: the seasonal baseline at midday plus the
// current condition's offset — how the day FEELS for an appetite, without
// the hour's swing.
function dayMeanTempC(gs) {
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  return seasonalBaselineC(weatherDoy(day) + 0.5) + weatherOffsetC(weatherConditionAt(gs, day, minutes), day);
}

// A craving's lean for a recipe (or an item, by defId): hearty on a cold
// day, fresh on a hot one (WEATHER_TUNING.food). Added to a taste band's
// weight where an NPC chooses; smaller than any gap between bands, so it
// only breaks ties. Pure.
function seasonalFoodLean(gs, recipeKey, defId) {
  const F = WEATHER_TUNING.food;
  const kind = (recipeKey && F.recipes[recipeKey]) || (defId && F.items[defId]) || null;
  if (!kind || !gs?.meta?.clock) return 0;
  const t = dayMeanTempC(gs);
  if (kind === 'hearty' && t <= F.coldC) return F.lean;
  if (kind === 'fresh' && t >= F.hotC) return F.lean;
  return 0;
}

// --- Wardrobe and mood (Phase 5, W7/W8) ------------------------------------------

// How to dress for going OUT of the flat (npc.js's 'work' fit): the
// weather outside, not the thermostat (WEATHER_TUNING.dressOut). Cold: the
// thermal bias toward the warmest layer. Hot: no outer layer at all
// (composeOutfit's skipSlots) — measured, a thermal bias alone kept the
// coat on at 27°C, since a coat's 'work'/'formal' traits outscore any heat.
// Returns composeOutfit bias fields: { thermal, skipSlots }.
function outdoorDressBias(gs) {
  const W = WEATHER_TUNING.dressOut;
  const t = outdoorTempC(gs);
  if (t <= W.coldC) return { thermal: THERMOSTAT_TUNING.clothingBiasWeight, skipSlots: [] };
  if (t >= W.hotC) return { thermal: -THERMOSTAT_TUNING.clothingBiasWeight, skipSlots: ['outerwear'] };
  return { thermal: 0, skipSlots: [] };
}

// Is this the year's first properly warm day — the first day of the year
// whose mean reaches mood.warmDayC? Pure.
function isFirstWarmDay(gs, day) {
  const M = WEATHER_TUNING.mood;
  const seed = gs?.meta?.seed;
  const mean = (d) => dayMeanTempC({ meta: { seed, clock: { day: d, minutes: 720 } } });
  if (mean(day) < M.warmDayC) return false;
  const yearStart = (getYear(day) - 1) * CALENDAR.daysPerYear + 1;
  for (let d = yearStart; d < day; d++) if (mean(d) >= M.warmDayC) return false;
  return true;
}

// Is this one of the darkest days of the year (daylight under
// mood.darkDayMinutes)?
function isDarkDay(day) {
  const { sunriseMin, sunsetMin } = daylight(day);
  return sunsetMin - sunriseMin < WEATHER_TUNING.mood.darkDayMinutes;
}

// The lift's effect lines: the player (a decaying impulse) and every resident.
function seasonalLiftEffects(gs) {
  const d = WEATHER_TUNING.mood.liftMood;
  const out = [`MOOD_DELTA player +${d}`];
  for (const [id, n] of Object.entries(gs?.npcs || {})) if (n?.residency?.status === 'resident') out.push(`MOOD_DELTA ${id} +${d}`);
  return out;
}

// The new day's seasonal mood beats: { lines, effects } — a narration line
// and the lift on the year's first warm day; the dark-weeks dip for the
// sensitive, floored (see WEATHER_TUNING.mood). Pure: returns effect lines
// for the caller (ui.js's rollover) to apply.
function seasonalMoodForDay(gs, day) {
  const M = WEATHER_TUNING.mood;
  const out = { lines: [], effects: [] };
  if (!day) return out;
  if (isFirstWarmDay(gs, day)) {
    out.lines.push(M.firstWarmLine);
    out.effects.push(...seasonalLiftEffects(gs));
  }
  if (isDarkDay(day)) {
    for (const [id, n] of Object.entries(gs?.npcs || {})) {
      if (n?.residency?.status !== 'resident') continue;
      if ((n.bible?.temperament?.volatility ?? 0) < M.darkVolatility) continue;
      const dip = Math.min(M.darkDip, Math.max(0, (n.mood ?? 0) - M.darkFloor));
      if (dip >= 0.001) out.effects.push(`MOOD_DELTA ${id} -${dip.toFixed(3)}`);
    }
  }
  return out;
}

// Did the year's first snow start in (fromAbs, toAbs]? The sky watch lifts
// everyone's mood at that moment (seasonalLiftEffects).
function firstSnowBetween(gs, fromAbs, toAbs) {
  return skyEventsBetween(gs, fromAbs, toAbs).some(e => e.kind === 'turn' && e.to === 'snow' && isFirstSnowDay(gs, e.day));
}

// --- Window views (Phase 6, W9) ------------------------------------------------------

// The view token for a room's scene plate right now — 'day-<season>-<look>'
// or 'night-<look>' — or null for a room that doesn't see outside. Folded
// into the plate key and prompt (image.js), so it must stay a SMALL bounded
// set (WEATHER_TUNING.views: 13 by day, 3 by night). Night is the clock's
// 'night' phase — the phase the plate's own lighting already uses — so the
// view and the light never disagree.
function windowViewToken(gs, roomId) {
  if (!weatherRoomExposure(roomId)) return null;
  const V = WEATHER_TUNING.views;
  const day = gs?.meta?.clock?.day ?? 1;
  const minutes = gs?.meta?.clock?.minutes ?? 720;
  const look = V.sky[weatherConditionAt(gs, day, minutes)] || 'grey';
  if ((gs?.meta?.clock?.phase || getPhase(minutes)) === 'night') {
    return `night-${look === 'sun' || look === 'grey' ? 'dark' : look}`;
  }
  const season = getSeason(day);
  return `day-${season}-${V.day[season][look] ? look : 'grey'}`;
}

// The prompt clause for a view token in a room ('window' or 'outside').
function windowViewPhrase(token, roomId) {
  if (!token) return null;
  const V = WEATHER_TUNING.views;
  const parts = token.split('-');
  if (parts[0] === 'night') {
    const set = V.night[weatherRoomExposure(roomId) === 'outside' ? 'outside' : 'window'];
    return set[parts[1]] || null;
  }
  return V.day[parts[1]]?.[parts[2]] || null;
}

// --- The rollover (narration only) ---------------------------------------------

// The morning's weather line for the NEW day: the first day of summer/
// autumn/winter. A change of weather arrives at a time of day since Phase 2
// and is narrated then, by the sky watch — never here. Pure.
function processWeatherForDay(gs, day) {
  const out = { lines: [] };
  if (!day) return out;
  const L = WEATHER_TUNING.lines;
  const dom = ((weatherDoy(day) - 1) % CALENDAR.daysPerSeason) + 1;
  const season = getSeason(day);
  if (dom === 1 && L.seasonTurn[season]) out.lines.push(L.seasonTurn[season]);
  return out;
}

// ===== /SECTION: SEASONS =====
