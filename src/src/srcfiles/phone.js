// ===== SECTION: PHONE (BrineOS Phase 3) =====
// Domain logic for the BrineOS phone shell. The phone's durable state is
// world.phone (Phase 2/3 shape — see world.js's defaultPhoneState); the
// battery lives on the world OBJECT (defs.world.js 'phone', flags.battery)
// and is advanced by world.js's advancePhoneBattery at sim checkpoints.
// Presence is derived from the object's bucket (phonePresence), never
// stored. This file holds the shell's *behaviour*: power on/off, the home
// app roster, nav-stack manipulation, settings — everything a save needs
// to reconstruct what's on screen.
//
// Loads after computer.js so switchScreen's phone device branch (Phase 0.2)
// is already defined — phoneOpenApp funnels through it so an app opened on
// the phone navigates world.phone.navStack and never touches computer
// window state (landmine L1).

// The phone's home grid (Phase 3) is DERIVED since Phase 5 (app parity):
// every APP_DEFS entry whose `devices` list includes 'phone' is a tile,
// plus the Settings and Tracker shell apps. No fixed roster to keep in
// sync with the registry.

// Settings is a phone-only shell screen, deliberately NOT in APP_DEFS —
// adding it there would put it on the computer desktop/taskbar too (both
// iterate APP_DEFS), and the plan (3.7) scopes it to the phone.
const PHONE_SETTINGS_APP_ID = 'settings';

// The Tracker (Phase 4) is the same kind of phone-only shell app, for the
// same reason — it never leaks onto the computer desktop. Unlike Settings
// it has two screens of its own, driven by PHONE_TRACKER_SCREENS (entry
// screen first; the sub-nav renders them as tabs).
const PHONE_TRACKER_APP_ID = 'tracker';
const PHONE_TRACKER_SCREENS = {
  notifications: 'Notifications',
  agenda: 'Agenda',
};

// BrineOS Phase 6: the Clock app — same phone-only shell-app pattern as
// Settings/Tracker (deliberately not in APP_DEFS), one screen, no sub-nav.
// It's a UI on top of the alarm mechanic that already existed
// (player.alarm, doSetAlarm, resolveSleepHoursWithAlarm — all pre-dated
// BrineOS via the free-text "set alarm for 7" intent) — there was never a
// computer-side alarm surface to remove, contrary to the plan's original
// 6.3 premise; see the plan doc's Phase 6 write-up.
const PHONE_CLOCK_APP_ID = 'clock';

// BrineOS Phase 8: the Camera app — same phone-only shell-app pattern.
// Two screens, but NOT a tab pair like the Tracker's — 'detail' is a
// drill-down reached by tapping a thumbnail, not a parallel view, so it's
// deliberately absent from renderPhoneScreenNav's tab bar (that function's
// fallback for an appId with no APP_DEFS entry and no special case is to
// render nothing, which is exactly what a drill-down wants — Back in the
// navbar is the only way out, same as any other phone screen).
const PHONE_CAMERA_APP_ID = 'camera';

// Battery from the object, with the pre-spawn / pre-flag default. null
// when no phone object exists yet (pre-spawn or pre-game) so callers can
// degrade gracefully instead of reading a phantom percentage.
function getPhoneBattery(gameState) {
  const found = findPhoneObject(gameState);
  if (!found) return null;
  const battery = found.obj.flags?.battery;
  return battery == null ? PHONE.startingBattery : battery;
}

// Nearest 5% bucket — the renderer sets data-battery to this and CSS owns
// the width rules (mirrors the .fill[data-fill="N"] pattern; no inline
// styles, §10).
function getPhoneBatteryBucket(battery) {
  return Math.round(Math.max(0, Math.min(100, battery)) / 5) * 5;
}

function isPhoneScreenOn(gameState) {
  return gameState.world?.phone?.power === 'on';
}

// Phase 4 seam: the FAB badge count. Decision C — presence 'elsewhere'
// means nothing gets through (badge stays empty; the phone is unreachable
// anyway). DND silences the badge but never the Agenda (that's a screen,
// not a notification — see render.phone.js). The count itself is pure:
// tracker.js derives the urgent entries and the player's dismiss/snooze
// intents filter them.
function getPhoneUnreadCount(gameState) {
  if (phonePresence(gameState) === 'elsewhere') return 0;
  if (gameState.world.phone?.settings?.dnd) return 0;
  return getTrackerNotifications(gameState).length;
}

function openPhone(gameState) {
  gameState.world.phone.power = 'on';
}

// Closing preserves navStack + openAppId deliberately — reopening returns
// to the app you were in (a physical phone's lock-off/lock-on). Only
// phoneGoHome clears the stack.
function closePhone(gameState) {
  gameState.world.phone.power = 'off';
}

// Open an app on the phone: real apps (those with 'phone' in their
// APP_DEFS devices, Phase 5) navigate via
// switchScreen's phone branch (push to navStack); the special settings and
// tracker shell apps are handled here since they have no APP_DEFS entry.
function phoneOpenApp(gameState, appId) {
  if (appId === PHONE_SETTINGS_APP_ID || appId === PHONE_TRACKER_APP_ID || appId === PHONE_CLOCK_APP_ID || appId === PHONE_CAMERA_APP_ID) {
    const phone = gameState.world.phone;
    phone.openAppId = appId;
    const entryScreen = appId === PHONE_TRACKER_APP_ID ? Object.keys(PHONE_TRACKER_SCREENS)[0]
      : appId === PHONE_CAMERA_APP_ID ? 'gallery' : 'home';
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === appId && top.screenId === entryScreen) {
      top.params = {};
    } else {
      phone.navStack.push({ appId, screenId: entryScreen, params: {} });
    }
    return;
  }
  // Phase 5: the home grid is derived from APP_DEFS.devices, so this is
  // the single source of truth for "is this app hostable on the phone".
  const def = APP_DEFS[appId];
  if (!def || !(def.devices || []).includes('phone')) return;
  switchScreen(gameState, appId, def.entryScreen, undefined, 'phone');
  // Contractor tutorial (contractor doc Phase 3): the first RenoFix open
  // fires the how-to-book hint, phone or computer (idempotent one-shot).
  if (appId === 'upgrades') fireContractorMilestone(gameState, 'renofixOpened');
}

// Phase 4: the Tracker's player intents. Mutate world.phone only — the
// underlying obligation is derived (decision D), so there is nothing else
// to touch. Snooze deletes a stale dismiss (snoozing after dismissing
// re-arms the notification); dismissing after snoozing cancels it.
function phoneTrackerDismiss(gameState, key) {
  const phone = gameState.world.phone;
  phone.dismissed[key] = gameState.meta.clock.day;
  delete phone.snoozed[key];
}

function phoneTrackerSnooze(gameState, key, days) {
  const phone = gameState.world.phone;
  phone.snoozed[key] = gameState.meta.clock.day + days;
  delete phone.dismissed[key];
}

// Back pops the stack; at home (openAppId null) it's a no-op — the navbar
// hides its Back button there rather than closing the phone on an
// accidental tap.
function phoneGoBack(gameState) {
  const phone = gameState.world.phone;
  if (!phone.openAppId) return false;
  phone.navStack.pop();
  const top = phone.navStack[phone.navStack.length - 1];
  phone.openAppId = top ? top.appId : null;
  return true;
}

function phoneGoHome(gameState) {
  const phone = gameState.world.phone;
  phone.navStack = [];
  phone.openAppId = null;
}

function phoneSetDnd(gameState) {
  const phone = gameState.world.phone;
  phone.settings.dnd = !phone.settings.dnd;
  return phone.settings.dnd;
}

// BrineOS Phase 9 (9.1): toggling this doesn't itself lock the phone —
// doPhoneClose reads it and locks on close going forward. Turning it off
// stops future auto-locks but doesn't retroactively unlock a phone that's
// already locked (matches setPhoneLock's "force, don't imply" contract).
function phoneSetPasscode(gameState) {
  const phone = gameState.world.phone;
  phone.settings.passcode = !phone.settings.passcode;
  return phone.settings.passcode;
}

// ===== /SECTION: PHONE =====
