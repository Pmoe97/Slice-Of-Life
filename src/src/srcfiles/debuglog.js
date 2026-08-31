// ===== SECTION: DEBUGLOG =====
// Troubleshooting export log (Cheat menu, Discord feedback 2026-08-24). A
// durable, filterable, human/LLM-readable record of what the sim decided
// and why, so the player can paste a slice of it into a chat with an
// outside dev instead of describing a weird moment from memory.
//
// logDebugEvent is the single writer, modeled on SIGNALS' emitTransient
// (signals.js) — an explicit gameState param, never a global reach-in, so
// it's safe to call from cognition/drives/sim/npc/llm, all of which already
// receive gameState as a parameter. Persisted via state.js's SAVE_KEYS
// under world.debugLog (see state.js for the read/write wiring) but
// deliberately excluded from the cross-device save-slot export — this is
// per-machine troubleshooting state, not something to hand to someone else.

const DEBUG_LOG_CATEGORIES = [
  { id: 'movement', label: 'Movement & room decisions',
    desc: 'Where NPCs ended up each tick, and which branch or drive decided it.' },
  { id: 'conversation', label: 'Conversations (you present)',
    desc: 'Scene and IM dialogue lines involving you.' },
  { id: 'conversation_ambient', label: 'Ambient NPC chatter',
    desc: 'NPC-to-NPC chat you did not witness. No dialogue text exists for these — only who talked, where, and what facts transferred.' },
  { id: 'world_event', label: 'World events',
    desc: 'Mood/relationship changes, cheating, move-in offers, and other generic world events.' },
  { id: 'prompt', label: 'Raw AI prompts (heavy)',
    desc: 'The full text sent to the model for scene/IM replies. Off by default and large — enable only while chasing something specific.' },
];

const DEBUG_LOG_TUNING = {
  maxEntries: 4000,        // hard cap across every category except 'prompt'
  maxDays: 21,             // entries older than (today - maxDays) are evicted on write
  maxPromptEntries: 150,   // separate, smaller cap — each 'prompt' entry can be several KB
  promptCaptureEnabled: false, // session-only opt-in flipped by the cheat pane checkbox; never persisted
};

// The one writer. Mutates gameState.world.debugLog in place and prunes on
// every write — same shape as SIGNALS' emitTransient. Inlines the tick
// computation (sim.js's getTickIndex, one line) rather than calling it, so
// this hot write path depends only on config.js's CLOCK — npc.js's
// applyProposal (one of the five write sites) is exercised by a standalone
// minimal harness (verify-p1.js) that loads config.js + npc.js and nothing
// else; pulling in sim.js there just to reach one function would be a much
// bigger dependency than the one line it's for.
function logDebugEvent(gameState, category, npcIds, detail) {
  if (!gameState || !gameState.world || !gameState.meta?.clock) return;
  if (!gameState.world.debugLog) gameState.world.debugLog = [];
  const clock = gameState.meta.clock;
  gameState.world.debugLog.push({
    category,
    day: clock.day,
    minutes: clock.minutes,
    tick: Math.floor(clock.minutes / CLOCK.tickMinutes),
    npcIds: Array.isArray(npcIds) ? npcIds.filter(Boolean) : (npcIds ? [npcIds] : []),
    detail: detail || {},
  });
  pruneDebugLog(gameState);
}

// MUTATING — day-window prune first (COMMITMENT_TUNING.retainedDays is the
// only existing day-window precedent; this window is wider since a
// troubleshooting export needs more runway than a live commitment does),
// then two independent count caps so a heavy opt-in prompt-capture session
// can't crowd out the cheap, high-value movement/conversation entries.
function pruneDebugLog(gameState) {
  const log = gameState.world.debugLog;
  if (!log || log.length === 0) return;
  const today = gameState.meta.clock.day;
  let kept = log.filter(e => e.day >= today - DEBUG_LOG_TUNING.maxDays);

  const prompts = kept.filter(e => e.category === 'prompt');
  if (prompts.length > DEBUG_LOG_TUNING.maxPromptEntries) {
    const dropCount = prompts.length - DEBUG_LOG_TUNING.maxPromptEntries;
    const dropSet = new Set(prompts.slice(0, dropCount));
    kept = kept.filter(e => !dropSet.has(e));
  }

  const nonPrompt = kept.filter(e => e.category !== 'prompt');
  if (nonPrompt.length > DEBUG_LOG_TUNING.maxEntries) {
    const dropCount = nonPrompt.length - DEBUG_LOG_TUNING.maxEntries;
    const dropSet = new Set(nonPrompt.slice(0, dropCount));
    kept = kept.filter(e => !dropSet.has(e));
  }
  gameState.world.debugLog = kept;
}

// Read side — pure, called from the cheat pane at export time.
function queryDebugLog(gameState, { dayFrom, dayTo, npcIds, categories } = {}) {
  const log = gameState?.world?.debugLog || [];
  return log.filter(e => {
    if (dayFrom != null && e.day < dayFrom) return false;
    if (dayTo != null && e.day > dayTo) return false;
    if (categories && categories.length && !categories.includes(e.category)) return false;
    if (npcIds && npcIds.length && !e.npcIds.some(id => npcIds.includes(id))) return false;
    return true;
  });
}

function debugLogCategoryLabel(id) {
  return DEBUG_LOG_CATEGORIES.find(c => c.id === id)?.label || id;
}

// One readable block per entry. Reuses formatEventText (sim.js) for the two
// categories whose detail already mirrors a world.events record, so the
// export reads consistently with the in-game event log the player has
// already seen.
function formatDebugLogEntryText(entry, gameState) {
  const npcs = gameState.npcs || {};
  const when = `Day ${entry.day}, ${formatTime(entry.minutes)} (${formatDateShort(entry.day)})`;
  const who = entry.npcIds.map(id => (npcs[id] ? fullName(npcs[id].bible) : id)).filter(Boolean).join(', ');
  const lines = [`${when} — [${debugLogCategoryLabel(entry.category)}]${who ? ' ' + who : ''}`];

  const d = entry.detail || {};
  switch (entry.category) {
    case 'movement': {
      const fromLabel = d.from ? roomPhrase(d.from) : 'off-screen';
      const toLabel = d.to ? roomPhrase(d.to) : 'off-screen';
      let branchLine = `  ${fromLabel} -> ${toLabel}  (branch: ${d.branch || 'unknown'}`;
      branchLine += d.driveId ? `, drive: ${d.driveId})` : ')';
      lines.push(branchLine);
      if (d.score != null) {
        let scoreLine = `  score=${Number(d.score).toFixed(2)}`;
        if (d.runnerUp) scoreLine += ` (runner-up: ${d.runnerUp.driveId} ${Number(d.runnerUp.score).toFixed(2)})`;
        lines.push(scoreLine);
      }
      if (d.terms) {
        const t = Object.entries(d.terms).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`).join(' ');
        lines.push(`  terms: ${t}`);
      }
      if (d.commitmentKind) lines.push(`  commitment: ${d.commitmentKind}`);
      break;
    }
    case 'conversation': {
      // Bug report (2026-08-27) — the export gap: applyProposal used to
      // mirror only the player line and dialogue into the debug log, so an
      // exported conversation slice read like the NPC had replied to
      // nothing — all the narration/action/internal beats were missing. They
      // now arrive tagged with a `type`; render them the way the chat pane
      // does so an exported slice reads like the conversation actually read.
      const t = d.type;
      if (t === 'narration') { lines.push(`  [${d.channel || 'scene'}] (narration) ${d.text}`); break; }
      if (t === 'action') { lines.push(`  [${d.channel || 'scene'}] *${String(d.text).trim().replace(/^\*+|\*+$/g, '').trim()}*`); break; }
      if (t === 'internal') { lines.push(`  [${d.channel || 'scene'}] (${who || 'They'} thinks: ${d.text})`); break; }
      const speakerName = d.speaker === 'player' ? 'You' : (npcs[d.speaker]?.bible?.name || d.speaker);
      lines.push(`  [${d.channel || 'scene'}] ${speakerName}: "${d.text}"`);
      break;
    }
    case 'conversation_ambient':
    case 'world_event': {
      lines.push(`  ${formatEventText(d, npcs)}`);
      break;
    }
    case 'prompt': {
      lines.push(`  [${d.channel || 'scene'} prompt]`);
      lines.push(d.prompt || '');
      break;
    }
    default:
      lines.push(`  ${JSON.stringify(d)}`);
  }
  return lines.join('\n');
}

function formatDebugLogText(entries, gameState) {
  if (!entries.length) return 'No entries match this filter.';
  return entries.map(e => formatDebugLogEntryText(e, gameState)).join('\n\n');
}

function formatDebugLogJson(entries, gameState, filters) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    gameVersion: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : null,
    filters: filters || {},
    entryCount: entries.length,
    entries,
  }, null, 2);
}
// ===== /SECTION: DEBUGLOG =====
