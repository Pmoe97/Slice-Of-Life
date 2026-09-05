// ===== SECTION: ASKS =====
// (asks-and-attachments-plan.md — Phase 1: the ask spine; Phase 2: the
// Request-tree menu consumes this registry — the tree lives in ui.js;
// Phase 3: the repeat ladder (D7) — per-category streak, score penalties,
// REL_DELTA on the 3rd+ consecutive decline, stance escalation;
// Phase 4: scheduled asks (D8/D9) — freeSlotsFor + hasFreeSlotsAhead probe
// the NPC's real schedule (resolveScheduleActivity/busyBlocks, the same read
// respondToCommitment uses), the calendar modal (render.js) picks a window,
// createCommitment binds it, and askTurn.setSlot lets leaf effects name the
// when. Phase 5: ask_meal — the one meal ask (D10); breakfast/lunch/dinner
// falls out of the chosen window via mealLabelForWindow over
// COMMITMENT_TUNING.mealSlots, and the modal row, the memory fact, and the
// confirm pass all carry the inferred label. Phase 6: ask_loan + ask_chore
// — real state writes (EARN_MONEY + the _loanOwed player flag; NPC_ACTIVITY
// so they actually do the chore), amounts parsed from flavor and capped by
// phase (ASK_TUNING.loan.maxByPhase), decide on affection/trust and
// affection/energy. Phase 7: ask_intimacy — the willingness-routed leaf
// (D14): resolveWillingnessGate IS the decision (no seeded noise — the gate
// is already deterministic), noteIntimacyRefusal / noteIntimacyOccurred the
// writes, consent phrasing in the directive's leafNote — never a second
// gate. Phase 8: ask_photo — the willingness-gated photo leaf (act 'photo',
// WILLINGNESS.thresholds.photo): accepted → a deterministic generated image
// of the NPC (buildAskPhotoRecord + getAskPhotoImage) painted into the
// conversation as an image bubble, declined → memory only (a photo refusal
// is not an intimacy refusal — no note* stamps); plus the camera-roll SHARE
// pseudo-leaf (ASK_SHARE_PHOTO, share:true — kept out of ASK_TYPES, so no
// $Tag can ever reach it): the player attaches their own photo and the NPC
// reacts. Phase 9: ask_gift — hand an inventory item over (the picker
// chooses the item, a STRUCTURED input — giftDefId rides resolveAsk's
// `extra` into seedCtx, never through flavor text): giftMatchKind reads
// bible.interests / want / wound for the deterministic REL_DELTA (a match
// moves the needle, a miss does not), MOVE_ITEM transfers the item for
// real, MEMORY_FACT remembers it.)
// Phase 10: hardening — buildAskFallbackLine (the pass-1 template fallback
// from asks-llm-prompt.md: ui.js renders it when the phrasing call fails so
// the DECISION still stands and the ask's own pipeline still runs) and
// ask_repay (the _loanOwed repayment leaf — always accepted; the amount
// feeds only the writes: SPEND_MONEY + the flag reduction + MEMORY_FACT).
//
// The conversation Request menu: the player sends `$AskId <Optional>` in the
// conv input; the outcome is decided DETERMINISTICALLY here — a pure function
// of (npc state, relationship, world, seed), never the flavor text (D1). On
// an ask turn the LLM's own effects are stripped (D2), and the writer only
// PHRASES the verdict through the ask-directive block (buildAskDirective,
// llm.js), which carries the decision's semantic reason/stance words.
//
// Pipeline per ask turn (doConvSend): parseAskInput → resolveAsk (pure:
// decision + stance + directive + effect lines, NO model, NO state writes) →
// callLLM with context.askDirective set → strip proposal.effects/moodDeltas
// → applyProposal (phrasing only) → apply the ask's own effects through the
// normal effect pipeline at the same point applyProposal would have →
// saveAtBoundary.
//
// Phase 1 ships the first v1-catalog leaf — ask_info (decide by trust;
// declined → deflect; accepted → answers from the bible block already in the
// prompt). Later phases add leaves and the Request-tree menu; this file is
// the registry they all register into.

// --- Decision plumbing (shared by every leaf) ---

const ASK_REASON_PHRASES = {
  accept: "they genuinely want to",
  cool: "the relationship isn't there",
  busy: "their schedule genuinely won't allow it",
  unavailable: "it's not possible right now",
  // Phase 7 (intimacy): ask_intimacy's decide() maps the willingness gate to
  // these richer codes so the writer's "why" line names the real refusal in
  // semantic words, never the -1/score behind it (asks-llm-prompt.md's
  // placeholder rules). Only the intimacy leaf returns them; the shared
  // fallback keeps every other leaf's lookup unchanged.
  below: "they're not in the mood for that right now",
  below_photo: "they're not comfortable sharing that right now",
  floor_stranger: "they barely know you",
  floor_hostile: "there's too much bad blood between you right now",
  floor_cold_shoulder: "they've gone cold on you",
  floor_actively_refusing: "they've already said no, and they meant it",
  floor_asleep: "they're fast asleep",
  floor: "it's not possible right now",
  // Phase 9 (gifts): a gift is always accepted — the deterministic outcome
  // is the REL_DELTA (or none), so the reason names the MATCH, not an
  // accept/decline verdict. The writer sees these semantic words, never the
  // delta number behind them (asks-llm-prompt.md placeholder rules).
  gift_interest: "it's exactly the kind of thing they love",
  gift_want: "it speaks directly to something they've been wanting",
  gift_wound: "it reaches something that's hurt them",
  gift_miss: "it's not quite their thing, but they appreciate the gesture",
  // Phase 10 (repayment): a repay ask is accepted by definition — the debt
  // being settled is the ask's own content. This is the reason phrase behind
  // that yes, so the writer never re-decides it.
  repay: "they're settling what they owe",
  // actions-and-activities-overhaul-plan.md Phase 2 (D30): the Affection
  // ladder's sleeping-target branch — every leaf on the ladder shares these
  // three codes rather than each leaf inventing its own.
  sleep_undisturbed: "they're fast asleep and never stir",
  sleep_wake_hostile: "it just woke them, and they are furious",
  sleep_wake_receptive: "it woke them, and they leaned into it, sleepy and warm",
  // Phase 7 (D12): ask_apologize's own outcome codes.
  apology_unknown: "they have no idea what that's even about",
  apology_sincere: "it's real, and it lands",
  apology_repeat: "nothing about it has actually changed",
  apology_late: "it comes far too late to mean much",
  // Phase 7 (D13): ask_boundary's own outcome codes.
  boundary_already: "you've already agreed on this",
  boundary_accept: "it's a reasonable ask, and they respect it",
  boundary_decline: "they're not ready to promise that right now",
};

function askReasonPhrase(reason) {
  return ASK_REASON_PHRASES[reason] || "it's not the right time";
}

function askDay(gameState) {
  return (gameState && gameState.meta && gameState.meta.clock && gameState.meta.clock.day) || 1;
}

// D7's per-category repeat counter, read from npc.flags._askCounts. Phase 3
// writes it from resolveAsk (bumpAskCount) and sweeps stale entries at day
// rollover (sweepAskCounts); lastDay guards a stale counter after a reload,
// so a day rollover reads as a fresh streak even before the sweep runs.
function askRepeatCount(npc, category, day) {
  const rec = npc && npc.flags && npc.flags._askCounts && npc.flags._askCounts[category];
  return rec && rec.lastDay === day ? (rec.count || 0) : 0;
}

// --- D7 the repeat ladder ---

// The streak for THIS ask: count = consecutive same-category asks today
// before it (0 = fresh), tier = the rung this ask sits on (1 normal, 2
// "little resistance", 3+ exasperated).
function askLadder(npc, category, day) {
  const count = askRepeatCount(npc, category, day);
  return { count, tier: Math.min(count + 1, 3) };
}

// The score penalty ASK_TUNING.ladder imposes on a repeat ask: 1st → none,
// 2nd → secondAskPenalty, 3rd+ → thirdAskPenalty. Deterministic — a pure
// function of the persisted streak, like every ask input (D1/D7).
function askLadderPenalty(count) {
  const L = ASK_TUNING.ladder;
  if (count >= 2) return L.thirdAskPenalty;
  if (count === 1) return L.secondAskPenalty;
  return 0;
}

// D7 — write the streak. Called once per ask turn from resolveAsk, AFTER
// the decision (the decision's seed drew the PRE-bump count; the bump only
// shapes the NEXT ask). This is the one mutation resolveAsk does by itself;
// every other ask write goes through the returned applyEffects() closure.
// resetOnAccept: an accepted ask is a fresh slate for that category, so a
// patient player never compounds a streak.
function bumpAskCount(npc, category, day, count, accepted) {
  if (!npc) return;
  npc.flags = npc.flags || {};
  if (accepted && ASK_TUNING.ladder.resetOnAccept) {
    if (npc.flags._askCounts) delete npc.flags._askCounts[category];
    return;
  }
  const recs = npc.flags._askCounts || (npc.flags._askCounts = {});
  recs[category] = { count: count + 1, lastDay: day };
}

// D7 — day rollover resets the streak. Called from processDayRollover
// (ui.js): drop entries whose lastDay isn't today so a stale record can't
// sit in flags forever. lastDay itself already guards reads, so this is
// hygiene, not correctness.
function sweepAskCounts(gameState, day) {
  const npcs = gameState && gameState.npcs;
  if (!npcs) return;
  for (const npc of Object.values(npcs)) {
    const recs = npc && npc.flags && npc.flags._askCounts;
    if (!recs) continue;
    for (const cat of Object.keys(recs)) {
      if (recs[cat].lastDay !== day) delete recs[cat];
    }
    if (!Object.keys(recs).length) delete npc.flags._askCounts;
  }
}

// D7 stance/reason escalation for a DECLINED repeat ask (asks-llm-prompt.md
// stance ladder): the 2nd consecutive stays civil-but-guarded ("little
// resistance"), the 3rd+ is exasperated — the words the writer sees track
// the penalty numbers. Accepted asks keep the normal phase-based stance and
// reason (and reset the streak), so they never carry these.
const ASK_LADDER_REASONS = {
  second: "they've already been asked the same thing today and it's wearing thin",
  third: "they've had enough — this is the same ask again, and the patience is gone",
};
const ASK_LADDER_STANCES = {
  second: 'guarded',
  third: 'exasperated',
};

// The {ladderLine} from asks-llm-prompt.md — present only when the ladder is
// active AND the ask declined (an accepted ask has no push-back to narrate).
function askLadderLine(count) {
  const n = count + 1;
  const ord = n === 11 || n === 12 || n === 13 ? 'th' : (['st', 'nd', 'rd'][(n % 10) - 1] || 'th');
  return `- Note: this is the ${n}${ord} time they have asked the same kind of thing today. The player is pushing their luck and it shows in your attitude.`;
}

// D6 — every decision draws from this exact seed string, the same convention
// respondToCommitment uses (`seededRng(baseSeed, subSeed)`): same save →
// same answer, reloading never renegotiates.
function askSeed(gameState, npcId, category, day, count) {
  return seededRng(gameState.meta?.seed ?? gameState.seed, `ask_${category}_${npcId}_${day}_${count}`);
}

// Semantic stance only (asks-llm-prompt.md placeholder rules): the writer
// sees words, never the score behind the decision. The ladder tiers on top
// of these are applied in resolveAsk (ASK_LADDER_STANCES), not here. Phase 7:
// the intimacy floor refusals (ask_intimacy's `floor_*` reason codes) carry
// their own register — the generic polite/distant under-sells a hostile door
// slammed in your face or a cold shoulder, while a stranger's no is a distant
// one and asleep/already-refusing is a quiet one. below_threshold keeps the
// normal phase-based soft stance.
function askStanceFor(decision, rel) {
  const phase = (rel && rel.conversationPhase) || 'early';
  // Phase 2 (D30): the sleeping-branch outcomes read the same regardless of
  // relationship phase — the formula behind them (attraction × deviancy)
  // deliberately has no phase term, so the stance shouldn't invent one either.
  if (decision.reason === 'sleep_wake_receptive') return 'drowsy and warm';
  if (decision.reason === 'sleep_wake_hostile') return 'stern';
  if (decision.reason === 'sleep_undisturbed') return 'unaware — still asleep';
  if (decision.accept) {
    // Phase 9 — a gift is accepted by definition, but the stance tracks the
    // MATCH: a landed gift is warm (or measured early on), a miss is
    // gracious-but-polite — never "warm", which would overstate a reaction
    // the numbers already decided was zero.
    if ((decision.reason || '').startsWith('gift_')) {
      if (decision.reason === 'gift_miss') return phase === 'early' ? 'measured' : 'polite';
      return phase === 'early' ? 'measured' : 'warm';
    }
    return phase === 'early' ? 'measured' : 'warm';
  }
  const reason = decision.reason || '';
  if (reason.startsWith('floor_')) {
    if (reason === 'floor_hostile' || reason === 'floor_cold_shoulder') return 'stern';
    if (reason === 'floor_stranger') return 'distant';
    return 'polite'; // asleep / already-refusing — quiet, not angry
  }
  return phase === 'early' ? 'distant' : 'polite';
}

// The pass-1 template fallback (asks-llm-prompt.md, "Template fallback"): if
// the phrasing LLM call fails on an ask turn, the DECISION still stands
// (invariant 1) — only the words degrade, to a static line. doConvSend
// (ui.js) renders this as the NPC's reply and still runs the ask's own
// pipeline (schedule modal / photo flow / effects) regardless of how the
// writer did. Deterministic and flavor-blind (D1). The pass-2
// scheduling-confirm fallback lives next to the modal it belongs to
// (runAskScheduleFlow, ui.js).
function buildAskFallbackLine(askTurn, npcName) {
  if (!askTurn) return '';
  return askTurn.decision.accept
    ? `${npcName} nods — sure, they'd like that.`
    : `${npcName} declines, and that's that for now.`;
}

// Memory-text helper: a fact is a reminder, not a transcript — collapse
// whitespace and cap the flavor so a pasted paragraph can't bloat a memory
// or blow MEMORY_FACT's length limit.
function flavorBrief(flavor, max) {
  const f = (flavor || '').replace(/\s+/g, ' ').trim();
  return f.length <= max ? f : f.slice(0, Math.max(0, max - 1)) + '…';
}

// --- Phase 4: the schedule machinery (D8/D9) ---

// Human labels for a chosen slot: "tomorrow at 19:00", the directive's
// {timeLabel} anchor and its ({slotLabel}) range, etc. Pure. dayLabel is
// lowercase because it is embedded in sentences; beyond tomorrow it falls
// back to the long formatDate form.
function askWhenPhrase(slot, nowDay) {
  const day = Math.floor(slot.startAbs / 1440);
  const dayLabel = day === nowDay ? 'today' : day === nowDay + 1 ? 'tomorrow' : formatDate(day);
  const start = formatTime(slot.startAbs % 1440);
  const end = formatTime(slot.endAbs % 1440);
  return { dayLabel, timeLabel: start, slotLabel: `${start}–${end}`, phrase: `${dayLabel} at ${start}` };
}

// D8 — the free-slot probe. Walks the NPC's schedule template at
// CLOCK.tickMinutes granularity for the given absolute day and finds the
// maximal contiguous runs that are NOT work/commute/commute_home/sleep —
// exactly the same read respondToCommitment uses (COMMITMENT_TUNING
// .busyBlocks via resolveScheduleActivity WITHOUT a gameState, so an active
// commitment can't color the probe). Each run is then split into bookable
// windows of at most ASK_TUNING.schedule.chunkMinutes (an all-day free run
// must not pin the NPC for fifteen hours); windows shorter than
// ASK_TUNING.schedule.minFreeWindowMinutes are pop-ins, not plans, and are
// dropped. `nowAbs` (optional) clamps today's windows to the future: a run
// that started this morning is offered from now on, not from 06:00.
function freeSlotsFor(npc, dayAbs, nowAbs) {
  const runs = [];
  let runStart = null;
  const dayBase = dayAbs * 1440;
  for (let m = 0; m < 1440; m += CLOCK.tickMinutes) {
    const { block } = resolveScheduleActivity(npc, absoluteToClock(dayBase + m));
    if (COMMITMENT_TUNING.busyBlocks.includes(block)) {
      if (runStart !== null) { runs.push([runStart, m]); runStart = null; }
    } else if (runStart === null) {
      runStart = m;
    }
  }
  if (runStart !== null) runs.push([runStart, 1440]);
  const T = ASK_TUNING.schedule;
  const windows = [];
  for (const [s, e] of runs) {
    const runEndAbs = dayBase + e;
    let cs = Math.max(dayBase + s, nowAbs != null ? nowAbs : -Infinity);
    for (; cs + T.minFreeWindowMinutes <= runEndAbs; cs += T.chunkMinutes) {
      windows.push({ startAbs: cs, endAbs: Math.min(cs + T.chunkMinutes, runEndAbs) });
    }
  }
  return windows;
}

// D5 — the availability half of a schedule:true leaf: is there at least one
// bookable window inside COMMITMENT_TUNING.maxInviteAheadDays? The modal
// re-probes on open, so this is a cheap gate for the menu and decide(),
// never the booking itself.
function hasFreeSlotsAhead(gameState, npc) {
  const clock = gameState?.meta?.clock;
  if (!clock) return false;
  const nowAbs = clockToAbsolute(clock);
  for (let offset = 0; offset < COMMITMENT_TUNING.maxInviteAheadDays; offset++) {
    if (freeSlotsFor(npc, clock.day + offset, nowAbs).length > 0) return true;
  }
  return false;
}

// D10 (Phase 5) — a window's meal identity. A free window from the Phase-4
// probe is a chunk of at most ASK_TUNING.schedule.chunkMinutes (120), and
// COMMITMENT_TUNING.mealSlots windows are ≥180 minutes apart, so a chunk can
// never straddle two meals — but it CAN begin just before one (07:00–09:00
// is still breakfast), so the test is OVERLAP, not containment (D18: chunked
// windows compose with mealSlots by overlap). Returns the meal slot object
// ({ id, label, startMinute, endMinute }) or null when the window lands
// outside every meal window — null falls back to the plain day/time phrase.
function mealLabelForWindow(startMinute, endMinute) {
  for (const slot of COMMITMENT_TUNING.mealSlots) {
    if (endMinute > slot.startMinute && startMinute < slot.endMinute) return slot;
  }
  return null;
}

// Phase 6 (D12 / ASK_TUNING.loan) — the loan amount comes from the flavor
// ($20 / $120), defaulting to ASK_TUNING.loan.defaultAmount, capped by the
// conversation phase's maxByPhase ceiling (early-phase strangers can't be
// hit up for hundreds). Pure. The amount feeds the WRITES (EARN_MONEY +
// _loanOwed) — it deliberately never touches decide(), so flavor can't flip
// the verdict (D1); the phase cap is the size control.
function loanAmountFromFlavor(flavor, rel) {
  const phase = (rel && rel.conversationPhase) || 'early';
  const cap = ASK_TUNING.loan.maxByPhase[phase] || ASK_TUNING.loan.defaultAmount;
  const m = String(flavor || '').match(/\$(\d+)/);
  const amount = m ? Number(m[1]) : ASK_TUNING.loan.defaultAmount;
  return Math.max(0, Math.min(amount, cap));
}

// Phase 10 — the amount a repayment actually settles. `$20` in the flavor
// repays that much; a bare ask repays the whole debt. Capped by BOTH what's
// owed to this NPC and what the player has on hand. The cap is on the WRITES
// (SPEND_MONEY + the ledger reduction), never a decision input — the accept
// is never at stake (D21's precedent: the loan amount feeds only writes).
// Pure — moneyOwedByPlayer (money.js) reads the ledger (falling back to the
// not-yet-migrated legacy flag), never writes it.
function repayAmountFor(gs, npcId, flavor) {
  const owed = moneyOwedByPlayer(gs, npcId);
  const money = Math.max(0, gs?.player?.money || 0);
  const m = String(flavor || '').match(/\$(\d+)/);
  const want = m ? Number(m[1]) : owed;
  if (!(want > 0 && owed > 0 && money > 0)) return 0;
  return Math.max(0, Math.min(want, owed, money));
}

// --- The catalog (D11) ---

// ask_info — the Phase 1 leaf. Decide by TRUST (opening up is a closeness
// question); declined → deflect; accepted → answers from the bible block
// already in the prompt. D5 belt-and-braces: decide() re-checks available()
// because state can move between render and send.
const ASK_INFO = {
  id: 'RequestInfo',
  category: 'info',
  label: 'Ask About Them',
  help: '<optional: what you want to know — e.g. what they do for fun>',
  template: '$RequestInfo <Optional>',
  // Display-only (D4): when the player sends the ask with <Optional> left
  // untouched, the bubble body shows this canned line instead of nothing.
  // Never an input to decide()/the directive (D1) — the flavor stays empty.
  defaultFlavor: 'Tell me about yourself.',
  available: (gs, npc, ctx) => true, // anyone standing in front of you can be asked about themselves
  // seedCtx = { day, count, ladderPenalty } — resolveAsk fills it: day +
  // count seed the deterministic noise (D6), and EVERY leaf must subtract
  // seedCtx.ladderPenalty from its score so the repeat ladder (D7) bites
  // on any category, not just this leaf. Flavor is deliberately not here
  // (D1).
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.trust || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  // D12 — asks are remembered: accept/decline writes a MEMORY_FACT on the
  // NPC through the normal effect pipeline (the only state writer here).
  effects(gs, npc, npcId, decision, data) {
    const about = flavorBrief(data && data.flavor, 80);
    const suffix = about ? ` (${about})` : '';
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked about them${suffix} and they shared openly.`
        : `MEMORY_FACT ${npcId} The player asked about them${suffix} and they deflected.`,
    ];
  },
  // Per-leaf behaviour for the writer, appended to the generic directive.
  leafNote(decision) {
    return decision.accept
      ? '- They asked about you. Answer from your bible block in this prompt — it is authoritative about who you are; never invent facts about yourself that contradict it. If they asked something you genuinely would not share, say so plainly.'
      : "- They asked about you, and you don't feel close enough to open up. Deflect briefly, matching your stance, without being unkind about it.";
  },
};

// ask_hangout — the Phase 4 schedule:true leaf (D8/D9/D11). "Want to hang
// out?" Stage 1 decides by AFFECTION whether they'd at all; on accept the
// calendar modal picks a genuinely free window and a real 'hangout'
// commitment is created, so the NPC actually relocates for the window
// (COMMITMENT_KINDS.hangout — the same kind the initiative proposals book,
// same roomId: the shared living room). Resident-only (D5): a guest arrives
// through the visits system, not through a commitment.
const ASK_HANGOUT = {
  id: 'RequestHangout',
  category: 'hangouts',
  label: 'Hang Out',
  help: '<optional: what you want to do — e.g. watch a movie>',
  template: '$RequestHangout <Optional>',
  defaultFlavor: 'Do you want to hang out?',
  schedule: true,                 // Phase 4: calendar modal + commitment (D8/D9)
  kind: 'hangout',
  roomId: COMMITMENT_KINDS.hangout.roomId, // 'living_room' — the shared hangout spot
  available: (gs, npc) =>
    npc.residency?.status === 'resident' && hasFreeSlotsAhead(gs, npc),
  // seedCtx contract is the same as ASK_INFO's: day + count seed the noise
  // (D6), and every leaf must subtract ladderPenalty (D7) so the repeat
  // ladder bites on any category. Flavor is deliberately not an input (D1).
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  // D12 — accepted/declined both remembered. On a booked hangout the memory
  // names the when: doConvSend calls askTurn.setSlot after the modal
  // confirms, and the phrase lands here ("they agreed — tomorrow at 19:00").
  effects(gs, npc, npcId, decision, data) {
    const about = flavorBrief(data && data.flavor, 80);
    const suffix = about ? ` (${about})` : '';
    const slot = data && data.slot;
    const when = slot ? ` — ${askWhenPhrase(slot, askDay(gs)).phrase}` : '';
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to hang out${suffix} and they agreed${when}.`
        : `MEMORY_FACT ${npcId} The player asked them to hang out${suffix} and they declined.`,
    ];
  },
  // Per-leaf behaviour for pass 1. The accepted note tells the writer the
  // exact time is settled NEXT (the modal), so they don't invent one.
  leafNote(decision) {
    return decision.accept
      ? "- They said yes to spending time together. Be warmly agreeable — the exact time is settled next, so don't invent a specific time yet."
      : "- They don't feel like hanging out. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_meal — the Phase 5 schedule:true leaf (D10/D11): ONE meal ask, no
// meal-type variants. Decide by AFFECTION — the same axis respondToCommitment
// uses for a dinner invite, so a meal ask reads like a meal invite to anyone
// who knows the codebase; on accept the calendar modal picks a genuinely free
// window, a real 'meal' commitment is created in the shared dining room (the
// same kind/room doInviteDinner books, so the NPC relocates to the table for
// the window), and the memory fact + confirm pass name the inferred meal
// ("Breakfast, tomorrow at 08:30"). Resident-only (D5), like ask_hangout.
const ASK_MEAL = {
  id: 'RequestMeal',
  category: 'meals',
  label: 'Meal Invitation', // D10: the send-time tag is generic — the meal comes from the slot
  help: '<optional: what/when — e.g. coffee early>',
  template: '$RequestMeal <Optional>',
  defaultFlavor: 'Want to grab a meal together?',
  schedule: true,                 // Phase 4 machinery: calendar modal + commitment (D8/D9)
  kind: 'meal',
  roomId: 'dining',               // COMMITMENT_KINDS.meal — the shared table, same room doInviteDinner books
  available: (gs, npc) =>
    npc.residency?.status === 'resident' && hasFreeSlotsAhead(gs, npc),
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  // D12 — accepted/declined both remembered. On a booked meal the memory
  // names the inferred meal + when ("they agreed — Breakfast, tomorrow at
  // 08:30"); doConvSend calls askTurn.setSlot after the modal confirms and
  // the label lands here (null slot → no when, e.g. a cancelled plan).
  effects(gs, npc, npcId, decision, data) {
    const about = flavorBrief(data && data.flavor, 80);
    const suffix = about ? ` (${about})` : '';
    const slot = data && data.slot;
    let when = '';
    if (slot) {
      const w = askWhenPhrase(slot, askDay(gs));
      const meal = mealLabelForWindow(slot.startAbs % 1440, slot.endAbs % 1440);
      when = ` — ${meal ? `${meal.label}, ` : ''}${w.phrase}`;
    }
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player invited them to a meal${suffix} and they agreed${when}.`
        : `MEMORY_FACT ${npcId} The player invited them to a meal${suffix} and they declined.`,
    ];
  },
  // Per-leaf behaviour for pass 1. The accepted note tells the writer the
  // exact time is settled NEXT (the modal), so they don't invent one.
  leafNote(decision) {
    return decision.accept
      ? "- They said yes to sharing a meal. Be warmly agreeable — the exact time is settled next, so don't invent a specific time yet."
      : "- They don't feel like sharing a meal right now. Decline in character, matching your stance, without being harsh.";
  },
};

// --- actions-and-activities-overhaul-plan.md Phase 1 (D1/D2): $Invite ---
// The multi-person half ASK_HANGOUT/ASK_MEAL structurally can't do — both are
// pinned to whoever the player is talking to. $Invite reads an event type
// ("dinner"/"hangout") and any OTHER resident names out of the flavor text
// the same way intent.js's classifyIntent already resolves a bedroom owner's
// name out of free text (longest-phrase match against a normalized string),
// and folds the extras into the SAME commitment as ordinary invitedIds —
// each rolls their own real accept/decline through createCommitment's
// existing per-invitee loop (respondToCommitment), exactly like a second
// person reached by an overture proposal. Parsing only ever feeds the WRITE
// (which kind/room, who else) — never decide()'s own accept/decline for the
// PRIMARY partner, matching loanAmountFromFlavor's precedent (D1/invariant 2):
// flavor can shape what gets booked, never whether this leaf itself is
// accepted.

// Only COMMITMENT_KINDS entries that opted in (playerInvitable: true) are
// candidates — today that's 'meal' and 'hangout'. A future eventType needing
// bespoke judging or narration (cook-off, tour, party — Phases 13/14/17) is
// not obligated to extend this list; it can ship its own dedicated leaf
// instead, exactly as these two already do. $Invite only serves the generic
// "affection/tension decides, no special rules" case.
function inviteKindFromFlavor(flavor) {
  const norm = normalizeIntentText(flavor);
  let best = null;
  for (const [kindId, def] of Object.entries(COMMITMENT_KINDS)) {
    if (!def.playerInvitable) continue;
    const phrase = matchVerbPhrase(norm, def.inviteWords || []);
    if (phrase && (!best || phrase.length > best.phrase.length)) best = { kindId, phrase };
  }
  // Falls back to 'hangout' — the same default ASK_HANGOUT's own
  // defaultFlavor implies — when nothing recognizable is named, including a
  // bare `$Invite` with no flavor at all.
  return best ? best.kindId : 'hangout';
}

// Additional residents named in the flavor ("...with Elena"), resolved
// against their bible.name with the same whole-word, case-insensitive match
// intent.js's matchRoomIntent uses for a bedroom owner's name. Never the
// conversation partner (already the primary invitee via the normal ask
// pipeline) or a non-resident (D5: a guest arrives through the visits system,
// not a commitment). Iterates gs.npcs' own key order, not the flavor text's,
// so several names in one flavor resolve deterministically.
function inviteExtraGuestsFromFlavor(gameState, flavor, excludeNpcId) {
  const norm = normalizeIntentText(flavor);
  if (!norm) return [];
  const out = [];
  for (const [npcId, npc] of Object.entries(gameState.npcs || {})) {
    if (npcId === excludeNpcId || npc.residency?.status !== 'resident') continue;
    const name = normalizeIntentText(npc.bible?.name || '');
    if (!name) continue;
    const re = new RegExp(`\\b${escapeIntentRegExp(name)}\\b`);
    if (re.test(norm)) out.push(npcId);
  }
  return out;
}

// ask_invite — the Phase 1 leaf itself. Same accept/decline formula as
// ASK_HANGOUT/ASK_MEAL (affection − tension, seeded noise, D7's ladder
// penalty) for the PRIMARY partner; the parsed kind/extra-guest ids ride on
// the returned decision (like ASK_GIFT's giftMatch/giftLabel) for
// runAskScheduleFlow (ui.js) to read before the commitment is created.
// Resident-only (D5) and schedule:true (D8/D9), like its siblings.
const ASK_INVITE = {
  id: 'Invite',
  category: 'invite',
  label: 'Invite',
  help: '<event + who else — e.g. dinner with Elena>',
  template: '$Invite <Optional>',
  defaultFlavor: 'Want to make plans?',
  schedule: true,
  available: (gs, npc) =>
    npc.residency?.status === 'resident' && hasFreeSlotsAhead(gs, npc),
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return {
      accept, reason: accept ? 'accept' : 'cool',
      inviteKind: inviteKindFromFlavor(flavor),
      inviteExtraIds: inviteExtraGuestsFromFlavor(gs, flavor, npcId),
    };
  },
  // D12 — accepted/declined both remembered, same shape as ASK_HANGOUT/
  // ASK_MEAL. Extra invitees each get their own createCommitment-driven
  // response (narrated separately by runAskScheduleFlow) rather than a
  // second MEMORY_FACT here — this leaf only speaks for the PRIMARY partner,
  // same as every other ask.
  effects(gs, npc, npcId, decision, data) {
    const kindLabel = (COMMITMENT_KINDS[decision.inviteKind] || COMMITMENT_KINDS.hangout).label;
    const slot = data && data.slot;
    const when = slot ? ` — ${askWhenPhrase(slot, askDay(gs)).phrase}` : '';
    const extraNote = (decision.inviteExtraIds && decision.inviteExtraIds.length) ? ' (others invited too)' : '';
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player invited them to ${kindLabel}${extraNote} and they agreed${when}.`
        : `MEMORY_FACT ${npcId} The player invited them to ${kindLabel}${extraNote} and they declined.`,
    ];
  },
  leafNote(decision) {
    return decision.accept
      ? "- They asked you to make plans together and you're into it. Be warmly agreeable — the exact time is settled next, so don't invent one yet."
      : "- They're inviting you to make plans and you don't feel like it right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_party — Phase 17 of actions-and-activities-overhaul-plan.md (D26): the
// house party's OWN leaf, not $Invite — COMMITMENT_KINDS.party is
// deliberately not `playerInvitable` (see its own comment, config.js) for
// exactly the reason this file's ASK_INVITE header names: a future eventType
// needing bespoke narration ships its own leaf instead of opting into the
// generic one. Decide/schedule machinery is byte-identical to ASK_INVITE
// (affection − tension, seeded noise, D7's ladder penalty, schedule:true's
// calendar-modal flow) — what's bespoke is the WORDING (a party, not "plans")
// and the fixed `kind: 'party'` (no inviteKindFromFlavor parsing needed, it's
// always a party). Extra guests still parse from the flavor exactly like
// $Invite (inviteExtraGuestsFromFlavor, above) — runAskScheduleFlow (ui.js)
// reads decision.inviteExtraIds off ANY leaf's decision object, not just
// ASK_INVITE's, so this leaf gets multi-guest booking for free by returning
// the same field.
const ASK_PARTY = {
  id: 'HouseParty',
  category: 'invite',
  label: 'Throw a Party',
  help: '<optional: who else — e.g. with Elena and Marcus>',
  template: '$HouseParty <Optional>',
  defaultFlavor: 'Want to throw a party?',
  schedule: true,
  kind: 'party',
  roomId: COMMITMENT_KINDS.party.roomId,
  available: (gs, npc) =>
    npc.residency?.status === 'resident' && hasFreeSlotsAhead(gs, npc),
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return {
      accept, reason: accept ? 'accept' : 'cool',
      inviteExtraIds: inviteExtraGuestsFromFlavor(gs, flavor, npcId),
    };
  },
  effects(gs, npc, npcId, decision, data) {
    const slot = data && data.slot;
    const when = slot ? ` — ${askWhenPhrase(slot, askDay(gs)).phrase}` : '';
    const extraNote = (decision.inviteExtraIds && decision.inviteExtraIds.length) ? ' (others invited too)' : '';
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to help throw a party${extraNote} and they're in${when}.`
        : `MEMORY_FACT ${npcId} The player asked them to help throw a party${extraNote} and they weren't into it.`,
    ];
  },
  leafNote(decision) {
    return decision.accept
      ? "- They're throwing a party and want you there. Be genuinely excited — the exact time is settled next, so don't invent one yet."
      : "- They're proposing a party and you're not feeling it right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_follow — Phase 6 of actions-and-activities-overhaul-plan.md (D11): "come
// with me". Decide by AFFECTION, byte-identical to ASK_HANGOUT/ASK_MEAL/
// ASK_INVITE's formula (D1 — flavor never moves the verdict). On accept,
// postEffects (below) sets npc.follow = { leader: 'player', sinceDay } — the
// ONE write that CREATES a follow relationship; everything that ENDS one
// (a privacy-room refusal, starting a real conversation, an explicit release,
// sleep/off-site work) lives outside this file (movement.js's
// advanceFollowers, ui.js's doTalk/doStopFollowing, sim.js's Pass 1), per
// D11's "the walk presentation never writes it" — this leaf is the one
// exception, and only in the direction of beginning the relationship.
// available() blocks re-asking someone already following and asking a
// sleeping/napping NPC to get up and walk (the same activity check
// willingnessFloorReasons uses for its 'asleep' floor, willingness.js) —
// Follow has no sleeping-target branch the way the D30 affection ladder does;
// there is nothing metaphorical about needing to be on your feet for this one.
const ASK_FOLLOW = {
  id: 'FollowMe',
  category: 'follow',
  label: 'Follow Me',
  help: '<optional — e.g. come with me?>',
  template: '$FollowMe <Optional>',
  defaultFlavor: 'Come with me?',
  available: (gs, npc) => {
    if (npc.follow && npc.follow.leader === 'player') return false;
    const activity = (npc.activity || '').toLowerCase();
    return activity !== 'sleeping' && activity !== 'napping';
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  effects(gs, npc, npcId, decision, data) {
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to come along and they fell in step.`
        : `MEMORY_FACT ${npcId} The player asked them to come along and they stayed put.`,
    ];
  },
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    npc.follow = { leader: 'player', sinceDay: gs.meta.clock.day };
  },
  leafNote(decision) {
    return decision.accept
      ? "- You're happy to tag along with them for now. Say so briefly and warmly — don't invent a destination, they're just leading the way."
      : "- You'd rather stay put right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_tour — Phase 17 of actions-and-activities-overhaul-plan.md (D27): "want
// the grand tour?" An immediate leaf, not schedule:true — a tour is a thing
// you do right now, not a future booking, so it has no commitments.js kind at
// all (unlike ASK_PARTY below). Decide by AFFECTION, byte-identical to
// ASK_FOLLOW's formula (D1 — flavor never moves the verdict); on accept,
// postEffects sets BOTH npc.follow (the same leader/sinceDay record Follow
// uses — a tour rides Follow's existing room-by-room presentation, per D27's
// "riding the walk/movement presentation") AND npc.touring = { visited: [] },
// the flag movement.js's advanceTouring (called from ui.js's doMove on
// arrival at each new room) reads to fire that room's TOUR_STOPS beat once
// and to know this Follow is a tour, not a plain one. available() reuses
// ASK_FOLLOW's exact guards (not already following, not asleep/napping) plus
// one more: not already touring, so a second $ShowAround mid-tour can't
// reset the visited list.
const ASK_TOUR = {
  id: 'ShowAround',
  category: 'follow',
  label: 'Show Them Around',
  help: '<optional — e.g. want the grand tour?>',
  template: '$ShowAround <Optional>',
  defaultFlavor: 'Want the grand tour?',
  available: (gs, npc) => {
    if (npc.touring) return false;
    if (npc.follow && npc.follow.leader === 'player') return false;
    const activity = (npc.activity || '').toLowerCase();
    return activity !== 'sleeping' && activity !== 'napping';
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  effects(gs, npc, npcId, decision, data) {
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player offered to show them around and they took the tour.`
        : `MEMORY_FACT ${npcId} The player offered to show them around and they passed.`,
    ];
  },
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    npc.follow = { leader: 'player', sinceDay: gs.meta.clock.day };
    npc.touring = { visited: [] };
  },
  leafNote(decision) {
    return decision.accept
      ? "- You're happy to be shown around. Say so briefly and warmly — don't describe any specific room yet, that comes as you actually walk through it."
      : "- You don't feel like a tour right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_loan — the Phase 6 money leaf (D12): \"spot me some cash\". Decide by
// AFFECTION + TRUST (lending is a closeness-and-reliability question);
// accepted → EARN_MONEY (real money on the player) + a MEMORY_FACT + the
// player-facing _loanOwed flag so repayment can be tracked; declined →
// memory only on the first ask — the ladder handles pestering. The amount
// is parsed from the flavor ($20/$120) and capped by conversation phase
// (ASK_TUNING.loan.maxByPhase); no NPC cash field exists, by design (Open
// questions: loans are relationship-capped). Available to anyone they're
// talking to.
const ASK_LOAN = {
  id: 'RequestLoan',
  category: 'money',
  label: 'Loan Request',
  help: '<optional: amount — e.g. $20>',
  template: '$RequestLoan <Optional>',
  defaultFlavor: 'Could you spot me some money?',
  available: () => true, // anyone standing in front of you can be hit up
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) + (rel.trust || 0)
      - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  // D12 — accepted: EARN_MONEY + memory + _loanOwed (postEffects, below).
  // Declined: memory only (nothing on first ask; the ladder's generic
  // REL_DELTA handles the 3rd+ decline).
  effects(gs, npc, npcId, decision, data) {
    const about = flavorBrief(data && data.flavor, 80);
    const suffix = about ? ` (${about})` : '';
    const amount = loanAmountFromFlavor(data && data.flavor, npc.relPlayer);
    const who = (npc.bible && npc.bible.name) || 'them';
    return [
      decision.accept ? `EARN_MONEY ${amount} loan from ${who}` : null,
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to lend $${amount}${suffix} and they agreed.`
        : `MEMORY_FACT ${npcId} The player asked them to lend $${amount}${suffix} and they declined.`,
    ].filter(Boolean);
  },
  // Phase 4 of actions-and-activities-overhaul-plan.md (D9) — the debt now
  // lives on player.moneyLedger[npcId].playerOwes (money.js's
  // adjustMoneyLedger), not the old one-way player.flags._loanOwed; the
  // helper folds any pre-existing legacy debt in on this same write. Written
  // at the same single effect-application moment as the DSL lines above,
  // same as every other ask-owned structured write (bumpAskCount's
  // _askCounts, the D33 pickpocket window).
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    const amount = loanAmountFromFlavor(data && data.flavor, (gs.npcs && gs.npcs[npcId] && gs.npcs[npcId].relPlayer) || {});
    adjustMoneyLedger(gs, npcId, 'playerOwes', amount);
  },
  // The directive already says the money is handled automatically; this only
  // tells the writer how to be in-character about it.
  leafNote(decision) {
    return decision.accept
      ? "- You agreed to lend them the money. Acknowledge it in character — the money itself is already handled, so don't describe a transaction or handover happening."
      : "- You're not lending them money right now. Decline in character, matching your stance — you can be soft or firm, but not unkind.";
  },
};

// ask_repay — the Phase 10 money leaf (D12's repayment lifecycle): pay back
// an accepted loan. ask_loan's _loanOwed flag (a per-NPC player-facing
// object) is the durable record; this leaf is its repayment side. Available
// when THIS npc is owed money AND the player has any on hand. Always
// accepted — there is no "no" to a returned debt, so like the gift (D25)
// the deterministic verdict IS the transaction: the AMOUNT (flavor `$20`,
// or the whole debt on a bare ask, capped by what's owed and what's on
// hand) feeds the writes only — SPEND_MONEY, the flag reduction, MEMORY_FACT
// — never the accept, so flavor can't flip a decision that was never one
// (D1, D21's precedent).
const ASK_REPAY = {
  id: 'RequestRepay',
  category: 'money',
  label: 'Repay a Loan',
  help: '<optional: amount — e.g. $20; blank pays it all back>',
  template: '$RequestRepay <Optional>',
  defaultFlavor: "Here's what I owe you.",
  // D5 — the menu gate and decide()'s belt-and-braces re-check. Presence is
  // true by definition mid-conversation; the real gates are an open _loanOwed
  // entry for THIS npc and money on hand. willingnessTargetId maps the npc
  // object to its id — the flag is keyed by id, and `available` only receives
  // the object.
  available: (gs, npc, ctx) => {
    const npcId = willingnessTargetId(gs, npc, ctx);
    const owed = npcId && moneyOwedByPlayer(gs, npcId);
    return !!owed && (gs?.player?.money || 0) > 0;
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    // Always accepted — a repaid debt has no verdict to roll, so there is
    // nothing to seed (the gift/intimacy/photo leaves draw no noise for the
    // same reason). The amount is deliberately NOT read here: it feeds the
    // writes only, exactly like the loan amount (D21).
    return { accept: true, reason: 'repay' };
  },
  // D12 — the repayment is remembered: SPEND_MONEY (real money leaves the
  // player) + a MEMORY_FACT on the npc. The amount is computed ONCE here and
  // stashed on the shared effectData, so postEffects reduces the flag by
  // exactly what the SPEND_MONEY line moved — recomputing after the spend
  // would cap against the already-shrunk wallet and leave the flag wrong.
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const amount = repayAmountFor(gs, npcId, data && data.flavor);
    if (amount <= 0) return [];
    data.repayAmount = amount;
    const who = (npc.bible && npc.bible.name) || 'them';
    return [
      `SPEND_MONEY ${amount} loan repayment to ${who}`,
      `MEMORY_FACT ${npcId} The player paid them back $${amount}.`,
    ];
  },
  // Phase 4 of actions-and-activities-overhaul-plan.md (D9) — the repayment
  // side of the ledger: reduce playerOwes by the amount the SPEND_MONEY line
  // just moved (money.js's adjustMoneyLedger clamps at 0 and prunes the
  // per-NPC entry once both sides are settled).
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    const amount = (data && data.repayAmount) || 0;
    if (amount <= 0) return;
    adjustMoneyLedger(gs, npcId, 'playerOwes', -amount);
  },
  leafNote(decision) {
    return "- They're paying you back what you lent them. Accept it in character — the money itself is already handled; react like someone being paid back (however this character would), without describing a transaction or counting notes.";
  },
};

// Phase 4 of actions-and-activities-overhaul-plan.md (D9) — the flavor-only
// gift/loan mode word. Structured-in-flavor, same precedent as
// inviteKindFromFlavor (Phase 1): moves what gets BOOKED (which ledger side,
// if any, ends up written), never whether the hand-over itself lands (D1) —
// $GiveMoney is always accepted, matching ASK_GIFT/ASK_REPAY's "the
// deterministic verdict IS the transaction" shape.
function giveMoneyModeFromFlavor(flavor) {
  return /\bloan\b/i.test(String(flavor || '')) ? 'loan' : 'gift';
}

// The amount actually handed over: `$20` in the flavor, or the tuning
// default, capped by what the player has on hand. No phase cap (unlike
// ask_loan's REQUEST cap) — giving away your own money needs no plausibility
// ceiling the way asking a near-stranger for hundreds does. Pure; feeds the
// writes only (D21's precedent).
function giveMoneyAmountFor(gs, flavor) {
  const money = Math.max(0, gs?.player?.money || 0);
  const m = String(flavor || '').match(/\$(\d+)/);
  const amount = m ? Number(m[1]) : ASK_TUNING.loan.defaultAmount;
  return Math.max(0, Math.min(amount, money));
}

// ask_give_money — Phase 4 (D9): hand money to whoever you're talking to, no
// request needed. Always accepted (nobody refuses free money — same "the
// verdict IS the transaction" shape as ask_gift/ask_repay); the flavor's
// mode word decides whether it's a no-strings gift or a loan the NPC now
// owes back (npcOwes), never whether it lands.
const ASK_GIVE_MONEY = {
  id: 'GiveMoney',
  category: 'money',
  label: 'Give Money',
  help: '<optional: amount and gift/loan — e.g. $20 loan>',
  template: '$GiveMoney <Optional>',
  defaultFlavor: 'Here, take this.',
  available: (gs) => (gs?.player?.money || 0) > 0,
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    return { accept: true, reason: 'give_money' };
  },
  // D12 — the hand-over is remembered either way; a no-strings gift also
  // moves affection (a loan carries no relationship delta of its own — see
  // config.js's giveMoney.giftRelDelta comment). data.giveAmount/giveMode are
  // stashed here so postEffects writes the SAME amount SPEND_MONEY just
  // moved, never a recomputation against the already-shrunk wallet (D21's
  // precedent, same reasoning as ask_repay's data.repayAmount).
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const amount = giveMoneyAmountFor(gs, data && data.flavor);
    if (amount <= 0) return [];
    const mode = giveMoneyModeFromFlavor(data && data.flavor);
    data.giveAmount = amount;
    data.giveMode = mode;
    const who = (npc.bible && npc.bible.name) || 'them';
    const lines = [
      `SPEND_MONEY ${amount} given to ${who}`,
      mode === 'loan'
        ? `MEMORY_FACT ${npcId} The player lent them $${amount}.`
        : `MEMORY_FACT ${npcId} The player gave them $${amount}, no strings attached.`,
    ];
    if (mode !== 'loan') lines.push(`REL_DELTA ${npcId} affection +${ASK_TUNING.giveMoney.giftRelDelta}`);
    return lines;
  },
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept || !((data && data.giveAmount) > 0)) return;
    if (data.giveMode === 'loan') adjustMoneyLedger(gs, npcId, 'npcOwes', data.giveAmount);
  },
  leafNote(decision) {
    if (decision.reason !== 'give_money') {
      return "- You don't have any money to give them right now. Deflect briefly, in character.";
    }
    return "- You just handed them money, no ask involved. Acknowledge it warmly in character — the money itself is already handled; don't describe counting cash or a formal handover.";
  },
};

// ask_collect_money — Phase 4 (D9): call in what an NPC owes YOU (npcOwes),
// the mirror of ask_repay for the other ledger direction. Always accepted —
// same "no 'no' to a returned debt" shape; no NPC cash field exists (by
// design, same reasoning ask_loan's own header comment gives), so
// EARN_MONEY is granted abstractly rather than checked against anything.
const ASK_COLLECT_MONEY = {
  id: 'CollectMoney',
  category: 'money',
  label: 'Collect a Debt',
  help: '<optional: amount — e.g. $20; blank collects it all>',
  template: '$CollectMoney <Optional>',
  defaultFlavor: "You still owe me, you know.",
  available: (gs, npc, ctx) => {
    const npcId = willingnessTargetId(gs, npc, ctx);
    return !!npcId && moneyOwedToPlayer(gs, npcId) > 0;
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    return { accept: true, reason: 'repay' };
  },
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const owed = moneyOwedToPlayer(gs, npcId);
    const m = String((data && data.flavor) || '').match(/\$(\d+)/);
    const want = m ? Number(m[1]) : owed;
    const amount = (want > 0 && owed > 0) ? Math.max(0, Math.min(want, owed)) : 0;
    if (amount <= 0) return [];
    data.collectAmount = amount;
    const who = (npc.bible && npc.bible.name) || 'them';
    return [
      `EARN_MONEY ${amount} debt collected from ${who}`,
      `MEMORY_FACT ${npcId} The player asked to be paid back, and they came up with $${amount}.`,
    ];
  },
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    const amount = (data && data.collectAmount) || 0;
    if (amount <= 0) return;
    adjustMoneyLedger(gs, npcId, 'npcOwes', -amount);
  },
  leafNote(decision) {
    return "- You're paying back money you borrowed from them. Accept it in character — the money itself is already handled; don't describe counting cash.";
  },
};

// ask_chore — the Phase 6 chore leaf (D12): \"do X now\". Decide by AFFECTION
// with an energy term (a tired NPC is less likely to take on a task right
// now); accepted → NPC_ACTIVITY so the sim actually shows them doing it
// (the label lands on npc.activity, which both the room card and the scene
// prompt read) + a MEMORY_FACT; declined → deflect. \"Schedule\" in the
// plan's decide formula is the presence gate itself — they are standing in
// front of you mid-conversation, so \"now\" is possible by definition; a
// deeper schedule probe would be a second gate with no lever.
const ASK_CHORE = {
  id: 'RequestChore',
  category: 'chores',
  label: 'Chore Request',
  help: '<optional: what needs doing — e.g. take the bins out>',
  template: '$RequestChore <Optional>',
  defaultFlavor: 'Could you help me out with something?',
  available: () => true, // present + awake (they're in the conversation) → now is possible
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const rel = npc.relPlayer || {};
    const energy = npc.needs && typeof npc.needs.energy === 'number' ? npc.needs.energy : 50;
    const score = (rel.affection || 0) - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      + ((energy - 50) / 50) * ASK_TUNING.chore.energyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  // D12 — accepted: the NPC's activity becomes the task (the flavor, briefed
  // to the same cap NPC_ACTIVITY itself enforces) + memory; declined: memory.
  effects(gs, npc, npcId, decision, data) {
    const task = flavorBrief(data && data.flavor, EFFECT_LIMITS.npcActivityMaxLength) || 'help out';
    return [
      decision.accept ? `NPC_ACTIVITY ${npcId} ${task}` : null,
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to ${task} and they're doing it now.`
        : `MEMORY_FACT ${npcId} The player asked them to ${task} and they declined.`,
    ].filter(Boolean);
  },
  leafNote(decision) {
    return decision.accept
      ? "- You agreed to do what they asked. Say so in character and get on with it — be the kind of person who actually follows through."
      : "- You don't feel like doing that right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_photo — the Phase 8 photos leaf (D11): "send me a photo". Available
// when the NPC is present and the room is private enough — no other NPC in
// the room (you don't ask someone for a selfie in front of the whole house;
// the willingness gate's context term still scores room class + door lock,
// so a shared living room is a weaker yes than a locked bedroom). The
// decision is the willingness gate with act 'photo' (ASK_TUNING.photo
// .threshold = 'photo', WILLINGNESS.thresholds.photo — a threshold entry of
// its own, NOT intimacy's 'default'): the gate is already a pure function of
// state, so like ask_intimacy (D22) the decision draws NO seeded noise —
// same-save-same-answer holds without a draw (D1/D6). The D7 ladder still
// bites through resolveAsk's stance/reason escalation and the 3rd+ REL_DELTA.
// accepted → the NPC sends a generated image: buildAskPhotoRecord (below)
// freezes the prompt (physical description + flavor) and seed, getAskPhotoImage
// (image.js) renders it through the shared cache, and ui.js's runAskPhotoFlow
// paints it into the conversation as an NPC image bubble. A photo refusal is
// NOT an intimacy refusal — no note* stamps, just a MEMORY_FACT (D12).
const ASK_PHOTO = {
  id: 'RequestPhoto',
  category: 'photos',
  label: 'Photo Request',
  help: '<optional: what you want them to send — e.g. a selfie>',
  template: '$RequestPhoto <Optional>',
  defaultFlavor: 'Can you send me a photo?',
  photo: true, // accepted asks render a generated image bubble (ui.js runAskPhotoFlow)
  // D5 — the menu gate. NPC presence is true by definition inside a
  // conversation; the real check is "private enough" = alone with them.
  available: (gs, npc, ctx) => {
    const roomId = (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null;
    if (!roomId) return false;
    return !getPresentNpcIds((gs && gs.npcs) || {}, roomId).some(id => gs.npcs[id] !== npc);
  },
  // The willingness act the ask reads — the same gate machinery as the
  // intimacy leaf, one different bar (a selfie is closer than cuddling but
  // far from sex). No seeded noise draw (D22's reasoning applies whole).
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const gate = resolveWillingnessGate(gs, npcId, 'player', ASK_TUNING.photo.threshold || 'photo', {
      block: null, // mid-conversation: they're awake and present by definition
      location: (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null,
      npcId,
    });
    if (gate.allowed) return { accept: true, reason: 'accept' };
    if (gate.reason === 'below_threshold') return { accept: false, reason: 'below_photo' };
    // Floor — encode the floor state so resolveAsk's reason/stance mapping
    // phrases it in the target's own register (same codes ask_intimacy uses).
    const state = (gate.reasons && gate.reasons[0]) || 'floor';
    return { accept: false, reason: `floor_${state}` };
  },
  // D12 — accepted/declined both remembered; no DSL state beyond the fact.
  effects(gs, npc, npcId, decision, data) {
    const about = flavorBrief(data && data.flavor, 80);
    const suffix = about ? ` (${about})` : '';
    return [
      decision.accept
        ? `MEMORY_FACT ${npcId} The player asked them to send a photo${suffix} and they shared one.`
        : `MEMORY_FACT ${npcId} The player asked them to send a photo${suffix} and they declined.`,
    ];
  },
  leafNote(decision) {
    if (decision.accept) {
      return "- They said yes to sending you a photo. Acknowledge it in character — the photo itself appears on its own right after you speak, so keep to your words and manner and don't describe the picture's contents.";
    }
    if ((decision.reason || '').startsWith('floor_')) {
      return "- This is a hard no — they will not send that, period. Decline in character, matching your stance; do not leave room for more persuasion.";
    }
    return "- They're not comfortable sharing that right now. Decline in character, honestly and without cruelty — a soft no doesn't need a lecture or a promise for later.";
  },
};

// Phase 8 — the accepted photo's record, frozen exactly like a camera-roll
// photo record (image.js takePhoto): prompt + seed, never the blob, so the
// shared LRU can cache/evict pixels freely and the same (save seed, npc,
// day, count) tuple always reproduces the same image. Deterministic — id and
// seed derive from the save seed AND a hash of the final prompt (2026-08-31:
// the requested content is part of the identity, so a different ask on a
// reloaded older save — where the serial resets — is a different image); the
// flavor shapes the PROMPT (the image's content) and is deliberately not a
// decision input (D1). The record itself is never persisted: runAskPhotoFlow
// (ui.js) builds it fresh from the deterministic tuple and getAskPhotoImage
// fills the shared cache, so a reload of the same save reuses the cached
// pixels instead of re-spending quota.
//
// 2026-08-31 (photo-request fix): two changes.
//  1. `draft` (optional) is an LLM-drafted prompt phrase from
//     draftAskPhotoPrompt — the player's raw request rewritten into grounded,
//     identity-specific image description. When present it replaces the
//     naive flavor splice; when absent the old composition remains.
//  2. The photo is grounded in WHERE and WHEN it happens: the NPC's room and
//     the clock phase now enter both the prompt (like every scene prompt in
//     image.js — ROOMS name + phaseLighting) and the id/seed tuple, so a
//     same-day ask in the bedroom and the dining room are different photos
//     and a request answered at golden hour is actually lit by it.
function buildAskPhotoRecord(gs, npc, npcId, flavor, day, count, draft) {
  const base = `${gs.meta?.seed ?? gs.seed}|ask_photo`;
  const roomId = (npc && npc.location) || null;
  const phase = (gs && gs.meta && gs.meta.clock && gs.meta.clock.phase) || 'day';
  const desc = (typeof getPhysicalDescriptionForPrompt === 'function' ? getPhysicalDescriptionForPrompt(npc) : null)
    || (npc.bible && npc.bible.visual) || 'a young adult';
  const ask = flavorBrief(flavor, 140);
  const name = (npc.bible && npc.bible.name) || 'them';
  const roomName = ROOMS[roomId]?.name || roomId || null;
  const light = phaseLighting(phase);
  const placeBit = roomName ? `, in the ${String(roomName).toLowerCase()}, ${light}` : '';
  const selfieTail = 'a candid selfie taken on a smartphone, warm tones, selfie framing, upper-body portrait';
  const prompt = draft
    ? `${draft}${placeBit}, ${selfieTail}.`
    : ask
      ? `${desc}, ${ask}${placeBit}, ${selfieTail}, casual clothing, at ease in their own space.`
      : `${desc}, taking a candid selfie on a smartphone${placeBit}, ${selfieTail}, casual clothing, at ease in their own space.`;
  // 2026-08-31 (ask-photo determinism fix): the id/seed fold a hash of the
  // FINAL prompt, so the photo is keyed by what was actually requested, not
  // just the reuse tuple below. Without this, loading an older save (the
  // per-NPC serial resets) and asking for something COMPLETELY different
  // reproduced the old cached image — the prompt never entered the key. Now
  // the same request reproduces the same cached pixels, and a different
  // request is a different key (→ fresh generation). The prompt is already
  // deterministic per (save, npc, serial, room, phase): the LLM draft is
  // persisted per serial, the naive splice is a pure function of the flavor.
  const tuple = `${base}|${npcId}|${day}|${count}|${roomId || 'anywhere'}|${phase}`;
  const id = `askphoto_${hashStr(tuple).toString(36)}_${hashStr(`${tuple}|prompt|${prompt}`).toString(36)}`;
  const seed = hashStr(`${base}_seed|${id}`);
  return { id, prompt, seed, caption: `Selfie from ${name}${ask ? ` — ${ask}` : ''}` };
}

// 2026-08-31 (photo-request fix): the LLM drafting pass for an accepted photo
// ask. The player's raw request is a conversational imperative ("Show me your
// tits"), not an image description; this hands the NPC's physical/personality
// identity AND the recent conversation to the LLM and gets back a grounded
// descriptive prompt phrase, which buildAskPhotoRecord then composes with the
// selfie framing + room/lighting. Deterministic per (npcId, serial): the
// drafted phrase is persisted on the NPC (npc.flags._askPhotoDraft_<serial>)
// the first time it's needed, so a cache-evicted photo on a reloaded save
// reproduces the SAME prompt instead of a fresh roll (D1). Returns null on
// any failure — buildAskPhotoRecord's old composition is the fallback.
async function draftAskPhotoPrompt(gs, npc, flavor, serial) {
  if (!npc || !root?.generateText) return null;
  const flagKey = `_askPhotoDraft_${serial}`;
  npc.flags = npc.flags || {};
  if (typeof npc.flags[flagKey] === 'string' && npc.flags[flagKey]) return npc.flags[flagKey];

  const roomId = npc.location || null;
  const roomName = ROOMS[roomId]?.name || roomId || 'their space';
  const clock = (gs && gs.meta && gs.meta.clock) || {};
  const light = phaseLighting(clock.phase);
  const identity = (() => {
    try {
      return (typeof buildNpcBlockV2 === 'function')
        ? buildNpcBlockV2(npc, flavor, 'scene', clock.day, gs)
        : '';
    } catch (e) {
      console.warn('Ask-photo identity block failed, falling back:', e.message);
      return '';
    }
  })() || (typeof getPhysicalDescriptionForPrompt === 'function' ? getPhysicalDescriptionForPrompt(npc) : null)
    || (npc.bible && npc.bible.visual) || 'a young adult';
  const request = flavor ? `"${flavor}"` : '(a general request to see them / for a candid selfie)';
  const flags = (gs && gs.meta && gs.meta.contentConfig && gs.meta.contentConfig.contentFlags)
    || (typeof CONTENT_CONFIG !== 'undefined' && CONTENT_CONFIG.contentFlags) || {};
  const mature = flags.mature !== false;

  const instruction = [
    'You are drafting the image-generation prompt for a photo an NPC is about to send the player over text.',
    'The player asked: ' + request,
    'Rewrite the request into a 1-3 sentence IMAGE PROMPT describing exactly what the photo should show.',
    'Ground it in who this NPC is — the person in the photo must be unmistakably them (use the physical description below).',
    ...(mature
      ? ['This is a mature scene: if the request is intimate or sexual, describe the pose and body directly and explicitly.']
      : ['Keep the description non-explicit; fade to black where the request is intimate.']),
    `The NPC is currently in the ${String(roomName).toLowerCase()} (${light}). Work that place and time-of-day lighting into the prompt so the photo feels like "right now" — name the room and the light.`,
    'The recent conversation below gives the mood and context of this moment. Use it.',
    'Return ONLY the image-prompt text — no quotes, no commentary, no preamble, no roleplay lines, no narration.',
    '',
    '=== THE NPC ===',
    identity,
  ].join('\n');

  let draft = null;
  try {
    draft = String(await root.generateText({ instruction })).trim();
  } catch (e) {
    console.warn('Ask-photo draft failed:', e.message);
    return null;
  }
  if (!draft || draft.length < 5 || draft.length > 900) return null;
  npc.flags[flagKey] = draft;
  return draft;
}

// Phase 8 — the discriminator for an accepted photo ask's record. NOT the
// repeat-ladder streak (askLadder().count): that resets to 0 on every
// accepted ask (D7 resetOnAccept), so two accepted photo requests the same
// day drew the same (npcId, day, count=0) tuple → the same record → the
// SAME cached image served for every request (2026-08-30 feedback). This
// is a per-NPC monotonic serial, incremented once per accepted photo ask
// and persisted on the NPC like any other flag: each request is a genuinely
// new photo, while determinism per save holds (D1) — a reloaded save keeps
// the serial, and already-generated photos stay addressable by their cached
// ids, so nothing already shown changes identity.
function nextAskPhotoSerial(npc) {
  if (!npc) return 0;
  npc.flags = npc.flags || {};
  const n = npc.flags._askPhotoN || 0;
  npc.flags._askPhotoN = n + 1;
  return n;
}

// Phase 8 — the "Share a Photo" pseudo-leaf: NOT an ask (no $AskId, no
// decision, no determinism — the player attaches their own photo and the
// NPC merely reacts). It's the camera-roll half of the Photos category. The
// menu renders it like any leaf; clicking it opens the camera-roll picker
// (ui.js openConvPhotoPicker) instead of inserting a template, and
// doConvSharePhoto sends the picked photo. Kept OUT of ASK_TYPES (the
// registry loop below skips `share` leaves), so no $Tag can ever reach
// parseAskInput for it (D3).
const ASK_SHARE_PHOTO = {
  id: 'SharePhoto',
  share: true,
  category: 'photos',
  label: 'Share a Photo',
  help: 'send one from your camera roll',
  available: (gs) => (gs?.world?.phone?.camera?.roll?.length || 0) > 0,
};

// Phase 9 — the deterministic heart of the gift leaf. Pure: a function of
// the item's def and the NPC's bible. Sources are exactly the plan's three:
// bible.interests (name + tags), bible.want, bible.wound. The item side is
// its curated keywords (below) PLUS its own label/nouns (anything with a
// clothing `slot` carries 'fashion'/'clothing'), so a Guitar lands on a
// 'music' interest even though no noun spells "music", and want/wound match
// by plain word hits (a board game's 'party' keyword meets a want about
// throwing a party). No LLM, no Math.random, no flavor: same item + same
// NPC always lands the same way (D1), and the player's phrasing can never
// change it (invariant 2).
const GIFT_INTEREST_KEYWORDS = {
  // The buyable hobby objects (inventory overhaul Phase 6) — each is the
  // physical form of an interest; that's the point of them.
  hobby_guitar: ['music'],
  hobby_bookshelf: ['reading', 'books'],
  hobby_record_player: ['music', 'vinyl'],
  hobby_console: ['gaming'],
  hobby_sketchpad: ['art', 'drawing', 'crafting', 'writing'],
  hobby_houseplant: ['gardening', 'plants'],
  // The two explicit gift-category items.
  flowers: ['gardening', 'romance'],
  chocolate_box: ['chocolate', 'romance'],
  // Media/electronics with a clear interest home.
  book: ['reading', 'books', 'true crime'],
  board_game: ['gaming', 'party'],
  mp3_player: ['music'],
  headphones: ['music'],
  stereo: ['music'],
  boombox: ['music'],
  // Drink-and-social items.
  beer: ['partying'],
  wine: ['partying'],
  comfort_whiskey: ['partying'],
};

// Common want/wound prose words that must never count as a gift hit — an
// item word ("tea", "box") matching "to learn to be alone without being
// lonely" would be noise, not affinity.
const GIFT_STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'from',
  'with', 'by', 'it', 'its', 'them', 'they', 'their', 'this', 'that', 'was',
  'were', 'has', 'have', 'had', 'is', 'are', 'be', 'been', 'being', 'not',
  'no', 'but', 'as', 'so', 'then', 'there', 'do', 'does', 'did', 'you',
  'your', 'yourself', 'get', 'got', 'something', 'anything', 'someone',
  'about', 'when', 'what', 'who', 'how', 'out', 'up', 'down', 'into', 'over',
  'again', 'just', 'because', 'than', 'too', 'very', 'really', 'also',
  'would', 'could', 'will', 'can', 'why', 'where', 'everything', 'nothing',
  'make', 'made', 'want', 'wants', 'find', 'learn', 'one', 'ones',
]);

// The item's gift-identity words: curated keywords first (the semantic
// lift), then its own label/nouns. Category is deliberately NOT included —
// 'media' as a category is a generic word that would tag every book and
// board game onto every media-tagged interest. Clothing carries fashion
// tokens by slot so any article of clothing can land on a 'fashion'
// interest.
function giftItemWords(def) {
  const words = [];
  const push = s => {
    for (const w of String(s || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3) words.push(w);
    }
  };
  for (const k of (def && GIFT_INTEREST_KEYWORDS[def.id]) || []) push(k);
  push(def && def.label);
  for (const n of (def && def.nouns) || []) push(n);
  if (def && def.slot) { words.push('fashion'); words.push('clothing'); }
  return [...new Set(words)];
}

// The match: 'interest' | 'want' | 'wound' | null (a miss). Interest probes
// (name + tags) match when a whole item word EQUALS the probe, or when the
// probe CONTAINS a 4+-letter item word ('books' contains 'book'; 'partying'
// containing 'art' must NOT count, which is why 3-letter words only match by
// equality). want/wound are the same containment rule over non-stopword
// item words, so a player can never widen a match by phrasing (D1).
function giftMatchKind(def, npc) {
  const words = def ? giftItemWords(def) : [];
  if (!words.length) return null;
  const bible = (npc && npc.bible) || {};
  for (const intr of bible.interests || []) {
    const probes = [String((intr && intr.name) || '').toLowerCase()];
    for (const t of (intr && intr.tags) || []) probes.push(String(t).toLowerCase());
    for (const probe of probes) {
      if (!probe || probe.length < 3) continue;
      if (words.some(w => w === probe || (w.length >= 4 && probe.includes(w)))) return 'interest';
    }
  }
  const want = String(bible.want || '').toLowerCase();
  const wound = String(bible.wound || '').toLowerCase();
  for (const w of words) {
    if (GIFT_STOPWORDS.has(w) || w.length < 4) continue;
    if (want.includes(w)) return 'want';
  }
  for (const w of words) {
    if (GIFT_STOPWORDS.has(w) || w.length < 4) continue;
    if (wound.includes(w)) return 'wound';
  }
  return null;
}

// ask_gift — the Phase 9 gifts leaf (D11's catalog + gifts): hand an
// inventory item to the NPC. The outcome is deterministic and purely about
// the ITEM: giftMatchKind against bible.interests / want / wound decides a
// REL_DELTA (a match moves the needle, a miss does not), the item transfers
// to the NPC's inventory for real (MOVE_ITEM through the trusted producer
// path — NPC refs are trusted-only, so no validateEffects gate), and a
// MEMORY_FACT remembers it. The gift is always accepted — there is no
// accept/decline to roll: the deterministic verdict IS the match. The item
// arrives STRUCTURED (seedCtx.giftDefId, chosen in the inventory picker —
// ui.js openConvGiftPicker → doConvGiveGift → doConvSend), never through
// flavor text: `$RequestGift <words>` with no item is 'unavailable' (D1/D3),
// and a player's phrasing can never change a match (invariant 2).
const ASK_GIFT = {
  id: 'RequestGift',
  category: 'gifts',
  label: 'Give a Gift',
  help: 'pick something from your inventory',
  defaultFlavor: 'Here, this is for you.',
  // The picker replaces the template path — there is no $RequestGift
  // template to insert; askMenuInsertLeaf routes gift leaves to
  // openConvGiftPicker (same shape as the camera-roll share picker).
  gift: true,
  // D5 — presence is true by definition mid-conversation; the real gate is
  // "is there something to give". decide() re-checks it (belt and braces).
  available: (gs, npc, ctx) => {
    const roomId = (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null;
    const present = !roomId || getPresentNpcIds((gs && gs.npcs) || {}, roomId).some(id => gs.npcs[id] === npc);
    return present && giftableStacks(gs).length > 0;
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const defId = seedCtx && seedCtx.giftDefId;
    const def = defId ? (ITEM_DEFS[defId] || null) : null;
    // No item (a hand-typed `$RequestGift`): there is nothing to give, and
    // flavor must never be promoted into the item slot (D1).
    if (!def) return { accept: false, reason: 'unavailable' };
    const match = giftMatchKind(def, npc);
    const reason = match === 'interest' ? 'gift_interest'
      : match === 'want' ? 'gift_want'
      : match === 'wound' ? 'gift_wound' : 'gift_miss';
    return {
      accept: true,
      reason,
      giftMatch: match,          // rides for effects()/leafNote()
      giftLabel: def.label,      // rides for leafNote() — a known def label
    };
  },
  // D12 — the gift is remembered on every actual outcome (the memory IS the
  // "references the gift later" half of the plan's verification). The item
  // moves for real; on a match the REL_DELTA lands through the normal
  // effect pipeline (trusted producer, so no validateEffects gate). An
  // 'unavailable' turn is NOT a gift (a hand-typed `$RequestGift` with no
  // item, or the NPC gone) — nothing was given, so nothing is written.
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const defId = data && data.giftDefId;
    const def = defId ? (ITEM_DEFS[defId] || ITEM_DEFS._unknown) : ITEM_DEFS._unknown;
    const label = def.label || 'something';
    const who = (npc.bible && npc.bible.name) || 'them';
    const G = ASK_TUNING.gift;
    const delta = decision.giftMatch ? (G.relDeltas[decision.giftMatch] || 0) : 0;
    const lines = [
      `MOVE_ITEM ${defId} 1 player ${npcId}`,
      decision.giftMatch
        ? `MEMORY_FACT ${npcId} The player gave ${who} the ${label}, and it really landed.`
        : `MEMORY_FACT ${npcId} The player gave ${who} the ${label}; they accepted it politely.`,
    ];
    if (delta > 0) lines.push(`REL_DELTA ${npcId} ${G.relAxis} +${delta.toFixed(2)}`);
    return lines;
  },
  // The directive already says mechanics (items) are handled automatically;
  // this tells the writer how to be in-character about the gift itself.
  // The label is a def label (data, never player input), so it interpolates.
  leafNote(decision) {
    const label = decision.giftLabel || 'the gift';
    if (decision.giftMatch === 'interest') {
      return `- They gave you: ${label}. It is genuinely your kind of thing — react with real pleasure, because they paid attention.`;
    }
    if (decision.giftMatch === 'want') {
      return `- They gave you: ${label}. It is exactly something you wanted — let the surprise and gratitude show.`;
    }
    if (decision.giftMatch === 'wound') {
      return `- They gave you: ${label}. It speaks to something that has hurt you — react softly, genuinely moved.`;
    }
    return `- They gave you: ${label}. It is not quite your thing, but they made the gesture — accept it graciously, without gushing or pretending it is exactly what you wanted.`;
  },
};

// ask_borrow — Phase 4 of actions-and-activities-overhaul-plan.md (D8):
// temporary transfer with a return expectation, the item-shaped sibling of
// ask_loan. Unlike the gift/repay leaves, lending a POSSESSION is a real
// trust question (you might not get it back) — decide() reuses ask_loan's
// exact affection+trust shape rather than an always-accept verdict. The item
// is a STRUCTURED input (seedCtx.borrowDefId, chosen in the inventory picker
// — ui.js openConvBorrowPicker → doConvBorrowItem → doConvSend), same
// contract as ask_gift's giftDefId: it never touches decide() (D1), only
// which item effects()/postEffects() move.
//
// The transfer itself bypasses the generic MOVE_ITEM DSL line on purpose:
// applyMoveItem (effects.js) hardcodes the destination ownerId to
// 'player'-or-null, which is wrong here — the whole point of "borrowed" is
// that ownership does NOT follow possession. postEffects instead calls
// items.js's removeStack/addStack directly, stamping the moved unit's owner
// as the LENDER (npcId), never 'player' — addStack's own merge key already
// requires a matching ownerId to fuse two stacks, so passing the lender's id
// here (rather than 'player') means the borrowed unit can never merge with
// the player's own already-owned stack of the same def and smear the
// borrowed marker across both; it always lands as its own separate entry.
const ASK_BORROW = {
  id: 'BorrowItem',
  category: 'gifts',
  label: 'Borrow Something',
  help: 'pick something from their belongings',
  defaultFlavor: 'Can I borrow this for a bit?',
  borrow: true, // routes through the picker (ui.js askMenuInsertLeaf), like gift:true
  available: (gs, npc, ctx) => {
    const roomId = (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null;
    const present = !roomId || getPresentNpcIds((gs && gs.npcs) || {}, roomId).some(id => gs.npcs[id] === npc);
    return present && borrowableStacks(gs, npc).length > 0;
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const defId = seedCtx && seedCtx.borrowDefId;
    if (!defId || !ITEM_DEFS[defId]) return { accept: false, reason: 'unavailable' };
    // Same shape as ask_loan (D12): affection + trust, minus tension, minus
    // the shared repeat-ladder penalty, plus seeded noise. The item choice
    // never enters the score (D1) — it only decides WHAT moves on an accept.
    const rel = npc.relPlayer || {};
    const score = (rel.affection || 0) + (rel.trust || 0)
      - (rel.tension || 0) * ASK_TUNING.tensionPenaltyWeight
      - ((seedCtx && seedCtx.ladderPenalty) || 0);
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const noise = (rng() - 0.5) * 2 * ASK_TUNING.acceptNoiseRange;
    const accept = score + noise >= ASK_TUNING.acceptThreshold;
    return { accept, reason: accept ? 'accept' : 'cool' };
  },
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const def = ITEM_DEFS[data && data.borrowDefId] || ITEM_DEFS._unknown;
    const who = (npc.bible && npc.bible.name) || 'them';
    return [`MEMORY_FACT ${npcId} The player borrowed ${who}'s ${def.label || 'thing'}, promising it back.`];
  },
  // The actual transfer — see the file header above for why this bypasses
  // MOVE_ITEM. Re-reads npc.inventory from the LIVE npc (the `npc` param
  // here is already the live re-fetch resolveAsk's applyEffects() performs).
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    const defId = data && data.borrowDefId;
    if (!defId) return;
    const { stacks: fromStacks, removed } = removeStack(npc.inventory || [], defId, 1);
    if (removed <= 0) return; // vanished between the picker and the send
    npc.inventory = fromStacks;
    const day = askDay(gs);
    const dueDay = day + ASK_TUNING.borrow.dueDays;
    gs.player.inventory = addStack(gs.player.inventory || [], defId, 1, npcId, { borrowed: { from: npcId, dueDay } }, day);
  },
  leafNote(decision) {
    return decision.accept
      ? "- You're lending them something of yours, for now. Be warmly agreeable in character — the item itself is already handled, so don't invent when they'll return it."
      : "- They want to borrow something of yours and you're not comfortable with that right now. Decline in character, matching your stance, without being harsh.";
  },
};

// ask_return_item — Phase 4 (D8): give back something borrowed. Always
// accepted, same "no 'no' to a returned debt" shape as ask_repay — the item
// is a STRUCTURED input (seedCtx.returnDefId, chosen from
// inventory.js borrowedFromStacks — only items borrowed FROM whoever you're
// talking to, so the picker can never offer back the wrong person's thing).
// Bypasses MOVE_ITEM for the same reason ask_borrow does: the transfer needs
// to clear the meta.borrowed marker and restore ownerId to the lender, which
// the generic DSL line can't express.
const ASK_RETURN_ITEM = {
  id: 'ReturnItem',
  category: 'gifts',
  label: 'Give It Back',
  help: 'pick something you borrowed from them',
  defaultFlavor: "Here — I'm done with this, thanks.",
  returnItem: true, // routes through the picker (ui.js askMenuInsertLeaf)
  available: (gs, npc, ctx) => {
    const npcId = willingnessTargetId(gs, npc, ctx);
    return !!npcId && borrowedFromStacks(gs, npcId).length > 0;
  },
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const defId = seedCtx && seedCtx.returnDefId;
    if (!defId || !ITEM_DEFS[defId]) return { accept: false, reason: 'unavailable' };
    return { accept: true, reason: 'return' };
  },
  effects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return [];
    const def = ITEM_DEFS[data && data.returnDefId] || ITEM_DEFS._unknown;
    return [
      `MEMORY_FACT ${npcId} The player gave back the ${def.label || 'thing'} they'd borrowed.`,
      `REL_DELTA ${npcId} trust +${ASK_TUNING.borrow.returnTrustDelta}`,
    ];
  },
  postEffects(gs, npc, npcId, decision, data) {
    if (!decision.accept) return;
    const defId = data && data.returnDefId;
    if (!defId) return;
    const { stacks: fromStacks, removed } = removeStack(gs.player.inventory || [], defId, 1);
    if (removed <= 0) return;
    gs.player.inventory = fromStacks;
    npc.inventory = addStack(npc.inventory || [], defId, 1, npcId, {}, askDay(gs));
  },
  leafNote() {
    return "- They're giving back something they borrowed from you. Accept it graciously in character — the item itself is already handled.";
  },
};

// --- The Affection ladder (actions-and-activities-overhaul-plan.md Phase 2,
// D5-D7/D30) --------------------------------------------------------------
// Hug / Kiss (cheek) / Kiss (lips) / Cuddle: casual-physical asks, deliberately
// NOT willingness-gated (D7's hard line — that gate stays RequestIntimacy's
// alone, below). Each decides by the SAME light shape ASK_INFO already
// proved (an axis, minus tension, minus the shared repeat-ladder penalty,
// plus seeded noise, against a threshold) — AFFECTION_TUNING just adds a
// mood term and, for the two most intimate rungs, a privacy bonus (D7's
// "location-gated" half). A target found asleep never runs this score at
// all: D30 requires every leaf on this ladder to branch into the existing
// boundary-act gate instead, extended (boundary.js's
// resolveAffectionSleepAttempt/applyAffectionSleepAttempt) into a real
// three-outcome attempt (undisturbed / wake hostile / wake receptive) —
// never a relaxed willingnessFloorReasons 'asleep' floor.
function affectionReceptivityScore(npc, gs, roomId, actId, seedCtx, rng) {
  const rel = npc.relPlayer || {};
  const mood = typeof npc.mood === 'number' ? npc.mood : 0;
  let score = (rel.affection || 0) - (rel.tension || 0) * AFFECTION_TUNING.tensionPenaltyWeight
    + mood * AFFECTION_TUNING.moodWeight - ((seedCtx && seedCtx.ladderPenalty) || 0);
  if (AFFECTION_TUNING.ladder[actId].locationGated && isPrivacyRoom(roomId, npc)) {
    score += AFFECTION_TUNING.privacyBonus;
  }
  const noise = (rng() - 0.5) * 2 * AFFECTION_TUNING.acceptNoiseRange;
  return score + noise;
}

// Non-'asleep' floors (stranger/hostile/cold_shoulder/actively_refusing) are
// a hard no for the ladder too — reused whole from willingness.js rather
// than re-invented, exactly like ASK_INTIMACY reuses the gate below. Only
// 'asleep' gets special handling (D30); every other floor short-circuits to
// the SAME floor_* reason codes ASK_INTIMACY already carries phrases for.
function affectionFloorOrSleep(gs, npc, npcId, roomId) {
  const floors = willingnessFloorReasons(gs, npc, 'player', { location: roomId, npcId });
  const asleep = floors.includes('asleep');
  const other = floors.filter(f => f !== 'asleep');
  if (other.length > 0) return { blocked: true, reason: `floor_${other[0]}` };
  return { blocked: false, asleep };
}

function makeAffectionAsk(actId, { id, label, template, defaultFlavor }) {
  return {
    id, actId, category: 'affection', label, template, defaultFlavor,
    help: '<optional>',
    available: () => true, // presence is true by definition mid-conversation
    decide(gs, npc, npcId, flavor, ctx, seedCtx) {
      const roomId = (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null;
      const gate = affectionFloorOrSleep(gs, npc, npcId, roomId);
      if (gate.blocked) return { accept: false, reason: gate.reason };
      if (gate.asleep) {
        const attempt = resolveAffectionSleepAttempt(gs, actId, npcId, { location: roomId, initiatorId: 'player' });
        return { accept: attempt.outcome === 'wake_receptive', reason: `sleep_${attempt.outcome}`, sleepAttempt: attempt };
      }
      const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
      const score = affectionReceptivityScore(npc, gs, roomId, actId, seedCtx, rng);
      const accept = score >= AFFECTION_TUNING.ladder[actId].threshold;
      return { accept, reason: accept ? 'accept' : 'cool' };
    },
    // Player-side + npc-side deltas ride the same DSL path ASK_GIFT uses —
    // this branch also covers the wake_receptive outcome for free, since its
    // decision.accept is true by construction (decide() above). The two
    // sleep-only outcomes (undisturbed / wake_hostile) get their own lines:
    // undisturbed is a small solitary payoff for the player alone (the NPC
    // never knows), and wake_hostile applies nothing here — postEffects
    // below routes it through the boundary-violation consequence instead.
    effects(gs, npc, npcId, decision, data) {
      const T = AFFECTION_TUNING;
      if (decision.reason === 'sleep_wake_hostile') return [];
      if (decision.reason === 'sleep_undisturbed') {
        const gain = (T.playerMoodGain[actId] * T.undisturbedPlayerMoodFactor).toFixed(3);
        return [`ADJUST_NEED player mood +${gain}`];
      }
      if (!decision.accept) return [];
      const lines = [`ADJUST_NEED player mood +${T.playerMoodGain[actId]}`];
      for (const [axis, v] of Object.entries(T.relDeltas[actId] || {})) {
        lines.push(`REL_DELTA ${npcId} ${axis} ${v < 0 ? '' : '+'}${v}`);
      }
      if (T.npcMoodGain[actId]) lines.push(`MOOD_DELTA ${npcId} +${T.npcMoodGain[actId]}`);
      return lines;
    },
    // The sleeping-branch's hostile wake is a real boundary violation — the
    // SAME shaming/cold-shoulder consequence a caught sleep_with/sleep_watch
    // attempt gets (boundary.js's applyAffectionSleepAttempt), never a
    // second, lighter version of it.
    postEffects(gs, npc, npcId, decision, data) {
      if (decision.reason === 'sleep_wake_hostile' && decision.sleepAttempt) {
        applyAffectionSleepAttempt(gs, npcId, decision.sleepAttempt, {});
      }
    },
    leafNote(decision) {
      if (decision.reason === 'sleep_undisturbed') {
        return "- They are fast asleep and never stir. Write this beat as narration only — do not invent dialogue or a reaction for someone who is unconscious and does not know anything happened.";
      }
      if (decision.reason === 'sleep_wake_hostile') {
        return "- Your touch just woke them, and they are shocked and angry — this is a real boundary violation from where they're standing. Write their furious, betrayed reaction in character; do not soften it.";
      }
      if (decision.reason === 'sleep_wake_receptive') {
        return "- Your touch woke them, and instead of pulling away they lean into it, sleepy and warm. Write a soft, drowsy, genuinely receptive reaction in character.";
      }
      if (decision.accept) {
        return `- They welcomed the ${label.toLowerCase()}. Respond warmly and in character, matching how close you two are — do not undersell it, and do not talk them out of their own yes.`;
      }
      return `- They are not receptive to a ${label.toLowerCase()} right now. Decline in character, gently — this is a small, low-stakes no, not a wound; do not overplay the refusal.`;
    },
  };
}

const ASK_HUG = makeAffectionAsk('hug', {
  id: 'Hug', label: 'Hug', template: '$Hug <Optional>', defaultFlavor: 'Can I get a hug?',
});
const ASK_KISS_CHEEK = makeAffectionAsk('kiss_cheek', {
  id: 'KissCheek', label: 'Kiss on the Cheek', template: '$KissCheek <Optional>', defaultFlavor: 'Can I kiss your cheek?',
});
const ASK_KISS_LIPS = makeAffectionAsk('kiss_lips', {
  id: 'KissLips', label: 'Kiss on the Lips', template: '$KissLips <Optional>', defaultFlavor: 'Can I kiss you?',
});
const ASK_CUDDLE = makeAffectionAsk('cuddle', {
  id: 'Cuddle', label: 'Cuddle', template: '$Cuddle <Optional>', defaultFlavor: 'Want to cuddle for a bit?',
});

// ask_intimacy — the Phase 7 intimacy leaf (D14): the ONLY ask that doesn't
// score its own way — the willingness gate IS the decision, reused whole,
// never a second gate. decide() reads resolveWillingnessGate (willingness.js)
// and maps its verdict straight through: allowed → accept; below_threshold →
// a soft no (reason 'below' — the refusal stamps noteIntimacyRefusal's 1-day
// lockout in postEffects, so a no means no for a while); floor → a hard
// refusal (reason 'floor_<state>', nothing stamped — the hard floors are
// STATES (stranger, hostile, cold shoulder, already-refusing), not refusals,
// and willingness's floor-writes-nothing rule is part of what "reuse whole"
// means). No seeded noise draw: the gate is already a pure function of state,
// so same-save-same-answer holds without one (D1/D6). The D7 ladder still
// bites through resolveAsk's stance/reason escalation and the 3rd+ REL_DELTA,
// and through the gate's own history term (a recent refusal chills it). The
// writer phrases the verdict through the directive's semantic reason/stance
// words plus this leaf's consent phrasing; the verdict's durable record is
// the note* writers (D12 — asks reuse them instead of a MEMORY_FACT).
const ASK_INTIMACY = {
  id: 'RequestIntimacy',
  // Phase 2 (D7): moved into 'affection' — RequestIntimacy is the top rung
  // of the same ladder Hug/KissCheek/KissLips/Cuddle sit on, sharing their
  // repeat-ladder streak. It keeps its own gate (the willingness function,
  // below) — never a second, lighter one.
  category: 'affection',
  label: 'Be Intimate',
  help: '<optional: what/where — e.g. tonight, in your room>',
  template: '$RequestIntimacy <Optional>',
  defaultFlavor: 'Do you want to be intimate?',
  // D5 — available is the menu gate; the willingness gate is the DOOR. The
  // ask stays reachable everywhere a conversation can happen so the refusal
  // gets phrased in character (a stranger's ask refuses, it doesn't grey
  // out), and the gate's own context term (public room, onlookers) is what
  // a private-rooms-only rule would have been.
  available: () => true,
  // The willingness act the ask reads. 'default' is the codebase's own
  // "would they say yes at all" bar (WILLINGNESS.scoring.act) — exactly the
  // question an intimacy ask is asking. (D22.)
  act: 'default',
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    if (!this.available(gs, npc, ctx)) return { accept: false, reason: 'unavailable' };
    const roomId = (npc && npc.location) || (ctx && ctx.scene && ctx.scene.roomId) || null;
    // Phase 2 (D30): a sleeping target never reaches the willingness gate at
    // all — resolveWillingnessGate would just report its own hard 'asleep'
    // floor (correct, and still what every OTHER floor state below does),
    // but D30 wants a real three-outcome attempt here instead, the same
    // extension every other Affection-ladder leaf gets.
    if (willingnessFloorReasons(gs, npc, 'player', { location: roomId, npcId }).includes('asleep')) {
      const attempt = resolveAffectionSleepAttempt(gs, this.id, npcId, { location: roomId, initiatorId: 'player' });
      return { accept: attempt.outcome === 'wake_receptive', reason: `sleep_${attempt.outcome}`, sleepAttempt: attempt };
    }
    const gate = resolveWillingnessGate(gs, npcId, 'player', this.act, {
      block: null, // mid-conversation: they're awake and present by definition
      location: roomId,
      npcId,
    });
    if (gate.allowed) return { accept: true, reason: 'accept' };
    if (gate.reason === 'below_threshold') return { accept: false, reason: 'below' };
    // Floor — encode the floor state so resolveAsk's reason/stance mapping
    // can phrase it in the target's own register (stranger → distant,
    // hostile/cold shoulder → stern, asleep/refusing → polite).
    const state = (gate.reasons && gate.reasons[0]) || 'floor';
    return { accept: false, reason: `floor_${state}` };
  },
  // No DSL effect lines for the normal path — the durable record IS the
  // note* writers (below), which can't ride the DSL as lines. Phase 2's
  // sleep_undisturbed is the one exception: a small, solitary player-only
  // payoff, same shape as the rest of the ladder's undisturbed branch.
  effects(gs, npc, npcId, decision, data) {
    if (decision.reason === 'sleep_undisturbed') {
      const T = AFFECTION_TUNING;
      return [`ADJUST_NEED player mood +${(T.playerMoodGain.cuddle * T.undisturbedPlayerMoodFactor).toFixed(3)}`];
    }
    return [];
  },
  postEffects(gs, npc, npcId, decision, data) {
    const day = askDay(gs);
    // Phase 2 (D30): a hostile wake is a real boundary violation — the same
    // shaming/cold-shoulder consequence a caught sleep_with attempt gets.
    // A receptive wake is a genuine (if modest) intimate moment — reuses
    // the existing intimacy.cuddle magnitude rather than inventing a new
    // number or escalating to a full completed sex act off a chat message.
    if (decision.reason === 'sleep_wake_hostile' && decision.sleepAttempt) {
      applyAffectionSleepAttempt(gs, npcId, decision.sleepAttempt, {});
      return;
    }
    if (decision.reason === 'sleep_wake_receptive' && decision.sleepAttempt) {
      applyAffectionSleepAttempt(gs, npcId, decision.sleepAttempt, {
        relDeltas: INTIMACY.relDeltas.cuddle, npcMoodGain: INTIMACY.npcMoodGain.cuddle,
      });
      noteIntimacyOccurred(gs.npcs[npcId] || npc, day, 'player');
      return;
    }
    if (decision.accept) {
      noteIntimacyOccurred(npc, day, 'player');
    } else if (decision.reason === 'below') {
      noteIntimacyRefusal(npc, day);
    }
  },
  // Consent phrasing into the directive. The generic accept/decline rules
  // already forbid renegotiation; these make the consent itself the thing
  // the writer must not undermine.
  leafNote(decision) {
    if (decision.reason === 'sleep_undisturbed') {
      return "- They are fast asleep and never stir. Write this beat as narration only — do not invent dialogue or a reaction for someone who is unconscious and does not know anything happened.";
    }
    if (decision.reason === 'sleep_wake_hostile') {
      return "- This just woke them, and they are shocked and angry — a real boundary violation from where they're standing. Write their furious, betrayed reaction in character; do not soften it.";
    }
    if (decision.reason === 'sleep_wake_receptive') {
      return "- This woke them, and instead of pulling away they lean into it, sleepy and warm. Write a soft, drowsy, genuinely receptive reaction in character — intimate, not a full scene.";
    }
    if (decision.accept) {
      return "- They consented, freely and in their own voice. Respond warmly and in character — the game has already handled everything that follows, so only your words and manner belong here. Do not waver, and do not talk them out of their own yes.";
    }
    if ((decision.reason || '').startsWith('floor_')) {
      return "- This is a hard no and it is not open to negotiation. Decline in character, matching your stance; do not leave an opening for more persuasion. If the reason is coldness or hostility, let it show in how you hold yourself.";
    }
    return "- They're not willing right now. Decline in character, honestly and without cruelty. A no is a no — do not hint that more persuasion would change it.";
  },
};

// actions-and-activities-overhaul-plan.md Phase 7 (D12) — $Apologize.
// Belief-gated: decide() reads getUnresolvedGrievances (npc.js) — an NPC
// only accepts an apology for a real, remembered wrong. Targets the OLDEST
// unresolved grievance (Phase-3 precedent: ship the simple deterministic
// case, not a picker UI for a list that's usually 0-1 long) — sincere means
// the FIRST attempt on it, made within ASK_TUNING.apology.timelyWindowDays
// of when it was recorded; a second try on the same still-unresolved
// grievance, or a first try made too late, reads as insincere and deepens
// it instead. The grievance's own text/severity ride the decision (never
// player flavor, D1) into leafNote(), so the writer names the real wrong,
// not whatever the player typed.
const ASK_APOLOGIZE = {
  id: 'Apologize',
  category: 'apology',
  label: 'Apologize',
  template: '$Apologize <Optional>',
  defaultFlavor: "I'm sorry — I really am.",
  help: '<optional>',
  available: () => true,
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    const unresolved = getUnresolvedGrievances(npc);
    if (unresolved.length === 0) return { accept: false, reason: 'apology_unknown' };
    const target = unresolved.reduce((a, b) => (a.day <= b.day ? a : b));
    const index = (npc.relPlayer.grievances || []).indexOf(target);
    const alreadyAttempted = target.apologizedDay != null;
    const timely = (seedCtx.day - target.day) <= ASK_TUNING.apology.timelyWindowDays;
    const sincere = !alreadyAttempted && timely;
    return {
      accept: sincere,
      reason: sincere ? 'apology_sincere' : (alreadyAttempted ? 'apology_repeat' : 'apology_late'),
      grievanceIndex: index,
      grievanceText: target.text,
      grievanceSeverity: target.severity,
    };
  },
  effects(gs, npc, npcId, decision, data) {
    if (decision.reason === 'apology_unknown') return [];
    const A = ASK_TUNING.apology;
    if (decision.accept) {
      const repair = (decision.grievanceSeverity || 0.3) * A.repairFraction;
      return [
        `REL_DELTA ${npcId} ${A.relAxis} +${repair.toFixed(3)}`,
        `REL_DELTA ${npcId} tension -${(repair * A.tensionReliefMult).toFixed(3)}`,
        `MEMORY_FACT ${npcId} The player apologized for it, and it actually landed — sincere, and about time.`,
      ];
    }
    return [
      `REL_DELTA ${npcId} tension +${A.insincereTensionDelta}`,
      `MEMORY_FACT ${npcId} The player offered an apology that didn't land — too little, or too late.`,
    ];
  },
  // Grievance resolution can't ride the DSL (resolveGrievance/
  // noteGrievanceApologyAttempt return a NEW npc, the same reason
  // ask_intimacy's noteIntimacy* writers use this hook instead of a
  // MEMORY_FACT line) — and it reads the grievance by the INDEX decide()
  // already found, never re-matches by text, since a repeat attempt's whole
  // point is "the same grievance, still unresolved."
  postEffects(gs, npc, npcId, decision, data) {
    if (decision.reason === 'apology_unknown' || decision.grievanceIndex == null || decision.grievanceIndex < 0) return;
    const day = askDay(gs);
    if (decision.accept) {
      gs.npcs[npcId] = resolveGrievance(npc, decision.grievanceIndex);
    } else {
      gs.npcs[npcId] = noteGrievanceApologyAttempt(npc, decision.grievanceIndex, day);
    }
  },
  leafNote(decision) {
    if (decision.reason === 'apology_unknown') {
      return "- You have no idea what they're apologizing for — nothing comes to mind. React with genuine confusion, not forgiveness; there's nothing here to accept.";
    }
    if (decision.reason === 'apology_sincere') {
      return `- This actually lands: "${decision.grievanceText}" — a real, sincere, timely apology for something you were genuinely carrying. Let yourself soften and mean it.`;
    }
    if (decision.reason === 'apology_repeat') {
      return `- They're apologizing again for "${decision.grievanceText}" without anything having actually changed. It reads hollow — react with real skepticism, not warmth.`;
    }
    return `- The apology for "${decision.grievanceText}" comes far too late to feel sincere. React with real skepticism, not warmth — the moment for this passed.`;
  },
};

// actions-and-activities-overhaul-plan.md Phase 7 (D13) — $AskForSpace: the
// social companion to boundary.js's existing (player-violates-NPC) acts, now
// the other direction — the player asks an NPC to respect a boundary, and if
// they agree it becomes a real flag the D15 engine checks against their OWN
// future acts (flags.js's checkBoundaryRules, wired from the one drive-
// driven room-entry decision point, sim.js's resolveBatch). Ships ONE
// template (Phase 3's own precedent — HOUSE_RULE_DEFS shipped exactly one):
// BOUNDARY_RULE_DEFS.no_enter_room, D13's own flagship, quoted example
// ("don't enter my room"). A light receptivity check — the SAME shape
// affectionReceptivityScore uses, on the trust axis — never the willingness
// gate; this is a request, not a physical act.
function boundaryReceptivityScore(npc, seedCtx, rng) {
  const rel = npc.relPlayer || {};
  const mood = typeof npc.mood === 'number' ? npc.mood : 0;
  const B = ASK_TUNING.boundary;
  const score = (rel.trust || 0) - (rel.tension || 0) * B.tensionPenaltyWeight
    + mood * B.moodWeight - ((seedCtx && seedCtx.ladderPenalty) || 0);
  const noise = (rng() - 0.5) * 2 * B.acceptNoiseRange;
  return score + noise;
}

const ASK_BOUNDARY = {
  id: 'AskForSpace',
  category: 'boundary',
  label: 'Ask for Space',
  template: '$AskForSpace <Optional>',
  defaultFlavor: 'Hey, can you knock before you come into my room?',
  help: '<optional>',
  boundaryDefId: 'no_enter_room',
  available: () => true,
  decide(gs, npc, npcId, flavor, ctx, seedCtx) {
    const active = (npc.flags && npc.flags._boundaryRules) || [];
    if (active.some(r => r.id === this.boundaryDefId)) {
      return { accept: true, reason: 'boundary_already' };
    }
    const floors = willingnessFloorReasons(gs, npc, 'player', { location: npc.location, npcId });
    if (floors.length > 0) return { accept: false, reason: `floor_${floors[0]}` };
    const rng = askSeed(gs, npcId, this.category, seedCtx.day, seedCtx.count);
    const score = boundaryReceptivityScore(npc, seedCtx, rng);
    const accept = score >= ASK_TUNING.boundary.acceptThreshold;
    return { accept, reason: accept ? 'boundary_accept' : 'boundary_decline' };
  },
  effects(gs, npc, npcId, decision, data) {
    if (decision.reason !== 'boundary_accept') return [];
    const name = (npc.bible && npc.bible.name) || 'them';
    return [`MEMORY_FACT ${npcId} The player asked ${name} to always knock first before entering their room, and the boundary was agreed to.`];
  },
  // The flag instance itself can't ride the DSL (there is no generic
  // "append to a flags sub-array" effect verb, and inventing one for this
  // single caller would be invariant-6 plumbing with no second user yet) —
  // written directly on the live npc, the same D38 sub-keyed-array
  // convention every other npc.flags._xxx record already follows.
  postEffects(gs, npc, npcId, decision, data) {
    if (decision.reason !== 'boundary_accept') return;
    const day = askDay(gs);
    npc.flags = npc.flags || {};
    const existing = npc.flags._boundaryRules || [];
    if (existing.some(r => r.id === this.boundaryDefId)) return;
    npc.flags._boundaryRules = [...existing, { id: this.boundaryDefId, setDay: day }];
  },
  leafNote(decision) {
    if (decision.reason === 'boundary_already') {
      return "- You already agreed to this — a quick, easy reaffirmation. No need to make it a whole conversation.";
    }
    if (decision.reason === 'boundary_accept') {
      return "- They're asking you to respect a real boundary about their room. Agree in character, plainly and without drama — this is a reasonable ask, not a big deal.";
    }
    if ((decision.reason || '').startsWith('floor_')) {
      return "- This isn't a moment where you're going to have a calm conversation about boundaries. React in character to the situation, not the request itself.";
    }
    return "- You hear them out, but you're not ready to promise this right now — decline or brush it off in character, matching your current standing with them.";
  },
};

// Phase 2 builds the Request-tree menu from this. One category, one leaf in
// Phase 1; later phases add their categories (and leaves) in the plan's
// order: meals, hangouts, money, chores, photos, intimacy, info. The Photos
// category carries a second, non-ask child — the camera-roll SHARE
// pseudo-leaf (Phase 8), so image requesting and image sending share one
// surface exactly like FUOC's attachments menu.
const ASK_CATEGORIES = [
  { id: 'meals', label: '🍽️ Meals & Plans', children: [ASK_MEAL] },
  { id: 'hangouts', label: '🎮 Hangouts', children: [ASK_HANGOUT] },
  // Phase 1 (D1/D2, actions-and-activities-overhaul-plan.md): the
  // multi-person invite. Sits alongside, not instead of, the two single-
  // target leaves above — see ASK_INVITE's own header for why.
  { id: 'invite', label: '📅 Invite', children: [ASK_INVITE, ASK_PARTY] },
  // Phase 4 of actions-and-activities-overhaul-plan.md (D9): the bidirectional
  // ledger's other two leaves — GiveMoney (player gives) and CollectMoney
  // (call in what an NPC owes YOU) — alongside the original loan/repay pair.
  { id: 'money', label: '💰 Money', children: [ASK_LOAN, ASK_REPAY, ASK_GIVE_MONEY, ASK_COLLECT_MONEY] },
  // Phase 4 (D8): Borrow/Return join Gift — all three are inventory-picker
  // leaves over an item, not a typed template.
  { id: 'gifts', label: '🎁 Gifts', children: [ASK_GIFT, ASK_BORROW, ASK_RETURN_ITEM] },
  { id: 'chores', label: '🧹 Help Around', children: [ASK_CHORE] },
  // Phase 6 of actions-and-activities-overhaul-plan.md (D11).
  { id: 'follow', label: '🚶 Follow', children: [ASK_FOLLOW, ASK_TOUR] },
  { id: 'photos', label: '📷 Photos', children: [ASK_PHOTO, ASK_SHARE_PHOTO] }, // Phase 8 (D11)
  // actions-and-activities-overhaul-plan.md Phase 2 (D5-D7): the ladder.
  // RequestIntimacy moved here from its own 'intimacy' category — it keeps
  // its willingness gate as its whole decision; the other four are the new,
  // lighter casual-physical asks. This is D6's pre-expand target (openAskMenu,
  // ui.js) and the surface that replaced the old standalone Make-a-Move chip.
  { id: 'affection', label: '🤗 Affection', children: [ASK_HUG, ASK_KISS_CHEEK, ASK_KISS_LIPS, ASK_CUDDLE, ASK_INTIMACY] },
  // Phase 7 of actions-and-activities-overhaul-plan.md (D12/D13).
  { id: 'apology', label: '🙏 Apologize', children: [ASK_APOLOGIZE] },
  { id: 'boundary', label: '🛑 Ask for Space', children: [ASK_BOUNDARY] },
  { id: 'info', label: '💬 Ask About Them', children: [ASK_INFO] },
];

// AskId → leaf. One flat map so parseAskInput's tag lookup is O(1) and an
// unknown $Tag falls through to the plain-text path (D3). Share pseudo-leaves
// (Phase 8) live in ASK_SHARE_TYPES instead — the menu routes them to the
// camera-roll picker, and they must never resolve as $-tags.
const ASK_TYPES = {};
const ASK_SHARE_TYPES = {};
for (const cat of ASK_CATEGORIES) {
  for (const leaf of cat.children) {
    if (leaf.share) { ASK_SHARE_TYPES[leaf.id] = leaf; continue; }
    if (ASK_TYPES[leaf.id]) console.warn(`ASK_TYPES: duplicate ask id ${leaf.id}`);
    ASK_TYPES[leaf.id] = leaf;
  }
}

// D3 — `$AskId <flavor>`; a bare `$AskId` with no flavor is allowed. Whether
// the tag is KNOWN is the registry's job, not this function's: an unknown tag
// parses fine here and falls through in doConvSend/resolveAsk.
// Phase 2 (the Request menu): the tree inserts each leaf's `template` with a
// literal `<Optional>` placeholder selected for replacement. If the player
// sends it untouched, treat it as a bare `$AskId` — the placeholder is UI,
// not flavor (D3 already allows a bare ask), and flavor must never drift a
// decision (D1).
function parseAskInput(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/^\$([A-Za-z0-9_]+)(?:\s+(.*))?$/);
  if (!m) return null;
  let flavor = (m[2] || '').trim();
  if (/^<Optional>$/i.test(flavor)) flavor = '';
  return { askId: m[1], flavor };
}

// The pure heart of the pipeline: resolve an ask to its decision, stance,
// directive and effect lines. No LLM. The only state write it does itself
// is the D7 ladder-counter bump (bumpAskCount, after the decision so the
// seed reads the pre-bump count); the returned applyEffects() closure is
// where every other mutation happens, and invoking it is the caller's
// choice, at the point in the turn where the proposal's effects would have
// been applied (invariant 3). Returns null for an unknown AskId (D3
// fallthrough) or a missing NPC.
//
// `extra` (optional) is the STRUCTURED payload of a leaf's flow — the
// fields that are real decision inputs but can never be player text:
// Phase 9's `{ giftDefId }` (the item the picker chose), like Phase 4's
// calendar slot. It rides into seedCtx (so decide() reads it) and into
// effectData (so effects() reads it), keeping flavor free-text strictly out
// of the decision path (D1).
function resolveAsk(gameState, npcId, askId, flavor, ctx, extra) {
  const leaf = ASK_TYPES[askId];
  if (!leaf) return null;
  const npc = gameState && gameState.npcs && gameState.npcs[npcId];
  if (!npc) return null;
  const day = askDay(gameState);
  const { count, tier } = askLadder(npc, leaf.category, day);
  // D6/D7: the decision reads the PRE-bump streak — same save, same answer.
  const decision = leaf.decide(gameState, npc, npcId, flavor, ctx, {
    day,
    count,
    ladderPenalty: askLadderPenalty(count),
    ...(extra || {}),
  });
  bumpAskCount(npc, leaf.category, day, count, decision.accept);

  // D7 stance/reason escalation. Only declines climb the ladder: an accepted
  // repeat costs nothing and resets the streak, so its stance stays
  // phase-based and it carries no ladder note and no REL_DELTA.
  let stance = askStanceFor(decision, npc.relPlayer);
  let reasonPhrase = askReasonPhrase(decision.reason);
  let ladderLine = null;
  let relDelta = null;
  if (count >= 1 && !decision.accept) {
    const high = count >= 2;
    stance = ASK_LADDER_STANCES[high ? 'third' : 'second'];
    reasonPhrase = ASK_LADDER_REASONS[high ? 'third' : 'second'];
    ladderLine = askLadderLine(count);
    if (high) {
      // 3rd+ consecutive decline: the relationship pays for the pestering.
      // Magnitude from ASK_TUNING, clamped by the same cap the effect
      // pipeline enforces (the trust axis is fixed at load, and applyEffects
      // skips validateEffects for asks — trusted producer).
      const L = ASK_TUNING.ladder;
      const v = L.thirdAskRelDelta;
      relDelta = Math.sign(v) * Math.min(Math.abs(v), EFFECT_LIMITS.relDeltaCap);
    }
  }

  const directive = buildAskDirective({
    askLabel: leaf.label,
    askId: leaf.id,
    flavorText: flavor,
    accept: decision.accept,
    reasonPhrase,
    stance,
    ladderLine,
    npcName: (npc.bible && npc.bible.name) || 'your roommate',
    leafNote: leaf.leafNote ? leaf.leafNote(decision) : null,
  });
  // Phase 4 (D8): effect lines are built LAZILY so the caller can pass the
  // calendar-chosen slot (setSlot) before applyEffects — the hangout leaf's
  // MEMORY_FACT then names the when ("they agreed — tomorrow at 19:00").
  // The relDelta is fixed at resolve time (decline-only, D16), so it rides
  // along either way.
  let effectData = { flavor, ...(extra || {}) };
  const buildEffectLines = () => {
    const lines = leaf.effects ? leaf.effects(gameState, npc, npcId, decision, effectData) : [];
    if (relDelta !== null) {
      lines.push(`REL_DELTA ${npcId} ${ASK_TUNING.ladder.relAxis} ${relDelta < 0 ? '' : '+'}${relDelta.toFixed(2)}`);
    }
    return lines;
  };
  return {
    ask: leaf,
    decision,
    stance,
    reasonPhrase,
    ladder: { count, tier }, // D7 — tier: 1 fresh, 2 "little resistance", 3+ exasperated
    // Phase 8 — the accepted photo flow's record builder (runAskPhotoFlow)
    // needs the same flavor the decision saw, so it rides along here.
    flavor,
    directive,
    // Phase 4 — called by doConvSend's schedule flow after the modal
    // confirms a window (only meaningful for schedule:true leaves; a no-op
    // otherwise). Must run before applyEffects().
    setSlot(slot) {
      if (slot) effectData = { ...effectData, slot };
    },
    applyEffects() {
      const effectLines = buildEffectLines();
      let applied = [];
      if (effectLines.length) {
        const activeIds = (ctx.activeNpcs || []).map(n => n.id);
        const presentIds = [...activeIds, ...(ctx.ambientNpcs || []).map(n => n.id)];
        const roomObjects = (gameState.objects && gameState.objects[`room_${gameState.player.location}`]) || {};
        const effCtx = buildEffectContext(gameState, activeIds, presentIds, roomObjects, gameState.player.inventory || []);
        // Asks are trusted producers (effects.js file header): applyEffects
        // directly, exactly like the drive/stealth writers — no validateEffects
        // gate, because later leaves need trusted-only verbs (EARN_MONEY).
        applied = applyEffects(parseEffectDSL(effectLines.join('\n')), effCtx).applied;
      }
      // Phase 6 — a leaf's postEffects runs its own structured write at this
      // same single effect-application moment (the loan's _loanOwed player
      // flag can't ride the DSL as an object; an ask-owned flag in the same
      // spirit as bumpAskCount's _askCounts). The npc it receives is re-read
      // from LIVE state, not the resolve-time capture: applyProposal (and the
      // clock loop's checkpoints during the LLM call) replace npcs[npcId]
      // with fresh objects, so writing through the captured reference would
      // land on a detached object and vanish at the next save. Phase 7's
      // noteIntimacyRefusal/noteIntimacyOccurred were the first real npc-
      // writers on this hook (the loan wrote player.flags, which is never
      // replaced). No-op for leaves without one.
      const liveNpc = (gameState && gameState.npcs && gameState.npcs[npcId]) || npc;
      if (leaf.postEffects) leaf.postEffects(gameState, liveNpc, npcId, decision, effectData);
      return applied;
    },
  };
}

// ===== /SECTION: ASKS =====
