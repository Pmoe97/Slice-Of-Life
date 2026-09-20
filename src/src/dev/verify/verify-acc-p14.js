// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 14:
// Aspirations (D46–D49, D101–D103).
//
//   node src/src/dev/verify/verify-acc-p14.js
//
// Node coverage for everything pure in this phase: aspirations.js in both
// load lists after platform.js; COMPASS_LABEL as the one home of the name
// (Q2 → D101); the five directions with ~8 milestones each, every milestone
// { id, label, pre, done } with unique ids; every predicate PURE — called
// twice on the same state, same answer, the state byte-identical
// before/after (deep-equal), over a generated house AND a bare state with
// nothing backfilled; the two payouts; the aspiration Notice signal and
// lines; the app def, the icon, the renderer; chooseDirections /
// toggleDirection (at most two, unknown refused, a third refused, order
// kept); the plan's scenario — craft chosen, art at 4: the live list holds
// "Reach art 5" and not "Sell a piece" (pre unmet), at most two per
// direction, in authored order; crossing to 5 completes it exactly once
// (recorded by day), pushes the milestone payout once, emits the
// `aspiration` subject once (a housemate in the room forms an opinion);
// idempotent per day; switching directions keeps `completed`; a direction
// exhausted pays aspirationDirection once; the tracker lists nothing (D49);
// the gigs `delivered` counter; the intro picks landing through
// chooseDirections; and a save round-trip of player.aspirations. The intro
// screen's section and Compass on both devices are checked live
// (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'image.js', 'chatter.js',
    'platform.js', 'aspirations.js', 'tracker.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: { contentFlags: { mature: true } }, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  __level = (g, skill, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skill] = SKILLS.xpPerLevelBase * level * level; };
  __impulses = (g) => (g.player.moodEvents || []).length;
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration, the label, the tables, the payouts. ${loaded.length} engine files loaded.`);
check("aspirations.js loaded through loadgame.js's ORDER, after platform.js", loaded.includes('aspirations.js') && loaded.indexOf('aspirations.js') > loaded.indexOf('platform.js'));
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
const at = (f) => indexHtml.indexOf(`srcfiles/${f}?`);
check('index.html loads aspirations.js directly after platform.js (both lists, invariant 8)', at('aspirations.js') > at('platform.js') && at('aspirations.js') < at('asks.js'));
check("COMPASS_LABEL is 'Compass' (Q2 → D101) and the only source file spelling the app's name as a string outside its def/comments is defs.works.js", J("COMPASS_LABEL === 'Compass'") && (() => {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8').split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n');
    const hits = (src.match(/'Compass'|"Compass"|`Compass`/g) || []).length;
    if (hits > 0 && f !== 'defs.works.js' && !(f === 'defs.computer.js' && hits === 1)) offenders.push(`${f}:${hits}`);
  }
  return offenders.length === 0;
})());
const dirs = J('ASPIRATION_DIRECTION_IDS');
const table = J(`Object.fromEntries(ASPIRATION_DIRECTION_IDS.map(d => [d, { label: ASPIRATION_DIRECTIONS[d].label, n: ASPIRATION_DIRECTIONS[d].milestones.length, ok: ASPIRATION_DIRECTIONS[d].milestones.every(m => typeof m.id === 'string' && typeof m.label === 'string' && typeof m.pre === 'function' && typeof m.done === 'function') }]))`);
const ids = J('ASPIRATION_DIRECTION_IDS.flatMap(d => ASPIRATION_DIRECTIONS[d].milestones.map(m => m.id))');
check("the five directions (craft, connection, comfort, independence, notoriety) each carry ≥ 8 milestone templates { id, label, pre, done } with globally unique ids", dirs.join(',') === 'craft,connection,comfort,independence,notoriety' && Object.values(table).every(t => t.n >= 8 && t.ok) && new Set(ids).size === ids.length, JSON.stringify(table));
check('ASPIRATION_TUNING: at most 2 directions, 2 live milestones per direction; MOOD_PAYOUTS.aspirationMilestone 0.10 / aspirationDirection 0.25', J("ASPIRATION_TUNING.maxDirections === 2 && ASPIRATION_TUNING.livePerDirection === 2 && MOOD_PAYOUTS.aspirationMilestone === 0.10 && MOOD_PAYOUTS.aspirationDirection === 0.25"));
check("NOTICE has an aspiration signal (craft_moment, quieter than a level-up) and lines in five bands; the compass app def is personal, on both devices, with the compass-overview renderer; ICONS.compass exists", J(`NOTICE_SIGNALS.aspiration && NOTICE_SIGNALS.aspiration.id === 'craft_moment' && NOTICE_SIGNALS.aspiration.intensity < NOTICE_SIGNALS.skill_levelup.intensity && ['strong_pos','pos','neutral','neg','strong_neg'].every(b => OPINION_LINES.aspiration[b].length > 0) && APP_DEFS.compass && APP_DEFS.compass.category === 'personal' && APP_DEFS.compass.devices.length === 2 && APP_DEFS.compass.screens.overview.renderer === 'compass-overview' && typeof ICONS.compass === 'function'`));
const rc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
check("render.computer.js registers 'compass-overview': renderCompassOverview; tracker.js has no aspiration source (D49)", /'compass-overview': renderCompassOverview/.test(rc) && !/trackerAspiration|kind: 'aspiration'|trackerCompass/.test(fs.readFileSync(path.join(SRC, 'tracker.js'), 'utf8')));

// ---------------------------------------------------------------- 1
console.log('\n1. Every predicate is pure (D46)');
const pure = J(`(() => {
  const impure = [];
  const run = (g, tag) => {
    for (const d of ASPIRATION_DIRECTION_IDS) for (const m of ASPIRATION_DIRECTIONS[d].milestones) {
      const before = JSON.stringify(g);
      const p1 = m.pre(g), p2 = m.pre(g), d1 = m.done(g), d2 = m.done(g);
      if (JSON.stringify(g) !== before) impure.push(tag + ':' + m.id + ':mutates');
      if (p1 !== p2 || d1 !== d2) impure.push(tag + ':' + m.id + ':unstable');
      if (typeof p1 !== 'boolean' || typeof d1 !== 'boolean') impure.push(tag + ':' + m.id + ':nonbool');
    }
  };
  const g = __mk(1); run(g, 'house');
  // a bare state with nothing backfilled — no profile, no works, no skills, no bills
  const bare = { meta: { seed: 1, clock: { day: 1, minutes: 0 } }, player: { location: 'bedroom_player' }, npcs: {}, world: {}, objects: {} };
  run(bare, 'bare');
  const live = liveMilestones(bare); const prog = ASPIRATION_DIRECTION_IDS.map(d => directionProgress(bare, d).total);
  return { impure, bareLive: Object.keys(live).length, prog };
})()`);
check('every milestone\'s pre/done is a pure boolean function — two calls, same answer, the state byte-identical — over a generated house AND a bare state with nothing backfilled (no profile, works, skills or bills)', pure.impure.length === 0 && pure.bareLive === 0 && pure.prog.every(n => n >= 8), JSON.stringify(pure));

// ---------------------------------------------------------------- 2
console.log('\n2. chooseDirections / toggleDirection (D46/D47)');
const choose = J(`(() => {
  const g = __mk(2); const out = {};
  out.none = JSON.stringify(g.player.aspirations || null);
  out.two = chooseDirections(g, ['notoriety', 'craft']); out.order = g.player.aspirations.directions;
  out.three = chooseDirections(g, ['craft', 'comfort', 'connection']); out.stillTwo = g.player.aspirations.directions.length;
  out.bad = chooseDirections(g, ['nope']); out.dup = chooseDirections(g, ['craft', 'craft']);
  chooseDirections(g, ['notoriety', 'craft']);
  out.off = toggleDirection(g, 'craft'); out.on = toggleDirection(g, 'comfort'); out.third = toggleDirection(g, 'connection'); out.unknown = toggleDirection(g, 'x');
  out.final = g.player.aspirations.directions;
  out.empty = chooseDirections(g, []);
  return out;
})()`);
check('chooseDirections keeps the given order, refuses a third or an unknown id, de-duplicates; toggleDirection turns one off/on and refuses a third; an empty choice is allowed', choose.none === 'null' && choose.two.ok === true && choose.order.join(',') === 'notoriety,craft' && choose.three.ok === false && choose.stillTwo === 2 && choose.bad.ok === false && choose.dup.ok === true && choose.dup.directions.length === 1 && choose.off.on === false && choose.on.on === true && choose.third.ok === false && choose.unknown.ok === false && choose.final.join(',') === 'notoriety,comfort' && choose.empty.ok === true, JSON.stringify(choose));

// ---------------------------------------------------------------- 3
console.log("\n3. The plan's scenario — craft chosen, art at 4 → 5 (D46/D48/D49)");
const sc = J(`(() => {
  const g = __mk(3, 3); const res = __residents(g); const out = {};
  chooseDirections(g, ['craft']); __level(g, 'art', 4);
  const live = liveMilestonesFor(g, 'craft');
  out.live = live.map(m => m.label); out.liveMax = live.length <= ASPIRATION_TUNING.livePerDirection;
  out.hasArt5 = live.some(m => m.label === 'Reach art 5'); out.hasSell = live.some(m => /Sell a piece/.test(m.label));
  out.sellPre = ASPIRATION_DIRECTIONS.craft.milestones.find(m => m.id === 'craft_sell_piece').pre(g);
  // a housemate in the room, awake, to react
  g.player.location = 'living_room'; g.npcs[res[0]].location = 'living_room'; g.npcs[res[0]].asleep = false; g.npcs[res[0]].activity = 'hanging_out';
  const before = checkAspirations(g, 3); out.beforeCross = before.completed.map(c => c.id);
  const i0 = __impulses(g);
  __level(g, 'art', 5);
  const r1 = checkAspirations(g, 4); const r2 = checkAspirations(g, 4); const r3 = checkAspirations(g, 5);
  out.r1 = r1.completed.map(c => c.id); out.r2 = r2.completed.length; out.r3 = r3.completed.length;
  out.completedDay = g.player.aspirations.completed.craft_art5;
  out.impulses = __impulses(g) - i0; out.impulseValues = (g.player.moodEvents || []).slice(-2).map(e => e.delta);
  const art5 = r1.completed.find(c => c.id === 'craft_art5');
  out.noticed = art5 && art5.noticed && art5.noticed.perceivers.map(p => p.npcId + ':' + p.via);
  out.opinion = holdsOpinionOn(g.npcs[res[0]], 'aspiration:craft_art5');
  const fact = (g.npcs[res[0]].memory.facts || []).find(f => f.kind === 'opinion' && f.subject && f.subject.key === 'aspiration:craft_art5'); out.factText = fact && fact.text;
  out.liveAfter = liveMilestonesFor(g, 'craft').map(m => m.id);
  // switching directions keeps completed; switching back does not re-complete or re-pay
  chooseDirections(g, ['comfort']); out.keptCompleted = Object.keys(g.player.aspirations.completed);
  const i1 = __impulses(g); chooseDirections(g, ['craft']); const r4 = checkAspirations(g, 6); out.repay = __impulses(g) - i1; out.r4 = r4.completed.length;
  out.tracker = buildTrackerEntries(g).filter(e => /aspiration|compass|milestone/i.test(e.title + ' ' + e.detail)).length;
  return out;
})()`);
check("with craft chosen and art at 4 the live list contains 'Reach art 5' and not 'Sell a piece' (pre unmet), at most two per direction", sc.hasArt5 === true && sc.hasSell === false && sc.sellPre === false && sc.liveMax === true, JSON.stringify(sc));
check('crossing to 5 completes it exactly once (recorded by day), pushes the 0.10 payout once per completed milestone, emits the aspiration subject once — the housemate in the room holds an opinion; a re-check the same day or the next completes nothing more', sc.beforeCross.length === 1 && sc.r1.includes('craft_art5') && sc.r2 === 0 && sc.r3 === 0 && sc.completedDay === 4 && sc.impulses === sc.r1.length && sc.impulseValues.every(v => v === 0.10) && sc.noticed && sc.noticed.length === 1 && /:room$/.test(sc.noticed[0]) && sc.opinion === true && /milestone/.test(sc.factText) && !sc.liveAfter.includes('craft_art5'), JSON.stringify(sc));
check('switching directions keeps `completed`; switching back neither re-completes nor re-pays; the tracker lists nothing for aspirations (D49)', sc.keptCompleted.includes('craft_art5') && sc.repay === 0 && sc.r4 === 0 && sc.tracker === 0, JSON.stringify(sc));

// ---------------------------------------------------------------- 4
console.log('\n4. A direction exhausted pays once; the delivered counter; the intro picks');
const ex = J(`(() => {
  const g = __mk(4, 3); const out = {};
  chooseDirections(g, ['notoriety']);
  setChatterHandle(g, 'star'); const p = ensureChatterProfile(g); p.ghostFollowers = 20000; p.castFollowers.push(__residents(g)[0]); p.backers.ghosts = 3;
  g.npcs[__residents(g)[0]] = addMemoryFact(g.npcs[__residents(g)[0]], { kind: 'identity_link', handle: 'star', who: 'player', text: 'x', day: 3, importance: 0.8, category: 'social' });
  const i0 = __impulses(g);
  const r1 = checkAspirations(g, 10); const r2 = checkAspirations(g, 11);
  out.completed = r1.completed.length; out.total = ASPIRATION_DIRECTIONS.notoriety.milestones.length; out.dirDone = r1.directionsDone; out.again = r2.directionsDone.length;
  out.impulses = __impulses(g) - i0; out.bigOne = (g.player.moodEvents || []).some(e => e.delta === MOOD_PAYOUTS.aspirationDirection);
  out.progress = directionProgress(g, 'notoriety');
  // the gigs delivered counter (its reader is the independence direction)
  const g2 = __mk(5, 1); generateGigsForDay(g2, 1); const gig = g2.world.computer.apps.gigs.board[0];
  acceptGig(g2, gig.gigId); const acc = g2.world.computer.apps.gigs.accepted[0]; acc.blocksDone = acc.blocks;
  out.d0 = g2.world.computer.apps.gigs.delivered || 0; deliverGig(g2, gig.gigId); out.d1 = g2.world.computer.apps.gigs.delivered;
  chooseDirections(g2, ['independence']); out.ind = checkAspirations(g2, 4).completed.map(c => c.id);
  // the intro's picks: what startSoloGame does with pendingNewGameOptions.aspirations
  const picks = Object.entries({ craft: true, comfort: false, notoriety: true, connection: true }).filter(([, on]) => on).map(([id]) => id).slice(0, ASPIRATION_TUNING.maxDirections);
  const g3 = __mk(6, 1); chooseDirections(g3, picks); out.intro = g3.player.aspirations.directions;
  return out;
})()`);
check(`a direction whose pool is exhausted (notoriety, ${ex.completed}/${ex.total} at once) pays aspirationDirection exactly once on top of the per-milestone payouts, never again`, ex.completed === ex.total && ex.dirDone.join(',') === 'notoriety' && ex.again === 0 && ex.impulses === ex.total + 1 && ex.bigOne === true && ex.progress.exhausted === true, JSON.stringify(ex));
check("deliverGig increments gigs.delivered (its reader: the independence direction's 'Deliver a gig' completes); the intro's toggles land through chooseDirections as the first two on", ex.d0 === 0 && ex.d1 === 1 && ex.ind.includes('ind_gig1') && ex.intro.join(',') === 'craft,notoriety', JSON.stringify(ex));

// ---------------------------------------------------------------- 5
console.log('\n5. Save round-trip — player.aspirations');
const persist = J(`(() => {
  const g = __mk(7, 3); chooseDirections(g, ['craft', 'comfort']); __level(g, 'art', 3); checkAspirations(g, 3);
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const pa = rt.player.player.aspirations;
  return { same: JSON.stringify(pa) === JSON.stringify(g.player.aspirations), dirs: pa.directions, completed: Object.keys(pa.completed), lastCheckedDay: pa.lastCheckedDay };
})()`);
check('captureSavePayload → JSON keeps player.aspirations (directions, completed by day, lastCheckedDay) on the player record', persist.same === true && persist.dirs.join(',') === 'craft,comfort' && persist.completed.includes('craft_any3') && persist.lastCheckedDay === 3, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
