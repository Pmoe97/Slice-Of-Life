// House Notes follow-ups F2 (the fridge as the house's calendar, and "wait for me") and F4 (the
// fridge in the conversation prompt), 0.14.5.
//
//   node src/src/dev/verify/verify-house-notes-f2.js
//
// The four new motives (birthday_soon, holiday_soon, decor_down, watch_wait) are read off state other
// systems keep — never invented; each is written in the author's voice with no placeholder left; and
// the prompt line lists what is on the fridge (theirs, and in the kitchen a couple of others).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'housenotes.js',
    'traditions.js', 'occasions.js', 'birthdays.js', 'tv.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260929, n === undefined ? 3 : n);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 12, minutes: 1080 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    for (const id of __ids(g)) {
      const n2 = g.npcs[id];
      n2.location = 'bedroom_' + id; n2.activity = 'idle'; n2.transit = null;
      n2.bible.speech = { ...(n2.bible.speech || {}), textingStyle: 'all-lowercase' };
      n2.relPlayer = { ...n2.relPlayer, affection: 0.5, tension: 0 };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __notes = (g, room) => Object.values(g.objects['room_' + room] || {}).filter(o => o.defId === 'note');
`);

console.log('\n0. Registration');
const reg = J(`(() => ({
  motives: ['birthday_soon', 'holiday_soon', 'decor_down', 'watch_wait'].every(m => HOUSE_NOTE_TUNING.motives[m] && NOTE_TEMPLATES[m]),
  addressed: HOUSE_NOTE_TUNING.motives.watch_wait.warm === true && !HOUSE_NOTE_TUNING.motives.birthday_soon.warm,
}))()`);
check('four new motives, each with its row and its voices; watch_wait is a warm note to you, the calendar ones are for the flat', reg.motives && reg.addressed, JSON.stringify(reg));

console.log('\n1. The calendar');
const cal = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g); const day = g.meta.clock.day;
  const bd = (n) => birthdayDayOfYear(day + n);
  g.npcs[B].bible.birthday = bd(1);
  const m1 = occasionNoteMotives(g, A, day);
  const own = occasionNoteMotives(g, B, day).filter(m => m.motive === 'birthday_soon' && m.vars.who === 'Jonah');
  g.npcs[B].bible.birthday = bd(9);
  const far = occasionNoteMotives(g, A, day).filter(m => m.motive === 'birthday_soon');
  // holiday: find a day before a major occasion
  let hd = null, lab = null;
  for (let d = 3; d < 500 && !hd; d++) { const o = occasionsOnDay(d + 1).find(x => x.night === 1 && x.def.closure === 'major'); if (o && !occasionsOnDay(d).some(x => x.id === o.id)) { hd = d; lab = o.def.label; } }
  const h = __mk(); h.meta.clock.day = hd;
  const hol = occasionNoteMotives(h, __ids(h)[0], hd).filter(m => m.motive === 'holiday_soon');
  // decorations: up for an occasion that is over
  let dd = null, occId = null;
  for (const id of Object.keys(OCCASION_DECOR)) { const w = decorWindow(id, 30); if (w) { occId = id; break; } }
  const k = __mk(); const w = decorWindow(occId, 60); k.meta.clock.day = w.start; ensureWorldOccasions(k); putUpDecorations(k, occId, 'player', w.start);
  k.meta.clock.day = w.end;
  const during = occasionNoteMotives(k, __ids(k)[0], w.end).filter(m => m.motive === 'decor_down');
  k.meta.clock.day = w.end + 1;
  const after = occasionNoteMotives(k, __ids(k)[0], w.end + 1).filter(m => m.motive === 'decor_down');
  // a written note has no placeholder and names the person
  const cand = m1.find(m => m.motive === 'birthday_soon');
  const note = writeHouseNote(g, A, 'kitchen', cand, day, 10);
  const txt = __notes(g, 'kitchen')[0].meta.text;
  return { m1: cand && cand.vars, own: own.length, far: far.length, hol: hol[0] && hol[0].vars, lab, during: during.length, after: after[0] && after[0].vars, txt, ev: note && note.type, noteMotive: __notes(g, 'kitchen')[0].meta.motive, addressed: __notes(g, 'kitchen')[0].meta.addressedTo };
})()`);
check('a housemate whose birthday is tomorrow gets a fridge note from another (never about themselves, never ten days out)', cal.m1 && cal.m1.who === 'Jonah' && cal.m1.when === 'tomorrow' && cal.own === 0 && cal.far === 0, JSON.stringify({ m: cal.m1, own: cal.own, far: cal.far }));
check('a major holiday tomorrow is a note ("who is cooking"), naming it', cal.hol && cal.hol.label === cal.lab && cal.hol.when === 'tomorrow', JSON.stringify({ h: cal.hol, l: cal.lab }));
check('decorations come down only once the occasion is over', cal.during === 0 && cal.after && /\w/.test(cal.after.label), JSON.stringify({ d: cal.during, a: cal.after }));
check('the written note is in the author\'s voice, has no placeholder, and is for the whole flat', /jonah/i.test(cal.txt) && !/[{}]/.test(cal.txt) && cal.noteMotive === 'birthday_soon' && !cal.addressed && cal.ev === 'note_left', JSON.stringify({ t: cal.txt, e: cal.ev }));

console.log('\n2. "Wait for me"');
const tv = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  let day = null, show = null;
  for (const id of tvShowIds()) { for (let d = 20; d < 300; d++) { if (tvReleasedCount(tvShowDef(id), d) >= 3) { day = d; show = id; break; } } if (show) break; }
  g.meta.clock.day = day;
  const t = ensureTv(g);
  const rel = tvReleasedCount(tvShowDef(show), day);
  t.progress.player = { [show]: rel - 1 }; t.seeded[A] = 1; t.progress[A] = { [show]: rel - 1 }; t.together[A] = { [show]: day - 2 };
  const yes = tvNoteMotives(g, A, day);
  // not level
  t.progress[A][show] = rel - 2;
  const behind = tvNoteMotives(g, A, day);
  t.progress[A][show] = rel - 1;
  // caught up: nothing new to wait for
  t.progress.player[show] = rel; t.progress[A][show] = rel;
  const caughtUp = tvNoteMotives(g, A, day);
  t.progress.player[show] = rel - 1; t.progress[A][show] = rel - 1;
  // never watched together
  const B2 = tvNoteMotives(g, B, day);
  // cold
  g.npcs[A].relPlayer.affection = 0;
  const cold = tvNoteMotives(g, A, day);
  g.npcs[A].relPlayer.affection = 0.5;
  const note = writeHouseNote(g, A, 'kitchen', yes[0], day, 5);
  const n = __notes(g, 'kitchen')[0];
  return { yes: yes[0] && { motive: yes[0].motive, to: yes[0].addressedTo, show: yes[0].vars.show }, label: tvShowDef(show).label, behind: behind.length, caughtUp: caughtUp.length, B2: B2.length, cold: cold.length, text: n.meta.text, to: n.meta.addressedTo, ev: note.type };
})()`);
check('someone you watch a show with, level with you, with a new episode out, asks you to wait', tv.yes && tv.yes.motive === 'watch_wait' && tv.yes.to === 'player' && tv.yes.show === tv.label, JSON.stringify(tv.yes));
check('not if they are behind, you are caught up, you never watched it together, or they do not like you enough', tv.behind === 0 && tv.caughtUp === 0 && tv.B2 === 0 && tv.cold === 0, JSON.stringify(tv));
check('the note names the show, is addressed to you and is a warm one', tv.text.toLowerCase().includes(tv.label.toLowerCase()) && !/[{}]/.test(tv.text) && tv.to === 'player' && tv.ev === 'note_left_warm', JSON.stringify({ t: tv.text, e: tv.ev }));

console.log('\n3. The fridge in the conversation prompt (F4)');
const pr = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g); const day = g.meta.clock.day;
  const none = houseNotesPromptLine(g, A);
  writeHouseNote(g, A, 'kitchen', { motive: 'dishes' }, day, 10);
  const mine = __notes(g, 'kitchen')[0];
  const unread = houseNotesPromptLine(g, A);
  markNoteSeen(mine, 'player');
  const read = houseNotesPromptLine(g, A);
  // somebody else's note: only when you're in the kitchen
  writeHouseNote(g, B, 'kitchen', { motive: 'bins' }, day, 11);
  g.player.location = 'living_room';
  const away = houseNotesPromptLine(g, A);
  const awayOther = houseNotesPromptLine(g, __ids(g)[2] || A);
  g.player.location = 'kitchen';
  const kitchen = houseNotesPromptLine(g, A);
  const kitchenOther = houseNotesPromptLine(g, __ids(g)[2] || A);
  return { none, unread, read, away, awayOther, kitchen, kitchenOther };
})()`);
check('no line with nothing on the fridge', pr.none === null);
check('their own note: quoted, and whether you have read it', /\[Fridge\]/.test(pr.unread) && /has not read it/.test(pr.unread) && /has read it/.test(pr.read), JSON.stringify({ u: pr.unread, r: pr.read }));
check('another housemate\'s note appears only when you are standing in the kitchen', !/A note from/.test(pr.away) && pr.awayOther === null && /A note from Jonah/.test(pr.kitchen) && /\[Fridge\]/.test(pr.kitchenOther), JSON.stringify({ away: pr.away, k: pr.kitchen, ko: pr.kitchenOther }));

console.log('\n4. Wiring and R1');
{
  const llm = srcOf('llm.js'), hn = srcOf('housenotes.js');
  check('the prompt reads the fridge, and the motive list calls the calendar and TV motives', /houseNotesPromptLine\(gameState, npc\.id\)/.test(llm) && /occasionNoteMotives\(gs, npcId, day\)/.test(hn) && /tvNoteMotives\(gs, npcId, day\)/.test(hn));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([NOTE_TEMPLATES.birthday_soon, NOTE_TEMPLATES.holiday_soon, NOTE_TEMPLATES.decor_down, NOTE_TEMPLATES.watch_wait])');
  check('R1: no religion in the new notes', !vocab.test(T), (T.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
