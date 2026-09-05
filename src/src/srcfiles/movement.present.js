// ===== SECTION: PRESENTATION (NPC avatar liveliness, Phase 1) =====
// (src/src/ref/complete/npc-avatar-liveliness-and-movement-plan.md, Phase 1 — D1–D8,
// D18, D23.)
//
// The sim knows where every avatar is down to the pixel, but nothing in the
// game presents that as a continuous, alive person: every player action
// snaps every in-flight walk to its end and teleports every non-walk mover
// to its room centroid, then rebuilds the whole floor-plan SVG, and the
// only frames that do arrive come from a clock that the action-outcome
// window pauses for its whole lifetime. This file is the presentation layer
// that fixes it. It owns NOTHING in the sim: npc.pos / npc.location /
// npc.walk / commitment.arrived keep exactly the writers they have today
// (D8/D9/C6 — determinism), and this module reads them, never writes.
//
// Per avatar id it holds one record (render-layer module memory — survives
// renderFloorPlanStatic's innerHTML rebuilds, D3) and every frame decides
// whether to TRACK or CATCH UP (D4, cause-based: does the avatar hold a
// live `walk` record?), animates catch-ups on REAL time along a path that
// passes through the door midpoints the sim itself uses (findPath /
// sharedWallSegment — the same machinery planWalk uses), floors/caps the
// catch-up duration (D5), fade-teleports the rare big time-gap (D6, gate is
// game-TIME not room count), respects reduced motion (D7), and draws the
// dotted path illustration for NPCs (D18).
//
// D23: this module runs its OWN rAF loop, independent of clockFrame, because
// renderFloorPlanLive's only caller lives inside clockFrame's
// `if (scale > 0 && cappedDeltaMs > 0)` block — so a catch-up kicked off by
// a player action would paint one frame, freeze for the whole action window,
// then jump. The present loop animates REAL time and writes no sim state, so
// it runs regardless of clock state. clockFrame keeps calling the live pass
// for the sim-position half; the two are idempotent per frame.
//
// The pure core (presentStepAvatar + the path/catch helpers below it) takes
// `sim` and `ctx` as arguments and is exercised directly by
// dev/verify/verify-present-p1.js; only presentFrame touches the DOM.

// --- Module state (never persisted, keyed by avatar id; D3) ---
let presentAvatars = {};
let presentSeed = null;

// D7: two independent ways to still the motion — the OS preference and the
// in-game Appearance > Reduce motion toggle (settings.js stamps
// data-reduce-motion on <html>). Same split the .scene-cutout precedent uses.
function presentReducedMotion() {
  try {
    if (typeof document !== 'undefined' && document.documentElement &&
        document.documentElement.hasAttribute('data-reduce-motion')) return true;
    if (typeof matchMedia === 'function') return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* never let a preference read throw */ }
  return false;
}

// A deterministic per-avatar accent for the D18 dotted line (FNV-1a hue over
// the avatar id). Deliberately independent of avatar.js's hashToColor so this
// file needs no load-ordering contract with a file that loads after it.
function presentAccent(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `hsl(${(h >>> 0) % 360}, 72%, 66%)`;
}

function presentPathToD(path) {
  let d = `M ${path[0].x.toFixed(1)} ${path[0].y.toFixed(1)}`;
  for (let i = 1; i < path.length; i++) d += ` L ${path[i].x.toFixed(1)} ${path[i].y.toFixed(1)}`;
  return d;
}

function freshPresentRec(nowAbs) {
  return {
    x: 0, y: 0, visible: false,
    lastSimAbs: nowAbs,
    wasTracking: false, lastWalkPath: null, lastWalkSeconds: 0,
    catch: null, tele: null, fade: null,
    path: null, pathState: 'off', lineOpacity: 0,
  };
}

function presentNpcSleeping(npc) {
  return !!(npc && (npc.activity === 'sleeping' || npc.activity === 'sleep'));
}

// --- Pure path re-planner (the same machinery planWalk uses) ---
// [start → door midpoints → target], where the door midpoints are the
// sharedWallSegment midpoints of the findPath route — the same segments the
// renderer cuts its door gaps from, so the path the marker animates along is
// the door the picture draws. A catch entirely inside one room is a straight
// line. Pure: reads ROOM_LAYOUT/ROOM_ADJACENCY via roomsContainingPoint /
// findPath / sharedWallSegment only.
function replanPresentPath(from, to) {
  const startRooms = roomsContainingPoint(from);
  const endRooms = roomsContainingPoint(to);
  let route = null;
  for (const a of startRooms) {
    for (const b of endRooms) {
      if (a === b) { route = [a, b]; break; }
      const r = (typeof findPath === 'function') ? findPath(a, b) : null;
      if (r && r.length >= 2 && (!route || r.length < route.length)) route = r;
    }
    if (route && route.length === 2 && route[0] === route[1]) break;
  }
  const path = [{ x: from.x, y: from.y }];
  if (route) {
    for (let i = 0; i < route.length - 1; i++) {
      const seg = sharedWallSegment(route[i], route[i + 1]);
      if (seg) path.push({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 });
    }
  }
  path.push({ x: to.x, y: to.y });
  return path;
}

// The D15 in-room leg of a catch path (first and last legs; the whole path
// when it never crosses a doorway) — mirrors planWalk's own computation so
// the presentation duration and the sim's walk time agree on the same route.
function presentInRoomUnits(path) {
  if (path.length >= 3) {
    return Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y)
      + Math.hypot(path[path.length - 1].x - path[path.length - 2].x,
                   path[path.length - 1].y - path[path.length - 2].y);
  }
  return totalPathUnits(path);
}

// Distance along `path` to the point nearest (x, y) — the catch's coveredStart,
// so a catch along a walk the marker is already partway along never steps
// backwards to the path start first.
function coveredAlongPoint(x, y, path) {
  let best = 0, bestDist = Infinity, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen <= 0) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (segLen * segLen)));
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestDist) { bestDist = d; best = acc + t * segLen; }
    acc += segLen;
  }
  return best;
}

// Begin a catch-up animation along `path` from wherever the marker currently
// is to `coveredEnd` units along it (the sim position when it completes).
// Duration (D5): clamp(mechanicalRealSec, floor, cap), where mechanicalRealSec
// = the movement's GAME seconds ÷ the dilation scale — a fast-dilation snap
// lifts to the floor, a 60s cross-flat at peeking lifts to the cap, and at
// 1:1 an NPC visibly strolls. `spanSeconds` is the original sim walk's
// game-seconds when we have them (the honest "mechanical" duration); 0 means
// derive them from the path via the same D15 formula the sim uses.
function beginPresentCatch(rec, sim, path, coveredEnd, spanSeconds, ctx, nowMs) {
  const coveredStart = coveredAlongPoint(rec.x, rec.y, path);
  const transitions = Math.max(0, path.length - 2);
  const gameSeconds = spanSeconds > 0
    ? spanSeconds
    : Math.max(WALK.minSeconds,
        WALK.secondsPerRoom[ctx.tier] * transitions + presentInRoomUnits(path) / WALK.unitsPerSecond);
  const mechanicalRealSec = gameSeconds / Math.max(1, ctx.scale);
  // shortHopSec is the floor for a catch with no door crossing — a same-room
  // hop is visibly shorter than a room-to-room one.
  const floor = transitions === 0 ? ctx.shortHopSec : ctx.floorSec;
  const dur = Math.min(ctx.capSec, Math.max(floor, mechanicalRealSec));
  rec.catch = {
    path, coveredStart, coveredEnd,
    targetPt: { x: sim.x, y: sim.y },
    t0: nowMs, dur, done: false,
  };
}

// The per-frame position along the in-flight catch; clears it on arrival.
function presentCatchDecision(rec, ctx, nowMs, npc, isPlayer) {
  const c = rec.catch;
  const p = c.done ? 1 : Math.min(1, (nowMs - c.t0) / (c.dur * 1000));
  if (p >= 1) {
    rec.x = c.targetPt.x; rec.y = c.targetPt.y;
    rec.catch = null;
    rec.wasTracking = false;
    rec.pathState = 'off';
  } else {
    const covered = c.coveredStart + (c.coveredEnd - c.coveredStart) * p;
    const pt = pointAlongPath(c.path, covered);
    rec.x = pt.x; rec.y = pt.y;
  }
  const transit = !isPlayer && (!!npc?.transit || !!npc?.walk || !!rec.catch || rec.pathState !== 'off');
  return { x: rec.x, y: rec.y, hidden: false, sleeping: presentNpcSleeping(npc), transit, inlineOpacity: 1, scale: 1 };
}

// D6/D7: a brief fade+scale at the sim position instead of an animated walk —
// used when the game-time gap since our last present frame exceeds
// teleportAfterGameMinutes (sleep, hidden-tab catch-up, a long wait), and for
// every catch under reduced motion.
function presentTeleport(rec, sim, ctx, nowMs) {
  rec.x = sim.x; rec.y = sim.y;
  rec.catch = null;
  rec.wasTracking = false; rec.lastWalkPath = null;
  rec.path = null; rec.pathState = 'off';
  if (!rec.tele) rec.tele = { t0: nowMs, dur: ctx.teleportMs };
  const p = (nowMs - rec.tele.t0) / rec.tele.dur;
  let op = 1, sc = 1;
  if (p < 1) {
    op = 0.15 + 0.85 * Math.abs(Math.cos(p * Math.PI));
    if (!ctx.reduced) sc = 1 - 0.3 * Math.sin(p * Math.PI);
  } else {
    rec.tele = null;
  }
  return { x: sim.x, y: sim.y, hidden: false, sleeping: presentNpcSleeping(ctx.npc), transit: false, inlineOpacity: op, scale: sc };
}

// --- The pure per-avatar state machine (one step per frame) ---
// `sim` is the SIM position ({ x, y, offMap }) from floorPlanAvatarPlacement
// in the browser — the single sim source this layer reads and never mutates.
// `ctx` carries the frame's clock/scale/preferences and the PRESENT tunables.
// Returns the render decision { x, y, hidden, sleeping, transit,
// inlineOpacity, scale } and mutates rec for the next frame. Deterministic
// given (rec, sim, ctx, nowMs): never touches npc/sim state (invariant 1).
function presentStepAvatar(rec, sim, ctx, nowMs) {
  const { isPlayer, npc, nowAbs, reduced } = ctx;
  const gapGameSeconds = (nowAbs - rec.lastSimAbs) * 60;
  rec.lastSimAbs = nowAbs;
  if (rec.tele && (nowMs - rec.tele.t0) >= rec.tele.dur) rec.tele = null;
  // Top-of-frame fade expiry (Phase 4): the off-map 'out' fade must not be
  // re-armed on the frame its p reaches 1 — without this latch the branch
  // below would compute visible=false, self-clear, then the NEXT frame
  // re-create the fade at p=0, so the marker pulsed in place and never hid.
  // Latch completion here instead: an elapsing 'out' fade while still
  // off-map forces visible=false, so the off-map branch is skipped and the
  // marker stays hidden; an elapsing 'in' fade just clears (visible is
  // already true), leaving no stale fade to corrupt the next transition; an
  // 'out' fade that completes after the NPC came back on-map just clears.
  // The tele blink keeps its own expiry because presentTeleport never
  // self-clears.
  if (rec.fade && (nowMs - rec.fade.t0) >= rec.fade.dur) {
    const completedKind = rec.fade.kind;
    rec.fade = null;
    if (completedKind === 'out' && sim.offMap) rec.visible = false;
  }

  // --- Off-map (work, dormancy): fade out in place, then hide. ---
  if (sim.offMap) {
    if (rec.visible) {
      // Re-arm only when no 'out' fade is in flight: a completed fade was
      // already cleared by the latch above, and an in-flight 'in' fade (the
      // NPC went off-map mid-fade-in) must convert to 'out' rather than
      // counting down with the wrong kind.
      if (!rec.fade || rec.fade.kind !== 'out') rec.fade = { t0: nowMs, dur: ctx.fadeMs, kind: 'out' };
      const p = (nowMs - rec.fade.t0) / rec.fade.dur;
      rec.visible = p < 1;
      if (!rec.visible) rec.fade = null;
    }
    rec.catch = null; rec.wasTracking = false; rec.lastWalkPath = null;
    rec.path = null; rec.pathState = 'off';
    const op = rec.fade ? Math.max(0, 1 - (nowMs - rec.fade.t0) / rec.fade.dur) : (rec.visible ? 1 : 0);
    return { x: rec.x, y: rec.y, hidden: !rec.visible, sleeping: false, transit: false, inlineOpacity: op, scale: 1 };
  }

  // --- On-map: fade in from a hidden/off-map state at the sim position. ---
  if (!rec.visible) {
    rec.x = sim.x; rec.y = sim.y;
    if (!rec.fade) rec.fade = { t0: nowMs, dur: ctx.fadeMs, kind: 'in' };
    const p = (nowMs - rec.fade.t0) / rec.fade.dur;
    rec.visible = true;
    if (p >= 1) rec.fade = null;
    rec.catch = null; rec.tele = null; rec.wasTracking = false; rec.lastWalkPath = null;
    rec.path = null; rec.pathState = 'off';
    return { x: sim.x, y: sim.y, hidden: false, sleeping: presentNpcSleeping(npc), transit: false,
             inlineOpacity: rec.fade ? Math.max(0, Math.min(1, p)) : 1, scale: 1 };
  }

  // --- A fade-in mid-flight (visible already true, p<1): keep rendering the
  // ramp so the marker fades in over fadeMs instead of flashing at full
  // opacity one frame after appearing (Phase 4 polish — the off-map
  // fade-out takes the full window, so the return must not pop back
  // instantly). Mirrors the tele-blink pattern below. Tracks the sim while
  // it runs; the top-of-frame latch clears it at p>=1 and my own clear
  // below is the same frame's backup.
  if (rec.fade && rec.fade.kind === 'in') {
    const p = (nowMs - rec.fade.t0) / rec.fade.dur;
    if (p < 1) {
      rec.x = sim.x; rec.y = sim.y;
      return { x: rec.x, y: rec.y, hidden: false, sleeping: presentNpcSleeping(npc), transit: false,
               inlineOpacity: Math.max(0, Math.min(1, p)), scale: 1 };
    }
    rec.fade = null;
  }

  // --- An in-flight teleport blink (D6/D7): the frame that started the blink
  // already snapped rec to the sim position, so without this branch the idle
  // check below would swallow the rest of the blink after a single frame and
  // the fade would never visibly dip. Render the fade/scale for the whole
  // teleportMs window, tracking the sim's current position meanwhile; the
  // top-of-frame expiry clears rec.tele when the window elapses. ---
  if (rec.tele) {
    const p = (nowMs - rec.tele.t0) / rec.tele.dur;
    if (p >= 1) { rec.tele = null; }
    else {
      rec.x = sim.x; rec.y = sim.y;
      const op = 0.15 + 0.85 * Math.abs(Math.cos(p * Math.PI));
      const sc = ctx.reduced ? 1 : 1 - 0.3 * Math.sin(p * Math.PI);
      return { x: rec.x, y: rec.y, hidden: false, sleeping: presentNpcSleeping(npc), transit: false, inlineOpacity: op, scale: sc };
    }
  }

  const w = (!isPlayer && npc) ? npc.walk : null;

  // --- Mid-catch with an UNCHANGED sim target: keep interpolating (never
  // restart a catch whose target has not moved — D4's "no catch-up restart").
  // Deliberately ABOVE the TRACK branch: while a catch-up is in flight the
  // clock is often PAUSED (the action-outcome window, D23), which makes the
  // game-time gap read as 0 — indistinguishable from a live rAF — so the
  // TRACK branch would otherwise abort the catch and snap the marker. A
  // static target means the catch continues to its destination even while a
  // `walk` record is present. If the target DID move (a live walk resumed
  // mid-catch), drop the stale catch and re-catch along the walk's own path
  // below. ---
  if (rec.catch && !rec.catch.done) {
    const tgt = rec.catch.targetPt;
    if (tgt && Math.hypot(sim.x - tgt.x, sim.y - tgt.y) < 1) {
      rec.tele = null;
      return presentCatchDecision(rec, ctx, nowMs, npc, isPlayer);
    }
    rec.catch = null;
  }

  // --- TRACK (D4): a live walk record, integrated per rAF by
  // advanceFrameWalks. Follow the sim directly. A live frame is always a
  // sub-second jump of GAME time, so the walk-record-plus-time-gap test
  // separates a live track from a D22 batch partial-advance (the player's
  // own doMove advances the clock by game-SECONDS in one synchronous
  // block — rendering that as a track would snap the marker mid-path). This
  // is a TIME gate (D6's quantity, PRESENT.liveGapGameSeconds), never a
  // per-frame distance (invariant 7b). `!rec.catch` is the D23 guard: a live
  // track is only ever valid when no catch-up is in flight (the mid-catch
  // branch above already owned the paused-clock case). ---
  if (w && !rec.catch && gapGameSeconds < ctx.liveGap) {
    rec.x = sim.x; rec.y = sim.y;
    rec.catch = null;
    rec.wasTracking = true;
    rec.lastWalkPath = w.path;
    rec.lastWalkSeconds = (w.completesAtAbs - w.startedAtAbs) * 60;
    if (!reduced) {
      // D18: the dotted line follows the sim's own walk path; 'about' while
      // the walk is committed but not yet moving (coveredUnits ~0 — e.g.
      // while the D12 goodbye beat plays), 'active' once it moves.
      rec.path = w.path;
      rec.pathState = w.coveredUnits < 1 ? 'about' : 'active';
    } else {
      rec.path = null; rec.pathState = 'off';
    }
    return { x: sim.x, y: sim.y, hidden: false, sleeping: presentNpcSleeping(npc), transit: true, inlineOpacity: 1, scale: 1 };
  }

  // --- A walk record exists but the clock jumped a batch's worth of game
  // time since our last present frame (the player's doMove partial-advance,
  // D22): catch up ALONG the walk's own path (invariant 8 — the dotted line
  // stays the literal walked path), from wherever we are to the walk's
  // current coveredUnits. ---
  if (w) {
    if (reduced) return presentTeleport(rec, sim, ctx, nowMs);
    beginPresentCatch(rec, sim, w.path, w.coveredUnits,
      rec.lastWalkSeconds || ((w.completesAtAbs - w.startedAtAbs) * 60), ctx, nowMs);
    rec.wasTracking = true; rec.lastWalkPath = w.path;
    rec.path = w.path; rec.pathState = 'active';
    return presentCatchDecision(rec, ctx, nowMs, npc, isPlayer);
  }

  // --- A walk we were tracking was snapped/landed between frames
  // (settleWalks completed it — Issue A): replay along the SAVED path from
  // wherever we are to its end. Only when the sim actually landed on that
  // walk's end — a walk cleared AND a teleport (releaseCommitment +
  // reconcileNpcPos) falls through to the generic catch below. ---
  if (rec.wasTracking && rec.lastWalkPath) {
    const last = rec.lastWalkPath[rec.lastWalkPath.length - 1];
    if (last && Math.hypot(sim.x - last.x, sim.y - last.y) < 1) {
      if (reduced) return presentTeleport(rec, sim, ctx, nowMs);
      beginPresentCatch(rec, sim, rec.lastWalkPath, totalPathUnits(rec.lastWalkPath), rec.lastWalkSeconds, ctx, nowMs);
      rec.path = rec.lastWalkPath; rec.pathState = 'active';
      return presentCatchDecision(rec, ctx, nowMs, npc, isPlayer);
    }
    rec.wasTracking = false; rec.lastWalkPath = null;
  }

  // --- Idle: we are where the sim says. ---
  if (Math.hypot(rec.x - sim.x, rec.y - sim.y) < 1) {
    rec.catch = null;
    rec.path = null; rec.pathState = 'off';
    return { x: sim.x, y: sim.y, hidden: false, sleeping: presentNpcSleeping(npc), transit: false, inlineOpacity: 1, scale: 1 };
  }

  // --- Fade-teleport gate (D6): a catch-up whose gap spans more than
  // teleportAfterGameMinutes of GAME time (sleep 8 hours, hidden-tab
  // catch-up, a long wait) presents as a brief fade/scale, not a walk
  // replay — nobody believes a single stroll covered eight hours. Everything
  // shorter replays as a walk however many rooms it crosses. Reduced motion
  // (D7) forces this for every catch. ---
  if (reduced || gapGameSeconds >= ctx.teleportAfterGameMinutes * 60) {
    return presentTeleport(rec, sim, ctx, nowMs);
  }

  // --- Generic catch-up: a position change with no walk record
  // (reconcileNpcPos teleport, work_from_home placement, the player's own
  // doMove, an off-path landing). Re-plan start room → door midpoints →
  // target (the same machinery planWalk uses) and animate over the
  // floored/capped duration (D5). ---
  const path = replanPresentPath({ x: rec.x, y: rec.y }, sim);
  beginPresentCatch(rec, sim, path, totalPathUnits(path), 0, ctx, nowMs);
  if (!isPlayer) { rec.path = path; rec.pathState = 'active'; }
  return presentCatchDecision(rec, ctx, nowMs, npc, isPlayer);
}

// --- The dotted path overlay (D18) — NPCs only; the player chooses their own
// path and gets no line. One <path class="fp-route"> per avatar, drawn in the
// .fp-paths group the static pass inserts ahead of .fp-people. The d string
// is cached per path-array identity so a tracked walk rewrites nothing while
// it moves; opacity is driven per frame by the smoothed lineOpacity. ---
function presentWriteRoutePaths(container, rendered) {
  const pathsGroup = container.querySelector('.fp-paths');
  if (!pathsGroup) return;
  for (const [id, d] of Object.entries(rendered)) {
    if (d.isPlayer) continue;
    const el = container.querySelector(`.fp-paths [data-route-for="${id}"]`);
    if (d.linePath && d.linePath.length >= 2) {
      let p = el;
      if (!p) {
        p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('class', 'fp-route');
        p.setAttribute('data-route-for', id);
        pathsGroup.appendChild(p);
      }
      if (p.__presentD !== d.linePath) {
        p.setAttribute('d', presentPathToD(d.linePath));
        p.__presentD = d.linePath;
        p.setAttribute('stroke', presentAccent(id));
      }
      p.style.opacity = String(d.lineOpacity.toFixed(3));
      p.removeAttribute('hidden');
    } else if (el) {
      el.style.opacity = String((d.lineOpacity ?? 0).toFixed(3));
      if ((d.lineOpacity ?? 0) < 0.02) el.remove();
    }
  }
}

// --- De-overlap (2026-08-29): avatars never overlap. ---
// The sim positions are what they are — several NPCs legitimately share a
// stand-point, or a room whose occupants have no `pos` yet collapses to its
// centroid — so the PRESENTATION nudges the RENDERED positions apart with a
// deterministic per-frame relaxation. Purely visual: it never writes back to
// rec or sim state (invariant 1 — rec keeps the un-nudged position, so the
// state machine's idle/catch decisions are untouched and the same nudge is
// re-derived identically next frame). Pure: same points in, same points out.
//
// Position-based dynamics over the overlap constraint (minDist): every frame,
// sum each point's displacement from all overlapping neighbours, then move
// all points by that sum (clamped per-iteration). Summing-then-moving instead
// of pushing pair-by-pair is what makes it converge for a whole room piled on
// one centroid — the pair-wise variant oscillated and left 18 coincident
// points 1 unit apart after 6 iterations. 20 iterations gets even the worst
// pile (every visible avatar on one spot) to a 39.64/40 minimum gap; the
// realistic worst case — a handful at one stand-point — is exact after ~6.
function presentSeparateAvatars(points, minDist, iterations) {
  const min2 = minDist * minDist;
  for (let it = 0; it < iterations; it++) {
    for (const p of points) { p._dx = 0; p._dy = 0; }
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min2) continue;
        let nx, ny, push;
        if (d2 === 0) {
          // Exact coincidence (shared stand-point / centroid): deterministic
          // pair-hash direction — stable across frames and containers, never
          // a random jitter that would make the cluster shimmer.
          let h = 0;
          const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
          for (let k = 0; k < key.length; k++) { h = (h * 31 + key.charCodeAt(k)) >>> 0; }
          const ang = (h % 6283) / 1000;
          nx = Math.cos(ang); ny = Math.sin(ang);
          push = minDist / 2;
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d;
          push = (minDist - d) / 2;
        }
        a._dx -= nx * push; a._dy -= ny * push;
        b._dx += nx * push; b._dy += ny * push;
      }
    }
    let moved = false;
    const maxStep = minDist * 0.5;
    for (const p of points) {
      const mag = Math.hypot(p._dx, p._dy);
      if (mag === 0) continue;
      const s = Math.min(1, maxStep / mag);
      p.x += p._dx * s; p.y += p._dy * s;
      moved = true;
    }
    if (!moved) break;
  }
  for (const p of points) { delete p._dx; delete p._dy; }
  return points;
}

// --- The per-frame entry (called by renderFloorPlanLive from the sim's own
// clockFrame AND by this module's independent rAF loop; idempotent). ---
function presentFrame(gs, nowMs) {
  if (!gs || !gs.meta || !gs.meta.clock) return;
  if (presentSeed !== gs.meta.seed) { presentAvatars = {}; presentSeed = gs.meta.seed; }
  if (typeof floorPlanContainers !== 'function' || typeof floorPlanAvatarPlacement !== 'function') return;
  const containers = floorPlanContainers();
  if (containers.length === 0) return;
  if (nowMs == null) nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const nowAbs = clockToAbsolute(gs.meta.clock);
  const scale = (typeof getTimeScale === 'function') ? getTimeScale() : 0;
  const reduced = presentReducedMotion();
  const npcs = gs.npcs || {};
  const ids = [...Object.keys(npcs), 'player'];
  for (const k of Object.keys(presentAvatars)) if (!ids.includes(k)) delete presentAvatars[k];

  const rendered = {};
  for (const id of ids) {
    const npc = id === 'player' ? null : npcs[id];
    const rec = presentAvatars[id] || (presentAvatars[id] = freshPresentRec(nowAbs));
    const sim = floorPlanAvatarPlacement(gs, id, npc);
    const ctx = {
      isPlayer: id === 'player', npc, nowAbs, scale, reduced,
      tier: id === 'player' ? 'player' : 'npc',
      liveGap: PRESENT.liveGapGameSeconds,
      floorSec: PRESENT.floorSec, capSec: PRESENT.capSec, shortHopSec: PRESENT.shortHopSec,
      teleportAfterGameMinutes: PRESENT.teleportAfterGameMinutes,
      fadeMs: PRESENT.fadeMs, teleportMs: PRESENT.teleportMs,
    };
    const decision = presentStepAvatar(rec, sim, ctx, nowMs);
    // D18 line state, exponential-smoothed per frame toward the state target.
    const want = reduced || !rec.path ? 'off' : rec.pathState;
    const target = want === 'off' ? 0 : (want === 'about' ? PRESENT.lineAboutOpacity : PRESENT.lineActiveOpacity);
    rec.lineOpacity += (target - rec.lineOpacity) * PRESENT.lineSmooth;
    if (rec.lineOpacity < 0.02) rec.lineOpacity = 0;
    if (want === 'off' && rec.lineOpacity < 0.02) rec.path = null;
    decision.linePath = rec.path;
    decision.lineState = rec.pathState;
    decision.lineOpacity = rec.lineOpacity;
    decision.isPlayer = id === 'player';
    rendered[id] = decision;
  }

  // De-overlap (2026-08-29): push the visible markers apart so avatars never
  // overlap — a deterministic per-frame relaxation over the RENDERED
  // positions only (rec and sim state untouched, invariant 1). Computed once
  // and applied to every container, so all the copies stay in sync. Hidden
  // (off-map) markers are skipped — they fade out at their own spot.
  const separables = [];
  for (const id of Object.keys(rendered)) {
    const d = rendered[id];
    if (!d.hidden) separables.push({ id, x: d.x, y: d.y });
  }
  presentSeparateAvatars(separables, PRESENT.avatarSeparationMin, PRESENT.avatarSeparationIterations);
  for (const s of separables) { const d = rendered[s.id]; d.x = s.x; d.y = s.y; }

  for (const c of containers) {
    const markers = c.querySelectorAll('.fp-people [data-avatar-id]');
    if (markers.length === 0) continue;
    for (const m of markers) {
      const id = m.getAttribute('data-avatar-id');
      const d = rendered[id];
      if (!d) continue;
      m.setAttribute('transform', `translate(${d.x.toFixed(2)},${d.y.toFixed(2)})` +
        (d.scale !== 1 ? ` scale(${d.scale.toFixed(3)})` : ''));
      if (d.hidden) m.setAttribute('hidden', '');
      else m.removeAttribute('hidden');
      m.classList.toggle('is-sleeping', !!d.sleeping);
      m.classList.toggle('is-transit', !!d.transit);
      // Inline opacity only while a fade/teleport is active; otherwise clear
      // it so the class rules (.is-sleeping, ...) keep their say.
      if (d.inlineOpacity == null || d.inlineOpacity >= 1) m.style.opacity = '';
      else m.style.opacity = String(d.inlineOpacity.toFixed(3));
    }
    presentWriteRoutePaths(c, rendered);
  }
}

// --- The presentation rAF loop (D23). Own, independent of clockFrame:
// animates REAL time, touches no sim state, runs while the clock is paused
// (action-outcome window, pause menu, sleep). ---
let presentLoopRunning = false;
function startPresentLoop() {
  if (presentLoopRunning || typeof requestAnimationFrame !== 'function') return;
  presentLoopRunning = true;
  requestAnimationFrame(presentLoopFrame);
}
function presentLoopFrame() {
  requestAnimationFrame(presentLoopFrame);
  try {
    if (typeof currentGameState === 'object' && currentGameState) {
      presentFrame(currentGameState, performance.now());
    }
  } catch (e) { /* a presentation error must never kill the loop */ }
}
if (typeof requestAnimationFrame === 'function') startPresentLoop();
