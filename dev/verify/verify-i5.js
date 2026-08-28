// NPC initiative plan, Phase 5 — shared activities.
//
//   node dev/verify/verify-i5.js
//
// Phases 1-4 are all one direction: an NPC reaching for the player. This is
// the other one — the player's own verbs becoming things you can do WITH
// someone rather than next to them — and D17 makes that a `shared` field on
// the ten ACTION_DEFS entries that already exist rather than a parallel
// `together.*` table nobody would keep in step with its solo twin.
//
// The invariants, in the order they would hurt if they broke:
//   - D16 needs BOTH halves. A fact with no delta leaves the payoff
//     unmechanical; a delta with no fact leaves the knowledge loop open. And
//     the same activity ALONE must produce neither, or "shared" means nothing.
//   - the fact tier is bounded BY CONSTRUCTION, not throttled. One fact per
//     activity per NPC caps this source at one per shareable entry against
//     BELIEF.maxFacts — the property D24/D25 settled on in Phase 2, reached
//     here by exact-text dedupe because unlike D25's exemplar the text is
//     deterministic.
//   - shared time does not become the dominant relationship lever (D16). Not
//     as an argument about how much a player will grind, but derived: a whole
//     day at the cap moves an axis LESS than one judged conversation window at
//     its ceiling.
//   - "who is in this with me" has exactly ONE answer. D16's consequences and
//     the pre-existing social mood impulse ask it about the same room at the
//     same instant, so two implementations would be two ideas of togetherness
//     with nothing forcing them to agree.
//   - the write survives the tick. resolveBatch rebuilds every NPC through
//     `{ ...state.npcs[id], ...update }`, and this suite already has two plans'
//     worth of scars from writes that did not come back out of it.
const path = require('path');
const fs = require('fs');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'defs.actions.js', 'actions.js', 'sim.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

const HOUSES = 12, DAY = 48, DAYS = 7;

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'living_room';
    // SIM_generateHouse leaves bible.name EMPTY — names are written by the
    // cast-generation step the real game runs before play, so every fixture
    // here would otherwise exercise the 'your roommate' fallback and every
    // name assertion below would be vacuously true against ''. Stamp distinct
    // names, which is the state the game is actually in when a player can
    // reach any of this.
    const names = ['Ada', 'Bo', 'Cyrus', 'Dey'];
    Object.keys(g.npcs).forEach((id, i) => { g.npcs[id].bible.name = names[i % names.length]; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __factText = (g, id, actionId) =>
    ACTION_DEFS[actionId].shared.fact.replace('{name}', g.npcs[id].bible.name);
  __shared = () => Object.keys(ACTION_DEFS).filter(k => ACTION_DEFS[k].shared);

  // Put every resident somewhere else, then place exactly the ones named into
  // the player's room, awake. The scenario every D16 assertion below runs on.
  __stage = (g, withIds, activity) => {
    for (const id of __ids(g)) { g.npcs[id].location = 'hallway_a'; g.npcs[id].activity = ''; }
    for (const id of withIds) { g.npcs[id].location = g.player.location; g.npcs[id].activity = activity || ''; }
    return buildActionContext(g);
  };

  // Run one shared activity end to end WITHOUT executeAction, which awaits
  // advanceAndResolveMinutes — a UI/DOM function this loader deliberately
  // stops short of. resolveSharedActivity is the whole of what executeAction
  // adds, which is why the phase put it in a named function rather than inline.
  __do = (g, actionId, withIds, minutes) => {
    const def = ACTION_DEFS[actionId];
    const c = __stage(g, withIds);
    return resolveSharedActivity(g, def, c, minutes === undefined ? resolveTimeCost(def, g, null) : minutes);
  };

  // Which rooms is this action available from? Derived from the def's own
  // source (README rule 5) rather than a hand-kept list — a room-sourced entry
  // names its rooms, an object-sourced one names an object and the house says
  // which room holds it.
  __roomsFor = (g, def) => {
    if (def.source.kind === 'room') return def.source.roomIds.slice();
    const wanted = def.source.objDefs || [def.source.objDef];
    const out = [];
    for (const [bucket, objs] of Object.entries(g.objects || {})) {
      if (!bucket.startsWith('room_')) continue;
      if (Object.values(objs).some(o => wanted.includes(o.defId))) out.push(bucket.slice('room_'.length));
    }
    return out;
  };
`);

console.log('\n=== NPC initiative Phase 5: shared activities ===');

// ---------------------------------------------------------------------------
console.log('\nD17 — a participant parameter, not a parallel table');

check('ten ACTION_DEFS entries carry `shared`', J(`__shared().length`) >= 10,
      `found ${J(`__shared().length`)}: ${J(`__shared()`).join(', ')}`);
check('and every one of them is an existing self.* verb, not a new id', api(`
  __shared().every(id => id.startsWith('self.'))
`), 'D17: the shared version is the same activity, so it is the same entry');
check('there is no parallel together.* table', api(`
  Object.keys(ACTION_DEFS).every(id => !id.startsWith('together.'))
`));
check('every shared entry names a rate that SHARED_ACTIVITY.rates declares', api(`
  (() => {
    const bad = __shared().filter(id => !SHARED_ACTIVITY.rates[ACTION_DEFS[id].shared.rate]);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('and no entry writes its own delta literal — the numbers have one home', api(`
  __shared().every(id => {
    const s = ACTION_DEFS[id].shared;
    return s.delta === undefined && typeof s.rate === 'string';
  })
`), 'the verify-i1 rule: a table with ten copies of a constant has no lever');
check('every rate on the table is actually used by some entry', api(`
  (() => {
    const used = new Set(__shared().map(id => ACTION_DEFS[id].shared.rate));
    const orphans = Object.keys(SHARED_ACTIVITY.rates).filter(r => !used.has(r));
    if (orphans.length) console.log('        unused rates: ' + orphans.join(', '));
    return orphans.length === 0;
  })()
`), 'R8: a rate nothing declares is a tier nobody can reach');
check('only `confiding` moves trust — the tiers are a real distinction', api(`
  (() => {
    const r = SHARED_ACTIVITY.rates;
    const withTrust = Object.keys(r).filter(k => (r[k].trust || 0) > 0);
    return withTrust.length === 1 && withTrust[0] === 'confiding';
  })()
`));
check('every shared entry carries a fact AND at least one narration template', api(`
  (() => {
    const bad = __shared().filter(id => {
      const s = ACTION_DEFS[id].shared;
      return !s.fact || !Array.isArray(s.templates) || s.templates.length === 0;
    });
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`), 'D16 wants the fact; D17 wants the two-person version');
check('every fact and every template substitutes {name}', api(`
  (() => {
    const bad = [];
    for (const id of __shared()) {
      const s = ACTION_DEFS[id].shared;
      if (!s.fact.includes('{name}')) bad.push(id + ':fact');
      s.templates.forEach((t, i) => { if (!t.includes('{name}')) bad.push(id + ':tpl' + i); });
    }
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`), 'a shared line that never names who you were with is a solo line');
check('the ten fact templates are all DIFFERENT', api(`
  (() => {
    const texts = __shared().map(id => ACTION_DEFS[id].shared.fact);
    return new Set(texts).size === texts.length;
  })()
`), 'exact-text dedupe keeps one fact per ACTIVITY only if the texts differ');
check('SHARED_ACTIVITY.factImportance names a real MEMORY_IMPORTANCE band', api(`
  typeof MEMORY_IMPORTANCE[SHARED_ACTIVITY.factImportance] === 'number'
`));
check('and it is the same band a refused overture writes at', api(`
  SHARED_ACTIVITY.factImportance === OVERTURE.refusalFactImportance
`), 'a shared evening and a refused approach are the same weight class');

// ---------------------------------------------------------------------------
console.log('\nEvery ACTION_DEFS entry declares a timeCost');
// The invariant behind this phase's one live-bug fix, asserted as a class
// rather than as the three instances that were missing it (README rule 2).
// resolveTimeCost reads timeCost.base unconditionally, so an entry without one
// THROWS out of executeAction — self.workout, self.play_games and self.study
// all did, and all three are activities D17 makes shareable.
check('no entry is missing timeCost', api(`
  (() => {
    const bad = Object.entries(ACTION_DEFS).filter(([, d]) => d.timeCost === undefined).map(([k]) => k);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('and resolveTimeCost returns a positive integer for every one of them', api(`
  (() => {
    const g = __mk();
    const bad = [];
    for (const id of Object.keys(ACTION_DEFS)) {
      let m;
      try { m = resolveTimeCost(ACTION_DEFS[id], g, null); }
      catch (e) { bad.push(id + ' THREW ' + e.message); continue; }
      if (!(Number.isInteger(m) && m > 0)) bad.push(id + '=' + m);
    }
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('every shareable activity costs real minutes — a 1-minute one would be a tap', api(`
  (() => {
    const g = __mk();
    const bad = __shared().filter(id => resolveTimeCost(ACTION_DEFS[id], g, null) < 10);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`), 'the delta is scaled by minutes, so a cheap verb must not be the cheap exploit');

// ---------------------------------------------------------------------------
console.log('\nIt fails closed (D23/D29 shape)');

check('an unknown rate pays nothing rather than defaulting to the best one', api(`
  sharedActivityDelta({ shared: { rate: 'nope' } }, 60) === null
`));
check('an entry with no `shared` pays nothing', api(`
  sharedActivityDelta({}, 60) === null && sharedActivityDelta(null, 60) === null
`));
check('zero credited minutes pay nothing', api(`
  sharedActivityDelta({ shared: { rate: 'confiding' } }, 0) === null
  && sharedActivityDelta({ shared: { rate: 'confiding' } }, -30) === null
`));
check('resolveSharedActivity on an entry with no `shared` does nothing at all', api(`
  (() => {
    const g = __mk();
    const c = __stage(g, __ids(g));          // stage FIRST — __stage moves people
    const before = JSON.stringify(g.npcs);
    const r = resolveSharedActivity(g, ACTION_DEFS['self.dishes'], c, 30);
    return r.withIds.length === 0 && r.facts.length === 0 && JSON.stringify(g.npcs) === before;
  })()
`));
check('and on a null gameState it returns the empty result rather than throwing', api(`
  (() => {
    try {
      const r = resolveSharedActivity(null, ACTION_DEFS['self.watch_tv'], null, 30);
      return r.withIds.length === 0 && r.facts.length === 0;
    } catch (e) { console.log('        threw: ' + e.message); return false; }
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nWho is IN it with you — one question, one answer');

check('a resident awake in the room counts', api(`
  (() => { const g = __mk(); const id = __ids(g)[0]; __stage(g, [id]);
           return sharedActivityParticipants(buildActionContext(g)).join() === id; })()
`));
check('a resident in another room does not', api(`
  (() => { const g = __mk(); __stage(g, []);
           return sharedActivityParticipants(buildActionContext(g)).length === 0; })()
`));
check('every SHARED_ACTIVITY.excludeActivities entry really excludes', api(`
  (() => {
    const bad = [];
    for (const act of SHARED_ACTIVITY.excludeActivities) {
      const g = __mk(); const id = __ids(g)[0];
      __stage(g, [id], act);
      if (sharedActivityParticipants(buildActionContext(g)).length !== 0) bad.push(act);
    }
    if (bad.length) console.log('        still counted: ' + bad.join(', '));
    return bad.length === 0;
  })()
`), 'a roommate asleep on the sofa is not watching TV with you');
check('an unknown activity fails OPEN — they are just in the room doing something', api(`
  (() => { const g = __mk(); const id = __ids(g)[0]; __stage(g, [id], 'reading a book');
           return sharedActivityParticipants(buildActionContext(g)).join() === id; })()
`));
check('a non-resident in the room does not count', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __stage(g, [id]);
    g.npcs[id].residency = { ...g.npcs[id].residency, status: 'guest' };
    return sharedActivityParticipants(buildActionContext(g)).length === 0;
  })()
`), 'a booked visit is not an evening together, and letting it count is an affection tap');
check('presentResidentAffection reads the SAME list', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    g.npcs[id].relPlayer.affection = 0.8;
    __stage(g, [id]);
    const awake = presentResidentAffection(buildActionContext(g));
    __stage(g, [id], 'sleeping');
    const asleep = presentResidentAffection(buildActionContext(g));
    return Math.abs(awake - 0.8) < 1e-9 && asleep === 0;
  })()
`), 'the mood impulse and D16 must not hold two ideas of "together"');
check('sharedActivityParticipants has exactly one definition', (() => {
  let n = 0;
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    n += (codeOf(f).match(/function\s+sharedActivityParticipants\s*\(/g) || []).length;
  }
  return n === 1;
})(), 'the npcCuriosity pattern: one definition, several callers');

// ---------------------------------------------------------------------------
console.log('\nD16 — a witnessed fact AND a relationship delta, and neither alone');

check('a shared activity writes a fact with provenance witnessed', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.watch_tv', [id]);
    const f = (g.npcs[id].memory.facts || []).find(x => x.text === __factText(g, id, 'self.watch_tv'));
    return !!f && f.provenance === 'witnessed' && f.pinned !== true
        && f.confidence === SHARED_ACTIVITY.factConfidence
        && f.importance === MEMORY_IMPORTANCE[SHARED_ACTIVITY.factImportance];
  })()
`));
check('and moves the relationship', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.watch_tv', [id]);
    const r = g.npcs[id].relPlayer;
    return r.affection > 0 && r.comfort > 0;
  })()
`));
check('the SAME activity alone writes neither', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const r = __do(g, 'self.watch_tv', []);
    const n = g.npcs[id];
    return r.withIds.length === 0 && r.facts.length === 0
        && (n.memory.facts || []).length === 0
        && n.relPlayer.affection === 0 && n.relPlayer.comfort === 0;
  })()
`), "the plan's own test for whether `shared` means anything");
check('an activity with no `shared` field writes neither even with company', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.dishes', [id], 30);
    return (g.npcs[id].memory.facts || []).length === 0 && g.npcs[id].relPlayer.affection === 0;
  })()
`));
check('everyone in the room gets their own fact and their own delta', api(`
  (() => {
    const g = __mk(); const ids = __ids(g).slice(0, 2);
    const r = __do(g, 'self.take_walk', ids);
    return r.withIds.length === 2 && r.facts.length === 2
        && ids.every(id => g.npcs[id].relPlayer.affection > 0);
  })()
`));
check('only `confiding` activities move trust', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.workout', [id]);            // parallel
    const parallelTrust = g.npcs[id].relPlayer.trust;
    const h = __mk(); const hid = __ids(h)[0];
    __do(h, 'self.take_walk', [hid]);         // confiding
    return parallelTrust === 0 && h.npcs[hid].relPlayer.trust > 0;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nThe fact tier is bounded by construction, not throttled');

check('doing it twice leaves ONE fact and moves the relationship TWICE', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.watch_tv', [id]);
    const after1 = g.npcs[id].relPlayer.affection;
    const r2 = __do(g, 'self.watch_tv', [id]);
    const facts = g.npcs[id].memory.facts || [];
    return facts.length === 1 && r2.facts.length === 0 && g.npcs[id].relPlayer.affection > after1;
  })()
`), 'the first evening is what gets remembered; the thirtieth is what the delta is for');
check('every shareable activity, ten times each, leaves at most one fact per activity', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const shareable = __shared();
    for (let round = 0; round < 10; round++) for (const a of shareable) __do(g, a, [id]);
    const facts = g.npcs[id].memory.facts || [];
    console.log('        ' + facts.length + ' facts from ' + shareable.length + ' activities x 10 rounds, cap ' + BELIEF.maxFacts);
    return facts.length === shareable.length && facts.length < BELIEF.maxFacts;
  })()
`));
check('the fact is retrievable', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.take_walk', [id]);
    const got = retrieveRelevantMemories(g.npcs[id], 'walk together', 5, g.meta.clock.day);
    return got.facts.some(t => t.includes('went for a walk'));
  })()
`));
check('and survives eviction pressure from ambient beliefs', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.take_walk', [id]);
    const text = __factText(g, id, 'self.take_walk');
    let npc = g.npcs[id];
    for (let i = 0; i < BELIEF.maxFacts * 2; i++) {
      npc = addMemoryFact(npc, { text: 'ambient noise ' + i, day: 1,
        importance: MEMORY_IMPORTANCE.ambient, provenance: 'overheard', confidence: 0.5 });
    }
    return (npc.memory.facts || []).length === BELIEF.maxFacts
        && (npc.memory.facts || []).some(f => f.text === text);
  })()
`), 'importance x confidence puts it above ambient and below anything pinned');

// ---------------------------------------------------------------------------
console.log('\nD16 — shared time does not dominate the relationship model');

const capHours = J(`SHARED_ACTIVITY.dailyCreditMinutes`) / 60;
const bestRate = J(`Math.max(...Object.values(SHARED_ACTIVITY.rates).map(r => r.affection))`);
const dayCeiling = capHours * bestRate;
const windowCeiling = J(`X5.deltaClamp`) / J(`X5.deltaDivisor`);
console.log(`        a full day at the cap: ${capHours}h x ${bestRate}/h = ${dayCeiling.toFixed(4)} affection`);
console.log(`        one judged conversation window at its ceiling: ${windowCeiling.toFixed(4)}`);

check('a WHOLE DAY at the cap moves an axis less than ONE judged conversation window',
      dayCeiling < windowCeiling,
      `${dayCeiling.toFixed(4)} vs ${windowCeiling.toFixed(4)} — derived from SHARED_ACTIVITY and X5, not restated`);
check('a week of it stays a minority of a week of conversation',
      dayCeiling * 7 < windowCeiling * 7 * 0.5,
      `${(dayCeiling * 7).toFixed(3)} vs ${(windowCeiling * 7).toFixed(3)}`);
check('the cap really binds: 10 hours in one day pays exactly the cap', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    for (let i = 0; i < 20; i++) __do(g, 'self.watch_tv', [id], 30);
    const got = g.npcs[id].relPlayer.affection;
    const want = SHARED_ACTIVITY.rates[ACTION_DEFS['self.watch_tv'].shared.rate].affection
               * SHARED_ACTIVITY.dailyCreditMinutes / 60;
    console.log('        20 x 30min -> ' + got.toFixed(4) + ', cap ' + want.toFixed(4));
    return Math.abs(got - want) < 1e-9;
  })()
`));
check('past the cap the time is still SHARED — the fact still lands, it just stops paying', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    for (let i = 0; i < 20; i++) __do(g, 'self.watch_tv', [id], 30);   // burn the whole cap
    const before = g.npcs[id].relPlayer.affection;
    const r = __do(g, 'self.take_walk', [id], 30);                     // a different activity
    return r.withIds.length === 1 && r.facts.length === 1
        && r.credited[id] === 0 && g.npcs[id].relPlayer.affection === before;
  })()
`), 'the cap rations the LEVER, it does not decide what happened');
check('and the cap resets the next day', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    for (let i = 0; i < 20; i++) __do(g, 'self.watch_tv', [id], 30);
    const after = g.npcs[id].relPlayer.affection;
    g.meta.clock.day += 1;
    __do(g, 'self.take_walk', [id], 30);
    return g.npcs[id].relPlayer.affection > after;
  })()
`));
check('the cap is per NPC, not per household', api(`
  (() => {
    const g = __mk(); const ids = __ids(g).slice(0, 2);
    for (let i = 0; i < 20; i++) __do(g, 'self.watch_tv', ids, 30);
    const a = g.npcs[ids[0]].relPlayer.affection, b = g.npcs[ids[1]].relPlayer.affection;
    return a > 0 && Math.abs(a - b) < 1e-9;
  })()
`), 'spending an evening with two roommates is an evening with each of them');
check('the credit ledger is stamped with the day it belongs to', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.watch_tv', [id], 30);
    const rec = g.npcs[id].flags._sharedActivity;
    return rec && rec.day === g.meta.clock.day && rec.minutes === 30;
  })()
`), 'D26 the other way up: a per-DAY budget keys on a day, which does not wrap');

// ---------------------------------------------------------------------------
console.log('\nThe narration is the two-person version (D17)');

check('company gets the shared line, not the solo one', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const def = ACTION_DEFS['self.watch_tv'];
    const c = __stage(g, [id]);
    const shared = resolveSharedActivity(g, def, c, 30);
    const line = narrateAction(def, c, prepareSocialAction(c), shared);
    const want = def.shared.templates.map(t => t.replace('{name}', g.npcs[id].bible.name));
    return want.includes(line);
  })()
`));
check('alone gets the solo line', api(`
  (() => {
    const g = __mk();
    const def = ACTION_DEFS['self.watch_tv'];
    const c = __stage(g, []);
    const line = narrateAction(def, c, prepareSocialAction(c), resolveSharedActivity(g, def, c, 30));
    return def.narration.templates.includes(line);
  })()
`));
check('two roommates are ONE line naming both', api(`
  (() => {
    const g = __mk(); const ids = __ids(g).slice(0, 2);
    const def = ACTION_DEFS['self.balcony_sit'];
    const c = __stage(g, ids);
    const line = narrateAction(def, c, null, resolveSharedActivity(g, def, c, 15));
    const names = ids.map(i => g.npcs[i].bible.name);
    return names.length === 2 && new Set(names).size === 2
        && names.every(n => n && line.includes(n)) && line.includes(' and ');
  })()
`));
check('no shared line ever ships a literal {name}', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const bad = [];
    for (const a of __shared()) {
      const def = ACTION_DEFS[a];
      const c = __stage(g, [id]);
      for (let i = 0; i < 12; i++) {
        const line = narrateAction(def, c, null, { withIds: [id] });
        if (line.includes('{name}') || !line.includes(g.npcs[id].bible.name)) bad.push(a);
      }
    }
    if (bad.length) console.log('        ' + [...new Set(bad)].join(', '));
    return bad.length === 0;
  })()
`));
check('the shared line wins over a DYNAMIC builder too', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const def = ACTION_DEFS['self.cook'];
    const c = __stage(g, [id]);
    const line = narrateAction(def, c, { recipe: null }, { withIds: [id] });
    // With a null recipe the dynamic builder says "come up empty-handed"; the
    // shared template is what should surface instead.
    return def.shared.templates.some(t => t.replace('{name}', g.npcs[id].bible.name) === line);
  })()
`), 'otherwise the ten entries would each need their own copy of the question');
check('executeAction hands the resolution to narrateAction', (() => {
  const src = codeOf('actions.js');
  return /narrateAction\(def,\s*ctx,\s*prepared,\s*shared\)/.test(src)
      && /resolveSharedActivity\(gameState,\s*def,\s*ctx,\s*minutes\)/.test(src);
})());
check('and resolves it BEFORE the clock advances', (() => {
  const src = codeOf('actions.js');
  return src.indexOf('resolveSharedActivity(gameState') < src.indexOf('advanceAndResolveMinutes(minutes)');
})(), 'the participants are who was here when it started, not who wandered in');
check('watchTvNarration is gone, and nothing still calls it', (() => {
  let n = 0;
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    n += (codeOf(f).match(/watchTvNarration/g) || []).length;
  }
  return n === 0;
})(), 'R8 the other way: its one branch fired on affection, never on presence');

// ---------------------------------------------------------------------------
console.log('\nThe write survives the tick');
// resolveBatch rebuilds every NPC through `{ ...state.npcs[id], ...update }`.
// This suite has two plans' worth of scars from writes that did not come back
// out of it (Plan 3's pursuit carry, Phase 3's overture carry), and this write
// lands on memory, relPlayer AND flags — all three of the keys that block
// touches.
check('the fact, the axes and the credit ledger all survive resolveBatch', api(`
  (() => {
    let g = __mk(); const id = __ids(g)[0];
    __do(g, 'self.take_walk', [id], 30);
    const text = __factText(g, id, 'self.take_walk');
    const affBefore = g.npcs[id].relPlayer.affection;
    g = resolveBatch(g, 4).state;
    const n = g.npcs[id];
    const missing = [];
    if (!(n.memory.facts || []).some(f => f.text === text)) missing.push('fact');
    if (!(n.relPlayer.affection >= affBefore)) missing.push('affection');
    if (!n.flags || !n.flags._sharedActivity) missing.push('_sharedActivity');
    if (missing.length) console.log('        lost: ' + missing.join(', '));
    return missing.length === 0;
  })()
`));
check('and the ledger still caps correctly on the other side of it', api(`
  (() => {
    let g = __mk(); const id = __ids(g)[0];
    const day = g.meta.clock.day;
    for (let i = 0; i < 4; i++) { __do(g, 'self.watch_tv', [id], 30); g = resolveBatch(g, 1, { advanceClock: false }).state; }
    const rec = g.npcs[id].flags._sharedActivity;
    return rec.day === day && rec.minutes === 120;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nOne writer, and the tick never became a caller');

check('_sharedActivity is written in exactly one file', (() => {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'))
    .filter(f => /_sharedActivity\s*:/.test(codeOf(f)));
  return files.length === 1 && files[0] === 'actions.js';
})(), `writers: ${fs.readdirSync(SRC).filter(f => f.endsWith('.js')).filter(f => /_sharedActivity\s*:/.test(codeOf(f))).join(', ')}`);
check('resolveSharedActivity has exactly one definition and one caller', (() => {
  let defs = 0, calls = 0;
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    const src = codeOf(f);
    defs += (src.match(/function\s+resolveSharedActivity\s*\(/g) || []).length;
    calls += (src.match(/[^\w]resolveSharedActivity\(/g) || []).length - (src.match(/function\s+resolveSharedActivity\s*\(/g) || []).length;
  }
  return defs === 1 && calls === 1;
})(), "D19's shape: one named writer, one place it is reached from");
check('nothing in the tick calls it — a shared activity is a PLAYER verb', (() => {
  for (const f of ['sim.js', 'drives.js', 'cognition.js', 'overture.js', 'rumination.js']) {
    if (/resolveSharedActivity|sharedActivityDelta|sharedActivityCredit/.test(codeOf(f))) return false;
  }
  return true;
})());
check('resolveSharedActivity is synchronous and model-free', api(`
  (() => {
    const g = __mk(); const id = __ids(g)[0];
    const c = __stage(g, [id]);
    const r = resolveSharedActivity(g, ACTION_DEFS['self.relax'], c, 15);
    return !(r instanceof Promise) && Array.isArray(r.withIds);
  })()
`) && !/generateText/.test(codeOf('actions.js')));

// ---------------------------------------------------------------------------
console.log('\nReachability — is there ever anybody to share with? (12 households x 7 days)');
// Design invariant 5: a source that reads zero is dead content, and four of
// this plan's five motivation sources did. Measure BEFORE concluding the
// mechanism works. This asks the only question the headless harness can ask
// about a player verb — how often an eligible partner is standing in the room
// the action is available from.

const reach = J(`
  (() => {
    const shareable = __shared();
    const tally = {}; for (const a of shareable) tally[a] = { ticks: 0, withSomeone: 0 };
    let sampled = 0;
    for (let h = 0; h < ${HOUSES}; h++) {
      let g = __mk(20260811 + h * 7919);
      for (let t = 0; t < ${DAY * DAYS}; t++) {
        g = resolveBatch(g, 1).state;
        if (t % 4 !== 0) continue;              // sample every 2 in-game hours
        sampled++;
        for (const a of shareable) {
          const def = ACTION_DEFS[a];
          const rooms = __roomsFor(g, def);
          let any = false;
          for (const room of rooms) {
            g.player.location = room;
            if (sharedActivityParticipants(buildActionContext(g)).length > 0) { any = true; break; }
          }
          tally[a].ticks++;
          if (any) tally[a].withSomeone++;
        }
      }
    }
    return { tally, sampled };
  })()
`);
for (const [a, t] of Object.entries(reach.tally)) {
  const pct = t.ticks ? (100 * t.withSomeone / t.ticks) : 0;
  console.log(`        ${a.padEnd(20)} ${pct.toFixed(1)}% of sampled moments have an eligible partner`);
}
const anyReachable = Object.values(reach.tally).filter(t => t.withSomeone > 0).length;
const bestPct = Math.max(...Object.values(reach.tally).map(t => 100 * t.withSomeone / t.ticks));
check('every shareable activity is reachable at least sometimes',
      anyReachable === Object.keys(reach.tally).length,
      `${anyReachable}/${Object.keys(reach.tally).length} ever had a partner available`);
check('and the best of them is genuinely common rather than a curiosity',
      bestPct > 20, `best = ${bestPct.toFixed(1)}%`);
check('but nobody is available everywhere all the time', bestPct < 100,
      'a 100% figure means the participant filter is not filtering');

// ---------------------------------------------------------------------------
console.log('\nHousekeeping');

const mainHtml = fs.readFileSync(path.join(SRC, '..', '..', 'index.html'), 'utf8');
const ver = (f) => { const m = mainHtml.match(new RegExp(`srcfiles/${f.replace('.', '\\.')}\\?v=(\\d+)`)); return m ? Number(m[1]) : -1; };
check('config.js version is at least 84', ver('config.js') >= 84, `v=${ver('config.js')}`);
check('defs.actions.js version is at least 17', ver('defs.actions.js') >= 17, `v=${ver('defs.actions.js')}`);
check('actions.js version is at least 13', ver('actions.js') >= 13, `v=${ver('actions.js')}`);
// README rule 6, in the scoped form verify-i2 established. The general form
// ("every file index.html loads is in ORDER") cannot be asserted without
// restating the render/ui boundary the loader deliberately stops at, and a
// hand-kept exclusion list is the same defect the rule exists to prevent.
// Phase 5 added no new engine file — all three files it touched were already
// in ORDER, which is why this phase's harness could exercise resolution at all.
const ORDER_SRC = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check('every file this phase touched is loadable by the harness',
      ['config.js', 'defs.actions.js', 'actions.js'].every(f => ORDER_SRC.includes(`'${f}'`)));
check('every file named in loadgame.js ORDER exists on disk',
      [...ORDER_SRC.matchAll(/'([\w.]+\.js)'/g)].map(m => m[1])
        .every(f => fs.existsSync(path.join(SRC, f))),
      'rumination.js cost 175 silent assertions by being in index.html and not here');

// The two leading spaces are load-bearing: run-all.js matches
// /^ {2}(\d+) passed, (\d+) failed$/m, and a footer it cannot parse is reported
// as DID NOT REPORT — which README rule 6 says never to read past.
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
