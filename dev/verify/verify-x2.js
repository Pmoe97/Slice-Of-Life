// Plan X-5, Phase 2 — the Assessor.
//
//   node dev/verify/verify-x2.js
//
// The model itself cannot be tested here, which is exactly why Phase 1 made
// the surface around it as large as possible. What CAN be tested is every
// claim this phase makes that is not "the judge has good taste":
//
//   1. The writer no longer grades itself (D5) — and, more importantly, it
//      CANNOT, even when it volunteers deltas anyway. A prompt that stops
//      asking is a request; the strip is the enforcement, and this is the one
//      case nobody would think to check by playing.
//   2. The rubric carries its locked decisions. D8's zero-first ordering, D9's
//      stated inversion, D10's labels-not-numbers, D7's integer wire — each of
//      these is a sentence in a prompt, and a sentence in a prompt is exactly
//      the kind of thing a later edit silently drops.
//   3. A stubbed reply drives end to end: window -> call -> parse -> divide ->
//      validate -> apply -> mark. And a judged window never reopens, because a
//      relationship that moves twice for one conversation is worse than one
//      that occasionally fails to move (D14).
//   4. Nothing here runs in the tick (D16/R2).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'npc.js', 'llm.js', 'x5.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
// The purity scan reads CODE, not prose — every one of these files explains
// its own invariants at length in comments that name the thing they forbid.
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

ctx.__t = {};
api(`
  __freshNpc = (id, name, rel) => ({
    id, bible: { name, speech: {}, temperament: { openness: 0.5 }, interests: [] },
    relPlayer: Object.assign({ trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
                 conversationPhase: 'early', intimacyLevel: 0, grievances: [],
                 firstMetDay: 1, lastInteractionDay: 1 }, rel || {}),
    memory: { facts: [], episodes: [], summary: '', recent: [], styleCounters: {},
              openQuestions: [], nextFactId: 1 },
    mood: 0, needs: {}, flags: {}, inventory: [],
  });
  __mkState = (sceneId, relA) => ({
    meta: { clock: { day: 3, minutes: 600 }, scene: { id: sceneId, roomId: 'kitchen', shouted: [] }, sessionLog: [] },
    player: { location: 'kitchen', money: 100, inventory: [], flags: {} },
    npcs: { npc_a: __freshNpc('npc_a', 'Hana', relA), npc_b: __freshNpc('npc_b', 'Marcus') },
    objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
    seed: 1234,
  });
  // One conversational turn, exactly as applyProposal writes it: the player
  // line first, then the dialogue it provoked (Plan 0's D4 order).
  __turn = (npc, playerLine, npcLine, sceneId, channel) => {
    let n = addRecentExchange(npc, 'player', playerLine, 'player_input', 3, 600, channel || 'scene', sceneId);
    return addRecentExchange(n, npc.bible.name, npcLine, 'dialogue', 3, 600, channel || 'scene', sceneId);
  };
  // Rig the model to answer with a fixed string, run fn, put it back. Every
  // assertion below that involves a "reply" goes through this — the stub is
  // the model's whole contribution to this harness.
  __withModel = async (reply, fn) => {
    const orig = root.generateText;
    root.generateText = async () => (typeof reply === 'function' ? reply() : reply);
    try { return await fn(); } finally { root.generateText = orig; }
  };
`);

const X5 = J('X5');
const LABELS = J('X5_AXIS_LABELS');
const AXES = J('X5_AXES');

// ---------------------------------------------------------------------------
console.log('\nD5 — the writer does not grade itself, and cannot');

const llmCode = codeOf('llm.js');
check('the scene prompt no longer asks for relationshipDeltas', api(`
  (() => {
    const g = __mkState(1);
    const ctxObj = { scene: { room: 'Kitchen', phase: 'evening', time: '20:00', day: 3, cleanliness: 60, signals: [] },
                     player: { mood: 0, energy: 80, hunger: 40 },
                     activeNpcs: [], ambientNpcs: [], worldEvents: [], contentConfig: null };
    return !/relationshipDeltas/.test(buildScenePrompt(ctxObj, 'hello'));
  })()
`), 'the field it requests is the field it gets back');
check('the IM prompt no longer asks for relationshipDeltas either', api(`
  (() => {
    const npc = __freshNpc('npc_a', 'Hana');
    npc.bible.speech = { textingStyle: 'lowercase', verbosity: 0.4, formality: 0.2 };
    const ctxObj = { activeNpcs: [npc], imThread: [], day: 3, contentConfig: null };
    return !/relationshipDeltas/.test(buildImPrompt(ctxObj, 'hey'));
  })()
`), 'IM is a judged surface (D17), so it must not judge itself either');
check('D1 — the writer is still INFORMED by relationship state', api(`
  (() => {
    const npc = __freshNpc('npc_a', 'Hana', { trust: 0.4, conversationPhase: 'familiar' });
    npc.bible.speech = { textingStyle: 'lowercase', verbosity: 0.4, formality: 0.2 };
    npc.bible.occupation = { title: 'barista' };
    npc.bible.want = 'w'; npc.bible.wound = 'x'; npc.bible.blindSpot = 'y'; npc.bible.boundary = 'z';
    const block = buildNpcBlockV2(npc, 'hi', 'scene', 3);
    return /\\[Relationship with player\\]/.test(block) && /trust 0.4/.test(block);
  })()
`), 'being informed is not the same as grading yourself — do not "fix" this by hiding the axes');

check('stripWriterJudgement removes relationshipDeltas', api(`
  (() => {
    const s = stripWriterJudgement({ narration: 'n', relationshipDeltas: { npc_a: { trust: 0.3 } } });
    return s.relationshipDeltas === undefined && !('relationshipDeltas' in s);
  })()
`));
// Phase 3 moved this one. It used to assert memoryAdditions SURVIVED the
// strip, and said so in its own detail line — the writer kept writing memory
// until its replacement shipped (D5). The Chronicler is that replacement, so
// the field is now stripped too and the assertion is inverted rather than
// deleted; what it still guards is the boundary, which has not moved: mood,
// dialogue, topic and effects are the writer's and stay untouched.
check('and leaves everything else the writer legitimately owns',
      api(`
        (() => {
          const p = { narration: 'n', dialogue: [{ speaker: 'Hana', text: 'hi' }], moodDeltas: { npc_a: 0.1 },
                      memoryAdditions: { npc_a: { facts: [] } }, topic: 't', effects: [], relationshipDeltas: {} };
          const s = stripWriterJudgement(p);
          return s.narration === 'n' && s.dialogue.length === 1 && s.moodDeltas.npc_a === 0.1 &&
                 s.memoryAdditions === undefined && s.topic === 't' && Array.isArray(s.effects);
        })()
      `), 'mood is not this plan\'s business; memoryAdditions became Phase 3\'s and is gone');
check('it does not mutate the proposal it was handed', api(`
  (() => {
    const p = { narration: 'n', relationshipDeltas: { npc_a: { trust: 0.3 } } };
    stripWriterJudgement(p);
    return !!p.relationshipDeltas;
  })()
`), 'a caller may still want to log what the model tried to claim');
check('a proposal with nothing to strip is returned unchanged (same reference)', api(`
  (() => { const p = { narration: 'n' }; return stripWriterJudgement(p) === p; })()
`));
check('a non-object survives the strip without throwing',
      api(`stripWriterJudgement(null) === null && stripWriterJudgement(undefined) === undefined`));

// ---------------------------------------------------------------------------
console.log('\nD5 end to end — a writing call that volunteers deltas moves nothing');
// The failure this catches: the prompt stops asking, the model keeps
// answering (they all do), applyProposal keeps applying, and the
// actor-grades-their-own-performance loop is quietly still running while
// every prompt in the repo says it is not.

const e2e = `
(async () => {
  const h = SIM_generateHouse(20260811, 3);
  const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [],
                      scene: { id: 4, roomId: h.player.location, shouted: [] } },
              player: h.player, npcs: h.npcs, world: h.world, objects: h.objects, seed: h.seed };
  const residents = Object.entries(g.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
  const id = residents[0];
  g.npcs[id].location = g.player.location;
  // Headless houses have no generated names (prose expansion is a model
  // call), and validateProposal accepts an id as a speaker just as it accepts
  // a name — so address them by whichever they actually have.
  const name = g.npcs[id].bible.name || id;
  const context = assembleContext(g, { active: [id], ambient: [], engagement: {} });
  const before = JSON.stringify(g.npcs[id].relPlayer);
  const moodBefore = g.npcs[id].mood;

  // Everything the OLD contract asked for, at the maximum validateProposal
  // still accepts — so if the strip ever regresses, this moves the axes
  // instead of failing validation, which is the quiet version of the bug.
  const reply = JSON.stringify({
    narration: 'They look up from the counter.',
    dialogue: [{ speaker: name, text: 'hey, you' }],
    relationshipDeltas: { [id]: { trust: 0.3, affection: 0.3, comfort: 0.3, respect: 0.3, desire: 0.3, tension: -0.3 } },
    moodDeltas: { [id]: 0.1 },
  });
  const result = await __withModel(reply, () => callLLM(context, 'say hi'));
  if (result.valid && result.proposal) await applyProposal(result.proposal, context, g, 'say hi');
  return {
    valid: result.valid,
    hadDeltas: !!(result.proposal && result.proposal.relationshipDeltas),
    relUnmoved: JSON.stringify(g.npcs[id].relPlayer) === before,
    moodMoved: g.npcs[id].mood !== moodBefore,
    dialogueLanded: (g.npcs[id].memory.recent || []).some(e => e.text === 'hey, you'),
    id, name,
  };
})()
`;

api(e2e).then(w => {
  check('the writing call still succeeds and still writes dialogue', w.valid === true && w.dialogueLanded === true,
        JSON.stringify(w));
  check('the proposal that reaches applyProposal carries NO relationshipDeltas', w.hadDeltas === false);
  check('so the relationship is byte-identical after a maximally generous writing turn', w.relUnmoved === true,
        'the model asked for +0.3 on five axes and got nothing, which is the entire point of this phase');
  check('and mood still moves, so the pipeline really ran', w.moodMoved === true,
        'if this fails the test proved nothing — the call did not happen');

  // -------------------------------------------------------------------------
  console.log('\nthe rubric carries its locked decisions');

  const prompt = api(`
    (() => {
      const g = __mkState(2, { trust: 0.63, affection: -0.37, tension: 0.28, respect: 0.55, comfort: 0.42, desire: 0.21,
                               conversationPhase: 'familiar' });
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'you ok?', 'long day', 2);
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'want to talk about it?', 'not really', 2, 'im');
      g.npcs.npc_b = __turn(g.npcs.npc_b, 'hey', 'hm', 2);
      return buildAssessorPrompt(g, assessorWindow(g));
    })()
  `);

  const zeroFirst = prompt.indexOf('MOST CONVERSATIONS CHANGE NOTHING');
  check('D8 — the zero case is stated before the axes are introduced',
        zeroFirst > 0 && zeroFirst < prompt.indexOf('THE AXES'),
        'a judge that always finds some movement is monotonic inflation, and it looks alive');
  const allZero = prompt.indexOf('"trust": 0, "affection": 0, "tension": 0, "respect": 0, "comfort": 0, "desire": 0');
  const anyNonZero = prompt.search(/"trust": -?[1-9]/);
  check('D8 — and the all-zero example comes before any example that moves something',
        allZero > 0 && anyNonZero > 0 && allZero < anyNonZero,
        `zero example at ${allZero}, first non-zero at ${anyNonZero}`);
  check('D9 — tension\'s inversion is stated in words, not implied',
        /UP IS BAD/.test(prompt) && /NEGATIVE means/.test(prompt),
        'deriveConversationPhase subtracts tension: a sign error inverts the relationship model');
  check(`D7 — the wire range is the one X5 owns (+-${X5.deltaClamp})`,
        prompt.includes(`-${X5.deltaClamp} to +${X5.deltaClamp}`) && /[Ww]hole numbers only/.test(prompt),
        'read from the table, so Phase 4 can retune deltaClamp without this reporting a regression');
  check('D7 — the old +-0.3 float scale appears nowhere in it',
        !/0\.3/.test(prompt) && !/decimal[^s]/.test(prompt.replace(/Never a decimal\./g, '')),
        'showing the old scale is how a model answers on it');
  check('every axis the allowlist accepts is defined for the judge',
        AXES.every(a => new RegExp(`- ${a} —`).test(prompt)),
        AXES.filter(a => !new RegExp(`- ${a} —`).test(prompt)).join(', ') || 'ok');

  console.log('\nD10 — labels in, integers out');
  check('the relationship is shown as words',
        /trust: trusting/.test(prompt) && /affection: distant/.test(prompt) && /tension: some friction/.test(prompt),
        (prompt.split('\n').find(l => l.startsWith('How they see')) || 'no label line'));
  check('and its conversationPhase alongside them', /familiar —/.test(prompt));
  check('no raw axis value appears anywhere in the prompt',
        ['0.63', '-0.37', '0.28', '0.55', '0.42', '0.21'].every(n => !prompt.includes(n)),
        'mixing a -1..1 display with a +-10 answer is what forces prior art to warn "NEVER output 50, 80 or 100"');

  console.log('\nthe window reaches the judge intact');
  check('both people in the window are in the prompt, with their ids',
        prompt.includes('(ID: npc_a)') && prompt.includes('(ID: npc_b)'));
  check('and their own transcripts, per NPC',
        prompt.includes('Player: you ok?') && prompt.includes('Hana: long day') && prompt.includes('Marcus: hm'));
  check('a text message is marked as one, an in-person line is not',
        prompt.includes('Player (text): want to talk about it?') && prompt.includes('Player: you ok?'),
        '"I miss you" typed at midnight is not the same act as "I miss you" said across a kitchen');
  check('the id list the judge is told to use holds exactly the window\'s roster',
        /Use these character IDs exactly and no others: "npc_a", "npc_b"\./.test(prompt),
        prompt.split('\n').find(l => l.includes('exactly and no others')) || 'no id line');
  check('an empty window still builds a prompt rather than throwing', api(`
    (() => {
      const g = __mkState(9);
      return typeof buildAssessorPrompt(g, assessorWindow(g)) === 'string';
    })()
  `));

  // -------------------------------------------------------------------------
  console.log('\ncallAssessor — a stubbed judge, end to end');

  const calls = `
  (async () => {
    const out = {};
    const mk = () => {
      const g = __mkState(2);
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'you ok?', 'long day', 2);
      g.npcs.npc_b = __turn(g.npcs.npc_b, 'hey', 'hm', 2);
      return g;
    };
    const g = mk();
    const win = assessorWindow(g);

    out.wellFormed = await __withModel('{"npc_a":{"trust":4,"tension":-2},"npc_b":{"comfort":1}}',
                                       () => callAssessor(g, win));
    out.allZero = await __withModel('{"npc_a":{"trust":0,"affection":0,"tension":0,"respect":0,"comfort":0,"desire":0}}',
                                    () => callAssessor(g, win));
    out.garbage = await __withModel('I am not able to score this exchange.', () => callAssessor(g, win));
    out.empty = await __withModel('', () => callAssessor(g, win));
    out.threw = await __withModel(() => { throw new Error('model exploded'); }, () => callAssessor(g, win));
    out.stranger = await __withModel('{"npc_zz":{"trust":9}}', () => callAssessor(g, win));
    out.noWindow = await callAssessor(g, { npcIds: [], byNpc: {}, sceneId: 2 });

    // A flat reply is attributable only when there is exactly one candidate.
    {
      const g1 = __mkState(2);
      g1.npcs.npc_a = __turn(g1.npcs.npc_a, 'hey', 'hi', 2);
      const w1 = assessorWindow(g1);
      out.flatSole = await __withModel('{"trust":3}', () => callAssessor(g1, w1));
    }
    out.flatAmbiguous = await __withModel('{"trust":3}', () => callAssessor(g, win));

    // The whole pass, the way UI runs it: judge, validate, apply, mark.
    {
      const g2 = mk();
      const w2 = assessorWindow(g2);
      const r = await __withModel('{"npc_a":{"trust":4,"tension":-2},"npc_b":{"comfort":1}}', () => callAssessor(g2, w2));
      const pctx = x5ProposalContext(g2, w2.npcIds);
      const v = validateProposal({ relationshipDeltas: r.deltas }, pctx);
      if (v.valid) await applyProposal({ relationshipDeltas: r.deltas }, pctx, g2, null);
      for (const id of w2.npcIds) g2.npcs[id] = markAssessed(g2.npcs[id], w2.sceneId);
      out.applied = {
        validated: v.valid,
        errors: v.errors,
        a: { ...g2.npcs.npc_a.relPlayer },
        b: { ...g2.npcs.npc_b.relPlayer },
        recentGrew: g2.npcs.npc_a.memory.recent.length,
        reopened: assessorWindow(g2, { sceneId: 2 }).npcIds.length,
      };
      // A second pass over the same scene must find nothing to judge.
      const r2 = await __withModel('{"npc_a":{"trust":4}}', () => callAssessor(g2, assessorWindow(g2, { sceneId: 2 })));
      out.applied.secondPassOk = r2.ok;
      out.applied.afterSecond = { ...g2.npcs.npc_a.relPlayer };
    }

    // D14 — a failed pass, run the same way, applies nothing but still marks.
    {
      const g3 = mk();
      const w3 = assessorWindow(g3);
      const before = JSON.stringify(g3.npcs.npc_a.relPlayer);
      const r = await __withModel('total nonsense', () => callAssessor(g3, w3));
      if (r.ok && Object.keys(r.deltas).length > 0) {
        const pctx = x5ProposalContext(g3, w3.npcIds);
        await applyProposal({ relationshipDeltas: r.deltas }, pctx, g3, null);
      }
      for (const id of w3.npcIds) g3.npcs[id] = markAssessed(g3.npcs[id], w3.sceneId);
      out.failed = {
        inert: JSON.stringify(g3.npcs.npc_a.relPlayer) === before,
        marked: assessorWindow(g3, { sceneId: 2 }).npcIds.length === 0,
      };
    }
    return out;
  })()
  `;

  return api(calls);
}).then(c => {
  const d = X5.deltaDivisor;
  check('a well-formed reply comes back ok, divided by deltaDivisor',
        c.wellFormed.ok === true &&
        Math.abs(c.wellFormed.deltas.npc_a.trust - 4 / d) < 1e-9 &&
        Math.abs(c.wellFormed.deltas.npc_b.comfort - 1 / d) < 1e-9,
        JSON.stringify(c.wellFormed));
  check('D9 — tension keeps its sign all the way to the proposal',
        Math.abs(c.wellFormed.deltas.npc_a.tension + 2 / d) < 1e-9,
        JSON.stringify(c.wellFormed.deltas.npc_a));
  check('D8 — an all-zero reply is a SUCCESS with nothing to apply',
        c.allZero.ok === true && Object.keys(c.allZero.deltas).length === 0,
        'conflating "nothing changed" with "the call failed" hides every real failure');
  check('D14 — an unscoreable reply is ok:false, not a guess', c.garbage.ok === false && Object.keys(c.garbage.deltas).length === 0);
  check('an empty reply is ok:false', c.empty.ok === false);
  check('a thrown model error is caught and returned, never propagated',
        c.threw.ok === false && typeof c.threw.reason === 'string',
        'a judge that throws would take down the move/send that fired it');
  check('a delta for someone who was not in the window is dropped',
        c.stranger.ok === true && Object.keys(c.stranger.deltas).length === 0,
        'validateProposal fails the WHOLE proposal on one unknown id — filtering after the fact would cost everyone else their deltas');
  check('an empty window never reaches the model at all', c.noWindow.ok === false && c.noWindow.reason === 'empty window',
        'there is no model selection here — every pass is a full-price call');
  check('a flat axis object is attributed when exactly one person was there',
        c.flatSole.ok === true && Math.abs(c.flatSole.deltas.npc_a.trust - 3 / d) < 1e-9,
        JSON.stringify(c.flatSole));
  check('and is a no-op when two people were',
        c.flatAmbiguous.ok === false,
        'guessing whose relationship moved is worse than not moving one');

  console.log('\nthe pass, the way UI runs it');
  const a = c.applied;
  check('the deltas clear validateProposal (D4 — the existing door)', a.validated === true, JSON.stringify(a.errors));
  check('both NPCs move, by exactly integer / deltaDivisor',
        Math.abs(a.a.trust - 4 / d) < 1e-9 && Math.abs(a.a.tension + 2 / d) < 1e-9 && Math.abs(a.b.comfort - 1 / d) < 1e-9,
        JSON.stringify({ a: a.a, b: a.b }));
  check('applyRelDelta re-derived the phase on the way through',
        typeof a.a.intimacyLevel === 'number' && !!a.a.conversationPhase);
  check('judging writes no new exchange into the buffer it just read',
        a.recentGrew === 2,
        'applyProposal with no playerAction and no dialogue must not append — the Assessor is not a speaker');
  check('the window is closed the moment it has been judged', a.reopened === 0);
  check('so a second pass over the same scene finds nothing and changes nothing',
        a.secondPassOk === false && JSON.stringify(a.afterSecond) === JSON.stringify(a.a),
        'a relationship that moves twice for one conversation is the failure D14 exists to prevent');
  check('D14 — a failed pass leaves the relationship untouched', c.failed.inert === true);
  check('D14 — and still marks the window judged', c.failed.marked === true,
        'an unmarked window is read again by the next pass, which is how one conversation scores twice');

  // -------------------------------------------------------------------------
  console.log('\nx5ProposalContext — the door both passes ingest through');
  check('it satisfies validateProposal for the window\'s roster', api(`
    (() => {
      const g = __mkState(1);
      const c = x5ProposalContext(g, ['npc_a', 'npc_b']);
      return validateProposal({ relationshipDeltas: { npc_a: { trust: 0.05 }, npc_b: { trust: 0.05 } } }, c).valid;
    })()
  `));
  check('and rejects an id that was not in the window', api(`
    (() => {
      const g = __mkState(1);
      const c = x5ProposalContext(g, ['npc_a']);
      return validateProposal({ relationshipDeltas: { npc_b: { trust: 0.05 } } }, c).valid === false;
    })()
  `));
  check('it carries real names, so a judged NPC is addressable by name too',
        J(`x5ProposalContext(__mkState(1), ['npc_a']).activeNpcs[0]`).name === 'Hana');
  check('an id that no longer exists is dropped rather than carried as a hole',
        J(`x5ProposalContext(__mkState(1), ['npc_a', 'npc_gone']).activeNpcs`).length === 1,
        'an NPC can move out between the conversation and the judgement');
  check('it grants no effect reach at all', api(`
    (() => {
      const c = x5ProposalContext(__mkState(1), ['npc_a']);
      return Object.keys(c.roomObjects).length === 0 && c.carryItems.length === 0;
    })()
  `), 'a judging pass emits deltas and memory, never effects');

  // -------------------------------------------------------------------------
  console.log('\nD10 — the label table is well formed and every band is reachable');
  for (const axis of AXES) {
    const band = LABELS[axis];
    check(`${axis}: cuts are ascending and exactly one shorter than labels`,
          !!band && band.cuts.length === band.labels.length - 1 &&
          band.cuts.every((v, i) => i === 0 || v > band.cuts[i - 1]),
          JSON.stringify(band));
  }
  // The domain of each axis is derived from applyRelDelta — the function that
  // owns the clamps — rather than restated here. comfort is clamp01 and the
  // rest are clampAxis; hardcoding that split is how a later retune silently
  // makes a band unreachable (README rule 5).
  const reach = J(`
    (() => {
      const out = {};
      for (const axis of X5_AXES) {
        const base = __freshNpc('npc_a', 'Hana');
        const lo = applyRelDelta(base, { [axis]: -99 }, 1).relPlayer[axis];
        const hi = applyRelDelta(base, { [axis]: 99 }, 1).relPlayer[axis];
        const seen = [];
        for (let v = lo; v <= hi + 1e-9; v += 0.01) {
          const l = x5AxisLabel(axis, v);
          if (!seen.includes(l)) seen.push(l);
        }
        out[axis] = { lo, hi, seen };
      }
      return out;
    })()
  `);
  for (const axis of AXES) {
    check(`${axis}: every authored label is reachable inside [${reach[axis].lo}, ${reach[axis].hi}]`,
          LABELS[axis].labels.every(l => reach[axis].seen.includes(l)),
          `unreachable: ${LABELS[axis].labels.filter(l => !reach[axis].seen.includes(l)).join(', ')}`);
  }
  check('a missing or non-numeric axis still reads as a word, never "undefined"',
        api(`x5AxisLabel('trust', undefined) === x5AxisLabel('trust', 0) && x5AxisLabel('trust', NaN) === x5AxisLabel('trust', 0)`),
        'a legacy save with an axis absent must still render a sentence');
  check('an axis nobody authored labels returns empty rather than throwing',
        api(`x5AxisLabel('jealousy', 0.5) === ''`));
  check('the whole line names all six axes in the allowlist\'s order',
        api(`x5RelationshipLabels({}) === X5_AXES.map(a => a + ': ' + x5AxisLabel(a, 0)).join(', ')`),
        api(`x5RelationshipLabels({})`));

  // -------------------------------------------------------------------------
  console.log('\nD16 / R2 — none of this runs inside the tick');
  check('resolveBatch still runs with generateText rigged to throw', api(`
    (() => {
      const h = SIM_generateHouse(20260811, 3);
      const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                  player: h.player, npcs: h.npcs, world: h.world, objects: h.objects, seed: h.seed };
      const orig = root.generateText;
      root.generateText = () => { throw new Error('the tick called a model'); };
      try { resolveBatch(g, 24); } finally { root.generateText = orig; }
      return true;
    })()
  `), 'the Assessor is fired from UI on player contact, never from the tick');
  check('x5.js is still pure — the phase boundary held through Phase 2',
        !/\basync\b|\bawait\b|generateText/.test(codeOf('x5.js')),
        'the label bucketer, the proposal context and the writer strip are all arithmetic');
  check('the Assessor call itself lives in llm.js, not x5.js',
        /async function callAssessor/.test(llmCode) && !/callAssessor/.test(codeOf('x5.js')));

  // -------------------------------------------------------------------------
  console.log('\nthe triggers (D2/D6/D17) are wired where the plan says');
  const uiSrc = srcOf('ui.js');
  const uiCode = codeOf('ui.js');
  check('the closing scene id is captured BEFORE openScene increments it',
        uiCode.indexOf('closingSceneId') > 0 &&
        uiCode.indexOf('closingSceneId') < uiCode.indexOf('openScene(currentGameState'),
        'openScene overwrites meta.scene — after it, there is no record of which window just ended');
  check('a scene that did not actually change is not judged',
        /sceneClosed = \(currentGameState\.meta\.scene\.id !== closingSceneId\)/.test(uiCode),
        'openScene is idempotent per room; re-entering the room you are in closes nothing');
  // doMove, truncated at its save: anything found in here runs before the
  // boundary write, and anything after the first render() runs after the
  // player can see the room they walked into.
  const moveBody = (() => {
    const move = uiCode.slice(uiCode.indexOf('async function doMove'));
    return move.slice(0, move.indexOf("saveAtBoundary('move'"));
  })();
  check('the scene-close pass fires after the new room has rendered (D6)',
        moveBody.includes('runAssessorPass') &&
        moveBody.indexOf('render(currentGameState') < moveBody.indexOf('runAssessorPass'),
        'the player never waits on a judgement');
  check('every conversation surface D17 names runs the early flush', (() => {
    const missing = [];
    if (!/doPlayerAction[\s\S]*?assessSceneIfFull/.test(uiCode.slice(uiCode.indexOf('async function doPlayerAction'), uiCode.indexOf('async function doLookAround')))) missing.push('doPlayerAction');
    if (!/assessSceneIfFull/.test(uiCode.slice(uiCode.indexOf('async function doConvSend'), uiCode.indexOf('function doConvLeave')))) missing.push('doConvSend');
    if (!/assessSceneIfFull/.test(codeOf('ui.computer.js'))) missing.push('doImSend');
    if (!/assessSceneIfFull/.test(codeOf('ui.phone.js'))) missing.push('doPhoneCameraShare');
    ctx.__t.missing = missing;
    return missing.length === 0;
  })(), 'missing: ' + (ctx.__t.missing || []).join(', '));
  check('room entry does NOT fire one (D17)', (() => {
    const beat = moveBody.slice(moveBody.indexOf('currentSceneState.active.length > 0'),
                                moveBody.indexOf('render(currentGameState'));
    return !/assessSceneIfFull|runAssessorPass/.test(beat);
  })(), 'room-entry beats carry near-zero relational content and would spend a full-price call on an empty window');
  check('two passes cannot overlap',
        /assessorInFlight/.test(uiCode) && /if \(!currentGameState \|\| assessorInFlight\) return false/.test(uiCode),
        'the second pass would mark entries the first is still judging, and the same exchanges would score twice');
  // Found in the browser, not here, and it is the reason the browser leg
  // exists: the pass was handing callAssessor the global `window` instead of
  // its local. `window.npcIds` is undefined, so every pass returned "empty
  // window" — a no-op that STILL marked the buffer judged. From the outside
  // that is invisible: conversations look judged and nothing ever moves.
  // A judging function has no business naming a browser global, so the rule
  // is simply that it never does.
  // Top-level function bodies close on a `}` in column 0, which is what makes
  // this sliceable without a parser.
  const fnBody = (code, name) => {
    const start = code.indexOf(`function ${name}(`);
    if (start < 0) return '';
    const end = code.indexOf('\n}', start);
    return end < 0 ? code.slice(start) : code.slice(start, end + 2);
  };
  check('the Assessor\'s UI functions never name the browser global `window`',
        ['runAssessorPass', 'assessSceneIfFull'].every(n => {
          const body = fnBody(uiCode, n);
          return body.length > 0 && !/\bwindow\b/.test(body);
        }),
        'a window variable that is sometimes the DOM and sometimes a judged scene is a bug waiting for a typo');

  console.log('\nwiring (README rule 4 — a floor, never an equality)');
  const mainHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const ver = (f) => { const m = mainHtml.match(new RegExp(`srcfiles/${f.replace(/\./g, '\\.')}\\?v=(\\d+)`)); return m ? +m[1] : -1; };
  for (const [f, floor] of [['config.js', 78], ['llm.js', 20], ['x5.js', 2], ['ui.js', 58], ['ui.computer.js', 29], ['ui.phone.js', 9]]) {
    check(`${f} version is at or above the Phase 2 floor (${floor})`, ver(f) >= floor, `got ${ver(f)}`);
  }

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
