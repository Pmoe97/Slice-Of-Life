// ===== SECTION: RENDER =====
// State → DOM. Idempotent. Toggles classes and data-* attributes only.
// No inline styles. No state mutation. No direct kv access.

// --- Main render entry point (idempotent) ---
function render(gameState, sceneState) {
  if (!gameState) return;
  renderHeader(gameState);
  renderRoomList(gameState);
  renderPlayerPanel(gameState);
  renderScene(gameState, sceneState);
  renderPresentList(gameState, sceneState);
  renderQuestList(gameState);
  renderInventory(gameState);
  renderDeliveries(gameState);
  renderActionChips(gameState, sceneState);
  renderNarrationLog(gameState);
  renderFooter(gameState);
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
  if (hdrRoom) hdrRoom.textContent = ROOMS[player.location]?.name || player.location;

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

// --- Room list ---
function renderRoomList(gs) {
  const container = document.getElementById('room-list');
  if (!container) return;
  const currentRoom = gs.player.location;

  container.innerHTML = '';
  const tpl = document.getElementById('tpl-room-item');

  for (const roomId of ALL_ROOMS) {
    const node = tpl.content.cloneNode(true);
    const item = node.querySelector('.room-item');
    item.setAttribute('data-room-id', roomId);
    item.querySelector('.room-name').textContent = ROOMS[roomId].name;

    // Occupancy dots (live presence, derived from npc.location)
    const occDiv = item.querySelector('.room-occupants');
    const occCount = getPresentNpcIds(gs.npcs, roomId).length;
    for (let i = 0; i < Math.min(occCount, 4); i++) {
      const dot = document.createElement('span');
      dot.className = 'room-dot';
      dot.setAttribute('data-present', '');
      occDiv.appendChild(dot);
    }

    if (roomId === currentRoom) item.setAttribute('data-current', '');
    container.appendChild(node);
  }
}

// --- Player panel ---
function renderPlayerPanel(gs) {
  const stats = document.getElementById('pp-stats');
  if (!stats) return;
  const { player } = gs;

  stats.innerHTML = '';
  const items = [
    { label: 'Money', val: `$${player.money}` },
    { label: 'Energy', val: `${Math.round(player.energy)}%` },
    { label: 'Hunger', val: `${Math.round(player.hunger)}%` },
    { label: 'Mood', val: moodLabel(player.mood) },
  ];
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
    node.querySelector('.q-desc').textContent = q.desc || '';
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
    div.textContent = `${d.item} — ${d.status}`;
    container.appendChild(div);
  }
}

// --- Action chips ---
function renderActionChips(gs, sceneState) {
  const container = document.getElementById('action-chips');
  if (!container) return;
  container.innerHTML = '';

  const phase = gs.meta.clock.phase;
  const player = gs.player;

  const chips = [];
  // Always available
  chips.push({ label: 'Look Around', action: 'look' });
  chips.push({ label: 'Wait', action: 'wait' });
  if ((player.rentOwed || 0) > 0) {
    chips.push({ label: `Pay Rent ($${player.rentOwed})`, action: 'pay-rent' });
  }

  // Location-dependent
  if (player.location === 'bedroom_player') {
    if (phase === 'night' || phase === 'early_morning') {
      chips.push({ label: 'Sleep', action: 'sleep' });
    }
    chips.push({ label: 'Work', action: 'work' });
  }
  // Eat/Cook/Shower/Watch TV/Relax are registered actions (ACTIONS section)
  // rather than hardcoded here — resolveAvailableActions queries
  // ACTION_DEFS the same way the apartment and (from P4) the computer both
  // will, instead of each surface keeping its own if-chain.
  for (const avail of resolveAvailableActions(gs)) {
    if (!avail.ok) continue;
    chips.push({ label: avail.label, action: avail.actionId });
  }

  // Talk to present NPCs. The active-conversation cap (SCENE.maxActiveNpcs)
  // belongs on who's speaking, not on who's addressable — every present
  // NPC gets a chip; addressing an ambient one promotes them (and, per
  // promoteToActive, narrates a demotion if the cap is already full).
  const roomId = player.location;
  const presentNpcIds = getPresentNpcIds(gs.npcs, roomId);
  const activeSet = new Set(sceneState?.active || []);
  for (const npcId of presentNpcIds) {
    const npc = gs.npcs[npcId];
    if (activeSet.has(npcId)) continue; // already in conversation — no need to re-click Talk
    chips.push({ label: `Talk to ${npc.bible.name || 'Someone'}`, action: 'talk', npcId });
  }

  // Step away from an active conversation — the natural-exit chip. Ask to
  // Leave is a consequential, hard-to-reverse action, so it's only offered
  // once you're actually in conversation with them, never a stray chip in
  // a crowded room.
  for (const npcId of sceneState?.active || []) {
    const npc = gs.npcs[npcId];
    if (!npc) continue;
    chips.push({ label: `Step Away from ${npc.bible.name || 'Someone'}`, action: 'step-away', npcId });
    if (npc.residency.status === 'resident') {
      chips.push({ label: `Ask ${npc.bible.name || 'Someone'} to Leave`, action: 'ask-to-leave', npcId });
    }
  }

  for (const chip of chips) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.setAttribute('data-action', chip.action);
    if (chip.npcId) btn.setAttribute('data-npc', chip.npcId);
    btn.textContent = chip.label;
    container.appendChild(btn);
  }
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
