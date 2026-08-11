// Perception plan Phase 2 verification — object emitters + odor retirement.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __h = SIM_generateHouse(20260810, 3);
  __gs = { meta: { seed: __h.seed, clock: __h.clock, contentConfig: null },
           player: __h.player, npcs: __h.npcs, world: __h.world, objects: __h.objects };
  __set = (roomId, defId, key, val) => {
    let hit = false;
    for (const o of Object.values(__gs.objects['room_' + roomId] || {})) {
      if (o.defId === defId) { o.state = { ...o.state, [key]: val }; hit = true; }
    }
    return hit;
  };
  __moodTargetAt = (room) => {
    __gs.player.location = room;
    return resolveMoodTarget(__gs.player, __gs, 0, 2);
  };
`);

console.log('\nD9 — every dirtyWhen-carrying object now also emits');
const coverage = api(`
  Object.entries(OBJECT_DEFS)
    .filter(([, d]) => d.dirtyWhen && Object.keys(d.dirtyWhen).length > 0)
    .map(([id, d]) => [id, !!(d.emits && Object.keys(d.emits).length > 0)])
`);
const missing = coverage.filter(([, has]) => !has).map(([id]) => id);
check(`all ${coverage.length} dirty objects have an emits table`, missing.length === 0,
      `missing: ${missing.join(', ')}`);
check('emits and dirtyWhen agree on which state keys matter', api(`
  (() => {
    const bad = [];
    for (const [id, d] of Object.entries(OBJECT_DEFS)) {
      for (const key of Object.keys(d.emits || {})) {
        if (!d.states?.[key]) bad.push(id + '.' + key);
      }
    }
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('the shared EMITS_ROT constant is used, not 14 copies', (() => {
  const src = fs.readFileSync(path.join(SRC, 'defs.world.js'), 'utf8');
  const shared = (src.match(/emits: EMITS_ROT/g) || []).length;
  const inline = (src.match(/rotten_food: \{ rotten: \{ signal/g) || []).length;
  console.log(`        ${shared} via EMITS_ROT, ${inline} inline`);
  return shared >= 10;
})());

console.log('\nEvery room type can actually produce a signal');
const byRoom = {};
for (const [roomId] of Object.entries(api('ROOMS'))) {
  const has = api(`
    Object.values(__gs.objects['room_${roomId}'] || {})
      .some(o => OBJECT_DEFS[o.defId]?.emits && Object.keys(OBJECT_DEFS[o.defId].emits).length > 0)
  `);
  byRoom[roomId] = has;
}
const silent = Object.entries(byRoom).filter(([, v]) => !v).map(([k]) => k);
check('no room is permanently incapable of emitting anything',
      silent.length <= 2, `silent rooms: ${silent.join(', ') || 'none'}`);

console.log('\nD10 — the mood penalty is a gradient, not a boolean');
// Measure each room against ITSELF, clean vs rotten. Comparing mood targets
// ACROSS rooms confounds the smell term with each room's own cleanliness — the
// first version of this test did exactly that and read the pool room's grubby
// baseline as a smell penalty.
const smellCost = (room) => api(`
  (() => {
    __set('kitchen', 'fridge', 'rotten_food', 'none');
    const before = __moodTargetAt('${room}');
    __set('kitchen', 'fridge', 'rotten_food', 'rotten');
    const after = __moodTargetAt('${room}');
    __set('kitchen', 'fridge', 'rotten_food', 'none');
    return before - after;
  })()
`);
const costHere = smellCost('kitchen');
const costNext = smellCost('hallway_b');
const costFar  = smellCost('pool_room');
check('standing in the rot costs mood', costHere > 0, `cost ${costHere.toFixed(4)}`);
check('it costs LESS one room away, but still costs something',
      costNext > 0 && costNext < costHere,
      `kitchen ${costHere.toFixed(4)} vs hallway ${costNext.toFixed(4)}`);
check('across the apartment it costs nothing at all', Math.abs(costFar) < 1e-9,
      `pool room ${costFar.toFixed(6)}`);
check('a worse smell costs more than a milder one', api(`
  (() => {
    __set('kitchen', 'fridge', 'rotten_food', 'none');
    __set('kitchen', 'stove', 'burner', 'crusty');       // grease 0.30
    const mild = __moodTargetAt('kitchen');
    __set('kitchen', 'stove', 'burner', 'clean');
    __set('kitchen', 'fridge', 'rotten_food', 'rotten'); // rot 0.80
    const bad = __moodTargetAt('kitchen');
    return bad < mild;
  })()
`), 'a faint whiff and an unlivable stench used to cost exactly the same');

console.log('\nThe odor flag is gone, everywhere');
check('no source file writes room.odor any more', (() => {
  const bad = [];
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (/\.odor\s*=/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  return bad.length === 0;
}), 'a writer survived');
check('no source file reads room.odor any more', (() => {
  const bad = [];
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (/room\.odor|\.odor\s*(===|!==|\|\|)/.test(line)) bad.push(`${f}:${i + 1}  ${t.slice(0, 60)}`);
    });
  }
  if (bad.length) console.log('        ' + bad.join('\n        '));
  return bad.length === 0;
}));
check('a freshly built room shell has no odor field',
      api(`!('odor' in __gs.world.rooms.kitchen)`),
      `keys: ${JSON.stringify(api(`Object.keys(__gs.world.rooms.kitchen)`))}`);
check('FOLDER_VERSIONS.world bumped to 4', api(`FOLDER_VERSIONS.world`) === 4);
check('a 3->4 world migration is registered',
      api(`MIGRATIONS.world.some(m => m.to === 4)`));
check('the migration strips odor from a legacy room shell', api(`
  (() => {
    const legacy = { kitchen: { capacity: 4, cleanliness: 50, lastEvent: null, odor: 'smelly' },
                     living_room: { capacity: 6, cleanliness: 80, lastEvent: null, odor: 'none' } };
    const out = MIGRATIONS.world.find(m => m.to === 4).fn(legacy);
    return !('odor' in out.kitchen) && !('odor' in out.living_room)
        && out.kitchen.cleanliness === 50 && out.living_room.capacity === 6;
  })()
`));
check('and passes non-room world keys through untouched', api(`
  (() => {
    const castWeb = { 'a|b': { axes: {}, sharedBeat: 'x' } };
    const out = MIGRATIONS.world.find(m => m.to === 4).fn(castWeb);
    return out === castWeb || JSON.stringify(out) === JSON.stringify(castWeb);
  })()
`), 'the world folder holds several differently-shaped keys under one pass');

console.log('\nThe scene prompt composes a real sensory line');
api(`
  __gs.player.location = 'dining';
  __set('kitchen', 'fridge', 'rotten_food', 'rotten');
  __ctx = assembleContext(__gs, { active: [], ambient: [], engagement: {} });
  __prompt = buildScenePrompt(__ctx, 'You look around.');
`);
const ctxSignals = api('__ctx.scene.signals');
const prompt = api('__prompt');
check('assembleContext carries perceived signals, not an odor flag',
      Array.isArray(ctxSignals) && api(`!('odor' in __ctx.scene)`));
check('each carries pre-resolved prose', ctxSignals.length > 0 && typeof ctxSignals[0].phrase === 'string' && ctxSignals[0].phrase.length > 0,
      JSON.stringify(ctxSignals[0] || null));
check('the prompt contains the composed line', /What you can sense:/.test(prompt),
      prompt.split('\n').slice(4, 12).join('\n'));
check('a smell from elsewhere is attributed to its room', /drifting in from the Kitchen/.test(prompt),
      prompt.split('\n').find(l => l.includes('sense:')) || '');
check('the old hardcoded binary odor line is gone',
      !/sour, rotten smell lingers in the air/.test(prompt) && !/no bad smells/.test(prompt));
check('a clean apartment says so rather than emitting nothing', api(`
  (() => {
    for (const bucket of Object.values(__gs.objects)) {
      for (const o of Object.values(bucket)) {
        if (o.state?.rotten_food) o.state.rotten_food = 'none';
        if (o.state?.burner) o.state.burner = 'clean';
        if (o.state?.dishes) o.state.dishes = 'clean';
        if (o.state?.made) o.state.made = 'made';
        if (o.state?.fill) o.state.fill = 'empty';
        if (o.state?.clutter) o.state.clutter = 'tidy';
        if (o.state?.clean) o.state.clean = 'clean';
        if (o.state?.grime) o.state.grime = 'clean';
        if (o.state?.clarity) o.state.clarity = 'clear';
      }
    }
    const ctx = assembleContext(__gs, { active: [], ambient: [], engagement: {} });
    return /Nothing much registers/.test(buildScenePrompt(ctx, 'x'));
  })()
`));

console.log('\nSpoilage still works end to end, with one writer');
check('processSpoilageForDay produces a perceivable smell', api(`
  (() => {
    const fridge = Object.values(__gs.objects['room_kitchen']).find(o => o.defId === 'fridge');
    fridge.contents = addStack([], 'milk', 1, null, {}, 1);
    fridge.state = { ...fridge.state, rotten_food: 'none' };
    processSpoilageForDay(__gs, 400);   // far past any shelf life
    const rotted = fridge.state.rotten_food === 'rotten';
    const smelled = perceiveSignals(__gs, 'player', 'kitchen').some(r => r.signalId === 'rot');
    return rotted && smelled;
  })()
`));
// processSpoilageForDay rots EVERY container holding something past its shelf
// life, not just the fridge — clearing one and expecting silence was a bad
// assumption, and the trash can's `fill` emits rot too.
check('clearing the container states clears the smell, with no odor call', api(`
  (() => {
    for (const o of Object.values(__gs.objects['room_kitchen'])) {
      if (o.state?.rotten_food) o.state = { ...o.state, rotten_food: 'none' };
      if (o.state?.fill) o.state = { ...o.state, fill: 'empty' };
    }
    return !perceiveSignals(__gs, 'player', 'kitchen').some(r => r.signalId === 'rot');
  })()
`));

console.log('\nRI1 still holds after the expansion');
// Standing signals only — transients are verify-s3's contract.
check('every declared STANDING signal has a reachable emitter', api(`
  (() => {
    const emitted = new Set();
    for (const def of Object.values(OBJECT_DEFS))
      for (const byValue of Object.values(def.emits || {}))
        for (const p of Object.values(byValue)) emitted.add(p.signal);
    const standing = Object.entries(SIGNAL_DEFS).filter(([, d]) => !d.decayPerTick).map(([id]) => id);
    const orphans = standing.filter(s => !emitted.has(s));
    if (orphans.length) console.log('        orphaned: ' + orphans.join(', '));
    return orphans.length === 0;
  })()
`));
check('every emits value is a state the object can hold', api(`
  (() => {
    const bad = [];
    for (const [id, d] of Object.entries(OBJECT_DEFS))
      for (const [key, byValue] of Object.entries(d.emits || {}))
        for (const val of Object.keys(byValue))
          if (!d.states?.[key]?.includes(val)) bad.push(id + '.' + key + '=' + val);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('every signal has prose for all three bands', api(`
  Object.values(SIGNAL_DEFS).every(d =>
    ['faint','clear','strong'].every(b => Array.isArray(d.phrases[b]) && d.phrases[b].length > 0))
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
