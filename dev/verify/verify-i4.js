// NPC initiative plan, Phase 4 — the other three channels.
//
//   node dev/verify/verify-i4.js
//
// Phase 3 built ONE way for an NPC to open: they cross the room. This phase
// adds the three D8 named — a text, a proposal and a knock — and the thing
// worth pinning is that they are three ENTRIES rather than three code paths.
// Everything structural about an overture (the scorer, the motive readers, the
// record, the four named writers) is shared; what a channel owns is its
// candidacy and its surface, and both are declared.
//
// The invariants, in the order they would hurt if they broke:
//   - a channel with no proximity, no motive reader or no template is not a
//     channel, and every one of those lookups fails CLOSED (D29, D23's shape).
//   - `text` does not hold. An NPC frozen for two ticks because they sent a
//     message would be D27's hold applied to a channel that is not asking for
//     anything, and it would break design invariant 2 in the other direction.
//   - a knocker stays on THEIR side of the door. Pass 1 re-rolls a room
//     preference every tick, so "leave them where they are" has to be an
//     answer the hold writes, not one it omits (Plan 3's scar, second form).
//   - a proposal accepted binds the schedule exactly as a meal does, and one
//     declined or lapsed leaves NO commitment record at all.
//   - the tick stayed synchronous, pure and model-free (R2/D18) — a text's
//     words come from a table, not a generation.
const path = require('path');
const fs = require('fs');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'sim.js', 'drives.js', 'cognition.js', 'overture.js', 'commitments.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

const HOUSES = 12, DAY = 48, DAYS = 7;

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __res = (block, loc) => ({ block: block || 'leisure', location: loc, activity: '', transit: null });
  __ctx = (g, id, loc) => ({ perceived: [], block: 'leisure', location: loc || 'living_room',
                             npcId: id, currentTick: getTickIndex(g.meta.clock.minutes), isVisitor: false });
  __open = (g, id, loc) => Object.keys(scoreOvertures(g.npcs[id], id, g, __ctx(g, id, loc)));

  // Lock the door on the player's CURRENT room, through the object the house
  // actually generated. A synthetic door pushed into the bucket loses to the
  // real one — getDoorState takes the FIRST bedroom_door it finds, and the
  // generated one is already there. That cost a confusing minute; do not
  // "simplify" this back.
  __lock = (g, state) => {
    const bucket = g.objects['room_' + g.player.location] || (g.objects['room_' + g.player.location] = {});
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (door) door.state = { ...door.state, lock: state };
    else bucket.__door = { id: '__door', defId: 'bedroom_door', state: { lock: state } };
    return getDoorState(g, g.player.location);
  };

  // The knock scenario, run so that the KNOCK is what fires: the player behind
  // a locked door, the NPC in the adjoining hall, every OTHER channel on
  // cooldown. Without that last part the text channel is a candidate too — it
  // is 'remote', so it always is — and which of the two wins comes down to the
  // generated NPC's temperament. The assertions below are about a knock's
  // mechanics, not about a tiebreak.
  __KNOCK_ID = Object.keys(OVERTURE_DEFS).find(id => OVERTURE_DEFS[id].channel === 'knock');
  __knock = (seed) => {
    const g = __mk(seed);
    const id = __ids(g)[0];
    g.player.location = 'bedroom_player';
    __lock(g, 'locked');
    g.npcs[id].relPlayer.affection = 1;
    const tick = getTickIndex(g.meta.clock.minutes);
    for (const ovId of Object.keys(OVERTURE_DEFS)) {
      if (ovId === __KNOCK_ID) continue;
      g.npcs[id] = setCooldown(g.npcs[id], ovId, tick);
    }
    const hall = ROOM_ADJACENCY['bedroom_player'][0];
    const r = evaluateDrives(g.npcs[id], id, g.npcs, __res('leisure', hall), g, () => 0.5, tick);
    return { g, id, hall, r };
  };

  __eventImportance = (evt) => (typeof evt.importance === 'number') ? evt.importance
    : (MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] !== undefined
        ? MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] : MEMORY_IMPORTANCE.ambient);

  // The plan's measurement trap, for the third harness running: resolveBatch
  // does NOT write episodes — UI's advanceAndResolve does, outside the tick.
  // Without this loop the knowledge layer stays empty, curiosity reads zero,
  // and every channel below looks dead when only the harness is.
  //
  // Counts overtures by CHANNEL as well as by motive, which is the honest unit
  // now that there are four of them: tuning a baseAppeal moves one channel and
  // tuning motiveWeight moves all four.
  __run = (seed, ticks, opts) => {
    opts = opts || {};
    let g = __mk(seed);
    if ('playerRoom' in opts) g.player.location = opts.playerRoom;
    if (opts.lock) __lock(g, 'locked');
    if (opts.rel) for (const id of __ids(g)) Object.assign(g.npcs[id].relPlayer, opts.rel);
    const byChannel = {}, byMotive = {};
    let texts = 0, bothAtOnce = 0, textHeld = 0, knockerPulledIn = 0, proposalsNoTerms = 0;
    let prev = new Set();
    // A text leaves no record, so the per-motive tally below cannot see one the
    // way it sees the other three. Intercepting the line builder is how it
    // does: without this the by-motive column reads {} on an arm where every
    // overture was a text, which looks exactly like nothing happening.
    const origLine = overtureTextLine;
    overtureTextLine = function (record, rng) {
      byMotive[record.motive] = (byMotive[record.motive] || 0) + 1;
      return origLine(record, rng);
    };
    try {
    for (let t = 0; t < ticks; t++) {
      const before = {};
      for (const id of __ids(g)) before[id] = ((g.world.computer.apps.im.threads[id] || {}).msgs || []).length;
      const r = resolveBatch(g, 1);
      g = r.state;
      if ('playerRoom' in opts) g.player.location = opts.playerRoom;
      if (opts.lock) __lock(g, 'locked');
      for (const evt of r.events) {
        const npc = g.npcs[evt.npcId];
        if (!npc) continue;
        g.npcs[evt.npcId] = addMemoryEpisode(npc, evt.day, formatEventText(evt, g.npcs),
          __eventImportance(evt), eventEmotionalTag(evt), evt.participants || []);
      }
      const now = new Set();
      for (const id of __ids(g)) {
        const n = g.npcs[id];
        const sent = ((g.world.computer.apps.im.threads[id] || {}).msgs || []).length - before[id];
        if (sent > 0) { texts += sent; byChannel.text = (byChannel.text || 0) + sent; }
        if (n.overture && n.pursuit) bothAtOnce++;
        if (!n.overture) continue;
        now.add(id);
        if (n.overture.channel === 'text') textHeld++;
        if (n.overture.channel === 'knock' && n.location === g.player.location) knockerPulledIn++;
        if (n.overture.channel === 'propose' && !n.overture.proposal) proposalsNoTerms++;
        if (!prev.has(id)) {
          byChannel[n.overture.channel] = (byChannel[n.overture.channel] || 0) + 1;
          byMotive[n.overture.motive] = (byMotive[n.overture.motive] || 0) + 1;
        }
      }
      prev = now;
    }
    } finally { overtureTextLine = origLine; }
    return { residents: __ids(g).length, byChannel, byMotive, texts,
             bothAtOnce, textHeld, knockerPulledIn, proposalsNoTerms };
  };

  __probe = (over) => ({
    bible: { name: 'Probe', scheduleTemplate: 'standard', temperament: { openness: 0.5, assertiveness: 0.5 }, deviantLevel: 0.5 },
    relPlayer: { affection: 0, comfort: 0, desire: 0, tension: 0, trust: 0, respect: 0, grievances: [] },
    memory: { facts: [], episodes: [], openQuestions: [], nextFactId: 1 },
    flags: {}, needs: {}, mood: 0, ...over,
  });
`);

const DEFS = J('OVERTURE_DEFS');
const DEF_IDS = Object.keys(DEFS);
const BY_CHANNEL = Object.fromEntries(DEF_IDS.map(id => [DEFS[id].channel, id]));

// ---------------------------------------------------------------------------
console.log('\n(D8) all four channels ship, and each is an ENTRY rather than a code path');

check(`the table carries all four channels (${DEF_IDS.map(id => DEFS[id].channel).join(', ')})`,
      ['approach', 'text', 'propose', 'knock'].every(c => !!BY_CHANNEL[c]),
      JSON.stringify(Object.keys(BY_CHANNEL)));
check('every channel appears exactly once — two entries on one channel would need a tiebreak nobody wrote',
      new Set(DEF_IDS.map(id => DEFS[id].channel)).size === DEF_IDS.length);
// The Phase 3 assertion, restated because the new entries are the ones that
// could break it: candidateDef checks DRIVE_DEFS first, so a collision makes
// the overture silently unreachable rather than erroring. `text_player` was a
// DRIVE until this phase and is the exact case.
check('no overture id collides with a drive id, and text_player really left DRIVE_DEFS',
      DEF_IDS.every(id => !J('Object.keys(DRIVE_DEFS)').includes(id))
      && api(`candidateDef('text_player') === OVERTURE_DEFS.text_player`),
      JSON.stringify(DEF_IDS.filter(id => J('Object.keys(DRIVE_DEFS)').includes(id))));
check('...and the old drive left nothing behind — no imTemplates, no sendsIm reader without a writer',
      !/imTemplates/.test(codeOf('config.js')) && !/sendsIm/.test(codeOf('config.js'))
      && !/drive\.sendsIm/.test(codeOf('drives.js')),
      'R8: seven hardcoded strings that nothing picks from are dead content with a config entry');
check('every entry names a proximity that OVERTURE_PROXIMITY can evaluate',
      api(`Object.values(OVERTURE_DEFS).every(d => !!OVERTURE_PROXIMITY[d.proximity])`),
      J(`Object.values(OVERTURE_DEFS).map(d => d.proximity).filter(p => !OVERTURE_PROXIMITY[p])`).join(', '));
check('every `requires` key has a source in the SAME registry the do-not-disturb list reads',
      api(`Object.values(OVERTURE_DEFS).every(d => (d.requires || []).every(k => typeof OVERTURE_DND_SOURCES[k] === 'function'))`),
      J(`Object.values(OVERTURE_DEFS).flatMap(d => d.requires || []).filter(k => !OVERTURE_DND_SOURCES[k])`).join(', '));
// The whole reason `requires` exists rather than a second boolean: a knock is
// the channel for the state that BLOCKS an approach. If the two lists ever name
// different keys for "the door is shut" they can be tuned apart.
check('the knock REQUIRES exactly the state the approach forbids, off one registry key',
      DEFS[BY_CHANNEL.knock].requires.includes('locked_door')
      && DEFS[BY_CHANNEL.approach].doNotDisturb.includes('locked_door')
      && !DEFS[BY_CHANNEL.knock].doNotDisturb.includes('locked_door'),
      JSON.stringify({ knockRequires: DEFS[BY_CHANNEL.knock].requires, approachDnd: DEFS[BY_CHANNEL.approach].doNotDisturb }));
check('a channel that awaits an answer says where it waits, and one that does not says neither',
      DEF_IDS.every(id => DEFS[id].awaitsAnswer
        ? (['player', 'here'].includes(DEFS[id].waitAt) && typeof DEFS[id].utility.holdTicks === 'number')
        : (DEFS[id].waitAt === undefined)),
      JSON.stringify(DEF_IDS.map(id => [id, DEFS[id].awaitsAnswer, DEFS[id].waitAt])));
// R8 again: a `respond` label RENDER never draws, or a surface with no labels,
// are the same bug from opposite ends.
check('every `respond` pair carries both labels and the {name} substitution they are rendered with',
      DEF_IDS.filter(id => DEFS[id].respond).length === 2
      && DEF_IDS.filter(id => DEFS[id].respond).every(id =>
        DEFS[id].respond.accept.includes('{name}') && DEFS[id].respond.decline.includes('{name}')),
      JSON.stringify(DEF_IDS.map(id => [id, DEFS[id].respond])));
check('...and only the channels with no existing verb declare one (D8: approach is Talk and Go)',
      !DEFS[BY_CHANNEL.approach].respond && !DEFS[BY_CHANNEL.text].respond
      && !!DEFS[BY_CHANNEL.propose].respond && !!DEFS[BY_CHANNEL.knock].respond);
check('the knock\'s emitsSignal names a real TRANSIENT, in the same shape a drive declares one',
      api(`(() => {
        const e = OVERTURE_DEFS.${BY_CHANNEL.knock}.emitsSignal;
        const def = SIGNAL_DEFS[e.signal];
        return !!def && !!def.decayPerTick && typeof e.intensity === 'number';
      })()`), 'a standing signal here would never fade and a missing one would never sound');
// The number the def was authored against, derived from both tables so Phase 6
// can retune either without this reporting a regression (README rule 5).
check('...and a knock at your own door clears the callout bar, so the scene stops for it',
      J(`SIGNAL_DEFS[OVERTURE_DEFS.${BY_CHANNEL.knock}.emitsSignal.signal].salience
         * OVERTURE_DEFS.${BY_CHANNEL.knock}.emitsSignal.intensity`) > J('SCENE_READER.calloutSalience'),
      'someone at your door IS the thing that stops you — one clause in an establishing passage is not that');
check('D5 still holds across all four: no utility.need anywhere, utility.motive everywhere',
      DEF_IDS.every(id => !DEFS[id].utility.need && !!DEFS[id].utility.motive));
// The ordering the whole table is authored around, re-derived for four entries.
const MAXEAT = J('DRIVE_DEFS.eat.utility.baseAppeal + COGNITION.needWeight');
const MAXCHORE = J(`Math.max(...Object.entries(DRIVE_DEFS).filter(([, d]) => !d.utility.need).map(([, d]) => d.utility.baseAppeal))`);
for (const id of DEF_IDS) {
  const top = J(`OVERTURE_DEFS.${id}.utility.baseAppeal + OVERTURE_DEFS.${id}.utility.motive.weight`);
  check(`${id} tops out at ${top.toFixed(2)} — above every chore (${MAXCHORE.toFixed(2)}) and below a starving eat (${MAXEAT.toFixed(2)})`,
        top > MAXCHORE && top < MAXEAT,
        'D5 as a number, for each channel: a hungry NPC eats, a curious one asks');
}
// Not a tiebreak — an emergent one. The two are both candidates only when the
// NPC is standing next to the player, and there the in-person channel should
// win at every motive strength, which is exactly what a lower base buys.
check(`an NPC who can walk over walks over: text's base (${J('OVERTURE_DEFS.text_player.utility.baseAppeal')}) sits under the approach's (${J('OVERTURE_DEFS.approach_player.utility.baseAppeal')})`,
      J('OVERTURE_DEFS.text_player.utility.baseAppeal') < J('OVERTURE_DEFS.approach_player.utility.baseAppeal'));

// ---------------------------------------------------------------------------
console.log('\n(D29) proximity is a named predicate, and it fails CLOSED');

check('an UNKNOWN proximity blocks rather than passing vacuously',
      api(`(() => {
        const g = __mk();
        const def = OVERTURE_DEFS.approach_player;
        const saved = def.proximity;
        def.proximity = 'no_such_place';
        const a = overtureAllowed(g, 'approach_player');
        def.proximity = saved;
        return a.allowed === false && a.reason === 'unknown_proximity';
      })()`), 'D23\'s direction, third registry: a silent always-fires is a layer nobody authored going off in the player\'s face');
check('a `requires` state that is NOT met blocks, and names which one',
      api(`(() => {
        const g = __mk();
        const a = overtureAllowed(g, '${BY_CHANNEL.knock}');
        return a.allowed === false && a.reason === 'not_locked_door';
      })()`), 'Phase 6 counts suppressions by reason, so the reason has to identify the entry');
check('...and the same state MET lets it through',
      api(`(() => {
        const g = __mk();
        g.player.location = 'bedroom_player';
        __lock(g, 'locked');
        return overtureAllowed(g, '${BY_CHANNEL.knock}').allowed === true;
      })()`));
check('an UNKNOWN `requires` key blocks too — both lists read the one registry the same way',
      api(`(() => {
        const g = __mk();
        const def = OVERTURE_DEFS.${BY_CHANNEL.knock};
        const saved = def.requires;
        def.requires = ['no_such_state'];
        const a = overtureAllowed(g, '${BY_CHANNEL.knock}');
        def.requires = saved;
        return a.allowed === false && a.reason === 'unknown_source';
      })()`));
// The rooms come off ROOM_ADJACENCY rather than being named: the Mirrored H is
// sparser than it looks (the living room and the kitchen are two hops apart),
// and hardcoding a pair that turns out not to be adjacent is how the Phase 3
// version of this failed on its first run.
check('adjacent is same-room-or-one-step; outside is one-step-and-not-inside; remote is anywhere',
      api(`(() => {
        const here = 'living_room';
        const next = ROOM_ADJACENCY[here][0];
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== here && !isRoomAdjacent(here, r));
        const P = OVERTURE_PROXIMITY;
        return P.adjacent.test(here, here) === true && P.adjacent.test(next, here) === true && P.adjacent.test(far, here) === false
            && P.outside.test(here, here) === false && P.outside.test(next, here) === true && P.outside.test(far, here) === false
            && P.remote.test(far, here) === true && P.remote.test(null, null) === true;
      })()`));
check('only `remote` reaches a player who is not in the flat, and it is the SAME field that says so',
      api(`(() => {
        const g = __mk(); g.player.location = null;
        const away = Object.fromEntries(Object.keys(OVERTURE_DEFS).map(id => [id, overtureAllowed(g, id)]));
        return Object.entries(away).every(([id, a]) => OVERTURE_PROXIMITY[OVERTURE_DEFS[id].proximity].needsPlayerRoom
          ? (a.allowed === false && a.reason === 'player_away')
          : a.allowed === true);
      })()`), 'the one thing the in-person channels can never do is the text channel\'s whole reason to exist');
check('the four channels sort themselves by geometry, with no code branching on the channel name',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const here = g.player.location;
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== here && !isRoomAdjacent(here, r));
        const openDoor = __open(g, id, here).sort().join(',');
        const away = __open(g, id, far).sort().join(',');
        const g2 = __mk(); g2.npcs[id].relPlayer.affection = 1;
        g2.player.location = 'bedroom_player'; __lock(g2, 'locked');
        const hall = ROOM_ADJACENCY['bedroom_player'][0];
        const shut = __open(g2, id, hall).sort().join(',');
        return openDoor === 'approach_player,propose_player,text_player'
          && away === 'text_player'
          && shut === 'knock_player,text_player'
          ? true : JSON.stringify({ openDoor, away, shut });
      })() === true`), 'door open and next to you → approach; two rooms away → text; door shut → knock');

// ---------------------------------------------------------------------------
console.log('\nthe TEXT channel: what text_player stopped pretending');

check('every motive a text can carry has a template list, and so does the charged tone',
      api(`(() => {
        const need = OVERTURE_DEFS.text_player.motives.concat(['charged']);
        return need.every(k => Array.isArray(OVERTURE_TEXT_TEMPLATES[k]) && OVERTURE_TEXT_TEMPLATES[k].length > 0);
      })()`), 'a motive with no list sends nothing and errors nowhere');
// Without this the pool can empty and the text silently never sends — which is
// the same defect class as a `when` clause nobody can evaluate.
check('...and every list carries at least one entry that needs no topic',
      api(`Object.values(OVERTURE_TEXT_TEMPLATES).every(l => l.some(s => !s.includes('{topic}')))`),
      J(`Object.entries(OVERTURE_TEXT_TEMPLATES).filter(([, l]) => l.every(s => s.includes('{topic}'))).map(([k]) => k)`).join(', '));
check('the charged list reads differently from the warm desire one (D12)',
      JSON.stringify(J('OVERTURE_TEXT_TEMPLATES').charged) !== JSON.stringify(J('OVERTURE_TEXT_TEMPLATES').desire));
check('a text about a topic NAMES the topic; the same motive without one still sends',
      api(`(() => {
        const withTopic = overtureTextLine({ motive: 'curiosity', tone: 'warm', motiveRef: { topic: 'the broken mug' } }, () => 0);
        const without = overtureTextLine({ motive: 'curiosity', tone: 'warm', motiveRef: {} }, () => 0);
        return withTopic.includes('the broken mug') && !!without && !without.includes('{topic}');
      })()`), 'the old drive said "the wifi is being weird again" whatever the NPC actually wanted');
check('a charged text comes from the charged list, not the desire one',
      api(`(() => {
        const c = overtureTextLine({ motive: 'desire', tone: 'charged', motiveRef: {} }, () => 0);
        return OVERTURE_TEXT_TEMPLATES.charged.includes(c) && !OVERTURE_TEXT_TEMPLATES.desire.includes(c);
      })()`));
check('a text lands in the IM thread, unread, in the tick it is sent',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== g.player.location && !isRoomAdjacent(g.player.location, r));
        const r = evaluateDrives(g.npcs[id], id, g.npcs, __res('leisure', far), g, () => 0.5, getTickIndex(g.meta.clock.minutes));
        if (r.imMessages.length !== 1) return 'sent ' + r.imMessages.length;
        processNpcImMessages(g, r.imMessages);
        const th = g.world.computer.apps.im.threads[id];
        return th.msgs.length === 1 && th.unread === 1 && th.msgs[0].from === 'npc'
          && OVERTURE_TEXT_TEMPLATES.affection.includes(th.msgs[0].text);
      })() === true`), 'the surface is the one the drive already used — the phone, not the scene');
// This is design invariant 2 read the other way round. A record that awaits
// nothing must not exist, or SIM's hold pins an NPC in place for two ticks
// because they sent a message.
check('a text leaves NO record — no pending overture, no hold, no cooldown on anything else',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== g.player.location && !isRoomAdjacent(g.player.location, r));
        const r = evaluateDrives(g.npcs[id], id, g.npcs, __res('leisure', far), g, () => 0.5, 0);
        return !g.npcs[id].overture && !g.npcs[id].pursuit
          && r.updatedNpc.flags[DRIVE_COOLDOWN_KEY].text_player === 0
          && r.locationOverride === null && r.activityOverride === null;
      })()`), 'no location override either: a text does not move anybody');
check('...and it still consumes the tick, so it cannot stack with a drive',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== g.player.location && !isRoomAdjacent(g.player.location, r));
        const r = evaluateDrives(g.npcs[id], id, g.npcs, __res('leisure', far), g, () => 0.5, 0);
        const stamped = Object.keys(r.updatedNpc.flags[DRIVE_COOLDOWN_KEY]).filter(k => r.updatedNpc.flags[DRIVE_COOLDOWN_KEY][k] === 0);
        return r.events.length === 0 && stamped.length === 1 && stamped[0] === 'text_player';
      })()`), 'one action per npc-tick — a channel that costs no tick would be an expression, and expressions are Phase 1\'s');

// ---------------------------------------------------------------------------
console.log('\nthe PROPOSE channel: a real commitment, booked from the other side');

check('the proposal names a kind COMMITMENT_KINDS knows, a real room and a real window',
      api(`(() => {
        const g = __mk();
        const t = proposeTerms(__probe(), OVERTURE_DEFS.propose_player, g);
        const kd = COMMITMENT_KINDS[t.kind];
        return !!kd && !!ROOMS[t.roomId] && t.roomId === kd.roomId
          && t.tickEnd > t.tickStart && t.tickEnd <= CLOCK.ticksPerDay;
      })()`));
check('...and it is always in the FUTURE, never a window that has already opened',
      api(`(() => {
        const g = __mk();
        for (let tick = 0; tick < CLOCK.ticksPerDay; tick++) {
          g.meta.clock = { ...g.meta.clock, minutes: tick * CLOCK.tickMinutes };
          const t = proposeTerms(__probe(), OVERTURE_DEFS.propose_player, g);
          if (!t) continue;
          if (t.day === g.meta.clock.day && t.tickStart <= tick) return 'tick ' + tick + ' proposed ' + JSON.stringify(t);
          if (t.day > g.meta.clock.day + COMMITMENT_KINDS[t.kind].maxAheadDays - 1) return 'too far ahead at tick ' + tick;
        }
        return true;
      })() === true`), 'a proposal for a slot that started an hour ago is a bug the player would have to notice for you');
// The same bar respondToCommitment applies to an INVITEE, applied to the
// proposer — who is never polled, because nobody declines their own proposal.
// If the two used different bars, an NPC could propose a slot they will spend
// at work and then not turn up.
check('the proposer never proposes a slot their own schedule is busy for',
      api(`(() => {
        const busy = COMMITMENT_TUNING.busyBlocks;
        const g = __mk();
        // A template whose every slot is work: proposeTerms must find nothing
        // rather than proposing one anyway.
        const always = { ...__probe(), bible: { ...__probe().bible, scheduleTemplate: '__allwork' } };
        SCHEDULES.__allwork = { weekday: { work: [[0, 48, 1]] }, weekend: { work: [[0, 48, 1]] } };
        const none = proposeTerms(always, OVERTURE_DEFS.propose_player, g);
        delete SCHEDULES.__allwork;
        const free = proposeTerms(__probe(), OVERTURE_DEFS.propose_player, g);
        return none === null && !!free && !busy.includes(resolveScheduleActivity(__probe(), { day: free.day, minutes: free.tickStart * CLOCK.tickMinutes }).block);
      })()`), 'the invitee bar and the proposer bar are one constant, read twice');
check('an NPC with no free slot is not a CANDIDATE — it never wins a tick it cannot deliver',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const before = __open(g, id, g.player.location).includes('propose_player');
        SCHEDULES.__allwork = { weekday: { work: [[0, 48, 1]] }, weekend: { work: [[0, 48, 1]] } };
        g.npcs[id].bible = { ...g.npcs[id].bible, scheduleTemplate: '__allwork' };
        const after = __open(g, id, g.player.location).includes('propose_player');
        delete SCHEDULES.__allwork;
        return before === true && after === false;
      })()`), 'the snoop_phone defect — a candidate whose resolver does nothing — not repeated in a new channel');
check('openOverture REFUSES a propose choice with no terms rather than opening an unanswerable record',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const bad = openOverture(g, id, { overtureId: 'propose_player', motive: 'affection', motiveRef: {}, tone: 'warm' });
        return bad === null && !g.npcs[id].overture;
      })()`));
check('the record carries the terms, and every OTHER channel\'s record is the Phase 3 shape exactly',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const base = 'channel,motive,motiveRef,openedDay,overtureId,status,targetId,ticksLeft,tone';
        const terms = proposeTerms(g.npcs[id], OVERTURE_DEFS.propose_player, g);
        const shapes = {};
        for (const ovId of Object.keys(OVERTURE_DEFS)) {
          if (!OVERTURE_DEFS[ovId].awaitsAnswer) continue;
          const rec = openOverture(g, id, { overtureId: ovId, motive: 'affection', motiveRef: {}, tone: 'warm',
                                            ...(OVERTURE_DEFS[ovId].proposes ? { proposal: terms } : {}) });
          shapes[ovId] = Object.keys(rec).sort().join(',');
          delete g.npcs[id].overture;
        }
        const withTerms = base.split(',').concat('proposal').sort().join(',');
        return Object.entries(shapes).every(([ovId, keys]) =>
          keys === (OVERTURE_DEFS[ovId].proposes ? withTerms : base))
          ? true : JSON.stringify(shapes);
      })() === true`), 'an optional field beats a null on three records — absent already means none everywhere else here');

// ---------------------------------------------------------------------------
console.log('\n...and the commitment it books binds exactly as a meal does');

check('createCommitment defaults to kind meal, so every caller that predates this reads unchanged',
      api(`(() => {
        const g = __mk();
        const { record } = createCommitment(g, { day: g.meta.clock.day, tickStart: 38, tickEnd: 42, roomId: 'dining', invitedIds: [] });
        return record.kind === 'meal';
      })()`));
check('a proposer goes straight into acceptedIds and is never polled',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        // Relationship far below COMMITMENT_TUNING.acceptThreshold: respondToCommitment
        // would decline outright, and the proposer must not be asked.
        g.npcs[id].relPlayer.affection = -1;
        const { record, responses } = createCommitment(g, { kind: 'hangout', day: g.meta.clock.day, tickStart: 38, tickEnd: 42, roomId: 'living_room', invitedIds: [], proposerId: id });
        return record.acceptedIds.length === 1 && record.acceptedIds[0] === id
          && record.declinedIds.length === 0 && Object.keys(responses).length === 0;
      })()`), 'nobody declines their own proposal, and a noise draw must not be able to');
check('the schedule override finds a hangout and reports the kind\'s block and room',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const tick = 38;
        g.meta.clock = { ...g.meta.clock, minutes: tick * CLOCK.tickMinutes };
        createCommitment(g, { kind: 'hangout', day: g.meta.clock.day, tickStart: 38, tickEnd: 42, roomId: 'living_room', invitedIds: [], proposerId: id });
        const r = resolveScheduleActivity(g.npcs[id], g.meta.clock, g, id);
        return r.block === COMMITMENT_KINDS.hangout.block && r.commitmentRoomId === 'living_room' && r.commitmentKind === 'hangout';
      })()`));
// The bug this exists to catch: a hangout resolves as ordinary 'leisure', so a
// relocation keyed on `block === 'meal'` would let it fall through to the
// wandering branch and bind the schedule in name only.
check('...and the tick RELOCATES them there, keyed on the room rather than on the block name',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.meta.clock = { ...g.meta.clock, minutes: 38 * CLOCK.tickMinutes };
        g.npcs[id].location = 'bedroom_2';
        createCommitment(g, { kind: 'hangout', day: g.meta.clock.day, tickStart: 38, tickEnd: 42, roomId: 'living_room', invitedIds: [], proposerId: id });
        const out = resolveBatch(g, 1).state.npcs[id];
        return out.location === 'living_room' && out.activity === COMMITMENT_KINDS.hangout.boundActivity;
      })()`), 'the invitation binds, it does not hope — and a meal is the same code path');
check('a meal still binds the way it always did, from the same generalised path',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.meta.clock = { ...g.meta.clock, minutes: 38 * CLOCK.tickMinutes };
        g.npcs[id].location = 'bedroom_2';
        g.npcs[id].relPlayer.affection = 1;
        const { record } = createCommitment(g, { day: g.meta.clock.day, tickStart: 38, tickEnd: 42, roomId: 'dining', invitedIds: [id] });
        if (!record.acceptedIds.includes(id)) return 'the invitee declined; the fixture is wrong, not the code';
        const out = resolveBatch(g, 1).state.npcs[id];
        return out.location === 'dining' && out.activity === COMMITMENT_KINDS.meal.boundActivity;
      })() === true`), 'the string moved into COMMITMENT_KINDS; it must not have changed on the way');
check('a commitment of an UNKNOWN kind is not found — it has no block to override anything with',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.meta.clock = { ...g.meta.clock, minutes: 38 * CLOCK.tickMinutes };
        g.world.commitments = [{ id: 'x', kind: '__nonsense', day: g.meta.clock.day, tickStart: 38, tickEnd: 42,
                                 roomId: 'living_room', invitedIds: [], acceptedIds: [id], declinedIds: [], status: 'scheduled' }];
        return activeCommitmentFor(id, g) === null;
      })()`), 'falling through to the template is the only safe answer, and it used to be the only possible one');
// The whole reason the commitment is created on ACCEPT rather than on the
// proposal: "no orphan record" becomes a property of the control flow.
check('a declined or lapsed proposal leaves NO commitment record at all',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const terms = proposeTerms(g.npcs[id], OVERTURE_DEFS.propose_player, g);
        openOverture(g, id, { overtureId: 'propose_player', motive: 'affection', motiveRef: {}, tone: 'warm', proposal: terms });
        resolveOverture(g, id, 'refused');
        const afterRefuse = (g.world.commitments || []).length;
        openOverture(g, id, { overtureId: 'propose_player', motive: 'affection', motiveRef: {}, tone: 'warm', proposal: terms });
        lapseOverture(g, id);
        return afterRefuse === 0 && (g.world.commitments || []).length === 0 && !g.npcs[id].overture;
      })()`), 'nothing is booked until the player says yes, so nothing has to be swept when they do not');

// ---------------------------------------------------------------------------
console.log('\nthe KNOCK channel: they stay on their side of the door');

check('the knock opens a record through the real tick, from the hall, at a shut door',
      api(`(() => {
        const { g, id } = __knock();
        return !!g.npcs[id].overture && g.npcs[id].overture.channel === 'knock';
      })()`));
check('it emits its signal into the PLAYER\'s room, not the knocker\'s',
      api(`(() => {
        const { g, id } = __knock();
        const sig = (g.world.signals || []).find(s => s.id === OVERTURE_DEFS[__KNOCK_ID].emitsSignal.signal);
        return !!sig && sig.roomId === 'bedroom_player' && sig.sourceId === id;
      })()`), 'an overture is aimed at a person, so its signal lands where that person is');
check('...and the player hears it undiminished, through no door and no hop',
      api(`(() => {
        const { g } = __knock();
        const heard = perceiveSignals(g, 'player', 'bedroom_player').find(r => r.signalId === OVERTURE_DEFS[__KNOCK_ID].emitsSignal.signal);
        return !!heard && heard.here === true && heard.salience >= SCENE_READER.calloutSalience;
      })()`));
check('the knocker is NOT walked into the room they are knocking on',
      api(`(() => {
        const { g, id, r } = __knock();
        return r.locationOverride === null
          && r.activityOverride === OVERTURE_DEFS[__KNOCK_ID].activityOverride
          && g.npcs[id].location !== g.player.location;
      })()`), 'walking them in would be walking them through the door');
// Plan 3's scar in its second form. 'here' has to be an ANSWER the hold writes,
// not one it omits: Pass 1 re-rolls a room preference every tick, so leaving
// npcUpdates alone lets the knocker drift off to the kitchen still holding a
// record that says they are at your door.
check('overtureWaitRoom answers "their own room" for a knock and "the player\'s" for an approach',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].location = 'hallway_a';
        openOverture(g, id, { overtureId: '${BY_CHANNEL.knock}', motive: 'affection', motiveRef: {}, tone: 'warm' });
        const k = overtureWaitRoom(g, g.npcs[id]);
        delete g.npcs[id].overture;
        openOverture(g, id, { overtureId: 'approach_player', motive: 'affection', motiveRef: {}, tone: 'warm' });
        const a = overtureWaitRoom(g, g.npcs[id]);
        return k.roomId === 'hallway_a' && k.activity === OVERTURE_DEFS.${BY_CHANNEL.knock}.activityOverride
          && a.roomId === g.player.location && a.activity === OVERTURE_DEFS.approach_player.activityOverride;
      })()`), 'a null here would leave Pass 1\'s wandering in place — the same mistake that cancelled 233 of 485 pursuits');
check('the response surface offers a knocker from the next room and an approach from this one',
      api(`(() => {
        const g = __mk(); const ids = __ids(g);
        g.player.location = 'bedroom_player';
        const hall = ROOM_ADJACENCY['bedroom_player'][0];
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== 'bedroom_player' && !isRoomAdjacent('bedroom_player', r));
        g.npcs[ids[0]].location = hall;
        openOverture(g, ids[0], { overtureId: '${BY_CHANNEL.knock}', motive: 'affection', motiveRef: {}, tone: 'warm' });
        g.npcs[ids[1]].location = far;
        openOverture(g, ids[1], { overtureId: '${BY_CHANNEL.knock}', motive: 'affection', motiveRef: {}, tone: 'warm' });
        const t = overtureRespondTargets(g).map(x => x.npcId);
        return t.length === 1 && t[0] === ids[0];
      })()`), 'a knocker two rooms away is nobody you can open a door for');
check('...and NEVER offers one for a channel with no `respond` — the approach is Talk and Go (D8)',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].location = g.player.location;
        openOverture(g, id, { overtureId: 'approach_player', motive: 'affection', motiveRef: {}, tone: 'warm' });
        return overtureRespondTargets(g).length === 0;
      })()`), 'two ways to answer one overture is two ways that could disagree');
check('overtureRespondTargets is pure',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].location = g.player.location;
        const terms = proposeTerms(g.npcs[id], OVERTURE_DEFS.propose_player, g);
        openOverture(g, id, { overtureId: 'propose_player', motive: 'affection', motiveRef: {}, tone: 'warm', proposal: terms });
        const before = JSON.stringify(g);
        overtureRespondTargets(g);
        return JSON.stringify(g) === before;
      })()`));
check(`the knock waits longer than the approach — answering means crossing a room and opening a door`,
      J(`OVERTURE_DEFS.${BY_CHANNEL.knock}.utility.holdTicks`) > J('OVERTURE_DEFS.approach_player.utility.holdTicks'));

// ---------------------------------------------------------------------------
console.log('\n(R2/D18) the tick is still synchronous, pure and model-free');

check('nothing this phase added is async or reaches the model',
      !/async/.test(codeOf('overture.js')) && !/generateText/.test(codeOf('overture.js'))
      && !/await/.test(codeOf('overture.js')),
      'a text\'s WORDS come from a table; only a conversation is generated');
check('a week of ticks with generateText stubbed to explode never calls it',
      api(`(() => {
        const saved = root.generateText;
        root.generateText = () => { throw new Error('the tick reached the model'); };
        try { __run(20260811, ${DAY}, { rel: { affection: 0.9, comfort: 0.4, desire: 0.9 } }); }
        finally { root.generateText = saved; }
        return true;
      })()`));
// D19, extended to the three new channels. The scan is the Phase 3 one; what
// this phase could have broken is a new writer in ui.js's response surface.
const overtureWrites = [];
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
  for (const _ of codeOf(f).matchAll(/\w+\.overture\s*=\s*\{/g)) overtureWrites.push(`${f}: builds`);
  for (const _ of codeOf(f).matchAll(/delete\s+\w+\.overture/g)) overtureWrites.push(`${f}: deletes`);
}
check('npc.overture is STILL only ever built or deleted in overture.js',
      overtureWrites.length >= 3 && overtureWrites.every(w => w.startsWith('overture.js')),
      JSON.stringify(overtureWrites));
check('the two new UI endings go through the named writers and nothing else',
      /resolveOverture\(currentGameState, npcId, 'refused'\)/.test(codeOf('ui.js'))
      && /resolveOverture\(currentGameState, npcId, 'engaged'\)/.test(codeOf('ui.js'))
      && /function doOvertureRespond/.test(codeOf('ui.js')),
      'D19 — the response surface is a caller of the writers, not a fifth one');

// ---------------------------------------------------------------------------
console.log(`\nOCCUPANCY — ${HOUSES} households x 3 residents x ${DAYS} in-game days, per arm`);

const arms = {};
for (const [name, opts] of [
  ['untouched', {}],
  ['fond (affection 0.9)', { rel: { affection: 0.9 } }],
  ['fond, player out of the flat', { rel: { affection: 0.9 }, playerRoom: null }],
  ['fond, door locked', { rel: { affection: 0.9 }, playerRoom: 'bedroom_player', lock: true }],
]) {
  const acc = { residents: 0, byChannel: {}, byMotive: {}, texts: 0, bothAtOnce: 0, textHeld: 0, knockerPulledIn: 0, proposalsNoTerms: 0 };
  for (let i = 0; i < HOUSES; i++) {
    const r = J(`__run(${20260811 + i * 7919}, ${DAYS * DAY}, ${JSON.stringify(opts)})`);
    acc.residents += r.residents;
    for (const k of ['texts', 'bothAtOnce', 'textHeld', 'knockerPulledIn', 'proposalsNoTerms']) acc[k] += r[k];
    for (const [c, n] of Object.entries(r.byChannel)) acc.byChannel[c] = (acc.byChannel[c] || 0) + n;
    for (const [m, n] of Object.entries(r.byMotive)) acc.byMotive[m] = (acc.byMotive[m] || 0) + n;
  }
  arms[name] = acc;
  const total = Object.values(acc.byChannel).reduce((s, v) => s + v, 0);
  console.log(`        ${name}: ${(total / acc.residents / DAYS).toFixed(3)} per NPC per day  ${JSON.stringify(acc.byChannel)}  ${JSON.stringify(acc.byMotive)}`);
}

const anyArm = (f) => Object.values(arms).reduce((s, a) => s + f(a), 0);
check('a text NEVER leaves a pending record over the whole population',
      anyArm(a => a.textHeld) === 0, `${anyArm(a => a.textHeld)} npc-ticks held one`);
check('a knocker is NEVER standing in the room they knocked on',
      anyArm(a => a.knockerPulledIn) === 0, `${anyArm(a => a.knockerPulledIn)} npc-ticks`);
check('every pending proposal carries its terms',
      anyArm(a => a.proposalsNoTerms) === 0, `${anyArm(a => a.proposalsNoTerms)} without`);
// Design invariant 2, re-measured with four channels rather than argued. This
// is what caught D27 in Phase 3.
check('no NPC ever held a pursuit and an overture at once',
      anyArm(a => a.bothAtOnce) === 0, `${anyArm(a => a.bothAtOnce)} npc-ticks`);
// The phase's own goal, as a number: the text channel has to actually reach a
// player the other three cannot. The untouched arm is deliberately not the bar
// — Phase 3 measured 0.056 overtures/NPC/day there and Phase 6 owns the rate.
check('the text channel reaches a player who is NOT IN THE FLAT, where nothing else can',
      (arms['fond, player out of the flat'].byChannel.text || 0) > 0
      && Object.keys(arms['fond, player out of the flat'].byChannel).join(',') === 'text',
      JSON.stringify(arms['fond, player out of the flat'].byChannel) +
      ' — an away player was 0 overtures of any kind before this phase');
check('the knock channel reaches a player behind a locked door, where the approach cannot',
      (arms['fond, door locked'].byChannel.knock || 0) > 0
      && !arms['fond, door locked'].byChannel.approach,
      JSON.stringify(arms['fond, door locked'].byChannel));
// Deliberately NOT "the approach out-COUNTS the text over the population" —
// that was the first version of this and it is a claim about the FLOOR PLAN,
// not about the scoring. The Mirrored H is sparse (the living room and the
// kitchen are two hops apart), so most of the time an NPC is not adjacent to
// the player and the text is the only channel open to them at all; over 12x7
// it outnumbers the approach 371 to 218 for exactly that reason.
//
// What the baseAppeal gradient actually encodes is a claim about ONE tick with
// both channels open and nothing else to separate them, which is a flat
// temperament. It is deliberately overridable, and the second half is the
// point: `text_player` carried "texting is the low-nerve option — you do not
// have to be in the room or catch anyone's eye" in its comment for two plans
// without anything in the game making it true. Now the weights do. A very warm,
// unassertive person messages you from the next room instead of crossing it,
// and that is a character rather than a bug.
check('at equal temperament the approach outranks the text, which is what the base gradient is for',
      api(`(() => {
        const at = (t, id) => scoreDrive(id, __probe({ bible: { name: 'P', temperament: t } }),
          { perceived: [], block: 'leisure', currentTick: 0, motives: { [id]: { strength: 1 } } }).score;
        const flat = Object.fromEntries(Object.keys(CHARACTER_SCHEMA.bible.temperament.fields).map(a => [a, 0]));
        return at(flat, 'approach_player') > at(flat, 'text_player');
      })()`));
check('...and personality can invert it: warm and unassertive texts rather than crossing the room',
      api(`(() => {
        const at = (t, id) => scoreDrive(id, __probe({ bible: { name: 'P', temperament: t } }),
          { perceived: [], block: 'leisure', currentTick: 0, motives: { [id]: { strength: 1 } } }).score;
        const flat = Object.fromEntries(Object.keys(CHARACTER_SCHEMA.bible.temperament.fields).map(a => [a, 0]));
        const shy = { ...flat, warmth: 0.9, assertiveness: -0.5 };
        const bold = { ...flat, warmth: 0.9, assertiveness: 0.9 };
        return at(shy, 'text_player') > at(shy, 'approach_player')
          && at(bold, 'approach_player') > at(bold, 'text_player');
      })()`), 'the same two axes the old drive named in a comment nothing read');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
