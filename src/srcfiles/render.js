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
  renderNarrationLog(gameState);
  renderFooter(gameState);
  // Harmless when #main-content isn't in computer mode (CSS keeps
  // #computer-screen hidden either way) — always redrawing it here means
  // every path that already calls render() keeps the computer screen in
  // sync for free, rather than every computer action needing to remember
  // a second render call.
  if (gameState.world.computer) renderComputerScreen(gameState);
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
    svg += `<rect ${attrs}/>`;

    // Label (shortened if room is small)
    const name = ROOMS[roomId].name;
    const label = r.w < 35 && name.length > 8 ? name.substring(0, 7) + '…' : name;
    svg += `<text class="fp-room-label" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 2}">${escapeHtml(label)}</text>`;

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
    const h12 = player.alarm === 0 ? 12 : player.alarm > 12 ? player.alarm - 12 : player.alarm;
    const ampm = player.alarm < 12 ? 'am' : 'pm';
    items.push({ label: 'Alarm', val: `${h12}:00 ${ampm}` });
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

// --- Inventory ---
function renderInventory(gs) {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  container.innerHTML = '';

  const inv = gs.player.inventory || [];
  if (inv.length === 0) {
    container.innerHTML = '<span class="dim tiny">Empty pockets.</span>';
    return;
  }

  const tpl = document.getElementById('tpl-inv-item');
  for (const item of inv) {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.inv-name').textContent = inventoryDisplayName(item);
    node.querySelector('.inv-qty').textContent = item.qty > 1 ? `×${item.qty}` : '';
    container.appendChild(node);
  }
}

// Resolves a stack's display name from ITEM_DEFS (ITEMS section). Also
// tolerates un-migrated legacy shapes (bare strings, {name,qty}) so this
// keeps working during the window before a save's `player` folder has
// actually run its 1->2 migration.
function inventoryDisplayName(item) {
  if (typeof item === 'string') return item;
  if (item.defId) return ITEM_DEFS[item.defId]?.label || item.meta?.origName || item.defId;
  return item.name || 'Unknown item';
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
  if ((player.rentOwed || 0) > 0) hereChips.push({ label: `Pay Rent (${player.rentOwed})`, action: 'pay-rent' });
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
  groups.push({ id: 'here', label: 'Here', chips: hereChips });

  // Social
  const socialChips = [];
  const presentNpcIds = getPresentNpcIds(gs.npcs, roomId);
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    socialChips.push({ label: `Talk to ${npc.bible.name || 'Someone'}`, action: 'talk', npcId });
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

// --- Narration log ---
function renderNarrationLog(gs) {
  const container = document.getElementById('narration-log');
  if (!container) return;
  const log = gs.meta.sessionLog || [];
  container.innerHTML = '';

  if (log.length === 0) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.setAttribute('data-type', 'system');
    entry.textContent = 'You wake up in your new apartment. It\'s the first day.';
    container.appendChild(entry);
    return;
  }

  const tpl = document.getElementById('tpl-log-entry');
  for (const entry of log.slice(-50)) {
    const node = tpl.content.cloneNode(true);
    const el = node.querySelector('.log-entry');
    el.setAttribute('data-type', entry.type);

    if (entry.type === 'dialogue') {
      el.querySelector('.speaker').textContent = `${entry.speaker}: `;
      el.querySelector('.speech').textContent = `"${entry.text}"`;
    } else if (entry.type === 'narration') {
      el.querySelector('.speaker').textContent = '';
      el.querySelector('.speech').textContent = entry.text;
    } else if (entry.type === 'action') {  // NPC Overhaul Phase 2
      el.querySelector('.speaker').textContent = '';
      el.querySelector('.speech').textContent = entry.text;
      el.classList.add('log-action');
    } else if (entry.type === 'internal') {  // NPC Overhaul Phase 2
      el.querySelector('.speaker').textContent = '';
      el.querySelector('.speech').textContent = entry.text;
      el.classList.add('log-internal');
    } else if (entry.type === 'system') {
      el.textContent = entry.text;
    } else {
      el.textContent = entry.text || '';
    }
    container.appendChild(node);
  }
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// --- Footer ---
function renderFooter(gs) {
  const input = document.getElementById('input-bar');
  if (input) input.disabled = false;
}

// ===== /SECTION: RENDER =====
