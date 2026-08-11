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
  markCalloutsShouted(gameState, renderSceneReader(gameState, sceneState));
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
}

// --- Floor plan (SVG) ---
// Replaces the flat room list with a 2D schematic of the apartment.
// Rooms are positioned rectangles, connected by dashed adjacency lines.
// The player's current room is highlighted; adjacent rooms are clickable;
// distant rooms are dimmed. NPC presence shown as colored dots.
function renderFloorPlan(gs) {
  const container = document.getElementById('floor-plan');
  if (!container) return;
  const currentRoom = gs.player.location;
  const adjacent = ROOM_ADJACENCY[currentRoom] || [];

  // SVG viewBox — matches ROOM_LAYOUT coordinates
  const vbW = 160, vbH = 220;

  let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += '<defs><pattern id="fp-hazard" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(224,160,64,0.18)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(224,160,64,0.5)" stroke-width="2.5"/></pattern></defs>';

  // Connectors (drawn first, behind rooms)
  const drawn = new Set();
  for (const [room, neighbors] of Object.entries(ROOM_ADJACENCY)) {
    const r1 = ROOM_LAYOUT[room];
    if (!r1) continue;
    for (const n of neighbors) {
      const pairKey = [room, n].sort().join('|');
      if (drawn.has(pairKey)) continue;
      drawn.add(pairKey);
      const r2 = ROOM_LAYOUT[n];
      if (!r2) continue;
      const x1 = r1.x + r1.w / 2, y1 = r1.y + r1.h / 2;
      const x2 = r2.x + r2.w / 2, y2 = r2.y + r2.h / 2;
      svg += `<line class="fp-connector" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
  }

  // Every signal in the apartment, keyed by the room it originates in
  // (SIGNALS' signalsByRoom). Computed once for the whole plan rather than
  // per room.
  const signalMap = typeof signalsByRoom === 'function' ? signalsByRoom(gs) : {};

  // Rooms
  for (const roomId of ALL_ROOMS) {
    const r = ROOM_LAYOUT[roomId];
    if (!r) continue;
    const isCurrent = roomId === currentRoom;
    const isAdjacent = adjacent.includes(roomId);
    const isDistant = !isCurrent && !isAdjacent;

    let attrs = `class="fp-room" data-room-id="${roomId}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2"`;
    if (isCurrent) attrs += ' data-current=""';
    else if (isAdjacent) attrs += ' data-adjacent=""';
    if (isDistant) attrs += ' data-distant=""';
    // Renovation overhaul Phase 3: any facility in this room with an active
    // contracted job renders the room as a construction site.
    const constructionJob = getActiveJobForRoom(gs, roomId);
    if (constructionJob) attrs += ' data-construction=""';
    svg += `<rect ${attrs}/>`;

    // Label (shortened if room is small)
    const name = ROOMS[roomId].name;
    const label = r.w < 35 && name.length > 8 ? name.substring(0, 7) + '…' : name;
    svg += `<text class="fp-room-label" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 2}">${escapeHtml(label)}</text>`;

    // Scene-reader plan Phase 3 (D9): what this room is EMITTING, not what
    // the player perceives — the floor plan is a map of where things are
    // coming from. Strongest first, capped, opacity by band.
    const roomSignals = (signalMap[roomId] || []).slice(0, SIGNAL_ICONS.maxPerRoom);
    if (roomSignals.length > 0) {
      const glyphs = roomSignals.map((sig, i) => {
        const gx = r.x + r.w / 2 + (i - (roomSignals.length - 1) / 2) * 6;
        return `<text class="fp-signal" x="${gx}" y="${r.y + r.h / 2 + 7}" opacity="${SIGNAL_ICONS.bandOpacity[sig.band]}">${signalIcon(sig.signalId)}</text>`;
      });
      svg += glyphs.join('');
    }

    // Under-construction tag, below the room name (hazard fill applied via
    // CSS on .fp-room[data-construction]).
    if (constructionJob) {
      svg += `<text class="fp-construction-label" x="${r.x + r.w / 2}" y="${r.y + r.h + 8}">Under construction</text>`;
    }

    // NPC dots
    const present = getPresentNpcIds(gs.npcs, roomId);
    if (present.length > 0) {
      const dotR = 2.2;
      const dotY = r.y + r.h / 2 + 4;
      const spacing = 5;
      const startX = r.x + r.w / 2 - (present.length - 1) * spacing / 2;
      for (let i = 0; i < Math.min(present.length, 5); i++) {
        const npc = gs.npcs[present[i]];
        const sleeping = npc?.activity === 'sleeping' || npc?.activity === 'sleep';
        const inTransit = !!npc?.transit;
        let dotAttrs = `class="fp-npc-dot" cx="${startX + i * spacing}" cy="${dotY}" r="${dotR}"`;
        if (sleeping) dotAttrs += ' data-sleeping=""';
        if (inTransit) dotAttrs += ' data-transit=""';
        svg += `<circle ${dotAttrs}/>`;
      }
    }

    // Door lock indicator
    const doorState = getDoorState(gs, roomId);
    if (doorState === 'locked') {
      svg += `<text class="fp-door-icon" x="${r.x + r.w - 3}" y="${r.y + 5}">🔒</text>`;
    }
  }

  svg += '</svg>';
  container.innerHTML = svg;
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
    { label: 'Hunger', val: `${Math.round(player.hunger)}%` },
    { label: 'Mood', val: moodLabel(player.mood) },
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
function renderScene(gs, sceneState) {
  const img = document.getElementById('scene-img');
  const label = document.getElementById('scene-label');
  if (!img) return;
  const { meta, player } = gs;
  const roomId = player.location;
  const phase = meta.clock.phase;

  if (label) label.textContent = `${ROOMS[roomId]?.name || roomId} — ${CLOCK.phaseNames[phase] || phase}`;

  // npc objects (currentGameState.npcs[id]) never carry their own id —
  // it only ever exists as the map key — so getSceneImage's internal
  // `.map(n => n.id)` for cache-key composition always saw `undefined`
  // regardless of who was actually present, meaning every scene in a
  // given room/phase collided on one cache key no matter who was in it.
  // Attach id here, at the one call site that has it, rather than
  // changing IMAGE's function signature.
  const activeNpcs = (sceneState?.active || [])
    .map(id => (gs.npcs[id] ? { ...gs.npcs[id], id } : null))
    .filter(Boolean);
  const sceneKey = composeSceneKey(roomId, phase, 'normal', activeNpcs.map(n => n.id));

  // Idempotent: only touch the image (placeholder swap + async fetch) when
  // the scene actually changed. Re-stamping data-loading and swapping to
  // the placeholder on every render() call — including calls where
  // nothing about the scene changed — flickered the image after every
  // single action.
  if (img.getAttribute('data-scene-key') === sceneKey) return;
  img.setAttribute('data-scene-key', sceneKey);

  // Show placeholder immediately
  img.setAttribute('data-loading', '');
  img.src = getPlaceholder();

  // Generate scene async. roomObjects (WORLD) drives the room-specific
  // detail phrase in the prompt — note the scene cache key doesn't yet
  // reflect object state, so a room getting dirtier won't by itself
  // trigger new art; that's a deliberate deferral (regenerating art on
  // every state change would be expensive), not an oversight.
  const roomObjects = gs.objects?.[`room_${roomId}`];
  getSceneImage(roomId, phase, activeNpcs, roomObjects).then(result => {
    if (img.getAttribute('data-scene-key') !== sceneKey) return; // scene moved on before this resolved
    if (result.url) {
      img.src = result.url;
      img.removeAttribute('data-loading');
    } else {
      img.removeAttribute('data-loading');
    }
  });
}

// --- Status strip: prominent need bars in the footer ---
// Compact one-row status display: icon + bar + percentage per need.
// Mood lives on [-1,1] natively but is remapped to 0-100% for display.
function renderStatusStrip(gs) {
  const row = document.getElementById('footer-status-row');
  if (!row) return;
  const { player } = gs;
  const needMap = { energy: player.energy, hunger: player.hunger, hygiene: player.hygiene, mood: player.mood };
  for (const [need, val] of Object.entries(needMap)) {
    const item = row.querySelector(`.fsi[data-need="${need}"]`);
    if (!item) continue;
    const fill = item.querySelector('.fsi-bar > .fill');
    const pctEl = item.querySelector('.fsi-pct');
    const displayPct = need === 'mood' ? (val + 1) * 50 : val;
    const bucket = Math.round(Math.max(0, Math.min(100, displayPct)) / 5) * 5;
    if (fill) fill.setAttribute('data-fill', bucket);
    if (pctEl) pctEl.textContent = Math.round(displayPct) + '%';
    const warnBelow = NEEDS[need].warnBelow;
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
  if (!grouped) stacks = sortStacks(stacks, invpSortMode, gs.meta.clock.day);

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
  renderInventoryDetail(gs, selected);
}

function appendInventoryRow(container, tpl, stack, gs) {
  const node = tpl.content.cloneNode(true);
  const row = node.querySelector('.invp-row');
  row.setAttribute('data-def-id', stack.defId);
  if (invpSelectedDefId === stack.defId) row.setAttribute('data-selected', '');
  const d = describeStack(stack, { day: gs.meta.clock.day });
  node.querySelector('.invp-row-name').textContent = d.label;
  node.querySelector('.invp-row-qty').textContent = `×${d.qty}`;
  node.querySelector('.invp-row-sublabel').textContent = d.sublabel;
  const tag = node.querySelector('.invp-freshness-tag');
  if (d.freshness) {
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
  node.querySelector('.invp-detail-name').textContent = d.label;
  node.querySelector('.invp-detail-meta').textContent = `×${d.qty} · ${d.sublabel}`;
  const descEl = node.querySelector('.invp-detail-desc');
  descEl.textContent = d.description + (d.tooltip ? ` ${d.tooltip}` : '');
  const freshEl = node.querySelector('.invp-detail-fresh');
  freshEl.textContent = d.freshnessText || 'Non-perishable';
  if (d.freshness) freshEl.setAttribute('data-state', d.freshness.key);
  else freshEl.removeAttribute('data-state');

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
    const n = containerStacks(obj).length;
    sub.textContent = n === 0 ? 'Empty.' : `${n} stack${n === 1 ? '' : 's'} inside.`;
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
  for (const stack of ordered) {
    const node = rowTpl.content.cloneNode(true);
    const row = node.querySelector('.ctr-row');
    row.setAttribute('data-side', side);
    row.setAttribute('data-def-id', stack.defId);
    if (ctrSelected?.side === side && ctrSelected?.defId === stack.defId) row.setAttribute('data-selected', '');
    // Phase 4: container-side rows compute freshness against THIS
    // container's preservation multiplier (bag side passes null).
    const d = describeStack(stack, { day: gs.meta.clock.day, containerDef });
    node.querySelector('.ctr-row-name').textContent = d.label;
    node.querySelector('.ctr-row-qty').textContent = `×${d.qty}`;
    const tag = node.querySelector('.ctr-freshness-tag');
    if (d.freshness) {
      tag.textContent = d.freshness.label;
      tag.setAttribute('data-state', d.freshness.key);
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
  putAll.disabled = !(canPut && bagStacks.length > 0);

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
      ings.textContent = recipe.ingredients.map(ing => `${ITEM_DEFS[ing.defId]?.label || ing.defId} ×${ing.qty}`).join(', ');
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

// --- Eat picker (overhaul Phase 3) ---
// The "What do you want to eat?" choice behind the Eat chip, mirroring
// openRecipePicker: one row per edible option (INVENTORY's edibleStacks),
// each showing what it is, where it is (bag / Fridge / Pantry), how many
// servings it has, and the per-serving restore. Resolves to
// { defId, from } or null on Cancel.
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
    for (const option of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-block eat-pick-btn';
      const name = document.createElement('span');
      name.className = 'eat-pick-name';
      name.textContent = option.def.label || 'Something';
      const meta = document.createElement('span');
      meta.className = 'eat-pick-meta';
      const sv = itemServings(option.def);
      const restore = consumableSummary(option.def, { perServing: sv > 1 });
      const metaParts = [];
      if (sv > 1) metaParts.push(`serves ${sv}`);
      if (restore) metaParts.push(`restores ${restore}`);
      meta.textContent = `${option.sourceLabel} · ${metaParts.join(' · ')}`;
      // Phase 4: flag non-Fresh options (the restore shown is the WHOLE
      // item's — a Spoiling/Rotten one restores far less and may sicken
      // you, see applyEatItem).
      const fresh = freshnessOf(option.stack, option.containerDef ?? null, option.day);
      if (fresh && fresh.key !== 'fresh') {
        const tag = document.createElement('span');
        tag.className = `eat-pick-freshness eat-pick-${fresh.key}`;
        tag.textContent = fresh.label;
        meta.appendChild(document.createTextNode(' · '));
        meta.appendChild(tag);
      }
      btn.append(name, meta);
      btn.addEventListener('click', () => finish({ defId: option.stack.defId, from: option.from }));
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

// --- Dinner-invite picker (overhaul Phase 7) ---
// "When should we eat?" behind the Invite to Dinner actions (in-person
// chip and the IM chat-header button). One button per day×meal-slot combo
// (today's slots whose window already passed are omitted), resolving to
// { day, tickStart, tickEnd, slotId } or null on Cancel.
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
    const tick = getTickIndex(currentGameState?.meta?.clock?.minutes ?? 0);
    for (let offset = 0; offset < COMMITMENT_TUNING.maxInviteAheadDays; offset++) {
      const d = day + offset;
      for (const slot of COMMITMENT_TUNING.mealSlots) {
        if (offset === 0 && tick >= slot.endTick) continue; // today's window already passed
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-block recipe-pick-btn';
        const name = document.createElement('span');
        name.className = 'recipe-pick-name';
        name.textContent = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : formatDate(d);
        const meta = document.createElement('span');
        meta.className = 'recipe-pick-ings';
        meta.textContent = `${slot.label} · ${formatTime(slot.startTick * 30)}`;
        btn.append(name, meta);
        btn.addEventListener('click', () => finish({ day: d, tickStart: slot.startTick, tickEnd: slot.endTick, slotId: slot.id }));
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

function renderActionChips(gs, sceneState) {
  const chipContainer = document.getElementById('action-chips');
  const tabContainer = document.getElementById('footer-tab-row');
  if (!chipContainer || !tabContainer) return;
  chipContainer.innerHTML = '';
  tabContainer.innerHTML = '';

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
        renderActionChipsOnly();
      });
    }
    tabContainer.appendChild(tab);
  }

  const active = groups.find(g => g.id === footerActiveTab);
  if (active) {
    for (const chip of active.chips) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.setAttribute('data-action', chip.action);
      if (chip.npcId) btn.setAttribute('data-npc', chip.npcId);
      if (chip.extra?.roomId) btn.setAttribute('data-room-id', chip.extra.roomId);
      if (chip.extra?.rowId) btn.setAttribute('data-row-id', chip.extra.rowId);
      if (chip.extra?.objId) btn.setAttribute('data-obj-id', chip.extra.objId);
      btn.textContent = chip.label;
      if (energyDepleted && !isActionExemptFromEnergyGate(chip.action)) btn.disabled = true;
      chipContainer.appendChild(btn);
    }
  }
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
    if (phase === 'night' || phase === 'early_morning') hereChips.push({ label: 'Sleep', action: 'sleep' });
    hereChips.push({ label: 'Use Computer', action: 'computer.use' });
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
    const label = def.container?.label || def.label || 'Container';
    hereChips.push({ label: `Open ${label}`, action: 'container.open', extra: { objId: obj.id } });
  }
  if ((player.rentOwed || 0) > 0) hereChips.push({ label: `Pay Rent (${player.rentOwed})`, action: 'pay-rent' });
  if (Object.values(gs.world.bills || {}).some(b => b && b.cutoffActive)) hereChips.push({ label: 'Pay Bills (service cut off)', action: 'pay-bills' });
  if (roomId === 'hallway_a' || roomId === 'hallway_b') {
    for (const adjId of adjacentRooms) {
      const roomType = ROOMS[adjId]?.type;
      const isBedroom = roomType === 'bedroom';
      const isBathroom = adjId === 'bathroom_a' || adjId === 'bathroom_b';
      if (!isBedroom && !isBathroom) continue;
      if (adjId === 'bedroom_player') continue;
      const roomName = ROOMS[adjId]?.name || 'Room';
      const ownerId = roomOwnerId(adjId, gs.npcs);
      hereChips.push({ label: `Open ${roomName} Door`, action: 'move', extra: { roomId: adjId } });
      if (isBedroom && ownerId) hereChips.push({ label: 'Knock', action: 'knock', npcId: adjId });
      let peepTarget = null;
      if (ownerId) {
        const owner = gs.npcs[ownerId];
        if (owner && owner.location === adjId) {
          const clothing = owner.clothing || 'dressed';
          if (clothing !== 'dressed' || owner.activity === 'showering') peepTarget = adjId;
        }
      } else if (isBathroom) {
        const present = getPresentNpcIds(gs.npcs, adjId);
        if (present.length > 0) {
          const npc = gs.npcs[present[0]];
          const clothing = npc.clothing || 'dressed';
          if (clothing !== 'dressed' || npc.activity === 'showering') peepTarget = adjId;
        }
      }
      if (peepTarget) hereChips.push({ label: `Peek into ${roomName}`, action: 'peep', npcId: peepTarget });
    }
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
  groups.push({ id: 'here', label: 'Here', chips: hereChips });

  // Social
  const socialChips = [];
  const presentNpcIds = getPresentNpcIds(gs.npcs, roomId);
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    socialChips.push({ label: `Talk to ${npc.bible.name || 'Someone'}`, action: 'talk', npcId });
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
    const quest = (gs.world.quests?.active || []).find(q =>
      q.type === 'chain' && q.npcId === npcId &&
      q.steps[q.currentStep]?.type === 'give_item' && !q.steps[q.currentStep]?.done
    );
    if (quest) {
      const step = quest.steps[quest.currentStep];
      const hasItem = (gs.player.inventory || []).some(stack => {
        const def = ITEM_DEFS[stack.defId];
        return def && (!step.itemCategory || def.category === step.itemCategory);
      });
      if (hasItem) {
        const npc = gs.npcs[npcId];
        socialChips.push({ label: `Give Item to ${npc.bible.name || 'Someone'}`, action: 'give-item', npcId });
      }
    }
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
    for (const p of scene.presence) {
      const el = document.createElement('div');
      el.className = 'sr-presence';
      el.textContent = p.line;
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
