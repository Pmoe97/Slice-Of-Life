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

  const view = gs.world.computer.view;
  const app = APP_DEFS[view.appId];
  renderScreenNav(gs, app);

  const body = document.getElementById('cs-body');
  if (!body) return;
  body.innerHTML = '';

  if (!app) { body.innerHTML = '<p class="dim">Pick an app above.</p>'; return; }
  const screen = app.screens[view.screenId];
  if (!screen) { body.innerHTML = '<p class="dim">Unknown screen.</p>'; return; }

  const renderer = COMPUTER_RENDERERS[screen.renderer];
  if (renderer) renderer(body, gs, app, screen);
  else body.innerHTML = `<p class="dim">No renderer for "${screen.renderer}".</p>`;
}

// A small sub-nav across the current app's own screens (Dashboard | Job
// Board, Browse | Cart, ...) — separate from cs-tabs, which switches
// between apps. Without this a screen reached only via a row action (the
// job board, a cart) had no way back except closing the whole computer;
// screens marked `hideFromNav` (e.g. Browser's single-article `site`
// screen, reached only via a Visit click) are still real screens, just
// not something you'd jump to directly.
function renderScreenNav(gs, app) {
  const nav = document.getElementById('cs-screennav');
  if (!nav) return;
  nav.innerHTML = '';
  if (!app) return;
  const entries = Object.entries(app.screens).filter(([, s]) => !s.hideFromNav);
  if (entries.length < 2) return;
  for (const [screenId, screen] of entries) {
    const btn = document.createElement('button');
    btn.className = 'cs-screennav-btn';
    btn.setAttribute('data-action', 'computer.open-screen');
    btn.setAttribute('data-screen', screenId);
    if (gs.world.computer.view.screenId === screenId) btn.setAttribute('data-current', '');
    btn.textContent = screen.label || screenId;
    nav.appendChild(btn);
  }
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
  article: renderArticle,
  applicant: renderApplicantProfile,
  chat: renderChat,
  streamly: renderStreamly,
  nile: renderNile,
  workhub: renderWorkHub,
  browser: renderBrowserHome,
};

// Rows whose def declares `requiresContentFlag` are hidden from any
// catalog/list screen unless that flag is currently on — same
// CONTENT_CONFIG mechanism P0's prompt wiring reads, applied here so a
// gated site/item never even appears rather than appearing and then
// refusing (COMPUTER's visitSite is the authoritative second check for
// anything that reaches it another way).
function filterByContentFlags(rows, gs) {
  const flags = (gs.meta.contentConfig && gs.meta.contentConfig.contentFlags) || CONTENT_CONFIG.contentFlags;
  return rows.filter(row => !row.requiresContentFlag || flags[row.requiresContentFlag]);
}

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
  'classifieds.status': (gs) => {
    const c = gs.world.computer.apps.classifieds;
    if (c.posted.active) {
      const panel = makePanel(`<h3>Listing Active</h3><p class="dim tiny">Posted Day ${c.posted.postedDay}. Check back for applicants.</p>`);
      if (c.applicants.length > 0) {
        const btn = document.createElement('button');
        btn.className = 'btn tiny';
        btn.setAttribute('data-action', 'computer.open-screen');
        btn.setAttribute('data-screen', 'applicants');
        btn.textContent = `View Applicants (${c.applicants.length})`;
        panel.appendChild(btn);
      }
      return panel;
    }
    const panel = makePanel('<h3>No Listing</h3><p class="dim tiny">Post an ad to find a new roommate.</p>');
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'classifieds.post');
    btn.textContent = 'Post Ad';
    panel.appendChild(btn);
    return panel;
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
const CATALOG_SOURCES = { JOB_DEFS, SHOP_CATALOG_LIST, SITE_DEFS_LIST, COURSE_DEFS_LIST, SERVICE_DEFS_LIST, STREAM_DEFS_LIST };

function renderCatalog(body, gs, app, screen) {
  const source = CATALOG_SOURCES[screen.source];
  if (!source) { body.innerHTML = '<p class="dim">Nothing here.</p>'; return; }
  const rows = filterByContentFlags(Object.values(source), gs);
  const list = document.createElement('div');
  list.className = 'cs-catalog';
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'cs-catalog-row';
    const price = row.payPerBlock != null ? `$${row.payPerBlock}/block`
      : row.price != null ? `$${row.price}`
      : row.cost != null ? `$${row.cost}`
      : row.costPerVisit != null ? `$${row.costPerVisit}/visit`
      : '';
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

// Resolves a screen's `source` three ways: a bare name ('JOB_DEFS') looks
// up CATALOG_SOURCES (static content, built once at load); a 'state:a.b.c'
// path reads live from gs.world.computer (e.g. 'state:apps.shop.cart'); a
// literal 'residents' pulls current resident npcIds straight from gs.npcs
// — IM's contact list is npcs, not app-session data, so it doesn't fit
// either of the other two shapes.
function resolveScreenSource(gs, screen) {
  if (!screen.source) return null;
  if (screen.source === 'residents') {
    return Object.keys(gs.npcs).filter(id => gs.npcs[id].residency.status === 'resident');
  }
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
  const items = filterByContentFlags(resolveScreenSource(gs, screen) || [], gs);
  if (items.length === 0) { body.innerHTML = `<p class="dim tiny">${screen.emptyText || 'Nothing here.'}</p>`; return; }

  const list = document.createElement('div');
  list.className = 'cs-list';
  for (const row of items) {
    list.appendChild(renderListRow(row, screen, gs));
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

// A row's data may be a bare id string (e.g. Classifieds' applicant list,
// which is just npcIds — the actual records live in gs.npcs, not in
// session state) rather than an object — `labelFn` gets `gs` as a second
// argument specifically so it can resolve a bare id into something
// displayable, and row-id falls back to the row itself when it's already
// a string.
function renderListRow(row, screen, gs) {
  const item = document.createElement('div');
  item.className = 'cs-list-row';
  const label = screen.labelFn ? screen.labelFn(row, gs) : (row.label || row.defId || String(row));
  item.innerHTML = `<span>${label}</span>`;
  if (screen.rowAction) {
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', screen.rowAction);
    btn.setAttribute('data-row-id', typeof row === 'string' ? row : (row.id || row.defId || ''));
    btn.textContent = screen.rowActionLabel || 'Select';
    item.appendChild(btn);
  }
  return item;
}

// A single open "page" — reads which one from live session state
// (apps.<app>.openSiteId) rather than view.params, matching the
// state-over-params convention `list`'s 'state:' sources already
// established. Browser is the only consumer today; a future app with its
// own "currently open thing" (e.g. IM's open thread) can follow the same
// pattern with its own openXId field rather than this renderer needing to
// know about every app.
function renderArticle(body, gs, app, screen) {
  const browser = gs.world.computer.apps.browser;
  const site = SITE_DEFS[browser?.openSiteId];
  if (!site) { body.innerHTML = '<p class="dim">No page open.</p>'; return; }

  // AfterHours: render a browsable adult content site with categories
  // and a grid of entries. Clicking an entry triggers image generation
  // and applies watch effects.
  if (site.adultContent) {
    renderAfterHours(body, gs, site);
    return;
  }

  const panel = makePanel(`<h3>${site.label}</h3><p class="dim tiny">${site.url}</p><p>${site.body}</p>`);
  body.appendChild(panel);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-screen', 'home');
  backBtn.textContent = 'Back';
  body.appendChild(backBtn);
}

// AfterHours: a proper adult content browser with category tabs and
// a grid of content cards. Each card has a title and description. The
// currently-selected category filters which entries are shown.
function renderAfterHours(body, gs, site) {
  const ac = site.adultContent;
  const browser = gs.world.computer.apps.browser;
  const selectedCat = browser.afterHoursCategory || 'featured';

  // Site header
  const header = makePanel(`<h3>${site.label}</h3><p class="dim tiny">${site.url}</p><p>${site.body}</p>`);
  body.appendChild(header);

  // Category tabs
  const catBar = document.createElement('div');
  catBar.className = 'ah-category-bar';
  for (const cat of ac.categories) {
    const tab = document.createElement('button');
    tab.className = 'ah-cat-tab' + (cat.id === selectedCat ? ' active' : '');
    tab.setAttribute('data-action', 'browser.ah-category');
    tab.setAttribute('data-row-id', cat.id);
    tab.textContent = cat.label;
    catBar.appendChild(tab);
  }
  body.appendChild(catBar);

  // Content grid
  const filtered = ac.entries.filter(e => e.category === selectedCat);
  const grid = document.createElement('div');
  grid.className = 'ah-content-grid';
  for (const entry of filtered) {
    const card = document.createElement('div');
    card.className = 'ah-card';
    card.setAttribute('data-action', 'browser.ah-watch');
    card.setAttribute('data-row-id', entry.id);

    // Thumbnail placeholder — replaced with generated image on click
    const thumb = document.createElement('div');
    thumb.className = 'ah-thumb';
    thumb.textContent = entry.title.charAt(0);
    card.appendChild(thumb);

    const title = document.createElement('div');
    title.className = 'ah-card-title';
    title.textContent = entry.title;
    card.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'ah-card-desc';
    desc.textContent = entry.desc;
    card.appendChild(desc);

    grid.appendChild(card);
  }
  body.appendChild(grid);

  // If a video is being watched, show it inline
  const watchingId = browser.afterHoursWatching;
  if (watchingId) {
    const entry = ac.entries.find(e => e.id === watchingId);
    if (entry) {
      const watchPanel = document.createElement('div');
      watchPanel.className = 'ah-watch-panel';
      watchPanel.innerHTML = `<h4>${entry.title}</h4><p class="dim tiny">${entry.desc}</p>`;
      const imgCtn = document.createElement('div');
      imgCtn.className = 'ah-watch-img';
      imgCtn.id = 'ah-watch-img';
      watchPanel.appendChild(imgCtn);
      body.appendChild(watchPanel);

      // Pure state->DOM — the actual generateImage call lives in
      // UI.COMPUTER's generateAfterHoursImageOnce, triggered once from
      // doAfterHoursWatch, never from inside a render pass (render() gets
      // called more than once per action throughout this file; a
      // render-triggered async side effect fired that many times too,
      // each racing to write into a DOM node the next render pass had
      // already torn down — see doAfterHoursWatch's comment).
      if (browser.afterHoursImgUrl) {
        imgCtn.innerHTML = `<img src="${browser.afterHoursImgUrl}" alt="${entry.title}">`;
      } else if (browser.afterHoursImgLoading) {
        imgCtn.innerHTML = '<p class="dim">Loading...</p>';
      } else {
        imgCtn.innerHTML = '<p class="dim">Image unavailable.</p>';
      }
    }
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-screen', 'home');
  backBtn.textContent = 'Back';
  body.appendChild(backBtn);
}

// Classifieds' applicant detail — same "which one is open" pattern as
// Browser's article (apps.classifieds.viewingApplicantId, not
// view.params). Shows the same bible fields the character-creation
// preview does (occupation/want/wound/blind spot), since an applicant IS
// a fully-formed prospective NPC, not a lightweight preview record.
function renderApplicantProfile(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const npc = gs.npcs[classifieds?.viewingApplicantId];
  if (!npc) { body.innerHTML = '<p class="dim">No applicant selected.</p>'; return; }
  const b = npc.bible;
  const panel = makePanel(`
    <h3>${b.name}</h3>
    <p class="dim tiny">${b.occupation.title} — ${b.occupation.hours}</p>
    <p class="tiny">${b.history}</p>
    <p class="tiny">Want: ${b.want}</p>
    <p class="tiny">Wound: ${b.wound}</p>
    <p class="tiny">Blind spot: ${b.blindSpot}</p>
  `);
  body.appendChild(panel);

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'btn';
  acceptBtn.setAttribute('data-action', 'classifieds.accept');
  acceptBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  acceptBtn.textContent = 'Accept as Roommate';
  body.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'btn btn-secondary';
  rejectBtn.setAttribute('data-action', 'classifieds.reject');
  rejectBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  rejectBtn.textContent = 'Reject';
  body.appendChild(rejectBtn);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-screen', 'applicants');
  backBtn.textContent = 'Back to List';
  body.appendChild(backBtn);
}

// A thread with one npc — message history plus an inline compose row.
// Deliberately its own text input rather than reusing the footer's
// #input-bar (which drives free-text scene actions): the two pipelines
// don't need to know about each other, and this keeps IM fully
// self-contained inside the computer screen. The input's value is read
// synchronously by UI.COMPUTER's doImSend before anything re-renders, so
// losing the DOM node on the next render (RENDER.COMPUTER always rebuilds
// cs-body) never loses what was typed.
function renderChat(body, gs, app, screen) {
  const im = gs.world.computer.apps.im;
  const npc = gs.npcs[im?.viewingNpcId];
  if (!npc) { body.innerHTML = '<p class="dim">No conversation open.</p>'; return; }

  const thread = im.threads[im.viewingNpcId] || { msgs: [] };
  const log = document.createElement('div');
  log.className = 'cs-chat-log';
  for (const m of thread.msgs) {
    const bubble = document.createElement('div');
    bubble.className = 'cs-chat-bubble';
    bubble.setAttribute('data-from', m.from);
    bubble.textContent = m.from === 'player' ? m.text : m.from === 'npc' ? `${npc.bible.name}: ${m.text}` : m.text;
    log.appendChild(bubble);
  }
  body.appendChild(log);

  const inputRow = document.createElement('div');
  inputRow.className = 'cs-chat-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'cs-chat-input';
  input.placeholder = `Text ${npc.bible.name}...`;
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn tiny';
  sendBtn.setAttribute('data-action', 'im.send');
  sendBtn.setAttribute('data-row-id', im.viewingNpcId);
  sendBtn.textContent = 'Send';
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);
}

// ===== APP-SPECIFIC VISUAL OVERHAULS (Step 4) =====
// Each app gets its own renderer that looks like the real thing, not
// a generic list of buttons. These replace the generic catalog/list/
// dashboard renderers for apps that benefit from a distinct visual
// identity.

// --- Streamly: video streaming UI with show cards, genre tags, and
// a "now watching" player panel with a progress bar. ---
function renderStreamly(body, gs, app, screen) {
  const stream = gs.world.computer.apps.stream;
  const shows = STREAM_DEFS_LIST;
  const watching = stream?.watchingShowId;

  // Now-watching panel
  if (watching && STREAM_DEFS[watching]) {
    const show = STREAM_DEFS[watching];
    const progress = stream?.watchProgress || 0;
    const pct = Math.min(100, Math.round(progress / show.episodeTicks * 100));

    const player = document.createElement('div');
    player.className = 'str-player';
    player.innerHTML = `
      <div class="str-player-header">Now Playing</div>
      <div class="str-player-title">${show.label}</div>
      <div class="str-player-genre">${show.genre}</div>
      <div class="str-progress-bar"><div class="str-progress-fill" data-fill="${pct}"></div></div>
      <div class="str-player-info">${progress}/${show.episodeTicks} ticks watched</div>
    `;
    body.appendChild(player);
  }

  // Show grid
  const grid = document.createElement('div');
  grid.className = 'str-grid';
  for (const show of shows) {
    const card = document.createElement('div');
    card.className = 'str-card';
    card.setAttribute('data-action', 'stream.watch');
    card.setAttribute('data-row-id', show.id);
    card.innerHTML = `
      <div class="str-thumb" style="background: linear-gradient(135deg, ${hashToColor(show.id)}, ${hashToColor(show.id + '2')});">
        <span class="str-thumb-label">${show.label.charAt(0)}</span>
      </div>
      <div class="str-card-title">${show.label}</div>
      <div class="str-card-genre">${show.genre}</div>
      <div class="str-card-meta">${show.episodeTicks} ticks · mood +${show.moodGain}</div>
    `;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

// --- Nile: product grid with item thumbnails, prices, and a cart
// sidebar showing items and total. ---
function renderNile(body, gs, app, screen) {
  const shop = gs.world.computer.apps.shop;
  const cart = shop?.cart || [];
  const cartTotal = cart.reduce((sum, row) => sum + (ITEM_DEFS[row.defId]?.price || 0) * row.units, 0);

  const layout = document.createElement('div');
  layout.className = 'nile-layout';

  // Product grid
  const grid = document.createElement('div');
  grid.className = 'nile-grid';
  for (const row of SHOP_CATALOG_LIST) {
    const def = ITEM_DEFS[row.id] || row;
    if (!def) continue;
    const card = document.createElement('div');
    card.className = 'nile-card';
    card.innerHTML = `
      <div class="nile-thumb" style="background: linear-gradient(135deg, ${hashToColor(def.id)}, ${hashToColor(def.id + 'x')});">
        <span class="nile-thumb-label">${def.label.charAt(0)}</span>
      </div>
      <div class="nile-card-title">${def.label}</div>
      <div class="nile-card-cat">${def.category}</div>
      <div class="nile-card-price">${def.price}</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn tiny nile-add-btn';
    btn.setAttribute('data-action', 'shop.add-to-cart');
    btn.setAttribute('data-row-id', row.id);
    btn.textContent = 'Add to Cart';
    card.appendChild(btn);
    grid.appendChild(card);
  }
  layout.appendChild(grid);

  // Cart sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'nile-cart-sidebar';
  sidebar.innerHTML = `<div class="nile-cart-header">Cart (${cartTotal})</div>`;
  if (cart.length === 0) {
    sidebar.innerHTML += '<div class="dim tiny">Empty cart.</div>';
  } else {
    for (const row of cart) {
      const def = ITEM_DEFS[row.defId];
      const item = document.createElement('div');
      item.className = 'nile-cart-item';
      item.innerHTML = `<span>${def?.label || row.defId} × ${row.units}</span><span class="dim tiny">${(def?.price || 0) * row.units}</span>`;
      const rm = document.createElement('button');
      rm.className = 'btn tiny';
      rm.setAttribute('data-action', 'shop.remove-from-cart');
      rm.setAttribute('data-row-id', row.id);
      rm.textContent = '×';
      item.appendChild(rm);
      sidebar.appendChild(item);
    }
    const checkout = document.createElement('button');
    checkout.className = 'btn nile-checkout-btn';
    checkout.setAttribute('data-action', 'shop.checkout');
    checkout.textContent = `Checkout (${cartTotal})`;
    sidebar.appendChild(checkout);
  }
  layout.appendChild(sidebar);
  body.appendChild(layout);
}

// --- WorkHub: task cards with progress, earnings summary, and a
// visual reputation bar. ---
function renderWorkHub(body, gs, app, screen) {
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
    body.appendChild(panel);
    return;
  }

  // Job header with reputation bar
  const rep = Math.round((work.reputation || 0) * 100);
  const header = document.createElement('div');
  header.className = 'wh-header';
  header.innerHTML = `
    <h3>${job.title}</h3>
    <div class="wh-rep-bar"><div class="wh-rep-fill" data-fill="${rep}"></div></div>
    <div class="wh-stats">
      <span>Reputation ${rep}%</span>
      <span>Strikes ${work.strikes || 0}/${job.firingStrikes}</span>
      <span>${job.payPerBlock}/block</span>
    </div>
  `;
  body.appendChild(header);

  // Earnings summary
  const earnings = document.createElement('div');
  earnings.className = 'wh-earnings';
  earnings.innerHTML = `
    <div class="wh-earnings-row"><span>Today</span><span>${work.todayBlocks || 0} blocks</span><span>${work.todayEarned || 0}</span></div>
  `;
  body.appendChild(earnings);

  // Task cards
  const taskHeader = document.createElement('div');
  taskHeader.className = 'wh-task-header';
  const done = work.backlog.filter(t => t.done).length;
  taskHeader.textContent = `Today's Tasks (${done}/${work.backlog.length})`;
  body.appendChild(taskHeader);

  for (const task of work.backlog) {
    const card = document.createElement('div');
    card.className = 'wh-task-card' + (task.done ? ' done' : '');
    card.innerHTML = `
      <div class="wh-task-check">${task.done ? '✓' : '○'}</div>
      <div class="wh-task-label">${task.label}</div>
    `;
    body.appendChild(card);
  }

  // Work button
  if (done < work.backlog.length) {
    const btn = document.createElement('button');
    btn.className = 'btn wh-work-btn';
    btn.setAttribute('data-action', 'computer.work-block');
    btn.textContent = 'Work a Block';
    body.appendChild(btn);
  }
}

// --- Browser: tabbed browsing with URL bar and site cards. ---
function renderBrowserHome(body, gs, app, screen) {
  const browser = gs.world.computer.apps.browser;

  // URL bar
  const urlBar = document.createElement('div');
  urlBar.className = 'br-url-bar';
  urlBar.innerHTML = `
    <div class="br-url-input">${browser?.openSiteId ? SITE_DEFS[browser.openSiteId]?.url || 'about:home' : 'about:home'}</div>
  `;
  body.appendChild(urlBar);

  // Site cards grid
  const grid = document.createElement('div');
  grid.className = 'br-grid';
  for (const site of filterByContentFlags(SITE_DEFS_LIST, gs)) {
    const card = document.createElement('div');
    card.className = 'br-card';
    card.setAttribute('data-action', 'browser.visit');
    card.setAttribute('data-row-id', site.id);
    const catColor = hashToColor(site.category);
    card.innerHTML = `
      <div class="br-card-favicon" style="background: ${catColor};">${site.label.charAt(0)}</div>
      <div class="br-card-title">${site.label}</div>
      <div class="br-card-url">${site.url}</div>
      <div class="br-card-cat">${site.category}</div>
    `;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

// --- IM: full chat UI with timestamps, unread badges, and a
// conversation list sidebar. ---
function renderChat(body, gs, app, screen) {
  const im = gs.world.computer.apps.im;
  const npc = gs.npcs[im?.viewingNpcId];
  if (!npc) { body.innerHTML = '<p class="dim">No conversation open.</p>'; return; }

  const thread = im.threads[im.viewingNpcId] || { msgs: [] };

  // Chat header with NPC name and avatar
  const header = document.createElement('div');
  header.className = 'im-chat-header';
  header.innerHTML = `
    <div class="im-avatar" style="background: ${hashToColor(npc.bible?.name || im.viewingNpcId)};">${(npc.bible?.name || '?').charAt(0)}</div>
    <div class="im-chat-name">${npc.bible?.name || 'Unknown'}</div>
  `;
  body.appendChild(header);

  // Message log with timestamps
  const log = document.createElement('div');
  log.className = 'im-msg-log';
  for (const m of thread.msgs) {
    const bubble = document.createElement('div');
    bubble.className = 'im-msg-bubble';
    bubble.setAttribute('data-from', m.from);
    const timeStr = `Day ${m.day}, ${formatTime(m.tick * 30)}`;
    if (m.from === 'player') {
      bubble.innerHTML = `<div class="im-msg-text">${m.text}</div><div class="im-msg-time">${timeStr}</div>`;
    } else if (m.from === 'npc') {
      bubble.innerHTML = `<div class="im-msg-text">${m.text}</div><div class="im-msg-time">${timeStr}</div>`;
    } else {
      bubble.innerHTML = `<div class="im-msg-text dim">${m.text}</div>`;
    }
    log.appendChild(bubble);
  }
  body.appendChild(log);

  // Input row
  const inputRow = document.createElement('div');
  inputRow.className = 'im-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'cs-chat-input';
  input.placeholder = `Text ${npc.bible?.name || 'them'}...`;
  input.className = 'im-input';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn tiny im-send-btn';
  sendBtn.setAttribute('data-action', 'im.send');
  sendBtn.setAttribute('data-row-id', im.viewingNpcId);
  sendBtn.textContent = 'Send';
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);
}

// --- Helper: deterministic color from a string hash, for thumbnails ---
function hashToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

// ===== /SECTION: RENDER.COMPUTER =====
