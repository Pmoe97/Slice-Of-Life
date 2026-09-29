// ===== SECTION: BOOKS =====
// Books (What's On follow-up F6 / D15, 0.14.5). read_book used to be "curled up with a book";
// now there is a book. Each resident has one on the go (a stable taste, derived not stored — the
// same discipline as tv.js), a place in it that moves while they sit with it, a last page that
// they remember and sometimes post about; the ones who loved one lend it to you; two people who
// have both finished the same book talk about it. Nothing here decides WHETHER anyone reads — the
// read_book drive and the schedule tables do — only WHAT, and how it goes.
//
// world.books = {
//   progress[viewer][bookId]   chapters read (float; the player's whole numbers)
//   current[viewer]            the book they are in the middle of
//   finished[viewer][bookId]   the day they finished it
//   lent[]                     { bookId, from, day } — on loan to you
//   readDay[npcId]             the last day the tick pass advanced their place (bookkeeping)
//   clubDay[key]               the last day two people talked one over (cooldown)
//   offered[bookId]            days a book was offered to you (never twice)
// }
// The player is the viewer 'player'. Pure reads are pure; the tick pass and daily pass write.

function bookDef(id) { return BOOK_CATALOG[id] || null; }

function bookHash(...parts) { return hashStr(parts.join('|')); }

function bookRead(gs) {
  const b = gs?.world?.books;
  return (b && typeof b === 'object') ? b : null;
}

function ensureBooks(gs) {
  const world = gs.world || (gs.world = {});
  const b = (world.books && typeof world.books === 'object') ? world.books : (world.books = {});
  for (const k of ['progress', 'current', 'finished', 'readDay', 'clubDay', 'offered']) {
    if (!b[k] || typeof b[k] !== 'object' || Array.isArray(b[k])) b[k] = {};
  }
  if (!Array.isArray(b.lent)) b.lent = [];
  return b;
}

function bookResidents(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident').sort();
}

function bookName(gs, id) { return gs?.npcs?.[id]?.bible?.name || 'Someone'; }

function bookNpcSeed(npc, npcId) { return String(npc?.bible?.genSeed ?? npc?.genSeed ?? npcId ?? 'npc'); }

// How much this person would like this book. Stable, derived.
function bookAffinity(npc, npcId, bookId) {
  const def = bookDef(bookId);
  if (!def) return -Infinity;
  const T = BOOK_TUNING;
  const jitter = ((bookHash(bookNpcSeed(npc, npcId), bookId, 'taste') % 10000) / 10000 * 2 - 1) * T.jitter;
  const names = (npc?.bible?.interests || []).map(i => (typeof i === 'string' ? i : i?.name)).filter(Boolean).map(s => String(s).toLowerCase());
  const hits = (def.interests || []).filter(x => names.includes(x)).length;
  const temper = npc?.bible?.temperament || {};
  let lean = 0;
  for (const [axis, w] of Object.entries(def.temper || {})) lean += w * (typeof temper[axis] === 'number' ? temper[axis] : 0);
  return jitter + Math.min(T.interestCap, hits * T.interestWeight) + T.temperWeight * lean;
}

function bookChaptersRead(gs, viewer, bookId) {
  return bookRead(gs)?.progress?.[viewer]?.[bookId] || 0;
}

function bookIsFinished(gs, viewer, bookId) {
  return bookRead(gs)?.finished?.[viewer]?.[bookId] != null;
}

// Their book: the one they are in the middle of, or the best-liked one they have not finished.
// The choice is stored the first time so it doesn't flicker as taste ties break. Pure read: use
// bookCurrent for the writing version.
function bookChoose(gs, npcId) {
  const b = bookRead(gs);
  const cur = b?.current?.[npcId];
  if (cur && bookDef(cur) && !bookIsFinished(gs, npcId, cur)) return cur;
  const npc = gs?.npcs?.[npcId];
  const ranked = BOOK_IDS.filter(id => !bookIsFinished(gs, npcId, id))
    .sort((x, y) => (bookAffinity(npc, npcId, y) - bookAffinity(npc, npcId, x)) || (x < y ? -1 : 1));
  // Rotate through the top few by how many they have finished, so a second book is not always the
  // runaway favourite of the first pass.
  const done = Object.keys(b?.finished?.[npcId] || {}).length;
  return ranked[Math.min(done % 3, ranked.length - 1)] || null;
}

function bookCurrent(gs, npcId) {
  const b = ensureBooks(gs);
  const id = bookChoose(gs, npcId);
  if (id && b.current[npcId] !== id) {
    b.current[npcId] = id;
    if (typeof b.progress[npcId] !== 'object') b.progress[npcId] = {};
    // A first book is already underway (nobody starts life on page one).
    if (b.progress[npcId][id] === undefined) {
      const start = bookHash(bookNpcSeed(gs.npcs[npcId], npcId), id, 'start') % 100 < 55
        ? Math.floor((bookHash(bookNpcSeed(gs.npcs[npcId], npcId), id, 'at') % 60) / 100 * bookDef(id).chapters) : 0;
      b.progress[npcId][id] = start;
    }
  }
  return id;
}

// "chapter 7 of 24" for a place. Pure.
function bookPlaceLabel(def, chapters) {
  const n = Math.max(1, Math.min(def.chapters, Math.floor(chapters) + 1));
  return `chapter ${n} of ${def.chapters}`;
}

function bookFill(t, vars) {
  return String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function bookPost(gs, authorId, text, day) {
  const feed = gs.world?.computer?.apps?.social_feed;
  if (!feed || !Array.isArray(feed.posts) || typeof feed.nextPostId !== 'number') return false;
  feed.posts.push({ id: 'post_' + (feed.nextPostId++), author: authorId, text, likes: [], comments: [], day, eventRef: null, visibility: 'public', media: null });
  return true;
}

// Somebody finished a book: it is theirs now. Returns the finish line.
function bookFinish(gs, viewer, bookId, day) {
  const b = ensureBooks(gs);
  const def = bookDef(bookId);
  const F = BOOK_TUNING.finish;
  (b.finished[viewer] || (b.finished[viewer] = {}))[bookId] = day;
  if (b.current[viewer] === bookId) delete b.current[viewer];
  if (viewer === 'player' || !gs.npcs?.[viewer]) return null;
  let npc = gs.npcs[viewer];
  npc = { ...npc, mood: Math.max(-1, Math.min(1, (npc.mood || 0) + F.mood)) };
  // No memory fact here: this runs inside the tick, and the book_finished event it returns is what
  // the memory pipeline turns into an episode (a fact written mid-tick is a writer the initiative
  // counterfactual, verify-i2, cannot strip).
  gs.npcs[viewer] = npc;
  if (bookHash(viewer, bookId, 'finishpost') % 100 < F.postChance * 100) {
    bookPost(gs, viewer, bookFill(F.post[bookHash(viewer, bookId, 'p') % F.post.length], { title: def.title }), day);
  }
  return bookFill(F.line, { name: bookName(gs, viewer), title: def.title });
}

// --- The tick pass (sim.js, beside resolveTvTick) --------------------------------------------
// Whoever is reading (activity in BOOK_TUNING.activities) moves through their book, and their
// read_book event this tick names it. Own hashes only — no shared rng, no decisions about whether
// anyone reads. Returns { events }.
function resolveBooksTick(gs, npcUpdates, activeNpcIds, minutesThisTick, tickEvents) {
  const out = { events: [] };
  if (!minutesThisTick || !gs?.world) return out;
  const day = gs.meta?.clock?.day ?? 1;
  for (const id of activeNpcIds || []) {
    const npc = gs.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident') continue;
    const u = npcUpdates?.[id] || {};
    const activity = u.activity !== undefined ? u.activity : npc.activity;
    if (!BOOK_TUNING.activities.includes(activity || '')) continue;
    const bookId = bookCurrent(gs, id);
    if (!bookId) continue;
    const b = ensureBooks(gs);
    const def = bookDef(bookId);
    const before = b.progress[id][bookId] || 0;
    const after = Math.min(def.chapters, before + minutesThisTick / BOOK_TUNING.minutesPerChapter);
    b.progress[id][bookId] = after;
    b.readDay[id] = day;
    // Name the book in this tick's read_book event ("curled up with a book…").
    const evt = (tickEvents || []).find(e => e && e.npcId === id && e.type === 'read_book' && !(e.data && e.data.book));
    if (evt) {
      const w = / while ([^.]+)\.?$/.exec(evt.template || '');
      const weather = w ? ` while ${w[1]}` : '';
      evt.data = { ...(evt.data || {}), book: bookId };
      evt.template = `{name} curled up with ${def.title} (${bookPlaceLabel(def, after)})${weather}.`;
    }
    if (after >= def.chapters && before < def.chapters) {
      const line = bookFinish(gs, id, bookId, day);
      if (line) out.events.push({ day, tick: getTickIndex(gs.meta.clock.minutes), roomId: u.location !== undefined ? u.location : npc.location, npcId: id,
        type: 'book_finished', moodDelta: BOOK_TUNING.finish.mood, importance: MEMORY_IMPORTANCE.social, data: { book: bookId }, template: line, seenByPlayer: false });
    }
  }
  return out;
}

// --- The player's Read (defs.actions.js's hobby.bookshelf) ------------------------------------

// What you would read: the book on loan from a roommate, else the one you are in the middle of,
// else one to start (the flat's talk of the week, or the best-fitting for you — here, whatever a
// roommate is in the middle of that you have not read, else the first unread). Pure.
function bookPlanPlayerRead(gs) {
  const b = bookRead(gs);
  const lent = (b?.lent || []).find(l => !bookIsFinished(gs, 'player', l.bookId));
  let bookId = null, mode = 'start';
  if (lent) { bookId = lent.bookId; mode = 'lent'; }
  else if (b?.current?.player && !bookIsFinished(gs, 'player', b.current.player)) { bookId = b.current.player; mode = 'continue'; }
  else {
    const friends = bookResidents(gs).map(id => b?.current?.[id]).filter(x => x && !bookIsFinished(gs, 'player', x));
    bookId = friends[0] || BOOK_IDS.find(id => !bookIsFinished(gs, 'player', id)) || null;
    mode = friends[0] ? 'talk' : 'start';
  }
  if (!bookId) return null;
  const def = bookDef(bookId);
  const at = bookChaptersRead(gs, 'player', bookId);
  const after = Math.min(def.chapters, at + BOOK_TUNING.playerChapters);
  const readers = bookResidents(gs).filter(id => b?.current?.[id] === bookId || bookIsFinished(gs, id, bookId));
  return { bookId, mode, title: def.title, author: def.author, at, after, finishes: after >= def.chapters, from: lent ? lent.from : null,
    readers, place: bookPlaceLabel(def, at), chapters: def.chapters };
}

// The BOOK_READ effect's writer.
function bookApplyPlayerRead(gs, bookId, chapters) {
  const def = bookDef(bookId);
  if (!def) return null;
  const b = ensureBooks(gs);
  const day = gs.meta.clock.day;
  if (!b.progress.player) b.progress.player = {};
  const before = b.progress.player[bookId] || 0;
  const after = Math.min(def.chapters, before + Math.max(1, Number(chapters) || BOOK_TUNING.playerChapters));
  b.progress.player[bookId] = after;
  b.current.player = bookId;
  if (after >= def.chapters && before < def.chapters) {
    bookFinish(gs, 'player', bookId, day);
    // Give it back.
    const i = b.lent.findIndex(l => l.bookId === bookId);
    if (i >= 0) {
      const from = b.lent[i].from;
      b.lent.splice(i, 1);
      if (gs.npcs?.[from]) {
        gs.npcs[from] = applyRelDelta(gs.npcs[from], { affection: BOOK_TUNING.lend.affection }, undefined);
        gs.npcs[from] = { ...gs.npcs[from], mood: Math.max(-1, Math.min(1, (gs.npcs[from].mood || 0) + BOOK_TUNING.lend.mood)) };
        gs.npcs[from] = addMemoryFact(gs.npcs[from], { text: `The player finished ${def.title}, which I lent them.`, day, importance: BOOK_TUNING.club.factImportance, category: 'relationship' });
      }
    }
  }
  return { finished: after >= def.chapters && before < def.chapters };
}

// The Read line, from the plan alone. Pure.
function bookReadNarration(gs, plan) {
  if (!plan) return null;
  const who = plan.readers.map(id => bookName(gs, id));
  const parts = [];
  if (plan.mode === 'lent') parts.push(`You pick up ${plan.title}, the one ${bookName(gs, plan.from)} lent you (${plan.place}).`);
  else if (plan.mode === 'continue') parts.push(`You go back to ${plan.title} (${plan.place}).`);
  else if (plan.mode === 'talk') parts.push(`${who[0] || 'Somebody'} keeps quoting ${plan.title}, so you pull it off the shelf and start it.`);
  else parts.push(`You take ${plan.title} by ${plan.author} off the shelf and read the first chapters.`);
  if (plan.finishes) parts.push(`You turn the last page and sit there for a while.${who.length ? ` ${who[0]} is going to want to talk about it.` : ''}`);
  else if (plan.mode === 'talk' || plan.mode === 'start') parts.push('You lose an hour in it.');
  return parts.join(' ');
}

// --- The daily pass (ui.js's processDayRollover) ----------------------------------------------
// Lending, the late return, and two people who finished the same book talking it over.
function processBooksForDay(gs, day) {
  const out = { lines: [] };
  if (!gs?.world || !gs.npcs) return out;
  const b = ensureBooks(gs);
  const L = BOOK_TUNING.lend, C = BOOK_TUNING.club;
  const ids = bookResidents(gs);

  // Late returns.
  for (let i = b.lent.length - 1; i >= 0; i--) {
    const l = b.lent[i];
    if (day - l.day < L.lendDays) continue;
    b.lent.splice(i, 1);
    if (gs.npcs[l.from]) out.lines.push(bookFill(L.lateLine, { name: bookName(gs, l.from), title: bookDef(l.bookId).title }));
  }
  // An offer: someone who finished a book yesterday, likes you, and you have not read it.
  if (!b.lent.length) {
    for (const id of ids) {
      const npc = gs.npcs[id];
      if ((npc.relPlayer?.affection || 0) < L.minAffection) continue;
      const fresh = Object.keys(b.finished[id] || {}).find(bk => b.finished[id][bk] >= day - 2 && b.finished[id][bk] <= day
        && !bookIsFinished(gs, 'player', bk) && !b.offered[bk]);
      if (!fresh || bookHash(id, fresh, 'lend', day) % 100 >= L.chance * 100) continue;
      b.offered[fresh] = day;
      b.lent.push({ bookId: fresh, from: id, day });
      out.lines.push(bookFill(L.offerLine, { name: bookName(gs, id), title: bookDef(fresh).title }));
      break;
    }
  }
  // Pairs who both finished the same book.
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], c = ids[j];
    const shared = Object.keys(b.finished[a] || {}).find(bk => b.finished[c]?.[bk] != null && Math.max(b.finished[a][bk], b.finished[c][bk]) >= day - 1);
    if (!shared) continue;
    const key = [a, c].sort().join('|') + '|' + shared;
    if (b.clubDay[key] != null) continue;
    b.clubDay[key] = day;
    const title = bookDef(shared).title;
    let web = gs.world.castWeb || {};
    web = applyNpcToNpcDelta(web, a, c, { affection: C.bond });
    web = applyNpcToNpcDelta(web, c, a, { affection: C.bond });
    gs.world.castWeb = web;
    gs.npcs[a] = addMemoryFact(gs.npcs[a], { text: bookFill(C.fact, { title, other: bookName(gs, c) }), day, importance: C.factImportance, category: 'relationship' });
    gs.npcs[c] = addMemoryFact(gs.npcs[c], { text: bookFill(C.fact, { title, other: bookName(gs, a) }), day, importance: C.factImportance, category: 'relationship' });
    out.lines.push(bookFill(C.line, { a: bookName(gs, a), b: bookName(gs, c), title }));
  }
  // Keep the bookkeeping small.
  const cut = day - 400;
  for (const k of Object.keys(b.clubDay)) if (b.clubDay[k] < cut) delete b.clubDay[k];
  return out;
}

// --- The conversation prompt (llm.js's buildNpcBlockV2) ---------------------------------------
// [Reading]: what they are reading and where, what they finished lately, and where you are with
// it — so "what are you reading?" has an answer, and so does "did you like it?".
function bookPromptLine(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  if (!npc || npc.residency?.status !== 'resident') return null;
  const b = bookRead(gs);
  if (!b) return null;
  const name = bookName(gs, npcId);
  const cur = b.current?.[npcId];
  const def = cur ? bookDef(cur) : null;
  const done = Object.keys(b.finished?.[npcId] || {}).sort((x, y) => b.finished[npcId][y] - b.finished[npcId][x]);
  if (!def && !done.length) return null;
  let line = '[Reading]: ';
  if (def) line += `${name} is reading ${def.title} by ${def.author} (${def.genre}), ${bookPlaceLabel(def, b.progress?.[npcId]?.[cur] || 0)}.`;
  if (done.length) line += `${def ? ' ' : ''}${name} recently finished ${bookDef(done[0]).title}.`;
  const p = b.progress?.player || {};
  for (const id of [cur, ...done].filter(Boolean)) {
    if (bookIsFinished(gs, 'player', id)) line += ` The player has read ${bookDef(id).title} too, so they can talk about it.`;
    else if (p[id] > 0) line += ` The player is partway through ${bookDef(id).title}; ${name} should not give away the ending.`;
    else continue;
    break;
  }
  const lent = (b.lent || []).find(l => l.from === npcId);
  if (lent) line += ` ${name} lent the player ${bookDef(lent.bookId).title} and would like it back.`;
  return line;
}

// ===== /SECTION: BOOKS =====
