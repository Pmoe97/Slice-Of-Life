// Game Room Phases 10–11 — the house plays without you, and gathers to play (gamenight.js;
// game-room-overhaul-plan.md D5/D15; 0.14.5).
//
//   node src/src/dev/verify/verify-gamenight.js
//
// Roommates playing each other (who wins by skill, "again" and "wants a rematch", a sore loser, the
// record, moods and the cast web, the events, the conversation prompt); the weekly game night and the
// holiday ones being booked as real commitments, kept by the ledger, and paying out (who took the night,
// a closer flat, a warmer you); the arcade tournament; Thanksgiving's big game on the TV.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'skills.js', 'commitments.js', 'games.js', 'arcade.js', 'gamenight.js', 'occasions.js', 'tv.js', 'state.js', 'llm.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 20, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'kitchen'; g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].activity = 'idle'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.4, tension: 0 }; g.npcs[id].bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 }; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __dayWhere = (pred, from) => { for (let d = from || 1; d < 800; d++) if (pred(d)) return d; return null; };
  __gaming = (g, id, skill) => { g.npcs[id].bible.interests = [{ name: 'gaming', skill }]; };
`);

console.log('\n0. Registration');
const reg = J(`(() => ({
  fns: ['processGameNightDay', 'processRoommateGamesForDay', 'processGameNightsForDay', 'resolveGameNightsForDay', 'gameNightNow', 'gameNightActivity', 'gameNightNotePresence', 'gnPairPromptLine'].every(f => typeof eval(f) === 'function'),
  bands: EVENT_IMPORTANCE.roommate_game === 'social' && EVENT_IMPORTANCE.game_night === 'social' && EVENT_EMOTION.roommate_game === 'warmth' && EVENT_EMOTION.game_night === 'warmth',
  fallback: typeof WORLD_KEY_FALLBACKS.games === 'function' && !!WORLD_KEY_FALLBACKS.games().pairs,
  holidays: Object.keys(GAMENIGHT_TUNING.holidays).every(id => !!OCCASION_DEFS[id]),
  film: !!TV_TUNING.films.big_game && OCCASION_DEFS[TV_TUNING.films.big_game.occasion] && TV_TUNING.films.big_game.roomLine.includes('{title}'),
}))()`);
check('the passes, the ledger hooks and the event bands are registered; the holidays named exist; the save default has the pairs', reg.fns && reg.bands && reg.fallback && reg.holidays, JSON.stringify(reg));

console.log('\n1. Roommates playing each other');
const rm = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  __gaming(g, A, 90); __gaming(g, B, 5); __gaming(g, C, 50);
  const day = g.meta.clock.day;
  const pAB = gnWinChance(g, A, B, 'pool'), pBA = gnWinChance(g, B, A, 'pool');
  __gaming(g, A, 5); __gaming(g, B, 95); const swapped = gnWinChance(g, A, B, 'pool'); __gaming(g, A, 90); __gaming(g, B, 5);
  const mood0 = { A: g.npcs[A].mood || 0, B: g.npcs[B].mood || 0 };
  // a match A wins
  const t1 = gnRoommateMatch(g, A, B, 'pool', day, 0.0);
  const rec1 = JSON.parse(JSON.stringify(g.world.games.pairs[gnPairKey(A, B)]));
  const ev1 = g.world.events[g.world.events.length - 1];
  // again: same winner, same game
  const t2 = gnRoommateMatch(g, A, B, 'pool', day + 1, 0.0);
  const rec2 = JSON.parse(JSON.stringify(g.world.games.pairs[gnPairKey(A, B)]));
  const ev2 = g.world.events[g.world.events.length - 1];
  // a different game resets the streak; the other way round too
  gnRoommateMatch(g, A, B, 'darts', day + 2, 0.0);
  const rec3 = g.world.games.pairs[gnPairKey(A, B)].last;
  gnRoommateMatch(g, A, B, 'darts', day + 3, 0.999);
  const rec4 = g.world.games.pairs[gnPairKey(A, B)];
  // a sore loser
  let soreEv = null, calmSore = false; for (let seed = 1; seed <= 12 && !soreEv; seed++) { const s = __mk(20260929 + seed); const [X, Y] = __ids(s); __gaming(s, X, 99); __gaming(s, Y, 1); s.npcs[Y].bible.temperament.volatility = 0.9; if (gnWinChance(s, X, Y, 'console') < 0.72) continue; gnRoommateMatch(s, X, Y, 'console', 30, 0.0); soreEv = s.world.events[s.world.events.length - 1]; s.npcs[Y].bible.temperament.volatility = 0; const s2 = __mk(20260929 + seed); const [X2, Y2] = __ids(s2); __gaming(s2, X2, 99); __gaming(s2, Y2, 1); gnRoommateMatch(s2, X2, Y2, 'console', 30, 0.0); calmSore = /not taking it well/.test(s2.world.events[s2.world.events.length - 1].template); }
  // the prompt
  const pl = gnPairPromptLine(g, B), pw = gnPairPromptLine(g, A), pc = gnPairPromptLine(g, C);
  return { pAB, pBA, swapped, moods: { A: g.npcs[A].mood - mood0.A, B: g.npcs[B].mood - mood0.B }, t1, t2, rec1, streak2: rec2.last.streak, ev1: { type: ev1.type, npc: ev1.npcId === A, other: ev1.data.other === B, seen: ev1.seenByPlayer, tmpl: ev1.template }, ev2: ev2.template, resetStreak: rec3.streak, flipped: { winner: rec4.last.winner === B, streak: rec4.last.streak }, sore: soreEv && soreEv.template, calmSore, prompt: { loser: pl, winner: pw, other: pc }, ids: { A, B } };
})()`);
check('the chance is symmetric and follows skill (the same two people, the other way round in skill, swap it), and a roll of nothing is a win for the first named, of nearly one a win for the second', Math.abs(rm.pAB + rm.pBA - 1) < 1e-9 && rm.pAB > rm.swapped + 0.2 && rm.rec1[rm.ids.A] === 1 && rm.rec1[rm.ids.B] === 0, JSON.stringify({ pAB: rm.pAB, swapped: rm.swapped, rec: rm.rec1 }));
check('the winner is happier and the loser is not; the flat hears of it as an event (naming the loser); a first win is plain, a repeat is "again … wants a rematch"', rm.moods.A > 0 && rm.moods.B < 0 && rm.ev1.type === 'roommate_game' && rm.ev1.npc && rm.ev1.other && rm.ev1.seen === false && !/again/.test(rm.ev1.tmpl) && /again/.test(rm.ev2) && /rematch|another go/.test(rm.ev2) && rm.streak2 === 2, JSON.stringify({ m: rm.moods, e1: rm.ev1.tmpl, e2: rm.ev2 }));
check('a different game or a different winner breaks the streak; a hot-headed loser of a walkover is not taking it well', rm.resetStreak === 1 && rm.flipped.winner && rm.flipped.streak === 1 && /not taking it well/.test(rm.sore || '') && rm.calmSore === false && /the console/.test(rm.sore || ''), JSON.stringify({ r: rm.resetStreak, f: rm.flipped, s: rm.sore, c: rm.calmSore }));
check('the conversation prompt (after the last game, which Jonah won): the loser keeps losing and wants a rematch, the winner has been winning, a bystander hears nothing', /keeps losing to Jonah/.test(rm.prompt.winner) && /beating Mira/.test(rm.prompt.loser) && rm.prompt.other === null, JSON.stringify(rm.prompt));

const daily = J(`(() => {
  const g = __mk();
  const days = 240; let played = 0, lines = 0; const seen = new Set();
  for (let d = 1; d <= days; d++) { const before = g.world.events.length; processRoommateGamesForDay(g, d); if (g.world.events.length > before) { played++; seen.add(g.world.events[g.world.events.length - 1].data.game); } }
  const a = __mk(), b = __mk();
  for (let d = 1; d <= 40; d++) { processRoommateGamesForDay(a, d); processRoommateGamesForDay(b, d); }
  const same = JSON.stringify(a.world.events) === JSON.stringify(b.world.events) && JSON.stringify(a.world.games.pairs) === JSON.stringify(b.world.games.pairs);
  const broken = __mk(); broken.world.upgrades.game_room_setup = { tier: 'broken', condition: 0 }; for (let d = 1; d <= 60; d++) processRoommateGamesForDay(broken, d);
  const alone = __mk(1, 1); const only = __ids(alone).slice(1); for (const id of only) alone.npcs[id].residency = { ...alone.npcs[id].residency, status: 'former' }; for (let d = 1; d <= 60; d++) processRoommateGamesForDay(alone, d);
  const pairs = Object.keys(g.world.games.pairs).length;
  return { played, share: played / days, games: [...seen].sort(), same, brokenEvents: broken.world.events.length, aloneEvents: alone.world.events.length, pairs, keep: GAMENIGHT_TUNING.roommate.keepPairs };
})()`);
check('offscreen matches happen on some days (about the chance), across the games, deterministically', daily.share > 0.25 && daily.share < 0.55 && daily.games.length === 3 && daily.same, JSON.stringify({ share: daily.share, games: daily.games }));
check('none with a broken game room or with nobody to play', daily.brokenEvents === 0 && daily.aloneEvents === 0, JSON.stringify({ b: daily.brokenEvents, a: daily.aloneEvents }));

console.log('\n2. Booking game night');
const book = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  __gaming(g, A, 10); __gaming(g, B, 90); __gaming(g, C, 40);
  const friday = __dayWhere(d => getWeekday(d) === 5 && occasionsOnDay(d).length === 0, 20);
  const notFriday = __dayWhere(d => getWeekday(d) === 2 && occasionsOnDay(d).length === 0, 20);
  const off = processGameNightsForDay(g, notFriday);
  const before = (g.world.commitments || []).length;
  const on = processGameNightsForDay(g, friday);
  const c = (g.world.commitments || []).find(x => x.gameNight);
  const again = processGameNightsForDay(g, friday);
  const dupNow = (g.world.commitments || []).filter(x => x.gameNight).length;
  const nextWeek = processGameNightsForDay(g, friday + 7);
  const inCooldown = processGameNightsForDay(g, friday + 3);
  // not with too few free / a broken room
  const few = __mk(1, 1); const ff = __dayWhere(d => getWeekday(d) === 5 && occasionsOnDay(d).length === 0, 20); const noOne = processGameNightsForDay(few, ff);
  const br = __mk(); br.world.upgrades.game_room_setup = { tier: 'broken', condition: 0 }; const brk = processGameNightsForDay(br, friday);
  return { friday, off: off.lines.length, before, on: on.lines, c: c && { kind: c.kind, room: c.roomId, host: c.host === B, hostName: g.npcs[c.host].bible.name, start: c.startAbs % 1440, len: c.endAbs - c.startAbs, invited: c.invitedIds.length, gn: c.gameNight }, again: again.lines.length, dup: dupNow, nextWeek: nextWeek.lines.length, inCooldown: inCooldown.lines.length, noOne: noOne.lines.length, brk: brk.lines.length };
})()`);
check('on the weekly evening the most game-loving roommate books the game room: a real hangout, everyone else invited, marked as a game night', book.off === 0 && book.c && book.c.kind === 'hangout' && book.c.room === 'game_room' && book.c.host && book.c.start === 1200 && book.c.len === 120 && book.c.invited === 2 && ['pool', 'darts', 'console'].includes(book.c.gn.gameId), JSON.stringify(book.c));
check('the invitation names the host and the time; it is not booked twice, waits out its cooldown, and comes round again a week on', book.on.length === 1 && /Jonah is hosting game night tonight at 8:00 PM/.test(book.on[0]) && book.again === 0 && book.dup === 1 && book.inCooldown === 0 && book.nextWeek === 1, JSON.stringify(book));
check('nobody to play with, or a broken game room, and there is no night', book.noOne === 0 && book.brk === 0);

const hol = J(`(() => {
  const out = {};
  for (const id of ['lantern_nights', 'midwinter', 'new_years_eve']) {
    const g = __mk(); const ids = __ids(g);
    const day = __dayWhere(d => occasionsOnDay(d).some(o => o.id === id && o.night === 1) && !occasionsOnDay(d).some(o => o.id !== id && GAMENIGHT_TUNING.holidays[o.id]), 3);
    for (const i of ids) g.npcs[i].bible.temperament = { ...g.npcs[i].bible.temperament, warmth: 0.5 };
    // everyone is festive enough to host
    const orig = npcOccasionAffinity; npcOccasionAffinity = () => 0.9;
    let r; try { r = processGameNightsForDay(g, day); } finally { npcOccasionAffinity = orig; }
    const c = (g.world.commitments || []).find(x => x.gameNight);
    // and not on the second night
    const g2 = __mk(); const day2 = __dayWhere(d => occasionsOnDay(d).some(o => o.id === id && o.night === 2), 3);
    const orig2 = npcOccasionAffinity; npcOccasionAffinity = () => 0.9; let r2 = { lines: [] }; try { if (day2) r2 = processGameNightsForDay(g2, day2); } finally { npcOccasionAffinity = orig2; }
    out[id] = { line: r.lines[0], gn: c && c.gameNight, start: c && c.startAbs % 1440, second: day2 ? (g2.world.commitments || []).filter(x => x.gameNight && x.gameNight.occasion === id).length : 0 };
  }
  return out;
})()`);
check('Lantern Nights is a card night (poker or blackjack), Midwinter a board-game night, New Year\'s Eve an arcade tournament — each booked once, on the first night, with its own invitation', ['poker', 'blackjack'].includes(hol.lantern_nights.gn.gameId) && /card night/.test(hol.lantern_nights.line) && hol.midwinter.gn.gameId === 'boardgame' && /board-game night/.test(hol.midwinter.line) && hol.new_years_eve.gn.gameId === 'arcade' && hol.new_years_eve.gn.tournament === true && /arcade tournament/.test(hol.new_years_eve.line) && hol.lantern_nights.second === 0, JSON.stringify(hol));

console.log('\n3. While it is on');
const live = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const day = 25;
  const c = createCommitment(g, { kind: 'hangout', startAbs: day * 1440 + 1200, endAbs: day * 1440 + 1320, roomId: 'game_room', invitedIds: [B], proposerId: A, host: A }).record;
  c.gameNight = { gameId: 'pool', label: 'game night', occasion: null, tournament: false };
  const at = (min) => { g.meta.clock.day = day; g.meta.clock.minutes = min; };
  at(1100); const before = gameNightNow(g);
  at(1210); const during = gameNightNow(g);
  const act = { A: gameNightActivity(g, A), B: gameNightActivity(g, B), player: gameNightActivity(g, 'player') };
  const cA = (c.acceptedIds || []).includes(A), cB = (c.acceptedIds || []).includes(B);
  g.player.location = 'kitchen'; gameNightNotePresence(g, c, A);
  const noPlayer = c.attended.includes('player');
  g.player.location = 'game_room'; gameNightNotePresence(g, c, B);
  const withPlayer = c.attended.includes('player');
  at(1330); const after = gameNightNow(g);
  // an ordinary hangout is not a game night
  const h = __mk(); const [X, Y] = __ids(h);
  const c2 = createCommitment(h, { kind: 'hangout', startAbs: day * 1440 + 1200, endAbs: day * 1440 + 1320, roomId: 'living_room', invitedIds: [Y], proposerId: X, host: X }).record;
  h.meta.clock.day = day; h.meta.clock.minutes = 1210;
  return { before, during: !!during, act, cA, cB, noPlayer, withPlayer, after, plain: { now: gameNightNow(h), act: gameNightActivity(h, X) }, attended: c.attended };
})()`);
check('a game night is live only in its window; those it holds are "playing games"; the ledger records who was there, and you only if you were in the room; an ordinary hangout is not one', live.before === null && live.during && live.act.A === 'playing games' && live.act.B === 'playing games' && live.act.player === null && !live.noPlayer && live.withPlayer && live.attended.includes('mira') === false && live.after === null && live.plain.now === null && live.plain.act === null, JSON.stringify(live));

console.log('\n4. The morning after');
const pay = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  const day = 25; g.meta.clock.day = day + 1;
  const mk = (g0, gn, attended) => { const c = createCommitment(g0, { kind: 'hangout', startAbs: day * 1440 + 1200, endAbs: day * 1440 + 1320, roomId: 'game_room', invitedIds: attended.filter(x => x !== 'player'), proposerId: attended[0], host: attended[0] }).record; c.gameNight = gn; c.attended = attended.slice(); return c; };
  const feed = g.world.computer = g.world.computer || { apps: {} }; g.world.computer.apps = g.world.computer.apps || {}; g.world.computer.apps.social_feed = { posts: [], nextPostId: 1 };
  __gaming(g, A, 95); __gaming(g, B, 5); __gaming(g, C, 5);
  const c = mk(g, { gameId: 'pool', label: 'game night', occasion: null, tournament: false }, [A, B, C, 'player']);
  const moods0 = [A, B, C].map(id => g.npcs[id].mood || 0), aff0 = g.npcs[A].relPlayer.affection;
  const web0 = JSON.stringify(g.world.castWeb || {});
  const r = resolveGameNightsForDay(g, day + 1);
  const r2 = resolveGameNightsForDay(g, day + 1);
  const moods1 = [A, B, C].map(id => g.npcs[id].mood || 0);
  const lines = r.lines;
  const ev = g.world.events.find(e => e.type === 'game_night');
  // a night where only one roommate came and you did not
  const q = __mk(); const [Q] = __ids(q); q.meta.clock.day = day + 1;
  mk(q, { gameId: 'pool', label: 'game night', occasion: null, tournament: false }, [Q]);
  const qr = resolveGameNightsForDay(q, day + 1);
  // the arcade tournament
  const t = __mk(); const [T1, T2, T3] = __ids(t); t.meta.clock.day = day + 1; t.world.upgrades.game_room_setup = { tier: 'upgraded', condition: 100 };
  __gaming(t, T1, 95); __gaming(t, T2, 5); __gaming(t, T3, 5);
  mk(t, { gameId: 'arcade', label: 'the arcade tournament', occasion: 'new_years_eve', tournament: true }, [T1, T2, T3, 'player']);
  const tr = resolveGameNightsForDay(t, day + 1);
  const boards = ARCADE_IDS.filter(id => arcadeTable(t, id).length > 0).map(id => [id, arcadeTable(t, id).map(e => e.score)]);
  // not resolved before its day, only once
  const u = __mk(); const [U] = __ids(u); u.meta.clock.day = day; mk(u, { gameId: 'pool', label: 'game night', occasion: null, tournament: false }, [U, 'player']);
  const early = resolveGameNightsForDay(u, day);
  return { lines, again: r2.lines.length, moodUp: moods1.every((m, i) => m > moods0[i]), champUp: (moods1[0] - moods0[0]) > (moods1[1] - moods0[1]), affUp: g.npcs[A].relPlayer.affection > aff0, webMoved: JSON.stringify(g.world.castWeb || {}) !== web0, mem: JSON.stringify(g.npcs[B].memory).includes('game night with'), post: g.world.computer.apps.social_feed.posts.length, ev: ev && ev.npcId === A, evTmpl: ev && ev.template, quiet: qr.lines[0], tourney: tr.lines[0], boards, resolved: c.gameNight.resolved, early: early.lines.length };
})()`);
check('the night pays out once: a line naming who took it and who played, everyone a little happier (the champion more), a closer flat, a warmer you if you came, a memory, sometimes a boast on Chatter, an event', pay.lines.length === 1 && /took game night/.test(pay.lines[0]) && /Mira/.test(pay.lines[0]) && pay.again === 0 && pay.moodUp && pay.champUp && pay.affUp && pay.webMoved && pay.mem && pay.ev && pay.resolved, JSON.stringify({ l: pay.lines, a: pay.again, m: pay.moodUp, c: pay.champUp, aff: pay.affUp, w: pay.webMoved, mem: pay.mem, ev: pay.ev }));
check('a quiet night (one roommate, not you) says so; a night is not paid out before its day', /quiet/.test(pay.quiet) && pay.early === 0, JSON.stringify({ q: pay.quiet, e: pay.early }));
check('the arcade tournament: everyone posts a score on one machine, the best takes it, the scores go on the arcade board, and it names the game and the score', /won the arcade tournament with \d+ on /.test(pay.tourney) && /you were in the mix/.test(pay.tourney) && pay.boards.length === 1 && pay.boards[0][1].length >= 3, JSON.stringify({ t: pay.tourney, b: pay.boards }));

console.log('\n5. Thanksgiving: the game is on');
const tg = J(`(() => {
  const g = __mk(); const ids = __ids(g);
  const day = __dayWhere(d => occasionsOnDay(d).some(o => o.id === 'thanksgiving' && o.night === 1), 3);
  const orig = npcOccasionAffinity; npcOccasionAffinity = () => 0.9;
  const out = { lines: [] }; try { tvFilmNightsForDay(g, day, out); } finally { npcOccasionAffinity = orig; }
  const c = (g.world.commitments || []).find(x => x.watchParty && x.watchParty.film && x.watchParty.film.kind === 'big_game');
  let room = null;
  if (c) { g.meta.clock.day = day; g.meta.clock.minutes = c.startAbs % 1440 + 5; room = tvRoomLine(g, 'living_room'); }
  return { line: out.lines.find(l => /big game/.test(l)), started: c && c.startAbs % 1440, title: c && c.watchParty.film.title, room };
})()`);
check('Thanksgiving books the big game on the TV (a film night): an invitation, a title, and a loud room line, not a dim one', /big game on tonight/.test(tg.line) && tg.started === 1050 && /flat is very loud/.test(tg.room) && !/dim/.test(tg.room), JSON.stringify(tg));

console.log('\n6. Wiring and R1');
{
  const gn = srcOf('gamenight.js'), sim = srcOf('sim.js'), ui = srcOf('ui.js'), games = srcOf('games.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), loader = srcOf('../dev/verify/loadgame.js');
  check('gamenight.js is loaded by index.html and the verify loader, never uses Math.random (everything seeded), and the rollover, the tick ledger, the activity binding and the prompt are wired', /srcfiles\/gamenight\.js\?v=\d+/.test(html) && /'gamenight\.js'/.test(loader) && !/Math\.random/.test(gn) && /processGameNightDay\(currentGameState, day\)/.test(ui) && /gameNightActivity\(gameState, id\)/.test(sim) && /gameNightNotePresence\(gameState, gnc, id\)/.test(sim) && /gnPairPromptLine\(gs, npcId\)/.test(games));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([GAMENIGHT_TUNING, TV_TUNING.films.big_game])');
  const authored = gn.replace(/\.bible|bible\?/g, '');
  check('R1: no religion in the game-night tables', !vocab.test(T) && !vocab.test(authored), (T.match(vocab) || authored.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
