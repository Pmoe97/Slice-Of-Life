// ===== SECTION: RENDER.DESKTOP =====
// The windowed-desktop shell around the computer's apps: wallpaper, a
// desktop icon grid, a taskbar with a Start menu, and real overlapping
// windows (drag/resize handled by UI.WINDOWMANAGER; this file only ever
// reads gameState.world.computer and draws it — same hard rule as
// RENDER.COMPUTER, see that file's header). RENDER.COMPUTER still owns
// COMPUTER_RENDERERS and every per-app screen renderer; this file owns
// everything *around* a window's body — chrome the pre-Phase-2 shim
// didn't have at all (a single shared full-bleed panel with a tab bar).

// The entry point RENDER (render.js) calls unconditionally on every
// render pass of the whole game, not just while the computer is open —
// skip the entire rebuild below when it's powered off rather than doing
// real DOM work nobody can see. (#computer-screen is CSS-hidden either
// way; this just avoids the wasted work, matching the "no idle desktop
// rebuilds" fix noted in COMPUTER's file header.)
function renderComputerScreen(gs) {
  const root = document.getElementById('computer-screen');
  if (!root || gs.world.computer.power !== 'on') return;

  renderTaskbar(gs);
  renderDesktopIcons(gs);
  renderStartMenu(gs);
  renderWindows(gs);
}

function renderDesktopIcons(gs) {
  const container = document.getElementById('desktop-icons');
  if (!container) return;
  container.innerHTML = '';
  for (const app of Object.values(APP_DEFS)) {
    const tile = document.createElement('div');
    tile.className = 'desktop-icon';
    tile.setAttribute('data-action', 'computer.open-app');
    tile.setAttribute('data-app', app.id);
    tile.innerHTML = `${svgIcon(app.id)}<span class="desktop-icon-label">${app.label}</span>`;
    container.appendChild(tile);
  }
}

// Same app list as the desktop icons — Start is just another way to
// reach them, not a different roster. Content is always rebuilt here;
// open/closed is a DOM-only toggle on #start-menu's `hidden` attribute
// (UI.COMPUTER's doComputerToggleStart), same as the existing modal-open
// precedent — not gameState, since which menus happen to be open isn't
// game data.
function renderStartMenu(gs) {
  const menu = document.getElementById('start-menu');
  if (!menu) return;
  menu.innerHTML = '';
  for (const app of Object.values(APP_DEFS)) {
    const item = document.createElement('div');
    item.className = 'start-menu-item';
    item.setAttribute('data-action', 'computer.open-app');
    item.setAttribute('data-app', app.id);
    item.innerHTML = `${svgIcon(app.id)}<span class="start-menu-item-label">${app.label}</span>`;
    menu.appendChild(item);
  }
}

function renderTaskbar(gs) {
  const clockEl = document.getElementById('cs-clock');
  if (clockEl) clockEl.textContent = `Day ${gs.meta.clock.day} — ${formatTime(gs.meta.clock.minutes)}`;

  const startBtn = document.getElementById('taskbar-start-btn');
  if (startBtn && !startBtn.childElementCount) {
    startBtn.innerHTML = svgIcon('start') + '<span class="taskbar-start-label">Start</span>';
  }

  const running = document.getElementById('taskbar-running');
  if (!running) return;
  running.innerHTML = '';
  const computer = gs.world.computer;
  for (const app of Object.values(APP_DEFS)) {
    const win = computer.windows[app.id];
    if (!win) continue;
    const btn = document.createElement('button');
    btn.className = 'taskbar-btn';
    btn.setAttribute('data-action', 'computer.taskbar-click');
    btn.setAttribute('data-app', app.id);
    if (computer.focusedAppId === app.id && !win.minimized) btn.setAttribute('data-focused', '');
    if (win.minimized) btn.setAttribute('data-minimized', '');
    btn.innerHTML = `${svgIcon(app.id)}<span class="taskbar-btn-label">${app.label}</span>`;
    running.appendChild(btn);
  }
}

// Builds the static shell of one window once; renderWindows below never
// destroys and recreates it while the window stays open, only updates its
// position/size/content — same "keyed, not torn down" idea as everywhere
// else state→DOM diffing matters in this codebase.
function buildWindowShell(appId, app) {
  const node = document.createElement('div');
  node.className = 'win';
  node.id = `win-${appId}`;
  node.dataset.app = appId;
  node.innerHTML = `
    <div class="win-titlebar">
      ${svgIcon(appId, 'win-titlebar-icon')}
      <span class="win-title">${app.label}</span>
      <div class="win-controls">
        <button class="win-control-btn" data-action="computer.window-minimize" data-app="${appId}" aria-label="Minimize">${svgIcon('minimize')}</button>
        <button class="win-control-btn" data-action="computer.window-maximize" data-app="${appId}" aria-label="Maximize">${svgIcon('maximize')}</button>
        <button class="win-control-btn win-control-close" data-action="computer.window-close" data-app="${appId}" aria-label="Close">${svgIcon('close')}</button>
      </div>
    </div>
    <nav class="win-screennav" id="win-screennav-${appId}"></nav>
    <div class="win-body"></div>
    <div class="win-resize-handle" data-edge="se" data-app="${appId}"></div>
  `;
  return node;
}

// Mirrors RENDER.COMPUTER's old singleton renderScreenNav, scoped to one
// window's own sub-nav row instead of a single shared one — a screen
// belongs to a specific app's window now that several can be open.
function renderWindowScreenNav(gs, appId, app) {
  const nav = document.getElementById(`win-screennav-${appId}`);
  if (!nav) return;
  nav.innerHTML = '';
  const win = gs.world.computer.windows[appId];
  const entries = Object.entries(app.screens).filter(([, s]) => !s.hideFromNav);
  if (entries.length < 2) return;
  for (const [screenId, screen] of entries) {
    const btn = document.createElement('button');
    btn.className = 'win-screennav-btn';
    btn.setAttribute('data-action', 'computer.open-screen');
    btn.setAttribute('data-app', appId);
    btn.setAttribute('data-screen', screenId);
    if (win.screenId === screenId) btn.setAttribute('data-current', '');
    btn.textContent = screen.label || screenId;
    nav.appendChild(btn);
  }
}

// Keyed diff by appId: remove nodes for windows that closed, create-or-
// reuse a shell per open window, then rebuild just that window's body
// content. Position/size/z-index are skipped for whichever window
// UI.WINDOWMANAGER is mid-drag/resize on (`dragGesture`, declared in that
// file but a bare cross-script identifier like every other top-level
// const/let here — see ARCHITECTURE.md's P4 notes on that pattern) so a
// render triggered by something unrelated (an NPC tick, the clock) can't
// yank a window out from under an in-progress gesture.
function renderWindows(gs) {
  const container = document.getElementById('computer-windows');
  if (!container) return;
  const computer = gs.world.computer;

  for (const node of [...container.children]) {
    if (!computer.windows[node.dataset.app]) node.remove();
  }

  for (const [appId, win] of Object.entries(computer.windows)) {
    const app = APP_DEFS[appId];
    if (!app) continue;

    let node = document.getElementById(`win-${appId}`);
    if (!node) {
      node = buildWindowShell(appId, app);
      container.appendChild(node);
    }

    if (win.minimized) node.setAttribute('data-minimized', '');
    else node.removeAttribute('data-minimized');
    if (win.maximized) node.setAttribute('data-maximized', '');
    else node.removeAttribute('data-maximized');
    if (computer.focusedAppId === appId) node.setAttribute('data-focused', '');
    else node.removeAttribute('data-focused');

    const dragging = typeof dragGesture !== 'undefined' && dragGesture && dragGesture.appId === appId;
    if (!dragging) {
      if (win.maximized) {
        node.style.left = '0px'; node.style.top = '0px';
        node.style.width = '100%'; node.style.height = '100%';
      } else {
        node.style.left = `${win.rect.x}px`;
        node.style.top = `${win.rect.y}px`;
        node.style.width = `${win.rect.w}px`;
        node.style.height = `${win.rect.h}px`;
      }
      node.style.zIndex = win.zIndex;
    }

    renderWindowScreenNav(gs, appId, app);

    const body = node.querySelector('.win-body');
    body.innerHTML = '';
    const screen = app.screens[win.screenId];
    if (!screen) { body.innerHTML = '<p class="dim">Unknown screen.</p>'; continue; }
    const renderer = COMPUTER_RENDERERS[screen.renderer];
    if (renderer) renderer(body, gs, app, screen);
    else body.innerHTML = `<p class="dim">No renderer for "${screen.renderer}".</p>`;
  }
}

// ===== /SECTION: RENDER.DESKTOP =====
