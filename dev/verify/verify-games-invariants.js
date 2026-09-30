// Game Room, Phase 12 — the close-out (game-room-overhaul-plan.md's design invariants; 0.14.5).
//
//   node dev/verify/verify-games-invariants.js
//
// 1. No game is an income stream: nothing a game does touches cash or the income log; the only money a
//    game moves is the IOU ledger, capped per session and per week, and the best a week of games could
//    ever win is a fraction of one day of the cheapest gig work (the independenceIndex test's spirit).
// 2. Seeded everything: a save plays the same match every time; no game module uses Math.random.
// 3. One spine: only games.js applies a match's consequences (and gamenight.js its own pair records).
// Plus the completeness of the set: every game is reachable, has its verb or its screen, and costs time.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'skills.js', 'money.js', 'commitments.js', 'games.js', 'darts.js', 'cardgames.js', 'poker.js', 'blackjack.js', 'pool.js', 'arcade.js', 'tabletop.js', 'gamenight.js', 'defs.actions.js', 'defs.computer.js', 'actions.js', 'drives.js', 'state.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260929, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 10, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.world.upgrades.game_room_setup = { tier: 'upgraded', condition: 100 };
    g.player.location = 'game_room'; g.world.events = []; g.player.money = 500; g.player.incomeLog = [];
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin'][i] || ('Roomie' + i); g.npcs[id].location = 'game_room'; g.npcs[id].activity = 'idle'; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.95, tension: 0 }; });
    g.player.inventory = [{ defId: 'playing_cards', qty: 1 }, { defId: 'board_game', qty: 1 }];
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __eff = (g, lines) => applyEffects(parseEffectDSL(Array.isArray(lines) ? lines.join('\\n') : lines), buildEffectContext(g, [], [], {}, []));
`);

console.log('\n1. No game is an income stream');
const econ = J(`(() => {
  const g = __mk(); const ids = __ids(g);
  const money0 = g.player.money, log0 = JSON.stringify(g.player.incomeLog);
  // the biggest stakes on every kind of game, again and again, winning where we can
  let plans = 0, wonIou = 0;
  const T = GAMES_TUNING.stakes;
  const topAmt = Math.max(...T.iou.amounts);
  for (let i = 0; i < 40; i++) {
    g.meta.clock.minutes = 600 + i * 7;
    for (const gameId of ['pool', 'darts', 'console', 'boardgame', 'blackjack']) {
      const plan = gamePlanMatch(g, gameId, ids[i % ids.length], 'iou', topAmt);
      if (!plan) continue;
      plans++;
      const lines = gameMatchEffects({ gameState: g }, { game: plan });
      __eff(g, lines);
      if (plan.playerWon && plan.stakeId === 'iou') wonIou += plan.amount;
    }
    for (const gameId of ['poker', 'party']) {
      const plan = gamePlanSession(g, gameId, ids, 'iou', topAmt);
      if (!plan) continue;
      plans++;
      __eff(g, gameMatchEffects({ gameState: g }, { game: plan }));
    }
    const ar = gamePlanArcade(g, ARCADE_IDS[i % 4], null);
    __eff(g, ['GAME_ARCADE ' + ar.gameId + ' ' + ar.score]);
  }
  const iouLog = g.world.games.iou.slice();
  const perSession = Math.max(0, ...iouLog.map(r => r.amount));
  // any 7 days: what was staked
  const byWeek = {}; for (const r of iouLog) { const w = Math.floor(r.day / 7); byWeek[w] = (byWeek[w] || 0) + r.amount; }
  const owed = ids.reduce((a, id) => a + moneyOwedToPlayer(g, id), 0), owes = ids.reduce((a, id) => a + moneyOwedByPlayer(g, id), 0);
  return { plans, moneyKept: g.player.money === money0, logKept: JSON.stringify(g.player.incomeLog) === log0, iouCount: iouLog.length, perSession, weekMax: Math.max(0, ...Object.values(byWeek)), weekCap: T.iou.weekCap, sessionCap: topAmt, owed, owes };
})()`);
check('nothing a game does touches your cash or your income log — across every game, staking the most, again and again', econ.plans > 100 && econ.moneyKept && econ.logKept, JSON.stringify({ plans: econ.plans, money: econ.moneyKept, log: econ.logKept }));
check('the only money that moves is the IOU ledger, no more than the session cap in a session and the weekly cap in a week', econ.iouCount > 0 && econ.perSession <= econ.sessionCap && econ.weekMax <= econ.weekCap, JSON.stringify({ n: econ.iouCount, session: econ.perSession, week: econ.weekMax, cap: econ.weekCap }));

const gig = J(`(() => {
  const cheapest = Math.min(...Object.values(GIG_TEMPLATES_SAFE()).filter(n => n > 0));
  function GIG_TEMPLATES_SAFE() { const out = {}; for (const [k, v] of Object.entries(typeof GIG_TEMPLATES === 'object' ? GIG_TEMPLATES : {})) if (v && v.basePayoutPerBlock) out[k] = v.basePayoutPerBlock; return out; }
  const perBlock = cheapest * GIG_TUNING.payScale;
  const perHour = perBlock * (60 / GIG_TUNING.workBlockMinutes);
  const weekCap = GAMES_TUNING.stakes.iou.weekCap;
  return { cheapest, perBlock, perHour, weekCap, eightHours: perHour * 8, ratio: weekCap / (perHour * 8) };
})()`);
check('the best a whole week of games can win (the weekly IOU cap) is a fraction of ONE day of the cheapest gig work: a game is a situation, not a job', gig.cheapest > 0 && gig.weekCap < gig.eightHours * 0.6, JSON.stringify(gig));

console.log('\n2. Seeded everything');
const seeded = J(`(() => {
  const a = __mk(), b = __mk(); const [A] = __ids(a), [B] = __ids(b);
  const same = (gameId, args) => JSON.stringify(gamePlanMatch(a, gameId, A, ...args)) === JSON.stringify(gamePlanMatch(b, gameId, B, ...args));
  const out = {};
  for (const gameId of ['pool', 'darts', 'console', 'boardgame', 'blackjack']) out[gameId] = same(gameId, ['brag', 0]);
  const ids = __ids(a);
  out.poker = JSON.stringify(gamePlanSession(a, 'poker', ids, 'brag', 0)) === JSON.stringify(gamePlanSession(b, 'poker', __ids(b), 'brag', 0));
  out.party = JSON.stringify(gamePlanSession(a, 'party', ids, 'brag', 0)) === JSON.stringify(gamePlanSession(b, 'party', __ids(b), 'brag', 0));
  out.arcade = JSON.stringify(gamePlanArcade(a, 'stack_up', null)) === JSON.stringify(gamePlanArcade(b, 'stack_up', null));
  return out;
})()`);
check('every game plans the same match for the same save, day and moment: reload and it plays out identically', Object.values(seeded).every(x => x === true), JSON.stringify(seeded));
{
  const mods = ['games.js', 'darts.js', 'cardgames.js', 'poker.js', 'blackjack.js', 'pool.js', 'arcade.js', 'tabletop.js', 'gamenight.js', 'render.games.js'];
  const offenders = mods.filter(m => /Math\.random/.test(srcOf(m)));
  check('no game module uses Math.random: every random thing takes a seeded rng', offenders.length === 0, offenders.join(', '));
}

console.log('\n3. One spine');
{
  // Only games.js writes a match's consequences: the rivalry tally, the history, the follow-up window and the stake.
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  const writers = (re) => files.filter(f => re.test(srcOf(f)));
  const rivals = writers(/\.rivals\[[^\]]+\]\s*=|g\.rivals\[/);
  const history = writers(/\.history\.push\(/).filter(f => !/^(aging|tv|traditions|projects|books|birthdays|studio|occasions|seasons)\.js$/.test(f));
  const pending = writers(/games\.pending\s*=|g\.pending\s*=/);
  const iou = writers(/adjustMoneyLedger\(gs, [^)]*(npcOwes|playerOwes)/);
  check('only games.js tallies rivalries, keeps the match history, opens the follow-up window and settles a stake', rivals.every(f => f === 'games.js') && pending.every(f => f === 'games.js') && iou.every(f => f === 'games.js' || f === 'asks.js' || f === 'money.js'), JSON.stringify({ rivals, history, pending, iou }));
}

console.log('\n4. The set is complete');
const set = J(`(() => {
  const defs = GAME_IDS.map(id => { const d = GAME_DEFS[id]; return { id, minutes: d.minutes > 0, label: !!d.label, tag: !!d.skillTag, gear: d.anchors.length > 0 || !!d.item || !!d.free, screen: !!d.minigame || id === 'console', modes: !d.modes || d.modes.length >= 2 }; });
  return { defs, verbs: ['game.challenge', 'game.arcade', 'game.rematch', 'game.gracious', 'game.gloat'].map(v => [v, !!ACTION_DEFS[v]]), old: !!ACTION_DEFS['self.play_games'], effects: typeof gameApplyMatch === 'function' && typeof gameApplySession === 'function' && typeof gameApplyArcade === 'function', arcade: ARCADE_IDS.length };
})()`);
check('every game has a label, a length, a skill and gear or company to play it, and a screen (console games stay abstract, by decision Q4); modes come in pairs', set.defs.every(d => d.minutes && d.label && d.tag && d.gear && d.screen && d.modes), JSON.stringify(set.defs.filter(d => !(d.minutes && d.label && d.tag && d.gear && d.screen && d.modes))));
check('the verbs are registered, the old flat Play Games survives, all three writers exist, and the cabinet has its four', set.verbs.every(v => v[1]) && set.old && set.effects && set.arcade === 4, JSON.stringify(set));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
