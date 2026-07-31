// ===== SECTION: UI.COMPUTER =====
// Event-driven orchestration for the computer screen, mirroring UI's own
// doX() convention (loading state, render, save-at-boundary). Dispatched
// from UI's handleAction switch — see the 'computer.*'/'work.*' cases
// there. No logic inside the click handler itself; it reads intent and
// calls one of these.

async function doComputerOpen() {
  showLoading();
  try {
    currentGameState.world.computer.power = 'on';
    // Set on #app, not #main-content — a full takeover of the whole
    // viewport (header/both sidebars/footer hidden, #app's grid collapses
    // to just "main"; see main.html's #app[data-mode="computer"] rules),
    // not a panel swap within the normal layout. No time cost and no
    // advanceAndResolve here — opening the computer is a viewpoint
    // change, not an action; the sim keeps ticking underneath regardless
    // of what's drawn on screen.
    document.getElementById('app')?.setAttribute('data-mode', 'computer');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('computer-open', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doComputerClose() {
  closeComputer(currentGameState);
  document.getElementById('app')?.removeAttribute('data-mode');
  render(currentGameState, currentSceneState);
  await saveAtBoundary('computer-close', currentGameState);
}

function doComputerOpenApp(appId) {
  if (!appId) return;
  openApp(currentGameState, appId);
  document.getElementById('start-menu')?.setAttribute('hidden', ''); // opening an app always closes Start, desktop icon or menu either way
  renderComputerScreen(currentGameState);
}

function doComputerOpenScreen(appId, screenId) {
  if (!appId || !screenId) return;
  switchScreen(currentGameState, appId, screenId);
  renderComputerScreen(currentGameState);
}

function doComputerWindowClose(appId) {
  if (!appId) return;
  closeWindow(currentGameState, appId);
  renderComputerScreen(currentGameState);
}

function doComputerWindowMinimize(appId) {
  if (!appId) return;
  minimizeWindow(currentGameState, appId);
  renderComputerScreen(currentGameState);
}

function doComputerWindowMaximize(appId) {
  if (!appId) return;
  toggleMaximizeWindow(currentGameState, appId);
  renderComputerScreen(currentGameState);
}

// Windows taskbar semantics: not open yet → open+focus; open, focused,
// and visible → minimize (a second click on the same running app tucks
// it away); minimized or unfocused → bring to front. Desktop icons/Start
// deliberately use the simpler always-open-or-focus doComputerOpenApp
// instead — a launcher icon isn't a toggle the way a running app's own
// taskbar button is.
function doComputerTaskbarClick(appId) {
  if (!appId) return;
  const win = currentGameState.world.computer.windows[appId];
  if (!win) {
    openApp(currentGameState, appId);
  } else if (currentGameState.world.computer.focusedAppId === appId && !win.minimized) {
    minimizeWindow(currentGameState, appId);
  } else {
    focusWindow(currentGameState, appId);
  }
  renderComputerScreen(currentGameState);
}

// DOM-only open/closed toggle, same precedent as the modal overlay's
// open/closed state — which menus happen to be open isn't game data.
function doComputerToggleStart() {
  const menu = document.getElementById('start-menu');
  if (!menu) return;
  if (menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
  else menu.setAttribute('hidden', '');
}

async function doWorkApply(jobId) {
  if (!jobId) return;
  const result = applyForJob(currentGameState, jobId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `You applied and got the job: ${result.job.title}.`);
  switchScreen(currentGameState, 'work', 'dash');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('work-apply', currentGameState);
}

async function doWorkBlock() {
  showLoading();
  try {
    const result = workOneBlock(currentGameState);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    addLogEntry('narration', `You knock out a block of work. +$${result.earned}.`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('work-block', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doShopAddToCart(defId) {
  if (!defId) return;
  const result = addToCart(currentGameState, defId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  await saveAtBoundary('shop-add', currentGameState);
}

async function doShopRemoveFromCart(defId) {
  if (!defId) return;
  removeFromCart(currentGameState, defId);
  renderComputerScreen(currentGameState);
  await saveAtBoundary('shop-remove', currentGameState);
}

async function doShopCheckout() {
  const result = checkoutCart(currentGameState);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Order placed on Nile: ${result.total}. Arriving on the doormat tomorrow.`);
  // Chain quest progress: buying from Nile
  for (const npcId of Object.keys(currentGameState.npcs)) {
    checkChainQuestProgress('buy', npcId);
  }
  switchScreen(currentGameState, 'shop', 'browse');
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('shop-checkout', currentGameState);
}

async function doBrowserVisit(siteId) {
  if (!siteId) return;
  showLoading();
  try {
    const result = visitSite(currentGameState, siteId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }

    if (result.site.effects) {
      const effects = result.site.effects.map(line => parseEffectDSL(line)[0]).filter(Boolean);
      const roomObjects = currentGameState.objects[`room_${currentGameState.player.location}`] || {};
      const effCtx = buildEffectContext(currentGameState, [], [], roomObjects, currentGameState.player.inventory || []);
      applyEffects(effects, effCtx);
    }
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);

    switchScreen(currentGameState, 'browser', 'site');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('browser-visit', currentGameState);
  } finally {
    hideLoading();
  }
}

// Free navigation, unlike doBrowserVisit — no loading spinner, no time
// cost, no re-applied site effects, since COMPUTER's browserGoBack/
// Forward just move the historyIndex pointer over pages already visited.
function doBrowserBack() {
  const result = browserGoBack(currentGameState);
  if (!result.ok) return;
  switchScreen(currentGameState, 'browser', 'site');
  renderComputerScreen(currentGameState);
}

function doBrowserForward() {
  const result = browserGoForward(currentGameState);
  if (!result.ok) return;
  switchScreen(currentGameState, 'browser', 'site');
  renderComputerScreen(currentGameState);
}

// AfterHours category tab switch — just updates the filter, no time cost
function doAfterHoursCategory(catId) {
  const browser = currentGameState.world.computer.apps.browser;
  browser.afterHoursCategory = catId;
  browser.afterHoursWatching = null;
  browser.afterHoursImgUrl = null;
  browser.afterHoursImgLoading = false;
  renderComputerScreen(currentGameState);
}

// AfterHours content watch — applies watch effects, then triggers image
// generation itself (see generateAfterHoursImageOnce below). Deliberately
// NOT triggered from inside renderAfterHours (RENDER.COMPUTER) any more —
// render() gets called twice per action across this whole file (a
// pre-existing, harmless-everywhere-else convention), and a render-
// triggered async side effect fired twice in the same tick, each call
// racing to write into a DOM node the OTHER call's re-render had already
// torn down. Neither image ever reliably showed. Moving the trigger here
// makes it fire exactly once per watch, regardless of how many times the
// screen gets re-rendered afterward.
async function doAfterHoursWatch(entryId) {
  if (!entryId) return;
  const site = SITE_DEFS['afterhours'];
  if (!site?.adultContent) return;
  const entry = site.adultContent.entries.find(e => e.id === entryId);
  if (!entry) return;

  showLoading();
  try {
    const browser = currentGameState.world.computer.apps.browser;
    browser.afterHoursWatching = entryId;
    browser.afterHoursImgUrl = null;
    browser.afterHoursImgLoading = false;

    // Apply watch effects
    if (site.watchEffects) {
      const effects = site.watchEffects.map(line => parseEffectDSL(line)[0]).filter(Boolean);
      const roomObjects = currentGameState.objects[`room_${currentGameState.player.location}`] || {};
      const effCtx = buildEffectContext(currentGameState, [], [], roomObjects, currentGameState.player.inventory || []);
      applyEffects(effects, effCtx);
    }

    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);

    addLogEntry('narration', `You browse AfterHours: "${entry.title}".`);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('ah-watch', currentGameState);
  } finally {
    hideLoading();
  }

  // Runs after the loading overlay clears — real image-gen latency
  // shouldn't block the quick synchronous state update above.
  await generateAfterHoursImageOnce(entryId);
}

// The one place that calls root.generateImage for AfterHours. Guards
// against the entry having changed (category switch, another watch click)
// while the request was in flight — a stale response is discarded rather
// than overwriting whatever the player is now looking at.
async function generateAfterHoursImageOnce(entryId) {
  const browser = currentGameState.world.computer.apps.browser;
  if (browser.afterHoursWatching !== entryId || browser.afterHoursImgLoading) return;
  const site = SITE_DEFS['afterhours'];
  const entry = site?.adultContent?.entries.find(e => e.id === entryId);
  if (!entry) return;

  browser.afterHoursImgLoading = true;
  renderComputerScreen(currentGameState);
  try {
    const prompt = `Cinematic still from an adult drama film: "${entry.title}". ${entry.desc}. Soft lighting, intimate atmosphere, tasteful and sensual, film grain, shallow depth of field.`;
    const result = await root.generateImage(prompt, { resolution: '512x768' });
    if (browser.afterHoursWatching !== entryId) return; // player moved on — discard
    browser.afterHoursImgUrl = result.dataUrl;
  } catch (e) {
    // Leave afterHoursImgUrl null — renderAfterHours shows "unavailable".
  } finally {
    if (browser.afterHoursWatching === entryId) {
      browser.afterHoursImgLoading = false;
      renderComputerScreen(currentGameState);
    }
  }
}

async function doClassesEnroll(courseId) {
  if (!courseId) return;
  const result = enrollInCourse(currentGameState, courseId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Enrolled in ${result.course.label} for $${result.course.cost}.`);
  switchScreen(currentGameState, 'classes', 'enrolled');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classes-enroll', currentGameState);
}

async function doAttendLesson(courseId) {
  if (!courseId) return;
  showLoading();
  try {
    const result = attendLesson(currentGameState, courseId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    await advanceAndResolve(result.ticks);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, result.ticks);
    if (result.completed) addLogEntry('narration', `You finish ${result.course.label}. Certificate unlocked, for whatever that's worth.`);
    else addLogEntry('narration', `You attend a lesson in ${result.course.label}. +${result.xpGain} ${result.course.skillId} XP.`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('classes-lesson', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doServicesHire(serviceId) {
  if (!serviceId) return;
  const result = hireService(currentGameState, serviceId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Hired ${result.service.label}. First visit in ${result.service.cadenceDays} days.`);
  switchScreen(currentGameState, 'services', 'hired');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('services-hire', currentGameState);
}

async function doServicesCancel(serviceId) {
  if (!serviceId) return;
  const result = cancelService(currentGameState, serviceId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  await saveAtBoundary('services-cancel', currentGameState);
}

async function doClassifiedsPost() {
  const result = postRoommateAd(currentGameState);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', 'You post a roommate-wanted ad on RoomList.');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classifieds-post', currentGameState);
}

function doClassifiedsViewApplicant(npcId) {
  if (!npcId) return;
  currentGameState.world.computer.apps.classifieds.viewingApplicantId = npcId;
  switchScreen(currentGameState, 'classifieds', 'detail');
  renderComputerScreen(currentGameState);
}

async function doClassifiedsAccept(npcId) {
  if (!npcId) return;
  showLoading();
  try {
    const result = acceptApplicant(currentGameState, npcId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    addLogEntry('narration', `${result.npc.bible.name} moves in. Rent shifts to reflect the new headcount.`);
    // getSceneParticipants recomputes off npc.location, which moveToRoom
    // already set — the new resident can show up in the room list/scene
    // immediately without a separate sync step.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    switchScreen(currentGameState, 'classifieds', 'post');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('classifieds-accept', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doClassifiedsReject(npcId) {
  if (!npcId) return;
  const result = rejectApplicant(currentGameState, npcId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  switchScreen(currentGameState, 'classifieds', 'applicants');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classifieds-reject', currentGameState);
}

function doImOpenThread(npcId) {
  if (!npcId) return;
  currentGameState.world.computer.apps.im.viewingNpcId = npcId;
  const thread = currentGameState.world.computer.apps.im.threads[npcId];
  if (thread) thread.unread = 0;
  // No switchScreen — Messages is a single always-both-panes screen now
  // (renderMessages, RENDER.COMPUTER); selecting a thread just changes
  // which conversation shows in the right-hand pane.
  renderComputerScreen(currentGameState);
}

async function doImSend(npcId) {
  const input = document.getElementById('cs-chat-input');
  const text = input?.value.trim();
  if (!text || !npcId) return;
  showLoading();
  try {
    const result = await sendImMessage(currentGameState, npcId, text);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    await syncNpcsFromKv(result.updatedNpcIds);
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, 1);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('im-send', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doStreamWatch(showId) {
  if (!showId) return;
  showLoading();
  try {
    const result = watchEpisode(currentGameState, showId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }

    const roomObjects = currentGameState.objects[`room_${currentGameState.player.location}`] || {};
    const effCtx = buildEffectContext(currentGameState, [], [], roomObjects, currentGameState.player.inventory || []);
    applyEffects([{ type: 'ADJUST_NEED', params: { who: 'player', need: 'mood', delta: String(result.show.moodGain) } }], effCtx);

    await advanceAndResolve(result.show.episodeTicks);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, result.show.episodeTicks);
    addLogEntry('narration', `You watch episode ${result.episode} of ${result.show.label}.`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('stream-watch', currentGameState);
  } finally {
    hideLoading();
  }
}

// ===== /SECTION: UI.COMPUTER =====
