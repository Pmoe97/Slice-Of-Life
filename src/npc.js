// ===== SECTION: NPC =====
// Memory, relationships, mood, context assembly.
// Validates + applies LLM proposals to state (via STATE adapter).
// No DOM. No direct LLM calls.

// --- Memory management ---
const MEMORY_BUDGET = {
  maxFacts: 20,
  maxEpisodes: 15,
  maxSummaryLen: 500,
  episodeDecayPerTick: 0.002,
};

// Add a fact to an NPC's memory
function addMemoryFact(npc, fact) {
  const facts = [...(npc.memory.facts || [])];
  if (facts.length >= MEMORY_BUDGET.maxFacts) facts.shift();
  facts.push({ text: fact, day: 0, importance: 1 });
  return { ...npc, memory: { ...npc.memory, facts } };
}

// Add an episode to an NPC's memory
function addMemoryEpisode(npc, day, text, importance) {
  const episodes = [...(npc.memory.episodes || [])];
  episodes.push({ day, text, decay: 1.0, importance: importance || 0.5 });
  // Prune old/decayed episodes
  while ( episodes.length > MEMORY_BUDGET.maxEpisodes) episodes.shift();
  return { ...npc, memory: { ...npc.memory, episodes } };
}

// Decay all episodes for an NPC
function decayMemory(npc, ticks) {
  const episodes = (npc.memory.episodes || []).map(e => ({
    ...e,
    decay: Math.max(0, e.decay - MEMORY_BUDGET.episodeDecayPerTick * ticks),
  }));
  // Remove fully decayed episodes (but keep those from day 0 = shared history)
  const filtered = episodes.filter(e => e.decay > 0 || e.day === 0);
  return { ...npc, memory: { ...npc.memory, episodes: filtered } };
}

// --- Relationship axis management ---

function clampAxis(v) { return Math.max(-1, Math.min(1, v)); }

function applyRelDelta(npc, deltas) {
  const rel = npc.relPlayer;
  return {
    ...npc,
    relPlayer: {
      trust: clampAxis(rel.trust + (deltas.trust || 0)),
      affection: clampAxis(rel.affection + (deltas.affection || 0)),
      tension: clampAxis(rel.tension + (deltas.tension || 0)),
      respect: clampAxis(rel.respect + (deltas.respect || 0)),
    },
  };
}

function applyNpcToNpcDelta(castWeb, npcA, npcB, deltas) {
  const key = [npcA, npcB].sort().join('|');
  const pair = castWeb[key] || createBlankPair(npcA, npcB);
  const dirKey = `${npcA}→${npcB}`;
  const axes = { ...pair.axes };
  axes[dirKey] = {
    trust: clampAxis((axes[dirKey]?.trust || 0) + (deltas.trust || 0)),
    affection: clampAxis((axes[dirKey]?.affection || 0) + (deltas.affection || 0)),
    tension: clampAxis((axes[dirKey]?.tension || 0) + (deltas.tension || 0)),
    respect: clampAxis((axes[dirKey]?.respect || 0) + (deltas.respect || 0)),
  };
  return { ...castWeb, [key]: { ...pair, axes } };
}

function createBlankPair(a, b) {
  return {
    priorRel: { known: 0, met: 'met recently', whoFirst: a },
    axes: {
      [`${a}→${b}`]: { trust: 0, affection: 0, tension: 0, respect: 0 },
      [`${b}→${a}`]: { trust: 0, affection: 0, tension: 0, respect: 0 },
    },
    sharedBeat: '',
    beatPositive: true,
    compatibility: 0.5,
    friction: 0.3,
  };
}

// --- Mood management ---
function applyMoodDelta(npc, delta) {
  return { ...npc, mood: clampAxis(npc.mood + delta) };
}

// --- Scene participation: active vs ambient ---
// sceneState.engagement[npcId] tracks turns-since-addressed-or-spoke for
// each currently active NPC (see advanceEngagement below) — this is what
// "least-engaged" means for demotion, not simply "added first," which the
// previous active.shift() implementation actually did despite the name.

// Promote an ambient (or already-active) NPC to active. If already active,
// this just re-engages them (resets their turn counter) — no demotion.
// Otherwise, promoting past the cap demotes whoever has gone the longest
// without being addressed or speaking. Returns { sceneState, demotedId }
// (demotedId is null if nobody was demoted) so the caller can narrate the
// demotion as an in-fiction beat — per the brief, never a silent swap.
function promoteToActive(sceneState, npcId) {
  const engagement = { ...(sceneState.engagement || {}) };

  if (sceneState.active.includes(npcId)) {
    engagement[npcId] = 0;
    return { sceneState: { ...sceneState, engagement }, demotedId: null };
  }

  const ambIdx = sceneState.ambient.indexOf(npcId);
  if (ambIdx < 0) return { sceneState, demotedId: null }; // not present in the scene

  const ambient = [...sceneState.ambient];
  ambient.splice(ambIdx, 1);
  let active = [...sceneState.active, npcId];
  engagement[npcId] = 0;

  let demotedId = null;
  if (active.length > SCENE.maxActiveNpcs) {
    let worstId = null;
    let worstScore = -1;
    for (const id of active) {
      if (id === npcId) continue; // never demote the person just promoted
      const score = engagement[id] || 0;
      if (score >= worstScore) { worstScore = score; worstId = id; }
    }
    demotedId = worstId;
    active = active.filter(id => id !== demotedId);
    delete engagement[demotedId];
    ambient.push(demotedId);
  }

  return { sceneState: { ...sceneState, active, ambient, engagement }, demotedId };
}

function demoteToAmbient(sceneState, npcId) {
  const active = sceneState.active.filter(id => id !== npcId);
  const ambient = [...sceneState.ambient];
  if (!ambient.includes(npcId)) ambient.push(npcId);
  const engagement = { ...(sceneState.engagement || {}) };
  delete engagement[npcId];
  return { ...sceneState, active, ambient, engagement };
}

// Advance engagement tracking after a scene turn: everyone active drifts
// one turn further from being engaged, except whoever actually spoke this
// turn (from the LLM's dialogue), who resets to freshly engaged.
function advanceEngagement(sceneState, speakerIds) {
  const engagement = { ...(sceneState.engagement || {}) };
  for (const id of sceneState.active) {
    engagement[id] = (speakerIds || []).includes(id) ? 0 : (engagement[id] || 0) + 1;
  }
  return { ...sceneState, engagement };
}

// Resolve LLM dialogue speakers (which may be an npc id OR name — both are
// valid per validateProposal) back to npc ids, for engagement tracking.
function resolveSpeakerIds(dialogue, activeNpcsContext) {
  const ids = [];
  for (const d of dialogue || []) {
    const match = (activeNpcsContext || []).find(n => n.id === d.speaker || n.name === d.speaker);
    if (match) ids.push(match.id);
  }
  return ids;
}

// --- Context assembly for LLM ---
// Builds the context object that LLM uses to construct prompts.
// Only loads bibles for active NPCs (max 2). Ambient NPCs get one-line sketch.

function assembleContext(gameState, sceneState) {
  const { player, npcs, world, meta } = gameState;
  const roomId = player.location;
  const room = world.rooms[roomId] || {};
  const phase = meta.clock.phase;
  const time = formatTime(meta.clock.minutes);
  const day = meta.clock.day;

  // Active NPCs: full bible + relationship + memory
  const activeContext = sceneState.active.map(id => {
    const npc = npcs[id];
    if (!npc) return null;
    return {
      id,
      name: npc.bible.name || 'Unknown',
      bible: npc.bible,
      mood: npc.mood,
      activity: npc.activity,
      needs: npc.needs,
      relPlayer: npc.relPlayer,
      memory: buildMemorySlice(npc),
      castWebSlice: buildCastWebSlice(id, npcs, world.castWeb),
    };
  }).filter(Boolean);

  // Ambient NPCs: one-line sketch + current activity
  const ambientContext = sceneState.ambient.map(id => {
    const npc = npcs[id];
    if (!npc) return null;
    return {
      id,
      name: npc.bible.name || 'Unknown',
      sketch: npc.bible.sketch || `${npc.bible.name || 'Someone'} is ${npc.activity || 'here'}.`,
      activity: npc.activity,
    };
  }).filter(Boolean);

  return {
    contentConfig: meta.contentConfig || null,
    scene: {
      room: ROOMS[roomId]?.name || roomId,
      roomId,
      phase,
      time,
      day,
      cleanliness: room.cleanliness,
    },
    player: {
      name: 'You',
      location: roomId,
      mood: player.mood,
      energy: player.energy,
      hunger: player.hunger,
      money: player.money,
      flags: player.flags,
    },
    activeNpcs: activeContext,
    ambientNpcs: ambientContext,
    worldEvents: getRecentEvents(world.events, 3, npcs),
  };
}

function buildMemorySlice(npc) {
  return {
    facts: (npc.memory.facts || []).slice(-10).map(f => f.text),
    episodes: (npc.memory.episodes || [])
      .filter(e => e.decay > 0.2)
      .slice(-5)
      .map(e => e.text),
    summary: npc.memory.summary || '',
  };
}

function buildCastWebSlice(npcId, npcs, castWeb) {
  const slice = [];
  for (const [pairKey, pair] of Object.entries(castWeb || {})) {
    if (!pairKey.includes(npcId)) continue;
    const otherId = pairKey.split('|').find(id => id !== npcId);
    const other = npcs[otherId];
    if (!other) continue;
    const dirKey = `${npcId}→${otherId}`;
    const axes = pair.axes?.[dirKey] || {};
    slice.push({
      name: other.bible.name || otherId,
      status: other.residency?.status || 'resident',
      relationship: {
        trust: axes.trust || 0,
        affection: axes.affection || 0,
        tension: axes.tension || 0,
        respect: axes.respect || 0,
      },
      sharedHistory: pair.sharedBeat || '',
      known: pair.priorRel?.known || 0,
    });
  }
  return slice;
}

// Resolve the N most recent events into readable text using formatEventText
// (SIM), so LLM can drop them into a prompt without needing its own copy of
// the npcs map. Text is resolved here — assembleContext already has npcs in
// scope — rather than passed as a raw template downstream.
function getRecentEvents(events, count, npcs) {
  return (events || []).slice(-count).map(e => ({
    type: e.type,
    npcId: e.npcId,
    roomId: e.roomId,
    text: formatEventText(e, npcs || {}),
  }));
}

// --- LLM Proposal validation and application ---
// LLM returns a proposal; NPC validates and applies via STATE adapter.
// LLM never writes to state directly.

function validateProposal(proposal, context) {
  const errors = [];
  if (!proposal || typeof proposal !== 'object') return { valid: false, errors: ['Proposal is not an object'] };

  // Validate dialogue entries. LLM output is untrusted input, not an
  // internal invariant — malformed shape here is an error to report and
  // fall back from (see callLLM), never an assert() throw. DEV is true in
  // the Perchance editor, so throwing here would take down every scene
  // whose model response doesn't parse cleanly.
  if (proposal.dialogue) {
    if (!Array.isArray(proposal.dialogue)) {
      errors.push('Proposal dialogue must be array');
    } else {
      const validSpeakers = [...context.activeNpcs.map(n => n.id), ...context.activeNpcs.map(n => n.name), 'player', 'You'];
      for (const entry of proposal.dialogue) {
        if (!entry.speaker || !entry.text) {
          errors.push('Dialogue entry missing speaker or text');
          continue;
        }
        if (!validSpeakers.includes(entry.speaker)) {
          errors.push(`Unknown speaker: ${entry.speaker}`);
        }
      }
    }
  }

  // Validate relationship deltas — only for active NPCs
  if (proposal.relationshipDeltas) {
    for (const [npcId, deltas] of Object.entries(proposal.relationshipDeltas)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Relationship delta for non-active NPC: ${npcId}`);
      }
      for (const axis of ['trust', 'affection', 'tension', 'respect']) {
        if (deltas[axis] !== undefined) {
          if (typeof deltas[axis] !== 'number' || Math.abs(deltas[axis]) > 0.3) {
            errors.push(`Relationship delta ${axis} for ${npcId} out of range (max ±0.3 per call): ${deltas[axis]}`);
          }
        }
      }
    }
  }

  // Validate mood deltas
  if (proposal.moodDeltas) {
    for (const [npcId, delta] of Object.entries(proposal.moodDeltas)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Mood delta for non-active NPC: ${npcId}`);
      }
      if (typeof delta !== 'number' || Math.abs(delta) > 0.2) {
        errors.push(`Mood delta for ${npcId} out of range (max ±0.2): ${delta}`);
      }
    }
  }

  // Validate memory additions
  if (proposal.memoryAdditions) {
    for (const [npcId, additions] of Object.entries(proposal.memoryAdditions)) {
      if (!context.activeNpcs.find(n => n.id === npcId)) {
        errors.push(`Memory addition for non-active NPC: ${npcId}`);
      }
      if (additions.facts && !Array.isArray(additions.facts)) errors.push(`Memory facts for ${npcId} must be an array`);
      if (additions.episodes && !Array.isArray(additions.episodes)) errors.push(`Memory episodes for ${npcId} must be an array`);
    }
  }

  // New, additive effect vocabulary (EFFECTS section) — validated
  // separately from the checks above so the existing rules stay
  // byte-identical. Effect rejections do NOT fail the whole proposal:
  // partial acceptance means one bad effect line costs only that line, not
  // the narration/dialogue/legacy deltas around it (see applyProposal).
  // The minimal `{ player: { money } }` shim below is enough for every
  // effect validator that currently exists (only SPEND_MONEY reads
  // gameState) without threading the full game state through this
  // function's signature.
  const activeIds = context.activeNpcs.map(n => n.id);
  const presentIds = [...activeIds, ...(context.ambientNpcs || []).map(n => n.id)];
  const effCtx = buildEffectContext({ player: { money: context.player.money } }, activeIds, presentIds, []);
  const effResult = validateEffects(normalizeProposal(proposal).effects, effCtx, 'llm');
  recordEffectOutcome(effResult);

  return { valid: errors.length === 0, errors, effects: effResult };
}

// Apply a validated proposal to state via STATE adapter. Returns the NPC
// ids it touched (so UI can pull just those back from kv instead of a full
// reload) and the narration/dialogue as log entries — it does not write the
// session log itself. Time/clock cost is the caller's concern (advanced via
// SIM's resolveBatch before or after the LLM call), not this function's;
// clock advancement lived here previously but its return value was never
// read by any caller, so it never actually cost the player anything.
async function applyProposal(proposal, context, gameState) {
  const events = [];
  const updatedNpcIds = new Set();
  const logEntries = [];

  // Apply relationship deltas
  if (proposal.relationshipDeltas) {
    for (const [npcId, deltas] of Object.entries(proposal.relationshipDeltas)) {
      await updateNpc(npcId, npc => applyRelDelta(npc, deltas));
      updatedNpcIds.add(npcId);
      events.push({ type: 'relDelta', npcId, deltas });
    }
  }

  // Apply mood deltas
  if (proposal.moodDeltas) {
    for (const [npcId, delta] of Object.entries(proposal.moodDeltas)) {
      await updateNpc(npcId, npc => applyMoodDelta(npc, delta));
      updatedNpcIds.add(npcId);
      events.push({ type: 'moodDelta', npcId, delta });
    }
  }

  // Apply memory additions
  if (proposal.memoryAdditions) {
    for (const [npcId, additions] of Object.entries(proposal.memoryAdditions)) {
      await updateNpc(npcId, npc => {
        let updated = npc;
        if (additions.facts) {
          for (const f of additions.facts) updated = addMemoryFact(updated, f);
        }
        if (additions.episodes) {
          for (const e of additions.episodes) updated = addMemoryEpisode(updated, gameState.meta.clock.day, e.text || e, e.importance || 0.5);
        }
        return updated;
      });
      updatedNpcIds.add(npcId);
    }
  }

  // New effect vocabulary (EFFECTS section) — synchronous, in-memory
  // mutation of gameState (the same object reference as UI's
  // currentGameState), so no kv round-trip or resync is needed for ids
  // only touched here; the next saveAtBoundary flush (already an
  // unconditional per-NPC write loop) persists them. Effect-touched ids
  // are returned separately as effectNpcIds rather than folded into
  // updatedNpcIds — that set specifically means "needs a kv resync", which
  // these don't.
  let effectNpcIds = [];
  if (proposal.effects) {
    const activeIds = context.activeNpcs.map(n => n.id);
    const presentIds = [...activeIds, ...(context.ambientNpcs || []).map(n => n.id)];
    const effCtx = buildEffectContext(gameState, activeIds, presentIds, []);
    const { valid } = validateEffects(normalizeProposal(proposal).effects, effCtx, 'llm');
    effectNpcIds = applyEffects(valid, effCtx).touchedNpcIds;
  }

  // Narration/dialogue: handed back as data. UI's addLogEntry is the single
  // writer for the session log (both persists and renders it) — this
  // function must not write it directly, or the two paths drift.
  if (proposal.narration) logEntries.push({ type: 'narration', text: proposal.narration });
  if (proposal.dialogue) {
    for (const d of proposal.dialogue) {
      logEntries.push({ type: 'dialogue', speaker: d.speaker, text: d.text });
    }
  }

  return { events, updatedNpcIds: [...updatedNpcIds], effectNpcIds, logEntries };
}

// --- Character validation ---
// Single gate: validateCharacter(obj) → { valid, errors, normalized }
// Every construction path returns through it.

function validateCharacter(obj) {
  const errors = [];
  const normalized = { bible: {}, mutable: {} };

  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'], normalized: null };

  const bible = obj.bible || obj;
  const schema = CHARACTER_SCHEMA.bible;

  // Validate bible fields
  for (const [field, spec] of Object.entries(schema)) {
    const val = bible[field];
    if (spec.required && (val === undefined || val === null || val === '')) {
      // Allow empty for prose fields that will be filled by LLM later
      if (field === 'name' || field === 'visual' || field === 'history' || field === 'sketch' || field === 'sampleLines') {
        normalized.bible[field] = spec.default;
        continue;
      }
      errors.push(`Missing required field: bible.${field}`);
      continue;
    }
    if (val === undefined || val === null) {
      normalized.bible[field] = spec.default;
      continue;
    }

    // Type check
    if (spec.type === 'string' && typeof val !== 'string') {
      errors.push(`bible.${field} must be string, got ${typeof val}`);
      continue;
    }
    if (spec.type === 'number' && typeof val !== 'number') {
      errors.push(`bible.${field} must be number, got ${typeof val}`);
      continue;
    }
    if (spec.type === 'array' && !Array.isArray(val)) {
      errors.push(`bible.${field} must be array`);
      continue;
    }
    if (spec.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
      errors.push(`bible.${field} must be object`);
      continue;
    }

    // Range check
    if (spec.range && typeof val === 'number') {
      if (val < spec.range[0] || val > spec.range[1]) {
        errors.push(`bible.${field} out of range [${spec.range[0]}, ${spec.range[1]}]: ${val}`);
        continue;
      }
    }

    // Max length
    if (spec.maxLength && typeof val === 'string' && val.length > spec.maxLength) {
      normalized.bible[field] = val.substring(0, spec.maxLength);
      continue;
    }

    // Enum check
    if (spec.enum && !spec.enum.includes(val)) {
      errors.push(`bible.${field} must be one of ${spec.enum.join(', ')}, got ${val}`);
      continue;
    }

    normalized.bible[field] = val;
  }

  // Validate temperament sub-fields
  if (normalized.bible.temperament && schema.temperament.fields) {
    for (const [axis, aspec] of Object.entries(schema.temperament.fields)) {
      const v = normalized.bible.temperament[axis];
      if (v === undefined || v === null) {
        normalized.bible.temperament[axis] = 0;
      } else if (typeof v === 'number' && (v < aspec.range[0] || v > aspec.range[1])) {
        errors.push(`temperament.${axis} out of range: ${v}`);
      }
    }
  }

  // Validate mutable fields if present
  if (obj.bibleRevision !== undefined) normalized.mutable.bibleRevision = obj.bibleRevision;
  if (obj.bibleChanges !== undefined) normalized.mutable.bibleChanges = obj.bibleChanges;

  return { valid: errors.length === 0, errors, normalized: { bible: normalized.bible, bibleRevision: normalized.mutable.bibleRevision || 0, bibleChanges: normalized.mutable.bibleChanges || [] } };
}

// --- Memory summary compaction (piggyback on player-contact LLM calls) ---
function shouldCompactMemory(npc) {
  return (npc.memory.episodes || []).length >= MEMORY_BUDGET.maxEpisodes;
}

// ===== /SECTION: NPC =====
