// What's On (0.14.2) — the house TV has shows on it.
//
//   node src/src/dev/verify/verify-tv.js
//
// Node coverage for tv.js and its hook sites: registration (the tables, both
// script lists, the save key, the effect, the event band); the show calendar
// (weekly drops on one weekday, full drops land whole, something is always
// out); the beats (filled, capitalised, no repeats within a season, the
// killer is never the red herring, a new season is a new case); taste
// (stable, bounded, interests and the job pull); the living-room screen (one
// show, joiners, credit for whoever was there at the midpoint, the TV goes
// off, binges end); the player's Watch TV (every way the room picks, who gets
// credit, the effect through the real DSL, the line names who was there);
// spoilers (temperament decides, once a day, the real beat, it pays off when
// you get there); Streamly; the prompt line; and — the invariant — the pass
// changes WHAT is on and never WHETHER anyone watches: a week of the real
// resolveBatch is identical, npc for npc, with the pass switched off.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'defs.computer.js',
    'tv.js', 'defs.actions.js', 'actions.js', 'computer.js', 'state.js', 'llm.js'],
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
    const h = SIM_generateHouse(seed || 20260923, n === undefined ? 3 : n);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 3, minutes: 1200 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'kitchen';
    g.world.events = [];
    // Everything working (a new game opens with the Living Room Setup broken,
    // and the screen plays nothing until it's repaired — section 5 checks that).
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    // Real, distinct names (bible.name is empty out of the generator — gotcha 13).
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    for (const id of __ids(g)) {
      const n = g.npcs[id];
      n.location = 'bedroom_' + id; n.activity = 'idle'; n.transit = null;
      n.bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __now = (g) => clockToAbsolute(g.meta.clock);
  __sofa = (g, id) => { g.npcs[id].location = 'living_room'; g.npcs[id].activity = 'watching TV'; };
  __off = (g, id) => { g.npcs[id].location = 'bedroom_' + id; g.npcs[id].activity = 'idle'; };
  __tick = (g, minutes, events) => {
    const m = minutes || 30;
    const r = resolveTvTick(g, {}, __ids(g), m, events || []);
    g.meta.clock.minutes += m;
    while (g.meta.clock.minutes >= 1440) { g.meta.clock.minutes -= 1440; g.meta.clock.day++; }
    return r;
  };
  __follow = (g, id, showId) => {
    // Their ONLY new episode anywhere is the next one of this show: caught up
    // on everything else (their derived tastes still follow other shows, and
    // an unwatched episode of those would rightly win), one behind on this.
    const tv = ensureTv(g);
    const day = g.meta.clock.day;
    tv.seeded[id] = 1;
    tv.progress[id] = {};
    for (const s of tvShowIds()) tv.progress[id][s] = tvReleasedCount(tvShowDef(s), day);
    tv.progress[id][showId] = tvReleasedCount(tvShowDef(showId), day) - 1;
    tv.lastWatched[id] = {}; tv.lastWatched[id][showId] = day;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tables, script lists, save key, effect, event band');
const reg = J(`({
  fns: ['resolveTvTick','tvPlanPlayerWatch','tvApplyPlayerWatch','tvWatchNarration','tvStreamWatch','tvPromptLine','tvActivityLabel','tvRoomLine','tvStreamCardMeta','ensureTv'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  everyShowAirs: STREAM_DEFS_LIST.every(d => d.tv && ['serial','competition','episodic'].includes(d.tv.format) && ['weekly','full'].includes(d.tv.release)
    && Number.isInteger(d.tv.premiere) && d.tv.seasonEpisodes >= 4 && d.tv.cycleWeeks >= (d.tv.release === 'weekly' ? d.tv.seasonEpisodes : 1) && d.tv.runtime >= 20),
  everyShowHasBeats: STREAM_DEFS_LIST.every(d => TV_EPISODE_BEATS[d.id]),
  interestsReal: STREAM_DEFS_LIST.every(d => (d.tv.interests || []).every(i => INTEREST_POOL.some(p => p.name === i))),
  tempersReal: STREAM_DEFS_LIST.every(d => Object.keys(d.tv.temper || {}).every(a => ['warmth','volatility','openness','conscientiousness','assertiveness'].includes(a))),
  professionsReal: STREAM_DEFS_LIST.every(d => !d.tv.profession || OCCUPATION_POOL.some(o => o.category === d.tv.profession)),
  saveKey: SAVE_KEYS.find(k => k.folder === 'world').keys.includes('tv'),
  fallback: (() => { const f = WORLD_KEY_FALLBACKS.tv(); return f.nowPlaying === null && ['progress','lastWatched','together','sittings','spoiled','spoiledBy','spoilDay','seeded'].every(k => f[k] && typeof f[k] === 'object'); })(),
  effect: !!EFFECT_DEFS.TV_WATCH && EFFECT_DEFS.TV_WATCH.llm === false && EFFECT_DEFS.TV_WATCH.implemented === true,
  emotion: !!EMOTIONAL_WEIGHTS[EVENT_EMOTION.tv_spoiler],
  verbDynamic: ACTION_DEFS['self.watch_tv'].narration.mode === 'dynamic' && !ACTION_DEFS['self.watch_tv'].shared.templates && ACTION_DEFS['self.watch_tv'].shared.rate === 'companionable',
})`);
check('every tv.js entry point is defined', reg.fns);
check('every Streamly show carries a well-formed tv block (format, release, a weekly cycle that fits its season)', reg.everyShowAirs);
check('every show has an episode-beat entry', reg.everyShowHasBeats);
check('show interests are real INTEREST_POOL names', reg.interestsReal, 'a typo here would silently pull nobody');
check('show temperament leans name real axes', reg.tempersReal);
check('a show profession is a real occupation category', reg.professionsReal);
check('world.tv is in SAVE_KEYS with an additive default of the full shape', reg.saveKey && reg.fallback);
check('TV_WATCH is a registered, trusted-only effect (the narrator never picks your show)', reg.effect);
check('tv_spoiler carries a real EMOTIONAL_WEIGHTS theme', reg.emotion);
check('Watch TV narrates dynamically and keeps its shared rate (no "whatever is on" templates)', reg.verbDynamic);
{
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
  const hn = html.indexOf('srcfiles/housenotes.js'), tvi = html.indexOf('srcfiles/tv.js'), rj = html.indexOf('srcfiles/render.js');
  check('index.html loads tv.js after housenotes.js and before render.js', hn > 0 && tvi > hn && rj > tvi);
  const lg = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
  check("loadgame.js's ORDER lists tv.js right after housenotes.js", /'housenotes\.js',[\s\S]{0,400}?'tv\.js'/.test(lg));
}

// ---------------------------------------------------------------- 1
console.log('\n1. The calendar — shows air');
const cal = J(`(() => {
  const out = { monotone: true, weeklyOneWeekday: true, fullWhole: true, nextIsReal: true, somethingOut: true, bad: [] };
  for (const d of STREAM_DEFS_LIST) {
    let prev = tvReleasedCount(d, 1);
    if (prev < 1) { out.somethingOut = false; out.bad.push(d.id + ' has nothing out on day 1'); }
    const dropDays = new Set();
    for (let day = 2; day <= 420; day++) {
      const r = tvReleasedCount(d, day);
      if (r < prev) { out.monotone = false; out.bad.push(d.id + ' went down on ' + day); }
      if (r > prev) {
        dropDays.add(getWeekday(day));
        if (d.tv.release === 'full' && r - prev !== d.tv.seasonEpisodes) { out.fullWhole = false; out.bad.push(d.id + ' dropped ' + (r - prev)); }
        if (d.tv.release === 'weekly' && r - prev !== 1) { out.weeklyOneWeekday = false; out.bad.push(d.id + ' weekly dropped ' + (r - prev)); }
      }
      prev = r;
    }
    if (d.tv.release === 'weekly' && dropDays.size !== 1) { out.weeklyOneWeekday = false; out.bad.push(d.id + ' drops on ' + dropDays.size + ' weekdays'); }
    for (const day of [1, 5, 40, 150]) {
      const nx = tvNextReleaseDay(d, day);
      if (nx == null || tvReleasedCount(d, nx) <= tvReleasedCount(d, day) || tvReleasedCount(d, nx - 1) !== tvReleasedCount(d, day)) { out.nextIsReal = false; out.bad.push(d.id + ' next from ' + day); }
    }
  }
  out.labels = [tvEpisodeLabel(tvShowDef('murder_actually'), 1), tvEpisodeLabel(tvShowDef('murder_actually'), 8), tvEpisodeLabel(tvShowDef('murder_actually'), 9)];
  out.day1 = STREAM_DEFS_LIST.map(d => tvReleasedCount(d, 1));
  return out;
})()`);
check('released counts never go down', cal.monotone, cal.bad.slice(0, 3).join('; '));
check('a weekly show adds exactly one episode a week, always on the same weekday', cal.weeklyOneWeekday, cal.bad.slice(0, 3).join('; '));
check('a full-drop show lands a whole season at once', cal.fullWhole, cal.bad.slice(0, 3).join('; '));
check('tvNextReleaseDay is the first day something new is out', cal.nextIsReal, cal.bad.slice(0, 3).join('; '));
check('every show has something out on day 1 (the TV is never empty)', cal.somethingOut, JSON.stringify(cal.day1));
check('episode labels count seasons (1 → S1 E1, 8 → S1 E8, 9 → S2 E1)', JSON.stringify(cal.labels) === JSON.stringify(['S1 E1', 'S1 E8', 'S2 E1']), JSON.stringify(cal.labels));

// ---------------------------------------------------------------- 2
console.log('\n2. The beats — what happens in each episode');
const beats = J(`(() => {
  const out = { filled: true, capital: true, unique: true, noWhile: true, poolsFit: true, culprit: true, newCase: true, told: true, bad: [] };
  for (const d of STREAM_DEFS_LIST) {
    const E = d.tv.seasonEpisodes; const P = TV_EPISODE_BEATS[d.id];
    const need = d.tv.format === 'episodic' ? (P.finale ? E - 1 : E) : E - 3;
    const run = d.tv.format === 'episodic' ? P.any : P.middle;
    if (!run || run.length < need) { out.poolsFit = false; out.bad.push(d.id + ' pool ' + (run ? run.length : 0) + ' < ' + need); }
    for (const pos of Object.keys(P)) if (pos !== 'cast') for (const l of P[pos]) if (/ while /.test(l)) { out.noWhile = false; out.bad.push(d.id + ' while'); }
    for (let s = 0; s < 3; s++) {
      const seen = new Set();
      for (let e = 1; e <= E; e++) {
        const b = tvEpisodeBeat(d.id, s * E + e);
        if (!b || /[{}]/.test(b)) { out.filled = false; out.bad.push(d.id + ' ' + (s * E + e) + ': ' + b); }
        if (!/^[A-Z"]/.test(b)) { out.capital = false; out.bad.push(d.id + ' lower: ' + b); }
        if (seen.has(b)) { out.unique = false; out.bad.push(d.id + ' S' + (s + 1) + ' repeats: ' + b); }
        seen.add(b);
        if (/^You\\b/.test(tvBeatTold(b))) out.told = false;
      }
    }
  }
  for (let s = 1; s <= 20; s++) {
    const c = tvSeasonCast('murder_actually', s);
    if (!c.culprit || c.culprit === c.suspect) { out.culprit = false; out.bad.push('S' + s + ' ' + c.suspect + '/' + c.culprit); }
    const b = tvSeasonCast('bake_off_but_worse', s);
    if (b.fav === b.rival || b.rival === b.winner || b.fav === b.winner) { out.culprit = false; out.bad.push('bake S' + s); }
    const n = tvSeasonCast('murder_actually', s + 1), t = tvSeasonCast('true_crime_files', s), tn = tvSeasonCast('true_crime_files', s + 1);
    if (c.victim === n.victim || t.case === tn.case) { out.newCase = false; out.bad.push('season ' + s + ' repeats its case'); }
  }
  out.finale = tvEpisodeBeat('murder_actually', 8);
  out.culprit1 = tvSeasonCast('murder_actually', 1).culprit;
  return out;
})()`);
check('every episode of the first three seasons has a filled beat (no {token} left)', beats.filled, beats.bad.slice(0, 3).join(' | '));
check('every beat starts a sentence properly (a token at the start is capitalised)', beats.capital, beats.bad.slice(0, 3).join(' | '));
check('no episode repeats another in the same season', beats.unique, beats.bad.slice(0, 3).join(' | '));
check("each show's run pool covers a whole season", beats.poolsFit, beats.bad.slice(0, 3).join(' | '));
check('the finale names the season culprit, and the culprit is never the red herring', beats.culprit && beats.finale.includes(beats.culprit1), beats.finale);
check('a new season is a new victim / a new case', beats.newCase, beats.bad.slice(0, 3).join(' | '));
check('no beat says " while " (verify-weather reads that word as the cozy weather clause)', beats.noWhile);
check("a beat as a roommate TELLS it drops the narrator's asides to you", beats.told);

// ---------------------------------------------------------------- 3
console.log('\n3. Taste — who follows what');
const taste = J(`(() => {
  const g = __mk(); const ids = __ids(g);
  const a = ids.map(id => tvFollowedShows(g.npcs[id], id).join());
  const b = ids.map(id => tvFollowedShows(g.npcs[id], id).join());
  let bounded = true, pulled = 0, notPulled = 0, trials = 0, hateGap = null;
  for (let s = 1; s <= 60; s++) {
    const h = __mk(1000 + s, 3);
    for (const id of __ids(h)) {
      const f = tvFollowedShows(h.npcs[id], id);
      if (f.length < 1 || f.length > TV_TUNING.followCount) bounded = false;
      const n = h.npcs[id];
      trials++;
      n.bible.interests = [{ name: 'true crime', skill: 10 }];
      if (tvFollowedShows(n, id).includes('true_crime_files')) pulled++;
      n.bible.interests = [{ name: 'fitness', skill: 10 }];
      if (tvFollowedShows(n, id).includes('true_crime_files')) notPulled++;
    }
  }
  const n = g.npcs[ids[0]];
  n.bible.occupation = { ...(n.bible.occupation || {}), category: 'finance' };
  const plain = tvAffinity(n, ids[0], 'code_black_comedy');
  n.bible.occupation = { ...n.bible.occupation, category: 'health' };
  hateGap = tvAffinity(n, ids[0], 'code_black_comedy') - plain;
  return { stable: JSON.stringify(a) === JSON.stringify(b), bounded, pulled, notPulled, trials, hateGap, hates: tvHateWatches(n, 'code_black_comedy') };
})()`);
check('tastes are stable (derived from the person, never rolled)', taste.stable);
check('everyone follows between one and followCount shows', taste.bounded);
check('an interest pulls: a true-crime fan follows True Crime Files far more often', taste.pulled > taste.notPulled * 2 && taste.pulled > taste.trials * 0.5, `${taste.pulled} vs ${taste.notPulled} of ${taste.trials}`);
check('the job the show is about pulls hardest (the nurse and the hospital drama)', Math.abs(taste.hateGap - api('TV_TUNING.professionBonus')) < 1e-9 && taste.hates, String(taste.hateGap));

// ---------------------------------------------------------------- 4
console.log('\n4. Starting places — fans are nearly caught up');
const seed = J(`(() => {
  const g = __mk(); const ids = __ids(g); const day = g.meta.clock.day;
  const before = ids.map(id => tvShowIds().map(s => tvProgress(g, id, s)));
  const tv = ensureTv(g);
  for (const id of ids) tvSeedViewer(g, tv, id, day);
  const after = ids.map(id => tvShowIds().map(s => tvProgress(g, id, s)));
  const maxLag = Math.max(...TV_TUNING.seedLag);
  let nearLatest = true, zeroElse = true;
  for (const id of ids) {
    const f = tvFollowedShows(g.npcs[id], id);
    for (const s of tvShowIds()) {
      const p = tvProgress(g, id, s), r = tvReleasedCount(tvShowDef(s), day);
      if (f.includes(s) && (p > r || p < r - maxLag)) nearLatest = false;
      if (!f.includes(s) && p !== 0) zeroElse = false;
    }
  }
  return { agree: JSON.stringify(before) === JSON.stringify(after), nearLatest, zeroElse, player: tvShowIds().every(s => tvProgress(g, 'player', s) === 0) };
})()`);
check('a read before the first tick agrees with what the first tick writes', seed.agree);
check('a roommate is within seedLag of the latest episode of every show they follow', seed.nearLatest);
check('and nowhere at all on shows they do not', seed.zeroElse);
check('you start at zero everywhere (no Streamly history)', seed.player);

// ---------------------------------------------------------------- 5
console.log('\n5. The living-room screen');
const screen = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  __follow(g, A, 'murder_actually'); __follow(g, B, 'bake_off_but_worse');
  const n0 = tvProgress(g, A, 'murder_actually');
  __sofa(g, A);
  const evA = { day: 3, tick: 40, roomId: 'living_room', npcId: A, type: 'watch_tv', data: {}, template: '{name} put the TV on and sprawled across the couch.' };
  __tick(g, 30, [evA]);
  const np1 = { ...g.world.tv.nowPlaying };
  // B arrives with the weather on — joins what is on, keeps the weather clause.
  __sofa(g, B);
  const evB = { day: 3, tick: 41, roomId: 'living_room', npcId: B, type: 'watch_tv', data: {}, template: '{name} put a film on and burrowed into the couch while the rain came down outside.' };
  __tick(g, 30, [evB]);
  const sitB = { ...g.world.tv.sittings[B] };
  // C sits down after the midpoint of A's episode; C is one behind on it, so
  // it WOULD be their next — only arriving late keeps it from them.
  const tvC = ensureTv(g); tvSeedViewer(g, tvC, C, g.meta.clock.day);
  tvC.progress[C].murder_actually = np1.n - 1;
  const bBefore = tvProgress(g, B, 'murder_actually');
  __sofa(g, C); __tick(g, 30, []);
  const aSaw = tvProgress(g, A, 'murder_actually');
  const bProg = tvProgress(g, B, 'murder_actually');
  const cProg = tvProgress(g, C, 'murder_actually');
  // Everyone gets up; the TV goes off.
  for (const id of [A, B, C]) __off(g, id);
  __tick(g, 30, []);
  const off = g.world.tv.nowPlaying === null && Object.keys(g.world.tv.sittings).length === 0;
  __sofa(g, A); __tick(g, 30, []);
  const sat = g.world.tv.sittings[A] || {};
  const np = g.world.tv.nowPlaying || {};
  const label = sat.showId ? tvShowDef(sat.showId).label : null;
  return { n0, np1, evA: formatEventText(evA, g.npcs), evB: formatEventText(evB, g.npcs), evBData: evB.data, sitB, aSaw, bBefore, bProg, cProg, cWould: np1.n - 1, off,
           nameA: g.npcs[A].bible.name, label, activity: tvActivityLabel(g, A, 'watching TV'), others: tvActivityLabel(g, A, 'reading'),
           room: tvRoomLine(g, 'living_room'), wantRoom: np.rerun ? 'The TV is on: an old episode of ' + label + '.' : 'The TV is on: ' + label + ', ' + tvEpisodeLabel(tvShowDef(np.showId), np.n) + '.',
           otherRoom: tvRoomLine(g, 'kitchen') };
})()`);
check('the first to sit down puts their next unseen episode on', screen.np1.showId === 'murder_actually' && screen.np1.n === screen.n0 + 1 && !screen.np1.rerun, JSON.stringify(screen.np1));
check('their watch_tv line names the show', screen.evA.includes('Murder, Actually') && screen.evA.startsWith(screen.nameA), screen.evA);
check('the next to sit down joins what is on, named with the one who put it on', screen.sitB.showId === 'murder_actually' && screen.evB.includes(screen.nameA) && screen.evBData.other && screen.evB.includes('Murder, Actually'), screen.evB);
check('and the weather clause the drive told it with survives', / while the rain came down outside\.$/.test(screen.evB), screen.evB);
check('whoever was there at the midpoint has seen the episode', screen.aSaw === screen.n0 + 1, `${screen.n0} -> ${screen.aSaw}`);
check('an episode that is not their next one is not credited (they had seen it)', screen.bProg === screen.bBefore);
check('arriving after the midpoint is not seeing it, even when it was their next one', screen.cProg === screen.cWould, JSON.stringify({ c: screen.cProg, would: screen.cWould }));
check('when everyone gets up the TV goes off', screen.off);
check('the room shows what is on: "watching <show>", "The TV is on: …"', screen.label && screen.activity === `watching ${screen.label}` && screen.others === 'reading' && screen.room === screen.wantRoom && screen.otherRoom === null, `${screen.activity} / ${screen.room} / ${screen.wantRoom}`);

const leaver = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  __follow(g, A, 'murder_actually');
  const n0 = tvProgress(g, A, 'murder_actually');
  __sofa(g, A); __tick(g, 30, []);   // sits at t, episode runs 60
  __tick(g, 30, []);                 // still there at t+30 (the midpoint)
  __off(g, A); __tick(g, 30, []);    // gone by t+60, when it ends
  return { n0, after: tvProgress(g, A, 'murder_actually') };
})()`);
check('somebody who got up during the tick the episode ended still saw it', leaver.after === leaver.n0 + 1, JSON.stringify(leaver));

const broken = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  __follow(g, A, 'murder_actually');
  const n0 = tvProgress(g, A, 'murder_actually');
  g.world.upgrades.living_room_entertainment = { tier: 'broken', condition: 0 };
  __sofa(g, A);
  const ev = { day: 3, tick: 40, roomId: 'living_room', npcId: A, type: 'watch_tv', data: {}, template: '{name} put the TV on and sprawled across the couch.' };
  for (let i = 0; i < 4; i++) __tick(g, 30, i === 0 ? [ev] : []);
  const off = { np: g.world.tv.nowPlaying, sits: Object.keys(g.world.tv.sittings).length, prog: tvProgress(g, A, 'murder_actually'), line: ev.template, card: tvActivityLabel(g, A, 'watching TV'), room: tvRoomLine(g, 'living_room') };
  // Repaired: the same roommate, the same sofa, and their show comes on.
  g.world.upgrades.living_room_entertainment = { tier: 'functional', condition: 100 };
  __tick(g, 30, []);
  return { n0, off, onShow: g.world.tv.nowPlaying && g.world.tv.nowPlaying.showId };
})()`);
check('a broken Living Room Setup plays nothing: no show, no progress, the plain line and activity', broken.off.np === null && broken.off.sits === 0 && broken.off.prog === broken.n0
  && broken.off.line === '{name} put the TV on and sprawled across the couch.' && broken.off.card === 'watching TV' && broken.off.room === null, JSON.stringify(broken.off));
check('repair it and their show comes on', broken.onShow === 'murder_actually', String(broken.onShow));

const binge = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const tv = ensureTv(g); tv.seeded[A] = 1; tv.progress[A] = { the_neighborhood: 1 };
  g.npcs[A].bible.interests = [{ name: 'comedy', skill: 10 }, { name: 'film', skill: 10 }];
  const start = tvProgress(g, A, 'the_neighborhood');
  __sofa(g, A);
  for (let i = 0; i < 16; i++) __tick(g, 30, []);
  return { start, end: tvProgress(g, A, 'the_neighborhood'), np: g.world.tv.nowPlaying };
})()`);
check('a binge ends: one sitting sees at most maxChain new episodes, then reruns play', binge.end - binge.start === api('TV_TUNING.maxChain') && binge.np && binge.np.rerun === true, JSON.stringify({ start: binge.start, end: binge.end, np: binge.np }));

// ---------------------------------------------------------------- 6
console.log('\n6. Your Watch TV');
const plans = J(`(() => {
  const out = {};
  const g = __mk(); const [A, B] = __ids(g);
  g.player.location = 'living_room';
  // buzz / discover: nothing watched yet, a roommate is into something.
  const p0 = tvPlanPlayerWatch(g, []);
  out.first = { mode: p0.mode, n: p0.n, rel: p0.relations.player };
  tvApplyPlayerWatch(g, p0.showId, p0.n, p0.rerun, [], 30);
  out.firstSeen = tvProgress(g, 'player', p0.showId) === p0.n;
  // yours
  const p1 = tvPlanPlayerWatch(g, []);
  out.second = { mode: p1.mode, show: p1.showId === p0.showId, n: p1.n };
  // together: you and B level on a show, B in the room
  __follow(g, B, 'murder_actually');
  const tv = ensureTv(g);
  tv.progress.player.murder_actually = tvProgress(g, B, 'murder_actually');
  tv.lastWatched.player.murder_actually = g.meta.clock.day;
  const p2 = tvPlanPlayerWatch(g, [B]);
  out.together = { mode: p2.mode, show: p2.showId, rel: p2.relations };
  const line2 = tvWatchNarration(g, p2);
  tvApplyPlayerWatch(g, p2.showId, p2.n, p2.rerun, [B], 30);
  out.togetherAfter = { you: tvProgress(g, 'player', 'murder_actually') === p2.n, them: tvProgress(g, B, 'murder_actually') === p2.n, marked: !!tv.together[B] && tv.together[B].murder_actually === g.meta.clock.day };
  out.line2 = line2; out.nameB = g.npcs[B].bible.name;
  out.screenYours = tv.nowPlaying && tv.nowPlaying.byId === 'player' && tv.nowPlaying.credited.includes('player') && tv.nowPlaying.credited.includes(B);
  // join: A has something on
  tv.nowPlaying = null; tv.sittings = {};
  __follow(g, A, 'code_black_comedy');
  __sofa(g, A); resolveTvTick(g, {}, __ids(g), 1, []);
  const p3 = tvPlanPlayerWatch(g, [A]);
  out.join = { mode: p3.mode, show: p3.showId, youRel: p3.relations.player, themRel: p3.relations[A] };
  tvApplyPlayerWatch(g, p3.showId, p3.n, p3.rerun, [A], 30);
  out.joinAfter = { spoiledYou: tv.spoiled.code_black_comedy === p3.n && tv.spoiledBy.code_black_comedy === 'tv', youStill: tvProgress(g, 'player', 'code_black_comedy') === 0,
                    themCredited: tvProgress(g, A, 'code_black_comedy') === p3.n, npCredited: tv.nowPlaying.credited.includes(A) };
  // a tick later the clock does not credit A twice
  const before = tvProgress(g, A, 'code_black_comedy');
  for (let i = 0; i < 3; i++) __tick(g, 30, []);
  out.noDouble = tvProgress(g, A, 'code_black_comedy') >= before;
  out.line3 = tvWatchNarration(g, p3);
  // theirs: nothing on, only A's show would do (you've seen nothing fresh of yours)
  const h = __mk(4242); const [X] = __ids(h); h.player.location = 'living_room';
  __follow(h, X, 'wilderness');
  const tvh = ensureTv(h);
  for (const s of tvShowIds()) { tvh.progress.player[s] = tvReleasedCount(tvShowDef(s), h.meta.clock.day); }
  tvh.progress.player.wilderness = 0;
  const p4 = tvPlanPlayerWatch(h, [X]);
  out.theirs = { mode: p4.mode, show: p4.showId };
  // comfort: caught up on everything, alone
  tvh.progress.player.wilderness = tvReleasedCount(tvShowDef('wilderness'), h.meta.clock.day);
  const p5 = tvPlanPlayerWatch(h, []);
  out.comfort = { mode: p5.mode, rerun: p5.rerun, rel: p5.relations.player };
  // discover: a solo flat, nothing followed by anyone, nothing watched
  const s = __mk(99, 0); s.player.location = 'living_room';
  const p6 = tvPlanPlayerWatch(s, []);
  out.discover = { mode: p6.mode, n: p6.n };
  return out;
})()`);
check('first ever Watch TV: the show a roommate is into, from episode one', plans.first.mode === 'buzz' && plans.first.n === 1 && plans.first.rel === 'fresh' && plans.firstSeen, JSON.stringify(plans.first));
check('next time: the next episode of your show', plans.second.mode === 'yours' && plans.second.show && plans.second.n === 2, JSON.stringify(plans.second));
check('level with a roommate in the room: the next one, together', plans.together.mode === 'together' && plans.together.show === 'murder_actually' && Object.values(plans.together.rel).every(r => r === 'fresh'), JSON.stringify(plans.together));
check('and both of you have seen it, marked as watched together', plans.togetherAfter.you && plans.togetherAfter.them && plans.togetherAfter.marked, JSON.stringify(plans.togetherAfter));
check('the line names who was on the sofa and what was on (the two-person version, D17)', plans.line2.includes(plans.nameB) && plans.line2.includes('Murder, Actually'), plans.line2);
check('the screen is yours for the half hour, already credited', plans.screenYours);
check('a roommate with something on: you join it', plans.join.mode === 'join' && plans.join.show === 'code_black_comedy' && plans.join.themRel === 'fresh', JSON.stringify(plans.join));
check('joining mid-season out of order: no credit for you, but now you know (spoiled by the TV)', plans.join.youRel === 'skip' && plans.joinAfter.spoiledYou && plans.joinAfter.youStill, JSON.stringify(plans.joinAfter));
check('they are credited once, and the screen knows it', plans.joinAfter.themCredited && plans.joinAfter.npCredited && plans.noDouble, JSON.stringify(plans.joinAfter));
check('the out-of-order line says so', /out of order/.test(plans.line3), plans.line3);
check('nothing of yours to watch: whatever the roommate here is into', plans.theirs.mode === 'theirs' && plans.theirs.show === 'wilderness', JSON.stringify(plans.theirs));
check('caught up on everything and alone: an old episode, no credit', plans.comfort.mode === 'comfort' && plans.comfort.rerun && plans.comfort.rel === 'rerun', JSON.stringify(plans.comfort));
check('an empty flat and nothing started: you land on a first episode of something', plans.discover.mode === 'discover' && plans.discover.n === 1, JSON.stringify(plans.discover));

const verb = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  g.player.location = 'living_room';
  __follow(g, A, 'bake_off_but_worse');
  const tv = ensureTv(g);
  tv.progress.player.bake_off_but_worse = tvProgress(g, A, 'bake_off_but_worse');
  tv.lastWatched.player.bake_off_but_worse = g.meta.clock.day;
  g.npcs[A].location = 'living_room'; g.npcs[A].activity = '';
  const c = buildActionContext(g);
  const def = ACTION_DEFS['self.watch_tv'];
  const prepared = def.prepare(c);
  const lines = def.buildEffects(c, prepared);
  const tvLine = lines.find(l => l.startsWith('TV_WATCH '));
  const before = tvProgress(g, 'player', 'bake_off_but_worse');
  const effCtx = buildEffectContext(g, [], [], c.roomObjects, []);
  applyEffects(parseEffectDSL(tvLine), effCtx);
  const shared = resolveSharedActivity(g, def, c, 30);
  const line = narrateAction(def, c, prepared, shared);
  const alone = (() => { const h = __mk(77); h.player.location = 'living_room'; const hc = buildActionContext(h); const pr = ACTION_DEFS['self.watch_tv'].prepare(hc); return narrateAction(ACTION_DEFS['self.watch_tv'], hc, pr, resolveSharedActivity(h, ACTION_DEFS['self.watch_tv'], hc, 30)); })();
  return { tvLine, moodKept: lines.some(l => l.startsWith('ADJUST_NEED player mood')), before, after: tvProgress(g, 'player', 'bake_off_but_worse'), them: tvProgress(g, A, 'bake_off_but_worse'),
           line, name: g.npcs[A].bible.name, alone, factWritten: shared.facts.length === 1 };
})()`);
check('the verb emits the mood impulse it always did plus TV_WATCH for the planned episode', verb.moodKept && /^TV_WATCH bake_off_but_worse \d+ 0 npc_/.test(verb.tvLine || ''), verb.tvLine);
check('TV_WATCH through the real DSL moves you and the roommate beside you on by one', verb.after === verb.before + 1 && verb.them === verb.after, JSON.stringify(verb));
check('narrateAction gives the TV line with the roommate named, and the shared fact still lands', verb.line.includes(verb.name) && verb.line.includes('Bake Off (But Worse)') && verb.factWritten, verb.line);
check('alone, the line still has a show in it', /Watch|watch|put|land|flick|talking/.test(verb.alone) && !/Mindless/.test(verb.alone), verb.alone);

// ---------------------------------------------------------------- 7
console.log('\n7. Spoilers');
const spoil = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const day = g.meta.clock.day;
  __follow(g, A, 'murder_actually'); __follow(g, B, 'murder_actually');
  const tv = ensureTv(g);
  tv.progress.player.murder_actually = 2; tv.lastWatched.player.murder_actually = day;
  g.npcs[A].bible.temperament = { warmth: -1, volatility: 1, openness: 0, conscientiousness: -1, assertiveness: 1, selfAwareness: 0 };
  g.npcs[B].bible.temperament = { warmth: 1, volatility: -1, openness: 0, conscientiousness: 1, assertiveness: -1, selfAwareness: 0 };
  const res = (ids, room) => ids.map(id => ({ id, location: room, activity: 'idle' }));
  g.player.location = 'kitchen';
  // Force the roll: a long span makes chanceOverMinutes ~1.
  const q = tvProgress(g, A, 'murder_actually');
  const blurt = tvMaybeSpoil(g, tv, res([A], 'kitchen'), day, 600, 100000);
  const sameDay = tvMaybeSpoil(g, tv, res([A], 'kitchen'), day, 630, 100000);
  // B is one further on than anything you already know, so B COULD spoil.
  tv.progress[B].murder_actually = q + 1;
  const careful = tvMaybeSpoil(g, tv, res([B], 'kitchen'), day, 600, 100000);
  const carefulKept = tv.spoiled.murder_actually === q;
  const otherRoom = tvMaybeSpoil(g, tv, res([A], 'bedroom_x'), day + 1, 600, 100000);
  g.player.flags = { ...(g.player.flags || {}), _vulnerableState: 'sleeping' };
  const asleepPlayer = tvMaybeSpoil(g, tv, res([A], 'kitchen'), day + 2, 600, 100000);
  g.player.flags._vulnerableState = null;
  const asleepNpc = tvMaybeSpoil(g, tv, [{ id: A, location: 'kitchen', activity: 'sleeping' }], day + 3, 600, 100000);
  // Not actively watching (last watched long ago): nothing.
  tv.lastWatched.player.murder_actually = day - TV_TUNING.activeDays - 1;
  const stale = tvMaybeSpoil(g, tv, res([A], 'kitchen'), day + 4, 600, 100000);
  tv.lastWatched.player.murder_actually = day;
  // Walk up to the spoiled episode: the tail fires there and only there.
  tv.progress.player.murder_actually = q - 2;
  const pBefore = tvPlanPlayerWatch(g, []);
  tv.progress.player.murder_actually = q - 1;
  const pAt = tvPlanPlayerWatch(g, []);
  return { blurtAt: TV_TUNING.spoiler.blurtAt, a: tvBlurt(g.npcs[A]), b: tvBlurt(g.npcs[B]),
           blurt: blurt && { type: blurt.type, text: formatEventText(blurt, g.npcs), npcId: blurt.npcId, roomId: blurt.roomId },
           beat: tvBeatTold(tvEpisodeBeat('murder_actually', q)), q, spoiled: tv.spoiled.murder_actually, by: tv.spoiledBy.murder_actually, A, B,
           sameDay, careful: careful && { type: careful.type, text: formatEventText(careful, g.npcs) }, carefulKept, otherRoom, asleepPlayer, asleepNpc, stale,
           tailBefore: tvWatchNarration(g, pBefore), tailAt: tvWatchNarration(g, pAt), nameA: g.npcs[A].bible.name };
})()`);
check('temperament decides: the volatile, blunt, careless one blurts; the warm, careful one does not', spoil.a >= spoil.blurtAt && spoil.b < spoil.blurtAt, `${spoil.a} / ${spoil.b}`);
check('a blurted spoiler is the real beat of the episode they just saw, in your room', spoil.blurt && spoil.blurt.type === 'tv_spoiler' && spoil.blurt.text.includes(spoil.beat) && spoil.blurt.roomId === 'kitchen' && spoil.blurt.text.startsWith(spoil.nameA), JSON.stringify(spoil.blurt));
check('and you now know that episode, and who told you', spoil.spoiled === spoil.q && spoil.by === spoil.A);
check('once a roommate per day', spoil.sameDay === null);
check('the careful one catches themselves (a near miss, nothing spoiled)', spoil.careful && spoil.careful.type === 'tv_near_spoiler' && !/S\d+ E\d+:/.test(spoil.careful.text) && spoil.carefulKept, JSON.stringify(spoil.careful));
check('not from another room, not while you sleep, not in their sleep', spoil.otherRoom === null && spoil.asleepPlayer === null && spoil.asleepNpc === null);
check('not about a show you stopped watching', spoil.stale === null);
check('reaching the spoiled episode: "You already knew. Thanks, <them>." — and not an episode earlier', spoil.tailAt.includes(`You already knew. Thanks, ${spoil.nameA}.`) && !spoil.tailBefore.includes('already knew'), spoil.tailAt);

// ---------------------------------------------------------------- 8
console.log('\n8. Streamly');
const stream = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  g.world.computer = g.world.computer || { apps: {} };
  g.world.computer.apps = g.world.computer.apps || {};
  g.world.computer.apps.stream = { subscriptions: [], watchHistory: [], resumePoints: { murder_actually: 99, wilderness: 2 } };
  // Old saves: Streamly's resume points are adopted once, never past what's out.
  const adopt = { ma: tvProgress(g, 'player', 'murder_actually'), wi: tvProgress(g, 'player', 'wilderness') };
  const r1 = watchEpisode(g, 'wilderness');
  const r2 = watchEpisode(g, 'murder_actually');
  __follow(g, A, 'the_great_debate');
  const behind = tvProgress(g, A, 'the_great_debate');
  ensureTv(g).progress.player.the_great_debate = behind;
  const r3 = watchEpisode(g, 'the_great_debate');
  const meta = tvStreamCardMeta(g, 'the_great_debate');
  return { adopt, released: tvReleasedCount(tvShowDef('murder_actually'), g.meta.clock.day), r1: { ep: r1.episode, line: r1.line }, r2: { ep: r2.episode, line: r2.line },
           rp: g.world.computer.apps.stream.resumePoints, hist: g.world.computer.apps.stream.watchHistory.length, r3: r3.line, name: g.npcs[A].bible.name, meta };
})()`);
check('old Streamly resume points become your place, clamped to what is out', stream.adopt.wi === 2 && stream.adopt.ma === stream.released, JSON.stringify(stream.adopt));
check('watching moves you on and says what happened', stream.r1.ep === 3 && /Wilderness, S1 E3\./.test(stream.r1.line), stream.r1.line);
check('caught up: you rewatch the latest (the mood never goes away), and the counter keeps its old shape', /caught up/.test(stream.r2.line) && stream.rp.wilderness === 3 && stream.hist === 3, JSON.stringify(stream));
check('overtaking a roommate warns you: they have not seen this one yet', stream.r3.includes(stream.name) && /(hasn't|haven't) seen this one yet\. Careful\.$/.test(stream.r3), stream.r3);
check('the Streamly card says where the season is and who watches', /S\d+ · \d+ of \d+ out/.test(stream.meta) && stream.meta.includes(stream.name), stream.meta);

// ---------------------------------------------------------------- 8b
console.log('\n8b. D16 the dead screen, D17 the Now Playing panel');
const d16 = J(String.raw`(() => {
  const g = __mk(); const [A] = __ids(g);
  const cand = () => isDriveCandidate('watch_tv', DRIVE_DEFS.watch_tv, g.npcs[A], g, { npcId: A, nowAbs: __now(g), perceived: {}, isVisitor: false });
  const works = cand();
  const seen = new Set(); for (let k = 0; k < 300; k++) seen.add(resolveRoomForActivity('midday', A, g.npcs, mulberry32(k * 31 + 7), g.meta.clock, g).activity);
  g.world.upgrades.living_room_entertainment = { tier: 'broken', condition: 0 };
  const dead = cand();
  const seenDead = new Set(); for (let k = 0; k < 300; k++) seenDead.add(resolveRoomForActivity('midday', A, g.npcs, mulberry32(k * 31 + 7), g.meta.clock, g).activity);
  const evDead = new Set(); for (let k = 0; k < 300; k++) evDead.add(resolveRoomForActivity('evening', A, g.npcs, mulberry32(k * 31 + 9), g.meta.clock, g).activity);
  return { works, dead, seen: [...seen], seenDead: [...seenDead], evDead: [...evDead], keep: tvScreenActivity(g, 'reading'), other: MAINTENANCE.npcDecayActions.seek_company };
})()`);
check('the TV drive is a candidate with a working Living Room Setup and not with a broken one', d16.works === true && d16.dead === false, JSON.stringify({ w: d16.works, d: d16.dead }));
check('the schedule tables: TV / a show appear with the setup working, are swapped for something else when it is broken, and other activities are untouched', d16.seen.includes('watching TV') && !d16.seenDead.includes('watching TV') && !d16.evDead.includes('watching a show') && d16.seenDead.includes('reading') && d16.keep === 'reading', JSON.stringify({ seen: d16.seen, dead: d16.seenDead }));
check('the maintenance table itself is untouched (seek_company still maps to the setup)', d16.other.includes('living_room_entertainment'));

const d17 = J(String.raw`(() => {
  const g = __mk();
  g.world.computer = g.world.computer || { apps: {} };
  g.world.computer.apps = g.world.computer.apps || {};
  g.world.computer.apps.stream = { subscriptions: [], watchHistory: [], resumePoints: {} };
  const none = tvStreamPanel(g);
  watchEpisode(g, 'wilderness'); watchEpisode(g, 'wilderness');
  const p1 = tvStreamPanel(g);
  watchEpisode(g, 'murder_actually');
  const p2 = tvStreamPanel(g);
  return { none, p1, p2 };
})()`);
check('Streamly\'s Now Playing panel: nothing before you have watched anything', d17.none === null);
check('after watching it names the show, your place and how far through the season, and switches to the newest show', d17.p1 && d17.p1.showId === 'wilderness' && /S1 E2/.test(d17.p1.episode) && d17.p1.pct > 0 && d17.p2.showId === 'murder_actually', JSON.stringify({ p1: d17.p1, p2: d17.p2 }));
check('renderStreamly reads the panel from tv.js, not the never-written watchingShowId', !/watchingShowId/.test(srcOf('render.computer.js')) && /tvStreamPanel\(gs\)/.test(srcOf('render.computer.js')));

// ---------------------------------------------------------------- 8c
console.log('\n8c. D12 the What\'s On picker');
const d12 = J(String.raw`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const opts = tvWatchOptions(g, []);
  const all = tvShowIds().filter(id => tvReleasedCount(tvShowDef(id), g.meta.clock.day) >= 1);
  const day = g.meta.clock.day;
  // a show you're one behind on sorts up; a show on now sorts first
  ensureTv(g).progress.player = { murder_actually: tvReleasedCount(tvShowDef('murder_actually'), day) - 1 };
  ensureTv(g).lastWatched.player = { murder_actually: day };
  const o2 = tvWatchOptions(g, []);
  __sofa(g, A);
  const tv = ensureTv(g);
  tv.sittings[A] = { showId: 'wilderness', startAbs: __now(g), untilAbs: __now(g) + 30 };
  tv.nowPlaying = { showId: 'wilderness', n: 2, byId: A, startAbs: __now(g), untilAbs: __now(g) + 30, rerun: false, chain: 0, credited: [] };
  const o3 = tvWatchOptions(g, [A]);
  const picked = tvPlanPlayerWatch(g, [], 'the_great_debate');
  const rewatch = (() => { const h = __mk(); const d = h.meta.clock.day; const q = ensureTv(h); q.progress.player = { wilderness: tvReleasedCount(tvShowDef('wilderness'), d) }; return tvPlanPlayerWatch(h, [], 'wilderness'); })();
  const joined = tvPlanPlayerWatch(g, [A], 'wilderness');
  const bad = tvPlanPlayerWatch(g, [], 'no_such_show');
  const none = tvPlanPlayerWatch(g, [], null);
  const line = tvWatchNarration(g, picked);
  return { n: opts.length, all: all.length, first2: o2[0].showId, o3first: o3[0].showId, o3note: o3[0].note, picked: picked && { mode: picked.mode, showId: picked.showId, n: picked.n, rerun: picked.rerun },
    rewatch: rewatch && { mode: rewatch.mode, rerun: rewatch.rerun }, joinedMode: joined && joined.mode, badMode: bad && bad.mode, noneMode: none && none.mode, line };
})()`);
check('the picker lists every show that is out, none twice', d12.n === d12.all && d12.n > 1, JSON.stringify({ n: d12.n, all: d12.all }));
check('a show you are behind on rises to the top; a show on now beats it and says so', d12.first2 === 'murder_actually' && d12.o3first === 'wilderness' && /on now/.test(d12.o3note), JSON.stringify({ f: d12.first2, o3: d12.o3first, note: d12.o3note }));
check('picking a show plays your next episode of it; caught up plays the latest again as a rewatch', d12.picked.mode === 'pick' && d12.picked.showId === 'the_great_debate' && d12.picked.n >= 1 && d12.rewatch.mode === 'pick' && d12.rewatch.rerun === true, JSON.stringify({ p: d12.picked, r: d12.rewatch }));
check('picking what somebody already has on is just joining it; an unknown pick or none falls back to the room\'s choice', d12.joinedMode === 'join' && d12.badMode !== 'pick' && d12.noneMode !== 'pick', JSON.stringify({ j: d12.joinedMode, b: d12.badMode, n: d12.noneMode }));
check('the line says what you put on', /The Great Debate/.test(d12.line) && /you|You/.test(d12.line), d12.line);
const fakeDom = srcOf('render.js');
check('the picker is in render.js and prepareWatchTv awaits it only when it is loaded (headless: the room picks)', /function openTvPicker\(/.test(fakeDom) && /typeof openTvPicker === 'function'/.test(srcOf('defs.actions.js')));

// ---------------------------------------------------------------- 8d
console.log('\n8d. D11 watch parties, D13 Chatter, D14 movie nights');
api(`
  __feed = (g) => { g.world.computer = g.world.computer || { apps: {} }; g.world.computer.apps = g.world.computer.apps || {}; g.world.computer.apps.social_feed = { posts: [], nextPostId: 1 }; return g.world.computer.apps.social_feed; };
  __bigDay = (g, id, positions) => { for (let d = 3; d < 400; d++) { const b = tvBigNights(g, d, positions || ['premiere', 'finale']).find(x => x.def.id === id); if (b) return { day: d, n: b.n, position: b.position }; } return null; };
  __setDay = (g, d, minutes) => { g.meta.clock.day = d; g.meta.clock.minutes = minutes === undefined ? 300 : minutes; };
  __partyFixture = () => {
    const g = __mk(); const ids = __ids(g); const A = ids[0];
    const show = tvFollowedShows(g.npcs[A], A)[0];
    const big = __bigDay(g, show);
    __setDay(g, big.day);
    __feed(g);
    __follow(g, A, show);
    return { g, A, ids, show, big };
  };
`);
const party = J(`(() => {
  const { g, A, ids, show, big } = __partyFixture();
  const out = processTvForDay(g, big.day);
  const c = (g.world.commitments || []).find(x => x.watchParty);
  const again = processTvForDay(g, big.day);
  const invited = c ? c.invitedIds.length : 0;
  // the party begins
  __setDay(g, big.day, c.startAbs % 1440 + 5);
  for (const id of ids) { g.npcs[id].location = 'living_room'; g.npcs[id].activity = tvPartyActivity(g, id) || 'x'; }
  g.player.location = 'living_room';
  const actA = g.npcs[A].activity;
  __tick(g, 30);
  const np = ensureTv(g).nowPlaying;
  const started = c.watchParty.started === true;
  for (const id of ids) tvNotePartyPresence(g, c, id);
  const moodBefore = g.npcs[A].mood;
  // the next rollover pays it out
  const r = processTvForDay(g, big.day + 1);
  const ev = (g.world.events || []).find(e => e.type === 'watch_party');
  return { hasC: !!c, kind: c && c.kind, room: c && c.roomId, host: c && c.host, A, invited, lines: out.lines, again: again.lines.length, dup: (g.world.commitments || []).filter(x => x.watchParty).length,
    partyDay: ensureTv(g).partyDay, day: big.day, actA, np: np && { showId: np.showId, n: np.n, party: np.party }, started, n: big.n, show,
    resolved: c.watchParty.resolved, payLines: r.lines, moodUp: g.npcs[A].mood > moodBefore, ev: !!ev, attended: c.attended };
})()`);
check('a follower who is level on a premiere/finale proposes a watch party: a living-room hangout marked watchParty, everyone else invited', party.hasC && party.kind === 'hangout' && party.room === 'living_room' && party.host === party.A && party.invited >= 1 && party.lines.length === 1 && /watch party/.test(party.lines[0]), JSON.stringify({ c: party.hasC, k: party.kind, h: party.host, l: party.lines }));
check('the invitation is not repeated the same day, and there is a cooldown between parties', party.again === 0 && party.dup === 1 && party.partyDay === party.day);
check('while it is live, the people it holds are watching TV and its episode goes on (once)', party.actA === 'watching TV' && party.np && party.np.showId === party.show && party.np.n === party.n && party.np.party === true && party.started, JSON.stringify({ a: party.actA, np: party.np }));
check('the next rollover pays it out: who came is in the ledger, they are in a better mood, the line and the event land', party.resolved === true && party.attended.includes('player') && party.moodUp && party.ev && party.payLines.length === 1 && /watched/.test(party.payLines[0]), JSON.stringify({ r: party.resolved, att: party.attended, l: party.payLines }));

const chat = J(`(() => {
  const { g, A, ids, show, big } = __partyFixture();
  const feed = g.world.computer.apps.social_feed;
  tvChatterForDay(g, big.day);
  const bigPosts = feed.posts.length;
  const showLabel = tvShowDef(show).label;
  const mention = feed.posts.some(p => p.text.includes(showLabel) || /tonight|finale|dread|snacks|Clear/i.test(p.text));
  // a spoiler: B is ahead of you on something you are watching
  const h = __mk(); const [B] = __ids(h); __feed(h);
  const sh = tvShowIds()[0];
  const day = h.meta.clock.day;
  const t = ensureTv(h); t.seeded[B] = 1; t.progress[B] = {}; t.progress.player = {}; t.lastWatched.player = {};
  let post = null;
  for (let d = day; d < day + 200 && !post; d++) {
    h.meta.clock.day = d;
    const rel = tvReleasedCount(tvShowDef(sh), d);
    t.lastWatched.player[sh] = d; t.progress.player[sh] = Math.max(1, rel - 2); t.progress[B][sh] = rel; t.spoiled = {};
    h.world.computer.apps.social_feed.posts.length = 0;
    tvChatterForDay(h, d);
    post = h.world.computer.apps.social_feed.posts.find(p => p.author === B && /(SPOILER|spoiler|cannot believe|talk to me)/.test(p.text));
  }
  return { bigPosts, mention, post: post && post.text, blurts: tvBlurt(h.npcs[B]) >= TV_TUNING.spoiler.blurtAt, spoiled: t.spoiled[sh] || 0, tagged: !!post && /^(SPOILERS|spoiler tag)/.test(post.text) };
})()`);
check('D13: followers post about the premiere or finale of a show the day it airs', chat.bigPosts >= 1 && chat.mention, JSON.stringify({ n: chat.bigPosts }));
check('D13: a resident who is ahead of you on something you are watching sometimes posts about it; a blurter\'s post is plain and counts as told', chat.post && chat.blurts && !chat.tagged && chat.spoiled > 0, JSON.stringify({ post: chat.post, spoiled: chat.spoiled, blurts: chat.blurts }));

const film = J(`(() => {
  const g = __mk(); const ids = __ids(g); const A = ids[0];
  TV_TUNING.films.horror_night.hostAffinity = -9; TV_TUNING.films.cozy_movie.hostAffinity = -9;
  let hd = null, cd = null;
  for (let d = 3; d < 400 && (!hd || !cd); d++) { const on = occasionsOnDay(d); if (!hd && on.some(o => o.id === 'halloween' && o.night === 1)) hd = d; if (!cd && on.some(o => o.id === 'midwinter' && o.night === 1)) cd = d; }
  __setDay(g, hd); __feed(g);
  const out = processTvForDay(g, hd);
  const c = (g.world.commitments || []).find(x => x.watchParty && x.watchParty.film);
  __setDay(g, hd, c.startAbs % 1440 + 5);
  for (const id of ids) { g.npcs[id].location = 'living_room'; g.npcs[id].activity = tvPartyActivity(g, id) || 'x'; }
  g.player.location = 'living_room';
  __tick(g, 30);
  const np = ensureTv(g).nowPlaying;
  const label = tvActivityLabel(g, A, 'watching TV');
  const room = tvRoomLine(g, 'living_room');
  for (const id of ids) tvNotePartyPresence(g, c, id);
  const p = processTvForDay(g, hd + 1);
  const g2 = __mk(); __setDay(g2, cd); __feed(g2);
  const out2 = processTvForDay(g2, cd);
  const c2 = (g2.world.commitments || []).find(x => x.watchParty && x.watchParty.film);
  const g3 = __mk(); g3.world.upgrades.living_room_entertainment = { tier: 'broken', condition: 0 }; __setDay(g3, hd);
  const out3 = processTvForDay(g3, hd);
  return { out: out.lines, kind: c && c.watchParty.film.kind, title: c && c.watchParty.film.title, np, label, room, pay: p.lines, cozy: out2.lines, cozyKind: c2 && c2.watchParty.film.kind, broken: out3.lines.length };
})()`);
check('D14: Halloween puts on a horror film in the living room, Midwinter a cozy one, each with a named film and an invitation', film.kind === 'horror_night' && /horror film/.test(film.out[0]) && film.title && film.cozyKind === 'cozy_movie' && /winter film/.test(film.cozy[0]), JSON.stringify({ o: film.out, c: film.cozy }));
check('while a film is on, the screen shows it (room line, "watching <film>") and no episode is put on', film.np === null && film.label === 'watching ' + film.title && film.room.includes(film.title), JSON.stringify({ np: film.np, label: film.label, room: film.room }));
check('the next rollover pays the film night out with its own line; a broken Living Room Setup means no film night at all', film.pay.length === 1 && film.pay[0].includes(film.title) && film.broken === 0, JSON.stringify({ pay: film.pay, broken: film.broken }));

{
  const ui = srcOf('ui.js'), sim = srcOf('sim.js'), cfg = srcOf('config.js');
  check('wired in: the rollover calls processTvForDay, sim binds the party activity and writes the ledger, watch_party is a registered event', /processTvForDay\(currentGameState, day\)/.test(ui) && /tvPartyActivity\(gameState, id\)/.test(sim) && /tvNotePartyPresence\(gameState, wp, id\)/.test(sim) && /watch_party:\s+'social'/.test(cfg) && /watch_party:\s+'warmth'/.test(cfg));
  const vocab = /\b(church|christ|god|pray|prayer|holy|sacred|bless|angel|saint|bible|easter|hymn|worship|faith|religio)/i;
  const T = api('JSON.stringify([TV_TUNING.chatter, TV_TUNING.party, TV_TUNING.films])');
  check('R1: no religion in a single authored line of the new tables', !vocab.test(T), (T.match(vocab) || [''])[0]);
}

// ---------------------------------------------------------------- 9
console.log('\n9. The conversation prompt');
const prompt = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const tv = ensureTv(g); tvSeedViewer(g, tv, A, g.meta.clock.day);
  // Their real top show, whatever their derived taste made it.
  const main = tvNpcShows(g, A).filter(s => tvProgress(g, A, s) > 0)[0];
  const label = tvShowDef(main).label;
  const q = tvProgress(g, A, main);
  const plain = tvPromptLine(g, A);
  tv.progress.player[main] = q - 2; tv.lastWatched.player[main] = g.meta.clock.day;
  const behind = tvPromptLine(g, A);
  tv.progress.player[main] = q; tv.together[A] = {}; tv.together[A][main] = g.meta.clock.day;
  const level = tvPromptLine(g, A);
  tv.progress.player[main] = q + 1;
  const ahead = tvPromptLine(g, A);
  // A nurse whose favorite is the hospital drama.
  const h = __mk(555); const [N] = __ids(h);
  h.npcs[N].bible.occupation = { ...(h.npcs[N].bible.occupation || {}), category: 'health' };
  h.npcs[N].bible.interests = [{ name: 'film', skill: 10 }, { name: 'volunteering', skill: 10 }];
  h.npcs[N].bible.temperament = { ...h.npcs[N].bible.temperament, volatility: 1, warmth: 1 };
  const top = tvFollowedShows(h.npcs[N], N)[0];
  const hate = tvPromptLine(h, N);
  const block = buildNpcBlockV2({ ...g.npcs[A], id: A, name: g.npcs[A].bible.name }, null, 'scene', g.meta.clock.day, g);
  // The same person as a guest rather than a resident: nothing.
  const B = __ids(g)[1];
  g.npcs[B].residency = { ...g.npcs[B].residency, status: 'visitor' };
  return { label, plain, behind, level, ahead, top, hate, beat: tvBeatTold(tvEpisodeBeat(main, q)), inBlock: block.includes('[Watching]:'),
           visitor: tvPromptLine(g, B) };
})()`);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
check('[Watching] names the show and what just happened in it', prompt.plain.startsWith('[Watching]: ') && prompt.plain.includes(`is hooked on ${prompt.label}`) && prompt.plain.includes(prompt.beat), prompt.plain);
check('you behind them: spoiler territory', /2 episodes behind/.test(prompt.behind) && /Spoilers would land badly/.test(prompt.behind), prompt.behind);
check('level: and watching it together', new RegExp(`same point in ${esc(prompt.label)} and have been watching it together`).test(prompt.level), prompt.level);
check('you ahead: they would hate to be spoiled', new RegExp(`ahead of \\w+ on ${esc(prompt.label)}, and \\w+ would hate`).test(prompt.ahead), prompt.ahead);
check('the hate-watcher is told as one', prompt.top === 'code_black_comedy' && /hooked on Code Black \(medical drama\), mostly to pick apart what it gets wrong about their job/.test(prompt.hate), `${prompt.top}: ${prompt.hate}`);
check('the line reaches the real NPC block (buildNpcBlockV2)', prompt.inBlock);
check('residents only', prompt.visitor === null);

// ---------------------------------------------------------------- 10
console.log('\n10. What, never whether — the real tick, pass on vs pass off');
const inv = J(`(() => {
  const run = (withTv) => {
    const saved = resolveTvTick;
    if (!withTv) resolveTvTick = undefined;
    try {
      let g = __mk(31337, 4);
      for (const id of __ids(g)) { const n = g.npcs[id]; n.location = null; n.activity = ''; }
      g.meta.clock = { ...g.meta.clock, day: 2, minutes: 360 };
      const types = [];
      for (let i = 0; i < 48 * 7; i++) {
        const r = resolveBatch(g, 1);
        g = r.state;
        for (const e of r.events) if (!String(e.type).startsWith('tv_')) types.push(e.day + ':' + e.tick + ':' + e.npcId + ':' + e.type);
      }
      const npcs = __ids(g).map(id => { const n = g.npcs[id]; return [id, n.location, n.activity, JSON.stringify(n.needs), n.mood, JSON.stringify(n.relPlayer)]; });
      const watched = types.filter(t => t.endsWith(':watch_tv')).length;
      return { types, npcs, watched, tv: g.world.tv || null };
    } finally { resolveTvTick = saved; }
  };
  const on = run(true), off = run(false);
  const named = on.tv ? Object.keys(on.tv.progress).filter(k => k !== 'player').length : 0;
  return { sameEvents: JSON.stringify(on.types) === JSON.stringify(off.types), sameNpcs: JSON.stringify(on.npcs) === JSON.stringify(off.npcs),
           watched: on.watched, named, events: on.types.length, offUntouched: off.tv === null };
})()`);
check('a week of the real resolveBatch produces the same events, npc for npc, tick for tick, with the pass on or off', inv.sameEvents, `${inv.events} events`);
check('and leaves every roommate in the same place, doing the same thing, with the same needs, mood and feelings', inv.sameNpcs);
check('while the pass really ran (roommates watched TV and have places in shows) — and really did not, switched off', inv.watched > 0 && inv.named > 0 && inv.offUntouched, JSON.stringify({ watched: inv.watched, named: inv.named, offUntouched: inv.offUntouched }));

{
  const sim = srcOf('sim.js');
  const body = sim.slice(sim.indexOf('function resolveTick('), sim.indexOf('function resolveBatch('));
  const hn = body.indexOf('resolveHouseNotesTick(gameState'), tvc = body.indexOf('resolveTvTick(gameState'), st = body.indexOf('stampEventParticipants(newEvents');
  check('sim.js runs the pass inside resolveTick, after house notes and before participants are stamped', hn > 0 && tvc > hn && st > tvc, JSON.stringify({ hn, tvc, st }));
  const tvSrc = srcOf('tv.js');
  check('tv.js never touches the tick\'s shared rng (only its own seededRng stream and hashes)', !/\brng\(\)/.test(tvSrc.replace(/const rng = seededRng\([^)]*\);[\s\S]*?rng\(\)/, '')) && (tvSrc.match(/seededRng\(/g) || []).length === 1);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
