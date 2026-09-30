// Conversation consequences: what the two judging passes do to a save over time.
//
// A TUNING INSTRUMENT, not a test — it prints, it does not assert.
// verify-x1/x2/x3 own the invariants; this owns the numbers, and it is where
// every figure in plan-x5's Phase 4 Handoff came from.
//
//   node dev/verify/measure-x5.js
//
// WHY THIS EXISTS. D8 names the way this plan fails silently: a judge with a
// small optimistic bias, multiplied by every window in a long game, is
// monotonic relationship inflation that looks alive and is a straight line.
// Nothing in the game pulls a relationship back down — there is no decay on
// relPlayer anywhere (grep it) — so every point a biased judge awards is
// permanent. That makes the drift rate the single most important number in the
// X5 table, and it cannot be read off the constants: it depends on how many
// WINDOWS a day of play produces, which is a property of the trigger logic.
//
// Five readings:
//   1. Drift. Six judge profiles replayed through the real wire — string ->
//      parseAssessorReply -> toProposalDeltas -> validateProposal ->
//      applyProposal — and where the axes land after 20, 50 and 200 windows.
//   2. The tolerance sweep. For a judge that awards exactly +k every window,
//      how many windows until each conversationPhase threshold falls. This is
//      the statement of what deltaClamp/deltaDivisor actually buys.
//   3. Windows per in-game day, through the REAL trigger logic (assessorWindow
//      and its `full` flag, markAssessed, chroniclerWindow). Converts a window
//      count into days, which is what sections 1-2 are read against.
//   4. Fact accumulation. Four extractor profiles against BELIEF.maxFacts, and
//      what a conversation fact scores when the tier has to evict something.
//   5. Near-duplicate blindness. D25 dedupes on exact text with case and
//      punctuation folded; this is how much of a real paraphrase corpus that
//      catches, and it is the number the Phase 3 Handoff asked for.
//
// HOW THE JUDGES WORK. Each profile emits a JSON STRING, not an object, and it
// goes through the same parser the model's reply does. A profile that produced
// deltas directly would measure arithmetic this instrument does not own.
//
// TRAPS, all paid for once already:
//   * Every relationship axis generates at 0 and NEVER moves without player
//     conversation. A drift reading that forgets to drive windows through
//     applyProposal reads a flat 0 and looks like a judge behaving perfectly.
//   * resolveBatch does not write episodes; UI's advanceAndResolve does. Do not
//     try to measure memory occupancy off a tick loop — that is section 4's
//     whole reason for driving applyProposal by hand.
//   * Every constant below is READ from the table that owns it (README rule 5).
//     Phase 4 retunes X5, and an instrument with its own copy of a number is an
//     instrument that reports the retune as a finding.

const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'npc.js', 'x5.js'] });

const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
// applyProposal is async, so every reading that drives real ingestion has to
// come back through a promise. The vm-side script stringifies its own result:
// handing a raw cross-realm object back to Node works, but JSON is the shape
// every other harness here already uses and it cannot surprise anyone.
const JA = async (expr) => JSON.parse(await api(expr));
const X5 = J('X5');
const PHASE = J('PHASE_THRESHOLDS');
const BELIEF = J('BELIEF');
const MEM_IMP = J('MEMORY_IMPORTANCE');
const BUDGET = J('MEMORY_BUDGET');
const AXES = J('X5_AXES');

// Phase thresholds, weakest first, so every table below walks the same ladder.
const LADDER = Object.entries(PHASE).sort((a, b) => a[1] - b[1]);

api(`
  __freshNpc = (name) => ({
    bible: { name, speech: {}, temperament: { openness: 0.5 }, interests: [] },
    relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
                 conversationPhase: 'early', intimacyLevel: 0, grievances: [],
                 firstMetDay: 1, lastInteractionDay: 1 },
    memory: { facts: [], episodes: [], summary: '', recent: [], styleCounters: {},
              openQuestions: [], nextFactId: 1 },
    mood: 0, needs: {}, flags: {}, inventory: [],
  });
  __mkState = () => ({
    meta: { clock: { day: 3, minutes: 600 }, scene: { id: 1, roomId: 'kitchen', shouted: [] }, sessionLog: [] },
    player: { location: 'kitchen', money: 100, inventory: [], flags: {} },
    npcs: { npc_a: __freshNpc('Hana') },
    objects: {}, world: { castWeb: {}, computer: { apps: { im: { threads: {} } } } },
    seed: 1234,
  });

  // One conversational turn as applyProposal writes it: the player's line,
  // then the dialogue it provoked (Plan 0's D4 order). Four entries per two
  // turns is what makes X5.linesPerExchange the divisor it is.
  __turn = (npc, i, sceneId) => {
    let n = addRecentExchange(npc, 'player', 'player line ' + i, 'player_input', 3, 600 + i, 'scene', sceneId);
    return addRecentExchange(n, 'Hana', 'reply ' + i, 'dialogue', 3, 600 + i, 'scene', sceneId);
  };

  // A judge's reply, on the wire. Integers only (D7) — the profiles below hand
  // this whole numbers and it is serialised exactly as a model would.
  __reply = (axes) => JSON.stringify({ npc_a: axes });
`);

// --- The judge profiles ---------------------------------------------------
// Each takes a 0..1 random draw and returns an integer axis object. They are
// hypotheses about how a real judge misbehaves, not measurements of one — the
// model cannot be measured here, which is the whole reason Phase 1 made the
// non-model surface this large. What the instrument measures is what each
// hypothesis IMPLIES, given the wire and the trigger cadence the game has.
const C = X5.deltaClamp;
const PROFILES = {
  // D8's correct judge. The control: with this, nothing in the game moves a
  // relationship at all, which is the baseline every other row is read against.
  silent:    { note: 'all zeros, every window (D8 answered correctly)',
               f: () => ({}) },
  // Nearly right — finds a small something one window in ten.
  nudge:     { note: '+1 trust on 1 window in 10, else nothing',
               f: (r) => (r < 0.1 ? { trust: 1 } : {}) },
  // The named failure: a judge that always finds a little something.
  warm:      { note: '+1 trust and +1 comfort EVERY window',
               f: () => ({ trust: 1, comfort: 1 }) },
  // A judge that reads every conversation as basically pleasant.
  generous:  { note: '+2 trust, +1 affection, +1 comfort every window',
               f: () => ({ trust: 2, affection: 1, comfort: 1 }) },
  // The rubric's own bands at the rarity the rubric states, with conversations
  // that go badly included. The mixture is an ASSUMPTION and is printed as one.
  realistic: { note: '65% zero, 25% small(1-3), 8% notable(4-6), 2% strong(7+); 1 in 4 negative',
               f: (r, rng) => {
                 if (r < 0.65) return {};
                 const band = r < 0.90 ? [1, 3] : r < 0.98 ? [4, 6] : [7, C];
                 const mag = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
                 const neg = rng() < 0.25;
                 return neg
                   ? { trust: -mag, tension: Math.max(1, Math.round(mag * 0.8)) }
                   : { trust: mag, affection: Math.max(1, Math.round(mag * 0.6)),
                       comfort: Math.max(1, Math.round(mag * 0.4)) };
               } },
  // The hard bound: everything at the clamp, every window.
  ceiling:   { note: `every positive axis at deltaClamp (+${C}) every window`,
               f: () => Object.fromEntries(AXES.filter(a => a !== 'tension').map(a => [a, C])) },
};

const WINDOW_MARKS = [20, 50, 200];
const MAX_WINDOWS = Math.max(...WINDOW_MARKS);

// Replay `n` windows of one profile through the whole ingestion chain and
// return the relationship at each mark, plus the window each phase fell on.
function driftRun(name) {
  const prof = PROFILES[name];
  const rngSeed = 20260812;
  const replies = [];
  const rng = mulberry32Local(rngSeed);
  for (let i = 0; i < MAX_WINDOWS; i++) replies.push(prof.f(rng(), rng));
  return JA(`
    (async () => {
      const g = __mkState();
      const ctx = x5ProposalContext(g, ['npc_a']);
      const replies = ${JSON.stringify(replies)};
      const marks = {}, crossed = {};
      for (let i = 0; i < replies.length; i++) {
        const parsed = parseAssessorReply(__reply(replies[i]), { soleNpcId: 'npc_a' });
        if (parsed !== null) {
          const deltas = toProposalDeltas(parsed, ['npc_a']);
          if (Object.keys(deltas).length > 0) {
            const v = validateProposal({ relationshipDeltas: deltas }, ctx);
            if (v.valid) await applyProposal({ relationshipDeltas: deltas }, ctx, g, null);
          }
        }
        const rel = g.npcs.npc_a.relPlayer;
        for (const [phase, at] of ${JSON.stringify(LADDER)}) {
          if (crossed[phase] === undefined && rel.intimacyLevel >= at) crossed[phase] = i + 1;
        }
        if (${JSON.stringify(WINDOW_MARKS)}.includes(i + 1)) {
          marks[i + 1] = { intimacy: rel.intimacyLevel, phase: rel.conversationPhase,
                           trust: +rel.trust.toFixed(3), affection: +rel.affection.toFixed(3),
                           comfort: +rel.comfort.toFixed(3), tension: +rel.tension.toFixed(3) };
        }
      }
      return JSON.stringify({ marks, crossed });
    })()
  `);
}

// The instrument's own PRNG. Deliberately NOT the engine's mulberry32: the
// profiles are built in Node and only the replies cross into the vm, so the
// draw sequence must not depend on anything the engine might reseed.
function mulberry32Local(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

async function main() {
console.log(`\n${'='.repeat(78)}`);
console.log('  PLAN X-5 — CONVERSATION CONSEQUENCES, measured');
console.log(`  wire: integers +-${X5.deltaClamp} / ${X5.deltaDivisor} = +-${(X5.deltaClamp / X5.deltaDivisor).toFixed(2)} per axis per window`);
console.log(`  phases: ${LADDER.map(([p, v]) => `${p} ${v}`).join(', ')}   (intimacy = (trust+affection+2*comfort-tension)/4)`);
console.log('='.repeat(78));

// ---------------------------------------------------------------------------
console.log('\n--- 1. DRIFT: WHERE SIX JUDGES LEAVE A RELATIONSHIP ---\n');
console.log('  Nothing in this game decays relPlayer. Every point below is permanent,');
console.log('  and the only thing that moves these axes is a judged window.\n');

const drift = {};
for (const name of Object.keys(PROFILES)) drift[name] = await driftRun(name);

console.log(`  profile      ${WINDOW_MARKS.map(m => rpad(`@${m} win`, 16)).join('')}   trust@${MAX_WINDOWS}`);
for (const [name, r] of Object.entries(drift)) {
  const cells = WINDOW_MARKS.map(m => {
    const c = r.marks[m];
    return rpad(`${c.intimacy} ${c.phase}`, 16);
  }).join('');
  console.log(`  ${pad(name, 12)}${cells}   ${r.marks[MAX_WINDOWS].trust.toFixed(2)}`);
}
console.log('\n  what each profile assumes:');
for (const [name, p] of Object.entries(PROFILES)) console.log(`    ${pad(name, 11)} ${p.note}`);

console.log('\n  windows until each phase falls (— = never, inside 200):\n');
console.log(`  profile      ${LADDER.map(([p, v]) => rpad(`${p} (${v})`, 16)).join('')}`);
for (const [name, r] of Object.entries(drift)) {
  console.log(`  ${pad(name, 12)}${LADDER.map(([p]) => rpad(r.crossed[p] ?? '—', 16)).join('')}`);
}

// ---------------------------------------------------------------------------
console.log('\n--- 2. TOLERANCE: A FLAT +k BIAS ON ONE AXIS ---\n');
console.log('  The cleanest statement of what the wire buys. A judge that awards');
console.log('  exactly +k trust on every window and nothing else — how long until');
console.log(`  that alone carries an NPC up the ladder. (+${X5.deltaClamp} is the clamp.)\n`);

const perPoint = 1 / X5.deltaDivisor;
console.log(`  +k trust   delta/window   ${LADDER.map(([p, v]) => rpad(`${p} (${v})`, 14)).join('')}`);
for (let k = 1; k <= X5.deltaClamp; k++) {
  const per = k * perPoint;                       // trust adds 1x to raw
  const cells = LADDER.map(([, v]) => {
    // intimacy = round(clamp01(raw/4)*100); trust alone caps at 1.0 -> 25.
    const rawNeeded = (v / 100) * 4;
    if (rawNeeded > 1) return rpad('unreachable', 14);
    return rpad(Math.ceil(rawNeeded / per), 14);
  }).join('');
  console.log(`  ${rpad('+' + k, 6)}     ${rpad(per.toFixed(3), 9)}      ${cells}`);
}
console.log('\n  trust alone saturates at 1.0, which is intimacy 25 — so a single-axis');
console.log('  bias cannot reach `close` on its own. That is the formula protecting');
console.log('  the ladder, not the wire. Section 1\'s `warm` and `generous` rows are');
console.log('  what a bias across SEVERAL axes does, and they are the honest reading.');

// ---------------------------------------------------------------------------
console.log('\n--- 3. HOW MANY WINDOWS IS A DAY? ---\n');
console.log('  Through the real trigger logic: assessorWindow / its `full` flag /');
console.log('  markAssessed for the Assessor, chroniclerWindow for the Chronicler.');
console.log('  The INPUT is an assumption — how many player turns a day, and how');
console.log('  often the player changes room. Everything else is the shipped code.\n');

const DAYS = [
  { turns: 6, roomChanges: 2, label: 'light  (a couple of exchanges, in and out)' },
  { turns: 15, roomChanges: 4, label: 'normal (a conversational evening)' },
  { turns: 40, roomChanges: 6, label: 'heavy  (a talker; most of a day at it)' },
];

const cadence = J(`
  (() => {
    const days = ${JSON.stringify(DAYS)};
    const out = [];
    for (const d of days) {
      const g = __mkState();
      let sceneId = 1, assessorCalls = 0, chroniclerCalls = 0;
      // Room changes are spread evenly through the day's turns, which is the
      // shape that makes the scene-close trigger fire at all.
      const changeEvery = Math.max(1, Math.floor(d.turns / (d.roomChanges + 1)));
      for (let t = 1; t <= d.turns; t++) {
        g.npcs.npc_a = __turn(g.npcs.npc_a, t, sceneId);
        // ui.js fires assessSceneIfFull then chronicleIfFull after every turn.
        const w = assessorWindow(g);
        if (w.full) { assessorCalls++; g.npcs.npc_a = markAssessed(g.npcs.npc_a, w.sceneId); }
        const cw = chroniclerWindow(g.npcs.npc_a);
        if (cw.full) { chroniclerCalls++; g.npcs.npc_a = markProcessed(g.npcs.npc_a); }
        // A room change closes the scene: doMove runs runAssessorPass on the
        // scene it is leaving, then openScene increments.
        if (t % changeEvery === 0) {
          const closing = assessorWindow(g, { sceneId });
          if (closing.npcIds.length > 0) {
            assessorCalls++;
            g.npcs.npc_a = markAssessed(g.npcs.npc_a, sceneId);
          }
          sceneId++;
          g.meta.scene = { id: sceneId, roomId: 'living_room', shouted: [] };
        }
      }
      // Day rollover: every NPC still carrying unprocessed exchanges.
      if (chroniclerWindow(g.npcs.npc_a).entries.length > 0) chroniclerCalls++;
      out.push({ ...d, assessorCalls, chroniclerCalls,
                 lostToBuffer: Math.max(0, d.turns * ${X5.linesPerExchange} - ${BUDGET.maxRecent}) });
    }
    return out;
  })()
`);

console.log('  a day of play                                   turns  rooms   Assessor  Chronicler');
for (const d of cadence) {
  console.log(`  ${pad(d.label, 44)} ${rpad(d.turns, 6)} ${rpad(d.roomChanges, 6)} ${rpad(d.assessorCalls, 10)} ${rpad(d.chroniclerCalls, 11)}`);
}
const normal = cadence[1];
console.log(`\n  One NPC, one day. Both passes are full-price calls (there is no model`);
console.log('  selection — see the plan\'s Evidence), so the Chronicler column is per');
console.log('  NPC with unread exchanges and the Assessor column covers everyone in');
console.log('  the window at once (D23).\n');
console.log(`  Every turn above went to ONE npc, so those columns are the rate for the`);
console.log(`  person the player is actually talking to. A player splitting an evening`);
console.log(`  across three housemates gets roughly a third of it EACH, which is why`);
console.log(`  every window count in this file is converted at several rates and not`);
console.log(`  at one:\n`);
const PER_DAY = [1, 2, 3, normal.assessorCalls];
console.log(`  windows/NPC/day  ${[20, 50, 100, 200].map(w => rpad(`${w} win`, 12)).join('')}`);
for (const rate of PER_DAY) {
  console.log(`  ${rpad(rate, 10)}       ${[20, 50, 100, 200].map(w => rpad(`${(w / rate).toFixed(0)}d`, 12)).join('')}`);
}
console.log(`\n  (${normal.assessorCalls} is the 'normal' row above — one NPC getting the player's whole evening.)\n`);
for (const [name, r] of Object.entries(drift)) {
  const c = r.crossed[LADDER[0][0]];
  if (!c) continue;
  console.log(`    ${pad(name, 11)} reaches ${pad(LADDER[0][0], 9)} in ${rpad(c, 3)} windows = ${(c / 3).toFixed(0)}d at 3/day, ${(c / normal.assessorCalls).toFixed(0)}d at ${normal.assessorCalls}/day`);
}

// ---------------------------------------------------------------------------
console.log('\n--- 4. FACT ACCUMULATION AGAINST THE BELIEF BUDGET ---\n');
console.log(`  BELIEF.maxFacts ${BELIEF.maxFacts}, X5.maxFactsPerWindow ${X5.maxFactsPerWindow}. Facts evict on`);
console.log('  importance x confidence, and pinned facts never evict — which is what');
console.log('  D12\'s ceiling exists to keep conversation facts out of.\n');

const EXTRACTORS = {
  silent: { note: 'nothing new, ever (D8 answered correctly)', per: 0 },
  sparse: { note: 'one fact every fourth window', per: 0.25 },
  steady: { note: 'one fact per window', per: 1 },
  chatty: { note: `maxFactsPerWindow (${X5.maxFactsPerWindow}) every window`, per: X5.maxFactsPerWindow },
};
const FACT_MARKS = [10, 30, 100];

const accum = await JA(`
  (async () => {
    const out = {};
    const profiles = ${JSON.stringify(Object.fromEntries(Object.entries(EXTRACTORS).map(([k, v]) => [k, v.per])))};
    for (const [name, per] of Object.entries(profiles)) {
      const g = __mkState();
      const ctx = x5ProposalContext(g, ['npc_a']);
      const marks = {};
      let written = 0, full = null;
      for (let w = 1; w <= ${Math.max(...FACT_MARKS)}; w++) {
        // per === 0 means never. Guarding with (per || 1) would turn "silent"
        // into "one fact every window", which is the profile it exists to be
        // the control FOR.
        const n = per === 0 ? 0 : (per < 1 ? (w % Math.round(1 / per) === 0 ? 1 : 0) : per);
        const facts = [];
        for (let i = 0; i < n; i++) {
          facts.push({ text: 'The player says something new, window ' + w + ' item ' + i,
                       category: 'other', confidence: ${X5.factConfidenceDefault},
                       importance: ${MEM_IMP.social} });
        }
        if (facts.length) {
          const parsed = parseChroniclerReply(JSON.stringify({ facts, episodes: [], grievances: [], resolveGrievances: [] }));
          const additions = toProposalMemory(parsed, 'npc_a', { day: 3, npc: g.npcs.npc_a });
          if (Object.keys(additions).length) {
            await applyProposal({ memoryAdditions: additions }, ctx, g, null);
            written += facts.length;
          }
        }
        const held = (g.npcs.npc_a.memory.facts || []).length;
        if (full === null && held >= ${BELIEF.maxFacts}) full = w;
        if (${JSON.stringify(FACT_MARKS)}.includes(w)) marks[w] = held;
      }
      out[name] = { marks, full, written };
    }
    return JSON.stringify(out);
  })()
`);

console.log(`  extractor    ${FACT_MARKS.map(m => rpad(`@${m} win`, 10)).join('')}  fills ${BELIEF.maxFacts} at   what it assumes`);
for (const [name, r] of Object.entries(accum)) {
  console.log(`  ${pad(name, 12)}${FACT_MARKS.map(m => rpad(r.marks[m], 10)).join('')}  ${rpad(r.full ?? '—', 12)} ${EXTRACTORS[name].note}`);
}
console.log(`\n  A Chronicler window is roughly one per NPC per day plus an early flush`);
console.log(`  every ${X5.chroniclerMaxExchanges} exchanges — the 'normal' day in section 3 produced ${normal.chroniclerCalls}.`);
for (const [name, r] of Object.entries(accum)) {
  if (!r.full) continue;
  console.log(`    ${pad(name, 11)} fills the tier in ${rpad(r.full, 3)} windows = ~${(r.full / Math.max(1, normal.chroniclerCalls)).toFixed(0)} days at that rate`);
}

const evict = J(`
  (() => {
    const score = (imp, conf) => +(imp * conf).toFixed(3);
    return {
      floor:   score(${MEM_IMP.social}, ${X5.factConfidenceDefault}),
      typical: score(${MEM_IMP.conversational}, ${X5.factConfidenceDefault}),
      best:    score(${X5.factImportanceCeiling}, ${X5.factConfidenceMax}),
      pinned:  score(${MEM_IMP.significant}, 1),
    };
  })()
`);
console.log(`\n  eviction score (importance x confidence) of a conversation fact:`);
console.log(`    ordinary detail  ${MEM_IMP.social} x ${X5.factConfidenceDefault} = ${evict.floor}`);
console.log(`    changes how they see the player  ${MEM_IMP.conversational} x ${X5.factConfidenceDefault} = ${evict.typical}`);
console.log(`    the most a window may claim      ${X5.factImportanceCeiling} x ${X5.factConfidenceMax} = ${evict.best}`);
console.log(`    a pinned fact, for comparison    ${MEM_IMP.significant} x 1.0 = ${evict.pinned}  (never evicts)`);
console.log('  Everything the Chronicler writes sits below the pinning bar by');
console.log('  construction (D12) and therefore evicts before anything defining does.');

// ---------------------------------------------------------------------------
console.log('\n--- 5. NEAR-DUPLICATE BLINDNESS (D25) ---\n');
console.log('  D25 dedupes on exact text with case and punctuation folded. The failure');
console.log('  mode the Phase 3 Handoff flagged is the SAME disclosure extracted twice');
console.log('  in different words across two windows. This is how much gets through.\n');

// Pairs a real extractor produces across two windows about one disclosure.
// The first four are what D25 was built for; the rest are what it cannot see.
const PARAPHRASES = [
  ['The player says they grew up in Leeds', 'The player says they grew up in Leeds'],
  ['The player says they grew up in Leeds', 'the player says they grew up in leeds'],
  ['The player says they grew up in Leeds.', 'The player says they grew up in Leeds'],
  ['The player says they grew up in Leeds', '  The player says they grew up in Leeds  '],
  ['The player says they grew up in Leeds', 'The player is from Leeds'],
  ['The player says they work night shifts', 'The player says they work nights'],
  ['The player says their mother is unwell', 'The player says their mum is ill'],
  ['The player says they hate their job', 'The player says they do not like their job'],
  ['The player says they play guitar', 'The player says they play the guitar'],
  ['The player says they have a sister', 'The player mentioned a sister'],
  ['The player says they are behind on rent', 'The player says money is tight this month'],
  ['The player says they used to be a chef', 'The player says they cooked professionally'],
];

const dedupe = J(`
  (() => {
    const pairs = ${JSON.stringify(PARAPHRASES)};
    const rows = [];
    for (const [first, second] of pairs) {
      const npc = __freshNpc('Hana');
      npc.memory.facts = [{ text: first, factId: 1, valid: true, confidence: 0.6, importance: 0.5 }];
      const parsed = parseChroniclerReply(JSON.stringify({ facts: [{ text: second }], episodes: [], grievances: [], resolveGrievances: [] }));
      const additions = toProposalMemory(parsed, 'npc_a', { day: 3, npc });
      rows.push({ first, second, caught: !(additions.npc_a && additions.npc_a.facts) });
    }
    return rows;
  })()
`);

const caught = dedupe.filter(r => r.caught).length;
for (const r of dedupe) {
  console.log(`  ${r.caught ? 'caught ' : 'THROUGH'}  "${r.second}"`);
}
console.log(`\n  ${caught} of ${dedupe.length} caught. Every miss is a second belief record with its own`);
console.log(`  factId, and the pair then out-votes everything else in retrieval while`);
console.log(`  filling BELIEF.maxFacts twice as fast. The prompt asks the extractor not`);
console.log(`  to do this ("Nothing already in the believe-list above"); ingestion can`);
console.log(`  only enforce the exact-match half.\n`);

// ---------------------------------------------------------------------------
console.log('--- 6. THE DIVISOR SWEEP — setting the timescale by measurement ---\n');
console.log('  deltaDivisor is the only lever that moves the ABSOLUTE timescale, and');
console.log('  it is the only one worth pulling: it scales drift and signal by the');
console.log('  same factor, so the ratio between the `realistic` and `warm` rows below');
console.log('  is fixed no matter what is chosen here. What a judge with a bias does');
console.log('  RELATIVE to a judge following the rubric is a property of the prompt');
console.log('  (D8), not of the wire. What this sets is how long a real relationship');
console.log('  takes — and that is a feel judgement the browser makes, not this file.\n');

// There is a HARD FLOOR on the divisor and it is not in any table: it is
// validateProposal's per-axis magnitude check, a literal inside npc.js. Push
// deltaClamp/deltaDivisor past it and every proposal fails validation, so
// runAssessorPass logs a warning nobody reads, marks the window judged, and
// the relationship silently never moves again. Probed rather than restated
// (README rule 5) — the validator owns the number, so ask it.
const validatorCeiling = J(`
  (() => {
    const g = __mkState();
    const ctx = x5ProposalContext(g, ['npc_a']);
    let best = 0;
    for (let m = 1; m <= 1000; m++) {
      const v = validateProposal({ relationshipDeltas: { npc_a: { trust: m / 1000 } } }, ctx);
      if (!v.valid) break;
      best = m / 1000;
    }
    return best;
  })()
`);
const divisorFloor = Math.ceil(X5.deltaClamp / validatorCeiling);

const CANDIDATES = [200, 100, 75, 50, 40, 25];
const SWEEP = ['realistic', 'warm', 'ceiling'];
const original = X5.deltaDivisor;
const sweep = {};
for (const d of CANDIDATES) {
  api(`X5.deltaDivisor = ${d};`);
  sweep[d] = {};
  for (const name of SWEEP) sweep[d][name] = await driftRun(name);
}
api(`X5.deltaDivisor = ${original};`);

for (const name of SWEEP) {
  console.log(`  ${name} — ${PROFILES[name].note}`);
  console.log(`    divisor   max/window   ${LADDER.map(([p, v]) => rpad(`${p} (${v})`, 15)).join('')}`);
  for (const d of CANDIDATES) {
    const r = sweep[d][name];
    const cells = LADDER.map(([p]) => {
      const w = r.crossed[p];
      return rpad(w ? `${w} win / ${(w / 3).toFixed(0)}d` : '— (>200)', 15);
    }).join('');
    const flag = pad(d < divisorFloor ? ' BELOW FLOOR' : (d === original ? ' *' : ''), 12);
    console.log(`    ${rpad(d, 6)}${flag} ${rpad((X5.deltaClamp / d).toFixed(3), 9)}    ${cells}`);
  }
  console.log('');
}
console.log('  "d" converts at 3 windows/NPC/day — an NPC getting a meaningful share');
console.log('  of a conversational evening, per section 3\'s rate table. * is shipped.');
console.log(`\n  THE FLOOR: validateProposal rejects any single axis above ${validatorCeiling}, so`);
console.log(`  deltaDivisor may never go below ${divisorFloor} while deltaClamp is ${X5.deltaClamp}.`);
console.log('');
console.log('  Read the BELOW FLOOR rows carefully, because they do not fail cleanly.');
console.log('  A whole proposal fails on ONE bad axis, so below the floor it is exactly');
console.log('  the big judgements that stop landing while the small ones sail through:');
console.log(`  the ceiling row crosses nothing at all at ${CANDIDATES[CANDIDATES.length - 1]}, while realistic and warm`);
console.log('  cross FASTER than at any legal divisor. The scale inverts — "something');
console.log('  that genuinely changes where these two stand" becomes the only kind of');
console.log('  window that can never move anything — and the only symptom is a console');
console.log('  warning nobody is reading, because D14 marks the window judged either');
console.log('  way. verify-x1 asserts the clearance, so a retune past the floor fails');
console.log('  the suite instead of shipping.');
console.log('');
}

main().catch(e => { console.log('THREW: ' + e.stack); process.exit(1); });
