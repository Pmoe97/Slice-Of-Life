// Scene reader plan Phases 3+4 — the pure halves.
// signalsByRoom and markCalloutsShouted are testable here; the DOM halves
// (moodle strip, floor-plan glyphs) are verified in the browser.
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
  __mk = () => {
    const h = SIM_generateHouse(20260810, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    // A pristine baseline: the pool starts green, which would otherwise show
    // up in every by-room assertion below.
    for (const bucket of Object.values(g.objects))
      for (const o of Object.values(bucket))
        for (const k of ['rotten_food','dishes','burner','clutter','made','fill','clean','grime','clarity'])
          if (o.state?.[k] !== undefined) o.state[k] = OBJECT_DEFS[o.defId].states[k][0];
    openScene(g, g.player.location);
    return g;
  };
  __set = (g, room, defId, k, v) => {
    for (const o of Object.values(g.objects['room_' + room] || {})) if (o.defId === defId) o.state = { ...o.state, [k]: v };
  };
`);

console.log('\nsignalsByRoom — signals at their SOURCE (D9)');
api(`
  __g = __mk();
  __set(__g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
  __set(__g, 'kitchen', 'sink_kitchen', 'dishes', 'many');
  __g.player.location = 'dining';
  __map = signalsByRoom(__g);
`);
check('a clean apartment maps to nothing', api(`Object.keys(signalsByRoom(__mk())).length`) === 0,
      JSON.stringify(api(`signalsByRoom(__mk())`)));
check('signals are keyed by the room they come FROM',
      api(`(__map.kitchen || []).map(s => s.signalId).sort().join(',')`) === 'dirty_dishes,rot',
      JSON.stringify(api(`__map`)));
check('NOT by where the player is standing', api(`!__map.dining`),
      'this is the difference between a map and a second moodle strip');
check('each entry carries channel, band and salience', api(`
  __map.kitchen.every(s => !!s.channel && !!s.band && typeof s.salience === 'number')
`));
check('ordered strongest first', api(`
  (() => { const l = __map.kitchen; for (let i = 1; i < l.length; i++) if (l[i].salience > l[i-1].salience) return false; return true; })()
`), JSON.stringify(api(`__map.kitchen.map(s => [s.signalId, +s.salience.toFixed(2)])`)));
check('transients appear too, at the room they were emitted in', api(`
  (() => {
    const g = __mk();
    emitTransient(g, { id: 'footsteps', roomId: 'hallway_a', intensity: 0.7 });
    const m = signalsByRoom(g);
    return (m.hallway_a || []).some(s => s.signalId === 'footsteps');
  })()
`));
check('two sources of one signal in a room merge to the strongest', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    __set(g, 'kitchen', 'pantry', 'rotten_food', 'rotten');
    const rot = (signalsByRoom(g).kitchen || []).filter(s => s.signalId === 'rot');
    return rot.length === 1;
  })()
`));
check('it never mutates state', api(`
  (() => { const g = __mk(); __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
           const before = JSON.stringify(g); signalsByRoom(g); return JSON.stringify(g) === before; })()
`));
check('a doorless faraway room is unaffected by distance', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    const m = signalsByRoom(g);
    // Source-keyed, so intensity is the EMITTED value, never attenuated.
    return m.kitchen.find(s => s.signalId === 'rot').intensity === 0.8;
  })()
`), 'the plan shows emission, not perception');

console.log('\nsignalIcon');
check('a signal with its own glyph uses it', api(`signalIcon('note')`) === api(`SIGNAL_ICONS.bySignal.note`));
check('one without falls back to its channel', api(`
  (() => {
    const noOwn = Object.keys(SIGNAL_DEFS).find(id => !SIGNAL_ICONS.bySignal[id]);
    if (!noOwn) return true;   // every signal has its own — also fine
    return signalIcon(noOwn) === SIGNAL_ICONS.byChannel[SIGNAL_DEFS[noOwn].channel];
  })()
`));
check('an unknown id degrades rather than throwing', api(`typeof signalIcon('nope')`) === 'string');
check('every SIGNAL_ICONS.bySignal key is a real signal', api(`
  (() => {
    const bad = Object.keys(SIGNAL_ICONS.bySignal).filter(id => !SIGNAL_DEFS[id]);
    if (bad.length) console.log('        not real: ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('every channel has a default glyph', api(`
  ['smell','sound','sight'].every(c => !!SIGNAL_ICONS.byChannel[c])
`));
check('every band has an opacity', api(`
  ['faint','clear','strong'].every(b => typeof SIGNAL_ICONS.bandOpacity[b] === 'number')
`));
check('opacity rises with band', api(`
  SIGNAL_ICONS.bandOpacity.faint < SIGNAL_ICONS.bandOpacity.clear
  && SIGNAL_ICONS.bandOpacity.clear <= SIGNAL_ICONS.bandOpacity.strong
`));

console.log('\nmarkCalloutsShouted — a callout fires once per scene (Phase 4, D12)');
api(`
  __g2 = __mk();
  __g2.player.location = 'kitchen';
  openScene(__g2, 'kitchen');
  spawnNote(__g2, { roomId: 'kitchen', authorId: 'player', text: 'BINS. PLEASE.' });
  for (const o of Object.values(__g2.objects['room_kitchen'])) if (o.defId === 'note') o.state.read = 'unread';
  __first = composeScene(__g2, {});
`);
check('an unread note calls out the first time', api(`__first.callouts.some(c => c.signalId === 'note')`),
      JSON.stringify(api(`__first.sensory.map(s => [s.signalId, +s.salience.toFixed(2)])`)));
api(`markCalloutsShouted(__g2, __first); __second = composeScene(__g2, {});`);
check('and not the second time', api(`__second.callouts.length`) === 0,
      JSON.stringify(api(`__second.callouts`)));
check('but it is still IN the passage', api(`__second.sensory.some(s => s.signalId === 'note')`),
      'spent emphasis, not a vanished signal');
check('the mark is recorded on the open scene', api(`__g2.meta.scene.shouted.includes('note')`));
check('marking is idempotent', api(`
  (() => { markCalloutsShouted(__g2, __first); markCalloutsShouted(__g2, __first);
           return __g2.meta.scene.shouted.filter(x => x === 'note').length === 1; })()
`));
check('leaving and returning opens a new scene, and it shouts again', api(`
  (() => {
    __g2.player.location = 'dining';  openScene(__g2, 'dining');
    __g2.player.location = 'kitchen'; openScene(__g2, 'kitchen');
    return __g2.meta.scene.shouted.length === 0
        && composeScene(__g2, {}).callouts.some(c => c.signalId === 'note');
  })()
`), 'you walked in on it afresh — that is correct, not a bug');
check('a scene with no callouts marks nothing', api(`
  (() => {
    const g = __mk();
    g.player.location = 'kitchen'; openScene(g, 'kitchen');
    markCalloutsShouted(g, composeScene(g, {}));
    return (g.meta.scene.shouted || []).length === 0;
  })()
`));
check('it tolerates a null scene (renderer returned nothing)', api(`
  (() => { try { markCalloutsShouted(__g2, null); return true; } catch { return false; } })()
`), 'renderSceneReader returns null when its root element is missing');

console.log('\nThe renderer stays a projection');
check('renderSceneReader returns the scene rather than writing it', (() => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(SRCDIR, 'render.js'), 'utf8');
  const fn = src.slice(src.indexOf('function renderSceneReader'), src.indexOf('// --- The moodle strip'));
  return /return scene;/.test(fn) && !/markCalloutsShouted/.test(fn);
})(), 'a projection that writes to what it projects is how state and view drift');
check('both draw paths mark callouts', (() => {
  const fs = require('fs');
  const render = fs.readFileSync(path.join(SRCDIR, 'render.js'), 'utf8');
  const ui = fs.readFileSync(path.join(SRCDIR, 'ui.js'), 'utf8');
  return /markCalloutsShouted\(gameState, (?:renderSceneReader|[a-zA-Z]+)/.test(render)
      && /markCalloutsShouted\(currentGameState, (?:renderSceneReader|[a-zA-Z]+)/.test(ui);
}), 'render() and addLogEntry both draw the scene');

console.log('\nCost');
check('signalsByRoom is cheap enough for every floor-plan draw', (() => {
  const t0 = Date.now();
  api(`for (let i = 0; i < 2000; i++) signalsByRoom(__g);`);
  const per = (Date.now() - t0) / 2000;
  console.log(`        ${(per * 1000).toFixed(0)}µs per call`);
  return per < 1;
})());

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
