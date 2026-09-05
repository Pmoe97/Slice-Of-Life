// ===== SECTION: MEANWHILE =====
// The ambient "meanwhile" scene-text ticker (continuous-cadence-closure-plan.md
// Phase 8, D9). Returning to a room — or simply idling in one — after real
// time has passed surfaces one short, deterministic line about anything
// perceptible that happened while the player wasn't watching. Reads
// `gameState.world.events`, the same stream chatter.js/dreams.js/tracker.js
// already consume; never fabricates a line and never calls the model
// (Design Invariant 5 — a deterministic surface over data that already
// exists, nothing more).
//
// Split the way scene.js's door cues and callouts already are: compose stays
// PURE (composeMeanwhileTicker, called from composeScene) and the one write —
// marking the surfaced event `seenByPlayer` so it never repeats — happens
// separately at render time (markMeanwhileShown), mirroring
// markCalloutsShouted/markDoorCuesShown exactly.
//
// NEARBY ROOMS ONLY, deliberately never the player's own current room — this
// was found live, not guessed: ui.js's surfaceRoomEvidence ALREADY owns
// same-room evidence, called explicitly (at the right narrative position)
// from doMove/doLookAround. render()/addLogEntry both call renderSceneReader
// on every intermediate narration line, and doMove/doLookAround narrate
// several OTHER lines (walk/look text, follow releases, touring beats...)
// before their own explicit surfaceRoomEvidence call — so if this ticker were
// allowed to also consider the current room, an EARLIER intermediate render
// within that same action would let it "steal" (mark seenByPlayer, with only
// a same-frame-invisible DOM flash — never a durable sessionLog line, since
// the ticker's line is recomputed fresh each render like sensory/doorCues,
// never appended to the log) an event surfaceRoomEvidence was about to claim
// and narrate durably moments later in the very same function call. Scoping
// this ticker to NEARBY rooms only removes the race entirely; the "or simply
// idling [in your own room]" half of the Goal is covered separately by a
// direct surfaceRoomEvidence call from the idle checkpoint path (ui.js's
// advanceAndResolve, gated on advanceClock===false) — reusing the existing,
// already race-free mechanism (Design Invariant 4) rather than duplicating it
// here.

const MEANWHILE_TUNING = {
  // Which signal channels count toward "could plausibly have perceived
  // something about" a nearby room (D9: "same signal-layer reasoning
  // perceiveSignals already uses" — reachMultipliers, signals.js, IS that
  // reasoning, reused here rather than reimplemented, the same discipline
  // Design Invariant 4 already applies to scene presence one level up). A
  // discrete recorded event has no single channel of its own the way a live
  // SIGNAL_DEFS source does, so the union of all three — reachable on ANY
  // sense — decides whether a room counts, not one arbitrarily-chosen
  // channel.
  channels: ['smell', 'sound', 'sight'],
};

// Every room reachable from roomId on any signal channel, plus roomId itself
// (reachMultipliers always seeds the target room at multiplier 1 — harmless
// to include here even though composeMeanwhileTicker below explicitly skips
// roomId itself before ever consulting this set). PURE.
function meanwhilePerceivableRooms(gameState, roomId) {
  const out = new Set([roomId]);
  for (const channel of MEANWHILE_TUNING.channels) {
    for (const r of Object.keys(reachMultipliers(gameState, roomId, channel))) out.add(r);
  }
  return out;
}

// The single most recent not-yet-seen, importance-qualifying world event NEAR
// (never IN) roomId, formatted as one ambient line — or null when nothing
// qualifies. PURE: reads gameState, writes nothing (markMeanwhileShown below
// is the one write, called separately at render time).
//
// "Importance-qualifying" reuses EVENT_IMPORTANCE exactly the way
// chatterBestCandidateForDay (chatter.js) already does — "ambient/
// unclassified events are never post-worthy". Same table, same floor, same
// reasoning: a background event with no band (laundry, a nap, a burnt
// dinner) is never ticker-worthy either, which is D9's own "someone did
// laundry" example verbatim.
function composeMeanwhileTicker(gameState, roomId) {
  const events = Array.isArray(gameState.world?.events) ? gameState.world.events : [];
  if (events.length === 0) return null;
  const reach = meanwhilePerceivableRooms(gameState, roomId);
  let best = null;
  for (const evt of events) {
    if (!evt || evt.seenByPlayer) continue;
    if (!evt.roomId || evt.roomId === roomId) continue; // no room at all, or the player's own room — surfaceRoomEvidence's job, never this ticker's
    if (!reach.has(evt.roomId)) continue;
    if (!EVENT_IMPORTANCE[evt.type]) continue;
    if (!best || evt.day > best.day || (evt.day === best.day && evt.tick > best.tick)) best = evt;
  }
  if (!best) return null;
  const roomName = ROOMS[best.roomId]?.name || best.roomId;
  return {
    roomId: best.roomId,
    line: `Meanwhile, in the ${roomName}: ${formatEventText(best, gameState.npcs)}`,
    evt: best,
  };
}

// The one write: marks the ticker's surfaced event seen so it never repeats
// on a later render — same split as markCalloutsShouted/markDoorCuesShown
// (scene.js), same underlying flag ui.js's surfaceRoomEvidence already uses
// for same-room evidence (evt.seenByPlayer). `meanwhile.evt` is a live
// reference into gameState.world.events (composeScene's own `beats` field
// already hands out live sessionLog references the same way), so this is a
// direct mutation, not a re-lookup by matching fields.
function markMeanwhileShown(gameState, meanwhile) {
  if (meanwhile?.evt) meanwhile.evt.seenByPlayer = true;
}
// ===== /SECTION: MEANWHILE =====
