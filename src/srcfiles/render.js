// ===== SECTION: RENDER =====
// State → DOM. Idempotent. Toggles classes and data-* attributes only.
// No inline styles. No state mutation. No direct kv access.
// (Apartment Expansion v2 — Mirrored H)

// --- Main render entry point (idempotent) ---
function render(gameState, sceneState) {
  if (!gameState) return;
  renderHeader(gameState);
  renderFloorPlan(gameState);
  renderPlayerPanel(gameState);
  renderScene(gameState, sceneState);
  renderStatusStrip(gameState);
  renderPresentList(gameState, sceneState);
  renderQuestList(gameState);
  renderInventory(gameState);
  renderDeliveries(gameState);
  renderActionChips(gameState, sceneState);
  renderSceneMoodles(gameState);
  const composedScene = renderSceneReader(gameState, sceneState);
  markCalloutsShouted(gameState, composedScene);
  markDoorCuesShown(gameState, composedScene);
  renderFooter(gameState);
  // Harmless when #main-content isn't in computer mode (CSS keeps
  // #computer-screen hidden either way) — always redrawing it here means
  // every path that already calls render() keeps the computer screen in
  // sync for free, rather than every computer action needing to remember
  // a second render call.
  if (gameState.world.computer) renderComputerScreen(gameState);
  // BrineOS Phase 3 (plan 3.5): sibling call — the phone FAB renders on
  // every pass, and the overlay when open. Decision E: it's an overlay,
  // not a mode switch, so it must redraw here even while the computer is
  // on (the phone can float over a fullscreen desktop).
  if (gameState.world.phone) renderPhoneScreen(gameState);
}

// --- Header ---
function renderHeader(gs) {
  const { meta, player } = gs;
  const hdrDay = document.getElementById('hdr-day');
  const hdrTime = document.getElementById('hdr-time');
  const hdrMoney = document.getElementById('hdr-money');
  const hdrRoom = document.getElementById('hdr-room');

  if (hdrDay) hdrDay.textContent = formatDate(meta.clock.day);
  if (hdrTime) hdrTime.textContent = formatTime(meta.clock.minutes);
  if (hdrMoney) hdrMoney.textContent = `$${player.money}`;
  if (hdrRoom) {
    const roomName = ROOMS[player.location]?.name || player.location;
    const doorState = getDoorState(gs, player.location);
    hdrRoom.textContent = roomName + (doorState === 'locked' ? ' 🔒' : '');
  }

  // Need bars. mood lives on [-1, 1] (see NEEDS.mood config comment) while
  // the bar is always a 0-100% fill regardless of the underlying need's
  // native scale — remapped here for display only; warnBelow is compared
  // on each need's own native scale, unremapped. Width is set via a
  // data-fill bucket (nearest 5%) rather than inline style, per §10 (zero
  // inline styles / zero element.style.x — JS toggles classes and
  // data-attributes only); see the .fill[data-fill="N"] rules in STYLES.
  const needMap = { energy: player.energy, hunger: player.hunger, hygiene: player.hygiene, mood: player.mood };
  for (const [need, val] of Object.entries(needMap)) {
    const bar = document.querySelector(`.need-bar[data-need="${need}"]`);
    if (!bar) continue;
    const fill = bar.querySelector('.fill');
    if (fill) {
      const displayPct = need === 'mood' ? (val + 1) * 50 : val;
      const bucket = Math.round(Math.max(0, Math.min(100, displayPct)) / 5) * 5;
      fill.setAttribute('data-fill', bucket);
    }
    if (val < NEEDS[need].warnBelow) bar.setAttribute('data-low', '');
    else bar.removeAttribute('data-low');
  }

  renderSpeedButtons();
}

// Phase 10 (D12): highlight the active game-speed preset in the header
// cluster (data-active on the matching button). Idempotent; also called
// directly by the 'speed.set' action so a click re-marks the buttons
// without a full render pass.
function renderSpeedButtons() {
  const cluster = document.getElementById('hdr-speed');
  if (!cluster) return;
  const speed = currentSpeed();
  for (const btn of cluster.querySelectorAll('[data-id]')) {
    if (btn.getAttribute('data-id') === speed.id) btn.setAttribute('data-active', '');
    else btn.removeAttribute('data-active');
  }
}

// --- Floor plan (SVG) ---
// A real floor plan (floorplan-and-movement-plan.md Phase 4), not a diagram
// of a graph. Rooms TILE — they share walls — so the picture is drawn the way
// a plan is drawn: fills, then walls, then the openings cut into those walls.
//
// The previous version drew floating rectangles joined by dashed connector
// lines, because zero of seventeen declared adjacencies actually shared a
// wall. The connectors existed to bridge gaps that should never have been
// there, and deleting them is most of what makes this read as an apartment.
//
// Every doorway is derived from the same sharedWallSegment() the walk cost
// uses, so the door you SEE and the door you WALK THROUGH cannot disagree.

// How wide a doorway is cut, in layout units. An `open` threshold takes the
// whole shared wall (there is no wall); a door takes a fixed leaf width.
const FP_DOOR_WIDTH = 16;

// Every opening in the plan, as a segment on a wall. Locked doors are
// deliberately NOT openings — a locked door is a closed door, and the plan
// draws it sealed. That is the whole reason the lock is worth showing.
function floorPlanOpenings(gs) {
  const out = [];
  for (const [key, type] of Object.entries(ROOM_THRESHOLDS)) {
    const [a, b] = key.split('|');
    if (!ROOM_LAYOUT[a] || !ROOM_LAYOUT[b]) continue;
    const seg = sharedWallSegment(a, b);
    if (!seg) continue;
    const locked = type === 'door' && (getDoorState(gs, a) === 'locked' || getDoorState(gs, b) === 'locked');
    const width = type === 'door' ? Math.min(FP_DOOR_WIDTH, seg.len * 0.7) : seg.len;
    const vertical = seg.x1 === seg.x2;
    const mid = vertical ? (seg.y1 + seg.y2) / 2 : (seg.x1 + seg.x2) / 2;
    out.push({
      vertical, type, locked, rooms: [a, b],
      pos: vertical ? seg.x1 : seg.y1,
      from: mid - width / 2,
      to: mid + width / 2,
    });
  }
  return out;
}

// Where a room's OWN rectangles meet each other. An L-shaped room is two
// rects sharing an edge, and drawing all four sides of both puts a wall
// straight down the middle of a single room — the Living Room and the Gym
// both read as two rooms because of it. These seams are subtracted from the
// wall pass exactly like doorways are: there is no wall there, so none is
// drawn.
//
// Returned in the same shape as an opening so wallPieces can take them in
// one list and does not need to know the difference.
function roomInternalSeams(rects) {
  const seams = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [ax, ay, aw, ah] = rects[i];
      const [bx, by, bw, bh] = rects[j];
      // Vertical seam: side by side, overlapping in y.
      if (Math.abs(ax + aw - bx) < 0.5 || Math.abs(bx + bw - ax) < 0.5) {
        const y1 = Math.max(ay, by), y2 = Math.min(ay + ah, by + bh);
        if (y2 - y1 > 0.5) {
          seams.push({ vertical: true, pos: Math.abs(ax + aw - bx) < 0.5 ? ax + aw : bx + bw, from: y1, to: y2 });
        }
      }
      // Horizontal seam: stacked, overlapping in x.
      if (Math.abs(ay + ah - by) < 0.5 || Math.abs(by + bh - ay) < 0.5) {
        const x1 = Math.max(ax, bx), x2 = Math.min(ax + aw, bx + bw);
        if (x2 - x1 > 0.5) {
          seams.push({ vertical: false, pos: Math.abs(ay + ah - by) < 0.5 ? ay + ah : by + bh, from: x1, to: x2 });
        }
      }
    }
  }
  return seams;
}

// One rect edge, minus every opening that lies on it. Interval subtraction in
// 1D: the wall is a range, the openings are holes, and what is left is drawn.
function wallPieces(fixed, from, to, vertical, openings) {
  let pieces = [[from, to]];
  for (const o of openings) {
    if (o.vertical !== vertical) continue;
    if (Math.abs(o.pos - fixed) > WALL_TOUCH_TOLERANCE / 2) continue;
    if (o.locked) continue;                      // sealed: no hole in the wall
    const next = [];
    for (const [s, e] of pieces) {
      if (o.to <= s || o.from >= e) { next.push([s, e]); continue; }
      if (o.from > s) next.push([s, o.from]);
      if (o.to < e) next.push([o.to, e]);
    }
    pieces = next;
  }
  return pieces.filter(([s, e]) => e - s > 0.5);
}

// Every floor plan that should be on screen right now: the sidebar always,
// and the large overlay map while its overlay is open. The static pass
// renders into each, the live pass mutates each, and the same click
// delegation serves both — the overlay is the same map, just bigger.
function floorPlanContainers() {
  const out = [];
  const sidebar = document.getElementById('floor-plan');
  if (sidebar) out.push(sidebar);
  const overlay = document.getElementById('floorplan-overlay');
  const large = document.getElementById('floor-plan-large');
  if (overlay && large && !overlay.hidden) out.push(large);
  return out;
}

function renderFloorPlan(gs) {
  // D12: two loops, two costs. This entry is the STATIC pass — walls, fills,
  // furniture, labels — rebuilt on real state changes (render() calls it on
  // every action) and the one place the avatar markers are CREATED. The
  // per-frame loop is renderFloorPlanLive, called from clockFrame: direct
  // attribute mutation only, never innerHTML.
  const containers = floorPlanContainers();
  if (containers.length === 0) return;
  for (const c of containers) renderFloorPlanStatic(gs, c);
  renderFloorPlanLive(gs);
  hydrateFloorPlanAvatars(gs);
}

function renderFloorPlanStatic(gs, container) {
  const currentRoom = gs.player.location;
  const adjacent = ROOM_ADJACENCY[currentRoom] || [];

  // Bounds derived from the geometry rather than hardcoded, so nudging a room
  // in the mapper can never crop it out of the picture.
  let maxX = 0, maxY = 0;
  for (const rects of Object.values(ROOM_LAYOUT)) {
    for (const [x, y, w, h] of rects) { maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); }
  }
  const pad = 10;
  let svg = `<svg viewBox="${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}" xmlns="http://www.w3.org/2000/svg">`;
  svg += '<defs><pattern id="fp-hazard" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">'
       + '<rect width="14" height="14" fill="rgba(224,160,64,0.18)"/>'
       + '<line x1="0" y1="0" x2="0" y2="14" stroke="rgba(224,160,64,0.5)" stroke-width="5"/></pattern>';

  // One clip per NPC avatar — every NPC, not just the ones present this tick,
  // because the live layer owns who is visible and the markers must exist
  // for it to show them at all.
  for (const id of Object.keys(gs.npcs || {})) {
    svg += `<clipPath id="fp-clip-${id}"><circle cx="0" cy="0" r="9"/></clipPath>`;
  }
  svg += '</defs>';

  const openings = floorPlanOpenings(gs);
  const signalMap = typeof signalsByRoom === 'function' ? signalsByRoom(gs) : {};
  // Present-per-room is still read for the LABEL nudge (so a room name does
  // not sit on top of the people below it) — the markers themselves are the
  // live layer's job now, not this pass's.
  const present = {};
  for (const roomId of ALL_ROOMS) present[roomId] = getPresentNpcIds(gs.npcs, roomId);
  // Phase 3 (intimacy-voyeurism, D4): rooms whose light would show through
  // their door right now, for the keyhole glow. The player's own room never
  // glows — their own lamp is not a cue — and roomLightVisible is the SAME
  // derivation deriveDoorCues uses, so the plan and the scene reader cannot
  // disagree about which doors are lit.
  const litRooms = new Set();
  for (const roomId of ALL_ROOMS) {
    if (roomId !== currentRoom && roomLightVisible(gs, roomId)) litRooms.add(roomId);
  }

  // --- Layer 1: room fills. Clickable; every room, not just adjacent ones,
  // because doMove auto-paths now and clicking somewhere far away is a walk
  // rather than a refusal.
  for (const roomId of ALL_ROOMS) {
    const rects = ROOM_LAYOUT[roomId];
    if (!rects) continue;
    const isCurrent = roomId === currentRoom;
    const isAdjacent = adjacent.includes(roomId);
    const construction = getActiveJobForRoom(gs, roomId);
    let attrs = `class="fp-room" data-room-id="${roomId}"`;
    if (isCurrent) attrs += ' data-current=""';
    else if (isAdjacent) attrs += ' data-adjacent=""';
    // D10 (intimacy-voyeurism Phase 2): the plan is never omniscient. Every
    // room you are not IN is fogged — still the same clickable rect, so
    // navigation on a dimmed room is unchanged; the fog only lies on top.
    if (!isCurrent) attrs += ' data-fog=""';
    if (construction) attrs += ' data-construction=""';
    for (const [x, y, w, h] of rects) {
      svg += `<rect ${attrs} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    }
  }

  // --- Layer 2: walls, with the openings cut out of them.
  for (const roomId of ALL_ROOMS) {
    const rects = ROOM_LAYOUT[roomId];
    if (!rects) continue;
    // A room's own internal seams are cut out alongside the doorways: an
    // L-shaped room is ONE room, and a line down its middle says otherwise.
    const cuts = rects.length > 1 ? openings.concat(roomInternalSeams(rects)) : openings;
    for (const [x, y, w, h] of rects) {
      const sides = [
        { fixed: y,     from: x, to: x + w, vertical: false },
        { fixed: y + h, from: x, to: x + w, vertical: false },
        { fixed: x,     from: y, to: y + h, vertical: true },
        { fixed: x + w, from: y, to: y + h, vertical: true },
      ];
      for (const s of sides) {
        for (const [a, b] of wallPieces(s.fixed, s.from, s.to, s.vertical, cuts)) {
          svg += s.vertical
            ? `<line class="fp-wall" x1="${s.fixed}" y1="${a}" x2="${s.fixed}" y2="${b}"/>`
            : `<line class="fp-wall" x1="${a}" y1="${s.fixed}" x2="${b}" y2="${s.fixed}"/>`;
        }
      }
    }
  }

  // --- Layer 3: the openings themselves, where they need drawing.
  // A door gap and an open threshold are both simply absent wall. Glass and
  // locked doors are things you can SEE, so they get a line of their own.
  for (const o of openings) {
    if (o.type === 'glass') {
      svg += o.vertical
        ? `<line class="fp-glass" x1="${o.pos}" y1="${o.from}" x2="${o.pos}" y2="${o.to}"/>`
        : `<line class="fp-glass" x1="${o.from}" y1="${o.pos}" x2="${o.to}" y2="${o.pos}"/>`;
    }
    if (o.type === 'door' && (litRooms.has(o.rooms[0]) || litRooms.has(o.rooms[1]))) {
      const gx = o.vertical ? o.pos + 3 : (o.from + o.to) / 2;
      const gy = o.vertical ? (o.from + o.to) / 2 : o.pos + 3;
      const grx = o.vertical ? 4 : (o.to - o.from) / 2 + 1;
      const gry = o.vertical ? (o.to - o.from) / 2 + 1 : 4;
      svg += `<ellipse class="fp-door-glow" cx="${gx}" cy="${gy}" rx="${grx}" ry="${gry}"/>`;
      svg += `<ellipse class="fp-door-glow-core" cx="${gx}" cy="${gy}" rx="${(grx * 0.45).toFixed(1)}" ry="${(gry * 0.45).toFixed(1)}"/>`;
    }
    if (o.locked) {
      svg += o.vertical
        ? `<line class="fp-locked" x1="${o.pos}" y1="${o.from}" x2="${o.pos}" y2="${o.to}"/>`
        : `<line class="fp-locked" x1="${o.from}" y1="${o.pos}" x2="${o.to}" y2="${o.pos}"/>`;
      // D10 (intimacy-voyeurism Phase 2): a lock glyph on the sealed doorway
      // itself, so "this room is locked" reads at a glance — the occupant's
      // avatar inside stays visible, the padlock does not hide the person.
      const gx = o.vertical ? o.pos + 3.5 : (o.from + o.to) / 2;
      const gy = o.vertical ? (o.from + o.to) / 2 : o.pos + 3.5;
      svg += `<g class="fp-lock-glyph" transform="translate(${gx},${gy})">`
           + `<path class="fp-lock-shackle" d="M -2 0 V -2.4 a 2 2 0 0 1 4 0 V 0"/>`
           + `<rect class="fp-lock-body" x="-2.6" y="-1.2" width="5.2" height="4.8" rx="1"/>`
           + '</g>';
    }
  }

  // --- Layer 4: contents, labels, construction marks. (People moved to the
  // live layer below — they are the one thing that changes per-frame.)
  for (const roomId of ALL_ROOMS) {
    const rects = ROOM_LAYOUT[roomId];
    if (!rects) continue;
    const [cx, cy] = roomCentre(roomId);
    const bodyCount = present[roomId].length + (roomId === currentRoom ? 1 : 0);

    // D10 (intimacy-voyeurism Phase 2): everything INSIDE a non-current room
    // rides in a .fp-fog group, so furniture, labels and signal glyphs dim
    // together with the room's floor. pointer-events:none keeps the click
    // on the room rect beneath; the AVATARS are layer 5, outside the fog,
    // and stay visible everywhere — D10's positional awareness.
    const fogged = roomId !== currentRoom;
    if (fogged) svg += '<g class="fp-fog">';

    svg += renderRoomFurniture(gs, roomId);

    svg += roomLabel(roomId, cx, cy - (bodyCount > 0 ? 8 : 0));

    const roomSignals = (signalMap[roomId] || []).slice(0, SIGNAL_ICONS.maxPerRoom);
    if (roomSignals.length > 0) {
      svg += roomSignals.map((sig, i) => {
        const gx = cx + (i - (roomSignals.length - 1) / 2) * 13;
        return `<text class="fp-signal" x="${gx}" y="${cy + 20}" opacity="${SIGNAL_ICONS.bandOpacity[sig.band]}">${signalIcon(sig.signalId)}</text>`;
      }).join('');
    }

    if (getActiveJobForRoom(gs, roomId)) {
      svg += `<text class="fp-construction-label" x="${cx}" y="${cy + 10}">Under construction</text>`;
    }

    if (fogged) svg += '</g>';
  }

  // --- Layer 5: the live avatar layer (D12). One marker per NPC plus the
  // player, CREATED here, repositioned every frame by renderFloorPlanLive via
  // transform/class attribute mutation only — never innerHTML, never a
  // rebuild. Off-map NPCs (work, dormancy) start hidden; everyone else is
  // placed by pos where one exists, else at their room's centre.
  svg += '<g class="fp-people">';
  for (const [id, npc] of Object.entries(gs.npcs || {})) {
    if (!npc) continue;
    // D10 (intimacy-voyeurism Phase 2): the caption under each marker is
    // what the player could plausibly know — full activity here, coarse or
    // 'inside' elsewhere, nothing for a stranger behind a door. Computed in
    // the STATIC pass (once per real state change, like everything else on
    // this layer); the live layer never rebuilds it.
    const plausible = derivePlausibleActivity(gs, id, currentRoom);
    svg += avatarMarkerHtml(id, false, npc, plausible);
  }
  svg += avatarMarkerHtml('player', true, gs.player, null);
  svg += '</g>';

  svg += '</svg>';
  container.innerHTML = svg;
}

// --- Furniture, top down (floorplan plan Phase 5) ---
// A small symbol library rather than art. Each entry is a footprint and a
// draw function returning SVG — geometric primitives only, so a bed is a
// rounded rect with a pillow bar and a stove is a square with four rings.
// Authored once, reused in every room that contains the object.
//
// `state` is the live object instance's state, so what the plan draws is what
// the world says: a `crusty` stove burner, an `unmade` bed, a `cluttered`
// surface. The data has been there since P1 and nothing has ever looked at it.
//
// Objects absent from this table simply are not drawn — `floor`, `phone`,
// `diary` and the other small or abstract ones have no useful top-down
// silhouette, and a plan crowded with them reads worse, not better.
const FP_FURNITURE = {
  bed: { w: 26, h: 34, draw: (x, y, w, h, s) => {
    const messy = s?.made === 'unmade';
    return `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`
         + `<rect class="fp-f-soft${messy ? ' messy' : ''}" x="${x + 2}" y="${y + 9}" width="${w - 4}" height="${h - 11}" rx="2"/>`
         + `<rect class="fp-f-detail" x="${x + 3}" y="${y + 2}" width="${w - 6}" height="6" rx="2"/>`;
  } },
  desk: { w: 24, h: 11, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  study_desk: { w: 24, h: 11, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  wardrobe: { w: 20, h: 9, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}"/>`
    + `<line class="fp-f-detail-l" x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}"/>` },
  nightstand: { w: 9, h: 9, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  bookshelf: { w: 22, h: 7, draw: (x, y, w, h) => shelfSymbol(x, y, w, h) },
  study_bookshelf: { w: 22, h: 7, draw: (x, y, w, h) => shelfSymbol(x, y, w, h) },
  desktop_computer: { w: 10, h: 6, draw: (x, y, w, h) =>
    `<rect class="fp-f-detail" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  // --- Bathroom / wet rooms ---
  shower: { w: 14, h: 14, draw: (x, y, w, h, s) =>
    `<rect class="fp-f${s?.grime === 'soap-scummed' ? ' dirty' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="2.5"/>` },
  toilet: { w: 9, h: 12, draw: (x, y, w, h, s) =>
    `<rect class="fp-f${s?.clean === 'dirty' ? ' dirty' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>` },
  sink_bathroom: { w: 11, h: 8, draw: (x, y, w, h) => sinkSymbol(x, y, w, h) },
  sink_kitchen: { w: 14, h: 10, draw: (x, y, w, h, s, o) => sinkSymbol(x, y, w, h, dishLevelOf(o) !== 'clean') },
  bathroom_mirror: { w: 12, h: 3, draw: (x, y, w, h) =>
    `<rect class="fp-f-detail" x="${x}" y="${y}" width="${w}" height="${h}"/>` },
  lockers: { w: 20, h: 8, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}"/>`
    + [1, 2, 3].map(i => `<line class="fp-f-detail-l" x1="${x + (w / 4) * i}" y1="${y}" x2="${x + (w / 4) * i}" y2="${y + h}"/>`).join('') },
  changing_bench: { w: 20, h: 6, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  // --- Kitchen ---
  stove: { w: 14, h: 12, draw: (x, y, w, h, s) => {
    const dirty = s?.burner && s.burner !== 'clean';
    const r = 1.9, dx = w / 4, dy = h / 4;
    let out = `<rect class="fp-f${dirty ? ' dirty' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
    for (const [i, j] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
      out += `<circle class="fp-f-detail" cx="${x + dx * i}" cy="${y + dy * j}" r="${r}"/>`;
    }
    return out;
  } },
  fridge: { w: 12, h: 12, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<line class="fp-f-detail-l" x1="${x + w - 3}" y1="${y + 2}" x2="${x + w - 3}" y2="${y + h - 2}"/>` },
  freezer: { w: 10, h: 12, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<line class="fp-f-detail-l" x1="${x + 1.5}" y1="${y + h / 3}" x2="${x + w - 1.5}" y2="${y + h / 3}"/>`
    + `<rect class="fp-f-detail" x="${x + 1.5}" y="${y + h / 3 + 1}" width="${w - 3}" height="${h - h / 3 - 2}" rx="0.5"/>` },
  // Food-overhaul Phase 4 (D11): a dishwasher under the counter. The running
  // state (derived from its cycle anchor) tints the face so a mid-cycle
  // machine reads at a glance.
  dishwasher: { w: 10, h: 10, draw: (x, y, w, h, s, o) =>
    `<rect class="fp-f${s?.cycle === 'running' ? ' dirty' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<rect class="fp-f-detail" x="${x + w * 0.2}" y="${y + h * 0.35}" width="${w * 0.6}" height="${h * 0.3}" rx="0.5"/>` },
  // Food-overhaul Phase 6 (D12): the microwave — a small countertop box
  // with a door and a control strip.
  microwave: { w: 8, h: 6, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<rect class="fp-f-detail" x="${x + 0.6}" y="${y + 0.8}" width="${w * 0.55}" height="${h - 1.6}" rx="0.5"/>`
    + `<rect class="fp-f-detail" x="${x + w * 0.68}" y="${y + 1}" width="${w * 0.26}" height="${h - 2}" rx="0.3"/>` },
  pantry: { w: 11, h: 10, draw: (x, y, w, h) => shelfSymbol(x, y, w, h) },
  kitchen_table: { w: 20, h: 14, draw: (x, y, w, h, s, o) => tableSymbol(x, y, w, h, s, o) },
  dining_table: { w: 34, h: 20, draw: (x, y, w, h, s, o) => tableSymbol(x, y, w, h, s, o) },
  coffee_table_lr: { w: 20, h: 11, draw: (x, y, w, h, s) => tableSymbol(x, y, w, h, s) },
  balcony_table: { w: 14, h: 14, draw: (x, y, w, h, s) => tableSymbol(x, y, w, h, s) },
  trash_kitchen: { w: 7, h: 7, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>` },
  coffee_maker: { w: 6, h: 5, draw: (x, y, w, h) =>
    `<rect class="fp-f-detail" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  // --- Living / leisure ---
  sofa: { w: 30, h: 13, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y + 3}" width="${w}" height="${h - 3}" rx="2"/>`
    + `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="4" rx="1"/>` },
  armchair: { w: 12, h: 12, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y + 3}" width="${w}" height="${h - 3}" rx="2"/>`
    + `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="4" rx="1"/>` },
  tv: { w: 22, h: 4, draw: (x, y, w, h) =>
    `<rect class="fp-f-detail" x="${x}" y="${y}" width="${w}" height="${h}"/>` },
  pool_table: { w: 30, h: 17, draw: (x, y, w, h) =>
    `<rect class="fp-f-felt" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`
    + `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="1.6"/>` },
  game_console: { w: 8, h: 5, draw: (x, y, w, h) =>
    `<rect class="fp-f-detail" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  dartboard: { w: 8, h: 8, draw: (x, y, w, h) =>
    `<circle class="fp-f" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>`
    + `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="1.5"/>` },
  treadmill: { w: 12, h: 20, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
    + `<rect class="fp-f-detail" x="${x + 1}" y="${y + 5}" width="${w - 2}" height="${h - 7}" rx="1"/>` },
  weight_set: { w: 14, h: 7, draw: (x, y, w, h) =>
    `<line class="fp-f-bar" x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}"/>`
    + `<circle class="fp-f" cx="${x + 2}" cy="${y + h / 2}" r="3"/>`
    + `<circle class="fp-f" cx="${x + w - 2}" cy="${y + h / 2}" r="3"/>` },
  yoga_mat: { w: 8, h: 18, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>` },
  swimming_pool: { w: 70, h: 50, draw: (x, y, w, h, s) =>
    `<rect class="fp-f-water${s?.water === 'filled' ? '' : ' empty'}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`
    + `<rect class="fp-f-detail" x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="2" fill="none"/>` },
  pool_loungers: { w: 8, h: 18, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>` },
  pool_pump: { w: 8, h: 7, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  plant_lr: { w: 7, h: 7, draw: (x, y, w, h) => plantSymbol(x, y, w, h) },
  plant_balcony: { w: 7, h: 7, draw: (x, y, w, h) => plantSymbol(x, y, w, h) },
  lamp_lr: { w: 6, h: 6, draw: (x, y, w, h) =>
    `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>` },
  // --- Utility / entry ---
  washer: { w: 11, h: 11, draw: (x, y, w, h) => applianceSymbol(x, y, w, h) },
  dryer: { w: 11, h: 11, draw: (x, y, w, h) => applianceSymbol(x, y, w, h) },
  laundry_hamper: { w: 8, h: 8, draw: (x, y, w, h) =>
    `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>` },
  doormat: { w: 12, h: 6, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>` },
  shoe_rack: { w: 12, h: 5, draw: (x, y, w, h) => shelfSymbol(x, y, w, h) },
  coat_rack: { w: 6, h: 6, draw: (x, y, w, h) =>
    `<circle class="fp-f" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 1}"/>` },
  // Player-placed decor (decor-economy plan Phase 2). A delivered and placed
  // item is an ordinary object in the room's bucket; for it to be "immediately
  // visible ... exactly as any other object in that room's bucket already is",
  // the shared symbol library has to know its defId. The catalog's defIds are
  // distinct from the base furniture's, so each is aliased to the base symbol
  // that draws the same piece — content, not a second render path. The rug is
  // new (nothing base draws a rug); its own entry lives below.
  rug: { w: 40, h: 26, draw: (x, y, w, h) =>
    `<rect class="fp-f-soft" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`
    + `<rect class="fp-f-detail" x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="2" fill="none"/>` },
};
const DECOR_SYMBOL_ALIASES = {
  sofa_basic: 'sofa', armchair: 'armchair', coffee_table: 'coffee_table_lr',
  tv_basic: 'tv', tv_stand: 'bookshelf', rug: 'rug', floor_lamp: 'lamp_lr',
  plant: 'plant_lr', bed_basic: 'bed', nightstand: 'nightstand',
  wardrobe: 'wardrobe', desk: 'desk', desk_chair: 'armchair',
  dining_table: 'dining_table', dining_chair: 'armchair',
  bookshelf: 'bookshelf', shelf: 'bookshelf',
};
for (const [defId, base] of Object.entries(DECOR_SYMBOL_ALIASES)) {
  if (!FP_FURNITURE[base] || FP_FURNITURE[defId]) continue;
  FP_FURNITURE[defId] = { ...FP_FURNITURE[base] };
}

// A room's name, sized and oriented to fit the room it names. Corridors are
// the reason this is not one line: Hallway A is 32 units wide and 185 tall,
// so a horizontal label at any readable size runs straight out of the room
// and across the bedroom next door. Real plans turn corridor labels on their
// side, so this does too.
function roomLabel(roomId, cx, cy) {
  const name = ROOMS[roomId]?.name || roomId;
  const rects = ROOM_LAYOUT[roomId] || [];
  if (rects.length === 0) return '';
  const [, , w, h] = rects.slice().sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const rotate = h > w * 1.8 && w < 70;
  const along = rotate ? h : w;
  // ~0.62 em per character at this weight; leave a little breathing room.
  const size = Math.max(6, Math.min(11, (along - 8) / (name.length * 0.62)));
  const attrs = `class="fp-room-label" x="${cx}" y="${cy}" style="font-size:${size.toFixed(1)}px"`;
  return rotate
    ? `<text ${attrs} transform="rotate(-90 ${cx} ${cy})">${escapeHtml(name)}</text>`
    : `<text ${attrs}>${escapeHtml(name)}</text>`;
}

function shelfSymbol(x, y, w, h) {
  return `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}"/>`
       + `<line class="fp-f-detail-l" x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}"/>`;
}
function sinkSymbol(x, y, w, h, dirty) {
  return `<rect class="fp-f${dirty ? ' dirty' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
       + `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="2"/>`;
}
function tableSymbol(x, y, w, h, s, o) {
  const laid = s?.clutter === 'cluttered' || (o && dishLevelOf(o) !== 'clean');
  return `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`
       + (laid ? `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 4}"/>` : '');
}
function plantSymbol(x, y, w, h) {
  return `<circle class="fp-f-plant" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 0.5}"/>`;
}
function applianceSymbol(x, y, w, h) {
  return `<rect class="fp-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`
       + `<circle class="fp-f-detail" cx="${x + w / 2}" cy="${y + h / 2}" r="3"/>`;
}

// --- Authored placements (Home Design Studio) ---
// A shape's parts are normalized to a 0..1 box, so drawing one is a single
// affine map: scale the parts by the placement's w/h, translate to its x/y,
// and rotate the whole group about its own centre. That is the entire reason
// a designed object can be dragged, resized and turned as ONE thing — every
// part is defined relative to the whole rather than pinned to the canvas.
function renderDesignShape(place) {
  const def = DESIGN_SHAPES[place.shape];
  if (!def) return '';
  const { x, y, w, h } = place;
  const rot = place.rot || 0;
  const variant = place.variant ? ` v-${place.variant}` : '';
  let out = rot
    ? `<g class="fp-prop${variant}" transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">`
    : `<g class="fp-prop${variant}">`;
  for (const p of def.parts) {
    const cls = `fp-p fp-p-${p.cls}`;
    if (p.kind === 'rect') {
      const rx = p.rx ? (p.rx * Math.min(w, h)).toFixed(2) : 0;
      out += `<rect class="${cls}" x="${(x + p.x * w).toFixed(2)}" y="${(y + p.y * h).toFixed(2)}"`
           + ` width="${(p.w * w).toFixed(2)}" height="${(p.h * h).toFixed(2)}" rx="${rx}"/>`;
    } else if (p.kind === 'ellipse') {
      out += `<ellipse class="${cls}" cx="${(x + p.cx * w).toFixed(2)}" cy="${(y + p.cy * h).toFixed(2)}"`
           + ` rx="${(p.rx * w).toFixed(2)}" ry="${(p.ry * h).toFixed(2)}"/>`;
    } else if (p.kind === 'line') {
      out += `<line class="${cls}" x1="${(x + p.x1 * w).toFixed(2)}" y1="${(y + p.y1 * h).toFixed(2)}"`
           + ` x2="${(x + p.x2 * w).toFixed(2)}" y2="${(y + p.y2 * h).toFixed(2)}"/>`;
    }
  }
  return out + '</g>';
}

// A designed room's contents. Returns null when the room has no authored
// design, which is the signal to fall back to the automatic layout — a room
// is either designed or auto-arranged, never a confusing half of each.
function renderAuthoredDecor(gs, roomId) {
  const decor = (typeof ROOM_DECOR !== 'undefined' && ROOM_DECOR[roomId]) || null;
  if (!decor || decor.length === 0) return null;
  let out = '<g class="fp-furniture">';
  for (const place of decor) {
    if (typeof decorVisible === 'function' && !decorVisible(place, gs)) continue;
    out += renderDesignShape(place);
  }
  return out + '</g>';
}

// Lay a room's furniture around the inside of its largest rectangle, walking
// the perimeter. The FALLBACK for rooms nobody has designed yet: 19 rooms
// times a dozen objects is 200-odd coordinates, and auto-placement means an
// undesigned room still reads as furnished rather than as an empty box.
// A room with a ROOM_DECOR entry uses that instead — see renderAuthoredDecor.
function renderRoomFurniture(gs, roomId) {
  const authored = renderAuthoredDecor(gs, roomId);
  if (authored !== null) return authored;
  return renderAutoFurniture(gs, roomId);
}

function renderAutoFurniture(gs, roomId) {
  const rects = ROOM_LAYOUT[roomId] || [];
  if (rects.length === 0) return '';
  const bucket = gs.objects?.[`room_${roomId}`] || {};
  const items = Object.values(bucket)
    .filter(o => FP_FURNITURE[o.defId])
    .sort((a, b) => {
      const A = FP_FURNITURE[a.defId], B = FP_FURNITURE[b.defId];
      return (B.w * B.h) - (A.w * A.h);   // biggest first: they claim the good walls
    });
  if (items.length === 0) return '';

  // The largest rect is the room's body; the notch on an L-shape is left
  // empty rather than half-filled with a bed that overlaps a wall.
  const [rx, ry, rw, rh] = rects.slice().sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const inset = 3;
  let out = '<g class="fp-furniture">';
  // Four walls' worth of slots, each tracking how far along it is filled.
  const walls = [
    { cursor: rx + inset, limit: rx + rw - inset, place: (d, fw, fh) => [d, ry + inset] },                  // top
    { cursor: ry + inset, limit: ry + rh - inset, place: (d, fw, fh) => [rx + rw - inset - fw, d] },        // right
    { cursor: rx + inset, limit: rx + rw - inset, place: (d, fw, fh) => [d, ry + rh - inset - fh] },        // bottom
    { cursor: ry + inset, limit: ry + rh - inset, place: (d, fw, fh) => [rx + inset, d] },                  // left
  ];
  let wi = 0;
  for (const obj of items) {
    const def = FP_FURNITURE[obj.defId];
    // Rotate the footprint to lie along the wall it is going on.
    const along = (wi % 2 === 0);
    const fw = along ? def.w : def.h;
    const fh = along ? def.h : def.w;
    let placed = false;
    for (let tries = 0; tries < 4 && !placed; tries++) {
      const wall = walls[wi % 4];
      const span = along ? fw : fh;
      if (wall.cursor + span <= wall.limit) {
        const [fx, fy] = wall.place(wall.cursor, fw, fh);
        out += def.draw(fx, fy, fw, fh, obj.state || {}, obj);
        wall.cursor += span + 2;
        placed = true;
      }
      wi++;
    }
    if (!placed) break;   // room is full; the rest simply are not drawn
  }
  return out + '</g>';
}

// One avatar marker. Created by the static pass with NO meaningful position —
// renderFloorPlanLive owns placement and mutates transform/class attributes
// per frame (D12). `id === 'player'` is the player's marker; everyone else is
// an NPC. The portrait image fills in later and only from cache — see
// hydrateFloorPlanAvatars for why this never triggers generation.
// `plausible` is derivePlausibleActivity's result (or null): the caption it
// carries is what the player could plausibly know (Phase 2, D10). The PLAYER
// marker's caption is the Phase 5 clothing line instead (what you have on is
// the one thing you always know about yourself).
function avatarMarkerHtml(id, isPlayer, npc, plausible) {
  const label = isPlayer ? 'You' : initialsFor(npc);
  let cls = 'fp-avatar';
  if (isPlayer) cls += ' is-player';
  if (plausible) cls += ` plausible-${plausible.tier}`;
  let caption = '';
  if (plausible) {
    caption = `<text class="fp-avatar-activity" x="0" y="17">${escapeHtml(plausibleCaption(plausible.label))}</text>`;
  } else if (isPlayer) {
    const pc = playerFloorCaption(npc);
    if (pc) caption = `<text class="fp-avatar-activity" x="0" y="17">${escapeHtml(plausibleCaption(pc))}</text>`;
  }
  return `<g class="${cls}" data-avatar-id="${id}" transform="translate(0,0)">`
    + `<circle class="fp-avatar-bg" cx="0" cy="0" r="9"/>`
    + `<image class="fp-avatar-img" data-avatar-for="${id}" x="-9" y="-9" width="18" height="18" clip-path="url(#fp-clip-${id})" href="" hidden="hidden"/>`
    + `<text class="fp-avatar-initials" data-initials-for="${id}" x="0" y="3">${escapeHtml(label)}</text>`
    + `<circle class="fp-avatar-ring" cx="0" cy="0" r="9"/>`
    + caption
    + '</g>';
}

// The player's own clothing as a short floor-plan caption ("wrapped in a
// towel", "in your swimsuit") — the positional-awareness layer shows what you
// have on, the one thing it is always honest about. Only when notable.
function playerFloorCaption(player) {
  const c = player?.clothing;
  if (c && c !== 'dressed') {
    const phrase = CLOTHING_STATE_SCENE_TEXT[c];
    if (phrase) return phrase;
  }
  if (player?.outfit?.swimwear && CLOTHING_DEFS[player.outfit.swimwear]) {
    return 'in your swimsuit';
  }
  return null;
}

// The player panel's "Wearing" stat value — the same information as the
// floor-plan caption, phrased for a stat row (a towel, the swimsuit, or a
// short list of the notable pieces).
function playerWearingLabel(player) {
  const c = player?.clothing;
  if (c && c !== 'dressed') {
    const phrase = CLOTHING_STATE_SCENE_TEXT[c];
    if (phrase) return phrase;
  }
  const worn = Object.values(player?.outfit || {})
    .map(id => CLOTHING_DEFS[id]?.label)
    .filter(Boolean);
  if (worn.length === 0) return 'everyday clothes';
  return worn.length <= 3 ? worn.join(', ') : `${worn.slice(0, 3).join(', ')}, …`;
}

// A caption short enough to sit under a 16-unit avatar without running across
// the neighbour's circle — a full activity string can be long ("following a
// bad smell"), and the plan is a map, not a dossier.
function plausibleCaption(label) {
  const MAX = 22;
  return label.length <= MAX ? label : label.slice(0, MAX - 1).trim() + '…';
}

// Where a marker belongs right now: npc.pos when the NPC has one (the walk
// integrator keeps it current, and reconcileNpcPos keeps it in step with
// tick-teleports), else their room's centroid. Off-map NPCs are hidden. A
// mid-walk NPC reads as in transit; a sleeper is dimmed.
function floorPlanAvatarPlacement(gs, id, npc) {
  const isPlayer = id === 'player';
  const loc = isPlayer ? (gs.player?.location || null) : (npc?.location || null);
  if (!loc || !ROOMS[loc]) return { x: 0, y: 0, offMap: true, sleeping: false, transit: false };
  let x, y;
  if (!isPlayer && npc?.pos && Number.isFinite(npc.pos.x) && Number.isFinite(npc.pos.y)) {
    x = npc.pos.x; y = npc.pos.y;
  } else {
    const [cx, cy] = roomCentre(loc);
    x = cx; y = cy;
  }
  return {
    x, y, offMap: false,
    sleeping: !isPlayer && (npc.activity === 'sleeping' || npc.activity === 'sleep'),
    transit: !isPlayer && (!!npc.transit || !!npc.walk),
  };
}

// The per-frame live loop (D12). Direct attribute mutation only — never
// innerHTML — so it can run every rAF alongside the clock (clockFrame) at a
// fixed small cost while the static layer sits untouched. This is the ONLY
// per-frame touch of the floor plan. Every live container (sidebar + large
// overlay) gets the same transform/class mutations.
function renderFloorPlanLive(gs) {
  const containers = floorPlanContainers();
  if (containers.length === 0) return;
  for (const container of containers) {
    const markers = container.querySelectorAll('.fp-people [data-avatar-id]');
    if (markers.length === 0) continue;
    for (const m of markers) {
      const id = m.getAttribute('data-avatar-id');
      const npc = id === 'player' ? null : (gs.npcs && gs.npcs[id]);
      const p = floorPlanAvatarPlacement(gs, id, npc);
      m.setAttribute('transform', `translate(${p.x},${p.y})`);
      if (p.offMap) m.setAttribute('hidden', '');
      else m.removeAttribute('hidden');
      m.classList.toggle('is-sleeping', p.sleeping);
      m.classList.toggle('is-transit', p.transit);
    }
  }
}

function initialsFor(npc) {
  const name = npc?.bible?.name || '';
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

// Fill in avatar art from the image cache ONLY — never by generating.
// A floor plan redraws on essentially every interaction, and kicking off a
// portrait generation from a render pass would spend real quota every time
// somebody walked into a room. Portraits reach the cache through the surfaces
// that legitimately generate them (the character studio, NPC portraits); this
// picks them up for free once they exist and shows initials until then.
// Phase 4: iterates every NPC (not just the present ones) because the live
// layer keeps markers for the whole cast on the plan.
async function hydrateFloorPlanAvatars(gs) {
  if (typeof getCachedImage !== 'function') return;
  for (const [id, npc] of Object.entries(gs.npcs || {})) {
    if (!npc?.bible?.genSeed) continue;
    const key = composeCharKey(npc, 'neutral', 'standing');
    try {
      const blob = await getCachedImage(key);
      if (!blob) continue;
      const url = createObjectUrl(key, blob);
      for (const img of document.querySelectorAll(`[data-avatar-for="${id}"]`)) {
        img.setAttribute('href', url);
        img.removeAttribute('hidden');
      }
      for (const t of document.querySelectorAll(`[data-initials-for="${id}"]`)) t.setAttribute('hidden', 'hidden');
    } catch (e) { /* cache miss is the normal case, not an error */ }
  }
}

// --- Full floor plan overlay (desktop legibility) ---
// The sidebar map is ~240px of 19 rooms — labels illegible at that scale. The
// overlay renders the same map large (floorPlanContainers keeps both maps
// live) with zoom controls. Open/close/zoom ride the data-action chain; a
// click on the dark stage or Escape closes it too (see attachEventHandlers).

function openFloorPlanOverlay() {
  const overlay = document.getElementById('floorplan-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  // Open zoomed on the player's room, not fit-to-screen: the sidebar map is
  // already the whole-plan overview, and the point of the overlay is to READ
  // the rooms. Fit (scale 1) is one click away for the bird's-eye view.
  const box = overlay.querySelector('.floorplan-overlay-box');
  if (box) box.style.setProperty('--fp-scale', '1.4');
  // Re-render so the large map exists, then land on where the player is —
  // the overlay opens on the action, not on the title screen.
  if (currentGameState) {
    renderFloorPlan(currentGameState);
    centerFloorPlanOn(currentGameState.player.location);
  }
}

function closeFloorPlanOverlay() {
  const overlay = document.getElementById('floorplan-overlay');
  if (overlay) overlay.hidden = true;
}

// Zoom the large map, keeping whatever was at the viewport centre in place.
function floorPlanZoom(factor) {
  const box = document.querySelector('#floorplan-overlay .floorplan-overlay-box');
  const body = document.getElementById('floorplan-overlay-body');
  if (!box || !body) return;
  const cur = parseFloat(box.style.getPropertyValue('--fp-scale')) || 1;
  const next = Math.min(3.5, Math.max(0.6, cur * factor));
  if (next === cur) return;
  const cx = body.scrollLeft + body.clientWidth / 2;
  const cy = body.scrollTop + body.clientHeight / 2;
  box.style.setProperty('--fp-scale', String(next));
  const ratio = next / cur;
  body.scrollLeft = cx * ratio - body.clientWidth / 2;
  body.scrollTop = cy * ratio - body.clientHeight / 2;
}

function floorPlanZoomReset() {
  const box = document.querySelector('#floorplan-overlay .floorplan-overlay-box');
  if (box) box.style.setProperty('--fp-scale', '1');
  if (currentGameState) centerFloorPlanOn(currentGameState.player.location);
}

// Scroll the large map so a room's centre sits in the middle of the viewport
// (used when the overlay opens / on Fit, so the player lands on their room).
function centerFloorPlanOn(roomId) {
  const body = document.getElementById('floorplan-overlay-body');
  const svg = document.querySelector('#floor-plan-large svg');
  if (!body || !svg || !svg.viewBox) return;
  const [cx, cy] = typeof roomCentre === 'function' ? roomCentre(roomId) : [0, 0];
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;
  body.scrollLeft = cx * (svg.clientWidth / vb.width) - body.clientWidth / 2;
  body.scrollTop = cy * (svg.clientHeight / vb.height) - body.clientHeight / 2;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// --- Player panel ---
function renderPlayerPanel(gs) {
  const stats = document.getElementById('pp-stats');
  if (!stats) return;
  const { player } = gs;

  stats.innerHTML = '';
  // Day/Time duplicate the header's own clock — deliberate: on mobile the
  // header hides everything but Room to make room for it (see the
  // @media (max-width: 900px) block), so this sidebar panel becomes the
  // only place that info is visible at all, not just a secondary copy.
  const items = [
    { label: 'Day', val: formatDate(gs.meta.clock.day) },
    { label: 'Time', val: formatTime(gs.meta.clock.minutes) },
    { label: 'Money', val: `${player.money}` },
    { label: 'Energy', val: `${Math.round(player.energy)}%` },
    // food-overhaul Phase 2 (D3/D4): the Hunger row keeps its familiar % and
    // gains the fullness prose; the daily kcal ledger and the living
    // metabolic rate get their own rows so the feature is visible at a
    // glance, not hidden in a tooltip.
    { label: 'Hunger', val: `${Math.round(player.hunger)}%` },
    { label: 'Fullness', val: fullnessStatusText(player, gs) },
    { label: 'Kcal today', val: `${Math.round(player.meta?.kcalToday || 0)} in · ${Math.round(player.meta?.kcalBurnedToday || 0)} burned` },
    { label: 'Metabolism', val: `×${Math.round(metabolicRate(player, gs) * 100) / 100}` },
    { label: 'Mood', val: moodLabel(player.mood) },
    // Intimacy & Voyeurism Phase 5 (D11): what you have on — the wardrobe
    // panel edits it, and this stat makes it visible at a glance (a towel
    // after the shower, the swimsuit you changed into, your everyday fit).
    { label: 'Wearing', val: playerWearingLabel(player) },
    // Intimacy & Voyeurism Phase 8 (D9): desire is a real need — shown as a
    // plain stat in the panel alongside the footer bar. Additive default for
    // old saves, same as the strip.
    { label: 'Desire', val: `${Math.round(typeof player.desire === 'number' ? player.desire : DESIRE.player.start)}%` },
  ];
  // Phase 8: show alarm and burnout status if active.
  if (player.alarm !== null && player.alarm !== undefined) {
    items.push({ label: 'Alarm', val: formatHour12(player.alarm) });
  }
  const burnoutLevel = player.burnout?.burnoutLevel || 0;
  if (burnoutLevel > 0.01) {
    const pct = Math.round(burnoutLevel * 100);
    items.push({ label: 'Burnout', val: `${pct}%` });
  }
  for (const item of items) {
    const div = document.createElement('div');
    div.className = 'pp-stat';
    div.textContent = `${item.label}: ${item.val}`;
    stats.appendChild(div);
  }
}

// --- Scene image ---
// Shared scene-art context (D17): everything renderScene needs to draw the
// backdrop AND everything the ⓘ info modal (ui.js) needs to describe or
// reroll it, computed once. The scene key and prompt get stamped onto the
// module vars below so the modal can show the exact prompt that produced
// the current frame and force a reroll under the SAME cache key (IMAGE's
// rerollSceneImage recomputes the context through this helper again).
let currentSceneArtPrompt = '';
let currentSceneArtKey = '';
let currentSceneArtSeed = null;
// character-cutout-scene-rendering-plan Phase 3: `sceneKey` is now the PLATE
// key — the backdrop is people-free (D6), and the cast is drawn as separate
// cutout layers on top of it (D1). The name `sceneKey` is kept because it is
// still "the cache key of the image displayed as the scene backdrop", which
// is exactly what its two outside consumers (ui.js's currentSceneKey → the
// save thumbnail, and rerollSceneImage) mean by it. `overlay` is the layer
// plan (D10) the cutout renderer diffs against.
function sceneArtContext(gs, sceneState) {
  const roomId = gs.player.location;
  const phase = gs.meta.clock.phase;
  // npc objects (currentGameState.npcs[id]) never carry their own id — it
  // only ever exists as the map key — so anything downstream that needs to
  // identify them gets the id attached here, at the one call site that has
  // it, rather than changing IMAGE's function signatures.
  const activeNpcs = (sceneState?.active || [])
    .map(id => (gs.npcs[id] ? { ...gs.npcs[id], id } : null))
    .filter(Boolean);
  // The room's objects are needed BEFORE the key: a laid table is part of
  // what makes this plate this plate (sceneDetailSignature), so the key has
  // to see it or the dining room would keep serving its cached empty-table
  // art through dinner.
  const roomObjects = gs.objects?.[`room_${roomId}`];
  const sceneKey = plateKey(roomId, phase, sceneDetailSignature(roomObjects), imageStyleToken());
  // The prompt is exactly what IMAGE feeds generateImage (style-applied),
  // so the info modal's text matches the pixels byte for byte. D11: this
  // now describes the PLATE — rerolling replaces the backdrop, never the
  // cutouts.
  const prompt = applyImageStyle(buildBackgroundPrompt(roomId, phase, roomObjects));
  const seed = composePlateSeed(sceneKey);
  const overlay = layoutSceneCutouts(gs, sceneState, sceneKey);
  return { roomId, phase, activeNpcs, roomObjects, sceneKey, prompt, seed, overlay };
}

function renderScene(gs, sceneState) {
  const img = document.getElementById('scene-img');
  const label = document.getElementById('scene-label');
  if (!img) return;
  const ctx = sceneArtContext(gs, sceneState);
  const roomId = ctx.roomId;
  const phase = ctx.phase;

  if (label) label.textContent = `${ROOMS[roomId]?.name || roomId} — ${CLOCK.phaseNames[phase] || phase}`;

  // D17: stamp the ⓘ affordance's data and reveal the button. The scene
  // reader renders separately, so this is the one place that knows what the
  // current art IS.
  currentSceneArtPrompt = ctx.prompt;
  currentSceneArtKey = ctx.sceneKey;
  currentSceneArtSeed = ctx.seed;
  const infoBtn = document.getElementById('scene-info-btn');
  if (infoBtn) infoBtn.hidden = false;

  // Cutouts are diffed on EVERY render (design invariant 2 lives inside
  // renderSceneCutouts' own per-layer diff, not here): the cast can change
  // without the plate changing at all — that is the entire point of the
  // plate/cutout split — so this must not sit behind the plate's
  // idempotency gate below.
  renderSceneCutouts(gs, ctx);

  // Idempotent: only touch the PLATE (placeholder swap + async fetch) when
  // the plate key actually changed. Re-stamping data-loading and swapping
  // to the placeholder on every render() call — including calls where
  // nothing about the scene changed — flickered the image after every
  // single action. A cutout-only change must never re-stamp it either.
  if (img.getAttribute('data-scene-key') === ctx.sceneKey) return;
  img.setAttribute('data-scene-key', ctx.sceneKey);

  // Show placeholder immediately
  img.setAttribute('data-loading', '');
  img.src = getPlaceholder();

  // Generate the plate async. roomObjects (WORLD) drives the room-specific
  // detail phrase in the prompt — note the plate cache key still doesn't
  // reflect ORDINARY object state, so a room getting dirtier won't by itself
  // trigger new art; that's a deliberate deferral (regenerating art on
  // every state change would be expensive), not an oversight. A laid table is
  // the one exception, because it is a thing the player did on purpose and
  // the scene is about it.
  getScenePlate(roomId, phase, ctx.roomObjects).then(result => {
    if (img.getAttribute('data-scene-key') !== ctx.sceneKey) return; // scene moved on before this resolved
    if (result.url) img.src = result.url;
    img.removeAttribute('data-loading'); // D12: plate failure degrades to the placeholder, never a blocked render
  });
}

// --- Cutout layers (character-cutout-scene-rendering-plan, D1/D9/D10/D12) ---
// Diffs the LIVE layer set against the desired one rather than rebuilding
// it: an existing layer gets its CSS vars updated (so the .scene-cutout
// transition animates the move, D9), a new layer is created and faded in
// when its cutout resolves, and a stale layer is removed. Rebuilding would
// restart every transition and re-request every cutout on every render.
//
// D12: nothing here can block or fail the scene. A cutout that fails to
// generate leaves its layer hidden (.cutout-missing) and the scene reader
// still narrates that character normally.
function renderSceneCutouts(gs, ctx) {
  const host = document.getElementById('scene-cutouts');
  if (!host) return;
  const overlay = ctx.overlay || [];

  const desired = new Map();
  for (const p of overlay) {
    const who = p.isPlayer ? gs.player : gs.npcs[p.charId];
    if (!who) continue;
    const identity = cutoutIdentityToken(who, p.isPlayer);
    desired.set(cutoutKey(identity, p.pose, p.expression, cutoutOutfitToken(who), imageStyleToken()), { placement: p, who });
  }

  for (const layer of [...host.children]) {
    if (!desired.has(layer.getAttribute('data-cutout-key'))) layer.remove();
  }

  for (const [key, { placement, who }] of desired) {
    let layer = host.querySelector(`[data-cutout-key="${CSS.escape(key)}"]`);
    if (!layer) {
      layer = document.createElement('img');
      layer.className = 'scene-cutout';
      layer.alt = '';
      layer.setAttribute('data-cutout-key', key);
      host.appendChild(layer);
      const fetch = placement.isPlayer
        ? getPlayerCutout(who, placement.pose, placement.expression)
        : getCharacterCutout(who, placement.pose, placement.expression);
      fetch.then(result => {
        if (!layer.isConnected) return; // scene moved on before this resolved
        if (!result.url) { layer.classList.add('cutout-missing'); return; }
        layer.src = result.url;
        layer.decode().catch(() => {}).then(() => {
          if (layer.isConnected) layer.setAttribute('data-ready', '');
        });
      });
    }
    placeSceneCutout(host, layer, placement);
  }
}

// The fraction→pixel conversion the .scene-cutout rule's --cutout-x/-y
// expect. It lives here rather than in CSS because a percentage inside
// transform: translate() resolves against the LAYER's own box, not its
// parent's — so placing a variable-width layer at a fraction of the PLATE
// is only expressible in JS.
function placeSceneCutout(host, layer, placement) {
  const w = host.clientWidth || 0;
  const h = host.clientHeight || 0;
  layer.style.setProperty('--cutout-x', `${placement.xFrac * w}px`);
  layer.style.setProperty('--cutout-y', `${-placement.bottomFrac * h}px`);
  layer.style.setProperty('--cutout-scale', String(placement.scale));
  layer.style.zIndex = String(placement.z);
}

// The pixel offsets above are computed from #scene-cutouts' rendered size,
// so a viewport change invalidates every one of them. Re-placing is pure
// arithmetic over the layers already in the DOM — no refetch, no diff.
window.addEventListener('resize', () => {
  const host = document.getElementById('scene-cutouts');
  if (!host || host.children.length === 0) return;
  if (!currentGameState || !currentSceneState) return;
  const ctx = sceneArtContext(currentGameState, currentSceneState);
  for (const p of ctx.overlay || []) {
    const who = p.isPlayer ? currentGameState.player : currentGameState.npcs[p.charId];
    if (!who) continue;
    const key = cutoutKey(cutoutIdentityToken(who, p.isPlayer), p.pose, p.expression, cutoutOutfitToken(who), imageStyleToken());
    const layer = host.querySelector(`[data-cutout-key="${CSS.escape(key)}"]`);
    if (layer) placeSceneCutout(host, layer, p);
  }
});

// --- Status strip: prominent need bars in the footer ---
// Compact one-row status display: icon + bar + percentage per need.
// Mood lives on [-1,1] natively but is remapped to 0-100% for display.
// Intimacy & Voyeurism Phase 8: desire joins the row as a real need; old
// saves lack the field and read as DESIRE.player.start until the first
// decayPlayerNeeds span writes it (additive default, no migration).
function renderStatusStrip(gs) {
  const row = document.getElementById('footer-status-row');
  if (!row) return;
  const { player } = gs;
  const needMap = {
    energy: player.energy,
    hunger: player.hunger,
    hygiene: player.hygiene,
    mood: player.mood,
    desire: typeof player.desire === 'number' ? player.desire : DESIRE.player.start,
  };
  for (const [need, val] of Object.entries(needMap)) {
    const item = row.querySelector(`.fsi[data-need="${need}"]`);
    if (!item) continue;
    const fill = item.querySelector('.fsi-bar > .fill');
    const pctEl = item.querySelector('.fsi-pct');
    const displayPct = need === 'mood' ? (val + 1) * 50 : val;
    const bucket = Math.round(Math.max(0, Math.min(100, displayPct)) / 5) * 5;
    if (fill) fill.setAttribute('data-fill', bucket);
    if (pctEl) pctEl.textContent = Math.round(displayPct) + '%';
    // food-overhaul Phase 2 (D3): the hunger bar's tooltip carries the
    // fullness prose ("Satisfied — that meal is still holding") and the
    // deficit-day energy hint, so the strip stays compact while the new
    // meaning of the number is one hover away.
    if (need === 'hunger') {
      item.title = fullnessStatusText(player, gs);
      // 2026-08-20 (playtest feedback): the fullness prose was only a
      // tooltip — invisible unless hovered. Surface the band label on the
      // bar itself so "why am I hungry again?" is answered at a glance
      // instead of by the mystery number.
      const bandEl = item.querySelector('.fsi-band');
      if (bandEl) bandEl.textContent = hungerBand(player.fullnessRemainingHours ?? 0, player.fullnessWindowHours ?? HUNGER_RHYTHM.starveHours).label;
    }
    // Desire's tuning lives in DESIRE (its own block), not NEEDS — the strip
    // is the one reader that would otherwise need a second tuning home.
    const warnBelow = need === 'desire' ? DESIRE.player.warnBelow : NEEDS[need].warnBelow;
    const criticalBelow = need === 'mood' ? -0.8 : 5;
    if (val < criticalBelow) { item.setAttribute('data-critical', ''); item.setAttribute('data-low', ''); }
    else if (val < warnBelow) { item.setAttribute('data-low', ''); item.removeAttribute('data-critical'); }
    else { item.removeAttribute('data-low'); item.removeAttribute('data-critical'); }
  }
}

// --- Present list (right sidebar) ---
function renderPresentList(gs, sceneState) {
  const container = document.getElementById('present-list');
  if (!container) return;
  container.innerHTML = '';

  const roomId = gs.player.location;
  const presentNpcIds = getPresentNpcIds(gs.npcs, roomId);
  const activeSet = new Set(sceneState?.active || []);
  const tpl = document.getElementById('tpl-npc-card');

  if (presentNpcIds.length === 0) {
    container.innerHTML = '<span class="dim tiny">No one else here.</span>';
    return;
  }

  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector('.npc-card');
    card.setAttribute('data-npc-id', npcId);
    card.setAttribute('data-status', activeSet.has(npcId) ? 'active' : 'ambient');
    card.querySelector('.npc-name').textContent = npc.bible.name || 'Unknown';
    // NPC Overhaul Phase 3.6 — show relationship phase
    const phaseEl = card.querySelector('.npc-phase');
    if (phaseEl) {
      const phase = npc.relPlayer?.conversationPhase || 'early';
      phaseEl.textContent = phase;
      phaseEl.setAttribute('data-phase', phase);
    }
    // Intimacy & Voyeurism Phase 12 (D12): couples report status on their
    // cards. Reads the world.relationships store (NPC↔NPC, not relPlayer) —
    // a present NPC who is seeing/committed to someone shows it here.
    const rel = relationshipSummaryForNpc(gs, npcId);
    if (rel) {
      const relEl = card.querySelector('.npc-rel');
      if (relEl) {
        relEl.textContent = rel.status === 'committed' ? `♥ with ${rel.partnerName}` : `♥ seeing ${rel.partnerName}`;
        relEl.setAttribute('data-status', rel.status);
      }
    }
    card.querySelector('.npc-mood').textContent = `Mood: ${moodLabel(npc.mood)}`;
    card.querySelector('.npc-activity').textContent = npc.activity || '';
    container.appendChild(node);
  }
}

// --- Quest list ---
function renderQuestList(gs) {
  const container = document.getElementById('quest-list');
  if (!container) return;
  const quests = gs.world.quests || { active: [], completed: [] };
  container.innerHTML = '';

  if (quests.active.length === 0) {
    container.innerHTML = '<span class="dim tiny">No active goals.</span>';
    return;
  }

  const tpl = document.getElementById('tpl-quest-item');
  for (const q of quests.active) {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.q-title').textContent = q.title || 'Untitled';
    // For chain quests, show step progress
    if (q.type === 'chain' && q.steps) {
      const done = q.steps.filter(s => s.done).length;
      node.querySelector('.q-desc').textContent = `[${done}/${q.steps.length}] ${q.desc || q.steps[q.currentStep]?.desc || ''}`;
    } else {
      node.querySelector('.q-desc').textContent = q.desc || '';
    }
    container.appendChild(node);
  }
}

// --- Inventory (overhaul Phase 1): compact sidebar summary + full panel ---
// The sidebar section summarises ("8 items · 3 kinds") with an Open Bag
// button; real browsing happens in the #inventory-panel overlay — grouped
// list left, detail pane right, search + sort on top. Every verb emits
// effect-DSL lines through the data-action chain (UI) and costs game time
// via advanceAndResolveMinutes; nothing here mutates a stack list
// directly (design invariant 2).
let invpSearchText = '';
let invpSortMode = 'group';
let invpSelectedDefId = null;

function renderInventory(gs) {
  renderInventorySummary(gs);
  renderInventoryPanel(gs);
  renderContainerPanel(gs);
}

function renderInventorySummary(gs) {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  const inv = gs.player.inventory || [];
  const distinct = inv.length;
  const total = inv.reduce((s, i) => s + (i?.qty || 0), 0);
  container.innerHTML = '';
  if (total === 0) {
    container.innerHTML = '<span class="dim tiny">Empty pockets.</span>';
    return;
  }
  const span = document.createElement('span');
  span.className = 'dim tiny';
  span.textContent = `${total} item${total === 1 ? '' : 's'} · ${distinct} kind${distinct === 1 ? '' : 's'}`;
  container.appendChild(span);
}

function renderInventoryPanel(gs) {
  const panel = document.getElementById('inventory-panel');
  const listEl = document.getElementById('invp-list');
  if (!panel || !listEl) return;
  if (panel.hidden) return;

  // Live values from the search/sort controls (kept in sync by UI's
  // input/change listeners; read here so render() never owns the inputs'
  // state and can't fight the user mid-typing).
  const search = document.getElementById('invp-search');
  const sort = document.getElementById('invp-sort');
  if (search && search.value !== invpSearchText) invpSearchText = search.value;
  if (sort) invpSortMode = sort.value;

  const inv = gs.player.inventory || [];
  let stacks = filterStacks(inv, invpSearchText);
  const grouped = invpSortMode === 'group';
  if (!grouped) stacks = sortStacks(stacks, invpSortMode, gameDaysNow(gs.meta.clock));

  // Selection: keep the previously selected defId while still visible,
  // otherwise fall back to the first filtered stack.
  let selected = null;
  if (invpSelectedDefId) selected = stacks.find(s => s.defId === invpSelectedDefId) || null;
  if (!selected) selected = stacks[0] || null;
  invpSelectedDefId = selected?.defId || null;

  listEl.innerHTML = '';
  const rowTpl = document.getElementById('tpl-inv-row');
  if (grouped) {
    for (const group of groupStacks(stacks)) {
      const header = document.createElement('div');
      header.className = 'invp-group-header';
      header.textContent = group.label;
      const count = document.createElement('span');
      count.className = 'invp-group-count';
      count.textContent = `${group.stacks.reduce((s, x) => s + (x.qty || 1), 0)} item${group.stacks.length === 1 ? '' : 's'}`;
      header.appendChild(count);
      listEl.appendChild(header);
      for (const stack of group.stacks) appendInventoryRow(listEl, rowTpl, stack, gs);
    }
  } else {
    for (const stack of stacks) appendInventoryRow(listEl, rowTpl, stack, gs);
  }
  if (stacks.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dim tiny invp-empty';
    empty.textContent = inv.length === 0 ? 'Your pockets are empty.' : 'Nothing matches your search.';
    listEl.appendChild(empty);
  }
  const summary = document.getElementById('invp-summary');
  if (summary) {
    const totalItems = inv.reduce((s, i) => s + (i?.qty || 0), 0);
    const money = gs.player?.money;
    summary.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'} · ${inv.length} kind${inv.length === 1 ? '' : 's'}` + (typeof money === 'number' ? ' · $' + money.toLocaleString() : '');
  }
  renderInventoryDetail(gs, selected);
}

// --- Inventory glow-up helpers -----------------------------------------
// Icon, badges and stat block for the inventory rows/detail. All pure: given
// a stack/def/state they return DOM-ready data, so the panel never mutates
// the inventory to style itself.
const INV_ICON_BY_ID = {
  apartment_keys: '🔑', wallet: '👛', id_card: '🪪', phone: '📱', mp3_player: '🎧', headphones: '🎧',
  eggs: '🥚', milk: '🥛', cheese: '🧀', butter: '🧈', bacon: '🥓', lettuce: '🥬', tomato: '🍅', onion: '🧅', garlic: '🧄', potatoes: '🥔',
  bread: '🍞', pasta_dry: '🍝', tomato_sauce: '🍅', rice: '🍚', cereal: '🥣', flour: '🌾', sugar: '🍬', oil: '🫗', salt: '🧂', spices: '🌶️',
  coffee_beans: '☕', tea_bags: '🍵', frozen_pizza: '🍕', comfort_ice_cream: '🍨', chicken_raw: '🍗', ground_beef: '🥩',
  meal_pasta: '🍝', meal_omelette: '🍳', meal_stirfry: '🥘', meal_sandwich: '🥪', meal_breakfast: '🍳', meal_burger: '🍔',
  meal_salad: '🥗', meal_fried_rice: '🍚', meal_soup: '🍲', meal_potato: '🥔', cooked_meal: '🍲',
};
const INV_ICON_BY_SLOT = { top: '👕', bottom: '👖', outerwear: '🧥', shoes: '👟', socks: '🧦', underwear: '🩲', swimwear: '🩱', accessory: '🕶️' };
const INV_ICON_BY_GROUP = {
  food: '🍲', drink: '🥤', clothing: '👕', comfort: '🕯️', hobby: '🎮', gift: '🎁',
  cleaning: '🧽', toiletry: '🧴', medication: '💊', gear: '🧰', key: '🔑', junk: '📦', other: '📦',
};
function inventoryIcon(def) {
  if (!def) return '📦';
  if (INV_ICON_BY_ID[def.id]) return INV_ICON_BY_ID[def.id];
  if (def.slot) return INV_ICON_BY_SLOT[def.slot] || '👕';
  if (def.id.startsWith('dish_')) return '🥡';
  if (def.sortGroup === 'food') {
    if (def.category === 'snack') return '🍫';
    if (def.category === 'ingredient') return '🥕';
    if (def.category === 'drink') return '🥤';
    return '🍲';
  }
  if (def.sortGroup === 'drink') return '🥤';
  return INV_ICON_BY_GROUP[def.sortGroup] || '📦';
}
const CLOTHING_STAT_LABELS = { attraction: 'Attraction', comfort: 'Comfort', modesty: 'Modesty', thermal: 'Warmth', reveal: 'Reveal' };
function inventoryRowTags(stack, def, gs) {
  const tags = [];
  if (!!(stack?.meta?.keyItem || def.keyItem)) tags.push({ kind: 'key', label: 'Key' });
  if (gs?.player?.outfit && Object.values(gs.player.outfit).includes(def.id)) tags.push({ kind: 'worn', label: 'Worn' });
  if (stack?.meta?.frozen?.frozenAtAbs != null) tags.push({ kind: 'frozen', label: 'Frozen' });
  return tags;
}
function inventoryRowSublabel(stack, def) {
  const group = SORT_GROUPS[def.sortGroup]?.label || def.category || 'Item';
  if (def.slot) return WARDROBE_SLOT_LABELS[def.slot] || def.slot;
  return group;
}
function inventoryStatRows(stack, def) {
  if (!def.slot || !def.stats) return [];
  return Object.entries(CLOTHING_STAT_LABELS)
    .filter(([key]) => (def.stats[key] ?? 0) > 0)
    .map(([key, label]) => ({ key, label, value: Math.round((def.stats[key] ?? 0) * 100) }));
}

function appendInventoryRow(container, tpl, stack, gs) {
  const node = tpl.content.cloneNode(true);
  const row = node.querySelector('.invp-row');
  row.setAttribute('data-def-id', stack.defId);
  if (invpSelectedDefId === stack.defId) row.setAttribute('data-selected', '');
  const d = describeStack(stack, { day: gameDaysNow(gs.meta.clock) });
  const def = stackDef(stack);
  node.querySelector('.invp-row-icon').textContent = inventoryIcon(def);
  node.querySelector('.invp-row-name').textContent = d.label;
  node.querySelector('.invp-row-qty').textContent = `×${d.qty}`;
  node.querySelector('.invp-row-sublabel').textContent = inventoryRowSublabel(stack, def);
  const tagsEl = node.querySelector('.invp-row-tags');
  for (const t of inventoryRowTags(stack, def, gs)) {
    const chip = document.createElement('span');
    chip.className = 'invp-row-tag';
    chip.setAttribute('data-kind', t.kind);
    chip.textContent = t.label;
    tagsEl.appendChild(chip);
  }
  // Food-overhaul Phase 3 (D25): a plate row carries its Servings bar —
  // same visual as the pickers, so inventory and the eat picker agree.
  const bar = d.plate ? plateServingsLeft(stack) : null;
  const barEl = node.querySelector('.invp-row-servings');
  if (bar && barEl) {
    barEl.replaceChildren(buildServingsBar(bar.left, bar.total));
    barEl.hidden = false;
  }
  const tag = node.querySelector('.invp-freshness-tag');
  // The 'good' rung carries an EMPTY label on purpose — food that is simply
  // fine gets no tag at all, so a tag in the list always means something.
  if (d.freshness?.label) {
    tag.textContent = d.freshness.label;
    tag.setAttribute('data-state', d.freshness.key);
  }
  container.appendChild(node);
}

function renderInventoryDetail(gs, stack) {
  const el = document.getElementById('invp-detail');
  if (!el) return;
  if (!stack) {
    el.innerHTML = '<span class="dim tiny">Select an item to see its details.</span>';
    return;
  }
  const ctx = buildInventoryCtx(gs);
  const tpl = document.getElementById('tpl-inv-detail');
  const node = tpl.content.cloneNode(true);
  const d = describeStack(stack, ctx);
  const def = stackDef(stack);
  node.querySelector('.invp-detail-icon').textContent = inventoryIcon(def);
  node.querySelector('.invp-detail-name').textContent = d.label;
  const metaBits = [`×${d.qty}`, inventoryRowSublabel(stack, def)];
  if (typeof def.price === 'number') metaBits.push(String.fromCharCode(36) + def.price);
  node.querySelector('.invp-detail-meta').textContent = metaBits.join(' · ');
  const descEl = node.querySelector('.invp-detail-desc');
  descEl.textContent = d.description + (d.tooltip ? ` ${d.tooltip}` : '');
  const freshEl = node.querySelector('.invp-detail-fresh');
  freshEl.textContent = d.freshnessText || 'Non-perishable';
  if (d.freshness) freshEl.setAttribute('data-state', d.freshness.key);
  else freshEl.removeAttribute('data-state');

  const chipsEl = node.querySelector('.invp-detail-chips');
  if (!!(stack?.meta?.keyItem || def.keyItem)) {
    const c = document.createElement('span');
    c.className = 'invp-chip';
    c.setAttribute('data-kind', 'key');
    c.textContent = 'Key item';
    chipsEl.appendChild(c);
  }
  for (const t of def.traits || []) {
    const c = document.createElement('span');
    c.className = 'invp-chip';
    c.setAttribute('data-kind', 'trait');
    c.textContent = studioPrettify(t);
    chipsEl.appendChild(c);
  }
  for (const s of def.styleTags || []) {
    const c = document.createElement('span');
    c.className = 'invp-chip';
    c.setAttribute('data-kind', 'style');
    c.textContent = s;
    chipsEl.appendChild(c);
  }

  const statsEl = node.querySelector('.invp-detail-stats');
  const stats = inventoryStatRows(stack, def);
  if (stats.length > 0) {
    for (const s of stats) {
      const row = document.createElement('div');
      row.className = 'invp-stat';
      const label = document.createElement('span');
      label.className = 'invp-stat-label';
      label.textContent = s.label;
      row.appendChild(label);
      const bar = document.createElement('div');
      bar.className = 'invp-stat-bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = `${s.value}%`;
      if (s.value >= 40) fill.setAttribute('data-high', '');
      if (s.key === 'reveal') fill.setAttribute('data-reveal', '');
      bar.appendChild(fill);
      row.appendChild(bar);
      const val = document.createElement('span');
      val.className = 'invp-stat-val';
      val.textContent = `${s.value}%`;
      row.appendChild(val);
      statsEl.appendChild(row);
    }
  }

  const actions = stackActions(stack, ctx);
  const btns = node.querySelector('.invp-detail-btns');
  const addActionBtn = (label, action, ok) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn tiny';
    btn.textContent = label;
    btn.disabled = !ok;
    if (ok) {
      btn.setAttribute('data-action', action);
      btn.setAttribute('data-def-id', stack.defId);
    }
    btns.appendChild(btn);
  };
  addActionBtn('Use', 'inventory.use', actions.use);
  addActionBtn('Place', 'inventory.place', actions.place);
  addActionBtn('Drop', 'inventory.drop', actions.drop);
  addActionBtn('Trash', 'inventory.trash', actions.trash);
  el.replaceChildren(node);
}

// Panel visibility (UI dispatches these through the data-action chain —
// 'inventory.open' / 'inventory.close'). Browsing costs zero game time;
// only the verbs do (they go through advanceAndResolveMinutes). These
// live here in the render layer because they only toggle + redraw DOM.
function selectInventoryStack(defId) {
  invpSelectedDefId = defId || null;
  if (typeof currentGameState !== 'undefined' && currentGameState) renderInventoryPanel(currentGameState);
}

function openInventoryPanel() {
  if (typeof currentGameState === 'undefined' || !currentGameState) return;
  const panel = document.getElementById('inventory-panel');
  if (!panel) return;
  invpSelectedDefId = null;
  invpSearchText = '';
  invpSortMode = 'group';
  const search = document.getElementById('invp-search');
  if (search) search.value = '';
  const sort = document.getElementById('invp-sort');
  if (sort) sort.value = 'group';
  panel.hidden = false;
  renderInventoryPanel(currentGameState);
}

function closeInventoryPanel() {
  const panel = document.getElementById('inventory-panel');
  const wasOpen = panel && !panel.hidden;
  if (panel) panel.hidden = true;
  return wasOpen;
}

// --- Container panel (overhaul Phase 2) ---
// The shared two-panel chest UI — ONE implementation for every container
// (fridge, pantry, wardrobe, doormat, floor, trash, ...), driven by the
// def's `container` block and affords: opening a chest is free browsing
// (zero game time, energy-exempt), and the transfer verbs pay
// INVENTORY_TUNING.containerVerbMinutes per batch through UI's handlers,
// which emit MOVE_ITEM effect-DSL lines via applyEffects. Nothing here
// mutates a stack list directly (design invariant 2).
let ctrObjId = null;
let ctrSelected = null; // { side: 'container' | 'bag', defId }

// --- Wardrobe panel (Intimacy & Voyeurism Phase 5, D11) ---
// The Change Outfit picker, in the same family as openRecipePicker /
// openSpreadPicker: a full overlay panel (like the container panel) with a
// promise-resolved outcome. Left column = the current outfit, one row per
// CLOTHING_SLOT; clicking a row selects the slot and the right column shows
// that slot's owned items as Wear buttons plus a Wear Nothing option. The
// Apply button resolves the promise with the drafted OUTFIT ({ slot: itemId },
// cleared slots absent) or null on Close/Escape. Rendered state is a working
// draft, never written until Apply — cancelling is free.
let _wardrobeObjId = null;
let _wardrobeResolve = null;
let _wardrobeDraft = {};
let _wardrobeOriginal = {};
let _wardrobeSlot = null;

const WARDROBE_SLOT_LABELS = {
  top: 'Top', bottom: 'Bottom', outerwear: 'Outerwear', shoes: 'Shoes',
  socks: 'Socks', underwear: 'Underwear', swimwear: 'Swimwear', accessory: 'Accessory',
};

function currentWardrobeObject(gs) {
  if (!_wardrobeObjId || !gs) return null;
  return findObjectById(gs, _wardrobeObjId) || null;
}

function openWardrobePanel(gs, objId, currentOutfit) {
  return new Promise((resolve) => {
    const panel = document.getElementById('wardrobe-panel');
    if (!panel || !gs) { resolve(null); return; }
    _wardrobeObjId = objId;
    _wardrobeDraft = { ...(currentOutfit || {}) };
    _wardrobeOriginal = { ...(currentOutfit || {}) };
    _wardrobeSlot = null;
    _wardrobeResolve = resolve;
    panel.hidden = false;
    renderWardrobePanel(gs);
  });
}

// Returns whether the panel was actually open — lets the Escape handler
// fall through to the other overlays when it wasn't.
function closeWardrobePanel() {
  const panel = document.getElementById('wardrobe-panel');
  const wasOpen = panel && !panel.hidden;
  if (panel) panel.hidden = true;
  if (_wardrobeResolve) { _wardrobeResolve(null); _wardrobeResolve = null; }
  _wardrobeObjId = null;
  _wardrobeDraft = {};
  _wardrobeOriginal = {};
  _wardrobeSlot = null;
  return wasOpen;
}

function outfitEquals(a, b) {
  const ka = Object.keys(a || {}).filter(k => a[k]);
  const kb = Object.keys(b || {}).filter(k => b[k]);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

function wardrobeSelectSlot(slot) {
  _wardrobeSlot = _wardrobeSlot === slot ? null : slot;
  if (typeof currentGameState !== 'undefined' && currentGameState) renderWardrobePanel(currentGameState);
}

function wardrobeWearSlot(defId) {
  _wardrobeDraft[_wardrobeSlot] = defId;
  renderWardrobePanel(currentGameState);
}

function wardrobeClearSlot() {
  delete _wardrobeDraft[_wardrobeSlot];
  renderWardrobePanel(currentGameState);
}

function wardrobeApply() {
  const panel = document.getElementById('wardrobe-panel');
  if (!panel || panel.hidden) return;
  const resolve = _wardrobeResolve;
  const outfit = {};
  for (const slot of CLOTHING_SLOTS) {
    if (_wardrobeDraft[slot]) outfit[slot] = _wardrobeDraft[slot];
  }
  panel.hidden = true;
  _wardrobeObjId = null;
  _wardrobeDraft = {};
  _wardrobeOriginal = {};
  _wardrobeSlot = null;
  _wardrobeResolve = null;
  if (resolve) resolve(outfit);
}

function renderWardrobePanel(gs) {
  const panel = document.getElementById('wardrobe-panel');
  if (!panel || panel.hidden) return;
  const obj = currentWardrobeObject(gs);
  if (!obj) { closeWardrobePanel(); return; }
  const sub = document.getElementById('wdb-subtitle');
  if (sub) {
    const cap = containerCapacity(obj);
    const capText = cap != null ? `${containerItemCount(obj)}/${cap} slots used` : `${containerItemCount(obj)} items`;
    const tier = obj.flags?.tier ?? 1;
    sub.textContent = `${capText} · Tier ${tier}`;
  }
  renderWardrobeOutfitColumn(gs, obj);
  renderWardrobeItemsColumn(gs, obj);
  const applyBtn = document.getElementById('wdb-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = outfitEquals(_wardrobeDraft, _wardrobeOriginal);
  }
}

function renderWardrobeOutfitColumn(gs, obj) {
  const listEl = document.getElementById('wdb-outfit-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const slot of CLOTHING_SLOTS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'wdb-slot-row';
    row.setAttribute('data-slot', slot);
    if (_wardrobeSlot === slot) row.setAttribute('data-selected', '');
    const name = document.createElement('span');
    name.className = 'wdb-slot-name';
    name.textContent = WARDROBE_SLOT_LABELS[slot] || slot;
    const val = document.createElement('span');
    val.className = 'wdb-slot-val';
    const defId = _wardrobeDraft[slot];
    val.textContent = defId && CLOTHING_DEFS[defId]
      ? CLOTHING_DEFS[defId].label
      : (_wardrobeSlot === slot ? 'Wear nothing…' : '—');
    if (!defId && _wardrobeSlot === slot) val.classList.add('dim');
    row.append(name, val);
    row.addEventListener('click', () => wardrobeSelectSlot(slot));
    listEl.appendChild(row);
  }
}

function renderWardrobeItemsColumn(gs, obj) {
  const listEl = document.getElementById('wdb-items-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const owned = (obj.contents || [])
    .filter(s => (s?.qty || 0) > 0 && CLOTHING_DEFS[s.defId]);
  if (_wardrobeSlot) {
    const slot = _wardrobeSlot;
    const slotLabel = WARDROBE_SLOT_LABELS[slot] || slot;
    const heading = document.createElement('div');
    heading.className = 'wdb-col-title-inline';
    heading.textContent = `Pick a ${slotLabel.toLowerCase()}:`;
    listEl.appendChild(heading);
    const candidates = owned.filter(s => CLOTHING_DEFS[s.defId].slot === slot);
    for (const stack of candidates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wdb-wear-btn';
      if (_wardrobeDraft[slot] === stack.defId) btn.setAttribute('data-worn', '');
      btn.textContent = CLOTHING_DEFS[stack.defId].label;
      btn.addEventListener('click', () => wardrobeWearSlot(stack.defId));
      listEl.appendChild(btn);
    }
    if (candidates.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'dim tiny wdb-empty';
      empty.textContent = `No ${slotLabel.toLowerCase()} in the wardrobe yet.`;
      listEl.appendChild(empty);
    }
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'btn btn-secondary tiny wdb-none-btn';
    none.textContent = 'Wear nothing here';
    none.addEventListener('click', wardrobeClearSlot);
    listEl.appendChild(none);
    return;
  }
  const heading = document.createElement('div');
  heading.className = 'wdb-col-title-inline';
  heading.textContent = 'Click a slot on the left, then pick an item here.';
  listEl.appendChild(heading);
  for (const slot of CLOTHING_SLOTS) {
    const ownedForSlot = owned.filter(s => CLOTHING_DEFS[s.defId].slot === slot);
    if (ownedForSlot.length === 0) continue;
    const group = document.createElement('div');
    group.className = 'wdb-item-group';
    const label = document.createElement('div');
    label.className = 'invp-group-header';
    label.textContent = WARDROBE_SLOT_LABELS[slot] || slot;
    group.appendChild(label);
    for (const stack of ownedForSlot) {
      const chip = document.createElement('span');
      chip.className = 'wdb-item-chip';
      if (_wardrobeDraft[slot] === stack.defId) chip.setAttribute('data-worn', '');
      chip.textContent = CLOTHING_DEFS[stack.defId].label;
      group.appendChild(chip);
    }
    listEl.appendChild(group);
  }
  if (owned.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dim tiny wdb-empty';
    empty.textContent = 'The wardrobe is empty — shop on Nile and move clothes in here.';
    listEl.appendChild(empty);
  }
}


function currentContainerObject(gs) {
  if (!ctrObjId || !gs) return null;
  return findObjectById(gs, ctrObjId) || null;
}

function openContainerPanel(gs, objId) {
  const panel = document.getElementById('container-panel');
  if (!panel || !gs) return;
  ctrObjId = objId;
  ctrSelected = null;
  const qty = document.getElementById('ctr-qty');
  if (qty) qty.value = 1;
  panel.hidden = false;
  renderContainerPanel(gs);
}

// Returns whether the chest was actually open — lets the Escape handler
// fall through to closing the bag when no chest is up.
function closeContainerPanel() {
  const panel = document.getElementById('container-panel');
  const wasOpen = panel && !panel.hidden;
  if (panel) panel.hidden = true;
  ctrObjId = null;
  ctrSelected = null;
  return wasOpen;
}

function selectContainerStack(side, defId) {
  ctrSelected = { side, defId };
  if (typeof currentGameState !== 'undefined' && currentGameState) renderContainerPanel(currentGameState);
}

function renderContainerPanel(gs) {
  const panel = document.getElementById('container-panel');
  if (!panel) return;
  if (panel.hidden) return;
  const obj = currentContainerObject(gs);
  if (!obj) { closeContainerPanel(); return; }
  const def = OBJECT_DEFS[obj.defId] || {};
  const cdef = def.container;
  const title = document.getElementById('ctr-title');
  if (title) title.textContent = cdef?.label || def.label || 'Container';
  const sub = document.getElementById('ctr-subtitle');
  if (sub) {
    // Intimacy & Voyeurism Phase 4 (D11): a capacity-capped container (the
    // wardrobe) shows its fill level instead of the stack count — the
    // player needs to see how many slots are left before buying more.
    const cap = containerCapacity(obj);
    if (cap != null) {
      sub.textContent = `${containerItemCount(obj)}/${cap} slots used.`;
    } else {
      const n = containerStacks(obj).length;
      sub.textContent = n === 0 ? 'Empty.' : `${n} stack${n === 1 ? '' : 's'} inside.`;
    }
  }
  // Phase 4: the throw-out button for a rot mess — visible only when this
  // container holds one (rotten_food: 'rotten'). Cleaning it resets the
  // container state (UI's doClearContainerMess) — the room smell is derived
  // from that state, so clearing the cause clears the smell.
  const messBtn = document.getElementById('ctr-mess-btn');
  if (messBtn) {
    const messy = obj.state?.rotten_food === 'rotten';
    messBtn.hidden = !messy;
    if (messy) messBtn.setAttribute('data-obj-id', obj.id);
    else messBtn.removeAttribute('data-obj-id');
  }
  // Food-overhaul Phase 1 (D19): the auto-transfer button lives on the
  // doormat only — one click sorts the delivery into the kitchen by
  // storage class instead of hand-carrying each stack.
  const autoBtn = document.getElementById('ctr-auto-transfer-btn');
  if (autoBtn) {
    const isDoormat = obj.defId === 'doormat';
    const hasStacks = (obj.contents || []).some(s => (s?.qty || 0) > 0);
    autoBtn.hidden = !isDoormat;
    autoBtn.disabled = !isDoormat || !hasStacks;
    if (isDoormat) autoBtn.setAttribute('data-obj-id', obj.id);
    else autoBtn.removeAttribute('data-obj-id');
  }
  renderContainerColumn('ctr-container-list', 'container', containerStacks(obj), gs, def);
  renderContainerColumn('ctr-bag-list', 'bag', gs.player.inventory || [], gs, null);
  updateContainerVerbBar(gs, obj);
}

function renderContainerColumn(listId, side, stacks, gs, containerDef) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  listEl.innerHTML = '';
  const rowTpl = document.getElementById('tpl-ctr-row');
  const ordered = sortStacks(stacks, 'category');
  // Food-overhaul Phase 1 (D19): storage-class destination hints render on
  // the container side when the open container is a sorting surface (the
  // doormat) — "this delivery stack is headed for the fridge". Bag rows
  // don't need them.
  const showStorageTags = side === 'container' && containerDef?.id === 'doormat';
  for (const stack of ordered) {
    const node = rowTpl.content.cloneNode(true);
    const row = node.querySelector('.ctr-row');
    row.setAttribute('data-side', side);
    row.setAttribute('data-def-id', stack.defId);
    if (ctrSelected?.side === side && ctrSelected?.defId === stack.defId) row.setAttribute('data-selected', '');
    // Phase 4: container-side rows compute freshness against THIS
    // container's preservation multiplier (bag side passes null).
    const d = describeStack(stack, { day: gameDaysNow(gs.meta.clock), containerDef });
    node.querySelector('.ctr-row-name').textContent = d.label;
    node.querySelector('.ctr-row-qty').textContent = `×${d.qty}`;
    // Food-overhaul Phase 3 (D25): the Servings bar on a plate's container
    // row — same visual as the pickers and the inventory panel.
    const bar = d.plate ? plateServingsLeft(stack) : null;
    const barEl = node.querySelector('.ctr-servings');
    if (bar && barEl) {
      barEl.replaceChildren(buildServingsBar(bar.left, bar.total));
      barEl.hidden = false;
    }
    const tag = node.querySelector('.ctr-freshness-tag');
    if (d.freshness?.label) {
      tag.textContent = d.freshness.label;
      tag.setAttribute('data-state', d.freshness.key);
    }
    // Food-overhaul Phase 1 (D17/D29): the frozen/thawing badge reads off
    // freshnessOf's frozenState, so it can never disagree with the spoilage
    // math that displays beside it.
    if (d.freshness?.frozenState === 'frozen') {
      const b = node.querySelector('.ctr-frozen-badge');
      b.textContent = 'Frozen';
      b.hidden = false;
    } else if (d.freshness?.frozenState === 'thawing') {
      const b = node.querySelector('.ctr-thawing-badge');
      b.textContent = 'Thawing';
      b.hidden = false;
    }
    if (showStorageTags) {
      const sTag = node.querySelector('.ctr-storage-tag');
      const cls = storageClassOf(stackDef(stack));
      if (cls) {
        sTag.textContent = `→ ${cls}`;
        sTag.hidden = false;
      }
    }
    listEl.appendChild(node);
  }
  if (ordered.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dim tiny ctr-empty';
    empty.textContent = side === 'container' ? 'Nothing inside.' : 'Your bag is empty.';
    listEl.appendChild(empty);
  }
}

// The bottom action bar: which verb the selected stack gets (Take from the
// container side, Put from the bag side), respecting the def's take/put
// affords and keyItem, plus the selected stack's description and the
// Take All / Put All enablement.
function updateContainerVerbBar(gs, obj) {
  const verbBtn = document.getElementById('ctr-verb-btn');
  const takeAll = document.getElementById('ctr-take-all-btn');
  const putAll = document.getElementById('ctr-put-all-btn');
  const qtyInput = document.getElementById('ctr-qty');
  const detailEl = document.getElementById('ctr-detail');
  if (!verbBtn || !takeAll || !putAll) return;
  const def = OBJECT_DEFS[obj.defId] || {};
  const canTake = !!def.affords?.includes('container.take');
  const canPut = !!def.affords?.includes('container.put');
  takeAll.setAttribute('data-obj-id', obj.id);
  putAll.setAttribute('data-obj-id', obj.id);
  const ctx = buildInventoryCtx(gs);
  const ctrStacks = containerStacks(obj).filter(s => (s?.qty || 0) > 0);
  const bagStacks = (gs.player.inventory || []).filter(s => (s?.qty || 0) > 0 && stackActions(s, ctx).transfer);
  takeAll.disabled = !(canTake && ctrStacks.length > 0);
  // Intimacy & Voyeurism Phase 4 (D11): Put All into a full/capped
  // container is disabled up front — capacity reads come from ITEMS'
  // wardrobePutCheck so the button and the transfer handler share one math.
  let putAllEnabled = canPut && bagStacks.length > 0;
  if (putAllEnabled) {
    const cap = wardrobePutCheck(obj, null, 0);
    putAllEnabled = cap.capacity == null || cap.remaining > 0;
  }
  putAll.disabled = !putAllEnabled;

  if (!ctrSelected) {
    verbBtn.textContent = 'Select an item';
    verbBtn.disabled = true;
    verbBtn.removeAttribute('data-action');
    verbBtn.removeAttribute('data-obj-id');
    verbBtn.removeAttribute('data-def-id');
    if (qtyInput) qtyInput.value = 1;
    if (detailEl) detailEl.innerHTML = '<span class="dim tiny">Pick an item on either side.</span>';
    return;
  }
  const side = ctrSelected.side;
  const srcList = side === 'container' ? containerStacks(obj) : (gs.player.inventory || []);
  const stack = srcList.find(s => s.defId === ctrSelected.defId);
  if (!stack) { ctrSelected = null; updateContainerVerbBar(gs, obj); return; }
  const keyItem = !!(stack.meta?.keyItem || stackDef(stack).keyItem);
  const direction = side === 'container' ? 'take' : 'put';
  const legal = keyItem ? false : (direction === 'take' ? canTake : canPut);
  const label = describeStack(stack, ctx).label;
  verbBtn.textContent = `${direction === 'take' ? 'Take' : 'Put'} ${label}`;
  verbBtn.disabled = !legal;
  if (legal) {
    verbBtn.setAttribute('data-action', direction === 'take' ? 'container.take' : 'container.put');
    verbBtn.setAttribute('data-obj-id', obj.id);
    verbBtn.setAttribute('data-def-id', stack.defId);
  } else {
    verbBtn.removeAttribute('data-action');
    verbBtn.removeAttribute('data-obj-id');
    verbBtn.removeAttribute('data-def-id');
  }
  if (qtyInput) qtyInput.value = clamp(Number(qtyInput.value) || 1, 1, stack.qty);
  if (detailEl) {
    // Phase 4: the detail pane shows container-aware freshness for the
    // container side (bag side stays at the bag baseline).
    const stackCtx = { ...ctx, containerDef: side === 'container' ? def : null };
    const d = describeStack(stack, stackCtx);
    detailEl.innerHTML = '';
    const tpl = document.getElementById('tpl-ctr-detail');
    if (tpl) {
      const node = tpl.content.cloneNode(true);
      node.querySelector('.ctr-detail-name').textContent = d.label;
      node.querySelector('.ctr-detail-meta').textContent = `×${d.qty} · ${d.sublabel}`;
      node.querySelector('.ctr-detail-desc').textContent = d.description + (d.tooltip ? ` ${d.tooltip}` : '');
      const freshEl = node.querySelector('.ctr-detail-fresh');
      freshEl.textContent = d.freshnessText || 'Non-perishable';
      if (d.freshness) freshEl.setAttribute('data-state', d.freshness.key);
      else freshEl.removeAttribute('data-state');
      detailEl.replaceChildren(node);
    } else {
      detailEl.textContent = d.description;
    }
  }
}

// --- Recipe picker (overhaul Phase 2) ---
// self.cook's prepare asks which recipe to make when more than one is on
// hand. Rendered into the shared #modal-overlay (the same box the old
// menu modal used before Phase 10 retired it) with real buttons — handlers
// resolve the promise directly, no data-action chain needed. Returns the
// chosen recipe id, or null on cancel. Hides the loading overlay first:
// runRegisteredAction shows it while executeAction runs, and it would
// cover the modal.
// Food-overhaul Phase 3 (D25): the Servings bar — left/total with a fill
// whose fraction is identical whatever the batch size (a bar 7/8 full reads
// the same whether the batch held 8 or 2 servings). Shared by the eat/
// spread/reheat pickers and the inventory and container rows.
function buildServingsBar(left, total) {
  const bar = document.createElement('span');
  bar.className = 'servings-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${Math.max(0, left)} of ${total} servings left`);
  const fill = document.createElement('span');
  fill.className = 'servings-bar-fill';
  fill.style.width = `${total > 0 ? Math.max(0, Math.min(1, left / total)) * 100 : 0}%`;
  const label = document.createElement('span');
  label.className = 'servings-bar-label';
  label.textContent = `${Math.max(0, left)}/${total}`;
  bar.append(fill, label);
  return bar;
}

// D27/D28 eat-time warning lines for a PLATE option (empty for def-driven
// food — those contracts don't apply to it yet). Mirrors applyEatItem's
// cold/hotNow computation exactly, so the picker can never promise a mood
// outcome the applier won't deliver.
function plateEatWarnings(option) {
  const stack = option.stack;
  const plate = stack?.meta?.plate;
  if (!plate) return [];
  const fresh = freshnessOf(stack, option.containerDef ?? null, option.day);
  const cold = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
  const hotNow = !cold && ((plate.wasReheated || stack.meta?.wasReheated) || fresh?.key === 'fresh');
  const out = [];
  if (stackBetterHot(stack) && !hotNow) out.push('cold — loses its whole mood bonus; reheat it');
  if (cold && !stackFrozenFood(stack)) out.push('frozen — eating this cold costs mood');
  return out;
}

// Food-overhaul Phase 3 (D25/D27/D28): shared picker-row content for the
// eat / spread / reheat pickers — ONE function owns what a row SAYS about a
// food option, so the modals can never disagree about a plate's label,
// servings bar, kcal, quality, grade or warnings. Returns { name, meta }.
function buildPickRowContent(option) {
  const name = document.createElement('span');
  name.className = 'eat-pick-name';
  name.textContent = stackLabel(option.stack);
  const meta = document.createElement('span');
  meta.className = 'eat-pick-meta';
  const plate = option.stack?.meta?.plate;
  if (plate) {
    // Plate branch: the instance's own numbers (kcal per serving, quality,
    // grade) and the D25 Servings bar; the carrier def is never read.
    const bar = plateServingsLeft(option.stack);
    if (bar) meta.appendChild(buildServingsBar(bar.left, bar.total));
    const metaParts = [option.sourceLabel];
    const kcal = plate.kcalPerServing;
    if (kcal > 0) metaParts.push(`fed ~${Math.round(fullnessHoursFromKcal(kcal) * 10) / 10}h`);
    metaParts.push(`${Math.round(plate.quality * 100)}% · grade ${plate.grade}`);
    meta.appendChild(document.createTextNode(metaParts.join(' · ')));
    for (const w of plateEatWarnings(option)) {
      const tag = document.createElement('span');
      tag.className = 'eat-pick-freshness eat-pick-warn';
      tag.textContent = w;
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(tag);
    }
  } else {
    // Def-driven branch: the pre-Phase-3 per-serving summary + freshness.
    const sv = itemServings(option.def);
    const restore = consumableSummary(option.def, { perServing: sv > 1 });
    const metaParts = [option.sourceLabel];
    if (sv > 1) metaParts.push(`serves ${sv}`);
    const kcal = perServingKcal(option.def);
    if (kcal > 0) metaParts.push(`fed ~${Math.round(fullnessHoursFromKcal(kcal) * 10) / 10}h`);
    if (restore) metaParts.push(`restores ${restore}`);
    meta.textContent = metaParts.join(' · ');
    const fresh = freshnessOf(option.stack, option.containerDef ?? null, option.day);
    if (fresh?.label && fresh.key !== 'fresh') {
      const tag = document.createElement('span');
      tag.className = `eat-pick-freshness eat-pick-${fresh.key}`;
      tag.textContent = fresh.label;
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(tag);
    }
    // Raw-food warning (2026-08-20): a rawDangerous ingredient (eggs, raw
    // chicken...) offers itself in the picker, but eating it raw costs
    // RAW_FOOD's penalty — say so BEFORE the player commits.
    if (option.def.rawDangerous) {
      const tag = document.createElement('span');
      tag.className = 'eat-pick-freshness eat-pick-warn';
      tag.textContent = 'raw — cook it first';
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(tag);
    }
  }
  return { name, meta };
}

function openRecipePicker(recipes) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (recipeId) => { overlay.removeAttribute('data-open'); resolve(recipeId); };
    title.textContent = 'What do you want to cook?';
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'recipe-pick-list';
    for (const recipe of recipes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block recipe-pick-btn';
      const name = document.createElement('span');
      name.className = 'recipe-pick-name';
      name.textContent = recipe.label;
      const ings = document.createElement('span');
      ings.className = 'recipe-pick-ings';
      // Food-overhaul Phase 3 (D25/D6): the batch yield is a real number
      // now — cooking pasta is never a single plate, and the picker says
      // how many servings you're making before you commit.
      const servings = recipe.servings || 1;
      ings.textContent = `serves ${servings} · ` + recipe.ingredients.map(ing => `${ITEM_DEFS[ing.defId]?.label || ing.defId} ×${ing.qty}`).join(', ');
      btn.append(name, ings);
      btn.addEventListener('click', () => finish(recipe.id));
      list.appendChild(btn);
    }
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Cook screen (food-overhaul Phase 5, D8/D14/D15/D16) ---
// The heart of self.cook: the interactive manual loop, in one modal with
// two stages.
//   Stage 1 — the plan: the method's cookware line, one row per ingredient
//   to pick its processing verb (chopped/sliced/minced/…, natural verb
//   pre-picked), any declared mixing step, the fat choice when the method
//   needs one (oil/butter/none), the seasoning choice (salt/spices/both/
//   none — D8's taste gate lives here: no flavor on a cooked dish = bland),
//   and heat/timing for the cook. Reagents the kitchen doesn't have are
//   disabled with a note — the taste gate then bites for real.
//   Stage 2 — the outcome: per-step quality lines, the grade reveal
//   (computeGrade), the D15 failure lines, and RESCUE buttons for the
//   recoverable failures (add salt to a bland batch, finish cooking a raw
//   one). "Serve it" resolves with the fully resolved prepared object;
//   Cancel resolves null (the action then aborts before spending anything).
// The engine (cooking.js) stays pure — this file only renders choices and
// calls planCook/resolveCookPlan/applyCookRescue/buildPlate.
function openCookScreen(recipe, gs, ctx) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (prepared) => { overlay.removeAttribute('data-open'); resolve(prepared); };
    const roomId = ctx?.roomId || gs?.player?.location || 'kitchen';
    const avail = reagentAvailability(gs, ctx);
    const m = METHODS[recipe.method || 'none'] || METHODS.none;
    const choices = {
      verbs: {},
      // The method needs fat → default to oil when the house has it (a
      // pan with nothing in it is how things stick and burn).
      fat: (m.oil && avail.oil) ? 'oil' : null,
      // The generic cook's habit — salt — pre-ticked ONLY when the house
      // actually has it; an empty seasoning rack means a bland dinner.
      seasoning: COOK_TUNING.defaultSeasoning.filter(r => avail[r]),
      heat: m.burner || 'medium',
      timing: 'standard',
    };
    for (const ing of recipe.ingredients || []) {
      choices.verbs[ing.defId] = naturalVerbFor(ITEM_DEFS[ing.defId]);
    }
    const seed = Math.floor(Math.random() * 2 ** 31);
    const verbOptions = processingVerbOptions(gs);
    const buildPlan = () => planCook(recipe, gs, { roomId, seed, choices });
    const resolveNow = () => resolveCookPlan(buildPlan(), gs);

    const small = (label, picked, onPick, disabled = false, title = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-secondary tiny cook-seg-btn${picked ? ' picked' : ''}`;
      b.textContent = label;
      if (disabled) b.disabled = true;
      if (title) b.title = title;
      if (!disabled) b.addEventListener('click', onPick);
      return b;
    };

    function renderPlan() {
      title.textContent = `Cook — ${recipe.label}`;
      body.innerHTML = '';
      actions.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'cook-screen';
      const plan = buildPlan();
      const methodLabel = m.label || plan.method;
      const cwLabel = plan.cookware ? (DISH_DEFS[plan.cookware]?.label || plan.cookware) : 'by hand';
      const methodLine = document.createElement('div');
      methodLine.className = 'cook-method-line';
      methodLine.textContent = `${methodLabel} in a ${cwLabel} · serves ${recipe.servings || 1}`;
      root.appendChild(methodLine);
      // Food-overhaul Phase 6 (D12): what the kitchen actually owns, one
      // line — burner count, mixer verbs, oven. Reads the same
      // equipmentState the engine resolves against, so the display can't
      // drift from the math.
      const eq = equipmentState(gs);
      const burnerWord = eq.burners === 1 ? '1 burner' : `${eq.burners} burners`;
      const mixerWord = eq.mixingVerbs?.length
        ? eq.mixingVerbs.map(v => COOK_TUNING.processVerbs[v]?.label || v).join('/')
        : 'no mixer';
      const ovenWord = eq.ovenPresent ? 'with oven' : 'no oven';
      const kitchenLine = document.createElement('div');
      kitchenLine.className = 'cook-kitchen-line';
      kitchenLine.textContent = `Your kitchen: ${burnerWord} · ${mixerWord} · ${ovenWord}`;
      root.appendChild(kitchenLine);
      if (!plan.cookware || kitchenCookwareAvailable(gs, plan.cookware)) {
        // fine — tier-1 kitchens own their cookware
      } else {
        const warn = document.createElement('div');
        warn.className = 'cook-flaw';
        warn.textContent = `No ${cwLabel.toLowerCase()} in the kitchen — this method isn't possible.`;
        root.appendChild(warn);
      }

      // Processing section — one row per ingredient.
      const prepSec = document.createElement('div');
      prepSec.className = 'cook-section';
      prepSec.appendChild(sectionTitle('Prep'));
      for (const ing of recipe.ingredients || []) {
        const row = document.createElement('div');
        row.className = 'cook-row';
        const label = document.createElement('span');
        label.className = 'cook-row-label';
        const def = ITEM_DEFS[ing.defId];
        label.textContent = `${def?.label || ing.defId}${ing.qty > 1 ? ` ×${ing.qty}` : ''}`;
        row.appendChild(label);
        const seg = document.createElement('span');
        seg.className = 'cook-seg';
        for (const v of verbOptions) {
          const vd = COOK_TUNING.processVerbs[v];
          seg.appendChild(small(vd?.label || v, choices.verbs[ing.defId] === v, () => {
            choices.verbs[ing.defId] = v;
            renderPlan();
          }, false, vd?.label));
        }
        row.appendChild(seg);
        prepSec.appendChild(row);
      }
      root.appendChild(prepSec);

      // Mixing steps (declared on the recipe — D16, gate-checked).
      if ((recipe.mix || []).length > 0) {
        const mixSec = document.createElement('div');
        mixSec.className = 'cook-section';
        mixSec.appendChild(sectionTitle('Mix'));
        for (const mixVerb of recipe.mix) {
          const can = canPerformVerb(mixVerb, gs, null);
          const row = document.createElement('div');
          row.className = 'cook-row';
          const label = document.createElement('span');
          label.className = 'cook-row-label';
          label.textContent = `${COOK_TUNING.processVerbs[mixVerb]?.label || mixVerb} the mixture`;
          row.appendChild(label);
          if (!can) {
            const note = document.createElement('span');
            note.className = 'cook-flaw';
            note.textContent = 'No mixer in the kitchen.';
            row.appendChild(note);
          } else {
            const ok = document.createElement('span');
            ok.className = 'cook-row-ok';
            ok.textContent = 'needs the mixer';
            row.appendChild(ok);
          }
          mixSec.appendChild(row);
        }
        root.appendChild(mixSec);
      }

      // Fat choice — only when the method needs one.
      if (m.oil) {
        const fatSec = document.createElement('div');
        fatSec.className = 'cook-section';
        fatSec.appendChild(sectionTitle('Fat'));
        const row = document.createElement('div');
        row.className = 'cook-row';
        const seg = document.createElement('span');
        seg.className = 'cook-seg';
        seg.appendChild(small('None', !choices.fat, () => { choices.fat = null; renderPlan(); }));
        for (const fid of ['oil', 'butter']) {
          const r = COOK_TUNING.reagents[fid];
          const has = avail[fid];
          seg.appendChild(small(r.label, choices.fat === fid, () => { choices.fat = fid; renderPlan(); }, !has, has ? r.hint : `No ${r.label.toLowerCase()} in the house`));
        }
        row.appendChild(seg);
        fatSec.appendChild(row);
        root.appendChild(fatSec);
      }

      // Seasoning — the D8 taste gate's UI side.
      const seaSec = document.createElement('div');
      seaSec.className = 'cook-section';
      seaSec.appendChild(sectionTitle('Seasoning'));
      const seaRow = document.createElement('div');
      seaRow.className = 'cook-row';
      const seg = document.createElement('span');
      seg.className = 'cook-seg';
      const hasFlavor = (r) => choices.seasoning.includes(r);
      const toggle = (rid) => {
        const cur = hasFlavor(rid);
        choices.seasoning = cur ? choices.seasoning.filter(x => x !== rid) : [...choices.seasoning, rid];
        renderPlan();
      };
      seg.appendChild(small('Salt', hasFlavor('salt'), () => toggle('salt'), !avail.salt, avail.salt ? 'a pinch of salt' : 'No salt in the house'));
      seg.appendChild(small('Spices', hasFlavor('spices'), () => toggle('spices'), !avail.spices, avail.spices ? 'a sprinkle of spices' : 'No spices in the house'));
      seaRow.appendChild(seg);
      if (!avail.salt && !avail.spices) {
        const note = document.createElement('div');
        note.className = 'cook-flaw';
        note.textContent = 'No seasonings in the house — this will come out bland.';
        seaSec.appendChild(note);
      }
      seaSec.appendChild(seaRow);
      root.appendChild(seaSec);

      // Heat / timing.
      const heatSec = document.createElement('div');
      heatSec.className = 'cook-section';
      heatSec.appendChild(sectionTitle('Heat & timing'));
      const heatRow = document.createElement('div');
      heatRow.className = 'cook-row';
      const heatSeg = document.createElement('span');
      heatSeg.className = 'cook-seg';
      if (m.burner) {
        for (const h of ['low', 'medium', 'medium-high', 'high']) {
          heatSeg.appendChild(small(h, choices.heat === h, () => { choices.heat = h; renderPlan(); }));
        }
      } else if (m.oven) {
        for (const h of ['medium', 'high']) {
          heatSeg.appendChild(small(h === 'medium' ? '350°' : '425°', choices.heat === h, () => { choices.heat = h; renderPlan(); }));
        }
      }
      heatRow.appendChild(heatSeg);
      heatSec.appendChild(heatRow);
      const timingRow = document.createElement('div');
      timingRow.className = 'cook-row';
      const timingSeg = document.createElement('span');
      timingSeg.className = 'cook-seg';
      for (const [tk, tl] of [['conservative', 'Take it off early'], ['standard', 'Standard'], ['bold', 'Push it']]) {
        timingSeg.appendChild(small(tl, choices.timing === tk, () => { choices.timing = tk; renderPlan(); }, false, tk === 'bold' ? 'hotter and faster — higher burn risk' : tk === 'conservative' ? 'safer but slower — higher undercook risk' : ''));
      }
      timingRow.appendChild(timingSeg);
      heatSec.appendChild(timingRow);
      root.appendChild(heatSec);

      // Estimate.
      const est = document.createElement('div');
      est.className = 'cook-est';
      est.textContent = `~${plan.minutes} min on the clock`;
      root.appendChild(est);

      body.appendChild(root);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => finish(null));
      actions.appendChild(cancel);
      // Food-overhaul Phase 6 (D14): the auto-cook affordance. Once this
      // recipe has been cooked to (or above) its equipment-adjusted
      // threshold, "Instant Cook" skips the whole loop: one seeded
      // autopilot roll, plate floored at the threshold's quality.
      if (autoCookUnlocked(recipe, gs)) {
        const instantBtn = document.createElement('button');
        instantBtn.type = 'button';
        instantBtn.className = 'btn btn-secondary';
        instantBtn.textContent = '⚡ Instant Cook';
        instantBtn.title = `You've made this to ${autocookThreshold(recipe, gs)}+ before — cook it on autopilot.`;
        instantBtn.addEventListener('click', () => {
          const autoSeed = Math.floor(Math.random() * 2 ** 31);
          const plan = planCook(recipe, gs, { auto: true, seed: autoSeed });
          const outcome = resolveCookPlan(plan, gs);
          const plate = autoCookPlate(gs, recipe, autoSeed, plan, outcome);
          finish({
            recipe,
            cookware: plan.cookware,
            method: plan.method,
            steps: plan.steps,
            seasoning: plan.seasoning,
            heat: plan.heat,
            timing: plan.timing,
            seed: autoSeed,
            minutes: plan.minutes,
            plan,
            outcome,
            plate,
            auto: true,
          });
        });
        actions.appendChild(instantBtn);
      }
      const cookBtn = document.createElement('button');
      cookBtn.type = 'button';
      cookBtn.className = 'btn';
      cookBtn.textContent = 'Start cooking';
      cookBtn.addEventListener('click', () => renderOutcome(buildPlan(), resolveNow()));
      actions.appendChild(cookBtn);
    }

    function renderOutcome(plan, outcome) {
      title.textContent = `Cook — ${recipe.label}`;
      body.innerHTML = '';
      actions.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'cook-screen';

      // Grade reveal + quality bar. The grade shown is the PLATE's final
      // grade — buildPlate's ingredient×execution blend — because that is
      // the dish that actually lands in the fridge (revealing the raw
      // execution quality alone would mislead: a good ingredient story
      // still makes a D plate out of a botched cook). Built with the same
      // inputs Serve uses, so what's revealed is what's eaten.
      const platePreview = buildPlate(gs, recipe, recipe.ingredients, recipe.method, recipe.cookware, { plan, outcome, seed });
      const qualityPct = Math.round(platePreview.quality * 100);
      const grade = platePreview.grade;
      const gradeLine = document.createElement('div');
      gradeLine.className = 'cook-grade';
      gradeLine.textContent = `Grade ${grade}`;
      root.appendChild(gradeLine);
      const barWrap = document.createElement('div');
      barWrap.className = 'cook-quality-bar';
      const fill = document.createElement('div');
      fill.className = 'cook-quality-fill';
      fill.style.width = `${qualityPct}%`;
      barWrap.appendChild(fill);
      root.appendChild(barWrap);
      const pct = document.createElement('div');
      pct.className = 'cook-pct';
      pct.textContent = `${qualityPct}% quality`;
      root.appendChild(pct);

      // Per-step lines — matched BY INDEX, because a rescue appends a step
      // and two method passes share every other field.
      const steps = document.createElement('div');
      steps.className = 'cook-steps';
      for (let i = 0; i < plan.steps.length; i++) {
        const st = plan.steps[i];
        const resolved = outcome.stepResults[i];
        const line = cookStepLine(st, resolved);
        const div = document.createElement('div');
        div.className = 'cook-step-line';
        const what = document.createElement('span');
        what.textContent = line.what;
        div.appendChild(what);
        const q = document.createElement('span');
        q.className = 'cook-step-q';
        q.textContent = `${line.grade} (${line.quality}%)`;
        div.appendChild(q);
        steps.appendChild(div);
      }
      root.appendChild(steps);

      // Flaw lines (D15) + rescue buttons. The seasoning rescues are the
      // D8 taste-gate loop: a bland batch gets its pinch here, and a batch
      // already seasoned can be pushed PAST the need (a rescue portion
      // adds flavor even on top of a seasoned dish — that's the reachable
      // overseasoned path, since the base screen only offers 0–2 flavor).
      for (const f of cookFlawLines(outcome)) {
        const div = document.createElement('div');
        div.className = 'cook-flaw';
        div.textContent = f;
        root.appendChild(div);
      }
      const canRescue = [];
      const cooked = recipe.method !== 'none';
      if (cooked && !outcome.flaws.includes('overseasoned')) {
        if (avail.salt && !plan.rescues?.includes('add_salt')) canRescue.push(['add_salt', 'Add salt']);
        if (avail.spices && !plan.rescues?.includes('add_spice')) canRescue.push(['add_spice', 'Add spices']);
      }
      if (outcome.flaws.includes('raw') && !plan.steps.some(s => s.rescueSalt === 'finish')) {
        canRescue.push(['finish', 'Finish cooking']);
      }
      if (canRescue.length > 0) {
        const rescueSec = document.createElement('div');
        rescueSec.className = 'cook-section';
        rescueSec.appendChild(sectionTitle('Rescue it'));
        const row = document.createElement('div');
        row.className = 'cook-row';
        const seg = document.createElement('span');
        seg.className = 'cook-seg';
        for (const [rid, rl] of canRescue) {
          seg.appendChild(small(rl, false, () => {
            const next = applyCookRescue(plan, rid, gs);
            if (next) {
              choices.fat = next.seasoning.find(r => COOK_TUNING.reagents[r]?.kind === 'fat') || choices.fat;
              choices.seasoning = next.seasoning;
              renderOutcome(next, resolveCookPlan(next, gs));
            }
          }));
        }
        row.appendChild(seg);
        rescueSec.appendChild(row);
        root.appendChild(rescueSec);
      }

      body.appendChild(root);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => finish(null));
      actions.appendChild(cancel);
      const serveBtn = document.createElement('button');
      serveBtn.type = 'button';
      serveBtn.className = 'btn';
      serveBtn.textContent = 'Serve it';
      serveBtn.addEventListener('click', () => {
        const finalOutcome = resolveCookPlan(plan, gs);
        const plate = buildPlate(gs, recipe, recipe.ingredients, recipe.method, recipe.cookware, { plan, outcome: finalOutcome, seed });
        finish({
          recipe,
          cookware: plan.cookware,
          method: plan.method,
          steps: plan.steps,
          seasoning: plan.seasoning,
          heat: plan.heat,
          timing: plan.timing,
          seed,
          minutes: plan.minutes,
          plan,
          outcome: finalOutcome,
          plate,
        });
      });
      actions.appendChild(serveBtn);
    }

    function sectionTitle(text) {
      const h = document.createElement('div');
      h.className = 'cook-section-title';
      h.textContent = text;
      return h;
    }

    renderPlan();
  });
}

// --- Eat picker (overhaul Phase 3) ---
// The "What do you want to eat?" choice behind the Eat chip, mirroring
// openRecipePicker: one row per edible option (INVENTORY's edibleStacks),
// each showing what it is, where it is (bag / Fridge / Pantry / Freezer),
// and the per-serving restore. Food-overhaul Phase 3: a PLATE option rows
// its instance — Servings bar, per-serving kcal, quality and grade, and a
// D27/D28 warning when eating it now costs mood. Resolves to the option's
// INDEX (two plate batches of the same recipe can sit in the same
// container — a defId+from key can't tell them apart) or null on Cancel.
function openEatPicker(options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = 'What do you want to eat?';
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'eat-pick-list';
    options.forEach((option, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block eat-pick-btn';
      const { name, meta } = buildPickRowContent(option);
      btn.append(name, meta);
      btn.addEventListener('click', () => finish(i));
      list.appendChild(btn);
    });
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Reheat picker (food-overhaul Phase 3, D26/D27/D29) ---
// "What do you want to reheat?" behind the Reheat chip — one row per
// reheatable plate (INVENTORY's reheatableStacks): label, where it is, how
// many servings, and what reheating it NOW actually does (thaw a frozen
// batch / restore a stale one / nothing but the warm-up). Resolves to the
// option's INDEX or null on Cancel — same index contract as openEatPicker.
function openReheatPicker(options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = 'What do you want to reheat?';
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'eat-pick-list';
    options.forEach((option, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block eat-pick-btn';
      const { name, meta } = buildPickRowContent(option);
      // Say what this reheat will DO, beyond what the row already shows —
      // the whole point of the step is the thaw/quality restore.
      const fresh = freshnessOf(option.stack, option.containerDef ?? null, option.day);
      const what = document.createElement('span');
      what.className = 'eat-pick-meta';
      const effects = [];
      if (fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing') effects.push('thaws the frozen batch');
      if (fresh?.key === 'stale' || fresh?.key === 'spoiled') effects.push('restores quality');
      if (effects.length === 0) effects.push('just warms it up');
      what.textContent = effects.join(' + ');
      btn.append(name, meta, what);
      btn.addEventListener('click', () => finish(i));
      list.appendChild(btn);
    });
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Volume picker (Intimacy & Voyeurism Phase 19) ----------------------
// The "Turn it to what?" choice behind a sound device's Set Volume verb —
// four rows (Off / 1 / 2 / 3) with a one-line sense of each, resolving to
// the volume STATE string ('0'..'3') or null on Cancel. Mirrors
// openEatPicker's modal.
function openVolumePicker(currentVolume, deviceLabel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = `${deviceLabel} volume`;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'recipe-pick-list';
    const rows = [
      { v: '0', label: 'Off', sub: 'silent' },
      { v: '1', label: 'Volume 1', sub: 'background' },
      { v: '2', label: 'Volume 2', sub: 'fills the room' },
      { v: '3', label: 'Volume 3', sub: 'loud — the neighbours will hear' },
    ];
    const current = currentVolume || '0';
    for (const row of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block recipe-pick-btn';
      const name = document.createElement('span');
      name.className = 'recipe-pick-name';
      name.textContent = row.label;
      const meta = document.createElement('span');
      meta.className = 'recipe-pick-ings';
      meta.textContent = row.v === current ? `${row.sub} (current)` : row.sub;
      btn.append(name, meta);
      btn.addEventListener('click', () => finish(row.v));
      list.appendChild(btn);
    }
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Spread picker (set_meal) ---
// The eat picker's sibling for laying out a TABLE: the same rows, but
// multi-select, with the one number that decides whether the meal works —
// servings on the table against people at it — kept live above the Serve
// button. set_meal used to reuse the single-select eat picker, which is why
// catering for a room was invisible: the player picked one dish and only
// found out afterwards that three roommates got nothing.
//
// Resolves to an array of { defId, from } (empty/null on cancel).
function openSpreadPicker(options, { seats = 1, max = 6 } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = seats > 1 ? `Lay out the table for ${seats}` : 'Lay out the table';
    body.innerHTML = '';

    const picked = [];       // option INDICES, in the order they were added
    const rowFor = new Map(); // key -> row element
    const keyOf = (o, i) => String(i);

    const tally = document.createElement('div');
    tally.className = 'spread-tally';
    const serveBtn = document.createElement('button');
    serveBtn.type = 'button';
    serveBtn.className = 'btn';
    serveBtn.textContent = 'Serve';

    const servingsOf = (o) => (typeof stackServingsLeft === 'function' ? stackServingsLeft(o.stack) : o.stack.qty || 1);
    const refresh = () => {
      const chosen = picked.map(i => options[i]).filter(Boolean);
      const total = chosen.reduce((sum, o) => sum + servingsOf(o), 0);
      if (chosen.length === 0) {
        tally.textContent = `Nothing on the table yet — ${seats} ${seats === 1 ? 'seat' : 'seats'} to fill.`;
        tally.setAttribute('data-state', 'empty');
      } else {
        const short = seats - total;
        tally.textContent = short > 0
          ? `${total} ${total === 1 ? 'serving' : 'servings'} for ${seats} — ${short} ${short === 1 ? 'person goes' : 'people go'} without.`
          : `${total} ${total === 1 ? 'serving' : 'servings'} for ${seats}${total > seats ? ` — ${total - seats} left over` : ' — just enough'}.`;
        tally.setAttribute('data-state', short > 0 ? 'short' : 'ok');
      }
      serveBtn.disabled = chosen.length === 0;
      for (const [key, row] of rowFor) {
        const on = picked.includes(Number(key));
        row.toggleAttribute('data-picked', on);
        // At the cap, un-picked rows stop responding — the bound is visible
        // rather than a silent no-op on click.
        row.toggleAttribute('data-disabled', !on && picked.length >= max);
      }
    };

    const list = document.createElement('div');
    list.className = 'eat-pick-list';
    options.forEach((option, i) => {
      const key = keyOf(option, i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block eat-pick-btn spread-pick-btn';
      // Food-overhaul Phase 3 (D25): shared row content — a plate rows its
      // own label, Servings bar and quality rather than the carrier def.
      const { name, meta } = buildPickRowContent(option);
      btn.append(name, meta);
      // Food-overhaul Phase 7 (D23): who at the table actually likes this
      // dish ("Maya loves it · Sam hates it") — catering to known tastes is
      // a visible decision on the same row as the servings.
      if (option.tasteNotes?.length) {
        const taste = document.createElement('span');
        taste.className = 'eat-pick-meta spread-taste';
        taste.textContent = option.tasteNotes.join(' · ');
        btn.appendChild(taste);
      }
      btn.addEventListener('click', () => {
        const at = picked.indexOf(i);
        if (at >= 0) picked.splice(at, 1);
        else if (picked.length < max) picked.push(i);
        refresh();
      });
      rowFor.set(key, btn);
      list.appendChild(btn);
    });
    body.appendChild(list);
    body.appendChild(tally);

    actions.innerHTML = '';
    serveBtn.addEventListener('click', () => finish(picked.slice()));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.append(serveBtn, cancel);
    refresh();
    overlay.setAttribute('data-open', '');
  });
}

// --- Dinner-invite picker (overhaul Phase 7) ---
// "When should we eat?" behind the Invite to Dinner actions (in-person
// chip and the IM chat-header button). One button per day×meal-slot combo
// (today's slots whose window already passed are omitted), resolving to
// { startAbs, endAbs, slotId } or null on Cancel.
function openDinnerInvitePicker(npcName) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = `Invite ${npcName || 'them'} to dinner`;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'recipe-pick-list';
    const day = currentGameState?.meta?.clock?.day ?? 1;
    const nowAbs = clockToAbsolute(currentGameState?.meta?.clock || { day, minutes: 0 });
    for (let offset = 0; offset < COMMITMENT_TUNING.maxInviteAheadDays; offset++) {
      const d = day + offset;
      for (const slot of COMMITMENT_TUNING.mealSlots) {
        const startAbs = d * 1440 + slot.startMinute;
        const endAbs = d * 1440 + slot.endMinute;
        if (endAbs <= nowAbs) continue; // today's window already passed
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-block recipe-pick-btn';
        const name = document.createElement('span');
        name.className = 'recipe-pick-name';
        name.textContent = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : formatDate(d);
        const meta = document.createElement('span');
        meta.className = 'recipe-pick-ings';
        meta.textContent = `${slot.label} · ${formatTime(slot.startMinute)}`;
        btn.append(name, meta);
        btn.addEventListener('click', () => finish({ startAbs, endAbs, slotId: slot.id }));
        list.appendChild(btn);
      }
    }
    if (list.childElementCount === 0) {
      const none = document.createElement('p');
      none.className = 'dim';
      none.textContent = 'No meal windows left to schedule right now.';
      list.appendChild(none);
    }
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Ask schedule modal (asks-and-attachments-plan.md Phase 4, D8) --------
// The calendar step of a schedule:true ask. The NPC already accepted in
// stage 1 (deterministically — see resolveAsk); here the player picks a
// window. Days within COMMITMENT_TUNING.maxInviteAheadDays, a header per
// day, one button per genuinely free window probed by asks.js's
// freeSlotsFor (the same resolveScheduleActivity/busyBlocks read
// respondToCommitment uses — work/commute/sleep windows never appear, so
// the stage-2 recheck in doConvSend is belt-and-braces, not a second
// negotiation). Resolves to { startAbs, endAbs } or null on Cancel. Reuses
// #modal-overlay + the recipe-pick row chrome, mirroring
// openDinnerInvitePicker. freeSlotsFor is a call-time dep (asks.js loads
// after render.js), which is fine — this runs only when the player sends a
// scheduled ask.
//
// Phase 5 (D10): with `mealLabels` set (the meal ask), a row whose window
// overlaps a COMMITMENT_TUNING.mealSlots window is labeled with the inferred
// meal ("Breakfast" / "Lunch" / "Dinner") instead of the phase — the player
// can see what they're about to book; windows outside every meal window
// keep the plain phase label. mealLabelForWindow is a call-time dep too.
function openAskScheduleModal({ title, npcId, mealLabels }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !titleEl || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    const gs = currentGameState;
    const npc = gs && gs.npcs && gs.npcs[npcId];
    const clock = gs && gs.meta && gs.meta.clock;
    if (!gs || !npc || !clock) { resolve(null); return; }
    titleEl.textContent = title;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'recipe-pick-list';
    const nowAbs = clockToAbsolute(clock);
    let any = false;
    for (let offset = 0; offset < COMMITMENT_TUNING.maxInviteAheadDays; offset++) {
      const dayAbs = clock.day + offset;
      const slots = freeSlotsFor(npc, dayAbs, nowAbs);
      if (slots.length === 0) continue;
      const head = document.createElement('div');
      head.className = 'ask-sched-day';
      head.textContent = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : formatDate(dayAbs);
      list.appendChild(head);
      for (const slot of slots) {
        any = true;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-block recipe-pick-btn';
        const name = document.createElement('span');
        name.className = 'recipe-pick-name';
        name.textContent = `${formatTime(slot.startAbs % 1440)}–${formatTime(slot.endAbs % 1440)}`;
        const meta = document.createElement('span');
        meta.className = 'recipe-pick-ings';
        const meal = mealLabels ? mealLabelForWindow(slot.startAbs % 1440, slot.endAbs % 1440) : null;
        if (meal) {
          meta.textContent = meal.label;
        } else {
          const phase = getPhase(slot.startAbs % 1440);
          meta.textContent = `${phase.charAt(0).toUpperCase() + phase.slice(1)} — free`;
        }
        btn.append(name, meta);
        btn.addEventListener('click', () => finish(slot));
        list.appendChild(btn);
      }
    }
    if (!any) {
      const none = document.createElement('p');
      none.className = 'dim';
      none.textContent = 'No free windows in the next few days.';
      list.appendChild(none);
    }
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Intimacy picker (Intimacy & Voyeurism Phase 11, D3) ------------------
// The Make-a-Move flow's generic single-select picker (partner step, then act
// step), mirroring openEatPicker. `rows` = [{ id, label, meta? }]; resolves
// to the picked row's id, or null on Cancel. One picker, two steps — the
// flow (UI.doMakeAMove) owns what each step is asking.
function openIntimacyPicker({ title, rows }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !titleEl || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (id) => { overlay.removeAttribute('data-open'); resolve(id); };
    titleEl.textContent = title;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'recipe-pick-list';
    for (const row of (rows || [])) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block recipe-pick-btn';
      const name = document.createElement('span');
      name.className = 'recipe-pick-name';
      name.textContent = row.label || row.id;
      btn.appendChild(name);
      if (row.meta) {
        const meta = document.createElement('span');
        meta.className = 'recipe-pick-ings';
        meta.textContent = row.meta;
        btn.appendChild(meta);
      }
      btn.addEventListener('click', () => finish(row.id));
      list.appendChild(btn);
    }
    body.appendChild(list);
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Room-search modal (inventory overhaul Phase 8, D8) ---
// Searching a roommate's room surfaces their possessions. One row per
// owned stack, each with a Take button — disabled for key items (no one
// takes a roommate's wallet; the player's own keyItems are protected the
// same way). Resolves to { defId, qty } or null on Close. Browsing is
// free; the TAKE (UI's doTakeFromRoom) pays the time.
function openRoomSearchModal(npc) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (choice) => { overlay.removeAttribute('data-open'); resolve(choice); };
    title.textContent = `${npc.bible.name || 'Their'} room — what's here`;
    body.innerHTML = '';
    const inv = npc.inventory || [];
    if (inv.length === 0) {
      const none = document.createElement('p');
      none.className = 'dim';
      none.textContent = 'Not much here — a few bare shelves and dust.';
      body.appendChild(none);
    } else {
      const list = document.createElement('div');
      list.className = 'recipe-pick-list';
      for (const stack of inv) {
        if (!(stack?.qty > 0)) continue;
        const def = ITEM_DEFS[stack.defId] || ITEM_DEFS._unknown;
        const label = def.id === '_unknown' ? (stack.meta?.origName || def.label) : def.label;
        const keyItem = !!(stack.meta?.keyItem || def.keyItem);
        const row = document.createElement('div');
        row.className = 'ctr-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'ctr-row-name';
        nameEl.textContent = `${label}${stack.qty > 1 ? ` ×${stack.qty}` : ''}`;
        row.appendChild(nameEl);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary tiny';
        if (keyItem) {
          btn.textContent = 'Personal';
          btn.disabled = true;
        } else {
          btn.textContent = 'Take';
          btn.addEventListener('click', () => finish({ defId: stack.defId, qty: 1 }));
        }
        row.appendChild(btn);
        list.appendChild(row);
      }
      body.appendChild(list);
    }
    actions.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// --- Save menu (inventory overhaul Phase 9, D10): the VN-style slot grid ---
// Cards render from kv.saveIndex alone — never a deserialized payload (a
// payload can be megabytes; the index is a few hundred bytes per entry).
// Thumbnails reuse the LRU image cache in STATE by storing the scene
// image's CACHE KEY in the record (meta.thumbKey) and resolving it to a
// blob on demand; no second copy of the image ever exists. When the key
// has been evicted or never generated, the card shows a room-coloured
// placeholder. Opening is free browsing; the verbs (save/load/overwrite/
// delete/export/import) live in UI and are meta actions, not in-world ones.
let saveMenuMode = 'save'; // 'save' | 'load'
let saveMenuBusy = false;

function openSaveMenu(mode) {
  const panel = document.getElementById('save-panel');
  if (!panel) return;
  // The menu modal is a different overlay; never stack them.
  if (typeof closeModal === 'function') closeModal();
  if (typeof closeInventoryPanel === 'function') closeInventoryPanel();
  if (typeof closeContainerPanel === 'function') closeContainerPanel();
  saveMenuMode = mode || 'save';
  panel.hidden = false;
  renderSaveMenu();
}

function closeSaveMenu() {
  const panel = document.getElementById('save-panel');
  if (panel) panel.hidden = true;
}

// Room-coloured thumbnail placeholder: deterministic colour per room, with
// the room's first letter — designed state, not a failure state.
const SAVE_THUMB_COLORS = [
  '#232342', '#2a2a4a', '#322a5a', '#2a3a5a', '#3a2a4a', '#23404a',
  '#4a3a2a', '#2a4a3a', '#40404a', '#3a3355', '#1f3352', '#4a2a33',
];
function roomThumbColor(roomId) {
  let h = 0;
  for (const ch of String(roomId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SAVE_THUMB_COLORS[h % SAVE_THUMB_COLORS.length];
}

function formatPlaytime(ms) {
  const totalMin = Math.floor((ms || 0) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function kindBadge(kind) {
  switch (kind) {
    case 'manual': return 'Manual';
    case 'auto': return 'Auto';
    case 'quick': return 'Quick';
    case 'exit': return 'Exit';
    default: return String(kind || '');
  }
}

async function renderSaveMenu() {
  if (saveMenuBusy) return; // one async render at a time
  saveMenuBusy = true;
  const panel = document.getElementById('save-panel');
  const grid = document.getElementById('svp-grid');
  const hint = document.getElementById('svp-hint');
  const title = document.getElementById('svp-title');
  if (!panel || !grid) { saveMenuBusy = false; return; }
  try {
    title.textContent = saveMenuMode === 'load' ? 'Load Game' : 'Save Game';
    grid.innerHTML = '';
    const sections = await buildSaveSlotGrid();
    const cap = await saveCapacityInfo();

    const hintText = saveMenuMode === 'load'
      ? 'Pick a slot to load. Current progress is replaced.'
      : (cap.warn ? `Warning: only ${cap.free} save slot${cap.free === 1 ? '' : 's'} free.` : 'Pick a slot to save into.');
    if (hint) hint.textContent = hintText;

    for (const section of sections) {
      const secEl = document.createElement('div');
      secEl.className = 'svp-section';
      const label = document.createElement('div');
      label.className = 'svp-section-label';
      label.textContent = section.label;
      secEl.appendChild(label);
      const row = document.createElement('div');
      row.className = 'svp-grid';
      for (const slot of section.slots) {
        row.appendChild(await renderSaveCard(slot, saveMenuMode));
      }
      secEl.appendChild(row);
      grid.appendChild(secEl);
    }
  } finally {
    saveMenuBusy = false;
  }
}

async function renderSaveCard(slot, mode) {
  const tpl = document.getElementById('tpl-save-card');
  const node = tpl.content.cloneNode(true);
  const card = node.querySelector('.svp-card');
  card.setAttribute('data-slot', slot.slotId);
  const entry = slot.entry;

  if (!entry) {
    card.classList.add('svp-empty');
    const empty = node.querySelector('.svp-empty-label');
    if (empty) empty.textContent = 'Empty slot';
    const actions = node.querySelector('.svp-card-actions');
    if (mode === 'save') {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn tiny';
      saveBtn.textContent = 'Save here';
      saveBtn.setAttribute('data-action', 'save-slot');
      saveBtn.setAttribute('data-slot', slot.slotId);
      actions.appendChild(saveBtn);
    }
    return node;
  }

  const m = entry.meta || {};
  const kind = entry.kind || '';
  const badge = node.querySelector('.svp-kind-badge');
  if (badge) { badge.textContent = kindBadge(kind); badge.setAttribute('data-kind', kind); }
  const dayEl = node.querySelector('.svp-day');
  if (dayEl) dayEl.textContent = `Day ${m.day ?? 1} · ${formatTime(m.minutes ?? CLOCK.startMinutes)}`;
  const locEl = node.querySelector('.svp-loc');
  if (locEl) locEl.textContent = `${ROOMS[m.roomId]?.name || m.roomId || 'Unknown room'} · ${m.money ?? 0}`;
  const headEl = node.querySelector('.svp-headline');
  if (headEl) headEl.textContent = m.headline || '—';
  const castEl = node.querySelector('.svp-cast');
  const names = Array.isArray(m.castNames) ? m.castNames : [];
  if (castEl) {
    castEl.textContent = names.length === 0 ? '' : `With ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
  }
  const timeEl = node.querySelector('.svp-played');
  if (timeEl) timeEl.textContent = `Played ${formatPlaytime(m.playtimeMs)}`;

  // Thumbnail: cache-key resolution against the shared LRU, never a copy.
  const thumb = node.querySelector('.svp-thumb');
  const roomId = m.roomId;
  if (thumb) {
    thumb.style.background = roomThumbColor(roomId);
    const letter = node.querySelector('.svp-thumb-letter');
    if (letter) letter.textContent = (ROOMS[roomId]?.name || roomId || '?').charAt(0).toUpperCase();
    const img = node.querySelector('.svp-thumb-img');
    if (img && m.thumbKey) {
      getCachedImage(m.thumbKey).then(blob => {
        if (!blob) return;
        if (img.getAttribute('data-loaded')) return;
        img.setAttribute('data-loaded', '');
        img.src = createObjectUrl(m.thumbKey, blob);
        img.classList.add('svp-thumb-visible');
        if (letter) letter.classList.add('svp-thumb-hidden');
      }).catch(() => {});
    }
  }

  const actions = node.querySelector('.svp-card-actions');
  if (mode === 'save') {
    const overwrite = document.createElement('button');
    overwrite.type = 'button';
    overwrite.className = 'btn btn-secondary tiny';
    overwrite.textContent = 'Overwrite';
    overwrite.setAttribute('data-action', 'save-overwrite');
    overwrite.setAttribute('data-slot', slot.slotId);
    actions.appendChild(overwrite);
  } else {
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'btn tiny';
    load.textContent = 'Load';
    load.setAttribute('data-action', 'load-slot');
    load.setAttribute('data-slot', slot.slotId);
    actions.appendChild(load);
  }
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-secondary tiny';
  del.textContent = 'Delete';
  del.setAttribute('data-action', 'save-delete');
  del.setAttribute('data-slot', slot.slotId);
  actions.appendChild(del);
  const exp = document.createElement('button');
  exp.type = 'button';
  exp.className = 'btn btn-secondary tiny';
  exp.textContent = 'Export';
  exp.setAttribute('data-action', 'save-export');
  exp.setAttribute('data-slot', slot.slotId);
  actions.appendChild(exp);

  return node;
}

// --- Deliveries ---
function renderDeliveries(gs) {
  const container = document.getElementById('delivery-list');
  if (!container) return;
  container.innerHTML = '';
  const deliveries = gs.world.deliveries || [];
  if (deliveries.length === 0) return;
  for (const d of deliveries) {
    const div = document.createElement('div');
    div.className = 'inv-item';
    const label = ITEM_DEFS[d.defId]?.label || d.defId || d.item || 'a package';
    const qty = d.qty > 1 ? ` ×${d.qty}` : '';
    div.textContent = `${label}${qty} — ${d.status}`;
    container.appendChild(div);
  }
}

// --- Action chips (tabbed) ---
// Categories are tabs; only the active tab's chips are shown at a time.
// This keeps the footer to a single row of chips regardless of how many
// actions exist, eliminating the wrap/scroll problem. The active tab
// persists in footerActiveTab; when the active tab becomes empty (e.g.
// after moving to a room with no NPCs) it falls back to the first tab.
let footerActiveTab = null;

// Cached groups from the last full renderActionChips call, so tab switches
// can rebuild only the tabs+chips DOM without touching the rest of the page.
let _lastActionGroups = [];

// --- Nested action navigation (D14) -------------------------------
// A chip is either a leaf (has `action`) or a group (has `children`).
// Groups render with a trailing ▸ and, when tapped, drill down INTO the
// chips row itself: the row's other buttons disappear and a "‹" chip is
// pinned first, popping back up the levels you came from (one tap per
// level; the root of the active tab is the "Home" list). The stack lives
// in _actionNavStack ([] = at a tab's root) and survives re-renders, so
// executing an action inside a submenu doesn't bounce you back home —
// it only resets when you move rooms or switch tabs. Group chips render
// before flat chips at every level, and `‹` is always first inside a
// submenu, per the two ordering rules that define this UI.
let _actionNavStack = [];
let _lastNavRoom = null;

function resetActionNav() { _actionNavStack = []; }

function openActionGroup(groupKey) {
  _actionNavStack.push(groupKey);
  renderActionChipsOnly();
}

function navigateActionBack() {
  _actionNavStack.pop();
  renderActionChipsOnly();
}

// Walk _actionNavStack down the active tab's chip tree to the currently
// shown level. Levels whose group no longer exists (left the room, an
// object moved) are dropped rather than crashed over — the stack silently
// rewinds to the deepest still-valid level.
function resolveNavLevel(group) {
  let level = group.chips;
  const valid = [];
  for (const key of _actionNavStack) {
    const sub = level.find(c => c.children?.length && c.groupKey === key);
    if (!sub) break;
    valid.push(key);
    level = sub.children;
  }
  if (valid.length !== _actionNavStack.length) _actionNavStack = valid;
  return level;
}

// The verbs of a grouping-only ACTION_DEFS entry (e.g. 'door.interact')
// as leaf chips, inheriting the parent chip's context (room/object/NPC).
// A {name} in a verb label (the bed-boundary verbs) resolves to the NPC
// the parent chip points at — the drill-down replaces the old popover's
// name substitution one for one.
function submenuVerbChips(parentChip) {
  const verbs = ACTION_DEFS[parentChip.action]?.submenu || [];
  const out = [];
  for (const verbId of verbs) {
    const vdef = ACTION_DEFS[verbId];
    if (!vdef) continue;
    let label = vdef.label;
    if (label.includes('{name}')) {
      const npcId = parentChip.npcId;
      label = label.replace('{name}', currentGameState?.npcs?.[npcId]?.bible?.name || 'Them');
    }
    out.push({ label, action: verbId, extra: parentChip.extra, npcId: parentChip.npcId });
  }
  return out;
}

function renderActionChips(gs, sceneState) {
  const chipContainer = document.getElementById('action-chips');
  const tabContainer = document.getElementById('footer-tab-row');
  if (!chipContainer || !tabContainer) return;
  chipContainer.innerHTML = '';
  tabContainer.innerHTML = '';

  // Moving rooms invalidates every open submenu — start back at the tab's
  // root so a stale drill-down can never linger into an unrelated room.
  if (_lastNavRoom !== gs.player.location) { _actionNavStack = []; _lastNavRoom = gs.player.location; }

  const phase = gs.meta.clock.phase;
  const player = gs.player;
  const energyDepleted = player.energy <= 0;

  const groups = buildActionGroups(gs, sceneState, phase, energyDepleted);
  if (groups.length === 0) { _lastActionGroups = []; return; }

  const tabIds = groups.map(g => g.id);
  if (!footerActiveTab || !tabIds.includes(footerActiveTab)) footerActiveTab = tabIds[0];
  const activeGroup = groups.find(g => g.id === footerActiveTab);
  if (!activeGroup || activeGroup.chips.length === 0) {
    footerActiveTab = groups.find(g => g.chips.length > 0)?.id || tabIds[0];
  }

  _lastActionGroups = groups;
  _renderTabsAndChips(groups, energyDepleted);
}

// Lightweight re-render of only the tabs + chips row (used on tab click).
// Does NOT rebuild the rest of the page, so nothing else shifts.
function renderActionChipsOnly() {
  const chipContainer = document.getElementById('action-chips');
  const tabContainer = document.getElementById('footer-tab-row');
  if (!chipContainer || !tabContainer || _lastActionGroups.length === 0) return;
  chipContainer.innerHTML = '';
  tabContainer.innerHTML = '';

  const tabIds = _lastActionGroups.map(g => g.id);
  if (!tabIds.includes(footerActiveTab)) footerActiveTab = tabIds[0];
  const activeGroup = _lastActionGroups.find(g => g.id === footerActiveTab);
  if (!activeGroup || activeGroup.chips.length === 0) {
    footerActiveTab = _lastActionGroups.find(g => g.chips.length > 0)?.id || tabIds[0];
  }

  const energyDepleted = currentGameState?.player?.energy <= 0;
  _renderTabsAndChips(_lastActionGroups, energyDepleted);
}

function _renderTabsAndChips(groups, energyDepleted) {
  const chipContainer = document.getElementById('action-chips');
  const tabContainer = document.getElementById('footer-tab-row');

  for (const group of groups) {
    const tab = document.createElement('button');
    tab.className = 'footer-tab';
    tab.setAttribute('data-tab', group.id);
    if (group.id === footerActiveTab) tab.setAttribute('data-active', '');
    tab.textContent = group.label;
    if (group.chips.length > 0) tab.setAttribute('data-count', group.chips.length);
    if (group.chips.length === 0) {
      tab.disabled = true;
    } else {
      tab.addEventListener('click', () => {
        footerActiveTab = group.id;
        // A new tab is a new root — any drill-down in the old tab is reset.
        resetActionNav();
        renderActionChipsOnly();
      });
    }
    tabContainer.appendChild(tab);
  }

  const active = groups.find(g => g.id === footerActiveTab);
  if (active) {
    const level = resolveNavLevel(active);
    // The back chip is ALWAYS the first option in a submenu.
    if (_actionNavStack.length > 0) {
      const back = document.createElement('button');
      back.className = 'chip chip-nav-back';
      back.setAttribute('data-nav-back', '');
      back.setAttribute('aria-label', 'Back');
      back.textContent = '‹';
      chipContainer.appendChild(back);
    }
    // Ordering rule: grouped buttons first, then flat actions.
    const groupChips = level.filter(c => c.children?.length);
    const leafChips = level.filter(c => !c.children?.length);
    for (const chip of [...groupChips, ...leafChips]) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      if (chip.action) btn.setAttribute('data-action', chip.action);
      if (chip.npcId) btn.setAttribute('data-npc', chip.npcId);
      if (chip.extra?.roomId) btn.setAttribute('data-room-id', chip.extra.roomId);
      if (chip.extra?.rowId) btn.setAttribute('data-row-id', chip.extra.rowId);
      if (chip.extra?.objId) btn.setAttribute('data-obj-id', chip.extra.objId);
      // A chip with children is a group: tapping it drills down into the
      // chips row (ui.js routes [data-submenu-parent] to openActionGroup),
      // and the stable data-group-key is what the nav stack resolves on.
      if (chip.children?.length) {
        btn.classList.add('chip-submenu');
        btn.setAttribute('data-submenu-parent', '');
        btn.setAttribute('data-group-key', chip.groupKey);
      }
      btn.textContent = chip.label;
      if (chip.action && energyDepleted && !isActionExemptFromEnergyGate(chip.action)) btn.disabled = true;
      chipContainer.appendChild(btn);
    }
  }
  maybeChipNudgeHint();
}

// Phase 2 (D3): chip-strip affordance. refreshChipScrollState keeps
// #action-chips[data-scrollable] honest — set only while a chip is actually
// cut off, dropped again once the strip is scrolled to its end, so the CSS
// fade paints only in that state. maybeChipNudgeHint gives coarse-pointer
// players one 80px nudge per session so they see the strip moves at all.
let _chipsScrollListening = false;
function refreshChipScrollState() {
  const chips = document.getElementById('action-chips');
  if (!chips) return;
  const scrollable = chips.scrollWidth - chips.clientWidth > 1;
  chips.toggleAttribute('data-scrollable', scrollable);
  if (!_chipsScrollListening) {
    _chipsScrollListening = true;
    chips.addEventListener('scroll', () => {
      chips.toggleAttribute('data-scrollable', chips.scrollWidth - chips.clientWidth > 1);
    }, { passive: true });
  }
}

function maybeChipNudgeHint() {
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
  if (sessionStorage.getItem('chipsNudgeHinted')) return;
  refreshChipScrollState();
  const chips = document.getElementById('action-chips');
  if (!chips || !chips.hasAttribute('data-scrollable')) return;
  sessionStorage.setItem('chipsNudgeHinted', '1');
  const from = chips.scrollLeft;
  const to = Math.min(from + 80, chips.scrollWidth - chips.clientWidth);
  if (to <= from) return;
  const start = performance.now();
  const dur = 550;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    chips.scrollLeft = from + (to - from) * (1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Bucketing: which named group a Here chip belongs to, by likeness — the
// object you're interacting with (a device, the bed, a container) or the
// family of act (food, hygiene, relaxation, notes). ACTION_DEFS.group is
// the declarative half; hand-built chips (computer/sleep/containers) are
// tagged with an explicit `bucket` when they're created. A bucket only
// becomes a real group chip when it has something to show (2+ leaves, or
// a single child that is itself a group) — one-off actions stay flat so a
// lone chip never hides behind an extra tap.
const HERE_BUCKET_ORDER = ['devices', 'containers', 'bed', 'food', 'hygiene', 'relax', 'notes'];
const HERE_BUCKET_LABELS = { devices: 'Devices', containers: 'Containers', bed: 'Bed', food: 'Food', hygiene: 'Bathroom', relax: 'Relax', notes: 'Notes' };

function defBucketFor(action) {
  const g = ACTION_DEFS[action]?.group;
  if (action === 'self.nap') return 'bed';
  if (g === 'phone' || g === 'sound') return 'devices';
  if (g === 'kitchen') return 'food';
  if (g === 'bathroom') return 'hygiene';
  if (g === 'living_room' || g === 'chill') return 'relax';
  if (g === 'intimacy') return 'bed';
  if (g === 'here') return 'notes';
  return null;
}

function partitionHereChips(hereChips) {
  const buckets = new Map();
  const flat = [];
  for (const chip of hereChips) {
    const b = chip.bucket || defBucketFor(chip.action);
    if (b) {
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(chip);
    } else {
      flat.push(chip);
    }
  }
  const groups = [];
  for (const key of HERE_BUCKET_ORDER) {
    const children = buckets.get(key);
    if (!children?.length) continue;
    const leafTotal = children.reduce((n, c) => n + (c.children?.length ? countLeaves(c.children) : 1), 0);
    if (leafTotal === 1) { flat.push(children[0]); continue; }
    groups.push({ label: HERE_BUCKET_LABELS[key], groupKey: key, children });
  }
  return { groups, flat };
}

function countLeaves(chips) {
  return chips.reduce((n, c) => n + (c.children?.length ? countLeaves(c.children) : 1), 0);
}

function buildActionGroups(gs, sceneState, phase, energyDepleted) {
  const player = gs.player;
  const roomId = player.location;
  const adjacentRooms = ROOM_ADJACENCY[roomId] || [];
  const groups = [];

  // Go
  const goChips = [];
  for (const adjId of adjacentRooms) {
    const room = ROOMS[adjId];
    if (!room) continue;
    goChips.push({ label: room.name, action: 'move', extra: { roomId: adjId } });
  }
  groups.push({ id: 'go', label: 'Go', chips: goChips });

  // Here
  const hereChips = [];
  hereChips.push({ label: 'Look Around', action: 'look' });
  if (player.location === 'bedroom_player') {
    if (phase === 'night' || phase === 'early_morning') hereChips.push({ label: 'Sleep', action: 'sleep', bucket: 'bed' });
    hereChips.push({ label: 'Use Computer', action: 'computer.use', bucket: 'devices' });
  }
  for (const avail of resolveAvailableActions(gs)) {
    if (!avail.ok) continue;
    hereChips.push({ label: avail.label, action: avail.actionId });
  }
  // Inventory overhaul Phase 2: every browsable container in this room is
  // an "Open <X>" chip — the fridge/pantry in the kitchen, the doormat and
  // shoe rack in the entry, the floor anywhere. Opening is free browsing;
  // the transfer verbs inside cost time (UI's doContainerTransfer*), so
  // the chest can never sidestep the clock.
  for (const obj of Object.values(gs.objects?.[`room_${roomId}`] || {})) {
    const def = OBJECT_DEFS[obj.defId];
    if (!def?.affords?.includes('container.open')) continue;
    // Intimacy & Voyeurism Phase 5 (D11): the wardrobe is a multi-verb object
    // and renders as one "Wardrobe ▸" submenu chip (Change Outfit / Open) —
    // the same Phase 1 (D5) pattern as the door — instead of a flat Open
    // chip. The verb rows inherit the objId via the parent chip's context.
    if (obj.defId === 'wardrobe') {
      const wardrobeChip = {
        label: def.container?.label || def.label || 'Wardrobe',
        action: 'wardrobe.interact',
        bucket: 'containers',
        groupKey: `wardrobe-${obj.id}`,
        extra: { objId: obj.id },
      };
      wardrobeChip.children = submenuVerbChips(wardrobeChip);
      hereChips.push(wardrobeChip);
      continue;
    }
    const label = def.container?.label || def.label || 'Container';
    hereChips.push({ label: `Open ${label}`, action: 'container.open', bucket: 'containers', extra: { objId: obj.id } });
  }
  // Intimacy & Voyeurism Phase 19 (sound): sound devices render as "X >"
  // submenu chips — Play / Set Volume / Eject (SOUND_DEVICE_DEFS.affords),
  // the same Phase 1 (D5) pattern as the door/wardrobe/bed. The device's
  // objId rides on the parent chip as data-obj-id so the verbs act on the
  // exact device they were opened from.
  for (const key of Object.keys(SOUND_DEVICE_DEFS)) {
    const sdef = SOUND_DEVICE_DEFS[key];
    if (!sdef.sourceObjDef) continue;
    const obj = Object.values(gs.objects?.[`room_${roomId}`] || {}).find(o => o.defId === sdef.sourceObjDef);
    if (!obj) continue;
    const soundChip = {
      label: OBJECT_DEFS[obj.defId]?.label || sdef.label,
      action: 'sound.interact',
      bucket: 'devices',
      groupKey: `sound-${obj.id}`,
      extra: { objId: obj.id },
    };
    soundChip.children = submenuVerbChips(soundChip);
    hereChips.push(soundChip);
  }
  // Intimacy & Voyeurism Phase 17 (D13): a bed with a resident asleep in
  // this room offers the boundary submenu — Slide Into Bed / Watch Them
  // Sleep. `sleepingOccupantInRoom` is the whole gate (someone genuinely
  // asleep here); the sleeper rides on the parent chip as data-npc so the
  // popover verbs know who they'd be getting into bed with. Mirrors the
  // wardrobe's multi-verb-object pattern; `bed.interact` is grouping-only
  // (never executes) and the verb rows are intercepted in ui.js before the
  // registered-action bridge.
  for (const obj of Object.values(gs.objects?.[`room_${roomId}`] || {})) {
    if (obj.defId !== 'bed' && obj.defId !== 'bed_basic') continue;
    const sleeperId = sleepingOccupantInRoom(gs, roomId);
    if (sleeperId) {
      // The bed bucket is the place for everything bed-shaped: the boundary
      // verbs (Slide Into Bed / Watch Them Sleep) merge in as plain leaves
      // alongside Nap/Sleep/Masturbate rather than nesting a second "Bed ▸"
      // inside the Bed group.
      const bedChip = { label: 'Bed', action: 'bed.interact', extra: { objId: obj.id }, npcId: sleeperId };
      for (const child of submenuVerbChips(bedChip)) { child.bucket = 'bed'; hereChips.push(child); }
    }
    break;
  }
  if ((player.rentOwed || 0) > 0) hereChips.push({ label: `Pay Rent (${player.rentOwed})`, action: 'pay-rent' });
  if (Object.values(gs.world.bills || {}).some(b => b && b.cutoffActive)) hereChips.push({ label: 'Pay Bills (service cut off)', action: 'pay-bills' });
  // Door chips. In the hallways every reachable bedroom/bathroom door is
  // one you can do something at (peek/listen/unlock/knock/open), so those
  // get the full "X Door ▸" submenu. The player's OWN door is normally
  // ceremony-free — you just walk in — but a LOCKED one is the one way your
  // own lock locks YOU out (lock from inside, walk out, now it's sealed),
  // so it appears only then. And anywhere at all, a locked ADJACENT door —
  // the ensuite case: you can lock bathroom_a from inside it and leave —
  // needs an Unlock affordance. Only the player ever locks doors, so a
  // locked door you're standing next to is always your own lock to undo.
  for (const adjId of adjacentRooms) {
    const roomType = ROOMS[adjId]?.type;
    const isBedroom = roomType === 'bedroom';
    const isBathroom = adjId === 'bathroom_a' || adjId === 'bathroom_b';
    if (!isBedroom && !isBathroom) continue;
    const locked = getDoorState(gs, adjId) === 'locked';
    const inHallway = roomId === 'hallway_a' || roomId === 'hallway_b';
    if (adjId === 'bedroom_player') {
      if (!locked) continue;
    } else if (!inHallway && !locked) {
      continue;
    }
    const roomName = ROOMS[adjId]?.name || 'Room';
    // Outside the hallways the voyeurism verbs make no sense — the chip is
    // a flat Unlock, and nothing else.
    if (!inHallway) {
      hereChips.push({
        label: adjId === 'bedroom_player' ? `Unlock ${roomName} Door` : `Unlock the ${roomName} Door`,
        action: 'door.unlock',
        extra: { roomId: adjId },
      });
      continue;
    }
    // Intimacy & Voyeurism Phase 1 (D5): a multi-verb door renders as one
    // "X Door ▸" chip drilling into its verbs. The verbs live in
    // ACTION_DEFS' 'door.interact' submenu; the flat Open/Knock/Peek
    // chips are gone and the adjacent room's id rides on the parent chip
    // as room context for every sub-verb.
    const doorChip = {
      label: `${roomName} Door`,
      action: 'door.interact',
      groupKey: `door-${adjId}`,
      extra: { roomId: adjId },
    };
    // Unlock is only real against a locked door — drop it otherwise.
    const verbs = submenuVerbChips(doorChip);
    doorChip.children = locked ? verbs : verbs.filter(v => v.action !== 'door.unlock');
    hereChips.push(doorChip);
  }
  // Phase 8 (D8): searching a roommate's room surfaces their possessions
  // (openRoomSearchModal) and taking something routes through the
  // suspicion path. Unlike the hallway's Open/Knock/Peek family, you're
  // ALREADY inside the room to do this, so the chip lives in the Here
  // group — shown for any resident's bedroom you're standing in.
  // Notes (perception plan Phase 4): offered wherever there's something to
  // stick one to. `surfaces: true` on an OBJECT_DEFS entry is the whole gate —
  // a fridge, a door, the dining table. Reading and binning are ACTION_DEFS
  // entries and arrive as ordinary object-sourced chips; only writing needs a
  // chip of its own, because it needs a text box and the effects pipeline has
  // nowhere to put one.
  const roomObjectsHere = gs.objects?.[`room_${roomId}`] || {};
  const surface = Object.values(roomObjectsHere).find(o => OBJECT_DEFS[o.defId]?.surfaces);
  const noteCount = Object.values(roomObjectsHere).filter(o => o.defId === 'note').length;
  if (surface && noteCount < NOTE_TUNING.maxPerRoom) {
    hereChips.push({
      label: `Leave a Note on the ${OBJECT_DEFS[surface.defId].label}`,
      action: 'write-note',
    });
  }

  const roomOwner = roomOwnerId(roomId, gs.npcs);
  if (roomOwner && roomOwner !== 'player') {
    const owner = gs.npcs[roomOwner];
    if (owner && owner.residency?.status === 'resident') {
      hereChips.push({ label: `Search ${owner.bible.name || 'Their'} Room`, action: 'search-room', npcId: roomOwner });
    }
  }
  // Group by likeness and render groups before flat actions.
  const { groups: hereGroups, flat: hereFlat } = partitionHereChips(hereChips);
  groups.push({ id: 'here', label: 'Here', chips: [...hereGroups, ...hereFlat] });

  // Social
  const socialChips = [];
  const presentNpcIds = getPresentNpcIds(gs.npcs, roomId);
  // Initiative plan Phase 4 (D8): the channels an NPC opens that the player has
  // no existing verb for go FIRST, because they are the only chips in this
  // group that are about something already happening to you. An approach is
  // deliberately not here — it is answered by Talk and refused by Go, which is
  // why Phase 3 needed no surface — so the gate is the def declaring `respond`
  // rather than the record existing.
  //
  // The knocker is in another room by construction, so this walks every NPC
  // rather than the present ones. `overtureRespondTargets` is what decides
  // whether their record is one this player, standing here, can answer.
  for (const { npcId, npc, respond } of overtureRespondTargets(gs)) {
    const name = npc.bible?.name || 'Them';
    socialChips.push({ label: respond.accept.replace('{name}', name), action: 'overture.accept', npcId });
    socialChips.push({ label: respond.decline.replace('{name}', name), action: 'overture.decline', npcId });
  }
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    socialChips.push({ label: `Talk to ${npc.bible.name || 'Someone'}`, action: 'talk', npcId });
  }
  // Intimacy & Voyeurism Phase 11 (D3): Make a Move — one chip whenever
  // someone is present; the flow picks the partner (when several are) and the
  // act. The paired acts never render as flat chips (their ACTION_DEFS source
  // kind is 'paired', which actionSourceMatches rejects), so this chip is
  // their only door — D3's symmetric-initiation surface, gated by the same
  // Phase 9 willingness function the NPC side uses.
  if (presentNpcIds.length > 0) {
    socialChips.push({ label: 'Make a Move', action: 'make_a_move' });
  }
  // Intimacy & Voyeurism Phase 17 (D14): the three-way act. Two residents
  // present is the surface; the GATE (all three parties' willingness +
  // desire) lives in boundary.js's resolveBoundaryThroupleGate and is read
  // at execution time — the chip never pre-filters on it, exactly like
  // Make-a-Move lets the gate say no with a person's voice. The flow picks
  // the two partners, so the chip is one generic row.
  if (presentNpcIds.length >= 2) {
    socialChips.push({ label: 'Propose a Threesome', action: 'boundary.throuple' });
  }
  // Meal commitments (overhaul Phase 7, D7): inviting a Housemate to a
  // shared dinner is an in-person ask — pick a day and a meal window, and
  // they answer on the spot (acceptance is deterministic; see
  // COMMITMENTS.respondToCommitment). Only residents sit down at the
  // household table — a guest arrives through the visits system instead.
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    if (npc.residency?.status !== 'resident') continue;
    socialChips.push({ label: `Invite ${npc.bible.name || 'Them'} to Dinner`, action: 'invite-dinner', npcId });
  }
  // Contacts (external-world plan Phase 2): ask for someone's number. Only
  // offered for people you don't already have — residents included, since
  // living together doesn't mean you can text them. Whether they say yes is
  // personality-weighted, not a flat threshold (see doAskContact, UI).
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    if (npc.contactKnown) continue;
    socialChips.push({ label: `Ask ${npc.bible.name || 'Them'} for Their Number`, action: 'ask-contact', npcId });
  }
  // Escorts (external-world plan Phase 7): during an active booked visit,
  // each purchased service becomes a chip — the mechanical half of the dual
  // enforcement. Only the booked set is ever reachable (the in-character
  // half is the prompt boundary, PROMPT.buildEscortBoundaryText). The
  // handler re-checks against the LIVE booking regardless, so a stale chip
  // from a just-ended visit can't actually do anything.
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    const booking = getActiveEscortVisit(gs, npcId);
    if (!booking) continue;
    for (const serviceId of booking.services || []) {
      const def = ESCORT_SERVICE_DEFS[serviceId];
      if (!def) continue;
      socialChips.push({ label: `${def.label} with ${npc.bible.name || 'Them'}`, action: 'escort.request-service', npcId, extra: { rowId: serviceId } });
    }
  }
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    const quest = (gs.world.quests?.active || []).find(q =>
      q.type === 'chain' && q.npcId === npcId &&
      q.steps[q.currentStep]?.type === 'give_item' && !q.steps[q.currentStep]?.done
    );
    // Intimacy & Voyeurism Phase 16 (D2/D14): the Give Item chip also appears
    // for a cold-shouldering NPC WITHOUT a quest — gifting is a reparation
    // act (one severity per landed gift). Quest-gated gifting keeps its own
    // itemCategory; the repair branch takes any gift-category item.
    const wantCategory = quest && quest.steps[quest.currentStep]
      ? quest.steps[quest.currentStep].itemCategory
      : (coldShoulderActive(npc) ? 'gift' : null);
    if (wantCategory || quest) {
      const hasItem = (gs.player.inventory || []).some(stack => {
        const def = ITEM_DEFS[stack.defId];
        return def && (!wantCategory || def.category === wantCategory);
      });
      if (hasItem) {
        socialChips.push({ label: `Give Item to ${npc.bible.name || 'Someone'}`, action: 'give-item', npcId });
      }
    }
    // Phase 16: the apology reparation chip — only while the NPC is cold-
    // shouldering. Deterministic success per the hurt state (ui.doApologizeNpc).
    if (coldShoulderActive(npc)) {
      socialChips.push({ label: `Apologize to ${npc.bible.name || 'Them'}`, action: 'apologize', npcId });
    }
  }
  // Intimacy & Voyeurism Phase 18 (D16): the player's side of the "trying"
  // flag — a deliberate high-chance mode with a partner they've already
  // been intimate with (npc.flags._intimacyHistory is the Phase 9 recency
  // writer's record, partnerId 'player' on the target). Purely a flags
  // toggle: the ACT still goes through the same willingness gate as ever —
  // trying changes the odds of conception, never anyone's willingness
  // (invariant 1 holds; the gate is upstream).
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    const tryingWith = (gs.player.flags || {})._tryingWith;
    const intimateBefore = npc?.flags?._intimacyHistory?.lastWith === 'player';
    if (!intimateBefore && tryingWith !== npcId) continue;
    socialChips.push(tryingWith === npcId
      ? { label: `Stop Trying with ${npc.bible?.name || 'Them'}`, action: 'pregnancy.stop-trying', npcId }
      : { label: `Try for a Baby with ${npc.bible?.name || 'Them'}`, action: 'pregnancy.start-trying', npcId });
  }
  groups.push({ id: 'social', label: 'Social', chips: socialChips });

  // More
  groups.push({ id: 'misc', label: 'More', chips: [{ label: 'Wait', action: 'wait' }] });

  return groups;
}

// --- The scene reader (scene-reader plan Phase 2) ---
// Projects SCENE's composeScene onto the DOM. This function holds NO logic
// of its own — every decision about what belongs in a scene, what gets
// emphasis and what is history was already made in the pure layer (design
// invariant 1). If something here needs an `if` about game state, it belongs
// in composeScene instead.
//
// Replaces renderNarrationLog, which rendered the last 50 session-log entries
// as identical divs with no notion of place, time or a current moment.
// Returns the composed scene so the caller can mark its callouts spent
// (SCENE's markCalloutsShouted). The renderer deliberately does not do that
// itself — it is a projection, and a projection that writes to the thing it
// is projecting is how presentation and state start to disagree.
function renderSceneReader(gs, sceneState) {
  const root = document.getElementById('scene-reader');
  if (!root) return null;
  const scene = composeScene(gs, sceneState);

  // Heading — where and when.
  const heading = document.getElementById('scene-heading');
  if (heading) {
    heading.innerHTML = '';
    const room = document.createElement('span');
    room.className = 'sr-room';
    room.textContent = scene.heading.roomName;
    const when = document.createElement('span');
    when.className = 'sr-when';
    when.textContent = `${scene.heading.dayLabel} · ${scene.heading.timeLabel}`;
    heading.append(room, when);
  }

  // Establishing passage — presence, then callouts, then the rest of what
  // can be sensed. Callouts sit above the ordinary sensory lines so the
  // thing demanding attention is read first.
  const est = document.getElementById('scene-establishing');
  if (est) {
    est.innerHTML = '';
    // Intimacy & Voyeurism Phase 5 (D11): your own state leads the
    // establishing passage — what you're wearing (or not wearing) is the
    // first thing the scene has to say about you. Only present when the
    // composed scene has something worth saying (transient/naked state or a
    // notable outfit like a swimsuit).
    if (scene.self) {
      const el = document.createElement('div');
      el.className = 'sr-self';
      el.textContent = scene.self;
      est.appendChild(el);
    }
    for (const p of scene.presence) {
      const el = document.createElement('div');
      el.className = 'sr-presence';
      el.textContent = p.line;
      est.appendChild(el);
    }
    // Door cues (intimacy-voyeurism Phase 3, D4): what the doors in front of
    // you are whispering. Rendered right after the people, before the louder
    // sensory layer — a door you are standing at is the first thing you read.
    for (const c of scene.doorCues || []) {
      const el = document.createElement('div');
      el.className = 'sr-door-cue';
      el.setAttribute('data-kind', c.kind);
      el.textContent = sentence(c.line);
      est.appendChild(el);
    }
    const calloutIds = new Set(scene.callouts.map(c => c.signalId));
    for (const c of scene.callouts) {
      const el = document.createElement('div');
      el.className = 'sr-callout';
      el.textContent = sentence(c.phrase);
      est.appendChild(el);
    }
    for (const sig of scene.sensory) {
      if (calloutIds.has(sig.signalId)) continue;  // already shown, louder
      const el = document.createElement('div');
      el.className = 'sr-sensory';
      el.setAttribute('data-here', String(sig.here));
      el.textContent = sentence(sig.here
        ? sig.phrase
        : `${sig.phrase}, drifting in from the ${sig.sourceRoomName}`);
      est.appendChild(el);
    }
    if (est.childElementCount === 0) {
      const el = document.createElement('div');
      el.className = 'sr-empty';
      el.textContent = 'Quiet. Nothing much to see or smell.';
      est.appendChild(el);
    }
  }

  // Beats — what has happened since you walked in. Reuses #tpl-log-entry, so
  // the per-type styling that already existed (dialogue/action/internal)
  // keeps working untouched.
  const beats = document.getElementById('scene-beats');
  if (beats) {
    beats.innerHTML = '';
    const tpl = document.getElementById('tpl-log-entry');
    for (const entry of scene.beats) {
      beats.appendChild(buildLogEntryNode(tpl, entry));
    }
    // D16 now/before: flag the newest beat so the reader can render it as
    // the big bright anchor while earlier beats shrink + grey-shift.
    const lastBeat = beats.lastElementChild;
    if (lastBeat) lastBeat.classList.add('is-latest');
    beats.scrollTop = beats.scrollHeight;
  }

  // History — closed scenes, folded away and subordinate (invariant 5).
  const history = document.getElementById('scene-history');
  const list = document.getElementById('scene-history-list');
  const summary = document.getElementById('scene-history-summary');
  if (history && list && summary) {
    history.hidden = scene.history.length === 0;
    summary.textContent = `Earlier — ${scene.history.length} scene${scene.history.length === 1 ? '' : 's'}`;
    list.innerHTML = '';
    for (const h of scene.history) {
      const row = document.createElement('div');
      row.className = 'sr-history-scene';
      const t = document.createElement('span');
      t.className = 'sr-history-time';
      t.textContent = h.timeLabel;
      const r = document.createElement('span');
      r.className = 'sr-history-room';
      r.textContent = h.roomName;
      const c = document.createElement('span');
      c.className = 'sr-history-count';
      c.textContent = `${h.beatCount}`;
      row.append(t, r, c);
      list.appendChild(row);
    }
  }

  return scene;
}

// --- The peek/listen lens (intimacy-voyeurism Phase 10, D6/D7) ----------
// Projects the PEEK session onto the #peek-overlay DOM. Holds NO logic of
// its own (the same split as the scene reader): every decision was already
// made in peek.js's pure layer. Called once per session tick — never on a
// full page render — so the lens and its risk meter move while the rest of
// the page stays still.
function renderPeekOverlay(gs, session, view) {
  const overlay = document.getElementById('peek-overlay');
  if (!overlay || !session) return;
  overlay.removeAttribute('hidden');
  overlay.setAttribute('data-mode', session.mode);

  const heading = document.getElementById('peek-heading');
  if (heading) heading.textContent = session.mode === 'peek' ? 'Peeking' : 'Listening';

  const caption = document.getElementById('peek-caption');
  if (caption) {
    const line = session._viewLine || (session.mode === 'peek'
      ? 'You peer through the keyhole…' : 'You listen at the door…');
    caption.textContent = sentence(line);
  }

  const meta = document.getElementById('peek-meta');
  if (meta) {
    const secs = Math.round(session.ticksElapsed * PEEK.realTickMs / 1000);
    meta.textContent = `held for ${secs}s`;
  }

  const riskFill = document.getElementById('peek-risk-fill');
  if (riskFill) {
    const bucket = Math.round(Math.max(0, Math.min(1, session.riskAccum / PEEK.maxRisk)) * 100 / 5) * 5;
    riskFill.setAttribute('data-fill', bucket);
  }

  const stopBtn = document.getElementById('peek-stop-btn');
  if (stopBtn) stopBtn.textContent = session.mode === 'peek' ? 'Stop Watching' : 'Stop Listening';
}

// --- The moodle strip (scene-reader plan Phase 3, D8) ---
// What the player is aware of, as glyphs. Sensory signals always; a need only
// once it has crossed into warn territory, because the footer status row
// already shows all four as labelled bars with percentages — a second, iconic
// copy of the same four numbers would be noise, and the point of this strip is
// that everything on it wants attention.
function renderSceneMoodles(gs) {
  const strip = document.getElementById('scene-moodles');
  if (!strip) return;
  strip.innerHTML = '';

  const add = (kind, glyph, label, opacity, critical) => {
    const el = document.createElement('span');
    el.className = 'sr-moodle';
    el.setAttribute('data-kind', kind);
    if (critical) el.setAttribute('data-critical', '');
    el.title = label;
    const g = document.createElement('span');
    g.className = 'sr-moodle-glyph';
    g.textContent = glyph;
    if (opacity != null) g.style.opacity = String(opacity);
    el.appendChild(g);
    return el;
  };

  // A raw perceived record carries no prose — `phrase` is attached by SCENE's
  // sensoryLines, not by perceiveSignals — so resolve it here for the
  // tooltip. Reading rec.phrase directly gave every moodle an empty title.
  const perceived = mergePerceived(perceiveSignals(gs, 'player', gs.player.location));
  for (const rec of perceived) {
    const el = add('signal', signalIcon(rec.signalId), sentence(signalPhrase(rec, gs)),
                   SIGNAL_ICONS.bandOpacity[rec.band]);
    const pip = document.createElement('span');
    pip.className = 'sr-moodle-pip';
    pip.textContent = rec.band === 'strong' ? '●' : rec.band === 'clear' ? '◐' : '○';
    el.appendChild(pip);
    strip.appendChild(el);
  }

  // Needs, only when they have crossed a threshold the player should act on.
  const p = gs.player;
  const needMoodles = [
    ['energy',  '😴', 'Tired',  p.energy,  NEEDS.energy.warnBelow],
    ['hunger',  '🍽', 'Hungry', p.hunger,  NEEDS.hunger.warnBelow],
    ['hygiene', '🧼', 'Grubby', p.hygiene, NEEDS.hygiene.warnBelow],
  ];
  for (const [id, glyph, label, value, warnBelow] of needMoodles) {
    if (typeof value !== 'number' || value >= warnBelow) continue;
    strip.appendChild(add('need', glyph, `${label} — ${Math.round(value)}%`, null, value < warnBelow / 2));
  }

  strip.hidden = strip.childElementCount === 0;
}

// Capitalise a composed clause into a sentence. The authored signal phrases
// are written as fragments ("dishes stacked in the sink") precisely so they
// can be composed into larger lines elsewhere — the scene reader is where
// they become sentences.
function sentence(text) {
  if (!text) return '';
  const trimmed = text.trim();
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : capped + '.';
}

// One log entry -> one node. Extracted from the old renderNarrationLog so the
// beats list and any future consumer share exactly one idea of how an entry
// looks; the type-specific branches below are unchanged from that function.
function buildLogEntryNode(tpl, entry) {
  const node = tpl.content.cloneNode(true);
  const el = node.querySelector('.log-entry');
  el.setAttribute('data-type', entry.type);

  if (entry.type === 'dialogue') {
    el.querySelector('.speaker').textContent = `${entry.speaker}: `;
    el.querySelector('.speech').textContent = `"${entry.text}"`;
  } else if (entry.type === 'narration') {
    el.querySelector('.speaker').textContent = '';
    el.querySelector('.speech').textContent = entry.text;
  } else if (entry.type === 'action') {
    el.querySelector('.speaker').textContent = '';
    el.querySelector('.speech').textContent = entry.text;
    el.classList.add('log-action');
  } else if (entry.type === 'internal') {
    el.querySelector('.speaker').textContent = '';
    el.querySelector('.speech').textContent = entry.text;
    el.classList.add('log-internal');
  } else if (entry.type === 'system') {
    el.textContent = entry.text;
  } else {
    el.textContent = entry.text || '';
  }
  return node;
}

// --- Footer ---
function renderFooter(gs) {
  const input = document.getElementById('input-bar');
  if (input) input.disabled = false;
}

// ===== /SECTION: RENDER =====
