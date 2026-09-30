// ===== SECTION: GAMENIGHT =====
// Game Room Phases 10–11 (game-room-overhaul-plan.md D5, D15; 0.14.5): the house plays without you,
// and gathers to play. Three things:
//   1. Roommates play each other, offscreen. Now and then two of them have a game of pool, darts or
//      the console, decided by their skills (seeded), and the flat hears about it: "Mira beat Jonah at
//      pool again. He wants a rematch." A rivalry builds, quietly, and shows in conversation.
//   2. A weekly game night: a game-loving roommate books the game room on a set evening (a real 'hangout'
//      commitment, marked `gameNight`), everyone invited comes and plays, and the next morning it pays
//      out — who took the night, a closer flat, a warmer you if you came.
//   3. Holiday nights (D15): Lantern Nights are card nights, Midwinter a board-game night, New Year's Eve
//      an arcade tournament; Thanksgiving's "the game's on" is a TV film night (tv.js). Same machinery.
//
// World state: world.games.pairs[key] = { [idA]: wins, [idB]: wins, last: { winner, loser, gameId, day, streak } }
// and world.games.nightDay (the last weekly night booked). Everything is derived or seeded (R5/R6).

const GAMENIGHT_TUNING = {
  room: 'game_room',
  // Roommates on their own: the chance a given day has a match, what they can play, the mood it leaves.
  roommate: { chance: 0.4, games: ['pool', 'darts', 'console'], winMood: 0.04, loseMood: -0.03, closeBond: 0.01, soreTension: 0.02, soreVolatility: 0.2, blowoutGap: 0.35, keepPairs: 12 },
  // The weekly night.
  weekly: { weekday: 5, startMinute: 1200, minutes: 120, cooldownDays: 6, games: ['pool', 'darts', 'console'], minFree: 2 },
  // Holiday nights.
  holidays: {
    lantern_nights: { label: 'the card night', games: ['poker', 'blackjack'], startMinute: 1230, minutes: 120, hostAffinity: 0.3 },
    midwinter: { label: 'the board-game night', games: ['boardgame'], startMinute: 1290, minutes: 90, hostAffinity: 0.3 },
    new_years_eve: { label: 'the arcade tournament', games: ['arcade'], startMinute: 1230, minutes: 150, hostAffinity: 0.3, tournament: true },
  },
  // What a night pays.
  night: { attendMood: 0.06, champMood: 0.04, bond: 0.03, playerAffection: 0.03, playerMood: 0.08, factImportance: 0.4, postChance: 0.6, maxMatches: 4 },
  lines: {
    pair: {
      first: ['{name} beat {other} at {game}.', '{name} took {other} at {game}, fair and square.'],
      again: ['{name} beat {other} at {game} again. {other} wants a rematch.', '{name} beat {other} at {game} again. {other} is already asking for another go.'],
      close: ['{name} edged {other} at {game}, by a whisker.', '{name} and {other} played {game} until the last shot, and {name} took it.'],
      sore: ['{name} thrashed {other} at {game}. {other} is not taking it well.'],
    },
    invite: { weekly: '{name} is hosting game night tonight at {time} in the game room.', holiday: '{name} is putting on {label} tonight at {time} in the game room.' },
    payoff: {
      champ: '{champ} took game night. {names} played until late.',
      champYou: '{champ} took game night, though you gave them a run. {names} played until late.',
      youChamp: 'You took game night: {names} played until late, and you were on top.',
      quiet: 'Game night was just {names}, and a quiet one.',
      arcade: '{champ} won the arcade tournament with {score} on {game}. {names} took turns until midnight.',
      arcadeYou: '{champ} won the arcade tournament with {score} on {game}, and you were in the mix. {names} took turns until midnight.',
    },
    fact: 'Played {label} with {names}.',
    post: ['Game night: won. Bow before me.', 'Took game night. Ask me how.', 'Somebody has to be the champion of this flat, and it is me.'],
    prompt: { keeps: '{name} keeps losing to {other} at {game} and wants a rematch.', leads: '{name} has been beating {other} at {game} lately.' },
  },
};

// --- Roommates playing each other (D5) -----------------------------------------------------------

function gnState(gs) {
  const g = gamesState(gs);
  if (!g.pairs || typeof g.pairs !== 'object') g.pairs = {};
  return g;
}

function gnHash01(...parts) { return hashStr(parts.join('|')) / 4294967296; }

function gnName(gs, id) { return gs?.npcs?.[id]?.bible?.name || 'Someone'; }

function gnFill(t, vars) { return String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)); }

function gnPick(list, ...salt) { return list[hashStr(salt.join('|')) % list.length]; }

function gnResidents(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident').sort();
}

function gnFree(gs, id, day) {
  const plan = typeof holidayWorkPlan === 'function' ? holidayWorkPlan(gs.npcs[id], day) : null;
  return !(plan && plan.works);
}

function gnPairKey(a, b) { return [a, b].sort().join('|'); }

// The chance `a` beats `b` at `gameId`: the same logistic as the player's, on their two skills. Pure.
function gnWinChance(gs, a, b, gameId) {
  const T = GAMES_TUNING;
  const d = gameSkillOf(gs, a, gameId) - gameSkillOf(gs, b, gameId);
  return Math.max(T.minWin, Math.min(T.maxWin, 1 / (1 + Math.exp(-d * T.slope))));
}

// Whether the game room can host a game today: the setup works, and there is gear.
function gnRoomWorks(gs) {
  return typeof isFacilityFunctional === 'function' ? isFacilityFunctional(gs, GAMES_TUNING.facility) : true;
}

// One offscreen match between two residents. Mutates the pair's record, both moods, the cast web and the
// event stream. Returns the line (or null).
function gnRoommateMatch(gs, a, b, gameId, day, roll) {
  const R = GAMENIGHT_TUNING.roommate;
  const g = gnState(gs);
  const key = gnPairKey(a, b);
  const pA = gnWinChance(gs, a, b, gameId);
  const aWins = roll < pA;
  const winner = aWins ? a : b, loser = aWins ? b : a;
  const pWin = aWins ? pA : 1 - pA;
  const rec = g.pairs[key] || (g.pairs[key] = { [a]: 0, [b]: 0, last: null });
  rec[winner] = (rec[winner] || 0) + 1;
  const again = rec.last && rec.last.winner === winner && rec.last.gameId === gameId;
  const streak = again ? (rec.last.streak || 1) + 1 : 1;
  const gap = Math.abs(gameSkillOf(gs, winner, gameId) - gameSkillOf(gs, loser, gameId));
  const closeGame = gap < 0.08 && pWin < 0.62;
  const loserNpc = gs.npcs[loser];
  const sore = (loserNpc?.bible?.temperament?.volatility || 0) >= R.soreVolatility && pWin >= 0.7;   // a walkover, and they mind
  rec.last = { winner, loser, gameId, day, streak };
  const label = GAME_DEFS[gameId].phrase || GAME_DEFS[gameId].label.toLowerCase();
  const pool = sore ? GAMENIGHT_TUNING.lines.pair.sore : again ? GAMENIGHT_TUNING.lines.pair.again : closeGame ? GAMENIGHT_TUNING.lines.pair.close : GAMENIGHT_TUNING.lines.pair.first;
  const text = gnFill(gnPick(pool, key, day, gameId, 'pl'), { name: '{name}', other: '{other}', game: label });
  // the moods, and what it does between them
  for (const [id, delta] of [[winner, R.winMood], [loser, sore ? R.loseMood - 0.02 : R.loseMood]]) {
    const n = gs.npcs[id]; if (!n) continue;
    gs.npcs[id] = { ...n, mood: Math.max(-1, Math.min(1, (n.mood || 0) + delta)) };
  }
  let web = gs.world.castWeb || {};
  if (closeGame) { web = applyNpcToNpcDelta(web, a, b, { affection: R.closeBond }); web = applyNpcToNpcDelta(web, b, a, { affection: R.closeBond }); }
  if (sore) web = applyNpcToNpcDelta(web, loser, winner, { tension: R.soreTension });
  gs.world.castWeb = web;
  const events = gs.world.events || (gs.world.events = []);
  events.push({ day, tick: 44, roomId: GAMENIGHT_TUNING.room, npcId: winner, type: 'roommate_game', moodDelta: 0, importance: MEMORY_IMPORTANCE.social,
    data: { other: loser, game: gameId, streak }, template: text, seenByPlayer: false });
  // keep the record small
  const keys = Object.keys(g.pairs);
  if (keys.length > R.keepPairs) for (const k of keys.sort((x, y) => (g.pairs[x].last?.day || 0) - (g.pairs[y].last?.day || 0)).slice(0, keys.length - R.keepPairs)) delete g.pairs[k];
  return text;
}

// The daily pass: maybe one match between two free residents, on a game the room can host. Deterministic.
function processRoommateGamesForDay(gs, day) {
  const R = GAMENIGHT_TUNING.roommate;
  if (!gs?.world || !gnRoomWorks(gs)) return null;
  if (gnHash01(gs.meta?.seed, day, 'rmgame') >= R.chance) return null;
  const free = gnResidents(gs).filter(id => gnFree(gs, id, day));
  if (free.length < 2) return null;
  const pick = (salt, n) => Math.floor(gnHash01(gs.meta?.seed, day, salt) * n);
  const a = free[pick('a', free.length)];
  const rest = free.filter(id => id !== a);
  const b = rest[pick('b', rest.length)];
  const gameId = R.games[pick('g', R.games.length)];
  return gnRoommateMatch(gs, a, b, gameId, day, gnHash01(gs.meta?.seed, day, 'roll'));
}

// The conversation prompt: who is beating whom, among the flat. Pure.
function gnPairPromptLine(gs, npcId) {
  const g = gamesRead(gs);
  if (!g || !g.pairs) return null;
  let best = null;
  for (const [key, rec] of Object.entries(g.pairs)) {
    const ids = key.split('|');
    if (!ids.includes(npcId) || !rec.last) continue;
    if (!best || rec.last.day > best.rec.last.day) best = { key, rec };
  }
  if (!best) return null;
  const { winner, loser, gameId, streak } = best.rec.last;
  const P = GAMENIGHT_TUNING.lines.prompt;
  const label = GAME_DEFS[gameId].phrase || GAME_DEFS[gameId].label.toLowerCase();
  if (npcId === loser) return `[Games]: ${gnFill(P.keeps, { name: gnName(gs, npcId), other: gnName(gs, winner), game: label })}`;
  return `[Games]: ${gnFill(P.leads, { name: gnName(gs, npcId), other: gnName(gs, loser), game: label })}${streak > 1 ? ` (${streak} in a row)` : ''}`;
}

// --- Game night (weekly, and the holidays') --------------------------------------------------------

// The live game-night commitment (a hangout in the game room marked `gameNight`), or null.
function gameNightNow(gs) {
  const clock = gs?.meta?.clock;
  if (!clock) return null;
  const now = clockToAbsolute(clock);
  return (gs.world?.commitments || []).find(c => c && c.gameNight && c.status === 'scheduled' && now >= c.startAbs && now < c.endAbs) || null;
}

// What someone at a live game night is doing: playing games (sim.js binds it). Null otherwise.
function gameNightActivity(gs, npcId) {
  if (typeof activeCommitmentFor !== 'function') return null;
  const c = activeCommitmentFor(npcId, gs);
  return c && c.gameNight ? 'playing games' : null;
}

// sim.js's attendance ledger: whoever is physically there and awake, and you if you are in the room.
function gameNightNotePresence(gs, c, npcId) {
  if (!c || !c.gameNight) return;
  const a = Array.isArray(c.attended) ? c.attended : (c.attended = []);
  if (npcId && !a.includes(npcId)) a.push(npcId);
  if (gs?.player?.location === c.roomId && !a.includes('player')) a.push('player');
}

function gnTime(minute) {
  const h = Math.floor(minute / 60), m = minute % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function gnBook(gs, day, host, spec, gameNight) {
  if (typeof createCommitment !== 'function') return null;
  const startAbs = day * 1440 + spec.startMinute;
  const invited = gnResidents(gs).filter(id => id !== host);
  const made = createCommitment(gs, { kind: 'hangout', startAbs, endAbs: startAbs + spec.minutes, roomId: GAMENIGHT_TUNING.room, invitedIds: invited, proposerId: host, host });
  if (!made || !made.record) return null;
  made.record.gameNight = gameNight;
  return made.record;
}

// Books tonight's game night if it is the weekly evening or a holiday's. Returns { lines }.
function processGameNightsForDay(gs, day) {
  const out = { lines: [] };
  if (!gs?.world || !gnRoomWorks(gs) || typeof getWeekday !== 'function') return out;
  const g = gnState(gs);
  const W = GAMENIGHT_TUNING.weekly;
  const free = gnResidents(gs).filter(id => gnFree(gs, id, day));
  if (free.length < W.minFree) return out;
  const gaming = (id) => {
    const i = (gs.npcs[id].bible?.interests || []).find(x => x && x.name === 'gaming');
    return i && typeof i.skill === 'number' ? i.skill : 0;
  };
  const byGaming = free.slice().sort((a, b) => (gaming(b) - gaming(a)) || (a < b ? -1 : 1));
  // a holiday's night first
  let booked = false;
  if (typeof occasionsOnDay === 'function') {
    for (const o of occasionsOnDay(day)) {
      const spec = GAMENIGHT_TUNING.holidays[o.id];
      if (!spec || o.night !== 1) continue;
      const aff = (id) => (typeof npcOccasionAffinity === 'function' ? npcOccasionAffinity(gs.npcs[id], o.id) : 1);
      const hosts = free.filter(id => aff(id) >= spec.hostAffinity).sort((a, b) => (aff(b) - aff(a)) || (a < b ? -1 : 1));
      if (!hosts.length) continue;
      const host = hosts[0];
      const gameId = spec.games[hashStr(`${o.id}|${getYear(day)}`) % spec.games.length];
      const rec = gnBook(gs, day, host, spec, { gameId, label: spec.label, occasion: o.id, tournament: !!spec.tournament });
      if (rec) { out.lines.push(gnFill(GAMENIGHT_TUNING.lines.invite.holiday, { name: gnName(gs, host), label: spec.label, time: gnTime(spec.startMinute) })); booked = true; }
    }
  }
  // then the weekly one (not on a holiday's night, not twice in a week)
  if (!booked && getWeekday(day) === W.weekday && !(typeof g.nightDay === 'number' && day - g.nightDay < W.cooldownDays)) {
    const host = byGaming[0];
    const gameId = W.games[hashStr(`${host}|${day}|night`) % W.games.length];
    const rec = gnBook(gs, day, host, W, { gameId, label: 'game night', occasion: null, tournament: false });
    if (rec) { g.nightDay = day; out.lines.push(gnFill(GAMENIGHT_TUNING.lines.invite.weekly, { name: gnName(gs, host), time: gnTime(W.startMinute) })); }
  }
  return out;
}

// The rollover after: who took the night, and what it did. Reads the attendance ledger. Returns { lines }.
function resolveGameNightsForDay(gs, day) {
  const out = { lines: [] };
  const N = GAMENIGHT_TUNING.night;
  for (const c of gs.world?.commitments || []) {
    if (!c || !c.gameNight || c.gameNight.resolved || typeof commitmentDay !== 'function' || commitmentDay(c) !== day - 1) continue;
    c.gameNight.resolved = true;
    const gn = c.gameNight;
    const attended = (Array.isArray(c.attended) ? c.attended : []).filter(id => id !== 'player' && gs.npcs[id]);
    const playerCame = Array.isArray(c.attended) && c.attended.includes('player');
    if (!attended.length) continue;
    const names = joinNames(gs, attended.concat(playerCame ? [] : []));
    let champ = null, score = 0, gameLabel = '';
    if (gn.tournament && typeof arcadeNpcWeekScore === 'function' && gn.gameId === 'arcade') {
      // The arcade tournament: everyone's score on one machine tonight (the model player, seeded), entered on the board.
      const gid = ARCADE_IDS[hashStr(`${gn.occasion}|${day}|game`) % ARCADE_IDS.length];
      gameLabel = ARCADE_GAMES[gid].label;
      let best = -1;
      for (const id of attended) {
        const sc = arcadeModelScore(gid, arcadeNpcSkill(gs, id, gid, day), seededRng(gs.meta?.seed, `nye_${id}_${day}`));
        arcadeRecord(gs, gid, id, sc, day - 1);
        if (sc > best) { best = sc; champ = id; }
      }
      score = best;
    } else {
      // A round robin among the roommates (a few matches), on the night's game (or the weekly pick).
      const gameId = ['pool', 'darts', 'console'].includes(gn.gameId) ? gn.gameId : 'console';
      const tally = {}; for (const id of attended) tally[id] = 0;
      let matches = 0;
      for (let i = 0; i < attended.length && matches < N.maxMatches; i++) for (let j = i + 1; j < attended.length && matches < N.maxMatches; j++) {
        const a = attended[i], b = attended[j];
        const win = gnHash01(gs.meta?.seed, day, a, b, 'night') < gnWinChance(gs, a, b, gameId) ? a : b;
        tally[win] += 1; matches += 1;
      }
      champ = attended.slice().sort((x, y) => (tally[y] - tally[x]) || (gnHash01(gs.meta?.seed, day, x, 'tie') - gnHash01(gs.meta?.seed, day, y, 'tie')))[0];
    }
    // The payoff.
    for (const id of attended) {
      let n = { ...gs.npcs[id], mood: Math.max(-1, Math.min(1, (gs.npcs[id].mood || 0) + N.attendMood + (id === champ ? N.champMood : 0))) };
      n = addMemoryFact(n, { text: gnFill(GAMENIGHT_TUNING.lines.fact, { label: gn.label, names: joinNames(gs, attended.filter(x => x !== id)) || 'everyone' }), day: day - 1, importance: N.factImportance, category: 'relationship' });
      if (playerCame) n = applyRelDelta(n, { affection: N.playerAffection }, undefined);
      gs.npcs[id] = n;
    }
    let web = gs.world.castWeb || {};
    for (let i = 0; i < attended.length; i++) for (let j = i + 1; j < attended.length; j++) {
      web = applyNpcToNpcDelta(web, attended[i], attended[j], { affection: N.bond });
      web = applyNpcToNpcDelta(web, attended[j], attended[i], { affection: N.bond });
    }
    gs.world.castWeb = web;
    if (playerCame && gs.player && typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, N.playerMood, day - 1);
    const L = GAMENIGHT_TUNING.lines.payoff;
    const vars = { champ: gnName(gs, champ), names, score, game: gameLabel };
    out.lines.push(gnFill(gn.tournament ? (playerCame ? L.arcadeYou : L.arcade) : (attended.length + (playerCame ? 1 : 0) < 2 ? L.quiet : playerCame ? L.champYou : L.champ), vars));
    if (gnHash01(c.id, 'gnpost') < N.postChance) {
      const feed = gs.world?.computer?.apps?.social_feed;
      if (feed && Array.isArray(feed.posts) && typeof feed.nextPostId === 'number') {
        feed.posts.push({ id: 'post_' + (feed.nextPostId++), author: champ, text: gnPick(GAMENIGHT_TUNING.lines.post, c.id, 'p'), likes: [], comments: [], day: day - 1, eventRef: null, visibility: 'public', media: null });
      }
    }
    (gs.world.events || (gs.world.events = [])).push({ day: day - 1, tick: 47, roomId: c.roomId, npcId: champ, type: 'game_night', moodDelta: 0, importance: MEMORY_IMPORTANCE.social,
      data: { label: gn.label }, template: `{name} took ${gn.label}.`, seenByPlayer: false });
  }
  return out;
}

function joinNames(gs, ids) {
  const names = ids.map(id => gnName(gs, id));
  return names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The rollover hook (ui.js): the payoff for last night, the roommates' own games, tonight's booking.
function processGameNightDay(gs, day) {
  const lines = [];
  for (const l of resolveGameNightsForDay(gs, day).lines) lines.push(l);
  processRoommateGamesForDay(gs, day);
  for (const l of processGameNightsForDay(gs, day).lines) lines.push(l);
  return { lines };
}
// ===== /SECTION: GAMENIGHT =====
