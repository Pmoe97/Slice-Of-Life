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
    document.getElementById('main-content')?.setAttribute('data-mode', 'computer');
    // No time cost and no advanceAndResolve here — opening the computer is
    // a viewpoint change, not an action. Header/sidebars stay visible and
    // the clock keeps ticking on whatever the player does *inside*.
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('computer-open', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doComputerClose() {
  closeComputer(currentGameState);
  document.getElementById('main-content')?.removeAttribute('data-mode');
  render(currentGameState, currentSceneState);
  await saveAtBoundary('computer-close', currentGameState);
}

function doComputerOpenApp(appId) {
  if (!appId) return;
  openApp(currentGameState, appId);
  renderComputerScreen(currentGameState);
}

function doComputerOpenScreen(screenId) {
  if (!screenId) return;
  switchScreen(currentGameState, screenId);
  renderComputerScreen(currentGameState);
}

async function doWorkApply(jobId) {
  if (!jobId) return;
  const result = applyForJob(currentGameState, jobId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `You applied and got the job: ${result.job.title}.`);
  switchScreen(currentGameState, 'dash');
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
  addLogEntry('system', `Order placed on Nile: $${result.total}. Arriving on the doormat tomorrow.`);
  switchScreen(currentGameState, 'browse');
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

    switchScreen(currentGameState, 'site');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('browser-visit', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doClassesEnroll(courseId) {
  if (!courseId) return;
  const result = enrollInCourse(currentGameState, courseId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Enrolled in ${result.course.label} for $${result.course.cost}.`);
  switchScreen(currentGameState, 'enrolled');
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
  switchScreen(currentGameState, 'hired');
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
  switchScreen(currentGameState, 'detail');
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
    switchScreen(currentGameState, 'post');
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
  switchScreen(currentGameState, 'applicants');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classifieds-reject', currentGameState);
}

// ===== /SECTION: UI.COMPUTER =====
