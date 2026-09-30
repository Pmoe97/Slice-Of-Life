// ===== SECTION: AGENDA =====
// The Agenda (agenda-app-plan.md Phase 1; 0.14.5): the Tracker, the Calendar and the Compass as one
// app, answering "what's on, what needs me, and where am I going" from ONE derivation. This file is
// that derivation. Every entry is derived from game state (BrineOS decision D: no queue, no "seen"
// flags; only dismiss / snooze intents are stored, on world.phone, keyed by an entry's own identity),
// and every date is read from the function that owns it (upcomingCommitments, holidayRows,
// knownBirthdayRows, projectCalendarEvents, weatherConditionOn) — never recomputed here.
//
// agendaEntries(gs) = the Tracker's fifteen adapters, UNCHANGED (tracker.js's buildTrackerEntries, so
// the badge, the notifications, dismiss and snooze keep working byte for byte) plus adapters for the
// things that had a date but no place on the Agenda: the holidays, the birthdays you know, roommates'
// booked shows, and a power-outage watch on rough-weather days. Each entry gains a `lane`
// (money | home | people | occasions | you) and, when it has a time of day, `minutes`. The new
// adapters set `notify: false` and are never in getTrackerNotifications: they inform, they don't nag.
//
// Loads after tracker.js, occasions.js, birthdays.js, projects.js and seasons.js (it only reads them at
// call time, guarded), before the render files that draw it.

const AGENDA_LANES = [
  { id: 'money', label: 'Money', emoji: '💰' },
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'people', label: 'People', emoji: '👥' },
  { id: 'occasions', label: 'Occasions', emoji: '🎉' },
  { id: 'you', label: 'You', emoji: '🧭' },
];

// What each Tracker kind is about. Anything unlisted lands in 'you'.
const AGENDA_KIND_LANE = {
  rent: 'money', bill: 'money', taxes: 'money', gig: 'money', catalog: 'money', platform: 'money',
  delivery: 'home', reno: 'home', service: 'home', facility: 'home',
  im: 'people', tension: 'people', commitment: 'people',
  quest: 'you', course: 'you',
  holiday: 'occasions', birthday: 'occasions', event: 'people', outage: 'home',
};

const AGENDA_TUNING = {
  // How far ahead the timeline reaches for the dated things that are always coming (holidays, birthdays).
  horizonDays: 45,
  // The new adapters never reach a notification: cap their urgency under the notify threshold.
  softCap: 55,
  // Days ahead the outage watch looks, and the weather that raises it.
  outageWatchDays: 2,
  // A condition raises the watch when the grid's own per-day chance for it (OUTAGE_TUNING.chance) is at least this.
  outageMinChance: 0.1,
  outageEmoji: { storm: '⛈️', snow: '🌨️', heat: '🥵', cold_snap: '🥶' },
  outageWords: { storm: 'A storm is forecast', snow: 'Heavy snow is forecast', heat: 'A heatwave is forecast', cold_snap: 'A hard cold snap is forecast' },
};

function agendaLaneOf(entry) {
  return AGENDA_KIND_LANE[entry.kind] || 'you';
}

function agendaSoftUrgency(daysUntil) {
  return Math.min(AGENDA_TUNING.softCap, typeof trackerUrgencyFromDaysUntil === 'function' ? trackerUrgencyFromDaysUntil(daysUntil) : 30);
}

// --- The new adapters -------------------------------------------------------------------------

function agendaHolidayEntries(gs) {
  if (typeof holidayRows !== 'function') return [];
  const today = gs.meta.clock.day;
  const out = [];
  for (const row of holidayRows(gs)) {
    if (row.daysUntil > AGENDA_TUNING.horizonDays) continue;
    const dueDay = today + row.daysUntil;
    out.push({
      key: `holiday:${row.id}:${dueDay}`, kind: 'holiday', lane: 'occasions', notify: false,
      urgency: agendaSoftUrgency(row.daysUntil),
      title: `${row.emoji} ${row.label}`,
      detail: `${row.ongoing ? 'on now' : row.date}${row.total > 1 ? ` · ${row.total} ${row.unit}s` : ''}`,
      dueDay, daysUntil: row.daysUntil,
      deepLink: { appId: 'agenda', screenId: 'year', params: {} },
    });
  }
  return out;
}

function agendaBirthdayEntries(gs) {
  if (typeof knownBirthdayRows !== 'function') return [];
  const today = gs.meta.clock.day;
  const out = [];
  for (const row of knownBirthdayRows(gs)) {
    if (row.daysUntil > AGENDA_TUNING.horizonDays) continue;
    const dueDay = today + row.daysUntil;
    out.push({
      key: `birthday:${row.id}:${dueDay}`, kind: 'birthday', lane: 'occasions', notify: false,
      urgency: agendaSoftUrgency(row.daysUntil),
      title: row.self ? '🎂 Your birthday' : `🎂 ${row.name}'s birthday`,
      detail: `${row.daysUntil === 0 ? 'today' : row.date}${!row.self && row.remembered ? ' · you remembered' : ''}`,
      dueDay, daysUntil: row.daysUntil,
      deepLink: { appId: 'agenda', screenId: 'year', params: {} },
    });
  }
  return out;
}

function agendaEventEntries(gs) {
  if (typeof projectCalendarEvents !== 'function') return [];
  const today = gs.meta.clock.day;
  const out = [];
  for (const e of projectCalendarEvents(gs)) {
    const daysUntil = e.day - today;
    out.push({
      key: `event:${e.id}`, kind: 'event', lane: 'people', notify: false,
      urgency: agendaSoftUrgency(daysUntil),
      title: `${e.emoji} ${e.label}`,
      detail: `${daysUntil === 0 ? 'today' : formatDate(e.day)} (${e.when})`,
      dueDay: e.day, daysUntil,
      deepLink: { appId: 'agenda', screenId: 'coming', params: {} },
    });
  }
  return out;
}

function AGENDA_OUTAGE_CHANCE() {
  return typeof OUTAGE_TUNING === 'object' && OUTAGE_TUNING.chance ? OUTAGE_TUNING.chance : {};
}

// A rough-weather day in the next couple of days: the grid may go down. Advisory: the forecast says
// what the weather will be, not whether the power will fail, so the entry names a risk, never the hour.
function agendaOutageEntries(gs) {
  if (typeof weatherConditionOn !== 'function') return [];
  const today = gs.meta.clock.day;
  const out = [];
  for (let k = 0; k <= AGENDA_TUNING.outageWatchDays; k++) {
    const day = today + k;
    const cond = weatherConditionOn(gs, day);
    if (!(AGENDA_OUTAGE_CHANCE()[cond] >= AGENDA_TUNING.outageMinChance)) continue;
    out.push({
      key: `outage_watch:${day}`, kind: 'outage', lane: 'home', notify: false,
      urgency: agendaSoftUrgency(k),
      title: `${AGENDA_TUNING.outageEmoji[cond] || '⚠️'} Outage watch`,
      detail: `${AGENDA_TUNING.outageWords[cond]}${k === 0 ? ' for today' : k === 1 ? ' for tomorrow' : ` for ${formatDate(day)}`}. The power could go out; it is worth charging the phone.`,
      dueDay: day, daysUntil: k,
      deepLink: { appId: 'agenda', screenId: 'coming', params: {} },
    });
  }
  return out;
}

// --- The one derivation -----------------------------------------------------------------------

// A Tracker entry as the Agenda shows it: its lane, its deep link pointed at the Agenda's own tabs (the
// Calendar the Tracker used to send you to is a tab now), and a commitment's id and time of day.
// Never changes the entry's key, urgency, title, detail or day. Pure.
function agendaDecorate(e, gs) {
  const link = agendaRedirect(e.deepLink.appId, e.deepLink.screenId);
  const entry = { ...e, lane: agendaLaneOf(e), deepLink: { ...e.deepLink, ...link } };
  if (e.kind === 'commitment') {
    const id = e.key.slice('commitment:'.length);
    const c = gs ? (gs.world?.commitments || []).find(x => String(x.id) === id) : null;
    entry.commitmentId = id;
    if (c) entry.minutes = absoluteToClock(c.startAbs).minutes;
  }
  return entry;
}

// Every entry, in one fixed order: the Tracker's, then the new ones. Deterministic. Pure.
function agendaEntries(gs) {
  const base = typeof buildTrackerEntries === 'function' ? buildTrackerEntries(gs) : [];
  const out = [];
  for (const e of base) out.push({ ...agendaDecorate(e, gs), notify: true });
  out.push(...agendaHolidayEntries(gs), ...agendaBirthdayEntries(gs), ...agendaEventEntries(gs), ...agendaOutageEntries(gs));
  return out;
}

// The order the timeline reads in: dated things by day (today first, then time of day), then the ones
// with no date. Ties keep the more urgent first. Pure.
function sortAgendaEntries(a, b) {
  const da = a.daysUntil == null ? 1e9 : a.daysUntil, db = b.daysUntil == null ? 1e9 : b.daysUntil;
  if (da !== db) return da - db;
  const ma = a.minutes == null ? 1e6 : a.minutes, mb = b.minutes == null ? 1e6 : b.minutes;
  if (ma !== mb) return ma - mb;
  return (b.urgency - a.urgency) || (a.key < b.key ? -1 : 1);
}

// Entries by lane (an array of lane ids, or null for all), sorted. Pure.
function agendaList(gs, lanes) {
  const on = lanes && lanes.length ? new Set(lanes) : null;
  return agendaEntries(gs).filter(e => !on || on.has(e.lane)).sort(sortAgendaEntries);
}

// The timeline as groups: [{ label, day, entries }] — "Overdue", "Today", "Tomorrow", a date, then "Anytime".
function agendaGroups(gs, lanes) {
  const today = gs.meta.clock.day;
  const groups = [];
  const push = (key, label, e) => {
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, label, entries: [] }; groups.push(g); }
    g.entries.push(e);
  };
  for (const e of agendaList(gs, lanes)) {
    if (e.daysUntil == null) push('anytime', 'Anytime', e);
    else if (e.daysUntil < 0) push('overdue', 'Overdue', e);
    else if (e.daysUntil === 0) push('d0', 'Today', e);
    else if (e.daysUntil === 1) push('d1', 'Tomorrow', e);
    else push(`d${e.daysUntil}`, formatDate(today + e.daysUntil), e);
  }
  // Overdue first, undated last, the rest already by day.
  const rank = (g) => g.key === 'overdue' ? -1 : g.key === 'anytime' ? 1e9 : Number(g.key.slice(1));
  return groups.sort((a, b) => rank(a) - rank(b));
}

// The dated entries the Year grid marks, by absolute day: { day: [entries] }. Holidays, birthdays and
// roommates' shows are already the grid's own marks, so only the other lanes are added. Pure.
function agendaGridMarks(gs, lanes) {
  const on = lanes && lanes.length ? new Set(lanes) : null;
  const out = {};
  for (const e of agendaEntries(gs)) {
    if (e.dueDay == null || e.kind === 'holiday' || e.kind === 'birthday' || e.kind === 'event') continue;
    if (on && !on.has(e.lane)) continue;
    (out[e.dueDay] || (out[e.dueDay] = [])).push(e);
  }
  return out;
}

// A short label for a lane, its emoji. Pure.
function agendaLaneMeta(id) {
  return AGENDA_LANES.find(l => l.id === id) || AGENDA_LANES[AGENDA_LANES.length - 1];
}

// Old saves and old links: the Tracker, the Calendar and the Compass are tabs of the Agenda now.
// Returns { appId, screenId } for an old (appId, screenId), else the same pair back. Pure.
const AGENDA_REDIRECTS = {
  tracker: { screens: { notifications: 'needs', agenda: 'coming' }, fallback: 'coming' },
  calendar: { screens: { upcoming: 'coming', events: 'coming', holidays: 'coming', birthdays: 'coming', year: 'year' }, fallback: 'coming' },
  compass: { screens: { overview: 'directions' }, fallback: 'directions' },
};

// Is this one of the three the Agenda replaced (the Tracker shell, the Calendar, the Compass)? Pure.
function agendaRetired(appId) {
  return Object.prototype.hasOwnProperty.call(AGENDA_REDIRECTS, appId);
}

function agendaRedirect(appId, screenId) {
  const r = AGENDA_REDIRECTS[appId];
  if (!r) return { appId, screenId };
  return { appId: 'agenda', screenId: r.screens[screenId] || r.fallback };
}
// ===== /SECTION: AGENDA =====
