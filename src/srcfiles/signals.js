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
        const current = obj.state?.[stateKey];
        if (current === undefined) continue;
        const payload = byValue[current];
        if (!payload || !SIGNAL_DEFS[payload.signal]) continue;
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

// --- Door attenuation (plan D6) ---
// 1 when the room has no door object at all — NOT the `unlocked` multiplier.
// WORLD's getDoorState returns 'unlocked' for a doorless room too, which would
// have muffled every hallway-to-kitchen hop as if a door were standing there.
function roomDoorFactor(gameState, roomId, channel) {
  const bucket = gameState.objects?.[`room_${roomId}`];
  if (!bucket) return 1;
  const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
  if (!door) return 1;
  const lock = door.state?.lock || 'unlocked';
  const byLock = SIGNAL_TUNING.doorMultiplier[channel] || SIGNAL_TUNING.doorMultiplier.sound;
  return byLock[lock] ?? byLock.unlocked;
}

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
  const doorFactor = {};
  const factorOf = (r) => (doorFactor[r] !== undefined ? doorFactor[r] : (doorFactor[r] = roomDoorFactor(gameState, r, channel)));

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 32) {
    changed = false;
    for (const [room, mult] of Object.entries(best)) {
      for (const neighbour of (ROOM_ADJACENCY[room] || [])) {
        // A hop passes through BOTH rooms' doors, if they have them.
        const next = mult * atten * factorOf(room) * factorOf(neighbour);
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
