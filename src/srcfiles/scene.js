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

// --- Composition -------------------------------------------------------

// "Hana is at the counter" — one line per character physically present.
// PRESENCE_PHRASES overrides the default frame for the activity strings that
// read badly in it (D5).
function presenceLines(gameState, roomId) {
  return getPresentNpcIds(gameState.npcs, roomId).map(npcId => {
    const npc = gameState.npcs[npcId];
    const name = npc.bible?.name || 'Someone';
    const activity = npc.activity || '';
    const template = PRESENCE_PHRASES[activity];
    const line = template
      ? template.replace('{name}', name)
      : (activity ? `${name} is ${activity}.` : `${name} is here.`);
    return { npcId, name, activity, line };
  });
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

  const log = gameState.meta.sessionLog || [];
  const beats = log
    .filter(e => (e.sceneId ?? 0) === scene.id)
    .slice(-SCENE_READER.maxBeats);

  return {
    heading,
    presence: presenceLines(gameState, roomId),
    sensory,
    callouts,
    beats,
    history: sceneHistory(gameState),
  };
}

// ===== /SECTION: SCENE =====
