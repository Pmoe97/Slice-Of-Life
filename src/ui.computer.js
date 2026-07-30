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

// ===== /SECTION: UI.COMPUTER =====
