// ===== SECTION: MOVEMENT =====
// The physical layer of the continuous behavior engine
// (src/src/ref/wip/continuous-behavior-engine-plan.md, Phase 4 — C4).
//
// The commitment model made decisions absolute-minute and anchored; this is
// the position half of that promise. When an NPC commits to an anchored
// activity, the commitment does NOT begin the instant it opens: the NPC
// plans a real walk to the anchor's stand-point (`npc.walk`), integrates it
// every animation frame in GAME time (D9), and only then flips the
// commitment's `arrived` flag — so "stand at the stove while cooking" is a
// physical fact, not a label. `npc.location` stops being assigned by
// schedule logic and becomes a stored projection of position (D8), written
// by this module the instant a walk crosses into a new room's rect.
//
// Two velocity regimes (D9):
//   LIVE  — clockFrame advances the clock every rAF; this module advances
//           every in-flight walk by the same game-minutes it just computed
//           (gameSeconds = gameMinutes * 60 — the clockFrame formula at
//           time.js is the only time↔distance conversion in the game, never
//           reinvented; since D15 the walk advances by its OWN speed, not a
//           constant). Frames exist, so position interpolates along the path.
//   BATCH — sleep, `wait`, tab-hidden catch-up: no frames exist to animate
//           through. settleWalks() snaps any walk whose scheduled
//           completion (walk.completesAtAbs) has passed, deterministically,
//           the way the frame path would have landed it, and (D22) advances
//           an INCOMPLETE walk proportionally to the clock — so a discrete
//           advance no longer freezes an in-flight NPC mid-stride for the
//           whole span. This is what keeps resolveBatch reproducible from
//           seed: decisions happen at sim checkpoints, and a walk is always
//           landed (or advanced exactly where the clock says) by the time a
//           decision reads it — the longest walk in the flat is now 70
//           game-seconds (D15), still far coarser than any checkpoint.
//
// DETERMINISM (C6): planWalk/settleWalks/deriveLocationFromPosition are
// pure reads of ROOM_LAYOUT/ROOM_THRESHOLDS/WALK plus clockToAbsolute —
// no rng, no clock-side effects, no model. The frame integrator mutates
// presentation state (pos/walk/location/arrived) in place, exactly like
// the position system D8 says owns location; decisions never observe a
// half-integrated walk because checkpoints are far coarser than any walk.
//
// `npc.commitment.arrived` gains its two writers here (advanceFrameWalks,
// settleWalks) beside cognition.js's openCommitment/releaseCommitment/
// ageCommitment — this module is the physical layer's arrival writer, the
// same division of labour D8 gives the position system for `location`.

// All rooms whose rect union contains the point. Half-open on the far edge
// ([x, x+w)) so a point exactly on a shared wall belongs to exactly one
// room deterministically rather than both.
function roomsContainingPoint(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
  const out = [];
  for (const roomId of Object.keys(ROOM_LAYOUT)) {
    for (const [x, y, w, h] of ROOM_LAYOUT[roomId]) {
      if (p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) { out.push(roomId); break; }
    }
  }
  return out;
}

// Which room a position is in, WITH DOORWAY HYSTERESIS (D11). A point in a
// doorway gap (or off the plan entirely) belongs to no room; the last-
// confirmed location keeps reporting until the position is fully inside a
// different room's rect union. An overlap between two rooms' rects is the
// seam ambiguity — hold the last-confirmed room when it is among them.
function deriveLocationFromPosition(npc, pos) {
  const containing = roomsContainingPoint(pos);
  if (containing.length === 0) return npc?.location || null;
  if (containing.length === 1) return containing[0];
  if (npc?.location && containing.includes(npc.location)) return npc.location;
  return containing[0];
}

// The point along a polyline `coveredUnits` deep. Linearly interpolated
// within whichever segment it lands in; past the end, the final waypoint.
function pointAlongPath(path, coveredUnits) {
  let remaining = coveredUnits;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segLen) {
      const t = segLen > 0 ? remaining / segLen : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segLen;
  }
  return { x: path[path.length - 1].x, y: path[path.length - 1].y };
}

function totalPathUnits(path) {
  let units = 0;
  for (let i = 0; i < path.length - 1; i++) {
    units += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  }
  return units;
}

// --- Walk planning (plan floorplan-and-movement-plan.md Phase 3's own
// resolution, generalised from room-route to point-path) ---
// Waypoints: start point → the midpoint of each doorway the room route
// (findPath) crosses → the anchor's stand-point. Same sharedWallSegment the
// renderer cuts its door gaps from, so the door the marker walks through is
// the door the picture draws. A walk entirely inside one room is a straight
// line to the stand-point.
//
// Pure. Returns the walk record (Data model: { path, speed, coveredUnits },
// plus totalUnits, startedAtAbs and completesAtAbs for the deterministic
// batch settle — startedAtAbs is D22's proportional-advance anchor), or
// null when there is nothing to walk: no stand-point, no start room (off-
// map), or the stand-point is already where the NPC is standing.
function planWalk(gameState, npc, startRoom, anchor) {
  if (!anchor || !anchor.point || !anchor.roomId || !ROOMS[anchor.roomId]) return null;
  if (!startRoom || !ROOMS[startRoom]) return null;
  const endPoint = anchor.point;
  // Start where the NPC is actually standing this tick. npc.pos is trusted
  // only when it really is in the start room; otherwise the room's centroid
  // is the deterministic fallback (a fresh NPC, or one whose pos the last
  // tick's teleport left stale).
  let startPoint;
  if (npc.pos && roomsContainingPoint(npc.pos).includes(startRoom)) {
    startPoint = { x: npc.pos.x, y: npc.pos.y };
  } else {
    const [cx, cy] = roomCentre(startRoom);
    startPoint = { x: cx, y: cy };
  }
  const dist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
  if (dist < (WALK.arriveEpsilon ?? 2)) return null;

  const route = (typeof findPath === 'function' ? findPath(startRoom, anchor.roomId) : null) || [];
  const path = [startPoint];
  for (let i = 0; i < route.length - 1; i++) {
    const seg = sharedWallSegment(route[i], route[i + 1]);
    if (seg) path.push({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 });
  }
  path.push(endPoint);

  const totalUnits = totalPathUnits(path);
  // D15 (npc-avatar-liveliness Phase 0): per-room time (NPC tier) plus the
  // in-room legs, distance-derived. The in-room term is NOT optional: a
  // same-room route has zero transitions, and without the distance term
  // every in-room walk would collapse to minSeconds — and
  // resolveActionAnchor deliberately PREFERS the actor's own room, making
  // that the most common walk in the game (the D15 audit correction). The
  // whole path IS the in-room leg when the route never leaves the room.
  const transitions = Math.max(0, route.length - 1);
  const inRoomUnits = path.length >= 3
    ? Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y)
      + Math.hypot(path[path.length - 1].x - path[path.length - 2].x,
                   path[path.length - 1].y - path[path.length - 2].y)
    : totalUnits;
  const seconds = Math.max(
    WALK.minSeconds,
    WALK.secondsPerRoom.npc * transitions + inRoomUnits / WALK.unitsPerSecond
  );
  const startedAtAbs = clockToAbsolute(gameState.meta.clock);
  return {
    path,
    totalUnits,
    coveredUnits: 0,
    // Per-walk speed: totalUnits / seconds, so the integrator lands
    // coveredUnits on totalUnits exactly at completesAtAbs (D15).
    speed: totalUnits / seconds,
    // D22: startedAtAbs lets settleWalks advance an INCOMPLETE walk
    // proportionally instead of leaving it frozen for the length of a batch.
    // Additive on a persisted record; a walk missing it (pre-Phase-0 save)
    // falls back to snap-only behaviour.
    startedAtAbs,
    completesAtAbs: startedAtAbs + seconds / 60,
  };
}

// --- The live per-frame integrator (D9 live regime) ---
// Hooked alongside clockFrame (time.js), which passes exactly the gameMinutes
// it just computed for the clock — this is the one place real time becomes
// walk distance, and it uses clockFrame's formula, not a copy of it.
// Mutates npc.pos/npc.walk/npc.location/npc.commitment.arrived in place
// (presentation state; decisions happen at checkpoints, always after a walk
// has landed — see the header).
function advanceFrameWalks(gameState, gameMinutes) {
  if (!gameState || !(gameMinutes > 0)) return;
  const gameSeconds = gameMinutes * 60;
  for (const npc of Object.values(gameState.npcs || {})) {
    const w = npc && npc.walk;
    if (!w || !npc.pos) continue;
    // Advance by the walk's OWN speed (totalUnits / seconds, D15), not the
    // constant — so coveredUnits lands on totalUnits exactly at
    // completesAtAbs. A walk record always carries speed (today's model and
    // the pre-Phase-0 model both did), so the fallback never fires.
    w.coveredUnits += (w.speed ?? WALK.unitsPerSecond) * gameSeconds;
    if (w.coveredUnits >= w.totalUnits) {
      const end = w.path[w.path.length - 1];
      npc.pos = { x: end.x, y: end.y };
      npc.walk = null;
      if (npc.commitment) npc.commitment.arrived = true;
      // Phase 5 (D5): landing a WORK walk is leaving — the walk ends at the
      // front door and the NPC steps out of the flat, off-map until the
      // shift's single completion time. Every other walk ends standing at
      // the anchor (D8's position-system projection).
      if (npc.commitment && npc.commitment.kind === 'work') {
        npc.pos = null;
        npc.location = null;
      } else {
        npc.location = deriveLocationFromPosition(npc, npc.pos) || npc.commitment?.anchor?.roomId || npc.location;
      }
    } else {
      npc.pos = pointAlongPath(w.path, w.coveredUnits);
      npc.location = deriveLocationFromPosition(npc, npc.pos) || npc.location;
    }
  }
}

// --- The deterministic batch settle (D9 batch regime) ---
// Called at the top of every resolveTick: any walk whose scheduled
// completion has passed is snapped to its final waypoint exactly as the
// frame path would have landed it, so resolveBatch (sleep, `wait`, catch-up)
// reproduces the live run without frames. In the live regime this is a pure
// safety net — checkpoints are 30 game-minutes apart and no walk is that
// long — but it is the ONLY completion path the batch regime has, and it
// must stay deterministic.
function settleWalks(gameState) {
  if (!gameState?.meta?.clock) return;
  const nowAbs = clockToAbsolute(gameState.meta.clock);
  for (const npc of Object.values(gameState.npcs || {})) {
    if (!npc || !npc.walk) continue;
    const w = npc.walk;
    if (nowAbs < w.completesAtAbs) {
      // D22 (npc-avatar-liveliness Phase 0): a walk that has NOT completed is
      // advanced proportionally to wherever the clock is inside its span —
      // coveredUnits = totalUnits × (nowAbs − startedAtAbs) / span, exactly
      // where the frame path would have put it — so a discrete clock advance
      // (a player move, a `wait`, an action batch) no longer freezes every
      // in-flight NPC mid-stride and then teleports them. Still a pure
      // function of the clock and the walk record (C6): the batch regime now
      // reproduces the live regime's INTERMEDIATE positions as well as its
      // landings. A record without startedAtAbs (a pre-Phase-0 save) keeps
      // today's behaviour — untouched until its completion time arrives.
      if (typeof w.startedAtAbs === 'number' && w.startedAtAbs < w.completesAtAbs) {
        const span = w.completesAtAbs - w.startedAtAbs;
        const covered = w.totalUnits * ((nowAbs - w.startedAtAbs) / span);
        w.coveredUnits = Math.max(0, Math.min(w.totalUnits, covered));
        npc.pos = pointAlongPath(w.path, w.coveredUnits);
        npc.location = deriveLocationFromPosition(npc, npc.pos) || npc.location;
      }
      continue;
    }
    const end = w.path[w.path.length - 1];
    npc.pos = { x: end.x, y: end.y };
    npc.walk = null;
    if (npc.commitment) npc.commitment.arrived = true;
    // Phase 5 (D5): as in advanceFrameWalks — a settled WORK walk is the NPC
    // walking out the front door, off-map until the shift's one completion.
    if (npc.commitment && npc.commitment.kind === 'work') {
      npc.pos = null;
      npc.location = null;
    } else {
      npc.location = deriveLocationFromPosition(npc, npc.pos) || npc.location;
    }
  }
}

// --- Position/location reconciliation (D8) ---
// Keeps npc.pos in step with npc.location for NPCs who MOVED WITHOUT a walk
// — the schedule-wanderer transit that still steps rooms per tick, visitors,
// sleepers, and anyone returning from off-map. A walk owns pos and is never
// touched here. Called from resolveBatch's apply loop, so it runs exactly
// where the tick's location changes land.
function reconcileNpcPos(npc) {
  if (!npc || npc.walk) return;
  const loc = npc.location;
  if (!loc || !ROOMS[loc]) return;
  if (npc.pos && Number.isFinite(npc.pos.x) && roomsContainingPoint(npc.pos).includes(loc)) return;
  const [cx, cy] = roomCentre(loc);
  npc.pos = { x: cx, y: cy };
}

// --- Reverse overture (npc-avatar-liveliness Phase 2b, D20) ---
// Pure: where must the player walk to reach NPC npcId, and at what player-
// tier cost? Reads npc.location/npc.walk/npc.commitment and the player's
// location only — never writes (invariant 1), and the target is always the
// sim's own position data (invariant 9), never a guess. Returns null when
// there is nothing to walk for (NPC already off-map, or already co-located
// with a stationary NPC — D20's no-op), else
// { targetRoomId, arriveSec, feedback }:
//   stationary NPC   → their room — the player arrives where they stand, and
//                      the standard talk affordance follows (D20's flagged
//                      completion; no auto-open).
//   mid-walk NPC     → their walk's destination room, on the player tier, so
//                      the player arrives alongside or just after them (D19).
//   off-map-bound    → the entry room (frontDoorAnchor); feedback
//                      "[name] was gone before you could reach them." when the
//                      player's arrival time is after the NPC's off-map time,
//                      none when they'll still be there to meet at the door.
function resolveMoveToNpc(gameState, playerRoomId, npcId) {
  if (!gameState || !playerRoomId || !ROOMS[playerRoomId]) return null;
  const npc = gameState.npcs?.[npcId];
  if (!npc) return null;
  const npcRoom = npc.location;
  // Already off-map (a landed work walk nulls pos/location): nothing to walk to.
  if (!npcRoom || !ROOMS[npcRoom]) return null;
  // Already co-located with a stationary NPC: no-op (D20).
  if (npcRoom === playerRoomId && !npc.walk) return null;

  const nowAbs = clockToAbsolute(gameState.meta.clock);
  let targetRoomId, feedback = null;
  const w = npc.walk;
  if (w) {
    // Mid-walk: the walk's destination room — the commitment anchor when it
    // carries one (a work walk's anchor IS the front-door room), else the
    // room its final waypoint lands in.
    targetRoomId = (npc.commitment?.anchor?.roomId && ROOMS[npc.commitment.anchor.roomId])
      ? npc.commitment.anchor.roomId
      : (roomsContainingPoint(w.path[w.path.length - 1])[0] || npcRoom);
    // Off-map-bound: a work walk ends at the front door and the NPC steps out
    // (movement.js lands it by nulling pos/location). If the player cannot
    // beat the off-map time, they still travel — to the entry room — and the
    // D20 feedback tells them why. Beating it means meeting at the door.
    if (npc.commitment?.kind === 'work') {
      const timeUntilOffMap = Math.max(0, (w.completesAtAbs - nowAbs) * 60);
      const entrySec = walkSeconds(findPath(playerRoomId, 'entry'), 'player');
      if (entrySec >= timeUntilOffMap) {
        targetRoomId = (typeof frontDoorAnchor === 'function') ? frontDoorAnchor(gameState).roomId : 'entry';
        feedback = `${npc.bible?.name || 'They'} was gone before you could reach them.`;
      }
    }
  } else {
    // Stationary: the person's room — where the player last saw them, read
    // from the sim rather than guessed (invariant 9).
    targetRoomId = npcRoom;
  }
  const route = (typeof findPath === 'function')
    ? findPath(playerRoomId, targetRoomId)
    : [playerRoomId, targetRoomId];
  return { targetRoomId, arriveSec: walkSeconds(route, 'player'), feedback };
}
