// Birthdays & Occasions plan (birthdays-and-occasions-plan.md) — Phases 2–6:
// the player's own birthday (D13), importance & gossip (D14), the house
// celebrating, a birthday party, and contacts.
//
//   node src/src/dev/verify/verify-birthdays-p2.js
//
// Node coverage for the pure/trusted-producer half in birthdays.js, the
// year-grid picker's model and its real render.calendar.js over a fake DOM,
// and the studio's table/draft plumbing. The DOM-bound half (the studio's
// open/close picker disclosure, the old-save modal in ui.js) is verified on
// the live page — see the plan's Handoff.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.computer.js', 'sim.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'computer.js', 'npc.js', 'llm.js', 'birthdays.js', 'occasions.js', 'asks.js', 'commitments.js', 'world.js', 'chatter.js', 'studio.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const near = (a, b) => Math.abs(a - b) < 1e-9;
const SRC = path.join(__dirname, '..', '..', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed, n) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260929, n || 4);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    // Park every resident's birthday far from the days the sections use.
    for (const id of Object.keys(g.npcs)) g.npcs[id].bible.birthday = 120;
    // SIM_generateHouse leaves bible.name empty; give each a real, distinct name.
    Object.keys(g.npcs).sort().forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar', 'Priya'][i] || ('Roomie' + i); });
    // A clean slate for the relationships the sections care about.
    for (const pair of Object.values(g.world.castWeb || {})) for (const k of Object.keys(pair.axes || {})) pair.axes[k] = { ...pair.axes[k], affection: 0 };
    for (const id of Object.keys(g.npcs)) g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.1, tension: 0 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __setBday = (g, id, doy) => { g.npcs[id].bible.birthday = doy; };
  __at = (g, day) => { g.meta.clock.day = day; return g; };
  __rel = (g, id, fields) => { g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, ...fields }; };
  __cast = (g, from, to, affection) => {
    const key = [from, to].sort().join('|');
    const web = g.world.castWeb || (g.world.castWeb = {});
    if (!web[key]) web[key] = createBlankPair(from, to);
    web[key].axes[from + '→' + to] = { ...(web[key].axes[from + '→' + to] || {}), affection };
  };
  __castAff = (g, from, to) => castAffection(g, from, to);
  __threadMsgs = (g, id) => ((g.world.computer.apps.im.threads[id] || {}).msgs || []).filter(m => m.from === 'npc');
  __invCount = (g) => (g.player.inventory || []).reduce((n, s) => n + (s.qty || 0), 0);
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning, item, event classes, the studio field, the picker');
const reg = J(`({
  blocks: ['player','importance','celebrate','party','contacts'].map(k => typeof BIRTHDAY_TUNING[k] === 'object'),
  fns: ['rollPlayerBirthday','playerBirthdayDayOfYear','setPlayerBirthday','playerBirthdayNeedsPrompt','noteBirthdayTold','playerBirthdayPromptLine','npcBirthdayImportance','birthdayImportanceScale','celebrateBirthday','resolveBirthdayParties','noteBirthdayPartyPresence','isBirthdayContact','normalizePlayerBirthday'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  greetStyles: TEXTING_STYLES.every(s => BIRTHDAY_TUNING.player.greetLines[s] && BIRTHDAY_TUNING.celebrate.cardLines[s] && BIRTHDAY_TUNING.contacts.lines[s]),
  cake: (() => { const d = ITEM_DEFS.birthday_cake; return !!d && edibleDef(d) && d.servings === 6 && d.storageClass === 'fridge'; })(),
  events: EVENT_IMPORTANCE.birthday_card === 'social' && EVENT_IMPORTANCE.birthday_cake === 'social' && EVENT_EMOTION.birthday_card === 'warmth' && EVENT_EMOTION.birthday_cake === 'warmth',
  emotionValid: EMOTIONAL_WEIGHTS[EVENT_EMOTION.birthday_card] !== undefined,
  field: (() => { const f = findStudioField('birthday'); return f ? { kind: f.kind, tab: PLAYER_STUDIO_TABS.find(t => t.sections.some(s => s.fields.includes(f))).id } : null; })(),
})`);
check('BIRTHDAY_TUNING carries player / importance / celebrate / party / contacts blocks', reg.blocks.every(Boolean));
check('every Phase 2–6 public function is defined', reg.fns);
check('every texting style has a greeting, a card and a contact line', reg.greetStyles);
check('birthday_cake is a real edible: six servings, fridge-class', reg.cake);
check('the two new event types are classified (importance AND emotion) so the ticker and Chatter can use them', reg.events && reg.emotionValid);
check('the studio has a `birthday` field on the Identity tab', !!reg.field && reg.field.kind === 'birthday' && reg.field.tab === 'identity', JSON.stringify(reg.field));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
check('index.html still loads render.calendar.js and studio.js exactly once each', (indexHtml.match(/srcfiles\/render\.calendar\.js/g) || []).length === 1 && (indexHtml.match(/srcfiles\/studio\.js/g) || []).length === 1);
check('the new event types are spelled as literals where emitted (verify-i2 scans for them)', /type: 'birthday_card'/.test(srcOf('birthdays.js')) && /type: 'birthday_cake'/.test(srcOf('birthdays.js')));
check('sim.js calls noteBirthdayPartyPresence inside the live-party branch', /if \(liveParty\) \{[\s\S]{0,400}noteBirthdayPartyPresence/.test(srcOf('sim.js')));

// ---------------------------------------------------------------- 1
console.log('\n1. D13 — the player\'s birthday: rolled, picked, stored, and an old save\'s derived one');
const pb = J(`(() => {
  const rolls = []; let stable = true;
  for (let s = 1; s <= 200; s++) { const a = rollPlayerBirthday(s * 7919); if (a !== rollPlayerBirthday(s * 7919)) stable = false; rolls.push(a); }
  const warn = console.warn; console.warn = () => {};
  const picked = SIM_generateHouse(5, 1, [], { birthday: 77 });
  const blank = SIM_generateHouse(5, 1, [], {});
  const noDraft = SIM_generateHouse(5, 1);
  const bad = SIM_generateHouse(5, 1, [], { birthday: 999 });
  const frac = SIM_generateHouse(5, 1, [], { birthday: 12.5 });
  console.warn = warn;
  const g = __mk(2, 2);
  const stored = g.player.birthday;
  delete g.player.birthday;
  const derivedA = playerBirthdayDayOfYear(g);
  const derivedB = playerBirthdayDayOfYear(JSON.parse(JSON.stringify(g)));
  const needs1 = playerBirthdayNeedsPrompt(g);
  const badSet = setPlayerBirthday(g, 0) || setPlayerBirthday(g, 141) || setPlayerBirthday(g, 3.5) || setPlayerBirthday(g, '12');
  const okSet = setPlayerBirthday(g, 60);
  const after = { birthday: g.player.birthday, prompt: g.player.birthdays.promptShown, needs: playerBirthdayNeedsPrompt(g) };
  const h = __mk(3, 1); delete h.player.birthday;
  ensurePlayerBirthdays(h.player).promptShown = true;
  return { min: Math.min(...rolls), max: Math.max(...rolls), stable, distinct: new Set(rolls).size,
    picked: picked.player.birthday, blank: blank.player.birthday, noDraft: noDraft.player.birthday, bad: bad.player.birthday, frac: frac.player.birthday,
    blankAgain: SIM_generateHouse(5, 1, [], {}).player.birthday,
    stored, derivedA, derivedB, needs1, badSet, okSet, after, needsAfterShown: playerBirthdayNeedsPrompt(h) };
})()`);
check('a rolled birthday is always in 1..140, deterministic, and spread', pb.min >= 1 && pb.max <= 140 && pb.stable && pb.distinct > 100, JSON.stringify({ min: pb.min, max: pb.max, distinct: pb.distinct }));
check('the studio\'s pick is stored on player.birthday exactly', pb.picked === 77);
check('a blank draft (or no draft) rolls one from the seed — same seed, same day', Number.isInteger(pb.blank) && pb.blank >= 1 && pb.blank <= 140 && pb.blank === pb.noDraft && pb.blank === pb.blankAgain);
check('an out-of-range or fractional pick falls back to the roll, never stores junk', pb.bad === pb.blank && pb.frac === pb.blank);
check('a save with no stored birthday derives a stable one (no migration)', pb.derivedA >= 1 && pb.derivedA <= 140 && pb.derivedA === pb.derivedB);
check('...and it asks once: needs the prompt until answered', pb.needs1 === true && pb.needsAfterShown === false);
check('setPlayerBirthday refuses non-integers and out-of-range, accepts 1..140, and marks the prompt shown', pb.badSet === false && pb.okSet === true && pb.after.birthday === 60 && pb.after.prompt === true && pb.after.needs === false, JSON.stringify(pb.after));

// The studio's draft plumbing (pure half of studio.js).
const studio = J(`(() => {
  const draft = studioDraftFromPlayerRecord({ name: 'A', birthday: 12 });
  const noB = studioDraftFromPlayerRecord({ name: 'A' });
  studioSubject = { kind: 'player', draft: { name: 'Z', surname: 'Q', physical: {}, portrait: {}, birthday: 44 } };
  const built = buildPlayerDraftForNewGame();
  studioSubject = { kind: 'player', draft: { name: 'Z', surname: 'Q', physical: {}, portrait: {} } };
  const builtBlank = buildPlayerDraftForNewGame();
  studioSubject = null;
  return { reopened: draft.birthday, reopenedNone: noB.birthday, built: built.birthday, builtBlank: builtBlank.birthday, keyBlank: 'birthday' in builtBlank };
})()`);
check('the Sandbox re-open keeps the stored pick; a record with none stays unset', studio.reopened === 12 && studio.reopenedNone === undefined);
check('buildPlayerDraftForNewGame carries the pick, or leaves it undefined (rolled at world-build)', studio.built === 44 && studio.builtBlank === undefined);

// ---------------------------------------------------------------- 2
console.log('\n2. D13 — the day itself: who knows, who texts, who leaves a present');
const day = J(`(() => {
  const g = __mk(21, 4);
  const [a, b, c, d] = __ids(g);
  const doy = 33;
  g.player.birthday = doy;
  // a: very fond (texts), b: fond enough to know (>=0.30) and below the text bar, c: cold + never told, d: cold but told.
  __rel(g, a, { affection: 0.7 }); __rel(g, b, { affection: 0.35 }); __rel(g, c, { affection: 0.05 }); __rel(g, d, { affection: 0.05 });
  ensurePlayerBirthdays(g.player).told[d] = 5;
  const knowsBefore = { a: residentKnowsPlayerBirthday(g, a), b: residentKnowsPlayerBirthday(g, b), c: residentKnowsPlayerBirthday(g, c), d: residentKnowsPlayerBirthday(g, d) };
  const inv0 = __invCount(g);
  const imp0 = (g.player.moodEvents || []).length;
  __at(g, doy);
  const out = processBirthdaysForDay(g, doy);
  const self = g.player.birthdays.self;
  const texts = { a: __threadMsgs(g, a).map(m => m.text), b: __threadMsgs(g, b).map(m => m.text), c: __threadMsgs(g, c).length, d: __threadMsgs(g, d).map(m => m.text) };
  const lines = out.lines.slice();
  const inv1 = __invCount(g);
  const prompts = { a: birthdayPromptLine(g, a), b: birthdayPromptLine(g, b), c: birthdayPromptLine(g, c), d: birthdayPromptLine(g, d) };
  const impulses = (g.player.moodEvents || []).length - imp0;
  const rerun = processBirthdaysForDay(g, doy);
  return { knowsBefore, lines, texts, self, inv0, inv1, prompts, impulses, rerunLines: rerun.lines.length, rerunTexts: rerun.texts.length, inv2: __invCount(g), a, b, c, d, doy,
    P: BIRTHDAY_TUNING.player };
})()`);
check('a resident knows it if fond enough (>= knownAffection) or told — and not otherwise', day.knowsBefore.a && day.knowsBefore.b && !day.knowsBefore.c && day.knowsBefore.d, JSON.stringify(day.knowsBefore));
check('the morning line: "it\'s your birthday", once', day.lines.filter(l => /your birthday/.test(l)).length === 1, JSON.stringify(day.lines));
check('very fond texts at midnight (a real IM message in their thread); the stranger sends nothing', day.texts.a.length === 1 && /birthday/i.test(day.texts.a[0]) && day.texts.c === 0, JSON.stringify(day.texts));
check('the record notes who greeted how: text or spoken (b and d only text on a coin toss, never both)', day.self.greeted[day.a] === 'text' && !(day.c in day.self.greeted) && ['text', 'spoken'].includes(day.self.greeted[day.b]) && ['text', 'spoken'].includes(day.self.greeted[day.d]), JSON.stringify(day.self));
check('one present: the closest fond housemate\'s, into the player\'s bag, and the log line names it', day.inv1 === day.inv0 + 1 && day.self.gift && day.self.gift.from === day.a && day.lines.some(l => /🎁/.test(l)), JSON.stringify({ inv0: day.inv0, inv1: day.inv1, gift: day.self.gift, lines: day.lines }));
check('the player\'s mood lifts (day-of impulse + text greetings)', day.impulses >= 2, day.impulses);
check('the prompt line: knowers get TODAY-is-the-player\'s-birthday (already-texted vs unprompted); strangers get none', /already texted/.test(day.prompts.a) && /TODAY is the player's birthday/.test(day.prompts.b) && !/player's birthday/.test(day.prompts.c || '') && /player's birthday/.test(day.prompts.d), JSON.stringify(day.prompts));
check('idempotent: a rerun the same day adds no lines, texts or presents', day.rerunLines === 0 && day.rerunTexts === 0 && day.inv2 === day.inv1);

const quiet = J(`(() => {
  const g = __mk(22, 2); g.player.birthday = 50; __at(g, 50);
  const out = processBirthdaysForDay(g, 50);
  return { lines: out.lines, gift: g.player.birthdays.self.gift, texts: out.texts.length };
})()`);
check('nobody knows and nobody is fond: a quiet day with a hint to mention it — no gift, no texts', quiet.lines.length === 1 && /nobody here knows/i.test(quiet.lines[0]) && quiet.gift === null && quiet.texts === 0, JSON.stringify(quiet));

const soon = J(`(() => {
  const g = __mk(23, 2); const [a] = __ids(g);
  g.player.birthday = 60; __rel(g, a, { affection: 0.6 });
  __at(g, 58); const in2 = playerBirthdayPromptLine(g, a);
  __at(g, 59); const tomorrow = playerBirthdayPromptLine(g, a);
  __at(g, 40); const far = playerBirthdayPromptLine(g, a);
  return { in2, tomorrow, far };
})()`);
check('inside promptSoonDays a knowing roommate mentions it ("in 2 days" / "tomorrow"); far off, silence', /in 2 days/.test(soon.in2) && /tomorrow/.test(soon.tomorrow) && soon.far === null, JSON.stringify(soon));

const told = J(`(() => {
  const g = __mk(24, 2); const [a] = __ids(g);
  g.player.birthday = 80; __at(g, 20);
  const factsBefore = g.npcs[a].memory.facts.length;
  const first = noteBirthdayWish(g, a, "My birthday is on the 10th of Summer, by the way", 'spoken');
  const second = noteBirthdayWish(g, a, 'it is my birthday soon, remember', 'spoken');
  return { first, second, known: residentKnowsPlayerBirthday(g, a), theirsKnown: knowsBirthday(g, a), facts: g.npcs[a].memory.facts.slice(factsBefore), told: g.player.birthdays.told[a], date: formatBirthday(80) };
})()`);
check('telling a roommate your birthday is a "told" beat that names the real date, once', !!told.first && told.first.kind === 'told' && told.first.beat.includes(told.date) && told.second === null, JSON.stringify(told.first));
check('...they now know it, it wrote them a memory, and it did NOT teach the player theirs', told.known && told.told === 20 && told.facts.length === 1 && /birthday/.test(told.facts[0].text) && told.theirsKnown === false);

// ---------------------------------------------------------------- 3
console.log('\n3. Calendar — your birthday on the year grid, the Birthdays tab, and the creation picker\'s model');
const cal = J(`(() => {
  const g = __mk(31, 2); g.player.birthday = 71; __at(g, 12);
  const model = yearGridModel(g);
  const cells = model.seasons.flatMap(s => s.cells);
  const selfCells = cells.filter(c => c.selfBirthday).map(c => c.doy);
  const pickerModel = yearGridModel(null, { noToday: true, birthdays: false, events: false });
  const pCells = pickerModel.seasons.flatMap(s => s.cells);
  const rows = knownBirthdayRows(g);
  const selfRow = rows.find(r => r.self);
  return { selfCells, total: cells.length, today: cells.filter(c => c.isToday).length, pToday: pCells.filter(c => c.isToday).length, pPast: pCells.filter(c => c.isPast).length, pSelf: pCells.filter(c => c.selfBirthday).length,
    pTotal: pCells.length, pOcc: pCells.filter(c => c.occasions.length).length, selfRow, label: birthdayRowLabel(selfRow) };
})()`);
check('the year grid marks exactly your own day', cal.selfCells.length === 1 && cal.selfCells[0] === 71 && cal.total === 140 && cal.today === 1);
check('the picker model (no player, no today) still has all 140 days and the holidays, but marks no today/past/self', cal.pTotal === 140 && cal.pToday === 0 && cal.pPast === 0 && cal.pSelf === 0 && cal.pOcc > 10, JSON.stringify({ pTotal: cal.pTotal, pToday: cal.pToday, pPast: cal.pPast, pOcc: cal.pOcc }));
check('the Birthdays tab always lists you: "🎂 Your birthday — <date> (in N days)"', !!cal.selfRow && cal.selfRow.date === '1st of Autumn' && /^🎂 Your birthday — 1st of Autumn \(in 59 days\)$/.test(cal.label), cal.label);

const calSrc = srcOf('render.calendar.js');
api(`
  function __dom(tag) {
    const attrs = new Map();
    return { tag, className: '', innerHTML: '', textContent: '', title: '', type: '', style: {}, children: [], listeners: {},
      setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      appendChild(c) { this.children.push(c); return c; }, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
  }
  document = { createElement: (t) => __dom(t), getElementById: () => null };
  var COMPUTER_RENDERERS = {};
`);
api(calSrc);
const dom = J(`(() => {
  const picked = [];
  const wrap = buildBirthdayPicker(30, (d) => picked.push(d));
  const mount = wrap.children[1];
  const cellsOf = () => mount.children[mount.children.length - 1].children[0].children.flatMap(s => s.children[1].children.filter(c => c.className.includes('cal-cell')));
  let cells = cellsOf();
  const before = { n: cells.length, buttons: cells.every(c => c.tag === 'button' && c.type === 'button'), sel: cells.filter(c => c.className.includes('cal-selected')).map(c => cells.indexOf(c) + 1) };
  cells[99].listeners.click();
  cells = cellsOf();
  const after = { sel: cells.filter(c => c.className.includes('cal-selected')).map(c => cells.indexOf(c) + 1) };
  const none = buildBirthdayPicker(null, () => {});
  const noneCells = none.children[1].children[0].children[0].children.flatMap(s => s.children[1].children.filter(c => c.className.includes('cal-cell')));
  const g = __mk(32, 1); g.player.birthday = 71; __at(g, 12);
  const yr = __dom('div'); COMPUTER_RENDERERS['calendar-year'](yr, g, APP_DEFS.calendar, APP_DEFS.calendar.screens.year);
  const yrCells = yr.children[1].children[0].children.flatMap(s => s.children[1].children.filter(c => c.className.includes('cal-cell')));
  return { before, picked, after, noneSel: noneCells.filter(c => c.className.includes('cal-selected')).length, selfTitle: yrCells[70].title, selfMarks: yrCells[70].innerHTML };
})()`);
check('the real picker: 140 buttons, the current day highlighted, a tap reports its day and moves the highlight', dom.before.n === 140 && dom.before.buttons && JSON.stringify(dom.before.sel) === '[30]' && JSON.stringify(dom.picked) === '[100]' && JSON.stringify(dom.after.sel) === '[100]', JSON.stringify(dom));
check('an unpicked picker has nothing highlighted (the game rolls it)', dom.noneSel === 0);
check('the Calendar Year tab marks your day with 🎂 and a "Your birthday" title', /🎂/.test(dom.selfMarks) && /Your birthday/.test(dom.selfTitle), JSON.stringify({ t: dom.selfTitle, m: dom.selfMarks }));

// ---------------------------------------------------------------- 4
console.log('\n4. D14 — importance: derived, spread, leaned by traits and age; scales the sting; a hurt one tells');
const imp = J(`(() => {
  const all = [];
  const warn = console.warn; console.warn = () => {};
  for (let s = 1; s <= 30; s++) { const g = __mk(400 + s, 4); for (const id of __ids(g)) { delete g.npcs[id].bible.birthdayImportance; all.push(npcBirthdayImportance(g.npcs[id])); } }
  console.warn = warn;
  const g = __mk(41, 3); const [a] = __ids(g);
  const npc = g.npcs[a];
  const base = () => { const n = JSON.parse(JSON.stringify(npc)); n.bible.personality = { ...(n.bible.personality || {}), traits: [] }; n.bible.age = 33; return n; };
  const plain = npcBirthdayImportance(base());
  const dramatic = base(); dramatic.bible.personality.traits = ['dramatic', 'expressive'];
  const stoic = base(); stoic.bible.personality.traits = ['stoic', 'understated'];
  const round = base(); round.bible.age = 30;
  const twentyOne = base(); twentyOne.bible.age = 21;
  const over = base(); over.bible.birthdayImportance = 0.9;
  const overBad = base(); overBad.bible.birthdayImportance = 7;
  const lo = base(); lo.bible.birthdayImportance = 0;
  const hi = base(); hi.bible.birthdayImportance = 1;
  const I = BIRTHDAY_TUNING.importance;
  return { n: all.length, min: Math.min(...all), max: Math.max(...all), mean: all.reduce((x, y) => x + y, 0) / all.length,
    plain, dramatic: npcBirthdayImportance(dramatic), stoic: npcBirthdayImportance(stoic), round: npcBirthdayImportance(round), twentyOne: npcBirthdayImportance(twentyOne),
    over: npcBirthdayImportance(over), overBad: npcBirthdayImportance(overBad),
    scaleLo: birthdayImportanceScale(lo), scaleHi: birthdayImportanceScale(hi), I };
})()`);
check('importance is always in 0..1 and actually spreads across characters (a stoic barely cares, a dramatic one does)', imp.min >= 0 && imp.max <= 1 && imp.max - imp.min > 0.4, JSON.stringify({ min: imp.min, max: imp.max, mean: imp.mean }));
check('traits lean it: dramatic/expressive up, stoic/understated down, against the same person', imp.dramatic > imp.plain && imp.stoic < imp.plain && imp.dramatic - imp.stoic > 0.3);
check('a round age (30) or 21 is a milestone bonus', near(imp.round - imp.plain, imp.I.milestoneBonus) && near(imp.twentyOne - imp.plain, imp.I.milestoneBonus));
check('an explicit bible.birthdayImportance overrides, clamped to 0..1', near(imp.over, 0.9) && imp.overBad === 1);
check('the multiplier spans exactly scaleLo..scaleHi ("doesn\'t need to be a HUGE deal")', near(imp.scaleLo, imp.I.scaleLo) && near(imp.scaleHi, imp.I.scaleHi) && imp.I.scaleHi <= 1.6 && imp.I.scaleLo >= 0.5);

const sting = J(`(() => {
  const run = (importance, listeners) => {
    const g = __mk(42, 4); const [a, b, c, d] = __ids(g);
    __setBday(g, a, 50); g.npcs[a].bible.birthdayImportance = importance;
    __rel(g, a, { affection: 0.5, tension: 0 });
    learnBirthday(g, a, 1);
    // a is close to b (strongest) and c; d is a stranger.
    __cast(g, a, b, 0.6); __cast(g, a, c, 0.35); __cast(g, a, d, 0.05);
    if (!listeners) { __cast(g, a, b, 0); __cast(g, a, c, 0); }
    __at(g, 50); processBirthdaysForDay(g, 50);
    const before = g.npcs[a].relPlayer.affection;
    const f0 = { b: g.npcs[b].memory.facts.length, c: g.npcs[c].memory.facts.length, d: g.npcs[d].memory.facts.length };
    __at(g, 51);
    const out = processBirthdaysForDay(g, 51);
    const told = (id, fb) => g.npcs[id].memory.facts.slice(fb).filter(f => /never said a word/.test(f.text));
    return { drop: before - g.npcs[a].relPlayer.affection, lines: out.lines, b: told(b, f0.b), c: told(c, f0.c), d: told(d, f0.d), scale: birthdayImportanceScale(g.npcs[a]), a };
  };
  return { hi: run(0.95, true), lo: run(0.1, true), mid: run(0.65, true), lonely: run(0.95, false), F: BIRTHDAY_TUNING.forgot, I: BIRTHDAY_TUNING.importance };
})()`);
check('being forgotten stings a high-importance roommate more than a low one — exactly the scale', sting.hi.drop > sting.lo.drop * 2 && near(sting.hi.drop, -sting.F.affection * sting.hi.scale) && near(sting.lo.drop, -sting.F.affection * sting.lo.scale), JSON.stringify({ hi: sting.hi.drop, lo: sting.lo.drop }));
check('a high-importance hurt one tells their two closest housemates (a real told_by fact, provenance recorded); a stranger is not told', sting.hi.b.length === 1 && sting.hi.c.length === 1 && sting.hi.d.length === 0 && /^told_by:/.test(sting.hi.b[0].provenance) && sting.hi.b[0].provenance === 'told_by:' + sting.hi.a, JSON.stringify({ b: sting.hi.b, c: sting.hi.c }));
check('the log line tells you it got around', sting.hi.lines.some(l => l.includes(sting.I.gossipLine)), JSON.stringify(sting.hi.lines));
check('a low-importance one tells nobody, and no "got around" line', sting.lo.b.length === 0 && sting.lo.c.length === 0 && !sting.lo.lines.some(l => l.includes(sting.I.gossipLine)));
check('a mid-importance one (above gossipMin, below highAt) tells only the closest', sting.mid.b.length === 1 && sting.mid.c.length === 0, JSON.stringify({ b: sting.mid.b.length, c: sting.mid.c.length }));
check('nobody close enough to tell: the sting lands, no gossip, no "got around"', sting.lonely.drop > 0 && sting.lonely.b.length === 0 && !sting.lonely.lines.some(l => l.includes(sting.I.gossipLine)));

// ---------------------------------------------------------------- 5
console.log('\n5. Phase 4 — the house celebrates: a card, a cake, a post, a cast-web bump; the cold are noticed');
const cel = J(`(() => {
  const g = __mk(51, 5);
  const [a, b, c, d, e] = __ids(g);   // a = birthday roommate; b, c, d fond of a; e a stranger to a
  __setBday(g, a, 50); g.npcs[a].bible.birthdayImportance = 0.9;
  __cast(g, b, a, 0.6); __cast(g, c, a, 0.5); __cast(g, d, a, 0.4);
  const feed = g.world.computer.apps.social_feed;
  const posts0 = feed.posts.length;
  const events0 = (g.world.events || []).length;
  const notes0 = Object.values(g.objects['room_' + g.npcs[a].residency.room] || {}).filter(o => o.defId === 'note').length;
  const fridge = Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge');
  const cake0 = (fridge.contents || []).filter(s => s.defId === 'birthday_cake').length;
  const mood0 = g.npcs[a].mood;
  const cast0 = { b: __castAff(g, b, a), ab: __castAff(g, a, b), e: __castAff(g, a, e) };
  __at(g, 50);
  const out = processBirthdaysForDay(g, 50);
  const evs = (g.world.events || []).slice(events0);
  const notes = Object.values(g.objects['room_' + g.npcs[a].residency.room] || {}).filter(o => o.defId === 'note');
  const cakeStacks = (Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge').contents || []).filter(s => s.defId === 'birthday_cake');
  const newPosts = feed.posts.slice(posts0);
  const marks = g.player.birthdays.marks[a];
  const moodUp = g.npcs[a].mood - mood0;
  const again = processBirthdaysForDay(g, 50);
  const snubFacts = g.npcs[a].memory.facts.filter(f => /didn't do a thing/.test(f.text));
  return { out: out.lines, evs: evs.map(x => ({ type: x.type, room: x.roomId, npc: x.npcId, seen: x.seenByPlayer })), notes: notes.length - notes0, cakes: cakeStacks.length - cake0, posts: newPosts.map(p => ({ author: p.author, text: p.text, likes: p.likes })),
    noteMeta: notes.map(n => ({ author: n.meta.authorId, to: n.meta.addressedTo, motive: n.meta.motive, text: n.meta.text })),
    marks, castNow: { b: __castAff(g, b, a), ab: __castAff(g, a, b), e: __castAff(g, a, e) }, cast0, moodUp, dayOfMood: BIRTHDAY_TUNING.dayOfMood,
    snub: snubFacts.length, snubIds: snubFacts.map(f => f.text), againLines: again.lines.filter(l => /busy for/.test(l)).length, againNotes: Object.values(g.objects['room_' + g.npcs[a].residency.room] || {}).filter(o => o.defId === 'note').length,
    ids: { a, b, c, d, e }, C: BIRTHDAY_TUNING.celebrate };
})()`);
const celeb = cel.evs.length + cel.posts.length; // every celebrated gesture is either an event (card/cake) or a post
check('each of the three fond housemates did exactly one thing (card, cake or post) — nobody twice, the stranger nothing', cel.notes + cel.cakes + cel.posts.length === 3 && cel.evs.length === cel.notes + cel.cakes, JSON.stringify({ notes: cel.notes, cakes: cel.cakes, posts: cel.posts.length, evs: cel.evs }));
check('at most ONE cake per birthday, and it is a real fridge item (an edible stack)', cel.cakes <= 1);
check('a card is a real note on the birthday roommate\'s bedroom, from the celebrant, addressed to them, motive birthday_card', cel.noteMeta.every(n => n.to === cel.ids.a && n.motive === 'birthday_card' && [cel.ids.b, cel.ids.c, cel.ids.d].includes(n.author) && /birthday/i.test(n.text)), JSON.stringify(cel.noteMeta));
check('a post is on Chatter, authored by the celebrant, liked by the birthday roommate', cel.posts.every(p => [cel.ids.b, cel.ids.c, cel.ids.d].includes(p.author) && p.likes.includes(cel.ids.a) && /./.test(p.text)), JSON.stringify(cel.posts));
check('the events are the classified types, unseen, in real rooms (so the ticker/evidence paths can surface them)', cel.evs.every(x => ['birthday_card', 'birthday_cake'].includes(x.type) && x.seen === false && x.room));
check('cast-web bump: each celebrant toward them +toHonoree, them toward each celebrant +fromHonoree; the stranger unchanged (importance 0.9 → snubbed)',
  near(cel.castNow.b - cel.cast0.b, cel.C.bump.toHonoree) && near(cel.castNow.ab - cel.cast0.ab, cel.C.bump.fromHonoree) && near(cel.castNow.e - cel.cast0.e, cel.C.snubCastAffection), JSON.stringify({ now: cel.castNow, was: cel.cast0 }));
check('the birthday roommate\'s mood lifts by the day-of lift + their share of the gestures (capped)', near(cel.moodUp, cel.dayOfMood + Math.min(cel.C.honoreeMoodCap, 3 * cel.C.honoreeMood)), cel.moodUp);
check('the noticed-nothing snub: someone whose day matters to them remembers who did nothing (one memory per snubber)', cel.snub >= 1 && cel.snub <= 2);
check('one narration line for the player naming what happened; the mark says celebrated', cel.out.filter(l => /busy for/.test(l)).length === 1 && cel.marks.celebrated === true);
check('idempotent: a rerun the same day celebrates nothing twice (no second line, no second card)', cel.againLines === 0 && cel.againNotes === cel.notes);

const cold = J(`(() => {
  const g = __mk(52, 3); const [a, b, c] = __ids(g);
  __setBday(g, a, 50); g.npcs[a].bible.birthdayImportance = 0.2;
  __at(g, 50);
  const out = processBirthdaysForDay(g, 50);
  const snub = g.npcs[a].memory.facts.filter(f => /didn't do a thing/.test(f.text)).length;
  return { lines: out.lines, snub, events: (g.world.events || []).filter(e => /birthday_/.test(e.type)).length, castAB: __castAff(g, a, b) };
})()`);
check('nobody fond: nothing is celebrated, and a low-importance roommate doesn\'t hold it against them', cold.lines.filter(l => /busy for/.test(l)).length === 0 && cold.snub === 0 && cold.events === 0 && cold.castAB === 0, JSON.stringify(cold));

const cakeOnly = J(`(() => {
  // Force the bake path: with a chance of 1 the fondest bakes, the rest fall back to something else.
  const T = BIRTHDAY_TUNING.celebrate; const was = T.cakeChance; T.cakeChance = 1;
  const g = __mk(53, 4); const [a, b, c, d] = __ids(g);
  __setBday(g, a, 50); __cast(g, b, a, 0.6); __cast(g, c, a, 0.5); __cast(g, d, a, 0.4);
  __at(g, 50); processBirthdaysForDay(g, 50);
  T.cakeChance = was;
  const fridge = Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge');
  const cakes = (fridge.contents || []).filter(s => s.defId === 'birthday_cake');
  const evs = (g.world.events || []).filter(e => e.type === 'birthday_cake' || e.type === 'birthday_card');
  const st = cakes[0];
  return { cakes: cakes.length, qty: st && st.qty, servings: st && stackServingsLeft(st), evTypes: evs.map(e => e.type + ':' + e.npcId), b, c, d };
})()`);
check('with every roll baking: still one cake (the fondest\'s), a real six-serving fridge stack; the others left cards', cakeOnly.cakes === 1 && cakeOnly.servings === 6 && cakeOnly.evTypes.filter(e => e.startsWith('birthday_cake')).length === 1 && cakeOnly.evTypes[0] === 'birthday_cake:' + cakeOnly.b, JSON.stringify(cakeOnly));

const noRoom = J(`(() => {
  // A fresh Sandbox roommate has no bedroom of their own (residency.room is null): the card goes on the fridge, not nowhere.
  const T = BIRTHDAY_TUNING.celebrate; const was = T.postChance; T.postChance = 0; const wasCake = T.cakeChance; T.cakeChance = 0;
  const g = __mk(54, 3); const [a, b] = __ids(g);
  g.npcs[a].residency.room = null; __setBday(g, a, 50); __cast(g, b, a, 0.6);
  __at(g, 50); const out = processBirthdaysForDay(g, 50);
  T.postChance = was; T.cakeChance = wasCake;
  const fridge = Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge');
  const notes = Object.values(g.objects.room_kitchen).filter(o => o.defId === 'note' && o.meta.motive === 'birthday_card');
  const ev = (g.world.events || []).find(e => e.type === 'birthday_card');
  return { notes: notes.length, attached: notes[0] && notes[0].meta.attachedTo === fridge.id, to: notes[0] && notes[0].meta.addressedTo === a, room: ev && ev.roomId, text: ev && formatEventText(ev, g.npcs), line: out.lines.filter(l => /busy for/.test(l)).length };
})()`);
check('a roommate with no bedroom still gets their card — on the fridge, attached, addressed to them, with a fridge-worded event', noRoom.notes === 1 && noRoom.attached && noRoom.to && noRoom.room === 'kitchen' && /on the fridge/.test(noRoom.text) && noRoom.line === 1, JSON.stringify(noRoom));

// ---------------------------------------------------------------- 6
console.log('\n6. Phase 5 — a house party booked on their birthday is THEIR party');
const party = J(`(() => {
  const mkParty = (over) => {
    const g = __mk(61, 4); const [a, b, c, d] = __ids(g);
    __setBday(g, a, 50); g.npcs[a].bible.birthdayImportance = over.importance ?? 0.5;
    __rel(g, a, { affection: 0.5, tension: 0 });
    learnBirthday(g, a, 1);
    __at(g, 50);
    const c1 = { id: 'commit_p', kind: 'party', roomId: 'living_room', startAbs: 50 * 1440 + 1200, endAbs: 50 * 1440 + 1380, invitedIds: [a, b, c], acceptedIds: over.accepted ? over.accepted({ a, b, c, d }) : [a, b, c], declinedIds: [], status: 'scheduled', host: over.host || 'player' };
    g.world.commitments = [c1];
    return { g, a, b, c, d, c1 };
  };
  const out = {};
  // happy path: honoree, b and the player came; c said yes and never showed.
  { const { g, a, b, c, c1 } = mkParty({});
    const promptDay = birthdayPromptLine(g, a);
    noteBirthdayPartyPresence(g, c1, a); noteBirthdayPartyPresence(g, c1, b);
    g.player.location = 'living_room'; noteBirthdayPartyPresence(g, c1, b);
    const aff0 = g.npcs[a].relPlayer.affection, mood0 = g.npcs[a].mood, cab0 = __castAff(g, b, a), cac0 = __castAff(g, a, c), cba0 = __castAff(g, a, b);
    const scale = birthdayImportanceScale(g.npcs[a]);
    __at(g, 51);
    const res = processBirthdaysForDay(g, 51);
    out.happy = { promptDay, attended: c1.attended.slice(), lines: res.lines, affD: g.npcs[a].relPlayer.affection - aff0, moodD: g.npcs[a].mood - mood0, scale,
      castB: __castAff(g, b, a) - cab0, castBback: __castAff(g, a, b) - cba0, castNoShow: __castAff(g, a, c) - cac0, mark: g.player.birthdays.marks[a], resolved: c1.birthdayResolved,
      facts: g.npcs[a].memory.facts.map(f => f.text).filter(t => /party|come|birthday/.test(t)), rerun: processBirthdaysForDay(g, 51).lines.length };
  }
  // the player threw it and never came
  { const { g, a, b, c1 } = mkParty({});
    g.player.location = 'kitchen'; noteBirthdayPartyPresence(g, c1, a);
    const aff0 = g.npcs[a].relPlayer.affection;
    __at(g, 51); const res = processBirthdaysForDay(g, 51);
    out.skipped = { lines: res.lines, affD: g.npcs[a].relPlayer.affection - aff0, scale: birthdayImportanceScale(g.npcs[a]), facts: g.npcs[a].memory.facts.map(f => f.text).filter(t => /didn't even come/.test(t)).length, attended: c1.attended };
  }
  // the guest of honor never showed
  { const { g, a, b, c1 } = mkParty({});
    noteBirthdayPartyPresence(g, c1, b);
    const aff0 = g.npcs[a].relPlayer.affection;
    __at(g, 51); const res = processBirthdaysForDay(g, 51);
    out.noHonoree = { lines: res.lines.filter(l => /party/.test(l)), mark: g.player.birthdays.marks[a], affD: g.npcs[a].relPlayer.affection - aff0, resolved: c1.birthdayResolved };
  }
  // an ordinary party (the honoree isn't invited/accepted) resolves nothing
  { const { g, a, b, c, c1 } = mkParty({ accepted: (i) => [i.b, i.c] });
    noteBirthdayPartyPresence(g, c1, b);
    __at(g, 51); const res = processBirthdaysForDay(g, 51);
    out.ordinary = { lines: res.lines.filter(l => /party/.test(l)), resolved: !!c1.birthdayResolved, partyToday: (() => { __at(g, 50); return birthdayPartyToday(g, a); })() };
  }
  // a party for someone whose birthday isn't that day
  { const { g, a, b, c1 } = mkParty({});
    __setBday(g, a, 90);
    noteBirthdayPartyPresence(g, c1, a);
    __at(g, 51); const res = processBirthdaysForDay(g, 51);
    out.wrongDay = { lines: res.lines.filter(l => /party/.test(l)), resolved: !!c1.birthdayResolved };
  }
  // the sting never lands on someone you threw a party for
  { const { g, a, b, c1 } = mkParty({});
    processBirthdaysForDay(g, 50);
    noteBirthdayPartyPresence(g, c1, a); noteBirthdayPartyPresence(g, c1, b);
    g.player.location = 'living_room'; noteBirthdayPartyPresence(g, c1, b);
    __at(g, 51); processBirthdaysForDay(g, 51);
    out.noSting = { forgot: g.player.birthdays.marks[a].forgot, partied: g.player.birthdays.marks[a].partied };
  }
  // a party, but the honoree attended and nothing else (a party for two)
  { const { g, a, c1 } = mkParty({ accepted: (i) => [i.a] });
    noteBirthdayPartyPresence(g, c1, a);
    __at(g, 51); const res = processBirthdaysForDay(g, 51);
    out.forTwo = res.lines.filter(l => /party/.test(l));
  }
  out.P = BIRTHDAY_TUNING.party;
  return out;
})()`);
check('the prompt line on the day itself carries the party ("a party in their honor tonight")', /party in their honor/.test(party.happy.promptDay), party.happy.promptDay);
check('presence is a ledger: honoree, guest, and the player (when in the party room) — no duplicates', new Set(party.happy.attended).size === party.happy.attended.length && party.happy.attended.includes('player') && party.happy.attended.length === 3, JSON.stringify(party.happy.attended));
check('a party that reached its guest of honor: one line, mood by honoreeMood x importance, host affection by hostAffection x importance', party.happy.lines.some(l => /party was a hit/.test(l)) && near(party.happy.moodD, party.P.honoreeMood * party.happy.scale + 0) && near(party.happy.affD, party.P.hostAffection * party.happy.scale), JSON.stringify({ lines: party.happy.lines, moodD: party.happy.moodD, affD: party.happy.affD, scale: party.happy.scale }));
check('attendance remembered: a guest who came is warmer toward them and they toward the guest; the no-show is cooler', near(party.happy.castB, party.P.guestAffection) && near(party.happy.castBback, party.P.guestAffection / 2) && near(party.happy.castNoShow, party.P.absentAffection * party.happy.scale), JSON.stringify({ b: party.happy.castB, back: party.happy.castBback, noshow: party.happy.castNoShow }));
check('...and it is written into their memory (the party, and who never showed)', party.happy.facts.some(t => /birthday party/.test(t)) && party.happy.facts.some(t => /never showed/.test(t)), JSON.stringify(party.happy.facts));
check('the mark says partied, the party says resolved, and a rerun pays nothing twice', party.happy.mark.partied === true && party.happy.resolved === true && party.happy.rerun === 0);
check('the player threw it and never came: a sting (hostAbsentAffection x importance), a "went ahead without you" line, and the memory', near(party.skipped.affD, party.P.hostAbsentAffection * party.skipped.scale) && party.skipped.lines.some(l => /without you/.test(l)) && party.skipped.facts === 1, JSON.stringify(party.skipped));
check('the guest of honor never showed: no party line, no partied mark (so the ordinary forget sting still applies) — but the party still resolves once', party.noHonoree.lines.length === 0 && !party.noHonoree.mark.partied && party.noHonoree.mark.forgot === true && party.noHonoree.resolved === true, JSON.stringify(party.noHonoree));
check('an ordinary party (honoree not a guest) is not a birthday party; a party on the wrong day likewise', party.ordinary.lines.length === 0 && party.ordinary.resolved === false && party.ordinary.partyToday === null && party.wrongDay.lines.length === 0 && party.wrongDay.resolved === false);
check('a party thrown for a known, fond roommate counts as remembering: no forget sting', party.noSting.partied === true && party.noSting.forgot === false, JSON.stringify(party.noSting));
check('a party for two (only the honoree and the player) reads as such', party.forTwo.length === 1 && /just the two of you/.test(party.forTwo[0]), JSON.stringify(party.forTwo));

// ---------------------------------------------------------------- 7
console.log('\n7. Phase 6 — contacts: a text on the day, your wish counts, Del included; no sting, no celebration');
const con = J(`(() => {
  const g = __mk(71, 3); const [a, b, c] = __ids(g);
  // Make b an outside contact (moved out, number known), c a fond outside contact, a a resident.
  const mkContact = (id, aff, status) => { const n = g.npcs[id]; n.residency = { ...n.residency, status: status || 'visitor' }; n.contactKnown = true; __rel(g, id, { affection: aff }); __setBday(g, id, 50); };
  mkContact(b, 0.6); mkContact(c, 0.05);
  g.npcs[a].residency.status = 'former'; g.npcs[a].contactKnown = false; __setBday(g, a, 50);
  const del = g.npcs[CONTRACTOR_ID];
  del.bible.birthday = 50;
  const status = { b: isBirthdayContact(g.npcs[b]), c: isBirthdayContact(g.npcs[c]), a: isBirthdayContact(g.npcs[a]), del: !!del && isBirthdayContact(del) };
  __at(g, 50);
  const fond0 = g.npcs[b].relPlayer.affection, mood0 = g.npcs[b].mood;
  const out = processBirthdaysForDay(g, 50);
  const texts = { b: __threadMsgs(g, b).map(m => m.text), c: __threadMsgs(g, c).length, a: __threadMsgs(g, a).length, del: del ? __threadMsgs(g, CONTRACTOR_ID).map(m => m.text) : [] };
  const marks = g.player.birthdays.marks;
  const known = { b: knowsBirthday(g, b), c: knowsBirthday(g, c), del: knowsBirthday(g, CONTRACTOR_ID) };
  const noCelebrate = !(g.world.events || []).some(e => /birthday_/.test(e.type)) && (!marks[b] || !marks[b].celebrated);
  const moodUnchanged = g.npcs[b].mood === mood0;
  const prompt = birthdayPromptLine(g, b);
  // your wish counts, at a fraction
  const w0 = { aff: g.npcs[b].relPlayer.affection, mood: g.npcs[b].mood };
  const wish = noteBirthdayWish(g, b, 'happy birthday!!', 'text');
  const wishD = { aff: g.npcs[b].relPlayer.affection - w0.aff, mood: g.npcs[b].mood - w0.mood };
  const scale = birthdayImportanceScale(g.npcs[b]);
  // next morning: no sting for a contact, forgotten or not
  const c0 = g.npcs[c].relPlayer.affection;
  __at(g, 51); processBirthdaysForDay(g, 51);
  const rows = knownBirthdayRows((__at(g, 50), g));
  const yr = yearGridModel(g).seasons.flatMap(s => s.cells).find(cell => cell.doy === 50);
  return { status, texts, known, noCelebrate, prompt, wish, wishD, scale, stingC: g.npcs[c].relPlayer.affection - c0, rowIds: rows.map(r => r.id), yrNames: yr.birthdays, C: BIRTHDAY_TUNING.contacts, W: BIRTHDAY_TUNING.wish, b, c, a, delText: texts.del };
})()`);
check('a contact = a non-resident whose number you have; a former resident is not one; Del is one', con.status.b && con.status.c && !con.status.a && con.status.del, JSON.stringify(con.status));
check('a fond contact texts you a line on the day; a cool one (below textAffection) stays quiet; a former resident sends nothing', con.texts.b.length === 1 && /birthday/i.test(con.texts.b[0]) && con.texts.c === 0 && con.texts.a === 0, JSON.stringify(con.texts));
check('Del texts in his own voice regardless of fondness (his welcome text is already in the thread)', con.delText.filter(t => BIRTHDAY_TUNING_CONTRACTOR_OK(t)).length === 1, JSON.stringify(con.delText));
check('the ones who texted are now on your Calendar; the quiet one is not', con.known.b && con.known.del && !con.known.c && con.rowIds.includes(con.b) && !con.rowIds.includes(con.c));
check('the year grid lists a known contact\'s birthday on its day', con.yrNames.length >= 1, JSON.stringify(con.yrNames));
check('no celebration and no day-of mood lift for a contact (that assumes a shared house)', con.noCelebrate);
check('the prompt line reaches a contact too (the date and the day)', /TODAY/.test(con.prompt) && /birthday/.test(con.prompt), con.prompt);
check('your wish to a contact pays at contacts.wishMoodScale of a roommate\'s (affection and mood), with the text beat', !!con.wish && con.wish.kind === 'wished' && near(con.wishD.aff, con.W.affection * con.scale * con.C.wishMoodScale) && near(con.wishD.mood, con.W.mood * con.scale * con.C.wishMoodScale), JSON.stringify({ wishD: con.wishD, scale: con.scale }));
check('forgetting a contact never stings', near(con.stingC, 0), con.stingC);

function BIRTHDAY_TUNING_CONTRACTOR_OK(text) {
  const lines = J('BIRTHDAY_TUNING.contacts.contractorLines');
  return lines.includes(text);
}

// ---------------------------------------------------------------- 8
console.log('\n8. Old saves and the shape of the record');
const old = J(`(() => {
  const g = __mk(81, 2);
  delete g.player.birthdays; delete g.player.birthday;
  const out = processBirthdaysForDay(g, 12);
  const rec = g.player.birthdays;
  const g2 = __mk(82, 2); g2.player.birthdays = { known: {}, marks: {}, everWished: false };   // a Phase-1 record: no told/promptShown
  const r2 = ensurePlayerBirthdays(g2.player);
  return { linesArr: Array.isArray(out.lines), rec: { told: typeof rec.told, prompt: rec.promptShown }, phase1: { told: typeof r2.told, prompt: r2.promptShown }, hasBday: hasPlayerBirthday(g), doy: playerBirthdayDayOfYear(g) };
})()`);
check('a save with no birthday record at all still runs the pass, and the lazy default carries told/promptShown', old.linesArr && old.rec.told === 'object' && old.rec.prompt === false);
check('a Phase-1 record (no told/promptShown) is upgraded in place, never replaced', old.phase1.told === 'object' && old.phase1.prompt === false);
check('...and its derived birthday is stable and valid', old.hasBday === false && old.doy >= 1 && old.doy <= 140);

// ---------------------------------------------------------------- 9
console.log('\n9. Phase 5, end to end — the REAL per-tick party pass records attendance, and the rollover pays it out');
const e2e = J(`(() => {
  const g = __mk(91, 3);
  const [a, b] = __ids(g);
  __setBday(g, a, 10); g.npcs[a].bible.birthdayImportance = 0.5;
  __rel(g, a, { affection: 0.7, tension: 0 }); __rel(g, b, { affection: 0.7, tension: 0 });
  learnBirthday(g, a, 1);
  const startAbs = 10 * 1440 + 1140;
  // Booked through the real path: the honoree proposes (straight into acceptedIds), b is invited.
  const { record } = createCommitment(g, { kind: 'party', startAbs, endAbs: startAbs + 120, roomId: 'living_room', invitedIds: [b], proposerId: a, host: 'player' });
  g.meta.clock.day = 10; g.meta.clock.minutes = 1140; g.meta.clock.weekday = getWeekday(10); g.meta.clock.phase = getPhase(1140);
  g.player.location = 'living_room';
  const guestOfHonor = birthdayPartyHonoree(g, record);
  const prompt = birthdayPromptLine(g, a);
  const result = resolveTick(g);
  const placed = { a: result.npcUpdates[a] && result.npcUpdates[a].location, b: result.npcUpdates[b] && result.npcUpdates[b].location };
  const attended = (record.attended || []).slice();
  const aff0 = g.npcs[a].relPlayer.affection;
  const out = processBirthdaysForDay(g, 11);
  return { guestOfHonor, a, b, prompt, placed, attended, lines: out.lines, resolved: record.birthdayResolved, partied: g.player.birthdays.marks[a] && g.player.birthdays.marks[a].partied, affD: g.npcs[a].relPlayer.affection - aff0 };
})()`);
check('a party booked through createCommitment on their birthday, with them accepted, IS their party (they are the guest of honor)', e2e.guestOfHonor === e2e.a);
check('the [Birthday] prompt line on the day carries the party', /party in their honor/.test(e2e.prompt), e2e.prompt);
check('resolveTick placed the accepted guests in the party room', e2e.placed.a === 'living_room', JSON.stringify(e2e.placed));
check('...and the sim.js party pass wrote the attendance ledger: the honoree, and the player who was in the room', e2e.attended.includes(e2e.a) && e2e.attended.includes('player'), JSON.stringify(e2e.attended));
check('the next rollover pays it out (line, partied mark, host affection up) — end to end', e2e.lines.some(l => /party/.test(l)) && e2e.partied === true && e2e.resolved === true && e2e.affD > 0, JSON.stringify({ lines: e2e.lines, partied: e2e.partied, affD: e2e.affD }));

// ---------------------------------------------------------------- 10
console.log('\n10. A2 — a different kind of present (an OFFER by text, gated like every intimacy act) and A5 — the birthday cake');
const favorSetup = String.raw`
  __favor = (over) => {
    const g = __mk(101, 3); const [a, b] = __ids(g);
    g.player.birthday = 33; __at(g, 33);
    const t = g.npcs[a].bible.temperament || (g.npcs[a].bible.temperament = {});
    Object.assign(t, { openness: 0.9, assertiveness: 0.9 });
    __rel(g, a, { affection: 0.85, desire: 0.6, tension: 0, trust: 0.6 });
    g.npcs[a].mood = 0.5;
    __rel(g, b, { affection: 0.4 });
    BIRTHDAY_TUNING.player.favor.chance = 1;
    if (over) over(g, a, b);
    return { g, a, b };
  };
`;
api(favorSetup);
const fav = J(String.raw`(() => {
  const out = {};
  const F = BIRTHDAY_TUNING.player.favor;
  { const { g, a, b } = __favor();
    const inv0 = __invCount(g); const desire0 = g.npcs[a].relPlayer.desire;
    out.willing = isWilling(g, g.npcs[a], 'player', F.act, { npcId: a });
    const res = processBirthdaysForDay(g, 33);
    const texts = __threadMsgs(g, a).map(m => m.text);
    out.ok = { a, favor: g.player.birthdays.self.favor, gift: g.player.birthdays.self.gift, texts, lines: res.lines,
      greetedIsFavorPool: F.lines.default.includes(texts[texts.length - 1]) || Object.values(F.lines).some(p => p.includes(texts[texts.length - 1])),
      desireD: g.npcs[a].relPlayer.desire - desire0, prompt: birthdayPromptLine(g, a), inv: __invCount(g) - inv0 };
  }
  { const { g, a } = __favor(); BIRTHDAY_TUNING.player.favor.chance = 0;
    processBirthdaysForDay(g, 33); out.noChance = { favor: g.player.birthdays.self.favor || null }; BIRTHDAY_TUNING.player.favor.chance = 1; }
  { const { g, a } = __favor((g, a) => { g.npcs[a].bible.temperament.openness = -0.8; g.npcs[a].bible.temperament.assertiveness = 0.2; });
    processBirthdaysForDay(g, 33); out.prude = { dev: npcDeviancy(g.npcs[a]), favor: g.player.birthdays.self.favor || null }; }
  { const { g, a } = __favor((g, a) => { __rel(g, a, { desire: 0.0 }); });
    processBirthdaysForDay(g, 33); out.noDesire = { favor: g.player.birthdays.self.favor || null }; }
  { const { g, a } = __favor((g, a) => { __rel(g, a, { affection: 0.45 }); });
    processBirthdaysForDay(g, 33); out.notFondEnough = { favor: g.player.birthdays.self.favor || null }; }
  { const { g, a } = __favor((g, a) => { g.npcs[a].relPlayer.desire = -0.6; });
    processBirthdaysForDay(g, 33); out.unwilling = { favor: g.player.birthdays.self.favor || null }; }
  { const { g, a } = __favor();
    globalThis.isSfwMode = () => true;
    processBirthdaysForDay(g, 33); out.sfw = { favor: g.player.birthdays.self.favor || null, lines: g.player.birthdays.self.gift };
    delete globalThis.isSfwMode; }
  { const { g, a, b } = __favor();
    processBirthdaysForDay(g, 33);
    out.instead = { giftFrom: g.player.birthdays.self.gift && g.player.birthdays.self.gift.from, a, b, favorFrom: g.player.birthdays.self.favor && g.player.birthdays.self.favor.from }; }
  return out;
})()`);
check('the qualifying NPC (fond, drawn to you, open, willing by the intimacy gate) makes the offer', fav.willing === true && fav.ok.favor && fav.ok.favor.from === fav.ok.a, JSON.stringify({ willing: fav.willing, favor: fav.ok.favor }));
check('...as a TEXT in their voice from the favor pool, plus a log line pointing you at your messages', fav.ok.greetedIsFavorPool && fav.ok.lines.some(l => /different kind of present/.test(l)), JSON.stringify({ t: fav.ok.texts, l: fav.ok.lines }));
check('...it warms things a little (desire nudge) — and it is an offer: no act, no state beyond that', near(fav.ok.desireD, J('BIRTHDAY_TUNING.player.favor.desireNudge')), fav.ok.desireD);
check('...and the offer stands IN PLACE of an object: that NPC left no physical present (someone else may)', !fav.ok.gift || fav.ok.gift.from !== fav.ok.a);
check('the prompt line tells the writer to play it flirtatious but never assume anything happens', /private present/.test(fav.ok.prompt) && /never assume/.test(fav.ok.prompt), fav.ok.prompt);
check('"sometimes": a chance of 0 means never', fav.noChance.favor === null);
check('a prude (openness x assertiveness below the deviancy bar) never offers', fav.prude.dev < 0.4 && fav.prude.favor === null, JSON.stringify(fav.prude));
check('no desire toward you → no offer; not fond enough → no offer', fav.noDesire.favor === null && fav.notFondEnough.favor === null);
check('someone the willingness gate would refuse never offers (negative desire crushes it)', fav.unwilling.favor === null);
check('SFW mode: never — the offer is skipped entirely', fav.sfw.favor === null);

const cake = J(String.raw`(() => {
  const setup = (bday) => {
    const g = __mk(102, 2); const [a] = __ids(g);
    g.npcs[a].location = 'living_room'; g.player.location = 'living_room';
    g.npcs[a].bible.interests = []; g.npcs[a].bible.want = ''; g.npcs[a].bible.wound = '';
    __setBday(g, a, bday); __at(g, 60); __rel(g, a, { affection: 0.1 });
    g.player.inventory = [...(g.player.inventory || []), { defId: 'birthday_cake', qty: 1 }, { defId: 'chocolate_box', qty: 1 },
      { defId: 'cooked_meal', qty: 1, meta: { plate: { recipeKey: 'birthday_cake', label: 'Birthday Cake', kcalPerServing: 400, servings: { total: 6, left: 6 }, quality: 0.6, grade: 'B', components: [], method: 'bake', cookware: 'oven', preparedAbs: 0, wasReheated: false } } }];
    return { g, a };
  };
  const one = (defId, bday) => { const s = setup(bday); const before = s.g.npcs[s.a].relPlayer.affection; const t = resolveAsk(s.g, s.a, 'RequestGift', 'Here.', {}, { giftDefId: defId }); t.applyEffects(); return { d: t.decision, delta: s.g.npcs[s.a].relPlayer.affection - before, note: JSON.stringify(t.directive || {}) }; };
  return { cakeItem: one('birthday_cake', 60), plate: one('cooked_meal', 60), choc: one('chocolate_box', 60), cakeOff: one('birthday_cake', 99),
    recipe: (() => { const r = RECIPES.birthday_cake; return r && { ok: r.ingredients.every(i => !!ITEM_DEFS[i.defId]), servings: r.servings, method: r.method, cookware: r.cookware }; })(),
    ordered: RESTAURANT_DEFS_LIST.filter(r => r.menu.some(m => m.itemId === 'birthday_cake')).map(r => r.id),
    lines: { cake: birthdayGiftEffectLines(setup(60).g, setup(60).a, true), plain: birthdayGiftEffectLines(setup(60).g, setup(60).a, false) },
    B: BIRTHDAY_TUNING };
})()`);
check('a cake is flagged on the decision only on a birthday (giftCake), and a plain present is not', cake.cakeItem.d.giftCake === true && cake.plate.d.giftCake === true && !cake.choc.d.giftCake && !cake.cakeOff.d.giftCake, JSON.stringify({ c: cake.cakeItem.d, p: cake.plate.d, ch: cake.choc.d }));
check('a birthday cake earns exactly cakeBonus more than an ordinary birthday present (both the ordered item and a home-baked plate)', near(cake.cakeItem.delta - cake.choc.delta, cake.B.player.cakeBonus) && near(cake.plate.delta - cake.choc.delta, cake.B.player.cakeBonus), JSON.stringify({ cake: cake.cakeItem.delta, plate: cake.plate.delta, choc: cake.choc.delta }));
check('...the writer is told the cake is the classic gesture', /birthday cake/.test(cake.cakeItem.note));
check('off their birthday it is just a gift (no birthday bonus)', cake.cakeOff.d.birthday !== true);
check('you can BAKE one: a real recipe (valid ingredients, six servings, baked, in the oven)', !!cake.recipe && cake.recipe.ok && cake.recipe.servings === 6 && cake.recipe.method === 'bake' && cake.recipe.cookware === 'oven', JSON.stringify(cake.recipe));
check('you can ORDER one: the café and the upscale kitchen list it', cake.ordered.includes('sunrise_cafe') && cake.ordered.includes('emerald_kitchen'), JSON.stringify(cake.ordered));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
