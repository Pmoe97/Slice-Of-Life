// Intimacy & Voyeurism Plan Phase 19 — Music devices & headphones (D7-interplay):
// the apartment's soundscape, and the opt-out of it.
//
// A sound DEVICE (stereo/boombox/record player) is an OBJECT_DEFS whose
// `emits` derives a STANDING `music` signal from its `volume` state while
// `power` is on (SOUND_DEVICE_DEFS.musicByVolume). The mp3_player/headphones
// are WORN accessories (wardrobe accessory slot) marked `blocksSound`; the
// wearer — player OR NPC — perceives nothing on the audio channel (the filter
// lives in perceiveSignals, the ONE query every surface reads, so door cues,
// the listen hold, the scene reader, NPC mood and gossip all go quiet for a
// wearer while the signals still exist for the world). Music lifts the mood
// of everyone who can hear it; very loud music occasionally provokes a
// "keep it down" beat (a real event).
//
// Section 7 is the MANDATORY per-session gate check: this phase adds no
// intimacy surface — assert the willingness gate is byte-unchanged in
// behavior (a floored target's paired act never fires, zero footprint) and
// that no sound path touches the willingness function. Section 8 is the
// save/load round-trip through the REAL writeGeneratedGameState/loadGameState
// against an in-memory kv adapter (meta pre-seeded, exactly like a fresh kv
// swap).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['defs.actions.js', 'signals.js', 'scene.js'] });
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
    }
    h.world.signals = [];
    return h;
  }
`);

api(`
  function residentsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

// The stereo behind the apartment's music, found in the given room. The
// seeded instance lives in the living room (APARTMENT_LAYOUT v5); on rooms
// that don't carry one this CREATES it, so a check can place the music
// source behind a door or down a corridor. Mutates state and returns the
// instance (null only if the def vanished — a def regression, not a code
// one).
api(`
  function stereoIn(h, roomId, power, volume) {
    const bucket = h.objects['room_' + roomId] || (h.objects['room_' + roomId] = {});
    let obj = Object.values(bucket).find(o => o.defId === 'stereo');
    if (!obj) {
      const inst = makeObjectInstance({ defId: 'stereo', ownerId: 'player' }, 'room_' + roomId, 99, h.seed, roomId, h.npcs, 1);
      if (!inst) return null;
      bucket[inst.id] = inst;
      obj = inst;
    }
    obj.state = { power: power || 'off', volume: volume || '0' };
    return obj;
  }
`);

// The single strongest music record a perceiver gets right now.
api(`
  function musicPerceived(h, perceiverId, roomId) {
    let best = null;
    for (const r of perceiveSignals(h, perceiverId, roomId)) {
      if (r.signalId === 'music' && (!best || r.intensity > best.intensity)) best = r;
    }
    return best;
  }
`);

// Pin a resident into a room for a window: BOTH halves of the commitment
// bind. world.commitments is what activeCommitmentFor/resolveScheduleActivity
// read; npc.commitment is what the held-record path (deriveHeldRecord for a
// not-due NPC) reads — the pass-1 resolution reads one or the other depending
// on whether the NPC is due, so a pin that writes only the world record lets
// a not-due NPC fall through to null and get skipped. Both set, a pin keeps
// the NPC in the room for the whole window regardless of their schedule.
api(`
  function pinResident(h, npcId, roomId, day, startMin, endMin) {
    h.world.commitments = h.world.commitments || [];
    const startAbs = day * 1440 + startMin, endAbs = day * 1440 + endMin;
    h.world.commitments.push({ kind: 'hangout', status: 'scheduled', startAbs, endAbs, acceptedIds: [npcId], roomId });
    h.npcs[npcId].commitment = {
      id: 'test-pin', kind: 'hangout', startedAtAbs: startAbs, completesAtAbs: endAbs,
      anchor: { roomId, point: null }, arrived: true,
      activity: 'spending time together', score: 1, needsAtOpen: {}, shouted: [],
    };
  }
`);

// resolveTick RETURNS npcUpdates rather than writing them (the caller merges
// them); mood assertions must read npcUpdates[id].mood. applyTick merges and
// returns the new events.
api(`
  function applyTick(h) {
    const { npcUpdates, newEvents } = resolveTick(h);
    for (const [k, u] of Object.entries(npcUpdates || {})) h.npcs[k] = { ...h.npcs[k], ...u };
    return newEvents;
  }
`);

// --- In-memory kv adapter (mirrors w18's makeMemKv). ---
api(`
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      m.entries = async () => Object.entries(stores[name] || {}).map(([k, v]) => [k, structuredClone(v)]);
      m.values = async () => Object.values(stores[name] || {}).map(v => structuredClone(v));
      m.getMany = async (ks) => Promise.all(ks.map(k => m.get(k)));
      m.setMany = async (pairs) => { for (const [k, v] of pairs) await m.set(k, v); };
      m.deleteMany = async (ks) => { for (const k of ks) await m.delete(k); };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex', 'menu', 'pendingOp', 'kv']) kv[f] = wrap(f);
    return kv;
  }
`);

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. The standing music signal (derived from device state)');

await check('a fresh house seeds the stereo in the living room (APARTMENT_LAYOUT v5)',
  api(`(() => {const h = house(20260901, 3); return Object.values(h.objects.room_living_room || {}).some(o => o.defId === 'stereo');})()`));

await check('power off -> no music signal at all',
  api(`(() => {
    const h = house(20260901, 3);
    const obj = stereoIn(h, 'living_room', 'off', '2');
    if (!obj) return false;
    return deriveStandingSignals(h).filter(s => s.signalId === 'music').length === 0;
  })()`));

await check('power on + volume 0 -> still silent',
  api(`(() => {
    const h = house(20260901, 3);
    const obj = stereoIn(h, 'living_room', 'on', '0');
    if (!obj) return false;
    return deriveStandingSignals(h).filter(s => s.signalId === 'music').length === 0;
  })()`));

await check('power on + volume 2 -> one music signal at the volume-2 intensity (0.5), sourced from the device',
  api(`(() => {
    const h = house(20260901, 3);
    const obj = stereoIn(h, 'living_room', 'on', '2');
    if (!obj) return false;
    const music = deriveStandingSignals(h).filter(s => s.signalId === 'music');
    return music.length === 1 && music[0].roomId === 'living_room'
      && Math.abs(music[0].intensity - 0.5) < 1e-9 && music[0].sourceId === obj.id;
  })()`));

await check('ejecting (power off) kills the standing signal with no cleanup path needed',
  api(`(() => {
    const h = house(20260901, 3);
    const obj = stereoIn(h, 'living_room', 'on', '3');
    if (!obj) return false;
    obj.state = { power: 'off', volume: '3' };
    return deriveStandingSignals(h).filter(s => s.signalId === 'music').length === 0;
  })()`));

console.log('\n2. Propagation, attenuation and the headphones receiver filter');

await check('the player in the same room hears volume-2 music at full strength',
  api(`(() => {
    const h = house(20260901, 3);
    stereoIn(h, 'living_room', 'on', '2');
    h.player.location = 'living_room';
    const m = musicPerceived(h, 'player', 'living_room');
    return !!m && Math.abs(m.intensity - 0.5) < 1e-9 && m.channel === 'sound';
  })()`));

await check('one closed door away the same music arrives attenuated (0.5 x 0.5 hop x 0.45 door ~= 0.11)',
  api(`(() => {
    const h = house(20260901, 3);
    stereoIn(h, 'bedroom_1', 'on', '2');
    h.player.location = 'hallway_a';
    h.player.energy = 100; // energy > 70 lifts attention above the notice floor for a faint arrival
    const m = musicPerceived(h, 'player', 'hallway_a');
    return !!m && Math.abs(m.intensity - 0.5 * 0.5 * 0.45) < 1e-6;
  })()`));

await check('wearing headphones silences the WHOLE audio channel for the wearer only',
  api(`(() => {
    const h = house(20260901, 3);
    stereoIn(h, 'living_room', 'on', '3');
    h.player.location = 'living_room';
    h.player.outfit = { accessory: 'headphones' };
    h.player.clothing = 'dressed';
    const before = perceiveSignals(h, 'player', 'living_room');
    return before.length === 0 || !before.some(r => r.channel === 'sound');
  })()`));

await check('... while the same signal still exists for a non-wearing resident (world unchanged, receiver only)',
  api(`(() => {
    const h = house(20260901, 3);
    stereoIn(h, 'living_room', 'on', '3');
    h.player.location = 'living_room';
    h.player.outfit = { accessory: 'headphones' };
    const [id] = residentsOf(h);
    h.npcs[id].location = 'living_room';
    return !!musicPerceived(h, id, 'living_room');
  })()`));

await check('wearsSoundBlocking reads the accessory slot for both perceiver kinds; plain outfits never block',
  api(`(() => {
    const h = house(20260901, 3);
    const [id] = residentsOf(h);
    h.player.outfit = { accessory: 'necklace' };
    const a = wearsSoundBlocking(h, 'player');
    h.player.outfit = { accessory: 'headphones' };
    const b = wearsSoundBlocking(h, 'player');
    h.npcs[id].outfit = { accessory: 'mp3_player' };
    const c = wearsSoundBlocking(h, id);
    h.npcs[id].outfit = {};
    const d = wearsSoundBlocking(h, id);
    return !a && b && c && !d;
  })()`));

console.log('\n3. The door-cue / listen gate (Phase 3 interplay)');

await check('a music cue is audible through a bedroom door for a non-wearer in the hallway',
  api(`(() => {
    const h = house(20260901, 3);
    const [id] = residentsOf(h);
    const roomId = h.npcs[id].residency.room;
    const bucket = h.objects['room_' + roomId] || {};
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    const stereo = stereoIn(h, roomId, 'on', '3');
    if (!door || !stereo) return false;
    // the resident's room may be a south-wing bedroom (bedroom_2/3) whose
    // door opens onto hallway_b — stand in whatever hall their door is on
    const hall = ROOM_ADJACENCY[roomId][0];
    h.player.location = hall;
    h.npcs[id].activity = 'awake';
    const cues = deriveDoorCues(h, door, hall);
    return !!cues && cues.audible.includes('music') && cues.lightThroughKeyhole;
  })()`));

await check('wearing headphones -> the same door reports NO audible cues (light + ajar survive: sight is not blocked)',
  api(`(() => {
    const h = house(20260901, 3);
    const [id] = residentsOf(h);
    const roomId = h.npcs[id].residency.room;
    const bucket = h.objects['room_' + roomId] || {};
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    const stereo = stereoIn(h, roomId, 'on', '3');
    if (!door || !stereo) return false;
    const hall = ROOM_ADJACENCY[roomId][0];
    door.state = { ...door.state, ajar: 'ajar' };
    h.player.location = hall;
    h.player.outfit = { accessory: 'mp3_player' };
    h.player.clothing = 'dressed';
    h.npcs[id].activity = 'awake';
    const cues = deriveDoorCues(h, door, hall);
    return !!cues && cues.audible.length === 0 && cues.lightThroughKeyhole && cues.ajar;
  })()`));

console.log('\n4. NPC mood + the "keep it down" beat');

await check('a resident pinned in the living room hears a volume-1 stereo at the 0.25 in-room intensity and gets exactly that mood term — control-diff vs a silent stereo',
  api(`(() => {
    const deltas = (on) => {
      const h = house(20260902, 3);
      const [id] = residentsOf(h);
      stereoIn(h, 'living_room', on ? 'on' : 'off', '1');
      h.meta.clock.day = 1; h.meta.clock.minutes = 1140;
      pinResident(h, id, 'living_room', 1, 1140, 1260);
      h.npcs[id].location = 'living_room';
      const before = h.npcs[id].mood;
      const { npcUpdates } = resolveTick(h);
      const after = npcUpdates[id] ? npcUpdates[id].mood : null;
      return after === null ? null : after - before;
    };
    const withMusic = deltas(true);
    const noMusic = deltas(false);
    // volume 1 = 0.25 in-room — under the 0.45 keep-it-down threshold, so
    // no beat rolls consume rng anywhere and the two runs share one stream
    // (control-diff isolates the music term from ambient-event noise).
    return withMusic !== null && noMusic !== null
      && Math.abs((withMusic - noMusic) - 0.25 * SOUND_DEVICE_DEFS.music.npcMoodPerIntensity) < 1e-9;
  })()`));

await check('loud music (volume 3) occasionally produces a music_too_loud beat, deterministically, and never when quiet',
  api(`(() => {
    function countBeats(seed, volume) {
      const h = house(seed, 3);
      const [id] = residentsOf(h);
      stereoIn(h, 'living_room', 'on', volume);
      pinResident(h, id, 'living_room', 1, 0, 4320); // pinned for three days
      h.npcs[id].location = 'living_room';
      let n = 0;
      for (let abs = 1440; abs < 5760; abs += 30) {
        h.meta.clock.day = Math.floor(abs / 1440);
        h.meta.clock.minutes = abs % 1440;
        h.meta.clock.weekday = getWeekday(h.meta.clock.day);
        h.meta.clock.phase = getPhase(h.meta.clock.minutes);
        for (const evt of resolveTick(h).newEvents) if (evt.type === 'music_too_loud') n++;
      }
      return n;
    }
    const loud = countBeats(20260903, '3');
    const quiet = countBeats(20260903, '0');
    return loud > 0 && quiet === 0;
  })()`));

await check('the beat is deterministic (same seed, same count) and its template names the resident',
  api(`(() => {
    function countBeats(seed) {
      const h = house(seed, 3);
      const [id] = residentsOf(h);
      stereoIn(h, 'living_room', 'on', '3');
      pinResident(h, id, 'living_room', 1, 0, 4320);
      h.npcs[id].location = 'living_room';
      let n = 0, okName = true;
      for (let abs = 1440; abs < 5760; abs += 30) {
        h.meta.clock.day = Math.floor(abs / 1440);
        h.meta.clock.minutes = abs % 1440;
        h.meta.clock.weekday = getWeekday(h.meta.clock.day);
        h.meta.clock.phase = getPhase(h.meta.clock.minutes);
        for (const evt of resolveTick(h).newEvents) {
          if (evt.type !== 'music_too_loud') continue;
          n++;
          if (!evt.template.includes('{name}')) okName = false;
        }
      }
      return n + (okName ? 1000 : 0);
    }
    const a = countBeats(20260904); const b = countBeats(20260904);
    return a === b && a >= 1000;
  })()`));

await check('a sleeping NPC gets no music mood lift (asleep is not listening) even when the music reaches them, and no beat can fire while everyone sleeps',
  api(`(() => {
    // A time where SOME resident is asleep and nobody else is awake in the
    // flat: 00:30 (only night-shift workers are up, off-map) or 12:00 (only
    // night-shift sleeps, all others off-map at work) — pick whichever holds.
    function findSleepSlot(h) {
      for (const m of [30, 720]) {
        const ids = residentsOf(h);
        for (const id of ids) {
          const mine = resolveScheduleActivity(h.npcs[id], { day: 1, minutes: m }, h, id);
          if (mine.block !== 'sleep') continue;
          const othersFine = ids.every(oid => {
            if (oid === id) return true;
            const b = resolveScheduleActivity(h.npcs[oid], { day: 1, minutes: m }, h, oid).block;
            return b === 'sleep' || b === 'work' || b === 'commute' || b === 'commute_home';
          });
          if (othersFine) return { id, m };
        }
      }
      return null;
    }
    const run = (on) => {
      const h = house(20260905, 3);
      const slot = findSleepSlot(h);
      if (!slot) return null;
      h.meta.clock.day = 1; h.meta.clock.minutes = slot.m;
      h.meta.clock.weekday = 0; h.meta.clock.phase = getPhase(slot.m);
      // park the sleeper in bedroom_1 with a volume-3 stereo IN the room, so
      // the music unambiguously reaches them (0.85 in-room, far above the
      // notice floor) and the claim is really "asleep is not listening"
      h.npcs[slot.id].residency.room = 'bedroom_1';
      h.npcs[slot.id].location = 'bedroom_1';
      stereoIn(h, 'bedroom_1', on ? 'on' : 'off', '3');
      const audible = !!musicPerceived(h, slot.id, 'bedroom_1');
      const before = h.npcs[slot.id].mood;
      const { npcUpdates, newEvents } = resolveTick(h);
      const after = npcUpdates[slot.id] ? npcUpdates[slot.id].mood : null;
      const beats = newEvents.filter(e => e.type === 'music_too_loud').length;
      return { audible, delta: after === null ? null : after - before, beats };
    };
    const on = run(true), off = run(false);
    return on !== null && off !== null && on.audible && on.delta === off.delta && on.beats === 0 && off.beats === 0;
  })()`));

await check('an NPC wearing headphones gets no apartment-music term but does get the worn-device mood gain',
  api(`(() => {
    const run = (worn) => {
      const h = house(20260906, 3);
      const [id] = residentsOf(h);
      stereoIn(h, 'living_room', 'off', '3'); // no apartment music at all
      h.meta.clock.day = 1; h.meta.clock.minutes = 1140;
      pinResident(h, id, 'living_room', 1, 1140, 1260);
      h.npcs[id].location = 'living_room';
      if (worn) { h.npcs[id].outfit = { accessory: 'mp3_player' }; h.npcs[id].clothing = 'dressed'; }
      const before = h.npcs[id].mood;
      const { npcUpdates } = resolveTick(h);
      const after = npcUpdates[id] ? npcUpdates[id].mood : null;
      return after === null ? null : after - before;
    };
    const worn = run(true), bare = run(false);
    return worn !== null && bare !== null
      && Math.abs((worn - bare) - SOUND_DEVICE_DEFS.mp3_player.npcMoodGainPerTick) < 1e-9;
  })()`));

console.log('\n5. The player mood target');

await check('music the player can hear raises the mood target; silence leaves it unchanged',
  api(`(() => {
    const h = house(20260907, 3);
    h.player.location = 'living_room';
    h.player.moodEvents = [];
    const base = resolveMoodTarget(h.player, h, 0, 4);
    const obj = stereoIn(h, 'living_room', 'on', '2');
    if (!obj) return false;
    const withMusic = resolveMoodTarget(h.player, h, 0, 4);
    obj.state = { power: 'off', volume: '2' };
    const afterOff = resolveMoodTarget(h.player, h, 0, 4);
    return withMusic > base && Math.abs(afterOff - base) < 1e-12
      && Math.abs(withMusic - base - Math.min(SOUND_DEVICE_DEFS.music.playerMoodCap, 0.5 * SOUND_DEVICE_DEFS.music.playerMoodScale)) < 1e-9;
  })()`));

await check('a wearer hears no world music (term zero) and instead gets the flat worn term',
  api(`(() => {
    const h = house(20260907, 3);
    h.player.location = 'living_room';
    h.player.moodEvents = [];
    stereoIn(h, 'living_room', 'off', '0'); // no world music, so the flat worn term is the whole story
    const bare = resolveMoodTarget(h.player, h, 0, 4);
    h.player.outfit = { accessory: 'headphones' };
    const worn = resolveMoodTarget(h.player, h, 0, 4);
    h.player.outfit = {};
    const bare2 = resolveMoodTarget(h.player, h, 0, 4);
    return worn === bare + MOOD_TARGET.comfort.wornMusicTerm && bare2 === bare;
  })()`));

console.log('\n6. The verbs (set_volume / play / eject) and the submenu');

await check('sound.play builds power-on + a bump to an audible volume; eject builds power-off; set_volume writes the pick',
  api(`(() => {
    const h = house(20260908, 3);
    const obj = stereoIn(h, 'living_room', 'on', '0');
    if (!obj) return false;
    h.player.location = 'living_room';
    const ctx = buildActionContext(h);
    ctx.actObjId = obj.id;
    const play = buildSoundPlayEffects(ctx, prepareSoundDevice(ctx));
    const eject = buildSoundEjectEffects(ctx, prepareSoundDevice(ctx));
    const vol = buildSoundVolumeEffects(ctx, { objId: obj.id, volume: '3' });
    return play.includes('SET_OBJECT_STATE ' + obj.id + ' power on')
      && play.includes('SET_OBJECT_STATE ' + obj.id + ' volume 2')
      && eject.includes('SET_OBJECT_STATE ' + obj.id + ' power off')
      && vol.includes('SET_OBJECT_STATE ' + obj.id + ' volume 3');
  })()`));

await check('executing the verbs through the REAL effect pipeline flips the standing signal (play -> 0.5, set_volume -> 0.75, eject -> silent)',
  api(`(() => {
    const h = house(20260908, 3);
    const obj = stereoIn(h, 'living_room', 'off', '0');
    if (!obj) return false;
    h.player.location = 'living_room';
    h.player.moodEvents = [];
    const ctx = buildActionContext(h);
    ctx.actObjId = obj.id;
    const effCtx = buildEffectContext(h, [], [], {}, []);
    const run = (lines) => applyEffects(parseEffectDSL(lines.join('\\n')), effCtx);
    run(buildSoundPlayEffects(ctx, prepareSoundDevice(ctx)));
    const afterPlay = deriveStandingSignals(h).some(s => s.signalId === 'music' && s.sourceId === obj.id);
    run(buildSoundVolumeEffects(ctx, { objId: obj.id, volume: '3' }));
    const at3 = deriveStandingSignals(h).find(s => s.signalId === 'music' && s.sourceId === obj.id);
    run(buildSoundEjectEffects(ctx, prepareSoundDevice(ctx)));
    const afterEject = deriveStandingSignals(h).some(s => s.signalId === 'music' && s.sourceId === obj.id);
    return afterPlay && !!at3 && Math.abs(at3.intensity - 0.75) < 1e-9 && !afterEject && obj.state.power === 'off';
  })()`));

await check('the record-player hobby powers the device on (music follows), via buildHobbyEffects',
  api(`(() => {
    const h = house(20260908, 3);
    h.player.location = 'living_room';
    const rec = makeObjectInstance({ defId: 'hobby_record_player', ownerId: 'player' }, 'room_living_room', 99, h.seed, 'living_room', h.npcs, 1);
    h.objects.room_living_room = h.objects.room_living_room || {};
    h.objects.room_living_room[rec.id] = rec;
    const ctx = buildActionContext(h);
    const lines = buildHobbyEffects(ctx, { key: 'hobby_record_player', affection: 0 });
    return lines.some(l => l.includes(rec.id + ' power on')) && lines.some(l => l.includes(rec.id + ' volume 2'));
  })()`));

await check('the submenu parent lists the three verbs and the verbs never surface as flat chips',
  api(`(() => {
    const h = house(20260908, 3);
    stereoIn(h, 'living_room', 'on', '0');
    h.player.location = 'living_room';
    const sub = ACTION_DEFS['sound.interact'].submenu;
    const flat = resolveAvailableActions(h).map(a => a.actionId);
    return JSON.stringify(sub) === JSON.stringify(['sound.play', 'sound.set_volume', 'sound.eject'])
      && !sub.some(v => flat.includes(v));
  })()`));

console.log('\n7. The MANDATORY gate check (this phase adds no intimacy door)');

await check('the willingness gate is untouched: a floored (asleep) target refuses a paired act with ZERO footprint — direct probe AND the action-requirement path',
  api(`(() => {
    const h = house(20260909, 3);
    const [id] = residentsOf(h);
    const room = h.npcs[id].residency.room;
    h.meta.clock.day = 1; h.meta.clock.minutes = 600;
    h.npcs[id].location = room;
    h.npcs[id].activity = 'sleeping';
    h.player.location = room;
    const gate = resolveWillingnessGate(h, id, 'player', 'sex', { actKind: 'intimacy' });
    const beforeHist = JSON.stringify(h.npcs[id].relPlayer);
    const res = executeAction('intimacy.sex', h, 'player', { targetNpcId: id });
    if (res.cancelled) return false;
    if (res.ok) return false;
    return gate.allowed === false && gate.reason === 'floor'
      && JSON.stringify(h.npcs[id].relPlayer) === beforeHist;
  })()`));

await check('the sound layer never reads the gate and never reaches an intimacy verb — call-site census + section slice',
  new Promise((resolve) => {
    const dir = path.join(__dirname, '..', '..', 'src', 'srcfiles');
    const signals = fs.readFileSync(path.join(dir, 'signals.js'), 'utf8');
    const sim = fs.readFileSync(path.join(dir, 'sim.js'), 'utf8');
    const defs = fs.readFileSync(path.join(dir, 'defs.actions.js'), 'utf8');
    const gateCalls = (s) => (s.match(/resolveWillingnessGate\s*\(/g) || []).length;
    // The sound code lives in TWO blocks of defs.actions.js (the defs at
    // 'sound.interact' and the prepare/build/narration helpers below the
    // requirements registry) — slice BOTH, plus the two perception/mood files.
    const soundDefsBlock = defs.slice(defs.indexOf("'sound.interact':"), defs.indexOf('// --- Anchor preference table'));
    const soundHelpersBlock = defs.slice(defs.indexOf('function soundDeviceObj'), defs.indexOf('// --- self.eat'));
    resolve(
      gateCalls(signals) === 0
      && gateCalls(sim) === 0
      && gateCalls(defs) === 1   // the pre-existing willingness requirement checker — NOT a sound path
      && !/resolveWillingnessGate/.test(soundDefsBlock)
      && !/intimacy\.(sex|quickie|cuddle|share_shower)/.test(soundDefsBlock)
      && !/resolveWillingnessGate/.test(soundHelpersBlock)
      && !/intimacy\.(sex|quickie|cuddle|share_shower)/.test(soundHelpersBlock)
    );
  }));

console.log('\n8. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv, meta pre-seeded)');

await check('G.1 — the stereo\'s state, the player\'s headphones outfit, and an NPC\'s worn mp3_player all survive',
  api(`
    (async () => {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt19', clock: { day: 1, minutes: 0 } });
      const h = await SIM_generateHouse('throwaway-w19-rt', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
      h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
      h.player.outfit = { accessory: 'headphones' };
      h.player.clothing = 'dressed';
      const ids = Object.keys(h.npcs);
      h.npcs[ids[0]].outfit = { accessory: 'mp3_player' };
      h.npcs[ids[0]].clothing = 'dressed';
      const stereo = Object.values(h.objects.room_living_room || {}).find(o => o.defId === 'stereo');
      if (!stereo) return false;
      stereo.state = { power: 'on', volume: '2' };
      const stereoState = JSON.stringify(stereo.state);
      await writeGeneratedGameState(h);
      await forceFlush();
      const loaded = await loadGameState();
      const stereo2 = Object.values(loaded.objects.room_living_room || {}).find(o => o.defId === 'stereo');
      return !!stereo2
        && JSON.stringify(stereo2.state) === stereoState
        && loaded.player.outfit?.accessory === 'headphones'
        && loaded.npcs[ids[0]].outfit?.accessory === 'mp3_player'
        && loaded.player.clothing === 'dressed';
    })()
  `));

await check('G.2 — the round trip is deterministic (identical input, identical output)',
  api(`
    (async () => {
      async function trip() {
        root.kv = makeMemKv();
        await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt19d', clock: { day: 1, minutes: 0 } });
        const h = await SIM_generateHouse('throwaway-w19-rtd', 2, [{ name: 'TestA' }, { name: 'TestB' }], null);
        h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
        const stereo = Object.values(h.objects.room_living_room || {}).find(o => o.defId === 'stereo');
        if (stereo) stereo.state = { power: 'on', volume: '1' };
        await writeGeneratedGameState(h);
        await forceFlush();
        const loaded = await loadGameState();
        const s = Object.values(loaded.objects.room_living_room || {}).find(o => o.defId === 'stereo');
        return JSON.stringify(s ? s.state : null);
      }
      const a = await trip(); const b = await trip();
      return a === b && a.includes('volume');
    })()
  `));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
