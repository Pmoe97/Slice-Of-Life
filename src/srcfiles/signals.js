// ===== SECTION: SIGNALS =====
// The perception substrate (src/ref/wip/perception-and-signals-plan.md).
//
// A thing that happens or persists in a room emits a SIGNAL on a sense
// channel. The signal propagates outward along ROOM_ADJACENCY, attenuating per
// hop and attenuating harder through a door, and anyone in range — the player
// or an NPC, through the SAME query — may perceive it, gated by their own
// attention.
//
// This file is pure and synchronous. It reads world state, never writes it,
// and never calls the model (RI2/RI3): standing signals are DERIVED on every
// query rather than stored, so a signal and the object that emits it cannot
// drift apart. Clear the mess and the signal stops being derivable — there is
// no cleanup path because none can be needed.
//
// Nothing consumes this yet. Plan 2 turns perceived signals into scene prose
// and awareness cues; Plan 3 feeds them to NPC decision-making. The debug
// panel's "Perception" section is Phase 1's only surface.

// --- Standing signals: derived from world state, never stored (plan D1) ---
// Walks every ROOM bucket and reads OBJECT_DEFS[defId].emits against the
// instance's live state. Carry buckets (carry_player / carry_<npcId>) are
// skipped on purpose: a signal needs a place to propagate from, and something
// in a pocket has no room of its own.
//
// A payload may carry `when: { otherKey: value, ... }` — every entry must
// match the instance's state for the signal to emit. Phase 2 noted that
// `emits` could not express a conjunction of two state keys and deliberately
// left the guard out until something needed it; the swimming pool is that
// something. It was emitting "the pool is green, and the smell carries" off
// its `clarity` alone while its `water` said `empty` and the facility that
// owns it says, in its own tier-0 description, that it holds no water.
function emitsGuardMet(guard, state) {
  if (!guard) return true;
  return Object.entries(guard).every(([k, v]) => state?.[k] === v);
}

function deriveStandingSignals(gameState) {
  const out = [];
  const buckets = gameState.objects || {};
  for (const [bucketKey, bucket] of Object.entries(buckets)) {
    if (!bucketKey.startsWith('room_')) continue;
    const roomId = bucketKey.slice(5);
    if (!ROOMS[roomId]) continue;
    for (const obj of Object.values(bucket || {})) {
      const emits = OBJECT_DEFS[obj.defId]?.emits;
      if (!emits) continue;
      for (const [stateKey, byValue] of Object.entries(emits)) {
        // Food-overhaul Phase 4 (D9): a 'dishes' emit reads the DERIVED
        // ladder (ITEMS' dishLevelOf) against the object's dish MAP, not
        // the (vestigial) state field — the map is the world state, so the
        // standing signal can't desync from what actually got dirtied.
        const current = stateKey === 'dishes' && obj.dishes ? dishLevelOf(obj) : obj.state?.[stateKey];
        if (current === undefined) continue;
        const payload = byValue[current];
        if (!payload || !SIGNAL_DEFS[payload.signal]) continue;
        if (!emitsGuardMet(payload.when, obj.state)) continue;
        out.push({
          signalId: payload.signal,
          roomId,
          intensity: payload.intensity,
          sourceId: obj.id,
        });
      }
    }
  }
  return out;
}

// --- Transient signals: emitted by an act, stored, and fading (plan D1/D11) ---
// The stored record is deliberately minimal:
//   { id, roomId, intensity, bornTick, sourceId }
// `channel` and `decayPerTick` are NOT stored — they live on the def, and a
// copy on every instance could disagree with it (RI3). `intensity` is the
// strength at birth; what a perceiver gets is computed from age at read time.
//
// `bornTick` is ABSOLUTE (day × ticksPerDay + tick index) rather than a
// per-day index, so decay just works across a midnight rollover instead of
// needing a special case for "born yesterday".
function absoluteTick(clock) {
  if (!clock) return 0;
  return (clock.day || 0) * CLOCK.ticksPerDay + getTickIndex(clock.minutes || 0);
}

// What a transient is worth right now, or 0 once it has faded out.
function transientIntensityNow(rec, nowTick) {
  const def = SIGNAL_DEFS[rec.id];
  if (!def) return 0;
  const decay = def.decayPerTick;
  if (!decay) return rec.intensity; // no decay declared → treat as steady
  const age = Math.max(0, nowTick - (rec.bornTick || 0));
  return Math.max(0, rec.intensity - age * decay);
}

// Emit an act's signal into the world. Trusted producer — callers are
// resolveTick, the drive loop and ACTION_DEFS, never model output. Prunes on
// write, which is where the buffer is allowed to be mutated.
function emitTransient(gameState, { id, roomId, intensity, sourceId }) {
  const def = SIGNAL_DEFS[id];
  if (!def || !roomId || !ROOMS[roomId]) return;
  if (!gameState.world) return;
  const nowTick = absoluteTick(gameState.meta?.clock);
  const list = pruneTransients(gameState, nowTick);
  list.push({
    id,
    roomId,
    intensity: intensity ?? 0.5,
    bornTick: nowTick,
    sourceId: sourceId || null,
  });
  // Ring buffer: oldest out. The cap is a backstop, not the primary control —
  // decay is. It exists so a pathological tick (every NPC moving every tick
  // through a long batched sleep) cannot grow the save without limit.
  while (list.length > SIGNAL_TUNING.transientCap) list.shift();
  gameState.world.signals = list;
}

// Drop faded records. MUTATING — only call from a write path. Returns the
// live list. Pruning here rather than only on a timer is what stops a save
// that sat idle for a week from resurrecting week-old footsteps the moment
// something new is emitted.
function pruneTransients(gameState, nowTick) {
  const list = gameState.world?.signals || [];
  const live = list.filter(r => transientIntensityNow(r, nowTick) >= SIGNAL_TUNING.floor);
  if (gameState.world) gameState.world.signals = live;
  return live;
}

// The READ-side counterpart: same filter, no mutation. perceiveSignals must
// stay pure (RI3) — a query that quietly rewrote the save would make every
// perceive call a state change, and the Phase 1 harness asserts byte-identical
// state across a query. Faded records are skipped here and actually removed
// the next time something is emitted.
function liveTransients(gameState, nowTick) {
  const out = [];
  for (const rec of (gameState.world?.signals || [])) {
    const intensity = transientIntensityNow(rec, nowTick);
    if (intensity < SIGNAL_TUNING.floor) continue;
    out.push({ signalId: rec.id, roomId: rec.roomId, intensity, sourceId: rec.sourceId });
  }
  return out;
}

// --- Threshold attenuation (signals D6; floorplan plan Phase 2) ---
// What sits BETWEEN two rooms, per channel. This replaced a per-ROOM door
// lookup, and the difference matters in both directions:
//
//   - The old version asked "does this room contain a door object", so an
//     authored door with no object behind it (Living Room → Game Room) let
//     everything through as if the rooms were open to each other.
//   - It also multiplied by BOTH rooms' factors on every hop, which happened
//     to give the right answer only because the doored rooms in the old
//     layout were all dead ends.
//
// ROOM_THRESHOLDS is now the authority for what a hop crosses; the door
// OBJECT is consulted only for the lock state, which is the one thing the
// object genuinely knows and the table cannot.
function edgeFactor(gameState, a, b, channel) {
  const t = thresholdBetween(a, b);
  if (!t) return 0;                                    // not connected at all
  if (t === 'open') return SIGNAL_TUNING.openMultiplier[channel] ?? 1;
  if (t === 'glass') return SIGNAL_TUNING.glassMultiplier[channel] ?? 0;
  const byLock = SIGNAL_TUNING.doorMultiplier[channel] || SIGNAL_TUNING.doorMultiplier.sound;
  return byLock[edgeLockState(gameState, a, b)] ?? byLock.unlocked;
}

// A door belongs to ONE of the two rooms it joins — the bedroom, not the
// hallway. So the lock is whichever side actually carries the object; an edge
// the table calls a door with no object on either side is a door that simply
// cannot be locked (an interior doorway), and reads as unlocked.
function edgeLockState(gameState, a, b) {
  for (const roomId of [a, b]) {
    const bucket = gameState.objects?.[`room_${roomId}`];
    if (!bucket) continue;
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (door) return door.state?.lock || 'unlocked';
  }
  return 'unlocked';
}

// Every edge a signal may traverse, keyed by room. Derived from
// ROOM_THRESHOLDS rather than ROOM_ADJACENCY because the two are deliberately
// different relations: `glass` is a threshold that is NOT walkable, and sight
// has to cross it. Movement reads ROOM_ADJACENCY; propagation reads this.
// edgeFactor returns 0 for a channel a threshold blocks, so one traversal
// serves all three channels without branching on the threshold type here.
//
// REBUILT rather than computed once at load, because ROOM_THRESHOLDS is now
// derived from base + structural upgrades (CONFIG's applyStructuralUpgrades)
// and can change mid-game — glazing the pool wall adds a sight edge that has
// to start carrying sight the moment the job completes.
let SIGNAL_EDGES = {};
function rebuildSignalEdges() {
  const out = {};
  for (const key of Object.keys(ROOM_THRESHOLDS)) {
    const [a, b] = key.split('|');
    (out[a] = out[a] || []).push(b);
    (out[b] = out[b] || []).push(a);
  }
  SIGNAL_EDGES = out;
  return out;
}
rebuildSignalEdges();

// --- Propagation (plan D4) ---
// How strongly a signal originating in each room arrives at `targetRoom`, for
// one channel. Walks OUTWARD from the target rather than from each source, so
// one traversal answers for every source at once.
//
// This is a relaxation to a fixed point, not a plain hop-count BFS: door
// factors mean the fewest-hops path is not always the strongest one (a longer
// way round through open space can beat a short hop through a locked bedroom
// door), and a BFS by depth would silently take the weaker path. Eighteen
// rooms converge in a handful of passes.
function reachMultipliers(gameState, targetRoom, channel) {
  const atten = SIGNAL_TUNING.attenuation[channel];
  const best = { [targetRoom]: 1 };
  // Memoised per edge, not per room — the threshold is a property of the
  // crossing. Keyed on the sorted pair so both directions share one entry.
  const cache = {};
  const factorOf = (a, b) => {
    const k = a < b ? a + '|' + b : b + '|' + a;
    return cache[k] !== undefined ? cache[k] : (cache[k] = edgeFactor(gameState, a, b, channel));
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 32) {
    changed = false;
    for (const [room, mult] of Object.entries(best)) {
      for (const neighbour of (SIGNAL_EDGES[room] || [])) {
        // ONE threshold per hop. A bedroom-to-hallway step crosses a single
        // door, and the old both-rooms multiplication only looked right
        // because the doored rooms all happened to be dead ends.
        const next = mult * atten * factorOf(room, neighbour);
        if (next < SIGNAL_TUNING.floor) continue;
        if (next > (best[neighbour] || 0)) {
          best[neighbour] = next;
          changed = true;
        }
      }
    }
  }
  return best;
}

// --- Attention (plan D8) ---
// Attention GATES perception; it does not scale how intense a thing seems.
// A keen observer notices faint things a dull one misses, but both describe a
// strong smell as strong — so the reported intensity is always the world's
// truth, and attention only decides whether the record exists at all.
function perceptionOf(gameState, perceiverId) {
  if (perceiverId === 'player') return getPlayerPerception(gameState.player);
  const npc = gameState.npcs?.[perceiverId];
  return npc ? getNpcPerception(npc) : 0;
}

function bandFor(intensity) {
  if (intensity >= SIGNAL_TUNING.bands.clear) return 'strong';
  if (intensity >= SIGNAL_TUNING.bands.faint) return 'clear';
  return 'faint';
}

// --- Headphones (Intimacy & Voyeurism Phase 19) --------------------------
// A perceiver wearing a blocksSound accessory (the wardrobe's accessory
// slot) hears NOTHING on the audio channel: music, moaning, door cues,
// gossip — all filtered at the RECEIVER, so the signals still exist for the
// world (a non-wearing roommate still perceives them) and only the wearer's
// own read goes quiet. Player and NPCs share the one filter (D7 interplay:
// you can't hear the moaning you're not listening for). PURE.
function wearsSoundBlocking(gameState, perceiverId) {
  const outfit = perceiverId === 'player'
    ? (gameState?.player?.outfit || {})
    : (gameState?.npcs?.[perceiverId]?.outfit || {});
  const worn = outfit && outfit.accessory;
  return !!worn && !!SOUND_DEVICE_DEFS[worn]?.blocksSound;
}

// --- The one perception query, shared by the player and every NPC (plan D7) ---
// Returns the signals `perceiverId` can sense standing in `roomId`, strongest
// first. `perceiverId` is 'player' or an npcId — any divergence between them
// lives in the attention term above, never in a second code path. The moment
// there are two of these, NPCs start sensing a subtly different world than the
// player and the two can be fixed apart (see the peep/snoop precedent).
function perceiveSignals(gameState, perceiverId, roomId) {
  if (!roomId || !ROOMS[roomId]) return [];
  const attention = perceptionOf(gameState, perceiverId);
  if (attention <= 0) return [];
  // Intimacy & Voyeurism Phase 19: a wearer of sound-blocking (headphones /
  // mp3 player) perceives no audio-channel signal at all — the door-cue,
  // listen and scene-reader surfaces all read through this one query, so
  // one filter covers every one of them.
  const blocking = wearsSoundBlocking(gameState, perceiverId);

  // Both kinds, one list. From here down nothing cares which is which — a
  // standing rot and a fading footstep propagate and attenuate identically,
  // which is the point of having one model rather than two.
  const sources = deriveStandingSignals(gameState)
    .concat(liveTransients(gameState, absoluteTick(gameState.meta?.clock)));
  if (sources.length === 0) return [];

  // One reach map per channel that actually has a source, not per signal.
  const reachByChannel = {};
  const records = [];
  for (const src of sources) {
    const def = SIGNAL_DEFS[src.signalId];
    if (!def) continue;
    // Phase 19: the headphones filter — the wearer hears none of the audio
    // channel, whatever is playing and wherever it originates.
    if (def.channel === 'sound' && blocking) continue;
    const reach = reachByChannel[def.channel]
      || (reachByChannel[def.channel] = reachMultipliers(gameState, roomId, def.channel));
    const mult = reach[src.roomId];
    if (!mult) continue;

    const arrived = src.intensity * mult;
    if (arrived < SIGNAL_TUNING.floor) continue;
    if (arrived * attention < SIGNAL_TUNING.noticeFloor[def.channel]) continue;

    records.push({
      signalId: src.signalId,
      channel: def.channel,
      intensity: arrived,
      band: bandFor(arrived),
      sourceRoomId: src.roomId,
      sourceId: src.sourceId,
      here: src.roomId === roomId,
      salience: def.salience * arrived,
    });
  }

  // Strongest claim on attention first — this ordering is what Plan 2 reads to
  // decide what gets woven into prose and what gets surfaced as a cue.
  records.sort((a, b) => b.salience - a.salience);
  return records;
}

// Collapse a perceived-signal list to one record per signal id, keeping the
// strongest. Two rotting containers in one room are one smell, not two.
function mergePerceived(records) {
  const bySignal = new Map();
  for (const r of records) {
    const prev = bySignal.get(r.signalId);
    if (!prev || r.intensity > prev.intensity) bySignal.set(r.signalId, r);
  }
  return [...bySignal.values()].sort((a, b) => b.salience - a.salience);
}

// ===== SECTION: PLAUSIBLE ACTIVITY (fog-of-war floor plan, Phase 2) =====
// What the player could realistically know about an NPC they are NOT in the
// room with, for the floor plan's activity captions (D10 — the plan is never
// omniscient). PURE (RI2/RI3): reads state, writes nothing, calls no model.
//
// The rule:
//   same room          → the full activity string — you can see them
//   other room, locked → 'inside' — never the granular act
//   other room         → a coarser label: what the player can actually
//                        perceive from where they stand (signal-strength
//                        gated), or a routine-guess for someone they know
//                        well (familiarity gated)
//   otherwise          → null — the avatar alone says they are there
//
// Returns { label, tier: 'full' | 'coarse' | 'inside' } or null.
const PLAUSIBLE_TUNING = {
  // Signal → caption. Only signals that NAME an activity are here; a room
  // condition (rot, clutter, an unmade bed) tells you nothing about the
  // person in the room and is deliberately absent. A signal that reached
  // perceiveSignals has already cleared the attention × propagation floor,
  // so its presence IS the strength gate.
  bySignal: {
    running_water:   'showering',
    cooking:         'cooking',
    voices:          'with someone',
    footsteps:       'moving around',
    machine_running: 'running the washer',
    humming:         'humming to themselves',
    sighing:         'having a moment',
    breakage:        'in there',
    cabinet_slam:    'in there',
    door_close:      'in there',
  },
  // Granular activity → coarse caption for the familiarity path. Routines
  // the player knows an NPC well enough to guess at; everything else stays
  // unknown behind a closed door.
  byActivity: {
    'showering': 'showering',
    'sleeping': 'sleeping', 'napping': 'sleeping',
    'cooking': 'cooking', 'making coffee': 'making coffee',
    'eating cereal': 'eating', 'snacking': 'snacking',
    'watching TV': 'watching TV', 'watching a show': 'watching TV',
    'playing games': 'gaming', 'gaming': 'gaming',
    'exercising': 'working out', 'working out': 'working out',
    'doing yoga': 'doing yoga', 'stretching': 'stretching',
    'doing laundry': 'doing laundry',
    'listening to music': 'listening to music',
    'on a phone call': 'on the phone', 'on a video call': 'on a call',
    'reading in bed': 'reading in bed',
    'getting ready': 'getting ready',
    'skincare routine': 'doing a skincare routine',
    'cleaning': 'cleaning',
  },
  // Crossing either relationship bar means the player knows the NPC's
  // routines well enough to make the coarse guess above.
  familiarity: { comfort: 0.25, affection: 0.2 },
  familiarPhases: ['familiar', 'close', 'intimate'],
};

function plausibleActivityFor(npc) {
  const rel = npc?.relPlayer || {};
  if (rel.comfort >= PLAUSIBLE_TUNING.familiarity.comfort) return true;
  if (rel.affection >= PLAUSIBLE_TUNING.familiarity.affection) return true;
  return PLAUSIBLE_TUNING.familiarPhases.includes(rel.conversationPhase);
}

function derivePlausibleActivity(gameState, npcId, playerRoomId) {
  const npc = gameState?.npcs?.[npcId];
  const roomId = npc?.location;
  if (!npc || !roomId || !ROOMS[roomId]) return null;    // off-map / dormant

  if (roomId === playerRoomId) {
    return { label: npc.activity || 'here', tier: 'full' };
  }
  if (getDoorState(gameState, roomId) === 'locked') {
    return { label: 'inside', tier: 'inside' };
  }

  const perceived = perceiveSignals(gameState, 'player', playerRoomId)
    .filter(r => r.sourceRoomId === roomId);
  for (const rec of perceived) {
    const label = PLAUSIBLE_TUNING.bySignal[rec.signalId];
    if (label) return { label, tier: 'coarse' };
  }
  if (plausibleActivityFor(npc)) {
    const label = PLAUSIBLE_TUNING.byActivity[npc.activity || ''];
    if (label) return { label, tier: 'coarse' };
  }
  return null;
}


// ===== SECTION: DOOR CUES (intimacy-voyeurism Phase 3, D4) =====
// A door the player is standing next to can whisper: light through the
// keyhole, a door left ajar, sounds carrying through it. All three are
// derived from real state — the door object's own state, who is in the far
// room, and the SAME perceiveSignals query every other surface reads — and
// nothing here is stored (RI3). PURE, like everything else in this file.
//
// Only rooms that actually carry a door OBJECT can whisper: an archway has
// no keyhole to light up, and the interior doorways that exist only in
// ROOM_THRESHOLDS (game room, gym, changing room, study, balcony,
// kitchen-laundry) are not cues. That is the honest surface — the intimate
// rooms are the ones with doors, which is exactly where a peek system wants
// its cues.

const DOOR_CUE_TUNING = {
  // During these clock phases a room reads as lit whenever someone is in it
  // — daylight floods it. At night the light has to be earned: being awake
  // at all implies a lit room (nobody stands around in the dark), so "the
  // activity implies light" from the plan is implemented as "awake implies
  // light". The one honest exception is the asleep states — a sleeping
  // roommate's door stays dark, which is exactly the cue the boundary acts
  // care about. Nothing models lamps, so there is no finer surface to read.
  daylitPhases: ['early_morning', 'morning', 'midday', 'afternoon', 'evening'],
  darkActivities: ['sleeping', 'napping'],
  // How many strongest sound signals one door reports as audible.
  maxAudibleSignals: 2,
  // What counts as "a sound behind the door". Smell travels under doors too,
  // but the SENSORY layer already carries smells; the door cue is about what
  // you HEAR at a threshold.
  audibleChannels: ['sound'],
  // Cap on cue LINES per scene — a hallway wallpapered in "light through the
  // keyhole" reads as a bug, not as an apartment.
  maxCueLines: 3,
};

// Is a room's light plausibly visible through its door right now? Shared by
// deriveDoorCues (the far-room side) and the floor-plan glow (house-wide —
// a lit occupied room is positional knowledge, not omniscience, exactly like
// the avatar itself). Pure.
function roomLightVisible(gameState, roomId) {
  const occupants = getPresentNpcIds(gameState.npcs || {}, roomId);
  if (occupants.length === 0) return false;
  const clock = gameState?.meta?.clock;
  if (clock && DOOR_CUE_TUNING.daylitPhases.includes(clock.phase)) return true;
  return occupants.some(id => !DOOR_CUE_TUNING.darkActivities.includes(gameState.npcs[id]?.activity));
}

// The two rooms a door OBJECT joins, or null if its bucket room sits on no
// door threshold (a door to nowhere). Every room that holds a door object is
// a leaf room with exactly one door threshold in every layout, so the pair
// is unambiguous.
function doorPairRooms(gameState, doorObj) {
  const ownRoom = doorObj?.bucket?.startsWith('room_') ? doorObj.bucket.slice(5) : null;
  if (!ownRoom || !ROOMS[ownRoom]) return null;
  for (const [key, type] of Object.entries(ROOM_THRESHOLDS)) {
    if (type !== 'door') continue;
    const [a, b] = key.split('|');
    if (a === ownRoom || b === ownRoom) return [a, b];
  }
  return null;
}

// The door object between two rooms, if one exists — the same lookup
// edgeLockState performs, kept here because a cue needs the OBJECT, not just
// the lock. Rooms without a door object (interior doorways) return null.
function doorObjectBetween(gameState, a, b) {
  for (const roomId of [a, b]) {
    const bucket = gameState.objects?.[`room_${roomId}`];
    if (!bucket) continue;
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (door) return door;
  }
  return null;
}

// The pure door-cue derivation (Phase 3, D4). Given the door object the
// player is standing at and the player's room, returns what that door could
// plausibly tell them:
//   { doorId, doorName, roomId, roomName, occupantIds,
//     lightThroughKeyhole, ajar, audible }
// or null when the object is not a door the player is actually at. `audible`
// is the strongest sound signals originating in the far room as perceived
// from the player's side — the door's attenuation is already inside the
// reach multipliers, so this is exactly what they would hear through it.
function deriveDoorCues(gameState, doorObj, playerRoomId) {
  if (!doorObj || !playerRoomId || !ROOMS[playerRoomId]) return null;
  const pair = doorPairRooms(gameState, doorObj);
  if (!pair || !pair.includes(playerRoomId)) return null;
  const roomId = pair[0] === playerRoomId ? pair[1] : pair[0];
  const occupantIds = getPresentNpcIds(gameState.npcs || {}, roomId);
  return {
    doorId: doorObj.id,
    doorName: roomPhrase(roomId) + ' door',
    roomId,
    roomName: ROOMS[roomId]?.name || roomId,
    occupantIds,
    lightThroughKeyhole: occupantIds.length > 0 && roomLightVisible(gameState, roomId),
    ajar: doorObj.state?.ajar === 'ajar',
    audible: perceiveSignals(gameState, 'player', playerRoomId)
      .filter(r => r.sourceRoomId === roomId && DOOR_CUE_TUNING.audibleChannels.includes(r.channel))
      .slice(0, DOOR_CUE_TUNING.maxAudibleSignals)
      .map(r => r.signalId),
  };
}


// --- Signals by their SOURCE room (scene-reader plan Phase 3, D9) ---
// For the floor plan, which shows where a signal is coming FROM rather than
// what the player perceives. That distinction is the whole value of the
// surface: a moodle strip already answers "what am I aware of", and a floor
// plan that repeated it would be a second moodle strip in a worse shape.
//
// Standing and transient signals both, merged to the strongest per signal per
// room, strongest first. Pure — derived on every call like everything else
// here, and it never touches state.
function signalsByRoom(gameState) {
  const nowTick = absoluteTick(gameState.meta?.clock);
  const all = deriveStandingSignals(gameState)
    .concat(liveTransients(gameState, nowTick));

  const byRoom = {};
  for (const src of all) {
    const def = SIGNAL_DEFS[src.signalId];
    if (!def || !src.roomId) continue;
    const list = byRoom[src.roomId] || (byRoom[src.roomId] = []);
    const existing = list.find(r => r.signalId === src.signalId);
    if (existing) {
      if (src.intensity > existing.intensity) {
        existing.intensity = src.intensity;
        existing.band = bandFor(src.intensity);
      }
      continue;
    }
    list.push({
      signalId: src.signalId,
      channel: def.channel,
      intensity: src.intensity,
      band: bandFor(src.intensity),
      salience: def.salience * src.intensity,
    });
  }
  for (const list of Object.values(byRoom)) list.sort((a, b) => b.salience - a.salience);
  return byRoom;
}

// The glyph for a signal — its own if it has one, otherwise its channel's.
function signalIcon(signalId) {
  const def = SIGNAL_DEFS[signalId];
  return SIGNAL_ICONS.bySignal[signalId]
    || SIGNAL_ICONS.byChannel[def?.channel]
    || '•';
}

// --- Prose (plan R1/D13) ---
// Authored phrases, composed deterministically. Seeded per
// (signalId, band, roomId, day) so a standing condition reads the SAME way all
// day and differently tomorrow: rewording on every render would read as noise,
// never rewording at all would read as a bug.
function signalPhrase(record, gameState) {
  const def = SIGNAL_DEFS[record.signalId];
  const pool = def?.phrases?.[record.band];
  if (!pool || pool.length === 0) return '';
  const day = gameState?.meta?.clock?.day ?? 0;
  const seed = hashStr(`${record.signalId}|${record.band}|${record.sourceRoomId}|${day}`)
             + (gameState?.meta?.seed || 0);
  const rng = mulberry32(seed);
  return pool[Math.floor(rng() * pool.length)];
}

// ===== /SECTION: SIGNALS =====
