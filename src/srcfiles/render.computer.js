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

// Phase 2 of the windowed-desktop rework moved the screen shell itself —
// renderComputerScreen (the entry point RENDER calls), the per-window
// screen sub-nav, and the app tab bar/clock — into RENDER.DESKTOP, which
// now owns the desktop/taskbar/window chrome. What's left here is the
// renderer registry and every per-app screen renderer: each one still
// just takes a `body` node and fills it, unaware of whether that body
// lives inside a real draggable window or (as in the pre-Phase-2 shim)
// one shared full-bleed panel.

const COMPUTER_RENDERERS = {
  catalog: renderCatalog,
  list: renderList,
  article: renderArticle,
  applicant: renderApplicantProfile,
  streamly: renderStreamly,
  nile: renderNile,
  gigboard: renderGigBoard,
  gigaccepted: renderGigAccepted,
  browser: renderBrowserHome,
  'edustream-catalog': renderEduStreamCatalog,
  'edustream-enrolled': renderEduStreamEnrolled,
  'homecare-catalog': renderHomeCareCatalog,
  'homecare-hired': renderHomeCareHired,
  'homecare-maid': renderHomeCareMaid,
  'roomlist-post': renderRoomListPost,
  'roomlist-applicants': renderRoomListApplicants,
  'roomlist-browse': renderRoomListBrowse,
  'roomlist-queue': renderRoomListQueue,
  'roomlist-studio': renderRoomListStudio,
  'roomlist-assign': renderRoomListAssign,
  'doordrop-browse': renderDoorDropBrowse,
  'doordrop-menu': renderDoorDropMenu,
  'doordrop-cart': renderDoorDropCart,
  'doordrop-orders': renderDoorDropOrders,
  messenger: renderMessages,
  'bank-overview': renderBankOverview,
  'bills-dashboard': renderBillsDashboard,
  'upgrades-dashboard': renderUpgradesDashboard,
  'invest-dashboard': renderInvestDashboard,
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

function makePanel(html) {
  const div = document.createElement('div');
  div.className = 'cs-panel';
  div.innerHTML = html;
  return div;
}

// screen.source names a data source by string (e.g. 'JOB_DEFS') — a light
// indirection so APP_DEFS stays pure data (a def doesn't import anything,
// it just names what it wants). Resolved through CATALOG_SOURCES rather
// than `window[screen.source]`: top-level `const`/`let` bindings in a
// classic script are NOT window properties (only `var`/function
// declarations are), so a bare global-property lookup silently returns
// undefined for every data registry in this codebase — this cost real
// debugging time to find; see ARCHITECTURE.md's P4 notes.
// NOTE: JOB_DEFS was removed in the Phase 2 gig rewrite — the board now
// uses a bespoke renderer (renderGigBoard) over live state, not a catalog.
const CATALOG_SOURCES = { SHOP_CATALOG_LIST, SITE_DEFS_LIST, COURSE_DEFS_LIST, SERVICE_DEFS_LIST, STREAM_DEFS_LIST };

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

  body.appendChild(renderBrowserNav(gs));
  const panel = makePanel(`<h3>${site.label}</h3><p class="dim tiny">${site.url}</p><p>${site.body}</p>`);
  body.appendChild(panel);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-app', app.id);
  backBtn.setAttribute('data-screen', 'home');
  backBtn.textContent = 'Back';
  body.appendChild(backBtn);
}

// Phase 10: embed refusal fallback — shows a "Watch on site" link when
// the Pornhub embed refuses to load. The clip URL is third-party API
// output, so it goes in a property, not innerHTML.
function showEmbedFallback(container, clip) {
  container.innerHTML = '';
  const msg = document.createElement('p');
  msg.className = 'ah-error';
  msg.textContent = 'This video can\'t be embedded here.';
  container.appendChild(msg);
  if (clip.watchUrl) {
    const link = document.createElement('button');
    link.className = 'btn tiny';
    link.textContent = 'Watch on site →';
    link.title = 'Open in new tab';
    link.addEventListener('click', () => window.open(clip.watchUrl, '_blank', 'noopener,noreferrer'));
    container.appendChild(link);
  }
}

// AfterHours: a live porn site browser backed by Pornhub's webmaster
// API. Category tabs map to search queries. Clips are fetched at
// runtime via superFetch (see fetchAfterHoursClips in UI.COMPUTER) and
// stored in browser.afterHoursClips. Clicking a clip embeds the
// Pornhub player iframe. No static entries — everything is live.
function renderAfterHours(body, gs, site) {
  const ac = site.adultContent;
  const browser = gs.world.computer.apps.browser;
  const selectedCat = browser.afterHoursCategory || 'featured';

  body.appendChild(renderBrowserNav(gs));
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

  // Phase 10: search bar — free-text search across all categories
  const searchBar = document.createElement('div');
  searchBar.className = 'ah-search-bar';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'ah-search-input';
  searchInput.placeholder = 'Search AfterHours...';
  searchInput.value = browser.afterHoursSearchQuery || '';
  searchBar.appendChild(searchInput);
  const searchBtn = document.createElement('button');
  searchBtn.className = 'btn tiny';
  searchBtn.textContent = 'Search';
  searchBtn.addEventListener('click', () => {
    doAfterHoursSearch(searchInput.value);
  });
  searchBar.appendChild(searchBtn);
  // Enter key triggers search too
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAfterHoursSearch(searchInput.value); }
  });
  // Clear search button
  if (browser.afterHoursSearchQuery) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary tiny';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      doAfterHoursSearch('');
    });
    searchBar.appendChild(clearBtn);
  }
  body.appendChild(searchBar);

  // Refresh + pagination bar
  const refreshBar = document.createElement('div');
  refreshBar.className = 'ah-refresh-bar';
  // Phase 10: prev page button
  const currentPage = browser.afterHoursClipPage || 1;
  const totalPages = browser.afterHoursTotalPages || 1;
  if (currentPage > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-secondary tiny';
    prevBtn.setAttribute('data-action', 'browser.ah-page');
    prevBtn.setAttribute('data-direction', '-1');
    prevBtn.textContent = '◀ Prev';
    refreshBar.appendChild(prevBtn);
  }
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-secondary tiny ah-refresh-btn';
  refreshBtn.setAttribute('data-action', 'browser.ah-refresh');
  refreshBtn.textContent = '↻ Next Page';
  refreshBar.appendChild(refreshBtn);
  // Page indicator
  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'dim tiny';
  pageIndicator.textContent = `Page ${currentPage}`;
  refreshBar.appendChild(pageIndicator);
  if (browser.afterHoursClipsLoading) {
    const status = document.createElement('span');
    status.className = 'dim tiny';
    status.textContent = 'Loading clips...';
    refreshBar.appendChild(status);
  }
  body.appendChild(refreshBar);

  // Content grid — populated from live-fetched clips, not static defs
  const clips = browser.afterHoursClips;
  const grid = document.createElement('div');
  grid.className = 'ah-content-grid';

  if (browser.afterHoursClipsLoading && (!clips || clips.length === 0)) {
    const loading = document.createElement('div');
    loading.className = 'ah-loading-grid';
    loading.textContent = 'Loading clips...';
    grid.appendChild(loading);
  } else if (!clips || clips.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ah-error';
    empty.textContent = browser.afterHoursClipsError || 'No clips loaded. Click Refresh.';
    grid.appendChild(empty);
  } else {
    for (const clip of clips) {
      const card = document.createElement('div');
      card.className = 'ah-card';
      card.setAttribute('data-action', 'browser.ah-watch');
      card.setAttribute('data-row-id', clip.id);

      const thumb = document.createElement('div');
      thumb.className = 'ah-thumb';
      if (clip.thumb) {
        // Built as nodes, not an innerHTML template. Every field here is
        // verbatim third-party API output, so interpolating it into markup
        // let a crafted title or thumb URL close the attribute and inject
        // script. The onerror fallback is a listener for the same reason.
        const img = document.createElement('img');
        img.src = clip.thumb;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          img.style.display = 'none';
          thumb.textContent = 'Click to play';
        });
        thumb.appendChild(img);
        const dur = document.createElement('span');
        dur.className = 'ah-duration';
        dur.textContent = clip.duration || '';
        thumb.appendChild(dur);
        const views = document.createElement('span');
        views.className = 'ah-views';
        views.textContent = formatViews(clip.views);
        thumb.appendChild(views);
      } else {
        thumb.textContent = 'Click to play';
      }
      card.appendChild(thumb);

      const title = document.createElement('div');
      title.className = 'ah-card-title';
      title.textContent = clip.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'ah-card-meta';
      meta.textContent = clip.rating ? `★ ${clip.rating}%` : '';
      card.appendChild(meta);

      grid.appendChild(card);
    }
  }
  // If a clip is being watched, show the embed player ABOVE the grid
  // so it's immediately visible without scrolling past 30 thumbnails
  const watchingId = browser.afterHoursWatching;
  if (watchingId && clips) {
    const clip = clips.find(c => c.id === watchingId);
    if (clip) {
      const watchPanel = document.createElement('div');
      watchPanel.className = 'ah-watch-panel';
      watchPanel.id = 'ah-watch-panel';
      // textContent, not innerHTML — clip.title is third-party API output.
      const heading = document.createElement('h4');
      heading.textContent = clip.title;
      watchPanel.appendChild(heading);
      const meta = document.createElement('div');
      meta.className = 'ah-watch-meta';
      // formatViews already appends " views"; this line used to add a
      // second one ("1.2M views views").
      meta.textContent = `${clip.duration || ''} · ${formatViews(clip.views)}${clip.rating ? ' · ★ ' + clip.rating + '%' : ''}`;
      watchPanel.appendChild(meta);

      const embedCtn = document.createElement('div');
      embedCtn.className = 'ah-embed-ctn';
      if (clip.embedUrl) {
        // Built as a node so the API-derived URL lands in a property
        // rather than being interpolated into an attribute.
        const frame = document.createElement('iframe');
        frame.src = clip.embedUrl;
        frame.setAttribute('allow', 'autoplay; fullscreen');
        frame.setAttribute('scrolling', 'no');
        embedCtn.appendChild(frame);

        // Phase 10: embed refusal fallback. Some clips refuse to embed
        // ("you can only watch this on Pornhub"). We can't read the
        // cross-origin iframe, so we show a manual fallback link after
        // a short delay and on load error. The "Watch on site" link
        // opens the clip in a new tab — textContent, not innerHTML.
        frame.addEventListener('error', () => {
          embedCtn.innerHTML = '';
          showEmbedFallback(embedCtn, clip);
        });
        // Also add a manual fallback button (always visible below iframe)
        const fallbackBar = document.createElement('div');
        fallbackBar.className = 'ah-embed-fallback-bar';
        const troubleBtn = document.createElement('button');
        troubleBtn.className = 'btn btn-secondary tiny';
        troubleBtn.textContent = 'Video not loading? Watch on site →';
        troubleBtn.title = 'Open in new tab';
        troubleBtn.addEventListener('click', () => {
          if (clip.watchUrl) window.open(clip.watchUrl, '_blank', 'noopener,noreferrer');
        });
        fallbackBar.appendChild(troubleBtn);
        embedCtn.appendChild(fallbackBar);
      } else {
        const err = document.createElement('p');
        err.className = 'ah-error';
        err.textContent = 'Embed unavailable.';
        embedCtn.appendChild(err);
        if (clip.watchUrl) {
          const link = document.createElement('button');
          link.className = 'btn btn-secondary tiny';
          link.textContent = 'Watch on site →';
          link.addEventListener('click', () => window.open(clip.watchUrl, '_blank', 'noopener,noreferrer'));
          embedCtn.appendChild(link);
        }
      }
      watchPanel.appendChild(embedCtn);

      const actions = document.createElement('div');
      actions.className = 'ah-watch-actions';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-secondary tiny';
      closeBtn.setAttribute('data-action', 'browser.ah-close');
      closeBtn.textContent = 'Close player';
      actions.appendChild(closeBtn);

      // Phase 3: masturbate/cum/stop buttons. Session-active is DERIVED
      // (Phase 5.5): the record exists but the device must still be in
      // use — a pocketed/locked/dead phone or a powered-off computer reads
      // as inactive here too.
      if (isAfterHoursSessionActive(gs)) {
        // Session in progress — show Cum (with warmup) and Stop.
        // startedTick is an absolute game-minute (day*1440+m), not a
        // time-of-day, so a session running past midnight reports
        // elapsed time instead of a large negative number.
        const sessionMinutes = browser.afterHoursSession?.startedTick != null
          ? Math.max(0, Math.round(clockToAbsolute(gs.meta.clock) - browser.afterHoursSession.startedTick))
          : 0;
        const status = document.createElement('span');
        status.className = 'ah-session-status dim tiny';
        status.textContent = `Session: ${sessionMinutes} min`;
        actions.appendChild(status);

        // Warmup is derived from state (a wall-clock deadline stored when
        // the session started), not from a setTimeout scheduled inside the
        // render pass. The old version re-armed a fresh timer and reset
        // `disabled` on *every* re-render, so any incidental re-render
        // restarted the warmup — the same render-triggered-side-effect trap
        // doAfterHoursWatch's comment warns about a few functions down.
        const warmedUp = Date.now() >= (browser.afterHoursWarmupUntilMs || 0);
        const cumBtn = document.createElement('button');
        cumBtn.className = 'btn ah-cum-btn' + (warmedUp ? ' ready' : '');
        cumBtn.setAttribute('data-action', 'browser.ah-cum');
        cumBtn.textContent = 'Cum';
        cumBtn.disabled = !warmedUp;
        cumBtn.id = 'ah-cum-btn';
        actions.appendChild(cumBtn);

        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn btn-secondary tiny';
        stopBtn.setAttribute('data-action', 'browser.ah-stop');
        stopBtn.textContent = 'Stop';
        actions.appendChild(stopBtn);
      } else {
        // Not masturbating — show Masturbate button
        const masturbateBtn = document.createElement('button');
        masturbateBtn.className = 'btn ah-masturbate-btn';
        masturbateBtn.setAttribute('data-action', 'browser.ah-masturbate');
        masturbateBtn.textContent = 'Masturbate';
        actions.appendChild(masturbateBtn);
      }

      watchPanel.appendChild(actions);

      body.appendChild(watchPanel);
    }
  }

  body.appendChild(grid);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-app', 'browser');
  backBtn.setAttribute('data-screen', 'home');
  backBtn.textContent = 'Back';
  body.appendChild(backBtn);
}

// Format view counts: 1234 -> 1.2K, 1234567 -> 1.2M
function formatViews(views) {
  if (!views) return '';
  if (views >= 1e6) return (views / 1e6).toFixed(1) + 'M views';
  if (views >= 1e3) return (views / 1e3).toFixed(1) + 'K views';
  return views + ' views';
}

// Classifieds' applicant detail — same "which one is open" pattern as
// Browser's article (apps.classifieds.viewingApplicantId, not
// view.params). Shows the same bible fields the character-creation
// preview does (occupation/want/wound/blind spot), since an applicant IS
// a fully-formed prospective NPC, not a lightweight preview record.
// Phase 6: full bible display — temperament bars, personality, physical,
// interests, values, quirks, likes/dislikes, sample lines, sketch.
function renderApplicantProfile(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const npc = gs.npcs[classifieds?.viewingApplicantId];
  if (!npc) { body.innerHTML = '<p class="dim">No applicant selected.</p>'; return; }
  const b = npc.bible;
  const isFav = (classifieds.favorites || []).includes(classifieds.viewingApplicantId);

  // --- Header with avatar, name, age/gender, occupation ---
  const profile = document.createElement('div');
  profile.className = 'rl-profile';
  const genderLabel = (b.gender || '').replace('_', ' ');
  profile.innerHTML = `
    <div class="rl-profile-header">
      <div class="rl-card-avatar rl-profile-avatar" style="background: ${hashToColor(b.name)};">${b.name.charAt(0)}</div>
      <div>
        <div class="rl-profile-name">${b.name}</div>
        <div class="dim tiny">${b.age} · ${genderLabel} · ${b.occupation.title} — ${b.occupation.hours}</div>
        <div class="dim tiny">${b.occupation.incomeBand} income · ${b.occupation.category}</div>
      </div>
    </div>
  `;
  if (b.sketch) {
    const sketch = document.createElement('div');
    sketch.className = 'rl-profile-sketch';
    sketch.textContent = b.sketch;
    profile.appendChild(sketch);
  }
  if (b.visual) {
    profile.appendChild(buildProfileSection('Appearance', b.visual));
  }
  body.appendChild(profile);

  // --- Temperament bars ---
  if (b.temperament) {
    const tempSection = buildProfileCard('Temperament');
    const axes = ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness'];
    for (const axis of axes) {
      const val = b.temperament[axis];
      if (typeof val !== 'number') continue;
      const pct = ((val + 1) / 2) * 100; // -1..1 → 0..100
      const row = document.createElement('div');
      row.className = 'rl-temp-row';
      row.innerHTML = `<span class="rl-temp-label dim tiny">${axis}</span><div class="rl-temp-bar"><div class="rl-temp-fill" style="width:${pct}%;"></div></div><span class="rl-temp-val tiny">${val > 0 ? '+' : ''}${val.toFixed(1)}</span>`;
      tempSection.appendChild(row);
    }
    body.appendChild(tempSection);
  }

  // --- Personality ---
  if (b.personality) {
    const pers = b.personality;
    if (pers.traits && pers.traits.length > 0) {
      const traitsHtml = pers.traits.map(t => `<span class="rl-tag">${t}</span>`).join('');
      body.appendChild(buildProfileSection('Traits', `<div class="rl-tags">${traitsHtml}</div>`));
    }
    if (pers.coreTrait) body.appendChild(buildProfileSection('Core Trait', pers.coreTrait));
    if (pers.hiddenTrait) body.appendChild(buildProfileSection('Hidden Side', pers.hiddenTrait, true));
    if (pers.quirks && pers.quirks.length > 0) {
      body.appendChild(buildProfileSection('Quirks', pers.quirks.map(q => `• ${q}`).join('<br>')));
    }
    if (pers.likes && pers.likes.length > 0) {
      body.appendChild(buildProfileSection('Likes', `<div class="rl-tags">${pers.likes.map(l => `<span class="rl-tag rl-tag-pos">${l}</span>`).join('')}</div>`));
    }
    if (pers.dislikes && pers.dislikes.length > 0) {
      body.appendChild(buildProfileSection('Dislikes', `<div class="rl-tags">${pers.dislikes.map(d => `<span class="rl-tag rl-tag-neg">${d}</span>`).join('')}</div>`));
    }
  }

  // --- Interests & Values ---
  if (b.interests && b.interests.length > 0) {
    body.appendChild(buildProfileSection('Interests', `<div class="rl-tags">${b.interests.map(i => `<span class="rl-tag">${i.name}</span>`).join('')}</div>`));
  }
  if (b.values && b.values.length > 0) {
    body.appendChild(buildProfileSection('Values', b.values.map(v => `${v.name} (vs. ${v.opposition})`).join(', ')));
  }

  // --- Narrative fields ---
  body.appendChild(buildProfileSection('History', b.history));
  body.appendChild(buildProfileSection('Want', b.want, true));
  body.appendChild(buildProfileSection('Wound', b.wound, true));
  body.appendChild(buildProfileSection('Blind Spot', b.blindSpot, true));
  if (b.boundary) body.appendChild(buildProfileSection('Boundary', b.boundary, true));
  if (b.baggage) body.appendChild(buildProfileSection('Baggage', b.baggage, true));

  // --- Sample dialogue ---
  if (b.sampleLines && b.sampleLines.length > 0) {
    const lines = b.sampleLines.map(l => `<div class="rl-sample-line">"${l}"</div>`).join('');
    body.appendChild(buildProfileSection('Sample Lines', lines));
  }

  // --- Actions ---
  const actionRow = document.createElement('div');
  actionRow.className = 'rl-profile-actions';
  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'btn';
  acceptBtn.setAttribute('data-action', 'classifieds.assign-room');
  acceptBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  acceptBtn.textContent = 'Accept as Roommate';
  actionRow.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'btn btn-secondary';
  rejectBtn.setAttribute('data-action', 'classifieds.reject');
  rejectBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  rejectBtn.textContent = 'Reject';
  actionRow.appendChild(rejectBtn);

  const interviewBtn = document.createElement('button');
  interviewBtn.className = 'btn btn-secondary';
  interviewBtn.setAttribute('data-action', 'classifieds.interview');
  interviewBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  interviewBtn.textContent = 'Interview';
  actionRow.appendChild(interviewBtn);

  const favBtn = document.createElement('button');
  favBtn.className = 'btn btn-secondary tiny';
  favBtn.setAttribute('data-action', 'classifieds.toggle-favorite');
  favBtn.setAttribute('data-row-id', classifieds.viewingApplicantId);
  favBtn.textContent = isFav ? '★ Saved' : '☆ Save';
  actionRow.appendChild(favBtn);

  body.appendChild(actionRow);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-app', app.id);
  backBtn.setAttribute('data-screen', 'browse');
  backBtn.textContent = 'Back to Browse';
  body.appendChild(backBtn);

  // If this applicant came from the Studio (in classifieds.applicants but
  // not from a stub), also offer a path back to the Applicants screen
  if (classifieds.applicants.includes(classifieds.viewingApplicantId)) {
    const backAppBtn = document.createElement('button');
    backAppBtn.className = 'btn btn-secondary tiny';
    backAppBtn.setAttribute('data-action', 'computer.open-screen');
    backAppBtn.setAttribute('data-app', app.id);
    backAppBtn.setAttribute('data-screen', 'applicants');
    backAppBtn.textContent = 'Back to Applicants';
    body.appendChild(backAppBtn);
  }
}

// Phase 6: profile section helpers
function buildProfileSection(label, content, subtle) {
  const div = document.createElement('div');
  div.className = 'rl-profile-section' + (subtle ? ' subtle' : '');
  div.innerHTML = `<span class="rl-profile-section-label dim tiny">${label}</span><div class="rl-profile-section-body tiny">${content}</div>`;
  return div;
}
function buildProfileCard(label) {
  const div = document.createElement('div');
  div.className = 'rl-profile-card';
  div.innerHTML = `<div class="rl-profile-card-title tiny">${label}</div>`;
  return div;
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
      <div class="str-progress-bar"><div class="str-progress-fill" style="width: ${pct}%;"></div></div>
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
// --- Gig board (Phase 2) ---
// The board shows available gigs the player can accept, plus a reputation
// header so the player can see their tier and which gigs they have access
// to. A dry spell (no board refresh) reads as an empty board, which is
// the intended signal.
function renderGigBoard(body, gs, app, screen) {
  const gigs = gs.world.computer.apps.gigs;
  const rep = Math.round(gigs.reputation || 0);
  const tier = gigTier(rep);

  const header = document.createElement('div');
  header.className = 'wh-header';
  header.innerHTML = `
    <h3>Gig Board — ${tier.name}</h3>
    <div class="wh-rep-bar"><div class="wh-rep-fill" style="width: ${rep}%;"></div></div>
    <div class="wh-stats">
      <span>Reputation ${rep}/100</span>
      <span>${gigs.accepted.length}/${GIG_MAX_CONCURRENT} gigs held</span>
    </div>
  `;
  body.appendChild(header);

  // Link to the accepted-gigs screen
  const acceptedLink = document.createElement('button');
  acceptedLink.className = 'btn btn-secondary tiny';
  acceptedLink.setAttribute('data-action', 'computer.open-screen');
  acceptedLink.setAttribute('data-app', app.id);
  acceptedLink.setAttribute('data-screen', 'accepted');
  acceptedLink.textContent = `My Gigs (${gigs.accepted.length})`;
  body.appendChild(acceptedLink);

  const board = gigs.board || [];
  if (board.length === 0) {
    const empty = makePanel('<p class="dim">No gigs available right now. The board refreshes most days — check back tomorrow.</p>');
    body.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'cs-catalog';
  for (const gig of board) {
    const item = document.createElement('div');
    item.className = 'cs-catalog-row';
    const daysLeft = gig.deadlineDay - gs.meta.clock.day;
    const rushTag = gig.rush ? ' <span class="dim tiny" style="color:var(--color-warning);">RUSH</span>' : '';
    item.innerHTML = `<span class="cs-catalog-title">${gig.label}${rushTag}<br><span class="dim tiny">${gig.client} · ${gig.blocks} blocks · due day ${gig.deadlineDay} (${daysLeft}d)</span></span><span class="dim tiny">${gig.payout}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'gig.accept');
    btn.setAttribute('data-row-id', gig.gigId);
    btn.textContent = 'Accept';
    if (gigs.accepted.length >= GIG_MAX_CONCURRENT) btn.disabled = true;
    item.appendChild(btn);
    list.appendChild(item);
  }
  body.appendChild(list);
}

// The player's accepted gigs: progress, work/deliver/abandon actions.
function renderGigAccepted(body, gs, app, screen) {
  const gigs = gs.world.computer.apps.gigs;
  const rep = Math.round(gigs.reputation || 0);
  const tier = gigTier(rep);

  const header = document.createElement('div');
  header.className = 'wh-header';
  header.innerHTML = `
    <h3>My Gigs — ${tier.name} (${rep}/100)</h3>
    <div class="wh-stats"><span>${gigs.accepted.length}/${GIG_MAX_CONCURRENT} held</span></div>
  `;
  body.appendChild(header);

  // Link back to the board
  const boardLink = document.createElement('button');
  boardLink.className = 'btn btn-secondary tiny';
  boardLink.setAttribute('data-action', 'computer.open-screen');
  boardLink.setAttribute('data-app', app.id);
  boardLink.setAttribute('data-screen', 'board');
  boardLink.textContent = 'Gig Board';
  body.appendChild(boardLink);

  const accepted = gigs.accepted || [];
  if (accepted.length === 0) {
    const empty = makePanel('<p class="dim">You have no active gigs. Browse the board to accept work.</p>');
    body.appendChild(empty);
    return;
  }
  for (const gig of accepted) {
    const pct = Math.round((gig.blocksDone / gig.blocks) * 100);
    const done = gig.blocksDone >= gig.blocks;
    const late = gs.meta.clock.day > gig.deadlineDay;
    const daysLeft = gig.deadlineDay - gs.meta.clock.day;
    const card = document.createElement('div');
    card.className = 'cs-panel';
    card.innerHTML = `
      <h3>${gig.label}${gig.rush ? ' <span class="dim tiny" style="color:var(--color-warning);">RUSH</span>' : ''}</h3>
      <div class="dim tiny">${gig.client} · ${gig.payout} · ${gig.blocks} blocks</div>
      <div class="wh-rep-bar"><div class="wh-rep-fill" style="width: ${pct}%;"></div></div>
      <div class="dim tiny">Progress: ${gig.blocksDone.toFixed(2)}/${gig.blocks} (${pct}%) · ${late ? 'OVERDUE' : `due in ${daysLeft}d`}</div>
    `;
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = 'var(--space-2)';
    actions.style.marginTop = 'var(--space-2)';
    if (!done && !late) {
      const workBtn = document.createElement('button');
      workBtn.className = 'btn tiny';
      workBtn.setAttribute('data-action', 'computer.gig-work-block');
      workBtn.setAttribute('data-row-id', gig.gigId);
      workBtn.textContent = 'Work a Block';
      actions.appendChild(workBtn);
    }
    if (done) {
      const deliverBtn = document.createElement('button');
      deliverBtn.className = 'btn tiny';
      deliverBtn.setAttribute('data-action', 'gig.deliver');
      deliverBtn.setAttribute('data-row-id', gig.gigId);
      deliverBtn.textContent = 'Deliver';
      actions.appendChild(deliverBtn);
    }
    const abandonBtn = document.createElement('button');
    abandonBtn.className = 'btn btn-secondary tiny';
    abandonBtn.setAttribute('data-action', 'gig.abandon');
    abandonBtn.setAttribute('data-row-id', gig.gigId);
    abandonBtn.textContent = 'Abandon';
    actions.appendChild(abandonBtn);
    card.appendChild(actions);
    body.appendChild(card);
  }
}

// A small address-bar-style nav row — Back/Forward wired to the visit
// history COMPUTER's visitSite already records (apps.browser.history),
// plus the current URL. Shared by the home grid, an open article, and
// AfterHours, so browsing feels continuous across all three rather than
// each screen having its own disconnected "Back" button.
function renderBrowserNav(gs) {
  const browser = gs.world.computer.apps.browser;
  const history = browser.history || [];
  const idx = browser.historyIndex ?? -1;

  const nav = document.createElement('div');
  nav.className = 'br-nav-bar';

  const backBtn = document.createElement('button');
  backBtn.className = 'br-nav-btn';
  backBtn.setAttribute('data-action', 'browser.back');
  backBtn.innerHTML = svgIcon('back');
  backBtn.disabled = idx <= 0;
  nav.appendChild(backBtn);

  const fwdBtn = document.createElement('button');
  fwdBtn.className = 'br-nav-btn';
  fwdBtn.setAttribute('data-action', 'browser.forward');
  fwdBtn.innerHTML = svgIcon('forward');
  fwdBtn.disabled = idx < 0 || idx >= history.length - 1;
  nav.appendChild(fwdBtn);

  const urlBar = document.createElement('div');
  urlBar.className = 'br-url-input';
  urlBar.textContent = browser.openSiteId ? (SITE_DEFS[browser.openSiteId]?.url || 'about:home') : 'about:home';
  nav.appendChild(urlBar);

  return nav;
}

// --- Browser: address bar with real Back/Forward, plus a grid of
// site cards. ---
function renderBrowserHome(body, gs, app, screen) {
  body.appendChild(renderBrowserNav(gs));

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

// --- EduStream: course cards with a skill badge, and a separate
// progress view for whatever's currently enrolled. ---
function renderEduStreamCatalog(body, gs, app, screen) {
  const classes = gs.world.computer.apps.classes;
  const grid = document.createElement('div');
  grid.className = 'es-grid';
  for (const course of COURSE_DEFS_LIST) {
    const enrolled = classes.enrolled.some(e => e.courseId === course.id);
    const completed = classes.completed.includes(course.id);
    const card = document.createElement('div');
    card.className = 'es-card';
    card.innerHTML = `
      <div class="es-card-badge" style="background: ${hashToColor(course.skillId)};">${course.skillId.charAt(0).toUpperCase()}</div>
      <div class="es-card-title">${course.label}</div>
      <div class="es-card-meta">${course.lessons} lessons — $${course.cost}</div>
      <div class="es-card-meta dim tiny">${course.skillId}${course.requiresLevel ? ` · requires level ${course.requiresLevel}` : ''}</div>
    `;
    if (completed) card.innerHTML += '<div class="cs-status-pill done">Completed</div>';
    else if (enrolled) card.innerHTML += '<div class="cs-status-pill active">Enrolled</div>';
    else {
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.setAttribute('data-action', 'classes.enroll');
      btn.setAttribute('data-row-id', course.id);
      btn.textContent = 'Enroll';
      card.appendChild(btn);
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderEduStreamEnrolled(body, gs, app, screen) {
  const classes = gs.world.computer.apps.classes;
  if (classes.enrolled.length === 0) { body.innerHTML = '<p class="dim tiny">Not enrolled in anything.</p>'; return; }
  for (const enrollment of classes.enrolled) {
    const course = COURSE_DEFS[enrollment.courseId];
    if (!course) continue;
    const pct = Math.round((enrollment.progress / course.lessons) * 100);
    const card = document.createElement('div');
    card.className = 'es-progress-card';
    card.innerHTML = `
      <div class="es-progress-header"><span>${course.label}</span><span class="dim tiny">${enrollment.progress}/${course.lessons} lessons</span></div>
      <div class="es-progress-bar"><div class="es-progress-fill" style="width: ${pct}%;"></div></div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'classes.attend-lesson');
    btn.setAttribute('data-row-id', enrollment.courseId);
    btn.textContent = 'Attend Lesson';
    card.appendChild(btn);
    body.appendChild(card);
  }
}

// --- HomeCare: service cards with a cadence badge and an access-scope
// badge — "Whole Apartment" really does enter every bedroom, which
// matters once STEALTH is watching (see COMPUTER's performCleaningVisit),
// so it gets a visually distinct, slightly alarming treatment rather than
// reading the same as "Common Areas." ---
function renderHomeCareCatalog(body, gs, app, screen) {
  const services = gs.world.computer.apps.services;
  const grid = document.createElement('div');
  grid.className = 'hc-grid';
  for (const service of SERVICE_DEFS_LIST) {
    const hired = services.hired.some(h => h.serviceId === service.id);
    const card = document.createElement('div');
    card.className = 'hc-card';
    card.innerHTML = `
      <div class="hc-card-title">${service.label}</div>
      <div class="hc-card-meta">$${service.costPerVisit}/visit — every ${service.cadenceDays} days</div>
      <div class="hc-scope-badge hc-scope-${service.accessScope}">${service.accessScope === 'all' ? 'Whole Apartment' : 'Common Areas'}</div>
    `;
    if (hired) card.innerHTML += '<div class="cs-status-pill active">Hired</div>';
    else {
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.setAttribute('data-action', 'services.hire');
      btn.setAttribute('data-row-id', service.id);
      btn.textContent = 'Hire';
      card.appendChild(btn);
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

// The maid (external-world plan Phase 3): the alarm-shaped contract grid.
// Each weekday can be enabled independently with its own start/end time,
// bounded to the daytime window. Price is per onsite hour × add-on
// multipliers, shown live so the cost of "every day, everything" is
// obvious before you commit to it.
function renderHomeCareMaid(body, gs, app, screen) {
  const contract = getMaidContract(gs);
  const npc = contract ? gs.npcs[contract.npcId] : null;

  const intro = document.createElement('div');
  intro.className = 'hc-maid-intro';
  intro.innerHTML = contract
    ? `<div class="hc-card-title">${npc?.bible?.name || 'Your housekeeper'}</div><div class="dim tiny">Contracted — $${getMaidWeeklyCost(contract.schedule, contract.addons)}/week across ${contract.schedule.length} day${contract.schedule.length === 1 ? '' : 's'}.</div>`
    : `<div class="hc-card-title">Hire a housekeeper</div><div class="dim tiny">Pick the days and hours you want her here. Billed by the hour, per visit.</div>`;
  body.appendChild(intro);

  const timeOpts = (sel) => {
    let out = '';
    for (let t = MAID_TUNING.windowMinTick; t <= MAID_TUNING.windowMaxTick; t++) {
      out += `<option value="${t}"${t === sel ? ' selected' : ''}>${formatTime(t * 30)}</option>`;
    }
    return out;
  };

  const grid = document.createElement('div');
  grid.className = 'hc-maid-grid';
  grid.id = 'maid-grid';
  for (let wd = 0; wd < 7; wd++) {
    const entry = (contract?.schedule || []).find(e => e.weekday === wd);
    const row = document.createElement('div');
    row.className = 'hc-maid-row';
    row.innerHTML = `
      <label class="hc-maid-day">
        <input type="checkbox" class="maid-day-on" data-weekday="${wd}"${entry ? ' checked' : ''}>
        <span>${WEEKDAY_NAMES[wd]}</span>
      </label>
      <select class="maid-start" data-weekday="${wd}">${timeOpts(entry ? entry.startTick : MAID_TUNING.windowMinTick)}</select>
      <span class="dim tiny">to</span>
      <select class="maid-end" data-weekday="${wd}">${timeOpts(entry ? entry.endTick : MAID_TUNING.windowMaxTick)}</select>
    `;
    grid.appendChild(row);
  }
  body.appendChild(grid);

  const addons = document.createElement('div');
  addons.className = 'hc-maid-addons';
  addons.id = 'maid-addons';
  for (const a of MAID_ADDONS_LIST) {
    const on = (contract?.addons || []).includes(a.id);
    const mult = MAID_TUNING.addonRateMultipliers[a.id];
    const label = document.createElement('label');
    label.className = 'hc-maid-addon';
    label.innerHTML = `
      <input type="checkbox" class="maid-addon" data-addon="${a.id}"${on ? ' checked' : ''}>
      <span><strong>${a.label}</strong> <span class="dim tiny">×${mult}</span><br><span class="dim tiny">${a.desc}</span></span>
    `;
    addons.appendChild(label);
  }
  body.appendChild(addons);

  const actions = document.createElement('div');
  actions.className = 'hc-maid-actions';
  const save = document.createElement('button');
  save.className = 'btn tiny';
  save.setAttribute('data-action', 'services.maid-save');
  save.textContent = contract ? 'Update Contract' : 'Hire';
  actions.appendChild(save);
  const note = document.createElement('span');
  note.className = 'dim tiny';
  note.textContent = 'Unchecking every day cancels the contract.';
  actions.appendChild(note);
  body.appendChild(actions);
}

function renderHomeCareHired(body, gs, app, screen) {
  const services = gs.world.computer.apps.services;
  if (services.hired.length === 0) { body.innerHTML = '<p class="dim tiny">No services hired.</p>'; return; }
  for (const hire of services.hired) {
    // The maid is a scheduled contract, not a cadence hire — she has her
    // own screen, so summarise her here rather than skipping her entirely
    // (SERVICE_DEFS has no 'maid' entry by design).
    if (hire.serviceId === MAID_SERVICE_ID) {
      const npc = gs.npcs[hire.npcId];
      const row = document.createElement('div');
      row.className = 'hc-hired-row';
      const days = (hire.schedule || []).map(e => WEEKDAY_NAMES[e.weekday].slice(0, 3)).join(', ');
      row.innerHTML = `<div><div class="hc-card-title">${npc?.bible?.name || 'Housekeeper'}</div><div class="dim tiny">${days || 'No days set'} — $${getMaidWeeklyCost(hire.schedule, hire.addons)}/week</div></div>`;
      const edit = document.createElement('button');
      edit.className = 'btn tiny btn-secondary';
      edit.setAttribute('data-action', 'computer.open-screen');
      edit.setAttribute('data-app', 'services');
      edit.setAttribute('data-screen', 'maid');
      edit.textContent = 'Edit';
      row.appendChild(edit);
      body.appendChild(row);
      continue;
    }
    const service = SERVICE_DEFS[hire.serviceId];
    if (!service) continue;
    const daysUntil = Math.max(0, hire.nextDay - gs.meta.clock.day);
    const row = document.createElement('div');
    row.className = 'hc-hired-row';
    row.innerHTML = `<div><div class="hc-card-title">${service.label}</div><div class="dim tiny">Next visit in ${daysUntil} day${daysUntil === 1 ? '' : 's'}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn tiny btn-secondary';
    btn.setAttribute('data-action', 'services.cancel');
    btn.setAttribute('data-row-id', hire.serviceId);
    btn.textContent = 'Cancel';
    row.appendChild(btn);
    body.appendChild(row);
  }
}

// --- DoorDrop: food delivery (external-world plan Phase 5) ---
// Four screens in the shape of every delivery app the player has ever used:
// restaurants → a menu → a cart with the fee stack spelled out → orders with
// a live ETA. The fees are itemised deliberately: "ordering in is expensive"
// only lands as a decision if you can see what you're paying for.
function renderDoorDropBrowse(body, gs, app, screen) {
  const nowTick = getTickIndex(gs.meta.clock.minutes);
  const cartId = getFoodCartRestaurantId(gs);
  const grid = document.createElement('div');
  grid.className = 'dd-grid';
  for (const def of RESTAURANT_DEFS_LIST) {
    const open = isRestaurantOpen(def, nowTick);
    const card = document.createElement('div');
    card.className = `dd-card${open ? '' : ' dd-closed'}`;
    card.innerHTML = `
      <div class="dd-card-head">
        <span class="hc-card-title">${def.label}</span>
        <span class="dim tiny">${def.cuisine}</span>
      </div>
      <div class="dim tiny">${def.blurb}</div>
      <div class="dim tiny">~${def.prepMinutes} min prep — $${def.deliveryFeeBase} delivery — ${formatTime(def.hours[0] * 30)}–${formatTime(def.hours[1] * 30)}</div>
    `;
    if (!open) {
      card.innerHTML += '<div class="cs-status-pill">Closed</div>';
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.setAttribute('data-action', 'food.open-restaurant');
      btn.setAttribute('data-row-id', def.id);
      btn.textContent = cartId === def.id ? 'Back to Menu' : 'View Menu';
      card.appendChild(btn);
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderDoorDropMenu(body, gs, app, screen) {
  const foodApp = gs.world.computer.apps.food;
  const def = RESTAURANT_DEFS[foodApp?.openRestaurantId];
  if (!def) { body.innerHTML = '<p class="dim tiny">Pick a restaurant first.</p>'; return; }
  const cart = foodApp.cart || [];

  const head = document.createElement('div');
  head.className = 'dd-menu-head';
  head.innerHTML = `<div class="hc-card-title">${def.label}</div><div class="dim tiny">${def.cuisine} — ${def.blurb}</div>`;
  body.appendChild(head);

  for (const entry of def.menu) {
    const item = ITEM_DEFS[entry.itemId];
    if (!item) continue;
    const inCart = cart.find(c => c.itemId === entry.itemId);
    const row = document.createElement('div');
    row.className = 'dd-menu-row';
    const hunger = item.consumable?.hunger || 0;
    row.innerHTML = `
      <div>
        <div class="dd-dish">${item.label}${inCart ? ` <span class="dim tiny">×${inCart.qty} in cart</span>` : ''}</div>
        <div class="dim tiny">$${entry.price} — restores ${hunger} hunger</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'food.add-to-cart');
    btn.setAttribute('data-row-id', entry.itemId);
    btn.textContent = 'Add';
    row.appendChild(btn);
    body.appendChild(row);
  }

  const actions = document.createElement('div');
  actions.className = 'dd-actions';
  const toCart = document.createElement('button');
  toCart.className = 'btn tiny';
  toCart.setAttribute('data-action', 'computer.open-screen');
  toCart.setAttribute('data-app', 'food');
  toCart.setAttribute('data-screen', 'cart');
  toCart.textContent = `View Cart (${cart.reduce((n, c) => n + c.qty, 0)})`;
  actions.appendChild(toCart);
  body.appendChild(actions);
}

function renderDoorDropCart(body, gs, app, screen) {
  const foodApp = gs.world.computer.apps.food;
  const cart = foodApp?.cart || [];
  if (cart.length === 0) { body.innerHTML = '<p class="dim tiny">Your cart is empty.</p>'; return; }
  const restaurantId = getFoodCartRestaurantId(gs);
  const def = RESTAURANT_DEFS[restaurantId];
  const totals = getFoodOrderTotals(gs);

  const head = document.createElement('div');
  head.className = 'dd-menu-head';
  head.innerHTML = `<div class="hc-card-title">${def?.label || 'Order'}</div>`;
  body.appendChild(head);

  for (const line of cart) {
    const item = ITEM_DEFS[line.itemId];
    const price = foodMenuEntry(line.restaurantId, line.itemId)?.price || 0;
    const row = document.createElement('div');
    row.className = 'dd-menu-row';
    row.innerHTML = `<div><div class="dd-dish">${item?.label || line.itemId} × ${line.qty}</div><div class="dim tiny">$${price * line.qty}</div></div>`;
    const minus = document.createElement('button');
    minus.className = 'btn tiny btn-secondary';
    minus.setAttribute('data-action', 'food.remove-from-cart');
    minus.setAttribute('data-row-id', line.itemId);
    minus.textContent = '−';
    row.appendChild(minus);
    body.appendChild(row);
  }

  // Delivery time. The earliest option is the kitchen's prep plus travel —
  // the same number placeFoodOrder will use, since both are seeded on the
  // day and the order count (see getFoodEarliestArrivalTick).
  const seq = (gs.world.foodOrders || []).length;
  const earliest = getFoodEarliestArrivalTick(gs, restaurantId, seq);
  const timeWrap = document.createElement('div');
  timeWrap.className = 'dd-time';
  let opts = `<option value="${earliest}">ASAP — ${formatTime(earliest * 30)}</option>`;
  for (let t = earliest + 1; t <= Math.min(47, earliest + FOOD_TUNING.maxScheduleAheadTicks); t++) {
    opts += `<option value="${t}">${formatTime(t * 30)}</option>`;
  }
  timeWrap.innerHTML = `<label class="dim tiny">Deliver at</label> <select id="food-time">${opts}</select>`;
  body.appendChild(timeWrap);

  const tipWrap = document.createElement('div');
  tipWrap.className = 'dd-tips';
  tipWrap.innerHTML = '<span class="dim tiny">Tip</span>';
  for (const pct of FOOD_TUNING.tipOptions) {
    const btn = document.createElement('button');
    btn.className = `btn tiny${pct === totals.tipPct ? '' : ' btn-secondary'}`;
    btn.setAttribute('data-action', 'food.set-tip');
    btn.setAttribute('data-amount', String(Math.round(pct * 100)));
    btn.textContent = pct === 0 ? 'None' : `${Math.round(pct * 100)}%`;
    tipWrap.appendChild(btn);
  }
  body.appendChild(tipWrap);

  const summary = document.createElement('div');
  summary.className = 'dd-summary';
  summary.innerHTML = `
    <div><span>Subtotal</span><span>$${totals.subtotal}</span></div>
    <div><span>Delivery</span><span>$${totals.deliveryFee}</span></div>
    <div><span>Service fee</span><span>$${totals.serviceFee}</span></div>
    <div><span>Tip</span><span>$${totals.tip}</span></div>
    <div class="dd-total"><span>Total</span><span>$${totals.total}</span></div>
  `;
  body.appendChild(summary);

  const actions = document.createElement('div');
  actions.className = 'dd-actions';
  const place = document.createElement('button');
  place.className = 'btn tiny';
  place.setAttribute('data-action', 'food.place-order');
  place.textContent = `Place Order — $${totals.total}`;
  actions.appendChild(place);
  const clear = document.createElement('button');
  clear.className = 'btn tiny btn-secondary';
  clear.setAttribute('data-action', 'food.clear-cart');
  clear.textContent = 'Clear Cart';
  actions.appendChild(clear);
  body.appendChild(actions);
}

function renderDoorDropOrders(body, gs, app, screen) {
  const orders = [...(gs.world.foodOrders || [])].reverse();
  if (orders.length === 0) { body.innerHTML = '<p class="dim tiny">No orders yet.</p>'; return; }
  for (const order of orders.slice(0, 10)) {
    const def = RESTAURANT_DEFS[order.restaurantId];
    const driver = gs.npcs[order.driverNpcId];
    const eta = getFoodOrderEtaMinutes(order, gs.meta.clock);
    const lines = order.items.map(i => `${ITEM_DEFS[i.itemId]?.label || i.itemId}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
    const card = document.createElement('div');
    card.className = 'dd-order';
    // The ETA is the app's live surface: a placed order is a thing you sit
    // and wait for, so it counts down rather than just saying "ordered".
    const status = order.status === 'delivered'
      ? `<span class="cs-status-pill done">Delivered${order.handedTo === 'doormat' ? ' — left at the door' : ''}</span>`
      : eta > 0
        ? `<span class="cs-status-pill active">${eta} min away — arriving ${formatTime(order.arrivalTick * 30)}</span>`
        : '<span class="cs-status-pill active">At your door</span>';
    card.innerHTML = `
      <div class="dd-card-head"><span class="hc-card-title">${def?.label || order.restaurantId}</span><span class="dim tiny">$${order.total}</span></div>
      <div class="dim tiny">${lines}</div>
      <div class="dim tiny">Driver: ${driver?.bible?.name || 'assigned'}${order.tip ? ` — $${order.tip} tip` : ' — no tip'}</div>
      ${status}
    `;
    body.appendChild(card);
  }
}

// --- RoomList: listing-status hero, then applicant cards; the profile
// detail view (renderApplicantProfile, below) gets the same card
// treatment as its own screen. ---
function renderRoomListPost(body, gs, app, screen) {
  const c = gs.world.computer.apps.classifieds;
  const upgrades = gs.world.upgrades;
  const quality = getApartmentQuality(gs);
  const qualityPct = Math.round(quality * 100);
  const qualityLabel = quality < 0.2 ? 'Wreck' : quality < 0.4 ? 'Rough' : quality < 0.6 ? 'Decent' : quality < 0.8 ? 'Good' : 'Pristine';

  // Count current residents and available bedrooms
  const residents = Object.values(gs.npcs).filter(n => n.residency?.status === 'resident');
  const residentCount = residents.length + 1; // +1 for player
  const bedrooms = ALL_ROOMS.filter(id => ROOMS[id].type === 'bedroom');
  const availableBedrooms = bedrooms.filter(id => {
    if (ROOMS[id].isPlayer) return false;
    const occ = Object.values(gs.npcs).filter(n => n.residency?.room === id && n.residency?.status === 'resident');
    const cap = ROOMS[id].capacity || 2;
    return occ.length < cap && isBedroomHabitable(gs, id);
  });

  // --- Build the ad preview card ---
  const adCard = document.createElement('div');
  adCard.className = 'rl-ad-preview';

  // Ad title
  const adTitle = document.createElement('div');
  adTitle.className = 'rl-ad-title';
  adTitle.textContent = 'Roommate Wanted — Penthouse Apartment';
  adCard.appendChild(adTitle);

  // Ad summary line
  const summary = document.createElement('div');
  summary.className = 'rl-ad-summary dim tiny';
  summary.textContent = `${residentCount} resident${residentCount !== 1 ? 's' : ''} · ${availableBedrooms.length} room${availableBedrooms.length !== 1 ? 's' : ''} available · ${qualityLabel} (${qualityPct}% quality)`;
  adCard.appendChild(summary);

  // Description block
  const desc = document.createElement('div');
  desc.className = 'rl-ad-desc';
  desc.textContent = `Looking for a roommate to share our ${qualityLabel.toLowerCase()} ${bedrooms.length - 1}-bedroom penthouse apartment. Great natural light, all-day sun with amazing sunrise and sunset views. Being a penthouse, the only sounds up here are our own and maybe the occasional siren from below. We share common spaces, kitchen, and bathrooms. Rent is negotiable based on the room and apartment quality.`;
  adCard.appendChild(desc);

  // --- Amenities section ---
  const amenHeader = document.createElement('div');
  amenHeader.className = 'rl-ad-section-title';
  amenHeader.textContent = 'Amenities';
  adCard.appendChild(amenHeader);

  const amenGrid = document.createElement('div');
  amenGrid.className = 'rl-ad-amen-grid';

  // Group facilities and show their current tier
  for (const def of FACILITY_LIST) {
    const upgrade = upgrades?.[def.id];
    if (!upgrade) continue;
    const tierIdx = def.tiers.findIndex(t => t.tier === upgrade.tier);
    const tier = def.tiers[tierIdx];
    if (!tier || upgrade.tier === 'broken') continue;

    const pill = document.createElement('div');
    pill.className = 'rl-ad-amen-pill' + (upgrade.tier === 'upgraded' ? ' upgraded' : '');
    pill.innerHTML = `<span class="rl-ad-amen-name">${def.label}</span><span class="rl-ad-amen-tier">${tier.label}</span>`;
    amenGrid.appendChild(pill);
  }
  adCard.appendChild(amenGrid);

  // --- Room availability section ---
  const roomHeader = document.createElement('div');
  roomHeader.className = 'rl-ad-section-title';
  roomHeader.textContent = 'Available Rooms';
  adCard.appendChild(roomHeader);

  const roomList = document.createElement('div');
  roomList.className = 'rl-ad-room-list';
  if (availableBedrooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dim tiny';
    empty.textContent = 'No rooms available — all bedrooms are occupied or uninhabitable.';
    roomList.appendChild(empty);
  } else {
    for (const roomId of availableBedrooms) {
      const roomDef = ROOMS[roomId];
      const occ = Object.values(gs.npcs).filter(n => n.residency?.room === roomId && n.residency?.status === 'resident');
      const cap = roomDef.capacity || 2;
      const row = document.createElement('div');
      row.className = 'rl-ad-room-row';
      row.innerHTML = `<span class="rl-ad-room-name">${roomDef.name}</span><span class="dim tiny">${occ.length === 0 ? 'Private' : `Shared (${occ.length}/${cap})`}</span>`;
      roomList.appendChild(row);
    }
  }
  adCard.appendChild(roomList);

  // --- Rent info ---
  const rentInfo = document.createElement('div');
  rentInfo.className = 'rl-ad-rent-info dim tiny';
  const ceiling = roommateShareCeiling(quality);
  const ceilingPct = Math.round(ceiling * 100);
  const minShare = Math.round(ECONOMY.rent.total * ECONOMY.rent.minRoommateShare);
  const maxShare = Math.round(ECONOMY.rent.total * ceiling);
  rentInfo.textContent = `Rent: ${ECONOMY.rent.total}/mo total · Roommate share ${minShare}–${maxShare} (ceiling ${ceilingPct}% based on quality)`;
  adCard.appendChild(rentInfo);

  body.appendChild(adCard);

  // --- Action buttons ---
  const actionRow = document.createElement('div');
  actionRow.className = 'rl-ad-actions';

  if (c.posted.active) {
    const status = document.createElement('div');
    status.className = 'rl-ad-posted-status';
    status.innerHTML = `<strong>Listing Active</strong> <span class="dim tiny">— posted Day ${c.posted.postedDay}. Applicants will appear on the Browse tab.</span>`;
    actionRow.appendChild(status);
    const browseBtn = document.createElement('button');
    browseBtn.className = 'btn tiny';
    browseBtn.setAttribute('data-action', 'computer.open-screen');
    browseBtn.setAttribute('data-app', app.id);
    browseBtn.setAttribute('data-screen', 'browse');
    browseBtn.textContent = 'Browse Applicants';
    actionRow.appendChild(browseBtn);
  } else {
    const canPost = availableBedrooms.length > 0;
    const postBtn = document.createElement('button');
    postBtn.className = 'btn' + (canPost ? '' : ' disabled');
    postBtn.setAttribute('data-action', 'classifieds.post');
    if (!canPost) postBtn.disabled = true;
    postBtn.textContent = canPost ? 'Post This Ad' : 'No Rooms Available';
    actionRow.appendChild(postBtn);
    if (!canPost) {
      const note = document.createElement('div');
      note.className = 'dim tiny';
      note.textContent = 'Repair a bedroom via RenoFix to make it habitable, then post your ad.';
      actionRow.appendChild(note);
    }
  }
  body.appendChild(actionRow);

  // Studio link — always available so the player can create custom
  // characters regardless of listing status
  const studioRow = document.createElement('div');
  studioRow.style.marginTop = 'var(--space-2)';
  const studioBtn = document.createElement('button');
  studioBtn.className = 'btn btn-secondary tiny';
  studioBtn.setAttribute('data-action', 'computer.open-screen');
  studioBtn.setAttribute('data-app', app.id);
  studioBtn.setAttribute('data-screen', 'studio');
  studioBtn.textContent = 'Character Studio';
  studioRow.appendChild(studioBtn);
  body.appendChild(studioRow);
}

function renderRoomListApplicants(body, gs, app, screen) {
  const c = gs.world.computer.apps.classifieds;
  if (c.applicants.length === 0) { body.innerHTML = '<p class="dim tiny">No applicants yet — use the Studio to create one, or browse the listings.</p>'; return; }
  const grid = document.createElement('div');
  grid.className = 'rl-grid';
  for (const npcId of c.applicants) {
    const npc = gs.npcs[npcId];
    if (!npc) continue;
    const isFav = (c.favorites || []).includes(npcId);
    const card = document.createElement('div');
    card.className = 'rl-card';
    card.setAttribute('data-action', 'classifieds.view-applicant');
    card.setAttribute('data-row-id', npcId);
    card.innerHTML = `
      <div class="rl-card-avatar" style="background: ${hashToColor(npc.bible.name)};">${npc.bible.name.charAt(0)}</div>
      <div class="rl-card-name">${npc.bible.name}${isFav ? ' <span class="rl-card-star">★</span>' : ''}</div>
      <div class="dim tiny">${npc.bible.occupation.title}</div>
      <div class="dim tiny" style="margin-top:2px;">${npc.bible.age} · ${(npc.bible.gender || '').replace('_', ' ')} · ${npc.bible.occupation.incomeBand} income</div>
    `;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

// --- Phase 1/2: RoomList browse grid — 30 cheap deterministic stubs per
// day, with a filter bar (gender, income, age range, sort) and a fetch
// queue badge. Stubs that have been promoted to full NPCs (status
// 'ready') open the profile directly; unpromoted stubs enqueue an async
// fetch job (Phase 3). ---
function renderRoomListBrowse(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const stubs = getVisibleStubs(gs);
  const f = classifieds.filters || { gender: [], incomeBand: [], ageRange: [18, 60], sortBy: 'recent' };

  // Header with day + count + queue badge
  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  if (!classifieds.posted.active) {
    hero.innerHTML = `
      <div class="rl-hero-title">No Active Listing</div>
      <div class="dim tiny">Post an ad to attract applicants to browse.</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'computer.open-screen');
    btn.setAttribute('data-app', 'classifieds');
    btn.setAttribute('data-screen', 'post');
    btn.textContent = 'Post a Listing';
    hero.appendChild(btn);
    body.appendChild(hero);
    return;
  }

  // Queue badge — shows count of ready + fetching profiles
  const readyCount = (classifieds.fetchQueue || []).filter(q => q.status === 'ready').length;
  const fetchingCount = (classifieds.fetchQueue || []).filter(q => q.status === 'fetching').length;
  const queueTotal = readyCount + fetchingCount;

  const heroTop = document.createElement('div');
  heroTop.style.display = 'flex';
  heroTop.style.justifyContent = 'space-between';
  heroTop.style.width = '100%';
  heroTop.style.alignItems = 'center';
  heroTop.innerHTML = `<div class="rl-hero-title">RoomList — Day ${classifieds.activeDay}</div>`;

  if (queueTotal > 0) {
    const queueBtn = document.createElement('button');
    queueBtn.className = 'btn tiny' + (readyCount > 0 ? '' : ' btn-secondary');
    queueBtn.setAttribute('data-action', 'classifieds.open-queue');
    queueBtn.innerHTML = `Inbox${readyCount > 0 ? ` <span class="rl-queue-badge">${readyCount}</span>` : (fetchingCount > 0 ? ' …' : '')}`;
    heroTop.appendChild(queueBtn);
  }
  hero.appendChild(heroTop);

  const countLine = document.createElement('div');
  countLine.className = 'dim tiny';
  countLine.textContent = `${stubs.length} of ${classifieds.stubs[classifieds.activeDay]?.length || 0} applicants${f.gender.length || f.incomeBand.length ? ' matching filters' : ''}. New listings every day.`;
  hero.appendChild(countLine);
  body.appendChild(hero);

  // --- Filter bar ---
  const filterBar = document.createElement('div');
  filterBar.className = 'rl-filter-bar';

  // Gender toggles
  const genderGroup = document.createElement('div');
  genderGroup.className = 'rl-filter-group';
  const genderLabel = document.createElement('span');
  genderLabel.className = 'rl-filter-label dim tiny';
  genderLabel.textContent = 'Gender:';
  genderGroup.appendChild(genderLabel);
  const genders = [
    { val: 'female', label: 'Female' },
    { val: 'male', label: 'Male' },
    { val: 'futanari', label: 'Futanari' },
    { val: 'trans_male', label: 'Trans Male' },
    { val: 'trans_female', label: 'Trans Female' },
  ];
  for (const g of genders) {
    const btn = document.createElement('button');
    const active = f.gender.includes(g.val);
    btn.className = 'btn tiny rl-filter-btn' + (active ? ' active' : '');
    btn.setAttribute('data-action', 'classifieds.filter-toggle');
    btn.setAttribute('data-row-id', `gender:${g.val}`);
    btn.textContent = g.label;
    genderGroup.appendChild(btn);
  }

  // Income toggles
  const incomeGroup = document.createElement('div');
  incomeGroup.className = 'rl-filter-group';
  const incomeLabel = document.createElement('span');
  incomeLabel.className = 'rl-filter-label dim tiny';
  incomeLabel.textContent = 'Income:';
  incomeGroup.appendChild(incomeLabel);
  const incomes = [
    { val: 'high', label: 'High' },
    { val: 'mid', label: 'Mid' },
    { val: 'low', label: 'Low' },
  ];
  for (const inc of incomes) {
    const btn = document.createElement('button');
    const active = f.incomeBand.includes(inc.val);
    btn.className = 'btn tiny rl-filter-btn' + (active ? ' active' : '');
    btn.setAttribute('data-action', 'classifieds.filter-toggle');
    btn.setAttribute('data-row-id', `incomeBand:${inc.val}`);
    btn.textContent = inc.label;
    incomeGroup.appendChild(btn);
  }

  // Sort buttons
  const sortGroup = document.createElement('div');
  sortGroup.className = 'rl-filter-group';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'rl-filter-label dim tiny';
  sortLabel.textContent = 'Sort:';
  sortGroup.appendChild(sortLabel);
  const sorts = [
    { val: 'recent', label: 'Recent' },
    { val: 'age', label: 'Age' },
    { val: 'name', label: 'Name' },
    { val: 'income', label: 'Income' },
  ];
  for (const s of sorts) {
    const btn = document.createElement('button');
    const active = f.sortBy === s.val;
    btn.className = 'btn tiny rl-filter-btn' + (active ? ' active' : '');
    btn.setAttribute('data-action', 'classifieds.sort');
    btn.setAttribute('data-row-id', s.val);
    btn.textContent = s.label;
    sortGroup.appendChild(btn);
  }

  // Clear button
  const hasFilters = f.gender.length > 0 || f.incomeBand.length > 0 || f.sortBy !== 'recent';
  if (hasFilters) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary tiny rl-filter-btn';
    clearBtn.setAttribute('data-action', 'classifieds.clear-filters');
    clearBtn.textContent = 'Clear';
    sortGroup.appendChild(clearBtn);
  }

  // Phase 7: Favorites filter toggle
  const favCount = (classifieds.favorites || []).length;
  if (favCount > 0) {
    const favBtn = document.createElement('button');
    const favActive = !!f.favoritesOnly;
    favBtn.className = 'btn tiny rl-filter-btn' + (favActive ? ' active' : '');
    favBtn.setAttribute('data-action', 'classifieds.toggle-fav-filter');
    favBtn.textContent = `★ Saved (${favCount})`;
    sortGroup.appendChild(favBtn);
  }

  filterBar.appendChild(genderGroup);
  filterBar.appendChild(incomeGroup);
  filterBar.appendChild(sortGroup);
  body.appendChild(filterBar);

  // Grid
  if (stubs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dim tiny';
    empty.style.padding = 'var(--space-3)';
    empty.textContent = 'No applicants match your filters.';
    body.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'rl-grid';
  for (const stub of stubs) {
    const card = document.createElement('div');
    card.className = 'rl-card';
    card.setAttribute('data-action', 'classifieds.view-stub');
    card.setAttribute('data-row-id', stub.stubId);
    const genderLabel = stub.gender.replace('_', ' ');
    const statusBadge = stub.status === 'ready' ? ' <span class="rl-card-status">✓</span>' : stub.status === 'fetching' ? ' <span class="rl-card-status">…</span>' : '';
    const isFav = stub.fullNpcId && (classifieds.favorites || []).includes(stub.fullNpcId);
    const star = isFav ? ' <span class="rl-card-star">★</span>' : '';
    card.innerHTML = `
      <div class="rl-card-avatar" style="background: ${hashToColor(stub.name)};">${stub.name.charAt(0)}</div>
      <div class="rl-card-name">${stub.name}${statusBadge}${star}</div>
      <div class="dim tiny">${stub.age} · ${genderLabel} · ${stub.occupation.title}</div>
      <div class="dim tiny" style="margin-top:2px;">${stub.coreTrait} · ${stub.occupation.incomeBand} income</div>
    `;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

// --- Phase 3: Fetch queue (inbox) — shows in-progress and ready profile
// fetches. Ready entries open the full profile; fetching entries show a
// spinner. This is the "inbox" the player checks after enquiring about
// applicants while browsing. ---
function renderRoomListQueue(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const queue = classifieds.fetchQueue || [];

  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = '<div class="rl-hero-title">Profile Inbox</div>';
  hero.innerHTML += '<div class="dim tiny">Profiles you\'ve requested will appear here when ready.</div>';
  body.appendChild(hero);

  if (queue.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dim tiny';
    empty.style.padding = 'var(--space-3)';
    empty.textContent = 'No profiles in your inbox. Click an applicant on the Browse tab to load their full profile here.';
    body.appendChild(empty);
    return;
  }

  // Show ready entries first, then fetching
  const sorted = [...queue].sort((a, b) => {
    const order = { ready: 0, fetching: 1, error: 2 };
    return (order[a.status] || 9) - (order[b.status] || 9);
  });

  for (const entry of sorted) {
    const row = document.createElement('div');
    row.className = 'rl-queue-row';
    if (entry.status === 'ready') {
      row.setAttribute('data-action', 'classifieds.view-stub');
      row.setAttribute('data-row-id', entry.stubId);
      row.style.cursor = 'pointer';
    }
    const avatar = document.createElement('div');
    avatar.className = 'rl-card-avatar rl-queue-avatar';
    avatar.style.background = hashToColor(entry.name || '?');
    avatar.style.width = '36px';
    avatar.style.height = '36px';
    avatar.style.fontSize = 'var(--fs-sm)';
    avatar.textContent = (entry.name || '?').charAt(0);

    const info = document.createElement('div');
    info.className = 'rl-queue-info';
    info.innerHTML = `<div class="rl-queue-name">${entry.name}</div><div class="dim tiny">${entry.occupation}</div>`;

    const status = document.createElement('div');
    status.className = 'rl-queue-status';
    if (entry.status === 'ready') {
      status.innerHTML = '<span style="color:var(--color-positive);">✓ Ready — click to view</span>';
    } else if (entry.status === 'fetching') {
      status.innerHTML = '<span class="dim tiny">Loading…</span>';
    } else {
      status.innerHTML = '<span style="color:var(--color-negative);">Failed</span>';
    }

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(status);
    body.appendChild(row);
  }
}

// --- Phase 4: Character Studio — a full character builder with every
// bible field exposed. The player manually fills in whatever they want;
// empty fields are rolled when the character is finalized. Includes a
// live preview card and a "Generate with AI" section (Phase 5). ---
function renderRoomListStudio(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const studio = classifieds.studio || (classifieds.studio = { draft: {}, aiBusy: false, aiPrompt: '', preview: null });
  const d = studio.draft || (studio.draft = {});

  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = '<div class="rl-hero-title">Character Studio</div><div class="dim tiny">Build a character from scratch. Leave fields empty to let them be rolled randomly.</div>';
  body.appendChild(hero);

  // --- AI Generation section (Phase 5) ---
  const aiSection = document.createElement('div');
  aiSection.className = 'rl-studio-section';
  aiSection.innerHTML = '<div class="rl-studio-section-title">AI Generate</div>';
  const aiInput = document.createElement('textarea');
  aiInput.className = 'rl-studio-ai-input';
  aiInput.id = 'studio-ai-input';
  aiInput.placeholder = 'Describe a character... e.g. "A shy 25-year-old barista who collects vinyl records and is afraid of commitment"';
  aiInput.value = studio.aiPrompt || '';
  aiInput.rows = 2;
  aiSection.appendChild(aiInput);
  const aiBtn = document.createElement('button');
  aiBtn.className = 'btn tiny';
  aiBtn.setAttribute('data-action', 'classifieds.studio-ai-generate');
  aiBtn.textContent = studio.aiBusy ? 'Generating…' : 'Generate with AI';
  if (studio.aiBusy) aiBtn.disabled = true;
  aiSection.appendChild(aiBtn);
  body.appendChild(aiSection);

  // --- Identity section ---
  const idSection = document.createElement('div');
  idSection.className = 'rl-studio-section';
  idSection.innerHTML = '<div class="rl-studio-section-title">Identity</div>';

  // Name
  idSection.appendChild(studioTextField('Name', 'name', d.name || '', 'First name only'));
  // Age
  idSection.appendChild(studioNumberField('Age', 'age', d.age, 18, 60));
  // Gender
  const genderOpts = [
    { val: '', label: '— Random —' },
    { val: 'female', label: 'Female' },
    { val: 'male', label: 'Male' },
    { val: 'futanari', label: 'Futanari' },
    { val: 'trans_male', label: 'Trans Male' },
    { val: 'trans_female', label: 'Trans Female' },
  ];
  idSection.appendChild(studioSelectField('Gender', 'gender', d.gender || '', genderOpts));
  // Occupation
  const occCats = [{ val: '', label: '— Random —' }];
  for (const cat of [...new Set(OCCUPATION_POOL.map(o => o.category))]) {
    occCats.push({ val: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) });
  }
  idSection.appendChild(studioSelectField('Occupation', 'occupationCategory', d.occupationCategory || '', occCats));
  body.appendChild(idSection);

  // --- Temperament section ---
  const tempSection = document.createElement('div');
  tempSection.className = 'rl-studio-section';
  tempSection.innerHTML = '<div class="rl-studio-section-title">Temperament (−1 to 1)</div>';
  const axes = ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness', 'selfAwareness'];
  for (const axis of axes) {
    const val = d.temperament && typeof d.temperament[axis] === 'number' ? d.temperament[axis] : 0;
    const checked = d.temperament && typeof d.temperament[axis] === 'number';
    tempSection.appendChild(studioSliderField(axis, axis, val, -1, 1, 0.1, checked));
  }
  body.appendChild(tempSection);

  // --- Personality section ---
  const persSection = document.createElement('div');
  persSection.className = 'rl-studio-section';
  persSection.innerHTML = '<div class="rl-studio-section-title">Personality</div>';
  persSection.appendChild(studioPoolPicker('Traits (3-5)', 'personality.traits', PERSONALITY_TRAITS_POOL, d.personality?.traits, 5));
  persSection.appendChild(studioPoolPicker('Quirks (2-4)', 'personality.quirks', QUIRKS_POOL, d.personality?.quirks, 4));
  persSection.appendChild(studioPoolPicker('Likes (3-5)', 'personality.likes', LIKES_POOL, d.personality?.likes, 5));
  persSection.appendChild(studioPoolPicker('Dislikes (3-5)', 'personality.dislikes', DISLIKES_POOL, d.personality?.dislikes, 5));
  body.appendChild(persSection);

  // --- Narrative section ---
  const narSection = document.createElement('div');
  narSection.className = 'rl-studio-section';
  narSection.innerHTML = '<div class="rl-studio-section-title">Narrative</div>';
  narSection.appendChild(studioPoolPicker('Interests (2-3)', 'interests', INTEREST_POOL.map(i => i.name), d.interests, 3));
  narSection.appendChild(studioPoolPicker('Values (2)', 'values', VALUES_POOL.map(v => v.name), d.values, 2));
  narSection.appendChild(studioTextArea('Baggage', 'baggage', d.baggage || '', 'Past burden', 300));
  narSection.appendChild(studioTextArea('Wound', 'wound', d.wound || '', 'Deepest emotional wound', 300));
  narSection.appendChild(studioTextArea('Want', 'want', d.want || '', 'What they want now', 300));
  narSection.appendChild(studioTextArea('Blind Spot', 'blindSpot', d.blindSpot || '', 'Self-delusion', 300));
  narSection.appendChild(studioTextArea('Boundary', 'boundary', d.boundary || '', 'Hard boundary they enforce', 300));
  body.appendChild(narSection);

  // --- Prose section ---
  const proseSection = document.createElement('div');
  proseSection.className = 'rl-studio-section';
  proseSection.innerHTML = '<div class="rl-studio-section-title">Prose (optional)</div>';
  proseSection.appendChild(studioTextArea('History', 'history', d.history || '', 'How they ended up here', 600));
  proseSection.appendChild(studioTextArea('Sketch', 'sketch', d.sketch || '', 'One-line vibe summary', 120));
  body.appendChild(proseSection);

  // --- Actions ---
  const actionRow = document.createElement('div');
  actionRow.className = 'rl-studio-actions';
  const createBtn = document.createElement('button');
  createBtn.className = 'btn';
  createBtn.setAttribute('data-action', 'classifieds.studio-create');
  createBtn.textContent = 'Create Character';
  actionRow.appendChild(createBtn);
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-secondary';
  clearBtn.setAttribute('data-action', 'classifieds.studio-clear');
  clearBtn.textContent = 'Clear Draft';
  actionRow.appendChild(clearBtn);
  body.appendChild(actionRow);
}

// Studio field helpers
function studioTextField(label, field, value, placeholder) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rl-studio-input';
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute('data-studio-field', field);
  wrap.appendChild(input);
  return wrap;
}

function studioNumberField(label, field, value, min, max) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'rl-studio-input';
  input.value = value ?? '';
  input.min = min;
  input.max = max;
  input.setAttribute('data-studio-field', field);
  wrap.appendChild(input);
  return wrap;
}

function studioSelectField(label, field, value, options) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  const select = document.createElement('select');
  select.className = 'rl-studio-input';
  select.setAttribute('data-studio-field', field);
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.val;
    o.textContent = opt.label;
    if (opt.val === value) o.selected = true;
    select.appendChild(o);
  }
  wrap.appendChild(select);
  return wrap;
}

function studioSliderField(label, field, value, min, max, step, checked) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  const id = `studio-slider-${field}`;
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}: <span id="${id}-val" class="rl-studio-slider-val">${checked ? value.toFixed(1) : '—'}</span></label>`;
  const row = document.createElement('div');
  row.className = 'rl-studio-slider-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'rl-studio-checkbox';
  cb.checked = checked;
  cb.setAttribute('data-studio-field', `temperament.${field}.enabled`);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;
  slider.className = 'rl-studio-slider';
  slider.setAttribute('data-studio-field', `temperament.${field}`);
  if (!checked) slider.disabled = true;
  // Phase 5 (phone parity): scope the value read to this field's own wrap
  // — the same studio screen can now be open on the phone and the
  // computer at once, and getElementById would grab the *first* matching
  // id in the document (the other shell's slider) and update the wrong
  // label.
  slider.addEventListener('input', (e) => {
    const valEl = wrap.querySelector(`#${id}-val`);
    if (valEl) valEl.textContent = parseFloat(e.target.value).toFixed(1);
  });
  row.appendChild(cb);
  row.appendChild(slider);
  wrap.appendChild(row);
  return wrap;
}

function studioTextArea(label, field, value, placeholder, maxLength) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  const ta = document.createElement('textarea');
  ta.className = 'rl-studio-input';
  ta.value = value;
  ta.placeholder = placeholder;
  if (maxLength) ta.maxLength = maxLength;
  ta.rows = 2;
  ta.setAttribute('data-studio-field', field);
  wrap.appendChild(ta);
  return wrap;
}

function studioPoolPicker(label, field, pool, selected, max) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  const selectedSet = new Set(selected || []);
  const grid = document.createElement('div');
  grid.className = 'rl-studio-pool-grid';
  for (const item of pool) {
    const name = typeof item === 'string' ? item : item.name;
    const btn = document.createElement('button');
    btn.className = 'btn tiny rl-filter-btn rl-studio-pool-btn' + (selectedSet.has(name) ? ' active' : '');
    btn.setAttribute('data-action', 'classifieds.studio-toggle-pool');
    btn.setAttribute('data-row-id', `${field}:${name}`);
    btn.textContent = name;
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);
  return wrap;
}

// --- Room assignment screen: the player picks which bedroom the
// prospective roommate moves into. Shows each viable bedroom (excluding
// the player's own) with its current occupancy, habitability status, and
// whether a double-up is allowed (couples only). Clicking a room confirms
// the assignment via the classifieds.accept action. ---
function renderRoomListAssign(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const npcId = classifieds.assigningNpcId || classifieds.viewingApplicantId;
  const npc = gs.npcs[npcId];
  if (!npc) { body.innerHTML = '<p class="dim">No applicant selected.</p>'; return; }
  const b = npc.bible;

  // Header
  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = `
    <div class="rl-hero-title">Assign Room</div>
    <div class="dim tiny">Choose a bedroom for <strong>${b.name}</strong> to move into.</div>
  `;
  body.appendChild(hero);

  // Build the list of assignable bedrooms (exclude player's own room)
  const bedrooms = ALL_ROOMS.filter(id => ROOMS[id].type === 'bedroom' && !ROOMS[id].isPlayer);

  for (const roomId of bedrooms) {
    const roomDef = ROOMS[roomId];
    const habitable = isBedroomHabitable(gs, roomId);
    const occupants = Object.entries(gs.npcs)
      .filter(([, n]) => n.residency.room === roomId && n.residency.status === 'resident');
    const capacity = roomDef.capacity || 2;
    const isFull = occupants.length >= capacity;

    // Can this NPC move in here? Empty + habitable, or a spare bed where
    // they're the partner of the existing resident.
    let canAssign = habitable && !isFull;
    let reason = '';
    if (!habitable) reason = 'Uninhabitable — repair via RenoFix';
    else if (isFull) reason = 'Full';
    else if (occupants.length > 0) {
      const existing = occupants[0][1];
      const isPartner = npc.residency.partnerOf === occupants[0][0]
        || existing.residency.partnerOf === npcId;
      if (!isPartner) {
        canAssign = false;
        reason = `${existing.bible?.name || 'Someone'} already lives here — couples only`;
      }
    }

    const card = document.createElement('div');
    card.className = 'rl-assign-card' + (canAssign ? ' rl-assign-available' : ' rl-assign-disabled');

    // Room info
    const info = document.createElement('div');
    info.className = 'rl-assign-info';
    const occNames = occupants.map(([, n]) => n.bible?.name || 'Unknown').join(', ');
    const occStr = occupants.length === 0 ? 'Empty' : `${occNames} (${occupants.length}/${capacity})`;
    info.innerHTML = `
      <div class="rl-assign-name">${roomDef.name}</div>
      <div class="dim tiny">Capacity ${capacity} · ${occStr}</div>
    `;
    card.appendChild(info);

    // Status or action button
    if (canAssign) {
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.setAttribute('data-action', 'classifieds.accept');
      btn.setAttribute('data-row-id', npcId);
      btn.setAttribute('data-room-id', roomId);
      btn.textContent = occupants.length > 0 ? 'Assign (Share)' : 'Assign';
      card.appendChild(btn);
    } else {
      const status = document.createElement('span');
      status.className = 'rl-assign-status dim tiny';
      status.textContent = reason;
      card.appendChild(status);
    }
    body.appendChild(card);
  }

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-app', app.id);
  backBtn.setAttribute('data-screen', 'detail');
  backBtn.textContent = 'Back to Profile';
  body.appendChild(backBtn);
}

// --- IM: a real two-pane messenger — thread sidebar always visible next
// to whichever conversation is open, rather than separate full-body
// screens for "list of threads" and "one open thread." ---
function renderMessages(body, gs, app, screen) {
  const im = gs.world.computer.apps.im;
  // Phase 7: include prospective NPCs (applicants the player is interviewing)
  // alongside residents in the contact list, so the Interview button on a
  // RoomList profile can open a real conversation with them.
  // Contacts (external-world plan Phase 2): externals are listed by earned
  // contact, NOT by status. This replaced a blanket 'visitor' clause — with
  // externals persisting forever, that would have auto-populated the list
  // with every delivery driver and escort the player ever saw. Del still
  // appears because he's seeded contactKnown at new-game setup.
  const contactIds = Object.keys(gs.npcs).filter(id =>
    gs.npcs[id].residency.status === 'resident'
    || gs.npcs[id].residency.status === 'prospective'
    || gs.npcs[id].contactKnown === true
  );

  const layout = document.createElement('div');
  layout.className = 'im-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'im-sidebar';
  if (contactIds.length === 0) sidebar.innerHTML = '<p class="dim tiny">No one to text yet.</p>';
  for (const npcId of contactIds) {
    const npc = gs.npcs[npcId];
    const thread = im.threads[npcId];
    const unread = thread?.unread || 0;
    const lastMsg = thread?.msgs?.[thread.msgs.length - 1];
    const row = document.createElement('div');
    row.className = 'im-thread-row' + (im.viewingNpcId === npcId ? ' active' : '');
    row.setAttribute('data-action', 'im.open-thread');
    row.setAttribute('data-row-id', npcId);
    row.innerHTML = `
      <div class="im-avatar" style="background: ${hashToColor(npc.bible?.name || npcId)};">${(npc.bible?.name || '?').charAt(0)}</div>
      <div class="im-thread-info">
        <div class="im-thread-name">${npc.bible?.name || 'Unknown'}${npc.residency?.status === 'prospective' ? ' <span class="im-thread-tag">applicant</span>' : ''}</div>
        <div class="im-thread-preview dim tiny">${lastMsg ? truncateText(lastMsg.text, 34) : 'Say hi'}</div>
      </div>
      ${unread ? `<div class="im-unread-badge">${unread}</div>` : ''}
    `;
    sidebar.appendChild(row);
  }
  layout.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'im-pane';
  const npc = gs.npcs[im.viewingNpcId];
  if (!npc) {
    pane.innerHTML = '<p class="dim">Select a conversation.</p>';
  } else {
    const thread = im.threads[im.viewingNpcId] || { msgs: [] };
    const header = document.createElement('div');
    header.className = 'im-chat-header';
    header.innerHTML = `
      <div class="im-avatar" style="background: ${hashToColor(npc.bible?.name || im.viewingNpcId)};">${(npc.bible?.name || '?').charAt(0)}</div>
      <div class="im-chat-name">${npc.bible?.name || 'Unknown'}</div>
    `;
    // Invitations (external-world plan Phase 2): inviting someone over is a
    // messaging-app action — you need their number first, which is exactly
    // what being in this list means. Residents already live here, and Del
    // comes when there's a job, so neither is invitable.
    if (npc.residency?.status !== 'resident' && im.viewingNpcId !== CONTRACTOR_ID) {
      const invite = document.createElement('button');
      invite.className = 'btn tiny im-invite-btn';
      invite.setAttribute('data-action', 'im.invite');
      invite.setAttribute('data-row-id', im.viewingNpcId);
      invite.textContent = 'Invite Over';
      header.appendChild(invite);
    }
    pane.appendChild(header);

    const log = document.createElement('div');
    log.className = 'im-msg-log';
    let lastDay = null;
    for (const m of thread.msgs) {
      if (m.day !== lastDay) {
        const divider = document.createElement('div');
        divider.className = 'im-day-divider';
        divider.textContent = `Day ${m.day}`;
        log.appendChild(divider);
        lastDay = m.day;
      }
      const bubble = document.createElement('div');
      bubble.className = 'im-msg-bubble';
      bubble.setAttribute('data-from', m.from);
      const timeStr = formatTime(m.tick * 30);
      bubble.innerHTML = m.from === 'system'
        ? `<div class="im-msg-text dim">${m.text}</div>`
        : `<div class="im-msg-text">${m.text}</div><div class="im-msg-time">${timeStr}</div>`;
      // BrineOS Phase 8.5: a shared photo attaches a thumbnail to its
      // bubble. The record can be gone (roll eviction past CAMERA.rollCap
      // outlives the message referencing it) — degrade to a text note
      // rather than a broken image or a crash.
      if (m.photoId) {
        const photo = gs.world.phone?.camera?.roll?.find(p => p.id === m.photoId);
        if (photo) {
          const thumb = document.createElement('img');
          thumb.className = 'im-msg-photo';
          thumb.alt = photo.caption;
          thumb.src = getPlaceholder();
          bubble.insertBefore(thumb, bubble.firstChild);
          getPhotoImage(photo).then(result => { if (result.url) thumb.src = result.url; });
        } else {
          const gone = document.createElement('div');
          gone.className = 'im-msg-text dim';
          gone.textContent = '[photo no longer available]';
          bubble.insertBefore(gone, bubble.firstChild);
        }
      }
      log.appendChild(bubble);
    }
    pane.appendChild(log);

    const inputRow = document.createElement('div');
    inputRow.className = 'im-input-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'cs-chat-input';
    input.placeholder = `Text ${npc.bible?.name || 'them'}...`;
    input.className = 'im-input';
    // Enter sends (Shift+Enter inserts a newline-free newline — there's
    // no newline in a single-line input, so Enter is always send). The
    // guard inside doImSend handles the case where the user mashes Enter
    // while a previous send is still in flight.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAction('im.send', null, { rowId: im.viewingNpcId });
      }
    });
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn tiny im-send-btn';
    sendBtn.setAttribute('data-action', 'im.send');
    sendBtn.setAttribute('data-row-id', im.viewingNpcId);
    sendBtn.textContent = 'Send';
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    pane.appendChild(inputRow);

    // Auto-scroll to the bottom of the message log after render so the
    // newest messages are visible without manual scrolling.
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }
  layout.appendChild(pane);
  body.appendChild(layout);
}

function truncateText(str, n) {
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
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

// Phase 5: build an itemised usage breakdown for a metered bill. Returns
// an HTML string of meter line-items ("Showers 5 · Heat 30d · Computer 12h")
// or null if the bill isn't metered or has no usage this cycle.
function buildUsageBreakdown(gs, billId) {
  if (!gs.world.utilities) return null;
  const lines = [];
  for (const [key, meter] of Object.entries(UTILITY_METER)) {
    if (meter.bill !== billId) continue;
    const util = gs.world.utilities[key];
    if (!util || !util.count) continue;
    const count = util.count;
    // Format the count nicely: HVAC shows days, devices shows hours,
    // everything else shows the raw count with the meter's unit label.
    let display;
    if (key === 'hvac') {
      display = `${util.daysAccrued || Math.round(count)}d`;
    } else if (key === 'devices') {
      display = `${count}h`;
    } else {
      display = `${count} ${meter.unit}${count !== 1 ? 's' : ''}`;
    }
    lines.push(`${meterLabels[key] || key}: ${display}`);
  }
  return lines.length > 0 ? lines.join(' · ') : null;
}

const meterLabels = {
  hvac: 'Heat/Cool',
  waterHeating: 'Water heat',
  showers: 'Showers',
  laundry: 'Laundry',
  dishes: 'Dishes',
  cooking: 'Cooking',
  devices: 'Devices',
};

// --- Phase 6: Tax panel (inside the bills dashboard) ---
// Shows the current quarter's accumulated gross, estimated tax owed,
// deductions so far, the auto-reserve toggle, the reserve balance, and
// any back taxes owed. This is where the player manages the largest
// single obligation in the game — it sits at the top of the bills screen
// because it's the thing that makes the budget a budget.
function renderTaxPanel(body, gs) {
  const taxes = gs.world.taxes;
  if (!taxes) return;
  const day = gs.meta.clock.day;
  const quarter = getQuarter(day);
  const quarterDay = getQuarterDay(day);
  const daysLeft = CALENDAR.daysPerQuarter - quarterDay;
  const { taxableGross, deductions, owed } = computeTaxOwed(gs);
  const reserve = taxes.reserve || 0;
  const unpaid = taxes.unpaid || 0;

  const panel = document.createElement('div');
  panel.className = 'tax-panel';

  // Header: quarter label + days remaining
  const header = document.createElement('div');
  header.className = 'tax-header';
  header.innerHTML = '<span class="tax-title">Estimated Taxes</span>' +
    '<span class="tax-quarter">Q' + (quarter + 1) + ' \u00b7 ' + daysLeft + 'd left</span>';
  panel.appendChild(header);

  // Progress bar: how far through the quarter
  const progress = document.createElement('div');
  progress.className = 'tax-progress-bar';
  const pct = Math.round((quarterDay / CALENDAR.daysPerQuarter) * 100);
  progress.innerHTML = '<div class="tax-progress-fill" style="width:' + pct + '%"></div>';
  panel.appendChild(progress);

  // Numbers grid: gross, deductions, estimated owed, reserve, back taxes
  const grid = document.createElement('div');
  grid.className = 'tax-numbers';
  const rows = [
    { label: 'Quarter gross', value: '$' + (taxes.quarterGross || 0), cls: 'tax-gross' },
    { label: 'Deductions', value: '$' + deductions, cls: 'tax-deductions' },
    { label: 'Estimated owed', value: '$' + owed, cls: 'tax-owed' },
    { label: 'Reserve', value: '$' + reserve, cls: reserve > 0 ? 'tax-reserve' : '' },
  ];
  if (unpaid > 0) {
    rows.push({ label: 'Back taxes', value: '$' + unpaid, cls: 'tax-unpaid' });
  }
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tax-number-row ' + r.cls;
    row.innerHTML = '<span class="tax-number-label">' + r.label + '</span>' +
      '<span class="tax-number-value">' + r.value + '</span>';
    grid.appendChild(row);
  }
  panel.appendChild(grid);

  // Auto-reserve toggle
  const toggleDiv = document.createElement('div');
  toggleDiv.className = 'tax-toggle-row';
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn tiny tax-toggle-btn' + (taxes.autoReserve ? ' on' : '');
  toggleBtn.setAttribute('data-action', 'taxes.toggle-reserve');
  toggleBtn.textContent = taxes.autoReserve ? 'Auto-Reserve: ON' : 'Auto-Reserve: OFF';
  toggleDiv.appendChild(toggleBtn);
  const toggleNote = document.createElement('span');
  toggleNote.className = 'dim tiny tax-toggle-note';
  toggleNote.textContent = taxes.autoReserve
    ? '27% of each gig payout is set aside automatically.'
    : 'Skim 27% of each gig into a protected reserve.';
  toggleDiv.appendChild(toggleNote);
  panel.appendChild(toggleDiv);

  // Actions: pay back taxes, withdraw from reserve
  const actions = document.createElement('div');
  actions.className = 'tax-actions';
  if (unpaid > 0) {
    const payBtn = document.createElement('button');
    payBtn.className = 'btn tiny tax-pay-btn';
    payBtn.setAttribute('data-action', 'taxes.pay');
    payBtn.setAttribute('data-amount', unpaid);
    payBtn.textContent = 'Pay Back Taxes $' + unpaid;
    actions.appendChild(payBtn);
  }
  if (reserve > 0) {
    const withdrawBtn = document.createElement('button');
    withdrawBtn.className = 'btn tiny tax-withdraw-btn';
    withdrawBtn.setAttribute('data-action', 'taxes.withdraw-reserve');
    withdrawBtn.setAttribute('data-amount', reserve);
    withdrawBtn.textContent = 'Withdraw Reserve $' + reserve;
    actions.appendChild(withdrawBtn);
  }
  if (actions.children.length > 0) panel.appendChild(actions);

  body.appendChild(panel);
}

// The whole money picture at a glance. Four real numbers, all drawn
// straight from live state (decision A of ref/BrineOS-The-Phone-plan.md):
// --- Brine Bank Overview (BrineOS Phase 1) ---
// The whole money picture at a glance. Four real numbers, all drawn
// straight from live state (decision A of ref/BrineOS-The-Phone-plan.md):
// checking balance, the tax reserve, portfolio value, and total
// outstanding bills. No new account types — getting to Bills or Portfolia
// is the shell's screen tabs' job, so this screen is all-numbers.
function renderBankOverview(body, gs, app, screen) {
  const checking = Math.round(gs.player.money || 0);
  const reserve = Math.round((gs.world.taxes && gs.world.taxes.reserve) || 0);
  const portfolio = Math.round(getPortfolioValue(gs));
  const bills = gs.world.bills || {};
  let outstanding = 0;
  const owed = [];
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (!bill || (bill.balance || 0) <= 0) continue;
    outstanding += bill.balance;
    owed.push({ label: def.label, balance: bill.balance, cutoff: !!bill.cutoffActive });
  }
  const netWorth = checking + reserve + portfolio;
  const outstandingNote = outstanding > 0 ? '$' + outstanding.toLocaleString() + ' in bills outstanding' : 'Bills all paid up';

  const hero = document.createElement('div');
  hero.className = 'invest-hero';
  hero.innerHTML = `
    <div class="invest-summary">
      <div class="invest-value">${netWorth.toLocaleString()}</div>
      <div class="invest-label dim tiny">Net Worth (checking + reserve + portfolio)</div>
    </div>
    <div class="invest-realized dim tiny">
      ${outstandingNote}
    </div>
  `;
  body.appendChild(hero);

  const balances = makePanel(`
    <div class="bank-balance-grid">
      <div class="bank-balance-card">
        <div class="bank-balance-value">$${checking.toLocaleString()}</div>
        <div class="bank-balance-label dim tiny">Checking</div>
      </div>
      <div class="bank-balance-card">
        <div class="bank-balance-value">$${reserve.toLocaleString()}</div>
        <div class="bank-balance-label dim tiny">Tax Reserve</div>
      </div>
      <div class="bank-balance-card">
        <div class="bank-balance-value">$${portfolio.toLocaleString()}</div>
        <div class="bank-balance-label dim tiny">Portfolio</div>
      </div>
    </div>
  `);
  body.appendChild(balances);

  const owedPanel = document.createElement('div');
  owedPanel.className = 'cs-panel';
  const header = document.createElement('div');
  header.className = 'tax-header';
  header.innerHTML = '<span class="tax-title">Outstanding</span>' +
    '<span class="tax-quarter">' + (outstanding > 0 ? '$' + outstanding.toLocaleString() + ' total' : 'all current') + '</span>';
  owedPanel.appendChild(header);
  if (owed.length === 0) {
    const none = document.createElement('div');
    none.className = 'dim tiny';
    none.textContent = 'Nothing owing. Everything is current.';
    owedPanel.appendChild(none);
  } else {
    for (const o of owed) {
      const row = document.createElement('div');
      row.className = 'bank-owed-row' + (o.cutoff ? ' cutoff' : '');
      row.innerHTML = '<span class="bank-owed-label">' + o.label + (o.cutoff ? ' <span class="bills-status-pill cutoff">CUTOFF</span>' : '') + '</span>' +
        '<span class="bank-owed-value">$' + o.balance.toLocaleString() + '</span>';
      owedPanel.appendChild(row);
    }
  }
  body.appendChild(owedPanel);

  const hint = document.createElement('div');
  hint.className = 'dim tiny';
  hint.textContent = 'Head to the Bills tab to pay, or Portfolia to invest.';
  body.appendChild(hint);
}


// --- Bills dashboard (Phase 3) ---
// One card per bill showing label, status pill, balance, due day, and a
// Pay button. Cutoff banners at the top show which utilities are off —
// that's the most game-relevant info, so it goes first. A Pay All button
// at the bottom clears every bill with a balance in one click.
function renderBillsDashboard(body, gs, app, screen) {
  const bills = gs.world.bills;
  if (!bills) { body.innerHTML = '<p class="dim">No bills yet.</p>'; return; }

  // Phase 6: Tax panel — the quarterly estimated tax status. Goes at the
  // very top because it's the largest and most consequential obligation.
  renderTaxPanel(body, gs);

  // Cutoff banners — the utilities that are currently OFF. These block
  // real systems (gig work, cooking, showers), so they go at the top.
  const activeCutoffs = [];
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (bill && bill.cutoffActive && def.cutoff) {
      const eff = BILL_CUTOFF_EFFECTS[def.cutoff];
      activeCutoffs.push({ billId: def.id, label: def.label, cutoff: def.cutoff, effLabel: eff?.label || 'Service off' });
    }
  }
  if (activeCutoffs.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'bills-cutoff-banner';
    for (const c of activeCutoffs) {
      const row = document.createElement('div');
      row.className = 'bills-cutoff-row';
      row.innerHTML = '<span class="bills-cutoff-icon">\u26a0</span> <strong>' + c.effLabel + '</strong> \u2014 ' + c.label + ' unpaid. Pay to restore service.';
      banner.appendChild(row);
    }
    body.appendChild(banner);
  }

  // Bill cards
  const grid = document.createElement('div');
  grid.className = 'bills-grid';
  let totalOwed = 0;
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (!bill) continue;
    totalOwed += bill.balance || 0;
    const card = document.createElement('div');
    card.className = 'bills-card' + (bill.cutoffActive ? ' cutoff' : '') + (bill.balance > 0 ? ' owed' : '');

    // Status pill
    let statusLabel = 'Current', statusClass = 'current';
    if (bill.cutoffActive) { statusLabel = 'CUTOFF'; statusClass = 'cutoff'; }
    else if (bill.status === 'overdue') { statusLabel = 'Overdue'; statusClass = 'overdue'; }
    else if (bill.status === 'due') { statusLabel = 'Due'; statusClass = 'due'; }
    else if (bill.status === 'paid') { statusLabel = 'Paid'; statusClass = 'paid'; }

    const daysNote = bill.overdueDays > 0 ? ' \u00b7 ' + bill.overdueDays + 'd overdue' : '';
    const splitNote = def.split === 'lease' ? 'lease' : def.split === 'personal' ? 'personal' : 'even split';

    card.innerHTML =
      '<div class="bills-card-header">' +
        '<span class="bills-card-title">' + def.label + '</span>' +
        '<span class="bills-status-pill ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="bills-card-balance">' + (bill.balance > 0 ? ('$' + bill.balance) : 'Paid up') + '</div>' +
      '<div class="dim tiny">Due day ' + bill.dueDay + ' \u00b7 ' + def.cadenceDays + 'd cadence \u00b7 ' + splitNote + daysNote + '</div>';

    // Phase 5: itemised usage breakdown for metered bills.
    const usageBreakdown = buildUsageBreakdown(gs, def.id);
    if (usageBreakdown) {
      const usageDiv = document.createElement('div');
      usageDiv.className = 'bills-usage-breakdown';
      usageDiv.innerHTML = usageBreakdown;
      card.appendChild(usageDiv);
    }

    if (bill.balance > 0) {
      const btn = document.createElement('button');
      btn.className = 'btn tiny bills-pay-btn';
      btn.setAttribute('data-action', 'bills.pay');
      btn.setAttribute('data-row-id', def.id);
      const fee = bill.cutoffActive ? def.reconnectionFee : 0;
      btn.textContent = fee > 0 ? 'Pay ' + bill.balance + ' + ' + fee + ' reconnect' : 'Pay ' + bill.balance;
      card.appendChild(btn);
    }

    // BrineOS Phase 7: a standing preference, not a payment action, so it
    // renders regardless of current balance. Rent (split:'lease') has its
    // own cap/eviction path and is not eligible.
    if (def.split !== 'lease') {
      const autopayBtn = document.createElement('button');
      autopayBtn.className = 'btn tiny bills-autopay-btn';
      autopayBtn.setAttribute('data-action', 'bills.toggle-autopay');
      autopayBtn.setAttribute('data-row-id', def.id);
      autopayBtn.setAttribute('data-on', bill.autopay ? 'on' : 'off');
      autopayBtn.textContent = bill.autopay ? 'Autopay: On' : 'Autopay: Off';
      card.appendChild(autopayBtn);
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);

  // Pay All footer
  if (totalOwed > 0) {
    const footer = document.createElement('div');
    footer.className = 'bills-footer';
    const payAllBtn = document.createElement('button');
    payAllBtn.className = 'btn bills-payall-btn';
    payAllBtn.setAttribute('data-action', 'bills.pay-all');
    payAllBtn.textContent = 'Pay All (' + totalOwed + ')';
    footer.appendChild(payAllBtn);
    body.appendChild(footer);
  }
}

// --- Phase 4: Apartment upgrades / disrepair dashboard ---
// Shows the apartment quality score, the rent ceiling it produces, and
// every facility grouped by room with its current tier and upgrade cost.
// The quality→ceiling link is the thing the player needs to see: this is
// where spending money on the building translates into rent leverage.
function renderUpgradesDashboard(body, gs, app, screen) {
  const upgrades = gs.world.upgrades;
  if (!upgrades) { body.innerHTML = '<p class="dim">Upgrade system not initialized.</p>'; return; }

  const quality = getApartmentQuality(gs);
  const ceiling = roommateShareCeiling(quality);
  const ceilingPct = Math.round(ceiling * 100);

  // Quality hero — the headline number + what it means for rent.
  const hero = document.createElement('div');
  hero.className = 'upg-hero';
  const qualityPct = Math.round(quality * 100);
  const qualityLabel = quality < 0.2 ? 'Wreck' : quality < 0.4 ? 'Rough' : quality < 0.6 ? 'Decent' : quality < 0.8 ? 'Good' : 'Pristine';
  hero.innerHTML = `
    <div class="upg-quality-bar">
      <div class="upg-quality-fill" style="width:${qualityPct}%"></div>
    </div>
    <div class="upg-quality-label">Apartment Quality: ${qualityLabel} (${qualityPct}%)</div>
    <div class="upg-ceiling">Rent ceiling: ${ceilingPct}% per roommate — ${quality < 0.99 ? 'restore facilities to raise it' : 'maxed out'}</div>
  `;
  body.appendChild(hero);

  // Group facilities by room, in ROOMS order. Post-overhaul every facility
  // (including the four bedrooms) maps to exactly one concrete room, so
  // there are no type-wide sections left — each facility renders as an
  // independent row under its own room.
  const roomOrder = Object.keys(ROOMS);
  const byRoom = {};
  for (const def of FACILITY_LIST) {
    const r = def.room;
    (byRoom[r] = byRoom[r] || []).push(def);
  }

  const sections = [];
  for (const roomId of roomOrder) {
    const facilities = byRoom[roomId];
    if (!facilities || facilities.length === 0) continue;
    sections.push({ label: ROOMS[roomId]?.name || roomId, facilities });
  }

  for (const { label, facilities } of sections) {
    const section = document.createElement('div');
    section.className = 'upg-room-section';
    const heading = document.createElement('div');
    heading.className = 'upg-room-heading';
    heading.textContent = label;
    section.appendChild(heading);

    for (const def of facilities) {
      const upgrade = upgrades[def.id];
      if (!upgrade) continue;
      const currentTierIdx = def.tiers.findIndex(t => t.tier === upgrade.tier);
      const currentTier = def.tiers[currentTierIdx];
      const nextTier = currentTierIdx < def.tiers.length - 1 ? def.tiers[currentTierIdx + 1] : null;
      const isMaxed = !nextTier;

      // Renovation overhaul Phase 3: an active job flips the card into its
      // live job-board state — stage label / day-of / ETA, no purchase
      // controls.
      const activeJob = upgrade.activeJobId
        ? (gs.world.renovationJobs || []).find(j => j.id === upgrade.activeJobId && j.status === 'active')
        : null;

      const card = document.createElement('div');
      card.className = 'upg-facility-card'
        + (isMaxed ? ' maxed' : '')
        + (upgrade.tier === 'broken' ? ' broken' : '')
        + (activeJob ? ' working' : '');

      const tierDots = def.tiers.map((t, i) => {
        const filled = i <= currentTierIdx;
        return `<span class="upg-tier-dot ${filled ? 'filled' : ''} ${i === currentTierIdx ? 'current' : ''}"></span>`;
      }).join('');

      let actionHtml = '';
      if (activeJob) {
        const stage = getRenovationJobStage(activeJob, gs.meta.clock.day);
        const dayN = Math.max(1, Math.min(activeJob.durationDays, gs.meta.clock.day - activeJob.startDay + 1));
        actionHtml = `
          <div class="upg-job">
            <span class="upg-job-stage">${stage.label}</span>
            <span class="upg-job-progress">day ${dayN} of ${activeJob.durationDays}</span>
            <span class="upg-job-eta dim tiny">ETA ${formatDate(activeJob.etaDay)}</span>
          </div>`;
      } else if (isMaxed) {
        actionHtml = '<span class="upg-maxed-badge">Fully Upgraded</span>';
      } else {
        // Phase 2 (contractor doc): the button advertises the Contractor's
        // full price (materials + labor markup) and affordability checks
        // against it, matching what bookRenovationJob actually charges.
        // Phase 3: the tutorial's first auxiliary-bedroom job shows FREE
        // and is always affordable (charged 0).
        const tutorialFree = isTutorialFreeJob(gs, def.id);
        const bookPrice = tutorialFree ? 0 : getContractorJobPrice(nextTier.cost);
        const affordable = gs.player.money >= bookPrice;
        const btnLabel = nextTier.tier === 'functional' ? 'Book Repair' : 'Book Upgrade';
        const etaDay = gs.meta.clock.day + (nextTier.durationDays || 1);
        actionHtml = `
          <button class="btn tiny upg-book-btn ${affordable ? '' : 'disabled'}" data-action="upgrades.purchase" data-row-id="${def.id}">${btnLabel} — ${tutorialFree ? 'FREE' : bookPrice}</button>
          <span class="upg-book-preview dim tiny">${nextTier.durationDays || 1}d job · done Day ${etaDay}${tutorialFree ? ' · on the house' : ''}</span>`;
      }

      // Phase 9: condition bar + repair button for functional+ facilities.
      // Condition degrades with use; at 0 the facility drops a tier.
      // Show the wear so the player can see maintenance coming.
      let conditionHtml = '';
      if (upgrade.tier !== 'broken' && upgrade.condition !== undefined) {
        const condPct = Math.round(upgrade.condition);
        const needsRepair = upgrade.condition < MAINTENANCE.startingCondition;
        const repairCost = Math.round((MAINTENANCE.startingCondition - upgrade.condition) * MAINTENANCE.repairCostPerPoint);
        const canRepair = needsRepair && gs.player.money >= repairCost;
        const condClass = condPct > 60 ? 'good' : condPct > 30 ? 'worn' : 'critical';
        conditionHtml = `
          <div class="upg-condition">
            <div class="upg-condition-bar ${condClass}"><div class="upg-condition-fill" style="width:${condPct}%"></div></div>
            <span class="upg-condition-label dim tiny">Condition: ${condPct}%</span>
            ${needsRepair ? `<button class="btn tiny upg-repair-btn ${canRepair ? '' : 'disabled'}" data-action="upgrades.repair" data-row-id="${def.id}">Repair — ${repairCost}</button>` : ''}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="upg-facility-header">
          <span class="upg-facility-label">${def.label}</span>
          <span class="upg-tier-dots">${tierDots}</span>
        </div>
        <div class="upg-facility-status">${currentTier.label}</div>
        <div class="upg-facility-desc dim tiny">${currentTier.desc}</div>
        ${nextTier ? `<div class="upg-next-tier dim tiny">Next: ${nextTier.label} — ${nextTier.desc}</div>` : ''}
        ${conditionHtml}
        <div class="upg-facility-action">${actionHtml}</div>
      `;
      // BrineOS Phase 8.4: a before/after restoration shot for this
      // facility at its current tier — appended as a node rather than
      // folded into the innerHTML template above, matching how the bills
      // dashboard appends its usage breakdown/pay button after its own
      // innerHTML assignment.
      const snapBtn = document.createElement('button');
      snapBtn.className = 'btn tiny upg-snap-btn';
      snapBtn.setAttribute('data-action', 'upgrades.snap-photo');
      snapBtn.setAttribute('data-row-id', def.id);
      snapBtn.textContent = 'Snap Photo';
      card.querySelector('.upg-facility-action').appendChild(snapBtn);
      section.appendChild(card);
    }
    body.appendChild(section);
  }
}

// --- Phase 11: Investing dashboard ---
// Shows the portfolio summary (total value, cost basis, P&L), each fund
// with buy/sell controls, and the realized gains tally. The funds are
// displayed with their expected return and volatility so the player can
// make an informed choice.
function renderInvestDashboard(body, gs, app, screen) {
  const invest = gs.world.computer.apps.invest;
  if (!invest) { body.innerHTML = '<p class="dim">Investing not initialized.</p>'; return; }

  const portfolioValue = getPortfolioValue(gs);
  const costBasis = getPortfolioCostBasis(gs);
  const unrealizedPL = portfolioValue - costBasis;
  const plPct = costBasis > 0 ? (unrealizedPL / costBasis * 100) : 0;

  // Portfolio summary hero
  const hero = document.createElement('div');
  hero.className = 'invest-hero';
  const plClass = unrealizedPL >= 0 ? 'positive' : 'negative';
  const plSign = unrealizedPL >= 0 ? '+' : '';
  hero.innerHTML = `
    <div class="invest-summary">
      <div class="invest-value">${Math.round(portfolioValue).toLocaleString()}</div>
      <div class="invest-label dim tiny">Portfolio Value</div>
    </div>
    <div class="invest-pl ${plClass}">
      ${plSign}${Math.round(unrealizedPL).toLocaleString()} (${plPct.toFixed(1)}%)
      <span class="dim tiny">unrealized</span>
    </div>
    <div class="invest-realized dim tiny">
      Realized gains: ${invest.realizedGains >= 0 ? '+' : ''}${Math.round(invest.realizedGains || 0).toLocaleString()}
    </div>
  `;
  body.appendChild(hero);

  // Cash on hand
  const cashBar = document.createElement('div');
  cashBar.className = 'invest-cash-bar';
  cashBar.innerHTML = `<span class="dim tiny">Cash available: </span>${Math.round(gs.player.money).toLocaleString()}`;
  body.appendChild(cashBar);

  // Fund list
  for (const fund of INVESTING.funds) {
    const holding = invest.holdings[fund.id];
    const shares = holding?.shares || 0;
    const basis = holding?.costBasis || 0;
    const fundPL = shares - basis;

    const card = document.createElement('div');
    card.className = 'invest-fund-card';

    const returnPct = (fund.expectedReturn * 100).toFixed(1);
    const volPct = (fund.volatility * 100).toFixed(1);
    const plClass2 = fundPL >= 0 ? 'positive' : 'negative';

    card.innerHTML = `
      <div class="invest-fund-header">
        <span class="invest-fund-name">${fund.label}</span>
        <span class="invest-fund-return">${returnPct}%/yr · ±${volPct}%/day</span>
      </div>
      <div class="invest-fund-desc dim tiny">${fund.desc}</div>
      <div class="invest-fund-holding">
        ${shares > 0 ? `
          <span class="invest-fund-value">${Math.round(shares).toLocaleString()}</span>
          <span class="invest-fund-pl ${plClass2}">${fundPL >= 0 ? '+' : ''}${Math.round(fundPL).toLocaleString()}</span>
        ` : '<span class="dim tiny">No position</span>'}
      </div>
      <div class="invest-fund-min dim tiny">Min: ${fund.minInvest}</div>
    `;

    // Buy/sell controls
    const controls = document.createElement('div');
    controls.className = 'invest-fund-controls';

    // Quick buy buttons
    const quickAmounts = [fund.minInvest, fund.minInvest * 5, fund.minInvest * 20];
    for (const amt of quickAmounts) {
      const buyBtn = document.createElement('button');
      buyBtn.className = 'btn tiny invest-buy-btn';
      buyBtn.setAttribute('data-action', 'invest.buy');
      buyBtn.setAttribute('data-row-id', fund.id);
      buyBtn.setAttribute('data-amount', amt);
      buyBtn.textContent = `+${amt}`;
      controls.appendChild(buyBtn);
    }

    // Sell button (if holding)
    if (shares > 0) {
      const sellAllBtn = document.createElement('button');
      sellAllBtn.className = 'btn btn-secondary tiny invest-sell-btn';
      sellAllBtn.setAttribute('data-action', 'invest.sell-all');
      sellAllBtn.setAttribute('data-row-id', fund.id);
      sellAllBtn.textContent = 'Sell All';
      controls.appendChild(sellAllBtn);
    }

    card.appendChild(controls);
    body.appendChild(card);
  }

  // Disclaimer
  const disc = document.createElement('div');
  disc.className = 'invest-disclaimer dim tiny';
  disc.textContent = 'Investing involves risk. Fund values fluctuate daily. Past performance does not guarantee future results.';
  body.appendChild(disc);
}

// ===== /SECTION: RENDER.COMPUTER =====
