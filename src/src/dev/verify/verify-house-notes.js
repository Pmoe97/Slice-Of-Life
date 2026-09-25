// House notes (0.14.2) — the roommates' half of the fridge.
//
//   node src/src/dev/verify/verify-house-notes.js
//
// Node coverage for housenotes.js and its hook sites: registration (the
// tables, both script lists, the save key, the event bands); reading your
// free text; every NPC motive grounded in the state it claims (and absent
// without it); writing at the fridge with the rate caps and every guard;
// reading notes (memory events with your words, the once-a-day nudge from a
// note addressed to them); replies (the pool that fits, voice, {other}, the
// caps, sorry vs defensive); your Write Back reaching the author; tidying;
// the read narration; and the pass living on its own rng stream inside the
// real resolveTick. The modal and chip are DOM — driven live instead.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'items.js', 'effects.js', 'drives.js', 'npc.js',
    'birthdays.js', 'housenotes.js', 'defs.actions.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, n) => {
    const h = SIM_generateHouse(seed || 20260923, n || 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 12, minutes: 1080 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.world.events = [];
    // Real, distinct names (SIM_generateHouse leaves bible.name empty, and
    // includes('') is always true — the harness-gotcha shape 13).
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    // Everyone awake, idle, somewhere neutral, with a plain temperament.
    for (const id of __ids(g)) {
      const n = g.npcs[id];
      n.location = 'bedroom_' + id; n.activity = 'idle'; n.transit = null;
      n.schedule = { ...(n.schedule || {}), currentBlock: 'leisure' };
      n.bible.temperament = { warmth: 0, volatility: 0, openness: 0, conscientiousness: 0, assertiveness: 0, selfAwareness: 0 };
      n.bible.speech = { ...(n.bible.speech || {}), textingStyle: 'all-lowercase' };
      n.relPlayer = { ...n.relPlayer, affection: 0, tension: 0 };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __obj = (g, room, defId) => Object.values(g.objects['room_' + room] || {}).find(o => o.defId === defId);
  __notes = (g, room) => Object.values(g.objects['room_' + room] || {}).filter(o => o.defId === 'note');
  __at = (g, id, room) => { g.npcs[id].location = room; return g; };
  __dirtySink = (g) => { const s = __obj(g, 'kitchen', 'sink_kitchen'); s.dishes = { plate: 6, pot: 2 }; s.dishUnits = 12; };
  __pa = (g, id) => { g.npcs[id].bible.temperament = { ...g.npcs[id].bible.temperament, conscientiousness: 1, assertiveness: -1, warmth: -1 }; };
  // The pass exactly as sim.js calls it: it RETURNS relationship deltas and
  // resolveTick applies them (processNpcRelDeltas) — mirrored here so the
  // unit sections see the same effect; section 9 checks sim.js's own wiring.
  __tick = (g, minutes) => {
    const r = resolveHouseNotesTick(g, {}, __ids(g), minutes || 30);
    if (r.relDeltas.length) processNpcRelDeltas(g, r.relDeltas);
    return r;
  };
  __cast = (g, from, to, fields) => {
    const key = [from, to].sort().join('|');
    const web = g.world.castWeb || (g.world.castWeb = {});
    if (!web[key]) web[key] = createBlankPair(from, to);
    web[key].axes[from + '→' + to] = { ...(web[key].axes[from + '→' + to] || {}), ...fields };
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tables, voices, script lists, save key, event bands');
const reg = J(`({
  fns: ['resolveHouseNotesTick','noteReadingText','playerReplyableNote','addPlayerNoteReply','classifyNoteText','houseNoteMotives','ensureHouseNotes'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  motivesMatch: JSON.stringify(Object.keys(NOTE_TEMPLATES).sort()) === JSON.stringify(Object.keys(HOUSE_NOTE_TUNING.motives).sort()),
  motiveVoices: Object.values(NOTE_TEMPLATES).every(p => [...TEXTING_STYLES, 'default'].every(s => Array.isArray(p[s]) && p[s].length >= 2 && p[s].every(l => typeof l === 'string' && l.trim()))),
  replyVoices: Object.values(NOTE_REPLY_LINES).every(p => [...TEXTING_STYLES, 'default'].every(s => Array.isArray(p[s]) && p[s].length >= 2)),
  replyPoolsForEveryKind: ['sorry','defensive','question','thanked','touched','grateful','plain'].every(k => NOTE_REPLY_LINES[k]),
  notesUnderLength: Object.values(NOTE_TEMPLATES).every(p => Object.values(p).every(ls => ls.every(l => l.length <= NOTE_TUNING.maxLength))),
  noAuthorName: Object.values(NOTE_TEMPLATES).every(p => Object.values(p).every(ls => ls.every(l => !l.includes('{name}')))),
  saveKey: SAVE_KEYS.find(e => e.folder === 'world').keys.includes('houseNotes'),
  fallback: JSON.stringify(WORLD_KEY_FALLBACKS.houseNotes()),
  bands: [EVENT_IMPORTANCE.note_left, EVENT_IMPORTANCE.note_left_warm, EVENT_IMPORTANCE.note_read || null, EVENT_IMPORTANCE.note_reply || null],
  emotions: ['note_left','note_left_warm','note_read','note_reply'].map(t => EVENT_EMOTION[t]),
  emotionsValid: ['note_left','note_left_warm','note_read','note_reply'].every(t => EMOTIONAL_WEIGHTS[EVENT_EMOTION[t]] !== undefined),
})`);
check('housenotes.js exposes its seven entry points', reg.fns);
check('every NOTE_TEMPLATES motive has a HOUSE_NOTE_TUNING.motives row (and vice versa)', reg.motivesMatch);
check('every motive has two+ lines in every texting style and default', reg.motiveVoices);
check('every reply pool has two+ lines in every texting style and default', reg.replyVoices && reg.replyPoolsForEveryKind);
check('no authored note is longer than a note may be', reg.notesUnderLength);
check("no authored note names its author (the narration already says whose hand)", reg.noAuthorName);
check('world.houseNotes is in SAVE_KEYS with an additive default', reg.saveKey && reg.fallback.includes('motiveDay'), reg.fallback);
check('note_left/_warm are social beats; reading and replying stay off the ticker/feed', reg.bands[0] === 'social' && reg.bands[1] === 'social' && reg.bands[2] === null && reg.bands[3] === null, JSON.stringify(reg.bands));
check('every note event type carries a valid emotional theme', reg.emotionsValid, JSON.stringify(reg.emotions));
const indexSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'index.html'), 'utf8');
const loaderSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check('housenotes.js is in index.html, after seasons.js and before render.js',
  /seasons\.js\?v=\d+"><\/script>[\s\S]*?housenotes\.js\?v=\d+"><\/script>[\s\S]*?render\.js\?v=/.test(indexSrc));
check("housenotes.js is in loadgame.js's ORDER", /'housenotes\.js'/.test(loaderSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Reading your free text — what kind of reply fits');
const cls = J(`[
  'who ate my yoghurt??', 'please do your dishes', 'thanks for doing the dishes!', 'thank you for the flowers',
  'happy birthday Mira', 'pizza in the fridge, help yourselves', "rent's due friday", 'is anyone around saturday?',
  'hands off my oat milk', 'the bins again. seriously.', 'cheers for fixing the tap', 'I baked cookies', 'hi', 'can someone take the trash out?',
].map(t => classifyNoteText(t))`);
const want = ['gripe', 'gripe', 'thanks', 'thanks', 'wish', 'offer', 'plain', 'question', 'gripe', 'gripe', 'thanks', 'offer', 'plain', 'gripe'];
check('fourteen sample notes land in the right class', JSON.stringify(cls) === JSON.stringify(want), `got ${JSON.stringify(cls)}`);
check('"thanks for doing the dishes" is thanks, not a complaint about dishes', cls[2] === 'thanks');
check('a strong complaint beats a thank-you in the same note', J(`classifyNoteText('thanks for nothing, stop eating my food')`) === 'gripe');

// ---------------------------------------------------------------- 2
console.log('\n2. Every motive reads real state — and is absent without it');
const mot = J(`(() => {
  const g = __mk(); const [a, b] = __ids(g);
  const m = () => houseNoteMotives(g, a, 12).map(x => x.motive);
  const out = { clean: m() };
  __dirtySink(g); out.dishes = m();
  __obj(g, 'kitchen', 'sink_kitchen').dishes = {}; __obj(g, 'kitchen', 'trash_kitchen').state.fill = 'full'; out.bins = m();
  __obj(g, 'kitchen', 'trash_kitchen').state.fill = 'partial'; out.partialBin = m();
  g.world.events = [{ day: 11, npcId: a, type: 'music_too_loud', data: {} }]; out.noiseYesterday = m();
  g.world.events = [{ day: 9, npcId: a, type: 'music_too_loud', data: {} }]; out.noiseStale = m();
  g.world.events = [{ day: 12, npcId: b, type: 'party_loud', data: {} }]; out.noiseSomeoneElse = m();
  g.world.events = [{ day: 12, npcId: a, type: 'temperature_complaint', data: { cold: true } }]; out.cold = m();
  g.world.events = [{ day: 12, npcId: a, type: 'temperature_complaint', data: { cold: false } }]; out.hot = m();
  g.world.events = [{ day: 12, npcId: a, type: 'temperature_complaint', data: {} }]; out.tempNoDirection = m();
  g.world.events = [{ day: 12, npcId: a, type: 'investigate_smell', data: { container: 'Fridge' } }];
  const binned = houseNoteMotives(g, a, 12); out.binned = binned.map(x => x.motive); out.binnedVars = binned[0]?.vars;
  g.world.events = [{ day: 12, npcId: a, type: 'investigate_smell', data: {} }]; out.followingTheSmell = m();
  return out;
})()`);
check('a clean, quiet house gives nobody a reason to write', mot.clean.length === 0, JSON.stringify(mot.clean));
check('a sink full of dishes (derived "many") is the dishes motive', JSON.stringify(mot.dishes) === '["dishes"]', JSON.stringify(mot.dishes));
check('a full bin is the bins motive; a half-full one is not', JSON.stringify(mot.bins) === '["bins"]' && mot.partialBin.length === 0);
check("a noise complaint they made yesterday is a motive; three days ago, or someone else's, is not",
  JSON.stringify(mot.noiseYesterday) === '["noise"]' && mot.noiseStale.length === 0 && mot.noiseSomeoneElse.length === 0);
check('a cold complaint writes "cold", a hot one "hot", one without a direction neither',
  JSON.stringify(mot.cold) === '["cold"]' && JSON.stringify(mot.hot) === '["hot"]' && mot.tempNoDirection.length === 0);
check('binning something rotten is the binned motive, naming the container',
  JSON.stringify(mot.binned) === '["binned"]' && mot.binnedVars?.container === 'fridge', JSON.stringify(mot));
check('merely following the smell (no container cleared) is not', mot.followingTheSmell.length === 0);

const warm = J(`(() => {
  const g = __mk(); const [a] = __ids(g);
  const fridge = __obj(g, 'kitchen', 'fridge');
  const m = () => houseNoteMotives(g, a, 12).filter(x => x.motive === 'leftovers' || x.motive === 'thanks_repair');
  g.world.events = [{ day: 12, npcId: a, type: 'eat', data: { items: 'chili con carne', cooked: true } }];
  fridge.contents = [{ defId: 'cooked_meal', qty: 1, meta: { plate: { label: 'Chili Con Carne', servings: { total: 3, left: 2 } } } }];
  const out = { coldShoulder: m().length };
  g.npcs[a].relPlayer.affection = 0.4;
  const lo = m(); out.leftovers = lo.map(x => x.motive); out.loTo = lo[0]?.addressedTo; out.loItems = lo[0]?.vars?.items;
  fridge.contents = [{ defId: 'cooked_meal', qty: 1, meta: { plate: { label: 'Chili Con Carne', servings: { total: 3, left: 0 } } } }];
  out.eatenUp = m().length;
  fridge.contents = [{ defId: 'cooked_meal', qty: 1, meta: { plate: { label: 'Chili Con Carne', servings: { total: 3, left: 2 } } } }];
  g.world.events = [{ day: 12, npcId: a, type: 'eat', data: { items: 'chili con carne' } }];
  out.aRaidNotACook = m().length;
  g.world.events = [];
  g.world.renovationJobs = [{ id: 'j1', status: 'complete', facilityId: 'bathroom_a_plumbing', etaDay: 11 }];
  const rep = m(); out.repair = rep.map(x => x.motive); out.repairVars = rep[0]?.vars;
  g.world.renovationJobs = [{ id: 'j2', status: 'complete', facilityId: 'bathroom_a_plumbing', etaDay: 8 }]; out.oldRepair = m().length;
  g.world.renovationJobs = [{ id: 'j3', status: 'active', facilityId: 'kitchen_stove', etaDay: 12 }]; out.unfinished = m().length;
  g.world.renovationJobs = [{ id: 'j4', status: 'complete', facilityId: 'bedroom_habitability_player', etaDay: 12 }]; out.bedroomJob = m().length;
  return out;
})()`);
check('leftovers need fondness — a cool housemate keeps them to themselves', warm.coldShoulder === 0);
check('a fond cook with servings left in the fridge leaves you a leftovers note, addressed to you',
  JSON.stringify(warm.leftovers) === '["leftovers"]' && warm.loTo === 'player' && warm.loItems === 'chili con carne', JSON.stringify(warm));
check('no leftovers note once the pot is empty, or for a raid rather than a cook', warm.eatenUp === 0 && warm.aRaidNotACook === 0);
check('a repair you booked that finished this week earns a thank-you, prose-cased',
  JSON.stringify(warm.repair) === '["thanks_repair"]' && warm.repairVars?.facility === 'bathroom A plumbing', JSON.stringify(warm.repairVars));
check('not for an old repair, an unfinished one, or a bedroom habitability job',
  warm.oldRepair === 0 && warm.unfinished === 0 && warm.bedroomJob === 0);

// ---------------------------------------------------------------- 3
console.log('\n3. Writing — at the fridge, out of your sight, for a real reason, rarely');
const w = J(`(() => {
  const g = __mk(); const [a, b, c] = __ids(g);
  __dirtySink(g); __pa(g, a); __at(g, a, 'kitchen');
  const r1 = __tick(g, 600);
  const notes = __notes(g, 'kitchen');
  const n = notes[0];
  const out = {
    wrote: notes.length, author: n?.meta?.authorId === a, motive: n?.meta?.motive, to: n?.meta?.addressedTo,
    text: n?.meta?.text, inPool: NOTE_TEMPLATES.dishes['all-lowercase'].includes(n?.meta?.text),
    stuckTo: n?.meta?.attachedTo === __obj(g, 'kitchen', 'fridge').id,
    unreadForYou: n?.state?.read === 'unread', authorSeenOwn: n?.meta?.readBy?.[a] === 1,
    evt: r1.events.find(e => e.type === 'note_left'),
  };
  out.evtText = out.evt ? formatEventText(out.evt, g.npcs) : '';
  const r2 = __tick(g, 600);
  out.secondSameDay = __notes(g, 'kitchen').length;
  __pa(g, b); __at(g, b, 'kitchen'); __tick(g, 600);
  out.noDoubledMotive = __notes(g, 'kitchen').filter(x => x.meta.motive === 'dishes').length;
  return out;
})()`);
check('a passive-aggressive housemate at a filthy sink writes a note', w.wrote === 1 && w.author, JSON.stringify(w));
check('it is the dishes note, to nobody in particular, stuck to the fridge', w.motive === 'dishes' && w.to === null && w.stuckTo);
check('in their own voice (their texting style\'s pool)', w.inPool, w.text);
check('it catches your eye (unread for you); its author has "read" it', w.unreadForYou && w.authorSeenOwn);
check('the event reads "{name} stuck a note on the fridge about the dishes."', w.evtText === 'Mira stuck a note on the fridge about the dishes.', w.evtText);
check('one note per author per day', w.secondSameDay === 1);
check('a second housemate does not double up on a grievance already on the fridge', w.noDoubledMotive === 1);

const guards = J(`(() => {
  const run = (setup) => { const g = __mk(); const [a] = __ids(g); __dirtySink(g); __pa(g, a); __at(g, a, 'kitchen'); setup(g, a); __tick(g, 600); return __notes(g, 'kitchen').length; };
  return {
    baseline: run(() => {}),
    youreThere: run((g) => { g.player.location = 'kitchen'; }),
    asleep: run((g, a) => { g.npcs[a].activity = 'sleeping'; }),
    sleepBlock: run((g, a) => { g.npcs[a].schedule.currentBlock = 'sleep'; }),
    passingThrough: run((g, a) => { g.npcs[a].transit = { to: 'living_room' }; }),
    notInKitchen: run((g, a) => { __at(g, a, 'living_room'); }),
    notResident: run((g, a) => { g.npcs[a].residency.status = 'visitor'; }),
    cooldown: run((g, a) => { ensureHouseNotes(g).motiveDay[a + '|dishes'] = 11; }),
    houseCap: run((g) => { ensureHouseNotes(g).houseDay = { day: 12, count: HOUSE_NOTE_TUNING.maxNpcNotesPerDay }; }),
    saintly: run((g, a) => { g.npcs[a].bible.temperament = { ...g.npcs[a].bible.temperament, conscientiousness: -1, assertiveness: 1, warmth: 1 }; }),
  };
})()`);
check('baseline: the same setup writes one', guards.baseline === 1);
check('never with you standing in the kitchen (a note is what you leave instead of saying it)', guards.youreThere === 0);
check('never asleep, in the sleep block, or just passing through', guards.asleep === 0 && guards.sleepBlock === 0 && guards.passingThrough === 0);
check('only at the fridge, and only a resident', guards.notInKitchen === 0 && guards.notResident === 0);
check('the motive cooldown and the house cap both hold', guards.cooldown === 0 && guards.houseCap === 0);
check('an assertive, easy-going, untidy housemate never writes the gripe (passiveAggression 0)', guards.saintly === 0);

const rate = J(`(() => {
  // Honest rate: a typical housemate (all-zero temperament, pa 0.35) at a
  // filthy sink for 30 minutes, over 400 independent days.
  let wrote = 0;
  for (let d = 0; d < 400; d++) {
    const g = __mk(); const [a] = __ids(g); g.meta.clock.day = 20 + d; __dirtySink(g); __at(g, a, 'kitchen');
    __tick(g, 30); if (__notes(g, 'kitchen').length) wrote++;
  }
  return wrote / 400;
})()`);
check('a typical housemate at a filthy sink for half an hour writes about one time in eight (0.06–0.20)', rate >= 0.06 && rate <= 0.20, `rate ${rate}`);

const voice = J(`(() => {
  const g = __mk(); const [a] = __ids(g); __dirtySink(g); __pa(g, a); __at(g, a, 'kitchen');
  g.npcs[a].bible.speech.textingStyle = 'terse'; __tick(g, 600);
  const t = __notes(g, 'kitchen')[0]?.meta?.text;
  const g2 = __mk(); const [a2] = __ids(g2); __dirtySink(g2); __pa(g2, a2); __at(g2, a2, 'kitchen'); __tick(g2, 600);
  const g3 = __mk(); const [a3] = __ids(g3); __dirtySink(g3); __pa(g3, a3); __at(g3, a3, 'kitchen'); __tick(g3, 600);
  return { terse: NOTE_TEMPLATES.dishes.terse.includes(t), same: __notes(g2, 'kitchen')[0]?.meta?.text === __notes(g3, 'kitchen')[0]?.meta?.text };
})()`);
check('a terse housemate writes a terse note', voice.terse);
check('deterministic — the same house on the same day writes the same words', voice.same);

const warmWrite = J(`(() => {
  const g = __mk(); const [a] = __ids(g); __at(g, a, 'kitchen');
  g.npcs[a].relPlayer.affection = 0.5; g.npcs[a].bible.temperament.warmth = 1;
  g.world.renovationJobs = [{ id: 'j1', status: 'complete', facilityId: 'kitchen_stove', etaDay: 12 }];
  const r = __tick(g, 600);
  const n = __notes(g, 'kitchen')[0];
  const e = r.events.find(x => x.type === 'note_left_warm');
  return { motive: n?.meta?.motive, to: n?.meta?.addressedTo, text: n?.meta?.text, evt: e ? formatEventText(e, g.npcs) : null };
})()`);
check('a warm, fond housemate thanks you for the stove — a note FOR you', warmWrite.motive === 'thanks_repair' && warmWrite.to === 'player', JSON.stringify(warmWrite));
check('the thank-you names the facility', /kitchen stove/.test(warmWrite.text || ''), warmWrite.text);
check('its event is "left you a note … about the kitchen stove"', warmWrite.evt === 'Mira left you a note on the fridge about the kitchen stove.', warmWrite.evt);

// ---------------------------------------------------------------- 4
console.log('\n4. Reading — your words reach their memory; an addressed note lands a little');
const rd = J(`(() => {
  const g = __mk(); const [a, b] = __ids(g);
  const n = spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'who keeps using my mug?' });
  n.state = { ...n.state, read: 'read' };
  __at(g, a, 'living_room');
  const r1 = __tick(g, 30);
  const e = r1.events.find(x => x.type === 'note_read');
  const r2 = __tick(g, 30);
  __at(g, b, 'living_room'); g.npcs[b].activity = 'sleeping';
  __tick(g, 30);
  return {
    readBy: n.meta.readBy, evt: e ? formatEventText(e, g.npcs) : null, imp: e?.importance, social: MEMORY_IMPORTANCE.social,
    seen: e?.seenByPlayer, again: r2.events.filter(x => x.type === 'note_read').length, sleeperRead: !!n.meta.readBy[b],
  };
})()`);
check('a housemate in the room reads your note', rd.readBy && Object.keys(rd.readBy).length === 1);
check("your words go into their memory verbatim", rd.evt === 'Mira read the note you left on the wall: "who keeps using my mug?"', rd.evt);
check('as a social-importance memory, and as a receipt you can see', rd.imp === rd.social && rd.seen === false);
check('once — no second memory for a note already read', rd.again === 0);
check('a sleeping housemate reads nothing', rd.sleeperRead === false);

const felt = J(`(() => {
  const g = __mk(); const [a, b] = __ids(g); __at(g, a, 'living_room');
  const before = g.npcs[a].relPlayer.affection;
  spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'thank you for the soup', addressedTo: a });
  __tick(g, 30);
  const afterOne = g.npcs[a].relPlayer.affection;
  spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'thanks again!!', addressedTo: a });
  __tick(g, 30);
  const afterTwo = g.npcs[a].relPlayer.affection;
  const t0 = g.npcs[a].relPlayer.tension;
  spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'please wash your pan', addressedTo: a });
  __tick(g, 30);
  const tension = g.npcs[a].relPlayer.tension - t0;
  const bAff = g.npcs[b].relPlayer.affection;
  __at(g, b, 'living_room'); __tick(g, 30);
  return { one: afterOne - before, two: afterTwo - afterOne, tension, bystander: g.npcs[b].relPlayer.affection - bAff };
})()`);
check('a thank-you note addressed to them moves affection by thanksAffection', Math.abs(felt.one - 0.02) < 1e-9, JSON.stringify(felt));
check('a stack of thank-you notes the same day is one thank-you', Math.abs(felt.two) < 1e-9);
check('a complaint addressed to them adds a little tension', Math.abs(felt.tension - 0.02) < 1e-9);
check("a note addressed to someone else moves the bystander not at all", Math.abs(felt.bystander) < 1e-9);

// ---------------------------------------------------------------- 5
console.log('\n5. Replies — the line that fits, in their voice, within the caps');
// Find a seed whose (note, reader) hash says "reply", by PREDICTING it from
// the same pure functions — then build a FRESH house for the real assertion
// (the harness-gotcha shape 7: never reuse an object a search loop mutated).
api(`
  __replyHouse = (seed, text, opts) => {
    const g = __mk(seed); const [a, b, c] = __ids(g);
    const n = spawnNote(g, { roomId: 'living_room', authorId: opts.author === 'npc' ? b : 'player', text, addressedTo: opts.to === 'reader' ? a : (opts.to || null) });
    if (opts.author === 'npc') { n.meta.motive = opts.motive || 'dishes'; markNoteSeen(n, b); }
    if (opts.fond) g.npcs[a].relPlayer.affection = 1;
    if (opts.temper) g.npcs[a].bible.temperament = { ...g.npcs[a].bible.temperament, ...opts.temper };
    if (opts.style) g.npcs[a].bible.speech.textingStyle = opts.style;
    if (opts.solo) { for (const id of [b, c]) if (id) g.npcs[id].residency.status = 'former'; }
    __at(g, a, 'living_room');
    return { g, a, n };
  };
  __willReply = (seed, text, opts) => {
    const { g, a, n } = __replyHouse(seed, text, opts);
    const fit = noteReplyPool(g, n, a);
    return !!fit && hash01(g.meta.seed + '|reply|' + n.id + '|' + a) < noteReplyChance(g, n, a, fit.kind, fit.targeted);
  };
  __findSeed = (text, opts) => { for (let s = 1; s < 400; s++) if (__willReply(20260900 + s, text, opts)) return 20260900 + s; return null; };
`);
const rp = J(`(() => {
  const opts = { to: 'reader', fond: true, temper: { warmth: 1, volatility: -1 } };
  const seed = __findSeed('who ate my yoghurt??', opts);
  const { g, a, n } = __replyHouse(seed, 'who ate my yoghurt??', opts);
  const r = __tick(g, 30);
  const reply = (n.meta.replies || [])[0];
  const e = r.events.find(x => x.type === 'note_reply');
  return { seed, reply, sorry: NOTE_REPLY_LINES.sorry['all-lowercase'].includes(reply?.text), unread: n.state.read === 'unread',
           evt: e ? formatEventText(e, g.npcs) : null, seenCount: n.meta.readBy[a], parts: noteParts(n).length };
})()`);
check('found a seed where a fond, warm housemate answers your complaint', rp.seed !== null);
check('the reply is written on the bottom of your note, by them', rp.reply && rp.reply.authorId && rp.reply.day === 12, JSON.stringify(rp.reply));
check('warm and fond → the "sorry" pool, in their voice', rp.sorry, rp.reply?.text);
check('a reply flips your note back to unread so it catches your eye', rp.unread);
check('the event teases without spoiling: "… scribbled something on the bottom of your note …"',
  rp.evt === 'Mira scribbled something on the bottom of your note on the wall.', rp.evt);
check('the replier has seen their own reply (no self catch-up next tick)', rp.seenCount === rp.parts);

const tone = J(`(() => {
  const opts = { to: 'reader', temper: { warmth: -1, volatility: 1 } };
  const seed = __findSeed('who ate my yoghurt??', opts);
  if (seed === null) return { seed };
  const { g, a, n } = __replyHouse(seed, 'who ate my yoghurt??', opts);
  g.npcs[a].relPlayer.tension = 1;
  __tick(g, 30);
  const reply = (n.meta.replies || [])[0];
  return { seed, text: reply?.text, defensive: NOTE_REPLY_LINES.defensive['all-lowercase'].includes(reply?.text) };
})()`);
check('cold, volatile and tense with you → the defensive pool ("wasn\'t me")', tone.seed !== null && tone.defensive, JSON.stringify(tone));

const kinds = J(`(() => {
  const pool = (text, opts) => { const { g, a, n } = __replyHouse(20260923, text, opts); return noteReplyPool(g, n, a); };
  return {
    thanks: pool('thanks for cleaning up', {}),
    wishUntargeted: pool('happy birthday!!', {}),
    wishToThem: pool('happy birthday!!', { to: 'reader' }),
    offer: pool('pizza in the fridge, help yourselves', {}),
    toSomeoneElse: pool('please wash your pan', { to: 'player_x' }),
    aboutSomeoneElse: pool('Jonah please wash your pan', {}),
    npcGripe: pool('the sink is full', { author: 'npc', motive: 'dishes' }),
    npcWarmToYou: pool('leftovers', { author: 'npc', motive: 'leftovers', to: 'player' }),
  };
})()`);
check('a thank-you invites an "anytime" (thanks kind)', kinds.thanks?.kind === 'thanks');
check("a well-wish is only answered by the person it's for", kinds.wishUntargeted === null && kinds.wishToThem?.kind === 'wish');
check('an offer invites a "legend" (offer kind)', kinds.offer?.kind === 'offer');
check('nobody answers a note addressed to someone else, or one naming someone else', kinds.toSomeoneElse === null && kinds.aboutSomeoneElse === null);
check("a housemate's dishes note is a complaint to answer; a note left FOR you is yours alone",
  kinds.npcGripe?.kind === 'gripe' && kinds.npcWarmToYou === null);

const other = J(`(() => {
  const opts = { to: 'reader', fond: true };
  const seed = __findSeed('where did the good scissors go?', opts);
  const { g, a, n } = __replyHouse(seed, 'where did the good scissors go?', opts);
  const others = __ids(g).filter(id => id !== a).map(id => g.npcs[id].bible.name);
  const lines = Array.from({ length: 40 }, (_, i) => composeNoteReply(g, { ...n, id: n.id + '_' + i }, a, 'question').text);
  const solo = __replyHouse(20260923, 'where did the good scissors go?', { ...opts, solo: true });
  const soloLines = Array.from({ length: 40 }, (_, i) => composeNoteReply(solo.g, { ...solo.n, id: solo.n.id + '_' + i }, solo.a, 'question').text);
  return { named: lines.some(l => others.some(o => l.includes(o))), noBrace: lines.concat(soloLines).every(l => !l.includes('{')),
           soloNamesNobody: soloLines.every(l => !l.includes('{other}')) };
})()`);
check('a question can be passed to another housemate by name ("ask Jonah")', other.named);
check('no reply ever leaks a {placeholder}, even with nobody else to blame', other.noBrace && other.soloNamesNobody);

const caps = J(`(() => {
  const g = __mk(); const ids = __ids(g);
  const n = spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'free cake!' });
  n.meta.replies = [{ authorId: 'x1', text: 'a', day: 12 }, { authorId: 'x2', text: 'b', day: 12 }, { authorId: 'x3', text: 'c', day: 12 }];
  const full = noteReplyPool(g, n, ids[0]);
  const m = spawnNote(g, { roomId: 'living_room', authorId: 'player', text: 'free cake!' });
  m.meta.replies = [{ authorId: ids[0], text: 'legend', day: 12 }];
  return { full, twice: noteReplyPool(g, m, ids[0]) };
})()`);
check('a note with maxReplies lines on it takes no more', caps.full === null);
check('nobody answers the same note twice', caps.twice === null);

// ---------------------------------------------------------------- 6
console.log('\n6. Write Back — your line on their note reaches them');
const wb = J(`(() => {
  const g = __mk(); const [a] = __ids(g); __dirtySink(g); __pa(g, a); __at(g, a, 'kitchen'); __tick(g, 600);
  const n = __notes(g, 'kitchen')[0];
  const before = playerReplyableNote(g, 'kitchen');
  n.state = { ...n.state, read: 'read' };
  const offered = playerReplyableNote(g, 'kitchen')?.id === n.id;
  addPlayerNoteReply(g, n.id, 'kitchen', 'they are SOAKING');
  const after = playerReplyableNote(g, 'kitchen');
  __at(g, a, 'living_room'); __tick(g, 30);
  __at(g, a, 'kitchen'); g.meta.clock.minutes += 30;
  const r = __tick(g, 30);
  const e = r.events.find(x => x.type === 'note_read');
  return { before, offered, after, evt: e ? formatEventText(e, g.npcs) : null, text: noteReadingText(g, n) };
})()`);
check("Write Back isn't offered until you've read the note", wb.before === null);
check("then it is, on that note", wb.offered);
check('one line of yours per note', wb.after === null);
check("the author reads your reply on their own note — verbatim, into memory",
  wb.evt === 'Mira read what you wrote on their note on the fridge: "they are SOAKING"', wb.evt);
check('the note now reads with your line underneath', /Underneath, in your handwriting: "they are SOAKING"/.test(wb.text), wb.text);

// ---------------------------------------------------------------- 7
console.log('\n7. Tidying — authors take their own notes down, never yours');
const td = J(`(() => {
  const g = __mk(); const [a] = __ids(g); __at(g, a, 'kitchen'); g.player.location = 'kitchen';
  const mk = (author, day, read) => { const n = spawnNote(g, { roomId: 'kitchen', authorId: author, text: author + ' ' + day + ' ' + read }); n.meta.day = day; n.state.read = read; return n.id; };
  const readOld = mk(a, 10, 'read'), unreadYoung = mk(a, 9, 'unread'), unreadAncient = mk(a, 6, 'unread'), yours = mk('player', 1, 'read');
  __tick(g, 30);
  const has = (id) => !!g.objects.room_kitchen[id];
  return { readOld: has(readOld), unreadYoung: has(unreadYoung), unreadAncient: has(unreadAncient), yours: has(yours) };
})()`);
check('a note of theirs you have read, two days on, comes down', td.readOld === false);
check('one you have not read yet stays up', td.unreadYoung === true);
check('anything past maxAgeDays comes down regardless', td.unreadAncient === false);
check('your notes are never taken down for you', td.yours === true);

// ---------------------------------------------------------------- 8
console.log('\n8. The read narration');
const nar = J(`(() => {
  const g = __mk(); const [a, b] = __ids(g);
  const n = spawnNote(g, { roomId: 'kitchen', authorId: 'player', text: 'bins tonight', addressedTo: a });
  const unseen = noteReadingText(g, n);
  n.meta.readBy = { [a]: 1, [b]: 1 };
  n.meta.replies = [{ authorId: a, text: 'on it', day: 12 }, { authorId: b, text: 'ok mum', day: 12 }];
  const m = spawnNote(g, { roomId: 'kitchen', authorId: a, text: 'leftovers in the fridge', addressedTo: 'player' });
  return { unseen, seen: noteReadingText(g, n), forYou: noteReadingText(g, m), viaAction: readNoteNarration(buildActionContext(g), { note: m }) };
})()`);
check('your note says who it is for, and that nobody has read it yet',
  nar.unseen.startsWith('A note for Mira, in your own handwriting:') && nar.unseen.includes('(Nobody has read it yet.)'), nar.unseen);
check('replies read in order underneath, then who has seen it',
  /Underneath, in Mira's handwriting: "on it"\nBelow that, in Jonah's handwriting: "ok mum"/.test(nar.seen) && nar.seen.includes('(Seen by Mira and Jonah.)'), nar.seen);
check("a housemate's note for you says so, and shows no receipts", nar.forYou.startsWith("A note for you, in Mira's handwriting:") && !nar.forYou.includes('Seen by'), nar.forYou);
check('the Read Note action narrates through it', nar.viaAction === nar.forYou);

// ---------------------------------------------------------------- 9
console.log('\n9. Inside the real tick — its own rng stream, real days');
const iso = J(`(() => {
  // The same tick, with and without the notes pass: every OTHER result must
  // be byte-identical, i.e. the pass draws nothing from the tick's stream.
  const run = (withNotes) => {
    const g = __mk(); const [a] = __ids(g); __dirtySink(g); __pa(g, a);
    g.meta.clock.minutes = 1140;
    const saved = resolveHouseNotesTick;
    if (!withNotes) resolveHouseNotesTick = () => ({ events: [], relDeltas: [] });
    try { const r = resolveTick(g, 30); return JSON.stringify({ u: r.npcUpdates, e: r.newEvents.filter(e => !String(e.type).startsWith('note_')) }); }
    finally { resolveHouseNotesTick = saved; }
  };
  return run(true) === run(false);
})()`);
check('resolveTick with the pass is identical to without it, apart from note events', iso);

const wired = J(`(() => {
  // sim.js's own wiring: a delta the pass returns lands on the NPC after a
  // real resolveBatch step, even when an earlier writer this tick already
  // put a relPlayer into npcUpdates (the rebuild would otherwise clobber it).
  const g = __mk(); const [a] = __ids(g);
  const before = g.npcs[a].relPlayer.affection;
  const saved = resolveHouseNotesTick;
  resolveHouseNotesTick = () => ({ events: [], relDeltas: [{ a, b: 'player', deltas: { affection: 0.02 } }] });
  try { const r = resolveBatch(g, 1); return r.state.npcs[a].relPlayer.affection - before; }
  finally { resolveHouseNotesTick = saved; }
})()`);
check("resolveTick applies the pass's relationship deltas (they survive resolveBatch's rebuild)", Math.abs(wired - 0.02) < 1e-9, `delta ${wired}`);

const week = J(`(() => {
  let g = __mk(20260777, 4);
  __ids(g).forEach(id => __pa(g, id));
  const perDay = {}; const types = {};
  for (let d = 0; d < 7; d++) {
    __dirtySink(g); __obj(g, 'kitchen', 'trash_kitchen').state.fill = 'full';
    const r = resolveBatch(g, 48);
    g = r.state;
    for (const e of r.events) {
      if (!String(e.type).startsWith('note_')) continue;
      types[e.type] = (types[e.type] || 0) + 1;
      if (e.type === 'note_left' || e.type === 'note_left_warm') perDay[e.day] = (perDay[e.day] || 0) + 1;
      if (formatEventText(e, g.npcs).includes('{')) types.leak = (types.leak || 0) + 1;
    }
  }
  const notes = Object.values(g.objects).flatMap(b => Object.values(b)).filter(o => o.defId === 'note');
  return { perDay, types, maxPerDay: Math.max(0, ...Object.values(perDay)), notesUp: notes.length,
           grounded: notes.every(n => !n.meta.motive || HOUSE_NOTE_TUNING.motives[n.meta.motive]) };
})()`);
check('a week in a messy, passive-aggressive house produces notes through the real tick', (week.types.note_left || 0) > 0, JSON.stringify(week));
check('never more than maxNpcNotesPerDay in a day', week.maxPerDay <= 2, JSON.stringify(week.perDay));
check('housemates read each other\'s notes along the way', (week.types.note_read || 0) > 0, JSON.stringify(week.types));
check('no event text leaks a {placeholder}', !week.types.leak);
check('every note up carries a known motive', week.grounded);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
