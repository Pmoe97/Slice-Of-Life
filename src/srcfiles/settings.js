// ===== SECTION: SETTINGS =====
// Settings & Pause Overhaul Phase 1: the settings store.
// kv.menu 'settings' is the ONE schema for all in-game settings — the old
// 'options'/'prefs' split is migrated into it on first load, one-way, and
// the old keys are retired (design invariant 2). Browser-local by design:
// kv.menu is outside SAVE_KEYS, so settings never ride in a save record.
// The only exception is D5's SFW flag, which patches the live game's
// meta.contentConfig (a field every content consumer already reads).
//
// Helpers here are the pure surface later phases consume:
// autosaveIntervalMs / isSfwMode / textScaleFactor / currentSpeed /
// setSpeed / activeImageStyle / applySfwMode. Phase 4 adds the live
// side-effect wiring (rearmAutosaveTimer / applySfwLive / applyTextScale),
// invoked from setSettings so every write-through applies its row's live
// effect. Phase 5 adds the distribution samplers (genderDistSampler /
// raceDistSampler) and the art-actor mapping helpers (identityToArtTag /
// raceArtPhrase) that power the Population tab and the background-art
// actor pool.

const SETTINGS_KEY = 'settings';

// Session-local game speed (D12): resets to x20 — today's effective
// default — on every reload unless Phase 10 promotes the parked question.
const DEFAULT_SPEED_ID = 'x20';
let speedCache = SPEED_PRESETS.find((p) => p.id === DEFAULT_SPEED_ID) || SPEED_PRESETS[2];

let settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);

function deepCloneSettings(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// One-way migration from the retired kv.menu 'options'/'prefs' split.
// Runs only on the first load that finds no stored 'settings' object, so a
// re-migration can never clobber settings the player has since changed.
// 'options'.bgArt stays in 'options' (boot-only, D1); everything else
// becomes a settings field.
async function migrateLegacySettings() {
  const patch = {};
  let options = null;
  let prefs = null;
  try {
    [options, prefs] = await Promise.all([
      root.kv.menu.get('options'),
      root.kv.menu.get('prefs'),
    ]);
  } catch (e) {
    return patch;
  }
  if (options && typeof options.autosave === 'boolean') patch.autosave = options.autosave;
  const genders = (prefs && prefs.actorGenders) || null;
  if (genders && typeof genders === 'object') patch.genderDist = migrateActorGenders(genders);
  if (prefs && prefs.pairings && typeof prefs.pairings === 'object') {
    patch.pairings = { ...SETTINGS_DEFAULTS.pairings, ...prefs.pairings };
  }
  return patch;
}

// 'prefs'.actorGenders are presentation-axis toggles (f/m/nb); the settings
// taxonomy is the five CHAR_GEN identities (D14). Map on-axes to identities
// by presentation: 'f' → female+futanari+trans_female, 'm' →
// male+trans_male, 'nb' → nothing (there is no nb identity). Untouched /
// all-on toggles → the default 40/40/8/6/6. Approximate by design — nearly
// all players left the defaults, and the Population tab supersedes this
// once Phase 5 lands.
function migrateActorGenders(genders) {
  const fOn = genders.f !== false;
  const mOn = genders.m !== false;
  const nbOn = genders.nb !== false;
  if (fOn && mOn && nbOn) return deepCloneSettings(SETTINGS_DEFAULTS.genderDist);
  const weights = { ...SETTINGS_DEFAULTS.genderDist };
  const axisIdentities = {
    f: ['female', 'futanari', 'trans_female'],
    m: ['male', 'trans_male'],
    nb: [],
  };
  for (const axis of ['f', 'm', 'nb']) {
    if (genders[axis] === false) {
      for (const id of axisIdentities[axis]) delete weights[id];
    }
  }
  const out = normalizeDistribution(weights);
  // All three axes off = no identities left; fall back to defaults.
  return Object.keys(out).length ? out : deepCloneSettings(SETTINGS_DEFAULTS.genderDist);
}

// Renormalize a { id: weight } map so the values sum to exactly 100 with
// integer shares (largest-remainder rounding). Zero/negative/non-numeric
// weights drop out; an empty map returns {}.
function normalizeDistribution(dist) {
  const cleaned = {};
  for (const [k, v] of Object.entries(dist || {})) {
    const n = Number(v);
    if (isFinite(n) && n > 0) cleaned[k] = n;
  }
  const total = Object.values(cleaned).reduce((a, b) => a + b, 0);
  if (!total) return {};
  const out = {};
  const remainders = [];
  let sum = 0;
  for (const [k, v] of Object.entries(cleaned)) {
    const exact = (v / total) * 100;
    const floor = Math.floor(exact);
    out[k] = floor;
    sum += floor;
    remainders.push({ k, frac: exact - floor });
  }
  remainders.sort((a, b) => b.frac - a.frac);
  let diff = 100 - sum;
  for (let i = 0; diff > 0 && i < diff; i++) out[remainders[i % remainders.length].k]++;
  return out;
}

// A distribution field is replaced wholesale by the stored value when one
// exists (the slider editor writes all keys at once); otherwise the default
// wins. Stored values are renormalized to sum 100.
function pickDistribution(fallback, stored) {
  if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
    const cleaned = {};
    for (const [k, v] of Object.entries(stored)) {
      if (typeof v === 'number' && isFinite(v) && v > 0) cleaned[k] = v;
    }
    const out = normalizeDistribution(cleaned);
    if (Object.keys(out).length) return out;
  }
  return deepCloneSettings(fallback);
}

// Merge stored settings over the defaults (migration wins over both),
// then coerce every field back to a valid shape so a hand-corrupted or
// half-migrated stored object can never poison a later phase's reads.
function normalizeSettings(s) {
  const out = deepCloneSettings(s);
  if (typeof out.autosave !== 'boolean') out.autosave = SETTINGS_DEFAULTS.autosave;
  if (!AUTOSAVE_INTERVALS.some((i) => i.id === out.autosaveInterval)) out.autosaveInterval = SETTINGS_DEFAULTS.autosaveInterval;
  if (typeof out.sfwMode !== 'boolean') out.sfwMode = SETTINGS_DEFAULTS.sfwMode;
  if (!TEXT_SIZES.some((t) => t.id === out.textSize)) out.textSize = SETTINGS_DEFAULTS.textSize;
  if (typeof out.imageStyle !== 'string' || !out.imageStyle) out.imageStyle = SETTINGS_DEFAULTS.imageStyle;
  // D9 (Phase 7): a stored style id must be one the funnel can resolve —
  // 'none', a real IMAGE_STYLES id, or the '__custom' sentinel. A bogus id
  // would churn cache keys forever for a prompt that never actually changes.
  if (!['none', ...IMAGE_STYLES.map((s) => s.id)].includes(out.imageStyle)) out.imageStyle = SETTINGS_DEFAULTS.imageStyle;
  if (typeof out.customStylePrompt !== 'string') out.customStylePrompt = SETTINGS_DEFAULTS.customStylePrompt;
  // D10 (Phase 8): the stored theme id must be one applyTheme can resolve —
  // a bogus id would silently fall back to :root's midnight values while
  // the Appearance tab showed a different tile as active.
  if (typeof out.theme !== 'string' || !COLOR_THEMES.some((t) => t.id === out.theme)) out.theme = SETTINGS_DEFAULTS.theme;
  out.genderDist = pickDistribution(SETTINGS_DEFAULTS.genderDist, out.genderDist);
  out.raceDist = pickDistribution(SETTINGS_DEFAULTS.raceDist, out.raceDist);
  out.pairings = {
    ...SETTINGS_DEFAULTS.pairings,
    ...(out.pairings && typeof out.pairings === 'object' ? out.pairings : {}),
  };
  return out;
}

function mergeSettings(stored, migration) {
  const base = deepCloneSettings(SETTINGS_DEFAULTS);
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(base)) {
      if (stored[key] !== undefined) base[key] = stored[key];
    }
  }
  if (migration && typeof migration === 'object') {
    for (const key of Object.keys(migration)) base[key] = migration[key];
  }
  return normalizeSettings(base);
}

// Load (and migrate on first load). Idempotent — safe to call again if
// something else touches settings before boot's own call.
async function loadSettings() {
  let stored = null;
  let storedOk = false;
  try {
    stored = await root.kv.menu.get(SETTINGS_KEY);
    storedOk = true;
  } catch (e) {
    stored = null;
  }
  const needsMigration = !storedOk || stored === null || typeof stored !== 'object';
  const migration = needsMigration ? await migrateLegacySettings() : null;
  settingsCache = mergeSettings(stored, migration);
  // Record the one-way migration immediately, so the old keys are retired
  // and a later reload reads 'settings' (not the legacy pair again).
  if (migration !== null) {
    try { await root.kv.menu.set(SETTINGS_KEY, settingsCache); } catch (e) {}
  }
  // D7: persisted textSize applies on every load (CSS keys off the
  // data-text-scale attribute on <html>).
  applyTextScale();
  // D10: persisted theme applies on every load (the [data-theme="…"]
  // rule-sets in the tokens <style> key off data-theme on <html>).
  applyTheme();
  return settingsCache;
}

// Update the cache and persist. Every settings row writes through this —
// there is no Apply/Save button (D2). Patch is a shallow field map; whole
// distribution objects replace the stored distribution wholesale.
// Phase 4 (D5/D6/D7): the write-through also applies each changed field's
// LIVE side effect here — re-arming the autosave timer, patching the live
// game's contentConfig (or the boot gallery's cap), and re-pointing the
// text-scale token. Keeping them here rather than in the row handlers
// means every writer (settings rows, Phase 5's distribution action) gets
// the same behavior and the renderer can never diverge from it.
async function setSettings(patch) {
  settingsCache = normalizeSettings({ ...settingsCache, ...patch });
  try { await root.kv.menu.set(SETTINGS_KEY, settingsCache); } catch (e) {}
  if (patch.autosave !== undefined || patch.autosaveInterval !== undefined) rearmAutosaveTimer();
  if (patch.sfwMode !== undefined) applySfwLive();
  if (patch.textSize !== undefined) applyTextScale();
  // D10 (Phase 8): a theme change re-skins the UI chrome live — data-theme
  // on <html> flips the CSS token rule-sets, so no re-render is needed.
  if (patch.theme !== undefined) applyTheme();
  // D9 (Phase 7): a style change re-filters the boot gallery's ring + session
  // buffer to the new style (image.js hook; every cache key is style-tagged
  // regardless, so even without the hook the next menu open self-heals).
  // Fire-and-forget like the other live hooks — the gallery's own async work
  // must never block the settings write (the Custom field writes per
  // keystroke).
  if (patch.imageStyle !== undefined || patch.customStylePrompt !== undefined) {
    if (typeof applyImageStyleLive === 'function') applyImageStyleLive();
  }
  return settingsCache;
}

// D6: the live autosave timer is re-armed whenever autosave or its interval
// changes, but only when a game is actually active (no game = no timer to
// re-arm). startAutosave/stopAutosave live in STATE and currentGameState in
// UI, both loaded after this file — guarded with typeof because the re-arm
// only ever runs at runtime, after every script has loaded.
function rearmAutosaveTimer() {
  if (typeof startAutosave !== 'function' || typeof stopAutosave !== 'function') return;
  if (typeof currentGameState === 'undefined' || !currentGameState) return;
  if (settingsCache.autosave === false) {
    stopAutosave();
    return;
  }
  startAutosave(() => currentGameState);
}

// D5: toggling SFW mode patches the live game's contentConfig in place so
// the whole pipeline (menuRatingCap, CONTENT_DIRECTIVES, intimateAllowed,
// activeContentFlags) sees it immediately. With no live game (boot), the
// title gallery's cached contentConfig is re-captured so its NEXT
// generation honors the new cap mid-session (menuContentConfig falls back
// to settings when there is no game). The already-in-memory slideshow
// buffer re-filters on the next initTitleGallery, exactly as a tighter
// contentConfig from a save does.
function applySfwLive() {
  if (typeof currentGameState !== 'undefined' && currentGameState) {
    applySfwMode(currentGameState);
  } else if (typeof titleGallery !== 'undefined' && titleGallery &&
             typeof menuContentConfig === 'function') {
    titleGallery.contentConfig = menuContentConfig();
  }
}

// D7: the text-size token set scales via --text-scale on <html> (the
// --fs-* tokens are calc(px * var(--text-scale))); this just points the
// CSS at the active size id. Called on toggle AND at boot (loadSettings)
// so a persisted textSize applies on every load.
function applyTextScale() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-text-scale', settingsCache.textSize);
}

// D10: point the tokens' CSS at the active theme. The [data-theme="…"]
// rule-sets in the tokens <style> (index.html) override the :root base
// values on specificity; applyTheme just flips the attribute. Called on
// toggle AND at boot (loadSettings) so a persisted theme applies on every
// load. 'match-system' needs no values here — its CSS media query decides.
// Themes recolor UI chrome only; generated imagery is untouched (D10).
function applyTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', settingsCache.theme);
}

// --- Pure helpers (consumed by later phases) ---

// D6: the live autosave timer interval, read at runtime. Today's historical
// constant was 30s — AUTOSAVE_INTERVALS[0] is that same default.
function autosaveIntervalMs() {
  const found = AUTOSAVE_INTERVALS.find((i) => i.id === settingsCache.autosaveInterval);
  return found ? found.ms : AUTOSAVE_INTERVALS[0].ms;
}

// D5: SFW guidance mode — the existing all-SFW pipeline gate
// (menuRatingCap → 'sfw', CONTENT_DIRECTIVES fade-to-black, the
// intimateAllowed character-image gate, activeContentFlags site gating).
function isSfwMode() {
  return settingsCache.sfwMode === true;
}

// D7: text-size scale factor (font-size only, never layout metrics).
function textScaleFactor() {
  const found = TEXT_SIZES.find((t) => t.id === settingsCache.textSize);
  return found ? found.scale : 1;
}

// D12: game-speed preset. Session-local — setSpeed never persists.
function currentSpeed() {
  return speedCache;
}

function setSpeed(presetId) {
  const found = SPEED_PRESETS.find((p) => p.id === presetId);
  if (found) speedCache = found;
  return speedCache;
}

// D9: the active image style. 'none' (no suffix) is the default; '__custom'
// carries settings.customStylePrompt verbatim. Phase 7 maps the id to its
// IMAGE_STYLES suffix inside the image.js single funnel.
function activeImageStyle() {
  return {
    id: settingsCache.imageStyle,
    customPrompt: settingsCache.imageStyle === '__custom' ? settingsCache.customStylePrompt : '',
  };
}

// D5: patch a game-state-shaped object's contentConfig so the whole
// pipeline sees the SFW state. Callers decide WHEN (toggle time on the live
// game via applySfwLive, new-game cast approval via pendingCast, resume)
// — this only patches the object in place. Accepts BOTH shapes that carry a
// contentConfig: a pendingCast-style object (gameState.contentConfig, set
// at cast-approval time) and a live game state (gameState.meta.
// contentConfig, the shape every consumer reads). Never touches verbs (D5).
function applySfwMode(gs) {
  if (!gs) return gs;
  const cc = gs.contentConfig || (gs.meta && gs.meta.contentConfig);
  if (!cc) return gs;
  cc.contentFlags = cc.contentFlags || {};
  cc.contentFlags.mature = !isSfwMode();
  return gs;
}

// D9 (Phase 7): wipe EVERY cached generated image — the shared LRU's blob
// folder (kv.images) + its index (meta.imageIndex), plus the boot gallery's
// persisted ring and its in-memory session buffer. Frames regenerate on
// demand (re-spending image quota); callers confirm first (ui.js's
// 'images.clear-cache' action). Deliberately raw kv here rather than
// state.js's deleteCachedImage — this file loads before state.js, and the
// whole-folder wipe is the one job that needs no per-key helper.
async function clearImageCache() {
  try {
    const keys = await root.kv.images.keys();
    for (const key of keys) await root.kv.images.delete(key);
  } catch (e) { /* a stale blob is just an LRU entry — tolerable */ }
  try {
    await root.kv.meta.update('meta', (meta) => {
      meta = meta || {};
      const { imageIndex, ...rest } = meta;
      return rest;
    });
  } catch (e) {}
  if (typeof MENU_GALLERY_RING_KEY !== 'undefined') {
    try { await root.kv.menu.set(MENU_GALLERY_RING_KEY, []); } catch (e) {}
  }
  if (typeof titleGallery !== 'undefined' && titleGallery) {
    titleGallery.ring = [];
    titleGallery.images = [];
    titleGallery.idx = 0;
  }
  console.log('Image cache cleared.');
}

// --- Distribution samplers (Phase 5, D13/D14) ---
// Proportional picks from the settings distributions — the single source
// for cast generation. Phase 6's rollGender and the background-art actor
// pool both draw here, so the Population tab governs every generation
// source. Fallbacks mirror the historical defaults (female / human) and
// can only trigger on a corrupt store — normalizeSettings already coerces
// both distributions to valid shapes.
function genderDistSampler() {
  return proportionalPick(settingsCache.genderDist, 'female');
}

function raceDistSampler() {
  return proportionalPick(settingsCache.raceDist, 'human');
}

function proportionalPick(dist, fallback) {
  const entries = Object.entries(dist || {}).filter(([, w]) => Number(w) > 0);
  if (!entries.length) return fallback;
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  if (total <= 0) return fallback;
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= Number(w);
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

// D14: cast identity → background-art presentation tag. The 'nb' art-pool
// entries are unreachable by construction — the taxonomy has no nb identity
// (parked open question); an unknown identity leans female-safe.
function identityToArtTag(identity) {
  const found = CAST_IDENTITIES.find((c) => c.id === identity);
  return found ? found.artTag : 'f';
}

// D13: the art-actor race phrase appended to a background-art actor's
// description. Empty for human — with raceDist at {human:100} the actor
// description gets NO added text, so today's prompts are reproduced exactly.
// artTag picks the f/m art form from RACES.artPhrase; traitPhrase follows
// as the visible-feature cue.
function raceArtPhrase(species, artTag) {
  if (species === 'human') return '';
  const race = RACES.find((r) => r.id === species);
  if (!race) return '';
  const base = race.artPhrase && typeof race.artPhrase === 'object'
    ? (race.artPhrase[artTag] || race.artPhrase.f || '')
    : (race.artPhrase || '');
  return [base, race.traitPhrase].filter(Boolean).join(', ');
}

// --- Data tab (Phase 9, D11) ---
// storageSummary() reads every kv folder the game persists into and returns
// per-folder-group entry counts + approximate bytes; resetAllData() wipes
// them all and boots. Both live here (not state.js) because the Data tab is
// a settings surface and the wipes are raw-kv like clearImageCache — but the
// "then boot" half needs ui/menu functions, so it's guarded with typeof like
// the other runtime forward-references in this file (rearmAutosaveTimer).

// The kv folders the game persists into — every one resetAllData wipes.
// SAVE_KEYS (state.js) covers the live game snapshot (meta/player/world/
// npcs/objects); saveIndex+saves hold the slot records; snapshots the
// debug-tree snapshots; images the LRU blobs; menu the settings + boot
// prefs ('settings', 'options', 'ring', legacy 'prefs').
const STORAGE_FOLDERS = [
  'meta', 'player', 'world', 'npcs', 'objects',
  'saveIndex', 'saves', 'snapshots', 'images', 'menu',
];

// Approximate byte size of a kv value. JSON-cloneable values serialize;
// blobs (the image cache stores { blob, lastAccess }) count their size.
// Underestimates a little on multibyte text — explicitly approximate (D11).
function approxValueBytes(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'string') return v.length;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).length;
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size || 0;
  try { return JSON.stringify(v).length; } catch (e) { return 0; }
}

function formatStorageBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let u = -1;
  let v = n;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(1)} ${units[u]}`;
}

// Read live from kv — never a cache, so the readout always matches reality.
// Returns { rows: [{ label, count, bytes }], totalBytes }. Folders that
// haven't been created yet return zero entries (the kv plugin creates a
// store on first access, so keys() on a fresh folder is just []).
async function storageSummary() {
  const rows = [];
  let totalBytes = 0;
  const addRow = (label, count, bytes) => {
    rows.push({ label, count, bytes });
    totalBytes += bytes;
  };

  let saveCount = 0;
  let saveBytes = 0;
  try {
    // The slot index is ONE kv key holding an array of entries; the count
    // the player cares about is the slots used, not kv keys.
    const stored = await root.kv.saveIndex.get('index');
    const indexList = Array.isArray(stored) ? stored : [];
    saveCount = indexList.length;
    for (const entry of indexList) saveBytes += approxValueBytes(entry);
    for (const key of await root.kv.saves.keys()) {
      saveBytes += approxValueBytes(await root.kv.saves.get(key));
    }
  } catch (e) { /* a kv read failing means "zero here", not a crash */ }
  addRow('Save slots', saveCount, saveBytes);

  let imgCount = 0;
  let imgBytes = 0;
  try {
    const entries = await root.kv.images.entries();
    imgCount = entries.length;
    for (const [, v] of entries) imgBytes += approxValueBytes(v && v.blob ? v.blob : v);
  } catch (e) {}
  addRow('Cached images', imgCount, imgBytes);

  let menuCount = 0;
  let menuBytes = 0;
  try {
    const entries = await root.kv.menu.entries();
    menuCount = entries.length;
    for (const [, v] of entries) menuBytes += approxValueBytes(v);
  } catch (e) {}
  addRow('Settings & menu', menuCount, menuBytes);

  let liveCount = 0;
  let liveBytes = 0;
  for (const folder of ['meta', 'player', 'world', 'npcs', 'objects', 'snapshots']) {
    try {
      const entries = await root.kv[folder].entries();
      liveCount += entries.length;
      for (const [, v] of entries) liveBytes += approxValueBytes(v);
    } catch (e) {}
  }
  addRow('Current playthrough', liveCount, liveBytes);

  return { rows, totalBytes };
}

// Wipe every kv folder the game uses, reset the in-memory settings cache to
// a clean first-run state, and boot back to the title screen. The player
// confirmed first (ui.js's 'data.reset' action). Load-bearing detail: the
// menu-options cache must reset too, or the boot row would keep showing the
// pre-reset Background-art value against an empty kv.
async function resetAllData() {
  // A running game means an armed autosave timer AND possibly queued
  // debounced state writes (state.js's writeQueue) — both must go before
  // the wipe, or the pending flush would re-populate the just-wiped
  // folders with stale game data moments later.
  if (typeof stopAutosave === 'function') stopAutosave();
  if (typeof stopClockLoop === 'function') stopClockLoop();
  if (typeof writeQueue !== 'undefined') writeQueue.clear();
  if (typeof writeTimer !== 'undefined' && typeof clearTimeout === 'function') clearTimeout(writeTimer);
  for (const folder of STORAGE_FOLDERS) {
    try { await root.kv[folder].clear(); } catch (e) {}
  }
  // Re-establish the clean first-run meta (initStorage's fresh literal, with
  // every folder's version pre-seeded). Without this, the boot gallery's
  // first generated image — setCachedImage merges onto `meta || {}` and
  // PRESERVES versions, but if the wipe emptied the folder first the image
  // lands on a bare { imageIndex } and the NEXT boot's checkAndMigrateFolder
  // asserts on a versions-less meta ("at 0, expected 2"). initStorage is
  // state.js's own boot-time creation path — not a hand-kept copy.
  if (typeof initStorage === 'function') await initStorage();
  settingsCache = deepCloneSettings(SETTINGS_DEFAULTS);
  applyTextScale();
  applyTheme();
  if (typeof resetMenuOptionsCache === 'function') resetMenuOptionsCache();
  // The doExitGame boot dance, guarded for this file's early load position.
  if (typeof closeModal === 'function') closeModal();
  if (typeof closeSaveMenu === 'function') closeSaveMenu();
  if (typeof closeMainMenu === 'function') closeMainMenu();
  if (typeof currentGameState !== 'undefined') currentGameState = null;
  if (typeof showMainMenu === 'function') showMainMenu('boot');
  console.log('All game data reset.');
}
