// RoomList applicant reachability, Findings 2 and 3 (0.14.5, 2026-09-29; see
// src/src/ref/wip/roomlist-applicant-reachability-audit-2026-09-22.md).
//
//   node src/src/dev/verify/verify-roomlist-saved.js
//
// Finding 2: Browse's "★ Saved" was a filter over TODAY's stubs, so a saved
// applicant vanished from it at the next day's rotation while the button still
// counted them. Saved mode is now its own source (getSavedApplicantNpcs: every
// favorited NPC still 'prospective', stub-promoted or Studio-built, filtered
// and sorted off npc.bible), painted by the REAL renderRoomListBrowse.
// Finding 3: the Applicants screen — the only list of Studio-built applicants
// with an Accept route — was hideFromNav.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { FAKE_DOM_SRC } = require('./fakedom.js');
const { api } = loadEngine({ required: ['config.js', 'defs.computer.js', 'sim.js', 'computer.js', 'avatar.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

function bodies(src, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const re = new RegExp(`(?:async )?function ${name}\\(`, 'g');
    re.lastIndex = from;
    const m = re.exec(src);
    if (!m) break;
    let depth = 0, started = false, j = m.index;
    for (; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
    }
    out.push(src.slice(m.index, j));
    from = j;
  }
  return out;
}
const RC = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
const lifted = ['renderRoomListBrowse', 'renderRoomListApplicants', 'buildApplicantNpcCard'].map(n => [n, bodies(RC, n)]);
console.log('\n0. The lifted renderers and the nav flag');
for (const [n, list] of lifted) check(`${n} is declared exactly once`, list.length === 1, `found ${list.length}`);
check('the Applicants screen is in the nav (no hideFromNav) — Finding 3', J(`APP_DEFS.classifieds.screens.applicants.hideFromNav !== true`));

api(FAKE_DOM_SRC);
api(`
  var currentGameState = null;
  function avatarChipHtml() { return ''; }
  function fullName(s) { return (s.name || '') + ' ' + (s.surname || ''); }
  function hashToColor() { return '#888'; }
`);
for (const [, list] of lifted) api(list[0]);

api(`
  function __game(seed) {
    const h = SIM_generateHouse(seed, 0);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.upgrades.bedroom_habitability_1 = { tier: 'functional', condition: 100 };
    openApp(g, 'classifieds');
    return g;
  }
  function __cards(g) {
    const body = __el('div');
    renderRoomListBrowse(body, g, APP_DEFS.classifieds, 'browse');
    const all = [];
    const walk = (n) => { all.push(n); (n.children || []).forEach(walk); };
    walk(body);
    return { cards: all.filter(n => n.getAttribute && n.getAttribute('data-action') === 'classifieds.view-applicant').map(n => n.getAttribute('data-row-id')),
             stubCards: all.filter(n => n.getAttribute && n.getAttribute('data-action') === 'classifieds.view-stub').length,
             text: all.map(n => n.textContent || '').join(' ') + all.map(n => n.innerHTML || '').join(' '),
             favBtn: all.some(n => n.getAttribute && n.getAttribute('data-action') === 'classifieds.toggle-fav-filter') };
  }
`);

console.log('\n1. Setup: post, request three profiles, save two, build a Studio applicant and save it');
api(`__g = __game(20260929); currentGameState = __g; postRoommateAd(__g);`);
api(`(() => { const c = __g.world.computer.apps.classifieds;
  for (const sid of ['stub_1_1', 'stub_1_2', 'stub_1_3']) promoteStubToNpc(__g, sid); })()`);
const ids = J(`Object.keys(__g.npcs).filter(id => __g.npcs[id].residency.status === 'prospective')`);
check('three prospective applicants exist (stub-promoted)', ids.length === 3, JSON.stringify(ids));
api(`(() => { const c = __g.world.computer.apps.classifieds; c.favorites = [${JSON.stringify(ids[0])}, ${JSON.stringify(ids[1])}]; })()`);
api(`__studio = buildStudioNpc(__g, { name: 'Studio', surname: 'Person', age: 30, gender: 'female' });`);
const studioId = J(`__studio.ok ? __studio.npcId : null`);
check('a Studio-built applicant is created (it is in classifieds.applicants, never a stub)', !!studioId && J(`__g.world.computer.apps.classifieds.applicants.includes(${JSON.stringify(studioId)})`), JSON.stringify(J(`__studio`)));
api(`__g.world.computer.apps.classifieds.favorites.push(${JSON.stringify(studioId)});`);

console.log('\n2. The bug, reproduced: Saved mode on the SAME day, then after the day rotates');
api(`__g.world.computer.apps.classifieds.filters.favoritesOnly = true;`);
const day1 = J(`__cards(__g)`);
check('same day: Saved mode shows all three saved applicants (two stub-promoted + the Studio one) as full-NPC cards',
  day1.cards.length === 3 && [ids[0], ids[1], studioId].every(i => day1.cards.includes(i)) && day1.stubCards === 0, JSON.stringify(day1.cards));
api(`for (const d of [2, 3, 4, 5, 6]) { __g.meta.clock.day = d; generateApplicantStubsForDay(__g, d); }`);
check('control: five day rotations later the browse day changed and day 1\'s stubs are pruned',
  J(`__g.world.computer.apps.classifieds.activeDay`) === 6 && J(`!__g.world.computer.apps.classifieds.stubs[1]`));
const later = J(`__cards(__g)`);
check('...and Saved mode STILL shows all three (the old filter-over-stubs showed none)', later.cards.length === 3 && later.stubCards === 0, JSON.stringify(later.cards));
check('the "★ Saved" button is present and the count line says saved', later.favBtn && /saved applicant/.test(later.text));

console.log('\n3. Filters and sorting read npc.bible, not the stub');
api(`(() => { const g = __g; const [a, b] = ${JSON.stringify(ids)};
  g.npcs[a].bible.gender = 'male'; g.npcs[b].bible.gender = 'female'; g.npcs[a].bible.age = 25; g.npcs[b].bible.age = 41;
  g.npcs[a].bible.name = 'Zed'; g.npcs[b].bible.name = 'Abby'; })()`);
const f1 = J(`(() => { const c = __g.world.computer.apps.classifieds; c.filters.gender = ['male'];
  const male = getSavedApplicantNpcs(__g).map(x => x.id); c.filters.gender = [];
  c.filters.ageRange = [30, 60]; const old = getSavedApplicantNpcs(__g).map(x => x.id); c.filters.ageRange = [18, 60];
  c.filters.sortBy = 'name'; const byName = getSavedApplicantNpcs(__g).map(x => x.npc.bible.name); c.filters.sortBy = 'age'; const byAge = getSavedApplicantNpcs(__g).map(x => x.npc.bible.age); c.filters.sortBy = 'recent';
  return { male, old, byName, byAge }; })()`);
check('gender filter applies to the full NPC', f1.male.length === 1 && f1.male[0] === ids[0], JSON.stringify(f1.male));
check('age range applies to the full NPC', f1.old.includes(ids[1]) && !f1.old.includes(ids[0]), JSON.stringify(f1.old));
check('sort by name and by age', f1.byName[0] === 'Abby' && f1.byAge[0] <= f1.byAge[1] && f1.byAge[1] <= f1.byAge[2], JSON.stringify({ n: f1.byName, a: f1.byAge }));

console.log('\n4. A saved applicant who moves in (or is rejected) leaves the list; an empty Saved view says so');
api(`acceptApplicant(__g, ${JSON.stringify(ids[0])}, 'bedroom_1'); __g.world.computer.apps.classifieds.posted.active = true;`);
const afterAccept = J(`__cards(__g)`);
check('an accepted applicant is no longer a saved applicant (acceptApplicant also prunes favorites)', !afterAccept.cards.includes(ids[0]) && afterAccept.cards.length === 2, JSON.stringify(afterAccept.cards));
api(`__g.world.computer.apps.classifieds.favorites = [];`);
const empty = J(`__cards(__g)`);
check('with nothing saved the view says so and the toggle stays available to switch Saved OFF (no stuck empty view)', /No saved applicants/.test(empty.text) && empty.favBtn, empty.text.slice(0, 200));
api(`__g.world.computer.apps.classifieds.filters.favoritesOnly = false;`);
const back = J(`__cards(__g)`);
check('switching Saved off returns to the day\'s stubs', back.stubCards > 0);

console.log('\n5. The Applicants screen lists the Studio applicant (Finding 3)');
const app = J(`(() => { const body = __el('div'); renderRoomListApplicants(body, __g, APP_DEFS.classifieds, 'applicants'); const cards = body.children[0].children.map(c => c.getAttribute('data-row-id')); return { cards, studio: ${JSON.stringify(studioId)} }; })()`);
check('renderRoomListApplicants shows the Studio-built applicant with a view/accept route', app.cards.includes(app.studio), JSON.stringify(app.cards));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
