// Perception plan Phase 1 verification — the signal substrate.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __h = SIM_generateHouse(20260810, 3);
  __gs = { meta: { seed: __h.seed, clock: __h.clock }, player: __h.player,
           npcs: __h.npcs, world: __h.world, objects: __h.objects };
  __set = (roomId, defId, key, val) => {
    for (const o of Object.values(__gs.objects['room_' + roomId] || {})) {
      if (o.defId === defId) o.state = { ...o.state, [key]: val };
    }
  };
  __door = (roomId, lock) => {
    for (const o of Object.values(__gs.objects['room_' + roomId] || {})) {
      if (o.defId === 'bedroom_door' || o.defId === 'bathroom_door') o.state = { ...o.state, lock };
    }
  };
  __rot = (room) => perceiveSignals(__gs, 'player', room).find(r => r.signalId === 'rot') || null;
`);

console.log('\nStanding signals derive from real object state (D1)');
// A freshly inherited apartment is NOT clean — Phase 2 gave the neglected
// swimming pool an emitter, and it starts green. That is the intended opening
// state (the recreation wing is part of what the player is inheriting), so
// these assertions scope to the kitchen rather than expecting global silence.
const kitchenSignals = () => api(`deriveStandingSignals(__gs).filter(s => s.roomId === 'kitchen')`);
check('a fresh apartment already smells of the neglected pool',
      api(`deriveStandingSignals(__gs).some(s => s.signalId === 'stagnant_water' && s.roomId === 'pool_room')`),
      'the day-one apartment should announce its own disrepair');
check('but the kitchen starts quiet', kitchenSignals().length === 0,
      `emitted: ${JSON.stringify(kitchenSignals())}`);
api(`__set('kitchen', 'fridge', 'rotten_food', 'rotten');`);
const emitted = kitchenSignals();
check('spoiling the fridge emits a rot signal', emitted.length === 1 && emitted[0].signalId === 'rot',
      `emitted: ${JSON.stringify(emitted)}`);
check('it is attributed to the right room and object',
      emitted[0].roomId === 'kitchen' && emitted[0].sourceId.length > 0);
api(`__set('kitchen', 'fridge', 'rotten_food', 'none');`);
check('cleaning it up removes the signal with NO cleanup call',
      kitchenSignals().length === 0,
      'this is the whole point of derived-not-stored');
api(`__set('kitchen', 'fridge', 'rotten_food', 'rotten');`);

console.log('\nDerivation and perception are pure — they never write state (RI3)');
const before = api(`JSON.stringify(__gs)`);
api(`deriveStandingSignals(__gs); perceiveSignals(__gs, 'player', 'kitchen'); perceiveSignals(__gs, Object.keys(__gs.npcs)[0], 'living_room');`);
check('gameState is byte-identical after querying', api(`JSON.stringify(__gs)`) === before);

console.log('\nPropagation attenuates with distance (D4/D5)');
const inRoom = api(`__rot('kitchen')`);
const oneHop = api(`__rot('dining')`);
const twoHop = api(`__rot('living_room')`);
check('in the source room it is strong', inRoom && inRoom.band === 'strong',
      `got ${inRoom && inRoom.band} @ ${inRoom && inRoom.intensity}`);
check('one hop away it is weaker but still clear', oneHop && oneHop.band === 'clear' && oneHop.intensity < inRoom.intensity,
      `got ${oneHop && oneHop.band} @ ${oneHop && oneHop.intensity}`);
check('two hops away it is fainter still', twoHop && twoHop.band === 'faint' && twoHop.intensity < oneHop.intensity,
      `got ${twoHop && twoHop.band} @ ${twoHop && twoHop.intensity}`);
check('far across the apartment it is gone', api(`__rot('pool_room')`) === null);
check('the record names where it came from', oneHop.sourceRoomId === 'kitchen' && oneHop.here === false);
check('and flags a source in the same room as here', inRoom.here === true);

console.log('\nDoors attenuate, and locked doors attenuate harder (D6)');
const doorMult = (room, ch, lock) => {
  api(`__door('${room}', '${lock}');`);
  return api(`reachMultipliers(__gs, '${room}', '${ch}')['hallway_a'] || 0`);
};
for (const ch of ['smell', 'sound']) {
  const open = doorMult('bedroom_2', ch, 'unlocked');
  const locked = doorMult('bedroom_2', ch, 'locked');
  check(`${ch}: a locked door blocks more than an unlocked one`, locked < open,
        `unlocked ${open.toFixed(3)} vs locked ${locked.toFixed(3)}`);
}
api(`__door('bedroom_2', 'unlocked');`);
check('a doorless room is NOT penalised as if it had a door', api(`
  (() => {
    const save = __gs.objects['room_bedroom_2'];
    __gs.objects['room_bedroom_2'] = {};
    const noDoor = reachMultipliers(__gs, 'bedroom_2', 'smell')['hallway_a'] || 0;
    __gs.objects['room_bedroom_2'] = save;
    const withDoor = reachMultipliers(__gs, 'bedroom_2', 'smell')['hallway_a'] || 0;
    return noDoor > withDoor;
  })()
`), 'getDoorState returns "unlocked" for a doorless room — roomDoorFactor must not');
// `undefined` here is the strongest possible pass: the room never even made it
// into the reach map, because the product fell under SIGNAL_TUNING.floor. The
// first version of this assertion compared the raw value with `<`, and
// `undefined < 0.01` is false — it failed on the best possible outcome.
check('a door blocks sight essentially completely', api(`
  (reachMultipliers(__gs, 'bedroom_2', 'sight')['hallway_a'] || 0) < 0.01
`), `got ${api(`String(reachMultipliers(__gs, 'bedroom_2', 'sight')['hallway_a'])`)}`);

console.log('\nChannels behave differently (D5)');
api(`__set('kitchen', 'sink_kitchen', 'dishes', 'many');`);
check('sight does not leave its room',
      api(`perceiveSignals(__gs, 'player', 'kitchen').some(r => r.signalId === 'dirty_dishes')`) === true &&
      api(`perceiveSignals(__gs, 'player', 'dining').some(r => r.signalId === 'dirty_dishes')`) === false);
check('smell outruns sight from the same room', api(`
  (reachMultipliers(__gs, 'dining', 'smell')['kitchen'] || 0) > (reachMultipliers(__gs, 'dining', 'sight')['kitchen'] || 0)
`));
check('sound sits between the two', api(`
  (() => { const s = reachMultipliers(__gs, 'dining', 'smell')['kitchen'];
           const o = reachMultipliers(__gs, 'dining', 'sound')['kitchen'];
           const v = reachMultipliers(__gs, 'dining', 'sight')['kitchen'];
           return s > o && o > v; })()
`));

console.log('\nAttention gates, it does not scale (D8)');
check('player and NPC go through ONE query function', api(`
  (() => {
    const npcId = Object.keys(__gs.npcs)[0];
    const a = perceiveSignals(__gs, 'player', 'kitchen');
    const b = perceiveSignals(__gs, npcId, 'kitchen');
    // Same shape, same reported intensity — only whether a record survives differs.
    return a.length > 0 && b.length > 0 && a[0].intensity === b[0].intensity;
  })()
`), 'the reported intensity is the world truth, identical for every perceiver');
check('a keener perceiver notices strictly more, never less', api(`
  (() => {
    const dull = { needs: { energy: 50 }, bible: { temperament: { openness: -1, conscientiousness: 1 } } };
    const keen = { needs: { energy: 50 }, bible: { temperament: { openness: 1, conscientiousness: -1 } } };
    __gs.npcs.__dull = dull; __gs.npcs.__keen = keen;
    const d = perceiveSignals(__gs, '__dull', 'living_room').length;
    const k = perceiveSignals(__gs, '__keen', 'living_room').length;
    delete __gs.npcs.__dull; delete __gs.npcs.__keen;
    return k >= d;
  })()
`));
check('an incurious NPC is not rendered blind', api(`
  getNpcPerception({ needs: { energy: 50 }, bible: { temperament: { openness: -1, conscientiousness: 1 } } })
`) > api(`NPC_PEEP_TUNING.perception.min`),
      'raw curiosity applied undamped clamped them to the floor');
check('NPC attention sits in a comparable band to the player', api(`
  (() => {
    const vals = Object.values(__gs.npcs).filter(n => n.bible).map(n => getNpcPerception(n));
    return Math.min(...vals) > 0.1 && Math.max(...vals) < 0.8;
  })()
`), `cast: ${JSON.stringify(api(`Object.values(__gs.npcs).filter(n=>n.bible).map(n => +getNpcPerception(n).toFixed(2))`))}`);

console.log('\nThe curiosity formula is shared, not duplicated (Phase 1 refactor)');
check('npcCuriosity is a real function', api(`typeof npcCuriosity`) === 'function');
check('tryNpcPeep and trySnoopPhone no longer inline it', (() => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(SRCDIR, 'drives.js'), 'utf8');
  return !/chanceModifiers\.openness\s*\+/.test(src);
})(), 'an inline copy of the openness/conscientiousness formula survives in drives.js');

console.log('\nProse is authored, banded and deterministic (R1/D3/D13)');
const p1 = api(`signalPhrase(__rot('kitchen'), __gs)`);
const p2 = api(`signalPhrase(__rot('kitchen'), __gs)`);
check('the same condition reads the same way twice in a day', p1 === p2 && p1.length > 0, `"${p1}" vs "${p2}"`);
check('the phrase matches the band it was drawn for',
      api(`SIGNAL_DEFS.rot.phrases.strong`).includes(p1), `"${p1}"`);
check('a different band draws different prose', api(`
  (() => {
    const strong = signalPhrase(__rot('kitchen'), __gs);
    const faint  = signalPhrase(__rot('living_room'), __gs);
    return strong !== faint && SIGNAL_DEFS.rot.phrases.faint.includes(faint);
  })()
`));
check('wording varies across days', api(`
  (() => {
    const seen = new Set();
    for (let d = 1; d <= 12; d++) { __gs.meta.clock.day = d; seen.add(signalPhrase(__rot('kitchen'), __gs)); }
    __gs.meta.clock.day = 1;
    return seen.size > 1;
  })()
`), 'a standing condition that never rewords reads as a bug');
check('every SIGNAL_DEFS entry has prose for every band', api(`
  Object.entries(SIGNAL_DEFS).every(([id, d]) =>
    ['faint','clear','strong'].every(b => Array.isArray(d.phrases[b]) && d.phrases[b].length > 0))
`));

console.log('\nRI1 — every declared signal has a reachable emitter');
// Scoped to STANDING signals — those without a decayPerTick. Transient defs
// are emitted by drives/actions/events, not by object state, and verify-s3
// owns checking that they all have emitters. Each harness checks its own
// phase's contract rather than three copies of one enumeration.
check('no STANDING signal is orphaned', api(`
  (() => {
    const emitted = new Set();
    for (const def of Object.values(OBJECT_DEFS)) {
      for (const byValue of Object.values(def.emits || {})) {
        for (const payload of Object.values(byValue)) emitted.add(payload.signal);
      }
    }
    const standing = Object.entries(SIGNAL_DEFS).filter(([, d]) => !d.decayPerTick).map(([id]) => id);
    const orphans = standing.filter(s => !emitted.has(s));
    if (orphans.length) console.log('        orphaned: ' + orphans.join(', '));
    return orphans.length === 0;
  })()
`));
check('every emits payload names a declared signal', api(`
  (() => {
    const bad = [];
    for (const [defId, def] of Object.entries(OBJECT_DEFS)) {
      for (const byValue of Object.values(def.emits || {})) {
        for (const payload of Object.values(byValue)) {
          if (!SIGNAL_DEFS[payload.signal]) bad.push(defId + '->' + payload.signal);
        }
      }
    }
    if (bad.length) console.log('        undeclared: ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('every emits state value is one the object can actually hold', api(`
  (() => {
    const bad = [];
    for (const [defId, def] of Object.entries(OBJECT_DEFS)) {
      for (const [key, byValue] of Object.entries(def.emits || {})) {
        const allowed = def.states?.[key];
        if (!allowed) { bad.push(defId + '.' + key + ' (no such state)'); continue; }
        for (const val of Object.keys(byValue)) {
          if (!allowed.includes(val)) bad.push(defId + '.' + key + '=' + val);
        }
      }
    }
    if (bad.length) console.log('        unreachable: ' + bad.join(', '));
    return bad.length === 0;
  })()
`), 'an emits keyed to a value the object can never hold is a dead emitter');

console.log('\nHousekeeping');
check('two sources of one signal in a room merge to one record', api(`
  (() => {
    __set('kitchen', 'fridge', 'rotten_food', 'rotten');
    __set('kitchen', 'pantry', 'rotten_food', 'rotten');
    const raw = perceiveSignals(__gs, 'player', 'kitchen').filter(r => r.signalId === 'rot');
    const merged = mergePerceived(perceiveSignals(__gs, 'player', 'kitchen')).filter(r => r.signalId === 'rot');
    __set('kitchen', 'pantry', 'rotten_food', 'none');
    return raw.length >= 1 && merged.length === 1;
  })()
`));
check('records arrive sorted by salience', api(`
  (() => {
    const rs = perceiveSignals(__gs, 'player', 'kitchen');
    for (let i = 1; i < rs.length; i++) if (rs[i].salience > rs[i-1].salience) return false;
    return rs.length > 1;
  })()
`));
check('an unknown room yields nothing rather than throwing',
      api(`perceiveSignals(__gs, 'player', 'not_a_room').length`) === 0);
check('an unknown perceiver yields nothing rather than throwing',
      api(`perceiveSignals(__gs, 'nobody', 'kitchen').length`) === 0);
check('perception is cheap enough for a per-NPC-per-tick call', (() => {
  const t0 = Date.now();
  api(`for (let i = 0; i < 2000; i++) perceiveSignals(__gs, 'player', 'living_room');`);
  const per = (Date.now() - t0) / 2000;
  console.log(`        ${(per * 1000).toFixed(0)}µs per call`);
  return per < 1;
})());

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
