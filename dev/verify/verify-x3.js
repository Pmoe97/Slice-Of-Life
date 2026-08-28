// Plan X-5, Phase 3 — the Chronicler.
//
//   node dev/verify/verify-x3.js
//
// The extractor's taste cannot be tested here. Everything around it can, and
// this phase makes four claims that are not "the model picks good facts":
//
//   1. The writer no longer writes memory (D5) — and CANNOT, even when it
//      volunteers memoryAdditions anyway. Same enforcement-not-request shape
//      as Phase 2's relationship strip (D22), and the same reason: a model
//      volunteers familiar JSON keys whatever the prompt says.
//   2. Nothing a model claims can mint a permanent or certain belief. It may
//      say importance 1.0 and provenance 'told_by' and confidence 1; it gets
//      the ceiling, 'witnessed', and a cap below certainty (D11/D12).
//   3. Every extracted episode arrives with `participants` and `emotionalTag`
//      (D13) — and that is not a shape check, it is THE claim this plan
//      exists to make good on, so it is asserted the only way that means
//      anything: by running rumination over the result and watching facts and
//      open questions go from zero to non-zero, against a counterfactual
//      written the old way that still yields zero.
//   4. A failed pass writes nothing and still marks the window (D14), the
//      window never reopens, and none of it runs in the tick (D16/R2).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'npc.js', 'rumination.js', 'llm.js', 'x5.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

ctx.__t = {};
api(`
  __freshNpc = (id, name, opts) => ({
    bible: { name, speech: {}, temperament: { openness: (opts && opts.openness) !== undefined ? opts.openness : 0.5 },
             interests: (opts && opts.interests) || [] },
    relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
                 conversationPhase: 'early', intimacyLevel: 0, grievances: (opts && opts.grievances) || [],
                 firstMetDay: 1, lastInteractionDay: 1 },
    memory: { facts: (opts && opts.facts) || [], episodes: (opts && opts.episodes) || [],
              summary: '', recent: [], styleCounters: {}, openQuestions: [], nextFactId: 1 },
    mood: 0, needs: {}, flags: {}, inventory: [],
  });
  __mkState = (sceneId, opts) => ({
    meta: { clock: { day: 3, minutes: 600 }, scene: { id: sceneId, roomId: 'kitchen', shouted: [] }, sessionLog: [] },
    player: { location: 'kitchen', money: 100, inventory: [], flags: {} },
    npcs: { npc_a: __freshNpc('npc_a', 'Hana', opts) },
    objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
    seed: 1234,
  });
  __turn = (npc, playerLine, npcLine, sceneId, channel) => {
    let n = addRecentExchange(npc, 'player', playerLine, 'player_input', 3, 600, channel || 'scene', sceneId);
    return addRecentExchange(n, npc.bible.name, npcLine, 'dialogue', 3, 600, channel || 'scene', sceneId);
  };
  __withModel = async (reply, fn) => {
    const orig = root.generateText;
    root.generateText = async () => (typeof reply === 'function' ? reply() : reply);
    try { return await fn(); } finally { root.generateText = orig; }
  };
  // The pass exactly as UI's runChroniclerPass runs it. ui.js needs a DOM, so
  // the sequence is reproduced here rather than imported — the source scan
  // further down is what keeps this honest about matching it.
  __chroniclePass = async (g, npcId) => {
    const win = chroniclerWindow(g.npcs[npcId]);
    if (win.entries.length === 0) return { ran: false, wrote: false };
    const result = await callChronicler(g, npcId, win);
    let wrote = false;
    if (result.ok && Object.keys(result.additions).length > 0) {
      const c = x5ProposalContext(g, [npcId]);
      const v = validateProposal({ memoryAdditions: result.additions }, c);
      if (v.valid) { await applyProposal({ memoryAdditions: result.additions }, c, g, null); wrote = true; }
      else return { ran: true, wrote: false, errors: v.errors };
    }
    g.npcs[npcId] = markProcessed(g.npcs[npcId], win.entries.length);
    return { ran: true, wrote, ok: result.ok, reason: result.reason };
  };
`);

const X5 = J('X5');
const MI = J('MEMORY_IMPORTANCE');
const TAGS = J(`Object.keys(EMOTIONAL_WEIGHTS).filter(t => t !== 'default')`);
const RUM = J('RUMINATION');

// ---------------------------------------------------------------------------
console.log('\nD5 — the writer no longer writes memory, and cannot');

check('the scene prompt no longer asks for memoryAdditions', api(`
  (() => {
    const ctxObj = { scene: { room: 'Kitchen', phase: 'evening', time: '20:00', day: 3, cleanliness: 60, signals: [] },
                     player: { mood: 0, energy: 80, hunger: 40 },
                     activeNpcs: [], ambientNpcs: [], worldEvents: [], contentConfig: null };
    return !/memoryAdditions/.test(buildScenePrompt(ctxObj, 'hello'));
  })()
`), 'the field it requests is the field it gets back');
check('and it says so in words, so the model is not left guessing', api(`
  (() => {
    const ctxObj = { scene: { room: 'Kitchen', phase: 'evening', time: '20:00', day: 3, cleanliness: 60, signals: [] },
                     player: { mood: 0, energy: 80, hunger: 40 },
                     activeNpcs: [], ambientNpcs: [], worldEvents: [], contentConfig: null };
    return /Do NOT decide what anyone remembers/.test(buildScenePrompt(ctxObj, 'hello'));
  })()
`));
check('the IM prompt no longer asks for it either', api(`
  (() => {
    const npc = __freshNpc('npc_a', 'Hana');
    npc.bible.speech = { textingStyle: 'lowercase', verbosity: 0.4, formality: 0.2 };
    return !/memoryAdditions/.test(buildImPrompt({ activeNpcs: [Object.assign({ id: 'npc_a', name: 'Hana' }, npc)], imThread: [], day: 3, contentConfig: null }, 'hey'));
  })()
`), 'IM is a chronicled surface too — the same buffer, the same wider window');
check('stripWriterJudgement now removes memoryAdditions alongside relationshipDeltas', api(`
  (() => {
    const s = stripWriterJudgement({ narration: 'n', memoryAdditions: { npc_a: { facts: ['x'] } },
                                     relationshipDeltas: { npc_a: { trust: 0.3 } } });
    return s.memoryAdditions === undefined && s.relationshipDeltas === undefined;
  })()
`), 'D5 lands on ingestion, not in the prompt — a prompt that stops asking is a request');

// ---------------------------------------------------------------------------
console.log('\nthe rubric carries its locked decisions');

const prompt = api(`
  (() => {
    const g = __mkState(2, {
      facts: [{ text: 'The player works nights at a bar', category: 'work', valid: true, factId: 1 }],
      grievances: [{ text: 'left the milk out', severity: 0.4, day: 2, resolved: false },
                   { text: 'already sorted', severity: 0.2, day: 1, resolved: true }],
    });
    g.npcs.npc_a = __turn(g.npcs.npc_a, 'i grew up in leeds', 'oh really?', 2);
    g.npcs.npc_a = __turn(g.npcs.npc_a, 'sorry about the milk', 'forget it', 2, 'im');
    return buildChroniclerPrompt(g.npcs.npc_a, 'npc_a', chroniclerWindow(g.npcs.npc_a));
  })()
`);

const zeroFirst = prompt.indexOf('MOST CONVERSATIONS TEACH NOBODY ANYTHING');
check('D8 — the nothing-to-record case is stated before what to record',
      zeroFirst > 0 && zeroFirst < prompt.indexOf('WHAT TO RECORD'),
      'an extractor that always finds something fills BELIEF.maxFacts with trivia in a week');
check('D8 — and the empty example is shown, not merely described',
      /"facts": \[\], "episodes": \[\], "grievances": \[\], "resolveGrievances": \[\]/.test(prompt));
check('D11 — the claim/truth distinction is stated with both sides written out',
      /ATTRIBUTED CLAIMS/.test(prompt) && /The player says they grew up in Leeds/.test(prompt) &&
      /not "The player grew up in Leeds"/.test(prompt),
      'flattening a claim to a fact lets the player lie once and have gossip propagate it as established');
check('D11 — and certainty is refused in words as well as by the clamp',
      /Never 1 — they were told, not shown/.test(prompt));
check(`D11 — the confidence ceiling shown is the one X5 owns (${X5.factConfidenceMax})`,
      prompt.includes(`0 to ${X5.factConfidenceMax}`),
      'read from the table so Phase 4 can retune it without this reporting a regression');
check(`D12 — the importance ceiling shown is the one X5 owns (${X5.factImportanceCeiling})`,
      prompt.includes(`0 to ${X5.factImportanceCeiling}`),
      'and it must stay strictly below MEMORY_IMPORTANCE.significant, which grants pinned');
check('D12 — MEMORY_IMPORTANCE.significant is never shown as a reachable value',
      !prompt.includes(String(MI.significant)),
      'showing the pinning threshold is how a model answers on it');
check('D13 — emotionalTag is required, not optional',
      /emotionalTag: REQUIRED/.test(prompt),
      'without it rumination\'s repetition rule cannot group anything');
check('D13 — and the vocabulary offered is EMOTIONAL_WEIGHTS\' own keys',
      TAGS.every(t => prompt.includes(t)) && !prompt.includes('emotionalTag: "default"'),
      'an invented tag normalises to empty, which costs the episode its meaning: ' + TAGS.join(', '));
check('D13 — participants are specified as exactly the pair the co-occurrence rule counts',
      /participants: exactly \["npc_a", "player"\]/.test(prompt),
      'applyCooccurrenceRule requires parts.length === 2 — a fallback of one or three never fires it');
check(`facts are capped at maxFactsPerWindow (${X5.maxFactsPerWindow}) in the prompt too`,
      prompt.includes(`at most ${X5.maxFactsPerWindow}`) && prompt.includes(`at most ${X5.maxEpisodesPerWindow}`));

console.log('\nthe window and what the NPC already knows reach the extractor');
check('the transcript is rendered, oldest first, with the player named',
      prompt.includes('Player: i grew up in leeds') && prompt.includes('Hana: oh really?'));
check('D24 — a text message is still marked as one (inherited from formatWindowTranscript)',
      prompt.includes('Player (text): sorry about the milk'));
check('what they already believe is shown so "nothing new" is expressible',
      /WHAT THEY ALREADY BELIEVE/.test(prompt) && prompt.includes('The player works nights at a bar'));
check('unresolved grievances are listed, resolved ones are not',
      prompt.includes('left the milk out') && !prompt.includes('already sorted'),
      'resolveGrievance matches on text, so the model has to be able to quote it');
check('an NPC with no facts and no grievances gets no empty headings', api(`
  (() => {
    const g = __mkState(2);
    g.npcs.npc_a = __turn(g.npcs.npc_a, 'hey', 'hi', 2);
    const p = buildChroniclerPrompt(g.npcs.npc_a, 'npc_a', chroniclerWindow(g.npcs.npc_a));
    return !/WHAT THEY ALREADY BELIEVE/.test(p) && !/UNRESOLVED GRIEVANCES/.test(p);
  })()
`));
check('an empty window still builds a prompt rather than throwing', api(`
  (() => typeof buildChroniclerPrompt(__mkState(9).npcs.npc_a, 'npc_a', chroniclerWindow(__mkState(9).npcs.npc_a)) === 'string')()
`));

// ---------------------------------------------------------------------------
const script = `
(async () => {
  const out = {};
  const mk = (opts) => {
    const g = __mkState(2, opts);
    g.npcs.npc_a = __turn(g.npcs.npc_a, 'i grew up in leeds', 'oh really?', 2);
    return g;
  };

  // Everything a generous extractor would claim: certainty, maximum
  // importance, a provenance it has no right to name, and a tag nobody weighs.
  const greedy = JSON.stringify({
    facts: [{ text: 'The player says they grew up in Leeds', category: 'history',
              confidence: 1.0, importance: 1.0, provenance: 'told_by:npc_b' },
            { text: 'The player hates their job', category: 'work' }],
    episodes: [{ text: 'They talked about where the player grew up', emotionalTag: 'warmth' }],
    grievances: [{ text: 'brought up the ex again', severity: 5 }],
    resolveGrievances: ['left the milk out'],
  });

  {
    const g = mk({ grievances: [{ text: 'left the milk out', severity: 0.4, day: 2, resolved: false }] });
    const r = await __withModel(greedy, () => __chroniclePass(g, 'npc_a'));
    out.greedy = {
      r,
      facts: g.npcs.npc_a.memory.facts,
      episodes: g.npcs.npc_a.memory.episodes,
      grievances: g.npcs.npc_a.relPlayer.grievances,
      recentLen: g.npcs.npc_a.memory.recent.length,
      reopened: chroniclerWindow(g.npcs.npc_a).entries.length,
      relUnmoved: JSON.stringify(g.npcs.npc_a.relPlayer.trust) === '0',
    };
    // A second pass over the same buffer must find nothing left to read.
    const r2 = await __withModel(greedy, () => __chroniclePass(g, 'npc_a'));
    out.greedy.secondRan = r2.ran;
    out.greedy.factsAfterSecond = g.npcs.npc_a.memory.facts.length;
  }

  // D25 — a fact this character already holds is dropped on ingestion, not
  // trusted to be omitted because the prompt asked.
  {
    const g = mk({ facts: [{ text: 'the player SAYS they grew up in leeds.', category: 'history', valid: true, factId: 1 }],
                   episodes: [{ day: 2, text: 'They talked about where the player grew up', decay: 1,
                                importance: 0.5, emotionalTag: 'warmth', participants: ['npc_a', 'player'] }] });
    await __withModel(greedy, () => __chroniclePass(g, 'npc_a'));
    out.dedupe = {
      factTexts: g.npcs.npc_a.memory.facts.map(f => f.text),
      episodeCount: g.npcs.npc_a.memory.episodes.length,
    };
  }

  // D14 — the failure ladder. Each one applies nothing and still marks.
  const failures = {};
  for (const [label, reply] of [['garbage', 'I cannot summarise this.'], ['empty', ''],
                                ['thrower', null]]) {
    const g = mk();
    const before = JSON.stringify({ f: g.npcs.npc_a.memory.facts, e: g.npcs.npc_a.memory.episodes });
    const r = await __withModel(reply === null ? () => { throw new Error('model exploded'); } : reply,
                                () => __chroniclePass(g, 'npc_a'));
    failures[label] = {
      ok: r.ok,
      inert: JSON.stringify({ f: g.npcs.npc_a.memory.facts, e: g.npcs.npc_a.memory.episodes }) === before,
      marked: chroniclerWindow(g.npcs.npc_a).entries.length === 0,
    };
  }
  out.failures = failures;

  // D8 — a well-formed reply that records nothing is a SUCCESS, not a failure.
  {
    const g = mk();
    const r = await __withModel('{"facts":[],"episodes":[],"grievances":[],"resolveGrievances":[]}',
                                () => __chroniclePass(g, 'npc_a'));
    out.nothingNew = { ok: r.ok, wrote: r.wrote, factCount: g.npcs.npc_a.memory.facts.length,
                       marked: chroniclerWindow(g.npcs.npc_a).entries.length === 0 };
  }

  // An NPC with nothing unread never reaches the model at all.
  out.emptyWindow = await callChronicler(mk(), 'npc_a', { entries: [] });
  out.noSuchNpc = await callChronicler(mk(), 'npc_zz', chroniclerWindow(mk().npcs.npc_a));

  // D5, end to end: a WRITING call that volunteers memoryAdditions writes none.
  {
    const h = SIM_generateHouse(20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [],
                        scene: { id: 4, roomId: h.player.location, shouted: [] } },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects, seed: h.seed };
    const id = Object.entries(g.npcs).filter(([, n]) => n.residency.status === 'resident').map(([k]) => k)[0];
    g.npcs[id].location = g.player.location;
    const name = g.npcs[id].bible.name || id;
    const context = assembleContext(g, { active: [id], ambient: [], engagement: {} });
    const factsBefore = g.npcs[id].memory.facts.length;
    const epsBefore = g.npcs[id].memory.episodes.length;
    const reply = JSON.stringify({
      narration: 'They look up from the counter.',
      dialogue: [{ speaker: name, text: 'hey, you' }],
      memoryAdditions: { [id]: { facts: [{ text: 'The player is a liar', importance: 1.0 }],
                                 episodes: [{ text: 'a thing happened' }],
                                 grievances: [{ text: 'invented grievance' }] } },
      moodDeltas: { [id]: 0.1 },
    });
    const result = await __withModel(reply, () => callLLM(context, 'say hi'));
    if (result.valid && result.proposal) await applyProposal(result.proposal, context, g, 'say hi');
    out.writerMemory = {
      valid: result.valid,
      hadAdditions: !!(result.proposal && result.proposal.memoryAdditions),
      factsUnchanged: g.npcs[id].memory.facts.length === factsBefore,
      episodesUnchanged: g.npcs[id].memory.episodes.length === epsBefore,
      grievanceCount: (g.npcs[id].relPlayer.grievances || []).length,
      moodMoved: g.npcs[id].mood !== 0,
      dialogueLanded: (g.npcs[id].memory.recent || []).some(e => e.text === 'hey, you'),
    };
  }

  return out;
})()
`;

api(script).then(out => {
  console.log('\nthe belief contract — what a model claims is not what it gets');
  const g = out.greedy;
  check('the pass ran and wrote', g.r.ran === true && g.r.wrote === true, JSON.stringify(g.r));
  check('both extracted facts landed', g.facts.length === 2, JSON.stringify(g.facts.map(f => f.text)));
  check('D11 — provenance is "witnessed", not the told_by the model named',
        g.facts.every(f => f.provenance === 'witnessed'),
        `got ${g.facts.map(f => f.provenance).join(', ')} — an extractor that names its own provenance can claim to have witnessed anything`);
  check('D11 — confidence is capped below certainty even against a claimed 1.0',
        g.facts.every(f => f.confidence <= X5.factConfidenceMax && f.confidence < 1),
        JSON.stringify(g.facts.map(f => f.confidence)));
  check(`D11 — an undeclared confidence lands on factConfidenceDefault (${X5.factConfidenceDefault}), which is RUMINATION.createThreshold`,
        g.facts.some(f => f.confidence === X5.factConfidenceDefault) &&
        X5.factConfidenceDefault === RUM.createThreshold,
        'that equality is what makes an unverified claim open-question eligible the moment it is written');
  check(`D12 — importance is capped at factImportanceCeiling (${X5.factImportanceCeiling})`,
        g.facts.every(f => f.importance <= X5.factImportanceCeiling), JSON.stringify(g.facts.map(f => f.importance)));
  check('D12 — the trap itself: no extracted fact is pinned',
        g.facts.every(f => f.pinned !== true),
        'pinned facts never evict, and Plan 4 measured every conversation fact pinning itself');
  check('every fact carries the day, so salience is not aged by the entire game',
        g.facts.every(f => f.day === 3), JSON.stringify(g.facts.map(f => f.day)));
  check('every fact satisfies the rest of Plan 4\'s belief record',
        g.facts.every(f => typeof f.salience === 'number' && f.salience >= 0 && f.salience <= 1 &&
                           typeof f.emotionalTag === 'string' && typeof f.category === 'string' &&
                           f.valid === true && f.factId != null),
        JSON.stringify(g.facts));
  check('D13 — the extracted episode carries participants AND emotionalTag',
        g.episodes.length === 1 && g.episodes[0].participants.length === 2 &&
        g.episodes[0].emotionalTag === 'warmth',
        JSON.stringify(g.episodes));
  check('a grievance severity of 5 is clamped into range',
        g.grievances.some(x => x.text === 'brought up the ex again' && x.severity >= 0 && x.severity <= 1),
        JSON.stringify(g.grievances));
  check('and a named grievance is actually resolved',
        g.grievances.some(x => x.text === 'left the milk out' && x.resolved === true),
        JSON.stringify(g.grievances));
  check('the Chronicler moves no relationship axis (that is the Assessor\'s job)',
        g.relUnmoved === true, 'two passes, two jobs — D1');
  check('extracting writes no new exchange into the buffer it just read', g.recentLen === 2,
        'applyProposal with no playerAction and no dialogue must not append');
  check('the window is closed the moment it has been read', g.reopened === 0);
  check('so a second pass finds nothing and writes nothing',
        g.secondRan === false && g.factsAfterSecond === 2,
        'a conversation extracted twice doubles every belief it produced');

  console.log('\nD25 — what they already believe is dropped on ingestion, not left to the prompt');
  check('a fact the NPC already holds is not recorded a second time',
        out.dedupe.factTexts.filter(t => /grew up in leeds/i.test(t)).length === 1,
        JSON.stringify(out.dedupe.factTexts) + ' — case and punctuation are folded, addMemoryFact does not dedupe at all');
  check('but a genuinely new fact in the same reply still lands',
        out.dedupe.factTexts.some(t => /hates their job/.test(t)), JSON.stringify(out.dedupe.factTexts));
  check('a repeated episode is dropped the same way',
        out.dedupe.episodeCount === 1, `${out.dedupe.episodeCount} episodes`);

  console.log('\nD14 — a failed pass is a no-op, and still marks');
  for (const [label, r] of Object.entries(out.failures)) {
    check(`${label}: ok:false, nothing written, window marked`,
          r.ok === false && r.inert === true && r.marked === true, JSON.stringify(r));
  }
  check('D8 — a well-formed reply recording nothing is a SUCCESS, not a failure',
        out.nothingNew.ok === true && out.nothingNew.wrote === false &&
        out.nothingNew.factCount === 0 && out.nothingNew.marked === true,
        JSON.stringify(out.nothingNew) + ' — conflating "nothing new" with "the call failed" hides every real failure');
  check('an empty window never reaches the model at all',
        out.emptyWindow.ok === false && out.emptyWindow.reason === 'empty window',
        'there is no model selection here — every pass is a full-price call');
  check('an NPC who no longer exists is a no-op, not a throw',
        out.noSuchNpc.ok === false,
        'someone can move out between the conversation and the rollover that reads it');

  console.log('\nD5 end to end — a writing call that volunteers memoryAdditions writes none');
  const w = out.writerMemory;
  check('the writing call still succeeds and still writes dialogue',
        w.valid === true && w.dialogueLanded === true, JSON.stringify(w));
  check('the proposal that reaches applyProposal carries NO memoryAdditions', w.hadAdditions === false);
  check('so no fact, episode or grievance the writer invented lands',
        w.factsUnchanged === true && w.episodesUnchanged === true && w.grievanceCount === 0,
        JSON.stringify(w) + ' — the model claimed importance 1.0, which would have pinned it forever');
  check('and mood still moves, so the pipeline really ran', w.moodMoved === true,
        'if this fails the test proved nothing — the call did not happen');

  // -------------------------------------------------------------------------
  // The measurement that justifies the plan. Everything above is a contract;
  // this is the outcome. Plan 4 measured a saturated 30-episode tier per
  // resident yielding 0 inferred facts and 0 open questions, because the
  // ambient writer supplied neither participants nor emotionalTag.
  return api(`
  (async () => {
    const out = {};
    // A character who cares about something, so an extracted claim in that
    // category clears RUMINATION.createInterestFloor. The interest name is
    // read back out and used as the fact's category — derived, not hardcoded,
    // so retuning TRANSMISSION's relevance bands cannot silently unhook this.
    const interest = { name: 'music', tags: ['guitar', 'gigs'] };
    const mkChronicled = async (withColdStartFields) => {
      const g = __mkState(2, { interests: [interest], openness: 0.6 });
      const day1 = withColdStartFields
        ? { facts: [{ text: 'The player says they used to play in a band', category: interest.name }],
            episodes: [{ text: 'They talked about the player\\'s old band', participants: ['npc_a', 'player'], emotionalTag: 'warmth' }] }
        // The ambient writer's shape, exactly: text and nothing else.
        : { facts: [{ text: 'The player says they used to play in a band', category: interest.name }],
            episodes: [{ text: 'They talked about the player\\'s old band' }] };
      const day2 = withColdStartFields
        ? { facts: [], episodes: [{ text: 'They sat up late talking about gigs', participants: ['npc_a', 'player'], emotionalTag: 'warmth' }] }
        : { facts: [], episodes: [{ text: 'They sat up late talking about gigs' }] };

      g.npcs.npc_a = __turn(g.npcs.npc_a, 'i used to play in a band', 'no way', 2);
      await __withModel(JSON.stringify(day1), () => __chroniclePass(g, 'npc_a'));
      g.meta.clock.day = 4;
      g.npcs.npc_a = __turn(g.npcs.npc_a, 'we played the old george', 'i know it', 3);
      await __withModel(JSON.stringify(day2), () => __chroniclePass(g, 'npc_a'));
      return g;
    };

    for (const [label, cold] of [['chronicled', true], ['fallbackFilled', false]]) {
      const g = await mkChronicled(cold);
      const before = {
        inferred: g.npcs.npc_a.memory.facts.filter(f => f.provenance === 'inferred').length,
        questions: (g.npcs.npc_a.memory.openQuestions || []).length,
      };
      // Two passes: the first mints the inferred fact, the second is what a
      // staggered resolveTick cadence would do next time round.
      for (let i = 0; i < 2; i++) {
        const r = ruminate(g.npcs.npc_a, g, 5);
        if (r) g.npcs.npc_a = r;
      }
      out[label] = {
        before,
        episodes: g.npcs.npc_a.memory.episodes.map(e => ({ day: e.day, p: e.participants, t: e.emotionalTag })),
        inferred: g.npcs.npc_a.memory.facts.filter(f => f.provenance === 'inferred').map(f => ({ text: f.text, cat: f.category, conf: f.confidence })),
        questions: (g.npcs.npc_a.memory.openQuestions || []).map(q => ({ topic: q.topic, factId: q.factId, curiosity: q.curiosity, targets: q.targets })),
        totalFacts: g.npcs.npc_a.memory.facts.length,
      };
    }

    // The real counterfactual: the AMBIENT writer, which is not this pass at
    // all. ui.js's advanceAndResolve calls addMemoryEpisode(npc, day, text,
    // importance) — four arguments, no fifth, no sixth — so nothing on the
    // way in can backfill what it never supplied. This is the measured
    // baseline the plan's Evidence records, reproduced exactly.
    {
      const g = __mkState(2, { interests: [interest], openness: 0.6 });
      g.npcs.npc_a = addMemoryEpisode(g.npcs.npc_a, 3, 'They talked about the player\\'s old band', MEMORY_IMPORTANCE.ambient);
      g.npcs.npc_a = addMemoryEpisode(g.npcs.npc_a, 4, 'They sat up late talking about gigs', MEMORY_IMPORTANCE.ambient);
      for (let i = 0; i < 2; i++) {
        const r = ruminate(g.npcs.npc_a, g, 5);
        if (r) g.npcs.npc_a = r;
      }
      out.ambientWriter = {
        episodes: g.npcs.npc_a.memory.episodes.map(e => ({ day: e.day, p: e.participants, t: e.emotionalTag })),
        inferred: g.npcs.npc_a.memory.facts.filter(f => f.provenance === 'inferred').length,
        questions: (g.npcs.npc_a.memory.openQuestions || []).length,
      };
    }
    return out;
  })()
  `);
}).then(m => {
  console.log('\nthe cold start, closed — rumination over what the Chronicler wrote');
  const c = m.chronicled;
  const a = m.ambientWriter;
  ctx.__t.m = m;

  check('both episodes were written with participants and a tag',
        c.episodes.length === 2 && c.episodes.every(e => (e.p || []).length === 2 && e.t === 'warmth'),
        JSON.stringify(c.episodes));
  check('and on two different days, so the co-occurrence rule has a pattern to see',
        new Set(c.episodes.map(e => e.day)).size === 2, JSON.stringify(c.episodes.map(e => e.day)));
  check('inferred facts go from 0 to non-zero',
        c.before.inferred === 0 && c.inferred.length > 0,
        JSON.stringify(c.inferred));
  check('the co-occurrence fact names the pair in prose a prompt can print',
        c.inferred.some(f => /spend time together/.test(f.text) && !/\bplayer\b(?! )/.test(f.text) && /the player/.test(f.text)),
        JSON.stringify(c.inferred.map(f => f.text)) + ' — "Hana and player" was the raw token leaking into a prompt');
  check('open questions go from 0 to non-zero',
        c.before.questions === 0 && c.questions.length > 0,
        JSON.stringify(c.questions) + ' — this is Plan 5\'s curiosity motivation, dead on arrival without it');
  check('every question points at a fact the NPC actually holds',
        c.questions.every(q => q.factId != null) && c.questions.length <= RUM.openQuestionCap,
        JSON.stringify(c.questions));
  // Found by reading the measurement output, not by an assertion failing.
  // ruminate hands each rule's OUTPUT to the next, so the lifecycle used to
  // receive a rebuilt record whose identity matched nothing in gameState.npcs
  // — leaving the NPC in their own target list. Unreachable until this phase
  // made both inference rules fire; Plan 5's D4 spends `targets` on who to go
  // and talk to, so an NPC listing themselves is someone crossing the room to
  // ask themselves a question.
  check('and nobody is a target for their own question',
        c.questions.every(q => !(q.targets || []).includes('Hana')),
        JSON.stringify(c.questions.map(q => q.targets)));

  console.log('\nthe counterfactual — the same two beats, written by the ambient writer');
  check('the ambient writer stores episodes with neither field',
        a.episodes.length === 2 && a.episodes.every(e => (e.p || []).length === 0 && !e.t),
        JSON.stringify(a.episodes) + ' — addMemoryEpisode(npc, day, text, importance), four arguments, as advanceAndResolve calls it');
  check('and mints NO inferred facts and NO open questions from them',
        a.inferred === 0 && a.questions === 0,
        JSON.stringify(a) + ' — this is the measured baseline: a saturated episode tier yielding 0 and 0');
  check('so the participants/tag pair is the whole difference, not the extractor\'s taste',
        c.inferred.length > a.inferred,
        `chronicled ${c.inferred.length} inferred vs ambient ${a.inferred}`);

  // The first version of the counterfactual above ran a tag-less, participant-
  // less reply through the Chronicler and expected zero. It got one, because
  // toProposalMemory backfills the [npc, player] pair whatever the model
  // omits (D13) — the assertion was wrong, not the code. That is worth an
  // assertion of its own: the co-occurrence rule survives a lazy extractor,
  // and only the repetition rule needs the model to name a real tag.
  const fb = m.fallbackFilled;
  check('a reply that omits participants still gets the pair, so co-occurrence still fires',
        fb.episodes.every(e => (e.p || []).length === 2) && fb.inferred.length > 0,
        JSON.stringify(fb.episodes));
  check('but its episodes carry no tag, so the repetition rule has nothing to group',
        fb.episodes.every(e => !e.t) && fb.inferred.every(f => !/keeps happening/.test(f.text)),
        JSON.stringify(fb.inferred.map(f => f.text)) + ' — this is why the prompt makes emotionalTag REQUIRED and offers the real vocabulary');
  check('and the chronicled run DOES fire the repetition rule, because its tags are real',
        c.inferred.some(f => /keeps happening/.test(f.text)),
        JSON.stringify(c.inferred.map(f => f.text)));

  // -------------------------------------------------------------------------
  console.log('\nD16 / R2 — none of this runs inside the tick');
  check('resolveBatch still runs with generateText rigged to throw', api(`
    (() => {
      const h = SIM_generateHouse(20260811, 3);
      const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                  player: h.player, npcs: h.npcs, world: h.world, objects: h.objects, seed: h.seed };
      const orig = root.generateText;
      root.generateText = () => { throw new Error('the tick called a model'); };
      try { resolveBatch(g, 48); } finally { root.generateText = orig; }
      return true;
    })()
  `), 'rumination runs in the tick; the pass that FEEDS it must not');
  check('x5.js is still pure — the phase boundary held through Phase 3',
        !/\basync\b|\bawait\b|generateText/.test(codeOf('x5.js')),
        'parsing, clamping, windowing, dedupe and ingestion are arithmetic over strings and state');
  check('the Chronicler call lives in llm.js, not x5.js',
        /async function callChronicler/.test(codeOf('llm.js')) && !/callChronicler/.test(codeOf('x5.js')));
  check('rumination.js is still model-free after the renderer change',
        !/\basync\b|\bawait\b|generateText/.test(codeOf('rumination.js')));

  // -------------------------------------------------------------------------
  console.log('\nthe triggers (D3/D6/D17) are wired where the plan says');
  const uiCode = codeOf('ui.js');
  check('the rollover sweep is called from processDayRollover', (() => {
    const body = uiCode.slice(uiCode.indexOf('async function processDayRollover'));
    return /chronicleDayRollover\(\)/.test(body.slice(0, body.indexOf('\n}')));
  })(), 'D3\'s primary trigger — rollover is already a wait, which is the exception D6 names');
  check('the sweep reads every NPC with anything unprocessed, not just the ones in the room',
        /function chronicleDayRollover[\s\S]*?Object\.keys\(currentGameState\.npcs/.test(uiCode),
        'an NPC the player texted and never saw still learned something');
  check('every conversation surface D17 names runs the early flush', (() => {
    const missing = [];
    if (!/chronicleIfFull/.test(uiCode.slice(uiCode.indexOf('async function doPlayerAction'), uiCode.indexOf('async function doLookAround')))) missing.push('doPlayerAction');
    if (!/chronicleIfFull/.test(uiCode.slice(uiCode.indexOf('async function doConvSend'), uiCode.indexOf('function doConvLeave')))) missing.push('doConvSend');
    if (!/chronicleIfFull/.test(codeOf('ui.computer.js'))) missing.push('doImSend');
    if (!/chronicleIfFull/.test(codeOf('ui.phone.js'))) missing.push('doPhoneCameraShare');
    ctx.__t.missing = missing;
    return missing.length === 0;
  })(), 'missing: ' + (ctx.__t.missing || []).join(', '));
  check('the early flush runs AFTER the response has rendered (D6)', (() => {
    const body = uiCode.slice(uiCode.indexOf('async function doPlayerAction'), uiCode.indexOf('async function doLookAround'));
    return body.indexOf('render(currentGameState') < body.indexOf('chronicleIfFull');
  })(), 'the player never waits on an extraction before seeing what they did');
  check('two passes cannot overlap',
        /chroniclerInFlight/.test(uiCode) && /if \(!currentGameState \|\| chroniclerInFlight\) return false/.test(uiCode),
        'the second would mark entries the first is still reading, and the conversation would extract twice');
  check('the Chronicler has its OWN in-flight flag, separate from the Assessor\'s',
        /let chroniclerInFlight/.test(uiCode) && /let assessorInFlight/.test(uiCode),
        'one shared flag would let either pass block the other for a full-price call\'s duration');
  check('the pass re-reads the NPC from state before marking',
        /const after = currentGameState\.npcs\[npcId\];[\s\S]{0,120}markProcessed\(after/.test(uiCode),
        'applyProposal replaces the record — marking the pre-call reference would silently discard everything it just wrote');
  // Phase 2's browser-only bug, generalised: a judging function that names the
  // browser global gets `window.entries === undefined` and becomes a no-op
  // that still marks the buffer. Invisible from the outside.
  const fnBody = (code, name) => {
    const start = code.indexOf(`function ${name}(`);
    if (start < 0) return '';
    const end = code.indexOf('\n}', start);
    return end < 0 ? code.slice(start) : code.slice(start, end + 2);
  };
  check('the Chronicler\'s UI functions never name the browser global `window`',
        ['runChroniclerPass', 'chronicleIfFull', 'chronicleDayRollover'].every(n => {
          const body = fnBody(uiCode, n);
          return body.length > 0 && !/\bwindow\b/.test(body);
        }),
        'the Phase 2 version of this bug made every Assessor pass a silent no-op that still marked the buffer');

  console.log('\nwiring (README rule 4 — a floor, never an equality)');
  const mainHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const ver = (f) => { const m = mainHtml.match(new RegExp(`srcfiles/${f.replace(/\./g, '\\.')}\\?v=(\\d+)`)); return m ? +m[1] : -1; };
  for (const [f, floor] of [['llm.js', 21], ['x5.js', 3], ['ui.js', 59], ['ui.computer.js', 30],
                            ['ui.phone.js', 10], ['rumination.js', 3]]) {
    check(`${f} version is at or above the Phase 3 floor (${floor})`, ver(f) >= floor, `got ${ver(f)}`);
  }

  console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
