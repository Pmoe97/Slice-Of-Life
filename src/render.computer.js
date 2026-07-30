// ===== SECTION: RENDER.COMPUTER =====
// State → DOM for the computer screen, mirroring RENDER's own rules:
// idempotent, no state mutation, no direct kv access. Everything drawn
// here comes from gameState.world.computer (COMPUTER) — see that file's
// header for why that's a hard rule, not a preference.
//
// A small set of generic screen renderers (COMPUTER_RENDERERS), keyed by
// name from an app's screen definition (DEFS.COMPUTER) — a new app is
// data (an APP_DEFS entry) plus whichever of these renderers fit its
// screens, not new DOM code. Only `dashboard` and `catalog` exist so far
// (what WorkHub needs); more join as later apps need them.

function renderComputerScreen(gs) {
  const root = document.getElementById('computer-screen');
  if (!root) return;
  renderComputerChrome(gs);

  const body = document.getElementById('cs-body');
  if (!body) return;
  body.innerHTML = '';

  const view = gs.world.computer.view;
  const app = APP_DEFS[view.appId];
  if (!app) { body.innerHTML = '<p class="dim">Pick an app above.</p>'; return; }
  const screen = app.screens[view.screenId];
  if (!screen) { body.innerHTML = '<p class="dim">Unknown screen.</p>'; return; }

  const renderer = COMPUTER_RENDERERS[screen.renderer];
  if (renderer) renderer(body, gs, app, screen);
  else body.innerHTML = `<p class="dim">No renderer for "${screen.renderer}".</p>`;
}

function renderComputerChrome(gs) {
  const clockEl = document.getElementById('cs-clock');
  if (clockEl) clockEl.textContent = `Day ${gs.meta.clock.day} — ${formatTime(gs.meta.clock.minutes)}`;

  const tabsEl = document.getElementById('cs-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const app of Object.values(APP_DEFS)) {
    const btn = document.createElement('button');
    btn.className = 'cs-tab';
    btn.setAttribute('data-action', 'computer.open-app');
    btn.setAttribute('data-app', app.id);
    if (gs.world.computer.view.appId === app.id) btn.setAttribute('data-current', '');
    btn.textContent = app.label;
    tabsEl.appendChild(btn);
  }
}

const COMPUTER_RENDERERS = {
  dashboard: renderDashboard,
  catalog: renderCatalog,
  list: renderList,
};

// A dashboard is just its named panels, drawn in order — DASHBOARD_PANELS
// is its own small named registry rather than a per-app switch, so a
// panel (e.g. "job.summary") is reusable across apps that want it.
function renderDashboard(body, gs, app, screen) {
  for (const panelId of screen.panels || []) {
    const fn = DASHBOARD_PANELS[panelId];
    if (fn) body.appendChild(fn(gs));
  }
}

function makePanel(html) {
  const div = document.createElement('div');
  div.className = 'cs-panel';
  div.innerHTML = html;
  return div;
}

const DASHBOARD_PANELS = {
  'job.summary': (gs) => {
    const work = gs.world.computer.apps.work;
    const job = JOB_DEFS[work.jobId];
    if (!job) {
      const panel = makePanel('<h3>Unemployed</h3><p class="dim tiny">Browse the job board to apply.</p>');
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.setAttribute('data-action', 'computer.open-screen');
      btn.setAttribute('data-screen', 'board');
      btn.textContent = 'Job Board';
      panel.appendChild(btn);
      return panel;
    }
    return makePanel(`<h3>${job.title}</h3><p class="tiny">Reputation ${Math.round((work.reputation || 0) * 100)}% — Strikes ${work.strikes || 0}/${job.firingStrikes}</p>`);
  },
  'job.backlog': (gs) => {
    const work = gs.world.computer.apps.work;
    if (!work.jobId) return makePanel('');
    const done = work.backlog.filter(t => t.done).length;
    const panel = makePanel(`<h3>Today's Tasks</h3><p class="tiny">${done}/${work.backlog.length} complete</p>`);
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'computer.work-block');
    btn.textContent = 'Work a Block';
    if (done >= work.backlog.length) btn.disabled = true;
    panel.appendChild(btn);
    return panel;
  },
  'job.earnings': (gs) => {
    const work = gs.world.computer.apps.work;
    if (!work.jobId) return makePanel('');
    return makePanel(`<h3>Today</h3><p class="tiny">${work.todayBlocks || 0} blocks — $${work.todayEarned || 0} earned</p>`);
  },
};

// screen.source names a data source by string (e.g. 'JOB_DEFS') — a light
// indirection so APP_DEFS stays pure data (a def doesn't import anything,
// it just names what it wants). Resolved through CATALOG_SOURCES rather
// than `window[screen.source]`: top-level `const`/`let` bindings in a
// classic script are NOT window properties (only `var`/function
// declarations are), so a bare global-property lookup silently returns
// undefined for every data registry in this codebase — this cost real
// debugging time to find; see ARCHITECTURE.md's P4 notes.
const CATALOG_SOURCES = { JOB_DEFS, SHOP_CATALOG_LIST };

function renderCatalog(body, gs, app, screen) {
  const source = CATALOG_SOURCES[screen.source];
  if (!source) { body.innerHTML = '<p class="dim">Nothing here.</p>'; return; }
  const list = document.createElement('div');
  list.className = 'cs-catalog';
  for (const row of Object.values(source)) {
    const item = document.createElement('div');
    item.className = 'cs-catalog-row';
    const price = row.payPerBlock != null ? `$${row.payPerBlock}/block` : (row.price != null ? `$${row.price}` : '');
    item.innerHTML = `<span class="cs-catalog-title">${row.title || row.label}</span><span class="dim tiny">${price}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', screen.rowAction);
    btn.setAttribute('data-row-id', row.id);
    btn.textContent = screen.rowActionLabel || 'Select';
    item.appendChild(btn);
    list.appendChild(item);
  }
  body.appendChild(list);
}

// Resolves a screen's `source` two ways: a bare name ('JOB_DEFS') looks up
// CATALOG_SOURCES (static content, built once at load); a 'state:a.b.c'
// path reads live from gs.world.computer (e.g. 'state:apps.shop.cart') —
// this is how a screen shows the player's own mutable session data
// (a cart, a browser history, an IM thread) rather than a fixed catalog.
function resolveScreenSource(gs, screen) {
  if (!screen.source) return null;
  if (screen.source.startsWith('state:')) {
    return screen.source.slice(6).split('.').reduce((cur, key) => cur?.[key], gs.world.computer);
  }
  return CATALOG_SOURCES[screen.source] || null;
}

// A row list over live session data, each row optionally getting a row
// action button and the whole screen optionally getting one footer action
// (e.g. "Checkout") — used for Shop's cart today; IM's thread list and
// Browser's history will reuse it once those apps exist.
function renderList(body, gs, app, screen) {
  const items = resolveScreenSource(gs, screen) || [];
  if (items.length === 0) { body.innerHTML = `<p class="dim tiny">${screen.emptyText || 'Nothing here.'}</p>`; return; }

  const list = document.createElement('div');
  list.className = 'cs-list';
  for (const row of items) {
    list.appendChild(renderListRow(row, screen));
  }
  body.appendChild(list);

  if (screen.footerAction) {
    const footerBtn = document.createElement('button');
    footerBtn.className = 'btn';
    footerBtn.setAttribute('data-action', screen.footerAction);
    footerBtn.textContent = screen.footerActionLabel || 'Continue';
    body.appendChild(footerBtn);
  }
}

function renderListRow(row, screen) {
  const item = document.createElement('div');
  item.className = 'cs-list-row';
  const label = screen.labelFn ? screen.labelFn(row) : (row.label || row.defId || String(row));
  item.innerHTML = `<span>${label}</span>`;
  if (screen.rowAction) {
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', screen.rowAction);
    btn.setAttribute('data-row-id', row.id || row.defId || '');
    btn.textContent = screen.rowActionLabel || 'Select';
    item.appendChild(btn);
  }
  return item;
}

// ===== /SECTION: RENDER.COMPUTER =====
