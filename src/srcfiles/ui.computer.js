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
    // action-outcome-window-plan Phase 6 (D3) / audit finding #12: the
    // payout is genuinely nothing until delivery, but workGigBlock DOES
    // spend a flat GIG_ENERGY_PER_BLOCK every block — that was previously
    // missing from the strip entirely. Read as the known constant (not
    // recomputed) since workGigBlock doesn't return the delta actually
    // applied after clamping.
    await presentActionOutcome(currentGameState, {
      id: 'work.block', label: 'Work',
      outcomeWindow: {
        tier: 'C', trigger: 'player', dismissal: 'tap',
        heading: `Work block — ${pct}%`,
        image: { kind: 'archetype', variant: 'work', phrase: 'focused at a desk working on a computer, a deadline approaching' },
      },
    }, {
      applied: [{ type: 'ADJUST_NEED', params: { who: 'player', need: 'energy', delta: -GIG_ENERGY_PER_BLOCK } }],
      narration: `You work on "${result.gig.label}". Progress: ${pct}% (${result.gig.blocksDone.toFixed(2)}/${result.gig.blocks} blocks).`,
      minutesSpent: GIG_TUNING.workBlockMinutes,
    });
  } finally {
    hideLoading();
  }
}

async function doGigDeliver(gigId) {
  if (!gigId) return;
  const result = deliverGig(currentGameState, gigId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Delivered "${result.gig.label}"${result.late ? ' (late)' : ''}. +${result.payout}. Reputation ${result.repDelta >= 0 ? '+' : ''}${result.repDelta}.`);
  if (result.tierUp) {
    addLogEntry('system', `Career milestone — you're now ${result.tierUp.to}! Better gigs and higher pay await on the board.`);
  }
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('gig-deliver', currentGameState);
  // action-outcome-window-plan Phase 6 (D3) / audit finding #12: deliverGig
  // already runs the payout through applyEffects — it just discarded the
  // return before. Now it's threaded back rather than re-parsed by hand.
  await presentActionOutcome(currentGameState, {
    id: 'gig.deliver', label: 'Deliver',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: result.tierUp ? `Delivered — ${result.tierUp.to}!` : 'Delivered',
      image: { kind: 'instance', phrase: 'handing over finished work and receiving payment, satisfied' },
    },
  }, {
    applied: result.applied || [],
    narration: `Delivered "${result.gig.label}"${result.late ? ' (late)' : ''}. +${result.payout}.`,
    minutesSpent: 0,
  });
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

// --- QuickCart (grocery delivery) ---
// Cart handlers mirror Home's exactly (addToCart/removeFromCart pointed
// at apps.grocery.cart — catalog omitted, defaults to ITEM_DEFS, which is
// right since groceries stay ITEM_DEFS entries unlike Home's separate
// DECOR_CATALOG_DEFS). Checkout diverges: placeGroceryOrder (not
// checkoutCart) for the same-day pipeline, the same chain-quest 'buy' hook
// Nile's checkout fires, and landing on the live-ETA Orders screen instead
// of back on Browse.

async function doGroceryAddToCart(defId) {
  if (!defId) return;
  const result = addToCart(currentGameState, defId, { cartPath: 'apps.grocery.cart' });
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('grocery-add', currentGameState);
}

async function doGroceryRemoveFromCart(defId) {
  if (!defId) return;
  removeFromCart(currentGameState, defId, { cartPath: 'apps.grocery.cart' });
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('grocery-remove', currentGameState);
}

async function doGrocerySetTip(pctWhole) {
  if (!currentGameState) return;
  const app = currentGameState.world.computer?.apps?.grocery;
  if (!app || !Number.isFinite(pctWhole)) return;
  app.tipPct = pctWhole / 100;
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('grocery-tip', currentGameState);
}

async function doGroceryCheckout(device) {
  const result = placeGroceryOrder(currentGameState);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  // Chain quest progress: buying from any shop app satisfies a 'buy' step
  // (checkChainQuestProgress doesn't check item category for 'buy') — the
  // same hook Nile's checkout fires.
  for (const npcId of Object.keys(currentGameState.npcs)) {
    checkChainQuestProgress('buy', npcId);
  }
  const shopper = currentGameState.npcs[result.order.shopperNpcId];
  const eta = getGroceryOrderEtaMinutes(result.order, currentGameState.meta.clock);
  addLogEntry('system', `Order placed on QuickCart — $${result.totals.total}. ${shopper?.bible?.name || 'A shopper'} is bringing it, about ${Math.max(0, eta)} minutes out.`);
  switchScreen(currentGameState, 'grocery', 'orders', undefined, device === 'phone' ? 'phone' : 'computer');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('grocery-checkout', currentGameState);
}

// --- ChefBook (food-overhaul Phase 8, D21/D22) ---
// Same "app state, never DOM state" pattern as Classifieds' viewingApplicantId
// / DoorDrop's openRestaurantId (doFoodOpenRestaurant) — device-aware nav,
// no save boundary (opening a card isn't a world change).
function doRecipesOpenDetail(recipeId, device) {
  if (!recipeId || !currentGameState) return;
  const app = currentGameState.world.computer?.apps?.recipes;
  if (!app) return;
  app.viewingRecipeId = recipeId;
  switchScreen(currentGameState, 'recipes', 'detail', undefined, device === 'phone' ? 'phone' : 'computer');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

async function doRecipesAddToCart(recipeId) {
  if (!recipeId || !currentGameState) return;
  const result = addRecipeIngredientsToCart(currentGameState, recipeId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  const label = RECIPES[recipeId]?.label || recipeId;
  addLogEntry('system', result.added > 0
    ? `Added the missing ingredients for ${label} to your Nile cart.`
    : `Your kitchen already has everything for ${label}.`);
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('recipes-add-cart', currentGameState);
}

// The recipe/day pair is read off the planner's own inputs at submit time
// (the same DOM-holds-transient-form-state pattern DoorDrop's delivery-time
// select and the maid's addon grid both use), scoped by device since the
// computer and phone shells can both have a planner screen in the DOM at
// once.
async function doRecipesPlannerAdd(device) {
  if (!currentGameState) return;
  const scope = device === 'phone' ? document.getElementById('phone-screen') : document;
  const recipeSelect = scope?.querySelector?.('#planner-recipe') || document.getElementById('planner-recipe');
  const dayInput = scope?.querySelector?.('#planner-day') || document.getElementById('planner-day');
  const recipeId = recipeSelect?.value;
  const day = Number(dayInput?.value);
  if (!recipeId) return;
  const result = addToPlanner(currentGameState, recipeId, day);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('recipes-planner-add', currentGameState);
}

async function doRecipesPlannerRemove(index) {
  if (!currentGameState) return;
  removeFromPlanner(currentGameState, Number(index));
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('recipes-planner-remove', currentGameState);
}

async function doRecipesPlannerFillCart() {
  if (!currentGameState) return;
  const result = addPlannerIngredientsToCart(currentGameState);
  addLogEntry('system', result.added > 0
    ? "Added the plan's missing ingredients to your Nile cart."
    : 'Your kitchen already has everything the plan needs.');
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  await saveAtBoundary('recipes-planner-fill', currentGameState);
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
    // action-outcome-window-plan Phase 6 (D3) / audit finding #12: the XP
    // was already known (result.xpGain/result.course.skillId, exactly what
    // attendLesson passed to awardSkillXp) but wasn't in the strip — "rides
    // the narration" undersold it, since ADD_SKILL_XP already has a row
    // builder. The frame is reused per course (same subject every lesson, D5).
    await presentActionOutcome(currentGameState, {
      id: 'classes.attend', label: 'Attend Lesson',
      outcomeWindow: {
        tier: 'C', trigger: 'player', dismissal: 'tap',
        heading: result.completed ? 'Course complete' : 'Lesson done',
        image: { kind: 'archetype', variant: 'class', phrase: 'sitting in a classroom lesson, notebook and notes' },
      },
    }, {
      applied: [{ type: 'ADD_SKILL_XP', params: { skillId: result.course.skillId, xp: result.xpGain } }],
      narration: result.completed
        ? `You finish ${result.course.label}. Certificate unlocked, for whatever that's worth.`
        : `You attend a lesson in ${result.course.label}. +${result.xpGain} ${result.course.skillId} XP.`,
      minutesSpent: result.ticks * CLOCK.tickMinutes,
    });
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
    // action-outcome-window-plan Phase 6 (D3): a new roommate moving in is
    // a real beat. Nothing numeric shifts here; the frame is fresh (this
    // arrival, once).
    await presentActionOutcome(currentGameState, {
      id: 'classifieds.accept', label: 'Accept Roommate',
      outcomeWindow: {
        tier: 'C', trigger: 'player', dismissal: 'tap',
        heading: 'A new face',
        image: { kind: 'instance', phrase: 'welcome, a new roommate arriving with a single suitcase at the door' },
      },
    }, { applied: [], narration: `${result.npc.bible.name} moves in. Rent shifts to reflect the new headcount.`, minutesSpent: 0 });
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
// Dotted-path writers for the studio draft (AI-Assisted Character Generation
// Phase 3). The harvest used to do a flat `draft[field] = val`, which was
// correct only because every field on this surface was single-segment. The
// appearance fields are 'physical.hair.color' shaped, and a flat write would
// have produced a literal "physical.hair.color" KEY that buildStudioNpc never
// reads — the value stored, looked stored, and did nothing.
function setStudioDraftPath(obj, path, value) {
  const segs = String(path).split('.');
  let node = obj;
  for (const s of segs.slice(0, -1)) {
    if (!node[s] || typeof node[s] !== 'object') node[s] = {};
    node = node[s];
  }
  node[segs[segs.length - 1]] = value;
}

// Clearing a control clears the draft. Prunes the parent objects it empties on
// the way out, so a fully-cleared appearance leaves `{}` rather than a husk of
// empty groups — the same "empty deletes" contract studioSet keeps.
function deleteStudioDraftPath(obj, path) {
  const segs = String(path).split('.');
  const chain = [obj];
  let node = obj;
  for (const s of segs.slice(0, -1)) {
    if (!node[s] || typeof node[s] !== 'object') return;
    node = node[s];
    chain.push(node);
  }
  delete node[segs[segs.length - 1]];
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length > 0) break;
    delete chain[i - 1][segs[i - 1]];
  }
}

function collectStudioDraft() {
  const studio = studioState(currentGameState);
  // Start from existing draft so pool-toggled arrays (personality.traits,
  // interests, etc.) are preserved — those are managed by the toggle
  // handler directly on studio.draft, not via form inputs.
  const existing = studio.draft || {};
  const draft = {};

  // AI-Assisted Character Generation Phase 3: seed physical from the existing
  // draft BEFORE reading the form. This surface shows only the SCALAR
  // appearance fields (renderStudioCreateAppearance's documented scope), so a
  // generated sub-field with no control on screen — piercings, tattoos,
  // distinguishing features — would otherwise be deleted by the next harvest
  // and the player would watch their character silently revert (plan design
  // invariant 6). Same reasoning as the personality preservation below.
  //
  // "Absent from the form" and "cleared by the player" stay distinguishable:
  // the loop DELETES the path when a control exists and is empty, and leaves
  // the seeded value alone when no control exists at all.
  if (existing.physical && typeof existing.physical === 'object') {
    draft.physical = JSON.parse(JSON.stringify(existing.physical));
  }

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
    if (val !== undefined) setStudioDraftPath(draft, field, val);
    else deleteStudioDraftPath(draft, field);
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

  // AI-Assisted Character Generation Phase 3 — the GENERAL form of the two
  // special cases above. This surface renders a SUBSET of the draft, and a
  // harvest must never read "absent from the form" as "the player cleared it".
  // The two hand-written preservations above were each added after a specific
  // field was found being destroyed; a concept fill writes several more
  // (`speech`, `sampleLines`, `occupationOverrides`), and the next surface to
  // gain a field would have hit it again.
  //
  // So the rule is derived instead of listed: any top-level key that NO
  // control on screen covers is carried over untouched. Keys the form does
  // cover stay authoritative, so clearing a control still clears the draft.
  const coveredKeys = new Set(['temperament', ...poolFields.map(pf => pf.split('.')[0])]);
  for (const el of document.querySelectorAll('[data-studio-field]')) {
    coveredKeys.add(String(el.getAttribute('data-studio-field')).split('.')[0]);
  }
  for (const [key, val] of Object.entries(existing)) {
    if (coveredKeys.has(key) || draft[key] !== undefined) continue;
    draft[key] = val;
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

  // The Describe & Generate box keeps its own state (studio.concept), read
  // through readConceptControls at the moment it is used rather than harvested
  // here — it is not part of the character draft and must not ride along in it.
  studio.draft = draft;
  return draft;
}

// Phase 4: Toggle a pool item in the draft (add/remove from array)
function doClassifiedsStudioTogglePool(rowId) {
  if (!rowId) return;
  // Split on the FIRST colon only. This was `rowId.split(':')` with a
  // destructure, which silently truncated any name containing a colon — fine
  // while every name came from a pool, a live bug the moment Phase 1 let
  // players and AI fills write their own ("3am thoughts: the playlist").
  // doClassifiedsStudioEditPool, the sibling handler, already did it this way.
  const sep = rowId.indexOf(':');
  if (sep < 0) return;
  const field = rowId.slice(0, sep);
  const name = rowId.slice(sep + 1);
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
async function doClassifiedsInterview(npcId) {
  if (!npcId) return;
  const npc = currentGameState.npcs[npcId];
  if (!npc) return;
  // action-outcome-window-plan Phase 6 (D3): interviewing an applicant is a
  // real beat — what you learned about them, before the IM thread opens.
  // Fresh frame: this applicant, once.
  await presentActionOutcome(currentGameState, {
    id: 'classifieds.interview', label: 'Interview',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: `Interview: ${npc.bible?.name || 'Applicant'}`,
      image: { kind: 'instance', phrase: 'interviewing an applicant over chat, reading their profile on screen' },
    },
  }, { applied: [], narration: `You get to know ${npc.bible?.name || 'the applicant'}. ${npc.bible?.age ? `They're ${npc.bible.age}. ` : ''}A note in their file: ${(npc.personality && npc.personality[0]) || 'quiet, steady'}.`, minutesSpent: 0 });
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

// --- Describe & Generate (AI-Assisted Character Generation Phase 3) ---
// Replaces the old generateCharacterWithAI path, which asked for no appearance
// and hard-filtered its reply against four inlined pools. Everything below is
// surface plumbing; the engine is concept.js.

function doClassifiedsStudioConceptToggle() {
  const studio = studioState(currentGameState);
  if (!studio.concept) studio.concept = defaultConceptState();
  // Keep whatever is in the box when it closes, so collapsing the section is
  // not a way to silently lose a paragraph the player just typed.
  const live = readConceptControls('studio-create');
  if (live) { studio.concept.text = live.text; studio.concept.replace = live.replace; }
  studio.concept.open = !studio.concept.open;
  rerenderStudio();
}

async function doClassifiedsStudioConceptGenerate() {
  const gs = currentGameState;
  const studio = studioState(gs);
  if (!studio.concept) studio.concept = defaultConceptState();
  const live = readConceptControls('studio-create');
  if (!live) return;
  studio.concept.text = live.text;
  studio.concept.replace = live.replace;
  studio.concept.lastError = '';
  if (!live.text) {
    studio.concept.lastError = 'Describe them first.';
    rerenderStudio();
    return;
  }

  // Harvest the form BEFORE the call so manual edits are part of the context
  // the model is told to stay consistent with, and so D10's merge has the real
  // current draft to merge over.
  const before = collectStudioDraft();

  studio.concept.busy = true;
  rerenderStudio();
  showLoading('Building the character…');
  try {
    const result = await fillFromConcept(live.text, 'npcFull', {
      authored: conceptAuthoredContext(before),
      usedNames: usedNpcNames ? [...usedNpcNames(gs)] : [],
    });
    if (!result.ok) {
      studio.concept.lastError = result.reason;
      return;
    }
    studio.draft = conceptMergeInto(before, conceptToStudioDraft(result.draft), live.replace);
    addLogEntry('system', 'Character drafted from your description — review it in the Studio, then Create.');
    await saveAtBoundary('classifieds-studio-concept', gs);
  } finally {
    studio.concept.busy = false;
    hideLoading();
    rerenderStudio();
  }
}

// The scalars worth telling the model about, so a fill on a half-filled form
// stays consistent with what the player already chose rather than
// contradicting it. Nested groups are deliberately omitted — an appearance
// dump costs more prompt than it earns.
function conceptAuthoredContext(draft) {
  const out = {};
  for (const key of ['name', 'age', 'gender', 'species', 'occupationCategory', 'baggage', 'wound', 'want', 'blindSpot', 'boundary']) {
    if (draft && draft[key] !== undefined && draft[key] !== '') out[key] = draft[key];
  }
  return out;
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
    // AI-Assisted Character Generation Phase 6: a pending rewrite is
    // per-character. Leaving it set while switching to a DIFFERENT NPC's
    // profile would let a stale "apply" button commit someone else's diff to
    // the wrong person the next time this screen renders.
    studio.pendingRewrite = null;
    studio.rewriteConcept = defaultConceptState();
  } else if (rowId === 'create' || rowId === 'list') {
    studio.mode = rowId;
    studio.viewingNpcId = null;
    studio.editMode = false;
    studio.editSelections = {};
    studio.pendingRewrite = null;
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

// --- "Add your own" (AI-Assisted Character Generation Phase 1, D1) ---
// Both verbs read the field's custom box and then delegate to the SAME
// toggle handler the pool chips use. Deliberately not a second selection
// path: a custom trait and a pool trait must be added, rendered and removed
// by identical code, or the two drift and only one of them survives a save.
// takeCustomChipValue clears the box, so a second Add cannot re-add the same
// value by accident.
function doClassifiedsStudioAddCustom(field) {
  const value = takeCustomChipValue(field);
  if (!value) return;
  doClassifiedsStudioTogglePool(`${field}:${value}`);
}

function doClassifiedsStudioEditAddCustom(field) {
  const value = takeCustomChipValue(field);
  if (!value) return;
  doClassifiedsStudioEditPool(`${field}:${value}`);
}

// Pool names → the schema item objects the validator expects. Interests carry
// their pool tags (skill stays at the schema default 0 — INTEREST_POOL has no
// authored skill); values carry their opposition pair.
// AI-Assisted Character Generation Phase 1 (D4): routed through the SAME
// resolvers rollCastSlot uses, so a custom trait typed here and one typed in
// the sandbox get identical payload. The old inline `POOL.find(exact)` gave an
// off-pool interest empty tags (harmless) but an off-pool value an EMPTY
// `opposition` — which validates, since `required` only means present, and
// then reads as a value with no opposing force anywhere the fiction uses it.
function studioPoolNamesToValues(path, names) {
  if (path === 'bible.interests') {
    return resolveAuthoredInterests(names).map(i => ({ name: i.name, tags: i.tags || [], skill: 0 }));
  }
  if (path === 'bible.values') {
    return resolveAuthoredValues(names).map(v => ({ name: v.name, opposition: v.opposition || '' }));
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
// The shared apply loop (AI-Assisted Character Generation Phase 6, D13):
// validate -> skip no-op -> write -> log to bibleChanges -> one revision per
// PASS (not per field) -> recompute derived relPlayer fields. Extracted out
// of doClassifiedsStudioSaveEdits so a concept rewrite (below) goes through
// the exact same gate the manual Edit Mode does — it cannot write a value the
// manual editor would reject, and it inherits revision history for free.
//
// `edits` is a plain {path, value} array with NO DOM dependency, which is
// what makes this callable from two very different producers: a form
// harvest, and conceptToEditList's diff. `gs` is threaded through rather than
// read off currentGameState so this has no implicit global dependency.
//
// Returns the applied subset (post no-op-skip, post-validation) — the caller
// needs it for two different reasons: doClassifiedsStudioSaveEdits counts it
// for its narration line, and the rewrite path (below) inspects its paths to
// decide whether to bump genSeed (D14) BEFORE anything is written, so a
// throw partway through never leaves genSeed bumped with nothing behind it.
function applyStudioEditList(gs, npc, edits) {
  const errors = [];
  const applied = [];
  let bibleTouched = false;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const { path, value } of edits) {
    const res = validateNpcField(path, value);
    if (!res.ok) { errors.push(`${path}: ${res.error}`); continue; }
    // Skip no-op writes — an Edit Mode save also collects untouched inputs,
    // and re-logging an identical value would fabricate a revision.
    if (same(studioGetPath(npc, path), res.value)) continue;
    if (applyNpcField(npc, path, res.value)) {
      applied.push({ path, value: res.value });
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
  if (applied.length > 0 && npc.relPlayer) {
    const d = deriveConversationPhase(npc.relPlayer);
    npc.relPlayer.intimacyLevel = d.intimacyLevel;
    npc.relPlayer.conversationPhase = d.conversationPhase;
  }

  return { applied, errors };
}

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

  const { applied, errors } = applyStudioEditList(gs, npc, edits);

  studio.editMode = false;
  studio.editSelections = {};
  if (errors.length > 0) {
    addLogEntry('system', `Studio: ${errors.length} field${errors.length === 1 ? '' : 's'} not saved — ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
  }
  if (applied.length > 0) {
    addLogEntry('narration', `Updated ${applied.length} field${applied.length === 1 ? '' : 's'} for ${npc.bible?.name || 'this character'}.`);
  }
  rerenderStudio();
  if (applied.length > 0 || errors.length > 0) {
    saveAtBoundary('classifieds-studio-edit', gs).catch(() => {});
  }
}

// --- Live character rewrite (AI-Assisted Character Generation Phase 6) ---
// D12: a live NPC may be FULLY rewritten, behind an explicit confirm naming
// what moves and what does not. Generating never writes anything by itself —
// it computes a diff against the current bible and holds it on
// `studio.pendingRewrite` until Apply or Cancel. D13: the diff is applied
// through the exact same gate as a manual edit (applyStudioEditList above).

function doClassifiedsStudioRewriteToggle() {
  const studio = studioState(currentGameState);
  if (!studio.rewriteConcept) studio.rewriteConcept = defaultConceptState();
  const live = readConceptControls('studio-rewrite');
  if (live) studio.rewriteConcept.text = live.text;
  studio.rewriteConcept.open = !studio.rewriteConcept.open;
  rerenderStudio();
}

async function doClassifiedsStudioConceptRewrite() {
  const gs = currentGameState;
  const studio = studioState(gs);
  const npcId = studio.viewingNpcId;
  const npc = npcId ? gs.npcs[npcId] : null;
  if (!npc) return;
  if (!studio.rewriteConcept) studio.rewriteConcept = defaultConceptState();
  const state = studio.rewriteConcept;
  const live = readConceptControls('studio-rewrite');
  if (!live) return;
  state.text = live.text;
  state.lastError = '';
  if (!live.text) {
    state.lastError = 'Describe who they are now.';
    rerenderStudio();
    return;
  }

  state.busy = true;
  studio.pendingRewrite = null;
  rerenderStudio();
  try {
    const result = await fillFromConcept(live.text, 'npcRewrite', {
      existingName: npc.bible?.name,
      usedNames: usedNpcNames ? [...usedNpcNames(gs)].filter(n => n !== npc.bible?.name) : [],
    });
    if (!result.ok) { state.lastError = result.reason; return; }

    // The diff, built BEFORE anything is written: conceptToEditList already
    // skips paths that would be no-ops, so what survives here is exactly
    // what would change. oldValue is captured now, from the untouched npc —
    // capturing it after Apply would show "old" and "new" as identical.
    const edits = conceptToEditList(result.draft, npc);
    if (edits.length === 0) {
      state.lastError = 'That reads the same as who they already are — nothing to change.';
      return;
    }
    studio.pendingRewrite = {
      edits: edits.map(e => ({ path: e.path, oldValue: studioGetPath(npc, e.path), newValue: e.value })),
      touchesAppearance: conceptEditsTouchAppearance(edits),
    };
  } catch (e) {
    state.lastError = `Something went wrong applying that: ${(e && e.message) || 'unknown error'}`;
  } finally {
    state.busy = false;
    rerenderStudio();
  }
}

function doClassifiedsStudioRewriteCancel() {
  const studio = studioState(currentGameState);
  studio.pendingRewrite = null;
  rerenderStudio();
}

function doClassifiedsStudioRewriteApply() {
  const gs = currentGameState;
  const studio = studioState(gs);
  const npcId = studio.viewingNpcId;
  const npc = npcId ? gs.npcs[npcId] : null;
  const pending = studio.pendingRewrite;
  if (!npc || !pending) return;

  const edits = pending.edits.map(e => ({ path: e.path, value: e.newValue }));
  const { applied, errors } = applyStudioEditList(gs, npc, edits);

  // D14: bump ONLY when the applied set actually touched appearance — decided
  // from what was APPLIED, not from the pre-apply diff, so a physical edit
  // that failed validation (and therefore never landed) cannot bump the
  // portrait cache key for nothing.
  if (conceptEditsTouchAppearance(applied)) {
    npc.bible.genSeed = Math.floor(Math.random() * 1000000);
  }

  studio.pendingRewrite = null;
  if (studio.rewriteConcept) { studio.rewriteConcept.text = ''; studio.rewriteConcept.open = false; }

  if (errors.length > 0) {
    addLogEntry('system', `Studio: ${errors.length} field${errors.length === 1 ? '' : 's'} not applied — ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
  }
  if (applied.length > 0) {
    addLogEntry('narration', `Rewrote ${applied.length} field${applied.length === 1 ? '' : 's'} for ${npc.bible?.name || 'this character'}.`);
  }
  rerenderStudio();
  if (applied.length > 0 || errors.length > 0) {
    saveAtBoundary('classifieds-studio-rewrite', gs).catch(() => {});
  }
}

function doImOpenThread(npcId) {
  if (!npcId) return;
  currentGameState.world.computer.apps.im.viewingNpcId = npcId;
  const thread = currentGameState.world.computer.apps.im.threads[npcId];
  if (thread) thread.unread = 0;
  // No switchScreen — Messages is a single always-both-panes screen now
  // (renderMessages, RENDER.COMPUTER); selecting a thread just changes
  // which conversation shows in the right-hand pane. That pane is SHARED
  // by both devices — the phone renders the same renderer via
  // renderPhoneContent — so every surface currently showing Messages must
  // repaint. A phone left open on the app only re-renders when
  // renderPhoneScreen runs, which was the 2026-08-17 audit's U1 bug (a
  // phone thread click never took effect). Both calls are cheap no-ops
  // when their device is off/closed.
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// Bug report (2026-08-26): the phone's Messages screen shows either the
// contact list or the open thread, never both (renderMessages) — this is
// the "back" side of that, clearing which thread is open so the next
// render falls back to the list. Never reachable from the computer window,
// which keeps both panes on screen and has no back control wired to it.
function doImCloseThread() {
  currentGameState.world.computer.apps.im.viewingNpcId = null;
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
}

// Guard so concurrent Send clicks/races can't fire overlapping sends —
// the LLM call inside resolveImReply can take up to a minute, and without
// this each extra click sent the same message again (the input wasn't
// cleared yet) and got a separate reply.
let imSending = false;

// Bug report (2026-08-26): which NPCs currently have a reply in flight.
// RENDER.COMPUTER's renderMessages reads this directly (same
// typeof-guarded cross-file pattern as homePlacementUI) to decide whether
// to draw the "is typing…" dots — so the indicator is derived from state
// every render, not injected imperatively into one specific DOM snapshot.
// That's what makes it survive a rebuild: switching to another contact and
// back while a reply is still pending re-renders the thread from this set,
// so the dots are exactly where they'd be if the DOM had never rebuilt.
const IM_PENDING_REPLY = new Set();

// Which DOM subtree an IM interaction belongs to. The computer window and
// the phone app BOTH render the shared renderMessages UI (including a
// duplicate id="cs-chat-input"), so every part of the send path must read
// and write within the device that actually sent — getElementById would
// always return the computer's copy whenever both were in the DOM
// (2026-08-17 audit, U2).
function imScopeForDevice(device) {
  return device === 'phone' ? document.getElementById('phone-screen') : document;
}

async function doImSend(npcId, device) {
  if (!npcId || imSending) return;
  const scope = imScopeForDevice(device);
  const input = scope?.querySelector('#cs-chat-input');
  const text = input?.value.trim();
  if (!text) return;
  // Clear the input and set the guard IMMEDIATELY, before any await —
  // this is what stops a second click in the same tick from reading the
  // same text and firing a duplicate send.
  if (input) input.value = '';
  // Bug report (2026-08-26): Enter-to-send never blurs the input (a click
  // on a separate Send button would, but Enter fires this handler straight
  // from the input's own keydown), so document.activeElement stayed this
  // input through the entire send. renderWindows' typingHere guard exists
  // to protect a mid-keystroke input from an UNRELATED background
  // re-render (needs heartbeat, an NPC arriving home) — it can't tell that
  // apart from "the input's own action just fired," so every render below
  // was silently skipped on the computer window until something else (a
  // click that moved focus away, like reopening the thread) forced a
  // rebuild. The value is already captured above, so there's nothing left
  // in this input worth protecting — blur it and let renders land, then
  // refocus the fresh one once the whole exchange is done.
  input?.blur();
  imSending = true;
  IM_PENDING_REPLY.add(npcId);
  const sendBtn = scope?.querySelector('.im-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

  // Append the player's message and re-render immediately so their bubble
  // appears instantly — we do NOT block the UI while waiting for the NPC
  // reply. No global loading overlay (the whole point: keep typing/reading).
  const appended = appendPlayerImMessage(currentGameState, npcId, text);
  if (!appended.ok) { addLogEntry('system', appended.reason); imSending = false; IM_PENDING_REPLY.delete(npcId); if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; } return; }
  // The thread is shared state, so both devices showing Messages repaint;
  // each render call is a no-op when its device is off/closed. IM_PENDING_REPLY
  // already has this npcId, so renderMessages paints the typing dots as
  // part of this same pass — no separate imperative injection needed.
  renderComputerScreen(currentGameState);
  if (typeof renderPhoneScreen === 'function') renderPhoneScreen(currentGameState);
  // Rendering rebuilt the DOM, so the send button we disabled above is
  // gone — re-disable the fresh one to show a reply is in flight.
  // (imSending already guards against duplicate sends.)
  const pendingBtn = scope?.querySelector('.im-send-btn');
  if (pendingBtn) { pendingBtn.disabled = true; pendingBtn.textContent = 'Sending…'; }

  try {
    const result = await resolveImReply(currentGameState, npcId, text);
    if (!result.ok) { addLogEntry('system', result.reason); }
    // Clear BEFORE the render below so this same pass both drops the typing
    // dots and paints the reply — never two separate visible steps.
    IM_PENDING_REPLY.delete(npcId);
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
    IM_PENDING_REPLY.delete(npcId);
    imSending = false;
    // Re-enable the send button (the render calls may have rebuilt the
    // DOM, so find it fresh within the same device scope).
    const btn = scope?.querySelector('.im-send-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    // Refocus the input for rapid follow-up messages.
    const freshInput = scope?.querySelector('#cs-chat-input');
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
    // audit finding #12: capture the real return instead of separately
    // hand-building an identical-looking literal for the outcome window —
    // the two can no longer drift apart (Design Invariant 1).
    const streamResult = applyEffects([{ type: 'ADJUST_NEED', params: { who: 'player', need: 'mood', delta: String(result.show.moodGain) } }], effCtx);

    await advanceAndResolve(result.show.episodeTicks);
    currentGameState.player = decayPlayerNeeds(currentGameState.player, result.show.episodeTicks * CLOCK.tickMinutes, currentGameState);
    addLogEntry('narration', `You watch episode ${result.episode} of ${result.show.label}.`);
    renderComputerScreen(currentGameState);
    render(currentGameState, currentSceneState);
    await saveAtBoundary('stream-watch', currentGameState);
    // action-outcome-window-plan Phase 6 (D3): watching an episode is a
    // real, time-costing action with a mood delta. The strip reads the mood
    // effect it actually applied; the frame is a reused still per show (D5).
    await presentActionOutcome(currentGameState, {
      id: 'stream.watch', label: 'Stream',
      outcomeWindow: {
        tier: 'C', trigger: 'player', dismissal: 'tap',
        heading: result.show.label,
        image: { kind: 'archetype', variant: 'stream', phrase: 'curled up watching a show on a screen, the glow on their face' },
      },
    }, {
      applied: (streamResult && streamResult.applied) || [],
      narration: `You watch episode ${result.episode} of ${result.show.label}.`,
      minutesSpent: result.show.episodeTicks * CLOCK.tickMinutes,
    });
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
  render(currentGameState, currentSceneState);
}

// BrineOS Phase 7: toggle a single bill's autopay flag. Rendered on both
// devices for free (shared bills-dashboard renderer, Phase 1/5).
// Bug report (2026-08-26): this only ever called renderComputerScreen, so
// toggling autopay from the PHONE's Bills screen updated the state but left
// the phone's DOM showing the stale on/off label until something else
// forced a rebuild (e.g. reopening the app) — every other bills/invest
// handler in this file calls the full render() too (see doBillsPay,
// doInvestBuy) precisely so renderPhoneScreen runs alongside it.
async function doBillsToggleAutopay(billId) {
  if (!billId) return;
  const result = toggleBillAutopay(currentGameState, billId);
  if (!result.ok) { addLogEntry('system', result.reason); return; }
  addLogEntry('system', `Autopay ${result.autopay ? 'enabled' : 'disabled'} for ${BILL_DEFS[billId].label}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
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
  // action-outcome-window-plan Phase 6 (D3): booking the planned work is a
  // real scheduled commitment. The strip reads the upfront cost; the frame is
  // a reused "planned renovation" archetype (the job repeats, D5).
  await presentActionOutcome(currentGameState, {
    id: 'upgrades.book', label: 'Book Work',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: `Work booked — ${def.label}`,
      image: { kind: 'archetype', variant: 'renovation', phrase: 'a contractor\'s planning sketch and measurements for a renovation, blueprints on the table' },
    },
  }, { applied: [{ type: 'SPEND_MONEY', params: { amount: result.cost || 0, reason: `${def.label} booked` } }], narration: `The crew finishes ${formatDate(result.etaDay)}.`, minutesSpent: 0 });
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
  addLogEntry('narration', `You book the ${def.label} — ${result.cost.toLocaleString()} paid upfront. The crew finishes ${formatDate(result.etaDay)}.`);
  renderComputerScreen(currentGameState);
  render(currentGameState, currentSceneState);
  await saveAtBoundary('structural-book', currentGameState);
  // action-outcome-window-plan Phase 6 (D3): booking structural work is a
  // real scheduled commitment. The strip reads the upfront cost; the frame is
  // a reused "planned structural work" archetype (the job repeats, D5).
  await presentActionOutcome(currentGameState, {
    id: 'upgrades.book-structural', label: 'Book Structural Work',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: `Work booked — ${def.label}`,
      image: { kind: 'archetype', variant: 'renovation', phrase: 'a contractor\'s plan for knocking through a wall, measurements and layout sketched' },
    },
  }, { applied: [{ type: 'SPEND_MONEY', params: { amount: result.cost || 0, reason: `${def.label} booked` } }], narration: `The crew finishes ${formatDate(result.etaDay)}.`, minutesSpent: 0 });
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
  // action-outcome-window-plan Phase 6 (D3): a repair is the moment the
  // facility actually gets fixed. The strip reads the condition restored; the
  // frame is fresh (this repair, once).
  await presentActionOutcome(currentGameState, {
    id: 'upgrades.repair', label: 'Repair',
    outcomeWindow: {
      tier: 'C', trigger: 'player', dismissal: 'tap',
      heading: `${def.label} restored`,
      image: { kind: 'instance', phrase: `a repaired ${def.label.toLowerCase()} looking good as new` },
    },
  }, { applied: [{ type: 'SPEND_MONEY', params: { amount: result.cost || 0, reason: `${def.label} repair` } }], narration: `You repair the ${def.label} — restored ${result.conditionRestored} condition for ${result.cost}.`, minutesSpent: 0 });
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
  if (typeof presentWorldGate !== 'function') return;

  const browser = gameState.world.computer.apps.browser;
  const clips = browser.afterHoursClips;
  const clip = clips?.find(c => c.id === browser.afterHoursWatching);
  const clipTitle = clip?.title || 'something';
  const clipCategory = clip?.category || browser.afterHoursCategory || 'adult content';

  // Pre-generated text for this NPC shows instantly; otherwise generate
  // on-demand into the window's narration, with a "footsteps..." line first.
  let text = null;
  if (pendingInterruption && pendingInterruption.npcId === npcId) {
    text = pendingInterruption.text;
    pendingInterruption = null;
  }
  const heading = npc.bible.name || 'Someone';
  if (!text) {
    const narration = document.getElementById('aw-narration');
    if (narration) narration.textContent = '...';
    try {
      const prompt = buildInterruptionPrompt(gameState, npcId, { title: clipTitle, category: clipCategory }, doorState);
      text = (await root.generateText(prompt)).trim();
    } catch (e) {
      text = buildInterruptionFallback(npc, doorState);
    }
  }

  // The world opened this (the player was walked in on), so it is a gate
  // (D7): it asks rather than reporting. The two answers are the old bubble's
  // "Sorry!" and "Own it", and the consequences applied are EXACTLY the old
  // bubble's — a gate does not invent a new cost, it only changes the surface
  // (D18: byte-identical behavior, only the DOM moved).
  const answer = await presentWorldGate(gameState, {
    tier: 'B',
    heading,
    narration: text,
    defaultChoice: 'sorry',
    choices: [
      { id: 'sorry', label: 'Sorry!' },
      { id: 'own_it', label: 'Own it' },
    ],
  });
  if (answer === null) return;
  applyInterruptionConsequences(gameState, npcId, doorState, answer);
  await saveAtBoundary('ah-interrupt', gameState);
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
// catches an NPC peeping on them. Renders through the shared action-window
// gate (Phase 4, D18) instead of a bespoke bubble. The NPC's line
// is AI-generated via buildNpcCaughtPeepingPrompt. Player response options
// are "What are you doing?!" (confront), "...come in." (invite), and
// "Get out." (cold) — each applies different tension/affection deltas.

async function showNpcCaughtPeepingBubble(gameState, npcId, playerState) {
  const npc = gameState.npcs[npcId];
  if (!npc) return;
  if (typeof presentWorldGate !== 'function') return;

  // Generate the NPC's reaction text into the window's narration, with a
  // "..." line first.
  const narration = document.getElementById('aw-narration');
  if (narration) narration.textContent = '...';
  let text = null;
  try {
    const prompt = buildNpcCaughtPeepingPrompt(gameState, npcId, playerState);
    text = (await root.generateText(prompt)).trim();
  } catch (e) {
    text = buildNpcCaughtPeepingFallback(npc);
  }

  // The world opened this (an NPC was caught peeping), so it is a gate
  // (D7): it asks rather than reporting. The three answers are the old
  // bubble's (confront / invite / cold), and the consequences applied are
  // EXACTLY the old bubble's (D18: byte-identical behavior, only the DOM
  // moved).
  const answer = await presentWorldGate(gameState, {
    tier: 'B',
    heading: npc.bible.name || 'Someone',
    narration: text,
    defaultChoice: 'confront',
    choices: [
      { id: 'confront', label: NPC_PEEP_RESPONSES.confront.label },
      { id: 'invite', label: NPC_PEEP_RESPONSES.invite.label },
      { id: 'cold', label: NPC_PEEP_RESPONSES.cold.label },
    ],
  });
  if (answer === null) return;
  applyNpcPeepConsequences(gameState, npcId, answer, playerState);
  await saveAtBoundary('npc-peep-caught', gameState);
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
