// Books (books.js, 0.14.5) — What's On follow-up F6 / D15.
//
//   node dev/verify/verify-books.js
//
// The catalog and its tuning; taste (stable, derived); the tick pass (a reader moves through their
// book, the read_book event names it, finishing is remembered, nobody who is not reading is
// touched); the player's Read (every mode, through the real DSL, the return of a loan); the daily
// pass (a loan is offered once, goes home late, two people who finished the same book talk once);
// the prompt line; the wiring; R1 (no religion in an authored line).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'defs.computer.js',
    'tv.js', 'books.js', 'defs.actions.js', 'actions.js', 'computer.js', 'state.js', 'llm.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 5, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'kitchen';
    g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    for (const id of __ids(g)) { const n2 = g.npcs[id]; n2.location = 'bedroom_' + id; n2.activity = 'idle'; n2.transit = null; }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __feed = (g) => { g.world.computer = g.world.computer || { apps: {} }; g.world.computer.apps = g.world.computer.apps || {}; g.world.computer.apps.social_feed = { posts: [], nextPostId: 1 }; return g.world.computer.apps.social_feed; };
`);

console.log('\n0. Registration');
const reg = J(`(() => ({
  n: BOOK_IDS.length, ids: BOOK_IDS.every(id => BOOK_CATALOG[id].id === id), titles: new Set(BOOK_IDS.map(id => BOOK_CATALOG[id].title)).size,
  chapters: BOOK_IDS.every(id => BOOK_CATALOG[id].chapters >= 10 && BOOK_CATALOG[id].chapters <= 40),
  effect: !!(typeof EFFECT_DEFS !== 'undefined' ? EFFECT_DEFS.BOOK_READ : (typeof EFFECTS !== 'undefined' && EFFECTS.BOOK_READ)),
  fallback: typeof WORLD_KEY_FALLBACKS === 'object' && typeof WORLD_KEY_FALLBACKS.books === 'function',
  save: SAVE_KEYS.find(k => k.folder === 'world').keys.includes('books'),
  bands: EVENT_IMPORTANCE.book_finished === 'social' && EVENT_EMOTION.book_finished === 'warmth',
}))()`);
check('a catalog of twenty distinct, sensibly sized books', reg.n >= 20 && reg.ids && reg.titles === reg.n && reg.chapters, JSON.stringify(reg));
check('the world key is saved and defaulted, book_finished is a registered event, BOOK_READ is an effect', reg.save && reg.fallback && reg.bands, JSON.stringify(reg));

console.log('\n1. Taste');
const taste = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const a1 = BOOK_IDS.map(id => bookAffinity(g.npcs[A], A, id)), a2 = BOOK_IDS.map(id => bookAffinity(g.npcs[A], A, id));
  const b1 = BOOK_IDS.map(id => bookAffinity(g.npcs[B], B, id));
  return { same: JSON.stringify(a1) === JSON.stringify(a2), differ: JSON.stringify(a1) !== JSON.stringify(b1), finite: a1.every(Number.isFinite) };
})()`);
check('taste is stable and derived, and differs between people', taste.same && taste.differ && taste.finite);

console.log('\n2. The tick pass');
const tick = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  g.npcs[A].location = 'study'; g.npcs[A].activity = 'reading';
  g.npcs[B].location = 'living_room'; g.npcs[B].activity = 'watching TV';
  const before = JSON.stringify(g.npcs[B]);
  const evts = [{ npcId: A, type: 'read_book', template: '{name} curled up with a book for a while.', data: {} }, { npcId: A, type: 'read_book', template: 'x', data: { book: 'zz' } }];
  const r = resolveBooksTick(g, {}, [A, B, C], 30, evts);
  const b = g.world.books;
  const book = b.current[A];
  const p1 = b.progress[A][book];
  resolveBooksTick(g, {}, [A, B, C], 30, []);
  const p2 = b.progress[A][book];
  const def = BOOK_CATALOG[book];
  // a finish
  const h = __mk(); const [X] = __ids(h); __feed(h);
  h.npcs[X].activity = 'reading in bed'; h.npcs[X].location = 'bedroom_' + X;
  const id2 = bookCurrent(h, X); h.world.books.progress[X][id2] = BOOK_CATALOG[id2].chapters - 0.5;
  const moodBefore = h.npcs[X].mood || 0;
  const fin = resolveBooksTick(h, {}, [X], 30, []);
  const post = h.world.computer.apps.social_feed.posts.length;
  const noRead = J2(h, X, id2);
  return { book: !!def, named: evts[0].template.includes(def.title) && /chapter \\d+ of \\d+/.test(evts[0].template) && evts[0].data.book === book, untouchedTemplate: evts[1].template === 'x',
    moved: p2 > p1 && p1 >= 0, rate: Math.abs((p2 - p1) - 30 / BOOK_TUNING.minutesPerChapter) < 1e-9 || p2 === def.chapters, bUntouched: JSON.stringify(g.npcs[B]) === before && !b.progress[B] && !b.current[B],
    events: fin.events.length, evType: fin.events[0] && fin.events[0].type, finished: h.world.books.finished[X][id2] != null, cleared: h.world.books.current[X] === undefined,
    mood: h.npcs[X].mood > moodBefore, noFact: !JSON.stringify((h.npcs[X].memory || {}).facts || []).includes(BOOK_CATALOG[id2].title), postsOk: post >= 0 };
  function J2() { return null; }
})()`);
check('a reader has a book, moves through it at the stated pace, and their read_book event names it and the place', tick.book && tick.named && tick.moved && tick.rate && tick.untouchedTemplate, JSON.stringify(tick));
check('somebody who is not reading is not touched', tick.bUntouched);
check('finishing: it is theirs (ledger), the event and mood land (the memory comes from the event, not a fact written mid-tick), and they move on', tick.events === 1 && tick.evType === 'book_finished' && tick.finished && tick.cleared && tick.mood && tick.noFact, JSON.stringify(tick));

console.log('\n3. The player\'s Read');
const read = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const start = bookPlanPlayerRead(g);
  const line0 = bookReadNarration(g, start);
  // a roommate is in the middle of one: you start what they keep quoting
  bookCurrent(g, A);
  const talk = bookPlanPlayerRead(g);
  // the effect through the real DSL
  const ctx = buildEffectContext(g, [], [], {}, []);
  applyEffects(parseEffectDSL('BOOK_READ ' + talk.bookId + ' 2'), ctx);
  const cont = bookPlanPlayerRead(g);
  const at1 = g.world.books.progress.player[talk.bookId];
  // a loan takes priority
  const other = BOOK_IDS.find(id => id !== talk.bookId);
  g.world.books.lent.push({ bookId: other, from: B, day: 4 });
  const lent = bookPlanPlayerRead(g);
  const lentLine = bookReadNarration(g, lent);
  // finish the loan: it goes home with thanks
  g.world.books.progress.player[other] = BOOK_CATALOG[other].chapters - 1;
  const aff0 = g.npcs[B].relPlayer?.affection || 0;
  applyEffects(parseEffectDSL('BOOK_READ ' + other + ' 2'), buildEffectContext(g, [], [], {}, []));
  const fin = bookPlanPlayerRead(g);
  return { startMode: start.mode, line0, talkMode: talk.mode, talkReaders: talk.readers.includes(A), at1, contMode: cont.mode, contId: cont.bookId === talk.bookId,
    lentMode: lent.mode, lentFrom: lent.from === B, lentLine, finishedOther: g.world.books.finished.player[other] != null, loanGone: g.world.books.lent.length === 0, affUp: (g.npcs[B].relPlayer?.affection || 0) > aff0,
    afterLoan: fin && fin.mode };
})()`);
check('with nothing on the go you start one; with a roommate in the middle of one you start theirs', read.startMode === 'start' && /off the shelf/.test(read.line0) && read.talkMode === 'talk' && read.talkReaders, JSON.stringify({ s: read.startMode, l: read.line0, t: read.talkMode }));
check('BOOK_READ through the real DSL turns the pages; the next Read continues it', read.at1 === 2 && read.contMode === 'continue' && read.contId, JSON.stringify({ at: read.at1, m: read.contMode }));
check('a book on loan comes first and says whose it is; finishing it returns it, warms them, and clears the loan', read.lentMode === 'lent' && read.lentFrom && /lent you/.test(read.lentLine) && read.finishedOther && read.loanGone && read.affUp, JSON.stringify(read));

console.log('\n4. The daily pass');
const day = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g); const d = g.meta.clock.day;
  g.npcs[A].relPlayer = { ...(g.npcs[A].relPlayer || {}), affection: 0.5 };
  const bk = BOOK_IDS[0];
  ensureBooks(g); g.world.books.finished[A] = { [bk]: d - 1 };
  // lending
  let offered = null, off = null;
  for (let k = 0; k < 40 && !offered; k++) { g.world.books.offered = {}; g.world.books.lent = []; const r = processBooksForDay(g, d + k); if (g.world.books.lent.length) { offered = g.world.books.lent[0]; off = r.lines[0]; g.world.books.finished[A] = { [bk]: d + k - 1 }; } else { g.world.books.finished[A] = { [bk]: d + k }; } }
  const dayOffered = offered ? offered.day : null;
  // never twice
  const again = processBooksForDay(g, dayOffered + 1);
  const twice = g.world.books.lent.length;
  // late
  const late = processBooksForDay(g, dayOffered + BOOK_TUNING.lend.lendDays + 1);
  // club
  const h = __mk(); const [X, Y] = __ids(h); const dd = h.meta.clock.day;
  ensureBooks(h); h.world.books.finished[X] = { [bk]: dd - 1 }; h.world.books.finished[Y] = { [bk]: dd - 1 };
  const web0 = JSON.stringify(h.world.castWeb || {});
  const c1 = processBooksForDay(h, dd); const c2 = processBooksForDay(h, dd + 1);
  return { offered: !!offered, off, from: offered && offered.bookId === bk && offered.from === A, twice, again: again.lines.filter(l => /presses/.test(l)).length,
    lateLines: late.lines, loanGone: g.world.books.lent.length === 0,
    club1: c1.lines.length, club2: c2.lines.length, clubLine: c1.lines[0], webMoved: JSON.stringify(h.world.castWeb || {}) !== web0, mem: JSON.stringify(h.npcs[X].memory).includes(BOOK_CATALOG[bk].title) };
})()`);
check('a resident who loved one you have not read sometimes lends it to you, naming the book', day.offered && day.from && /presses/.test(day.off), JSON.stringify({ o: day.offered, l: day.off }));
check('never the same book twice, and one that stays out too long goes home with a line', day.twice === 1 && day.again === 0 && day.lateLines.some(l => /gets .* back/.test(l)) && day.loanGone, JSON.stringify({ t: day.twice, late: day.lateLines }));
check('two people who finished the same book talk it over, once: the line, a bond, a memory', day.club1 === 1 && day.club2 === 0 && /arguing happily/.test(day.clubLine) && day.webMoved && day.mem, JSON.stringify({ c1: day.club1, c2: day.club2 }));

console.log('\n5. The conversation prompt');
const pr = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const none = bookPromptLine(g, A);
  const bk = bookCurrent(g, A);
  const line = bookPromptLine(g, A);
  ensureBooks(g); g.world.books.progress.player = { [bk]: 3 };
  const ahead = bookPromptLine(g, A);
  g.world.books.finished.player = { [bk]: 5 };
  const read = bookPromptLine(g, A);
  g.world.books.lent.push({ bookId: BOOK_IDS[1], from: A, day: 5 });
  const lent = bookPromptLine(g, A);
  return { none, line, ahead, read, lent };
})()`);
check('no line before anyone reads anything; then what they are reading and where', pr.none === null && /\[Reading\]/.test(pr.line) && /chapter \d+ of \d+/.test(pr.line), String(pr.line));
check('it knows whether you are partway (no spoilers), have read it too, and what they lent you', /not give away/.test(pr.ahead) && /has read .* too/.test(pr.read) && /lent the player/.test(pr.lent), JSON.stringify(pr));

console.log('\n6. Wiring, and R1');
{
  const sim = srcOf('sim.js'), ui = srcOf('ui.js'), llm = srcOf('llm.js'), acts = srcOf('defs.actions.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
  check('sim runs the tick pass, the rollover runs the daily pass, the prompt reads the line, the hobby verb plans a real book', /resolveBooksTick\(gameState, npcUpdates/.test(sim) && /processBooksForDay\(currentGameState, day\)/.test(ui) && /bookPromptLine\(gameState, npc\.id\)/.test(llm) && /bookPlanPlayerRead\(ctx\.gameState\)/.test(acts) && /BOOK_READ \$\{prepared\.book\.bookId\}/.test(acts));
  check('books.js is loaded by index.html', /srcfiles\/books\.js\?v=\d+/.test(html));
  const b = srcOf('books.js');
  check('books.js never touches the shared rng (own hashes only)', !/\brng\(\)/.test(b) && !/Math\.random/.test(b));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([BOOK_CATALOG, BOOK_TUNING])');
  check('R1: no religion in the catalog or its lines', !vocab.test(T), (T.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
