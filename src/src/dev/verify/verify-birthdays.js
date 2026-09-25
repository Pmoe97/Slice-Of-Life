// Birthdays & Occasions plan (birthdays-and-occasions-plan.md) — Phase 1:
// roommate birthdays (D1–D12).
//
//   node src/src/dev/verify/verify-birthdays.js
//
// Node coverage for everything pure/trusted-producer in birthdays.js and its
// four hook sites: registration (tuning, the Calendar screen, both script
// lists); D1 derivation (range, stability, override, spread); the calendar
// arithmetic across a year boundary; D3 learning by mentioning birthdays;
// D6 the wish (once, the exact deltas, the memory, spoken vs text beat);
// D4/D5/D7 the day-rollover pass (tip-off text from a fond housemate, the
// birthday roommate fishing, a shy one staying quiet, the day-of line and
// mood, the forget sting and every case it must NOT fire in, idempotence);
// D8 a birthday gift through the REAL ask_gift pipeline (bonus on top of
// the match delta, once, and a non-birthday decision keeping its exact old
// shape); D9 the prompt line reaching the real IM prompt; D10 the Calendar
// rows. The conversation/IM hook sites themselves (doConvSend in ui.js,
// resolveImReply's LLM call) are not node-loadable — verified on the live
// page instead (see the plan's Handoff).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.computer.js', 'sim.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'computer.js', 'npc.js', 'llm.js', 'birthdays.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260922, n || 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    // Park every resident's birthday far from the days the sections use, so
    // a derived birthday can never collide with a test's own (each section
    // pins the ones it cares about with __setBday).
    for (const id of Object.keys(g.npcs)) g.npcs[id].bible.birthday = 120;
    // SIM_generateHouse leaves bible.name empty (names arrive with the
    // character pass), which would make every "names them" check vacuous —
    // includes('') is always true. Give each one a real, distinct name.
    Object.keys(g.npcs).sort().forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar', 'Priya'][i] || ('Roomie' + i); });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  // Pin a birthday (the bible override, D1) and put the clock on a given day.
  __setBday = (g, id, doy) => { g.npcs[id].bible.birthday = doy; };
  __at = (g, day) => { g.meta.clock.day = day; return g; };
  __rel = (g, id, fields) => { g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, ...fields }; };
  __cast = (g, from, to, affection) => {
    const key = [from, to].sort().join('|');
    const web = g.world.castWeb || (g.world.castWeb = {});
    if (!web[key]) web[key] = createBlankPair(from, to);
    web[key].axes[from + '→' + to] = { ...(web[key].axes[from + '→' + to] || {}), affection };
  };
  // Zero every pair so a test's tipster is exactly the one it set up.
  __coldCast = (g) => {
    for (const pair of Object.values(g.world.castWeb || {})) {
      for (const k of Object.keys(pair.axes || {})) pair.axes[k] = { ...pair.axes[k], affection: 0 };
    }
  };
  __threadMsgs = (g, id) => ((g.world.computer.apps.im.threads[id] || {}).msgs || []).filter(m => m.from === 'npc');
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning, the Calendar tab, both script lists');
const reg = J(`({
  tuning: typeof BIRTHDAY_TUNING === 'object' && BIRTHDAY_TUNING !== null,
  fns: ['npcBirthdayDayOfYear','processBirthdaysForDay','noteBirthdayWish','noteBirthdayGift','birthdayPromptLine','knownBirthdayRows','ensurePlayerBirthdays'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  screen: APP_DEFS.calendar.screens.birthdays ? { source: APP_DEFS.calendar.screens.birthdays.source, renderer: APP_DEFS.calendar.screens.birthdays.renderer, hasLabel: typeof APP_DEFS.calendar.screens.birthdays.labelFn === 'function' } : null,
  upcomingUntouched: APP_DEFS.calendar.entryScreen === 'upcoming' && APP_DEFS.calendar.screens.upcoming.source === 'commitments',
  styles: TEXTING_STYLES.every(s => BIRTHDAY_TUNING.tipOffLines[s] && BIRTHDAY_TUNING.fishLines[s]),
})`);
check('BIRTHDAY_TUNING exists (config.js, not inline magic)', reg.tuning);
check('every public birthdays.js function is defined', reg.fns);
check('the Calendar gained a Birthdays list tab over the birthdays source', !!reg.screen && reg.screen.source === 'birthdays' && reg.screen.renderer === 'list' && reg.screen.hasLabel, JSON.stringify(reg.screen));
check('the Calendar still opens on Upcoming over commitments (untouched)', reg.upcomingUntouched);
check('every TEXTING_STYLES entry has its own tip-off AND fishing lines', reg.styles);
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
const tags = indexHtml.match(/<script src="src\/src\/srcfiles\/birthdays\.js\?v=\d+"><\/script>/g) || [];
check('index.html loads birthdays.js exactly once', tags.length === 1, `found ${tags.length}`);
check('...after pregnancy.js and before render.js/ui.js (runtime-only deps, both list positions match)',
  indexHtml.indexOf('srcfiles/pregnancy.js') < indexHtml.indexOf('srcfiles/birthdays.js')
  && indexHtml.indexOf('srcfiles/birthdays.js') < indexHtml.indexOf('srcfiles/render.js?')
  && indexHtml.indexOf('srcfiles/birthdays.js') < indexHtml.indexOf('srcfiles/ui.js?'));
const loaderSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check('loadgame.js ORDER registers birthdays.js right after pregnancy.js', /'pregnancy\.js',[\s\S]{0,600}?'birthdays\.js'/.test(loaderSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. D1 — derived birthdays: in range, stable, overridable, and spread across the year');
const der = J(`(() => {
  const all = [];
  let stable = true;
  const warn = console.warn; console.warn = () => {};
  for (let s = 1; s <= 40; s++) {
    const g = __mk(20260900 + s, 4);
    for (const id of Object.keys(g.npcs)) {
      const npc = g.npcs[id];
      delete npc.bible.birthday;   // measure the DERIVED value, not __mk's parking
      const a = npcBirthdayDayOfYear(npc);
      const b = npcBirthdayDayOfYear(JSON.parse(JSON.stringify(npc)));
      if (a !== b) stable = false;
      all.push(a);
    }
  }
  console.warn = warn;
  const g = __mk(1, 1);
  const id = __ids(g)[0];
  const npc = g.npcs[id];
  delete npc.bible.birthday;
  const derived = npcBirthdayDayOfYear(npc);
  npc.bible.birthday = 77;
  const overridden = npcBirthdayDayOfYear(npc);
  npc.bible.birthday = 999;
  const outOfRange = npcBirthdayDayOfYear(npc);
  npc.bible.birthday = 12.5;
  const fractional = npcBirthdayDayOfYear(npc);
  return {
    n: all.length, min: Math.min(...all), max: Math.max(...all), stable,
    distinct: new Set(all).size,
    seasons: [0,1,2,3].map(si => all.filter(d => Math.floor((d - 1) / 35) === si).length),
    derived, overridden, outOfRange, fractional,
  };
})()`);
check('every birthday is a real day of the 140-day year', der.min >= 1 && der.max <= 140, `min ${der.min} max ${der.max} over ${der.n}`);
check('the same NPC always gets the same birthday (and a save round trip keeps it)', der.stable);
check('birthdays genuinely vary — not a handful of days', der.distinct >= 60, `${der.distinct} distinct over ${der.n} NPCs`);
check('every season holds birthdays', der.seasons.every(c => c > 0), JSON.stringify(der.seasons));
check('an integer bible.birthday override wins', der.overridden === 77);
check('an out-of-range or non-integer override is ignored (falls back to derived)', der.outOfRange === der.derived && der.fractional === der.derived);

// ---------------------------------------------------------------- 2
console.log('\n2. Calendar arithmetic — formatting, days-until, and the year boundary');
const cal = J(`(() => {
  const g = __mk(2, 1); const id = __ids(g)[0]; const npc = g.npcs[id];
  npc.bible.birthday = 5;
  return {
    f1: formatBirthday(1), f35: formatBirthday(35), f36: formatBirthday(36), f140: formatBirthday(140), f14s: formatBirthday(49),
    onDay5: isBirthdayOn(npc, 5), onDay145: isBirthdayOn(npc, 145), onDay6: isBirthdayOn(npc, 6),
    until5: daysUntilBirthday(npc, 5), until3: daysUntilBirthday(npc, 3), until6: daysUntilBirthday(npc, 6), until140: daysUntilBirthday(npc, 140),
  };
})()`);
check('formatBirthday speaks the calendar\'s own wording', cal.f1 === '1st of Spring' && cal.f35 === '35th of Spring' && cal.f36 === '1st of Summer' && cal.f140 === '35th of Winter' && cal.f14s === '14th of Summer', JSON.stringify(cal));
check('a birthday recurs every year (day 5 and day 145), and only on its day', cal.onDay5 && cal.onDay145 && !cal.onDay6);
check('days-until: 0 on the day, 2 two days out, 139 the day after, 5 across the year boundary', cal.until5 === 0 && cal.until3 === 2 && cal.until6 === 139 && cal.until140 === 5, JSON.stringify(cal));

// ---------------------------------------------------------------- 3
console.log('\n3. D3 — mentioning birthdays is how you find out when theirs is');
const learn = J(`(() => {
  const g = __mk(3, 2); const id = __ids(g)[0];
  __setBday(g, id, 40); __at(g, 10);
  const relBefore = JSON.stringify(g.npcs[id].relPlayer);
  const plain = noteBirthdayWish(g, id, 'how was your day?', 'spoken');
  const knownAfterPlain = knowsBirthday(g, id);
  const ask = noteBirthdayWish(g, id, "When's your birthday, anyway?", 'spoken');
  const again = noteBirthdayWish(g, id, 'birthday plans?', 'spoken');
  return { plain, knownAfterPlain, ask, again, known: knowsBirthday(g, id), relUnchanged: JSON.stringify(g.npcs[id].relPlayer) === relBefore, marks: g.player.birthdays.marks, date: formatBirthday(40), name: g.npcs[id].bible.name };
})()`);
check('an unrelated line teaches nothing', learn.plain === null && learn.knownAfterPlain === false);
check('asking about their birthday adds it to what you know, with a Calendar beat naming the real date', !!learn.ask && learn.ask.kind === 'learned' && learn.ask.beat.includes(learn.date) && learn.ask.beat.includes(learn.name) && learn.date === '5th of Summer' && learn.known === true, JSON.stringify(learn.ask));
check('learning it twice is silent', learn.again === null);
check('learning moves no relationship axis and writes no birthday mark (not a wish)', learn.relUnchanged && Object.keys(learn.marks).length === 0);

// ---------------------------------------------------------------- 4
console.log('\n4. D6 — the wish: once per birthday, exact deltas, a memory, and the right beat');
const wish = J(`(() => {
  const g = __mk(4, 2); const id = __ids(g)[0];
  __setBday(g, id, 12); __at(g, 12);
  __rel(g, id, { affection: 0.2, trust: 0.1, tension: 0 });
  g.npcs[id].mood = 0;
  const factsBefore = g.npcs[id].memory.facts.length;
  const impulsesBefore = (g.player.moodEvents || []).length;
  const miss = noteBirthdayWish(g, id, 'nice weather today', 'spoken');
  const first = noteBirthdayWish(g, id, 'Happy birthday!!', 'spoken');
  const impulses = (g.player.moodEvents || []).length - impulsesBefore;
  const after = { ...g.npcs[id].relPlayer, mood: g.npcs[id].mood };
  const facts = g.npcs[id].memory.facts.slice(factsBefore);
  const second = noteBirthdayWish(g, id, 'seriously, happy birthday', 'spoken');
  const afterSecond = { ...g.npcs[id].relPlayer, mood: g.npcs[id].mood };
  // Another roommate, same day, by text: the text beat.
  const other = __ids(g)[1]; __setBday(g, other, 12);
  const byText = noteBirthdayWish(g, other, 'hbd 🎉', 'text');
  return { miss, first, after, facts, second, afterSecond, impulses,
    mark: g.player.birthdays.marks[id], everWished: g.player.birthdays.everWished, byText, W: BIRTHDAY_TUNING.wish };
})()`);
const near = (a, b) => Math.abs(a - b) < 1e-9;
check('a line that doesn\'t mention it is not a wish', wish.miss === null);
check('"Happy birthday!!" is the wish, with the spoken beat', !!wish.first && wish.first.kind === 'wished' && /lights up/.test(wish.first.beat), JSON.stringify(wish.first));
check('the wish moves affection/trust/mood by exactly BIRTHDAY_TUNING.wish', near(wish.after.affection, 0.2 + wish.W.affection) && near(wish.after.trust, 0.1 + wish.W.trust) && near(wish.after.mood, wish.W.mood), JSON.stringify(wish.after));
check('the wish writes one relationship memory, not pinned (importance < significant)', wish.facts.length === 1 && wish.facts[0].category === 'relationship' && /remembered/.test(wish.facts[0].text) && wish.facts[0].pinned === false, JSON.stringify(wish.facts));
check('the player gets one small mood impulse for it', wish.impulses === 1);
check('a second wish the same day is silent and pays nothing', wish.second === null && JSON.stringify(wish.after) === JSON.stringify(wish.afterSecond));
check('the mark records the wish, the channel, and the year', wish.mark.wished === true && wish.mark.via === 'spoken' && wish.mark.year === 1 && wish.everWished === true, JSON.stringify(wish.mark));
check('"hbd" by text counts, with the text-channel beat', !!wish.byText && wish.byText.kind === 'wished' && /glad you remembered/.test(wish.byText.beat));

// ---------------------------------------------------------------- 5
console.log('\n5. D4 — the heads-up: a fond housemate tips you off, else the birthday roommate fishes, else silence');
const heads = J(`(() => {
  // 5a — tipster.
  const g = __mk(5, 3); const [a, b, c] = __ids(g);
  __coldCast(g);
  for (const id of [a, b, c]) __rel(g, id, { affection: 0 });
  __setBday(g, a, 20); __at(g, 18);
  __cast(g, b, a, 0.6); __rel(g, b, { affection: 0.3 });
  const threadBefore = __threadMsgs(g, b).length;
  const out1 = processBirthdaysForDay(g, 18);
  const threadAfter = __threadMsgs(g, b);
  const out2 = processBirthdaysForDay(g, 18);
  const tip = { texts: out1.texts, lines: out1.lines, newMsgs: threadAfter.length - threadBefore, lastMsg: threadAfter[threadAfter.length - 1], known: knowsBirthday(g, a), headsUp: g.player.birthdays.marks[a].headsUp, rerunTexts: out2.texts.length };
  // 5b — no tipster; the birthday roommate is fond of you and not shy.
  const g2 = __mk(6, 3); const [a2, b2, c2] = __ids(g2);
  __coldCast(g2);
  for (const id of [a2, b2, c2]) __rel(g2, id, { affection: 0 });
  __setBday(g2, a2, 30); __at(g2, 28);
  __rel(g2, a2, { affection: 0.5 }); g2.npcs[a2].bible.temperament.assertiveness = 0.4;
  const fish = processBirthdaysForDay(g2, 28);
  // 5c — same, but shy: nobody says anything.
  const g3 = __mk(6, 3); const [a3, b3, c3] = __ids(g3);
  __coldCast(g3);
  for (const id of [a3, b3, c3]) __rel(g3, id, { affection: 0 });
  __setBday(g3, a3, 30); __at(g3, 28);
  __rel(g3, a3, { affection: 0.5 }); g3.npcs[a3].bible.temperament.assertiveness = -0.4;
  const shy = processBirthdaysForDay(g3, 28);
  // 5d — a housemate fond of the birthday roommate but cold to YOU doesn't tip you off.
  const g4 = __mk(5, 3); const [a4, b4, c4] = __ids(g4);
  __coldCast(g4);
  for (const id of [a4, b4, c4]) __rel(g4, id, { affection: 0 });
  __setBday(g4, a4, 20); __at(g4, 18);
  __cast(g4, b4, a4, 0.6); __rel(g4, b4, { affection: -0.2 });
  const cold = processBirthdaysForDay(g4, 18);
  return { a, b, tip, a2, fish: fish.texts, fishKnown: knowsBirthday(g2, a2), shy: shy.texts, shyKnown: knowsBirthday(g3, a3), cold: cold.texts, nameA: g.npcs[a].bible.name, weekday: WEEKDAY_NAMES[getWeekday(20)] };
})()`);
check('a fond housemate texts the player two days out', heads.tip.texts.length === 1 && heads.tip.texts[0].npcId === heads.b && heads.tip.texts[0].aboutId === heads.a, JSON.stringify(heads.tip.texts));
check('...and the text really lands in that housemate\'s IM thread, naming the birthday roommate and the weekday', heads.tip.newMsgs === 1 && heads.tip.lastMsg.text.includes(heads.nameA) && heads.tip.lastMsg.text.includes(heads.weekday), JSON.stringify(heads.tip.lastMsg));
check('the heads-up teaches the player the birthday (it\'s on the Calendar now)', heads.tip.known === true && heads.tip.headsUp === true);
check('the heads-up day has no narration of its own (it\'s a text, not a log line)', heads.tip.lines.length === 0, JSON.stringify(heads.tip.lines));
check('re-running the same day never sends a second heads-up', heads.tip.rerunTexts === 0);
check('with no tipster, a fond, not-shy birthday roommate drops the hint themselves', heads.fish.length === 1 && heads.fish[0].npcId === heads.a2 && heads.fish[0].aboutId === heads.a2 && heads.fishKnown === true, JSON.stringify(heads.fish));
check('a shy one stays quiet, and the player doesn\'t learn it early', heads.shy.length === 0 && heads.shyKnown === false);
check('a housemate who is cold to the player doesn\'t tip them off', heads.cold.length === 0);

// ---------------------------------------------------------------- 6
console.log('\n6. D5/D7 — the day itself, and the next morning');
const day = J(`(() => {
  const mk = (aff) => {
    const g = __mk(7, 2); const [a] = __ids(g);
    __coldCast(g);
    __setBday(g, a, 50); __at(g, 50);
    __rel(g, a, { affection: aff, tension: 0, lastInteractionDay: 44 });
    g.npcs[a].mood = 0;
    return { g, a };
  };
  // Forgot: fond, knew (the day-of pass told them), never said a word.
  const f = mk(0.5);
  const dayOf = processBirthdaysForDay(f.g, 50);
  const moodOnDay = f.g.npcs[f.a].mood;
  const knownOnDay = knowsBirthday(f.g, f.a);
  const factsBefore = f.g.npcs[f.a].memory.facts.length;
  const next = processBirthdaysForDay(__at(f.g, 51), 51);
  const relAfter = f.g.npcs[f.a].relPlayer;
  const forgotFacts = f.g.npcs[f.a].memory.facts.slice(factsBefore);
  const moodAfter = f.g.npcs[f.a].mood;
  const rerun = processBirthdaysForDay(f.g, 51);
  const relAfterRerun = f.g.npcs[f.a].relPlayer;
  const promptAfter = birthdayPromptLine(f.g, f.a);
  // Remembered: same, but wished on the day.
  const r = mk(0.5);
  processBirthdaysForDay(r.g, 50);
  noteBirthdayWish(r.g, r.a, 'happy birthday', 'spoken');
  const affR = r.g.npcs[r.a].relPlayer.affection;
  const nextR = processBirthdaysForDay(__at(r.g, 51), 51);
  // Not fond: no expectation, no sting.
  const n = mk(0.1);
  processBirthdaysForDay(n.g, 50);
  const nextN = processBirthdaysForDay(__at(n.g, 51), 51);
  // Never knew: the day-of pass never ran for them (moved in overnight, say).
  const u = mk(0.5);
  const nextU = processBirthdaysForDay(__at(u.g, 51), 51);
  // Second birthday ever: no hint once the player has wished anyone.
  const h = mk(0.5);
  h.g.player.birthdays = { known: {}, marks: {}, everWished: true };
  const dayOfNoHint = processBirthdaysForDay(h.g, 50);
  return {
    name: f.g.npcs[f.a].bible.name, dayOf: dayOf.lines, moodOnDay, knownOnDay,
    next: next.lines, relAfter, forgotFacts, moodAfter, rerun: rerun.lines, relAfterRerun, promptAfter,
    mark: f.g.player.birthdays.marks[f.a],
    nextR: nextR.lines, affR, affRAfter: r.g.npcs[r.a].relPlayer.affection,
    nextN: nextN.lines, nextU: nextU.lines, dayOfNoHint: dayOfNoHint.lines,
    T: { dayOfMood: BIRTHDAY_TUNING.dayOfMood, forgot: BIRTHDAY_TUNING.forgot },
  };
})()`);
check('the morning of: one narration line naming them, with the first-time hint', day.dayOf.length === 1 && day.dayOf[0].includes(day.name) && /birthday today/.test(day.dayOf[0]) && /happy birthday/i.test(day.dayOf[0]), JSON.stringify(day.dayOf));
check('...their mood lifts by dayOfMood, and the player now knows', near(day.moodOnDay, day.T.dayOfMood) && day.knownOnDay === true);
check('once the player has ever remembered a birthday, the hint drops off', day.dayOfNoHint.length === 1 && !/Say happy birthday/.test(day.dayOfNoHint[0]), JSON.stringify(day.dayOfNoHint));
check('forgot a fond roommate\'s birthday: the next morning says so', day.next.length === 1 && day.next[0].includes(day.name) && /without a word/.test(day.next[0]), JSON.stringify(day.next));
check('...affection -0.05, tension +0.04, mood -0.10 (from the day-of lift), exactly', near(day.relAfter.affection, 0.5 + day.T.forgot.affection) && near(day.relAfter.tension, day.T.forgot.tension) && near(day.moodAfter, day.T.dayOfMood + day.T.forgot.mood), JSON.stringify({ rel: day.relAfter, mood: day.moodAfter }));
check('...a midnight sting is not an interaction (lastInteractionDay untouched)', day.relAfter.lastInteractionDay === 44, day.relAfter.lastInteractionDay);
check('...one relationship memory, dated the birthday, importance below pinned', day.forgotFacts.length === 1 && day.forgotFacts[0].category === 'relationship' && day.forgotFacts[0].day === 50 && day.forgotFacts[0].pinned === false, JSON.stringify(day.forgotFacts));
check('...the mark says forgot + resolved, and the rerun never stings twice', day.mark.forgot === true && day.mark.resolved === true && day.rerun.length === 0 && JSON.stringify(day.relAfter) === JSON.stringify(day.relAfterRerun));
check('...and the next day\'s prompt line carries the hurt', /never said a word/.test(day.promptAfter || ''), day.promptAfter);
check('remembered: no sting the next morning, the wish\'s gain stands', day.nextR.length === 0 && near(day.affRAfter, day.affR));
check('a roommate not fond enough to expect it is not hurt', day.nextN.length === 0);
check('a birthday the player never had a way to know about never stings', day.nextU.length === 0);

// ---------------------------------------------------------------- 7
console.log('\n7. D8 — a birthday gift through the real ask_gift pipeline');
const gift = J(`(() => {
  const setup = (bday) => {
    const g = __mk(8, 2); const [a] = __ids(g);
    g.npcs[a].location = 'living_room'; g.player.location = 'living_room';
    g.npcs[a].bible.interests = [{ name: 'chocolates', tags: [] }];
    g.npcs[a].bible.want = ''; g.npcs[a].bible.wound = '';
    __setBday(g, a, bday); __at(g, 60);
    __rel(g, a, { affection: 0.1 });
    g.player.inventory = [...(g.player.inventory || []), { defId: 'chocolate_box', qty: 2 }];
    return { g, a };
  };
  const b = setup(60);
  const before = b.g.npcs[b.a].relPlayer.affection;
  const t1 = resolveAsk(b.g, b.a, 'RequestGift', 'You hand them the box.', {}, { giftDefId: 'chocolate_box' });
  t1.applyEffects();
  const after1 = b.g.npcs[b.a].relPlayer.affection;
  const facts1 = b.g.npcs[b.a].memory.facts.map(f => f.text);
  const t2 = resolveAsk(b.g, b.a, 'RequestGift', 'Another one.', {}, { giftDefId: 'chocolate_box' });
  t2.applyEffects();
  const after2 = b.g.npcs[b.a].relPlayer.affection;
  const o = setup(90);
  const t3 = resolveAsk(o.g, o.a, 'RequestGift', 'Here.', {}, { giftDefId: 'chocolate_box' });
  return {
    d1: t1.decision, beat1: t1.decision.birthdayBeat || null, delta1: after1 - before,
    birthdayFact: facts1.some(t => /for their birthday/.test(t)), note1: t1.directive && JSON.stringify(t1.directive).includes('birthday'),
    d2birthday: !!t2.decision.birthday, delta2: after2 - after1,
    mark: b.g.player.birthdays.marks[b.a],
    d3keys: Object.keys(t3.decision).sort(),
    matchDelta: ASK_TUNING.gift.relDeltas.interest, bonus: BIRTHDAY_TUNING.giftBonus.affection,
  };
})()`);
check('a present on their birthday is flagged a birthday gift', gift.d1.accept === true && gift.d1.birthday === true && gift.d1.giftMatch === 'interest', JSON.stringify(gift.d1));
check('affection moves by the match delta PLUS the birthday bonus', near(gift.delta1, gift.matchDelta + gift.bonus), `${gift.delta1} vs ${gift.matchDelta}+${gift.bonus}`);
check('the memory says it was for their birthday', gift.birthdayFact);
check('postEffects stamped the gift beat and the mark', !!gift.beat1 && /birthday present/.test(gift.beat1) && gift.mark.gifted === true, JSON.stringify({ beat: gift.beat1, mark: gift.mark }));
check('the writer is told it\'s a birthday present (leafNote)', gift.note1 === true);
check('a second present the same day is an ordinary gift — no second bonus', gift.d2birthday === false && near(gift.delta2, gift.matchDelta), `${gift.delta2}`);
check('a non-birthday gift decision keeps its exact pre-birthdays shape', JSON.stringify(gift.d3keys) === JSON.stringify(['accept', 'giftLabel', 'giftMatch', 'reason']), JSON.stringify(gift.d3keys));

// ---------------------------------------------------------------- 8
console.log('\n8. D9 — the prompt line, and that it reaches the real IM prompt');
const pr = J(`(() => {
  const g = __mk(9, 2); const [a] = __ids(g);
  __setBday(g, a, 70);
  const ordinary = birthdayPromptLine(__at(g, 10), a);
  const soon = birthdayPromptLine(__at(g, 68), a);
  const tomorrow = birthdayPromptLine(__at(g, 69), a);
  const todayUnwished = birthdayPromptLine(__at(g, 70), a);
  noteBirthdayWish(g, a, 'happy birthday', 'text');
  const todayWished = birthdayPromptLine(g, a);
  const imPrompt = buildImPrompt(assembleImContext(g, a), 'hey');
  g.npcs[a].residency.status = 'former';
  const former = birthdayPromptLine(g, a);
  return { ordinary, soon, tomorrow, todayUnwished, todayWished, imHasLine: imPrompt.includes('[Birthday]: TODAY'), former, date: formatBirthday(70) };
})()`);
check('an ordinary day carries just the real date', pr.ordinary === `[Birthday]: ${pr.date}.`, pr.ordinary);
check('two days out it\'s "coming up" and on their mind', /in 2 days/.test(pr.soon) && /on their mind/.test(pr.soon), pr.soon);
check('the day before says tomorrow', /tomorrow/.test(pr.tomorrow), pr.tomorrow);
check('on the day, unwished: TODAY, and they\'ve noticed you haven\'t said anything', /TODAY/.test(pr.todayUnwished) && /hasn't mentioned it/.test(pr.todayUnwished), pr.todayUnwished);
check('on the day, wished: the line flips to "already wished"', /already wished/.test(pr.todayWished), pr.todayWished);
check('the line reaches the real IM prompt (buildNpcBlockV2)', pr.imHasLine);
check('a former resident gets no line (residents only, D2)', pr.former === null);

// ---------------------------------------------------------------- 9
console.log('\n9. D10 — the Calendar rows, and an old save with no birthdays record');
const rows = J(`(() => {
  const g = __mk(10, 3); const [a, b, c] = __ids(g);
  __setBday(g, a, 30); __setBday(g, b, 12); __setBday(g, c, 90);
  __at(g, 12);
  learnBirthday(g, a, 1); learnBirthday(g, b, 1);
  const r1 = knownBirthdayRows(g);
  noteBirthdayWish(g, b, 'happy birthday!', 'spoken');
  const r2 = knownBirthdayRows(g);
  g.npcs[a].residency.status = 'former';
  const r3 = knownBirthdayRows(g);
  const old = __mk(11, 2);
  delete old.player.birthdays;
  const oldRows = knownBirthdayRows(old);
  const oldPass = processBirthdaysForDay(old, 12);
  return { r1, r2, r3, labels: r2.map(birthdayRowLabel), unknownListed: r1.some(r => r.id === c), oldRows, oldPass, oldRec: old.player.birthdays, b };
})()`);
check('only known birthdays are listed (the unknown one isn\'t)', rows.r1.length === 2 && !rows.unknownListed);
check('soonest first — today\'s birthday on top', rows.r1[0].id === rows.b && rows.r1[0].daysUntil === 0 && rows.r1[1].daysUntil === 18, JSON.stringify(rows.r1));
check('the label says today!, and once remembered, says so', /today!/.test(rows.labels[0]) && /you remembered/.test(rows.labels[0]) && /in 18 days/.test(rows.labels[1]), JSON.stringify(rows.labels));
check('a former resident drops off the list', rows.r3.length === 1 && rows.r3[0].id === rows.b);
check('an old save with no player.birthdays reads as empty and the pass lazily creates it', rows.oldRows.length === 0 && Array.isArray(rows.oldPass.lines) && rows.oldRec && typeof rows.oldRec.known === 'object' && typeof rows.oldRec.marks === 'object');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
