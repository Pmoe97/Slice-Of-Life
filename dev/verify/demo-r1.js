// Renders composeScene's output as prose, so the Phase 1 object can be read
// the way Phase 2 will present it. Not a test — an eyeball check.
const { loadEngine } = require('./loadgame.js');
const { api, ctx } = loadEngine();

api(`
  __h = SIM_generateHouse(20260810, 3);
  __g = { meta: { seed: __h.seed, clock: __h.clock, contentConfig: null, sessionLog: [] },
          player: __h.player, npcs: __h.npcs, world: __h.world, objects: __h.objects };
  for (const k of Object.keys(__g.world.upgrades)) __g.world.upgrades[k] = { tier: 'functional', condition: 100 };
  __set = (r, d, k, v) => { for (const o of Object.values(__g.objects['room_' + r] || {})) if (o.defId === d) o.state = { ...o.state, [k]: v }; };
  __res = Object.entries(__g.npcs).filter(([, n]) => n.residency.status === 'resident').map(([id]) => id);
  __logBeat = (t, x, s) => {
    const sc = currentScene(__g);
    __g.meta.sessionLog.push({ type: t, text: x, speaker: s, day: __g.meta.clock.day,
      minutes: __g.meta.clock.minutes, sceneId: sc.id, roomId: sc.roomId });
  };
`);
const names = ['Hana', 'Marcus', 'Tess'];
ctx.__names = names;
api(`
  __g.npcs[__res[0]].bible.name = __names[0]; __g.npcs[__res[0]].location = 'kitchen'; __g.npcs[__res[0]].activity = 'making coffee';
  __g.npcs[__res[1]].bible.name = __names[1]; __g.npcs[__res[1]].location = 'kitchen'; __g.npcs[__res[1]].activity = 'reading';
  __g.npcs[__res[2]].bible.name = __names[2]; __g.npcs[__res[2]].location = 'living_room';
  __set('kitchen', 'sink_kitchen', 'dishes', 'many');
  __set('kitchen', 'stove', 'burner', 'crusty');
  __g.player.location = 'living_room'; openScene(__g, 'living_room');
`);
ctx.__beats1 = ['You move to the Living Room.', 'You are back late.'];
api(`
  __logBeat('narration', __beats1[0]);
  __logBeat('dialogue', __beats1[1], __names[2]);
  __g.meta.clock = advanceClock(__g.meta.clock, 3);
  __g.player.location = 'kitchen'; openScene(__g, 'kitchen');
`);
ctx.__beats2 = [
  'You move to the Kitchen.',
  'Oh — hey. Did not hear you come in.',
  'You cook pasta. It smells good — there is enough for leftovers.',
];
ctx.__noteText = 'BINS. PLEASE.';
api(`
  __logBeat('narration', __beats2[0]);
  spawnNote(__g, { roomId: 'kitchen', authorId: 'player', text: __noteText });
  for (const o of Object.values(__g.objects['room_kitchen'])) if (o.defId === 'note') o.state.read = 'unread';
  __logBeat('dialogue', __beats2[1], __names[0]);
  __logBeat('narration', __beats2[2]);
  __s = composeScene(__g, {});
`);

const s = api('__s');
const W = 60;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function wrap(text, indent = '  ') {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    if ((indent + line + w).length > W) { out.push(indent + line.trimEnd()); line = ''; }
    line += w + ' ';
  }
  if (line.trim()) out.push(indent + line.trimEnd());
  return out.join('\n');
}

console.log('\n' + '='.repeat(W));
console.log(`  ${s.heading.roomName.toUpperCase()} — ${s.heading.dayLabel}, ${s.heading.timeLabel}`);
console.log('='.repeat(W) + '\n');

for (const p of s.presence) console.log(wrap(p.line));
console.log();

const calloutIds = new Set(s.callouts.map(c => c.signalId));
for (const x of s.sensory) {
  const txt = cap(x.here ? x.phrase : `${x.phrase}, drifting in from the ${x.sourceRoomName}`) + '.';
  if (calloutIds.has(x.signalId)) console.log(wrap(txt, '  | ').replace(/\n  {4}/g, '\n  | '));
  else console.log(wrap(txt));
}

console.log('\n  ' + '-'.repeat(W - 4) + '\n');
for (const b of s.beats.slice(1)) {
  console.log(wrap(b.type === 'dialogue' ? `${b.speaker}: "${b.text}"` : b.text));
  console.log();
}
console.log(`  v earlier (${s.history.length} scene${s.history.length === 1 ? '' : 's'})`);
for (const h of s.history) console.log(`      ${h.timeLabel}  ${h.roomName} — ${h.beatCount} beats`);
console.log();
