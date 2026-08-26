// ===== SECTION: PEEK & LISTEN (Intimacy & Voyeurism Phase 10, D6/D7) =====
// The timed real-time hold at a door. The player holds a peek through the
// keyhole (D6) or listens at the door, and game-minutes tick while they
// watch: peek.js pushes the 'peeking' time context, so the CONTINUOUS clock
// runs at TIME_DILATION.scales.peeking (60x = 1 game-minute per real second)
// and D7's "the scene can change mid-peek" comes from the clock's own sim
// checkpoints. This file never loops sim ticks during a hold (the closed-
// form fast-forward rule) — it only READS the clock. Each real second the
// session loop re-derives the door cue + occupant state, accrues the risk
// ramp (PEEK), and rolls the catch; a catch resolves to a per-NPC personality
// outcome (PEEK_OUTCOMES), decided deterministically and narrated from
// authored pools — no LLM call decides any boundary outcome (D15).
//
// The image half lives in image.js (composePeekKey / composePeekPrompt /
// getPeekImage), the lens UI in index.html + actionwindow.js's openPeekHold /
// renderPeekHold. ui.js's handleAction intercepts door.keyhole / door.listen and
// calls startPeekSession here. Everything sim-adjacent here is pure or a trusted
// producer (seeded rng only, no bare Math.random).

// --- Module state ----------------------------------------------------------
// One session at a time; a session is whatever the player is holding RIGHT
// NOW. None of it persists (a hold is a moment, not a save field) — what
// persists is what the hold did (rel/suspicion deltas, flags, log entries).
let peekSession = null;
let _peekTimer = null;

function peekSessionActive() {
  return !!peekSession;
}

// --- Pure derivations ------------------------------------------------------

// The focus occupant of a peek: the room's owner if they are in there, else
// the first present occupant. Null when nobody is in the room. PURE.
function peekFocusOccupant(gs, roomId) {
  if (!gs || !roomId || !ROOMS[roomId]) return null;
  const present = getPresentNpcIds(gs.npcs || {}, roomId);
  if (present.length === 0) return null;
  const ownerId = roomOwnerId(roomId, gs.npcs);
  const focusId = present.includes(ownerId) ? ownerId : present[0];
  const npc = gs.npcs[focusId];
  return npc ? { npcId: focusId, npc } : null;
}

// Whether a door can be peeked at right now: someone is in there AND the
// room reads as lit (D6 — empty/dark rooms are text-only, no image spent).
// A sleeping occupant's dark door is Phase 17's boundary-act territory, not
// a Phase 10 keyhole. PURE.
function peekWatchable(gs, roomId) {
  if (!peekFocusOccupant(gs, roomId)) return false;
  return roomLightVisible(gs, roomId);
}

// The activity/clothing descriptor for text + image composition. PURE.
function peekViewDescriptor(gs, roomId, focus) {
  const npc = focus.npc;
  const activity = npc.activity || '';
  const clothing = npc.clothing || 'dressed';
  return { activity, clothing, actKey: activity || clothing || 'hanging_out' };
}

// Per-tick risk increment for a session — the plan's curve, planted in
// PEEK and read for the first time here (the stealthSuccess skill's first
// mechanical reader). PURE.
function peekRiskPerTick(session, gs) {
  const p = PEEK;
  const stealth = skillMod(gs.player, 'stealth', 'stealthSuccess');
  const focus = gs && session.focusNpcId ? gs.npcs[session.focusNpcId] : null;
  const perception = focus ? getNpcPerception(focus) : 0;
  const locked = getDoorState(gs, session.roomId) === 'locked';
  const risk = p.baseRisk + p.riskPerTick * session.ticksElapsed
    - stealth * p.stealthBonus
    - (locked ? p.lockBonus : 0)
    + perception * p.perceptionWeight;
  return Math.max(0, risk);
}

// The per-tick caught probability for an accumulated risk. Monotone-
// saturating: a long hold is eventually caught, never certain in one tick.
// PURE.
function peekCaughtChance(riskAccum) {
  const p = PEEK;
  return p.maxCatchChance * (riskAccum / (riskAccum + p.riskHalfway));
}

// The personality gate → weight table for the caught roll. PURE.
function peekOutcomeWeights(gs, occupant) {
  const tables = PEEK_OUTCOMES.weightTables;
  const rel = occupant.relPlayer || {};
  if ((rel.tension || 0) >= PEEK_OUTCOMES.hostileTension) return tables.hostile;
  const phase = rel.conversationPhase;
  const warm = (rel.comfort || 0) >= PEEK_OUTCOMES.warmComfort
    || PEEK_OUTCOMES.warmPhases.includes(phase);
  if (warm) {
    return npcDeviancy(occupant) >= PEEK_OUTCOMES.deviantThreshold
      ? tables.warmDeviant : tables.warm;
  }
  // A near-stranger (all relPlayer axes at default, no grievances) reads as
  // cold — the same shape willingness.js's stranger floor uses.
  const stranger = !(rel.trust || rel.affection || rel.tension || rel.respect || rel.desire)
    && !(rel.comfort || 0)
    && !(rel.grievances && rel.grievances.length > 0);
  return stranger ? tables.cold : tables.neutral;
}

// Deterministically resolve a caught hold to its outcome. Applies NOTHING —
// the caller applies effects + narration. PURE (seeded rng only). Returns
// the OUTCOME KEY string ('stop' | 'ignore' | 'escalate' | 'engage' |
// 'confront'), not weightedPick's {val, weight} item — the caller indexes
// PEEK_OUTCOMES and string-compares it. Zero-weight outcomes are FILTERED
// first: weightedPick's `item.weight || 1` would otherwise promote a 0 to
// weight 1, silently re-opening an outcome the personality gate forbids
// (a hostile target must never escalate/engage).
function resolvePeekCaughtOutcome(gs, session) {
  const occupant = gs.npcs[session.focusNpcId];
  const weights = peekOutcomeWeights(gs, occupant);
  const rng = seededRng(gs.meta.seed, `peek_caught_${gs.meta.clock.day}_${Math.floor(gs.meta.clock.minutes * 100)}_${session.roomId}_${session.focusNpcId}`);
  const options = Object.keys(weights).filter(k => weights[k] > 0);
  return weightedPick(rng, options.map(k => ({ val: k, weight: weights[k] }))).val;
}

// Whether the watched act is sexual (PEEK.desireActs) — the player's
// 'peeked_at_sex' desire mark's trigger. PURE.
function peekActIsSexual(session) {
  return PEEK.desireActs.includes(session.lastActivity || '');
}

// --- Prose ----------------------------------------------------------------
// Authored, varied (D4), deterministic per (pool, room, day). Reads gs for
// the day/seed; {name}/{door} are substituted. Never boundary content that
// bypasses a gate — this is narration of what the deterministic systems
// already decided.
function pickPeekProse(gs, key, session, occupant) {
  const pool = PEEK_PROSE[key];
  if (!pool) return '';
  const name = occupant?.bible?.name
    || (session?.focusNpcId && gs?.npcs?.[session.focusNpcId]?.bible?.name)
    || 'They';
  const seed = hashStr(`${key}|${session?.roomId || ''}|${gs?.meta?.clock?.day || 0}`) + (gs?.meta?.seed || 0);
  const rng = mulberry32(seed);
  const line = pool[Math.floor(rng() * pool.length)];
  return line.replace('{name}', name).replace('{door}', session?.doorName || 'the door');
}

// The live "what you see" line under the lens (peek mode): a frame from the
// view pool, the act phrase from PEEK_VIEW_ACT (safe/explicit by the same
// gate image.js reads), and a clothing clause when the state machine has
// something to say. Deterministic. PURE.
function composePeekViewLine(gs, session, focus) {
  const desc = peekViewDescriptor(gs, session.roomId, focus);
  const gateOpen = intimateAllowed(gs) && NAKED_CLOTHING_STATES.includes(desc.clothing);
  const actDef = PEEK_VIEW_ACT[desc.activity] || PEEK_VIEW_ACT._default;
  const act = gateOpen && actDef.explicit ? actDef.explicit : actDef.safe;
  const stateClause = PEEK_VIEW_CLOTHING[desc.clothing] || '';
  const name = focus.npc.bible?.name || 'they';
  const seed = hashStr(`view|${session.roomId}|${desc.actKey}|${gs.meta.clock.day}`) + (gs.meta.seed || 0);
  const rng = mulberry32(seed);
  const frame = PEEK_PROSE.viewFrames[Math.floor(rng() * PEEK_PROSE.viewFrames.length)];
  return frame.replace('{name}', name).replace('{act}', act).replace('{state}', stateClause);
}

// --- Image budget ----------------------------------------------------------
// Per-session cap in the session object; per-day cap on player.flags (a
// free-form flag, persisted by the normal player save). The cache is the
// primary gate; this is the secondary spend brake.
function peekImageBudgetAllows(gs, session) {
  if (session.freshImages >= PEEK.imageBudget.freshPerSession) return false;
  const rec = gs.player.flags && gs.player.flags._peekBudget;
  if (rec && rec.day === gs.meta.clock.day && rec.count >= PEEK.imageBudget.freshPerDay) return false;
  return true;
}

function peekImageBudgetSpend(gs, session) {
  session.freshImages++;
  const rec = gs.player.flags && gs.player.flags._peekBudget;
  gs.player.flags = {
    ...(gs.player.flags || {}),
    _peekBudget: rec && rec.day === gs.meta.clock.day
      ? { day: rec.day, count: rec.count + 1 }
      : { day: gs.meta.clock.day, count: 1 },
  };
}

// --- The session controller ------------------------------------------------
// startPeekSession is called from UI's handleAction (door.keyhole /
// door.listen). The hold itself rides the continuous clock: peek.js pushes
// the 'peeking' context and the session loop only reads time + re-derives.
async function startPeekSession(roomId, mode) {
  if (peekSession || !currentGameState || !ROOMS[roomId]) return;
  if (currentGameState.player.location === roomId) return;
  const gs = currentGameState;
  const doorObj = doorObjectBetween(gs, gs.player.location, roomId);
  if (!doorObj) return;

  // D6: empty/dark rooms are text-only — no session, no image spent.
  if (!peekWatchable(gs, roomId)) {
    const key = peekFocusOccupant(gs, roomId) ? 'dark' : 'empty';
    addLogEntry('narration', pickPeekProse(gs, key, { doorName: roomPhrase(roomId) + ' door', roomId }));
    return;
  }

  const focus = peekFocusOccupant(gs, roomId);
  const s = {
    doorId: doorObj.id,
    doorName: roomPhrase(roomId) + ' door',
    roomId,
    mode: mode === 'listen' ? 'listen' : 'peek',
    focusNpcId: focus.npcId,
    ticksElapsed: 0,
    riskAccum: 0,
    caught: false,
    freshImages: 0,
    lastActivity: focus.npc.activity || '',
    lastActKey: null,
    _viewLine: null,
    _peekImageKey: null,
    _peekImageUrl: null,
    _desireMarked: false,
  };
  peekSession = s;
  pushTimeContext('peeking');

  addLogEntry('narration', pickPeekProse(gs, s.mode === 'peek' ? 'openPeek' : 'openListen', s));
  openPeekHold(gs, s);
  await _refreshView(s, focus);

  _peekTimer = setInterval(() => { _peekTick(); }, PEEK.realTickMs);
}

// The per-real-second loop. Advances nothing itself — the clock does that —
// it re-derives state, accrues risk and rolls the catch.
async function _peekTick() {
  const s = peekSession;
  if (!s) return;
  const gs = currentGameState;
  if (!gs) { _endPeekSession('aborted'); return; }
  if (gs.player.energy <= 0) { _endPeekSession('tired'); return; }

  const focus = peekFocusOccupant(gs, s.roomId);
  if (!focus) { _endPeekSession('empty'); return; }
  if (!roomLightVisible(gs, s.roomId)) { _endPeekSession('dark'); return; }
  if (focus.npcId !== s.focusNpcId) s.focusNpcId = focus.npcId;

  s.ticksElapsed++;
  s.riskAccum = Math.min(PEEK.maxRisk, s.riskAccum + peekRiskPerTick(s, gs));

  // Mark the one-shot desire source once per session on a sexual act — the
  // plan's 'peeked_at_sex' reader (strongest-pending wins; decayPlayerNeeds
  // consumes it on its next span).
  if (!s._desireMarked && peekActIsSexual(s)) {
    s._desireMarked = true;
    notePlayerDesireSource(gs, PEEK.desireSource);
  }

  await _refreshView(s, focus);

  const chance = peekCaughtChance(s.riskAccum);
  const rng = seededRng(gs.meta.seed, `peek_roll_${gs.meta.clock.day}_${Math.floor(gs.meta.clock.minutes * 100)}_${s.roomId}_${s.focusNpcId}_${s.ticksElapsed}`);
  if (rng() < chance) { await _resolvePeekCaught(s, gs); return; }

  if (s.ticksElapsed >= PEEK.maxHoldTicks) { _endPeekSession('cramp'); return; }
  updatePeekHold(gs, s);
}

// Re-derive what the player sees/hears and repaint the overlay. The image is
// refreshed only when the scene's act key changes AND the budget allows;
// otherwise the lens keeps its last frame (or the shadows line).
async function _refreshView(s, focus) {
  const gs = currentGameState;
  const desc = peekViewDescriptor(gs, s.roomId, focus);
  s.lastActivity = desc.activity;
  const changed = desc.actKey !== s.lastActKey;
  s.lastActKey = desc.actKey;

  if (s.mode === 'listen') {
    const cues = deriveDoorCues(gs, findObjectById(gs, s.doorId), gs.player.location);
    const aud = (cues && cues.audible) || [];
    const kept = aud.slice(0, PEEK.listen.maxAudibleSignals);
    s._viewLine = kept.length > 0
      ? kept.map((sig, i) => pickDoorCueText('sound', sig, s.roomId, s.ticksElapsed + i, gs.meta.clock.day).replace('{door}', s.doorName)).join(' ')
      : pickPeekProse(gs, 'listenSilent', s, focus.npc);
    updatePeekHold(gs, s);
    return;
  }

  s._viewLine = composePeekViewLine(gs, s, focus);
  if (!changed) { updatePeekHold(gs, s); return; }

  const img = document.getElementById('peek-img');
  const shimmer = document.getElementById('peek-shimmer');
  const key = composePeekKey(gs, s.roomId, focus.npc, desc.actKey);
  if (key === s._peekImageKey) { updatePeekHold(gs, s); return; }

  if (!peekImageBudgetAllows(gs, s)) {
    // Degraded frame: keep what we have, or fall to the shadows line.
    if (!s._peekImageUrl) {
      if (shimmer) shimmer.removeAttribute('hidden');
      s._viewLine = pickPeekProse(gs, 'shadows', s, focus.npc);
    }
    updatePeekHold(gs, s);
    return;
  }

  if (shimmer) shimmer.removeAttribute('hidden');
  const result = await getPeekImage(gs, s.roomId, focus.npc, focus.npcId);
  if (peekSession !== s) return; // session ended while generating
  if (result && result.url) {
    if (img) img.src = result.url;
    // D17.5: register the keyhole frame with the shared info/reroll
    // mechanic — the floating ⓘ reveals on hover/tap; rerolling rolls a
    // fresh frame for the act being watched, cached under the same key.
    if (img) {
      setImageMeta(img, {
        label: 'Peek Frame',
        prompt: applyImageStyle(composePeekPrompt(gs, s.roomId, focus.npc, desc.actKey, focus.npcId)),
        seed: null,
        negativePrompt: IMAGE_NEGATIVE.peek,
        reroll: (fields) => rerollPeekFrame(gs, s.roomId, focus.npc, focus.npcId, img, fields),
      });
    }
    if (shimmer) shimmer.setAttribute('hidden', '');
    s._peekImageUrl = result.url;
    s._peekImageKey = key;
    if (!result.cached) peekImageBudgetSpend(gs, s);
  } else {
    if (shimmer) shimmer.setAttribute('hidden', '');
    s._viewLine = pickPeekProse(gs, 'shadows', s, focus.npc);
  }
  updatePeekHold(gs, s);
}

// --- Caught resolution (D7/D15) --------------------------------------------
// Deterministic outcome → deterministic effects + authored prose. The
// occupant's reaction is the personality gate's answer (PEEK_OUTCOMES), never
// a model call.
async function _resolvePeekCaught(s, gs) {
  const outcome = resolvePeekCaughtOutcome(gs, s);
  s.caught = true;
  const cfg = PEEK_OUTCOMES[outcome];

  // Intimacy & Voyeurism Phase 16 (D2/D14): the 'confront' outcome resolves
  // through the shaming system (SHAMING, npc.js) — per-dynamic-tier reaction
  // pools + deltas + the cold-shoulder onset for uncalled-for perving at a
  // cold dynamic (the D14 move-out-risk case; the day pass accumulates the
  // risk). A close dynamic reads the same caught peek as comedy (warm tier —
  // no cold-shoulder at all), exactly D2. The generic effects below only
  // serve stop/ignore/escalate/engage. (Signed DSL values are formatted
  // without a stray '+' so Number() never sees '+-0.15'.)
  if (outcome === 'confront') {
    const shaming = resolveShamingReaction(gs, gs.npcs[s.focusNpcId], {
      cause: peekActIsSexual(s) ? 'caught_peep_sexual' : 'caught_peep',
      roomId: s.roomId,
      day: gs.meta.clock.day,
    });
    const def = shaming.def;
    const shLines = [];
    for (const [axis, v] of Object.entries(def.relDeltas || {})) {
      shLines.push(`REL_DELTA ${s.focusNpcId} ${axis} ${v < 0 ? '' : '+'}${v}`);
    }
    if (def.npcMood) shLines.push(`MOOD_DELTA ${s.focusNpcId} ${def.npcMood < 0 ? '' : '+'}${def.npcMood}`);
    if (def.suspicion) shLines.push(`ADJUST_SUSPICION ${s.focusNpcId} boundary_violation +${def.suspicion}`);
    if (def.playerMood) shLines.push(`ADJUST_NEED player mood ${def.playerMood < 0 ? '' : '+'}${def.playerMood}`);
    const shCtx = buildEffectContext(gs, [s.focusNpcId], [s.focusNpcId], {}, []);
    const shResult = applyEffects(shLines.map(l => parseEffectDSL(l)[0]).filter(Boolean), shCtx);
    s._applied = (shResult && shResult.applied) || [];
    // The cold-shoulder onset (D14): uncalled-for perving at a cold dynamic
    // is the move-out-risk case — noteColdShoulder stamps the flag and the
    // day-rollover pass (ui.js) accumulates the actual move-out counter.
    if (shaming.coldShoulderSeverity > 0) {
      noteColdShoulder(gs.npcs[s.focusNpcId], shaming.coldShoulderSeverity, gs.meta.clock.day, 'caught_peep');
    }
    s._shamingTier = shaming.tier;
    s._shamingProse = shaming.prose;
  } else {
    const lines = [];
    if (cfg.tension) lines.push(`REL_DELTA ${s.focusNpcId} tension +${cfg.tension}`);
    if (cfg.affection) lines.push(`REL_DELTA ${s.focusNpcId} affection +${cfg.affection}`);
    if (cfg.suspicion) lines.push(`ADJUST_SUSPICION ${s.focusNpcId} boundary_violation +${cfg.suspicion}`);
    if (cfg.mood) lines.push(`ADJUST_NEED player mood +${cfg.mood}`);
    const effCtx = buildEffectContext(gs, [s.focusNpcId], [s.focusNpcId], {}, []);
    const effResult = applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
    s._applied = (effResult && effResult.applied) || [];
  }

  // engage: the door opens. The occupant acknowledges the watcher — the
  // surface Phase 11's invites and Phase 16's reactions ride on.
  if (outcome === 'engage') {
    applyEffects(parseEffectDSL(`SET_OBJECT_STATE ${s.doorId} ajar ajar`).map(l => l[0]).filter(Boolean), effCtx);
  }

  // escalate: D7's "desire gain for both" — a small bump on the occupant's
  // relPlayer desire axis (a direct trusted-producer write, like the
  // willingness writers); the player's half rides the desire mark below.
  if (outcome === 'escalate') {
    const occupant = gs.npcs[s.focusNpcId];
    occupant.relPlayer.desire = clamp(((occupant.relPlayer.desire || 0) + 0.15), -1, 1);
  }

  if (!s._desireMarked && (peekActIsSexual(s) || outcome === 'escalate' || outcome === 'engage')) {
    s._desireMarked = true;
    notePlayerDesireSource(gs, PEEK.desireSource);
  }

  addLogEntry('narration', pickPeekProse(gs, `${outcome}_${s.mode}`, s));
  // Phase 16 (D2): the confront beat (the door flying open) is the act line;
  // the shaming prose is the occupant's per-tier REACTION (a stranger's
  // mortification, a close dynamic's joke).
  if (s._shamingProse) addLogEntry('narration', s._shamingProse);
  s._outcome = outcome;
  // The caught window's narration is the act line for every outcome; the
  // confront beat's reaction prose (the door flying open / the per-tier
  // mortification or joke) is appended when it exists.
  s._outcomeProse = pickPeekProse(gs, `${outcome}_${s.mode}`, s)
    + (s._shamingProse ? ' ' + s._shamingProse : '');
  await _endPeekSession('caught');
  await presentPeekCaughtWindow(gs, s);
}

// --- Caught outcome window (Phase 4, D18) ---------------------------------
// The caught resolution's beat renders inside the action window: narration +
// the "what changed" strip derived from the SAME applied effects the resolve
// already ran (Design invariant 1 — this window reads the result, it never
// re-decides it). engage, and a warm-tier confront, hand off (D6) to the
// conversation; a hostile/cold/neutral refusal closes with its own beat and no
// handoff (D18) — branched on the outcome/tier the resolve produced, never on
// the verb. D1 holds: the window goes away only on a deliberate tap.
async function presentPeekCaughtWindow(gs, s) {
  if (!s || typeof openActionWindow !== 'function') return;
  const npc = gs && gs.npcs ? gs.npcs[s.focusNpcId] : null;
  const name = (npc && npc.bible && npc.bible.name) || 'They';
  const outcome = s._outcome;
  const deltas = (typeof deriveActionDeltas === 'function')
    ? deriveActionDeltas(s._applied || [], gs) : [];
  const handoff = outcome === 'engage' || (outcome === 'confront' && s._shamingTier === 'warm');
  await openActionWindow(gs, {
    tier: 'B',
    trigger: 'player',
    heading: outcome === 'confront' || outcome === 'engage' ? name : 'Caught',
    narration: s._outcomeProse || '',
    deltas,
    minutes: 0,
    dismissal: handoff ? 'handoff' : 'tap',
    defaultChoice: null,
    choices: null,
    image: null,
  });
  // A handoff's DESTINATION belongs to the caller (D20): peek.js knows who
  // it hands off to, so the talk happens here, after the window resolves.
  if (handoff && typeof doTalk === 'function') await doTalk(s.focusNpcId);
}

// --- Ending the hold -------------------------------------------------------
// Always: clear the timer + context + overlay, render once, save. `reason`
// is 'caught' | 'stopped' | 'empty' | 'dark' | 'tired' | 'cramp' | 'aborted'.
async function _endPeekSession(reason) {
  if (!peekSession) return;
  const s = peekSession;
  clearInterval(_peekTimer); _peekTimer = null;
  peekSession = null;
  popTimeContext();

  closeActionWindow();

  // Intimacy & Voyeurism Phase 15 (D8): a peek that showed an act becomes a
  // 'witnessed' ledger entry — the codex's fuel, written ONCE per session
  // (s._ledgerWritten), for peek mode only (listening is hearing, not
  // seeing). The act maps through codexActForActivity; a pair act's partner
  // is the OTHER present occupant (the lens focuses on one of the two). The
  // outcome carries the plan's 'caught' when the hold ended in a catch.
  if (s.mode === 'peek' && !s._ledgerWritten && currentGameState) {
    const mapped = codexActForActivity(s.lastActivity);
    if (mapped) {
      let otherId = null;
      if (mapped.paired) {
        const others = getPresentNpcIds(currentGameState.npcs, s.roomId).filter(id => id !== s.focusNpcId);
        if (others.length === 1) otherId = others[0];
      }
      notePlayerWitnessedEntry(currentGameState, s.focusNpcId, mapped.act,
        currentGameState.meta.clock.day, s.roomId, {
          otherNpcId: otherId,
          outcome: s.caught ? 'caught' : null,
        });
      s._ledgerWritten = true;
    }
  }

  if (reason === 'empty' || reason === 'dark') {
    addLogEntry('narration', pickPeekProse(currentGameState, reason, s));
  } else if (reason === 'tired') {
    addLogEntry('narration', "You're too exhausted to keep watching. You straighten up.");
  } else if (reason === 'cramp') {
    addLogEntry('narration', 'Your neck is starting to cramp. You straighten up.');
  } else if (reason === 'stopped') {
    addLogEntry('narration', s.mode === 'peek' ? 'You pull away from the keyhole.' : 'You step back from the door.');
  }

  render(currentGameState, currentSceneState);
  await saveAtBoundary('peek', currentGameState);
}

// Public stop — wired to the overlay's Stop button and the Escape chain.
async function stopPeekSession() {
  if (!peekSession) return;
  _endPeekSession('stopped');
}

// ===== /SECTION: PEEK & LISTEN =====
