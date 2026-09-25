// RoomList Profile Inbox — a requested applicant stays reachable after their
// browse day is pruned (find-and-improve session, 2026-09-22; see
// src/src/ref/wip/roomlist-applicant-reachability-audit-2026-09-22.md).
//
//   node src/src/dev/verify/verify-roomlist-inbox.js
//
// The bug: every Inbox row (render.computer.js renderRoomListQueue) routed
// through classifieds.view-stub with the row's stubId, and
// doClassifiedsViewStub (ui.computer.js) looks the stub up in
// classifieds.stubs and silently returns when it's missing. Stubs are pruned
// STUB_RETENTION_DAYS after their day (computer.js
// generateApplicantStubsForDay), but the applicant the stub produced lives on
// in gs.npcs — so four in-game days after requesting a profile, its Inbox row
// still read "Ready — click to view" and clicking it did nothing. A fully
// generated applicant, possibly one you'd already interviewed, became
// unreachable from RoomList entirely. Live-reproduced in dev-harness.html
// before the fix and re-verified after it.
//
// Unusually for this suite, this harness runs the REAL renderer: the Inbox
// row's data-action/data-row-id wiring is exactly the part that was broken,
// and it is DOM-shaped, which the bare vm normally can't see (the cooking
// data-open bug of 2026-09-21 is the same blind spot). renderRoomListQueue,
// doClassifiedsFetchStub, doClassifiedsViewStub and doClassifiedsViewApplicant
// are lifted verbatim out of their source files by name and evaluated in the
// engine vm against a minimal fake `document`; the click is dispatched the
// way ui.js's handleAction does (data-action -> handler, data-row-id ->
// extra.rowId). Stub generation, pruning and promotion are the real engine.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'defs.computer.js', 'sim.js', 'computer.js', 'avatar.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

// Every declaration of `name` in `src`, brace-matched. Asserting there is
// exactly one guards against render.computer.js's desktop+mobile duplicate-
// renderer shape: if a second copy of renderRoomListQueue ever appears, the
// later one wins by hoisting and a fix to only the first would pass here.
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
const UC = fs.readFileSync(path.join(SRC, 'ui.computer.js'), 'utf8');
const lifted = {
  renderRoomListQueue: bodies(RC, 'renderRoomListQueue'),
  doClassifiedsFetchStub: bodies(UC, 'doClassifiedsFetchStub'),
  doClassifiedsViewStub: bodies(UC, 'doClassifiedsViewStub'),
  doClassifiedsViewApplicant: bodies(UC, 'doClassifiedsViewApplicant'),
};

console.log('\n0. The lifted functions');
for (const [name, list] of Object.entries(lifted)) {
  check(`${name} is declared exactly once in its source file`, list.length === 1, `found ${list.length}`);
}

// A minimal fake DOM: just the surface renderRoomListQueue touches. innerHTML
// is kept as a plain string (the renderer only ever assigns/appends to it).
api(`
  function __el(tag) {
    const attrs = new Map();
    return {
      tag, className: '', innerHTML: '', textContent: '', style: {}, children: [],
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      appendChild(c) { this.children.push(c); return c; },
    };
  }
  document = { createElement: (t) => __el(t), getElementById: () => null };
  // UI-layer globals the lifted handlers call. Rendering/logging/saving are
  // presentation or persistence, not what's under test here.
  var currentGameState = null;
  var renderComputerScreen = () => {};
  var addLogEntry = () => {};
  var saveAtBoundary = async () => {};
`);
for (const list of Object.values(lifted)) if (list[0]) api(list[0]);

api(`
  function __game(seed) {
    const h = SIM_generateHouse(seed, 0);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    // A liveable spare room is postRoommateAd's precondition — the same
    // "repair it via RenoFix first" state a real player reaches.
    g.world.upgrades.bedroom_habitability_1 = { tier: 'functional', condition: 100 };
    openApp(g, 'classifieds');
    return g;
  }
  // Every row the real renderer emits, with the attributes a click reads.
  function __inboxRows(g) {
    const body = __el('div');
    renderRoomListQueue(body, g, APP_DEFS.classifieds, 'queue');
    return body.children.filter(c => c.className === 'rl-queue-row').map(r => ({
      name: ((/rl-queue-name">([^<]*)</.exec((r.children[1] && r.children[1].innerHTML) || '')) || [])[1] || '',
      action: r.getAttribute('data-action'), rowId: r.getAttribute('data-row-id'),
    }));
  }
  // ui.js handleAction's routing for the two verbs an Inbox row can carry,
  // with extra.rowId taken from data-row-id exactly as its click delegation
  // does.
  async function __click(row) {
    if (row.action === 'classifieds.view-applicant') doClassifiedsViewApplicant(row.rowId);
    else if (row.action === 'classifieds.view-stub') await doClassifiedsViewStub(row.rowId);
  }
  function __findStub(g, stubId) {
    for (const d of Object.keys(g.world.computer.apps.classifieds.stubs)) {
      const s = g.world.computer.apps.classifieds.stubs[d].find(x => x.stubId === stubId);
      if (s) return s;
    }
    return null;
  }
`);

async function main() {
  // ------------------------------------------------------------------ 1
  console.log('\n1. Setup through the real engine: post, browse, request two profiles');
  api(`__g = __game(20260922); currentGameState = __g; __post = postRoommateAd(__g);`);
  check('postRoommateAd succeeds with a liveable spare room and seeds day 1\'s stubs',
    J(`__post.ok && (__g.world.computer.apps.classifieds.stubs[1] || []).length === 30`));
  await api(`(async () => { await doClassifiedsFetchStub('stub_1_1'); await doClassifiedsFetchStub('stub_1_2'); })()`);
  const q0 = J(`__g.world.computer.apps.classifieds.fetchQueue.map(q => ({ stubId: q.stubId, status: q.status, npcId: q.npcId, name: q.name }))`);
  check('both requests land in the Inbox as ready, each with a live prospective applicant behind it',
    q0.length === 2 && q0.every(q => q.status === 'ready' && q.npcId)
      && J(`__g.world.computer.apps.classifieds.fetchQueue.every(q => __g.npcs[q.npcId] && __g.npcs[q.npcId].residency.status === 'prospective')`),
    JSON.stringify(q0));

  const sameDay = J(`__inboxRows(__g)`);
  check('same day: both ready rows render, each clickable',
    sameDay.length === 2 && q0.every(q => sameDay.some(r => r.name === q.name && r.action)),
    JSON.stringify(sameDay));
  const firstRow = sameDay.find(r => r.name === q0[0].name);
  if (firstRow) await api(`__click(${JSON.stringify(firstRow)})`);
  check('same day: clicking a row opens that applicant\'s profile',
    J(`__g.world.computer.apps.classifieds.viewingApplicantId === ${JSON.stringify(q0[0].npcId)} && __g.world.computer.windows.classifieds.screenId === 'detail'`));

  // ------------------------------------------------------------------ 2
  console.log('\n2. Four day rollovers later — the stubs are pruned, the applicants are not');
  // processClassifiedsForDay (ui.js) is a one-line wrapper around exactly this.
  api(`for (const d of [2, 3, 4, 5]) { __g.meta.clock.day = d; generateApplicantStubsForDay(__g, d); }`);
  check('day 1\'s stubs are gone (the pruning this bug hinged on still happens — it is correct, bounded memory)',
    J(`!__g.world.computer.apps.classifieds.stubs[1] && __findStub(__g, 'stub_1_1') === null`),
    `stub days now: ${J(`Object.keys(__g.world.computer.apps.classifieds.stubs)`).join(',')}`);
  check('...but both Inbox entries are still ready, and both applicants still exist as prospective',
    J(`__g.world.computer.apps.classifieds.fetchQueue.length === 2 && __g.world.computer.apps.classifieds.fetchQueue.every(q => q.status === 'ready' && __g.npcs[q.npcId] && __g.npcs[q.npcId].residency.status === 'prospective')`));
  // The control that proves this harness can see the bug: the old route
  // (view-stub by stubId) is a silent no-op once the stub is gone.
  api(`__g.world.computer.apps.classifieds.viewingApplicantId = null; switchScreen(__g, 'classifieds', 'queue');`);
  await api(`doClassifiedsViewStub('stub_1_1')`);
  check('control: the OLD route (view-stub by a pruned stubId) opens nothing — the dead click players hit',
    J(`__g.world.computer.apps.classifieds.viewingApplicantId === null && __g.world.computer.windows.classifieds.screenId === 'queue'`));

  const later = J(`__inboxRows(__g)`);
  check('day 5: both rows still render as clickable (they still read "Ready — click to view")',
    later.length === 2 && q0.every(q => later.some(r => r.name === q.name && r.action)),
    JSON.stringify(later));
  for (const q of q0) {
    const row = later.find(r => r.name === q.name);
    api(`__g.world.computer.apps.classifieds.viewingApplicantId = null; switchScreen(__g, 'classifieds', 'queue');`);
    if (row) await api(`__click(${JSON.stringify(row)})`);
    check(`day 5: clicking ${q.stubId}'s row opens its applicant's profile`,
      J(`__g.world.computer.apps.classifieds.viewingApplicantId === ${JSON.stringify(q.npcId)} && __g.world.computer.windows.classifieds.screenId === 'detail'`));
  }

  // ------------------------------------------------------------------ 3
  console.log('\n3. Downstream: the reached applicant can still move in');
  const npcId = q0[0].npcId;
  api(`__acc = acceptApplicant(__g, ${JSON.stringify(npcId)}, 'bedroom_1');`);
  check('acceptApplicant moves them in and clears their Inbox entry (and only theirs)',
    J(`__acc.ok && __g.npcs[${JSON.stringify(npcId)}].residency.status === 'resident' && __g.world.computer.apps.classifieds.fetchQueue.length === 1 && __g.world.computer.apps.classifieds.fetchQueue[0].npcId === ${JSON.stringify(q0[1].npcId)}`));

  // ------------------------------------------------------------------ 4
  console.log('\n4. Rows that are not ready stay inert');
  api(`__g.world.computer.apps.classifieds.fetchQueue.push(
    { stubId: 'stub_5_7', status: 'fetching', npcId: null, startedDay: 5, name: 'Pending', occupation: 'Barista' },
    { stubId: 'stub_5_8', status: 'error', npcId: null, startedDay: 5, name: 'Failed', occupation: 'Nurse' });`);
  const mixed = J(`__inboxRows(__g)`);
  check('a fetching or failed entry renders with no click action; the ready one keeps its',
    mixed.length === 3 && mixed.filter(r => r.name === 'Pending' || r.name === 'Failed').every(r => r.action === null)
      && mixed.filter(r => r.name === q0[1].name).every(r => r.action !== null),
    JSON.stringify(mixed));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
