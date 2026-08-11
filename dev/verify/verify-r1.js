// Scene reader plan Phase 1 verification — the scene model.
const { loadEngine } = require('./loadgame.js');
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
    openScene(g, g.player.location);
    return g;
  };
  // The real addLogEntry lives in ui.js (needs a DOM). Mirror its stamping
  // exactly — this is the contract Phase 1 adds, so it is worth stating twice.
  __log = (g, type, text, speaker) => {
    const scene = currentScene(g);
    g.meta.sessionLog.push({ type, text, speaker,
      day: g.meta.clock.day, minutes: g.meta.clock.minutes,
      sceneId: scene.id, roomId: scene.roomId });
  };
  __set = (g, room, defId, key, val) => {
    for (const o of Object.values(g.objects['room_' + room] || {})) {
      if (o.defId === defId) o.state = { ...o.state, [key]: val };
    }
  };
  __g = __mk();
`);

console.log('\nPurity — composeScene reads, never writes (invariant 1)');
const before = api(`JSON.stringify(__g)`);
api(`composeScene(__g, { active: [], ambient: [], engagement: {} }); sceneHistory(__g); currentScene(__g);`);
check('gameState is byte-identical after composing', api(`JSON.stringify(__g)`) === before);
check('it calls no model', api(`
  (() => { let called = false;
           const real = root.generateText; root.generateText = () => { called = true; };
           composeScene(__g, { active: [], ambient: [], engagement: {} });
           root.generateText = real; return !called; })()
`));

console.log('\nHeading');
api(`__g.player.location = 'kitchen'; openScene(__g, 'kitchen'); __s = composeScene(__g, { active: [], ambient: [] });`);
check('names the room the player is in', api(`__s.heading.roomName`) === 'Kitchen',
      api(`__s.heading.roomName`));
check('carries day, time and phase', api(`
  typeof __s.heading.dayLabel === 'string' && __s.heading.dayLabel.length > 0
  && /\\d/.test(__s.heading.timeLabel) && typeof __s.heading.phase === 'string'
`), JSON.stringify(api(`__s.heading`)));
check('and the scene id', typeof api(`__s.heading.sceneId`) === 'number');

console.log('\nPresence lines (D5)');
api(`
  __res = Object.entries(__g.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
  __g.npcs[__res[0]].location = 'kitchen';
  __g.npcs[__res[0]].activity = 'making coffee';
  __g.npcs[__res[1]].location = 'kitchen';
  __g.npcs[__res[1]].activity = 'skincare routine';
  __g.npcs[__res[2]].location = 'living_room';
  __s = composeScene(__g, { active: [], ambient: [] });
`);
check('one line per character present, and only those present',
      api(`__s.presence.length`) === 2, JSON.stringify(api(`__s.presence.map(p => p.line)`)));
check('the default frame reads correctly',
      api(`__s.presence.some(p => /is making coffee\\.$/.test(p.line))`),
      JSON.stringify(api(`__s.presence.map(p => p.line)`)));
check('PRESENCE_PHRASES overrides the ones that read badly',
      api(`__s.presence.some(p => /skincare routine\\.$/.test(p.line) && !/is skincare/.test(p.line))`),
      'the default would produce "X is skincare routine"');
check('an activity-less character still gets a line', api(`
  (() => {
    const g = __mk();
    const id = Object.keys(g.npcs)[0];
    g.npcs[id].location = g.player.location;
    g.npcs[id].activity = '';
    return composeScene(g, {}).presence.some(p => /is here\\.$/.test(p.line));
  })()
`));
check('every PRESENCE_PHRASES template has a {name} slot', api(`
  Object.values(PRESENCE_PHRASES).every(t => t.includes('{name}'))
`));

console.log('\nSensory lines come from Plan 1, ranked and capped (D6)');
api(`
  __g2 = __mk();
  __g2.player.location = 'kitchen';
  openScene(__g2, 'kitchen');
  __set(__g2, 'kitchen', 'fridge', 'rotten_food', 'rotten');
  __set(__g2, 'kitchen', 'sink_kitchen', 'dishes', 'many');
  __set(__g2, 'kitchen', 'stove', 'burner', 'filthy');
  __s2 = composeScene(__g2, {});
`);
check('perceived signals become prose lines', api(`__s2.sensory.length`) > 0,
      JSON.stringify(api(`__s2.sensory.map(s => s.phrase)`)));
check('each carries its authored phrase', api(`
  __s2.sensory.every(s => typeof s.phrase === 'string' && s.phrase.length > 0)
`));
check('ordered by salience, strongest first', api(`
  (() => { for (let i = 1; i < __s2.sensory.length; i++)
             if (__s2.sensory[i].salience > __s2.sensory[i-1].salience) return false;
           return true; })()
`), JSON.stringify(api(`__s2.sensory.map(s => [s.signalId, +s.salience.toFixed(2)])`)));
check('capped at maxSensoryLines when nothing is callout-worthy', api(`
  (() => {
    const overCap = __s2.sensory.length > SCENE_READER.maxSensoryLines;
    const calloutCount = __s2.callouts.length;
    return !overCap || __s2.sensory.length === Math.max(SCENE_READER.maxSensoryLines, calloutCount);
  })()
`), `${api(`__s2.sensory.length`)} lines, cap ${api(`SCENE_READER.maxSensoryLines`)}, ${api(`__s2.callouts.length`)} callouts`);
check('a signal from another room is attributed to it', api(`
  (() => {
    const g = __mk();
    g.player.location = 'dining';
    openScene(g, 'dining');
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    const s = composeScene(g, {});
    const rot = s.sensory.find(x => x.signalId === 'rot');
    return rot && rot.here === false && rot.sourceRoomName === 'Kitchen';
  })()
`));
check('a clean, quiet room produces no sensory lines', api(`
  (() => {
    const g = __mk();
    for (const bucket of Object.values(g.objects))
      for (const o of Object.values(bucket)) {
        for (const k of ['rotten_food','dishes','burner','clutter','made','fill','clean','grime','clarity'])
          if (o.state?.[k] !== undefined) o.state[k] = OBJECT_DEFS[o.defId].states[k][0];
      }
    g.player.location = 'study';
    openScene(g, 'study');
    return composeScene(g, {}).sensory.length === 0;
  })()
`));

console.log('\nCallouts (D11) — emphasis, not removal');
api(`
  __g3 = __mk();
  __g3.player.location = 'kitchen';
  openScene(__g3, 'kitchen');
  spawnNote(__g3, { roomId: 'kitchen', authorId: 'player', text: 'BINS. PLEASE.' });
  __s3 = composeScene(__g3, {});
`);
check('an unread note clears the callout bar',
      api(`__s3.callouts.some(c => c.signalId === 'note')`),
      JSON.stringify(api(`__s3.sensory.map(s => [s.signalId, +s.salience.toFixed(2)])`)));
check('and still appears in the passage', api(`__s3.sensory.some(s => s.signalId === 'note')`),
      'a callout is emphasis, not removal');
check('every callout is at or above calloutSalience', api(`
  __s3.callouts.every(c => c.salience >= SCENE_READER.calloutSalience)
`));
check('reading it drops it below the bar', api(`
  (() => {
    for (const o of Object.values(__g3.objects['room_kitchen'])) if (o.defId === 'note') o.state.read = 'read';
    const s = composeScene(__g3, {});
    return s.callouts.length === 0 && s.sensory.some(x => x.signalId === 'note');
  })()
`), 'still visible, no longer shouting');
check('ordinary mess never reaches the bar', api(`
  (() => {
    const g = __mk();
    g.player.location = 'kitchen'; openScene(g, 'kitchen');
    __set(g, 'kitchen', 'sink_kitchen', 'dishes', 'many');
    __set(g, 'kitchen', 'stove', 'burner', 'filthy');
    return composeScene(g, {}).callouts.length === 0;
  })()
`), 'if everything shouts, nothing does');
check('an already-shouted signal is suppressed (D12 hook)', api(`
  (() => {
    const g = __mk();
    g.player.location = 'kitchen'; openScene(g, 'kitchen');
    spawnNote(g, { roomId: 'kitchen', text: 'x' });
    const loud = composeScene(g, {}).callouts.length;
    g.meta.scene.shouted = ['note'];
    const quiet = composeScene(g, {}).callouts.length;
    return loud > 0 && quiet === 0;
  })()
`));

console.log('\nBeats belong to the scene they happened in (D2)');
api(`
  __g4 = __mk();
  __g4.player.location = 'kitchen'; openScene(__g4, 'kitchen');
  __log(__g4, 'narration', 'You move to the Kitchen.');
  __log(__g4, 'dialogue', 'Oh — hey.', 'Hana');
  __sceneA = currentScene(__g4).id;
  __g4.player.location = 'living_room'; openScene(__g4, 'living_room');
  __log(__g4, 'narration', 'You move to the Living Room.');
  __sceneB = currentScene(__g4).id;
  __s4 = composeScene(__g4, {});
`);
check('moving rooms opens a new scene', api(`__sceneB`) > api(`__sceneA`),
      `${api(`__sceneA`)} -> ${api(`__sceneB`)}`);
check('the open scene holds only its own beats',
      api(`__s4.beats.length`) === 1 && /Living Room/.test(api(`__s4.beats[0].text`)),
      JSON.stringify(api(`__s4.beats.map(b => b.text)`)));
check('every entry is stamped with time, room and scene', api(`
  __g4.meta.sessionLog.every(e => typeof e.minutes === 'number' && typeof e.sceneId === 'number' && !!e.roomId)
`), JSON.stringify(api(`__g4.meta.sessionLog[0]`)));
check('the move beat lands in the scene it OPENS, not the one it closes', api(`
  __g4.meta.sessionLog.find(e => /Living Room/.test(e.text)).sceneId === __sceneB
`), 'openScene must be called before addLogEntry in doMove');
check('re-entering the room you are already in does not fragment history', api(`
  (() => {
    const g = __mk();
    g.player.location = 'kitchen';
    const first = openScene(g, 'kitchen').id;
    const again = openScene(g, 'kitchen').id;
    return first === again;
  })()
`));

console.log('\nHistory is derived from the log, never stored');
const hist = api(`__s4.history`);
check('closed scenes appear in history', hist.length === 1 && hist[0].sceneId === api(`__sceneA`),
      JSON.stringify(hist));
check('with their room and time', hist[0].roomName === 'Kitchen' && /\d/.test(hist[0].timeLabel),
      JSON.stringify(hist[0]));
check('and a beat count', hist[0].beatCount === 2, `got ${hist[0].beatCount}`);
check('newest first', api(`
  (() => {
    const g = __mk();
    for (const room of ['kitchen','living_room','dining','study']) { g.player.location = room; openScene(g, room); __log(g, 'narration', 'in ' + room); }
    const h = composeScene(g, {}).history;
    for (let i = 1; i < h.length; i++) if (h[i].sceneId > h[i-1].sceneId) return false;
    return h.length === 3;
  })()
`));
check('capped at historyScenes', api(`
  (() => {
    const g = __mk();
    for (let i = 0; i < 30; i++) { const room = i % 2 ? 'kitchen' : 'living_room'; g.player.location = room; openScene(g, room); __log(g, 'narration', 'beat ' + i); }
    return composeScene(g, {}).history.length <= SCENE_READER.historyScenes;
  })()
`));
check('nothing about a closed scene is stored anywhere', api(`
  !('scenes' in __g4.meta) && !('sceneLog' in __g4.meta)
`), 'history must be derivable from the log alone (RI3)');

console.log('\nSaves written before this plan');
check('FOLDER_VERSIONS.meta bumped to 2', api(`FOLDER_VERSIONS.meta`) === 2);
check('a 1->2 migration is registered', api(`MIGRATIONS.meta.some(m => m.to === 2)`));
check('it seeds a scene', api(`
  (() => {
    const legacy = { seed: 1, clock: { day: 5, minutes: 600 }, sessionLog: [] };
    const out = MIGRATIONS.meta.find(m => m.to === 2).fn(legacy);
    return !!out.scene && out.scene.startedDay === 5 && Array.isArray(out.scene.shouted);
  })()
`));
check('it does not clobber an existing scene', api(`
  (() => {
    const already = { clock: { day: 1, minutes: 0 }, scene: { id: 9, roomId: 'kitchen', shouted: ['note'] } };
    return MIGRATIONS.meta.find(m => m.to === 2).fn(already).scene.id === 9;
  })()
`));
check('a migrated null room resolves lazily to where the player is', api(`
  (() => {
    const g = __mk();
    g.meta.scene = { id: 1, roomId: null, startedDay: 1, startedMinutes: 0, shouted: [] };
    g.player.location = 'balcony';
    return currentScene(g).roomId === 'balcony' && g.meta.scene.roomId === null;
  })()
`), 'derived, not written back — a folder migration cannot know the room');
check('pre-plan log entries read as scene 0 and land in history', api(`
  (() => {
    const g = __mk();
    g.meta.sessionLog = [{ type: 'narration', text: 'old beat', day: 1 }];
    g.meta.scene = { id: 1, roomId: 'kitchen', startedDay: 1, startedMinutes: 0, shouted: [] };
    const s = composeScene(g, {});
    return s.beats.length === 0 && s.history.length === 1 && s.history[0].roomName === 'Earlier';
  })()
`), 'their room and time were never recorded; do not invent them');

console.log('\nComposition cost');
check('composeScene is cheap enough to call on every render', (() => {
  const t0 = Date.now();
  api(`for (let i = 0; i < 1000; i++) composeScene(__g2, {});`);
  const per = (Date.now() - t0) / 1000;
  console.log(`        ${(per * 1000).toFixed(0)}µs per call`);
  return per < 2;
})());

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
