// NPC initiative plan, Phase 1 — the expression layer.
//
//   node dev/verify/verify-i1.js
//
// The plan's thesis is that initiative is a spectrum ordered by how much of the
// player's attention it demands, and that only the top of it needs new
// machinery. This is the bottom: an NPC's MOOD leaking into a world the player
// can hear, riding along on whatever act is already happening. No new UI, no
// tick cost, and — the reason it ships first (D7) — built on `mood`, the only
// one of the plan's five motivation sources measured alive on a generated cast.
//
// Two invariants carry this file. D3: an expression rides along and NEVER
// occupies a tick, because Plan 3's one-action-per-tick guarantee is what makes
// NPC behaviour read as one person doing one thing. And R8/RI6: no field
// without its reader — this plan opens with two flags that have never caused
// anything to happen, so a third dead one is the failure mode to guard.
//
// The behavioural half at the bottom is why the numbers in the plan's Handoff
// exist. It asserts RELATIONSHIPS against a counterfactual (the same seeds with
// every `expresses` stripped) rather than magic constants, because Phase 6
// exists to move the rate and a pinned rate would report that retune as a
// regression.
const path = require('path');
const fs = require('fs');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js', 'sim.js', 'signals.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

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
  __res = (block, location) => ({ block, location, activity: '', transit: null });
  __door = (g, roomId, lock) => {
    for (const o of Object.values(g.objects['room_' + roomId] || {}))
      if (o.defId === 'bedroom_door' || o.defId === 'bathroom_door') o.state = { ...o.state, lock };
  };
  // Every authored rule, flattened, so the table can be walked as one list
  // however individual entries are shaped (a rule or an ordered array of them).
  __rules = () => {
    const out = [];
    for (const [id, d] of Object.entries(DRIVE_DEFS)) {
      if (!d.expresses) continue;
      const rules = Array.isArray(d.expresses) ? d.expresses : [d.expresses];
      rules.forEach((r, i) => out.push({ driveId: id, i, rule: r }));
    }
    return out;
  };
  // Which resolution path a drive goes down. Derived from the def's own custom
  // flags rather than a hand-kept list, so a new custom resolver cannot quietly
  // acquire an expression that never fires.
  __customFlag = (d) => ['isPeepDrive','isSnoopDrive','isEatDrive','isInvestigateDrive','isGiftDrive']
    .find(f => d[f]) || null;
`);

const RULES = JSON.parse(api(`JSON.stringify(__rules())`));
const BANDS = JSON.parse(api(`JSON.stringify(EXPRESSION_MOOD)`));
const SOURCES = JSON.parse(api(`JSON.stringify(Object.keys(EXPRESSION_SOURCES))`));
const DRIVES_WITH = [...new Set(RULES.map(r => r.driveId))];

// ---------------------------------------------------------------------------
console.log(`\n(D3) the authored expressions are well formed — ${RULES.length} rule(s) across ${DRIVES_WITH.length} drive(s)`);
check(`at least one drive declares an expression`, RULES.length >= 1,
      'Phase 1 exists to give the flat an emotional channel — zero rules is the phase not landing');
check('every rule names a declared signal',
      RULES.every(r => api(`!!SIGNAL_DEFS['${r.rule.signal}']`)),
      RULES.filter(r => !api(`!!SIGNAL_DEFS['${r.rule.signal}']`)).map(r => `${r.driveId}->${r.rule.signal}`).join(', '));
// An expression is a MOMENT, not a state of the world. A standing signal is
// derived from an object's state on every query and would have no way to stop
// being derivable once the mood passed.
check('...and a TRANSIENT one — an expression is a moment, not a condition',
      RULES.every(r => api(`!!SIGNAL_DEFS['${r.rule.signal}'].decayPerTick`)),
      RULES.filter(r => !api(`!!SIGNAL_DEFS['${r.rule.signal}'].decayPerTick`)).map(r => r.rule.signal).join(', '));
check('every rule has a non-empty `when`',
      RULES.every(r => r.rule.when && Object.keys(r.rule.when).length > 0),
      'an unconditional noise is what `emitsSignal` is for');
// Derived from EXPRESSION_SOURCES, never a literal list: the later phases add
// sources as they make them live, and this must not need editing when they do.
check(`every 'when' key is a source the evaluator knows (${SOURCES.join(', ')})`,
      RULES.every(r => Object.keys(r.rule.when).every(k => SOURCES.includes(k))),
      RULES.flatMap(r => Object.keys(r.rule.when).filter(k => !SOURCES.includes(k)).map(k => `${r.driveId}.${k}`)).join(', '));
check('every condition is a numeric `below` or `above` (or both)',
      RULES.every(r => Object.values(r.rule.when).every(c =>
        (typeof c.below === 'number' || typeof c.above === 'number'))),
      'a condition with neither is a rule that can never fire');
check('every rule carries an intensity in (0, 1]',
      RULES.every(r => typeof r.rule.intensity === 'number' && r.rule.intensity > 0 && r.rule.intensity <= 1),
      RULES.filter(r => !(r.rule.intensity > 0 && r.rule.intensity <= 1)).map(r => `${r.driveId}=${r.rule.intensity}`).join(', '));
// Phase 6 tunes the rate. It can only do that in one edit if no entry has
// grown its own private threshold — the same reason `leaves` steps and
// `SIGNALS_EMIT` intensities are named rather than inlined.
check('every mood threshold comes from EXPRESSION_MOOD, so the rate has ONE lever',
      RULES.every(r => Object.values(r.rule.when).every(c =>
        (c.below === undefined || Object.values(BANDS).includes(c.below)) &&
        (c.above === undefined || Object.values(BANDS).includes(c.above)))),
      `bands ${JSON.stringify(BANDS)}`);
check('the bands are ordered veryLow < low < high and sit inside mood\'s [-1, 1]',
      BANDS.veryLow < BANDS.low && BANDS.low < BANDS.high &&
      Object.values(BANDS).every(v => v >= -1 && v <= 1),
      JSON.stringify(BANDS));
// The lesson `sleep_recover`'s deleted bed trace taught in Plan 3's Phase 4: a
// footprint declared on a path that cannot apply it is a config lie that never
// fires and never errors. Only the standard resolver and tryEatFood apply one.
check('every drive with an expression is on a path that APPLIES it', api(`
  Object.entries(DRIVE_DEFS).filter(([, d]) => d.expresses).every(([, d]) => {
    const custom = __customFlag(d);
    return custom === null || custom === 'isEatDrive';
  })
`), 'a custom resolver returns before the generic handlers — an expression there never fires');
// First match wins, so a drive that slams on a very bad day and sighs on a
// merely bad one must list the slam first or the sigh swallows it.
check('within one drive, `below` rules are ordered strictest-first', api(`
  Object.values(DRIVE_DEFS).filter(d => Array.isArray(d.expresses)).every(d => {
    for (const key of Object.keys(EXPRESSION_SOURCES)) {
      const bounds = d.expresses.map(r => r.when && r.when[key] && r.when[key].below)
                                .filter(v => typeof v === 'number');
      for (let i = 1; i < bounds.length; i++) if (bounds[i] < bounds[i - 1]) return false;
    }
    return true;
  })
`), 'first match wins — a looser rule listed first makes every stricter one dead');

// ---------------------------------------------------------------------------
console.log('\nthe condition evaluator fails CLOSED');
// A silent never-fires is findable; a silent always-fires is a layer nobody
// authored going off on every act in the game.
check('no `when` at all → false', api(`expressionApplies({ mood: -1 }, undefined) === false`));
check('an empty `when` → false', api(`expressionApplies({ mood: -1 }, {}) === false`));
check('an unknown source key → false', api(`
  expressionApplies({ mood: -1, grievance: true }, { grievance: { above: 0 } }) === false
`), 'the later phases add sources beside their readers — an unknown one must not pass vacuously');
check('a condition with neither below nor above → false',
      api(`expressionApplies({ mood: -1 }, { mood: {} }) === false`));
check('a source that is not a number → false',
      api(`expressionApplies({}, { mood: { below: 0 } }) === false`),
      'an NPC with no mood yet must not be treated as mood 0');
check('`below` is strict', api(`
  expressionApplies({ mood: -0.5 }, { mood: { below: -0.5 } }) === false &&
  expressionApplies({ mood: -0.51 }, { mood: { below: -0.5 } }) === true
`));
check('`above` is strict', api(`
  expressionApplies({ mood: 0.5 }, { mood: { above: 0.5 } }) === false &&
  expressionApplies({ mood: 0.51 }, { mood: { above: 0.5 } }) === true
`));
check('a two-sided condition is an AND (a band, not a union)', api(`
  expressionApplies({ mood: 0 },   { mood: { above: -0.2, below: 0.2 } }) === true &&
  expressionApplies({ mood: 0.5 }, { mood: { above: -0.2, below: 0.2 } }) === false
`));

// ---------------------------------------------------------------------------
console.log('\nthe applier emits, and does nothing else');
api(`
  __clean = () => { const g = __mk(); g.world.signals = []; return g; };
  __sigsOf = (g) => g.world.signals.map(r => r.id);
`);
check('a matching rule emits exactly one transient, in the room given', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, { signal: 'sighing', when: { mood: { below: 0 } }, intensity: 0.4 },
                                   'kitchen', { mood: -0.5 }, 'npc_1');
    return r === 'sighing' && g.world.signals.length === 1 &&
           g.world.signals[0].id === 'sighing' && g.world.signals[0].roomId === 'kitchen' &&
           g.world.signals[0].intensity === 0.4 && g.world.signals[0].sourceId === 'npc_1';
  })()
`));
check('a non-matching rule emits nothing and returns null', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, { signal: 'sighing', when: { mood: { below: -0.5 } }, intensity: 0.4 },
                                   'kitchen', { mood: 0.5 }, 'npc_1');
    return r === null && g.world.signals.length === 0;
  })()
`));
check('with an array, the FIRST match wins and the rest are not emitted', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, [
      { signal: 'cabinet_slam', when: { mood: { below: 0 } }, intensity: 0.7 },
      { signal: 'sighing',      when: { mood: { below: 0 } }, intensity: 0.4 },
    ], 'kitchen', { mood: -0.5 }, 'npc_1');
    return r === 'cabinet_slam' && g.world.signals.length === 1;
  })()
`), 'at most one expression per act — an NPC does not slam AND sigh in the same breath');
check('a later rule still fires when the earlier one does not match', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, [
      { signal: 'cabinet_slam', when: { mood: { below: -0.9 } }, intensity: 0.7 },
      { signal: 'humming',      when: { mood: { above: 0.2 } },  intensity: 0.3 },
    ], 'kitchen', { mood: 0.5 }, 'npc_1');
    return r === 'humming' && g.world.signals[0].id === 'humming';
  })()
`));
check('a rule naming an undeclared signal is skipped, not emitted', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, { signal: 'no_such_signal', when: { mood: { below: 0 } }, intensity: 0.4 },
                                   'kitchen', { mood: -0.5 }, 'npc_1');
    return r === null && g.world.signals.length === 0;
  })()
`));
check('an unknown room emits nothing', api(`
  (() => {
    const g = __clean();
    const r = applyDriveExpression(g, { signal: 'sighing', when: { mood: { below: 0 } }, intensity: 0.4 },
                                   'not_a_room', { mood: -0.5 }, 'npc_1');
    return r === null && g.world.signals.length === 0;
  })()
`));
check('the NPC is not touched — an expression writes to the world, never to the person', api(`
  (() => {
    const g = __clean();
    const npc = { mood: -0.5, flags: {}, needs: { hunger: 50 } };
    const before = JSON.stringify(npc);
    applyDriveExpression(g, { signal: 'sighing', when: { mood: { below: 0 } }, intensity: 0.4 },
                         'kitchen', npc, 'npc_1');
    return JSON.stringify(npc) === before;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\n(D3) an expression RIDES ALONG — it never occupies the tick');
// The whole invariant, stated as a difference: run the same npc-tick twice on
// identical state, once with the table and once with it stripped, and the only
// thing that may differ is the signal buffer. Not the chosen drive, not the
// cooldown, not the pursuit, not the events.
api(`
  // A miserable NPC whose needs make a sighing drive the obvious choice, in a
  // room that exists, on a block those drives are allowed in.
  __tickPair = (mood) => {
    const run = (strip) => {
      const g = __mk();
      g.world.signals = [];
      const id = __ids(g)[0];
      const saved = {};
      if (strip) for (const [k, d] of Object.entries(DRIVE_DEFS)) if (d.expresses) { saved[k] = d.expresses; delete d.expresses; }
      try {
        const npc = { ...g.npcs[id], mood, flags: {},
                      needs: { hunger: 20, hygiene: 20, energy: 20, social: 20, comfort: 20, stimulation: 20 } };
        const r = evaluateDrives(npc, id, g.npcs, __res('leisure', 'living_room'), g, () => 0.5, 0);
        return {
          fired: JSON.stringify((r.updatedNpc.flags || {})[DRIVE_COOLDOWN_KEY] || {}),
          npc: JSON.stringify(r.updatedNpc),
          events: JSON.stringify(r.events),
          activity: JSON.stringify(r.activityOverride),
          location: JSON.stringify(r.locationOverride),
          commitment: JSON.stringify(g.npcs[id].commitment || null),
          signals: JSON.stringify(g.world.signals),
        };
      } finally { for (const [k, e] of Object.entries(saved)) DRIVE_DEFS[k].expresses = e; }
    };
    return { withExpr: run(false), without: run(true) };
  };
`);
const PAIR_LOW = JSON.parse(api(`JSON.stringify(__tickPair(-0.9))`));
check('the expression layer actually fired on this tick (the assertions below are not vacuous)',
      PAIR_LOW.withExpr.signals !== PAIR_LOW.without.signals,
      `with: ${PAIR_LOW.withExpr.signals}  without: ${PAIR_LOW.without.signals}`);
check('the drive chosen is the same with the table and without',
      PAIR_LOW.withExpr.fired === PAIR_LOW.without.fired,
      `${PAIR_LOW.withExpr.fired} vs ${PAIR_LOW.without.fired}`);
check('...and the NPC comes out byte-identical (no cooldown of its own, no mood cost)',
      PAIR_LOW.withExpr.npc === PAIR_LOW.without.npc);
check('...and no event is produced', PAIR_LOW.withExpr.events === PAIR_LOW.without.events,
      'an expression is perceived, not narrated — the scene reader picks it up as a signal');
check('...and the commitment opened is the same',
      PAIR_LOW.withExpr.commitment === PAIR_LOW.without.commitment,
      'Plan 3\'s one-action-per-tick guarantee: an NPC can sigh WHILE doing laundry');
check('...and the activity and location overrides are the same',
      PAIR_LOW.withExpr.activity === PAIR_LOW.without.activity &&
      PAIR_LOW.withExpr.location === PAIR_LOW.without.location);
check('no cooldown is ever stamped under a signal name', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], mood: -0.9, flags: {},
                  needs: { hunger: 20, hygiene: 20, energy: 20, social: 20, comfort: 20, stimulation: 20 } };
    const r = evaluateDrives(npc, id, g.npcs, __res('leisure', 'living_room'), g, () => 0.5, 0);
    const stamps = Object.keys((r.updatedNpc.flags || {})[DRIVE_COOLDOWN_KEY] || {});
    return stamps.every(k => !SIGNAL_DEFS[k]);
  })()
`));
// R2/D18. The decision is arithmetic; nothing in this plan may reach the model
// from inside the tick.
check('the tick never reaches the model', api(`
  (() => {
    let calls = 0;
    const orig = root.generateText;
    root.generateText = () => { calls++; return Promise.resolve('{}'); };
    try {
      let g = __mk();
      g = resolveBatch(g, 48).state;
      return calls === 0;
    } finally { root.generateText = orig; }
  })()
`), 'R2 — the tick stays synchronous, pure and LLM-free');

// ---------------------------------------------------------------------------
console.log('\nthe emotional channel propagates like any other signal (Plan 1, unchanged)');
// Placed by the same arithmetic as SIGNALS_EMIT's comment, and read from the
// table rather than restated: sound attenuates 0.5 a hop and a closed door
// costs a further factor at BOTH ends of it.
api(`
  __hear = (g, from, at, sig, intensity) => {
    g.world.signals = [];
    emitTransient(g, { id: sig, roomId: from, intensity, sourceId: 'npc_1' });
    return perceiveSignals(g, 'player', at).find(r => r.signalId === sig) || null;
  };
  __exprIntensity = (sig) => {
    for (const r of __rules()) if (r.rule.signal === sig) return r.rule.intensity;
    return null;
  };
`);
check('a sigh is heard in the room it happens in', api(`
  (() => { const g = __mk(); return !!__hear(g, 'living_room', 'living_room', 'sighing', __exprIntensity('sighing')); })()
`));
// The bedroom/hallway pair is DERIVED from the adjacency graph rather than
// named. These three assertions hardcoded bedroom_2 → hallway_a, and the
// floorplan overhaul moved bedroom_2 to the south wing: __hear across a
// non-edge returns null, so "a sigh does NOT carry" kept passing for the
// WRONG REASON while "a slam DOES carry" failed honestly. A derived pair is
// the only way this contrast keeps testing what it claims to.
const BR = api(`ALL_ROOMS.find(r => ROOMS[r].type === 'bedroom' && !ROOMS[r].isPlayer)`);
const HALL = api(`(ROOM_ADJACENCY['${BR}'] || [])[0]`);
check(`a sigh does NOT carry through a closed bedroom door (${BR}→${HALL})`, api(`
  (() => {
    const g = __mk();
    __door(g, '${BR}', 'unlocked');
    return __hear(g, '${HALL}', '${BR}', 'sighing', __exprIntensity('sighing')) === null;
  })()
`), 'the brief: noticeable in the room, private through a door — a sigh is not an announcement');
// The authored contrast, and the reason there are three signals rather than
// one. A slam is the expression that reaches you somewhere else.
check('a slammed cabinet DOES carry through that same closed door', api(`
  (() => {
    const g = __mk();
    __door(g, '${BR}', 'unlocked');
    return !!__hear(g, '${HALL}', '${BR}', 'cabinet_slam', __exprIntensity('cabinet_slam'));
  })()
`), 'if both stopped at the door the three signals would be one signal in three costumes');
check('...but not through a LOCKED one', api(`
  (() => {
    const g = __mk();
    __door(g, '${BR}', 'locked');
    return __hear(g, '${HALL}', '${BR}', 'cabinet_slam', __exprIntensity('cabinet_slam')) === null;
  })()
`));
check('a sigh fades with distance rather than stopping at a wall', api(`
  (() => {
    const g = __mk();
    const near = reachMultipliers(g, 'living_room', 'sound')['kitchen'] || 0;
    const far  = reachMultipliers(g, 'bedroom_1', 'sound')['kitchen'] || 0;
    return near > far;
  })()
`));
check('every expression signal decays — none of them can outlive the mood', api(`
  __rules().every(r => SIGNAL_DEFS[r.rule.signal].decayPerTick > 0)
`));
// Derived from each def's own decay, so retuning the decay retunes the test.
check('a sigh is over quickly and humming lingers — the authored difference holds', api(`
  (() => {
    const ticks = (id, i) => i / SIGNAL_DEFS[id].decayPerTick;
    return ticks('humming', __exprIntensity('humming')) > ticks('sighing', __exprIntensity('sighing'));
  })()
`), 'someone humming to themselves goes on for a while; a sigh is over the moment it happens');
check('every expression signal has prose for all three bands', api(`
  __rules().every(r => ['faint','clear','strong'].every(b =>
    Array.isArray(SIGNAL_DEFS[r.rule.signal].phrases[b]) && SIGNAL_DEFS[r.rule.signal].phrases[b].length > 0))
`), 'the scene reader renders these — a band with no phrase renders as nothing at all');

// ---------------------------------------------------------------------------
console.log('\none definition, and the footprint reads in one place');
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');
const SRCFILES = fs.readdirSync(path.join(__dirname, '..', '..', 'src', 'srcfiles')).filter(f => f.endsWith('.js'));
check('applyDriveExpression is defined once, in drives.js',
      SRCFILES.filter(f => /function applyDriveExpression\(/.test(srcOf(f))).length === 1 &&
      /function applyDriveExpression\(/.test(srcOf('drives.js')));
check('EXPRESSION_SOURCES is defined once, in drives.js',
      SRCFILES.filter(f => /const EXPRESSION_SOURCES\b/.test(srcOf(f))).length === 1 &&
      /const EXPRESSION_SOURCES\b/.test(srcOf('drives.js')));
// The verify-c4 technique, applied to the third member of the family: whatever
// else moves, the three halves of an act's footprint stay next to each other.
const EXPR_CALLS = (() => {
  const src = srcOf('drives.js');
  const at = [];
  for (let i = src.indexOf('applyDriveExpression('); i !== -1; i = src.indexOf('applyDriveExpression(', i + 1)) {
    if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;   // the definition, not a call
    at.push(/emitTransient\(|applyDriveLeaves\(/.test(src.slice(Math.max(0, i - 1500), i)));
  }
  return at;
})();
check(`both applyDriveExpression call sites sit beside the act's other footprints (${EXPR_CALLS.length} found)`,
      EXPR_CALLS.length >= 2 && EXPR_CALLS.every(Boolean),
      'emitsSignal, leaves and expresses are three halves of one act — the standard resolver and tryEatFood');
check('nothing outside drives.js applies an expression',
      SRCFILES.filter(f => f !== 'drives.js' && /applyDriveExpression\(/.test(srcOf(f))).length === 0);

// ---------------------------------------------------------------------------
console.log(`\nit reaches the world: ${HOUSES} households x ${DAYS} untouched in-game days`);
api(`
  __run = (opts) => {
    opts = opts || {};
    const emitted = [];
    const orig = applyDriveExpression;
    applyDriveExpression = function (gameState, expresses, roomId, npc, npcId) {
      const r = orig(gameState, expresses, roomId, npc, npcId);
      if (r) emitted.push({ sig: r, npcId, room: roomId });
      return r;
    };
    // Forcing mood at the point the layer reads it is the only way to sample a
    // mood the cast does not naturally reach in a week — the distribution is
    // mildly positive and its tails are thin (see EXPRESSION_MOOD's note).
    const origEval = evaluateDrives;
    if (typeof opts.mood === 'number') {
      evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, o2) {
        return origEval({ ...npc, mood: opts.mood }, npcId, npcs, resolved, gameState, rng, currentTick, o2);
      };
    }
    let residentDays = 0;
    try {
      for (let i = 0; i < ${HOUSES}; i++) {
        let g = __mk(20260811 + i * 7919);
        const n = __ids(g).length;
        for (let d = 0; d < ${DAYS}; d++) { g = resolveBatch(g, ${DAY}).state; residentDays += n; }
      }
    } finally { applyDriveExpression = orig; evaluateDrives = origEval; }
    const by = {};
    for (const e of emitted) by[e.sig] = (by[e.sig] || 0) + 1;
    return { total: emitted.length, by, residentDays,
             npcs: new Set(emitted.map(e => e.npcId)).size,
             rooms: new Set(emitted.map(e => e.room)).size };
  };
`);
const LIVE = JSON.parse(api(`JSON.stringify(__run())`));
const STRIPPED = JSON.parse(api(`
  (() => {
    const saved = {};
    for (const [k, d] of Object.entries(DRIVE_DEFS)) if (d.expresses) { saved[k] = d.expresses; delete d.expresses; }
    try { return JSON.stringify(__run()); }
    finally { for (const [k, e] of Object.entries(saved)) DRIVE_DEFS[k].expresses = e; }
  })()
`));
console.log(`  ${LIVE.total} expressions over ${LIVE.residentDays} resident-days ` +
            `(${(LIVE.total / LIVE.residentDays).toFixed(3)} per NPC per day), ` +
            `${LIVE.npcs} distinct NPCs, ${LIVE.rooms} distinct rooms`);
console.log(`  by signal: ${Object.entries(LIVE.by).map(([s, n]) => `${s} ${n}`).join(', ')}`);

const SIGNALS_AUTHORED = [...new Set(RULES.map(r => r.rule.signal))];
check(`the flat makes an emotional noise at all (${LIVE.total} over ${LIVE.residentDays} resident-days)`,
      LIVE.total > 0,
      'Phase 1\'s entire goal is that the apartment stops being silent between player actions');
check('and it is the expression table putting them there, not something else in the tick',
      STRIPPED.total === 0,
      `${STRIPPED.total} emissions with every \`expresses\` stripped, same seeds`);
// R8/RI6, made behavioural. This plan opens with two flags that have never
// caused anything to happen; an authored signal that never fires is the same
// defect one layer down.
for (const sig of SIGNALS_AUTHORED) {
  check(`'${sig}' is not dead content — it fires on a real population (${LIVE.by[sig] || 0}x)`,
        (LIVE.by[sig] || 0) > 0,
        'a rule whose threshold sits outside the range its source reaches is the defect D6 exists to prevent');
}
check(`the whole cast expresses, not one dramatic roommate (${LIVE.npcs} distinct NPCs)`,
      LIVE.npcs >= LIVE.residentDays / DAYS * 0.5,
      `${LIVE.npcs} of ${LIVE.residentDays / DAYS} residents`);
check(`it happens all over the flat (${LIVE.rooms} distinct rooms)`, LIVE.rooms >= 4);
// A BAND, not a number: Phase 6 owns the rate and a pinned figure would report
// its retune as a regression (README rule 4/5). The ceiling is structural —
// one expression per act, and the cast averages ~2.75 acts per NPC per day.
check('the rate is inside the structural ceiling of one expression per act',
      LIVE.total / LIVE.residentDays > 0 && LIVE.total / LIVE.residentDays < 3,
      `${(LIVE.total / LIVE.residentDays).toFixed(3)} per NPC per day`);

// ---------------------------------------------------------------------------
console.log('\nand it is MOOD that drives it (paired runs, same seeds, mood forced)');
const MISERABLE = JSON.parse(api(`JSON.stringify(__run({ mood: -0.95 }))`));
const CONTENT = JSON.parse(api(`JSON.stringify(__run({ mood: 0.95 }))`));
const NEUTRAL = JSON.parse(api(`JSON.stringify(__run({ mood: (EXPRESSION_MOOD.low + EXPRESSION_MOOD.high) / 2 }))`));
console.log(`  miserable cast: ${JSON.stringify(MISERABLE.by)}`);
console.log(`  content cast  : ${JSON.stringify(CONTENT.by)}`);
console.log(`  ordinary day  : ${JSON.stringify(NEUTRAL.by)} (mood inside the dead band)`);
const LOW_SIGNALS = [...new Set(RULES.filter(r => Object.values(r.rule.when).some(c => c.below !== undefined)).map(r => r.rule.signal))];
const HIGH_SIGNALS = [...new Set(RULES.filter(r => Object.values(r.rule.when).some(c => c.above !== undefined)).map(r => r.rule.signal))];
check(`a miserable cast emits the low-mood signals (${LOW_SIGNALS.join(', ')}) and none of the high-mood ones`,
      LOW_SIGNALS.every(s => (MISERABLE.by[s] || 0) > 0) && HIGH_SIGNALS.every(s => (MISERABLE.by[s] || 0) === 0),
      JSON.stringify(MISERABLE.by));
check(`a contented one emits the high-mood signals (${HIGH_SIGNALS.join(', ')}) and none of the low-mood ones`,
      HIGH_SIGNALS.every(s => (CONTENT.by[s] || 0) > 0) && LOW_SIGNALS.every(s => (CONTENT.by[s] || 0) === 0),
      JSON.stringify(CONTENT.by));
check('an ordinary day is SILENT — the dead band is real',
      NEUTRAL.total === 0,
      `${NEUTRAL.total} expressions at a mood between the two bands — if this is non-zero the layer is always on`);

// ---------------------------------------------------------------------------
console.log('\n(D11) npcDisinhibition — one model, for a cast that has no baked deviantLevel');
check('npcDisinhibition is defined once, in sim.js',
      SRCFILES.filter(f => /function npcDisinhibition\(/.test(srcOf(f))).length === 1 &&
      /function npcDisinhibition\(/.test(srcOf('sim.js')));
check('disinhibitionFromTemperament is defined once, in sim.js',
      SRCFILES.filter(f => /function disinhibitionFromTemperament\(/.test(srcOf(f))).length === 1 &&
      /function disinhibitionFromTemperament\(/.test(srcOf('sim.js')));
// The whole reason D11 exists: the roommate cast has no baked value at all, so
// anything gated on `deviantLevel` alone is dead for everyone the player lives
// with. Assert the premise, or the fix is unmoored from the problem.
check('the generated roommate cast still has NO baked deviantLevel', api(`
  (() => {
    const g = __mk();
    return __ids(g).every(id => typeof g.npcs[id].bible.deviantLevel !== 'number');
  })()
`), 'if this ever changes, D11\'s derivation is redundant and should be revisited');
const SPREAD = JSON.parse(api(`
  (() => {
    const vals = [];
    for (let i = 0; i < 20; i++) {
      const g = __mk(20260811 + i * 7919);
      for (const id of __ids(g)) vals.push(npcDisinhibition(g.npcs[id]));
    }
    vals.sort((a, b) => a - b);
    return JSON.stringify({ n: vals.length, min: vals[0], max: vals[vals.length - 1],
                            mean: vals.reduce((s, x) => s + x, 0) / vals.length });
  })()
`));
console.log(`  ${SPREAD.n} residents: ${SPREAD.min.toFixed(3)} .. ${SPREAD.max.toFixed(3)}, mean ${SPREAD.mean.toFixed(3)}`);
check(`it spans a real range across a generated cast (${SPREAD.min.toFixed(2)}..${SPREAD.max.toFixed(2)})`,
      SPREAD.max - SPREAD.min > 0.4,
      'a derived axis that comes out flat is a gate everyone passes or nobody does');
check('...centred near the middle, so neither path is the default',
      SPREAD.mean > 0.35 && SPREAD.mean < 0.65, `mean ${SPREAD.mean.toFixed(3)}`);
check('an exactly average temperament is exactly 0.5', api(`
  npcDisinhibition({ bible: { temperament: { volatility: 0, openness: 0, assertiveness: 0,
                                             warmth: 0, conscientiousness: 0, selfAwareness: 0 } } }) === 0.5
`));
check('it is clamped to [0, 1] at both extremes', api(`
  (() => {
    const at = (v) => npcDisinhibition({ bible: { temperament: {
      volatility: v, openness: v, assertiveness: v, warmth: v, conscientiousness: v, selfAwareness: v } } });
    return at(1) <= 1 && at(1) > 0.9 && at(-1) >= 0 && at(-1) < 0.1;
  })()
`));
check('a missing temperament does not throw and lands at the midpoint',
      api(`npcDisinhibition({}) === 0.5 && npcDisinhibition(undefined) === 0.5`));
// The weights mean what they say: each weighted axis moves it, and an axis the
// table does not weight does not.
check('every weighted axis moves it, in the direction the table declares', api(`
  Object.entries(AH_HOT_SINGLES_TUNING.deviantWeights).every(([axis, w]) => {
    const at = (v) => npcDisinhibition({ bible: { temperament: { [axis]: v } } });
    return w > 0 ? at(0.8) > at(-0.8) : at(0.8) < at(-0.8);
  })
`));
check('an axis the table does not weight does not move it', api(`
  (() => {
    const weighted = Object.keys(AH_HOT_SINGLES_TUNING.deviantWeights);
    const unweighted = ['warmth', 'conscientiousness', 'selfAwareness'].filter(a => !weighted.includes(a));
    return unweighted.length > 0 && unweighted.every(axis =>
      npcDisinhibition({ bible: { temperament: { [axis]: 0.9 } } }) ===
      npcDisinhibition({ bible: { temperament: { [axis]: -0.9 } } }));
  })()
`));
check('a BAKED deviantLevel wins, so Hot Singles keep their authored value', api(`
  (() => {
    const t = { volatility: -1, openness: -1, assertiveness: -1 };
    const derived = npcDisinhibition({ bible: { temperament: t } });
    const baked = npcDisinhibition({ bible: { temperament: t, deviantLevel: 0.9 } });
    return baked === 0.9 && derived < 0.1;
  })()
`));
check('...and a baked value out of range is still clamped', api(`
  npcDisinhibition({ bible: { deviantLevel: 4 } }) === 1 &&
  npcDisinhibition({ bible: { deviantLevel: -4 } }) === 0
`));
// The npcCuriosity lesson: one definition, several callers, so two copies
// cannot drift. COMPUTER bakes deviantLevel; it must bake it with THIS.
check('the weighting has exactly one home, and createExternalNpc bakes with it', api(`
  (() => {
    const g = __mk();
    g.meta.clock = g.meta.clock || { day: 0, minutes: 0 };
    const npc = createExternalNpc(g, 'hot_single_test', 'seed_i1', 'barista', { deviant: 0.5 });
    return typeof npc.bible.deviantLevel === 'number' &&
           npc.bible.deviantLevel === disinhibitionFromTemperament(npc.bible.temperament) &&
           npcDisinhibition(npc) === npc.bible.deviantLevel;
  })()
`), 'the arithmetic moved out of computer.js — a second copy there would drift the two populations apart');
check('no file restates the weights as literals', api(`
  Object.keys(AH_HOT_SINGLES_TUNING.deviantWeights).length === 3
`) && SRCFILES.filter(f => /0\.5\s*\+\s*0\.5\s*\*\s*\(\s*0\.4\s*\*/.test(srcOf(f))).length === 0,
      'the inline copy in createExternalNpc is what D11 replaced');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
