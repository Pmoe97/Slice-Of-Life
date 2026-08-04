// ===== SECTION: UI.PHONE (BrineOS Phase 3) =====
// Event-driven orchestration for the phone shell, mirroring UI.COMPUTER's
// doX() convention (guard → mutate → render → save-at-boundary).
// Dispatched from UI's handleAction switch — see the 'phone.*' cases
// there. No logic inside click handlers; they read intent and call these.
//
// Every action here is exempt from the energy gate via ui.js's
// `action.startsWith('phone.')` clause — opening/closing/navigating the
// phone is as trivial as looking around, and Phase 3's phone must be
// glanceable even exhausted (same rationale as computer.use).

async function doPhoneOpen() {
  const presence = phonePresence(currentGameState);
  if (presence === 'elsewhere') {
    addLogEntry('system', 'Your phone is in another room — go get it first.');
    return;
  }
  // Battery-death gate (Phase 3 reading of decision F): a phone drained to
  // 0% won't turn on. Charging at 0% is fine (it's booting off the cord —
  // charge only moves at checkpoints, so refusing outright would lock the
  // phone out until an arbitrary future tick).
  const battery = getPhoneBattery(currentGameState);
  const found = findPhoneObject(currentGameState);
  const charging = isPhoneCharging(currentGameState, found?.obj, found?.bucket);
  if (battery != null && battery <= 0 && !charging) {
    addLogEntry('system', 'Your phone is dead. Plug it in somewhere with power to charge.');
    return;
  }
  openPhone(currentGameState);
  // Phase 9: it's your own phone — you always get back in, regardless of
  // whether it auto-locked on the last close.
  setPhoneLock(currentGameState, false);
  renderPhoneScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('phone-open', currentGameState);
}

async function doPhoneClose() {
  closePhone(currentGameState);
  // Phase 9: auto-lock on close only if the passcode setting is on — the
  // mechanism that gives the setting real teeth without a PIN-entry UI.
  if (currentGameState.world.phone.settings.passcode) {
    setPhoneLock(currentGameState, true);
  }
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-close', currentGameState);
}

async function doPhoneOpenApp(appId) {
  if (!appId) return;
  phoneOpenApp(currentGameState, appId);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-open-app', currentGameState);
}

async function doPhoneGoBack() {
  if (!phoneGoBack(currentGameState)) return; // already home — no-op
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-back', currentGameState);
}

async function doPhoneGoHome() {
  phoneGoHome(currentGameState);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-home', currentGameState);
}

async function doPhoneSettingsDnd() {
  phoneSetDnd(currentGameState);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-dnd', currentGameState);
}

async function doPhoneSettingsPasscode() {
  phoneSetPasscode(currentGameState);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-passcode', currentGameState);
}

// --- Tracker (BrineOS Phase 4) ---
async function doPhoneTrackerScreen(screenId) {
  const phone = currentGameState.world.phone;
  const top = phone.navStack[phone.navStack.length - 1];
  if (!top || top.appId !== PHONE_TRACKER_APP_ID) return;
  top.screenId = screenId;
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-tracker-screen', currentGameState);
}

async function doPhoneTrackerDismiss(key) {
  if (!key) return;
  phoneTrackerDismiss(currentGameState, key);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-tracker-dismiss', currentGameState);
}

async function doPhoneTrackerSnooze(key, days) {
  if (!key || !days) return;
  phoneTrackerSnooze(currentGameState, key, days);
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-tracker-snooze', currentGameState);
}

// --- Camera (BrineOS Phase 8) ---

// Free — no time/energy cost, matching "the phone is glanceable even
// exhausted" (same rationale as opening any other app). Sharing (below)
// costs a tick because it's fundamentally the same act as texting.
async function doPhoneTakePhoto() {
  takePhoto(currentGameState);
  addLogEntry('system', 'Photo saved.');
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-camera-take', currentGameState);
}

// Navigation is a direct navStack push, same directness as
// doPhoneTrackerScreen above — a dedicated phone.js wrapper would be a
// single-caller indirection for a two-line mutation.
async function doPhoneCameraView(photoId) {
  if (!photoId) return;
  const phone = currentGameState.world.phone;
  if (phone.openAppId !== PHONE_CAMERA_APP_ID) return;
  phone.navStack.push({ appId: PHONE_CAMERA_APP_ID, screenId: 'detail', params: { photoId } });
  renderPhoneScreen(currentGameState);
  await saveAtBoundary('phone-camera-view', currentGameState);
}

// Mirrors doImSend's shape (ui.computer.js): sync append + immediate
// re-render so the player's bubble paints instantly, then the async LLM
// reply, then the same tick-advance/decay/save doImSend does — sharing a
// photo is the same act as sending a text, just with an attachment.
// Reuses imSending (ui.computer.js) rather than a second guard variable,
// since both mutate the same thread and should never overlap.
async function doPhoneCameraShare(photoId, npcId) {
  if (!photoId || !npcId || imSending) return;
  imSending = true;
  try {
    const shared = sharePhotoToImThread(currentGameState, npcId, photoId);
    if (!shared.ok) { addLogEntry('system', shared.reason); return; }
    renderPhoneScreen(currentGameState);
    const result = await resolveImReply(currentGameState, npcId, shared.text);
    if (!result.ok) addLogEntry('system', result.reason);
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    addLogEntry('system', `Photo sent to ${currentGameState.npcs[npcId]?.bible?.name || 'them'}.`);
    renderPhoneScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('phone-camera-share', currentGameState);
  } finally {
    imSending = false;
  }
}

// ===== /SECTION: UI.PHONE =====
