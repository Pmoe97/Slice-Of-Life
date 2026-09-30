// Plan X-5, Phase 1 — the wire.
//
//   node dev/verify/verify-x1.js
//
// This plan's output is LLM-dependent and the harness cannot test the model.
// Phase 1 exists to make everything AROUND the model as large as possible
// before either pass is wired, and this file is the reason that is worth
// doing: parsing, clamping, windowing and ingestion written inside a call
// site would be untestable, and so would everything downstream of them.
//
// Four things are asserted here, in rough order of how expensive they are to
// discover later:
//
//   1. x5.js is pure — no async, no model, no mutation. That is the phase
//      boundary; if it ever fails, the testable surface has shrunk.
//   2. Every malformed reply shape a judge can produce lands somewhere
//      defined. The important distinction is {} (judged nothing — the modal
//      answer, D8) versus null (a failed pass, D14): both apply nothing, only
//      one is a fault.
//   3. Nothing a model says can mint a permanent belief. D12's importance
//      ceiling, D11's provenance, and the confidence cap are all asserted
//      against what the model CLAIMED, not against a well-behaved fixture.
//   4. The two window ceilings are reachable. verify-c1 learned this the
//      expensive way: a threshold outside the range its input can occupy is
//      a feature that never fires, and printing "unreachable" next to it is
//      not catching it.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'npc.js', 'x5.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
// The purity scan has to read CODE, not prose. x5.js's file comment explains
// at length that it is not async and never calls the model, and a scan of the
// raw text would fail on the sentence describing the invariant it is checking.
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

ctx.__t = {};
ctx.__freshNpc = (id, name) => ({
  bible: { name, speech: {}, temperament: { openness: 0.5 }, interests: [] },
  relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
               conversationPhase: 'early', intimacyLevel: 0, grievances: [],
               firstMetDay: 1, lastInteractionDay: 1 },
  memory: { facts: [], episodes: [], summary: '', recent: [], styleCounters: {},
            openQuestions: [], nextFactId: 1 },
  mood: 0, needs: {}, flags: {}, inventory: [],
});
api(`
  __mkState = (sceneId) => ({
    meta: { clock: { day: 3, minutes: 600 }, scene: { id: sceneId, roomId: 'kitchen', shouted: [] }, sessionLog: [] },
    player: { location: 'kitchen', money: 100, inventory: [], flags: {} },
    npcs: { npc_a: __freshNpc('npc_a', 'Hana'), npc_b: __freshNpc('npc_b', 'Marcus') },
    objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
    seed: 1234,
  });
  __sceneCtx = (ids) => ({
    channel: 'scene',
    activeNpcs: ids.map(id => ({ id, name: id === 'npc_a' ? 'Hana' : 'Marcus' })),
    ambientNpcs: [], player: { money: 100 }, roomObjects: {}, carryItems: [],
  });
  // One conversational turn, written exactly the way applyProposal writes it:
  // the player line first, then the dialogue it provoked (Plan 0's D4 order).
  __turn = (npc, playerLine, npcLine, sceneId, day, tick) => {
    let n = addRecentExchange(npc, 'player', playerLine, 'player_input', day || 3, tick || 600, 'scene', sceneId);
    return addRecentExchange(n, 'Hana', npcLine, 'dialogue', day || 3, tick || 600, 'scene', sceneId);
  };
`);

const X5 = J('X5');
const MEM_IMP = J('MEMORY_IMPORTANCE');
const BUDGET = J('MEMORY_BUDGET');
const RUM = J('RUMINATION');

// ---------------------------------------------------------------------------
console.log('\nx5.js is pure — the phase boundary itself');
// The plan's hard rule: parsing, clamping, windowing and ingestion are
// arithmetic. The moment any of it becomes async it has moved inside a call
// site, and the whole point of doing Phase 1 first is gone.

check('x5.js loaded and every named function is defined', api(`
  ['parseAssessorReply','toProposalDeltas','parseChroniclerReply','toProposalMemory',
   'assessorWindow','chroniclerWindow','markProcessed','markAssessed',
   'formatWindowTranscript','x5CountExchanges'].every(f => typeof eval(f) === 'function')
`));
check('x5.js contains no async, no await, and never names generateText',
      !/\basync\b|\bawait\b|generateText/.test(codeOf('x5.js')),
      'the calls live in llm.js and are fired from ui.js — this file computes');
check('no x5 function returns a promise', api(`
  [parseAssessorReply('{}'), toProposalDeltas({}, []), parseChroniclerReply('{}'),
   toProposalMemory({ facts: [] }, 'npc_a'), assessorWindow(__mkState(1)),
   chroniclerWindow(__freshNpc('npc_a','Hana')), formatWindowTranscript([])]
    .every(v => !v || typeof v.then !== 'function')
`));
check('nothing in x5.js reaches root.generateText', api(`
  (() => {
    let called = 0;
    const orig = root.generateText;
    root.generateText = () => { called++; return Promise.resolve('{}'); };
    try {
      const g = __mkState(2);
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'hey', 'hi', 2);
      parseAssessorReply('{"npc_a":{"trust":2}}');
      toProposalDeltas({ npc_a: { trust: 2 } }, ['npc_a']);
      parseChroniclerReply('{"facts":[{"text":"a"}],"episodes":[{"text":"b"}]}');
      toProposalMemory({ facts: [{ text: 'a' }], episodes: [{ text: 'b' }] }, 'npc_a', { day: 3 });
      assessorWindow(g);
      chroniclerWindow(g.npcs.npc_a);
      markProcessed(g.npcs.npc_a);
      markAssessed(g.npcs.npc_a, 2);
      formatWindowTranscript(g.npcs.npc_a.memory.recent);
    } finally { root.generateText = orig; }
    return called === 0;
  })()
`));
check('markProcessed / markAssessed do not mutate the npc they are handed', api(`
  (() => {
    let npc = __turn(__freshNpc('npc_a','Hana'), 'hey', 'hi', 2);
    const before = JSON.stringify(npc);
    markProcessed(npc); markAssessed(npc, 2);
    return JSON.stringify(npc) === before;
  })()
`));
check('assessorWindow does not mutate gameState', api(`
  (() => {
    const g = __mkState(2);
    g.npcs.npc_a = __turn(g.npcs.npc_a, 'hey', 'hi', 2);
    const before = JSON.stringify(g);
    assessorWindow(g);
    return JSON.stringify(g) === before;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nthe X5 table is internally consistent (derived, never hardcoded)');
// Rule 5 of dev/verify/README.md. Every number below is read from the table
// that owns it, so Phase 4 can retune any of them without this file reporting
// the retune as a regression — only a relationship BREAKING shows up here.

const reachableCeiling = Math.floor(BUDGET.maxRecent / X5.linesPerExchange);
check(`assessorMaxExchanges (${X5.assessorMaxExchanges}) is reachable inside MEMORY_BUDGET.maxRecent (${BUDGET.maxRecent})`,
      X5.assessorMaxExchanges <= reachableCeiling,
      `at ${X5.linesPerExchange} entries per exchange the buffer holds ${reachableCeiling}; a higher threshold never fires`);
check(`chroniclerMaxExchanges (${X5.chroniclerMaxExchanges}) is reachable too`,
      X5.chroniclerMaxExchanges <= reachableCeiling,
      `the plan's first-pass 24 was written before this arithmetic — see the Handoff`);
check('D3 — the Chronicler window is strictly larger than the Assessor window',
      X5.chroniclerMaxExchanges > X5.assessorMaxExchanges);
check('D12 — factImportanceCeiling is strictly below MEMORY_IMPORTANCE.significant',
      X5.factImportanceCeiling < MEM_IMP.significant,
      `significant (${MEM_IMP.significant}) grants pinned, and pinned facts never evict`);
check('invariant 3 — factConfidenceMax is below certainty',
      X5.factConfidenceMax < 1);
check(`the default claim confidence (${X5.factConfidenceDefault}) is open-question eligible (RUMINATION.createThreshold ${RUM.createThreshold})`,
      X5.factConfidenceDefault <= RUM.createThreshold,
      'this is the cold start: an unverified thing the player said must be something the NPC can wonder about');
check('D7 — the largest single-window delta clears validateProposal\'s per-axis range check', api(`
  (() => {
    const g = __mkState(1);
    const deltas = toProposalDeltas({ npc_a: Object.fromEntries(X5_AXES.map(a => [a, X5.deltaClamp])) }, ['npc_a']);
    const r = validateProposal({ relationshipDeltas: deltas }, __sceneCtx(['npc_a']));
    return r.valid;
  })()
`), 'a wire format the existing validator rejects is a pass that silently never applies');

// ---------------------------------------------------------------------------
console.log('\nparseAssessorReply — every reply shape a judge can produce');

const A = (text, opts) => J(`parseAssessorReply(${JSON.stringify(text)}${opts ? ', ' + JSON.stringify(opts) : ''})`);
const WELL = '{"npc_a":{"trust":2,"affection":1,"tension":0,"respect":0,"comfort":1,"desire":0}}';

check('well-formed', JSON.stringify(A(WELL)) === JSON.stringify({ npc_a: { trust: 2, affection: 1, comfort: 1 } }),
      JSON.stringify(A(WELL)));
check('axes in a different order parse the same',
      JSON.stringify(A('{"npc_a":{"desire":0,"comfort":1,"respect":0,"tension":0,"affection":1,"trust":2}}')) === JSON.stringify(A(WELL)));
check('missing axes are simply absent, not defaulted to something',
      JSON.stringify(A('{"npc_a":{"trust":2}}')) === JSON.stringify({ npc_a: { trust: 2 } }));
check('two NPCs in one reply both survive',
      JSON.stringify(A('{"npc_a":{"trust":2},"npc_b":{"tension":3}}')) === JSON.stringify({ npc_a: { trust: 2 }, npc_b: { tension: 3 } }));
check(`out of range clamps at the top (+999 -> +${X5.deltaClamp})`,
      A('{"npc_a":{"trust":999}}').npc_a.trust === X5.deltaClamp);
check(`out of range clamps at the bottom (-999 -> -${X5.deltaClamp})`,
      A('{"npc_a":{"trust":-999}}').npc_a.trust === -X5.deltaClamp);
check('a float on the old +-0.3 scale contributes nothing rather than a wrong amount',
      JSON.stringify(A('{"npc_a":{"trust":0.3,"affection":-0.2}}')) === JSON.stringify({}),
      'truncation is the safe direction: rounding would turn 0.6 into a real delta the model never meant');
check('a float above 1 truncates toward zero, both signs',
      A('{"npc_a":{"trust":2.9,"tension":-2.9}}').npc_a.trust === 2 && A('{"npc_a":{"trust":2.9,"tension":-2.9}}').npc_a.tension === -2);
check('an unknown axis is dropped, not applied',
      JSON.stringify(A('{"npc_a":{"trust":2,"jealousy":9,"loyalty":-4}}')) === JSON.stringify({ npc_a: { trust: 2 } }));
check('a non-numeric axis value is dropped',
      JSON.stringify(A('{"npc_a":{"trust":"a lot","affection":null,"comfort":2}}')) === JSON.stringify({ npc_a: { comfort: 2 } }));
check('D9 — tension keeps its sign through the parse, in both directions',
      A('{"npc_a":{"tension":4}}').npc_a.tension === 4 && A('{"npc_a":{"tension":-4}}').npc_a.tension === -4);
check('prose before the answer is recovered',
      JSON.stringify(A('Looking at this exchange, they were warm but guarded.\n{"npc_a":{"trust":2,"comfort":1}}')) ===
      JSON.stringify({ npc_a: { trust: 2, comfort: 1 } }));
check('a markdown fence is recovered',
      JSON.stringify(A('```json\n{"npc_a":{"trust":2}}\n```')) === JSON.stringify({ npc_a: { trust: 2 } }));
check('a missing leading brace is recovered',
      JSON.stringify(A('"npc_a":{"trust":2}}')) === JSON.stringify({ npc_a: { trust: 2 } }));
check('a missing trailing brace is recovered',
      JSON.stringify(A('{"npc_a":{"trust":2}')) === JSON.stringify({ npc_a: { trust: 2 } }));
check('a truncated reply recovers what completed',
      JSON.stringify(A('{"npc_a":{"trust":2,"affection":1},"npc_b":{"trust":')) === JSON.stringify({ npc_a: { trust: 2, affection: 1 } }),
      JSON.stringify(A('{"npc_a":{"trust":2,"affection":1},"npc_b":{"trust":')));
check('D8 — an all-zero reply is {} (judged nothing), NOT null (failed)',
      A('{"npc_a":{"trust":0,"affection":0,"tension":0,"respect":0,"comfort":0,"desire":0}}') !== null &&
      Object.keys(A('{"npc_a":{"trust":0,"affection":0,"tension":0,"respect":0,"comfort":0,"desire":0}}')).length === 0,
      'the modal answer must be expressible; conflating it with failure hides every real failure');
check('an empty reply is null (a failed pass, D14)', A('') === null);
check('whitespace only is null', A('   \n  ') === null);
check('a non-string is null', J(`parseAssessorReply(null)`) === null && J(`parseAssessorReply(undefined)`) === null && J(`parseAssessorReply(42)`) === null);
check('unrecoverable prose is null', A('I could not score this exchange.') === null);
check('a JSON array is null, not silently iterated', A('[{"trust":2}]') === null);
// Trailing commas are the classic model JSON error and defeat every parse
// tier — the object is balanced, so brace-matching recovers the same
// unparseable string. Regex extraction is what is left.
const MANGLED = '{"npc_a": {"trust": 3, "tension": -2,}, "npc_b": {"comfort": 1,}}';
check('tier 3 — a mangled reply still yields its axes, per NPC', (() => {
  const r = A(MANGLED);
  return r !== null && r.npc_a && r.npc_a.trust === 3 && r.npc_a.tension === -2 && r.npc_b.comfort === 1;
})(), JSON.stringify(A(MANGLED)));
check('tier 3 — an axis name is never mistaken for an npc id',
      Object.keys(A(MANGLED)).every(k => !J('X5_AXES').includes(k)));
check('a flat axis object keys to the sole NPC when there is exactly one',
      JSON.stringify(A('{"trust":2,"comfort":1}', { soleNpcId: 'npc_a' })) === JSON.stringify({ npc_a: { trust: 2, comfort: 1 } }));
check('a flat axis object with nobody to attribute it to is null, not a silent zero',
      A('{"trust":2,"comfort":1}') === null,
      'guessing whose relationship moved is worse than not moving one');

// ---------------------------------------------------------------------------
console.log('\ntoProposalDeltas — the divisor, the allowlist, the roster');

const T = (parsed, ids) => J(`toProposalDeltas(${JSON.stringify(parsed)}, ${JSON.stringify(ids)})`);

check(`D7 — integers divide by ${X5.deltaDivisor} on the way in`,
      T({ npc_a: { trust: 2 } }, ['npc_a']).npc_a.trust === 2 / X5.deltaDivisor);
check(`the biggest allowed move is ${X5.deltaClamp / X5.deltaDivisor} per window`,
      T({ npc_a: { trust: X5.deltaClamp } }, ['npc_a']).npc_a.trust === X5.deltaClamp / X5.deltaDivisor);
check('an unclamped integer handed straight in is still clamped here',
      T({ npc_a: { trust: 400 } }, ['npc_a']).npc_a.trust === X5.deltaClamp / X5.deltaDivisor,
      'this is also the entry point a stubbed pass and the Phase 4 instrument use');
check('an NPC outside the roster is dropped BEFORE validateProposal sees it',
      Object.keys(T({ npc_a: { trust: 2 }, npc_zz: { trust: 5 } }, ['npc_a'])).join() === 'npc_a',
      'validateProposal treats an unknown npcId as an error, and one error fails the whole proposal');
check('an unknown axis never reaches the proposal',
      JSON.stringify(T({ npc_a: { trust: 2, jealousy: 9 } }, ['npc_a']).npc_a) === JSON.stringify({ trust: 2 / X5.deltaDivisor }));
check('an all-zero judgement produces an empty proposal, not a proposal of zeros',
      Object.keys(T({ npc_a: { trust: 0, tension: 0 } }, ['npc_a'])).length === 0);
check('D9 — tension survives the divisor with its sign intact',
      T({ npc_a: { tension: -4 } }, ['npc_a']).npc_a.tension === -4 / X5.deltaDivisor);
check('no allowlist means no filtering (the Phase 4 instrument calls it that way)',
      Object.keys(T({ npc_x: { trust: 1 } }, null)).join() === 'npc_x');

// ---------------------------------------------------------------------------
console.log('\ningestion — the deltas go through applyProposal (D4), not around it');

const script = `
(async () => {
  const out = {};

  // A judged window moves the axes and re-derives the phase.
  {
    const g = __mkState(1);
    const parsed = parseAssessorReply('{"npc_a":{"trust":8,"affection":6,"comfort":9,"tension":0}}');
    const deltas = toProposalDeltas(parsed, ['npc_a']);
    const beforePhase = g.npcs.npc_a.relPlayer.conversationPhase;
    await applyProposal({ relationshipDeltas: deltas }, __sceneCtx(['npc_a']), g, null);
    out.moved = { ...g.npcs.npc_a.relPlayer };
    out.beforePhase = beforePhase;
  }

  // D9's sign, end to end: tension SUBTRACTS from intimacy. A sign error here
  // inverts the relationship model rather than miscounting it.
  {
    const g = __mkState(1);
    await applyProposal({ relationshipDeltas: toProposalDeltas({ npc_a: { trust: 10, affection: 10 } }, ['npc_a']) }, __sceneCtx(['npc_a']), g, null);
    out.warmOnly = g.npcs.npc_a.relPlayer.intimacyLevel;
    await applyProposal({ relationshipDeltas: toProposalDeltas({ npc_a: { tension: 10 } }, ['npc_a']) }, __sceneCtx(['npc_a']), g, null);
    out.warmThenTense = g.npcs.npc_a.relPlayer.intimacyLevel;
  }

  // Every axis in the allowlist actually moves state, and a name outside it
  // moves nothing. This is the behavioural version of "the allowlist matches
  // what applyRelDelta writes" — two hardcoded lists could drift; this cannot.
  {
    out.axisMoves = {};
    for (const axis of X5_AXES) {
      const g = __mkState(1);
      const before = g.npcs.npc_a.relPlayer[axis];
      await applyProposal({ relationshipDeltas: toProposalDeltas({ npc_a: { [axis]: 5 } }, ['npc_a']) }, __sceneCtx(['npc_a']), g, null);
      out.axisMoves[axis] = g.npcs.npc_a.relPlayer[axis] !== before;
    }
    const g = __mkState(1);
    const before = JSON.stringify(g.npcs.npc_a.relPlayer);
    await applyProposal({ relationshipDeltas: toProposalDeltas({ npc_a: { jealousy: 9 } }, ['npc_a']) }, __sceneCtx(['npc_a']), g, null);
    out.unknownAxisInert = JSON.stringify(g.npcs.npc_a.relPlayer) === before;
  }

  // The stamp itself, through the real writer: applyProposal must tag both
  // halves of a turn with the OPEN scene, because that tag is the Assessor's
  // whole window (D2). A turn written into the wrong scene is a turn nobody
  // ever judges.
  {
    const g = __mkState(6);
    await applyProposal({ dialogue: [{ speaker: 'Hana', text: 'long day' }] }, __sceneCtx(['npc_a']), g, 'how was work');
    g.meta.scene = { id: 7, roomId: 'living_room', shouted: [] };
    await applyProposal({ dialogue: [{ speaker: 'Hana', text: 'still here' }] }, __sceneCtx(['npc_a']), g, 'you moved');
    out.stamped = g.npcs.npc_a.memory.recent.map(e => ({ s: e.sceneId, sp: e.speaker }));
    out.stampedWindow = {
      six: assessorWindow(g, { sceneId: 6 }).exchangeCount,
      seven: assessorWindow(g, { sceneId: 7 }).exchangeCount,
    };
  }

  // D14 — a failed pass applies nothing.
  {
    const g = __mkState(1);
    const before = JSON.stringify(g.npcs.npc_a.relPlayer);
    const parsed = parseAssessorReply('total garbage, no answer here');
    out.failedParse = parsed === null;
    if (parsed !== null) await applyProposal({ relationshipDeltas: toProposalDeltas(parsed, ['npc_a']) }, __sceneCtx(['npc_a']), g, null);
    out.failedInert = JSON.stringify(g.npcs.npc_a.relPlayer) === before;
  }

  // The Chronicler's fragment, through the same door.
  {
    const g = __mkState(1);
    // Everything a generous extractor would claim: maximum importance,
    // certainty, and a provenance it has no right to name.
    const reply = JSON.stringify({
      facts: [
        { text: 'The player says they grew up in Leeds', category: 'history', confidence: 1.0, importance: 1.0, provenance: 'told_by:npc_b' },
        { text: 'The player hates their job', category: 'work', importance: 1.0 },
      ],
      episodes: [{ text: 'We talked about where he grew up', emotionalTag: 'warmth' }],
      grievances: [{ text: 'left the milk out', severity: 5 }],
    });
    const parsed = parseChroniclerReply(reply);
    const additions = toProposalMemory(parsed, 'npc_a', { day: g.meta.clock.day });
    await applyProposal({ memoryAdditions: additions }, __sceneCtx(['npc_a']), g, null);
    out.chronicled = {
      facts: g.npcs.npc_a.memory.facts,
      episodes: g.npcs.npc_a.memory.episodes,
      grievances: g.npcs.npc_a.relPlayer.grievances,
    };
  }

  return out;
})()
`;

api(script).then(out => {
  const moved = out.moved;
  check('the axes move by integer / deltaDivisor',
        Math.abs(moved.trust - 8 / X5.deltaDivisor) < 1e-9 && Math.abs(moved.comfort - 9 / X5.deltaDivisor) < 1e-9,
        JSON.stringify(moved));
  check('applyRelDelta re-derives intimacyLevel and conversationPhase',
        typeof moved.intimacyLevel === 'number' && moved.intimacyLevel > 0 && !!moved.conversationPhase,
        JSON.stringify({ intimacyLevel: moved.intimacyLevel, phase: moved.conversationPhase }));
  check('D9 — adding tension LOWERS intimacy (up is worse)',
        out.warmThenTense < out.warmOnly,
        `warm ${out.warmOnly} -> warm+tense ${out.warmThenTense}`);
  for (const axis of Object.keys(out.axisMoves)) {
    check(`allowlisted axis '${axis}' actually moves relPlayer`, out.axisMoves[axis] === true);
  }
  check('an axis outside the allowlist leaves relPlayer byte-identical', out.unknownAxisInert === true);
  check('D14 — an unparseable reply parses to null...', out.failedParse === true);
  check('...and nothing is applied', out.failedInert === true);

  // -------------------------------------------------------------------------
  console.log('\nthe belief contract — what a model claims is not what it gets');
  const c = out.chronicled;
  const facts = c.facts;
  check('both extracted facts landed', facts.length === 2, JSON.stringify(facts.map(f => f.text)));
  check('D11 — provenance is "witnessed" despite the model naming its own',
        facts.every(f => f.provenance === 'witnessed'),
        `the model claimed told_by:npc_b; got ${facts.map(f => f.provenance).join(', ')}`);
  check('D11 — confidence is capped below certainty even when the model says 1.0',
        facts.every(f => f.confidence <= X5.factConfidenceMax && f.confidence < 1),
        JSON.stringify(facts.map(f => f.confidence)));
  check(`an undeclared confidence defaults to X5.factConfidenceDefault (${X5.factConfidenceDefault})`,
        facts[1].confidence === X5.factConfidenceDefault);
  check(`D12 — importance is capped at ${X5.factImportanceCeiling} even when the model says 1.0`,
        facts.every(f => f.importance <= X5.factImportanceCeiling), JSON.stringify(facts.map(f => f.importance)));
  check('D12 — the trap itself: no extracted fact is pinned',
        facts.every(f => f.pinned !== true),
        'importance >= significant grants pinned, and pinned facts never evict — Plan 4 measured every conversation fact pinning itself');
  check('every fact carries a day, so salience is not aged by the whole game',
        facts.every(f => f.day === 3),
        JSON.stringify(facts.map(f => f.day)) + ' — backfillFactRecordV2 does not default this, and factSalienceNow reads f.day || 0');
  check('every fact satisfies the rest of the Plan 4 belief record',
        facts.every(f => typeof f.salience === 'number' && f.salience >= 0 && f.salience <= 1 &&
                         typeof f.emotionalTag === 'string' && typeof f.category === 'string' &&
                         f.valid === true && f.factId != null),
        JSON.stringify(facts));
  check('D13 — every extracted episode carries participants and emotionalTag',
        c.episodes.length === 1 && Array.isArray(c.episodes[0].participants) &&
        c.episodes[0].participants.length > 0 && typeof c.episodes[0].emotionalTag === 'string' &&
        c.episodes[0].emotionalTag === 'warmth',
        JSON.stringify(c.episodes));
  check('a grievance severity of 5 is clamped into range',
        c.grievances.length === 1 && c.grievances[0].severity >= 0 && c.grievances[0].severity <= 1,
        JSON.stringify(c.grievances));

  // -------------------------------------------------------------------------
  console.log('\nparseChroniclerReply — shape, caps and the cold-start fields');

  const C = (obj) => J(`parseChroniclerReply(${JSON.stringify(typeof obj === 'string' ? obj : JSON.stringify(obj))})`);

  check('an unparseable reply is null', C('nothing to see here') === null);
  check('an empty reply is null', C('') === null);
  check('a well-formed but empty reply is an empty fragment, not null',
        JSON.stringify(C({ facts: [], episodes: [] })) === JSON.stringify({ facts: [], episodes: [], grievances: [], resolveGrievances: [] }));
  check('a bare-string fact is accepted (the shape the writing prompt used to produce)',
        C({ facts: ['They grew up in Leeds'] }).facts.length === 1);
  check('a fact with no text is dropped', C({ facts: [{ category: 'history' }, { text: '   ' }] }).facts.length === 0);
  check('an absent category becomes "other"', C({ facts: [{ text: 'a thing' }] }).facts[0].category === 'other');
  check(`facts are capped at maxFactsPerWindow (${X5.maxFactsPerWindow})`,
        C({ facts: Array.from({ length: 20 }, (_, i) => ({ text: 'fact ' + i })) }).facts.length === X5.maxFactsPerWindow,
        'BELIEF.maxFacts is 60; an uncapped extractor fills it in three in-game days');
  check(`episodes are capped at maxEpisodesPerWindow (${X5.maxEpisodesPerWindow})`,
        C({ episodes: Array.from({ length: 9 }, (_, i) => ({ text: 'ep ' + i })) }).episodes.length === X5.maxEpisodesPerWindow);
  check('an over-long text is truncated rather than dropped',
        C({ facts: [{ text: 'x'.repeat(2000) }] }).facts[0].text.length <= X5.maxTextLen);
  check('an emotionalTag EMOTIONAL_WEIGHTS knows is kept',
        C({ episodes: [{ text: 'a', emotionalTag: 'Grievance' }] }).episodes[0].emotionalTag === 'grievance');
  check('an invented emotionalTag becomes empty rather than grouping real episodes under noise',
        C({ episodes: [{ text: 'a', emotionalTag: 'wistful' }] }).episodes[0].emotionalTag === '',
        'rumination\'s repetition rule groups on the tag string itself');
  check('duplicate participants are deduped',
        JSON.stringify(C({ episodes: [{ text: 'a', participants: ['npc_a', 'npc_a', 'player'] }] }).episodes[0].participants) ===
        JSON.stringify(['npc_a', 'player']));
  check('resolveGrievances accepts the flat string list it is documented as',
        JSON.stringify(C({ resolveGrievances: ['left the milk out', ''] }).resolveGrievances) === JSON.stringify(['left the milk out']));

  console.log('\ntoProposalMemory — provenance and the cold start');
  const M = (parsed, npcId, opts) => J(`toProposalMemory(${JSON.stringify(parsed)}, ${JSON.stringify(npcId)}, ${JSON.stringify(opts || {})})`);
  check('D11 — provenance is set by ingestion, never carried from the model',
        M({ facts: [{ text: 'a', provenance: 'inferred' }] }, 'npc_a', { day: 4 }).npc_a.facts[0].provenance === 'witnessed');
  check('D13 — an episode with no participants gets exactly two: the NPC and the player',
        JSON.stringify(M({ episodes: [{ text: 'a', emotionalTag: 'warmth' }] }, 'npc_a', { day: 4 }).npc_a.episodes[0].participants) ===
        JSON.stringify(['npc_a', 'player']),
        'rumination\'s co-occurrence rule only counts pairs — a fallback of one or three would never fire it');
  check('D13 — participants the model DID supply are kept as-is',
        JSON.stringify(M({ episodes: [{ text: 'a', participants: ['npc_a', 'npc_b'] }] }, 'npc_a', { day: 4 }).npc_a.episodes[0].participants) ===
        JSON.stringify(['npc_a', 'npc_b']));
  check('an empty fragment produces no memoryAdditions key at all',
        Object.keys(M({ facts: [], episodes: [], grievances: [], resolveGrievances: [] }, 'npc_a', { day: 4 })).length === 0,
        'an empty additions object would still make applyProposal touch the NPC');

  // -------------------------------------------------------------------------
  console.log('\nwindowing — the scene is the window, and it is already persisted');

  check('addRecentExchange stamps the sceneId it was written in', api(`
    (() => {
      const n = __turn(__freshNpc('npc_a','Hana'), 'hey', 'hi', 7);
      return n.memory.recent.every(e => e.sceneId === 7);
    })()
  `));
  check('applyProposal stamps the OPEN scene onto both halves of a turn',
        JSON.stringify(out.stamped) === JSON.stringify([
          { s: 6, sp: 'player' }, { s: 6, sp: 'Hana' },
          { s: 7, sp: 'player' }, { s: 7, sp: 'Hana' },
        ]), JSON.stringify(out.stamped));
  check('and the two scenes are therefore two separate windows',
        out.stampedWindow.six === 1 && out.stampedWindow.seven === 1,
        JSON.stringify(out.stampedWindow));
  check('an exchange is a PLAYER TURN, not a line', api(`
    (() => {
      let n = __freshNpc('npc_a','Hana');
      n = __turn(n, 'a', 'b', 1);
      n = __turn(n, 'c', 'd', 1);
      return n.memory.recent.length === 4 && x5CountExchanges(n.memory.recent) === 2;
    })()
  `), 'counting entries would fire the flush four times too early');

  const win = J(`
    (() => {
      const g = __mkState(2);
      g.npcs.npc_a = __turn(__turn(g.npcs.npc_a, 'a', 'b', 1), 'c', 'd', 2);
      g.npcs.npc_b = __turn(g.npcs.npc_b, 'e', 'f', 2);
      return { open: assessorWindow(g), closed: assessorWindow(g, { sceneId: 1 }) };
    })()
  `);
  check('the open scene\'s window holds only the open scene\'s exchanges',
        win.open.sceneId === 2 && win.open.exchangeCount === 1 &&
        win.open.byNpc.npc_a.entries.every(e => e.sceneId === 2),
        JSON.stringify(win.open.byNpc.npc_a.entries.map(e => e.sceneId)));
  check('a scene change closes a window: scene 1 is separately addressable',
        win.closed.sceneId === 1 && win.closed.npcIds.join() === 'npc_a' && win.closed.exchangeCount === 1,
        JSON.stringify(win.closed.npcIds));
  check('the window is per-NPC — everyone who was present gets their own transcript',
        win.open.npcIds.slice().sort().join() === 'npc_a,npc_b');
  check('an NPC with nothing in the window is absent from it, not present and empty',
        !Object.prototype.hasOwnProperty.call(win.closed.byNpc, 'npc_b'));

  const flush = J(`
    (() => {
      const g = __mkState(3);
      const out = [];
      for (let i = 0; i < ${X5.assessorMaxExchanges} + 2; i++) {
        g.npcs.npc_a = __turn(g.npcs.npc_a, 'q' + i, 'a' + i, 3);
        const w = assessorWindow(g);
        out.push({ n: w.exchangeCount, full: w.full });
      }
      return out;
    })()
  `);
  check(`D2 — a long single-room scene reports full at assessorMaxExchanges (${X5.assessorMaxExchanges})`,
        flush[X5.assessorMaxExchanges - 1].full === true && flush[X5.assessorMaxExchanges - 2].full === false,
        JSON.stringify(flush));

  const marks = J(`
    (() => {
      const g = __mkState(2);
      g.npcs.npc_a = __turn(__turn(g.npcs.npc_a, 'a', 'b', 1), 'c', 'd', 2);
      const marked = markAssessed(g.npcs.npc_a, 1);
      g.npcs.npc_a = marked;
      const afterScene1 = assessorWindow(g, { sceneId: 1 });
      const stillOpen = assessorWindow(g, { sceneId: 2 });
      // a later scene arrives after the mark
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'e', 'f', 3);
      const scene3 = assessorWindow(g, { sceneId: 3 });
      return {
        flags: marked.memory.recent.map(e => ({ s: e.sceneId, a: !!e.assessed })),
        afterScene1: afterScene1.npcIds.length,
        stillOpen: stillOpen.exchangeCount,
        scene3: scene3.exchangeCount,
      };
    })()
  `);
  check('markAssessed marks exactly the exchanges that were judged',
        JSON.stringify(marks.flags) === JSON.stringify([{ s: 1, a: true }, { s: 1, a: true }, { s: 2, a: false }, { s: 2, a: false }]),
        JSON.stringify(marks.flags));
  check('a judged window is empty the next time it is asked for (a relationship must not move twice)',
        marks.afterScene1 === 0);
  check('marking one window does not consume the next', marks.stillOpen === 1 && marks.scene3 === 1);
  check('markAssessed sweeps up unjudged exchanges from OLDER scenes', api(`
    (() => {
      let n = __turn(__turn(__freshNpc('npc_a','Hana'), 'a', 'b', 1), 'c', 'd', 4);
      n = markAssessed(n, 4);
      return n.memory.recent.every(e => e.assessed === true);
    })()
  `), 'their own window closed without them being judged; they can never be judged now');

  const chron = J(`
    (() => {
      let n = __freshNpc('npc_a','Hana');
      for (let i = 0; i < 3; i++) n = __turn(n, 'q' + i, 'a' + i, i + 1);
      const before = chroniclerWindow(n);
      const marked = markProcessed(n, 2);          // judge the first two ENTRIES
      const after = chroniclerWindow(marked);
      const all = markProcessed(marked);
      return {
        before: before.entries.length,
        beforeCount: before.exchangeCount,
        after: after.entries.length,
        flags: marked.memory.recent.map(e => !!e.processed),
        allDone: chroniclerWindow(all).entries.length,
      };
    })()
  `);
  check('D3 — the Chronicler window is every unprocessed exchange, on any scene',
        chron.before === 6 && chron.beforeCount === 3, JSON.stringify(chron));
  check('markProcessed(npc, upTo) marks exactly upTo of the oldest unprocessed entries',
        JSON.stringify(chron.flags) === JSON.stringify([true, true, false, false, false, false]));
  check('the window shrinks by exactly what was marked', chron.after === 4);
  check('markProcessed with no argument marks the lot', chron.allDone === 0);

  const full = J(`
    (() => {
      let n = __freshNpc('npc_a','Hana');
      const out = [];
      for (let i = 0; i < ${X5.chroniclerMaxExchanges}; i++) {
        n = __turn(n, 'q' + i, 'a' + i, 1);
        out.push(chroniclerWindow(n).full);
      }
      return out;
    })()
  `);
  check(`D3 — the Chronicler flushes early at chroniclerMaxExchanges (${X5.chroniclerMaxExchanges}), and that point is actually reached`,
        full[X5.chroniclerMaxExchanges - 1] === true && full[X5.chroniclerMaxExchanges - 2] === false,
        JSON.stringify(full));

  check('both flags survive a save/load round trip', api(`
    (() => {
      let n = __turn(__freshNpc('npc_a','Hana'), 'a', 'b', 2);
      n = markAssessed(n, 2);
      n = markProcessed(n, 1);
      const reloaded = migrateNpcToV2(JSON.parse(JSON.stringify(n)));
      const r = reloaded.memory.recent;
      return r[0].assessed === true && r[0].processed === true &&
             r[1].assessed === true && r[1].processed !== true &&
             r[0].sceneId === 2;
    })()
  `), 'the flags are ordinary additive memory fields; migrateNpcToV2 must not flatten them');
  check('a save written before this plan reads as scene 0, unjudged', api(`
    (() => {
      const legacy = __freshNpc('npc_a','Hana');
      legacy.memory.recent = [{ speaker: 'player', text: 'old line', type: 'player_input', day: 1, tick: 0, channel: 'scene' }];
      const g = __mkState(0);
      g.npcs.npc_a = legacy;
      const w = assessorWindow(g, { sceneId: 0 });
      return w.exchangeCount === 1 && chroniclerWindow(legacy).entries.length === 1;
    })()
  `), 'same fallback scene.js already uses for a pre-Plan-2 sessionLog entry');

  // -------------------------------------------------------------------------
  console.log('\nthe transcript both prompts render');
  check('one line per entry, oldest first, the player labelled as the player', api(`
    (() => {
      const n = __turn(__turn(__freshNpc('npc_a','Hana'), 'how was work', 'long', 1), 'sorry', 'its fine', 1);
      return formatWindowTranscript(n.memory.recent, { npcName: 'Hana' }) ===
        'Player: how was work\\nHana: long\\nPlayer: sorry\\nHana: its fine';
    })()
  `), api(`JSON.stringify(formatWindowTranscript(__turn(__freshNpc('npc_a','Hana'),'how was work','long',1).memory.recent, { npcName: 'Hana' }))`));
  check('an empty window renders as an empty string, not "undefined"', api(`formatWindowTranscript([]) === '' && formatWindowTranscript(null) === ''`));
  check(`the transcript is bounded at transcriptMaxLines (${X5.transcriptMaxLines})`, api(`
    (() => {
      let n = __freshNpc('npc_a','Hana');
      for (let i = 0; i < 200; i++) n = addRecentExchange(n, 'player', 'line ' + i, 'player_input', 1, i, 'scene', 1);
      return formatWindowTranscript(n.memory.recent).split('\\n').length <= X5.transcriptMaxLines;
    })()
  `));

  // -------------------------------------------------------------------------
  console.log('\nD16 / R2 — none of this runs inside the tick');
  check('resolveTick still runs with generateText rigged to throw', api(`
    (() => {
      const h = SIM_generateHouse(20260811, 3);
      const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                  player: h.player, npcs: h.npcs, world: h.world, objects: h.objects, seed: h.seed };
      const orig = root.generateText;
      root.generateText = () => { throw new Error('the tick called a model'); };
      try { resolveBatch(g, 24); } finally { root.generateText = orig; }
      return true;
    })()
  `), 'x5.js is now loaded alongside the tick; this is the assertion that it stayed out of it');

  // -------------------------------------------------------------------------
  console.log('\nwiring (README rule 6 — a new file needs a line in BOTH)');
  const mainHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
  check('index.html loads x5.js with a cache-busting version', /src\/srcfiles\/x5\.js\?v=\d+/.test(mainHtml));
  check('x5.js loads AFTER llm.js in index.html',
        mainHtml.indexOf('srcfiles/x5.js') > mainHtml.indexOf('srcfiles/llm.js'));
  check('loadgame.js ORDER lists x5.js', /'x5\.js'/.test(loader),
        'rumination.js shipped without this and silently killed 175 assertions across five harnesses');
  const ver = (f) => { const m = mainHtml.match(new RegExp(`srcfiles/${f.replace('.', '\\.')}\\?v=(\\d+)`)); return m ? +m[1] : -1; };
  check('config.js version is at or above the Phase 1 floor (77)', ver('config.js') >= 77, `got ${ver('config.js')}`);
  check('npc.js version is at or above the Phase 1 floor (25)', ver('npc.js') >= 25, `got ${ver('npc.js')}`);

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
