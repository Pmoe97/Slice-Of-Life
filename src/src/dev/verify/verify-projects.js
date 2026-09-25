// Side Projects (0.14.2) — the roommates have something of their own.
//
//   node src/src/dev/verify/verify-projects.js
//
// Node coverage for projects.js and its hook sites: registration (the kinds,
// the drive, its candidacy, the save key, the effect, the verb and its
// requirement, the event bands and themes, the peek rows, both script lists);
// line hygiene (one {name} per event line, no they/their where Chatter turns
// {name} into "I", no " while ", every placeholder fills); seeding (what they
// are into, deterministic, residents only); the drive (candidacy, the session
// resolver, milestones, the finish, skill for real, work on the walls); the
// day (the fade, dust, giving up, the determined bounce back, the next one);
// secret gifts; the finish text; the player's Ask About Project; what the
// player sees (card, Look Around, the prompt line); and the real
// resolveBatch — projects move, stay put across the rebuild, and a run is
// deterministic. Plus the measured claim the drive was built on: without it,
// the hobby activities hardly ever happen. Round 3 (the user's asks,
// 2026-09-24): presents as real items; practice the flat hears — complaints,
// escalation, a listener, fuel for a fridge note — and your Bang on the Wall
// / Ask for Quiet; Jam Sessions; and a show's booked date on the calendar.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'drives.js', 'npc.js', 'cognition.js', 'state.js',
    'defs.actions.js', 'actions.js', 'llm.js', 'projects.js'],
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
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 3, minutes: 1100 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'kitchen';
    g.world.events = [];
    for (const k of Object.keys(g.world.upgrades || {})) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    // Real, distinct names (bible.name is empty out of the generator, gotcha 13),
    // in the same order __ids returns them.
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    for (const id of __ids(g)) {
      const n = g.npcs[id];
      n.location = n.residency.room; n.activity = 'idle'; n.transit = null; n.mood = 0;
      n.bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  // One person, one project of a given kind, at a given stage, fully pinned.
  __give = (g, id, kindId, stage, extra) => {
    const w = ensureProjects(g);
    const day = g.meta.clock.day;
    const kind = PROJECT_KINDS[kindId];
    const interest = kind.interests[0];
    if (!g.npcs[id].bible.interests.some(i => i.name === interest)) g.npcs[id].bible.interests.push({ name: interest, tags: [], skill: 20 });
    w.people[id] = { active: { n: 1, kind: kindId, interest, work: kind.works[0], startedDay: day - 10, stage: stage || 0, stageSessions: 0,
      sessions: 0, bad: 0, engagement: 0.8, lastDay: day, lastRoom: null, dustSince: null, encouragedDay: null, gift: null, ...(extra || {}) },
      history: [], nextStartDay: null, dayDone: day, count: 1 };
    return w.people[id].active;
  };
  __ctx = (g, id) => ({ location: g.npcs[id].location, block: 'leisure' });
  // A seeded rng for the resolver's room pick.
  __rng = (k) => seededRng('verify-projects', 'r' + k);
  __session = (g, id, k) => tryWorkOnProject(g.npcs[id], id, { location: g.npcs[id].location, block: 'leisure' }, g, __rng(k || 0), DRIVE_DEFS.work_on_project);
  __goodOnly = () => { PROJECT_TUNING.bad.__max = PROJECT_TUNING.bad.max; PROJECT_TUNING.bad.max = 0; PROJECT_TUNING.bad.__min = PROJECT_TUNING.bad.min; PROJECT_TUNING.bad.min = 0; };
  __restoreBad = () => { PROJECT_TUNING.bad.max = PROJECT_TUNING.bad.__max; PROJECT_TUNING.bad.min = PROJECT_TUNING.bad.__min; };
`);

const T = J('PROJECT_TUNING');
const ITEM_LABEL = (id) => J('ITEM_DEFS[' + JSON.stringify(id) + '].label');

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — kinds, drive, candidacy, save key, effect, verb, events, peek rows, script lists');
const reg = J(`(() => {
  const kinds = Object.entries(PROJECT_KINDS);
  const interestNames = INTEREST_POOL.map(p => p.name);
  const bad = [];
  for (const [id, k] of kinds) {
    if (!k.interests.length || !k.interests.every(i => interestNames.includes(i))) bad.push(id + ' interests');
    if (!['title', 'the', 'bare'].includes(k.wording)) bad.push(id + ' wording');
    if (!(k.works.length >= 3)) bad.push(id + ' works');
    if (k.stages.length !== 4 || k.session.length !== 4 || !k.session.every(s => s.length >= 3)) bad.push(id + ' stages/session');
    if (typeof k.done !== 'string' || !k.done || /\\b(my|me|I)\\b/.test(k.done) || /\\.$/.test(k.done)) bad.push(id + ' done');
    if (!PROJECT_HOBBY_PHRASES[id]) bad.push(id + ' hobby phrase');
    if (!(k.bad.length >= 2) || k.milestone.length !== 3 || k.show.length !== 4) bad.push(id + ' bad/milestone/show');
    if (![k.finish, k.abandon, k.start, k.dusty, k.label, k.thing, k.activity].every(s => typeof s === 'string' && s.length)) bad.push(id + ' strings');
    if (!PEEK_VIEW_ACT[k.activity]) bad.push(id + ' peek row for ' + k.activity);
    if (!k.rooms.every(r => r === 'bedroom' || ROOMS[r])) bad.push(id + ' rooms');
    if (k.display && !ROOMS[k.display.room]) bad.push(id + ' display room');
    if (k.gifts && !k.gifts.every(gf => gf.noun && gf.given && gf.short && gf.item && ITEM_DEFS[gf.item] && !ITEM_DEFS[gf.item].price && ITEM_DEFS[gf.item].category !== 'gift')) bad.push(id + ' gifts');
    if (!(k.skillGain > 0)) bad.push(id + ' skillGain');
  }
  const covered = interestNames.filter(n => kinds.some(([, k]) => k.interests.includes(n)));
  const d = DRIVE_DEFS.work_on_project;
  return {
    fns: ['resolveProjectsTick','projectDriveCandidate','tryWorkOnProject','projectActivityLabel','projectRoomLines','projectPromptLine','projectEncourageTarget','projectPlanEncourage','projectApplyEncourage','ensureProjects','projectPracticeNoise','projectHushTarget','projectPlanHush','projectApplyHush','projectJamTarget','projectPlanJam','projectApplyJam'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
    bad, kinds: kinds.length, uncovered: interestNames.filter(n => !covered.includes(n)),
    drive: !!d && d.isProjectDrive === true && !d.isIdlePastime && !d.utility.temperamentWeights && d.utility.baseAppeal > 0 && d.utility.holdMinutes > 0 && d.cooldownMinutes > 0,
    idleStill3: Object.values(DRIVE_DEFS).filter(x => x.isIdlePastime).length === 3,
    candidacy: typeof DRIVE_CANDIDACY.work_on_project === 'function',
    saveKey: SAVE_KEYS.find(k => k.folder === 'world').keys.includes('projects'),
    fallback: (() => { const f = WORLD_KEY_FALLBACKS.projects(); return f.people && typeof f.people === 'object' && Array.isArray(f.displayed) && f.displayed.length === 0; })(),
    effect: ['PROJECT_ENCOURAGE', 'PROJECT_HUSH', 'PROJECT_JAM'].every(e => !!EFFECT_DEFS[e] && EFFECT_DEFS[e].llm === false && EFFECT_DEFS[e].implemented === true),
    verbs3: [['self.bang_on_wall', 'practiceNextDoor', PROJECT_TUNING.noise.hush.minutes], ['self.ask_quiet', 'practiserHere', PROJECT_TUNING.noise.hush.minutes], ['self.jam_session', 'jamPartnerHere', PROJECT_TUNING.jam.minutes]]
      .every(([v, r, m]) => { const d = ACTION_DEFS[v]; return !!d && d.group === 'project' && d.source.kind === 'self' && d.narration.mode === 'dynamic' && d.requires.includes(r) && typeof ACTION_REQUIREMENT_CHECKERS[r] === 'function' && d.timeCost.base === m && typeof d.prepare === 'function'; }),
    signal: !!SIGNAL_DEFS.practice && SIGNAL_DEFS.practice.channel === 'sound' && SIGNAL_DEFS.practice.decayPerTick > 0 && SIGNAL_DEFS.practice.salience < 0.7,
    items: ['handknit_scarf', 'handknit_hat', 'handknit_socks', 'handmade_shirt'].every(i => !!CLOTHING_DEFS[i] && !ITEM_DEFS[i].price && ITEM_DEFS[i].giftOnly === true)
      && ['gift_portrait', 'gift_painting', 'gift_photo_print'].every(i => ITEM_DEFS[i] && ITEM_DEFS[i].sortGroup === 'gift' && ITEM_DEFS[i].category !== 'gift' && !ITEM_DEFS[i].price && ITEM_DEFS[i].giftOnly === true)
      && !SHOP_CATALOG_LIST.some(x => /^(handknit_|handmade_|gift_(portrait|painting|photo_print))/.test(x.id || x.defId || '')),
    verb: !!ACTION_DEFS['self.encourage_project'] && ACTION_DEFS['self.encourage_project'].narration.mode === 'dynamic'
      && ACTION_DEFS['self.encourage_project'].requires.includes('projectMakerHere') && typeof ACTION_REQUIREMENT_CHECKERS.projectMakerHere === 'function'
      && ACTION_DEFS['self.encourage_project'].timeCost.base === PROJECT_TUNING.encourage.minutes && !ACTION_DEFS['self.encourage_project'].shared,
    bands: ['project_session','project_started','project_milestone','project_abandoned','project_finished','practice_complaint','practice_listen'].every(t => MEMORY_IMPORTANCE[EVENT_IMPORTANCE[t]] !== undefined) && !EVENT_IMPORTANCE.project_gift,
    themes: ['project_milestone','project_finished','project_abandoned','project_gift','practice_complaint','practice_listen'].every(t => EMOTIONAL_WEIGHTS[EVENT_EMOTION[t]] !== undefined),
  };
})()`);
check('every projects.js entry point is defined', reg.fns);
check(`all ${reg.kinds} kinds are well formed (interests, wording, works, four stages, every line, peek row, rooms, gifts)`, reg.bad.length === 0, reg.bad.join('; '));
check('every INTEREST_POOL interest leads to some kind — nobody is into nothing', reg.uncovered.length === 0, reg.uncovered.join(', '));
check('work_on_project is a real drive: gated by its own resolver, not an idle pastime, no temperament weights', reg.drive);
check('the idle-pastime set is still exactly three (verify-voc-p7 pins it)', reg.idleStill3);
check('work_on_project has a candidacy entry', reg.candidacy);
check('world.projects is in SAVE_KEYS with an additive default of the full shape', reg.saveKey && reg.fallback);
check('PROJECT_ENCOURAGE, PROJECT_HUSH and PROJECT_JAM are registered, trusted-only effects', reg.effect);
check('Bang on the Wall, Ask for Quiet, Jam Session: Here-tab self verbs in their own Project bucket, dynamic narration, their requirements exist, time from PROJECT_TUNING', reg.verbs3);
check('the practice sound is a decaying transient on the sound channel, below the 0.70 pursuit-break line', reg.signal);
check('the presents are real items: four handmade clothes (wearable, unpriced) and three keepsakes (Gifts section, not giveable, unpriced), none in the shop', reg.items);
check('Ask About Project: dynamic narration, its requirement exists, time from PROJECT_TUNING, no companionship credit', reg.verb);
check('the project events carry real bands (project_gift carries its own importance instead)', reg.bands);
check('the felt project events carry real EMOTIONAL_WEIGHTS themes', reg.themes);
{
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
  const tvi = html.indexOf('srcfiles/tv.js'), pj = html.indexOf('srcfiles/projects.js'), rj = html.indexOf('srcfiles/render.js');
  check('index.html loads projects.js after tv.js and before render.js', tvi > 0 && pj > tvi && rj > pj);
  const lg = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
  check("loadgame.js's ORDER lists projects.js right after tv.js", /'tv\.js',[\s\S]{0,400}?'projects\.js'/.test(lg));
  // Found live (round 3): sharing the fridge notes' 'here' group filed Jam
  // Session and Ask About Project under "Notes ▸".
  const renderSrc = srcOf('render.js');
  check('the project verbs have their own Here bucket, "Project", not Notes',
    /if \(g === 'project'\) return 'project';/.test(renderSrc) && /project: 'Project'/.test(renderSrc) && /'relax', 'project', 'notes'\]/.test(renderSrc));
}

// ---------------------------------------------------------------- 1
console.log('\n1. Line hygiene');
const lines = J(`(() => {
  const out = { multiName: [], pronoun: [], whileWord: [], unfilled: [], showNoName: [] };
  const eventLines = [];
  for (const [id, k] of Object.entries(PROJECT_KINDS)) {
    for (const s of k.session) for (const l of s) eventLines.push([id, l]);
    for (const l of [...k.bad, ...k.milestone, k.finish, k.abandon, k.start]) eventLines.push([id, l]);
    for (const l of k.show) if (!l.includes('{name}')) out.showNoName.push(id);
    for (const wk of k.works) {
      for (const [, l] of eventLines.filter(e => e[0] === id)) {
        const f = projFill(l, k, wk);
        if (/[{}]/.test(f.split('{name}').join(''))) out.unfilled.push(id + ': ' + f);
      }
      for (const l of [k.dusty, k.display && k.display.line, k.label].filter(Boolean)) {
        const f = projFill(l, k, wk).split('{name}').join('X');
        if (/[{}]/.test(f)) out.unfilled.push(id + ': ' + f);
      }
    }
  }
  for (const l of PROJECT_SECRET_LINES.session) eventLines.push(['secret', l]);
  for (const [id, l] of eventLines) {
    if (l.split('{name}').length !== 2 || !l.startsWith('{name}')) out.multiName.push(id + ': ' + l);
    // Person pronouns only — "scraping them back" is the colours, and reads
    // fine as "I … scraping them back".
    if (/\\b(they|their|they're)\\b/i.test(l.replace(/"[^"]*"/g, ''))) out.pronoun.push(id + ': ' + l);
    if (l.includes(' while ')) out.whileWord.push(id + ': ' + l);
  }
  for (const [style, pool] of Object.entries(PROJECT_FINISH_TEXTS)) for (const l of pool) {
    if (!l.includes('{done}') && !l.includes('{Done}')) out.unfilled.push('text ' + style);
    if (style !== 'default' && !TEXTING_STYLES.includes(style)) out.unfilled.push('unknown style ' + style);
  }
  out.count = eventLines.length;
  out.samples = { title: projFill('{name} x {work} / {a_work} / {thing}', PROJECT_KINDS.guitar, 'Harbour Lights'),
                  the: projFill('{name} x {work} / {a_work} / {noun} / {thing}', PROJECT_KINDS.knitting, 'scarf'),
                  an: projFill('{a_work}', PROJECT_KINDS.knitting, 'apron'),
                  bare: projFill('{name} x {work} / {a_work} / {thing}', PROJECT_KINDS.seedlings, 'chillies') };
  return out;
})()`);
check(`every event line (${lines.count}) opens on {name} and names it exactly once (formatEventText fills the first only)`, lines.multiName.length === 0, lines.multiName.slice(0, 3).join(' | '));
check('no event line says they/their outside a quote — Chatter posts them with {name} as "I"', lines.pronoun.length === 0, lines.pronoun.slice(0, 3).join(' | '));
check('no event line contains " while " (verify-weather reads that word as the cozy-weather clause)', lines.whileWord.length === 0, lines.whileWord.join(' | '));
check('every placeholder fills for every work of every kind, and every finish text tells {done} in a real style', lines.unfilled.length === 0, lines.unfilled.slice(0, 3).join(' | '));
check('every show line names the roommate', lines.showNoName.length === 0, lines.showNoName.join(', '));
check('the three wordings read right: a quoted title, the/a noun (an before a vowel), a bare phrase',
  lines.samples.title === '{name} x ‘Harbour Lights’ / ‘Harbour Lights’ / ‘Harbour Lights’'
  && lines.samples.the === '{name} x the scarf / a scarf / scarf / the scarf' && lines.samples.an === 'an apron'
  && lines.samples.bare === '{name} x chillies / chillies / the chillies', JSON.stringify(lines.samples));

// ---------------------------------------------------------------- 2
console.log('\n2. Seeding — what they are into, deterministic, residents only');
const seed = J(`(() => {
  const runs = [1, 2].map(() => {
    const out = [];
    for (const s of [11, 22, 33, 44, 55, 66, 77, 88]) {
      const g = __mk(s, 4);
      resolveProjectsTick(g, {}, Object.keys(g.npcs));
      for (const id of __ids(g)) {
        const p = g.world.projects.people[id];
        out.push({ id, has: !!p.active, kind: p.active && p.active.kind, stage: p.active && p.active.stage, next: p.nextStartDay,
          fits: !p.active || PROJECT_KINDS[p.active.kind].interests.some(i => g.npcs[id].bible.interests.some(x => x.name === i)),
          startedBefore: !p.active || p.active.startedDay <= g.meta.clock.day });
      }
      const nonRes = Object.keys(g.npcs).filter(id => g.npcs[id].residency.status !== 'resident');
      out.push({ nonResidentSeeded: nonRes.some(id => !!g.world.projects.people[id]) });
    }
    return out;
  });
  const a = runs[0].filter(r => r.id);
  return { same: JSON.stringify(runs[0]) === JSON.stringify(runs[1]), n: a.length, withProject: a.filter(r => r.has).length,
    fits: a.every(r => r.fits), startedBefore: a.every(r => r.startedBefore), anyMid: a.some(r => r.stage >= 1),
    waitingScheduled: a.filter(r => !r.has).every(r => typeof r.next === 'number' && r.next > 3),
    kinds: [...new Set(a.map(r => r.kind).filter(Boolean))].length, nonRes: runs[0].some(r => r.nonResidentSeeded) };
})()`);
check('seeding is deterministic (same seeds, same projects)', seed.same);
check(`most residents are already into something on day one (${seed.withProject}/${seed.n}), some partway in`, seed.withProject >= seed.n * 0.6 && seed.anyMid, JSON.stringify(seed));
check('every project is something they are actually into (a kind their interests lead to)', seed.fits);
check('a seeded project started before today; anyone without one has a start day scheduled', seed.startedBefore && seed.waitingScheduled);
check(`across eight houses the flat is not all doing the same thing (${seed.kinds} kinds)`, seed.kinds >= 6);
check('non-residents (the contractor, visitors) never get a project', !seed.nonRes);

// ---------------------------------------------------------------- 3
console.log('\n3. Candidacy');
const cand = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  __give(g, A, 'guitar', 0);
  const yes = projectDriveCandidate(g.npcs[A], A, g, __ctx(g, A));
  g.world.projects.people[A].active.engagement = PROJECT_TUNING.workThreshold - 0.01;
  const dusty = projectDriveCandidate(g.npcs[A], A, g, __ctx(g, A));
  g.world.projects.people[A].active.engagement = 0.8;
  const away = projectDriveCandidate(g.npcs[A], A, g, { location: null, block: 'leisure' });
  const none = projectDriveCandidate(g.npcs[B], B, g, __ctx(g, B));
  g.npcs[A].residency.status = 'visitor';
  const visitor = projectDriveCandidate(g.npcs[A], A, g, __ctx(g, A));
  g.npcs[A].residency.status = 'resident';
  const viaCog = DRIVE_CANDIDACY.work_on_project(g.npcs[A], A, g, __ctx(g, A));
  return { yes, dusty, away, none, visitor, viaCog };
})()`);
check('an engaged resident at home with a project is a candidate (and cognition.js asks projects.js)', cand.yes && cand.viaCog);
check('below the engagement threshold it gathers dust — not a candidate', cand.dusty === false);
check('not while away, not without a project, not for a visitor', !cand.away && !cand.none && !cand.visitor, JSON.stringify(cand));

// ---------------------------------------------------------------- 4
console.log('\n4. A session — room, activity, progress, milestones, the finish');
const sess = J(`(() => {
  __goodOnly();
  try {
    const g = __mk(); const [A] = __ids(g);
    const p = __give(g, A, 'guitar', 0);
    const skill0 = g.npcs[A].bible.interests.find(i => i.name === 'music').skill;
    const r1 = __session(g, A, 1);
    const own = g.npcs[A].residency.room;
    const afterOne = { stage: p.stage, stageSessions: p.stageSessions, sessions: p.sessions, lastRoom: p.lastRoom };
    const evs = [...r1.events];
    for (let i = 2; i <= 3; i++) evs.push(...__session(g, A, i).events);
    const r4 = __session(g, A, 4);
    evs.push(...r4.events);
    const milestone = r4.events[0];
    const skill1 = g.npcs[A].bible.interests.find(i => i.name === 'music').skill;
    // Straight to the last session of the last stage.
    p.stage = 3; p.stageSessions = projStageNeed(PROJECT_KINDS.guitar, 3) - 1;
    g.player.location = 'kitchen';
    const fin = __session(g, A, 99);
    const person = g.world.projects.people[A];
    const skill2 = g.npcs[A].bible.interests.find(i => i.name === 'music').skill;
    return { act: r1.activityOverride, room: afterOne.lastRoom, own, afterOne, firstType: r1.events[0].type, firstLine: formatEventText(r1.events[0], g.npcs),
      milestoneType: milestone.type, milestoneLine: formatEventText(milestone, g.npcs), stageAfterM: p.stage === 3 ? 'reset' : null,
      skill0, skill1, skill2, finType: fin.events[0].type, finLine: formatEventText(fin.events[0], g.npcs),
      active: person.active, hist: person.history, next: person.nextStartDay, day: g.meta.clock.day,
      stim: g.npcs[A].needs.stimulation };
  } finally { __restoreBad(); }
})()`);
check('the activity is the kind\'s, in one of its rooms (the bedroom sentinel is their own)', sess.act === 'practising guitar' && [sess.own, 'living_room'].includes(sess.room), JSON.stringify({ act: sess.act, room: sess.room }));
check('a good session counts', sess.afterOne.sessions === 1 && sess.afterOne.stageSessions === 1 && sess.firstType === 'project_session');
check('the session line is the stage-0 line with the work in it', /Mira .*‘Harbour Lights’/.test(sess.firstLine) && /(three chords|tuning)/.test(sess.firstLine), sess.firstLine);
check('the fourth good session of stage 0 is a milestone, told with its own line', sess.milestoneType === 'project_milestone' && /verse of ‘Harbour Lights’ without stopping/.test(sess.milestoneLine), sess.milestoneLine);
check('a milestone is worth a little real skill', sess.skill1 === sess.skill0 + api('PROJECT_TUNING.skillPerMilestone'), JSON.stringify([sess.skill0, sess.skill1]));
check('the last session finishes it: its own line, and the skill the kind is worth', sess.finType === 'project_finished' && /all the way through, clean/.test(sess.finLine)
  && sess.skill2 === sess.skill1 + 12, JSON.stringify([sess.finLine, sess.skill1, sess.skill2]));
check('finished goes into the history and the next start is scheduled after a rest', sess.active === null && sess.hist.length === 1 && sess.hist[0].status === 'finished'
  && sess.next >= sess.day + T.restAfterFinish[0] && sess.next <= sess.day + T.restAfterFinish[1], JSON.stringify({ hist: sess.hist, next: sess.next }));
check('a session really restores some stimulation (the drive\'s own effects, applied by the resolver)', sess.stim > 50, String(sess.stim));

// ---------------------------------------------------------------- 5
console.log('\n5. A session that goes nowhere');
const badS = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  const npc = g.npcs[A];
  const p = __give(g, A, 'painting', 2);
  const B = PROJECT_TUNING.bad;
  const neutral = projBadChance(npc, p);
  npc.bible.temperament.volatility = 1;
  const volatile = projBadChance(npc, p);
  npc.bible.temperament.volatility = 0; npc.bible.temperament.conscientiousness = 1; npc.mood = 0.6;
  const steady = projBadChance(npc, p);
  p.stage = 0; const easyStage = projBadChance(npc, p); p.stage = 2;
  npc.bible.temperament.volatility = 3; npc.bible.temperament.conscientiousness = -3; npc.mood = -1;
  const clamped = projBadChance(npc, p);
  npc.bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 }; npc.mood = 0;
  const minWas = B.min, maxWas = B.max;
  B.min = 1; B.max = 1;
  try {
    const e0 = p.engagement;
    const r = __session(g, A, 5);
    const calm = { dropped: +(e0 - p.engagement).toFixed(4), sessions: p.sessions, stageSessions: p.stageSessions, bad: p.bad, line: formatEventText(r.events[0], g.npcs), type: r.events[0].type };
    npc.bible.temperament.volatility = 1;
    const e1 = p.engagement;
    __session(g, A, 6);
    return { neutral, volatile, steady, easyStage, clamped, calm, volatileDrop: +(e1 - p.engagement).toFixed(4), max: maxWas };
  } finally { B.min = minWas; B.max = maxWas; }
})()`);
check('the hard stage, volatility and a poor mood make a bad session likelier; steadiness and a good mood less',
  badS.volatile > badS.neutral && badS.steady < badS.neutral && badS.easyStage < badS.steady + 1e-9, JSON.stringify(badS));
check('the chance stays inside its bounds at the extremes', badS.clamped === badS.max);
check('a bad session makes no progress, is told with a "bad" line, and costs heart', badS.calm.sessions === 0 && badS.calm.stageSessions === 0 && badS.calm.bad === 1
  && badS.calm.type === 'project_session' && badS.calm.dropped > 0 && /("no,"|scraping)/.test(badS.calm.line), JSON.stringify(badS.calm));
check('it costs a volatile person more', badS.volatileDrop > badS.calm.dropped, JSON.stringify([badS.calm.dropped, badS.volatileDrop]));

// ---------------------------------------------------------------- 6
console.log('\n6. The day — fading, dust, giving up, bouncing back, the next one');
const day = J(`(() => {
  const T = PROJECT_TUNING;
  const fadeFor = (c, worked, mood) => {
    const g = __mk(); const [A] = __ids(g);
    g.npcs[A].bible.temperament.conscientiousness = c; g.npcs[A].mood = mood || 0;
    const p = __give(g, A, 'knitting', 1);
    const d = g.meta.clock.day + 1;
    p.lastDay = worked ? d - 1 : d - 3;
    const e0 = p.engagement;
    projectDailyUpkeep(g, A, g.world.projects.people[A], d);
    return +(e0 - p.engagement).toFixed(4);
  };
  const fades = { steadyWorked: fadeFor(0.8, true), flakyWorked: fadeFor(-0.8, true), idle: fadeFor(0, false), worked: fadeFor(0, true), low: fadeFor(0, true, -0.6) };
  // Dust, then giving up.
  const g = __mk(); const [A] = __ids(g);
  __give(g, A, 'knitting', 1, { engagement: 0.2, lastRoom: 'living_room' });
  const knitSkill0 = g.npcs[A].bible.interests.find(i => i.name === 'crafting').skill;
  const person = g.world.projects.people[A];
  let d = g.meta.clock.day;
  const trail = [];
  let abandoned = null;
  for (let i = 1; i <= T.abandonAfterDays + 2 && !abandoned; i++) {
    d++;
    const evs = projectDailyUpkeep(g, A, person, d);
    trail.push(person.active ? person.active.dustSince : 'gone');
    if (evs.length) abandoned = { day: d, evt: evs[0], line: formatEventText(evs[0], g.npcs) };
  }
  // The determined bounce back.
  const g2 = __mk(); const [C] = __ids(g2);
  g2.npcs[C].bible.temperament.conscientiousness = 1;
  const p2 = __give(g2, C, 'painting', 1, { engagement: T.workThreshold - 0.02 });
  let d2 = g2.meta.clock.day, back = null;
  for (let i = 1; i <= 6 && back == null; i++) { d2++; projectDailyUpkeep(g2, C, g2.world.projects.people[C], d2); if (p2.dustSince == null && i > 1) back = i; }
  // The next one starts after the rest, with its own line, filed where it lives.
  const next = person.nextStartDay;
  let started = null;
  for (let dd = d + 1; dd <= next + 1 && !started; dd++) { const evs = projectDailyUpkeep(g, A, person, dd); if (evs.length) started = { day: dd, evt: evs[0], line: formatEventText(evs[0], g.npcs) }; }
  const kind = started && PROJECT_KINDS[person.active.kind];
  const home = kind && (kind.rooms[0] === 'bedroom' ? g.npcs[A].residency.room : kind.rooms[0]);
  return { fades, dustDay: trail[0], firstDay: g.meta.clock.day + 1, abandoned, hist: person.history, next, restRange: T.restAfterAbandon, started, home, back,
           abandonAfter: T.abandonAfterDays, knitSkill0, knitSkill: g.npcs[A].bible.interests.find(i => i.name === 'crafting').skill };
})()`);
check('the novelty fades every day — slower for the conscientious, faster for the flaky', day.fades.steadyWorked < day.fades.worked && day.fades.flakyWorked > day.fades.worked, JSON.stringify(day.fades));
check('an idle yesterday and a low mood each cost a little more', day.fades.idle > day.fades.worked && day.fades.low > day.fades.worked, JSON.stringify(day.fades));
check('below the threshold it gathers dust from that day', day.dustDay === day.firstDay, JSON.stringify({ dustDay: day.dustDay, firstDay: day.firstDay }));
check(`after ${day.abandonAfter} days in the dust they give up: its own line, filed where it was left`, !!day.abandoned && day.abandoned.day === day.firstDay + day.abandonAfter
  && day.abandoned.evt.type === 'project_abandoned' && day.abandoned.evt.roomId === 'living_room' && /drawer/.test(day.abandoned.line), JSON.stringify(day.abandoned));
check('giving up goes into the history, is worth a point of skill, and the next start waits the longer rest',
  day.hist.length === 1 && day.hist[0].status === 'abandoned' && day.knitSkill === day.knitSkill0 + T.skillOnAbandon
  && day.next >= day.abandoned.day + day.restRange[0] && day.next <= day.abandoned.day + day.restRange[1], JSON.stringify({ hist: day.hist, next: day.next, skill: day.knitSkill }));
check('the determined pick a stalled project back up on their own', day.back != null, JSON.stringify(day.back));
check('the next project starts on its day, told with its start line, filed in the room it will live in',
  !!day.started && day.started.day === day.next && day.started.evt.type === 'project_started' && day.started.evt.roomId === day.home && /^Mira /.test(day.started.line), JSON.stringify(day.started));

// ---------------------------------------------------------------- 7
console.log('\n7. A secret present');
const gift = J(`(() => {
  const T = PROJECT_TUNING;
  // A knitter who adores you: find a start that comes out as a gift.
  let g, A, p, tries = 0;
  for (let s = 1; s < 80 && !(p && p.gift != null); s++) {
    tries++;
    g = __mk(s); A = __ids(g)[0];
    g.npcs[A].bible.interests = [{ name: 'crafting', tags: [], skill: 10 }];
    g.npcs[A].relPlayer.affection = T.giftAffection + 0.1;
    const person = ensureProjects(g).people[A] = { active: null, history: [], nextStartDay: g.meta.clock.day, dayDone: g.meta.clock.day, count: 0 };
    p = projectStart(g, A, person, g.meta.clock.day, false);
  }
  let coldStarts = 0;
  for (let s = 1; s < 40; s++) {
    const h = __mk(s); const X = __ids(h)[0];
    h.npcs[X].bible.interests = [{ name: 'crafting', tags: [], skill: 10 }];
    h.npcs[X].relPlayer.affection = T.giftAffection - 0.1;
    const q = projectStart(h, X, { active: null, history: [], count: 0 }, 3, false);
    if (q && q.gift != null) coldStarts++;
  }
  const kind = PROJECT_KINDS.knitting;
  const giftDef = kind.gifts[p.gift];
  __goodOnly();
  try {
    g.npcs[A].location = 'living_room';
    const s1 = __session(g, A, 1);
    const label = projectActivityLabel(g, A, 'knitting');
    const prompt = projectPromptLine(g, A);
    p.stage = 3; p.stageSessions = projStageNeed(kind, 3) - 1;
    g.player.location = 'kitchen';
    const fin = __session(g, A, 2);
    return { tries, gift: p.gift, giftDef, coldStarts, s1Line: formatEventText(s1.events[0], g.npcs), label, prompt,
      fin: fin.events[0], finLine: formatEventText(fin.events[0], g.npcs), text: fin.imMessages, room: projectRoomLines(g, 'bedroom_player'),
      inv: (g.player.inventory || []).filter(st => st.defId === giftDef.item).map(st => ({ defId: st.defId, label: stackLabel(st), meta: st.meta, clothing: !!CLOTHING_DEFS[st.defId], owner: st.ownerId || null })),
      displayed: g.world.projects.displayed.length,
      hist: g.world.projects.people[A].history, name: g.npcs[A].bible.name, promptAfter: projectPromptLine(g, A) };
  } finally { __restoreBad(); }
})()`);
check(`someone who adores you, on a kind that makes gifts, sometimes starts one for you (${gift.tries} tries)`, gift.gift != null && gift.tries < 20, JSON.stringify(gift.gift));
check('someone who is only fond of you never does', gift.coldStarts === 0);
check('the sessions keep the secret — no work named', !/scarf|hat|socks/.test(gift.s1Line) && /(face-down|nobody is allowed|in secret)/.test(gift.s1Line), gift.s1Line);
check("the card says they won't say what", gift.label === "knitting (won't say what)", gift.label);
check('the prompt tells the model it is a secret present for the player, and to deflect', /secretly making the player a present/.test(gift.prompt) && /deflect/.test(gift.prompt), gift.prompt);
check('finished with you elsewhere: it is on your bed, from them — a gift event with its own weight and no feed band',
  gift.fin.type === 'project_gift' && gift.fin.roomId === 'bedroom_player' && gift.fin.importance > 0.5 && /^On your bed/.test(gift.finLine)
  && gift.finLine.includes(gift.giftDef.given) && gift.finLine.includes(gift.name), gift.finLine);
check('no text for a present — you find it', gift.text.length === 0);
check('it is a real item in your bag, from them — "' + (gift.inv[0] && gift.inv[0].label) + '", wearable clothing', gift.inv.length === 1 && gift.inv[0].label === ITEM_LABEL(gift.giftDef.item) + ': from ' + gift.name
  && gift.inv[0].meta.handmade === true && gift.inv[0].clothing === true && /tuck it into your bag/.test(gift.finLine), JSON.stringify(gift.inv));
check('and it is no longer a line on the wall of your room (you carry it, not the room)', gift.displayed === 0 && gift.room.length === 0, JSON.stringify(gift.room));
check('the history (and the prompt) remember it was a present', gift.hist.length === 1 && gift.hist[0].gift === true && gift.hist[0].status === 'finished'
  && /made the player a gift/.test(gift.promptAfter), gift.promptAfter);
const inPerson = J(`(() => {
  __goodOnly();
  try {
    const g = __mk(); const [A] = __ids(g);
    const p = __give(g, A, 'painting', 3, { gift: 0, work: 'portrait' });
    p.stageSessions = projStageNeed(PROJECT_KINDS.painting, 3) - 1;
    g.npcs[A].location = 'living_room'; g.player.location = 'living_room';
    const fin = __session(g, A, 1);
    const inv = (g.player.inventory || []).filter(st => st.defId === 'gift_portrait').map(st => stackLabel(st));
    // A present from a round-1 save (a displayed record with a place) still reads.
    g.world.projects.displayed = [{ npcId: A, kind: 'knitting', work: 'scarf', day: 1, room: 'bedroom_player', gift: { short: 'scarf', place: 'folded on your pillow' } }];
    return { type: fin.events[0].type, room: fin.events[0].roomId, line: formatEventText(fin.events[0], g.npcs), inv, name: g.npcs[A].bible.name, legacy: projectRoomLines(g, 'bedroom_player') };
  } finally { __restoreBad(); }
})()`);
check('finished with you in the room: they hand it to you there, and it is in your bag', inPerson.type === 'project_gift' && inPerson.room === 'living_room' && /hands you a small portrait of you/.test(inPerson.line)
  && inPerson.inv.length === 1 && inPerson.inv[0] === 'Portrait of You: from ' + inPerson.name, JSON.stringify(inPerson));
check("an old save's present (left somewhere in your room) still reads where it was left", inPerson.legacy.length === 1 && /scarf .* made you is folded on your pillow\./.test(inPerson.legacy[0]), JSON.stringify(inPerson.legacy));

// ---------------------------------------------------------------- 8
console.log('\n8. The finish text');
const txt = J(`(() => {
  const run = (aff, playerRoom, style) => {
    __goodOnly();
    try {
      const g = __mk(); const [A] = __ids(g);
      g.npcs[A].relPlayer.affection = aff;
      g.npcs[A].bible.speech = { ...(g.npcs[A].bible.speech || {}), textingStyle: style || null };
      const p = __give(g, A, 'painting', 3);
      p.stageSessions = projStageNeed(PROJECT_KINDS.painting, 3) - 1;
      g.npcs[A].location = 'living_room';
      g.player.location = playerRoom;
      const r = __session(g, A, 1);
      return { texts: r.imMessages.map(m => m.text), type: r.events[0].type, disp: projectRoomLines(g, 'living_room') };
    } finally { __restoreBad(); }
  };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const terse = PROJECT_FINISH_TEXTS.terse.map(t => cap(projFill(t, PROJECT_KINDS.painting, 'The Harbour at Dusk')));
  return { fond: run(0.3, 'kitchen', 'terse'), there: run(0.3, 'living_room', 'terse'), cold: run(0.0, 'kitchen'), lower: run(0.3, 'kitchen', 'all-lowercase'), plain: run(0.3, 'kitchen'), terse };
})()`);
check("fond of you and you weren't there: a text in their own texting voice, naming the thing", txt.fond.texts.length === 1 && txt.terse.includes(txt.fond.texts[0]), JSON.stringify(txt.fond.texts));
check('an all-lowercase texter stays lowercase; everyone else opens on a capital', /^[a-z]/.test(txt.lower.texts[0]) && /^[A-Z]/.test(txt.plain.texts[0]), JSON.stringify([txt.lower.texts, txt.plain.texts]));
check('no text when you were in the room for it, or when they are not fond of you', txt.there.texts.length === 0 && txt.cold.texts.length === 0);
check('the finished painting goes up on the living-room wall', txt.fond.disp.some(l => /painting, ‘The Harbour at Dusk’, hangs on the wall/.test(l)), JSON.stringify(txt.fond.disp));

// ---------------------------------------------------------------- 9
console.log('\n9. Ask About Project — the verb, through the real pipeline pieces');
const enc = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  g.player.location = 'living_room';
  for (const id of [A, B, C]) { g.npcs[id].location = 'living_room'; g.npcs[id].activity = 'idle'; }
  __give(g, A, 'guitar', 1);
  const pB = __give(g, B, 'painting', 1);
  g.npcs[B].activity = 'painting';
  const def = ACTION_DEFS['self.encourage_project'];
  const ctx = buildActionContext(g);
  const req = checkRequirements(def, ctx);
  const target = projectEncourageTarget(g, 'living_room');
  const prepared = def.prepare(ctx);
  const lines = def.buildEffects(ctx, prepared);
  const e0 = pB.engagement, a0 = g.npcs[B].relPlayer.affection, m0 = g.npcs[B].memory.episodes.length;
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), buildEffectContext(g, [], ctx.presentNpcIds, ctx.roomObjects, []));
  const after = { engagement: pB.engagement, affection: g.npcs[B].relPlayer.affection, episodes: g.npcs[B].memory.episodes.length,
    lastEpisode: g.npcs[B].memory.episodes[g.npcs[B].memory.episodes.length - 1], encouragedDay: pB.encouragedDay };
  const narration = def.narration.build(ctx, prepared);
  // Asked today: the next pick is the other one; then nobody.
  const next = projectEncourageTarget(g, 'living_room');
  applyEffects(parseEffectDSL('PROJECT_ENCOURAGE ' + A), buildEffectContext(g, [], ctx.presentNpcIds, ctx.roomObjects, []));
  const none = projectEncourageTarget(g, 'living_room');
  const reqNone = checkRequirements(def, buildActionContext(g));
  const twice = projectApplyEncourage(g, B);
  // Dusty: the line winces, and asking dusts it off.
  const g2 = __mk(); const [D] = __ids(g2);
  g2.player.location = 'living_room'; g2.npcs[D].location = 'living_room';
  const pD = __give(g2, D, 'novel', 2, { engagement: 0.2, dustSince: g2.meta.clock.day - 3, lastDay: g2.meta.clock.day - 4 });
  const plan = projectPlanEncourage(g2, 'living_room');
  projectApplyEncourage(g2, D);
  // Asleep people aren't asked.
  const g3 = __mk(); const [E] = __ids(g3);
  g3.npcs[E].location = 'living_room'; g3.npcs[E].activity = 'sleeping';
  __give(g3, E, 'guitar', 0);
  return { req, target, lines, e0, a0, m0, after, narration, next, none, reqNone, twice, name: g.npcs[B].bible.name,
    dusty: { line: plan.line, dust: pD.dustSince, eng: pD.engagement }, asleep: projectEncourageTarget(g3, 'living_room'), A, B, day: g.meta.clock.day };
})()`);
check('offered when someone here has a project you have not asked about', enc.req.ok === true, JSON.stringify(enc.req));
check('the one at it right now is asked first', enc.target.npcId === enc.B && enc.target.atIt === true, JSON.stringify(enc.target));
check('the verb emits PROJECT_ENCOURAGE for them plus a small mood lift for you', enc.lines[0] === 'PROJECT_ENCOURAGE ' + enc.B && /^ADJUST_NEED player mood \+/.test(enc.lines[1]), JSON.stringify(enc.lines));
check('through the real DSL: engagement up, a little warmth toward you, a warm memory, asked today',
  Math.abs(enc.after.engagement - Math.min(1, enc.e0 + api('PROJECT_TUNING.encourage.engagement'))) < 1e-9
  && Math.abs(enc.after.affection - (enc.a0 + api('PROJECT_TUNING.encourage.affection'))) < 1e-9
  && enc.after.episodes === enc.m0 + 1 && enc.after.lastEpisode.emotionalTag === 'warmth' && enc.after.lastEpisode.participants.includes('player')
  && enc.after.encouragedDay === enc.day, JSON.stringify(enc.after));
check('the line is the stage\'s show line, told live (they are at it — no "you ask" lead-in)', enc.narration.startsWith(enc.name) && /shows you ‘The Harbour at Dusk’/.test(enc.narration), enc.narration);
check('once a day each: next it offers the other roommate, then nobody', enc.next.npcId === enc.A && enc.none === null && enc.reqNone.ok === false && enc.twice === false, JSON.stringify({ next: enc.next, none: enc.none, req: enc.reqNone }));
check('asking about a dusty project: they wince, and it is dusted off', /haven't touched it in 4 days/.test(enc.dusty.line) && enc.dusty.dust === null && enc.dusty.eng > 0.28, JSON.stringify(enc.dusty));
check('a sleeping roommate is not asked', enc.asleep === null);

// ---------------------------------------------------------------- 10
console.log('\n10. What you see — the card, Look Around, the prompt');
const see = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  const pA = __give(g, A, 'knitting', 2, { encouragedDay: g.meta.clock.day - 1 });
  __give(g, B, 'strength', 0);
  const labels = { knit: projectActivityLabel(g, A, 'knitting'), other: projectActivityLabel(g, A, 'watching TV'), bare: projectActivityLabel(g, B, 'exercising'),
    tv: projectActivityLabel(g, C, 'watching TV'), none: projectActivityLabel(g, C, 'reading') };
  const prompt = projectPromptLine(g, A);
  // Dust shows where it was left; a resident's finished work shows; a moved-out maker's doesn't.
  pA.dustSince = g.meta.clock.day - 1; pA.lastRoom = 'living_room';
  const w = ensureProjects(g);
  w.displayed.push({ npcId: C, kind: 'zine', work: 'Fix the Buses', day: 2, room: 'living_room' });
  const lr = projectRoomLines(g, 'living_room');
  const dustyPrompt = projectPromptLine(g, A);
  g.npcs[C].residency.status = 'former';
  const lrAfter = projectRoomLines(g, 'living_room');
  w.people[B].history = [{ kind: 'guitar', work: 'Harbour Lights', status: 'abandoned', day: 1, days: 20 }];
  const histPrompt = projectPromptLine(g, B);
  const visitorPrompt = (() => { g.npcs[C].residency.status = 'visitor'; return projectPromptLine(g, C); })();
  return { labels, prompt, lr, lrAfter, dustyPrompt, histPrompt, visitorPrompt, names: [A, B, C].map(id => g.npcs[id].bible.name) };
})()`);
check('the card names the work when they are doing their project\'s activity, and nothing otherwise',
  see.labels.knit === 'knitting (a scarf)' && see.labels.other === 'watching TV' && see.labels.bare === 'exercising (one strict pull-up)' && see.labels.tv === 'watching TV' && see.labels.none === 'reading', JSON.stringify(see.labels));
check('[Project] says what, how far along, and that you asked yesterday', /^\[Project\]: Mira is knitting a scarf \(10 days in\)\. Where it's at: the fiddly bit/.test(see.prompt) && /asked about it yesterday/.test(see.prompt), see.prompt);
check('Look Around: the dusty project where it was left, and a resident\'s finished zine', see.lr.some(l => /Mira's knitting bag sits by the sofa, the scarf poking out of it/.test(l))
  && see.lr.some(l => /stack of Tamsin's zine, ‘Fix the Buses’, sits on the coffee table/.test(l)), JSON.stringify(see.lr));
check("a maker who has moved out takes their work with them", !see.lrAfter.some(l => /zine/.test(l)), JSON.stringify(see.lrAfter));
check('the prompt knows a dusty project is a bit embarrassing, and a quit one is a sore point', /Hasn't touched it in \d+ days/.test(see.dustyPrompt) && /gave up on learning to play ‘Harbour Lights’ on guitar 2 days ago \(a sore point\)/.test(see.histPrompt), see.dustyPrompt + ' || ' + see.histPrompt);
check('no [Project] line for a non-resident', see.visitorPrompt === null);

// ---------------------------------------------------------------- 11
console.log('\n11. The real resolveBatch — projects move, survive the rebuild, and a run is deterministic');
const real = J(`(() => {
  const run = () => {
    let g = __mk(31337, 4);
    for (const id of __ids(g)) { const n = g.npcs[id]; n.location = null; n.activity = ''; }
    g.meta.clock = { ...g.meta.clock, day: 2, minutes: 360 };
    const skills0 = __ids(g).map(id => g.npcs[id].bible.interests.map(i => i.skill).join(','));
    const types = {};
    let acts = 0;
    for (let i = 0; i < 48 * 21; i++) {
      const r = resolveBatch(g, 1);
      g = r.state;
      for (const e of r.events) if (String(e.type).startsWith('project_')) types[e.type] = (types[e.type] || 0) + 1;
      for (const id of __ids(g)) { const n = g.npcs[id]; const p = g.world.projects.people[id].active; if (n.location && p && n.activity === PROJECT_KINDS[p.kind].activity) acts++; }
    }
    const people = g.world.projects.people;
    return { types, acts, skills0, skills1: __ids(g).map(id => g.npcs[id].bible.interests.map(i => i.skill).join(',')),
      sessions: __ids(g).map(id => (people[id].active ? people[id].active.sessions : -1) + '/' + people[id].history.length),
      dump: JSON.stringify(people) };
  };
  const a = run(), b = run();
  return { a, same: a.dump === b.dump && JSON.stringify(a.types) === JSON.stringify(b.types) };
})()`);
const sessionsTotal = (real.a.types.project_session || 0) + (real.a.types.project_milestone || 0) + (real.a.types.project_finished || 0);
check(`three weeks of real ticks: roommates really work on their projects (${sessionsTotal} sessions, ${real.a.types.project_milestone || 0} milestones)`, sessionsTotal >= 4 * 21 * 0.25 && (real.a.types.project_milestone || 0) >= 3, JSON.stringify(real.a.types));
check(`and they are seen doing it — ${real.a.acts} resident-ticks in their project's activity`, real.a.acts >= sessionsTotal);
check('project state survives resolveBatch\'s npc rebuild (it lives on world), and interest skill actually moved', real.a.skills0.join('|') !== real.a.skills1.join('|'), JSON.stringify([real.a.skills0, real.a.skills1]));
check('the same seed plays out the same projects', real.same);

// ---------------------------------------------------------------- 12
console.log('\n12. The hole this fills — without the drive, hobbies hardly happen');
const hole = J(`(() => {
  const count = (withDrive) => {
    const saved = DRIVE_DEFS.work_on_project;
    if (!withDrive) delete DRIVE_DEFS.work_on_project;
    try {
      let g = __mk(4242, 4);
      for (const id of __ids(g)) { const n = g.npcs[id]; n.location = null; n.activity = ''; }
      g.meta.clock = { ...g.meta.clock, day: 2, minutes: 360 };
      const hobby = new Set(Object.values(PROJECT_KINDS).map(k => k.activity).filter(a => a !== 'reading' && a !== 'exercising' && a !== 'playing games' && a !== 'doing yoga'));
      let n = 0;
      for (let i = 0; i < 48 * 14; i++) {
        const r = resolveBatch(g, 1);
        g = r.state;
        for (const id of __ids(g)) if (g.npcs[id].location && hobby.has(g.npcs[id].activity)) n++;
      }
      return n;
    } finally { DRIVE_DEFS.work_on_project = saved; }
  };
  return { off: count(false), on: count(true) };
})()`);
check(`two weeks, four roommates: hobby activities fill ${hole.off} ticks without the drive and ${hole.on} with it`, hole.on > hole.off * 4 && hole.on >= 60, JSON.stringify(hole));

// ---------------------------------------------------------------- 13
console.log('\n13. Wiring');
{
  const sim = srcOf('sim.js');
  const body = sim.slice(sim.indexOf('function resolveTick('), sim.indexOf('function resolveBatch('));
  const tvc = body.indexOf('resolveTvTick(gameState'), pj = body.indexOf('resolveProjectsTick(gameState'), st = body.indexOf('stampEventParticipants(newEvents');
  check('sim.js runs the daily pass inside resolveTick, after the TV and before participants are stamped', tvc > 0 && pj > tvc && st > pj, JSON.stringify({ tvc, pj, st }));
  const drives = srcOf('drives.js');
  check('evaluateDrives has the isProjectDrive branch, and it calls the resolver behind a typeof guard', /drive\.isProjectDrive/.test(drives) && /typeof tryWorkOnProject === 'function'/.test(drives));
  const pjs = srcOf('projects.js');
  check('projects.js never touches Math.random', !/Math\.random/.test(pjs));
  const rngCalls = (pjs.match(/weightedPick\(rng,/g) || []).length;
  check('its only use of a passed-in rng is the resolver\'s room pick (and the next-project draw on its own seeded stream)', rngCalls === 2 && /const rng = seededRng\(hashStr\(npcId\), `proj_next_/.test(pjs), String(rngCalls));
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
  check('render.js and ui.js show the project label, Look Around the room lines, llm.js the prompt line',
    /projectActivityLabel\(gs, npcId/.test(srcOf('render.js')) && /projectActivityLabel\(currentGameState/.test(srcOf('ui.js'))
    && /projectRoomLines\(currentGameState, roomId\)/.test(srcOf('ui.js')) && /projectPromptLine\(gameState, npc\.id\)/.test(srcOf('llm.js')) && html.length > 0);
}

// ---------------------------------------------------------------- 14
console.log('\n14. The off-screen hobby line tells their real project (text only)');
const hob = J(`(() => {
  const g = __mk(); const [A, B, C] = __ids(g);
  __give(g, A, 'painting', 1);
  __give(g, B, 'knitting', 1, { gift: 0, work: 'scarf' });
  const w = ensureProjects(g);
  w.people[C] = { active: null, history: [], nextStartDay: 99, dayDone: g.meta.clock.day, count: 0 };
  g.npcs[C].bible.interests = [{ name: 'gardening', tags: [], skill: 5 }];
  const mk = (id) => ({ day: 3, tick: 20, roomId: null, npcId: id, type: 'hobby', moodDelta: 0.06, data: { hobby: 'knitting' }, template: '{name} spent time on their {hobby}.', seenByPlayer: false });
  const evs = [mk(A), mk(B), mk(C), { ...mk('npc_nobody') }, { day: 3, tick: 20, npcId: A, type: 'cooking', data: {}, template: 'x' }];
  const before = JSON.stringify(evs[3]);
  projectNameTheHobby(g, evs);
  return { a: formatEventText(evs[0], g.npcs), b: formatEventText(evs[1], g.npcs), c: formatEventText(evs[2], g.npcs), untouched: JSON.stringify(evs[3]) === before, other: evs[4].template,
    gardenPhrase: PROJECT_HOBBY_PHRASES.seedlings };
})()`);
check('with a project: the line is their project, no "their"', hob.a === 'Mira spent some time on the painting.', hob.a);
check('a secret present stays secret', hob.b === 'Jonah spent some time on a project nobody is allowed to see yet.', hob.b);
check('between projects: a hobby their own interests lead to (not the old random list)', hob.c === 'Tamsin spent some time on ' + hob.gardenPhrase + '.', hob.c);
check('a non-resident\'s event, and every other event type, are left alone', hob.untouched && hob.other === 'x');
{
  const sim = srcOf('sim.js');
  check('sim.js hands the pass this tick\'s events and its real length', /resolveProjectsTick\(gameState, npcUpdates, activeNpcIds, newEvents, minutesThisTick\)/.test(sim));
}

// ---------------------------------------------------------------- 15
console.log('\n15. Sheepish in person (Look Around with a dusty project\'s owner there)');
const shy = J(`(() => {
  const g = __mk(); const [A] = __ids(g);
  __give(g, A, 'guitar', 1, { dustSince: 2, lastRoom: 'living_room', lastDay: 1 });
  g.npcs[A].location = 'kitchen';
  const away = projectRoomLines(g, 'living_room');
  g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'watching TV';
  const here = projectRoomLines(g, 'living_room');
  g.npcs[A].activity = 'sleeping';
  const asleep = projectRoomLines(g, 'living_room');
  return { away, here, asleep, pool: PROJECT_SHEEPISH_LINES.map(l => l.replace('{name}', 'Mira')) };
})()`);
check('owner elsewhere: just the dusty guitar', shy.away.length === 1 && /gathering dust\.$/.test(shy.away[0]), JSON.stringify(shy.away));
check('owner in the room: they see you notice it', shy.here.length === 1 && shy.pool.some(l => shy.here[0].endsWith(l)), JSON.stringify(shy.here));
check('owner asleep in the room: no reaction', shy.asleep.length === 1 && /gathering dust\.$/.test(shy.asleep[0]), JSON.stringify(shy.asleep));

// ---------------------------------------------------------------- 16
console.log('\n16. Fridge notes — news, and a bake in progress');
const notes = J(`(() => {
  const g = __mk(); const [A, B] = __ids(g);
  const day = g.meta.clock.day;
  const w = ensureProjects(g);
  w.people[A] = { active: null, history: [{ kind: 'strength', work: 'one strict pull-up', status: 'finished', day: day - 1, days: 20 }], nextStartDay: day + 5, dayDone: day, count: 1 };
  const fresh = projectNoteMotives(g, A, day);
  const stale = projectNoteMotives(g, A, day + 3);
  w.people[A].history[0].gift = true;
  const gift = projectNoteMotives(g, A, day);
  const pB = __give(g, B, 'baking', 1, { lastDay: day, lastRoom: 'kitchen' });
  const baking = projectNoteMotives(g, B, day);
  pB.lastRoom = 'bedroom_x';
  const notInKitchen = projectNoteMotives(g, B, day);
  const viaHouse = houseNoteMotives(g, B, day).map(m => m.motive);
  // Written through the real writer, and answered from the cheer pool.
  w.people[A].history[0].gift = false;
  g.npcs[A].location = 'kitchen'; g.player.location = 'living_room';
  const cand = projectNoteMotives(g, A, day)[0];
  const evt = writeHouseNote(g, A, 'kitchen', cand, day, 40);
  const note = Object.values(g.objects.room_kitchen).find(o => o.defId === 'note' && o.meta && o.meta.motive === 'project_done');
  const reply = note ? composeNoteReply(g, note, B, noteKind(note)) : null;
  const npc = g.npcs[A];
  const proud = houseNoteChancePerMinute(npc, 'project_done'), gripe = houseNoteChancePerMinute(npc, 'dishes');
  return { fresh, stale, gift, baking, notInKitchen, viaHouse, text: note && note.meta.text, evtLine: evt && formatEventText(evt, g.npcs), kind: note && noteKind(note), reply, proud, gripe,
    pools: ['project_done', 'project_baking'].every(m => NOTE_TEMPLATES[m] && HOUSE_NOTE_TUNING.motives[m]) };
})()`);
check('a finish in the last day is news; three days on it isn\'t; a present never is', notes.fresh.length === 1 && notes.fresh[0].motive === 'project_done'
  && notes.fresh[0].vars.done === 'did one strict pull-up' && notes.fresh[0].vars.Done === 'Did one strict pull-up' && notes.stale.length === 0 && notes.gift.length === 0, JSON.stringify(notes.fresh));
check('a bake in this kitchen today puts the oven on notice; baking elsewhere doesn\'t', notes.baking.length === 1 && notes.baking[0].motive === 'project_baking' && notes.baking[0].vars.work === 'the sourdough loaf'
  && notes.notInKitchen.length === 0, JSON.stringify(notes.baking));
check('housenotes.js asks projects.js for them', notes.viaHouse.length === 0 || notes.viaHouse.every(m => typeof m === 'string'), JSON.stringify(notes.viaHouse));
check('both motives have templates and tuning rows', notes.pools);
check('the real writer fills the note, and the fridge line is neutral', !!notes.text && !/[{}]/.test(notes.text) && /pull-up/i.test(notes.text) && /stuck a note on the .* about some good news\./.test(notes.evtLine), JSON.stringify([notes.text, notes.evtLine]));
check('housemates answer news from the cheer pool', notes.kind === 'news' && notes.reply && notes.reply.poolKey === 'cheer', JSON.stringify(notes.reply));
check('proud notes have their own chance (not passive aggression)', notes.proud > 0 && notes.proud !== notes.gripe, JSON.stringify([notes.proud, notes.gripe]));

// ---------------------------------------------------------------- 17
console.log('\n17. Roommates keep each other going (npc_chat)');
const chat = J(`(() => {
  const PLAIN = '{name} and {other} were chatting in the living room.';
  const chatEv = (g, a, b, tick, topic) => ({ day: g.meta.clock.day, tick, roomId: 'living_room', npcId: a, type: 'npc_chat', moodDelta: 0, data: { other: b, raised: [], topic: topic || '' }, template: PLAIN, seenByPlayer: false });
  // Across many first-chats-of-the-day: about half are told as project talk,
  // always from the asked pool, and every one lifts the project exactly once.
  let told = 0, plain = 0, lifts = 0, lines = new Set(), fromPool = true;
  for (let t = 0; t < 40; t++) {
    const g = __mk(); const [A, B] = __ids(g);
    const pB = __give(g, B, 'painting', 1, { engagement: 0.5 });
    const e = chatEv(g, A, B, t);
    projectHearAboutIt(g, [e], g.meta.clock.day);
    if (Math.abs(pB.engagement - 0.5 - PROJECT_TUNING.chatEncourage) < 1e-9) lifts++;
    if (e.template === PLAIN) plain++;
    else { told++; const l = formatEventText(e, g.npcs); lines.add(l); if (!PROJECT_CHAT_LINES.asked.some(p => projFill(p, PROJECT_KINDS.painting, 'The Harbour at Dusk').replace('{name}', 'Mira').replace('{other}', 'Jonah') === l)) fromPool = false; }
  }
  // Once a day: a second chat about the same project changes nothing.
  const g = __mk(); const [A, B, C] = __ids(g);
  const pB = __give(g, B, 'painting', 1, { engagement: 0.5 });
  projectHearAboutIt(g, [chatEv(g, A, B, 1)], g.meta.clock.day);
  const after1 = pB.engagement;
  const e2 = chatEv(g, C, B, 2), e3 = chatEv(g, A, B, 3, 'the rent');
  projectHearAboutIt(g, [e2, e3], g.meta.clock.day);
  // A topic chat keeps its gossip line even on the first of the day.
  const gT = __mk(); const [TA, TB] = __ids(gT);
  __give(gT, TB, 'painting', 1);
  const eT = chatEv(gT, TA, TB, 4, 'the rent');
  projectHearAboutIt(gT, [eT], gT.meta.clock.day);
  // Their own project, told — find a tick that tells it.
  let own = null;
  for (let t = 0; t < 40 && !own; t++) {
    const g2 = __mk(); const [X, Y] = __ids(g2);
    __give(g2, X, 'knitting', 1);
    const e4 = chatEv(g2, X, Y, t);
    projectHearAboutIt(g2, [e4], g2.meta.clock.day);
    if (e4.template !== PLAIN) own = formatEventText(e4, g2.npcs);
  }
  // A secret present is never talked about, and gets no lift from it.
  let secretTouched = false;
  for (let t = 0; t < 10; t++) {
    const g3 = __mk(); const [P, Q] = __ids(g3);
    const pQ = __give(g3, Q, 'knitting', 1, { gift: 0, work: 'scarf', engagement: 0.5 });
    const e5 = chatEv(g3, P, Q, t);
    projectHearAboutIt(g3, [e5], g3.meta.clock.day);
    if (e5.template !== PLAIN || pQ.engagement !== 0.5) secretTouched = true;
  }
  const hygiene = [...PROJECT_CHAT_LINES.asked, ...PROJECT_CHAT_LINES.told].every(l => l.startsWith('{name}') && l.split('{name}').length === 2 && l.split('{other}').length === 2 && !/\\b(they|their|they're)\\b/i.test(l) && !l.includes(' while '));
  return { told, plain, lifts, distinct: lines.size, fromPool, again: +(pB.engagement - after1).toFixed(4), l2: e2.template, l3: e3.template, topic: eT.template, own, secretTouched, hygiene,
    ownPool: PROJECT_CHAT_LINES.told.map(p => projFill(p, PROJECT_KINDS.knitting, 'scarf').replace('{name}', 'Mira').replace('{other}', 'Jonah')) };
})()`);
check(`the first chat of the day is sometimes told as project talk (${chat.told} of 40), sometimes left ordinary (${chat.plain})`, chat.told >= 10 && chat.plain >= 10, JSON.stringify(chat));
check('told from the asked lines, several of them, names filled', chat.fromPool && chat.distinct >= 2, JSON.stringify(chat));
check('every first chat of the day lifts the project exactly once; a second that day changes nothing', chat.lifts === 40 && chat.again === 0 && chat.l2 === '{name} and {other} were chatting in the living room.', JSON.stringify(chat));
check('a chat that carried gossip keeps its topic line', chat.topic === '{name} and {other} were chatting in the living room.');
check('talking about their own: told from the told lines', !!chat.own && chat.ownPool.includes(chat.own), JSON.stringify([chat.own, chat.ownPool]));
check('a secret present is never the topic, and gets no lift from it', !chat.secretTouched);
check('the chat lines open on {name}, name {other} once, and have no they/their', chat.hygiene);

// ---------------------------------------------------------------- 18
console.log('\n18. Practice the flat can hear — the sound, complaints, drama, a listener');
api(`
  // A (Mira) at a project's activity in aRoom; B (Jonah) awake in bRoom; C
  // asleep in bed, out of it. Temperaments zeroed by __mk; o.bT/o.aT set some.
  __practice = (o) => {
    const g = __mk(); const [A, B, C] = __ids(g);
    const p = __give(g, A, o.kind || 'guitar', o.stage || 0);
    g.npcs[A].location = o.aRoom || 'bedroom_1'; g.npcs[A].activity = PROJECT_KINDS[p.kind].activity;
    g.npcs[B].location = o.bRoom || 'hallway_a'; g.npcs[B].activity = o.bAct || 'idle';
    g.npcs[C].location = g.npcs[C].residency.room; g.npcs[C].activity = 'sleeping';
    Object.assign(g.npcs[B].bible.temperament, o.bT || {});
    Object.assign(g.npcs[A].bible.temperament, o.aT || {});
    // The generator seeds real history between them (−0.7 affection is
    // common), which would decide every reaction on its own: start neutral.
    for (const pair of Object.values(g.world.castWeb || {})) for (const d of Object.keys(pair.axes)) pair.axes[d] = { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 };
    // Alert, so attention isn't the variable (a tired listener hears less).
    g.npcs[B].needs = { ...(g.npcs[B].needs || {}), energy: 80 };
    g.player.energy = 80;
    g.meta.clock.minutes = o.minutes || 1100;
    g.world.signals = [];
    return { g, A, B, C, p };
  };
  // Force the reaction roll (the chance is what the real-run check measures).
  __sure = (fn) => { const N = PROJECT_TUNING.noise; const was = N.reactChancePerMinute; N.reactChancePerMinute = 1; try { return fn(); } finally { N.reactChancePerMinute = was; } };
  __react = (o) => __sure(() => {
    const s = __practice(o);
    const ids = __ids(s.g);
    const evs = projectPracticeNoise(s.g, {}, ids, s.g.meta.clock.day, s.g.meta.clock.minutes, 30);
    const tension = (x, y) => projFeelings(s.g, x, y).tension, affection = (x, y) => projFeelings(s.g, x, y).affection;
    const eps = s.g.npcs[s.A].memory.episodes;
    return { s, evs, lines: evs.map(e => formatEventText(e, s.g.npcs)),
      t: [tension(s.B, s.A), tension(s.A, s.B)], a: [affection(s.B, s.A), affection(s.A, s.B)], eng: s.p.engagement,
      mem: eps[eps.length - 1], heard: (s.g.world.projects.heard || {})[s.B], day: s.g.meta.clock.day };
  });
`);
const pn = J(`(() => {
  const N = PROJECT_TUNING.noise, P = PROJECT_PRACTICE_LINES;
  const names = (s) => [s.g.npcs[s.B].bible.name, s.g.npcs[s.A].bible.name];
  // The sound itself.
  const e = __practice({ stage: 0 });
  projectPracticeNoise(e.g, {}, [], e.g.meta.clock.day, 1100, 30);
  const emitted0 = (e.g.world.signals || []).length;
  projectPracticeNoise(e.g, {}, __ids(e.g), e.g.meta.clock.day, 1100, 30);
  const sig = (e.g.world.signals || []).filter(x => x.id === 'practice');
  const hearIn = (room) => perceiveSignals(e.g, e.B, room).filter(r => r.signalId === 'practice').reduce((m, r) => Math.max(m, r.intensity), 0);
  const heard = { hallway: hearIn('hallway_a'), living: hearIn('living_room'), kitchen: hearIn('kitchen'), nextBedroom: hearIn('bedroom_player') };
  const lr = __practice({ aRoom: 'living_room', bAct: 'sleeping' });
  projectPracticeNoise(lr.g, {}, __ids(lr.g), lr.g.meta.clock.day, 1100, 30);
  heard.kitchenFromLiving = perceiveSignals(lr.g, lr.B, 'kitchen').filter(r => r.signalId === 'practice').reduce((m, r) => Math.max(m, r.intensity), 0);
  // A quiet kind makes none; nor does someone asked for quiet today.
  const q = __practice({ kind: 'painting' });
  projectPracticeNoise(q.g, {}, __ids(q.g), q.g.meta.clock.day, 1100, 30);
  const h = __practice({});
  h.p.hushedDay = h.g.meta.clock.day;
  const hushedEvs = __sure(() => projectPracticeNoise(h.g, {}, __ids(h.g), h.g.meta.clock.day, 1100, 30));
  // Reactions.
  const complain = __react({ stage: 0 });
  const escalate = __react({ stage: 0, aT: { assertiveness: 0.5 } });
  const inRoom = __react({ stage: 0, aRoom: 'living_room', bRoom: 'living_room', aT: { assertiveness: 0.5 } });
  const across = __react({ stage: 0, aRoom: 'living_room', bRoom: 'kitchen' });
  const listen = __react({ stage: 2, bT: { warmth: 0.6 } });
  const listenHere = __react({ stage: 2, aRoom: 'living_room', bRoom: 'living_room', bT: { warmth: 0.6 } });
  const lateDay = __react({ stage: 2, minutes: 1100 }), lateNight = __react({ stage: 2, minutes: 1350 });
  const fond = __react({ stage: 0, bT: { warmth: 0.6 } });
  const asleep = __react({ stage: 0, bAct: 'sleeping' });
  const far = __react({ stage: 0, bRoom: 'kitchen' });
  // Once a day each: a second pass the same day, then the next day.
  const again = __sure(() => {
    const s = complain.s; const ids = __ids(s.g);
    const same = projectPracticeNoise(s.g, {}, ids, s.g.meta.clock.day, 1130, 30).length;
    s.g.meta.clock.day += 1;
    const next = projectPracticeNoise(s.g, {}, ids, s.g.meta.clock.day, 1100, 30).length;
    return { same, next };
  });
  // Fuel for a fridge note: a recent complaint is a noise gripe.
  const n = __practice({});
  n.g.world.events = [{ day: n.g.meta.clock.day, tick: 30, roomId: 'hallway_a', npcId: n.B, type: 'practice_complaint', data: { other: n.A } }];
  const noteMotive = houseNoteMotives(n.g, n.B, n.g.meta.clock.day).some(m => m.motive === 'noise');
  // Every line: opens on {name}, names it and {other} once, no they/their, no " while ".
  const all = Object.values(P).flat();
  const hygiene = all.filter(l => !(l.startsWith('{name}') && l.split('{name}').length === 2 && l.split('{other}').length === 2
    && !/\\b(they|their|they're)\\b/i.test(l.replace(/"[^"]*"/g, '')) && !l.includes(' while ')));
  return { N, emitted0, sig: sig.map(x => ({ room: x.roomId, src: x.sourceId === e.A, i: x.intensity })), heard,
    quiet: (q.g.world.signals || []).length, hushed: { sig: (h.g.world.signals || []).length, evs: hushedEvs.length },
    complain: { type: complain.evs.map(x => x.type), line: complain.lines[0], names: names(complain.s), room: complain.evs[0] && complain.evs[0].roomId,
      t: complain.t, eng: complain.eng, mem: complain.mem, heard: complain.heard === complain.day, tpl: complain.evs[0] && complain.evs[0].template },
    escalate: { tpl: escalate.evs[0] && escalate.evs[0].template, t: escalate.t, eng: escalate.eng, mem: escalate.mem && escalate.mem.text },
    inRoom: { tpl: inRoom.evs[0] && inRoom.evs[0].template },
    across: { tpl: across.evs[0] && across.evs[0].template, n: across.evs.length },
    listen: { type: listen.evs.map(x => x.type), tpl: listen.evs[0] && listen.evs[0].template, a: listen.a, eng: listen.eng, mem: listen.mem, line: listen.lines[0], names: names(listen.s) },
    listenHere: { tpl: listenHere.evs[0] && listenHere.evs[0].template },
    lateDay: lateDay.evs.map(x => x.type), lateNight: lateNight.evs.map(x => x.type),
    fond: { n: fond.evs.length, heard: fond.heard }, asleep: asleep.evs.length, far: far.evs.length, again, noteMotive, hygiene, count: all.length };
})()`);
check('someone at the guitar sounds out where they are, every tick, as the practice transient (loud: the early stages worst)',
  pn.emitted0 === 0 && pn.sig.length === 1 && pn.sig[0].room === 'bedroom_1' && pn.sig[0].src && Math.abs(pn.sig[0].i - Math.min(1, pn.N.kinds.guitar * pn.N.stageFactor[0])) < 1e-9, JSON.stringify(pn.sig));
check(`it carries through the one sound model — from a bedroom to the hallway outside (${pn.heard.hallway.toFixed(2)}) and, for an alert ear, the living room (${pn.heard.living.toFixed(2)}); from the living room across the open plan to the kitchen (${pn.heard.kitchenFromLiving.toFixed(2)}); never through to the next bedroom`,
  pn.heard.hallway >= pn.N.hearAt && pn.heard.living >= pn.N.hearAt && pn.heard.kitchen < pn.N.hearAt && pn.heard.nextBedroom < pn.N.hearAt && pn.heard.kitchenFromLiving >= pn.N.hearAt, JSON.stringify(pn.heard));
check('a quiet project (painting) makes no sound; someone asked for quiet today makes none and gets no reactions', pn.quiet === 0 && pn.hushed.sig === 0 && pn.hushed.evs === 0, JSON.stringify([pn.quiet, pn.hushed]));
check(`early, rough practice: the one next door complains — "${pn.complain.line}"`,
  pn.complain.type.length === 1 && pn.complain.type[0] === 'practice_complaint' && pn.complain.room === 'hallway_a'
  && pn.complain.line.startsWith(pn.complain.names[0]) && pn.complain.line.includes(pn.complain.names[1]) && J('PROJECT_PRACTICE_LINES.complain').includes(pn.complain.tpl), JSON.stringify(pn.complain));
check('a complaint is friction both ways, a knock to their heart, and they remember who complained',
  Math.abs(pn.complain.t[0] - pn.N.complainTension) < 1e-9 && Math.abs(pn.complain.t[1] - pn.N.complainTension) < 1e-9 && Math.abs(pn.complain.eng - (0.8 - pn.N.complainEngagement)) < 1e-9
  && /complained about my practising\.$/.test(pn.complain.mem.text) && pn.complain.mem.emotionalTag === 'domestic' && pn.complain.heard, JSON.stringify(pn.complain));
check('an assertive player answers by playing LOUDER: an escalation line, twice the friction, no heart lost, and they remember doing it',
  J('PROJECT_PRACTICE_LINES.escalate').includes(pn.escalate.tpl) && Math.abs(pn.escalate.t[0] - pn.N.escalateTension) < 1e-9 && Math.abs(pn.escalate.eng - 0.8) < 1e-9 && /so I played louder/.test(pn.escalate.mem), JSON.stringify(pn.escalate));
check('in the same room it is said to their face (never "through the wall", never escalated)', J('PROJECT_PRACTICE_LINES.complainHere').includes(pn.inRoom.tpl), JSON.stringify(pn.inRoom));
check('across the open-plan flat, no line bangs on a wall or a door that is not there', pn.across.n === 1 && !/wall|door/.test(pn.across.tpl), JSON.stringify(pn.across));
check(`getting good, and they like them: they stop to listen — "${pn.listen.line}"`,
  pn.listen.type[0] === 'practice_listen' && J('PROJECT_PRACTICE_LINES.listen').includes(pn.listen.tpl) && pn.listen.line.startsWith(pn.listen.names[0])
  && Math.abs(pn.listen.a[0] - pn.N.listenAffection) < 1e-9 && Math.abs(pn.listen.a[1] - pn.N.listenAffection) < 1e-9
  && Math.abs(pn.listen.eng - (0.8 + pn.N.listenEngagement)) < 1e-9 && pn.listen.mem.emotionalTag === 'warmth', JSON.stringify(pn.listen));
check('in the same room they sit and listen', J('PROJECT_PRACTICE_LINES.listenHere').includes(pn.listenHere.tpl));
check('the same good playing at 18:20 gets listened to; at 22:30 it gets a complaint', pn.lateDay[0] === 'practice_listen' && pn.lateNight[0] === 'practice_complaint', JSON.stringify([pn.lateDay, pn.lateNight]));
check('a warm roommate lets rough early practice go (no line, and it can still react later that day)', pn.fond.n === 0 && pn.fond.heard !== true && pn.fond.heard === undefined, JSON.stringify(pn.fond));
check('nobody asleep reacts, and nobody out of earshot', pn.asleep === 0 && pn.far === 0);
check('once a day each: nothing more that day, again the next', pn.again.same === 0 && pn.again.next === 1, JSON.stringify(pn.again));
check('a practice complaint is fuel for a noise note on the fridge', pn.noteMotive);
check(`every practice line (${pn.count}) opens on {name}, names {other} once, no they/their, no " while "`, pn.hygiene.length === 0, pn.hygiene.join(' | '));
const pnReal = J(`(() => {
  const run = () => {
    const tot = { complaint: 0, listen: 0, lines: [] };
    for (const seed of [202, 303]) {
      let g = __mk(seed, 4);
      const I = __ids(g);
      g.meta.clock = { ...g.meta.clock, day: 2, minutes: 360 };
      resolveProjectsTick(g, {}, I);
      __give(g, I[0], 'guitar', 0);
      __give(g, I[1], 'dj', 0);
      for (const id of I) { g.npcs[id].location = null; g.npcs[id].activity = ''; }
      for (let i = 0; i < 48 * 14; i++) {
        const r = resolveBatch(g, 1);
        g = r.state;
        for (const e of r.events) {
          if (e.type === 'practice_complaint') tot.complaint++;
          if (e.type === 'practice_listen') tot.listen++;
          if ((e.type === 'practice_complaint' || e.type === 'practice_listen') && tot.lines.length < 3) tot.lines.push(formatEventText(e, g.npcs));
        }
      }
    }
    return tot;
  };
  const a = run(), b = run();
  return { a, same: JSON.stringify(a) === JSON.stringify(b) };
})()`);
check(`two weeks of real ticks, a guitarist and a DJ in each of two houses: the flat reacts (${pnReal.a.complaint} complaints, ${pnReal.a.listen} listens)`,
  pnReal.a.complaint + pnReal.a.listen >= 3 && pnReal.a.complaint >= 1, JSON.stringify(pnReal.a));
check('and the same seed makes the same drama', pnReal.same);

// ---------------------------------------------------------------- 19
console.log('\n19. Bang on the Wall / Ask for Quiet');
const hush = J(`(() => {
  const at = (aRoom, playerRoom) => {
    const s = __practice({ aRoom, stage: 0, bAct: 'sleeping' });
    s.g.player.location = playerRoom;
    projectPracticeNoise(s.g, {}, __ids(s.g), s.g.meta.clock.day, 1100, 30);
    const ctx = buildActionContext(s.g);
    const bang = ACTION_DEFS['self.bang_on_wall'], ask = ACTION_DEFS['self.ask_quiet'];
    return { s, ctx, bang, ask, reqBang: checkRequirements(bang, ctx).ok === true, reqAsk: checkRequirements(ask, ctx).ok === true, name: s.g.npcs[s.A].bible.name };
  };
  const door = at('bedroom_1', 'hallway_a');
  const prepared = door.bang.prepare(door.ctx);
  const lines = door.bang.buildEffects(door.ctx, prepared);
  const narration = door.bang.narration.build(door.ctx, prepared);
  const npc0 = door.s.g.npcs[door.s.A];
  const t0 = npc0.relPlayer.tension, a0 = npc0.relPlayer.affection;
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), buildEffectContext(door.s.g, [], door.ctx.presentNpcIds, door.ctx.roomObjects, []));
  const npc1 = door.s.g.npcs[door.s.A];
  const eps = npc1.memory.episodes;
  const after = { hushedDay: door.s.p.hushedDay, eng: door.s.p.engagement, dt: npc1.relPlayer.tension - t0, da: npc1.relPlayer.affection - a0, mem: eps[eps.length - 1],
    reqAfter: checkRequirements(door.bang, buildActionContext(door.s.g)).ok === true, practisers: projPractisers(door.s.g, null, __ids(door.s.g), door.s.g.meta.clock.day).length,
    twice: projectApplyHush(door.s.g, door.s.A, 'wall') };
  const open = at('living_room', 'kitchen');
  const wall = at('living_room', 'bedroom_player');
  const here = at('living_room', 'living_room');
  const herePrep = here.ask.prepare(here.ctx);
  applyEffects(here.ask.buildEffects(here.ctx, herePrep).map(l => parseEffectDSL(l)[0]).filter(Boolean), buildEffectContext(here.s.g, [], here.ctx.presentNpcIds, here.ctx.roomObjects, []));
  const hEps = here.s.g.npcs[here.s.A].memory.episodes;
  const far = at('bedroom_1', 'gym');
  return { door: { reqBang: door.reqBang, reqAsk: door.reqAsk, plan: prepared.plan, lines, narration, name: door.name, A: door.s.A }, after,
    open: { req: open.reqBang, line: open.bang.prepare(open.ctx).plan.line },
    wall: { req: wall.reqBang, line: wall.bang.prepare(wall.ctx).plan.line },
    here: { reqBang: here.reqBang, reqAsk: here.reqAsk, plan: herePrep.plan, mem: hEps[hEps.length - 1].text },
    far: { reqBang: far.reqBang, reqAsk: far.reqAsk }, H: PROJECT_TUNING.noise.hush };
})()`);
check('you in the hallway, them practising behind their door: Bang on the Wall is offered, Ask for Quiet is not', hush.door.reqBang && !hush.door.reqAsk, JSON.stringify(hush.door));
check(`the verb targets them and says what happened — "${hush.door.narration}"`,
  hush.door.plan.npcId === hush.door.A && hush.door.lines[0] === 'PROJECT_HUSH ' + hush.door.A + ' wall' && hush.door.narration.startsWith("You bang on " + hush.door.name + "'s door.") && hush.door.narration.includes('very, very quietly'), JSON.stringify(hush.door));
check('through the real DSL: quiet for the rest of the day, a little less heart, it stings (tension up, warmth down), and they remember',
  hush.after.hushedDay === J('3') && Math.abs(hush.after.eng - (0.8 - hush.H.engagement)) < 1e-9 && Math.abs(hush.after.dt - hush.H.tension) < 1e-9 && Math.abs(hush.after.da - hush.H.affection) < 1e-9
  && /keep it down/.test(hush.after.mem.text) && hush.after.mem.emotionalTag === 'domestic', JSON.stringify(hush.after));
check('and it is quiet: no practiser left, the verb is gone, a second hush does nothing', hush.after.practisers === 0 && !hush.after.reqAfter && hush.after.twice === false, JSON.stringify(hush.after));
check(`across the open-plan flat you yell instead — "${hush.open.line.slice(0, 40)}…"`, hush.open.req && /^You yell "Keep it DOWN!" across the flat\./.test(hush.open.line), hush.open.line);
check('from your own room it really is the wall', hush.wall.req && /^You bang on the wall\./.test(hush.wall.line), hush.wall.line);
check('in the same room: Ask for Quiet, to their face (and Bang on the Wall is not offered)', hush.here.reqAsk && !hush.here.reqBang && hush.here.plan.mode === 'here'
  && /^You ask .* to give it a rest/.test(hush.here.plan.line) && /asked me to stop practising/.test(hush.here.mem), JSON.stringify(hush.here));
check('out of earshot, neither is offered', !hush.far.reqBang && !hush.far.reqAsk);

// ---------------------------------------------------------------- 20
console.log('\n20. Jam Sessions');
const jam = J(`(() => {
  const setup = (kindId, stage, extra, rel) => {
    const g = __mk(); const [A] = __ids(g);
    const p = __give(g, A, kindId, stage, extra);
    g.npcs[A].location = 'living_room'; g.npcs[A].activity = PROJECT_KINDS[kindId].activity;
    g.player.location = 'living_room';
    Object.assign(g.npcs[A].relPlayer, { tension: 0, affection: 0.1, comfort: 0 }, rel || {});
    return { g, A, p };
  };
  const s = setup('guitar', 1);
  const def = ACTION_DEFS['self.jam_session'];
  const ctx = buildActionContext(s.g);
  const req = checkRequirements(def, ctx).ok === true;
  const prepared = def.prepare(ctx);
  const lines = def.buildEffects(ctx, prepared);
  const narration = def.narration.build(ctx, prepared);
  const xp0 = (s.g.player.skills || {}).music || 0;
  const r0 = { ...s.g.npcs[s.A].relPlayer };
  const p0 = { ss: s.p.stageSessions, se: s.p.sessions, eng: s.p.engagement };
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), buildEffectContext(s.g, [], ctx.presentNpcIds, ctx.roomObjects, []));
  const npc = s.g.npcs[s.A];
  const eps = npc.memory.episodes;
  const after = { xp: ((s.g.player.skills || {}).music || 0) - xp0, da: npc.relPlayer.affection - r0.affection, dc: (npc.relPlayer.comfort || 0) - (r0.comfort || 0),
    ss: s.p.stageSessions - p0.ss, se: s.p.sessions - p0.se, eng: s.p.engagement - p0.eng, jamDay: s.p.jamDay, mem: eps[eps.length - 1],
    reqAfter: checkRequirements(def, buildActionContext(s.g)).ok === true, twice: projectApplyJam(s.g, s.A) };
  const late = setup('guitar', 2);
  const lateLine = projectPlanJam(late.g, 'living_room').line;
  const cap = setup('guitar', 1);
  cap.p.stageSessions = projStageNeed(PROJECT_KINDS.guitar, 1) - 1;
  projectApplyJam(cap.g, cap.A);
  const capped = cap.p.stageSessions === projStageNeed(PROJECT_KINDS.guitar, 1) - 1 && cap.p.stage === 1;
  const refuse = setup('guitar', 1, null, { tension: 0.5, affection: 0 });
  const idle = setup('guitar', 1); idle.g.npcs[idle.A].activity = 'idle';
  const secret = setup('knitting', 1, { gift: 0, work: 'scarf' });
  // Every kind: a table row, a real skill, both scenes fill for every work.
  const bad = [];
  for (const [id, k] of Object.entries(PROJECT_KINDS)) {
    const row = PROJECT_JAM[id];
    if (!row) { bad.push(id + ' missing'); continue; }
    if (!SKILL_IDS.includes(row.skill)) bad.push(id + ' skill ' + row.skill);
    if (row.lines.length !== 2) bad.push(id + ' lines');
    for (const wk of k.works) for (const l of row.lines) {
      const f = projFill(l, k, wk).split('{name}').join('Mira');
      if (/[{}]/.test(f)) bad.push(id + ': ' + f);
      if (!f.includes('Mira')) bad.push(id + ' no name');
      if (/\\b(they|their|they're|he|she|him|her|his)\\b/i.test(f.replace(/"[^"]*"/g, '').replace(/‘[^’]*’/g, ''))) bad.push(id + ' pronoun: ' + f);
    }
  }
  return { req, plan: prepared.plan, lines, narration, name: s.g.npcs[s.A].bible.name, A: s.A, after, J: PROJECT_TUNING.jam, lateLine,
    earlyTpl: PROJECT_JAM.guitar.lines[0], capped, refuse: projectJamTarget(refuse.g, 'living_room'), idle: projectJamTarget(idle.g, 'living_room'),
    secret: projectJamTarget(secret.g, 'living_room'), bad };
})()`);
check('someone at their project in the room with you: Jam Session is offered', jam.req);
check(`it trains the skill their project uses and tells the scene — "${jam.narration.slice(0, 60)}…"`,
  jam.plan.npcId === jam.A && jam.plan.skill === 'music' && jam.lines[0] === 'PROJECT_JAM ' + jam.A && jam.lines[1] === 'ADD_SKILL_XP music ' + jam.J.xp
  && jam.lines[2] === 'ADJUST_NEED player mood +' + jam.J.mood && jam.narration.includes(jam.name) && jam.narration.includes('Harbour Lights') && !/[{}]/.test(jam.narration), JSON.stringify(jam.lines));
check('through the real DSL: your skill grows; their heart, a step of progress, warmth and comfort toward you, and a memory',
  jam.after.xp === jam.J.xp && Math.abs(jam.after.da - jam.J.affection) < 1e-9 && Math.abs(jam.after.dc - jam.J.comfort) < 1e-9
  && jam.after.ss === 1 && jam.after.se === 1 && Math.abs(jam.after.eng - Math.min(jam.J.engagement, 0.2)) < 1e-9
  && /jam session with the player/.test(jam.after.mem.text) && jam.after.mem.emotionalTag === 'warmth', JSON.stringify(jam.after));
check('once a day each: then it is gone, and a second jam does nothing', !jam.after.reqAfter && jam.after.twice === false);
check('early on it is learning together; later it is playing it', jam.lateLine !== jam.narration && jam.lateLine.includes('Harbour Lights'), jam.lateLine);
check('a jam never finishes a stage for them — the milestone stays theirs', jam.capped);
check("not with someone who can't stand you, someone not at it right now, or a secret present", jam.refuse === null && jam.idle === null && jam.secret === null, JSON.stringify([jam.refuse, jam.idle, jam.secret]));
check('every kind has a jam: a real player skill, an early and a late scene, every work filled, the roommate named, no pronouns for them', jam.bad.length === 0, jam.bad.slice(0, 3).join(' | '));

// ---------------------------------------------------------------- 21
console.log('\n21. The big day — booked, on your calendar, and it happens on the date');
{
  // The render files never load in Node (they touch the DOM at load): lift
  // the two pure functions this reads by name, the real source text.
  const lift = (file, name) => { const s = srcOf(file).replace(/\r\n/g, '\n'); const i = s.indexOf('function ' + name + '('); const j = s.indexOf('\n}\n', i); return s.slice(i, j + 2); };
  api(lift('render.computer.js', 'resolveScreenSource'));
  api(lift('render.calendar.js', 'calendarCellTitle'));
}
const show = J(`(() => {
  const T = PROJECT_TUNING;
  const withEvent = Object.entries(PROJECT_KINDS).filter(([, k]) => k.event).map(([id]) => id).sort();
  const wellFormed = withEvent.every(id => { const e = PROJECT_KINDS[id].event; return e.emoji && e.label.startsWith('{name}: ') && e.what && e.when && e.at >= 0 && e.at < 1440 && (!e.room || ROOMS[e.room]); });
  // Mira's open mic: the milestone into the final stage books it.
  __goodOnly();
  try {
    const g = __mk(); const [A, B] = __ids(g);
    const p = __give(g, A, 'standup', 2);
    p.stageSessions = projStageNeed(PROJECT_KINDS.standup, 2) - 1;
    g.npcs[A].location = 'living_room';
    const m = __session(g, A, 1);
    const booked = { stage: p.stage, eventDay: p.eventDay, day: g.meta.clock.day, type: m.events[0].type };
    // Ready early: rehearsing, never finishing before the date.
    p.stageSessions = projStageNeed(PROJECT_KINDS.standup, 3) - 1;
    const early = [__session(g, A, 2), __session(g, A, 3), __session(g, A, 4)].map(r => r.events[0].type);
    const heldAt = p.stageSessions, need3 = projStageNeed(PROJECT_KINDS.standup, 3), stillActive = !!g.world.projects.people[A].active;
    // On the calendar: the Events tab, the Year grid, the prompt.
    const rows = projectCalendarEvents(g);
    const tab = resolveScreenSource(g, APP_DEFS.calendar.screens.events);
    const rowLabel = APP_DEFS.calendar.screens.events.labelFn(rows[0], g);
    const grid = yearGridModel(g);
    const cell = grid.seasons.flatMap(s => s.cells).find(c => c.day === p.eventDay);
    const title = cell ? calendarCellTitle(cell, 'Spring') : null;
    const prompt = projectPromptLine(g, A);
    // The day before and the evening before the show time: nothing. At the time: the finish.
    g.npcs[A].relPlayer.affection = 0.3; g.player.location = 'kitchen'; g.npcs[A].location = 'living_room';
    g.meta.clock.day = p.eventDay - 1; g.meta.clock.minutes = 1400;
    const dayBefore = projectShowsTonight(g, {}, [A], g.meta.clock.day, 1400).length;
    g.meta.clock.day = p.eventDay; g.meta.clock.minutes = 1200;
    const tooEarly = projectShowsTonight(g, {}, [A], g.meta.clock.day, 1200).length;
    const thread0 = ensureImThread(g, A).msgs.length;
    g.meta.clock.minutes = PROJECT_KINDS.standup.event.at;
    const r = resolveProjectsTick(g, {}, __ids(g), [], 30);
    const fin = r.events.filter(e => e.type === 'project_finished');
    const thread = ensureImThread(g, A);
    const after = { rows: projectCalendarEvents(g).length, active: !!g.world.projects.people[A].active, hist: g.world.projects.people[A].history.slice(-1)[0] };
    // The screening is in the living room; you there = no text, you saw it.
    const s = __mk(); const [S] = __ids(s);
    const ps = __give(s, S, 'short_film', 3, { eventDay: s.meta.clock.day });
    s.npcs[S].location = 'kitchen'; s.player.location = 'living_room';
    s.meta.clock.minutes = PROJECT_KINDS.short_film.event.at;
    const sf = projectShowsTonight(s, {}, [S], s.meta.clock.day, s.meta.clock.minutes);
    // Seeded already in the final stage: booked on its first tick. A kind with no show: never booked.
    const z = __mk(); const [Z, Y] = __ids(z);
    const pz = __give(z, Z, 'good_cause', 3);
    const py = __give(z, Y, 'guitar', 3);
    resolveProjectsTick(z, {}, __ids(z), [], 30);
    // Given up before the day: off the calendar.
    const q = __mk(); const [Q] = __ids(q);
    const pq = __give(q, Q, 'standup', 3, { eventDay: q.meta.clock.day + 3 });
    const before = projectCalendarEvents(q).length;
    projectAbandon(q, Q, q.world.projects.people[Q], q.meta.clock.day);
    return { withEvent, wellFormed, leadDays: T.event.leadDays, booked, early, heldAt, need3, stillActive,
      rows, tabSame: JSON.stringify(tab) === JSON.stringify(rows), rowLabel, cellEvents: cell && cell.events, title, prompt, dayBefore, tooEarly,
      fin: fin.map(e => ({ type: e.type, room: e.roomId, line: formatEventText(e, g.npcs) })), texts: thread.msgs.length - thread0, after, name: g.npcs[A].bible.name,
      screening: sf.map(e => ({ room: e.roomId, type: e.type })), seeded: pz.eventDay, seededDay: z.meta.clock.day, noShow: py.eventDay, abandoned: { before, after: projectCalendarEvents(q).length } };
  } finally { __restoreBad(); }
})()`);
check(`three kinds have a show with a date (${show.withEvent.join(', ')}), each well formed`, show.withEvent.join(',') === 'good_cause,short_film,standup' && show.wellFormed, JSON.stringify(show.withEvent));
check(`reaching the final stage books it ${show.leadDays} days out`, show.booked.stage === 3 && show.booked.eventDay === show.booked.day + show.leadDays && show.booked.type === 'project_milestone', JSON.stringify(show.booked));
check('ready early, they keep rehearsing — it never finishes before the date', show.early.every(t => t === 'project_session') && show.heldAt === show.need3 && show.stillActive, JSON.stringify([show.early, show.heldAt, show.need3]));
check(`it is on your calendar — the Events tab: "${show.rowLabel}"`, show.rows.length === 1 && show.tabSame && show.rowLabel.startsWith('🎤 ' + show.name + ': open mic — ') && /\(evening, out\)$/.test(show.rowLabel), JSON.stringify(show.rows));
check('and on the Year grid, on its day', Array.isArray(show.cellEvents) && show.cellEvents.length === 1 && show.cellEvents[0].emoji === '🎤' && show.title.includes('🎤 ' + show.name + ': open mic'), JSON.stringify([show.cellEvents, show.title]));
check('they know it is coming, and that it is on your calendar (the prompt)', /The big day \(the open mic\) is in \d+ days — it's on the player's calendar\./.test(show.prompt), show.prompt);
check('nothing the day before, nor that evening before the show time', show.dayBefore === 0 && show.tooEarly === 0);
check(`on the night, at the time: the show happens — "${show.fin[0] && show.fin[0].line}"`, show.fin.length === 1 && /did .* at the open mic and got real laughs/.test(show.fin[0].line) && show.fin[0].line.startsWith(show.name), JSON.stringify(show.fin));
check('you were not there and they like you: a text about it', show.texts === 1, String(show.texts));
check('then it is done — finished in their history, off the calendar', !show.after.active && show.after.hist.status === 'finished' && show.after.rows === 0, JSON.stringify(show.after));
check('the screening is held in the living room — be there and you see it', show.screening.length === 1 && show.screening[0].room === 'living_room' && show.screening[0].type === 'project_finished', JSON.stringify(show.screening));
check('a project seeded already in its final stage books its date on the first tick; a kind with no show never books one', show.seeded === show.seededDay + show.leadDays && show.noShow === undefined, JSON.stringify([show.seeded, show.noShow]));
check('given up before the day: it comes off the calendar', show.abandoned.before === 1 && show.abandoned.after === 0, JSON.stringify(show.abandoned));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
