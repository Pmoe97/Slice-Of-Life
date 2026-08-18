// Intimacy & Voyeurism Plan Phase 10 — Peek & Listen (D6/D7).
// The timed real-time hold at a door. D7's risk curve lives in PEEK and is
// read for the FIRST time here (the stealthSuccess skill's first mechanical
// reader); the caught resolution is a personality-gated weighted table
// (PEEK_OUTCOMES), decided deterministically (seeded rng only) and narrated
// from authored pools — no LLM call decides any boundary outcome (D15).
// D6's "empty/dark rooms are text-only" is the peekWatchable gate; the view
// line and the image prompt share one explicit surface that degrades to a
// safe paraphrase the moment the intimate gate closes (the same fail-closed
// split as getPhysicalDescriptionForPrompt). The image budget caps fresh
// generations per session and per day (the kv cache is the primary gate,
// this is the secondary brake).
//
// Like verify-w9, nothing here reimplements the math: the engine loads into
// a bare vm and the assertions read what the real functions return. The
// helpers (house/warmNpc/makeSess/roomOf/doorOf) are injected INTO the vm
// context first, so every `api` expression resolves them the same way the
// page globals do. The same checks run on the live page (browser_eval) —
// the session controller itself (startPeekSession/_peekTick) needs the DOM
// + currentGameState and is verified there. The mandatory per-session gate
// check (a negative-willingness act never fires) is check 10, mirroring w9.
const path = require('path');
const fs = require('fs');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Inject helpers into the vm context (function declarations, so the
// checks call them by name instead of interpolating arrow bodies). ---
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

// Set an NPC warm toward the player (axes moved, phase derived) — the
// opposite of the stranger/cold cases. `tension` defaults low so the hostile
// floor never trips it.
api(`
  function warmNpc(npc, opts) {
    const rel = npc.relPlayer;
    rel.trust = opts.trust ?? 0.5;
    rel.affection = opts.affection ?? 0.6;
    rel.comfort = opts.comfort ?? 0.9;
    rel.desire = opts.relDesire ?? 0.7;
    rel.tension = opts.tension ?? 0;
    rel.respect = opts.respect ?? 0.3;
    rel.grievances = [];
    const d = deriveConversationPhase(rel);
    rel.intimacyLevel = d.intimacyLevel;
    rel.conversationPhase = d.conversationPhase;
    npc.needs.desire = opts.desire ?? 70;
    npc.mood = opts.mood ?? 0.3;
    npc.location = opts.room || 'bedroom_1';
    return npc;
  }
`);

// A fake session — the shape startPeekSession builds. The controller pieces
// (_peekTick etc.) are DOM-facing and live-verified only; the pure
// derivations read exactly these fields.
api(`
  function makeSess(id, roomId, extra) {
    return Object.assign({
      doorId: 'd1', doorName: 'bedroom door', roomId, mode: 'peek',
      focusNpcId: id, ticksElapsed: 0, riskAccum: 0, caught: false,
      freshImages: 0, lastActivity: '', lastActKey: null,
      _viewLine: null, _peekImageKey: null, _peekImageUrl: null, _desireMarked: false,
    }, extra || {});
  }
`);
api(`
  function roomOf(h, id) { return h.npcs[id].residency.room || 'bedroom_1'; }
  function doorOf(h, roomId) {
    return Object.values(h.objects['room_' + roomId] || {}).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. PEEK tuning table (config.js) + the closed-form rule');
check('PEEK shape is sane: positive ramp, saturating catch, real budgets',
      api(`(() => {
        const p = PEEK;
        return p.realTickMs >= 1000 && p.tickMinutes >= 1
          && p.baseRisk >= 0 && p.riskPerTick > 0 && p.maxRisk === 1
          && p.stealthBonus > 0 && p.lockBonus > 0 && p.perceptionWeight > 0
          && p.riskHalfway > 0 && p.maxCatchChance > 0 && p.maxCatchChance < 1
          && p.maxHoldTicks > 0 && p.moodGain >= 0 && p.moodGain <= 1
          && p.imageBudget.freshPerSession >= 1
          && p.imageBudget.freshPerDay >= p.imageBudget.freshPerSession
          && p.listen.defaultHoldTicks > 0 && p.listen.defaultHoldTicks < p.maxHoldTicks
          && p.listen.maxAudibleSignals >= 1;
      })()`));
check("PEEK.desireSource is a real DESIRE.sources kind (the plan's 'peeked_at_sex' reader)",
      api(`(() => DESIRE.sources.some(s => s.kind === PEEK.desireSource))()`));
check("the 'peeking' time context exists and dilates 60x (1 game-minute per real second)",
      api(`(() => TIME_DILATION.scales.peeking === 60)()`));
check('every PEEK_OUTCOMES personality table names the same five outcomes; hostile/cold never escalate or engage',
      api(`(() => {
        const keys = ['stop', 'ignore', 'escalate', 'engage', 'confront'];
        const t = PEEK_OUTCOMES.weightTables;
        return keys.every(k => typeof t.hostile[k] === 'number')
          && t.hostile.escalate === 0 && t.hostile.engage === 0 && t.hostile.confront > 0
          && t.cold.escalate === 0 && t.cold.engage === 0 && t.cold.confront > 0;
      })()`));
check('closed-form fast-forward: peek.js never advances the clock or loops sim ticks itself',
      (() => {
        const src = fs.readFileSync(path.join(SRCDIR, 'peek.js'), 'utf8');
        return !src.includes('advanceClock') && !src.includes('resolveBatch');
      })());

// ---------------------------------------------------------------- 2
console.log('\n2. The risk ramp — peekRiskPerTick');
check('risk rises with hold time (tick 9 > tick 0)',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        return peekRiskPerTick(makeSess(id, roomId, { ticksElapsed: 0 }), h)
             < peekRiskPerTick(makeSess(id, roomId, { ticksElapsed: 9 }), h);
      })()`));
check("stealth skill lowers risk (the stealthSuccess curve's first reader)",
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        const s = makeSess(id, roomId, { ticksElapsed: 5 });
        const clumsy = peekRiskPerTick(s, h);
        h.player.skills.stealth = 4000; // level 10 → stealthSuccess 0.94
        return peekRiskPerTick(s, h) < clumsy;
      })()`));
check('a locked door lowers risk (a complacent occupant)',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        const door = doorOf(h, roomId);
        if (!door) return false;
        const s = makeSess(id, roomId, { ticksElapsed: 5 });
        const open = peekRiskPerTick(s, h);
        door.state = { lock: 'locked' };
        return peekRiskPerTick(s, h) < open;
      })()`));
check('a high-perception occupant raises risk',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        const base = h.npcs[id];
        base.location = roomId;
        const a = { ...base, bible: { ...base.bible, temperament: { ...(base.bible.temperament || {}), openness: 1, conscientiousness: -1 } } };
        const b = { ...base, bible: { ...base.bible, temperament: { ...(base.bible.temperament || {}), openness: -1, conscientiousness: 1 } } };
        h.npcs.a_probe = a; h.npcs.b_probe = b;
        return getNpcPerception(a) > getNpcPerception(b)
          && peekRiskPerTick(makeSess('a_probe', roomId, { ticksElapsed: 3 }), h)
           > peekRiskPerTick(makeSess('b_probe', roomId, { ticksElapsed: 3 }), h);
      })()`));
check('risk never goes negative, and the caught roll is monotone-saturating',
      api(`(() => {
        let minRisk = Infinity;
        for (let t = 0; t < 40; t++) {
          const h = house(20261001, 1);
          const id = Object.keys(h.npcs)[0];
          const roomId = roomOf(h, id);
          h.npcs[id].location = roomId;
          minRisk = Math.min(minRisk, peekRiskPerTick(makeSess(id, roomId, { ticksElapsed: t }), h));
        }
        const c0 = peekCaughtChance(0);
        let prev = -1, monotone = true;
        for (const r of [0.01, 0.1, 0.25, 0.5, 1, 2, 10]) {
          const c = peekCaughtChance(r);
          if (c < prev) monotone = false;
          if (c > PEEK.maxCatchChance) monotone = false;
          prev = c;
        }
        return minRisk >= 0 && c0 === 0 && monotone && prev < 1;
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. The caught outcome — the personality gate (PEEK_OUTCOMES)');
check('a hostile occupant reads the hostile table (confront-heavy, no escalate/engage)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        npc.relPlayer.tension = PEEK_OUTCOMES.hostileTension;
        npc.relPlayer.comfort = 0.9;
        return peekOutcomeWeights(h, npc) === PEEK_OUTCOMES.weightTables.hostile;
      })()`));
check('a warm deviant reads warmDeviant (escalate/engage branch)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        npc.relPlayer.comfort = 0.9;
        npc.bible.temperament = { ...(npc.bible.temperament || {}), openness: 1, assertiveness: 1 };
        return npcDeviancy(npc) >= PEEK_OUTCOMES.deviantThreshold
          && peekOutcomeWeights(h, npc) === PEEK_OUTCOMES.weightTables.warmDeviant;
      })()`));
check('a warm non-deviant reads warm (stop/ignore/engage, no confront)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, { room: 'bedroom_1' });
        npc.bible.temperament = { ...(npc.bible.temperament || {}), openness: -1, assertiveness: -1 };
        const t = peekOutcomeWeights(h, npc);
        return npcDeviancy(npc) < PEEK_OUTCOMES.deviantThreshold
          && t === PEEK_OUTCOMES.weightTables.warm && t.confront === 0;
      })()`));
check('a familiar-phase NPC is warm even below the comfort bar (phase in warmPhases)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, { comfort: 0.3, room: 'bedroom_1' });
        npc.relPlayer.conversationPhase = 'familiar';
        return peekOutcomeWeights(h, npc) === PEEK_OUTCOMES.weightTables.warm;
      })()`));
check('a near-stranger (all relPlayer axes at default) reads cold (confront 4)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        return peekOutcomeWeights(h, npc) === PEEK_OUTCOMES.weightTables.cold;
      })()`));
check('a slight acquaintance with a grievance but no warmth reads neutral',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        npc.relPlayer.trust = 0.2; npc.relPlayer.tension = 0.2; npc.relPlayer.comfort = 0.1;
        npc.relPlayer.grievances = [{ severity: 0.3, text: 'x', resolved: false }];
        npc.relPlayer.conversationPhase = 'early';
        return peekOutcomeWeights(h, npc) === PEEK_OUTCOMES.weightTables.neutral;
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. Deterministic caught resolution');
// resolvePeekCaughtOutcome filters zero-weight outcomes before the weighted
// pick: weightedPick reads `item.weight || 1`, so without the filter a
// forbidden 0 (hostile/cold must never escalate/engage, warm never confronts)
// would silently re-open at weight 1. These checks pin the filtered contract.
check('resolvePeekCaughtOutcome is pure: same inputs, same outcome key, no state writes',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        warmNpc(h.npcs[id], { room: roomId });
        h.npcs[id].bible.temperament = { ...(h.npcs[id].bible.temperament || {}), openness: 1, assertiveness: 1 };
        const s = makeSess(id, roomId, {});
        const before = JSON.stringify(h);
        const a = resolvePeekCaughtOutcome(h, s);
        const b = resolvePeekCaughtOutcome(h, s);
        return typeof a === 'string' && a === b && JSON.stringify(h) === before;
      })()`));
check("a hostile occupant's caught roll can never escalate or engage (zero-weight outcomes)",
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].relPlayer.tension = PEEK_OUTCOMES.hostileTension;
        const s = makeSess(id, roomId, {});
        const seen = new Set();
        for (let d = 1; d <= 8; d++) {
          h.meta.clock.day = d;
          seen.add(resolvePeekCaughtOutcome(h, s));
        }
        return [...seen].every(o => !['escalate', 'engage'].includes(o));
      })()`));
check("a warm deviant's caught roll never confronts",
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        warmNpc(h.npcs[id], { room: roomId });
        h.npcs[id].bible.temperament = { ...(h.npcs[id].bible.temperament || {}), openness: 1, assertiveness: 1 };
        const s = makeSess(id, roomId, {});
        const seen = new Set();
        for (let d = 1; d <= 12; d++) {
          h.meta.clock.day = d;
          seen.add(resolvePeekCaughtOutcome(h, s));
        }
        return !seen.has('confront');
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. D6 gates — peekWatchable / peekFocusOccupant');
check('an occupied, lit room is watchable; the room owner is the focus when present',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.meta.clock.phase = 'afternoon';
        const f = peekFocusOccupant(h, roomId);
        return !!f && f.npcId === id && peekWatchable(h, roomId);
      })()`));
check('an empty room is never watchable and has no focus',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = null;
        h.meta.clock.phase = 'afternoon';
        return peekFocusOccupant(h, roomId) === null && !peekWatchable(h, roomId);
      })()`));
check('a dark room (asleep at night) has a focus but is NOT watchable — text-only, no image',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].activity = 'sleeping';
        h.meta.clock.phase = 'night';
        return !!peekFocusOccupant(h, roomId) && !peekWatchable(h, roomId);
      })()`));
check('an awake occupant at night keeps the room lit (awake implies light)',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].activity = 'watching TV';
        h.meta.clock.phase = 'night';
        return peekWatchable(h, roomId);
      })()`));
check('when two occupants share a room, the room owner is the focus',
      api(`(() => {
        const h = house(20261001, 2);
        const [a, b] = Object.keys(h.npcs);
        const roomId = roomOf(h, a);
        h.npcs[a].location = roomId;
        h.npcs[b].location = roomId;
        h.npcs[b].residency.room = 'bedroom_2';
        h.meta.clock.phase = 'morning';
        const f = peekFocusOccupant(h, roomId);
        return f.npcId === a;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. The D15 explicit surface — composePeekViewLine + composePeekPrompt');
check('view line: nude + mature (the default) reads the EXPLICIT act phrase',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].clothing = 'nude';
        h.npcs[id].activity = 'masturbating';
        const line = composePeekViewLine(h, makeSess(id, roomId, {}), peekFocusOccupant(h, roomId));
        return line.includes('masturbating') && !line.includes('lying in bed') && !line.includes('keyhole');
      })()`));
check('view line: mature OFF degrades the same scene to its safe paraphrase',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.meta.contentConfig = { contentFlags: { mature: false, romance: true } };
        h.npcs[id].location = roomId;
        h.npcs[id].clothing = 'nude';
        h.npcs[id].activity = 'masturbating';
        const line = composePeekViewLine(h, makeSess(id, roomId, {}), peekFocusOccupant(h, roomId));
        return line.includes('lying in bed') && !line.includes('masturbating');
      })()`));
check('view line: dressed never triggers explicit phrasing even with mature on',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].clothing = 'dressed';
        h.npcs[id].activity = 'masturbating';
        const line = composePeekViewLine(h, makeSess(id, roomId, {}), peekFocusOccupant(h, roomId));
        return line.includes('lying in bed') && !line.includes('masturbating');
      })()`));
check('prompt: the image prompt uses the SAME gate and never bakes in a keyhole or a door',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        h.npcs[id].location = roomId;
        h.npcs[id].clothing = 'nude';
        h.npcs[id].activity = 'having sex';
        const open = composePeekPrompt(h, roomId, h.npcs[id], 'having sex');
        h.meta.contentConfig = { contentFlags: { mature: false, romance: true } };
        const closed = composePeekPrompt(h, roomId, h.npcs[id], 'having sex');
        return open.includes('having sex') && closed.includes('in bed')
          && !/keyhole/i.test(open) && !/keyhole/i.test(closed)
          && !/\bdoor\b/i.test(open) && !/\bdoor\b/i.test(closed);
      })()`));
check('peek cache key is deterministic and scene-scoped (revisits reuse, changes bust)',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        const npc = h.npcs[id];
        const a = composePeekKey(h, roomId, npc, 'masturbating');
        const b = composePeekKey(h, roomId, npc, 'masturbating');
        const c = composePeekKey(h, roomId, npc, 'watching TV');
        const d = composePeekKey({ ...h, meta: { ...h.meta, clock: { ...h.meta.clock, phase: 'night' } } }, roomId, npc, 'masturbating');
        return a === b && a !== c && a !== d;
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. The desire mark + prose pools');
check("peekActIsSexual is true exactly on the plan's act list",
      api(`(() => {
        const s = makeSess('x', 'r', {});
        return PEEK.desireActs.every(a => peekActIsSexual(Object.assign({}, s, { lastActivity: a })))
          && ['watching TV', 'showering', 'changing', ''].every(a => !peekActIsSexual(Object.assign({}, s, { lastActivity: a })));
      })()`));
check('prose pools are all non-empty arrays of strings, varied (D4)',
      api(`(() => {
        const bad = Object.entries(PEEK_PROSE).filter(([, pool]) => !Array.isArray(pool) || pool.length < 2 || pool.some(l => typeof l !== 'string'));
        return bad.length === 0;
      })()`));
check('pickPeekProse is deterministic per (pool, room, day), substitutes {name}/{door}, varies across days',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const roomId = roomOf(h, id);
        const npc = h.npcs[id];
        const s = makeSess(id, roomId, {});
        const a = pickPeekProse(h, 'openPeek', s, npc);
        if (a !== pickPeekProse(h, 'openPeek', s, npc)) return false;
        if (a.includes('{name}') || a.includes('{door}')) return false;
        const seen = new Set();
        for (let d = 1; d <= 9; d++) { h.meta.clock.day = d; seen.add(pickPeekProse(h, 'openPeek', s, npc)); }
        return seen.size >= 2;
      })()`));

// ---------------------------------------------------------------- 8
console.log('\n8. The image budget');
check('fresh generations are allowed until the per-session cap, then refused; a new day resets the per-day cap for a new session',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const s = makeSess(id, 'bedroom_1', {});
        if (!peekImageBudgetAllows(h, s)) return false;
        for (let i = 0; i < PEEK.imageBudget.freshPerSession; i++) peekImageBudgetSpend(h, s);
        if (peekImageBudgetAllows(h, s)) return false;             // session cap holds
        if (s.freshImages !== PEEK.imageBudget.freshPerSession) return false;
        const rec = h.player.flags._peekBudget;
        if (!rec || rec.day !== h.meta.clock.day || rec.count !== PEEK.imageBudget.freshPerSession) return false;
        h.meta.clock.day++;                                        // new day
        return peekImageBudgetAllows(h, makeSess(id, 'bedroom_1', { freshImages: 0 })); // fresh session allowed
      })()`));
check('the per-day cap alone refuses fresh generations mid-session',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        h.player.flags._peekBudget = { day: h.meta.clock.day, count: PEEK.imageBudget.freshPerDay };
        const s = makeSess(id, 'bedroom_1', { freshImages: 0 });
        return !peekImageBudgetAllows(h, s);
      })()`));
check("a stale day-record doesn't gate (the flag resets at the new day)",
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        h.player.flags._peekBudget = { day: h.meta.clock.day - 1, count: 999 };
        const s = makeSess(id, 'bedroom_1', { freshImages: 0 });
        return peekImageBudgetAllows(h, s);
      })()`));

// ---------------------------------------------------------------- 9
console.log('\n9. Listen-mode surface');
check('listen prose pools exist for open/silent/caught, and audible cues cap at maxAudibleSignals',
      api(`(() => {
        return ['openListen', 'listenSilent'].every(k => (PEEK_PROSE[k] || []).length > 0)
          && ['stop_listen', 'ignore_listen', 'escalate_listen', 'engage_listen', 'confront_listen'].every(k => (PEEK_PROSE[k] || []).length > 0)
          && DOOR_CUE_TUNING.maxAudibleSignals === PEEK.listen.maxAudibleSignals;
      })()`));

// ---------------------------------------------------------------- 10
console.log('\n10. THE MANDATORY GATE CHECK — a negative-willingness act never fires (regression)');
check('the willingness floors still return exactly -1 (asleep / hostile / stranger / refusing)',
      api(`(() => {
        const h = house(20261001, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        npc.activity = 'sleeping';
        const asleep = willingness(h, npc, 'player', 'sex', {}) === -1;
        npc.activity = '';
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const hostile = willingness(h, npc, 'player', 'sex', {}) === -1;
        const h2 = house(20261001, 2);
        const strangerNpc = Object.values(h2.npcs)[0];
        const stranger = willingness(h2, strangerNpc, 'player', 'sex', {}) === -1;
        const refusing = willingness(h, npc, 'player', 'sex', { refusing: true }) === -1;
        return asleep && hostile && stranger && refusing;
      })()`));
check('the gate aborts with reason floor / below_threshold and opens for a willing target',
      api(`(() => {
        const h = house(20261001, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const gOpen = resolveWillingnessGate(h, id, 'player', 'quickie', {});
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const gFloor = resolveWillingnessGate(h, id, 'player', 'sex', {});
        return gOpen.allowed && gFloor.reason === 'floor' && !gFloor.allowed;
      })()`));
check('Phase 10 introduces no new door into intimacy: a caught peek applies only effects, never an act',
      (() => {
        const src = fs.readFileSync(path.join(SRCDIR, 'peek.js'), 'utf8');
        return !src.includes('resolveWillingnessGate') && !src.includes('willingness(');
      })());

// ---------------------------------------------------------------- 11
console.log('\n11. Regression — the sim still runs');
check('a full day of real resolveBatch ticks runs cleanly with peek.js loaded',
      api(`(() => {
        const h = house(20261005, 3);
        let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (let t = 0; t < 48; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          const rb = resolveBatch(gs, 1, { advanceClock: false });
          gs = rb.state;
        }
        return typeof gs.meta.clock.day === 'number';
      })()`));
check('no active peek session at load (module state starts clean)',
      api(`(() => peekSessionActive() === false)()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
