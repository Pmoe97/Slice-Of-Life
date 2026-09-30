// ===== SECTION: RENDER.AGENDA =====
// The Agenda app's tabs (agenda-app-plan.md Phase 2; 0.14.5): "Coming up" (everything dated, grouped by
// day, with a lane toggle) and "Needs you" (the notifications: urgent, not dismissed or snoozed, with
// Dismiss / Snooze). Pure view code over agenda.js and tracker.js: it paints and never writes state.
// The Year and Directions tabs reuse the Calendar's and the Compass's own renderers. Shared by the
// desktop window and the phone (COMPUTER_RENDERERS append into `body`), so it loads AFTER
// render.computer.js, like render.calendar.js.
//
// Which lanes are showing is a view preference, not game state: it lives here for the session.

const AGENDA_VIEW = { lanes: [] };

function agendaEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function agendaDueLabel(e) {
  if (e.daysUntil == null) return '';
  if (e.daysUntil < 0) return `${-e.daysUntil}d overdue`;
  if (e.daysUntil === 0) return e.minutes != null ? formatTime(e.minutes) : 'today';
  return e.minutes != null ? formatTime(e.minutes) : `in ${e.daysUntil}d`;
}

// The lane chips (a toggle each; none on = all). Shared by Coming up and the Year grid.
function buildAgendaLaneBar() {
  const bar = document.createElement('div');
  bar.className = 'agenda-lanes';
  for (const l of AGENDA_LANES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'agenda-lane-chip';
    btn.setAttribute('data-action', 'agenda.lane');
    btn.setAttribute('data-key', l.id);
    btn.setAttribute('data-on', AGENDA_VIEW.lanes.includes(l.id) ? 'on' : 'off');
    btn.innerHTML = `<i class="agenda-lane-swatch" data-lane="${l.id}"></i>${l.emoji} ${l.label}`;
    bar.appendChild(btn);
  }
  return bar;
}

function buildAgendaRow(e) {
  const row = document.createElement('div');
  row.className = 'agenda-row';
  row.setAttribute('data-lane', e.lane);
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'agenda-link';
  link.setAttribute('data-action', 'computer.open-screen');
  link.setAttribute('data-app', e.deepLink.appId);
  link.setAttribute('data-screen', e.deepLink.screenId);
  const meta = agendaLaneMeta(e.lane);
  link.innerHTML = `<span class="agenda-lane-dot" title="${agendaEsc(meta.label)}">${meta.emoji}</span>`
    + `<span class="agenda-main"><span class="agenda-title">${agendaEsc(e.title)}</span><span class="agenda-detail">${agendaEsc(e.detail)}</span></span>`
    + `<span class="agenda-due">${agendaEsc(agendaDueLabel(e))}</span>`;
  row.appendChild(link);
  if (e.commitmentId) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'agenda-clear';
    clear.setAttribute('data-action', 'calendar.cancel');
    clear.setAttribute('data-row-id', e.commitmentId);
    clear.textContent = 'Clear';
    row.appendChild(clear);
  }
  return row;
}

// COMPUTER_RENDERERS['agenda-coming'] — everything dated, day by day.
function renderAgendaComing(body, gs, app, screen) {
  body.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'agenda-header';
  header.innerHTML = '<h3>Coming up</h3><p class="dim tiny">What is on, and what is due, day by day.</p>';
  body.appendChild(header);
  body.appendChild(buildAgendaLaneBar());
  const groups = agendaGroups(gs, AGENDA_VIEW.lanes);
  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'phone-tracker-empty';
    empty.textContent = AGENDA_VIEW.lanes.length ? 'Nothing in these lanes.' : 'Nothing on the agenda.';
    body.appendChild(empty);
    return;
  }
  for (const g of groups) {
    const sec = document.createElement('section');
    sec.className = 'agenda-group';
    if (g.key === 'overdue') sec.setAttribute('data-overdue', '');
    const h = document.createElement('div');
    h.className = 'agenda-group-title';
    h.textContent = g.label;
    sec.appendChild(h);
    for (const e of g.entries) sec.appendChild(buildAgendaRow(e));
    body.appendChild(sec);
  }
}

// COMPUTER_RENDERERS['agenda-needs'] — the notifications, with Dismiss and Snooze.
function renderAgendaNeeds(body, gs, app, screen) {
  body.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'agenda-header';
  header.innerHTML = '<h3>Needs you</h3><p class="dim tiny">The things that are close or overdue. Dismiss one and it stays gone; snooze it and it comes back.</p>';
  body.appendChild(header);
  const empty = (text) => { const d = document.createElement('div'); d.className = 'phone-tracker-empty'; d.textContent = text; body.appendChild(d); };
  // DND and presence blind the notifications (BrineOS 4.5); Coming up stays full either way.
  if (gs.world.phone?.settings?.dnd) return empty('Do Not Disturb is on — notifications are silenced.');
  if (typeof phonePresence === 'function' && phonePresence(gs) === 'elsewhere') return empty('The phone is in another room — nothing has gotten through.');
  const entries = getTrackerNotifications(gs).map(e => agendaDecorate(e, gs));
  if (entries.length === 0) return empty("You're all caught up.");
  const list = document.createElement('div');
  list.className = 'phone-tracker-list';
  for (const e of entries) {
    const item = document.createElement('div');
    item.className = 'phone-tracker-item';
    if (e.urgency >= 85) item.setAttribute('data-urgent', '');
    item.innerHTML = svgIcon('bell');
    const main = document.createElement('div');
    main.className = 'phone-tracker-main';
    const appLabel = document.createElement('div');
    appLabel.className = 'phone-tracker-app';
    appLabel.textContent = APP_DEFS[e.deepLink.appId]?.label || e.deepLink.appId;
    main.appendChild(appLabel);
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'phone-tracker-title phone-tracker-link';
    title.setAttribute('data-action', 'computer.open-screen');
    title.setAttribute('data-app', e.deepLink.appId);
    title.setAttribute('data-screen', e.deepLink.screenId);
    title.textContent = e.title;
    const detail = document.createElement('div');
    detail.className = 'phone-tracker-detail';
    detail.textContent = e.detail;
    const actions = document.createElement('div');
    actions.className = 'phone-tracker-actions';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'phone-tracker-btn';
    dismiss.setAttribute('data-action', 'agenda.dismiss');
    dismiss.setAttribute('data-key', e.key);
    dismiss.textContent = 'Dismiss';
    actions.appendChild(dismiss);
    for (const days of TRACKER.snoozeOptionsDays) {
      const snooze = document.createElement('button');
      snooze.type = 'button';
      snooze.className = 'phone-tracker-btn';
      snooze.setAttribute('data-action', 'agenda.snooze');
      snooze.setAttribute('data-key', e.key);
      snooze.setAttribute('data-days', days);
      snooze.textContent = `Snooze ${days}d`;
      actions.appendChild(snooze);
    }
    main.appendChild(title);
    main.appendChild(detail);
    main.appendChild(actions);
    item.appendChild(main);
    list.appendChild(item);
  }
  body.appendChild(list);
}

Object.assign(COMPUTER_RENDERERS, {
  'agenda-coming': renderAgendaComing,
  'agenda-needs': renderAgendaNeeds,
});

// ===== /SECTION: RENDER.AGENDA =====
