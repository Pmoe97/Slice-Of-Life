// NPC initiative plan, Phase 2 — making the dead sources live.
//
//   node dev/verify/verify-i2.js
//
// This is the phase the plan's Evidence section exists for. Four of the five
// motivation sources an overture is supposed to spend measured EXACTLY ZERO on
// a generated cast after seven days, and the cause was not a threshold: the
// ambient episode writer supplied neither `participants` nor `emotionalTag`,
// which are the two fields rumination's D7 inference rules key on. Thirty
// background episodes a week per resident, a SATURATED episode tier, and zero
// beliefs came out of it. Building an overture scorer on top of that would
// have produced a system that passes a harness and does nothing in play.
//
// So the central assertion here is not a shape check. It is occupancy, run
// against a counterfactual written the old way, on the population the plan
// measures everything else on — 12 households x 3 residents x 7 in-game days.
// It is asserted as a BAND, never a constant: Phase 6 exists to move rates,
// and a pinned figure would report that retune as a regression (README rule 5).
//
// The other half is D12/D13/D20. `mayInitiate` is a flag named for exactly
// what this plan does, with four authored thresholds behind it, that has never
// once caused anything to happen — and it is a conjunction across three axes
// that all generate at 0, so "wanting someone you are not fond of" is
// structurally unrepresentable. The gate becomes personality-scaled here, and
// the assertions that matter are its ENDPOINTS: a wholly inhibited NPC still
// needs the full authored conjunction, and desire is never scaled by anything.
const path = require('path');
const fs = require('fs');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'sim.js', 'npc.js', 'rumination.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

const HOUSES = 12, DAY = 48, DAYS = 7;

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __res = (loc) => ({ block: 'leisure', location: loc, activity: '', transit: null });

  // THE MEASUREMENT TRAP, reproduced deliberately (the plan's Evidence, and
  // README rule 5's cousin). resolveBatch does NOT write episodes — UI's
  // advanceAndResolve does, outside the tick. Measure memory occupancy
  // headlessly without this loop and every resident reads 0 episodes, 0 facts
  // and 0 open questions, which looks exactly like a dead knowledge layer and
  // is in fact a missing writer. The first pass of the plan's Evidence made
  // that mistake; this function is here so nobody makes it a third time.
  //
  // Importance is DERIVED from the tables ui.js's eventImportance reads rather
  // than restated (README rule 5) — a retune of MEMORY_IMPORTANCE must not
  // surface here as a Phase 2 regression.
  __eventImportance = (evt) => (typeof evt.importance === 'number') ? evt.importance
    : (MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] !== undefined
        ? MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] : MEMORY_IMPORTANCE.ambient);

  // opts.stripFields reproduces the PRE-PHASE-2 writer exactly: the same
  // events, the same episodes, the same importance — and neither of D15's two
  // fields. It is the counterfactual every occupancy figure below is measured
  // against, so none of them depends on a magic number.
  __simulateLoop = (seed, ticks, opts) => {
    opts = opts || {};
    let g = __mk(seed);
    let events = 0;
    for (let t = 0; t < ticks; t++) {
      const r = resolveBatch(g, 1);
      g = r.state;
      for (const evt of r.events) {
        const npc = g.npcs[evt.npcId];
        if (!npc) continue;
        events++;
        g.npcs[evt.npcId] = addMemoryEpisode(
          npc, evt.day, formatEventText(evt, g.npcs), __eventImportance(evt),
          opts.stripFields ? '' : eventEmotionalTag(evt),
          opts.stripFields ? [] : (evt.participants || []));
      }
    }
    const out = { events, residents: [] };
    for (const id of __ids(g)) {
      const m = g.npcs[id].memory || {};
      const facts = m.facts || [];
      out.residents.push({
        episodes: (m.episodes || []).length,
        facts: facts.length,
        inferred: facts.filter(f => f.provenance === 'inferred').length,
        repetition: facts.filter(f => f.provenance === 'inferred'
          && typeof f.text === 'string' && f.text.indexOf(REPETITION_FACT_PREFIX) === 0).length,
        openQuestions: (m.openQuestions || []).length,
      });
    }
    return out;
  };

  // A bare NPC with only what the gate reads, so a generated cast's
  // temperament cannot make an endpoint assertion accidentally true.
  __probe = (deviantLevel, rel) => ({ bible: { deviantLevel }, relPlayer: rel });
`);

// ---------------------------------------------------------------------------
console.log('\n(D15) the ambient episode writer supplies both fields, and the tables behind them are well formed');

const EMOTION = J('EVENT_EMOTION');
const TAGS = J('Object.keys(EMOTIONAL_WEIGHTS)');
const EMOTION_KEYS = Object.keys(EMOTION);

check(`EVENT_EMOTION classifies at least one event type (${EMOTION_KEYS.length} entries)`,
      EMOTION_KEYS.length >= 1, 'no table is the phase not landing');
// Rumination groups episodes BY the tag string and derives the minted fact's
// `category` from it, so an invented word files real episodes under a theme
// nothing downstream can weigh. This is the same discipline x5.js enforces on
// the Chronicler's replies, applied to the authored table.
check('every EVENT_EMOTION value is an EMOTIONAL_WEIGHTS key',
      Object.values(EMOTION).every(t => TAGS.includes(t) && t !== 'default'),
      Object.entries(EMOTION).filter(([, t]) => !TAGS.includes(t)).map(([k, t]) => `${k}=${t}`).join(', '));
// A typo'd key is a dead entry — it never matches an event and never errors.
// Derived from every real source of event types, so a new drive or a new
// offscreen event does not need this test edited. The `type: '...'` scan is
// what makes it complete: an event's type is NOT always its drive's id — the
// gift drive is `isGiftDrive` and emits `type: 'gift'` — so the two authored
// tables alone miss the literals, which is exactly how this assertion failed
// on its first run.
const EMITTED_LITERALS = fs.readdirSync(SRC).filter(f => f.endsWith('.js'))
  .flatMap(f => [...codeOf(f).matchAll(/\btype:\s*'([\w.]+)'/g)].map(m => m[1]));
const EVENT_TYPES = [...new Set([
  ...J('OFFSCREEN_EVENTS.map(e => e.type)'),
  ...J('Object.keys(DRIVE_DEFS)'),
  ...EMITTED_LITERALS,
])];
check('every EVENT_EMOTION key is an event type something can actually emit',
      EMOTION_KEYS.every(k => EVENT_TYPES.includes(k)),
      EMOTION_KEYS.filter(k => !EVENT_TYPES.includes(k)).join(', '));
check('eventEmotionalTag reads the table, and an unlisted type gets NO tag',
      api(`Object.entries(EVENT_EMOTION).every(([k, v]) => eventEmotionalTag({ type: k }) === v)`)
      && api(`eventEmotionalTag({ type: 'nap' }) === '' && eventEmotionalTag({}) === '' && eventEmotionalTag(null) === ''`),
      'failing closed is the safe direction — an untagged episode still feeds co-occurrence');

// ---------------------------------------------------------------------------
console.log('\n(D15) `participants` is stamped IN the tick, because co-presence is tick-local');

check('eventParticipants always includes the actor, exactly once',
      api(`(() => {
        const p = eventParticipants({ npcId: 'a', roomId: 'kitchen', data: { other: 'a' } },
                                    { a: { location: 'kitchen' } }, null);
        return p.length === 1 && p[0] === 'a';
      })()`));
check('...and the explicit second party (argument\'s {other}, npc_chat\'s data.other)',
      api(`(() => {
        const p = eventParticipants({ npcId: 'a', roomId: null, data: { other: 'b' } }, {}, null);
        return p.length === 2 && p.includes('a') && p.includes('b');
      })()`),
      'the second party is a participant even once they have moved on');
check('...and everyone else in the room it happened in',
      api(`(() => {
        const p = eventParticipants({ npcId: 'a', roomId: 'kitchen', data: {} },
          { a: { location: 'kitchen' }, b: { location: 'kitchen' }, c: { location: 'hallway_a' } }, null);
        return p.length === 2 && p.includes('a') && p.includes('b') && !p.includes('c');
      })()`));
check('...and the player, under the same token rumination renders as "the player"',
      api(`(() => {
        const p = eventParticipants({ npcId: 'a', roomId: 'kitchen', data: {} },
          { a: { location: 'kitchen' } }, 'kitchen');
        const q = eventParticipants({ npcId: 'a', roomId: 'kitchen', data: {} },
          { a: { location: 'kitchen' } }, 'living_room');
        return p.includes('player') && !q.includes('player') && resolveNpcName('player', {}) === 'the player';
      })()`));
// An off-screen event (work, commute) has roomId null. Nobody was present for
// it, and inventing co-presence there would mint "X and Y spend time together"
// for two people who were in different buildings.
check('an off-screen event (roomId null) is solo',
      api(`(() => {
        const p = eventParticipants({ npcId: 'a', roomId: null, data: {} },
          { a: { location: 'kitchen' }, b: { location: 'kitchen' } }, 'kitchen');
        return p.length === 1 && p[0] === 'a';
      })()`));
check('eventParticipants is pure — it mutates neither the event nor the location map',
      api(`(() => {
        const evt = { npcId: 'a', roomId: 'kitchen', data: { other: 'b' } };
        const locs = { a: { location: 'kitchen' }, b: { location: 'kitchen' } };
        const before = JSON.stringify([evt, locs]);
        eventParticipants(evt, locs, 'kitchen');
        return JSON.stringify([evt, locs]) === before;
      })()`));
// This is the reason the stamp is inside resolveTick rather than at the write
// site. UI's advanceAndResolve runs AFTER the whole batch, so an 8-hour sleep
// resolved in one call would compute "who was present" for a 3am event from
// everyone's 11am positions. If the events come back already stamped, the
// write site cannot get it wrong.
check('resolveTick returns events already carrying `participants`', api(`(() => {
  const g = __mk();
  for (let i = 0; i < 200; i++) {
    const r = resolveTick(g);
    if (r.newEvents.length > 0) return r.newEvents.every(e => Array.isArray(e.participants));
    g.meta.clock = advanceClock(g.meta.clock, 1);
  }
  return false;
})()`), 'if this is false the tick produced no events at all, which is its own bug');
check('...and every stamped participant is the actor, the named other, or someone in that room',
      api(`(() => {
        const g = __mk();
        for (let t = 0; t < 300; t++) {
          const r = resolveTick(g);
          for (const e of r.newEvents) {
            if (!e.participants.includes(e.npcId)) return false;
            if (new Set(e.participants).size !== e.participants.length) return false;
            if (!e.roomId && e.participants.some(p => p !== e.npcId && p !== (e.data && e.data.other))) return false;
          }
          const upd = r.npcUpdates;
          const npcs = { ...g.npcs };
          for (const [id, u] of Object.entries(upd)) npcs[id] = { ...npcs[id], ...u };
          g.npcs = npcs;
          g.meta.clock = advanceClock(g.meta.clock, 1);
        }
        return true;
      })()`));
// One writer, run over the collected events at the end of the tick rather than
// at each of the three places events are pushed — a footprint added at each
// emit site is a footprint the fourth emitter forgets (Plan 3's deleted
// sleep_recover bed trace is the same defect class).
check('stampEventParticipants is the only writer of evt.participants in the engine',
      (() => {
        const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
        const writers = files.filter(f => /\.participants\s*=/.test(codeOf(f)));
        return writers.length === 1 && writers[0] === 'sim.js'
          && (codeOf('sim.js').match(/\bevt\.participants\s*=/g) || []).length === 1;
      })(),
      'a second writer is how npc.pursuit would have been clobbered — D19 restated');
check('...and it never overwrites participants an emitter already supplied',
      api(`(() => {
        const evts = [{ npcId: 'a', roomId: 'kitchen', data: {}, participants: ['a', 'z'] }];
        stampEventParticipants(evts, { a: { location: 'kitchen' }, b: { location: 'kitchen' } }, 'kitchen');
        return evts[0].participants.length === 2 && evts[0].participants.includes('z');
      })()`));
// The write site itself: it must FORWARD what the tick stamped, not recompute.
check('UI\'s advanceAndResolve passes both fields into addMemoryEpisode',
      /addMemoryEpisode\(\s*npc,\s*evt\.day,\s*text,\s*eventImportance\(evt\),\s*eventEmotionalTag\(evt\),\s*evt\.participants/.test(
        codeOf('ui.js').replace(/\s+/g, ' ')),
      'the writer the plan\'s Evidence names — addMemoryEpisode(npc, evt.day, text, eventImportance(evt)) with neither field');

// ---------------------------------------------------------------------------
console.log('\n(D24/D25) the two D7 inference rules, once the fields arrive');

// The `!== 2` shortcut was correct while the Chronicler was the only writer of
// participants (it always wrote [npc, 'player']) and became a silent skip the
// moment ambient episodes started carrying who was in the room. Three
// residents in the living room is the modal case in this flat.
check('co-occurrence counts EVERY pair, not only two-participant episodes', api(`(() => {
  const eps = [
    { day: 1, text: 'x', decay: 1, importance: 0.3, emotionalTag: '', participants: ['a', 'b', 'c'] },
    { day: 2, text: 'y', decay: 1, importance: 0.3, emotionalTag: '', participants: ['a', 'b', 'c'] },
  ];
  const npc = { bible: { name: 'A', temperament: { openness: 0.5 }, interests: [] },
                memory: { episodes: eps, facts: [], openQuestions: [], nextFactId: 1 } };
  const out = applyCooccurrenceRule(npc, { npcs: {} }, 2);
  return out.memory.facts.filter(f => / and .* spend time together$/.test(f.text)).length === 3;
})()`), 'three participants is three pairs — under the old test it was zero facts');
check('...and a single participant is still not a pair', api(`(() => {
  const eps = [1, 2].map(d => ({ day: d, text: 'x', decay: 1, importance: 0.3, emotionalTag: '', participants: ['a'] }));
  const npc = { bible: { name: 'A', temperament: {}, interests: [] },
                memory: { episodes: eps, facts: [], openQuestions: [], nextFactId: 1 } };
  return applyCooccurrenceRule(npc, { npcs: {} }, 2).memory.facts.length === 0;
})()`));
check('...and one episode is not a pattern (the rule still needs two)', api(`(() => {
  const eps = [{ day: 1, text: 'x', decay: 1, importance: 0.3, emotionalTag: '', participants: ['a', 'b'] }];
  const npc = { bible: { name: 'A', temperament: {}, interests: [] },
                memory: { episodes: eps, facts: [], openQuestions: [], nextFactId: 1 } };
  return applyCooccurrenceRule(npc, { npcs: {} }, 1).memory.facts.length === 0;
})()`));
// D25. Exact-text dedupe was right while tagged episodes were rare; once
// ambient episodes carry tags, `latestByTag` moves to the newest exemplar each
// day and the SAME theme mints a fresh permanent belief every time. One theme
// is one belief.
check('the repetition rule keeps ONE fact per theme, whatever the exemplar', api(`(() => {
  const mk = (day, text) => ({ day, text, decay: 1, importance: 0.3, emotionalTag: 'domestic', participants: [] });
  let npc = { bible: { name: 'A', temperament: {}, interests: [] },
              memory: { episodes: [mk(1, 'Hana cooked pasta'), mk(1, 'Hana cooked soup')], facts: [], openQuestions: [], nextFactId: 1 } };
  npc = applyRepetitionRule(npc, 1);
  const after1 = npc.memory.facts.length;
  npc = { ...npc, memory: { ...npc.memory, episodes: [...npc.memory.episodes,
    mk(2, 'Hana broke a mug'), mk(3, 'Hana cleaned the kitchen')] } };
  npc = applyRepetitionRule(npc, 3);
  return after1 === 1 && npc.memory.facts.length === 1;
})()`), 'measured over 7 days the old test produced three separate beliefs about three broken objects, all tagged embarrassment');
check('...and two different themes are still two beliefs', api(`(() => {
  const mk = (day, tag, text) => ({ day, text, decay: 1, importance: 0.3, emotionalTag: tag, participants: [] });
  const npc = { bible: { name: 'A', temperament: {}, interests: [] },
                memory: { episodes: [mk(1,'domestic','cooked'), mk(1,'domestic','cleaned'),
                                     mk(1,'argument','argued'), mk(1,'argument','argued again')],
                          facts: [], openQuestions: [], nextFactId: 1 } };
  const out = applyRepetitionRule(npc, 1);
  return out.memory.facts.length === 2 && new Set(out.memory.facts.map(f => f.emotionalTag)).size === 2;
})()`));
check('the mint and the dedupe share one prefix constant, so they cannot drift',
      typeof J('REPETITION_FACT_PREFIX') === 'string' && J('REPETITION_FACT_PREFIX').length > 0
      && (codeOf('rumination.js').match(/REPETITION_FACT_PREFIX/g) || []).length >= 2
      && !/This keeps happening/.test(codeOf('rumination.js')),
      'the literal must not survive anywhere in the rule');

// ---------------------------------------------------------------------------
console.log(`\n(D15) OCCUPANCY — ${HOUSES} households x 3 residents x ${DAYS} in-game days, against the pre-Phase-2 writer`);

const live = { residents: [], events: 0 };
const dead = { residents: [], events: 0 };
for (let i = 0; i < HOUSES; i++) {
  const seed = 20260811 + i * 7919;
  const a = J(`__simulateLoop(${seed}, ${DAYS * DAY}, {})`);
  const b = J(`__simulateLoop(${seed}, ${DAYS * DAY}, { stripFields: true })`);
  live.events += a.events; live.residents.push(...a.residents);
  dead.events += b.events; dead.residents.push(...b.residents);
}
const sum = (rs, f) => rs.reduce((acc, r) => acc + f(r), 0);
const any = (rs, f) => rs.filter(r => f(r) > 0).length;
const N = live.residents.length;
console.log(`        ${N} residents, ${live.events} events, ${sum(live.residents, r => r.episodes)} episodes`);
console.log(`        facts ${sum(live.residents, r => r.facts)} (${any(live.residents, r => r.facts)}/${N} residents) vs ${sum(dead.residents, r => r.facts)} stripped`);
console.log(`        open questions ${sum(live.residents, r => r.openQuestions)} (${any(live.residents, r => r.openQuestions)}/${N}) vs ${sum(dead.residents, r => r.openQuestions)} stripped`);

// This asked for EXACT equality and got it until the initiative plan's Phase 4,
// and the reason it no longer can is the thing that plan exists to build: the
// knowledge layer now feeds back into behaviour. The stripped arm infers
// nothing, so it raises no open questions, so curiosity never rises, so it
// never makes a curiosity-motivated OVERTURE — and an overture that wins a tick
// displaces an ordinary drive that would have produced an event. Phase 3 opened
// that loop for the approach; Phase 4's text channel widened it, because a text
// is a candidate anywhere in the flat rather than only next to the player.
//
// So the claim becomes what it always MEANT: the counterfactual is the same
// simulation with the two fields removed, not a different one. A divergence
// under a tenth of a percent is the feedback the plan asked for. A large one
// would mean the arms are not comparable and the 0-vs-233 result below is an
// artifact of running two different worlds.
const eventDrift = Math.abs(live.events - dead.events) / Math.max(live.events, 1);
check(`the two runs are the same simulation, differing only in the fields (${live.events} vs ${dead.events} events, ${(eventDrift * 100).toFixed(2)}% apart)`,
      eventDrift < 0.001 && sum(live.residents, r => r.episodes) === sum(dead.residents, r => r.episodes),
      `${live.events} vs ${dead.events} events, ${sum(live.residents, r => r.episodes)} vs ${sum(dead.residents, r => r.episodes)} episodes`);
check('the pre-Phase-2 writer yields 0 facts and 0 open questions across the whole population',
      sum(dead.residents, r => r.facts) === 0 && sum(dead.residents, r => r.openQuestions) === 0,
      'this is the plan\'s Evidence, re-derived — if it is non-zero the counterfactual is not the old writer');
check('the episode tier is saturated in both, so the cold start was never a shortage of episodes',
      sum(dead.residents, r => r.episodes) / N >= J('MEMORY_BUDGET.maxEpisodes') * 0.8,
      `${(sum(dead.residents, r => r.episodes) / N).toFixed(1)} episodes/resident against a cap of ${J('MEMORY_BUDGET.maxEpisodes')}`);
// The band, not a constant. Every resident reaching a belief inside a week is
// the claim; the exact figure is Phase 6's to move.
check('WITH the fields, every resident holds inferred beliefs inside the week',
      any(live.residents, r => r.inferred) === N,
      `${any(live.residents, r => r.inferred)}/${N}`);
check('...and open questions reach a real minority of the cast, not nobody and not everybody',
      any(live.residents, r => r.openQuestions) >= N * 0.15 && any(live.residents, r => r.openQuestions) <= N * 0.9,
      `${any(live.residents, r => r.openQuestions)}/${N} residents — the D9 create bar is confidence AND interest, so universal would mean it stopped discriminating`);
// The bound is STRUCTURAL, not a rate: co-occurrence is capped by the flat's
// pair count and repetition by the tag vocabulary. Without D25 this grew every
// day for as long as the game ran.
const MAX_PAIRS = 6;   // three residents + the player
check('inferred beliefs stay far below the fact budget — the rules are bounded, not throttled',
      Math.max(...live.residents.map(r => r.inferred)) < J('BELIEF.maxFacts'),
      `max ${Math.max(...live.residents.map(r => r.inferred))} against BELIEF.maxFacts ${J('BELIEF.maxFacts')}`);
check('...and repetition beliefs never exceed the tag vocabulary (D25\'s bound)',
      Math.max(...live.residents.map(r => r.repetition)) <= TAGS.filter(t => t !== 'default').length,
      `max ${Math.max(...live.residents.map(r => r.repetition))} against ${TAGS.filter(t => t !== 'default').length} themes`);
check('...and co-occurrence beliefs never exceed the flat\'s pair count',
      Math.max(...live.residents.map(r => r.inferred - r.repetition)) <= MAX_PAIRS,
      `max ${Math.max(...live.residents.map(r => r.inferred - r.repetition))} against ${MAX_PAIRS} pairs`);

// ---------------------------------------------------------------------------
console.log('\n(D12) the initiative gate is personality-scaled, and its endpoints are the authored conjunction and desire alone');

const RC = J('REL_CONSEQUENCES');
check('a WHOLLY INHIBITED NPC still requires the full authored conjunction', api(`(() => {
  const at = (rel) => npcInitiativeGate(__probe(0, rel), null).mayInitiate;
  return at({ desire: RC_D, comfort: RC_C, affection: RC_A }) === true
      && at({ desire: RC_D, comfort: RC_C - 0.01, affection: RC_A }) === false
      && at({ desire: RC_D, comfort: RC_C, affection: RC_A - 0.01 }) === false;
})()`.replace(/RC_D/g, RC.desireHighComfortHigh).replace(/RC_C/g, RC.comfortHigh).replace(/RC_A/g, RC.affectionHigh)),
      'this is today\'s behaviour, and it must survive at the inhibited end or D12 is a loosening rather than a split');
check('...and clears it as `warm` — the affectionate path', api(`
  npcInitiativeGate(__probe(0, { desire: ${RC.desireHighComfortHigh}, comfort: ${RC.comfortHigh}, affection: ${RC.affectionHigh} }), null).tone === 'warm'`));
check('a WHOLLY DISINHIBITED NPC reaches it on desire alone, as `charged`', api(`(() => {
  const g = npcInitiativeGate(__probe(1, { desire: ${RC.desireHighComfortHigh}, comfort: 0, affection: 0 }), null);
  return g.mayInitiate === true && g.tone === 'charged';
})()`), 'D12 — wanting someone you are not fond of was structurally unrepresentable before this');
check('DESIRE IS NEVER SCALED — below the bar nothing passes, however disinhibited', api(`
  [0, 0.25, 0.5, 0.75, 1].every(d =>
    npcInitiativeGate(__probe(d, { desire: ${RC.desireHighComfortHigh} - 0.01, comfort: 1, affection: 1 }), null).mayInitiate === false)`),
      'desire is what the gate is ABOUT; a scaled desire term would make the gate mean nothing');
// The plan's verification, in one assertion: two casts differing ONLY in
// disinhibition reach the gate at measurably different relationship states.
check('the relationship state at which the gate opens falls monotonically with disinhibition', api(`(() => {
  const firstPass = (d) => {
    for (let s = 0; s <= 100; s++) {
      const v = s / 100;
      if (npcInitiativeGate(__probe(d, { desire: ${RC.desireHighComfortHigh}, comfort: v, affection: v }), null).mayInitiate) return v;
    }
    return null;
  };
  const pts = [0, 0.25, 0.5, 0.75, 1].map(firstPass);
  if (pts.some(p => p === null)) return false;
  for (let i = 1; i < pts.length; i++) if (pts[i] >= pts[i - 1]) return false;
  return pts[0] > pts[pts.length - 1] + 0.5;
})()`), 'a strictly falling floor with a real spread across it — not two casts landing in the same place');
check('the floors are the authored thresholds scaled by ONE lever, not private literals',
      /REL_CONSEQUENCES\.comfortHigh\s*\*\s*relief/.test(codeOf('sim.js'))
      && /REL_CONSEQUENCES\.affectionHigh\s*\*\s*relief/.test(codeOf('sim.js'))
      && /INITIATIVE_GATE\.disinhibitionRelief/.test(codeOf('sim.js')),
      'Phase 6 must be able to move this in one edit');
check('the gate is pure — it mutates neither the npc nor the flags it is handed', api(`(() => {
  const npc = __probe(0.5, { desire: 1, comfort: 1, affection: 1 });
  const flags = { romance: true, mature: true };
  const before = JSON.stringify([npc, flags]);
  npcInitiativeGate(npc, flags);
  return JSON.stringify([npc, flags]) === before;
})()`));
check('...and survives a missing relPlayer, a missing bible, and undefined',
      api(`[npcInitiativeGate({}, null), npcInitiativeGate({ bible: {} }, null), npcInitiativeGate(undefined, null)]
           .every(g => g.mayInitiate === false && g.tone === null)`));

// ---------------------------------------------------------------------------
console.log('\n(D14) the player\'s content settings sit above the whole system');

check('romance:false closes the affectionate path', api(`
  npcInitiativeGate(__probe(0, { desire: ${RC.desireHighComfortHigh}, comfort: 1, affection: 1 }), { romance: false, mature: true }).mayInitiate === false`));
check('mature:false closes the explicit one', api(`
  npcInitiativeGate(__probe(1, { desire: 1, comfort: 0, affection: 0 }), { romance: true, mature: false }).mayInitiate === false`));
check('...and each closes only its own path', api(`
  npcInitiativeGate(__probe(0, { desire: ${RC.desireHighComfortHigh}, comfort: 1, affection: 1 }), { romance: true, mature: false }).tone === 'warm' &&
  npcInitiativeGate(__probe(1, { desire: 1, comfort: 0, affection: 0 }), { romance: false, mature: true }).tone === 'charged'`));
// A parameter, not a read of gameState.meta: sim.js loads before COMPUTER's
// activeContentFlags, and a cross-file constant read from inside the engine is
// how a load-order slip becomes a silent ReferenceError (rumination.js's own
// comment on the same hazard).
check('flags are a PARAMETER with CONTENT_CONFIG as the fallback, not a gameState read',
      /function npcInitiativeGate\(npc, contentFlags\)/.test(codeOf('sim.js'))
      && /contentFlags \|\| CONTENT_CONFIG\.contentFlags/.test(codeOf('sim.js'))
      && !/npcInitiativeGate[\s\S]{0,1200}?gameState\.meta/.test(codeOf('sim.js')));

// ---------------------------------------------------------------------------
console.log('\n(D13/D20) `highDesire` was computed and read by nothing. It has a reader now.');

const GATE = J('INITIATIVE_GATE');
check('the tension override needs high desire AND disinhibition AND mature content', api(`(() => {
  const hi = ${GATE.tensionOverrideDisinhibition};
  const on  = npcInitiativeGate(__probe(hi, { desire: 1 }), null).tensionOverride;
  const lowDesire = npcInitiativeGate(__probe(hi, { desire: ${RC.desireHigh} - 0.01 }), null).tensionOverride;
  const lowDis    = npcInitiativeGate(__probe(hi - 0.01, { desire: 1 }), null).tensionOverride;
  const noMature  = npcInitiativeGate(__probe(hi, { desire: 1 }), { romance: true, mature: false }).tensionOverride;
  return on === true && lowDesire === false && lowDis === false && noMature === false;
})()`));
check('the threshold sits inside the range npcDisinhibition actually produces', api(`(() => {
  const vals = [];
  for (let i = 0; i < 8; i++) {
    const h = SIM_generateHouse(20260811 + i * 7919, 3);
    for (const n of Object.values(h.npcs)) if (n.residency.status === 'resident') vals.push(npcDisinhibition(n));
  }
  const over = vals.filter(v => v >= ${GATE.tensionOverrideDisinhibition}).length;
  return over > 0 && over < vals.length;
})()`), 'a threshold nothing reaches is a dead branch; one everybody reaches is the tension model ceasing to apply');
// R8/D20: the flag causes something to happen, in this phase, in the file the
// plan named. checkRelConsequences needs a DOM, so this is a source scan.
const UI = codeOf('ui.js').replace(/\s+/g, ' ');
check('checkRelConsequences calls the shared gate rather than restating the conjunction',
      /const gate = npcInitiativeGate\(npc, activeContentFlags\(currentGameState\)\)/.test(UI)
      && !/desire >= REL_CONSEQUENCES\.desireHighComfortHigh && comfort >=/.test(UI),
      'the inline conjunction the plan\'s Evidence quotes must be gone, not shadowed');
check('the tensionHigh refusal is skipped outright when the override is live',
      /if \(!gate\.tensionOverride && orbitalRandom\(\) < REL_CONSEQUENCES\.tensionRefuseTalkChance\)/.test(UI),
      'a refusal that still lands 30% of the time reads as the override being broken');
check('...and it gets its own narration, or the tension model reads as broken (D13)',
      /chargedDespiteTension/.test(UI) && /CHARGED_TENSION_TEMPLATES/.test(UI)
      && J('CHARGED_TENSION_TEMPLATES').length >= 2
      && J('CHARGED_TENSION_TEMPLATES').every(t => t.includes('{name}')),
      'doTalk renders it before the overlay opens');
check('`highDesire` now causes something to happen',
      /gate\.highDesire/.test(UI) && /tensionOverride/.test(codeOf('sim.js'))
      && /highDesire\s*$|highDesire\s*&&/m.test(codeOf('sim.js')),
      'D20 — wire it or delete it, no third option');
// This plan's own failure mode (design invariant 4). `mayInitiate` ships one
// phase ahead of its purpose-reader by declaration; a THIRD flag would not.
check('no third dead flag was added to checkRelConsequences\'s return',
      (() => {
        const body = UI.match(/function gateFlags\(gate, comfort\) \{[\s\S]*?\n?\s*return flags; \}/);
        if (!body) return false;
        const assigned = [...body[0].matchAll(/flags\.(\w+)\s*=/g)].map(m => m[1]);
        return assigned.every(f => ['lowComfort', 'highComfort', 'highDesire', 'mayInitiate'].includes(f));
      })(),
      'tone is deliberately not mirrored here — Phase 3 calls npcInitiativeGate itself');

// ---------------------------------------------------------------------------
console.log('\n(R2/D18) none of this reached a model, and the tick stayed pure');

check('a full tick runs with generateText stubbed to explode', api(`(() => {
  const orig = root.generateText;
  root.generateText = () => { throw new Error('the tick called a model'); };
  try { const g = __mk(); for (let i = 0; i < 48; i++) { const r = resolveBatch(g, 1); Object.assign(g, r.state); } return true; }
  catch (e) { return 'threw: ' + e.message; }
  finally { root.generateText = orig; }
})() === true`));
check('nothing Phase 2 added is async or reaches root.generateText',
      ['sim.js', 'rumination.js'].every(f => {
        const c = codeOf(f);
        const fns = ['eventParticipants', 'eventEmotionalTag', 'stampEventParticipants', 'npcInitiativeGate',
                     'applyCooccurrenceRule', 'applyRepetitionRule'];
        return fns.every(fn => !new RegExp(`async function ${fn}\\b`).test(c))
          && !/generateText/.test(c);
      }));
check('resolveBatch is still deterministic under the same seed', api(`
  JSON.stringify(__simulateLoop(20260811, 96, {})) === JSON.stringify(__simulateLoop(20260811, 96, {}))`));

// ---------------------------------------------------------------------------
console.log('\n(house rules) the files this phase touched are loadable and versioned');

const MAIN = fs.readFileSync(path.join(SRC, '..', '..', 'main.html'), 'utf8');
// Floors, never equalities — verify-r5 pinned ui.js?v=55 exactly and reported
// the next plan's edit as a Plan 2 regression (README rule 4).
for (const [file, floor] of [['config.js', 81], ['sim.js', 42], ['rumination.js', 4], ['ui.js', 60]]) {
  const m = MAIN.match(new RegExp(`${file.replace('.', '\\.')}\\?v=(\\d+)`));
  check(`main.html loads ${file} at v>=${floor}`, !!m && Number(m[1]) >= floor, m ? `found v=${m[1]}` : 'not found');
}
// README rule 6, scoped to what this phase can honestly claim. The general
// form ("every file main.html loads is in ORDER") cannot be asserted without
// restating the render/ui boundary the loader deliberately stops at, and a
// hand-kept exclusion list is the same defect the rule exists to prevent. What
// IS assertable: every file whose functions this harness calls came up, and
// every file named in ORDER is real. Phase 2 added no new engine file; a phase
// that does — Phase 3's overture.js — owns extending this.
const ORDER_SRC = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check('every file this phase touched is loadable by the harness, or deliberately is not',
      ['config.js', 'sim.js', 'rumination.js'].every(f => ORDER_SRC.includes(`'${f}'`))
      && !ORDER_SRC.includes(`'ui.js'`),
      'ui.js needs a DOM — which is why the gate itself lives in sim.js');
check('every file named in loadgame.js ORDER exists on disk',
      [...ORDER_SRC.matchAll(/'([\w.]+\.js)'/g)].map(m => m[1])
        .every(f => fs.existsSync(path.join(SRC, f))),
      'rumination.js cost 175 silent assertions by being in main.html and not here');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
