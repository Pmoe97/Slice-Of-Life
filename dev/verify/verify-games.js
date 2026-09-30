// Game Room, Phase 1 — the match spine (games.js, 0.14.5; game-room-overhaul-plan.md D1–D4, D7).
//
//   node dev/verify/verify-games.js
//
// What a room has to play; skill and the win chance (derived, monotone, off the rails); the stake
// (agreement is deterministic, capped, and refuses politely); a planned match (seeded — the same
// save plays the same match — and its line agrees with its result); what applying one writes (the
// record, the rivalry, mood, a memory, the games skill, the stake — a real chore, a real IOU); the
// follow-up (good game / gloat / rematch); the verbs through the real action registry; the prompt.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'skills.js', 'money.js',
    'defs.actions.js', 'actions.js', 'games.js', 'state.js', 'llm.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'game_room';
    g.world.events = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    for (const id of __ids(g)) {
      const n2 = g.npcs[id];
      n2.location = 'game_room'; n2.activity = 'idle'; n2.transit = null;
      n2.bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 };
      n2.relPlayer = { ...n2.relPlayer, affection: 0.4, tension: 0 };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __eff = (g, lines) => applyEffects(parseEffectDSL(Array.isArray(lines) ? lines.join('\\n') : lines), buildEffectContext(g, [], [], {}, []));
`);

console.log('\n0. Registration');
const reg = J(`(() => ({
  games: GAME_IDS.length, defs: GAME_IDS.every(id => GAME_DEFS[id].label && GAME_DEFS[id].minutes > 0 && GAME_DEFS[id].intro.length >= 2 && ['win', 'lose'].every(s => ['close', 'blowout'].every(k => GAME_DEFS[id][s][k].length >= 2))),
  skill: SKILL_IDS.includes('games'), noticeRow: !!SKILL_NOTICE_ROWS_SAFE(),
  verbs: ['game.challenge', 'game.rematch', 'game.gracious', 'game.gloat'].every(id => !!ACTION_DEFS[id]),
  old: !!ACTION_DEFS['self.play_games'],
  save: SAVE_KEYS.find(k => k.folder === 'world').keys.includes('games'), fallback: typeof WORLD_KEY_FALLBACKS.games === 'function',
  band: EVENT_IMPORTANCE.game_match === 'social' && EVENT_EMOTION.game_match === 'warmth',
  effects: ['GAME_MATCH', 'GAME_FOLLOWUP'].every(k => typeof effectDefFor === 'function' ? !!effectDefFor(k) : true),
}))()`.replace('SKILL_NOTICE_ROWS_SAFE()', '1'));
check('seven games, each with intros and the four result lines; the old Play Games survives (D7)', reg.games === 7 && reg.defs && reg.old, JSON.stringify(reg));
check('games is a skill; the verbs, the save key, its default and the event bands are registered', reg.skill && reg.verbs && reg.save && reg.fallback && reg.band, JSON.stringify(reg));

console.log('\n1. What a room has, and skill');
const opt = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const here = gameOptions(g, 'game_room');
  const kitchen = gameOptions(g, 'kitchen');
  g.player.inventory = [{ defId: 'board_game', qty: 1 }];
  const withBoard = gameOptions(g, 'kitchen');
  const p0 = gameWinChance(g, A, 'pool');
  g.player.skills = { games: 40 * 100 }; // level 10
  const p10 = gameWinChance(g, A, 'pool');
  const sk = gameSkillOf(g, A, 'pool');
  const a1 = gameSkillOf(g, A, 'pool'), a2 = gameSkillOf(g, A, 'darts');
  g.npcs[A].bible.interests = [{ name: 'gaming', skill: 90 }];
  const skilled = gameSkillOf(g, A, 'pool');
  return { here, kitchen, withBoard, p0, p10, bounded: p0 >= GAMES_TUNING.minWin && p10 <= GAMES_TUNING.maxWin, sk, differs: a1 !== a2, skilled, lower: skilled > a1 };
})()`);
check('a room offers what its gear allows (pool, darts, console); your bag adds the board game anywhere; a kitchen offers nothing', ['pool', 'darts', 'console'].every(x => opt.here.includes(x)) && opt.kitchen.length === 0 && opt.withBoard.includes('boardgame'), JSON.stringify(opt));
check('practise and you are likelier to win; the chance never leaves its rails; a roommate\'s aptitude differs by game and a gaming interest lifts it', opt.p10 > opt.p0 && opt.bounded && opt.differs && opt.lower, JSON.stringify(opt));

console.log('\n2. Stakes');
const st = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const rowsFond = gameStakeOptions(g, A);
  g.npcs[B].relPlayer = { ...g.npcs[B].relPlayer, affection: -0.5, tension: 0.6 };
  const rowsCold = gameStakeOptions(g, B);
  const again = JSON.stringify(gameStakeOptions(g, A)) === JSON.stringify(rowsFond);
  // nothing needs doing: no chore stake
  const noChore = (() => { const h = __mk(); const orig = npcChoreOptions; npcChoreOptions = () => []; try { return gameStakeAgrees(h, __ids(h)[0], 'chore'); } finally { npcChoreOptions = orig; } })();
  // the week's cap
  const c = __mk(); const day = c.meta.clock.day; ensureGamesForTest(c);
  c.world.games.iou = [{ day, amount: GAMES_TUNING.stakes.iou.weekCap }];
  const capped = gameStakeAgrees(c, __ids(c)[0], 'iou', 5);
  function ensureGamesForTest(x) { gamesState(x); }
  return { brag: rowsFond[0].ok, fondIou: rowsFond.filter(r => r.stakeId === 'iou').every(r => r.ok), coldChore: rowsCold.find(r => r.id === 'chore').ok, coldIou: rowsCold.filter(r => r.stakeId === 'iou').some(r => r.ok), again, noChore, capped, labels: rowsFond.map(r => r.label) };
})()`);
check('bragging rights are always on; a fond roommate agrees to more, a cold one to nothing but bragging; the answer is deterministic', st.brag && st.fondIou && !st.coldChore && !st.coldIou && st.again, JSON.stringify(st));
check('no chore stake when nothing needs doing; an IOU that would break the weekly cap is refused', st.noChore.ok === false && st.noChore.reason === 'nothing' && st.capped.ok === false && st.capped.reason === 'cap', JSON.stringify({ n: st.noChore, c: st.capped }));

console.log('\n3. A planned match');
const plan = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const p1 = gamePlanMatch(g, 'pool', A, 'brag', 0), p2 = gamePlanMatch(g, 'pool', A, 'brag', 0);
  const same = JSON.stringify(p1) === JSON.stringify(p2);
  const line = gameMatchNarration(g, p1);
  // over many seeds: the mix
  let wins = 0, close = 0, blow = 0, n = 300;
  for (let i = 0; i < n; i++) { g.meta.clock.minutes = 600 + i; const p = gamePlanMatch(g, 'console', A, 'brag', 0); if (p.playerWon) wins++; if (p.grade === 'close') close++; if (p.grade === 'blowout') blow++; }
  const stake = gamePlanMatch(g, 'pool', A, 'iou', 10);
  const cold = (() => { const h = __mk(); const B = __ids(h)[1]; h.npcs[B].relPlayer = { ...h.npcs[B].relPlayer, affection: -0.5, tension: 0.6 }; return gamePlanMatch(h, 'pool', B, 'iou', 10); })();
  return { same, line, pWin: gameWinChance(g, A, 'console'), winRate: wins / n, close: close / n, blow: blow / n, stakeId: stake.stakeId, amt: stake.amount, coldStake: cold.stakeId, hasName: /Mira/.test(line) && !/[{}]/.test(line), minutes: p1.minutes };
})()`);
check('the same save, day and count plays the same match, and the line names the opponent with no placeholder left', plan.same && plan.hasName && plan.minutes === 35, plan.line);
check('over many matches the win rate tracks the chance, and there are close ones and walkovers', Math.abs(plan.winRate - plan.pWin) < 0.1 && plan.close > 0.25 && plan.blow > 0.05, JSON.stringify(plan));
check('an agreed stake stays in the plan; a refused one quietly becomes bragging rights', plan.stakeId === 'iou' && plan.amt === 10 && plan.coldStake === 'brag', JSON.stringify(plan));

console.log('\n4. Applying a match');
const app = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const mood0 = g.npcs[A].mood || 0, xp0 = (g.player.skills || {}).games || 0;
  const r = gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: true, grade: 'close' });
  const s = g.world.games;
  const rec = s.history[0];
  const afterWin = { hist: s.history.length, riv: s.rivals[A].pool, xp: g.player.skills.games - xp0, npcMood: g.npcs[A].mood, mem: JSON.stringify(g.npcs[A].memory).includes('Lost to the player at pool'), pending: !!s.pending, evt: g.world.events.some(e => e.type === 'game_match'), aff: g.npcs[A].relPlayer.affection };
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: false, grade: 'blowout' });
  const lost = s.rivals[A].pool;
  // a sore loser after a walkover
  const h = __mk(); const [B] = __ids(h); h.npcs[B].bible.temperament.volatility = 0.8;
  const t0 = h.npcs[B].relPlayer.tension;
  gameApplyMatch(h, { gameId: 'darts', npcId: B, stakeId: 'brag', amount: 0, playerWon: true, grade: 'blowout' });
  const soreT = h.npcs[B].relPlayer.tension - t0;
  // an IOU: they win, you owe
  const k = __mk(); const [C] = __ids(k);
  gameApplyMatch(k, { gameId: 'pool', npcId: C, stakeId: 'iou', amount: 10, playerWon: false, grade: 'normal' });
  const owe = moneyOwedByPlayer(k, C);
  gameApplyMatch(k, { gameId: 'pool', npcId: C, stakeId: 'iou', amount: 5, playerWon: true, grade: 'normal' });
  const owed = moneyOwedToPlayer(k, C);
  return { rec: rec && { game: rec.gameId, winner: rec.winner, grade: rec.grade, players: rec.players }, afterWin, lost, soreT, owe, owed, iouLog: k.world.games.iou.length, resLines: r.lines.length };
})()`);
check('the record: who, what, the winner and the grade; the rivalry tally; games XP; the memory; the event; the follow-up window opens', app.rec && app.rec.game === 'pool' && app.rec.winner === 'player' && app.rec.grade === 'close' && app.afterWin.riv.w === 1 && app.afterWin.xp > 0 && app.afterWin.mem && app.afterWin.pending && app.afterWin.evt, JSON.stringify(app));
check('a loss counts against you; a close game warms them; the loser is a little lower for it', app.lost.l === 1 && app.afterWin.aff > 0.4 && app.afterWin.npcMood < 0.001, JSON.stringify(app));
check('a walkover against a volatile loser costs you some goodwill', app.soreT > 0, String(app.soreT));
check('an IOU settles through the money ledger both ways, and is logged for the weekly cap', app.owe === 10 && app.owed === 5 && app.iouLog === 2, JSON.stringify({ o: app.owe, w: app.owed, l: app.iouLog }));

console.log('\n5. The chore stake');
const chore = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  // dirty the sink so the dishes need doing
  const sink = Object.values(g.objects.room_kitchen).find(o => o.defId === 'sink_kitchen');
  sink.dishes = { plate: 4 }; sink.dishUnits = 6;
  const need0 = npcChoreOptions(g).map(o => o.id);
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'chore', amount: 0, playerWon: true, grade: 'normal' });
  const queued = g.npcs[A].flags && g.npcs[A].flags._choreRequest && g.npcs[A].flags._choreRequest.choreId;
  // now you lose: you do the chore yourself
  const h = __mk(); const [B] = __ids(h);
  const sink2 = Object.values(h.objects.room_kitchen).find(o => o.defId === 'sink_kitchen');
  sink2.dishes = { plate: 4 }; sink2.dishUnits = 6;
  const before = npcChoreOptions(h).map(o => o.id);
  gameApplyMatch(h, { gameId: 'pool', npcId: B, stakeId: 'chore', amount: 0, playerWon: false, grade: 'normal' });
  const after = npcChoreOptions(h).map(o => o.id);
  // nothing to do: quietly bragging rights
  const k = __mk(); const [C] = __ids(k);
  const r = (() => { const orig = npcChoreOptions; npcChoreOptions = () => []; try { return gameApplyMatch(k, { gameId: 'pool', npcId: C, stakeId: 'chore', amount: 0, playerWon: false, grade: 'normal' }); } finally { npcChoreOptions = orig; } })();
  return { need0, queued, before, after, none: r.lines[0] };
})()`);
check('you win a chore stake: they get the chore queued, to do for real', chore.need0.length > 0 && chore.queued === chore.need0[0], JSON.stringify(chore));
check('you lose one: it is done, by you, for real (the dishes are clean)', chore.before.includes('dishes') && !chore.after.includes('dishes'), JSON.stringify({ b: chore.before, a: chore.after }));
check('with nothing to do the stake quietly stays bragging rights', /no chore/i.test(chore.none), chore.none);

console.log('\n6. The follow-up');
const fu = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const none = { g: gameFollowUpOpen(g, 'gracious').ok };
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: true, grade: 'normal' });
  const open = { gracious: gameFollowUpOpen(g, 'gracious').ok, gloat: gameFollowUpOpen(g, 'gloat').ok, rematch: gameFollowUpOpen(g, 'rematch').ok };
  const lineG = gameFollowUpLine(g, 'gracious');
  const t0 = g.npcs[A].relPlayer.tension;
  gameApplyFollowUp(g, 'gloat');
  const gloatWent = g.npcs[A].relPlayer.tension >= t0 && !g.world.games.pending;
  // lost: no gloat
  const h = __mk(); const [X] = __ids(h);
  gameApplyMatch(h, { gameId: 'pool', npcId: X, stakeId: 'brag', amount: 0, playerWon: false, grade: 'normal' });
  const lostOpen = { gloat: gameFollowUpOpen(h, 'gloat').ok, gracious: gameFollowUpOpen(h, 'gracious').ok };
  const a0 = h.npcs[X].relPlayer.affection; const tn0 = h.npcs[X].relPlayer.tension;
  gameApplyFollowUp(h, 'gracious');
  // the window closes: an hour, or when they leave
  const k = __mk(); const [Y] = __ids(k);
  gameApplyMatch(k, { gameId: 'pool', npcId: Y, stakeId: 'brag', amount: 0, playerWon: true, grade: 'normal' });
  k.meta.clock.minutes += GAMES_TUNING.followUpMinutes + 5;
  const late = gameFollowUpOpen(k, 'gracious').ok;
  const k2 = __mk(); const [Z] = __ids(k2);
  gameApplyMatch(k2, { gameId: 'pool', npcId: Z, stakeId: 'brag', amount: 0, playerWon: true, grade: 'normal' });
  k2.npcs[Z].location = 'kitchen';
  const left = gameFollowUpOpen(k2, 'gracious').ok;
  return { none, open, lineG, gloatWent, lostOpen, graciousBetter: h.npcs[X].relPlayer.affection > a0 && h.npcs[X].relPlayer.tension < tn0, late, left };
})()`);
check('nothing to say before a game; after a win: good game, gloat and rematch are open; after a loss, no gloating', fu.none.g === false && fu.open.gracious && fu.open.gloat && fu.open.rematch && fu.lostOpen.gloat === false && fu.lostOpen.gracious, JSON.stringify(fu));
check('good game warms them and cools the air; a follow-up closes the window; the line names no placeholder', fu.graciousBetter && fu.gloatWent && !/[{}]/.test(fu.lineG), fu.lineG);
check('the window is an hour and only while they are still here', fu.late === false && fu.left === false, JSON.stringify({ l: fu.late, x: fu.left }));

console.log('\n7. The verbs, through the real registry');
const verbs = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const ctxFor = (gs) => ({ gameState: gs, roomId: 'game_room', roomObjects: gs.objects.room_game_room, actorId: null, presentNpcIds: __ids(gs).filter(id => gs.npcs[id].location === 'game_room') });
  const okBefore = { challenge: checkRequirements(ACTION_DEFS['game.challenge'], ctxFor(g)).ok, rematch: checkRequirements(ACTION_DEFS['game.rematch'], ctxFor(g)).ok, gloat: checkRequirements(ACTION_DEFS['game.gloat'], ctxFor(g)).ok };
  // headless: prepare picks the first game with bragging rights
  const prepared = ACTION_DEFS['game.challenge'].prepare(ctxFor(g));
  const lines = ACTION_DEFS['game.challenge'].buildEffects(ctxFor(g), prepared);
  const minutes = resolveTimeCost(ACTION_DEFS['game.challenge'], g, prepared, null);
  const narr = ACTION_DEFS['game.challenge'].narration.build(ctxFor(g), prepared);
  __eff(g, lines);
  const okAfter = { rematch: checkRequirements(ACTION_DEFS['game.rematch'], ctxFor(g)).ok, gracious: checkRequirements(ACTION_DEFS['game.gracious'], ctxFor(g)).ok, gloat: checkRequirements(ACTION_DEFS['game.gloat'], ctxFor(g)).ok };
  const rematch = ACTION_DEFS['game.rematch'].prepare(ctxFor(g));
  // no one here: no challenge
  const e = __mk(); for (const id of __ids(e)) e.npcs[id].location = 'kitchen';
  const alone = checkRequirements(ACTION_DEFS['game.challenge'], ctxFor(e)).ok;
  // a broken game room: no challenge
  const b = __mk(); b.world.upgrades.game_room_setup = { tier: 'broken', condition: 0 };
  const broken = checkRequirements(ACTION_DEFS['game.challenge'], ctxFor(b)).ok;
  return { okBefore, prepared: { game: !!prepared.game, minutes: prepared.minutes }, lines, minutes, narr, okAfter, rematchGame: rematch.rematch && rematch.game.gameId === prepared.game.gameId, alone, broken, count: g.world.games.count, mood: g.player.mood };
})()`);
check('before any match only Challenge is open; with nobody here or a broken setup it is not', verbs.okBefore.challenge === true && verbs.okBefore.rematch === false && verbs.okBefore.gloat === false && verbs.alone === false && verbs.broken === false, JSON.stringify(verbs.okBefore));
check('Challenge: a plan made in prepare, its minutes are the game\'s, the effect writes the match, and the line agrees', verbs.prepared.game && verbs.minutes === verbs.prepared.minutes && verbs.count === 1 && /GAME_MATCH/.test(verbs.lines[2]) && !/[{}]/.test(verbs.narr), JSON.stringify({ l: verbs.lines, n: verbs.narr }));
check('after a match Rematch and Good Game open (Gloat only if you won) and a rematch replays the same game', verbs.okAfter.rematch && verbs.okAfter.gracious && verbs.rematchGame, JSON.stringify(verbs.okAfter));

console.log('\n8. The prompt, wiring and R1');
const pr = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const none = gamesPromptLine(g, A);
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: false, grade: 'normal' });
  const lost = gamesPromptLine(g, A);
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: true, grade: 'normal' });
  const level = gamesPromptLine(g, A);
  gameApplyMatch(g, { gameId: 'pool', npcId: A, stakeId: 'brag', amount: 0, playerWon: true, grade: 'normal' });
  const ahead = gamesPromptLine(g, A);
  return { none, lost, level, ahead };
})()`);
check('no line before a match; then who has been beating whom, and when it is level', pr.none === null && /beaten the player 1 time at pool/.test(pr.lost) && /dead level/.test(pr.level) && /player has beaten Mira 2 times/.test(pr.ahead), JSON.stringify(pr));
{
  const llm = srcOf('llm.js'), html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8'), g = srcOf('games.js'), render = srcOf('render.js');
  check('wired in: the prompt reads it, index.html loads it, the picker exists; games.js never touches the shared rng', /gamesPromptLine\(gameState, npc\.id\)/.test(llm) && /srcfiles\/games\.js\?v=\d+/.test(html) && /function openChoicePicker\(/.test(render) && (g.match(/\brng\(\)/g) || []).length === 2 && g.indexOf('rng()') > g.indexOf('function gamePlanMatch(') && g.indexOf('rng()') < g.indexOf('function gameMatchNarration(') && !/Math\.random/.test(g));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([GAME_DEFS, GAMES_TUNING])');
  check('R1: no religion in the games tables', !vocab.test(T), (T.match(vocab) || [''])[0]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
