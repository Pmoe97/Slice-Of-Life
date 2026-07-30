// ===== SECTION: UI =====
// Event delegation, input handling. Handlers read intent → call named functions.
// No logic inside handlers. No inline styles.

// --- Scene state (which NPCs are active vs ambient) ---
let currentSceneState = { present: [], active: [], ambient: [] };

// --- Current game state (in-memory, live and authoritative during play) ---
// Handlers mutate this directly. It is NOT a read-only mirror of kv — kv
// only catches up when a handler explicitly persists via saveAtBoundary
// (see the end of each do* function below). Losing that discipline is how
// saves silently stopped saving before this comment was corrected.
let currentGameState = null;

// --- Advance the clock N ticks, resolving every NPC each tick (never at a
// shared timestamp — see resolveBatch). Every time-costing action should
// route through this rather than calling advanceClock directly, so NPC
// schedules and off-screen events keep moving even during quick actions.
// Also: folds each off-screen event into the NPC who experienced it as a
// memory episode (so "Marcus had a rough day" is something Marcus can
// bring up later, via the existing memory→context pipeline), and decays
// every resident's memory by the elapsed ticks — decayMemory existed and
// was never called, so buildMemorySlice's decay>0.2 filter never actually
// pruned anything.
async function advanceAndResolve(ticks) {
  const dayBefore = currentGameState.meta.clock.day;
  const { state: newState, events } = resolveBatch(currentGameState, ticks);
  currentGameState = newState;
  appendWorldEvents(events);

  for (const evt of events) {
    const npc = currentGameState.npcs[evt.npcId];
    if (!npc) continue;
    const text = formatEventText(evt, currentGameState.npcs);
    const updated = await updateNpc(evt.npcId, n => addMemoryEpisode(n, evt.day, text, 0.5));
    currentGameState.npcs[evt.npcId] = updated;
  }

  for (const [id, npc] of Object.entries(currentGameState.npcs)) {
    if (npc.residency.status === 'former' || npc.residency.status === 'prospective') continue;
    if (!npc.memory.episodes || npc.memory.episodes.length === 0) continue;
    const decayed = await updateNpc(id, n => decayMemory(n, ticks));
    currentGameState.npcs[id] = decayed;
  }

  // Day-rollover economy: rent due/overdue, delivery arrivals, quest
  // generation/expiry. Runs once per calendar day crossed (a single
  // advanceAndResolve call can span at most one day boundary today given
  // the longest batch — sleep — is under a day, but this loops safely in
  // case that changes).
  const dayAfter = currentGameState.meta.clock.day;
  for (let d = dayBefore + 1; d <= dayAfter; d++) {
    await processDayRollover(d);
  }

  return events; // the events objects are the same references stored in
                 // currentGameState.world.events, so a caller marking one
                 // e.g. seenByPlayer mutates the real state, not a copy.
}

// --- Day rollover: rent, deliveries, quests ---

async function processDayRollover(day) {
  await processRentForDay(day);
  processDeliveriesForDay(day);
  processQuestsForDay(day);
  processWorkDeadlineForDay(day);
}

// COMPUTER's work app: an incomplete backlog at the deadline costs a
// strike; enough strikes and the player is let go. Always resolved
// (never a hard stop) — same "the house keeps living" principle as rent
// and quests above.
function processWorkDeadlineForDay(day) {
  if (!currentGameState.world.computer) return;
  const result = checkWorkDeadline(currentGameState, day);
  if (!result) return;
  if (result.fired) {
    addLogEntry('system', `You've been let go from ${result.title} — ${result.missed} task(s) missed too many times.`);
  } else {
    addLogEntry('system', `Missed ${result.missed} task(s) at ${result.title} (strike ${result.strikes}/${result.maxStrikes}).`);
  }
}

// Rent is a live system per the brief: a due charge posts every
// ECONOMY.payPeriodDays, and every day it stays unpaid costs the player
// mood and costs residents patience — "a primary driver of both economics
// and drama," not flavor text.
async function processRentForDay(day) {
  const player = currentGameState.player;
  const rent = currentGameState.world.rent;
  if (player.rentDueDay == null) player.rentDueDay = 1 + ECONOMY.payPeriodDays;

  if (day >= player.rentDueDay) {
    player.rentOwed = (player.rentOwed || 0) + rent.perResident;
    player.rentDueDay += ECONOMY.payPeriodDays;
    addLogEntry('system', `Rent is due: $${rent.perResident}. (Total owed: $${player.rentOwed})`);
  }

  if ((player.rentOwed || 0) > 0) {
    player.mood = Math.max(-1, player.mood - ECONOMY.rentLatePenaltyMood);
    for (const [id, npc] of Object.entries(currentGameState.npcs)) {
      if (npc.residency.status !== 'resident') continue;
      const updated = await updateNpc(id, n => applyRelDelta(n, { tension: ECONOMY.rentLateTensionPerDay }));
      currentGameState.npcs[id] = updated;
    }
  }
}

// Deliveries land on the hallway doormat (WORLD/ITEMS), not straight into
// the player's pockets — "you have to go get your package, and a
// roommate could get to it first" is the whole point of routing this
// through SPAWN_ITEM instead of pushing directly into player.inventory.
function processDeliveriesForDay(day) {
  const deliveries = currentGameState.world.deliveries || [];
  const doormat = Object.values(currentGameState.objects?.room_hallway || {}).find(o => o.defId === 'doormat');
  for (const d of deliveries) {
    if (d.status !== 'ordered' || day < d.etaDay) continue;
    d.status = 'delivered';
    const label = ITEM_DEFS[d.defId]?.label || d.defId || 'a package';
    if (doormat && d.defId) {
      doormat.contents = addStack(doormat.contents, d.defId, d.qty || 1, null, {});
      addLogEntry('narration', `A delivery has arrived: ${label}. It's waiting on the doormat.`);
    } else {
      addLogEntry('narration', `A delivery has arrived: ${label}.`);
    }
  }
}

// Daily goals sourced from resident wants/wounds/interests (brief §Identity:
// "daily goals with real consequences"). Generation is deterministic
// (seeded RNG, no LLM — consistent with SIM's off-screen resolution).
// Completion is deterministic too: talking to the referenced NPC while
// their quest is active resolves it (see checkQuestCompletion, called from
// doTalk) rather than depending on the LLM to report quest progress, which
// the proposal schema has no field for. Expiry is a real failure state.
function processQuestsForDay(day) {
  const quests = currentGameState.world.quests || { active: [], completed: [] };
  quests.completed = quests.completed || [];

  const stillActive = [];
  for (const q of quests.active) {
    if (day > q.expiresDay) {
      quests.completed.push({ ...q, status: 'failed', resolvedDay: day });
      addLogEntry('system', `Goal missed: ${q.title}`);
    } else {
      stillActive.push(q);
    }
  }
  quests.active = stillActive;

  const residentIds = Object.keys(currentGameState.npcs).filter(id => currentGameState.npcs[id].residency.status === 'resident');
  if (quests.active.length < QUEST_CONFIG.maxActive && residentIds.length > 0) {
    const rng = seededRng(currentGameState.meta.seed, `quest_${day}`);
    if (rng() < QUEST_CONFIG.generateChancePerDay) {
      const npcId = residentIds[Math.floor(rng() * residentIds.length)];
      const npc = currentGameState.npcs[npcId];
      const tmpl = QUEST_TEMPLATES[Math.floor(rng() * QUEST_TEMPLATES.length)];
      const detail = tmpl.type === 'want' ? npc.bible.want
        : tmpl.type === 'wound' ? npc.bible.wound
        : (npc.bible.interests[0]?.name || 'something they like');
      const title = tmpl.template.replace('{name}', npc.bible.name || 'your roommate').replace('{detail}', detail);
      const quest = {
        id: `quest_${day}_${npcId}`,
        title,
        desc: `Talk to ${npc.bible.name || 'them'} to follow up.`,
        npcId,
        type: tmpl.type,
        rewardMoney: tmpl.rewardMoney,
        rewardRelation: tmpl.rewardRelation,
        day,
        expiresDay: day + QUEST_CONFIG.expiryDays,
        status: 'active',
      };
      quests.active.push(quest);
      addLogEntry('system', `New goal: ${quest.title}`);
    }
  }

  currentGameState.world.quests = quests;
}

// Resolve any active quest referencing this NPC — called from doTalk.
// Deterministic: the mere act of talking to them is the completion
// trigger, not something the LLM needs to report.
async function checkQuestCompletion(npcId) {
  const quests = currentGameState.world.quests;
  if (!quests || !quests.active) return;
  const idx = quests.active.findIndex(q => q.npcId === npcId);
  if (idx < 0) return;
  const quest = quests.active[idx];
  quests.active = quests.active.filter((_, i) => i !== idx);
  quests.completed = quests.completed || [];
  quests.completed.push({ ...quest, status: 'completed', resolvedDay: currentGameState.meta.clock.day });
  currentGameState.player.money += quest.rewardMoney || 0;
  if (quest.rewardRelation) {
    const updated = await updateNpc(npcId, n => applyRelDelta(n, quest.rewardRelation));
    currentGameState.npcs[npcId] = updated;
  }
  addLogEntry('system', `Goal complete: ${quest.title} (+$${quest.rewardMoney || 0})`);
}

async function doPayRent() {
  if (!currentGameState) return;
  const player = currentGameState.player;
  const owed = player.rentOwed || 0;
  if (owed <= 0) {
    addLogEntry('system', 'No rent currently owed.');
    return;
  }
  if (player.money < owed) {
    addLogEntry('system', `You can't cover rent right now ($${owed} owed, $${player.money} on hand).`);
    return;
  }
  player.money -= owed;
  player.rentOwed = 0;
  addLogEntry('narration', `You pay $${owed} in rent. That's a relief.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('pay-rent', currentGameState);
}

// Move-out: minimal but real. Full move-IN (prospect generation, interview,
// veto/approve UI) is deliberately out of scope for this pass — it would
// mean re-exercising the character-creation pipeline in a new "prospect"
// context, a feature-sized undertaking in its own right. Move-out is
// implemented because it's the more directly economic-pressure-relevant
// half: "someone leaving raises everyone's share" (brief §7).
async function doAskToLeave(npcId) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc || npc.residency.status !== 'resident') return;
  showLoading('Working it out...');
  try {
    const opId = `moveout_${npcId}_${Date.now()}`;
    await multiKeyOp(opId, `${npcId} moves out`, [
      {
        folder: 'npcs', key: npcId,
        fn: (n) => changeResidencyStatus(
          { ...n, residency: { ...n.residency, room: null, bed: null } },
          'former',
          { since: currentGameState.meta.clock.day }
        ),
      },
      {
        folder: 'world', key: 'castWeb',
        fn: (web) => {
          const pruned = { ...(web || {}) };
          for (const key of Object.keys(pruned)) {
            if (key.split('|').includes(npcId)) delete pruned[key];
          }
          return pruned;
        },
      },
    ]);

    currentGameState.npcs[npcId] = await getNpc(npcId);
    currentGameState.npcs[npcId].location = null;
    currentGameState.world.castWeb = await getWorld('castWeb');

    // Someone leaving raises everyone's share — recompute immediately.
    currentGameState.world.rent = computeRent(currentGameState.npcs);
    await updateWorld('rent', () => currentGameState.world.rent);

    addLogEntry('narration', `${npc.bible.name || 'They'} moves out. The room feels a little emptier — and the rent a little heavier.`);
    // getPresentNpcIds already excludes 'former' residents, so recomputing
    // scene participants drops them from active/ambient without a
    // separate demoteToAmbient call.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('move-out', currentGameState);
  } finally {
    hideLoading();
  }
}

const MAX_WORLD_EVENTS = 200;

function appendWorldEvents(events) {
  if (!currentGameState || !events || events.length === 0) return;
  const combined = [...(currentGameState.world.events || []), ...events];
  currentGameState.world.events = combined.slice(-MAX_WORLD_EVENTS);
}

// Piggyback memory-summary compaction onto player-contact LLM calls only
// (never on a pure tick — brief §8: compaction runs only when a
// player-contact call happens anyway). Checks just the NPCs the scene
// actually involved.
async function compactMemoryIfNeeded(npcIds) {
  for (const id of npcIds || []) {
    const npc = currentGameState.npcs[id];
    if (!npc || !shouldCompactMemory(npc)) continue;
    const compacted = await compactMemory(npc);
    await setNpc(id, compacted);
    currentGameState.npcs[id] = compacted;
  }
}

// Pull just the NPCs an applied LLM proposal touched back from kv, rather
// than reloading the whole game state (which would revert in-memory
// clock/needs/location changes that only live in currentGameState until the
// next save boundary).
async function syncNpcsFromKv(npcIds) {
  if (!currentGameState || !npcIds) return;
  for (const id of npcIds) {
    const npc = await getNpc(id);
    if (npc) currentGameState.npcs[id] = npc;
  }
}

// --- Orchestration functions ---

// Actions reachable with no active game — precisely the ones the menu
// modal offers when currentGameState is null. Without this allowlist the
// blanket "no game, no action" guard below made New Game/Continue
// permanently unreachable: they're only ever clicked from a screen that
// only appears when currentGameState IS null, so the guard fired every
// time, before the switch below ever ran.
const MENU_ACTIONS = ['menu', 'new-game-random', 'new-game-guided', 'new-game-manual', 'new-game-seed', 'generate-cast', 'reroll-char', 'approve-cast', 'back-to-form', 'continue', 'debug', 'debug-close'];

async function handleAction(action, npcId, extra) {
  if (!currentGameState && !MENU_ACTIONS.includes(action)) return;

  // Registered actions (ACTIONS/DEFS.ACTIONS) are dispatched by data lookup
  // rather than a switch case — this is the bridge for verbs already
  // ported (eat/cook/shower/watch_tv/relax; see DEFS.ACTIONS for why the
  // rest aren't yet). Checked before the switch so a ported verb's id never
  // needs a case here at all.
  if (ACTION_DEFS[action]) {
    await runRegisteredAction(action);
    return;
  }

  switch (action) {
    case 'look':
      await doLookAround();
      break;
    case 'wait':
      await doWait();
      break;
    case 'sleep':
      await doSleep();
      break;
    case 'computer.use':
      await doComputerOpen();
      break;
    case 'computer.close':
      await doComputerClose();
      break;
    case 'computer.open-app':
      doComputerOpenApp(extra?.appId);
      break;
    case 'computer.open-screen':
      doComputerOpenScreen(extra?.screenId);
      break;
    case 'computer.work-block':
      await doWorkBlock();
      break;
    case 'work.apply':
      await doWorkApply(extra?.rowId);
      break;
    case 'shop.add-to-cart':
      await doShopAddToCart(extra?.rowId);
      break;
    case 'shop.remove-from-cart':
      await doShopRemoveFromCart(extra?.rowId);
      break;
    case 'shop.checkout':
      await doShopCheckout();
      break;
    case 'talk':
      if (npcId) await doTalk(npcId);
      break;
    case 'step-away':
      if (npcId) await doStepAway(npcId);
      break;
    case 'pay-rent':
      await doPayRent();
      break;
    case 'ask-to-leave':
      if (npcId) await doAskToLeave(npcId);
      break;
    case 'move':
      if (extra?.roomId) await doMove(extra.roomId);
      break;
    case 'save':
      await saveGame(currentGameState);
      break;
    case 'menu':
      showMenuModal();
      break;
    case 'new-game-random':
    case 'new-game-guided':
    case 'new-game-manual':
    case 'new-game-seed':
      showCharCreationModal(action.replace('new-game-', ''));
      break;
    case 'generate-cast':
      await handleGenerateCast();
      break;
    case 'reroll-char':
      if (npcId) await handleRerollChar(npcId);
      break;
    case 'approve-cast':
      await approveCastAndStartGame();
      break;
    case 'back-to-form':
      showCharCreationModal('guided');
      break;
    case 'continue':
      await continueGame();
      break;
    case 'debug':
      toggleDebugPanel();
      break;
    case 'debug-close':
      closeDebugPanel();
      break;
    default:
      console.warn('Unknown action:', action);
  }
}

async function handleFreeText(text) {
  if (!text.trim() || !currentGameState) return;
  await doPlayerAction(text.trim());
}

// --- Player actions ---

async function doPlayerAction(actionText) {
  showLoading();
  try {
    await advanceAndResolve(1);

    // Assemble context
    const context = assembleContext(currentGameState, currentSceneState);

    // Call LLM
    const result = await callLLM(context, actionText);

    if (result.valid && result.proposal) {
      // Apply proposal, then pull back only the NPCs it touched
      const applied = await applyProposal(result.proposal, context, currentGameState);
      await syncNpcsFromKv(applied.updatedNpcIds);
      for (const entry of applied.logEntries) addLogEntry(entry.type, entry.text, entry.speaker);
      // Piggyback compaction on this player-contact call, never on a pure tick.
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
    } else {
      // Fallback narration
      addLogEntry('narration', `You ${actionText.toLowerCase()}.`);
    }

    // Decay player needs
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);

    render(currentGameState, currentSceneState);
    await saveAtBoundary('action', currentGameState);
  } catch (e) {
    console.warn('Action failed:', e);
    addLogEntry('system', 'Something went wrong. Try again.');
  } finally {
    hideLoading();
  }
}

// Surface off-screen evidence in a room at the moment the player actually
// encounters it (brief §6: narrated at moment of contact, not occurrence —
// a dirty dish, a broken mug). Marks surfaced events seen in place (they're
// the same object references living in currentGameState.world.events) so
// they don't repeat on a later look or visit.
function surfaceRoomEvidence(roomId, maxItems) {
  if (!currentGameState) return;
  const events = currentGameState.world.events || [];
  const unseen = events.filter(e => e.roomId === roomId && !e.seenByPlayer);
  if (unseen.length === 0) return;
  const toShow = unseen.slice(-(maxItems || 2));
  for (const evt of toShow) {
    addLogEntry('narration', formatEventText(evt, currentGameState.npcs));
    evt.seenByPlayer = true;
  }
}

async function doLookAround() {
  showLoading();
  try {
    const roomId = currentGameState.player.location;
    const room = currentGameState.world.rooms[roomId] || {};
    const present = getPresentNpcIds(currentGameState.npcs, roomId);
    let desc = `You are in the ${ROOMS[roomId]?.name || roomId}. `;
    desc += room.cleanliness > 70 ? 'The room is tidy. ' : room.cleanliness > 40 ? 'The room is lived-in. ' : 'The room is messy. ';
    if (present.length > 0) {
      desc += present.map(id => {
        const npc = currentGameState.npcs[id];
        return `${npc.bible.name || 'Someone'} is here, ${npc.activity || 'doing nothing'}.`;
      }).join(' ');
    } else {
      desc += 'You are alone.';
    }
    addLogEntry('narration', desc);
    surfaceRoomEvidence(roomId);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('look', currentGameState); // no time cost, but evidence-seen state is durable
  } finally {
    hideLoading();
  }
}

async function doWait() {
  showLoading();
  try {
    await advanceAndResolve(2);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 2);
    addLogEntry('narration', 'You wait a while. Time passes.');
    render(currentGameState, currentSceneState);
    await saveAtBoundary('wait', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doSleep() {
  showLoading();
  try {
    // Batch-resolve sleeping hours
    const sleepTicks = 16;
    const sleepEvents = await advanceAndResolve(sleepTicks);
    // Restore energy
    currentGameState.player.energy = Math.min(100, currentGameState.player.energy + NEEDS.energy.sleepRestore * sleepTicks / 2);
    addLogEntry('narration', 'You sleep. You wake feeling rested.');
    // Narrate some of what happened while asleep, most recent first. Marked
    // seen so a later visit to the same room doesn't repeat it as evidence.
    for (const evt of sleepEvents.slice(-2)) {
      const npc = currentGameState.npcs[evt.npcId];
      if (npc && npc.bible.name) {
        addLogEntry('narration', `While you were asleep: ${formatEventText(evt, currentGameState.npcs)}`);
        evt.seenByPlayer = true;
      }
    }
    render(currentGameState, currentSceneState);
    await saveAtBoundary('sleep', currentGameState);
  } finally {
    hideLoading();
  }
}

// Work moved to the computer (COMPUTER/UI.COMPUTER) — a real job with a
// board, a backlog, pay scaled by skill/focus, and deadlines, replacing
// the old flat "click Work, get $340" button. See doComputerOpen/
// doWorkApply/doWorkBlock and DEFS.COMPUTER's JOB_DEFS.
//
// Eat/Cook/Shower/Watch TV/Relax moved to ACTIONS/DEFS.ACTIONS — see
// runRegisteredAction, dispatched from the bridge at the top of
// handleAction above.

// Pick a demotion beat and narrate it — never a silent active->ambient
// swap. Flavor text only, so unlike SIM's seeded narration this doesn't
// need to be deterministic.
function narrateDemotion(demotedId, promotedId) {
  if (!demotedId || !currentGameState) return;
  const demotedNpc = currentGameState.npcs[demotedId];
  const promotedNpc = currentGameState.npcs[promotedId];
  if (!demotedNpc) return;
  const template = DEMOTION_BEATS[Math.floor(Math.random() * DEMOTION_BEATS.length)];
  const text = template
    .replace('{name}', demotedNpc.bible.name || 'They')
    .replace('{other}', promotedNpc?.bible?.name || 'you');
  addLogEntry('narration', text);
}

async function doTalk(npcId) {
  showLoading();
  try {
    // Promote to active — demotes the least-engaged active member if the
    // cap is already full, narrated rather than swapped silently.
    const { sceneState, demotedId } = promoteToActive(currentSceneState, npcId);
    currentSceneState = sceneState;
    narrateDemotion(demotedId, npcId);

    // Use LLM to generate opening
    const context = assembleContext(currentGameState, currentSceneState);
    const result = await callLLM(context, `You approach ${currentGameState.npcs[npcId]?.bible?.name || 'your roommate'} to talk.`);

    if (result.valid && result.proposal) {
      const applied = await applyProposal(result.proposal, context, currentGameState);
      await syncNpcsFromKv(applied.updatedNpcIds);
      for (const entry of applied.logEntries) addLogEntry(entry.type, entry.text, entry.speaker);
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
    } else {
      addLogEntry('narration', `You try to talk to ${currentGameState.npcs[npcId]?.bible?.name || 'them'}, but they seem distracted.`);
    }

    // Talking to the referenced NPC is the completion trigger for any
    // active goal about them — deterministic, doesn't depend on the LLM
    // succeeding or reporting progress (see checkQuestCompletion).
    await checkQuestCompletion(npcId);

    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('talk', currentGameState);
  } finally {
    hideLoading();
  }
}

// Step away from an active conversation — the deliberate, natural exit the
// brief calls for, as opposed to Talk-ing someone else and getting bumped.
// No LLM call: leaving a conversation is the player's own decision, not
// something that needs narrating as an NPC reaction.
async function doStepAway(npcId) {
  const npc = currentGameState?.npcs[npcId];
  if (!npc) return;
  currentSceneState = demoteToAmbient(currentSceneState, npcId);
  addLogEntry('narration', `You step away from ${npc.bible.name || 'them'}.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('step-away', currentGameState);
}

async function doMove(roomId) {
  showLoading();
  try {
    currentGameState.player.location = roomId;
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    // Recompute scene participants for the new room — active starts
    // populated (see getSceneParticipants) rather than empty.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    addLogEntry('narration', `You move to the ${ROOMS[roomId]?.name || roomId}.`);
    surfaceRoomEvidence(roomId);

    // NPC-initiated conversation: if someone's here and active, let them
    // open rather than always waiting on the player to speak first.
    if (currentSceneState.active.length > 0) {
      const context = assembleContext(currentGameState, currentSceneState);
      const result = await callLLM(context, 'You walk into the room.');
      if (result.valid && result.proposal) {
        const applied = await applyProposal(result.proposal, context, currentGameState);
        await syncNpcsFromKv(applied.updatedNpcIds);
        for (const entry of applied.logEntries) addLogEntry(entry.type, entry.text, entry.speaker);
        currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
      }
    }

    render(currentGameState, currentSceneState);
    await saveAtBoundary('move', currentGameState);
  } finally {
    hideLoading();
  }
}

// --- Character creation (author mode: any subset filled, rest rolled) ---
// The brief's four generation modes (Random/Guided/Manual/Seed) collapse
// into one form and one underlying mechanism — SIM's rollCastSlot partial
// authoring. "Random" is this form submitted blank; "Seed" is just the
// seed field filled; "Manual" is the per-roommate fields filled in;
// "Guided" is tone/nudges filled with names left blank. All four generate
// a structured cast, then show a live preview (name/occupation/temperament/
// want/wound/blind spot) with a per-character reroll, before prose
// expansion or any kv write happens.
let pendingCast = null;         // rolled cast, not yet written to kv
let pendingRerollCounters = {}; // npcId -> reroll attempt counter, for RNG variety

function showCharCreationModal(mode) {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;
  title.textContent = 'New Household';
  body.innerHTML = '';
  const tpl = document.getElementById('tpl-char-form');
  body.appendChild(tpl.content.cloneNode(true));

  const hints = {
    random: 'Leave everything blank — a fully random household.',
    guided: 'Set a tone or nudges below, leave names blank, then generate.',
    manual: 'Fill in per-roommate fields below, then generate.',
    seed: 'Paste a known seed to reproduce that household exactly.',
  };
  const hint = body.querySelector('[data-char-hint]');
  if (hint && hints[mode]) hint.textContent = hints[mode];

  const seedInput = body.querySelector('[name="seed"]');
  const countSelect = body.querySelector('[data-char-count]');
  const fieldsContainer = body.querySelector('[data-char-fields]');
  populateCharManualFields(fieldsContainer, parseInt(countSelect.value, 10));
  countSelect.addEventListener('change', () => {
    populateCharManualFields(fieldsContainer, parseInt(countSelect.value, 10));
  });
  if (mode === 'seed' && seedInput) seedInput.focus();

  actions.innerHTML = '<button class="btn" data-action="generate-cast">Generate</button><button class="btn btn-secondary" data-action="close-modal">Cancel</button>';
  overlay.setAttribute('data-open', '');
}

function populateCharManualFields(container, count) {
  if (!container) return;
  container.innerHTML = '';
  const tpl = document.getElementById('tpl-char-field-block');
  const categories = [...new Set(OCCUPATION_POOL.map(o => o.category))];
  for (let i = 0; i < count; i++) {
    const node = tpl.content.cloneNode(true);
    const block = node.querySelector('.char-field-block');
    block.setAttribute('data-char-index', i);
    block.querySelector('.char-field-block-title').textContent = `Roommate ${i + 1}`;
    const select = block.querySelector('[data-field="occupationCategory"]');
    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      select.appendChild(opt);
    }
    container.appendChild(node);
  }
}

// Best-effort match a free-text "archetype nudge" against known pool
// entries (interest names, want-pool phrases) via case-insensitive
// substring matching. Not a hard requirement — if nothing matches, the
// slot it would have biased just rolls normally.
function nudgeToPartial(nudge) {
  const n = nudge.trim().toLowerCase();
  if (!n) return {};
  const patch = {};
  const interestMatch = INTEREST_POOL.find(i => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()));
  if (interestMatch) patch.interests = [interestMatch.name];
  const wantMatch = WANT_POOL.find(w => w.toLowerCase().includes(n));
  if (wantMatch) patch.want = wantMatch;
  return patch;
}

// Read the form into a per-slot partials array. Manual per-character
// fields take precedence over nudge-derived hints (a more explicit signal
// beats a fuzzy one); nudges are assigned round-robin across slots.
function readCharFormPartials(body, count) {
  const partials = [];
  for (let i = 0; i < count; i++) partials.push({});

  const nudgesRaw = body.querySelector('[name="nudges"]')?.value || '';
  const nudges = nudgesRaw.split(',').map(s => s.trim()).filter(Boolean);
  nudges.forEach((nudge, idx) => {
    Object.assign(partials[idx % count], nudgeToPartial(nudge));
  });

  const blocks = body.querySelectorAll('.char-field-block');
  blocks.forEach((block, i) => {
    if (i >= count) return;
    const name = block.querySelector('[data-field="name"]')?.value.trim();
    const occCat = block.querySelector('[data-field="occupationCategory"]')?.value;
    const want = block.querySelector('[data-field="want"]')?.value.trim();
    const wound = block.querySelector('[data-field="wound"]')?.value.trim();
    if (name) partials[i].name = name;
    if (occCat) partials[i].occupationCategory = occCat;
    if (want) partials[i].want = want;
    if (wound) partials[i].wound = wound;
  });

  return partials;
}

async function handleGenerateCast() {
  const body = document.getElementById('modal-body');
  if (!body) return;
  const seed = body.querySelector('[name="seed"]')?.value.trim() || genSeed();
  const count = parseInt(body.querySelector('[data-char-count]')?.value || '2', 10);
  // Tone/content preferences are persisted (visible in the debug panel)
  // but not yet consumed by generation or narration — tone mainly affects
  // narration style, which belongs to LLM's prompt construction. Wiring it
  // through is conversation-loop territory, deferred rather than faked
  // here with an unspecified effect.
  const tone = body.querySelector('[name="tone"]')?.value || CONTENT_CONFIG.tone;
  const contentPrefs = (body.querySelector('[name="content"]')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const partials = readCharFormPartials(body, count);

  showLoading('Rolling household...');
  try {
    pendingCast = SIM_generateHouse(seed, count, partials);
    pendingCast.contentConfig = { tone, contentPrefs };
    pendingRerollCounters = {};
    renderCharPreview();
  } finally {
    hideLoading();
  }
}

function renderCharPreview() {
  if (!pendingCast) return;
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!title || !body || !actions) return;
  title.textContent = 'Review Your Household';
  body.innerHTML = '';

  const seedDiv = document.createElement('div');
  seedDiv.className = 'char-seed-display';
  seedDiv.innerHTML = '<span class="char-seed-label">Seed:</span> <span class="char-seed-value"></span>';
  seedDiv.querySelector('.char-seed-value').textContent = pendingCast.seed;
  body.appendChild(seedDiv);

  const list = document.createElement('div');
  list.className = 'char-preview-list';
  const tpl = document.getElementById('tpl-char-preview-item');
  pendingCast.npcIds.forEach((id, idx) => {
    const npc = pendingCast.npcs[id];
    const b = npc.bible;
    const node = tpl.content.cloneNode(true);
    const item = node.querySelector('.char-preview-item');
    item.setAttribute('data-preview-index', idx);
    const rerollBtn = item.querySelector('[data-action="reroll-char"]');
    if (rerollBtn) rerollBtn.setAttribute('data-npc', id);
    item.querySelector('.char-preview-name').textContent = b.name || `Roommate ${idx + 1}`;
    item.querySelector('.char-preview-occupation').textContent = `${b.occupation.title} — ${b.occupation.hours}`;
    item.querySelector('.char-preview-temperament').textContent = temperamentSummary(b.temperament);
    item.querySelector('.char-preview-want').textContent = `Want: ${b.want}`;
    item.querySelector('.char-preview-wound').textContent = `Wound: ${b.wound}`;
    item.querySelector('.char-preview-blindspot').textContent = `Blind spot: ${b.blindSpot}`;
    list.appendChild(node);
  });
  body.appendChild(list);

  actions.innerHTML = '<button class="btn" data-action="approve-cast">Approve &amp; Start</button><button class="btn btn-secondary" data-action="back-to-form">Back</button>';
}

function temperamentSummary(t) {
  const label = (v, lo, hi) => (v > 0.3 ? hi : v < -0.3 ? lo : null);
  const parts = [
    label(t.warmth, 'cool', 'warm'),
    label(t.volatility, 'steady', 'volatile'),
    label(t.assertiveness, 'reserved', 'assertive'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'even-keeled';
}

async function handleRerollChar(npcId) {
  if (!pendingCast) return;
  const idx = pendingCast.npcIds.indexOf(npcId);
  if (idx < 0) return;
  pendingRerollCounters[npcId] = (pendingRerollCounters[npcId] || 0) + 1;

  const rolled = rerollCastSlot(pendingCast.seed, idx, pendingCast.npcs, pendingCast.npcIds, pendingRerollCounters[npcId], {});
  if (rolled) {
    const prevResidency = pendingCast.npcs[npcId].residency;
    const prevLocation = pendingCast.npcs[npcId].location;
    pendingCast.npcs[npcId] = createNpcFromBible(rolled.normalized.bible, 'resident');
    pendingCast.npcs[npcId].residency.room = prevResidency.room;
    pendingCast.npcs[npcId].residency.bed = prevResidency.bed;
    pendingCast.npcs[npcId].location = prevLocation;
    // Relationships depended on the old traits (compatibility/friction) —
    // regenerate the whole web so it stays internally consistent with the
    // cast as it now stands.
    pendingCast.world.castWeb = generateCastWeb(pendingCast.seed, `reroll${pendingRerollCounters[npcId]}`, pendingCast.npcIds, pendingCast.npcs);
  }
  renderCharPreview();
}

async function approveCastAndStartGame() {
  if (!pendingCast) return;
  closeModal();
  showLoading('Writing your household\'s story...');
  try {
    // Clear existing NPC state from kv — starting a new game replaces the old one
    const existingKeys = await root.kv.npcs.keys();
    for (const k of existingKeys) await root.kv.npcs.delete(k);

    // Prose expansion in parallel — was a serial await-per-npc loop behind
    // a single static spinner, so a 7-roommate house was 7 sequential LLM
    // calls. Each result re-enters through validateCharacter (the single
    // gate every construction path returns through) before it's allowed
    // into the bible; a player-authored name is never overwritten by prose.
    await Promise.all(Object.entries(pendingCast.npcs).map(async ([id, npc]) => {
      const prose = await expandCharacterProse(npc.bible);
      const candidateBible = {
        ...npc.bible,
        name: npc.bible.name || prose.name,
        visual: prose.visual,
        history: prose.history,
        sketch: prose.sketch,
        sampleLines: prose.sampleLines,
      };
      const { valid, errors, normalized } = validateCharacter({
        bible: candidateBible,
        bibleRevision: npc.bibleRevision,
        bibleChanges: npc.bibleChanges,
      });
      if (valid) {
        npc.bible = normalized.bible;
      } else {
        console.warn(`Prose expansion for ${id} failed validation, keeping structured draw`, errors);
      }
    }));

    await writeGeneratedGameState(pendingCast);
    pendingCast = null;

    await syncGameStateFromKv();
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);

    addLogEntry('system', 'Welcome to your new apartment!');
    render(currentGameState, currentSceneState);
    startAutosave(() => currentGameState);
  } catch (e) {
    console.error('New game failed:', e);
    showError('Failed to start new game: ' + e.message);
  } finally {
    hideLoading();
  }
}

async function continueGame() {
  closeModal();
  showLoading('Loading...');
  try {
    await syncGameStateFromKv();
    if (currentGameState) {
      currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
      render(currentGameState, currentSceneState);
      startAutosave(() => currentGameState);
    } else {
      showMenuModal();
    }
  } finally {
    hideLoading();
  }
}

// --- Sync in-memory state from kv ---
async function syncGameStateFromKv() {
  const state = await loadGameState();
  if (state) {
    currentGameState = state;
  }
}

// --- UI helpers ---

function showLoading(msg) {
  let overlay = document.querySelector('.loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    document.getElementById('main-content')?.appendChild(overlay);
  }
  overlay.innerHTML = '';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  overlay.appendChild(spinner);
  if (msg) {
    const txt = document.createElement('div');
    txt.className = 'loading-text';
    txt.textContent = msg;
    overlay.appendChild(txt);
  }
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.querySelector('.loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showError(msg) {
  addLogEntry('system', `Error: ${msg}`);
}

// The single writer for the session log: mutates in-memory state, queues a
// debounced persist, and renders. applyProposal (NPC section) returns
// narration/dialogue as data rather than writing it, specifically so this
// stays the only path — two writers here is how the log silently lost
// every non-LLM line before (applyProposal wrote via updateMeta directly,
// then the caller's syncGameStateFromKv reload clobbered it right back).
function addLogEntry(type, text, speaker) {
  if (!currentGameState) return;
  if (!currentGameState.meta.sessionLog) currentGameState.meta.sessionLog = [];
  currentGameState.meta.sessionLog.push({ type, text, speaker, day: currentGameState.meta.clock.day });
  currentGameState.meta.sessionLog = currentGameState.meta.sessionLog.slice(-100);
  queueWrite('meta', 'meta', currentGameState.meta);
  renderNarrationLog(currentGameState);
}

// --- Modals ---

function showMenuModal() {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  title.textContent = 'Slice of Life';
  body.innerHTML = `
    <p class="dim">An apartment living sim.</p>
    <div class="menu-section">
      <div class="form-hint">New Household</div>
      <div class="menu-actions menu-actions-row">
        <button class="btn btn-block" data-action="new-game-random">Random</button>
        <button class="btn btn-block" data-action="new-game-guided">Guided</button>
        <button class="btn btn-block" data-action="new-game-manual">Manual</button>
        <button class="btn btn-block" data-action="new-game-seed">Seed</button>
      </div>
    </div>
    <div class="menu-actions">
      <button class="btn btn-secondary btn-block" data-action="continue">Continue</button>
      <button class="btn btn-secondary btn-block" data-action="debug">Debug Panel</button>
    </div>
  `;
  actions.innerHTML = '';
  overlay.setAttribute('data-open', '');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.removeAttribute('data-open');
}

// Free-text delivery ordering (showDeliveryModal/placeDelivery) was
// replaced by Nile (COMPUTER's shop app) — a real priced catalog instead
// of typing anything and getting a flat $8 fee. See defs.computer.js's
// APP_DEFS.shop and computer.js's checkoutCart.

// --- Debug panel ---

function toggleDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (panel.hasAttribute('data-open')) {
    closeDebugPanel();
  } else {
    panel.setAttribute('data-open', '');
    updateDebugPanel();
  }
}

function closeDebugPanel() {
  document.getElementById('debug-panel')?.removeAttribute('data-open');
}

async function updateDebugPanel() {
  if (!currentGameState) return;
  const meta = currentGameState.meta;
  const seedEl = document.getElementById('dbg-seed');
  const biblesEl = document.getElementById('dbg-bibles');
  const castwebEl = document.getElementById('dbg-castweb');
  const stateEl = document.getElementById('dbg-state');
  const errorsEl = document.getElementById('dbg-errors');

  if (seedEl) seedEl.textContent = JSON.stringify({
    seed: meta.seed,
    clock: meta.clock,
    versions: meta.versions,
    saveTimestamp: meta.saveTimestamp,
    imageIndexSize: Object.keys(meta.imageIndex || {}).length,
    droppedConstraints: meta.droppedConstraints || [],
    contentConfig: meta.contentConfig || null,
  }, null, 2);

  if (biblesEl) {
    const bibles = {};
    for (const [id, npc] of Object.entries(currentGameState.npcs)) {
      bibles[id] = npc.bible;
    }
    biblesEl.textContent = JSON.stringify(bibles, null, 2);
  }

  if (castwebEl) castwebEl.textContent = JSON.stringify(currentGameState.world.castWeb, null, 2);
  if (stateEl) stateEl.textContent = JSON.stringify(currentGameState, null, 2);
  if (errorsEl) errorsEl.textContent = JSON.stringify(ASSERT_RING_BUFFER, null, 2);

  // LLM parse-tier health and effect accept/reject counts (EFFECTS
  // section) — "you cannot tune what you don't measure."
  const telemetryEl = document.getElementById('dbg-telemetry');
  if (telemetryEl) telemetryEl.textContent = JSON.stringify(LLM_TELEMETRY, null, 2);
}

// ===== /SECTION: UI =====

// ===== SECTION: BOOT =====

async function boot() {
  // Load all source scripts
  // (scripts are loaded via <script> tags in index.html, this runs after)

  // Init storage
  await initStorage();

  // Check for existing save
  const hasExistingSave = await hasSave();

  if (hasExistingSave) {
    await syncGameStateFromKv();
    if (currentGameState) {
      currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
      render(currentGameState, currentSceneState);
      startAutosave(() => currentGameState);
    } else {
      showMenuModal();
    }
  } else {
    showMenuModal();
  }

  // Attach event delegation
  attachEventHandlers();
}

function attachEventHandlers() {
  // Global click delegation
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) {
      // Check for room item click
      const roomItem = e.target.closest('[data-room-id]');
      if (roomItem) {
        const roomId = roomItem.getAttribute('data-room-id');
        handleAction('move', null, { roomId });
      }
      return;
    }

    const action = target.getAttribute('data-action');

    // Handle modal-internal actions
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'debug-close') { closeDebugPanel(); return; }

    // Debug toggle sections
    if (target.hasAttribute('data-debug')) {
      const section = target.getAttribute('data-debug');
      const el = document.getElementById(`dbg-${section}`);
      if (el) el.classList.toggle('hidden');
      return;
    }

    const npcId = target.getAttribute('data-npc');
    // Computer screen buttons (RENDER.COMPUTER) carry which app/screen/row
    // they target via data-* rather than data-npc — read intent, pass it
    // through as `extra`, same pattern as data-room-id's {roomId} above.
    const extra = {};
    if (target.hasAttribute('data-app')) extra.appId = target.getAttribute('data-app');
    if (target.hasAttribute('data-screen')) extra.screenId = target.getAttribute('data-screen');
    if (target.hasAttribute('data-row-id')) extra.rowId = target.getAttribute('data-row-id');
    handleAction(action, npcId || null, extra);
  });

  // Free-text input
  const inputBar = document.getElementById('input-bar');
  if (inputBar) {
    inputBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inputBar.value.trim()) {
        handleFreeText(inputBar.value);
        inputBar.value = '';
      }
    });
  }

  // Drawer toggles (mobile)
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.getAttribute('data-toggle');
      const sidebar = side === 'left' ? document.getElementById('sidebar-left') : document.getElementById('sidebar-right');
      if (sidebar) sidebar.toggleAttribute('data-open');
    });
  });

  // NPC card click → talk
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-npc-id]');
    if (!card) return;
    const npcId = card.getAttribute('data-npc-id');
    if (npcId && npcId !== 'player') {
      handleAction('talk', npcId);
    }
  });
}

// Boot
boot();

// ===== /SECTION: BOOT =====
