// ===== SECTION: DIRT =====
// Actions & Activities Overhaul Phase 9 (D17/D49): ambient per-room dirt.
//
// The CLEANLINESS/dirtyWhen system (config.js/world.js) already tracks mess
// tied to a SPECIFIC object's state — a greasy stove burner, a full hamper,
// a cluttered dresser — and derives room cleanliness and a family of smell/
// sight signals from it. That system is mature and untouched here. What it
// cannot express is mess that has no object to be dirty ON: dust settling
// and foot traffic through a room. Every room accumulates that, including
// ones that own no dirtyable furniture at all — hallway_a/hallway_b have a
// coat rack and (one of them) a thermostat, neither cleanlinessWeight-bearing
// — which is exactly why the user's "Clean Hallway" ask needed a real, new
// per-room field rather than another dirtyWhen entry on existing furniture.
//
// world.rooms[roomId].dirt is that field: 0..1, stored (not derived — unlike
// the object system, there is no world state it could be re-derived FROM),
// bumped by cooking/eating/foot-traffic/dust and drained by self.clean or an
// NPC's cleansRoom chore. It feeds refreshRoomCleanliness (world.js) as an
// additional penalty on the object-derived score, and deriveStandingSignals
// (signals.js) reads it directly to emit the 'dust' smell signal — the one
// standing signal with no OBJECT_DEFS.emits entry behind it.

function roomDirtOf(gameState, roomId) {
  return gameState?.world?.rooms?.[roomId]?.dirt ?? 0;
}

// The single write path for room.dirt — every source (cooking, eating, foot
// traffic/dust, self.clean, an NPC's cleansRoom chore) goes through this, so
// refreshRoomCleanliness can never go stale against it (the same "forgot the
// hook" bug shape the cleanliness comments elsewhere warn about repeatedly).
function bumpRoomDirt(gameState, roomId, amount) {
  const room = gameState?.world?.rooms?.[roomId];
  if (!room) return;
  room.dirt = clamp((room.dirt || 0) + amount, 0, 1);
  refreshRoomCleanliness(gameState, roomId);
}

// Pure: the standing 'dust' signal's intensity at a given dirt level, read by
// signals.js's deriveStandingSignals. Below DIRT_TUNING.dustSignalFloor the
// room simply emits nothing — a lightly-used room shouldn't smell of anything.
function dustSignalIntensity(dirt) {
  return clamp(dirt, 0, 1) * DIRT_TUNING.dustSignalScale;
}
// ===== /SECTION: DIRT =====
