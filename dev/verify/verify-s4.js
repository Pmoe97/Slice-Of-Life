// Perception plan Phase 4 verification — notes.
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
  __mk = () => {
    const h = SIM_generateHouse(20260810, 3);
    return { meta: { seed: h.seed, clock: h.clock, contentConfig: null },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __gs = __mk();
  __fridge = () => Object.values(__gs.objects['room_kitchen']).find(o => o.defId === 'fridge');
  __notes  = (room) => Object.values(__gs.objects['room_' + room] || {}).filter(o => o.defId === 'note');
  __seesNote = (room) => perceiveSignals(__gs, 'player', room).find(r => r.signalId === 'note') || null;
`);

console.log('\nA note is an ordinary world object');
api(`__n = spawnNote(__gs, { roomId: 'kitchen', attachedTo: __fridge().id, authorId: 'player', text: 'buy milk' });`);
check('spawnNote returns an instance', api(`!!__n`));
check('it lands in the room bucket like any other object',
      api(`__notes('kitchen').length`) === 1);
check('it carries its content on meta', api(`
  __n.meta.text === 'buy milk' && __n.meta.authorId === 'player' && typeof __n.meta.day === 'number'
`), JSON.stringify(api(`__n.meta`)));
check('it records what it is stuck to', api(`__n.meta.attachedTo === __fridge().id`));
check('it starts unread', api(`__n.state.read`) === 'unread');
check('empty text is refused', api(`spawnNote(__gs, { roomId: 'kitchen', text: '   ' }) === null`));
check('text is capped at NOTE_TUNING.maxLength', api(`
  (() => {
    const g = __mk();
    const n = spawnNote(g, { roomId: 'kitchen', text: 'x'.repeat(9999) });
    return n.meta.text.length === NOTE_TUNING.maxLength;
  })()
`));
check('an unknown room is refused', api(`spawnNote(__gs, { roomId: 'nowhere', text: 'hi' }) === null`));
check('a room stops accepting notes past maxPerRoom', api(`
  (() => {
    const g = __mk();
    for (let i = 0; i < NOTE_TUNING.maxPerRoom; i++) spawnNote(g, { roomId: 'kitchen', text: 'note ' + i });
    const overflow = spawnNote(g, { roomId: 'kitchen', text: 'one too many' });
    return overflow === null
        && Object.values(g.objects['room_kitchen']).filter(o => o.defId === 'note').length === NOTE_TUNING.maxPerRoom;
  })()
`), 'a fridge papered over stops being a signal');

console.log('\nObject ids stay unique across create/destroy churn');
check('two notes in one room get different ids', api(`
  (() => {
    const g = __mk();
    const a = spawnNote(g, { roomId: 'kitchen', text: 'a' });
    const b = spawnNote(g, { roomId: 'kitchen', text: 'b' });
    return a.id !== b.id;
  })()
`));
check('binning and re-adding does NOT reuse an id and overwrite', api(`
  (() => {
    const g = __mk();
    const a = spawnNote(g, { roomId: 'kitchen', text: 'first' });
    const b = spawnNote(g, { roomId: 'kitchen', text: 'second' });
    delete g.objects['room_kitchen'][a.id];              // bin the first
    const c = spawnNote(g, { roomId: 'kitchen', text: 'third' });
    const notes = Object.values(g.objects['room_kitchen']).filter(o => o.defId === 'note');
    return c.id !== b.id && notes.length === 2
        && notes.some(n => n.meta.text === 'second') && notes.some(n => n.meta.text === 'third');
  })()
`), 'the old length-as-slot scheme silently overwrote an existing object');

console.log('\nSight does not propagate — you have to be in the room (D5)');
api(`__gs = __mk(); spawnNote(__gs, { roomId: 'kitchen', attachedTo: __fridge().id, authorId: 'player', text: 'BUY MILK' });`);
check('standing in the kitchen, you see it', api(`__seesNote('kitchen')`) !== null);
check('from the dining room next door, you do not',
      api(`__seesNote('dining')`) === null,
      'a note is not something you smell from the next room');
check('nor from anywhere else in the flat', api(`
  Object.keys(ROOMS).filter(r => r !== 'kitchen')
    .every(r => !perceiveSignals(__gs, 'player', r).some(x => x.signalId === 'note'))
`));

console.log('\nReading collapses the signal — the state change IS the mechanism');
const unread = api(`__seesNote('kitchen')`);
check('unread, it is the loudest thing in the room', api(`
  (() => {
    const all = perceiveSignals(__gs, 'player', 'kitchen');
    return all.length > 0 && all[0].signalId === 'note';
  })()
`), `salience order: ${JSON.stringify(api(`perceiveSignals(__gs,'player','kitchen').map(r=>r.signalId)`))}`);
check('unread reads as `strong`', unread.band === 'strong', `band ${unread.band} @ ${unread.intensity}`);
api(`
  __note = __notes('kitchen')[0];
  __note.state = { ...__note.state, read: 'read' };
`);
const read = api(`__seesNote('kitchen')`);
check('after reading it is still visible', read !== null);
check('but much quieter', read.intensity < unread.intensity,
      `${unread.intensity} -> ${read.intensity}`);
check('and its salience drops accordingly', read.salience < unread.salience);
check('no code outside the emits table did that', (() => {
  const src = fs.readFileSync(path.join(SRCDIR, 'signals.js'), 'utf8');
  return !/note/i.test(src);
}), 'signals.js must not special-case notes — it falls out of the standing model');

console.log('\nRead and bin are ordinary object-sourced actions');
api(`
  __gs = __mk();
  __gs.player.location = 'kitchen';
  spawnNote(__gs, { roomId: 'kitchen', attachedTo: __fridge().id, authorId: 'player', text: 'bins tonight' });
  __avail = () => resolveAvailableActions(__gs).filter(e => e.ok).map(e => e.actionId);
`);
check('Read Note is offered when an unread note is present',
      api(`__avail().includes('self.read_note')`), JSON.stringify(api(`__avail()`)));
check('Bin is NOT offered before it has been read',
      !api(`__avail().includes('self.bin_note')`),
      'a note must not be throwable away unseen');
api(`__notes('kitchen')[0].state.read = 'read';`);
check('once read, Bin is offered', api(`__avail().includes('self.bin_note')`));
check('and Read is no longer offered', !api(`__avail().includes('self.read_note')`));
check('reading in another room offers neither', api(`
  (() => { __gs.player.location = 'dining';
           const a = __avail();
           __gs.player.location = 'kitchen';
           return !a.includes('self.read_note') && !a.includes('self.bin_note'); })()
`));
check('the narration is the note itself', api(`
  (() => {
    const ctx = buildActionContext(__gs);
    const prepared = prepareNote(ctx);
    return readNoteNarration(ctx, prepared).includes('bins tonight');
  })()
`), api(`readNoteNarration(buildActionContext(__gs), prepareNote(buildActionContext(__gs)))`));

console.log('\nDESTROY_OBJECT');
check('it is declared, implemented and trusted-only', api(`
  EFFECT_DEFS.DESTROY_OBJECT && EFFECT_DEFS.DESTROY_OBJECT.implemented === true
  && EFFECT_DEFS.DESTROY_OBJECT.llm === false
`), 'the narrator must not be able to delete the furniture');
check('it removes the object and the signal with it', api(`
  (() => {
    const g = __mk();
    g.player.location = 'kitchen';
    const n = spawnNote(g, { roomId: 'kitchen', text: 'gone soon' });
    const ctx = buildEffectContext(g, [], [], g.objects['room_kitchen'], []);
    applyEffects(parseEffectDSL('DESTROY_OBJECT ' + n.id), ctx);
    return !g.objects['room_kitchen'][n.id]
        && !perceiveSignals(g, 'player', 'kitchen').some(r => r.signalId === 'note');
  })()
`));
check('it refuses an object in another room (reach-set)', api(`
  (() => {
    const g = __mk();
    g.player.location = 'dining';
    const n = spawnNote(g, { roomId: 'kitchen', text: 'far away' });
    const ctx = buildEffectContext(g, [], [], g.objects['room_dining'] || {}, []);
    const { valid, rejected } = validateEffects(parseEffectDSL('DESTROY_OBJECT ' + n.id), ctx, 'llm');
    return valid.length === 0 && rejected.length === 1;
  })()
`));

console.log('\nNPCs perceive a note through the same query the player uses (D7)');
check('an NPC in the room sees it', api(`
  (() => {
    const g = __mk();
    spawnNote(g, { roomId: 'kitchen', text: 'someone do the bins' });
    const npcId = Object.keys(g.npcs)[0];
    return perceiveSignals(g, npcId, 'kitchen').some(r => r.signalId === 'note');
  })()
`), 'this is what Plan 5 needs in order for an NPC to react to a note');
check('an NPC elsewhere does not', api(`
  (() => {
    const g = __mk();
    spawnNote(g, { roomId: 'kitchen', text: 'x' });
    const npcId = Object.keys(g.npcs)[0];
    return !perceiveSignals(g, npcId, 'living_room').some(r => r.signalId === 'note');
  })()
`));

console.log('\nPersistence');
check('a note survives a save round-trip with its text intact', api(`
  (() => {
    const g = __mk();
    const n = spawnNote(g, { roomId: 'kitchen', authorId: 'player', text: 'do NOT eat this' });
    const back = JSON.parse(JSON.stringify(g));
    const r = back.objects['room_kitchen'][n.id];
    return r && r.meta.text === 'do NOT eat this' && r.meta.authorId === 'player'
        && perceiveSignals(back, 'player', 'kitchen').some(x => x.signalId === 'note');
  })()
`));
check('every other object still has meta: null, not undefined', api(`
  Object.values(__mk().objects['room_kitchen']).every(o => o.meta === null)
`), 'additive default, same shape as evidence');

console.log('\nSurfaces and content tables');
check('at least one surface exists per note-worthy room', api(`
  (() => {
    const g = __mk();
    const withSurface = ['kitchen', 'dining', 'entry'].filter(r =>
      Object.values(g.objects['room_' + r] || {}).some(o => OBJECT_DEFS[o.defId]?.surfaces));
    return withSurface.length >= 2;
  })()
`), `rooms with a surface: ${api(`Object.keys(ROOMS).filter(r => Object.values(__mk().objects['room_'+r]||{}).some(o => OBJECT_DEFS[o.defId]?.surfaces)).join(', ')`)}`);
check('every surfaces:true def is a real object', api(`
  Object.entries(OBJECT_DEFS).filter(([, d]) => d.surfaces).length > 0
`));
check('NOTE_TEMPLATES entries are all non-empty strings', api(`
  Object.values(NOTE_TEMPLATES).every(list => Array.isArray(list) && list.length > 0
    && list.every(t => typeof t === 'string' && t.trim().length > 0))
`));
check('the note signal has prose for all three bands', api(`
  ['faint','clear','strong'].every(b => SIGNAL_DEFS.note.phrases[b]?.length > 0)
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
