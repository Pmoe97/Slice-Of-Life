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
  'home-placement': renderHomePlacement,
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
  'roomlist-offers': renderRoomListOffers,
  'doordrop-browse': renderDoorDropBrowse,
  'doordrop-menu': renderDoorDropMenu,
  'doordrop-cart': renderDoorDropCart,
  'doordrop-orders': renderDoorDropOrders,
  'grocery-cart': renderGroceryCart,
  'grocery-orders': renderGroceryOrders,
  'recipes-browse': renderRecipesBrowse,
  'recipes-detail': renderRecipesDetail,
  'recipes-planner': renderRecipesPlanner,
  'escorts-browse': renderEscortsBrowse,
  'escorts-profile': renderEscortsProfile,
  'escorts-bookings': renderEscortsBookings,
  messenger: renderMessages,
  'bank-overview': renderBankOverview,
  'bills-dashboard': renderBillsDashboard,
  'upgrades-dashboard': renderUpgradesDashboard,
  'invest-dashboard': renderInvestDashboard,
  // Intimacy & Voyeurism Phase 15 (D8): the knowledge codex.
  'codex-roster': renderCodexRoster,
  'codex-detail': renderCodexDetail,
  // Dream Engine Phase 8 (D42): the dream diary — gallery + per-dream detail.
  'dreamdiary': renderDreamDiary,
  'dreamentry': renderDreamEntry,
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
const CATALOG_SOURCES = { SHOP_CATALOG_LIST, SITE_DEFS_LIST, COURSE_DEFS_LIST, SERVICE_DEFS_LIST, STREAM_DEFS_LIST, DECOR_CATALOG_LIST, GROCERY_CATALOG_LIST };
// Defs tables keyed for the 'nile' renderer's price/label lookups — the
// data half of a `screen.catalog` field ('ITEM_DEFS' | 'DECOR_CATALOG_DEFS').
const CATALOG_DEFS = { ITEM_DEFS, DECOR_CATALOG_DEFS };

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



// AfterHours (Site Expansion Phase 2): the whole routed mini-site now
// lives in AFTERHOURS — this is a one-line delegate to AH.render(body, gs,
// site) so the phone's shared-renderer path (COMPUTER_RENDERERS['article'])
// stays on the identical site.
function renderAfterHours(body, gs, site) {
  AH.render(body, gs, site);
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

// --- Nile / Home browse: product grid with item thumbnails, prices, and
// a cart sidebar showing items and total. ---
// Shared by Nile and the Home app (decor-economy plan Phase 1): the screen
// def's `source`/`catalog`/`cartPath`/`cartRowAction`/`checkoutAction`
// fields point this one renderer at either catalog. Both browse defs carry
// those fields explicitly (defs.computer.js) — no shop-specific defaults.
function renderNile(body, gs, app, screen) {
  const defs = CATALOG_DEFS[screen.catalog] || ITEM_DEFS;
  const cart = resolveCart(gs, screen.cartPath).cart;
  const cartTotal = cart.reduce((sum, row) => sum + (defs[row.defId]?.price || 0) * row.units, 0);

  const layout = document.createElement('div');
  layout.className = 'nile-layout';

  // Product grid
  const grid = document.createElement('div');
  grid.className = 'nile-grid';
  for (const row of resolveScreenSource(gs, screen) || SHOP_CATALOG_LIST) {
    const def = defs[row.id] || row;
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
    btn.setAttribute('data-action', screen.rowAction);
    btn.setAttribute('data-row-id', row.id);
    btn.textContent = screen.rowActionLabel || 'Add to Cart';
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
      const def = defs[row.defId];
      const item = document.createElement('div');
      item.className = 'nile-cart-item';
      item.innerHTML = `<span>${def?.label || row.defId} × ${row.units}</span><span class="dim tiny">${(def?.price || 0) * row.units}</span>`;
      const rm = document.createElement('button');
      rm.className = 'btn tiny';
      rm.setAttribute('data-action', screen.cartRowAction);
      // data-row-id must be the defId — cart entries are { defId, units }
      // with no `id`. (The old hardcoded `row.id` here silently made Nile's
      // sidebar × a no-op; the cart screen's own row renderer always used
      // `row.id || row.defId`, which is why only this sidebar was broken.)
      rm.setAttribute('data-row-id', row.defId);
      rm.textContent = '×';
      item.appendChild(rm);
      sidebar.appendChild(item);
    }
    const checkout = document.createElement('button');
    checkout.className = 'btn nile-checkout-btn';
    checkout.setAttribute('data-action', screen.checkoutAction);
    checkout.textContent = `Checkout (${cartTotal})`;
    sidebar.appendChild(checkout);
  }
  layout.appendChild(sidebar);
  body.appendChild(layout);
}

// --- Home placement screen (decor-economy plan Phase 2) ---
// The in-game Studio: the same select/drag/resize/rotate interaction
// dev/designer.html's Place tab has, over the player's OWN placed decor
// objects instead of the dev-authored ROOM_DECOR config. Placed decor is
// any object in the room's bucket carrying a `pos` (D4 — the placement
// records live in gameState.objects, not in a config table).
//
// Transient interaction state — which room is being edited, what's
// selected, an in-progress placement draft, the live drag gesture — lives
// in homePlacementUI (UI.COMPUTER), the same split renderWindows has with
// dragGesture: this renderer only READS it, and gestures that are
// mid-flight when a background render fires keep operating because the
// module-level state survives the rebuild (the canvas always reads the
// current pos out of gameState, so a rebuild mid-drag shows exactly where
// the piece already is).
function renderHomePlacement(body, gs, app, screen) {
  const hp = (typeof homePlacementUI !== 'undefined' && homePlacementUI) || null;
  const roomId = (hp && hp.roomId) || gs.player.location;

  // --- Room selector ---
  const roomsRow = document.createElement('div');
  roomsRow.className = 'hp-rooms';
  for (const id of ALL_ROOMS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    if (id === roomId) chip.setAttribute('data-active', '');
    chip.setAttribute('data-action', 'home.place-room');
    chip.setAttribute('data-room-id', id);
    chip.textContent = ROOMS[id].name;
    roomsRow.appendChild(chip);
  }
  body.appendChild(roomsRow);

  // --- Palette + canvas ---
  const layout = document.createElement('div');
  layout.className = 'hp-layout';

  const owned = (gs.player.inventory || []).filter(s => DECOR_CATALOG_DEFS[s.defId] && s.qty > 0);
  const doormat = Object.values(gs.objects?.room_entry || {}).find(o => o.defId === 'doormat');
  const onDoormat = (doormat?.contents || []).some(s => DECOR_CATALOG_DEFS[s.defId] && s.qty > 0);

  const palette = document.createElement('div');
  palette.className = 'hp-palette';
  const head = document.createElement('div');
  head.className = 'hp-palette-head';
  head.textContent = 'Your furniture';
  palette.appendChild(head);
  if (owned.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dim tiny hp-palette-empty';
    empty.textContent = onDoormat
      ? 'A delivery is waiting by the front door — pick it up first, then it will be here to place.'
      : 'Nothing to place yet. Buy something on the Browse tab — it arrives by the door the next day.';
    palette.appendChild(empty);
  } else {
    for (const s of owned) {
      const btn = document.createElement('button');
      btn.className = 'hp-palette-item';
      btn.setAttribute('data-action', 'home.place-item');
      btn.setAttribute('data-row-id', s.defId);
      const def = DECOR_CATALOG_DEFS[s.defId];
      const name = document.createElement('span');
      name.className = 'hp-palette-label';
      name.textContent = def.label;
      const qty = document.createElement('span');
      qty.className = 'hp-palette-qty';
      qty.textContent = `×${s.qty}`;
      btn.appendChild(name);
      btn.appendChild(qty);
      palette.appendChild(btn);
    }
  }
  layout.appendChild(palette);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'hp-canvas-wrap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('hp-canvas');
  buildHomePlacementCanvas(svg, gs, hp, roomId);
  canvasWrap.appendChild(svg);
  layout.appendChild(canvasWrap);
  body.appendChild(layout);

  // --- Footer action bar ---
  const bar = document.createElement('div');
  bar.className = 'hp-bar';
  const snapBtn = document.createElement('button');
  snapBtn.className = 'chip';
  snapBtn.setAttribute('data-action', 'home.place-snap');
  snapBtn.textContent = `Grid snap: ${hp ? (hp.snap ? 'on' : 'off') : 'on'}`;
  bar.appendChild(snapBtn);

  const bucket = gs.objects[`room_${roomId}`] || {};
  const draftDef = hp && hp.draft ? DECOR_CATALOG_DEFS[hp.draft.defId] : null;
  const selObj = hp && hp.selectedId ? bucket[hp.selectedId] : null;
  const selDef = selObj ? DECOR_CATALOG_DEFS[selObj.defId] : null;
  if (draftDef) {
    const lbl = document.createElement('span');
    lbl.className = 'dim tiny';
    lbl.textContent = `Placing ${draftDef.label} in ${ROOMS[roomId].name} — drag to move, corners resize, the dot above rotates.`;
    bar.appendChild(lbl);
    const place = document.createElement('button');
    place.className = 'btn tiny';
    place.setAttribute('data-action', 'home.place-commit');
    place.textContent = 'Place here';
    bar.appendChild(place);
    const cancel = document.createElement('button');
    cancel.className = 'btn tiny btn-secondary';
    cancel.setAttribute('data-action', 'home.place-cancel');
    cancel.textContent = 'Cancel';
    bar.appendChild(cancel);
  } else if (selObj && selDef) {
    const lbl = document.createElement('span');
    lbl.className = 'dim tiny';
    lbl.textContent = `${selDef.label} — drag to move, corners resize, the dot above rotates.`;
    bar.appendChild(lbl);
    const pickup = document.createElement('button');
    pickup.className = 'btn tiny btn-secondary';
    pickup.setAttribute('data-action', 'home.place-pickup');
    pickup.setAttribute('data-obj-id', selObj.id);
    pickup.textContent = 'Pick up';
    bar.appendChild(pickup);
  } else {
    const lbl = document.createElement('span');
    lbl.className = 'dim tiny';
    lbl.textContent = 'Pick an item from the palette, then drag it into place.';
    bar.appendChild(lbl);
  }
  body.appendChild(bar);
}

// One room's floor plan, as an editable canvas: room fills + walls with the
// same openings the real floor plan cuts, the room's auto-arranged base
// furniture dimmed as a backdrop, then the player's placed decor (objects
// with a `pos`) at their real positions and the in-progress draft on top.
// Geometry is drawn with the SAME helpers the floor plan uses, so the
// canvas and the map cannot disagree about where a wall or a doorway is.
function buildHomePlacementCanvas(svg, gs, hp, roomId) {
  const NS = 'http://www.w3.org/2000/svg';
  const rects = ROOM_LAYOUT[roomId] || [];
  if (rects.length === 0) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y, w, h] of rects) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  const pad = 14;
  svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${(x1 - x0) + pad * 2} ${(y1 - y0) + pad * 2}`);
  svg.innerHTML = '';

  // Room fills — deliberately NO data-room-id, so the global click
  // dispatcher's "rect + data-room-id → walk there" rule can't hijack a
  // click that's meant to deselect. Deselect is the mousedown handler.
  for (const [x, y, w, h] of rects) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', 'fp-room');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      if (typeof doHomePlaceSelect === 'function') doHomePlaceSelect(null);
    });
    svg.appendChild(r);
  }

  // Walls, cut exactly where the floor plan cuts them.
  const openings = typeof floorPlanOpenings === 'function' ? floorPlanOpenings(gs) : [];
  const cuts = rects.length > 1 ? openings.concat(roomInternalSeams(rects)) : openings;
  for (const [x, y, w, h] of rects) {
    const sides = [
      { fixed: y, from: x, to: x + w, vertical: false },
      { fixed: y + h, from: x, to: x + w, vertical: false },
      { fixed: x, from: y, to: y + h, vertical: true },
      { fixed: x + w, from: y, to: y + h, vertical: true },
    ];
    for (const s of sides) {
      for (const [a, b] of wallPieces(s.fixed, s.from, s.to, s.vertical, cuts)) {
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('class', 'fp-wall');
        if (s.vertical) {
          ln.setAttribute('x1', s.fixed); ln.setAttribute('y1', a);
          ln.setAttribute('x2', s.fixed); ln.setAttribute('y2', b);
        } else {
          ln.setAttribute('x1', a); ln.setAttribute('y1', s.fixed);
          ln.setAttribute('x2', b); ln.setAttribute('y2', s.fixed);
        }
        svg.appendChild(ln);
      }
    }
  }

  // Room label, centered the way the floor plan centers it.
  const [cx, cy] = typeof roomCentre === 'function' ? roomCentre(roomId) : [(x0 + x1) / 2, (y0 + y1) / 2];
  const label = document.createElementNS(NS, 'text');
  label.setAttribute('class', 'fp-room-label');
  label.setAttribute('x', cx); label.setAttribute('y', cy);
  label.textContent = ROOMS[roomId]?.name || roomId;
  svg.appendChild(label);

  // Base furniture backdrop: the room's OTHER objects, drawn by the same
  // auto-arranger the floor plan uses, dimmed, so the player can arrange
  // around what is already there. Placed decor is excluded (it is drawn on
  // top at its real position) via a read-only clone of the bucket — no
  // mutation, just a filtered view handed to a pure function.
  const bucket = gs.objects?.[`room_${roomId}`] || {};
  const baseOnly = {};
  for (const [id, o] of Object.entries(bucket)) {
    if (!o.pos) baseOnly[id] = o;
  }
  if (typeof renderAutoFurniture === 'function') {
    const gsClone = { ...gs, objects: { ...gs.objects, [`room_${roomId}`]: baseOnly } };
    const backdrop = renderAutoFurniture(gsClone, roomId);
    if (backdrop) {
      const bg = document.createElementNS(NS, 'g');
      bg.classList.add('hp-backdrop');
      bg.innerHTML = backdrop;
      svg.appendChild(bg);
    }
  }

  // Placed decor, at their real positions.
  for (const o of Object.values(bucket)) {
    if (!o.pos) continue;
    svg.appendChild(buildHomePlacementObjectNode(o, gs, hp, false));
  }

  // The in-progress draft.
  if (hp && hp.draft) {
    svg.appendChild(buildHomePlacementObjectNode(hp.draft, gs, hp, true));
  }

  // Selection / draft handles.
  if (hp) {
    const target = hp.draft ? hp.draft : (hp.selectedId ? bucket[hp.selectedId] : null);
    if (target && target.pos) {
      buildHomePlacementHandles(svg, target, hp.draft ? 'draft' : target.id);
    }
  }
}

function buildHomePlacementObjectNode(o, gs, hp, isDraft) {
  const NS = 'http://www.w3.org/2000/svg';
  const p = o.pos;
  const g = document.createElementNS(NS, 'g');
  g.classList.add('hp-obj');
  if (isDraft) g.classList.add('hp-draft');
  else if (hp && hp.selectedId === o.id) g.classList.add('hp-selected');

  const def = DECOR_CATALOG_DEFS[o.defId];
  const shapeId = def?.shape;
  const shape = document.createElementNS(NS, 'g');
  if (shapeId && typeof renderDesignShape === 'function') {
    shape.innerHTML = renderDesignShape({ shape: shapeId, x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot || 0 });
  } else {
    const fallback = document.createElementNS(NS, 'rect');
    fallback.setAttribute('class', 'fp-p fp-p-frame');
    fallback.setAttribute('x', p.x); fallback.setAttribute('y', p.y);
    fallback.setAttribute('width', p.w); fallback.setAttribute('height', p.h);
    fallback.setAttribute('rx', 2);
    shape.appendChild(fallback);
  }
  g.appendChild(shape);

  const key = isDraft ? 'draft' : o.id;
  g.addEventListener('mousedown', (ev) => {
    if (typeof homePlacementStartMove === 'function') homePlacementStartMove(ev, key, isDraft);
  });
  return g;
}

function buildHomePlacementHandles(svg, target, key) {
  const NS = 'http://www.w3.org/2000/svg';
  const p = target.pos;
  const box = document.createElementNS(NS, 'rect');
  box.setAttribute('class', 'hp-selbox');
  box.setAttribute('x', p.x); box.setAttribute('y', p.y);
  box.setAttribute('width', p.w); box.setAttribute('height', p.h);
  svg.appendChild(box);

  const mk = (name, attrs) => {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const corners = [
    ['nw', p.x, p.y], ['ne', p.x + p.w, p.y],
    ['sw', p.x, p.y + p.h], ['se', p.x + p.w, p.y + p.h],
  ];
  for (const [corner, hx, hy] of corners) {
    const h = mk('circle', { class: 'hp-handle', cx: hx, cy: hy, r: 3.4 });
    h.addEventListener('mousedown', (ev) => {
      if (typeof homePlacementStartResize === 'function') homePlacementStartResize(ev, key, corner);
    });
    svg.appendChild(h);
  }
  const rh = mk('circle', { class: 'hp-handle rot', cx: p.x + p.w / 2, cy: p.y - 9, r: 3.6 });
  rh.addEventListener('mousedown', (ev) => {
    if (typeof homePlacementStartRotate === 'function') homePlacementStartRotate(ev, key);
  });
  svg.appendChild(rh);
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

  // 2026-08-17 audit (B5): surface current work efficiency so the player
  // can SEE why progress is slow. Focus (energy × mood) scales progress
  // per work click; a low number reads as "rest or lift your mood first"
  // rather than the mystery grind the old UI was.
  const focus = computeFocusMultiplier(gs);
  const effPct = Math.round(focus * 100);
  const perClick = Math.round(focus * GIG_TUNING.progressPerClick * 100) / 100;
  const effNote = document.createElement('div');
  effNote.className = 'dim tiny';
  effNote.textContent = effPct >= 100
    ? `Work efficiency: 100% — each click completes ${perClick} blocks.`
    : `Work efficiency: ${effPct}% — each click completes ~${perClick} blocks (${effPct}% of ${GIG_TUNING.progressPerClick}). Sleep and a better mood speed this up.`;
  body.appendChild(effNote);

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

// Transient browse filter (restaurant overhaul Phase 3d): which service chip
// is active. Deliberately NOT game data — same "DOM-only, not state" class
// as dragGesture in UI.WINDOWMANAGER. Nothing is persisted and every fresh
// page load starts on 'all'; the chip buttons just set this and re-render.
// Service keys are RESTAURANT_DEFS `service` values plus 'all'.
let foodBrowseFilterService = 'all';
const FOOD_BROWSE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'late', label: 'Late Night' },
  { id: '24h', label: '24H' },
];

function renderDoorDropBrowse(body, gs, app, screen) {
  const nowMinutes = gs.meta.clock.minutes;
  const cartId = getFoodCartRestaurantId(gs);
  // Meal-category filter row — a single-select toggle of chips in the same
  // styling family as the tip selector: the active chip is the filled .btn,
  // the inactive ones are .btn-secondary.
  const filterRow = document.createElement('div');
  filterRow.className = 'dd-filters';
  for (const f of FOOD_BROWSE_FILTERS) {
    const chip = document.createElement('button');
    chip.className = `btn tiny${foodBrowseFilterService === f.id ? '' : ' btn-secondary'}`;
    chip.setAttribute('data-action', 'food.filter-service');
    chip.setAttribute('data-service', f.id);
    chip.textContent = f.label;
    filterRow.appendChild(chip);
  }
  body.appendChild(filterRow);
  // Within a filter, open places render before closed ones — a closed card
  // still shows (so the player can see the hours), just dimmed and last.
  const list = RESTAURANT_DEFS_LIST
    .filter(def => foodBrowseFilterService === 'all' || def.service === foodBrowseFilterService)
    .sort((a, b) => (isRestaurantOpen(b, nowMinutes) ? 1 : 0) - (isRestaurantOpen(a, nowMinutes) ? 1 : 0));
  const grid = document.createElement('div');
  grid.className = 'dd-grid';
  for (const def of list) {
    const open = isRestaurantOpen(def, nowMinutes);
    const card = document.createElement('div');
    card.className = `dd-card${open ? '' : ' dd-closed'}`;
    card.innerHTML = `
      <div class="dd-card-head">
        <span class="hc-card-title">${def.label}</span>
        <span class="dim tiny">${def.cuisine}</span>
      </div>
      <div class="dim tiny">${def.blurb}</div>
      <div class="dim tiny">~${def.prepMinutes} min prep — ${def.deliveryFeeBase} delivery — ${formatRestaurantHours(def)}</div>
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
    // 2026-08-17 audit (B2): the restore shown must be the per-SERVING
    // restore when the dish serves more than one — a 4-serving pizza says
    // "restores 55 hunger" but eating one slice restores ~14, and since
    // B2 the numbers are real. Matches openEatPicker's per-serving math.
    const sv = itemServings(item);
    const perServing = sv > 1;
    // food-overhaul Phase 2 (D1/D3): the menu shows the kcal (per serving
    // when the dish serves more than one), which is the fullness truth a
    // player orders by now — same math as the eat picker.
    const kcal = perServingKcal(item);
    const shownKcal = Math.round(kcal);
    const shownHunger = perServing ? Math.round(hunger / sv) : hunger;
    row.innerHTML = `
      <div>
        <div class="dd-dish">${item.label}${inCart ? ` <span class="dim tiny">×${inCart.qty} in cart</span>` : ''}</div>
        <div class="dim tiny">${entry.price} — ${shownKcal} kcal${perServing ? ` per serving (serves ${sv})` : ''}${hunger > 0 ? ` · restores ${shownHunger} hunger${perServing ? ' per serving' : ''}` : ''}</div>
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
  // day and the order count (see getFoodEarliestArrival). Slots are
  // absolute-minute values (today or tomorrow) from earliest up to
  // earliest + maxScheduleAheadMinutes — a late-night order legitimately
  // offers tomorrow's early-morning slots now that arrivals can cross
  // midnight.
  const seq = (gs.world.foodOrders || []).length;
  const earliestAbs = getFoodEarliestArrival(gs, restaurantId, seq);
  const nowDay = gs.meta.clock.day;
  const maxAbs = earliestAbs + FOOD_TUNING.maxScheduleAheadMinutes;
  const timeWrap = document.createElement('div');
  timeWrap.className = 'dd-time';
  let opts = '';
  let curDay = null;
  for (let abs = earliestAbs; abs <= maxAbs; abs += 30) {
    const d = Math.floor(abs / 1440);
    if (d !== curDay) {
      if (curDay !== null) opts += '</optgroup>';
      const group = d === nowDay ? 'Today' : d === nowDay + 1 ? 'Tomorrow' : `Day ${d}`;
      opts += `<optgroup label="${group}">`;
      curDay = d;
    }
    const isFirst = abs === earliestAbs;
    const timeLabel = formatTime(abs % 1440);
    const prefix = d === nowDay ? '' : d === nowDay + 1 ? 'Tomorrow ' : `Day ${d} `;
    const label = isFirst ? `ASAP — ${prefix}${timeLabel}` : `${prefix}${timeLabel}`;
    opts += `<option value="${abs}">${label}</option>`;
  }
  if (curDay !== null) opts += '</optgroup>';
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
  const customTipInput = document.createElement('input');
  customTipInput.type = 'number';
  customTipInput.min = '0';
  customTipInput.max = '100';
  customTipInput.step = '1';
  customTipInput.className = 'dd-tip-custom';
  customTipInput.placeholder = 'Custom %';
  if (!FOOD_TUNING.tipOptions.includes(totals.tipPct)) {
    customTipInput.value = String(Math.round(totals.tipPct * 100));
  }
  const applyCustomTip = () => {
    const v = Number(customTipInput.value);
    if (Number.isFinite(v) && v >= 0 && v <= 100) doFoodSetTip(v);
  };
  customTipInput.addEventListener('change', applyCustomTip);
  customTipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCustomTip();
  });
  tipWrap.appendChild(customTipInput);
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

// One arrival-label string for both the orders renderer and the live ETA
// ticker (updateFoodOrderEtas), so the two can never disagree about what
// "arriving" means. Cross-midnight orders label their slot "Tomorrow HH:MM";
// old saved orders without arrivalAbs read as same-day.
function foodArrivalWhenLabel(order, gs) {
  const abs = foodOrderArrivalAbs(order);
  const day = Math.floor(abs / 1440);
  return day === gs.meta.clock.day
    ? formatTime(abs % 1440)
    : day === gs.meta.clock.day + 1
      ? `Tomorrow ${formatTime(abs % 1440)}`
      : `Day ${day}, ${formatTime(abs % 1440)}`;
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
    // data-order-id lets the live ticker (updateFoodOrderEtas) find this
    // order's pill without re-rendering the whole list, and .dd-order-eta
    // marks exactly the node it's allowed to touch.
    card.dataset.orderId = order.id;
    // The ETA is the app's live surface: a placed order is a thing you sit
    // and wait for, so it counts down rather than just saying "ordered".
    // The countdown is updated in place by updateFoodOrderEtas each clock
    // frame while the screen is open — no full re-render needed.
    const arrivalWhen = foodArrivalWhenLabel(order, gs);
    const status = order.status === 'delivered'
      ? `<span class="cs-status-pill done dd-order-eta">Delivered${order.handedTo === 'doormat' ? ' — left at the door' : ''}</span>`
      : eta > 0
        ? `<span class="cs-status-pill active dd-order-eta">${Math.ceil(eta)} min away — arriving ${arrivalWhen}</span>`
        : '<span class="cs-status-pill active dd-order-eta">At your door</span>';
    card.innerHTML = `
      <div class="dd-card-head"><span class="hc-card-title">${def?.label || order.restaurantId}</span><span class="dim tiny">$${order.total}</span></div>
      <div class="dim tiny">${lines}</div>
      <div class="dim tiny">Driver: ${driver?.bible?.name || 'assigned'}${order.tip ? ` — $${order.tip} tip` : ' — no tip'}</div>
      ${status}
    `;
    body.appendChild(card);
  }
}

// Live ETA ticker: the orders screen's "X min away" countdown is a
// clock-bound number, and the continuous clock moves it every frame while
// the screen sits open — but the screen is only (re)built on interaction.
// This updates JUST the .dd-order status pills in place, no DOM rebuild,
// and skips any pill whose text hasn't actually changed, so the 60fps
// clock loop costs a few textContent compares, not repaints. Runs from
// updateClockDisplay (TIME) every clock frame; querySelectorAll returns
// empty and this returns immediately when no orders screen is open.
// Covers both the phone and computer DoorDrop windows (cards are tagged
// data-order-id by renderDoorDropOrders, pill .dd-order-eta).
function updateFoodOrderEtas(gs) {
  const cards = document.querySelectorAll('[data-order-id]');
  if (!cards.length) return;
  const orders = new Map((gs.world.foodOrders || []).map(o => [o.id, o]));
  for (const card of cards) {
    const order = orders.get(card.dataset.orderId);
    if (!order) continue;
    const pill = card.querySelector('.dd-order-eta');
    if (!pill) continue;
    const delivered = order.status === 'delivered';
    const text = delivered
      ? `Delivered${order.handedTo === 'doormat' ? ' — left at the door' : ''}`
      : getFoodOrderEtaMinutes(order, gs.meta.clock) > 0
        ? `${Math.ceil(getFoodOrderEtaMinutes(order, gs.meta.clock))} min away — arriving ${foodArrivalWhenLabel(order, gs)}`
        : 'At your door';
    if (pill.textContent !== text) {
      pill.textContent = text;
      pill.className = `cs-status-pill ${delivered ? 'done' : 'active'} dd-order-eta`;
    }
  }
}

// --- QuickCart: grocery delivery (an Instacart parody) ---
// Bespoke cart/orders pair, mirroring DoorDrop's own four minus the
// restaurant header and time picker (one store, no scheduling ahead) — the
// browse screen itself needs no bespoke renderer at all, it's the shared
// 'nile' renderer pointed at GROCERY_CATALOG_LIST/ITEM_DEFS/apps.grocery.cart.
// Reuses the .dd-*/.cs-status-pill CSS verbatim (confirmed generic, not
// DoorDrop-scoped) — zero new CSS.

function renderGroceryCart(body, gs, app, screen) {
  const groceryApp = gs.world.computer.apps.grocery;
  const cart = groceryApp?.cart || [];
  if (cart.length === 0) { body.innerHTML = '<p class="dim tiny">Your cart is empty.</p>'; return; }
  const totals = getGroceryOrderTotals(gs);

  for (const line of cart) {
    const def = ITEM_DEFS[line.defId];
    const row = document.createElement('div');
    row.className = 'dd-menu-row';
    row.innerHTML = `<div><div class="dd-dish">${def?.label || line.defId} × ${line.units}</div><div class="dim tiny">$${(def?.price || 0) * line.units}</div></div>`;
    const minus = document.createElement('button');
    minus.className = 'btn tiny btn-secondary';
    minus.setAttribute('data-action', 'grocery.remove-from-cart');
    minus.setAttribute('data-row-id', line.defId);
    minus.textContent = '−';
    row.appendChild(minus);
    body.appendChild(row);
  }

  const tipWrap = document.createElement('div');
  tipWrap.className = 'dd-tips';
  tipWrap.innerHTML = '<span class="dim tiny">Tip</span>';
  for (const pct of GROCERY_TUNING.tipOptions) {
    const btn = document.createElement('button');
    btn.className = `btn tiny${pct === totals.tipPct ? '' : ' btn-secondary'}`;
    btn.setAttribute('data-action', 'grocery.set-tip');
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
  place.setAttribute('data-action', 'grocery.checkout');
  place.textContent = `Place Order — $${totals.total}`;
  actions.appendChild(place);
  body.appendChild(actions);
}

// Distinct from DoorDrop's foodArrivalWhenLabel only in name — kept
// separate rather than shared so the two order kinds' arrival-label logic
// can drift independently if one delivery flavor ever needs its own rule.
function groceryArrivalWhenLabel(order, gs) {
  const abs = order.arrivalAbs;
  const day = Math.floor(abs / 1440);
  return day === gs.meta.clock.day
    ? formatTime(abs % 1440)
    : day === gs.meta.clock.day + 1
      ? `Tomorrow ${formatTime(abs % 1440)}`
      : `Day ${day}, ${formatTime(abs % 1440)}`;
}

function renderGroceryOrders(body, gs, app, screen) {
  const orders = [...(gs.world.groceryOrders || [])].reverse();
  if (orders.length === 0) { body.innerHTML = '<p class="dim tiny">No orders yet.</p>'; return; }
  for (const order of orders.slice(0, 10)) {
    const shopper = gs.npcs[order.shopperNpcId];
    const eta = getGroceryOrderEtaMinutes(order, gs.meta.clock);
    const lines = order.items.map(i => `${ITEM_DEFS[i.defId]?.label || i.defId}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
    const card = document.createElement('div');
    card.className = 'dd-order';
    // data-grocery-order-id / .gc-order-eta, deliberately DISTINCT from
    // DoorDrop's data-order-id/.dd-order-eta — a shared attribute name
    // would let updateFoodOrderEtas/updateGroceryOrderEtas cross-match
    // each other's cards (harmless — the Map lookup just misses — but
    // wasteful and confusing to debug later).
    card.dataset.groceryOrderId = order.id;
    const arrivalWhen = groceryArrivalWhenLabel(order, gs);
    const status = order.status === 'delivered'
      ? `<span class="cs-status-pill done gc-order-eta">Delivered${order.handedTo === 'doormat' ? ' — left at the door' : ''}</span>`
      : eta > 0
        ? `<span class="cs-status-pill active gc-order-eta">${Math.ceil(eta)} min away — arriving ${arrivalWhen}</span>`
        : '<span class="cs-status-pill active gc-order-eta">At your door</span>';
    card.innerHTML = `
      <div class="dd-card-head"><span class="hc-card-title">QuickCart order</span><span class="dim tiny">$${order.total}</span></div>
      <div class="dim tiny">${lines}</div>
      <div class="dim tiny">Shopper: ${shopper?.bible?.name || 'assigned'}${order.tip ? ` — $${order.tip} tip` : ' — no tip'}</div>
      ${status}
    `;
    body.appendChild(card);
  }
}

// Live ETA ticker for QuickCart, mirroring updateFoodOrderEtas exactly —
// patches .gc-order-eta pills in place every clock frame, no DOM rebuild.
function updateGroceryOrderEtas(gs) {
  const cards = document.querySelectorAll('[data-grocery-order-id]');
  if (!cards.length) return;
  const orders = new Map((gs.world.groceryOrders || []).map(o => [o.id, o]));
  for (const card of cards) {
    const order = orders.get(card.dataset.groceryOrderId);
    if (!order) continue;
    const pill = card.querySelector('.gc-order-eta');
    if (!pill) continue;
    const delivered = order.status === 'delivered';
    const text = delivered
      ? `Delivered${order.handedTo === 'doormat' ? ' — left at the door' : ''}`
      : getGroceryOrderEtaMinutes(order, gs.meta.clock) > 0
        ? `${Math.ceil(getGroceryOrderEtaMinutes(order, gs.meta.clock))} min away — arriving ${groceryArrivalWhenLabel(order, gs)}`
        : 'At your door';
    if (pill.textContent !== text) {
      pill.textContent = text;
      pill.className = `cs-status-pill ${delivered ? 'done' : 'active'} gc-order-eta`;
    }
  }
}

// --- ChefBook: the recipe website (food-overhaul Phase 8, D21/D22) ---
// Bespoke renderers, not the generic catalog/list ones — a recipe card
// needs a detail drill-down and a shopping-list action neither generic
// renderer models, same reasoning that gave DoorDrop its own four.

function renderRecipesBrowse(body, gs, app, screen) {
  const recApp = gs.world.computer.apps.recipes;
  const unlocked = recApp.unlockedIds || [];

  const nav = document.createElement('div');
  nav.className = 'cs-actions';
  const plannerBtn = document.createElement('button');
  plannerBtn.className = 'btn tiny btn-secondary';
  plannerBtn.setAttribute('data-action', 'computer.open-screen');
  plannerBtn.setAttribute('data-app', 'recipes');
  plannerBtn.setAttribute('data-screen', 'planner');
  plannerBtn.textContent = 'Meal Planner';
  nav.appendChild(plannerBtn);
  body.appendChild(nav);

  if (unlocked.length === 0) {
    body.innerHTML += '<p class="dim tiny">Nothing here yet — taste a dish to unlock its recipe.</p>';
    return;
  }
  const cards = recipeCardsFromEngine(gs, unlocked);
  const list = document.createElement('div');
  list.className = 'cs-catalog';
  for (const id of unlocked) {
    const card = cards[id];
    if (!card) continue;
    const row = document.createElement('div');
    row.className = 'cs-catalog-row';
    row.innerHTML = `<span class="cs-catalog-title">${card.label}</span><span class="dim tiny">${card.kcalPerServing} kcal${card.grade ? ` · sample grade ${card.grade}` : ''}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'recipes.open-detail');
    btn.setAttribute('data-row-id', id);
    btn.textContent = 'View';
    row.appendChild(btn);
    list.appendChild(row);
  }
  body.appendChild(list);
}

function renderRecipesDetail(body, gs, app, screen) {
  const recApp = gs.world.computer.apps.recipes;
  const id = recApp.viewingRecipeId;
  const card = id ? recipeCardFor(gs, id) : null;
  if (!card) { body.innerHTML = '<p class="dim tiny">Pick a recipe first.</p>'; return; }

  const panel = makePanel(`
    <h3>${card.label}</h3>
    <p class="dim tiny">${card.kcalPerServing} kcal per serving${card.grade ? ` · sample grade ${card.grade}` : ''}</p>
    <p>${card.chefNotes}</p>
    ${card.steps.length ? `<ol>${card.steps.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}
  `);
  body.appendChild(panel);

  if (card.ingredients.length) {
    const ing = document.createElement('div');
    ing.className = 'cs-list';
    for (const i of card.ingredients) {
      const row = document.createElement('div');
      row.className = 'cs-list-row';
      row.innerHTML = `<span>${ITEM_DEFS[i.defId]?.label || i.defId} × ${i.qty}</span>`;
      ing.appendChild(row);
    }
    body.appendChild(ing);
    const cartBtn = document.createElement('button');
    cartBtn.className = 'btn tiny';
    cartBtn.setAttribute('data-action', 'recipes.add-to-cart');
    cartBtn.setAttribute('data-row-id', id);
    cartBtn.textContent = 'Add All Ingredients to Cart';
    body.appendChild(cartBtn);
  }

  const back = document.createElement('button');
  back.className = 'btn btn-secondary tiny';
  back.setAttribute('data-action', 'computer.open-screen');
  back.setAttribute('data-app', 'recipes');
  back.setAttribute('data-screen', 'browse');
  back.textContent = 'Back';
  body.appendChild(back);
}

// The planner's own add-row (recipe select + day number) — only unlocked
// RECIPES entries are offerable (a restaurant dish has no ingredients to
// plan a shop around). Reads happen at submit time off these ids
// (`#planner-recipe`/`#planner-day`), the same "transient form state
// stays in the DOM until it's committed" pattern DoorDrop's tip input and
// the maid's grid both use.
function renderRecipesPlanner(body, gs, app, screen) {
  const recApp = gs.world.computer.apps.recipes;
  const planner = recApp.planner || [];
  const unlockedRecipes = (recApp.unlockedIds || []).filter(id => RECIPES[id]);

  const addRow = document.createElement('div');
  addRow.className = 'cs-actions';
  const options = unlockedRecipes.map(id => `<option value="${id}">${RECIPES[id].label}</option>`).join('');
  addRow.innerHTML = `
    <select id="planner-recipe" ${unlockedRecipes.length === 0 ? 'disabled' : ''}>${options || '<option value="">No recipes unlocked yet</option>'}</select>
    <input id="planner-day" type="number" min="${gs.meta.clock.day}" value="${gs.meta.clock.day}" style="width:4em">
  `;
  const addBtn = document.createElement('button');
  addBtn.className = 'btn tiny';
  addBtn.setAttribute('data-action', 'recipes.planner-add');
  addBtn.textContent = 'Add to Plan';
  addBtn.disabled = unlockedRecipes.length === 0;
  addRow.appendChild(addBtn);
  body.appendChild(addRow);

  if (planner.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dim tiny';
    empty.textContent = 'No meals planned yet.';
    body.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'cs-list';
  planner
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.day - b.entry.day)
    .forEach(({ entry, index }) => {
      const row = document.createElement('div');
      row.className = 'cs-list-row';
      row.innerHTML = `<span>Day ${entry.day} — ${RECIPES[entry.recipeId]?.label || entry.recipeId}</span>`;
      const rm = document.createElement('button');
      rm.className = 'btn tiny btn-secondary';
      rm.setAttribute('data-action', 'recipes.planner-remove');
      rm.setAttribute('data-row-id', String(index));
      rm.textContent = 'Remove';
      row.appendChild(rm);
      list.appendChild(row);
    });
  body.appendChild(list);

  const fillBtn = document.createElement('button');
  fillBtn.className = 'btn tiny';
  fillBtn.setAttribute('data-action', 'recipes.planner-fill-cart');
  fillBtn.textContent = 'Fill Nile Cart With Missing Ingredients';
  body.appendChild(fillBtn);
}

// --- Escorts (external-world plan Phase 7) ---
// Three screens in the shape of every dating-ish app the player has used:
// browse the roster, read a profile and pick services + a start time, and a
// bookings list. The booking checklist renders ONLY the profile's advertised
// services (mature ones filtered by content flags, like AfterHours); the
// DOM checkboxes + time select are transient form state read at Book (the
// same exception the maid's grid already makes — committed state lives in
// world.escortBookings).

function renderEscortsBrowse(body, gs, app, screen) {
  const roster = getEscortRoster(gs);
  if (roster.length === 0) { body.innerHTML = '<p class="dim tiny">No escorts listed right now.</p>'; return; }
  const head = document.createElement('div');
  head.className = 'dd-menu-head';
  head.innerHTML = `<div class="hc-card-title">Escorts</div><div class="dim tiny">A small, discreet roster. Browse a profile, pick a service, book a time.</div>`;
  body.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'esc-grid';
  for (const entry of roster) {
    const npc = gs.npcs[entry.npcId];
    if (!npc) continue;
    const visible = entry.offeredServices.filter(sid => {
      const def = ESCORT_SERVICE_DEFS[sid];
      return !def?.requiresContentFlag || activeContentFlags(gs)[def.requiresContentFlag];
    });
    const card = document.createElement('div');
    card.className = 'esc-card';
    card.innerHTML = `
      <div class="dd-card-head">
        <span class="hc-card-title">${npc.bible.name}</span>
        <span class="dim tiny">${npc.bible.age}, ${npc.bible.gender}</span>
      </div>
      <div class="dim tiny">${entry.bio}</div>
      <div class="dim tiny">${entry.rate}/base — ${visible.length} service${visible.length === 1 ? '' : 's'} offered</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.setAttribute('data-action', 'escorts.view-profile');
    btn.setAttribute('data-row-id', entry.npcId);
    btn.textContent = 'View Profile';
    card.appendChild(btn);
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderEscortsProfile(body, gs, app, screen) {
  const escApp = gs.world.computer?.apps?.escorts;
  const entry = getEscortRoster(gs).find(e => e.npcId === escApp?.viewingNpcId);
  if (!entry) { body.innerHTML = '<p class="dim tiny">Pick an escort first.</p>'; return; }
  const npc = gs.npcs[entry.npcId];
  if (!npc) { body.innerHTML = '<p class="dim tiny">Profile unavailable.</p>'; return; }
  const offered = entry.offeredServices.map(sid => ESCORT_SERVICE_DEFS[sid]).filter(Boolean);
  const visible = offered.filter(d => !d.requiresContentFlag || activeContentFlags(gs)[d.requiresContentFlag]);

  const head = document.createElement('div');
  head.className = 'esc-profile-head';
  head.innerHTML = `<div class="hc-card-title">${npc.bible.name}</div><div class="dim tiny">${npc.bible.age}, ${npc.bible.gender} — ${entry.rate}/booking base</div>`;
  body.appendChild(head);

  const bio = document.createElement('p');
  bio.className = 'esc-bio dim';
  bio.textContent = entry.bio;
  body.appendChild(bio);

  const checklist = document.createElement('div');
  checklist.className = 'esc-check-list';
  const totalSpan = document.createElement('span');
  totalSpan.className = 'esc-total dim tiny';
  const updateTotal = () => {
    const checked = [...checklist.querySelectorAll('input:checked')].map(cb => cb.getAttribute('data-service'));
    const cost = getEscortVisitCost(gs, entry, checked);
    totalSpan.textContent = checked.length ? `Total: ${cost}` : `Base rate: ${entry.rate}`;
  };
  for (const def of visible) {
    const label = document.createElement('label');
    label.className = 'esc-check-item';
    const duration = def.durationTicks / 2;
    const durLabel = Number.isInteger(duration) ? `${duration}h` : `${Math.floor(duration)}h${duration % 1 ? ':30' : ''}`;
    label.innerHTML = `
      <input type="checkbox" class="esc-svc" data-service="${def.id}">
      <span><strong>${def.label}</strong> — ${def.rate} <span class="dim tiny">(${durLabel})</span><br><span class="dim tiny">${def.desc}</span></span>
    `;
    label.querySelector('.esc-svc').addEventListener('change', updateTotal);
    checklist.appendChild(label);
  }
  body.appendChild(checklist);
  body.appendChild(totalSpan);

  // Start-time select: tonight (needs the lead-time gap) or tomorrow
  // afternoon-evening. The visit must fit inside its day, so the last
  // selectable start is 48 − the longest purchased service's duration.
  const { day, minutes } = gs.meta.clock;
  const nowTick = getTickIndex(minutes);
  const maxDuration = Math.max(ESCORT_TUNING.minVisitTicks, ...visible.map(d => d.durationTicks || 0));
  const lastStart = Math.min(47, 48 - maxDuration);
  let opts = '<optgroup label="Tonight">';
  let anyToday = false;
  for (let t = nowTick + ESCORT_TUNING.earliestLeadTicks; t <= Math.min(ESCORT_TUNING.todayStartTickMax, lastStart); t++) {
    opts += `<option value="${day}:${t}">${formatTime(t * 30)}</option>`;
    anyToday = true;
  }
  if (!anyToday) opts += '<option value="" disabled>none left tonight</option>';
  opts += '</optgroup><optgroup label="Tomorrow">';
  for (let t = ESCORT_TUNING.tomorrowStartTickMin; t <= Math.min(ESCORT_TUNING.tomorrowStartTickMax, lastStart); t++) {
    opts += `<option value="${day + 1}:${t}">${formatTime(t * 30)}</option>`;
  }
  opts += '</optgroup>';
  const timeRow = document.createElement('div');
  timeRow.className = 'esc-time-row';
  timeRow.innerHTML = `<label class="dim tiny">Start:</label> <select class="esc-time-select">${opts}</select>`;
  body.appendChild(timeRow);

  const actions = document.createElement('div');
  actions.className = 'hc-maid-actions';
  const book = document.createElement('button');
  book.className = 'btn tiny';
  book.setAttribute('data-action', 'escorts.book');
  book.setAttribute('data-row-id', entry.npcId);
  book.textContent = 'Book';
  actions.appendChild(book);
  const back = document.createElement('button');
  back.className = 'btn tiny btn-secondary';
  back.setAttribute('data-action', 'computer.open-screen');
  back.setAttribute('data-app', 'escorts');
  back.setAttribute('data-screen', 'browse');
  back.textContent = 'Back';
  actions.appendChild(back);
  body.appendChild(actions);
  updateTotal();
}

function renderEscortsBookings(body, gs, app, screen) {
  const bookings = gs.world.escortBookings || [];
  if (bookings.length === 0) { body.innerHTML = '<p class="dim tiny">No bookings yet.</p>'; return; }
  const { day, minutes } = gs.meta.clock;
  const tick = getTickIndex(minutes);
  const sorted = [...bookings].sort((a, b) => (a.day - b.day) || (a.startTick - b.startTick));
  for (const b of sorted) {
    const npc = gs.npcs[b.escortNpcId];
    const name = npc?.bible?.name || 'An escort';
    const labels = (b.services || []).map(sid => ESCORT_SERVICE_DEFS[sid]?.label || sid).join(', ');
    const when = b.day === day
      ? `Today ${formatTime(b.startTick * 30)}`
      : b.day === day + 1 ? `Tomorrow ${formatTime(b.startTick * 30)}`
      : `Day ${b.day}, ${formatTime(b.startTick * 30)}`;
    const status = b.status !== 'active' ? 'done'
      : (b.day === day && tick >= b.startTick) ? 'onsite'
      : b.day < day ? 'done' : 'upcoming';
    const row = document.createElement('div');
    row.className = 'hc-hired-row';
    row.innerHTML = `<div><div class="hc-card-title">${name}</div><div class="dim tiny">${when} — ${labels} — ${b.price}</div></div>`;
    const pill = document.createElement('span');
    pill.className = `cs-status-pill${status === 'done' ? ' done' : ' active'}`;
    pill.textContent = status;
    row.appendChild(pill);
    body.appendChild(row);
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
  rentInfo.textContent = `Rent: ${ECONOMY.rent.total}/wk total · Roommate share ${minShare}–${maxShare} (ceiling ${ceilingPct}% based on quality)`;
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

// Move-in offers (external-world plan Phase 8): external NPCs a resident
// (or the player) vouched for in conversation. Each row routes into the SAME
// assign flow a Classifieds applicant uses (renderRoomListAssign) — "no new
// UI" for the offer itself, just a different entry point. Prospective
// applicants never appear here; they already have the Applicants flow.
function renderRoomListOffers(body, gs, app, screen) {
  const offers = (gs.world.moveInOffers || []).filter(o => {
    const npc = gs.npcs[o.npcId];
    return npc && npc.residency?.status !== 'resident' && npc.residency?.status !== 'prospective';
  });
  if (offers.length === 0) {
    body.innerHTML = '<p class="dim tiny">No move-in offers yet. When a roommate close to someone — or you, close to an external — brings up moving in during conversation, the offer shows up here to act on.</p>';
    return;
  }
  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = `
    <div class="rl-hero-title">Move-in Offers</div>
    <div class="dim tiny">People vouched for in conversation. Offer them a room through the same flow as a RoomList applicant.</div>
  `;
  body.appendChild(hero);

  for (const offer of offers) {
    const npc = gs.npcs[offer.npcId];
    if (!npc) continue;
    const b = npc.bible;
    const advocate = offer.advocatedBy === 'player'
      ? 'You'
      : (gs.npcs[offer.advocatedBy]?.bible?.name || 'A roommate');
    const rel = npc.relPlayer || {};
    const phase = rel.conversationPhase || 'early';

    const row = document.createElement('div');
    row.className = 'rl-offer-row';
    const card = document.createElement('div');
    card.className = 'rl-card';
    card.innerHTML = `
      <div class="rl-card-avatar" style="background: ${hashToColor(b.name)};">${b.name.charAt(0)}</div>
      <div class="rl-card-name">${b.name}</div>
      <div class="dim tiny">${b.occupation.title || ''}${advocate !== 'You' ? ` · advocated by ${advocate}` : ''}</div>
      <div class="dim tiny" style="margin-top:2px;">${b.age || ''} · you're ${phase} with them</div>
    `;
    row.appendChild(card);
    const offerBtn = document.createElement('button');
    offerBtn.className = 'btn tiny';
    offerBtn.setAttribute('data-action', 'classifieds.assign-room');
    offerBtn.setAttribute('data-row-id', offer.npcId);
    offerBtn.textContent = 'Offer a Room';
    row.appendChild(offerBtn);
    body.appendChild(row);
  }
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
      <div class="rl-card-name">${fullName(stub)}${statusBadge}${star}</div>
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
// Phase 5 (D12/D16/D17): the Character Studio hosts TWO surfaces — the
// existing create-a-character draft builder and the per-character profile.
// Navigation state lives in classifieds.studio (the app object), never the
// DOM: `mode` is 'create' | 'list' | 'profile'. The profile surface never
// touches studio.draft (the top-of-phase check) — a saved game's residents
// and an in-progress draft cannot share a struct.
function renderRoomListStudio(body, gs, app, screen) {
  const classifieds = gs.world.computer.apps.classifieds;
  const studio = classifieds.studio || (classifieds.studio = studioDefaultState());
  studio.mode = studio.mode || 'create';
  if (studio.mode === 'list') { renderStudioListMode(body, gs, studio); return; }
  if (studio.mode === 'profile') {
    const npc = gs.npcs[studio.viewingNpcId];
    if (npc) { renderStudioProfileMode(body, gs, studio, npc); return; }
    // Stale viewingNpcId (evicted, former, or a save that referenced an id
    // that no longer exists) — fall back to the list instead of a dead tab.
    studio.mode = 'list';
    studio.viewingNpcId = null;
    renderStudioListMode(body, gs, studio);
    return;
  }
  renderStudioCreateMode(body, gs, studio);
}

// Fresh-state fallback for old saves whose classifieds.studio predates the
// Phase 5 profile keys (normalizeComputerState replaces the whole studio
// object, so the defaults live here too, read-side).
function studioDefaultState() {
  return { draft: {}, concept: defaultConceptState(), preview: null, mode: 'create', viewingNpcId: null, tab: 'personal', editMode: false, editSelections: {} };
}

// Mode-switch bar: "New Character" (create) and "Characters" (list), shown on
// every studio surface so the two halves are never more than one click apart
// (D16 — one home in the classifieds).
function studioModeBar(body, studio, active) {
  const row = document.createElement('div');
  row.className = 'rl-studio-modebar';
  for (const [mode, label] of [['create', '✎ New Character'], ['list', 'Characters']]) {
    const btn = document.createElement('button');
    btn.className = 'btn tiny' + (studio.mode === mode ? ' rl-studio-modebar-active' : ' btn-secondary');
    btn.setAttribute('data-action', 'classifieds.studio-set-mode');
    btn.setAttribute('data-row-id', mode);
    btn.textContent = label;
    row.appendChild(btn);
  }
  body.appendChild(row);
  return row;
}

// The draft builder — the pre-Phase-5 studio, unchanged except for the
// mode bar on top and the action handlers routing through the same studio
// object.
function renderStudioCreateMode(body, gs, studio) {
  const classifieds = gs.world.computer.apps.classifieds;
  const d = studio.draft || (studio.draft = {});
  studioModeBar(body, studio, 'create');

  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = '<div class="rl-hero-title">Character Studio</div><div class="dim tiny">Build a character from scratch. Leave fields empty to let them be rolled randomly.</div>';
  body.appendChild(hero);

  // --- Describe & Generate (AI-Assisted Character Generation Phase 3) ---
  // Replaces the old bespoke "AI Generate" box, which asked for no appearance
  // at all and hard-filtered its reply against four inlined pools. This is the
  // shared section (concept.js), collapsed by default per D7.
  if (!studio.concept) studio.concept = defaultConceptState();
  const conceptEl = renderConceptSection(studio.concept, {
    key: 'studio-create',
    scope: 'npcFull',
    toggleAction: 'classifieds.studio-concept-toggle',
    generateAction: 'classifieds.studio-concept-generate',
  });
  if (conceptEl) body.appendChild(conceptEl);

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
  idSection.appendChild(studioSelectField('Occupation', 'occupationCategory', d.occupationCategory || '', occCats, true));
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

  // --- Appearance (AI-Assisted Character Generation Phase 3) ---
  // The create surface had NO appearance fields at all before this — you could
  // build a whole character here and never say what they looked like, and a
  // generated appearance had nowhere to display (plan design invariant 6).
  // Built by walking PLAYER_STUDIO_TABS rather than authoring a third
  // appearance form, so the two surfaces cannot offer different vocabularies.
  body.appendChild(renderStudioCreateAppearance(d));

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

// The create surface's appearance block (AI-Assisted Character Generation
// Phase 3). Walks PLAYER_STUDIO_TABS — the Player Design studio's one table —
// and renders its scalar fields here, so a field added there appears here too
// and the two surfaces can never drift into offering different vocabularies.
//
// SCOPE, deliberately: scalar fields only. The `toggles` and `rows` groups
// (marks, piercings, tattoos, anatomy) need the full studio's own add/remove
// machinery and stay there. That is safe rather than lossy only because
// collectStudioDraft now PRESERVES draft.physical keys with no control on
// screen — without that, opening this surface would quietly delete a
// generated set of piercings (plan design invariant 6).
const STUDIO_CREATE_APPEARANCE_TABS = ['body', 'face', 'style'];

function renderStudioCreateAppearance(draft) {
  const section = document.createElement('div');
  section.className = 'rl-studio-section';
  section.innerHTML = '<div class="rl-studio-section-title">Appearance</div>';
  if (typeof PLAYER_STUDIO_TABS === 'undefined') return section;

  const read = (path) => {
    let cur = draft;
    for (const seg of path.split('.')) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = cur[seg];
    }
    return cur == null ? '' : cur;
  };

  for (const tab of PLAYER_STUDIO_TABS) {
    if (!STUDIO_CREATE_APPEARANCE_TABS.includes(tab.id)) continue;
    for (const group of tab.sections || []) {
      for (const field of group.fields || []) {
        if (field.kind !== 'select' && field.kind !== 'text') continue;
        const wrap = document.createElement('div');
        wrap.className = 'rl-studio-field';
        wrap.innerHTML = `<label class="rl-studio-label tiny">${group.label} — ${field.label}</label>`;
        const free = typeof studioFieldIsFreeText === 'function' ? studioFieldIsFreeText(field) : !!field.pool;
        let control;
        if (free && field.pool) {
          control = comboControl({
            value: read(field.path),
            pool: field.pool,
            placeholder: field.placeholder || 'Rolled if blank',
            className: 'rl-studio-input',
            maxLength: field.maxLength || 200,
            attrs: { 'data-studio-field': field.path },
          });
        } else {
          control = document.createElement('input');
          control.type = 'text';
          control.className = 'rl-studio-input';
          control.value = read(field.path);
          control.placeholder = field.placeholder || 'Rolled if blank';
          if (field.maxLength) control.maxLength = field.maxLength;
          control.setAttribute('data-studio-field', field.path);
        }
        wrap.appendChild(control);
        section.appendChild(wrap);
      }
    }
  }
  return section;
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

// `free` (AI-Assisted Character Generation Phase 1, D1/D2) makes this a
// type-or-pick combo. Passed for occupation; withheld for gender, which
// carries a schema enum (D2a). The returned wrapper is unchanged and the
// control is still harvested by `.value` off `data-studio-field`, so
// collectStudioDraft needs no change.
function studioSelectField(label, field, value, options, free) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${label}</label>`;
  if (free) {
    wrap.appendChild(comboControl({
      value,
      // The leading '— Random —' entry is a <select> affordance, not a real
      // value; a combo says the same thing with its placeholder.
      pool: options.map(o => o.val).filter(Boolean),
      placeholder: 'Random, or type your own',
      className: 'rl-studio-input',
      maxLength: 120,
      attrs: { 'data-studio-field': field },
    }));
    return wrap;
  }
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
  // The checkbox gates whether this axis is set at all (unchecked = not
  // authored, save omits it) — nothing previously toggled the slider's own
  // disabled state when the checkbox changed, so it stayed stuck disabled
  // even after checking it.
  cb.addEventListener('change', () => {
    slider.disabled = !cb.checked;
    const valEl = wrap.querySelector(`#${id}-val`);
    if (valEl) valEl.textContent = cb.checked ? parseFloat(slider.value).toFixed(1) : '—';
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
  return studioPoolPickerFor(label, field, pool, selected, max, 'classifieds.studio-toggle-pool');
}

// --- Phase 5 (D12/D16/D17) — the Character Studio's profile surface ---
// A per-character record for ANY existing NPC: tab-organized read-only view
// of everything stored on them, with a schema-validated Edit Mode (D17). The
// Memory tab is the studio's reader for the knowledge-gossip record; More
// Details holds every mechanical field the fiction never shows.

// Which fields each editable tab shows, grouped into sections. Paths are
// resolved against CHARACTER_SCHEMA via validateNpcField — the tab contents
// and the save validator literally share one schema, so the surface can
// never offer a field the validator rejects (or vice versa).
const STUDIO_TABS = {
  personal: [
    { label: 'Identity', paths: ['bible.name', 'bible.age', 'bible.gender', 'bible.genSeed'] },
    { label: 'Temperament', paths: ['bible.temperament.warmth', 'bible.temperament.volatility', 'bible.temperament.openness', 'bible.temperament.conscientiousness', 'bible.temperament.assertiveness', 'bible.temperament.selfAwareness'] },
    { label: 'Personality', paths: ['bible.personality.coreTrait', 'bible.personality.hiddenTrait', 'bible.personality.traits', 'bible.personality.quirks', 'bible.personality.likes', 'bible.personality.dislikes'] },
    { label: 'Occupation', paths: ['bible.occupation.category', 'bible.occupation.title', 'bible.occupation.scheduleTemplate', 'bible.occupation.incomeBand', 'bible.occupation.hours'] },
    { label: 'Speech', paths: ['bible.speech.verbosity', 'bible.speech.formality', 'bible.speech.humorStyle', 'bible.speech.profanityLevel', 'bible.speech.vocabularyLevel', 'bible.speech.textingStyle', 'bible.speech.verbalTics', 'bible.speech.catchphrases'] },
    { label: 'Interests & Values', paths: ['bible.interests', 'bible.values'] },
    { label: 'Narrative', paths: ['bible.baggage', 'bible.wound', 'bible.want', 'bible.blindSpot', 'bible.boundary'] },
    { label: 'Prose', paths: ['bible.history', 'bible.sketch', 'bible.sampleLines'] },
  ],
  appearance: [
    { label: 'Overview', paths: ['bible.visual'] },
    { label: 'Height & Build', paths: ['bible.physical.height', 'bible.physical.build', 'bible.physical.heightBuild'] },
    { label: 'Hair', paths: ['bible.physical.hair.color', 'bible.physical.hair.style', 'bible.physical.hair.length', 'bible.physical.hair.texture'] },
    { label: 'Eyes', paths: ['bible.physical.eyes.color', 'bible.physical.eyes.shape'] },
    { label: 'Skin', paths: ['bible.physical.skin.tone', 'bible.physical.skin.texture', 'bible.physical.skin.ethnicity'] },
    { label: 'Face', paths: ['bible.physical.face.shape', 'bible.physical.face.nose', 'bible.physical.face.lips', 'bible.physical.face.cheekbones', 'bible.physical.face.jawline', 'bible.physical.face.ears', 'bible.physical.facialHair'] },
    { label: 'Body', paths: ['bible.physical.body.shape', 'bible.physical.body.chestSize', 'bible.physical.body.buttSize', 'bible.physical.body.legs', 'bible.physical.body.posture'] },
    { label: 'Details', paths: ['bible.physical.distinguishingFeatures', 'bible.physical.piercings', 'bible.physical.tattoos'] },
    { label: 'Style', paths: ['bible.physical.fashion', 'bible.physical.accessories', 'bible.physical.gait', 'bible.physical.scent'] },
    { label: 'Attire', paths: ['bible.physical.typicalAttire.casual', 'bible.physical.typicalAttire.work', 'bible.physical.typicalAttire.sleep', 'bible.physical.typicalAttire.formal'] },
    { label: 'Voice', paths: ['bible.physical.voice.pitch', 'bible.physical.voice.texture', 'bible.physical.voice.accent'] },
  ],
  relationship: [
    { label: 'Your Relationship', paths: ['relPlayer.trust', 'relPlayer.affection', 'relPlayer.tension', 'relPlayer.respect', 'relPlayer.comfort', 'relPlayer.desire', 'relPlayer.firstMetDay', 'relPlayer.lastInteractionDay'] },
    { label: 'Grievances', paths: ['relPlayer.grievances'] },
  ],
};
const STUDIO_EDITABLE_TABS = ['personal', 'appearance', 'relationship'];

// Read a value out of the live NPC object at a dotted path with [n]
// segments ('bible.interests[0].name', 'relPlayer.grievances[0]').
function studioGetPath(obj, path) {
  let cur = obj;
  for (const bit of String(path).split('.')) {
    const m = /^([^[\]]*)(?:\[(\d+)\])?$/.exec(bit);
    if (!m || (m[1] === '' && m[2] === undefined)) return undefined;
    if (m[1] !== '') {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[m[1]];
    }
    if (m[2] !== undefined) {
      if (cur == null || !Array.isArray(cur)) return undefined;
      cur = cur[Number(m[2])];
    }
  }
  return cur;
}

// Schema-driven label for a path: the last key, capitalised (nested paths
// show the full tail so two "color" fields don't collide in the UI).
function studioPathLabel(path) {
  const key = path.split('.').pop();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Pool pickers used by BOTH surfaces — the draft builder toggles
// studio.draft, the profile Edit Mode toggles studio.editSelections. The
// action attribute is what splits them.
function studioPoolPickerFor(label, field, pool, selected, max, action) {
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
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-row-id', `${field}:${name}`);
    btn.textContent = name;
    grid.appendChild(btn);
  }

  // AI-Assisted Character Generation Phase 1 (D1, plan design invariant 6).
  // A grid only draws its pool, so a selected value from outside it — an AI
  // fill, an imported character, a hand-edited save — rendered as nothing at
  // all, then died on the next harvest with no error shown. These chips are
  // active by construction (they are only here because they ARE selected) and
  // carry the same toggle verb, so removing one works exactly like removing a
  // pool chip.
  for (const name of offPoolValues([...selectedSet], pool)) {
    const btn = document.createElement('button');
    btn.className = 'btn tiny rl-filter-btn rl-studio-pool-btn active rl-studio-pool-offpool';
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-row-id', `${field}:${name}`);
    btn.textContent = name;
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);

  // "Add your own" — the grid's counterpart to comboControl. Routed to a
  // wrapper verb per surface that reads the box and then calls the SAME
  // toggle handler the chips use, so there is one selection code path rather
  // than a second one that can drift.
  wrap.appendChild(customChipInput({
    field,
    addAction: action === 'classifieds.studio-edit-pool'
      ? 'classifieds.studio-edit-add-custom'
      : 'classifieds.studio-add-custom',
    placeholder: 'Add your own…',
    className: 'rl-studio-input',
  }));
  return wrap;
}

// The character picker (D16's "view/edit any character" mode): every NPC
// currently in the game, residents first, each row opening its profile.
function renderStudioListMode(body, gs, studio) {
  studioModeBar(body, studio, 'list');
  const hero = document.createElement('div');
  hero.className = 'rl-hero';
  hero.innerHTML = '<div class="rl-hero-title">Characters</div><div class="dim tiny">Every character in your story — residents, visitors, applicants. Open one to view or edit their full record.</div>';
  body.appendChild(hero);

  const npcs = Object.entries(gs.npcs);
  const statusRank = { resident: 0, partner_of_resident: 1, prospective: 2, visitor: 3, former: 4 };
  npcs.sort((a, b) => {
    const ra = statusRank[a[1]?.residency?.status] ?? 9;
    const rb = statusRank[b[1]?.residency?.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return (a[1]?.bible?.name || '').localeCompare(b[1]?.bible?.name || '');
  });

  if (npcs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rl-studio-section';
    empty.innerHTML = '<div class="dim">No characters yet — build one above.</div>';
    body.appendChild(empty);
    return;
  }

  const groups = [
    ['Residents', (n) => ['resident', 'partner_of_resident'].includes(n?.residency?.status)],
    ['Visitors & Others', (n) => !['resident', 'partner_of_resident'].includes(n?.residency?.status)],
  ];
  for (const [groupLabel, match] of groups) {
    const rows = npcs.filter(([, n]) => match(n));
    if (rows.length === 0) continue;
    const section = document.createElement('div');
    section.className = 'rl-studio-section';
    section.innerHTML = `<div class="rl-studio-section-title">${groupLabel}</div>`;
    for (const [npcId, n] of rows) {
      const b = n.bible || {};
      const row = document.createElement('div');
      row.className = 'rl-studio-charrow';
      const statusLabel = (n.residency?.status || '').replace(/_/g, ' ');
      row.innerHTML = `
        <div class="rl-card-avatar rl-studio-char-avatar" style="background: ${hashToColor(b.name || npcId)};">${(b.name || '?').charAt(0)}</div>
        <div class="rl-studio-char-info">
          <div class="rl-studio-char-name">${b.name || 'Unnamed'}</div>
          <div class="dim tiny">${b.age ?? '—'} · ${b.gender || '—'} · ${b.occupation?.title || '—'} · ${statusLabel}</div>
        </div>`;
      const openBtn = document.createElement('button');
      openBtn.className = 'btn tiny';
      openBtn.setAttribute('data-action', 'classifieds.studio-set-mode');
      openBtn.setAttribute('data-row-id', `profile:${npcId}`);
      openBtn.textContent = 'View';
      row.appendChild(openBtn);
      section.appendChild(row);
    }
    body.appendChild(section);
  }
}

// The profile: header + tabs + tab content. Edit Mode (studio.editMode)
// swaps Personal/Appearance/Relationship from read-only rows to
// schema-validated inputs; Memory/Gallery/More Details are readers only.
function renderStudioProfileMode(body, gs, studio, npc) {
  const b = npc.bible || {};
  studioModeBar(body, studio, 'profile');

  const header = document.createElement('div');
  header.className = 'rl-profile rl-studio-profile-header';
  const statusLabel = (npc.residency?.status || '').replace(/_/g, ' ');
  header.innerHTML = `
    <div class="rl-profile-header">
      <div class="rl-card-avatar rl-profile-avatar" style="background: ${hashToColor(b.name)};">${(b.name || '?').charAt(0)}</div>
      <div>
        <div class="rl-profile-name">${fullName(b) || 'Unnamed'}</div>
        <div class="dim tiny">${b.age ?? '—'} · ${b.gender || '—'} · ${b.occupation?.title || '—'}</div>
        <div class="dim tiny">${statusLabel} · ${b.sketch ? `“${b.sketch}”` : ''}</div>
      </div>
    </div>
  `;
  body.appendChild(header);

  // Edit Mode toggle — only meaningful on the editable tabs.
  if (STUDIO_EDITABLE_TABS.includes(studio.tab)) {
    const editRow = document.createElement('div');
    editRow.className = 'rl-studio-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn tiny' + (studio.editMode ? ' rl-studio-modebar-active' : ' btn-secondary');
    editBtn.setAttribute('data-action', 'classifieds.studio-edit-toggle');
    editBtn.textContent = studio.editMode ? 'Done Editing' : 'Edit';
    editRow.appendChild(editBtn);
    if (studio.editMode) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn tiny';
      saveBtn.setAttribute('data-action', 'classifieds.studio-save-edits');
      saveBtn.textContent = 'Save Changes';
      editRow.appendChild(saveBtn);
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary tiny';
      cancelBtn.setAttribute('data-action', 'classifieds.studio-edit-discard');
      cancelBtn.textContent = 'Discard';
      editRow.appendChild(cancelBtn);
    }
    body.appendChild(editRow);
  }

  // Tab bar.
  const tabBar = document.createElement('div');
  tabBar.className = 'rl-studio-tabs';
  const tabs = [['personal', 'Personal'], ['appearance', 'Appearance'], ['gallery', 'Gallery'], ['relationship', 'Relationship'], ['memory', 'Memory'], ['more', 'More Details']];
  for (const [id, label] of tabs) {
    const btn = document.createElement('button');
    btn.className = 'rl-studio-tab' + (studio.tab === id ? ' active' : '');
    btn.setAttribute('data-action', 'classifieds.studio-set-tab');
    btn.setAttribute('data-row-id', id);
    btn.textContent = label;
    tabBar.appendChild(btn);
  }
  body.appendChild(tabBar);

  const content = document.createElement('div');
  content.className = 'rl-studio-tabcontent';
  body.appendChild(content);

  const renderers = {
    personal: renderStudioPersonalTab,
    appearance: renderStudioAppearanceTab,
    gallery: renderStudioGalleryTab,
    relationship: renderStudioRelationshipTab,
    memory: renderStudioMemoryTab,
    more: renderStudioMoreDetailsTab,
  };
  (renderers[studio.tab] || renderStudioPersonalTab)(content, gs, studio, npc);
}

// A schema-driven field row. editMode swaps it between a read-only display
// and a validated input (data-studio-edit-path carries the path the Save
// handler validates + writes).
function studioFieldRow(spec, path, value, editMode) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  if (!editMode) {
    wrap.innerHTML = `<label class="rl-studio-label tiny">${studioPathLabel(path)}</label>`;
    const body = document.createElement('div');
    body.className = 'tiny rl-studio-readval';
    let display = value;
    if (Array.isArray(display)) {
      display = display.map(v => (v && typeof v === 'object') ? (v.name ?? JSON.stringify(v)) : v).join(', ');
    }
    if (display === undefined || display === null || display === '') body.textContent = '—';
    else body.textContent = String(display);
    wrap.appendChild(body);
    return wrap;
  }
  const label = document.createElement('label');
  label.className = 'rl-studio-label tiny';
  label.textContent = studioPathLabel(path);
  wrap.appendChild(label);

  if (spec.type === 'string') {
    if (spec.enum) {
      const sel = document.createElement('select');
      sel.className = 'rl-studio-input';
      sel.setAttribute('data-studio-edit-path', path);
      for (const opt of spec.enum) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === value) o.selected = true;
        sel.appendChild(o);
      }
      wrap.appendChild(sel);
    } else {
      // Already free text before this plan — the Edit Mode was the one
      // surface that got D1 right by accident, because it renders from the
      // schema rather than from a pool table. All Phase 1 adds is the pool as
      // native SUGGESTIONS, so the appearance tab stops being the only place
      // you have to remember the vocabulary from memory.
      const pool = studioScalarPoolFor(path);
      const input = pool
        ? comboControl({
            value: value || '',
            pool,
            className: 'rl-studio-input',
            maxLength: spec.maxLength,
            attrs: { 'data-studio-edit-path': path },
          })
        : (() => {
            const el = document.createElement('input');
            el.type = 'text';
            el.className = 'rl-studio-input';
            el.value = value || '';
            if (spec.maxLength) el.maxLength = spec.maxLength;
            el.setAttribute('data-studio-edit-path', path);
            return el;
          })();
      wrap.appendChild(input);
    }
  } else if (spec.type === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'rl-studio-input';
    if (spec.range) {
      input.min = spec.range[0];
      input.max = spec.range[1];
      input.step = (spec.range[1] - spec.range[0]) <= 2 ? 0.1 : 1;
    }
    input.value = value ?? '';
    input.setAttribute('data-studio-edit-path', path);
    wrap.appendChild(input);
  } else if (spec.type === 'boolean') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = value === true;
    cb.setAttribute('data-studio-edit-path', path);
    wrap.appendChild(cb);
  }
  return wrap;
}

// String-array fields render as a textarea (one entry per line) in Edit Mode.
function studioArrayTextarea(path, value) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-studio-field';
  wrap.innerHTML = `<label class="rl-studio-label tiny">${studioPathLabel(path)} — one per line</label>`;
  const ta = document.createElement('textarea');
  ta.className = 'rl-studio-input';
  ta.rows = Math.max(2, Math.min(6, (value || []).length + 1));
  ta.value = (value || []).join('\n');
  ta.setAttribute('data-studio-edit-path', path);
  ta.setAttribute('data-studio-edit-kind', 'array');
  wrap.appendChild(ta);
  return wrap;
}

// Shared section renderer: read-only rows, or the schema-driven editor.
function renderStudioSections(content, gs, studio, npc, groups) {
  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'rl-studio-section';
    section.innerHTML = `<div class="rl-studio-section-title">${group.label}</div>`;
    for (const path of group.paths) {
      const spec = resolveNpcFieldSpec(path);
      if (spec.error) continue;
      const value = studioGetPath(npc, path);
      if (studio.editMode) {
        if (spec.arrayElement) {
          if (spec.spec.itemFields) {
            // Object arrays (interests/values) edit via their pools.
            const field = path.split('[')[0];
            const pool = field === 'bible.interests' ? INTEREST_POOL
              : field === 'bible.values' ? VALUES_POOL : [];
            if (pool.length > 0) {
              const hasPending = studio.editSelections && Object.prototype.hasOwnProperty.call(studio.editSelections, path);
              const names = hasPending ? (studio.editSelections[path] || []) : (value || []).map(v => (typeof v === 'object' && v) ? v.name : v);
              const max = spec.spec.maxItems;
              section.appendChild(studioPoolPickerFor(group.label + ' — ' + studioPathLabel(path), path, pool, names, max, 'classifieds.studio-edit-pool'));
              continue;
            }
          }
          section.appendChild(studioArrayTextarea(path, value || []));
          continue;
        }
        if (spec.spec.type === 'array') {
          // Plain string arrays without a pool → textarea.
          const pool = studioPoolFor(path);
          if (pool && pool.length > 0) {
            const hasPending = studio.editSelections && Object.prototype.hasOwnProperty.call(studio.editSelections, path);
            const names = hasPending ? (studio.editSelections[path] || []) : (value || []).map(v => (typeof v === 'object' && v) ? v.name : v);
            section.appendChild(studioPoolPickerFor(group.label + ' — ' + studioPathLabel(path), path, pool, names, spec.spec.maxItems, 'classifieds.studio-edit-pool'));
          } else {
            section.appendChild(studioArrayTextarea(path, value || []));
          }
          continue;
        }
        section.appendChild(studioFieldRow(spec.spec, path, value, true));
      } else {
        section.appendChild(studioFieldRow(spec.spec, path, value, false));
      }
    }
    content.appendChild(section);
  }
}

// Which pool a field edits against, when one exists.
// Suggestion pool for a SCALAR schema path (AI-Assisted Character Generation
// Phase 1). Indexed lazily out of PLAYER_STUDIO_TABS rather than restated
// here: that table already binds every appearance field to its pool by
// `schemaPath`, and a second hand-written map is exactly how one surface ends
// up offering a vocabulary the other doesn't. Built on first use because the
// PHYS_POOL_* consts and PLAYER_STUDIO_TABS both resolve at call time, never
// at definition time (the load-order reason that table uses pool thunks).
let _studioScalarPoolIndex = null;
function studioScalarPoolFor(schemaPath) {
  if (!_studioScalarPoolIndex) {
    _studioScalarPoolIndex = new Map();
    if (typeof PLAYER_STUDIO_TABS !== 'undefined') {
      for (const tab of PLAYER_STUDIO_TABS) {
        for (const section of tab.sections || []) {
          for (const field of section.fields || []) {
            if (field.schemaPath && typeof field.pool === 'function') {
              _studioScalarPoolIndex.set(field.schemaPath, field.pool);
            }
          }
        }
      }
    }
  }
  const thunk = _studioScalarPoolIndex.get(schemaPath);
  if (!thunk) return null;
  try {
    const pool = thunk();
    return Array.isArray(pool) && pool.length > 0 ? pool : null;
  } catch (e) {
    return null;   // a pool whose gender-dependent thunk has no subject open
  }
}

function studioPoolFor(path) {
  switch (path) {
    case 'bible.personality.traits': return PERSONALITY_TRAITS_POOL;
    case 'bible.personality.quirks': return QUIRKS_POOL;
    case 'bible.personality.likes': return LIKES_POOL;
    case 'bible.personality.dislikes': return DISLIKES_POOL;
    case 'bible.interests': return INTEREST_POOL;
    case 'bible.values': return VALUES_POOL;
    default: return null;
  }
}

function renderStudioPersonalTab(content, gs, studio, npc) {
  renderStudioSections(content, gs, studio, npc, STUDIO_TABS.personal);
}

function renderStudioAppearanceTab(content, gs, studio, npc) {
  renderStudioSections(content, gs, studio, npc, STUDIO_TABS.appearance);
}

// Relationship: the relPlayer axes (read-only bars or validated inputs), the
// derived intimacyLevel/conversationPhase shown read-only (D17 — derived
// fields recompute from what was edited, they are never written), and the
// grievance log.
function renderStudioRelationshipTab(content, gs, studio, npc) {
  const rel = npc.relPlayer || {};
  const derived = deriveConversationPhase(rel);

  const derivedCard = buildProfileCard('Derived — recomputed from your edits');
  const dRows = [
    ['Conversation Phase', derived.conversationPhase],
    ['Intimacy Level', `${derived.intimacyLevel}/100`],
  ];
  for (const [label, val] of dRows) {
    derivedCard.appendChild(studioReadRow(label, val));
  }
  content.appendChild(derivedCard);

  renderStudioSections(content, gs, studio, npc, STUDIO_TABS.relationship);

  // Grievance log (read-only; grievances edit through the axis fields above).
  const grv = buildProfileCard('Grievances');
  const grievances = rel.grievances || [];
  if (grievances.length === 0) grv.appendChild(studioReadRow('Open grievances', 'None'));
  else grievances.forEach((g, i) => {
    const text = typeof g === 'string' ? g : (g.text || JSON.stringify(g));
    grv.appendChild(studioReadRow(`#${i + 1}`, text));
  });
  content.appendChild(grv);
}

function studioReadRow(label, value) {
  const row = document.createElement('div');
  row.className = 'rl-studio-readrow';
  row.innerHTML = `<span class="rl-studio-label tiny">${label}</span><span class="tiny rl-studio-readval">${value === undefined || value === null || value === '' ? '—' : value}</span>`;
  return row;
}

// Memory (Phase 5's reader for the knowledge-gossip record): every field of
// the extended fact record, the episodes, recent exchanges, the summary, the
// open questions, and the D11 player model. Fed by buildMemoryProfileView —
// a pure npc.js reader, so the DOM half is a projection with no logic.
function renderStudioMemoryTab(content, gs, studio, npc) {
  const view = buildMemoryProfileView(npc);
  const fmtPct = (v) => `${Math.round((v ?? 1) * 100)}%`;
  const provLabel = (p) => p.startsWith('told_by:') ? `told by ${p.slice('told_by:'.length)}` : p;

  // Player model (D11).
  const pm = view.playerModel;
  const pmCard = buildProfileCard('What they know about you');
  pmCard.appendChild(studioReadRow('Observed first-hand', pm.observes.length === 0 ? 'Nothing yet' : pm.observes.map(o => o.text).join(' | ')));
  pmCard.appendChild(studioReadRow('Told about you', pm.derivesFrom.length === 0 ? 'Nothing yet' : pm.derivesFrom.map(o => `${o.text} (${fmtPct(o.confidence)})`).join(' | ')));
  pmCard.appendChild(studioReadRow('Shared moments', pm.shared.length === 0 ? 'None yet' : pm.shared.map(s => `${s.text} (Day ${s.day})`).join(' | ')));
  pmCard.appendChild(studioReadRow('Honesty', fmtPct(pm.honesty)));
  content.appendChild(pmCard);

  // Open questions (D9) + the D13 bridge.
  const qCard = buildProfileCard('Open questions');
  if (view.openQuestions.length === 0) {
    qCard.appendChild(studioReadRow('Wondering about', 'Nothing at the moment'));
  } else {
    for (const q of view.openQuestions) {
      const raised = view.openQuestion && view.openQuestion.factId === q.factId ? ' — would raise this now' : '';
      const targets = Array.isArray(q.targets) && q.targets.length > 0 ? ` → asks ${q.targets.join(', ')}` : '';
      qCard.appendChild(studioReadRow(`Q on fact #${q.factId}${raised}`, `${q.topic} — curiosity ${q.curiosity.toFixed(2)}, ${q.age} days old${targets}`));
    }
  }
  content.appendChild(qCard);

  // Facts — every field of the extended record.
  const fCard = buildProfileCard(`Facts (${view.facts.length})`);
  if (view.facts.length === 0) {
    fCard.appendChild(studioReadRow('Facts', 'None recorded yet'));
  } else {
    for (const f of view.facts) {
      const flags = [
        provLabel(f.provenance),
        `conf ${fmtPct(f.confidence)}`,
        `sal ${fmtPct(f.salience)}`,
        f.pinned ? 'pinned' : '',
        f.emotionalTag ? f.emotionalTag : '',
        f.valid ? '' : 'invalid',
        `#${f.factId}`,
      ].filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = 'rl-memory-fact';
      row.innerHTML = `<div class="tiny rl-memory-fact-text">${f.text}</div><div class="dim tiny">${flags}</div>`;
      fCard.appendChild(row);
    }
  }
  content.appendChild(fCard);

  // Episodes.
  const eCard = buildProfileCard(`Episodes (${view.episodes.length})`);
  if (view.episodes.length === 0) {
    eCard.appendChild(studioReadRow('Episodes', 'None recorded yet'));
  } else {
    for (const e of view.episodes.slice(0, 12)) {
      const parts = [
        `Day ${e.day}`,
        e.emotionalTag ? e.emotionalTag : '',
        e.participants.length > 0 ? `with ${e.participants.join(', ')}` : '',
        `decay ${e.decay.toFixed(2)}`,
      ].filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = 'rl-memory-fact';
      row.innerHTML = `<div class="tiny rl-memory-fact-text">${e.text}</div><div class="dim tiny">${parts}</div>`;
      eCard.appendChild(row);
    }
    if (view.episodes.length > 12) eCard.appendChild(studioReadRow('…and more', `${view.episodes.length - 12} older episodes in the record`));
  }
  content.appendChild(eCard);

  // Summary + recent exchanges.
  const sCard = buildProfileCard('Summary');
  sCard.appendChild(studioReadRow('Summary', view.summary || '—'));
  sCard.appendChild(studioReadRow('Summary revision', view.summaryRevision));
  content.appendChild(sCard);

  const rCard = buildProfileCard(`Recent exchanges (${view.recent.length})`);
  if (view.recent.length === 0) {
    rCard.appendChild(studioReadRow('Recent', 'No recent exchanges'));
  } else {
    for (const e of view.recent.slice(-12).reverse()) {
      rCard.appendChild(studioReadRow(e.speaker || '—', `${e.text} <span class="dim">(Day ${e.day}, ${formatTime(e.tick)})</span>`));
    }
  }
  content.appendChild(rCard);
}

// Gallery — the char_${genSeed}_* portrait key's reader. Each tile asks the
// image cache through getCharacterImage (generating on first view, cached
// forever after), exactly like room scenes. The tile DOM is created
// synchronously with a placeholder; the image fills in when the async fetch
// lands (the render.js thumbnail pattern).
function renderStudioGalleryTab(content, gs, studio, npc) {
  const intro = document.createElement('div');
  intro.className = 'rl-studio-section';
  intro.innerHTML = '<div class="rl-studio-section-title">Portraits</div><div class="dim tiny">Linked to this character via their generation seed. First view generates; after that they load from the shared image cache.</div>';
  content.appendChild(intro);

  const shots = [
    { expression: 'neutral', pose: 'standing', label: 'Everyday' },
    { expression: 'happy', pose: 'standing', label: 'Smiling' },
    { expression: 'sad', pose: 'standing', label: 'Low day' },
  ];
  const grid = document.createElement('div');
  grid.className = 'rl-studio-gallery';
  for (const shot of shots) {
    const tile = document.createElement('div');
    tile.className = 'rl-studio-gallery-tile';
    tile.innerHTML = `
      <div class="rl-studio-gallery-canvas">
        <div class="rl-studio-gallery-letter">${(npc.bible?.name || '?').charAt(0)}</div>
        <div class="rl-studio-gallery-loader">…</div>
      </div>
      <div class="dim tiny">${shot.label}</div>`;
    grid.appendChild(tile);
    const canvasEl = tile.querySelector('.rl-studio-gallery-canvas');
    const img = document.createElement('img');
    img.alt = shot.label;
    img.className = 'rl-studio-gallery-img';
    canvasEl.appendChild(img);
    // D17.5: register the portrait tile with the shared info mechanic —
    // info-only (reroll deliberately omitted): the tile is "linked to this
    // character via their generation seed", so a random-seed reroll would
    // break identity across shots.
    setImageMeta(img, {
      label: `${npc.bible?.name || 'Character'} — ${shot.label}`,
      prompt: applyImageStyle(buildCharacterPrompt(npc, shot.expression, shot.pose)),
      seed: npc.bible?.genSeed ?? null,
      negativePrompt: IMAGE_NEGATIVE.char,
      reroll: null,
    });
    getCharacterImage(npc, shot.expression, shot.pose).then((res) => {
      if (!res || !res.url) {
        tile.querySelector('.rl-studio-gallery-loader').textContent = 'Failed to generate';
        return;
      }
      img.src = res.url;
      img.classList.add('loaded');
      tile.querySelector('.rl-studio-gallery-loader')?.remove();
    }).catch(() => {
      tile.querySelector('.rl-studio-gallery-loader').textContent = 'Failed to generate';
    });
  }
  content.appendChild(grid);
}

// More Details — everything mechanical the fiction never shows. Read-only by
// design (D12): schema types, derived values, ids, cooldowns, counters. This
// is where the audit's mechanical fields finally have a visible home.
function renderStudioMoreDetailsTab(content, gs, studio, npc) {
  const mem = npc.memory || {};
  const rel = npc.relPlayer || {};
  const residency = npc.residency || {};

  const sections = [
    ['Identity', [
      ['NPC id', studio.viewingNpcId || '—'],
      ['genSeed', npc.bible?.genSeed ?? '—'],
      ['bibleRevision', npc.bibleRevision ?? 0],
      ['bibleChanges', Array.isArray(npc.bibleChanges) ? `${npc.bibleChanges.length} recorded` : '0 recorded'],
    ]],
    ['Residency', [
      ['status', residency.status || '—'],
      ['room', residency.room || '—'],
      ['bed', residency.bed || '—'],
      ['partnerOf', residency.partnerOf || '—'],
      ['since', residency.since ?? '—'],
      ['contributesRent', residency.contributesRent === true ? 'yes' : 'no'],
      ['rentShare', residency.rentShare ?? incomeRentShare(npc)],
    ]],
    ['Whereabouts', [
      ['location', npc.location || '—'],
      ['activity', npc.activity || '—'],
      ['clothing', npc.clothing || '—'],
    ]],
    ['Mood', [
      ['mood', npc.mood ?? '—'],
      ['moodReason', npc.moodReason || '—'],
    ]],
    ['Schedule', [
      ['currentBlock', npc.schedule?.currentBlock || '—'],
      ['nextBlock', npc.schedule?.nextBlock || '—'],
      ['willReturnAt', npc.schedule?.willReturnAt ?? '—'],
    ]],
    ['Needs', [
      ['hunger', npc.needs?.hunger ?? '—'],
      ['hygiene', npc.needs?.hygiene ?? '—'],
      ['energy', npc.needs?.energy ?? '—'],
      ['social', npc.needs?.social ?? '—'],
      ['comfort', npc.needs?.comfort ?? '—'],
      ['stimulation', npc.needs?.stimulation ?? '—'],
    ]],
    ['Relationship (raw)', [
      ['firstMetDay', rel.firstMetDay ?? '—'],
      ['lastInteractionDay', rel.lastInteractionDay ?? '—'],
      ['grievances', Array.isArray(rel.grievances) ? `${rel.grievances.length} entries` : '0'],
    ]],
    ['Memory (raw)', [
      ['facts', Array.isArray(mem.facts) ? mem.facts.length : 0],
      ['episodes', Array.isArray(mem.episodes) ? mem.episodes.length : 0],
      ['recent', Array.isArray(mem.recent) ? mem.recent.length : 0],
      ['openQuestions', Array.isArray(mem.openQuestions) ? mem.openQuestions.length : 0],
      ['nextFactId', mem.nextFactId ?? 1],
      ['summaryRevision', mem.summaryRevision ?? 0],
    ]],
    ['Social', [
      ['contactKnown', npc.contactKnown === true ? 'yes' : 'no'],
      ['socialCircle', Array.isArray(npc.socialCircle) ? npc.socialCircle.join(', ') : '—'],
      ['suspicion', Object.keys(npc.suspicion || {}).length > 0 ? JSON.stringify(npc.suspicion) : '—'],
      ['flags', Object.keys(npc.flags || {}).length > 0 ? JSON.stringify(npc.flags) : '—'],
      ['inventory', Array.isArray(npc.inventory) ? `${npc.inventory.length} stacks` : '—'],
    ]],
  ];

  for (const [label, rows] of sections) {
    const card = buildProfileCard(label);
    for (const [k, v] of rows) card.appendChild(studioReadRow(k, v));
    content.appendChild(card);
  }
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

  // Back button — for an external offered a room via the Phase 8 offers
  // flow, going back lands on the Offers screen (the 'detail' profile
  // screen is applicant-shaped — its Reject button would try to delete a
  // non-applicant). Classifieds applicants still go back to their profile.
  const fromOffers = npc.residency?.status !== 'prospective';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary tiny';
  backBtn.setAttribute('data-action', 'computer.open-screen');
  backBtn.setAttribute('data-app', app.id);
  backBtn.setAttribute('data-screen', fromOffers ? 'offers' : 'detail');
  backBtn.textContent = fromOffers ? 'Back to Offers' : 'Back to Profile';
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
    } else if (npc.residency?.status === 'resident') {
      // Meal commitments (overhaul Phase 7, D7): roommates are the people
      // you invite to a shared dinner — the same in-person ask, over text.
      const inviteDinner = document.createElement('button');
      inviteDinner.className = 'btn tiny im-invite-btn';
      inviteDinner.setAttribute('data-action', 'im.invite-dinner');
      inviteDinner.setAttribute('data-row-id', im.viewingNpcId);
      inviteDinner.textContent = 'Invite to Dinner';
      header.appendChild(inviteDinner);
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
    // while a previous send is still in flight. The device is resolved
    // from the pane this renderer filled so a phone-sent message is
    // scoped to the phone's input (2026-08-17 audit U2) — this handler
    // bypasses the data-action dispatcher, which would have set it.
    const device = body.closest('[data-device]')?.getAttribute('data-device') || 'computer';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAction('im.send', null, { rowId: im.viewingNpcId, device });
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
  const taxPeriod = getTaxPeriod(day);
  const taxPeriodDay = getTaxPeriodDay(day);
  const daysLeft = CALENDAR.daysPerTaxPeriod - taxPeriodDay;
  const { taxableGross, deductions, owed } = computeTaxOwed(gs);
  const reserve = taxes.reserve || 0;
  const unpaid = taxes.unpaid || 0;

  const panel = document.createElement('div');
  panel.className = 'tax-panel';

  // Header: period name (the season the current tax period ends in) + days remaining
  const header = document.createElement('div');
  header.className = 'tax-header';
  const endDay = Math.ceil(day / CALENDAR.daysPerTaxPeriod) * CALENDAR.daysPerTaxPeriod;
  const periodName = CALENDAR.seasonNames[getSeason(endDay)];
  header.innerHTML = '<span class="tax-title">Estimated Taxes</span>' +
    '<span class="tax-quarter">' + periodName + ' period \u00b7 ' + daysLeft + 'd left</span>';
  panel.appendChild(header);

  // Progress bar: how far through the tax period
  const progress = document.createElement('div');
  progress.className = 'tax-progress-bar';
  const pct = Math.round((taxPeriodDay / CALENDAR.daysPerTaxPeriod) * 100);
  progress.innerHTML = '<div class="tax-progress-fill" style="width:' + pct + '%"></div>';
  panel.appendChild(progress);

  // Numbers grid: gross, deductions, estimated owed, reserve, back taxes
  const grid = document.createElement('div');
  grid.className = 'tax-numbers';
  const rows = [
    { label: 'Period gross', value: '$' + (taxes.quarterGross || 0), cls: 'tax-gross' },
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
// straight from live state (decision A of src/ref/BrineOS-The-Phone-plan.md):
// --- Brine Bank Overview (BrineOS Phase 1) ---
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

  renderStructuralSection(body, gs);
}

// --- Structural work (floorplan plan Phase 6) ---
// Kept as its own section rather than mixed in with the facilities above,
// because it is a different KIND of purchase and the player should feel
// that: a facility upgrade makes a room better, a structural job changes
// what the apartment IS. Two of the five make it smaller and quieter rather
// than bigger and nicer, which no other screen in the game offers.
function renderStructuralSection(body, gs) {
  const defs = Object.values(STRUCTURAL_UPGRADES || {});
  if (defs.length === 0) return;

  const section = document.createElement('div');
  section.className = 'upg-room-section upg-structural';
  const heading = document.createElement('div');
  heading.className = 'upg-room-heading';
  heading.textContent = 'Structural Work';
  section.appendChild(heading);

  const blurb = document.createElement('div');
  blurb.className = 'dim tiny upg-structural-note';
  blurb.textContent = 'Walls, doors and what a room is for. These change the layout itself — some of them by closing it down.';
  section.appendChild(blurb);

  for (const def of defs) {
    const state = structuralUpgradeState(gs, def.id);
    const card = document.createElement('div');
    card.className = 'upg-facility-card' + (state.built ? ' maxed' : '') + (state.job ? ' working' : '');

    let actionHtml;
    if (state.job) {
      const stage = getRenovationJobStage(state.job, gs.meta.clock.day);
      const dayN = Math.max(1, Math.min(state.job.durationDays, gs.meta.clock.day - state.job.startDay + 1));
      actionHtml = `
        <div class="upg-job">
          <span class="upg-job-stage">${escapeHtml(stage.label)}</span>
          <span class="upg-job-progress">day ${dayN} of ${state.job.durationDays}</span>
          <span class="upg-job-eta dim tiny">ETA ${formatDate(state.job.etaDay)}</span>
        </div>`;
    } else if (state.built) {
      actionHtml = '<span class="upg-maxed-badge">Done</span>';
    } else {
      const affordable = gs.player.money >= def.cost;
      const etaDay = gs.meta.clock.day + (def.durationDays || 1);
      actionHtml = `
        <button class="btn tiny upg-book-btn ${affordable ? '' : 'disabled'}" data-action="upgrades.book-structural" data-row-id="${def.id}">Book — $${def.cost.toLocaleString()}</button>
        <span class="upg-book-preview dim tiny">${def.durationDays || 1}d job · done Day ${etaDay}</span>`;
    }

    // What it actually does to the graph, in the player's terms. Derived from
    // the same `edits` list the applier runs, so the description can never
    // promise something the upgrade does not do.
    const effects = (def.edits || []).map(e => {
      if (e.threshold) {
        const [a, b] = e.threshold.split('|');
        return `Fits a ${e.to} between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.addEdge) {
        const [a, b] = e.addEdge.split('|');
        return e.as === 'glass'
          ? `Glazes through from ${ROOMS[a]?.name || a} to ${ROOMS[b]?.name || b} — you see it, you still walk round`
          : `Opens a way between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.removeEdge) {
        const [a, b] = e.removeEdge.split('|');
        return `Walls up the way between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.roomType) return `Turns ${ROOMS[e.roomType]?.name || e.roomType} into a ${e.to}`;
      return '';
    }).filter(Boolean);

    card.innerHTML = `
      <div class="upg-facility-main">
        <div class="upg-facility-name">${escapeHtml(def.label)}</div>
        <div class="upg-facility-desc dim tiny">${escapeHtml(def.desc)}</div>
        <div class="upg-structural-effects tiny">${effects.map(t => `<span class="upg-effect">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="upg-facility-action">${actionHtml}</div>
    `;
    section.appendChild(card);
  }
  body.appendChild(section);
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

    const seasonReturnPct = (fund.expectedReturn * CALENDAR.daysPerSeason / INVESTING.daysPerFinancialYear * 100).toFixed(1);
    const annualReturnPct = (fund.expectedReturn * 100).toFixed(1);
    const volPct = (fund.volatility * 100).toFixed(1);
    const plClass2 = fundPL >= 0 ? 'positive' : 'negative';

    card.innerHTML = `
      <div class="invest-fund-header">
        <span class="invest-fund-name">${fund.label}</span>
        <span class="invest-fund-return">${seasonReturnPct}%/season · ±${volPct}%/day</span>
      </div>
      <div class="invest-fund-desc dim tiny">${fund.desc} · ${annualReturnPct}%/yr</div>
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

// --- Codex (Intimacy & Voyeurism Phase 15, D8) -----------------------------
// The per-character knowledge ledger: a roster of every NPC the player holds
// entries for, then per-NPC detail pages with day-stamped entries and the
// three spendable verbs (Confront / Spread / Matchmake). Pure state→DOM like
// everything in this file — the verbs' domain logic lives in codex.js and the
// click handlers in UI.js (codex.open-npc / codex.confront / codex.spread /
// codex.matchmake). Rendered on both devices through the shared-app path
// (render.phone.js's COMPUTER_RENDERERS dispatch).

// The current screen's params for the codex app on whichever device is
// showing it (phone navStack or computer window) — the detail screen's npcId.
function codexScreenParams(gs) {
  const phone = gs?.world?.phone;
  if (phone?.openAppId === 'codex' && Array.isArray(phone.navStack)) {
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === 'codex' && top.screenId === 'detail') return top.params || {};
  }
  const win = gs?.world?.computer?.windows?.codex;
  if (win && win.screenId === 'detail') return win.params || {};
  return {};
}

function codexEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'codex-empty';
  div.textContent = text;
  return div;
}

function renderCodexRoster(body, gs, app, screenDef) {
  body.innerHTML = '';
  const ids = codexKnownNpcIds(gs);
  const known = ids.filter(id => gs.npcs[id]);
  if (known.length === 0) {
    body.appendChild(codexEmptyState('Your codex is empty — it fills as you witness and take part in things.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'codex-roster';
  for (const id of known) {
    const npc = gs.npcs[id];
    const entries = codexEntries(gs, id);
    const unspent = entries.filter(e => !e.spent).length;
    const btn = document.createElement('button');
    btn.className = 'codex-roster-row';
    btn.setAttribute('data-action', 'codex.open-npc');
    btn.setAttribute('data-npc', id);
    const name = document.createElement('span');
    name.className = 'codex-roster-name';
    name.textContent = npc.bible?.name || id;
    const meta = document.createElement('span');
    meta.className = 'codex-roster-meta';
    meta.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    if (unspent > 0) meta.textContent += ` · ${unspent} ready to use`;
    const chevron = document.createElement('span');
    chevron.className = 'codex-roster-chevron';
    chevron.textContent = '›';
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.appendChild(chevron);
    list.appendChild(btn);
  }
  body.appendChild(list);
}

function renderCodexDetail(body, gs, app, screenDef) {
  body.innerHTML = '';
  const params = codexScreenParams(gs);
  const npcId = params.npcId;
  const npc = npcId && gs.npcs[npcId];
  if (!npc) {
    body.appendChild(codexEmptyState('Nobody selected.'));
    return;
  }

  const entries = codexEntries(gs, npcId);
  const nextIndex = codexNextUnspentIndex(gs, npcId);
  const nextEntry = nextIndex != null ? (gs.player?.ledger?.[npcId] || [])[nextIndex] : null;
  const rel = npc.relPlayer || {};
  const relationship = relationshipSummaryForNpc(gs, npcId);
  const phase = rel.conversationPhase || 'early';

  // Header
  const header = document.createElement('div');
  header.className = 'codex-head';
  const name = document.createElement('div');
  name.className = 'codex-head-name';
  name.textContent = npc.bible?.name || npcId;
  const statusBits = [phase];
  if (relationship) statusBits.push(`${relationship.status} with ${relationship.partnerName}`);
  const status = document.createElement('div');
  status.className = 'codex-head-status dim tiny';
  status.textContent = statusBits.join(' · ');
  header.appendChild(name);
  header.appendChild(status);
  body.appendChild(header);

  // Verbs — each enabled when the page has an entry that verb can consume.
  const verbs = document.createElement('div');
  verbs.className = 'codex-verbs';

  const confrontBtn = document.createElement('button');
  confrontBtn.className = 'btn tiny codex-verb-btn';
  confrontBtn.setAttribute('data-action', 'codex.confront');
  confrontBtn.setAttribute('data-npc', npcId);
  confrontBtn.setAttribute('data-index', nextIndex ?? '');
  confrontBtn.textContent = 'Confront';
  if (nextIndex == null) {
    confrontBtn.disabled = true;
    confrontBtn.title = 'Nothing unsaid yet.';
  } else {
    confrontBtn.title = nextEntry.otherNpcId
      ? `I saw you with ${gs.npcs[nextEntry.otherNpcId]?.bible?.name || 'someone'}.`
      : 'I saw what you were up to.';
  }
  verbs.appendChild(confrontBtn);

  const spreadBtn = document.createElement('button');
  spreadBtn.className = 'btn btn-secondary tiny codex-verb-btn';
  spreadBtn.setAttribute('data-action', 'codex.spread');
  spreadBtn.setAttribute('data-npc', npcId);
  spreadBtn.setAttribute('data-index', nextIndex ?? '');
  spreadBtn.textContent = 'Spread Secret';
  if (nextIndex == null || !spreadEligible(nextEntry)) {
    spreadBtn.disabled = true;
    spreadBtn.title = nextIndex == null
      ? 'Nothing unsaid yet.'
      : 'This one is just between you two — there is no third party to tell.';
  } else {
    spreadBtn.title = 'Tell someone what you know.';
  }
  verbs.appendChild(spreadBtn);

  const matchCandidates = matchmakeCandidates(gs, npcId);
  const matchBtn = document.createElement('button');
  matchBtn.className = 'btn btn-secondary tiny codex-verb-btn';
  matchBtn.setAttribute('data-action', 'codex.matchmake');
  matchBtn.setAttribute('data-npc', npcId);
  matchBtn.setAttribute('data-index', nextIndex ?? '');
  matchBtn.textContent = 'Matchmake';
  if (matchCandidates.length === 0) {
    matchBtn.disabled = true;
    matchBtn.title = 'Needs knowledge of both people and a spark already forming between them.';
  } else {
    matchBtn.title = `You could introduce ${npc.bible?.name || 'them'} to someone.`;
  }
  verbs.appendChild(matchBtn);
  body.appendChild(verbs);

  // Entries — day-stamped, provenance-badged, newest first.
  if (entries.length === 0) {
    body.appendChild(codexEmptyState('Nothing recorded about them yet.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'codex-entries';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'codex-entry' + (entry.spent ? ' codex-entry-spent' : '');
    const left = document.createElement('div');
    left.className = 'codex-entry-main';
    const act = document.createElement('div');
    act.className = 'codex-entry-act';
    const other = entry.otherNpcId && gs.npcs[entry.otherNpcId]
      ? ` with ${gs.npcs[entry.otherNpcId].bible?.name || 'someone'}`
      : '';
    act.textContent = `${codexKindLabel(entry.kind)} ${codexActLabel(entry.act)}${other}`;
    const detail = document.createElement('div');
    detail.className = 'codex-entry-detail dim tiny';
    const roomName = entry.roomId ? roomPhrase(entry.roomId) : 'somewhere';
    detail.textContent = `Day ${entry.day} · ${roomName}${entry.outcome ? ` · ended ${entry.outcome}` : ''}`;
    left.appendChild(act);
    left.appendChild(detail);
    row.appendChild(left);
    const badge = document.createElement('span');
    badge.className = 'codex-entry-badge tiny';
    badge.textContent = entry.spent ? 'spent' : 'fresh';
    if (!entry.spent) badge.setAttribute('data-fresh', '');
    row.appendChild(badge);
    list.appendChild(row);
  }
  body.appendChild(list);
}

// ===== Dream Diary (Dream Engine Phase 8, D42) ==============================
// The diary app surfaces `world.dreams.diary` (filed newest-first by
// fileDreamToDiary, capped at DREAM_TUNING.diaryCap). The gallery lists every
// dream as a first-panel thumbnail row; the detail page repaints ALL panels
// from the record's frozen prompt+seed via getDreamPanelImage (D14) and
// reprints the register's wake line (D42). A diary entry is a memory of one
// specific picture, so the record's own seed is used — never a hash of the
// device-specific cache key, whose orientation/style parts may differ between
// the screen where the dream was shown and the screen where it is re-read.
//
// Declared here AND in the MOBILE section below, identical, matching the
// codex precedent: the shared-app path serves both surfaces from one
// body-less renderer, and the duplicate declaration is how every shared
// renderer in this file is written (the later copy wins via hoisting).
function dreamEntryParams(gs) {
  const phone = gs?.world?.phone;
  if (phone?.openAppId === 'dreams' && Array.isArray(phone.navStack)) {
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === 'dreams' && top.screenId === 'entry') return top.params || {};
  }
  const win = gs?.world?.computer?.windows?.dreams;
  if (win && win.screenId === 'entry') return win.params || {};
  return {};
}

function dreamEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'dream-empty';
  div.textContent = text;
  return div;
}

function dreamLabel(table, id, fallback) {
  const entry = table && id != null ? table[id] : null;
  return (entry && entry.label) || fallback || id;
}

// Placeholder-then-async-swap with a data-* stale-guard — the renderScene
// idiom applied to a dream panel. Stamp the key that describes the desired
// picture (device-specific: orientation + image style), show the placeholder,
// then swap only if this element is still mounted AND still asking for that
// exact key (the same <img> may have been repurposed for another panel, or
// the phone rotated while the image was generating).
function loadDreamPanelIntoImg(img, dream, panelIndex) {
  const key = typeof dreamPanelCacheKey === 'function'
    ? dreamPanelCacheKey(dream, panelIndex)
    : String(dream && dream.id) + ':' + panelIndex;
  img.setAttribute('data-dream-key', key);
  img.classList.remove('dream-img-loaded');
  if (typeof getPlaceholder === 'function') img.src = getPlaceholder();
  else img.removeAttribute('src');
  if (typeof getDreamPanelImage !== 'function' || !dream) return;
  getDreamPanelImage(dream, panelIndex).then((resolved) => {
    if (!img.isConnected) return;
    if (img.getAttribute('data-dream-key') !== key) return;
    if (resolved && resolved.url) {
      img.src = resolved.url;
      if (resolved.prompt && typeof setImageMeta === 'function') {
        const panel = dream.panels && dream.panels[panelIndex];
        setImageMeta(img, {
          label: 'Dream panel',
          prompt: resolved.prompt,
          seed: panel && panel.seed != null ? panel.seed : null,
          negativePrompt: (typeof IMAGE_NEGATIVE !== 'undefined' && IMAGE_NEGATIVE.dream) || null,
        });
      }
    }
    img.classList.add('dream-img-loaded');
  }).catch(() => {
    img.classList.add('dream-img-loaded');
  });
}

function renderDreamDiary(body, gs, app, screenDef) {
  body.innerHTML = '';
  const diary = gs?.world?.dreams?.diary;
  if (!Array.isArray(diary) || diary.length === 0) {
    body.appendChild(dreamEmptyState('Your dream diary is empty — it fills as you sleep and dream.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'dream-diary';
  for (const dream of diary) {
    if (!dream || !dream.id) continue;
    const row = document.createElement('button');
    row.className = 'dream-row';
    row.setAttribute('data-action', 'dreams.open-entry');
    row.setAttribute('data-row-id', dream.id);
    const thumb = document.createElement('img');
    thumb.className = 'dream-thumb';
    thumb.alt = 'First dream panel';
    thumb.setAttribute('loading', 'lazy');
    const main = document.createElement('div');
    main.className = 'dream-row-main';
    const title = document.createElement('div');
    title.className = 'dream-row-title';
    title.textContent = dreamLabel(DREAM_FORMS, dream.slots && dream.slots.form, 'A dream');
    const meta = document.createElement('div');
    meta.className = 'dream-row-meta dim tiny';
    const shownDay = Number(dream.shownDay) || Number(dream.compiledDay) || 1;
    const register = dreamLabel(DREAM_REGISTERS, dream.slots && dream.slots.register, '');
    // D16/D36: nap-ness is `forSleep`. `kind` is the D8 CLASS
    // (distorted / true / recurring) and is never 'nap', so testing it here
    // meant a nap dream was never once labelled as one.
    const isNap = dream.forSleep === 'nap';
    const panelCount = Array.isArray(dream.panels) ? dream.panels.length : 0;
    meta.textContent = `Day ${shownDay}${register ? ' · ' + register : ''}${isNap ? ' · nap' : ''}${panelCount > 1 ? ` · ${panelCount} panels` : ''}`;
    main.appendChild(title);
    main.appendChild(meta);
    const chevron = document.createElement('span');
    chevron.className = 'dream-row-chevron';
    chevron.textContent = '›';
    row.appendChild(thumb);
    row.appendChild(main);
    row.appendChild(chevron);
    list.appendChild(row);
    loadDreamPanelIntoImg(thumb, dream, 0);
  }
  body.appendChild(list);
}

function renderDreamEntry(body, gs, app, screenDef) {
  body.innerHTML = '';
  const params = dreamEntryParams(gs);
  const dreamId = params.dreamId;
  const diary = gs?.world?.dreams?.diary;
  const dream = dreamId && Array.isArray(diary) ? diary.find((d) => d && d.id === dreamId) : null;
  if (!dream) {
    body.appendChild(dreamEmptyState('That dream has been forgotten.'));
    return;
  }
  const form = dream.slots && DREAM_FORMS[dream.slots.form];
  const register = dream.slots && DREAM_REGISTERS[dream.slots.register];
  const head = document.createElement('div');
  head.className = 'dream-entry-head';
  const title = document.createElement('div');
  title.className = 'dream-entry-title';
  title.textContent = (form && form.label) || 'A dream';
  const meta = document.createElement('div');
  meta.className = 'dream-entry-meta dim tiny';
  const shownDay = Number(dream.shownDay) || Number(dream.compiledDay) || 1;
  meta.textContent = `Day ${shownDay}${register && register.label ? ' · ' + register.label : ''}${dream.forSleep === 'nap' ? ' · nap' : ''}`;
  head.appendChild(title);
  head.appendChild(meta);
  body.appendChild(head);

  const frames = document.createElement('div');
  frames.className = 'dream-panels';
  if (Array.isArray(dream.panels)) {
    dream.panels.forEach((panel, i) => {
      const fig = document.createElement('figure');
      fig.className = 'dream-panel';
      const img = document.createElement('img');
      img.className = 'dream-img';
      img.alt = 'Dream panel ' + (i + 1);
      img.setAttribute('loading', 'lazy');
      loadDreamPanelIntoImg(img, dream, i);
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.className = 'dream-panel-text';
      cap.textContent = panel && panel.text ? panel.text : '';
      fig.appendChild(cap);
      frames.appendChild(fig);
    });
  }
  body.appendChild(frames);

  if (typeof dreamWakeLine === 'function') {
    const wake = dreamWakeLine(dream);
    if (wake) {
      const wakeEl = document.createElement('div');
      wakeEl.className = 'dream-wake dim tiny';
      wakeEl.textContent = wake;
      body.appendChild(wakeEl);
    }
  }
}

// ===== /SECTION: RENDER.COMPUTER =====
// ===== SECTION: RENDER.COMPUTER (MOBILE) =====
// The whole money picture at a glance. Four real numbers, all drawn
// straight from live state (decision A of src/ref/BrineOS-The-Phone-plan.md):
// --- Brine Bank Overview (BrineOS Phase 1) ---
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

  renderStructuralSection(body, gs);
}

// --- Structural work (floorplan plan Phase 6) ---
// Kept as its own section rather than mixed in with the facilities above,
// because it is a different KIND of purchase and the player should feel
// that: a facility upgrade makes a room better, a structural job changes
// what the apartment IS. Two of the five make it smaller and quieter rather
// than bigger and nicer, which no other screen in the game offers.
function renderStructuralSection(body, gs) {
  const defs = Object.values(STRUCTURAL_UPGRADES || {});
  if (defs.length === 0) return;

  const section = document.createElement('div');
  section.className = 'upg-room-section upg-structural';
  const heading = document.createElement('div');
  heading.className = 'upg-room-heading';
  heading.textContent = 'Structural Work';
  section.appendChild(heading);

  const blurb = document.createElement('div');
  blurb.className = 'dim tiny upg-structural-note';
  blurb.textContent = 'Walls, doors and what a room is for. These change the layout itself — some of them by closing it down.';
  section.appendChild(blurb);

  for (const def of defs) {
    const state = structuralUpgradeState(gs, def.id);
    const card = document.createElement('div');
    card.className = 'upg-facility-card' + (state.built ? ' maxed' : '') + (state.job ? ' working' : '');

    let actionHtml;
    if (state.job) {
      const stage = getRenovationJobStage(state.job, gs.meta.clock.day);
      const dayN = Math.max(1, Math.min(state.job.durationDays, gs.meta.clock.day - state.job.startDay + 1));
      actionHtml = `
        <div class="upg-job">
          <span class="upg-job-stage">${escapeHtml(stage.label)}</span>
          <span class="upg-job-progress">day ${dayN} of ${state.job.durationDays}</span>
          <span class="upg-job-eta dim tiny">ETA ${formatDate(state.job.etaDay)}</span>
        </div>`;
    } else if (state.built) {
      actionHtml = '<span class="upg-maxed-badge">Done</span>';
    } else {
      const affordable = gs.player.money >= def.cost;
      const etaDay = gs.meta.clock.day + (def.durationDays || 1);
      actionHtml = `
        <button class="btn tiny upg-book-btn ${affordable ? '' : 'disabled'}" data-action="upgrades.book-structural" data-row-id="${def.id}">Book — $${def.cost.toLocaleString()}</button>
        <span class="upg-book-preview dim tiny">${def.durationDays || 1}d job · done Day ${etaDay}</span>`;
    }

    // What it actually does to the graph, in the player's terms. Derived from
    // the same `edits` list the applier runs, so the description can never
    // promise something the upgrade does not do.
    const effects = (def.edits || []).map(e => {
      if (e.threshold) {
        const [a, b] = e.threshold.split('|');
        return `Fits a ${e.to} between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.addEdge) {
        const [a, b] = e.addEdge.split('|');
        return e.as === 'glass'
          ? `Glazes through from ${ROOMS[a]?.name || a} to ${ROOMS[b]?.name || b} — you see it, you still walk round`
          : `Opens a way between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.removeEdge) {
        const [a, b] = e.removeEdge.split('|');
        return `Walls up the way between ${ROOMS[a]?.name || a} and ${ROOMS[b]?.name || b}`;
      }
      if (e.roomType) return `Turns ${ROOMS[e.roomType]?.name || e.roomType} into a ${e.to}`;
      return '';
    }).filter(Boolean);

    card.innerHTML = `
      <div class="upg-facility-main">
        <div class="upg-facility-name">${escapeHtml(def.label)}</div>
        <div class="upg-facility-desc dim tiny">${escapeHtml(def.desc)}</div>
        <div class="upg-structural-effects tiny">${effects.map(t => `<span class="upg-effect">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="upg-facility-action">${actionHtml}</div>
    `;
    section.appendChild(card);
  }
  body.appendChild(section);
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

    const seasonReturnPct = (fund.expectedReturn * CALENDAR.daysPerSeason / INVESTING.daysPerFinancialYear * 100).toFixed(1);
    const annualReturnPct = (fund.expectedReturn * 100).toFixed(1);
    const volPct = (fund.volatility * 100).toFixed(1);
    const plClass2 = fundPL >= 0 ? 'positive' : 'negative';

    card.innerHTML = `
      <div class="invest-fund-header">
        <span class="invest-fund-name">${fund.label}</span>
        <span class="invest-fund-return">${seasonReturnPct}%/season · ±${volPct}%/day</span>
      </div>
      <div class="invest-fund-desc dim tiny">${fund.desc} · ${annualReturnPct}%/yr</div>
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

// --- Codex (Intimacy & Voyeurism Phase 15, D8) -----------------------------
// The per-character knowledge ledger: a roster of every NPC the player holds
// entries for, then per-NPC detail pages with day-stamped entries and the
// three spendable verbs (Confront / Spread / Matchmake). Pure state→DOM like
// everything in this file — the verbs' domain logic lives in codex.js and the
// click handlers in UI.js (codex.open-npc / codex.confront / codex.spread /
// codex.matchmake). Rendered on both devices through the shared-app path
// (render.phone.js's COMPUTER_RENDERERS dispatch).

// The current screen's params for the codex app on whichever device is
// showing it (phone navStack or computer window) — the detail screen's npcId.
function codexScreenParams(gs) {
  const phone = gs?.world?.phone;
  if (phone?.openAppId === 'codex' && Array.isArray(phone.navStack)) {
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === 'codex' && top.screenId === 'detail') return top.params || {};
  }
  const win = gs?.world?.computer?.windows?.codex;
  if (win && win.screenId === 'detail') return win.params || {};
  return {};
}

function codexEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'codex-empty';
  div.textContent = text;
  return div;
}

function renderCodexRoster(body, gs, app, screenDef) {
  body.innerHTML = '';
  const ids = codexKnownNpcIds(gs);
  const known = ids.filter(id => gs.npcs[id]);
  if (known.length === 0) {
    body.appendChild(codexEmptyState('Your codex is empty — it fills as you witness and take part in things.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'codex-roster';
  for (const id of known) {
    const npc = gs.npcs[id];
    const entries = codexEntries(gs, id);
    const unspent = entries.filter(e => !e.spent).length;
    const btn = document.createElement('button');
    btn.className = 'codex-roster-row';
    btn.setAttribute('data-action', 'codex.open-npc');
    btn.setAttribute('data-npc', id);
    const name = document.createElement('span');
    name.className = 'codex-roster-name';
    name.textContent = npc.bible?.name || id;
    const meta = document.createElement('span');
    meta.className = 'codex-roster-meta';
    meta.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    if (unspent > 0) meta.textContent += ` · ${unspent} ready to use`;
    const chevron = document.createElement('span');
    chevron.className = 'codex-roster-chevron';
    chevron.textContent = '›';
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.appendChild(chevron);
    list.appendChild(btn);
  }
  body.appendChild(list);
}

function renderCodexDetail(body, gs, app, screenDef) {
  body.innerHTML = '';
  const params = codexScreenParams(gs);
  const npcId = params.npcId;
  const npc = npcId && gs.npcs[npcId];
  if (!npc) {
    body.appendChild(codexEmptyState('Nobody selected.'));
    return;
  }

  const entries = codexEntries(gs, npcId);
  const nextIndex = codexNextUnspentIndex(gs, npcId);
  const nextEntry = nextIndex != null ? (gs.player?.ledger?.[npcId] || [])[nextIndex] : null;
  const rel = npc.relPlayer || {};
  const relationship = relationshipSummaryForNpc(gs, npcId);
  const phase = rel.conversationPhase || 'early';

  // Header
  const header = document.createElement('div');
  header.className = 'codex-head';
  const name = document.createElement('div');
  name.className = 'codex-head-name';
  name.textContent = npc.bible?.name || npcId;
  const statusBits = [phase];
  if (relationship) statusBits.push(`${relationship.status} with ${relationship.partnerName}`);
  const status = document.createElement('div');
  status.className = 'codex-head-status dim tiny';
  status.textContent = statusBits.join(' · ');
  header.appendChild(name);
  header.appendChild(status);
  body.appendChild(header);

  // Verbs — each enabled when the page has an entry that verb can consume.
  const verbs = document.createElement('div');
  verbs.className = 'codex-verbs';

  const confrontBtn = document.createElement('button');
  confrontBtn.className = 'btn tiny codex-verb-btn';
  confrontBtn.setAttribute('data-action', 'codex.confront');
  confrontBtn.setAttribute('data-npc', npcId);
  confrontBtn.setAttribute('data-index', nextIndex ?? '');
  confrontBtn.textContent = 'Confront';
  if (nextIndex == null) {
    confrontBtn.disabled = true;
    confrontBtn.title = 'Nothing unsaid yet.';
  } else {
    confrontBtn.title = nextEntry.otherNpcId
      ? `I saw you with ${gs.npcs[nextEntry.otherNpcId]?.bible?.name || 'someone'}.`
      : 'I saw what you were up to.';
  }
  verbs.appendChild(confrontBtn);

  const spreadBtn = document.createElement('button');
  spreadBtn.className = 'btn btn-secondary tiny codex-verb-btn';
  spreadBtn.setAttribute('data-action', 'codex.spread');
  spreadBtn.setAttribute('data-npc', npcId);
  spreadBtn.setAttribute('data-index', nextIndex ?? '');
  spreadBtn.textContent = 'Spread Secret';
  if (nextIndex == null || !spreadEligible(nextEntry)) {
    spreadBtn.disabled = true;
    spreadBtn.title = nextIndex == null
      ? 'Nothing unsaid yet.'
      : 'This one is just between you two — there is no third party to tell.';
  } else {
    spreadBtn.title = 'Tell someone what you know.';
  }
  verbs.appendChild(spreadBtn);

  const matchCandidates = matchmakeCandidates(gs, npcId);
  const matchBtn = document.createElement('button');
  matchBtn.className = 'btn btn-secondary tiny codex-verb-btn';
  matchBtn.setAttribute('data-action', 'codex.matchmake');
  matchBtn.setAttribute('data-npc', npcId);
  matchBtn.setAttribute('data-index', nextIndex ?? '');
  matchBtn.textContent = 'Matchmake';
  if (matchCandidates.length === 0) {
    matchBtn.disabled = true;
    matchBtn.title = 'Needs knowledge of both people and a spark already forming between them.';
  } else {
    matchBtn.title = `You could introduce ${npc.bible?.name || 'them'} to someone.`;
  }
  verbs.appendChild(matchBtn);
  body.appendChild(verbs);

  // Entries — day-stamped, provenance-badged, newest first.
  if (entries.length === 0) {
    body.appendChild(codexEmptyState('Nothing recorded about them yet.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'codex-entries';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'codex-entry' + (entry.spent ? ' codex-entry-spent' : '');
    const left = document.createElement('div');
    left.className = 'codex-entry-main';
    const act = document.createElement('div');
    act.className = 'codex-entry-act';
    const other = entry.otherNpcId && gs.npcs[entry.otherNpcId]
      ? ` with ${gs.npcs[entry.otherNpcId].bible?.name || 'someone'}`
      : '';
    act.textContent = `${codexKindLabel(entry.kind)} ${codexActLabel(entry.act)}${other}`;
    const detail = document.createElement('div');
    detail.className = 'codex-entry-detail dim tiny';
    const roomName = entry.roomId ? roomPhrase(entry.roomId) : 'somewhere';
    detail.textContent = `Day ${entry.day} · ${roomName}${entry.outcome ? ` · ended ${entry.outcome}` : ''}`;
    left.appendChild(act);
    left.appendChild(detail);
    row.appendChild(left);
    const badge = document.createElement('span');
    badge.className = 'codex-entry-badge tiny';
    badge.textContent = entry.spent ? 'spent' : 'fresh';
    if (!entry.spent) badge.setAttribute('data-fresh', '');
    row.appendChild(badge);
    list.appendChild(row);
  }
  body.appendChild(list);
}

// ===== Dream Diary — MOBILE copy (Dream Engine Phase 8, D42) ================
// Identical to the desktop declaration above; the shared-app path serves the
// phone from the same renderers, and the duplicate declaration is the codex
// precedent (the later copy wins via hoisting).
function dreamEntryParams(gs) {
  const phone = gs?.world?.phone;
  if (phone?.openAppId === 'dreams' && Array.isArray(phone.navStack)) {
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === 'dreams' && top.screenId === 'entry') return top.params || {};
  }
  const win = gs?.world?.computer?.windows?.dreams;
  if (win && win.screenId === 'entry') return win.params || {};
  return {};
}

function dreamEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'dream-empty';
  div.textContent = text;
  return div;
}

function dreamLabel(table, id, fallback) {
  const entry = table && id != null ? table[id] : null;
  return (entry && entry.label) || fallback || id;
}

function loadDreamPanelIntoImg(img, dream, panelIndex) {
  const key = typeof dreamPanelCacheKey === 'function'
    ? dreamPanelCacheKey(dream, panelIndex)
    : String(dream && dream.id) + ':' + panelIndex;
  img.setAttribute('data-dream-key', key);
  img.classList.remove('dream-img-loaded');
  if (typeof getPlaceholder === 'function') img.src = getPlaceholder();
  else img.removeAttribute('src');
  if (typeof getDreamPanelImage !== 'function' || !dream) return;
  getDreamPanelImage(dream, panelIndex).then((resolved) => {
    if (!img.isConnected) return;
    if (img.getAttribute('data-dream-key') !== key) return;
    if (resolved && resolved.url) {
      img.src = resolved.url;
      if (resolved.prompt && typeof setImageMeta === 'function') {
        const panel = dream.panels && dream.panels[panelIndex];
        setImageMeta(img, {
          label: 'Dream panel',
          prompt: resolved.prompt,
          seed: panel && panel.seed != null ? panel.seed : null,
          negativePrompt: (typeof IMAGE_NEGATIVE !== 'undefined' && IMAGE_NEGATIVE.dream) || null,
        });
      }
    }
    img.classList.add('dream-img-loaded');
  }).catch(() => {
    img.classList.add('dream-img-loaded');
  });
}

function renderDreamDiary(body, gs, app, screenDef) {
  body.innerHTML = '';
  const diary = gs?.world?.dreams?.diary;
  if (!Array.isArray(diary) || diary.length === 0) {
    body.appendChild(dreamEmptyState('Your dream diary is empty — it fills as you sleep and dream.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'dream-diary';
  for (const dream of diary) {
    if (!dream || !dream.id) continue;
    const row = document.createElement('button');
    row.className = 'dream-row';
    row.setAttribute('data-action', 'dreams.open-entry');
    row.setAttribute('data-row-id', dream.id);
    const thumb = document.createElement('img');
    thumb.className = 'dream-thumb';
    thumb.alt = 'First dream panel';
    thumb.setAttribute('loading', 'lazy');
    const main = document.createElement('div');
    main.className = 'dream-row-main';
    const title = document.createElement('div');
    title.className = 'dream-row-title';
    title.textContent = dreamLabel(DREAM_FORMS, dream.slots && dream.slots.form, 'A dream');
    const meta = document.createElement('div');
    meta.className = 'dream-row-meta dim tiny';
    const shownDay = Number(dream.shownDay) || Number(dream.compiledDay) || 1;
    const register = dreamLabel(DREAM_REGISTERS, dream.slots && dream.slots.register, '');
    // D16/D36: nap-ness is `forSleep`. `kind` is the D8 CLASS
    // (distorted / true / recurring) and is never 'nap', so testing it here
    // meant a nap dream was never once labelled as one.
    const isNap = dream.forSleep === 'nap';
    const panelCount = Array.isArray(dream.panels) ? dream.panels.length : 0;
    meta.textContent = `Day ${shownDay}${register ? ' · ' + register : ''}${isNap ? ' · nap' : ''}${panelCount > 1 ? ` · ${panelCount} panels` : ''}`;
    main.appendChild(title);
    main.appendChild(meta);
    const chevron = document.createElement('span');
    chevron.className = 'dream-row-chevron';
    chevron.textContent = '›';
    row.appendChild(thumb);
    row.appendChild(main);
    row.appendChild(chevron);
    list.appendChild(row);
    loadDreamPanelIntoImg(thumb, dream, 0);
  }
  body.appendChild(list);
}

function renderDreamEntry(body, gs, app, screenDef) {
  body.innerHTML = '';
  const params = dreamEntryParams(gs);
  const dreamId = params.dreamId;
  const diary = gs?.world?.dreams?.diary;
  const dream = dreamId && Array.isArray(diary) ? diary.find((d) => d && d.id === dreamId) : null;
  if (!dream) {
    body.appendChild(dreamEmptyState('That dream has been forgotten.'));
    return;
  }
  const form = dream.slots && DREAM_FORMS[dream.slots.form];
  const register = dream.slots && DREAM_REGISTERS[dream.slots.register];
  const head = document.createElement('div');
  head.className = 'dream-entry-head';
  const title = document.createElement('div');
  title.className = 'dream-entry-title';
  title.textContent = (form && form.label) || 'A dream';
  const meta = document.createElement('div');
  meta.className = 'dream-entry-meta dim tiny';
  const shownDay = Number(dream.shownDay) || Number(dream.compiledDay) || 1;
  meta.textContent = `Day ${shownDay}${register && register.label ? ' · ' + register.label : ''}${dream.forSleep === 'nap' ? ' · nap' : ''}`;
  head.appendChild(title);
  head.appendChild(meta);
  body.appendChild(head);

  const frames = document.createElement('div');
  frames.className = 'dream-panels';
  if (Array.isArray(dream.panels)) {
    dream.panels.forEach((panel, i) => {
      const fig = document.createElement('figure');
      fig.className = 'dream-panel';
      const img = document.createElement('img');
      img.className = 'dream-img';
      img.alt = 'Dream panel ' + (i + 1);
      img.setAttribute('loading', 'lazy');
      loadDreamPanelIntoImg(img, dream, i);
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.className = 'dream-panel-text';
      cap.textContent = panel && panel.text ? panel.text : '';
      fig.appendChild(cap);
      frames.appendChild(fig);
    });
  }
  body.appendChild(frames);

  if (typeof dreamWakeLine === 'function') {
    const wake = dreamWakeLine(dream);
    if (wake) {
      const wakeEl = document.createElement('div');
      wakeEl.className = 'dream-wake dim tiny';
      wakeEl.textContent = wake;
      body.appendChild(wakeEl);
    }
  }
}

// ===== /SECTION: RENDER.COMPUTER =====
