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
// was never called, so buildMemorySliceV2's decay>0.2 filter never actually
// pruned anything.
// opts.advanceClock (default true) — whether resolveBatch should move
//   meta.clock. The clock loop's checkpoint path passes false: the rAF loop
//   already walked the clock through these minutes, and advancing again is
//   what made the whole game run at 2x speed.
// opts.fromClockLoop (default false) — set by the checkpoint path so we
//   don't pause the very loop that is calling us. Pausing mid-frame left an
//   orphan rAF chain alive that resumeClockLoop then ran alongside a fresh
//   one, gaining a chain per checkpoint.
// Correctness plan Phase 3 (D8) — how memorable was this world event?
// Precedence: an explicit `importance` on the event object wins (so a drive
// or a future emitter can override), then the EVENT_IMPORTANCE band for its
// type, then `ambient`. Falling back to ambient is the safe direction: an
// unclassified background event must never outrank a real conversation.
function eventImportance(evt) {
  if (typeof evt?.importance === 'number') return evt.importance;
  const band = EVENT_IMPORTANCE[evt?.type];
  return MEMORY_IMPORTANCE[band] ?? MEMORY_IMPORTANCE.ambient;
}

async function advanceAndResolve(ticks, opts = {}) {
  const advanceClockToo = opts.advanceClock !== false;
  const wasRunning = !opts.fromClockLoop && clockLoopRunning;
  if (wasRunning) pauseClockLoop();

  const dayBefore = currentGameState.meta.clock.day;
  // Initiative plan Phase 3: who was already waiting on the player, so the
  // arrival narration below fires only for records this batch OPENED.
  const overturesBefore = pendingOvertureIds(currentGameState);
  const { state: newState, events, peepResults } = resolveBatch(currentGameState, ticks, { advanceClock: advanceClockToo, suppressNeeds: opts.suppressNeeds });
  currentGameState = newState;
  appendWorldEvents(events);

  // BrineOS Phase 2: the phone's battery lives on the world object and
  // advances with the sim. Heartbeat plan Phase 3: the DISCRETE path runs
  // it here in closed form for the whole batch (minutes x per-minute rate,
  // once — never per tick). The CONTINUOUS path (suppressNeeds — the clock
  // loop's checkpoints) skips it because clockFrame's heartbeat accumulator
  // already owns every one of those minutes at per-minute cadence; running
  // it here too would double the drain. An 8-hour sleep must still drain
  // the battery (decision C) — on the discrete path it does, right here.
  //
  // needsMinutes defaults to ticks*CLOCK.tickMinutes (exact for every direct
  // caller here, which all pass whole tick counts for an exact-minutes
  // span) but advanceAndResolveMinutes overrides it with the TRUE requested
  // span — ticks is a grid-boundary-crossing count, not a duration, so for
  // a span that does not land on a tick boundary the two can diverge in
  // either direction (this audit's gap-fix: D1's "one heartbeat, every
  // consumer" applies here exactly as it does to decayPlayerNeeds below).
  const needsMinutes = opts.needsMinutes ?? (ticks * CLOCK.tickMinutes);
  if (!opts.suppressNeeds) {
    advancePhoneBattery(currentGameState, needsMinutes);
  }

  // In-memory, not a kv round-trip via updateNpc: this loop used to read-
  // modify-write through kv per npc, which silently clobbered any earlier
  // in-memory-only mutation on the same npc this same call chain (e.g.
  // STEALTH's resolveRoomEntryStealth, or applyProposal's EFFECTS-vocab
  // block in doTalk) with a stale pre-mutation kv snapshot, since neither
  // of those persist immediately — they rely on the next saveAtBoundary,
  // same as this loop now does. addMemoryEpisode/decayMemory are already
  // pure functions (see EFFECTS' applyMemoryEpisodeEffect calling
  // addMemoryEpisode directly the same way), so no kv access is needed
  // here at all.
  for (const evt of events) {
    const npc = currentGameState.npcs[evt.npcId];
    if (!npc) continue;
    const text = formatEventText(evt, currentGameState.npcs);
    // Correctness plan Phase 3 (D8): importance comes from what KIND of thing
    // happened, not a hardcoded 0.5. An NPC generates 3-7 ambient events a
    // day; at a flat 0.5 against FIFO eviction, a week of laundry and naps
    // pushed out every conversation that mattered.
    // Initiative plan Phase 2 (D15): the episode carries `participants` and
    // `emotionalTag` now. Without them rumination's two D7 rules could never
    // fire on ambient life — thirty background episodes a week per resident
    // against a saturated episode tier produced 0 inferred facts and 0 open
    // questions, and the entire belief layer was seeded by player conversation
    // alone. `participants` was stamped inside the tick (SIM's
    // stampEventParticipants) because co-presence is tick-local and this loop
    // runs after the whole batch; the tag is derived here from EVENT_EMOTION,
    // which needs nothing but the type.
    currentGameState.npcs[evt.npcId] = addMemoryEpisode(
      npc, evt.day, text, eventImportance(evt), eventEmotionalTag(evt), evt.participants || []
    );
    // STEALTH (P6): SIM's resolveTick only decides/records evidence
    // discovery (stays synchronous/LLM-free); the suspicion bump itself is
    // a trusted-producer effect application, same tier as everywhere else
    // in this file that calls applyEffects directly.
    if (evt.type === 'evidence_discovered') {
      const effCtx = buildEffectContext(currentGameState, [evt.npcId], [evt.npcId], {}, []);
      applyEffects(parseEffectDSL(`ADJUST_SUSPICION ${evt.npcId} boundary_violation +${STEALTH_TUNING.sneakCaughtSuspicionDelta}`), effCtx);
    }
  }

  // Phase 6: surface detected NPC peeps as caught-peeping bubbles. Silent
  // peeps (detected=false) are already applied in-memory by resolveNpcPeep
  // (memory episode + rel delta); the player never knows. Detected peeps
  // (detected=true) need an async bubble — but only the first one per
  // advanceAndResolve call (multiple peeps in one batch is absurd; show
  // the first, queue nothing for the rest).
  if (peepResults && peepResults.length > 0) {
    const detected = peepResults.filter(r => r.detected);
    // Queue rather than show. This function runs mid-batch — doSleep
    // resolves 8 ticks in one call with the loading overlay up — and a
    // modal bubble raised behind that overlay is both invisible and
    // un-dismissable. flushPendingPeepBubble shows it once the action that
    // triggered it has actually finished.
    if (detected.length > 0 && !pendingPeepBubble) {
      pendingPeepBubble = { npcId: detected[0].npcId, playerState: detected[0].playerState };
    }
  }

  // Heartbeat plan Phase 3: memory decay moved out of this inline loop into
  // the shared decayAllMemories (npc.js), closed form over the batch's
  // game-minutes. Discrete path only — the continuous path's checkpoints
  // suppress it (suppressNeeds) so the heartbeat owns memory there too.
  if (!opts.suppressNeeds) {
    currentGameState = decayAllMemories(currentGameState, needsMinutes);
  }

  // Initiative plan Phase 3: an NPC crossed the room. Narrated here rather
  // than in the tick because the tick may not be the player's present moment —
  // a batch resolves eight hours in one call — and because narration is the UI
  // layer's job. D9's do-not-disturb set is what stops this from firing in the
  // middle of a batch the player is asleep for.
  narrateOvertureArrivals(overturesBefore);

  // Need consequences (P7): check player needs after tick resolution.
  // Fires when a need hits 0 — real mechanical effects, not just a red bar.
  processNeedConsequences();

  // Food delivery (external-world plan Phase 5): a driver arrives at a TICK,
  // not at day rollover, so the handover is checked on every clock advance —
  // discrete actions and the continuous loop's sim checkpoints both land here.
  processFoodOrdersNow();
  // QuickCart (grocery delivery): same tick-driven reasoning as food orders
  // above — a shopper arrives at a tick, not at day rollover.
  processGroceryOrdersNow();

  // Day-rollover economy: rent due/overdue, delivery arrivals, quest
  // generation/expiry. Runs once per calendar day crossed (a single
  // advanceAndResolve call can span at most one day boundary today given
  // the longest batch — sleep — is under a day, but this loops safely in
  // case that changes).
  // hasDayRolledOver/markDayRolledOver (TIME) are shared with the clock
  // loop's own midnight detection, so a day crossed by the continuous loop
  // and a day crossed by a batch here can't both process the same rollover.
  const dayAfter = currentGameState.meta.clock.day;
  for (let d = dayBefore + 1; d <= dayAfter; d++) {
    if (hasDayRolledOver(d)) continue;
    markDayRolledOver(d);
    await processDayRollover(d);
  }

  // Resume the continuous clock loop if we paused it.
  if (wasRunning) resumeClockLoop();

  // The clock loop's checkpoint path never touches the loading overlay, so
  // nothing else would flush the queue for peeps detected while idling.
  flushPendingPeepBubble();

  return events; // the events objects are the same references stored in
                 // currentGameState.world.events, so a caller marking one
                 // e.g. seenByPlayer mutates the real state, not a copy.
}

// --- Day rollover: rent, deliveries, quests ---

async function processDayRollover(day) {
  // Phase 5: the meal-rhythm counter belongs to the calendar day, not the
  // session — a fresh day is a fresh slate for "how many meals have I had
  // today".
  if (currentGameState.player) currentGameState.player.mealsToday = 0;
  // food-overhaul Phase 2 (D4): yesterday's kcal ledger resolves into the
  // day-mode that tunes today (hunger rate, sleep recovery, a small mood
  // term), then the ledger resets for the new day.
  if (currentGameState.player) rollEnergyLedger(currentGameState.player);
  // Asks plan Phase 3 (D7): the per-category repeat-ask streak is same-day
  // only — a fresh day resets the ladder. Stale entries are swept (lastDay
  // already guards reads, so this is hygiene); sweepAskCounts lives in
  // asks.js.
  sweepAskCounts(currentGameState, day);
  await processRentForDay(day);
  processBillsForDayUi(day);
  // BrineOS Phase 7 (plan 7.2): after, not before — autopay must see this
  // day's freshly posted charges and freshly evaluated cutoffs, not the
  // state from before today's bills processed. See processAutopayForDayUi.
  processAutopayForDayUi(day);
  processTaxesForDayUi(day);
  processDeliveriesForDay(day);
  // Spoilage (inventory overhaul Phase 4): stacks past shelf life +
  // graceDays convert to a mess — ROTTEN_FOOD on their container + room
  // container state — feeding the cleanliness machinery and, since Phase 2,
  // the derived room smell. Before the maid so
  // a visit hired for today can clean a mess that formed at this
  // rollover.
  processSpoilageForDay(currentGameState, day);
  // Renovation overhaul: materials "arrive" with the day's deliveries, then
  // any job whose ETA is today wraps up — grouping renovations next to
  // deliveries keeps the day-rollover narrative order sensible.
  processRenovationJobsForDay(day);
  // Visit spine (external-world plan Phase 1): retire yesterday's visits and
  // (re)ensure today's contractor visits for any job still active — a
  // backstop so saves with in-flight jobs get their crew onsite for the
  // remaining working days. Runs after the jobs rollover so a job that
  // completes today schedules nothing (its last work day was yesterday).
  processVisitsForDay(day);
  // Meal commitments (inventory overhaul Phase 7, D7): the resident-side
  // sibling of the visit sweep — a 'scheduled' commitment whose day passed
  // without a meal becomes 'missed', and old held/missed records are pruned.
  // After processVisitsForDay, mirroring its placement; runs before the
  // maid so a same-day cleaning can clear the table left from yesterday.
  processCommitmentsForDay(currentGameState, day);
  // The maid (external-world plan Phase 3): charge + perform + schedule her
  // presence for today, if today is one of her contracted days. After
  // processVisitsForDay so today's fresh visit isn't swept by the retirement
  // pass in the same rollover.
  processMaidForDay(day);
  // Friends of roommates (external-world plan Phase 6): roll each resident's
  // hosting chance for today. AFTER the maid and the contractor backstop so
  // the soft cap counts today's paid, already-committed visitors first —
  // organic visits are the ones that stand down when the place is busy, never
  // the other way round (locked decision 6).
  processFriendVisitsForDay(day);
  // Outside partners (Intimacy & Voyeurism Phase 14, D14): the boyfriend/girl
  // friend who comes over and disappears to her room. Placed directly after
  // friends because partner visits use the same organic soft cap and the same
  // plan-then-narrate split — the partner stands down alongside the friends
  // when the house is already busy, never before them.
  processOutsidePartnerVisitsForDay(day);
  // Intimacy & Voyeurism Phase 12 (D12): the relationship formation pass.
  // Slow cadence — once per day, consuming the pair co-location the tick
  // loop accumulated. Deterministic; returns narration events for any pair
  // that started seeing each other, committed, or moved in together.
  // Before the escorts' announce-ahead so a same-day couple beat reads
  // before the evening's bookings are narrated.
  const relEvents = updateRelationshipsForDay(currentGameState, day);
  for (const ev of relEvents) {
    const name = (id) => currentGameState.npcs[id]?.bible?.name || 'Someone';
    if (ev.kind === 'seeing') {
      addLogEntry('narration', `${name(ev.a)} and ${name(ev.b)} have started seeing each other.`);
    } else if (ev.kind === 'committed') {
      addLogEntry('narration', ev.moved
        ? `${name(ev.a)} and ${name(ev.b)} are officially a couple — ${name(ev.moverId)} has moved into ${ROOMS[ev.targetRoom]?.name || 'their partner\'s'} room.`
        : `${name(ev.a)} and ${name(ev.b)} are officially a couple.`);
    } else if (ev.kind === 'moved_in') {
      addLogEntry('narration', `${name(ev.a)} and ${name(ev.b)} moved in together — ${name(ev.moverId)} now shares ${ROOMS[ev.targetRoom]?.name || 'their partner\'s'} room.`);
    }
  }


  // Intimacy & Voyeurism Phase 18 (D14/D16): the pregnancy lifecycle pass —
  // emergent "trying", the visible-bump reveal, the birth event, and the
  // baby presence's daily mood/energy cost. Placed directly after the
  // relationship pass (a committed couple's emergence reads the same store);
  // returns narration lines for the same logging pattern the relEvents loop
  // above uses. Deterministic and idempotent per pregnancy record.
  if (typeof processPregnanciesForDay === 'function') {
    for (const line of processPregnanciesForDay(currentGameState, day)) {
      addLogEntry('narration', line);
    }
  }
  // Escorts (external-world plan Phase 7): retire yesterday's bookings and
  // narrate tonight's advance bookings, the same announce-ahead pattern as
  // friends. The visit itself is already scheduled (bookEscort); this is
  // lifecycle + narration only.
  processEscortBookingsForDay(day);
  // Hot Singles (AfterHours Site Expansion Phase 7): the same idempotent
  // day-rollover backfill the escort roster gets, so a save written before
  // Phase 7 picks the roster up without a migration and without ever
  // generating six NPCs from inside a render pass.
  ensureHotSinglesRoster(currentGameState);
  // Contractor tutorial (contractor doc Phase 3): one-shot quality-milestone hint once apartment quality crosses the threshold.
  maybeFireContractorQualityMilestone();
  processQuestsForDay(day);
  processGigsForDay(day);
  // Phase 8: burnout updates at day rollover based on yesterday's work
  // load. workBlocksToday is incremented by workGigBlock and reset here.
  const gigs = currentGameState.world.computer?.apps?.gigs;
  if (gigs) {
    updateBurnout(currentGameState.player, day, gigs.workBlocksToday || 0);
    gigs.workBlocksToday = 0;
  }
  processServiceVisitsForDayUi(day);
  processClassifiedsForDay(day);
  // Phase 11: investment growth at day-rollover.
  processInvestmentGrowth(currentGameState, day);
  await processRelConsequencesForDay(day);
  // Plan X-5 Phase 3 (D3) — the Chronicler's primary trigger. Last in the
  // rollover, after everything that could add to a transcript has run, and
  // deliberately here rather than on a player-contact path: rollover is
  // already a wait, which is the exception D6 names for this pass.
  await chronicleDayRollover();
}

// Need consequences (P7): fires when player needs hit 0. Called after
// every advanceAndResolve, so it checks the post-tick state. Each
// consequence fires at most once per advanceAndResolve call (tracked
// via player.flags._needConsequenceFired) to avoid stacking the same
// penalty multiple times in a single multi-tick batch.
function processNeedConsequences() {
  if (!currentGameState) return;
  const p = currentGameState.player;
  p.flags = p.flags || {};

  // Energy at 0 → no forced sleep. The player is gated from taking
  // further energy-costing actions (see isActionExemptFromEnergyGate /
  // ENERGY_GATE_EXEMPT below), but can always travel to their bedroom to
  // sleep. This replaces the old collapse/forced_sleep which teleported
  // the player and skipped hours — the user explicitly didn't want the
  // player passing out.
  // We still log a one-time warning so the player knows they're spent.
  if (p.energy <= 0 && !p.flags._energyDepleted) {
    p.flags._energyDepleted = true;
    addLogEntry('narration', "You're completely exhausted. You need to sleep before you can do anything else.");
  }
  if (p.energy > 5) p.flags._energyDepleted = false;

  // Hunger at 0 → mood penalty, and — after enough consecutive
  // advanceAndResolve calls spent at 0 — an additional health consequence.
  // healthThresholdTicks/healthLogMessage were declared but never read;
  // _starvingStreak (new) is what actually counts them now.
  if (p.hunger <= 0) {
    p.flags._starvingStreak = (p.flags._starvingStreak || 0) + 1;
    if (!p.flags._starving) {
      p.flags._starving = true;
      // Phase 5: mood is an impulse system — the starvation penalty is a
      // decaying impulse (eventTerm), never a direct bar write. The
      // sustained pressure comes from the hunger band in the mood target.
      pushMoodImpulse(p, NEED_CONSEQUENCES.hunger.moodPenaltyPerTick * 5, currentGameState.meta.clock.day);
      addLogEntry('narration', NEED_CONSEQUENCES.hunger.logMessage);
    }
    if (p.flags._starvingStreak >= NEED_CONSEQUENCES.hunger.healthThresholdTicks && !p.flags._starvingHealthHit) {
      p.flags._starvingHealthHit = true;
      pushMoodImpulse(p, NEED_CONSEQUENCES.hunger.moodPenaltyPerTick * 5, currentGameState.meta.clock.day);
      addLogEntry('narration', NEED_CONSEQUENCES.hunger.healthLogMessage);
    }
  } else if (p.hunger > 10) {
    p.flags._starving = false;
    p.flags._starvingStreak = 0;
    p.flags._starvingHealthHit = false;
  }

  // Hygiene at 0 → NPC reactions
  if (p.hygiene <= 0 && !p.flags._filthy) {
    p.flags._filthy = true;
    addLogEntry('narration', NEED_CONSEQUENCES.hygiene.logMessage);
    // Apply tension to all residents
    for (const [id, npc] of Object.entries(currentGameState.npcs)) {
      if (npc.residency.status !== 'resident') continue;
      currentGameState.npcs[id] = applyRelDelta(npc, {
        tension: NEED_CONSEQUENCES.hygiene.tensionPerNpcPerTick * 5,
        affection: NEED_CONSEQUENCES.hygiene.affectionLossPerNpcPerTick * 5,
      }, currentGameState.meta.clock.day);
    }
  }
  if (p.hygiene > 10) p.flags._filthy = false;

  // Random NPC reaction to low hygiene (checked each call)
  if (p.hygiene < NEEDS.hygiene.warnBelow) {
    const rng = orbitalRandom();
    if (rng < NEED_CONSEQUENCES.hygiene.npcReactionChance) {
      const presentNpcs = getPresentNpcIds(currentGameState.npcs, p.location);
      if (presentNpcs.length > 0) {
        const npcId = presentNpcs[Math.floor(orbitalRandom() * presentNpcs.length)];
        const npc = currentGameState.npcs[npcId];
        const template = NEED_CONSEQUENCES.hygiene.npcReactions[Math.floor(orbitalRandom() * NEED_CONSEQUENCES.hygiene.npcReactions.length)];
        addLogEntry('narration', template.replace('{name}', npc.bible.name || 'Someone'));
      }
    }
  }
}

// Relationship consequences (P7): high tension makes NPCs avoid you,
// refuse to talk, and eventually consider moving out. Checked when the
// player enters a room or tries to talk.
// NPC Overhaul Phase 3.8 — also checks comfort/desire thresholds
function checkRelConsequences(npcId) {
  const npc = currentGameState.npcs[npcId];
  if (!npc) return { canTalk: true, avoided: false };
  const rel = npc.relPlayer;
  const tension = rel.tension || 0;
  const comfort = rel.comfort || 0;
  const desire = rel.desire || 0;
  const affection = rel.affection || 0;

  // Intimacy & Voyeurism Phase 16 (D2/D14): the cold-shoulder talk gate.
  // Severity-scaled refusal + room avoidance, read from the hurt state's own
  // machine (npc.js). Deliberately FIRST — a cold-shouldering NPC's hurt
  // overrides even the desire override below: this is distance, not tension,
  // and nothing talks them out of it tonight.
  const cs = coldShoulderState(npc, currentGameState.meta.clock.day);
  if (cs.active) {
    if (orbitalRandom() < COLD_SHOULDER.talkRefuseChance[cs.severity]) {
      return { canTalk: false, avoided: false, reason: `${npc.bible.name} gives you the cold shoulder. They don't meet your eyes.` };
    }
    if (orbitalRandom() < COLD_SHOULDER.avoidChance[cs.severity]) {
      return { canTalk: false, avoided: true, reason: `${npc.bible.name} leaves the room the moment you walk in.` };
    }
  }

  // Initiative plan Phase 2 (D12/D13/D14). The gate itself is SIM's
  // npcInitiativeGate — pure, personality-scaled, and reachable by the Node
  // harness, which this function is not (it needs currentGameState and a DOM).
  // Everything below reads it; nothing recomputes it.
  const gate = npcInitiativeGate(npc, activeContentFlags(currentGameState));

  if (tension >= REL_CONSEQUENCES.tensionHigh) {
    // D13 — desire overrides the tension refusal. This branch used to block
    // EVERY approach at tensionHigh, which made `highDesire` (computed since
    // Phase 3.8 and read by nothing) unable to matter even in principle.
    // Someone disinhibited enough and wanting enough does not walk away from
    // you because they are angry with you; the friction is the point. The roll
    // is skipped outright rather than reweighted — a refusal that still lands
    // 30% of the time reads as the override being broken.
    if (!gate.tensionOverride && orbitalRandom() < REL_CONSEQUENCES.tensionRefuseTalkChance) {
      return { canTalk: false, avoided: false, reason: `${npc.bible.name} doesn't want to talk right now. They're clearly upset with you.` };
    }
    // It needs its own narration or the tension model reads as simply not
    // working — doTalk renders this before the conversation opens.
    if (gate.tensionOverride) {
      return { canTalk: true, avoided: false, chargedDespiteTension: true, ...gateFlags(gate, comfort) };
    }
  }

  if (tension >= REL_CONSEQUENCES.tensionThreshold) {
    // NPC might leave the room when you enter
    if (orbitalRandom() < REL_CONSEQUENCES.tensionAvoidChance) {
      return { canTalk: false, avoided: true, reason: `${npc.bible.name} leaves the room when you walk in.` };
    }
  }

  return { canTalk: true, avoided: false, ...gateFlags(gate, comfort) };
}

// The relationship flags checkRelConsequences reports, in one place so its two
// success returns cannot disagree. lowComfort/highComfort are NPC Overhaul
// Phase 3.8's and unchanged; mayInitiate and highDesire now come from the
// scaled gate rather than from an inline conjunction across three axes that
// all generate at 0 (D12).
//
// `mayInitiate` still has no consumer here — Phase 3's overture scorer is its
// declared one (D20 wires it in this plan, and the NOTE_TEMPLATES precedent is
// how a field ships one phase ahead of its purpose-reader). `highDesire` got
// its reader above. `tone` is deliberately NOT mirrored onto this return:
// Phase 3 calls npcInitiativeGate itself, and this plan's invariant 4 is that
// its own failure mode would be adding a third flag nothing reads.
function gateFlags(gate, comfort) {
  const flags = {};
  if (comfort < REL_CONSEQUENCES.comfortLow) flags.lowComfort = true;
  if (comfort >= REL_CONSEQUENCES.comfortHigh) flags.highComfort = true;
  if (gate.highDesire) flags.highDesire = true;
  if (gate.mayInitiate) flags.mayInitiate = true;
  return flags;
}

// --- Overtures: the player's side (initiative plan Phase 3) ----------------
// The tick decides that an NPC crosses the room; everything an overture MEANS
// to the player happens out here, outside it, where the language and the
// consequences belong (D18).
//
// Three endings, and they are the three the data model names. The player
// TALKS to them -> engaged. The player LEAVES the room -> refused, and D10's
// economy applies. Neither, and the record ages out in the tick -> lapsed, and
// it costs nothing. That mapping is why Phase 3 needs no new surface (D8):
// doTalk and doMove are the two things a player already does with someone
// standing in front of them, and doing neither is already a decision.

// Which residents were holding a pending overture, for the diff below. The
// arrival narration has to fire exactly once, on the tick the record opens,
// and comparing before-and-after is what buys that without a `surfaced` field
// nothing else would ever read (R8).
function pendingOvertureIds(gameState) {
  return new Set(Object.keys(gameState.npcs || {})
    .filter(id => isOverturePending(gameState.npcs[id])));
}

// D12 as the player experiences it: the warm and charged paths have to READ
// differently or the distinction never leaves the data model. Two template
// lists per channel, keyed by the tone the gate assigned.
//
// Phase 4: one table per channel that arrives in the scene, and the channel
// picks. `text` is deliberately absent — a text does not arrive in the room,
// it arrives in a thread, and narrating it here would tell the player about a
// message they have not opened. The IM app's unread count is its surface, as
// it was when this was a drive.
const OVERTURE_ARRIVAL_TEMPLATES = {
  approach: OVERTURE_APPROACH_TEMPLATES,
  propose: OVERTURE_PROPOSE_TEMPLATES,
  knock: OVERTURE_KNOCK_TEMPLATES,
};

// Where the arrival is visible from. An approach and a proposal happen in front
// of you; a knock happens at a door you are behind, so the knocker is by
// construction NOT in your room and the same-room test would silence the one
// channel whose whole content is a noise you hear.
function overtureArrivalVisible(npc) {
  const def = OVERTURE_DEFS[npc.overture.overtureId];
  if (def && def.waitAt === 'here') return true;
  return npc.location === currentGameState.player.location;
}

function narrateOvertureArrivals(before) {
  for (const [id, npc] of Object.entries(currentGameState.npcs || {})) {
    if (!isOverturePending(npc) || before.has(id)) continue;
    if (!overtureArrivalVisible(npc)) continue;
    // Vocation plan D18: a def may bring its OWN arrival lines. The channel
    // map is right for the four original entries — a proposal sounds like a
    // proposal whoever makes it — but the collab ask rides the propose channel
    // while being an entirely different thing to say, and giving it a fifth
    // channel would mean teaching proximity, do-not-disturb and every other
    // channel-keyed table about a channel that behaves exactly like propose.
    // An optional per-def override is the smaller change.
    const ovDef = OVERTURE_DEFS[npc.overture.overtureId];
    const byTone = (ovDef && ovDef.arrivalTemplates) || OVERTURE_ARRIVAL_TEMPLATES[npc.overture.channel];
    if (!byTone) continue;
    const lines = byTone[npc.overture.tone] || byTone.warm;
    if (!lines || lines.length === 0) continue;
    addLogEntry('narration', fillOvertureLine(lines[Math.floor(orbitalRandom() * lines.length)], npc, npc.overture));
  }
}

// The substitutions every channel's templates may carry. `{name}` is the only
// one Phase 3 needed; a proposal has to be able to say WHEN and WHERE or it is
// a mood rather than a plan, and those come off the record's terms.
function fillOvertureLine(template, npc, record) {
  const p = record.proposal;
  return template
    .replace('{name}', npc.bible?.name || 'Someone')
    .replace('{when}', p ? proposalWhen(p) : 'sometime')
    .replace('{where}', p ? (ROOMS[p.roomId]?.name || 'flat') : 'flat');
}

// "tonight at 19:00" / "tomorrow at 19:00" — the same today/tomorrow/date
// vocabulary doInviteDinner already narrates a meal invitation in, so an
// invitation reads the same whichever side of it asked.
function proposalWhen(p) {
  const today = currentGameState.meta.clock.day;
  const day = Math.floor(p.startAbs / 1440);
  const when = day === today ? 'later today'
    : day === today + 1 ? 'tomorrow'
      : formatDate(day);
  return `${when} at ${formatTime(absoluteToClock(p.startAbs).minutes)}`;
}

// The opening line the conversation starts on when the NPC is the one who
// opened. doConvSend passes its forced text straight to the model as the beat
// to respond to, so naming the motive here is what makes an NPC who crossed
// the room about a specific thing actually open about that thing — generated
// at the moment it surfaces, on the player's time budget (D18), with nothing
// pre-generated and nothing in the tick.
function overtureOpeningLine(npc, record) {
  const name = npc.bible?.name || 'your roommate';
  const topic = record.motiveRef && record.motiveRef.topic;
  // Phase 4: two channels open on the CHANNEL rather than on the motive,
  // because what they did is more specific than why. A knock's opening beat is
  // the door coming open; there is no version of that which reads as "they
  // wandered over". A proposal is only ever affection-motivated (D30), so the
  // motive switch below would give it one generic line for its only case.
  if (record.channel === 'knock') {
    return topic
      ? `You open the door. ${name} is standing there — they have been thinking about ${topic}.`
      : `You open the door. ${name} is standing there, and they came to find you.`;
  }
  if (record.channel === 'propose') {
    return `${name} asked if you wanted to spend some time together, and you said yes.`;
  }
  switch (record.motive) {
    case 'curiosity':
      return topic ? `${name} came over to you — they have been wondering about ${topic}.`
                   : `${name} came over to you with something on their mind.`;
    case 'grievance':
      return topic ? `${name} came over to you — they are still bothered about ${topic}.`
                   : `${name} came over to you, and they are not happy.`;
    case 'desire':
      return record.tone === 'charged'
        ? `${name} came over to you, standing close, and they are not pretending otherwise.`
        : `${name} came over to you, and there is something in how they are looking at you.`;
    default:
      return `${name} came over to you because they wanted your company.`;
  }
}

// D10 — a refusal costs a relationship delta AND is remembered, and BOTH
// self-limit. `overtureRefusalScale` is the limiter and it is read twice: once
// here, and once inside OVERTURE's motive scoring, so the relationship cost
// and the NPC's willingness to ask again decay on the same curve rather than
// on two that could be tuned apart.
//
// The fact goes through addMemoryFact, so it carries ordinary provenance and
// confidence and decays like any other belief — a grudge that never fades is
// the failure mode D10 exists to prevent. Written in the second person because
// that is how this codebase writes what an NPC knows about the player, and it
// is what derivePlayerModel matches on (R7).
function applyOvertureRefusal(npcId, record) {
  const npc = currentGameState.npcs[npcId];
  if (!npc || !record) return;
  const day = currentGameState.meta.clock.day;
  const scale = overtureRefusalScale(npc, day);

  const deltas = {};
  for (const [axis, v] of Object.entries(OVERTURE.refusalDelta)) deltas[axis] = v * scale;
  currentGameState.npcs[npcId] = applyRelDelta(npc, deltas, day);

  // Phase 4: the channel gets its own remembered fact where it has one, and
  // falls back to the tone-keyed base where it does not. Turning down a plan,
  // not opening a door and walking away from someone standing in front of you
  // are three different things, and a fact tier that records them identically
  // has stopped being information — derivePlayerModel reads these back as what
  // this NPC knows about you (R7).
  const byChannel = OVERTURE_DEFS[record.overtureId]?.refusalFacts;
  const template = (byChannel && (byChannel[record.tone] || byChannel.warm))
    || OVERTURE_REFUSAL_FACTS[record.tone] || OVERTURE_REFUSAL_FACTS.warm;
  currentGameState.npcs[npcId] = addMemoryFact(currentGameState.npcs[npcId], {
    text: template.replace('{name}', npc.bible?.name || 'your roommate'),
    day,
    importance: MEMORY_IMPORTANCE[OVERTURE.refusalFactImportance],
    category: 'relationship',
    provenance: 'witnessed',
    confidence: OVERTURE.refusalFactConfidence,
    emotionalTag: record.tone === 'charged' ? 'romance' : 'warmth',
  });

  // Counted last, so the delta above is scaled by the refusals BEFORE this one
  // — the first refusal costs full price, which is the point.
  noteOvertureRefused(currentGameState, npcId, day);
}

// --- Phase 4: the channels that DO need a button ---------------------------
// An approach is answered by doTalk and refused by doMove, which is why Phase 3
// shipped without a surface (D8): both are things the player already does with
// someone standing in front of them. A proposal and a knock are not. There is
// no existing verb for "yes, book that" or "open the door", and inferring one
// from a move would make walking to the kitchen mean two different things.
//
// So the def declares `respond: { accept, decline }` and RENDER offers exactly
// those two chips while the record is pending. One surface, two channels — and
// a third channel that wants one later needs only the two labels.
async function doOvertureRespond(npcId, accepted) {
  if (!npcId || !currentGameState) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc || !isOverturePending(npc)) return;
  const def = OVERTURE_DEFS[npc.overture.overtureId];
  if (!def || !def.respond) return;
  const name = npc.bible?.name || 'Them';

  if (!accepted) {
    // The same ending walking out of the room produces, reached by a button
    // instead — D10's economy applies WHOLE, because saying no to someone's
    // face is not a lesser refusal than turning your back on them.
    const record = resolveOverture(currentGameState, npcId, 'refused');
    applyOvertureRefusal(npcId, record);
    addLogEntry('narration', record.channel === 'knock'
      ? `You do not open the door. After a while, ${name} goes away.`
      : `You tell ${name} no. They take it, and the moment closes.`);
    await advanceAndResolve(1);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('overture-decline', currentGameState);
    return;
  }

  // A knock is answered by the door opening and the conversation starting, so
  // it hands straight to doTalk — which resolves the record itself, on the
  // motive, exactly as it does for an approach. Moving them into the room first
  // is the door opening: they were held on their side of it by the tick.
  if (def.waitAt === 'here') {
    currentGameState.npcs[npcId] = { ...npc, location: currentGameState.player.location };
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    await doTalk(npcId);
    return;
  }

  // A proposal is answered by the plan existing. The commitment is created HERE
  // rather than when the overture opened, which is what makes "a declined or
  // lapsed proposal leaves no orphan record" true by construction rather than
  // by a sweep.
  const record = resolveOverture(currentGameState, npcId, 'engaged');
  const p = record && record.proposal;
  if (p) {
    createCommitment(currentGameState, {
      kind: p.kind, startAbs: p.startAbs, endAbs: p.endAbs,
      roomId: p.roomId, invitedIds: [], proposerId: npcId,
    });
    addLogEntry('narration', `You tell ${name} yes. ${proposalWhen(p)}, in ${roomPhrase(p.roomId)} — it is in the diary now.`);
  }
  await advanceAndResolve(1);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('overture-accept', currentGameState);
}

// Called from doMove with the room the player is leaving. Walking away from
// someone who has just crossed a room to reach you is the refusal, and it
// needs no button.
//
// Phase 4: still scoped to the room the player is LEAVING, which is exactly
// right for the two channels that stand in front of you and exactly right for
// the knock too — a knocker is by construction in another room, so walking off
// does not refuse them. Their record lapses at the door (D28), and the player
// who wants to say no has the chip.
function refuseOverturesInRoom(roomId) {
  for (const [id, npc] of Object.entries(currentGameState.npcs || {})) {
    if (!isOverturePending(npc) || npc.location !== roomId) continue;
    const record = resolveOverture(currentGameState, id, 'refused');
    if (!record) continue;
    applyOvertureRefusal(id, record);
    addLogEntry('narration', `You leave without answering ${npc.bible?.name || 'them'}.`);
  }
}

// --- Intimacy & Voyeurism Phase 11 (D3/D13): Make a Move ------------------
// The player's mirror of the NPC intimacy overture, and the ONLY surface for
// the paired acts. The flow: pick a partner (when several are present) → pick
// an act → run it through the registered-action pipeline with
// ctx.actTargetNpcId set. The act's `willingness:<act>` requirement is the
// SAME Phase 9 gate an NPC-initiated intimacy act passes (invariant 2 —
// symmetric initiation), with the same thresholds and the same refusal prose.
// An unwilling target refuses with prose and no effects; a conscious soft no
// additionally puts the target on the actively-refusing lockout (the refusal
// writer inside executeAction), so a no means no for a while.
async function doMakeAMove(npcId) {
  if (!currentGameState) return;
  const roomId = currentGameState.player.location;
  const present = getPresentNpcIds(currentGameState.npcs, roomId);
  if (present.length === 0) {
    addLogEntry('system', 'There is nobody here to make a move on.');
    return;
  }

  // Partner selection — explicit only when the player has a choice.
  let partnerId = (npcId && present.includes(npcId)) ? npcId : null;
  if (!partnerId && present.length === 1) partnerId = present[0];
  if (!partnerId) {
    partnerId = await openIntimacyPicker({
      title: 'Who are you making a move on?',
      rows: present.map(id => {
        const npc = currentGameState.npcs[id];
        return {
          id,
          label: npc.bible?.name || 'Them',
          meta: (npc.relPlayer?.conversationPhase && npc.relPlayer.conversationPhase !== 'early')
            ? `You two are ${npc.relPlayer.conversationPhase}`
            : 'You barely know them',
        };
      }),
    });
    if (!partnerId) return;
  }

  // Act selection — only acts that are otherwise possible here (willingness
  // deliberately excluded: the gate gets to say no with a person's voice).
  const acts = intimacyActsAvailable(partnerId);
  if (acts.length === 0) {
    addLogEntry('system', "There's no way to take this further in here.");
    return;
  }
  const actId = await openIntimacyPicker({
    title: 'How do you want to make a move?',
    rows: acts.map(id => ({ id, label: ACTION_DEFS[id].label })),
  });
  if (!actId) return;

  await runRegisteredAction(actId, { targetNpcId: partnerId });
}

// --- Boundary acts (Intimacy & Voyeurism Phase 17, D13/D14) ---------------
// The sleeping-room verbs (slide into bed / watch sleep) and the three-way
// act. All domain logic is in boundary.js (resolveBoundaryGate /
// resolveBoundaryThroupleGate / applyBoundarySleepRoom / applyBoundaryThrouple
// — deterministic, harness-testable); these handlers are the thin UI shell:
// gate, narrate the open beat, advance the clock in the same chunked/minutes
// semantics the heartbeat uses, apply, narrate the outcome, render, save-at-
// boundary. The bed verbs are intercepted in handleAction before the
// registered-action bridge (the door.keyhole pattern); the threesome chip is
// intercepted in the switch (it is not a registered action).

async function doBoundarySleepRoom(actId, npcId) {
  if (!currentGameState || !npcId) return;
  const roomId = currentGameState.player.location;
  const target = currentGameState.npcs[npcId];
  if (!target || target.location !== roomId) {
    addLogEntry('system', 'They are not here anymore.');
    render(currentGameState, currentSceneState);
    return;
  }
  const day = currentGameState.meta.clock.day;
  // The narrow gate (boundary.js). The willingness function is ALWAYS
  // consulted and recorded — a sleeping target's floor (-1, reason 'asleep')
  // is EXPECTED and is exactly why this is an attempt, never a completed
  // act; a cold-shouldering target closes the gate entirely (Phase 16's
  // floor leaves no boundary door to open toward them).
  const gate = resolveBoundaryGate(currentGameState, actId, npcId, {
    location: roomId, initiatorId: 'player',
  });
  if (!gate.allowed) {
    if (gate.reason === 'cold_shoulder') {
      addLogEntry('narration', `${target.bible?.name || 'They'} will not even look at you, let alone share a bed with you.`);
    } else if (gate.reason === 'not_asleep') {
      addLogEntry('system', 'They are not asleep.');
    } else {
      addLogEntry('system', "You can't do that right now.");
    }
    render(currentGameState, currentSceneState);
    return;
  }
  const openLine = pickBoundaryProse(currentGameState,
    actId === 'sleep_with' ? 'sleepWithOpen' : 'sleepWatchOpen',
    npcId, roomId, day);
  addLogEntry('narration', openLine);
  await advanceAndResolveMinutes(BOUNDARY.durationMinutes[actId] || 10);
  const result = applyBoundarySleepRoom(currentGameState, actId, npcId, {
    location: currentGameState.player.location, initiatorId: 'player',
  });
  if (result && result.ok && result.prose) {
    if (result.outcome === 'caught') addLogEntry('system', 'They woke up.');
    addLogEntry('narration', result.prose);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary(`boundary-${actId}`, currentGameState);
}

async function doBoundaryThrouple() {
  if (!currentGameState) return;
  const roomId = currentGameState.player.location;
  const present = getPresentNpcIds(currentGameState.npcs, roomId);
  if (present.length < 2) {
    addLogEntry('system', 'You need two people here for that.');
    return;
  }
  const nameFor = (id) => currentGameState.npcs[id]?.bible?.name || 'Them';
  const partnerA = await openIntimacyPicker({
    title: 'Propose a threesome with…',
    rows: present.map(id => ({ id, label: nameFor(id) })),
  });
  if (!partnerA) return;
  const partnerB = await openIntimacyPicker({
    title: '…and?',
    rows: present.filter(id => id !== partnerA).map(id => ({ id, label: nameFor(id) })),
  });
  if (!partnerB) return;

  // The gate: all THREE parties' willingness (the same Phase 9 function the
  // player's Make-a-Move and the NPC pair drives read) + desire. One
  // unwilling party refuses the whole act with their own voice; a soft no
  // (below_threshold) writes their lockout — a no means no for a while. Hard
  // floors are states and write nothing.
  const gate = resolveBoundaryThroupleGate(currentGameState, partnerA, partnerB, {
    location: roomId,
  });
  if (!gate.allowed) {
    const refuser = gate.partner === 'a' ? partnerA : partnerB;
    const refuserNpc = currentGameState.npcs[refuser];
    const rName = refuserNpc?.bible?.name || 'They';
    if (gate.reason === 'not_into_it') {
      addLogEntry('narration', `${rName} doesn't seem into that at all.`);
    } else if (gate.reason === 'below_threshold') {
      addLogEntry('narration', `${rName} shakes their head. ${willingnessRefusalProse(refuserNpc, gate.gate)}`);
      if (refuserNpc) noteIntimacyRefusal(refuserNpc, currentGameState.meta.clock.day);
      render(currentGameState, currentSceneState);
      await saveAtBoundary('intimacy-refusal', currentGameState);
      return;
    } else {
      addLogEntry('narration', `${rName} says no. ${willingnessRefusalProse(refuserNpc, gate.gate)}`);
    }
    render(currentGameState, currentSceneState);
    return;
  }
  const day = currentGameState.meta.clock.day;
  const config = boundaryThreeWayConfig(currentGameState, partnerA, partnerB);
  const aName = nameFor(partnerA);
  const bName = nameFor(partnerB);
  const openKey = config === 'cuck' ? 'cuckOpen' : 'throupleOpen';
  addLogEntry('narration',
    pickBoundaryProse(currentGameState, openKey, partnerA, roomId, day)
      .replace('{a}', aName).replace('{b}', bName));
  await advanceAndResolveMinutes(BOUNDARY.durationMinutes.throuple || 40);
  const result = applyBoundaryThrouple(currentGameState, partnerA, partnerB, {
    location: currentGameState.player.location,
  });
  if (result && result.ok) {
    const doneKey = config === 'cuck' ? 'cuckDone' : 'throupleDone';
    addLogEntry('narration',
      pickBoundaryProse(currentGameState, doneKey, partnerA, roomId, day)
        .replace('{a}', aName).replace('{b}', bName));
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('boundary-throuple', currentGameState);
}

// The paired acts available with `partnerId` in the player's current room —
// every `paired` ACTION_DEFS row whose non-willingness requirements pass.
// Used by the Make-a-Move act picker; the willingness rule is skipped so the
// target's refusal stays a spoken no rather than a vanished option.
// Intimacy & Voyeurism Phase 18 (D16): the player's "trying" toggle.
// A couple-level choice, not an act: it flips player.flags._tryingWith
// (mirroring relationship.trying on the NPC side) so completed sex acts
// with that partner roll the deliberate conception chance instead of the
// unprotected base chance. The willingness gate is untouched — trying
// changes odds, never consent (invariant 1 is upstream of pregnancy).
async function doPregnancySetTrying(npcId, trying) {
  if (!currentGameState || !npcId) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  const player = currentGameState.player;
  player.flags = player.flags || {};
  if (trying) {
    if (player.flags._tryingWith === npcId) return;
    player.flags._tryingWith = npcId;
    addLogEntry('narration', `You and ${npc.bible?.name || 'them'} have decided to try for a baby.`);
  } else {
    if (player.flags._tryingWith !== npcId) return;
    delete player.flags._tryingWith;
    addLogEntry('narration', `You've stopped trying for a baby with ${npc.bible?.name || 'them'} — for now.`);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('pregnancy-trying', currentGameState);
}

function intimacyActsAvailable(partnerId) {
  const ctx = buildActionContext(currentGameState, 'player');
  ctx.actTargetNpcId = partnerId;
  const out = [];
  for (const def of Object.values(ACTION_DEFS)) {
    if (!def.paired) continue;
    if (checkRequirements(def, ctx, { skipWillingness: true }).ok) out.push(def.id);
  }
  return out;
}

// --- Codex verbs (Intimacy & Voyeurism Phase 15, D8) -----------------------
// The three spendable-knowledge handlers. All domain logic is in codex.js
// (applyConfrontNpc / applySpreadSecret / applyMatchmakeNpc — deterministic,
// harness-testable); these handlers are the thin UI shell: navigate, call,
// narrate from the authored pools, render, save-at-boundary. Each verb
// spends exactly one ledger entry (`spent` flips, the entry stays in
// history).

function doCodexOpenNpc(npcId, device) {
  if (!currentGameState || !npcId) return;
  switchScreen(currentGameState, 'codex', 'detail', { npcId }, device === 'phone' ? 'phone' : 'computer');
  if (device === 'phone') renderPhoneScreen(currentGameState);
  else renderComputerScreen(currentGameState);
}

async function doConfrontNpc(npcId, index) {
  if (!currentGameState || !npcId || typeof index !== 'number') return;
  const npc = currentGameState.npcs[npcId];
  const arr = currentGameState.player?.ledger?.[npcId];
  const entry = Array.isArray(arr) ? arr[index] : null;
  if (!npc || !entry || entry.spent) {
    addLogEntry('system', 'There is nothing to confront them about.');
    render(currentGameState, currentSceneState);
    return;
  }
  const result = applyConfrontNpc(currentGameState, npcId, index, {
    location: currentGameState.player?.location || null,
  });
  if (!result.ok) return;
  const name = npc.bible?.name || 'They';
  const otherName = result.otherName || 'someone';
  const rng = seededRng(currentGameState.meta.seed, `confront_${npcId}_${entry.day}_${result.outcome}`);
  const playerPool = entry.otherNpcId ? CONFRONT.playerLines.withOther : CONFRONT.playerLines.alone;
  const playerLine = playerPool[Math.floor(rng() * playerPool.length)].replace('{other}', otherName);
  addLogEntry('narration', `You corner ${name}. "${playerLine}"`);
  const replyPool = CONFRONT.lines[result.outcome] || [];
  if (replyPool.length > 0) {
    const reply = replyPool[Math.floor(rng() * replyPool.length)].replace('{name}', name).replace('{other}', otherName);
    addLogEntry('narration', reply);
  }
  if (result.gossipIds.length > 0) {
    addLogEntry('narration', 'The confrontation does not stay private. Someone in the room heard.');
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('confront', currentGameState);
}

async function doSpreadSecret(npcId, index) {
  if (!currentGameState || !npcId || typeof index !== 'number') return;
  const arr = currentGameState.player?.ledger?.[npcId];
  const entry = Array.isArray(arr) ? arr[index] : null;
  if (!entry || entry.spent || !entry.otherNpcId) {
    addLogEntry('system', 'There is no third-party secret to tell.');
    return;
  }
  const npc = currentGameState.npcs[npcId];
  const otherNpc = currentGameState.npcs[entry.otherNpcId];
  const name = npc?.bible?.name || 'They';
  const otherName = otherNpc?.bible?.name || 'someone';

  // Who can you tell? Anyone you can talk to — residents, active visitors,
  // contacts — minus the two people the secret is about.
  const candidateIds = Object.keys(currentGameState.npcs).filter(id => {
    const n = currentGameState.npcs[id];
    if (!n) return false;
    if (id === npcId || id === entry.otherNpcId) return false;
    const status = n.residency?.status;
    return status === 'resident' || status === 'visitor' || n.contactKnown === true;
  });
  if (candidateIds.length === 0) {
    addLogEntry('system', 'There is nobody here you could tell.');
    return;
  }
  const receiverId = await openIntimacyPicker({
    title: 'Who do you tell?',
    rows: candidateIds.map(id => {
      const n = currentGameState.npcs[id];
      return { id, label: n.bible?.name || 'Them', meta: 'They\'ll hear it from you first.' };
    }),
  });
  if (!receiverId) return;

  const result = applySpreadSecret(currentGameState, npcId, index, receiverId);
  if (!result.ok) {
    addLogEntry('system', 'That did not go anywhere.');
    return;
  }
  addLogEntry('narration', `You lean in and tell ${result.receiverName} about ${name} and ${otherName}. They listen closely.`);
  addLogEntry('narration', `"${result.fact.text}," you say. The words are out there now.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('spread-secret', currentGameState);
}

async function doMatchmakeNpc(npcId, index) {
  if (!currentGameState || !npcId) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  const candidates = matchmakeCandidates(currentGameState, npcId);
  if (candidates.length === 0) {
    addLogEntry('system', 'You do not know two people well enough to push them together yet — and they need a spark already forming.');
    return;
  }
  const targetId = await openIntimacyPicker({
    title: `Who should ${npc.bible?.name || 'they'} meet?`,
    rows: candidates.map(c => ({
      id: c.npcId,
      label: c.name,
      meta: `Compatibility ${Math.round(c.compat * 100)}% — you know both of them`,
    })),
  });
  if (!targetId) return;

  const result = applyMatchmakeNpc(currentGameState, npcId, targetId);
  if (!result.ok) {
    addLogEntry('system', result.reason === 'incompatible'
      ? 'They would never work — you know them well enough to see it.'
      : 'That match is not ready to be pushed.');
    return;
  }
  const target = currentGameState.npcs[targetId];
  addLogEntry('narration', `You make a point of getting ${npc.bible?.name || 'them'} and ${target?.bible?.name || 'them'} in the same room. "You two should talk," you say, and leave them to it.`);
  for (const evt of result.events) {
    if (evt.kind === 'seeing') addLogEntry('narration', `Something clicks — ${npc.bible?.name || 'They'} and ${target?.bible?.name || 'they'} are seeing each other now.`);
    if (evt.kind === 'committed') addLogEntry('narration', `It went further than you expected — ${npc.bible?.name || 'They'} and ${target?.bible?.name || 'they'} are together.`);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('matchmake', currentGameState);
}

// Track how long an NPC has been at high tension — if it persists, they
// move out. Checked at day rollover. Intimacy & Voyeurism Phase 16 (D2/D14)
// extends the same rollover with the cold-shoulder pass: time heals slowly
// (no player action needed, but slow) and a max-severity cold-shoulder puts
// the resident at real move-out risk — the extended move-out trigger for
// boundary acts at low dynamic and public infidelity fallout.
async function processRelConsequencesForDay(day) {
  for (const [id, npc] of Object.entries(currentGameState.npcs)) {
    if (npc.residency.status !== 'resident') continue;
    const tension = npc.relPlayer.tension || 0;
    if (tension >= REL_CONSEQUENCES.tensionHigh) {
      npc.flags = npc.flags || {};
      npc.flags._highTensionDays = (npc.flags._highTensionDays || 0) + 1;
      if (npc.flags._highTensionDays >= REL_CONSEQUENCES.tensionMoveOutDay) {
        addLogEntry('system', `${npc.bible.name} has had enough. They're moving out.`);
        await doAskToLeave(id);
      }
    } else {
      if (npc.flags?._highTensionDays) npc.flags._highTensionDays = 0;
    }
    // The cold-shoulder pass. advanceColdShoulderForDay mutates npc (time
    // heal + the per-day move-out roll) and returns the verdict; the actual
    // move-out is doAskToLeave (kv + narration), same as the tension path.
    // Seeded per (seed, npc, day) so a replayed day rolls identically.
    const csRng = seededRng(currentGameState.meta.seed, `cold_out_${id}_${day}`);
    const csOut = advanceColdShoulderForDay(npc, day, csRng);
    if (csOut.movedOut) {
      addLogEntry('system', `${npc.bible.name} has gone quiet and distant — it's too much. They're moving out.`);
      await doAskToLeave(id);
    }
  }
}

// COMPUTER's classifieds app: generates a fresh batch of applicant stubs
// for the RoomList browse grid every day (Phase 1). Stubs are cheap
// deterministic records — no LLM, no full NPC — so this runs safely
// unattended every day. Full NPC creation happens on-demand when the
// player loads a profile (Phase 3 fetch queue).
function processClassifiedsForDay(day) {
  if (!currentGameState.world.computer) return;
  const stubs = generateApplicantStubsForDay(currentGameState, day);
  if (stubs.length > 0) {
    addLogEntry('system', `RoomList updated — ${stubs.length} new applicants browsing today.`);
  }
}

// COMPUTER's gig board: generates fresh gigs (probabilistically) and
// resolves deadlines on day rollover. Replaces the old single-job
// strike/firing path — a freelancer has no boss, only deadlines.
function processGigsForDay(day) {
  if (!currentGameState.world.computer) return;
  generateGigsForDay(currentGameState, day);
  for (const r of processGigDeadlinesForDay(currentGameState, day)) {
    if (r.missed) {
      addLogEntry('system', `Missed deadline on "${r.label}" — ${r.partialPay > 0 ? `partial pay ${r.partialPay}, ` : ''}reputation ${r.repDelta}.`);
    } else if (r.autoDelivered) {
      addLogEntry('system', `"${r.label}" was delivered late (auto) — paid ${r.payout}, reputation ${r.repDelta}.`);
    }
  }
}

// COMPUTER's services app: a hired housekeeper visits on its own cadence,
// no click required. accessScope:'all' means bedrooms too — a real
// boundary crossing the player caused indirectly, not by being there
// themselves. STEALTH (P6) is what will eventually turn that into a
// consequence; for now it's narrated but mechanically inert beyond the
// cleaning itself.
function processServiceVisitsForDayUi(day) {
  if (!currentGameState.world.computer) return;
  for (const result of processServiceVisitsForDay(currentGameState, day)) {
    if (result.skipped) {
      addLogEntry('system', `${result.label} couldn't be paid — visit postponed.`);
    } else {
      const scopeNote = result.accessScope === 'all' ? ' (including bedrooms)' : '';
      addLogEntry('narration', `${result.label} came by${scopeNote} and tidied up. (-$${result.cost})`);
    }
  }
}

// Rent is a live system per the brief: a due charge posts every
// ECONOMY.payPeriodDays, and every day it stays unpaid costs the player
// mood and costs residents patience — "a primary driver of both economics
// and drama," not flavor text.
async function processRentForDay(day) {
  const player = currentGameState.player;
  if (player.rentDueDay == null) player.rentDueDay = 1 + ECONOMY.payPeriodDays;

  if (day >= player.rentDueDay) {
    // Recompute against live residency rather than trusting the stored
    // figure: a roommate who moved in or out since the last bill changes
    // what the player owes, and that change should land on this bill, not
    // the one after it.
    const rent = computeRent(currentGameState.npcs, currentGameState);
    currentGameState.world.rent = rent;
    player.rentDueDay += ECONOMY.payPeriodDays;

    if (rent.playerShare < 0) {
      // A full house in a fully restored apartment covers more than the
      // lease costs, and the surplus is the player's. This is the intended
      // end state — the apartment paying for itself is what maxing the
      // social sim buys you — so the overflow is paid out rather than
      // clamped away. Any outstanding balance is settled first.
      const surplus = -rent.playerShare;
      const owed = player.rentOwed || 0;
      const applied = Math.min(owed, surplus);
      player.rentOwed = owed - applied;
      const toPocket = surplus - applied;
      if (toPocket > 0) {
        const effCtx = buildEffectContext(currentGameState, [], [], {}, []);
        applyEffects(parseEffectDSL(`EARN_MONEY ${toPocket} rent_surplus`), effCtx);
      }
      addLogEntry('system',
        `Rent settled: roommates cover $${rent.coveredByRoommates} of $${rent.total}. ` +
        (applied > 0 ? `$${applied} went to your balance; ` : '') +
        `the apartment cleared $${toPocket} this week.`);
    } else {
      player.rentOwed = (player.rentOwed || 0) + rent.playerShare;
      const helped = rent.coveredByRoommates > 0
        ? ` (roommates cover $${rent.coveredByRoommates} of $${rent.total})`
        : ' — you are carrying the whole lease';
      addLogEntry('system', `Rent is due: $${rent.playerShare}${helped}. (Total owed: $${player.rentOwed})`);
    }
  }

  if ((player.rentOwed || 0) > 0) {
    // Phase 5: the direct per-day mood subtraction (ECONOMY.rentLatePenaltyMood)
    // is gone — overdue rent is now a steady drag on the mood TARGET
    // (MOOD_TARGET.stress.rentPenalty), so the bar eases down to it rather
    // than being pushed toward -1 forever. The relationship consequences
    // below are untouched.
    for (const [id, npc] of Object.entries(currentGameState.npcs)) {
      if (npc.residency.status !== 'resident') continue;
      currentGameState.npcs[id] = applyRelDelta(npc, { tension: ECONOMY.rentLateTensionPerDay }, currentGameState.meta.clock.day);
    }

    // Escalating rent pressure: overdue rent past 7 days triggers an
    // eviction warning. Past 14 days, NPC tension escalates sharply.
    const daysOverdue = day - (player.rentDueDay - ECONOMY.payPeriodDays);
    if (daysOverdue >= 14) {
      addLogEntry('system', `WARNING: Rent is ${daysOverdue} days overdue. Your roommates are furious.`);
      for (const [id, npc] of Object.entries(currentGameState.npcs)) {
        if (npc.residency.status !== 'resident') continue;
        currentGameState.npcs[id] = applyRelDelta(npc, { tension: 0.05, affection: -0.02 }, currentGameState.meta.clock.day);
      }
    } else if (daysOverdue >= 7) {
      addLogEntry('system', `Rent is ${daysOverdue} days overdue. Your roommates are getting worried.`);
    }
  }
}

// Phase 3 bills: post charges on their own cadences, fire cutoffs past
// grace. Rent is handled by processRentForDay above (its split is special);
// the other bills post here. A cutoff activation is a real log event —
// "Power is off" is something the player needs to see, not a silent flag.
function processBillsForDayUi(day) {
  if (!currentGameState.world.bills) return;
  // Phase 5: accrue one day of HVAC usage. This runs every day (not just
  // on billing days) because HVAC is the baseline load — the heater runs
  // all day, not just when a bill posts.
  if (currentGameState.world.utilities) {
    accrueHvacForDay(currentGameState, day);
  }
  // Sync the rent bill entry to the player's rent state so the dashboard
  // shows one consistent figure. processRentForDay owns the actual rent
  // logic; this just mirrors it into the bills system for display + cutoff.
  const rentBill = currentGameState.world.bills.rent;
  if (rentBill) {
    rentBill.balance = currentGameState.player.rentOwed || 0;
    if (rentBill.balance > 0) {
      const daysOverdue = day - (currentGameState.player.rentDueDay - ECONOMY.payPeriodDays);
      if (daysOverdue > BILL_DEFS.rent.graceDays) {
        rentBill.status = 'overdue';
        rentBill.overdueDays = daysOverdue - BILL_DEFS.rent.graceDays;
        rentBill.cutoffActive = true;
      } else {
        rentBill.status = 'due';
        rentBill.overdueDays = 0;
      }
    } else {
      rentBill.status = 'paid';
      rentBill.overdueDays = 0;
      rentBill.cutoffActive = false;
    }
  }
  for (const r of processBillsForDay(currentGameState, day)) {
    if (r.posted != null) {
      addLogEntry('system', `${r.label} bill: ${r.posted} posted. (Balance: ${r.balance})`);
    }
    if (r.activated) {
      const eff = BILL_CUTOFF_EFFECTS[r.cutoff];
      addLogEntry('system', `${r.label} is unpaid past the grace period. ${eff?.label || 'Service cut off.'}`);
    }
  }
}

// BrineOS Phase 7 (plan 7.2): called from processDayRollover AFTER
// processBillsForDayUi, deliberately — autopay needs this day's charge
// already posted and this day's cutoff check already run (processAutopayForDay's
// own header explains why). A bounce is a real log event, same standard as
// a cutoff activation above: the player needs to see it, not discover it
// later as an inflated balance with no explanation.
function processAutopayForDayUi(day) {
  if (!currentGameState.world.bills) return;
  for (const r of processAutopayForDay(currentGameState, day)) {
    if (r.ok) {
      const reconnectNote = r.reconnected ? ' (service restored)' : '';
      addLogEntry('system', `Autopay: ${r.label} paid automatically — ${r.paid}${reconnectNote}.`);
    } else {
      addLogEntry('system', `Autopay failed on ${r.label} — insufficient funds. A $${r.bounceFee} bounce fee was added (balance now $${r.balance}).`);
    }
  }
}

// Phase 6: taxes bill at tax-period end — days 70 and 140 and every 70
// days thereafter (end of Summer and end of Winter, per D3). Unlike
// utility bills (which post on a cadence and have cutoffs), taxes are a
// single lump obligation every 70 days. The player owes rate ×
// (quarterGross − deductions). The auto-reserve pays down what it can; any
// shortfall carries forward with penalty + interest. No cutoff — taxes
// just accumulate debt, which compounds if ignored.
function processTaxesForDayUi(day) {
  if (!currentGameState.world.taxes) return;
  if (!isTaxPeriodEnd(day)) return;
  const result = processQuarterlyTaxes(currentGameState, day);
  if (!result) return;
  const q = result.taxPeriod + 1;
  if (result.owed > 0 || result.carriedForward > 0) {
    let msg = `Tax period ${q} taxes: ${result.owed} owed on ${result.gross} gross`;
    if (result.deductions > 0) msg += ` (−${result.deductions} deductions)`;
    msg += '.';
    if (result.fromReserve > 0) msg += ` Reserve covered ${result.fromReserve}.`;
    if (result.shortfall > 0) msg += ` Shortfall: ${result.shortfall}.`;
    if (result.penalty > 0) msg += ` Underpayment penalty: ${result.penalty}.`;
    if (result.interestCharge > 0) msg += ` Interest on prior unpaid: ${result.interestCharge}.`;
    if (result.carriedForward > 0) msg += ` You now owe ${result.carriedForward} in back taxes.`;
    else msg += ` Tax bill settled.`;
    addLogEntry('system', msg);
  } else if (result.carriedForward === 0 && (result.fromReserve > 0)) {
    addLogEntry('system', `Tax period ${q} taxes settled. No tax owed this period (reserve: ${currentGameState.world.taxes.reserve}).`);
  }
}

// Deliveries land on the entry doormat (WORLD/ITEMS), not straight into
// the player's pockets — "you have to go get your package, and a
// roommate could get to it first" is the whole point of routing this
// through SPAWN_ITEM instead of pushing directly into player.inventory.
function processDeliveriesForDay(day) {
  const deliveries = currentGameState.world.deliveries || [];
  const doormat = Object.values(currentGameState.objects?.room_entry || {}).find(o => o.defId === 'doormat');
  for (const d of deliveries) {
    if (d.status !== 'ordered' || day < d.etaDay) continue;
    d.status = 'delivered';
    const label = ITEM_DEFS[d.defId]?.label || d.defId || 'a package';
    if (doormat && d.defId) {
      doormat.contents = addStack(doormat.contents, d.defId, d.qty || 1, null, {}, gameDaysNow(currentGameState.meta.clock));
      addLogEntry('narration', `A delivery has arrived: ${label}. It's waiting by the front door.`);
    } else {
      addLogEntry('narration', `A delivery has arrived: ${label}.`);
    }
  }
}

// Renovation overhaul: complete any active contracted job whose ETA day has
// arrived — flips the facility to its target tier, resets condition, clears
// the activeJobId pointer, and recomputes rent (the ceiling may have
// changed). Mirrors processDeliveriesForDay's shape: an array of world
// records with an etaDay, resolved at day rollover. See
// src/ref/complete/renovation-occupancy-overhaul-plan.md.
function processRenovationJobsForDay(day) {
  const jobs = currentGameState.world.renovationJobs || [];
  for (const job of jobs) {
    if (job.status !== 'active') continue;
    const completing = day >= job.etaDay;
    // Phase 3: a stage advance at day rollover gets a deterministic
    // progress line (keyed by job type + the stage that just completed).
    // Skipped on the completion day — the wrapped-up line below supersedes.
    if (!completing && day > job.startDay) {
      const prevStage = getRenovationJobStage(job, day - 1);
      const newStage = getRenovationJobStage(job, day);
      if (newStage.index > prevStage.index) {
        const def = FACILITY_DEFS[job.facilityId];
        const label = def ? def.label : job.facilityId;
        const pool = RENOVATION_PROGRESS_TEMPLATES[job.jobType] || RENOVATION_PROGRESS_TEMPLATES.repair;
        const line = pool[prevStage.index];
        if (line) addLogEntry('narration', line.replace('{label}', label));
        // Contractor memory (contractor doc Phase 4): keep the running
        // commentary current as the job progresses — stage + "day N of M".
        setContractorJobFact(currentGameState, 'renovation_job',
          `I'm on ${label} — a ${job.jobType}, day ${day - job.startDay + 1} of ${job.durationDays}, currently ${newStage.label}. Due day ${job.etaDay}.`,
          job.startDay);
      }
    }
    if (!completing) continue;
    job.status = 'complete';
    // Structural jobs (floorplan plan Phase 6) finish differently: there is
    // no tier to advance, only a flag that rebuilds the room graph. Done
    // before the facility branch because a structural job has no facilityId
    // at all and would otherwise fall out of the `!upgrade` guard silently.
    if (job.structuralId) {
      const sdef = STRUCTURAL_UPGRADES[job.structuralId];
      currentGameState.world.flags = currentGameState.world.flags || {};
      currentGameState.world.flags[`structural_${job.structuralId}`] = true;
      applyStructuralUpgrades(currentGameState);
      // A structural change can alter what rooms EXIST as bedrooms
      // (study_to_bedroom), which is a rent input — so rent is recomputed
      // for the same reason a facility completion recomputes it.
      currentGameState.world.rent = computeRent(currentGameState.npcs, currentGameState);
      addLogEntry('narration', `The crew wrapped up on ${sdef ? sdef.label : job.structuralId}. The place is laid out differently now.`);
      setContractorJobFact(currentGameState, 'renovation_done',
        `I finished the ${sdef ? sdef.label : 'structural work'} — changed the shape of the place.`,
        currentGameState.meta.clock.day);
      continue;
    }
    const upgrade = currentGameState.world.upgrades[job.facilityId];
    if (!upgrade) continue;
    upgrade.tier = job.toTier;
    upgrade.condition = MAINTENANCE.startingCondition;
    upgrade.activeJobId = null;
    currentGameState.world.rent = computeRent(currentGameState.npcs, currentGameState);
    applyFacilityCompletionStates(currentGameState, job.facilityId);
    const def = FACILITY_DEFS[job.facilityId];
    addLogEntry('narration', `The crew wrapped up on ${def ? def.label : job.facilityId} — ${job.toTier === 'upgraded' ? 'upgraded' : 'repaired'} and ready.`);
    // Contractor tutorial (contractor doc Phase 3): completing the free tutorial job fires the "first one's on me" nudge. Paid jobs have no milestone — the wrapped-up narration line above covers them.
    if (job.cost === 0) fireContractorMilestone(currentGameState, 'tutorialJobComplete');
    // Contractor memory (contractor doc Phase 4): retire the live "working
    // on" fact and record the completion so recent work stays recallable.
    setContractorJobFact(currentGameState, 'renovation_done',
      `I finished the ${def ? def.label : job.facilityId} ${job.jobType} on day ${day} — ${job.toTier === 'upgraded' ? 'upgraded and ready' : 'repaired and ready'}.`,
      day);
  }
}

// Contractor tutorial (contractor doc Phase 3): one-shot apartment-quality
// milestone. Checked at day rollover (where every quality-affecting change
// has just landed); fireContractorMilestone makes it exactly-once.
function maybeFireContractorQualityMilestone() {
  if (!currentGameState?.world) return;
  if (currentGameState.world.flags?.tutorial_qualityThreshold) return;
  if (getApartmentQuality(currentGameState) >= CONTRACTOR_QUALITY_MILESTONE_THRESHOLD) {
    fireContractorMilestone(currentGameState, 'qualityThreshold');
  }
}

// Visit spine (external-world plan Phase 1): maintain world.visits at day
// rollover. Retires every visit whose day has passed (status scheduled →
// done, clearing the visitor's lingering location so they can't stay
// "present" off-window), then re-ensures contractor visits for any job
// still active — scheduleContractorVisitsForJob already covered the full
// run at booking, so this is purely the backstop for saves that have an
// in-flight job but predate visits. Mirrors processRenovationJobsForDay's
// shape (an array of world records resolved at day rollover). Day-scoping
// uses SIM's visitDay — records carry absolute-minute windows now.
function processVisitsForDay(day) {
  if (!currentGameState?.world) return;
  const visits = currentGameState.world.visits || (currentGameState.world.visits = []);
  // Retire past visits; a visit whose window has passed must not leave its
  // visitor lingering in the room they were in.
  for (const v of visits) {
    if (visitDay(v) >= day) continue;
    if (v.status === 'done' || v.status === 'deferred') continue;
    v.status = 'done';
    const visitor = currentGameState.npcs[v.npcId];
    if (visitor && visitor.location === v.roomId) {
      visitor.location = null;
      visitor.activity = '';
      visitor.transit = null;
    }
  }
  // Retention: world.visits is append-only otherwise, and it is written into
  // the save in full on every boundary. Retired records older than the
  // retention window can't affect anything (getActiveVisits only matches an
  // active window) and exist only to grow the save — every delivery, maid
  // day, contractor day and invite leaves one forever. Drop them once
  // they're safely in the past.
  const cutoff = day - VISIT_TUNING.retainDoneDays;
  for (let i = visits.length - 1; i >= 0; i--) {
    const v = visits[i];
    if (visitDay(v) < cutoff && (v.status === 'done' || v.status === 'deferred')) visits.splice(i, 1);
  }
  // Re-ensure today's contractor windows for still-active jobs.
  for (const job of currentGameState.world.renovationJobs || []) {
    if (job.status !== 'active') continue;
    if (!job.rush && isWeekend(day)) continue;
    if (day < job.startDay || day >= job.etaDay) continue;
    const win = VISIT_TUNING.contractor;
    scheduleVisit(currentGameState, job.id, day, {
      npcId: job.contractorId || CONTRACTOR_ID,
      purpose: 'contractor',
      startAbs: day * 1440 + win.startMinute,
      endAbs: day * 1440 + win.endMinute,
      roomId: job.roomId,
    });
  }
}

// The maid (external-world plan Phase 3): read the schedule grid out of the
// DOM at save time and commit it. Reading inputs on submit is the existing
// pattern for transient form state (see the IM composer's textarea) — the
// committed contract lives in world state, so nothing app-level is stored
// only in the DOM.
async function doMaidSave() {
  if (!currentGameState) return;
  const grid = document.getElementById('maid-grid');
  const addonsBox = document.getElementById('maid-addons');
  if (!grid) return;
  const schedule = [];
  for (const cb of grid.querySelectorAll('.maid-day-on')) {
    if (!cb.checked) continue;
    const wd = Number(cb.getAttribute('data-weekday'));
    const start = grid.querySelector(`.maid-start[data-weekday="${wd}"]`);
    const end = grid.querySelector(`.maid-end[data-weekday="${wd}"]`);
    schedule.push({ weekday: wd, startTick: Number(start?.value), endTick: Number(end?.value) });
  }
  const addons = [...(addonsBox?.querySelectorAll('.maid-addon') || [])]
    .filter(cb => cb.checked)
    .map(cb => cb.getAttribute('data-addon'));

  const res = setMaidContract(currentGameState, schedule, addons);
  if (!res.ok) { addLogEntry('system', res.reason); return; }
  if (res.cancelled) {
    addLogEntry('system', 'Housekeeping contract cancelled.');
  } else {
    const npc = currentGameState.npcs[res.contract.npcId];
    const name = npc?.bible?.name || 'A housekeeper';
    addLogEntry('system', res.created
      ? `${name} takes the job — $${res.weeklyCost}/week.`
      : `Contract updated — $${res.weeklyCost}/week.`);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('maid-contract', currentGameState);
}

// The maid (external-world plan Phase 3): one processor that both schedules
// her presence for today and does the work. Charging + performing at day
// rollover matches the existing service system (processServiceVisitsForDay
// has always cleaned at rollover); the visit record is what makes her
// visibly onsite during her window on top of that.
function processMaidForDay(day) {
  if (!currentGameState?.world?.computer) return;
  const contract = getMaidContract(currentGameState);
  if (!contract) return;
  const weekday = getWeekday(day);
  const entry = (contract.schedule || []).find(e => e.weekday === weekday);
  if (!entry) return;

  const cost = getMaidVisitCost(entry, contract.addons);
  const npc = currentGameState.npcs[contract.npcId];
  const name = npc?.bible?.name || 'The housekeeper';
  if (currentGameState.player.money < cost) {
    addLogEntry('system', `${name} didn't come — you couldn't cover the $${cost} visit.`);
    return;
  }
  currentGameState.player.money -= cost;

  // Presence: she rotates her cleaning scope during the window (see
  // resolveVisitPresence's maid branch), so roomId is just where she starts.
  scheduleVisit(currentGameState, `maid_${day}`, day, {
    npcId: contract.npcId,
    purpose: 'maid',
    // The contract's weekly grid is still expressed in ticks (its UI and
    // cost math are not this plan's to convert); the visit window is the
    // absolute-minute form of the entry's window.
    startAbs: day * 1440 + entry.startTick * 30,
    endAbs: day * 1440 + entry.endTick * 30,
    roomId: 'living_room',
  });

  const r = performMaidVisit(currentGameState, contract, entry);
  const bits = [`${name} came by for ${r.hours}h — $${cost}`];
  if (r.itemsCleaned) bits.push(`${r.itemsCleaned} things tidied`);
  if (r.laundrySteps) bits.push(`laundry ${r.laundrySteps === 1 ? 'a load' : `${r.laundrySteps} loads`} down`);
  if (r.mealsCooked) bits.push(`${r.mealsCooked} meals in the fridge`);
  addLogEntry('narration', bits.join(', ') + '.');
}

// Friends of roommates (external-world plan Phase 6): the day-rollover half
// of the household's own social life. SIM's planFriendVisitsForDay does the
// deciding (who hosts, who they invite, whether the soft cap defers it) and
// returns records; this narrates them, the same split resolveTick/events uses
// everywhere else. The player finds out the way you find out in a shared
// apartment — someone mentions it.
function processFriendVisitsForDay(day) {
  if (!currentGameState) return;
  const planned = planFriendVisitsForDay(currentGameState, day);
  for (const p of planned) {
    if (p.deferred) {
      const host = currentGameState.npcs[p.hostId]?.bible?.name || 'Someone';
      addLogEntry('narration', `${host} thought about having someone over, then looked at how many people are already in and out today and left it.`);
      continue;
    }
    addLogEntry('narration', `${p.hostName} mentions that their friend ${p.guestName} is coming by around ${formatTime(p.startMinute)}.`);
  }
}

// Outside partners (Intimacy & Voyeurism Phase 14, D14): the day-rollover
// half of the long-distance relationship. SIM's planOutsidePartnerVisitsForDay
// does the deciding (ensure partners exist, roll each resident's visit chance,
// respect the cooldown and the soft cap) and returns records; this narrates
// them with the same plan-then-narrate split as friends. The partner is an
// ordinary visit after this — presence, pair acts, peek and gossip all flow
// through the visit spine.
function processOutsidePartnerVisitsForDay(day) {
  if (!currentGameState) return;
  ensureOutsidePartners(currentGameState);
  const planned = planOutsidePartnerVisitsForDay(currentGameState, day);
  for (const p of planned) {
    if (p.deferred) {
      addLogEntry('narration', `${p.residentName || 'Someone'} wanted their partner over tonight, but the place is already full of people and they left it.`);
      continue;
    }
    addLogEntry('narration', `${p.residentName || 'Someone'} mentions that ${p.partnerName} is coming by around ${formatTime(p.startMinute)}.`);
  }
}

// Escorts (external-world plan Phase 7): the day-rollover half of booking
// lifecycle. Retire yesterday's bookings (status → 'done', mirroring how
// processVisitsForDay retires the visits themselves) and narrate tonight's
// advance bookings so the player knows who's coming and when. The visit was
// already scheduled by bookEscort — this is bookkeeping and narration only.
function processEscortBookingsForDay(day) {
  if (!currentGameState?.world) return;
  ensureEscortRoster(currentGameState);
  const bookings = currentGameState.world.escortBookings || (currentGameState.world.escortBookings = []);
  for (const b of bookings) {
    if (b.status !== 'active') continue;
    if (b.day < day) { b.status = 'done'; continue; }
    if (b.day === day && b.bookedDay < day) {
      const npc = currentGameState.npcs[b.escortNpcId];
      const name = npc?.bible?.name || 'An escort';
      const labels = (b.services || []).map(sid => ESCORT_SERVICE_DEFS[sid]?.label || sid).join(', ');
      addLogEntry('narration', `${name} confirmed for ${formatTime(b.startTick * 30)} tonight — ${labels}.`);
    }
  }
}

// --- Escorts (external-world plan Phase 7): app + chip handlers ---

function doEscortViewProfile(npcId, device) {
  if (!npcId || !currentGameState) return;
  const escApp = currentGameState.world.computer?.apps?.escorts;
  if (!escApp) return;
  escApp.viewingNpcId = npcId;
  switchScreen(currentGameState, 'escorts', 'profile', undefined, device === 'phone' ? 'phone' : 'computer');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// Read the profile screen's transient form state (the service checklist +
// start-time select) and commit it as a booking. Same DOM-on-submit pattern
// as doMaidSave; the committed booking lives in world.escortBookings. The
// select value is "<day>:<tick>" (today or tomorrow), built by the renderer.
async function doEscortBook(npcId, device) {
  if (!currentGameState || !npcId) return;
  const scope = device === 'phone' ? document.getElementById('phone-screen') : document;
  const checklist = scope.querySelector('.esc-check-list');
  const timeSel = scope.querySelector('.esc-time-select');
  const services = [...(checklist?.querySelectorAll('input:checked') || [])]
    .map(cb => cb.getAttribute('data-service'));
  const val = timeSel?.value || '';
  const [day, tick] = val.split(':');
  const res = bookEscort(currentGameState, { npcId, services, day: Number(day), startTick: Number(tick) });
  if (!res.ok) { addLogEntry('system', res.reason); render(currentGameState, currentSceneState); return; }
  const npc = res.npc;
  const name = npc?.bible?.name || 'An escort';
  const labels = (res.booking.services || []).map(sid => ESCORT_SERVICE_DEFS[sid]?.label || sid).join(', ');
  const tonight = res.booking.day === currentGameState.meta.clock.day;
  addLogEntry('narration', `Booked ${name} for ${formatTime(res.booking.startTick * 30)}${tonight ? ' tonight' : ' tomorrow'} — ${labels}. ${res.booking.price} paid up front.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('escort-book', currentGameState);
}

// The chip behind a booked service. The chip is only rendered from the live
// booking, but that render is not the gate — the LIVE booking is re-checked
// here via the same requirement checkers a registered action's `requires`
// would run (the mechanical half of the dual enforcement), then routed into
// the normal free-text LLM path so the exchange gets full relationship and
// memory treatment. An unbooked request is declined in-character.
async function doEscortRequestService(npcId, serviceId) {
  if (!currentGameState || !npcId || !serviceId) return;
  const npc = currentGameState.npcs[npcId];
  const name = npc?.bible?.name || 'They';
  const def = ESCORT_SERVICE_DEFS[serviceId];
  const ctx = buildActionContext(currentGameState);
  const active = ACTION_REQUIREMENT_CHECKERS.escortVisitActive(ctx, npcId);
  if (active !== true) { addLogEntry('system', String(active)); render(currentGameState, currentSceneState); return; }
  const booked = ACTION_REQUIREMENT_CHECKERS.escortServiceBooked(ctx, npcId, serviceId);
  if (booked !== true) {
    addLogEntry('narration', `${name} holds up a hand. "That isn't part of what we agreed on."`);
    render(currentGameState, currentSceneState);
    return;
  }
  await doPlayerAction(`Ask ${name} for ${(def?.label || 'a service').toLowerCase()}`);
}

// --- Food delivery: DoorDrop (external-world plan Phase 5) ---
// The handover, and the handlers behind the app's buttons. Unlike a Nile
// package (which materialises on the doormat at day rollover), food arrives
// with a person at a specific TICK, so this is driven from advanceAndResolve
// rather than processDayRollover — every path that moves the clock goes
// through there, including the continuous loop's sim checkpoints.
function processFoodOrdersNow() {
  if (!currentGameState?.world) return;
  const orders = currentGameState.world.foodOrders || [];
  if (orders.length === 0) return;
  const { day } = currentGameState.meta.clock;
  for (const order of orders) {
    if (order.status !== 'ordered') continue;
    // The handover fires the moment the clock reaches the order's absolute
    // arrival minute — cross-midnight arrivals are naturally day+1's
    // delivery. Orders saved before arrivalAbs existed (no kv migration)
    // resolve via foodOrderArrivalAbs's old-shape fallback.
    if (clockToAbsolute(currentGameState.meta.clock) < foodOrderArrivalAbs(order)) continue;
    handOverFoodOrder(order, day);
  }
}

// The driver is at the door. If the player is there to meet them the bag
// goes straight into their hands; if not, it's left on the doormat — the
// booking is never wasted for lack of the player's attendance (locked
// decision 3), it just gets colder and anyone in the apartment could reach
// it first, exactly like a Nile package.
function handOverFoodOrder(order, day) {
  order.status = 'delivered';
  order.deliveredDay = day;
  const driver = currentGameState.npcs[order.driverNpcId];
  const name = driver?.bible?.name || 'The driver';
  const def = RESTAURANT_DEFS[order.restaurantId];
  const toPlayer = currentGameState.player.location === 'entry';
  order.handedTo = toPlayer ? 'player' : 'doormat';

  const doormat = Object.values(currentGameState.objects?.room_entry || {}).find(o => o.defId === 'doormat');
  // Continuous time, not the whole day: the dish is stamped at the minute it
  // arrives, so its Fresh window is the couple of hours after the handover
  // rather than "whatever is left of today".
  const now = gameDaysNow(currentGameState.meta.clock);
  for (const line of order.items) {
    if (!ITEM_DEFS[line.itemId]) continue;
    if (toPlayer) {
      currentGameState.player.inventory = addStack(currentGameState.player.inventory, line.itemId, line.qty, 'player', {}, now);
    } else if (doormat) {
      doormat.contents = addStack(doormat.contents, line.itemId, line.qty, null, {}, now);
    }
  }

  // The tip is remembered by the person who carried it up the stairs — a
  // driver you tip well starts out warmer next time they're the one assigned.
  if (driver) {
    const delta = (order.tipPct || 0) >= FOOD_TUNING.tipRelThreshold
      ? FOOD_TUNING.tipRelDelta
      : (order.tipPct || 0) === 0 ? FOOD_TUNING.stiffRelDelta : null;
    if (delta) currentGameState.npcs[order.driverNpcId] = applyRelDelta(driver, delta, day);
  }

  const lines = order.items.map(i => `${ITEM_DEFS[i.itemId]?.label || i.itemId}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
  addLogEntry('narration', toPlayer
    ? `${name} hands over the ${def?.label || 'delivery'} order at the door — ${lines}.`
    : `${name} dropped off the ${def?.label || 'delivery'} order — ${lines}, left on the doormat.`);
}

// QuickCart's tick-driven arrival check, mirroring processFoodOrdersNow
// exactly (a shopper arrives at a TICK, not at day rollover).
function processGroceryOrdersNow() {
  if (!currentGameState?.world) return;
  const orders = currentGameState.world.groceryOrders || [];
  if (orders.length === 0) return;
  const { day } = currentGameState.meta.clock;
  for (const order of orders) {
    if (order.status !== 'ordered') continue;
    if (clockToAbsolute(currentGameState.meta.clock) < groceryOrderArrivalAbs(order)) continue;
    handOverGroceryOrder(order, day);
  }
}

// Mirrors handOverFoodOrder exactly — same player-in-entry vs. doormat
// fallback (the SAME doormat object Nile/DoorDrop already drop onto, so
// the food-overhaul Phase 1 auto-transfer sort picks this up for free),
// same tip-to-relationship nudge on the shopper, same narration shape. The
// one real difference: grocery order lines carry `defId` (Nile/Home's
// cart shape), not DoorDrop's `itemId`.
function handOverGroceryOrder(order, day) {
  order.status = 'delivered';
  order.deliveredDay = day;
  const shopper = currentGameState.npcs[order.shopperNpcId];
  const name = shopper?.bible?.name || 'Your shopper';
  const toPlayer = currentGameState.player.location === 'entry';
  order.handedTo = toPlayer ? 'player' : 'doormat';

  const doormat = Object.values(currentGameState.objects?.room_entry || {}).find(o => o.defId === 'doormat');
  const now = gameDaysNow(currentGameState.meta.clock);
  for (const line of order.items) {
    if (!ITEM_DEFS[line.defId]) continue;
    if (toPlayer) {
      currentGameState.player.inventory = addStack(currentGameState.player.inventory, line.defId, line.qty, 'player', {}, now);
    } else if (doormat) {
      doormat.contents = addStack(doormat.contents, line.defId, line.qty, null, {}, now);
    }
  }

  if (shopper) {
    const delta = (order.tipPct || 0) >= GROCERY_TUNING.tipRelThreshold
      ? GROCERY_TUNING.tipRelDelta
      : (order.tipPct || 0) === 0 ? GROCERY_TUNING.stiffRelDelta : null;
    if (delta) currentGameState.npcs[order.shopperNpcId] = applyRelDelta(shopper, delta, day);
  }

  const lines = order.items.map(i => `${ITEM_DEFS[i.defId]?.label || i.defId}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
  addLogEntry('narration', toPlayer
    ? `${name} hands over your QuickCart order at the door — ${lines}.`
    : `${name} left your QuickCart order at the door — ${lines}, on the doormat.`);
}

function doFoodOpenRestaurant(restaurantId, device) {
  if (!restaurantId || !currentGameState) return;
  const foodApp = currentGameState.world.computer?.apps?.food;
  if (!foodApp) return;
  foodApp.openRestaurantId = restaurantId;
  switchScreen(currentGameState, 'food', 'menu', undefined, device === 'phone' ? 'phone' : 'computer');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

async function doFoodAddToCart(itemId) {
  if (!itemId || !currentGameState) return;
  const foodApp = currentGameState.world.computer?.apps?.food;
  const result = addToFoodCart(currentGameState, foodApp?.openRestaurantId, itemId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('food-add', currentGameState);
}

async function doFoodRemoveFromCart(itemId) {
  if (!itemId || !currentGameState) return;
  removeFromFoodCart(currentGameState, itemId);
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('food-remove', currentGameState);
}

async function doFoodClearCart() {
  if (!currentGameState) return;
  clearFoodCart(currentGameState);
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('food-clear-cart', currentGameState);
}

async function doFoodSetTip(pctWhole) {
  if (!currentGameState) return;
  const foodApp = currentGameState.world.computer?.apps?.food;
  if (!foodApp || !Number.isFinite(pctWhole)) return;
  foodApp.tipPct = pctWhole / 100;
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('food-tip', currentGameState);
}

// The DoorDrop browse filter chip (Phase 3d). Pure render-time state: sets
// the transient foodBrowseFilterService variable (declared in RENDER.
// COMPUTER, same shared-global pattern as dragGesture) and re-renders both
// shells. Nothing is written to gameState/kv, so there's no save boundary
// and no per-user persistence — every reload starts on 'All'.
function doFoodFilterService(service) {
  if (!service || !currentGameState) return;
  foodBrowseFilterService = service;
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// The chosen delivery time is read off the select at submit time — the same
// "transient form state stays in the DOM until it's committed" pattern
// doMaidSave uses. Scoped by device because the computer and phone shells
// both live in the document and getElementById would always find the
// computer's copy first.
async function doFoodPlaceOrder(device) {
  if (!currentGameState) return;
  const scope = device === 'phone' ? document.getElementById('phone-screen') : document;
  const select = scope?.querySelector?.('#food-time') || document.getElementById('food-time');
  // The select value is an absolute minute (today or tomorrow); the cart
  // offers tomorrow's early-morning slots for orders whose arrival crosses
  // midnight. No value (or a malformed one) means ASAP — 0 is a no-op
  // against the arrival max().
  const requestedAbs = Number(select?.value || '');
  const result = placeFoodOrder(currentGameState, Number.isFinite(requestedAbs) ? { requestedAbs } : {});
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  const driver = currentGameState.npcs[result.order.driverNpcId];
  const eta = getFoodOrderEtaMinutes(result.order, currentGameState.meta.clock);
  addLogEntry('system', `Order placed with ${result.restaurant.label} — $${result.totals.total}. ${driver?.bible?.name || 'A driver'} is bringing it, about ${Math.max(0, eta)} minutes out.`);
  switchScreen(currentGameState, 'food', 'orders', undefined, device === 'phone' ? 'phone' : 'computer');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('food-order', currentGameState);
}

// Contacts (external-world plan Phase 2): ask someone for their number.
// Willingness is personality-weighted rather than a flat threshold (locked
// decision 7) — warmth and openness lower the rapport an NPC needs before
// they'll share, so a guarded person takes real relationship-building and an
// open one says yes early. A refusal isn't permanent: it sets a short
// retry cooldown so you can try again once things have warmed up.
function contactRapport(npc) {
  const rel = npc.relPlayer || {};
  // trust/affection are -1..1, comfort is 0..1 — average them onto a single
  // "do they like and trust you" scale.
  return ((rel.trust || 0) + (rel.affection || 0) + (rel.comfort || 0)) / 3;
}

function contactRequirement(npc) {
  const t = npc.bible?.temperament || {};
  const willingness = CONTACT_TUNING.warmthWeight * (t.warmth || 0)
    + CONTACT_TUNING.opennessWeight * (t.openness || 0);
  let required = CONTACT_TUNING.baseRequired - willingness;
  // Housemates share numbers as a matter of course.
  if (npc.residency?.status === 'resident') required *= CONTACT_TUNING.residentRequirementMultiplier;
  return required;
}

async function doAskContact(npcId) {
  const npc = currentGameState?.npcs[npcId];
  if (!npc) return;
  const name = npc.bible?.name || 'They';
  if (npc.contactKnown) {
    addLogEntry('system', `You already have ${name}'s number.`);
    return;
  }
  const day = currentGameState.meta.clock.day;
  const lastAsked = npc.flags?._askedContactDay;
  if (lastAsked !== undefined && day - lastAsked < CONTACT_TUNING.retryCooldownDays) {
    addLogEntry('narration', `You just asked ${name} for their number. Pushing again this soon would be a bad look.`);
    return;
  }
  const rapport = contactRapport(npc);
  const required = contactRequirement(npc);
  const ok = rapport >= required;
  npc.flags = npc.flags || {};
  npc.flags._askedContactDay = day;
  if (ok) {
    npc.contactKnown = true;
    // Open the thread so the contact is immediately usable.
    if (currentGameState.world.computer) ensureImThread(currentGameState, npcId);
    addLogEntry('narration', `${name} gives you their number. You can text them now.`);
  } else {
    addLogEntry('narration', `${name} deflects — you don't know each other well enough for that yet.`);
  }
  await advanceAndResolve(1);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('ask-contact', currentGameState);
}

// Invitations (external-world plan Phase 2): invite a contact over. Writes a
// purpose:'social' visit into the same world.visits[] queue every other
// source uses — the player's invitation is not a special case. Scheduled for
// the next day inside the standard daytime window so there's always a real
// wait between inviting and their arrival.
//
// AfterHours Phase 8 (Hot Singles): the site's "Invite Over" button funnels
// through this same flow with `source: 'ah'` — the visit is tagged
// `sourceId: 'ah_<npcId>_<day>'` so narration can flavour them as "the
// person you met on AfterHours", and the guest follows the player through
// the common rooms (sim.js resolveVisitPresence reads followPlayer) the way
// an invited date follows their host.
// Returns { ok, reason? } so a caller that reports its own outcome (the
// AfterHours profile's Invite Over button toasts in-site) can say what
// actually happened instead of assuming its own pre-checks still match these.
async function doInviteOver(npcId, source) {
  const npc = currentGameState?.npcs[npcId];
  if (!npc) return { ok: false, reason: 'No such person.' };
  const name = npc.bible?.name || 'They';
  // Residency first: someone who lives here can't be "invited over" whether
  // or not you happen to have their number.
  if (npc.residency?.status === 'resident') {
    const reason = `${name} already lives here.`;
    addLogEntry('system', reason);
    return { ok: false, reason };
  }
  if (!npc.contactKnown) {
    const reason = `You don't have ${name}'s number.`;
    addLogEntry('system', reason);
    return { ok: false, reason };
  }
  const day = currentGameState.meta.clock.day + 1;
  const existing = (currentGameState.world.visits || []).find(v =>
    v.npcId === npcId && visitDay(v) === day && v.status !== 'done' && v.status !== 'deferred');
  if (existing) {
    const reason = `${name} is already coming over that day.`;
    addLogEntry('system', reason);
    return { ok: false, reason };
  }
  const ahSource = source === 'ah';
  const win = VISIT_TUNING.contractor; // shared daytime window
  scheduleVisit(currentGameState, ahSource ? `ah_${npcId}_${day}` : `invite_${npcId}_${day}`, day, {
    npcId,
    purpose: 'social',
    startAbs: day * 1440 + win.startMinute,
    endAbs: day * 1440 + win.endMinute,
    roomId: 'living_room',
    followPlayer: ahSource,
  });
  addLogEntry('narration', ahSource
    ? `${name} — the person you met on AfterHours — says they'll come by tomorrow.`
    : `${name} says they'll come by tomorrow.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('invite-over', currentGameState);
  return { ok: true };
}

// Meal invitations (inventory overhaul Phase 7, D7): invite a RESIDENT to
// a shared dinner — in person (the Social chip) or by IM (the chat-header
// button). Picks a day + meal window (render.js's openDinnerInvitePicker),
// creates the world.commitments record, and narrates the immediate yes/no:
// acceptance is decided AT INVITE TIME by COMMITMENTS.respondToCommitment,
// so a roommate who dislikes you declines on the spot and a work-shift
// conflict is a real, named reason. Costs a tick like any social action
// (ask-contact) — needs decay exactly once via advanceAndResolve.
async function doInviteDinner(npcId) {
  const npc = currentGameState?.npcs?.[npcId];
  if (!npc) return;
  const name = npc.bible?.name || 'They';
  if (npc.residency?.status !== 'resident') {
    addLogEntry('system', `Only your housemates sit down for a shared dinner — ${name} lives elsewhere.`);
    return;
  }
  const choice = await openDinnerInvitePicker(name);
  if (!choice) return;
  const { record, responses } = createCommitment(currentGameState, {
    startAbs: choice.startAbs, endAbs: choice.endAbs,
    roomId: 'dining', invitedIds: [npcId],
  });
  const resp = responses?.[npcId];
  const choiceDay = Math.floor(choice.startAbs / 1440);
  const when = choiceDay === currentGameState.meta.clock.day
    ? 'today'
    : choiceDay === currentGameState.meta.clock.day + 1
      ? 'tomorrow'
      : formatDate(choiceDay);
  const at = formatTime(absoluteToClock(choice.startAbs).minutes);
  if (resp?.accept) {
    addLogEntry('narration', `${name} says yes — dinner ${when} at ${at}. You'll set the table in the dining room.`);
  } else if (resp?.reason === 'busy') {
    const busy = resp.block;
    const why = busy === 'sleep' ? "they'll be asleep then"
      : (busy === 'work' || busy === 'commute' || busy === 'commute_home') ? 'they have work around then'
        : "they're tied up";
    addLogEntry('narration', `${name} can't make dinner ${when} at ${at} — ${why}. Maybe another time.`);
  } else {
    addLogEntry('narration', `${name} gives a long look and declines the invitation. It hangs awkwardly in the air.`);
  }
  if (record.acceptedIds.length === 0 && record.declinedIds.length > 0) {
    addLogEntry('system', `${name} isn't coming — you can still set the table and eat alone, or pick a different time.`);
  }
  await advanceAndResolve(1);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('invite-dinner', currentGameState);
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
      const name = npc.bible.name || 'your roommate';

      // 30% chance of a multi-step chain quest, 70% simple quest
      if (rng() < 0.3) {
        const chain = QUEST_CHAINS[Math.floor(rng() * QUEST_CHAINS.length)];
        const title = chain.title.replace('{name}', name);
        const steps = chain.steps.map((s, i) => ({
          ...s,
          desc: s.desc.replace('{name}', name),
          done: false,
        }));
        const quest = {
          id: `chain_${day}_${npcId}`,
          title,
          desc: steps[0].desc,
          npcId,
          type: 'chain',
          chainId: chain.id,
          steps,
          currentStep: 0,
          rewardMoney: chain.rewardMoney,
          rewardRelation: chain.rewardRelation,
          day,
          expiresDay: day + QUEST_CONFIG.expiryDays * 2, // chains get more time
          status: 'active',
        };
        quests.active.push(quest);
        addLogEntry('system', `New goal: ${quest.title} (Step 1: ${steps[0].desc})`);
      } else {
        const tmpl = QUEST_TEMPLATES[Math.floor(rng() * QUEST_TEMPLATES.length)];
        const detail = tmpl.type === 'want' ? npc.bible.want
          : tmpl.type === 'wound' ? npc.bible.wound
          : (npc.bible.interests[0]?.name || 'something they like');
        const title = tmpl.template.replace('{name}', name).replace('{detail}', detail);
        const quest = {
          id: `quest_${day}_${npcId}`,
          title,
          desc: `Talk to ${name} to follow up.`,
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
  }

  currentGameState.world.quests = quests;
}

// Resolve any active quest referencing this NPC — called from doTalk.
// For simple quests, talking completes them. For chain quests, a 'talk'
// step completes the current step and advances to the next.
function checkQuestCompletion(npcId) {
  const quests = currentGameState.world.quests;
  if (!quests || !quests.active) return;
  const idx = quests.active.findIndex(q => q.npcId === npcId);
  if (idx < 0) return;
  const quest = quests.active[idx];

  if (quest.type === 'chain') {
    // Only complete if the current step is a 'talk' step
    const step = quest.steps[quest.currentStep];
    if (step.type !== 'talk') return;
    step.done = true;
    quest.currentStep++;

    if (quest.currentStep >= quest.steps.length) {
      // Chain complete
      quests.active = quests.active.filter((_, i) => i !== idx);
      quests.completed = quests.completed || [];
      quests.completed.push({ ...quest, status: 'completed', resolvedDay: currentGameState.meta.clock.day });
      currentGameState.player.money += quest.rewardMoney || 0;
      if (quest.rewardRelation) {
        currentGameState.npcs[npcId] = applyRelDelta(currentGameState.npcs[npcId], quest.rewardRelation, currentGameState.meta.clock.day);
      }
      addLogEntry('system', `Goal complete: ${quest.title} (+$${quest.rewardMoney || 0})`);
    } else {
      // Advance to next step
      const nextStep = quest.steps[quest.currentStep];
      quest.desc = nextStep.desc;
      addLogEntry('system', `${quest.title} — Step ${quest.currentStep + 1}: ${nextStep.desc}`);
    }
  } else {
    // Simple quest — talking completes it
    quests.active = quests.active.filter((_, i) => i !== idx);
    quests.completed = quests.completed || [];
    quests.completed.push({ ...quest, status: 'completed', resolvedDay: currentGameState.meta.clock.day });
    currentGameState.player.money += quest.rewardMoney || 0;
    if (quest.rewardRelation) {
      currentGameState.npcs[npcId] = applyRelDelta(currentGameState.npcs[npcId], quest.rewardRelation, currentGameState.meta.clock.day);
    }
    addLogEntry('system', `Goal complete: ${quest.title} (+$${quest.rewardMoney || 0})`);
  }
}

// Check if a player action completes a quest chain step. Called from
// doPlayerAction, executeAction, and other action handlers.
function checkChainQuestProgress(actionType, npcId, itemCategory) {
  const quests = currentGameState.world.quests;
  if (!quests || !quests.active) return;
  for (const quest of quests.active) {
    if (quest.type !== 'chain' || quest.npcId !== npcId) continue;
    const step = quest.steps[quest.currentStep];
    if (!step || step.done) continue;
    if (step.type !== actionType) continue;
    if (actionType === 'give_item' && itemCategory && step.itemCategory && itemCategory !== step.itemCategory) continue;
    // Step complete
    step.done = true;
    quest.currentStep++;
    if (quest.currentStep >= quest.steps.length) {
      // Chain complete
      const idx = quests.active.indexOf(quest);
      quests.active.splice(idx, 1);
      quests.completed = quests.completed || [];
      quests.completed.push({ ...quest, status: 'completed', resolvedDay: currentGameState.meta.clock.day });
      currentGameState.player.money += quest.rewardMoney || 0;
      if (quest.rewardRelation) {
        currentGameState.npcs[npcId] = applyRelDelta(currentGameState.npcs[npcId], quest.rewardRelation, currentGameState.meta.clock.day);
      }
      // Phase 6 (D13): resolving a chain quest is a genuine win — mood
      // impulse alongside the money/relationship payoff.
      pushMoodImpulse(currentGameState.player, MOOD_PAYOUTS.questComplete, currentGameState.meta.clock.day);
      addLogEntry('system', `Goal complete: ${quest.title} (+${quest.rewardMoney || 0})`);
    } else {
      const nextStep = quest.steps[quest.currentStep];
      quest.desc = nextStep.desc;
      addLogEntry('system', `${quest.title} — Step ${quest.currentStep + 1}: ${nextStep.desc}`);
    }
    return;
  }
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
  // Phase 6 (D13): getting the balance to zero is a real relief — a mood
  // impulse on top of the stress-term drag (MOOD_TARGET.stress.rentPenalty)
  // that the cleared balance removes.
  pushMoodImpulse(player, MOOD_PAYOUTS.payRent, currentGameState.meta.clock.day);
  addLogEntry('narration', `You pay ${owed} in rent. That's a relief.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('pay-rent', currentGameState);
}

// Shared by the world "Pay Bills" chip (BrineOS Phase 1 — the softlock fix
// that lets the player pay bills even with power cut and the computer dead)
// and the computer's Bills > Pay All button (ui.computer.js delegates
// here). Logs the outcome and re-renders the scene; computer callers
// re-render their own app screen afterwards.
async function doPayBillsFromWorld(boundaryId = 'pay-bills') {
  if (!currentGameState) return;
  const result = payAllBills(currentGameState);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  // payAllBills pays what it can afford and skips the rest, so "all" is only
  // true when nothing was left behind.
  if (result.unpaidCount > 0) {
    addLogEntry('narration', `You pay what you can: ${result.totalPaid} total. ${result.unpaidCount} bill${result.unpaidCount === 1 ? '' : 's'} still outstanding.`);
  } else {
    addLogEntry('narration', `You pay off all your bills: ${result.totalPaid} total.`);
  }
  const reconnected = [];
  for (const r of result.results) if (r.reconnected) reconnected.push(BILL_DEFS[r.billId].label);
  if (reconnected.length > 0) addLogEntry('system', `Service restored: ${reconnected.join(', ')}.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary(boundaryId, currentGameState);
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
    currentGameState.world.rent = computeRent(currentGameState.npcs, currentGameState);
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

// ===== SECTION: CHEAT MENU (F4, Discord feedback 2026-08-24) =====
// Every control here edits currentGameState directly and, on commit
// (slider release or button click), re-renders the game and saves —
// exactly the same render+saveAtBoundary pattern every other do* function
// in this file follows, so a cheat-menu edit is never lost if the tab
// closes right after. The four pane renderers (dispatched by menu.js's
// renderCheatMenuUi via CHEAT_TABS) are bespoke rather than routed through
// Sandbox/Settings' generic dot-path row system — that system targets one
// fixed pre-game draft object with plain fields; currentGameState is a live
// simulation object graph with derived fields (hunger, NPC intimacyLevel)
// and a dynamic per-NPC sub-target the generic system was never built for.

function cheatFormatNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// A labeled slider that live-updates its own readout on drag and commits
// (calls onInput, then re-renders + saves) only on release — dragging
// through intermediate values never spams a kv write per frame.
function cheatSlider(value, min, max, step, onInput) {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  if (step !== undefined) slider.step = step;
  slider.className = 'sbx-control sbx-slider';
  slider.value = value;
  const val = document.createElement('span');
  val.className = 'sbx-slider-val';
  val.textContent = cheatFormatNum(value);
  slider.addEventListener('input', () => { val.textContent = cheatFormatNum(parseFloat(slider.value)); });
  slider.addEventListener('change', () => {
    onInput(parseFloat(slider.value));
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
  });
  wrap.appendChild(slider);
  wrap.appendChild(val);
  return wrap;
}

function cheatRow(label, desc, control) {
  const row = sandboxRowEl(label, desc);
  row.appendChild(control);
  return row;
}

function cheatButton(label, onClick, cls) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'title-btn menu-option-toggle' + (cls ? ` ${cls}` : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderCheatPlayerPane() {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-section-wrap';
  const player = currentGameState.player;

  wrap.appendChild(sandboxSectionTitle('Needs'));
  wrap.appendChild(cheatRow('Energy', '', cheatSlider(player.energy, 0, 100, 1, (v) => {
    currentGameState.player.energy = v;
  })));
  wrap.appendChild(cheatRow('Energy cap', 'The ceiling energy restores up to — normally grows slowly from good sleep and workouts.',
    cheatSlider(player.energyMax ?? ENERGY.startingMax, 0, ENERGY.absoluteMax, 1, (v) => {
      currentGameState.player.energyMax = v;
    })));
  wrap.appendChild(cheatRow('Hygiene', '', cheatSlider(player.hygiene, 0, 100, 1, (v) => {
    currentGameState.player.hygiene = v;
  })));
  wrap.appendChild(cheatRow('Desire', '', cheatSlider(player.desire ?? 0, 0, DESIRE.player.max, 1, (v) => {
    currentGameState.player.desire = v;
  })));
  const fullnessHours = typeof player.fullnessRemainingHours === 'number' ? player.fullnessRemainingHours : METABOLISM.fullnessCapHours;
  wrap.appendChild(cheatRow('Fullness (hours remaining)', `Hunger is derived from this, not set directly. Currently reads as ${Math.round(player.hunger)}/100.`,
    cheatSlider(fullnessHours, 0, METABOLISM.fullnessCapHours, 0.5, (v) => {
      currentGameState.player.fullnessRemainingHours = v;
      currentGameState.player.hunger = satietyFrom(v, currentGameState.player.fullnessWindowHours);
    })));

  wrap.appendChild(sandboxSectionTitle('Money'));
  const moneyRow = sandboxRowEl('Money', 'Your current cash on hand.');
  const moneyInput = document.createElement('input');
  moneyInput.type = 'number';
  moneyInput.className = 'sbx-control';
  moneyInput.value = Math.round(player.money);
  moneyInput.addEventListener('change', () => {
    const v = parseFloat(moneyInput.value);
    if (!Number.isFinite(v)) return;
    currentGameState.player.money = v;
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
  });
  moneyRow.appendChild(moneyInput);
  wrap.appendChild(moneyRow);
  const moneyBtns = document.createElement('div');
  moneyBtns.className = 'cheat-inline-actions';
  for (const amt of [100, 1000, -100]) {
    moneyBtns.appendChild(cheatButton(amt > 0 ? `+$${amt}` : `-$${Math.abs(amt)}`, () => {
      currentGameState.player.money += amt;
      render(currentGameState, currentSceneState);
      saveAtBoundary('cheat-menu', currentGameState);
      renderCheatMenuUi();
    }));
  }
  wrap.appendChild(moneyBtns);

  wrap.appendChild(sandboxSectionTitle('Mood'));
  wrap.appendChild(sandboxSectionHint(`Current mood: ${(player.mood ?? 0).toFixed(2)} (-1 to 1). Mood eases toward its target every tick — there's no permanent direct set, so these apply a mood swing that fades over about a day, same as any in-fiction mood event.`));
  const moodBtns = document.createElement('div');
  moodBtns.className = 'cheat-inline-actions';
  for (const [label, delta] of [['Ecstatic', 1], ['Good', 0.4], ['Bad', -0.4], ['Miserable', -1]]) {
    moodBtns.appendChild(cheatButton(label, () => {
      pushMoodImpulse(currentGameState.player, delta, currentGameState.meta.clock.day);
      render(currentGameState, currentSceneState);
      saveAtBoundary('cheat-menu', currentGameState);
    }));
  }
  wrap.appendChild(moodBtns);

  return wrap;
}

function renderCheatTimePane() {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-section-wrap';
  const clock = currentGameState.meta.clock;

  wrap.appendChild(sandboxSectionTitle('Now'));
  const hh = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
  const mm = String(Math.floor(clock.minutes % 60)).padStart(2, '0');
  const readout = document.createElement('p');
  readout.className = 'cheat-readout';
  readout.textContent = `Day ${clock.day} · ${WEEKDAY_NAMES[clock.weekday]} · ${hh}:${mm} · ${clock.phase.replace(/_/g, ' ')}`;
  wrap.appendChild(readout);

  const runCheatJump = async (minutes) => {
    if (minutes <= 0) return;
    showLoading('Skipping ahead...');
    try {
      await advanceAndResolveMinutes(minutes);
    } finally {
      hideLoading();
    }
    render(currentGameState, currentSceneState);
    await saveAtBoundary('cheat-menu', currentGameState);
    renderCheatMenuUi();
  };

  wrap.appendChild(sandboxSectionTitle('Jump to a time'));
  const jumpRow = sandboxRowEl('Day / time', 'Forward only — the sim resolves everything in between exactly like it naturally would.');
  const dayInput = document.createElement('input');
  dayInput.type = 'number';
  dayInput.className = 'sbx-control';
  dayInput.min = clock.day;
  dayInput.value = clock.day;
  dayInput.style.width = '70px';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'sbx-control';
  timeInput.value = `${hh}:${mm}`;
  jumpRow.appendChild(dayInput);
  jumpRow.appendChild(timeInput);
  wrap.appendChild(jumpRow);
  wrap.appendChild(cheatButton('Jump', async () => {
    const targetDay = parseInt(dayInput.value, 10);
    const [th, tm] = (timeInput.value || '00:00').split(':').map(Number);
    if (!Number.isFinite(targetDay) || !Number.isFinite(th) || !Number.isFinite(tm)) return;
    const targetAbs = clockToAbsolute({ day: targetDay, minutes: th * 60 + tm });
    const startAbs = clockToAbsolute(currentGameState.meta.clock);
    await runCheatJump(targetAbs - startAbs);
  }));

  wrap.appendChild(sandboxSectionTitle('Shortcuts'));
  const shortcuts = document.createElement('div');
  shortcuts.className = 'cheat-inline-actions';
  shortcuts.appendChild(cheatButton('Skip to next midnight', async () => {
    const startAbs = clockToAbsolute(currentGameState.meta.clock);
    await runCheatJump((currentGameState.meta.clock.day + 1) * 1440 - startAbs);
  }));
  shortcuts.appendChild(cheatButton('+1 hour', () => runCheatJump(60)));
  shortcuts.appendChild(cheatButton(clockLoopRunning ? 'Freeze clock' : 'Resume clock', () => {
    if (clockLoopRunning) pauseClockLoop(); else resumeClockLoop();
    renderCheatMenuUi();
  }));
  wrap.appendChild(shortcuts);

  wrap.appendChild(sandboxSectionTitle('Game speed'));
  wrap.appendChild(sandboxSectionHint('The same ×0/×1/×20/×100 control as the header — shown here too so every time control lives in one place.'));
  const speedRow = document.createElement('div');
  speedRow.className = 'cheat-inline-actions';
  for (const preset of SPEED_PRESETS) {
    const active = currentSpeed().id === preset.id;
    speedRow.appendChild(cheatButton(preset.label || preset.id, () => {
      setSpeed(preset.id);
      renderSpeedButtons();
      renderCheatMenuUi();
    }, active ? 'sbx-btn-accent' : ''));
  }
  wrap.appendChild(speedRow);

  return wrap;
}

function renderCheatNpcsPane() {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-section-wrap';
  const npcIds = Object.keys(currentGameState.npcs);
  if (!npcIds.includes(cheatActiveNpcId)) cheatActiveNpcId = npcIds[0] || null;

  const picker = document.createElement('div');
  picker.className = 'cheat-npc-picker';
  for (const id of npcIds) {
    const n = currentGameState.npcs[id];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cheat-npc-chip' + (id === cheatActiveNpcId ? ' active' : '');
    chip.textContent = `${fullName(n.bible) || id} (${n.residency?.status || '?'})`;
    chip.addEventListener('click', () => { cheatActiveNpcId = id; renderCheatMenuUi(); });
    picker.appendChild(chip);
  }
  wrap.appendChild(picker);

  if (!cheatActiveNpcId) {
    wrap.appendChild(sandboxSectionHint('No NPCs exist in this save yet.'));
    return wrap;
  }
  const npc = currentGameState.npcs[cheatActiveNpcId];

  wrap.appendChild(sandboxSectionTitle('Relationship'));
  const relAxes = [
    ['trust', 'Trust', -1, 1], ['affection', 'Affection', -1, 1], ['tension', 'Tension', -1, 1],
    ['respect', 'Respect', -1, 1], ['comfort', 'Comfort', 0, 1], ['desire', 'Desire', -1, 1],
  ];
  for (const [key, label, min, max] of relAxes) {
    wrap.appendChild(cheatRow(label, '', cheatSlider(npc.relPlayer?.[key] ?? 0, min, max, 0.05, (v) => {
      const n = currentGameState.npcs[cheatActiveNpcId];
      const delta = v - (n.relPlayer?.[key] ?? 0);
      currentGameState.npcs[cheatActiveNpcId] = applyRelDelta(n, { [key]: delta }, currentGameState.meta.clock.day);
    })));
  }

  wrap.appendChild(sandboxSectionTitle('Mood & suspicion'));
  wrap.appendChild(cheatRow('Mood', '', cheatSlider(npc.mood ?? 0, -1, 1, 0.05, (v) => {
    currentGameState.npcs[cheatActiveNpcId].mood = v;
  })));
  wrap.appendChild(cheatRow('Suspicion (boundary violations)', '', cheatSlider(npc.suspicion?.boundary_violation ?? 0, 0, 1, 0.05, (v) => {
    const n = currentGameState.npcs[cheatActiveNpcId];
    n.suspicion = n.suspicion || {};
    n.suspicion.boundary_violation = v;
  })));

  wrap.appendChild(sandboxSectionTitle('Temperament'));
  wrap.appendChild(sandboxSectionHint('Personality axes rolled at generation — editing these live genuinely changes behavior (compatibility, drive weighting, work affinity).'));
  for (const key of ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness']) {
    wrap.appendChild(cheatRow(key.charAt(0).toUpperCase() + key.slice(1), '', cheatSlider(npc.bible?.temperament?.[key] ?? 0, -1, 1, 0.05, (v) => {
      const n = currentGameState.npcs[cheatActiveNpcId];
      n.bible = n.bible || {};
      n.bible.temperament = n.bible.temperament || {};
      n.bible.temperament[key] = v;
    })));
  }

  wrap.appendChild(sandboxSectionTitle('Location'));
  const locRow = sandboxRowEl('Teleport', `Currently in: ${ROOMS[npc.location]?.name || npc.location || 'off-map'}`);
  const locSelect = document.createElement('select');
  locSelect.className = 'sbx-control';
  for (const roomId of ALL_ROOMS) {
    const opt = document.createElement('option');
    opt.value = roomId;
    opt.textContent = ROOMS[roomId].name;
    if (roomId === npc.location) opt.selected = true;
    locSelect.appendChild(opt);
  }
  locRow.appendChild(locSelect);
  wrap.appendChild(locRow);
  wrap.appendChild(cheatButton('Teleport', () => {
    const n = currentGameState.npcs[cheatActiveNpcId];
    // Clearing pos/walk lets reconcileNpcPos (movement.js) snap pos to the
    // new room next tick — leaving a stale walk record would otherwise keep
    // animating the NPC back toward their old destination.
    n.location = locSelect.value;
    n.pos = null;
    n.walk = null;
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
    renderCheatMenuUi();
  }));

  wrap.appendChild(sandboxSectionTitle('Residency'));
  wrap.appendChild(sandboxSectionHint(`Status: ${npc.residency?.status || 'unknown'}${npc.residency?.room ? ` — ${ROOMS[npc.residency.room]?.name || npc.residency.room}` : ''}`));
  const residencyActions = document.createElement('div');
  residencyActions.className = 'cheat-inline-actions';
  if (npc.residency?.status === 'resident') {
    residencyActions.appendChild(cheatButton('Move out', async () => {
      await doAskToLeave(cheatActiveNpcId);
      renderCheatMenuUi();
    }, 'sbx-btn-danger'));
  } else {
    const roomSelect = document.createElement('select');
    roomSelect.className = 'sbx-control';
    for (const roomId of ALL_ROOMS.filter((id) => ROOMS[id].type === 'bedroom' && !ROOMS[id].isPlayer)) {
      const opt = document.createElement('option');
      opt.value = roomId;
      opt.textContent = ROOMS[roomId].name;
      roomSelect.appendChild(opt);
    }
    residencyActions.appendChild(roomSelect);
    residencyActions.appendChild(cheatButton('Move in', () => {
      // acceptApplicant enforces its normal eligibility/room-capacity rules
      // (this is the same function the Classifieds move-in flow uses) — a
      // rejection is surfaced rather than silently forced, since bypassing
      // room-capacity/couple bookkeeping here would desync castWeb/rent.
      const result = acceptApplicant(currentGameState, cheatActiveNpcId, roomSelect.value);
      if (!result.ok) addLogEntry('system', `Move-in failed: ${result.reason}`);
      render(currentGameState, currentSceneState);
      saveAtBoundary('cheat-menu', currentGameState);
      renderCheatMenuUi();
    }));
  }
  wrap.appendChild(residencyActions);

  return wrap;
}

function renderCheatWorldPane() {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-section-wrap';
  const world = currentGameState.world;

  wrap.appendChild(sandboxSectionTitle('Rent & bills'));
  const rentRow = sandboxRowEl('Rent owed', `$${Math.round(currentGameState.player.rentOwed || 0)}`);
  rentRow.appendChild(cheatButton('Clear rent', () => {
    currentGameState.player.rentOwed = 0;
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
    renderCheatMenuUi();
  }));
  wrap.appendChild(rentRow);
  for (const billId of Object.keys(BILL_DEFS).filter((id) => id !== 'rent')) {
    const bill = world.bills?.[billId];
    if (!bill) continue;
    const def = BILL_DEFS[billId];
    const row = sandboxRowEl(def.label, `Balance: $${Math.round(bill.balance || 0)}${bill.cutoffActive ? ' — SERVICE CUT OFF' : ''}`);
    row.appendChild(cheatButton('Clear', () => {
      const b = currentGameState.world.bills[billId];
      b.balance = 0; b.status = 'paid'; b.overdueDays = 0; b.cutoffActive = false;
      render(currentGameState, currentSceneState);
      saveAtBoundary('cheat-menu', currentGameState);
      renderCheatMenuUi();
    }));
    wrap.appendChild(row);
  }

  wrap.appendChild(sandboxSectionTitle('Doors'));
  wrap.appendChild(cheatButton('Unlock every door', () => {
    for (const key of Object.keys(currentGameState.objects)) {
      if (!key.startsWith('room_')) continue;
      for (const obj of Object.values(currentGameState.objects[key])) {
        if (obj.defId === 'bedroom_door' || obj.defId === 'bathroom_door') {
          obj.state = { ...obj.state, lock: 'unlocked' };
        }
      }
    }
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
  }));

  wrap.appendChild(sandboxSectionTitle('Phone battery'));
  const batteryFound = findPhoneObject(currentGameState);
  wrap.appendChild(cheatRow('Battery %', '', cheatSlider(batteryFound?.obj?.flags?.battery ?? 0, 0, 100, 1, (v) => {
    const found = findPhoneObject(currentGameState);
    if (found) { found.obj.flags = found.obj.flags || {}; found.obj.flags.battery = v; }
  })));
  const alwaysCharged = !!currentGameState.world.gameplayOptions?.phoneBatteryAlwaysCharged;
  const chargedBtn = cheatButton(alwaysCharged ? 'On' : 'Off', () => {
    currentGameState.world.gameplayOptions = currentGameState.world.gameplayOptions || {};
    currentGameState.world.gameplayOptions.phoneBatteryAlwaysCharged = !currentGameState.world.gameplayOptions.phoneBatteryAlwaysCharged;
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
    renderCheatMenuUi();
  }, alwaysCharged ? 'sbx-btn-accent' : '');
  wrap.appendChild(cheatRow('Always Charged', 'Overrides the drain rate above for the rest of this save.', chargedBtn));

  wrap.appendChild(sandboxSectionTitle('Give item'));
  const itemRow = sandboxRowEl('Item', '');
  const itemSelect = document.createElement('select');
  itemSelect.className = 'sbx-control';
  for (const defId of Object.keys(ITEM_DEFS).filter((id) => id !== '_unknown').sort()) {
    const opt = document.createElement('option');
    opt.value = defId;
    opt.textContent = ITEM_DEFS[defId].label || defId;
    itemSelect.appendChild(opt);
  }
  itemRow.appendChild(itemSelect);
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'sbx-control';
  qtyInput.value = 1;
  qtyInput.min = 1;
  qtyInput.style.width = '60px';
  itemRow.appendChild(qtyInput);
  wrap.appendChild(itemRow);
  wrap.appendChild(cheatButton('Give item', () => {
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    currentGameState.player.inventory = addStack(currentGameState.player.inventory, itemSelect.value, qty, 'player', {}, currentGameState.meta.clock.day);
    render(currentGameState, currentSceneState);
    saveAtBoundary('cheat-menu', currentGameState);
  }));

  return wrap;
}

// Peep: observe an NPC in a private state from the hallway. The npcId
// parameter here is actually the roomId (the chip passes the room, not
// the NPC — the player targets a door, not a person). resolvePeep
// handles detection, suspicion, and narration.
async function doPeep(roomId) {
  if (!currentGameState) return;
  const result = resolvePeep(currentGameState, roomId);
  if (!result.ok) {
    addLogEntry('narration', result.reason);
    return;
  }
  addLogEntry('narration', result.narration);
  currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('peep', currentGameState);
}

// Knock on a bedroom door from the hallway. The npcId param is actually
// the roomId of the bedroom being knocked on (set by renderActionChips as
// data-npc on knock chips for consistency with peep). If the owner is home
// and awake, they respond; if asleep or away, a different message.
async function doKnock(roomId) {
  if (!currentGameState) return;
  const ownerId = roomOwnerId(roomId, currentGameState.npcs);
  const owner = ownerId ? currentGameState.npcs[ownerId] : null;
  const roomName = ROOMS[roomId]?.name || 'room';
  if (!owner) {
    addLogEntry('narration', `You knock on the ${roomName} door. No answer — nobody's home.`);
  } else if (owner.location !== roomId) {
    addLogEntry('narration', `You knock on the ${roomName} door. No answer — it's empty.`);
  } else {
    const activity = owner.activity || '';
    const name = owner.bible.name || 'Someone';
    if (activity === 'sleeping' || activity === 'napping') {
      addLogEntry('narration', `You knock on the ${roomName} door. After a moment you hear groaning — ${name} is asleep. No response.`);
    } else if (activity === 'showering') {
      addLogEntry('narration', `You knock on the ${roomName} door. The shower keeps running inside.`);
    } else {
      const responses = [
        `${name}'s voice: "Yeah? What's up?"`,
        `${name} opens the door a crack. "Hey, what is it?"`,
        `${name} calls out, "Come in!"`,
        `A pause, then footsteps. ${name} opens the door. "Oh, hey."`,
      ];
      addLogEntry('narration', `You knock on the ${roomName} door. ${responses[Math.floor(orbitalRandom() * responses.length)]}`);
    }
  }
  await advanceAndResolve(1);
  currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('knock', currentGameState);
}

// Unlock a locked door from the OUTSIDE. The only locks in the game are the
// player's own (no NPC ever locks a door), so a locked door you're standing
// next to is always one you locked — and undoing it from out here is what
// makes lock-your-room-and-walk-out a recovery instead of a softlock. The
// roomId param is the ADJACENT room whose door this is (set by render.js as
// data-room-id on the chip), matching doKnock's convention.
async function doUnlockDoorFromOutside(roomId) {
  if (!currentGameState) return;
  const bucket = currentGameState.objects?.[`room_${roomId}`] || {};
  const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
  if (!door) { addLogEntry('narration', 'There is no door here to unlock.'); return; }
  if (door.state?.lock !== 'locked') { addLogEntry('narration', 'The door is already unlocked.'); return; }
  door.state = { ...door.state, lock: 'unlocked' };
  const roomName = ROOMS[roomId]?.name || 'room';
  addLogEntry('narration', `You unlock the ${roomName} door from the outside. Click.`);
  await advanceAndResolve(1);
  currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('unlock-door', currentGameState);
}

// --- Room search (inventory overhaul Phase 8, D8) ---
// Searching a roommate's room surfaces their possessions via the modal
// (render.js's openRoomSearchModal); the take that follows routes through
// the same ADJUST_SUSPICION boundary_violation path as phone-snooping
// (drives.js:400) — the owner in the room to catch you pays the full
// witnessed delta. Browsing is free; the TAKE pays game time through
// advanceAndResolveMinutes (search + pocket, decayed exactly once), so
// the room-search can never become a free-action item printer.
// --- Notes (perception plan Phase 4) ---
// Writing is the one note verb that isn't an ACTION_DEFS entry, because it
// needs free text and the effects pipeline has nowhere to put a text box.
// Reading and binning ARE ordinary object-sourced actions. Reuses the shared
// #modal-overlay the same way doConvAskLeave does — no new infrastructure.
function openWriteNoteModal() {
  if (!currentGameState) return;
  const roomId = currentGameState.player.location;
  const roomObjects = currentGameState.objects?.[`room_${roomId}`] || {};
  const surface = Object.values(roomObjects).find(o => OBJECT_DEFS[o.defId]?.surfaces);
  if (!surface) { addLogEntry('system', 'Nothing here to leave a note on.'); return; }

  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;

  title.textContent = `Leave a note on the ${OBJECT_DEFS[surface.defId].label}`;
  body.innerHTML = `<textarea id="note-text" rows="4" maxlength="${NOTE_TUNING.maxLength}"
    style="width:100%;resize:vertical" placeholder="Write something…"></textarea>`;
  actions.innerHTML = `<button class="btn" data-action="confirm-write-note">Leave It</button>`
    + `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>`;
  overlay.setAttribute('data-open', '');
  setTimeout(() => document.getElementById('note-text')?.focus(), 50);
}

async function doWriteNote() {
  const text = document.getElementById('note-text')?.value || '';
  closeModal();
  if (!text.trim()) return;
  const roomId = currentGameState.player.location;
  const roomObjects = currentGameState.objects?.[`room_${roomId}`] || {};
  const surface = Object.values(roomObjects).find(o => OBJECT_DEFS[o.defId]?.surfaces);
  const note = spawnNote(currentGameState, {
    roomId,
    attachedTo: surface?.id || null,
    authorId: 'player',
    text,
  });
  if (!note) { addLogEntry('system', 'There are already too many notes up here.'); return; }
  // A note you wrote yourself is already read — it should not sit there
  // shouting at its own author.
  note.state = { ...note.state, read: 'read' };
  addLogEntry('narration', `You leave a note on the ${OBJECT_DEFS[surface.defId].label.toLowerCase()}.`);
  await advanceAndResolveMinutes(NOTE_TUNING.writeMinutes);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('write-note', currentGameState);
}

async function doSearchRoom(ownerId) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[ownerId];
  if (!npc) return;
  if (roomOwnerId(currentGameState.player.location, currentGameState.npcs) !== ownerId) {
    addLogEntry('system', "You're not in their room.");
    return;
  }
  const choice = await openRoomSearchModal(npc);
  if (!choice) return;
  await doTakeFromRoom(ownerId, choice.defId, choice.qty);
}

async function doTakeFromRoom(ownerId, defId, qty) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[ownerId];
  const def = ITEM_DEFS[defId];
  if (!npc || !def) return;
  const stack = (npc.inventory || []).find(s => s.defId === defId && (s?.qty || 0) > 0);
  if (!stack) { addLogEntry('system', "It isn't there anymore."); return; }
  if (stack.meta?.keyItem || def.keyItem) {
    addLogEntry('system', "You can't take that — it's personal.");
    return;
  }
  const name = npc.bible.name || 'They';
  const roomId = currentGameState.player.location;
  const presentIds = getPresentNpcIds(currentGameState.npcs, roomId);
  const ownerPresent = presentIds.includes(ownerId);
  const delta = ownerPresent
    ? STEALTH_TUNING.witnessedSuspicionDelta
    : STEALTH_TUNING.possessionTakeSuspicionDelta;
  const roomObjects = currentGameState.objects[`room_${roomId}`] || {};
  const effCtx = buildEffectContext(currentGameState, [], presentIds, roomObjects, currentGameState.player.inventory || []);
  const lines = [
    `MOVE_ITEM ${defId} ${qty} ${ownerId} player`,
    `ADJUST_SUSPICION ${ownerId} boundary_violation +${delta}`,
  ];
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  await advanceAndResolveMinutes(STEALTH_TUNING.searchTimeMinutes + STEALTH_TUNING.takeTimeMinutes);
  const label = def.label || stack.meta?.origName || defId;
  addLogEntry('narration', ownerPresent
    ? `You pocket ${name}'s ${label}${qty > 1 ? ` ×${qty}` : ''} right in front of them. Their eyes narrow.`
    : `You take ${name}'s ${label}${qty > 1 ? ` ×${qty}` : ''}. They're none the wiser.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('room-take', currentGameState);
}

// --- Phone snoop (F6, Discord feedback 2026-08-24) ---
// The player-side mirror of drives.js's snoop_phone drive. Same room-owner
// gate as Search Room; unlike Search Room's flat suspicion delta, the
// witnessed path reuses npc.js's resolveShamingReaction/SHAMING tiers
// wholesale (the same consequence bundle boundary.js's caught-in-bed path
// uses) so the reaction genuinely depends on the NPC's own disposition
// toward the player, not a fixed number.
async function doSearchPhone(ownerId) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[ownerId];
  if (!npc) return;
  if (roomOwnerId(currentGameState.player.location, currentGameState.npcs) !== ownerId) {
    addLogEntry('system', "You're not in their room.");
    return;
  }
  const finding = composePhoneFind(npc, currentGameState);
  if (!finding) {
    addLogEntry('system', `Nothing new on ${npc.bible.name || 'their'} phone.`);
    return;
  }

  const roomId = currentGameState.player.location;
  const presentIds = getPresentNpcIds(currentGameState.npcs, roomId);
  const ownerPresent = presentIds.includes(ownerId);
  const day = currentGameState.meta.clock.day;

  npc.flags = npc.flags || {};
  npc.flags._phoneFindsSeen = [...(npc.flags._phoneFindsSeen || []), finding.kind];

  let narration;
  if (ownerPresent) {
    const shaming = resolveShamingReaction(currentGameState, npc, { cause: 'phone_snoop', day });
    applyShamingReactionLines(currentGameState, ownerId, shaming, finding.sensitive ? PHONE_SNOOP_TUNING.sensitiveExtraTension : 0);
    if (shaming.coldShoulderSeverity > 0) {
      noteColdShoulder(currentGameState.npcs[ownerId], shaming.coldShoulderSeverity, day, 'caught_boundary');
    }
    narration = shaming.prose || `${npc.bible.name} catches you going through their phone.`;
  } else {
    const delta = PHONE_SNOOP_TUNING.unwitnessedSuspicionDelta * (finding.sensitive ? PHONE_SNOOP_TUNING.sensitiveContentMultiplier : 1);
    const roomObjects = currentGameState.objects[`room_${roomId}`] || {};
    const effCtx = buildEffectContext(currentGameState, [], presentIds, roomObjects, currentGameState.player.inventory || []);
    applyEffects([parseEffectDSL(`ADJUST_SUSPICION ${ownerId} boundary_violation +${delta}`)[0]].filter(Boolean), effCtx);
    narration = `You go through ${npc.bible.name}'s phone. They're none the wiser — for now.`;
  }

  await advanceAndResolveMinutes(PHONE_SNOOP_TUNING.searchTimeMinutes);
  addLogEntry('narration', narration);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('phone-snoop', currentGameState);
  await showPhoneFindModal(npc, finding);
}

// The found-content popup — text findings show immediately; a photo
// finding generates on the spot (uncached, per generatePhoneSnoopPhotoImage)
// with a loading state, same shell as showActionMomentModal.
async function showPhoneFindModal(npc, finding) {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;

  title.textContent = `${npc.bible?.name || 'Their'}'s phone`;
  body.innerHTML = '';
  actions.innerHTML = '';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-secondary';
  close.textContent = 'Close';
  close.addEventListener('click', () => overlay.removeAttribute('data-open'));
  actions.appendChild(close);

  if (!finding.isPhoto) {
    const p = document.createElement('p');
    p.textContent = finding.text;
    body.appendChild(p);
    overlay.setAttribute('data-open', '');
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'action-moment-photo';
  const img = document.createElement('img');
  img.className = 'action-moment-img';
  img.alt = finding.caption || 'Phone photo';
  wrap.appendChild(img);
  body.appendChild(wrap);
  overlay.setAttribute('data-open', '');

  try {
    const result = await generatePhoneSnoopPhotoImage(npc);
    if (!overlay.hasAttribute('data-open')) return; // dismissed while generating
    if (result?.url) {
      img.src = result.url;
      setImageMeta(img, {
        label: finding.caption || 'Phone photo',
        prompt: applyImageStyle(result.prompt),
        seed: null,
        negativePrompt: 'blurry, distorted, extra limbs, low quality, text, watermark',
      });
    }
  } catch (e) {
    console.warn('Phone snoop photo failed:', e);
  }
}

// Give item: gives a meal/food/gift item from inventory to an NPC.
// Used to complete chain quest 'give_item' steps. The first matching
// item in the player's inventory is consumed. Intimacy & Voyeurism Phase 16
// (D2/D14): gifting a COLD-SHOULDERING NPC is a reparation act even without
// a quest — the render chip offers it whenever the NPC is cold (render.js)
// — and a landed gift ratchets their severity down one (the plan's gift
// reparation, one per giftCooldownDays window).
async function doGiveItem(npcId) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  // Defensive presence check — the UI chip only offers this for present
  // NPCs (via getPresentNpcIds), but the handler itself didn't enforce it,
  // so any other future call site (or a stale chip click after the NPC
  // left) could hand something to someone who isn't in the room.
  if (!getPresentNpcIds(currentGameState.npcs, currentGameState.player.location).includes(npcId)) return;
  // Find the active chain quest step
  const quest = (currentGameState.world.quests?.active || []).find(q =>
    q.type === 'chain' && q.npcId === npcId &&
    q.steps[q.currentStep]?.type === 'give_item' && !q.steps[q.currentStep]?.done
  );
  // Cold-shoulder repair branch (Phase 16): a cold NPC accepts any
  // gift-category item as reparation. The quest branch keeps its own
  // itemCategory (meal/food/gift); absent a quest AND a cold-shoulder, the
  // chip does not exist and this handler has nothing to do.
  const cs = coldShoulderState(npc, currentGameState.meta.clock.day);
  const step = quest && quest.steps[quest.currentStep];
  const wantCategory = quest ? (step.itemCategory || null) : (cs.active ? 'gift' : null);
  if (!quest && !wantCategory) return;
  // Find matching item in inventory
  const inv = currentGameState.player.inventory || [];
  const idx = inv.findIndex(stack => {
    const def = ITEM_DEFS[stack.defId];
    return def && (!wantCategory || def.category === wantCategory);
  });
  if (idx < 0) {
    addLogEntry('system', `You don't have a ${wantCategory || 'suitable item'} to give.`);
    return;
  }
  const stack = inv[idx];
  const itemLabel = ITEM_DEFS[stack.defId]?.label || 'something';
  // Consume one from the stack
  inv[idx] = { ...stack, qty: stack.qty - 1 };
  if (inv[idx].qty <= 0) inv.splice(idx, 1);
  addLogEntry('narration', `You give ${itemLabel} to ${npc.bible.name || 'them'}.`);
  // Complete the step
  if (quest) checkChainQuestProgress('give_item', npcId, step.itemCategory);
  let npcOut = npc;
  if (cs.active) {
    // The reparation ratchet — one severity per landed gift (cooldown +
    // minDaysBeforeRepair enforced inside noteColdShoulderRepair).
    const res = noteColdShoulderRepair(npc, 'gift', currentGameState.meta.clock.day);
    if (res.repaired) {
      npcOut = applyRelDelta(npc, COLD_SHOULDER.repairRelDeltas, currentGameState.meta.clock.day);
      if (res.severity <= 0) {
        addLogEntry('narration', `${npc.bible.name || 'They'} looks at you properly for the first time in days. The cold is gone.`);
      } else {
        addLogEntry('narration', `${npc.bible.name || 'They'} takes the ${itemLabel}, looking at it for a long moment. "Thank you," they say, quietly.`);
      }
    } else {
      addLogEntry('narration', `${npc.bible.name || 'They'} leaves the ${itemLabel} where it is. Not yet.`);
    }
  } else {
    npcOut = applyRelDelta(npc, { affection: 0.05 }, currentGameState.meta.clock.day);
    addLogEntry('narration', 'They seem touched.');
  }
  currentGameState.npcs[npcId] = npcOut;
  render(currentGameState, currentSceneState);
  await saveAtBoundary('give-item', currentGameState);
}

// Intimacy & Voyeurism Phase 16 (D2/D14): the apology reparation act. A
// cold-shouldering NPC who is ready to hear it ratchets one severity down
// (COLD_SHOULDER.apologyCooldownDays window). Deterministic — no LLM call
// decides whether the apology lands; the hurt state (severity, elapsed
// days, per-kind cooldown) does. Severity 3 will not even hear it until a
// gift or time drops them to 2 (apologyBlockedAboveSeverity).
async function doApologizeNpc(npcId) {
  if (!currentGameState) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  const day = currentGameState.meta.clock.day;
  const cs = coldShoulderState(npc, day);
  if (!cs.active) {
    addLogEntry('narration', `${npc.bible.name || 'They'} looks at you blankly. "What for?"`);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('apologize', currentGameState);
    return;
  }
  const res = noteColdShoulderRepair(npc, 'apology', day);
  if (!res.repaired) {
    if (res.reason === 'won_t_listen') {
      addLogEntry('narration', `${npc.bible.name || 'They'} turns away without a word. It's too soon.`);
    } else if (res.reason === 'too_soon') {
      addLogEntry('narration', `"Not now," ${npc.bible.name || 'they'} says flatly. "Just give me space."`);
    } else if (res.reason === 'cooldown') {
      addLogEntry('narration', `${npc.bible.name || 'They'} sighs. "You already said that."`);
    } else {
      addLogEntry('narration', `${npc.bible.name || 'They'} is still cold to you.`);
    }
    render(currentGameState, currentSceneState);
    await saveAtBoundary('apologize', currentGameState);
    return;
  }
  currentGameState.npcs[npcId] = applyRelDelta(npc, COLD_SHOULDER.repairRelDeltas, day);
  const them = currentGameState.npcs[npcId].bible?.name || 'They';
  addLogEntry('narration', COLD_SHOULDER.apologyLines[Math.floor(orbitalRandom() * COLD_SHOULDER.apologyLines.length)].replace('{name}', them));
  if (res.severity <= 0) {
    addLogEntry('narration', `${them} looks at you for the first time in days. "Fine. I hear you."`);
  } else if (res.severity === 1) {
    addLogEntry('narration', `${them} is still wary — but the ice is cracking.`);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('apologize', currentGameState);
}

// --- Inventory panel verbs (overhaul Phase 1) ---
// The panel's Use/Drop/Trash all emit effect-DSL lines (EAT_ITEM /
// MOVE_ITEM / DESTROY_ITEM — all `implemented: true` in EFFECT_DEFS) and
// then pay the same game time as an equivalent action chip through
// advanceAndResolveMinutes: the clock advances, needs decay exactly once
// (never twice), and the panel can never become a way to act for free.
// Phase 3: Use routes through EAT_ITEM (not CONSUME_ITEM) so food with
// `servings` is eaten one serving at a time with leftovers tracked via
// meta.servingsLeft; defs without servings behave exactly like the old
// whole-item consume, so nothing else changed.
function inventoryCtxForUi() {
  return buildInventoryCtx(currentGameState);
}

function inventoryActionQty(stack) {
  const input = document.getElementById('invp-qty');
  const requested = input ? Math.floor(Number(input.value)) : 1;
  return clamp(requested || 1, 1, stack?.qty || 1);
}

function inventoryStackLabel(stack) {
  return describeStack(stack, { day: gameDaysNow(currentGameState.meta.clock) }).label;
}

function inventoryUseNarration(stack) {
  const def = stackDef(stack);
  const c = def.consumable || {};
  const label = inventoryStackLabel(stack);
  const verb = def.category === 'drink' ? 'drink' : (c.hunger > 0 ? 'eat' : 'use');
  let line = `You ${verb} some ${label}`;
  // 2026-08-20 (playtest feedback): the inventory panel's Use verb never
  // admitted when eating was a mistake, unlike the Eat chip's narration —
  // so a frozen pizza read as "You eat some Frozen Pizza." with no hint of
  // the D28 mood ding, and raw eggs read as a plain non-event. Mirror
  // DEFS.ACTIONS' eatNarration here.
  const fresh = freshnessState(stack, gameDaysNow(currentGameState?.meta?.clock), null);
  const cold = fresh?.frozenState === 'frozen' || fresh?.frozenState === 'thawing';
  if (cold && !stackFrozenFood(stack)) {
    line += ', straight from the freezer — a miserable mouthful';
  } else if (def.rawDangerous && verb === 'eat') {
    line += ', raw — your stomach files a protest';
  }
  const extra = c.energy > 0 ? ' — it perks you up.' : (c.mood > 0 ? ' — that hits the spot.' : '.');
  return line + extra;
}

async function applyInventoryVerb(effectLine, minutes, narration, reason) {
  const ctx = inventoryCtxForUi();
  applyEffects(parseEffectDSL(effectLine), ctx);
  await advanceAndResolveMinutes(minutes);
  if (narration) addLogEntry('narration', narration);
  render(currentGameState, currentSceneState);
  await saveAtBoundary(reason, currentGameState);
}

async function doInventoryUse(defId) {
  if (!currentGameState) return;
  const stack = (currentGameState.player.inventory || []).find(s => s.defId === defId);
  if (!stack) return;
  const ctx = inventoryCtxForUi();
  if (!stackActions(stack, ctx).use) { addLogEntry('system', "You can't use that."); return; }
  const def = stackDef(stack);
  // Phase 3: EAT_ITEM is serving-aware — for multi-serving food the qty
  // input means SERVINGS eaten, so using a pizza eats a slice and leaves
  // the rest; single-serving defs behave exactly like the old CONSUME_ITEM.
  const qty = inventoryActionQty(stack);
  const minutes = INVENTORY_TUNING.useTimeMinutes[def.category] ?? INVENTORY_TUNING.useTimeMinutes._default;
  await applyInventoryVerb(`EAT_ITEM ${defId} ${qty} player`, minutes, inventoryUseNarration(stack), 'inventory-use');
}

async function doInventoryDrop(defId) {
  if (!currentGameState) return;
  const stack = (currentGameState.player.inventory || []).find(s => s.defId === defId);
  if (!stack) return;
  const ctx = inventoryCtxForUi();
  if (!stackActions(stack, ctx).drop) { addLogEntry('system', "You can't drop that here."); return; }
  const floor = Object.values(ctx.roomObjects).find(o => o.defId === 'floor');
  if (!floor) { addLogEntry('system', "There's nowhere to set that down in this room."); return; }
  const qty = inventoryActionQty(stack);
  const label = inventoryStackLabel(stack);
  await applyInventoryVerb(
    `MOVE_ITEM ${defId} ${qty} player ${floor.id}`,
    INVENTORY_TUNING.dropMinutes,
    `You set the ${label}${qty > 1 ? ` ×${qty}` : ''} down on the floor here.`,
    'inventory-drop'
  );
}

async function doInventoryTrash(defId) {
  if (!currentGameState) return;
  const stack = (currentGameState.player.inventory || []).find(s => s.defId === defId);
  if (!stack) return;
  const ctx = inventoryCtxForUi();
  if (!stackActions(stack, ctx).trash) { addLogEntry('system', "You can't trash that."); return; }
  const qty = inventoryActionQty(stack);
  const label = inventoryStackLabel(stack);
  await applyInventoryVerb(
    `DESTROY_ITEM ${defId} ${qty} player`,
    INVENTORY_TUNING.trashMinutes,
    `You throw the ${label}${qty > 1 ? ` ×${qty}` : ''} away.`,
    'inventory-trash'
  );
}

async function doInventoryPlace(defId) {
  if (!currentGameState) return;
  const stack = (currentGameState.player.inventory || []).find(s => s.defId === defId);
  if (!stack) return;
  const ctx = inventoryCtxForUi();
  if (!stackActions(stack, ctx).place) { addLogEntry('system', "You can't place that here."); return; }
  const objDef = OBJECT_DEFS[defId];
  if (!objDef) { addLogEntry('system', "That can't be placed."); return; }
  const roomId = currentGameState.player.location;
  const roomName = ROOMS[roomId]?.name || roomId;
  // Two effect lines in one batch: the shipped ITEM_DEFS stack leaves the
  // bag (DESTROY_ITEM) and the matching OBJECT_DEFS instance spawns into
  // the current room's bucket (SPAWN_OBJECT) — the mutation routes through
  // applyEffects like every other verb, then pays the clock once.
  await applyInventoryVerb(
    `DESTROY_ITEM ${defId} 1 player\nSPAWN_OBJECT ${defId} ${roomId}`,
    INVENTORY_TUNING.placeMinutes,
    `You unbox the ${objDef.label} and set it up in the ${roomName}.`,
    'inventory-place'
  );
}

// --- Container transfers (overhaul Phase 2) ---
// The shared two-panel chest UI's verbs. Take/Put move one stack (the
// selected one) between the open container and the bag; Take All / Put All
// move every transferable stack on that side. All of them emit MOVE_ITEM
// effect-DSL lines through applyEffects (mutation stays on the EFFECTS
// path) and then pay INVENTORY_TUNING.containerVerbMinutes once per batch
// through advanceAndResolveMinutes — same "act, then decay exactly once"
// rule as the inventory verbs, so the chest can never outrun the clock.
function containerCtxForUi() {
  return buildInventoryCtx(currentGameState);
}

function openContainerObject(objId) {
  if (!currentGameState || !objId) return null;
  return findObjectById(currentGameState, objId);
}

function containerLabel(obj) {
  const def = OBJECT_DEFS[obj?.defId];
  return def?.container?.label || def?.label || 'Container';
}

function containerTransferQty(stack) {
  const input = document.getElementById('ctr-qty');
  const requested = input ? Math.floor(Number(input.value)) : 1;
  return clamp(requested || 1, 1, stack?.qty || 1);
}

function containerStackLabel(stack) {
  return describeStack(stack, { day: gameDaysNow(currentGameState.meta.clock) }).label;
}

async function applyContainerVerb(lines, minutes, narration, reason) {
  const effects = lines.map(line => parseEffectDSL(line)[0]).filter(Boolean);
  if (effects.length === 0) return;
  const ctx = containerCtxForUi();
  applyEffects(effects, ctx);
  await advanceAndResolveMinutes(minutes);
  if (narration) addLogEntry('narration', narration);
  render(currentGameState, currentSceneState);
  await saveAtBoundary(reason, currentGameState);
}

async function doContainerTransfer(objId, defId, direction) {
  if (!currentGameState) return;
  const obj = openContainerObject(objId);
  if (!obj) return;
  const ctx = containerCtxForUi();
  // The chest must be in the room the player is standing in — the chips
  // only ever render in-room containers, but a stale ctrObjId (e.g. a
  // panel left open across an action that changed rooms) must not let the
  // trusted MOVE_ITEM path reach an out-of-room object.
  if (!ctx.roomObjects[objId]) { addLogEntry('system', "You can't reach that from here."); return; }
  const from = direction === 'take' ? objId : 'player';
  const to = direction === 'take' ? 'player' : objId;
  const srcList = direction === 'take' ? containerStacks(obj) : (currentGameState.player.inventory || []);
  const stack = srcList.find(s => s.defId === defId);
  if (!stack) { addLogEntry('system', "That isn't there anymore."); return; }
  if (direction === 'put' && !stackActions(stack, ctx).transfer) {
    addLogEntry('system', "You can't put that away.");
    return;
  }
  const qty = containerTransferQty(stack);
  const label = containerStackLabel(stack);
  const name = containerLabel(obj);
  // Intimacy & Voyeurism Phase 4 (D11): a capacity-capped container (the
  // wardrobe) refuses a Put that would overflow it. One check, shared by
  // the single Put and Put All — wardrobePutCheck (ITEMS) is the pure
  // source of truth so the node harness can test the same math.
  if (direction === 'put') {
    const cap = wardrobePutCheck(obj, defId, qty);
    if (cap.capacity != null && !cap.ok) {
      if (cap.remaining <= 0) {
        addLogEntry('system', `The ${name} is full (${cap.used}/${cap.capacity}).`);
      } else {
        addLogEntry('system', `The ${name} only has ${cap.remaining} slot${cap.remaining === 1 ? '' : 's'} left (${cap.used}/${cap.capacity}).`);
      }
      return;
    }
  }
  await applyContainerVerb(
    transferPlan(from, to, defId, qty),
    INVENTORY_TUNING.containerVerbMinutes,
    direction === 'take'
      ? `You take the ${label}${qty > 1 ? ` ×${qty}` : ''} from the ${name}.`
      : `You put the ${label}${qty > 1 ? ` ×${qty}` : ''} into the ${name}.`,
    `container-${direction}`
  );
}

async function doContainerTransferAll(objId, direction) {
  if (!currentGameState) return;
  const obj = openContainerObject(objId);
  if (!obj) return;
  const ctx = containerCtxForUi();
  if (!ctx.roomObjects[objId]) { addLogEntry('system', "You can't reach that from here."); return; }
  const from = direction === 'take' ? objId : 'player';
  const to = direction === 'take' ? 'player' : objId;
  const srcList = direction === 'take' ? containerStacks(obj) : (currentGameState.player.inventory || []);
  const lines = [];
  const moved = [];
  let blocked = 0;
  // Intimacy & Voyeurism Phase 4 (D11): Put All respects the wardrobe's
  // capacity — it moves what fits, in stack order, and leaves the rest.
  let capacity = null;
  let used = 0;
  let cap = null;
  if (direction === 'put') {
    cap = wardrobePutCheck(obj, null, 0);
    capacity = cap.capacity;
    used = cap.used;
  }
  for (const stack of srcList) {
    if (!(stack?.qty > 0)) continue;
    if (direction === 'put' && !stackActions(stack, ctx).transfer) continue;
    if (direction === 'put' && capacity != null) {
      const room = Math.max(0, capacity - used);
      if (room <= 0) { blocked += stack.qty; continue; }
      const take = Math.min(stack.qty, room);
      used += take;
      if (take < stack.qty) blocked += stack.qty - take;
      lines.push(...transferPlan(from, to, stack.defId, take));
      moved.push(`${containerStackLabel(stack)}${take > 1 ? ` ×${take}` : ''}`);
      continue;
    }
    lines.push(...transferPlan(from, to, stack.defId, stack.qty));
    moved.push(`${containerStackLabel(stack)}${stack.qty > 1 ? ` ×${stack.qty}` : ''}`);
  }
  if (lines.length === 0) {
    const name = containerLabel(obj);
    if (blocked > 0) {
      addLogEntry('system', `The ${name} is full (${cap.used}/${cap.capacity}) — nothing in your bag fits.`);
    } else {
      addLogEntry('system', direction === 'take' ? 'There is nothing to take.' : 'Nothing in your bag can be put away.');
    }
    return;
  }
  const name = containerLabel(obj);
  let narration = direction === 'take'
    ? `You clear everything out of the ${name}: ${moved.join(', ')}.`
    : `You empty your bag into the ${name}: ${moved.join(', ')}.`;
  if (blocked > 0) narration += ` ${blocked} item${blocked === 1 ? '' : 's'} didn't fit and stayed in your bag.`;
  await applyContainerVerb(
    lines,
    INVENTORY_TUNING.containerVerbMinutes,
    narration,
    `container-${direction}-all`
  );
}

// --- Grocery auto-transfer (food-overhaul Phase 1, D19) ---
// The doormat's "Auto-Transfer to Storage" verb: one click sorts the whole
// delivery into the kitchen by storage class — short-shelf perishables and
// drinks → fridge, freezer items → freezer, long-shelf dry/canned →
// pantry — instead of hand-carrying each stack one at a time. The plan is
// ITEMS' sortIntoStorage (pure, deterministic); this handler just turns the
// plan into MOVE_ITEM effect-DSL lines and pays the usual one
// containerVerbMinutes batch, so the mutation still rides applyEffects and
// the clock like every other transfer. Stacks with no storage class (the
// non-food part of an order) stay on the doormat and are called out.
async function doAutoTransferFromDoormat(objId) {
  if (!currentGameState) return;
  const obj = openContainerObject(objId);
  if (!obj || obj.defId !== 'doormat') return;
  const ctx = containerCtxForUi();
  if (!ctx.roomObjects[objId]) { addLogEntry('system', "You can't reach that from here."); return; }
  const plan = sortIntoStorage(currentGameState, obj.contents);
  const lines = [];
  const byTarget = new Map();
  for (const p of plan.placed) {
    lines.push(...transferPlan(objId, p.objId, p.defId, p.qty));
    const label = containerStackLabel(p);
    const arr = byTarget.get(p.objId) || [];
    arr.push(`${label}${p.qty > 1 ? ` ×${p.qty}` : ''}`);
    byTarget.set(p.objId, arr);
  }
  if (lines.length === 0) {
    addLogEntry('system', 'Nothing on the doormat can be sorted into the kitchen.');
    return;
  }
  const destNames = [];
  for (const [destId, labels] of byTarget) {
    const dest = openContainerObject(destId);
    destNames.push(`${containerLabel(dest)}: ${labels.join(', ')}`);
  }
  let narration = `You sort the delivery straight into the kitchen — ${destNames.join('; ')}.`;
  if (plan.unplaced.length > 0) {
    narration += ` ${plan.unplaced.map(u => containerStackLabel(u)).join(', ')} stayed on the doormat.`;
  }
  await applyContainerVerb(lines, INVENTORY_TUNING.containerVerbMinutes, narration, 'container-auto-transfer');
  renderContainerPanel(currentGameState);
}

// --- Rot-mess cleanup (inventory overhaul Phase 4) ---
// The container panel's "throw out the spoiled food" button. A mess is the
// container's `rotten_food: 'rotten'` state, written by the daily spoilage
// pass. This reverses that one write and pays ROT.clearMessMinutes — the same
// act-then-decay-once rule as every other verb, so clearing a mess is never a
// free action. Since perception plan Phase 2 the room's smell is DERIVED from
// that state, so there is no second write to reverse and none to forget.
async function doClearContainerMess(objId) {
  if (!currentGameState) return;
  const obj = openContainerObject(objId);
  if (!obj || obj.state?.rotten_food !== 'rotten') return;
  const ctx = containerCtxForUi();
  if (!ctx.roomObjects[objId]) { addLogEntry('system', "You can't reach that from here."); return; }
  const name = containerLabel(obj);
  const roomId = obj.bucket.replace(/^room_/, '');
  // The container state routes through applyEffects (SET_OBJECT_STATE) so
  // player-driven mutation stays on the effects path. Perception plan Phase 2
  // (D10): that single write is now the whole job — the room-level odor flag
  // this used to have to clear alongside it is gone, because the smell is
  // derived from the container state rather than mirrored beside it.
  applyEffects([parseEffectDSL(`SET_OBJECT_STATE ${objId} rotten_food none`)[0]].filter(Boolean), ctx);
  refreshRoomCleanliness(currentGameState, roomId);
  addLogEntry('narration', `You throw out the spoiled food and wipe down the ${name.toLowerCase()}.`);
  await advanceAndResolveMinutes(ROT.clearMessMinutes);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('container-clear-mess', currentGameState);
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
    // Merge only the memory fields back — compactMemory captured the
    // npc snapshot before its LLM call, so spreading the whole object
    // would clobber any in-memory needs/location/clothing changes the
    // clock loop made during that call.
    currentGameState.npcs[id] = { ...currentGameState.npcs[id], memory: compacted.memory };
  }
}

// --- Plan X-5 Phase 2: the Assessor -------------------------------------
// The only source of relationship movement from conversation, now that the
// writing pass has stopped scoring itself (D5). It judges a WINDOW of
// exchanges after they have happened, never a single message: per-message
// scoring multiplies any small optimistic bias by every exchange in the game,
// which is monotonic inflation regardless of what the player does.
//
// Same shape as compactMemoryIfNeeded above, for the same reason (D6): a
// deferred model call that piggybacks on player contact and never runs on a
// pure tick. It fires on two triggers and no others —
//   * a scene closing (doMove, once openScene has actually incremented), and
//   * a scene that reaches X5.assessorMaxExchanges without the player leaving,
// which are D2's primary and early-flush windows.
//
// Not on room entry (D17): those beats carry near-zero relational content and
// would spend a full-price call on a predictably empty window.

// One pass at a time. Two overlapping passes would judge overlapping windows
// — the second reads the buffer at its own await-resume and would mark
// entries the first is still judging, so the same exchanges move a
// relationship twice. Rapid moves make this reachable, not theoretical.
let assessorInFlight = false;

// Judge one closed window. Returns true if anything actually moved, so the
// caller can decide whether a re-render is worth it.
async function runAssessorPass(sceneId) {
  if (!currentGameState || assessorInFlight) return false;
  const win = assessorWindow(currentGameState, { sceneId });
  if (win.npcIds.length === 0) return false;
  assessorInFlight = true;
  try {
    // `win`, never `window` — the browser's global has no npcIds, so passing
    // it makes every pass a silent "empty window" no-op that still marks the
    // buffer judged. That is invisible from the outside: the conversation
    // looks judged and no relationship ever moves.
    const result = await callAssessor(currentGameState, win);
    let moved = false;
    if (result.ok && Object.keys(result.deltas).length > 0) {
      // D4 — through the existing door. toProposalDeltas has already clamped
      // and filtered to the roster, so this validate is belt and braces; it
      // is also the thing that would catch a future retune of X5.deltaClamp
      // past what validateProposal accepts, rather than silently applying it.
      const context = x5ProposalContext(currentGameState, win.npcIds);
      const { valid, errors } = validateProposal({ relationshipDeltas: result.deltas }, context);
      if (valid) {
        await applyProposal({ relationshipDeltas: result.deltas }, context, currentGameState, null);
        moved = true;
      } else {
        console.warn('Assessor proposal failed validation:', errors);
      }
    }
    // D14 — the window is marked judged whether the pass succeeded, judged
    // nothing, or failed outright. An unmarked window is a window that gets
    // read again by the next pass, and a relationship that moves twice for
    // one conversation is worse than one that occasionally fails to move.
    for (const id of win.npcIds) {
      const npc = currentGameState.npcs[id];
      if (npc) currentGameState.npcs[id] = markAssessed(npc, win.sceneId);
    }
    return moved;
  } finally {
    assessorInFlight = false;
  }
}

// D2's early flush: a conversation that goes on long enough in one room is
// judged where it stands and starts a fresh window, so a whole evening at the
// kitchen table is not scored as one undifferentiated block at the end of it.
// markAssessed is what starts the new window — the judged entries drop out of
// assessorWindow and the count restarts from zero.
async function assessSceneIfFull() {
  if (!currentGameState) return false;
  const win = assessorWindow(currentGameState);
  if (!win.full) return false;
  return await runAssessorPass(win.sceneId);
}

// --- Plan X-5 Phase 3: the Chronicler ------------------------------------
// The only route conversation has into the belief tier, now that the writing
// pass has stopped writing memory (D5). Where the Assessor judges a ROOM, this
// reads a DAY per character (D3): facts extract more accurately from more
// context, and a wider window dedupes for free — a thing raised three times in
// one evening is one fact, not three.
//
// Two triggers, mirroring the Assessor's:
//   * day rollover, for every NPC carrying unprocessed exchanges, and
//   * an NPC whose unprocessed count reaches X5.chroniclerMaxExchanges,
// which are D3's primary and early-flush windows. Rollover is not a
// player-contact path, and does not need to be: it is already a wait, which
// is the exception D6 names.

// Same reason as assessorInFlight, and a separate flag because the two passes
// are independent — one must not be able to block the other. Two overlapping
// Chronicler passes would each mark entries the other is still reading, and
// the same conversation would be extracted twice into the same tier.
let chroniclerInFlight = false;

// Extract one NPC's unread transcript. Returns true if anything was actually
// written, so the caller can decide whether a re-render is worth it.
async function runChroniclerPass(npcId) {
  if (!currentGameState || chroniclerInFlight) return false;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return false;
  const win = chroniclerWindow(npc);
  if (win.entries.length === 0) return false;
  chroniclerInFlight = true;
  try {
    const result = await callChronicler(currentGameState, npcId, win);
    let wrote = false;
    if (result.ok && Object.keys(result.additions).length > 0) {
      // D4 — through the existing door. The context holds ONLY this NPC:
      // the Chronicler's window is per-NPC by construction, and everyone
      // else who was in the room runs their own pass over their own buffer.
      // Handing it a wider roster would re-open applyProposal's overhearing
      // leg on a room that closed hours ago.
      const context = x5ProposalContext(currentGameState, [npcId]);
      const { valid, errors } = validateProposal({ memoryAdditions: result.additions }, context);
      if (valid) {
        await applyProposal({ memoryAdditions: result.additions }, context, currentGameState, null);
        wrote = true;
      } else {
        console.warn('Chronicler proposal failed validation:', errors);
      }
    }
    // D14 — marked whether the pass wrote something, wrote nothing, or failed
    // outright. Re-read from state first: applyProposal replaced the record.
    const after = currentGameState.npcs[npcId];
    if (after) currentGameState.npcs[npcId] = markProcessed(after, win.entries.length);
    return wrote;
  } finally {
    chroniclerInFlight = false;
  }
}

// D3's early flush: an NPC the player has been talking to all evening is read
// where they stand rather than waiting for midnight. It also stops the window
// hitting the ceiling MEMORY_BUDGET.maxRecent imposes — past that the buffer
// shifts its oldest entry out and an exchange is lost before this pass ever
// sees it, which is the accepted cost of not opening a second buffer.
async function chronicleIfFull() {
  if (!currentGameState) return false;
  let wrote = false;
  for (const npcId of Object.keys(currentGameState.npcs || {})) {
    if (!chroniclerWindow(currentGameState.npcs[npcId]).full) continue;
    if (await runChroniclerPass(npcId)) wrote = true;
  }
  return wrote;
}

// D3's primary trigger. Every NPC with anything unread, once per day. The
// facts land stamped with the day that has just BEGUN rather than the one the
// conversation happened on — applyProposal writes episodes from
// meta.clock.day and cannot be told otherwise, so both halves agree at the
// cost of a day's optimism in salience, well inside rumination's 7-day window.
async function chronicleDayRollover() {
  if (!currentGameState) return;
  for (const npcId of Object.keys(currentGameState.npcs || {})) {
    if (chroniclerWindow(currentGameState.npcs[npcId]).entries.length === 0) continue;
    await runChroniclerPass(npcId);
  }
}

// syncNpcsFromKv used to live here: it pulled the NPCs an applied LLM
// proposal touched back out of kv. It has no callers left — applyProposal
// (NPC) now mutates gameState.npcs in memory instead of round-tripping
// through kv, so there is nothing to pull back, and re-reading kv would
// actively clobber the clock loop's in-memory changes with a stale
// snapshot. Deleted rather than left as a landmine for the next caller who
// assumes it's still the way to refresh an NPC.

// --- Orchestration functions ---

// Actions reachable with no active game — precisely the ones the menu
// modal offers when currentGameState is null. Without this allowlist the
// blanket "no game, no action" guard below made New Game/Continue
// permanently unreachable: they're only ever clicked from a screen that
// only appears when currentGameState IS null, so the guard fired every
// time, before the switch below ever ran.
const MENU_ACTIONS = ['menu', 'new-game-solo', 'new-game-random', 'new-game-guided', 'new-game-manual', 'new-game-seed', 'generate-cast', 'reroll-char', 'approve-cast', 'back-to-form', 'continue', 'debug', 'debug-close',
  // Save system v2 (Phase 9): reachable with no active game — the save/load
  // menu is the recovery surface the boot screen (Phase 10) builds on.
  'save-menu', 'load-menu', 'save-quick', 'load-quick', 'save-close',
  'save-slot', 'load-slot', 'save-overwrite', 'save-delete',
  'save-export', 'save-import',
  // Menu overhaul Phase 10: the main-menu component's own verbs — all meta,
  // reachable at boot (no game) and from the in-play pause menu.
  'menu.continue', 'menu.new-game', 'menu.load', 'menu.options',
  'menu.resume', 'menu.exit', 'menu.back', 'menu.prev', 'menu.next',
  'menu.debug', 'options.bg-art',
  // Sandbox mode (Seasonal Calendar & Sandbox plan B4/B5): title-screen route into
  // the config sub-screen, its Start/Back verbs, and the B5 roommate-builder verbs
  // (add/remove/reorder/design-appearance/skipProse) plus the player-design
  // entry — all pre-game meta, so they must be reachable with currentGameState null.
  // 'sandbox.roommate-toggle' (the old accordion expand/collapse) was retired
  // by the Sandbox Pre-Game Editor Overhaul Phase 5 — 'sandbox.roommate-select'
  // below replaced it with rail-select semantics (an open question the plan
  // left for this phase to resolve either way; this is the "retire outright"
  // branch, not a reuse).
  'menu.sandbox', 'sandbox.start', 'sandbox.back',
  // F1 (Discord feedback, 2026-08-23): New Game's gameplay-options step —
  // pre-game meta, same reachability as the Sandbox verbs right above.
  'newgame-options.start', 'newgame-options.back',
  'sandbox.player-design', 'sandbox.roommate-add', 'sandbox.roommate-remove',
  'sandbox.roommate-move', 'sandbox.roommate-design',
  'sandbox.roommate-skip',
  'sandbox.house-preset', 'sandbox.house-structural',
  // Sandbox Pre-Game Editor Overhaul Phase 1 (D4/D5): the tab shell's own
  // verbs — switching the top-level tab, switching a static sub-tab strip
  // (House's Layout/Facilities), and the generic toggle row kind's write.
  'sandbox.tab', 'sandbox.subtab', 'sandbox.row-toggle',
  // Sandbox Pre-Game Editor Overhaul Phase 4 (D7): the Economy & Difficulty
  // tab's preset row — stamps all four economy fields at once.
  'sandbox.difficulty-preset',
  // Sandbox Pre-Game Editor Overhaul Phase 5 (D3): the Roommates rail's own
  // verbs — opening/leaving a roommate's five sub-tabs and switching which
  // one is shown.
  'sandbox.roommate-select', 'sandbox.roommate-subtab',
  // Settings & Pause Overhaul Phase 2 (D2): the tabbed settings sub-screen's
  // verbs — meta, reachable from the boot options row and the pause context
  // alike, free at any energy. Rows carry their target as data-field and
  // share 'settings.toggle'/'settings.cycle'. (Phase 4: 'options.autosave'
  // retired with the boot row — autosave now lives in the General tab.
  // Phase 5: the six 'prefs.*' actions retired with the boot toggles —
  // population distribution + pairing allowlist now live in the Population
  // tab, and the slider grids' nudge buttons dispatch 'set.population-dist'
  // with data-field/data-key/data-delta.)
  'settings.open', 'settings.tab', 'settings.back',
  'settings.toggle', 'settings.cycle', 'set.population-dist',
  // Settings & Pause Overhaul Phase 7 (D9): the Images tab's verbs — the
  // style grid's tiles ('set.image-style'), the Custom phrase field
  // ('set.custom-style', shared with the input's own write-through) and the
  // cache-control button ('images.clear-cache', confirmed in the modal).
  'set.image-style', 'set.custom-style', 'images.clear-cache',
  // Settings & Pause Overhaul Phase 8 (D10): the Appearance tab's verbs —
  // the theme grid's tiles ('set.theme', extra.key is the COLOR_THEMES id).
  'set.theme',
  // Settings & Pause Overhaul Phase 9 (D11): the Data tab's verbs — Export
  // opens the save panel (reusing its per-card Export buttons), Import
  // opens the import modal, 'data.reset' wipes kv after a confirm, and
  // 'data.storage' re-queries the storage insight in place.
  'set.export-save', 'set.import-save', 'data.reset', 'data.storage',
  // Settings & Pause Overhaul Phase 10 (D12): the header game-speed
  // cluster — a meta preset switch (session-local), clickable whenever the
  // header exists. extra.id is the SPEED_PRESETS id (x0/x1/x20/x100).
  'speed.set',
  // Player creation + intro plan (Phases 3-5): the studio and the cutscene
  // are pre-game surfaces by definition — they run BEFORE a game exists, so
  // every one of their verbs must be reachable with currentGameState null.
  'studio.tab', 'studio.toggle', 'studio.row-add', 'studio.row-remove',
  'studio.roll-all', 'studio.clear-all', 'studio.cancel', 'studio.confirm',
  'studio.portrait-generate', 'studio.portrait-reset',
  'intro.advance', 'intro.back', 'intro.skip'];

// Actions that can be performed even when energy is at 0. Travel ('move')
// must always be allowed — if the player can't reach their bedroom they're
// stuck with no way to sleep. 'sleep' is the recovery action. 'look' is free
// observation. Menu/save/debug actions are meta, not in-world actions.
const ENERGY_GATE_EXEMPT = new Set([
  'move', 'sleep', 'look', 'pay-bills',
  // Bug report (2026-08-24): nap restores energy exactly like sleep does
  // (self.nap's effects include ADJUST_NEED player energy), so gating it
  // behind energy > 0 was a soft-lock — at 0 energy the ONLY escape hatch
  // was full Sleep, even though Nap exists specifically as its quicker
  // alternative. Same reasoning as 'sleep' above.
  'self.nap',
  // Door handling is a one-minute mechanical act, not exertion — and the
  // unlock from outside must always be reachable, or an exhausted player
  // who locked their own door at 0 energy could never get back in to sleep.
  'door.unlock', 'self.unlock_door', 'self.lock_door',
  'menu', 'save', 'debug', 'debug-close',
  'new-game-solo', 'new-game-random', 'new-game-guided', 'new-game-manual', 'new-game-seed',
  'generate-cast', 'reroll-char', 'approve-cast', 'back-to-form', 'continue',
  'computer.close',
  // 2026-08-17 audit (B6): delivering a finished gig is a ZERO-cost collect
  // (deliverGig spends no energy), so it must not be energy-gated — the
  // old gate let you complete the work but not cash it in at 0 energy.
  'gig.deliver',
  // Inventory overhaul Phase 1: opening/closing the bag is free browsing
  // (zero game time), so it must not be energy-gated; the verbs inside it
  // (inventory.use/drop/trash) are NOT exempt and stay gated like any
  // other action.
  'inventory.open', 'inventory.close',
  // Full floor plan overlay (desktop legibility): the map overlay is free
  // browsing (zero game time), same rule as the bag and chests.
  'floorplan.open', 'floorplan.close',
  'floorplan.zoom-in', 'floorplan.zoom-out', 'floorplan.zoom-reset',
  // Inventory overhaul Phase 2: same rule for containers — opening a
  // chest to browse is free, the transfer verbs inside it
  // (container.take/put/take-all/put-all) are NOT exempt.
  'container.open', 'container.close',
  // Save system v2 (Phase 9): save/load/menu are meta actions, not
  // in-world actions — free at any energy level.
  'save-menu', 'load-menu', 'save-quick', 'load-quick', 'save-close',
  'save-slot', 'load-slot', 'save-overwrite', 'save-delete',
  'save-export', 'save-import',
  // Menu overhaul Phase 10: the menu itself is a meta surface — meta actions
  // are free at any energy level, and its verbs (Continue/New Game/Load/
  // Options/Exit/arrows) must be clickable even exhausted.
  'menu', 'menu.continue', 'menu.new-game', 'menu.load', 'menu.options',
  'menu.resume', 'menu.exit', 'menu.back', 'menu.prev', 'menu.next',
  'menu.debug', 'options.bg-art',
  // Sandbox mode (B4/B5): the config sub-screen and the roommate builder are
  // pre-game meta — free at any energy, reachable with no game.
  // 'sandbox.roommate-toggle' retired in favor of 'sandbox.roommate-select'
  // below — see the matching MENU_ACTIONS comment.
  'menu.sandbox', 'sandbox.start', 'sandbox.back',
  // F1 (Discord feedback, 2026-08-23): New Game's gameplay-options step —
  // pre-game meta, same reachability as the Sandbox verbs right above.
  'newgame-options.start', 'newgame-options.back',
  'sandbox.player-design', 'sandbox.roommate-add', 'sandbox.roommate-remove',
  'sandbox.roommate-move', 'sandbox.roommate-design',
  'sandbox.roommate-skip',
  // D11 fix (Sandbox Pre-Game Editor Overhaul plan): these two were the only
  // sandbox verbs missing from this list, alongside the other nine above.
  'sandbox.house-preset', 'sandbox.house-structural',
  // Sandbox Pre-Game Editor Overhaul Phase 1: the tab shell's own verbs.
  'sandbox.tab', 'sandbox.subtab', 'sandbox.row-toggle',
  // Sandbox Pre-Game Editor Overhaul Phase 4: the Economy & Difficulty
  // preset row — pre-game meta, free at any energy like the rest.
  'sandbox.difficulty-preset',
  // Sandbox Pre-Game Editor Overhaul Phase 5: the Roommates rail's own verbs.
  'sandbox.roommate-select', 'sandbox.roommate-subtab',
  'settings.open', 'settings.tab', 'settings.back',
  'settings.toggle', 'settings.cycle', 'set.population-dist',
  'set.image-style', 'set.custom-style', 'images.clear-cache',
  'set.theme',
  // Settings & Pause Overhaul Phase 9 (D11): data management is meta —
  // free at any energy, reachable with no game.
  'set.export-save', 'set.import-save', 'data.reset', 'data.storage',
  // Settings & Pause Overhaul Phase 10 (D12): switching game speed is a
  // zero-cost meta preset, like pausing — free at any energy.
  'speed.set',
  // Same reasoning as the menu's own verbs, one step further: the studio and
  // cutscene run before any player exists to be exhausted. The gate reads
  // currentGameState.player.energy, which is null on these surfaces.
  'studio.tab', 'studio.toggle', 'studio.row-add', 'studio.row-remove',
  'studio.roll-all', 'studio.clear-all', 'studio.cancel', 'studio.confirm',
  'studio.portrait-generate', 'studio.portrait-reset',
  'intro.advance', 'intro.back', 'intro.skip',
]);

function isActionExemptFromEnergyGate(action) {
  if (ENERGY_GATE_EXEMPT.has(action)) return true;
  // Computer use itself is OK (you can sit at the desk), but individual
  // energy-costing computer apps will check separately. Let it through
  // so the player can at least open the computer.
  if (action === 'computer.use' || action.startsWith('computer.open')) return true;
  // Phone actions are trivial (pickup/drop/plug) and Phase 3's phone.use
  // must be glanceable regardless of exhaustion — same rationale as
  // computer.use above.
  if (action.startsWith('phone.')) return true;
  // D17: the scene-art info/reroll controls are viewing tools, not actions —
  // exhaustion never blocks reading a prompt or rerolling art.
  if (action === 'scene.image-info' || action === 'scene.image-reroll') return true;
  return false;
}

// --- Nested action navigation (D14) --------------------------------
// The chips row itself is the menu. A group chip ("X ▸", data-group-key)
// drills INTO the row — the other buttons disappear, a "‹" chip appears
// first, and tapping it walks back up. Routing lives here because clicks
// arrive through the global delegation; the stack itself is owned by
// RENDER (_actionNavStack + openActionGroup/navigateActionBack/resetActionNav),
// which is what actually re-renders the chips. Nothing floats over the
// page anymore — submenu verbs are ordinary [data-action] chips carrying
// the parent's context (data-room-id/data-npc/data-obj-id), so they flow
// through the delegation chain exactly like any flat chip.

async function handleAction(action, npcId, extra) {
  if (!currentGameState && !MENU_ACTIONS.includes(action)) return;

  // Energy gate: when energy is at 0, block all energy-costing actions
  // except travel and sleep. The player must be able to reach their bedroom
  // to sleep — blocking travel would leave them stranded.
  if (currentGameState && currentGameState.player.energy <= 0 && !isActionExemptFromEnergyGate(action)) {
    addLogEntry('system', "You're too exhausted to do that. You need to sleep first.");
    render(currentGameState, currentSceneState);
    return;
  }

  // Registered actions (ACTIONS/DEFS.ACTIONS) are dispatched by data lookup
  // rather than a switch case — this is the bridge for verbs already
  // ported (eat/cook/shower/watch_tv/relax; see DEFS.ACTIONS for why the
  // rest aren't yet). Checked before the switch so a ported verb's id never
  // needs a case here at all.
  // Intimacy & Voyeurism Phase 10 (D6/D7): the door's peek/listen verbs are
  // holds, not discrete actions — intercepted here, before the registered-
  // action bridge, and handed to the PEEK session controller (peek.js),
  // which runs the timed loop against the continuous clock. The door
  // submenu row carries the adjacent room as data-room-id, which arrives
  // here as `npcId` by the chips' existing convention.
  if (action === 'door.keyhole' || action === 'door.listen') {
    const roomId = npcId || extra?.roomId;
    if (!roomId) return;
    // Intimacy & Voyeurism Phase 19 (sound): headphones suppress the listen
    // hold entirely — a wearer hears nothing through the door, so the hold
    // has nothing to report (the door-cue/listen system reads through
    // perceiveSignals, which already filters the wearer's audio channel).
    // Peeking is sight, so the keyhole still works.
    if (action === 'door.listen' && wearsSoundBlocking(currentGameState, 'player')) {
      addLogEntry('narration', 'Your headphones are on. Through the door you hear precisely nothing.');
      return;
    }
    await startPeekSession(roomId, action === 'door.listen' ? 'listen' : 'peek');
    return;
  }
  // door.unlock — the one door verb that works from the OUTSIDE. The door
  // lives in the ADJACENT room (the room you're locked out of), not the one
  // the player is standing in, so it can't flow through the registered-
  // action bridge's current-room context — intercepted here, the same
  // pattern as door.keyhole, carrying the adjacent room as data-room-id.
  if (action === 'door.unlock') {
    const roomId = npcId || extra?.roomId;
    if (!roomId) return;
    await doUnlockDoorFromOutside(roomId);
    return;
  }
  // Intimacy & Voyeurism Phase 17 (D13): the sleeping-room verbs — same
  // interception pattern as the door's peek/listen. The bed submenu row
  // carries the sleeping resident as data-npc, which arrives here as
  // `npcId`; the flow is gate → advance (chunked minutes, same as the
  // heartbeat) → apply → narrate → save. The handler reads the SHORT actId
  // (BOUNDARY_ACT_DEFS keys are 'sleep_with'/'sleep_watch'), so the
  // 'boundary.' prefix is stripped here.
  if (action === 'boundary.sleep_with' || action === 'boundary.sleep_watch') {
    await doBoundarySleepRoom(action.split('.').pop(), npcId);
    return;
  }
  // Intimacy & Voyeurism Phase 17 (D14): the three-way act. It IS an
  // ACTION_DEFS row (source kind 'paired', which actionSourceMatches rejects
  // so it never surfaces as a flat chip), so the registered-action bridge
  // BELOW would swallow it — but no part of it is meant to go through
  // executeAction (there is no timeCost/effects/narration on the row, only
  // the gate + apply flow). Intercepted here, before the bridge, exactly
  // like the sleeping-room verbs above.
  if (action === 'boundary.throuple') {
    await doBoundaryThrouple();
    return;
  }
  // Phase 1 (D5): a submenu verb that is a thin wrapper over an existing
  // hand-written handler (`delegate`) routes through the same bridge — e.g.
  // door.open → move, door.knock → knock. The popover row carries the
  // parent's room context in extra.roomId; knock/peep take the roomId as
  // their npcId argument by the chips' existing convention.
  const delegated = ACTION_DEFS[action]?.delegate;
  if (delegated) {
    await handleAction(delegated, npcId || extra?.roomId || null, extra);
    return;
  }
  if (ACTION_DEFS[action]) {
    // `extra` rides through as opts — the Phase 11 Make-a-Move flow sets
    // extra.targetNpcId so the act's `paired` block knows who is in it with
    // the player (executeAction reads opts.targetNpcId into ctx.actTargetNpcId
    // before any requirement runs).
    await runRegisteredAction(action, extra);
    return;
  }

  switch (action) {
    case 'look':
      await doLookAround();
      break;
    case 'scene.image-info':
      openSceneImageInfo();
      break;
    case 'scene.image-reroll':
      await doRerollImageInfo();
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
      doComputerOpenScreen(extra?.appId, extra?.screenId, extra?.device);
      break;
    case 'computer.window-close':
      doComputerWindowClose(extra?.appId);
      break;
    case 'computer.window-minimize':
      doComputerWindowMinimize(extra?.appId);
      break;
    case 'computer.window-maximize':
      doComputerWindowMaximize(extra?.appId);
      break;
    case 'computer.taskbar-click':
      doComputerTaskbarClick(extra?.appId);
      break;
    case 'computer.toggle-start':
      doComputerToggleStart();
      break;
    case 'computer.gig-work-block':
      await doGigWorkBlock(extra?.rowId, extra?.device);
      break;
    case 'phone.open':
      await doPhoneOpen();
      break;
    case 'phone.close':
      await doPhoneClose();
      break;
    case 'phone.open-app':
      await doPhoneOpenApp(extra?.appId);
      break;
    case 'phone.back':
      await doPhoneGoBack();
      break;
    case 'phone.home':
      await doPhoneGoHome();
      break;
    case 'phone.settings-dnd':
      await doPhoneSettingsDnd();
      break;
    case 'phone.settings-passcode':
      await doPhoneSettingsPasscode();
      break;
    case 'phone.tracker-screen':
      await doPhoneTrackerScreen(extra?.screenId);
      break;
    case 'phone.tracker-dismiss':
      await doPhoneTrackerDismiss(extra?.key);
      break;
    case 'phone.tracker-snooze':
      await doPhoneTrackerSnooze(extra?.key, extra?.days);
      break;
    case 'phone.set-alarm':
      await doSetAlarm(extra?.amount);
      break;
    case 'phone.clear-alarm':
      await doSetAlarm(null);
      break;
    case 'phone.camera-take':
      await doPhoneTakePhoto();
      break;
    case 'phone.camera-view':
      await doPhoneCameraView(extra?.rowId);
      break;
    case 'phone.camera-share':
      await doPhoneCameraShare(extra?.rowId, npcId);
      break;
    // Intimacy & Voyeurism Phase 15 (D8): the codex app's verbs — open a
    // per-NPC page, and spend knowledge via Confront / Spread / Matchmake.
    // All four are phone/computer-shared (the same renderer + handler path
    // the other apps use); the screen navigation is device-parameterised
    // exactly like computer.open-screen.
    case 'codex.open-npc':
      doCodexOpenNpc(npcId, extra?.device);
      break;
    case 'codex.confront':
      await doConfrontNpc(npcId, extra?.index);
      break;
    case 'codex.spread':
      await doSpreadSecret(npcId, extra?.index);
      break;
    case 'codex.matchmake':
      await doMatchmakeNpc(npcId, extra?.index);
      break;
    case 'gig.accept':
      await doGigAccept(extra?.rowId);
      break;
    case 'gig.deliver':
      await doGigDeliver(extra?.rowId);
      break;
    case 'gig.abandon':
      await doGigAbandon(extra?.rowId);
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
    case 'home.add-to-cart':
      await doHomeAddToCart(extra?.rowId);
      break;
    case 'home.remove-from-cart':
      await doHomeRemoveFromCart(extra?.rowId);
      break;
    case 'home.checkout':
      await doHomeCheckout();
      break;
    case 'home.place-room':
      await doHomePlaceRoom(extra?.roomId);
      break;
    case 'home.place-item':
      await doHomePlaceItem(extra?.rowId);
      break;
    case 'home.place-commit':
      await doHomePlaceCommit();
      break;
    case 'home.place-cancel':
      await doHomePlaceCancel();
      break;
    case 'home.place-select':
      await doHomePlaceSelect(extra?.objId);
      break;
    case 'home.place-pickup':
      await doHomePlacePickup(extra?.objId);
      break;
    case 'home.place-snap':
      await doHomePlaceToggleSnap();
      break;
    case 'grocery.add-to-cart':
      await doGroceryAddToCart(extra?.rowId);
      break;
    case 'grocery.remove-from-cart':
      await doGroceryRemoveFromCart(extra?.rowId);
      break;
    case 'grocery.set-tip':
      await doGrocerySetTip(extra?.amount);
      break;
    case 'grocery.checkout':
      await doGroceryCheckout(extra?.device);
      break;
    case 'recipes.open-detail':
      doRecipesOpenDetail(extra?.rowId, extra?.device);
      break;
    case 'recipes.add-to-cart':
      await doRecipesAddToCart(extra?.rowId);
      break;
    case 'recipes.planner-add':
      await doRecipesPlannerAdd(extra?.device);
      break;
    case 'recipes.planner-remove':
      await doRecipesPlannerRemove(extra?.rowId);
      break;
    case 'recipes.planner-fill-cart':
      await doRecipesPlannerFillCart();
      break;
    case 'browser.visit':
      await doBrowserVisit(extra?.rowId, extra?.device);
      break;
    case 'browser.back':
      doBrowserBack();
      break;
    case 'browser.forward':
      doBrowserForward();
      break;
    case 'browser.ah-category':
      doAfterHoursCategory(extra?.rowId);
      break;
    case 'browser.ah-search':
      doAfterHoursSearch(extra?.searchText || '');
      break;
    case 'browser.ah-page':
      doAfterHoursPage(extra?.direction || 1);
      break;
    case 'browser.ah-watch':
      await doAfterHoursWatch(extra?.rowId, extra?.device);
      break;
    case 'browser.ah-refresh':
      doAfterHoursRefresh();
      break;
    case 'browser.ah-host':
      doAfterHoursHost(extra?.source);
      break;
    case 'browser.ah-close':
      doAfterHoursClose();
      break;
    case 'browser.ah-masturbate':
      doAfterHoursMasturbate(extra?.device);
      break;
    case 'browser.ah-cum':
      await doAfterHoursCum();
      break;
    case 'browser.ah-stop':
      doAfterHoursStop();
      break;
    case 'classes.enroll':
      await doClassesEnroll(extra?.rowId);
      break;
    case 'classes.attend-lesson':
      await doAttendLesson(extra?.rowId);
      break;
    case 'services.hire':
      await doServicesHire(extra?.rowId);
      break;
    case 'services.cancel':
      await doServicesCancel(extra?.rowId);
      break;
    case 'services.maid-save':
      await doMaidSave();
      break;
    case 'food.open-restaurant':
      doFoodOpenRestaurant(extra?.rowId, extra?.device);
      break;
    case 'food.add-to-cart':
      await doFoodAddToCart(extra?.rowId);
      break;
    case 'food.remove-from-cart':
      await doFoodRemoveFromCart(extra?.rowId);
      break;
    case 'food.clear-cart':
      await doFoodClearCart();
      break;
    case 'food.set-tip':
      await doFoodSetTip(extra?.amount);
      break;
    case 'food.filter-service':
      doFoodFilterService(extra?.service);
      break;
    case 'food.place-order':
      await doFoodPlaceOrder(extra?.device);
      break;
    case 'escorts.view-profile':
      doEscortViewProfile(extra?.rowId, extra?.device);
      break;
    case 'escorts.book':
      await doEscortBook(extra?.rowId, extra?.device);
      break;
    case 'escort.request-service':
      if (npcId && extra?.rowId) await doEscortRequestService(npcId, extra.rowId);
      break;
    case 'classifieds.post':
      await doClassifiedsPost();
      break;
    case 'classifieds.view-applicant':
      doClassifiedsViewApplicant(extra?.rowId);
      break;
    case 'classifieds.view-stub':
      await doClassifiedsViewStub(extra?.rowId);
      break;
    case 'classifieds.filter-toggle':
      doClassifiedsFilterToggle(extra?.rowId);
      break;
    case 'classifieds.sort':
      doClassifiedsSort(extra?.rowId);
      break;
    case 'classifieds.fetch-stub':
      await doClassifiedsFetchStub(extra?.rowId);
      break;
    case 'classifieds.open-queue':
      doClassifiedsOpenQueue();
      break;
    case 'classifieds.clear-filters':
      doClassifiedsClearFilters();
      break;
    case 'classifieds.accept':
      await doClassifiedsAccept(extra?.rowId, extra?.roomId);
      break;
    case 'classifieds.assign-room':
      doClassifiedsAssignRoom(extra?.rowId, extra?.roomId);
      break;
    case 'classifieds.reject':
      await doClassifiedsReject(extra?.rowId);
      break;
    case 'classifieds.studio-toggle-pool':
      doClassifiedsStudioTogglePool(extra?.rowId);
      break;
    case 'classifieds.studio-edit-pool':
      doClassifiedsStudioEditPool(extra?.rowId);
      break;
    case 'classifieds.studio-set-mode':
      doClassifiedsStudioSetMode(extra?.rowId);
      break;
    case 'classifieds.studio-set-tab':
      doClassifiedsStudioSetTab(extra?.rowId);
      break;
    case 'classifieds.studio-edit-toggle':
      doClassifiedsStudioEditToggle();
      break;
    case 'classifieds.studio-edit-discard':
      doClassifiedsStudioEditDiscard();
      break;
    case 'classifieds.studio-save-edits':
      doClassifiedsStudioSaveEdits();
      break;
    case 'classifieds.studio-create':
      await doClassifiedsStudioCreate();
      break;
    case 'classifieds.studio-clear':
      doClassifiedsStudioClear();
      break;
    case 'classifieds.studio-ai-generate':
      await doClassifiedsStudioAIGenerate();
      break;
    case 'classifieds.interview':
      doClassifiedsInterview(extra?.rowId);
      break;
    case 'classifieds.toggle-favorite':
      doClassifiedsToggleFavorite(extra?.rowId);
      break;
    case 'classifieds.toggle-fav-filter':
      doClassifiedsToggleFavFilter();
      break;
    case 'im.open-thread':
      doImOpenThread(extra?.rowId);
      break;
    case 'im.send':
      await doImSend(extra?.rowId, extra?.device);
      break;
    case 'stream.watch':
      await doStreamWatch(extra?.rowId, extra?.device);
      break;
    case 'bills.pay':
      await doBillsPay(extra?.rowId);
      break;
    case 'bills.pay-all':
      await doBillsPayAll();
      break;
    case 'bills.toggle-autopay':
      await doBillsToggleAutopay(extra?.rowId);
      break;
    case 'upgrades.purchase':
      await doUpgradePurchase(extra?.rowId);
      break;
    case 'upgrades.book-confirm':
      await doUpgradeBook(extra?.rowId);
      break;
    case 'upgrades.book-structural':
      await doBookStructural(extra?.rowId);
      break;
    case 'upgrades.repair':
      await doUpgradeRepair(extra?.rowId);
      break;
    case 'upgrades.snap-photo':
      await doUpgradesSnapPhoto(extra?.rowId);
      break;
    case 'invest.buy':
      await doInvestBuy(extra?.rowId, extra?.amount);
      break;
    case 'invest.sell-all':
      await doInvestSellAll(extra?.rowId);
      break;
    case 'taxes.toggle-reserve':
      await doTaxToggleAutoReserve();
      break;
    case 'taxes.pay':
      await doTaxPayBill(extra?.amount);
      break;
    case 'taxes.withdraw-reserve':
      await doTaxWithdrawReserve(extra?.amount);
      break;
    case 'talk':
      if (npcId) await doTalk(npcId);
      break;
    // Intimacy & Voyeurism Phase 11 (D3): Make a Move — the player's mirror
    // of the NPC intimacy overture. The chip is offered once when someone is
    // present; doMakeAMove picks a partner (when several are present) and an
    // act, then runs the chosen act through the registered-action pipeline
    // with ctx.actTargetNpcId set — the willingness gate (same threshold,
    // same refusal prose as the NPC side) is that act's requirement.
    case 'make_a_move':
      await doMakeAMove(npcId);
      break;
    // Intimacy & Voyeurism Phase 18 (D16): the player's "trying" toggle.
    case 'pregnancy.start-trying':
      if (npcId) await doPregnancySetTrying(npcId, true);
      break;
    case 'pregnancy.stop-trying':
      if (npcId) await doPregnancySetTrying(npcId, false);
      break;
    case 'ask-contact':
      if (npcId) await doAskContact(npcId);
      break;
    case 'im.invite':
      if (extra?.rowId) await doInviteOver(extra.rowId);
      break;
    case 'invite-dinner':
      if (npcId) await doInviteDinner(npcId);
      break;
    case 'im.invite-dinner':
      if (extra?.rowId) await doInviteDinner(extra.rowId);
      break;
    case 'step-away':
      if (npcId) await doStepAway(npcId);
      break;
    case 'pay-rent':
      await doPayRent();
      break;
    case 'pay-bills':
      await doPayBillsFromWorld();
      break;
    case 'ask-to-leave':
      if (npcId) await doAskToLeave(npcId);
      break;
    case 'peep':
      if (npcId) await doPeep(npcId);
      break;
    case 'knock':
      if (npcId) await doKnock(npcId);
      break;
    // Initiative plan Phase 4: the two channels an NPC opens that the player
    // has no existing verb to answer (D8).
    case 'overture.accept':
      if (npcId) await doOvertureRespond(npcId, true);
      break;
    case 'overture.decline':
      if (npcId) await doOvertureRespond(npcId, false);
      break;
    case 'search-room':
      if (npcId) await doSearchRoom(npcId);
      break;
    case 'search-phone':
      if (npcId) await doSearchPhone(npcId);
      break;
    case 'write-note':
      openWriteNoteModal();
      break;
    case 'confirm-write-note':
      await doWriteNote();
      break;
    case 'give-item':
      if (npcId) await doGiveItem(npcId);
      break;
    // Intimacy & Voyeurism Phase 16 (D2/D14): the apology reparation act —
    // a cold-shouldering NPC's hurt state decides whether it lands (see
    // doApologizeNpc). Never a door into intimacy: it only ratchets the
    // cold-shoulder severity down, and the intimacy floor stays a floor.
    case 'apologize':
      if (npcId) await doApologizeNpc(npcId);
      break;
    case 'inventory.open':
      openInventoryPanel();
      break;
    case 'inventory.close':
      closeInventoryPanel();
      break;
    case 'inventory.use':
      if (extra.defId) await doInventoryUse(extra.defId);
      break;
    case 'inventory.drop':
      if (extra.defId) await doInventoryDrop(extra.defId);
      break;
    case 'inventory.trash':
      if (extra.defId) await doInventoryTrash(extra.defId);
      break;
    case 'inventory.place':
      if (extra.defId) await doInventoryPlace(extra.defId);
      break;
    case 'container.open':
      if (extra.objId) openContainerPanel(currentGameState, extra.objId);
      break;
    case 'container.close':
      closeContainerPanel();
      break;
    case 'container.take':
    case 'container.put':
      if (extra.objId && extra.defId) await doContainerTransfer(extra.objId, extra.defId, action === 'container.take' ? 'take' : 'put');
      break;
    case 'container.take-all':
      if (extra.objId) await doContainerTransferAll(extra.objId, 'take');
      break;
    case 'container.put-all':
      if (extra.objId) await doContainerTransferAll(extra.objId, 'put');
      break;
    case 'container.auto-transfer':
      if (extra.objId) await doAutoTransferFromDoormat(extra.objId);
      break;
    case 'container.clear-mess':
      if (extra.objId) await doClearContainerMess(extra.objId);
      break;
    case 'move':
      if (extra?.roomId) await doMove(extra.roomId);
      break;
    // Full floor plan overlay (desktop legibility): meta/browsing actions —
    // opening the big map, zooming it, closing it — free at any energy.
    case 'floorplan.open':
      openFloorPlanOverlay();
      break;
    case 'floorplan.close':
      closeFloorPlanOverlay();
      break;
    case 'floorplan.zoom-in':
      floorPlanZoom(1.25);
      break;
    case 'floorplan.zoom-out':
      floorPlanZoom(1 / 1.25);
      break;
    case 'floorplan.zoom-reset':
      floorPlanZoomReset();
      break;
    case 'save':
      // Phase 9: Save now opens the slot grid (save mode) instead of
      // silently overwriting the single live folder set.
      openSaveMenu('save');
      break;
    case 'save-menu':
      openSaveMenu('save');
      break;
    case 'load-menu':
      openSaveMenu('load');
      break;
    case 'save-close':
      closeSaveMenu();
      break;
    case 'save-quick':
      await doQuickSave();
      break;
    case 'load-quick':
      await doLoadQuick();
      break;
    case 'save-slot':
      if (extra.slotId) await doSaveToSlot(extra.slotId);
      break;
    case 'save-overwrite':
      if (extra.slotId) await doOverwriteSlot(extra.slotId);
      break;
    case 'load-slot':
      if (extra.slotId) await doLoadFromSlot(extra.slotId);
      break;
    case 'save-delete':
      if (extra.slotId) await doDeleteSlot(extra.slotId);
      break;
    case 'save-export':
      if (extra.slotId) await doExportSlot(extra.slotId);
      break;
    case 'save-import':
      openImportModal();
      break;
    case 'menu':
      // Menu overhaul Phase 10: the header Menu button opens the pause
      // context of the main-menu component (same slideshow, Resume added,
      // game clock paused). The boot menu is reached via showMainMenu.
      showMainMenu('pause');
      break;
    case 'menu.continue':
      await doMenuContinue();
      break;
    case 'menu.new-game':
      // Player creation + intro plan (D2). This used to open
      // showCharCreationModal('random') — the legacy form whose "Number of
      // Roommates" select defaults to 2, which meant New Game handed the
      // player a pre-populated household and quietly contradicted the solo
      // start the whole rent economy is built on (ECONOMY.opening.soloStart,
      // and startSoloGame, which existed but was reachable from no button).
      // The route is now studio → cutscene → startSoloGame. The old modal is
      // still reachable from the debug panel, where a pre-populated house is
      // genuinely useful for testing.
      openPlayerStudio();
      break;
    case 'menu.sandbox':
      // Sandbox mode (B4): opens the config sub-screen directly — the studio,
      // the cutscene and startSoloGame's solo path are all bypassed. The
      // config screen stays a sibling of the title; Start (sandbox.start) is the
      // single route into startSandboxGame, which calls closeMainMenu itself.
      doMenuSandbox();
      break;
    case 'sandbox.start':
      await startSandboxGame(pendingSandboxConfig);
      break;
    case 'sandbox.back':
      showMenuScreen('title');
      break;
    // F1 (Discord feedback, 2026-08-23): New Game's gameplay-options step.
    // A standalone overlay sibling of #player-studio (see main.html), not
    // part of showMenuScreen's managed set — the title screen underneath
    // was never hidden for this flow (closeMainMenu doesn't fire until
    // startSoloGame actually begins), so Back only needs to close this
    // screen, same as the Studio's own Cancel.
    case 'newgame-options.start':
      doNewGameOptionsStart();
      break;
    case 'newgame-options.back':
      doNewGameOptionsBack();
      break;
    case 'sandbox.player-design':
      openSandboxPlayerStudio();
      break;
    case 'sandbox.roommate-add':
      doSandboxRoommateAdd();
      break;
    case 'sandbox.roommate-remove':
      doSandboxRoommateRemove(extra.index);
      break;
    case 'sandbox.roommate-move':
      doSandboxRoommateMove(extra.index, extra.direction ?? 1);
      break;
    case 'sandbox.roommate-select':
      doSandboxRoommateSelect(extra.index);
      break;
    case 'sandbox.roommate-subtab':
      doSandboxRoommateSubtab(extra.tab);
      break;
    case 'sandbox.roommate-design':
      doSandboxRoommateDesign(extra.index);
      break;
    case 'sandbox.roommate-skip':
      doSandboxRoommateSkip(extra.index);
      break;
    case 'sandbox.house-preset':
      doSandboxHousePreset(extra.id);
      break;
    case 'sandbox.house-structural':
      doSandboxHouseStructural(extra.id);
      break;
    case 'sandbox.tab':
      if (extra.tab && SANDBOX_TABS.some((t) => t.id === extra.tab)) sandboxActiveTab = extra.tab;
      renderSandboxUi();
      break;
    case 'sandbox.subtab':
      doSandboxSubtab(extra.tab);
      break;
    case 'sandbox.row-toggle':
      doSandboxRowToggle(extra.field);
      break;
    case 'sandbox.difficulty-preset':
      doSandboxDifficultyPreset(extra.id);
      break;
    case 'menu.load':
      openSaveMenu('load');
      break;
    case 'menu.options':
      doMenuOpenOptions();
      break;
    case 'settings.open':
      // Opens the tabbed settings screen. The boot row's "Cast & more
      // settings…" carries no tab (→ last remembered, default General);
      // callers that want a specific tab pass extra.tab (Phase 2 has none
      // yet — later phases' entries may).
      openSettingsScreen(extra.tab || undefined);
      break;
    case 'settings.tab':
      rememberSettingsTab(extra.tab);
      if (extra.clearFilter) {
        settingsFilter = '';
        const filterInput = document.getElementById('settings-filter-input');
        if (filterInput) filterInput.value = '';
      }
      renderSettingsUi();
      break;
    case 'settings.back':
      closeSettingsScreen();
      break;
    case 'settings.toggle':
      if (extra.field) await doSettingsToggle(extra.field);
      break;
    case 'settings.cycle':
      if (extra.field) await doSettingsCycle(extra.field);
      break;
    case 'menu.resume':
      doMenuResume();
      break;
    case 'menu.exit':
      await doExitGame();
      break;
    case 'menu.back':
      showMenuScreen('title');
      break;
    case 'menu.prev':
      titlePrev();
      break;
    case 'menu.next':
      titleNext();
      break;
    case 'menu.debug':
      toggleDebugPanel();
      break;
    case 'menu.cheats':
      doMenuCheats();
      break;
    case 'cheats.back':
      doCheatsBack();
      break;
    case 'cheats.tab':
      doCheatsTab(extra.tab);
      break;
    case 'options.bg-art':
      await doToggleBgArt();
      break;
    case 'speed.set':
      // Phase 10 (D12): a header speed-cluster button. extra.id is the
      // SPEED_PRESETS id. setSpeed is session-local and getTimeScale reads
      // the multiplier live every frame, so the click takes effect on the
      // next clock frame — only the cluster's active-state highlight needs
      // refreshing here.
      if (extra.id) {
        setSpeed(extra.id);
        if (typeof renderSpeedButtons === 'function') renderSpeedButtons();
      }
      break;
    case 'set.population-dist':
      // Phase 5 (D13/D14): the Population tab's proportional slider grids.
      // extra carries data-field (genderDist|raceDist), data-key (the
      // changed identity/race) and data-delta (nudge step); the range and
      // number inputs call doPopulationDist directly (they're inputs, not
      // actions). Pins the changed key, re-balances the rest to 100, and
      // writes through setSettings (D2 immediate-apply).
      await doPopulationDist(extra);
      break;
    case 'set.image-style':
      // Phase 7 (D9): a style-grid tile click. extra.key is the style id
      // ('none' or an IMAGE_STYLES id incl. the '__custom' sentinel).
      if (extra.key) await doSetImageStyle(extra.key);
      break;
    case 'set.custom-style':
      // Phase 7 (D9): the Custom phrase field. Its input writes through
      // directly (no re-render, so focus survives); this case exists so the
      // row's action id is real (design invariant 1) and so the phrase can
      // be set programmatically too.
      if (typeof extra.value === 'string') await doSetCustomStyle(extra.value);
      break;
    case 'set.theme':
      // Phase 8 (D10): an Appearance-tab theme tile. extra.key is the
      // COLOR_THEMES id; setSettings persists it and applyTheme() re-skins
      // the UI chrome live (data-theme on <html>), so the selection sticks
      // and nothing needs re-rendering.
      if (extra.key) await doSetTheme(extra.key);
      break;
    case 'images.clear-cache':
      // Phase 7 (D9): wipe the image LRU + menu ring, after a confirm —
      // regeneration spends image quota again, so it must be deliberate.
      {
        const ok = await askConfirm(
          'Delete every cached generated image? Scenes, portraits, photos and the boot-menu slideshow will regenerate on demand — each one spends image generation quota again.',
          'Clear cache'
        );
        if (ok && typeof clearImageCache === 'function') await clearImageCache();
      }
      break;
    // --- Data tab (Phase 9, D11) ---
    case 'set.export-save':
      // The Data tab's Export row opens the save panel so the player can
      // pick a slot — every occupied card already carries its own Export
      // button ('save-export' → doExportSlot → showExportModal).
      openSaveMenu('load');
      break;
    case 'set.import-save':
      // The Data tab's Import row — the same modal the save panel uses.
      openImportModal();
      break;
    case 'data.reset':
      // Reset all data: wipe every kv folder (saves + images + settings +
      // the live playthrough) after a confirm, then boot clean. resetAllData
      // is deliberate — nothing here is recoverable.
      {
        const ok = await askConfirm(
          'Delete EVERYTHING this game stores in your browser — every save slot, every cached image, and all settings (theme, text size, cast distribution, SFW mode, image style)? This cannot be undone.',
          'Reset all data'
        );
        if (ok && typeof resetAllData === 'function') await resetAllData();
      }
      break;
    case 'data.storage':
      // Re-query the storage insight in place (no pane rebuild — the fill
      // is async, so the row's Refresh button just re-runs it).
      if (typeof refreshStorageReadout === 'function') refreshStorageReadout();
      break;
    case 'new-game-solo':
      await startSoloGame();
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

    // --- Player Design studio (player creation + intro plan, Phases 3-4) ---
    case 'studio.tab':
      doStudioTab(extra.rowId);
      break;
    case 'studio.toggle':
      doStudioToggle(extra.rowId);
      break;
    case 'studio.row-add':
      doStudioRowAdd(extra.rowId);
      break;
    case 'studio.row-remove':
      doStudioRowRemove(extra.rowId);
      break;
    case 'studio.roll-all':
      doStudioRollAll();
      break;
    case 'studio.clear-all':
      doStudioClearAll();
      break;
    case 'studio.cancel':
      doStudioCancel();
      break;
    case 'studio.confirm':
      doStudioConfirm();
      break;
    case 'studio.portrait-generate':
      await doStudioPortraitGenerate();
      break;
    case 'studio.portrait-reset':
      doStudioPortraitReset();
      break;

    // --- The opening cutscene (Phase 5) ---
    case 'intro.advance':
      doIntroAdvance();
      break;
    case 'intro.back':
      doIntroBack();
      break;
    case 'intro.skip':
      doIntroSkip();
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
    case 'conv.send':
      await doConvSend();
      break;
    case 'conv.leave':
      doConvLeave();
      break;
    case 'conv.ask-leave':
      doConvAskLeave();
      break;
    case 'conv.confirm-ask-leave':
      await doConvConfirmAskLeave(npcId);
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
  // Energy gate for free-text: if energy is 0, only allow the intent to
  // resolve to a travel or sleep command. Everything else is blocked.
  if (currentGameState.player.energy <= 0) {
    const intent = classifyIntent(actionText, currentGameState);
    if (intent?.kind === 'move' || (intent?.kind === 'quick' && intent.quickId === 'sleep')) {
      // Fall through to the normal resolver below
    } else {
      addLogEntry('system', "You're too exhausted to do that. You need to sleep first.");
      render(currentGameState, currentSceneState);
      return;
    }
  }
  // Try to resolve free text deterministically before ever touching the
  // LLM (P5). Each branch delegates to the exact function a chip/button
  // would call — same effects, same persistence, same render — so this is
  // purely a routing shortcut, not a second implementation of any of them.
  const intent = classifyIntent(actionText, currentGameState);
  if (intent?.kind === 'registered') { await runRegisteredAction(intent.actionId); return; }
  if (intent?.kind === 'move') { await doMove(intent.roomId); return; }
  if (intent?.kind === 'quick' && intent.quickId === 'sleep') { await doSleep(); return; }
  if (intent?.kind === 'quick' && intent.quickId === 'pay-rent') { await doPayRent(); return; }
  if (intent?.kind === 'quick' && intent.quickId === 'alarm') { await doSetAlarm(intent.hour); return; }

  showLoading();
  try {
    await advanceAndResolve(1);

    // Assemble context
    const context = assembleContext(currentGameState, currentSceneState);

    // Call LLM
    const result = await callLLM(context, actionText);

    if (result.valid && result.proposal) {
      // Apply proposal, then pull back only the NPCs it touched
      const applied = await applyProposal(result.proposal, context, currentGameState, actionText);
      for (const entry of applied.logEntries) addLogEntry(entry.type, entry.text, entry.speaker);
      // Piggyback compaction on this player-contact call, never on a pure tick.
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
    } else {
      // Fallback narration
      addLogEntry('narration', `You ${actionText.toLowerCase()}.`);
    }

    // Decay player needs
    currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);

    render(currentGameState, currentSceneState);
    // D6 — after the response has rendered, never before it. D2's early
    // flush: only fires once this scene has accumulated a full window.
    if (await assessSceneIfFull()) render(currentGameState, currentSceneState);
    // D3's early flush, on a window twice as wide — so this costs a call on
    // one turn in ten, not one in five.
    await chronicleIfFull();
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
    // Intimacy & Voyeurism Phase 15 (D8): an 'intimate' event the player
    // walked in on is witnessed knowledge — one ledger entry per participant
    // (the other party named), so the codex's Confront verb can say "I saw
    // you with X". seenByPlayer marks it once, so the write happens exactly
    // once per event.
    //
    // Code-review fix: also accepts 'content_collab' now that tryIntimatePair
    // stamps event.type with the real driveId instead of always 'intimate'
    // (vocation plan D19) — walking in on a collab shoot is still a real "I
    // saw you with X" moment worth the same witnessed-knowledge entry, and
    // now that the two event types are distinguishable, this is the one
    // place that deliberately treats them the same on purpose rather than by
    // accident.
    if ((evt.type === 'intimate' || evt.type === 'content_collab') && currentGameState.npcs[evt.npcId]) {
      const other = evt.data && evt.data.other;
      const day = typeof evt.day === 'number' ? evt.day : currentGameState.meta.clock.day;
      notePlayerWitnessedEntry(currentGameState, evt.npcId, 'saw_with_X', day, roomId, {
        otherNpcId: other && currentGameState.npcs[other] ? other : null,
      });
      if (other && currentGameState.npcs[other]) {
        notePlayerWitnessedEntry(currentGameState, other, 'saw_with_X', day, roomId, { otherNpcId: evt.npcId });
      }
    }
  }
}

async function doLookAround() {
  showLoading();
  try {
    const roomId = currentGameState.player.location;
    const room = currentGameState.world.rooms[roomId] || {};
    const present = getPresentNpcIds(currentGameState.npcs, roomId);
    let desc = `You are in ${roomPhrase(roomId)}. `;
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
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 2 * CLOCK.tickMinutes, currentGameState);
    addLogEntry('narration', 'You wait a while. Time passes.');
    render(currentGameState, currentSceneState);
    await saveAtBoundary('wait', currentGameState);
  } finally {
    hideLoading();
  }
}

// Phase 8: set or clear the alarm. The alarm caps the night — it can
// only shorten sleep, never extend it. Setting it to null clears it.
// The hour must be within SLEEP.alarmMinHour..alarmMaxHour.
async function doSetAlarm(hour) {
  if (hour === null || hour === undefined) {
    currentGameState.player.alarm = null;
    addLogEntry('system', 'Alarm cleared. You\'ll wake when your body wakes you.');
  } else {
    hour = Math.max(SLEEP.alarmMinHour, Math.min(SLEEP.alarmMaxHour, hour));
    currentGameState.player.alarm = hour;
    addLogEntry('system', `Alarm set for ${formatHour12(hour)}. If you\'re still asleep then, it\'ll wake you.`);
  }
  render(currentGameState, currentSceneState);
  await saveAtBoundary('alarm', currentGameState);
}

async function doSleep() {
  showLoading();
  try {
    pushTimeContext('sleeping');
    // How long the night runs is decided by how drained the player is —
    // see SLEEP and resolveSleepHours. Turning in exhausted buys a full
    // 8 hours; turning in nearly rested is a short 6.
    const energyAtBedtime = currentGameState.player.energy;
    // Phase 8: the alarm caps the night — it can only shorten sleep,
    // never extend it. If the alarm would fire before the natural night
    // ends, the player is woken early and recovers less energy.
    // BrineOS 6.4: a dead phone can't ring. This checks live battery at
    // the moment of falling asleep, not at the moment the alarm was set —
    // player.alarm (the preference) is untouched either way, so plugging
    // the phone in tomorrow restores it without the player re-setting it.
    const found = findPhoneObject(currentGameState);
    const phoneDead = !!found && getPhoneBattery(currentGameState) <= 0
      && !isPhoneCharging(currentGameState, found.obj, found.bucket);
    const alarmHour = phoneDead ? null : currentGameState.player.alarm;
    const bedtimeMinutes = currentGameState.meta.clock.minutes;
    const energyMax = currentGameState.player.energyMax || NEEDS.energy.max;
    const { hours: sleepHours, alarmFired } = resolveSleepHoursWithAlarm(energyAtBedtime, bedtimeMinutes, alarmHour, energyMax);
    const sleepTicks = Math.round((sleepHours * 60) / CLOCK.tickMinutes);
    // Asleep is a vulnerable state for the whole batch — see ACTIONS'
    // withVulnerableState and SIM's getPlayerVulnerableState.
    const sleepEvents = await withVulnerableState(currentGameState, 'sleeping', () => advanceAndResolve(sleepTicks));
    // Decay player needs for the time spent sleeping (hunger, hygiene,
    // mood — energy is restored separately below). advanceAndResolve
    // only decays NPC needs, not the player's. `sleeping: true` slows the
    // hunger clock (SLEEP.hungerMultiplier) so a good night doesn't
    // dump you from "dinner" to "starving" by morning (2026-08-17 audit
    // B3); nothing else in the decay is scaled.
    currentGameState.player = decayPlayerNeeds(currentGameState.player, sleepTicks * CLOCK.tickMinutes, currentGameState, { sleeping: true });
    // Energy back is proportional to hours actually slept, so a night cut
    // short (by the alarm) genuinely leaves you short.
    // Phase 8: energy is capped at player.energyMax (which starts at 70
    // and grows), not NEEDS.energy.max (the absolute cap of 100).
    // food-overhaul Phase 2 (D4): a deficit day slows sleep recovery and a
    // surplus day nudges it up — the ledger's energy bridge.
    const balanceMult = currentGameState.player.meta?.energyBalance === 'deficit' ? METABOLISM.deficitEnergyRestoreMult
      : currentGameState.player.meta?.energyBalance === 'surplus' ? METABOLISM.surplusEnergyRestoreMult : 1;
    currentGameState.player.energy = Math.min(
      energyMax,
      currentGameState.player.energy + sleepHours * SLEEP.restorePerHour * balanceMult
    );
    // Phase 8: sleeping near the natural bedtime grows the energy
    // ceiling. A "good sleep" is within ENERGY.goodSleepWindowHours of
    // SLEEP.naturalBedtimeHour. This is the main early-game progression
    // lever — more energy means more work blocks, which means more income.
    const bedtimeHour = (bedtimeMinutes / 60) % 24;
    const hoursFromNatural = Math.min(
      Math.abs(bedtimeHour - SLEEP.naturalBedtimeHour),
      24 - Math.abs(bedtimeHour - SLEEP.naturalBedtimeHour)
    );
    if (hoursFromNatural <= ENERGY.goodSleepWindowHours && !alarmFired) {
      currentGameState.player.energyMax = Math.min(
        ENERGY.absoluteMax,
        energyMax + ENERGY.growthPerGoodSleep
      );
      // Phase 6 (D13): a full night on schedule, alarm-free, is the single
      // most reliable happiness event in the game — a mood impulse tied to
      // the same "good sleep" condition that grows the energy ceiling.
      pushMoodImpulse(currentGameState.player, MOOD_PAYOUTS.goodSleep, currentGameState.meta.clock.day);
    }
    let sleepMsg = describeSleep(sleepHours, currentGameState.player.energy);
    if (alarmFired) sleepMsg += ' The alarm dragged you out of bed.';
    else if (phoneDead && currentGameState.player.alarm != null) sleepMsg += ' Your phone died overnight — the alarm never went off.';
    // 2026-08-20 (playtest feedback): sleep never restores hunger — the
    // fullness window keeps draining through the night — but the sleep
    // narration only ever mentioned energy, so a player woke to "bars
    // full" + an unexplained empty stomach. Name the night's toll when it
    // actually hurt.
    const wakeBand = hungerBand(
      currentGameState.player.fullnessRemainingHours ?? 0,
      currentGameState.player.fullnessWindowHours ?? HUNGER_RHYTHM.starveHours
    );
    if (wakeBand.key === 'hungry') sleepMsg += ' You wake up hungry — the night burned through what was left of your food.';
    else if (wakeBand.key === 'very_hungry') sleepMsg += ' You wake up very hungry. Whatever you ate before bed is gone.';
    else if (wakeBand.key === 'starving') sleepMsg += ' You wake up starving. That snack was nowhere near a meal.';
    addLogEntry('narration', sleepMsg);
    // Narrate some of what happened while asleep, most recent first. Marked
    // seen so a later visit to the same room doesn't repeat it as evidence.
    for (const evt of sleepEvents.slice(-2)) {
      const npc = currentGameState.npcs[evt.npcId];
      if (npc && npc.bible.name) {
        addLogEntry('narration', `While you were asleep: ${formatEventText(evt, currentGameState.npcs)}`);
        evt.seenByPlayer = true;
      }
    }
    popTimeContext();
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
  const template = DEMOTION_BEATS[Math.floor(orbitalRandom() * DEMOTION_BEATS.length)];
  const text = template
    .replace('{name}', demotedNpc.bible.name || 'They')
    .replace('{other}', promotedNpc?.bible?.name || 'you');
  addLogEntry('narration', text);
}

// --- In-person conversation overlay ---
// A dedicated chat-like interface for talking with an NPC, separate from
// the scene viewer's narration log. doTalk opens it; conv.* actions drive
// it. The conversation persists across multiple turns until the player
// Leaves or Asks to Leave. Reuses the exact same LLM proposal pipeline
// (callLLM/applyProposal) as doPlayerAction — the difference is purely
// presentational: results render in the overlay's chat log, not the
// scene viewer's narration log.
let convState = null; // { npcId, sending }

function convEscapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function convScrollToBottom() {
  const log = document.getElementById('conv-log');
  if (log) log.scrollTop = log.scrollHeight;
}

function convAddBeat(text) {
  const log = document.getElementById('conv-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'conv-beat';
  el.textContent = text;
  log.appendChild(el);
  convScrollToBottom();
}

function convAddBubble(from, text, tag) {
  const log = document.getElementById('conv-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'conv-bubble';
  el.setAttribute('data-from', from);
  if (tag) {
    // Asks plan (D4) — an ask bubble carries a header label naming the ask
    // ("Meal Invitation", "Loan Request") above the message text. The body
    // is the CLEAN player message (the flavor after `$AskId`); the raw
    // `$RequestType` line is input syntax, never a rendered message — a
    // bare ask has no body, just the header. textContent, not innerHTML:
    // the tag is a known leaf label, but the body is player input.
    const tagEl = document.createElement('div');
    tagEl.className = 'conv-tag';
    tagEl.textContent = tag;
    el.appendChild(tagEl);
    if (text) {
      const bodyEl = document.createElement('div');
      bodyEl.className = 'conv-bubble-text';
      bodyEl.textContent = text;
      el.appendChild(bodyEl);
    }
  } else {
    el.textContent = text;
  }
  log.appendChild(el);
  convScrollToBottom();
}

// Asks plan Phase 8 — an image bubble: a dim tag (same styling as the ask
// chip), the photo, and optional caption text. Returns the <img> so an async
// photo fill can swap the placeholder for the real URL — the IM photo-thumb
// pattern from render.computer.js (a resolved promise writing to a since-
// removed <img> is a harmless no-op). textContent, never innerHTML, for
// anything that can carry player/LLM-derived text.
// F3 (Discord feedback, 2026-08-23): decides whether this turn earns a new
// illustrated panel, per the player's chosen cadence, then generates and
// paints it in. Fire-and-forget from doConvSend, like showActionMomentModal
// — a slow/failed generation should never hold up the conversation itself.
async function maybeShowConversationScene(npc) {
  const mode = settingsCache?.sceneVisualizerMode || 'off';
  if (mode === 'off' || !convState || !npc) return;
  let due = false;
  if (mode === 'everyMessage') {
    due = true;
  } else if (mode === 'everyN') {
    convState.sceneVisCount = (convState.sceneVisCount || 0) + 1;
    const opt = SCENE_VIS_EVERY_N_OPTIONS.find((o) => o.id === settingsCache.sceneVisualizerEveryN);
    const n = opt ? opt.n : 3;
    if (convState.sceneVisCount >= n) { due = true; convState.sceneVisCount = 0; }
  } else if (mode === 'mood') {
    const label = moodLabel(npc.mood);
    if (label !== convState.sceneVisLastMood) { due = true; convState.sceneVisLastMood = label; }
  }
  if (!due) return;
  const npcId = npc.id;
  const result = await generateConversationSceneImage(currentGameState, npc);
  if (!convState || convState.npcId !== npcId) return; // conversation closed/switched mid-generation
  if (result.url) convAddImageBubble('npc', result.url, '', '🎨 Scene');
}

function convAddImageBubble(from, url, text, tag) {
  const log = document.getElementById('conv-log');
  if (!log) return null;
  const el = document.createElement('div');
  el.className = 'conv-bubble conv-bubble-photo';
  el.setAttribute('data-from', from);
  if (tag) {
    const tagEl = document.createElement('div');
    tagEl.className = 'conv-tag';
    tagEl.textContent = tag;
    el.appendChild(tagEl);
  }
  const img = document.createElement('img');
  img.className = 'conv-photo';
  img.alt = '';
  img.src = url || getPlaceholder();
  el.appendChild(img);
  if (text) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'conv-bubble-text';
    bodyEl.textContent = text;
    el.appendChild(bodyEl);
  }
  log.appendChild(el);
  convScrollToBottom();
  return img;
}
// Both LLM passes of an ask turn paint through this (asks plan Phase 4): the
// player's own bubble is added by the caller, this only draws the NPC side.
function convRenderProposal(applied) {
  for (const entry of applied.logEntries || []) {
    if (entry.type === 'narration') convAddBeat(entry.text);
    else if (entry.type === 'action') convAddBubble('action', `*${entry.text}*`);
    else if (entry.type === 'internal') convAddBeat(`(${entry.text})`);
    else if (entry.type === 'dialogue') convAddBubble('npc', entry.text);
  }
}

// Scene reader plan Phase 5 (D13/D14) — draw the recalled half of the pane,
// above the separator. A projection of `recallSceneExchanges`: it decides
// nothing about what to show, it only marks everything it appends with
// [data-past] so the live half below can never be mistaken for it.
//
// Returns how many rows it drew. Zero means this is someone the player has
// never spoken to face to face — no history AND no separator, because a
// separator with nothing above it announces an absence.
// Asks plan — the clean display form of a PLAYER bubble read back from
// memory.recent. Ask turns store the raw `$AskId <flavor>` line in memory
// (the durable record); the bubble instead shows the ask's label as a header
// and the flavor as the body, mirroring doConvSend's live render. Returns
// null for anything that isn't a KNOWN ask — ordinary lines render
// verbatim, and an unknown `$Tag` (D3) stays a plain message. Call-time
// only; ui.js loads after asks.js.
function askBubbleDisplay(text) {
  if (typeof parseAskInput !== 'function' || !text) return null;
  const parsed = parseAskInput(text);
  if (!parsed) return null;
  const leaf = ASK_TYPES[parsed.askId];
  // D4 — a bare ask (or an untouched `<Optional>`, stripped to '' by
  // parseAskInput) renders the leaf's canned defaultFlavor as the body so
  // the bubble is never header-only. Same fallback doConvSend uses live, so
  // recalled and live bubbles always match. Display-only: the flavor fed to
  // decide()/the directive stays empty (D1).
  return leaf ? { label: leaf.label, body: parsed.flavor || leaf.defaultFlavor || '' } : null;
}

function convRenderRecalled(npc) {
  const log = document.getElementById('conv-log');
  if (!log) return 0;
  const rows = recallSceneExchanges(npc, currentGameState?.meta?.clock?.day);
  if (rows.length === 0) return 0;

  for (const row of rows) {
    const el = document.createElement('div');
    if (row.kind === 'time') {
      el.className = 'conv-time';
      el.textContent = row.label;
    } else if (row.kind === 'beat') {
      el.className = 'conv-beat';
      el.textContent = row.text;
    } else {
      el.className = 'conv-bubble';
      el.setAttribute('data-from', row.from);
      const askDisp = row.from === 'player' ? askBubbleDisplay(row.text) : null;
      if (askDisp) {
        const tagEl = document.createElement('div');
        tagEl.className = 'conv-tag';
        tagEl.textContent = askDisp.label;
        el.appendChild(tagEl);
        if (askDisp.body) {
          const bodyEl = document.createElement('div');
          bodyEl.className = 'conv-bubble-text';
          bodyEl.textContent = askDisp.body;
          el.appendChild(bodyEl);
        }
      } else {
        el.textContent = row.text;
      }
    }
    el.setAttribute('data-past', '');
    log.appendChild(el);
  }

  const sep = document.createElement('div');
  sep.className = 'conv-separator';
  sep.textContent = 'Now';
  log.appendChild(sep);
  return rows.length;
}

function convShowTyping() {
  const log = document.getElementById('conv-log');
  if (!log) return null;
  const el = document.createElement('div');
  el.className = 'conv-typing';
  el.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  log.appendChild(el);
  convScrollToBottom();
  return () => { if (el.parentNode) el.remove(); };
}

function convSetStatus(text) {
  const el = document.getElementById('conv-status');
  if (el) el.textContent = text || '';
}

function openConversationOverlay(npcId) {
  const npc = currentGameState?.npcs?.[npcId];
  if (!npc) return;
  const overlay = document.getElementById('conversation-overlay');
  if (!overlay) return;

  // Header
  const avatar = document.getElementById('conv-avatar');
  if (avatar) {
    avatar.textContent = (npc.bible?.name || '?').charAt(0);
    avatar.style.background = hashToColor(npc.bible?.name || npcId);
  }
  const nameEl = document.getElementById('conv-name');
  if (nameEl) nameEl.textContent = npc.bible?.name || 'Unknown';
  convSetStatus('In conversation');

  // Rebuild the log: prior exchanges, a separator, then the live conversation
  // that doConvSend is about to append (D13). This used to clear to empty and
  // stop, which is why talking to someone you had known forty in-game days
  // started from a blank box — R4 was a missing feature, not a styling pass.
  const log = document.getElementById('conv-log');
  if (log) {
    log.innerHTML = '';
    convRenderRecalled(npc);
  }

  // Show ask-to-leave only for residents
  const askBtn = document.getElementById('conv-ask-leave-btn');
  if (askBtn) askBtn.hidden = npc.residency?.status !== 'resident';

  overlay.setAttribute('data-open', '');

  // Only now can the log scroll: while the overlay was display:none it had no
  // layout, so scrollHeight was 0 and the pane would have opened at the oldest
  // recalled line instead of at the present moment.
  convScrollToBottom();

  // Focus input
  const input = document.getElementById('conv-input');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
  // Asks plan Phase 2 — a fresh conversation opens with the Request menu
  // closed and the ask hint cleared.
  closeAskMenu();
  updateAskHint();
}

function closeConversationOverlay() {
  const overlay = document.getElementById('conversation-overlay');
  if (overlay) overlay.removeAttribute('data-open');
  convState = null;
  // Asks plan Phase 2 — a closed conversation must not leave the Request
  // menu or its hint behind.
  closeAskMenu();
  updateAskHint();
  // Initiative plan Phase 3 (D9): the durable half of "in conversation". The
  // tick decides whether to open an overture and cannot see TIME's context
  // stack, so the flag lives on gameState. Cleared here rather than beside
  // every close path for the same reason getPlayerVulnerableState prefers a
  // flag over an inference — one writer on, one writer off.
  if (currentGameState?.player?.flags) delete currentGameState.player.flags._inConversation;
}

// --- Asks plan Phase 2: the Request-tree menu. The tree renders from the
// ASK_CATEGORIES/ASK_TYPES registry (asks.js) — categories at root, leaves
// one drill-down deep. Availability is evaluated live at open/navigate time
// against the conversation NPC (D5's first half; decide() re-checks it on
// send). Unavailable leaves stay visible but greyed; a category with no live
// leaf is greyed and not navigable. Clicking a leaf inserts its template
// into the input with the <Optional> span selected for easy replace.

let askMenuPath = []; // stack of category ids; empty = root

function askMenuIsOpen() {
  const m = document.getElementById('conv-ask-menu');
  return !!m && !m.hidden;
}

function openAskMenu() {
  if (!convState || convState.sending || !currentGameState) return;
  askMenuPath = [];
  askMenuRender();
  const m = document.getElementById('conv-ask-menu');
  if (m) m.hidden = false;
}

function closeAskMenu() {
  askMenuPath = [];
  const m = document.getElementById('conv-ask-menu');
  if (m) m.hidden = true;
}

function askMenuGoCategory(catId) {
  askMenuPath.push(catId);
  askMenuRender();
}

function askMenuGoBack() {
  askMenuPath.pop();
  askMenuRender();
}

function askMenuRender() {
  const gs = currentGameState;
  const body = document.getElementById('conv-ask-body');
  const title = document.getElementById('conv-ask-title');
  const backBtn = document.getElementById('conv-ask-back-btn');
  if (!gs || !body || !convState) return;
  const npc = gs.npcs?.[convState.npcId];
  if (!npc) return;
  const ctx = assembleContext(gs, currentSceneState);
  const catId = askMenuPath[askMenuPath.length - 1];
  const cat = catId ? ASK_CATEGORIES.find(c => c.id === catId) || null : null;
  if (title) title.textContent = cat ? `Asks ▸ ${cat.label}` : 'Asks';
  if (backBtn) backBtn.hidden = !cat;
  body.textContent = '';
  const items = cat ? cat.children : ASK_CATEGORIES;
  for (const item of items) {
    if (item.children) {
      // Category row — disabled (greyed, not navigable) when none of its
      // leaves are available right now.
      const row = document.createElement('button');
      row.className = 'conv-ask-cat';
      row.setAttribute('data-ask-cat', item.id);
      row.textContent = item.label;
      const hasLive = item.children.some(ch => !ch.available || ch.available(gs, npc, ctx));
      if (!hasLive) { row.disabled = true; row.classList.add('is-disabled'); }
      body.appendChild(row);
    } else {
      // Leaf row — greyed and unclickable when `available()` is false.
      const row = document.createElement('button');
      row.className = 'conv-ask-row';
      row.setAttribute('data-ask-id', item.id);
      const label = document.createElement('span');
      label.className = 'conv-ask-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.help) {
        const help = document.createElement('span');
        help.className = 'conv-ask-help';
        help.textContent = item.help;
        row.appendChild(help);
      }
      const avail = !item.available || item.available(gs, npc, ctx);
      if (!avail) { row.disabled = true; row.classList.add('is-disabled'); }
      body.appendChild(row);
    }
  }
}

function askMenuInsertLeaf(askId) {
  // Phase 8 — a share pseudo-leaf (camera-roll photos) is not an ask: it
  // opens the picker instead of inserting a template. Belt and braces on
  // availability (D5's first half applies to attachments too — the roll can
  // empty out between the render and the click).
  const shareLeaf = ASK_SHARE_TYPES[askId];
  if (shareLeaf) {
    if (shareLeaf.available && !shareLeaf.available(currentGameState)) return;
    closeAskMenu();
    openConvPhotoPicker().then(photo => { if (photo) doConvSharePhoto(photo.id); });
    return;
  }
  const leaf = ASK_TYPES[askId];
  const npc = currentGameState?.npcs?.[convState?.npcId];
  if (!leaf || !npc) return;
  // Belt and braces (D5): never insert an ask `available()` has closed —
  // state can move between the menu render and the click.
  const ctx = assembleContext(currentGameState, currentSceneState);
  if (leaf.available && !leaf.available(currentGameState, npc, ctx)) return;
  // Phase 9 — a gift leaf has no template: the item is chosen from the
  // inventory picker, then the turn runs as an ask through doConvGiveGift.
  // Same picker-first shape as the camera-roll share flow, but the result
  // IS an ask (decision, strip, deterministic match).
  if (leaf.gift) {
    closeAskMenu();
    openConvGiftPicker().then(pick => { if (pick) doConvGiveGift(pick.defId); });
    return;
  }
  const input = document.getElementById('conv-input');
  if (!input) return;
  input.value = leaf.template;
  input.focus();
  const marker = '<Optional>';
  const idx = leaf.template.indexOf(marker);
  if (idx >= 0) input.setSelectionRange(idx, idx + marker.length);
  else input.setSelectionRange(leaf.template.length, leaf.template.length);
  closeAskMenu();
  updateAskHint();
}

// Asks plan Phase 2 — the hint line under the input. While the input carries
// a $AskId the hint shows the leaf's help text; a $Tag that isn't a known
// ask warns it will be sent as plain text (D3 fallthrough); otherwise it
// stays hidden. textContent only — nothing player-derived is ever injected
// as markup.
function updateAskHint() {
  const hint = document.getElementById('conv-ask-hint');
  if (!hint) return;
  const input = document.getElementById('conv-input');
  const text = input?.value || '';
  let msg = '';
  if (text.startsWith('$')) {
    const parsed = parseAskInput(text);
    if (parsed) {
      const leaf = ASK_TYPES[parsed.askId];
      if (leaf) msg = `${leaf.label} — ${leaf.help || 'replace <Optional> with your own words'}`;
      else msg = `No request named “${parsed.askId}” — it will be sent as a normal message.`;
    }
  }
  hint.textContent = msg;
  hint.hidden = !msg;
}

async function doTalk(npcId) {
  if (!npcId || !currentGameState) return;

  // Cognition plan Phase 2 (D5, COGNITION.alwaysBreak.playerAddress): being
  // spoken to always ends whatever the NPC had committed to. This is the half
  // of the break list that cannot live in the tick — the player addressing
  // someone happens here, not in resolveTick — and it is deliberately not
  // subject to the scoring margin: an NPC who carries on folding laundry for
  // four ticks while you stand there talking to them is a feel bug, and no
  // amount of tuning should be able to produce it. Before the tension check,
  // because someone who refuses to talk to you has still noticed you.
  notePlayerAddressed(currentGameState, npcId);

  // Relationship consequences (P7): high tension may cause NPC to refuse
  // to talk or avoid the player entirely.
  const relCheck = checkRelConsequences(npcId);
  if (!relCheck.canTalk) {
    if (relCheck.avoided) {
      const rooms = COMMON_ROOMS.filter(r => r !== currentGameState.player.location);
      const newRoom = rooms[Math.floor(orbitalRandom() * rooms.length)];
      currentGameState.npcs[npcId].location = newRoom;
      currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    }
    addLogEntry('narration', relCheck.reason);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('talk-avoided', currentGameState);
    return;
  }

  // Initiative plan Phase 2 (D13): they are still angry with you and they
  // still did not walk away. Narrated before the overlay opens, because
  // without a line the player sees a refusal threshold that simply stopped
  // applying — charged, not warm, and the friction is the point.
  if (relCheck.chargedDespiteTension) {
    const them = currentGameState.npcs[npcId];
    addLogEntry('narration', CHARGED_TENSION_TEMPLATES[Math.floor(orbitalRandom() * CHARGED_TENSION_TEMPLATES.length)]
      .replace('{name}', them?.bible?.name || 'They'));
  }

  // Initiative plan Phase 3: if they crossed the room to reach you, this is
  // the ending where the player said yes. Resolved BEFORE the overlay opens so
  // the flag below cannot make the DND gate read as "already in conversation"
  // for a record that is still pending, and so the opening beat can be theirs.
  const overture = isOverturePending(currentGameState.npcs[npcId])
    ? resolveOverture(currentGameState, npcId, 'engaged') : null;

  // Promote to active — demotes the least-engaged active member if the
  // cap is already full, narrated rather than swapped silently.
  const { sceneState, demotedId } = promoteToActive(currentSceneState, npcId);
  currentSceneState = sceneState;
  narrateDemotion(demotedId, npcId);

  // D9's `in_conversation` entry. Set for the life of the overlay; the tick
  // reads it through OVERTURE's do-not-disturb registry, so nobody opens a
  // second overture at a player who is mid-sentence with someone else.
  currentGameState.player.flags = currentGameState.player.flags || {};
  currentGameState.player.flags._inConversation = true;

  // Open the conversation overlay before any LLM call so the player sees
  // the interface immediately, not a loading screen.
  // sceneVisCount/sceneVisLastMood: F3's cadence trackers — per-conversation,
  // reset on every open so a later 'everyN'/'mood' setting change or a new
  // conversation with someone else starts counting fresh.
  convState = { npcId, sending: false, sceneVisCount: 0, sceneVisLastMood: null };
  openConversationOverlay(npcId);

  // Deterministic confrontation, before the LLM ever runs — a suspicion
  // threshold crossing (STEALTH, P6) is a guaranteed reaction, not
  // something left to the narrator's discretion. Decays suspicion
  // afterward so the same talk doesn't refire it every time; a fresh
  // incident can still push suspicion back over the threshold later.
  const npc = currentGameState.npcs[npcId];
  const suspicion = (npc.suspicion || {}).boundary_violation || 0;
  if (suspicion >= STEALTH_TUNING.confrontThreshold) {
    const template = BOUNDARY_CONFRONT_TEMPLATES[Math.floor(orbitalRandom() * BOUNDARY_CONFRONT_TEMPLATES.length)];
    convAddBeat(template.replace('{name}', npc.bible.name || 'Your roommate'));
    const effCtx = buildEffectContext(currentGameState, [npcId], [npcId], {}, []);
    const target = suspicion * STEALTH_TUNING.confrontDecayFactor;
    applyEffects(parseEffectDSL(`ADJUST_SUSPICION ${npcId} boundary_violation ${(target - suspicion).toFixed(2)}`), effCtx);
  }

  // Time slows to real-time for the conversation
  pushTimeContext('conversation');

  // Generate the opening exchange. Whose beat it is depends on who opened:
  // "You approach [name] to talk" when the player did, and the motive that
  // won the tick when the NPC did (initiative plan Phase 3).
  await doConvSend(overture
    ? overtureOpeningLine(npc, overture)
    : `You approach ${npc.bible?.name || 'your roommate'} to talk.`);

  // Talking to the referenced NPC is the completion trigger for any
  // active goal about them — deterministic, doesn't depend on the LLM
  // succeeding or reporting progress (see checkQuestCompletion).
  await checkQuestCompletion(npcId);
}

// Phase 9 — `giftDefId` turns the send into a gift turn: the picker chose an
// inventory item, the player bubble narrates handing it over, and the turn
// runs as the $RequestGift ask (decision first, effects stripped, the
// deterministic match → MOVE_ITEM/REL_DELTA/MEMORY_FACT through the ask
// pipeline). The item is a STRUCTURED input — like the calendar slot, it
// decides the match; flavor text never does (D1/invariant 2).
async function doConvSend(forcedText, giftDefId) {
  if (!convState || convState.sending) return;
  const input = document.getElementById('conv-input');
  let text = forcedText;
  if (giftDefId) {
    const stack = (currentGameState?.player?.inventory || []).find(s => s.defId === giftDefId && (s.qty || 0) > 0);
    if (!stack) return; // item vanished between the picker and the send
    const def = ITEM_DEFS[giftDefId] || ITEM_DEFS._unknown;
    const name = currentGameState?.npcs?.[convState?.npcId]?.bible?.name || 'them';
    text = `You hand ${name} the ${def.label || 'gift'}.`;
    if (input) input.value = '';
  } else {
    text = forcedText || input?.value.trim();
    if (!text) return;
    if (input && !forcedText) input.value = '';
  }
  convState.sending = true;
  const sendBtn = document.getElementById('conv-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Asks plan Phase 1 (D3): `$AskId <flavor>` parses once here. An unknown
  // $Tag falls through to the plain free-text path — it gets no chip and no
  // decision, just a normal turn. A gift turn carries no $-text at all.
  const parsedAsk = (forcedText || giftDefId) ? null : parseAskInput(text);
  const askLeaf = giftDefId ? ASK_TYPES.RequestGift : (parsedAsk ? ASK_TYPES[parsedAsk.askId] || null : null);

  // Player's message appears instantly in the conversation log. Forced
  // opening text (e.g. "You approach Hana to talk") is shown as a scene
  // beat rather than a player bubble, since it's narration, not dialogue.
  if (forcedText) convAddBeat(text);
  else if (askLeaf) {
    // Asks plan — the sent bubble shows the ask's header label and the
    // player's CLEAN words only; the `$RequestType` prefix is input syntax
    // and never renders in the message. A gift turn has no $-tag — its body
    // is the "You hand X the Y." narration line (structured input).
    // D4 — a bare ask (untouched `<Optional>`) renders the leaf's canned
    // defaultFlavor as the body instead of an empty one. Display-only: the
    // flavor handed to resolveAsk below stays exactly what was parsed (D1).
    const body = parsedAsk ? (parsedAsk.flavor || askLeaf.defaultFlavor || '') : text;
    convAddBubble('player', body, askLeaf.label);
  } else {
    convAddBubble('player', text);
  }

  // Typing indicator while the NPC generates a response.
  const removeTyping = convShowTyping();
  convSetStatus('typing…');

  try {
    // Conversation runs on the continuous real-time clock (pushTimeContext
    // 'conversation', 1 game-second per real-second) for the life of the
    // overlay — the rAF loop keeps NPC resolution, phone battery and player
    // needs moving at that pace in the background for free. A discrete jump
    // here would double that up; ticks=0 is a no-op batch kept only to
    // preserve the ordering resolveAsk's seed relies on (D1/D6 below).
    await advanceAndResolve(0);
    const context = assembleContext(currentGameState, currentSceneState);

    // Ask turns decide BEFORE the LLM runs (invariant 1): resolveAsk is
    // pure — decision + stance + directive + effect lines, no model call,
    // no state writes. Called after advanceAndResolve so the seed reads the
    // exact state this turn will save, which is what reload-reproducibility
    // (D1/D6) requires. A gift turn passes the chosen item as the structured
    // `extra` payload — never through the flavor (D1/invariant 2).
    const askTurn = askLeaf
      ? resolveAsk(currentGameState, convState.npcId, askLeaf.id,
          giftDefId ? text : parsedAsk.flavor, context,
          giftDefId ? { giftDefId } : undefined)
      : null;

    const result = await callLLM(
      askTurn ? { ...context, askDirective: askTurn.directive } : context,
      text
    );

    removeTyping();

    // Ask turns (invariant 1): the outcome was decided BEFORE the LLM ran —
    // a phrasing failure degrades to the asks-llm-prompt.md template
    // fallback line (the decision stands), and the ask's OWN pipeline
    // (schedule modal, photo flow, effects) runs regardless of how the
    // writer did. This is Phase 10's reconciliation of the two pre-existing
    // drifts: the pass-1 fallback is wired, and the schedule branch no
    // longer sits inside the valid-proposal if.
    let applied = null;
    if (result.valid && result.proposal) {
      if (askTurn) {
        // D2 / invariant 3 — on ask turns the writer phrases but never
        // decides AND never writes. Effects are stripped HERE, in
        // doConvSend, not inside callLLM: the regex fallback tier there can
        // smuggle parseEffectDSL lines back in. The ask's own effects are
        // applied below, at the point applyProposal would have applied the
        // writer's.
        if (result.proposal.effects) result.proposal.effects = [];
        delete result.proposal.moodDeltas;
      }
      applied = await applyProposal(result.proposal, context, currentGameState, text);
    } else if (askTurn) {
      // Template fallback (asks-llm-prompt.md): the fallback line rides the
      // normal applyProposal path, so a degraded turn still lands in
      // memory.recent, the session log and the Assessor's window exactly
      // like a phrased one (Phase 10 audit). The speaker is the ACTIVE
      // context's name — the exact value applyProposal matches dialogue
      // against — so a name-less NPC (bible.name '') still records the line.
      const npcName = (context.activeNpcs.find(n => n.id === convState.npcId)?.name)
        || currentGameState.npcs[convState.npcId]?.bible?.name || 'they';
      applied = await applyProposal(
        { dialogue: [{ speaker: npcName, text: buildAskFallbackLine(askTurn, npcName) }] },
        context, currentGameState, text
      );
    } else {
      convAddBeat(`They seem distracted and don't respond.`);
    }

    if (applied) {
      // Render pass-1 results before any schedule modal (asks plan Phase 4)
      // opens, so the player reads the NPC's answer to the ask first.
      convRenderProposal(applied);
      // The ask's own pipeline runs whenever this is an ask turn, valid
      // proposal or not: the decision already happened, so the calendar
      // modal, the photo flow and the ask's effects must not be hostage to
      // the writer's parse tier (Phase 10 — the schedule branch is no longer
      // gated on a valid proposal).
      let pass2 = null;
      if (askTurn) {
        if (askTurn.ask.schedule && askTurn.decision.accept) {
          pass2 = await runAskScheduleFlow(askTurn, context, text);
        }
        // Phase 8 — a photo ask that was accepted generates the NPC's photo
        // and paints it into the log (runAskPhotoFlow). The photo is decided,
        // not negotiated: it renders after the pass-1 phrasing, which already
        // said yes in voice, and its effects apply in the same single moment
        // as every other ask's.
        if (askTurn.ask.photo && askTurn.decision.accept) {
          await runAskPhotoFlow(askTurn, context);
        }
        askTurn.applyEffects();
        applied.updatedNpcIds.push(convState.npcId);
      }
      // Also persist key beats to the main session log so the scene
      // viewer retains context after the conversation closes.
      const allLogs = [...applied.logEntries, ...((pass2 && pass2.logEntries) || [])];
      if (allLogs.length > 0) {
        addLogEntry('narration', `[Talking to ${currentGameState.npcs[convState.npcId]?.bible?.name || 'them'}] ${allLogs.filter(e => e.type === 'dialogue').map(e => `${e.speaker}: "${e.text}"`).join(' ')}`);
      }
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      const speakerIds = (result.valid && result.proposal)
        ? resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs)
        : [convState.npcId];
      currentSceneState = advanceEngagement(currentSceneState, speakerIds);
      // F3: fire-and-forget, after the turn's own dialogue/beats are already
      // painted in — never blocks the reply the player is waiting on.
      const sceneNpc = currentGameState.npcs?.[convState.npcId];
      if (sceneNpc) maybeShowConversationScene(sceneNpc);
    }

    // Player needs already ride the continuous clock's own heartbeat while
    // 'conversation' context is active (real elapsed seconds, not a flat
    // per-message tick) — a second decay call here was stacking a 30-minute
    // hit on top of that for every single message sent.
    convSetStatus('In conversation');
    render(currentGameState, currentSceneState);
    // D2's early flush — the reply is already painted into the overlay, so
    // this judges a window the player has finished reading (D6).
    if (await assessSceneIfFull()) render(currentGameState, currentSceneState);
    await chronicleIfFull();                                    // D3's early flush
    await saveAtBoundary('conv-send', currentGameState);
  } catch (e) {
    console.warn('Conversation send failed:', e);
    removeTyping();
    convAddBeat('Something went wrong. Try again.');
    convSetStatus('In conversation');
  } finally {
    convState.sending = false;
    if (sendBtn) sendBtn.disabled = false;
    const freshInput = document.getElementById('conv-input');
    if (freshInput) freshInput.focus();
  }
}

// Asks plan Phase 4 (D8/D9) — stage 2 of a schedule:true ask. Stage 1
// (decide + pass-1 phrasing) already ran and said yes; here the player
// picks a genuinely free window from the calendar modal, the hard-block
// recheck runs (a safety net only — the modal only offers free windows),
// a real commitment is created so the NPC actually shows up for the window,
// and a second LLM pass phrases the sign-off through
// buildSchedulingConfirmDirective (template fallback if the call fails).
// Returns { logEntries } — the pass-2 entries for the session log — or
// null when the player cancels.
async function runAskScheduleFlow(askTurn, context, playerAction) {
  const npc = currentGameState.npcs?.[convState.npcId];
  if (!npc) return null;
  const name = npc.bible?.name || 'they';
  // Loop so a recheck failure (state moved since the probe) reopens the
  // modal instead of silently committing to a hard-blocked window.
  let slot = null;
  for (let tries = 0; tries < 5; tries++) {
    slot = await openAskScheduleModal({
      title: `${askTurn.ask.label} — when works for ${name}?`,
      npcId: convState.npcId,
      mealLabels: askTurn.ask.kind === 'meal', // Phase 5 (D10): label rows that land in a meal slot
    });
    if (!slot) return null;
    const nowAbs = clockToAbsolute(currentGameState.meta.clock);
    const { block } = resolveScheduleActivity(npc, absoluteToClock(slot.startAbs));
    if (slot.endAbs > nowAbs && !COMMITMENT_TUNING.busyBlocks.includes(block)) break;
    slot = null;
    convAddBeat(`${name}'s plans just shifted — that window won't work anymore. Pick another?`);
  }
  if (!slot) { convAddBeat('You leave the plans open.'); return null; }

  // The NPC pre-accepted deterministically in stage 1, so they are passed
  // as proposerId: createCommitment honors that by putting them straight
  // into acceptedIds instead of re-rolling them through respondToCommitment
  // (whose noise draw could flip the answer — same-save-same-answer, D1).
  createCommitment(currentGameState, {
    kind: askTurn.ask.kind || 'hangout',
    startAbs: slot.startAbs, endAbs: slot.endAbs,
    roomId: askTurn.ask.roomId || 'living_room',
    invitedIds: [],
    proposerId: convState.npcId,
  });
  askTurn.setSlot(slot);
  const when = askWhenPhrase(slot, currentGameState.meta.clock.day);
  // Phase 5 (D10): a meal ask's sign-off names the inferred meal instead of
  // a bare time ("Breakfast, tomorrow at 08:30"). The label rides on
  // dayLabel so the template fallback line reads the same way; a window
  // outside every meal slot keeps the plain day/time phrase.
  const meal = askTurn.ask.kind === 'meal'
    ? mealLabelForWindow(slot.startAbs % 1440, slot.endAbs % 1440) : null;
  const dayLabel = meal ? `${meal.label}, ${when.dayLabel}` : when.dayLabel;

  const removeTyping = convShowTyping();
  convSetStatus('typing…');
  let logEntries = [];
  const fresh = assembleContext(currentGameState, currentSceneState);
  try {
    const result2 = await callLLM(
      { ...fresh, askDirective: buildSchedulingConfirmDirective({
          askLabel: askTurn.ask.label,
          npcName: name,
          dayLabel,
          timeLabel: when.timeLabel,
          slotLabel: when.slotLabel,
        }) },
      playerAction
    );
    removeTyping();
    if (result2.valid && result2.proposal) {
      // Invariant 3 applies to the sign-off pass too — it only speaks.
      if (result2.proposal.effects) result2.proposal.effects = [];
      delete result2.proposal.moodDeltas;
      const applied2 = await applyProposal(result2.proposal, fresh, currentGameState, null);
      logEntries = applied2.logEntries;
    }
  } catch (e) {
    console.warn('Ask scheduling pass 2 failed:', e);
    removeTyping();
  }
  if (logEntries.length === 0) {
    // Template fallback (asks-llm-prompt.md): the plan is still real even
    // if the model hiccuped. Rendered through the normal applyProposal path
    // (Phase 10 audit) so the sign-off lands in memory.recent exactly like a
    // phrased confirm, not just in the DOM. Speaker uses the active
    // context's name — the value applyProposal matches dialogue against.
    const confirmName = (fresh.activeNpcs.find(n => n.id === convState.npcId)?.name) || name;
    const appliedF = await applyProposal(
      { dialogue: [{ speaker: confirmName, text: `${confirmName} confirms — ${dayLabel} at ${when.timeLabel}.` }] },
      fresh, currentGameState, null
    );
    logEntries = appliedF.logEntries;
  }
  convRenderProposal({ logEntries });
  return { logEntries };
}

// Asks plan Phase 8 — the accepted photo ask's second half. Stage 1
// (decide + pass-1 phrasing) already said yes in voice; here the NPC's
// photo is generated from their appearance + flavor (buildAskPhotoRecord →
// getAskPhotoImage — deterministic prompt+seed, so the same save reproduces
// the same photo through the shared cache) and painted into the conversation
// as an NPC image bubble. Failure degrades to a text beat: the decision
// already happened, so the ask is settled either way.
async function runAskPhotoFlow(askTurn, context) {
  const npc = currentGameState.npcs?.[convState.npcId];
  if (!npc) return;
  const day = askDay(currentGameState);
  const record = buildAskPhotoRecord(currentGameState, npc, convState.npcId, askTurn.flavor, day, askTurn.ladder.count);
  convSetStatus('sending photo…');
  let url = null;
  try {
    const img = await getAskPhotoImage(record);
    url = img.url;
  } catch (e) {
    console.warn('Ask photo flow failed:', e);
  }
  convSetStatus('In conversation');
  if (url) {
    // record.caption rides as the bubble's text (F2): "Selfie from <name> —
    // <flavor>". It is player-sourced, so convAddImageBubble renders it via
    // textContent (invariant: textContent, not innerHTML).
    convAddImageBubble('npc', url, record.caption, '📷 Photo');
  } else {
    convAddBeat(`${npc.bible?.name || 'They'} tried to send you a photo, but it didn't come through.`);
  }
}

// Asks plan Phase 8 — the camera-roll picker for sharing a photo into the
// conversation. Opens the standard modal (z-tier 300, above the conversation
// overlay's 200) and resolves with the picked photo record or null on
// cancel; doConvSharePhoto owns the send. Reuses the phone gallery's
// thumbnail pattern — placeholder first, getPhotoImage fills the real
// pixels when they land.
function openConvPhotoPicker() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !titleEl || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (photo) => { overlay.removeAttribute('data-open'); resolve(photo); };
    const roll = currentGameState?.world?.phone?.camera?.roll || [];
    if (roll.length === 0) { resolve(null); return; }
    titleEl.textContent = 'Share a Photo';
    body.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'conv-photo-picker';
    for (const photo of roll) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'conv-photo-pick';
      tile.setAttribute('aria-label', `Share ${photo.caption}`);
      const img = document.createElement('img');
      img.src = getPlaceholder();
      img.alt = photo.caption;
      tile.appendChild(img);
      const cap = document.createElement('span');
      cap.className = 'conv-photo-pick-cap';
      cap.textContent = photo.caption;
      tile.appendChild(cap);
      tile.addEventListener('click', () => finish(photo));
      grid.appendChild(tile);
      getPhotoImage(photo).then(result => { if (result.url) img.src = result.url; });
    }
    body.appendChild(grid);
    actions.textContent = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// Asks plan Phase 9 — the inventory picker for gifting into the
// conversation. Same shared-modal + grid shape as the camera-roll picker
// above; the tiles are the bag's giftable stacks (inventory.js
// giftableStacks — the same rule the availability gate uses), text-only
// (inventory items have no thumbnail). Resolves { defId } or null on
// cancel; doConvGiveGift owns the send.
function openConvGiftPicker() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !titleEl || !body || !actions) { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();
    const finish = (pick) => { overlay.removeAttribute('data-open'); resolve(pick); };
    const stacks = giftableStacks(currentGameState);
    if (stacks.length === 0) { resolve(null); return; }
    titleEl.textContent = 'Give a Gift';
    body.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'conv-gift-picker';
    for (const stack of stacks) {
      const def = stackDef(stack);
      const label = def.id === '_unknown' ? (stack?.meta?.origName || def.label) : def.label;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'conv-gift-pick';
      tile.setAttribute('aria-label', `Give ${label}`);
      const nameEl = document.createElement('span');
      nameEl.className = 'conv-gift-pick-name';
      nameEl.textContent = label;
      tile.appendChild(nameEl);
      const metaEl = document.createElement('span');
      metaEl.className = 'conv-gift-pick-meta';
      const group = (SORT_GROUPS[def.sortGroup] || {}).label || def.category || 'Item';
      metaEl.textContent = (stack.qty > 1 ? `×${stack.qty} · ` : '') + group;
      tile.appendChild(metaEl);
      tile.addEventListener('click', () => finish({ defId: stack.defId }));
      grid.appendChild(tile);
    }
    body.appendChild(grid);
    actions.textContent = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// Asks plan Phase 9 — give an inventory item as a gift. The picker chose
// the def; the send runs as a normal ASK turn through doConvSend (decision
// first, writer effects stripped, deterministic match → MOVE_ITEM /
// REL_DELTA / MEMORY_FACT through the ask pipeline), reusing the exact
// pipeline instead of a parallel path.
function doConvGiveGift(defId) {
  return doConvSend(null, defId);
}

// Asks plan Phase 8 — share one of the player's camera-roll photos into the
// conversation. Same shape as doConvSend's plain-text path (advance →
// callLLM → applyProposal → session log → assess → save), with the photo
// bubble rendered before the NPC's reply. This is NOT an ask turn — no
// $AskId, no decision, no effect-strip: the NPC merely reacts to what the
// player showed them, and the writer's normal effects stand exactly as they
// do on any free-text turn. The photo is described to the model as text (its
// caption), the same convention sharePhotoToImThread uses — no vision
// capability needed for a plausible in-fiction reaction.
async function doConvSharePhoto(photoId) {
  if (!convState || convState.sending) return;
  const gs = currentGameState;
  const photo = gs?.world?.phone?.camera?.roll?.find(p => p.id === photoId);
  if (!photo || !gs.npcs?.[convState.npcId]) return;
  convState.sending = true;
  const sendBtn = document.getElementById('conv-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  const text = `[shared a photo: ${photo.caption}]`;
  const img = convAddImageBubble('player', getPlaceholder(), `📷 ${photo.caption}`, 'Shared Photo');
  getPhotoImage(photo).then(result => { if (result.url && img) img.src = result.url; });
  const removeTyping = convShowTyping();
  convSetStatus('typing…');
  try {
    // Same real-time conversation clock as doConvSend — see its comment.
    await advanceAndResolve(0);
    const context = assembleContext(currentGameState, currentSceneState);
    const result = await callLLM(context, text);
    removeTyping();
    if (result.valid && result.proposal) {
      const applied = await applyProposal(result.proposal, context, currentGameState, text);
      convRenderProposal(applied);
      if (applied.logEntries.length > 0) {
        addLogEntry('narration', `[Talking to ${currentGameState.npcs[convState.npcId]?.bible?.name || 'them'}] ${applied.logEntries.filter(e => e.type === 'dialogue').map(e => `${e.speaker}: "${e.text}"`).join(' ')}`);
      }
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
    } else {
      convAddBeat(`They seem distracted and don't respond.`);
    }
    convSetStatus('In conversation');
    render(currentGameState, currentSceneState);
    if (await assessSceneIfFull()) render(currentGameState, currentSceneState);
    await chronicleIfFull();
    await saveAtBoundary('conv-share-photo', currentGameState);
  } catch (e) {
    console.warn('Conversation photo share failed:', e);
    removeTyping();
    convAddBeat('Something went wrong. Try again.');
    convSetStatus('In conversation');
  } finally {
    convState.sending = false;
    if (sendBtn) sendBtn.disabled = false;
    const freshInput = document.getElementById('conv-input');
    if (freshInput) freshInput.focus();
  }
}

function doConvLeave() {
  if (!convState) return;
  const npcId = convState.npcId;
  const npc = currentGameState?.npcs?.[npcId];
  closeConversationOverlay();
  // Step away from the active conversation.
  currentSceneState = demoteToAmbient(currentSceneState, npcId);
  if (npc) addLogEntry('narration', `You step away from ${npc.bible?.name || 'them'}.`);
  popTimeContext();
  render(currentGameState, currentSceneState);
  saveAtBoundary('step-away', currentGameState);
}

function doConvAskLeave() {
  if (!convState) return;
  const npcId = convState.npcId;
  const npc = currentGameState?.npcs?.[npcId];
  if (!npc || npc.residency?.status !== 'resident') return;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;
  title.textContent = 'Ask to Leave';
  body.innerHTML = `<p>Are you sure you want to ask <strong>${convEscapeHtml(npc.bible?.name || 'them')}</strong> to move out? This will end their tenancy — they'll pack up and leave the apartment, and the remaining rent will be split among fewer people.</p>`;
  actions.innerHTML = `<button class="btn" data-action="conv.confirm-ask-leave" data-npc="${npcId}">Ask Them to Leave</button><button class="btn btn-secondary" data-action="close-modal">Cancel</button>`;
  overlay.setAttribute('data-open', '');
}

async function doConvConfirmAskLeave(npcId) {
  closeModal();
  if (convState) popTimeContext();
  closeConversationOverlay();
  await doAskToLeave(npcId);
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

// One line for the whole walk, deterministic and template-driven — same
// no-LLM-in-a-move discipline as the construction lines below. States the
// destination when the player got there, and states what stopped them when
// they did not, because "you move to the Kitchen" after being intercepted in
// the Living Room is a lie the player can see through.
function walkNarration(walk, targetRoomId) {
  const here = roomPhrase(walk.stoppedAt);
  if (!walk.reason) {
    // A single step reads as a step; a real journey reads as one.
    return walk.crossed.length > 1
      ? `You make your way through to ${here}.`
      : `You move to ${here}.`;
  }
  // When the blocked room IS the destination, naming it twice reads as a
  // stammer ("You head for Bedroom 2, but Bedroom 2 is locked"). Say it once.
  const atDestination = walk.blockedBy === targetRoomId;
  const heading = `You head for ${roomPhrase(targetRoomId)}`;
  if (walk.reason === 'locked') {
    return atDestination
      ? `${heading}, but the door is locked. You stop in ${here}.`
      : `${heading}, but ${roomPhrase(walk.blockedBy)} is locked. You stop in ${here}.`;
  }
  if (walk.reason === 'construction') {
    return atDestination
      ? `${heading}, but the crew has it torn open. You stop in ${here}.`
      : `${heading}, but the crew has ${roomPhrase(walk.blockedBy)} torn open. You stop in ${here}.`;
  }
  if (walk.reason === 'overture') {
    // A generated NPC's name is empty until prose expansion runs, so
    // "someone" is a real state and not a defensive fallback.
    const who = currentGameState?.npcs?.[walk.blockedBy]?.bible?.name;
    return `${heading}, but ${who || 'someone'} is waiting in ${here}.`;
  }
  return `${heading}, and stop in ${here}.`;
}

// Floorplan plan Phase 3: the player clicks a room and WALKS there, however
// far it is. Adjacency-gating was a restriction the old free-and-instant cost
// never justified — and it meant clicking the Study from the Kitchen produced
// a scolding rather than a walk, across a threshold that is not even a wall.
//
// WORLD's resolveWalk decides what happens on the way (pure, deterministic).
// This function's job is only to APPLY that: mutate location, narrate, and —
// crucially (D10) — run the arrival sequence exactly once, for the room the
// player actually ended up in, no matter how many rooms they crossed.
async function doMove(targetRoomId) {
  const currentRoom = currentGameState?.player?.location;
  const walk = resolveWalk(currentGameState, currentRoom, targetRoomId);
  const roomId = walk.stoppedAt;

  // Nowhere to go, or blocked before the first step.
  if (roomId === currentRoom) {
    if (walk.reason === 'locked') {
      addLogEntry('narration', `${roomPhrase(walk.blockedBy)} is locked.`.replace(/^the /, 'The '));
    } else if (walk.reason === 'construction') {
      addLogEntry('narration', `The crew has ${roomPhrase(walk.blockedBy)} torn open — there's no getting through.`);
    } else if (walk.route.length < 2) {
      addLogEntry('narration', `You can't get to ${roomPhrase(targetRoomId)} from here.`);
    }
    render(currentGameState, currentSceneState);
    return;
  }
  showLoading();
  try {
    // Initiative plan Phase 3 (D10): walking out on someone who crossed a room
    // to reach you IS the refusal, and it needs no button. Read against the
    // room being LEFT, so this has to run before the move — after it, there is
    // no record of where the player was standing when they turned away.
    refuseOverturesInRoom(currentGameState.player.location);
    // Stealth fires for EVERY room crossed, not just the destination (D10):
    // being seen letting yourself through someone's bedroom is a boundary
    // crossing whether or not you stopped to look around. The destination's
    // own check is the one below, whose result drives the arrival narration.
    for (const mid of walk.crossed.slice(0, -1)) {
      currentGameState.player.location = mid;
      resolveRoomEntryStealth(currentGameState, mid);
    }
    currentGameState.player.location = roomId;
    // Boundary-crossing check runs on entry, before any time passes, so
    // "who was home" reflects who was actually there when the player
    // walked in (see STEALTH's resolveRoomEntryStealth). Trusted producer,
    // no LLM — safe to run unconditionally on every move.
    const stealthResult = resolveRoomEntryStealth(currentGameState, roomId);
    // Recompute scene participants for the new room — active starts
    // populated (see getSceneParticipants) rather than empty.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    // Scene reader Phase 1 (D1): a room change opens a new scene. Called
    // BEFORE the narration line below so "You move to the Kitchen" is the
    // first beat of the scene it opens, not the last beat of the one it
    // closes. Order matters here — do not move this after addLogEntry.
    //
    // Plan X-5 Phase 2 (D2): openScene OVERWRITES meta.scene, so the id of
    // the scene it closes has to be captured before the increment — after it,
    // there is no record of which window just ended. Compared rather than
    // assumed because openScene is idempotent per room: re-entering the room
    // you are already standing in closes nothing, and judging that window
    // would score a conversation that is still going on.
    //
    // D10: openScene runs ONCE, for where the player ended up — never per
    // room crossed. A six-room walk that minted six scenes would hand Plan
    // X-5's Assessor a queue of zero-tick conversation windows to judge; it
    // would not error, it would quietly corrupt relationship scoring.
    const closingSceneId = currentGameState.meta?.scene?.id ?? 0;
    openScene(currentGameState, roomId);
    const sceneClosed = (currentGameState.meta.scene.id !== closingSceneId);
    addLogEntry('narration', walkNarration(walk, targetRoomId));
    // Renovation overhaul Phase 3: entering a room with an active contracted
    // job gets a deterministic construction-scene line — template keyed by
    // job type + current stage, no LLM call.
    const constructionJob = getActiveJobForRoom(currentGameState, roomId);
    if (constructionJob) {
      const templates = RENOVATION_SCENE_TEMPLATES[constructionJob.jobType] || RENOVATION_SCENE_TEMPLATES.repair;
      const stage = getRenovationJobStage(constructionJob, currentGameState.meta.clock.day);
      const line = templates[Math.min(stage.index, templates.length - 1)];
      if (line) addLogEntry('narration', line);
    }
    if (stealthResult.witnessed) {
      const ownerId = roomOwnerId(roomId, currentGameState.npcs);
      const ownerName = currentGameState.npcs[ownerId]?.bible?.name;
      // Two full alternatives, not a {name}/'They' template — "They looks
      // up" is wrong subject-verb agreement, and singular-they's correct
      // "They look up" reads wrong once a real name replaces it.
      addLogEntry('narration', ownerName ? `${ownerName} looks up as you come in.` : 'Someone looks up as you come in.');
    }
    surfaceRoomEvidence(roomId);

    // NPC-initiated conversation: if someone's here and active, let them
    // open rather than always waiting on the player to speak first.
    if (currentSceneState.active.length > 0) {
      const context = assembleContext(currentGameState, currentSceneState);
      const result = await callLLM(context, 'You walk into the room.');
      if (result.valid && result.proposal) {
        const applied = await applyProposal(result.proposal, context, currentGameState, 'You walk into the room.');
        for (const entry of applied.logEntries) addLogEntry(entry.type, entry.text, entry.speaker);
        currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
      }
    }

    render(currentGameState, currentSceneState);
    // D9: the walk costs SECONDS. advanceAndResolveMinutes takes a float and
    // a sub-minute span crosses no 30-minute boundary, so this is a clock
    // nudge and a proportional need decay rather than a simulation tick —
    // right up until a walk happens to straddle one, when the tick fires
    // correctly and for free. Done AFTER the render so the player is never
    // waiting on it, and after the arrival narration so the beat is logged
    // at the time it happened.
    if (walk.seconds > 0) await advanceAndResolveMinutes(walk.seconds / 60);
    // D2's primary trigger: the scene the player just walked out of is now a
    // closed window, and this is the moment it can be judged as a whole. D6 —
    // after the new room has rendered, so the player is never waiting on it.
    if (sceneClosed && await runAssessorPass(closingSceneId)) render(currentGameState, currentSceneState);
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
// Sandbox mode (Seasonal Calendar & Sandbox plan): the held SANDBOX_CONFIG the
// menu sub-screen edits and startSandboxGame consumes. Never persisted — consumed
// once at start. defaultSandboxConfig() (menu.js) produces the working defaults.
let pendingSandboxConfig = null;
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
  populatePlayerLookFields(body.querySelector('[data-player-look]'));
  populateCharManualFields(fieldsContainer, parseInt(countSelect.value, 10));
  countSelect.addEventListener('change', () => {
    populateCharManualFields(fieldsContainer, parseInt(countSelect.value, 10));
  });
  if (mode === 'seed' && seedInput) seedInput.focus();

  actions.innerHTML = '<button class="btn" data-action="generate-cast">Generate</button><button class="btn btn-secondary" data-action="close-modal">Cancel</button>';
  overlay.setAttribute('data-open', '');
}

// The player's own appearance fields, and the ONE table saying which form
// control maps to which pool and where the chosen value lands in the
// `{ age, gender, physical }` shape SIM's generatePlayerAppearance takes.
// populate and read below both walk this, so a field can never be offered
// and then silently dropped — the failure mode a second hand-written reader
// invites. Options come straight from the PHYS_POOL_* arrays, so the form
// cannot offer a value the generator wouldn't roll.
const PLAYER_LOOK_FIELDS = [
  { key: 'gender',     pool: () => Object.keys(CHAR_GEN.genderWeights), path: ['gender'] },
  { key: 'height',     pool: () => PHYS_POOL_HEIGHT,      path: ['physical', 'height'] },
  { key: 'build',      pool: () => PHYS_POOL_BUILD,       path: ['physical', 'build'] },
  { key: 'hairColor',  pool: () => PHYS_POOL_HAIR_COLOR,  path: ['physical', 'hair', 'color'] },
  { key: 'hairLength', pool: () => PHYS_POOL_HAIR_LENGTH, path: ['physical', 'hair', 'length'] },
  { key: 'eyeColor',   pool: () => PHYS_POOL_EYE_COLOR,   path: ['physical', 'eyes', 'color'] },
  { key: 'skinTone',   pool: () => PHYS_POOL_SKIN_TONE,   path: ['physical', 'skin', 'tone'] },
  { key: 'fashion',    pool: () => PHYS_POOL_FASHION,     path: ['physical', 'fashion'] },
];

function populatePlayerLookFields(block) {
  if (!block) return;
  for (const field of PLAYER_LOOK_FIELDS) {
    const select = block.querySelector(`[data-look="${field.key}"]`);
    if (!select) continue;
    select.innerHTML = '';
    // Empty value = "Roll it", and it is the default: the form's standing
    // promise is that a blank field rolls.
    const rollOpt = document.createElement('option');
    rollOpt.value = '';
    rollOpt.textContent = 'Roll it';
    select.appendChild(rollOpt);
    for (const val of field.pool()) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = String(val).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      select.appendChild(opt);
    }
  }
}

// Form → the authored-appearance object SIM_generateHouse takes. Returns null
// when the player touched nothing, which is the same signal as omitting the
// argument entirely: roll the lot.
function readPlayerLookFromForm(body) {
  const block = body?.querySelector('[data-player-look]');
  if (!block) return null;
  const out = {};
  let authoredAny = false;
  const setPath = (path, value) => {
    let node = out;
    for (const seg of path.slice(0, -1)) node = (node[seg] = node[seg] || {});
    node[path[path.length - 1]] = value;
    authoredAny = true;
  };
  for (const field of PLAYER_LOOK_FIELDS) {
    const value = block.querySelector(`[data-look="${field.key}"]`)?.value;
    if (value) setPath(field.path, value);
  }
  const age = parseInt(block.querySelector('[data-look="age"]')?.value || '', 10);
  if (Number.isFinite(age)) setPath(['age'], clamp(age, 18, 80));
  return authoredAny ? out : null;
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
  // Tone/content preferences are persisted to meta.contentConfig and
  // consumed by prompt construction (TONE_PROFILES/CONTENT_DIRECTIVES in
  // config) and by content-flag gating (activeContentFlags in computer).
  // contentPrefs from the form are tag names that map to contentFlags:
  // if the user lists "mature" or "romance" etc., those flags turn on;
  // unlisted flags fall back to CONTENT_CONFIG defaults (which have
  // everything on by design).
  const tone = body.querySelector('[name="tone"]')?.value || CONTENT_CONFIG.tone;
  const contentPrefs = (body.querySelector('[name="content"]')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const partials = readCharFormPartials(body, count);
  const playerLook = readPlayerLookFromForm(body);

  showLoading('Rolling household...');
  try {
    pendingCast = SIM_generateHouse(seed, count, partials, playerLook);
    // Build contentFlags from prefs, falling back to defaults for
    // anything not explicitly mentioned.
    const flags = { ...CONTENT_CONFIG.contentFlags };
    for (const pref of contentPrefs) {
      if (pref in flags) flags[pref] = true;
    }
    pendingCast.contentConfig = { tone, contentPrefs, contentFlags: flags };
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

// Phase 7: solo start. The player inherits an empty, run-down apartment
// alone — no cast generation, no roommates. This is the Stardew-like
// opening: the empty bedrooms are the visible statement of the problem, and
// the first objective (repair a bedroom via RenoFix, then post a Classifieds
// listing) writes itself.
//
// `draft` is what the Player Design studio authored, threaded through to
// SIM_generateHouse's 4th parameter. Omitted (the debug path, and any caller
// predating the studio) means every field rolls — the same contract a blank
// form has always had.
//
// This is the ONE ending of the studio → cutscene sequence: whether the
// player watched every beat or skipped on the first, they arrive here.
async function startSoloGame(draft) {
  stopAutosave();
  stopClockLoop();
  closeModal();
  closeMainMenu();
  showLoading('Moving in...');
  try {
    const seed = genSeed();
    // F1 (Discord feedback, 2026-08-23): the gameplay-options screen
    // (menu.js's openNewGameOptions) stamps this before the cutscene ran;
    // read once and clear it here so a later New Game (or the studio's
    // "Back to menu" path skipping the options screen entirely) never
    // reuses a stale options object.
    const gameplayOptions = pendingNewGameOptions?.economy;
    pendingNewGameOptions = null;
    pendingCast = SIM_generateHouse(seed, 0, [], draft, gameplayOptions);
    // Settings & Pause Overhaul Phase 4 (D5): the solo path bypasses the
    // cast-approval step where pendingCast.contentConfig is normally built
    // (handleGenerateCast), so seed it from defaults and apply the SFW
    // mode before the state write — same baking-in as approveCastAndStartGame.
    pendingCast.contentConfig = { tone: CONTENT_CONFIG.tone, contentPrefs: [], contentFlags: { ...CONTENT_CONFIG.contentFlags } };
    applySfwMode(pendingCast);
    await writeGeneratedGameState(pendingCast);
    pendingCast = null;
    await syncGameStateFromKv();
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    // The cutscene has now TOLD the inheritance story, so this line no longer
    // has to state it — it picks up where the last beat left off and says the
    // one thing the fiction did not: the number, and the deadline.
    addLogEntry('system', `The keys are still in your hand. Rent on this place is $${ECONOMY.rent.total.toLocaleString()} a week, and the first bill lands in ${ECONOMY.opening?.rentGraceDays ?? ECONOMY.payPeriodDays} days. Most of the rooms barely work. Best get started.`);
    // Phase 7: populate the gig board for day 1 so the player can start
    // earning immediately — the opening's first objective is income.
    // Done after syncGameStateFromKv so it operates on the loaded state.
    if (currentGameState.world.computer?.apps?.gigs) {
      currentGameState.world.computer.apps.gigs.lastRefreshDay = 0;
      generateGigsForDay(currentGameState, 1);
    }
    render(currentGameState, currentSceneState);
    startAutosave(() => currentGameState);
    startClockLoop();
  } catch (e) {
    console.error('Solo start failed:', e);
    showError('Failed to start new game: ' + e.message);
  } finally {
    hideLoading();
  }
}

// Sandbox mode start (Seasonal Calendar & Sandbox plan, B4/D16-D19). Mirrors
// startSoloGame beat for beat — same races, same closing order — but builds a cast
// of authored roommates (SIM_generateHouse's partials) and then applies the
// sandbox house/economy preset between generation and the state write. The two
// stop* calls at the top are the same race-startup defence startSoloGame and
// approveCastAndStartGame document: a stale autosave timer or clock loop from a
// previous game must never keep advancing the outgoing state while the new one is
// being written. closeMainMenu is the single uncovering point — it is NOT called
// from the config screen, only here at the moment of actually starting, so backing
// out of the config never leaves a half-started game behind a blank screen.
async function startSandboxGame(cfg) {
  stopAutosave();
  stopClockLoop();
  closeModal();
  // B5 (D21): roommates with prose enabled add one LLM call each at start —
  // say so in the loading message, or a 7-roommate house looks frozen behind
  // a static 'Moving in...' for a minute.
  const needsLLM = (cfg || (typeof pendingSandboxConfig !== 'undefined' ? pendingSandboxConfig : null) || {}).roommates
    ? ((cfg || (typeof pendingSandboxConfig !== 'undefined' ? pendingSandboxConfig : null) || {}).roommates || []).some(r => !roommateEffectiveSkipProse(r))
    : false;
  closeMainMenu();
  showLoading(needsLLM ? 'Writing your household\u2019s story...' : 'Moving in...');
  try {
    cfg = cfg || (pendingSandboxConfig = (typeof defaultSandboxConfig === 'function' ? defaultSandboxConfig() : {}));
    const seed = genSeed();
    // cfg.player is buildPlayerDraftForNewGame()'s shape; an empty/stale draft
    // falls back to a fresh one so the player is always fully rolled, exactly as a
    // solo start does. cfg.roommates' `partial` entries go to rollCastSlot
    // untouched, index-aligned with the generated residency pass in applySandboxPreset.
    const roommates = cfg.roommates || [];
    const partials = roommates.map(r => r && r.partial);
    const playerDraft = (cfg.player && Object.keys(cfg.player).length) ? cfg.player : (typeof buildPlayerDraftForNewGame === 'function' ? buildPlayerDraftForNewGame() : undefined);
    // cfg.economy's two DAY-shaped fields (rentGraceDays/billsStartDay) are
    // consumed here, at generation, not by applySandboxPreset below — they
    // shape the opening the factory builds rather than overwriting day stamps
    // it already made, which is what D19's guard forbids. money/taxReserve are
    // NOT day-shaped and are still applied by applySandboxPreset's step 6.
    pendingCast = SIM_generateHouse(seed, roommates.length, partials, playerDraft, cfg.economy);
    // Same contentConfig seeding as startSoloGame (the solo path bypasses the
    // cast-approval step where it is normally built) — bake the current mode in
    // before the state write.
    pendingCast.contentConfig = { tone: CONTENT_CONFIG.tone, contentPrefs: [], contentFlags: { ...CONTENT_CONFIG.contentFlags } };
    applySfwMode(pendingCast);
    // B5 (D21): per-roommate prose — authoredFields stamped from the config's
    // partial, then each roommate's prose is either LLM-expanded (skipProse off)
    // or templated from the fallback* family (skipProse on). The authored-field
    // stamp must precede the merge so a player-authored name/appearance survives.
    await applySandboxRoommateProse(pendingCast, cfg.roommates);
    // D18/D19: the sandbox patch lands between generation and the write. It never
    // touches meta.clock or rebases any day field — sandbox is always day 1; the
    // advanced thing is the house.
    applySandboxPreset(pendingCast, cfg);
    await writeGeneratedGameState(pendingCast);
    pendingCast = null;
    await syncGameStateFromKv();
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    addLogEntry('system', 'Sandbox up. The apartment opens on day 1, wherever you left it — the calendar never moved.');
    if (currentGameState.world.computer?.apps?.gigs) {
      currentGameState.world.computer.apps.gigs.lastRefreshDay = 0;
      generateGigsForDay(currentGameState, 1);
    }
    render(currentGameState, currentSceneState);
    startAutosave(() => currentGameState);
    startClockLoop();
  } catch (e) {
    console.error('Sandbox start failed:', e);
    showError('Failed to start sandbox game: ' + e.message);
  } finally {
    hideLoading();
  }
}

// B5 (D21): per-roommate prose pass for the sandbox path.
// approveCastAndStartGame expands prose for every NPC in the cast, but
// startSandboxGame mirrors startSoloGame, which skips that step (the solo
// path casts the player only, and the player's prose comes from the studio
// cutscene). Roommates would therefore ship with name='' (rollCastSlot
// leaves it empty for the prose pass to fill) and empty visual/history/
// sketch/sampleLines — the fields the portrait generator and the scene
// prompts read. The authored-field stamp comes from the config partial
// (roommateAuthoredFields), not the bible's own list, because the partial
// is the player's intent and the structured draw has nothing to say about
// it. skipProse roommates skip the LLM call entirely and get the
// fallback* family instead, so their bibles are just as complete.
// Mirrors approveCastAndStartGame's re-entry through validateCharacter:
// a prose failure keeps the structured draw rather than shipping prose
// that failed the single gate every character construction path returns
// through.
async function applySandboxRoommateProse(pendingCast, roommates) {
  const list = roommates || [];
  const npcIds = pendingCast?.npcIds || [];
  const fillFallback = (b) => ({
    ...b,
    name: b.name || fallbackName(b),
    visual: fallbackVisual(b),
    history: fallbackHistory(b),
    sketch: fallbackSketch(b),
    sampleLines: fallbackSampleLines(b),
  });
  await Promise.all(npcIds.map(async (id, i) => {
    const npc = pendingCast.npcs?.[id];
    if (!npc) return;
    const r = list[i];
    // D12: the config record carries the derived set too (SANDBOX_CONFIG's
    // authoredFields field), so the plan's data model stays true even though
    // the partial is the source it is derived from.
    const authoredFields = roommateAuthoredFields(r && r.partial);
    if (r && Array.isArray(r.authoredFields)) r.authoredFields = authoredFields;
    const bible = { ...npc.bible, authoredFields };
    if (roommateEffectiveSkipProse(r)) {
      npc.bible = fillFallback(bible);
      return;
    }
    try {
      const prose = await expandCharacterProse(bible);
      const candidateBible = mergeProseIntoBible(bible, prose, authoredFields);
      const { valid, errors, normalized } = validateCharacter({
        bible: candidateBible,
        bibleRevision: npc.bibleRevision,
        bibleChanges: npc.bibleChanges,
      });
      if (valid) {
        npc.bible = normalized.bible;
      } else {
        console.warn(`Sandbox prose for ${id} failed validation, keeping structured draw`, errors);
      }
    } catch (e) {
      console.warn(`Sandbox prose for ${id} failed, keeping structured draw: ${e.message}`);
    }
  }));

  // Same collision window as approveCastAndStartGame's parallel prose pass
  // — see dedupeCastNames.
  dedupeCastNames(pendingCast.npcs, pendingCast.player?.name);
}

async function approveCastAndStartGame() {
  if (!pendingCast) return;
  // Stop any previous game's autosave timer before the (potentially long)
  // prose-expansion + kv-write sequence below — see STATE's stopAutosave
  // for the exact race this closes. Resumed at the end once the new game
  // is fully written and currentGameState points at it.
  stopAutosave();
  // Same race, same reason: the clock loop mutates currentGameState.meta.clock
  // every frame and fires sim checkpoints against it. Left running across a
  // new-game transition it would keep advancing (and checkpointing) the
  // outgoing game's state while the new one is being written.
  stopClockLoop();
  closeModal();
  closeMainMenu();
  showLoading('Writing your household\'s story...');
  try {
    // Prose expansion in parallel — was a serial await-per-npc loop behind
    // a single static spinner, so a 7-roommate house was 7 sequential LLM
    // calls. Each result re-enters through validateCharacter (the single
    // gate every construction path returns through) before it's allowed
    // into the bible; a player-authored name is never overwritten by prose.
    await Promise.all(Object.entries(pendingCast.npcs).map(async ([id, npc]) => {
      // The Contractor Friend's bible is hand-authored (character brief,
      // src/ref/complete/contractor-tutorial-overhaul-plan.md Phase 1) — keep the
      // prose-expansion pass from regenerating their identity.
      if (id === CONTRACTOR_ID) return;
      const prose = await expandCharacterProse(npc.bible);
      // B1/D12 authored-field lock: mergeProseIntoBible skips any path the
      // bible's own authoredFields covers, so a player-authored name,
      // appearance or visual survives prose expansion by declaration rather
      // than by luck (physical used to survive only because
      // expandCharacterProse returns the same object it was handed; visual
      // was always clobbered). Empty authoredFields = the old merge, exactly.
      const candidateBible = mergeProseIntoBible(npc.bible, prose, npc.bible.authoredFields);
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

    // Discord feedback (2026-08-24): the parallel prose calls above can't
    // see each other's freshly-invented name mid-flight — one pass now that
    // every promise has settled catches any collision (see dedupeCastNames).
    dedupeCastNames(pendingCast.npcs, pendingCast.player?.name);

    // Settings & Pause Overhaul Phase 4 (D5): apply the SFW flag to the
    // approved cast's contentConfig BEFORE the state write, so the new
    // game's meta.contentConfig ships with the current mode baked in.
    applySfwMode(pendingCast);
    await writeGeneratedGameState(pendingCast);
    pendingCast = null;

    await syncGameStateFromKv();
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);

    addLogEntry('system', 'Welcome to your new apartment!');
    render(currentGameState, currentSceneState);
    startAutosave(() => currentGameState);
    startClockLoop();
  } catch (e) {
    console.error('New game failed:', e);
    showError('Failed to start new game: ' + e.message);
  } finally {
    hideLoading();
  }
}

async function continueGame() {
  // Same race as approveCastAndStartGame (see STATE's stopAutosave) — the
  // menu is reachable mid-game (MENU_ACTIONS), so a previous game's timer
  // could still be armed when the player loads a (possibly different) save.
  stopAutosave();
  stopClockLoop(); // same reason — see approveCastAndStartGame
  closeModal();
  closeMainMenu();
  showLoading('Loading...');
  try {
    await syncGameStateFromKv();
    if (currentGameState) {
      currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
      render(currentGameState, currentSceneState);
      startAutosave(() => currentGameState);
      if (currentGameState.world.computer?.power === 'on') resetTimeContext(currentGameState);
      startClockLoop();
    } else {
      showMainMenu('boot');
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
    // Hot Singles (AfterHours Phase 7): backfill the roster for saves written
    // before it existed, on the single load path both boot() and
    // continueGame() go through — and crucially BEFORE the first render. A
    // save resumed with the browser already sitting on AfterHours renders the
    // site without ever running doBrowserVisit's onSiteOpen hook, and the
    // roster must never be generated from inside a render pass.
    ensureHotSinglesRoster(currentGameState);
  }
}

// ===== SAVE SYSTEM V2 (Phase 9): handlers =====
// The slot grid itself is rendered by RENDER's renderSaveMenu; UI owns the
// verbs. Every save verb routes through STATE's saveToSlot/writeSaveRecord
// — the slot grid is a view over kv.saves/kv.saveIndex, never a second
// mutation path. All of these are meta actions: free, zero game time.

let pendingExportB64 = null; // the last exported blob, for copy/download

function saveSlotSummary(record) {
  const m = record?.meta;
  if (!m) return 'this slot';
  return `Day ${m.day ?? 1} — ${formatTime(m.minutes ?? CLOCK.startMinutes)} (${ROOMS[m.roomId]?.name || m.roomId || 'unknown room'})`;
}

// Promise-based confirm over the shared modal (same pattern as RENDER's
// openRoomSearchModal).
function askConfirm(message, confirmLabel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions) { resolve(false); return; }
    const finish = (val) => { overlay.removeAttribute('data-open'); resolve(val); };
    title.textContent = 'Are you sure?';
    body.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = message;
    body.appendChild(p);
    actions.innerHTML = '';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn';
    ok.textContent = confirmLabel || 'Confirm';
    ok.addEventListener('click', () => finish(true));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(false));
    actions.appendChild(ok);
    actions.appendChild(cancel);
    overlay.setAttribute('data-open', '');
  });
}

// The live scene's image-cache key — the thumbnail store. Read from the DOM
// so the record points at the exact frame the player was looking at (the
// fallback in STATE recomputes a present-based key when absent).
function currentSceneKey() {
  return document.getElementById('scene-img')?.getAttribute('data-scene-key') || undefined;
}

// Persist the live folders, then capture a record into a slot. Both go
// through the established paths (saveAtBoundary → SAVE_KEYS; saveToSlot →
// captureSave) so the live kv state always matches the most recent record.
async function persistAndSave(kind, slotId) {
  await saveAtBoundary('manual', currentGameState);
  const record = await saveToSlot(currentGameState, kind, { slotId, sceneKey: currentSceneKey() });
  return record;
}

function savePanelOpen() {
  const panel = document.getElementById('save-panel');
  return !!panel && !panel.hidden;
}

async function doQuickSave() {
  if (!currentGameState) { showError('Start or continue a game first.'); return; }
  showLoading('Quick saving...');
  try {
    await persistAndSave('quick');
    addLogEntry('system', 'Game quick-saved.');
    if (savePanelOpen()) await renderSaveMenu();
  } catch (e) {
    showError('Quick save failed: ' + e.message);
  } finally {
    hideLoading();
  }
}

async function doLoadQuick() {
  showLoading('Loading quicksave...');
  try {
    const record = await getSaveRecord('quick');
    if (!record) { showError('No quicksave yet.'); openSaveMenu('load'); return; }
    await resumeFromRecord(record);
  } catch (e) {
    showError('Quick load failed: ' + e.message);
    openSaveMenu('load');
  } finally {
    hideLoading();
  }
}

// Save mode: a free slot saves straight in; an occupied slot asks first.
async function doSaveToSlot(slotId) {
  if (!currentGameState) { showError('Start or continue a game first.'); return; }
  const existing = await getSaveRecord(slotId);
  if (existing) {
    const ok = await askConfirm(`Overwrite ${saveSlotSummary(existing)}?`, 'Overwrite');
    if (!ok) return;
  }
  await performSaveToSlot(slotId);
}

// Confirm dialog already shown — used when the card's primary action IS
// "Overwrite".
async function doOverwriteSlot(slotId) {
  if (!currentGameState) { showError('Start or continue a game first.'); return; }
  await performSaveToSlot(slotId);
}

async function performSaveToSlot(slotId) {
  showLoading('Saving...');
  try {
    await persistAndSave('manual', slotId);
    addLogEntry('system', `Saved to ${slotId.replace('_', ' ')}.`);
    if (savePanelOpen()) await renderSaveMenu();
  } catch (e) {
    showError('Save failed: ' + e.message);
  } finally {
    hideLoading();
  }
}

// Load a slot into the live game. Same clock/autosave dance as
// continueGame — a previous session's timers must be stopped before the
// (potentially long) restore+migrate sequence writes anything.
async function resumeFromRecord(record) {
  stopAutosave();
  stopClockLoop();
  closeSaveMenu();
  closeModal();
  closeMainMenu();
  try {
    const loaded = await restoreSave(record);
    if (!loaded) { showError('That save could not be loaded.'); return; }
    ensureHotSinglesRoster(loaded);
    currentGameState = loaded;
    // Settings & Pause Overhaul Phase 4 (D5): the SFW flag is re-applied
    // after restore so a save written before the toggle picked up the
    // current mode (and a mid-SFW-mode load of an older save gets patched
    // too). Saved contentConfig is authoritative for everything else.
    applySfwMode(currentGameState);
    currentSceneState = getSceneParticipants(loaded.player, loaded.npcs, loaded.world);
    render(loaded, currentSceneState);
    startAutosave(() => currentGameState);
    if (loaded.world.computer?.power === 'on') resetTimeContext(loaded);
    startClockLoop();
    addLogEntry('system', `Loaded save — ${saveSlotSummary(record)}.`);
  } catch (e) {
    showError(e.message);
    openSaveMenu('load');
  }
}

async function doLoadFromSlot(slotId) {
  try {
    const record = await getSaveRecord(slotId);
    if (!record) { showError('No save in that slot.'); openSaveMenu('load'); return; }
    const ok = await askConfirm(`Load ${saveSlotSummary(record)}? Current progress in this session will be replaced.`, 'Load');
    if (!ok) return;
    showLoading('Loading save...');
    await resumeFromRecord(record);
  } catch (e) {
    showError('Load failed: ' + e.message);
  } finally {
    hideLoading();
  }
}

async function doDeleteSlot(slotId) {
  const record = await getSaveRecord(slotId);
  const ok = await askConfirm(`Delete ${record ? saveSlotSummary(record) : 'this save'}? This cannot be undone.`, 'Delete');
  if (!ok) return;
  await deleteSaveSlot(slotId);
  addLogEntry('system', `Deleted save slot ${slotId.replace('_', ' ')}.`);
  if (savePanelOpen()) await renderSaveMenu();
}

async function doExportSlot(slotId) {
  showLoading('Exporting...');
  try {
    const record = await getSaveRecord(slotId);
    if (!record) { showError('No save in that slot.'); return; }
    pendingExportB64 = await exportSaveRecord(record);
    showExportModal(record, pendingExportB64);
  } catch (e) {
    showError('Export failed: ' + e.message);
  } finally {
    hideLoading();
  }
}

function showExportModal(record, b64) {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;
  title.textContent = 'Export Save';
  body.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'dim tiny';
  p.textContent = `Copied or downloaded, this blob installs into a manual slot on another device. ${saveSlotSummary(record)}.`;
  body.appendChild(p);
  const ta = document.createElement('textarea');
  ta.id = 'export-text';
  ta.className = 'svp-import-text';
  ta.readOnly = true;
  ta.value = b64;
  body.appendChild(ta);
  actions.innerHTML = '';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => handleCopyExport());
  const dl = document.createElement('button');
  dl.type = 'button';
  dl.className = 'btn btn-secondary';
  dl.textContent = 'Download';
  dl.addEventListener('click', () => handleDownloadExport());
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-secondary';
  close.textContent = 'Close';
  close.addEventListener('click', () => overlay.removeAttribute('data-open'));
  actions.appendChild(copy);
  actions.appendChild(dl);
  actions.appendChild(close);
  overlay.setAttribute('data-open', '');
}

async function handleCopyExport() {
  if (!pendingExportB64) return;
  try {
    await navigator.clipboard.writeText(pendingExportB64);
  } catch (e) {
    // Clipboard API blocked (permissions/unsaved iframe) — select the
    // textarea so the player can Ctrl/Cmd+C manually.
    const ta = document.getElementById('export-text');
    if (ta) { ta.focus(); ta.select(); }
    return;
  }
  addLogEntry('system', 'Save copied to clipboard.');
  closeModal();
}

function handleDownloadExport() {
  if (!pendingExportB64) return;
  const blob = new Blob([pendingExportB64], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `slice-of-life-save-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openImportModal() {
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  if (!overlay || !title || !body || !actions) return;
  title.textContent = 'Import Save';
  body.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'dim tiny';
  p.textContent = 'Paste an exported save below, or choose the file. It installs into a free manual slot — load it from the grid afterwards.';
  body.appendChild(p);
  const ta = document.createElement('textarea');
  ta.id = 'import-text';
  ta.className = 'svp-import-text';
  ta.placeholder = 'Paste save data here…';
  body.appendChild(ta);
  const fileRow = document.createElement('div');
  fileRow.className = 'menu-actions';
  fileRow.style.marginTop = '8px';
  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.className = 'btn btn-secondary tiny';
  fileBtn.textContent = 'Choose file…';
  fileBtn.addEventListener('click', () => document.getElementById('import-file-input')?.click());
  fileRow.appendChild(fileBtn);
  body.appendChild(fileRow);
  actions.innerHTML = '';
  const doIt = document.createElement('button');
  doIt.type = 'button';
  doIt.className = 'btn';
  doIt.textContent = 'Import';
  doIt.addEventListener('click', () => handleImportSave());
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => overlay.removeAttribute('data-open'));
  actions.appendChild(doIt);
  actions.appendChild(cancel);
  overlay.setAttribute('data-open', '');
  setTimeout(() => ta.focus(), 0);
}

async function handleImportSave() {
  const ta = document.getElementById('import-text');
  const text = (ta ? ta.value : '').trim();
  if (!text) { showError('Paste a save or choose a file first.'); return; }
  showLoading('Importing...');
  try {
    const record = await importSaveRecord(text);
    const cap = await saveCapacityInfo();
    if (cap.total >= SAVE_TUNING.maxTotalSaves) {
      throw new Error(`Too many saves (${SAVE_TUNING.maxTotalSaves} max). Delete one before importing.`);
    }
    const slotId = await allocateManualSlot();
    await writeSaveRecord(record, slotId);
    closeModal();
    const versionNote = record._importedGameVersion && record._importedGameVersion !== GAME_VERSION
      ? ` Note: it was exported by game version ${record._importedGameVersion} (current: ${GAME_VERSION}).`
      : '';
    addLogEntry('system', `Imported save into slot ${slotId.replace('_', ' ')}.${versionNote}`);
    if (savePanelOpen()) await renderSaveMenu();
  } catch (e) {
    showError('Import failed: ' + e.message);
  } finally {
    hideLoading();
  }
}

// Wire the hidden file input (index.html) once — read a chosen file into
// the import textarea.
function wireImportFileInput() {
  const input = document.getElementById('import-file-input');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ta = document.getElementById('import-text');
      if (ta) ta.value = String(reader.result || '');
    };
    reader.readAsText(file);
    input.value = '';
  });
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
  flushPendingPeepBubble();
}

// --- Deferred caught-peeping bubble (Phase 6) ---
// advanceAndResolve detects the peep but must not raise the modal itself:
// it can be running mid-batch behind the loading overlay. It queues here
// instead, and this flushes once nothing is covering the screen. Holds at
// most one — several NPCs catching the player in a single batch is absurd,
// and the extras are dropped rather than stacked.
let pendingPeepBubble = null;

function flushPendingPeepBubble() {
  if (!pendingPeepBubble) return;
  // Still covered — leave it queued; the next hideLoading will retry.
  if (document.querySelector('.loading-overlay:not(.hidden)')) return;
  const peep = pendingPeepBubble;
  pendingPeepBubble = null;
  // setTimeout(0) so the in-flight render finishes before the bubble is
  // appended to a container that render is still rebuilding.
  setTimeout(() => showNpcCaughtPeepingBubble(currentGameState, peep.npcId, peep.playerState), 0);
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
  // Scene reader Phase 1 (D2): every beat records WHEN and WHERE it happened
  // and which scene it belongs to. None of that was recorded before, which
  // made "what happened while I was in the kitchen" impossible to reconstruct
  // — the information had simply never been captured. sceneHistory derives
  // the whole history drawer from these three fields, so nothing about a
  // closed scene needs storing separately.
  const scene = currentScene(currentGameState);
  currentGameState.meta.sessionLog.push({
    type, text, speaker,
    day: currentGameState.meta.clock.day,
    minutes: currentGameState.meta.clock.minutes,
    sceneId: scene.id,
    roomId: scene.roomId,
  });
  currentGameState.meta.sessionLog = currentGameState.meta.sessionLog.slice(-100);
  queueWrite('meta', 'meta', currentGameState.meta);
  // Phase 4: this path draws the scene too, so it must mark callouts spent
  // for the same reason render() does — otherwise a beat arriving while a
  // callout is up would redraw it and leave it unmarked, and it would shout
  // again on the next render.
  const composedScene = renderSceneReader(currentGameState, currentSceneState);
  markCalloutsShouted(currentGameState, composedScene);
  markDoorCuesShown(currentGameState, composedScene);
  renderSceneMoodles(currentGameState);
}

// --- Modals ---

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.removeAttribute('data-open');
}

// --- Image info/reroll system (D17 + D17.5) ---
// One modal + one set of plumbing, shared by EVERY generated image. Each
// surface registers its <img> with setImageMeta(imgEl, meta), where meta =
// { label, prompt, reroll } and reroll is an async function returning
// {ok:true} or {error}. The scene backdrop keeps its own static ⓘ corner
// button (openSceneImageInfo below); every other registered image gets the
// floating ⓘ (imageInfoFloatBtn) that appears at the hovered image's
// top-right corner. Both open the same modal.
const imageMetaRegistry = new WeakMap();
function setImageMeta(imgEl, meta) {
  if (imgEl && meta) imageMetaRegistry.set(imgEl, meta);
}

let imageInfoFloatBtn = null;
let currentFloatingMeta = null;

function getImageInfoFloatBtn() {
  if (imageInfoFloatBtn) return imageInfoFloatBtn;
  imageInfoFloatBtn = document.createElement('button');
  imageInfoFloatBtn.className = 'scene-info-btn image-info-float';
  imageInfoFloatBtn.textContent = 'ⓘ';
  imageInfoFloatBtn.title = 'About this image';
  imageInfoFloatBtn.setAttribute('aria-label', 'About this image');
  imageInfoFloatBtn.hidden = true;
  document.body.appendChild(imageInfoFloatBtn);
  imageInfoFloatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentFloatingMeta) openImageInfo(currentFloatingMeta);
    hideImageInfoFloatBtn();
  });
  return imageInfoFloatBtn;
}

function showImageInfoFloatBtn(imgEl) {
  const btn = getImageInfoFloatBtn();
  const r = imgEl.getBoundingClientRect();
  btn.style.left = Math.max(6, Math.min(innerWidth - 34, r.right - 30)) + 'px';
  btn.style.top = Math.max(6, r.top + 6) + 'px';
  currentFloatingMeta = imageMetaRegistry.get(imgEl);
  btn.hidden = false;
}

function hideImageInfoFloatBtn() {
  if (imageInfoFloatBtn) imageInfoFloatBtn.hidden = true;
  currentFloatingMeta = null;
}

// The shared info/reroll modal. meta = { label, prompt, seed, negativePrompt,
// reroll } where reroll is async (fields) => ({ok:true}|{error}) and fields
// = { prompt, seed|null, negativePrompt }. A null seed means "roll fresh" —
// the modal only passes a concrete seed when the player typed one different
// from the pre-fill. reroll null renders the fields read-only (character
// portraits, where the seed is the identity anchor).
let imageInfoActive = null; // {label, prompt, seed, negativePrompt, reroll}

function openImageInfo(meta) {
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const actions = document.getElementById('modal-actions');
  const overlay = document.getElementById('modal-overlay');
  if (!title || !body || !actions || !overlay || !meta) return;
  imageInfoActive = meta;
  hideImageInfoFloatBtn();
  const editable = !!meta.reroll;

  title.textContent = meta.label || 'Image';
  body.innerHTML = '';

  const promptLbl = document.createElement('div');
  promptLbl.className = 'scene-prompt-label';
  promptLbl.textContent = 'Prompt';
  body.appendChild(promptLbl);
  const field = document.createElement('textarea');
  field.className = 'scene-prompt-field';
  field.readOnly = !editable;
  if (!editable) field.disabled = true;
  field.value = meta.prompt || '';
  body.appendChild(field);

  const seedRow = document.createElement('div');
  seedRow.className = 'scene-prompt-seed-row';
  const seedLbl = document.createElement('div');
  seedLbl.className = 'scene-prompt-label';
  seedLbl.textContent = 'Seed';
  const seedInput = document.createElement('input');
  seedInput.className = 'scene-prompt-seed';
  seedInput.type = 'number';
  seedInput.disabled = !editable;
  seedInput.value = meta.seed != null ? String(meta.seed) : '';
  seedRow.append(seedLbl, seedInput);
  if (editable) {
    const seedHint = document.createElement('span');
    seedHint.className = 'scene-prompt-seed-hint';
    seedHint.textContent = 'leave as-is to roll a fresh frame';
    seedRow.appendChild(seedHint);
  }
  body.appendChild(seedRow);

  const negLbl = document.createElement('div');
  negLbl.className = 'scene-prompt-label';
  negLbl.textContent = 'Negative prompt';
  body.appendChild(negLbl);
  const negInput = document.createElement('input');
  negInput.className = 'scene-prompt-neg';
  negInput.type = 'text';
  negInput.disabled = !editable;
  negInput.value = meta.negativePrompt || '';
  body.appendChild(negInput);

  const hint = document.createElement('p');
  hint.className = 'scene-prompt-hint';
  hint.textContent = editable
    ? 'Edit any field, then Regenerate renders with your values.'
    : 'This image is tied to a fixed seed (character identity) — read-only.';
  body.appendChild(hint);
  const err = document.createElement('p');
  err.className = 'scene-prompt-error';
  err.id = 'scene-prompt-error';
  err.hidden = true;
  body.appendChild(err);

  actions.innerHTML = (editable
    ? '<button class="btn scene-reroll-btn" id="scene-reroll-btn" data-action="scene.image-reroll">↻ Regenerate</button>'
    : '')
    + '<button class="btn btn-secondary" data-action="close-modal">Close</button>';
  // Defensive: the platform's `hidden` attribute always wins over CSS, so a
  // stale hidden on the overlay would swallow the whole modal. The app's
  // other modals never set it, but clearing it here costs nothing.
  overlay.hidden = false;
  overlay.setAttribute('data-open', '');
}

// The scene backdrop's static ⓘ — the prompt/seed are stamped by renderScene
// (RENDER) whenever the scene art changes; before the first scene renders
// there is nothing to show.
// D11 (character-cutout Phase 3): the prompt/seed/negative shown here now
// describe the room PLATE, and Regenerate rerolls only that — the cutout
// layers standing on it are untouched.
function openSceneImageInfo() {
  openImageInfo({
    label: 'Scene Art',
    prompt: (typeof currentSceneArtPrompt === 'string' && currentSceneArtPrompt)
      ? currentSceneArtPrompt
      : '',
    seed: typeof currentSceneArtSeed === 'number' ? currentSceneArtSeed : null,
    negativePrompt: backgroundNegPrompt(),
    reroll: (fields) => rerollSceneImage(currentGameState, currentSceneState, fields),
  });
}

// Generic Regenerate handler for whichever image the open modal belongs to.
// Reads the field values: the prompt and negative prompt pass through
// verbatim; the seed only passes when the player typed something different
// from the pre-fill (null otherwise = "roll fresh").
async function doRerollImageInfo() {
  const meta = imageInfoActive;
  if (!meta || !meta.reroll) return;
  const promptField = document.querySelector('.scene-prompt-field');
  const seedField = document.querySelector('.scene-prompt-seed');
  const negField = document.querySelector('.scene-prompt-neg');
  const btn = document.getElementById('scene-reroll-btn');
  const err = document.getElementById('scene-prompt-error');
  let seedArg = null;
  if (seedField) {
    const prefilled = meta.seed != null ? String(meta.seed) : '';
    const typed = seedField.value.trim();
    if (typed !== prefilled) {
      if (typed !== '') {
        seedArg = Number(typed);
        if (!Number.isFinite(seedArg)) {
          if (err) { err.textContent = 'Seed must be a whole number, or empty.'; err.hidden = false; }
          return;
        }
      }
    }
  }
  if (btn) btn.disabled = true;
  if (err) err.hidden = true;
  showLoading('Rerolling image…');
  try {
    const result = await meta.reroll({
      prompt: promptField ? promptField.value : meta.prompt,
      seed: seedArg,
      negativePrompt: negField ? negField.value.trim() : meta.negativePrompt,
    });
    if (result && result.ok) {
      closeModal();
    } else {
      if (err) { err.textContent = `Couldn't regenerate: ${result?.error || 'unknown error'}`; err.hidden = false; }
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if (err) { err.textContent = `Couldn't regenerate: ${e.message}`; err.hidden = false; }
    if (btn) btn.disabled = false;
  } finally {
    hideLoading();
  }
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

  // Perception (SIGNALS) — Phase 1's only surface, and the same instrument for
  // the same reason as the telemetry block above. Shows what is being emitted
  // anywhere in the apartment, then what the player and each present NPC can
  // actually sense from where they are standing. A signal that never appears
  // in the "perceived" lists is dead weight (RI1).
  const perceptionEl = document.getElementById('dbg-perception');
  if (perceptionEl) perceptionEl.textContent = describePerceptionDebug(currentGameState);
}

// Human-readable perception dump. Built as text rather than JSON because the
// useful thing here is a comparison — who senses what, from where — and a
// nested object buries that.
function describePerceptionDebug(gs) {
  const lines = [];
  const emitted = deriveStandingSignals(gs);
  lines.push(`EMITTED (${emitted.length} standing)`);
  if (emitted.length === 0) lines.push('  (nothing — the apartment is clean)');
  for (const s of emitted) {
    lines.push(`  ${s.signalId.padEnd(14)} ${String(s.intensity).padEnd(5)} in ${ROOMS[s.roomId]?.name || s.roomId}  <- ${s.sourceId}`);
  }

  const report = (label, id, roomId) => {
    lines.push('');
    const att = perceptionOf(gs, id);
    lines.push(`${label} — in ${ROOMS[roomId]?.name || roomId}, attention ${att.toFixed(2)}`);
    const perceived = mergePerceived(perceiveSignals(gs, id, roomId));
    if (perceived.length === 0) { lines.push('  (senses nothing)'); return; }
    for (const r of perceived) {
      const where = r.here ? 'here' : `from ${ROOMS[r.sourceRoomId]?.name || r.sourceRoomId}`;
      lines.push(`  [${r.channel}] ${r.signalId} — ${r.band} (${r.intensity.toFixed(3)}), ${where}`);
      lines.push(`      "${signalPhrase(r, gs)}"`);
    }
  };

  report('PLAYER', 'player', gs.player.location);
  for (const npcId of getPresentNpcIds(gs.npcs, gs.player.location)) {
    report(gs.npcs[npcId]?.bible?.name || npcId, npcId, gs.npcs[npcId].location);
  }
  return lines.join('\n');
}

// ===== /SECTION: UI =====

// ===== SECTION: BOOT =====

async function boot() {
  // Init storage
  await initStorage();
  // Attach event delegation (the data-action chain the menu buttons route
  // through) and one-time wiring for the save import file picker.
  attachEventHandlers();
  wireImportFileInput();

  // Menu overhaul Phase 10: the game ALWAYS boots to the main menu now.
  // Nothing auto-loads into play. Continue is enabled from kv.saveIndex
  // (the most recent save in the most recent run) by refreshMenuContinue,
  // and disabled when no save exists. loadMenuOptions pulls the
  // browser-local settings (Background art / Autosave) into the cache the
  // slideshow and startAutosave consult.
  await loadMenuOptions();
  // Settings & Pause Overhaul Phase 1: the single settings store. Loaded
  // before first render — every later phase reads settingsCache through
  // the settings.js helpers. loadSettings is idempotent, so a future
  // path that touches settings earlier can never break this call.
  await loadSettings();
  showMainMenu('boot');

  // Exit save: best-effort — navigation can cut off IndexedDB writes, but
  // the autosave ring is the recovery path anyway, so a missed exit-save
  // costs nothing recoverable.
  window.addEventListener('pagehide', () => {
    if (currentGameState && typeof saveToSlot === 'function') {
      saveToSlot(currentGameState, 'exit').catch(() => {});
    }
  });
}

function attachEventHandlers() {
  // Global click delegation
  document.addEventListener('click', (e) => {
    // Nested action nav (D14): a "‹" back chip walks the drill-down up one
    // level; a group chip ("X ▸") drills INTO the chips row. Both consume
    // the click — a group chip never executes an action.
    const navBack = e.target.closest('[data-nav-back]');
    if (navBack) { navigateActionBack(); return; }
    const parentChip = e.target.closest('[data-submenu-parent]');
    if (parentChip) {
      const key = parentChip.getAttribute('data-group-key');
      if (key) openActionGroup(key);
      return;
    }

    // D17.5: the floating image-info ⓘ over registered generated images.
    // pointerover fires on hover (desktop) and on tap (touch) — the button
    // appears at the image's top-right corner and the image's own tap still
    // goes through. Only reasonably-sized images qualify so gallery thumbs
    // stay clean; #scene-img keeps its static corner button instead.
    document.addEventListener('pointerover', (e) => {
      const fbtn = imageInfoFloatBtn;
      if (fbtn && !fbtn.hidden && e.target === fbtn) return;
      const t = e.target;
      const img = (t instanceof Element && t.closest ? t.closest('img') : null);
      if (!img || img.id === 'scene-img' || !imageMetaRegistry.has(img)) { hideImageInfoFloatBtn(); return; }
      const r = img.getBoundingClientRect();
      if (r.width < 140 || r.height < 140 || r.bottom < 0 || r.top > innerHeight) { hideImageInfoFloatBtn(); return; }
      showImageInfoFloatBtn(img);
    });
    window.addEventListener('scroll', hideImageInfoFloatBtn, true);
    window.addEventListener('resize', hideImageInfoFloatBtn);

    const target = e.target.closest('[data-action]');
    if (!target) {
      // Check for floor plan room click (SVG rect with data-room-id)
      if (e.target.tagName === 'rect' && e.target.hasAttribute('data-room-id')) {
        const roomId = e.target.getAttribute('data-room-id');
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
    if (target.hasAttribute('data-room-id')) extra.roomId = target.getAttribute('data-room-id');
    if (target.hasAttribute('data-amount')) extra.amount = Number(target.getAttribute('data-amount'));
    if (target.hasAttribute('data-direction')) extra.direction = Number(target.getAttribute('data-direction'));
    if (target.hasAttribute('data-search-text')) extra.searchText = target.getAttribute('data-search-text');
    if (target.hasAttribute('data-source')) extra.source = target.getAttribute('data-source');
    if (target.hasAttribute('data-key')) extra.key = target.getAttribute('data-key');
    // Phase 10 (D12): header speed-cluster buttons carry which SPEED_PRESETS
    // id they set.
    if (target.hasAttribute('data-id')) extra.id = target.getAttribute('data-id');
    if (target.hasAttribute('data-days')) extra.days = Number(target.getAttribute('data-days'));
    if (target.hasAttribute('data-service')) extra.service = target.getAttribute('data-service');
    // Intimacy & Voyeurism Phase 15: codex verbs carry which ledger entry
    // they consume (the STORED index, per spendCodexEntry's contract).
    if (target.hasAttribute('data-index')) extra.index = Number(target.getAttribute('data-index'));
    // Inventory overhaul Phase 1: inventory verbs carry which stack the
    // button was drawn for (the detail pane rebuilds on selection, so a
    // stale click could otherwise act on a different item).
    if (target.hasAttribute('data-def-id')) extra.defId = target.getAttribute('data-def-id');
    // Inventory overhaul Phase 2: container verbs carry which container
    // object the button was drawn for (chips and the chest's Take/Put/
    // All buttons).
    if (target.hasAttribute('data-obj-id')) extra.objId = target.getAttribute('data-obj-id');
    // Save system v2 (Phase 9): save-menu verbs carry which slot the card
    // was drawn for.
    if (target.hasAttribute('data-slot')) extra.slotId = target.getAttribute('data-slot');
    // Settings & Pause Overhaul Phase 2 (D2): the settings sub-screen's
    // verbs carry which tab (data-tab), which settings field a toggle/cycle
    // row targets (data-field), and the filter-view "jump to tab" headers
    // ask for the filter to be cleared on jump (data-clear-filter).
    if (target.hasAttribute('data-tab')) extra.tab = target.getAttribute('data-tab');
    if (target.hasAttribute('data-field')) extra.field = target.getAttribute('data-field');
    if (target.hasAttribute('data-clear-filter')) extra.clearFilter = true;
    // Phase 5: the Population slider nudge buttons carry the changed key +
    // step (data-key is already collected above) and delta.
    if (target.hasAttribute('data-delta')) extra.delta = Number(target.getAttribute('data-delta'));
    // Device-parameterised nav (BrineOS 0.2): the shell that owns the node
    // declares its device via data-device on itself or any ancestor, and
    // computer.open-screen dispatches on it — the phone shell will emit
    // data-device="phone" and route to phone nav, never computer windows.
    const deviceNode = target.closest('[data-device]');
    if (deviceNode) extra.device = deviceNode.getAttribute('data-device');
    handleAction(action, npcId || null, extra);
  });

  // Nested action nav (D14): Escape pops the whole drill-down back to the
  // active tab's root.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _actionNavStack.length) {
      resetActionNav();
      renderActionChipsOnly();
    }
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

  // Conversation overlay input
  const convInput = document.getElementById('conv-input');
  if (convInput) {
    convInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && convInput.value.trim()) {
        e.preventDefault();
        handleAction('conv.send');
      }
    });
  }
  const convSendBtn = document.getElementById('conv-send-btn');
  if (convSendBtn) {
    convSendBtn.addEventListener('click', () => handleAction('conv.send'));
  }
  // Asks plan Phase 2 — the Request-tree menu controls. The + toggles the
  // popover; back/close and the rows handle their own nav/insert; the
  // input's `input` event keeps the hint under it in sync. Escape closes the
  // menu (ahead of the other overlays' Escape handlers — it is the least
  // destructive thing on screen).
  const convAttachBtn = document.getElementById('conv-attach-btn');
  if (convAttachBtn) {
    convAttachBtn.addEventListener('click', () => {
      if (askMenuIsOpen()) closeAskMenu();
      else openAskMenu();
    });
  }
  const convAskCloseBtn = document.getElementById('conv-ask-close-btn');
  if (convAskCloseBtn) convAskCloseBtn.addEventListener('click', closeAskMenu);
  const convAskBackBtn = document.getElementById('conv-ask-back-btn');
  if (convAskBackBtn) convAskBackBtn.addEventListener('click', askMenuGoBack);
  const convAskBody = document.getElementById('conv-ask-body');
  if (convAskBody) {
    convAskBody.addEventListener('click', (e) => {
      const catRow = e.target.closest('[data-ask-cat]');
      if (catRow) { askMenuGoCategory(catRow.getAttribute('data-ask-cat')); return; }
      const leafRow = e.target.closest('[data-ask-id]');
      if (leafRow) askMenuInsertLeaf(leafRow.getAttribute('data-ask-id'));
    });
  }
  if (convInput) {
    convInput.addEventListener('input', updateAskHint);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && askMenuIsOpen()) closeAskMenu();
  });

  // Drawer toggles (mobile) — the two drawers slide in from opposite
  // edges and are wide enough to overlap each other and the content
  // between them, so only one may be open at a time. Opening one always
  // closes the other rather than each toggle button only knowing about
  // its own side.
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.getAttribute('data-toggle');
      const sidebar = side === 'left' ? document.getElementById('sidebar-left') : document.getElementById('sidebar-right');
      const other = side === 'left' ? document.getElementById('sidebar-right') : document.getElementById('sidebar-left');
      if (!sidebar) return;
      const opening = !sidebar.hasAttribute('data-open');
      other?.removeAttribute('data-open');
      sidebar.toggleAttribute('data-open', opening);
    });
  });

  // Footer HUD toggle (mobile-layout-space hybrid plan) — the peek bar's
  // drag handle expands the footer into its full stack (status/tabs/chips)
  // and the same button collapses it back. State lives entirely on
  // #footer's data-hud-expanded attribute; render() never touches it, so
  // it survives every re-render on its own until tapped again.
  const footerHudToggle = document.getElementById('footer-hud-toggle');
  if (footerHudToggle) {
    footerHudToggle.addEventListener('click', () => {
      const footer = document.getElementById('footer');
      if (!footer) return;
      const expanding = !footer.hasAttribute('data-hud-expanded');
      footer.toggleAttribute('data-hud-expanded', expanding);
      footerHudToggle.setAttribute('aria-expanded', String(expanding));
    });
  }

  // VN refactor (D15): the scene backdrop generates toward the viewport's
  // orientation, so flipping a phone landscape↔portrait must repaint it —
  // renderScene is keyed on orientation and will pick up (and cache) the
  // right frame. Only fires when the orientation actually flips, never on
  // every resize jitter.
  let _lastSceneOrientation = null;
  window.addEventListener('resize', () => {
    const orient = innerWidth >= innerHeight ? 'landscape' : 'portrait';
    if (orient === _lastSceneOrientation) return;
    _lastSceneOrientation = orient;
    if (currentGameState) render(currentGameState, currentSceneState);
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

  // Full floor plan overlay (desktop legibility): clicking the dark stage
  // closes it, and Escape does too (the handlers here are late in the list,
  // so a modal/conversation open on top keeps its own Escape behaviour).
  const floorplanOverlay = document.getElementById('floorplan-overlay');
  if (floorplanOverlay) {
    floorplanOverlay.addEventListener('click', (e) => {
      if (e.target === floorplanOverlay) closeFloorPlanOverlay();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && floorplanOverlay && !floorplanOverlay.hidden) closeFloorPlanOverlay();
  });

  // Inventory panel (overhaul Phase 1): row selection, search, sort, and
  // Escape-to-close. Search/sort re-render only the panel, not the whole
  // page, so typing never blurs the input mid-keystroke.
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-inv-row]');
    if (!row) return;
    const defId = row.getAttribute('data-def-id');
    if (defId && typeof selectInventoryStack === 'function') selectInventoryStack(defId);
  });
  const invpSearch = document.getElementById('invp-search');
  if (invpSearch) {
    invpSearch.addEventListener('input', () => {
      invpSearchText = invpSearch.value;
      if (currentGameState) renderInventoryPanel(currentGameState);
    });
  }
  const invpSort = document.getElementById('invp-sort');
  if (invpSort) {
    invpSort.addEventListener('change', () => {
      invpSortMode = invpSort.value;
      if (currentGameState) renderInventoryPanel(currentGameState);
    });
  }

  // Container panel (overhaul Phase 2): row selection on either side, qty
  // clamp, and Escape-to-close (falls back to closing the bag if the chest
  // is closed). Selection only re-renders the panel, never the whole page.
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-ctr-row]');
    if (!row || typeof selectContainerStack !== 'function') return;
    const side = row.getAttribute('data-side');
    const defId = row.getAttribute('data-def-id');
    if (side && defId) selectContainerStack(side, defId);
  });
  const ctrQty = document.getElementById('ctr-qty');
  if (ctrQty) {
    ctrQty.addEventListener('change', () => {
      const val = Math.floor(Number(ctrQty.value));
      if (!Number.isFinite(val) || val < 1) ctrQty.value = 1;
      if (currentGameState && typeof renderContainerPanel === 'function') renderContainerPanel(currentGameState);
    });
  }
  // Wardrobe panel (intimacy-voyeurism Phase 5): the two STATIC buttons. The
  // slot/wear/none rows rebuild with every render, so they attach their own
  // listeners inside renderWardrobePanel; these exist once at boot.
  const wdbClose = document.getElementById('wdb-close-btn');
  if (wdbClose) wdbClose.addEventListener('click', () => closeWardrobePanel());
  const wdbApply = document.getElementById('wdb-apply-btn');
  if (wdbApply) wdbApply.addEventListener('click', () => wardrobeApply());
  // Peek/listen lens (intimacy-voyeurism Phase 10): the Stop button ends the
  // hold; Escape does too, ahead of the other overlays (a hold is the most
  // time-sensitive thing on screen).
  const peekStop = document.getElementById('peek-stop-btn');
  if (peekStop) peekStop.addEventListener('click', () => stopPeekSession());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (typeof stopPeekSession === 'function' && peekSessionActive()) { stopPeekSession(); return; }
    // Intimacy & Voyeurism Phase 5 (D11): the wardrobe panel (Change Outfit)
    // closes on Escape like any other overlay, and resolves its promise null
    // so the action cancels cleanly.
    if (typeof closeWardrobePanel === 'function' && closeWardrobePanel());
    else if (typeof closeContainerPanel === 'function' && closeContainerPanel());
    else if (typeof closeInventoryPanel === 'function') closeInventoryPanel();
  });
}

// Boot: the single entry point is invoked from the bottom of MENU — the
// last script to load — so that boot() can call into MENU/IMAGE functions
// defined after UI. See the note above menu.js's BOOT section.

// ===== /SECTION: BOOT =====