// ===== SECTION: SCENE =====
// The scene model (src/ref/wip/scene-reader-ui-plan.md, Phase 1).
//
// The main content area is a SCENE — where you are, who is there, what you can
// sense, and what has happened since you walked in — not a flat log of
// everything that has ever occurred.
//
// `composeScene` is PURE and returns a plain object. RENDER projects that
// object onto the DOM and holds no logic of its own (design invariant 1).
// That split is the point of this file: the scene is a computed thing first
// and a DOM tree second, so it can be tested without a browser and reused by
// later plans without going through the renderer.
//
// A scene is room-scoped (D1). `openScene` is the ONLY function here that
// writes, and it writes exactly one key.

// --- Opening a scene ---------------------------------------------------
// Called from UI's doMove BEFORE its narration line, so the "You move to the
// Kitchen" beat lands in the scene it opens rather than the one it closes.
// Idempotent per room: re-entering the room you are already in does not open
// a second scene, which keeps a no-op move from fragmenting history.
function openScene(gameState, roomId) {
  const clock = gameState.meta.clock;
  const prev = gameState.meta.scene ? currentScene(gameState) : null;
  if (prev && prev.roomId === roomId) return gameState.meta.scene;
  gameState.meta.scene = {
    id: (prev?.id ?? 0) + 1,
    roomId,
    startedDay: clock.day,
    startedMinutes: clock.minutes,
    // Signal ids already called out in this scene (D12). Phase 4's
    // markShouted is the writer; until then it stays empty, which is exactly
    // the "nothing has shouted yet" state.
    shouted: [],
    // Door-cue rotation counter (Phase 3, D4) — see markDoorCuesShown.
    doorCueAt: 0,
  };
  return gameState.meta.scene;
}

// The scene a game state is currently in. Falls back to a synthetic scene 0
// for a save written before this plan — its old log entries carry no sceneId
// and read as 0 too, so they land in history rather than being lost.
function currentScene(gameState) {
  const clock = gameState.meta.clock;
  const scene = gameState.meta.scene;
  if (!scene) {
    return {
      id: 0,
      roomId: gameState.player.location,
      startedDay: clock.day,
      startedMinutes: clock.minutes,
      shouted: [],
      doorCueAt: 0,
    };
  }
  // The meta 1->2 migration seeds a scene with a null roomId, because a
  // folder migration only ever sees `meta` and cannot know where the player
  // is standing. Resolve it here rather than writing a guess into the save —
  // derived beats stored, and a lazily-correct room beats a confidently
  // wrong one.
  if (!scene.roomId) return { ...scene, roomId: gameState.player.location };
  return scene;
}

// --- Marking a callout as spent (Phase 4, D12) -------------------------
// Shouting is a side effect of PRESENTING a scene, not of composing one, so
// this lives apart from composeScene (which must stay pure) and is called by
// whoever just drew the thing. Without it a callout re-fires on every render
// — standing in a room with a note would shout at you once per tick, which is
// precisely the noise this whole plan exists to remove.
//
// Leaving the room and coming back opens a NEW scene with an empty `shouted`,
// so the note calls out again. That is correct: you walked in on it afresh.
function markCalloutsShouted(gameState, scene) {
  if (!scene?.callouts?.length) return;
  const open = gameState.meta?.scene;
  if (!open) return;
  const shouted = open.shouted || (open.shouted = []);
  for (const c of scene.callouts) {
    if (!shouted.includes(c.signalId)) shouted.push(c.signalId);
  }
}


// ===== SECTION: DOOR CUES (intimacy-voyeurism Phase 3, D4) =====
// A door the player is standing at can whisper: light through the keyhole,
// a door ajar, a sound behind it. composeDoorCues derives which doors in the
// current room have anything to say (SIGNALS' deriveDoorCues) and turns each
// cue into one line from an authored pool.
//
// D4: cues must be VARIED — a rote "you notice light through the keyhole"
// every render is itself the bug. The pool index is a rotation over the
// scene's doorCueAt counter plus a per-(kind, room, day) offset, so the
// prose walks the pool rather than repeating an entry, and a scene entered
// on another day starts somewhere else. The counter advances on RENDER
// (markDoorCuesShown), exactly like markCalloutsShouted, because composeScene
// itself stays pure. {door} is the door's label ("Bathroom A door").
const DOOR_CUE_POOLS = {
  light: [
    'a warm line of light shows under {door}',
    'light spills through the keyhole of {door}',
    '{door} throws a thin wedge of light into the corridor',
    'a faint glow seeps around the edges of {door}',
    'there is light behind {door}, bright enough to read by',
    'a sliver of warm light escapes beneath {door}',
    '{door} glows softly at the keyhole',
    'lamplight leaks through the gap under {door}',
    'a soft halo of light outlines {door}',
    'the keyhole of {door} is a small bright pinprick',
    'a steady golden glow spills from under {door}',
    'light pushes through the crack around {door}',
  ],
  ajar: [
    '{door} stands ajar, a finger-width of the room showing through',
    '{door} is open a crack',
    'someone has left {door} slightly ajar',
    '{door} hangs ajar, sound carries out through the gap',
    '{door} is not quite shut',
    '{door} sits off its latch',
    '{door} has been left open a few inches',
    '{door} is ajar, not closed all the way',
    'there is a gap at the latch of {door}',
    '{door} sits open just enough to peer through',
    'the edge of {door} stands clear of its frame',
    'a crack shows between {door} and its frame',
  ],
  'sound:running_water': [
    'water is running in there, a steady hiss behind {door}',
    'you can hear the shower going behind {door}',
    'the muffled roar of running water comes through {door}',
    'the shower is running behind {door}',
    'water drums somewhere behind {door}',
    'a white-noise hush of water comes from behind {door}',
    'you can just make out water running behind {door}',
    'behind {door} the shower is on',
    'the sound of running water carries through {door}',
    'a shower hisses away behind {door}',
    'water runs behind {door}, muffled by the door itself',
    'the unmistakable sound of a shower comes from behind {door}',
  ],
  'sound:voices': [
    'voices murmur behind {door}',
    'someone is talking in there, a low voice behind {door}',
    'muffled conversation carries through {door}',
    'two voices trade words behind {door}',
    'a conversation is going on behind {door}',
    'you can hear talking behind {door}',
    'voices rise and fall behind {door}',
    'someone is on a call behind {door}',
  ],
  'sound:footsteps': [
    'footsteps move around behind {door}',
    'someone is pacing behind {door}',
    'you hear movement behind {door}',
    'footsteps cross the room behind {door}',
    'someone walks about in there, behind {door}',
    'the floor creaks under someone moving behind {door}',
  ],
  'sound:machine_running': [
    'a machine is running behind {door}',
    'the washer churns away behind {door}',
    'you can hear machinery humming behind {door}',
    'something mechanical runs behind {door}',
    'the steady grumble of a machine comes from behind {door}',
    'an appliance runs on behind {door}',
  ],
  // Intimacy & Voyeurism Phase 19: the soundscape at the threshold. A
  // device playing behind a door is exactly the cue the headphones mute.
  'sound:music': [
    'music plays behind {door}, turned up enough to carry',
    'you can hear music through {door}, the bass line first',
    'a song is playing behind {door}',
    'music drifts out from behind {door}',
    'there is music on in there, behind {door}',
    'a tune carries through {door}, someone is playing it loud',
  ],
  'sound:humming': [
    'someone is humming behind {door}',
    'a quiet tune carries through {door}',
    'you can hear humming behind {door}',
    'someone hums to themselves behind {door}',
    'a snatch of melody floats out from behind {door}',
    'humming, faint, comes from behind {door}',
  ],
  'sound:sighing': [
    'a long breath out, audible even through {door}',
    'you hear a heavy sigh behind {door}',
    'someone lets out a breath behind {door}',
    'a sigh carries through {door}',
    'there is a tired-sounding exhale behind {door}',
    'someone sighs, and you hear it through {door}',
  ],
  'sound:knocking': [
    'something knocks behind {door}',
    'you hear knocking — from behind {door}',
    'a knock sounds through {door}',
    'rapping, muffled, comes from behind {door}',
    'there is a knock somewhere behind {door}',
  ],
  'sound:door_close': [
    'a door shuts somewhere behind {door}',
    'you hear a door close beyond {door}',
    'a latch clicks behind {door}',
    'something closes with a soft thud behind {door}',
    'a door swings shut behind {door}',
  ],
  'sound:breakage': [
    'something breaks behind {door} — glass?',
    'a crash behind {door}',
    'something hit the floor hard behind {door}',
    'there is a clatter of something falling behind {door}',
    'something shatters behind {door}',
  ],
  'sound:cabinet_slam': [
    'a cupboard slams behind {door}',
    'something bangs behind {door}',
    'a door in there is slammed hard, behind {door}',
    'you hear a frustrated bang behind {door}',
    'a cabinet door shuts with force behind {door}',
  ],
  // An audible signal with no pool of its own. It should be the rare case —
  // the pool grows as signals earn their cue — but never an empty line.
  sound_fallback: [
    'a noise carries through {door}',
    'you can hear something going on behind {door}',
    'there is a muffled sound behind {door}',
    'something is happening behind {door}, you can hear it',
    'sounds drift through {door}',
  ],
};

function pickDoorCueText(kind, signalId, roomId, at, day) {
  const key = kind === 'sound' && signalId ? 'sound:' + signalId : kind;
  const pool = DOOR_CUE_POOLS[key] || DOOR_CUE_POOLS.sound_fallback;
  const offset = hashStr(key + '|' + roomId + '|' + (day || 0)) % pool.length;
  return pool[(at + offset) % pool.length];
}

// Which doors in the player's room have cues right now, one line each. PURE.
function composeDoorCues(gameState, playerRoomId, scene) {
  const out = [];
  const at = scene?.doorCueAt || 0;
  const day = gameState?.meta?.clock?.day || 0;
  for (const [key, type] of Object.entries(ROOM_THRESHOLDS)) {
    if (type !== 'door') continue;
    const [a, b] = key.split('|');
    if (a !== playerRoomId && b !== playerRoomId) continue;   // not a door you are at
    const doorObj = doorObjectBetween(gameState, a, b);
    if (!doorObj) continue;
    const cues = deriveDoorCues(gameState, doorObj, playerRoomId);
    const otherRoom = a === playerRoomId ? b : a;
    if (!cues || cues.roomId !== otherRoom) continue;   // object belongs to a different door
    const doorName = cues.doorName;
    if (cues.lightThroughKeyhole) {
      out.push({ kind: 'light', signalId: null, roomId: cues.roomId, roomName: cues.roomName,
                 line: pickDoorCueText('light', null, cues.roomId, at, day).replace('{door}', doorName) });
    }
    if (cues.ajar) {
      out.push({ kind: 'ajar', signalId: null, roomId: cues.roomId, roomName: cues.roomName,
                 line: pickDoorCueText('ajar', null, cues.roomId, at, day).replace('{door}', doorName) });
    }
    for (const signalId of cues.audible) {
      out.push({ kind: 'sound', signalId, roomId: cues.roomId, roomName: cues.roomName,
                 line: pickDoorCueText('sound', signalId, cues.roomId, at, day).replace('{door}', doorName) });
    }
  }
  return out.slice(0, DOOR_CUE_TUNING.maxCueLines);
}

// The renderer calls this after drawing a scene that showed door cues, so the
// next compose starts one further along the pools. WRITING, and therefore
// deliberately apart from composeScene — see markCalloutsShouted.
function markDoorCuesShown(gameState, scene) {
  const open = gameState?.meta?.scene;
  if (!open) return;
  if (!scene?.doorCues?.length) return;
  open.doorCueAt = (open.doorCueAt || 0) + 1;
}

// --- Composition -------------------------------------------------------

// "Hana is at the counter" — one line per character physically present.
// PRESENCE_PHRASES overrides the default frame for the activity strings that
// read badly in it (D5). Intimacy & Voyeurism Phase 7 (D11): a NOTABLE outfit
// earns a tail on the line ("Hana is at the counter. She's dressed to
// impress.") — only when the outfit crosses the shared prose thresholds and
// only when the NPC is actually wearing it (never over a towel/nude state,
// where the state machine's own lines carry the story).
function presenceLines(gameState, roomId) {
  return getPresentNpcIds(gameState.npcs, roomId).map(npcId => {
    const npc = gameState.npcs[npcId];
    const name = npc.bible?.name || 'Someone';
    const activity = npc.activity || '';
    const template = PRESENCE_PHRASES[activity];
    let line = template
      ? template.replace('{name}', name)
      : (activity ? `${name} is ${activity}.` : `${name} is here.`);
    if (npc.clothing === 'dressed' || !npc.clothing) {
      const flavor = outfitFlavorProse(npc.outfit);
      if (flavor) line = `${line} ${name}'s ${flavor}.`;
    }
    line = presencePregnancyLine(gameState, npcId, name, line);
    return { npcId, name, activity, line };
  });
}

// Intimacy & Voyeurism Phase 18 (D16): a visible pregnancy belongs in the
// same establishing passage as what someone is wearing — the bump is the
// first thing anyone in the room sees. Guarded on typeof because scene.js
// loads before pregnancy.js (pure reader, never a writer).
function presencePregnancyLine(gameState, npcId, name, line) {
  if (typeof pregnancyVisible !== 'function' || !pregnancyVisible(gameState, npcId)) return line;
  return `${line} ${name}'s visibly pregnant — the bump is unmistakable.`;
}

// What the player can sense, as authored prose. Everything here comes from
// PERCEPTION (Plan 1) — this is the first real consumer of `salience`, which
// has been computed on every record since it was written and read by nothing.
function sensoryLines(gameState, roomId) {
  const perceived = mergePerceived(perceiveSignals(gameState, 'player', roomId));
  return perceived.map(rec => ({
    signalId: rec.signalId,
    channel: rec.channel,
    band: rec.band,
    phrase: signalPhrase(rec, gameState),
    here: rec.here,
    sourceRoomId: rec.sourceRoomId,
    sourceRoomName: ROOMS[rec.sourceRoomId]?.name || rec.sourceRoomId,
    salience: rec.salience,
  })).filter(s => s.phrase);
}

// Closed scenes, newest first, derived entirely from the session log —
// nothing about a finished scene is stored (RI3). Log entries carry roomId,
// minutes and sceneId precisely so this is derivable; a second stored list of
// closed scenes could only ever drift from the entries themselves.
//
// History is therefore exactly as deep as the log, which is the right
// behaviour: when a beat is trimmed out of sessionLog its scene shrinks and
// eventually disappears, rather than leaving an empty header behind.
function sceneHistory(gameState) {
  const log = gameState.meta.sessionLog || [];
  const openId = currentScene(gameState).id;
  const byScene = new Map();
  for (const entry of log) {
    const id = entry.sceneId ?? 0;
    if (id === openId) continue;
    if (!byScene.has(id)) {
      byScene.set(id, {
        sceneId: id,
        roomId: entry.roomId || null,
        day: entry.day ?? null,
        startedMinutes: entry.minutes ?? null,
        beatCount: 0,
      });
    }
    byScene.get(id).beatCount++;
  }
  return [...byScene.values()]
    .sort((a, b) => b.sceneId - a.sceneId)
    .slice(0, SCENE_READER.historyScenes)
    .map(s => ({
      ...s,
      roomName: s.roomId ? (ROOMS[s.roomId]?.name || s.roomId) : 'Earlier',
      timeLabel: s.startedMinutes != null ? formatTime(s.startedMinutes) : '',
    }));
}

// The player's own clothing line for the scene reader — what you're wearing
// right now, but only when there's something worth saying. Transient and
// naked states always say something ("You're wrapped in a towel."); a plain
// 'dressed' state stays silent UNLESS the current outfit wears something
// notable — a swimsuit (Phase 5 verification) or an outfit the prose
// thresholds call attention to ("You're dressed to impress.", Phase 7). PURE.
function playerSelfLine(player) {
  const c = player?.clothing;
  if (c && c !== 'dressed') {
    const phrase = CLOTHING_STATE_SCENE_TEXT[c];
    if (phrase) return `You're ${phrase}.`;
  }
  const swimwearId = player?.outfit?.swimwear;
  if (swimwearId && CLOTHING_DEFS[swimwearId]) {
    return `You're in your ${CLOTHING_DEFS[swimwearId].label.toLowerCase()}.`;
  }
  // Intimacy & Voyeurism Phase 7 (D11): "wearing the nice top reads
  // differently than the stained tee" — a notable outfit earns its line.
  const flavor = outfitFlavorProse(player?.outfit);
  if (flavor) return `You're ${flavor}.`;
  return null;
}

// --- The scene -----------------------------------------------------------
// PURE. Reads state, writes nothing, calls no model. The renderer is a
// projection of what this returns.
function composeScene(gameState, sceneState) {
  const roomId = gameState.player.location;
  const clock = gameState.meta.clock;
  const scene = currentScene(gameState);

  const heading = {
    sceneId: scene.id,
    roomId,
    roomName: ROOMS[roomId]?.name || roomId,
    dayLabel: formatDate(clock.day),
    timeLabel: formatTime(clock.minutes),
    phase: clock.phase,
  };

  const perceived = sensoryLines(gameState, roomId);

  // Callouts are the prefix of the perceived list, since it arrives sorted by
  // salience — anything above the threshold sorts above anything below it.
  // Already-shouted signals are filtered out (D12); nothing marks them until
  // Phase 4, so today this list is simply everything over the bar.
  const shouted = scene.shouted || [];
  const callouts = perceived
    .filter(s => s.salience >= SCENE_READER.calloutSalience && !shouted.includes(s.signalId))
    .map(s => ({ signalId: s.signalId, phrase: s.phrase, band: s.band, channel: s.channel, salience: s.salience }));

  // A callout must ALSO appear in the passage — it is emphasis, not removal.
  // Widening the slice when callouts outnumber maxSensoryLines is what
  // guarantees that; the sort order does the rest.
  const sensory = perceived.slice(0, Math.max(SCENE_READER.maxSensoryLines, callouts.length));

  // Phase 3 (D4): which doors in this room are whispering right now.
  const doorCues = composeDoorCues(gameState, roomId, scene);

  // Intimacy & Voyeurism Phase 5 (D11): your own state is part of the scene.
  // What you're wearing (or not) belongs in the establishing passage — the
  // scene reader renders it as the first line, before the people.
  const self = playerSelfLine(gameState.player);
  // Intimacy & Voyeurism Phase 18 (D16): the player's own body belongs in
  // the establishing passage next to what they're wearing — a visible bump,
  // or the newborn's presence. Guarded on typeof (scene.js loads first).
  const pregnancySelf = (typeof pregnancySelfLine === 'function') ? pregnancySelfLine(gameState) : null;
  const selfLine = [self, pregnancySelf].filter(Boolean).join(' ');

  const log = gameState.meta.sessionLog || [];
  const beats = log
    .filter(e => (e.sceneId ?? 0) === scene.id)
    .slice(-SCENE_READER.maxBeats);

  return {
    heading,
    self: selfLine,
    presence: presenceLines(gameState, roomId),
    doorCues,
    sensory,
    callouts,
    beats,
    history: sceneHistory(gameState),
  };
}

// ===== /SECTION: SCENE =====
