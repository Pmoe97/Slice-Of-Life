// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 3: the
// Notice & Opinion layer (D8–D13), verified end-to-end on its first
// subject, a skill level-up.
//
//   node src/src/dev/verify/verify-acc-p3.js
//
// Node coverage for everything pure in this phase: notice.js registered in
// both load lists with its subject-kind list, personality table, craft-noun
// table (one row per SKILL_IDS entry) and wording table (every band);
// SIGNAL_DEFS.craft_moment as a transient sight signal with prose per band;
// the seeded scenario the plan names — NPC A awake in the room, NPC B in a
// doored room, NPC C asleep in the room; the player crosses `music` 0→1
// through the REAL ADD_SKILL_XP effect path (EFFECTS' applyAddSkillXp →
// SKILLS' awardSkillXp → NOTICE's noticeSubject → SIGNALS' emitTransient /
// perceiveSignals → NPC's addMemoryFact) → A holds exactly one `opinion`
// fact with the plan's record shape, B and C hold none, the transient
// signal is in world.signals with the subject's sourceId; opinionValence is
// deterministic across two houses on the same seed, differs for a
// "critical" vs a "warm" personality in the direction the table promises,
// and moves with quality (level 1 vs level 8); re-noticing is a no-op and
// the next level is a new subject; one transmission event A→B through the
// gossip path's two halves (pickFactsToRaise → receiveTransmittedFact) lands
// a provenance-tagged copy at B carrying kind/subject/valence verbatim at
// hop-attenuated confidence; the opinion's raise weight is |valence|
// (factEmotionalWeight → opinionRaiseWeight) so factRaiseScore > 0 and the
// fact IS a raise candidate; ruminate runs over both holders without
// touching the opinion; the prompt path (buildMemorySliceV2's facts window,
// derivePlayerModel, factTopicPhrase) reads the line unchanged; a save
// round-trip carries the fact byte-identical; the platform hook is a
// function returning [] and no field; the stealth award sites pass no
// gameState (unwitnessed by design); an unknown kind is refused. The
// persona prompt itself (llm.js rendering [Memories — facts]) is exercised
// through buildMemorySliceV2, its data half; nothing here reaches a model
// (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'npc.js', 'notice.js', 'rumination.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    return { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  // The plan's scenario: A awake in the player's room, B awake behind a
  // bedroom door, C asleep in the player's room. Returns the three ids.
  __scenario = (g) => {
    const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
    const [A, B, C] = ids;
    g.player.location = 'living_room';
    g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'idle';
    g.npcs[B].location = 'bedroom_1';   g.npcs[B].activity = 'idle';
    g.npcs[C].location = 'living_room'; g.npcs[C].activity = 'sleeping';
    // Full energy so attention is not the thing under test here.
    for (const id of ids) g.npcs[id].needs.energy = 80;
    return { A, B, C };
  };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion');
  // The REAL award path: EFFECTS' applier over a parsed ADD_SKILL_XP line,
  // exactly as a hobby action's def.skill append reaches it.
  __award = (g, skillId, xp) => {
    const ctx = buildEffectContext(g, [], [], {}, []);
    return applyEffects(parseEffectDSL('ADD_SKILL_XP ' + skillId + ' ' + xp), ctx);
  };
  // Synthetic personalities over a real NPC record (so relPlayer/needs/
  // memory are real) — the plan's "critical vs warm".
  __persona = (npc, temperament, traits) => ({ ...npc, bible: { ...npc.bible, temperament: { ...npc.bible.temperament, ...temperament }, personality: { ...npc.bible.personality, traits, coreTrait: traits[0] } } });
  __CRITICAL = { warmth: -0.8, conscientiousness: 0.8, openness: 0, volatility: 0 };
  __WARM = { warmth: 0.8, conscientiousness: 0, openness: 0.5, volatility: 0 };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — notice.js in both load lists, its tables, the craft_moment signal (D9/D10/D56). ${loaded.length} engine files loaded.`);
check("notice.js loaded through loadgame.js's ORDER", loaded.includes('notice.js'));
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
const npcIdx = indexHtml.indexOf('srcfiles/npc.js?'), noticeIdx = indexHtml.indexOf('srcfiles/notice.js?'), sigIdx = indexHtml.indexOf('srcfiles/signals.js?'), skillsIdx = indexHtml.indexOf('srcfiles/skills.js?');
check('index.html loads notice.js after npc.js, signals.js and skills.js (D56)', noticeIdx > 0 && noticeIdx > npcIdx && noticeIdx > sigIdx && noticeIdx > skillsIdx, JSON.stringify({ npcIdx, sigIdx, skillsIdx, noticeIdx }));
const reg = J(`({
  kinds: NOTICE_KINDS,
  tableKeys: Object.keys(OPINION_PERSONALITY),
  biasKeys: Object.keys(OPINION_PERSONALITY.bias), sensKeys: Object.keys(OPINION_PERSONALITY.sensitivity), traitKeys: Object.keys(OPINION_PERSONALITY.traits),
  nounsCoverSkills: SKILL_IDS.every(id => SKILL_CRAFT_NOUNS[id] && SKILL_CRAFT_NOUNS[id].noun && SKILL_CRAFT_NOUNS[id].category),
  bands: OPINION_BANDS.map(b => b.name),
  linesBands: Object.keys(OPINION_LINES.skill_levelup),
  linesNonEmpty: Object.values(OPINION_LINES.skill_levelup).every(p => Array.isArray(p) && p.length > 0 && p.every(l => /\\{craft\\}/.test(l))),
  sig: SIGNAL_DEFS.craft_moment,
  sigProse: ['faint', 'clear', 'strong'].every(b => Array.isArray(SIGNAL_DEFS.craft_moment.phrases[b]) && SIGNAL_DEFS.craft_moment.phrases[b].length > 0),
  platformHook: typeof platformPerceivers === 'function' ? platformPerceivers(__mk(1), { kind: 'chatter_post', ref: 'x' }) : 'missing',
  fnTypes: [typeof noticeSubject, typeof opinionValence, typeof opinionRaiseWeight, typeof noticeSubjectKey],
})`);
check('NOTICE_KINDS is the seven D9 subject kinds', JSON.stringify(reg.kinds) === JSON.stringify(['skill_levelup', 'work', 'room_design', 'chatter_post', 'chatter_private', 'subscription', 'aspiration']), JSON.stringify(reg.kinds));
check('OPINION_PERSONALITY reads temperament axes warmth/openness (bias) and conscientiousness/volatility (sensitivity), plus hard/soft/craft trait tags — the one table later phases share', JSON.stringify(reg.biasKeys) === JSON.stringify(['warmth', 'openness']) && JSON.stringify(reg.sensKeys) === JSON.stringify(['conscientiousness', 'volatility']) && JSON.stringify(reg.traitKeys) === JSON.stringify(['hard', 'soft', 'craft']), JSON.stringify([reg.biasKeys, reg.sensKeys, reg.traitKeys]));
check('SKILL_CRAFT_NOUNS has a noun + category for every SKILL_IDS entry (a level-up in any skill phrases)', reg.nounsCoverSkills === true);
check('five valence bands, and OPINION_LINES.skill_levelup has a non-empty {craft}-bearing pool for each', JSON.stringify(reg.bands) === JSON.stringify(['strong_pos', 'pos', 'neutral', 'neg', 'strong_neg']) && JSON.stringify(reg.linesBands) === JSON.stringify(reg.bands) && reg.linesNonEmpty === true, JSON.stringify([reg.bands, reg.linesBands, reg.linesNonEmpty]));
check("SIGNAL_DEFS.craft_moment is a transient sight signal (decayPerTick set) with prose for every band — verify-s1/s2/s3's invariants hold", reg.sig && reg.sig.channel === 'sight' && reg.sig.decayPerTick > 0 && reg.sigProse === true, JSON.stringify(reg.sig));
check('platformPerceivers is a function returning [] (invariant 6 — no stored list until Phase 10 reads one)', Array.isArray(reg.platformHook) && reg.platformHook.length === 0 && JSON.stringify(reg.fnTypes) === JSON.stringify(['function', 'function', 'function', 'function']), JSON.stringify([reg.platformHook, reg.fnTypes]));

// ---------------------------------------------------------------- 1
console.log("\n1. The plan's scenario — A in the room, B behind a door, C asleep; the player crosses music 0→1 through the real ADD_SKILL_XP path (D8/D10/D11)");
const sc = J(`(() => {
  const g = __mk(3);
  const { A, B, C } = __scenario(g);
  g.player.skills = { music: 39 };
  const contractorBefore = (g.npcs.contractor && g.npcs.contractor.memory.facts.length) || 0;
  const res = __award(g, 'music', 1);
  const a = __opinions(g.npcs[A]);
  const f = a[0];
  return {
    level: skillLevel(g.player, 'music'),
    applied: (res && res.applied || []).map(x => x.type),
    aCount: a.length, bCount: __opinions(g.npcs[B]).length, cCount: __opinions(g.npcs[C]).length,
    contractorMoved: ((g.npcs.contractor && g.npcs.contractor.memory.facts.length) || 0) !== contractorBefore,
    fact: f && { kind: f.kind, subject: f.subject, valence: f.valence, text: f.text, day: f.day, category: f.category, importance: f.importance, provenance: f.provenance, confidence: f.confidence, pinned: f.pinned, valid: f.valid, hasFactId: f.factId != null, emotionalTag: f.emotionalTag },
    expectedValence: f && Math.round(opinionValence(g.npcs[A], { kind: 'skill_levelup', ref: 'music', day: 3, meta: { from: 0, to: 1 } }, g) * 100) / 100,
    band: f && opinionBand(f.valence),
    signal: (g.world.signals || []).find(s => s.id === 'craft_moment'),
    aTemper: g.npcs[A].bible.temperament, aTraits: g.npcs[A].bible.personality.traits,
    mood: g.player.moodEvents && g.player.moodEvents.length,
  };
})()`);
check('the award crossed music 0→1 through applyEffects (ADD_SKILL_XP applied)', sc.level === 1 && sc.applied.includes('ADD_SKILL_XP'), JSON.stringify([sc.level, sc.applied]));
check('A (awake, in the room) holds exactly one opinion fact; B (behind a door) and C (asleep in the room) hold none; the contractor is untouched', sc.aCount === 1 && sc.bCount === 0 && sc.cCount === 0 && sc.contractorMoved === false, JSON.stringify([sc.aCount, sc.bCount, sc.cCount, sc.contractorMoved]));
check("the fact has the D11 shape: kind 'opinion', subject { kind, ref, key 'skill_levelup:music:1' }, valence in [-1, 1], provenance 'witnessed', confidence 1, a factId, category 'music', importance in [social, conversational), not pinned",
  sc.fact && sc.fact.kind === 'opinion' && sc.fact.subject.kind === 'skill_levelup' && sc.fact.subject.ref === 'music' && sc.fact.subject.key === 'skill_levelup:music:1'
  && sc.fact.valence >= -1 && sc.fact.valence <= 1 && sc.fact.provenance === 'witnessed' && sc.fact.confidence === 1 && sc.fact.hasFactId
  && sc.fact.category === 'music' && sc.fact.importance >= 0.3 && sc.fact.importance <= 0.5 && sc.fact.pinned === false && sc.fact.valid === true && sc.fact.day === 3,
  JSON.stringify(sc.fact));
check("the fact's valence is exactly what opinionValence returns for A on that subject (the record is the decision, D12)", sc.fact && sc.fact.valence === sc.expectedValence, JSON.stringify([sc.fact && sc.fact.valence, sc.expectedValence]));
check("the fact's text is the wording table's line for that band, with the craft noun substituted (D13)", sc.fact && /guitar playing/.test(sc.fact.text) && !/\{craft\}/.test(sc.fact.text) && J(`OPINION_LINES.skill_levelup['${sc.band}'].map(l => l.replace(/\{craft\}/g, 'guitar playing'))`).includes(sc.fact.text), JSON.stringify([sc.band, sc.fact && sc.fact.text]));
check("the transient craft_moment signal was emitted into the player's room with the subject's sourceId (D10 — perception went through SIGNALS)", sc.signal && sc.signal.roomId === 'living_room' && sc.signal.sourceId === 'notice:skill_levelup:music:1' && sc.signal.intensity === 0.9, JSON.stringify(sc.signal));

// ---------------------------------------------------------------- 2
console.log('\n2. Determinism and personality (D12) — same seed twice, critical vs warm, quality moves it');
const det = J(`(() => {
  const g1 = __mk(3), g2 = __mk(3);
  const s1 = __scenario(g1), s2 = __scenario(g2);
  g1.player.skills = { music: 39 }; g2.player.skills = { music: 39 };
  __award(g1, 'music', 1); __award(g2, 'music', 1);
  const v1 = __opinions(g1.npcs[s1.A])[0].valence, v2 = __opinions(g2.npcs[s2.A])[0].valence;
  const t1 = __opinions(g1.npcs[s1.A])[0].text, t2 = __opinions(g2.npcs[s2.A])[0].text;
  // Critical vs warm over the SAME record and subject.
  const g = __mk(4); const { A } = __scenario(g);
  const base = g.npcs[A];
  const subjL1 = { kind: 'skill_levelup', ref: 'music', day: 3, meta: { from: 0, to: 1 } };
  const subjL8 = { kind: 'skill_levelup', ref: 'music', day: 3, meta: { from: 7, to: 8 } };
  const critical = __persona(base, __CRITICAL, ['cynical', 'blunt', 'perfectionist']);
  const warm = __persona(base, __WARM, ['warm', 'nurturing', 'generous']);
  const creative = __persona(base, { warmth: 0, conscientiousness: 0, openness: 0, volatility: 0 }, ['creative']);
  const plain = __persona(base, { warmth: 0, conscientiousness: 0, openness: 0, volatility: 0 }, []);
  const vc1 = opinionValence(critical, subjL1, g), vw1 = opinionValence(warm, subjL1, g);
  const vc8 = opinionValence(critical, subjL8, g), vw8 = opinionValence(warm, subjL8, g);
  const vcr = opinionValence(creative, subjL1, g), vpl = opinionValence(plain, subjL1, g);
  // Relationship bias: the same plain persona at high affection vs high tension.
  const liked = { ...plain, relPlayer: { ...plain.relPlayer, affection: 0.9, tension: 0, respect: 0.8 } };
  const resented = { ...plain, relPlayer: { ...plain.relPlayer, affection: 0, tension: 0.9, respect: 0 } };
  const vlik = opinionValence(liked, subjL1, g), vres = opinionValence(resented, subjL1, g);
  // Seed sensitivity: a different world seed moves the jitter only.
  const gOther = { ...g, meta: { ...g.meta, seed: 777 } };
  const vOther = opinionValence(plain, subjL1, gOther);
  // Same-seed call stability.
  const again = opinionValence(critical, subjL1, g);
  return { v1, v2, t1, t2, vc1, vw1, vc8, vw8, vcr, vpl, vlik, vres, vOther, again, jitter: OPINION_PERSONALITY.jitter, bands: { c1: opinionBand(vc1), w1: opinionBand(vw1), c8: opinionBand(vc8), w8: opinionBand(vw8) } };
})()`);
check('two houses on the same seed give byte-identical valence and text for A', det.v1 === det.v2 && det.t1 === det.t2, JSON.stringify([det.v1, det.v2, det.t1, det.t2]));
check('opinionValence is stable across calls (pure, seeded)', det.vc1 === det.again);
check("a 'critical' persona (warmth −0.8, conscientious, cynical/blunt/perfectionist) reads a level-1 crossing negative; a 'warm' one (warmth 0.8, warm/nurturing/generous) reads it positive", det.vc1 < 0 && det.vw1 > 0 && det.bands.c1 !== det.bands.w1, JSON.stringify([det.vc1, det.vw1, det.bands]));
check('quality moves valence: a level-8 crossing reads higher than a level-1 crossing for BOTH personas, and the critic still rates level 8 below the warm one', det.vc8 > det.vc1 && det.vw8 > det.vw1 && det.vc8 < det.vw8, JSON.stringify([det.vc1, det.vc8, det.vw1, det.vw8]));
check("a 'creative' tag adds craftStep on a craft subject over an otherwise identical plain persona (same jitter — same npc, same subject)", Math.abs((det.vcr - det.vpl) - 0.10) < 1e-9, JSON.stringify([det.vcr, det.vpl]));
check('relationship bias: liked (affection 0.9, respect 0.8) > resented (tension 0.9) for the same persona, by (0.9×0.2 + 0.8×0.1) − (−0.9×0.2) = 0.44', Math.abs((det.vlik - det.vres) - 0.44) < 1e-9, JSON.stringify([det.vlik, det.vres]));
check('a different world seed moves only the jitter (|Δ| ≤ 2 × jitter)', Math.abs(det.vOther - det.vpl) <= 2 * det.jitter + 1e-9, JSON.stringify([det.vOther, det.vpl, det.jitter]));

// ---------------------------------------------------------------- 3
console.log('\n3. One opinion per subject — re-noticing is a no-op, the next level is a new subject, XP without a crossing notices nothing');
const dedupe = J(`(() => {
  const g = __mk(5); const { A } = __scenario(g);
  g.player.skills = { music: 39 };
  __award(g, 'music', 1);                       // crosses 1
  const n1 = __opinions(g.npcs[A]).length;
  const r = noticeSubject(g, { kind: 'skill_levelup', ref: 'music', roomId: 'living_room', day: 3, meta: { from: 0, to: 1 } });
  const n2 = __opinions(g.npcs[A]).length;
  __award(g, 'music', 50);                      // 90 xp: still level 1
  const n3 = __opinions(g.npcs[A]).length;
  __award(g, 'music', 70);                      // 160 xp: level 2
  const ops = __opinions(g.npcs[A]);
  return { n1, n2, rePerceivers: r.perceivers.length, rKey: r.key, n3, n4: ops.length, keys: ops.map(f => f.subject.key), signals: (g.world.signals || []).filter(s => s.id === 'craft_moment').length };
})()`);
check('noticing the same subject again writes nothing (A already holds it) though the call still reports the key', dedupe.n1 === 1 && dedupe.n2 === 1 && dedupe.rePerceivers === 0 && dedupe.rKey === 'skill_levelup:music:1', JSON.stringify(dedupe));
check('XP that does not cross a level notices nothing; crossing 2 is a new subject (key :2) — two opinions held', dedupe.n3 === 1 && dedupe.n4 === 2 && JSON.stringify(dedupe.keys) === JSON.stringify(['skill_levelup:music:1', 'skill_levelup:music:2']), JSON.stringify(dedupe));

// ---------------------------------------------------------------- 4
console.log('\n4. Transmission A→B through the gossip path (D11) — pickFactsToRaise picks it, receiveTransmittedFact carries kind/subject/valence at hop confidence');
const tx = J(`(() => {
  const g = __mk(6); const { A, B } = __scenario(g);
  g.player.skills = { music: 39 };
  __award(g, 'music', 1);
  const fact = __opinions(g.npcs[A])[0];
  const weight = factEmotionalWeight(fact);
  const expectedWeight = EMOTIONAL_WEIGHTS.default + (EMOTIONAL_WEIGHTS.grievance - EMOTIONAL_WEIGHTS.default) * Math.abs(fact.valence);
  const score = factRaiseScore(fact, g.npcs[A], g.npcs[B], 3);
  // rng → 0 accepts every candidate whose score is > 0: is the opinion among them?
  const raised = pickFactsToRaise(g.npcs[A], g.npcs[B], TRANSMISSION.factsPerChat, 3, () => 0);
  const picked = raised.some(f => f.kind === 'opinion' && f.subject && f.subject.key === fact.subject.key);
  // The receiver-side write, exactly as drives.js's factTransfers apply it.
  g.npcs[B] = receiveTransmittedFact(g.npcs[B], fact, { kind: 'told', provenance: 'told_by:' + A, sourceId: A, day: 4 });
  const copy = __opinions(g.npcs[B])[0];
  // B now holds a secondhand opinion; B witnessing the same subject later forms no first-hand one.
  g.npcs[B].location = 'living_room';
  const r2 = noticeSubject(g, { kind: 'skill_levelup', ref: 'music', roomId: 'living_room', day: 5, meta: { from: 0, to: 1 } });
  // A second hop B→C keeps the shape and attenuates again.
  const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  const C = ids[2];
  g.npcs[C] = receiveTransmittedFact(g.npcs[C], copy, { kind: 'told', provenance: 'told_by:' + B, sourceId: B, day: 5 });
  const copy2 = __opinions(g.npcs[C])[0];
  return {
    weight, expectedWeight, weights01: [opinionRaiseWeight({ valence: 0 }), opinionRaiseWeight({ valence: 1 }), opinionRaiseWeight({ valence: -1 })],
    score, picked, raisedCount: raised.length,
    copy: copy && { kind: copy.kind, subject: copy.subject, valence: copy.valence, text: copy.text, provenance: copy.provenance, confidence: copy.confidence, day: copy.day, category: copy.category, importance: copy.importance },
    original: { valence: fact.valence, text: fact.text, importance: fact.importance },
    bOpinions: __opinions(g.npcs[B]).length, r2Perceivers: r2.perceivers.map(p => p.npcId),
    copy2: copy2 && { provenance: copy2.provenance, confidence: copy2.confidence, valence: copy2.valence, key: copy2.subject.key },
    hop: BELIEF.hopAttenuation,
  };
})()`);
check("factEmotionalWeight of the opinion is |valence|-derived (default + |v| × (grievance − default)); |v| 0 → 0.3, |v| 1 → 0.9", Math.abs(tx.weight - tx.expectedWeight) < 1e-9 && tx.weights01.every((w, i) => Math.abs(w - [0.3, 0.9, 0.9][i]) < 1e-9), JSON.stringify([tx.weight, tx.expectedWeight, tx.weights01]));
check('factRaiseScore > 0 and pickFactsToRaise (rng 0) picks the opinion — it is a raise candidate in the real gossip path', tx.score > 0 && tx.picked === true, JSON.stringify([tx.score, tx.picked, tx.raisedCount]));
check(`B's copy: provenance told_by:A, confidence ${tx.hop}, kind/subject/valence/text/category verbatim, day 4`, tx.copy && tx.copy.provenance.startsWith('told_by:npc_') && tx.copy.confidence === tx.hop && tx.copy.kind === 'opinion' && tx.copy.subject.key === 'skill_levelup:music:1' && tx.copy.valence === tx.original.valence && tx.copy.text === tx.original.text && tx.copy.category === 'music' && tx.copy.day === 4, JSON.stringify(tx.copy));
check('B, holding the secondhand opinion, forms no first-hand one on witnessing the same subject (one opinion per subject per NPC)', tx.bOpinions === 1 && tx.r2Perceivers.length === 0, JSON.stringify([tx.bOpinions, tx.r2Perceivers]));
check(`a second hop B→C attenuates again (${tx.hop}² = ${Math.round(tx.hop * tx.hop * 1000) / 1000}) and keeps the key and valence`, tx.copy2 && Math.abs(tx.copy2.confidence - tx.hop * tx.hop) < 1e-9 && tx.copy2.valence === tx.original.valence && tx.copy2.key === 'skill_levelup:music:1', JSON.stringify(tx.copy2));

// ---------------------------------------------------------------- 5
console.log('\n5. ruminate and the prompt path — the opinion survives rumination, reaches the facts window and the player model, and phrases as a topic');
const rum = J(`(() => {
  const g = __mk(7); const { A, B } = __scenario(g);
  g.player.skills = { music: 39 };
  __award(g, 'music', 1);
  const fact = __opinions(g.npcs[A])[0];
  g.npcs[B] = receiveTransmittedFact(g.npcs[B], fact, { kind: 'told', provenance: 'told_by:' + A, sourceId: A, day: 4 });
  const rA = ruminate(g.npcs[A], g, 5);
  const rB = ruminate(g.npcs[B], g, 5);
  const afterA = rA || g.npcs[A], afterB = rB || g.npcs[B];
  const sliceA = buildMemorySliceV2(afterA, null, 'chat', 5);
  const pmA = derivePlayerModel(afterA), pmB = derivePlayerModel(afterB);
  return {
    rAType: rA === null ? 'null' : typeof rA, rBType: rB === null ? 'null' : typeof rB,
    aStill: __opinions(afterA).length, bStill: __opinions(afterB).length,
    aQuestions: (afterA.memory.openQuestions || []).length, bQuestions: (afterB.memory.openQuestions || []).length,
    inWindow: sliceA.facts.includes(fact.text), windowLen: sliceA.facts.length,
    observes: pmA.observes.map(o => o.text), derives: pmB.derivesFrom.map(o => [o.text, o.provenance.startsWith('told_by:')]),
    topic: factTopicPhrase(fact.text), text: fact.text,
  };
})()`);
check('ruminate runs over both holders (null or a rebuilt npc) and the opinion is still held afterward', ['null', 'object'].includes(rum.rAType) && ['null', 'object'].includes(rum.rBType) && rum.aStill === 1 && rum.bStill === 1, JSON.stringify(rum));
check("the witnessed opinion (confidence 1) and the told_by copy (0.8, above RUMINATION.createThreshold 0.6) open no question — an opinion is a belief, not a mystery", rum.aQuestions === 0 && rum.bQuestions === 0, JSON.stringify([rum.aQuestions, rum.bQuestions]));
check("buildMemorySliceV2's [Memories — facts] window carries the opinion line for A (the persona prompt's data half, D13)", rum.inWindow === true, JSON.stringify([rum.windowLen, rum.text]));
check("derivePlayerModel: A `observes` it first-hand; B `derivesFrom` it secondhand (the 'the player' match works on the claim-style text)", rum.observes.includes(rum.text) && rum.derives.some(([t, told]) => t === rum.text && told === true), JSON.stringify([rum.observes, rum.derives]));
check("factTopicPhrase strips 'the player's' and yields a readable chat topic", rum.topic.length > 0 && !/^the player/.test(rum.topic) && /guitar|working|playing/.test(rum.topic), JSON.stringify(rum.topic));

// ---------------------------------------------------------------- 6
console.log('\n6. Save round-trip — the opinion fact rides the npcs folder (captureSavePayload → JSON) byte-identical; no new persisted field');
const persist = J(`(() => {
  const g = __mk(8); const { A } = __scenario(g);
  g.player.skills = { music: 39 };
  __award(g, 'music', 1);
  const live = __opinions(g.npcs[A])[0];
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const saved = rt.npcs && rt.npcs[A] && __opinions(rt.npcs[A])[0];
  return { same: JSON.stringify(saved) === JSON.stringify(live), saved: saved && { kind: saved.kind, key: saved.subject.key, valence: saved.valence }, worldKeys: SAVE_KEYS.find(e => e.folder === 'world').keys.filter(k => /opinion|notice/.test(k)) };
})()`);
check('the saved NPC record carries the opinion fact exactly as the live one (kind/subject/valence/text/provenance)', persist.same === true && persist.saved && persist.saved.kind === 'opinion', JSON.stringify(persist));
check('no opinion/notice key was added to SAVE_KEYS (opinions live on the fact store, invariant 4)', Array.isArray(persist.worldKeys) && persist.worldKeys.length === 0, JSON.stringify(persist.worldKeys));

// ---------------------------------------------------------------- 7
console.log('\n7. Edges — unknown kind refused, no room / nobody present, the stealth sites pass no gameState, callers without gameState are unchanged');
const edge = J(`(() => {
  const g = __mk(9); const { A } = __scenario(g);
  const warnings = [];
  const origWarn = console.warn; console.warn = (...a) => warnings.push(a.join(' '));
  const bad = noticeSubject(g, { kind: 'vibe', ref: 'x', roomId: 'living_room', day: 3 });
  console.warn = origWarn;
  const noRoom = noticeSubject(g, { kind: 'skill_levelup', ref: 'art', day: 3, meta: { to: 1 } });
  // Nobody present: move everyone away and cross a level.
  for (const id of Object.keys(g.npcs)) if (g.npcs[id].location) g.npcs[id].location = 'bedroom_2';
  g.player.skills = { art: 39 };
  __award(g, 'art', 1);
  const alone = Object.keys(g.npcs).map(id => __opinions(g.npcs[id]).length);
  // awardSkillXp with no gameState: the pre-Phase-3 contract, untouched.
  const g2 = __mk(9); const s2 = __scenario(g2);
  g2.player.skills = { music: 39 };
  awardSkillXp(g2.player, 'music', 1, 3);
  return { bad, warned: warnings.some(w => /noticeSubject/.test(w)), badFacts: __opinions(g.npcs[A]).length, noRoom, alone, plainCall: { level: skillLevel(g2.player, 'music'), opinions: __opinions(g2.npcs[s2.A]).length, mood: (g2.player.moodEvents || []).length > 0 } };
})()`);
check("an unknown kind is refused with a console.warn and { key: null, perceivers: [] }; nothing written", edge.bad.key === null && edge.bad.perceivers.length === 0 && edge.warned === true && edge.badFacts === 0, JSON.stringify(edge.bad));
check('a subject with no roomId has no in-room perceivers (and the platform hook is empty)', edge.noRoom.perceivers.length === 0 && edge.noRoom.key === 'skill_levelup:art:1', JSON.stringify(edge.noRoom));
check('nobody in reach → no opinions anywhere', edge.alone.every(n => n === 0), JSON.stringify(edge.alone));
check('awardSkillXp without gameState still levels and fires the mood impulse, and notices nothing (existing callers unchanged)', edge.plainCall.level === 1 && edge.plainCall.opinions === 0 && edge.plainCall.mood === true, JSON.stringify(edge.plainCall));
const srcFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const withGs = [], withoutGs = [];
for (const f of srcFiles) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of src.matchAll(/awardSkillXp\(([^;]*?)\);/g)) {
    const args = m[1];
    const isStealth = /'stealth'/.test(args);
    const passesGs = /,\s*(gameState|ctx\.gameState|gs)\s*\)?\s*$/.test(args.trim());
    (passesGs ? withGs : withoutGs).push(`${f}: ${isStealth ? 'stealth' : 'craft'}`);
  }
}
check('every stealth award site passes NO gameState (unwitnessed by design) and every craft site (effects/classes/puzzles) passes one', withoutGs.every(s => /stealth/.test(s)) && withGs.length === 3 && withGs.every(s => /craft/.test(s)), JSON.stringify({ withGs, withoutGs }));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
