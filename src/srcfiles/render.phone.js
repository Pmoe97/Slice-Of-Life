// ===== SECTION: RENDER.PHONE (BrineOS Phase 3) =====
// State → DOM for the phone shell: the always-on FAB (render.js calls
// this on every full render pass) plus the #phone-screen overlay when the
// phone is open. Idempotent, reads world.phone + the phone OBJECT only,
// toggles classes/data-* only — same hard rule as RENDER.COMPUTER, see
// that file's header (no inline styles, no state mutation, no kv).
//
// Reuses COMPUTER_RENDERERS unchanged for shared apps (Phase 5 formalises
// this; Phase 3 proves it works): an app's screen renderer fills the
// phone's content node exactly as it fills a computer window body. That
// only works because Phase 0.2 made computer.open-screen dispatch on
// data-device — the phone's sub-nav buttons sit inside #phone-screen
// (data-device="phone") and route to world.phone.navStack, never computer
// windows.

// The entry point RENDER (render.js) calls on every render pass, sibling
// to renderComputerScreen. Renders the FAB always (it's the glanceable
// presence/battery surface of the whole phone), and the screen only when
// world.phone.power === 'on'.
function renderPhoneScreen(gs) {
  const fab = document.getElementById('phone-fab');
  if (fab) {
    const presence = phonePresence(gs);
    fab.setAttribute('data-presence', presence);
    if (presence === 'elsewhere') fab.setAttribute('data-away', '');
    else fab.removeAttribute('data-away');

    // Icon + badge injected once (guarded like renderTaskbar's Start
    // button) — index.html's markup can't call svgIcon(), and re-injecting
    // on every render would flicker the inline SVG.
    const icon = fab.querySelector('.phone-fab-icon');
    if (icon && !icon.childElementCount) icon.innerHTML = svgIcon('phone');

    const badge = fab.querySelector('.phone-fab-badge');
    const unread = getPhoneUnreadCount(gs);
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread;
        badge.removeAttribute('hidden');
      } else {
        badge.setAttribute('hidden', '');
      }
    }
  }

  const screen = document.getElementById('phone-screen');
  if (!screen) return;
  if (gs.world.phone?.power !== 'on') {
    screen.removeAttribute('data-open');
    return;
  }
  screen.setAttribute('data-open', '');

  // Navbar icons injected once, same guard as the FAB.
  const navbar = screen.querySelector('.phone-navbar');
  if (navbar && !navbar.childElementCount) {
    const back = navbar.querySelector('[data-action="phone.back"]');
    const home = navbar.querySelector('[data-action="phone.home"]');
    const close = navbar.querySelector('[data-action="phone.close"]');
    if (back) back.innerHTML = svgIcon('back');
    if (home) home.innerHTML = svgIcon('home');
    if (close) close.innerHTML = svgIcon('power');
  }

  renderPhoneStatusbar(gs);
  renderPhoneScreenNav(gs);
  renderPhoneContent(gs);
}

// Status bar: live clock + battery (bucket → data-battery → CSS width, so
// the fill is pre-authored not inline), charging bolt from the derived
// isPhoneCharging (bucket + plugged + power not cut off).
function renderPhoneStatusbar(gs) {
  const clockEl = document.getElementById('phone-clock');
  if (clockEl) clockEl.textContent = formatTime(Math.floor(gs.meta.clock.minutes));

  const screen = document.getElementById('phone-screen');
  const fill = screen?.querySelector('.phone-battery-fill');
  const text = screen?.querySelector('.phone-battery-text');

  const battery = getPhoneBattery(gs);
  if (battery == null) {
    if (fill) fill.removeAttribute('data-battery');
    if (text) text.textContent = '—';
    if (screen) screen.removeAttribute('data-charging');
    return;
  }
  if (fill) fill.setAttribute('data-battery', getPhoneBatteryBucket(battery));
  if (text) text.textContent = `${Math.round(battery)}%`;

  const found = findPhoneObject(gs);
  const charging = isPhoneCharging(gs, found?.obj, found?.bucket);
  if (screen) {
    if (charging) screen.setAttribute('data-charging', '');
    else screen.removeAttribute('data-charging');
  }
}

// Sub-nav row for an open shared app — mirrors renderWindowScreenNav, but
// reads world.phone.navStack for the current screen and relies on
// #phone-screen's data-device="phone" ancestor for dispatch routing. The
// two shell apps render their own sub-nav here: Settings has none, the
// Tracker gets its Notifications/Agenda tabs.
function renderPhoneScreenNav(gs) {
  const nav = document.getElementById('phone-screennav');
  if (!nav) return;
  nav.innerHTML = '';
  const phone = gs.world.phone;
  const appId = phone.openAppId;
  if (!appId || appId === PHONE_SETTINGS_APP_ID) return;

  if (appId === PHONE_TRACKER_APP_ID) {
    const top = phone.navStack[phone.navStack.length - 1];
    for (const [screenId, label] of Object.entries(PHONE_TRACKER_SCREENS)) {
      const btn = document.createElement('button');
      btn.className = 'phone-screennav-btn';
      btn.setAttribute('data-action', 'phone.tracker-screen');
      btn.setAttribute('data-screen', screenId);
      if (top?.screenId === screenId) btn.setAttribute('data-current', '');
      btn.textContent = label;
      nav.appendChild(btn);
    }
    return;
  }

  const app = APP_DEFS[appId];
  if (!app) return;
  const entries = Object.entries(app.screens).filter(([, s]) => !s.hideFromNav);
  if (entries.length < 2) return;
  const top = phone.navStack[phone.navStack.length - 1];
  for (const [screenId, screen] of entries) {
    const btn = document.createElement('button');
    btn.className = 'phone-screennav-btn';
    btn.setAttribute('data-action', 'computer.open-screen');
    btn.setAttribute('data-app', appId);
    btn.setAttribute('data-screen', screenId);
    if (top?.screenId === screenId) btn.setAttribute('data-current', '');
    btn.textContent = screen.label || screenId;
    nav.appendChild(btn);
  }
}

// Content area: home grid when at root, the settings shell screen when
// openAppId is 'settings', the Tracker's screens when 'tracker', or the
// shared app's screen renderer otherwise. Also stamps data-screen-state on
// #phone-screen so CSS can show/hide the navbar's Back button per state.
function renderPhoneContent(gs) {
  const body = document.getElementById('phone-content');
  const screen = document.getElementById('phone-screen');
  if (!body) return;
  const phone = gs.world.phone;
  const openAppId = phone.openAppId;

  if (openAppId === PHONE_SETTINGS_APP_ID) {
    if (screen) screen.setAttribute('data-screen-state', 'settings');
    renderPhoneSettings(body, gs);
    return;
  }
  if (openAppId === PHONE_TRACKER_APP_ID) {
    const top = phone.navStack[phone.navStack.length - 1];
    const screenId = top?.screenId || Object.keys(PHONE_TRACKER_SCREENS)[0];
    if (screen) screen.setAttribute('data-screen-state', 'app');
    renderPhoneTracker(body, gs, screenId);
    return;
  }
  if (openAppId === PHONE_CLOCK_APP_ID) {
    if (screen) screen.setAttribute('data-screen-state', 'app');
    renderPhoneClock(body, gs);
    return;
  }
  if (openAppId === PHONE_CAMERA_APP_ID) {
    if (screen) screen.setAttribute('data-screen-state', 'app');
    const top = phone.navStack[phone.navStack.length - 1];
    if (top?.screenId === 'detail') renderPhoneCameraDetail(body, gs, top.params?.photoId);
    else renderPhoneCameraGallery(body, gs);
    return;
  }
  if (openAppId) {
    const app = APP_DEFS[openAppId];
    if (app) {
      const top = phone.navStack[phone.navStack.length - 1];
      const screenDef = app.screens[top?.screenId || app.entryScreen];
      const renderer = screenDef && COMPUTER_RENDERERS[screenDef.renderer];
      if (renderer) {
        if (screen) screen.setAttribute('data-screen-state', 'app');
        // The shared renderers APPEND (a computer window body is cleared by
        // renderWindows before each pass); #phone-content is a persistent
        // node, so the phone must clear it itself or content accumulates
        // across renders (Phase 4 caught this — bank screen kept piling
        // the agenda on top).
        body.innerHTML = '';
        renderer(body, gs, app, screenDef);
        return;
      }
    }
  }
  if (screen) screen.setAttribute('data-screen-state', 'home');
  renderPhoneHome(body, gs);
}

// Home screen: icon grid of every APP_DEFS app with 'phone' in its
// `devices` list (Phase 5 app parity — the registry is the single source
// of truth), plus the Tracker and Settings tiles. Each tile is a
// data-action="phone.open-app" button carrying data-app — the global
// click dispatcher reads both.
function renderPhoneHome(body, gs) {
  body.innerHTML = '';
  const ids = [
    ...Object.values(APP_DEFS).filter(a => (a.devices || []).includes('phone')).map(a => a.id),
    PHONE_TRACKER_APP_ID,
    PHONE_CLOCK_APP_ID,
    PHONE_CAMERA_APP_ID,
    PHONE_SETTINGS_APP_ID,
  ];
  for (const appId of ids) {
    const app = APP_DEFS[appId];
    const label = appId === PHONE_SETTINGS_APP_ID ? 'Settings'
      : appId === PHONE_TRACKER_APP_ID ? 'Tracker'
      : appId === PHONE_CLOCK_APP_ID ? 'Clock'
      : appId === PHONE_CAMERA_APP_ID ? 'Camera'
      : (app?.label || appId);
    const iconName = appId === PHONE_SETTINGS_APP_ID ? 'settings' : appId;
    const tile = document.createElement('button');
    tile.className = 'phone-app-tile';
    tile.setAttribute('data-action', 'phone.open-app');
    tile.setAttribute('data-app', appId);
    tile.innerHTML = `${svgIcon(iconName)}<span class="phone-app-tile-label">${label}</span>`;
    body.appendChild(tile);
  }
}

// --- Tracker screens (BrineOS Phase 4) ---
// Notifications = urgent + not dismissed/snoozed (plan 4.4), each with
// Dismiss / Snooze 1d / Snooze 3d buttons and a deep-link on the title.
// Agenda = every derived entry, read-only, each row a deep-link to the app
// that owns the obligation. Both are pure state→DOM like everything else
// in this file: no mutation, no kv.
function renderPhoneTracker(body, gs, screenId) {
  if (screenId === 'agenda') renderPhoneAgenda(body, gs);
  else renderPhoneNotifications(body, gs);
}

function renderPhoneNotifications(body, gs) {
  body.innerHTML = '';
  // DND and presence blind the notifications (plan 4.5) — the Agenda below
  // stays full either way (silencing blinds, never shields).
  if (gs.world.phone?.settings?.dnd) {
    body.appendChild(trackerEmptyState('Do Not Disturb is on — notifications are silenced.'));
    return;
  }
  if (phonePresence(gs) === 'elsewhere') {
    body.appendChild(trackerEmptyState('The phone is in another room — nothing has gotten through.'));
    return;
  }
  const entries = getTrackerNotifications(gs);
  if (entries.length === 0) {
    body.appendChild(trackerEmptyState("You're all caught up."));
    return;
  }
  const list = document.createElement('div');
  list.className = 'phone-tracker-list';
  for (const e of entries) {
    const item = document.createElement('div');
    item.className = 'phone-tracker-item';
    if (e.urgency >= 85) item.setAttribute('data-urgent', '');
    item.innerHTML = svgIcon('bell');
    const main = document.createElement('div');
    main.className = 'phone-tracker-main';

    const title = document.createElement('button');
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
    dismiss.className = 'phone-tracker-btn';
    dismiss.setAttribute('data-action', 'phone.tracker-dismiss');
    dismiss.setAttribute('data-key', e.key);
    dismiss.textContent = 'Dismiss';
    actions.appendChild(dismiss);
    for (const days of TRACKER.snoozeOptionsDays) {
      const snooze = document.createElement('button');
      snooze.className = 'phone-tracker-btn';
      snooze.setAttribute('data-action', 'phone.tracker-snooze');
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

function renderPhoneAgenda(body, gs) {
  body.innerHTML = '';
  const entries = buildTrackerEntries(gs).sort(sortTrackerEntries);
  if (entries.length === 0) {
    body.appendChild(trackerEmptyState('Nothing on the agenda.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'phone-tracker-list';
  for (const e of entries) {
    const item = document.createElement('button');
    item.className = 'phone-tracker-item phone-tracker-link';
    item.setAttribute('data-action', 'computer.open-screen');
    item.setAttribute('data-app', e.deepLink.appId);
    item.setAttribute('data-screen', e.deepLink.screenId);
    item.innerHTML = svgIcon(e.deepLink.appId);

    const main = document.createElement('div');
    main.className = 'phone-tracker-main';
    const title = document.createElement('div');
    title.className = 'phone-tracker-title';
    title.textContent = e.title;
    const detail = document.createElement('div');
    detail.className = 'phone-tracker-detail';
    detail.textContent = e.detail;
    main.appendChild(title);
    main.appendChild(detail);

    const due = document.createElement('span');
    due.className = 'phone-tracker-due';
    due.textContent = e.daysUntil == null ? ''
      : e.daysUntil < 0 ? `${-e.daysUntil}d overdue`
      : e.daysUntil === 0 ? 'today'
      : `in ${e.daysUntil}d`;
    item.appendChild(main);
    item.appendChild(due);
    list.appendChild(item);
  }
  body.appendChild(list);
}

function trackerEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'phone-tracker-empty';
  div.textContent = text;
  return div;
}

// Settings: the one DND toggle (plan 3.7). data-on reflects world.phone
// state; CSS styles the toggle so nothing lives in the DOM.
function renderPhoneSettings(body, gs) {
  body.innerHTML = '';
  body.appendChild(phoneSettingRow('Do Not Disturb', 'phone.settings-dnd', !!gs.world.phone.settings.dnd));
  // Phase 9 (9.1): auto-locks the phone on close, which is what actually
  // defeats snooping (trySnoopPhone, drives.js) — this toggle just makes
  // that automatic instead of relying on the player to remember.
  body.appendChild(phoneSettingRow('Passcode', 'phone.settings-passcode', !!gs.world.phone.settings.passcode));
}

function phoneSettingRow(label, action, on) {
  const row = document.createElement('div');
  row.className = 'phone-setting-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'phone-setting-label';
  labelEl.textContent = label;
  const toggle = document.createElement('button');
  toggle.className = 'phone-setting-toggle';
  toggle.setAttribute('data-action', action);
  toggle.setAttribute('data-on', on ? 'on' : 'off');
  toggle.textContent = on ? 'On' : 'Off';
  row.appendChild(labelEl);
  row.appendChild(toggle);
  return row;
}

// --- Clock (BrineOS Phase 6) ---
// A UI for the alarm mechanic that already existed (player.alarm,
// doSetAlarm, resolveSleepHoursWithAlarm) — this screen doesn't own any new
// state, it's a face on player.alarm. Bounds come from SLEEP.alarmMinHour/
// alarmMaxHour (config.js), never hardcoded here (no magic numbers).
function renderPhoneClock(body, gs) {
  body.innerHTML = '';

  const face = document.createElement('div');
  face.className = 'phone-clock-face';
  face.textContent = formatTime(Math.floor(gs.meta.clock.minutes));
  const date = document.createElement('div');
  date.className = 'phone-clock-date';
  date.textContent = formatDate(gs.meta.clock.day);
  body.appendChild(face);
  body.appendChild(date);

  const alarm = gs.player.alarm;
  const status = document.createElement('div');
  status.className = 'phone-clock-alarm-status';
  status.textContent = alarm == null ? 'No alarm set' : `Alarm: ${formatHour12(alarm)}`;
  body.appendChild(status);

  const grid = document.createElement('div');
  grid.className = 'phone-clock-hour-grid';
  for (let h = SLEEP.alarmMinHour; h <= SLEEP.alarmMaxHour; h++) {
    const btn = document.createElement('button');
    btn.className = 'phone-clock-hour-btn';
    btn.setAttribute('data-action', 'phone.set-alarm');
    btn.setAttribute('data-amount', h);
    if (alarm === h) btn.setAttribute('data-current', '');
    btn.textContent = formatHour12(h);
    grid.appendChild(btn);
  }
  body.appendChild(grid);

  const clear = document.createElement('button');
  clear.className = 'phone-clock-clear-btn';
  clear.setAttribute('data-action', 'phone.clear-alarm');
  if (alarm == null) clear.setAttribute('data-current', '');
  clear.textContent = 'No Alarm';
  body.appendChild(clear);

  const hint = document.createElement('div');
  hint.className = 'phone-clock-hint';
  hint.textContent = 'The alarm can only shorten a night, never lengthen one — and it needs a charged phone to go off.';
  body.appendChild(hint);
}

// --- Camera (BrineOS Phase 8) ---
// Gallery = every roll entry (newest first, per takePhoto's unshift),
// thumbnails async-loaded via getPhotoImage (image.js) with a synchronous
// placeholder shown first, mirroring RENDER's renderScene pattern. Unlike
// renderScene's single persistent #scene-img node, this grid is rebuilt
// from scratch on every render pass (same as every other phone screen), so
// there's no stale-node guard to maintain — a resolved promise writing to
// a since-removed <img> is a harmless no-op, not a wrong-image bug.
function renderPhoneCameraGallery(body, gs) {
  body.innerHTML = '';

  const takeBtn = document.createElement('button');
  takeBtn.className = 'phone-camera-take-btn';
  takeBtn.setAttribute('data-action', 'phone.camera-take');
  takeBtn.innerHTML = `${svgIcon('camera')}<span>Take Photo</span>`;
  body.appendChild(takeBtn);

  const roll = gs.world.phone.camera.roll;
  if (roll.length === 0) {
    body.appendChild(trackerEmptyState('No photos yet.'));
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'phone-camera-grid';
  for (const photo of roll) {
    const tile = document.createElement('button');
    tile.className = 'phone-camera-thumb';
    tile.setAttribute('data-action', 'phone.camera-view');
    tile.setAttribute('data-row-id', photo.id);
    const img = document.createElement('img');
    img.src = getPlaceholder();
    img.alt = photo.caption;
    tile.appendChild(img);
    grid.appendChild(tile);
    getPhotoImage(photo).then(result => { if (result.url) img.src = result.url; });
  }
  body.appendChild(grid);
}

function renderPhoneCameraDetail(body, gs, photoId) {
  body.innerHTML = '';
  const photo = gs.world.phone.camera.roll.find(p => p.id === photoId);
  if (!photo) {
    body.appendChild(trackerEmptyState('Photo not found — it may have aged out of the roll.'));
    return;
  }

  const img = document.createElement('img');
  img.className = 'phone-camera-full';
  img.src = getPlaceholder();
  img.alt = photo.caption;
  body.appendChild(img);
  getPhotoImage(photo).then(result => { if (result.url) img.src = result.url; });

  const caption = document.createElement('div');
  caption.className = 'phone-camera-caption';
  caption.textContent = photo.caption;
  body.appendChild(caption);

  // Share row — same resident+prospective contact scope as Messages
  // (render.computer.js's renderMessages), so anyone you could text you
  // can also send a photo to.
  const npcIds = Object.keys(gs.npcs).filter(id => {
    const status = gs.npcs[id].residency?.status;
    return status === 'resident' || status === 'prospective';
  });
  if (npcIds.length > 0) {
    const shareLabel = document.createElement('div');
    shareLabel.className = 'phone-camera-share-label';
    shareLabel.textContent = 'Send to:';
    body.appendChild(shareLabel);
    const shareRow = document.createElement('div');
    shareRow.className = 'phone-camera-share-row';
    for (const npcId of npcIds) {
      const btn = document.createElement('button');
      btn.className = 'phone-camera-share-btn';
      btn.setAttribute('data-action', 'phone.camera-share');
      btn.setAttribute('data-row-id', photo.id);
      btn.setAttribute('data-npc', npcId);
      btn.textContent = gs.npcs[npcId].bible?.name || npcId;
      shareRow.appendChild(btn);
    }
    body.appendChild(shareRow);
  }
}

// ===== /SECTION: RENDER.PHONE =====
