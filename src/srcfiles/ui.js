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
async function advanceAndResolve(ticks, opts = {}) {
  const advanceClockToo = opts.advanceClock !== false;
  const wasRunning = !opts.fromClockLoop && clockLoopRunning;
  if (wasRunning) pauseClockLoop();

  const dayBefore = currentGameState.meta.clock.day;
  const { state: newState, events, peepResults } = resolveBatch(currentGameState, ticks, { advanceClock: advanceClockToo });
  currentGameState = newState;
  appendWorldEvents(events);

  // BrineOS Phase 2: the phone's battery lives on the world object and
  // advances with the sim. Hooked here — not in the checkpoint path alone
  // — because both the continuous clock's sim checkpoints and every
  // discrete action (sleep, work blocks, gigs, all ACTION_DEFS verbs)
  // resolve through this same function (decision C: an 8-hour sleep must
  // still drain the battery).
  advancePhoneBattery(currentGameState, ticks);

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
    currentGameState.npcs[evt.npcId] = addMemoryEpisode(npc, evt.day, text, 0.5);
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

  for (const [id, npc] of Object.entries(currentGameState.npcs)) {
    if (npc.residency.status === 'former' || npc.residency.status === 'prospective') continue;
    if (!npc.memory.episodes || npc.memory.episodes.length === 0) continue;
    currentGameState.npcs[id] = decayMemory(npc, ticks);
  }

  // Need consequences (P7): check player needs after tick resolution.
  // Fires when a need hits 0 — real mechanical effects, not just a red bar.
  processNeedConsequences();

  // Food delivery (external-world plan Phase 5): a driver arrives at a TICK,
  // not at day rollover, so the handover is checked on every clock advance —
  // discrete actions and the continuous loop's sim checkpoints both land here.
  processFoodOrdersNow();

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
  await processRentForDay(day);
  processBillsForDayUi(day);
  // BrineOS Phase 7 (plan 7.2): after, not before — autopay must see this
  // day's freshly posted charges and freshly evaluated cutoffs, not the
  // state from before today's bills processed. See processAutopayForDayUi.
  processAutopayForDayUi(day);
  processTaxesForDayUi(day);
  processDeliveriesForDay(day);
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
  // Escorts (external-world plan Phase 7): retire yesterday's bookings and
  // narrate tonight's advance bookings, the same announce-ahead pattern as
  // friends. The visit itself is already scheduled (bookEscort); this is
  // lifecycle + narration only.
  processEscortBookingsForDay(day);
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
  // further energy-costing actions (see canPerformAction), but can
  // always travel to their bedroom to sleep. This replaces the old
  // collapse/forced_sleep which teleported the player and skipped hours
  // — the user explicitly didn't want the player passing out.
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
      p.mood = Math.max(-1, p.mood + NEED_CONSEQUENCES.hunger.moodPenaltyPerTick * 5);
      addLogEntry('narration', NEED_CONSEQUENCES.hunger.logMessage);
    }
    if (p.flags._starvingStreak >= NEED_CONSEQUENCES.hunger.healthThresholdTicks && !p.flags._starvingHealthHit) {
      p.flags._starvingHealthHit = true;
      p.mood = Math.max(-1, p.mood + NEED_CONSEQUENCES.hunger.moodPenaltyPerTick * 5);
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
    const rng = Math.random();
    if (rng < NEED_CONSEQUENCES.hygiene.npcReactionChance) {
      const presentNpcs = getPresentNpcIds(currentGameState.npcs, p.location);
      if (presentNpcs.length > 0) {
        const npcId = presentNpcs[Math.floor(Math.random() * presentNpcs.length)];
        const npc = currentGameState.npcs[npcId];
        const template = NEED_CONSEQUENCES.hygiene.npcReactions[Math.floor(Math.random() * NEED_CONSEQUENCES.hygiene.npcReactions.length)];
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

  if (tension >= REL_CONSEQUENCES.tensionHigh) {
    // NPC refuses to talk
    if (Math.random() < REL_CONSEQUENCES.tensionRefuseTalkChance) {
      return { canTalk: false, avoided: false, reason: `${npc.bible.name} doesn't want to talk right now. They're clearly upset with you.` };
    }
  }

  if (tension >= REL_CONSEQUENCES.tensionThreshold) {
    // NPC might leave the room when you enter
    if (Math.random() < REL_CONSEQUENCES.tensionAvoidChance) {
      return { canTalk: false, avoided: true, reason: `${npc.bible.name} leaves the room when you walk in.` };
    }
  }

  // NPC Overhaul Phase 3.8 — low comfort makes NPC keep distance
  const flags = {};
  if (comfort < REL_CONSEQUENCES.comfortLow) flags.lowComfort = true;
  if (comfort >= REL_CONSEQUENCES.comfortHigh) flags.highComfort = true;
  if (desire >= REL_CONSEQUENCES.desireHigh) flags.highDesire = true;
  if (desire >= REL_CONSEQUENCES.desireHighComfortHigh && comfort >= REL_CONSEQUENCES.comfortHigh && affection >= REL_CONSEQUENCES.affectionHigh) flags.mayInitiate = true;

  return { canTalk: true, avoided: false, ...flags };
}

// Track how long an NPC has been at high tension — if it persists, they
// move out. Checked at day rollover.
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
    player.mood = Math.max(-1, player.mood - ECONOMY.rentLatePenaltyMood);
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

// Phase 6: quarterly taxes bill at quarter end. Unlike utility bills
// (which post on a cadence and have cutoffs), taxes are a single lump
// obligation every 90 days. The player owes rate × (quarterGross −
// deductions). The auto-reserve pays down what it can; any shortfall
// carries forward with penalty + interest. No cutoff — taxes just
// accumulate debt, which compounds if ignored.
function processTaxesForDayUi(day) {
  if (!currentGameState.world.taxes) return;
  if (!isQuarterEnd(day)) return;
  const result = processQuarterlyTaxes(currentGameState, day);
  if (!result) return;
  const q = result.quarter + 1;
  if (result.owed > 0 || result.carriedForward > 0) {
    let msg = `Quarter ${q} taxes: ${result.owed} owed on ${result.gross} gross`;
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
    addLogEntry('system', `Quarter ${q} taxes settled. No tax owed this quarter (reserve: ${currentGameState.world.taxes.reserve}).`);
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
      doormat.contents = addStack(doormat.contents, d.defId, d.qty || 1, null, {});
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
// ref/renovation-occupancy-overhaul-plan.md.
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
    const upgrade = currentGameState.world.upgrades[job.facilityId];
    if (!upgrade) continue;
    upgrade.tier = job.toTier;
    upgrade.condition = MAINTENANCE.startingCondition;
    upgrade.activeJobId = null;
    currentGameState.world.rent = computeRent(currentGameState.npcs, currentGameState);
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
// shape (an array of world records resolved at day rollover).
function processVisitsForDay(day) {
  if (!currentGameState?.world) return;
  const visits = currentGameState.world.visits || (currentGameState.world.visits = []);
  // Retire past visits; a visit whose window has passed must not leave its
  // visitor lingering in the room they were in.
  for (const v of visits) {
    if (v.day >= day) continue;
    if (v.status === 'done' || v.status === 'deferred') continue;
    v.status = 'done';
    const visitor = currentGameState.npcs[v.npcId];
    if (visitor && visitor.location === v.roomId) {
      visitor.location = null;
      visitor.activity = '';
      visitor.transit = null;
    }
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
      startTick: win.startTick,
      endTick: win.endTick,
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
    startTick: entry.startTick,
    endTick: entry.endTick,
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
    addLogEntry('narration', `${p.hostName} mentions that their friend ${p.guestName} is coming by around ${formatTime(p.startTick * 30)}.`);
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
  const { day, minutes } = currentGameState.meta.clock;
  const tick = getTickIndex(minutes);
  for (const order of orders) {
    if (order.status !== 'ordered') continue;
    if (day < order.day) continue;
    if (day === order.day && tick < order.arrivalTick) continue;
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
  for (const line of order.items) {
    if (!ITEM_DEFS[line.itemId]) continue;
    if (toPlayer) {
      currentGameState.player.inventory = addStack(currentGameState.player.inventory, line.itemId, line.qty, 'player', {});
    } else if (doormat) {
      doormat.contents = addStack(doormat.contents, line.itemId, line.qty, null, {});
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

// The chosen delivery time is read off the select at submit time — the same
// "transient form state stays in the DOM until it's committed" pattern
// doMaidSave uses. Scoped by device because the computer and phone shells
// both live in the document and getElementById would always find the
// computer's copy first.
async function doFoodPlaceOrder(device) {
  if (!currentGameState) return;
  const scope = device === 'phone' ? document.getElementById('phone-screen') : document;
  const select = scope?.querySelector?.('#food-time') || document.getElementById('food-time');
  const requestedTick = select ? Number(select.value) : undefined;
  const result = placeFoodOrder(currentGameState, { requestedTick });
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
async function doInviteOver(npcId) {
  const npc = currentGameState?.npcs[npcId];
  if (!npc) return;
  const name = npc.bible?.name || 'They';
  // Residency first: someone who lives here can't be "invited over" whether
  // or not you happen to have their number.
  if (npc.residency?.status === 'resident') {
    addLogEntry('system', `${name} already lives here.`);
    return;
  }
  if (!npc.contactKnown) {
    addLogEntry('system', `You don't have ${name}'s number.`);
    return;
  }
  const day = currentGameState.meta.clock.day + 1;
  const existing = (currentGameState.world.visits || []).find(v =>
    v.npcId === npcId && v.day === day && v.status !== 'done' && v.status !== 'deferred');
  if (existing) {
    addLogEntry('system', `${name} is already coming over that day.`);
    return;
  }
  const win = VISIT_TUNING.contractor; // shared daytime window
  scheduleVisit(currentGameState, `invite_${npcId}_${day}`, day, {
    npcId,
    purpose: 'social',
    startTick: win.startTick,
    endTick: win.endTick,
    roomId: 'living_room',
  });
  addLogEntry('narration', `${name} says they'll come by tomorrow.`);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('invite-over', currentGameState);
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
      addLogEntry('system', `Goal complete: ${quest.title} (+$${quest.rewardMoney || 0})`);
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
  currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
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
      addLogEntry('narration', `You knock on the ${roomName} door. ${responses[Math.floor(Math.random() * responses.length)]}`);
    }
  }
  await advanceAndResolve(1);
  currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('knock', currentGameState);
}

// Give item: gives a meal/food/gift item from inventory to an NPC.
// Used to complete chain quest 'give_item' steps. The first matching
// item in the player's inventory is consumed.
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
  if (!quest) return;
  const step = quest.steps[quest.currentStep];
  // Find matching item in inventory
  const inv = currentGameState.player.inventory || [];
  const idx = inv.findIndex(stack => {
    const def = ITEM_DEFS[stack.defId];
    return def && (!step.itemCategory || def.category === step.itemCategory);
  });
  if (idx < 0) {
    addLogEntry('system', `You don't have a ${step.itemCategory || 'suitable item'} to give.`);
    return;
  }
  const stack = inv[idx];
  const itemLabel = ITEM_DEFS[stack.defId]?.label || 'something';
  // Consume one from the stack
  inv[idx] = { ...stack, qty: stack.qty - 1 };
  if (inv[idx].qty <= 0) inv.splice(idx, 1);
  addLogEntry('narration', `You give ${itemLabel} to ${npc.bible.name || 'them'}. They seem touched.`);
  // Complete the step
  checkChainQuestProgress('give_item', npcId, step.itemCategory);
  // Small affection bump for giving a gift
  currentGameState.npcs[npcId] = applyRelDelta(npc, { affection: 0.05 }, currentGameState.meta.clock.day);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('give-item', currentGameState);
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
const MENU_ACTIONS = ['menu', 'new-game-solo', 'new-game-random', 'new-game-guided', 'new-game-manual', 'new-game-seed', 'generate-cast', 'reroll-char', 'approve-cast', 'back-to-form', 'continue', 'debug', 'debug-close'];

// Actions that can be performed even when energy is at 0. Travel ('move')
// must always be allowed — if the player can't reach their bedroom they're
// stuck with no way to sleep. 'sleep' is the recovery action. 'look' is free
// observation. Menu/save/debug actions are meta, not in-world actions.
const ENERGY_GATE_EXEMPT = new Set([
  'move', 'sleep', 'look', 'pay-bills',
  'menu', 'save', 'debug', 'debug-close',
  'new-game-solo', 'new-game-random', 'new-game-guided', 'new-game-manual', 'new-game-seed',
  'generate-cast', 'reroll-char', 'approve-cast', 'back-to-form', 'continue',
  'computer.close',
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
  return false;
}

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
      await doImSend(extra?.rowId);
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
    case 'ask-contact':
      if (npcId) await doAskContact(npcId);
      break;
    case 'im.invite':
      if (extra?.rowId) await doInviteOver(extra.rowId);
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
    case 'give-item':
      if (npcId) await doGiveItem(npcId);
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
    // only decays NPC needs, not the player's.
    currentGameState.player = decayPlayerNeeds(currentGameState.player, sleepTicks);
    // Energy back is proportional to hours actually slept, so a night cut
    // short (by the alarm) genuinely leaves you short.
    // Phase 8: energy is capped at player.energyMax (which starts at 70
    // and grows), not NEEDS.energy.max (the absolute cap of 100).
    currentGameState.player.energy = Math.min(
      energyMax,
      currentGameState.player.energy + sleepHours * SLEEP.restorePerHour
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
    }
    let sleepMsg = describeSleep(sleepHours, currentGameState.player.energy);
    if (alarmFired) sleepMsg += ' The alarm dragged you out of bed.';
    else if (phoneDead && currentGameState.player.alarm != null) sleepMsg += ' Your phone died overnight — the alarm never went off.';
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
  const template = DEMOTION_BEATS[Math.floor(Math.random() * DEMOTION_BEATS.length)];
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

function convAddBubble(from, text) {
  const log = document.getElementById('conv-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = from === 'action' ? 'conv-bubble' : 'conv-bubble';
  if (from === 'action') el.setAttribute('data-from', 'action');
  else el.setAttribute('data-from', from);
  el.textContent = text;
  log.appendChild(el);
  convScrollToBottom();
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

  // Clear log
  const log = document.getElementById('conv-log');
  if (log) log.innerHTML = '';

  // Show ask-to-leave only for residents
  const askBtn = document.getElementById('conv-ask-leave-btn');
  if (askBtn) askBtn.hidden = npc.residency?.status !== 'resident';

  overlay.setAttribute('data-open', '');

  // Focus input
  const input = document.getElementById('conv-input');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
}

function closeConversationOverlay() {
  const overlay = document.getElementById('conversation-overlay');
  if (overlay) overlay.removeAttribute('data-open');
  convState = null;
}

async function doTalk(npcId) {
  if (!npcId || !currentGameState) return;
  // Relationship consequences (P7): high tension may cause NPC to refuse
  // to talk or avoid the player entirely.
  const relCheck = checkRelConsequences(npcId);
  if (!relCheck.canTalk) {
    if (relCheck.avoided) {
      const rooms = COMMON_ROOMS.filter(r => r !== currentGameState.player.location);
      const newRoom = rooms[Math.floor(Math.random() * rooms.length)];
      currentGameState.npcs[npcId].location = newRoom;
      currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    }
    addLogEntry('narration', relCheck.reason);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('talk-avoided', currentGameState);
    return;
  }

  // Promote to active — demotes the least-engaged active member if the
  // cap is already full, narrated rather than swapped silently.
  const { sceneState, demotedId } = promoteToActive(currentSceneState, npcId);
  currentSceneState = sceneState;
  narrateDemotion(demotedId, npcId);

  // Open the conversation overlay before any LLM call so the player sees
  // the interface immediately, not a loading screen.
  convState = { npcId, sending: false };
  openConversationOverlay(npcId);

  // Deterministic confrontation, before the LLM ever runs — a suspicion
  // threshold crossing (STEALTH, P6) is a guaranteed reaction, not
  // something left to the narrator's discretion. Decays suspicion
  // afterward so the same talk doesn't refire it every time; a fresh
  // incident can still push suspicion back over the threshold later.
  const npc = currentGameState.npcs[npcId];
  const suspicion = (npc.suspicion || {}).boundary_violation || 0;
  if (suspicion >= STEALTH_TUNING.confrontThreshold) {
    const template = BOUNDARY_CONFRONT_TEMPLATES[Math.floor(Math.random() * BOUNDARY_CONFRONT_TEMPLATES.length)];
    convAddBeat(template.replace('{name}', npc.bible.name || 'Your roommate'));
    const effCtx = buildEffectContext(currentGameState, [npcId], [npcId], {}, []);
    const target = suspicion * STEALTH_TUNING.confrontDecayFactor;
    applyEffects(parseEffectDSL(`ADJUST_SUSPICION ${npcId} boundary_violation ${(target - suspicion).toFixed(2)}`), effCtx);
  }

  // Time slows to real-time for the conversation
  pushTimeContext('conversation');

  // Generate the opening exchange — "You approach [name] to talk."
  await doConvSend(`You approach ${npc.bible?.name || 'your roommate'} to talk.`);

  // Talking to the referenced NPC is the completion trigger for any
  // active goal about them — deterministic, doesn't depend on the LLM
  // succeeding or reporting progress (see checkQuestCompletion).
  await checkQuestCompletion(npcId);
}

async function doConvSend(forcedText) {
  if (!convState || convState.sending) return;
  const input = document.getElementById('conv-input');
  const text = forcedText || input?.value.trim();
  if (!text) return;
  if (input && !forcedText) input.value = '';
  convState.sending = true;
  const sendBtn = document.getElementById('conv-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Player's message appears instantly in the conversation log. Forced
  // opening text (e.g. "You approach Hana to talk") is shown as a scene
  // beat rather than a player bubble, since it's narration, not dialogue.
  if (forcedText) convAddBeat(text);
  else convAddBubble('player', text);

  // Typing indicator while the NPC generates a response.
  const removeTyping = convShowTyping();
  convSetStatus('typing…');

  try {
    await advanceAndResolve(1);
    const context = assembleContext(currentGameState, currentSceneState);
    const result = await callLLM(context, text);

    removeTyping();

    if (result.valid && result.proposal) {
      const applied = await applyProposal(result.proposal, context, currentGameState, text);
      // Render results into the conversation overlay's log.
      for (const entry of applied.logEntries) {
        if (entry.type === 'narration') convAddBeat(entry.text);
        else if (entry.type === 'action') convAddBubble('action', `*${entry.text}*`);
        else if (entry.type === 'internal') convAddBeat(`(${entry.text})`);
        else if (entry.type === 'dialogue') convAddBubble('npc', entry.text);
      }
      // Also persist key beats to the main session log so the scene
      // viewer retains context after the conversation closes.
      if (applied.logEntries.length > 0) {
        addLogEntry('narration', `[Talking to ${currentGameState.npcs[convState.npcId]?.bible?.name || 'them'}] ${applied.logEntries.filter(e => e.type === 'dialogue').map(e => `${e.speaker}: "${e.text}"`).join(' ')}`);
      }
      await compactMemoryIfNeeded([...applied.updatedNpcIds, ...(applied.effectNpcIds || [])]);
      currentSceneState = advanceEngagement(currentSceneState, resolveSpeakerIds(result.proposal.dialogue, context.activeNpcs));
    } else {
      convAddBeat(`They seem distracted and don't respond.`);
    }

    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    convSetStatus('In conversation');
    render(currentGameState, currentSceneState);
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

async function doMove(roomId) {
  // Phase 3: Gated movement — can only move to adjacent rooms.
  const currentRoom = currentGameState?.player?.location;
  if (currentRoom && roomId !== currentRoom && !isRoomAdjacent(currentRoom, roomId)) {
    const targetName = ROOMS[roomId]?.name || roomId;
    const path = findPath(currentRoom, roomId);
    if (path && path.length > 2) {
      const next = ROOMS[path[1]]?.name || path[1];
      addLogEntry('narration', `You can't get to the ${targetName} from here — you'd have to go through the ${next} first.`);
    } else {
      addLogEntry('narration', `You can't get to the ${targetName} from here directly.`);
    }
    render(currentGameState, currentSceneState);
    return;
  }
  showLoading();
  try {
    currentGameState.player.location = roomId;
    // Boundary-crossing check runs on entry, before the tick advances, so
    // "who was home" reflects who was actually there when the player
    // walked in (see STEALTH's resolveRoomEntryStealth). Trusted producer,
    // no LLM — safe to run unconditionally on every move.
    const stealthResult = resolveRoomEntryStealth(currentGameState, roomId);
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    // Recompute scene participants for the new room — active starts
    // populated (see getSceneParticipants) rather than empty.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    addLogEntry('narration', `You move to the ${ROOMS[roomId]?.name || roomId}.`);
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

  showLoading('Rolling household...');
  try {
    pendingCast = SIM_generateHouse(seed, count, partials);
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
// alone — no cast generation, no character creation modal, no roommates.
// This is the Stardew-like opening: the empty bedrooms are the visible
// statement of the problem, and the first objective (repair a bedroom via
// RenoFix, then post a Classifieds listing) writes itself.
async function startSoloGame() {
  stopAutosave();
  stopClockLoop();
  closeModal();
  showLoading('Moving in...');
  try {
    const seed = genSeed();
    pendingCast = SIM_generateHouse(seed, 0, []);
    await writeGeneratedGameState(pendingCast);
    pendingCast = null;
    await syncGameStateFromKv();
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    addLogEntry('system', "You've inherited a luxury apartment. It's a wreck — most rooms are barely functional — and the rent is $1,900 a week. You have 14 days before the first bill. Good luck.");
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
  showLoading('Writing your household\'s story...');
  try {
    // Prose expansion in parallel — was a serial await-per-npc loop behind
    // a single static spinner, so a 7-roommate house was 7 sequential LLM
    // calls. Each result re-enters through validateCharacter (the single
    // gate every construction path returns through) before it's allowed
    // into the bible; a player-authored name is never overwritten by prose.
    await Promise.all(Object.entries(pendingCast.npcs).map(async ([id, npc]) => {
      // The Contractor Friend's bible is hand-authored (character brief,
      // ref/contractor-tutorial-overhaul-plan.md Phase 1) — keep the
      // prose-expansion pass from regenerating their identity.
      if (id === CONTRACTOR_ID) return;
      const prose = await expandCharacterProse(npc.bible);
      const candidateBible = {
        ...npc.bible,
        name: npc.bible.name || prose.name,
        visual: prose.visual,
        physical: { ...npc.bible.physical, ...prose.physical },  // NPC Overhaul Phase 1: merge LLM-filled physical
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
      <div class="form-hint">New Game</div>
      <p class="dim tiny" style="margin-bottom: 12px;">You inherit a luxury apartment you can't afford — empty, in disrepair, and all yours. Fix it up, find roommates, make it home.</p>
      <div class="menu-actions">
        <button class="btn btn-block" data-action="new-game-solo">Start New Game</button>
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
      if (currentGameState.world.computer?.power === 'on') resetTimeContext(currentGameState);
      startClockLoop();
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
    if (target.hasAttribute('data-key')) extra.key = target.getAttribute('data-key');
    if (target.hasAttribute('data-days')) extra.days = Number(target.getAttribute('data-days'));
    // Device-parameterised nav (BrineOS 0.2): the shell that owns the node
    // declares its device via data-device on itself or any ancestor, and
    // computer.open-screen dispatches on it — the phone shell will emit
    // data-device="phone" and route to phone nav, never computer windows.
    const deviceNode = target.closest('[data-device]');
    if (deviceNode) extra.device = deviceNode.getAttribute('data-device');
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
