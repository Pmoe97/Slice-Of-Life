// ===== SECTION: TRACKER (BrineOS Phase 4) =====
// The phone's Tracker: one pure, deterministic pass that derives every
// current obligation from game state — decision D of
// src/src/ref/BrineOS-The-Phone-plan.md. Obligations are never stored (no queue,
// no "seen" flags); only the player's dismiss/snooze intents live on
// world.phone (Phase 4 addition to defaultPhoneState). No LLM, no
// randomness, no persistence: the same save always yields the same
// entries, so the badge count is just `getTrackerNotifications(gs).length`.
//
// Entry shape (plan 4.2): { key, kind, urgency, title, detail, dueDay,
// daysUntil, deepLink: { appId, screenId, params } }. `key` is
// deterministic and embeds the obligation's own identity (posting day,
// gig id, quarter-end day…), so a dismiss/snooze can never leak onto a
// future instance — pay the bill and the entry (and any dismissal of it)
// is simply gone, which is plan 4.5's acceptance test.
//
// `urgency` is 0-100; >= TRACKER.notifyThreshold turns an entry into a
// notification (badge + Notifications screen). `dueDay`/`daysUntil` are
// null for date-less sources (courses, facility wear, IM unread) — they
// surface anyway, just without a countdown.
//
// Loads after config.js (TRACKER, BILL_DEFS, FACILITY_DEFS, REL_CONSEQUENCES),
// sim.js (formatDate, getTaxPeriod helpers), defs.computer.js (APP_DEFS via
// deepLink appIds), computer.js (computeTaxOwed, computeBillAmount) and
// defs.world.js/items.js (ITEM_DEFS) — it only *reads* them at call time,
// but keeps the same load slot convention as every other module. Loads
// BEFORE phone.js, whose getPhoneUnreadCount calls getTrackerNotifications.

// --- Urgency ladder ---
// daysUntil is negative when already past, 0 when due today; the ladder in
// TRACKER.urgencyByDaysUntil maps it to 0-100 (overdue always 100). Callers
// pass a real number — date-less sources set their own urgencies instead.
function trackerUrgencyFromDaysUntil(daysUntil) {
  if (daysUntil < 0) return 100;
  for (const step of TRACKER.urgencyByDaysUntil) {
    if (daysUntil <= step.maxDays) return step.urgency;
  }
  return TRACKER.defaultUrgency;
}

// --- Read adapters (plan 4.3): one per source, each returning a single
// entry or an array (never null entries). buildTrackerEntries flattens. ---

// Rent. player.rentDueDay is the NEXT due day; the current posting's due
// day is the last advance of it (rent charges every ECONOMY.payPeriodDays
// at day rollover, then advances). Any money owed means the posting has
// already landed — so it is always at ceiling urgency. Escalation mirrors
// UI's processRentForDay: overdue 7 → landlord escalating, 14 → eviction
// risk (text only; urgency is already maxed). Paying clears the entry with
// no explicit clear call.
function trackerRent(gs) {
  const day = gs.meta.clock.day;
  const owed = gs.player.rentOwed || 0;
  if (owed <= 0) return null;
  const payPeriod = ECONOMY.payPeriodDays;
  const postingDay = (gs.player.rentDueDay || day + payPeriod) - payPeriod;
  const daysOverdue = Math.max(0, day - postingDay);
  let escalation = '';
  if (daysOverdue >= TRACKER.rentEscalationCriticalAtDays) escalation = ', eviction risk';
  else if (daysOverdue >= TRACKER.rentEscalationWarnAtDays) escalation = ', landlord escalating';
  return {
    key: `rent:due:${postingDay}`,
    kind: 'rent',
    urgency: 100,
    title: 'Rent is due',
    detail: `$${owed} owed — due ${formatDate(postingDay)}${daysOverdue > 0 ? ` (${daysOverdue}d overdue)` : ''}${escalation}`,
    dueDay: postingDay,
    daysUntil: postingDay - day,
    deepLink: { appId: 'bank', screenId: 'bills', params: {} },
  };
}

// The seven non-rent bills (rent is handled by trackerRent). Two states:
//   * Unpaid (balance > 0) — the charge has posted on `dueDay - cadence`
//     (dueDay already advanced past it). Money owed is always ceiling
//     urgency; the cutoff countdown (postingDay + graceDays) goes in the
//     detail.
//   * Paid up — the NEXT charge day is the obligation's dueDay. Capped at
//     futureRecurringMaxUrgency so a far-away bill never nags; it's an
//     agenda item ("electric due day 27, ~$X") until it actually posts.
function trackerBills(gs) {
  const day = gs.meta.clock.day;
  const out = [];
  const bills = gs.world.bills || {};
  for (const [billId, bill] of Object.entries(bills)) {
    if (billId === 'rent') continue;
    const def = BILL_DEFS[billId];
    if (!def) continue;
    const cadence = def.cadenceDays || 30;
    const base = { kind: 'bill', title: def.label, deepLink: { appId: 'bank', screenId: 'bills', params: {} } };
    const owed = bill.balance || 0;
    if (owed > 0) {
      const postingDay = (bill.dueDay || day + cadence) - cadence;
      const daysToCutoff = postingDay + (def.graceDays || 0) - day;
      const cutOff = !!bill.cutoffActive || daysToCutoff < 0;
      const cutoffTxt = cutOff ? ' — service cut off'
        : daysToCutoff === 0 ? ' — cutoff today'
        : ` — ${daysToCutoff}d to cutoff`;
      out.push({
        ...base,
        key: `bill:${billId}:due:${postingDay}`,
        urgency: 100,
        title: def.label,
        detail: `$${owed} owed — due ${formatDate(postingDay)}${cutoffTxt}`,
        dueDay: postingDay,
        daysUntil: postingDay - day,
      });
    } else {
      const dueDay = bill.dueDay || day + cadence;
      const daysUntil = dueDay - day;
      const est = computeBillAmount(def, gs);
      out.push({
        ...base,
        key: `bill:${billId}:due:${dueDay}`,
        urgency: Math.min(TRACKER.futureRecurringMaxUrgency, trackerUrgencyFromDaysUntil(daysUntil)),
        detail: `~$${est} on ${formatDate(dueDay)}`,
        dueDay,
        daysUntil,
      });
    }
  }
  return out;
}

// Quarterly estimated taxes. The due date is synthesized (plan 4.3) — the
// last day of the quarter. Entry exists while either debt or this
// quarter's obligation remains: unpaid carried-forward debt (always ceiling)
// or income accrued this quarter that hasn't been billed yet (ladder).
// Key embeds the quarter-end day, so a dismissal never hides next quarter.
function trackerTaxes(gs) {
  const day = gs.meta.clock.day;
  const taxes = gs.world.taxes;
  if (!taxes) return null;
  const unpaid = taxes.unpaid || 0;
  const owed = computeTaxOwed(gs).owed || 0;
  if (unpaid <= 0 && owed <= 0) return null;
  const nextDue = day + ((CALENDAR.daysPerTaxPeriod - (day % CALENDAR.daysPerTaxPeriod)) % CALENDAR.daysPerTaxPeriod);
  const daysUntil = nextDue - day;
  return {
    key: `taxes:due:${nextDue}`,
    kind: 'taxes',
    urgency: unpaid > 0 ? 100 : trackerUrgencyFromDaysUntil(daysUntil),
    title: 'Estimated taxes due',
    detail: unpaid > 0
      ? `${unpaid} unpaid${owed > 0 ? ` + ~${owed} this period` : ''} — due ${formatDate(nextDue)}`
      : `~${owed} owed at period end — ${formatDate(nextDue)}`,
    dueDay: nextDue,
    daysUntil,
    deepLink: { appId: 'bank', screenId: 'overview', params: {} },
  };
}

// Accepted gigs. blocksDone is fractional (work blocks scale with focus);
// show the running total against the deadline.
function trackerGigs(gs) {
  const day = gs.meta.clock.day;
  const accepted = gs.world.computer?.apps?.gigs?.accepted || [];
  return accepted.map(gig => {
    const daysUntil = gig.deadlineDay - day;
    const late = day > gig.deadlineDay;
    const blocksDone = Math.round((gig.blocksDone || 0) * 10) / 10;
    const when = late ? 'deadline passed'
      : daysUntil === 0 ? 'due today'
      : `${daysUntil}d left`;
    return {
      key: `gig:${gig.gigId}`,
      kind: 'gig',
      urgency: trackerUrgencyFromDaysUntil(daysUntil),
      title: gig.label,
      detail: `${gig.client} · ${when} · ${blocksDone}/${gig.blocks} blocks`,
      dueDay: gig.deadlineDay,
      daysUntil,
      deepLink: { appId: 'work', screenId: 'accepted', params: {} },
    };
  });
}

// The catalog's daily trickle (aspirations-and-creative-careers Phase 4,
// D18). Date-less and informational: one line naming what the catalog
// paid this morning and how many titles are out, derived by re-running
// works.js's catalogIncomeForDay WITHOUT crediting — the seeded roll is
// per (seed, day, work), so the preview is the exact number the rollover
// landed; nothing is stored to remember it. Absent when nothing is out or
// nothing earned.
function trackerCatalog(gs) {
  if (typeof catalogIncomeForDay !== 'function') return null;
  const day = gs.meta.clock.day;
  const income = catalogIncomeForDay(gs, day);
  if (!income || income.byWork.length === 0) return null;
  const out = (gs.player.works || []).filter(w => w.releasedDay != null).length;
  const spikes = income.byWork.filter(w => w.spike).length;
  return {
    key: `catalog:${day}`,
    kind: 'catalog',
    urgency: TRACKER.catalogUrgency,
    title: 'Catalog',
    detail: `${Math.round(income.total)} today from ${out} ${out === 1 ? 'title' : 'titles'}${spikes ? ` · ${spikes} having a good day` : ''}`,
    dueDay: null,
    daysUntil: null,
    deepLink: { appId: 'work', screenId: 'works', params: {} },
  };
}

// The platform's next payout (aspirations-and-creative-careers Phase 10,
// D34): informational — what the current pools would pay on the next
// billing day (the same rent cadence). Absent until there is anyone to
// bill. Derived every call; nothing stored.
function trackerPlatform(gs) {
  if (typeof ensureChatterProfile !== 'function') return null;
  const p = ensureChatterProfile(gs);
  const backers = (p.backers.ghosts || 0) + p.backers.cast.length;
  const priv = (p.private.ghosts || 0) + p.private.cast.length;
  if (backers + priv === 0 || p.nextBillingDay == null) return null;
  const day = gs.meta.clock.day;
  const daysUntil = p.nextBillingDay - day;
  const amount = backers * p.backersPrice + priv * p.privatePrice;
  return {
    key: `platform:${p.nextBillingDay}`,
    kind: 'platform',
    urgency: TRACKER.catalogUrgency,
    title: 'Chatter payout',
    detail: `${amount} due in ${daysUntil}d — ${backers} ${CHATTER_LABELS.backers}${priv ? ` · ${priv} ${CHATTER_LABELS.private}` : ''}`,
    dueDay: p.nextBillingDay,
    daysUntil,
    deepLink: { appId: 'social_feed', screenId: 'profile', params: { npcId: 'player' } },
  };
}

// Active quests, by expiry. A quest past its expiry is a real failure
// state (UI's processQuestsForDay marks it failed at next rollover) — the
// tracker surfaces it as max-urgency until then.
function trackerQuests(gs) {
  const day = gs.meta.clock.day;
  const active = gs.world.quests?.active || [];
  return active.map(q => {
    const npcName = gs.npcs[q.npcId]?.bible?.name;
    const daysUntil = q.expiresDay - day;
    const expired = day > q.expiresDay;
    const stepTxt = q.type === 'chain' && q.steps
      ? ` · step ${Math.min(q.steps.length, (q.currentStep || 0) + 1)}/${q.steps.length}`
      : '';
    return {
      key: `quest:${q.id}`,
      kind: 'quest',
      urgency: expired ? 100 : trackerUrgencyFromDaysUntil(daysUntil),
      title: q.title,
      detail: expired
        ? `${npcName ? npcName + ' — ' : ''}expired, talk to them now`
        : `${q.desc}${stepTxt}`,
      dueDay: q.expiresDay,
      daysUntil,
      deepLink: { appId: 'im', screenId: 'threads', params: {} },
    };
  });
}

// Deliveries in flight (status 'ordered'); delivered packages have become
// objects on the doormat and drop off the list on their own. Always
// etaDay = day + 1, so this is a genuine "your package is here" ping.
function trackerDeliveries(gs) {
  const day = gs.meta.clock.day;
  const deliveries = gs.world.deliveries || [];
  return deliveries.filter(d => d.status === 'ordered').map(d => {
    const label = ITEM_DEFS[d.defId]?.label || d.defId || d.item || 'a package';
    const qty = d.qty > 1 ? ` ×${d.qty}` : '';
    const daysUntil = d.etaDay - day;
    const arrived = day >= d.etaDay;
    return {
      key: `delivery:${d.id}`,
      kind: 'delivery',
      urgency: arrived ? 85 : trackerUrgencyFromDaysUntil(daysUntil),
      title: arrived ? 'Package at the door' : 'Package arriving',
      detail: `${label}${qty} — ${arrived ? 'waiting on the doormat' : `arrives day ${d.etaDay}`}`,
      dueDay: d.etaDay,
      daysUntil,
      deepLink: { appId: 'shop', screenId: 'browse', params: {} },
    };
  });
}

// Hired services. Visits happen on the service's own cadence (day
// rollover), so a scheduled visit is informational — capped at
// futureRecurringMaxUrgency like paid-up bills.

// Active renovation jobs (renovation overhaul Phase 3). One entry per
// active job; the title's "day N of M" reads as a live construction log
// that updates day to day and disappears when the job completes at day
// rollover (status flips to 'complete'). dueDay is the job's ETA, so the
// urgency ladder treats a due-soon job like a delivery.
function trackerRenovationJobs(gs) {
  const day = gs.meta.clock.day;
  const jobs = gs.world.renovationJobs || [];
  return jobs.filter(j => j.status === 'active').map(j => {
    const def = FACILITY_DEFS[j.facilityId];
    const label = def?.label || j.facilityId;
    const dayN = Math.max(1, Math.min(j.durationDays, day - j.startDay + 1));
    const daysUntil = j.etaDay - day;
    return {
      key: `reno:${j.id}`,
      kind: 'reno',
      urgency: trackerUrgencyFromDaysUntil(daysUntil),
      title: `${label} — day ${dayN} of ${j.durationDays}`,
      detail: `${j.jobType === 'upgrade' ? 'Upgrade' : 'Repair'} in progress${daysUntil === 0 ? ' — finishes today' : ` — done ${formatDate(j.etaDay)}`}`,
      dueDay: j.etaDay,
      daysUntil,
      deepLink: { appId: 'upgrades', screenId: 'dashboard', params: {} },
    };
  });
}

function trackerServices(gs) {
  const day = gs.meta.clock.day;
  const hired = gs.world.computer?.apps?.services?.hired || [];
  const out = [];
  for (const hire of hired) {
    const def = SERVICE_DEFS[hire.serviceId];
    if (!def) continue;
    const nextDay = hire.nextDay || day;
    const daysUntil = nextDay - day;
    out.push({
      key: `service:${hire.serviceId}`,
      kind: 'service',
      urgency: Math.min(TRACKER.futureRecurringMaxUrgency, trackerUrgencyFromDaysUntil(daysUntil)),
      title: `${def.label} visit`,
      detail: `$${def.costPerVisit}/visit — ${daysUntil === 0 ? 'today' : `in ${daysUntil}d`}`,
      dueDay: nextDay,
      daysUntil,
      deepLink: { appId: 'services', screenId: 'hired', params: {} },
    });
  }
  return out;
}

// Unread IM threads (populated by OVERTURE_DEFS.text_player). One entry per
// thread with a count; urgency scales per-message up to a cap so a flood
// can't out-rank real money obligations.
function trackerImUnread(gs) {
  const threads = gs.world.computer?.apps?.im?.threads || {};
  const out = [];
  for (const [npcId, thread] of Object.entries(threads)) {
    const unread = thread.unread || 0;
    if (unread <= 0) continue;
    const name = gs.npcs[npcId]?.bible?.name || 'Someone';
    out.push({
      key: `im:${npcId}`,
      kind: 'im',
      urgency: Math.min(TRACKER.imUnreadMax, TRACKER.imUnreadUrgency * unread),
      title: `${name} messaged you`,
      detail: unread === 1 ? '1 new message' : `${unread} new messages`,
      dueDay: null,
      daysUntil: null,
      deepLink: { appId: 'im', screenId: 'threads', params: {} },
    });
  }
  return out;
}

// Enrolled courses — no date (plan 4.3): "N of M lessons". Fixed low
// urgency; the detail shows progress so the Agenda doubles as a progress
// checklist.
function trackerCourses(gs) {
  const enrolled = gs.world.computer?.apps?.classes?.enrolled || [];
  const out = [];
  for (const enrollment of enrolled) {
    const course = COURSE_DEFS[enrollment.courseId];
    if (!course) continue;
    const lessons = course.lessons || 0;
    out.push({
      key: `course:${enrollment.courseId}`,
      kind: 'course',
      urgency: TRACKER.courseUrgency,
      title: course.label,
      detail: `${enrollment.progress || 0}/${lessons} lessons done — keep it up`,
      dueDay: null,
      daysUntil: null,
      deepLink: { appId: 'classes', screenId: 'enrolled', params: {} },
    });
  }
  return out;
}

// Facility decay — use-driven, no date (plan 4.3): warn once a FUNCTIONAL
// facility's condition dips below the warn threshold, escalate to a real
// notification below the critical threshold. Broken facilities are a known
// state of the world (the apartment starts in disrepair) and show up in
// RenoFix already — tracking them here would flood the phone on day 1.
function trackerFacilities(gs) {
  const upgrades = gs.world.upgrades || {};
  const out = [];
  for (const [facId, state] of Object.entries(upgrades)) {
    const def = FACILITY_DEFS[facId];
    if (!def || state.condition == null) continue;
    if (state.tier === 'broken') continue;
    const condition = state.condition;
    const critical = condition <= TRACKER.facilityCriticalCondition;
    const warn = !critical && condition <= TRACKER.facilityWarnCondition;
    if (!warn && !critical) continue;
    out.push({
      key: `facility:${facId}`,
      kind: 'facility',
      urgency: critical ? TRACKER.facilityCriticalUrgency : TRACKER.facilityWarnUrgency,
      title: `${def.label} needs repair`,
      detail: `${ROOMS[def.room]?.name ? ROOMS[def.room].name + ' · ' : ''}condition ${Math.round(condition)}%${critical ? ' — on its last legs' : ''}`,
      dueDay: null,
      daysUntil: null,
      deepLink: { appId: 'upgrades', screenId: 'dashboard', params: {} },
    });
  }
  return out;
}

// High-tension residents on the move-out ladder (UI's
// processRelConsequencesForDay). The countdown is derived from the same
// `_highTensionDays` counter the ladder uses, so it reads the real
// remaining days, not a stored date.
function trackerTension(gs) {
  const out = [];
  for (const [npcId, npc] of Object.entries(gs.npcs || {})) {
    const highDays = npc.flags?._highTensionDays || 0;
    const tension = npc.relPlayer?.tension || 0;
    if (highDays <= 0 && tension < REL_CONSEQUENCES.tensionHigh) continue;
    const daysUntil = REL_CONSEQUENCES.tensionMoveOutDay - highDays;
    out.push({
      key: `tension:${npcId}`,
      kind: 'tension',
      urgency: TRACKER.highTensionUrgency,
      title: `${npc.bible?.name || npcId} is on the edge`,
      detail: daysUntil <= 0
        ? 'tension is critical — could move out today'
        : `critical tension — ${daysUntil}d to moving out`,
      dueDay: null,
      daysUntil,
      deepLink: { appId: 'im', screenId: 'threads', params: {} },
    });
  }
  return out;
}

// Booked commitments (actions-and-activities-overhaul-plan.md Phase 1, D2)
// — the "scheduler hook" the plan's Phase 1 asked for: before this, a
// booked dinner/hangout was invisible everywhere except at the moment it
// actually ran (SIM's resolveScheduleActivity already relocates every
// accepted attendee for the window with no help from here — this adapter
// only makes the plan itself visible ahead of time, on the Agenda and, once
// urgent, as a real notification). Reuses upcomingCommitments (commitments.js)
// — the same read the Calendar app's `commitments` screen source uses
// (render.computer.js), so "what's on the calendar" has one definition.
// `acceptedIds` (not invitedIds) names who's actually coming — someone who
// hasn't answered yet doesn't belong in "who's coming to dinner."
function trackerCommitments(gs) {
  const day = gs.meta.clock.day;
  return upcomingCommitments(gs).map(c => {
    const def = COMMITMENT_KINDS[c.kind] || {};
    const kindLabel = def.label || 'plans';
    const names = (c.acceptedIds || []).map(id => gs.npcs[id]?.bible?.name).filter(Boolean);
    const who = names.length ? names.join(', ') : 'no one yet';
    const cDay = commitmentDay(c);
    const daysUntil = cDay - day;
    const at = formatTime(absoluteToClock(c.startAbs).minutes);
    const hostNote = c.host !== 'player' ? ` — ${gs.npcs[c.host]?.bible?.name || 'they'} set it up` : '';
    return {
      key: `commitment:${c.id}`,
      kind: 'commitment',
      urgency: trackerUrgencyFromDaysUntil(daysUntil),
      title: `${kindLabel.charAt(0).toUpperCase()}${kindLabel.slice(1)} with ${who}`,
      detail: `${daysUntil === 0 ? 'today' : formatDate(cDay)} at ${at}${hostNote}`,
      dueDay: cDay,
      daysUntil,
      deepLink: { appId: 'calendar', screenId: 'upcoming', params: {} },
    };
  });
}

// --- The one derived pass (plan 4.1) ---
// Every source above, flattened, in a fixed order. Deterministic: no
// randomness, no LLM, no persistence — same save, same entries.
function buildTrackerEntries(gs) {
  const adapters = [
    trackerRent, trackerBills, trackerTaxes, trackerGigs, trackerCatalog, trackerPlatform, trackerQuests,
    trackerDeliveries, trackerRenovationJobs, trackerServices, trackerImUnread,
    trackerCourses, trackerFacilities, trackerTension, trackerCommitments,
  ];
  const out = [];
  for (const fn of adapters) {
    const res = fn(gs);
    if (!res) continue;
    if (Array.isArray(res)) out.push(...res);
    else out.push(res);
  }
  return out;
}

// Notifications = the urgent entries minus the player's intents (plan 4.4):
// dismissed keys stay gone for the life of that obligation (the key embeds
// its identity, so a future posting of the same bill re-notifies with a
// fresh key); snoozed keys resurface at their resurface day. DND and
// presence are NOT handled here — they gate the badge (phone.js) and the
// Notifications screen (render.phone.js), because the Agenda stays full
// regardless (silencing blinds, never shields).
function getTrackerNotifications(gs) {
  const day = gs.meta.clock.day;
  const phone = gs.world.phone || {};
  const dismissed = phone.dismissed || {};
  const snoozed = phone.snoozed || {};
  return buildTrackerEntries(gs)
    .filter(e => e.urgency >= TRACKER.notifyThreshold)
    .filter(e => dismissed[e.key] == null)
    .filter(e => !(snoozed[e.key] != null && day < snoozed[e.key]))
    .sort(sortTrackerEntries);
}

// Shared sort: urgency desc, then due-soonest first (date-less entries
// sink below any real countdown).
function sortTrackerEntries(a, b) {
  return (b.urgency - a.urgency) || ((a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));
}

// ===== /SECTION: TRACKER =====
