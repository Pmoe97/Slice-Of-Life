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

  const sources = deriveStandingSignals(gameState);
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
