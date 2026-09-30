// ===== SECTION: GAMES =====
// The Game Room's match spine (game-room-overhaul-plan.md Phase 1, D1–D4, D7; 0.14.5).
// A match is a first-class record: { id, gameId, players: ['player', npcId], stake, winner, grade,
// day }. This file is the only place that starts one, resolves it and applies what follows —
// mood, the rivalry on the relationship, a memory, the player's 'games' skill, and the stake
// (bragging rights, a real chore, or a capped IOU through money.js). A game module only produces a
// result; Phase 1's is the abstract resolver below, so "challenge Mira to pool" works end to end
// before any minigame exists, and every later game plugs into gameApplyMatch unchanged.
//
// world.games = {
//   history[]        the last GAMES_TUNING.historyKeep matches
//   rivals[npcId]    { [gameId]: { w, l } } — the player's wins and losses against them
//   pending          { npcId, gameId, playerWon, grade, abs } — the follow-up window, or null
//   iou[]            { day, amount } — IOUs staked, for the weekly cap
//   count            matches played (a seed salt, never a rng position)
// }
// Everything is derived or seeded (R5/R6): a reload replays the same result.

function gamesState(gs) {
  const w = gs.world || (gs.world = {});
  const g = (w.games && typeof w.games === 'object') ? w.games : (w.games = {});
  if (!Array.isArray(g.history)) g.history = [];
  if (!g.rivals || typeof g.rivals !== 'object') g.rivals = {};
  if (!Array.isArray(g.iou)) g.iou = [];
  if (typeof g.count !== 'number') g.count = 0;
  if (g.pending === undefined) g.pending = null;
  return g;
}

function gamesRead(gs) {
  const g = gs?.world?.games;
  return (g && typeof g === 'object') ? g : null;
}

function gameDef(id) { return GAME_DEFS[id] || null; }

function gameHash01(...parts) { return hashStr(parts.join('|')) / 4294967296; }

function gameNpcName(gs, id) { return gs?.npcs?.[id]?.bible?.name || 'Someone'; }

function gameFill(t, vars) {
  return String(t).replace(/\{(\w+)\}|\$\{(\w+)\}/g, (m, a, b) => {
    const k = a || b;
    if (vars[k] === undefined) return m;
    return m.startsWith('$') ? '$' + vars[k] : vars[k];
  });
}

function gamePick(list, ...salt) {
  return list[hashStr(salt.join('|')) % list.length];
}

// --- What can be played here ------------------------------------------------------------------

// Games whose gear is in this room (an anchor object) or in your bag (the board game). Pure.
function gameOptions(gs, roomId) {
  const objs = Object.values(gs?.objects?.[`room_${roomId}`] || {});
  const bag = gs?.player?.inventory || [];
  return GAME_IDS.filter(id => {
    const d = GAME_DEFS[id];
    if (d.anchors.length && d.anchors.some(a => objs.some(o => o && o.defId === a))) return true;
    if (d.item && bag.some(s => s && s.defId === d.item && (s.qty || 1) > 0)) return true;
    return false;
  });
}

// --- Skill and the result ---------------------------------------------------------------------

// 0..1. Pure and derived: the same save always reproduces the same players.
function gameSkillOf(gs, who, gameId) {
  const T = GAMES_TUNING;
  if (who === 'player') {
    const lvl = typeof skillLevel === 'function' ? skillLevel(gs.player, 'games') : 0;
    return Math.min(1, T.playerBase + T.playerPerLevel * lvl);
  }
  const npc = gs?.npcs?.[who];
  if (!npc) return T.npcBase;
  const tag = GAME_DEFS[gameId]?.skillTag;
  const interest = (npc.bible?.interests || []).find(i => i && i.name === tag);
  const skill = interest && typeof interest.skill === 'number' ? Math.max(0, Math.min(100, interest.skill)) / 100 : 0;
  const seed = String(npc.bible?.genSeed ?? npc.genSeed ?? who);
  const apt = (gameHash01(seed, gameId, 'aptitude') * 2 - 1) * T.aptitude;
  return Math.max(0.05, Math.min(1, T.npcBase + T.npcInterest * skill + apt));
}

function gameWinChance(gs, npcId, gameId) {
  const T = GAMES_TUNING;
  const d = gameSkillOf(gs, 'player', gameId) - gameSkillOf(gs, npcId, gameId);
  const p = 1 / (1 + Math.exp(-d * T.slope));
  return Math.max(T.minWin, Math.min(T.maxWin, p));
}

// How sore a loser they are (0..1): volatility and assertiveness against warmth. Pure.
function gameSoreness(npc) {
  const t = npc?.bible?.temperament || {};
  return Math.max(0, Math.min(1, 0.3 + 0.5 * (t.volatility || 0) + 0.25 * (t.assertiveness || 0) - 0.25 * (t.warmth || 0)));
}

function gameWarmth(npc) {
  return npc?.bible?.temperament?.warmth || 0;
}

// --- Stakes -----------------------------------------------------------------------------------

function gameChoreAvailable(gs) {
  return typeof npcChoreOptions === 'function' && npcChoreOptions(gs).length > 0;
}

function gameIouThisWeek(gs, day) {
  const g = gamesRead(gs);
  return (g?.iou || []).filter(r => day - r.day < 7).reduce((s, r) => s + r.amount, 0);
}

// Would they agree to this stake? Their fondness for you, less a bad temper, plus a seeded wobble.
// Pure and deterministic per (save, day, person, stake). Returns { ok, reason }.
function gameStakeAgrees(gs, npcId, stakeId, amount) {
  const T = GAMES_TUNING.stakes;
  if (stakeId === 'brag') return { ok: true };
  const npc = gs?.npcs?.[npcId];
  if (!npc) return { ok: false, reason: 'away' };
  const day = gs.meta?.clock?.day ?? 1;
  const rel = npc.relPlayer || {};
  const score = (rel.affection || 0) * T.agreeAffection - (rel.tension || 0) * T.agreeTension
    + (gameHash01(gs.meta?.seed, day, npcId, stakeId, amount || 0, 'stake') * 2 - 1) * T.agreeNoise;
  const min = stakeId === 'chore' ? T.chore.minAgree : T.iou.minAgree;
  if (stakeId === 'chore' && !gameChoreAvailable(gs)) return { ok: false, reason: 'nothing' };
  if (stakeId === 'iou' && gameIouThisWeek(gs, day) + (amount || 0) > T.iou.weekCap) return { ok: false, reason: 'cap' };
  return score >= min ? { ok: true } : { ok: false, reason: 'no' };
}

// The rows the stake picker shows for one opponent. Pure.
function gameStakeOptions(gs, npcId) {
  const T = GAMES_TUNING.stakes;
  const rows = [{ id: 'brag', stakeId: 'brag', amount: 0, label: 'Just for bragging rights', note: '', ok: true }];
  const chore = gameStakeAgrees(gs, npcId, 'chore');
  rows.push({ id: 'chore', stakeId: 'chore', amount: 0, label: T.chore.label, ok: chore.ok, note: chore.ok ? '' : (chore.reason === 'nothing' ? 'nothing needs doing' : 'they would rather not') });
  for (const a of T.iou.amounts) {
    const r = gameStakeAgrees(gs, npcId, 'iou', a);
    rows.push({ id: `iou:${a}`, stakeId: 'iou', amount: a, label: gameFill(T.iou.label, { amount: a }), ok: r.ok, note: r.ok ? '' : (r.reason === 'cap' ? 'too much this week' : 'they would rather not') });
  }
  return rows;
}

// --- Planning a match -------------------------------------------------------------------------
// Decided once in prepare, so the effect and the line cannot disagree. Pure: the same save, day and
// count always play the same match.
function gamePlanMatch(gs, gameId, npcId, stakeId, amount, played, mode) {
  const d = gameDef(gameId);
  const npc = gs?.npcs?.[npcId];
  if (!d || !npc) return null;
  const T = GAMES_TUNING;
  const g = gamesRead(gs);
  const clock = gs.meta.clock;
  const rng = seededRng(gs.meta?.seed, `match_${clock.day}_${clock.minutes}_${gameId}_${npcId}_${g?.count || 0}`);
  const pWin = gameWinChance(gs, npcId, gameId);
  let playerWon = rng() < pWin;
  // The margin: how far the roll landed from a coin flip, told as how close it was.
  const r2 = rng();
  let grade = r2 < T.close ? 'close' : r2 > T.blowout ? 'blowout' : 'normal';
  let summary = null, minutes = d.minutes;
  // A played game (a minigame the player just finished) or a modelled one (darts, headless: both
  // sides throw like their skill) decides the result instead of the abstract roll.
  if (!played && gameId === 'darts' && typeof dartsSimulate === 'function') {
    const m = mode || '301';
    const st = dartsSimulate(seededRng(gs.meta?.seed, `darts_${clock.day}_${clock.minutes}_${npcId}_${g?.count || 0}`), m, gameSkillOf(gs, 'player', gameId), gameSkillOf(gs, npcId, gameId));
    played = dartsResult(st, gameNpcName(gs, npcId));
    played.minutes = DARTS_TUNING.modes[m].minutes;
  }
  // Pool, headless: a whole 8-ball game played out by the physics, both sides shooting like their skill.
  if (!played && gameId === 'pool' && typeof poolSimulate === 'function') {
    const pst = poolNew(seededRng(gs.meta?.seed, `poolrack_${clock.day}_${clock.minutes}_${npcId}_${g?.count || 0}`));
    poolSimulate(pst, seededRng(gs.meta?.seed, `pool_${clock.day}_${clock.minutes}_${npcId}_${g?.count || 0}`), gameSkillOf(gs, 'player', gameId), gameSkillOf(gs, npcId, gameId));
    played = poolResult(pst, gameNpcName(gs, npcId));
  }
  // Blackjack with a roommate dealing: modelled headless (basic strategy, a flat bet, the dealer's rule).
  if (!played && gameId === 'blackjack' && typeof bjSimulate === 'function') {
    const bst = bjNew({});
    bjSimulate(bst, seededRng(gs.meta?.seed, `bj_${clock.day}_${clock.minutes}_${npcId}_${g?.count || 0}`), 0);
    played = bjNightResult(bst, gameNpcName(gs, npcId));
    played.iouAmount = bjIouAmount(bst, amount);
  }
  if (played) { playerWon = !!played.playerWon; grade = played.grade || 'normal'; summary = played.summary || null; if (played.minutes) minutes = played.minutes; }
  const stake = stakeId === 'chore' && gameStakeAgrees(gs, npcId, 'chore').ok ? 'chore'
    : stakeId === 'iou' && gameStakeAgrees(gs, npcId, 'iou', amount).ok ? 'iou' : 'brag';
  // A game that scales the IOU by how far the chips moved reports its own amount (blackjack).
  const iouAmount = stake === 'iou' ? (played && played.iouAmount != null ? played.iouAmount : amount) : 0;
  return { gameId, npcId, stakeId: stake === 'iou' && !(iouAmount > 0) ? 'brag' : stake, amount: iouAmount, playerWon, grade, pWin,
    minutes, summary, played: !!played, name: gameNpcName(gs, npcId), label: d.label, seed: `${clock.day}_${clock.minutes}_${g?.count || 0}` };
}

// The line for a planned match. Pure.
function gameMatchNarration(gs, plan) {
  if (!plan) return null;
  const d = gameDef(plan.gameId);
  const vars = { name: plan.name };
  const side = plan.playerWon ? d.win : d.lose;
  const pool = side[plan.grade === 'close' ? 'close' : plan.grade === 'blowout' ? 'blowout' : 'close'];
  const parts = [gamePick(d.intro, plan.seed, plan.gameId, 'intro').replace('{name}', plan.name)];
  parts.push(plan.summary ? plan.summary : gameFill(gamePick(pool, plan.seed, plan.gameId, 'res'), vars));
  const S = GAMES_TUNING.lines.settle;
  if (plan.stakeId === 'chore') parts.push(gameFill(plan.playerWon ? S.choreWon : S.choreLost, vars));
  else if (plan.stakeId === 'iou') parts.push(gameFill(plan.playerWon ? S.iouWon : S.iouLost, { ...vars, amount: plan.amount }));
  return parts.join(' ');
}

// --- Applying a match (the one writer) --------------------------------------------------------

function gameSettleChore(gs, doerId, day) {
  const opts = typeof npcChoreOptions === 'function' ? npcChoreOptions(gs) : [];
  if (!opts.length) return null;
  const choreId = opts[0].id;
  const label = opts[0].label.toLowerCase();
  if (doerId === 'player') {
    const p = npcChoreParse(choreId);
    if (!p) return null;
    const roomId = p.roomId || p.def.rooms(gs)[0];
    const lines = p.def.lines ? p.def.lines(gs, roomId) : [];
    if (lines.length) {
      const ctx = buildEffectContext(gs, [], [], {}, []);
      applyEffects(parseEffectDSL(lines.join('\n')), ctx);
    }
    if (p.def.run) p.def.run(gs, roomId);
    return label;
  }
  return typeof queueNpcChore === 'function' && queueNpcChore(gs, doerId, choreId, 'talk') ? label : null;
}

// Mutates. Called from the GAME_MATCH effect (and, once per roommate, from gameApplySession). `opts`:
// skipXp / skipPending / skipEvent / skipStake, for the session writer that does those once itself.
function gameApplyMatch(gs, plan, opts) {
  const o = opts || {};
  const T = GAMES_TUNING;
  const d = gameDef(plan.gameId);
  const npc = gs.npcs?.[plan.npcId];
  if (!d || !npc) return null;
  const g = gamesState(gs);
  const day = gs.meta.clock.day;
  const abs = clockToAbsolute(gs.meta.clock);
  g.count += 1;
  const sore = gameSoreness(npc);
  const npcSore = plan.playerWon && (npc.bible?.temperament?.volatility || 0) >= T.soreVolatility;
  // The record.
  const rec = { id: `match_${day}_${g.count}`, gameId: plan.gameId, players: ['player', plan.npcId], stake: plan.stakeId, amount: plan.amount || 0,
    winner: plan.playerWon ? 'player' : plan.npcId, grade: plan.grade, day };
  g.history.push(rec);
  if (g.history.length > T.historyKeep) g.history.splice(0, g.history.length - T.historyKeep);
  const r = (g.rivals[plan.npcId] || (g.rivals[plan.npcId] = {}));
  const t = (r[plan.gameId] || (r[plan.gameId] = { w: 0, l: 0 }));
  if (plan.playerWon) t.w++; else t.l++;
  // Skill.
  if (!o.skipXp && typeof awardSkillXp === 'function') awardSkillXp(gs.player, 'games', plan.playerWon ? T.playerXp.win : T.playerXp.lose, day, gs);
  // Them: mood, the rivalry, a memory.
  let next = npc;
  const moodDelta = plan.playerWon ? T.loseMood + (sore >= 0.5 ? T.soreExtra : 0) : T.winMood;
  next = { ...next, mood: Math.max(-1, Math.min(1, (next.mood || 0) + moodDelta)) };
  const deltas = {};
  if (plan.grade === 'close') { deltas.affection = T.closeAffection; deltas.respect = T.closeRespect; }
  if (plan.grade === 'blowout' && plan.playerWon && npcSore) deltas.tension = T.blowoutTension + T.soreTension;
  if (Object.keys(deltas).length) next = applyRelDelta(next, deltas, day);
  const gameLabel = d.label.toLowerCase();
  next = addMemoryFact(next, { text: plan.playerWon ? `Lost to the player at ${gameLabel}.` : `Beat the player at ${gameLabel}.`, day, importance: T.memoryImportance, category: 'relationship' });
  gs.npcs[plan.npcId] = next;
  // The stake.
  const lines = [];
  if (o.skipStake) { /* settled by the session */ } else if (plan.stakeId === 'chore') {
    const doer = plan.playerWon ? plan.npcId : 'player';
    const label = gameSettleChore(gs, doer, day);
    lines.push(label ? gameFill(T.lines.choreDone[doer === 'player' ? 'player' : 'npc'], { name: gameNpcName(gs, plan.npcId), chore: label }) : T.lines.choreNone);
  } else if (plan.stakeId === 'iou' && plan.amount > 0 && typeof adjustMoneyLedger === 'function') {
    adjustMoneyLedger(gs, plan.npcId, plan.playerWon ? 'npcOwes' : 'playerOwes', plan.amount);
    g.iou.push({ day, amount: plan.amount });
    lines.push(gameFill(plan.playerWon ? T.lines.iouWon : T.lines.iouLost, { name: gameNpcName(gs, plan.npcId), amount: plan.amount }));
  }
  // The player's mood is a plain need write in the verb's effects; the follow-up window opens.
  if (!o.skipPending) g.pending = { npcId: plan.npcId, gameId: plan.gameId, playerWon: plan.playerWon, grade: plan.grade, abs };
  if (!o.skipEvent) (gs.world.events || (gs.world.events = [])).push({ day, tick: getTickIndex(gs.meta.clock.minutes), roomId: gs.player.location, npcId: plan.npcId,
    type: 'game_match', moodDelta: 0, importance: MEMORY_IMPORTANCE.social, data: { game: plan.gameId, playerWon: plan.playerWon },
    template: gameFill(T.lines.event, { name: '{name}', game: gameLabel }), seenByPlayer: true });
  return { rec, lines };
}

// --- Nights with more than two seats (poker, Phase 4) -----------------------------------------
// A night at the card table is one session with everyone who is here: standings, not a single winner.
// It reports through the same spine: each roommate is a match against you (mood, the rivalry, a memory),
// XP is awarded once, and the stake settles across the table — an IOU by chips, a chore by finishing
// first or last. Everything is still decided in prepare (pokerNightResult, or the modelled night) and
// written once, by GAME_SESSION.

// The most a stake can be for a whole table: it has to be agreeable to everyone in the game. Pure.
function gameSessionStakeOptions(gs, npcIds) {
  const per = npcIds.map(id => gameStakeOptions(gs, id));
  return per[0].map((row, k) => {
    const bad = per.map(rows => rows[k]).find(r => !r.ok);
    return bad ? { ...row, ok: false, note: bad.note } : row;
  });
}

function gameNightNames(gs, ids) {
  const names = ids.map(id => gameNpcName(gs, id));
  return names.length <= 1 ? names[0] || 'them' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The plan for a night: `played` is what the table screen returned (pokerNightResult + iou shares), or
// nothing — then the night is modelled headless, every seat playing like themselves. Pure.
function gamePlanSession(gs, gameId, npcIds, stakeId, amount, played) {
  const d = gameDef(gameId);
  const ids = npcIds.filter(id => gs.npcs?.[id]);
  if (!d || !ids.length) return null;
  const g = gamesRead(gs);
  const clock = gs.meta.clock;
  const seedKey = `${clock.day}_${clock.minutes}_${g?.count || 0}`;
  const stake = stakeId === 'chore' && ids.every(id => gameStakeAgrees(gs, id, 'chore').ok) ? 'chore'
    : stakeId === 'iou' && ids.every(id => gameStakeAgrees(gs, id, 'iou', amount).ok) ? 'iou' : 'brag';
  const amt = stake === 'iou' ? amount : 0;
  if (!played && gameId === 'poker' && typeof pokerNew === 'function') {
    const styles = { player: { ...POKER_STYLE.base, tilt: 0 } };
    for (const id of ids) styles[id] = pokerStyleFor(gs.npcs[id]);
    const st = pokerNew(['player', ...ids]);
    pokerSimulate(st, seededRng(gs.meta?.seed, `night_${gameId}_${seedKey}`), styles);
    const names = {}; for (const id of ids) names[id] = gameNpcName(gs, id);
    played = pokerNightResult(st, 'player', names);
    played.iou = stake === 'iou' ? pokerIouShares(st, 'player', amt) : [];
  }
  if (!played) return null;
  const results = played.results || [];
  const rival = (results.slice().sort((a, b) => b.chips - a.chips)[0] || {}).npcId || ids[0];
  return { gameId, session: true, npcIds: ids, npcId: rival, stakeId: stake, amount: amt, playerWon: (played.net || 0) > 0, grade: (results.find(r => r.npcId === rival) || {}).grade || 'normal',
    results, iou: played.iou || [], place: played.place || 1, seats: played.seats || ids.length + 1, net: played.net || 0, summary: played.summary || null,
    minutes: played.minutes || d.minutes, played: true, name: gameNightNames(gs, ids), label: d.label, seed: seedKey, hands: played.hands || 0 };
}

// The line for a planned night. Pure.
function gameSessionNarration(gs, plan) {
  if (!plan) return null;
  const d = gameDef(plan.gameId);
  const S = GAMES_TUNING.lines.settle;
  const parts = [gamePick(d.intro, plan.seed, plan.gameId, 'intro').replace('{name}', plan.name)];
  if (plan.summary) parts.push(plan.summary);
  if (plan.stakeId === 'iou' && plan.iou.length) {
    const total = plan.iou.reduce((a, s) => a + s.amount, 0);
    parts.push(plan.net > 0 ? gameFill(S.nightIouWon, { amount: total }) : gameFill(S.nightIouLost, { amount: total }));
  } else if (plan.stakeId === 'chore') {
    if (plan.place === 1) parts.push(S.nightChoreWon);
    else if (plan.place === plan.seats) parts.push(S.nightChoreLost);
  }
  return parts.join(' ');
}

// Mutates: the GAME_SESSION effect. One match per roommate against you, XP once, then the stake.
function gameApplySession(gs, plan) {
  const T = GAMES_TUNING;
  const d = gameDef(plan.gameId);
  if (!d || !plan.results || !plan.results.length) return null;
  const g = gamesState(gs);
  const day = gs.meta.clock.day;
  const abs = clockToAbsolute(gs.meta.clock);
  plan.results.forEach((r, i) => {
    if (!gs.npcs?.[r.npcId]) return;
    gameApplyMatch(gs, { gameId: plan.gameId, npcId: r.npcId, stakeId: 'brag', amount: 0, playerWon: r.playerWon, grade: r.grade }, { skipXp: true, skipPending: true, skipEvent: i > 0 });
  });
  if (typeof awardSkillXp === 'function') awardSkillXp(gs.player, 'games', plan.place === 1 || plan.net > 0 ? T.playerXp.win : T.playerXp.lose, day, gs);
  const lines = [];
  if (plan.stakeId === 'iou' && typeof adjustMoneyLedger === 'function') {
    let total = 0;
    for (const s of plan.iou) {
      if (!gs.npcs?.[s.npcId] || !(s.amount > 0)) continue;
      adjustMoneyLedger(gs, s.npcId, plan.net > 0 ? 'npcOwes' : 'playerOwes', s.amount);
      total += s.amount;
    }
    if (total > 0) g.iou.push({ day, amount: total });
  } else if (plan.stakeId === 'chore') {
    const worst = plan.results.slice().sort((a, b) => a.chips - b.chips)[0];
    if (plan.place === 1 && worst) {
      const label = gameSettleChore(gs, worst.npcId, day);
      lines.push(label ? gameFill(T.lines.choreDone.npc, { name: gameNpcName(gs, worst.npcId), chore: label }) : T.lines.choreNone);
    } else if (plan.place === plan.seats) {
      const label = gameSettleChore(gs, 'player', day);
      lines.push(label ? gameFill(T.lines.choreDone.player, { name: '', chore: label }) : T.lines.choreNone);
    }
  }
  g.pending = { npcId: plan.npcId, gameId: plan.gameId, playerWon: plan.place === 1, grade: plan.grade, abs, multi: true };
  return { lines };
}

// --- The follow-up (D2's choice after): good game, gloat, rematch -----------------------------

function gamePendingNow(gs) {
  const p = gamesRead(gs)?.pending;
  if (!p) return null;
  const now = clockToAbsolute(gs.meta.clock);
  if (now - p.abs > GAMES_TUNING.followUpMinutes) return null;
  const npc = gs.npcs?.[p.npcId];
  if (!npc || npc.location !== gs.player.location) return null;
  return p;
}

// Which follow-up verbs are open: 'gracious' and 'rematch' always, 'gloat' only if you won.
function gameFollowUpOpen(gs, kind) {
  const p = gamePendingNow(gs);
  if (!p) return { ok: false, reason: 'Nothing to say about a game right now.' };
  if (kind === 'gloat' && !p.playerWon) return { ok: false, reason: 'Nothing to gloat about.' };
  if (kind === 'rematch' && p.multi) return { ok: false, reason: 'Deal another night from the table.' };
  return { ok: true, pending: p };
}

function gameFollowUpLine(gs, kind) {
  const p = gamePendingNow(gs);
  if (!p) return null;
  const F = GAMES_TUNING.lines.followUp;
  const npc = gs.npcs[p.npcId];
  const name = gameNpcName(gs, p.npcId);
  const sore = p.playerWon && (npc.bible?.temperament?.volatility || 0) >= GAMES_TUNING.soreVolatility;
  const tone = sore ? 'sore' : gameWarmth(npc) >= 0.2 ? 'warm' : 'cool';
  const seed = `${p.abs}|${kind}`;
  const you = gamePick(F[kind], seed, 'you');
  if (kind === 'rematch') return you;
  const reply = gameFill(gamePick(F[kind + 'Reply'][tone], seed, tone), { name });
  return `${you} ${reply}`;
}

// Mutates: the GAME_FOLLOWUP effect.
function gameApplyFollowUp(gs, kind) {
  const p = gamePendingNow(gs);
  if (!p) return;
  const F = GAMES_TUNING.lines.follow;
  const npc = gs.npcs[p.npcId];
  const day = gs.meta.clock.day;
  const sore = p.playerWon && (npc.bible?.temperament?.volatility || 0) >= GAMES_TUNING.soreVolatility;
  const warm = gameWarmth(npc) >= 0.2;
  let d = null;
  if (kind === 'gracious') d = { affection: F.graciousAffection, tension: F.graciousTension };
  else if (kind === 'gloat') d = sore ? { tension: F.gloatSoreTension, affection: F.gloatSoreAffection } : warm ? { affection: F.gloatWarmAffection } : { tension: F.gloatCoolTension };
  if (d) gs.npcs[p.npcId] = applyRelDelta(npc, d, day);
  if (kind !== 'rematch') gamesState(gs).pending = null;
}

// --- The conversation prompt ------------------------------------------------------------------

function gamesPromptLine(gs, npcId) {
  const g = gamesRead(gs);
  const r = g?.rivals?.[npcId];
  if (!r) return null;
  const name = gameNpcName(gs, npcId);
  const L = GAMES_TUNING.lines.prompt;
  let best = null;
  for (const [gameId, t] of Object.entries(r)) {
    const total = t.w + t.l;
    if (!best || total > best.total) best = { gameId, t, total };
  }
  if (!best || best.total < 1) return null;
  const label = gameDef(best.gameId).label.toLowerCase();
  let line = '[Games]: ';
  if (best.t.l > best.t.w) line += gameFill(L.beat, { name, n: best.t.l, s: best.t.l === 1 ? '' : 's', game: label });
  else if (best.t.w > best.t.l) line += gameFill(L.lost, { name, n: best.t.w, s: best.t.w === 1 ? '' : 's', game: label });
  else line += gameFill(L.level, { name, game: label });
  return line;
}
// ===== /SECTION: GAMES =====
