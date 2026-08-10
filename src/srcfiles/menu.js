// ===== SECTION: MENU =====
// Menu overhaul Phase 10: the main menu — one component, two contexts:
//  'boot'  — the full-screen startup screen. Entries: Continue · New Game
//            · Load Game · Options · Exit Game, plus the Discord badge.
//  'pause' — the in-play overlay opened by the header Menu button; the
//            same component with Resume added, and the game clock paused
//            while it's open (Resume restarts it — nothing else does).
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
// loads last). Default on: absent cache (pre-load) means the historical
// behavior.
function isAutosaveEnabled() {
  return menuOptionsCache.autosave !== false;
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
  menuOptionsOpen = which === 'options';
  const title = document.getElementById('menu-title-screen');
  const options = document.getElementById('menu-options-screen');
  const arrows = document.getElementById('menu-arrows');
  if (title) title.hidden = which !== 'title';
  if (options) options.hidden = which !== 'options';
  if (arrows) arrows.hidden = which === 'options';
  fitMenuScale();
}

// The menu is a fixed-size composition (title, buttons, notes). On short or
// narrow viewports it used to overflow and get clipped top and bottom.
// Scale the active screen to fit the viewport, so every element is always
// visible regardless of pane size.
function fitMenuScale() {
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden) return;
  for (const id of ['menu-title-screen', 'menu-options-screen']) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
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
  // is an overlay ON the game, and the slideshow's own darkening overlay
  // already sits above it.
  const app = document.getElementById('app');
  if (app && menuContext === 'boot') app.setAttribute('data-app-hidden', '');
  if (typeof closeSaveMenu === 'function') closeSaveMenu();
  if (typeof closeInventoryPanel === 'function') closeInventoryPanel();
  if (typeof closeContainerPanel === 'function') closeContainerPanel();
  showMenuScreen('title');
  menu.hidden = false;
  fitMenuScale();
  const resumeBtn = document.getElementById('menu-resume-btn');
  if (resumeBtn) resumeBtn.hidden = context !== 'pause';
  refreshMenuContinue();
  refreshMenuOptionsUi();
  loadMenuPreferences().then(() => refreshMenuOptionsUi());
  initTitleGallery();
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

async function doToggleAutosave() {
  const opts = await setMenuOptions({ autosave: !menuOptionsCache.autosave });
  refreshMenuOptionsUi();
  // Re-arm the timer immediately if it just turned back on with a live game.
  if (opts.autosave && currentGameState) startAutosave(() => currentGameState);
}

function refreshMenuOptionsUi() {
  const bgBtn = document.getElementById('opt-bg-art-btn');
  const autoBtn = document.getElementById('opt-autosave-btn');
  if (bgBtn) bgBtn.textContent = menuOptionsCache.bgArt ? 'On' : 'Off';
  if (autoBtn) autoBtn.textContent = menuOptionsCache.autosave ? 'On' : 'Off';
  refreshMenuPreferencesUi();
}

// --- Cast preferences (prompt-generator v2 pass C) ---
// Toggles for the actor/pairing filters the prompt engine honors via
// menuPreferencesCache (defs.menu.js). Saved to kv like the other options;
// the engine reads the same cache, so toggling here changes generated art
// immediately.
function refreshMenuPreferencesUi() {
  const p = menuPreferencesCache || {};
  const g = p.actorGenders || {};
  const pair = p.pairings || {};
  const set = (id, on) => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = on ? 'On' : 'Off';
  };
  set('pref-gender-f-btn', g.f !== false);
  set('pref-gender-m-btn', g.m !== false);
  set('pref-gender-nb-btn', g.nb !== false);
  set('pref-pairing-hetero-btn', pair.hetero !== false);
  set('pref-pairing-gay-btn', pair.gay !== false);
  set('pref-pairing-lesbian-btn', pair.lesbian !== false);
}

function showMenuPrefNote(msg) {
  const el = document.getElementById('menu-pref-note');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showMenuPrefNote._t);
  showMenuPrefNote._t = setTimeout(() => { el.hidden = true; }, 3000);
}

async function saveMenuPreferences() {
  try {
    await root.kv.menu.set(MENU_GALLERY_PREFS_KEY, menuPreferencesCache);
  } catch (e) { /* preferences are best-effort */ }
}

async function doTogglePreference(kind, key) {
  const prefs = menuPreferencesCache;
  const target = kind === 'gender' ? prefs.actorGenders : prefs.pairings;
  if (target[key]) {
    const remaining = Object.keys(target).filter((k) => target[k]).length;
    if (remaining <= 1) {
      showMenuPrefNote('Keep at least one ' + (kind === 'gender' ? 'gender' : 'pairing') + ' enabled.');
      return;
    }
  }
  target[key] = !target[key];
  await saveMenuPreferences();
  refreshMenuOptionsUi();
}

// Escape closes the pause menu (and only the pause menu — the boot screen
// has nowhere to go). Registered here rather than in UI's keydown handler
// so each surface owns its own escape; the container/inventory Escape
// handlers stay separate and the two surfaces can't stack.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const menu = document.getElementById('main-menu');
  if (!menu || menu.hidden || menuContext !== 'pause') return;
  if (menuOptionsOpen) {
    showMenuScreen('title');
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