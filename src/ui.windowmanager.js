// ===== SECTION: UI.WINDOWMANAGER =====
// Raw mouse-gesture layer for dragging/resizing windows — doesn't fit the
// data-action click-dispatch model (UI's handleAction), since a drag is a
// continuous gesture across many mousemove events, not one discrete
// intent. Module-level `dragGesture` is transient interaction state, not
// gameState — matches the existing precedent that modal-open/loading-
// overlay state also lives outside gameState (see UI's closeModal/
// showLoading). The DOM only diverges from state *during* an in-progress
// gesture; RENDER.DESKTOP's renderWindows skips writing position/size for
// whichever window is mid-gesture so a background render can't fight it,
// and mouseup below is the one place that commits the final rect back
// into gameState.world.computer.

let dragGesture = null;

function initWindowManagerHandlers() {
  document.addEventListener('mousedown', onWindowManagerMouseDown);
  document.addEventListener('mousemove', onWindowManagerMouseMove);
  document.addEventListener('mouseup', onWindowManagerMouseUp);
}

function cssPxVar(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Any mousedown inside a window focuses it — real OS behavior, and cheap
// direct DOM writes here (not a full renderComputerScreen) so focusing
// doesn't tear down and rebuild the very node a drag is about to start
// on.
function focusWindowVisually(appId) {
  const computer = currentGameState.world.computer;
  focusWindow(currentGameState, appId);
  for (const node of document.querySelectorAll('.win')) {
    node.removeAttribute('data-focused');
    if (node.dataset.app === appId) node.style.zIndex = computer.windows[appId].zIndex;
  }
  document.getElementById(`win-${appId}`)?.setAttribute('data-focused', '');
  for (const btn of document.querySelectorAll('.taskbar-btn')) btn.removeAttribute('data-focused');
  document.querySelector(`.taskbar-btn[data-app="${appId}"]`)?.setAttribute('data-focused', '');
}

function onWindowManagerMouseDown(e) {
  if (!currentGameState?.world?.computer) return;
  const winNode = e.target.closest('.win');
  if (!winNode) return;
  const appId = winNode.dataset.app;
  const win = currentGameState.world.computer.windows[appId];
  if (!win) return;

  if (currentGameState.world.computer.focusedAppId !== appId) focusWindowVisually(appId);

  const resizeHandle = e.target.closest('.win-resize-handle');
  if (resizeHandle && !win.maximized) {
    dragGesture = { mode: 'resize', appId, node: winNode, startX: e.clientX, startY: e.clientY, startRect: { ...win.rect } };
    e.preventDefault();
    return;
  }

  const titlebar = e.target.closest('.win-titlebar');
  const onControl = e.target.closest('.win-controls');
  if (titlebar && !onControl && !win.maximized) {
    dragGesture = { mode: 'drag', appId, node: winNode, startX: e.clientX, startY: e.clientY, startRect: { ...win.rect } };
    e.preventDefault();
  }
}

function onWindowManagerMouseMove(e) {
  if (!dragGesture) return;
  const dx = e.clientX - dragGesture.startX;
  const dy = e.clientY - dragGesture.startY;
  const node = dragGesture.node;

  if (dragGesture.mode === 'drag') {
    const x = Math.max(0, dragGesture.startRect.x + dx);
    const y = Math.max(0, dragGesture.startRect.y + dy);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  } else if (dragGesture.mode === 'resize') {
    const minW = cssPxVar('--win-min-w', 360);
    const minH = cssPxVar('--win-min-h', 240);
    const w = Math.max(minW, dragGesture.startRect.w + dx);
    const h = Math.max(minH, dragGesture.startRect.h + dy);
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
  }
}

async function onWindowManagerMouseUp() {
  if (!dragGesture) return;
  const { mode, appId, node, startRect } = dragGesture;
  const win = currentGameState?.world?.computer?.windows[appId];
  dragGesture = null;
  if (!win) return;

  if (mode === 'drag') {
    win.rect.x = parseFloat(node.style.left);
    win.rect.y = parseFloat(node.style.top);
    if (!Number.isFinite(win.rect.x)) win.rect.x = startRect.x;
    if (!Number.isFinite(win.rect.y)) win.rect.y = startRect.y;
  } else if (mode === 'resize') {
    win.rect.w = parseFloat(node.style.width);
    win.rect.h = parseFloat(node.style.height);
    if (!Number.isFinite(win.rect.w)) win.rect.w = startRect.w;
    if (!Number.isFinite(win.rect.h)) win.rect.h = startRect.h;
  }
  renderComputerScreen(currentGameState);
  await saveAtBoundary('computer-window-move', currentGameState);
}

// Registered here at this file's own load time, not from inside UI's
// boot() — boot() is async and, once its first `await` yields, its
// continuation runs as a microtask that finishes draining (per the HTML
// spec's per-script microtask checkpoint) before the parser even starts
// the *next* <script> tag. Every function boot() calls directly already
// lives in a file loaded before ui.js for exactly this reason; calling
// this file's own initializer from inside boot() would race that and
// fail silently (ReferenceError inside an un-awaited async call, since
// nothing holds onto boot()'s promise). Attaching from top-level code
// here instead runs it exactly when this script finishes loading, same
// as ui.js's own trailing `boot();` call.
initWindowManagerHandlers();

// ===== /SECTION: UI.WINDOWMANAGER =====
