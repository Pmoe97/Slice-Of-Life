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
  const sandbox = document.getElementById('menu-sandbox-screen');
  const arrows = document.getElementById('menu-arrows');
  if (title) title.hidden = which !== 'title';
  if (options) options.hidden = which !== 'options';
  if (settings) settings.hidden = which !== 'settings';
  if (pause) pause.hidden = which !== 'pause';
  if (sandbox) sandbox.hidden = which !== 'sandbox';
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

// --- Sandbox setup sub-screen (Seasonal Calendar & Sandbox plan, Phase B4+) ---
// The config surface holds ONE module-level cfg object (pendingSandboxConfig) that
// the sub-editors mutate and Start consumes — a fresh screen never discards the
// player's edits, and Start always sees exactly what the rows show. Phase B4 is
// the shell: defaults + a Start path. Roommates (B5) and house state (B6)
// grow the rows from this same render function.
// Sandbox Pre-Game Editor Overhaul (D12): tab/sub-tab/instance state is
// module-level and session-scoped, matching settingsActiveTab's own
// precedent above — none of this is written to any persisted store.
let sandboxActiveTab = 'player';        // top-level SANDBOX_TABS id
let sandboxActiveSubtab = {};           // { <tabId>: <subtabId> }, House only for now (D6)
let sandboxActiveRoommate = null;       // index into cfg.roommates, or null (rail view)
let sandboxRoommateSubtab = 'identity'; // which of the 5 sub-tabs, shared across roommates

function defaultSandboxConfig() {
  return {
    version: 1,
    // Builds the same shape SIM_generateHouse takes for the player (the studio's
    // own buildPlayerDraftForNewGame). Unopened studio = the blank draft, which
    // the engine rolls into a full appearance — identical to a solo start.
    player: buildPlayerDraftForNewGame(),
    roommates: [],
    house: {
      preset: 'wreck',
      facilities: {},
      structural: {
        kitchen_hall_door: false, pool_window: false,
        study_to_bedroom: false, ensuite: false, dining_doors: false,
      },
    },
    // D19: there is deliberately NO startDay here. Sandbox is always day 1; the
    // advanced thing is the house, never the calendar.
    economy: {
      money: ECONOMY.startingMoney,
      rentGraceDays: ECONOMY.opening?.rentGraceDays ?? 14,
      billsStartDay: (ECONOMY.opening?.firstBillDelay ?? 7) + 1,
      taxReserve: 0,
      // F1 (Discord feedback, 2026-08-23): gameplay options, not economy —
      // kept on this same object rather than a new cfg.gameplayOptions
      // because economy IS the bag startSandboxGame already threads
      // straight into SIM_generateHouse as economyCfg (see buildGameState/
      // rollCastSlot's reads of these same field names).
      needDecayScale: 1,
      needDecayDisabled: false,
      dispositionSkew: 0,
      willingnessBaseline: 0,
    },
    flags: { suppressTutorial: true },
  };
}

// F1 (Discord feedback, 2026-08-23): New Game's gameplay-options step,
// shown after the Player Studio and before the intro cutscene. Holds
// exactly the four fields GAMEPLAY_OPTIONS_SECTIONS' rows write to — a
// draft-scale version of pendingSandboxConfig.economy's new fields, not a
// second definition of what they mean.
let pendingNewGameOptions = null;
let newGameOptionsDraft = null; // the player draft to carry into the cutscene once this screen confirms

function openNewGameOptions(draft) {
  newGameOptionsDraft = draft;
  // Nested under .economy to match GAMEPLAY_OPTIONS_SECTIONS' row field
  // paths verbatim ('economy.needDecayScale', ...) — those rows are the
  // exact same objects Sandbox's Economy tab renders, so they carry
  // Sandbox's field paths regardless of which screen is showing them.
  pendingNewGameOptions = { economy: { needDecayScale: 1, needDecayDisabled: false, dispositionSkew: 0, willingnessBaseline: 0 } };
  sbxActiveTarget = pendingNewGameOptions;
  renderNewGameOptionsUi();
  const el = document.getElementById('newgame-options-screen');
  if (el) el.hidden = false;
  wireNewGameOptionsInputs();
}

function closeNewGameOptions() {
  sbxActiveTarget = null;
  const el = document.getElementById('newgame-options-screen');
  if (el) el.hidden = true;
}

function renderNewGameOptionsUi() {
  const panes = document.getElementById('newgame-options-panes');
  if (!panes) return;
  panes.innerHTML = '';
  renderSandboxSections(panes, GAMEPLAY_OPTIONS_SECTIONS, '⚙️');
}

function doNewGameOptionsStart() {
  const draft = newGameOptionsDraft;
  closeNewGameOptions();
  newGameOptionsDraft = null;
  // pendingNewGameOptions deliberately stays set — startSoloGame (ui.js)
  // reads it directly at the point it calls SIM_generateHouse, the same
  // module-global-read pattern startSandboxGame already uses for
  // pendingSandboxConfig, rather than threading a second parameter through
  // playIntroCutscene/introState/finishIntro.
  playIntroCutscene(draft);
}

function doNewGameOptionsBack() {
  closeNewGameOptions();
  newGameOptionsDraft = null;
  pendingNewGameOptions = null;
}

function doMenuSandbox() {
  if (!pendingSandboxConfig) pendingSandboxConfig = defaultSandboxConfig();
  renderSandboxUi();
  showMenuScreen('sandbox');
  wireSandboxConfigInputs();
}

// --- Sandbox Pre-Game Editor Overhaul: the tab shell (Phase 1) ---
// Extends Pattern B (SETTINGS_TABS' data-driven tab→section→row shape, D1)
// rather than reinventing one — mirrors renderSettingsUi/renderTabPanes/
// renderSettingsRow below. Bespoke content (Player's summary+Design button,
// the Roommates rail, House's facility/structural panels) is dispatched by
// id/dynamicInstances rather than forced through the generic row shape
// (D5); renderSandboxTabPanes is the one place that decides bespoke vs.
// generic per tab/sub-tab. Player and Roommates render a placeholder pane
// until Phase 3/5 replace that branch with their real bespoke renderers.

function renderSandboxUi() {
  const rail = document.getElementById('sandbox-tab-rail');
  const panes = document.getElementById('sandbox-panes');
  const content = document.getElementById('sandbox-content');
  if (!rail || !panes) return;
  if (!pendingSandboxConfig) pendingSandboxConfig = defaultSandboxConfig();
  if (!SANDBOX_TABS.some((t) => t.id === sandboxActiveTab)) sandboxActiveTab = SANDBOX_TABS[0].id;
  const prevScroll = content ? content.scrollTop : 0;

  rail.innerHTML = '';
  for (const tab of SANDBOX_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sbx-tab-btn' + (tab.id === sandboxActiveTab ? ' active' : '');
    btn.setAttribute('data-action', 'sandbox.tab');
    btn.setAttribute('data-tab', tab.id);
    btn.setAttribute('aria-pressed', tab.id === sandboxActiveTab ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'sbx-tab-icon';
    icon.textContent = tab.icon || '';
    const label = document.createElement('span');
    label.className = 'sbx-tab-label';
    label.textContent = tab.label;
    btn.appendChild(icon);
    btn.appendChild(label);
    rail.appendChild(btn);
  }

  panes.innerHTML = '';
  renderSandboxTabPanes(panes);
  renderSandboxSummaryStrip();

  if (content) content.scrollTop = prevScroll;
}

// Phase 6 (polish): a persistent readout — roommate count, house quality,
// active difficulty preset (or "Custom") — shown regardless of which tab is
// active. Cheap: recomputed from pendingSandboxConfig on every render, never
// its own stored state.
function renderSandboxSummaryStrip() {
  const el = document.getElementById('sandbox-summary-strip');
  if (!el) return;
  const cfg = pendingSandboxConfig;
  if (!cfg) { el.textContent = ''; return; }
  const q = sandboxQualityPreview(cfg);
  const activePreset = sandboxActiveDifficultyPreset();
  const presetLabel = activePreset ? activePreset.charAt(0).toUpperCase() + activePreset.slice(1) : 'Custom';
  el.textContent = `${cfg.roommates.length}/7 roommates · House ${Math.round(q * 100)}% — ${sandboxQualityLabel(q)} · ${presetLabel}`;
}

function renderSandboxTabPanes(panes) {
  const tab = SANDBOX_TABS.find((t) => t.id === sandboxActiveTab);
  const strip = document.getElementById('sandbox-subtab-strip');
  if (!tab) return;

  if (tab.subtabs && tab.subtabs.length) {
    if (!sandboxActiveSubtab[tab.id] || !tab.subtabs.some((s) => s.id === sandboxActiveSubtab[tab.id])) {
      sandboxActiveSubtab[tab.id] = tab.subtabs[0].id;
    }
    if (strip) {
      strip.hidden = false;
      strip.innerHTML = '';
      for (const sub of tab.subtabs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sbx-subtab-btn' + (sub.id === sandboxActiveSubtab[tab.id] ? ' active' : '');
        btn.setAttribute('data-action', 'sandbox.subtab');
        btn.setAttribute('data-tab', sub.id);
        btn.textContent = sub.label;
        strip.appendChild(btn);
      }
    }
    const sub = tab.subtabs.find((s) => s.id === sandboxActiveSubtab[tab.id]) || tab.subtabs[0];
    // Phase 2 (D5): House's two sub-tabs are bespoke content (the preset/
    // structural rows and the per-facility list), not the generic row
    // system — SANDBOX_TABS.house.subtabs[].sections stay empty stubs.
    if (tab.id === 'house') {
      const cfg = pendingSandboxConfig;
      panes.appendChild(sub.id === 'facilities' ? renderSandboxHouseFacilities(cfg) : renderSandboxHouseLayout(cfg));
      return;
    }
    renderSandboxSections(panes, sub.sections, tab.icon);
    return;
  }

  // Bespoke content (D5): Player and Roommates aren't a list of rows.
  if (tab.id === 'player') {
    if (strip) { strip.hidden = true; strip.innerHTML = ''; }
    panes.appendChild(renderSandboxPlayerPane(pendingSandboxConfig));
    return;
  }
  if (tab.dynamicInstances) {
    // Phase 5 (D3/D4): Roommates' sub-tabs are PER-INSTANCE, not a static
    // array on the tab entry — renderSandboxRoommatesPane owns the strip
    // itself (shown only once a roommate is selected off the rail) rather
    // than the static-subtabs branch above.
    renderSandboxRoommatesPane(panes, strip, pendingSandboxConfig);
    return;
  }

  if (strip) { strip.hidden = true; strip.innerHTML = ''; }
  renderSandboxSections(panes, tab.sections, tab.icon);
}

// Sandbox Pre-Game Editor Overhaul Phase 3 (D2): the Player tab's content —
// a summary row + the existing Design button, relocated unchanged in logic
// from the pre-overhaul screen (openSandboxPlayerStudio, studio.js). Bespoke
// (D5): one row, no generic row shape needed.
function renderSandboxPlayerPane(cfg) {
  const frag = document.createDocumentFragment();
  const playerName = cfg.player && (cfg.player.name || cfg.player.surname)
    ? `${cfg.player.name || '(rolled)'}${cfg.player.surname ? ' ' + cfg.player.surname : ''}`
    : 'Rolled for you';
  const playerRow = sandboxRowEl('You', 'Design who you play as. Every field you leave blank is rolled.');
  const playerVal = document.createElement('div');
  playerVal.className = 'menu-option-value';
  playerVal.textContent = playerName;
  playerRow.appendChild(playerVal);
  playerRow.appendChild(sbxActionBtn('Design', 'sandbox.player-design'));
  frag.appendChild(playerRow);
  return frag;
}

// Sandbox Pre-Game Editor Overhaul Phase 5 (D3/D4): the per-roommate
// sub-tab table. NOT part of SANDBOX_TABS (D4's note) because it applies
// once per cfg.roommates[i], not once per screen — the same five panes are
// re-rendered against whichever roommate is currently selected. Content is
// bespoke (renderSandboxRoommateSubtabContent's dispatch below), not a
// `sections`/`rows` array — this table only drives the strip.
const SANDBOX_ROOMMATE_SUBTABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'personality', label: 'Personality' },
  { id: 'interests', label: 'Interests & Values' },
  { id: 'backstory', label: 'Backstory' },
  { id: 'placement', label: 'Placement & Prose' },
];

// Roommates' top-level content: the rail (sandboxActiveRoommate === null) or
// a selected roommate's sub-tab strip + content. Owns the shared subtab
// strip element itself (unlike House's static subtabs, handled one level up
// in renderSandboxTabPanes) because whether the strip shows at all depends
// on instance selection, not just which top-level tab is active.
function renderSandboxRoommatesPane(panes, strip, cfg) {
  const roommates = cfg.roommates || [];
  // Phase 5 top-of-phase blocker (D12): if the roommate this index pointed
  // at was removed or reordered away, fall back to the rail rather than
  // silently showing whoever now occupies the old index.
  if (sandboxActiveRoommate !== null && (sandboxActiveRoommate < 0 || sandboxActiveRoommate >= roommates.length)) {
    sandboxActiveRoommate = null;
  }

  if (sandboxActiveRoommate === null) {
    if (strip) { strip.hidden = true; strip.innerHTML = ''; }
    panes.appendChild(renderSandboxRoommateRail(cfg));
    return;
  }

  if (strip) {
    strip.hidden = false;
    strip.innerHTML = '';
    if (!SANDBOX_ROOMMATE_SUBTABS.some((s) => s.id === sandboxRoommateSubtab)) sandboxRoommateSubtab = SANDBOX_ROOMMATE_SUBTABS[0].id;
    for (const sub of SANDBOX_ROOMMATE_SUBTABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sbx-subtab-btn' + (sub.id === sandboxRoommateSubtab ? ' active' : '');
      btn.setAttribute('data-action', 'sandbox.roommate-subtab');
      btn.setAttribute('data-tab', sub.id);
      btn.textContent = sub.label;
      strip.appendChild(btn);
    }
  }

  const i = sandboxActiveRoommate;
  const r = roommates[i];
  panes.appendChild(renderSandboxRoommateDetailHead(r, i, cfg));
  panes.appendChild(renderSandboxRoommateSubtabContent(sandboxRoommateSubtab, r, i, cfg));
}

// The rail: a vertical list of compact cards (name/summary/reorder/remove),
// replacing the old always-expandable accordion. Clicking a card's name/
// summary opens its five sub-tabs (renderSandboxRoommatesPane above); the
// reorder/remove controls stay here since D3's rail is where they belong.
function renderSandboxRoommateRail(cfg) {
  const frag = document.createDocumentFragment();
  frag.appendChild(sandboxSectionTitle(`Roommates (${cfg.roommates.length}/7)`));
  const addRow = sandboxRowEl('Add a roommate', 'Identity, appearance and room — authored outright. Each roommate costs one AI prose call at start unless you flip their Prose toggle.');
  const addBtn = sbxActionBtn('+ Add', 'sandbox.roommate-add');
  addBtn.disabled = cfg.roommates.length >= 7;
  addRow.appendChild(addBtn);
  frag.appendChild(addRow);
  if (cfg.roommates.length === 0) {
    frag.appendChild(sandboxSectionHint('No roommates yet — the apartment starts empty, exactly like a solo run.'));
  }
  cfg.roommates.forEach((r, i) => frag.appendChild(renderSandboxRoommateRailCard(r, i, cfg)));
  return frag;
}

function renderSandboxRoommateRailCard(r, i, cfg) {
  const card = document.createElement('div');
  card.className = 'sbx-roommate-rail-card';
  card.setAttribute('data-sbx-index', i);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'sbx-roommate-rail-open';
  open.setAttribute('data-action', 'sandbox.roommate-select');
  open.setAttribute('data-index', i);
  const nm = document.createElement('div');
  nm.className = 'sbx-card-name';
  nm.textContent = `Roommate ${i + 1}`;
  const sub = document.createElement('div');
  sub.className = 'sbx-card-sub';
  sub.textContent = sbxRoommateSub(r, i, cfg);
  open.appendChild(nm);
  open.appendChild(sub);
  // D11: .sbx-badge/.sbx-badge-on wired to a real at-a-glance chip — the
  // authored occupation category, shown only once actually authored (an
  // empty rail shouldn't carry a chip for every rolled field).
  if (r.partial?.occupationCategory) {
    const badges = document.createElement('div');
    badges.className = 'sbx-badges';
    const chip = document.createElement('span');
    chip.className = 'sbx-badge sbx-badge-on';
    chip.textContent = r.partial.occupationCategory;
    badges.appendChild(chip);
    open.appendChild(badges);
  }
  card.appendChild(open);

  const btns = document.createElement('div');
  btns.className = 'sbx-card-btns';
  if (i > 0) {
    const up = document.createElement('button');
    up.className = 'sbx-btn';
    up.setAttribute('data-action', 'sandbox.roommate-move');
    up.setAttribute('data-index', i);
    up.setAttribute('data-direction', '-1');
    up.textContent = '▲';
    btns.appendChild(up);
  }
  if (i < cfg.roommates.length - 1) {
    const down = document.createElement('button');
    down.className = 'sbx-btn';
    down.setAttribute('data-action', 'sandbox.roommate-move');
    down.setAttribute('data-index', i);
    down.setAttribute('data-direction', '1');
    down.textContent = '▼';
    btns.appendChild(down);
  }
  const del = document.createElement('button');
  del.className = 'sbx-btn sbx-btn-danger';
  del.setAttribute('data-action', 'sandbox.roommate-remove');
  del.setAttribute('data-index', i);
  del.textContent = '✕';
  btns.appendChild(del);
  card.appendChild(btns);

  return card;
}

// The detail header shown above a selected roommate's sub-tabs: a way back
// to the rail plus the same name/summary line the rail card shows (kept in
// sync live by sandboxRefreshRoommateSubline, called from the roommate-form
// field handler below).
function renderSandboxRoommateDetailHead(r, i, cfg) {
  const row = document.createElement('div');
  row.className = 'sbx-roommate-detail-head';
  row.appendChild(sbxActionBtn('← All roommates', 'sandbox.roommate-select', { index: -1 }));
  const info = document.createElement('div');
  const nm = document.createElement('div');
  nm.className = 'sbx-card-name';
  nm.textContent = `Roommate ${i + 1}`;
  const sub = document.createElement('div');
  sub.className = 'sbx-card-sub';
  sub.textContent = sbxRoommateSub(r, i, cfg);
  info.appendChild(nm);
  info.appendChild(sub);
  row.appendChild(info);
  return row;
}

// Live-patches whichever visible summary line describes roommate `idx` (the
// rail card's, the detail header's, or both if somehow present) — mirrors
// the temperament-slider readout pattern rather than forcing a full
// re-render on every keystroke in a name field.
function sandboxRefreshRoommateSubline(r, idx) {
  const railSub = document.querySelector(`.sbx-roommate-rail-card[data-sbx-index="${idx}"] .sbx-card-sub`);
  if (railSub) railSub.textContent = sbxRoommateSub(r, idx, pendingSandboxConfig);
  if (sandboxActiveRoommate === idx) {
    const detailSub = document.querySelector('.sbx-roommate-detail-head .sbx-card-sub');
    if (detailSub) detailSub.textContent = sbxRoommateSub(r, idx, pendingSandboxConfig);
  }
}

// D3's five sub-tabs, split out of the old flat buildSandboxRoommateForm.
// Every field keeps its exact partial.<path> write target — this is a
// re-grouping of existing controls into named panes, not a new field set.
function renderSandboxRoommateSubtabContent(subId, r, i, cfg) {
  if (subId === 'personality') return renderSandboxRoommatePersonality(r, i);
  if (subId === 'interests') return renderSandboxRoommateInterests(r, i);
  if (subId === 'backstory') return renderSandboxRoommateBackstory(r, i);
  if (subId === 'placement') return renderSandboxRoommatePlacement(r, i, cfg);
  return renderSandboxRoommateIdentity(r, i);
}

function renderSandboxRoommateIdentity(r, i) {
  const form = document.createElement('div');
  form.className = 'sbx-form';
  const partial = r.partial = r.partial || {};

  form.appendChild(sbxField('First name', sbxTextControl(`${i}|name`, partial.name, 'Rolled if blank')));
  form.appendChild(sbxField('Age', sbxNumberControl(`${i}|age`, partial.age, 'Roll')));
  form.appendChild(sbxField('Gender', sbxSelectControl(`${i}|gender`, Object.keys(CHAR_GEN.genderWeights), partial.gender, 'Roll')));
  const speciesEnum = (CHARACTER_SCHEMA.bible.species.enum) || ['human'];
  form.appendChild(sbxField('Species', sbxSelectControl(`${i}|species`, speciesEnum, partial.species, 'Roll')));
  const occCats = [...new Set(OCCUPATION_POOL.map(o => o.category))];
  form.appendChild(sbxField('Occupation', sbxSelectControl(`${i}|occupationCategory`, occCats, partial.occupationCategory, 'Roll')));

  // Appearance studio entry.
  const pickers = document.createElement('div');
  pickers.className = 'sbx-field sbx-full';
  const pickRow = document.createElement('div');
  pickRow.className = 'sbx-row';
  const design = document.createElement('button');
  design.className = 'sbx-btn sbx-btn-accent';
  design.setAttribute('data-action', 'sandbox.roommate-design');
  design.setAttribute('data-index', i);
  design.textContent = 'Design appearance';
  const appearanceNote = document.createElement('span');
  appearanceNote.className = 'sbx-skip-hint';
  const authoredCount = partial.physical ? Object.keys(partial.physical).length : 0;
  appearanceNote.textContent = authoredCount > 0
    ? 'You authored their looks — prose will default to templated.'
    : 'Nothing authored — their looks are rolled.';
  pickRow.appendChild(design);
  pickRow.appendChild(appearanceNote);
  pickers.appendChild(pickRow);
  form.appendChild(pickers);

  return form;
}

function renderSandboxRoommatePersonality(r, i) {
  const form = document.createElement('div');
  form.className = 'sbx-form';
  const partial = r.partial = r.partial || {};

  for (const axis of ['warmth', 'volatility', 'openness', 'conscientiousness', 'assertiveness']) {
    const cur = partial.temperament?.[axis];
    const row = document.createElement('div');
    row.className = 'sbx-row';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = -1; slider.max = 1; slider.step = 0.1;
    slider.className = 'sbx-control sbx-slider';
    slider.value = String(cur ?? 0);
    slider.setAttribute('data-sbx-field', `${i}|temperament.${axis}`);
    const val = document.createElement('span');
    val.className = 'sbx-slider-val';
    val.setAttribute('data-sbx-slider-val', `${i}|${axis}`);
    val.textContent = cur !== undefined ? cur.toFixed(1) : 'rolled';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'sbx-slider-reset';
    reset.title = 'Roll this axis';
    reset.textContent = '×';
    reset.setAttribute('data-sbx-field', `${i}|temperament.${axis}|reset`);
    row.appendChild(slider);
    row.appendChild(val);
    row.appendChild(reset);
    form.appendChild(sbxField(`Temperament — ${axis}`, row));
  }

  return form;
}

function renderSandboxRoommateInterests(r, i) {
  const form = document.createElement('div');
  form.className = 'sbx-form';
  const partial = r.partial = r.partial || {};

  const interests = partial.interests || [];
  for (let n = 0; n < 3; n++) {
    form.appendChild(sbxField(`Interest ${n + 1}`, sbxSelectControl(`${i}|interests.${n}`, INTEREST_POOL.map(x => x.name), interests[n] || '', 'Roll')));
  }
  const values = partial.values || [];
  for (let n = 0; n < 2; n++) {
    form.appendChild(sbxField(`Value ${n + 1}`, sbxSelectControl(`${i}|values.${n}`, VALUES_POOL.map(v => v.name), values[n] || '', 'Roll')));
  }

  return form;
}

function renderSandboxRoommateBackstory(r, i) {
  const form = document.createElement('div');
  form.className = 'sbx-form';
  const partial = r.partial = r.partial || {};

  form.appendChild(sbxField('Baggage', sbxSelectControl(`${i}|baggage`, BAGGAGE_POOL, partial.baggage, 'Roll')));
  form.appendChild(sbxField('Wound', sbxSelectControl(`${i}|wound`, WOUND_POOL, partial.wound, 'Roll')));
  form.appendChild(sbxField('Want', sbxSelectControl(`${i}|want`, WANT_POOL, partial.want, 'Roll')));
  form.appendChild(sbxField('Blind spot', sbxSelectControl(`${i}|blindSpot`, BLINDSPOT_POOL, partial.blindSpot, 'Roll')));
  form.appendChild(sbxField('Boundary', sbxSelectControl(`${i}|boundary`, BOUNDARY_POOL.map(b => b.text), partial.boundary, 'Roll')));

  return form;
}

function renderSandboxRoommatePlacement(r, i, cfg) {
  const form = document.createElement('div');
  form.className = 'sbx-form';

  // Room + bed. Bed options beyond the room's tier capacity are disabled;
  // already-taken beds are too. The room change resets the bed to "first
  // free" so the started game's moveToRoom pass (applySandboxPreset step 5)
  // can never double-book.
  const bedroomIds = sandboxBedroomIds(cfg.house && cfg.house.structural);
  const roomOptions = [{ value: '', label: 'First free room' }];
  for (const id of bedroomIds) {
    const cap = sandboxRoomCapacity(cfg, id);
    const claims = (pendingSandboxConfig.roommates || []).filter((rr, ii) => ii !== i && rr.residency?.room === id).length;
    roomOptions.push({ value: id, label: `${ROOMS[id].name} (${claims}/${cap})`, disabled: claims >= cap });
  }
  form.appendChild(sbxField('Room', sbxSelectControl(`${i}|room`, roomOptions, r.residency?.room || '', ''), true));

  const taken = r.residency?.room ? sandboxClaimedBeds(r.residency.room, i) : [];
  const bedOptions = [
    { value: '', label: 'First free bed' },
    { value: 'A', label: `Bed A${taken.includes('A') ? ' (taken)' : ''}`, disabled: taken.includes('A') },
    { value: 'B', label: `Bed B${taken.includes('B') ? ' (taken)' : ''}`, disabled: taken.includes('B') },
  ];
  form.appendChild(sbxField('Bed', sbxSelectControl(`${i}|bed`, bedOptions, r.residency?.bed || '', ''), true));

  // The Prose templated/AI-written toggle — moved here from card level (D3).
  const skipRow = document.createElement('div');
  skipRow.className = 'sbx-skip-row sbx-full';
  const skipLabel = document.createElement('span');
  skipLabel.className = 'sbx-skip-label';
  skipLabel.textContent = 'Prose';
  const skipHint = document.createElement('span');
  skipHint.className = 'sbx-skip-hint';
  const effective = roommateEffectiveSkipProse(r);
  skipHint.textContent = effective
    ? 'Templated, instant — no AI call at start.'
    : 'AI-written flavour prose — one call per roommate at start.';
  const skipToggle = document.createElement('button');
  skipToggle.className = 'sbx-btn' + (effective ? ' sbx-btn-accent' : '');
  skipToggle.setAttribute('data-action', 'sandbox.roommate-skip');
  skipToggle.setAttribute('data-index', i);
  skipToggle.textContent = effective ? 'Templated' : 'AI-written';
  skipRow.appendChild(skipLabel);
  skipRow.appendChild(skipHint);
  skipRow.appendChild(skipToggle);
  form.appendChild(skipRow);

  return form;
}

function renderSandboxSections(panes, sections, icon) {
  if (!sections || sections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sbx-empty';
    const iconEl = document.createElement('div');
    iconEl.className = 'sbx-empty-icon';
    iconEl.textContent = icon || '🧭';
    const p = document.createElement('p');
    p.textContent = 'Nothing here yet — this tab arrives in a later phase.';
    empty.appendChild(iconEl);
    empty.appendChild(p);
    panes.appendChild(empty);
    return;
  }
  for (const section of sections) {
    const secEl = document.createElement('div');
    secEl.className = 'sbx-section-wrap';
    if (section.title) secEl.appendChild(sandboxSectionTitle(section.title));
    const rows = section.rows || [];
    if (!rows.length) {
      secEl.appendChild(sandboxSectionHint(section.emptyText || 'Nothing here yet.'));
      panes.appendChild(secEl);
      continue;
    }
    if (section.desc) secEl.appendChild(sandboxSectionHint(section.desc));
    for (const row of rows) secEl.appendChild(renderSandboxRow(row));
    panes.appendChild(secEl);
  }
}

// Row kinds: text/number/select adapt the existing bespoke sbx*Controls
// (D5) with the generic bare dot-path field contract (getSandboxValue/
// setSandboxValue below); toggle/button reuse sbxActionBtn exactly as the
// house preset/structural rows already do. slider is new (D5) — a single
// labeled range input with a live readout, no reset button (unlike the
// per-axis temperament sliders, which keep their bespoke ×-reset markup).
function renderSandboxRow(row) {
  const el = sandboxRowEl(row.label, row.desc);
  el.appendChild(renderSandboxRowControl(row));
  return el;
}

function renderSandboxRowControl(row) {
  if (row.kind === 'slider') return renderSandboxSliderRow(row);
  if (row.kind === 'presetRow') return renderSandboxPresetRow(row);
  if (row.kind === 'toggle') {
    const on = !!getSandboxValue(row.field);
    return sbxActionBtn(on ? 'On' : 'Off', 'sandbox.row-toggle', { field: row.field }, on ? 'sbx-btn-accent' : '');
  }
  if (row.kind === 'button') {
    return sbxActionBtn(row.buttonLabel || row.label, row.action, row.field ? { field: row.field } : {}, row.danger ? 'sbx-btn-danger' : '');
  }
  if (row.kind === 'text') return sbxTextControl(row.field, getSandboxValue(row.field), row.placeholder);
  if (row.kind === 'number') return sbxGenericNumberControl(row.field, getSandboxValue(row.field), row);
  if (row.kind === 'select') return sbxSelectControl(row.field, row.options || [], getSandboxValue(row.field), row.emptyLabel);
  // Unknown/unbuilt kind ('sliders' — no concrete row needs the proportional
  // grid anywhere in this plan) — a quiet placeholder, never a control that
  // looks wired but does nothing (mirrors renderSettingsControl's own
  // fallback below).
  const span = document.createElement('span');
  span.className = 'sbx-row-placeholder';
  span.textContent = '—';
  return span;
}

function renderSandboxSliderRow(row) {
  const wrap = document.createElement('div');
  wrap.className = 'sbx-row';
  const value = getSandboxValue(row.field);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = row.min ?? 0;
  slider.max = row.max ?? 100;
  if (row.step !== undefined) slider.step = row.step;
  slider.className = 'sbx-control sbx-slider';
  slider.value = Number.isFinite(value) ? value : (row.min ?? 0);
  slider.setAttribute('data-sbx-field', row.field);
  const val = document.createElement('span');
  val.className = 'sbx-slider-val';
  val.setAttribute('data-sbx-row-readout', row.field);
  val.textContent = String(slider.value);
  wrap.appendChild(slider);
  wrap.appendChild(val);
  return wrap;
}

// Sandbox Pre-Game Editor Overhaul Phase 4 (D7/D8): the difficulty preset
// row — a tag/button choice over SANDBOX_DIFFICULTY_PRESETS, styled like
// the existing house-preset row (.sbx-preset-row, reused as-is). Not a form
// field: clicking a tag stamps every field in that preset at once
// (doSandboxDifficultyPreset) rather than writing through data-sbx-field.
// The active tag is a live readout (sandboxActiveDifficultyPreset, D8) —
// "Custom" is never a button, only what shows when nothing matches.
function renderSandboxPresetRow(row) {
  const wrap = document.createElement('div');
  // The marker class is what refreshSandboxPresetRow targets. It is NOT
  // .sbx-preset-row: the House Layout sub-tab's own starting-condition picker
  // reuses that class, so a bare '.sbx-preset-row' lookup matches whichever
  // renders first and would append a stray "Custom" chip to the house picker.
  wrap.className = 'sbx-row sbx-preset-row sbx-difficulty-row';
  const active = sandboxActiveDifficultyPreset();
  for (const id of Object.keys(SANDBOX_DIFFICULTY_PRESETS)) {
    const label = id.charAt(0).toUpperCase() + id.slice(1);
    wrap.appendChild(sbxActionBtn(label, 'sandbox.difficulty-preset', { id }, id === active ? 'sbx-btn-accent' : ''));
  }
  if (!active) {
    const custom = document.createElement('span');
    custom.className = 'sbx-slider-val';
    custom.textContent = 'Custom';
    wrap.appendChild(custom);
  }
  return wrap;
}

// D8: cfg.economy matches a preset only if all four fields are byte-equal
// to it. Never stored — recomputed on every render, the same non-stored-
// derivation discipline SANDBOX_HOUSE_PRESETS' own wreck/lived_in/restored
// already keep relative to cfg.house.facilities' override map.
function sandboxActiveDifficultyPreset() {
  const econ = pendingSandboxConfig && pendingSandboxConfig.economy;
  if (!econ) return null;
  for (const [id, preset] of Object.entries(SANDBOX_DIFFICULTY_PRESETS)) {
    if (preset.money === econ.money && preset.rentGraceDays === econ.rentGraceDays &&
        preset.billsStartDay === econ.billsStartDay && preset.taxReserve === econ.taxReserve) {
      return id;
    }
  }
  return null;
}

// Patches the preset row's active button + "Custom" readout in place —
// never rebuilds, so an in-progress edit elsewhere on the pane keeps its
// focus (see the call site in wireSandboxConfigInputs above). A no-op
// (querySelector miss) whenever the Economy tab isn't the one on screen.
function refreshSandboxPresetRow() {
  const wrap = document.querySelector('.sbx-difficulty-row');
  if (!wrap) return;
  const active = sandboxActiveDifficultyPreset();
  for (const btn of wrap.querySelectorAll('button[data-action="sandbox.difficulty-preset"]')) {
    btn.classList.toggle('sbx-btn-accent', btn.getAttribute('data-id') === active);
  }
  let custom = wrap.querySelector('.sbx-slider-val');
  if (!active) {
    if (!custom) {
      custom = document.createElement('span');
      custom.className = 'sbx-slider-val';
      wrap.appendChild(custom);
    }
    custom.textContent = 'Custom';
  } else if (custom) {
    custom.remove();
  }
  renderSandboxSummaryStrip();
}

function doSandboxDifficultyPreset(id) {
  const preset = SANDBOX_DIFFICULTY_PRESETS[id];
  if (!preset || !pendingSandboxConfig) return;
  Object.assign(pendingSandboxConfig.economy, preset);
  renderSandboxUi();
}

function sbxGenericNumberControl(fieldPath, value, opts) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'sbx-control';
  if (opts && opts.min !== undefined) input.min = opts.min;
  if (opts && opts.max !== undefined) input.max = opts.max;
  input.value = value ?? '';
  input.setAttribute('data-sbx-field', fieldPath);
  return input;
}

// Bare dot-path reads/writes against pendingSandboxConfig directly — the
// generic row kinds' field contract (D5), distinct from the roommate
// partial's <index>|<path> convention wireSandboxConfigInputs also owns
// (it tells the two apart by the presence of '|' — a roommate index is
// never a dotted path, and a top-level cfg field never starts with a bare
// integer).
// F1 (Discord feedback, 2026-08-23): New Game's options screen (its own
// pendingNewGameOptions, not a Sandbox draft) reuses every bit of this row
// system by pointing sbxActiveTarget at it while its screen is open —
// null the rest of the time, which is exactly Sandbox's original behavior.
let sbxActiveTarget = null;

function getSandboxValue(field) {
  const target = sbxActiveTarget || pendingSandboxConfig;
  return field.split('.').reduce((cur, part) => (cur == null ? undefined : cur[part]), target);
}

function setSandboxValue(field, value) {
  const parts = field.split('.');
  const last = parts.pop();
  let obj = sbxActiveTarget || pendingSandboxConfig;
  for (const p of parts) { obj[p] = obj[p] || {}; obj = obj[p]; }
  obj[last] = value;
}

function doSandboxSubtab(subId) {
  const tab = SANDBOX_TABS.find((t) => t.id === sandboxActiveTab);
  if (!tab || !tab.subtabs || !tab.subtabs.some((s) => s.id === subId)) return;
  sandboxActiveSubtab[tab.id] = subId;
  renderSandboxUi();
}

function doSandboxRowToggle(field) {
  if (!field || !(sbxActiveTarget || pendingSandboxConfig)) return;
  setSandboxValue(field, !getSandboxValue(field));
  // F1: whichever screen actually owns sbxActiveTarget right now re-renders
  // itself — the two are mutually exclusive (never both open at once).
  (sbxActiveTarget ? renderNewGameOptionsUi : renderSandboxUi)();
}

// Dormant during the Sandbox Pre-Game Editor Overhaul migration (Phases
// 1-5): #sandbox-config-body no longer exists in the DOM (replaced by the
// tab shell's #sandbox-panes above), so every call below this guard is a
// no-op until the phase that owns each section — House (Phase 2), Player
// (Phase 3), Roommates (Phase 5) — migrates its content into the new shell
// and repoints its own trigger functions at a scoped re-render instead of
// this whole-screen rebuild. Left in place rather than deleted so nothing
// below (doSandboxHousePreset, doSandboxRoommateAdd, etc.) needs touching
// until its own phase.
function renderSandboxScreen() {
  const body = document.getElementById('sandbox-config-body');
  if (!body) return;
  const cfg = pendingSandboxConfig || (pendingSandboxConfig = defaultSandboxConfig());
  body.innerHTML = '';

  // Your player — the same studio the solo path uses, sandbox confirm.
  body.appendChild(sandboxSectionTitle('Your player'));
  body.appendChild(renderSandboxPlayerPane(cfg));

  // Roommates (B5, reshelled Phase 5): the rail is a reasonable stand-in for
  // this guaranteed-dead path (see the guard at the top of this function) —
  // a selected roommate's sub-tabs never show here regardless of
  // sandboxActiveRoommate, since nothing re-renders through this function
  // any more.
  body.appendChild(renderSandboxRoommateRail(cfg));

  // House — the B6 state editor.
  body.appendChild(sandboxSectionTitle('House'));
  body.appendChild(renderSandboxHousePanel(cfg));

  // Economy.
  body.appendChild(sandboxSectionTitle('Economy'));
  body.appendChild(sandboxSummaryRow('Starting money', `$${cfg.economy.money.toLocaleString()}`, 'Applied to your wallet on day 1.'));
}

function sandboxSectionTitle(text) {
  const h = document.createElement('div');
  h.className = 'sbx-section-title';
  h.textContent = text;
  return h;
}

function sandboxRowEl(name, desc) {
  const row = document.createElement('div');
  row.className = 'menu-option-row';
  const text = document.createElement('div');
  const nm = document.createElement('div');
  nm.className = 'menu-option-name';
  nm.textContent = name;
  const d = document.createElement('div');
  d.className = 'menu-option-desc';
  d.textContent = desc || '';
  text.appendChild(nm);
  text.appendChild(d);
  row.appendChild(text);
  return row;
}

function sandboxSummaryRow(name, value, desc) {
  const row = sandboxRowEl(name, desc);
  const val = document.createElement('div');
  val.className = 'menu-option-value';
  val.textContent = value;
  row.appendChild(val);
  return row;
}

// --- B6: house-state editor ---
// Three preset buttons (SANDBOX_HOUSE_PRESETS), the five structural toggles
// (STRUCTURAL_UPGRADES), and a per-facility tier/condition override list grouped
// by room — all rendered from the config tables, never retyped. The player sees
// the derived apartment quality live so a preset choice reads as a number before it
// becomes a state.

// The effective tier/condition a facility would start at, given the preset plus any
// per-facility override in cfg.house.facilities — the same derivation
// applySandboxPreset + normalizeUpgrades stamp into world.upgrades. "Empty
// deletes": an override key is removed when its control is cleared, so that
// presence in cfg.house.facilities IS the authored set.
function sandboxFacilityState(cfg, defId) {
  const custom = cfg?.house?.facilities?.[defId] || {};
  const preset = SANDBOX_HOUSE_PRESETS[cfg?.house?.preset];
  let tier, condition;
  if (custom.tier) tier = custom.tier;
  else if (preset && !preset.useStartingTiers) tier = preset.tier;
  else tier = FACILITY_STARTING_TIERS[defId] || 'broken';
  if (custom.condition !== undefined) condition = custom.condition;
  else if (preset && preset.condition !== undefined) condition = preset.condition;
  else condition = (tier === 'broken' ? 0 : MAINTENANCE.startingCondition);
  return { tier, condition };
}

function sandboxQualityLabel(q) {
  if (q < 0.25) return 'In disrepair';
  if (q < 0.5) return 'Run-down';
  if (q < 0.75) return 'Lived-in';
  return 'Restored';
}

// Live quality preview from cfg.house alone — feeds getApartmentQuality (sim.js)
// the upgrades a started game would hold, so the number seen here is the number
// on the moved-in day.
function sandboxQualityPreview(cfg) {
  const upgrades = {};
  for (const def of FACILITY_LIST) upgrades[def.id] = sandboxFacilityState(cfg, def.id);
  return getApartmentQuality({ world: { upgrades } });
}

// Sandbox Pre-Game Editor Overhaul Phase 2 (D6): House's Layout sub-tab —
// the starting-condition preset, the quality readout it (plus Facilities'
// overrides) drives, and the five structural toggles. Bespoke content (D5),
// not the generic row system — the preset/structural rows have a live
// cross-cutting side effect (feeding the roommate room picker in Phase 5)
// that the generic toggle kind isn't built for.
function renderSandboxHouseLayout(cfg) {
  const frag = document.createDocumentFragment();

  const q = sandboxQualityPreview(cfg);
  frag.appendChild(sandboxSummaryRow('Quality', `${Math.round(q * 100)}% — ${sandboxQualityLabel(q)}`, 'Live from the preset, the toggles and any overrides below.'));

  // Preset picker — the three SANDBOX_HOUSE_PRESETS.
  const presetRow = sandboxRowEl('Starting condition', 'Today\u2019s wreck, a lived-in flat, or the apartment already restored.');
  const presetBtns = document.createElement('div');
  presetBtns.className = 'sbx-row sbx-preset-row';
  for (const id of Object.keys(SANDBOX_HOUSE_PRESETS)) {
    presetBtns.appendChild(sbxActionBtn(id.replace(/_/g, ' '), 'sandbox.house-preset', { id }, cfg.house.preset === id ? 'sbx-btn-accent' : ''));
  }
  presetRow.appendChild(presetBtns);
  frag.appendChild(presetRow);

  // Structural upgrades — rendered from STRUCTURAL_UPGRADES, labels and
  // descriptions from the data. Toggling must feed the roommate room picker, so
  // doSandboxHouseStructural re-renders the whole shell (the B5/B6 link).
  frag.appendChild(sandboxSectionTitle('Structural upgrades'));
  for (const up of Object.values(STRUCTURAL_UPGRADES)) {
    const on = !!(cfg.house.structural && cfg.house.structural[up.id]);
    const row = sandboxRowEl(up.label, up.desc);
    row.appendChild(sbxActionBtn(on ? 'On' : 'Off', 'sandbox.house-structural', { id: up.id }, on ? 'sbx-btn-accent' : ''));
    frag.appendChild(row);
  }

  return frag;
}

// Phase 2 (D6): House's Facilities sub-tab — the per-room, per-facility
// tier+condition override list. Bespoke content (D5): one row per
// FACILITY_LIST entry grouped by ROOM_FACILITIES, not a generic row shape.
function renderSandboxHouseFacilities(cfg) {
  const frag = document.createDocumentFragment();
  frag.appendChild(sandboxSectionHint('Per-facility overrides beat the preset. "Preset default" restores a room to its preset tier.'));
  for (const roomId of Object.keys(ROOM_FACILITIES)) {
    const facIds = ROOM_FACILITIES[roomId];
    const roomName = ROOMS[roomId]?.name || roomId;
    let added = false;
    for (const defId of facIds) {
      const def = FACILITY_DEFS[defId];
      if (!def) continue;
      if (!added) { frag.appendChild(sandboxFacilityRoomLabel(roomName)); added = true; }
      frag.appendChild(renderSandboxFacilityRow(cfg, def));
    }
  }
  return frag;
}

// Dormant along with renderSandboxScreen (see the comment above it) — kept
// as a thin wrapper over the two Phase 2 split functions above so that
// dormant path never references a function that no longer exists.
function renderSandboxHousePanel(cfg) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderSandboxHouseLayout(cfg));
  frag.appendChild(sandboxSectionTitle('Facilities'));
  frag.appendChild(renderSandboxHouseFacilities(cfg));
  return frag;
}

function sandboxSectionHint(text) {
  const d = document.createElement('div');
  d.className = 'sbx-section-hint';
  d.textContent = text;
  return d;
}

function sandboxFacilityRoomLabel(name) {
  const d = document.createElement('div');
  d.className = 'sbx-facility-room';
  d.textContent = name;
  return d;
}

function renderSandboxFacilityRow(cfg, def) {
  const st = sandboxFacilityState(cfg, def.id);
  const row = sandboxRowEl(def.label, 'Tier + condition on moving day.');
  const ctl = document.createElement('div');
  ctl.className = 'sbx-facility-ctl';

  const tierSel = document.createElement('select');
  tierSel.className = 'sbx-control';
  tierSel.setAttribute('data-hse-field', `${def.id}|tier`);
  const presetOpt = document.createElement('option');
  presetOpt.value = '';
  presetOpt.textContent = 'Preset default';
  tierSel.appendChild(presetOpt);
  for (const t of def.tiers) {
    const opt = document.createElement('option');
    opt.value = t.tier;
    opt.textContent = t.label;
    tierSel.appendChild(opt);
  }
  tierSel.value = st.tier;

  const condInput = document.createElement('input');
  condInput.type = 'number';
  condInput.min = 0;
  condInput.max = 100;
  condInput.className = 'sbx-control sbx-cond';
  condInput.setAttribute('data-hse-field', `${def.id}|condition`);
  condInput.value = st.condition;

  ctl.appendChild(tierSel);
  ctl.appendChild(condInput);
  row.appendChild(ctl);
  return row;
}

function doSandboxHousePreset(id) {
  const cfg = pendingSandboxConfig || (pendingSandboxConfig = defaultSandboxConfig());
  if (SANDBOX_HOUSE_PRESETS[id]) cfg.house.preset = id;
  renderSandboxUi();
}

function doSandboxHouseStructural(id) {
  const cfg = pendingSandboxConfig || (pendingSandboxConfig = defaultSandboxConfig());
  if (!STRUCTURAL_UPGRADES[id]) return;
  cfg.house.structural = cfg.house.structural || {};
  if (cfg.house.structural[id]) delete cfg.house.structural[id];
  else cfg.house.structural[id] = true;
  // The B5/B6 link: the roommate room picker reads cfg.house.structural live,
  // so this re-render is what makes study↔bedroom appear/leave immediately.
  renderSandboxUi();
}

// A data-action button in the value slot of a sandbox row. `extra` becomes
// data-* attributes (data-index, data-direction...), collected by ui.js's
// global delegation exactly like every other action button in the game.
function sbxActionBtn(label, action, extra = {}, extraClass = '') {
  const btn = document.createElement('button');
  btn.className = 'title-btn menu-option-toggle' + (extraClass ? ` ${extraClass}` : '');
  btn.setAttribute('data-action', action);
  for (const [k, v] of Object.entries(extra)) btn.setAttribute(`data-${k}`, String(v));
  btn.textContent = label;
  return btn;
}

// The bedrooms a sandbox start can put someone in: every room whose live
// ROOMS type is 'bedroom' (the base-layout tables) plus the study once
// study_to_bedroom is set. Derived, never a hardcoded list — the started
// game's graph is the same derivation via applyStructuralUpgrades (D18), and
// the picker must agree with what a started game will hold. Never includes
// the player's own room (that spare bed is a partner moving in, not a
// roommate slot — findEmptyBed's ordering in computer.js).
function sandboxBedroomIds(structural) {
  const ids = Object.keys(ROOMS).filter(id => ROOMS[id].type === 'bedroom' && id !== 'bedroom_player');
  if (structural && structural.study_to_bedroom && !ids.includes('study')) ids.push('study');
  return ids;
}

// The facility tier a room's habitability would start at, given the house
// preset + custom overrides in cfg.house — the same derivation
// applySandboxPreset uses to stamp world.upgrades. B6's house panel feeds
// the same cfg, so this always reflects what a started game will hold.
function sandboxRoomTier(cfg, roomId) {
  const defId = (ROOM_FACILITIES[roomId] || [])[0];
  if (!defId || !FACILITY_DEFS[defId]) return null;
  const custom = cfg?.house?.facilities?.[defId];
  if (custom && custom.tier) return custom.tier;
  const preset = SANDBOX_HOUSE_PRESETS[cfg?.house?.preset];
  if (preset && !preset.useStartingTiers) return preset.tier;
  return FACILITY_STARTING_TIERS[defId] || 'broken';
}

// Bedroom capacity by tier (D16): the residentCapacity declared on the room's
// habitability facility, defaulting to 1 — the same arithmetic verify-sbx-p3
// asserts against a started state. In a wreck house every auxiliary bedroom
// is 'broken', so a sandbox holds at most one roommate per bedroom there; a
// restored house doubles every bed.
function sandboxRoomCapacity(cfg, roomId) {
  const defId = (ROOM_FACILITIES[roomId] || [])[0];
  const def = defId && FACILITY_DEFS[defId];
  const t = def && def.tiers && def.tiers.find(x => x.tier === sandboxRoomTier(cfg, roomId));
  return (t && t.residentCapacity) || 1;
}

// Beds already claimed in a room by OTHER roommates in the config.
function sandboxClaimedBeds(roomId, excludeIndex) {
  const cfg = pendingSandboxConfig;
  const taken = [];
  (cfg?.roommates || []).forEach((r, i) => {
    if (i === excludeIndex || !r?.residency) return;
    if (r.residency.room === roomId && r.residency.bed) taken.push(r.residency.bed);
  });
  return taken;
}

function sbxRoommateSub(r, i, cfg) {
  const p = r.partial || {};
  const bits = [];
  if (p.name) bits.push(p.name);
  if (p.gender) bits.push(studioPrettify(p.gender));
  if (Number.isFinite(p.age)) bits.push(`${p.age}yo`);
  const room = r.residency?.room;
  if (room) bits.push(ROOMS[room]?.name || room);
  if (bits.length === 0) return 'Unassigned identity — everything will be rolled.';
  return bits.join(' · ');
}

function sbxField(label, control, full) {
  const field = document.createElement('div');
  field.className = 'sbx-field' + (full ? ' sbx-full' : '');
  const lab = document.createElement('label');
  lab.className = 'sbx-label';
  lab.textContent = label;
  field.appendChild(lab);
  field.appendChild(control);
  return field;
}

function sbxTextControl(fieldPath, value, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sbx-control';
  input.maxLength = 60;
  input.placeholder = placeholder || '';
  input.value = value || '';
  input.setAttribute('data-sbx-field', fieldPath);
  return input;
}

function sbxNumberControl(fieldPath, value, placeholder) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'sbx-control';
  input.min = 18; input.max = 60;
  input.placeholder = placeholder || '';
  input.value = value ?? '';
  input.setAttribute('data-sbx-field', fieldPath);
  return input;
}

// options: strings, or { value, label, disabled }. The empty value is the
// standing "Roll it" promise — a cleared field deletes from the partial.
function sbxSelectControl(fieldPath, options, value, emptyLabel) {
  const sel = document.createElement('select');
  sel.className = 'sbx-control';
  sel.setAttribute('data-sbx-field', fieldPath);
  const rollOpt = document.createElement('option');
  rollOpt.value = '';
  rollOpt.textContent = emptyLabel || '—';
  sel.appendChild(rollOpt);
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = typeof o === 'object' ? o.value : o;
    opt.textContent = typeof o === 'object' ? o.label : o;
    if (typeof o === 'object' && o.disabled) opt.disabled = true;
    sel.appendChild(opt);
  }
  sel.value = value || '';
  return sel;
}

// --- Sandbox config form wiring ---
// Form controls report through change/input events on #sandbox-content (the
// tab shell's stable content wrapper — Overhaul Phase 1 retargeted this from
// the old #sandbox-config-body), not through ui.js's data-action click
// chain (the same split the studio documents). Each roommate-form control
// carries data-sbx-field="<index>|<path>"; the path names the partial key,
// with the <axis>|<index> conventions the temperaments/interests/values use
// below. A bare dot-path with no index prefix (e.g. "economy.money") is the
// generic row kinds' contract instead (getSandboxValue/setSandboxValue).
// F1 (Discord feedback, 2026-08-23): extracted from wireSandboxConfigInputs
// so New Game's options screen (wireNewGameOptionsInputs) can wire the same
// bare-dot-path row logic onto its own container instead of a second copy.
// The roommate-indexed branch below (attr.includes('|')) is unreachable
// from New Game — its rows never emit that shape — so it's left untouched,
// still targeting pendingSandboxConfig.roommates directly rather than
// sbxActiveTarget.
function handleSandboxFieldEvent(e) {
    const el = e.target;
    const attr = el.getAttribute?.('data-sbx-field');
    // sbxActiveTarget (set only while New Game's options screen is open)
    // redirects getSandboxValue/setSandboxValue below at Sandbox itself —
    // see those functions' own comment.
    const target = sbxActiveTarget || pendingSandboxConfig;
    if (!attr || !target) return;
    // Phase 1 (D5): a bare dot-path with no roommate-index prefix targets
    // pendingSandboxConfig directly — the generic toggle/slider/number/
    // select row kinds' write path (getSandboxValue/setSandboxValue above).
    if (!attr.includes('|')) {
      const isNumeric = el.type === 'range' || el.type === 'number';
      let v;
      if (isNumeric) {
        // A half-typed or cleared number box is NOT a value. Number('') is 0,
        // so writing through unguarded would silently stamp 0 into the config
        // while the field still LOOKS empty — and for economy.money that 0
        // reaches player.money verbatim (applySandboxPreset step 6). Mid-edit
        // ('input') we leave the config alone; once the edit settles
        // ('change', which fires on blur) we repaint the box from the config
        // so the field and the config can never disagree.
        if (el.value === '') {
          if (e.type === 'change') el.value = getSandboxValue(attr) ?? '';
          return;
        }
        const n = Number(el.value);
        if (!Number.isFinite(n)) return;
        // Clamp to the row's own declared bounds. min/max are read off the
        // element (where the row config already wrote them) rather than
        // re-looked-up from SANDBOX_TABS, so there is one source of truth for
        // a row's range. Typing into a number input bypasses min/max entirely
        // — they only constrain the spinner — so without this an authored
        // -5000 tax reserve or a nine-digit balance reaches the started game.
        const lo = el.min === '' ? -Infinity : Number(el.min);
        const hi = el.max === '' ? Infinity : Number(el.max);
        v = clamp(n, lo, hi);
        if (v !== n && e.type === 'change') el.value = v;
      } else {
        v = el.value;
      }
      setSandboxValue(attr, v);
      const readout = document.querySelector(`[data-sbx-row-readout="${CSS.escape(attr)}"]`);
      if (readout) readout.textContent = String(v);
      // Phase 4 (D8): an economy field edited by hand may have just walked
      // cfg.economy away from (or into) a difficulty preset — patch the
      // preset row's active state in place rather than re-rendering the
      // whole pane, which would drop focus from whatever input the player
      // is still typing in (same reasoning as Settings' 'text' row kind).
      refreshSandboxPresetRow();
      return;
    }
    if (!pendingSandboxConfig) return; // this branch always targets Sandbox's own config
    const parts = attr.split('|');
    const idx = Number(parts[0]);
    const fieldPath = parts[1];
    const resetFlag = parts[2];
    const r = pendingSandboxConfig.roommates?.[idx];
    if (!r) return;

    if (resetFlag === 'reset') {
      delete r.partial.temperament?.[fieldPath];
      renderSandboxUi();
      return;
    }

    const v = el.value;
    if (fieldPath === 'name') {
      const trimmed = v.trim();
      if (trimmed) r.partial.name = trimmed; else delete r.partial.name;
      sandboxRefreshRoommateSubline(r, idx);
      return;
    }
    if (fieldPath === 'age') {
      const n = parseInt(v, 10);
      if (v === '') delete r.partial.age;
      else if (Number.isFinite(n)) r.partial.age = clamp(n, 18, 60);
      return;
    }
    if (fieldPath.startsWith('temperament.')) {
      const axis = fieldPath.slice('temperament.'.length);
      r.partial.temperament = r.partial.temperament || {};
      const n = parseFloat(v);
      if (!Number.isFinite(n)) delete r.partial.temperament[axis];
      else r.partial.temperament[axis] = clamp(n, -1, 1);
      const valEl = document.querySelector(`[data-sbx-slider-val="${idx}|${axis}"]`);
      if (valEl) valEl.textContent = n.toFixed(1);
      return;
    }
    if (fieldPath.startsWith('interests.')) { sbxWriteMultiSelect(r, 'interests', idx); return; }
    if (fieldPath.startsWith('values.')) { sbxWriteMultiSelect(r, 'values', idx); return; }
    if (fieldPath === 'gender' || fieldPath === 'species' || fieldPath === 'occupationCategory' ||
        fieldPath === 'baggage' || fieldPath === 'wound' || fieldPath === 'want' ||
        fieldPath === 'blindSpot' || fieldPath === 'boundary') {
      if (v) r.partial[fieldPath] = v; else delete r.partial[fieldPath];
      sandboxRefreshRoommateSubline(r, idx);
      return;
    }
    if (fieldPath === 'room') {
      r.residency = r.residency || {};
      r.residency.room = v || null;
      r.residency.bed = null;
      renderSandboxUi();
      return;
    }
    if (fieldPath === 'bed') {
      r.residency = r.residency || {};
      r.residency.bed = v || null;
      renderSandboxUi();
      return;
    }
}

function wireSandboxConfigInputs() {
  // Sandbox Pre-Game Editor Overhaul Phase 1: retargeted from the old
  // #sandbox-config-body (removed with the single-scroll layout) to the new
  // shell's stable content wrapper — panes rebuild on every tab switch,
  // #sandbox-content does not, so the delegation survives re-renders.
  const root = document.getElementById('sandbox-content');
  if (!root || root.hasAttribute('data-sbx-wired')) return;
  root.setAttribute('data-sbx-wired', '');

  root.addEventListener('change', handleSandboxFieldEvent);
  root.addEventListener('input', (e) => {
    if (e.target?.getAttribute?.('data-sbx-field')) handleSandboxFieldEvent(e);
  });

  // B6: house-state editor wiring — one table walked the same way. A facility
  // override lives under cfg.house.facilities[<defId>]; "empty deletes",
  // so presence = authored (mirrors the roommate partial contract).
  root.addEventListener('change', (e) => {
    const el = e.target;
    const attr = el.getAttribute?.('data-hse-field');
    if (!attr || !pendingSandboxConfig) return;
    const parts = attr.split('|');
    const [defId, kind] = parts;
    if (!FACILITY_DEFS[defId]) return;
    const cur = pendingSandboxConfig.house.facilities[defId] || {};
    if (kind === 'tier') {
      if (el.value) cur.tier = el.value; else delete cur.tier;
    } else if (kind === 'condition') {
      if (el.value === '') delete cur.condition;
      else cur.condition = clamp(Number(el.value), 0, 100);
    }
    if (Object.keys(cur).length) pendingSandboxConfig.house.facilities[defId] = cur;
    else delete pendingSandboxConfig.house.facilities[defId];
    if (kind === 'tier') renderSandboxUi(); // refresh quality + bedroom capacities
  });
}

// F1 (Discord feedback, 2026-08-23): New Game's options screen reuses
// handleSandboxFieldEvent on its own container — only the bare-dot-path
// branch is reachable here (its rows never emit the roommate-indexed
// 'idx|path' shape), and that branch is already target-aware via
// sbxActiveTarget.
function wireNewGameOptionsInputs() {
  const root = document.getElementById('newgame-options-content');
  if (!root || root.hasAttribute('data-sbx-wired')) return;
  root.setAttribute('data-sbx-wired', '');
  root.addEventListener('change', handleSandboxFieldEvent);
  root.addEventListener('input', (e) => {
    if (e.target?.getAttribute?.('data-sbx-field')) handleSandboxFieldEvent(e);
  });
}

// Read every sibling <select> of one group (interests.0/1/2, values.0/1)
// into the partial as the authored list. Values need BOTH picks — a single
// value alone cannot author a pair, so it rolls both.
function sbxWriteMultiSelect(r, key, idx) {
  const selects = [...document.querySelectorAll(`[data-sbx-field^="${idx}|${key}."]`)];
  const values = selects.map(s => s.value).filter(Boolean);
  if (key === 'values') {
    if (values.length === 2) r.partial.values = values;
    else delete r.partial.values;
  } else {
    if (values.length > 0) r.partial.interests = values;
    else delete r.partial.interests;
  }
}

// --- Sandbox roommate actions ---
function doSandboxRoommateAdd() {
  const cfg = pendingSandboxConfig || (pendingSandboxConfig = defaultSandboxConfig());
  if (!Array.isArray(cfg.roommates)) cfg.roommates = [];
  if (cfg.roommates.length >= 7) return;
  cfg.roommates.push({
    partial: {},
    authoredFields: [],
    residency: { room: null, bed: null },
    relPlayer: null,
    // null = auto (D21): skipProse turns on once the appearance is authored,
    // stays off for a fully rolled roommate. The Prose toggle commits an
    // explicit boolean on first click.
    skipProse: null,
  });
  // Phase 5: jump straight into the new roommate's Identity sub-tab, same
  // as the old accordion auto-expanding the slot you just added.
  sandboxActiveRoommate = cfg.roommates.length - 1;
  sandboxRoommateSubtab = 'identity';
  renderSandboxUi();
}

function doSandboxRoommateRemove(index) {
  const cfg = pendingSandboxConfig;
  if (!cfg || !Array.isArray(cfg.roommates)) return;
  if (index < 0 || index >= cfg.roommates.length) return;
  cfg.roommates.splice(index, 1);
  // D12 blocker: their detail view can't survive being removed.
  if (sandboxActiveRoommate === index) sandboxActiveRoommate = null;
  else if (sandboxActiveRoommate !== null && sandboxActiveRoommate > index) sandboxActiveRoommate--;
  renderSandboxUi();
}

function doSandboxRoommateMove(index, direction) {
  const cfg = pendingSandboxConfig;
  if (!cfg || !Array.isArray(cfg.roommates)) return;
  const target = index + direction;
  if (target < 0 || target >= cfg.roommates.length) return;
  const [r] = cfg.roommates.splice(index, 1);
  cfg.roommates.splice(target, 0, r);
  // D12 blocker: a ±1 move (the only kind the ▲▼ buttons ever request) is a
  // true swap between index and target — follow EITHER position's open
  // detail view to its new slot, not just the one that was clicked, or
  // whoever got displaced into the old index would silently show as if
  // their own sub-tab were open.
  if (sandboxActiveRoommate === index) sandboxActiveRoommate = target;
  else if (sandboxActiveRoommate === target) sandboxActiveRoommate = index;
  renderSandboxUi();
}

function doSandboxRoommateSelect(index) {
  const cfg = pendingSandboxConfig;
  if (!cfg || !Array.isArray(cfg.roommates)) return;
  sandboxActiveRoommate = (Number.isInteger(index) && index >= 0 && index < cfg.roommates.length) ? index : null;
  renderSandboxUi();
}

function doSandboxRoommateSubtab(subId) {
  if (!SANDBOX_ROOMMATE_SUBTABS.some((s) => s.id === subId)) return;
  sandboxRoommateSubtab = subId;
  renderSandboxUi();
}

function doSandboxRoommateDesign(index) {
  const r = pendingSandboxConfig?.roommates?.[index];
  if (!r) return;
  openRoommateStudio(r);
}

// D21: the effective skipProse flag. null on the config means "auto" — on
// once the appearance is authored, off for a rolled roommate. The toggle
// commits an explicit boolean on first click so the auto rule can never
// fight a choice the player actually made.
function roommateEffectiveSkipProse(r) {
  if (r && (r.skipProse === true || r.skipProse === false)) return r.skipProse;
  return roommateDefaultSkipProse(r && r.partial);
}

function roommateDefaultSkipProse(partial) {
  const p = partial || {};
  return !!(p.physical && typeof p.physical === 'object' && Object.keys(p.physical).length > 0);
}

function doSandboxRoommateSkip(index) {
  const r = pendingSandboxConfig?.roommates?.[index];
  if (!r) return;
  r.skipProse = !roommateEffectiveSkipProse(r);
  renderSandboxUi();
}

// partial → the bible's authoredFields (B1/D12): dotted paths the player
// filled in by hand. An untouched field is ABSENT from the partial by
// construction (the form's "empty deletes" contract), so presence here IS
// the authored set. 'physical' protects the whole appearance subtree via
// mergeProseIntoBible's prefix match; 'occupation' covers the whole
// occupation object the category pick fills.
function roommateAuthoredFields(partial) {
  const p = partial || {};
  const out = [];
  const touched = (v) => v !== undefined && v !== null && v !== '' &&
    !(Array.isArray(v) && v.length === 0) &&
    !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  if (touched(p.name)) out.push('name');
  if (touched(p.age)) out.push('age');
  if (touched(p.gender)) out.push('gender');
  if (touched(p.species)) out.push('species');
  if (touched(p.occupationCategory)) out.push('occupation');
  if (p.temperament && typeof p.temperament === 'object' && Object.keys(p.temperament).length > 0) out.push('temperament');
  if (Array.isArray(p.interests) && p.interests.length > 0) out.push('interests');
  if (Array.isArray(p.values) && p.values.length > 0) out.push('values');
  if (touched(p.baggage)) out.push('baggage');
  if (touched(p.wound)) out.push('wound');
  if (touched(p.want)) out.push('want');
  if (touched(p.blindSpot)) out.push('blindSpot');
  if (touched(p.boundary)) out.push('boundary');
  if (p.physical && typeof p.physical === 'object' && Object.keys(p.physical).length > 0) out.push('physical');
  return out;
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
