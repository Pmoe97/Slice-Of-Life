// NPC cognition plan, Phase 4 — closing the loop.
//
//   node dev/verify/verify-c4.js
//
// Plan 1 built signal propagation and Plan 3's D8 made perceived signals score.
// None of it did anything on a house the player had not personally dirtied:
// after seven untouched in-game days there were ZERO dirty objects and ZERO rot
// in the entire apartment, so `clean_common` and `investigate_smell` had nothing
// to be candidates for and the perception term scored 0 forever. Phase 4 gave
// drives a standing trace (`leaves`, D19) so the cast dirties its own flat.
//
// This file was written after the fact — the phase shipped verified against a
// scratch script that was never committed, so the numbers in the plan's Handoff
// had no standing assertion behind them. Two of them had already moved by the
// time this was written (Phase 5's retune took mess equilibrium down), which is
// exactly why the behavioural section below asserts RELATIONSHIPS — leaves vs a
// leaves-stripped counterfactual on the same seeds — rather than the magic
// numbers a later tuning phase will move again.
//
// The structural half (D19's ladder, D20's rot clearing, D21's walk leg) is
// cheap and exact and runs first; the behavioural half needs the long run.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js', 'sim.js', 'signals.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const HOUSES = 8, TICKS = 336, DAY = 48;

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
  __find = (g, room, defId) => Object.values(g.objects['room_' + room] || {}).find(o => o.defId === defId);

  // "Dirty" is DERIVED, never a literal list of state values: an object whose
  // CURRENT state value appears in its own def's emits table is one the world
  // can be perceived through. measure-cognition.js spent its whole life
  // hardcoding 'heavy' where the ladder said 'cluttered' (README rule 5); this
  // cannot drift from defs.world.js because it reads it.
  __dirtyCount = (g) => {
    let n = 0;
    for (const objs of Object.values(g.objects)) for (const o of Object.values(objs)) {
      const emits = OBJECT_DEFS[o.defId] && OBJECT_DEFS[o.defId].emits;
      if (!emits) continue;
      for (const [k, byValue] of Object.entries(emits)) {
        const cur = o.state && o.state[k];
        if (cur !== undefined && byValue[cur]) { n++; break; }
      }
    }
    return n;
  };
  __dirtCapable = (g) => {
    let n = 0;
    for (const objs of Object.values(g.objects)) for (const o of Object.values(objs))
      if (OBJECT_DEFS[o.defId] && OBJECT_DEFS[o.defId].emits) n++;
    return n;
  };
  __setTemper = (g, axis, v) => {
    for (const n of Object.values(g.npcs))
      if (n.bible && n.bible.temperament) n.bible.temperament = { ...n.bible.temperament, [axis]: v };
    return g;
  };

  // Sampled once per in-game DAY rather than per tick: "mess-house-days" is the
  // dirty-object count at each day boundary, summed over households. A per-tick
  // sum would be dominated by how long a single dish sits there.
  __run = (houses, opts) => {
    opts = opts || {};
    const rows = [];
    const orig = evaluateDrives;
    evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, o2) {
      const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
      const res = orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, o2);
      const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
      // Stamps are absolute minutes (npc-initiative-retiming D2); the within-day
      // currentTick can no longer identify one.
      const nowAbs = clockToAbsolute(gameState.meta.clock);
      rows.push({ npcId, fired: Object.keys(after).filter(d => after[d] === nowAbs && before[d] !== nowAbs) });
      return res;
    };
    let messHouseDays = 0, maxAtOnce = 0, capable = 0;
    try {
      for (let i = 0; i < houses; i++) {
        let g = __mk(20260811 + i * 7919);
        if (opts.axis) __setTemper(g, opts.axis, opts.v);
        capable = __dirtCapable(g);
        for (let d = 0; d < ${TICKS} / ${DAY}; d++) {
          g = resolveBatch(g, ${DAY}).state;
          const n = __dirtyCount(g);
          messHouseDays += n;
          if (n > maxAtOnce) maxAtOnce = n;
        }
      }
    } finally { evaluateDrives = orig; }
    const byDrive = {}; const who = {};
    for (const r of rows) for (const d of r.fired) {
      byDrive[d] = (byDrive[d] || 0) + 1;
      if (d === 'investigate_smell') who[r.npcId] = 1;
    }
    return { messHouseDays, maxAtOnce, capable, byDrive,
             investigators: Object.keys(who).length, samples: rows.length };
  };
`);

const LEAVES = JSON.parse(api(`
  JSON.stringify(Object.fromEntries(Object.entries(DRIVE_DEFS)
    .filter(([, d]) => d.leaves).map(([id, d]) => [id, d.leaves])))
`));

// ---------------------------------------------------------------------------
console.log('\n(D19) the authored traces are well formed and could actually fire');
check(`${Object.keys(LEAVES).length} drive(s) declare a trace`, Object.keys(LEAVES).length >= 1,
      'Phase 4 exists to give the perception term something to score — zero traces is the phase not landing');
check('every trace names a real object def', api(`
  Object.values(DRIVE_DEFS).filter(d => d.leaves).every(d =>
    Object.keys(d.leaves).every(defId => !!OBJECT_DEFS[defId]))
`), JSON.stringify(Object.entries(LEAVES).flatMap(([id, l]) =>
      Object.keys(l).filter(defId => !api(`!!OBJECT_DEFS['${defId}']`)).map(d => `${id}.${d}`))));
check('every trace names a real state LADDER on that def (array, 2+ rungs)', api(`
  Object.values(DRIVE_DEFS).filter(d => d.leaves).every(d =>
    Object.entries(d.leaves).every(([defId, byState]) =>
      Object.keys(byState).every(k => Array.isArray(OBJECT_DEFS[defId].states && OBJECT_DEFS[defId].states[k]) &&
                                      OBJECT_DEFS[defId].states[k].length >= 2)))
`), 'applyDriveLeaves walks a ladder by index — a non-ladder state is a silent no-op');
check('every step is a positive integer', api(`
  Object.values(DRIVE_DEFS).filter(d => d.leaves).every(d =>
    Object.values(d.leaves).every(byState =>
      Object.values(byState).every(s => Number.isInteger(s) && s >= 1)))
`));
// D19's own lesson, made permanent. `sleep_recover` was authored a bed-unmade
// trace and measured 0 of 26 naps in a bedroom, so it was REMOVED rather than
// shipped as a config lie. A trace on an object that does not exist in any room
// the drive can happen in is the same defect, undetected.
check('every trace targets an object that actually exists in a generated house', api(`
  (() => {
    const g = __mk();
    const present = new Set();
    for (const objs of Object.values(g.objects)) for (const o of Object.values(objs)) present.add(o.defId);
    return Object.values(DRIVE_DEFS).filter(d => d.leaves)
      .every(d => Object.keys(d.leaves).every(defId => present.has(defId)));
  })()
`), 'a trace on an absent object is a config lie that never fires and never errors');
check('...and at least one rung of each targeted state emits a perceivable signal', api(`
  Object.values(DRIVE_DEFS).filter(d => d.leaves).every(d =>
    Object.entries(d.leaves).every(([defId, byState]) =>
      Object.keys(byState).every(k => {
        const em = OBJECT_DEFS[defId].emits && OBJECT_DEFS[defId].emits[k];
        return !!em && Object.keys(em).length > 0;
      })))
`), 'the whole point is a DERIVED standing signal — a trace nothing can perceive scores nothing');

// ---------------------------------------------------------------------------
console.log('\n(D19) a trace steps the ladder, accumulates, and saturates');
check('one application advances one rung', api(`
  (() => {
    const g = __mk();
    const sink = __find(g, 'kitchen', 'sink_kitchen');
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    sink.state = { ...sink.state, dishes: ladder[0] };
    applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'kitchen');
    return __find(g, 'kitchen', 'sink_kitchen').state.dishes === ladder[1];
  })()
`));
check('repeated acts ACCUMULATE rather than resetting to a fixed value', api(`
  (() => {
    const g = __mk();
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    const sink = __find(g, 'kitchen', 'sink_kitchen');
    sink.state = { ...sink.state, dishes: ladder[0] };
    applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'kitchen');
    const after1 = __find(g, 'kitchen', 'sink_kitchen').state.dishes;
    applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'kitchen');
    const after2 = __find(g, 'kitchen', 'sink_kitchen').state.dishes;
    return ladder.indexOf(after2) > ladder.indexOf(after1);
  })()
`), 'a trace that reset to one value would lie about every meal after the first');
// The structural half of "neither saturates within a week": mess cannot run
// away because the ladder ENDS. This is why no-spiral is a property of the
// mechanism rather than something the tuning has to keep achieving.
check('and SATURATE at the dirtiest rung, however many times it is applied', api(`
  (() => {
    const g = __mk();
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    const sink = __find(g, 'kitchen', 'sink_kitchen');
    sink.state = { ...sink.state, dishes: ladder[0] };
    for (let i = 0; i < 25; i++) applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'kitchen');
    return __find(g, 'kitchen', 'sink_kitchen').state.dishes === ladder[ladder.length - 1];
  })()
`));
check('a multi-step trace jumps that many rungs but still clamps', api(`
  (() => {
    const g = __mk();
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    __find(g, 'kitchen', 'sink_kitchen').state = { dishes: ladder[0] };
    applyDriveLeaves(g, { sink_kitchen: { dishes: 99 } }, 'kitchen');
    return __find(g, 'kitchen', 'sink_kitchen').state.dishes === ladder[ladder.length - 1];
  })()
`));
check('a trace applied to a room the object is not in changes nothing', api(`
  (() => {
    const g = __mk();
    const before = JSON.stringify(g.objects);
    applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'living_room');
    return JSON.stringify(g.objects) === before;
  })()
`));
check('the room\'s derived cleanliness is refreshed when a trace lands', api(`
  (() => {
    const g = __mk();
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    __find(g, 'kitchen', 'sink_kitchen').state = { dishes: ladder[0] };
    const before = g.world.rooms.kitchen && g.world.rooms.kitchen.cleanliness;
    applyDriveLeaves(g, { sink_kitchen: { dishes: ladder.length - 1 === 1 ? 1 : 2 } }, 'kitchen');
    const after = g.world.rooms.kitchen && g.world.rooms.kitchen.cleanliness;
    return typeof after === 'number' && after !== before;
  })()
`), 'the same D7 hook a player action that dirties an object uses');
check('the standing signal is DERIVED from the state — nothing is stored', api(`
  (() => {
    const g = __mk();
    const ladder = OBJECT_DEFS.sink_kitchen.states.dishes;
    __find(g, 'kitchen', 'sink_kitchen').state = { dishes: ladder[0] };
    const clean = deriveStandingSignals(g, 'kitchen').some(s => s.signalId === 'dirty_dishes');
    applyDriveLeaves(g, { sink_kitchen: { dishes: 1 } }, 'kitchen');
    const dirty = deriveStandingSignals(g, 'kitchen').some(s => s.signalId === 'dirty_dishes');
    return !clean && dirty;
  })()
`), 'so a trace needs no cleanup path — clear the mess and the signal stops being derivable');

// ---------------------------------------------------------------------------
console.log('\n(D19) a drive\'s full footprint reads in one place');
const fs = require('fs');
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');
const SRCFILES = fs.readdirSync(path.join(__dirname, '..', '..', 'src', 'srcfiles')).filter(f => f.endsWith('.js'));
check('applyDriveLeaves is defined once, in drives.js',
      SRCFILES.filter(f => /function applyDriveLeaves\(/.test(srcOf(f))).length === 1 &&
      /function applyDriveLeaves\(/.test(srcOf('drives.js')));
// The transient half (emitsSignal) and the standing half (leaves) are the same
// act. They are applied in two places — the standard resolver and tryEatFood,
// which returns before the generic handler — and in BOTH the two sit together.
const LEAVES_CALLS = (() => {
  const src = srcOf('drives.js');
  const at = [];
  for (let i = src.indexOf('applyDriveLeaves('); i !== -1; i = src.indexOf('applyDriveLeaves(', i + 1)) {
    if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;   // the definition, not a call
    at.push(/emitTransient\(/.test(src.slice(Math.max(0, i - 1500), i)));
  }
  return at;
})();
check(`both applyDriveLeaves call sites sit beside the act's transient emission (${LEAVES_CALLS.length} found)`,
      LEAVES_CALLS.length >= 2 && LEAVES_CALLS.every(Boolean),
      'leaves and emitsSignal are the standing and transient halves of one act (D19) — ' +
      'the standard resolver and tryEatFood, which returns before the generic handler');
check('nothing outside drives.js writes a trace',
      SRCFILES.filter(f => f !== 'drives.js' && /applyDriveLeaves\(/.test(srcOf(f))).length === 0);

// ---------------------------------------------------------------------------
console.log('\n(D20) investigate_smell clears EVERY rot-emitting state, not just rotten_food');
// The bin is the natural rot source for an untouched house — starter groceries
// rot on a month's timescale under fridge preservation, far too slow to feed
// the loop. The old resolver only understood `rotten_food`, so a full bin an
// NPC had followed their nose to read as "nothing to do" forever.
const ROT_STATES = JSON.parse(api(`
  (() => {
    const out = {};
    for (const [defId, def] of Object.entries(OBJECT_DEFS)) {
      if (!def.emits || !def.states) continue;
      for (const [k, byValue] of Object.entries(def.emits)) {
        if (Object.values(byValue || {}).some(p => p && p.signal === 'rot')) (out[defId] = out[defId] || []).push(k);
      }
    }
    return JSON.stringify(out);
  })()
`));
check(`rot is emitted by ${Object.keys(ROT_STATES).length} object def(s), across ${Object.values(ROT_STATES).flat().length} state key(s)`,
      Object.values(ROT_STATES).flat().length >= 2,
      JSON.stringify(ROT_STATES) + ' — if only one, D20\'s "every rot-emitting state" has nothing to prove');
// Driven per state key, derived from the emits table: whichever states can
// smell, the resolver must be able to clear each of them.
for (const [defId, keys] of Object.entries(ROT_STATES)) {
  for (const stateKey of keys) {
    check(`a dirty '${stateKey}' on ${defId} is cleared when the NPC is standing over it`, api(`
      (() => {
        const g = __mk();
        const id = __ids(g)[0];
        const obj = __find(g, 'kitchen', '${defId}');
        if (!obj) return true;                        // not in this house; nothing to assert
        const ladder = OBJECT_DEFS['${defId}'].states['${stateKey}'];
        obj.state = { ...obj.state, ['${stateKey}']: ladder[ladder.length - 1] };
        refreshRoomCleanliness(g, 'kitchen');
        const npc = { ...g.npcs[id], flags: {} };
        const perceived = mergePerceived(perceiveSignals(g, id, 'kitchen'));
        if (!perceived.some(p => p.signalId === 'rot')) return false;
        const r = tryInvestigateSmell(npc, id, __res('leisure', 'kitchen'), g, perceived);
        return !!r && __find(g, 'kitchen', '${defId}').state['${stateKey}'] === ladder[0];
      })()
    `), `the resolver must derive what to reset from the def's emits table, not name '${stateKey}' literally`);
  }
}
check('a dead end (a perceived record whose object is gone) still sets the cooldown', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], flags: {},
                  needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    // A rot record naming an object that does not exist: the livelock Phase 2's
    // unconditional cooldown-set existed to prevent.
    const ghost = [{ signalId: 'rot', intensity: 0.9, salience: 0.9,
                     sourceRoomId: 'kitchen', sourceId: 'no_such_object_at_all' }];
    const r = tryInvestigateSmell(npc, id, __res('leisure', 'kitchen'), g, ghost);
    return r === null;
  })()
`), 'returning null is what makes evaluateDrives set the cooldown and stop re-choosing it');

// ---------------------------------------------------------------------------
console.log('\n(D21) a walk leg is progress, not a finished act');
// The room to walk FROM is derived, not named. A full bin's rot is intensity
// 0.5 at source and attenuates to 0.275 one room out, which reaches the
// kitchen's neighbours and nowhere further — the first draft of this test stood
// the NPC in the living room, perceived nothing at all, and read as a broken
// walk leg rather than as a smell that simply does not carry that far. Ask the
// propagation model which rooms can smell it instead of assuming.
api(`
  __smellFrom = (g) => {
    const id = __ids(g)[0];
    for (const room of Object.keys(ROOMS)) {
      const p = mergePerceived(perceiveSignals(g, id, room));
      const rot = p.find(x => x.signalId === 'rot');
      if (rot && rot.sourceRoomId && rot.sourceRoomId !== room) return { room, rot, perceived: p };
    }
    return null;
  };
  // EVERY rot-emitting state on the bin, at its dirtiest rung. A bin that is
  // merely full emits rot at 0.5, which attenuates to 0.275 one room out and
  // scores ~0.40 against an actionThreshold of exactly 0.40 — so the drive was
  // not chosen, leg 1 did nothing, and the cooldown assertion below passed
  // VACUOUSLY because a drive that never ran sets no cooldown. Maximising the
  // source is what makes the walk leg genuinely reachable from a neighbouring
  // room; the assertions now also require that the walk actually happened.
  __fullBin = (g) => {
    const def = OBJECT_DEFS.trash_kitchen;
    const bin = __find(g, 'kitchen', 'trash_kitchen');
    const state = { ...bin.state };
    for (const [k, byValue] of Object.entries(def.emits)) {
      if (!Object.values(byValue || {}).some(p => p && p.signal === 'rot')) continue;
      const ladder = def.states[k];
      if (Array.isArray(ladder)) state[k] = ladder[ladder.length - 1];
    }
    bin.state = state;
    refreshRoomCleanliness(g, 'kitchen');
    return def.states.fill;
  };
`);
check('a room exists that can smell the bin without being in it', api(`
  (() => { const g = __mk(); __fullBin(g); return !!__smellFrom(g); })()
`), 'if nothing carries, the two-step walk cannot be exercised at all');
check('following a distant smell returns stillWalking', api(`
  (() => {
    const g = __mk();
    __fullBin(g);
    const from = __smellFrom(g);
    if (!from) return false;
    const npc = { ...g.npcs[__ids(g)[0]], flags: {} };
    const r = tryInvestigateSmell(npc, __ids(g)[0], __res('leisure', from.room), g, from.perceived);
    return !!r && r.stillWalking === true && r.locationOverride === from.rot.sourceRoomId;
  })()
`), 'the NPC has to get there before they can bin it — arriving is a whole tick\'s work');
check('a real clearing does NOT return stillWalking', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const ladder = OBJECT_DEFS.trash_kitchen.states.fill;
    __find(g, 'kitchen', 'trash_kitchen').state = { fill: ladder[ladder.length - 1] };
    refreshRoomCleanliness(g, 'kitchen');
    const npc = { ...g.npcs[id], flags: {} };
    const perceived = mergePerceived(perceiveSignals(g, id, 'kitchen'));
    const r = tryInvestigateSmell(npc, id, __res('leisure', 'kitchen'), g, perceived);
    return !!r && !r.stillWalking;
  })()
`));
// The regression this decision exists for: Phase 2's blanket setCooldown made
// the second step of the two-step walk impossible, so the resolver could walk
// toward a smell and then never be chosen again to clear it.
check('evaluateDrives sets NO cooldown on a walk leg', api(`
  (() => {
    const g = __mk();
    __fullBin(g);
    const from = __smellFrom(g);
    if (!from) return false;
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], flags: {},
                  needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    const r = evaluateDrives(npc, id, g.npcs, __res('leisure', from.room), g, () => 0.5, 0);
    const stamps = (r.updatedNpc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
    // The walk must actually have HAPPENED, or "no cooldown was set" is just
    // what a drive that never ran looks like.
    return r.locationOverride === from.rot.sourceRoomId && stamps.investigate_smell === undefined;
  })()
`), 'Phase 2\'s unconditional set made the second step of the two-step walk impossible');
check('...but a real clearing does set it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const ladder = OBJECT_DEFS.trash_kitchen.states.fill;
    __find(g, 'kitchen', 'trash_kitchen').state = { fill: ladder[ladder.length - 1] };
    refreshRoomCleanliness(g, 'kitchen');
    const npc = { ...g.npcs[id], flags: {},
                  needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    const r = evaluateDrives(npc, id, g.npcs, __res('leisure', 'kitchen'), g, () => 0.5, 0);
    const stamps = (r.updatedNpc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
    return stamps.investigate_smell === clockToAbsolute(g.meta.clock);
  })()
`), 'the livelock guard stays for everything that is not progress');
check('the two-step walk COMPLETES: walk one tick, clear the next', api(`
  (() => {
    const g = __mk();
    const ladder = __fullBin(g);
    const from = __smellFrom(g);
    if (!from) return false;
    const id = __ids(g)[0];
    let npc = { ...g.npcs[id], flags: {},
                needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    // Leg 1, from a room that can smell it: walks, and sets no cooldown.
    const r1 = evaluateDrives(npc, id, g.npcs, __res('leisure', from.room), g, () => 0.5, 0);
    npc = r1.updatedNpc;
    const walked = r1.locationOverride;
    // Leg 2, now standing in the source room on the next tick. Without D21 this
    // tick is a no-op forever: the cooldown from leg 1 excluded the drive.
    const r2 = evaluateDrives(npc, id, g.npcs, __res('leisure', walked), g, () => 0.5, 1);
    return walked === from.rot.sourceRoomId &&
           __find(g, 'kitchen', 'trash_kitchen').state.fill === ladder[0] &&
           r2.events.some(e => e.type === 'investigate_smell');
  })()
`), 'this is the whole of blocker #3 — it walked, then could never act');

// ---------------------------------------------------------------------------
console.log(`\nthe loop actually closes: ${HOUSES} households x ${TICKS / DAY} untouched in-game days`);
const withLeaves = JSON.parse(api(`JSON.stringify(__run(${HOUSES}))`));
// The counterfactual: identical seeds, every `leaves` stripped. This is what
// isolates Phase 4's contribution from everything else in the tick, and it is
// why this section needs no magic numbers.
const noLeaves = JSON.parse(api(`
  (() => {
    const saved = {};
    for (const [id, d] of Object.entries(DRIVE_DEFS)) if (d.leaves) { saved[id] = d.leaves; delete d.leaves; }
    try { return JSON.stringify(__run(${HOUSES})); }
    finally { for (const [id, l] of Object.entries(saved)) DRIVE_DEFS[id].leaves = l; }
  })()
`));
const wl = withLeaves.byDrive, nl = noLeaves.byDrive;
console.log(`  with leaves : ${withLeaves.messHouseDays} mess-house-days, max ${withLeaves.maxAtOnce} dirty at once ` +
            `(of ${withLeaves.capable} dirt-capable), investigate ${wl.investigate_smell || 0}, clean_common ${wl.clean_common || 0}`);
console.log(`  without     : ${noLeaves.messHouseDays} mess-house-days, max ${noLeaves.maxAtOnce}, ` +
            `investigate ${nl.investigate_smell || 0}, clean_common ${nl.clean_common || 0}`);

check('an untouched house ends up with a NON-ZERO amount of mess',
      withLeaves.messHouseDays > 0,
      'the Evidence baseline was 0 dirty objects and 0 rot after seven untouched days');
check('and it is the traces that put it there, not something else in the tick',
      withLeaves.messHouseDays > noLeaves.messHouseDays * 1.5,
      `${withLeaves.messHouseDays} with vs ${noLeaves.messHouseDays} without, same seeds`);
check('investigate_smell goes from never firing on an untouched house to firing sometimes',
      (nl.investigate_smell || 0) === 0 && (wl.investigate_smell || 0) > 0,
      `${nl.investigate_smell || 0} without leaves, ${wl.investigate_smell || 0} with`);
check('clean_common likewise',
      (nl.clean_common || 0) === 0 && (wl.clean_common || 0) > 0,
      `${nl.clean_common || 0} without leaves, ${wl.clean_common || 0} with`);
check(`the work is spread across the cast (${withLeaves.investigators} distinct NPCs investigated)`,
      withLeaves.investigators >= 3,
      'D21 measured 18 clears across 18 NPCs — one NPC doing all of it means a stuck pursuit, not a loop');
// NON-ABSURD, expressed structurally. The ladder ends (asserted above), so mess
// cannot run away; this is the behavioural confirmation of that, and it is a
// FRACTION of what the house could hold rather than a tuned constant. Phase 5
// already moved the absolute number once.
check(`no spiral — at worst ${withLeaves.maxAtOnce} of ${withLeaves.capable} dirt-capable objects were dirty at once`,
      withLeaves.maxAtOnce > 0 && withLeaves.maxAtOnce < withLeaves.capable * 0.25,
      'a house that saturates within a week is a loop with no brake');
check('the cast keeps up: mess does not grow without bound over the week',
      withLeaves.messHouseDays < withLeaves.capable * (TICKS / DAY) * HOUSES * 0.25,
      `${withLeaves.messHouseDays} against a saturated ceiling of ${withLeaves.capable * (TICKS / DAY) * HOUSES}`);

// ---------------------------------------------------------------------------
console.log('\nand who lives there changes how it goes (paired seeds, one axis)');
const tidy = JSON.parse(api(`JSON.stringify(__run(${HOUSES}, { axis: 'conscientiousness', v: 0.9 }))`));
const untidy = JSON.parse(api(`JSON.stringify(__run(${HOUSES}, { axis: 'conscientiousness', v: -0.9 }))`));
console.log(`  tidy   : clean_common ${tidy.byDrive.clean_common || 0}, ${tidy.messHouseDays} mess-house-days, max ${tidy.maxAtOnce}`);
console.log(`  untidy : clean_common ${untidy.byDrive.clean_common || 0}, ${untidy.messHouseDays} mess-house-days, max ${untidy.maxAtOnce}`);
check(`a tidy household cleans more than an untidy one (${tidy.byDrive.clean_common || 0} vs ${untidy.byDrive.clean_common || 0})`,
      (tidy.byDrive.clean_common || 0) > (untidy.byDrive.clean_common || 0),
      'Phase 3 authored clean_common against conscientiousness; this is that reaching the world');
check(`and lives in a cleaner flat for it (${tidy.messHouseDays} vs ${untidy.messHouseDays} mess-house-days)`,
      tidy.messHouseDays < untidy.messHouseDays,
      'the tidy cast has to actually REMOVE mess, not just perform the cleaning animation more often');
check('neither household saturates within the week',
      tidy.maxAtOnce < tidy.capable * 0.25 && untidy.maxAtOnce < untidy.capable * 0.25,
      `tidy max ${tidy.maxAtOnce}, untidy max ${untidy.maxAtOnce}, of ${tidy.capable} dirt-capable`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
