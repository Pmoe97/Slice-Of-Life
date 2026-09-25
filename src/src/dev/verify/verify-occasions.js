// Occasions & Holidays plan (occasions-and-holidays-plan.md) — Phase 1: the
// calendar spine (D1–D9; SEASONS-AND-OCCASIONS-ROADMAP.md R1–R12).
//
//   node src/src/dev/verify/verify-occasions.js
//
// Node coverage for occasions.js and its surfaces: registration (tuning, the
// Calendar's Holidays + Year tabs, both script lists); roster integrity; the
// R1 content guard (no faith vocabulary in any authored holiday string —
// roadmap invariant 1); the weekday pin (plan invariant 2 — every date falls
// on the weekday the plan's table says, every year); occasionsOnDay across
// runs and the year boundary; the upcoming/countdown readers; festivity (D6/D7
// — range, stability, override, leans, and heritage-blindness, R2); the
// prompt date line + per-NPC [Occasion] line reaching the real IM prompt; the
// rollover narration (morning / night-of-run / eve); the year-grid model; the
// HUD badge; and the real render.calendar.js painting 140 cells into a fake
// DOM (the verify-roomlist-inbox.js pattern). The rollover call site in ui.js
// and the live Calendar are verified on the page (see the plan's Handoff).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.computer.js', 'sim.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'computer.js', 'npc.js', 'llm.js', 'birthdays.js', 'occasions.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, n, day) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260922, n || 3);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    // Name the RESIDENTS in __ids order (generated names are '' — the
    // birthdays harness's gotcha), so "Mira" is always __ids(g)[0]. The house
    // also holds non-residents (the contractor…), which a plain sort over
    // every npc id would interleave.
    Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort()
      .forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  // Absolute day for (season index, day of season, year).
  __d = (si, dom, year) => ((year || 1) - 1) * 140 + si * 35 + dom;
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning, the Calendar tabs, both script lists');
const reg = J(`({
  defs: typeof OCCASION_DEFS === 'object' && Object.keys(OCCASION_DEFS).length,
  tuning: typeof OCCASION_TUNING === 'object',
  fns: ['occasionsOnDay','upcomingOccasions','daysUntilOccasion','npcFestivity','npcOccasionAffinity','occasionDateLine','occasionPromptLine','holidayRows','yearGridModel','occasionBadge','processOccasionsForDay'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  screens: Object.keys(APP_DEFS.calendar.screens),
  holidays: APP_DEFS.calendar.screens.holidays && { source: APP_DEFS.calendar.screens.holidays.source, renderer: APP_DEFS.calendar.screens.holidays.renderer },
  year: APP_DEFS.calendar.screens.year && APP_DEFS.calendar.screens.year.renderer,
  entry: APP_DEFS.calendar.entryScreen,
})`);
check('OCCASION_DEFS and OCCASION_TUNING exist (config.js)', reg.defs > 0 && reg.tuning, `${reg.defs} rows`);
check('every public occasions.js function is defined', reg.fns);
check('the Calendar gained Holidays (list over the holidays source) and Year (calendar-year) tabs', reg.holidays && reg.holidays.source === 'holidays' && reg.holidays.renderer === 'list' && reg.year === 'calendar-year', JSON.stringify(reg));
check('...and still opens on Upcoming, with Birthdays still there', reg.entry === 'upcoming' && reg.screens.includes('birthdays') && reg.screens.includes('upcoming'), JSON.stringify(reg.screens));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
const count = (re) => (indexHtml.match(re) || []).length;
check('index.html loads occasions.js and render.calendar.js exactly once each',
  count(/<script src="src\/src\/srcfiles\/occasions\.js\?v=\d+"><\/script>/g) === 1 && count(/<script src="src\/src\/srcfiles\/render\.calendar\.js\?v=\d+"><\/script>/g) === 1);
check('...occasions.js right after birthdays.js; render.calendar.js after render.computer.js (it extends COMPUTER_RENDERERS)',
  indexHtml.indexOf('srcfiles/birthdays.js') < indexHtml.indexOf('srcfiles/occasions.js')
  && indexHtml.indexOf('srcfiles/occasions.js') < indexHtml.indexOf('srcfiles/render.js?')
  && indexHtml.indexOf('srcfiles/render.computer.js') < indexHtml.indexOf('srcfiles/render.calendar.js'));
const loaderSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check("loadgame.js ORDER registers occasions.js after birthdays.js (and not the render-layer painter)",
  /'birthdays\.js',[\s\S]{0,600}?'occasions\.js'/.test(loaderSrc) && !/'render\.calendar\.js'/.test(loaderSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Roster integrity');
const roster = J(`(() => {
  const cats = new Set(OCCUPATION_POOL.map(o => o.category));
  const bad = [];
  for (const [key, d] of Object.entries(OCCASION_DEFS)) {
    const why = [];
    if (d.id !== key) why.push('id');
    if (!d.label || !d.emoji || !d.blurb) why.push('label/emoji/blurb');
    if (!CALENDAR.seasons.includes(d.season)) why.push('season');
    const span = d.span || 1;
    if (!(Number.isInteger(d.dom) && d.dom >= 1 && d.dom + span - 1 <= 35)) why.push('dom/span');
    if (!['major', 'partial', 'none'].includes(d.closure)) why.push('closure');
    if (!(d.lines && Array.isArray(d.lines.morning) && d.lines.morning.length)) why.push('morning lines');
    if (!Array.isArray(d.traditions)) why.push('traditions');
    for (const c of d.busyFor || []) if (!cats.has(c)) why.push('busyFor:' + c);
    if (span > 1 && !(d.lines.night && d.lines.night.length)) why.push('night lines');
    if (why.length) bad.push(key + ' ' + why.join(','));
  }
  return { bad, n: Object.keys(OCCASION_DEFS).length, majors: Object.values(OCCASION_DEFS).filter(d => d.closure === 'major').map(d => d.id) };
})()`);
check('every row is well-formed (id, season, dom+span inside the season, closure, lines, real busyFor categories)', roster.bad.length === 0, roster.bad.join(' | '));
check('the roster is the plan\'s 20 occasions + Tax Day twice (22 rows)', roster.n === 22, `${roster.n}`);
check('the major (day-off) set is exactly the plan\'s six', JSON.stringify(roster.majors.sort()) === JSON.stringify(['midsummer', 'midwinter', 'new_years_day', 'rest_day', 'spring_festival', 'thanksgiving']), JSON.stringify(roster.majors));

// ---------------------------------------------------------------- 2
console.log('\n2. R1 — no religion, anywhere (roadmap invariant 1)');
const allText = J(`(() => {
  const out = [];
  const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const d of Object.values(OCCASION_DEFS)) walk({ label: d.label, blurb: d.blurb, lines: d.lines, traditions: d.traditions });
  walk(OCCASION_TUNING.festivityWords);
  return out;
})()`);
const FAITH = /\b(gods?|church|chapel|mosque|temple|synagogue|shrine|pray(er|ers|ing)?|holy|saints?|christ\w*|jesus|allah|buddh\w*|bless(ed|ing)?|sacred|divine|faith\w*|religio\w*|worship\w*|easter|christmas|xmas|hanukk?ah|chanukah|diwali|ramadan|eid|passover|lent|advent|yuletide|nativity|miracle|spirit(s|ual)?|soul(s)?|heaven|angels?|pagan)\b/i;
const hits = allText.filter(t => FAITH.test(t));
check(`none of the ${allText.length} authored holiday strings carries faith vocabulary`, hits.length === 0, hits.join(' | '));

// ---------------------------------------------------------------- 3
console.log('\n3. The weekday pin (plan invariant 2) — every date on its table weekday, every year');
const PLAN_WEEKDAY = {
  new_years_day: 'Sunday', fools_day: 'Wednesday', valentines_day: 'Saturday', color_day: 'Saturday',
  spring_festival_eve: 'Saturday', spring_festival: 'Sunday', rest_day: 'Monday', parents_day: 'Sunday',
  midsummer: 'Wednesday', giving_week: 'Saturday', sharing_feast: 'Friday', tax_day_summer: 'Saturday',
  harvest_moon: 'Tuesday', halloween: 'Saturday', remembrance_night: 'Sunday', thanksgiving: 'Thursday',
  sale_day: 'Friday', lantern_nights: 'Sunday', midwinter_eve: 'Tuesday', midwinter: 'Wednesday',
  new_years_eve: 'Saturday', tax_day_winter: 'Saturday',
};
const wk = J(`Object.fromEntries(Object.values(OCCASION_DEFS).map(d => [d.id, [1, 2, 5].map(y => WEEKDAY_NAMES[getWeekday(occasionStartDay(d, y))])]))`);
const wkBad = Object.entries(PLAN_WEEKDAY).filter(([id, w]) => !wk[id] || wk[id].some(x => x !== w)).map(([id, w]) => `${id}: plan ${w}, got ${wk[id]}`);
check('all 22 rows start on the plan\'s weekday in years 1, 2 and 5', wkBad.length === 0 && Object.keys(wk).length === 22, wkBad.join(' | '));
const lanternRun = J(`[0,1,2,3,4,5].map(k => WEEKDAY_NAMES[getWeekday(__d(3, 8 + k))])`);
check('Lantern Nights runs Sunday → Friday', lanternRun.join(',') === 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday', lanternRun.join(','));

// ---------------------------------------------------------------- 4
console.log('\n4. occasionsOnDay — single days, runs, shared days, the year boundary');
const on = J(`({
  d1: occasionsOnDay(1).map(o => o.id),
  d140: occasionsOnDay(140).map(o => o.id),
  d141: occasionsOnDay(141).map(o => o.id),
  plain: occasionsOnDay(__d(0, 2)).map(o => o.id),
  lantern: [7, 8, 10, 13, 14].map(dom => (occasionsOnDay(__d(3, dom)).find(o => o.id === 'lantern_nights') || { night: 0 }).night),
  lanternY2: (occasionsOnDay(__d(3, 10, 2)).find(o => o.id === 'lantern_nights') || {}).night,
  giving: occasionsOnDay(__d(1, 33)).map(o => o.id + ':' + o.night + '/' + o.total),
  isOn: isOccasionOn(__d(2, 26), 'thanksgiving') && !isOccasionOn(__d(2, 25), 'thanksgiving'),
})`);
check('day 1 is New Year\'s Day', JSON.stringify(on.d1) === '["new_years_day"]', JSON.stringify(on.d1));
check("day 140 is New Year's Eve AND Tax Day (two occasions, one day)", JSON.stringify(on.d140.sort()) === JSON.stringify(['new_years_eve', 'tax_day_winter']), JSON.stringify(on.d140));
check("day 141 (year 2) is New Year's Day again", JSON.stringify(on.d141) === '["new_years_day"]', JSON.stringify(on.d141));
check('an ordinary day has nothing on it', on.plain.length === 0, JSON.stringify(on.plain));
check('Lantern Nights: nights 1, 3, 6 on Winter 8/10/13; nothing the day before or after', JSON.stringify(on.lantern) === '[0,1,3,6,0]', JSON.stringify(on.lantern));
check('...and the run recurs in year 2', on.lanternY2 === 3);
check("Giving Week's last night reports 6/6", on.giving.includes('giving_week:6/6'), JSON.stringify(on.giving));
check('isOccasionOn matches only the day itself', on.isOn === true);

// ---------------------------------------------------------------- 5
console.log('\n5. The countdown readers');
const up = J(`({
  until: daysUntilOccasion(OCCASION_DEFS.lantern_nights, __d(3, 5)),
  untilToday: daysUntilOccasion(OCCASION_DEFS.midwinter, __d(3, 25)),
  untilWrap: daysUntilOccasion(OCCASION_DEFS.new_years_day, __d(3, 35)),
  ongoing: upcomingOccasions(__d(3, 10), 3).map(r => r.id + ':' + r.daysUntil + (r.ongoing ? ':on' : '')),
  rows: holidayRows({ meta: { clock: { day: __d(3, 5) } } }).map(r => r.id),
  firstLabel: holidayRowLabel(holidayRows({ meta: { clock: { day: __d(3, 5) } } })[0]),
  onLabel: holidayRowLabel(holidayRows({ meta: { clock: { day: __d(3, 10) } } })[0]),
  givingLabel: holidayRowLabel(holidayRows({ meta: { clock: { day: __d(1, 20) } } }).find(r => r.id === 'giving_week')),
  givingOn: holidayRowLabel(holidayRows({ meta: { clock: { day: __d(1, 30) } } })[0]),
  givingToday: occasionTodayLabel(occasionsOnDay(__d(1, 30)).find(o => o.id === 'giving_week')),
})`);
check('daysUntil: 3 to Lantern Nights from Winter 5; 0 on Midwinter itself; 1 from the year\'s last day to New Year\'s Day', up.until === 3 && up.untilToday === 0 && up.untilWrap === 1, JSON.stringify(up));
check('a run under way is listed as ongoing today', up.ongoing[0] === 'lantern_nights:0:on', JSON.stringify(up.ongoing));
check('the Holidays tab lists all 22 rows for the coming year, soonest first', up.rows.length === 22 && up.rows[0] === 'lantern_nights', JSON.stringify(up.rows.slice(0, 4)));
check('a run counts in its own unit — Giving Week is six DAYS, not nights', /Giving Week — Sat 28th of Summer · 6 days \(in 8 days\)/.test(up.givingLabel) && /day 3 of 6 — on now/.test(up.givingOn) && up.givingToday === 'Giving Week (day 3 of 6)', JSON.stringify([up.givingLabel, up.givingOn, up.givingToday]));
check('row labels read naturally ("in 3 days" / "on now")', /Lantern Nights — Sun 8th of Winter · 6 nights \(in 3 days\)/.test(up.firstLabel) && /night 3 of 6 — on now/.test(up.onLabel), `${up.firstLabel} || ${up.onLabel}`);

// ---------------------------------------------------------------- 6
console.log('\n6. D6/D7 festivity — range, stability, override, leans, heritage-blind (R2)');
const fest = J(`(() => {
  const vals = [];
  let stable = true;
  for (let s = 1; s <= 30; s++) {
    const g = __mk(20260950 + s, 4);
    for (const id of Object.keys(g.npcs)) {
      const npc = g.npcs[id];
      const a = npcFestivity(npc);
      if (a !== npcFestivity(JSON.parse(JSON.stringify(npc)))) stable = false;
      vals.push(a);
    }
  }
  const g = __mk(3, 1); const npc = g.npcs[__ids(g)[0]];
  const base = JSON.parse(JSON.stringify(npc));
  const warm = JSON.parse(JSON.stringify(base));
  warm.bible.temperament.warmth = 0.9; warm.bible.personality.traits = ['nostalgic', 'warm', 'playful']; warm.bible.values = [{ name: 'tradition', opposition: 'progress' }, { name: 'connection', opposition: 'independence' }];
  const grump = JSON.parse(JSON.stringify(base));
  grump.bible.temperament.warmth = -0.9; grump.bible.personality.traits = ['cynical', 'cold', 'stoic']; grump.bible.values = [{ name: 'independence', opposition: 'connection' }];
  const heritage = JSON.parse(JSON.stringify(base));
  heritage.bible.physical = { ...(heritage.bible.physical || {}), skin: { ...((heritage.bible.physical || {}).skin || {}), ethnicity: 'Mediterranean' } };
  heritage.bible.species = 'elf';
  const ov = JSON.parse(JSON.stringify(base)); ov.bible.festivity = 0.93;
  const aff = Object.keys(OCCASION_DEFS).map(id => npcOccasionAffinity(npc, id));
  const f0 = npcFestivity(npc);
  return {
    n: vals.length, min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    distinct: new Set(vals.map(v => v.toFixed(3))).size, stable,
    warm: npcFestivity(warm), grump: npcFestivity(grump), base: f0,
    heritageSame: npcFestivity(heritage) === f0, override: npcFestivity(ov),
    affOk: aff.every(a => a >= 0 && a <= 1 && Math.abs(a - f0) <= OCCASION_TUNING.affinityJitter + 1e-9),
    affVaries: new Set(aff.map(a => a.toFixed(3))).size > 1,
  };
})()`);
check('festivity always lands in 0..1', fest.min >= 0 && fest.max <= 1, `min ${fest.min} max ${fest.max}`);
check('...centred near the middle, and genuinely spread', fest.mean > 0.35 && fest.mean < 0.65 && fest.distinct > 60, `mean ${fest.mean.toFixed(3)}, ${fest.distinct} distinct of ${fest.n}`);
check('the same person always has the same festivity (and a save round trip keeps it)', fest.stable);
check('a warm, nostalgic, tradition-valuing person out-festives a cold cynic', fest.warm > fest.base && fest.grump < fest.base && fest.warm - fest.grump > 0.4, `warm ${fest.warm.toFixed(2)} base ${fest.base.toFixed(2)} grump ${fest.grump.toFixed(2)}`);
check('heritage and species never move festivity (R2)', fest.heritageSame === true);
check('bible.festivity overrides', Math.abs(fest.override - 0.93) < 1e-9);
check('per-occasion affinity stays within jitter of festivity, and varies by occasion (D7)', fest.affOk && fest.affVaries);

// ---------------------------------------------------------------- 7
console.log('\n7. D4 — the date line and the [Occasion] line, into the real IM prompt');
const pr = J(`(() => {
  const g = __mk(4, 2, __d(0, 14)); const [a] = __ids(g);
  const val = occasionDateLine(g);
  const soon = occasionDateLine(__mk(4, 2, __d(0, 26)));
  const plainDay = occasionDateLine(__mk(4, 2, __d(0, 9)));
  const npcLine = occasionPromptLine(g, a);
  const lead = occasionPromptLine(__mk(4, 2, __d(2, 24)), __ids(__mk(4, 2))[0]);
  const im = buildImPrompt(assembleImContext(g, a), 'hey');
  g.npcs[a].residency.status = 'former';
  return { val, soon, plainDay, npcLine, lead, imDate: im.includes('- Date: Saturday, 14th of Spring'), imOcc: im.includes("[Occasion]: Today is Valentine's Day"), former: occasionPromptLine(g, a) };
})()`);
check("on Valentine's Day the date line names the day, the season stage and what it is", /^- Date: Saturday, 14th of Spring, Year 1 \(mid spring\)\. Today is Valentine's Day \(Valentine's Day — cards/.test(pr.val), pr.val);
check('three days out, a major occasion is "coming up" (Spring 26 → Spring Festival in 3 days)', /Coming up: Spring Festival in 3 days\.$/.test(pr.soon), pr.soon);
check('an ordinary day with nothing near says only the date', pr.plainDay === '- Date: Monday, 9th of Spring, Year 1 (early spring).', pr.plainDay);
check('the [Occasion] line says what today is and how they feel about it', /^\[Occasion\]: Today is Valentine's Day\. Mira (loves this holiday|enjoys it|takes it or leaves it|isn't really a holiday person|finds all the fuss a bit much)\.$/.test(pr.npcLine || ''), pr.npcLine);
check('two days before Thanksgiving the line is the lead-in', /^\[Occasion\]: Thanksgiving is in 2 days\./.test(pr.lead || ''), pr.lead);
check('both lines reach the real IM prompt', pr.imDate && pr.imOcc, JSON.stringify({ imDate: pr.imDate, imOcc: pr.imOcc }));
check('a former resident gets no [Occasion] line', pr.former === null);

// ---------------------------------------------------------------- 8
console.log('\n8. D5 — the rollover narration');
const nar = J(`({
  val: processOccasionsForDay(null, __d(0, 14)).lines,
  eve: processOccasionsForDay(null, __d(0, 13)).lines,
  night3: processOccasionsForDay(null, __d(3, 10)).lines,
  first: processOccasionsForDay(null, __d(3, 8)).lines,
  lanternEve: processOccasionsForDay(null, __d(3, 7)).lines,
  nye: processOccasionsForDay(null, 140).lines,
  plain: processOccasionsForDay(null, __d(0, 9)).lines,
  again: JSON.stringify(processOccasionsForDay(null, __d(2, 26)).lines) === JSON.stringify(processOccasionsForDay(null, __d(2, 26)).lines),
  mw: processOccasionsForDay(null, __d(3, 24)).lines,
})`);
check("Valentine's morning line on the day", nar.val.length === 1 && nar.val[0].startsWith('💝'), JSON.stringify(nar.val));
check('its eve line the day before', nar.eve.length === 1 && /Valentine's Day is tomorrow/.test(nar.eve[0]), JSON.stringify(nar.eve));
check('a later night of a run gets its numbered night line', nar.night3.length === 1 && /night 3 of 6 — 3 lanterns/.test(nar.night3[0]), JSON.stringify(nar.night3));
check('the first night gets the opening line; the day before, the eve line', /begin/.test(nar.first[0] || '') && /Lantern Nights start tomorrow/.test(nar.lanternEve[0] || ''), JSON.stringify([nar.first, nar.lanternEve]));
check("New Year's Eve and Tax Day both narrate on day 140", nar.nye.length === 2 && nar.nye.some(l => l.startsWith('🎆')) && nar.nye.some(l => l.startsWith('🧾')), JSON.stringify(nar.nye));
check('an ordinary day narrates nothing', nar.plain.length === 0, JSON.stringify(nar.plain));
check('the pick is deterministic', nar.again === true);
check("Midwinter Eve's line, with no separate eve line for Midwinter doubled on top", nar.mw.length === 1 && nar.mw[0].startsWith('✨'), JSON.stringify(nar.mw));

// ---------------------------------------------------------------- 9
console.log('\n9. D3 — the year-grid model and the HUD badge');
const grid = J(`(() => {
  const g = __mk(5, 2, __d(3, 25, 2)); const [a, b] = __ids(g);
  g.npcs[a].bible.birthday = 60; g.npcs[b].bible.birthday = 61;
  learnBirthday(g, a, 1);
  const m = yearGridModel(g);
  const m2 = yearGridModel(g, { birthdays: false });
  const cells = m.seasons.flatMap(s => s.cells);
  return {
    year: m.year, seasons: m.seasons.map(s => s.cells.length), sundays: m.seasons.map(s => s.cells[0].weekday),
    today: cells.filter(c => c.isToday).map(c => c.doy), past: cells.filter(c => c.isPast).length,
    marked: cells.filter(c => c.occasions.length).length,
    lantern: cells.filter(c => c.occasions.some(o => o.id === 'lantern_nights')).length,
    bday60: cells[59].birthdays, bday61: cells[60].birthdays, hidden: m2.seasons.flatMap(s => s.cells)[59].birthdays,
    badgeMw: occasionBadge(__d(3, 25)), badgeLantern: occasionBadge(__d(3, 9)), badgePlain: occasionBadge(__d(0, 9)),
  };
})()`);
check('year 2 on Midwinter: four seasons of 35 cells, each starting on a Sunday', grid.year === 2 && grid.seasons.join(',') === '35,35,35,35' && grid.sundays.every(w => w === 6), JSON.stringify(grid));
check('exactly one "today" (Winter 25 = day-of-year 130), and everything before it is past', JSON.stringify(grid.today) === '[130]' && grid.past === 129);
check('every occasion day is marked (20 single-day rows on 19 days — two share day 140 — plus two 6-day runs = 31)', grid.marked === 31 && grid.lantern === 6, `marked ${grid.marked}, lantern ${grid.lantern}`);
check('a known birthday shows on its day; an unknown one stays hidden (birthdays D3)', JSON.stringify(grid.bday60) === '["Mira"]' && grid.bday61.length === 0, JSON.stringify([grid.bday60, grid.bday61]));
check('the picker variant can switch birthdays off entirely', grid.hidden.length === 0);
check('HUD badge: "🎁 Midwinter", "🏮 Lantern Nights 2/6", and nothing on an ordinary day', grid.badgeMw === '🎁 Midwinter' && grid.badgeLantern === '🏮 Lantern Nights 2/6' && grid.badgePlain === '', JSON.stringify([grid.badgeMw, grid.badgeLantern, grid.badgePlain]));

// ---------------------------------------------------------------- 10
console.log('\n10. The real render.calendar.js paints the year (fake DOM)');
const calSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'srcfiles', 'render.calendar.js'), 'utf8');
api(`
  function __el(tag) {
    const attrs = new Map();
    return {
      tag, className: '', innerHTML: '', textContent: '', title: '', style: {}, children: [], listeners: {},
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    };
  }
  document = { createElement: (t) => __el(t), getElementById: () => null };
  var COMPUTER_RENDERERS = {};
`);
api(calSrc);
const dom = J(`(() => {
  const g = __mk(6, 2, __d(3, 25));
  const body = __el('div');
  COMPUTER_RENDERERS['calendar-year'](body, g, APP_DEFS.calendar, APP_DEFS.calendar.screens.year);
  const wrap = body.children[1];
  const seasonsEl = wrap.children[0];
  const cells = seasonsEl.children.flatMap(s => s.children[1].children.filter(c => c.className.includes('cal-cell')));
  const detail = wrap.children[1];
  const mwCell = cells[129];
  mwCell.listeners.click();
  const picked = [];
  const picker = buildYearGrid(yearGridModel(g, { birthdays: false }), { selectable: true, selectedDoy: 40, onPick: (d) => picked.push(d) });
  const pCells = picker.children[0].children.flatMap(s => s.children[1].children.filter(c => c.className.includes('cal-cell')));
  pCells[4].listeners.click();
  return {
    registered: typeof COMPUTER_RENDERERS['calendar-year'] === 'function',
    header: body.children[0].innerHTML, seasons: seasonsEl.children.length, cells: cells.length,
    firstCol: cells[0].style.gridColumn, lastCol: cells[34].style.gridColumn,
    today: cells.filter(c => c.className.includes('cal-today')).length,
    mwMarks: mwCell.innerHTML, mwTitle: mwCell.title, detailAfterTap: detail.textContent,
    pickerButtons: pCells.every(c => c.tag === 'button'), selected: pCells.filter(c => c.className.includes('cal-selected')).length, selectedIs40: pCells[39].className.includes('cal-selected'), picked,
    pickerNoPast: !pCells.some(c => c.className.includes('cal-past')),
  };
})()`);
check("the file registers COMPUTER_RENDERERS['calendar-year'] (the render.spritestudio.js extension shape)", dom.registered);
check('it paints a Year header, 4 seasons and 140 day cells', /Year 1/.test(dom.header) && dom.seasons === 4 && dom.cells === 140, JSON.stringify({ seasons: dom.seasons, cells: dom.cells }));
check('Sunday-first columns: the 1st lands in column 1 and the 35th (a Saturday) in column 7', dom.firstCol === '1' && dom.lastCol === '7', `${dom.firstCol}/${dom.lastCol}`);
check('today is outlined exactly once', dom.today === 1);
check("Midwinter's cell carries its emoji and a full title; tapping it fills the detail line (touch has no hover)", /🎁/.test(dom.mwMarks) && /25th of Winter · 🎁 Midwinter/.test(dom.mwTitle) && dom.detailAfterTap === dom.mwTitle, JSON.stringify({ marks: dom.mwMarks, title: dom.mwTitle, detail: dom.detailAfterTap }));
check('the picker variant: buttons, the chosen day highlighted, a tap reports its day-of-year, no past-dimming', dom.pickerButtons && dom.selected === 1 && dom.selectedIs40 && JSON.stringify(dom.picked) === '[5]' && dom.pickerNoPast, JSON.stringify({ selected: dom.selected, picked: dom.picked }));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
