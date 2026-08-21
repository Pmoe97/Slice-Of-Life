// ===== SECTION: MENU =====
// Menu overhaul Phase 10: the main menu — one component, two contexts:
//  'boot'  — the full-screen startup screen. Entries: Continue · New Game
//            · Load Game · Options · Exit Game, plus the Discord badge.
//  'pause' — the real pause screen (Settings & Pause Overhaul Phase 3, D3):
//            a plain dimmed overlay over the live game, with the game clock
//            paused while it's open (Resume restarts it — nothing else
//            does). The title gallery / slideshow never runs behind it.
//
// Structure follows hedonism-island (deviation 1): persistent DOM + a
// `.hidden` toggle + one sub-screen per state, with buttons wired through
// this codebase's global data-action chain (ui.js's handleAction) rather
// than the reference games' innerHTML + inline-onclick re-rendering.
//
// The slideshow machinery lives in IMAGE (titleGallery); MENU owns the
// DOM, the two contexts, and the meta actions (Continue/Load/Options/Exit).
//
// Local settings (Background art / Autosave) persist in kv.menu under the
// 'options' key — browser-local preferences like the image LRU, deliberately
// NOT part of a save record (kv.menu is not in SAVE_KEYS).

let menuContext = null;              // 'boot' | 'pause' | null
let menuOptionsOpen = false;
let menuEntryCache = null;           // { entry, record } for Continue

// Settings & Pause Overhaul Phase 2 (D2): the tabbed settings sub-screen's
// module state. settingsActiveTab is the last-opened tab, remembered per
// session (the plan's "last-opened tab is remembered" — deliberately NOT
// persisted; the settings schema has no tab field and adding one is not in
// the plan). settingsFilter is the cross-tab filter box's live query.
let settingsOrigin = 'options';      // screen Back returns to: 'options' (boot) | 'pause' (in-game pause menu)
let settingsActiveTab = null;
let settingsFilter = '';
let settingsFilterWired = false;

const DEFAULT_MENU_OPTIONS = { bgArt: true, autosave: true };
let menuOptionsCache = { ...DEFAULT_MENU_OPTIONS };

async function loadMenuOptions() {
  try {
    const opts = await root.kv.menu.get(MENU_GALLERY_OPTIONS_KEY);
    menuOptionsCache = { ...DEFAULT_MENU_OPTIONS, ...(opts || {}) };
  } catch (e) {
    menuOptionsCache = { ...DEFAULT_MENU_OPTIONS };
  }
  return menuOptionsCache;
}

async function setMenuOptions(patch) {
  const opts = { ...menuOptionsCache, ...patch };
  menuOptionsCache = opts;
  try { await root.kv.menu.set(MENU_GALLERY_OPTIONS_KEY, opts); } catch (e) {}
  return opts;
}

// Consulted by STATE's startAutosave (runtime forward-reference — MENU
// loads last). Re-pointed to the settings store (Phase 2): autosave is a
// gameplay setting that now lives in kv.menu 'settings', and the retired
// 'options' key is no longer read or written for it. Default on: the
// fresh settings cache (pre-load) means the historical behavior.
function isAutosaveEnabled() {
  return settingsCache.autosave !== false;
}

// --- Continue target: the most recent save in the most recent run ---
// kv.saveIndex is newest-first; the first entry of each runId is that run's
// newest save, and the run whose head has the newest createdAt is the most
// recent run. (Equivalent to index[0] in normal play; the run-grouping also
// handles the imported-older-run edge without silently picking a stale save.)
async function latestContinueEntry() {
  const idx = await getSaveIndex();
  if (!idx.length) return null;
  const heads = new Map();
  for (const e of idx) {
    if (!heads.has(e.runId)) heads.set(e.runId, e);
  }
  const runHeads = [...heads.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return runHeads[0] || null;
}

// --- Menu DOM ---
function showMenuScreen(which) {
  menuOptionsOpen = which === 'options' || which === 'settings';
  const title = document.getElementById('menu-title-screen');
  const options = document.getElementById('menu-options-screen');
  const settings = document.getElementById('menu-settings-screen');
  const pause = document.getElementById('menu-pause-screen');
  const arrows = document.getElementById('menu-arrows');
  if (title) title.hidden = which !== 'title';
  if (options) options.hidden = which !== 'options';
  if (settings) settings.hidden = which !== 'settings';
  if (pause) pause.hidden = which !== 'pause';
  if (arrows) arrows.hidden = which !== 'title';
  fitMenuScale();
}

// The menu is a fixed-size composition (title, buttons, notes). On short or
// narrow viewports it used to overflow and get clipped top and bottom.
// Scale the active screen to fit the viewport, so every element is always
// visible regardless of pane size.
function fitMenuScale() {
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden) return;
  for (const id of ['menu-title-screen', 'menu-options-screen', 'menu-pause-screen']) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
    if (id === 'menu-options-screen' || id === 'menu-pause-screen') {
      // The options list and the pause screen are tall and must stay
      // readable, so never scale them:
      // scaling-and-clipping loses the rows below the viewport fold with no
      // way to scroll (the box is already capped at 100vh, so the clip wins).
      // Instead let their CSS max-height + overflow-y:auto scroll — every
      // row and the Back button stay reachable at full size.
      el.style.transform = 'translateY(-50%)';
      el.style.overflow = '';
      continue;
    }
    const naturalH = el.scrollHeight;
    const naturalW = el.scrollWidth;
    const scale = Math.min(1, (innerHeight - 20) / naturalH, innerWidth / naturalW);
    el.style.transform = `translateY(-50%) scale(${scale})`;
    el.style.overflow = scale < 1 ? 'hidden' : '';
  }
}
if (typeof window !== 'undefined') window.addEventListener('resize', fitMenuScale);

function showMainMenu(context) {
  menuContext = context || 'boot';
  const menu = document.getElementById('main-menu');
  if (!menu) return;
  // The pause context genuinely pauses the game: the rAF clock loop (the
  // real-time need decay) is stopped while the menu is open. Resume
  // restarts it; every other way out (Continue/Load/New Game/Exit) starts
  // the loop itself after replacing the state.
  if (context === 'pause' && currentGameState) pauseClockLoop();
  // Boot context re-covers the game shell (see main.html's #app comment):
  // returning to the title from Exit Game must not leave the old play
  // screen showing behind a menu the player is about to start a new game
  // from. The pause context deliberately leaves it visible — a pause menu
  // is an overlay ON the game, and the menu's own dimmed background (the
  // [data-context="pause"] rule) sits above it in place of the gallery's
  // darkening overlay, which Phase 3 stops running in the pause context.
  const app = document.getElementById('app');
  if (app && menuContext === 'boot') app.setAttribute('data-app-hidden', '');
  if (typeof closeSaveMenu === 'function') closeSaveMenu();
  if (typeof closeInventoryPanel === 'function') closeInventoryPanel();
  if (typeof closeContainerPanel === 'function') closeContainerPanel();
  showMenuScreen(context === 'pause' ? 'pause' : 'title');
  // Settings & Pause Overhaul Phase 3 (D3): the pause context is a plain
  // dimmed overlay — the CSS [data-context="pause"] rule hides the gallery
  // image/darkening layers so the live game shows dimmed beneath.
  menu.setAttribute('data-context', menuContext);
  menu.hidden = false;
  fitMenuScale();
  const continueBtn = document.getElementById('menu-continue-btn');
  if (continueBtn) continueBtn.hidden = context !== 'boot';
  refreshMenuContinue();
  refreshMenuOptionsUi();
  if (context === 'pause') {
    // Phase 3 (D3): the title gallery never runs behind the pause menu —
    // skip initTitleGallery entirely and stop any stale timer (defensive;
    // closeMainMenu already stopped the boot gallery). The clock is frozen
    // by pauseClockLoop above, so one #pause-clock population at open time
    // stays accurate for the whole pause.
    stopTitleAutoCycle();
    refreshPauseClock();
  } else {
    initTitleGallery();
  }
}

// Phase 3 (D3): the pause screen's day/time readout. Reads the live game
// clock (already paused by showMainMenu('pause')); the same "Day N — HH:MM"
// shape as the in-game cs-clock. Guarded so the pause menu also opens
// cleanly without a game (e.g. mid-boot debugging).
function refreshPauseClock() {
  const el = document.getElementById('pause-clock');
  if (!el) return;
  const clock = currentGameState && currentGameState.meta && currentGameState.meta.clock;
  el.textContent = clock ? `Day ${clock.day} — ${formatTime(Math.floor(clock.minutes))}` : '';
}

function closeMainMenu() {
  const menu = document.getElementById('main-menu');
  if (menu) menu.hidden = true;
  // Uncover the game shell. This is the ONLY place the boot cover comes
  // off, and every path into play (resumeFromRecord, startSoloGame,
  // approveCastAndStartGame, continueGame, doMenuResume) already routes
  // through here — so a path that forgets to call it fails loudly with a
  // blank screen rather than silently half-starting a game.
  const app = document.getElementById('app');
  if (app) app.removeAttribute('data-app-hidden');
  menuContext = null;
  menuOptionsOpen = false;
  stopTitleAutoCycle();
}

// Continue is disabled until a save exists, then points at the most recent
// save in the most recent run (Phase 9's kv.saveIndex — never the live
// folders, so it resumes the exact snapshot the player last saved).
async function refreshMenuContinue() {
  const btn = document.getElementById('menu-continue-btn');
  if (!btn) return;
  const entry = await latestContinueEntry();
  menuEntryCache = null;
  if (!entry) {
    btn.disabled = true;
    return;
  }
  const record = await getSaveRecord(entry.slotId).catch(() => null);
  if (!record) {
    btn.disabled = true;
    return;
  }
  menuEntryCache = record;
  btn.disabled = false;
}

// --- Menu actions (dispatched through ui.js's data-action chain) ---
async function doMenuContinue() {
  const record = menuEntryCache;
  if (!record) return;
  closeMainMenu();
  showLoading('Loading...');
  try {
    await resumeFromRecord(record);
  } finally {
    hideLoading();
  }
}

function doMenuResume() {
  closeMainMenu();
  resumeClockLoop();
}

function doMenuOpenOptions() {
  // Settings & Pause Overhaul Phase 2 (D2): context-aware. The pause
  // context's Options opens the tabbed settings screen; the boot context
  // keeps the main-menu-only options row (Background art / Debug panel),
  // which now also carries the "Cast & more settings…" entry into that
  // screen (D1: gameplay settings never appear on the boot row).
  if (menuContext === 'pause') {
    openSettingsScreen();
    return;
  }
  refreshMenuOptionsUi();
  showMenuScreen('options');
}

async function doExitGame() {
  if (menuContext === 'pause' && currentGameState) {
    // Best-effort exit-save (same path as the pagehide handler), then back
    // to the boot menu with the playthrough dropped from memory.
    stopAutosave();
    stopClockLoop();
    try { await saveToSlot(currentGameState, 'exit'); } catch (e) {}
    closeMainMenu();
    currentGameState = null;
    currentSceneState = null;
    showMainMenu('boot');
  } else {
    // Browser games can't force-quit; close() is best-effort (blocked for
    // tabs the user opened) and the note tells them the honest exit.
    const note = document.getElementById('menu-exit-note');
    if (note) {
      note.hidden = false;
      clearTimeout(doExitGame._noteTimer);
      doExitGame._noteTimer = setTimeout(() => { note.hidden = true; }, 4000);
    }
    window.close();
  }
}

async function doToggleBgArt() {
  const opts = await setMenuOptions({ bgArt: !menuOptionsCache.bgArt });
  refreshMenuOptionsUi();
  if (opts.bgArt) {
    hideMenuUnavailable();
    initTitleGallery();
  } else {
    // Off = the pure gradient, a designed state — stop everything and drop
    // the image layers. Re-enabling cold-starts from the persisted ring.
    stopTitleAutoCycle();
    titleGallery.generating = false;
    titleGallery.images = [];
    titleGallery.idx = 0;
    const a = document.getElementById('titleBgImgA');
    const b = document.getElementById('titleBgImgB');
    if (a) { a.classList.remove('visible'); a.removeAttribute('src'); }
    if (b) { b.classList.remove('visible'); b.removeAttribute('src'); }
    hideMenuLoading();
    setMenuCounter(0, 0);
    setMenuPrevNextDisabled(true);
  }
}

function refreshMenuOptionsUi() {
  const bgBtn = document.getElementById('opt-bg-art-btn');
  if (bgBtn) bgBtn.textContent = menuOptionsCache.bgArt ? 'On' : 'Off';
}

// --- Settings sub-screen (Settings & Pause Overhaul Phase 2, D2) ---
// The tabbed settings surface renders entirely from SETTINGS_TABS: a left
// rail (icons + labels always visible), a cross-tab filter box, and
// immediate-apply rows. Every rendered row's action id must exist in
// MENU_ACTIONS (design invariant 1) — the toggle/cycle rows share the
// 'settings.toggle'/'settings.cycle' verbs and carry the target field as
// data-field, which handleAction forwards through extra.field. Back/Esc
// return to the origin recorded at openSettingsScreen time.
function openSettingsScreen(tab) {
  settingsOrigin = menuContext === 'pause' ? 'pause' : 'options';
  settingsFilter = '';
  const input = document.getElementById('settings-filter-input');
  if (input) input.value = '';
  if (tab) rememberSettingsTab(tab);
  wireSettingsFilter();
  renderSettingsUi();
  showMenuScreen('settings');
}

function closeSettingsScreen() {
  showMenuScreen(settingsOrigin || 'options');
}

// The last-opened tab is remembered per session (D2). Called from the
// 'settings.tab' action and openSettingsScreen(tab).
function rememberSettingsTab(tabId) {
  if (tabId && SETTINGS_TABS.some((t) => t.id === tabId)) settingsActiveTab = tabId;
}

function renderSettingsUi() {
  const rail = document.getElementById('settings-tab-rail');
  const panes = document.getElementById('settings-panes');
  const content = document.getElementById('settings-content');
  if (!rail || !panes) return;
  if (!SETTINGS_TABS.some((t) => t.id === settingsActiveTab)) settingsActiveTab = SETTINGS_TABS[0].id;
  const prevScroll = content ? content.scrollTop : 0;

  rail.innerHTML = '';
  for (const tab of SETTINGS_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-tab-btn' + (tab.id === settingsActiveTab ? ' active' : '');
    btn.setAttribute('data-action', 'settings.tab');
    btn.setAttribute('data-tab', tab.id);
    btn.setAttribute('aria-pressed', tab.id === settingsActiveTab ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'settings-tab-icon';
    icon.textContent = tab.icon;
    const label = document.createElement('span');
    label.className = 'settings-tab-label';
    label.textContent = tab.label;
    btn.appendChild(icon);
    btn.appendChild(label);
    rail.appendChild(btn);
  }

  panes.innerHTML = '';
  const query = settingsFilter.trim().toLowerCase();
  if (query) {
    renderFilteredPanes(panes, query);
  } else {
    renderTabPanes(panes);
  }

  if (content) content.scrollTop = prevScroll;
}

function renderTabPanes(panes) {
  const tab = SETTINGS_TABS.find((t) => t.id === settingsActiveTab);
  if (!tab) return;
  if (!tab.sections || tab.sections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    const icon = document.createElement('div');
    icon.className = 'settings-empty-icon';
    icon.textContent = tab.icon;
    const p = document.createElement('p');
    p.textContent = 'Nothing here yet — this tab arrives in a later update.';
    empty.appendChild(icon);
    empty.appendChild(p);
    panes.appendChild(empty);
    return;
  }
  for (const section of tab.sections) {
    const secEl = document.createElement('div');
    secEl.className = 'settings-section';
    if (section.title) {
      const h = document.createElement('h3');
      h.className = 'settings-section-title';
      h.textContent = section.title;
      secEl.appendChild(h);
    }
    const rows = section.rows || [];
    if (!rows.length) {
      const hint = document.createElement('p');
      hint.className = 'settings-section-empty';
      hint.textContent = section.emptyText || 'Nothing here yet.';
      secEl.appendChild(hint);
      panes.appendChild(secEl);
      continue;
    }
    if (section.desc) {
      const p = document.createElement('p');
      p.className = 'settings-section-desc';
      p.textContent = section.desc;
      secEl.appendChild(p);
    }
    for (const row of rows) secEl.appendChild(renderSettingsRow(row));
    panes.appendChild(secEl);
  }
}

function renderFilteredPanes(panes, query) {
  const matches = [];
  for (const tab of SETTINGS_TABS) {
    for (const section of tab.sections || []) {
      for (const row of section.rows || []) {
        const hay = `${row.label} ${row.desc || ''} ${row.searchText || ''} ${section.title || ''} ${tab.label}`.toLowerCase();
        if (hay.includes(query)) matches.push({ tab, row });
      }
    }
  }
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    const icon = document.createElement('div');
    icon.className = 'settings-empty-icon';
    icon.textContent = '🔍';
    const p = document.createElement('p');
    p.textContent = `No settings match "${settingsFilter.trim()}".`;
    empty.appendChild(icon);
    empty.appendChild(p);
    panes.appendChild(empty);
    return;
  }
  const byTab = new Map();
  for (const m of matches) {
    if (!byTab.has(m.tab.id)) byTab.set(m.tab.id, { tab: m.tab, rows: [] });
    byTab.get(m.tab.id).rows.push(m.row);
  }
  for (const { tab, rows } of byTab.values()) {
    const group = document.createElement('div');
    group.className = 'settings-section';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'settings-section-title settings-filter-tab';
    head.setAttribute('data-action', 'settings.tab');
    head.setAttribute('data-tab', tab.id);
    head.setAttribute('data-clear-filter', 'true');
    head.title = `Jump to ${tab.label}`;
    head.textContent = `${tab.icon} ${tab.label}`;
    group.appendChild(head);
    for (const row of rows) group.appendChild(renderSettingsRow(row));
    panes.appendChild(group);
  }
}

function renderSettingsRow(row) {
  const el = document.createElement('div');
  el.className = 'settings-row';
  const info = document.createElement('div');
  info.className = 'settings-row-info';
  const name = document.createElement('div');
  name.className = 'settings-row-name';
  name.textContent = row.label;
  info.appendChild(name);
  if (row.desc) {
    const desc = document.createElement('div');
    desc.className = 'settings-row-desc';
    desc.textContent = row.desc;
    info.appendChild(desc);
  }
  el.appendChild(info);
  el.appendChild(renderSettingsControl(row));
  return el;
}

// Row kinds land across phases: Phase 2 renders 'toggle' and 'cycle';
// Phase 5 adds 'sliders' (the Population tab's proportional grids); Phase 7
// adds 'grid' (the Images tab's style tiles), 'text' (the Custom style
// phrase field) and 'button' (Clear cached images). Phase 8 reuses 'grid'
// for the Appearance tab's theme tiles. An unknown kind renders a quiet
// placeholder so a row can never LOOK wired when its handler doesn't exist
// yet (design invariant 1).

// Phase 8 (D10): which tokens a theme tile's swatch chips preview. Read out
// of COLOR_THEMES.vars, so the swatches and the CSS rule-sets share one
// table (defs.settings.js) — a drift shows up here as a wrong chip.
const THEME_SWATCH_TOKENS = ['--color-bg', '--color-surface', '--color-accent', '--color-text'];

function renderSettingsControl(row) {
  const action = row.action || (row.kind === 'cycle' ? 'settings.cycle' : 'settings.toggle');
  if (row.kind === 'sliders') {
    return renderSliderGrid(row);
  }
  if (row.kind === 'grid') {
    // A tile grid (Phase 7: image styles; Phase 8: color themes). Each tile
    // is a button carrying the value as data-key; the active value is
    // highlighted. Theme entries additionally render swatch chips (drawn
    // from key.vars — the CSS rule-sets' sibling table in defs.settings.js)
    // and a group tag; the 'match-system' theme has no vars, so its tile
    // shows a single CSS-drawn light/dark split chip.
    const grid = document.createElement('div');
    grid.className = 'settings-style-grid';
    grid.setAttribute('data-field', row.field);
    const keys = row.keys || [];
    for (const key of keys) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'settings-grid-tile' + (settingsCache[row.field] === key.id ? ' active' : '');
      tile.setAttribute('data-action', action);
      tile.setAttribute('data-key', key.id);
      if (key.blurb) tile.title = key.blurb;
      const label = document.createElement('span');
      label.className = 'settings-grid-tile-label';
      label.textContent = key.label;
      tile.appendChild(label);
      if (key.vars) {
        const swatchRow = document.createElement('span');
        swatchRow.className = 'settings-grid-tile-swatches';
        if (key.id === 'match-system') {
          const chip = document.createElement('span');
          chip.className = 'settings-grid-tile-swatch settings-grid-tile-swatch-system';
          chip.title = 'Follows your OS light/dark setting';
          swatchRow.appendChild(chip);
        } else {
          for (const token of THEME_SWATCH_TOKENS) {
            const color = key.vars[token];
            if (!color) continue;
            const chip = document.createElement('span');
            chip.className = 'settings-grid-tile-swatch';
            chip.style.background = color;
            chip.title = `${token} ${color}`;
            swatchRow.appendChild(chip);
          }
        }
        tile.appendChild(swatchRow);
      }
      if (key.blurb) {
        const blurb = document.createElement('span');
        blurb.className = 'settings-grid-tile-blurb';
        blurb.textContent = key.blurb;
        tile.appendChild(blurb);
      }
      if (key.group) {
        const group = document.createElement('span');
        group.className = 'settings-grid-tile-group';
        group.textContent = key.group;
        tile.appendChild(group);
      }
      grid.appendChild(tile);
    }
    return grid;
  }
  if (row.kind === 'text') {
    // A free-text field (Phase 7: the Custom style phrase). It writes
    // through setSettings on every keystroke (immediate-apply, D2) WITHOUT
    // re-rendering — a re-render would destroy the input's focus — then
    // flips the active tile in place. The value lives in the input itself,
    // so the field never shows a stale settings value after typing.
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-style-custom-input';
    input.placeholder = row.placeholder || '';
    input.value = settingsCache[row.field] || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      doSetCustomStyle(input.value);
      refreshStyleGridActive();
    });
    return input;
  }
  if (row.kind === 'button') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'title-btn menu-option-toggle' + (row.danger ? ' settings-clear-btn' : '');
    btn.setAttribute('data-action', action);
    btn.textContent = row.buttonLabel || row.label;
    return btn;
  }
  if (row.kind === 'storage') {
    // Phase 9 (D11): the Data tab's storage insight. The readout is filled
    // asynchronously from kv (storageSummary) so the renderer never blocks;
    // the Refresh button re-runs the fill in place via the 'data.storage'
    // action. The fill is tagged so a stale async completion can't clobber
    // a newer one (opening the tab, waiting, then refreshing).
    const wrap = document.createElement('div');
    wrap.className = 'settings-storage';
    wrap.setAttribute('data-field', row.field || 'storage-summary');
    const box = document.createElement('div');
    box.className = 'settings-storage-body';
    wrap.appendChild(box);
    const footer = document.createElement('div');
    footer.className = 'settings-storage-footer';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'title-btn menu-option-toggle';
    refresh.setAttribute('data-action', action);
    refresh.textContent = row.buttonLabel || 'Refresh';
    footer.appendChild(refresh);
    wrap.appendChild(footer);
    fillStorageReadout(box);
    return wrap;
  }
  if (row.kind === 'toggle') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'title-btn menu-option-toggle';
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-field', row.field);
    btn.textContent = getSettingValue(row.field) ? 'On' : 'Off';
    return btn;
  }
  if (row.kind === 'cycle') {
    const opts = row.options || [];
    const cur = settingsCache[row.field];
    const opt = opts.find((o) => o.id === cur);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'title-btn menu-option-toggle';
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-field', row.field);
    btn.title = 'Click to change';
    btn.textContent = (opt && (opt.label || opt.id)) || String(cur ?? '—');
    return btn;
  }
  const span = document.createElement('span');
  span.className = 'settings-row-placeholder';
  span.textContent = '—';
  return span;
}

// Nested settings fields ('pairings.hetero') resolve dot-paths against the
// live cache (Phase 5: the pairing allowlist rows).
function getSettingValue(field) {
  return field.split('.').reduce((cur, part) => (cur == null ? undefined : cur[part]), settingsCache);
}

function findSettingsRowConfig(field) {
  for (const tab of SETTINGS_TABS) {
    for (const section of tab.sections || []) {
      for (const row of section.rows || []) {
        if (row.field === field) return row;
      }
    }
  }
  return null;
}

// --- Data tab storage insight (Phase 9, D11) ---
// The readout is read live from kv — never a cache, so it always matches
// reality. fillStorageReadout is the async writer (kicked off by the row
// renderer AND by the Refresh button); refreshStorageReadout finds the one
// live readout and re-fills it in place, so a refresh never rebuilds the
// pane and a drag/focus elsewhere survives.
let _storageFillId = 0;

async function fillStorageReadout(box) {
  const fillId = ++_storageFillId;
  box.dataset.fillId = fillId;
  box.textContent = 'Reading storage…';
  let summary;
  try {
    summary = await storageSummary();
  } catch (e) {
    if (box.dataset.fillId === String(fillId)) box.textContent = 'Storage unavailable.';
    return;
  }
  if (box.dataset.fillId !== String(fillId)) return; // a newer fill superseded us
  box.innerHTML = '';
  for (const r of summary.rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'settings-storage-row';
    const label = document.createElement('span');
    label.className = 'settings-storage-label';
    label.textContent = r.label;
    const val = document.createElement('span');
    val.className = 'settings-storage-value';
    val.textContent = `${r.count} ${r.count === 1 ? 'entry' : 'entries'} · ${formatStorageBytes(r.bytes)}`;
    rowEl.appendChild(label);
    rowEl.appendChild(val);
    box.appendChild(rowEl);
  }
  const total = document.createElement('div');
  total.className = 'settings-storage-total';
  total.textContent = `Total ≈ ${formatStorageBytes(summary.totalBytes)}`;
  box.appendChild(total);
}

function refreshStorageReadout() {
  const box = document.querySelector('.settings-storage-body');
  if (box) fillStorageReadout(box);
}

// Reset all data (Phase 9, D11) also resets the boot row's option cache —
// after the kv wipe the cached 'options' would show a value that no longer
// exists. settings.js's resetAllData calls this via typeof guard (MENU
// loads last, so the guard is for load-order tidiness, not a real miss).
function resetMenuOptionsCache() {
  menuOptionsCache = { ...DEFAULT_MENU_OPTIONS };
}

// --- Population tab sliders (Phase 5, D13/D14) ---
// The two proportional-slider grids (cast identities + races) mirror the
// office-clicker HR pattern: typed % inputs, live normalization, a
// total-100 readout, and a ⚠ warning when the raw inputs leave 100. The
// changed key is pinned; the remaining keys re-balance proportionally
// (largest-remainder) to fill exactly 100. Every change writes through
// setSettings (D2 immediate-apply), so the world + art consumers read the
// same live store. Nudge buttons route through the data-action chain
// ('set.population-dist', with data-field/data-key/data-delta); the range
// and number inputs call the same handler directly (they're inputs, not
// actions).
let sliderRawTotalCache = {};

function sliderWorkFor(row) {
  const work = {};
  for (const key of row.keys) work[key.id] = (settingsCache[row.field] && settingsCache[row.field][key.id]) || 0;
  return work;
}

function renderSliderGrid(row) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-sliders';
  wrap.dataset.field = row.field;
  const grid = document.createElement('div');
  grid.className = 'settings-slider-grid';
  for (const key of row.keys) grid.appendChild(renderSliderRow(row, key));
  const total = document.createElement('div');
  total.className = 'settings-slider-total';
  const totalValue = document.createElement('span');
  totalValue.className = 'settings-slider-total-value';
  const warn = document.createElement('span');
  warn.className = 'settings-slider-warn';
  warn.hidden = true;
  total.appendChild(totalValue);
  total.appendChild(warn);
  wrap.appendChild(grid);
  wrap.appendChild(total);
  // The grid is not in the DOM yet — pass the wrap so the readout/warning
  // still initialize.
  refreshSliderGrid(row, sliderWorkFor(row), wrap);
  return wrap;
}

function renderSliderRow(row, key) {
  const value = (settingsCache[row.field] && settingsCache[row.field][key.id]) || 0;
  const div = document.createElement('div');
  div.className = 'settings-slider-row';
  div.dataset.key = key.id;
  const label = document.createElement('span');
  label.className = 'settings-slider-label';
  label.textContent = key.label;
  const range = document.createElement('input');
  range.type = 'range';
  range.min = 0; range.max = 100; range.step = 1;
  range.className = 'settings-slider-range';
  range.value = value;
  range.setAttribute('aria-label', `${key.label} percent`);
  range.addEventListener('input', () => doPopulationDist({ field: row.field, key: key.id, value: range.value }));
  const arrows = document.createElement('div');
  arrows.className = 'settings-slider-arrows';
  for (const delta of [-10, -5, -1, 1, 5, 10]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'settings-slider-nudge';
    const depth = Math.abs(delta);
    b.textContent = delta < 0 ? '‹'.repeat(depth === 10 ? 3 : depth === 5 ? 2 : 1) : '›'.repeat(depth === 10 ? 3 : depth === 5 ? 2 : 1);
    b.title = (delta > 0 ? '+' : '') + delta;
    b.setAttribute('data-action', 'set.population-dist');
    b.setAttribute('data-field', row.field);
    b.setAttribute('data-key', key.id);
    b.setAttribute('data-delta', String(delta));
    arrows.appendChild(b);
  }
  const num = document.createElement('input');
  num.type = 'number';
  num.min = 0; num.max = 100;
  num.className = 'settings-slider-num';
  num.value = value;
  num.setAttribute('aria-label', `${key.label} percent`);
  num.addEventListener('change', () => doPopulationDist({ field: row.field, key: key.id, value: num.value }));
  div.appendChild(label);
  div.appendChild(range);
  div.appendChild(arrows);
  div.appendChild(num);
  return div;
}

function clampSliderValue(v) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Pin the changed key and re-balance every other key proportionally
// (largest-remainder) so the map sums to exactly 100. Mirrors the
// office-clicker HR normalization.
function pinToHundred(work, changed) {
  const keys = Object.keys(work);
  const changedVal = clampSliderValue(work[changed] ?? 0);
  work[changed] = changedVal;
  const others = keys.filter((k) => k !== changed);
  const remaining = 100 - changedVal;
  if (remaining <= 0) {
    for (const k of others) work[k] = 0;
    work[changed] = 100;
    return;
  }
  if (!others.length) return;
  const otherSum = others.reduce((s, k) => s + clampSliderValue(work[k] ?? 0), 0);
  if (otherSum <= 0) {
    const base = Math.floor(remaining / others.length);
    let rem = remaining - base * others.length;
    for (let i = 0; i < others.length; i++) work[others[i]] = base + (i < rem ? 1 : 0);
    return;
  }
  const exact = {};
  let sum = 0;
  for (const k of others) {
    exact[k] = (clampSliderValue(work[k] ?? 0) / otherSum) * remaining;
    work[k] = Math.floor(exact[k]);
    sum += work[k];
  }
  const remainders = others
    .map((k) => ({ k, frac: exact[k] - work[k] }))
    .sort((a, b) => b.frac - a.frac);
  let diff = remaining - sum;
  for (let i = 0; i < diff; i++) work[remainders[i % remainders.length].k]++;
}

// Shared handler for the range/number inputs AND the 'set.population-dist'
// data-action (nudge buttons). extra: { field, key, value?|delta? }.
async function doPopulationDist(extra) {
  const row = findSettingsRowConfig(extra.field);
  if (!row || row.kind !== 'sliders' || !extra.key) return;
  const work = sliderWorkFor(row);
  const newVal = clampSliderValue(extra.value !== undefined ? extra.value : (work[extra.key] || 0) + (extra.delta || 0));
  work[extra.key] = newVal;
  const rawTotal = Object.values(work).reduce((s, v) => s + Number(v), 0);
  pinToHundred(work, extra.key);
  await setSettings({ [row.field]: work });
  sliderRawTotalCache[row.field] = rawTotal;
  refreshSliderGrid(row, work);
}

// Patch the grid's inputs/readout in place — never rebuild, so a drag or
// mid-typing focus survives. root lets the builder initialize a grid that
// isn't in the DOM yet; runtime refreshes query the document.
function refreshSliderGrid(row, work, root) {
  const wrap = root || document.querySelector(`.settings-sliders[data-field="${CSS.escape(row.field)}"]`);
  if (!wrap) return;
  for (const key of row.keys) {
    const rowEl = wrap.querySelector(`.settings-slider-row[data-key="${CSS.escape(key.id)}"]`);
    if (!rowEl) continue;
    const range = rowEl.querySelector('.settings-slider-range');
    const num = rowEl.querySelector('.settings-slider-num');
    const val = work[key.id] || 0;
    if (range) range.value = val;
    if (num && document.activeElement !== num) num.value = val;
  }
  const totalValue = wrap.querySelector('.settings-slider-total-value');
  if (totalValue) totalValue.textContent = 'Total: 100%';
  const warn = wrap.querySelector('.settings-slider-warn');
  const raw = sliderRawTotalCache[row.field];
  if (warn) {
    if (raw !== undefined && raw !== 100) {
      warn.hidden = false;
      warn.textContent = `⚠ Inputs totalled ${raw}% — rebalanced to 100%`;
    } else {
      warn.hidden = true;
    }
  }
}

async function doSettingsToggle(field) {
  const row = findSettingsRowConfig(field);
  if (!row) return;
  const next = !getSettingValue(field);
  const parts = field.split('.');
  // Phase 5: nested fields (the 'pairings.*' allowlist rows) patch the
  // parent object rather than the whole field.
  const patch = parts.length === 1
    ? { [field]: next }
    : { [parts[0]]: { ...(settingsCache[parts[0]] || {}), [parts[1]]: next } };
  // Phase 4: the write-through's live side effects (re-arming the autosave
  // timer, applying SFW mode to the live game / boot gallery, applying the
  // text scale) live in SETTINGS' setSettings, not here — every row shares
  // them and this handler stays a pure store write.
  await setSettings(patch);
  renderSettingsUi();
}

async function doSettingsCycle(field) {
  const row = findSettingsRowConfig(field);
  if (!row || !row.options || !row.options.length) return;
  const cur = settingsCache[field];
  const idx = row.options.findIndex((o) => o.id === cur);
  const next = row.options[(idx + 1) % row.options.length] || row.options[0];
  // Phase 4: the interval row re-arms the live timer through setSettings,
  // which reads the fresh value — no per-row handling needed here.
  await setSettings({ [field]: next.id });
  renderSettingsUi();
}

// --- Images tab (Phase 7, D9) ---
// The style grid's tile click and the Custom phrase field. Both write
// through setSettings (immediate-apply); setSettings re-filters the boot
// gallery on style change (applyImageStyleLive) and every cache key is
// style-tagged, so a style change never serves a stale-cached frame.

async function doSetImageStyle(styleId) {
  if (!IMAGE_STYLES.some((s) => s.id === styleId) && styleId !== 'none') return;
  await setSettings({ imageStyle: styleId });
  refreshStyleGridActive();
}

async function doSetCustomStyle(text) {
  // Typing in the field activates Custom — the phrase the player is editing
  // is the one that must take effect. setSettings persists both fields.
  await setSettings({ imageStyle: '__custom', customStylePrompt: String(text || '') });
}

// Flip the active tile in place (no re-render — the custom field's focus
// must survive keystrokes). Called after a style write and after each
// keystroke in the Custom field.
function refreshStyleGridActive() {
  const grid = document.querySelector('.settings-style-grid[data-field="imageStyle"]');
  if (!grid) return;
  for (const tile of grid.querySelectorAll('.settings-grid-tile')) {
    tile.classList.toggle('active', tile.getAttribute('data-key') === settingsCache.imageStyle);
  }
}

// --- Appearance tab (Phase 8, D10) ---
// The theme grid's tile click. Writes through setSettings (immediate-apply)
// — applyTheme() re-skins the UI chrome live via data-theme on <html>, the
// selection persists, and the active tile is flipped in place.
async function doSetTheme(themeId) {
  if (!COLOR_THEMES.some((t) => t.id === themeId)) return;
  await setSettings({ theme: themeId });
  refreshThemeGridActive();
}

function refreshThemeGridActive() {
  const grid = document.querySelector('.settings-style-grid[data-field="theme"]');
  if (!grid) return;
  for (const tile of grid.querySelectorAll('.settings-grid-tile')) {
    tile.classList.toggle('active', tile.getAttribute('data-key') === settingsCache.theme);
  }
}

// The filter box is an event, not a data-action (D2): its own input
// listener re-renders the panes on every keystroke. Escape in a non-empty
// box clears it first (and is consumed so it doesn't also close the
// screen); Escape in an empty box falls through to the menu handler.
function wireSettingsFilter() {
  if (settingsFilterWired) return;
  settingsFilterWired = true;
  const input = document.getElementById('settings-filter-input');
  if (!input) return;
  input.addEventListener('input', () => {
    settingsFilter = input.value;
    renderSettingsUi();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      input.value = '';
      settingsFilter = '';
      renderSettingsUi();
    }
  });
}

// Escape closes the pause menu (and the settings sub-screen — the boot
// screen has nowhere to go). Registered here rather than in UI's keydown
// handler so each surface owns its own escape; the container/inventory
// Escape handlers stay separate and the two surfaces can't stack.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden) return;
  const settings = document.getElementById('menu-settings-screen');
  if (settings && !settings.hidden) { closeSettingsScreen(); return; }
  if (menuContext !== 'pause') return;
  if (menuOptionsOpen) {
    // Reachable only if the settings sub-screen were somehow open without
    // being caught above; return to the pause screen, never the title.
    showMenuScreen('pause');
  } else {
    doMenuResume();
  }
});

// ===== /SECTION: MENU =====

// ===== SECTION: BOOT =====
// The single entry point. Lives at the bottom of MENU — the last script to
// load — because it calls into MENU/IMAGE functions that ui.js's own bottom
// can't reach (ui.js defines boot, menu.js invokes it after every script has
// loaded). This replaces the historical boot() call at the bottom of ui.js.
boot();
// ===== /SECTION: BOOT =====