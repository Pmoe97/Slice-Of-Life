// ===== SECTION: UI.COMPUTER =====
// Event-driven orchestration for the computer screen, mirroring UI's own
// doX() convention (loading state, render, save-at-boundary). Dispatched
// from UI's handleAction switch — see the 'computer.*'/'work.*' cases
// there. No logic inside the click handler itself; it reads intent and
// calls one of these.

async function doComputerOpen() {
  // Phase 3: power cutoff means the computer is dead. The player can still
  // walk away and do other things, but the monitor won't turn on.
  if (isCutoffActive(currentGameState, 'power')) {
    addLogEntry('system', 'The computer won\'t turn on — power is shut off. Pay the electric bill.');
    return;
  }
  showLoading();
  try {
    currentGameState.world.computer.power = 'on';
    document.getElementById('app')?.setAttribute('data-mode', 'computer');
    pushTimeContext('browsing');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('computer-open', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doComputerClose() {
  // closeComputer also ends any in-progress masturbating session; drop the
  // pre-generated interruption line that session was holding, so it can't
  // be spent on a later, unrelated one.
  closeComputer(currentGameState);
  pendingInterruption = null;
  document.getElementById('app')?.removeAttribute('data-mode');
  // Closing the computer pops the 'browsing' frame doComputerOpen pushed;
  // if a masturbating session was on top (closed without stopping), it
  // pops too — closeComputer powers the machine off, so
  // isAfterHoursSessionActive reads false and the reconciled base says
  // idle anyway (Phase 5.5).
  popTimeContext();
  render(currentGameState, currentSceneState);
  await saveAtBoundary('computer-close', currentGameState);
}

function doComputerOpenApp(appId) {
  if (!appId) return;
  openApp(currentGameState, appId);
  document.getElementById('start-menu')?.setAttribute('hidden', ''); // opening an app always closes Start, desktop icon or menu either way
  renderComputerScreen(currentGameState);
}

function doComputerOpenScreen(appId, screenId, device) {
  if (!appId || !screenId) return;
  // Device-parameterised nav (BrineOS 0.2): the phone shell emits
  // data-device="phone" and navigates the phone's own navStack, never
  // mutating computer window state. The computer shell defaults to
  // 'computer' (or carries data-device="computer" explicitly).
  if (device === 'phone') {
    switchScreen(currentGameState, appId, screenId, undefined, 'phone');
    if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
    return;
  }
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

async function doGigAccept(gigId) {
  if (!gigId) return;
  const result = acceptGig(currentGameState, gigId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `You accepted a gig: ${result.gig.label} for ${result.gig.client} (${result.gig.payout}, due day ${result.gig.deadlineDay}).`);
  renderComputerScreen(currentGameState);
  await saveAtBoundary('gig-accept', currentGameState);
}

async function doGigWorkBlock(gigId, device) {
  if (!gigId) return;
  // Phase 5: device-aware connectivity gating (decision F). The computer
  // dies to a power cutoff and needs wifi (internet); the phone rides
  // cellular, so it needs BOTH wifi and the phone bill down before the
  // work app is blocked.
  const blocked = appBlockedReason(currentGameState, 'work', device);
  if (blocked) {
    addLogEntry('system', `You can't work — ${blocked.toLowerCase()}. Pay the bill.`);
    return;
  }
  showLoading();
  try {
    const result = workGigBlock(currentGameState, gigId, device);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    pushTimeContext('working');
    // One block of gig work is a flat GIG_TUNING.workBlockMinutes time-cost,
    // not a tick-grid quantity — see the D5 note on that constant.
    await advanceAndResolveMinutes(GIG_TUNING.workBlockMinutes);
    popTimeContext();
    const pct = Math.round((result.gig.blocksDone / result.gig.blocks) * 100);
    addLogEntry('narration', `You work on "${result.gig.label}". Progress: ${pct}% (${result.gig.blocksDone.toFixed(2)}/${result.gig.blocks} blocks).`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('gig-work', currentGameState);
  } finally {
    hideLoading();
  }
}

async function doGigDeliver(gigId) {
  if (!gigId) return;
  const result = deliverGig(currentGameState, gigId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Delivered "${result.gig.label}"${result.late ? ' (late)' : ''}. +${result.payout}. Reputation ${result.repDelta >= 0 ? '+' : ''}${result.repDelta}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('gig-deliver', currentGameState);
}

async function doGigAbandon(gigId) {
  if (!gigId) return;
  const result = abandonGig(currentGameState, gigId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `You abandoned "${result.gig.label}". Reputation ${result.repDelta}.`);
  renderComputerScreen(currentGameState);
  await saveAtBoundary('gig-abandon', currentGameState);
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

// --- Home app (decor-economy plan Phase 1) ---
// The same three handlers as Nile, pointed at the Home catalog and cart —
// addToCart/removeFromCart/checkoutCart are the shared functions, and only
// the catalog + cartPath differ. No chain-quest hook: a decor purchase is
// not "buying from Nile."

async function doHomeAddToCart(defId) {
  if (!defId) return;
  const result = addToCart(currentGameState, defId, { catalog: DECOR_CATALOG_DEFS, cartPath: 'apps.home.cart' });
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  await saveAtBoundary('home-add', currentGameState);
}

async function doHomeRemoveFromCart(defId) {
  if (!defId) return;
  removeFromCart(currentGameState, defId, { cartPath: 'apps.home.cart' });
  renderComputerScreen(currentGameState);
  await saveAtBoundary('home-remove', currentGameState);
}

async function doHomeCheckout() {
  const result = checkoutCart(currentGameState, { cartPath: 'apps.home.cart', catalog: DECOR_CATALOG_DEFS });
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Order placed on Home: ${result.total}. Arriving on the doormat tomorrow.`);
  switchScreen(currentGameState, 'home', 'browse');
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('home-checkout', currentGameState);
}

// --- Home placement screen (decor-economy plan Phase 2) ---
// Transient interaction state for the `home-placement` screen: which room is
// being edited, what's selected, an in-progress placement draft, and the
// live drag gesture. Deliberately NOT gameState — a half-done drag or a
// picked-from-palette draft is interaction state, the same call as
// dragGesture in UI.WINDOWMANAGER. RENDER.COMPUTER's renderHomePlacement
// reads it (typeof-guarded) and gestures below mutate it; the drag itself
// writes positions straight into gameState as it goes, so a background
// render mid-drag (a sim checkpoint) rebuilds the canvas at exactly where
// the piece already is rather than fighting the gesture.
let homePlacementUI = null;

function ensureHomePlacementUI(gs) {
  if (!homePlacementUI) {
    homePlacementUI = { roomId: gs.player.location, selectedId: null, draft: null, snap: true, drag: null };
  }
  return homePlacementUI;
}

// One SVG client-coordinate → room-units conversion, shared by every
// gesture so move/resize/rotate agree about where the cursor is. Mirrors
// dev/designer.html's pt().
function homePlacementSvgPoint(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}

const homePlacementSnap = (v, snap) => (snap ? Math.round(v / 5) * 5 : Math.round(v));

// Rebuilds only the canvas inside the current placement screen body — the
// cheap mid-gesture redraw. The full screen rebuild is render()'s job.
function redrawHomePlacementCanvas(bodyNode, gs, hp) {
  const svg = bodyNode?.querySelector('.hp-canvas');
  if (!svg) return;
  buildHomePlacementCanvas(svg, gs, hp, hp.roomId);
}

function homePlacementTargetPos(hp, key) {
  if (key === 'draft') return hp.draft ? hp.draft.pos : null;
  return findObjectById(currentGameState, key)?.pos || null;
}

function homePlacementStartDrag(ev, key, mode, corner) {
  ev.preventDefault();
  ev.stopPropagation();
  const hp = ensureHomePlacementUI(currentGameState);
  const isDraft = key === 'draft';
  hp.selectedId = isDraft ? null : key;
  const pos = homePlacementTargetPos(hp, key);
  if (!pos) return;
  const bodyNode = ev.target.closest('.win-body') || document.getElementById('phone-content');
  const svg = bodyNode?.querySelector('.hp-canvas');
  const [mx, my] = svg ? homePlacementSvgPoint(svg, ev) : [0, 0];
  hp.drag = { mode, key, corner, draft: isDraft, pos, start: { ...pos }, ox: mx - pos.x, oy: my - pos.y, bodyNode };
  redrawHomePlacementCanvas(bodyNode, currentGameState, hp);
}

function homePlacementStartMove(ev, key, isDraft) {
  homePlacementStartDrag(ev, key, 'move');
}
function homePlacementStartResize(ev, key, corner) {
  homePlacementStartDrag(ev, key, 'size', corner);
}
function homePlacementStartRotate(ev, key) {
  homePlacementStartDrag(ev, key, 'rot');
}

function onHomePlacementMouseMove(ev) {
  const hp = homePlacementUI;
  if (!hp || !hp.drag) return;
  const svg = hp.drag.bodyNode?.querySelector('.hp-canvas');
  if (!svg) return;
  const [mx, my] = homePlacementSvgPoint(svg, ev);
  const pos = hp.drag.pos;
  const d = hp.drag;
  const snap = hp.snap;
  if (d.mode === 'move') {
    pos.x = homePlacementSnap(mx - d.ox, snap);
    pos.y = homePlacementSnap(my - d.oy, snap);
  } else if (d.mode === 'size') {
    const s = d.start;
    if (d.corner.includes('e')) pos.w = Math.max(3, homePlacementSnap(mx - s.x, snap));
    if (d.corner.includes('s')) pos.h = Math.max(3, homePlacementSnap(my - s.y, snap));
    if (d.corner.includes('w')) { const nx = homePlacementSnap(mx, snap); pos.w = Math.max(3, s.x + s.w - nx); pos.x = nx; }
    if (d.corner.includes('n')) { const ny = homePlacementSnap(my, snap); pos.h = Math.max(3, s.y + s.h - ny); pos.y = ny; }
  } else if (d.mode === 'rot') {
    const a = Math.atan2(my - (pos.y + pos.h / 2), mx - (pos.x + pos.w / 2)) * 180 / Math.PI + 90;
    pos.rot = Math.round(a / 15) * 15;
  }
  redrawHomePlacementCanvas(d.bodyNode, currentGameState, hp);
}

function onHomePlacementMouseUp() {
  const hp = homePlacementUI;
  if (!hp || !hp.drag) return;
  const wasDraft = hp.drag.draft;
  const bodyNode = hp.drag.bodyNode;
  hp.drag = null;
  redrawHomePlacementCanvas(bodyNode, currentGameState, hp);
  if (!wasDraft) {
    // The drag already wrote the final pos into gameState; this boundary
    // persists it and refreshes the action bar (selection state unchanged).
    render(currentGameState, currentSceneState);
    saveAtBoundary('home-place-move', currentGameState);
  }
}

async function doHomePlaceRoom(roomId) {
  const hp = ensureHomePlacementUI(currentGameState);
  hp.roomId = roomId;
  hp.selectedId = null;
  hp.draft = null;
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
}

async function doHomePlaceItem(defId) {
  const hp = ensureHomePlacementUI(currentGameState);
  const def = DECOR_CATALOG_DEFS[defId];
  if (!def || !DESIGN_SHAPES[def.shape]) return;
  const shape = DESIGN_SHAPES[def.shape];
  const [cx, cy] = typeof roomCentre === 'function' ? roomCentre(hp.roomId) : [50, 50];
  hp.draft = {
    defId,
    pos: { x: Math.round(cx - shape.w / 2), y: Math.round(cy - shape.h / 2), w: shape.w, h: shape.h, rot: 0 },
  };
  hp.selectedId = null;
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
}

async function doHomePlaceCommit() {
  const hp = ensureHomePlacementUI(currentGameState);
  if (!hp.draft) return;
  const result = placeDecorItem(currentGameState, { defId: hp.draft.defId, roomId: hp.roomId, pos: hp.draft.pos });
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  const def = DECOR_CATALOG_DEFS[result.defId];
  hp.draft = null;
  addLogEntry('system', `${def.label} placed in ${ROOMS[hp.roomId].name}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('home-place', currentGameState);
}

async function doHomePlaceCancel() {
  const hp = ensureHomePlacementUI(currentGameState);
  hp.draft = null;
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
}

async function doHomePlaceSelect(objId) {
  const hp = ensureHomePlacementUI(currentGameState);
  hp.selectedId = objId;
  hp.draft = null;
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
}

async function doHomePlacePickup(objId) {
  const result = pickUpDecorObject(currentGameState, objId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  const hp = ensureHomePlacementUI(currentGameState);
  hp.selectedId = null;
  const def = DECOR_CATALOG_DEFS[result.defId];
  addLogEntry('system', `${def.label} picked up — back in your bag.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('home-pickup', currentGameState);
}

async function doHomePlaceToggleSnap() {
  const hp = ensureHomePlacementUI(currentGameState);
  hp.snap = !hp.snap;
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
}

(function initHomePlacementGestures() {
  if (typeof document === 'undefined') return;
  window.addEventListener('mousemove', onHomePlacementMouseMove);
  window.addEventListener('mouseup', onHomePlacementMouseUp);
})();

async function doBrowserVisit(siteId, device) {
  if (!siteId) return;
  // Phase 5: device-aware connectivity gating (decision F) — power/internet
  // for the computer, wifi+cellular both down for the phone.
  const blocked = appBlockedReason(currentGameState, 'browser', device);
  if (blocked) {
    addLogEntry('system', `You can't browse — ${blocked.toLowerCase()}.`);
    return;
  }
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
    currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);

    // Phase 5 device parity: the phone's Browser app uses the SAME
    // handlers, so the visit has to navigate whichever shell launched it —
    // switchScreen without a device would silently open the site in the
    // (hidden on mobile) computer window while the phone stayed put.
    switchScreen(currentGameState, 'browser', 'site', undefined, device);

    // AfterHours (Site Expansion Phase 2): let the AH module resume/init its
    // routed view and trigger the initial clip fetch. This runs BEFORE the
    // render, not after: it is the hook that backfills state the site's
    // renderers read (the routed view, the seed, and the Hot Singles roster
    // on a save written before Phase 7). Rendering first meant the first
    // paint of the site read state that didn't exist yet — and the roster
    // backfill ended up happening inside the render pass instead.
    if (siteId === 'afterhours') AH.onSiteOpen(currentGameState);

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
    currentGameState.player = decayPlayerNeeds(currentGameState.player, result.ticks * CLOCK.tickMinutes, currentGameState);
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

// Phase 1: promote a stub to a full NPC and open the profile. In Phase 3
// this becomes async (fetch queue — player keeps browsing while the NPC
// generates). For now, synchronous promotion: the stub's pre-determined
// fields (name, age, gender, occupation) are passed as a partial to
// rollCastSlot, so the full NPC matches the browse card exactly.
// Phase 3: async fetch queue — clicking "Load Full Profile" enqueues a
// background generation job. The player keeps browsing while the NPC's
// deeper details are generated. The queue lives in
// classifieds.fetchQueue; a badge on the queue icon shows the count of
// ready profiles. When generation completes, the queue entry flips to
// 'ready' and the player can open the full profile.
async function doClassifiedsViewStub(stubId) {
  if (!stubId) return;
  const classifieds = currentGameState.world.computer.apps.classifieds;
  // If the stub is already promoted, open the profile directly
  let stub = null;
  for (const day of Object.keys(classifieds.stubs)) {
    stub = classifieds.stubs[day].find(s => s.stubId === stubId);
    if (stub) break;
  }
  if (!stub) return;
  if (stub.status === 'ready' && stub.fullNpcId) {
    classifieds.viewingApplicantId = stub.fullNpcId;
    switchScreen(currentGameState, 'classifieds', 'detail');
    renderComputerScreen(currentGameState);
    return;
  }
  // Enqueue the fetch
  await doClassifiedsFetchStub(stubId);
}

// Enqueue a stub for async full-NPC generation. The job runs in the
// background — the player can keep browsing. When done, the queue entry
// flips to 'ready' and a log entry notifies the player.
async function doClassifiedsFetchStub(stubId) {
  if (!stubId) return;
  const classifieds = currentGameState.world.computer.apps.classifieds;

  // Find the stub
  let stub = null;
  for (const day of Object.keys(classifieds.stubs)) {
    stub = classifieds.stubs[day].find(s => s.stubId === stubId);
    if (stub) break;
  }
  if (!stub || stub.status === 'ready' || stub.status === 'fetching') return;

  // Check if already in queue
  if (classifieds.fetchQueue.some(q => q.stubId === stubId)) return;

  // Mark stub as fetching
  stub.status = 'fetching';

  // Add to queue
  const queueEntry = {
    stubId,
    status: 'fetching',
    npcId: null,
    startedDay: currentGameState.meta.clock.day,
    name: stub.name,
    occupation: stub.occupation.title,
  };
  classifieds.fetchQueue.push(queueEntry);
  renderComputerScreen(currentGameState);

  // Run the promotion async (deterministic — no LLM, so it's fast, but
  // the async wrapper lets future AI-assisted generation slot in here
  // without changing the queue contract)
  try {
    const result = promoteStubToNpc(currentGameState, stubId);
    if (result.ok) {
      queueEntry.status = 'ready';
      queueEntry.npcId = result.npcId;
      addLogEntry('system', `${stub.name}'s profile is ready to view on RoomList.`);
    } else {
      queueEntry.status = 'error';
      stub.status = 'stub';
      addLogEntry('system', `Could not load ${stub.name}'s profile: ${result.reason}`);
    }
  } catch (e) {
    queueEntry.status = 'error';
    stub.status = 'stub';
    addLogEntry('system', `Error loading ${stub.name}'s profile.`);
  }
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classifieds-fetch-stub', currentGameState);
}

// Open the fetch queue — a list of in-progress and ready profiles.
// Clicking a 'ready' entry opens the full profile; 'fetching' entries
// show a spinner indicator.
function doClassifiedsOpenQueue() {
  switchScreen(currentGameState, 'classifieds', 'queue');
  renderComputerScreen(currentGameState);
}

// Phase 2: filter toggle — rowId encodes "type:value" (e.g. "gender:male")
function doClassifiedsFilterToggle(rowId) {
  if (!rowId) return;
  const [type, value] = rowId.split(':');
  if (!type || !value) return;
  const filters = currentGameState.world.computer.apps.classifieds.filters;
  if (!filters) return;
  const list = filters[type] || [];
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
  filters[type] = list;
  renderComputerScreen(currentGameState);
}

// Phase 2: sort change — rowId is the sort key
function doClassifiedsSort(rowId) {
  if (!rowId) return;
  const filters = currentGameState.world.computer.apps.classifieds.filters;
  if (!filters) return;
  filters.sortBy = rowId;
  renderComputerScreen(currentGameState);
}

// Phase 2: clear all filters
function doClassifiedsClearFilters() {
  const classifieds = currentGameState.world.computer.apps.classifieds;
  classifieds.filters = { gender: [], incomeBand: [], ageRange: [18, 60], sortBy: 'recent', favoritesOnly: false };
  renderComputerScreen(currentGameState);
}

async function doClassifiedsAccept(npcId, roomId) {
  if (!npcId) return;
  showLoading();
  try {
    // Move-in offers (external-world plan Phase 8): a non-applicant accepted
    // through the offers flow returns to the Offers screen, not Browse
    // (which needs a posted ad) — capture their pre-accept status first.
    const wasProspective = currentGameState.npcs[npcId]?.residency?.status === 'prospective';
    const result = acceptApplicant(currentGameState, npcId, roomId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    addLogEntry('narration', `${result.npc.bible.name} moves in. Rent shifts to reflect the new headcount.`);
    // getSceneParticipants recomputes off npc.location, which moveToRoom
    // already set — the new resident can show up in the room list/scene
    // immediately without a separate sync step.
    currentSceneState = getSceneParticipants(currentGameState.player, currentGameState.npcs, currentGameState.world);
    switchScreen(currentGameState, 'classifieds', wasProspective ? 'browse' : 'offers');
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
  switchScreen(currentGameState, 'classifieds', 'browse');
  renderComputerScreen(currentGameState);
  await saveAtBoundary('classifieds-reject', currentGameState);
}

// Open the room-assignment screen for a prospective roommate. The NPC id
// is stashed on classifieds.assigningNpcId so the renderer can pick it up.
function doClassifiedsAssignRoom(npcId) {
  if (!npcId) return;
  currentGameState.world.computer.apps.classifieds.assigningNpcId = npcId;
  switchScreen(currentGameState, 'classifieds', 'assign');
  renderComputerScreen(currentGameState);
}

// Phase 4: Studio — collect all form field values from the DOM into the
// draft object. Called on any studio action (create, clear, AI generate)
// to harvest the current form state before acting.
function collectStudioDraft() {
  const studio = studioState(currentGameState);
  // Start from existing draft so pool-toggled arrays (personality.traits,
  // interests, etc.) are preserved — those are managed by the toggle
  // handler directly on studio.draft, not via form inputs.
  const existing = studio.draft || {};
  const draft = {};

  // Text, number, select, textarea fields
  const fields = document.querySelectorAll('[data-studio-field]');
  for (const el of fields) {
    const field = el.getAttribute('data-studio-field');
    if (field.startsWith('temperament.')) continue; // handled separately
    let val = el.value;
    if (el.type === 'number') {
      val = val === '' ? undefined : Number(val);
    } else if (el.tagName === 'SELECT') {
      val = val || undefined;
    } else if (el.tagName === 'TEXTAREA' || el.type === 'text') {
      val = val.trim() || undefined;
    }
    if (val !== undefined) draft[field] = val;
  }

  // Preserve pool-toggled arrays and scalar personality fields from
  // existing draft (these are managed by doClassifiedsStudioTogglePool
  // or populated by AI generation, not by form inputs)
  const poolFields = ['personality.traits', 'personality.quirks', 'personality.likes', 'personality.dislikes', 'interests', 'values'];
  for (const pf of poolFields) {
    const parts = pf.split('.');
    let src = existing, dst = draft;
    for (let i = 0; i < parts.length - 1; i++) {
      src = src?.[parts[i]] || {};
      if (!dst[parts[i]]) dst[parts[i]] = {};
      dst = dst[parts[i]];
    }
    if (Array.isArray(src[parts[parts.length - 1]])) {
      dst[parts[parts.length - 1]] = src[parts[parts.length - 1]];
    }
  }

  // Preserve scalar personality fields (coreTrait, hiddenTrait) that have
  // no DOM input — AI generation populates these, but collectStudioDraft
  // would silently drop them on the next studio action
  if (existing.personality) {
    if (!draft.personality) draft.personality = {};
    if (existing.personality.coreTrait && !draft.personality.coreTrait) draft.personality.coreTrait = existing.personality.coreTrait;
    if (existing.personality.hiddenTrait && !draft.personality.hiddenTrait) draft.personality.hiddenTrait = existing.personality.hiddenTrait;
  }

  // Temperament sliders + checkboxes
  const temperament = {};
  const axes = ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness'];
  for (const axis of axes) {
    const cb = document.querySelector(`[data-studio-field="temperament.${axis}.enabled"]`);
    const slider = document.querySelector(`[data-studio-field="temperament.${axis}"]`);
    if (cb?.checked && slider) {
      temperament[axis] = parseFloat(slider.value);
    }
  }
  if (Object.keys(temperament).length > 0) draft.temperament = temperament;

  // AI prompt textarea
  const aiInput = document.getElementById('studio-ai-input');
  if (aiInput) studio.aiPrompt = aiInput.value;

  studio.draft = draft;
  return draft;
}

// Phase 4: Toggle a pool item in the draft (add/remove from array)
function doClassifiedsStudioTogglePool(rowId) {
  if (!rowId) return;
  const [field, name] = rowId.split(':');
  if (!field || !name) return;
  const studio = studioState(currentGameState);
  const draft = studio.draft || (studio.draft = {});

  // Navigate dotted path (e.g. "personality.traits")
  const parts = field.split('.');
  let obj = draft;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  const key = parts[parts.length - 1];
  if (!Array.isArray(obj[key])) obj[key] = [];
  const idx = obj[key].indexOf(name);
  if (idx >= 0) obj[key].splice(idx, 1);
  else obj[key].push(name);

  rerenderStudio();
}

// Phase 4: Create the character from the current draft
async function doClassifiedsStudioCreate() {
  const draft = collectStudioDraft();
  showLoading();
  try {
    const result = buildStudioNpc(currentGameState, draft);
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    addLogEntry('narration', `Character created from the Studio. View their profile to accept or reject.`);
    // Open the profile
    currentGameState.world.computer.apps.classifieds.viewingApplicantId = result.npcId;
    // Clear the draft
    currentGameState.world.computer.apps.classifieds.studio.draft = {};
    switchScreen(currentGameState, 'classifieds', 'detail');
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('classifieds-studio-create', currentGameState);
  } finally {
    hideLoading();
  }
}

// Phase 4: Clear the draft
function doClassifiedsStudioClear() {
  const classifieds = currentGameState.world.computer.apps.classifieds;
  if (classifieds.studio) classifieds.studio.draft = {};
  rerenderStudio();
}

// Phase 7: Interview — open an IM thread with the prospective applicant.
// Creates a thread if none exists and switches to the Messages app.
function doClassifiedsInterview(npcId) {
  if (!npcId) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  // Create a thread so the applicant shows up in the IM contact list
  ensureImThread(currentGameState, npcId);
  // Set the IM app to view this thread
  currentGameState.world.computer.apps.im.viewingNpcId = npcId;
  // Open the IM app properly (with rect, zIndex, etc.)
  openApp(currentGameState, 'im');
  focusWindow(currentGameState, 'im');
  renderComputerScreen(currentGameState);
}

// Phase 7: Toggle favorite on an applicant
function doClassifiedsToggleFavorite(npcId) {
  if (!npcId) return;
  const classifieds = currentGameState.world.computer.apps.classifieds;
  if (!classifieds.favorites) classifieds.favorites = [];
  const idx = classifieds.favorites.indexOf(npcId);
  if (idx >= 0) classifieds.favorites.splice(idx, 1);
  else classifieds.favorites.push(npcId);
  renderComputerScreen(currentGameState);
}

// Phase 7: Toggle the favorites-only filter in the browse grid
function doClassifiedsToggleFavFilter() {
  const classifieds = currentGameState.world.computer.apps.classifieds;
  if (!classifieds.filters) classifieds.filters = {};
  classifieds.filters.favoritesOnly = !classifieds.filters.favoritesOnly;
  renderComputerScreen(currentGameState);
}

// Phase 5: AI-assisted generation — harvest the AI prompt, call LLM,
// populate the draft, re-render
async function doClassifiedsStudioAIGenerate() {
  const studio = studioState(currentGameState);
  // First harvest current form state (so manual edits aren't lost)
  collectStudioDraft();
  const prompt = studio.aiPrompt || '';
  if (!prompt.trim()) { addLogEntry('system', 'Describe a character first.'); return; }

  studio.aiBusy = true;
  rerenderStudio();
  showLoading('AI is generating a character…');
  try {
    const result = await generateCharacterWithAI(currentGameState, prompt.trim());
    if (!result.ok) { addLogEntry('system', result.reason); return; }
    // Merge AI-generated draft over existing draft (AI fills empty fields,
    // overrides nothing the player explicitly set unless AI provides it)
    const existing = studio.draft || {};
    studio.draft = { ...existing, ...result.draft };
    // Merge nested personality/temperament if present
    if (result.draft.personality) {
      studio.draft.personality = { ...(existing.personality || {}), ...result.draft.personality };
    }
    if (result.draft.temperament) {
      studio.draft.temperament = { ...(existing.temperament || {}), ...result.draft.temperament };
    }
    addLogEntry('system', 'AI generated a character draft. Review and adjust in the Studio, then Create.');
    rerenderStudio();
    await saveAtBoundary('classifieds-studio-ai', currentGameState);
  } finally {
    studio.aiBusy = false;
    hideLoading();
    rerenderStudio();
  }
}

// --- Phase 5 (D12/D16/D17) — the studio's profile surface handlers ---
// Navigation state lives in classifieds.studio (never the DOM); profile
// handlers touch studio.mode/viewingNpcId/tab/editMode/editSelections only,
// never studio.draft — the create surface's handlers own that (the
// top-of-phase check: a resident and an in-progress draft must not share a
// struct).

function studioState(gs) {
  const classifieds = gs.world.computer.apps.classifieds;
  if (!classifieds.studio) classifieds.studio = studioDefaultState();
  return classifieds.studio;
}

// Re-render whichever shell is active — the studio is one shared surface
// across the computer and the phone, and each renderer no-ops when its shell
// is closed.
function rerenderStudio() {
  if (typeof renderComputerScreen === 'function') renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// rowId is a mode ('create' | 'list') or 'profile:<npcId>'.
function doClassifiedsStudioSetMode(rowId) {
  if (!rowId) return;
  const studio = studioState(currentGameState);
  if (rowId.startsWith('profile:')) {
    const npcId = rowId.slice('profile:'.length);
    if (!currentGameState.npcs[npcId]) return;
    studio.mode = 'profile';
    studio.viewingNpcId = npcId;
    studio.tab = 'personal';
    studio.editMode = false;
    studio.editSelections = {};
  } else if (rowId === 'create' || rowId === 'list') {
    studio.mode = rowId;
    studio.viewingNpcId = null;
    studio.editMode = false;
    studio.editSelections = {};
  }
  rerenderStudio();
}

function doClassifiedsStudioSetTab(tabId) {
  const studio = studioState(currentGameState);
  studio.tab = tabId || 'personal';
  // Leaving the tab drops any half-typed edit — switching away is the
  // player saying "that tab again", and unsaved edits silently vanishing is
  // the predictable behaviour (no stale input surprise on the way back).
  studio.editMode = false;
  studio.editSelections = {};
  rerenderStudio();
}

function doClassifiedsStudioEditToggle() {
  const studio = studioState(currentGameState);
  studio.editMode = !studio.editMode;
  if (studio.editMode) {
    // Snapshot the current pool values as the Edit Mode baseline — toggling
    // then adds/removes against what the character actually holds (the same
    // model the draft builder uses), and the chips highlight the pending
    // selection, not just the committed one.
    const npc = currentGameState.npcs[studio.viewingNpcId];
    studio.editSelections = npc ? studioPoolSnapshot(npc) : {};
  } else {
    studio.editSelections = {};
  }
  rerenderStudio();
}

// The pool-backed fields, as paths into the live NPC.
const STUDIO_POOL_PATHS = ['bible.personality.traits', 'bible.personality.quirks', 'bible.personality.likes', 'bible.personality.dislikes', 'bible.interests', 'bible.values'];

function studioPoolSnapshot(npc) {
  const snap = {};
  for (const path of STUDIO_POOL_PATHS) {
    const v = studioGetPath(npc, path);
    snap[path] = (v || []).map(x => (x && typeof x === 'object') ? x.name : x).filter(Boolean);
  }
  return snap;
}

function doClassifiedsStudioEditDiscard() {
  const studio = studioState(currentGameState);
  studio.editMode = false;
  studio.editSelections = {};
  rerenderStudio();
}

// Edit Mode pool toggle — path:name, written to studio.editSelections so a
// re-render (which highlights the active chips) does not lose the state.
// Separate from doClassifiedsStudioTogglePool, which toggles the CREATE
// surface's studio.draft.
function doClassifiedsStudioEditPool(rowId) {
  if (!rowId) return;
  const sep = rowId.indexOf(':');
  if (sep < 0) return;
  const path = rowId.slice(0, sep);
  const name = rowId.slice(sep + 1);
  if (!path || !name) return;
  const studio = studioState(currentGameState);
  if (!studio.editSelections || typeof studio.editSelections !== 'object') studio.editSelections = {};
  const arr = studio.editSelections[path] || [];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(name);
  studio.editSelections[path] = arr;
  rerenderStudio();
}

// Pool names → the schema item objects the validator expects. Interests carry
// their pool tags (skill stays at the schema default 0 — INTEREST_POOL has no
// authored skill); values carry their opposition pair.
function studioPoolNamesToValues(path, names) {
  if (path === 'bible.interests') {
    return (names || []).map(n => {
      const p = INTEREST_POOL.find(i => i.name === n);
      return { name: n, tags: p ? (p.tags || []) : [], skill: 0 };
    });
  }
  if (path === 'bible.values') {
    return (names || []).map(n => {
      const p = VALUES_POOL.find(v => v.name === n);
      return { name: n, opposition: p ? (p.opposition || '') : '' };
    });
  }
  return names || [];
}

// Write a validated value into the NPC object at a dotted path with [n]
// segments ('bible.interests[0].name'). Returns whether anything was written.
function applyNpcField(obj, path, value) {
  const parts = [];
  for (const bit of String(path).split('.')) {
    const m = /^([^[\]]*)(?:\[(\d+)\])?$/.exec(bit);
    if (!m || (m[1] === '' && m[2] === undefined)) return false;
    const t = {};
    if (m[1] !== '') t.k = m[1];
    if (m[2] !== undefined) t.i = Number(m[2]);
    parts.push(t);
  }
  if (parts.length === 0) return false;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (p.k !== undefined) {
      if (cur == null || typeof cur !== 'object') return false;
      cur = cur[p.k];
    }
    if (p.i !== undefined) {
      if (cur == null || !Array.isArray(cur) || p.i >= cur.length) return false;
      cur = cur[p.i];
    }
  }
  const last = parts[parts.length - 1];
  if (last.i !== undefined) {
    if (last.k !== undefined) {
      if (cur == null || typeof cur !== 'object' || cur[last.k] == null) return false;
      if (last.i >= cur[last.k].length) return false;
      cur[last.k][last.i] = value;
    } else {
      if (cur == null || !Array.isArray(cur) || last.i >= cur.length) return false;
      cur[last.i] = value;
    }
  } else {
    if (cur == null || typeof cur !== 'object') return false;
    cur[last.k] = value;
  }
  return true;
}

// D17 — the schema-guarded writer. Collects the Edit Mode inputs (scalar +
// array textareas + pool selections), validates EACH through
// validateNpcField (same schema the save validator uses), applies the valid
// ones, logs the rejected ones, and recomputes the derived relationship
// fields. Cannot produce a corrupt save: an invalid edit is refused, not
// coerced.
function doClassifiedsStudioSaveEdits() {
  const gs = currentGameState;
  const studio = studioState(gs);
  const npcId = studio.viewingNpcId;
  const npc = npcId ? gs.npcs[npcId] : null;
  if (!npc) return;

  const edits = [];
  for (const el of document.querySelectorAll('[data-studio-edit-path]')) {
    const path = el.getAttribute('data-studio-edit-path');
    if (!path) continue;
    const kind = el.getAttribute('data-studio-edit-kind');
    let value;
    if (kind === 'array') {
      value = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    } else if (el.type === 'number') {
      if (el.value === '') continue; // cleared number = "leave it"
      value = Math.round(Number(el.value) * 100) / 100;
    } else if (el.type === 'checkbox') {
      value = el.checked;
    } else {
      value = el.value.trim();
    }
    edits.push({ path, value });
  }
  for (const [path, names] of Object.entries(studio.editSelections || {})) {
    edits.push({ path, value: studioPoolNamesToValues(path, names) });
  }

  const errors = [];
  let applied = 0;
  let bibleTouched = false;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const { path, value } of edits) {
    const res = validateNpcField(path, value);
    if (!res.ok) { errors.push(`${path}: ${res.error}`); continue; }
    // Skip no-op writes — an Edit Mode save also collects untouched inputs,
    // and re-logging an identical value would fabricate a revision.
    if (same(studioGetPath(npc, path), res.value)) continue;
    if (applyNpcField(npc, path, res.value)) {
      applied++;
      if (path.startsWith('bible.')) {
        bibleTouched = true;
        if (!Array.isArray(npc.bibleChanges)) npc.bibleChanges = [];
        npc.bibleChanges.push({ path, value: res.value, day: gs.meta.clock.day });
      }
    }
  }

  // One revision per save pass (D17: bibleRevision counts edit passes, not
  // fields — a three-field save is one revision, three logged changes).
  if (bibleTouched) npc.bibleRevision = (npc.bibleRevision || 0) + 1;

  // Derived fields recompute from what was edited (D17); they are never
  // written directly.
  if (applied > 0 && npc.relPlayer) {
    const d = deriveConversationPhase(npc.relPlayer);
    npc.relPlayer.intimacyLevel = d.intimacyLevel;
    npc.relPlayer.conversationPhase = d.conversationPhase;
  }

  studio.editMode = false;
  studio.editSelections = {};
  if (errors.length > 0) {
    addLogEntry('system', `Studio: ${errors.length} field${errors.length === 1 ? '' : 's'} not saved — ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
  }
  if (applied > 0) {
    addLogEntry('narration', `Updated ${applied} field${applied === 1 ? '' : 's'} for ${npc.bible?.name || 'this character'}.`);
  }
  rerenderStudio();
  if (applied > 0 || errors.length > 0) {
    saveAtBoundary('classifieds-studio-edit', gs).catch(() => {});
  }
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

// Guard so concurrent Send clicks/races can't fire overlapping sends —
// the LLM call inside resolveImReply can take up to a minute, and without
// this each extra click sent the same message again (the input wasn't
// cleared yet) and got a separate reply.
let imSending = false;

// Inject a temporary "is typing…" indicator at the bottom of the open IM
// thread's message log. Returns a remove() fn. Keeps the UI responsive
// while the NPC reply is being generated — the player's own message has
// already been appended and painted before this is shown, so the thread
// reads naturally: your bubble, then their typing dots, then their reply.
function showImTypingIndicator() {
  const log = document.querySelector('.im-msg-log');
  if (!log) return () => {};
  const indicator = document.createElement('div');
  indicator.className = 'im-typing';
  indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  log.appendChild(indicator);
  log.scrollTop = log.scrollHeight;
  return () => { if (indicator.parentNode) indicator.remove(); };
}

async function doImSend(npcId) {
  if (!npcId || imSending) return;
  const input = document.getElementById('cs-chat-input');
  const text = input?.value.trim();
  if (!text) return;
  // Clear the input and set the guard IMMEDIATELY, before any await —
  // this is what stops a second click in the same tick from reading the
  // same text and firing a duplicate send.
  if (input) input.value = '';
  imSending = true;
  const sendBtn = document.querySelector('.im-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

  // Append the player's message and re-render immediately so their bubble
  // appears instantly — we do NOT block the UI while waiting for the NPC
  // reply. No global loading overlay (the whole point: keep typing/reading).
  const appended = appendPlayerImMessage(currentGameState, npcId, text);
  if (!appended.ok) { addLogEntry('system', appended.reason); imSending = false; if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; } return; }
  renderComputerScreen(currentGameState);
  // renderComputerScreen rebuilt the window body, so the send button we
  // disabled above is gone — re-disable the fresh one to show a reply is
  // in flight. (imSending already guards against duplicate sends.)
  const pendingBtn = document.querySelector('.im-send-btn');
  if (pendingBtn) { pendingBtn.disabled = true; pendingBtn.textContent = 'Sending…'; }

  // Show the "typing…" indicator on the freshly rendered log while the
  // NPC generates a reply.
  const removeTyping = showImTypingIndicator();

  try {
    const result = await resolveImReply(currentGameState, npcId, text);
    if (!result.ok) { addLogEntry('system', result.reason); }
    await advanceAndResolve(1);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, CLOCK.tickMinutes, currentGameState);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    // Plan X-5 Phase 2 (D17): IM is a judged surface. A text exchange lands
    // in memory.recent stamped with whichever scene the player is standing
    // in, so it is judged by the same Assessor on the same two triggers —
    // this is the early-flush half, after the reply has painted (D6).
    if (await assessSceneIfFull()) render(currentGameState, currentSceneState);
    // Phase 3: and the Chronicler reads the same buffer on its own, wider
    // window — a long text conversation teaches an NPC as much as a spoken one.
    await chronicleIfFull();
    await saveAtBoundary('im-send', currentGameState);
  } finally {
    removeTyping();
    imSending = false;
    // Re-enable the send button (renderComputerScreen may have rebuilt
    // the window body, so find it fresh).
    const btn = document.querySelector('.im-send-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    // Refocus the input for rapid follow-up messages.
    const freshInput = document.getElementById('cs-chat-input');
    if (freshInput) freshInput.focus();
  }
}

async function doStreamWatch(showId, device) {
  if (!showId) return;
  // Phase 5: device-aware connectivity gating (decision F) — power/internet
  // for the computer, wifi+cellular both down for the phone.
  const blocked = appBlockedReason(currentGameState, 'stream', device);
  if (blocked) {
    addLogEntry('system', `You can't stream — ${blocked.toLowerCase()}.`);
    return;
  }
  showLoading();
  try {
    const result = watchEpisode(currentGameState, showId);
    if (!result.ok) { addLogEntry('system', result.reason); return; }

    const roomObjects = currentGameState.objects[`room_${currentGameState.player.location}`] || {};
    const effCtx = buildEffectContext(currentGameState, [], [], roomObjects, currentGameState.player.inventory || []);
    applyEffects([{ type: 'ADJUST_NEED', params: { who: 'player', need: 'mood', delta: String(result.show.moodGain) } }], effCtx);

    await advanceAndResolve(result.show.episodeTicks);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, result.show.episodeTicks * CLOCK.tickMinutes, currentGameState);
    addLogEntry('narration', `You watch episode ${result.episode} of ${result.show.label}.`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('stream-watch', currentGameState);
  } finally {
    hideLoading();
  }
}

// --- Bills (Phase 3) ---
async function doBillsPay(billId) {
  if (!billId) return;
  const def = BILL_DEFS[billId];
  const result = payBill(currentGameState, billId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  const reconnectNote = result.reconnected ? ` (incl. ${result.reconnectFee} reconnection fee)` : '';
  addLogEntry('narration', `You pay the ${def.label} bill: ${result.paid}${reconnectNote}.`);
  if (result.reconnected) addLogEntry('system', `${def.label} service restored.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('bills-pay', currentGameState);
}

async function doBillsPayAll() {
  await doPayBillsFromWorld('bills-pay-all');
  renderComputerScreen(currentGameState);
}

// BrineOS Phase 7: toggle a single bill's autopay flag. Rendered on both
// devices for free (shared bills-dashboard renderer, Phase 1/5).
async function doBillsToggleAutopay(billId) {
  if (!billId) return;
  const result = toggleBillAutopay(currentGameState, billId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Autopay ${result.autopay ? 'enabled' : 'disabled'} for ${BILL_DEFS[billId].label}.`);
  renderComputerScreen(currentGameState);
  await saveAtBoundary('bills-toggle-autopay', currentGameState);
}

// Phase 11: investing
async function doInvestBuy(fundId, amount) {
  if (!fundId || !amount) return;
  const fund = INVESTING.funds.find(f => f.id === fundId);
  const result = investBuy(currentGameState, fundId, amount);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('narration', `You invest ${result.amount} in ${fund.label} (fee: ${result.fee}).`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('invest-buy', currentGameState);
}

async function doInvestSellAll(fundId) {
  if (!fundId) return;
  const fund = INVESTING.funds.find(f => f.id === fundId);
  const holding = currentGameState.world.computer.apps.invest.holdings[fundId];
  if (!holding || holding.shares <= 0) return;
  const result = investSell(currentGameState, fundId, holding.shares);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('narration', `You sell all of ${fund.label}: ${Math.round(result.amount)} (fee: ${result.fee}, ${result.gain >= 0 ? '+' : ''}${Math.round(result.gain)} P&L).`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('invest-sell', currentGameState);
}

// --- Phase 4: Apartment upgrades (RenoFix) ---
// Renovation overhaul Phase 3: the dashboard's Book button now opens a
// booking-confirmation modal (cost / duration / completion day / what
// becomes unavailable / projected quality-rent change) instead of an
// instant purchase; the booking itself runs in doUpgradeBook on confirm.
async function doUpgradePurchase(facilityId) {
  if (!facilityId) return;
  const def = FACILITY_DEFS[facilityId];
  const upgrade = currentGameState?.world?.upgrades?.[facilityId];
  if (!def || !upgrade) return;
  const nextTier = getNextFacilityTier(def, upgrade.tier);
  if (!nextTier) return;
  showUpgradeBookingModal(def, nextTier);
}

// Booking-confirmation modal. The quality / rent-ceiling / roommate-rent
// projections are computed against a scratch copy of world.upgrades with
// the target tier substituted in — live state is never mutated here.
function showUpgradeBookingModal(def, nextTier) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const actionsEl = document.getElementById('modal-actions');
  if (!overlay || !titleEl || !bodyEl || !actionsEl) return;
  const gs = currentGameState;
  const day = gs.meta.clock.day;
  const jobType = nextTier.tier === 'functional' ? 'repair' : 'upgrade';
  // Working-day scheduling (external-world plan Phase 4): the crew works
  // weekdays only, so show the real completion date — a Friday booking
  // lands after the weekend. The rush option prices the alternative.
  const durationDays = nextTier.durationDays || 1;
  const etaDay = addWorkingDays(day, durationDays);
  const rushEtaDay = day + durationDays;
  const skipsWeekend = etaDay !== rushEtaDay;
  // Phase 2 (contractor doc): the player pays the Contractor's full price —
  // materials + labor markup — not the bare materials cost. Phase 3: the
  // tutorial's first auxiliary-bedroom job is free — advertised as FREE,
  // charged 0.
  const tutorialFree = isTutorialFreeJob(gs, def.id);
  const totalCost = tutorialFree ? 0 : getContractorJobPrice(nextTier.cost);
  const laborCost = tutorialFree ? 0 : totalCost - nextTier.cost;

  const gated = (def.gatesActions || []).map(id => ACTION_DEFS[id]?.label || id);
  const gatedTxt = gated.length > 0 ? gated.join(', ') : 'cosmetic only';

  const scratch = JSON.parse(JSON.stringify(gs.world.upgrades));
  scratch[def.id].tier = nextTier.tier;
  const qNow = getApartmentQuality(gs);
  const qAfter = getApartmentQuality({ world: { upgrades: scratch } });
  const ceilNow = roommateShareCeiling(qNow);
  const ceilAfter = roommateShareCeiling(qAfter);
  const rentNow = computeRent(gs.npcs, gs);
  const rentAfter = computeRent(gs.npcs, { ...gs, world: { ...gs.world, upgrades: scratch } });
  const rentDelta = rentAfter.coveredByRoommates - rentNow.coveredByRoommates;

  const pct = (v) => `${Math.round(v * 100)}%`;
  const roomName = ROOMS[def.room]?.name || def.room;
  titleEl.textContent = `${jobType === 'repair' ? 'Book Repair' : 'Book Upgrade'} — ${def.label}`;
  bodyEl.innerHTML = `
    <p class="dim tiny" style="margin-bottom: 10px;">${roomName}</p>
    <div class="upg-booking-summary">
      <div><span class="dim">Job:</span> <strong>${jobType === 'repair' ? 'Repair' : 'Upgrade'}</strong></div>
      <div><span class="dim">Cost:</span> <strong>${tutorialFree ? 'FREE' : totalCost}</strong> — ${tutorialFree ? 'one-time tutorial job — the first bedroom repair is on the house' : 'paid upfront, no refund on cancel'} ${tutorialFree ? '' : `<span class="dim tiny">(materials ${nextTier.cost} + labor ${laborCost})</span>`}</div>
      <div><span class="dim">Duration:</span> <strong>${durationDays} working day${durationDays === 1 ? '' : 's'}</strong> — done ${formatDate(etaDay)}${skipsWeekend ? ' <span class="dim tiny">(crew is off at the weekend)</span>' : ''}</div>
      ${(!tutorialFree && skipsWeekend) ? `<div class="upg-rush-row"><label><input type="checkbox" id="upg-rush-toggle"> <span>Weekend rush — <strong>${Math.round(totalCost * RENOVATION_RUSH_MULTIPLIER)}</strong> instead, done ${formatDate(rushEtaDay)}</span></label></div>` : ''}
      <div><span class="dim">Unavailable while working:</span> ${gatedTxt}</div>
      <div><span class="dim">Quality:</span> ${pct(qNow)} → ${pct(qAfter)}</div>
      <div><span class="dim">Rent ceiling:</span> ${pct(ceilNow)} → ${pct(ceilAfter)} per roommate</div>
      ${rentDelta >= 0.5 ? `<div><span class="dim">Roommate rent:</span> <strong>+${Math.round(rentDelta)}/wk</strong></div>` : ''}
    </div>
  `;
  actionsEl.innerHTML = `<button class="btn" data-action="upgrades.book-confirm" data-row-id="${def.id}">Book Job — ${tutorialFree ? 'FREE' : totalCost}</button><button class="btn btn-secondary" data-action="close-modal">Cancel</button>`;
  overlay.setAttribute('data-open', '');
}

// Executes the booking after confirmation in the modal (upgrades.book-confirm).
async function doUpgradeBook(facilityId) {
  // Read the rush toggle BEFORE closeModal tears the modal DOM down.
  const rush = !!document.getElementById('upg-rush-toggle')?.checked;
  closeModal();
  if (!facilityId) return;
  const def = FACILITY_DEFS[facilityId];
  const upgrade = currentGameState?.world?.upgrades?.[facilityId];
  if (!def || !upgrade) return;
  const jobType = upgrade.tier === 'broken' ? 'repair' : 'upgrade';
  const result = bookRenovationJob(currentGameState, facilityId, jobType, { rush });
  if (!result.ok) { addLogEntry('system', result.reason); renderComputerScreen(currentGameState); return; }
  addLogEntry('narration', `You book a ${jobType === 'repair' ? 'repair' : 'upgrade'} on the ${def.label} — ${result.cost === 0 ? "FREE, the Contractor's tutorial job" : `${result.cost} paid upfront`}${rush ? ', crew working through the weekend' : ''}. The crew finishes ${formatDate(result.etaDay)}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('upgrade-book', currentGameState);
}

// Structural work (floorplan plan Phase 6). No booking modal: a structural
// job has no tier ladder and no quality projection to preview, so the
// facility flow's whole reason for a confirmation step does not apply. The
// card already states the cost, the duration and exactly what it does to the
// layout, which is more than the facility modal shows.
async function doBookStructural(upgradeId) {
  if (!upgradeId) return;
  const def = STRUCTURAL_UPGRADES[upgradeId];
  if (!def) return;
  const result = bookStructuralJob(currentGameState, upgradeId, {});
  if (!result.ok) { addLogEntry('system', result.reason); renderComputerScreen(currentGameState); return; }
  addLogEntry('narration', `You book the ${def.label} — $${result.cost.toLocaleString()} paid upfront. The crew finishes ${formatDate(result.etaDay)}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('structural-book', currentGameState);
}

// Phase 9: repair facility condition (maintenance without tier upgrade).
async function doUpgradeRepair(facilityId) {
  if (!facilityId) return;
  const def = FACILITY_DEFS[facilityId];
  const result = repairFacilityCondition(currentGameState, facilityId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('narration', `You repair the ${def.label} — restored ${result.conditionRestored} condition for ${result.cost}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('upgrade-repair', currentGameState);
}

// BrineOS Phase 8.4: a before/after restoration shot. Reuses the same
// takePhoto (image.js) the phone's Camera app uses — the RenoFix screen is
// shared across both devices (Phase 5), and rather than thread a device
// param through every one of the 23 shared renderers just to hide this
// button on the computer, the fiction is simply "you have your phone on
// you regardless of which screen you're looking at" (decision C already
// treats phone presence loosely — usable when carried or in the room).
// The caption is overwritten with the facility+tier so a later gallery
// browse reads as a restoration record, not just "Kitchen, Day 40".
async function doUpgradesSnapPhoto(facilityId) {
  if (!facilityId) return;
  const def = FACILITY_DEFS[facilityId];
  const upgrade = currentGameState.world.upgrades?.[facilityId];
  if (!def || !upgrade) return;
  const tierLabel = def.tiers.find(t => t.tier === upgrade.tier)?.label || upgrade.tier;
  const photo = takePhoto(currentGameState, [`facility:${facilityId}`, `tier:${upgrade.tier}`]);
  photo.caption = `${def.label} — ${tierLabel}, Day ${currentGameState.meta.clock.day}`;
  addLogEntry('system', `Photo saved: ${photo.caption}`);
  renderComputerScreen(currentGameState);
  await saveAtBoundary('upgrades-snap-photo', currentGameState);
}

// --- Phase 6: Quarterly taxes ---

async function doTaxToggleAutoReserve() {
  const result = toggleAutoReserve(currentGameState);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Auto-reserve ${result.autoReserve ? 'ON' : 'OFF'} — ${result.autoReserve ? '27% of each gig payout will be set aside for taxes' : 'gig payouts are no longer skimmed'}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('tax-toggle', currentGameState);
}

async function doTaxPayBill(amount) {
  const result = payTaxBill(currentGameState, amount);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('narration', `You pay ${result.paid} toward back taxes. ${result.remaining > 0 ? `${result.remaining} still owed.` : 'Tax debt cleared.'}`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('tax-pay', currentGameState);
}

async function doTaxWithdrawReserve(amount) {
  const result = withdrawTaxReserve(currentGameState, amount);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('narration', `You withdraw ${result.withdrawn} from your tax reserve. (${result.remaining} remains reserved.)`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('tax-withdraw', currentGameState);
}

// ===== /SECTION: UI.COMPUTER =====

// ===== SECTION: INTERRUPTION BUBBLE =====
// Phase 5: the DOM-injected speech bubble shown when an NPC walks in on
// the player. This is NOT part of the normal render cycle — it's created
// via direct DOM manipulation and appended to #computer-screen, which
// persists across re-renders (only window bodies get innerHTML='' wiped).
// Removed on response ("Sorry!" / "Own it") or dismiss.

// Shows the interruption bubble. If pre-generated text exists for this
// NPC, shows it instantly. Otherwise, shows a "footsteps..." placeholder
// and generates on-demand.
async function showInterruptionBubble(gameState, npcId, doorState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return;

  const browser = gameState.world.computer.apps.browser;
  const clips = browser.afterHoursClips;
  const clip = clips?.find(c => c.id === browser.afterHoursWatching);
  const clipTitle = clip?.title || 'something';
  const clipCategory = clip?.category || browser.afterHoursCategory || 'adult content';

  // Check if we have pre-generated text for this NPC
  let text = null;
  if (pendingInterruption && pendingInterruption.npcId === npcId) {
    text = pendingInterruption.text;
    pendingInterruption = null;
  }

  // Create the bubble DOM (no text yet if we need to generate)
  const bubble = createInterruptionBubble(npc, doorState, text);
  const container = document.getElementById('computer-screen');
  if (container) container.appendChild(bubble);

  // If no pre-generated text, generate on-demand with placeholder
  if (!text) {
    const placeholder = bubble.querySelector('.interrupt-bubble-text');
    if (placeholder) placeholder.textContent = '...';

    try {
      const prompt = buildInterruptionPrompt(gameState, npcId, { title: clipTitle, category: clipCategory }, doorState);
      const generated = await root.generateText(prompt);
      const textEl = bubble.querySelector('.interrupt-bubble-text');
      if (textEl) textEl.textContent = generated.trim();
    } catch (e) {
      // Fallback: a generic line based on personality
      const fallback = buildInterruptionFallback(npc, doorState);
      const textEl = bubble.querySelector('.interrupt-bubble-text');
      if (textEl) textEl.textContent = fallback;
    }
  }

  // Wire up the response buttons. dismiss() is single-shot and tears down
  // its own keydown listener: previously the listener was only removed
  // inside its own Escape branch, so dismissing with a button left it
  // armed on `document` forever — a later Escape re-ran dismiss() against
  // an already-removed bubble, applying the relationship/suspicion
  // consequences a second time and firing a second saveAtBoundary. One
  // listener leaked per bubble, and they stacked across a session.
  const sorryBtn = bubble.querySelector('.interrupt-btn-sorry');
  const ownBtn = bubble.querySelector('.interrupt-btn-own');
  let dismissed = false;
  const dismiss = (response) => {
    if (dismissed) return;
    dismissed = true;
    document.removeEventListener('keydown', escapeHandler);
    applyInterruptionConsequences(gameState, npcId, doorState, response);
    bubble.remove();
    saveAtBoundary('ah-interrupt', gameState);
  };
  function escapeHandler(e) {
    if (e.key === 'Escape') dismiss('sorry');
  }
  if (sorryBtn) sorryBtn.addEventListener('click', () => dismiss('sorry'));
  if (ownBtn) ownBtn.addEventListener('click', () => dismiss('own_it'));

  // Escape is a shortcut for "Sorry!", not a free exit — there's no
  // consequence-free way out of being walked in on, and the earlier
  // comment here claimed otherwise. Clicking the backdrop does the same.
  const overlay = bubble.querySelector('.interrupt-bubble-overlay');
  if (overlay) overlay.addEventListener('click', () => dismiss('sorry'));
  document.addEventListener('keydown', escapeHandler);
}

// Create the bubble DOM element
function createInterruptionBubble(npc, doorState, text) {
  const bubble = document.createElement('div');
  bubble.className = 'interrupt-bubble';

  const name = npc.bible.name || 'Someone';
  const initial = name.charAt(0);
  const color = hashToColor(name);

  const doorNote = doorState === 'locked'
    ? 'They knocked first — your door was locked.'
    : doorState === 'closed'
    ? 'Your door was closed but unlocked.'
    : 'Your door was open.';

  buildBubbleCard(bubble, { color, initial, name, note: doorNote, text }, [
    { cls: 'interrupt-btn-sorry', label: 'Sorry!' },
    { cls: 'interrupt-btn-own', label: 'Own it' },
  ]);

  return bubble;
}

// Shared DOM builder for both bubbles. `name` comes from a character bible
// and `text` straight from generateText — neither is safe to interpolate
// into an innerHTML template, which is what both bubbles used to do. Only
// the fixed skeleton is markup; every value is set through textContent.
function buildBubbleCard(bubble, { color, initial, name, note, text }, buttons) {
  bubble.innerHTML = `
    <div class="interrupt-bubble-overlay"></div>
    <div class="interrupt-bubble-card">
      <div class="interrupt-bubble-header">
        <div class="interrupt-bubble-avatar"></div>
        <div class="interrupt-bubble-name"></div>
        <div class="interrupt-bubble-door dim tiny"></div>
      </div>
      <div class="interrupt-bubble-text"></div>
      <div class="interrupt-bubble-actions"></div>
    </div>
  `;
  const avatar = bubble.querySelector('.interrupt-bubble-avatar');
  avatar.style.background = color;
  avatar.textContent = initial;
  bubble.querySelector('.interrupt-bubble-name').textContent = name;
  bubble.querySelector('.interrupt-bubble-door').textContent = note;
  bubble.querySelector('.interrupt-bubble-text').textContent = text || '...';

  const actions = bubble.querySelector('.interrupt-bubble-actions');
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls}`;
    btn.textContent = b.label;
    actions.appendChild(btn);
  }
}

// Fallback line if LLM generation fails
function buildInterruptionFallback(npc, doorState) {
  const name = npc.bible.name || 'They';
  const t = npc.bible.temperament;
  if (t.volatility > 0.3) {
    return `${name}: "Whoa— seriously?! A little warning next time!"`;
  } else if (t.warmth > 0.3) {
    return `${name}: "Oh! Sorry, I didn't— my bad, I'll just... yeah.`;
  } else if (t.assertiveness > 0.3) {
    return `${name}: "Really? The door was ${doorState === 'locked' ? 'locked, so I knocked, but' : 'wide open and'} you couldn't be bothered to... whatever.`;
  } else {
    return `${name}: "Oh. Um. I'll come back later.`;
  }
}

// ===== /SECTION: INTERRUPTION BUBBLE =====

// ===== SECTION: NPC CAUGHT PEEPING BUBBLE =====
// Phase 6: the mirror of the interruption bubble — shown when the player
// catches an NPC peeping on them. Reuses the Phase 5 bubble DOM structure
// and CSS (.interrupt-bubble, .interrupt-bubble-card, etc). The NPC's line
// is AI-generated via buildNpcCaughtPeepingPrompt. Player response options
// are "What are you doing?!" (confront), "...come in." (invite), and
// "Get out." (cold) — each applies different tension/affection deltas.

async function showNpcCaughtPeepingBubble(gameState, npcId, playerState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return;

  // Create the bubble DOM (no text yet — we need to generate)
  const bubble = createNpcCaughtPeepingBubble(npc, playerState, null);
  const container = document.getElementById('computer-screen') || document.getElementById('main-content');
  if (container) container.appendChild(bubble);
  else document.body.appendChild(bubble);

  // Generate the NPC's reaction text
  const placeholder = bubble.querySelector('.interrupt-bubble-text');
  if (placeholder) placeholder.textContent = '...';

  let text = null;
  try {
    const prompt = buildNpcCaughtPeepingPrompt(gameState, npcId, playerState);
    const generated = await root.generateText(prompt);
    text = generated.trim();
  } catch (e) {
    text = buildNpcCaughtPeepingFallback(npc);
  }

  const textEl = bubble.querySelector('.interrupt-bubble-text');
  if (textEl) textEl.textContent = text;

  // Wire up the three response buttons. Single-shot dismiss that removes
  // its own keydown listener — same leak/double-apply as the interruption
  // bubble; see the comment in showInterruptionBubble.
  const confrontBtn = bubble.querySelector('.peep-btn-confront');
  const inviteBtn = bubble.querySelector('.peep-btn-invite');
  const coldBtn = bubble.querySelector('.peep-btn-cold');
  let dismissed = false;
  const dismiss = (response) => {
    if (dismissed) return;
    dismissed = true;
    document.removeEventListener('keydown', escapeHandler);
    applyNpcPeepConsequences(gameState, npcId, response, playerState);
    bubble.remove();
    saveAtBoundary('npc-peep-caught', gameState);
  };
  function escapeHandler(e) {
    if (e.key === 'Escape') dismiss('confront');
  }
  if (confrontBtn) confrontBtn.addEventListener('click', () => dismiss('confront'));
  if (inviteBtn) inviteBtn.addEventListener('click', () => dismiss('invite'));
  if (coldBtn) coldBtn.addEventListener('click', () => dismiss('cold'));

  // Escape / backdrop click both dismiss as confront (default reaction)
  const overlay = bubble.querySelector('.interrupt-bubble-overlay');
  if (overlay) overlay.addEventListener('click', () => dismiss('confront'));
  document.addEventListener('keydown', escapeHandler);
}

function createNpcCaughtPeepingBubble(npc, playerState, text) {
  const bubble = document.createElement('div');
  bubble.className = 'interrupt-bubble';

  const name = npc.bible.name || 'Someone';
  const initial = name.charAt(0);
  const color = hashToColor(name);

  const stateNote = {
    masturbating: 'They were watching you masturbate.',
    showering: 'They were watching you shower.',
    sleeping: 'They were watching you sleep.',
    undressed: 'They were watching you change.',
  }[playerState] || 'They were watching you.';

  buildBubbleCard(bubble, { color, initial, name, note: stateNote, text }, [
    { cls: 'peep-btn-confront', label: NPC_PEEP_RESPONSES.confront.label },
    { cls: 'peep-btn-invite', label: NPC_PEEP_RESPONSES.invite.label },
    { cls: 'peep-btn-cold', label: NPC_PEEP_RESPONSES.cold.label },
  ]);

  return bubble;
}

// Apply consequences based on player's response to catching the NPC
function applyNpcPeepConsequences(gameState, npcId, response, playerState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return;

  const t = npc.bible.temperament;
  const effCtx = buildEffectContext(gameState, [npcId], [npcId], {}, []);
  const lines = [];

  if (response === 'confront') {
    const r = NPC_PEEP_RESPONSES.confront;
    lines.push(`REL_DELTA ${npcId} tension +${r.tensionDelta}`);
    lines.push(`REL_DELTA ${npcId} affection ${r.affectionDelta}`);
    lines.push(`MEMORY_EPISODE ${npcId} You caught them peeping on you ${playerState} and confronted them.`);
  } else if (response === 'invite') {
    const r = NPC_PEEP_RESPONSES.invite;
    if (t.warmth > r.warmthThreshold) {
      // High warmth — romantic shift
      lines.push(`REL_DELTA ${npcId} affection +${r.positiveAffectionDelta}`);
      lines.push(`REL_DELTA ${npcId} tension ${r.positiveTensionDelta}`);
      lines.push(`MEMORY_EPISODE ${npcId} You caught them peeping on you ${playerState} and invited them in. They stayed.`);
    } else {
      // Low warmth — NPC flees awkwardly
      lines.push(`REL_DELTA ${npcId} tension +${r.negativeTensionDelta}`);
      lines.push(`MEMORY_EPISODE ${npcId} You caught them peeping on you ${playerState} and invited them in. They fled.`);
    }
  } else if (response === 'cold') {
    const r = NPC_PEEP_RESPONSES.cold;
    lines.push(`REL_DELTA ${npcId} tension +${r.tensionDelta}`);
    lines.push(`REL_DELTA ${npcId} affection ${r.affectionDelta}`);
    lines.push(`MEMORY_EPISODE ${npcId} You caught them peeping on you ${playerState} and told them to get out.`);
  }

  const effects = lines.map(l => parseEffectDSL(l)[0]).filter(Boolean);
  applyEffects(effects, effCtx);
}

// Fallback line if LLM generation fails for the caught-peeping bubble
function buildNpcCaughtPeepingFallback(npc) {
  const name = npc.bible.name || 'They';
  const t = npc.bible.temperament;
  if (t.volatility > 0.3) {
    return `${name}: "I— this isn't what it looks like! I was just— forget it."`;
  } else if (t.warmth > 0.3) {
    return `${name}: "Oh god. I'm so sorry. I don't know what I was— I'll just go."`;
  } else if (t.assertiveness > 0.3) {
    return `${name}: "Look, I was just passing by. The door was open. Not a big deal."`;
  } else {
    return `${name}: "I... um... sorry. I was just... I'll leave."`;
  }
}

// ===== /SECTION: NPC CAUGHT PEEPING BUBBLE =====
