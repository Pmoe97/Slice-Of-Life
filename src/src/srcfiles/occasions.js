// ===== SECTION: OCCASIONS =====
// The year's holidays (occasions-and-holidays-plan.md Phase 1, D1–D9;
// SEASONS-AND-OCCASIONS-ROADMAP.md R1–R12). The ONE module that answers
// "what is today" on the calendar (R11): which occasions fall on a day,
// which night of a run it is, what's coming up, how festive a person is,
// and the prompt/Calendar/narration surfaces that read all of that.
//
// R1 is the rule every line here and in OCCASION_DEFS obeys: no religion,
// anywhere. Observance is personal — festivity (D6), never identity (R2).
//
// Everything in this file is DERIVED (R5) and DETERMINISTIC (R6): an
// occasion's date is arithmetic over CALENDAR, festivity is a pure function
// of the bible. Nothing here writes state except processOccasionsForDay's
// narration return value, the holiday-morning mood nudge (Phase 2,
// applyHolidayWorkMood), and — the one stored field — who put decorations
// up and when (Phase 3, world.occasions.decor: a response, per roadmap
// invariant 2).
//
// Calendar facts this leans on: day 1 is the 1st of Spring, Year 1; a season
// is 35 days; a year is 140 days — exactly 20 weeks — so a day-of-year always
// falls on the same weekday (getWeekday), and every season starts on a
// Sunday.

// --- Dates ------------------------------------------------------------------

function occasionSeasonIndex(def) {
  return Math.max(0, CALENDAR.seasons.indexOf(def.season));
}

// The row's FIRST day as a day-of-year (1..140).
function occasionDayOfYear(def) {
  return occasionSeasonIndex(def) * CALENDAR.daysPerSeason + def.dom;
}

function occasionSpan(def) {
  return Math.max(1, def.span || 1);
}

// What a run counts in: Lantern Nights is six NIGHTS, Giving Week six DAYS.
function occasionSpanUnit(def) {
  return def.spanUnit === 'day' ? 'day' : 'night';
}

// Day-of-year for an absolute day (day 1 = 1st of Spring, Y1).
function occasionDoy(day) {
  const n = CALENDAR.daysPerYear;
  return ((((day - 1) % n) + n) % n) + 1;
}

// Absolute day on which a row STARTS in a given year (year 1 = days 1..140).
function occasionStartDay(def, year) {
  return (year - 1) * CALENDAR.daysPerYear + occasionDayOfYear(def);
}

// Every occasion on `day`, in OCCASION_DEFS order, each with which night of
// its run this is (1-based) — `night === 1` is the day it starts.
function occasionsOnDay(day) {
  const doy = occasionDoy(day);
  const out = [];
  for (const def of Object.values(OCCASION_DEFS)) {
    const start = occasionDayOfYear(def);
    const span = occasionSpan(def);
    const night = doy - start + 1;
    if (night >= 1 && night <= span) out.push({ def, id: def.id, night, total: span });
  }
  return out;
}

function isOccasionOn(day, id) {
  return occasionsOnDay(day).some(o => o.id === id);
}

// Days until a row next STARTS, from `fromDay` (0 = it starts today). A run
// already under way counts as the NEXT year's start — callers wanting "is it
// on now" use occasionsOnDay.
function daysUntilOccasion(def, fromDay) {
  const n = CALENDAR.daysPerYear;
  return (occasionDayOfYear(def) - occasionDoy(fromDay) + n) % n;
}

// Every occasion starting within `horizon` days of `fromDay` (inclusive of
// today), soonest first, plus any run already under way today (daysUntil 0,
// ongoing true). The Calendar's Holidays tab and the prompt's "coming up".
function upcomingOccasions(fromDay, horizon) {
  const h = horizon == null ? CALENDAR.daysPerYear - 1 : horizon;
  const ongoing = new Set(occasionsOnDay(fromDay).filter(o => o.night > 1).map(o => o.id));
  const rows = [];
  for (const def of Object.values(OCCASION_DEFS)) {
    if (ongoing.has(def.id)) {
      const on = occasionsOnDay(fromDay).find(o => o.id === def.id);
      rows.push({ def, id: def.id, daysUntil: 0, startDay: fromDay - (on.night - 1), ongoing: true, night: on.night, total: on.total });
      continue;
    }
    const until = daysUntilOccasion(def, fromDay);
    if (until <= h) rows.push({ def, id: def.id, daysUntil: until, startDay: fromDay + until, ongoing: false });
  }
  const order = Object.keys(OCCASION_DEFS);
  return rows.sort((a, b) => (a.daysUntil - b.daysUntil) || (order.indexOf(a.id) - order.indexOf(b.id)));
}

// "early" / "mid" / "late" — where in its season a day sits (D4).
function seasonStage(day) {
  const dom = ((occasionDoy(day) - 1) % CALENDAR.daysPerSeason) + 1;
  for (const [cut, word] of OCCASION_TUNING.seasonStages) if (dom <= cut) return word;
  return 'late';
}

// "25th of Winter" — the same wording formatDate uses, without the weekday
// or year. Shared with the Calendar rows and the prompt.
function formatOccasionDate(def) {
  return `${def.dom}${ordinalSuffix(def.dom)} of ${CALENDAR.seasonNames[def.season]}`;
}

function occasionWeekdayName(def) {
  return WEEKDAY_NAMES[getWeekday(occasionDayOfYear(def))];
}

// --- Festivity (D6–D8) ------------------------------------------------------

function festivitySeedBase(npc) {
  const raw = npc?.bible?.genSeed ?? npc?.genSeed ?? null;
  return (typeof raw === 'number' && isFinite(raw)) ? raw : hashStr(String(raw ?? npc?.id ?? 'npc'));
}

// D6 — how much this person cares about holidays in general, 0..1. A seeded
// base around 0.5 plus small leans from temperament, traits and values; never
// from heritage, species or anything faith-shaped (R2). bible.festivity
// (a number in 0..1) overrides for authored characters.
function npcFestivity(npc) {
  const b = npc?.bible || {};
  if (typeof b.festivity === 'number' && isFinite(b.festivity)) return Math.max(0, Math.min(1, b.festivity));
  const T = OCCASION_TUNING;
  const rng = mulberry32(((festivitySeedBase(npc) >>> 0) + T.festivitySeedSalt) >>> 0);
  let f = 0.5 + (rng() * 2 - 1) * T.festivityJitter;
  const temp = b.temperament || {};
  for (const [axis, w] of Object.entries(T.festivityTemperament)) f += (Number(temp[axis]) || 0) * w;
  for (const trait of b.personality?.traits || []) f += T.festivityTraits[trait] || 0;
  for (const v of b.values || []) f += T.festivityValues[v?.name] || 0;
  return Math.max(0, Math.min(1, f));
}

// D7 — their feeling about ONE occasion: festivity plus a small seeded tilt,
// so a festive person can be lukewarm on Halloween and a grump can secretly
// love Midsummer.
function npcOccasionAffinity(npc, occasionId) {
  const T = OCCASION_TUNING;
  const rng = mulberry32(((festivitySeedBase(npc) >>> 0) + T.affinitySeedSalt + hashStr(String(occasionId))) >>> 0);
  return Math.max(0, Math.min(1, npcFestivity(npc) + (rng() * 2 - 1) * T.affinityJitter));
}

function festivityPhrase(value) {
  for (const [cut, words] of OCCASION_TUNING.festivityWords) if (value >= cut) return words;
  return OCCASION_TUNING.festivityWords[OCCASION_TUNING.festivityWords.length - 1][1];
}

// --- Prompt lines (D4) ------------------------------------------------------

// A major occasion (or any row with an eve line) inside leadDays counts as
// "coming up" — the only ones worth a line before the day.
function occasionIsAnticipated(def) {
  return def.closure === 'major' || !!(def.lines && def.lines.eve);
}

function occasionTodayLabel(o) {
  return o.total > 1 ? `${o.def.label} (${occasionSpanUnit(o.def)} ${o.night} of ${o.total})` : o.def.label;
}

// The scene prompt's date line — the prompt used to carry only "Day N".
// "- Date: Saturday, 14th of Spring, Year 1 (early spring). Today is
//  Valentine's Day — …. Coming up: Color Day in 7 days."
function occasionDateLine(gs) {
  const day = gs?.meta?.clock?.day;
  if (!day) return '';
  const season = getSeason(day);
  let line = `- Date: ${formatDate(day)} (${seasonStage(day)} ${season})`;
  const today = occasionsOnDay(day);
  if (today.length) {
    line += `. Today is ${today.map(o => `${occasionTodayLabel(o)} (${o.def.blurb})`).join('; and ')}`;
  }
  const next = upcomingOccasions(day, OCCASION_TUNING.leadDays)
    .filter(r => r.daysUntil > 0 && occasionIsAnticipated(r.def));
  if (next.length) {
    line += `. Coming up: ${next.map(r => `${r.def.label} ${r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}`).join(', ')}`;
  }
  return `${line}.`;
}

// The per-NPC [Occasion] line (buildNpcBlockV2, beside [Birthday]) — only on
// an occasion, or with an anticipated one inside leadDays. Residents only,
// like birthdays (a visitor's festivity isn't the house's business yet).
function occasionPromptLine(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  const day = gs?.meta?.clock?.day;
  if (!npc || !day || npc.residency?.status !== 'resident') return null;
  const name = npc.bible?.name || 'They';
  const today = occasionsOnDay(day).filter(o => (o.def.traditions || []).length > 0);
  if (today.length) {
    const o = today[0];
    // Phase 2 (D13): whether they're working it, and why — so the
    // conversation can play "picked up the holiday shift" or "stuck at work".
    const plan = holidayWorkPlan(npc, day);
    const work = plan ? ` ${name} ${holidayWorkPhrase(plan)}.` : '';
    return `[Occasion]: Today is ${occasionTodayLabel(o)}. ${name} ${festivityPhrase(npcOccasionAffinity(npc, o.id))}.${work}`;
  }
  const next = upcomingOccasions(day, OCCASION_TUNING.leadDays).find(r => r.daysUntil > 0 && occasionIsAnticipated(r.def));
  if (next) {
    const when = next.daysUntil === 1 ? 'tomorrow' : `in ${next.daysUntil} days`;
    return `[Occasion]: ${next.def.label} is ${when}. ${name} ${festivityPhrase(npcOccasionAffinity(npc, next.id))}.`;
  }
  return null;
}

// --- Calendar surfaces (D3) ---------------------------------------------------

// The Holidays tab: the whole coming year, soonest first.
function holidayRows(gs) {
  const day = gs?.meta?.clock?.day || 1;
  return upcomingOccasions(day, CALENDAR.daysPerYear - 1).map(r => ({
    id: r.id, emoji: r.def.emoji || '🎉', label: r.def.label,
    date: formatOccasionDate(r.def), weekday: occasionWeekdayName(r.def),
    daysUntil: r.daysUntil, ongoing: !!r.ongoing, night: r.night || null, total: occasionSpan(r.def),
    unit: occasionSpanUnit(r.def),
  }));
}

function holidayRowLabel(row) {
  const unit = row.unit || 'night';
  const span = row.total > 1 ? ` · ${row.total} ${unit}s` : '';
  const when = row.ongoing ? `${unit} ${row.night} of ${row.total} — on now`
    : row.daysUntil === 0 ? 'today!' : row.daysUntil === 1 ? 'tomorrow' : `in ${row.daysUntil} days`;
  return `${row.emoji} ${row.label} — ${row.weekday.slice(0, 3)} ${row.date}${span} (${when})`;
}

// The Year tab's model: the CURRENT year as four seasons of five 7-day weeks
// (every season starts on a Sunday, so the grid is exactly 5×7, no padding).
// Each cell carries what lands on it — occasions, and the birthdays the
// player knows (the birthdays module's own `known` record; unknown ones stay
// hidden, birthdays D3). Pure: the renderer paints it, the birthday picker
// (birthdays P2) will reuse it without the per-player marks.
function yearGridModel(gs, opts) {
  const today = gs?.meta?.clock?.day || 1;
  const year = getYear(today);
  const base = (year - 1) * CALENDAR.daysPerYear;
  const known = (opts && opts.birthdays === false) ? {} : (gs?.player?.birthdays?.known || {});
  const bdayByDoy = {};
  for (const id of Object.keys(known)) {
    const npc = gs.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident' || typeof npcBirthdayDayOfYear !== 'function') continue;
    const doy = npcBirthdayDayOfYear(npc);
    (bdayByDoy[doy] = bdayByDoy[doy] || []).push(npc.bible?.name || 'Roommate');
  }
  // Side Projects (projects.js): a roommate's booked show — the open mic,
  // the screening — on its day.
  const eventsByDay = {};
  if (!(opts && opts.events === false) && typeof projectCalendarEvents === 'function') {
    for (const e of projectCalendarEvents(gs)) (eventsByDay[e.day] = eventsByDay[e.day] || []).push({ emoji: e.emoji, label: e.label });
  }
  const seasons = CALENDAR.seasons.map((season, si) => {
    const cells = [];
    for (let dom = 1; dom <= CALENDAR.daysPerSeason; dom++) {
      const doy = si * CALENDAR.daysPerSeason + dom;
      const day = base + doy;
      cells.push({
        doy, dom, day,
        weekday: getWeekday(day),
        isToday: day === today,
        isPast: day < today,
        occasions: occasionsOnDay(day).map(o => ({ id: o.id, emoji: o.def.emoji || '🎉', label: occasionTodayLabel(o) })),
        birthdays: bdayByDoy[doy] || [],
        events: eventsByDay[day] || [],
      });
    }
    return { season, label: CALENDAR.seasonNames[season], cells };
  });
  return { year, seasons };
}

// The HUD's short badge for today ("🎁 Midwinter"), or '' on an ordinary day.
function occasionBadge(day) {
  const today = occasionsOnDay(day);
  if (!today.length) return '';
  const o = today[0];
  return `${o.def.emoji || '🎉'} ${o.total > 1 ? `${o.def.label} ${o.night}/${o.total}` : o.def.label}`;
}

// --- Decorations (Phase 3) ----------------------------------------------------
// A decorated occasion has one set (OCCASION_DECOR), living in one room. The
// PLAYER can put it up from `lead` days before (the Decorate chip); a festive
// roommate does it `npcLead` days before if nobody has. It comes down after
// the occasion — a roommate's on a lag set by their conscientiousness, yours
// when you take it down (or, eventually, when someone gives up waiting).
//
// The first STORED occasion state (roadmap invariant 2: only responses are
// stored — putting decorations up is one): world.occasions.decor[occasionId]
// = { year, upDay, by, downDay, dueDownDay, lingerNoted }. One record per
// occasion, for the year it was put up in; the next year's first write
// replaces it.

// {name}/{label} placeholder fill — local, so this module never leans on
// another module's helper.
function fillOccasionText(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

function ensureWorldOccasions(gs) {
  const w = gs.world || (gs.world = {});
  if (!w.occasions || typeof w.occasions !== 'object') w.occasions = {};
  if (!w.occasions.decor || typeof w.occasions.decor !== 'object') w.occasions.decor = {};
  return w.occasions;
}

// The window, in absolute days, for this year's instance of a decorated
// occasion: { playerFrom, npcDay, start, end }, or null (no decor set).
function decorWindow(occasionId, day) {
  const def = OCCASION_DEFS[occasionId];
  const decor = OCCASION_DECOR[occasionId];
  if (!def || !decor) return null;
  // The instance whose window `day` could fall in: this year's, or next
  // year's when the lead-in crosses the year boundary.
  let start = occasionStartDay(def, getYear(day));
  if (start + occasionSpan(def) - 1 < day - CALENDAR.daysPerYear / 2) start += CALENDAR.daysPerYear;
  return { start, end: start + occasionSpan(def) - 1, playerFrom: start - decor.lead, npcDay: start - decor.npcLead, year: getYear(start) };
}

function decorRecord(gs, occasionId, year) {
  const r = gs?.world?.occasions?.decor?.[occasionId];
  return r && r.year === year ? r : null;
}

function isDecorUp(record, day) {
  return !!record && record.upDay <= day && (record.downDay == null || record.downDay > day);
}

// Which decorated occasion the player can put up in `roomId` today, or null:
// inside its window, before it's over, and not already up this year.
function occasionToDecorate(gs, day, roomId) {
  for (const occId of Object.keys(OCCASION_DECOR)) {
    const decor = OCCASION_DECOR[occId];
    if (roomId && decor.room !== roomId) continue;
    const w = decorWindow(occId, day);
    if (!w || day < w.playerFrom || day > w.end) continue;
    if (decorRecord(gs, occId, w.year)) continue;
    return occId;
  }
  return null;
}

// Every set up in `roomId` on `day`: [{ occasionId, decor, record }].
function decorationsUpIn(gs, roomId, day) {
  const out = [];
  for (const [occId, rec] of Object.entries(gs?.world?.occasions?.decor || {})) {
    const decor = OCCASION_DECOR[occId];
    if (!decor || (roomId && decor.room !== roomId) || !isDecorUp(rec, day)) continue;
    out.push({ occasionId: occId, decor, record: rec });
  }
  return out;
}

// The player's own set that can come down now (in this room, and the
// occasion is over), or null — the Take Down chip.
function decorToTakeDown(gs, day, roomId) {
  for (const { occasionId, record } of decorationsUpIn(gs, roomId, day)) {
    const w = decorWindow(occasionId, record.upDay);
    if (w && day > w.end) return occasionId;
  }
  return null;
}

function decorTakedownLag(npc) {
  const T = OCCASION_TUNING.decor.takedownDays;
  const c = ((Number(npc?.bible?.temperament?.conscientiousness) || 0) + 1) / 2;
  return T.min + Math.round((1 - c) * (T.max - T.min));
}

// Puts a set up. `by` is 'player' or an npc id. Returns the narration line.
function putUpDecorations(gs, occasionId, by, day) {
  const decor = OCCASION_DECOR[occasionId];
  const w = decorWindow(occasionId, day);
  if (!decor || !w) return null;
  const occ = ensureWorldOccasions(gs);
  const npc = by === 'player' ? null : gs.npcs?.[by];
  const lag = by === 'player' ? OCCASION_TUNING.decor.playerAutoDownDays : decorTakedownLag(npc);
  occ.decor[occasionId] = { year: w.year, upDay: day, by, downDay: null, dueDownDay: w.end + lag, lingerNoted: false };
  if (by === 'player') return decor.playerUp;
  return fillOccasionText(decor.npcUp, { name: npc?.bible?.name || 'A roommate' });
}

function takeDownDecorations(gs, occasionId, by, day) {
  const rec = gs?.world?.occasions?.decor?.[occasionId];
  if (!rec || rec.downDay != null) return null;
  rec.downDay = day;
  rec.downBy = by;
  const T = OCCASION_TUNING.decor.lines;
  const label = OCCASION_DEFS[occasionId]?.label || 'holiday';
  if (by === 'player') return fillOccasionText(T.playerDown, { label });
  if (by === 'auto') return fillOccasionText(T.autoDown, { label });
  return fillOccasionText(T.down, { label, name: gs.npcs?.[by]?.bible?.name || 'Someone' });
}

// The daily decor pass (inside processOccasionsForDay, live state only):
// sets that are due come down; a long-lingering set gets remarked on once;
// a festive roommate puts up any set nobody has, on its npcDay; and every
// resident's mood nudges by how they feel about what's up.
function processDecorForDay(gs, day, ids) {
  const D = OCCASION_TUNING.decor;
  const lines = [];
  for (const [occId, rec] of Object.entries(gs.world?.occasions?.decor || {})) {
    if (!isDecorUp(rec, day)) continue;
    const label = OCCASION_DEFS[occId]?.label || 'holiday';
    if (day >= rec.dueDownDay) {
      // A roommate takes down their own set (or, if they've left, the next
      // resident does); the player's set comes down on its own only after
      // playerAutoDownDays — somebody got tired of waiting.
      const by = rec.by === 'player' ? 'auto' : (ids.includes(rec.by) ? rec.by : (ids[0] || 'auto'));
      const l = takeDownDecorations(gs, occId, by, day);
      if (l) lines.push(l);
      continue;
    }
    const w = decorWindow(occId, rec.upDay);
    if (w && !rec.lingerNoted && day >= w.end + D.lingerNoticeDays) {
      rec.lingerNoted = true;
      lines.push(fillOccasionText(D.lines.linger, { label }));
    }
  }
  for (const occId of Object.keys(OCCASION_DECOR)) {
    const w = decorWindow(occId, day);
    if (!w || day !== w.npcDay || decorRecord(gs, occId, w.year)) continue;
    let best = null;
    for (const id of ids) {
      const aff = npcOccasionAffinity(gs.npcs[id], occId);
      if (aff >= D.decorAffinity && (!best || aff > best.aff)) best = { id, aff };
    }
    if (!best) continue;
    const l = putUpDecorations(gs, occId, best.id, day);
    if (l) lines.push(l);
  }
  const up = decorationsUpIn(gs, null, day);
  if (up.length) {
    for (const id of ids) {
      const npc = gs.npcs[id];
      let d = 0;
      for (const u of up) {
        const aff = npcOccasionAffinity(npc, u.occasionId);
        if (aff >= D.festiveCut) d += D.moodFestive;
        else if (aff <= D.grumpCut) d += D.moodGrump;
      }
      if (d) gs.npcs[id] = { ...npc, mood: Math.max(-1, Math.min(1, (npc.mood || 0) + d)) };
    }
  }
  return lines;
}

// "The living room is decorated for Midwinter — a tree strung with lights…"
// for the scene reader (composeScene) and the prompt's CURRENT SCENE, or null.
function decorSceneLine(gs, roomId, day) {
  const up = decorationsUpIn(gs, roomId, day || gs?.meta?.clock?.day);
  if (!up.length) return null;
  const roomName = (ROOMS[roomId]?.name || 'room').toLowerCase();
  return up.map(u => `The ${roomName} is decorated for ${OCCASION_DEFS[u.occasionId]?.label || 'the holidays'} — ${u.decor.phrase}.`).join(' ');
}

// THE HOME block's per-room annotation ("decorated for Midwinter: …"), or ''.
function decorHomeNote(gs, roomId, day) {
  const up = decorationsUpIn(gs, roomId, day || gs?.meta?.clock?.day);
  return up.map(u => `decorated for ${OCCASION_DEFS[u.occasionId]?.label || 'the holidays'}: ${u.decor.phrase}`).join('; ');
}

// --- The holiday work model (Phase 2, R4, D10–D16) ---------------------------
// Who works a holiday is a per-person decision, not a switch (the user's own
// design). Four questions, in order: does this job close? does it pay a
// holiday premium (or get busier)? how much does this person need or like
// the money, and how hard do they work? and how festive are they about THIS
// holiday? Deterministic per person × occasion × year (R6); nothing stored.

// D11 — the job's holiday policy: closed | staffed | open | oncall | self | none.
function holidayPolicyFor(occupation) {
  const W = OCCASION_TUNING.work;
  const occ = occupation || {};
  if (occ.holidayPolicy) return occ.holidayPolicy;
  if (W.titlePolicy[occ.title]) return W.titlePolicy[occ.title];
  if (occ.incomeSource === 'self') return 'self';
  if (occ.incomeSource === 'means' || occ.incomeSource === 'none') return 'none';
  return W.categoryPolicy[occ.category] || 'closed';
}

// How much this person needs (or just likes) the money, ~0..0.9.
function npcMoneyNeed(npc) {
  const M = OCCASION_TUNING.work.moneyNeed;
  const occ = npc?.bible?.occupation || {};
  if (occ.incomeSource === 'means') return 0;
  let m = M.band[occ.incomeBand] ?? M.band.mid;
  m += M.spendingLean[occ.spendingLean] || 0;
  for (const t of npc?.bible?.personality?.traits || []) m += M.traits[t] || 0;
  return Math.max(0, m);
}

// Work ethic, ~0..1: conscientiousness (−1..1 mapped to 0..1) plus leans.
function npcWorkEthic(npc) {
  const E = OCCASION_TUNING.work.workEthic;
  const b = npc?.bible || {};
  let e = ((Number(b.temperament?.conscientiousness) || 0) + 1) / 2;
  for (const t of b.personality?.traits || []) e += E.traits[t] || 0;
  for (const v of b.values || []) e += E.values[v?.name] || 0;
  return Math.max(0, Math.min(1.2, e));
}

// The occasion (if any) on `day` whose closure can move a shift: the first
// major, else the first partial. null on an ordinary day.
function workAffectingOccasion(day) {
  const on = occasionsOnDay(day).map(o => o.def);
  return on.find(d => d.closure === 'major') || on.find(d => d.closure === 'partial') || null;
}

// D12 — { occasionId, policy, works, reason, premium, busy } or null when the
// day can't change this person's shift (D10: no major/partial occasion, a
// weekend, a schedule with no weekday work block, or a non-working policy).
function holidayWorkPlan(npc, day) {
  if (!npc || !day) return null;
  const occDef = workAffectingOccasion(day);
  if (!occDef || isWeekend(day)) return null;
  const template = SCHEDULES[npc.bible?.scheduleTemplate] || SCHEDULES.standard;
  if (!template?.weekday?.work) return null;
  const occupation = npc.bible?.occupation || {};
  const policy = holidayPolicyFor(occupation);
  if (policy === 'none') return null;
  const W = OCCASION_TUNING.work;
  const busy = (occDef.busyFor || []).includes(occupation.category);
  const homePull = npcOccasionAffinity(npc, occDef.id) * (W.occasionWeight[occDef.closure] ?? 1);
  const base = npcMoneyNeed(npc) + 0.5 * npcWorkEthic(npc);
  const appeal = (p) => (p - 1) * W.premiumWeight;
  const rng = mulberry32(((festivitySeedBase(npc) >>> 0) + W.seedSalt + hashStr(occDef.id) + getYear(day) * 131) >>> 0);
  const out = (works, reason, premium) => ({ occasionId: occDef.id, policy, works, reason, premium: premium || 1, busy });

  if (policy === 'closed') return out(false, 'closed');
  if (policy === 'open' && W.openClosedOn.includes(occDef.id)) return out(false, 'closed');
  if (policy === 'oncall') {
    const callout = rng() < W.calloutChance;
    return callout && base + appeal(W.premium.oncall) > homePull
      ? out(true, 'called_out', W.premium.oncall) : out(false, 'closed');
  }
  if (policy === 'self') {
    const premium = busy ? W.premium.busy : 1;
    const margin = busy ? W.selfMarginBusy : W.selfMargin;
    return base + appeal(premium) - homePull > margin ? out(true, 'self_working', premium) : out(false, 'self_off');
  }
  // staffed / open: a share of staff is rostered; the rest may volunteer.
  const premium = policy === 'staffed' ? Math.max(W.premium.staffed, busy ? W.premium.busy : 1) : (busy ? W.premium.busy : 1);
  const workPull = base + appeal(premium);
  const rostered = rng() < (W.rosterShare[policy] ?? 0.5);
  if (rostered) {
    if (homePull - workPull > W.askOffMargin) {
      return rng() < W.swapChance ? out(false, 'asked_off', premium) : out(true, 'swap_failed', premium);
    }
    return out(true, 'rostered', premium);
  }
  return workPull - homePull > W.volunteerMargin ? out(true, 'volunteered', premium) : out(false, 'not_rostered', premium);
}

function holidayWorkPhrase(plan) {
  return plan ? (OCCASION_TUNING.work.reasonPhrases[plan.reason] || '') : '';
}

// The morning's "who's working" line (D13) for the residents the holiday
// actually moved — null when nobody's shift was in play.
function holidayWorkLine(gs, day, ids) {
  const working = [], off = [];
  for (const id of ids) {
    const npc = gs.npcs[id];
    const plan = holidayWorkPlan(npc, day);
    if (!plan) continue;
    const name = npc.bible?.name || 'A roommate';
    (plan.works ? working : off).push(`${name} ${holidayWorkPhrase(plan)}`);
  }
  if (!working.length && !off.length) return null;
  return `🗓️ ${[...working, ...off].join('; ')}.`;
}

// D15 — mood on the morning of the holiday, by reason and festivity.
function applyHolidayWorkMood(gs, day, ids) {
  const M = OCCASION_TUNING.work.mood;
  for (const id of ids) {
    const npc = gs.npcs[id];
    const plan = holidayWorkPlan(npc, day);
    if (!plan) continue;
    const aff = npcOccasionAffinity(npc, plan.occasionId);
    let d = 0;
    if (!plan.works && aff >= M.festiveCut) d = M.offFestive * aff;
    else if (plan.reason === 'volunteered') d = M.volunteered;
    else if (plan.reason === 'swap_failed') d = M.swapFailed;
    else if (plan.works && aff >= M.festiveCut) d = M.rosteredFestive;
    if (d) gs.npcs[id] = { ...npc, mood: Math.max(-1, Math.min(1, (npc.mood || 0) + d)) };
  }
}

// --- The day rollover (D5) ----------------------------------------------------

function pickOccasionLine(pool, day, salt) {
  if (!Array.isArray(pool) || !pool.length) return '';
  return pool[hashStr(`${salt}|${day}`) % pool.length];
}

// Runs once per calendar day crossed (ui.js's processDayRollover), with the
// NEW day. Returns { lines }: the morning line for every occasion starting
// today, the nightly line for every later night of a run, then the eve line
// for anything starting tomorrow. The one write (Phase 2, D15) is the
// holiday-morning mood nudge, and only when called with live state.
function processOccasionsForDay(gs, day) {
  const out = { lines: [] };
  if (!day) return out;
  for (const o of occasionsOnDay(day)) {
    const lines = o.def.lines || {};
    if (o.night === 1) {
      const l = pickOccasionLine(lines.morning, day, o.id);
      if (l) out.lines.push(l);
    } else {
      const l = pickOccasionLine(lines.night || lines.morning, day, `${o.id}_n`);
      if (l) out.lines.push(l.replace(/\{n\}/g, String(o.night)).replace(/\{total\}/g, String(o.total)));
    }
  }
  // Phase 2 (D13/D15): on a holiday that can move shifts, say who's working
  // it and why, and nudge each moved resident's mood by the reason. Needs
  // the live state; a stateless call (the harness's narration checks) skips it.
  if (gs && gs.npcs && workAffectingOccasion(day)) {
    const ids = Object.keys(gs.npcs).filter(id => gs.npcs[id]?.residency?.status === 'resident').sort();
    const line = holidayWorkLine(gs, day, ids);
    if (line) out.lines.push(line);
    applyHolidayWorkMood(gs, day, ids);
  }
  // Phase 3: decorations — sets come down, a festive roommate puts one up,
  // the house's mood nudges by what's hanging. Live state only.
  if (gs && gs.npcs) {
    const ids = Object.keys(gs.npcs).filter(id => gs.npcs[id]?.residency?.status === 'resident').sort();
    for (const l of processDecorForDay(gs, day, ids)) out.lines.push(l);
  }
  for (const o of occasionsOnDay(day + 1)) {
    if (o.night !== 1) continue;
    const l = pickOccasionLine(o.def.lines?.eve, day, `${o.id}_eve`);
    if (l) out.lines.push(l);
  }
  return out;
}

// ===== /SECTION: OCCASIONS =====
