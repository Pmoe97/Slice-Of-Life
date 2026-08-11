// Perception plan Phase 5 verification — NPC perception + signal-gated drives.
const fs = require('fs');
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
  __mk = (repair = true) => {
    const h = SIM_generateHouse(20260810, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    if (repair) for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __set = (g, room, defId, key, val) => {
    for (const o of Object.values(g.objects['room_' + room] || {})) {
      if (o.defId === defId) o.state = { ...o.state, [key]: val };
    }
  };
  __residents = (g) => Object.entries(g.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
`);

console.log('\nGates accept senses as well as needs');
check('a need gate still works unchanged (2-arg call)',
      api(`checkDriveGates(DRIVE_DEFS.sleep_recover, { needs: { energy: 12 } })`) === true &&
      api(`checkDriveGates(DRIVE_DEFS.sleep_recover, { needs: { energy: 80 } })`) === false,
      'existing callers must not break');
check('a signal gate passes when the signal is perceived strongly enough', api(`
  checkDriveGates({ gates: [{ signal: 'rot', op: 'above', threshold: 0.2 }] },
                  { needs: {} }, [{ signalId: 'rot', intensity: 0.5 }]) === true
`));
check('and fails when it is too faint', api(`
  checkDriveGates({ gates: [{ signal: 'rot', op: 'above', threshold: 0.2 }] },
                  { needs: {} }, [{ signalId: 'rot', intensity: 0.1 }]) === false
`));
check('an unperceived signal reads as 0, not as a hard failure', api(`
  checkDriveGates({ gates: [{ signal: 'rot', op: 'below', threshold: 0.2 }] },
                  { needs: {} }, []) === true
`), 'a smell you cannot detect is, to you, no smell');
check('a list gate takes the strongest of the list', api(`
  checkDriveGates({ gates: [{ signal: ['dirty_dishes', 'clutter'], op: 'above', threshold: 0.4 }] },
                  { needs: {} }, [{ signalId: 'clutter', intensity: 0.1 }, { signalId: 'dirty_dishes', intensity: 0.6 }]) === true
`));
check('need and signal gates compose with AND', api(`
  (() => {
    const d = { gates: [{ need: 'social', op: 'below', threshold: 40 },
                        { signal: 'rot', op: 'above', threshold: 0.2 }] };
    const perceived = [{ signalId: 'rot', intensity: 0.5 }];
    return checkDriveGates(d, { needs: { social: 20 } }, perceived) === true
        && checkDriveGates(d, { needs: { social: 90 } }, perceived) === false
        && checkDriveGates(d, { needs: { social: 20 } }, []) === false;
  })()
`));

console.log('\nevaluateDrives perceives through the SAME query the player uses (D7)');
check('drives.js calls perceiveSignals', (() => {
  const src = fs.readFileSync(path.join(SRCDIR, 'drives.js'), 'utf8');
  return /perceiveSignals\(gameState, npcId, location\)/.test(src);
})());
check('there is still exactly ONE perception function in the tree', (() => {
  const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');
  let defs = 0;
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(`${SRC}/${f}`, 'utf8');
    defs += (src.match(/^function perceiveSignals/gm) || []).length;
  }
  return defs === 1;
})(), 'the moment there are two, NPCs sense a different world than the player');

console.log('\nThe headline case: an NPC who can smell the mess deals with it');
api(`
  __g = __mk();
  __set(__g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
  __npc = __residents(__g)[0];
  // Put them somewhere they can smell it from — one hop, no door.
  __g.npcs[__npc].location = 'dining';
  __g.npcs[__npc].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80 };
  __smells = mergePerceived(perceiveSignals(__g, __npc, 'dining')).some(r => r.signalId === 'rot');
`);
check('they can smell it from the next room', api(`__smells`));
api(`
  __res1 = tryInvestigateSmell(__g.npcs[__npc], __npc, { location: 'dining', block: 'leisure' }, __g,
             mergePerceived(perceiveSignals(__g, __npc, 'dining')));
`);
check('step one — they head for the source room',
      api(`__res1 && __res1.locationOverride`) === 'kitchen',
      `got ${JSON.stringify(api(`__res1`))}`);
check('and the activity says why', /smell/i.test(api(`__res1.activityOverride`)),
      api(`__res1.activityOverride`));
api(`
  __g.npcs[__npc].location = 'kitchen';
  __res2 = tryInvestigateSmell(__g.npcs[__npc], __npc, { location: 'kitchen', block: 'leisure' }, __g,
             mergePerceived(perceiveSignals(__g, __npc, 'kitchen')));
`);
check('step two — standing over it, they clear the source', api(`
  Object.values(__g.objects['room_kitchen']).find(o => o.defId === 'fridge').state.rotten_food === 'none'
`));
check('and the smell is gone as a consequence, with no cleanup call',
      !api(`perceiveSignals(__g, 'player', 'kitchen').some(r => r.signalId === 'rot')`));
check('it produces a readable event', api(`__res2.events.length`) === 1 &&
      /binned/.test(api(`__res2.events[0].template`)),
      api(`__res2.events[0] && __res2.events[0].template`));
check('room cleanliness was refreshed', api(`__g.world.rooms.kitchen.cleanliness`) > 0);
check('it targets the offending container only, not a deep clean', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    __set(g, 'kitchen', 'sink_kitchen', 'dishes', 'many');
    const npc = __residents(g)[0];
    g.npcs[npc].location = 'kitchen';
    tryInvestigateSmell(g.npcs[npc], npc, { location: 'kitchen', block: 'leisure' }, g,
      mergePerceived(perceiveSignals(g, npc, 'kitchen')));
    const sink = Object.values(g.objects['room_kitchen']).find(o => o.defId === 'sink_kitchen');
    return sink.state.dishes === 'many';   // untouched
  })()
`), 'following your nose to a bad smell is not a deep clean');

console.log('\n...and one who cannot smell it does not');
check('an NPC behind a closed door two rooms away never fires', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    const npc = __residents(g)[0];
    // Dull perceiver, far away, door shut.
    g.npcs[npc].bible.temperament = { ...g.npcs[npc].bible.temperament, openness: -1, conscientiousness: 1 };
    for (const o of Object.values(g.objects['room_bedroom_2'] || {})) {
      if (o.defId === 'bedroom_door') o.state = { ...o.state, lock: 'locked' };
    }
    const perceived = mergePerceived(perceiveSignals(g, npc, 'bedroom_2'));
    const gated = checkDriveGates(DRIVE_DEFS.investigate_smell, g.npcs[npc], perceived);
    const result = tryInvestigateSmell(g.npcs[npc], npc, { location: 'bedroom_2', block: 'leisure' }, g, perceived);
    return !gated && result === null;
  })()
`));
check('the same rot with the same NPC in range DOES fire', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'fridge', 'rotten_food', 'rotten');
    const npc = __residents(g)[0];
    const perceived = mergePerceived(perceiveSignals(g, npc, 'kitchen'));
    return checkDriveGates(DRIVE_DEFS.investigate_smell, g.npcs[npc], perceived);
  })()
`), 'distance and doors are the difference, not a coin flip');

console.log('\nclean_common now needs visible mess');
check('it does not fire in a spotless room', api(`
  (() => {
    const g = __mk();
    for (const bucket of Object.values(g.objects))
      for (const o of Object.values(bucket)) {
        if (o.state?.dishes) o.state.dishes = 'clean';
        if (o.state?.clutter) o.state.clutter = 'tidy';
        if (o.state?.made) o.state.made = 'made';
      }
    const npc = __residents(g)[0];
    return !checkDriveGates(DRIVE_DEFS.clean_common, g.npcs[npc], mergePerceived(perceiveSignals(g, npc, 'living_room')));
  })()
`));
check('it does fire where there is something to clean', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'sink_kitchen', 'dishes', 'many');
    const npc = __residents(g)[0];
    return checkDriveGates(DRIVE_DEFS.clean_common, g.npcs[npc], mergePerceived(perceiveSignals(g, npc, 'kitchen')));
  })()
`));
check('sight does not propagate, so it cannot fire from next door', api(`
  (() => {
    const g = __mk();
    __set(g, 'kitchen', 'sink_kitchen', 'dishes', 'many');
    const npc = __residents(g)[0];
    return !checkDriveGates(DRIVE_DEFS.clean_common, g.npcs[npc], mergePerceived(perceiveSignals(g, npc, 'dining')));
  })()
`), 'you clean the room you are standing in');

console.log('\nEnd to end through the real tick loop');
api(`
  __g2 = __mk();
  __set(__g2, 'kitchen', 'fridge', 'rotten_food', 'rotten');
  __fired = {};
  for (let t = 0; t < 48 * 2; t++) {
    __g2.meta.clock = advanceClock(__g2.meta.clock, 1);
    const r = resolveTick(__g2);
    for (const e of r.newEvents) __fired[e.type] = (__fired[e.type] || 0) + 1;
    for (const [id, u] of Object.entries(r.npcUpdates)) __g2.npcs[id] = { ...__g2.npcs[id], ...u };
  }
`);
check('investigate_smell fires unprompted over two simulated days',
      (api(`__fired.investigate_smell`) || 0) > 0,
      `events: ${JSON.stringify(api(`__fired`))}`);
check('and the rot actually got dealt with', api(`
  Object.values(__g2.objects['room_kitchen']).find(o => o.defId === 'fridge').state.rotten_food === 'none'
`), 'nobody was told to; someone smelled it');
check('resolveTick is still synchronous and LLM-free', api(`
  (() => { const r = resolveTick(__g2); return !(r instanceof Promise) && typeof r.npcUpdates === 'object'; })()
`));
check('perception did not blow up the tick cost', (() => {
  const t0 = Date.now();
  api(`for (let i = 0; i < 200; i++) { __g2.meta.clock = advanceClock(__g2.meta.clock, 1); resolveTick(__g2); }`);
  const per = (Date.now() - t0) / 200;
  console.log(`        ${per.toFixed(2)}ms per tick`);
  return per < 10;
})());

console.log('\nNPCs bring their own senses to the prompt');
api(`
  __g3 = __mk();
  __set(__g3, 'kitchen', 'fridge', 'rotten_food', 'rotten');
  __npc3 = __residents(__g3)[0];
  __g3.npcs[__npc3].location = 'dining';
  __g3.player.location = 'dining';
  __ctx3 = assembleContext(__g3, { active: [__npc3], ambient: [], engagement: {} });
`);
check('the active NPC context carries their own perceived list',
      Array.isArray(api(`__ctx3.activeNpcs[0].perceived`)) && api(`__ctx3.activeNpcs[0].perceived.length`) > 0,
      JSON.stringify(api(`__ctx3.activeNpcs[0].perceived`)));
check('with prose already resolved', api(`
  __ctx3.activeNpcs[0].perceived.every(r => typeof r.phrase === 'string' && r.phrase.length > 0)
`));
check('and it reaches the prompt as a [Senses] line',
      /\[Senses\]:/.test(api(`buildScenePrompt(__ctx3, 'x')`)),
      api(`buildScenePrompt(__ctx3, 'x')`).split('\n').filter(l => l.startsWith('[Senses]')).join(' | ') || 'no [Senses] line');
check('a character who senses nothing emits no line', api(`
  (() => {
    const g = __mk();
    for (const bucket of Object.values(g.objects))
      for (const o of Object.values(bucket)) {
        if (o.state?.rotten_food) o.state.rotten_food = 'none';
        if (o.state?.dishes) o.state.dishes = 'clean';
        if (o.state?.clutter) o.state.clutter = 'tidy';
        if (o.state?.made) o.state.made = 'made';
        if (o.state?.fill) o.state.fill = 'empty';
        if (o.state?.clean) o.state.clean = 'clean';
        if (o.state?.grime) o.state.grime = 'clean';
        if (o.state?.clarity) o.state.clarity = 'clear';
        if (o.state?.burner) o.state.burner = 'clean';
      }
    const npc = __residents(g)[0];
    g.npcs[npc].location = 'study';
    g.player.location = 'study';
    const ctx = assembleContext(g, { active: [npc], ambient: [], engagement: {} });
    return !/\\[Senses\\]:/.test(buildScenePrompt(ctx, 'x'));
  })()
`));

console.log('\nHousekeeping');
check('investigate_smell has an importance band', api(`
  EVENT_IMPORTANCE.investigate_smell !== undefined
`), 'otherwise it silently lands at ambient like doing the laundry');
check('every signal-gated drive names a real signal', api(`
  (() => {
    const bad = [];
    for (const [id, d] of Object.entries(DRIVE_DEFS))
      for (const g of d.gates || [])
        for (const sig of (g.signal ? (Array.isArray(g.signal) ? g.signal : [g.signal]) : []))
          if (!SIGNAL_DEFS[sig]) bad.push(id + ' -> ' + sig);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));
check('every need-gated drive still names a real need', api(`
  (() => {
    const needs = ['hunger','hygiene','energy','social','comfort','stimulation'];
    const bad = [];
    for (const [id, d] of Object.entries(DRIVE_DEFS))
      for (const g of d.gates || [])
        if (g.need && !needs.includes(g.need)) bad.push(id + ' -> ' + g.need);
    if (bad.length) console.log('        ' + bad.join(', '));
    return bad.length === 0;
  })()
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
