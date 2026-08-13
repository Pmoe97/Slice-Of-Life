// Phase 3 verification — memory importance and eviction (D8-D9).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const ctx = vm.createContext({ console, Math, JSON, Object, Array, String, Number, RegExp, Set, Map, Date, Promise, Infinity });

vm.runInContext(`
  var window = { generatorPublicId: 'test', generatorIsUnsaved: false };
  var root = { kv: {} };
  function mulberry32(seed){ let a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
`, ctx);

for (const f of ['config.js', 'npc.js', 'state.js']) {
  try { vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); process.exit(1); }
}
// ui.js needs the DOM; eventImportance is small and self-contained, so mirror
// it here against the REAL tables loaded above rather than loading all of ui.js.
vm.runInContext(`
  function eventImportance(evt) {
    if (typeof evt?.importance === 'number') return evt.importance;
    const band = EVENT_IMPORTANCE[evt?.type];
    return MEMORY_IMPORTANCE[band] ?? MEMORY_IMPORTANCE.ambient;
  }
`, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const api = (e) => vm.runInContext(e, ctx);
ctx.__t = {};
api(`__t.blank = () => ({ memory: { facts: [], episodes: [], recent: [], styleCounters: {} } });`);

console.log('\nD8 — importance comes from the source, not a constant');
check('an ambient world event scores ambient',
      api(`eventImportance({ type: 'laundry' })`) === api(`MEMORY_IMPORTANCE.ambient`));
check('an unlisted type falls back to ambient (safe direction)',
      api(`eventImportance({ type: 'some_future_event' })`) === api(`MEMORY_IMPORTANCE.ambient`));
check('a social event outranks ambient',
      api(`eventImportance({ type: 'npc_chat' })`) > api(`eventImportance({ type: 'laundry' })`));
check('a significant event outranks social',
      api(`eventImportance({ type: 'evidence_discovered' })`) > api(`eventImportance({ type: 'npc_chat' })`));
check('an explicit importance on the event wins over the table',
      api(`eventImportance({ type: 'laundry', importance: 0.9 })`) === 0.9);

console.log('\nD9 — eviction drops the least valuable, not the oldest');
api(`
  __t.n = __t.blank();
  // 25 ambient episodes first (oldest), then 5 conversational.
  for (let i = 0; i < 25; i++) __t.n = addMemoryEpisode(__t.n, 5, 'ambient ' + i, MEMORY_IMPORTANCE.ambient);
  for (let i = 0; i < 5;  i++) __t.n = addMemoryEpisode(__t.n, 5, 'talk ' + i,    MEMORY_IMPORTANCE.conversational);
  __t.n = addMemoryEpisode(__t.n, 5, 'THE BIG ONE', MEMORY_IMPORTANCE.significant);
`);
const eps = api(`__t.n.memory.episodes`);
check('budget respected (30)', eps.length === 30, `got ${eps.length}`);
check('the significant episode survived', eps.some(e => e.text === 'THE BIG ONE'));
check('all 5 conversational episodes survived',
      eps.filter(e => e.text.startsWith('talk ')).length === 5,
      `got ${eps.filter(e => e.text.startsWith('talk ')).length}`);
check('an AMBIENT episode was the one evicted',
      eps.filter(e => e.text.startsWith('ambient ')).length === 24,
      `got ${eps.filter(e => e.text.startsWith('ambient ')).length}`);
check('the evicted ambient was the OLDEST ambient (tie broken by age)',
      !eps.some(e => e.text === 'ambient 0'));

console.log('\nD9 — a week of background noise cannot bury a real beat');
api(`
  __t.w = __t.blank();
  __t.w = addMemoryEpisode(__t.w, 1, 'SHE TOLD YOU ABOUT HER FATHER', MEMORY_IMPORTANCE.significant);
  for (let i = 0; i < 200; i++) __t.w = addMemoryEpisode(__t.w, 2 + Math.floor(i/7), 'chore ' + i, MEMORY_IMPORTANCE.ambient);
`);
check('after 200 ambient events the significant memory is still there',
      api(`__t.w.memory.episodes.some(e => e.text === 'SHE TOLD YOU ABOUT HER FATHER')`),
      'this is the exact failure FIFO produced');
check('budget still respected after the flood',
      api(`__t.w.memory.episodes.length`) === api(`MEMORY_BUDGET.maxEpisodes`));

console.log('\nDecay participates in the score');
api(`
  __t.d = __t.blank();
  // A faded conversational memory should lose to a fresh social one.
  for (let i = 0; i < 29; i++) __t.d = addMemoryEpisode(__t.d, 5, 'filler ' + i, MEMORY_IMPORTANCE.significant);
  __t.d = addMemoryEpisode(__t.d, 5, 'FADED', MEMORY_IMPORTANCE.conversational);
  __t.d.memory.episodes.find(e => e.text === 'FADED').decay = 0.05;   // 0.5*0.05 = 0.025
  __t.d = addMemoryEpisode(__t.d, 5, 'FRESH SOCIAL', MEMORY_IMPORTANCE.social); // 0.3*1.0 = 0.3
`);
check('a heavily decayed episode loses to a fresh lesser one',
      !api(`__t.d.memory.episodes.some(e => e.text === 'FADED')`) &&
       api(`__t.d.memory.episodes.some(e => e.text === 'FRESH SOCIAL')`));

console.log('\nDay-0 shared history is exempt');
api(`
  __t.s = __t.blank();
  for (let i = 0; i < 5; i++) __t.s = addMemoryEpisode(__t.s, 0, 'shared history ' + i, MEMORY_IMPORTANCE.ambient);
  for (let i = 0; i < 60; i++) __t.s = addMemoryEpisode(__t.s, 9, 'later ' + i, MEMORY_IMPORTANCE.significant);
`);
check('day-0 episodes survive despite being the lowest-scored',
      api(`__t.s.memory.episodes.filter(e => e.day === 0).length`) === 5,
      `got ${api(`__t.s.memory.episodes.filter(e => e.day === 0).length`)}`);
check('and the tier still respects its budget', api(`__t.s.memory.episodes.length`) === 30);

api(`
  __t.allShared = __t.blank();
  for (let i = 0; i < 40; i++) __t.allShared = addMemoryEpisode(__t.allShared, 0, 'shared ' + i, 0.5);
`);
check('an all-exempt tier overflows rather than dropping a permanent memory',
      api(`__t.allShared.memory.episodes.length`) === 40);

console.log('\nFacts evict by importance, and the off-by-one is gone');
// The fact budget MOVED in Plan 4 (knowledge-gossip Phase 1, D15):
// `MEMORY_BUDGET.maxFacts` 40 became `BELIEF.maxFacts` 60. This block read the
// old name — i.e. `undefined` — and filled a hardcoded 40, so all three
// assertions were measuring a cap that no longer existed. The cap is read once
// here and every loop below is sized from it, so the next move costs nothing.
const FACT_CAP = api(`BELIEF.maxFacts`);
api(`
  __t.f = __t.blank();
  for (let i = 0; i < ${FACT_CAP}; i++) __t.f = addMemoryFact(__t.f, { text: 'trivia ' + i, importance: 0.2 });
`);
check(`facts fill to exactly maxFacts (${FACT_CAP}), not ${FACT_CAP - 1}`,
      api(`__t.f.memory.facts.length`) === FACT_CAP,
      `got ${api(`__t.f.memory.facts.length`)}`);
api(`__t.f = addMemoryFact(__t.f, { text: 'HER BIRTHDAY IS THE 4TH', importance: 1 });`);
check('a high-importance fact evicts a trivial one, not itself',
      api(`__t.f.memory.facts.some(f => f.text === 'HER BIRTHDAY IS THE 4TH')`));
check(`facts still capped at ${FACT_CAP}`, api(`__t.f.memory.facts.length`) === FACT_CAP);
// Filled at `conversational`, DELIBERATELY. This used to fill at importance 1,
// which Plan 4's D3 made a second claim as well as a priority: importance >=
// MEMORY_IMPORTANCE.significant now grants `pinned`, and pinned facts never
// evict. So the old version built a tier where every entry was exempt and then
// asserted one of them got dropped. The invariant it is reaching for — an
// invalid fact is the cheapest thing to lose — only has meaning among facts
// that are evictable at all.
api(`
  __t.f2 = __t.blank();
  for (let i = 0; i < ${FACT_CAP}; i++)
    __t.f2 = addMemoryFact(__t.f2, { text: 'keep ' + i, importance: MEMORY_IMPORTANCE.conversational });
  __t.f2.memory.facts[7].valid = false;
  __t.f2 = addMemoryFact(__t.f2, { text: 'NEW', importance: MEMORY_IMPORTANCE.conversational });
`);
check('an invalidated fact is evicted before any valid one',
      !api(`__t.f2.memory.facts.some(f => f.text === 'keep 7')`) &&
       api(`__t.f2.memory.facts.some(f => f.text === 'NEW')`));
check('...and none of those facts was pinned, or the eviction above proved nothing',
      api(`__t.f2.memory.facts.every(f => f.pinned !== true)`),
      `MEMORY_IMPORTANCE.conversational must stay below .significant for this test to bite`);
// D3's other half, which nothing covered and which surprised a reader of this
// file: a tier of entirely pinned facts is ALLOWED to exceed the budget. That
// is the day-0 episode precedent applied to beliefs, not a cap that leaks.
api(`
  __t.f3 = __t.blank();
  for (let i = 0; i < ${FACT_CAP} + 1; i++)
    __t.f3 = addMemoryFact(__t.f3, { text: 'core ' + i, importance: MEMORY_IMPORTANCE.significant });
`);
check(`an all-pinned tier is allowed past the ${FACT_CAP} budget (D3)`,
      api(`__t.f3.memory.facts.length`) === FACT_CAP + 1 &&
      api(`__t.f3.memory.facts.every(f => f.pinned === true)`),
      `got ${api(`__t.f3.memory.facts.length`)} — pinned facts never evict, so the budget yields rather than the memory`);

console.log('\nRanking and eviction now agree');
// retrieveRelevantMemories ranks by importance*decay; eviction must use the
// same product, or the tier surfaces by one theory and forgets by another.
api(`
  __t.r = __t.blank();
  __t.r = addMemoryEpisode(__t.r, 5, 'guitar lesson with marcus', MEMORY_IMPORTANCE.significant);
  for (let i = 0; i < 40; i++) __t.r = addMemoryEpisode(__t.r, 6, 'nap ' + i, MEMORY_IMPORTANCE.ambient);
  __t.hit = retrieveRelevantMemories(__t.r, 'guitar marcus', 5);
`);
check('a memory the retrieval layer would surface is still retrievable after a flood',
      api(`__t.hit.episodes.length`) > 0, 'ranking and eviction disagreed');

console.log('\nProposal-declared importance is clamped');
check('MEMORY_IMPORTANCE bands are ordered ambient < social < conversational < significant',
      api(`MEMORY_IMPORTANCE.ambient < MEMORY_IMPORTANCE.social &&
           MEMORY_IMPORTANCE.social < MEMORY_IMPORTANCE.conversational &&
           MEMORY_IMPORTANCE.conversational < MEMORY_IMPORTANCE.significant`));
api(`__t.c = addMemoryEpisode(__t.blank(), 5, 'x', undefined);`);
check('an undefined importance defaults to conversational',
      api(`__t.c.memory.episodes[0].importance`) === api(`MEMORY_IMPORTANCE.conversational`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
